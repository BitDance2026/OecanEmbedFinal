#!/usr/bin/env python
"""
Build 32x32 samples and normalise them. Year-based splits.

    python -m src.data.build_samples

WHY PATCH POSITIONS ARE RANDOM
    The first version stepped through the grid with a fixed stride and reused
    the SAME 34 positions for all 4,018 days. Training overfitted hard --
    train loss fell 66% while validation stopped improving at epoch 7 --
    because 136,612 "samples" were really 34 pieces of ocean seen 4,018 times.
    The network memorised those 34 windows.

    Now every candidate position is enumerated at stride 1, and a fresh random
    subset is drawn for each day. Same sample count, same memory, but the
    model sees the whole basin instead of 34 windows, and the resampling acts
    as augmentation.

    Validation and test use a FIXED seed, so their patches are the same on
    every rebuild. Comparing runs against a moving test set would be
    meaningless.

NORMALISATION -- the rule that must not be broken
    Mean and standard deviation come from the TRAINING YEARS ONLY. Computing
    them over the whole record leaks information about 2021 and 2022 into a
    model that is supposed never to have seen them, and every metric
    afterwards is quietly inflated.

TARGETS ARE NORMALISED PER DEPTH, and that is doing real work. Temperature
variance at 1000 m is far smaller than at the surface (0.98 vs 1.50 deg C in
this dataset, and the gap is much wider in absolute terms). Under a single
global scaling an unweighted MSE barely moves whatever the model predicts
down there, so the network learns to ignore the deep levels entirely.
Per-depth scaling makes 1000 m count as much as 0 m.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import xarray as xr

from configs.config import (DEPTHS, INPUT_VARS, INTERIM, MIN_VALID_FRAC,
                            PATCH, PROCESSED, TEST_YEARS, TRAIN_YEARS,
                            VAL_YEARS)

# How many patches to draw per day. Keeps the sample count comparable to the
# old fixed-grid version so memory and epoch time do not change.
PATCHES_PER_DAY = 34

ds = xr.open_zarr(INTERIM / "oceanembed.zarr")
STATIC = ds["static_mask"].values.astype(bool)
NY, NX = STATIC.shape


def all_valid_origins():
    """Every top-left corner whose patch has enough valid ocean.

    Stride 1, so this is the full set of candidates rather than a coarse
    grid. Uses a summed-area table: the naive version would slice and mean
    ~50,000 patches, which is slow enough to notice.
    """
    ii = np.cumsum(np.cumsum(STATIC.astype(np.int32), axis=0), axis=1)
    ii = np.pad(ii, ((1, 0), (1, 0)))

    out = []
    area = PATCH * PATCH
    for i in range(NY - PATCH + 1):
        for j in range(NX - PATCH + 1):
            total = (ii[i + PATCH, j + PATCH] - ii[i, j + PATCH]
                     - ii[i + PATCH, j] + ii[i, j])
            if total / area >= MIN_VALID_FRAC:
                out.append((i, j))
    return out


ORIGINS = all_valid_origins()
print(f"{len(ORIGINS)} distinct patch positions pass the "
      f"{MIN_VALID_FRAC:.0%} ocean test  (stride 1)")
if len(ORIGINS) < PATCHES_PER_DAY:
    raise SystemExit(f"only {len(ORIGINS)} valid positions; lower "
                     f"MIN_VALID_FRAC or PATCHES_PER_DAY")


def days_for(years):
    t = ds.time.dt.year.isin(years)
    return np.where(t.values)[0]


def build(years, name, seed):
    """One split. Returns arrays plus the (day, i, j) index of every sample.

    seed is fixed per split, so val and test are reproducible across runs.
    """
    rng = np.random.default_rng(seed)
    idx = days_for(years)
    n_total = len(idx) * PATCHES_PER_DAY
    print(f"\n{name}: {len(idx)} days x {PATCHES_PER_DAY} random positions "
          f"= {n_total} samples")

    X = np.empty((n_total, len(INPUT_VARS), PATCH, PATCH), np.float32)
    Y = np.empty((n_total, len(DEPTHS), PATCH, PATCH), np.float32)
    M = np.empty((n_total, PATCH, PATCH), np.float32)
    meta = np.empty((n_total, 3), np.int32)

    n = 0
    for k, t in enumerate(idx):
        day_in = np.stack([ds[v].isel(time=t).values for v in INPUT_VARS])
        day_tg = ds["thetao"].isel(time=t).values
        day_mk = ds["daily_mask"].isel(time=t).values

        picks = rng.choice(len(ORIGINS), PATCHES_PER_DAY, replace=False)
        for p in picks:
            i, j = ORIGINS[p]
            X[n] = day_in[:, i:i+PATCH, j:j+PATCH]
            Y[n] = day_tg[:, i:i+PATCH, j:j+PATCH]
            M[n] = day_mk[i:i+PATCH, j:j+PATCH]
            meta[n] = (t, i, j)
            n += 1

        if k % 200 == 0:
            print(f"  day {k}/{len(idx)}", flush=True)

    coverage = len(set(map(tuple, meta[:, 1:]))) / len(ORIGINS)
    print(f"  covered {coverage:.0%} of available positions")
    return X, Y, M, meta


def train_stats(X, Y, M):
    """Mean/std over valid cells only, training split only."""
    m = M[:, None] > 0

    xm = np.nanmean(np.where(m, X, np.nan), axis=(0, 2, 3), keepdims=True)
    xs = np.nanstd(np.where(m, X, np.nan), axis=(0, 2, 3), keepdims=True)

    my = np.broadcast_to(m, Y.shape)
    ym = np.nanmean(np.where(my, Y, np.nan), axis=(0, 2, 3), keepdims=True)
    ys = np.nanstd(np.where(my, Y, np.nan), axis=(0, 2, 3), keepdims=True)

    return xm, np.maximum(xs, 1e-6), ym, np.maximum(ys, 1e-6)


if __name__ == "__main__":
    # Different seeds per split so the patch draws are independent; fixed
    # values so every rebuild produces the same val and test sets.
    Xtr, Ytr, Mtr, meta_tr = build(TRAIN_YEARS, "train", seed=0)
    Xva, Yva, Mva, meta_va = build(VAL_YEARS, "val", seed=1)
    Xte, Yte, Mte, meta_te = build(TEST_YEARS, "test", seed=2)

    xm, xs, ym, ys = train_stats(Xtr, Ytr, Mtr)
    print("\nper-depth target std (physical spread at each level, deg C):")
    for d, s in zip(DEPTHS, ys.ravel()):
        print(f"  {d:>5} m   {s:.3f}")
    print("  the peak near 100 m is the thermocline -- that is where a small "
          "\n  vertical shift produces the largest temperature change, so it "
          "\n  is both the hardest depth to predict and the most informative.")

    def norm(X, Y):
        # inputs: NaN -> 0 AFTER scaling, so zero means "the mean", harmless.
        # targets: NaNs KEPT -- the masked loss handles them, and filling them
        # would teach the model to predict fabricated values.
        return np.nan_to_num((X - xm) / xs), (Y - ym) / ys

    for nm, (X, Y, M, mt) in {
        "train": (Xtr, Ytr, Mtr, meta_tr),
        "val":   (Xva, Yva, Mva, meta_va),
        "test":  (Xte, Yte, Mte, meta_te),
    }.items():
        d = PROCESSED / nm
        d.mkdir(parents=True, exist_ok=True)
        Xn, Yn = norm(X, Y)
        np.save(d / "X.npy", Xn)
        np.save(d / "Y.npy", Yn)
        np.save(d / "mask.npy", M)
        np.save(d / "meta.npy", mt)      # (day, i, j) -- needed for map plots
        print(f"{nm}: {Xn.shape}")

    np.savez(PROCESSED / "norm_stats.npz", x_mean=xm, x_std=xs,
             y_mean=ym, y_std=ys)
    print(f"\nstats -> {PROCESSED / 'norm_stats.npz'}")
    print("y_std is what converts normalised RMSE back to degrees C.")