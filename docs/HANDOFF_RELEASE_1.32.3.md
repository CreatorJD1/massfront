# MASSFRONT 1.32.3 release handoff

Released 2026-08-03 as the transparent-logo/app-icon branding hotfix. The
Android installable, OTA payload, browser build, web artifacts, and clean master
source archive are public on the existing Hugging Face release channel.

## Player links

- Android APK: `https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/MASSFRONT-v1.32.3-mobile.apk?download=true`
- Browser playtest: `https://creatorjd-massfront-playtest.static.hf.space/`
- Playable single HTML: `https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/MASSFRONT-v1.32.3-playable.html?download=true`
- Web ZIP: `https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/MASSFRONT-v1.32.3-web.zip?download=true`
- Clean master source: `https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/MASSFRONT-master-source-v1.32.3-2026-08-03.zip?download=true`

## Release record

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `MASSFRONT-v1.32.3-mobile.apk` | 42,989,713 | `a50190a75b54f4c166bb4b39e15797e51f5cca8babf16b209a8fc6f0d4234180` |
| `MASSFRONT-v1.32.3-update.js` | 26,604,950 | `effedf9da8e90235d1c344fd7511d449794da4f82f2f5f989a58a0665789b9c3` |
| `MASSFRONT-v1.32.3-playable.html` | 8,562,293 | `191cfc67a343d32daaffeb831391de9be17a3836ad8609679f5261146870f53a` |
| `MASSFRONT-v1.32.3-web.zip` | 35,600,161 | `62710d79ca1338b7699c87a01e57ad84889e4fa635e980ae75097cde445710c3` |
| `MASSFRONT-master-source-v1.32.3-2026-08-03.zip` | 314,286,619 | `71f3f7ea35fabbb3510fe2c05eafde52e42633eec1ce73efe3c225d3312d3015` |

Release commits:

- OTA payload: `67b7e9061cef39af34a4b48e5b085b6f8fb960f3`
- Android APK: `8621b3b3eae6cd05be02be50045cca63c6ce9c16`
- Browser Space: `48efe56039dbbc81d6ee5ab35286032ea4a6a5a6`
- OTA manifest: `6bb51ce5d0ffbe2a977b2dda60647d5c5a0de6e1`
- Browser artifacts: `848b708c1b1774e1eca37c4e5b6926de970b050d`
- Master source: `c85e5dff5a050193baf9e1129a09496f5fddc68d`

## Android identity and verification

- Package: `com.creatorjd.massfront.mobile`
- Version code: `13203`
- Version name: `1.32.3-mobile`
- Minimum SDK: 24
- Target SDK: 36
- Signature schemes: APK v2 and v3 verified
- Signer certificate SHA-256: `d61aaf77c171f0f1e7841394eb0adaed196e146ad90226a0f07854c29ee073f0`
- 4-byte ZIP alignment verified

The public APK was downloaded back from Hugging Face and matched the local byte
count and SHA-256. It was not installed on a physical Android device in this
environment, so in-place upgrade and local-save retention remain device checks.

## Verification completed

- `node tools/bundle.mjs`
- `node tools/pack-www.mjs`
- `npx cap sync android`
- `gradlew clean assembleInstallable --offline`
- `tools/shrink-apk.ps1`
- `aapt dump badging`, `apksigner verify`, and `zipalign -c`
- live OTA manifest and immutable payload re-download/hash check
- public APK re-download/hash check
- cloud phone smoke test: WebGL2, 36 units, 27 buildings, version 1.32.3
- visual inspection of `releases/cloud-playtest-iphone.png`: logo and controls fit

## Build note for the next agent

Use the repository-local toolchains; no system Java installation is required:

```powershell
$env:JAVA_HOME=(Resolve-Path '.toolchains/jdk-21/jdk-21.0.12+8').Path
$env:ANDROID_HOME=(Resolve-Path '.toolchains/android-sdk').Path
$env:GRADLE_USER_HOME=(Resolve-Path '.toolchains/gradle-home').Path
npx.cmd cap sync android
Push-Location android
.\gradlew.bat clean assembleInstallable --offline
Pop-Location
powershell -ExecutionPolicy Bypass -File tools/shrink-apk.ps1 `
  -Source android/app/build/outputs/apk/installable/app-installable.apk `
  -Output releases/MASSFRONT-vNEXT-mobile.apk `
  -BuildTools .toolchains/android-sdk/build-tools/36.0.0 `
  -JavaHome .toolchains/jdk-21/jdk-21.0.12+8
```

`android/app/build.gradle` previously contained a UTF-8 BOM at byte zero. Gradle
reported `Unexpected character` on line 1. The file was rewritten without the
BOM before the successful 1.32.3 build; preserve BOM-free UTF-8 encoding.
