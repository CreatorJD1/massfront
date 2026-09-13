# Nordhall — Spline 3D production prompts

Status: source-authoring prompts only. Each block creates one dedicated Syndicate Coalition location. Nordhall is a glacial machine-vault world; preserve automation, cryogenic industry, frontline scars, and orbital-weather identity without making every set the same icy recolor.

## `nordhall_isles_frostwake_spaceport`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_isles_frostwake_spaceport`, planet Nordhall, Frostwake Grid region, location class spaceport. Build ice-dock landing decks, heated approach strips, crane bridges, sealed machine hangars, sub-ice supports, deicing systems, and whiteout-safe circulation. The silhouette must combine polar engineering and aerospace logistics, not a normal pad with snow painted on it.

Produce exactly 7 model families: `ice_dock_deck`, `heated_approach_strip`, `crane_bridge`, `sealed_machine_hangar`, `subice_service_support`, `deicing_station`, and `frostwake_control_tower`. Author straight/corner/end/state variants inside these families. Include a common hangar relationship for the base deployer and supporting air unit, two legal routes, and a 48 m turn court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech access, 18 x 8 m vehicle portal, 24 x 12 m medium-mech/deployer high bay, 16–18 m one-way lane, 28–30 m two-way dock road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Crane legs, ice ridges, heated-strip housings, props, wrecks, and snow damage cannot invade envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `nordhall_frosted_automation_alloy` and `nordhall_heated_wet_dock_surface`. Supply neutral base color, tangent normal, linear ORM R/AO G/roughness B/metallic, optional height, and restrained polar lane/hangar emissive. Include rime glass, deicing residue, wet heat bands, and ice contact without baked reflections. Prove 3 x 3 seams. Create 12 original decals for Frostwake dock IDs, heated routes, ice load, crane clearance, hangar sequence, whiteout approaches, rescue, and pad status.

Root `GSITE_NORDHALL_ISLES_FROSTWAKE_SPACEPORT`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `LZ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, applied transforms, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve dock, heated lanes, crane bridge, high bay, tower, and damage state.

Create deterministic `operational`, `ice_damaged`, `hangar_breached`, and `collapsed_or_disabled` states with ice-load and route metadata. No Brood variant belongs on Nordhall. At 412 x 915 phone portrait, dock edge, heated route, hangar, crane, landing zone, whiteout-safe markers, and state must read without particles or tiny lights.

Deliver editable Spline source, source/runtime GLBs, exact 7-family inventory, two PBR/12-decal manifests, LZ/proxy/LOD report, and provenance. C&C3, SupCom2, XCOM2, and SC2 are visual-language references only. Copy no protected mesh, aircraft, port, texture, layout, logo, icon, faction mark, or screenshot; all art must be original MASSFRONT work.
```

## `nordhall_isles_core_vault_outpost`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_isles_core_vault_outpost`, planet Nordhall, Frostwake Grid region, location class outpost. Build a concealed sensor vault with retractable mast, sub-ice service loop, thermal hatch, and compact drone recess. It should appear intentionally buried and machine-operated, not like a snow-covered field hut.

Produce exactly 4 model families: `concealed_sensor_vault`, `retractable_mast`, `subice_service_loop`, and `thermal_drone_hatch`. Provide closed/open/damage variants inside those families. Include a personnel service route, 18 m vehicle loop, drone lanes, and a clear sensor objective zone.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech portal, 18 x 8 m service-vehicle portal, 16–18 m one-way loop, 32 x 36 m service/passing bay, ramps <=8.3%. Internally the compact outpost may exclude medium mechs, but its exterior approach retains a 24 x 12 m transit envelope and the admission limit must be declared. Ice berms, hatch leaves, drones, mast supports, and debris cannot narrow routes.

Author exactly 1 seamless 2048 x 2048 PBR family, `nordhall_core_vault_alloy_ice`, with neutral base color, tangent normal, linear ORM, optional height, restrained sensor/thermal emissive, low-reflectance alloy, ice crust, heated seals, sensor glass, and machine-oil contact. No baked lighting. Prove 3 x 3 seams. Create 8 original decals for vault access, drone lanes, thermal hatch, sensor bearings, ice limits, covert service, emergency opening, and maintenance.

Root `GSITE_NORDHALL_ISLES_CORE_VAULT_OUTPOST`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Floor/hinge/rail pivots, transforms applied, no negative scale, UV0/tangents, separate simple collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve vault mound, mast, loop, hatch, and state silhouette.

Create deterministic `concealed_operational`, `ice_damaged`, `vault_breached`, and `collapsed_or_disabled` states. No Brood variant on Nordhall. At 412 x 915 phone portrait, vault footprint, mast state, service loop, hatch, objective, and hazard must remain readable without individual drones or tiny panel marks.

Deliver editable Spline source, source/runtime GLBs, exact 4-family list, one PBR/8-decal manifest, admission/proxy/LOD report, and provenance. Reference titles guide readability only. Copy no protected bunker, vault, texture, layout, unit, icon, logo, screenshot, or faction identity.
```

## `nordhall_cliff_citadel_base`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_cliff_citadel_base`, planet Nordhall, Frontline Shelf region, location class military base. Build a stepped cliff fortress, drone bays, command vault, two measured approach ramps, cliff anchors, and artillery-scarred terraces. The site must use vertical terrain intelligently while remaining navigable for vehicles and medium mechs.

Produce exactly 8 model families: `stepped_citadel_terrace`, `drone_bay`, `command_vault`, `approach_ramp_alpha`, `approach_ramp_beta`, `cliff_anchor`, `fortress_gate`, and `sensor_artillery_tower`. Author straight/corner/end/damage variants inside families. Keep both approach ramps independent, protected personnel stairs, a 48 m upper turn court, and clear drone launch zones.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech portal, 18 x 8 m vehicle gate, 24 x 12 m medium-mech gate, 16–18 m one-way ramp, 28–30 m two-way court road, 32 x 36 m passing bay, 48 m turn court, ramp grades <=8.3%. Parapets, anchors, gun scars, snowbanks, props, and rubble cannot intrude into route envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `nordhall_cold_fortress_alloy` and `nordhall_impact_scarred_ice_concrete`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained drone/command emissive, wind frost, and exposed cliff-anchor wear without baked light. Prove 3 x 3 seams. Create 14 original decals for citadel tiers, drone launch, ramp priority, artillery danger, command access, whiteout evacuation, gate state, and maintenance.

Root `GSITE_NORDHALL_CLIFF_CITADEL_BASE`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/contact and true gate pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve stepped silhouette, command vault, both ramps, bays, gates, and damage.

Create deterministic `operational`, `artillery_damaged`, `ramp_or_gate_breached`, and `collapsed_or_disabled` states, with class-specific route tables. No Brood variant on Nordhall. At 412 x 915 phone portrait, terrace hierarchy, two approaches, vault objective, drone bays, legal route, and state must read even under whiteout color grading.

Deliver editable Spline source, source/runtime GLBs, exact 8-family inventory, two PBR/14-decal manifests, proxy/LOD/state report, and provenance. Use reference games only to study scale and tactical clarity. Copy no protected fortress, tower, unit, texture, layout, logo, icon, faction mark, or screenshot.
```

## `nordhall_cliff_arcology_steps_colony`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_cliff_arcology_steps_colony`, planet Nordhall, Frontline Shelf region, location class city/colony. Build a terraced machine-city with protected civilian/service cores, cliff lifts, heat corridors, automation courts, inhabited windows, and roads wide enough for combined arms. It must look lived-in and functionally layered, not like the citadel with softer colors.

Produce exactly 7 model families: `terraced_machine_hab`, `protected_service_core`, `cliff_lift`, `heat_corridor`, `automation_court`, `civic_transit_portal`, and `inhabited_facade_module`. Author height/corner/end/damage variants inside families. Provide two road routes, elevated personnel circulation, a 48 m civic turn court, and clear service/occupancy hierarchy.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel paths, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m medium-mech transit opening, 16–18 m one-way terrace lane, 28–30 m two-way road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Lift piers, heat ducts, street furniture, snow, railings, and debris must not violate envelopes.

Author exactly 2 seamless 2048 x 2048 PBR families: `nordhall_machine_vault_hab_alloy` and `nordhall_insulated_heated_glazing`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained occupied-core/heat-route emissive, frost shadow, and insulated panels without baked light. Prove 3 x 3 seams. Create 12 original decals for terrace levels, machine service, protected cores, lift routes, heat shelters, civilian circulation, utility access, and evacuation.

Root `GSITE_NORDHALL_CLIFF_ARCOLOGY_STEPS_COLONY`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge/lift pivots, applied transforms, no negative scale, UV0/tangents, explicit glass alpha, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve terrace rhythm, inhabited cores, lift, heat corridor, roads, and damage state.

Create deterministic `inhabited_intact`, `frontline_damaged`, `core_breached`, and `collapsed_or_disabled` states with safe civilian/vehicle routes. No Brood variant on Nordhall. In 412 x 915 phone portrait, civic core, terraces, roads, lift, heat routes, occupancy, and state must read without relying on tiny window detail.

Deliver editable Spline source, source/runtime GLBs, exact 7-family list, two PBR/12-decal manifests, route/proxy/LOD report, and provenance. Reference games guide readability only. Copy no protected city, building, texture, layout, logo, symbol, faction identity, unit, or screenshot.
```

## `nordhall_frost_pale_trench_refinery`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_frost_pale_trench_refinery`, planet Nordhall, Reactor Rift region, location class refinery. Build a cryogenic reactor/refinery straddling a crevasse: reactor train, service bridges, coolant towers, buried processing vault, bypass loop, isolation systems, and visible condensate hazards. It must differ from hot Pyraeth and clean Aelos refineries in silhouette and material response.

Produce exactly 8 model families: `cryo_reactor_train`, `crevasse_service_bridge`, `coolant_tower`, `buried_processing_vault`, `bypass_loop`, `isolation_valve_station`, `thermal_control_house`, and `fractured_shelf_support`. Author straight/corner/end/state variants within these families. Include a full vehicle route, alternate bypass, personnel catwalk flank, and 48 m service court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel catwalk, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m medium-mech/high-load bay, 16–18 m one-way route, 28–30 m two-way service road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Bridge trusses, pipes, ice growth, valves, crevasse lips, props, and wrecks stay outside clearances.

Author exactly 2 seamless 2048 x 2048 PBR families: `nordhall_cryogenic_alloy_insulation` and `nordhall_condensate_ice_coolant_stain`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained coolant/reactor emissive, no baked lighting, and a 3 x 3 seam proof. Create 14 original decals for coolant flow, reactor zones, bridge loads, thermal warnings, isolation valves, crevasse evacuation, shutdown, and service routes.

Root `GSITE_NORDHALL_FROST_PALE_TRENCH_REFINERY`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/contact and valve pivots, applied transforms, no negative scale, UV0/tangents, separate collision/nav/LOS/hazard proxies. LOD1 <=40%, LOD2 <=12%; preserve reactor rhythm, bridge, towers, vault, bypass, and rupture state.

Create deterministic `operational_cold`, `coolant_damaged`, `bridge_or_line_breached`, and `collapsed_or_disabled` states with hazard and class-route metadata. No Brood variant on Nordhall. At 412 x 915 phone portrait, crevasse, reactor train, bridge, bypass, hazard, objective, and state must be legible without vapor effects.

Deliver editable Spline source, source/runtime GLBs, exact 8-family inventory, two PBR/14-decal manifests, proxy/LOD/hazard report, and provenance. References are visual-language study only. Copy no protected refinery, reactor, bridge, texture, layout, logo, symbol, screenshot, or faction art.
```

## `nordhall_frost_reactor_megastructure`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_frost_reactor_megastructure`, planet Nordhall, Reactor Rift region, location class derelict megastructure. Build a failed planetary heat sink and fractured cooling cathedral with giant fins, reactor spine, collapsed coolant bridges, exposed thermal wells, and deterministic rupture tiers. It must feel planetary in purpose yet remain readable as a compact RTS combat environment.

Produce exactly 9 model families: `planetary_heat_sink_fin`, `cooling_cathedral`, `reactor_spine`, `coolant_bridge`, `thermal_well`, `service_pylon`, `ruptured_coolant_chamber`, `collapsed_fin_section`, and `rubble_route_endcap`. Author straight/corner/end/state variants within families. Provide a full-class ground route, elevated personnel/service route, deterministic breach bypass, and 48 m objective court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech opening, 18 x 8 m vehicle portal, 24 x 12 m medium-mech opening, 16–18 m one-way lane, 28–30 m two-way approach, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Fins, bridge debris, frozen coolant, well lips, support collision, and effects may not invade legal envelopes.

Author exactly 3 seamless 2048 x 2048 PBR families: `nordhall_frost_fractured_superalloy`, `nordhall_frozen_coolant_thermal_ceramic`, and `nordhall_rime_rupture_surface`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained residual/emergency emissive, no baked light, and a 3 x 3 seam proof. Create 16 original decals for heat-sink sectors, coolant circuits, reactor chronology, bridge closure, collapse zones, recovery routes, thermal wells, and hazard state.

Root `GSITE_NORDHALL_FROST_REACTOR_MEGASTRUCTURE`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/axis pivots, transforms applied, no negative scale, UV0/tangents, separate simple collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve cathedral, fin field, spine, wells, bridge gaps, and collapse state.

Create deterministic `derelict_stable`, `coolant_damaged`, `cathedral_breached`, and `collapsed_or_disabled` states, with class-aware route swaps and safe extraction. No Brood variant on Nordhall. At 412 x 915 phone portrait, cathedral, heat-sink fins, spine, primary/bypass routes, hazard, and state must read without vapor or tiny piping.

Deliver editable Spline source, source/runtime GLBs, exact 9-family list, three PBR/16-decal manifests, state/proxy/LOD report, and provenance. Never copy a protected megastructure, texture, layout, logo, icon, screenshot, faction mark, or damage design; reference titles only inform readability.
```

## `nordhall_peaks_skyshield_dome`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_peaks_skyshield_dome`, planet Nordhall, Orbital Weather region, location class pressure dome. Build weather-control domes with a sensor crown, lightning-ground towers, pressure connectors, control core, and meteor-shutter states. The location must look like polar atmospheric infrastructure, not a shield VFX or generic hab dome.

Produce exactly 6 model families: `weather_control_dome`, `sensor_crown`, `lightning_ground_tower`, `pressure_connector`, `meteor_shutter`, and `skyshield_control_core`. Author straight/corner/end/open/closed/damage variants inside families. Include one personnel connector network, one vehicle pressure route, grounding exclusion zones, and a clear control objective.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech pressure door, 18 x 8 m vehicle portal, 24 x 12 m medium-mech high lock, 16–18 m one-way lane, 28–30 m exterior two-way road, 32 x 36 m bypass bay, 48 m turn court, ramps <=8.3%. Towers, shutters, ground cables, rime, props, and damage cannot violate clearances.

Author exactly 2 seamless 2048 x 2048 PBR families: `nordhall_polar_pressure_glass_seal` and `nordhall_conductive_weather_alloy`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained weather-sensor/grounding emissive, arc scoring, rime seals, no baked highlights, and 3 x 3 seam/alpha proof. Create 10 original decals for Skyshield sectors, grounding grid, meteor alert, pressure sequence, sensor exclusion, storm shelter, shutter state, and maintenance.

Root `GSITE_NORDHALL_PEAKS_SKYSHIELD_DOME`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, transforms applied, no negative scale, UV0/tangents, explicit glass alpha, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve dome cluster, sensor crown, towers, vehicle connector, shutters, and state.

Create deterministic `operational`, `storm_damaged`, `pressure_breached`, and `collapsed_or_disabled` states with lightning and pressure hazard metadata. No Brood variant on Nordhall. In 412 x 915 phone portrait, dome hierarchy, crown, grounding grid, vehicle route, pressure state, and objective must read without animated lightning.

Deliver editable Spline source, source/runtime GLBs, exact 6-family inventory, two PBR/10-decal manifests, proxy/LOD/state report, and provenance. Reference games guide scale/legibility only. Copy no protected dome, force field, structure, texture, layout, logo, symbol, faction mark, or screenshot.
```

## `nordhall_peaks_valkyrie_relic`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `nordhall_peaks_valkyrie_relic`, planet Nordhall, Orbital Weather region, location class relic/ruin. Build an ancient storm beacon and buried machine oracle with wind-cut processional path, antenna fragments, surveyed ice exposure, and meteor damage. It must feel older than Syndicate infrastructure while remaining an original MASSFRONT culture.

Produce exactly 6 model families: `ancient_storm_beacon`, `buried_machine_oracle`, `wind_processional_path`, `antenna_fragment`, `survey_excavation`, and `meteor_breach_rubble`. Keep intact/exposed/damage variants inside families. Include a vehicle approach where admitted, personnel survey flank, clear beacon objective, and deterministic excavation route.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech portal, 18 x 8 m vehicle passage, 24 x 12 m medium-mech exterior opening where admitted, 16–18 m one-way shelf road, 32 x 36 m refuge/passing bay, 42–48 m turn court, ramps <=8.3%. Ice, antenna fragments, excavation gear, rocks, and rubble may not narrow legal routes.

Author exactly 2 seamless 2048 x 2048 PBR families: `nordhall_ancient_machine_metal` and `nordhall_wind_polished_ice_meteor`. Supply neutral base color, tangent normal, linear ORM, optional height, only subtle dormant sensor emissive, mineral oxide, dead glass, meteor pitting, no baked lighting, and a 3 x 3 seam proof. Create 10 original decals for Valkyrie survey grids, beacon bearings, oracle access, weather history, excavation, recovery, structural danger, and route state using original symbols.

Root `GSITE_NORDHALL_PEAKS_VALKYRIE_RELIC`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Floor/terrain pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve beacon, oracle opening, route, antenna rhythm, excavation, and breach state.

Create deterministic `dormant_exposed`, `weather_damaged`, `oracle_breached`, and `collapsed_or_disabled` states with class-specific rubble. No Brood variant on Nordhall. At 412 x 915 phone portrait, beacon, buried oracle, route, flank, hazard, and current excavation/breach state must read without relying on tiny glyphs.

Deliver editable Spline source, source/runtime GLBs, exact 6-family list, two PBR/10-decal manifests, proxy/LOD/state report, and provenance. References may guide only tactical readability and atmosphere. Do not copy any protected relic, beacon, texture, glyph, layout, logo, icon, screenshot, or faction design.
```
