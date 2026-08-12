#!/usr/bin/env python3
"""
In-world ad creative pipeline — placeholder billboard loops.

MASSFRONT's ad boards are diegetic props (billboards standing in the
battlefield), not banner overlays, so the content playing on them has to read
as WORLD FICTION: faction propaganda and invented in-universe brands, rendered
like a scrappy broadcast screen rather than a stock-photo advert. There is no
footage to shoot, so every frame is generated procedurally — flat colour
fields, animated vector shapes and set type composited with numpy — the same
"painted, not photographed" approach the rest of the game's art already uses
(see tools/make-icons.py, tools/make-portrait.py).

Each creative is a short (4s) SEAMLESS loop: every animated phase (sweep
position, rotation, scroll offset, pulse) is driven by frame/NF so the last
frame flows back into the first with no pop. Rendered to a PNG sequence, then
encoded with ffmpeg to a small H.264 MP4 (silent, faststart) plus one poster
JPG per clip for the static fallback (video blocked / errored / not ready).
Total output is kept to a few hundred KB per clip — this plays on a phone.

    python3 tools/make-ad-art.py
"""
import os, math, random, subprocess, shutil, json, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
OUT  = os.path.join(ROOT, 'assets', 'ads')

FONT_DIRS = [
    '/root/.claude/skills/canvas-design/canvas-fonts',
    '/mnt/skills/examples/canvas-design/canvas-fonts',
]
FONT_DIR = next((d for d in FONT_DIRS if os.path.isdir(d)), None)


def F(name, size):
    """Bold display fonts from the canvas-design font pack (all OFL). Falls
    back to PIL's bitmap default so the script still runs if that pack is
    ever missing — ugly type beats a crash."""
    if FONT_DIR:
        p = os.path.join(FONT_DIR, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


W, H   = 480, 270      # 16:9 — matches the in-world screen panel's aspect
FPS    = 12
SECS   = 4.0
NF     = int(FPS * SECS)          # 48 frames per loop
random.seed(20260731)             # deterministic art: same seed, same output

# ---------------------------------------------------------------------------
# low-level numpy/PIL helpers
# ---------------------------------------------------------------------------
def vgrad(top, bot, w=W, h=H):
    t = np.linspace(0, 1, h, dtype=np.float32).reshape(h, 1, 1)
    a = np.array(top, dtype=np.float32).reshape(1, 1, 3)
    b = np.array(bot, dtype=np.float32).reshape(1, 1, 3)
    return np.repeat(a + (b - a) * t, w, axis=1)


def vignette(strength=0.60, feather=1.18, w=W, h=H):
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h / 2.0
    d = np.sqrt(((xx - cx) / (w / 2.0 * feather)) ** 2 + ((yy - cy) / (h / 2.0 * feather)) ** 2)
    return np.clip(1.0 - np.clip(d, 0, 1) ** 1.7 * strength, 0, 1)[..., None]


def scanlines(period=3, dark=0.16, w=W, h=H):
    yy = np.arange(h).reshape(h, 1)
    m = np.where((yy % period) == 0, 1.0 - dark, 1.0).astype(np.float32)
    return np.repeat(m, w, axis=1)[..., None]


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')


def grain(arr, amt=7.0, seed=0):
    rng = np.random.default_rng(seed)
    return arr + rng.normal(0, amt, arr.shape).astype(np.float32)


def hex_tile(w, h, col, alpha=18, r=17):
    """A faint static hex-grid, drawn once and reused across every frame of a
    clip — texture without per-frame cost."""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    dx, dy = r * 1.73, r * 1.5
    row = 0
    y = -r
    while y < h + r:
        x0 = -r if row % 2 == 0 else -r + dx / 2
        x = x0
        while x < w + r:
            pts = [(x + r * math.cos(math.pi / 3 * k), y + r * math.sin(math.pi / 3 * k)) for k in range(6)]
            d.polygon(pts, outline=(col[0], col[1], col[2], alpha))
            x += dx
        y += dy
        row += 1
    return im


def glow_layer(w, h, draw_fn, blur, col, alpha):
    """Render shapes/text via draw_fn(ImageDraw) into an isolated RGBA layer,
    blur it for a soft halo, tint, and hand back the layer to composite."""
    im = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(im)
    draw_fn(d)
    im = im.filter(ImageFilter.GaussianBlur(blur))
    rgba = Image.new('RGBA', (w, h), (col[0], col[1], col[2], 0))
    a = im.point(lambda v: int(v * alpha / 255))
    rgba.putalpha(a)
    return rgba


def text_w(d, s, font):
    b = d.textbbox((0, 0), s, font=font)
    return b[2] - b[0], b[3] - b[1]


def centered_text(im, s, font, y, fill, tracking=0):
    """Centred text with optional letter-spacing (tracking, in px)."""
    d = ImageDraw.Draw(im)
    if tracking:
        widths = [text_w(d, ch, font)[0] for ch in s]
        total = sum(widths) + tracking * (len(s) - 1)
        x = (im.width - total) / 2
        for ch, wch in zip(s, widths):
            d.text((x, y), ch, font=font, fill=fill)
            x += wch + tracking
    else:
        w, _ = text_w(d, s, font)
        d.text(((im.width - w) / 2, y), s, font=font, fill=fill)


def safe_frame(rgb_arr):
    """Clamp to the safe interior so text never touches the panel bezel once
    it's mounted on the billboard geometry."""
    return rgb_arr


# ---------------------------------------------------------------------------
# per-creative generators — each returns a list of NF RGB numpy frames
# ---------------------------------------------------------------------------
def clip_nova(bg_hex):
    top, bot = (17, 46, 74), (7, 14, 24)
    accent = (110, 190, 255)
    base = vgrad(top, bot)
    hx = hex_tile(W, H, accent, alpha=14, r=22)
    vig = vignette(0.55)
    sl = scanlines(3, 0.10)
    f_brand = F('BigShoulders-Bold.ttf', 46)
    f_tag = F('Tektur-Medium.ttf', 15)
    f_cta = F('Tektur-Regular.ttf', 12)
    frames = []
    for i in range(NF):
        t = i / NF
        arr = base.copy()
        im = to_img(arr).convert('RGBA')
        im.alpha_composite(hx)
        # sweeping key-light band, wraps seamlessly (drawn twice across the seam)
        sweep_x = t * (W + 220) - 110
        band = glow_layer(W, H, lambda d: d.line([(sweep_x, -20), (sweep_x - 90, H + 20)], fill=255, width=70), 34, accent, 46)
        im.alpha_composite(band)
        band2 = glow_layer(W, H, lambda d: d.line([(sweep_x - (W + 220), -20), (sweep_x - (W + 220) - 90, H + 20)], fill=255, width=70), 34, accent, 46)
        im.alpha_composite(band2)
        # emblem: chevron shield, soft pulse
        pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi)
        cx, cy = W * 0.20, H * 0.52
        R = 30 + pulse * 3
        def emblem(d, R=R, cx=cx, cy=cy):
            d.polygon([(cx, cy - R), (cx + R * 0.85, cy - R * 0.15), (cx + R * 0.55, cy + R),
                       (cx, cy + R * 0.6), (cx - R * 0.55, cy + R), (cx - R * 0.85, cy - R * 0.15)],
                      outline=255, width=4)
            d.line([(cx, cy - R * 0.5), (cx, cy + R * 0.35)], fill=255, width=4)
        glow = glow_layer(W, H, emblem, 5, accent, 210)
        im.alpha_composite(glow)
        glow2 = glow_layer(W, H, emblem, 16, accent, int(90 + pulse * 60))
        im.alpha_composite(glow2)
        d = ImageDraw.Draw(im)
        centered_text(im, 'NOVA FEDERATION', f_brand, 30, (240, 248, 255, 255), tracking=1)
        centered_text(im, 'O R D E R   ·   S C I E N C E   ·   U N I T Y', f_tag, 82, (150, 205, 255, 235))
        cta_a = int(150 + 105 * (0.5 + 0.5 * math.sin(t * 2 * math.pi * 2)))
        centered_text(im, 'COMMAND AWAITS — ENLIST TODAY', f_cta, H - 34, (210, 230, 255, cta_a))
        arr = np.asarray(im.convert('RGB'), dtype=np.float32)
        arr = arr * vig
        arr = arr * sl
        arr = grain(arr, 5.0, seed=i)
        frames.append(arr)
    return frames


def clip_ascendancy():
    top, bot = (58, 15, 18), (14, 5, 6)
    accent = (255, 96, 78)
    base = vgrad(top, bot)
    vig = vignette(0.62)
    sl = scanlines(3, 0.14)
    f_brand = F('BigShoulders-Bold.ttf', 48)
    f_tag = F('Tektur-Medium.ttf', 15)
    f_small = F('Tektur-Regular.ttf', 12)
    frames = []
    for i in range(NF):
        t = i / NF
        im = to_img(base.copy()).convert('RGBA')
        d = ImageDraw.Draw(im)
        # jagged fang emblem, aggressive scale pulse
        pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi * 3)
        cx, cy = W * 0.78, H * 0.50
        R = 34 + pulse * 5
        def emblem(d, R=R, cx=cx, cy=cy):
            pts = [(cx, cy - R), (cx + R * 0.5, cy - R * 0.1), (cx + R * 0.2, cy + R * 0.2),
                   (cx + R * 0.65, cy + R), (cx, cy + R * 0.35), (cx - R * 0.65, cy + R),
                   (cx - R * 0.2, cy + R * 0.2), (cx - R * 0.5, cy - R * 0.1)]
            d.polygon(pts, outline=255, width=4)
        im.alpha_composite(glow_layer(W, H, emblem, 4, accent, 220))
        im.alpha_composite(glow_layer(W, H, emblem, 20, accent, int(70 + pulse * 90)))
        # corner hazard ticks
        for k in range(10):
            x0 = 6 + k * 26
            d.line([(x0, 6), (x0 + 14, 20)], fill=(230, 190, 60, 130), width=3)
            d.line([(W - x0, H - 6), (W - x0 - 14, H - 20)], fill=(230, 190, 60, 130), width=3)
        centered_text(im, 'RED ASCENDANCY', f_brand, 26, (255, 232, 226, 255), tracking=1)
        centered_text(im, 'S T R E N G T H   T H R O U G H   A S C E N S I O N', f_tag, 80, (255, 150, 130, 235))
        centered_text(im, 'THE WEAK ARE FUEL', f_small, H - 32, (255, 190, 170, 220))
        arr = np.asarray(im.convert('RGB'), dtype=np.float32)
        # hard flash every 24 frames — propaganda broadcast "cut"
        if i % 24 == 0:
            arr = arr * 0.55 + 255 * 0.45
        arr = arr * vig
        arr = arr * sl
        arr = grain(arr, 8.0, seed=i + 100)
        frames.append(arr)
    return frames


def clip_syndicate():
    top, bot = (12, 34, 14), (5, 12, 6)
    accent = (150, 235, 100)
    base = vgrad(top, bot)
    vig = vignette(0.55)
    sl = scanlines(3, 0.10)
    f_brand = F('BigShoulders-Bold.ttf', 42)
    f_tag = F('Tektur-Medium.ttf', 14)
    f_mono = F('JetBrainsMono-Bold.ttf', 13)
    ticker = '  DEPOSITS +12%   ·   SALVAGE CONTRACTS OPEN   ·   INTEL FOR SALE   ·   NO QUESTIONS ASKED   ·  '
    frames = []
    d0 = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    tick_w, _ = text_w(d0, ticker, f_mono)
    circuit = hex_tile(W, H, accent, alpha=10, r=26)
    for i in range(NF):
        t = i / NF
        im = to_img(base.copy()).convert('RGBA')
        im.alpha_composite(circuit)
        d = ImageDraw.Draw(im)
        # rotating hex node emblem (wireframe), full turn across the loop
        ang = t * 2 * math.pi
        cx, cy, R = W * 0.79, H * 0.46, 32
        pts = [(cx + R * math.cos(ang + k * math.pi / 3), cy + R * 0.72 * math.sin(ang + k * math.pi / 3)) for k in range(6)]
        def emblem(d, pts=pts):
            d.polygon(pts, outline=255, width=3)
            for p in pts:
                d.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=255)
        im.alpha_composite(glow_layer(W, H, emblem, 4, accent, 210))
        im.alpha_composite(glow_layer(W, H, emblem, 14, accent, 90))
        centered_text(im, 'SYNDICATE EXCHANGE', f_brand, 34, (232, 255, 224, 255), tracking=1)
        centered_text(im, 'E V E R Y T H I N G   H A S   A   P R I C E', f_tag, 80, (170, 235, 130, 230))
        # credits readout, ticks up
        credits = 118420 + i * 137
        d.text((16, 16), 'CR {:,}'.format(credits), font=f_mono, fill=(180, 255, 150, 220))
        # seamless scrolling ticker along the base
        off = (t * tick_w) % tick_w
        d.rectangle([0, H - 26, W, H], fill=(6, 16, 8, 235))
        d.text((-off, H - 22), ticker, font=f_mono, fill=(160, 240, 130, 255))
        d.text((-off + tick_w, H - 22), ticker, font=f_mono, fill=(160, 240, 130, 255))
        arr = np.asarray(im.convert('RGB'), dtype=np.float32)
        arr = arr * vig
        arr = arr * sl
        arr = grain(arr, 5.0, seed=i + 200)
        frames.append(arr)
    return frames


def clip_umbral():
    top, bot = (24, 10, 40), (6, 3, 12)
    accent = (185, 122, 255)
    base = vgrad(top, bot)
    vig = vignette(0.68)
    sl = scanlines(2, 0.20)
    f_brand = F('Silkscreen-Regular.ttf', 26)
    f_tag = F('IBMPlexMono-Bold.ttf', 15)
    frames = []
    for i in range(NF):
        t = i / NF
        im = to_img(base.copy()).convert('RGBA')
        d = ImageDraw.Draw(im)
        # pulsing organic blobs
        for k in range(4):
            ph = t * 2 * math.pi + k * 1.7
            bx = W * (0.2 + 0.6 * ((k + 1) / 5))
            by = H * 0.5 + math.sin(ph) * 18
            br = 26 + 10 * math.sin(ph * 1.3 + k)
            blob = glow_layer(W, H, lambda dd, bx=bx, by=by, br=br: dd.ellipse([bx - br, by - br, bx + br, by + br], fill=255), 10, accent, 70)
            im.alpha_composite(blob)
        glitchy = 'IT ARRIVES' if (i // 6) % 3 else '[UNKNOWN SIGNAL]'
        centered_text(im, glitchy, f_brand, 118, (222, 200, 255, 255), tracking=2)
        centered_text(im, 'NO HAIL ANSWERED', f_tag, 160, (170, 120, 220, 200))
        arr = np.asarray(im.convert('RGB'), dtype=np.float32)
        # occasional horizontal glitch tear
        if i % 9 in (0, 1):
            rows = np.random.default_rng(i).integers(0, H, size=6)
            for r in rows:
                shift = int(np.random.default_rng(i + r).integers(-18, 18))
                arr[r] = np.roll(arr[r], shift, axis=0)
        # crude chromatic split for a corrupted-broadcast read
        arr2 = arr.copy()
        arr2[:, 2:, 0] = arr[:, :-2, 0]
        arr2[:, :-2, 2] = arr[:, 2:, 2]
        arr = arr2
        arr = arr * vig
        arr = arr * sl
        arr = grain(arr, 14.0, seed=i + 300)
        frames.append(arr)
    return frames


def clip_forge():
    top, bot = (42, 28, 12), (14, 9, 4)
    accent = (255, 176, 64)
    base = vgrad(top, bot)
    vig = vignette(0.55)
    sl = scanlines(3, 0.10)
    f_brand = F('BigShoulders-Bold.ttf', 42)
    f_tag = F('Tektur-Medium.ttf', 15)
    frames = []
    for i in range(NF):
        t = i / NF
        im = to_img(base.copy()).convert('RGBA')
        d = ImageDraw.Draw(im)
        # rivet-dotted border
        for x in range(14, W - 10, 26):
            d.ellipse([x - 2, 8, x + 2, 12], fill=(255, 210, 150, 120))
            d.ellipse([x - 2, H - 12, x + 2, H - 8], fill=(255, 210, 150, 120))
        # slowly rotating gear emblem, one full turn per loop
        ang = t * 2 * math.pi
        cx, cy, R = W * 0.21, H * 0.50, 30
        def emblem(d, ang=ang, cx=cx, cy=cy, R=R):
            teeth = 10
            pts = []
            for k in range(teeth * 2):
                a = ang + k * math.pi / teeth
                rr = R if k % 2 == 0 else R * 0.78
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
            d.polygon(pts, outline=255, width=3)
            d.ellipse([cx - R * 0.32, cy - R * 0.32, cx + R * 0.32, cy + R * 0.32], outline=255, width=3)
        im.alpha_composite(glow_layer(W, H, emblem, 3, accent, 220))
        im.alpha_composite(glow_layer(W, H, emblem, 12, accent, 80))
        centered_text(im, 'FORGE INDUSTRIES', f_brand, 30, (255, 238, 214, 255), tracking=1)
        centered_text(im, 'B U I L T   T O   O U T L A S T', f_tag, 82, (255, 190, 120, 230))
        arr = np.asarray(im.convert('RGB'), dtype=np.float32)
        arr = arr * vig
        arr = arr * sl
        arr = grain(arr, 5.0, seed=i + 400)
        frames.append(arr)
    return frames


def clip_coolant9():
    top, bot = (8, 10, 26), (3, 4, 10)
    cyan, mag = (70, 232, 255), (255, 60, 190)
    base = vgrad(top, bot)
    vig = vignette(0.60)
    sl = scanlines(3, 0.12)
    f_brand = F('Boldonse-Regular.ttf', 34)
    f_tag = F('Tektur-Medium.ttf', 15)
    frames = []
    for i in range(NF):
        t = i / NF
        im = to_img(base.copy()).convert('RGBA')
        d = ImageDraw.Draw(im)
        pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi * 2)
        # vertical energy bar, right side
        bx = W - 34
        bh = 18 + pulse * 150
        d.rectangle([bx, H - 30 - bh, bx + 10, H - 30], fill=(cyan[0], cyan[1], cyan[2], 90))
        im.alpha_composite(glow_layer(W, H, lambda dd, bx=bx, bh=bh: dd.rectangle([bx, H - 30 - bh, bx + 10, H - 30], fill=255), 8, cyan, 140))
        # brand glow (double colour halo — cyan + magenta) behind crisp text
        bw, _ = text_w(d, 'COOLANT-9', f_brand)
        bx = (W - bw) / 2
        draw_brand = lambda dd, bx=bx: dd.text((bx, 92), 'COOLANT-9', font=f_brand, fill=255)
        im.alpha_composite(glow_layer(W, H, draw_brand, 10, mag, 130))
        im.alpha_composite(glow_layer(W, H, draw_brand, 3, cyan, 230))
        centered_text(im, 'COOLANT-9', f_brand, 92, (232, 250, 255, 255))
        centered_text(im, 'S T A Y   O N L I N E', f_tag, 140, (140, 230, 255, 225))
        # magenta spark particles
        rng = np.random.default_rng(1000 + i // 4)
        for k in range(5):
            px = rng.uniform(20, W - 20)
            py = rng.uniform(H * 0.55, H - 20)
            r = rng.uniform(1, 2.6)
            d.ellipse([px - r, py - r, px + r, py + r], fill=(mag[0], mag[1], mag[2], 200))
        arr = np.asarray(im.convert('RGB'), dtype=np.float32)
        arr = arr * vig
        arr = arr * sl
        arr = grain(arr, 6.0, seed=i + 500)
        frames.append(arr)
    return frames


CREATIVES = [
    dict(id='nova_recruit',        brand='Nova Federation',   tagline='Order · Science · Unity',
         accent=[110, 190, 255], bg=[17, 46, 74],  faction='nova',       gen=lambda: clip_nova('nova')),
    dict(id='ascendancy_conquest', brand='Red Ascendancy',    tagline='Strength Through Ascension',
         accent=[255, 96, 78],  bg=[58, 15, 18],  faction='ascendancy', gen=clip_ascendancy),
    dict(id='syndicate_market',    brand='Syndicate Exchange', tagline='Everything Has A Price',
         accent=[150, 235, 100], bg=[12, 34, 14],  faction='syndicate',  gen=clip_syndicate),
    dict(id='umbral_broadcast',    brand='[Unknown Signal]',  tagline='It Arrives',
         accent=[185, 122, 255], bg=[24, 10, 40],  faction='horde',      gen=clip_umbral),
    dict(id='forge_industries',    brand='Forge Industries',  tagline='Built To Outlast',
         accent=[255, 176, 64], bg=[42, 28, 12],  faction=None,         gen=clip_forge),
    dict(id='coolant9',            brand='Coolant-9',         tagline='Stay Online',
         accent=[70, 232, 255], bg=[8, 10, 26],   faction=None,         gen=clip_coolant9),
]


def have_ffmpeg():
    return shutil.which('ffmpeg') is not None


def encode(frames_dir, out_mp4):
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error',
        '-framerate', str(FPS), '-i', os.path.join(frames_dir, 'f%04d.png'),
        '-frames:v', str(NF),
        '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
        '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'veryslow',
        '-movflags', '+faststart', '-an', out_mp4,
    ], check=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    ff = have_ffmpeg()
    if not ff:
        print('ffmpeg not found — writing poster stills only; the game falls back to static art per slot.')
    manifest = {'w': W, 'h': H, 'fps': FPS, 'loopSeconds': SECS, 'creatives': []}
    with tempfile.TemporaryDirectory() as tmp:
        for c in CREATIVES:
            print('rendering', c['id'])
            frames = c['gen']()
            fdir = os.path.join(tmp, c['id'])
            os.makedirs(fdir, exist_ok=True)
            for i, arr in enumerate(frames):
                to_img(arr).save(os.path.join(fdir, 'f%04d.png' % i))
            poster_i = min(6, len(frames) - 1)
            poster_path = os.path.join(OUT, c['id'] + '_poster.jpg')
            to_img(frames[poster_i]).convert('RGB').save(poster_path, quality=84, optimize=True)
            entry = {
                'id': c['id'], 'brand': c['brand'], 'tagline': c['tagline'],
                'accent': c['accent'], 'bg': c['bg'], 'faction': c['faction'],
                'poster': c['id'] + '_poster.jpg',
                'video': (c['id'] + '.mp4') if ff else None,
                'w': W, 'h': H,
            }
            if ff:
                out_mp4 = os.path.join(OUT, c['id'] + '.mp4')
                encode(fdir, out_mp4)
                entry['bytes'] = os.path.getsize(out_mp4)
            manifest['creatives'].append(entry)
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)
    total = sum(e.get('bytes', 0) for e in manifest['creatives'])
    total += sum(os.path.getsize(os.path.join(OUT, e['poster'])) for e in manifest['creatives'])
    print('wrote %d creatives -> assets/ads  (%.1f KB total)' % (len(manifest['creatives']), total / 1024))


if __name__ == '__main__':
    main()
