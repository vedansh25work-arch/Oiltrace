import base64
import json
import time
import requests
import numpy as np
from datetime import datetime, timedelta, timezone

import config


def get_access_token():
    response = requests.post(
        config.TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": config.SENTINEL_HUB_CLIENT_ID,
            "client_secret": config.SENTINEL_HUB_CLIENT_SECRET,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def build_process_request(bbox, width=512, height=512):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=config.MAX_SEARCH_DAYS)

    evalscript = """
    //VERSION=3
    function setup() {
      return {
        input: ["VV", "VH", "dataMask"],
        output: { bands: 3, sampleType: "FLOAT32" }
      };
    }

    function evaluatePixel(sample) {
      return [sample.VV, sample.VH, sample.dataMask];
    }
    """

    return {
        "input": {
            "bounds": {
                "bbox": bbox,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [
                {
                    "type": "sentinel-1-grd",
                    "dataFilter": {
                        "timeRange": {
                            "from": start.isoformat(),
                            "to": end.isoformat(),
                        }
                    },
                    "processing": {
                        "orthorectify": "true"
                    },
                }
            ],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [
                {
                    "identifier": "default",
                    "format": {"type": "image/tiff"},
                }
            ],
        },
        "evalscript": base64.b64encode(evalscript.encode()).decode(),
    }


def fetch_sar_tile(bbox, width=512, height=512):
    token = get_access_token()
    payload = build_process_request(bbox, width, height)

    response = requests.post(
        config.PROCESS_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "image/tiff",
        },
        data=json.dumps(payload),
        timeout=120,
    )
    response.raise_for_status()

    with open("temp_sar.tif", "wb") as f:
        f.write(response.content)

    return "temp_sar.tif"


def preprocess_tif(tif_path, tile_size=512):
    import cv2

    img = cv2.imread(tif_path, cv2.IMREAD_UNCHANGED)

    if img is None:
        raise ValueError("Could not read Sentinel Hub TIFF response.")

    if img.ndim == 2:
        img = np.stack([img, img], axis=-1)

    vv = img[:, :, 0].astype(np.float32)
    vh = img[:, :, 1].astype(np.float32)

    # Convert linear backscatter to dB and normalize to 0-1.
    vv_db = 10 * np.log10(np.maximum(vv, 1e-6))
    vh_db = 10 * np.log10(np.maximum(vh, 1e-6))

    vv_norm = np.clip((vv_db + 30) / 30, 0, 1)
    vh_norm = np.clip((vh_db + 35) / 35, 0, 1)

    sar = np.stack([vv_norm, vh_norm], axis=-1)

    h, w = sar.shape[:2]
    pad_h = (tile_size - h % tile_size) % tile_size
    pad_w = (tile_size - w % tile_size) % tile_size
    sar = np.pad(sar, ((0, pad_h), (0, pad_w), (0, 0)), mode="reflect")

    return sar