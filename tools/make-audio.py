#!/usr/bin/env python3
"""
MASSFRONT audio production.

The game shipped with realtime oscillator synthesis — sine sweeps and filtered
noise assembled per shot in Web Audio. That approach has one virtue, size, and
one fatal flaw: an oscillator with an envelope on it sounds like an oscillator
with an envelope on it. No amount of parameter tweaking makes it sound like a
gun, because a gunshot is not a tone, it is a transient followed by a resonant
body followed by a room.

So this renders the audio properly, offline, at 44.1 kHz stereo, using the
techniques sound designers actually use:

  LAYERING      every impact is three sounds — a transient (the crack that
                carries the impression of loudness), a body (the resonant mass
                of whatever moved), and a tail (the space it happened in).
                Miss any one and it reads as a synth patch.
  SPECTRAL      noise shaped with real filters, not raw white noise. A cannon is
    SHAPING     mostly low-mid; a gauss coil is a narrow metallic band; a flame
                is broadband with slow amplitude noise on top.
  CONVOLUTION   tails come from convolving with synthesised impulse responses,
                which is what puts every sound in the same believable space.
  SATURATION    soft-clipping adds the harmonics that make a sound feel loud at
                a moderate level. Digital peaks alone just sound thin.
  DYNAMICS      each asset is peak-limited and normalised so nothing clips and
                everything sits at a predictable level in the mix.

Variants matter as much as quality: three takes of every weapon, chosen at
random at play time, is what stops sustained fire turning into a machine-gun
stutter of one identical sample.

    python3 tools/make-audio.py            # renders assets/audio/*.m4a

AAC in .m4a because it is the one lossy format every target decodes — Safari on
iOS still will not touch Ogg Vorbis, and that is half the audience.
"""
import os, subprocess, shutil
import numpy as np
from scipy import signal

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio')
rng = np.random.default_rng(20260801)


# ---------------------------------------------------------------- primitives
def noise(dur, kind='white'):
    n = int(dur * SR)
    w = rng.standard_normal(n)
    if kind == 'pink':                      # 1/f — heavier, more natural
        b, a = signal.butter(1, 0.02, 'lowpass')
        w = signal.lfilter(b, a, w) * 6 + w * 0.4
    elif kind == 'brown':                   # 1/f^2 — rumble
        w = np.cumsum(w); w /= (np.abs(w).max() + 1e-9)
    return w


def env(n, attack, decay, curve=2.5, sustain=0.0, hold=0.0):
    """Percussive envelope. The exponential decay is the important part — linear
    decays are the single most recognisable tell of amateur synthesis."""
    a = max(1, int(attack * SR)); h = int(hold * SR)
    d = max(1, n - a - h)
    e = np.concatenate([
        np.linspace(0, 1, a) ** 0.6,
        np.ones(h),
        (1 - np.linspace(0, 1, d)) ** curve * (1 - sustain) + sustain,
    ])
    return np.resize(e, n)


# All three filters use SECOND-ORDER SECTIONS, not transfer-function coefficients.
# This is not a style preference. A 4th-order Butterworth at 30 Hz has a corner
# frequency of 0.0014 in normalised terms, and in b/a form that puts poles close
# enough to the unit circle that float64 rounding makes the filter blow up —
# it silently emitted NaN, the sub-bass layer came out as digital silence, and
# the rendered music bed was 20 KB of nothing. sosfilt factors the same filter
# into biquads, where the rounding has nowhere to accumulate.
def band(x, lo, hi, order=4):
    lo = max(20.0, lo); hi = min(SR / 2 - 100, hi)
    sos = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'bandpass', output='sos')
    return signal.sosfilt(sos, x)


def lp(x, f, order=4):
    sos = signal.butter(order, min(0.99, f / (SR / 2)), 'lowpass', output='sos')
    return signal.sosfilt(sos, x)


def hp(x, f, order=3):
    sos = signal.butter(order, min(0.99, f / (SR / 2)), 'highpass', output='sos')
    return signal.sosfilt(sos, x)


def lp_sweeping(x, f_lo, f_hi, mix):
    """A cutoff that moves over time. Filtering with a per-sample coefficient
    would mean a 2-million-iteration Python loop; crossfading between two fixed
    filtered copies costs two vectorised passes and is indistinguishable here."""
    a = lp(x, f_lo); b = lp(x, f_hi)
    return a * (1 - mix) + b * mix


def pad(x, n):
    """Length-match a layer to its parent buffer. Layers are designed at their
    own natural durations — a muzzle crack is not as long as its tail — so they
    have to be padded before they can be summed."""
    if len(x) >= n: return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def sweep(dur, f0, f1, kind='exp'):
    t = np.linspace(0, dur, int(dur * SR), endpoint=False)
    return signal.chirp(t, f0, dur, f1, method='logarithmic' if kind == 'exp' else 'linear')


def ir(dur=1.1, decay=5.0, bright=2600, predelay=0.008):
    """A synthesised impulse response: exponentially decaying noise, damped in
    the highs the way real air and real rooms damp them."""
    n = int(dur * SR)
    x = rng.standard_normal(n) * np.exp(-np.linspace(0, decay, n))
    x = lp(x, bright)
    pre = np.zeros(int(predelay * SR))
    x = np.concatenate([pre, x])
    return x / (np.abs(x).max() + 1e-9)


_IRS = {}
def verb(x, amount=0.25, size=1.1, decay=5.0, bright=2600):
    key = (round(size, 2), round(decay, 2), bright)
    if key not in _IRS:
        _IRS[key] = ir(size, decay, bright)
    wet = signal.fftconvolve(x, _IRS[key])[:len(x) + int(0.4 * SR)]
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry * (1 - amount * 0.5) + wet / (np.abs(wet).max() + 1e-9) * amount


def sat(x, drive=2.0):
    """Soft clip. Adds the odd harmonics that read as 'loud' and 'physical'."""
    return np.tanh(x * drive) / np.tanh(drive)


def widen(x, ms=11.0, spread=0.6):
    """Haas: a few milliseconds of delay on one side buys stereo width without
    the phase mess of a chorus."""
    d = int(ms / 1000 * SR)
    l = np.concatenate([x, np.zeros(d)])
    r = np.concatenate([np.zeros(d), x])
    m = (l + r) / 2
    return np.stack([m * (1 - spread) + l * spread, m * (1 - spread) + r * spread])


def finish(x, peak=0.80, fade=0.004):
    """Trim silence, de-click both ends, limit, normalise."""
    if x.ndim == 1:
        x = np.stack([x, x])
    mono = x.mean(0)
    nz_idx = np.where(np.abs(mono) > 1e-4)[0]
    if len(nz_idx):
        x = x[:, nz_idx[0]:nz_idx[-1] + 1]
    f = max(2, int(fade * SR))
    ramp = np.linspace(0, 1, f)
    x[:, :f] *= ramp
    x[:, -f:] *= ramp[::-1]
    x = np.tanh(x * 1.06)                       # gentle limiter
    m = np.abs(x).max()
    return x / m * peak if m > 1e-9 else x


# ------------------------------------------------------------------- designs
def cannon(seed):
    r = np.random.default_rng(seed)
    dur = 0.62
    n = int(dur * SR)
    # transient: the crack. Very short, very bright, this is the "loud" cue.
    tr = hp(noise(0.05), 1800) * env(int(0.05 * SR), 0.0004, 0.05, 5.0)
    # body: resonant low-mid thump, pitch dropping as pressure equalises
    bo = sweep(0.30, 220 + r.integers(-30, 30), 48) * env(int(0.30 * SR), 0.002, 0.30, 3.0)
    bo += band(noise(0.30, 'pink'), 90, 900) * env(int(0.30 * SR), 0.003, 0.30, 2.6) * 0.9
    # tail: air and debris
    ta = band(noise(dur, 'brown'), 40, 420) * env(n, 0.02, dur, 1.7) * 0.5
    x = np.zeros(n)
    x[:len(tr)] += tr * 1.0
    x[:len(bo)] += bo * 1.15
    x += ta
    return finish(widen(verb(sat(x, 2.2), 0.22, 1.0, 5.5, 2200), 9, 0.45))


def gauss(seed):
    r = np.random.default_rng(seed)
    dur = 0.42
    n = int(dur * SR)
    # a coil discharge: narrow metallic band plus a fast downward zip
    zip_ = sweep(0.16, 5200 + r.integers(-400, 400), 700) * env(int(0.16 * SR), 0.001, 0.16, 4.0)
    coil = band(noise(0.22), 1800, 4200) * env(int(0.22 * SR), 0.0006, 0.22, 5.0)
    thump = np.sin(2 * np.pi * 74 * np.linspace(0, 0.18, int(0.18 * SR))) * env(int(0.18 * SR), 0.001, 0.18, 3.4)
    x = np.zeros(n)
    x[:len(zip_)] += zip_ * 0.8
    x[:len(coil)] += coil * 0.7
    x[:len(thump)] += thump * 0.9
    return finish(widen(verb(sat(x, 1.8), 0.24, 0.9, 6.0, 3400), 7, 0.5))


def laser(seed):
    r = np.random.default_rng(seed)
    dur = 0.36
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    # FM: a carrier bent by a fast modulator gives the metallic, non-tonal edge
    mod = np.sin(2 * np.pi * (r.integers(90, 140)) * t) * 900
    car = np.sin(2 * np.pi * (1400 + r.integers(-150, 150)) * t + np.cumsum(mod) / SR * 2 * np.pi)
    x = car * env(n, 0.0008, dur, 4.5)
    x += band(noise(dur), 2600, 8000) * env(n, 0.0006, dur * 0.5, 6.0) * 0.35
    x += pad(sweep(0.12, 2400, 380) * env(int(0.12 * SR), 0.001, 0.12, 3.0), n) * 0.4
    return finish(widen(verb(sat(x, 1.5), 0.26, 0.85, 6.5, 4200), 6, 0.55))


def boom(seed, size=1.0):
    r = np.random.default_rng(seed)
    dur = 1.5 * size
    n = int(dur * SR)
    # sub: the part you feel. Pitch drop is what makes it read as an explosion
    # rather than a drum.
    sub = sweep(0.55 * size, 120 * (1 / size), 26) * env(int(0.55 * size * SR), 0.004, 0.55 * size, 2.2)
    # mid body: the blast itself
    bod = band(noise(0.8 * size, 'pink'), 60, 1600) * env(int(0.8 * size * SR), 0.002, 0.8 * size, 2.4)
    # crack
    cr = hp(noise(0.07), 2400) * env(int(0.07 * SR), 0.0003, 0.07, 6.0)
    # debris: sparse filtered clicks scattered through the tail
    deb = np.zeros(n)
    for _ in range(int(26 * size)):
        p = int(r.uniform(0.08, 0.85) * n)
        L = int(r.uniform(0.004, 0.02) * SR)
        if p + L < n:
            frag = pad(band(noise((L + 4) / SR), 900, 6000), L)
            deb[p:p + L] += frag * env(L, 0.0005, L / SR, 4.0) * r.uniform(0.05, 0.3)
    x = np.zeros(n)
    x[:len(cr)] += cr * 0.85
    x[:len(sub)] += sub * 1.3
    x[:len(bod)] += bod * 1.1
    x += deb
    return finish(widen(verb(sat(x, 2.6), 0.34, 1.5 * size, 4.2, 1800), 13, 0.55))


def impact(seed):
    r = np.random.default_rng(seed)
    dur = 0.3
    n = int(dur * SR)
    # struck metal: a few inharmonic partials, which is exactly what a plate is
    x = np.zeros(n)
    t = np.linspace(0, dur, n, endpoint=False)
    for f, g in [(430, 1.0), (712, 0.6), (1190, 0.42), (2310, 0.25), (3870, 0.14)]:
        f *= r.uniform(0.9, 1.1)
        x += np.sin(2 * np.pi * f * t) * np.exp(-t * (6 + f / 500)) * g
    x += pad(hp(noise(0.03), 3000) * env(int(0.03 * SR), 0.0002, 0.03, 6.0), n) * 0.7
    return finish(widen(verb(sat(x, 1.4), 0.2, 0.7, 7.0, 3800), 5, 0.4))


def flame(seed):
    dur = 0.75
    n = int(dur * SR)
    # broadband roar with slow amplitude noise — fire is turbulence, not tone
    x = band(noise(dur, 'pink'), 120, 5200)
    lfo = lp(rng.standard_normal(n), 12)
    lfo = 0.6 + 0.6 * lfo / (np.abs(lfo).max() + 1e-9)
    x *= lfo * env(n, 0.05, dur, 1.3, sustain=0.25, hold=0.25)
    x += band(noise(dur), 40, 260) * env(n, 0.06, dur, 1.5) * 0.5
    return finish(widen(verb(sat(x, 1.6), 0.25, 1.0, 5.0, 2400), 15, 0.6))


def missile(seed):
    dur = 0.9
    n = int(dur * SR)
    # launch whoosh: rising filtered noise with doppler-ish pitch climb
    x = band(noise(dur, 'pink'), 200, 3000) * env(n, 0.03, dur, 1.6, sustain=0.15)
    t = np.linspace(0, dur, n, endpoint=False)
    x *= (0.5 + t / dur)
    x += pad(sweep(0.5, 90, 300) * env(int(0.5 * SR), 0.02, 0.5, 1.4), n) * 0.5
    ig = band(noise(0.12), 300, 4000) * env(int(0.12 * SR), 0.001, 0.12, 3.5)
    x[:len(ig)] += ig * 0.9
    return finish(widen(verb(sat(x, 1.7), 0.28, 1.2, 5.0, 2600), 12, 0.6))


def sonic(seed):
    dur = 0.7
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    # two close tones beating against each other — physically the "wrong" sound
    # that reads as a weapon that ignores armour
    x = (np.sin(2 * np.pi * 186 * t) + np.sin(2 * np.pi * 193 * t)) * 0.5
    x *= env(n, 0.01, dur, 1.6, sustain=0.3)
    x += band(noise(dur), 900, 2600) * env(n, 0.02, dur, 2.0) * 0.3
    return finish(widen(verb(sat(x, 2.0), 0.3, 1.3, 4.5, 2000), 16, 0.65))


def ui_click():
    dur = 0.085
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.sin(2 * np.pi * 1180 * t) * env(n, 0.0006, dur, 7.0) * 0.7
    x += pad(hp(noise(0.012), 3600) * env(int(0.012 * SR), 0.0002, 0.012, 6.0), n) * 0.5
    return finish(widen(verb(x, 0.14, 0.5, 8.0, 6000), 3, 0.3), peak=0.55)


def ui_confirm():
    dur = 0.5
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.zeros(n)
    for i, f in enumerate([523.25, 783.99, 1046.5]):      # C5 G5 C6
        d = int(0.09 * i * SR)
        e = env(n - d, 0.004, dur - 0.09 * i, 3.0)
        x[d:] += np.sin(2 * np.pi * f * t[:n - d]) * e * (0.55 - i * 0.09)
    return finish(widen(verb(x, 0.3, 1.0, 6.0, 5000), 8, 0.5), peak=0.62)


def alarm():
    dur = 1.15
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    # two-tone klaxon with a hard square edge, filtered so it is urgent not shrill
    tone = signal.square(2 * np.pi * 3.1 * t) * 0.5 + 0.5
    f = 440 + tone * 180
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    x = lp(sat(x, 2.4), 3000) * env(n, 0.02, dur, 1.2, sustain=0.5)
    x += band(noise(dur), 200, 900) * env(n, 0.03, dur, 1.4) * 0.18
    return finish(widen(verb(x, 0.28, 1.4, 4.0, 2200), 14, 0.55), peak=0.72)


def deploy():
    dur = 2.4
    n = int(dur * SR)
    # the carrier landing: descending roar, hydraulic hiss, ground impact
    roar = band(noise(1.6, 'brown'), 30, 700) * env(int(1.6 * SR), 0.25, 1.6, 1.2, sustain=0.4)
    hiss = band(noise(0.7), 2200, 7000) * env(int(0.7 * SR), 0.02, 0.7, 2.2) * 0.35
    thud = sweep(0.7, 90, 22) * env(int(0.7 * SR), 0.004, 0.7, 2.0)
    x = np.zeros(n)
    x[:len(roar)] += roar * 0.9
    x[int(1.2 * SR):int(1.2 * SR) + len(hiss)] += hiss
    x[int(1.5 * SR):int(1.5 * SR) + len(thud)] += thud * 1.4
    return finish(widen(verb(sat(x, 2.2), 0.36, 1.8, 3.6, 1700), 18, 0.6))


def level_up():
    dur = 1.3
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.zeros(n)
    for i, f in enumerate([392, 523.25, 659.25, 783.99, 1046.5]):
        d = int(0.075 * i * SR)
        if d >= n: break
        e = env(n - d, 0.006, dur - 0.075 * i, 2.2)
        seg = (np.sin(2 * np.pi * f * t[:n - d]) +
               0.3 * np.sin(2 * np.pi * f * 2 * t[:n - d])) * e * (0.5 - i * 0.05)
        x[d:] += seg
    x += band(noise(dur), 3000, 9000) * env(n, 0.01, dur, 3.0) * 0.1
    return finish(widen(verb(x, 0.34, 1.5, 5.0, 5200), 10, 0.55), peak=0.7)


def pickup():
    dur = 0.35
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.sin(2 * np.pi * (700 + 900 * t / dur) * t) * env(n, 0.002, dur, 3.5) * 0.6
    x += pad(hp(noise(0.02), 4000) * env(int(0.02 * SR), 0.0003, 0.02, 5.0), n) * 0.4
    return finish(widen(verb(x, 0.24, 0.8, 6.5, 6000), 6, 0.45), peak=0.6)


def thrust():
    dur = 1.8
    n = int(dur * SR)
    x = band(noise(dur, 'brown'), 40, 900) * env(n, 0.35, dur, 1.1, sustain=0.55)
    x += band(noise(dur), 1200, 5000) * env(n, 0.4, dur, 1.2, sustain=0.4) * 0.25
    return finish(widen(verb(sat(x, 1.8), 0.3, 1.6, 4.0, 2000), 20, 0.65), peak=0.75)


def heal():
    dur = 0.9
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.sin(2 * np.pi * (330 + 220 * t / dur) * t) * env(n, 0.05, dur, 2.0, sustain=0.2) * 0.5
    x += np.sin(2 * np.pi * (495 + 330 * t / dur) * t) * env(n, 0.08, dur, 2.2) * 0.3
    x += band(noise(dur), 2000, 6000) * env(n, 0.06, dur, 2.4) * 0.12
    return finish(widen(verb(x, 0.34, 1.2, 5.5, 5000), 12, 0.6), peak=0.62)


def surge():
    dur = 1.0
    n = int(dur * SR)
    x = sweep(dur, 120, 1800) * env(n, 0.02, dur, 1.6, sustain=0.25)
    x += band(noise(dur), 800, 6000) * env(n, 0.03, dur, 1.8) * 0.35
    x = sat(x, 2.2)
    return finish(widen(verb(x, 0.3, 1.2, 5.0, 4000), 11, 0.6), peak=0.72)


def move_ack():
    dur = 0.2
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.sin(2 * np.pi * 880 * t) * env(n, 0.001, dur, 5.0) * 0.4
    x += np.sin(2 * np.pi * 1320 * t) * env(n, 0.001, dur * 0.7, 6.0) * 0.22
    return finish(widen(verb(x, 0.16, 0.6, 7.0, 6000), 4, 0.35), peak=0.5)


# --------------------------------------------------------------------- music
def music_layer(kind, bars=16, bpm=84):
    """Three stems that share a key and a tempo so any subset sounds intentional
    together. The game crossfades between them on combat intensity."""
    spb = 60.0 / bpm
    dur = bars * 4 * spb
    n = int(dur * SR)
    t = np.linspace(0, dur, n, endpoint=False)
    x = np.zeros(n)
    root = 55.0                                  # A1

    if kind == 'ambient':
        for mult, g in [(1, 0.5), (2, 0.28), (3, 0.14), (4.02, 0.09)]:
            drift = 1 + 0.0015 * np.sin(2 * np.pi * 0.06 * t * mult)
            x += np.sin(2 * np.pi * root * mult * t * drift) * g
        swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / (dur / 2) - np.pi / 2)
        x *= swell
        x += band(noise(dur, 'brown'), 30, 300) * 0.12
        x = lp(x, 1400)

    elif kind == 'tension':
        for mult, g in [(1, 0.42), (1.5, 0.22), (2, 0.2), (2.5, 0.1)]:
            x += np.sin(2 * np.pi * root * mult * t) * g
        # a slow pulse on the beat, felt more than heard
        for b in range(int(dur / spb)):
            p = int(b * spb * SR); L = int(0.4 * SR)
            if p + L < n:
                x[p:p + L] += np.sin(2 * np.pi * root * 2 * np.linspace(0, 0.4, L)) * env(L, 0.01, 0.4, 3.0) * 0.22
        x += band(noise(dur), 1800, 5200) * 0.035
        x = lp(x, 2600)

    else:  # combat
        for mult, g in [(1, 0.4), (2, 0.24), (3, 0.16), (4, 0.1), (6, 0.06)]:
            x += signal.sawtooth(2 * np.pi * root * mult * t, 0.5) * g * 0.5
        x = lp_sweeping(x, 1500, 3200, 0.5 + 0.5 * np.sin(2 * np.pi * t / 8))
        # kick on 1 and 3, snare-ish on 2 and 4
        for b in range(int(dur / spb)):
            p = int(b * spb * SR)
            if b % 2 == 0:
                L = int(0.32 * SR)
                if p + L < n:
                    x[p:p + L] += sweep(0.32, 130, 34) * env(L, 0.002, 0.32, 3.0) * 0.7
            else:
                L = int(0.2 * SR)
                if p + L < n:
                    x[p:p + L] += band(noise(0.2), 300, 4200) * env(L, 0.001, 0.2, 4.0) * 0.34
        x += band(noise(dur), 60, 500) * 0.06

    # loop-safe: crossfade the tail over the head so the seam is inaudible
    xf = int(1.2 * SR)
    head = x[:xf].copy()
    x[-xf:] = x[-xf:] * np.linspace(1, 0, xf) + head * np.linspace(0, 1, xf)
    x = x[:-1]
    return finish(widen(verb(x, 0.3, 2.2, 3.0, 2600), 22, 0.7), peak=0.62, fade=0.0005)


# ---------------------------------------------------------------------- main
def encode(name, stereo):
    """Write WAV then transcode to AAC. AAC because Safari on iOS still refuses
    Ogg Vorbis, and the game has to run there."""
    import wave
    pcm = np.nan_to_num(np.clip(stereo.T, -1, 1), nan=0.0, posinf=0.0, neginf=0.0)
    pcm16 = (pcm * 32767).astype('<i2')
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm16.tobytes())
    # TWO formats, and both are load-bearing.
    #
    # AAC is the only lossy codec Safari/iOS will decode, so it cannot be
    # dropped. But AAC is a licensed codec: open-source Chromium builds ship
    # WITHOUT the decoder, and decodeAudioData simply rejects every file. That
    # is not a hypothetical — every one of these assets failed to decode on the
    # first test run for exactly this reason. Firefox and Chromium-derived
    # browsers all decode Ogg Vorbis, so shipping both means the engine can pick
    # whichever the browser admits to supporting, and there is no browser left
    # without a working option.
    m4a = os.path.join(OUT, name + '.m4a')
    ogg = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', m4a],
                   check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                    '-c:a', 'libvorbis', '-q:a', '4', ogg], check=True)
    os.remove(wav)
    return os.path.getsize(m4a) + os.path.getsize(ogg)


os.makedirs(OUT, exist_ok=True)
BUILD = []
# three takes of everything fired repeatedly — one sample on repeat is the
# clearest possible signal that a game's audio is fake
for i in range(3):
    BUILD += [('shot%d' % i, lambda s=i: cannon(1000 + s)),
              ('gauss%d' % i, lambda s=i: gauss(2000 + s)),
              ('laser%d' % i, lambda s=i: laser(3000 + s)),
              ('hit%d' % i, lambda s=i: impact(4000 + s)),
              ('boom%d' % i, lambda s=i: boom(5000 + s, 1.0))]
BUILD += [
    ('boombig', lambda: boom(6100, 1.7)),
    ('boomsmall', lambda: boom(6200, 0.6)),
    ('flame', lambda: flame(7000)),
    ('missile', lambda: missile(7100)),
    ('sonic', lambda: sonic(7200)),
    ('ui', ui_click), ('confirm', ui_confirm), ('alarm', alarm),
    ('deploy', deploy), ('level', level_up), ('pickup', pickup),
    ('thrust', thrust), ('heal', heal), ('surge', surge), ('move', move_ack),
    ('mus_ambient', lambda: music_layer('ambient')),
    ('mus_tension', lambda: music_layer('tension')),
    ('mus_combat', lambda: music_layer('combat')),
]

total = 0
for name, fn in BUILD:
    sz = encode(name, fn())
    total += sz
    print('  %-14s %6.1f KB' % (name, sz / 1024))
print('%d files, %.2f MB -> %s' % (len(BUILD), total / 1048576, os.path.normpath(OUT)))
