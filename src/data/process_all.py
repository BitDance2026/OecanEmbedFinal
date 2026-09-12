#!/usr/bin/env python
"""
Process every raw source onto the common grid and write one Zarr store.

    python -m src.data.process_all

Replaces the six separate process_*.py scripts. Same logic, one file, and it
handles multi-year volumes that will not fit in memory as NetCDF.

WHY ZARR INSTEAD OF NETCDF
    Thirteen years of target data is several GB. A single NetCDF must be read
    whole; Zarr is chunked, so the training loader reads only the days it
    needs. Chunking on time also makes the year-based split cheap.

REGRIDDING
    Kept as linear interpolation to match the existing regrid_to_common_grid()
    (D005). Conservative remapping would be more correct for GLORYS going from
    1/12 deg down to 1/4 deg -- it averages rather than samples -- but it needs
    xesmf, which is a conda dependency. Note the choice in the report.

KNOWN LIMITATION
    GLORYS 2010-2017 was downloaded with the 0.5 deg halo (44.5-105.5) and
    2018-2022 without it (45.0-105.0). open_years() crops every file to the
    region all files share, so the halo is effectively absent everywhere.
    Boundary cells are therefore interpolated without support from outside
    the domain. The >=90% validity mask should exclude them; if the static
    cell count comes out much lower than expected, that is why.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import pandas as pd
import xarray as xr

from configs.config import (DEPTHS, INTERIM, LAT, LON, RAW, START_YEAR,
                            END_YEAR, LAT_MIN, LAT_MAX, LON_MIN, LON_MAX)


# --------------------------------------------------------------------------
def normalise_time(da):
    """Put every source on the same daily calendar.

    Two things break the date intersection later if not handled here:

      * ERA5 calls the axis `valid_time`, CMEMS calls it `time`
      * timestamps carry different times of day -- CMEMS daily means are
        often stamped 12:00, ERA5 daily statistics 00:00. np.intersect1d
        compares exact values, so 2015-06-01T12:00 and 2015-06-01T00:00 do
        NOT match and you silently lose EVERY day.

    Flooring to midnight fixes the second, which is the one that would
    otherwise produce a mystifying "aligned on 0 days".
    """
    if "valid_time" in da.dims:
        da = da.rename({"valid_time": "time"})
    if "time" in da.dims:
        da = da.assign_coords(time=da.time.dt.floor("D"))
    return da


def to_grid(da: xr.DataArray) -> xr.DataArray:
    """Interpolate onto the canonical 101 x 241 grid."""
    ren = {}
    if "lat" in da.dims:
        ren["lat"] = "latitude"
    if "lon" in da.dims:
        ren["lon"] = "longitude"
    if ren:
        da = da.rename(ren)

    da = normalise_time(da)

    # ERA5 latitude descends; interp needs ascending coordinates
    if float(da.latitude[0]) > float(da.latitude[-1]):
        da = da.sortby("latitude")

    return da.interp(latitude=LAT, longitude=LON)


def open_years(source: str, pattern: str = "*.nc") -> xr.Dataset:
    """Open one source file by file, forcing a consistent grid.

    open_mfdataset with combine="by_coords" assumes every file shares the
    same spatial grid. GLORYS does not: 2010-2017 carries the 0.5 deg halo
    and spans 44.5-105.5 at 313 x 733, while 2018-2022 spans 45.0-105.0 at
    301 x 721. The union of those two longitude axes is non-monotonic, which
    is the "Resulting object does not have monotonic global indexes" error.

    Cropping every file to the region ALL files contain makes the shapes
    genuinely match, so join="override" is then safe rather than silently
    stamping one file's coordinates onto another file's differently-sized
    array -- which would misalign 2018-2022 by half a degree without any
    error at all.
    """
    files = sorted((RAW / source).glob(pattern))
    if not files:
        raise FileNotFoundError(f"no files in {RAW / source}")
    print(f"  {len(files)} files")

    parts = []
    for f in files:
        d = xr.open_dataset(f, chunks={"time": 30})
        if float(d.latitude[0]) > float(d.latitude[-1]):
            d = d.sortby("latitude")
        d = d.sortby("longitude")
        # crop to the region every file has, so shapes actually agree
        d = d.sel(latitude=slice(LAT_MIN, LAT_MAX),
                  longitude=slice(LON_MIN, LON_MAX))
        parts.append(d)

    shapes = {(p.sizes.get("latitude"), p.sizes.get("longitude"))
              for p in parts}
    if len(shapes) > 1:
        print(f"  NOTE: shapes still differ after cropping: {shapes}")
        print("  join='override' will force the first file's coordinates.")

    return xr.concat(parts, dim="time", coords="minimal",
                     compat="override", join="override")


def open_wind() -> xr.Dataset:
    """Open every wind file and select variables BY NAME, not by filename.

    The three of us downloaded wind differently. Some years are
    year/month/10m_u_component_of_wind_....nc, others are year/wind_YYYY_MM.nc
    after a re-download. Matching on "*u_component*" silently drops every file
    that does not follow that pattern -- no error, just a wind channel with
    missing years, discovered days later during training.

    So: recurse over everything, merge, and pull u10/v10 out of the result.
    """
    files = sorted((RAW / "wind").rglob("*.nc"))
    if not files:
        raise FileNotFoundError(f"no wind files under {RAW / 'wind'}")
    print(f"  {len(files)} files (any layout, any name)")

    w = xr.open_mfdataset(
        files,
        combine="by_coords",
        compat="override",      # u-only and v-only files describe the same grid
        coords="minimal",
    )
    for c in ("number", "expver"):
        if c in w.coords:
            w = w.drop_vars(c)

    missing = [v for v in ("u10", "v10") if v not in w.data_vars]
    if missing:
        raise KeyError(f"wind files are missing {missing}; "
                       f"found {list(w.data_vars)}")
    return w


# --------------------------------------------------------------------------
def process_inputs() -> xr.Dataset:
    """Seven surface channels, all on the common grid, one dataset."""
    out = {}

    print("SST  (Kelvin -> Celsius)")
    sst = open_years("sst")["analysed_sst"]
    out["sst"] = to_grid(sst - 273.15)

    print("SSS  (drop the single surface depth level)")
    sss = open_years("sss")["sos"]
    if "depth" in sss.dims:
        sss = sss.isel(depth=0, drop=True)
    out["sss"] = to_grid(sss)

    print("SLA + geostrophic currents  (one product, three channels)")
    alt = open_years("sla")
    out["sla"] = to_grid(alt["sla"])
    out["uo"] = to_grid(alt["ugos"])
    out["vo"] = to_grid(alt["vgos"])

    print("WIND  (already 0.25 deg, but on a different grid origin)")
    w = open_wind()
    out["wind_u"] = to_grid(w["u10"])
    out["wind_v"] = to_grid(w["v10"])

    ds = xr.Dataset(out)
    return ds.sel(time=slice(f"{START_YEAR}-01-01", f"{END_YEAR}-12-31"))


def process_target() -> xr.DataArray:
    """GLORYS -> 15 standard depths -> common grid."""
    print("GLORYS  (vertical interp to 15 levels, then regrid)")
    g = open_years("glorys")["thetao"]

    # Vertical first, horizontal second. Interpolating depth on the coarse
    # grid would be cheaper but mixes water masses across the regrid.
    g = g.interp(depth=DEPTHS)

    # The shallowest GLORYS level is ~0.49 m, not 0 m, so interp() returns NaN
    # at the 0 m target. bfill takes the shallowest real value instead. This
    # is an approximation and should be documented as such.
    g = g.bfill(dim="depth")

    g = to_grid(g)
    return g.sel(time=slice(f"{START_YEAR}-01-01", f"{END_YEAR}-12-31"))


def build_masks(inputs: xr.Dataset, target: xr.DataArray) -> xr.Dataset:
    """
    Two masks, for two different jobs.

    The 30-day prototype built ONE static mask with
        ~var.isnull().any(dim="time")
    i.e. a cell was valid only if it had data on EVERY one of the 30 days.
    Over 30 days that was defensible. Over 4,700 days it is not -- a single
    cloudy retrieval in 2017 would permanently kill a cell for the entire
    record, and the usable domain would collapse.

      static_mask  geography. Cells valid on at least 90% of days. Decides
                   WHERE patches may be extracted, so the patch grid is the
                   same for every year and comparable across time.

      daily_mask   per timestep. Used inside the loss, so a cell missing on
                   one particular day contributes nothing that day without
                   being banned for the whole record.
    """
    print("masks  (the slow step -- it reads every day)")
    valid = ~target.isnull().any(dim="depth")            # (time, lat, lon)
    for v in inputs.data_vars:
        valid = valid & ~inputs[v].isnull()

    valid = valid.compute()                              # needed before .mean
    frac = valid.mean(dim="time")
    static = (frac >= 0.90).astype("int8")

    n = int(static.sum())
    print(f"  static: {n} of {static.size} cells "
          f"({100 * n / static.size:.1f}%) valid on >=90% of days")
    if n < 1000:
        print("  WARNING: very few valid cells. Check that the sources really "
              "overlap in space -- a coordinate or halo mismatch shows up here.")

    return xr.Dataset({
        "static_mask": static,
        "daily_mask": valid.astype("int8"),
    })


# --------------------------------------------------------------------------
if __name__ == "__main__":
    inputs = process_inputs()
    target = process_target()

    # Every channel must share one calendar. normalise_time() floored all of
    # them to midnight, so this intersection is on dates, not timestamps.
    common = np.intersect1d(inputs.time.values, target.time.values)

    if len(common) == 0:
        print("\nNO OVERLAPPING DATES. Sample timestamps:")
        print("  inputs:", inputs.time.values[:3])
        print("  target:", target.time.values[:3])
        sys.exit(1)

    inputs = inputs.sel(time=common)
    target = target.sel(time=common)

    expected = (pd.Timestamp(f"{END_YEAR}-12-31")
                - pd.Timestamp(f"{START_YEAR}-01-01")).days + 1
    print(f"\naligned on {len(common)} days "
          f"({str(common[0])[:10]} .. {str(common[-1])[:10]})")
    print(f"  expected ~{expected}; "
          f"{'OK' if len(common) > 0.9 * expected else 'LOW -- a source is short'}")

    masks = build_masks(inputs, target)

    store = INTERIM / "oceanembed.zarr"
    ds = inputs.assign(thetao=target, **masks.data_vars)

    # Chunk on time only. Chunking the spatial dims too would make the
    # per-day reads in build_samples touch many chunks per patch.
    ds = ds.chunk({"time": 30})

    print(f"\nwriting {store} ...")
    ds.to_zarr(store, mode="w")

    print("done")
    print(ds)