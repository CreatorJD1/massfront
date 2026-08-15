# MASSFRONT release preflight

Audited 2026-08-03. This is the release procedure for the current Hugging Face
web/OTA channel and the side-loadable Android build. The examples use `1.31.0`
as the version after the currently published `1.30.0`; substitute another
semantic version only if every version source below is changed together.

## Stop-ship blockers found by this audit

Do not publish another manifest or APK until these are closed.

1. **Staged content is stale.** `www/src/ui/render3d.js` differs from source.
   Android's `app/src/main/assets/public` differs in 21 source/shell files.
   Run `pack-www.mjs` and `cap sync android` after the source/version freeze.
2. **The repo-root manifest is stale.** `update.json` advertises `1.28.0`, while
   Hugging Face and `releases/MASSFRONT-update.json` advertise `1.30.0`. Generate
   all three release manifests from the same payload, then publish them in one
   commit. Do not use the old `tools/make-manifest.py`; it creates the obsolete
   many-source manifest, not the current atomic shell-plus-code payload.
3. **The soundtrack index is absent from the active host.** The client derives
   `packs.json` from the configured Hugging Face update URL, but that repo
   currently has no `packs.json` or `pack/music/*`. The old Cloudflare Worker's
   copy is not a fallback. Keep music bundled (the default) until the HF pack is
   uploaded and verified. Never set `MASSFRONT_CLOUD_MUSIC=1` before then.
4. **Publishing is manual.** No repo script currently implements the active HF
   payload-first/manifest-last release. `tools/publish-cloudflare.mjs` and
   `docs/CLOUDFLARE-UPDATES.md` describe the old, stale Worker channel and must
   not be used for this release.
5. **Android is a test/sideload lane, not a Play Store lane.** The installable
   build uses `com.creatorjd.massfront.mobile` and the existing Android debug
   certificate. There is no production signing configuration or AAB pipeline.
   Releasing to Google Play is blocked until those are created separately.
6. **The `hf` executable is not installed.** Cached HF authentication is valid
   for `CREATORJD` through `huggingface_hub`, so the exact commands below use its
   Python API. Never print or commit the token.

## Current release topology

| Purpose | Current source of truth |
|---|---|
| OTA manifest | `https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json?download=true` |
| OTA payloads and APKs | HF dataset `CREATORJD/massfront-releases` |
| Browser playtest | HF static Space `CREATORJD/massfront-playtest` |
| Live web URL | `https://creatorjd-massfront-playtest.static.hf.space/` |
| Account/cloud-save API | `https://massfront-auth.jasondixon1994.workers.dev` |
| Obsolete update channel | `massfront-update.jasondixon1994.workers.dev` (still serves stale `1.14.0`) |

At audit time, HF `update.json` is `1.30.0`; its payload is pinned to commit
`673543f51405d827f033a8e5870dbf2e25b34e1d`. The browser Space also boots
`APP_VERSION`/`PACKAGED_REV` `1.30.0`.

## 1. Freeze and bump every version source

Set release variables in PowerShell:

```powershell
$MF_RELEASE_VERSION = '1.31.0'
$MF_VERSION_CODE = 13100
$MF_RELEASE_NOTES = 'Replace with concise player-facing release notes.'
$MF_RELEASE_REPO = 'CREATORJD/massfront-releases'
$MF_PLAYTEST_REPO = 'CREATORJD/massfront-playtest'
```

Change all canonical version sources together:

| File | Value |
|---|---|
| `src/updater.js` | `APP_VERSION='1.31.0'` |
| `boot.js` | `PACKAGED_REV='1.31.0'` |
| `index.html` | every stylesheet `?v=1.31.0` and fallback version text |
| `package.json` | `version: 1.31.0` |
| `package-lock.json` | both root/package version entries |
| `android/app/build.gradle` | `versionName "1.31.0"`, monotonic `versionCode 13100` |
| `ios/App/App.xcodeproj/project.pbxproj` | `MARKETING_VERSION = 1.31.0` and increment `CURRENT_PROJECT_VERSION` above 34 |

Do not manually edit copies under `www/`, Android `public/`, or iOS `public/`.
They are generated later. Review the canonical values before building:

```powershell
rg -n 'APP_VERSION|PACKAGED_REV|\?v=|versionName|versionCode|MARKETING_VERSION|CURRENT_PROJECT_VERSION|"version"' `
  src/updater.js boot.js index.html package.json package-lock.json `
  android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj
```

`APP_VERSION` and `PACKAGED_REV` must match the release manifest. Android's
`versionCode` and iOS's `CURRENT_PROJECT_VERSION` must only increase.

## 2. Local gates and deterministic staging

Run from the repo root after the source/version freeze:

```powershell
node tools/bundle.mjs
node tools/test-account-cloud-sync.mjs
node tools/test-audio-identity.mjs
node tools/bundle-update.mjs $MF_RELEASE_VERSION
node tools/pack-www.mjs
npx cap sync android
```

`bundle.mjs` is mandatory: it parses the one global script scope and catches
declaration collisions. `bundle-update.mjs` produces exactly one OTA file at
`releases/MASSFRONT-v$MF_RELEASE_VERSION-update.js`. The payload contains the
current HTML body, linked CSS, and every script in `assets/data/manifest.json`.
It does **not** carry `boot.js` or arbitrary binary assets. A boot-loader change
requires new web/native packaging; a new texture/audio/model file must already
exist in the installed package or be delivered by a separate asset-pack route.

Verify source, web staging, and Android staging are byte-identical:

```powershell
@'
import hashlib,json,pathlib,sys
r=pathlib.Path('.')
paths=['index.html','boot.js','assets/update-config.json']+json.loads((r/'assets/data/manifest.json').read_text())['order']
bad=[]
for rel in paths:
    source=r/rel
    for label,stage in [('www',r/'www'/rel),('android',r/'android/app/src/main/assets/public'/rel)]:
        if not stage.exists() or hashlib.sha256(source.read_bytes()).digest()!=hashlib.sha256(stage.read_bytes()).digest():
            bad.append(f'{label}: {rel}')
if bad:
    print('\n'.join(bad)); sys.exit(1)
print(f'staging verified: {len(paths)} files x 2 targets')
'@ | python -
```

Before going live, serve `www/` locally and visually inspect a phone viewport.
A clean console alone is not a visual pass.

## 3. Build and inspect the Android installable APK

The correct test build type is `installable`, not the `assembleDebug` command
still present in `package.json`/older docs. It preserves the established
side-by-side package ID `com.creatorjd.massfront.mobile`.

```powershell
$MF_ANDROID_SDK = (Resolve-Path '.toolchains/android-sdk').Path
$MF_BUILD_TOOLS = (Resolve-Path '.toolchains/android-sdk/build-tools/36.0.0').Path
$MF_JAVA = (Resolve-Path '.toolchains/jdk-21/jdk-21.0.12+8').Path
$env:JAVA_HOME = $MF_JAVA
$env:ANDROID_HOME = $MF_ANDROID_SDK
$env:GRADLE_USER_HOME = (Resolve-Path '.toolchains/gradle-home').Path

Push-Location android
.\gradlew.bat clean assembleInstallable --offline
Pop-Location

$MF_RAW_APK = 'android/app/build/outputs/apk/installable/app-installable.apk'
$MF_FINAL_APK = "releases/MASSFRONT-v$MF_RELEASE_VERSION-mobile.apk"
powershell -ExecutionPolicy Bypass -File tools/shrink-apk.ps1 `
  -Source $MF_RAW_APK -Output $MF_FINAL_APK `
  -BuildTools $MF_BUILD_TOOLS -JavaHome $MF_JAVA
```

The shrink step is mandatory: it re-deflates, aligns, and re-signs the APK.
Verify the final file, not the Gradle intermediate:

```powershell
& "$MF_BUILD_TOOLS\aapt.exe" dump badging $MF_FINAL_APK | Select-Object -First 3
& "$MF_BUILD_TOOLS\apksigner.bat" verify --verbose --print-certs $MF_FINAL_APK
& "$MF_BUILD_TOOLS\zipalign.exe" -c -P 16 4 $MF_FINAL_APK
Get-Item $MF_FINAL_APK | Select-Object FullName,Length
Get-FileHash $MF_FINAL_APK -Algorithm SHA256
```

Required results:

- package: `com.creatorjd.massfront.mobile`
- version name: `$MF_RELEASE_VERSION-mobile`
- version code: the new monotonic value
- APK Signature Scheme v2/v3: verified
- signer certificate SHA-256 unchanged from the working `1.30.0` lane:
  `D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0`
- alignment check: successful

Back up `%USERPROFILE%\.android\debug.keystore` securely outside the repo. A
different certificate cannot update an already installed `.mobile` build. Do
not publish the old `releases/MASSFRONT.apk`: it uses the unsuffixed package,
version code 1, and a different certificate. The `.idsig` file is optional v4
incremental-install metadata, not the downloadable APK.

Install the final APK on at least one device that already has the prior
`.mobile` version. Confirm it updates in place and preserves the local career.

## 4. Publish the optional soundtrack pack (files first, index last)

The installer includes the soundtrack by default, so this may be completed
independently before the game release. Rebuild and validate the local index:

```powershell
node tools/build-audio-pack.mjs
node tools/test-audio-identity.mjs
```

Authenticate without exposing the token:

```powershell
@'
from huggingface_hub import HfApi
assert HfApi().whoami()['name']=='CREATORJD'
print('HF identity verified: CREATORJD')
'@ | python -
```

Upload `pack/music/*` first, then switch on `packs.json` in a later commit:

```powershell
@'
from huggingface_hub import HfApi
api=HfApi()
info=api.upload_folder(repo_id='CREATORJD/massfront-releases',repo_type='dataset',
  folder_path='releases/audio-pack/pack',path_in_repo='pack',
  commit_message='Stage MASSFRONT soundtrack payloads')
print(info.oid)
'@ | python -

@'
from huggingface_hub import HfApi
api=HfApi()
info=api.upload_file(repo_id='CREATORJD/massfront-releases',repo_type='dataset',
  path_or_fileobj='releases/audio-pack/packs.json',path_in_repo='packs.json',
  commit_message='Publish MASSFRONT soundtrack index')
print(info.oid)
'@ | python -
```

Then download every URL named by the live index and compare size and SHA-256
against `releases/audio-pack/packs.json`. The client currently uses file name
and size for its cache key but does not enforce the index SHA itself, so this
operator-side hash verification is required. Only after it passes may a future
installer use `MASSFRONT_CLOUD_MUSIC=1`.

Expected live layout (source pack is now empty — vocal/lyric Suno songs were
deleted 2026-08-15; do not re-upload those masters):

```text
packs.json
```

## 5. Publish OTA payload first, manifest last

The manifest is the channel switch. Never publish it before the payload. First
upload the immutable versioned payload and capture its commit SHA:

```powershell
$env:MF_RELEASE_VERSION = $MF_RELEASE_VERSION
$MF_PAYLOAD_SHA = @'
import os
from huggingface_hub import HfApi
v=os.environ['MF_RELEASE_VERSION']
name=f'MASSFRONT-v{v}-update.js'
info=HfApi().upload_file(repo_id='CREATORJD/massfront-releases',repo_type='dataset',
  path_or_fileobj=f'releases/{name}',path_in_repo=name,
  commit_message=f'Stage MASSFRONT {v} OTA payload')
print(info.oid)
'@ | python -
$MF_PAYLOAD_SHA = $MF_PAYLOAD_SHA.Trim()
if ($MF_PAYLOAD_SHA -notmatch '^[0-9a-f]{40}$') { throw "Invalid payload commit: $MF_PAYLOAD_SHA" }
```

Generate all local manifests from that immutable commit and the actual bytes:

```powershell
$env:MF_PAYLOAD_SHA = $MF_PAYLOAD_SHA
$env:MF_RELEASE_NOTES = $MF_RELEASE_NOTES
@'
import hashlib,json,os,pathlib
v=os.environ['MF_RELEASE_VERSION']; commit=os.environ['MF_PAYLOAD_SHA']
name=f'MASSFRONT-v{v}-update.js'; payload=pathlib.Path('releases')/name
data=payload.read_bytes()
manifest={'version':v,'notes':os.environ['MF_RELEASE_NOTES'],'base':'','files':[{
  'path':name,
  'url':f'https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/{commit}/{name}?download=true',
  'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}]}
body=json.dumps(manifest,indent=2)+'\n'
pathlib.Path('update.json').write_text(body,encoding='utf-8')
pathlib.Path('releases/MASSFRONT-update.json').write_text(body,encoding='utf-8')
pathlib.Path(f'releases/update-v{v}.json').write_text(body,encoding='utf-8')
print(manifest['files'][0]['size'],manifest['files'][0]['sha256'])
'@ | python -
```

Before switching the channel, download the pinned URL from the generated
manifest and verify size/SHA-256. Then publish all manifest names atomically:

```powershell
@'
import json,pathlib,urllib.request,hashlib,sys
m=json.loads(pathlib.Path('update.json').read_text())
f=m['files'][0]; data=urllib.request.urlopen(f['url']).read()
assert len(data)==f['size']
assert hashlib.sha256(data).hexdigest()==f['sha256']
print('pinned payload verified',m['version'],len(data))
'@ | python -

@'
import os
from huggingface_hub import HfApi,CommitOperationAdd
v=os.environ['MF_RELEASE_VERSION']
ops=[
  CommitOperationAdd(path_in_repo='update.json',path_or_fileobj='update.json'),
  CommitOperationAdd(path_in_repo='MASSFRONT-update.json',path_or_fileobj='releases/MASSFRONT-update.json'),
  CommitOperationAdd(path_in_repo=f'update-v{v}.json',path_or_fileobj=f'releases/update-v{v}.json')]
info=HfApi().create_commit(repo_id='CREATORJD/massfront-releases',repo_type='dataset',
  operations=ops,commit_message=f'Publish MASSFRONT {v} OTA manifest')
print(info.oid)
'@ | python -
```

Finally fetch `resolve/main/update.json?download=true`, confirm the new version,
and re-hash its pinned payload. Test update discovery, download, restart, first
frame confirmation, and local-save retention from the previous Android build.

## 6. Publish the browser Space, then the APK artifact

Publish the already verified `www/` only after the OTA manifest and pinned
payload are healthy. This prevents the web client from reporting the new local
version while the release channel still points somewhere incomplete.

```powershell
@'
import os
from huggingface_hub import HfApi
v=os.environ['MF_RELEASE_VERSION']
info=HfApi().upload_folder(repo_id='CREATORJD/massfront-playtest',repo_type='space',
  folder_path='www',path_in_repo='.',
  delete_patterns=['index.html','boot.js','src/**','assets/**'],
  commit_message=f'Publish MASSFRONT web {v}')
print(info.oid)
'@ | python -

node tools/test-cloud-playtest.mjs https://creatorjd-massfront-playtest.static.hf.space/
```

Inspect `releases/cloud-playtest-iphone.png`, not just the script exit code.
Confirm the live `src/updater.js`, `boot.js`, and `assets/update-config.json`
return the new version and official HF endpoint.

Upload the final, shrunk, signed APK only after device verification:

```powershell
$env:MF_FINAL_APK = $MF_FINAL_APK
@'
import os
from pathlib import Path
from huggingface_hub import HfApi
p=Path(os.environ['MF_FINAL_APK'])
info=HfApi().upload_file(repo_id='CREATORJD/massfront-releases',repo_type='dataset',
  path_or_fileobj=str(p),path_in_repo=p.name,
  commit_message=f'Publish {p.name}')
print(info.oid)
'@ | python -
```

Download the public APK URL to a new file and repeat `Get-FileHash`, `aapt`, and
`apksigner` against the downloaded bytes. Record the public URL, byte count,
SHA-256, package, version code/name, and signer digest in the release handoff.

## Rollback and recovery rules

- **Client rollback:** “Revert to packaged build” deletes IndexedDB `active`,
  `pending`, and `probation`, then reloads the immutable packaged app.
- **Automatic rollback:** a new patch is probationary until the first real
  rendered frame calls the boot confirmation. A launch left in probation is
  rejected on the next start; repeated failure quarantines/removes the patch.
- **Native supersession:** a packaged `PACKAGED_REV` equal to or newer than an
  OTA patch evicts that patch, pending data, and probation state.
- **Server rollback is never a downgrade.** Clients compare versions
  numerically. To recover from bad `1.31.0`, build known-good code as a higher
  emergency version such as `1.31.1`, publish its payload, verify it, then
  publish its manifest last.
- `boot.js` cannot be repaired by the current OTA payload. A boot-loader defect
  requires a corrected web package/APK (and, later, iOS package).

## Final release record

Before announcing the build, save these facts together:

- source version, Android version code, iOS build number
- `bundle.mjs`, focused regression tests, local visual QA results
- OTA payload name, immutable HF commit, bytes, SHA-256
- live manifest commit and verification timestamp
- Space commit and cloud smoke-test screenshot
- APK public URL, bytes, SHA-256, package/version, signer certificate
- previous-version Android in-place upgrade/save-retention result
- soundtrack pack/index status (bundled-only or remotely verified)
- known issues and exact emergency rollback version
