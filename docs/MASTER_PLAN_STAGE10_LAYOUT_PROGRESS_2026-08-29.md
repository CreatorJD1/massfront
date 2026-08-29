# MASSFRONT master plan — Stage 10 layout implementation progress · 2026-08-29

Status: **IMPLEMENTATION FOUNDATION IN PROGRESS**. The preparation package is
committed at `51329e9`. The first implementation package is committed at
`56f9ca5`. This slice expands the source-bound `BattlefieldTopologyV2` surface
wave and adds the separate `Stage10TheatreCatalogV1` contract for the complete
eight-planet, interior, and orbital scope. It does not activate unfinished
topology, register world-kit GLBs, change pathfinding, launch Blender, or touch
character/VRoid work.

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

## Verification

| Command | Result |
|---|---|
| `node tools/verify-stage10-battlefield-topology.mjs` | **PASS 24/24**; all 16 Standard candidates, 16 distinct profiles and topology hashes, six `FULL_V1` baselines, four floating sites, route and approach gates, and injected fail-closed faults. Report: `tmp/stage10-topology/report.json`. |
| `node tools/verify-stage10-theatre-catalog.mjs` | **PASS 16/16**; eight target planet slots, the exploration-module authority, six source-matched identities, two reserved names, four source-matched interior templates, six inert interior packs, restricted unit envelopes, six source-matched orbital seeds, loader registration, and six injected faults. Report: `tmp/stage10-theatres/report.json`. |
| `node tools/verify-stage10-interior-topology.mjs` | **PASS**; four exact templates and 18 injected fail-closed faults. Report: `tmp/stage10-interior-topology/verification.json`. |
| `node tools/verify-stage10-orbital-topology.mjs` | **PASS 29/29**; six source-matched layouts, distinct stable hashes, zero random calls, recovery gates, loader registration, and 13 injected faults. Report: `tmp/stage10-orbital-topology/report.json`. |
| `node tools/verify-stage10-layouts.mjs` | **PASS 6/6** aggregate gates: global scope, theatre catalogue, surface, interior, orbital, and bundle. Report: `tmp/stage10-layouts/report.json`. |
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

- No hard-surface generator, Blender source/report, GLB, character, or VRoid
  file was changed.
- No existing Stage 9 exact plan or template was changed.
- No runtime topology cache, terrain carving, land/naval mask, amphibious
  transition, session schema, or map catalogue was changed.
- No world-kit or floating-platform model was promoted or registered.
- No upload, push, OTA, APK, IPA, browser, or Space activation was performed.

## Next safe Stage 10 sequence

1. Add the two remaining planet identities as new exploration-module entries
   only after names, stable IDs, sovereignty, materials, and IP review are set.
2. Bind the six planned interior packs to the four topology families through
   source-only assembly requests, preserving per-location faction identity.
3. Bind orbital geometry requests to the six source-matched topology seeds
   without activating a runtime consumer.
4. Add exact surface site requests/templates in bounded groups, preserving the six
   Stage 9 `FULL_V1` regression baselines.
5. Add topology realization and traversal fixtures before connecting any plan
   to terrain generation or cache identity.
6. Integrate dynamic transitions, floating-platform destruction/wreck states,
   recovery, and performance only after those offline gates are green.
7. Activate maps individually after matched command/tactical captures and
   explicit human visual approval.
