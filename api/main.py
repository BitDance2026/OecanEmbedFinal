"""
FastAPI wrapper around predict_api.py.

    uvicorn api.main:app --reload

Then open http://localhost:8000/docs for an auto-generated test page.

DEPLOYMENT NOTE
    This process must run on a machine with data/interim/oceanembed.zarr on
    local disk (~20 GB). It cannot run on a static host or serverless
    function. The model and Zarr store load once at first request and stay
    in memory -- do not restart the process between requests, or every
    request pays the load cost again.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from configs.config import DEPTHS, LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, RESULTS
from src.evaluation.predict_api import predict_map_slice, predict_profile

app = FastAPI(title="OceanEmbed API",
             description="Subsurface ocean temperature reconstruction")

# Wide open for a hackathon demo. Restrict allow_origins to the actual
# frontend URL before anything resembling production.
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/")
def root():
    return {
        "status": "ok",
        "endpoints": ["/profile", "/map", "/stats", "/domain"],
        "domain": {"lat": [LAT_MIN, LAT_MAX], "lon": [LON_MIN, LON_MAX],
                  "depths_m": DEPTHS, "years": "2010-2022"},
    }


@app.get("/domain")
def domain():
    """The valid input ranges, so the frontend can validate before asking."""
    return {"lat_min": LAT_MIN, "lat_max": LAT_MAX,
            "lon_min": LON_MIN, "lon_max": LON_MAX,
            "depths_m": DEPTHS, "date_range": ["2010-01-01", "2022-12-31"]}


@app.get("/profile")
def profile(
    lat: float = Query(..., ge=-90, le=90, description="latitude, degrees N"),
    lon: float = Query(..., ge=-180, le=180, description="longitude, degrees E"),
    date: str = Query(..., description="YYYY-MM-DD"),
):
    """Click-a-point: full 15-depth temperature profile for one location/day."""
    return predict_profile(lat, lon, date)


@app.get("/map")
def map_slice(
    date: str = Query(..., description="YYYY-MM-DD"),
    depth: int = Query(..., description=f"one of {DEPTHS}"),
):
    """Colour-the-map: the whole grid at one depth, one day."""
    return predict_map_slice(date, depth)


@app.get("/stats")
def stats():
    """Headline numbers for the dashboard cards."""
    out = {}
    for name, fname in [
        ("model", "metrics_compact.json"),
        ("argo_validation", "argo_validation_compact.json"),
    ]:
        p = RESULTS / fname
        if p.exists():
            out[name] = json.loads(p.read_text())
        else:
            out[name] = {"error": f"{fname} not found -- run the eval script first"}
    return out


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)