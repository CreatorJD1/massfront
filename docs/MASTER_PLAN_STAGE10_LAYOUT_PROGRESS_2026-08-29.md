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
| Planet catalogue | Eight approved planet slots; six identities match the authored exploration showcase and two remain deliberately unnamed | Defined by each location, never inferred globally |
| Interior tactical | Four source-matched XS/Small templates across six planned 15-piece location packs | Infantry-only branches or infantry + small vehicle + light-mech routes |
| Orbital / outer-space locations | Six source-matched station, logistics-array, derelict, debris-field, and gate seeds | Infantry boarding or small craft only |

The older `galaxy_data.js` prototype also contains eight planet records, but it
is reference-only and is not identity authority. Stage 10 does not silently
promote those old names. The two remaining approved planet identities stay
`PENDING_CANON_NAME` until a canonical local source or explicit direction names
them.

`assets/data/theatreprofiles-stage10.js` fails closed if a restricted interior
profile admits heavy vehicles, heavy mechs, artillery, aircraft, naval units,
titans, or capital ships. Its XS bounds stop at 48 m and Small bounds stop at
80 m. The existing source contract's 6.4 m mixed route supports infantry, one
small vehicle, and light-mech-scale movement; narrower branches can be
infantry-only.

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
| `node tools/verify-stage10-theatre-catalog.mjs` | **PASS 16/16**; eight approved planet slots, six source-matched identities, two pending names, four source-matched interior templates, six inert interior packs, restricted unit envelopes, six source-matched orbital seeds, loader registration, and six injected faults. Report: `tmp/stage10-theatres/report.json`. |
| `node tools/bundle.mjs` | **PASS**; 101 classic scripts parsed with no global collisions, producing `dist/massfront.html` at 26.35 MB. |

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

1. Confirm the two still-unnamed planet identities from canonical local source
   or explicit direction; do not borrow names from the legacy prototype.
2. Add exact site requests/templates in bounded groups, preserving the six
   Stage 9 `FULL_V1` regression baselines.
3. Author XS/Small interior and orbital location layouts against their explicit
   unit envelope; never inherit the combined-arms surface roster.
4. Add topology realization and traversal fixtures before connecting any plan
   to terrain generation or cache identity.
5. Integrate dynamic transitions, floating-platform destruction/wreck states,
   recovery, and performance only after those offline gates are green.
6. Activate maps individually after matched command/tactical captures and
   explicit human visual approval.
