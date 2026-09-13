# Aelos — Spline 3D production prompts

Status: source-authoring prompts only. These blocks do not prove runtime integration or visual approval. Copy one complete block into Spline for one dedicated preset set; do not combine several presets into a generic recolor kit.

## `aelos_north_capital_ward`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_north_capital_ward`, planet Aelos, Capital Circumference region, location class city/colony. It is a maintained Nova civic capital: layered inhabited ward blocks, a tram spine, command plaza, occupied windows, planted drainage, and parks that preserve vehicle roads. The silhouette must read as a functioning city, not a military compound or a collection of generic cubes.

Produce exactly 7 model families: `ward_block_low`, `ward_block_mid`, `ward_block_tower`, `tram_spine`, `command_plaza`, `park_edge`, and `service_gate`. Give each family straight/corner/end variants only where needed, while preserving the seven-family accounting. Include a two-route street network, plazas that do not bisect roads, elevated tram clearance, cover-scale street furniture, and district skyline variation.

Combined-arms contract: work in meters, Y-up and -Z forward, on a 4 m source grid and 16 m macro grid. Preserve 3 m personnel paths, a 14 x 7 m light-mech portal, an 18 x 8 m small-vehicle portal, a 24 x 12 m medium-mech portal, 16–18 m one-way lanes, 28–30 m two-way roads, 32 x 36 m passing bays every 60–80 m, and at least one 48 m turning court. No tree, bench, planter, curb, rail, debris, or decal may intrude into those envelopes.

Author exactly 2 original seamless 2048 x 2048 PBR families: `aelos_civic_concrete` and `aelos_transit_glass_composite`. For each supply lighting-neutral base color in sRGB, tangent-space normal in linear, ORM in linear with R=AO/G=roughness/B=metallic, optional height, and restrained cyan occupied-window emissive. Prove seams with a 3 x 3 tile and keep baked sun, shadows, logos, and facade photographs out of repeatable maps. Create a 12-entry original decal atlas for ward IDs, tram platforms, plaza circulation, occupancy, municipal services, evacuation, curb rules, and utility access.

Model/export contract: root `GSITE_AELOS_NORTH_CAPITAL_WARD`; names use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `DESTRUCT_`, `ROOF_`, and `OCCLUDER_`. Put reusable pivots at floor contact and doors on their hinge. Apply transforms, forbid negative scale, require UV0 and tangents, and use separate simple watertight collision/nav/LOS meshes. LOD1 must be at most 40% of LOD0 triangles and LOD2 at most 12%, while preserving skyline, portals, tram, plaza, windows, and road openings.

Create deterministic `intact`, `damaged`, `breached`, and `collapsed_or_disabled` states. Route-affecting rubble must have separate personnel-passable and vehicle-blocking outcomes. Aelos has no Brood variant in this set. At a 412 x 915 phone portrait RTS view, the tram spine, tower rhythm, command plaza, two legal routes, cyan occupied windows, and damage state must remain distinguishable without relying on tiny props or text; preview tactical and overview LODs before export.

Deliver editable Spline source plus source GLB and runtime-candidate GLB, named from the preset ID, with 7-family inventory, material/decal manifest, collision/nav notes, triangle counts, and provenance. Command & Conquer 3, Supreme Commander 2, XCOM 2, and StarCraft II may guide only readability, scale, destruction language, and biome contrast. Do not copy, trace, recreate, extract, or imitate any protected mesh, texture, layout, logo, icon, faction mark, unit, building, or screenshot. All geometry, materials, decals, signage, and symbols must be original MASSFRONT work.
```

## `aelos_north_circumference_bastion`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_north_circumference_bastion`, planet Aelos, Capital Circumference region, location class military base. Build a maintained Nova ceremonial bastion with a stepped honor rampart, a full motor court, a buried command bunker, and two independently breachable gatehouses. It must retain civic dignity while reading instantly as a combined-arms defensive site.

Produce exactly 8 model families: `ceremonial_rampart`, `rampart_corner`, `gatehouse_alpha`, `gatehouse_beta`, `motor_court`, `command_bunker`, `honor_plinth`, and `defense_tower`. Author measured straight/corner/end pieces within those families, two legal approach routes, gate state swaps, protected infantry flanks, and a motor-court objective landmark.

Combined-arms contract: meters, Y-up/-Z forward, 4 m source grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech gate, 18 x 8 m small-vehicle gate, 24 x 12 m medium-mech gate, 16–18 m one-way lane, 28–30 m two-way lane, 32 x 36 m passing bay, 48 m turning court, ramps no steeper than 8.3%. Keep stairs, plinths, barriers, cover, damage, and gate leaves outside validated vehicle envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `aelos_civic_armor_stone` and `aelos_blast_steel_parade_metal`. Supply neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, and restrained state emissive. Test 3 x 3 seams; exclude baked light and reference imagery. Create a 14-entry original decal atlas covering garrison sectors, motor circulation, honor court, restricted fire, gate state, bunker access, evacuation, emergency services, and localized gate scorching.

Use root `GSITE_AELOS_NORTH_CIRCUMFERENCE_BASTION`; node prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor-contact pivots for modules; hinge pivots for gates. Apply transforms, no negative scale, UV0/tangents required, simple dedicated collision/nav/LOS proxies. LOD1 <=40% and LOD2 <=12% of LOD0; retain both gate silhouettes, motor-court boundary, command bunker, and breach readability.

Create deterministic `intact`, `damaged`, `gate_alpha_breached`, `gate_beta_breached`, and `collapsed_or_disabled` state meshes, mapped back to the four-state runtime contract. Rubble outcomes must state which nav classes pass. No Brood variant belongs in this Aelos set. In a 412 x 915 phone portrait RTS crop, both gates, bunker, court, primary/secondary routes, faction silhouette, and current breach state must be readable without labels; no thin decorative detail may carry gameplay meaning.

Deliver editable Spline source, source GLB, runtime-candidate GLB, 8-family inventory, two-family PBR manifest, 14-decal atlas manifest, proxy/LOD report, and provenance. Reference games are visual-language study only; never copy or trace their models, textures, layouts, logos, symbols, buildings, screenshots, or faction design. Create original MASSFRONT forms and marks.
```

## `aelos_basin_heartland_refinery`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_basin_heartland_refinery`, planet Aelos, Heartland Yards region, location class refinery. Build a canal-fed clean-process refinery with a recognizable pressure-vessel train, overhead pipe/catwalk rack, process control core, spill containment, and a complete service-vehicle loop. It must look maintained and technologically advanced, not like a dirty universal refinery skin.

Produce exactly 8 model families: `canal_intake`, `pressure_vessel_train`, `pipe_rack_straight`, `pipe_rack_corner`, `catwalk_span`, `process_control_core`, `containment_basin`, and `service_gate`. Within these families author grid-snapping straight/corner/end/damage variants, valve clusters, personnel catwalk paths, two vehicle routes or one route plus an always-available breach bypass, and a 48 m process-yard turning court.

Combined-arms contract: meters, Y-up/-Z forward, 4 m source grid and 16 m macro grid. Preserve 3 m personnel catwalks, 14 x 7 m light-mech portals, 18 x 8 m small-vehicle portals, 24 x 12 m medium-mech high-bay access, 16–18 m one-way service lanes, 28–30 m two-way road, 32 x 36 m passing bay, and ramps <=8.3%. Pipes, supports, valves, spill curbs, debris, and collision must not reduce clearance.

Author exactly 2 seamless 2048 x 2048 PBR families: `aelos_clean_process_steel` and `aelos_canal_insulation_composite`. Supply lighting-neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, and restrained process-status emissive. Include canal moisture, maintained insulation, and localized chemical staining without baked shadows. Prove a 3 x 3 tile. Create 14 original decal entries for flow direction, valve groups, pressure classes, quay service lanes, spill control, maintenance dates, process isolation, and emergency cutoff.

Root `GSITE_AELOS_BASIN_HEARTLAND_REFINERY`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor pivots for modules; true hinge/axis pivots for valves and gates. Apply transforms, forbid negative scales, require UV0/tangents, and author simple separate collision/nav/LOS/shot blockers. LOD1 <=40%, LOD2 <=12%; keep vessel rhythm, canal intake, high-bay opening, and vehicle loop readable.

Create deterministic `intact`, `leaking_damaged`, `breached_isolated`, and `collapsed_or_disabled` states, with explicit hazard volume and route behavior. No Brood version for this Aelos set. At 412 x 915 phone portrait RTS scale, the canal, vessel train, process core, two routes, hazard boundary, and current shutdown state must read through silhouette, material value, and restrained emission—not tiny labels.

Deliver editable Spline source, source/runtime GLBs, exact 8-family inventory, PBR/decal manifests, collision/nav/hazard tables, LOD triangle counts, and provenance. Reference titles guide scale/readability only; copy no protected geometry, texture, layout, logo, icon, faction mark, building, screenshot, or decal. All output must be original MASSFRONT work.
```

## `aelos_basin_greenbelt_outpost`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_basin_greenbelt_outpost`, planet Aelos, Heartland Yards region, location class outpost. Build a compact survey/agricultural perimeter with a field shelter, cultivated sensor beds, relay mast, drainage crossings, solar laminate, and a complete service loop. Keep the low silhouette readable among vegetation without turning it into a military bunker.

Produce exactly 4 model families: `field_survey_shelter`, `relay_mast`, `agri_sensor_bed`, and `drainage_bridge`. Provide necessary intact/damage and straight/end variants inside those families. Establish two personnel approaches, an 18 m service-vehicle loop, an emergency light-mech gate, clear relay service zone, and road-preserving planted edges.

Combined-arms contract: meters, Y-up/-Z forward, 4 m grid and 16 m macro grid. Preserve 3 m personnel paths, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 16–18 m one-way loop, 32 x 36 m passing/service bay, and <=8.3% drainage ramps. This compact site need not admit medium mechs inside the compound, but its exterior route must not be narrowed by crops, ditches, bridge rails, props, or rubble; declare that admission limit in metadata.

Author exactly 1 seamless 2048 x 2048 PBR family, `aelos_greenbelt_field_composite`, with neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, and restrained relay/solar emissive. It must cover weathered composite, irrigation metal, cultivated-soil contact, and solar laminate through trim/masks without a baked environment. Prove 3 x 3 seams. Create an 8-entry original decal atlas for survey grids, crop zones, irrigation control, relay azimuth, utility routes, vehicle limits, emergency access, and maintenance.

Root `GSITE_AELOS_BASIN_GREENBELT_OUTPOST`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `DESTRUCT_`, `OCCLUDER_`. Floor-contact pivots, applied transforms, no negative scale, UV0/tangents, dedicated low-poly collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve mast, shelter, loop, bridge, and sensor-bed block shapes.

Create deterministic `intact`, `storm_damaged`, `service_breached`, and `collapsed_or_disabled` states. No Brood variant for Aelos. At 412 x 915 phone portrait RTS scale, the mast, shelter, bridge crossing, service loop, objective zone, and state must remain legible without individual crop stalks or text. Cluster micro-detail into bold value groups.

Deliver editable Spline source, source/runtime GLBs, exact 4-family list, 1-family PBR and 8-decal manifests, proxy/LOD/admission report, and provenance. Use cited games only to study readability and scale; do not copy any mesh, texture, layout, logo, screenshot, symbol, structure, or faction identity. Output must be original MASSFRONT art.
```

## `aelos_coast_admiralty_spaceport`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_coast_admiralty_spaceport`, planet Aelos, Harbor Command region, location class spaceport. Build a pelagic landing apron with a visually related air-unit/base-deployer bay, crane gantries, sea-wall approach, harbor-control tower, blast-safe egress, salt protection, and clear heavy-lift circulation. It must look like a coastal aerospace facility, not a recolored inland pad.

Produce exactly 7 model families: `pelagic_apron`, `base_deployer_bay`, `crane_gantry`, `sea_wall_approach`, `harbor_control_tower`, `blast_deflector`, and `service_tunnel`. Include pad/end/corner/damage variants within those families. Keep the deployer and its strike aircraft in the same hangar language and show their servicing relationship.

Combined-arms contract: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech access, 18 x 8 m small-vehicle portal, 24 x 12 m medium-mech/deployer high bay, 16–18 m one-way apron lanes, 28–30 m two-way sea-wall route, 32 x 36 m passing bay, 48 m turning court, ramps <=8.3%. Gantry legs, blast walls, pad lights, water edge, props, and wrecks must not intrude.

Author exactly 2 seamless 2048 x 2048 PBR families: `aelos_salt_wet_apron_concrete` and `aelos_anticorrosion_aerospace_panel`. Supply neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, and restrained runway/hangar emissive. Include salt wetness, foam residue, and anti-corrosion wear without baked reflections. Prove 3 x 3 seams. Create 12 original decals for approach vectors, apron numbers, harbor channels, crane limits, blast zones, deployer service, rescue paths, and pad status.

Root `GSITE_AELOS_COAST_ADMIRALTY_SPACEPORT`; prefixes include `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `LZ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor pivots, hinge/rail pivots for doors/gantries, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve control tower, gantry, deployer bay, pad markings, and sea-wall silhouette.

Create deterministic `operational`, `storm_damaged`, `pad_breached`, and `collapsed_or_disabled` states; declare water and blast hazards. No Brood version on Aelos. In 412 x 915 phone portrait, show apron, bay, gantry, sea wall, landing zone, legal routes, and state through clear shapes and emission; tiny runway lamps cannot be the only route cue.

Deliver editable Spline source, source/runtime GLBs, exact 7-family list, material/decal manifests, LZ/proxy/LOD report, and provenance. References are visual-language only. Copy no protected aircraft, building, pad layout, mesh, texture, logo, faction mark, screenshot, or decal; create original MASSFRONT assets.
```

## `aelos_coast_pelagic_dome`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_coast_pelagic_dome`, planet Aelos, Harbor Command region, location class pressure dome. Build marine research domes connected by dry glass personnel tunnels and a distinct vehicle pressure tunnel, with sea anchors, utility hub, pressure locks, and authored intact/ruptured shells. It must read as a working coastal science habitat, not as an exterior hull texture on generic hemispheres.

Produce exactly 6 model families: `marine_lab_dome`, `dry_glass_connector`, `vehicle_pressure_tunnel`, `sea_anchor`, `utility_hub`, and `rupture_module`. Author straight/corner/T/end connectors inside the connector families and pressure-state variants inside relevant families. Keep building interiors implied through silhouettes and emissive occupancy, not opaque black glass.

Combined-arms contract: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid. Preserve 3 m personnel connectors, 14 x 7 m light-mech pressure door, 18 x 8 m vehicle door, 24 x 12 m medium-mech high-bay on the vehicle tunnel, 16–18 m one-way route, 28–30 m exterior two-way service road, a 32 x 36 m bypass bay, and 48 m turning court. Tunnel ribs, door leaves, anchor cables, sea clutter, and breach meshes may not violate envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `aelos_antisalt_pressure_glass_seal` and `aelos_marine_lab_composite`. Supply neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, and subtle dry-route/occupancy emissive. Include wet seals, algae contact, salt film, and dry tunnel flooring without baked highlights. Prove 3 x 3 seams and transparent-edge stability. Create 10 original decals for pressure zones, marine hazards, dry tunnel, airlock sequence, specimen handling, evacuation, rupture severity, and utility isolation.

Root `GSITE_AELOS_COAST_PELAGIC_DOME`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Pivots at floor or hinge, transforms applied, no negative scale, UV0/tangents, explicit alpha mode, separate simple collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; retain dome profile, connector hierarchy, vehicle tunnel, pressure doors, and rupture silhouette.

Create deterministic `pressurized_intact`, `seal_damaged`, `shell_breached`, and `collapsed_or_disabled` states with pressure/hazard metadata and safe extraction. No Brood variant for Aelos. At 412 x 915 phone portrait, the dome cluster, vehicle tunnel, dry personnel route, active lock, rupture state, and hazard boundary must remain clear without relying on glass micro-scratches or tiny decals.

Deliver editable Spline source, source/runtime GLBs, exact 6-family list, PBR/decal manifests, state/proxy/LOD report, and provenance. Study reference games only for legibility and atmosphere; copy no dome, texture, corridor, layout, logo, symbol, screenshot, or faction identity. All art must be original MASSFRONT work.
```

## `aelos_ridge_divide_relic`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_ridge_divide_relic`, planet Aelos, High Shelf region, location class relic/ruin. Build a Great Divide civic gate ruin, an old Nova monument, elevated processional route, ice-loaded arches, exposed alloy, and surveyed deterministic collapse states. It should feel culturally Aelos and historically layered, not alien or copied from another game's shrine.

Produce exactly 6 model families: `divide_gate_ruin`, `nova_civic_monument`, `processional_route`, `ice_loaded_arch`, `survey_station`, and `collapsed_arch_rubble`. Provide intact fragment, broken, and recovery variants inside each family as appropriate. Keep a primary vehicle route and a personnel archaeology flank visible through the ruin.

Combined-arms contract: meters, Y-up/-Z forward, 4 m grid and 16 m macro grid. Preserve 3 m personnel paths, 14 x 7 m light-mech arch, 18 x 8 m vehicle passage, 24 x 12 m medium-mech opening where admitted, 16–18 m one-way shelf lane, a 32 x 36 m refuge/passing bay, a 42–48 m turn court, and ramps <=8.3%. Ice, survey tripods, fallen stone, cables, and damage proxies cannot intrude into declared legal routes.

Author exactly 2 seamless 2048 x 2048 PBR families: `aelos_aged_civic_stone_inlay` and `aelos_ridge_ice_exposed_alloy`. Supply neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, restrained survey emissive, and no baked directional light. Include frost fracture, mineral streaking, rime, and exposed fracture faces. Prove 3 x 3 seams. Create 10 original decals for monument history, ridge coordinates, archaeology grids, weather closures, collapse risk, survey numbers, and recovery routes.

Root `GSITE_AELOS_RIDGE_DIVIDE_RELIC`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Floor/terrain-contact pivots, applied transforms, no negative scale, UV0/tangents, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve gate gap, monument silhouette, arch loading, processional route, and collapse state.

Create deterministic `surveyed_intact`, `ice_damaged`, `arch_breached`, and `collapsed_or_disabled` states. Tag rubble as personnel-passable or vehicle-blocking. No Brood variant for Aelos. At 412 x 915 phone portrait RTS view, gate, monument, legal route, flank, ice hazard, and state must read in silhouette and value; inscriptions are flavor only.

Deliver editable Spline source, source/runtime GLBs, exact 6-family inventory, PBR/decal manifests, route/proxy/LOD table, and provenance. References may inform scale and readability only. Do not copy protected ruins, architecture, textures, layouts, glyphs, logos, screenshots, or assets. All cultural language must be original MASSFRONT design.
```

## `aelos_ridge_shelf_megastructure`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `aelos_ridge_shelf_megastructure`, planet Aelos, High Shelf region, location class derelict megastructure. Build a collapsed cliff elevator and trans-ridge freight span with counterweight house, cable galleries, control structure, cliff anchors, exposed fractures, and authored partial-collapse tiers. The megastructure must dominate the tactical skyline while preserving readable ground routes.

Produce exactly 9 model families: `cliff_elevator_tower`, `freight_span`, `counterweight_house`, `cable_gallery`, `anchor_pier`, `freight_portal`, `lift_control_house`, `damaged_span`, and `collapse_endcap_rubble`. Provide measured straight/corner/end and state variants only within these families. Include a ground bypass, an elevated objective route, and a deterministic breach route.

Combined-arms contract: meters, Y-up/-Z forward, 4 m source grid and 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m freight/medium-mech portal, 16–18 m one-way road, 28–30 m two-way approach, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Cables, counterweights, snow, cliff rocks, collapsed decks, and support collision must stay clear of legal envelopes.

Author exactly 3 seamless 2048 x 2048 PBR families: `aelos_ridge_weathered_structural_steel`, `aelos_cold_freight_concrete`, and `aelos_cable_rime_fracture`. Supply neutral base color, tangent normal, ORM R/AO G/roughness B/metallic, optional height, and restrained lift/emergency emissive. Include cable grease, rime ice, cold concrete, and fracture faces without baked lighting. Prove 3 x 3 seams. Create a 16-entry original decal atlas for lift capacity, span sectors, freight clearance, wind shutdown, cable service, collapse chronology, rescue, and route state.

Root `GSITE_AELOS_RIDGE_SHELF_MEGASTRUCTURE`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/contact pivots; true pivots for lift and cable machinery; transforms applied, no negative scale, UV0/tangents, dedicated collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; retain tower/span silhouette, freight opening, counterweight, route gaps, and collapse tier.

Create deterministic `derelict_intact`, `cable_damaged`, `span_breached`, and `collapsed_or_disabled` states, with class-specific routes and safe extraction. No Brood variant for Aelos. At 412 x 915 phone portrait, elevator tower, bridge span, ground bypass, elevated objective, hazard, and current collapse tier must read without thin cables being the only cue.

Deliver editable Spline source, source/runtime GLBs, exact 9-family list, three-family PBR and 16-decal manifests, state/proxy/LOD report, and provenance. Reference games are not asset sources: do not copy or recreate their structures, meshes, materials, layouts, logos, symbols, screenshots, or damage. Produce original MASSFRONT design.
```
