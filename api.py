import base64
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from predict import SpillPredictor


ROOT = Path(__file__).resolve().parent
LIVE_RESULTS = ROOT / "data" / "live" / "results"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

logger = logging.getLogger("oiltrace.api")
prediction_lock = Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.predictor = SpillPredictor()
    yield
    app.state.predictor = None


app = FastAPI(
    title="OILTRACE Detection API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def as_array(value):
    if hasattr(value, "detach"):
        value = value.detach().cpu().numpy()

    return np.asarray(value)


def encode_image(extension, image):
    success, buffer = cv2.imencode(extension, image)

    if not success:
        raise ValueError(f"Could not encode {extension} image.")

    return base64.b64encode(buffer.tobytes()).decode("ascii")


def get_binary_mask(result):
    if "mask" not in result:
        raise ValueError("Predictor result does not contain 'mask'.")

    mask = np.squeeze(as_array(result["mask"]))

    if mask.ndim != 2:
        raise ValueError(
            f"Expected a 2D binary mask, received shape {mask.shape}."
        )

    if not np.isfinite(mask).all():
        raise ValueError("Prediction mask contains non-finite values.")

    values = np.unique(mask)

    if not np.isin(values, [0, 1, 255]).all():
        raise ValueError(
            "result['mask'] must be binary (0/1 or 0/255). "
            "It appears to contain probabilities or class labels."
        )

    return np.ascontiguousarray((mask > 0).astype(np.uint8))


def get_probability_map(result, shape):
    candidate_keys = (
        "probability",
        "probability_map",
        "prob_map",
        "probs",
        "probabilities",
    )

    for key in candidate_keys:
        if key not in result or result[key] is None:
            continue

        try:
            probability = np.squeeze(
                as_array(result[key])
            ).astype(np.float32)
        except (TypeError, ValueError):
            continue

        if probability.ndim != 2 or probability.shape != shape:
            continue

        if not np.isfinite(probability).all():
            continue

        if probability.min() < 0 or probability.max() > 1:
            continue

        return probability, key

    return None, None


def extract_regions(mask, probability):
    count, labels, stats, centroids = (
        cv2.connectedComponentsWithStats(
            mask,
            connectivity=8,
            ltype=cv2.CV_32S,
        )
    )

    regions = []

    for label_id in range(1, count):
        x, y, width, height, area = [
            int(value) for value in stats[label_id]
        ]

        mean_probability = None
        max_probability = None

        if probability is not None:
            local_labels = labels[
                y:y + height,
                x:x + width,
            ]
            local_probability = probability[
                y:y + height,
                x:x + width,
            ]

            values = local_probability[
                local_labels == label_id
            ]

            mean_probability = float(values.mean())
            max_probability = float(values.max())

        regions.append(
            {
                "region_id": int(label_id),
                "pixel_count": area,
                "bbox": {
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                },
                "centroid": {
                    "x": float(centroids[label_id, 0]),
                    "y": float(centroids[label_id, 1]),
                },
                "mean_probability": mean_probability,
                "max_probability": max_probability,
            }
        )

    regions.sort(
        key=lambda region: region["pixel_count"],
        reverse=True,
    )

    return regions


def run_prediction(image, filename):
    predictor = app.state.predictor

    with prediction_lock:
        result = predictor.predict(image)

        mask = get_binary_mask(result)
        probability, probability_key = get_probability_map(
            result,
            mask.shape,
        )

        regions = extract_regions(mask, probability)

        oil_pixel_count = int(np.count_nonzero(mask))
        oil_pixel_fraction = float(
            oil_pixel_count / mask.size
        )

        has_spill = oil_pixel_count > 0
        largest_region = regions[0] if regions else None

        # Reuse the model's rendering methods without changing
        # the raw result they expect.
        overlay = predictor.make_overlay(image, result)
        heatmap = predictor.make_probability_heatmap(result)

    original_alert = result.get("alert")
    original_alert = (
        original_alert
        if isinstance(original_alert, dict)
        else {}
    )

    original_level = str(
        original_alert.get("alert_level", "")
    ).lower()

    # Do not invent severity thresholds when the predictor
    # has not supplied a compatible alert policy.
    if not has_spill:
        alert_level = "none"
        reason = "No oil-like pixels detected in the prediction mask."
    elif original_level in {"low", "medium", "high"}:
        alert_level = original_level
        reason = original_alert.get("reason") or (
            f"{len(regions)} connected region(s) detected."
        )
    else:
        alert_level = "unassessed"
        reason = (
            f"{len(regions)} connected region(s) detected. "
            "Alert severity has not been assessed."
        )

    warnings = []

    if probability is None:
        warnings.append(
            "A matching 2D raw probability map was not exposed "
            "under the supported keys. Region confidence is unavailable."
        )

    if "has_spill" in result:
        if bool(result["has_spill"]) != has_spill:
            warnings.append(
                "The predictor's detection flag differs from "
                "the nonzero-mask detection rule used by this endpoint."
            )

    logger.info(
        "Prediction %s: keys=%s mask_shape=%s oil_pixels=%s "
        "regions=%s probability_key=%s",
        filename,
        list(result.keys()),
        mask.shape,
        oil_pixel_count,
        len(regions),
        probability_key,
    )

    return {
        "filename": filename,
        "has_spill": has_spill,
        "oil_pixel_count": oil_pixel_count,
        "oil_pixel_fraction": oil_pixel_fraction,
        "threshold": float(predictor.threshold),
        "model": str(result.get("model") or "unspecified"),
        "regions": regions,
        "region_count": len(regions),
        "confidence_available": probability is not None,
        "alert": {
            "alert_level": alert_level,
            "reason": reason,
            "largest_region": largest_region,
        },
        "mask_png_base64": encode_image(
            ".png",
            mask * 255,
        ),
        "overlay_jpg_base64": encode_image(".jpg", overlay),
        "probability_jpg_base64": encode_image(".jpg", heatmap),
        "warnings": warnings,
        "diagnostics": {
            "mask_height": int(mask.shape[0]),
            "mask_width": int(mask.shape[1]),
            "probability_key": probability_key,
            "region_pixel_sum": sum(
                region["pixel_count"] for region in regions
            ),
            "region_policy": (
                "All nonzero binary-mask components; "
                "8-connectivity; no minimum-area filtering."
            ),
        },
    }


@app.get("/")
@app.get("/health")
def health():
    predictor = getattr(app.state, "predictor", None)

    return {
        "status": "ok",
        "model_loaded": predictor is not None,
        "threshold": (
            float(predictor.threshold)
            if predictor is not None
            else None
        ),
    }


@app.get("/live/results")
def live_results(limit: int = Query(default=20, ge=1, le=100)):
    if not LIVE_RESULTS.exists():
        return {"results": []}

    folders = sorted(
        (
            folder
            for folder in LIVE_RESULTS.iterdir()
            if folder.is_dir()
        ),
        key=lambda folder: folder.stat().st_mtime,
        reverse=True,
    )

    records = []

    for folder in folders:
        if len(records) >= limit:
            break

        result_path = folder / "result.json"

        if not result_path.is_file():
            continue

        try:
            record = json.loads(
                result_path.read_text(encoding="utf-8")
            )

            if not isinstance(record, dict):
                continue

            record["result_id"] = folder.name
            records.append(record)
        except (OSError, ValueError):
            logger.warning(
                "Skipping unreadable live result: %s",
                result_path,
            )

    return {"results": records}


@app.post("/predict")
async def predict_spill(file: UploadFile = File(...)):
    if getattr(app.state, "predictor", None) is None:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded.",
        )

    try:
        contents = await file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        await file.close()

    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Maximum image size is 15 MB.",
        )

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty.",
        )

    image = cv2.imdecode(
        np.frombuffer(contents, dtype=np.uint8),
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a decodable image.",
        )

    try:
        return await run_in_threadpool(
            run_prediction,
            image,
            file.filename,
        )
    except Exception as error:
        logger.exception("Prediction failed.")

        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {error}",
        ) from error