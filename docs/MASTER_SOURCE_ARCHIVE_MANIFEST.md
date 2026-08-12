# MASSFRONT master source archive manifest

Audit date: 2026-08-03. This defines the durable source handoff requested by the
project owner: canonical source, all retained assets and art work, native
wrappers, a ready web/HTML build, and the current installable APK in one
versioned folder.

This document is a packaging plan. Creating or uploading the archive is a
release-stage action after the source freeze, focused gates and final version
bump.

## Audit summary

The current workspace contains approximately:

| Area | Files | Size |
|---|---:|---:|
| Canonical `src/**` | 41 | 1.60 MiB |
| Shipped `assets/**` | 280 | 20.72 MiB |
| Retained `releases/**` history/artifacts | 607 | 1366.76 MiB |
| `releases/building-lab/**` | 67 | 67.42 MiB |
| `releases/faction-building-lab/**` | 257 | 396.12 MiB |
| `releases/tower-lab/**` | 91 | 85.18 MiB |
| `releases/unit-lab/**` | 77 | 94.22 MiB |
| Current `www/**` staging | 323 | 22.37 MiB |
| Current single-file `dist/massfront.html` | 1 | 7.72 MiB |
| Android staged `public/**` | 325 | 22.37 MiB |
| iOS staged `public/**` | 316 | 19.40 MiB |
| Owner-supplied remote attachment references | 14 | 0.87 MiB |

Across the complete workspace, the proposed inclusion/exclusion rules currently
select about 2,287 files / 1,539.68 MiB and omit about 36,363 files / 3,773.38
MiB of dependency caches, SDKs, build intermediates, logs and the obsolete root
archive. The selected total includes the 31 owner-supplied SFX WAV originals and
three current project audio masters that were discovered under `.tmp` during the
provenance audit. Recalculate these values at source freeze.

`assets/**` currently includes 89 M4A, 76 Ogg, 83 PNG, 15 JPG, 6 MP4, the live
data JavaScript, JSON maps/manifests, icons, faction art and ad art. Do not omit
one audio codec family.

The old root `MASSFRONT-source.zip` has only 373 entries and predates much of
the current work. It is a generated duplicate, not the master source handoff.

## Required final folder layout

Use the actual final semantic version in place of `<version>`:

```text
MASSFRONT-master-source-v<version>-2026-08-03/
  README-FIRST.md
  CHECKSUMS-SHA256.txt
  BUILD-RECORD.json
  source/
    AGENTS.md
    README.md
    boot.js
    index.html
    capacitor.config.json
    package.json
    package-lock.json
    update.json
    .github/
    .codex-remote-attachments/
    src/
    assets/
    tools/
    docs/
    design/
    audit/
    cloudflare/
    android/
    ios/
    source-media/
  art-production/
    releases-art-and-contact-sheets/
  deliverables/
    android/MASSFRONT-v<version>-mobile.apk
    web/massfront.html
    web/www/
    ota/MASSFRONT-v<version>-update.js
    ota/update.json
    ios/README-IOS-CLOUD-BUILD.md
  release-history/
```

The folder may be represented internally by a mirror of the current repository
instead of physically duplicating `releases/**`. The required property is that
the archive contains all categories below and that `README-FIRST.md` tells a
recipient exactly where each category lives. Avoid doubling the 1.37 GB release
tree merely to make prettier directories.

## Complete inclusion manifest

Include these paths recursively unless a path also matches an explicit
exclusion later in this document.

### Canonical game and build source

- `AGENTS.md`, `README.md`, `.gitignore`
- `index.html`, `boot.js`, `capacitor.config.json`
- `package.json`, `package-lock.json`
- `src/**`
- `assets/**`, including:
  - `assets/data/**`
  - `assets/audio/**` in both Ogg and M4A/AAC
  - `assets/factions/**`
  - `assets/icons/**`
  - `assets/ads/**`
  - `assets/AUDIO-LICENSES.md`
- `tools/**`
- `docs/**`
- `design/**`
- `audit/**`
- `.github/**`
- `source-media/**` after the audio originals and project masters described in
  `assets/AUDIO-LICENSES.md` are copied there byte-for-byte

### Art, models, textures and visual evidence

- `.codex-remote-attachments/**` because it contains owner-supplied reference
  contact sheets and visual feedback used to establish faction art direction.
- All of `releases/**`, including historical contact sheets, progress PNGs,
  focused mobile screenshots, PBR material atlases, geometry/AO/quality JSON,
  `.blend` sources and their `.blend1` recovery copies.
- In particular, do not omit:
  - `releases/building-lab/**`
  - `releases/faction-building-lab/**`
  - `releases/tower-lab/**`
  - `releases/unit-lab/**`
  - `releases/audio-pack/**`
  - `releases/fog-pickups/**`
  - `releases/intel-cards/**`
  - `releases/map-depth/**`
  - `releases/platoon-orders/**`
  - `releases/tower-defense/**`
  - `releases/artillery-barrage/**`
  - `releases/ui-stage5/**` and `releases/ui-stage6/**`
  - root `releases/faction-*-live3d.png` files

Historical APKs and OTA payloads in `releases/**` may seem redundant but are
release records rather than caches. Keep them in the full master archive. Mark
only the new verified APK as `CURRENT` in `BUILD-RECORD.json` so a tester cannot
accidentally install `MASSFRONT.apk` or another obsolete signer/package lane.

### Original audio source media

The provenance audit found irreplaceable audio source masters inside `.tmp`, so
`.tmp/**` cannot be discarded until these exact files have been copied and
hash-verified into durable archive paths:

- `.tmp/audio-source/**` (31 owner-supplied WAV originals, approximately
  53.63 MiB) -> `source-media/audio/sfx-originals/**`
- `.tmp/cannon0-master.wav`, `.tmp/cannon1-master.wav`, and
  `.tmp/carrier-deploy-master.wav` (current project production masters,
  approximately 1.17 MiB) -> `source-media/audio/project-masters/**`

Use the byte counts and SHA-256 values in `assets/AUDIO-LICENSES.md`. Copy, do
not transcode. After the copied hashes match, the `.tmp` copies remain excluded
as transient duplicates. `.tmp/provisional-audio/**` is inactive generated
intermediate material and does not replace the active supplied masters in
`releases/audio-pack/**`.

### Backend and native wrappers

- `cloudflare/**/src/**`
- `cloudflare/**/schema.sql`
- `cloudflare/**/package.json` and lockfile if present
- `cloudflare/**/wrangler.toml` after confirming it contains binding names only,
  not secret values
- Android Gradle wrapper and configuration
- `android/app/src/**`, including the final synchronized
  `android/app/src/main/assets/public/**`
- Android resource/manifests and Capacitor-generated plugin configuration needed
  to reopen/build the project
- iOS Xcode project/workspace, native App source, resources and the final
  synchronized `ios/App/App/public/**`
- `capacitor-cordova-*-plugins` source/config required by each wrapper

### Ready web, OTA and mobile deliverables

Regenerate and include after the final source/version freeze:

- `www/**`: multi-file web/Capacitor staging
- `dist/massfront.html`: portable single-file HTML build
- the new immutable `releases/MASSFRONT-v<version>-update.js`
- matching release manifests in the repo root and `releases/**`
- the final shrunk, signed and verified
  `releases/MASSFRONT-v<version>-mobile.apk`
- the optional `.idsig` only as metadata; the APK must remain independently
  downloadable/installable
- iOS source/cloud-build instructions. Include an IPA only if it was actually
  Apple-signed by an authenticated macOS/cloud build and device-tested.

## Explicit exclusions

These are the only intended exclusion classes: caches/downloaded toolchains,
regenerable build intermediates, transient logs, generated duplicate archives,
and secrets/signing credentials.

### Dependency and toolchain caches

```text
node_modules/**
.npm-cache/**
.toolchains/**
**/__pycache__/**
**/.pytest_cache/**
```

Dependencies are reproducible from lockfiles. The archive must not carry a 2.1
GB Android/JDK toolchain or host-specific Node cache.

### Build intermediates and local emulator state

```text
.tmp/** (only after the source-media exception above is copied and verified)
android/.gradle/**
android/.gradle-mobile/**
android/.kotlin/**
android/build/**
android/app/build/**
android/**/.cxx/**
ios/**/DerivedData/**
cloudflare/**/.wrangler/cache/**
cloudflare/**/.wrangler/state/**
cloudflare/**/.wrangler/tmp/**
*.log
*.tmp
```

Do not exclude synchronized `www/**`, Android `public/**`, or iOS `public/**`
from this owner handoff: they are explicitly requested ready HTML/native inputs,
even though they can be regenerated.

### Generated duplicate archives

```text
MASSFRONT-source.zip
MASSFRONT-master-source-*.zip
MASSFRONT-master-source-*.7z
```

The final archive cannot contain itself, and the old root source ZIP is stale.

### Secrets and signing credentials

Never place any of the following inside the master archive:

```text
.env
.env.*
.dev.vars
*secret*
*credentials*
*.keystore
*.jks
*.p12
*.pfx
*.pem
*.key
```

Review name matches manually so legitimate documentation is not silently
dropped. Also scan file contents for `HF_TOKEN`, `HUGGING_FACE_HUB_TOKEN`,
`CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, `APPLE_*`, private key headers and
unredacted bearer tokens before compression.

At audit time no repo-root `.env`, `.env.local`, `.dev.vars`, Android app
keystore or release keystore was present. The working Android signer is the
external `%USERPROFILE%\.android\debug.keystore`; back it up securely outside
the archive. Record only its public certificate digest in `BUILD-RECORD.json`.

## Pre-archive production sequence

The archive must represent one coherent revision. Do not copy files while
agents are still changing canonical source.

1. Stop feature edits and record the intended release version.
2. Run `node tools/bundle.mjs` with a 120-second cap.
3. Run the focused protected-core gates with separate 120-second caps.
4. Inspect current phone PNGs.
5. Bump every version source listed in `docs/RELEASE_PREFLIGHT.md` together.
6. Run `node tools/bundle-update.mjs <version>`.
7. Run `node tools/pack-www.mjs`.
8. Run `npx cap sync android` and `npx cap sync ios`; an iOS sync is not an IPA.
9. Build Android `assembleInstallable` offline, shrink/re-sign, then verify the
   final APK package, version, alignment, signer and SHA-256.
10. Copy the coherent tree using this manifest, generate checksums, then perform
    the secret scan on the copied tree before compression.

## Required `README-FIRST.md`

The generated handoff readme must state:

- exact version and archive creation time
- player-facing summary of the build
- `docs/HANDOFF_CLAUDE_CODE.md` and `docs/HANDOFF_CODEX_SPARK.md` as continuation
  entry points
- the final Android APK relative path and its public download URL if published
- the single-file HTML and multi-file web relative paths
- that iOS needs an Apple-signed cloud/macOS build if no verified IPA exists
- Node, Java, Android SDK and Capacitor versions used
- canonical faction alias mapping
- known issues and incomplete stages
- how to rebuild without caches/toolchains bundled in the archive

## Required `BUILD-RECORD.json`

At minimum:

```json
{
  "version": "<version>",
  "createdUtc": "<ISO-8601>",
  "sourceBundleSha256": "<sha256>",
  "web": {
    "singleFile": "deliverables/web/massfront.html",
    "sha256": "<sha256>"
  },
  "android": {
    "apk": "deliverables/android/MASSFRONT-v<version>-mobile.apk",
    "package": "com.creatorjd.massfront.mobile",
    "versionCode": 0,
    "versionName": "<version>-mobile",
    "sha256": "<sha256>",
    "signerSha256": "D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0"
  },
  "ota": {
    "payload": "deliverables/ota/MASSFRONT-v<version>-update.js",
    "payloadSha256": "<sha256>",
    "immutableCommit": "<40-char commit after upload or null>"
  },
  "ios": {
    "wrapperIncluded": true,
    "signedIpaIncluded": false
  },
  "tests": [],
  "knownIssues": []
}
```

Replace `versionCode` with the actual monotonic integer. Never leave a dummy
value in a released record.

## Integrity checks before delivery

1. Generate `CHECKSUMS-SHA256.txt` for every archive file except the checksum
   file itself, sorted by relative path.
2. Extract the finished archive into a new temporary directory.
3. Re-hash every file and compare against the checksum list.
4. Run `node tools/bundle.mjs` from the extracted `source/` with a 120-second
   cap after installing locked dependencies.
5. Open the extracted `deliverables/web/massfront.html` and inspect a phone
   viewport.
6. Verify the extracted APK with `aapt`, `apksigner`, and `zipalign`, then compare
   its SHA-256 to `BUILD-RECORD.json`.
7. Confirm the archive contains every `assets/data/manifest.json` path and both
   `boot.js`/manifest registrations.
8. Confirm `assets/audio/**` contains both codec families and all supplied music
   selected for the build.
9. Confirm no excluded secret or signing file is present.
10. Report archive bytes, SHA-256 and a mobile-accessible download URL.

## Provenance note

The owner has stated that the supplied audio/music and visual references are
owned. `assets/AUDIO-LICENSES.md` now records that assertion, the active audio
inventory, source/master hashes, and a commercial-review evidence table.
Creator/vendor, purchase or commission records, receipt IDs and exact license
terms remain owner-action fields and must be completed before commercial store
review.
