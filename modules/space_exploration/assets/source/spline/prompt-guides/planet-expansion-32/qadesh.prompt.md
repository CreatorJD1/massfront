# Spline 3D prompt guide — Qadesh

**Ordinal:** 29 / 32  
**Planet ID:** `qadesh`  
**Sector:** `outer_reach`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** wind-cut ochre canyons, white salt plateaus and narrow irrigated valley ribbons  
**Atmosphere:** dry rose-gold dust with high silver cirrus  
**Hazards:** water scarcity, flash canyon floods, salt shear, dust walls and aquifer collapse  
**Orbital silhouette:** ochre planet crossed by one branching green-blue canyon artery and brilliant white salt scars  
**Material grammar:** layered sandstone composite, blue-glazed ceramic, patinated copper, pale hydraulic concrete and salt-polished stone

## Orbital / war-table prompt — The Seven Waters

> Create an original orbital planet for **Qadesh**, root `PLANET_QADESH`, in the Outer Reach. Show immense ochre plateaus, a single branching irrigated canyon system, white salt basins and fine rose dust bands. Add a warm thin limb, sparse river-city lights and two tiny captured rubble moons. Separate terrain, scarce water, dust/cloud, atmosphere, lights, moons and region anchors. Author 2K neutral geology, canyon height, aquifer, salt, vegetation, dust-density, city-light and hazard masks. The green-blue canyon artery must define the phone silhouette without resembling an Earth river delta.

## Eight location prompts

### `city_colony` — Seven Wells Enclave

Site ID: qadesh_seven_wells. Location class: city_colony.

> Build `SITE_QADESH_SEVEN_WELLS`, a 448 × 384 m canyon city terraced around seven engineered wells. Hero: a stepped civic reservoir with blue ceramic spillways. Two 24–28 m switchback routes, 24 × 12 m canyon gates, 48 m water court and 4 m shaded pedestrian arcades support combined arms. Objective: prevent aquifer contamination while choosing which districts receive water. Damage uses dry fractures, failed spillways and localized flood channels.

### `outpost` — Pilgrim Gauge

Site ID: qadesh_pilgrim_gauge. Location class: outpost.

> Build `SITE_QADESH_PILGRIM_GAUGE`, a 240 × 208 m secular route-and-water station marked by one tall graduated copper gauge. Include an 18 m loop, 32 m pad and 3 m shade corridor. Objective: read buried pressure sensors before a dust wall arrives. Use layered stone, copper and fabric shades; author abrasion and salt accretion instead of generic desert grime.

### `military_base` — Cistern Wall

Site ID: qadesh_cistern_wall. Location class: military_base.

> Build `SITE_QADESH_CISTERN_WALL`, a 512 × 400 m defensive dam/base sealing a narrow canyon. Hero: a broad hydraulic wall with three recessed armored sluices. Provide two 28 m routes, 24 × 12 m gates, 48 m upper court and 4 m water tunnels. Objective: secure the reservoir without catastrophic release. Destruction opens authored flood routes; Brood B2 forms drought-hardened cistern nodules and deep feeder roots rather than surface carpet.

### `refinery` — Saltfire Works

Site ID: qadesh_saltfire. Location class: refinery.

> Build `SITE_QADESH_SALTFIRE`, a 480 × 384 m solar salt and rare-mineral refinery. Hero: a field of angled copper concentrators around a blue-glazed evaporation tower. Add 30 m hauler lanes, two 48 m courts, 24 × 12 m processing portals and 4 m shaded catwalks. Objective: redirect brine and cool the tower. Damage creates salt avalanches, concentrator collapse and steam jets.

### `relic_ruin` — Tablets of Rain

Site ID: qadesh_tablets_of_rain. Location class: relic_ruin.

> Build `SITE_QADESH_TABLETS_OF_RAIN`, a 352 × 304 m ancient hydraulic archive carved into canyon strata. Hero: seven monumental but original flow slabs aligned to a dry cascade. Use a 16 m loop, 42 m archive court and 4 m channel galleries. Objective: reconstruct historic rainfall cycles by moving gates. Avoid real-world sacred iconography and copied alien architecture.

### `spaceport` — High Mesa Ascender

Site ID: qadesh_high_mesa. Location class: spaceport.

> Build `SITE_QADESH_HIGH_MESA`, a 544 × 432 m spaceport spanning mesa top and canyon lift. Hero: a vertical cargo ascender ending in a wind-sheltered launch deck. Provide 30 m freight roads, 56 × 48 m LZ, 24 × 12 m hangars and 4 m passenger galleries. Objective: restore the lift counterweights. Damage can isolate mesa or canyon routes while leaving a deterministic extraction path.

### `pressure_dome` — Blue Vault Agriplex

Site ID: qadesh_blue_vault. Location class: pressure_dome.

> Build `SITE_QADESH_BLUE_VAULT`, a 400 × 336 m agricultural dome over terraced hydroponics and a visible aquifer head. Hero: blue-tinted glazing under pale stone buttresses. Two 18 m locks, one 24 × 12 m freight gate, 42 m water garden and 3 m shaded loops define circulation. Objective: seal a salinity breach. Damage affects irrigation terraces and glazing bays individually.

### `derelict_megastructure` — Celestial Aqueduct

Site ID: qadesh_celestial_aqueduct. Location class: derelict_megastructure.

> Build `SITE_QADESH_CELESTIAL_AQUEDUCT`, a 704 × 544 m abandoned orbital-fed water conduit crossing a canyon on immense segmented piers. Hero: a broken high arc with suspended pipe sections. Add 28 m service routes, 48 m valve courts, 24 × 12 m conduit portals and 4 m interior galleries. Objective: recover flow-control records and safely drain a trapped section. Damage uses mineral burst, pier shear and hanging pipe; local Brood seeks the remaining water through burrowing siphon organs.

## Spline production contract

- Author at 1 m, Y-up/-Z-forward, 4 m modules, applied transforms and triangles. Mixed routes 18–30 m, portals 24 × 12 m and courts 42–48 m; water paths and dry routes require separate proxies.
- Create seamless 2048² `qadesh_layered_composite`, `qadesh_blue_glaze`, `qadesh_patinated_copper`, `qadesh_hydraulic_concrete`, `qadesh_salt_weathering`: neutral BaseColor, tangent Normal, ORM, optional Height/Emissive.
- Supply a 2K decal atlas for water ownership, depth, pressure, district/well IDs, drought restrictions, flood arrows, maintenance, extraction and objectives; 16 px gutters/8 px dilation.
- Require UV0/tangents and stable texel density. Pivot gates/valves at functional axes, concentrators at tracking pivots, lifts at guide centers and breakables at fracture origins. Separate watertight collision `COL_`, `NAV_`, `LOS_`, water and hazard proxies.
- Name `PLANET_QADESH`, `SITE_QADESH_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, preserving canyon, well and aqueduct silhouettes.
- Export Spline source, GLB and `intake.json` with scale, axes, IDs, PBR, counts, state collections, provenance and runtimeReady false. Capture phone dry/flood-state evidence and reject unreadable water, clipped verticality or false approval.
- Reference titles provide broad hierarchy/scale/cover/biome inspiration only. Copy no maps, assets, architecture, materials, decals, symbols, units, organisms, UI, palettes or names. Qadesh must be original science-fiction worldbuilding, not a direct real culture or a recolor.
