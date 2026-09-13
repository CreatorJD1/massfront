# MASSFRONT master plan — Stage 10 layout implementation progress · 2026-08-29

Status: **IMPLEMENTATION FOUNDATION IN PROGRESS**. The preparation package is
committed at `51329e9`. The first implementation package is committed at
`56f9ca5`. This slice expands the source-bound `BattlefieldTopologyV2` surface
wave and adds the separate `Stage10TheatreCatalogV1` contract for the target
eight-slot planet, interior, and orbital scope. The current checkpoint also prepares
source-only surface-site requests, an interior gap-resolution contract, and
cross-theatre traversal fixtures. These additions are authoring and evidence
contracts only: they do not activate unfinished topology, register world-kit
GLBs, change pathfinding, launch Blender, capture runtime proof, or touch
character/VRoid work.

The current model-preparation checkpoint is separately bounded. The surviving
models are creator-locked: no model regeneration, canonical GLB overwrite, or
geometry/topology/winding/normal edit is permitted. Stage 10 may produce only
derived cleaning, cubic-UV, PBR, flicker-audit, and paired-render evidence
below `tmp/`; it does not promote those artifacts to runtime.

Galactic War Table integration is also being corrected as a separate active
priority. That integration work does not change the locked-model inventory,
waive any model-acceptance gate, or make incomplete Stage 10 model evidence a
pass.

## Corrected Stage 10 scope

The four current RTS homeworlds and their sixteen Standard maps are only the
first surface-battlefield lane. They are not the complete MASSFRONT world or
location catalogue.

| Lane | Current Stage 10 contract | Unit envelope |
|---|---|---|
| Surface battlefield | Four-homeworld Standard Wave 1; 16 inactive topology candidates | Combined arms |
| Planet catalogue | Eight target slots using the exploration module as Stage 10 authority; six current showcase identities and two reserved module entries remain deliberately unnamed | Defined by each location, never inferred globally |
| Interior tactical | Four source-matched XS/Small templates across six planned 15-piece location packs | Infantry-only branches or infantry + small vehicle + light-mech routes |
| Orbital / outer-space locations | Six source-matched station, logistics-array, derelict, debris-field, and gate seeds | Infantry boarding or small craft only |

Per creator direction, `SHOWCASE_SYSTEMS` is the Stage 10 planet authority.
Its current set is Caldris, Ithara, Orison, Nacre, Meridian K-4, and Tethys
Foundry. The remaining two slots must be added as new exploration-module
entries with stable IDs and assets.

The older `galaxy_data.js` prototype also contains eight planet records, but it
is reference-only, contains franchise-contaminated placeholder material, and
is not identity authority. Stage 10 does not silently promote those old names.
The two remaining target planet identities stay
`PENDING_CANON_NAME` until a canonical local source or explicit direction names
them.

`assets/data/theatreprofiles-stage10.js` fails closed if a restricted interior
profile admits heavy vehicles, heavy mechs, artillery, aircraft, naval units,
titans, or capital ships. Its XS bounds stop at 48 m and Small bounds stop at
80 m. The existing source contract's 6.4 m mixed route supports infantry, one
small vehicle, and light-mech-scale movement; narrower branches can be
infantry-only.

## Interior and orbital topology implementation

`assets/data/interiortopology-stage10.js` defines four registered but inert
navigation candidates matching the source interior templates exactly:

- XS breach, 40 × 40 m;
- XS linear, 48 × 32 m;
- Small loop, 64 × 64 m; and
- Small multilevel, 80 × 64 m.

Together they contain 31 nodes, 28 mixed routes, seven infantry-only branches,
six objectives, eight portals, eight deterministic destructibles, and twelve
turning pockets. Mixed routes retain 6.4 m clearance; infantry branches are
3.2 m. Every candidate preserves insertion-to-objective-to-extraction
connectivity and rejects the heavy-unit classes listed above.

`assets/data/orbitaltopology-stage10.js` defines six registered but inert
exploration-location candidates. Four are bounded three-dimensional smallcraft
route volumes for the Concord Spindle, Peregrine Logistics Array, Lifeboat
Debris Field, and Veyra–Karak Phase Gate. Two are infantry boarding graphs for
Archive Hulk KX-19 and the Karak Colony Spine. All six have deterministic
spawns, insertion/extraction, hazards, two objectives, destructible state
transitions, ordered recovery, and rollback to the last complete state.

## Source-only realization bindings

The topology candidates now have three fail-closed realization-binding lanes.
These bindings describe what future geometry must prove; they do not claim that
models, collision, navigation, LODs, or generated assets exist.

- Surface: all 16 Standard Wave 1 plans are bound to the Stage 10 processing
  manifest and their Stage 9 baseline status. Six retain `FULL_V1`; ten remain
  `PENDING_V0`. The matrix records 90 terrain sites, three floating pontoons,
  one semi-submersible, one fixed caisson, and one shoreline quay. Maritime
  datums remain topology declarations, not geometry proof.
- Interior: six 15-member source packs are checked across all four exact
  topology families, producing 24 explicit combinations. Twenty-two are
  source-declared; Nova multilevel and Dominion breach remain blocked source
  gaps. The complete 90-member inventories, dimensions, sockets, archetype
  contracts, collision, navigation, and LOD targets are hashed. The missing
  authored `critical` destruction state remains blocked rather than synthesized.
- Orbital: all six exploration-module contacts are bound to exact topology
  source identities and required geometry/proxy families. Four remain
  smallcraft route volumes and two remain infantry boarding graphs. Strict
  schema and model-like-string gates prevent unproven asset references from
  entering the source-only catalogue.

Interior location authority is intentionally typed rather than guessed. Three
of six pack planet declarations resolve exactly and three remain pending; 15 of
18 location declarations resolve exactly, while the three NEXUS-VII ship IDs
remain unresolved. This leaves 12 of 24 pack/template bindings
`UNBOUND_PENDING_CANONICAL_MAPPING`. Support drones are now part of the
small-unit envelope alongside infantry, small vehicles, and mechs; heavy
vehicles, heavy mechs, artillery, aircraft, naval units, and titans remain
forbidden.

The six exploration planets also have source-only layout profiles. These copy
only their exact exploration identity, parent system, biome label, renderer
radius, ring flag, scan flag, and discovery-record IDs/types. They expose 12
conditional XS/Small interior concepts, but zero Standard surface bindings:
the exploration source does not yet provide playable surface topology. Only
Caldris has enough explicit oceanic/pelagic wording for conditional sea-platform
authoring, and even that requires the complete floating-platform engineering
gate before any asset or runtime work. The other five remain deferred for
sea-platform use.

### Current source-only authoring checkpoint

Three further fail-closed contracts now define the next realization work
without promoting models or runtime content:

- Surface-site requests cover all 16 Standard Wave 1 topology plans, one
  request set per canonical map. They preserve the six `FULL_V1` baselines and
  keep the ten `PENDING_V0` maps pending. The requests specify site footprints,
  route approaches, support proofs, collision/navigation boundaries,
  destruction sections, LOD/HLOD expectations, and the 70/25/5 readability
  budget. They are source-only requests under verification, not proof that any
  requested geometry or asset exists.
- Interior gap resolution covers all six 15-member packs. The three NEXUS-VII
  location proposals map `ship_strike_expedition_bay` to `hangar`,
  `ship_logistics_cargo` to `logistics`, and `ship_mission_operations` to
  `mission_ops`, but every mapping remains `PROPOSED_NOT_CANON`, requires human
  approval and a source-catalog update, and cannot bind at runtime. The three
  mixed-namespace planet declarations remain typed non-promotions: `aelos` is
  retained as a surface-homeworld declaration, while `veyra` and `karak` stay
  pending canonical mapping; none is silently promoted to an exploration
  planet ID. Nova multilevel and Dominion breach remain blocked source gaps
  with no fallback or synthesis. Six missing `critical` destruction variants
  are explicit authoring requests affecting the 24 pack/template bindings.
- Traversal coverage defines 26 fixtures: 16 surface, four interior, and six
  orbital. Each fixture is source-hash-bound and describes deterministic
  command/tactical capture and domain-specific traversal checks. All execution
  evidence remains `NOT_CAPTURED`, the passed-fixture and capture-path lists
  remain empty, runtime activation is false, and no asset claim is made.

These contracts do not change the planet authority. The exploration module
still provides exactly Caldris, Ithara, Orison, Nacre, Meridian K-4, and Tethys
Foundry. Target slots seven and eight remain `PENDING_CANON_NAME`; no legacy or
similar-looking identifier may fill them implicitly.

## Implemented foundation

`assets/data/battlefieldtopology-stage10.js` defines a separately versioned,
classic-script-safe topology catalog and preflight. Maps without an authored
entry remain `PENDING_V0`. An entry can become runtime-active only when both its
status is `ACTIVE_V2` and its explicit activation flag is true; the first plan
is deliberately `AUTHORING_CANDIDATE` with runtime activation false.

The contract validates:

- canonical map, region, supported Small/Medium/Large size, and exact theatre
  extent, while rejecting a silent `massive` alias;
- map water mode, ordered depth bands, naval-route presence, and typed route
  width/clearance rules;
- unique spawn, route, transition, site, resource, objective, and destructible
  identities with in-bounds coordinates and valid references;
- six to eight 30–50 m primary arterials, 15–25 m secondary routes, 8–15 m
  flank/service routes, and explicit naval corridors;
- at least two valid approaches for every major site;
- distinct terrain, fixed-caisson, floating-pontoon, semi-submersible, and
  shoreline-quay support modes;
- mandatory waterline, draft, freeboard, stabilization, maritime domain, and
  stable deck-navigation proxy for floating platforms; and
- the approved 70/25/5 strategic-camera detail budget.

## Four-homeworld surface Wave 1

All sixteen canonical Standard maps now have distinct inactive topology
foundations with their own layout profile, region hazard, water mode, route
transform, site mix, landmark, and Stage 9 baseline status. Six preserve an
existing `FULL_V1` exact-location baseline. Four floating sites use explicit
pontoon or semi-submersible contracts; fixed caissons and shoreline quays are
not mislabeled as floating structures.

`aelos_north_medium` remains the fully expanded reference plan for the 2.6 km
Civic Grid theatre:

| Layer | Authored candidate |
|---|---:|
| Spawn zones | 2 |
| Primary arterials | 6 |
| Secondary district routes | 4 |
| Flank routes | 2 |
| Service routes | 2 |
| Naval river routes | 1 |
| Cross-domain transitions | 4 |
| Sites | 6 |
| Floating sea platforms | 1 |

The six sites are a command citadel, industrial plaza, energy ring, military
terrace, logistics yard, and floating river-command platform. The platform is
not treated as a land building: it has a `floating_pontoon` support mode,
waterline, draft, freeboard, four-point mooring, a stable deck-navigation
proxy, one naval approach, and one gangway-linked district approach.

This is an authoring topology, not a shipped map. It must still gain exact site
templates, geometry realization, traversal/buildability proof, recovery and
destruction-state integration, hardware-GPU visual review, phone performance,
and explicit activation before runtime may consume it.

## Locked-model repair, UV, PBR, and flicker-audit lane

The corrected Stage 10 model catalogue contains exactly 327 retained
candidates: 320 report-authoritative world-kit modules plus 7 retained Spline
exports. The preparation lane contains the same 327 models. There are no
pipeline exclusions.

The former seven hard-surface repair-locks were visually accepted as good on
2026-08-31 and are processing-eligible. The former three Spline exclusions
(`MF_STRUCT_CITYTOWER_02` and the two Caldris Orbital Ring Spline dumps) were
deleted from source on 2026-08-31. The 31 road-QA GLBs are a separate
QA-only inventory and are not part of the derived schedule.

The original user-approved discard set is the 12 low-quality Spline Props & POI
models recorded in `DISCARDED_SPLINE_PROPS.json`:
`MF_PROP_CARGODEPOT_01`, `MF_PROP_CRYSTAL_01`, `MF_PROP_DEPOSIT_01`,
`MF_PROP_GEYSER_01`, `MF_PROP_ICESPIRE_01`, `MF_PROP_MOUNTAIN_02`,
`MF_PROP_RELIC_01`, `MF_PROP_ROCK_01`, `MF_PROP_ROCKARCH_01`,
`MF_PROP_TREE_01`, `MF_PROP_TREE_02`, and `MF_PROP_WRECK_01`.

Blender repair pipeline v17 is intentionally `CONSERVATIVE_UV_ONLY`. Its full
summary has processed all 330 selected models with zero failures and zero
`RECONSTRUCTION_REQUIRED` results. It preserves canonical geometry, topology,
triangle winding, normals, source materials, and source hashes while emitting
derived `UV_GEN` bake-atlas and `UVMap_Tile` cubic-material coordinates below
`tmp/stage10-model-repair/`.

That completed UV summary is not by itself model acceptance. Full PBR v1 must
bind authored MASSFRONT base-colour, normal, metallic-roughness, and occlusion
textures to every material primitive, plus emissive where authored. A separate
read-only Blender z-fighting audit must inspect the same active LOD for exact
duplicate faces, identical or nested render meshes, exact cross-mesh face
overlap, and near-coplanar overlap capable of polygon flicker. Collision,
navigation, proof/evidence helpers, and alternate LODs are excluded from false
cross-comparisons. Finally, all 328 models require matched source/PBR renders
with the same camera, framing, lighting, LOD selection, and backface-culling
policy.

At this checkpoint the culling-correct PBR v1 export has processed all 330
models with zero failed outputs and `PBR_TEXTURED: 330`. It remains derived and
unpromoted, and the unified material-binding verifier is still required.

The authoritative read-only Blender z-fighting audit v2 also processed all 330
models with zero audit failures, but it **failed acceptance**: 19 models passed
and 311 are `Z_FIGHTING_REVIEW_REQUIRED`. Its reports contain 103,121
face-level findings — 1,883 authoritative raw nondegenerate exact duplicate
faces and 101,238 near-coplanar overlaps — while correctly ignoring five
Blender-only degenerate duplicate faces. The audit is bound to catalogue
SHA-256 `32af2e02ae018a3e818df5580ae1e9dc0e32e77ef952232a77680964de930684`
and audit-script SHA-256
`927c424616ca2efdf034e70cce656dba2da6938449efe7850d328df9168066d6`.
It took 1,312.389 seconds and mutated no model.

The paired renderer output is still only a two-model smoke pass. No
complete-catalogue paired-render or unified model-preparation pass is claimed.
The 311 Blender findings block Stage 10 model acceptance. All outputs remain
evidence-only, runtime inactive, and unregistered.

## Verification

| Command | Result |
|---|---|
| `node tools/verify-stage10-battlefield-topology.mjs` | **PASS 24/24**; all 16 Standard candidates, 16 distinct profiles and topology hashes, six `FULL_V1` baselines, four floating sites, route and approach gates, and injected fail-closed faults. Report: `tmp/stage10-topology/report.json`. |
| `node tools/verify-stage10-theatre-catalog.mjs` | **PASS 16/16**; eight target planet slots, the exploration-module authority, six source-matched identities, two reserved names, four source-matched interior templates, six inert interior packs, restricted unit envelopes, six source-matched orbital seeds, loader registration, and six injected faults. Report: `tmp/stage10-theatres/report.json`. |
| `node tools/verify-stage10-interior-topology.mjs` | **PASS**; four exact templates and 19 injected fail-closed faults, including support-drone authority. Report: `tmp/stage10-interior-topology/verification.json`. |
| `node tools/verify-stage10-orbital-topology.mjs` | **PASS 29/29**; six source-matched layouts, distinct stable hashes, zero random calls, recovery gates, loader registration, and 13 injected faults. Report: `tmp/stage10-orbital-topology/report.json`. |
| `node tools/verify-stage10-surface-topology-bindings.mjs` | **PASS 35/35**; all 16 plans, six `FULL_V1`, ten `PENDING_V0`, exact support modes, strict unknown-field rejection, and no model/generated-asset claims. |
| `node tools/verify-stage10-interior-layout-bindings.mjs` | **PASS**; 24 pack/template combinations, 90 exact inventory members, 22 source-declared combinations, two source gaps, 12 authority-pending bindings, and 38 injected faults. |
| `node tools/verify-stage10-orbital-layout-bindings.mjs` | **PASS 37/37**; all six contact identities, strict nested schema, forbidden model-like strings, and independent source-drift faults. |
| `node tools/verify-stage10-exploration-planet-layout-profiles.mjs` | **PASS 22/22**; six exact exploration planets, two pending identity slots, 12 conditional restricted-unit interior concepts, zero unproven Standard bindings, and Caldris-only conditional sea-platform authoring. |
| `node tools/verify-stage10-surface-site-requests.mjs` | **PASS 31/31**; exact 16-plan/96-site coverage, six `FULL_V1` maps preserved, ten `PENDING_V0` maps request-only, 16 template families, six maritime support contracts, and 24 injected fail-closed faults. No runtime or geometry result is claimed. |
| `node tools/verify-stage10-interior-gap-resolution.mjs` | **PASS**; validates six packs, three proposed-not-canon NEXUS mappings, three typed non-promotions, two retained source gaps, six critical-variant requests, the exact unique 6×4 binding matrix, actual unregistered state, and 11 injected faults. A schema pass cannot approve a mapping or provide a missing model. |
| `node tools/verify-stage10-traversal-fixtures.mjs` | **PASS 28/28**; validates exact 16/4/6 source coverage, all seven named authorities, nested policy integrity, and deterministic fixture definitions. Execution evidence remains `NOT_CAPTURED`; no traversal, browser, GPU, or visual pass is claimed. |
| `node tools/verify-stage10-model-review-gallery.mjs` | **PASS 6,359 checks**; exact 328 report-authoritative world-kit modules, seven separately displayed repair locks, 31 separate road-QA exports, 10 retained manifest-hashed Spline preview renders with one metadata-blocked model, exact 12 discarded Props & POI exclusions, three excluded stale road aliases, source/evidence hashes, and zero runtime registration claims. Gallery: `tmp/stage10-model-review/index.html`. |
| Blender repair pipeline v18 summary | **IN-PROGRESS DERIVED CLEAN+UV RERUN, NOT MODEL ACCEPTANCE**. An earlier v18 write stopped at 117/3 failures/15 reconstruction. Blender 5.2 now reverts UV-breaking cleanup and retries source-only UVs after a post-export miss. Smoke recovered the four blocked models to `UV_READY_GEOMETRY_REVIEW`. The derived schedule is now 328 after the two Caldris Spline sites were withdrawn; `tmp/stage10-model-repair/summary.json` is the current write root. |
| PBR v1 summary | **COMPLETE DERIVED PBR EVIDENCE, NOT MODEL ACCEPTANCE**; exact 330 scheduled and processed, zero failures, and `PBR_TEXTURED: 330`. The culling-correct outputs are derived, runtime unpromoted, and still require unified material-binding verification. Summary: `tmp/stage10-model-repair/pbr-reports/summary.json`. |
| Blender z-fighting audit v2 summary | **FAIL / BLOCKED**; exact 330 processed and zero audit failures, but only 19 pass and 311 require review. The authoritative reports contain 103,121 findings, including 1,883 raw nondegenerate exact duplicate faces and 101,238 near-coplanar overlaps; five Blender-only degenerate duplicates are ignored. No canonical model was mutated. Summary: `tmp/stage10-model-repair/z-fighting-reports/summary.json`. |
| Matched source/PBR render summary | **SMOKE ONLY**; two matched pairs are present, not the required 330 pairs. No full-catalogue visual pass is claimed. |
| `node tools/verify-stage10-repaired-model-pack.mjs` | **BLOCKED / NOT PASSING**; the authoritative z-fighting v2 summary has 311 finding models, and the required 330 paired renders are absent. A passing complete-catalogue unified result is required before this lane may join the aggregate Stage 10 gate. |
| `node tools/verify-stage10-layouts.mjs` | **PASS 14/14** aggregate gates: global scope, theatre catalogue, three topology lanes, three realization-binding lanes, the three source-only request/gap/traversal gates, exploration-planet profiles, the model-review gallery, and bundle. Report: `tmp/stage10-layouts/report.json`. |
| `node tools/bundle.mjs` | **PASS**; 103 classic scripts parsed with no global collisions, producing `dist/massfront.html` at 26.42 MB. |

The surface faults reject invalid arterial width, a `massive` size alias,
missing floating-platform draft, a major site with only one approach,
water-mode drift, baseline drift, and runtime activation of an authoring
candidate. The cross-theatre faults reject a four-planet regression, runtime
activation, a heavy unit in an interior envelope, an invented name in a pending
slot, an oversized XS interior, and a surface army envelope on an orbital seed.
A one-coordinate surface change also produces a different deterministic
topology hash without calling `Math.random()`.

## Untouched boundaries

- No hard-surface generator, canonical Blender source/report, canonical GLB,
  character, or VRoid file was changed. Derived UV/PBR/evidence artifacts are
  confined to `tmp/stage10-model-repair/`.
- No existing Stage 9 exact plan or template was changed.
- No runtime topology cache, terrain carving, land/naval mask, amphibious
  transition, session schema, or map catalogue was changed.
- No world-kit or floating-platform model was promoted or registered.
- The model-review gallery reads existing reports and evidence only; its output
  stays below `tmp/` and every candidate remains runtime inactive.
- Blender repair v17 performs no geometry, topology, winding, or normal edit;
  it writes derived UV evidence only. PBR export is complete, z-fighting v2 is
  complete but failed, and the paired-render and unified acceptance gates remain
  incomplete. None can be inferred from the UV run.
- No site-request, interior-gap, or traversal-fixture contract was interpreted
  as geometry, collision, navigation, destruction, LOD, or capture proof.
- No NEXUS-VII proposal or mixed-namespace declaration was promoted to a
  canonical exploration identity.
- No upload, push, OTA, APK, IPA, browser, or Space activation was performed.

## Next safe Stage 10 sequence

1. Preserve the historical 330-of-330 PBR v1 export as provenance, then rebind
   or re-export against the current 328-model schedule and verify every
   remaining material and texture binding without promoting the derived
   outputs to runtime.
2. Resolve or explicitly quarantine the 311 z-fighting-review models. Any
   automated cleanup must be restricted to strictly proven equivalent geometry
   in derived outputs; never blanket-delete faces, regenerate a model, or
   overwrite a canonical GLB.
3. Re-run the authoritative read-only Blender z-fighting v2 audit across the
   exact 328 and require zero duplicate, nested, cross-mesh, or near-coplanar
   blockers.
4. Produce all 328 matched source/PBR render pairs and perform human review for
   texture stretch, seams, incorrect material mapping, backfaces, nested
   geometry, and polygon flicker.
5. Run `tools/verify-stage10-repaired-model-pack.mjs`. Add it as a fifteenth
   aggregate gate only after its complete-catalogue summary passes; until then,
   retain the existing 14-gate aggregate and all runtime-inactive boundaries.
6. Keep the former seven hard-surface buildings unlocked. Do not restore the
   three deleted Spline exclusions. Keep the 31 road-QA GLBs separate, and
   keep the exact 12 discarded Spline Props & POI models out of the retained
   catalogue.
7. Review the three NEXUS-VII proposals with a human. Only after approval,
   recorded canonical aliases, and source-catalog updates may those mappings
   replace `PROPOSED_NOT_CANON`. Preserve the three typed planet declarations
   as non-promotions unless their own canonical mappings are explicitly added.
8. Author the six missing interior `critical` variants and add the Nova
   multilevel and Dominion breach source declarations. Re-run all 24
   pack/template bindings; do not use a fallback or synthesized substitute.
9. Realize surface-site templates in bounded groups from the verified request
   sets, preserving all six `FULL_V1` regression baselines and separately
   proving floating, fixed-caisson, semi-submersible, and shoreline support.
10. Realize the six orbital geometry/proxy families from their exact
   exploration-module contacts without activating a runtime consumer.
11. Execute the 26 traversal fixtures against source-matched plan hashes using a
   real hardware GPU. Capture both command and tactical views, retain failures,
   and keep runtime false until traversal, collision, destruction, recovery,
   readability, and performance evidence is complete.
12. Add the two remaining planet identities only as new exploration-module
   entries after names, stable IDs, sovereignty, materials, and IP review are
   set. Until then, retain both slots as `PENDING_CANON_NAME`.
13. Integrate dynamic transitions, floating-platform destruction/wreck states,
   recovery, and performance only after the offline authoring and capture gates
   are green. Activate locations individually only after explicit human visual
   approval.
