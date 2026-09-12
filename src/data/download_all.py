#!/usr/bin/env python
"""
Download every CMEMS source, one file per year, resumable.

    python -m src.data.download_all --source glorys
    python -m src.data.download_all --source all
    python -m src.data.download_all --source glorys --years 2017 2019
    python -m src.data.download_all --source glorys --dry-run

Why year-by-year instead of one call:
    A single eight-year GLORYS request times out or dies halfway, and you
    restart from zero. Per-year files resume for free, can be split across
    machines, and xarray.open_mfdataset opens them lazily as one dataset.

Order matters. GLORYS is ~10 GB and runs for days. Start it first, in tmux,
then walk away and do everything else while it downloads.
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from configs.config import (CMEMS, DL_LAT, DL_LON, MAX_DEPTH_DOWNLOAD, RAW,
                            START_YEAR, END_YEAR)


def already_done(path: Path, min_mb: float = 0.1) -> bool:
    """Exists AND is plausibly complete.

    The size floor matters: an interrupted download leaves a small truncated
    file behind. Without this check the next run happily skips it and you
    debug a corrupt NetCDF three weeks later.
    """
    return path.exists() and path.stat().st_size > min_mb * 1e6


def fetch_year(source: str, year: int, out: Path, retries: int = 4) -> None:
    import copernicusmarine as cm

    meta = CMEMS[source]
    kw = dict(
        dataset_id=meta["dataset_id"],
        variables=meta["variables"],
        minimum_latitude=DL_LAT[0], maximum_latitude=DL_LAT[1],
        minimum_longitude=DL_LON[0], maximum_longitude=DL_LON[1],
        start_datetime=f"{year}-01-01T00:00:00",
        end_datetime=f"{year}-12-31T23:59:59",
        output_filename=out.name,
        output_directory=str(out.parent),
    )
    if source == "glorys":
        kw["minimum_depth"] = 0.0
        kw["maximum_depth"] = MAX_DEPTH_DOWNLOAD

    wait = 60
    for attempt in range(1, retries + 1):
        try:
            cm.subset(**kw)
            return
        except Exception as exc:
            if out.exists():
                out.unlink()                    # drop the truncated file
            if attempt == retries:
                raise
            print(f"    attempt {attempt} failed ({exc}); retry in {wait}s")
            time.sleep(wait)
            wait *= 2


def run(source: str, years, dry: bool) -> None:
    meta = CMEMS[source]
    outdir = RAW / source
    outdir.mkdir(parents=True, exist_ok=True)

    print("=" * 66)
    print(f"{source.upper()}   {meta['dataset_id']}")
    print(f"  vars {meta['variables']}   doi {meta['doi']}")
    print(f"  {meta['note']}")
    print("=" * 66)

    failed = []
    for y in years:
        out = outdir / f"{source}_{y}.nc"
        if already_done(out):
            print(f"  [{y}] present ({out.stat().st_size/1e6:.0f} MB) — skip")
            continue
        if dry:
            print(f"  [{y}] DRY RUN → {out.name}")
            continue
        try:
            print(f"  [{y}] downloading ...", flush=True)
            fetch_year(source, y, out)
            print(f"  [{y}] done  {out.stat().st_size/1e6:.0f} MB")
        except Exception as exc:
            print(f"  [{y}] FAILED: {exc}")
            failed.append(y)

    if failed:
        print(f"\n  re-run: --source {source} --years {' '.join(map(str, failed))}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, choices=list(CMEMS) + ["all"])
    ap.add_argument("--years", nargs="+", type=int)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    years = a.years or list(range(START_YEAR, END_YEAR + 1))
    sources = list(CMEMS) if a.source == "all" else [a.source]
    sources.sort(key=lambda s: 0 if s == "glorys" else 1)   # target first

    for s in sources:
        run(s, years, a.dry_run)
