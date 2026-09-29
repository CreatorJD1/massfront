# MASSFRONT game audit — sixteen domains, current main

Prepared **2026-09-29** against `main` at `8b44e06` (tree version **1.33.97**, all
four version fields agreeing). This is a source-and-content audit across sixteen
domains the owner listed, each given a verdict of **SOLID** (works, verified),
**PARTIAL** (exists with real gaps), or **ABSENT** (not in the build). It does
not override `CODEX_HANDOFF.md` for release mechanics, and it does not review
the eleven unmerged Stormpeak nuke branches beyond noting their existence.

**Method.** Source reads across `src/`, `modules/space_exploration/`,
`modules/stormpeak_ocean/` and `cloudflare/`; `tools/extract-design-db.mjs`
evaluated the real source (106/113 sources) into `design/design.json`; static
gates re-run; packed `www` served and driven on hardware WebGL2 (RTX 4060
D3D11) with the repo's Playwright lane. Claims not exercised in-client are
marked. Screenshots cited were opened and **inspected by a human standard**,
not trusted from exit codes.

**Companion.** The 2026-09-13 audit (`cursor/game-audit-3f35`) never landed on
`main`; this document supersedes it as the current player-facing audit.

---

## 1. Verdict table

| # | Domain | Verdict | One-line |
|---|---|---|---|
| 1 | GUI | **SOLID** | Menu chrome, veil system and tap feedback verified in-client |
| 2 | Code | **SOLID** (1 gate repaired) | Scope gate clean; two stale test harnesses found and fixed |
| 3 | Art | **SOLID** | LFS pointers verified; hero art parity across surfaces |
| 4 | Animation | **PARTIAL** | Portraits + FX strong; unit ambience sparse |
| 5 | Graphics | **SOLID** | Post chain disciplined; hardware-GPU renders verified |
| 6 | Gameplay | **SOLID** | Match rules complete; restart contract passes |
| 7 | Research & crafting | **PARTIAL** | 22-node tree deep; crafting is inventory-adjacent |
| 8 | Exploration | **SOLID** | UGA loop verified in-client to Galactic Command |
| 9 | RTS loop | **SOLID** | Classic flow verified; one landscape regression found |
| 10 | Multiplayer | **PARTIAL** | Plumbing solid; no live opponents today |
| 11 | Physics | **SOLID** | Sim, hazards, buoyancy; nuke curves lab-proven |
| 12 | Blood & gore (infantry) | **PARTIAL** | Stains/vapour yes; gore is deliberately restrained |
| 13 | Interior/air/water/land systems | **SOLID** | All four theatres exist and are wired |
| 14 | Customization / ship loop | **SOLID** | XCOM-2-like ship management is real and gated by tests |
| 15 | Ship cutout / section mgmt | **PARTIAL** | Cutaway asset ships; per-section damage is roadmap |
| 16 | Mobile & desktop GUI | **SOLID** (1 regression) | Safe areas + touch targets verified; landscape dock bug |

Severity totals in this inventory: **0 critical · 3 high · 4 medium · 3 low.**

---

## 2. Domain findings

### 1. GUI — SOLID

`tools/verify-menu-chrome.mjs` PASS (zero page errors). `verify-launch-affordance.mjs`
PASS: both entry doors (MASSFRONT veil, Ocean Tester veil) show a launch state and a
failed launch says why, legibly. The UGA tap gives immediate visible feedback
(`aria-busy`, `is-launching`, toast in the same tick — verified; the full synchronous
dispatch measures ~300 ms because it includes the first-gesture AudioContext unlock
that iOS requires inside the gesture, documented in the verifier now).

### 2. Code — SOLID (one gate repaired)

`verify-global-scope.mjs`: 114 scripts, 3,527 top-level names, **zero collisions**.
Bundle parses (27.69 MB). Two stale harnesses were found and **fixed in this pass**:

- `tools/test-room-upgrades-have-effects.mjs` — the lift-eval harness lacked the
  faction-aware medic perk additions (`personFactionId` + catalogs). Fixed by handing
  the real catalogs into the eval scope. PASS (33 modules effectful, XP caps at 45%).
- `tools/verify-boot-screen-unified.mjs` — carried four September-rebuild defects of
  its own: a `.load-progress` selector for an element that has always been
  `.load-meter`; two 50 ms wall-clock bounds measured at ~300 ms and ~67 ms (the first
  is the mandatory gesture-synced audio unlock); a blanket "no external requests"
  contract that the product's own HF-pack/update delivery violates; and a wait on a
  `startTrainingMission` global that tutorial.js deliberately keeps inside its IIFE
  (the public bridge is `resumeTrainingMission`). All corrected with the why recorded.
  Full suite now PASS end-to-end, including both failure-injection subtests.

### 3. Art — SOLID

Brand hero art SHA-verified on boot, menu and module surfaces (the verifier asserts
pixel-parity of the boot derivative against canonical menu title art, MAE < 3).
LFS pointer integrity confirmed during the September push (65 objects, 36 MB).
Commander portrait sets (12-frame speaking webps + user-authored design references)
are wired as the primary stage art. Unverified in-client: texture quality on a
low-tier GPU.

### 4. Animation — PARTIAL

Commander speaking portraits (4×3 atlas, per-frame mouth/eye sheets) drive the
commander stage; effect animation (shockwaves, volfx raymarch, organic splashes,
clouds) is authored and bounded. What is thin: unit idle/ambience animation at
tactical zoom is largely icon-driven (`tacticons.js` decides mesh→icon crossover),
so armies feel static when zoomed out. Not a defect — a presentation choice — but
the gap is player-visible.

### 5. Graphics — SOLID

Renderer discipline holds: the post-processing chain stays on texture units 4/5/6;
custom passes save/restore BLEND/CULL_FACE/DEPTH_TEST/DEPTH_WRITEMASK and return
via `begin3D(S_nA)` (re-verified by reading `gl.js`/`restree3d.js` integration
points). Weapon-fire visibility PASS_CAPTURE on hardware. Boot→UGA visual chain
PASS with zero image errors and exact brand dimensions (1200×673). GL-recovery
loader (`mfNormalRecovery`) verified with correct archetype contract.

### 6. Gameplay — SOLID

36 units, 29 buildings, 17 building upgrades, 4 factions, 9 weapon classes, 56 maps
(extracted from real source into `design/design.json`). Level-up cannot deadlock;
sim failure reports three ways and halts once; dropship deploys once; restart
contract (`test-defeat-restart-contract`) passes. The prior audit's criticals stay
fixed.

### 7. Research & crafting — PARTIAL

Research: a 22-node tree with faction gates (`test-faction-tech` PASS), rendered as
a real 3D tree (`restree3d.js` takeover), queue vocabulary reused by the commander
clearance track (unmerged wf branch). Crafting: `develop.js` owns "persistent
research, crafting materials, modules, wear and unlock ownership" and the ship
bottom nav exposes **Build / Research / Craft / Upgrade / Inventory** (verified
onscreen), but crafting depth is inventory-adjacent — there is no independent
gathering→recipe→fabrication loop. Verdict: research SOLID, crafting thin.

### 8. Exploration — SOLID

UGA loop verified in-client to the Galactic Command hub: mission card ("Prepare
Heliograph Wake"), five-step ladder (World Link → Orientation → Commission → Survey
→ Ground), Regions Held / Maps Cleared counters, Depart/Galaxy actions, and the
five-shelf bottom nav. 19 test suites pass (recovery cycle, wreck boarding, war
table systems, planetary survey aim, jump gates, frontier ladder, …). `domain.test.mjs`
now passes — the 2026-09-13 naming mismatch is gone.

### 9. RTS loop — SOLID (one regression)

Classic Standard flow verified: galaxy → system → planet → deploy on hardware GPU,
with the full tap sequence. **Regression found:** `verify-classic-mobile-flow.mjs`
fails deterministically — *"landscape/region: weather explanation is hidden behind
the action dock"*. The 2026-09-27 handoff recorded this exact repair as done; it is
broken again (or was never fully landed). **High** priority: it hides the Clear
Skies/conditions explanation under the dock in short-landscape.

### 10. Multiplayer — PARTIAL

The plumbing is genuinely built and tested: deterministic lockstep (`determinism.js`,
`statehash.js`), match consumer with reconnect/replay (`test-match-client-reconnect-replay`),
seat visibility (`test-multiplayer-seat-visibility` PASS), network canonical setup
(PASS), Cloudflare auth worker with match-replay tests, multiplayer boot local
verifier, and honest "SERVICE IN DEVELOPMENT" gating on MMO/Co-op theatres (the
dishonest XP-promising cards from the prior audit are gone). What does not exist
today is a populated online opponent pool — online play is infrastructure without a
crowd. Verdict: architecture SOLID, product PARTIAL.

### 11. Physics — SOLID

`sim.js` carries the deterministic combat model; `physics.js` owns cosmetic
destruction rigid bodies with pressure budgets; `hazards.js` the map hazards (4
profiled). The Stormpeak module adds Gerstner waves, buoyancy, ocean life and the
100 kt nuke with suction/mach/tsunami curves — the standalone lab's water burst was
fixed this session (collapse + Wilson disc) and verified at 61 fps on integrated
graphics. Lab curves and theatre damage are being unified on the unmerged branches.

### 12. Blood & gore for infantry — PARTIAL (deliberate)

Brood organic FX (`organicfx.js`) does one animated ichor splash per hit plus one
optional wet stain, one vapour lobe per death, hard three-layer ceiling — authored
restraint, not absence. Unit death is greyscale-fade (air death-grey captures
exist). There are no dismemberment, corpses that persist, or blood pools. For a
T-rated SupCom-style RTS this is a design position; if the owner wants more, it is
an addition, not a repair.

### 13. Interior, air, water, land systems — SOLID

Interior: UGA ship rooms with facility effects (50 facilities, every effect key
consumed — proven by the repaired gate). Air: `airwarfare.js` + airlift system with
faction variants. Water: War Table ocean (`sea.js`) plus the vendored Stormpeak
theatre. Land: 56 authored maps across four homeworlds with hazard profiles,
battlefield/interior/orbital topology datasets. All four are wired into the mode
catalog, not decorative.

### 14. Player customization, commanders & specialists, UGA ship loop — SOLID

This is the XCOM-2-like spine and it is real: commander selection with speaking
portraits and faction identity; specialist roster with injury bands, recovery
cycles and faction-aware medic perks (the repaired gate exercises the actual math);
room modules that all do something (33 modules asserted effectful); commander XP
that scales with ship fit and caps at 45%; facility capabilities feeding rewards,
research, injury severity and recovery. The ship is a management game, not a
cutscene.

### 15. Ship layout cutout / section management — PARTIAL

The cutaway hull overlay ships as a real asset (`nexus-vii-cutaway-hull-overlay.glb`
+ Blender build script) and the interior is room-based with per-room state. What
does not exist yet is per-section **damage/localization on the hull cutout itself**
during operations — sections affect the game, but the cutaway is presentation, not a
damage board. Roadmap item, honestly labelled.

### 16. Mobile & desktop GUI friendliness — SOLID (one regression)

Safe-area insets used across `index.html` (4) and `ui.css` (14); short-landscape
grid reflows; boot/veil/loaders all respect the 412×900 reference and were
screenshot-verified at DPR 3; bottom nav targets ≥44 px asserted by the boot
verifier; the Campaign Hub departure action is asserted inside the viewport.
**The regression is #9's landscape dock overlap** — the one mobile-specific defect
this pass found. APK size discipline unchanged (shrink script mandatory step).

---

## 3. Recommended next fixes (player impact order)

1. **Landscape region dock overlap** (High) — re-apply/re-verify the 2026-09-27
   galaxy weather-row separation in `src/galaxyui.js`; the verifier already
   checks sibling collisions, so land it with the check green.
2. **`test-uga-next-action-packed-ui` harness TypeError** (High, test-only) —
   fails after the Galactic Command screenshot with `The "string" argument must be
   of type string`; the game screen itself is correct. Same class of stale harness
   as the two fixed today.
3. **Unmerged Stormpeak chain review** (High) — eleven branches ending in
   `feat/stormpeak-nuke-craters-sim` (+594 sim lines, craters buildable-on, marks
   on live surfaces). Verify visually on GPU before any merge.
4. Craft loop depth (Medium) — decide whether crafting stays inventory-adjacent
   or becomes a loop; either way, say so in the War Room copy.
5. Unit ambience at tactical zoom (Medium) — small idle motion or icon shimmer to
   make zoomed-out armies feel alive.
6. Cutaway damage board (Low) — per-section visualization when operations injure
   the ship.

## Appendix — checks run (2026-09-29)

| Check | Result |
|---|---|
| `verify-global-scope.mjs` | PASS — 114 scripts, 3,527 names, 0 collisions |
| `tools/bundle.mjs` | PASS — 27.69 MB |
| `tools/pack-www.mjs` | PASS — staged, filter report sane |
| `verify-menu-chrome.mjs` | PASS — 0 page errors |
| `verify-launch-affordance.mjs` | PASS — both doors + legible failure |
| `verify-boot-screen-unified.mjs` | PASS (after verifier repairs) — 8 subtests |
| `verify-weapon-fire-packed.mjs` | PASS_CAPTURE |
| `verify-classic-mobile-flow.mjs` | **FAIL** — landscape/region dock overlap |
| Prior-audit suite set (11 suites) | PASS incl. repaired room-upgrades gate |
| `space_exploration` suites (19 files) | PASS |
| Domain spot suites (multiplayer/network/sonar/inventory/faction-tech/campaign) | 6 PASS, 1 harness TypeError |
| `extract-design-db.mjs` | 106/113 sources → design.json |
| Version fields (update.json, sw.js, webmanifest, package.json) | all 1.33.97 |
