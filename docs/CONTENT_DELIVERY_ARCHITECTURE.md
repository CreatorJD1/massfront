# MASSFRONT content delivery architecture

MASSFRONT uses separate authorities for the installed player, executable OTA
updates, and large runtime content. Keeping those lanes separate is what allows
the game to become content-dense without turning an interrupted art download
into a failed boot.

## 1. Complete base player

A normal `node tools/pack-www.mjs` build includes the current playable game,
Galactic Exploration, its approved runtime models, all shipped voices, the
available adaptive music beds, and the local runtime libraries they need. Only
`MASSFRONT_DIAGNOSTIC_SLIM=1` may omit the exploration closure, and the release
publisher refuses to publish that diagnostic package.

The signed exploration closure is runtime content only. Blender files, source
exports, previews, evidence, rejected models, and other authoring material never
enter `www/` or an APK.

## 2. Core executable OTA

The existing updater remains the only executable-code update authority. It
downloads a complete hash-bound candidate, stores it as `pending`, and exposes
it only through the existing apply/restart action. Boot moves that candidate
through probation and restores the previous or packaged runtime if first-frame
confirmation fails.

Do not put multi-gigabyte art in OTA `files[]`, do not rename its IndexedDB
records, and do not let the service worker activate OTA code. `boot.js` and
`sw.js` themselves require a new browser/native package.

Android normally requires operating-system confirmation to replace an APK. A
regular game process cannot silently replace its own signed package. The local
release pipeline can prepare and verify a replacement APK without publishing it;
installation remains an Android-controlled step.

## 3. Startup expansion packs

Future detailed regions, campaigns, cinematics, score expansions, and model
libraries use `src/assetpack.js`. A pack opts into launch-time background
delivery with:

```json
{
  "format": 2,
  "delivery": "startup",
  "label": "Example high-detail region",
  "chunkSize": 2097152,
  "bytes": 0,
  "dependencies": [],
  "files": []
}
```

A real startup pack must be non-empty. Every file has a complete SHA-256 and a
contiguous list of independently hashed chunks. Files are capped at 256 MiB and
chunks at 8 MiB, so a multi-gigabyte release is divided into bounded files and
can resume after the APK or browser is killed.

At launch, all `delivery: "startup"` roots and their shared dependencies are
planned as one batch. The player sees one aggregate byte/percentage bar while
the base game remains usable. Verified chunks and completed files survive a
restart. A single IndexedDB activation-pointer write mounts the entire new
dependency set only after every file verifies; failure keeps the prior active
versions and the packaged game.

`delivery: "manual"` remains available for truly optional packs.
`delivery: "base"` documents content already guaranteed by the installed
player and prevents it from being mistaken for an automatic duplicate download.

## 4. Android transport options

The HTTP/IndexedDB pack contract is the cross-platform authority and works for
the sideloaded APK and Safari-installed PWA. If MASSFRONT later ships through
Google Play, Play Asset Delivery `fast-follow` packs can transport the same
runtime payload automatically after installation. That should be an Android
adapter beneath the same manifest identities, not a replacement for validation,
activation, rollback, or the Apple/browser path.

