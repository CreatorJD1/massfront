# MASSFRONT v1.33.79 GALACTIC INTEGRATION

Published 2026-09-08.

## Player-facing corrective bundle

- Reconnected Standard deployment to the integrated Galactic War Table and
  carried the selected operation, location, opponent, objective and loadout
  through the secured base-game bridge into the live RTS battle.
- Restored Classic as a visible UGA Command destination that opens the real
  five-mode War Room instead of a duplicate or placeholder shell.
- Repaired protected Training, tutorial completion and tutorial Skip so both
  paths converge on the mandatory faction and authentic Commander 1
  commissioning gate before the full career opens.
- Made Galaxy, Ship, Missions, Classic, Social, Settings, Crew and More visible
  as one integrated command surface. Social now exposes an honest signed-out
  state and Settings remains usable in portrait and landscape.
- Added readable warfront control, pressure and contested-state information,
  and connected the strategic selection to deployment preparation rather than
  presenting space as a disconnected minigame.
- Zoomed planetary survey out to preserve a complete globe, and tightened UGA
  ship/district camera framing so Research, Fabrication and Habitat remain in
  frame on phones.
- Added visible narrow-screen swipe affordances, full bottom-navigation labels
  and 44 px-or-larger touch targets without horizontal page overflow.
- Removed the obsolete experimental-exploration preference from the active
  product surface while preserving save migration.
- Fixed the repeating fleet-navigation scheduler so route work cannot starve or
  freeze after the first order.

## Published channels

- Stable OTA: v1.33.79, 115 artifacts, 96,949,402 bytes, runtime root
  `e0137e2452328b80c44cee417104039f44775ea7484c4422a903a29aadb77257`,
  manifest root
  `94589e7169dac160bb27fafff0e1b57ef0507e6546d45e4ad04d95408b585bb3`.
- Hugging Face OTA manifests: commit
  `9066d3b0bff603402fa4b833aa796edb19f6994f`.
- Cloudflare Stable and immutable OTA/content namespaces: active at v1.33.79.
- Android: `releases/MASSFRONT-v1.33.79-mobile-install.apk`, 260,847,561
  bytes, SHA-256
  `cb305cff7cfca7539d90eeb3bfda257e686397677ecfa0bdcd6ab64ed6fd068f`,
  versionCode 13379. The optimized package is 16 KiB-aligned and v2/v3 signed
  with the pinned single signer.
- Browser/PWA: exact packed v1.33.79 is live on
  `CREATORJD/massfront-playtest` at commit
  `41b7d636397b2d8d0cc881fa5841dbc50725ead8`.
- Galactic content: 473 files, 147,930,767 bytes, immutable namespace
  `/f/1.33.79/content-r1/`, manifest SHA-256
  `edc34c6b67b26026da6e46db37a0890b85d9342e7073c76afec696c312193d6d`.

## Verification

- Bundle and packed-web gates passed with 113 classic-script sources and 473
  Galactic content files.
- `audit/stage11-space-ux-v13379-release-candidate/evidence.json`: 126 passed,
  0 failed, 25 browser captures, zero local request failures, and stable source
  hashes. It exercised launcher, integrated UGA, onboarding choice, faction
  commissioning, all 11 ship rooms, Classic War Room, Standard deployment,
  live RTS, protected Training, Skip and completion convergence.
- `modules/space_exploration/tmp/responsive-interface-audit/report.json`: 91
  captures with zero runtime errors, clipping, undersized controls, page
  overflow or WebGL context loss.
- `tmp/nav-next/orders-20260908-v13379-release/report.json`: packed navigation
  passed all 11 cases with source/www equality and deterministic repeated route
  output.
- `.tmp/live-space-release/v1_33_79_retry1/evidence.json`: the live Space passed
  pinned/hosted byte comparison, README preservation, fresh signed-out browser
  launch and integrated Galactic entry on ANGLE D3D11 / NVIDIA RTX 4060 with
  zero page, request, HTTP or application errors.
- All local/HF-resolve/HF-raw/Cloudflare manifest identities match, and every
  advertised ranged object passed strict CORS/Range delivery checks.
- The first immediate post-upload Space probe caught a temporary 108/113-file
  propagation state. It was rejected, the complete 1,327-file hosted inventory
  and all 113 runtime scripts were rechecked, and only the subsequent clean
  hardware-browser run was accepted.

Physical Android-device acceptance and Apple Safari-installed PWA acceptance
remain untested device gates, not repeated failures. Native iOS release work is
permanently retired.

