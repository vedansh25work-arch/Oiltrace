from pathlib import Path
from collections import Counter

import cv2
import numpy as np


ROOT = (
    Path(__file__).resolve().parent
    / "data"
    / "raw"
    / "kaggle_oil_spill"
    / "oil-spill"
)

SUPPORTED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"
}


def collect_files(folder):
    if not folder.is_dir():
        raise FileNotFoundError(f"Directory not found: {folder}")

    files = sorted(
        path for path in folder.iterdir()
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    by_stem = {}

    for path in files:
        if path.stem in by_stem:
            raise ValueError(
                f"Duplicate filename stem: {path.stem}\n"
                f"{by_stem[path.stem]}\n{path}"
            )
        by_stem[path.stem] = path

    return files, by_stem


def inspect_pair(image_path, mask_path):
    print("\n" + "-" * 65)
    print("Image:", image_path.name)
    print("Label:", mask_path.name)

    image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    mask = cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED)

    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    if mask is None:
        raise ValueError(f"Could not read label: {mask_path}")

    print(
        "Image:",
        f"shape={image.shape}, dtype={image.dtype},",
        f"min={image.min()}, max={image.max()}"
    )

    print(
        "Label:",
        f"shape={mask.shape}, dtype={mask.dtype},",
        f"min={mask.min()}, max={mask.max()}"
    )

    print(
        "Image/label dimensions match:",
        image.shape[:2] == mask.shape[:2]
    )

    if mask.ndim == 2:
        values, counts = np.unique(mask, return_counts=True)

        print("Number of unique label values:", len(values))
        print("Label value -> pixel count:")

        for value, count in zip(values[:30], counts[:30]):
            percentage = 100 * int(count) / mask.size
            print(
                f"  {value}: {int(count)} pixels "
                f"({percentage:.2f}%)"
            )

    else:
        if mask.shape[2] == 3:
            colors_image = cv2.cvtColor(mask, cv2.COLOR_BGR2RGB)
            color_order = "RGB"
        elif mask.shape[2] == 4:
            colors_image = cv2.cvtColor(mask, cv2.COLOR_BGRA2RGBA)
            color_order = "RGBA"
        else:
            colors_image = mask
            color_order = "original channel order"

        pixels = colors_image.reshape(-1, colors_image.shape[2])
        colors, counts = np.unique(
            pixels, axis=0, return_counts=True
        )

        order = np.argsort(counts)[::-1][:15]

        print(f"Number of unique {color_order} colors:", len(colors))
        print(f"Most common colors ({color_order}) -> pixel count:")

        for index in order:
            percentage = 100 * int(counts[index]) / len(pixels)
            print(
                f"  {colors[index].tolist()}: "
                f"{int(counts[index])} pixels "
                f"({percentage:.2f}%)"
            )


def main():
    print("DATASET INSPECTION")
    print("Dataset root:", ROOT)

    for split in ("train", "test"):
        print("\n" + "=" * 65)
        print(split.upper())
        print("=" * 65)

        image_files, images = collect_files(ROOT / split / "images")
        mask_files, masks = collect_files(ROOT / split / "labels")

        print("Images:", len(image_files))
        print("Labels:", len(mask_files))

        print(
            "Image extensions:",
            dict(Counter(p.suffix.lower() for p in image_files))
        )
        print(
            "Label extensions:",
            dict(Counter(p.suffix.lower() for p in mask_files))
        )

        print("Example image names:", [p.name for p in image_files[:3]])
        print("Example label names:", [p.name for p in mask_files[:3]])

        matching = sorted(images.keys() & masks.keys())

        print("Matching filename stems:", len(matching))
        print(
            "Images without same-stem labels:",
            sorted(images.keys() - masks.keys())[:10]
        )
        print(
            "Labels without same-stem images:",
            sorted(masks.keys() - images.keys())[:10]
        )

        if not matching:
            print("No same-stem pairs found; inspect naming before proceeding.")
            continue

        sample_indices = np.linspace(
            0,
            len(matching) - 1,
            num=min(4, len(matching)),
            dtype=int,
        )

        for index in sample_indices:
            stem = matching[int(index)]
            inspect_pair(images[stem], masks[stem])

    print("\nInspection finished. No dataset files were modified.")


if __name__ == "__main__":
    main()