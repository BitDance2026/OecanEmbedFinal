#!/usr/bin/env python
"""
ONE COMMAND PER PERSON. Downloads every source for your assigned years.

    python -m src.data.get_my_years --person A
    python -m src.data.get_my_years --person B
    python -m src.data.get_my_years --person C

    python -m src.data.get_my_years --person A --check     # verify only
    python -m src.data.get_my_years --person A --dry-run   # plan only

Run it in tmux and walk away. It takes 1-2 days, mostly GLORYS.
If it dies, run the exact same command again -- finished years are skipped.

WHAT EACH PERSON GETS
    A: 2010, 2011, 2012, 2013
    B: 2014, 2015, 2016, 2017
    C: 2018, 2019, 2020, 2021, 2022     <- 5 years, includes val + test

C takes the extra year on purpose. 2021 is validation and 2022 is test, so if
anything slips those must be the years that survive.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from configs.config import CMEMS, RAW

ASSIGNMENTS = {
    "A": [2010, 2011, 2012, 2013],
    "B": [2014, 2015, 2016, 2017],
    "C": [2018, 2019, 2020, 2021, 2022],
}

# GLORYS first: it is the target, it is ~10x everything else, and nothing
# downstream can start without it.
ORDER = ["glorys", "sla", "sst", "sss"]


def run(cmd):
    print(f"\n$ {' '.join(cmd)}", flush=True)
    return subprocess.call(cmd)


def check(years):
    """What is on disk vs what should be. Run this before reporting done."""
    print("\n" + "=" * 58)
    print(f"{'source':<10}{'have':<8}{'size':<12}missing")
    print("-" * 58)
    ok = True
    for src in ORDER + ["wind"]:
        d = RAW / src
        if src == "wind":
            have = sorted(int(p.name) for p in d.glob("[0-9]*")
                          if p.is_dir() and any(p.glob("*.nc")))
            size = sum(f.stat().st_size for f in d.rglob("*.nc")) / 1e9
        else:
            files = list(d.glob("*.nc")) if d.exists() else []
            have = sorted(int(f.stem.split("_")[-1]) for f in files)
            size = sum(f.stat().st_size for f in files) / 1e9
        miss = sorted(set(years) - set(have))
        if miss:
            ok = False
        print(f"{src:<10}{len(have):<8}{size:>6.1f} GB   "
              f"{miss if miss else 'none'}")
    print("=" * 58)
    print("COMPLETE — send data/raw/ to the team lead" if ok
          else "INCOMPLETE — re-run the same command, finished years are skipped")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--person", required=True, choices=list(ASSIGNMENTS))
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    years = ASSIGNMENTS[a.person]
    ystr = [str(y) for y in years]

    if a.check:
        sys.exit(0 if check(years) else 1)

    print("=" * 58)
    print(f"PERSON {a.person}   years {years[0]}-{years[-1]}")
    print(f"expect ~{sum(m['gb_per_year'] for m in CMEMS.values())*len(years)+0.2*len(years):.0f} GB, 1-2 days")
    print("=" * 58)

    t0 = time.time()
    for src in ORDER:
        cmd = [sys.executable, "-m", "src.data.download_all",
               "--source", src, "--years", *ystr]
        if a.dry_run:
            cmd.append("--dry-run")
        run(cmd)

    cmd = [sys.executable, "-m", "src.data.download_wind", "--years", *ystr]
    run(cmd)

    print(f"\ntotal {(time.time()-t0)/3600:.1f} h")
    if not a.dry_run:
        check(years)


if __name__ == "__main__":
    main()
