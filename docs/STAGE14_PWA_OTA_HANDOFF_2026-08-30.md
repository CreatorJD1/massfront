# Stage 14 — PWA, OTA and platform delivery handoff

Date: 2026-08-30  
Canonical checkout: `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`  
Prepared version: `1.33.48` (no version bump, upload, activation, or production mutation)

## Outcome

The browser/PWA and OTA delivery implementation is locally complete. MASSFRONT now has a
visible Chromium install path, explicit iPhone/iPad Add-to-Home-Screen guidance, and an
on-device `?diag=1` report in addition to the existing versioned service worker,
content-addressed OTA staging, interruption recovery, atomic activation and rollback.

The Settings **System** panel owns the Offline Mode, Install Game, and Platform Diagnostics
controls. The diagnostic report exposes the executing packaged/OTA version, renderer,
compressed-texture family, storage estimate and persistence, service-worker registration and
control state, PWA cache names, shader errors, and a bounded privacy-safe runtime-error list.
Potentially hanging browser storage/cache/service-worker inspection calls time out instead of
leaving the report on `Collecting…`.

## Evidence

- [`docs/evidence/stage14/evidence.json`](evidence/stage14/evidence.json)
- [`docs/evidence/stage14/diagnostics-mobile.png`](evidence/stage14/diagnostics-mobile.png)
- [`docs/evidence/stage14/settings-system-mobile.png`](evidence/stage14/settings-system-mobile.png)
- Source/package parity in that evidence:
  `src/offline.js` and `www/src/offline.js` share SHA-256
  `e03af39d3f8cdce48d4e8009c0b52cbf2e6866107a84f2db649ec813718f39d1`.
- Real 412×900 hardware-GPU Chromium run: **11/11 pass** on AMD Radeon 610M / ANGLE D3D11.
  Service worker registered and controlled the page; `massfront-pwa-1.33.48-shell1` existed;
  BC7 was selected and a compressed material atlas was loaded; renderer, terrain programs,
  terrain mesh, map texture and shader state were healthy; no runtime or shader errors occurred.

Previously completed delivery regression gates were rerun against the same Stage 14 source:

- `node tools/verify-pwa-shell.mjs` — complete online warmup plus fully offline controlled boot.
- `node tools/test-stage8-updater-interruption.mjs` — interrupted stage remains non-active.
- `node tools/test-updater-two-launch.mjs` — all 90 artifacts hash-verified; probation,
  second-launch commit, rollback and recovery pass.
- `node tools/test-updater-boot-retry.mjs` — boot retry/recovery pass.
- `node tools/test-stage8-offline-diagnostics.mjs` — 13 browser lanes pass.
- `node tools/release-retention.mjs` — five selectable releases retained:
  1.33.48, 1.33.47, 1.33.46, 1.33.45 and 1.33.44; remote reclaim is zero.
- `node tools/bundle.mjs` — 105 classic-script sources parse as one collision-free global bundle.
- `node tools/pack-www.mjs` — complete Capacitor/PWA `www/` staging with no unresolved manifest
  or audio-bank paths.

## Live read-only channel check

No remote state was changed. Read-only fetches on 2026-08-30 established:

- Hugging Face resolve primary: HTTP 200, version 1.33.48, 89 files, SHA-256
  `0666a4b35d746d05b1dd9c00a06a01c7f338275c5618be67029e28a14ffdd9de`.
- Hugging Face raw mirror: byte-identical to the primary.
- Cloudflare fallback: HTTP 200, version 1.33.48, 89 files. Its manifest bytes differ because
  the URL host representation differs, but every payload path, byte size and SHA-256 is identical
  to Hugging Face (**0 semantic payload differences**).
- Live Hugging Face `rollback-index.json`: retention schema V1, count 5, exact versions matching
  the local retained set.

## Files changed for the missing Stage 14 surface

- `src/offline.js`
- `tools/verify-stage14-pwa-delivery.mjs`
- Generated `dist/massfront.html` and `www/` staging through the existing build tools.

## Release boundary

Stage 14 preparation and verification do not authorize publication. Native package rebuilding,
five-channel versioning, OTA upload, Cloudflare activation, Hugging Face activation, and store
delivery remain Stage 18 actions and require Jason's explicit release approval.
