#!/usr/bin/env python3
"""
MAKE-VOICES — render the spoken bank the game plays as ordinary samples
================================================================================
`speakVoice()` used to be `window.speechSynthesis`. That cannot work on the two
platforms this game actually ships to: Android WebView frequently has no
installed TTS voice at all (speak() is a SILENT no-op, not an error), iOS
WKWebView gates speech behind a user gesture and drops queued utterances on
backgrounding, the voice is whatever the host OS happens to have, and none of it
passes through the mixer — no volume slider, no ducking, no priority culling.

So every line is rendered ahead of time, offline, and delivered as an ordinary
`AUD_MAP` slot. That is the whole trick: voice then inherits format selection,
decoding, the sfx bus, ducking and priority for free, and `speechSynthesis`
survives only as `speakVoiceFallback()` for a build whose audio has not arrived.

WHAT IT RENDERS
    keen    KEEL/KEEN, the tutorial liaison. 54 takes, one per authored line id.
            The ids are NOT hashes of the copy — a hash means a typo fix
            silently orphans the take, which is exactly how this shipped broken.
            They are the ids `speak()` passes as its 4th argument.
    nova / ascendancy / syndicate / horde
            The command-radio bank. 9 actions x 3 variants each, read straight
            out of RADIO_COPY in src/audio.js.

    Copy is EXTRACTED FROM THE SOURCE, never retyped here. One source of truth
    means the rendered take and the on-screen bubble cannot drift apart, and
    `--check` reports a take whose copy has changed since it was rendered.

THE CHAIN
    Kokoro-82M (one distinct voice per speaker) -> ffmpeg comms filter:
      band-limit 350-3000 Hz     a radio is not full-range; this is most of the
                                 "comms" impression on its own
      hard AGC-style compression a real radio rides gain brutally, so a shouted
                                 line and a muttered one arrive at one level
      drive into a limiter       grit, and a hard ceiling so forty overlapping
                                 samples cannot clip the master bus
      pink-noise carrier bed     ~-38 dB, running under and slightly past the
                                 speech, which is what sells "channel open"

TWO FORMATS, AND IT IS NOT REDUNDANCY
    `.m4a` (AAC) is the only lossy codec iOS decodes. Open-source Chromium
    builds ship NO AAC decoder at all — on the first test run every asset
    failed to decode for precisely that reason, with no error beyond a rejected
    promise. `.ogg` covers Firefox and every Chromium derivative. `audExt()`
    asks the browser which one it can play, so both must exist.

IT NEVER FAKES A TAKE
    If Piper or a voice model is missing this exits non-zero with the command
    that would fix it, and writes nothing. A silent .ogg that satisfies a
    manifest is strictly worse than a missing file: it turns a loud failure
    (404, AUD.failed climbs, fallback fires) into a quiet one (buffer decodes,
    slot reports ready, player hears nothing and reports "no voice").

USAGE
    python3 tools/make-voices.py --check              # what is missing, no render
    python3 tools/make-voices.py --list               # every id and its copy
    python3 tools/make-voices.py --download           # fetch the Piper models
    python3 tools/make-voices.py                      # render everything missing
    python3 tools/make-voices.py --speaker keen       # just the tutorial liaison
    python3 tools/make-voices.py --force              # re-render even if current
    python3 tools/make-voices.py --manifest-only      # rebuild json from disk

    Run with Python 3.10-3.12 and the local Kokoro toolchain. Model weights stay
    in the tooling cache and never enter the APK. Override casting with, for
    example, --voice keen=af_heart.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from hashlib import sha1

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_TUTORIAL = os.path.join(ROOT, 'src', 'tutorial.js')
SRC_AUDIO = os.path.join(ROOT, 'src', 'audio.js')
OUT_DIR = os.path.join(ROOT, 'assets', 'audio', 'voice')
VOICE_JSON = os.path.join(ROOT, 'assets', 'audio', 'voice.json')
PACK_JSON = os.path.join(ROOT, 'assets', 'audio', 'voice.pack.json')

FORMATS = ('ogg', 'm4a')

# Bump when the filter chain changes so every take re-renders instead of the
# bank ending up half old-chain and half new — an audible, hard-to-spot bug.
CHAIN_REV = 'kokoro-comms-1'

# MONO, 22.05 kHz, and both are deliberate.
#   Mono because sfxSample() puts every buffer through its own StereoPanner and
#   derives the pan from world position. A stereo file with two identical
#   channels doubles the download, doubles the decoded AudioBuffer resident in
#   RAM, and cannot survive the panner anyway.
#   22.05 kHz because the comms chain band-limits to 3 kHz. Nyquist at 22.05 is
#   11 kHz — nearly four times the highest surviving frequency. It is also
#   Piper's native rate, so nothing is upsampled and then thrown away.
# Together these are the difference between an ~11 MB bank and an ~4 MB one,
# which is the number the installer-vs-pack decision turns on.
OUT_RATE = 22050
OGG_QUALITY = '1'          # libvorbis -q:a, ~40 kbps mono at this rate
AAC_BITRATE = '40k'

# Floors a real spoken take clears easily. Anything under them is a broken
# render, and a broken render must not reach the bank: a decodable silent file
# turns a loud failure (404 -> AUD.failed -> fallback) into a quiet one.
MIN_SECONDS = 0.45
MIN_PEAK_DB = -45.0

# ---------------------------------------------------------------------------
# CASTING
# One distinct Kokoro voice per speaker. `length` is delivery length (>1 is
# slower); `pitch` is an ffmpeg resample shift with the tempo put back, so the
# timbre moves without the delivery speeding up. These mirror the per-faction
# rate/pitch table speakVoiceFallback() already uses, moderated — a 0.52 pitch
# on a synthesised voice reads as a joke rather than as a big machine.
# ---------------------------------------------------------------------------
SPEAKERS = {
    'keen':       {'model': 'af_heart',   'length': 0.98, 'pitch': 1.02},
    'nova':       {'model': 'am_michael', 'length': 1.00, 'pitch': 1.00},
    'ascendancy': {'model': 'bm_george',  'length': 1.08, 'pitch': 0.92},
    'syndicate':  {'model': 'af_bella',   'length': 0.95, 'pitch': 1.06},
    'horde':      {'model': 'bm_fable',   'length': 1.12, 'pitch': 0.84},
}
RADIO_SPEAKERS = ('nova', 'ascendancy', 'syndicate', 'horde')


# ===========================================================================
# READING THE SCRIPT OUT OF THE SOURCE
# A tiny JS string scanner rather than a regex. The copy contains apostrophes,
# em dashes, \u escapes and '+' continuations across lines, and every one of
# those breaks a regex quietly — which for this tool means rendering the wrong
# words, the single worst failure available to it.
# ===========================================================================

_ESC = {'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f', 'v': '\v', '0': '\0'}


def _read_string(s, i):
    """s[i] is a quote. Return (value, index just past the closing quote)."""
    q = s[i]
    i += 1
    out = []
    while i < len(s):
        c = s[i]
        if c == '\\':
            n = s[i + 1]
            if n == 'u':
                if s[i + 2] == '{':
                    j = s.index('}', i + 3)
                    out.append(chr(int(s[i + 3:j], 16)))
                    i = j + 1
                else:
                    out.append(chr(int(s[i + 2:i + 6], 16)))
                    i += 6
                continue
            if n == 'x':
                out.append(chr(int(s[i + 2:i + 4], 16)))
                i += 4
                continue
            if n == '\n':                       # line continuation
                i += 2
                continue
            out.append(_ESC.get(n, n))
            i += 2
            continue
        if c == q:
            return ''.join(out), i + 1
        out.append(c)
        i += 1
    raise ValueError('unterminated string literal near offset %d' % i)


def _skip_comment(s, i):
    """Return the index past a comment starting at i, or i if there is none."""
    if s.startswith('/*', i):
        return s.index('*/', i + 2) + 2
    if s.startswith('//', i):
        j = s.find('\n', i)
        return len(s) if j < 0 else j + 1
    return i


def _values(s, lo, hi):
    """Every string expression in s[lo:hi]. A run of literals joined by `+` is
       one value, so a line broken across source lines stays one line."""
    out, pending, concat = [], None, False
    i = lo
    while i < hi:
        c = s[i]
        j = _skip_comment(s, i)
        if j != i:
            i = j
            continue
        if c in '"\'':
            v, i = _read_string(s, i)
            if concat and pending is not None:
                pending += v
            else:
                if pending is not None:
                    out.append(pending)
                pending = v
            concat = False
            continue
        if c == '+':
            concat = True
            i += 1
            continue
        if not c.isspace():
            concat = False
        i += 1
    if pending is not None:
        out.append(pending)
    return out


def _match_bracket(s, i):
    """s[i] is one of ({[. Return the index of its partner, strings and comments
       skipped."""
    pairs = {'(': ')', '[': ']', '{': '}'}
    stack = [pairs[s[i]]]
    i += 1
    while i < len(s):
        j = _skip_comment(s, i)
        if j != i:
            i = j
            continue
        c = s[i]
        if c in '"\'':
            _, i = _read_string(s, i)
            continue
        if c in pairs:
            stack.append(pairs[c])
            i += 1
            continue
        if c in ')]}':
            if c != stack[-1]:
                raise ValueError('mismatched %r at offset %d' % (c, i))
            stack.pop()
            if not stack:
                return i
            i += 1
            continue
        i += 1
    raise ValueError('unbalanced bracket from offset %d' % i)


def _members(s, lo, hi):
    """Split the inside of an object/array literal into top-level member spans:
       [(start, end)]. Commas inside nested braces, brackets, parens, strings
       and comments do not split — `test:function(){ for(a,b) }` is one member."""
    out, start, depth = [], lo, 0
    i = lo
    while i < hi:
        j = _skip_comment(s, i)
        if j != i:
            i = j
            continue
        c = s[i]
        if c in '"\'':
            _, i = _read_string(s, i)
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ',' and depth == 0:
            out.append((start, i))
            start = i + 1
        i += 1
    if s[start:hi].strip():
        out.append((start, hi))
    return out


_KEY = re.compile(r'\s*(?:([A-Za-z_$][\w$]*)|[\'"]([^\'"]+)[\'"])\s*:')


def _entries(s, lo, hi):
    """Object members as [(key, value_lo, value_hi)]."""
    out = []
    for a, b in _members(s, lo, hi):
        m = _KEY.match(s, a, b)
        if not m:
            continue
        out.append((m.group(1) or m.group(2), m.end(), b))
    return out


def _decl(src, name, path):
    """Locate `var NAME=` / `const NAME=` and return the index of the value."""
    m = re.search(r'\b(?:var|let|const)\s+' + re.escape(name) + r'\s*=\s*', src)
    if not m:
        die('%s: could not find the declaration of %s. The script moved or was '
            'renamed; this tool reads the copy from source on purpose and will '
            'not guess at it.' % (path, name))
    return m.end()


def _scalar(src, name, path):
    i = _decl(src, name, path)
    j = i
    depth = 0
    while j < len(src):
        k = _skip_comment(src, j)
        if k != j:
            j = k
            continue
        c = src[j]
        if c in '"\'':
            _, j = _read_string(src, j)
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == ';' and depth == 0:
            break
        j += 1
    vals = _values(src, i, j)
    if len(vals) != 1:
        die('%s: expected exactly one string for %s, found %d' % (path, name, len(vals)))
    return vals[0]


def _array(src, name, path):
    i = _decl(src, name, path)
    if src[i] != '[':
        die('%s: %s is not an array literal' % (path, name))
    return _values(src, i + 1, _match_bracket(src, i))


def _object(src, name, path):
    i = _decl(src, name, path)
    if src[i] != '{':
        die('%s: %s is not an object literal' % (path, name))
    end = _match_bracket(src, i)
    out = {}
    for key, a, b in _entries(src, i + 1, end):
        vals = _values(src, a, b)
        out[key] = vals
    return out


def keen_script():
    """The 54 authored KEEN takes, in the order the player meets them.

       The ids here are the contract with src/tutorial.js: they are what
       `speak(text, hold, kind, id)` passes and what `keenLineId()` normalises,
       and `voReady('keen', id)` probes `vo_keen_<id>`. If a line is added to
       the script, it appears here automatically and `--check` reports the
       missing take instead of the player silently getting synthesis."""
    src = read(SRC_TUTORIAL)
    out = []

    i = _decl(src, 'STEPS', SRC_TUTORIAL)
    if src[i] != '[':
        die('%s: STEPS is not an array literal' % SRC_TUTORIAL)
    for a, b in _members(src, i + 1, _match_bracket(src, i)):
        s = src.find('{', a)
        if s < 0 or s >= b:
            continue
        step = {}
        for key, va, vb in _entries(src, s + 1, _match_bracket(src, s)):
            if key in ('id', 'say', 'done'):
                vals = _values(src, va, vb)
                if vals:
                    step[key] = vals[0]
        if 'id' not in step:
            die('%s: a STEPS entry has no id' % SRC_TUTORIAL)
        if 'say' in step:
            out.append(('step_' + step['id'], step['say']))
        if 'done' in step:
            out.append(('done_' + step['id'], step['done']))

    out.append(('greeting', _scalar(src, 'GREETING', SRC_TUTORIAL)))
    out.append(('skip', _scalar(src, 'SKIP_LINE', SRC_TUTORIAL)))
    out.append(('graduation', _scalar(src, 'GRADUATION', SRC_TUTORIAL)))

    for n, t in enumerate(_array(src, 'BASE_ATTACK_LINES', SRC_TUTORIAL)):
        out.append(('react_base_attack%d' % n, t))
    for n, t in enumerate(_array(src, 'UNIT_LOST_LINES', SRC_TUTORIAL)):
        out.append(('react_unit_lost%d' % n, t))
    out.append(('react_low_power', _scalar(src, 'LOW_POWER_LINE', SRC_TUTORIAL)))
    out.append(('react_wave', _scalar(src, 'WAVE_LINE', SRC_TUTORIAL)))
    # checkReactive() resolves an unknown map to the literal key 'default', so
    # the take for HAZARD_LINES._default is react_hazard_default, not __default.
    for key, vals in _object(src, 'HAZARD_LINES', SRC_TUTORIAL).items():
        if not vals:
            continue
        out.append(('react_hazard_' + key.lstrip('_'), vals[0]))

    seen = set()
    for lid, _ in out:
        if lid in seen:
            die('duplicate KEEN line id %r — two lines cannot share one take' % lid)
        seen.add(lid)
    return out


def radio_script():
    """RADIO_COPY out of src/audio.js: 9 actions x 3 variants x 4 factions."""
    copy = _object(read(SRC_AUDIO), 'RADIO_COPY', SRC_AUDIO)
    out = []
    for fac in RADIO_SPEAKERS:
        for action, lines in copy.items():
            for n, text in enumerate(lines):
                out.append((fac, action, n, text))
    return out


def build_bank(speakers):
    """[(speaker, action, take_index, stem, text)] for every take we intend to
       have, filtered to the requested speakers."""
    bank = []
    if 'keen' in speakers:
        for lid, text in keen_script():
            bank.append(('keen', lid, 0, 'keen_' + lid, text))
    for fac, action, n, text in radio_script():
        if fac in speakers:
            bank.append((fac, action, n, '%s_%s_%d' % (fac, action, n), text))
    return bank


# ===========================================================================
# SPOKEN FORM
# The bubble is written to be READ. Arrows, chevrons and the ✓ glyph are
# navigation, not words; a TTS engine either names them ("right arrow") or
# drops them mid-sentence. Menu paths get spoken as paths.
# ===========================================================================

_SPOKEN = [
    (re.compile(r'\s*[→➜➛➤➔➙⇨▶➜]\s*'), ' then '),
    (re.compile(r'\s*[—–]\s*'), ', '),
    (re.compile(r'\s*·\s*'), ', '),
    (re.compile(r'✓|✔'), 'the confirm tick'),
    (re.compile(r'(\d)\s*x\b'), r'\1 times'),
    (re.compile(r'\.mfsave'), ' dot M F save'),
    (re.compile(r'A-MOVE'), 'attack move'),
    # Anything left in these blocks is decoration: HUD icons, warning glyphs,
    # the faction diamonds. Strip rather than let the engine improvise.
    (re.compile(r'[•◆◇●■□⚠⛏✕✖⛨⛊'
                r'⬟⬡⬢⬣⧫✦✧⭐★☆⚙⚓'
                r'⌒⌚⌾⌗⌘↻↺⌘△▽⬜'
                r'⚀-⚟⚡⛄☁☃☄⛰⬆-⬍'
                r'Ⅰ-ⅿⒶ-ⓩ─-╿▀-▟'
                r'\U0001f300-\U0001faff]+'), ' '),
    (re.compile(r'\s{2,}'), ' '),
    (re.compile(r'\s+([,.;:!?])'), r'\1'),
    (re.compile(r'(,\s*){2,}'), ', '),
]


def spoken(text):
    out = text
    for pat, rep in _SPOKEN:
        out = pat.sub(rep, out)
    return out.strip(' ,')


# ===========================================================================
# RENDER
# ===========================================================================

def chain(pitch, seconds):
    """The comms filter graph. `seconds` is the post-pitch duration, needed to
       place the tail fade — the pink bed runs past the speech, so without an
       explicit fade the take ends on a click."""
    tail = 0.12
    total = seconds + tail
    fade_at = max(0.0, total - 0.06)
    vox = [
        'aformat=sample_fmts=fltp:channel_layouts=mono',
        # Pitch: resample the timeline, then put the tempo back. Shifts timbre
        # without turning a briefing into an auctioneer.
        'asetrate=22050*%.6f' % pitch,
        'aresample=44100',
        'atempo=%.6f' % (1.0 / pitch),
        # Piper leaves a little room at the head; a radio does not.
        'silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB',
        # Band-limit. Twice each, for a steeper skirt than one biquad gives.
        'highpass=f=350', 'highpass=f=350',
        'lowpass=f=3000', 'lowpass=f=3000',
        'acompressor=threshold=-22dB:ratio=12:attack=4:release=90:makeup=10',
        'alimiter=level_in=3:level_out=0.92:limit=0.9',
        'apad=pad_dur=%.3f' % tail,
        'afade=t=in:st=0:d=0.015',
    ]
    return (
        'anoisesrc=color=pink:sample_rate=44100:amplitude=0.0126[bed];'
        '[0:a]' + ','.join(vox) + '[vox];'
        '[vox][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix];'
        '[mix]afade=t=out:st=%.3f:d=0.06,'
        'aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=mono[o]'
        % (fade_at, OUT_RATE)
    )


def wav_seconds(path):
    out = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
               '-of', 'csv=p=0', path])
    return float(out.strip())


def kokoro_wav(cfg, voice, text, raw):
    """Render one source WAV with the official Kokoro Python pipeline.

       Pipelines are cached by language because constructing one loads the
       82M model. British and American voices require matching G2P language
       codes even though they share the same model weights."""
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except Exception as e:
        raise RuntimeError('Kokoro is unavailable (%s). Run this tool with '
                           'Python 3.10-3.12 and PYTHONPATH=.toolchains/kokoro.' % e)
    lang = 'b' if voice.startswith('b') else 'a'
    pipeline = KOKORO_PIPELINES.get(lang)
    if pipeline is None:
        pipeline = KPipeline(lang_code=lang)
        KOKORO_PIPELINES[lang] = pipeline
    chunks = []
    for _graphemes, _phonemes, audio in pipeline(
            spoken(text), voice=voice, speed=1.0 / cfg['length'], split_pattern=r'\n+'):
        if audio is not None and len(audio):
            chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        raise RuntimeError('Kokoro produced no audio for %s' % voice)
    sf.write(raw, np.concatenate(chunks), 24000, subtype='PCM_16')


def render_take(cfg, model, text, stem, tmp, log):
    """Kokoro -> comms chain -> one intermediate WAV -> both containers.

       Both formats come off the SAME filtered WAV. Encoding the .m4a from the
       .ogg would stack two lossy passes on a band-limited 3 kHz signal, and
       that is audible."""
    raw = os.path.join(tmp, stem + '.raw.wav')
    mix = os.path.join(tmp, stem + '.mix.wav')
    kokoro_wav(cfg, model, text, raw)
    if not os.path.exists(raw) or os.path.getsize(raw) < 1024:
        raise RuntimeError('Kokoro failed to write a usable source WAV for %s' % stem)

    seconds = wav_seconds(raw) / cfg['pitch']
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
         '-filter_complex', chain(cfg['pitch'], seconds), '-map', '[o]',
         '-c:a', 'pcm_s16le', '-ar', str(OUT_RATE), '-ac', '1', mix])

    # THE GUARD THAT MATTERS. A bank of 162 valid-but-silent files passes every
    # count, satisfies every manifest, decodes without error — and fails every
    # player, quietly, in exactly the way this issue already failed once. So a
    # take that is too short or too quiet is refused rather than written.
    dur = wav_seconds(mix)
    peak = peak_db(mix)
    if dur < MIN_SECONDS:
        raise RuntimeError('%s came out %.2fs — too short to be a spoken line; '
                           'refusing to write it' % (stem, dur))
    if peak is None or peak < MIN_PEAK_DB:
        raise RuntimeError('%s rendered effectively silent (peak %s dBFS) — '
                           'refusing to write it' % (stem, peak))

    sizes = {}
    for fmt in FORMATS:
        dst = os.path.join(OUT_DIR, stem + '.' + fmt)
        args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', mix]
        if fmt == 'ogg':
            args += ['-c:a', 'libvorbis', '-q:a', OGG_QUALITY]
        else:
            args += ['-c:a', 'aac', '-b:a', AAC_BITRATE, '-movflags', '+faststart']
        run(args + ['-ar', str(OUT_RATE), '-ac', '1', dst])
        if not os.path.exists(dst) or os.path.getsize(dst) < 512:
            raise RuntimeError('%s.%s did not encode' % (stem, fmt))
        # Re-read what was actually written, not what we asked for. An encoder
        # that produced a header and no audio is the silent-file failure with
        # extra steps.
        back = peak_db(dst)
        if back is None or back < MIN_PEAK_DB:
            raise RuntimeError('%s.%s decodes to silence (peak %s dBFS)'
                               % (stem, fmt, back))
        sizes[fmt] = os.path.getsize(dst)

    for f in (raw, mix):
        try:
            os.remove(f)
        except OSError:
            pass
    log('  %-32s %5.2fs %6.1f dB  ogg %6d  m4a %6d'
        % (stem, dur, peak, sizes['ogg'], sizes['m4a']))
    return sizes, round(dur, 3), round(peak, 1)


def disk_bytes():
    if not os.path.isdir(OUT_DIR):
        return 0
    return sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR))


def human(n):
    return '%.0f KB' % (n / 1024.0) if n < 1048576 else '%.2f MB' % (n / 1048576.0)


def peak_db(path):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path,
                        '-af', 'volumedetect', '-f', 'null', os.devnull],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    m = re.search(r'max_volume:\s*(-?[\d.]+) dB', p.stderr.decode('utf-8', 'replace'))
    return float(m.group(1)) if m else None


# ===========================================================================
# STATE / MANIFESTS
# ===========================================================================

def take_sha(text, cfg, model):
    """Identity of a rendered take: the words, the voice and the chain. Change
       any one and the file on disk is stale — which is the drift `--check`
       exists to catch, because nothing at runtime can notice it."""
    key = '\x1f'.join([spoken(text), os.path.basename(model), CHAIN_REV,
                       '%.3f' % cfg['length'], '%.3f' % cfg['pitch']])
    return sha1(key.encode('utf-8')).hexdigest()[:16]


def load_state():
    try:
        with open(VOICE_JSON, 'r', encoding='utf-8') as f:
            return json.load(f).get('takes') or {}
    except Exception:
        return {}


def rebuild_state(full_bank, state, log=None):
    """Self-heal the take record from what is actually on disk.

       The record in voice.json is a CACHE. The truth is the pair of files plus
       the copy in src/. So any take whose files exist but whose record is
       missing is re-measured and re-recorded rather than being dropped from
       the manifest — otherwise `--speaker keen` on Monday quietly unpublishes
       the radio bank rendered on Friday, and the files sit there unreferenced."""
    healed = 0
    for speaker, action, _n, stem, text in full_bank:
        if stem in state:
            continue
        paths = [os.path.join(OUT_DIR, stem + '.' + f) for f in FORMATS]
        if not all(os.path.exists(p) and os.path.getsize(p) > 512 for p in paths):
            continue
        cfg = SPEAKERS[speaker]
        try:
            secs, peak = wav_seconds(paths[0]), peak_db(paths[0])
        except Exception:
            continue
        state[stem] = {'sha': take_sha(text, cfg, cfg['model']),
                       'voice': cfg['model'], 'chain': CHAIN_REV,
                       'seconds': round(secs, 3),
                       'peak': round(peak, 1) if peak is not None else None,
                       'ogg': os.path.getsize(paths[0]), 'm4a': os.path.getsize(paths[1])}
        healed += 1
    if healed and log:
        log('recovered %d take record(s) by measuring the files on disk' % healed)
    return state


def take_status(stem, want_sha, state):
    """'ok' | 'missing' | 'partial' | 'stale'"""
    have = [os.path.exists(os.path.join(OUT_DIR, stem + '.' + f)) and
            os.path.getsize(os.path.join(OUT_DIR, stem + '.' + f)) > 512 for f in FORMATS]
    if not any(have):
        return 'missing'
    if not all(have):
        return 'partial'
    rec = state.get(stem)
    if not rec or rec.get('sha') != want_sha:
        return 'stale'
    return 'ok'


def write_manifests(bank, state, log):
    """voice.json describes WHAT IS ON DISK, never what was intended.

       A manifest that names takes which are not there is the failure this
       whole issue was: audLoad() 404s on every one, AUD.failed climbs, and
       voReady() returns null forever while the bank looks populated. If a
       speaker has no rendered takes it does not appear; if nothing at all is
       rendered, voice.json is not written and the game behaves exactly as it
       does today — cleanly, on the fallback."""
    lines, takes, pack = {}, {}, []
    for speaker, action, _n, stem, _text in sorted(bank, key=lambda t: (t[0], t[1], t[2])):
        rec = state.get(stem)
        if not rec:
            continue
        if not all(os.path.exists(os.path.join(OUT_DIR, stem + '.' + f)) for f in FORMATS):
            continue
        lines.setdefault(speaker, {}).setdefault(action, []).append(stem)
        takes[stem] = rec
    # `bank` here is ALWAYS the full five-speaker bank, never the --speaker
    # subset. Rendering one speaker must not delete the other four from the
    # manifest while their files sit on disk — that is the same shape of bug as
    # the gate and the player disagreeing about a key, and just as invisible.

    if not takes:
        log('no rendered takes on disk — leaving voice.json unwritten so the '
            'game keeps falling back cleanly instead of 404ing a manifest')
        return 0

    for stem in sorted(takes):
        for fmt in FORMATS:
            p = os.path.join(OUT_DIR, stem + '.' + fmt)
            pack.append({'name': stem + '.' + fmt, 'size': os.path.getsize(p)})

    doc = {
        '_note': 'GENERATED by tools/make-voices.py — do not hand-edit. '
                 'Re-run the tool; see docs/VOICE-PIPELINE.md.',
        'generated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'chain': CHAIN_REV,
        'voices': {s: SPEAKERS[s]['model'] for s in sorted(lines)},
        'lines': lines,
        'takes': takes,
    }
    write_json(VOICE_JSON, doc)

    # The fragment the release publisher merges into packs.json. assetpack.js
    # keys stored blobs by name+size, so these sizes are load-bearing: a wrong
    # one re-downloads the file forever or serves a stale blob.
    write_json(PACK_JSON, {
        '_note': 'GENERATED by tools/make-voices.py. Merge packs.voice into the '
                 'release packs.json and upload assets/audio/voice/* to '
                 '<endpoint>/pack/voice/.',
        'packs': {'voice': {'bytes': sum(f['size'] for f in pack), 'files': pack}},
    })
    return len(takes)


def write_json(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write('\n')


# ===========================================================================
# PLUMBING
# ===========================================================================

KOKORO_PIPELINES = {}


def die(msg, code=2):
    sys.stderr.write('make-voices: ' + msg + '\n')
    sys.exit(code)


def read(path):
    if not os.path.exists(path):
        die('%s is missing — this tool reads the copy out of the source and '
            'cannot run without it' % path)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def run(args):
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError('%s failed:\n%s' % (args[0], p.stderr.decode('utf-8', 'replace')[-800:]))
    return p.stdout.decode('utf-8', 'replace')


def find_piper():
    exe = shutil.which('piper')
    if exe:
        return [exe]
    try:
        subprocess.run([sys.executable, '-m', 'piper', '--help'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return [sys.executable, '-m', 'piper']
    except Exception:
        return None


def voices_dir(arg):
    """Where the .onnx models live. Deliberately OUTSIDE the repo by default —
       a medium Piper voice is ~63 MB and five of them is 300 MB of toolchain
       that has no business in a game checkout."""
    return os.path.abspath(arg or os.environ.get('MASSFRONT_PIPER_VOICES')
                           or os.path.join(os.path.expanduser('~'),
                                           '.local', 'share', 'massfront', 'piper-voices'))


def model_path(name, vdir):
    if os.path.isabs(name) or os.sep in name:
        return name
    return os.path.join(vdir, name + '.onnx')


def download_models(names, vdir, log):
    os.makedirs(vdir, exist_ok=True)
    log('downloading %d Piper voice(s) into %s' % (len(names), vdir))
    cmd = [sys.executable, '-m', 'piper.download_voices', '--download-dir', vdir] + list(names)
    p = subprocess.run(cmd)
    if p.returncode != 0:
        die('voice download failed. Fetch them by hand from '
            'https://huggingface.co/rhasspy/piper-voices and drop the .onnx and '
            '.onnx.json pairs into %s' % vdir)


# ===========================================================================
# MAIN
# ===========================================================================

def main(argv=None):
    ap = argparse.ArgumentParser(
        prog='make-voices.py',
        description='Render the KEEN and command-radio voice bank into '
                    'assets/audio/voice/ as .ogg + .m4a.')
    ap.add_argument('--check', action='store_true',
                    help='report which takes are missing or stale and exit; '
                         'renders nothing, writes nothing, exits 1 if incomplete')
    ap.add_argument('--deep', action='store_true',
                    help='with --check: decode every file and measure it, so a '
                         'bank of valid-but-silent takes fails instead of passing')
    ap.add_argument('--list', action='store_true',
                    help='print every take id with the copy it will speak, and exit')
    ap.add_argument('--speaker', action='append', default=[],
                    help='render only this speaker (repeatable). Default: all. '
                         'One of: ' + ', '.join(sorted(SPEAKERS)))
    ap.add_argument('--take', action='append', default=[], metavar='STEM',
                    help='render one exact take id for casting/QA (repeatable)')
    ap.add_argument('--voice', action='append', default=[], metavar='SPEAKER=MODEL',
                    help='override one speaker with a Kokoro voice id')
    ap.add_argument('--download', action='store_true',
                    help='compatibility flag; Kokoro fetches its official weights on first render')
    ap.add_argument('--force', action='store_true',
                    help='re-render takes that are already current')
    ap.add_argument('--manifest-only', action='store_true',
                    help='rebuild voice.json / voice.pack.json from what is on '
                         'disk, without rendering')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args(argv)

    log = ((lambda *m, **k: None) if a.quiet
           else (lambda *m, **k: print(*m, flush=True, **k)))

    speakers = a.speaker or sorted(SPEAKERS)
    for s in speakers:
        if s not in SPEAKERS:
            die('unknown speaker %r; known: %s' % (s, ', '.join(sorted(SPEAKERS))))

    cast = {s: dict(SPEAKERS[s]) for s in speakers}
    for ov in a.voice:
        if '=' not in ov:
            die('--voice wants SPEAKER=MODEL, got %r' % ov)
        s, m = ov.split('=', 1)
        if s not in cast:
            die('--voice names %r, which is not among the selected speakers' % s)
        cast[s]['model'] = m

    full_bank = build_bank(set(SPEAKERS))
    bank = build_bank(set(speakers))
    if a.take:
        wanted_takes=set(a.take)
        bank=[b for b in bank if b[3] in wanted_takes]
        missing_takes=wanted_takes-{b[3] for b in bank}
        if missing_takes:
            die('unknown take id(s): %s' % ', '.join(sorted(missing_takes)))
    if not bank:
        die('nothing to render')

    if a.list:
        for speaker, action, n, stem, text in bank:
            print('%-10s %-24s %s' % (speaker, action, spoken(text)))
        print('\n%d takes across %d speaker(s)' % (len(bank), len(speakers)))
        return 0

    state = rebuild_state(full_bank, load_state(), log if a.manifest_only else None)
    wanted = {}
    for speaker, action, n, stem, text in bank:
        wanted[stem] = take_sha(text, cast[speaker], cast[speaker]['model'])

    buckets = {'ok': [], 'missing': [], 'partial': [], 'stale': [], 'silent': []}
    for speaker, action, n, stem, text in bank:
        buckets[take_status(stem, wanted[stem], state)].append(stem)

    # ---- report ----------------------------------------------------------
    if a.check:
        secs = 0.0
        if a.deep:
            # Re-measure every byte on disk instead of trusting the record.
            # A count is not evidence: 162 decodable silent files satisfy every
            # manifest in this repo and are worthless to a player.
            log('deep check: decoding %d file(s)…' % (len(buckets['ok']) * len(FORMATS)))
            still_ok = []
            for stem in buckets['ok']:
                bad = None
                for fmt in FORMATS:
                    p = os.path.join(OUT_DIR, stem + '.' + fmt)
                    try:
                        d, pk = wav_seconds(p), peak_db(p)
                    except Exception as e:
                        bad = '%s unreadable (%s)' % (fmt, str(e).splitlines()[0][:80])
                        break
                    if d < MIN_SECONDS or pk is None or pk < MIN_PEAK_DB:
                        bad = '%s is %.2fs at %s dBFS' % (fmt, d, pk)
                        break
                    if fmt == FORMATS[0]:
                        secs += d
                if bad:
                    buckets['silent'].append('%s (%s)' % (stem, bad))
                else:
                    still_ok.append(stem)
            buckets['ok'] = still_ok

        keen_n = sum(1 for b in bank if b[0] == 'keen')
        keen_ok = sum(1 for s in buckets['ok'] if s.startswith('keen_'))
        log('bank        : %d takes (%d KEEN + %d radio) across %s'
            % (len(bank), keen_n, len(bank) - keen_n, ', '.join(speakers)))
        log('formats     : %s (both are required — AAC for iOS, Ogg for '
            'AAC-less Chromium)' % ', '.join('.' + f for f in FORMATS))
        log('output      : %s' % os.path.relpath(OUT_DIR, ROOT))
        log('playable    : %d of %d   (KEEN %d of %d)'
            % (len(buckets['ok']), len(bank), keen_ok, keen_n))
        log('missing     : %d' % len(buckets['missing']))
        log('half-written: %d' % len(buckets['partial']))
        log('stale       : %d  (copy, voice or chain changed since render)'
            % len(buckets['stale']))
        if a.deep:
            log('silent/short: %d  (decoded and measured)' % len(buckets['silent']))
            log('audio on disk: %s across %d file(s), %.1f s of speech'
                % (human(disk_bytes()), len(os.listdir(OUT_DIR))
                   if os.path.isdir(OUT_DIR) else 0, secs))
        for kind in ('missing', 'partial', 'stale', 'silent'):
            if buckets[kind]:
                log('\n%s:' % kind.upper())
                for stem in buckets[kind]:
                    log('  %s' % stem)
        bad = sum(len(buckets[k]) for k in ('missing', 'partial', 'stale', 'silent'))
        if bad:
            log('\n%d of %d takes are NOT playable. KEEN and unit radio fall back '
                'to speechSynthesis, which is a silent no-op on Android WebView.'
                % (bad, len(bank)))
            log('Render them with the Kokoro toolchain; see docs/VOICE-PIPELINE.md')
            return 1
        log('\nALL %d TAKES PRESENT AND CURRENT — the bank the game asks for is '
            'complete.' % len(bank))
        return 0

    if a.manifest_only:
        os.makedirs(OUT_DIR, exist_ok=True)
        n = write_manifests(full_bank, state, log)
        log('manifest rebuilt from disk: %d takes' % n)
        return 0

    # ---- render ----------------------------------------------------------
    todo = [b for b in bank if a.force or take_status(b[3], wanted[b[3]], state) != 'ok']
    if not todo:
        log('all %d takes are current; nothing to render' % len(bank))
        write_manifests(full_bank, state, log)
        return 0

    try:
        from kokoro import KPipeline as _KokoroCheck
    except Exception as e:
        die('Kokoro is not available in this Python environment (%s).\n'
            'Use Python 3.10-3.12 and install kokoro>=0.9.4 + soundfile, or run '
            'through tools/render-kokoro-voices.bat. Nothing has been written.' % e)
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        die('ffmpeg/ffprobe are not on PATH. The comms chain and both encoders '
            'need them.\n  apt install ffmpeg   (or brew install ffmpeg)')
    log('engine      : Kokoro-82M (weights/toolchain remain outside game assets)')

    os.makedirs(OUT_DIR, exist_ok=True)
    log('rendering %d of %d takes -> %s' % (len(todo), len(bank), os.path.relpath(OUT_DIR, ROOT)))
    failed = []
    tmp = tempfile.mkdtemp(prefix='mf-voices-')
    try:
        for i, (speaker, action, n, stem, text) in enumerate(todo, 1):
            cfg = cast[speaker]
            log('[%3d/%3d] %-11s' % (i, len(todo), speaker), end='')
            try:
                sizes, secs, peak = render_take(cfg, cfg['model'], text, stem, tmp, log)
            except Exception as e:
                failed.append((stem, str(e)))
                log('  !! %s: %s' % (stem, e))
                for f in FORMATS:                     # never leave half a take
                    try:
                        os.remove(os.path.join(OUT_DIR, stem + '.' + f))
                    except OSError:
                        pass
                state.pop(stem, None)
                continue
            state[stem] = {'sha': wanted[stem], 'voice': os.path.basename(cfg['model']),
                           'chain': CHAIN_REV, 'seconds': secs, 'peak': peak,
                           'ogg': sizes['ogg'], 'm4a': sizes['m4a']}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    n = write_manifests(full_bank, state, log)
    log('\n%d takes on disk, %d files, manifest %s'
        % (n, n * len(FORMATS), os.path.relpath(VOICE_JSON, ROOT)))
    if failed:
        log('%d take(s) FAILED and were not written:' % len(failed))
        for stem, err in failed:
            log('  %s — %s' % (stem, err.splitlines()[0][:160]))
        return 1
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
