#!/usr/bin/env python
"""
Download ARGO profiles for validation.

    python -m src.evaluation.download_argo

Pulls delayed-mode, QC-flagged profiles from the Coriolis GDAC ERDDAP, for
the TEST_YEARS only (2022), inside the study domain.

WHY DELAYED MODE ONLY
    Real-time ARGO has known salinity drift and pressure bias that has not
    yet been corrected. Delayed mode ('D') has been through the full quality
    control pipeline. Validating against uncorrected data would make error
    bars look wrong in ways that are hard to explain in a presentation.

WHY THIS MATTERS AND WHY IT IS ALSO A LIMITATION
    ARGO is the "independent observations" the problem statement asks for.
    But GLORYS -- our training target -- ASSIMILATES ARGO. So validating a
    GLORYS-trained model against ARGO from the same period is not fully
    independent: some of what looks like model skill is really "the model
    learned to reproduce the reanalysis, and the reanalysis was partly built
    from these same floats". This is disclosed explicitly in the evaluation
    report, not hidden.
"""

import sys
import urllib.parse
import urllib.request
from pathlib import Path
import socket
socket.setdefaulttimeout(90)

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from configs.config import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, RESULTS, TEST_YEARS

OUT = RESULTS / "argo"
OUT.mkdir(parents=True, exist_ok=True)

ERDDAP = "https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.csv"

FIELDS = [
    "platform_number", "cycle_number", "time",
    "latitude", "longitude",
    "pres_adjusted", "temp_adjusted", "psal_adjusted",
    "pres_adjusted_qc", "temp_adjusted_qc",
    "data_mode",
]


def fetch_year(year: int, out_path: Path) -> None:
    constraints = [
        f"longitude>={LON_MIN}", f"longitude<={LON_MAX}",
        f"latitude>={LAT_MIN}",  f"latitude<={LAT_MAX}",
        f"time>={year}-01-01T00:00:00Z",
        f"time<={year}-12-31T23:59:59Z",
        "pres_adjusted<=1100",
        'data_mode="D"',
        'temp_adjusted_qc=~"[12]"',
    ]
    query = urllib.parse.quote(",".join(FIELDS), safe=",") + "&" + "&".join(
        urllib.parse.quote(c, safe="") for c in constraints)
    url = f"{ERDDAP}?{query}"
    print(f"  URL: {url[:100]}...")
    print(f"  querying ERDDAP for {year} ...", flush=True)

    import time
    t0 = time.time()
    urllib.request.urlretrieve(url, out_path)
    print(f"  took {time.time()-t0:.0f}s")


def summarise(path: Path) -> None:
    import pandas as pd

    df = pd.read_csv(path, skiprows=[1], low_memory=False)
    n_profiles = df.groupby(["platform_number", "cycle_number"]).ngroups
    n_rows = len(df)
    lon_split = 78.0
    arb = (df.longitude < lon_split).sum()
    bob = (df.longitude >= lon_split).sum()

    print(f"\n  {n_profiles} profiles, {n_rows} depth samples")
    print(f"  Arabian Sea rows  : {arb}")
    print(f"  Bay of Bengal rows: {bob}")
    if n_profiles < 20:
        print("  WARNING: very few profiles. Validation will have wide "
              "confidence intervals -- report the count honestly.")


if __name__ == "__main__":
    for year in TEST_YEARS:
        out = OUT / f"argo_{year}.csv"
        if out.exists() and out.stat().st_size > 1000:
            print(f"[{year}] already present -- skip")
        else:
            try:
                fetch_year(year, out)
                print(f"[{year}] done -- {out.stat().st_size/1e3:.0f} KB")
            except Exception as exc:
                print(f"[{year}] FAILED: {exc}")
                if out.exists():
                    out.unlink()
                continue
        summarise(out)