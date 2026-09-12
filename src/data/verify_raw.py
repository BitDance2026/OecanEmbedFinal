#!/usr/bin/env python
"""
Run this AFTER merging all three people's downloads into one data/raw/.

    python -m src.data.verify_raw

Checks for the failures that otherwise surface during training, days later:

  * a missing year, which would silently create a gap in the time series
  * a truncated file from an interrupted download
  * a file that will not open at all
  * wrong grid spacing
  * an all-NaN variable
  * GLORYS not reaching 1000 m, which makes the deepest level impossible

Nothing downstream should run until this exits 0.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np

from configs.config import CMEMS, DEPTHS, END_YEAR, RAW, START_YEAR

WANT = list(range(START_YEAR, END_YEAR + 1))
ok_all = True


def years_present(src):
    d = RAW / src
    if not d.exists():
        return [], 0.0
    if src == "wind":
        # rglob, not glob: different team members produced different layouts.
        # Some have year/month/*.nc (month-by-month download), others have
        # year/*.nc (whole-year download). Both are valid; recursing finds
        # files at either depth.
        ys = sorted(int(p.name) for p in d.glob("[0-9]*")
                    if p.is_dir() and any(p.rglob("*.nc")))
    else:
        ys = sorted(int(f.stem.split("_")[-1]) for f in d.glob("*.nc"))
    size = sum(f.stat().st_size for f in d.rglob("*.nc")) / 1e9
    return ys, size


def check_source(src):
    global ok_all
    ys, size = years_present(src)
    miss = sorted(set(WANT) - set(ys))
    print(f"\n{src.upper():<10}{len(ys)}/{len(WANT)} years   {size:.1f} GB")
    if miss:
        print(f"  MISSING YEARS: {miss}")
        ok_all = False
        return False
    print("  all years present")
    return True


def check_truncated(src, floor_mb=1.0):
    """An interrupted download leaves a small file that opens without error."""
    global ok_all
    d = RAW / src
    small = [f.name for f in d.rglob("*.nc")
             if f.stat().st_size < floor_mb * 1e6]
    if small:
        print(f"  SUSPICIOUSLY SMALL (likely truncated): {small[:8]}"
              f"{' ...' if len(small) > 8 else ''}  [{len(small)} files]")
        ok_all = False


def check_openable(src, sample=None):
    """Try to open every file.

    A file can be the right size, have the right name, and still be
    unopenable -- for example an undownloaded zip that was renamed .nc, or a
    transfer that finished but corrupted. process_all would hit this hours
    into a multi-hour run, so it is much cheaper to find it here.
    """
    global ok_all
    import xarray as xr

    files = sorted((RAW / src).rglob("*.nc"))
    if sample:
        files = files[::max(1, len(files) // sample)]

    bad = []
    for f in files:
        try:
            xr.open_dataset(f).close()
        except Exception:
            bad.append(f)

    if bad:
        ok_all = False
        print(f"  UNREADABLE: {len(bad)} of {len(files)} files")
        for f in bad[:5]:
            head = open(f, "rb").read(4)
            hint = ""
            if head[:2] == b"PK":
                hint = "  <- this is a ZIP, not a NetCDF. Extract it."
            elif head[:3] != b"CDF" and head[1:4] != b"HDF":
                hint = "  <- corrupt or truncated. Re-download."
            print(f"    {f.relative_to(RAW)}{hint}")
        if len(bad) > 5:
            print(f"    ... and {len(bad) - 5} more")
    else:
        print(f"  all {len(files)} files open cleanly")


def inspect(src):
    """Open the newest file and sanity-check the contents."""
    global ok_all
    import xarray as xr

    files = sorted((RAW / src).rglob("*.nc"))
    if not files:
        return
    try:
        ds = xr.open_dataset(files[-1])
    except Exception as exc:
        print(f"  CANNOT OPEN {files[-1].name}: {exc}")
        ok_all = False
        return

    print(f"  dims {dict(ds.sizes)}")

    for c in ("latitude", "lat"):
        if c in ds.coords and ds[c].size > 1:
            step = float(np.abs(np.diff(ds[c].values)).mean())
            note = ("  (already 0.25)" if abs(step - 0.25) < 0.01
                    else "  (needs regridding — expected)")
            print(f"  grid spacing {step:.4f} deg{note}")
            break

    for v in ds.data_vars:
        arr = ds[v]
        sl = {d: 0 for d in arr.dims if d not in ("latitude", "longitude",
                                                  "lat", "lon")}
        vals = arr.isel(sl).values.astype("float64")
        nan = float(np.isnan(vals).mean())
        if nan > 0.99:
            print(f"  {v:<16} ALL NaN — download is bad")
            ok_all = False
        else:
            f = vals[np.isfinite(vals)]
            print(f"  {v:<16} nan {100*nan:4.1f}%   "
                  f"range {f.min():.2f} .. {f.max():.2f}")

    if src == "glorys" and "depth" in ds.coords:
        dmax = float(ds.depth.max())
        print(f"  depth levels {ds.depth.size}, max {dmax:.0f} m")
        if dmax < max(DEPTHS):
            print(f"  DEPTH TOO SHALLOW — target needs {max(DEPTHS)} m, "
                  f"file reaches {dmax:.0f} m. The deepest level would be "
                  f"extrapolated, not interpolated.")
            ok_all = False
    ds.close()


def main():
    print("=" * 60)
    print(f"OceanEmbed raw data check   {START_YEAR}-{END_YEAR}")
    print("=" * 60)

    for src in list(CMEMS) + ["wind"]:
        if check_source(src):
            check_truncated(src)
            # wind is many small files, so check them all; the CMEMS sources
            # are a handful of large files, so sample rather than open 13
            # multi-GB files just to prove they are readable.
            check_openable(src, sample=None if src == "wind" else 4)
            inspect(src)

    print("\n" + "=" * 60)
    if ok_all:
        print("PASSED — run process_all next")
    else:
        print("PROBLEMS FOUND — fix before processing")
        print("  missing years : python -m src.data.download_all "
              "--source <src> --years <years>")
        print("  missing wind  : python -m src.data.download_wind "
              "--years <years>")
        print("  ZIP files     : extract them in place, then re-run")
    print("=" * 60)
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()