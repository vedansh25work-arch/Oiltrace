from pathlib import Path
import json
import random
import time

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader

from dataset import OilSpillDataset
from unet import UNet


ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data/raw/kaggle_oil_spill/oil-spill"
RUN_DIR = ROOT / "models/spill_detector/v2_1"

EPOCHS = 30
BATCH_SIZE = 2
IMAGE_SIZE = (256, 512)
LR = 1e-4
SEED = 42
NUM_WORKERS = 0
NUM_WORKERS = 0


def segmentation_loss(logits, targets):
    logits = logits.float()

    bce = F.binary_cross_entropy_with_logits(logits, targets)
    probabilities = torch.sigmoid(logits)

    intersection = (probabilities * targets).sum(dim=(1, 2, 3))
    denominator = (
        probabilities.sum(dim=(1, 2, 3))
        + targets.sum(dim=(1, 2, 3))
    )

    dice_loss = 1 - (
        (2 * intersection + 1) / (denominator + 1)
    ).mean()

    return 0.5 * bce + 0.5 * dice_loss


def get_split():
    split_path = RUN_DIR / "split.json"

    stems = sorted(
        p.stem
        for p in (DATA_ROOT / "train/images").glob("*.jpg")
    )

    if not stems:
        raise ValueError("No training JPG images found.")

    if split_path.exists():
        split = json.loads(split_path.read_text())
    else:
        shuffled = stems.copy()
        random.Random(SEED).shuffle(shuffled)

        val_count = max(1, round(len(shuffled) * 0.2))

        split = {
            "seed": SEED,
            "train": sorted(shuffled[val_count:]),
            "val": sorted(shuffled[:val_count]),
        }

        split_path.write_text(json.dumps(split, indent=2))

    train_names = set(split["train"])
    val_names = set(split["val"])

    if train_names & val_names:
        raise ValueError("Train and validation split overlap.")

    if train_names | val_names != set(stems):
        raise ValueError("Saved split does not match the current dataset.")

    return split


def run_epoch(model, loader, optimizer=None, scaler=None):
    training = optimizer is not None
    model.train(training)

    total_loss = 0.0
    total_images = 0

    tp = fp = fn = 0
    spill_dice_sum = 0.0
    spill_images = 0
    empty_images = 0
    empty_predicted_pixels = 0
    empty_total_pixels = 0

    context = torch.enable_grad() if training else torch.inference_mode()

    with context:
        for step, (images, masks) in enumerate(loader, start=1):
            images = images.to("cuda", non_blocking=True)
            masks = masks.to("cuda", non_blocking=True)

            if training:
                optimizer.zero_grad(set_to_none=True)

            with torch.autocast("cuda", dtype=torch.float16):
                logits = model(images)

            loss = segmentation_loss(logits, masks)

            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite loss encountered.")

            if training:
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(optimizer)
                scaler.update()

            batch_size = images.size(0)
            total_loss += loss.item() * batch_size
            total_images += batch_size

            predictions = torch.sigmoid(logits.detach().float()) >= 0.5
            targets = masks > 0.5

            dims = (1, 2, 3)

            batch_tp = (predictions & targets).sum(dim=dims)
            batch_fp = (predictions & ~targets).sum(dim=dims)
            batch_fn = (~predictions & targets).sum(dim=dims)

            tp += int(batch_tp.sum().item())
            fp += int(batch_fp.sum().item())
            fn += int(batch_fn.sum().item())

            has_oil = targets.sum(dim=dims) > 0

            if has_oil.any():
                dice = (
                    2 * batch_tp[has_oil].float()
                    / (
                        2 * batch_tp[has_oil]
                        + batch_fp[has_oil]
                        + batch_fn[has_oil]
                    ).float().clamp_min(1)
                )
                spill_dice_sum += dice.sum().item()
                spill_images += int(has_oil.sum().item())

            no_oil = ~has_oil

            if no_oil.any():
                empty_images += int(no_oil.sum().item())
                empty_predicted_pixels += int(
                    predictions[no_oil].sum().item()
                )
                empty_total_pixels += predictions[no_oil].numel()

            if step % 50 == 0 or step == len(loader):
                phase = "Train" if training else "Val"
                print(
                    f"  {phase} batch {step}/{len(loader)} | "
                    f"loss {total_loss / total_images:.4f}",
                    flush=True,
                )

    return {
        "loss": total_loss / total_images,
        "dice_micro": (
            2 * tp / (2 * tp + fp + fn)
            if 2 * tp + fp + fn else None
        ),
        "iou_micro": (
            tp / (tp + fp + fn)
            if tp + fp + fn else None
        ),
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "spill_only_dice": (
            spill_dice_sum / spill_images if spill_images else None
        ),
        "spill_images": spill_images,
        "no_oil_images": empty_images,
        "no_oil_false_positive_pixel_rate": (
            empty_predicted_pixels / empty_total_pixels
            if empty_total_pixels else None
        ),
    }


def main():
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable. Use the project .venv.")

    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)

    RUN_DIR.mkdir(parents=True, exist_ok=True)
    split = get_split()

    train_dataset = OilSpillDataset(
        DATA_ROOT / "train/images",
        DATA_ROOT / "train/labels",
        filenames=split["train"],
        image_size=IMAGE_SIZE,
        augment=True,
    )

    val_dataset = OilSpillDataset(
        DATA_ROOT / "train/images",
        DATA_ROOT / "train/labels",
        filenames=split["val"],
        image_size=IMAGE_SIZE,
        augment=False,
    )

    generator = torch.Generator().manual_seed(SEED)

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=NUM_WORKERS,
        pin_memory=True,
        generator=generator,
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
        pin_memory=True,
    )

    model = UNet().to("cuda")

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=LR,
        weight_decay=1e-4,
    )

    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="max",
        factor=0.5,
        patience=4,
    )

    scaler = torch.amp.GradScaler("cuda")

    print("GPU:", torch.cuda.get_device_name(0), flush=True)
    print(
        f"Train: {len(train_dataset)} | Val: {len(val_dataset)} | "
        "Test: untouched",
        flush=True,
    )
    print("Output directory:", RUN_DIR, flush=True)

    checkpoint_path = RUN_DIR / "last_checkpoint.pth"
    history_path = RUN_DIR / "history.json"

    if checkpoint_path.is_file():
        checkpoint = torch.load(
            checkpoint_path,
            map_location="cpu",
            weights_only=True,
        )

        if checkpoint["split"] != split:
            raise ValueError(
                "Checkpoint split differs from the current split."
            )

        if tuple(checkpoint["image_size"]) != IMAGE_SIZE:
            raise ValueError(
                "Checkpoint image size differs from current settings."
            )

        model.load_state_dict(checkpoint["model_state_dict"])
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        scaler.load_state_dict(checkpoint["scaler_state_dict"])

        if "scheduler_state_dict" in checkpoint:
            scheduler.load_state_dict(checkpoint["scheduler_state_dict"])

        start_epoch = int(checkpoint["epoch"]) + 1
        best_dice = float(checkpoint["best_val_dice"])

        history = (
            json.loads(history_path.read_text())
            if history_path.exists()
            else []
        )

        history = [
            record for record in history
            if record["epoch"] < start_epoch
        ]

        del checkpoint

        print(
            f"Resuming from epoch {start_epoch}; "
            f"target is {EPOCHS} total epochs.",
            flush=True,
        )
    else:
        start_epoch = 1
        best_dice = -1.0
        history = []

        print(
            f"Starting a new v2 run for {EPOCHS} total epochs.",
            flush=True,
        )

    for epoch in range(start_epoch, EPOCHS + 1):
        print(f"\nEpoch {epoch}/{EPOCHS}", flush=True)

        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
        start = time.perf_counter()

        train_metrics = run_epoch(
            model, train_loader, optimizer, scaler
        )
        val_metrics = run_epoch(model, val_loader)

        torch.cuda.synchronize()
        seconds = time.perf_counter() - start

        record = {
            "epoch": epoch,
            "seconds": seconds,
            "peak_gpu_gib": (
                torch.cuda.max_memory_allocated() / 1024**3
            ),
            "train": train_metrics,
            "val": val_metrics,
        }

        history.append(record)

        score = val_metrics["dice_micro"]
        improved = score is not None and score > best_dice

        if improved:
            best_dice = score

        scheduler.step(score)

        checkpoint = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scaler_state_dict": scaler.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "best_val_dice": best_dice,
            "image_size": list(IMAGE_SIZE),
            "oil_rgb": [0, 255, 255],
            "threshold": 0.25,
            "split": split,
            "seed": SEED,
        }

        torch.save(checkpoint, RUN_DIR / "last_checkpoint.pth")

        if improved:
            torch.save(checkpoint, RUN_DIR / "best_checkpoint.pth")
            torch.save(model.state_dict(), RUN_DIR / "best_weights.pth")

        (RUN_DIR / "history.json").write_text(
            json.dumps(history, indent=2, allow_nan=False)
        )

        current_lr = optimizer.param_groups[0]["lr"]

        print(
            f"Epoch {epoch} finished in {seconds / 60:.2f} minutes",
            flush=True,
        )
        print("Validation:", json.dumps(val_metrics), flush=True)
        print(f"Learning rate: {current_lr:.8f}", flush=True)
        print(
            f"Peak GPU allocation: {record['peak_gpu_gib']:.2f} GiB",
            flush=True,
        )

    print("\nV2 training finished. Send the epoch summaries for review.")


if __name__ == "__main__":
    main()