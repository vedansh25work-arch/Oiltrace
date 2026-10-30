from pathlib import Path
import time

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from dataset import OilSpillDataset
from unet import UNet


def main():
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable in this Python environment.")

    root = (
        Path(__file__).resolve().parent
        / "data"
        / "raw"
        / "kaggle_oil_spill"
        / "oil-spill"
    )

    dataset = OilSpillDataset(
        root / "train" / "images",
        root / "train" / "labels",
        image_size=(256, 512),
    )

    loader = DataLoader(
        dataset,
        batch_size=1,
        shuffle=False,
        num_workers=0,
    )

    images, masks = next(iter(loader))

    print("GPU:", torch.cuda.get_device_name(0), flush=True)
    print("Images:", tuple(images.shape), flush=True)
    print("Masks:", tuple(masks.shape), flush=True)
    print("Mask values:", torch.unique(masks).tolist(), flush=True)
    print("Oil pixels in batch:", int(masks.sum()), flush=True)

    images = images.to("cuda")
    masks = masks.to("cuda")

    model = UNet().to("cuda").train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    scaler = torch.amp.GradScaler("cuda")

    torch.cuda.reset_peak_memory_stats()
    torch.cuda.synchronize()
    start = time.perf_counter()

    optimizer.zero_grad(set_to_none=True)

    with torch.autocast("cuda", dtype=torch.float16):
        logits = model(images)

        if logits.shape != masks.shape:
            raise ValueError(
                f"Output {logits.shape} != mask {masks.shape}"
            )

        loss = F.binary_cross_entropy_with_logits(logits, masks)

    if not torch.isfinite(loss):
        raise RuntimeError("Non-finite loss.")

    scaler.scale(loss).backward()
    scaler.step(optimizer)
    scaler.update()

    torch.cuda.synchronize()

    print("Output:", tuple(logits.shape))
    print("Loss:", round(loss.item(), 6))
    print("Step seconds:", round(time.perf_counter() - start, 2))
    print(
        "Peak allocated GPU memory (GiB):",
        round(torch.cuda.max_memory_allocated() / 1024**3, 2),
    )
    print("SUCCESS: one GPU training step completed.")


if __name__ == "__main__":
    main()