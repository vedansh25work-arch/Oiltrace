from pathlib import Path
import json

import numpy as np
import torch

from dataset import OilSpillDataset
from unet import UNet


ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data/raw/kaggle_oil_spill/oil-spill"
RUN_DIR = ROOT / "models/spill_detector/v2_1"

IMAGE_SIZE = (256, 512)
THRESHOLD = 0.20


def main():
    dataset = OilSpillDataset(
        DATA_ROOT / "test/images",
        DATA_ROOT / "test/labels",
        filenames=None,
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

    tp = fp = fn = 0
    spill_dice_sum = 0.0
    spill_images = 0
    no_oil_images = 0
    no_oil_fp_pixels = 0
    no_oil_total_pixels = 0

    with torch.inference_mode():
        for index in range(len(dataset)):
            image, mask = dataset[index]
            image = image.unsqueeze(0).to("cuda")

            logits = model(image)
            probability = torch.sigmoid(logits)[0, 0].cpu().numpy()
            prediction = probability >= THRESHOLD
            target = mask[0].numpy() > 0.5

            image_tp = int(np.logical_and(prediction, target).sum())
            image_fp = int(np.logical_and(prediction, ~target).sum())
            image_fn = int(np.logical_and(~prediction, target).sum())

            tp += image_tp
            fp += image_fp
            fn += image_fn

            if target.any():
                denominator = 2 * image_tp + image_fp + image_fn
                if denominator:
                    spill_dice_sum += 2 * image_tp / denominator
                spill_images += 1
            else:
                no_oil_images += 1
                no_oil_fp_pixels += image_fp
                no_oil_total_pixels += prediction.size

            if (index + 1) % 25 == 0:
                print(f"Evaluated {index + 1}/{len(dataset)}")

    result = {
        "checkpoint": "best_weights.pth",
        "threshold": THRESHOLD,
        "images": len(dataset),
        "dice": (
            2 * tp / (2 * tp + fp + fn)
            if 2 * tp + fp + fn else None
        ),
        "iou": tp / (tp + fp + fn) if tp + fp + fn else None,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "spill_only_mean_dice": (
            spill_dice_sum / spill_images if spill_images else None
        ),
        "spill_images": spill_images,
        "no_oil_images": no_oil_images,
        "no_oil_false_positive_pixel_rate": (
            no_oil_fp_pixels / no_oil_total_pixels
            if no_oil_total_pixels else None
        ),
    }

    (RUN_DIR / "test_evaluation.json").write_text(
        json.dumps(result, indent=2, allow_nan=False)
    )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()