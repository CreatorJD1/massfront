# Codex pass-down — MASSFRONT

Refreshed 2026-09-27 UTC. This is the **only current pass-down in the repository**.
Do not create dated or agent-named siblings. Rewrite this file in place. The stable
index at `docs/HANDOFF.md` points here.

Read `AGENTS.md` before touching anything. This checkout has one global JavaScript
scope, two source manifests, a cooperative verification freeze, and a guarded
five-channel release procedure.

## Current state

| Item | Current truth |
|---|---|
| Canonical Local entry | `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source` |
| Physical checkout | `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple` |
| Branch | `cursor/strip-mass-node-bloom` |
| HEAD | `f44e1f65d0cf1e24833421c70e4520e68c3ef305` |
| GitHub `main` | `622cb04f8364aa5d65a2993fb804a02cb201ac4c`, four commits ahead of local HEAD; no push from this checkpoint |
| Local source/packed version | **1.33.97** plus newer, unpublished WIP; not the same bytes as public 1.33.97 and not a release candidate |
| Public browser / Cloudflare / HF OTA / HF Space | **1.33.97** observed 2026-09-26; no new player-facing publication from this checkpoint |
| Android | Versioned 1.33.97 APK exists, but mutable `MASSFRONT-install.apk` remains a stale 46.6 MB installer; do not claim parity |
| Runtime compatibility | `34513acaa848` (latest packed source-identity prefix) |
| Balance identity | `f19e6c5712e7` (latest packed output prefix) |

The working tree has 217 collapsed dirty entries (459 with every untracked file
expanded), including Freebuff's Galactic work, newer GUI/RTS work, and the
Stormpeak tester. Nothing is staged. Do not reset, clean, discard, overwrite,
or publish it on the strength of an earlier 1.33.90 or focused 1.33.97 pass.

## September 27 send-all checkpoint — Freebuff/Grok continuation authority

The owner asked to update GitHub `main`, then update the game across channels,
and make a large handoff. **No commit, push, version bump, upload, activation,
or production Worker write has occurred in this checkpoint.** GitHub source
publication and a player release are separate gates. On 2026-09-27 the owner
**explicitly overrode** the newer `main` rule reserving Tessendorf Stormpeak
for the `stormpeak/ocean` branch: the reviewed vendored
`modules/stormpeak_ocean/`, `src/stormpeak-tester.js`, host registration and
packer delivery now belong in GitHub `main`. This is source-placement authority,
not acceptance of the Ocean gameplay or permission to activate a player release.
The existing `stormpeak/ocean` branch under `modules/stormpeak/` has different
code and stays intact as historical/parallel work; do not merge the two module
trees blindly. Update `AGENTS.md`, `.cursor/rules/stormpeak.mdc`, and the
stable handoff index when integrating remote `main`, so future agents do not
follow the superseded prohibition. Do not silently use `-X ours`, force-push,
make another checkout, or drop work to make the push look complete. A proposed
next player version `1.33.98` has not been confirmed.

**Git publication blocker (2026-09-27):** `.git/index.lock` is a zero-byte
file last written 2026-09-24 UTC. No Git process was running when checked, but
Git cannot stage while it exists. Two attempts to remove this exact stale lock
were denied by the execution policy; do not bypass that denial with another
shell, Git index, or file API. Nothing was staged or pushed. Ask the owner to
clear the stale lock through their local environment, then verify its absence
and rerun the workspace guard before staging. The reviewed source candidate is
408 paths after excluding local-only `audit/**`, `salvage-e2e/**`, and
`.claude/launch.json`; verify the actual staged list and secrets/LFS pointers
again before committing. Do not publish the old `update.json` as a new player
release or force an update of `main`.

### Work and evidence completed here

- A hard-coded preview OAuth secret was found in the untracked vendored ocean
  module and removed before any staging. The module now reads its client ID
  and secret only from private server environment variables, fails closed
  when auth is expected but missing, ignores real `.env*` files, and includes
  a credential-free `.env.example`. The focused auth-source suite passes 4/4.
  Because the module came from an upstream sidecar, the old credential must be
  rotated/revoked before auth is reused. Do not print or commit its former value.
- `index.html`, `src/launcher.js`, and `src/styles/ui.css` now use the existing
  War Table art for the launch hero, a one-sentence brief instead of a clipped
  changelog wall, and optional full release text. `tools/verify-packed-www-8901.mjs`
  now closes its isolated browser correctly; the same cleanup error was fixed
  in `tools/verify-launch-affordance.mjs`. The final packed front command exited
  **0**, on RTX 4060 D3D11, with zero page/console errors. Its inspected image
  and verdict are in `tmp/send-all-2026-09-26/packed-front-final/`. Only the
  412x915 front was accepted; cold/warm/offline/update variants and larger text
  remain open. The still-gold initial focus ring comes from current focus
  styling; the separate reported title-box outline is not resolved here.
- A prior Classic setup test returned green while its Region card visibly
  overlaid rewards and weather. The focused CSS repair in `src/galaxyui.js`
  separates the rows without dropping Clear Skies/conditions and fits its full
  explanation above the short-landscape action dock. The verifier now checks
  sibling collisions and dock clearance. Final packed report and inspected
  portrait/landscape images:
  `tmp/classic-mobile-flow-2026-09-27T06-45-37.060Z-1388020/`.
  Source/package hashes matched, real RTX 4060 WebGL2, all five selection
  stages, zero page errors, process exit 0. At 915x412 weather bottom was
  y299.96, dock top y304. This is **not** a full Classic match or enlarged-text
  approval; the card remains small and text-dense.
- `node tools/verify-global-scope.mjs` passed 114 manifest scripts/3527 global
  names. The Stormpeak tester build passed (1663 modules, seven runtime files,
  1.29 MiB); the UGA runtime manifest passed (508 files, 144.73 MiB); root
  `node tools/bundle.mjs` passed (114 sources, 27.69 MB) and `node tools/pack-www.mjs`
  passed (292.8 MiB). Latest packed runtime compatibility is above. Focused
  launcher gateway/updater/identity contracts pass.
- Ten local UGA/Classic progression, bridge, restart and inventory contracts
  pass, including all nine authored operation adapters and forged-envelope
  rejection. Ten local multiplayer, seat/setup/result/reconnect/lobby and
  adboard contracts pass; the real MatchRoom in-memory test passes 25/25 and
  Worker social-handler/in-memory D1 test passes 437/437. Stormpeak seabed,
  land/sonar, module syntax and auth-source contracts pass. These are **source
  contracts**; they do not prove player-fought rewards, a packed two-client
  long match, production D1, visible sonar stability, or real paid ads.
- Earlier UGA commissioning/recovery, one fixture-assisted mission return,
  connected cutaway/44 room states, six-state RTS HUD (234/234) and mixed-stance
  (13/13) captures remain useful focused evidence below. They are not whole-game
  acceptance, and the HUD capture predates the latest CSS hash. Re-run any
  gate against the exact final candidate before activation.

### Current product/release gaps

`docs/GAME_GUI_OVERHAUL.md` is the whole-game surface ledger. The requested
mobile-first GUI/art simplification is unfinished: narrow phones and 125-200%
text, all menu/submenu states, real scroll-to-end actions, Strike Bay readiness
and anime-consistent specialists, faction-specific visible deployment-ship
geometry, a more coherent/polished ship cutaway, social/inventory continuity,
and physical Safari PWA/Android still need acceptance. UGA is the persistent
space-exploration/RTS command home; Classic shares the same worlds in a simpler
format. Do not re-split them into unrelated game types. `gas_air` remains marked
`shipped:false`; ocean/gas variants for all playable factions and the AI-only
Brood are content work, not finished playability. Proximity adboards still use
fictional local creatives and a network-provider stub, with no paid delivery,
consent/measurement/settlement or real-money revenue. Social remains an
experimental two-human-seat relay. Current packed multiplayer first-hash,
long-match/reconnect/rewards, live Worker/D1 and Ocean free-camera/sonar mobile
stability are open. Do not run a sustained high-load Ocean GPU capture without
bounded quality/duration, crash/context-loss logging and a known-good machine.

### Exact next actions and stop conditions

1. From the canonical Local checkout, read `AGENTS.md` and this handoff; run
   `git rev-parse --show-toplevel`, verify `.git` is a directory, inspect
   `git status`, and run the workspace guard's `check-write` command before
   each writer. Never delete a live freeze; use the guarded
   `clear-stale` route only for a dead same-host lease.
2. Apply the owner's Stormpeak-on-`main` override and reconcile the four newer
   remote-main commits before pushing. Review an exact inclusion list: include functional
   source/tests/accepted LFS art, but exclude `audit/**` captures, `salvage-e2e`
   screenshots, personal `.claude/launch.json`, generated `www/`/`dist/`,
   scratch, and the two tracked Stage-15 evidence JSON edits. Scan staged text
   for secrets, verify LFS pointers, `git diff --cached --check`, bundle/pack,
   then make a source-only commit. Merge current `origin/main` preserving both
   handoff and remote policy; fast-forward-push `HEAD:refs/heads/main` only
   after an exact non-force review. If remote head moved, refetch/review again.
3. Close the current player-evidence matrix before a candidate: real packed
   launch -> UGA -> scan/mission -> commander/map -> player-fought battle ->
   debrief/rewards -> UGA/reload, Classic victory and defeat/restart, 320/360/
   412 portrait and short landscape with enlarged text, Ocean underwater/sonar,
   two-client match through reconnect/replay/reward, visual adboard safety,
   Android install/update/restart/rollback and physical Safari-installed PWA.
   Preserve source/package hashes, real hardware-WebGL screenshots and failure
   logs. A clean console or green geometry assertion alone is not enough.
4. After the owner confirms a new exact version/category/notes and feature
   scope, use `docs/FIVE_CHANNEL_UPDATE.md` and the release skill. Its
   `-PrepareOnly` step is **not read-only**: it rewrites version files and builds
   the full Android package. Boot and Gradle are dirty, so do not use
   patch-only. Upload immutable artifacts first; pin the observed prior
   1.33.97/manifest root
   `1678bc1cbda219dd7dd53cb32da3a686eeedabefc453a9f438e490d55239f7f5`
   for guarded Cloudflare/HF activation, and upload byte-identical `www/` to
   HF Space separately. Recheck public browser, OTA range/CORS/rollback,
   Android signature and actual installer alias. Native iOS remains retired;
   Safari PWA is the Apple channel.
5. Stop before a player-facing external write if the exact version/scope,
   credential rotation for enabled auth, source inclusion,
   release evidence, remote prior pointer, or freeze state is unresolved. A
   GitHub source push, packed local preview, and player release are three
   different outcomes; report each channel as pass/fail/skipped/blocked.

## September 26 checkpoint — earlier focused acceptance boundary

- `node tools/bundle.mjs`, the 507-file Galactic runtime manifest build, and
  `node tools/pack-www.mjs` pass. The post-fix packed mobile GPU run at
  `tmp/uga-next-action-packed-ui-2026-09-26T23-01-56.913Z/report.json` passes
  with RTX 4060 D3D11, source/pack hash parity, no page errors, and screenshots:
  launch, real Nova commissioning, a discovered mission's exact Mission Ops
  construction action, reload persistence, zero-probe emergency globe scan,
  and a research spend persisted through reload. This is one focused UGA path,
  not full career or planet acceptance.
- The new Sombrero/Andromeda/Orion route surveys initially lacked zero-probe
  rescue. `progression.js` now includes all three in the finite emergency set;
  `probe-resupply-critical-survey.test.mjs` passes for zero probes/credits and
  one-time unlock of each next star. Rebuild and packed UGA capture followed.
- The earlier packed battle-return run at
  `tmp/mission-return-packed-mobile-proceed-20260926-a/report.json` failed:
  its first-clear fixture selected a Standard battlefield locked by the new
  map ladder. This failure is retained as history; see the passing resume
  capture below.
- Freebuff's four-tier gates and Zephyros authoring have focused source tests,
  not packed acceptance across every star/body/region/map. Caldris is described
  as an ocean theatre while its deployed maps are `aelos_ridge`/`aelos_north`;
  the wet `aelos_coast` map is assigned to Ithara. Resolve the authored label
  versus actual map authority before claiming the ocean theatre complete.
- Wreck contacts say “BOARD THE WRECK” but currently grant one-time salvage
  without a boarding scene (`boarding.shipped: false`). Social is an experimental
  two-human-seat relay, not full multiplayer progression. Ship Inventory is a
  read-only module view, separate from Classic gear and deployment loadout.
  The Campaign/Prologue labels conflict on availability. Proximity boards have
  local fictional creatives and a network-provider stub, but no paid delivery,
  trusted measurement, consent/settlement, or revenue acceptance. Do not claim
  real-money ad income.
- No version bump, channel activation, upload, or public release occurred in
  this checkpoint. Request separate owner approval before any five-channel
  release.

## September 26 resume — battle return and future visual pass

- `tmp/mission-return-packed-mobile-resume-20260926-d/report.json` passes on
  RTX 4060 D3D11 at 412x900: source/packed hash parity, stable verification
  freeze, no page errors, real Nova commissioning, Compact map deployment,
  tactical package landing, mobile commander/ability touch, debrief, return
  to a next UGA action, and reload/return-URL replay without duplicate rewards.
  The tactical victory is accelerated by enemy-damage fixture; this is not a
  player-fought full-match or every-map acceptance. Screenshots were inspected.
- The real ground-operation bridge first rejected the new `rewardModifiers`
  field with `OPERATION_FIELDS_INVALID`. The exact V3 field authority now admits
  it with bounded numeric validation. `test-stage9-galactic-bridge.mjs` and
  `test-galactic-operation-adapter.mjs` pass across all nine authored missions
  using their newly open Compact rung; `loop-alignment.test.mjs` passes.
  The module/content manifest did not change; `bundle.mjs` and `pack-www.mjs`
  passed after the classic bridge edit.
- The requested future immersion pass remains **audit only**. Current packed
  captures show overlapping home/dock/ship routes, a text-heavy first fold,
  and a Strike Bay footer saying `LOADOUT BLOCKED` without its reason at the
  point of action. Preserve essential controls while consolidating routes,
  replacing implementation language, and shortening contextual copy.
  Strike Bay's style mismatch is asset-level: commander portraits are
  anime-leaning, while all 12 specialist WebPs are photo/PBR-like across the
  three factions. The hangar panorama contains no character; CSS cropping is
  not the cause. Agree on one anime-flat reference, then replace and compare
  portraits in packed phone screens. No art was changed in this resume.
- A deployment capture briefly showed exterior/black space behind the Strike
  Bay loadout while the room was transitioning; the later stabilized capture
  showed the interior. Treat this as a visual lead requiring a timed packed
  reproduction before changing the renderer. Ocean theatre/map authority,
  multiplayer progression, paid ad delivery, and full GUI acceptance remain
  open. No public channel was changed.

Everything below this checkpoint describes the earlier 1.33.90 work and is
historical context, **not** a current version, public-channel audit, release
instruction, or acceptance claim.

## Owner decisions that govern this candidate

- MASSFRONT must move away from typographic menu walls toward crisp, clean,
  stylized contextual artwork, motion, and real 3D presentation.
- UGA ship sections are sealed interiors. Stars, planet edges, exterior hull,
  and black space must never appear behind an interior room. System and Galaxy
  screens are exterior by design.
- Context decides the art. Generic orbs and interchangeable hologram filler are
  not acceptable substitutes for a room, service, or faction-specific image.
- The playable factions are Nova, Dominion, and Syndicate. Each has its own
  commander roster, portrait, preview, ability floats, and research presentation.
- The Brood is the universal AI enemy. It is never a career identity, commander
  choice, Development faction, or player research tree.
- User-authored commander sheets are source references only. Shipping portraits
  are regenerated production art in the established game style.
- Apple remains supported through the Safari-installed PWA. Native iOS work is
  retired and is not a release channel.

## What changed in 1.33.90

1.33.89 was never published, so 1.33.90 carries all of it plus the ocean tester
below. Prior published version is 1.33.88; use that as the expected-prior guard.

### Ocean Theatre Tester (Stormpeak)

The entire Stormpeak ocean project is vendored under `modules/stormpeak_ocean/`
(`SOURCE.txt` records the upstream commit). It is a Vite/React/three.js app and
therefore cannot enter MASSFRONT's single global scope; it ships the same way
Galactic Exploration does, as a sibling document with its own WebGL context.

- Build: `cd modules/stormpeak_ocean && npm run build:tester`. `tools/pack-www.mjs`
  refuses to stage the module unless `dist/stormpeak-runtime-manifest-v1.json`
  matches the bytes on disk. Staged size is 1.22 MiB over 8 files; the upstream
  landing-page art (`__grok/`, `og.jpg`, `x-banner.jpg`) is pruned by the
  manifest builder rather than deleted from the vendored source.
- `package.json` in that module is a MASSFRONT build overlay; the upstream file
  is preserved as `package.upstream.json`. Do not pin `typescript` there — Vite
  transpiles TSX with esbuild, and the pinned version does not exist on npm,
  which stalls `npm install` instead of failing.
- Host surface: `src/stormpeak-tester.js` adds a Settings > System toggle
  (`META.settings.oceanTester`) plus an OPEN row, and injects a War Room DEV
  card when the toggle is on. It takes over `renderSettings`/`renderWarRoom`
  rather than editing them.
- Return: the tester writes a nonce ticket to `sessionStorage` and comes back
  through `index.html?from=stormpeak`. `src/launcher.js` treats that like a
  Galactic return and bypasses the launcher gateway, otherwise the player would
  have to press CONTINUE TO INTRO again. Because Galactic Command owns the
  strategic home and intercepts `startScreen`/`warScr`, the return hands control
  back to UGA and only toasts; forcing classic Settings open there wins one
  frame and is then navigated away.
- The tester never writes career, XP, or saves.

## What changed in 1.33.89

### Interface art and motion

Sixteen purpose-built menu plates now cover Operations, Arsenal, Development,
Contracts, Career, Settings, Inbox, Social, Navigation, Survey, Habitat/Medical,
Strike Bay, Logistics, Embassy, Concourse, and Engineering. The source pack is
under `assets/textures/ui/menu-art-v1/`; UGA has a module-local runtime copy under
`modules/space_exploration/assets/runtime/ui/menu-art-v1/` so OTA-updated older
Android packages do not depend on new base-installer files.

The menus use art-backed hero areas, restrained transition motion, and live 3D
hosts where the renderer owns a meaningful model. Reduced-motion mode turns the
motion off. The new art pack deliberately avoids text baked into art, exposed
space in interiors, photorealism, and repeated generic hologram motifs.

### Commanders

The two owner-authored designs are preserved as read-only design references under
`assets/factions/commanders/source/user-authored-2026-08/` and are excluded from
packed `www`.

Shipping production art:

- Nova Captain Elara Kai: `nova_kai.jpg` plus 12-frame `nova_kai-speaking.webp`.
- Syndicate Broker Lys Renn: `syndicate_renn.jpg` plus 12-frame
  `syndicate_renn-speaking.webp`, using the black/green field outfit language.

The commander stage now makes the matching animated portrait primary. The real 3D
faction vehicle remains a smaller, honestly labelled **3D CHASSIS** inset; it is no
longer presented as though a generic vehicle were the commander. Commander cards,
Career Identity, previews, and active-commander state now use the same canonical
portrait. The selected commander is filtered out of the alternate roster instead
of appearing twice. Each card/preview exposes three faction/role ability floats.

Playable rosters:

- Nova: Kai, Holt, Vale.
- Dominion: Vex, Korr, Dravik.
- Syndicate: Renn, Nyx, Voss.
- Brood: AI-only enemy roster; never selectable.

### Brood correction and the six-icon mistake

The temporary six-icon sheet contained two Dominion upgrades, two Syndicate
upgrades, and two icons for stale Brood-as-player research. The two Brood concepts
should never have existed. They were removed from runtime and package output.
The older tracked orphan `assets/icons/items/res_hor_gene_splice.png` was also
deleted. It is recoverable from Git history, but must not be restored to a player
research surface.

Only four new playable-faction research icons ship:

- `res_asc_iron_discipline.png`
- `res_asc_crown_battery.png`
- `res_syn_drone_mesh.png`
- `res_syn_phase_lattice.png`

Development now has exactly Nova, Dominion, and Syndicate tabs. The stale Brood
research nodes and doctrine consumers are gone; old saves/mod state are rejected
with enemy-only wording. The Brood Sovereign remains in combat AI, story, dossiers,
infestation systems, and enemy models only.

### UGA interiors and 3D presentation

All eleven UGA rooms were audited in both phone orientations. Context plates are
room-specific, and the 3D cutaway remains the navigation authority. The previously
empty-looking uncommissioned Strike Bay now retains its sealed 39-mesh structural
interior while the operational deployment arena, ships, and equipment correctly
remain locked. Survey was exercised through the real control and its globe remains
inside the sealed lab.

### Gameplay/interface geometry repairs

- Short-landscape CSS no longer reopens the main menu over a rotated live match.
- Closing an in-match popup synchronously restores the HUD layout.
- Base Finder clears the portrait command dock; final measured gap is 1 px with
  zero overlap (landscape 9.078 px).
- Goal detail and Intel touch targets are at least 44 px.
- Inbox Back returns to the live match without leaving `mfMenuOpen` behind.
- Training Brief is reachable in the active Weekly Operations pane.
- Main menu percentage sizing, Inbox nested horizontal scroll, and landscape
  Version Center geometry were repaired.
- The dock label formerly called INTEL now says CAREER, matching its destination.
- Development's ambiguous LOADOUT label now says MODULE FIT.

## Final local acceptance

The final web package was rebuilt after the last 4 px Base Finder correction.

- `node tools/bundle.mjs`: PASS, 113 sources, 27.57 MB.
- `node tools/pack-www.mjs`: PASS, 290.5 MiB.
- Packed manifest: 124/124 files match declared size and hash.
- Hardware renderer in every visual suite: RTX 4060, ANGLE D3D11; no SwiftShader.
- Interface audit: PASS, 16/16 menu plates packaged and browser-decoded, all
  targeted menus and Version Center in 412x915 and 915x412, zero overflow,
  clipping, page errors, console errors, or local request failures.
- Commander audit: PASS, correct Kai/Renn portrait and animation, active commander
  absent from chooser, three ability floats, canonical Career portraits.
- Brood exclusion: PASS, no Brood Career entry, Development tab/node, or forbidden
  purple research icon in the package.
- Gameplay audit: PASS, cold Standard route through live deployment in both
  orientations, rotation while live, Inbox return, Training route, 44 px goals,
  and Base Finder clearance. The earlier click timeouts were harness artifacts:
  the loading/live UI replaced the clicked button during Playwright retry.
- UGA audit: PASS, 27 surfaces per orientation, all 11 rooms, Survey real-control
  route, 39-mesh uncommissioned Strike Bay, zero overflow/errors/failed requests,
  and no exposed space in any ship room.
- Reduced motion: PASS, zero running CSS motion and static commander fallback.
- OTA binary-art gate: PASS, 34 runtime assets, 19,284,641 embedded bytes.
- Exploration delivery contract: PASS, 60 checks.
- Exploration delivery build: PASS, 34 checks.
- `git diff --check`: PASS.

Evidence:

- `.tmp/gui-audit/interface-13389/summary.md`
- `.tmp/gui-audit/interface-13389/report.json`
- `.tmp/gui-audit/gameplay-13389/report.json`
- `.tmp/gui-audit/uga-13389-final2/summary.md`
- `.tmp/gui-audit/uga-13389-final2/report.json`

Physical Safari/PWA and Android-device acceptance are **untested—not repeatedly
broken**. Browser acceptance used the real GPU desktop path with mobile touch
viewports.

## Final local release artifacts

### OTA

`releases/staging-v1.33.89/`

- 115 artifacts.
- 101,202,339 payload bytes.
- Runtime compatibility `eba92467bce4...`.
- Balance identity `ff88a4d783e8...`.

### Typed exploration content

`releases/exploration-delivery-v1.33.89-r3/`

- 499 files, 150,243,649 bytes (143.28 MiB).
- Immutable base:
  `https://massfront-update.jasondixon1994.workers.dev/f/1.33.89/content-r3/`
- Manifest SHA-256:
  `3865958d664c6722e92a8b5b4b7c85e3a3a315836606413982fe56721d0567fb`
- Descriptor is bound in `assets/data/exploration-pack-remote.json`.

### Android candidate

Final accepted source package:

`releases/MASSFRONT-v1.33.89-candidate-r2-mobile-install.apk`

- 267,587,663 bytes (255.19 MiB).
- SHA-256:
  `4A85DC2DDF9F2E52F16A69FB6B7E8439B2A50F58FD7A2B770D58CC3863A33E38`
- Package `com.creatorjd.massfront`, versionCode `13389`, versionName `1.33.89`.
- 16 KiB page alignment verified.
- APK Signature Scheme v2/v3 verified; one signer.
- Signer certificate SHA-256:
  `D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0`
- Embedded final `boot.js`, `index.html`, Kai/Renn art, speaking animation,
  playable research icon, and module-local Strike Bay plate byte-match `www`.

Do **not** publish the earlier
`releases/MASSFRONT-v1.33.89-mobile-install.apk`; it predates the final Career,
Brood, and Base Finder repack. The `candidate-r2` artifact above is authoritative.

## Historical September 12 public-channel audit

No external channel was changed during this candidate build.

- Hugging Face OTA resolve/raw and the Cloudflare stable mirror agree on 1.33.88.
- Cloudflare whole, delta, ranged, CORS, and manifest checks passed for the live
  release. Live root identity:
  `200dd2a03da198fbc708de4d88939a99d31a31ea61f142c4a288d37eb73c5038`.
- Hugging Face Space is public/RUNNING at commit
  `6d7d7aa31cc956e0a200426ba519e223f7193f87` and serves 1.33.88.
- Published Android is not synchronized with 1.33.88. The latest versioned
  installer found was 1.33.86 (262,303,070 bytes, SHA begins `333c6c`). The
  mutable `MASSFRONT-install.apk` embeds 1.32.16 (46,590,280 bytes, SHA begins
  `3b5b65`). No 1.33.87 or 1.33.88 installer was found.

Therefore the earlier statement “live everywhere on 1.33.88” was false. A
1.33.89 release must use the full publisher path, not `-PatchFrom`, so Android is
actually repaired as part of the same activation.

## Historical 1.33.90 release plan (superseded)

Local preparation is complete. Publishing is still blocked on one fresh explicit
owner confirmation naming the target and action. Before any external write, ask:

> Activate MASSFRONT 1.33.89 now across Hugging Face OTA/content, Hugging Face
> Space, Cloudflare stable mirror, and the Android installer?

On confirmation, follow `docs/FIVE_CHANNEL_UPDATE.md` and the release skill:

1. Re-run the workspace guard and verify the final candidate hashes above.
2. Upload the immutable typed exploration `content-r3` closure, manifest last.
3. Run the full release publisher in upload-only mode for immutable OTA, source,
   and the authoritative `candidate-r2` Android installer. Do not use patch-only.
4. Upload the exact accepted `www` to HF Space using expected prior commit
   `6d7d7aa31cc956e0a200426ba519e223f7193f87`.
5. Prepare Cloudflare, then activate with expected-prior 1.33.88/root guards.
6. Repoint HF manifests under the same expected-prior guard.
7. Re-fetch and verify browser, OTA, content, Space, Cloudflare, ranged delivery,
   Android metadata/signature, and immutable hashes. Name any skipped channel.

Do not change root `update.json` from its live 1.33.88 pointer until the guarded
activation sequence is actually being executed.

## Repetitive or redundant interfaces: audit and recommendations

These are product recommendations, not hidden release blockers.

1. **Standard and War Table duplicate entry/orientation.** Put Standard inside
   War Table's compact Basic Access surface and keep one authoritative route.
2. **Five War Table orientation blocks repeat instructions.** Replace them with
   one `? GUIDE` drawer that auto-opens once per new career or stage.
3. **Progress repeats Campaign and Development.** Keep Expedition/territory in
   Progress; let More own the deep Campaign and Development destinations.
4. **Social appears in both the primary dock and More.** Remove the duplicate
   More entry while the dock route exists.
5. **UGA room navigation is duplicated by deck selector and Aboard shelf.** Keep
   the real 3D deck selector authoritative; reduce Aboard to non-room utilities.
6. **Five UGA quick actions are too many.** Show two or three contextual actions
   and move the rest into the existing Manage drawer.
7. **Launcher and Inbox both carry long release history.** Keep Version Center
   authoritative; Inbox should show a compact “What changed” card linking there.
8. **Arsenal loadout and Development loadout overlapped semantically.** The first
   repair is already applied: Development now says MODULE FIT. Next, make Arsenal
   the combat preset and Development the persistent module authority.
9. **Build, Owned Buildings, Production, Base Finder, and Inspector compete for
   the same match context.** Merge them into one mutually exclusive context shell
   while preserving the underlying data.
10. **Objective detail behaves like another popup.** Make it a persistent mission
    card in the orders/event lane.
11. **Signed-out Social repeats its sign-in gate on every tab.** Use one shared
    gate and disable or hide unauthenticated tabs until sign-in.
12. **Notifications have multiple competing surfaces.** Use one expandable rail
    with severity and unread state instead of separate repeated trays.
13. **Settings is reachable from several contexts without caller ownership.** Keep
    the routes, but make Return restore the exact calling screen rather than act
    like a third navigation system.
14. **The five deployment stages are useful; the instruction walls are not.** Keep
    Galaxy → System → Planet → Region → Deploy, but replace repeated prose with
    compact contextual visual cues.

Surfaces deliberately kept separate:

- War Room (mode selection) versus Operations (missions/activity).
- Contracts (rewards/agreements) versus Operations.
- Inbox friend requests versus Social Friends.
- First-run account gate versus Profile Account.
- Style store ownership versus Identity equipment; clearer naming is enough.
- Pause and Debrief actions, though Debrief should remain compact in landscape.

## September 26 local GUI continuation (September 27 UTC captures)

- This is a local-source GUI wave in the same dirty checkout at HEAD
  `f44e1f65d0cf1e24833421c70e4520e68c3ef305`; it is **not published**.
  `docs/GAME_GUI_OVERHAUL.md` is the whole-game surface ledger and preserves
  the unfinished acceptance gates.
- The main menu now has one `ENTER MASSFRONT` entry instead of a redundant
  Explore Space tile. UGA Depart remains the orbital route. The first-tap
  support-tile path and menu title clipping were repaired. The current packed
  `verify-menu-chrome.mjs` run passes 412/360 portrait, 320 portrait at 200%
  text, 915 short landscape at 150% text, and one-touch/Enter route checks;
  screenshots are under `tmp/menu-chrome/`. The whole-game title/art audit is
  not done.
- Offline Classic defeat has `Restart Battle` instead of dead `Continue`, with
  guarded same-map/setup relaunch; UGA setback retry requests a fresh mission
  plan. `test-defeat-restart-contract.mjs`, `ground-operation-v3.test.mjs`,
  and `test-online-result-safety.mjs` pass. A packed player-fought defeat/retry
  remains unverified.
- Classic's selected battlefield card shows conditions/weather again, and
  the selected-map dossier refreshes on an unlocked site change. A broad
  `.mfRegionHero b` selector had applied title type to the threat/hostile/
  resource/hazard values; it is now direct-child-only. The fresh packed
  `tmp/classic-mobile-flow-2026-09-27T03-21-28.049Z-1344300/report.json`
  passes source/pack parity, hardware RTX 4060 D3D11, 412 portrait/915 short
  landscape, all five Classic stages, no page errors, and alternate-map
  dossier authority. Screenshots were inspected; text density remains a GUI
  problem, especially short landscape and deployment.
- The user's two ship references are local read-only attachments under
  `modules/space_exploration/.codex-remote-attachments/01a0cc97-95ac-76a2-9841-5cba92b6a720/8082d61c-b1c5-4df0-97f1-9fe97285e846/`.
  Their intent is one visible hull with nested rooms, not independent boxes.
  The existing original project concept under
  `modules/space_exploration/assets/source/concepts/nexus-vii-v1/` agrees.
  Player-facing A/B/C tabs now read Forward/Upper/Lower; the room view keeps
  overlapping authored rear-hull/window pieces. The fresh packed
  `tmp/uga-room-visual-state-packed-2026-09-27T03-15-35.021Z/report.json`
  passes 320/412/915 streaming, ready, failure, overview, and section
  interaction on hardware GPU with stable freeze/parity. The diagnostic
  screenshots show the **remaining mismatch**: pale room materials, a large
  generic inspection-bay backdrop, a thin overview silhouette, and no bow
  cap at the Command room. This is the pre-hull baseline, superseded by the
  later local stage below; do not reuse the intact exterior shell, which
  would occlude rooms.
- The current source bundle, 507-file module manifest, and `pack-www` pass.
  The packed preview is local only. No version bump, OTA, Android, Cloudflare,
  Hugging Face, or public channel write was made.

## September 27 NEXUS-VII connected-cutaway local stage

- The user's side-cutaway and top-plan references remain read-only inputs.
  The editable main Blender cutaway is v6 with pending Strike Bay geometry,
  while the delivered room graph is v5. Re-exporting the main file would have
  promoted unrelated unreviewed content. Instead, a separate geometry-only
  overlay is authored by
  `modules/space_exploration/tools/blender/build_uga_hull_overlay.py`, with
  editable `.blend` source and a 145,076-byte runtime GLB (SHA-256
  `0373c9ba41ad983ca6a0c6958695247118bd6c3aafa364b547a3d38fb019a066`).
  It adds a profiled bow, missing Command rear shell, near-side hull
  silhouette and bay frames, plus lower-deck rear sections. All 11 delivered
  room/anchor IDs and the shared section delivery remain unchanged.
- Authored ship mode now hides the oversized grey inspection bay. Overview
  shows the outer cutaway; focus retains only local deck-sized hull context,
  not full-length slabs or foreground sills. The Overview button refits after
  its sheet collapses, says `SHIP OVERVIEW`, and no longer marks Command
  selected while all compartments are visible.
- `tmp/uga-room-visual-state-packed-2026-09-27T04-17-18.790Z/report.json`
  passes the real offline launch → orbit → Ship route at 320×700, 412×900 and
  915×412 for streaming, ready and injected-failure states: 76 source/www
  input hashes matched before/after, RTX 4060 D3D11, no page errors, no UI
  overflow, and room/area touch checks. Intentional request aborts in the
  failure case and blocked external update requests are not product 404s.
  Screenshots were inspected at all three sizes.
- `tmp/uga-authored-sections/shared-2026-09-27T04-19-49-611Z/report.json`
  passes 44 focused room/viewport cases (11 rooms at 1440×900, 412×900,
  320×700 and 900×412), including actual mesh taps, local hull visibility,
  no full-height rear panel in lower rooms, no generic inspection bay, zero
  browser errors, source/www parity and hardware WebGL.
- This is a local, reviewable stage, **not a complete GUI/art sign-off**.
  The full-length ship is still thin and pale in portrait overview, some
  authored small rooms still read as individual boxes, and room/inspector
  text density remains. Physical Safari/PWA, draw-call/frame-time budgets,
  full game-loop GUI acceptance and separate v6 Strike Bay promotion remain
  open. No version bump, release build, upload or channel activation was made.

## September 27 cross-surface mobile GUI checkpoint

- This is another local, reviewable stage in the same dirty Local checkout; no version, release, OTA, Android, Cloudflare, Hugging Face, or production mutation. `docs/GAME_GUI_OVERHAUL.md` has the whole-game coverage ledger and the exact new evidence.
- Classic short-landscape region selection now shows the selected map's reward and complete Clear Skies explanation above the dock, without hiding neighboring map choices. The final packed real route `tmp/classic-mobile-flow-2026-09-27T04-40-17.294Z-1358900/report.json` passes both phone orientations, all five stages and alternate-map dossier authority on RTX 4060 D3D11; the 915×412 image and y=298.4 weather-block measurement were inspected.
- Command Core's embedded objective shows its 44px action on the first fold at 320×700, 412×900 and 915×412, retaining the authored cutaway, full hub and detailed systems below. `tmp/uga-room-visual-state-packed-2026-09-27T04-47-23.592Z/report.json` passes the real orbit-to-Ship path, ready/streaming/failure, source/www parity and a new action-above-dock assertion; all three ready images were inspected.
- Mixed RTS platoons now report Mixed instead of a misleading first-unit stance and expose a truthful accessible cycle label. Bundle and focused source/probe checks pass; exact mixed-platoon packed interaction is still open.
- The HUD verifier's offline launch route was repaired to follow UGA → Classic → battle. Its packed six-state capture `.tmp/cinematic-hud/gui-stage-after-2026-09-27/report.json` reached a live match but **failed 13 of 234 checks**: tiny resource/feed typography, build/feed playfield occupancy, and two `/src/styles/assets/` texture 404s. This was the source-stable pre-fix baseline; the focused repair and passing follow-up are recorded below. Physical Safari/PWA remains unverified.

## September 27 phone-HUD and mixed-stance local follow-up

- The 221/234 capture above is the pre-fix baseline, **superseded for the focused 412×900 HUD stage** by `.tmp/cinematic-hud/gui-stage-final-source-2026-09-27/report.json`: 234/234 checks, six live Standard-battle states, RTX 4060 D3D11, zero runtime/page errors, HTTP failures and request failures, stable source/package/tool identity. Final Build, Production and Event Feed PNGs were inspected. HUD occupancy in Build/Production fell from 0.545 to 0.421; centre coverage from 0.571 to 0.238. Event Feed centre coverage fell from 0.518 to 0.167 and its panel clears the minimap. The source/package bundle and `pack-www` pass.
- `src/styles/ui.css` caps the 400–430px portrait Build/Production sheets at 310px while retaining their catalogue, queue and grade scroll areas, moves Event Feed to the lower-right with a minimap gutter, and restores readable resource/feed type tokens. `src/main.js` resolves its whitelisted loading-art CSS variables from `document.baseURI` after `mf2AssetURL`, preserving OTA data URIs; the former soil/Aelos `/src/styles/assets/` 404s were URL resolution, not missing files. No underlying art file was changed.
- `.tmp/hud-mixed-stance/final-2026-09-27/report.json` passes 13/13 with four inspected 412×900/915×412 screenshots, source/www parity, hardware GPU, no runtime or HTTP failures. The test enters a real offline Standard deployment, then creates live Striker/Thumper as a **disclosed fixture**; actual Army → Platoons → stance-button input selects them and applies Overdrive/Siege. `src/ui/hud.js` now shows a cycle symbol instead of `⁇` for Mixed, with the truthful accessible name retained. The new `tools/test-hud-mixed-stance-packed.mjs` preserves this regression check. It does not prove Tech-2 production/research progression.
- Local only: no version bump, release, OTA, Android, Cloudflare, Hugging Face or production write. Remaining GUI work: 320/360 widths and enlarged-text HUD matrix, real scroll-to-end actions for catalogue/queue/feed, full Classic/UGA match-return and reward loops, social/inventory/settings, ocean/gas variants, coherent art, and physical Safari/PWA/Android. Continue in reviewable stages; do not treat this focused HUD pass as the complete game GUI overhaul.

## Safety reminders

- Before every mutation: `node tools/evidence-foundation/workspace-guard.mjs check-write`.
- Never delete the freeze manually; use `clear-stale` only when its recorded PID
  is dead and the tool accepts it.
- After any source edit: `node tools/bundle.mjs`, rebuild the exploration manifest
  if module source changed, then `node tools/pack-www.mjs`.
- Never trust a clean console as visual acceptance; inspect screenshots.
- Never use SwiftShader for acceptance.
- Never create a dated source copy, shadow repo, routine branch, or worktree.
- GitHub `main` is now an owner-requested source target, but a source push is
  not a player release. Production still requires guarded Hugging Face and
  Cloudflare activation with a synchronized Android artifact and Safari PWA.
