#!/usr/bin/env python3
"""Publish the staged voice pack to the update channel, then point the index at it.

    python3 tools/publish-voice-pack.py [--dry-run] [--allow-drop]

WHY THE ORDER MATTERS — the same rule tools/publish.py follows for releases, and
the reason tools/publish-assets.mjs writes its index last. The 324 audio files go
up FIRST and packs.json goes up SECOND, as two separate commits. Clients poll
packs.json; if it named a file that was not yet on the channel, every launch
between the two commits would 404 mid-download and src/assetpack.js would show
"AUDIO PACK UNAVAILABLE". Uploading the payload first makes the window harmless:
the files sit there unreferenced until the index arrives.

WHERE THINGS GO, and why these exact paths. src/assetpack.js derives its endpoint
from the update URL by stripping `/update.json…`, so with the official channel

    https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json?download=true

the client asks for exactly two shapes of URL:

    <endpoint>/packs.json              ->  packs.json          at the repo root
    <endpoint>/pack/voice/<file>       ->  pack/voice/<file>

Note `pack/` singular for the payload and `packs.json` for the index. Those are
not stylistic — they are what the client literally requests, and the channel
already serves music from `pack/music/` on the same convention.

NEVER DROP A PACK. packs.json is the index for EVERY pack. The soundtrack lives
on the channel and not in this repo, so an index rebuilt from local directories
alone would omit `music` and unpublish 16 MB of already-downloaded soundtrack for
every player. This tool refuses to publish an index that has fewer packs than the
channel already serves, unless you say --allow-drop and mean it.

The pack is verified against assets/audio/voice.json before anything uploads, and
the channel is read back through the URL the game actually reads afterwards. An
upload that succeeded is not a publish; a publish is what a client can see.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sys
import urllib.request

from huggingface_hub import HfApi

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATASET = 'CREATORJD/massfront-releases'
PACK = 'voice'
STAGED = ROOT / 'assets' / 'packs'
FILES = STAGED / 'pack' / PACK
INDEX = STAGED / 'packs.json'
BANK = ROOT / 'assets' / 'audio' / 'voice.json'
BASE = f'https://huggingface.co/datasets/{DATASET}/resolve/main'
FORMATS = ('ogg', 'm4a')

ap = argparse.ArgumentParser()
ap.add_argument('--dry-run', action='store_true', help='check everything, upload nothing')
ap.add_argument('--allow-drop', action='store_true',
                help='publish even if the new index drops a pack the channel serves')
args = ap.parse_args()


def die(msg):
    raise SystemExit('publish-voice-pack: ' + msg)


# ---------------------------------------------------------------------------
# 1. VERIFY THE STAGED PACK. Publishing is not the place to discover that a take
#    is missing — but it is the last place it can still be caught for free.
# ---------------------------------------------------------------------------
if not INDEX.exists() or not FILES.is_dir():
    die('nothing staged — run `node tools/build-voice-pack.mjs` first')
index = json.loads(INDEX.read_text())
if PACK not in index.get('packs', {}):
    die('assets/packs/packs.json has no `voice` pack')
entry = index['packs'][PACK]

bank = json.loads(BANK.read_text())
required = {stem for spk in bank['lines'].values() for takes in spk.values() for stem in takes}
by_name = {f['name']: f for f in entry['files']}
bad = []
for stem in sorted(required):
    for ext in FORMATS:
        name = f'{stem}.{ext}'
        f = by_name.get(name)
        if not f:
            bad.append(name + ' not in the index'); continue
        p = FILES / name
        if not p.exists():
            bad.append(name + ' not staged'); continue
        data = p.read_bytes()
        if len(data) != f['size']:
            bad.append(f'{name} is {len(data)} B, index says {f["size"]}'); continue
        if bank['takes'].get(stem, {}).get(ext) != f['size']:
            bad.append(f'{name} disagrees with voice.json'); continue
        if f.get('sha256') and f['sha256'] != hashlib.sha256(data).hexdigest():
            bad.append(name + ' hash mismatch')
if bad:
    die(f'{len(bad)} problem(s) in the staged pack — nothing uploaded:\n  ' + '\n  '.join(bad[:10]))

staged = sorted(p.name for p in FILES.iterdir() if not p.name.startswith('.'))
if len(staged) != len(required) * 2:
    die(f'{len(staged)} files staged but the bank declares {len(required)} takes in two containers')
total = sum((FILES / n).stat().st_size for n in staged)
print(f'staged pack: {len(required)} takes, {len(staged)} files, {total/1048576:.2f} MB')
print(f'  ogg {sum(1 for n in staged if n.endswith(".ogg"))}   '
      f'm4a {sum(1 for n in staged if n.endswith(".m4a"))}   (both containers are mandatory)')

# ---------------------------------------------------------------------------
# 2. COMPARE AGAINST THE LIVE INDEX before touching it.
# ---------------------------------------------------------------------------
live = None
try:
    with urllib.request.urlopen(f'{BASE}/packs.json') as r:
        live = json.load(r)
except Exception as e:                                    # first publish, or offline
    print(f'  note: could not read the live index ({e}) — treating this as a first publish')

if live:
    lost = [p for p in live.get('packs', {}) if p not in index['packs']]
    if lost and not args.allow_drop:
        die(f'the new index drops {lost} which the channel currently serves. Rebuild with '
            '`node tools/build-voice-pack.mjs --from-live`, or pass --allow-drop if you really '
            'mean to unpublish them.')
    if lost:
        print(f'  WARNING: --allow-drop given, unpublishing {lost}')
    for p in index['packs']:
        if p == PACK or p not in live.get('packs', {}):
            continue
        if index['packs'][p] != live['packs'][p]:
            print(f'  note: the `{p}` entry differs from the channel and will be replaced by the '
                  'local copy')
    old = {f['name']: f['size'] for f in live.get('packs', {}).get(PACK, {}).get('files', [])}
    changed = [n for n in by_name if n in old and old[n] != by_name[n]['size']]
    print(f'  channel has {len(old)} voice files; publishing {len(by_name)} '
          f'({len(set(by_name) - set(old))} new, {len(changed)} re-rendered, '
          f'{len(set(old) - set(by_name))} orphaned)')
    if changed:
        print('  (clients key stored blobs by name+size, so a re-rendered take re-downloads — '
              'players who already took the old pack pay for it again)')

if args.dry_run:
    print('\ndry run — nothing uploaded')
    sys.exit(0)

# ---------------------------------------------------------------------------
# 3. UPLOAD: files first, index last.
# ---------------------------------------------------------------------------
tok = os.environ.get('HF_TOKEN')
if not tok:
    p = pathlib.Path('/mnt/user-data/uploads/huggingface/token')
    if not p.exists():
        die('no HF_TOKEN in the environment and no token file to fall back on')
    tok = p.read_text().strip()
api = HfApi(token=tok)

print(f'\nuploading {len(staged)} files to pack/{PACK}/ …')
api.upload_folder(folder_path=str(FILES), path_in_repo=f'pack/{PACK}',
                  repo_id=DATASET, repo_type='dataset',
                  allow_patterns=['*.ogg', '*.m4a'],
                  commit_message=f'voice pack payload — {len(required)} takes, both containers')
print('payload committed')

api.upload_file(path_or_fileobj=str(INDEX), path_in_repo='packs.json',
                repo_id=DATASET, repo_type='dataset',
                commit_message=f'packs.json -> voice {len(staged)} files, {total/1048576:.2f} MB')
print('index committed  <- this is the file clients poll')

# ---------------------------------------------------------------------------
# 4. READ THE CHANNEL BACK THROUGH THE URLS THE GAME USES.
# ---------------------------------------------------------------------------
with urllib.request.urlopen(f'{BASE}/packs.json') as r:
    served = json.load(r)
sv = served.get('packs', {}).get(PACK, {})
if len(sv.get('files', [])) != len(staged):
    die(f'CHANNEL MISMATCH — published {len(staged)} files, index serves {len(sv.get("files", []))}')
if {f['name']: f['size'] for f in sv['files']} != {f['name']: f['size'] for f in entry['files']}:
    die('CHANNEL MISMATCH — the served index does not match the staged one')
missing_other = [p for p in (live or {}).get('packs', {}) if p not in served.get('packs', {})]
if missing_other:
    die(f'CHANNEL REGRESSION — {missing_other} vanished from the index')

# The index is a claim. Pull real bytes for a spread of takes, in both
# containers, through the exact URL src/assetpack.js builds.
probe = [staged[0], staged[-1]]
probe += [n for n in staged if n.startswith('keen_')][:1]
probe += [n for n in staged if n.startswith('keen_')][-1:]
probe = list(dict.fromkeys(probe))
for name in probe:
    url = f'{BASE}/pack/{PACK}/{name}'
    with urllib.request.urlopen(url) as r:
        got = r.read()
    want = by_name[name]
    if len(got) != want['size'] or hashlib.sha256(got).hexdigest() != want['sha256']:
        die(f'CHANNEL MISMATCH — {name} served {len(got)} B, index promises {want["size"]} B')
    print(f'  verified {name}  {len(got)} B  sha256 {want["sha256"][:12]}…')

print(f'\nvoice pack is live: {len(required)} takes, {total/1048576:.2f} MB, both containers')
print(f'{BASE}/packs.json')
