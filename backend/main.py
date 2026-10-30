import numpy as np
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
import sentinel
import inference
import attribution

app = FastAPI(title="Oiltrace Live API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    bbox: list[float]  # [west, south, east, north]
    width: int = 512
    height: int = 512


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    if len(request.bbox) != 4:
        raise HTTPException(400, "bbox must be [west, south, east, north]")

    try:
        tif_path = sentinel.fetch_sar_tile(
            request.bbox, request.width, request.height
        )
        sar = sentinel.preprocess_tif(
            tif_path, config.TILE_SIZE
        )
        result = inference.predict_spill_mask(sar)

    except Exception as exc:
        raise HTTPException(502, f"Satellite processing failed: {exc}")

    mask = result["mask"]

    if result["spill_pixels"] == 0:
        return {
            "spill_detected": False,
            "message": "No likely oil spill detected in this scene.",
            "spill_percentage": result["spill_percentage"],
            "vessels": [],
        }

    ys, xs = np.where(mask > 0)
    tile_h, tile_w = mask.shape

    west, south, east, north = request.bbox
    lon = west + (xs.mean() / tile_w) * (east - west)
    lat = north - (ys.mean() / tile_h) * (north - south)

    detection_time = datetime.now(timezone.utc)

    vessels = attribution.rank_responsible_vessels(
        bbox=request.bbox,
        spill_centroid=(lon, lat),
        detection_time=detection_time,
    )

    return {
        "spill_detected": True,
        "spill_percentage": result["spill_percentage"],
        "spill_pixels": result["spill_pixels"],
        "spill_centroid": {"latitude": lat, "longitude": lon},
        "detection_time": detection_time.isoformat(),
        "vessels": vessels,
    }