import sys
import numpy as np
import torch
import torch.nn.functional as F

from pathlib import Path
import sys

import config

PROJECT_ROOT = Path(__file__).resolve().parent.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from unet import UNet


_model = None


def load_model():
    global _model
    if _model is None:
        _model = UNet().to(config.DEVICE)
        state = torch.load(config.MODEL_PATH, map_location=config.DEVICE)
        _model.load_state_dict(state)
        _model.eval()
    return _model


def predict_spill_mask(sar_array):
    model = load_model()

    tensor = torch.from_numpy(sar_array).permute(2, 0, 1).unsqueeze(0).float()
    tensor = tensor.to(config.DEVICE)

    with torch.inference_mode():
        logits = model(tensor)
        probability = torch.sigmoid(logits)[0, 0].cpu().numpy()

    mask = (probability > config.SPILL_THRESHOLD).astype(np.uint8)

    return {
        "probability": probability,
        "mask": mask,
        "spill_pixels": int(mask.sum()),
        "spill_percentage": float(mask.mean() * 100),
    }