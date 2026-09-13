# Spline 3D prompt guide — Gravem

**Ordinal:** 31 / 32  
**Planet ID:** `gravem`  
**Sector:** `outer_reach`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** high-gravity iron plateaus, compressed cloud forests and kilometer-deep tectonic trenches  
**Atmosphere:** dense rust-grey air with low fast cloud bands  
**Hazards:** 1.8 g load, rockfall, seismic shear, hydraulic failure and short ballistic arcs  
**Orbital silhouette:** dark red iron continents, black trench rings, flattened cloud belts and a heavy ochre limb  
**Material grammar:** ribbed load steel, iron basalt, high-density concrete, laminated shock rubber and pale load-mark ceramic

## Orbital / war-table prompt — The Heavy World

> Create an original orbital asset for **Gravem**, root `PLANET_GRAVEM`, in the Outer Reach. Show dark red iron plateaus divided by concentric black tectonic trenches beneath unusually flat, fast cloud bands. Add a thick ochre limb, low compact city lights and a broken equatorial skyhook cable with a distant counterweight. Separate terrain, cloud bands, atmosphere, cable/debris, night lights and region anchors. Author 2K neutral iron geology, trench height, cloud flow, gravity-stress, settlement, seismic and hazard masks. The dense flattened atmosphere and ring trenches—not red color alone—must identify Gravem on a phone.

## Eight location prompts

### `city_colony` — Anchorfall

Site ID: gravem_anchorfall. Location class: city_colony.

> Build `SITE_GRAVEM_ANCHORFALL`, a 448 × 384 m low-slung city of thick ribbed blocks stepped into an iron plateau. Hero: a broad civic load arch, never a tall fragile tower. Use two 28 m roads with shallow grades, 24 × 12 m reinforced gates, 48 m maneuver court and 4 m compressed pedestrian galleries. Objective: redistribute structural load after a quake. Damage is foundation shear, crushed dampers and slab offset; no floaty debris or implausible cantilevers.

### `outpost` — Mass Gauge Seven

Site ID: gravem_mass_gauge7. Location class: outpost.

> Build `SITE_GRAVEM_MASS_GAUGE7`, a 240 × 208 m geodesy outpost centered on a squat gravimeter drum and radial ground anchors. Include an 18 m loop, 32 m pad and 3 m inspection trenches. Objective: recalibrate anchors during tremors. Damage pulls bolts, cracks grout and settles the drum; materials communicate weight and compression.

### `military_base` — Deepwall Citadel

Site ID: gravem_deepwall. Location class: military_base.

> Build `SITE_GRAVEM_DEEPWALL`, a 512 × 416 m buried fortress spanning a trench shelf. Hero: a massive recessed gate under layered load arches. Two 30 m routes, 24 × 12 m gates, 48 m armored courts and 4 m tunnel galleries support heavy units. Objective: secure seismic dampers before a controlled breach. Destruction shears specific arches and redirects routes; Brood uses squat buttressing organisms and ground-hugging muscle sheets adapted to 1.8 g.

### `refinery` — Coreweight Smelter

Site ID: gravem_coreweight. Location class: refinery.

> Build `SITE_GRAVEM_COREWEIGHT`, a 544 × 416 m iron refinery sunk around a pressure-assisted smelter. Hero: paired low furnace drums braced by monumental ribs. Add 30 m haul circuits, 56 m court, 24 × 12 m crusher gates and 4 m reinforced catwalks. Objective: bleed pressure from three furnace stages. Damage creates dense slag flow, collapsed braces and short heavy fragments, never long zero-gravity explosions.

### `relic_ruin` — Fallen Elevator

Site ID: gravem_fallen_elevator. Location class: relic_ruin.

> Build `SITE_GRAVEM_FALLEN_ELEVATOR`, a 352 × 304 m ancient lift terminal crushed into a trench. Hero: a huge tilted counterweight embedded in layered platforms. Use 18 m shelf routes, 42 m terminal court and 4 m machinery galleries. Objective: extract records from beneath the counterweight using load-transfer supports. Damage is compression and shear; avoid a generic crashed ship.

### `spaceport` — Catapult Trench

Site ID: gravem_catapult_trench. Location class: spaceport.

> Build `SITE_GRAVEM_CATAPULT_TRENCH`, a 576 × 432 m launch port using a long electromagnetic rail to overcome gravity. Hero: a recessed linear launch trench with enormous lateral braces. Provide 30 m cargo roads, 56 × 48 m LZ/rail service court, 24 × 12 m hangars and 4 m passenger tunnels. Objective: align rail sections and release the launch carriage. Damage offsets discrete rail beds but preserves a surface extraction route.

### `pressure_dome` — Loadbearer Ward

Site ID: gravem_loadbearer_ward. Location class: pressure_dome.

> Build `SITE_GRAVEM_LOADBEARER_WARD`, a 400 × 336 m squat habitat dome whose thick external ribs carry both pressure and gravity load. Hero: a low multi-ring profile over terraced farms. Two 18 m locks, one 24 × 12 m freight gate, 42 m inner court and 3 m radial paths define circulation. Objective: replace failed dampers. Damage deforms individual rings and settlements, not transparent explosion spectacle.

### `derelict_megastructure` — Shattered Skyhook Counterweight

Site ID: gravem_skyhook_weight. Location class: derelict_megastructure.

> Build `SITE_GRAVEM_SKYHOOK_WEIGHT`, a 704 × 544 m crashed skyhook counterweight and buried tether terminal. Hero: a colossal dense wedge driven into the plateau with cable roots trailing to the horizon. Add 30 m service roads, 48 m anchor courts, 24 × 12 m internal portals and 4 m maintenance galleries. Objective: recover orbital records while seismic aftershocks shift load zones. Damage uses compact crushed layers and snapping cable bundles; Brood colonizes shock-isolated cavities with short muscular supports.

## Spline production contract

- Build at 1 m, Y-up/-Z-forward, 4 m modules, applied transforms and triangles. Mixed routes 18–30 m, gates 24 × 12 m, courts 42–56 m; grades and vertical circulation must respect 1.8 g.
- Author seamless 2048² `gravem_ribbed_load_steel`, `gravem_iron_basalt`, `gravem_dense_concrete`, `gravem_shock_rubber`, `gravem_loadmark_ceramic`: neutral BaseColor, tangent Normal, ORM, optional Height/Emissive.
- Provide a 2K atlas for load classes, mass limits, damper IDs, seismic zones, rail timing, districts, evacuation, extraction and objectives; 16 px gutters/8 px dilation.
- UV0/tangents and stable density mandatory. Pivot dampers/rails at functional axes, gates at hinges and breakables at load/fracture centers. Separate watertight collision `COL_`, `NAV_`, `LOS_`, load and seismic hazard proxies.
- Name `PLANET_GRAVEM`, `SITE_GRAVEM_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, keeping low massive silhouettes.
- Export Spline source, GLB and `intake.json` with scale, axes, IDs, PBR, triangle/material counts, physics-authoring notes, provenance and runtimeReady false. Phone captures must prove scale, clear routes and no thin/implausible structural members.
- Reference games guide only broad mass, scale and tactical readability. Copy no assets, buildings, maps, silhouettes, materials, decals, units, organisms, logos, UI, palette or names from C&C3, Supreme Commander 2, XCOM 2 or StarCraft II. No generic recolors.
