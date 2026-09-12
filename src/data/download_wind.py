#!/usr/bin/env python
"""
ERA5 10 m wind, one request per year.

    pip install cdsapi
    # then put your key in ~/.cdsapirc — see https://cds.climate.copernicus.eu

    python -m src.data.download_wind
    python -m src.data.download_wind --years 2018

ERA5 is already on a 0.25 deg grid, so wind needs cropping only — no
interpolation. That is why it was the one variable with full coverage of the
grid in the 30-day run.

Two ERA5 quirks the processing step has to handle:
  * the time coordinate is called `valid_time`, not `time`
  * latitude runs DESCENDING (north to south)
"""

import argparse
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from configs.config import DL_LAT, DL_LON, ERA5, RAW, START_YEAR, END_YEAR

OUT = RAW / "wind"
OUT.mkdir(parents=True, exist_ok=True)


def fetch(year: int) -> None:
    import cdsapi

    ydir = OUT / str(year)
    ydir.mkdir(parents=True, exist_ok=True)

    c = cdsapi.Client()
    for m in range(1, 13):
        mdir = ydir / f"{m:02d}"
        if mdir.exists() and list(mdir.glob("*.nc")):
            print(f"  [{year}-{m:02d}] present — skip")
            continue

        zip_path = OUT / f"wind_{year}_{m:02d}.zip"
        print(f"  [{year}-{m:02d}] requesting ...", flush=True)
        c.retrieve(ERA5["dataset"], {
            "product_type": "reanalysis",
            "variable": ERA5["variables"],
            "year": str(year),
            "month": [f"{m:02d}"],
            "day": [f"{d:02d}" for d in range(1, 32)],
            "daily_statistic": "daily_mean",
            "time_zone": "utc+00:00",
            "frequency": "1_hourly",
            "area": [DL_LAT[1], DL_LON[0], DL_LAT[0], DL_LON[1]],
        }, str(zip_path))

        mdir.mkdir(exist_ok=True)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(mdir)
        zip_path.unlink()
        print(f"  [{year}-{m:02d}] done")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="+", type=int)
    a = ap.parse_args()

    for y in (a.years or range(START_YEAR, END_YEAR + 1)):
        print(f"[{y}] requesting ...", flush=True)
        try:
            fetch(y)
        except Exception as exc:
            print(f"  [{y}] FAILED: {exc}")
