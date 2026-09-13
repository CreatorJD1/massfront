# Shared economy, storm water world, interior maps — audit and plan

Prepared 2026-09-09, from the owner's three requests. Evidence gathered by
reading the current tree; no code changed for this document. Companion to
`UGA_PROGRESSION_AUDIT.md`.

---

## A. UGA Command should share the main menu's resources

### Measured state

Two unrelated economies exist.

**Classic / main menu** — `src/game/meta.js`, `META_DEF`:
`xp, cores, researchData, owned{}, wins, matches, standardMatches, kills, color`.
The menu header shows **Cores** and **XP / account rank**. Cores are the earned
currency: `metaGrantCores(cores, 'match_reward')` settles them after a match, and
Arsenal Requisition prices in Cores.

**UGA Command rail** — seven separate resources: `credits, alloys, components,
bioSamples, research, fuel, probes`. **`cores` does not appear anywhere in the
UGA UI**, and none of the seven appear in the classic menu.

So a player earns Cores by playing, and none of it is visible or spendable in the
strategic home that is supposed to be their persistent base.

### Decision needed before I build

1. **Merge or surface?** Either (a) UGA adopts Cores + XP as the single account
   ledger and its seven resources become UGA-internal materials shown separately,
   or (b) the two ledgers genuinely unify and the seven collapse into Cores plus
   a small number of materials. (a) is far less destructive to the existing
   construction/research costs, which are all priced in the seven.
2. **Do Cores earned in a UGA ground operation and in a classic match settle
   through the same path?** They should, and `metaGrantCores` already exists as
   that path — but the UGA result settles via `ground_result.js` V3 receipts.

My recommendation is (a): put Cores and rank/XP at the head of the UGA rail from
`META`, keep the seven as expedition materials, and route all Core awards through
`metaGrantCores` so there is exactly one earning path. That is a contained change
and does not re-price the whole UGA economy.

---

## B. Storm water world for the floating platform sets

### Measured state

- **Floating platform art already exists**: `mf-platform-hs-v1/` holds **30 GLBs**
  — bridge decks, build platforms, bunker bases, deck towers (3 and 4 storey),
  gantry frames, landing decks, ramp cores, silo pads, terrace blocks, in
  brutalist and colonial variants. This is a usable platform set today.
- **Water is not a system.** `src/engine/gl.js:3658` defines
  `const WATER_H=0.335, BEACH_H=0.375` — water is a *terrain height threshold*
  shaded in `terrain.js`. There is no water surface mesh, no water shader
  program, and no wave simulation. Every `wave` hit in the engine is
  `shockwave.js`, which is combat FX.
- **Weather does not exist at all.** Every `weather` match in the tree is either
  lore prose ("Factories fight the weather") or a material description
  ("weathered concrete"). There is no rain, wind, cloud or storm system.

### What this actually requires

This is the largest of the three, because it is two new engine systems, not
content:

1. **Water surface pass** — a real animated surface at `WATER_H` with a Gerstner
   or FFT wave field, normal-mapped, with shoreline blending against the existing
   `BEACH_H` band.
2. **Weather system** — wind vector driving the wave field, rain particles,
   cloud/darkening, lightning. Wind must be shared state so waves and rain agree.
3. **Platform siting** — a theatre generator that places the 30-piece kit as
   floating platforms with connecting bridge decks over deep water, and marks the
   water impassable to ground units while keeping the decks navigable.

`AGENTS.md` constrains 1 and 2 directly: any new GL pass must keep the
post-processing chain on texture units 4/5/6, must save and restore `BLEND`,
`CULL_FACE`, `DEPTH_TEST` and `DEPTH_WRITEMASK`, and must call `begin3D(S_nA)`
when it finishes. A water pass is exactly the kind of pass that has broken this
renderer before.

---

## C. Interior maps, XCOM 2 style

### Measured state — much further along than B

`assets/data/interiortopology-stage10.js` (39,226 bytes) holds audited navigation
graphs for **four interior templates**, and
`source-media/content-library/interior-tactical-model-packs.v1.json` (80,798
bytes) catalogues **six faction-themed packs**:

| templates | packs |
| --- | --- |
| `interior_xs_breach_40x40` | `interior_uga_nexus_vii_strike_logistics_v1` |
| `interior_xs_linear_48x32` | `interior_nova_aelos_caldris_customs_v1` |
| `interior_small_loop_64x64` | `interior_dominion_pyraeth_mech_foundry_v1` |
| `interior_small_multilevel_80x64` | `interior_syndicate_nordhall_reactor_vault_v1` |
| | `interior_brood_karak_meridian_breach_v1` |
| | `interior_neutral_veyra_orison_derelict_v1` |

The dataset is **deliberately inert**: `status: 'AUTHORING_ONLY'`,
`runtimeReady: false`, `activation.runtime: false`, with a comment stating it
records the graphs "without implying that any model pack has shipped."

The shapes are already the right ones — breach, linear, loop and multilevel are
the XCOM 2 vocabulary, and the packs are tied to real planets in the ground
catalog (Caldris Customs, Orison Derelict, Meridian Breach all match existing
ground areas).

### What this requires

1. Ship the interior model packs as runtime content and flip `runtimeReady`.
2. Interior camera treatment — roof culling / cutaway so a multilevel interior is
   readable from the RTS camera. This is the real XCOM 2 feel and the main new
   work.
3. Bind the existing nav graphs to the sim's pathing, and add interior entries to
   the ground catalog as region maps.

---

## Recommended order

**C, then A, then B.** C has audited data and named art waiting on activation, so
it converts fastest into something playable. A is contained and fixes a
correctness problem players can already see. B is a two-system engine project and
should not be started while the progression spine in
`UGA_PROGRESSION_AUDIT.md` is still missing region control — a storm world with
no ownership model is another beautiful map with nothing to win.

## Open questions

1. Economy: merge Cores into UGA as the account ledger, or unify fully? (A.1)
2. Interiors: should an interior be its own region map inside an existing area,
   or a distinct region type with its own control rules?
3. Water world: is it a new planet in a new system, or a new region on an
   existing planet (Ithara and Orison are both water-adjacent already)?
