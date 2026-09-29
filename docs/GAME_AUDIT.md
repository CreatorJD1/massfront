# MASSFRONT game audit — sixteen domains, current main

Prepared **2026-09-29**, revised same day after owner review, against `main` at
`a0c005a8` (tree 1.33.97). The first draft measured whether each system *works*;
the owner correctly rejected that framing: a screen that renders at 60 fps can
still bury the player. This revision keeps the engineering evidence but grades
every domain on the **player-experience question too** — clarity, density, and
whether the loop tells you where to go. Each domain carries both a **works**
verdict and an **experience** verdict.

**Method.** Source reads; `tools/extract-design-db.mjs` over real source
(106/113); static gates; packed `www` driven on hardware WebGL2 (RTX 4060
D3D11) with screenshots inspected; map/water/air/naval census extracted
directly from `MAPDEFS` and the region tables in `src/engine/gl.js`. The
unmerged Stormpeak nuke chain is noted, not reviewed.

---

## 1. Verdict table

| # | Domain | Works | Experience |
|---|---|---|---|
| 1 | GUI | SOLID | **CLUTTERED** — fronts carry 700–2,100 words; hub has ~19 tap targets |
| 2 | Code | SOLID | neutral — two stale harnesses found, fixed in `a0c005a8` |
| 3 | Art | SOLID | SOLID — hero art parity, portrait sets wired |
| 4 | Animation | PARTIAL | PARTIAL — units static at zoom-out |
| 5 | Graphics | SOLID | SOLID — post chain disciplined |
| 6 | Gameplay | SOLID | PARTIAL — rules fine, direction unclear |
| 7 | Research & crafting | SOLID/PARTIAL | PARTIAL — deep tree, thin crafting, low discoverability |
| 8 | Exploration | SOLID | **CLUTTERED** — 517-word hub, mixed vocabulary |
| 9 | RTS loop | SOLID | **CONFUSING** — 6+ commit taps to battle; vocab differs per layer |
| 10 | Multiplayer | PARTIAL | PARTIAL — honest gates, no opponents |
| 11 | Physics | SOLID | SOLID |
| 12 | Blood & gore (infantry) | PARTIAL | restrained by design |
| 13 | Interior/air/water/land systems | PARTIAL | **LAND-WEIGHTED** — see §4 map census |
| 14 | Customization / ship loop | SOLID | PARTIAL — deep but opaque; XCOM bones, weak onboarding |
| 15 | Ship cutout / section mgmt | PARTIAL | PARTIAL — cutaway is presentation only |
| 16 | Mobile & desktop GUI | SOLID | PARTIAL — one real regression; density hurts mobile most |

Severity totals: **0 critical · 4 high · 5 medium · 3 low.**

---

## 2. The owner's four design criticisms — evidence and verdicts

### 2.1 "A lot of cluttered GUI" — CONFIRMED

Measured from the real templates:

- **Front screen (War Room door): ~2,134 words** in the `startScreen` markup
  behind 3 buttons. The 2026-09-27 work cut a changelog wall to a one-sentence
  brief on the *packed front*, but the source screen still carries a large copy
  mass around the hero.
- **UGA Galactic Command hub: ~517–583 words** in the hub template alone,
  across objective + front-status + quick-access + basic-access panels, plus a
  5-step ladder, counters, and a brief expander.
- **Tap targets on the hub: ~19 buttons** (objective 2, front 2, quick 7, access
  2, depart 1, five-tab bottom nav) plus 5 ladder chips. A new player cannot
  tell which of the nineteen is *the* next action; the objective panel tries to
  say it, but it is one more plate among many.
- Small-print (`<small>` eyebrow rows) is the house style: 3 label rows per
  panel is typical, so every panel reads as five lines before it says anything.

Verdict: the chrome is high quality; the **information architecture** is not.
The fix class is subtraction and hierarchy (one primary CTA per screen, panels
folded by default, copy halved), not new styling.

### 2.2 "Too much text" — CONFIRMED

Hub ~517 words; front ~2,134; the deploy/region stages additionally carry
explanatory rows per selection (the same copy family that produced the
landscape dock-overlap regression). Explanations live on the screens instead of
behind them. Nothing is wrong with any single sentence; the sum is a reading
test before every battle.

### 2.3 "Unclear game-loop direction" — CONFIRMED

- There are **two parallel products** (Classic War Table conquest; UGA
  expedition with ship loop) and the front screen does not say which one a new
  player should care about. The War Room advertises Campaign; the UGA hub is
  the actual campaign spine; neither points at the other as "start here."
- The UGA loop's own direction is real (`commandObjectivePanel` names the next
  step — e.g. "Prepare Heliograph Wake", ladder 01 World Link → 05 Ground) but
  it competes with seven quick-access buttons and a duty-watch panel that
  *advances time and raises front pressure* — a mechanic the UI names but never
  explains, on the same screen as the main objective.
- Domain vocabulary is triple-tracked: catalog says **mission** (75 hits),
  ground_operation says **operation** (92), contracts panel says **contract**
  (12). Region/system/planet are Classic words; system/expedition-cycle/front
  are UGA words. Same player, two languages, no glossary on screen.

### 2.4 "Confusing RTS elements outside the Classic War Table" — CONFIRMED

Outside Classic Standard, RTS-shaped concepts appear with different rules and
names: expedition cycles (time advances by *watch*, not by match), front
pressure (a strategic clock that rises while you do other things), core rescue,
duty watch, data veins, op modifiers (10), boosters (4), wildcards (13). Each
is individually tested (war-table-systems, frontier-ladder, duty-watch suites
all pass) but their **screen-level grammar** differs from the Classic loop the
player learned first. The confusion is structural, not a bug.

---

## 3. Per-domain findings (works / experience)

### 1. GUI — works: SOLID · experience: CLUTTERED
`verify-menu-chrome` PASS, zero page errors; both entry doors give legible
launch/failure states; UGA tap feedback is same-tick (aria-busy, is-launching,
toast). The measured ~300 ms synchronous dispatch is the mandatory
gesture-synced audio unlock and is documented in the verifier. Experience:
see §2.1.

### 2. Code — works: SOLID
Scope gate 114 scripts / 3,527 names / 0 collisions; bundle parses (27.69 MB).
Two stale harnesses fixed in `a0c005a8` (room-upgrades catalog lift; boot
verifier's `.load-meter` selector, measured 500 ms/100 ms bounds, HF-origin
allowlist, `resumeTrainingMission` bridge). One test-only TypeError remains
(`test-uga-next-action-packed-ui`, after a visually-correct Galactic Command
screen).

### 3. Art — works: SOLID · experience: SOLID
Brand art SHA-verified across boot/menu/module with pixel-parity (MAE < 3);
LFS integrity proven in the September push; commander speaking portraits are
primary stage art.

### 4. Animation — works: PARTIAL
Portraits and effect animation (shockwave, volfx, organic splashes, clouds) are
real; units at tactical zoom are icon-driven and feel static. Presentation
choice, but player-visible.

### 5. Graphics — works: SOLID
Post chain stays on units 4/5/6; state save/restore discipline holds; GL
recovery loader archetype contract verified; weapon-fire PASS_CAPTURE.

### 6. Gameplay — works: SOLID · experience: PARTIAL
36 units, 29 buildings, 17 upgrades, 4 factions, 9 weapon classes, 22-node
research tree, 56 legacy + 48 region maps. Match rules verified (level-up
cannot deadlock, sim halt sticky, restart contract). Experience: rules are fine
— the confusion is *where to go next*, which §2.3 covers.

### 7. Research & crafting — works: SOLID/PARTIAL · experience: PARTIAL
Research: 22 nodes, faction gates tested, rendered as a real 3D tree.
Crafting: `develop.js` owns materials/modules/wear; the ship nav exposes
Build/Research/Craft/Upgrade/Inventory, but there is no gather→recipe→fabricate
loop. Discoverability is the bigger issue: the tree lives behind a shelf fold.

### 8. Exploration — works: SOLID · experience: CLUTTERED
UGA loop verified to Galactic Command on hardware; 19 suites pass; domain
naming fixed. Experience: §2.1/§2.3.

### 9. RTS loop — works: SOLID · experience: CONFUSING
Classic flow verified on hardware. **Regression:** `verify-classic-mobile-flow`
fails — landscape/region weather explanation hidden behind the action dock
(high). Flow cost: War Room → ENTER system → OPEN REGION → CONFIGURE FORCE →
START BATTLE → DEPLOY is six commit taps before the match clock starts, each
with its own explanatory copy. That is a design decision to revisit, not a bug
to patch.

### 10. Multiplayer — works: PARTIAL
Deterministic lockstep, reconnect/replay, seat visibility, canonical network
setup all pass; Cloudflare worker tested; honest SERVICE IN DEVELOPMENT gates.
No live opponents exist today.

### 11. Physics — works: SOLID
Deterministic combat; cosmetic rigid bodies with pressure budgets; hazards (11
kinds across maps); Stormpeak Gerstner/buoyancy/nuke curves lab-proven this
session (61 fps on integrated graphics, collapse fix pushed to `stormpeak/ocean`).

### 12. Blood & gore for infantry — works: PARTIAL (deliberate)
One ichor splash + optional wet stain per hit, one vapour lobe per death,
three-layer ceiling; greyscale death fade; no dismemberment/pools/corpses. A
rating-driven design position; expanding it is an addition.

### 13. Interior / air / water / land systems — works: PARTIAL · experience: LAND-WEIGHTED
All four exist but are not equal citizens — see §4.

### 14. Player customization, commanders & specialists, UGA ship loop — works: SOLID · experience: PARTIAL
The XCOM-2-like spine is real and test-proven: 50 facilities, 33 modules all
effectful, commander XP scaling with fit (45% cap), injury bands with
faction-aware medic perks, facility capabilities feeding every reward channel.
Experience: the depth is invisible until you dig; nothing on the hub teaches
that the ship is the meta-game.

### 15. Ship layout cutout / section management — works: PARTIAL
`nexus-vii-cutaway-hull-overlay.glb` + Blender build script ship; rooms carry
real state and effects. No per-section damage board on the cutaway yet.

### 16. Mobile & desktop GUI friendliness — works: SOLID · experience: PARTIAL
Safe-area insets throughout; ≥44 px targets asserted; 412×900 @ DPR3 verified;
landscape dock regression is the one mobile defect. Density (§2.2) hurts
mobile more than desktop — small-print rows multiply on narrow screens.

---

## 4. Map-type census — the owner's "only land" point, measured

The battle catalogue is the region tables in `src/engine/gl.js`:

- **48 authored region maps** (16 regions × small/medium/large across four
  homeworlds), plus 56 legacy standalone map defs in the design DB.
- **Water is authored, not missing:** an explicit `wet` table gives **12 of 48
  region maps real water** — 8 `ocean` (all three Aelos Harbor Command maps,
  all three Nordhall Frostwake Isles maps, Nordhall cliff/peaks mediums) and 4
  `river` (Aelos north/basin/ridge, Nordhall frost). `navalEnabled=true` flows
  from that table, seabed+bridge render flags are forced on, and hBias is
  clamped so coasts read.
- **Naval exists to fight on it:** Harbor (4 factions, "must be sited on the
  shore"), Sea Bastion (water placement), Corvette/Dreadnought (naval:1 in
  TYPES), AI builds harbors by difficulty ([1,2,3] at time thresholds) and
  repositions naval production. Naval rally/probe tooling exists
  (`probe-naval-rally`, `capture-water-shore`) but **`probe-naval-rally`
  currently throws** (`Cannot read properties of null` on a flow-field entry) —
  a stale probe against the current coast, same class as the harness rot above;
  it needs a look before naval can claim end-to-end verification.
- **Two homeworlds are deliberately dry:** Dominion (Pyraeth) dusk pads and
  Brood (Vespera) magma — the code comment says so explicitly. So even the
  water that exists is faction-clustered: Nova coast + Syndicate ice.
- **Interior battles: authored, not runtime.** `interiortopology-stage10.js`
  carries four source-authored interior navigation graphs, portal profiles,
  unit envelopes — `status:'AUTHORING_ONLY'`, `runtimeReady:false`,
  `modelPackBinding:false`. No interior RTS map is playable today.
- **Orbital/air-surface battles: candidates.** `orbitaltopology-stage10.js`:
  6 AUTHORING_CANDIDATE, 1 AUTHORING_ONLY, 1 REJECTED. The Stage-10 theatre
  catalog itself is `AUTHORING_ONLY`, `runtimeReady:false`.
- **Air is a layer, not a theatre:** aircraft (Raptor etc., `air:1`,
  `airwarfare.js` bands/missions) fight *over land/water maps*; there is no
  air-only map. The naval-submarine feature branch (`feature/faction-submarines`,
  2 commits) is **not merged** into main.

**Map verdict:** the catalogue is land-weighted by design — 75% of region maps
are land-only, water maps cluster on two of four homeworlds, and
interior/orbital/naval-submarine play is authored data awaiting runtime
approval. If the owner wants map-type variety (water-heavy, air-surface,
interior, orbital), the honest state is: naval is real and playable on 12 maps
pending the probe fix; everything else is authored-but-dormant.

---

## 5. Recommended next fixes (player impact order)

1. **Subtraction pass on the three hottest screens** (High, design) — front
   screen, Galactic Command hub, deploy/region: one primary CTA each, panels
   folded by default, copy halved. The screens to beat: 2,134 / ~583 / dense
   region rows.
2. **Landscape region dock overlap** (High, bug) — re-land the 2026-09-27
   galaxy separation until `verify-classic-mobile-flow` is green.
3. **Say the loop out loud** (High, design) — one persistent "what am I doing
   and why" line that survives across Classic and UGA (the objective panel
   exists; give it the same authority on the front and in Classic setup).
4. **Unify the vocabulary** (Medium) — pick mission vs operation vs contract
   per context and rename on-screen (domain layer can keep its internal names).
5. **Fix `probe-naval-rally`** (Medium) — stale flow-field access; needed
   before naval play can claim verification.
6. **Decide the dormant theatres** (Medium) — interior/orbital data is authored
   and gated by `runtimeReady:false`; either schedule activation or say in
   copy that they're future.
7. **Unit ambience at zoom** (Low) — small idle motion or icon shimmer.
8. **Cutaway damage board** (Low) — per-section visualization on the hull.

## Appendix — checks run (2026-09-29, revision 2)

| Check | Result |
|---|---|
| `verify-global-scope.mjs` / bundle / pack-www | PASS / PASS (27.69 MB) / PASS |
| `verify-menu-chrome`, `verify-launch-affordance` | PASS, PASS |
| `verify-boot-screen-unified.mjs` | PASS 8/8 (after `a0c005a8` verifier repairs) |
| `verify-weapon-fire-packed` | PASS_CAPTURE |
| `verify-classic-mobile-flow` | **FAIL** — landscape dock overlap |
| Prior-audit suite set + repaired room-upgrades gate | PASS |
| space_exploration suites (19) | PASS |
| Domain spot suites | 6 PASS, 1 harness TypeError |
| Map census (gl.js MAPDEFS + regions + wet table) | 48 region maps; 12 wet (8 ocean, 4 river); 56 legacy; interior/orbital AUTHORING_ONLY/CANDIDATE, runtimeReady:false |
| Version fields (4 channels) | all 1.33.97 |
