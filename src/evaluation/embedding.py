#!/usr/bin/env python
"""
Embedding analysis -- evidence that the latent means something.

    python -m src.evaluation.embedding --model compact

An encoder with a bottleneck is a layer. An encoder whose latent space has
interpretable structure is a result. The problem statement asks for embeddings
that "capture hidden ocean dynamics", so a bottleneck existing is not enough.

THE PROBLEM WITH CLUSTERING ALONE
    The first version ran k-means and printed cluster centroids. The clusters
    came out geographic -- four of six sat in the central Arabian Sea at
    slightly different positions. That shows the embedding encodes WHERE a
    patch is, which is unsurprising and not what the PS is asking about.

    Latitude and longitude correlate with almost everything, so any encoder
    will pick them up. The interesting question is whether the latent ALSO
    separates ocean STATE -- the same location in monsoon versus
    inter-monsoon, upwelling active versus quiescent.

    So this version produces four panels: clusters on the map (does it know
    where?), latent coloured by month (does it know when?), latent coloured by
    SST (does it track a physical variable?), and the monsoon separation
    quantified. The second and fourth are the ones that answer the PS.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import xarray as xr

from configs.config import (INTERIM, LAT, LON, MODELS as MDIR, PATCH,
                            PROCESSED, RESULTS)
from src.models.nets import MODELS

DEV = "cuda" if torch.cuda.is_available() else "cpu"

# The North Indian Ocean is monsoon-dominated. If the embedding captures
# ocean state at all, these three regimes should separate.
def season_of(month):
    if month in (6, 7, 8, 9):
        return 0            # southwest monsoon
    if month in (11, 12, 1, 2):
        return 1            # northeast monsoon
    return 2                # inter-monsoon (Mar-May, Oct)

SEASON_NAMES = ["SW monsoon (Jun-Sep)", "NE monsoon (Nov-Feb)",
                "inter-monsoon"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="compact", choices=list(MODELS))
    ap.add_argument("--clusters", type=int, default=6)
    a = ap.parse_args()

    from sklearn.cluster import KMeans
    from sklearn.decomposition import PCA
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import cross_val_score

    X = np.load(PROCESSED / "test" / "X.npy")
    meta = np.load(PROCESSED / "test" / "meta.npy")      # (day, i, j)
    ds = xr.open_zarr(INTERIM / "oceanembed.zarr")

    model = MODELS[a.model]().to(DEV)
    model.load_state_dict(torch.load(MDIR / f"{a.model}_best.pt",
                                     map_location=DEV))
    model.eval()

    Z = []
    with torch.no_grad():
        for i in range(0, len(X), 256):
            b = torch.tensor(X[i:i+256], dtype=torch.float32).to(DEV)
            z = model.embed(b)
            if z.dim() == 4:                  # spatial bottleneck -> pool
                z = z.mean((2, 3))
            Z.append(z.cpu().numpy())
    Z = np.concatenate(Z)
    print(f"embeddings {Z.shape}   "
          f"({X[0].size / Z.shape[1]:.0f}x compression)")

    # ---- context for every sample -------------------------------------
    months = ds.time.dt.month.values[meta[:, 0]]
    seasons = np.array([season_of(m) for m in months])
    lat_c = LAT[np.clip(meta[:, 1] + PATCH // 2, 0, len(LAT) - 1)]
    lon_c = LON[np.clip(meta[:, 2] + PATCH // 2, 0, len(LON) - 1)]

    # mean SST of each patch, as a physical variable to colour by
    sst_full = ds["sst"].values
    sst_patch = np.array([
        np.nanmean(sst_full[t, i:i+PATCH, j:j+PATCH])
        for t, i, j in meta
    ])

    pca = PCA(2).fit(Z)
    p2 = pca.transform(Z)
    print(f"first 2 PCs explain {pca.explained_variance_ratio_.sum():.1%} "
          f"of latent variance")

    lab = KMeans(a.clusters, n_init=10, random_state=0).fit_predict(Z)

    # ---- the quantitative claim ---------------------------------------
    # Can a linear classifier read the season out of the embedding? If yes,
    # the latent encodes ocean state, not just position. Compared against
    # the same classifier given ONLY position, which is the honest control.
    acc_emb = cross_val_score(LogisticRegression(max_iter=2000),
                              Z, seasons, cv=3).mean()
    pos = np.stack([lat_c, lon_c], 1)
    acc_pos = cross_val_score(LogisticRegression(max_iter=2000),
                              pos, seasons, cv=3).mean()
    base = np.bincount(seasons).max() / len(seasons)

    print("\nCAN THE EMBEDDING TELL YOU THE SEASON?")
    print(f"  majority-class baseline   {base:.1%}")
    print(f"  from position alone       {acc_pos:.1%}")
    print(f"  from the embedding        {acc_emb:.1%}")
    if acc_emb > acc_pos + 0.10:
        print("  -> the latent carries ocean STATE, not just location.")
    else:
        print("  -> the latent is mostly positional; state is weakly encoded.")

    # ---- figure --------------------------------------------------------
    fig, ax = plt.subplots(2, 2, figsize=(14, 10))

    s0 = ax[0, 0].scatter(lon_c, lat_c, c=lab, s=8, cmap="tab10", alpha=.6)
    ax[0, 0].axvline(78, color="k", ls=":", lw=1)
    ax[0, 0].set_title(f"k-means clusters on the map (k={a.clusters})")
    ax[0, 0].set_xlabel("longitude"); ax[0, 0].set_ylabel("latitude")
    ax[0, 0].text(60, 6, "Arabian Sea", fontsize=8, ha="center")
    ax[0, 0].text(84, 6, "Bay of Bengal", fontsize=8, ha="center")

    for s in range(3):
        m = seasons == s
        ax[0, 1].scatter(p2[m, 0], p2[m, 1], s=6, alpha=.5,
                         label=SEASON_NAMES[s])
    ax[0, 1].legend(fontsize=8)
    ax[0, 1].set_title("latent space coloured by monsoon season")
    ax[0, 1].set_xlabel("PC 1"); ax[0, 1].set_ylabel("PC 2")

    s2 = ax[1, 0].scatter(p2[:, 0], p2[:, 1], c=sst_patch, s=6,
                          cmap="RdYlBu_r", alpha=.6)
    plt.colorbar(s2, ax=ax[1, 0], label="patch mean SST (deg C)")
    ax[1, 0].set_title("latent space coloured by surface temperature")
    ax[1, 0].set_xlabel("PC 1"); ax[1, 0].set_ylabel("PC 2")

    s3 = ax[1, 1].scatter(p2[:, 0], p2[:, 1], c=lat_c, s=6,
                          cmap="viridis", alpha=.6)
    plt.colorbar(s3, ax=ax[1, 1], label="latitude")
    ax[1, 1].set_title("latent space coloured by latitude (the control)")
    ax[1, 1].set_xlabel("PC 1"); ax[1, 1].set_ylabel("PC 2")

    fig.suptitle(f"OceanEmbed {a.model}: {Z.shape[1]}-dim satellite embedding",
                 fontsize=13)
    fig.tight_layout()
    out = RESULTS / f"embedding_{a.model}.png"
    fig.savefig(out, dpi=150)
    print(f"\nwrote {out}")

    # ---- cluster summary ----------------------------------------------
    print(f"\n{'cluster':>8}{'n':>7}{'lat':>7}{'lon':>7}{'SST':>7}"
          f"   dominant season")
    for c in range(a.clusters):
        m = lab == c
        dom = np.bincount(seasons[m], minlength=3)
        print(f"{c:>8}{int(m.sum()):>7}{lat_c[m].mean():>7.1f}"
              f"{lon_c[m].mean():>7.1f}{sst_patch[m].mean():>7.1f}"
              f"   {SEASON_NAMES[dom.argmax()]} ({dom.max()/m.sum():.0%})")


if __name__ == "__main__":
    main()