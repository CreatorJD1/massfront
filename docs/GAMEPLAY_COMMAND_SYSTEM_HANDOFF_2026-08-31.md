# MASSFRONT gameplay command system handoff

Date: 2026-08-31  
Status: implementation contract; owner supplied explicit standing authorization
for this plan's verified numbered sections on 2026-08-31  
Owner: Jason

## Authority and scope

This is a subordinate engineering handoff. It expands the work already queued
in [`MASTER_PLAN.md`](MASTER_PLAN.md),
[`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md), and
[`ONE_UPDATE_AT_A_TIME_MASTER_PLAN_2026-08-31.md`](ONE_UPDATE_AT_A_TIME_MASTER_PLAN_2026-08-31.md).
It does not replace the 18-stage plan, renumber a delivery stage, or create a
second master plan. Jason's later unattended instruction explicitly authorizes
publication and next-section continuation for this plan, but does not bypass a
bundle, hardware/runtime, immutable-upload, activation-last, remote-verification
or rollback gate. A failed batch stops before activation.

The work crosses existing Stage 2 navigation, Stage 7 mobile UI, Stage 14
delivery, Stage 15 multiplayer and Stage 18 acceptance. It is serialized into
two release slices:

1. **Update 4 — SYSTEM:** high-unit navigation, deterministic order transport,
   and responsive entity picking.
2. **Update 5 — OVERHAUL:** saved control palette, cinematic non-obstructive
   battle HUD, and compressed War Table presentation.

Update 5 depends on an accepted Update 4. A polished hot-slot cannot be placed
over a command path that silently rejects a large selection or freezes while
authoring its route.

## Review verdict

The reported failures are credible in the current canonical source. The engine
already has useful foundations—clearance-aware flow fields, a unit spatial
grid, stable formation slots, generation-safe platoon references, projected
silhouette picking, and a bounded notification feed—but three command paths do
not scale together:

- a formation order can synchronously request a field for every selected unit;
- the eight-field round-robin cache can detach live units when it recycles a
  slot;
- connected-play commands reject more than 64 unit references, while the local
  takeover still consumes the gesture.

Picking also performs avoidable per-tap allocation and whole-list scans, and the
current “hot-slots” are contextual ability mirrors rather than the saved
entity/build/production palette requested by the owner. The mobile dock reduces
some overlap but remains a persistent stack of tabs, action rows, selection
readout and minimap. It is not yet the cinematic, battlefield-first command
surface requested here.

This was a source audit of authoritative `src/`, `index.html`, and Worker code.
No packaged-copy claim, physical-device benchmark, implementation, or release
claim is made by this handoff.

## Source-grounded findings

### P0 — large connected-play selections are rejected and consumed

- `mcUnits()` rejects an otherwise valid command when `units.length > 64`:
  `src/game/matchconsumer.js:95-107`.
- The local connected-play wrapper serializes the complete selected roster and
  sends it as one command: `src/game/matchconsumer.js:345-368`.
- When validation/submission returns no receipt, `mcTakeover()` displays
  **NETWORK COMMAND REJECTED** but still returns `true`; the wrapper therefore
  does not call the local fallback. This prevents divergence, but to the player
  the order was tapped and nothing moved: `src/game/matchconsumer.js:351-362`.
- The browser protocol validator and Worker both cap nested arrays at 64, and a
  command at 2,048 encoded bytes:
  `src/socialui.js:56-75` and
  `cloudflare/massfront-auth/src/index.js:2620-2637`.
- Tick packets are preflighted atomically, which is worth preserving, but the
  current schema has no multi-part operation identity:
  `src/game/matchconsumer.js:282-296`.

Runtime consequence: a 65–500 unit selection cannot issue one authoritative
move/hold/attack/guard command in connected play. It is not acceptable to
truncate the selection, locally apply rejected units, or turn fragments into
independent orders.

### P0 — order authoring can synchronously build many full navigation fields

- `formationMembers()` walks and sorts the selection, then
  `formationTargets()` creates one exact destination per unit:
  `src/ui/input.js:255-266` and `src/ui/input.js:363-374`.
- `orderMove()` calls `requestField()` inside the per-unit loop using each exact
  formation slot, not one shared strategic destination:
  `src/ui/input.js:419-455`.
- A path grid is 384 × 384 cells: `src/engine/gl.js:3581`.
- `computeField()` fills and floods that complete grid synchronously, allocates
  a fresh direction array, then walks the grid again to extract directions:
  `src/game/sim.js:1621-1681`.
- The cache contains only eight slots. Misses use blind round-robin recycling;
  recycling scans `unitHigh` and detaches every unit still using that slot:
  `src/game/sim.js:1428-1435` and `src/game/sim.js:1683-1694`.
- A blocker revision causes `mfMoveFieldFresh()` to recompute a stale active
  field synchronously on the simulation path: `src/game/sim.js:1613-1619`.

Runtime consequence: wide formations, mixed clearance classes, new blockers,
and repeated orders can create main-thread stalls exactly when the player needs
immediate feedback. Eviction can also remove a field from units already marching
so that they fall back to direct steering.

### P1 — large hulls and dense arrivals need a stronger local contract

- Infantry, light, heavy, superheavy and naval clearance classes already exist
  and must be retained: `src/game/sim.js:1436-1451`.
- Structure blockers are stamped into the strategic mask as circles even though
  the engine has an oriented-box stamper and the selection/placement systems
  know rectangular footprints: `src/game/sim.js:1477-1503` and
  `src/ui/input.js:1041-1062`.
- Final local structure avoidance also uses `T.r + B.r` circles:
  `src/game/sim.js:8480-8492`.
- Separation is intentionally bounded at high population and samples only a
  limited number of occupants per neighbouring bucket:
  `src/game/sim.js:7142-7209`. This protects frame time, but its dense-large-hull
  behavior needs measured coverage rather than another guessed constant.
- The only timed stuck recovery explicitly excludes units blocked by a crowd;
  it repairs units stranded on non-walkable terrain only:
  `src/game/sim.js:630-661`.
- Crowd arrival can idle a wedged unit near a shared goal, but that is an
  arrival heuristic rather than progress-based rerouting:
  `src/game/sim.js:8456-8469`.

Runtime consequence: large visual hulls can clip, shiver, lose their route, or
become effectively unresponsive around rotated structures and dense columns
even when the coarse field itself is valid.

### P1 — unit and structure picking still scales with avoidable work

- Unit broad-phase picking correctly uses the spatial unit grid, but every tap
  rescans all unit types for maximum span and allocates projected point arrays,
  sorted hull arrays and temporary sets:
  `src/ui/input.js:945-952`, `src/ui/input.js:970-993`, and
  `src/ui/input.js:1005-1030`.
- Structure picking walks every building, projects rectangular prisms and
  allocates base/top point arrays for candidates:
  `src/ui/input.js:1074-1111`.
- Double-tap same-type selection walks all `unitHigh` slots:
  `src/ui/input.js:1228-1249`.
- Box selection explicitly records its current whole-`unitHigh` scan as a Stage
  0 implementation awaiting a spatial query:
  `src/ui/input.js:1500-1528`.
- Tap recognition waits until pointer release and shares the main thread with
  all of the work above: `src/ui/input.js:1532-1547`.

Runtime consequence: the visible target may be correct, but feedback can arrive
late enough to feel missed; repeated taps then become accidental double-taps or
camera gestures.

### P1 — existing hot-slots are not a saved command palette

- `src/ui/hotslots.js` declares the current bar to be a selection-bound **view**
  over existing ability buttons, not a controller or favorite system:
  `src/ui/hotslots.js:3-30`.
- Its selection signature and mode/build utility discovery walk `unitHigh`:
  `src/ui/hotslots.js:105-175`.
- The visible row is rebuilt from Commander powers, current builder actions,
  stances and utilities only: `src/ui/hotslots.js:226-326`.
- The current generation-safe platoons are a sound match-scoped starting point,
  but there are only four and they cover unit groups only:
  `src/ui/input.js:606-642`.

Runtime consequence: a player cannot pin a favorite factory, select every owned
unit or structure of a type, recall an exact mixed unit group, begin a favorite
structure, or queue a favorite unit from one stable thumb location.

### P1 — the mobile HUD is still persistent command chrome

- The authored dock contains five deck tabs plus camera, tactical, platoon,
  hot-slot and hidden ability rows around the minimap:
  `index.html:97-146`.
- Portrait CSS turns that into a fixed full-width bottom plate and reserves
  separate rows for tabs/actions, selection information, minimap and transient
  sheets: `src/styles/ui.css:2243-2327`.
- `uiPrimaryOpen` hides secondary rows while a large panel is open, which should
  be preserved, but the resting HUD has no measured occupancy budget and does
  not collapse on ordinary battlefield intent:
  `src/styles/ui.css:2367-2398`.
- The traffic controller documents and mitigates the historical banner pile-up;
  its notification feed is a good subsystem to retain rather than replace:
  `src/ui/hudflow.js:3-44` and `src/ui/hudflow.js:340-405`.

Runtime consequence: overlap is better than before, but “not overlapping” is
not the same as giving the battlefield back to the player. A modern cinematic
command experience needs one adaptive control surface, not several permanently
labelled rows.

### P1 — Commander/KEEL transmission input and transcript are incomplete

- The receiver correctly reuses the minimap surface and is presentation-only:
  `src/ui/hud.js:3161-3206`.
- Its overlay uses `pointer-events:none`, so it cannot steal input, but the
  underlying minimap canvas keeps unconditional pointer navigation listeners:
  `src/styles/ui.css:3304-3314` and `src/ui/input.js:1643-1652`.
- On a phone, the spoken line is clamped inside the small minimap receiver to
  two seven-pixel lines: `src/styles/ui.css:3355-3369`.
- The event feed already has a COMMS channel, but `cmdrTxShow()` currently sends
  no transcript entry to it: `src/ui/hudflow.js:362-389` and
  `src/ui/hud.js:3267-3318`.

Runtime consequence: tapping the apparent portrait can still jump the camera
through the hidden minimap, a longer caption is hard to read, and a missed line
cannot be recovered from COMMS.

## Preserve these working foundations

Do not rewrite proven systems merely because their integration is incomplete.

- Keep the incremental unit spatial grid and nearby query:
  `src/game/sim.js:1310-1371` and `src/game/sim.js:1722-1735`.
- Keep clearance classes, corner-cut prevention, strategic sector fallback and
  deterministic direction extraction: `src/game/sim.js:1436-1451` and
  `src/game/sim.js:1574-1681`.
- Keep stable formation ordering and exact final slots:
  `src/ui/input.js:255-374`.
- Keep generation checks so recycled unit slots are never silently adopted:
  `src/ui/input.js:606-642` and `src/game/matchconsumer.js:95-107`.
- Keep projected silhouette and rectangular structure picking semantics while
  removing their repeated allocations: `src/ui/input.js:929-1111`.
- Keep the single non-modal battle event feed and its COMMS filter:
  `src/ui/hudflow.js:340-405`.
- Keep gameplay rules in their existing owners. The palette invokes canonical
  selection, placement, production and command controllers; it does not clone
  their cost, cooldown, queue, unlock or ownership logic.

## Update 4 — SYSTEM: high-unit command responsiveness

### U4.0 — instrument the real paths

Add opt-in counters to the existing Graphics diagnostics for:

- pointer-down, pointer-up, intent classification, picker completion, local
  visual acknowledgement and authoritative acknowledgement timestamps;
- selection cardinality and locally owned cardinality;
- field request, hit, miss, build, reuse, wait, invalidation and eviction;
- field cells processed, build duration, active references and peak queued jobs;
- blocker revision reason and number of revisions coalesced into one tick;
- per-unit progress, stall classifications and recovery action;
- serialized operation bytes, fragment count, retries, rejections, applies and
  duplicate suppression.

Measure 1, 48, 64, 65, 100, 250 and 500 selected units, every clearance class,
100 and 300 structures, rotated large footprints, build/destroy while moving,
offline Standard and live connected matches. Also run these command tests with
1,000 and 2,500 total battlefield units so a small local selection is not tested
only in an empty world.

### U4.1 — separate strategic routing from exact formation arrival

The operation owns one strategic destination. Partition a selection only by
movement medium and clearance class, then request one shared long-route field
for each resulting cohort. Preserve each unit's exact `utx/uty` formation slot;
switch from the cohort field to direct/local slot approach only inside the
measured final-approach radius.

Requirements:

- one order/cohort/formation identity survives path scheduling and multiplayer;
- a wide formation does not create one global field per final slot;
- exact slots remain stable and generation-safe;
- air, ground and connected naval domains remain separate;
- mixed heavy/superheavy units never inherit infantry clearance;
- attack-move, direct move, patrol, queue and guard retain distinct semantics.

### U4.2 — replace blind field recycling with deterministic scheduled work

- Replace round-robin `FF_MAX` eviction with active-aware LRU/refcounts.
- Never evict a field referenced by a live order. If capacity is exhausted,
  queue the request or share a compatible cohort field.
- Reuse direction, distance, queue and bucket buffers; do not allocate a full
  direction grid for every request.
- Convert full field computation into deterministic work slices with a fixed
  operation budget. A Worker is permitted only if every client applies the
  finished field on an agreed simulation tick after verifying the same field
  hash; wall-clock completion order may never affect simulation state.
- Coalesce blocker changes within a simulation tick and rebuild clearance once.
- Stamp real oriented building footprints at both strategic-mask and local
  avoidance layers. Do not reduce every large structure to `B.r`.
- Retain old fields until their replacements verify; units continue following
  the last valid route rather than becoming direct-steer stragglers.

### U4.3 — add progress-based stall recovery

Track distance-to-route-progress, displacement and local crowd state over a
bounded window. Recovery must distinguish:

- temporarily yielding to another hull;
- blocked by a newly completed/destroyed structure revision;
- final-slot crowding;
- unreachable medium/clearance goal;
- legacy unit already inside a blocker.

Recovery order is deterministic: refresh/rebind cohort field, request an
adjacent lane/portal, repack final slots, then return an explicit blocked result.
Do not teleport a valid unit, silently idle a far-away order, or repeatedly
recompute the same impossible field.

### U4.4 — introduce an atomic large-order protocol

Create a versioned operation envelope separate from transport fragments:

```text
operationId, seat, targetTick, kind, formationId, expectedCount,
partIndex, partCount, unitGenerationRefs, payloadHash
```

Rules:

- chunk by serialized byte budget, not an arbitrary visual unit count;
- keep legacy v1 commands for compatible selections at or below their safe
  bound, but never truncate a larger selection into v1;
- acknowledge fragment receipt separately from operation acceptance;
- the authoritative relay assembles every part, verifies exact count/hash,
  rejects duplicates/conflicts, then broadcasts one atomic operation;
- every client preflights every generation and seat ownership reference before
  applying any member;
- missing/late parts reject the operation with a visible retry state; they never
  partially move the front half of a formation;
- reconnect/resend is idempotent by operation ID and payload hash;
- one accepted operation applies exactly once at the agreed tick;
- authoring failure leaves simulation unchanged but does not swallow feedback:
  show **NOT SENT** with the reason and a safe retry action.

The Worker rate contract must be raised through measured byte/operation limits,
not by disabling validation. Chat/text remains forbidden in gameplay command
payloads.

### U4.5 — make entity picking allocation-light and spatial

- Precompute maximum unit span and immutable per-type silhouette extents.
- Reuse fixed projection/hull scratch storage; no array sorting or temporary Set
  creation for each candidate under a tap.
- Query nearby building-grid cells before projected-prism tests instead of
  walking every structure.
- Convert box and same-type selection to spatial queries with an exact screen
  test as the final gate.
- Capture gesture intent/timestamps independently of delayed picker completion,
  so a busy frame cannot turn one tap into a pan or false double-tap.
- Preserve friendly-structure precedence, fog disclosure, icon-stack
  selection, touch forgiveness, and exact rotated footprint behavior.
- Show immediate, non-authoritative touch feedback on pointer release; replace
  it with accepted/rejected command state when the actual result arrives.

### Update 4 acceptance targets

All targets apply to source-matched hardware runs, not synthetic direct calls.

| Contract | Required result |
|---|---|
| 500-unit local order authoring | p95 ≤ 16 ms from release to queued visual acknowledgement |
| Entity picker at 500 units / 300 buildings | p95 ≤ 4 ms; no picker task > 12 ms |
| Tap-to-visible feedback | p95 ≤ 75 ms under the 2,500-unit battlefield case |
| Navigation scheduling | no main-thread path task > 50 ms; scheduled slices target ≤ 4 ms |
| Field ownership | zero eviction/detach of an actively referenced field |
| Accepted order start | every accepted live unit changes to the ordered intent within two fixed simulation ticks |
| Dense large-hull progress | no indefinite shiver; a stalled unit reroutes or reports blocked within 1.0 s of confirmed no progress |
| Multiplayer 65/100/250/500 | exact selected cardinality applies once on every client; no truncation or partial apply |
| Determinism | repeated fixed-input runs match operation, field and state hashes |
| Picking correctness | 30/30 scripted unit/structure taps at each viewport and camera angle resolve the visible intended target |

Update 4 is incomplete until offline and connected gameplay both pass. A clean
console, protocol ACK without consumer apply, or direct call to `computeField()`
is not acceptance.

## Update 5 — OVERHAUL: saved command palette and cinematic interface

### U5.0 — interaction model

The player gets one adaptive command palette, not another permanent HUD row.
It has eight logical slots. Portrait may show five plus a visual page control;
landscape may show all eight when measured space permits. It remains one row,
collapses after an action, and never covers the central battlefield.

Gesture contract:

- **Tap:** execute the slot's primary select/build/produce action.
- **Double-tap:** select and focus an entity/type/group; for build/production
  favorites, focus/open the eligible builder or production structure without
  issuing a duplicate order.
- **Long-press:** open visual Assign / Replace / Clear choices. It never executes
  a destructive action on the hold threshold.
- **Drag:** assign or reorder only while explicit **EDIT PALETTE** mode is lit.
  Outside edit mode, a world drag remains camera pan and a roster drag remains
  scroll.

In edit mode the player may drag a selected entity/group, a structure card or a
unit-production card onto a slot. A small visual choice then records **THIS**,
**ALL TYPE**, **BUILD**, or **PRODUCE** as applicable. The choice uses imagery and
short labels, not a paragraph dialog.

### U5.1 — exact slot kinds

| Slot kind | Tap behavior | Storage/validity |
|---|---|---|
| **One entity** | Select that one live owned unit or structure | Match-only `{domain,id,generation,matchId}`; never cloud-saved; clears on new match, authority generation change, death/destruction or failed reconnect validation |
| **All same type** | Select every currently live entity of that semantic unit/structure type owned by the local seat | Profile/cloud semantic `{domain,typeId}`; resolves fresh each use; never stores runtime indices |
| **Exact group** | Select every still-live member of the exact mixed unit group; show survivor count | Match-only generation-safe refs plus formation; a recycled slot is never adopted; no cross-match persistence |
| **Build favorite** | Select/retain an eligible owned builder and enter canonical placement for the saved structure type | Profile/cloud semantic `{kind:'build',buildingType}`; invokes the existing placement controller and all prerequisite/cost/domain checks |
| **Production favorite** | Queue one saved unit type at the active or configured eligible owned production structure | Profile/cloud semantic `{kind:'produce',unitType,facilityPolicy}`; invokes the canonical production/connected-play controller and queue/pop/cost checks |

The local Commander may use a persistent semantic singleton selector; arbitrary
one-entity references may not pretend to survive a new battle.

### U5.2 — persistence boundary

Add a versioned, bounded semantic palette under the active profile's `META`, so
the existing local and cloud-save path carries it:

- career persistence root: `src/game/meta.js:300-316` and
  `src/game/meta.js:398-450`;
- cloud payload includes the whole `META`: `src/account.js:91-103` and
  `src/authportal.js:479-510`.

`metaHarden()` must validate kind, domain, canonical type IDs, slot count and
schema version, drop unknown keys, and migrate safely. Only semantic favorites
and visual slot order are serialized. Exact entity/group handles live in a
separate match object and must be absent from `syncPayload()`, exported career
saves and another account's restore.

A same-match reconnect may restore exact refs only after match ID, authority
generation, unit generation and ownership all revalidate. New match, disconnect
forfeit, profile switch and world reset clear them.

### U5.3 — multiplayer authority

- Every type/group resolution filters through `mfLocalOwnsUnit()` and
  `mfLocalOwnsBuilding()`: `src/game/matchconsumer.js:298-317`.
- Team ownership is not enough in co-op; a player may not select, focus-command,
  queue from, recycle or rebind another commander's seat assets.
- Palette actions invoke the same atomic Update 4 operation author and existing
  `MFMatchCommandConsumer` paths. They never mutate `ustate`, `utx`, `queue`,
  resources or building state directly.
- A changed faction/roster leaves unavailable semantic favorites visibly
  dormant with a concise reason. It does not substitute a different chassis.
- Build and production favorite code must refactor the current card handlers
  into shared canonical actions rather than duplicating them. Current owners are
  `src/ui/hud.js:2391-2520` and `src/ui/hud.js:2680-2759`.

### U5.4 — cinematic, non-obstructive battle HUD

Use modern C&C3/Supreme Commander-style interaction quality as a reference, not
their copyrighted layout, imagery, sound or assets. The shipped result uses
original approved MASSFRONT art, factions, typography, command iconography,
motion and audio.

Requirements:

- resting HUD occupies no more than **28% portrait** and **22% landscape**;
- only one contextual deck/palette is expanded at a time;
- the command palette, selection portrait and critical resources are visually
  led; primary actions use authored icons, silhouettes, state rings and motion,
  with labels limited to one or two words;
- explanations, stats and prerequisites use tap/hold/details progressive
  disclosure rather than permanent prose;
- the bottom dock collapses within 180 ms after a battlefield command and
  reopens from one 44 px thumb target;
- combat heat may quiet/collapse secondary chrome but never hides Stop, current
  selection state or a critical warning;
- the v1.33.60 event feed remains the home for routine notices, loot and COMMS;
  do not recreate stacked toast cards;
- full cinematics remove gameplay hit targets except a 48 px Skip/caption
  surface, then restore the exact prior HUD deck, palette page, selection and
  camera-input state;
- reduced-motion mode uses cuts/fades and retains identical state timing;
- art failure falls back to a readable MASSFRONT vector/icon state, not an empty
  button or emoji-only final presentation.

The approved visual target requires a complete original asset family rather
than one flattened mockup: scalable shell frames/corners; resource capsules;
Commander and KEEL receiver frames; faction crest/accent masks; selection and
world-label plates; live-model build/production cards; queue, timer, progress
and status rings; Repair, Recycle and service states; saved-palette cards and
edit states; notification/COMMS badge/feed controls; minimap and transmission
states; and focus, disabled, offline and reduced-motion variants. Simple chrome
and symbols stay CSS/vector/icon-atlas based for clean scaling. Raster imagery is
reserved for portraits, battlefield art and model/card renders. Every control
must call the existing authoritative controller; visual completion without
functional wiring is a failed slice.

### U5.5 — Commander and KEEL communication contract

Battlefield Commander/KEEL profiles continue to replace the minimap during a
line, but the state becomes explicit:

1. On `enter`, set the minimap canvas non-interactive and mark the receiver
   `aria-disabled="true"`.
2. `mmNav()` also rejects input while a transmission is active, so CSS or shell
   skew cannot click through to a camera jump.
3. Show portrait/animation in the minimap well. Put the full readable caption in
   a separate strip immediately above the collapsed command dock; speaker and
   faction remain visible.
4. Archive `SPEAKER — line` once to the event feed's **COMMS** channel with the
   cue key/sequence for dedupe.
5. On `exit`, restore minimap input on the next animation/simulation frame and
   return focus only if it was previously on the minimap.
6. KEEL is always UGA. A malformed caller cannot supply another faction.

Exploration does not reuse the tiny battle minimap: it uses the dedicated
conversation surface already owned by the Galactic Command plan. Captions and
COMMS transcript remain available there as well.

### U5.6 — War Table compression and cinematic presentation

The current first-run primer accurately describes a five-stage
`galaxy -> system -> planet -> region -> deploy` chain:
`src/warprimer.js:3-57`. The live Standard entry and setup/back authority live in
`src/main.js:2614-2703`. Compress presentation without inventing new game-mode
IDs or bypassing those controllers.

- **START MASSFRONT** opens one cinematic War Table hub.
- Standard/Classic, Campaign, Training and Co-op remain distinct real choices;
  their real availability/online state is shown visually and honestly.
- Choosing a mode goes directly to its next meaningful decision. Remove
  confirm-only screens and duplicate summaries, not progression gates.
- A returning player with a valid last Standard plan reaches **START BATTLE** in
  no more than three intentional taps after START MASSFRONT, excluding physical
  landing-point selection.
- A first-time player receives optional contextual visual guidance, never a
  five-card prose lecture or forced tutorial.
- Use original planet/commander/faction art, animated holographic focus,
  meaningful map motion and concise state chips. Locked destinations explain
  themselves on demand.
- Android Back, browser Back, in-screen Back and cancel return to the same prior
  meaningful choice without resetting the authored plan.

### Update 5 acceptance targets

| Contract | Required result |
|---|---|
| Resting battlefield visibility | HUD ≤ 28% portrait and ≤ 22% landscape; no central-field obstruction |
| Expanded surfaces | one contextual surface only; zero clipped primary actions |
| Palette reach | one tap from resting state for each saved action; maximum one extra page tap in portrait |
| Palette correctness | all five slot kinds pass local, reconnect, death/recycle, profile-switch and new-match cases |
| Cloud boundary | semantic favorites round-trip; zero runtime entity/group refs appear in local/cloud career payloads |
| Connected authority | zero cross-seat selection/command/build/production mutations; exact accepted group applies once |
| Minimap transmission | 100% input suspension during enter/hold/exit and restoration on the next frame |
| Captions/COMMS | every shown cue has a readable caption and exactly one matching transcript row |
| War Table | returning Standard path ≤ 3 taps to START BATTLE; all preserved mode controllers launch correctly |
| Touch/accessibility | all primary targets ≥ 44 px, safe-area clean, keyboard/focus valid, reduced motion valid |
| Browser/runtime | zero uncaught errors and hardware WebGL2; visual inspection is mandatory |

## Device and scenario matrix

| Surface | Viewports / mode | Required coverage |
|---|---|---|
| Galaxy S25 Ultra browser-installed game | 412×900 portrait, 900×412 landscape, touch | 500-unit orders, 2,500-unit battle load, large hull/rotated base routing, palette, transmissions, War Table |
| Galaxy S24 Ultra / Android compatibility | 360×800 portrait and supported landscape, touch | picker latency, safe areas, reconnect, Update 4 protocol compatibility |
| Android APK/WebView wrapper | physical install-over-old and current package, touch | command protocol, lifecycle interruption, minimap suspension, offline/connected parity |
| Apple Safari installed PWA | representative iPhone portrait/landscape with safe areas | standalone launch, touch/gesture arbitration, IndexedDB/local save, offline palette semantics, captions/audio unlock |
| Desktop Chrome/Edge hardware GPU | 1280×720 and 1920×1080, mouse/keyboard | shift-box, precise picking, control-palette keyboard/focus, deterministic replay/profiling |

Additional automated viewport coverage is mandatory at 344×780, 360×800,
393×852, 412×915, 740×360, 780×360, 915×412 and 1024×768, with DPR
1/1.5/2/3, text scaling 100/125/150/200%, safe-area/notch simulation and
reduced motion. Assertions cover ≥44 px primary targets, one contextual surface
at a time, no clipped controls/overlap/scroll traps, no central-field
obstruction and no input click-through. Every viewport produces a screenshot
that is inspected, not merely captured.

For every surface, run small and large units through narrow rotated-structure
gaps, converging formations, opposite-direction traffic, build-completes-on-path,
destroyed-blocker reopening, naval/land boundaries, fogged targets, production
queues, local co-op seat ownership and a reconnect during a fragmented order.

## Verification and release gates

Update 4 must include source-bound automated probes for navigation scheduling,
active-field retention, exact order fragmentation/reassembly, ownership,
deterministic hashes, picker latency and real input-to-ack paths. Update 5 must
add palette schema/migration/cloud-boundary tests plus hardware-browser visual
captures for every matrix viewport.

After every source edit, run `node tools/bundle.mjs`. New classic scripts, if
any, must be registered in both `boot.js` and `assets/data/manifest.json` in a
dependency-safe order. Use the real hardware-GPU Playwright launcher and inspect
screenshots; a clean console is not visual acceptance.

Each update remains one stage-batched release. During the explicitly authorized
unattended continuation, prepare and verify locally, publish immutable bytes,
activate last, remotely verify, report a checkpoint, and proceed. Stop rather
than activate any batch whose acceptance gate fails. Physical-device acceptance
remains evidence and may not be claimed from browser emulation.

## Definition of done

This handoff is complete only when a player can tap a visible unit or structure,
author a 500-unit command without a freeze, receive immediate honest feedback,
have that exact operation apply once in connected play, and manage favorite
units, structures, construction and production from a compact saved palette
that yields the battlefield when not in use.

The cinematic goal is not “more decoration.” It is faster comprehension,
stronger visual hierarchy, original MASSFRONT identity, and less persistent UI
between the player and the battle.
