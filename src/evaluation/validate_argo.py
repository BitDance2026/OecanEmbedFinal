#!/usr/bin/env python
"""
Validate against independent ARGO observations.

    python -m src.evaluation.validate_argo --model compact

This is the deliverable the problem statement names explicitly:
"Evaluate the reconstruction using independent observations and standard
skill metrics like correlation, RMSE, Bias."

WHAT "MATCHING" MEANS HERE
    Each ARGO profile is a set of (pressure, temperature) pairs at one place
    and time. The model predicts temperature on a grid, at 15 fixed depths,
    once per day. To compare them:

      1. Find the nearest model grid cell to the float's position
      2. Find the nearest model day to the profile's time (same day, since
         the model is daily)
      3. Interpolate the ARGO profile's irregular pressure levels onto the
         model's 15 standard depths (linear interpolation in pressure)
      4. Compare model prediction vs interpolated ARGO temperature, per depth

WHY PRESSURE, NOT DEPTH
    ARGO reports pressure in dbar, which is not identical to depth in metres,
    but the difference is under 2% in the upper 1000 m and is ignored here,
    consistent with standard oceanographic practice at this precision.

THE HONEST CAVEAT -- STATE THIS IN THE REPORT
    GLORYS assimilates ARGO. This model was trained on GLORYS. So this is not
    a fully independent test: strong performance partly reflects "the model
    learned to reproduce a reanalysis that itself used these floats," not
    purely "the model can infer structure the reanalysis never saw." Two
    things make this comparison still worthwhile:
      - the model uses no ARGO data directly, only satellite surface fields
      - a genuinely broken embedding would still fail this test, so passing
        it is a necessary, not sufficient, piece of evidence
    Report the correlation with GLORYS-vs-ARGO error alongside model-vs-ARGO
    error: if the model is only as good as GLORYS, that is a fair result to
    show, not a failure to hide.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import pandas as pd
import torch
import xarray as xr

from configs.config import (DEPTHS, INPUT_VARS, INTERIM, LAT, LON,
                            MODELS as MDIR, PATCH, PROCESSED, RESULTS)
from src.models.nets import MODELS

DEV = "cuda" if torch.cuda.is_available() else "cpu"
BASIN_SPLIT_LON = 78.0


def load_argo(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, skiprows=[1], low_memory=False)
    df = df.rename(columns={
        "pres_adjusted": "pres", "temp_adjusted": "temp",
        "psal_adjusted": "psal",
    })
    df["time"] = pd.to_datetime(df["time"])
    df = df.dropna(subset=["pres", "temp", "latitude", "longitude"])
    df = df[(df["pres"] >= 0) & (df["pres"] <= 1100)]
    return df


def profile_to_standard_depths(prof: pd.DataFrame) -> np.ndarray:
    """One float profile -> 15 values at the standard depths, via linear
    interpolation in pressure. NaN where the profile does not reach."""
    prof = prof.sort_values("pres")
    p, t = prof["pres"].values, prof["temp"].values
    if len(p) < 2:
        return np.full(len(DEPTHS), np.nan)

    out = np.full(len(DEPTHS), np.nan)
    for k, d in enumerate(DEPTHS):
        if d < p.min() or d > p.max():
            continue                          # do not extrapolate
        out[k] = np.interp(d, p, t)
    return out


def predict_at(model, stats, ds, day_idx: int, lat0: float, lon0: float):
    """Run the model on the 32x32 patch centred on the float, return the
    15-depth prediction (deg C) at the exact grid cell nearest the float."""
    lat_i = int(np.argmin(np.abs(LAT - lat0)))
    lon_j = int(np.argmin(np.abs(LON - lon0)))

    half = PATCH // 2
    i0 = np.clip(lat_i - half, 0, len(LAT) - PATCH)
    j0 = np.clip(lon_j - half, 0, len(LON) - PATCH)

    day = np.stack([ds[v].isel(time=day_idx).values for v in INPUT_VARS])
    patch = day[:, i0:i0+PATCH, j0:j0+PATCH]

    x_mean, x_std = stats["x_mean"][0], stats["x_std"][0]
    y_mean, y_std = stats["y_mean"][0], stats["y_std"][0]
    xn = np.nan_to_num((patch - x_mean) / x_std).astype(np.float32)

    with torch.no_grad():
        t = torch.tensor(xn[None], dtype=torch.float32).to(DEV)
        pred = model(t)[0].cpu().numpy()

    pred_c = pred * y_std + y_mean
    li, lj = lat_i - i0, lon_j - j0                # float's cell within patch
    return pred_c[:, li, lj]


def metrics(pred, obs):
    ok = ~np.isnan(pred) & ~np.isnan(obs)
    if ok.sum() < 5:
        return dict(rmse=np.nan, bias=np.nan, corr=np.nan, n=int(ok.sum()))
    p, o = pred[ok], obs[ok]
    return dict(
        rmse=float(np.sqrt(np.mean((p - o) ** 2))),
        bias=float(np.mean(p - o)),
        corr=float(np.corrcoef(p, o)[0, 1]) if ok.sum() > 2 else np.nan,
        n=int(ok.sum()),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="compact", choices=list(MODELS))
    ap.add_argument("--max-profiles", type=int, default=None,
                    help="cap for a quick test run")
    a = ap.parse_args()

    argo_files = sorted((RESULTS / "argo").glob("argo_*.csv"))
    if not argo_files:
        print("No ARGO files found. Run:")
        print("  python -m src.evaluation.download_argo")
        sys.exit(1)

    argo = pd.concat([load_argo(f) for f in argo_files], ignore_index=True)
    print(f"loaded {len(argo)} ARGO depth samples")

    ds = xr.open_zarr(INTERIM / "oceanembed.zarr")
    stats = np.load(PROCESSED / "norm_stats.npz")

    model = MODELS[a.model]().to(DEV)
    model.load_state_dict(torch.load(MDIR / f"{a.model}_best.pt",
                                     map_location=DEV))
    model.eval()

    profiles = argo.groupby(["platform_number", "cycle_number"])
    keys = list(profiles.groups.keys())
    if a.max_profiles:
        keys = keys[:a.max_profiles]
    print(f"{len(keys)} distinct profiles to match")

    ds_times = ds.time.values
    rows = []
    matched, skipped_time, skipped_land = 0, 0, 0

    for key in keys:
        prof = profiles.get_group(key)
        lat0, lon0 = prof["latitude"].iloc[0], prof["longitude"].iloc[0]
        prof_time = prof["time"].iloc[0].to_datetime64()

        day_idx = int(np.argmin(np.abs(ds_times - prof_time)))
        gap_days = abs((ds_times[day_idx] - prof_time)
                      / np.timedelta64(1, "D"))
        if gap_days > 1.5:
            skipped_time += 1
            continue

        obs = profile_to_standard_depths(prof)
        if np.isnan(obs).all():
            continue

        try:
            pred = predict_at(model, stats, ds, day_idx, lat0, lon0)
        except Exception:
            skipped_land += 1
            continue

        rows.append({
            "platform": key[0], "cycle": key[1],
            "lat": lat0, "lon": lon0, "time": prof_time,
            "pred": pred, "obs": obs,
        })
        matched += 1

    print(f"\nmatched {matched} profiles "
          f"({skipped_time} too far in time, {skipped_land} on land/edge)")
    if matched < 10:
        print("TOO FEW MATCHES for meaningful statistics. Widen the domain, "
              "the year range, or the time-gap tolerance, and say so in the "
              "report rather than presenting these numbers as conclusive.")

    pred_arr = np.stack([r["pred"] for r in rows])          # (N, 15)
    obs_arr = np.stack([r["obs"] for r in rows])
    lons = np.array([r["lon"] for r in rows])

    print("\n" + "=" * 60)
    print("ARGO VALIDATION -- independent observations")
    print("=" * 60)
    overall = metrics(pred_arr.ravel(), obs_arr.ravel())
    print(f"overall   RMSE {overall['rmse']:.3f} degC   "
          f"bias {overall['bias']:+.3f}   corr {overall['corr']:.3f}   "
          f"n={overall['n']}")

    print(f"\n{'depth':>7}{'RMSE':>9}{'bias':>9}{'corr':>8}{'n':>7}")
    per_depth = []
    for k, d in enumerate(DEPTHS):
        m = metrics(pred_arr[:, k], obs_arr[:, k])
        per_depth.append({"depth": d, **m})
        print(f"{d:>6}m{m['rmse']:9.3f}{m['bias']:+9.3f}{m['corr']:8.3f}"
              f"{m['n']:7d}")

    print("\nPER BASIN")
    per_basin = {}
    for name, sel in [("Arabian Sea", lons < BASIN_SPLIT_LON),
                      ("Bay of Bengal", lons >= BASIN_SPLIT_LON)]:
        if sel.sum() == 0:
            continue
        m = metrics(pred_arr[sel].ravel(), obs_arr[sel].ravel())
        per_basin[name] = m
        print(f"  {name:<16}RMSE {m['rmse']:.3f}  bias {m['bias']:+.3f}  "
              f"corr {m['corr']:.3f}  n={m['n']}  ({sel.sum()} profiles)")

    print("\n" + "=" * 60)
    print("CAVEAT -- state this explicitly in the report:")
    print("  GLORYS (the training target) assimilates ARGO observations.")
    print("  This validation is therefore not fully independent. It shows")
    print("  the model reproduces the assimilated state, not that it")
    print("  generalises beyond what GLORYS itself was built from.")
    print("=" * 60)

    import json
    out = RESULTS / f"argo_validation_{a.model}.json"
    out.write_text(json.dumps({
        "overall": overall, "per_depth": per_depth, "per_basin": per_basin,
        "n_profiles_matched": matched,
        "n_skipped_time": skipped_time, "n_skipped_land": skipped_land,
        "caveat": "GLORYS assimilates ARGO; not fully independent.",
    }, indent=2))
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()