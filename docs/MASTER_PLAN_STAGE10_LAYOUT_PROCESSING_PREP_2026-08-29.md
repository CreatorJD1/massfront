# MASSFRONT Stage 10 layout-processing preparation — 2026-08-29

Status: **PREPARATION ONLY**. This pass inventories and routes future layout
work. The **334-module report-backed world-kit subset** is a tools/generator
library whose 327 eligible pieces become grammar inputs for believable POI and
world layouts—not a direct asset dump. It is not the whole model pack. UGA ship
exterior, ship-section/interior, and interior-decal sources are separate role
domains with different count bases and gates. This pass does not register
assets, change runtime source, launch Blender, edit Stage 9, touch
characters/VRoid, push, or upload anything. Only this preparation document and
its machine-readable companion are eligible for a focused Local documentation
commit.

The canonical tracked machine-readable companion is
`docs/MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_MANIFEST_2026-08-29.json`. It
contains the complete per-map world-layout lane and world-kit-family mapping,
role-specific UGA source routing, source hashes, topology-reference contract,
region rows, existing FULL_V1 request summaries, and the module quarantine.
The original `design/stage10-layout-processing-manifest.json` file is an
ignored generation scratch copy only. The tracked manifest now carries the
controlling generator-library intent and may deliberately advance beyond that
scratch input; the ignored copy must not be force-added or used in place of the
tracked `docs/` artifact.

## Correction and controlling boundary

The six Stage 9 FULL_V1 maps are **included** in this preparation. The earlier
interpretation that they should be excluded was incorrect. All 48 advertised
campaign maps—four planets, sixteen regions, and three sizes per region—are
Stage 10 layout/design improvement targets.

The existing FULL_V1 maps are regression baselines, not exclusions:

| Map | Existing exact sites | Stage 10 policy |
|---|---|---|
| `pyraeth_caldera_medium` | 2 city | Improve only while preserving or deliberately versioning its exact requests, topology, stable IDs, determinism, traversal, recovery, and visual baseline. |
| `nordhall_frost_medium` | 1 outpost, 1 relic | Same baseline-preserving policy. |
| `pyraeth_flats_medium` | 2 spaceport, 1 derelict | Same baseline-preserving policy. |
| `aelos_basin_medium` | 2 colony, 2 refinery | Same baseline-preserving policy. |
| `aelos_coast_medium` | 2 base | Same baseline-preserving policy. |
| `vespera_refinery_medium` | 1 ruin, 2 Brood | Same baseline-preserving policy. |

## Role/domain correction

The world-kit reports and UGA ship sources must not be pooled into one module
count or one generator vocabulary. A similar word such as “panel,” “marking,”
“platform,” “corridor,” or “hull” is not evidence that an asset can cross from
one consumer domain to another.

| Role | Authoritative input | Count basis and current state | Allowed purpose |
|---|---|---|---|
| `world_poi_layout_kit` | Ten report-backed families below `assets/source/blender/world-kits/` | 334 modules; 327 world-layout eligible; seven visually quarantined; zero runtime-ready | Offline planet, region, battlefield, colony, city, district, outpost, industrial, derelict, road, access, and surface-marking grammar |
| `world_maritime_seaplatform` | Fixed offshore world kits, live procedural water buildings, and user-declared additional floating-platform sources | 18 fixed-caisson `mf-superstructure-v1` modules already included in the 334 total; runtime `harbor`/`seafort` are separate type keys; additional floating model sources still need exact mapping | Floating or seabed-supported city platforms, offshore industry, sea colonies/outposts, naval logistics, ocean defense, shoreline links, and archipelago POIs |
| `uga_ship_exterior_hull_design` | `nexus-vii-civilization-ship.blend` and `build_uga_assets.py` | 94 mesh objects, 14,396 triangles, six materials; runtime model exists, but no Stage 10 promotion is authorized | Nexus VII exterior silhouette, hull sections, wings, gravity frames, command ridge, armor rails, and exterior material review |
| `uga_ship_interior_section_design` | `uga-command-cutaway.blend`, Nexus VII concept manifest, and eleven-district prompt-guide index | 911 mesh objects, 39,912 triangles, 34 materials, eleven districts; one authored scene, not a proven reusable room kit | Ship decks, districts, pressure corridors, hangars, navigation, mission, science, engineering, civic, medical, diplomatic, and logistics sections |
| `uga_ship_interior_decal_marking` | `nexus-vii-material-decal-manifest.json` | 18 planned physical bases, eight planned trim sheets, eight planned decal atlases; all source-only and unbound | UGA/NEXUS-VII and resident-faction interior identity, deck identity, construction state, wear story, and static displays |
| `legacy_or_reference_only` | `uga-civilization-ark.blend` | 76 mesh objects, 8,828 triangles, four materials; stale and unreferenced | Quarantined comparison/reference only |

The interior decal contract explicitly forbids `uga-hull` and `exterior_hull`
binding. It is therefore not an approved exterior livery sheet. Exterior UGA
hull markings remain a separate authoring and acceptance lane. Likewise,
`uga-city-architecture-*` names ship-interior district materials; they are not
evidence that those textures belong to battlefield cities. Character sources
remain a third excluded lane.

Counts stay inside their own basis: world-kit modules, ship mesh objects,
planned atlases, and concepts are never summed. Each role keeps an independent
lifecycle state such as `SOURCE_CANDIDATE`, `AUTHORING_ONLY`, `QUARANTINED`, or
`RUNTIME_READY`.

### Floating sea-platform lane

Sea-platform structures are **world/maritime POIs**, not ordinary land
buildings and not `SHIP_SECTION` assets. Their support mode remains explicit:
`fixed_caisson`, `floating_pontoon`, `semi_submersible`, `shoreline_quay`,
`sea_link`, or `sea_wreck`.

The current evidence separates them cleanly:

- Eighteen `mf-superstructure-v1` modules—`platform_deck`, `platform_rig`,
  `platform_causeway`, `platform_ramp`, `platform_disc`, and `platform_spoke`
  across colonial, brutalist, and ruined styles—are fixed caisson platforms
  reaching the seabed. They are already inside the 334 world-kit count and must
  not be counted again.
- Runtime type keys `harbor` and `seafort` are genuinely floating, water-only
  procedural buildings. They are not Blender world-kit module IDs.
- The three `mf-transit-kit-v1` `edge_dock` variants are fixed shoreline
  quays/revetments, not floating platforms.
- `mf-platform-hs-v1` is a terrain-backed solid navigable deck kit with no
  draft, buoyancy, or mooring contract.
- Semi-submersible and additional layered floating-colony ideas currently exist
  only as concepts unless an exact model source is mapped. No
  `mf-seaplatform-v1` family is evidenced and none may be invented.

Exact IDs and hashes for any additional user-provided floating model-pack
pieces still need mapping. A similar name such as platform, dock, hull, deck,
or landing does not prove a support mode.

Each sea platform needs waterline, draft, freeboard, stable deck elevation,
footprint center, and an authored mooring, anchoring, seabed-support, or
stabilization model. It also needs naval-clearance envelopes, amphibious/dock
interfaces, vehicle-capable ramps/bridges/elevators where required, pedestrian
and service access, and at least two viable approaches for a major combat POI.

Gameplay uses a stable deck nav/build proxy and simple water-domain hull/support
collision independent from the render mesh. Wave motion may be visual, but it
must not move collision, route anchors, build pads, or units. Land, naval,
amphibious, and transition nodes remain explicit; supports, decorations, and
mooring lines may not silently block a declared route.

Sea-platform destruction progresses through intact, damaged, flooding or power
loss, critical, and sunk/collapsed/wrecked states. Every stage needs a
deterministic deck, access, naval-clearance, objective, and collision
transition. Wreck and rubble footprints are bounded and may not strand units or
create an unplanned permanent route lock. Promotion also requires tide/storm,
waterline, reflection, connection-tolerance, LOD/HLOD, draw-call, water-effect,
hardware-GPU, phone, and human visual gates.

Today, water buildings render at a fixed water-plane height and generic
building destruction has no water-specific sinking branch. Initial wave motion
must therefore remain visual-only with stable gameplay proxies. True buoyancy,
ballast, sinking, and wreck navigation require deliberately versioned runtime
work rather than being implied by a model animation.

### UGA ship processing lane

Accepted ship modules are assembled and baked into the canonical
`nexus-vii-civilization-ship.glb` or `uga-command-cutaway.glb`; they are not
registered individually as buildings, POIs, `SITE_TPL`, `WORLD_KIT`, or loose
runtime ship pieces. `nexus-vii` is the stable ship ID. Existing root, node,
district, focus, engine, habitat, axis, and semantic-extras contracts must be
preserved through any deliberately versioned rebuild.

Ship-section intake needs typed unique sockets, mate allowlists, pressure state,
clearance envelopes, deterministic assembly order, applied transforms, valid
winding/normals/UVs/tangents, separate simple collision, and bounded LOD,
triangle, material, draw-call, and texture budgets. It rejects overlapping or
unmatched sockets, proof geometry, nonmanifold or degenerate faces, negative
scale, material-role collapse, placeholder nodes, and fallback primitives.

Acceptance requires deterministic rebuild hashes, GLB parsing, exact runtime
identity, all eleven district/focus roots, exterior and cutaway axis agreement,
hardware-GPU exterior orbit captures, every district focus, phone portrait and
landscape evidence, and packaging/performance proof.

No operational authored-GLB livery/decal renderer currently exists;
`nightglass` is persisted data without a renderer consumer. Interior A00–A07
must pass its existing source-library validator. Exterior identity needs a new
versioned `nexus-vii-exterior-livery-v1` contract, explicit target
nodes/material slots, and a tested state-to-material binding before it can
affect the ship.

Exactly seven `mf-building-hs-v1` modules are quarantined from **all**
processing eligibility:

- `colonial_gatehouse`
- `colonial_depot_shed`
- `colonial_industrial_hall`
- `brutalist_tank_farm`
- `ruined_depot_shed`
- `ruined_tower_slab`
- `ruined_tower_spire`

These are the seven historically failing party-wall module IDs named by the
user. Their generator repair now reports all 971 numeric checks passing without
changing the checker: the same edge-class-aware footprint checks that reported
the 7/971 baseline now report 971/971. They still may not be used in layout studies, conversions,
exports, registration, or runtime work until human visual review passes and the
quarantine is explicitly released.

The eight compatibility-only MAPDEFS rows—`vanguard`, `highland`, `isles`,
`crater`, `oasis`, `ruins_reach`, `frost_reach`, and `ash_ridge`—are
not among the 48 advertised campaign maps and remain outside this package.

## World/POI procedural generator role

The 327 eligible **world-kit** pieces are a construction vocabulary for offline
procedural layout tools. A generator should select and combine them through
explicit grammar, composition, connection, and variation rules. It should not
scatter individual models across a map, treat eligibility as permission to ship
the GLBs directly, or reuse the pieces as UGA ship hull, section, or decal
content.

Every generated layout needs five coordinated layers:

1. **Modular kit grammar:** compatible sockets, scale bands, legal adjacency,
   style/condition transitions, and repetition limits.
2. **POI composition:** hierarchical settlement, colony/city district,
   industrial, derelict, outpost, defense, and landmark rules from macro shape
   through parcels, frontages, services, and dressing.
3. **Road and access connectivity:** validated road, pedestrian, service,
   assault, resource, and evacuation graphs connecting each POI entrance to
   the wider battlefield.
4. **Planet and region identity:** generator palettes and composition rules
   driven by geology, faction, climate, occupation history, hazards, and the
   role of each region rather than a generic shared settlement pattern.
5. **Believable variation and world dressing:** deterministic differences in
   layout, occupancy, wear, utilities, vegetation or infestation, and restrained
   clutter without blocking traversal, buildability, sightlines, or economy.

Generated outputs remain source candidates. Stable IDs, exact templates,
determinism, traversal, recovery, visual inspection, phone performance, and
explicit registration are still required before anything can enter runtime.

## Processing order

| Wave | Maps | Purpose |
|---|---:|---|
| 1 — standard | 16 | Establish or refine the medium exemplar for every region. Six use baseline-preserving improvement; ten need their first exact plans and templates. |
| 2 — compact | 16 | Re-author each regional grammar for short travel time, fewer landmarks, safe spawns, and restrained route branching. |
| 3 — large | 16 | Expand each regional grammar into landmark tiers, multiple fronts, long-range routes, and distributed economy without module repetition. |

No canonical map is excluded. Standard maps come first because they provide one
same-scale representative for all sixteen regions before compact and large
variants inherit the regional design language.

## Topology reference contract

The user-supplied layout sheets are **topology-only references**. They are
read-only conversational attachments: they are not copied into source, not
committed as art, not portable verification evidence, and do not authorize
texture, mesh, or composition copying. They guide future original exact-plan
and generator work through the reusable relationships they demonstrate.

The reference scale ladder is:

| Reference scale | Players | Approximate span | Required topology character |
|---|---:|---:|---|
| Small | 1v1 / 2v2 | 1.6 km | One dominant objective, short rotations, two readable main approaches, and a limited flank or amphibious bypass |
| Medium | 2v2 / 3v3 | 2.2 km | Multiple crossings and resource pockets, a contested center, and at least one route whose risk changes with the biome hazard |
| Large | 3v3 / 4v4 | 2.4 km | Several fronts, distributed colonies or derelicts, layered land/water routes, and two strategic anchors where appropriate |
| Massive | 6v6 / 8v8 | 3.0 km | Long-duration team warfare, route tiers, regional logistics, multiple objectives, and protected versus exposed resource bands |

“Massive” is a design reference, not automatic authorization to add maps or
expand the current 48-map catalogue. Every generated topology must encode
spawn/base, primary lane, flank/secondary lane, naval/water route, amphibious
landing, bridge/crossing, resources, active colony, derelict city/district,
strategic objective, destructible, and hazard layers.

The biome profiles change what creates tactical risk while preserving that
common vocabulary:

- **Vulcanis / volcanic caldera:** lava fissures and seas split fronts; forge
  passes, coolant or geothermal routes, elevated crowns, bridges, eruptions,
  vents, ash, and magma create timed access and denial states.
- **Archipelago and ice:** islands, mainland shelves, naval lanes, amphibious
  landings, and causeways create cross-domain fronts. Meltable ice bridges need
  explicit open, weakened, destroyed, and recovered traversal states.
- **Mycelis Veil / Brood:** toxic channels and living terrain split land
  movement; spore weather changes visibility; fungal canopies create ambush or
  elevation pockets; colony-growth hubs, hive cores, and heartroot objectives
  spread influence through the route graph. Brood consumes and infests
  structural substrate rather than becoming a selectable civic style.
- **Aetherion crystal highlands:** crystal ridges and plateaus control vision
  and artillery; destructible crystal barriers unlock alternate paths;
  luminous water routes, bridges, colonies, and a central citadel or crown
  produce layered contests.
- **Tempest storm coast:** storm cycles change visibility, sea state, landing
  safety, and exposure; ports, sea gates, headlands, islands, tides, and coastal
  fortifications connect naval logistics to land fronts.
- **Thornmarsh delta:** river confluences, shallow channels, boardwalks, and
  bridges define movement; mangrove canopy and reeds reduce sightlines while
  marsh attrition, bog gas, deep mud, and sinkholes punish overextension.
- **Abyssal shelf:** pressure domes, drowned colonies, reefs, escarpments, and
  broken causeways create protected and exposed shelves; hydrothermal vent
  cycles, trenches, drop-offs, and amphibious routes create timed risk.
- **Karst underworld:** pillars, cave bridges, chasms, sinkholes, tunnels, and
  unstable ledges make vertical control part of the route graph; underground
  rivers and subterranean rail provide amphibious, stealth, and logistics
  alternatives.

The implementation gate is stricter than matching the reference silhouette:
the plan must prove spawn fairness, connected land/water/service graphs,
destructible and dynamic-route state recovery, elevation and visibility rules,
buildability, traversal, economy clearance, deterministic hazard timing, and
same-seed visual readability.

### Current runtime boundary

The current campaign is exactly sixteen regions with Small, Medium, and Large
variants. Runtime presets allocate compact 2.2 km, standard 2.6 km, and large
3.2 km theatres. The reference sheets’ dimensions are design examples, not
runtime truth. In particular, `massive` is unsupported and must never alias the
current Large preset; 6v6/8v8 support would require a versioned allocation,
navigation, cache, performance, and packaged-runtime change.

Current map data already exposes seed, size, relief, crater, city, industry,
roads, seabed, bridge, hazard, POI, region, theme, `waterMode`, and
`navalEnabled`. However, roads currently use one hard-coded two-route network,
bridge maps stamp two fixed diagonal land bridges, and pathing has only land and
naval masks. There is no first-class amphibious route, depth-layer, cave/portal
layer, authored primary/secondary/flank graph, objective-anchor graph, or
map-scale destructible route-state system.

Stage 10 therefore proposes a separately versioned `BattlefieldTopologyV2`
contract keyed by stable map ID and semantic/layout hash. It must declare
playable extent, spawn zones, typed routes with width and unit clearance,
bridge/ford/shore/tunnel/portal/rail transitions, water and depth bands,
resources, exact site anchors, objectives, hazard volumes/timing, and
deterministic destructible states. Its schema version and hash must join the
world-topology cache identity before any new domain is enabled.

## User-approved brutalist megacity 3D contract

The controlling 3D instruction is to build a **playable RTS environment**, not
a visually dense science-fiction city. The 4 km × 4 km district is an authoring
profile for a major megacity treatment; it does not silently override a
canonical map's dimensions or exact plan.

The macro budget is one 300–500 m central command fortress, four to six major
district landmarks, 20–30 large structures, 40–80 medium structures, modular
industry and defense, and deliberate open combat space. The city hierarchy is
center fortress → inner command/military/industry → middle factories,
barracks, energy, logistics, and worker blocks → outer walls, yards, storage,
ruins, and infrastructure → controlled perimeter entrances.

The existing deterministic city/outpost assembler is site-scale—roughly
160–320 m—and must not be enlarged by multiplying model density. The megacity
pipeline first authors a regional district graph, reserves primary, secondary,
flank, naval, service, objective, hazard, and destruction-transition corridors,
allocates named district plots, and only then instantiates bounded site
blueprints inside those plots. Scale changes district count, route hierarchy,
objective distribution, resource travel time, and logistics redundancy—not
arbitrary asset density.

Navigation constraints are machine-checkable:

| Route class | Width | Purpose |
|---|---:|---|
| 6–8 primary arterials | 30–50 m | Several heavy vehicles abreast; connect perimeter to major districts |
| Secondary district roads | 15–25 m | Connect districts, plazas, intersections, bridges, and alternate fronts |
| Tertiary/service roads | 8–15 m | Infantry and small-vehicle access without pretending to support army columns |

Every important location needs at least two viable approaches, preferably
three. Accidental dead ends and false traversable gaps are failures. The visual
language must distinguish traversable, blocked, high ground, low ground,
chokepoint, and destructible shortcut states from the RTS camera.

Combat spaces include industrial plazas, reactor rings, military courtyards,
transport interchanges, collapsed districts, fortress boulevards, and bounded
industrial grids with multiple vehicle lanes. Chokes must be intentional—gates,
bridges, tunnels, wall breaches, causeways, or reactor passages—and paired with
an alternate route or destructible state so a front cannot become permanently
blocked.

There are three vehicle-reachable elevation bands: industrial ground, raised
roads/platforms/defense terraces, and fortress platforms/strategic high ground.
Vehicle links use large ramps rather than stairs. High ground must remain
connected to the battlefield.

Modules use clean small, medium, large, and megastructure footprint families,
preferably rectangular, square, hexagonal, octagonal, or circular at navigation
level. Visual complexity may increase above that level. Required reusable
families include walls/corners, gates, roads/intersections, bridges, ramps,
foundations, industrial and military buildings, towers, pipes/conduits,
platforms, barricades, turrets, hangars, and factories.

Destruction uses logical sections and `intact → damaged → critical → destroyed`
states. Rubble footprints must be predictable. A destruction event may open a
shortcut, collapse a bridge, block a road, or create a firing position only
when that topology transition is authored and recoverable; uncontrolled debris
must never contaminate army navigation.

The strategic-camera form budget is controlling: **70% large structural forms,
25% secondary forms, 5% micro-detail**. Major roads, district boundaries,
landmarks, and building silhouettes must stay readable. Generic cyberpunk
skyscrapers, glass towers, random building spam, thin architecture, rooftop
clutter, maze streets, uncontrolled emissives, and visual noise are rejected.

Production output requires modular geometry, instancing, texture atlases, trim
sheets, shared materials, distance and occlusion culling, simplified gameplay
collision, and `LOD0 → LOD1 → LOD2 normal RTS → LOD3 strategic →
impostor/HLOD`. Buildings use simple box or convex collision; walls use
continuous simple collision; decorative pipes and small props are nonblocking
unless explicitly strategic. The acceptance summary is: **dense but readable,
massive but navigable, detailed but optimized, vertical but accessible,
fortified but attackable, and visually impressive but gameplay-first**.

## Region routing

| Planet | Region | Maps | FULL_V1 baseline | Primary layout focus |
|---|---|---:|---|---|
| Aelos | `aelos_north` | 3 | — | Living capital districts, parade/service grids, command-defense rings |
| Aelos | `aelos_basin` | 3 | medium | Garden-industry terraces, drainage, foundry logistics, wetland pylons |
| Aelos | `aelos_coast` | 3 | medium | Working harbors, sea walls, causeways, port and spaceport aprons |
| Aelos | `aelos_ridge` | 3 | — | Garrisoned high shelves, retaining walls, fracture bridges |
| Pyraeth | `pyraeth_crater` | 3 | — | Pressure-dome courts, buried foundries, siege lanes, crater traversal |
| Pyraeth | `pyraeth_belt` | 3 | — | Mech-foundry trenches, armored logistics, factory choke hierarchy |
| Pyraeth | `pyraeth_caldera` | 3 | medium | Linked domes, refractory bridges, heat-safe districts |
| Pyraeth | `pyraeth_flats` | 3 | medium | Orbital aprons, exposed fortress islands, wind-protected services |
| Nordhall | `nordhall_isles` | 3 | — | Automated naval yards, ice bridges, drone rails, island connectivity |
| Nordhall | `nordhall_cliff` | 3 | — | Machine ruins, scarred terraces, ravine crossings, defensive shelves |
| Nordhall | `nordhall_frost` | 3 | medium | Reactor farms, thermal corridors, fracture bridges, separated fronts |
| Nordhall | `nordhall_peaks` | 3 | — | Sensor arrays, orbital-weather shelters, plateau links |
| Vespera | `vespera_spire` | 3 | — | Hive-spire silhouettes, magma approaches, consumed structural remnants |
| Vespera | `vespera_dunes` | 3 | — | Infestation channels, buried causeways, branching canyon routes |
| Vespera | `vespera_refinery` | 3 | medium | Foundry conversion, hatchery logistics, industrial ruin hierarchy |
| Vespera | `vespera_plateau` | 3 | — | Biomass-drowned fortifications, mesa crossings, day/night identity |

## World-layout work lanes

Every map receives modular-kit grammar, POI composition, road/access
connectivity, believable world-dressing variation, planet/region identity,
macro map composition, traversal/choke planning, and resource/expansion
spacing. The manifest adds the specialized lanes supported by that map's
current catalogue signals and exact requests:

- colony, city, and district hierarchy;
- industrial and refinery logistics;
- bases, outposts, walls, gates, and assault approaches;
- derelict, ruin, salvage, and relic storytelling;
- spaceport apron and cargo-flow clearance;
- pressure-dome and subsurface links;
- waterfront, bridge, dock, and naval transitions;
- hazard readability at command and tactical zoom;
- Brood conversion of roads and structures into nest topology;
- compact-map legibility or large-map landmark hierarchy;
- FULL_V1 regression preservation where an exact Stage 9 plan already exists.

Candidate site-class map coverage across all 48 maps is: city 30, colony 10,
outpost 24, base 11, refinery 39, relic 1, ruin 11, spaceport 7, derelict 14,
and Brood 12. These are **planning recommendations**, not new runtime counts.
They are derived from current MAPDEFS signals, explicit region roles, and the
six existing exact plans. Additional relic or narrative sites require deliberate
map-specific authoring; they must never be inferred from a name or fallback.

The authoritative site vocabulary remains city, colony, outpost, base,
refinery, relic, ruin, spaceport, derelict, and Brood. A later implementation
pass must give each selected site an exact template, stable ID, count source,
condition, era, and fail-closed preflight contract.

## World-kit processing subset

The current world-kit reports describe 334 modules/pieces across ten families.
After quarantining exactly seven building modules, **327 remain eligible for
source-level world/POI generator grammar and layout processing**. None is
runtime-ready or registered. These modules supply structural vocabulary,
sockets, silhouettes, surfaces, routes, and dressing options from which tools
can produce believable POIs; they are not a catalogue to dump directly into
maps or a count of UGA ship assets.

| Family | Declared | Processing eligible | Current use and gate |
|---|---:|---:|---|
| `mf-ground-kit-v1` | 36 | 36 | Plazas, trenches, ramps, pads; numeric, visual, runtime, and phone gates remain. |
| `mf-cityforms-kit-v1` | 72 | 72 | District forms, skylines, industrial yards; numeric and individual visual gates remain. |
| `mf-modular-building-v1` | 36 | 36 | Colonies, cities, outposts, depots; numeric and individual visual gates remain. |
| `mf-platform-hs-v1` | 30 | 30 | Walkable decks, build pads, bridges; traversal/buildability and visual gates remain. |
| `mf-superstructure-v1` | 57 | 57 | Walls, gates, towers, spires; seam, skyline, runtime, and phone gates remain. |
| `mf-transit-kit-v1` | 54 | 54 | Flyovers, skyways, waterfront edges; traversal and seam gates remain. |
| `mf-building-hs-v1` | 36 | 29 | The repair reports 971/971 numeric checks passing; the seven named modules remain visually quarantined and the family remains unregistered. |
| `mf-modular-road-v1` | 7 | 7 | Source layout studies only; regeneration and human visual review remain pending. |
| `mf-road-straight-hunyuan-clean-v1` | 1 | 1 | Source-authoring layout study only; runtime/visual acceptance remain false. |
| `mf-road-junctions-v1` | 5 | 5 | Source-authoring layout study only; PBR, sockets, traversal, phone, and human gates remain. |

“Processing eligible” is role-specific. Here it means the world-kit piece may
participate in offline world/POI grammar, composition-rule, connection-graph,
variation, or future candidate-generation work. It does not authorize direct
map scattering, ship use, decal binding, runtime registration, shipping,
promotion, or skipping its recorded acceptance gates.

World/POI faction treatment remains constrained:

- Aelos may use brutalist primary and neutral-colonial secondary modules.
- Pyraeth may use brutalist geometry only as a structural proxy; Dominion
  pressure-dome, refractory, heat-shield, and fortress-industry treatment is
  still missing.
- Nordhall may use brutalist/ruined geometry only as a structural proxy;
  machine-vault, sensor-pylon, insulated, and glacial-enclosure treatment is
  still missing.
- Vespera may use ruined hard-surface geometry only as consumed substrate.
  This pack has no organic Brood membranes, cocoons, veins, nests, buttresses,
  or hatchery silhouettes. That asset-family gap must be filled before Brood
  layouts can be visually complete.

## Required map ticket and gates

Each future map-processing ticket should contain:

1. Exact map ID, seed, planet, region, size, geology, adaptation, faction,
   hazard, FULL_V1 baseline status, generator grammar version, and seven-module
   quarantine check.
2. Macro terrain masses, spawn basins, landmark hierarchy, primary/secondary/
   flanking routes, and water or vertical transitions.
3. Selected site classes and exact-template requests with stable IDs,
   conditions, eras, counts, failure behavior, legal module adjacencies, and
   repetition limits.
4. District cells plus validated road, pedestrian, assault, resource, and
   service-access topology before decorative prop placement.
5. Resource and expansion locations checked against site footprints, travel
   time, sightlines, buildability, and defensibility.
6. Source-candidate **world-layout** module grammar with faction/style
   restrictions, socket and scale compatibility, condition transitions,
   variation bounds, world-dressing rules, and explicit per-family gates; no
   registration or cross-domain ship use by implication. Ship hull, section,
   interior-decal, and exterior-livery tickets use separate role-specific gates.
7. Deterministic repeat/reset/recovery checks, infantry/vehicle/mech traversal,
   overlap and corner-cut checks, and build-pad/resource clearance.
8. Same-seed command/tactical visual captures plus phone performance and memory
   evidence before promotion.

A map is not complete because it generated without errors. It needs exact-plan
preflight, deterministic realization, valid traversal, no economy/site
collision, no buried or floating structures, readable hazards, and inspected
visual evidence bound to current source hashes. Existing FULL_V1 maps must also
prove that their current exact contracts were preserved or deliberately
versioned.

## Sources and limitations

This package was derived from the current Local working files:

- `src/engine/gl.js` — 48-map campaign catalogue, planets, regions, map
  metadata, hazards, sizes, and water modes.
- `src/main.js`, `src/hazards.js`, and `src/game/sim.js` — current theatre
  extents, topology-cache identity, deterministic hazard hooks, and the present
  land/naval pathing boundary.
- `src/game/economy.js`, `src/engine/models.js`,
  `src/engine/models-machine.js`, and `src/ui/render3d.js` — current connected
  water-placement rules, procedural floating-platform geometry, fixed
  water-plane render height, and the absence of structural buoyancy response.
- `assets/data/locationgrammar.js` — site-class vocabulary and
  planet/region/faction/adaptation contracts.
- `assets/data/locationplans.js` and
  `assets/data/sitetemplates-stage9.js` — six existing FULL_V1 baselines.
- `source-media/content-library/city-outpost-modular-layout-blueprints.v1.json`
  — deterministic road-first, named-plot site assembler whose bounded outputs
  belong inside a higher-level district graph rather than being density-scaled
  into a megacity.
- `docs/HANDOFF_CODEX_2026-08-28_HARDSURFACE.md` — pre-repair seven-module
  defect diagnosis and non-registration ledger.
- `tools/blender/test_mf_kits.py` and
  `tools/blender/build-mf-building-hs.py` — the exact checker and repaired
  generator bound to the baseline/final comparison.
- `tools/blender/build-mf-superstructure-kit.py`,
  `tools/blender/build-mf-transit-kit.py`, and
  `tools/blender/build-mf-platform-hs.py` — fixed caisson, shoreline quay, and
  terrain-backed platform contracts used to prevent false floating-role
  inference.
- `tmp/hardsurface-pack-final/test-mf-kits-final.log` — local-only, ignored
  Blender 5.2 evidence reporting `PASSED all 971 checks` and no `Traceback`.
  It is not portable release evidence and must not be force-added.
- The ten report/provenance files below
  `modules/space_exploration/assets/source/blender/world-kits/` — current
  world-kit family counts and acceptance states.
- `tools/blender/blend-inventory.json` — separate mesh-object, triangle, and
  material counts for the Nexus VII exterior, command cutaway, and legacy ark.
- `modules/space_exploration/assets/source/blender/nexus-vii-civilization-ship.blend`
  and `modules/space_exploration/tools/blender/build_uga_assets.py` — current
  UGA exterior authoring source and builder.
- `modules/space_exploration/assets/source/blender/uga-command-cutaway.blend`,
  `modules/space_exploration/assets/source/concepts/nexus-vii-v1/concept-manifest.json`,
  and the Nexus VII district prompt-guide index — current ship-section and
  eleven-district authoring evidence.
- `modules/space_exploration/assets/source/uga/interior-library/nexus-vii-material-decal-manifest.json`
  — planned, source-only interior material/decal contract whose exterior-hull
  exclusions remain controlling.
- `modules/space_exploration/src/ship/uga_blender_assets.js` and
  `modules/space_exploration/src/core/uga_command_scene.js` — current runtime
  consumers proving that ship exterior and district topology are separate from
  world-kit processing.

Full SHA-256 values and per-family report paths are recorded in the canonical
tracked companion manifest at
`docs/MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_MANIFEST_2026-08-29.json`. The
ignored `design/` copy remains scratch only. The checkout is shared and dirty;
those hashes bind this inventory to the exact files read. Re-hash and re-run
all applicable gates before any asset promotion. This preparation did not run
Blender, inspect GLBs visually, register assets, alter an exact plan, or prove
runtime fitness. The conversational topology images were reviewed only for
abstract scale, route, objective, POI, and hazard relationships and were not
copied, committed, or treated as shippable art.
