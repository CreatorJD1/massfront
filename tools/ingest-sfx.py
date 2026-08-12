#!/usr/bin/env python3
"""
Sound-effect ingestion — library WAVs in, game-ready variants out.

Music and effects need opposite treatment, which is why this is a separate tool
from ingest-music.py rather than a flag on it.

  TRIM TO THE TRANSIENT   A library explosion is eight seconds because it was
        recorded for film. In a game it fires forty times a minute and the tail
        is pure mud. Each file is cut to its attack plus a slot-appropriate
        decay, with the lead-in silence removed so the hit lands the instant
        the code asks for it — latency between trigger and transient is the
        single most common reason game audio feels loose.

  MATCH THE EXISTING MIX  New effects have to sit at the same level as the ones
        already in the game or every replacement is a volume jump. Levels are
        matched per slot against the assets already in assets/audio, not against
        an absolute target — the goal is "indistinguishable from what it
        replaces", not "correct in isolation".

  FILL VARIANT SLOTS      The engine already picks randomly between shot0/1/2.
        Three library takes drop straight into those slots, and any slot that
        gains variants gets them automatically through sfx.json — no code
        change, because AUD_MAP is merged from that file at load.

    python3 tools/ingest-sfx.py <folder>            # review the plan
    python3 tools/ingest-sfx.py <folder> --apply    # cut and encode
"""
import os, sys, json, re, subprocess, math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'audio')
PLAN = os.path.join(OUT, 'sfx-assign.json')

# slot -> (filename patterns, max variants, max seconds, mix gain, min gap ms,
#          playback priority)
# The patterns are matched case-insensitively against the filename. Order
# matters: the first match wins, so put specific before general.
SLOTS = [
    ('shot',      [r'projectile', r'\bcannon', r'(?<!laser )\bgun\b', r'rifle'], 3, 1.6, 0.55, 28, 1),
    ('gauss',     [r'railgun', r'\bgauss', r'coilgun'],                      3, 1.6, 0.55, 30, 1),
    ('laser',     [r'laser', r'\bbeam\b(?!.*test)'],                         3, 1.4, 0.50, 30, 1),
    ('sonic',     [r'testbeam', r'\bsonic', r'resonan'],                     2, 2.0, 0.70, 80, 2),
    ('missile',   [r'plasma', r'missile', r'rocket'],                        3, 2.2, 0.70, 60, 2),
    ('flame',     [r'flame', r'\bfire\b', r'burn'],                          2, 2.0, 0.50, 110, 1),
    ('boombig',   [r'explosion.*(large|big|huge)', r'(large|big).*explo'],   2, 4.0, 1.00, 120, 4),
    ('boomsmall', [r'explosion.*small', r'small.*explo', r'\bdebris'],       2, 2.0, 0.70, 35, 2),
    ('boom',      [r'explo', r'\bblast', r'detonat'],                        3, 3.0, 0.85, 45, 3),
    ('hit',       [r'impact', r'(?<!radio )\bhit\b', r'metal.*(hit|clang)', r'ricoch'], 3, 1.2, 0.42, 26, 1),
    ('deploy',    [r'spaceship.*(large|huge).*start', r'\bland(ing)?\b'],    1, 4.0, 1.00, 900, 4),
    ('thrust',    [r'spaceship.*(medium|large).*(fly|pass)', r'spaceship.*engine'], 2, 3.0, 0.80, 400, 2),
    ('flyby',     [r'spaceship.*small.*(fly|pass)', r'\bfly ?by\b'],         3, 2.5, 0.60, 500, 2),
    ('ui',        [r'\bui switch'],                                          3, 0.45, 0.38, 40, 4),
    ('confirm',   [r'\bconfirm switch'],                                     2, 0.90, 0.55, 80, 5),
    ('level',     [r'\breward\b', r'metal gong'],                            2, 2.80, 0.72, 500, 5),
    ('pickup',    [r'\bpickup\b', r'metal ting'],                            2, 1.20, 0.55, 80, 3),
    ('build',     [r'\bbuild\b', r'hydraulic', r'construct', r'fabricat'],  2, 2.2, 0.72, 350, 4),
    ('radio',     [r'\bradio\b', r'walkie', r'comms?\b'],                   3, 1.1, 0.38, 240, 3),
    ('notify',    [r'\bnotify\b', r'notification', r'digital disturbance'], 2, 1.4, 0.64, 450, 4),
    ('move_vehicle',[r'move vehicle', r'car engine run'],                    2, 8.0, 0.24, 0, 1),
    ('move_air',  [r'move air', r'drone loop'],                              1, 8.0, 0.20, 0, 1),
    ('move_brood',[r'move brood', r'alien locusts loop'],                    2, 8.0, 0.22, 0, 1),
    ('structure_hum',[r'structure hum', r'main reactor loop'],               2, 8.0, 0.18, 0, 1),
    ('factory_hum',[r'factory hum', r'industrial fan loop'],                 1, 8.0, 0.20, 0, 1),
    ('alarm_loop',[r'alarm loop'],                                           1, 8.0, 0.28, 0, 4),
    # Creature sets. The Brood is the only faction with living units, and a
    # library laid out Attack / Pain / Death per beast maps onto unit events
    # one-for-one.
    ('cre_attack',[r'(attack).*(raptor|serpent|beast|monster|boar|cat|MBDS)',
                   r'MBDS.*attack'],                                          4, 3.6, 0.55, 140, 2),
    ('cre_pain',  [r'MBDS.*pain', r'pain.*(raptor|serpent|beast)'],           4, 1.9, 0.45, 180, 2),
    ('cre_death', [r'MBDS.*death', r'death.*(raptor|serpent|beast)'],         4, 6.2, 0.60, 100, 3),
    ('cre_idle',  [r'MBDS.*(idle|scream)'],                                   4, 6.4, 0.35, 2400, 1),
    ('heal',      [r'tractor', r'\brepair', r'\bheal'],                        2, 2.5, 0.60, 180, 3),
    ('alarm',     [r'\balarm', r'warning beep', r'klaxon', r'\bsiren'],       2, 3.5, 0.85, 600, 5),
    # Ambience is a LOOP, not a hit. It is matched here so the planner reports
    # it, but it is routed through the looping path below rather than the
    # transient-trimming one — cutting an ambience to its "attack" would be
    # meaningless, and fading its tail would make the seam audible every pass.
    ('amb_low',   [r'ambience.*(low|deep|rumble)'],                          1, 30.0, 0.30, 0, 0),
    ('amb_high',  [r'ambience.*(high|air|hiss)'],                            1, 30.0, 0.26, 0, 0),
]
LOOPING = {'amb_low', 'amb_high', 'move_vehicle', 'move_air', 'move_brood',
           'structure_hum', 'factory_hum', 'alarm_loop'}


def sh(c):
    return subprocess.run(c, capture_output=True, text=True)


def pcm(path, sr=22050, start=None, dur=None):
    import array
    cmd = ['ffmpeg', '-v', 'quiet']
    if start is not None: cmd += ['-ss', str(start)]
    if dur is not None: cmd += ['-t', str(dur)]
    cmd += ['-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    samples = array.array('f')
    samples.frombytes(raw)
    if sys.byteorder != 'little': samples.byteswap()
    return samples


def duration(path):
    r = sh(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'csv=p=0', path])
    try: return float(r.stdout.strip())
    except Exception: return 0.0


def find_transient(path, sr=22050):
    """Where the sound actually starts.

    Library files routinely carry a fraction of a second of room tone before the
    hit. Played back verbatim that becomes trigger latency — the gun fires and
    the bang arrives late, every time. The onset is the first point reaching a
    fraction of the file's peak, backed off a few milliseconds so the attack is
    not clipped off."""
    x = pcm(path, sr)
    if len(x) < sr // 10: return 0.0
    peak = max((abs(v) for v in x), default=0.0)
    if peak <= 1e-6: return 0.0
    threshold = peak * 0.06
    idx = next((i for i, v in enumerate(x) if abs(v) > threshold), 0)
    return max(0.0, idx / sr - 0.012)


def separated_samples(path, dur, maxlen):
    """Split a library reel into the performances separated by real pauses.

    BOOM-style creature files are often 10â€“30 second reels containing four
    distinct takes. Treating the reel as one asset silently threw three takes
    away and made the first one repetitive. We only split long files, then use
    conservative silence detection so a breath inside one roar is not mistaken
    for a new performance.
    """
    if dur < max(5.0, maxlen * 1.55):
        onset = find_transient(path)
        return [(onset, min(maxlen, max(0.25, dur - onset)))]
    r = sh(['ffmpeg', '-hide_banner', '-i', path, '-map', '0:a:0', '-vn',
            '-af', 'silencedetect=noise=-38dB:d=0.28', '-f', 'null', os.devnull])
    events = []
    for m in re.finditer(r'silence_(start|end):\s*([0-9.]+)', r.stderr):
        events.append((m.group(1), float(m.group(2))))
    cursor, regions = 0.0, []
    for kind, at in events:
        if kind == 'start':
            if at - cursor >= 0.16: regions.append((cursor, at))
        else:
            cursor = at
    if dur - cursor >= 0.16: regions.append((cursor, dur))
    if len(regions) < 2:
        onset = find_transient(path)
        return [(onset, min(maxlen, max(0.25, dur - onset)))]
    out = []
    for start, end in regions:
        # Keep a few milliseconds of room before the onset and a sliver of the
        # detected pause after the tail, then cap pathological film-length tails.
        start = max(0.0, start - 0.012)
        keep = min(maxlen, end - start + 0.055)
        if keep >= 0.16: out.append((start, keep))
    return out


def loudness(path, start, dur):
    """Integrated loudness of the region we are about to keep."""
    r = sh(['ffmpeg', '-v', 'info', '-ss', str(start), '-t', str(dur), '-i', path,
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    m = re.search(r'\{[^{}]*"input_i"[\s\S]*?\}', r.stderr)
    if not m: return None
    try: return json.loads(m.group(0))
    except Exception: return None


def slot_for(name):
    # Normalise separators to spaces BEFORE matching. Every \b in the patterns
    # above is useless against this library's naming otherwise: in
    # "SFDS_Alarm_02" the character before "Alarm" is an underscore, which regex
    # counts as a word character, so there is no boundary there and \balarm
    # never fires. Underscores and hyphens are how sound libraries separate
    # words, so they have to be treated as separators.
    low = re.sub(r'[^a-z0-9]+', ' ', name.lower())
    for slot, pats, nmax, maxlen, gain, gap, priority in SLOTS:
        for p in pats:
            if re.search(p, low, re.I):
                return slot, nmax, maxlen, gain, gap
    return None, 0, 0, 0, 0


def reference_lufs():
    """Level of the effects already in the game, so replacements match them.

    Normalising to a textbook target would be correct in isolation and wrong in
    context: the existing bank was mastered as a set, and a new sound that is
    'properly' normalised but 4 dB above its neighbours reads as a bug."""
    ref = {}
    for slot, *_ in SLOTS:
        for cand in (slot + '0', slot):
            p = os.path.join(OUT, cand + '.ogg')
            if os.path.exists(p):
                d = loudness(p, 0, min(4.0, duration(p)))
                if d:
                    try:
                        value = float(d['input_i'])
                        if math.isfinite(value): ref[slot] = value
                    except (TypeError, ValueError):
                        pass
                break
    return ref


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = sys.argv[1]
    apply_ = '--apply' in sys.argv

    files = []
    for dirpath, _, names in os.walk(src):
        for n in sorted(names):
            if n.lower().endswith(('.wav', '.aiff', '.aif', '.flac', '.mp3', '.m4a', '.ogg')):
                files.append(os.path.join(dirpath, n))
    if not files:
        print('no audio under ' + src); sys.exit(1)

    print('found %d files' % len(files))
    ref = reference_lufs()
    print('matching against existing bank: ' +
          (', '.join('%s %.1f LUFS' % (k, v) for k, v in sorted(ref.items())) or '(none yet)'))
    print()

    rows, used = [], {}
    for f in files:
        base = os.path.basename(f)
        slot, nmax, maxlen, gain, gap = slot_for(base)
        if not slot:
            print('  --          %-46s (no slot matched)' % base[:46]); continue
        used.setdefault(slot, 0)
        if used[slot] >= nmax:
            print('  full        %-46s (%s already has %d)' % (base[:46], slot, nmax)); continue
        dur = duration(f)
        if dur <= 0:
            print('  unreadable  %-46s' % base[:46]); continue
        samples = [(0.0, dur)] if slot in LOOPING else separated_samples(f, dur, maxlen)
        for sample_no, (onset, keep) in enumerate(samples, 1):
            if used[slot] >= nmax: break
            idx = used[slot]; used[slot] += 1
            label = base if len(samples) == 1 else '%s [%d/%d]' % (base, sample_no, len(samples))
            rows.append(dict(src=os.path.abspath(f), name=label, slot=slot, index=idx,
                             onset=round(onset, 3), keep=round(keep, 2),
                             src_dur=round(dur, 2), gain=gain, gap=gap))
            print('  %-11s %-46s -> %s%d   onset %.3fs, keep %.2fs of %.1fs' %
                  (slot, label[:46], slot, idx, onset, keep, dur))

    json.dump({'tracks': rows}, open(PLAN, 'w'), indent=2)
    print('\nplan -> %s' % os.path.relpath(PLAN, ROOT))
    print('slots filled: ' + ', '.join('%s=%d' % (k, v) for k, v in sorted(used.items())))
    if not apply_:
        print('\nreview, edit "slot"/"index" if you disagree, then re-run with --apply')
        return

    made = {}
    for r in rows:
        stem = r['slot'] + str(r['index'])
        tgt = ref.get(r['slot'], -16.0)
        d = loudness(r['src'], r['onset'], r['keep'])
        valid_measure = False
        if d:
            try:
                valid_measure = math.isfinite(float(d.get('input_i', '-inf')))
            except (TypeError, ValueError):
                valid_measure = False
        if valid_measure:
            af = ('loudnorm=I=%.1f:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:'
                  'measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
                  % (tgt, d['input_i'], d['input_tp'], d['input_lra'],
                     d['input_thresh'], d.get('target_offset', '0')))
        else:
            af = 'loudnorm=I=%.1f:TP=-1.5:LRA=11' % tgt
        # A 4 ms in-fade kills any click from cutting mid-waveform; the out-fade
        # is longer because a truncated tail is far more audible than a
        # truncated attack.
        af += ',afade=t=in:st=0:d=0.004,afade=t=out:st=%.3f:d=%.3f' % (
            max(0.01, r['keep'] - 0.10), min(0.10, r['keep'] * 0.4))
        if r['slot'] in LOOPING:
            # These sources are authored loops already. Preserve their exact
            # endpoints: self-crossfading a one-second reactor loop changed its
            # rhythm and broke the seam it was designed to have.
            af = 'loudnorm=I=%.1f:TP=-1.5:LRA=11' % tgt
            rr = sh(['ffmpeg', '-y', '-v', 'error', '-i', r['src'], '-map', '0:a:0',
                     '-vn', '-sn', '-dn', '-af', af, '-ac', '2', '-ar', '44100',
                     '-c:a', 'libvorbis', '-q:a', '4', os.path.join(OUT, stem + '.ogg')])
            rr2 = sh(['ffmpeg', '-y', '-v', 'error', '-i', os.path.join(OUT, stem + '.ogg'),
                      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
                      os.path.join(OUT, stem + '.m4a')])
            if rr.returncode == 0 and rr2.returncode == 0:
                made.setdefault(r['slot'], []).append(stem)
                print('  wrote %s  (looping)  <- %s' % (stem, r['name'][:40]))
            else:
                print('  ! %s loop encode failed: %s' % (stem, (rr.stderr or rr2.stderr).strip()[:110]))
            continue
        ok = True
        for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '5']),
                          ('m4a', ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'])):
            rr = sh(['ffmpeg', '-y', '-v', 'error', '-ss', str(r['onset']), '-t', str(r['keep']),
                     '-i', r['src'], '-map', '0:a:0', '-vn', '-sn', '-dn',
                     '-af', af, '-ac', '2', '-ar', '44100']
                    + args + [os.path.join(OUT, stem + '.' + ext)])
            if rr.returncode != 0:
                ok = False; print('  ! %s (%s): %s' % (stem, ext, rr.stderr.strip()[:110]))
        if ok:
            made.setdefault(r['slot'], []).append(stem)
            print('  wrote %s  <- %s' % (stem, r['name'][:44]))

    # sfx.json is what makes this codeless: audio.js merges it into AUD_MAP and
    # AUD_MIX at load, so a slot that gained variants — or an entirely new slot
    # like cre_death — is playable without touching a line of JavaScript.
    sfxjson = os.path.join(OUT, 'sfx.json')
    existing = {}
    if os.path.exists(sfxjson):
        try: existing = json.load(open(sfxjson)).get('slots', {})
        except Exception: existing = {}
    for slot, stems in made.items():
        cfg = next(s for s in SLOTS if s[0] == slot)
        existing[slot] = {'files': sorted(set(existing.get(slot, {}).get('files', []) + stems)),
                          'gain': cfg[4], 'gap': cfg[5], 'priority': cfg[6]}
    json.dump({'slots': existing}, open(sfxjson, 'w'), indent=2)
    total = sum(os.path.getsize(os.path.join(OUT, f))
                for s in existing.values() for stem in s['files']
                for f in (stem + '.ogg', stem + '.m4a')
                if os.path.exists(os.path.join(OUT, f)))
    print('\n%d slots, %.1f MB total -> assets/audio/' % (len(existing), total / 1048576))
    print('sfx.json written — the engine picks these up with no code change')


if __name__ == '__main__':
    main()
