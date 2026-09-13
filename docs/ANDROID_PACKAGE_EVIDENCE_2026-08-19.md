# MASSFRONT Android package evidence — 2026-08-19

Status: verified side-by-side test candidate only. No release, upload, OTA activation, or production-package replacement was performed.

## Frozen inputs

- Pre-build and post-build input fingerprint: `c152b06e36b37b70bcdb14f57789e4b1bf27a75334deb9729e4d7dabeac8da00`
- Fingerprinted files: 696 (`boot.js`, manifest, runtime source, terrain and texture assets, packaging tools, and Android package configuration)
- The identical before/after fingerprint proves no concurrent runtime or art edit landed during this package build.
- `boot.js` and `assets/data/manifest.json` have identical order and membership: 82 sources, no duplicates or omissions.
- All 82 source files and all 27 new building/terrain/VFX assets matched source -> `www/` -> Android staged assets by SHA-256.

## Bundle and staging gates

- `node tools/bundle.mjs`: PASS, 82 sources, 25.28 MiB concatenated artifact.
- `node tools/pack-www.mjs`: PASS, 94.9 MiB staged.
- Staged `www/` size: 99,493,395 bytes.
- `assets/source` is absent from both `www/` and the APK.
- Obsolete building-v2 atlas files are absent.
- Building-v3, all terrain/location material pairs, and all eight macro/combat VFX atlases are present.
- Final APK byte comparison: 764 production `www/` files / 99,493,395 bytes matched exactly by SHA-256. The only staged file omitted by Android Asset Packaging Tool was the zero-byte `assets/audio/music/.gitkeep` sentinel.

## Android build

- Capacitor 8.5.0 sync: PASS.
- Plugins synchronized: App 8.1.1, Filesystem 8.1.2, Share 8.0.1.
- Gradle task: `:app:assembleInstallable --offline --no-daemon`.
- Offline dependency source: repository `.toolchains/gradle-home` cache; no dependency download was used.
- Java: Eclipse Temurin 17.0.20.
- Result: `BUILD SUCCESSFUL` in 35 seconds, 129 actionable tasks (33 executed, 96 up-to-date).
- Variant: `installable`, side-by-side application ID `com.creatorjd.massfront.mobile`.

## APK identity and compatibility

`aapt` from Android build-tools 35.0.0 reports:

- Application ID: `com.creatorjd.massfront.mobile`
- Version code: `13346`
- Version name: `1.33.46-mobile`
- Label: `MASSFRONT`
- Launchable activity: `com.creatorjd.massfront.MainActivity`
- Minimum SDK: 24
- Target / compile SDK: 36
- OpenGL ES: 3.0
- Debuggable: yes (intentional for the side-by-side test variant)

## Size, integrity, signing, and alignment

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Raw Gradle `app-installable.apk` | 89,936,396 | `24291de075e977db9f66286b97ebfe0e070ac7d28eff6386d65f0b13535a2b1c` |
| Repacked, aligned, signed candidate | 87,323,525 | `efb3b738189f9c3db84b5dc534194fa38911ea016d3d8d771c8caa72498eb56a` |

- Reduction: 2,612,871 bytes (2.91%).
- APK entries: 1,230.
- `assets/source` entries: 0.
- `apksigner verify --verbose --print-certs`: PASS (exit 0).
- APK Signature Scheme v2: true.
- APK Signature Scheme v3: true.
- Signer: local Android debug certificate, SHA-256 `d61aaf77c171f0f1e7841394eb0adaed196e146ad90226a0f07854c29ee073f0`.
- `zipalign -c -P 16 4`: PASS (exit 0).
- Native `.so` entries: 0. The 16 KiB check is therefore currently precautionary; the package contains no native library payload that could violate it.
- `tools/shrink-apk.ps1` now uses `zipalign -P 16` for both alignment and verification.

Candidate path:

`.tmp/android-final/MASSFRONT-1.33.46-mobile.apk`

## Release freeze blocker

The checked-in `update.json` must not be activated for this candidate. It claims 1.33.46, but its full fallback URLs still target v1.33.45, its five 1.33.46 deltas describe the older War Table repair, and it omits current runtime sources including `macrofx.js`, `shieldfx.js`, `volfx.js`, `physics.js`, and `cloudfx.js`. Its notes also differ from the current updater notes, proving same-version/different-bits state.

At release freeze, assign a new version, regenerate the full and delta updater artifacts from these verified inputs, build with the production signing identity, rerun the package evidence, and only then consider channel activation.
