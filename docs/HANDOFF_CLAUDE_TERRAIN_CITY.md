# MASSFRONT — Claude Handoff: Road, City and Terrain System

**Updated:** 2026-08-11  
**Scope:** city infrastructure, terrain contact, road topology, civic material
quality and destruction. This is a focused continuation note; read
`AGENTS.md`, `docs/HANDOFF.md` and `docs/TERRAIN_CITY_NEXT_PASS.md` before
editing source.

## The player’s actual complaint

This is **not** a request for another road texture or a wider blur/stamp.

The player has repeatedly identified a specific architectural failure: a
separate world/macro highway runs under or through an otherwise valid city,
including building pads and the local civic-road network. In the supplied phone
captures it is the vertical/upper-right route; it is not the centred civic
crossing. Earlier passes repeatedly fixed the civic junction or its paint while
leaving that world route alive, which made the fix appear to target the wrong
thing.

The required result is an RTS city that explains itself:

- world highways approach a named city gate, bridge head, interchange, freight
  yard, or the map edge;
- city streets end at real intersections, driveways or end-cap/barricade
  modules—not square plates or arbitrary grass endpoints;
- roads never pass beneath structures, hardstands, sidewalks or an unrelated
  city block;
- building plots have deliberate, flattened concrete hardstands with a short
  driveway/frontage connection;
- terrain is a compacted subgrade and edge blend beneath the physical meshes,
  never a second full-width asphalt ribbon beneath them;
- civilian/military buildings, road signs, lamps and ad boards align to the
  route/frontage rather than being scattered independently.

Visual target: **brutalist cyberpunk / military infrastructure with C&C3-style
readability**. It must remain readable at the mobile RTS camera, not pursue
photorealism or a giant global 4K terrain allocation.

## Important capture clarification — do not misdiagnose this as a release regression

Claude previously showed a dark, nearly untextured cloud/headless screenshot
and called it a regression. That capture had staged the code/CSS but **not**
the large texture/material asset pack. Its plain dark roads and black ground
scars were therefore a render-harness missing-assets artefact, not evidence
that the Android/Web release shipped those materials.

Current local staging verification (2026-08-11):

| Location | Texture files | Bytes |
|---|---:|---:|
| `assets/textures` source | 553 | 38,519,780 |
| `www/assets/textures` staged web build | 553 | 38,519,780 |
| Android public directory before sync | 552 | 35,315,965 |

The Android count/size is stale until `npx cap sync android` is run. Do not use
it to judge the current web staging state. Before any Android visual claim run:

```powershell
node tools/bundle.mjs
node tools/pack-www.mjs
npx cap sync android
```

For web/headless visual QA, serve `www/` and use an uncached URL/new browser
context. `boot.js` currently uses the release revision as its cache query, so
using the same revision after a source edit can show an old cached shader. A
new release must advance the normal version/revision process; do not hand-edit
the live updater manifest during this terrain work.

One genuine source issue was found independently during verification:
`src/engine/mesh.js` used `vMapUV` in the model vertex shader without declaring
the varying. It now declares `out vec2 vUV; out vec2 vMapUV;`. A fresh
uncached local renderer load has no shader errors. Keep that declaration;
removing it causes a model-program compile/link failure.

## Current implemented terrain/city state — verified, not proposed

### Planner and data products

`src/game/sim.js` owns the city planning state:

- `cityZones`, `cityPlan`, `cityStreets` — legacy district inputs;
- `cityRoadEdges`, `cityRoadModules`, `cityRoadJunctions` — clipped tactical
  civic route output;
- `cityBuildPads` and `cityDriveways` — building ground-contact/frontage;
- `CITYG` at `CITY_RES=1024` — placement/occupancy field;
- `footOnCityRoad()` — city-road placement check;
- `applyGroundDestruction()` — shared terrain-impact contract.

`src/engine/gl.js` owns terrain and macro-road outputs:

- `worldRoadSegments` emitted by `buildRoads()`;
- `paintRoadLand()` / `paintCityGround()` for the far-LOD terrain material;
- `PAVE_RES=TS` (2048) for the paving/foundation mask;
- civic/world route influence on ground/paving paths.

`src/engine/models-civic.js` supplies the shallow instanced road, curb,
sidewalk, junction, hardstand and driveway meshes. `src/ui/render3d.js`
renders their planned data before civic structures/shadows. World Structures V2
already routes material semantic ids for wall, roof, glass/window, shopfront /
door and signboard where the model actually supplies them.

### Existing safeguards

`planCityInfrastructure()` cuts civic edge modules back before a junction
core. `paintCityGround()` and `paintRoadLand()` were changed to consume clipped
`cityRoadModules`, rather than paint the uncut `cityStreets` tuple. This avoided
the original second civic-road ribbon below a correctly clipped 3D road.

`tools/test-city-terrain-integration.mjs` currently passes with:

```text
road/plot overlaps              0
missing frontage                0
module/junction overlaps        0
highway/city intrusions         0
hardstands == city plots        true
road-connected city display     true
World V2 ready                  true
```

That is a valuable baseline, but it is **not enough to prove the phone issue
is impossible**. The macro-highway check is still too coarse: it compares a
world segment against a circular city-zone envelope. It must become an exact
clearance test against every padded build pad, building OBB, driveway, junction
and planned gate. A route can be clear of the zone centre yet visibly cut a
peripheral building/road.

## Why the reported road can still exist

Do not attempt another material-only fix. These are the current structural
causes documented in `docs/TERRAIN_CITY_NEXT_PASS.md`:

1. **Macro highway and civic infrastructure are separate authorities.**
   `worldRoadSegments` is not fully represented in `CITYG`,
   `footOnCityRoad()` or the exact civic-paving exclusions.
2. **Macro clipping uses a radial city envelope.** It does not know the actual
   outer hardstands/building OBBs.
3. **Macro routes end at a radial perimeter point.** They are not attached to
   a named gate, arterial endpoint, bridge head or freight yard.
4. **Intersections are too generic.** A generic cross/junction mesh cannot
   communicate an end cap, T, corner, gate or bridge approach.
5. **Road state has split ownership.** Legacy route seed, tactical meshes,
   raster movement masks and paving/destruction can diverge if a future change
   consumes one source but not the resolved road output.

## Non-negotiable next implementation sequence

### Stage 0 — prevent physical conflicts first

Build a deterministic, map-local `InfrastructureGraph` or equivalent resolver
after districts are planned. It must contain:

```text
nodes: gate | corner | T | cross | bridge-head | freight-yard | end-cap
edges: highway | arterial | service | driveway | bridge
parcels: hardstands, building OBBs, plazas, utility yards
clearance: deck + curb + sidewalk + vehicle turning envelope
state: intact | damaged | blocked | destroyed
```

Add an exact footprint/OBB spatial query (hash/grid is sufficient) and make it
the only road conflict query for:

- macro highway routing;
- player building placement before `makeFoundation()`;
- hardstand/driveway generation;
- terrain and pavement mask construction;
- road damage/destruction;
- ad-board, lamp and sign placement.

Carrier deployment and combat are the only explicit exceptions: they must use
an impact/damage API, not silently pave an intact road.

**Acceptance additions to `tools/test-city-terrain-integration.mjs`:**

- zero macro-edge vs padded building OBB/build-pad/driveway conflicts;
- every world-road endpoint reaches a named gate or map boundary;
- a normal foundation rejects both city and world roads;
- an allowed carrier-impact profile damages exactly the intersected route
  elements, and nothing else;
- no hidden second terrain paint strip outside the graph edge footprint.

### Stage 1 — make world roads meaningful on each map

Replace circular/radial route endings with per-map road metadata:

- entry edge and intended exit;
- named city gate/checkpoint or industrial freight connection;
- bridge/interchange/freight intent;
- controlled bends and landmark ties.

Procedural code may fill local wear/props, but it must not invent a random
diagonal highway through a city. World roads should terminate at the map edge
or connect through a visible, reserved ingress parcel and short arterial.

### Stage 2 — topology-specific modules, no square filler plates

Resolve graph topology into instanced physical modules:

- straight (28/56/68 m), corner, T and cross;
- end-cap/barricaded ruined end;
- gate/checkpoint and turning apron;
- bridge head/deck;
- industrial freight apron;
- driveway threshold.

Edges stop at their owning node boundary. A node owns its junction footprint.
Never place a second slab through that footprint. The physical mesh must have
carriageway, gutter, curb, sidewalk/paver strip and a terrain-facing skirt.

### Stage 3 — ground composition and city contact

Keep the 256 terrain grid and 2048 paint field; do **not** blindly make the
whole map 4K. Build composited masks from the resolved graph:

- biome base;
- compacted district subgrade;
- asphalt/concrete deck;
- sidewalk, driveway and hardstand;
- restrained terrain edge wear;
- crater/scorch/destruction state.

Use bounded high-detail terrain patches only around visible cities, gates,
bridges and player bases. Their outer ring must sample the base terrain exactly
to avoid z-fighting/seams. Grassy terrain must not wash across city blocks; the
city uses compacted concrete/soil around hardstands with grass only in intended
verges/parks.

### Stage 4 — visual and model material work

The World V2 fallback can only approximate doors/windows when a model lacks
semantic faces. For actual quality:

- export city buildings with `BUILD`, `ROOF`, `GLASS`, `DOOR/SHOPFRONT`,
  `SIGNBOARD`, `LAMP`, `GREEBLE`, `TRIM` face-material IDs;
- retain their IDs through the V2 route (`vSurface`), never apply one generic
  material to every surface;
- use a matched Base+AO / Normal+Roughness / semantic-mask set for road deck,
  curb, sidewalk, driveway, building wall and roof;
- make windows/signage emissive only where intended; reduce intensity/distance
  detail to avoid mobile shimmer;
- use physical hardstands and skirts for ground contact; a height map/normal
  map cannot solve an intersecting route or a floating building alone.

### Stage 5 — unified destruction

Route every city/terrain impact through `applyGroundDestruction()` plus a new
infrastructure-state update. Buildings, city relics, roads, bridges, units and
structures must agree on crater/deformation, debris, passability, road masks,
light/sign state and salvage. Use type-specific rubble (concrete/rebar, armor,
engine, organic residue) but one physical impact contract.

## Visual / performance constraints

- Preserve shared instanced road/curb/pad meshes and material LOD.
- Build graph + spatial hash once per map, not in a render/placement hot loop.
- Sample resolved state into `ROADG` for navigation; do not pathfind over a
  high-resolution texture.
- Keep high-detail terrain patches bounded and camera/visibility culled.
- Maintain the anti-flicker guards in `src/engine/mesh.js` and
  `src/engine/materials-world-v2.js`: screen-footprint normal/detail fade,
  explicit texture gradients, no derivative-driven edge wear, no large animated
  window pulses.
- Verify at 412×915 in daytime and nighttime with actual materials staged.
- Never treat a clean console as visual proof.

## Required verification before reporting progress

```powershell
node tools/bundle.mjs
node tools/pack-www.mjs
node tools/test-city-terrain-integration.mjs http://127.0.0.1:8982/
```

Then capture a real 412×915 city view with material assets present. Inspect:

1. the exact macro highway the player circled;
2. every city entry/gate and endpoint;
3. roads beside building hardstands;
4. a T/cross/corner/end-cap (not just one centre crossing);
5. a building placement rejection on a world road;
6. a deploy/impact result with terrain, road and rubble in agreement;
7. normal/roughness visibility without texture shimmer/flicker.

Do not publish or activate an updater manifest during this work unless the
owner explicitly requests a release.

## Useful source entry points

| Responsibility | File / entry point |
|---|---|
| Civic planner and footprint data | `src/game/sim.js`: `planCityInfrastructure()`, `footOnCityRoad()`, `applyGroundDestruction()` |
| Macro road planning / terrain paint / paving | `src/engine/gl.js`: `buildRoads()`, `paintRoadLand()`, `paintCityGround()` |
| Physical civic mesh modules | `src/engine/models-civic.js` |
| Civic rendering order | `src/ui/render3d.js` |
| World V2 material semantics and anti-flicker | `src/engine/materials-world-v2.js`, `src/engine/mesh.js` |
| Current city test | `tools/test-city-terrain-integration.mjs` |
| Detailed roadmap | `docs/TERRAIN_CITY_NEXT_PASS.md` |

