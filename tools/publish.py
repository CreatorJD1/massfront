#!/usr/bin/env python3
"""Publish one OTA release to the update channel, then point the channel at it.

WHY THE ORDER MATTERS
The payload is uploaded FIRST and the manifest SECOND, as two separate commits.
Clients poll the manifest; if the manifest named a file that was not yet on the
CDN, every launch between the two commits would fetch a 404 and mark the update
failed. Uploading the payload first makes the window harmless: the file simply
sits there unreferenced until the manifest arrives.

The manifest URL pins the payload's COMMIT SHA rather than `main`, so a later
release cannot retroactively change what an already-announced version resolves
to, and a rollback keeps working after the channel has moved on.

Usage: python3 tools/publish.py <version> "<release notes>"
"""
import hashlib, json, os, sys, pathlib

from huggingface_hub import HfApi

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATASET = 'CREATORJD/massfront-releases'
SPACE = 'CREATORJD/massfront-playtest'

version = sys.argv[1]
notes = sys.argv[2]
payload = ROOT / 'releases' / f'MASSFRONT-v{version}-update.js'
if not payload.exists():
    raise SystemExit('missing ' + str(payload) + ' — run tools/bundle-update.mjs first')

tok = os.environ.get('HF_TOKEN') or pathlib.Path('/mnt/user-data/uploads/huggingface/token').read_text().strip()
api = HfApi(token=tok)

data = payload.read_bytes()
sha = hashlib.sha256(data).hexdigest()
print(f'{payload.name}  {len(data)/1e6:.2f} MB  sha256 {sha[:16]}…')

info = api.upload_file(path_or_fileobj=str(payload), path_in_repo=payload.name,
                       repo_id=DATASET, repo_type='dataset',
                       commit_message=f'v{version} OTA payload')
commit = getattr(info, 'oid', None) or api.list_repo_commits(DATASET, repo_type='dataset')[0].commit_id
print('payload commit', commit[:12])

url = (f'https://huggingface.co/datasets/{DATASET}/resolve/{commit}/{payload.name}?download=true')
manifest = {'notes': notes, 'files': [{'path': payload.name, 'url': url,
            'size': len(data), 'sha256': sha}], 'base': '', 'version': version}
blob = json.dumps(manifest, indent=4).encode()

# THE NAME THE CLIENT ACTUALLY POLLS IS `update.json`, AND ONLY THAT.
# src/updater.js builds UPD_OFFICIAL_MANIFEST as
#   .../massfront-releases/resolve/main/update.json?download=true
# Publishing only MASSFRONT-update.json left two manifests on the channel
# disagreeing with each other, and the game read the stale one — it reported
# "UP TO DATE, server v1.32.26" while v1.32.27 sat right beside it. That failure
# is invisible from the publisher's side: the upload succeeded, the file was
# correct, it simply was not the file anyone reads. update.json goes FIRST and
# is never omitted; the other two names are archive and legacy.
CANONICAL = 'update.json'
for name in (CANONICAL, f'update-v{version}.json', 'MASSFRONT-update.json'):
    (ROOT / 'releases' / name).write_bytes(blob)
(ROOT / CANONICAL).write_bytes(blob)

for name in (CANONICAL, f'update-v{version}.json', 'MASSFRONT-update.json'):
    api.upload_file(path_or_fileobj=blob, path_in_repo=name,
                    repo_id=DATASET, repo_type='dataset',
                    commit_message=f'channel -> v{version}')
    print('published', name + ('   <- the one clients poll' if name == CANONICAL else ''))

# Read the channel back through the SAME URL the game uses. An upload that
# succeeds is not a release; a release is what a client can see.
import urllib.request
check = f'https://huggingface.co/datasets/{DATASET}/resolve/main/{CANONICAL}?download=true'
with urllib.request.urlopen(check) as r:
    live = json.load(r)
if live.get('version') != version:
    raise SystemExit(f'CHANNEL MISMATCH — published {version}, channel serves {live.get("version")}')
print(f'verified: channel serves v{live["version"]} at the URL the game reads')

print('\nchannel is live at v' + version)
print('https://huggingface.co/datasets/%s/resolve/main/MASSFRONT-update.json' % DATASET)
