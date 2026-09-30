# MASSFRONT game audit — sixteen domains, current main

Prepared **2026-09-29**, revised twice same day after owner review, against
`main` at `c9b6e0c9` (tree 1.33.97). The first draft measured whether each
system *works*; the owner correctly rejected that framing: a screen that
renders at 60 fps can still bury the player. This revision keeps the
engineering evidence but grades every domain on the **player-experience
question too** — clarity, density, and whether the loop tells you where to go.
Each domain carries both a **works** verdict and an **experience** verdict.

**Revision 2 corrections (owner).** (a) The Stormpeak **Ocean Tester is merged
and in the build** — it is not a branch fixture: `src/stormpeak-tester.js` is
registered in both manifests, carries real RTS matches (commander,
constructors, corvettes, destroyers, **submarines**, harbors; victory/defeat
phases in the ocean sim) and is gated behind a Settings dev toggle that
explicitly does not score career/XP. (b) The four "homeworlds" are **starting
planets**, not the extent of the world: the authored star chart holds nine
systems and 66 named bodies. (c) What is genuinely missing is a **dedication
unlock loop toward more planets** — the ladder exists and is enforced, but it
is short and mostly invisible.

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
| 8 | Exploration | SOLID | PARTIAL — ladder works but is invisible; no dedication loop |
| 9 | RTS loop | SOLID | **CONFUSING** — 6+ commit taps to battle; vocab differs per layer |
| 10 | Multiplayer | PARTIAL | PARTIAL — honest gates, no opponents |
| 11 | Physics | SOLID | SOLID |
| 12 | Blood & gore (infantry) | PARTIAL | restrained by design |
| 13 | Interior/air/water/land systems | PARTIAL | **LAND-WEIGHTED** — Ocean Tester merged but dev-parked; see §4 |
| 14 | Customization / ship loop | SOLID | PARTIAL — deep but opaque; XCOM bones, weak onboarding |
| 15 | Ship cutout / section mgmt | PARTIAL | PARTIAL — cutaway is presentation only |
| 16 | Mobile & desktop GUI | SOLID | PARTIAL — one real regression; density hurts mobile most |

Severity totals: **0 critical · 5 high · 5 medium · 3 low.**

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

**Runtime correction (2026-09-30 subtraction pass).** A Playwright probe on
packed `www` measured what players actually see; change list in
[GUI_SUBTRACTION_SCOPE.md](GUI_SUBTRACTION_SCOPE.md). Findings: the ~2,134-word
`#startScreen` never displays — the UGA takeover routes players to the hub;
the hub resolves to 270 visible words and 20 real taps, of which ONE panel
(the 190-word dedication ladder) is 43%; the deploy stage's "87 taps" below
was a measurement artifact (a closed drawer's invisible boxes) — the real
count is 15 and its fold works as designed; the War Room is already clean
(70 words, 4 taps). Real subtraction targets: fold the ladder, halve the
region site dossiers, shorten one War Primer card.

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

### 8. Exploration — works: SOLID · experience: PARTIAL
UGA loop verified to Galactic Command on hardware; 19 suites pass; domain
naming fixed. **The world beyond the starting planets exists and is
ladder-gated:** `UGA_PLANET_LADDER` chains Caldris → Ithara → Zephyros (Aelos),
Orison → Nacre (Veyra), Meridian K-4 → Tethys Foundry (Karak), plus the four
War-Table homeworld bodies; `isPlanetUnlocked` opens body N once body N-1's
primary authored survey is depleted, and ground areas chain the same way
(per-planet area ladders). Nine systems / 66 named bodies are on the authored
star chart with contact events (derelicts, convoys, salvage).

**What is missing is the dedication loop the owner describes:** the chains are
short (2–3 bodies per system), the gating is survey-completion rather than a
repeated-investment "dedication" mechanic, and — decisively — the locked rungs
are barely rendered: `uga_command.js` imports the unlock predicates but shows
no locked-planet ladder board, so a player cannot see what dedication would
earn. The progression spine works; its promise is not on screen.

Experience: §2.1/§2.3 for density; the ladder invisibility is the domain's own
high-severity experience gap.

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
All four exist but are not equal citizens — see §4. Correction from revision 2:
**water play ships** via the merged Ocean Tester (buoyancy, hydrophone,
submarines with per-faction doctrine: Nova hunter-killer fires dived, Legion
Leviathan must surface, Syndicate Blackwake is fast/quiet, Brood Abyssal
regenerates dived) — but it is parked behind a dev toggle that scores nothing,
so players experience the game as land-only. Interior/orbital remain dormant
authoring data.

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

## 4. Map-type census — measured, with the owner's corrections applied

The battle catalogue is the region tables in `src/engine/gl.js`, **plus the
merged Ocean Tester as the water theatre**:

- **48 authored region maps** (16 regions × small/medium/large across the four
  starting homeworlds), plus 56 legacy standalone map defs in the design DB.
- **Water on the War Table:** an explicit `wet` table gives **12 of 48 region
  maps real water** — 8 `ocean`, 4 `river` — with `navalEnabled` flowing from
  it, seabed+bridge rendering forced, and coast clamping. Harbor (shore-sited),
  Sea Bastion, Corvette/Dreadnought (`naval:1`) and AI naval production are
  real; `probe-naval-rally` currently throws on a stale flow-field access and
  needs repair before naval claims end-to-end verification.
- **Water as a theatre: the Ocean Tester ships.** `modules/stormpeak_ocean/` is
  merged on main, registered in both manifests, opened from Settings
  ("Ocean Theatre Tester" dev toggle) or the War Room DEV MODULES card, and
  returned from via its HUD. Its sim is a real RTS match: commander,
  constructors, corvettes, destroyers, **submarines** (four faction doctrines:
  Nova Hunter-Killer fires dived with hull sonar; Legion Leviathan is thicker
  and must surface to fire; Syndicate Blackwake is fastest/quietest; Brood
  Abyssal knits hull while dived), harbor/extractor/reactor/silo buildings,
  victory and defeat phases. Deliberately excluded: career, XP, saves — the
  host contract says so on the toggle and the card footer.
- **Two War-Table homeworlds are deliberately dry:** Dominion (Pyraeth) dusk
  pads and Brood (Vespera) magma — the code comment says so explicitly. Water
  maps therefore cluster on Nova coast + Syndicate ice.
- **Interior battles: authored, not runtime.** `interiortopology-stage10.js`
  carries four source-authored interior navigation graphs, portal profiles and
  unit envelopes — `status:'AUTHORING_ONLY'`, `runtimeReady:false`.
- **Orbital/air-surface: candidates.** `orbitaltopology-stage10.js`: 6
  AUTHORING_CANDIDATE, 1 AUTHORING_ONLY, 1 REJECTED. The Stage-10 theatre
  catalog itself is `AUTHORING_ONLY`, `runtimeReady:false`.
- **Air is a layer, not a theatre:** aircraft fight over land/water maps; the
  naval-submarine feature branch (`feature/faction-submarines`) is superseded —
  its doctrine lives in the merged ocean module now.

**Map verdict:** land-weighted on the War Table (75% land-only region maps,
water clustered on two homeworlds), with real water RTS shipped but parked
behind a dev toggle. Interior/orbital are authored-but-dormant. The owner's
frame is the right one: the map-type variety gap is not "no water exists" —
it is that water play is not yet a scored, discoverable part of the career.

---

## 5. Recommended next fixes (player impact order)

1. **Subtraction pass on the three hottest screens** (High, design) —
   MEASURED 2026-09-30, scope and change list in
   [GUI_SUBTRACTION_SCOPE.md](GUI_SUBTRACTION_SCOPE.md); the real targets
   after runtime correction are the 190-word hub ladder panel (fold), the
   region stage's three ~50-word site dossiers (halve), and one War Primer
   card (shorten). Front screen and deploy need nothing — the former never
   displays, the latter already folds to 15 taps.
2. **Landscape region dock overlap** (High, bug) — re-land the 2026-09-27
   galaxy separation until `verify-classic-mobile-flow` is green.
3. **Say the loop out loud** (High, design) — one persistent "what am I doing
   and why" line that survives across Classic and UGA (the objective panel
   exists; give it the same authority on the front and in Classic setup).
4. **Surface the dedication ladder** (High, design) — render the planet/area
chains (locked rungs, what unlocks them, survey progress) on the Galactic
Command hub; the predicates and catalogs already exist, only the board is
missing. Pair with the owner's direction: homeworlds are starting planets —
the visible promise should be "more worlds open as you dedicate."
5. **Promote the Ocean Tester from dev toggle to scored theatre** (High,
design) — the water RTS is merged and complete (subs, doctrines, victory);
what keeps the game feeling land-only is that it scores nothing and hides in
Settings. Decide the career contract (XP? rewards? ladder rung?) and surface
it in the mode list.
6. **Unify the vocabulary** (Medium) — pick mission vs operation vs contract
per context and rename on-screen (domain layer can keep its internal names).
7. **Fix `probe-naval-rally`** (Medium) — stale flow-field access; needed
before War-Table naval play can claim verification.
8. **Decide the dormant theatres** (Medium) — interior/orbital data is authored
and gated by `runtimeReady:false`; either schedule activation or say in
the star chart copy that they're future.
9. **Unit ambience at zoom** (Low) — small idle motion or icon shimmer.
10. **Cutaway damage board** (Low) — per-section visualization on the hull.

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
