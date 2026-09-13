# Spline 3D prompt guide — Dredge

**Ordinal:** 27 / 32  
**Planet ID:** `dredge`  
**Sector:** `karak_lost_colonies`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** flooded strip mines, peat deltas, spoil mesas and methane wetlands  
**Atmosphere:** heavy brown-grey cloud deck with low industrial fog and green methane aurora  
**Hazards:** sinkholes, toxic mud, methane ignition, spoil collapse and contaminated floodwater  
**Orbital silhouette:** rust-brown continents pocked by geometric black pits, silver flood deltas and a green polar glow  
**Material grammar:** corroded plate steel, oil-dark concrete, reinforced rubber, compacted spoil and stained industrial ceramic

## Orbital / war-table prompt — The Excavated World

> Create an original orbital asset for **Dredge**, root `PLANET_DREDGE`, in the Karak Lost Colonies. Show vast rectilinear open pits visible from orbit, rust-brown spoil fields, silver flood deltas and dark peat oceans beneath heavy broken clouds. Add a dim green methane aurora and sparse industrial lights concentrated on conveyor lines. Separate terrain, floodwater, cloud decks, fog shell, atmosphere, lights and region anchors. Author 2K neutral geology, pit-depth, flood, sediment plume, cloud, methane, light and hazard masks. The excavated geometry—not a brown tint—must define the phone silhouette.

## Eight location prompts

### `city_colony` — Siltstack Cooperative

Site ID: dredge_siltstack. Location class: city_colony.

> Build `SITE_DREDGE_SILTSTACK`, a 448 × 384 m worker colony raised on layered spoil terraces. Hero: a vertical civic stack above interlocked flood decks. Provide two 28 m haul-capable loops, 24 × 12 m flood gates, 48 m market/turn court and 4 m dry personnel bridges. Objective: evacuate lower decks as a spoil dam fails. Use corroded steel, dark concrete, rubber seals and warm modular habitats; damage transitions through subsidence, tilt and inundation.

### `outpost` — Bucketline Watch

Site ID: dredge_bucketline. Location class: outpost.

> Build `SITE_DREDGE_BUCKETLINE`, a 256 × 224 m survey outpost attached to an idle bucket-chain excavator. Hero: one huge suspended bucket wheel segment. Include an 18 m service loop, 32 m pad and 3 m operator galleries. Objective: inspect three chain sections without triggering a collapse. Use compacted spoil berms and grease-stained steel; damaged buckets become authored cover, not random cube debris.

### `military_base` — Spillway Fort

Site ID: dredge_spillway_fort. Location class: military_base.

> Build `SITE_DREDGE_SPILLWAY_FORT`, a 512 × 416 m defense base integrated with a mine flood-control dam. Hero: paired armored spill gates beneath a low command bridge. Two 30 m mixed-unit routes, 24 × 12 m dam gates, 48 m maneuver courts and 4 m intake galleries enable combined arms. Objective: stop sabotage while choosing which basin to flood. Destruction changes water routes deterministically; Brood enters nutrient-rich sludge through filter structures with specialized mats and siphons.

### `refinery` — Titan Maw Excavation

Site ID: dredge_titan_maw. Location class: refinery.

> Build `SITE_DREDGE_TITAN_MAW`, a 576 × 448 m active mega-excavator and ore-separation yard. Hero: a colossal bucket-wheel head beside a terraced pit. Include 30 m haul circuits, 56 m turnaround, 24 × 12 m crusher portals and protected 4 m catwalks. Objective: stop the wheel and recover the buried core sample. Damage chains through conveyor tear, slurry spill, boom collapse and methane fire while one heavy route survives.

### `relic_ruin` — Buried Foundry Nine

Site ID: dredge_foundry_nine. Location class: relic_ruin.

> Build `SITE_DREDGE_FOUNDRY_NINE`, a 352 × 304 m earlier industrial settlement consumed by later spoil. Hero: a half-exposed furnace cupola below a sediment cliff. Provide a 16 m rim route, 42 m excavated court and 4 m buried casting galleries. Objective: drain the ruin and retrieve its labor archive. Materials show age-separated metallurgy and mineral staining; no generic ancient temple language.

### `spaceport` — Mudflat Liftfield

Site ID: dredge_mudflat_liftfield. Location class: spaceport.

> Build `SITE_DREDGE_MUDFLAT_LIFTFIELD`, a 544 × 432 m spaceport on independent deep piles above tidal mud. Hero: three elevated launch rafts linked by flexible cargo bridges. Use 30 m freight lanes, 56 × 48 m LZ, 24 × 12 m hangars and 4 m passenger tubes. Objective: re-level pile groups before launch. Damage sinks or tilts individual rafts, producing clear alternate circulation rather than clipping geometry.

### `pressure_dome` — Methane Seal Habitat

Site ID: dredge_methane_seal. Location class: pressure_dome.

> Build `SITE_DREDGE_METHANE_SEAL`, a 400 × 336 m dome over a reclaimed peat island. Hero: a low double membrane crossed by thick gas-scrubber ribs. Provide two 18 m locks, one 24 × 12 m freight gate, 42 m inner court and 3 m elevated paths. Objective: isolate methane pockets and protect civilians. Damage states use membrane sag, seal blister and controlled venting, with restrained blue flare emission.

### `derelict_megastructure` — World-Eater Conveyor

Site ID: dredge_world_eater. Location class: derelict_megastructure.

> Build `SITE_DREDGE_WORLD_EATER`, a 704 × 544 m abandoned overland conveyor spanning pit, floodplain and spoil mesa. Hero: a broken kilometer-scale truss represented by three gigantic descending segments. Create 30 m service roads, 48 m transfer courts, 24 × 12 m galleries and 4 m truss interiors. Objective: cross transfer houses and retrieve production records. Damage uses truss buckling, sediment burial and hanging belt ribbons; Brood nests exploit warm gearboxes with distinct feeder and anchor anatomy.

## Spline production contract

- Author at 1 m, Y-up/-Z-forward, 4 m modules, applied transforms and triangles. Mixed/haul routes 18–30 m, portals 24 × 12 m, turn courts 42–56 m. Tag dry, mud, flood and unstable ground separately.
- Create seamless 2048² `dredge_corroded_plate`, `dredge_oildark_concrete`, `dredge_reinforced_rubber`, `dredge_compacted_spoil`, `dredge_slurry_residue`: lighting-neutral BaseColor, tangent Normal, ORM, optional Height/Emissive.
- Supply a 2K decal atlas for load ratings, flood stages, methane zones, chain direction, worker districts, maintenance, extraction and objectives; 16 px gutters/8 px dilation.
- UV0/tangents mandatory. Keep stable density; pivot wheels/rollers at axes, gates at hinges, rafts at pile centers and breakables at authored fractures. Build separate simple `COL_`, `NAV_`, `LOS_`, mud/water and hazard proxies.
- Name `PLANET_DREDGE`, `SITE_DREDGE_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, keeping excavation scale readable.
- Export editable Spline source, GLB and `intake.json` with IDs, axes, scale, PBR, counts, state collections, provenance and runtimeReady false. Capture matched phone dry/flooded views; reject ambiguous mud boundaries, hidden objectives, bad collision or unbounded transparent fog.
- Reference games are high-level composition and readability guides only. Never copy C&C3, Supreme Commander 2, XCOM 2 or StarCraft II assets, machinery, layouts, units, materials, decals, organisms, logos, palette recipes or names. No recolor-only content.

