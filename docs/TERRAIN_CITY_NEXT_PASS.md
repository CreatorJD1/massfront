# MASSFRONT — Terrain, City and Infrastructure Next Pass

> **Not current.** This document describes the abandoned InstMesh civic-road /
> `planCityInfrastructure()` / `applyGroundDestruction()` branch. Those APIs
> have no definitions in the recovered v1.33.31 tree. Current ownership is
> paint + masks in `sim.js` / `gl.js` / `terrain.js` / `render3d.js`, with
> city combat gated on `CITYG >= 1`. Read `docs/HANDOFF-2026-08-13.md`
> section 3.1 and "City-combat surface recovery" before editing source.
> Do not revive this plan as part of a combat or material pass.

## Scope

This is an implementation plan for the reported road-under-building, abrupt
road-end, square-junction, pasted-city and low-detail terrain failures. It is
based on the current WebGL2/mobile pipeline, not a proposal to replace it with
an engine or make the entire terrain 4K.

The visual target is **brutalist cyberpunk military infrastructure with C&C3
clarity**: roads explain how a city works, buildings own deliberate lots and
frontage, and war damage changes the same physical world players navigate.

## Current implementation — verified in source

### What is already in place

- `src/game/sim.js` plans districts before terrain shading. It has city zones,
  plotted building footprints, street frontage, `cityRoadEdges`, clipped
  `cityRoadModules`, `cityRoadJunctions`, `cityBuildPads`, driveways and curb
  lights.
- `src/engine/models-civic.js` supplies instanced shallow road, curb, sidewalk,
  junction, hardstand and driveway meshes. `src/ui/render3d.js` renders those
  from the planned data before city structures, so tactical streets are not
  merely a canvas texture.
- Terrain is a 2048×2048 paint/height field (`TS`), foundations use a matching
  2048 paving mask (`PAVE_RES=TS`), and city occupancy is a separate 1024×1024
  field (`CITY_RES`). This is already much better than the former coarse stamp.
- `planCityInfrastructure()` cuts road modules back at crossing nodes, and the
  existing phone gate checks that a road module does not run through a junction
  core. `tools/test-city-terrain-integration.mjs` also checks road/plot
  clearance, frontage, road lights and placement on a city lot.
- Building placement now samples the complete visible apron with
  `footOnCityRoad()`, and `makeFoundation()` preserves civic roads while it
  grades/paves the ground.

### Why the reported problems can still occur

1. **Macro highways are outside the civic placement contract.**
   `footOnCityRoad()` only reads `CITYG`. A normal player foundation can still
   overlap a `worldRoadSegments` highway because neither placement nor
   `cutCivicRoadsFromPaving()` queries that list.

2. **Macro-road clipping uses a circle, not actual city parcels.**
   `buildRoads()` excludes `Z.r + width*.78` around a `cityZones` centre. Outer
   plotted buildings and their `cityBuildPads` can extend beyond that radius.
   Therefore a road can legally enter a visible building/hardstand even when
   the existing `highwayCityIntrusions` test says the zone centre is clear.

3. **There is not one authoritative infrastructure graph.**
   `cityStreets` remains the legacy route input for `CITYG`, `ROADG`, and some
   terrain painting; `cityRoadModules` is the clipped tactical output;
   `worldRoadSegments` is a separate macro output; paving uses yet another
   civic-only corridor helper. Correct geometry in one layer can therefore
   leave an old visual/navigation/placement path alive in another.

4. **A macro road stops at a circular perimeter, not a real gate.**
   `buildRoads()` computes an arbitrary radial `gate` point. It does not join a
   named street endpoint, entry plaza, bridge head or freight yard. The blunt
   upper-right road end in the supplied screenshot is the expected result of
   that policy, not a material defect.

5. **Crossings are only a generic `cross` junction.**
   `mdlCivicRoadJunction()` is a square core with corner paving. It cannot
   express an end cap, T junction, bent route, gate apron or bridge approach,
   so some legal intersections still read as odd squares.

6. **Road destruction has no physical segment state.**
   `disruptTerrainRoads()` clears coarse `ROADG` cells and paints a circular
   scar, but it does not mark a `cityRoadModule` or world-road mesh as damaged.
   A route can be visually intact while its coarse navigation flag was removed,
   or the converse after a later repaint.

7. **The terrain mesh is intentionally coarse at city scale.**
   The live city test requires `TGRID >= 256`, roughly 12.5 m per terrain quad
   on the 3.2 km theatre. The 2048 terrain texture can look sharp, but that
   base mesh cannot by itself give a road shoulder, hardstand edge, curb and
   building apron continuous physical relief. Raising the entire terrain stack
   to 4096 would multiply height/canvas/texture memory by four and is not a
   safe mobile solution.

## Design decision: one infrastructure authority

Add one deterministic, map-local data product after district planning:

```text
InfrastructureGraph
  nodes: gate | straight-join | corner | T | cross | bridge-head | freight-yard
  edges: highway | arterial | service | driveway | bridge
  parcels: city hardstands, building OBBs, plazas, utility yards
  clearance: road deck + curb + sidewalk + vehicle turning envelope
  state: intact | damaged | blocked | destroyed
```

Every consumer must be derived from this graph:

| Consumer | Must use |
|---|---|
| Tactical road meshes | resolved graph modules/nodes |
| Terrain compacted subgrade and material masks | resolved graph geometry |
| `ROADG` movement bonus | graph edge coverage, sampled into the coarse grid |
| `CITYG` placement/prop rules | parcels and graph clearance, not raw strokes |
| Player placement | exact infrastructure query including world highways |
| City lamps, signs and displays | legal frontage/gate nodes |
| Destruction and debris | graph segment state and footprint |
| Minimap/map preview | the same graph, at far LOD |

`cityStreets` can remain a seed/planning input temporarily, but must cease to
be a separate rendered or collidable source after the graph resolves.

## Staged implementation

### Stage 0 — make the current failure impossible (regression gate)

1. Add a shared `infrastructureAtFootprint()` / `infrastructureIntersectsOBB()`
   query backed by a simple per-map spatial hash.
2. Make it include civic road modules, junctions, driveways, city pads,
   `worldRoadSegments`, bridge decks and future gates.
3. Use it in player placement before `makeFoundation()`; a normal foundation
   must reject an intact route rather than paint over it. Carrier impacts keep
   their intentional destruction exception through a dedicated impact API.
4. Replace the current radial-only world-road assertion with exact tests
   against padded `cityBuildPads`/building OBBs and road clearances.
5. Add a gate assertion: a world-road endpoint must touch an authored gate or
   terminate at the map edge; it may not stop in an open district buffer.

**Files:** `src/game/sim.js`, `src/engine/gl.js`,
`tools/test-city-terrain-integration.mjs`.

**Acceptance:** zero macro-road/build-pad intersections on every map seed;
zero player-foundation/infrastructure overlaps; no unconnected world-road end
inside a district.

### Stage 1 — resolve real city ingress before drawing roads

1. Replace the circular `gateToward()` termination in `buildRoads()` with
   named, deterministic ingress nodes selected from the nearest compatible
   arterial endpoint or authored freight-yard edge.
2. Extend `MF_ROAD_LAYOUTS` from `approaches + kind` to per-map route metadata:
   entry edge, city gate class, bridge/interchange/freight intent, allowed
   bends, and optional landmark ties. Do not use random map-spanning diagonals.
3. Make city planning reserve perimeter ingress parcels before placing outer
   buildings. Gates own a turning apron and a short guarded connector into the
   city arterial.
4. Add per-map authored overrides only where they matter: bridges, choke
   gates, refinery freight approaches and military checkpoints. Procedural
   rules fill local detail, never strategic topology.

**Files:** primarily `src/game/sim.js` (planning) and `src/engine/gl.js`
(`MF_ROAD_LAYOUTS`/macro generation).

**Acceptance:** each highway visually explains where traffic enters a city;
there are no road ribbons entering a building, grass courtyard or unrelated
sidewalk.

### Stage 2 — topology-specific road geometry

Replace the generic road-plus-square-junction treatment with instanced modules:

- straight: 28/56/68 m variants
- low-speed end cap / barricaded ruined end
- left/right corner
- T junction
- cross junction
- gate/checkpoint
- bridge head and raised bridge deck
- industrial loading/freight apron
- driveway threshold

The graph owns the core footprint at every node; adjoining edge modules stop
at the node boundary. No overlay may draw a second slab through that footprint.
Each module is shallow, has a carriageway, gutter, curb, sidewalk/paver strip
and terrain-facing skirt. Keep the current `InstMesh` batching model; choose a
module mesh per node/edge type rather than adding one draw per road.

**Files:** `src/engine/models-civic.js`, `src/ui/render3d.js` plus the graph
resolver in `src/game/sim.js`.

**Acceptance:** all intersections visually read as actual intersections at
412×915; no square plate, doubled curb or floating road sheet is visible.

### Stage 3 — non-destructive terrain surface layers

The current terrain canvas is a useful far-LOD/output surface, but direct
canvas strokes cannot remain the authoritative city data. Keep its 2048
resolution and introduce composited masks:

- biome/base terrain
- compacted district subgrade
- asphalt/concrete deck
- sidewalk/driveway/hardstand
- terrain blend/edge wear
- scorch, crater and destruction state

Generate masks from `InfrastructureGraph` SDF/footprints, then composite the
terrain output from those masks. Author matched road, curb, sidewalk and
driveway Base/AO + Normal/Roughness surface packs; let close-range materials
provide aggregate, cracks and roughness while the graph provides the silhouette.

This preserves the V2 principle: quiet broad ground, concentrated detail at
curbs, joints, entrances, damaged edges and service hardware. It also stops a
later repave/deform from inventing a second hidden road because state is stored
as masks, not an accumulated sequence of strokes.

**Files:** `src/engine/gl.js`; material assets; only add a shader input if the
existing terrain pass cannot compose the masks on CPU without a regression.

**Acceptance:** roads and pads blend into terrain without a dark rectangle;
at tactical zoom they retain sharp material normal/roughness response without
shimmering or a cartoon outline.

### Stage 4 — local high-resolution terrain patches, not global 4K terrain

Keep the 256-grid terrain as the strategic base. After district planning,
allocate a bounded set of stitched high-resolution terrain tiles around visible
cities, gates, bridges and player bases. The tile outer ring samples the base
grid exactly; its interior samples `heightF` at finer density. Render base
terrain only outside a tile and provide a skirt/weld ring at the boundary, so
there is no coplanar z-fighting.

Recommended limits:

- Raise `CITY_RES` to 2048 only after Stage 0, matching the existing terrain
  texture's 1.56 m city/placement precision (a 4 MB Uint8 field).
- Use fixed-size high-detail terrain chunks with a strict maximum active count,
  not a full-map 4096 height/texture/canvas stack.
- Update only dirty chunks after foundations, craters and carrier impacts.
- Keep material/geometry LOD: near city patches get high-detail curb/ground;
  far city terrain uses the 2048 composited terrain plus instanced silhouettes.

**Files:** `src/engine/mesh.js` / terrain mesh ownership, `src/engine/gl.js`,
`src/ui/render3d.js`.

**Acceptance:** medium and small vehicles sit at believable scale beside roads;
building hardstands, curbs and terrain have continuous physical contact; no
global mobile-memory spike.

### Stage 5 — stateful destruction and reconstruction

Replace `disruptTerrainRoads()` as the authority with
`applyInfrastructureDamage(footprint, profile)`:

1. Find graph modules/parcels by exact impact footprint.
2. Mark them `damaged`, `blocked` or `destroyed` deterministically.
3. Update tactical mesh material/mesh variant, coarse `ROADG`, terrain masks,
   passability, city light/sign state and salvage/debris from that one change.
4. Use class-specific rubble: concrete/rebar for civic blocks, armour/engine
   pieces for military structures, vehicle hull parts and organic residue for
   Brood objects.
5. Carrier landings are an explicit impact profile: circular/irregular crush
   area, destroyed nearby neutral blocks and damaged road modules—never a
   rectangular foundation stamp.

**Files:** `src/game/sim.js`, `src/engine/gl.js`, `src/ui/render3d.js`.

**Acceptance:** a destroyed route visibly, mechanically and economically
changes together; later terrain repaints never resurrect the old intact road.

### Stage 6 — map-authored infrastructure packs

Create small authored infrastructure recipes per planet/region:

- **Aelos:** overgrown checkpoints, drainage, civilian arterial and river
  bridge approaches.
- **Pyraeth:** reinforced ash freight lines, cooling culverts and blast gates.
- **Nordhall:** snow-buried plough lanes, ice bridges and vault checkpoints.
- **Vespera:** solar-road conduits, elevated relay ramps and refinery loading
  yards.

Each map receives only the strategic features named in its metadata. The
procedural generator may choose wear/props/route variants inside an authored
envelope, but it must not invent a random highway that contradicts the map.

## Mobile performance contract

- Keep road, sidewalk, hardstand and prop variants in shared instanced meshes.
- Build graph and spatial hash once per match/map; do not scan every road in
  the hot placement or render loop.
- Sample graph state into existing coarse `ROADG` for movement; do not make AI
  pathfind against the high-resolution texture.
- Keep physical terrain patches bounded, camera/visibility culled and dirty
  only on nearby impacts.
- Preserve current terrain/material LOD and the V2 anti-flicker guards.
- Validate at 412×915 and in a representative base/combat scene, not an empty
  city capture alone.

## Required expanded regression capture

Extend `tools/test-city-terrain-integration.mjs` with at least:

1. world road vs every city hardstand/OBB clearance;
2. placement rejection on civic, macro and bridge road surfaces;
3. approved carrier impact removes/damages exactly intersected modules;
4. gate endpoint attachment and no in-district dead road ends;
5. every junction has exactly one owning node mesh and no edge overlap;
6. one city on a slope, one industrial district and one water/bridge map;
7. 412×915 day and night screenshots with no UI/fog masking the evidence.

## Order of execution

Do Stage 0 first. It fixes the functional road-under-building bug without
waiting for art. Then Stage 1 and Stage 2 establish credible map topology and
visible intersections. Stage 3 and Stage 4 improve close-range material and
physical ground quality without endangering army scale. Stage 5 makes the
system survive combat. Stage 6 adds the authored C&C3-style regional identity.

Do not claim C&C3-quality map infrastructure until Stages 0–3 pass on phone;
the current work is a solid V2 foundation, but its remaining issue is shared
world-state ownership rather than another road texture overlay.
