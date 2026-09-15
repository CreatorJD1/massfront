"""Measure ocean lab frames against a Stormbreak concept.

    python tools/ocean-lab/measure.py tmp/ocean-lab/cycle-17/S1.png [more.png ...]
    python tools/ocean-lab/measure.py --ref shallows tmp/ocean-lab/cycle-17/S3.png

Water tone: luminance percentiles of saturated, non-foam pixels, plus the mean
colour of their brightest and darkest tenths. Foam: share of pixels whose
darkest channel is above 170 (bright) and 130 (light). The concept's HUD and
grey platform drop out through the saturation test; the lab's HUD strip is
skipped by rows.

These numbers are tripwires for a look that is judged by eye. They caught what
eyes kept missing (foam at 7x the concept, water two stops too flat), but a
frame that scores well and does not read as the concept still fails.
"""
import sys

import numpy as np
from PIL import Image

REFS = {
    'storm': ('tmp/ocean-lab/concepts/stormbreak-storm.jpg', (120, 760), (380, 1450)),
    'shallows': ('tmp/ocean-lab/concepts/stormbreak-shallows.jpg', (120, 760), (380, 1450)),
}


def load(path, rows=None, cols=None):
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)
    if rows:
        a = a[rows[0]:rows[1]]
    if cols:
        a = a[:, cols[0]:cols[1]]
    return a


def stats(a):
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    water = (sat > 0.30) & (mn < 130)
    px = a[water]
    lum = 0.2126 * px[:, 0] + 0.7152 * px[:, 1] + 0.0722 * px[:, 2]
    return {
        'pct': np.percentile(lum, [5, 25, 50, 75, 95]),
        'top': px[lum >= np.percentile(lum, 90)].mean(axis=0),
        'bottom': px[lum <= np.percentile(lum, 10)].mean(axis=0),
        'teal': float(((px[:, 1] > px[:, 2] * 0.85) & (px[:, 1] > px[:, 0] * 1.8) & (lum > 90)).mean()),
        'bright': float((mn > 170).mean()),
        'light': float((mn > 130).mean()),
    }


def row(label, s, ref=None):
    p = s['pct']
    line = (f"{label:30s} {p[0]:5.1f} {p[1]:5.1f} {p[2]:5.1f} {p[3]:5.1f} {p[4]:5.1f} | "
            f"top {np.round(s['top']).astype(int)} bot {np.round(s['bottom']).astype(int)} | "
            f"teal {s['teal'] * 100:4.1f}% foam {s['bright'] * 100:4.1f}/{s['light'] * 100:4.1f}%")
    if ref is not None:
        tone = float(np.abs(p - ref['pct']).mean()
                     + 0.5 * np.abs(s['top'] - ref['top']).mean()
                     + 0.5 * np.abs(s['bottom'] - ref['bottom']).mean())
        foam = abs(s['bright'] - ref['bright']) * 100 + abs(s['light'] - ref['light']) * 100
        line += f" | tone err {tone:5.1f}  foam err {foam:4.1f}"
    print(line)


def main(argv):
    ref_name = 'storm'
    if argv[:1] == ['--ref']:
        ref_name, argv = argv[1], argv[2:]
    path, rows, cols = REFS[ref_name]
    ref = stats(load(path, rows, cols))
    print(f"{'water luminance percentiles':30s}    p5   p25   p50   p75   p95")
    row(f'concept:{ref_name}', ref)
    for f in argv:
        label = f.replace('\\', '/').split('tmp/ocean-lab/')[-1]
        row(label, stats(load(f, (90, 900))), ref)


if __name__ == '__main__':
    main(sys.argv[1:])
