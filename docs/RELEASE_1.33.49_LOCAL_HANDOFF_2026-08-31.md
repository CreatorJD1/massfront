# MASSFRONT 1.33.49 local release handoff — 2026-08-31

## Prepared locally

- Version fields: `1.33.49`; native build number: `13349`.
- Bundle: **108** ordered scripts, **26.62 MiB** (`node tools/bundle.mjs`).
- Core `www/`: **140.94 MiB** (842 files); evidence:
  `tmp/release-1.33.49-www.json`. Galactic Exploration remains optional
  (not copied into core `www/`).
- PWA shell: `sw.js` **`1.33.49-shell1`**, aligned with `boot.js` registration.
- OTA staging: `releases/staging-v1.33.49/` — **112** artifacts, **~88.95 MB**
  staged total. Evidence: `tmp/release-1.33.49-ota.json`.
- Android Capacitor sync, debug build, and mandatory shrink/re-sign passed after
  the final World Chat / `sw.js` lane.
- APK: [`MASSFRONT.apk`](../MASSFRONT.apk), **135,221,934** bytes.
- SHA-256: `7D62E99D8D6ED3978773B4AB512595B96FB164238B0D9CF1B7C23FD338765E00`.
- Debug APK (pre-shrink reference): `android/app/build/outputs/apk/debug/app-debug.apk`,
  137,914,433 bytes, SHA-256
  `BB863765819861AFCFF25F33381FBCAF6B8EF657ABDF3E94338691E474F83F91`.
- Local `www/` preview (Social, World Chat actions, lobby route): **16/16**
  checks on `http://127.0.0.1:8902/`; evidence:
  `tmp/release-1.33.49-www-preview/report.json`.

Stage 10 admits the creator-accepted **327-model** lazy optional runtime catalog
(320 world-kit + 7 Spline). No rejected model was admitted and no locked model
was regenerated. The optional exploration pack is **~541.83 MiB** and is not
silently bundled into the core installer.

## Multiplayer and Social (1.33.49 configuration)

Multiplayer is **enabled** in this release configuration, not disabled.
Supported modes: **two-player PvP Skirmish** and **two-to-four-player Co-op
against AI**. Three/four-player PvP remains outside this release.

Local verification (pre-rebuild gates, unchanged by packaging):

- Worker social suite: **430/430** (`npm test` in `cloudflare/massfront-auth`)
- Migrations: **55/55** including `0007-world-chat.sql`
- Social client probe: **49/49**; UI probe: **28/28**

Production Worker deploy and D1 migration apply were **not** performed.

## Published to Hugging Face (OTA / game updater)

Activated **2026-08-31** on dataset `CREATORJD/massfront-releases`:

- Live updater: https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/update.json
  — **version `1.33.49`** (verified after activation).
- OTA payload: `v1.33.49/` (**112** artifacts, **~88.95 MB** staged total).
- Android installer: https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main/MASSFRONT-v1.33.49-mobile-install.apk?download=true
  — **135,221,934** bytes; SHA-256 matches local handoff above.
- Historical manifest: `update-v1.33.49.json`; mirror: `MASSFRONT-update.json`.

**Not published in this pass:** `MASSFRONT-v1.33.49-source.zip`. The local
archive built successfully (**5.68 GiB**, includes `audit/` evidence trees) but
the Hugging Face LFS multipart upload failed twice with
`LocalProtocolError: Too little data for declared Content-Length` mid-transfer.
OTA/APK/manifest activation completed before the source step. Collaborator source
handoff still uses the 1.33.48 archive until a trimmed rebuild or a successful
source upload completes.

**Still not published:** Hugging Face Space, Cloudflare Worker deploy, store
submission, or production flag change. Production Worker deploy and D1 migration
apply were **not** performed.

## Open gates (Stage 18 / post-release)

- Physical Galaxy S25 Ultra timed 1v1–1v4 and audio checks.
- Physical iOS build/device acceptance.
- Owner-approved delivery strategy/budget for the optional model pack.
- Two-device multiplayer soak (reconnect, forfeit, suspend/resume, mobile network).
- Locked Horde turret-art gaps and remaining human approvals.
- Legacy release pointer/hash drift must be repaired before pruning.

Remaining work after this release: [`POST_1.33.49_MASTER_PLAN.md`](POST_1.33.49_MASTER_PLAN.md).

Post-release tools and the image/motion-first UI direction are handed off in
[`POST_STAGE18_VISUAL_EDITOR_UI_HANDOFF_2026-08-31.md`](POST_STAGE18_VISUAL_EDITOR_UI_HANDOFF_2026-08-31.md).
