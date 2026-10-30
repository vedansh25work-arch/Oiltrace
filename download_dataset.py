from pathlib import Path
import kagglehub

project_root = Path(__file__).resolve().parent
destination = project_root / "data" / "raw" / "kaggle_oil_spill"

path = kagglehub.dataset_download(
    "nabilsherif/oil-spill",
    output_dir=str(destination),
)

print("\nDataset location:", path)

for folder in sorted(Path(path).rglob("*")):
    if folder.is_dir() and folder.name in {"images", "labels"}:
        files = [item for item in folder.iterdir() if item.is_file()]
        print(f"{folder.relative_to(Path(path))}: {len(files)} files")