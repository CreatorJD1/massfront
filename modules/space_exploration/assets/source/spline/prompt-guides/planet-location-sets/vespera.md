# Vespera — Spline 3D production prompts

Status: source-authoring prompts only. Vespera is an abandoned civilization overtaken by the hostile, non-playable, non-humanoid Brood. Brood tissue is dedicated living geometry and material work, never a recolor or a usable faction-building skin. Each prompt includes an infestation progression appropriate to that site.

## `vespera_spire_caldera_colony_shell`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_spire_caldera_colony_shell`, planet Vespera, Caldera Nests region, location class city/colony. Build recognizable evacuated colony blocks, a civic road, rupture line, survivor-access shells, and a dedicated Brood spire tearing through the settlement. This is an abandoned civilian city consumed by an enemy organism—not a Brood city and not a playable organic faction base.

Produce exactly 7 model families: `evacuated_colony_block`, `civic_route_module`, `survivor_access_shell`, `ruptured_civic_core`, `brood_spire`, `tissue_contact_transition`, and `evacuation_checkpoint`. Keep straight/corner/end and infestation-state variants within those families. Provide two combined-arms road routes, a personnel survivor flank, a 48 m civic turn court, and a clear spire objective.

Combined-arms scale: meters, Y-up/-Z forward, 4 m source grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m medium-mech opening, 16–18 m one-way lane, 28–30 m two-way road, 32 x 36 m passing bays, 48 m turn court, ramps <=8.3%. Tissue, roots, pods, abandoned props, collapsed facades, ash, and collision may not intrude into routes unless the named deterministic state explicitly changes that route.

Author exactly 2 seamless 2048 x 2048 PBR families: `vespera_abandoned_colony_composite_ash` and `vespera_living_chitin_tissue_contact`. Supply neutral base color, tangent normal, linear ORM R/AO G/roughness B/metallic, optional height, and restrained living neural/evacuation emissive. Create graded mineral-to-tissue contact masks, not a hard texture overlay; no baked light. Prove 3 x 3 seams. Create 12 original decals for colony districts, evacuation, quarantine, survivor routes, spire hazard, infestation progression, UGA purge, and route closure.

Root `GSITE_VESPERA_SPIRE_CALDERA_COLONY_SHELL`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/contact pivots, transforms applied, no negative scale, UV0/tangents, separate simple collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; preserve colony/spire contrast, road openings, survivor shell, tissue boundary, and damage state.

Create deterministic infestation variants `B0_evacuated_clean`, `B1_spore_contact`, `B2_route_encroachment`, `B3_spire_breach`, and `B4_spire_purged`, mapped to intact/damaged/breached/collapsed-or-disabled runtime states. Brood growth must be asymmetrical, vascular, non-humanoid, and visibly hostile; it cannot resemble a selectable production building. At 412 x 915 phone portrait, colony blocks, spire, two routes, survivor flank, objective, and B-state must read without particles or tiny tendrils.

Deliver editable Spline source, source/runtime GLBs, exact 7-family inventory, two PBR/12-decal manifests, B-state/proxy/LOD report, and provenance. C&C3, SupCom2, XCOM2, and SC2 guide only readability, destruction, infestation staging, and scale. Copy no protected hive, city, texture, layout, logo, unit, creature, screenshot, or faction language. Make original MASSFRONT biology and architecture.
```

## `vespera_spire_infested_pressure_dome`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_spire_infested_pressure_dome`, planet Vespera, Caldera Nests region, location class pressure dome. Build abandoned colonial pressure domes with quarantine locks, membrane breaches, collapsed connectors, intact survivor pockets, and clearly staged infestation. The original dome engineering must remain readable beneath the Brood takeover.

Produce exactly 6 model families: `colonial_pressure_dome`, `quarantine_lock`, `pressure_connector`, `membrane_breach`, `survivor_safe_cell`, and `collapsed_connector`. Author straight/corner/T/end and intact/infested variants within families. Include personnel and vehicle connector graphs, a 48 m exterior turn court, and a quarantine objective that does not block extraction.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel connector, 14 x 7 m light-mech lock, 18 x 8 m vehicle lock, 24 x 12 m medium-mech high lock, 16–18 m one-way route, 28–30 m exterior two-way road, 32 x 36 m bypass bay, 48 m turn court, ramps <=8.3%. Membranes, shutters, roots, spore pods, shell shards, and rubble cannot violate a legal envelope unless that B-state declares a route swap.

Author exactly 2 seamless 2048 x 2048 PBR families: `vespera_heat_clouded_pressure_glass_seal` and `vespera_living_membrane_acid_contact`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained pressure/neural emissive, failed seals, ash, acidic staining, and organic transition masks without baked reflections. Prove 3 x 3 seams and transparent-edge stability. Create 10 original decals for pressure loss, quarantine, habitat sectors, breach severity, spore danger, sealed survivor routes, purge state, and emergency isolation.

Root `GSITE_VESPERA_SPIRE_INFESTED_PRESSURE_DOME`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, transforms applied, no negative scale, UV0/tangents, explicit glass/membrane alpha, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; retain dome shells, vehicle connector, locks, survivor cell, membrane breach, and state.

Create deterministic `B0_abandoned_pressurized`, `B1_spore_seep`, `B2_membrane_breach`, `B3_connector_occluded`, and `B4_purged_vented` variants mapped to the four runtime states. Brood is hostile, non-humanoid, and never a usable building. At 412 x 915 phone portrait, dome hierarchy, vehicle route, survivor cell, breach, hazard, and B-state must read without transparent overlap becoming visual noise.

Deliver editable Spline source, source/runtime GLBs, exact 6-family list, two PBR/10-decal manifests, B-state/proxy/LOD report, and provenance. Reference titles are not asset sources. Copy no protected dome, membrane, hive, texture, layout, logo, creature, screenshot, or faction design.
```

## `vespera_dunes_tide_relay_outpost`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_dunes_tide_relay_outpost`, planet Vespera, Infestation Fields region, location class outpost. Build an abandoned resident/UGA relay shelter, damaged mast, compact service loop, spore-field berms, and authored tissue encroachment. It must remain identifiable as failed communications infrastructure even at advanced infestation.

Produce exactly 4 model families: `abandoned_relay_shelter`, `damaged_relay_mast`, `spore_field_berm`, and `tissue_encroachment_module`. Author loop/end/state variants inside these families. Include a personnel approach, 18 m service loop, relay objective, containment foothold, and declared medium-mech exclusion inside the compact outpost.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech access, 18 x 8 m vehicle portal, 16–18 m one-way loop, 32 x 36 m service/passing bay, ramps <=8.3%; retain a 24 x 12 m exterior transit envelope. Spore berms, roots, mast wreckage, props, and collision cannot narrow legal routes unless a deterministic B-state opens a marked alternate.

Author exactly 1 seamless 2048 x 2048 PBR family, `vespera_relay_composite_spore_contact`, with neutral base color, tangent normal, linear ORM, optional height, restrained signal/neural emissive, sun-bleached composite, ash dust, spore crust, oxidized metal, and organic contact masks. No baked lighting; prove 3 x 3 seams. Create 8 original decals for relay identity, last service, quarantine, spore field, signal loss, UGA containment, safe route, and purge state.

Root `GSITE_VESPERA_DUNES_TIDE_RELAY_OUTPOST`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Floor/contact pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve shelter, mast angle, loop, berm rhythm, tissue boundary, and state.

Create deterministic `B0_abandoned_clean`, `B1_spore_perimeter`, `B2_tissue_contact`, `B3_relay_occluded`, and `B4_purged_relay` variants. Brood tissue is non-humanoid hostile growth, not a playable structure. At 412 x 915 phone portrait, shelter, mast, service loop, objective, hazard boundary, and B-state must read without individual spores or particles.

Deliver editable Spline source, source/runtime GLBs, exact 4-family inventory, one PBR/8-decal manifest, admission/B-state/proxy/LOD report, and provenance. Use reference games only to study readability. Copy no protected relay, infestation, texture, layout, logo, unit, creature, icon, or screenshot.
```

## `vespera_dunes_ichor_relic`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_dunes_ichor_relic`, planet Vespera, Infestation Fields region, location class relic/ruin. Build a pre-infestation landmark with buried processional stones, fossilized tissue ribs, ichor channels, excavation cuts, and fresh living seams. The human/alien cultural ruin and later Brood accretion must remain visually separable.

Produce exactly 6 model families: `preinfestation_landmark`, `buried_processional_stone`, `fossilized_tissue_rib`, `ichor_channel`, `excavation_cut`, and `living_seam_cluster`. Author straight/corner/end/state variants inside families. Maintain one vehicle approach, one personnel archaeology flank, a clear landmark objective, and hazard channels that never become ambiguous roads.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech passage, 18 x 8 m vehicle passage, 24 x 12 m medium-mech exterior opening where admitted, 16–18 m one-way route, 32 x 36 m refuge bay, 42–48 m turn court, ramps <=8.3%. Ribs, ichor, excavation gear, sand drifts, tissue, and rubble may not invade legal envelopes except through a named deterministic route change.

Author exactly 2 seamless 2048 x 2048 PBR families: `vespera_ancient_mineral_ash_surface` and `vespera_calcified_crust_ichor_tissue`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained fresh-tissue emissive, dried-ichor roughness, calcified age variation, and no baked lighting. Prove 3 x 3 seams. Create 10 original decals for archaeology grids, landmark history, containment survey, ichor hazard, tissue age, recovery paths, route state, and UGA sampling.

Root `GSITE_VESPERA_DUNES_ICHOR_RELIC`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `OCCLUDER_`. Floor/contact pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/hazard proxies. LOD1 <=40%, LOD2 <=12%; preserve landmark, rib silhouettes, channel network, flank, tissue age, and state.

Create deterministic `B0_preinfestation_exposed`, `B1_fossil_crust`, `B2_fresh_seams`, `B3_ichor_active_breach`, and `B4_sampled_purged` variants. Brood growth is non-humanoid and cannot resemble a usable building. At 412 x 915 phone portrait, landmark, processional route, ichor hazard, excavation flank, objective, and B-state must read without tiny glyphs or fluid effects.

Deliver editable Spline source, source/runtime GLBs, exact 6-family list, two PBR/10-decal manifests, B-state/proxy/LOD report, and provenance. References may guide infestation readability only. Copy no protected relic, organic architecture, texture, glyph, layout, creature, logo, screenshot, or faction design.
```

## `vespera_refinery_megaforge_refinery`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_refinery_megaforge_refinery`, planet Vespera, Magma Hatcheries region, location class refinery. Build an industrial megaforge with magma intake, process line, vehicle service loop, hatchery chambers, tissue-clogged process gates, and purge-state machinery. Preserve a clear distinction between abandoned industrial geometry and hostile living takeover.

Produce exactly 8 model families: `magma_intake`, `megaforge_process_line`, `heavy_service_loop`, `hatchery_chamber`, `tissue_clogged_gate`, `refractory_control_core`, `slag_loading_bay`, and `purge_isolation_station`. Author straight/corner/end/state variants inside families. Include two combined-arms routes or one route plus an initially available breach bypass, personnel catwalks, and 48 m turn court.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel catwalk, 14 x 7 m light-mech access, 18 x 8 m vehicle portal, 24 x 12 m medium-mech high bay, 16–18 m one-way loop, 28–30 m two-way road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Magma curbs, pipes, hatchery membranes, roots, gates, debris, and collision cannot intrude unless a B-state declares route replacement.

Author exactly 2 seamless 2048 x 2048 PBR families: `vespera_vitrified_forge_refractory` and `vespera_hatchery_membrane_acid_slag`. Supply neutral base color, tangent normal, linear ORM, optional height, controlled magma/neural emissive, heat-dead metal, living wetness, and graded tissue contact without baked light. Prove 3 x 3 seams. Create 14 original decals for forge flow, magma danger, process lanes, shutdown, quarantine, hatchery objective, purge states, emergency isolation, and service routes.

Root `GSITE_VESPERA_REFINERY_MEGAFORGE_REFINERY`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge/axis pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/hazard proxies. LOD1 <=40%, LOD2 <=12%; preserve magma intake, forge line, loop, hatchery volumes, process gates, and state.

Create deterministic `B0_abandoned_forge`, `B1_spore_contact`, `B2_hatchery_takeover`, `B3_process_gate_occlusion`, and `B4_hatchery_purged` variants mapped to runtime states. Brood is hostile, non-humanoid, and never a player refinery. At 412 x 915 phone portrait, forge line, magma hazard, hatchery objective, legal routes, isolation core, and B-state must read without flame or particle effects.

Deliver editable Spline source, source/runtime GLBs, exact 8-family inventory, two PBR/14-decal manifests, B-state/proxy/LOD report, and provenance. Reference games are visual-language only. Copy no protected refinery, hive, texture, layout, logo, symbol, unit, creature, screenshot, or faction identity.
```

## `vespera_refinery_silent_megaforge`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_refinery_silent_megaforge`, planet Vespera, Magma Hatcheries region, location class derelict megastructure. Build a collapsed forge spine, giant casting halls, broken logistics lattice, Brood arteries, deterministic bridge failures, extraction boundaries, and purge routes. It must feel much larger and more ruined than the active refinery while preserving combined-arms path clarity.

Produce exactly 9 model families: `collapsed_forge_spine`, `giant_casting_hall`, `broken_logistics_lattice`, `brood_artery`, `casting_bridge`, `thermal_shaft`, `collapsed_process_gate`, `purge_route_station`, and `extraction_boundary_module`. Author straight/corner/end/state variants inside families. Include two full-class arteries/routes where declared, an elevated personnel flank, and deterministic bridge bypass.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech portal, 18 x 8 m vehicle portal, 24 x 12 m medium-mech opening, 16–18 m one-way lane, 28–30 m two-way approach, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Arteries, slag, bridge wrecks, roots, props, and effects may not violate a legal envelope except in a deterministic route swap.

Author exactly 3 seamless 2048 x 2048 PBR families: `vespera_heat_dead_superstructure`, `vespera_cooled_slag_ash`, and `vespera_vascular_tissue_acid_contact`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained residual/neural emissive, calcified contact, acid wetness, no baked light, and 3 x 3 seam proof. Create 16 original decals for megaforge sectors, collapse chronology, artery hazard, logistics closure, purge routes, extraction boundaries, bridge states, and containment.

Root `GSITE_VESPERA_REFINERY_SILENT_MEGAFORGE`; use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `EXTRACT_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/contact/axis pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/shot proxies. LOD1 <=40%, LOD2 <=12%; retain spine, casting halls, logistics lattice, artery routes, bridge gaps, and state.

Create deterministic `B0_derelict_clean`, `B1_artery_contact`, `B2_logistics_infestation`, `B3_bridge_occlusion`, and `B4_purged_extraction` variants with class-route tables. Brood architecture is hostile living infrastructure, non-humanoid and non-playable. At 412 x 915 phone portrait, spine, halls, arteries, primary/bypass routes, extraction, and B-state must read without animated fluid or particles.

Deliver editable Spline source, source/runtime GLBs, exact 9-family list, three PBR/16-decal manifests, B-state/proxy/LOD report, and provenance. Copy no protected megastructure, hive, texture, layout, logo, glyph, creature, unit, screenshot, or damage asset; references only guide readable scale.
```

## `vespera_plateau_quarantine_bastion`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_plateau_quarantine_bastion`, planet Vespera, Overgrown Front region, location class military base. Build a failed coalition containment fort with decontamination gate, burn corridors, command shelter, hardpoints, verdant overgrowth, and multiple authored Brood breach states. The fort must remain clearly coalition-built while the infestation remains a hostile intrusion.

Produce exactly 8 model families: `coalition_bastion`, `decontamination_gate`, `burn_corridor`, `command_shelter`, `containment_hardpoint`, `brood_breach_module`, `quarantine_watchtower`, and `evacuation_failure_checkpoint`. Author straight/corner/end/state variants inside families. Include two approach routes, separate personnel decon path, a 48 m turn court, and multiple breach options without collapsing into random clutter.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel path, 14 x 7 m light-mech portal, 18 x 8 m vehicle gate, 24 x 12 m medium-mech decon gate, 16–18 m one-way burn lane, 28–30 m two-way road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Hardpoints, burn equipment, roots, membranes, overgrowth, props, and rubble cannot invade route envelopes unless the named B-state defines the alternate.

Author exactly 2 seamless 2048 x 2048 PBR families: `vespera_failed_coalition_armor_quarantine` and `vespera_living_tissue_burn_overgrowth`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained decon/neural emissive, burn residue, polymer, verdant contact, dedicated tissue transitions, and no baked light. Prove 3 x 3 seams. Create 14 original decals for coalition sectors, containment status, burn lanes, decon sequence, breach severity, evacuation failure, purge route, and gate state.

Root `GSITE_VESPERA_PLATEAU_QUARANTINE_BASTION`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS/shot/hazard proxies. LOD1 <=40%, LOD2 <=12%; preserve bastion, decon gate, burn routes, shelter, breach silhouettes, and state.

Create deterministic `B0_failed_clean`, `B1_perimeter_spores`, `B2_gate_breach`, `B3_command_encroachment`, and `B4_burn_corridor_purge` variants. Brood is hostile, non-humanoid, and non-playable. At 412 x 915 phone portrait, bastion, decon gate, two routes, command objective, burn corridors, breach, and B-state must read without fire or spore particles.

Deliver editable Spline source, source/runtime GLBs, exact 8-family inventory, two PBR/14-decal manifests, B-state/proxy/LOD report, and provenance. Reference games guide only tactical clarity and staged infestation. Copy no protected base, hive, texture, layout, logo, unit, creature, screenshot, or faction mark.
```

## `vespera_plateau_evac_spaceport`

```text
Create an original, game-ready modular 3D environment set for MASSFRONT preset `vespera_plateau_evac_spaceport`, planet Vespera, Overgrown Front region, location class spaceport. Build an overgrown evacuation apron with abandoned lander silhouettes, sealed survivor concourse, approach roads, membrane-blocked gates, last-flight evidence, and extraction state. The location must tell a failed evacuation story without copying any recognizable spacecraft or airport.

Produce exactly 7 model families: `evacuation_apron`, `abandoned_lander_shell`, `sealed_survivor_concourse`, `overgrown_approach`, `membrane_blocked_gate`, `evac_control_tower`, and `last_flight_service_bay`. Author pad/corner/end/state variants inside families. Include two combined-arms approaches, a separate survivor route, a 48 m court, and clear landing/extraction zones.

Combined-arms scale: meters, Y-up/-Z forward, 4 m grid, 16 m macro grid; 3 m personnel route, 14 x 7 m light-mech access, 18 x 8 m vehicle portal, 24 x 12 m medium-mech/deployer high bay, 16–18 m one-way apron lane, 28–30 m two-way road, 32 x 36 m passing bay, 48 m turn court, ramps <=8.3%. Lander wrecks, roots, membrane, props, pad debris, and collision cannot intrude unless a B-state explicitly opens/closes a route.

Author exactly 2 seamless 2048 x 2048 PBR families: `vespera_aged_evac_apron_aerospace` and `vespera_spore_overgrowth_organic_gate`. Supply neutral base color, tangent normal, linear ORM, optional height, restrained last-flight/extraction and neural emissive, verdant growth, spore film, abandoned panel wear, and graded organic contact. No baked light; prove 3 x 3 seams. Create 12 original decals for evac pad numbers, survivor routes, last-flight status, quarantine, approach closure, extraction, gate state, and rescue service.

Root `GSITE_VESPERA_PLATEAU_EVAC_SPACEPORT`; prefixes `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `LZ_`, `EXTRACT_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`. Floor/hinge pivots, transforms applied, no negative scale, UV0/tangents, separate collision/nav/LOS proxies. LOD1 <=40%, LOD2 <=12%; preserve apron, lander silhouettes, survivor concourse, control tower, blocked gate, and state.

Create deterministic `B0_abandoned_evac`, `B1_spore_overgrowth`, `B2_gate_membrane`, `B3_concourse_encroachment`, and `B4_extraction_reopened` variants. Brood is hostile, non-humanoid, and never a player spaceport. At 412 x 915 phone portrait, apron, landers, concourse, approaches, landing/extraction zone, gate, and B-state must read without particles or tiny signage.

Deliver editable Spline source, source/runtime GLBs, exact 7-family list, two PBR/12-decal manifests, B-state/LZ/proxy/LOD report, and provenance. References are visual-language only. Do not copy protected spacecraft, spaceports, hive forms, textures, layouts, logos, icons, units, creatures, or screenshots.
```
