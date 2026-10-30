import os
from dotenv import load_dotenv

load_dotenv()

SENTINEL_HUB_CLIENT_ID = os.getenv("SENTINEL_HUB_CLIENT_ID")
SENTINEL_HUB_CLIENT_SECRET = os.getenv("SENTINEL_HUB_CLIENT_SECRET")

TOKEN_URL = "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token"
PROCESS_URL = "https://services.sentinel-hub.com/api/v1/process"

MODEL_PATH = "../ml/src/best_unet_oil_spill_optimized.pth"
DEVICE = "cuda" if os.getenv("USE_CUDA", "0") == "1" else "cpu"

SPILL_THRESHOLD = 0.45
TILE_SIZE = 512
MAX_SEARCH_DAYS = 7