from pathlib import Path

import albumentations as A
import cv2
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from torch.utils.data import Dataset


class OilSpillDataset(Dataset):
    def __init__(
        self,
        image_dir,
        mask_dir,
        filenames=None,
        image_size=(256, 512),
        augment=False,
    ):
        self.image_dir = Path(image_dir)
        self.mask_dir = Path(mask_dir)
        self.image_size = image_size
        self.augment = augment

        if not self.image_dir.is_dir():
            raise FileNotFoundError(self.image_dir)

        if not self.mask_dir.is_dir():
            raise FileNotFoundError(self.mask_dir)

        images = {
            p.stem: p
            for p in self.image_dir.iterdir()
            if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        }

        masks = {
            p.stem: p
            for p in self.mask_dir.iterdir()
            if p.suffix.lower() == ".png"
        }

        stems = sorted(images) if filenames is None else list(filenames)

        missing = [
            stem for stem in stems
            if stem not in images or stem not in masks
        ]

        if missing:
            raise ValueError(f"Missing image/label pairs: {missing[:10]}")

        self.pairs = [(images[stem], masks[stem]) for stem in stems]

        if not self.pairs:
            raise ValueError("No image-label pairs found.")

        self.transform = self._build_transform()

        print(f"Loaded {len(self.pairs)} pairs from {self.image_dir}")

    def _build_transform(self):
        height, width = self.image_size

        if not self.augment:
            return A.Compose(
                [
                    A.Resize(height=height, width=width),
                    A.Normalize(
                        mean=(0.485, 0.456, 0.406),
                        std=(0.229, 0.224, 0.225),
                    ),
                    ToTensorV2(),
                ]
            )

        return A.Compose(
            [
                A.Resize(height=height, width=width),
                A.HorizontalFlip(p=0.5),
                A.VerticalFlip(p=0.5),
                A.Affine(
                    translate_percent={
                        "x": (-0.03, 0.03),
                        "y": (-0.03, 0.03),
                    },
                    scale=(0.95, 1.05),
                    rotate=(-8, 8),
                    border_mode=cv2.BORDER_REFLECT_101,
                    p=0.35,
                ),
                A.RandomBrightnessContrast(
                    brightness_limit=0.08,
                    contrast_limit=0.08,
                    p=0.35,
                ),
                A.Normalize(
                    mean=(0.485, 0.456, 0.406),
                    std=(0.229, 0.224, 0.225),
                ),
                ToTensorV2(),
            ]
        )

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, index):
        image_path, mask_path = self.pairs[index]

        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        label = cv2.imread(str(mask_path), cv2.IMREAD_COLOR)

        if image is None or label is None:
            raise ValueError(
                f"Could not read pair: {image_path}, {mask_path}"
            )

        if image.shape[:2] != label.shape[:2]:
            raise ValueError(f"Image/label size mismatch: {image_path}")

        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        label = cv2.cvtColor(label, cv2.COLOR_BGR2RGB)

        oil_color = np.array([0, 255, 255], dtype=np.uint8)
        mask = np.all(label == oil_color, axis=-1).astype(np.uint8)

        transformed = self.transform(image=image, mask=mask)

        image_tensor = transformed["image"]
        mask_tensor = transformed["mask"]

        mask_tensor = mask_tensor.unsqueeze(0).float()

        return image_tensor, mask_tensor