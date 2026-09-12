# OceanEmbed

Satellite Embedding-Based Deep Learning Framework for Reconstruction of
Subsurface Ocean Temperature from Surface Satellite Observations.

**Smart India Hackathon - Problem Statement #26066 (Ministry of Earth Sciences)**

Given seven daily surface satellite measurements over the North Indian
Ocean, reconstruct temperature at 15 standard depths from 0 to 1000 m.

---

## Results

Validated on a held-out year (2022) never seen during training, and
independently against 623 real ARGO float profiles.

| Baseline | RMSE (normalised) | Skill vs climatology |
|---|---|---|
| Climatology | 0.992 | +0.0% |
| SST-only linear | 0.801 | +19.2% |
| **OceanEmbed (compact)** | **0.399** | **+59.7%** |

| Validation | Correlation | RMSE | Bias | n |
|---|---|---|---|---|
| vs GLORYS (held-out year) | 0.914 | 0.399 (norm.) | −0.007 | 12,410 patches |
| vs real ARGO floats | **0.987** | **1.177 °C** | +0.070 °C | 8,486 depth samples, 623 profiles |

**The compact embedding is genuinely compact.** A 7×32×32 input (7,168
numbers) is compressed to a 64-dimensional latent vector - 112× compression -
before reconstruction. A second architecture keeping 8,192 values at the
bottleneck (no compression) scores within 0.3% of the compact version,
indicating the surface fields have been compressed with negligible loss of
predictive information.

**The embedding encodes ocean state, not just location.** A linear
classifier can identify the monsoon season from the 64-dimensional
embedding with 66.6% accuracy, versus 33.8% from latitude/longitude alone
(34% baseline). See `results/embedding_compact.png`.

**Error is largest at the thermocline (75–125 m)** - the depth where the
vertical temperature gradient is steepest, so a small error in predicted
thermocline depth produces a large temperature error. This is the expected
physical signature of a model that has learned real structure, not an
artifact.

Full metrics: `results/metrics_compact.json`, `results/argo_validation_compact.json`

---

## Architecture

```
Surface patch [7, 32, 32]
        │
        ▼
   Conv encoder (3 blocks, pooling)
        │
        ▼
   Global average pool → Linear
        │
        ▼
   Latent embedding [64]   ← the "satellite embedding"
        │
        ▼
   Linear → Conv decoder (3 blocks, upsampling)
        │
        ▼
Temperature [15, 32, 32]   (0–1000 m, 15 standard depths)
```

Two variants are implemented and compared (`src/models/nets.py`):

- **`compact`** - 64-dim bottleneck, 112× compression. Primary model.
- **`spatial`** - 8×8×128 spatial bottleneck, no compression. Comparison
  baseline, used to test whether the compact model's capacity is limiting.

Loss: masked MSE (only valid ocean cells contribute) plus a stratification
penalty discouraging unphysical temperature inversions below the mixed
layer. Targets are normalised **per depth**, which is necessary because
temperature variance at 1000 m is far smaller than at the surface - without
this, an unweighted loss causes the model to ignore deep levels entirely.

---

## Data

| Variable | Source | Role |
|---|---|---|
| Sea surface temperature | NOAA/CMEMS reprocessed L4 | Input |
| Sea surface salinity | CMEMS multi-observation L4 | Input |
| Sea level anomaly + geostrophic currents (u, v) | CMEMS DUACS altimetry | Input ×3 |
| 10 m wind (u, v) | ERA5 | Input ×2 |
| Subsurface temperature | GLORYS12V1 reanalysis | **Target** |
| Independent validation | ARGO floats (Coriolis GDAC, delayed-mode) | Validation |

**Period:** 2010–2022 (13 years). Train 2010–2020, validation 2021, test 2022
- whole-year splits, so the test year is a season the model never saw.

**Domain:** 5°N–30°N, 45°E–105°E (North Indian Ocean), 0.25° resolution,
101 × 241 grid.

**Known limitation, disclosed rather than hidden:** GLORYS assimilates ARGO
observations. Validating a GLORYS-trained model against ARGO from the same
general period is therefore not fully independent - strong agreement partly
reflects the model reproducing the assimilated state rather than purely
generalising beyond it. The model uses no ARGO data directly (only
satellite surface fields), and a genuinely broken embedding would still
fail this test, so it remains meaningful evidence - just not a fully
independent one. Stated explicitly here and in the results output.

---

## Repository structure

```
oceanembed/
├── configs/
│   └── config.py              region, dates, depths, model hyperparameters
├── src/
│   ├── data/                  download, verify, and process raw sources
│   ├── models/
│   │   └── nets.py            compact / spatial / baseline architectures
│   ├── training/
│   │   └── train.py           masked-loss training loop
│   └── evaluation/
│       ├── evaluate.py        baselines, per-depth, per-basin metrics
│       ├── embedding.py       latent-space analysis (season classifier)
│       ├── export_netcdf.py   full-grid CF-compliant NetCDF export
│       ├── download_argo.py   ARGO profile download (Coriolis ERDDAP)
│       ├── validate_argo.py   matchup against independent observations
│       └── predict_api.py     inference functions for the web API
├── api/
│   └── main.py                FastAPI service (profile / map / stats)
├── models/
│   └── compact_best.pt        trained weights
└── results/
    ├── oceanembed_compact_reconstruction.nc   sample output (CF NetCDF)
    ├── metrics_compact.json
    ├── argo_validation_compact.json
    └── embedding_compact.png
```

`data/raw/`, `data/interim/`, `data/processed/` are **not** included in this
repository (see Data above for sources; regenerating requires ~20 GB of
downloads and a Zarr store).

---

## Running it

### Reproduce the pipeline (requires downloading ~20 GB of source data)

```bash
pip install -r requirements.txt
copernicusmarine login          # for CMEMS sources

python -m src.data.download_all --source glorys --years 2010 2011 ... 2022
python -m src.data.download_all --source sla --years ...
python -m src.data.download_all --source sst --years ...
python -m src.data.download_all --source sss --years ...
python -m src.data.download_wind --years ...

python -m src.data.verify_raw          # must pass before processing
python -m src.data.process_all         # → data/interim/oceanembed.zarr
python -m src.data.build_samples       # → data/processed/{train,val,test}
```

### Train

```bash
python -m src.training.train --model compact
python -m src.training.train --model spatial      # comparison
```

### Evaluate

```bash
python -m src.evaluation.evaluate --model compact
python -m src.evaluation.embedding --model compact
python -m src.evaluation.export_netcdf --model compact --days 365
python -m src.evaluation.download_argo
python -m src.evaluation.validate_argo --model compact
```

### Serve the API (for the dashboard)

```bash
pip install fastapi uvicorn
uvicorn api.main:app --reload
```

Then visit `http://localhost:8000/docs` for an interactive test page.

**Requires `data/interim/oceanembed.zarr` (~20 GB) on local disk** - this
process cannot run on a static host or serverless function. The model and
data store load once at first request and stay resident in memory.

| Endpoint | Purpose |
|---|---|
| `GET /domain` | Valid lat/lon/date ranges |
| `GET /profile?lat=&lon=&date=` | Full 15-depth temperature profile at a point |
| `GET /map?date=&depth=` | Full-grid temperature field at one depth/day |
| `GET /stats` | Accuracy and validation numbers, for dashboard cards |

---

## For the frontend/dashboard team

The fastest path to a working visualisation needs **no live API**:

```python
import xarray as xr
ds = xr.open_dataset("results/oceanembed_compact_reconstruction.nc")
# ds.thetao: (time, depth, latitude, longitude), degrees C
# NaN = land or insufficient data - treat as masked/transparent
```

Build a map (colour by `thetao`), a depth selector (`ds.depth.values`), and
a day slider (`ds.time.values`) against this file first. Layer in the live
`/profile` and `/map` API endpoints afterward for click-a-point
interactivity.

---

## Requirements

```
copernicusmarine>=2.0.0
cdsapi>=0.7.0
xarray>=2024.1.0
netCDF4>=1.6.5
zarr>=2.16.0
dask>=2024.1.0
numpy>=1.26
pandas>=2.0
torch>=2.2
scikit-learn>=1.4
matplotlib>=3.8
fastapi>=0.110
uvicorn>=0.29
```

---

## Team

Built for Smart India Hackathon 2026, Problem Statement #26066,
Ministry of Earth Sciences.
