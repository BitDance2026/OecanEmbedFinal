"""
Loss and training.

    python -m src.training.train --model compact
    python -m src.training.train --model spatial
    python -m src.training.train --model baseline
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from configs.config import (BATCH_SIZE, DEPTHS, EPOCHS, LR, MODELS as MDIR,
                            PROCESSED, RESULTS)
from src.models.nets import MODELS

DEV = "cuda" if torch.cuda.is_available() else "cpu"


# --------------------------------------------------------------------------
def masked_mse(pred, target, mask):
    """MSE over valid ocean cells only.

    The ordering here is not cosmetic. Target NaNs must be replaced BEFORE the
    subtraction -- if a NaN enters the computational graph the gradient becomes
    NaN and every weight in the model silently turns to NaN on the first
    backward pass. Masking after subtracting does not save you.
    """
    m = mask.unsqueeze(1).expand_as(target) * (~torch.isnan(target)).float()
    t = torch.nan_to_num(target)
    return ((pred - t) ** 2 * m).sum() / m.sum().clamp(min=1)


def stratification_penalty(pred, below_index=5):
    """Discourage temperature inversions below the mixed layer.

    Each depth is an independent output channel, so nothing stops the network
    predicting a profile that is plausible at every single level and physically
    impossible as a whole -- warmer at 300 m than at 200 m. Below roughly 50 m
    (index 5) temperature should decrease monotonically with depth, so we
    penalise any positive difference.
    """
    d = pred[:, below_index + 1:] - pred[:, below_index:-1]
    return torch.relu(d).mean()


class OceanLoss(nn.Module):
    def __init__(self, strat_weight=0.05):
        super().__init__()
        self.w = strat_weight

    def forward(self, pred, target, mask):
        base = masked_mse(pred, target, mask)
        return base + self.w * stratification_penalty(pred), base.item()


# --------------------------------------------------------------------------
def load(split):
    d = PROCESSED / split
    T = lambda n: torch.tensor(np.load(d / n), dtype=torch.float32)
    return TensorDataset(T("X.npy"), T("Y.npy"), T("mask.npy"))


def evaluate(model, loader, crit):
    model.eval()
    tot = n = 0.0
    with torch.no_grad():
        for x, y, m in loader:
            x, y, m = x.to(DEV), y.to(DEV), m.to(DEV)
            mm = m.unsqueeze(1).expand_as(y) * (~torch.isnan(y)).float()
            tot += ((model(x) - torch.nan_to_num(y)) ** 2 * mm).sum().item()
            n += mm.sum().item()
    return tot / max(n, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="compact", choices=list(MODELS))
    ap.add_argument("--epochs", type=int, default=EPOCHS)
    ap.add_argument("--strat", type=float, default=0.05)
    a = ap.parse_args()

    tr = DataLoader(load("train"), batch_size=BATCH_SIZE, shuffle=True,
                    num_workers=2, pin_memory=True)
    va = DataLoader(load("val"), batch_size=BATCH_SIZE, num_workers=2)
    print(f"train {len(tr.dataset)}  val {len(va.dataset)}  device {DEV}")

    model = MODELS[a.model]().to(DEV)
    print(f"{a.model}: {sum(p.numel() for p in model.parameters())/1e6:.2f}M params")

    crit = OceanLoss(a.strat)
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, patience=8,
                                                       factor=0.5)

    best, hist, t0 = 1e9, [], time.time()
    ckpt = MDIR / f"{a.model}_best.pt"

    for ep in range(1, a.epochs + 1):
        model.train()
        run = 0.0
        for x, y, m in tr:
            x, y, m = x.to(DEV), y.to(DEV), m.to(DEV)
            loss, base = crit(model(x), y, m)
            opt.zero_grad(); loss.backward(); opt.step()
            run += base
        trl = run / len(tr)
        val = evaluate(model, va, crit)
        sched.step(val)
        hist.append({"epoch": ep, "train": trl, "val": val})

        if val < best:
            best = val
            torch.save(model.state_dict(), ckpt)
        if ep % 5 == 0 or ep == 1:
            print(f"ep {ep:3d}  train {trl:.4f}  val {val:.4f}  "
                  f"best {best:.4f}  ({time.time()-t0:.0f}s)")

    print(f"\nbest val MSE {best:.4f}  ->  RMSE {best**0.5:.4f}")
    print(f"checkpoint {ckpt}")
    (RESULTS / f"history_{a.model}.json").write_text(json.dumps(hist, indent=2))


if __name__ == "__main__":
    main()
