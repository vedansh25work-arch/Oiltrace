from pathlib import Path
import json

import numpy as np
import torch

from dataset import OilSpillDataset
from unet import UNet


ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data/raw/kaggle_oil_spill/oil-spill"
RUN_DIR = ROOT / "models/spill_detector/pilot"

IMAGE_SIZE = (256, 512)
THRESHOLDS = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]


def metrics_for_threshold(probabilities, targets, threshold):
    predictions = probabilities >= threshold

    tp = int(np.logical_and(predictions, targets).sum())
    fp = int(np.logical_and(predictions, ~targets).sum())
    fn = int(np.logical_and(~predictions, targets).sum())

    dice = (
        2 * tp / (2 * tp + fp + fn)
        if 2 * tp + fp + fn else None
    )
    iou = tp / (tp + fp + fn) if tp + fp + fn else None
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None

    return {
        "threshold": threshold,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "dice": dice,
        "iou": iou,
        "precision": precision,
        "recall": recall,
    }


def main():
    split = json.loads((RUN_DIR / "split.json").read_text())

    dataset = OilSpillDataset(
        DATA_ROOT / "train/images",
        DATA_ROOT / "train/labels",
        filenames=split["val"],
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

    all_probabilities = []
    all_targets = []

    with torch.inference_mode():
        for index in range(len(dataset)):
            image, mask = dataset[index]
            image = image.unsqueeze(0).to("cuda")

            logits = model(image)
            probability = torch.sigmoid(logits)[0, 0].cpu().numpy()

            all_probabilities.append(probability)
            all_targets.append(mask[0].numpy() > 0.5)

            if (index + 1) % 50 == 0:
                print(f"Processed {index + 1}/{len(dataset)}")

    results = []

    for threshold in THRESHOLDS:
        totals = {
            "tp": 0,
            "fp": 0,
            "fn": 0,
        }

        spill_dice_sum = 0.0
        spill_image_count = 0

        no_oil_fp_pixels = 0
        no_oil_total_pixels = 0

        for probability, target in zip(
            all_probabilities, all_targets
        ):
            prediction = probability >= threshold

            tp = int(np.logical_and(prediction, target).sum())
            fp = int(np.logical_and(prediction, ~target).sum())
            fn = int(np.logical_and(~prediction, target).sum())

            totals["tp"] += tp
            totals["fp"] += fp
            totals["fn"] += fn

            if target.any():
                denominator = 2 * tp + fp + fn
                if denominator:
                    spill_dice_sum += 2 * tp / denominator
                    spill_image_count += 1
            else:
                no_oil_fp_pixels += fp
                no_oil_total_pixels += prediction.size

        tp = totals["tp"]
        fp = totals["fp"]
        fn = totals["fn"]

        result = {
            "threshold": threshold,
            "dice": (
                2 * tp / (2 * tp + fp + fn)
                if 2 * tp + fp + fn else None
            ),
            "iou": tp / (tp + fp + fn) if tp + fp + fn else None,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "spill_only_mean_dice": (
                spill_dice_sum / spill_image_count
                if spill_image_count else None
            ),
            "no_oil_false_positive_pixel_rate": (
                no_oil_fp_pixels / no_oil_total_pixels
                if no_oil_total_pixels else None
            ),
        }

        results.append(result)

    output = {
        "checkpoint": "best_weights.pth",
        "split": "validation",
        "images": len(dataset),
        "results": results,
    }

    (RUN_DIR / "threshold_sweep.json").write_text(
        json.dumps(output, indent=2, allow_nan=False)
    )

    print("\nThreshold sweep results")
    print(
        "thr    dice    iou     prec    recall  spillDice  noOilFP"
    )

    for result in results:
        print(
            f"{result['threshold']:.2f}  "
            f"{result['dice']:.4f}  "
            f"{result['iou']:.4f}  "
            f"{result['precision']:.4f}  "
            f"{result['recall']:.4f}  "
            f"{result['spill_only_mean_dice']:.4f}     "
            f"{result['no_oil_false_positive_pixel_rate']:.5f}"
        )


if __name__ == "__main__":
    main()