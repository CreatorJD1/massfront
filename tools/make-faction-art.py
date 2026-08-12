#!/usr/bin/env python3
"""
Faction art pipeline — turns the supplied crests and commander portraits into
game-ready assets.

The crests arrive rendered on a flat grey or black plate with a coloured bloom
around them. That plate has to go: a faction mark is drawn over panels, buttons
and dark HUD chrome, and a baked-in grey square reads as a sticker every time.

Cutting it out is not a threshold. The bloom is genuinely semi-transparent, so
a hard key leaves either a halo or a chewed edge. What the render actually is,
mathematically, is the mark composited OVER the plate:

    seen = mark*a + plate*(1-a)

so given the plate colour we can recover both the coverage and the true colour:
alpha from how far the pixel has travelled away from the plate, and colour by
un-compositing — (seen - plate*(1-a)) / a. That last step is what removes the
grey wash from the soft glow instead of leaving it looking dusty.

    python3 tools/make-faction-art.py
"""
import os
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, '..', 'assets', 'factions')
UP   = '/root/.claude/uploads/94677a3c-c13e-58ac-86a3-0098b66ed364/'

# key -> (crest file, portrait file, cut mode)
ART = {
    'nova':       ('fb457abb-61179', 'd5a79adb-61175', 'plate'),
    'ascendancy': ('3309e96c-61178', '6ea17895-61174', 'plate'),
    'syndicate':  ('252e1718-61180', '5d9f2455-61173', 'plate'),
    'horde':      ('638ff532-61181', '6c6bee8b-61177', 'dark'),
}
SHEET = '7dfb0a86-61172'


def plate_colour(im):
    """The background is whatever fills the corners. Median of a border sample
    rather than a single pixel, so a stray speck cannot define the key."""
    w, h = im.size
    px = im.load()
    s = []
    for x in range(0, w, 7):
        s.append(px[x, 2]); s.append(px[x, h - 3])
    for y in range(0, h, 7):
        s.append(px[2, y]); s.append(px[w - 3, y])
    s.sort(key=lambda c: c[0] + c[1] + c[2])
    return s[len(s) // 2]


def smooth(v, lo, hi):
    if v <= lo: return 0.0
    if v >= hi: return 1.0
    t = (v - lo) / (hi - lo)
    return t * t * (3 - 2 * t)


def cut(im, mode, step=7.0):
    """Flood the background in from the border, following the gradient.

    Two keys failed before this one, and both failed for the same reason: they
    asked "is this pixel background-coloured?", a question the glow answers
    ambiguously by design. Distance keyed the bloom as solid; chroma did too,
    because the bloom is the mark's own colour. Measuring the actual pixels
    settled it — around the Nova crest the plate ramps from lum 111 down to 37
    and chroma 0 up to 56 across roughly 290 pixels, so no single cut line
    separates glow from mark.

    What does separate them is CONTINUITY. The bloom is a smooth ramp — about a
    quarter of a level per pixel — while the mark is bounded by a hard drawn
    edge that jumps a hundred levels in two. So: start from the border, walk
    inwards, and only step to a neighbour that is within `step` of where we
    already are. The walk glides all the way down the glow and stops dead at the
    outline. No thresholds on colour at all, which is why it works identically on
    the grey plates and the black one."""
    from collections import deque
    im = im.convert('RGB')
    w, h = im.size
    bg = plate_colour(im)
    src = im.load()

    lum = [[0.0] * w for _ in range(h)]
    for y in range(h):
        row, sy = lum[y], y
        for x in range(w):
            r, g, b = src[x, sy]
            row[x] = (r + g + b) / 3.0

    isbg = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not isbg[y * w + x]: isbg[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not isbg[y * w + x]: isbg[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        l0 = lum[y][x]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= w or ny >= h: continue
            i = ny * w + nx
            if isbg[i]: continue
            if abs(lum[ny][nx] - l0) <= step:
                isbg[i] = 1; q.append((nx, ny))

    # Binary coverage, then one soft pass so the cut edge is not aliased.
    mask = Image.new('L', (w, h))
    mp = mask.load()
    for y in range(h):
        base = y * w
        for x in range(w):
            mp[x, y] = 0 if isbg[base + x] else 255
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))

    out = Image.new('RGBA', (w, h))
    dst, mk = out.load(), mask.load()
    for y in range(h):
        for x in range(w):
            a = mk[x, y] / 255.0
            if a <= 0.004:
                dst[x, y] = (0, 0, 0, 0); continue
            r, g, b = src[x, y]
            # Un-composite: recover the mark's own colour from the blend, so
            # half-covered edge pixels are not tinted by the plate they sat on.
            rr = (r - bg[0] * (1 - a)) / a
            gg = (g - bg[1] * (1 - a)) / a
            bb = (b - bg[2] * (1 - a)) / a
            dst[x, y] = (int(max(0, min(255, rr))),
                         int(max(0, min(255, gg))),
                         int(max(0, min(255, bb))),
                         int(a * 255))
    return out


def trim(im, pad_frac=0.045):
    bb = im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bb: return im
    im = im.crop(bb)
    # Square it so every crest shares one optical centre and one scale.
    w, h = im.size
    s = int(max(w, h) * (1 + pad_frac * 2))
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(im, ((s - w) // 2, (s - h) // 2))
    return sq


os.makedirs(OUT, exist_ok=True)
for key, (crest, portrait, mode) in ART.items():
    ic = trim(cut(Image.open(UP + crest + '.png'), mode, 4.0 if mode=='dark' else 7.0))
    for size in (256, 96, 48):
        ic.resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT, '%s_icon_%d.png' % (key, size)))
    p = Image.open(UP + portrait + '.png').convert('RGB')
    p.resize((512, 512), Image.LANCZOS).save(
        os.path.join(OUT, '%s_512.jpg' % key), quality=88, optimize=True)
    p.resize((192, 192), Image.LANCZOS).save(
        os.path.join(OUT, '%s_192.jpg' % key), quality=86, optimize=True)
    print('%-11s icon %dpx source -> 256/96/48, portrait 512/192' % (key, ic.size[0]))

Image.open(UP + SHEET + '.png').convert('RGB').save(
    os.path.join(OUT, 'overview.jpg'), quality=88, optimize=True)
print('faction art written to', os.path.normpath(OUT))
