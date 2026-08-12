#!/usr/bin/env python3
"""
Music ingestion — sort a pile of MP3s into faction playlists and make them
game-ready.

Two jobs, and the second one matters more than it sounds:

  SORT       Each track is analysed (tempo, energy, brightness, percussive
             content, dynamic range) and scored against a profile for each
             faction. Tags and filenames are consulted first, because a human
             who named a file "battle_theme" has told you more than any spectral
             feature will. The result is a SUGGESTION printed for review — the
             assignment is written to a JSON file you can hand-edit, and re-runs
             respect your edits rather than stomping them.

  NORMALISE  Every track is loudness-normalised to a single target with ffmpeg's
             two-pass loudnorm. This is the difference between a soundtrack and
             a pile of files: albums are mastered at wildly different levels, and
             without this the player is riding the volume knob every time the
             track changes. Peak normalisation cannot fix it — two tracks can
             share a peak and differ by 8 dB of perceived loudness.

Output is OGG + M4A, matching the rest of the audio: AAC is the only codec
Safari/iOS accepts, and open-source Chromium builds have no AAC decoder at all.

    python3 tools/ingest-music.py <folder-with-mp3s>
    python3 tools/ingest-music.py <folder> --apply      # actually transcode
    python3 tools/ingest-music.py <folder> --lufs -15   # louder target

Assignments live in assets/audio/music-assign.json. Edit the "faction" values
there and re-run with --apply; analysis is cached so it is fast.
"""
import os, sys, json, math, subprocess, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'audio', 'music')
ASSIGN = os.path.join(ROOT, 'assets', 'audio', 'music-assign.json')
CACHE = os.path.join(ROOT, 'assets', 'audio', '.music-analysis.json')

# The buckets. `menu` and the two stingers are not factions but they are where a
# lot of a soundtrack naturally belongs, so they compete for tracks too.
FACTIONS = ['nova', 'ascendancy', 'syndicate', 'horde', 'menu', 'victory', 'defeat']

# Target character per bucket, in the same feature space the analyser measures.
# tempo BPM, energy 0-1, brightness 0-1 (spectral centroid), percussive 0-1.
# Faction character, expressed as PERCENTILES WITHIN THE BATCH rather than
# absolute values. The first version used absolute thresholds and was useless on
# real music: every commercially mastered track came back energy 1.00 and
# brightness 1.00, because those scales were built for the game's own quiet
# rendered beds. Ranking each feature within the supplied corpus asks the only
# question that can actually be answered — "which of THESE is the darkest, the
# fastest, the most percussive" — and that is also the question a soundtrack
# supervisor is asking.
#   tempo / perc / bass / high / dr / flat, each 0 (lowest in batch) .. 1 (highest)
PROFILE = {
    'nova':       dict(tempo=0.40, perc=0.35, bass=0.30, high=0.70, dr=0.80, flat=0.25, w=1.0),
    'ascendancy': dict(tempo=0.85, perc=0.85, bass=0.70, high=0.45, dr=0.30, flat=0.60, w=1.0),
    'syndicate':  dict(tempo=0.60, perc=0.70, bass=0.85, high=0.80, dr=0.45, flat=0.50, w=1.0),
    'horde':      dict(tempo=0.20, perc=0.30, bass=0.80, high=0.20, dr=0.55, flat=0.80, w=1.0),
    'menu':       dict(tempo=0.15, perc=0.15, bass=0.40, high=0.55, dr=0.90, flat=0.20, w=0.85),
    'victory':    dict(tempo=0.65, perc=0.55, bass=0.45, high=0.75, dr=0.70, flat=0.30, w=0.5),
    'defeat':     dict(tempo=0.05, perc=0.10, bass=0.55, high=0.15, dr=0.85, flat=0.35, w=0.5),
}
RANKED = ['tempo', 'perc', 'bass', 'high', 'dr', 'flat']

# Filename and tag keywords beat spectral analysis every time — they are the
# author's own labels.
HINTS = {
    'nova':       ['nova', 'federation', 'hero', 'noble', 'hope', 'unity', 'anthem', 'orchestr'],
    'ascendancy': ['ascend', 'legion', 'war', 'battle', 'combat', 'march', 'assault', 'iron', 'blood', 'metal'],
    'syndicate':  ['syndic', 'coalition', 'stealth', 'cyber', 'tech', 'neon', 'hack', 'synth', 'electro'],
    'horde':      ['horde', 'brood', 'swarm', 'dark', 'doom', 'dread', 'hive', 'alien', 'horror', 'umbral'],
    'menu':       ['menu', 'title', 'theme', 'ambient', 'intro', 'lobby', 'idle', 'main'],
    'victory':    ['victory', 'win', 'triumph', 'fanfare'],
    'defeat':     ['defeat', 'lose', 'loss', 'requiem', 'lament', 'sad'],
}


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    r = sh(['ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', path])
    try:
        return json.loads(r.stdout)
    except Exception:
        return {}


def tags_of(path):
    t = {}
    try:
        from mutagen import File as MF
        m = MF(path, easy=True)
        if m:
            for k in ('title', 'artist', 'album', 'genre'):
                v = m.get(k)
                if v: t[k] = str(v[0])
    except Exception:
        pass
    return t


def analyse(path):
    """Decode a middle slice and measure the few features that actually
    discriminate between moods. A 30-second window from the centre avoids
    intros and fades, which are unrepresentative of the whole track."""
    import numpy as np
    info = probe(path)
    dur = float(info.get('format', {}).get('duration', 0) or 0)
    if dur <= 0: return None
    start = max(0, dur / 2 - 15)
    # NOT via sh(): that helper decodes stdout as UTF-8 for ffprobe/loudnorm, and
    # raw PCM is not text. Decoding audio as UTF-8 fails on the first sample
    # above 0x7F, which is essentially immediately.
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-ss', str(start), '-t', '30',
                          '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype='<f4')
    if x.size < 4096: return None
    x = np.nan_to_num(x)
    sr = 22050

    rms = float(np.sqrt((x ** 2).mean()))
    energy = min(1.0, rms * 5.5)

    # brightness: spectral centroid, log-mapped into 0..1 over a musical range
    win = x[:min(len(x), 1 << 18)]
    sp = np.abs(np.fft.rfft(win * np.hanning(len(win))))
    fr = np.fft.rfftfreq(len(win), 1 / sr)
    cen = float((sp * fr).sum() / (sp.sum() + 1e-9))
    bright = min(1.0, max(0.0, (math.log10(max(cen, 20)) - 2.0) / 1.4))

    # percussive content: how much of the energy sits in fast onsets
    frame = 512
    n = len(x) // frame * frame
    env = np.abs(x[:n]).reshape(-1, frame).max(1)
    d = np.diff(env)
    onset = d[d > 0]
    perc = float(min(1.0, (onset.sum() / (env.sum() + 1e-9)) * 6.0))

    # tempo: autocorrelation of the onset envelope over a plausible BPM range
    e = env - env.mean()
    ac = np.correlate(e, e, 'full')[len(e) - 1:]
    fps = sr / frame
    lo, hi = int(fps * 60 / 180), int(fps * 60 / 55)
    tempo = 0.0
    if hi < len(ac) and hi > lo:
        k = int(np.argmax(ac[lo:hi])) + lo
        tempo = 60.0 * fps / max(1, k)

    # Octave correction. Autocorrelation happily locks onto a half- or
    # double-tempo lag, and an uncorrected reading pinned nearly every track in
    # this corpus to the 180 BPM search boundary — a number that said more about
    # my search range than about the music. Fold into the range humans actually
    # hear as "the" tempo.
    while tempo > 168: tempo /= 2
    while 0 < tempo < 76: tempo *= 2

    # dynamic range, in dB between loud and quiet frames
    q = np.quantile(env[env > 0], [0.1, 0.95]) if (env > 0).any() else [1e-6, 1e-6]
    dr = float(20 * math.log10((q[1] + 1e-9) / (q[0] + 1e-9)))

    # Spectral balance. These survive loudness-war mastering in a way that gross
    # energy and centroid do not: two tracks can both be squashed to the ceiling
    # and still differ completely in where that energy sits.
    tot = sp.sum() + 1e-9
    bass = float(sp[(fr >= 20) & (fr < 200)].sum() / tot)
    mid = float(sp[(fr >= 200) & (fr < 2000)].sum() / tot)
    high = float(sp[(fr >= 4000)].sum() / tot)
    # Roughness: spectral flatness. Noisy/distorted -> high, tonal -> low.
    mag = sp[sp > 0]
    flat = float(np.exp(np.log(mag).mean()) / (mag.mean() + 1e-9))

    return dict(dur=round(dur, 1), energy=round(energy, 3), bright=round(bright, 3),
                perc=round(perc, 3), tempo=round(tempo, 1), dr=round(dr, 1),
                bass=round(bass, 4), mid=round(mid, 4), high=round(high, 4),
                flat=round(flat, 4), cen=round(cen, 1))


def rank_all(rows):
    """Turn each raw feature into its percentile within the batch."""
    n = len(rows)
    for k in RANKED:
        order = sorted(range(n), key=lambda i: rows[i]['f'].get(k, 0))
        for pos, i in enumerate(order):
            rows[i]['r'][k] = pos / max(1, n - 1)


def suggest(rank, tags, fname):
    hay = ' '.join([fname, tags.get('title', ''), tags.get('album', ''),
                    tags.get('genre', ''), tags.get('artist', '')]).lower()
    for fac, words in HINTS.items():
        for w in words:
            if w in hay:
                return fac, 'name:' + w, 0.0
    best, bs = 'menu', 1e9
    for fac, p in PROFILE.items():
        d = sum((rank.get(k, 0.5) - p[k]) ** 2 for k in RANKED) / p['w']
        if d < bs: bs, best = d, fac
    return best, 'audio', round(bs, 3)


def slug(s):
    s = re.sub(r'[^a-zA-Z0-9]+', '_', s).strip('_').lower()
    return (s or 'track')[:44]


def best_window(path, want=92.0):
    """Find the most energetic sustained stretch of a track.

    Game music loops; it does not need the intro, the breakdown and the outro.
    A well-chosen 90 seconds from the heart of a track loops better than the
    whole thing plays once, and it costs a quarter of the bytes. The window is
    picked by sliding a coarse RMS envelope and taking the highest-energy span,
    which lands on the main section rather than on a quiet build."""
    import numpy as np
    info = probe(path)
    dur = float(info.get('format', {}).get('duration', 0) or 0)
    if dur <= want + 4: return 0.0, dur
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-f', 'f32le',
                          '-ac', '1', '-ar', '4000', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype='<f4')
    if x.size < 4000: return max(0.0, dur / 2 - want / 2), want
    hop = 4000                                   # one second per bin
    n = len(x) // hop * hop
    e = np.sqrt((x[:n].reshape(-1, hop) ** 2).mean(1))
    w = int(want)
    if len(e) <= w: return 0.0, dur
    csum = np.concatenate([[0], np.cumsum(e)])
    sums = csum[w:] - csum[:-w]
    start = int(np.argmax(sums))
    # Never start so late that the window runs past the end.
    start = min(start, max(0, int(dur) - w - 1))
    return float(start), float(want)


def transcode(src, dest_base, lufs):
    """Two-pass loudnorm, then encode the chosen window.

    AAC ONLY for music, and this one hurt: shipping both formats put the APK at
    51 MB, past the limit for handing the file over at all. AAC is the format
    both shipped targets can decode — iOS has no Vorbis decoder and Android has
    had AAC since forever — so the second copy was only ever buying desktop
    Firefox and open-source Chromium builds. The sound effects stay dual-format
    because they are small enough that the insurance is free."""
    start, length = best_window(src)
    win = ['-ss', str(start), '-t', str(length)]
    r = sh(['ffmpeg', '-v', 'info'] + win + ['-i', src, '-af',
            'loudnorm=I=%d:TP=-1.5:LRA=11:print_format=json' % lufs,
            '-f', 'null', '-'])
    m = re.search(r'\{[^{}]*"input_i"[\s\S]*?\}', r.stderr)
    if m:
        d = json.loads(m.group(0))
        af = ('loudnorm=I=%d:TP=-1.5:LRA=11:measured_I=%s:measured_TP=%s:'
              'measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true' %
              (lufs, d['input_i'], d['input_tp'], d['input_lra'],
               d['input_thresh'], d.get('target_offset', '0')))
    else:
        af = 'loudnorm=I=%d:TP=-1.5:LRA=11' % lufs
    # Short fades so a loop point is never a click.
    af += ',afade=t=in:st=0:d=1.5,afade=t=out:st=%.2f:d=2.0' % max(0.1, length - 2.0)
    rr = sh(['ffmpeg', '-y', '-v', 'error'] + win + ['-i', src, '-af', af,
             '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k',
             '-movflags', '+faststart', dest_base + '.m4a'])
    if rr.returncode != 0:
        print('    ! encode failed: %s' % rr.stderr.strip()[:140])
        return False
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src_dir = sys.argv[1]
    apply_ = '--apply' in sys.argv
    lufs = -16
    if '--lufs' in sys.argv:
        lufs = int(sys.argv[sys.argv.index('--lufs') + 1])

    files = []
    for dirpath, _, names in os.walk(src_dir):
        for n in sorted(names):
            if n.lower().endswith(('.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus')):
                files.append(os.path.join(dirpath, n))
    if not files:
        print('no audio found under ' + src_dir); sys.exit(1)
    print('found %d files\n' % len(files))

    cache = {}
    if os.path.exists(CACHE):
        try: cache = json.load(open(CACHE))
        except Exception: cache = {}
    prev = {}
    if os.path.exists(ASSIGN):
        try: prev = {t['src']: t for t in json.load(open(ASSIGN))['tracks']}
        except Exception: prev = {}

    import hashlib
    rows, seen_hash = [], {}
    for f in files:
        key = os.path.abspath(f)
        # Byte-identical duplicates are common in an export dump; keep the first.
        h = hashlib.md5(open(f, 'rb').read(1 << 20)).hexdigest()
        if h in seen_hash:
            print('  dup  %-44s == %s' % (os.path.basename(f)[:44], seen_hash[h]))
            continue
        seen_hash[h] = os.path.basename(f)
        feat = cache.get(key) or analyse(f)
        if not feat:
            print('  SKIP (unreadable) %s' % os.path.basename(f)); continue
        cache[key] = feat
        tags = tags_of(f)
        title = tags.get('title') or os.path.splitext(os.path.basename(f))[0]
        rows.append(dict(src=key, title=title, artist=tags.get('artist', ''),
                         f=feat, r={}, fname=os.path.basename(f), tags=tags))

    rank_all(rows)
    print()
    for i, row in enumerate(rows, 1):
        if key in prev and prev.get(row['src'], {}).get('locked'):
            fac, why, sc = prev[row['src']]['faction'], 'locked', 0.0
        else:
            fac, why, sc = suggest(row['r'], row['tags'], row['fname'])
        row.update(faction=fac, why=why, score=sc, locked=(why == 'locked'), **row['f'])
        r = row['r']
        print('  %2d. %-11s %-38s %4.0fs %5.1fbpm  tempo%.2f perc%.2f bass%.2f high%.2f dr%.2f  (%s)' %
              (i, fac, row['title'][:38], row['f']['dur'], row['f']['tempo'],
               r['tempo'], r['perc'], r['bass'], r['high'], r['dr'], why))
    for row in rows:
        row.pop('f', None); row.pop('r', None); row.pop('tags', None); row.pop('fname', None)

    json.dump(cache, open(CACHE, 'w'))
    os.makedirs(os.path.dirname(ASSIGN), exist_ok=True)
    json.dump({'lufs': lufs, 'tracks': rows}, open(ASSIGN, 'w'), indent=2)

    print('\nby faction:')
    for fac in FACTIONS:
        n = sum(1 for r in rows if r['faction'] == fac)
        print('  %-11s %d' % (fac, n))
    print('\nassignments -> %s' % os.path.relpath(ASSIGN, ROOT))

    if not apply_:
        print('\nreview and edit "faction" (set "locked": true to pin), then re-run with --apply')
        return

    os.makedirs(OUT, exist_ok=True)
    manifest = {f: [] for f in FACTIONS}
    manifest.pop('skip', None)
    for r in rows:
        if r['faction'] == 'skip':
            continue          # kept in the assignment file, not shipped
        base = os.path.join(OUT, r['faction'] + '_' + slug(r['title']))
        print('  encoding %-11s %s' % (r['faction'], os.path.basename(base)))
        if transcode(r['src'], base, lufs):
            manifest[r['faction']].append({
                'file': 'music/' + os.path.basename(base),
                'title': r['title'], 'artist': r['artist'],
                'dur': r['dur'], 'tempo': r['tempo'], 'energy': r['energy'],
            })
    # Loudest-last within a faction so a playlist builds rather than sags.
    for f in manifest:
        manifest[f].sort(key=lambda t: t['energy'])
    out_manifest = os.path.join(ROOT, 'assets', 'audio', 'music.json')
    json.dump({'lufs': lufs, 'ext': 'm4a', 'playlists': manifest},
              open(out_manifest, 'w'), indent=2)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('\n%d tracks encoded, %.1f MB -> assets/audio/music/' %
          (sum(len(v) for v in manifest.values()), total / 1048576))
    print('manifest -> assets/audio/music.json')


if __name__ == '__main__':
    main()
