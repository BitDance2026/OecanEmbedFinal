"""
Minimal prediction interface for the website/API.

    from src.evaluation.predict_api import predict_profile, predict_map_slice
    result = predict_profile(lat=15.0, lon=68.0, date="2022-06-15")

Loads the model, normalisation stats, and Zarr store ONCE at first call and
keeps them in memory (module-level globals), so repeated API requests are
fast rather than reloading a 20 GB store on every click.

NOTE FOR WHOEVER DEPLOYS THIS
    This needs data/interim/oceanembed.zarr on local disk. It will not run on
    a static host or serverless function -- it needs a real server with that
    ~20 GB store present.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import torch
import xarray as xr

from configs.config import (DEPTHS, INPUT_VARS, INTERIM, LAT, LAT_MIN,
                            LAT_MAX, LON, LON_MIN, LON_MAX,
                            MODELS as MDIR, PATCH, PROCESSED)
from src.models.nets import MODELS

_model = None
_stats = None
_ds = None
_ocean_mask = None


def _load():
    """Lazy singleton load. Runs once per process, not once per request."""
    global _model, _stats, _ds, _ocean_mask
    if _model is not None:
        return

    _model = MODELS["compact"]()
    _model.load_state_dict(torch.load(MDIR / "compact_best.pt",
                                      map_location="cpu"))
    _model.eval()

    _stats = np.load(PROCESSED / "norm_stats.npz")
    _ds = xr.open_zarr(INTERIM / "oceanembed.zarr")
    _ocean_mask = _ds["static_mask"].values.astype(bool)


def _nearest_day(date: str) -> int | None:
    _load()
    target = np.datetime64(date)
    idx = int(np.argmin(np.abs(_ds.time.values - target)))
    gap = abs((_ds.time.values[idx] - target) / np.timedelta64(1, "D"))
    return idx if gap <= 2 else None       # refuse to answer far-off dates


def in_domain(lat: float, lon: float) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def predict_profile(lat: float, lon: float, date: str) -> dict:
    """One point, one day -> temperature at all 15 standard depths.

    Returns an error dict rather than raising, so the API layer can pass it
    straight through as JSON without a try/except at every call site.
    """
    if not in_domain(lat, lon):
        return {"error": "outside study domain",
                "domain": {"lat": [LAT_MIN, LAT_MAX], "lon": [LON_MIN, LON_MAX]}}

    _load()
    day_idx = _nearest_day(date)
    if day_idx is None:
        return {"error": "date outside available range (2010-2022)"}

    lat_i = int(np.argmin(np.abs(LAT - lat)))
    lon_j = int(np.argmin(np.abs(LON - lon)))

    if not _ocean_mask[lat_i, lon_j]:
        return {"error": "location is on land or has insufficient ocean data"}

    half = PATCH // 2
    i0 = int(np.clip(lat_i - half, 0, len(LAT) - PATCH))
    j0 = int(np.clip(lon_j - half, 0, len(LON) - PATCH))

    day = np.stack([_ds[v].isel(time=day_idx).values for v in INPUT_VARS])
    patch = day[:, i0:i0 + PATCH, j0:j0 + PATCH]

    x_mean, x_std = _stats["x_mean"][0], _stats["x_std"][0]
    y_mean, y_std = _stats["y_mean"][0], _stats["y_std"][0]
    xn = np.nan_to_num((patch - x_mean) / x_std).astype(np.float32)

    with torch.no_grad():
        pred = _model(torch.tensor(xn[None]))[0].numpy()
    pred_c = pred * y_std + y_mean

    li, lj = lat_i - i0, lon_j - j0
    actual_date = str(_ds.time.values[day_idx])[:10]

    return {
        "lat": lat, "lon": lon,
        "requested_date": date, "matched_date": actual_date,
        "depths_m": [int(d) for d in DEPTHS],
        "temperature_C": [round(float(v), 3) for v in pred_c[:, li, lj]],
    }


def predict_map_slice(date: str, depth_m: int) -> dict:
    """One day, one depth -> the whole grid. Feeds the map view.

    This runs the sliding-window stitch used for the full export, at a
    single depth, so it is fast enough for an interactive request rather
    than the multi-minute full 15-depth export.
    """
    _load()
    day_idx = _nearest_day(date)
    if day_idx is None:
        return {"error": "date outside available range (2010-2022)"}
    if depth_m not in DEPTHS:
        return {"error": f"depth must be one of {DEPTHS}"}
    depth_k = DEPTHS.index(depth_m)

    x_mean, x_std = _stats["x_mean"][0], _stats["x_std"][0]
    y_mean, y_std = _stats["y_mean"][0, depth_k], _stats["y_std"][0, depth_k]

    day = np.stack([_ds[v].isel(time=day_idx).values for v in INPUT_VARS])
    xn = np.nan_to_num((day - x_mean) / x_std).astype(np.float32)

    ny, nx = xn.shape[1:]
    acc = np.zeros((ny, nx), np.float64)
    cnt = np.zeros((ny, nx), np.float64)
    stride = 8

    tiles, coords = [], []
    for i in range(0, ny - PATCH + 1, stride):
        for j in range(0, nx - PATCH + 1, stride):
            tiles.append(xn[:, i:i + PATCH, j:j + PATCH])
            coords.append((i, j))

    batch = torch.tensor(np.stack(tiles), dtype=torch.float32)
    with torch.no_grad():
        preds = _model(batch)[:, depth_k].numpy()   # only this depth's channel

    for p, (i, j) in zip(preds, coords):
        acc[i:i + PATCH, j:j + PATCH] += p
        cnt[i:i + PATCH, j:j + PATCH] += 1

    field = acc / np.maximum(cnt, 1)
    field = field * y_std + y_mean
    field[~_ocean_mask] = np.nan

    actual_date = str(_ds.time.values[day_idx])[:10]
    return {
        "requested_date": date, "matched_date": actual_date,
        "depth_m": depth_m,
        "latitude": LAT.tolist(), "longitude": LON.tolist(),
        # NaN is not valid JSON; the frontend should treat null as land/missing
        "temperature_C": [[None if np.isnan(v) else round(float(v), 2)
                           for v in row] for row in field],
    }


if __name__ == "__main__":
    # quick manual check: run `python -m src.evaluation.predict_api`
    r = predict_profile(lat=15.0, lon=68.0, date="2022-06-15")
    print(r)