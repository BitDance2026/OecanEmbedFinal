# OceanEmbed — run order

## 0. Setup
```bash
pip install -r requirements.txt
copernicusmarine login
# CDS key -> ~/.cdsapirc   (https://cds.climate.copernicus.eu)
```

**Verify the date range before downloading anything:**
```bash
copernicusmarine describe -i cmems_mod_glo_phy_my_0.083deg_P1D-m
copernicusmarine describe -i METOFFICE-GLO-SST-L4-REP-OBS-SST
copernicusmarine describe -i cmems_obs-mob_glo_phy-sss_my_multi_P1D
```
Your usable range is the **earliest end date** among all four sources.
Config assumes 2013–2022; adjust `configs/config.py` if these disagree.

## 1. Download — parallel, GLORYS first
```bash
python -m src.data.download_all --source glorys   # ~13 GB, DAYS. tmux it.
python -m src.data.download_all --source sla      # 3 channels, one file
python -m src.data.download_all --source sst
python -m src.data.download_all --source sss
python -m src.data.download_wind
```
Resumable. Re-running skips completed years for free.

## 2. Process → one Zarr store
```bash
python -m src.data.process_all
```

## 3. Build samples
```bash
python -m src.data.build_samples
```

## 4. Train
```bash
python -m src.training.train --model baseline   # for comparison
python -m src.training.train --model spatial
python -m src.training.train --model compact    # the real deliverable
```

## 5. Evaluate
```bash
python -m src.evaluation.evaluate --model compact
python -m src.evaluation.embedding --model compact
```

---

## Expected sizes (10 years)
| source | size |
|---|---|
| glorys | ~13 GB |
| sst | ~2.5 GB |
| wind | ~2 GB |
| sla | ~1.2 GB |
| sss | ~0.6 GB |
| **raw** | **~19 GB** |
| zarr | ~10 GB |
| samples | ~15 GB |

Budget **50 GB free disk**.

## What changed from the 30-day prototype

| | before | now | why |
|---|---|---|---|
| period | 30 days | 2013–2022 | test was 5 days after training — same ocean |
| split | day ranges in Jan | whole years | test year is a season never seen |
| patch | 9×9 (~225 km) | 32×32 (~800 km) | eddies are bigger; room for a bottleneck |
| min valid | 0.80 | 0.50 | 32×32 clips coast; 0.80 discards coastal physics |
| mask | static, 100% of days | static ≥90% + daily | one cloudy day in 2017 shouldn't kill a cell forever |
| store | NetCDF | Zarr | 10 GB won't fit in memory |
| model | 4 conv layers | encoder–decoder | PS requires an embedding engine |
| latent | none | 64-dim (112×) | "compact" must survive arithmetic |
| loss | masked MSE | + stratification penalty | stops unphysical inversions |
| metrics | RMSE | RMSE + bias + corr, per depth & basin | PS asks for all three |

## Rules
1. Region, dates, patch size live in `configs/config.py` only.
2. Normalisation stats from **train years only**. Never all years.
3. Input NaN → 0 after scaling. Target NaN → kept; masked loss handles it.
4. Don't remove the GLORYS depth cap — uncapped it's 100+ GB.
5. Never `nn.MSELoss()` directly on targets — they contain NaNs.
6. Select the best model on **val**, not test.

## Still to do
- **ARGO validation.** Required by the PS and not started. Needs INCOIS gridded ARGO or raw Coriolis profiles matched to predicted cells. Note the circularity: GLORYS assimilates ARGO, so hold out whole years and say so.
- **Full-grid NetCDF export.** PS wants a daily 3D field over the whole domain; you currently predict patches. Stitch and export.
- **Dashboard** — map + depth slider + click-for-profile.

---

## After all three people send their data

```bash
# merge everything into one data/raw/, then:
python -m src.data.verify_raw      # must exit 0 — checks for gap years
python -m src.data.process_all
python -m src.data.build_samples
```
