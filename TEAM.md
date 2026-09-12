# OceanEmbed — data collection

## Who does what

| Person | Years | Command |
|---|---|---|
| **A** | 2010–2013 | `python -m src.data.get_my_years --person A` |
| **B** | 2014–2017 | `python -m src.data.get_my_years --person B` |
| **C** | 2018–2022 | `python -m src.data.get_my_years --person C` |

C gets 5 years because 2021 is validation and 2022 is test — those must survive.

---

## Setup (everyone, once)

```bash
pip install -r requirements.txt
copernicusmarine login
```

For wind, get a CDS account at https://cds.climate.copernicus.eu and put your
key in `~/.cdsapirc`.

**Need ~10 GB free disk each.**

---

## Step 1 — check the dates exist (2 minutes, do this first)

```bash
copernicusmarine describe -i cmems_mod_glo_phy_my_0.083deg_P1D-m
copernicusmarine describe -i cmems_obs-mob_glo_phy-sss_my_multi_P1D
```

Report the start and end dates. If any source doesn't cover your years, say so
**before** downloading — two minutes now saves a wasted day.

## Step 2 — download

```bash
tmux new -s ocean
python -m src.data.get_my_years --person A
```

Then detach (`Ctrl-b d`) and leave it. Takes 1–2 days, mostly GLORYS.

**If it dies, run the exact same command again.** Finished years are skipped,
so you resume for free. Never delete and restart.

## Step 3 — verify

```bash
python -m src.data.get_my_years --person A --check
```

Must say COMPLETE. If years are missing, re-run step 2.

## Step 4 — send

Upload your `data/raw/` folder to the shared Drive. Filenames are unique per
year (`glorys_2010.nc` etc.) so all three merge without collisions.

---

## What you're downloading

| source | what | ~size/yr |
|---|---|---|
| glorys | subsurface temperature — **the target** | 1.3 GB |
| sla | sea level + currents (3 channels, one file) | 0.12 GB |
| sst | sea surface temperature | 0.25 GB |
| sss | sea surface salinity | 0.06 GB |
| wind | 10 m wind U/V | 0.2 GB |

**GLORYS is 80% of the bytes and runs first.** Don't reorder it.

---

## Rules

1. Never edit `configs/config.py`. One person owns it.
2. Never delete a partial download — re-run and it resumes.
3. Don't rename files. The year suffix is how they merge.
4. Report the step-1 dates before starting step 2.
