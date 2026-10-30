from pathlib import Path
import json

import numpy as np
import torch
from PIL import Image

from dataset import OilSpillDataset
from unet import UNet


ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data/raw/kaggle_oil_spill/oil-spill"
RUN_DIR = ROOT / "models/spill_detector/pilot"
OUT_DIR = RUN_DIR / "validation_overlays"

IMAGE_SIZE = (256, 512)
THRESHOLD = 0.5
NUM_IMAGES = 12


def colorize_mask(mask):
    output = np.zeros((*mask.shape, 3), dtype=np.uint8)
    output[mask] = [0, 255, 255]
    return output


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    split = json.loads((RUN_DIR / "split.json").read_text())
    filenames = split["val"][:NUM_IMAGES]

    dataset = OilSpillDataset(
        DATA_ROOT / "train/images",
        DATA_ROOT / "train/labels",
        filenames=filenames,
        image_size=IMAGE_SIZE,
        augment=False,
    )

    model = UNet().to("cuda")
    state = torch.load(
        RUN_DIR / "best_weights.pth",
        map_location="cpu",
        weights_only=True,
    )
    model.load_state_dict(state)
    model.eval()

    with torch.inference_mode():
        for index in range(len(dataset)):
            image, mask = dataset[index]

            image_batch = image.unsqueeze(0).to("cuda")
            logits = model(image_batch)
            probability = torch.sigmoid(logits)[0, 0].cpu().numpy()
            prediction = probability >= THRESHOLD

            ground_truth = mask[0].numpy() > 0.5

            original = (
                image.permute(1, 2, 0).numpy() * 255
            ).astype(np.uint8)

            overlay = original.copy()
            overlay[ground_truth] = [0, 255, 0]
            overlay[prediction] = [255, 0, 0]
            overlay[ground_truth & prediction] = [255, 255, 0]

            name = filenames[index]

            Image.fromarray(original).save(
                OUT_DIR / f"{name}_input.jpg"
            )
            Image.fromarray(colorize_mask(ground_truth)).save(
                OUT_DIR / f"{name}_truth.png"
            )
            Image.fromarray(colorize_mask(prediction)).save(
                OUT_DIR / f"{name}_prediction.png"
            )
            Image.fromarray(overlay).save(
                OUT_DIR / f"{name}_overlay.jpg"
            )

            print(f"Saved overlays for {name}")


if __name__ == "__main__":
    main()