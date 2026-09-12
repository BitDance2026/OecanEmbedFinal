#!/usr/bin/env python
"""
Predict over the FULL 101 x 241 grid and write CF-compliant NetCDF.

    python -m src.evaluation.export_netcdf --model compact --days 10

The problem statement asks for "standardized output at daily temporal
resolution and 0.25 degree spatial resolution". Training works on 32x32
patches, so this stitches patch predictions back into whole daily fields.

HOW THE STITCHING WORKS
    A 32x32 window slides across the grid with a stride of 8, so every
    interior cell is covered by up to 16 overlapping windows. Predictions are
    accumulated and divided by a count, which averages them.

    The averaging is not just bookkeeping -- it removes the edge artefacts a
    convolutional decoder produces at patch boundaries, where it has no
    context on one side. Cells near the domain edge are covered by fewer
    windows and are correspondingly less reliable; the ocean mask is applied
    at the end so land never appears as a prediction.

UNITS
    The model works in normalised space. y_mean and y_std from
    norm_stats.npz convert back to degrees Celsius, per depth.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import torch
import xarray as xr

from configs.config import (DEPTHS, INPUT_VARS, INTERIM, LAT, LON,
                            MODELS as MDIR, PATCH, PROCESSED, RESULTS,
                            TEST_YEARS)
from src.models.nets import MODELS

DEV = "cuda" if torch.cuda.is_available() else "cpu"
STITCH_STRIDE = 8          # 32/8 = 4, so up to 16 windows per interior cell


def predict_day(model, day_inputs, stats):
    """One day of 7 surface channels -> (15, 101, 241) in degrees C."""
    x_mean, x_std = stats["x_mean"], stats["x_std"]
    y_mean, y_std = stats["y_mean"], stats["y_std"]

    ny, nx = day_inputs.shape[1:]
    acc = np.zeros((len(DEPTHS), ny, nx), np.float64)
    cnt = np.zeros((ny, nx), np.float64)

    # normalise with the TRAINING statistics, exactly as in build_samples
    xn = np.nan_to_num((day_inputs - x_mean[0]) / x_std[0]).astype(np.float32)

    tiles, coords = [], []
    for i in range(0, ny - PATCH + 1, STITCH_STRIDE):
        for j in range(0, nx - PATCH + 1, STITCH_STRIDE):
            tiles.append(xn[:, i:i+PATCH, j:j+PATCH])
            coords.append((i, j))

    # the last row/column may not land on a stride boundary; cover them
    for i in range(0, ny - PATCH + 1, STITCH_STRIDE):
        j = nx - PATCH
        tiles.append(xn[:, i:i+PATCH, j:j+PATCH]); coords.append((i, j))
    for j in range(0, nx - PATCH + 1, STITCH_STRIDE):
        i = ny - PATCH
        tiles.append(xn[:, i:i+PATCH, j:j+PATCH]); coords.append((i, j))

    batch = torch.tensor(np.stack(tiles), dtype=torch.float32)
    preds = []
    with torch.no_grad():
        for k in range(0, len(batch), 256):
            preds.append(model(batch[k:k+256].to(DEV)).cpu().numpy())
    preds = np.concatenate(preds)

    for p, (i, j) in zip(preds, coords):
        acc[:, i:i+PATCH, j:j+PATCH] += p
        cnt[i:i+PATCH, j:j+PATCH] += 1

    field = acc / np.maximum(cnt, 1)
    return field * y_std[0] + y_mean[0]        # back to degrees C


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="compact", choices=list(MODELS))
    ap.add_argument("--days", type=int, default=10,
                    help="how many test-year days to export")
    ap.add_argument("--start", default=None,
                    help="first date, e.g. 2022-06-01. Default: Jan 1.")
    a = ap.parse_args()

    stats = np.load(PROCESSED / "norm_stats.npz")
    ds = xr.open_zarr(INTERIM / "oceanembed.zarr")

    sel = ds.time.dt.year.isin(TEST_YEARS)
    idx = np.where(sel.values)[0]
    if a.start:
        first = np.argmin(np.abs(ds.time.values[idx]
                                 - np.datetime64(a.start)))
        idx = idx[first:]
    idx = idx[:a.days]
    print(f"exporting {len(idx)} days from {str(ds.time.values[idx[0]])[:10]}")

    model = MODELS[a.model]().to(DEV)
    model.load_state_dict(torch.load(MDIR / f"{a.model}_best.pt",
                                     map_location=DEV))
    model.eval()

    ocean = ds["static_mask"].values.astype(bool)
    fields, times = [], []

    for n, t in enumerate(idx):
        day = np.stack([ds[v].isel(time=t).values for v in INPUT_VARS])
        f = predict_day(model, day, stats)
        f[:, ~ocean] = np.nan                  # never predict over land
        fields.append(f.astype(np.float32))
        times.append(ds.time.values[t])
        print(f"  {n+1}/{len(idx)}  {str(ds.time.values[t])[:10]}", flush=True)

    out = xr.Dataset(
        {"thetao": (("time", "depth", "latitude", "longitude"),
                    np.stack(fields))},
        coords={"time": times, "depth": DEPTHS,
                "latitude": LAT, "longitude": LON},
    )

    # CF-compliant metadata -- the PS asks for a standardized product, and a
    # NetCDF without units and standard_names is not one.
    out.thetao.attrs = {
        "long_name": "sea_water_potential_temperature",
        "standard_name": "sea_water_potential_temperature",
        "units": "degrees_C",
        "comment": (f"Reconstructed from seven surface satellite variables "
                    f"by the OceanEmbed {a.model} model. Not an observation."),
    }
    out.depth.attrs = {"units": "m", "positive": "down",
                       "standard_name": "depth", "axis": "Z"}
    out.latitude.attrs = {"units": "degrees_north",
                          "standard_name": "latitude", "axis": "Y"}
    out.longitude.attrs = {"units": "degrees_east",
                           "standard_name": "longitude", "axis": "X"}
    out.attrs = {
        "title": "OceanEmbed reconstructed subsurface temperature",
        "Conventions": "CF-1.8",
        "source": f"OceanEmbed {a.model}; inputs SST, SSS, SLA, u/v surface "
                  f"currents, u/v 10 m wind",
        "institution": "Smart India Hackathon submission",
        "comment": ("Model output, not observation. Skill approximately 60% "
                    "over climatology on the 2022 held-out year; error peaks "
                    "near the thermocline at 75-125 m."),
    }

    path = RESULTS / f"oceanembed_{a.model}_reconstruction.nc"
    out.to_netcdf(path)

    mb = path.stat().st_size / 1e6
    print(f"\nwrote {path}  ({mb:.1f} MB)")
    print(f"  shape {dict(out.sizes)}")
    valid = out.thetao.isel(time=0, depth=0).notnull().sum().item()
    print(f"  {valid} ocean cells per level, "
          f"{out.thetao.isel(time=0).min().item():.2f} .. "
          f"{out.thetao.isel(time=0).max().item():.2f} deg C")


if __name__ == "__main__":
    main()