from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F

from unet import UNet


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models/spill_detector/v2_1/best_weights.pth"

IMAGE_SIZE = (256, 512)
THRESHOLD = 0.20
OIL_COLOR = np.array([0, 255, 255], dtype=np.uint8)

IMAGENET_MEAN = np.array(
    [0.485, 0.456, 0.406], dtype=np.float32
)
IMAGENET_STD = np.array(
    [0.229, 0.224, 0.225], dtype=np.float32
)


class SpillPredictor:
    def __init__(
        self,
        model_path=MODEL_PATH,
        image_size=IMAGE_SIZE,
        threshold=THRESHOLD,
    ):
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA unavailable. Use the project .venv.")

        self.image_size = image_size
        self.threshold = threshold
        self.device = "cuda"

        self.model = UNet().to(self.device)

        state = torch.load(
            model_path,
            map_location="cpu",
            weights_only=True,
        )
        self.model.load_state_dict(state)
        self.model.eval()

    def preprocess(self, image):
        height, width = self.image_size

        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        image = cv2.resize(
            image,
            (width, height),
            interpolation=cv2.INTER_AREA,
        )

        image = image.astype(np.float32) / 255.0
        image = (image - IMAGENET_MEAN) / IMAGENET_STD
        image = np.transpose(image, (2, 0, 1))

        return torch.from_numpy(image).unsqueeze(0)

    def predict(self, image):
        original_height, original_width = image.shape[:2]
        input_tensor = self.preprocess(image).to(self.device)

        with torch.inference_mode():
            logits = self.model(input_tensor)
            probability = torch.sigmoid(logits)[0, 0].cpu().numpy()

        prediction = probability >= self.threshold

        mask = prediction.astype(np.uint8) * 255
        mask = cv2.resize(
            mask,
            (original_width, original_height),
            interpolation=cv2.INTER_NEAREST,
        )

        probability_resized = cv2.resize(
            probability,
            (original_width, original_height),
            interpolation=cv2.INTER_LINEAR,
        )

        oil_pixels = int((mask > 0).sum())
        total_pixels = mask.size

        return {
            "mask": mask,
            "probability": probability_resized,
            "oil_pixel_count": oil_pixels,
            "oil_pixel_fraction": oil_pixels / total_pixels,
            "has_spill": oil_pixels > 0,
        }

    def make_overlay(self, image, result, alpha=0.45):
        overlay = image.copy()

        mask = result["mask"] > 0
        overlay[mask] = (
            overlay[mask] * (1 - alpha)
            + np.array([0, 255, 255]) * alpha
        ).astype(np.uint8)

        return overlay

    def make_probability_heatmap(self, result):
        probability = result["probability"]
        heatmap = (probability * 255).astype(np.uint8)
        return cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)


def main():
    import sys

    if len(sys.argv) != 2:
        print("Usage:")
        print("  .\\.venv\\Scripts\\python.exe -u predict.py <image_path>")
        return

    image_path = Path(sys.argv[1])

    if not image_path.is_file():
        raise FileNotFoundError(image_path)

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)

    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    predictor = SpillPredictor()
    result = predictor.predict(image)

    output_dir = ROOT / "predictions"
    output_dir.mkdir(exist_ok=True)

    stem = image_path.stem

    cv2.imwrite(
        str(output_dir / f"{stem}_mask.png"),
        result["mask"],
    )
    cv2.imwrite(
        str(output_dir / f"{stem}_overlay.jpg"),
        predictor.make_overlay(image, result),
    )
    cv2.imwrite(
        str(output_dir / f"{stem}_probability.jpg"),
        predictor.make_probability_heatmap(result),
    )

    print(
        json.dumps(
            {
                "image": str(image_path),
                "has_spill": result["has_spill"],
                "oil_pixel_count": result["oil_pixel_count"],
                "oil_pixel_fraction": result["oil_pixel_fraction"],
                "threshold": predictor.threshold,
                "outputs": [
                    str(output_dir / f"{stem}_mask.png"),
                    str(output_dir / f"{stem}_overlay.jpg"),
                    str(output_dir / f"{stem}_probability.jpg"),
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    import json

    main()