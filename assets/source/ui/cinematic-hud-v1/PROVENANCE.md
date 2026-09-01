# MASSFRONT cinematic HUD material v1

- Purpose: original graphite/carbon command-surface material for the compact
  in-battle MASSFRONT HUD. It contains no text, logos, third-party game art, or
  baked controls; live DOM controls and faction art remain authoritative.
- Generation: created specifically for MASSFRONT with OpenAI image generation
  from the approved visual contract: dark forged composite, restrained cyan
  perimeter light, readable low-frequency center, and mobile-safe contrast.
- Author / rights status: project-original generated art, directed and accepted
  by the MASSFRONT project owner. No third-party source image, trademark, logo,
  or protected game artwork was supplied as an input. No external license is
  required by the recorded generation workflow.
- Original generated file:
  `C:\Users\Jason\.codex\generated_images\01a05095-e175-7cd1-be3a-da620bf1ff8a\exec-b5867173-91cd-4cdb-bd48-7bf878989a49.png`
- Canonical source: `mf-hud-panel-material-v1-source.png`
  - 1254 x 1254 RGB PNG
  - 2,083,326 bytes
  - SHA-256 `0233074f909824a281cbd05460dde07302da41ddf9b41431d35a50ff887fe67a`
- Runtime derivative:
  `../../../textures/ui/mf-hud-panel-material-v1.webp`
  - 512 x 512 WebP, YUV 4:2:0
  - 9,162 bytes
  - SHA-256 `fa61ab786d33357f41daed974aea62fb9bb0792915fbfe4130b275126c8492ab`
- Transform: Lanczos resize to 512 x 512, libwebp quality 76, compression
  level 6. The runtime image was visually inspected at native size after the
  transform.
- Packaging: `assets/source/` is authoring-only and excluded from player
  packages. The WebP derivative ships in browser/APK packages and is embedded
  into the atomic OTA shell for installers that predate this HUD.

The material is a surface layer only. Borders, labels, state colors, touch
targets, accessibility scaling, and all input behavior are rendered live so
they can adapt to resolution, safe area, faction, and game state.

## KEEL UGA communications portrait v1

- Purpose: original, compact communications portrait for KEEL, the neutral UGA
  expedition guide and ship liaison. It replaces the single-letter fallback in
  battlefield transmissions and is not a playable-faction commander portrait.
- Generation: created specifically for MASSFRONT with OpenAI image generation.
  The brief required a calm synthetic/holographic humanoid, graphite UGA collar,
  restrained authority-gold accents, cyan scan light, a clean mobile silhouette,
  and no words, logos, watermarks, or third-party franchise elements.
- Author / rights status: project-original generated art, directed and accepted
  by the MASSFRONT project owner. No third-party source image, trademark, logo,
  or protected game artwork was supplied as an input. No external license is
  required by the recorded generation workflow.
- Original generated file:
  `C:\Users\Jason\.codex\generated_images\01a05095-e175-7cd1-be3a-da620bf1ff8a\exec-a7deb50c-fe60-404b-b9a1-6c23af1c16f0.png`
- Canonical source: `mf-keel-uga-portrait-v1-source.png`
  - 1254 x 1254 RGB PNG
  - 1,964,180 bytes
  - SHA-256 `3884cb21dc1ec5bb80f8af78ea45c451b84648bc7dace58e76914ada2fdc2e15`
- Runtime derivative: `../../../textures/ui/mf-keel-uga-portrait-v1.webp`
  - 384 x 384 WebP, YUV 4:2:0
  - 13,360 bytes
  - SHA-256 `438f7496f01532ccd2db0d97b5c4cf265f98824ed75cad1c137a6cc2ca1f3f78`
- Transform: Lanczos resize to 384 x 384, libwebp quality 82, compression
  level 6. The runtime derivative was visually inspected at native size.
- Packaging: the source PNG remains authoring-only. The WebP derivative ships
  in browser/PWA/APK packages and is part of the atomic OTA shell.

## Runtime command and faction icon sheets

These five sheets are accepted legacy runtime assets. They entered the
canonical repository together in commit `6c3fed8` (2026-08-12, committed by
Jason Dixon) and are indexed by `assets/textures/ui/icon-index.json`.

- Known derivation: `tools/build-icon-sheets.cjs` measures and removes the
  supplied tile frame/caption, normalizes each glyph into an 8 × 8 atlas of
  128 px cells, converts the neutral command family to white-on-alpha, and
  preserves faction colour for the four faction families.
- Source status: the original transparent tile pack is not versioned below
  `assets/source/ui/`. The producer accepts a caller-supplied input directory;
  no external machine path is a canonical source.
- Author / license status: the importing commit and transform are recorded,
  but the original tile artist, commission record, and license are not present
  in this checkout. Status is `LEGACY_INPUT_RIGHTS_RECORD_MISSING`; retain the
  accepted bytes, but do not represent them as newly licensed or regenerate
  them from an unrecorded external pack.
- Runtime destinations and immutable accepted hashes:

| Runtime asset | Purpose | Bytes | SHA-256 |
|---|---|---:|---|
| `assets/textures/ui/cmdicons.png` | neutral command verbs | 147,502 | `56821dbfc289f80aa511548616e8729449673a0ec25745ecf4fa18cec90b3417` |
| `assets/textures/ui/icons-nova.png` | Nova build/unit roles | 360,448 | `14a20d4c144486173a30c7b05a1872e9e79407e3875d482d6ceafdcc22c48fc6` |
| `assets/textures/ui/icons-legion.png` | Ascendancy build/unit roles | 183,656 | `f01ded4c20822552fedd485e1cc34c6abf171f60d6c57e043c548c5837f81585` |
| `assets/textures/ui/icons-syndicate.png` | Coalition build/unit roles | 176,758 | `dbe5bb9cc142c78efe96b43b79d05419073f77ddb25753478e625729d4558e6a` |
| `assets/textures/ui/icons-horde.png` | Brood/Horde build/unit roles | 416,091 | `296adbadc44bb38124e32ec7bfbd1fd21d14fa2185b4f6428e6ee5e6c85b2d06` |
| `assets/textures/ui/icon-index.json` | authoritative sheet/cell names | 2,633 | `0ac8f6b584ceb52b93c16bb81286ef92ec16cc74de7926a2dcfb9073decfbdfb` |

All five PNG sheets are 1024 × 1024. `src/ui/hudflow.js` consumes the neutral
sheet; `src/ui/facticons.js` consumes the faction sheets. The browser/PWA/APK
package and OTA runtime resolver use these exact destinations.

## Playable commander portraits

The HUD does not have one permanently selected commander portrait: account and
campaign choice select one of nine playable identities. The primary portraits
are 384 × 384 WebP data URIs embedded in `COMMANDER_ROSTERS` in
`src/factions.js`; `commanderPortraitBinding()` falls back to the corresponding
384 × 384 JPEG under `assets/factions/commanders/`.

- Origin: both families were inherited by the reconstructed `v1.33.31`
  baseline in commit `284d305` (2026-08-12, committed by Jason Dixon).
- Derivation: no surviving canonical master or reproducible portrait generator
  is present. A historical comment names `tools/make-portrait.py`, but that file
  is absent, so it is not claimed as a producer.
- Author / license status: the import owner is recorded, but original author,
  source prompt/reference, and license are not. Status is
  `LEGACY_PORTRAIT_RIGHTS_RECORD_MISSING`; preserve the accepted bytes and route
  any replacement through a new project-original source record.
- Runtime hashes (all images are 384 × 384):

| Commander | Embedded WebP bytes / SHA-256 | JPEG fallback bytes / SHA-256 |
|---|---|---|
| `nova_kai` | 27,200 / `e86f20201dd306b0c3cdbab3b49919c6af93c57cb304098c312ef6e636e5aeae` | `assets/factions/commanders/nova_kai.jpg` · 75,797 / `a1011eacc617914255defc4dab9e155a773b0bdd5ccec0940fbef5c4b18a9696` |
| `nova_holt` | 28,868 / `da01ed837acfe05c16035cc440cb1b3bcd990cd2667f46ae3ee0918000bc80d0` | `assets/factions/commanders/nova_holt.jpg` · 70,807 / `3dfec82466b1b8a43f9179fec057d3e2ccd404792efcfc9f971f4a50acd56031` |
| `nova_vale` | 24,078 / `fc95ac996da085f6603abb1a184b2283f3edc59c0181580fced7918ebd94319a` | `assets/factions/commanders/nova_vale.jpg` · 68,349 / `dc91967a2452fe29847c73dbcad1fcea5acf587859db0807bda6ddde93511e76` |
| `legion_vex` | 25,604 / `1242771f72e9fedb301fa50a880a733d94725582af368a891d6ab93dbf500e51` | `assets/factions/commanders/legion_vex.jpg` · 83,261 / `63f4531d77e62c4494c423677eebadd277a2d75bfa5996ecb0eaf082671329c0` |
| `legion_korr` | 24,012 / `860deda8fdfe6e2b54f125f6efb338ca472fda74a729cc122ade4521407fa377` | `assets/factions/commanders/legion_korr.jpg` · 80,254 / `86b250818e5e082c132713233ce35685cac4924847fdbf89cfe009b5fbd5a3b0` |
| `legion_dravik` | 24,978 / `33a6db29587898e3f462861b523f372d2a1db46a428d3626dd9cfe6760689348` | `assets/factions/commanders/legion_dravik.jpg` · 80,639 / `b76bb5dbf751e882e1d3d3db7a54a05895ec229abe66e77e482690e9508a4ee8` |
| `syndicate_renn` | 21,764 / `e392e69e41312828330f375302189571e13efc5374a547221a0c75f09cb77890` | `assets/factions/commanders/syndicate_renn.jpg` · 65,803 / `84f44001e24bbc17006d2bbfa8c3dd0845900375482dc30e545d050b0f31aec7` |
| `syndicate_nyx` | 22,026 / `902e500a977eab7680d2d0907c0c78ae1740e65906780d0709ce09d75607e2d9` | `assets/factions/commanders/syndicate_nyx.jpg` · 65,592 / `cd173f391fa2e43afcada3e6bd53f71ce0b71ee6791eb7212fd1e10f15251213` |
| `syndicate_voss` | 21,810 / `87e2214baa78d21dee99f205fabf40cdf379acfc2b3507f4d44f3e9b814ef2d4` | `assets/factions/commanders/syndicate_voss.jpg` · 63,240 / `f9ffc200276b28304ed0bcb3920e23d91fffa3491f1b386437f58a2d095eb39b` |

The embedded WebP is the normal live HUD destination. The JPEG path is a
decode/load fallback, not a separate character identity or replacement source.
