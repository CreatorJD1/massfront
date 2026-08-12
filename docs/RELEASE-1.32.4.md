# MASSFRONT 1.32.4 release record

Published: 2026-08-04 (UTC) by Claude, per "publish every major update" directive.
Channel: Hugging Face dataset `CREATORJD/massfront-releases` (OTA) + static Space `CREATORJD/massfront-playtest` (web).

## What shipped

| Fix | File(s) |
|---|---|
| Launch title always plays before the menu (boot cover + overlay gate, next-frame open, 9s failsafe) | `index.html`, `src/intro.js`, `src/styles/intro.css` |
| Account portal: sign-in/register tabs, submit, eye, close all respond to Android tap (apTapBind via mfBindTap); input-guard deadline sanity cap | `src/authportal.js` |
| SAVE FILE button works on touch (mfBindTap) | `src/account.js` |
| Menu brand art replaces old emblem SVG + wordmark | `index.html` |
| Boot shield watchdog: guard can never strand at MAX_SAFE_INTEGER; 6s ceiling + fail-open | `boot.js` |

All verified headless (Chromium/SwiftShader, 412x900 touch) A/B against pristine 1.32.3:
menu never exposed before title; click-cancelled taps work in portal and SAVE FILE; account fully
interactive under a stuck guard. Full 40-file one-scope parse: no duplicate bindings.

## Artifacts

- OTA payload: `MASSFRONT-v1.32.4-update.js` — 27,463,551 bytes,
  sha256 `cceaef9213fc0727fa6bbbb040984accbe66437863618dceaca90176f4662735`
  - pinned commit `a0652059d6370a032e2399ea6682fcc682b9c296` (payload uploaded first, verified byte-identical from the pinned resolve URL before the channel switch)
  - embeds six art data-URIs (brand title x2, modifier atlas, 4 faction cinematics) = published-payload convention; built by `tools/bundle-update.mjs` + new `tools/embed-art.mjs`
- Manifest commit `576405e53860a02d2482da055f7f7c8db92e57a5` — `update.json`, `MASSFRONT-update.json`, `update-v1.32.4.json` published atomically; live `resolve/main/update.json` confirmed advertising 1.32.4/27463551.
- Space commit `3311082c8f18caed5c1e056836b7c7ee5111fc80` — live site serves APP_VERSION/PACKAGED_REV 1.32.4, new menu brand.
- No new APK: no native/boot-loader change requires one; `boot.js` watchdog reaches devices with the next APK build.

## Repo repair note

At 23:52 UTC on 2026-08-03 (after Codex stopped), the repo's `boot.js` and `assets/data/manifest.json`
were overwritten with a pre-1.32.3 revision (missing models-legion/machine/infestation, airlift,
airlift-factions, intro registrations, PACKAGED_REV, boot shield, and rollback machinery). This
release re-commits corrected 1.32.4 copies of both. Source of the rollback unknown — check any
sync/backup tooling before the next Codex run.

## Not in this release

- `src/uistack.js` + its ui.css additions (Codex WIP; CSS was unreadable at build time) — intentionally excluded.
- Research redesign (faction trees, material collectibles) — spec ready, implementation pending.
