# Pyraeth — Spline 3D production prompts

Status: source-authoring prompts only. Each block is a self-contained Spline brief for one unique preset. Pyraeth is a Crimson Dominion dusk-storm foundry world; do not reduce its eight locations to one red recolor.

## `pyraeth_crater_buried_court_dome`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_crater_buried_court_dome`, planet Pyraeth, Buried Court region, location class pressure dome. Build an armored pressure court embedded into a crater wall: buttressed shell, buried pressure locks, armored concourses, storm shutters, emergency-red glazing, shelter functions, and crater-mineral contact. It must be a defensible inhabited court rather than a generic glass hemisphere.

Produce exactly 6 model families: `crater_wall_dome`, `armored_concourse`, `buried_pressure_lock`, `shell_buttress`, `storm_shutter`, and `court_utility_core`. Provide straight/corner/end/intact/damage variants within those families, a separate personnel connector and vehicle lock, two legal exterior approaches, and an unobstructed court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech lock, 18 x 8 m vehicle lock, 24 x 12 m medium-mech high lock, 16–18 m one-way lane, 28–30 m two-way approach, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Buttresses, shutters, rubble, crater rocks, props, and collision must stay outside each validated envelope.

Author exactly 2 seamless 2048 x 2048 PBR families: `pyraeth_slag_dusted_dome_armor` and `pyraeth_emergency_glass_heat_seal`. Supply lighting-neutral base color, tangent normal, linear ORM R/AO G/roughness B/metallic, optional height, and restrained red pressure/status emissive. Include heat stress, crater dust, and worn seals without baked highlights. Prove 3 x 3 seams and transparent edge stability. Create 10 original decals for Dominion pressure sectors, lockdown, storm seals, court access, emergency shelter, breach state, and maintenance.

Root `GSITE_PYRAETH_CRATER_BURIED_COURT_DOME`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, applied transforms, no negative scale, UV0/tangents, declared alpha mode, separate simple collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve dome/buttress silhouette, pressure portals, turn court, shutters, and breach.

Create deterministic `pressurized_intact`, `storm_damaged`, `shell_breached`, and `collapsed_or_disabled` states with route and hazard metadata. No Brood variant belongs on Pyraeth. At a 412 x 915 phone portrait RTS view, the dome, vehicle lock, court, two approaches, pressure state, and red emergency hierarchy must be readable without tiny text or excessive glow.

Deliver editable Spline source, source/runtime GLBs, exact 6-family inventory, two PBR families, 10-decal manifest, proxy/LOD/state report, and provenance. C&C3, SupCom2, XCOM2, and SC2 are readability references only. Copy no mesh, dome, texture, layout, logo, symbol, faction mark, screenshot, or building; all assets must be original MASSFRONT design.
```

## `pyraeth_crater_court_of_iron_ruin`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_crater_court_of_iron_ruin`, planet Pyraeth, Buried Court region, location class relic/ruin. Build a Dynasty forge shrine with fractured statues, a slag-buried processional court, stairs, exposed furnace crypt, archaeology work, and deterministic ruin states. The site must communicate old Dominion culture without copying recognizable religious or game architecture.

Produce exactly 6 model families: `dynasty_forge_shrine`, `fractured_statue`, `slag_processional_court`, `furnace_crypt`, `court_stair`, and `excavation_shelter`. Variants stay inside these families. Maintain one combined-arms processional route, one personnel-only archaeology flank, meaningful cover, and an objective focus at the furnace crypt.

Combined-arms scale: meters, Y-up/-Z forward, 4 m source grid, 16 m macro grid; 3 m personnel flank, 14 x 7 m light-mech portal, 18 x 8 m vehicle passage, 24 x 12 m medium-mech opening where admitted, 16–18 m one-way court route, 32 x 36 m refuge bay, 42–48 m turn court, ramps <=8.3%. Statues, slag, stairs, rails, props, and rubble may not intrude into legal routes.

Author exactly 2 seamless 2048 x 2048 PBR families: `pyraeth_oxidized_iron_stone_relief` and `pyraeth_cooled_slag_furnace_scale`. Supply neutral base color, tangent normal, linear ORM, optional height, and only subtle dormant-status emissive. Include soot, heat cracks, oxide, and emberless scale; no baked lighting. Prove 3 x 3 seams. Create 10 original decals for dynasty foundry seals, memorial language, excavation grids, slag hazard, denial marks, route recovery, and structural warning; invent an original MASSFRONT script/symbol system.

Root `GSITE_PYRAETH_CRATER_COURT_OF_IRON_RUIN`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Pivots at floor/terrain contact, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve shrine, statue massing, furnace opening, route, and collapse state.

Create deterministic `surveyed_ruin`, `unstable_damaged`, `crypt_breached`, and `collapsed_or_disabled` states with class-specific rubble. No Brood variant for Pyraeth. In 412 x 915 phone portrait, shrine, crypt objective, processional route, flank, slag hazard, and damage state must read by silhouette/value rather than inscriptions.

Deliver editable Spline source, source/runtime GLBs, exact 6-family list, PBR/decal manifests, route/proxy/LOD report, and provenance. Reference games guide only scale, readable cover, and destruction language. Do not copy or trace any protected shrine, statue, texture, decal, layout, logo, icon, screenshot, or faction design.
```

## `pyraeth_belt_promethean_base`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_belt_promethean_base`, planet Pyraeth, Mech Foundry region, location class military base. Build a Crimson Dominion mech motor pool, measured proving lane, command keep, repair gantries, hardened magazines, and two independent heavy gate systems. It must be designed for machines and logistics, not scaled-up infantry architecture.

Produce exactly 8 model families: `mech_motor_pool`, `proving_lane`, `command_keep`, `repair_gantry`, `heavy_gate_alpha`, `heavy_gate_beta`, `magazine_bunker`, and `sensor_watchtower`. Provide bay/straight/corner/end/damage variants inside those families. Include two combined-arms approaches, a separate personnel maintenance flank, 48 m mech turn court, and readable firing exclusion zones.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m medium-mech gate/high bay, 16–18 m one-way proving lane, 28–30 m two-way road, 32 x 36 m passing bay every 60–80 m, 48 m turn court, ramps <=8.3%. Gantries, door leaves, bollards, target rigs, props, and rubble may not violate envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `pyraeth_dominion_armor_hot_hydraulic` and `pyraeth_scorched_proving_concrete`. Supply neutral base color, tangent normal, linear ORM, optional height, and restrained bay/gate/status emissive. Include heat scale, hydraulic residue, storm wetness, and localized scorching without baked light. Prove 3 x 3 seams. Create 14 original decals for mech bays, proving metrics, firing arcs, gate controls, command sectors, magazine hazard, repair safety, and route priority.

Root `GSITE_PYRAETH_BELT_PROMETHEAN_BASE`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor and true door/gantry pivots, applied transforms, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve motor-pool high bays, keep, both gates, proving route, and breach states.

Create deterministic `operational`, `battle_damaged`, `gate_breached`, and `collapsed_or_disabled` states; record which gate/route remains legal. No Brood variant on Pyraeth. In 412 x 915 phone portrait, command keep, motor pool, proving lane, both gates, approach routes, and state must be unmistakable without reading small bay numbers.

Deliver editable Spline source, source/runtime GLBs, exact 8-family list, two PBR families, 14-decal manifest, proxy/LOD/state table, and provenance. Use reference games only for combined-arms readability; do not copy their units, bases, gates, textures, layouts, logos, symbols, screenshots, or damage assets.
```

## `pyraeth_belt_iron_pyre_refinery`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_belt_iron_pyre_refinery`, planet Pyraeth, Mech Foundry region, location class refinery. Build a hot slag refinery with separators, furnace stack, pressure manifold, casting trench, control house, and complete heavy-vehicle circulation. Its silhouette and heat story must differ substantially from the clean Aelos refinery.

Produce exactly 8 model families: `slag_separator`, `furnace_stack`, `pressure_manifold`, `casting_trench`, `heavy_service_loop`, `refractory_control_house`, `emergency_cutoff_station`, and `slag_loading_bay`. Author straight/corner/end/state variants inside families. Include two legal routes or one primary plus an initially available breach bypass, personnel catwalks, and a 48 m turn court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid and 16 m macro grid; 3 m personnel catwalks, 14 x 7 m light-mech access, 18 x 8 m vehicle portal, 24 x 12 m medium-mech/high-load bay, 16–18 m one-way route, 28–30 m two-way road, 32 x 36 m passing bay, 48 m turning court, ramps <=8.3%. Pipes, trench lips, stack braces, valves, slag heaps, effects, and debris stay outside route envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `pyraeth_heat_scaled_furnace_steel` and `pyraeth_vitrified_slag_refractory`. Supply neutral base color, tangent normal, linear ORM R/AO G/roughness B/metallic, optional height, and controlled furnace/process emissive. Include hydraulic residue, storm oxidation, cooled slag, and refractory cracking without baked shadows. Prove 3 x 3 seams. Create 14 original decals for furnace zones, pressure class, slag routes, casting danger, service circulation, emergency cutoff, lockout, and maintenance.

Root `GSITE_PYRAETH_BELT_IRON_PYRE_REFINERY`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/contact and true machinery pivots, applied transforms, no negative scale, UV0/tangents, separate collision/nav/LOS/hazard proxies. LOD1 <=40%, LOD2 <=12%; retain stack, casting trench, loading bay, loop, hazard, and shutdown silhouette.

Create deterministic `operational_hot`, `pressure_damaged`, `line_breached`, and `collapsed_or_disabled` states with explicit slag/heat hazards and safe extraction. No Brood variant on Pyraeth. At 412 x 915 phone portrait, stack, trench, service loop, control house, legal routes, and current hazard state must read without relying on sparks or tiny valves.

Deliver editable Spline source, source/runtime GLBs, exact 8-family inventory, PBR/decal manifests, proxy/LOD/hazard report, and provenance. References are not asset sources. Do not copy any protected refinery, furnace, mesh, texture, layout, logo, symbol, effect, or screenshot; create original MASSFRONT assets.
```

## `pyraeth_caldera_ignis_arcology`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_caldera_ignis_arcology`, planet Pyraeth, Dome Arcology region, location class city/colony. Build dense stacked habitation under thermal domes and armored concourses, with heat bridges, inhabited service tiers, protected courts, and roads scaled for vehicles and mechs. It must feel occupied and vertically layered rather than a flat room or a wall of identical towers.

Produce exactly 7 model families: `thermal_hab_stack`, `dome_court`, `armored_concourse`, `heat_bridge`, `service_tier`, `civilian_shelter_core`, and `arcology_transit_portal`. Author height/corner/end/state variants inside these families. Make a legible civic objective, two road routes, a personnel upper route, and open turn courts under the skyline.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m medium-mech transit portal, 16–18 m one-way lanes, 28–30 m two-way roads, 32 x 36 m passing bays, 48 m turn court, ramps <=8.3%. Stairs, dome supports, bridge piers, street props, rubble, and overhangs must honor clearances.

Author exactly 2 seamless 2048 x 2048 PBR families: `pyraeth_thermal_ceramic_hab_composite` and `pyraeth_red_pressure_glass_armor`. Supply neutral base color, tangent normal, linear ORM, optional height, and restrained occupied-window/transit emissive. Include ash contact, heat weathering, and sealed panels without baked lighting. Prove 3 x 3 seams. Create 12 original decals for arcology sectors, hab services, dome pressure, heat routes, transit levels, shelter, evacuation, and civic utilities.

Root `GSITE_PYRAETH_CALDERA_IGNIS_ARCOLOGY`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, applied transforms, no negative scale, UV0/tangents, explicit glass alpha, simple separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve hab-stack rhythm, domes, bridges, portals, occupied glow, and route openings.

Create deterministic `inhabited_intact`, `thermal_damaged`, `concourse_breached`, and `collapsed_or_disabled` states with safe routes. No Brood variant on Pyraeth. In 412 x 915 phone portrait, the civic core, thermal domes, layered habitation, two roads, upper route, and damage state must read without relying on window micro-detail.

Deliver editable Spline source, source/runtime GLBs, exact 7-family list, two PBR and 12-decal manifests, route/proxy/LOD report, and provenance. Cited games guide readability only; copy no protected city, dome, texture, layout, logo, icon, faction mark, screenshot, or building design.
```

## `pyraeth_caldera_crucible_megastructure`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_caldera_crucible_megastructure`, planet Pyraeth, Dome Arcology region, location class derelict megastructure. Build a broken caldera heat-exchanger crown and abandoned arcology lift spine with intake bridges, thermal vanes, machinery core, mineral accretion, and deterministic collapse tiers. It must form a powerful caldera landmark with gameplay routes visible beneath it.

Produce exactly 9 model families: `heat_exchanger_crown`, `arcology_lift_spine`, `intake_bridge`, `thermal_vane`, `exchange_core`, `lift_rail_gallery`, `mineral_outflow`, `breached_crown_section`, and `collapse_rubble_endcap`. Keep variants inside families. Include a full-class ground route, elevated personnel/service route, breach bypass, and 48 m objective/turn court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech opening, 18 x 8 m vehicle portal, 24 x 12 m medium-mech freight portal, 16–18 m one-way lanes, 28–30 m two-way approach, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Vanes, bridge piers, rails, mineral deposits, collapse meshes, and effects may not invade clearances.

Author exactly 3 seamless 2048 x 2048 PBR families: `pyraeth_heat_bleached_superalloy`, `pyraeth_ash_ceramic_insulation`, and `pyraeth_oxidized_lift_mineral`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained emergency/thermal residual emissive, no baked sun or shadows, and a 3 x 3 seam proof. Create 16 original decals for thermal flow, exchanger sectors, lift limits, evacuation, shutdown chronology, structural breach, rescue, and route recovery.

Root `GSITE_PYRAETH_CALDERA_CRUCIBLE_MEGASTRUCTURE`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/axis pivots, applied transforms, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; retain crown, lift spine, bridge gaps, thermal vanes, portals, and collapse tier.

Create deterministic `derelict_stable`, `thermal_damaged`, `crown_breached`, and `collapsed_or_disabled` states, with class-aware route swaps and safe extraction. No Brood variant on Pyraeth. At 412 x 915 phone portrait, crown, spine, objective court, primary/bypass routes, hazard, and state must be recognizable without thin rails or particles.

Deliver editable Spline source, source/runtime GLBs, exact 9-family list, three PBR/16-decal manifests, state/proxy/LOD report, and provenance. Reference titles are for language study only; copy no protected structure, texture, layout, logo, symbol, screenshot, or damage design.
```

## `pyraeth_flats_hub_delta_spaceport`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_flats_hub_delta_spaceport`, planet Pyraeth, Orbital Aprons region, location class spaceport. Build heavy-lift pads, deep blast trenches, base-deployer service bays, storm barriers, armored approach lanes, and a recognizable Hub Delta control landmark. Make it a massive Dominion logistics installation, not a circular generic landing pad.

Produce exactly 7 model families: `heavy_lift_pad`, `blast_trench`, `deployer_service_bay`, `storm_barrier`, `armored_approach_lane`, `hub_delta_control`, and `fuel_service_block`. Author pad/corner/end/state variants within families. Keep the base deployer and supporting air unit visually serviced from the same hangar family, with clear approach and egress.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech access, 18 x 8 m vehicle access, 24 x 12 m medium-mech/deployer bay, 16–18 m one-way apron lane, 28–30 m two-way armored road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Trench walls, barriers, lights, fuel props, wrecks, and blast damage must remain outside legal envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `pyraeth_vitrified_apron_concrete` and `pyraeth_blast_scorched_aerospace_armor`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained pad/bay emissive, storm grit, fuel-resistant seals, and no baked highlights. Prove 3 x 3 seams. Create 12 original decals for Hub Delta pad IDs, heavy-lift vectors, blast clearance, deployer service, storm closure, convoy routes, rescue, and fuel hazard.

Root `GSITE_PYRAETH_FLATS_HUB_DELTA_SPACEPORT`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `LZ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve pads, blast trenches, deployer bay, approach lanes, control landmark, and state.

Create deterministic `operational`, `storm_damaged`, `pad_breached`, and `collapsed_or_disabled` states. No Brood variant on Pyraeth. In 412 x 915 phone portrait, pads, trenches, bay, control, route network, landing zone, and state must read by bold geometry and markings—not particles or tiny lamps.

Deliver editable Spline source, source/runtime GLBs, exact 7-family inventory, two PBR/12-decal manifests, LZ/proxy/LOD report, and provenance. Use reference games for scale and RTS hierarchy only. Copy no protected spaceport, aircraft, unit, texture, pad layout, logo, icon, faction mark, or screenshot.
```

## `pyraeth_flats_blackwind_outpost`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `pyraeth_flats_blackwind_outpost`, planet Pyraeth, Orbital Aprons region, location class outpost. Build a low armored storm-monitoring bunker, grounded sensor mast, convoy hold, windbreak walls, and compact circulation loop. The set must survive a high-wind silhouette test and remain distinct from the Aelos agricultural outpost.

Produce exactly 4 model families: `blackwind_storm_bunker`, `grounded_sensor_mast`, `convoy_hold`, and `windbreak_wall`. Provide straight/corner/end/damage variants within families. Add a service loop, a sheltered personnel flank, grounding nodes, and one readable telemetry objective.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech access, 18 x 8 m vehicle portal, 16–18 m one-way armored loop, 32 x 36 m convoy/passing bay, ramps <=8.3%. This compact compound may exclude medium mechs internally, but its exterior road must retain a 24 x 12 m transit envelope; declare admission limits. Windbreaks, anchors, grit drifts, props, and rubble cannot narrow routes.

Author exactly 1 seamless 2048 x 2048 PBR family, `pyraeth_blackwind_sandblasted_plate`, with neutral base color, tangent normal, linear ORM, optional height, restrained telemetry/static-discharge emissive, sandblasted armor, storm grit, sealed glass, rubber barriers, and no baked light. Prove 3 x 3 seams. Create 8 original decals for Blackwind telemetry, convoy staging, wind hazard, grounding points, shelter, approach limits, maintenance, and emergency status.

Root `GSITE_PYRAETH_FLATS_BLACKWIND_OUTPOST`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Floor pivots, transforms applied, no negative scale, UV0/tangents, separate simple collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve low bunker, mast, windbreak rhythm, convoy bay, and damage state.

Create deterministic `operational`, `storm_damaged`, `perimeter_breached`, and `collapsed_or_disabled` states. No Brood variant on Pyraeth. At 412 x 915 phone portrait, bunker, mast, convoy hold, sheltered route, hazard direction, and state must remain readable without individual bolts or airborne dust.

Deliver editable Spline source, source/runtime GLBs, exact 4-family list, one PBR/8-decal manifest, admission/proxy/LOD report, and provenance. Reference games guide readability only. Do not copy or trace protected bunkers, textures, layouts, logos, marks, props, screenshots, or faction design; make original MASSFRONT art.
```
