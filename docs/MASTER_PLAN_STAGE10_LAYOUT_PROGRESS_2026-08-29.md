# MASSFRONT master plan — Stage 10 layout implementation progress · 2026-08-29

Status: **IMPLEMENTATION FOUNDATION IN PROGRESS**. The preparation package is
committed at `51329e9`. This slice adds the first source-bound
`BattlefieldTopologyV2` authoring candidate and its fail-closed verifier. It
does not activate an unfinished topology, register world-kit GLBs, change
pathfinding, launch Blender, or touch character/VRoid work.

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

## First standard-map authoring candidate

`aelos_north_medium` establishes the first Wave 1 topology foundation for the
2.6 km Civic Grid theatre:

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
| `node tools/verify-stage10-battlefield-topology.mjs` | **PASS 19/19**; deterministic topology hash, catalogue/loader order, route hierarchy, floating-platform contract, inert pending maps, and six injected fail-closed faults. Report: `tmp/stage10-topology/report.json`. |
| `node tools/bundle.mjs` | **PASS**; 100 classic scripts parsed with no global collisions, producing `dist/massfront.html` at 26.32 MB. |

The injected faults reject invalid arterial width, a `massive` size alias,
missing floating-platform draft, a major site with only one approach, water-mode
drift, and runtime activation of an authoring candidate. A one-coordinate
semantic change also produces a different deterministic topology hash without
calling `Math.random()`.

## Untouched boundaries

- No hard-surface generator, Blender source/report, GLB, character, or VRoid
  file was changed.
- No existing Stage 9 exact plan or template was changed.
- No runtime topology cache, terrain carving, land/naval mask, amphibious
  transition, session schema, or map catalogue was changed.
- No world-kit or floating-platform model was promoted or registered.
- No upload, push, OTA, APK, IPA, browser, or Space activation was performed.

## Next safe Stage 10 sequence

1. Author and preflight the remaining fifteen Wave 1 standard-map topology
   candidates using each region's water, hazard, elevation, and faction rules.
2. Add exact site requests/templates in bounded groups, preserving the six
   Stage 9 `FULL_V1` regression baselines.
3. Add topology realization and traversal fixtures before connecting any plan
   to terrain generation or cache identity.
4. Integrate dynamic transitions, floating-platform destruction/wreck states,
   recovery, and performance only after those offline gates are green.
5. Activate maps individually after matched command/tactical captures and
   explicit human visual approval.
