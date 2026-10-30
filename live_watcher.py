import json
import time
from pathlib import Path

import cv2

from analysis import analyze_mask, make_alert
from predict import SpillPredictor


ROOT = Path(__file__).resolve().parent

INBOX = ROOT / "data/live/inbox"
PROCESSED = ROOT / "data/live/processed"
RESULTS = ROOT / "data/live/results"

POLL_SECONDS = 5
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def process_image(predictor, image_path):
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)

    if image is None:
        print(f"Skipping unreadable image: {image_path}")
        return

    result = predictor.predict(image)

    regions = analyze_mask(
        result["mask"],
        result["probability"],
        min_region_pixels=25,
    )

    alert = make_alert(
        regions,
        result["oil_pixel_fraction"],
        predictor.threshold,
    )

    overlay = predictor.make_overlay(image, result)
    probability = predictor.make_probability_heatmap(result)

    for region in regions:
        box = region["bbox"]

        cv2.rectangle(
            overlay,
            (box["x"], box["y"]),
            (
                box["x"] + box["width"],
                box["y"] + box["height"],
            ),
            (0, 0, 255),
            2,
        )

        cv2.putText(
            overlay,
            f"R{region['region_id']} {region['pixel_count']}px",
            (box["x"], max(20, box["y"] - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 255),
            1,
        )

    stem = image_path.stem
    timestamp = time.strftime("%Y%m%d_%H%M%S")

    result_dir = RESULTS / f"{stem}_{timestamp}"
    result_dir.mkdir(parents=True, exist_ok=True)

    cv2.imwrite(str(result_dir / "mask.png"), result["mask"])
    cv2.imwrite(str(result_dir / "overlay.jpg"), overlay)
    cv2.imwrite(
        str(result_dir / "probability.jpg"),
        probability,
    )

    record = {
        "image": str(image_path),
        "has_spill": result["has_spill"],
        "oil_pixel_count": result["oil_pixel_count"],
        "oil_pixel_fraction": result["oil_pixel_fraction"],
        "threshold": predictor.threshold,
        "model": "v2.1",
        "regions": regions,
        "alert": alert,
        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    (result_dir / "result.json").write_text(
        json.dumps(record, indent=2)
    )

    print(
        f"Processed {image_path.name}: "
        f"spill={result['has_spill']}, "
        f"regions={len(regions)}, "
        f"alert={alert['alert_level']}"
    )


def main():
    for folder in (INBOX, PROCESSED, RESULTS):
        folder.mkdir(parents=True, exist_ok=True)

    predictor = SpillPredictor()

    print(f"Watching for new images in: {INBOX}")
    print("Press Ctrl+C to stop.")

    while True:
        image_paths = [
            path
            for path in INBOX.iterdir()
            if path.is_file()
            and path.suffix.lower() in IMAGE_SUFFIXES
        ]

        for image_path in image_paths:
            try:
                process_image(predictor, image_path)

                destination = PROCESSED / image_path.name

                if destination.exists():
                    destination.unlink()

                image_path.rename(destination)

            except Exception as error:
                print(f"Failed to process {image_path.name}: {error}")

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()