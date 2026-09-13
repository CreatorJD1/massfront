# Zephyria — Spline 3D prompt guide

**Expansion slot:** 21  
**Sector:** Perseus Expanse  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A low-gravity storm world of shallow cobalt oceans, wind-carved tablelands, levitated mineral shelves held by electromagnetic geology, vast white cloud rivers and violent jet-stream shear. Settlements are mechanically anchored with tension pylons, flexible graphite roads and orange aerodynamic shells. No space combat; all sites support exploration and ground operations.

## Orbital / war-table — `PLANET_ZEPHYRIA`

```text
Create original orbital planet Zephyria, root `PLANET_ZEPHYRIA`: shallow cobalt oceans, ochre tablelands, a few magnetically levitated mineral shelves casting visible shadows, white cloud rivers wrapped into fast jet bands, dark storm eyes and three tiny shepherd moons. Avoid a generic gas giant or fantasy floating-island sphere; expose grounded tectonic logic. Separate terrain sphere, ocean layer, cloud shells, atmosphere limb, instanced shelf/moon groups and sparse anchored settlement emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and ocean/tableland/shelf/wind/storm/city masks; no baked light/UI. Center pivot, UV0/tangents, marker anchors, ≤3 transparent shells, LOD1≤40%/LOD2≤12% retaining shelves, jet bands and moons. Export Spline/source/runtime GLB/manifests/provenance; pass 412×915 silhouette, alpha/fallback/WebGL. Original art; no copied sky world.
```

## City / colony — `zephyria_anchorfall_city_colony`

```text
Location class: `city_colony`.
Create `Anchorfall City`, root `GSITE_ZEPHYRIA_ANCHORFALL_CITY_COLONY`, a low-gravity settlement chained to a wind-carved tableland. Hero: a 74 m orange civic keel suspended between four black tension pylons over stepped graphite districts. Provide two 28–30 m flexible roads, 24×12 m mech gates, 48 m sheltered court and 3 m enclosed walkways. Objective: retension the civic keel before a jet shear. Damage: stable → cable flutter → pylon shear → one district detached, with lee-side bypass. Use seamless 2K `zephyria_graphite_civic_deck`, `zephyria_orange_aeroshell`, `zephyria_tension_pylon_metal` PBR and 14 original wind/anchor/route decals; neutral channels, no baked clouds, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, cable/hinge pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read keel/pylons/routes/state. No copied sky city.
```

## Outpost — `zephyria_galehook_outpost`

```text
Location class: `outpost`.
Create `Galehook Station`, root `GSITE_ZEPHYRIA_GALEHOOK_OUTPOST`, a compact weather outpost anchored to a cliff lip. Hero: a 50 m curved intake mast with three functional wind vanes and a deep black foundation hook. Add 18 m lee-side loop, 32×36 m service bay, 14×7 m light-mech gate and 3 m cliff walk. Objective: retrieve jet-stream data and lock the mast. Damage: sampling → vane overspeed → mast bend → shelter mode. Use seamless 2K `zephyria_weatherproof_composite`, `zephyria_anchorhook_metal` PBR plus 8 original wind/anchor/safe-route decals; neutral channels, no baked wind, 3×3 proof. Meters/Y-up/-Z, 4/16 m, 24×12 m exterior clearance, UV0/tangents, hinge pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile hero gate.
```

## Military base — `zephyria_stormchain_military_base`

```text
Location class: `military_base`.
Create `Stormchain Redoubt`, root `GSITE_ZEPHYRIA_STORMCHAIN_MILITARY_BASE`, a defensive base distributed between three anchored tableland blocks. Hero: paired orange shield keels connected by visible black tension bridges over a low command vault. Provide two 30 m approaches, 24×12 m gates, 48 m lee court, 32×36 m bay and 3 m underside maintenance flank. Objective: secure the tension controller. Damage: tensioned → bridge oscillation → keel drop → vault exposed; one route always remains. Use seamless 2K `zephyria_redoubt_graphite_armor`, `zephyria_orange_windshield_ceramic`, `zephyria_tension_bridge_metal` PBR and 16 original garrison/wind/breach decals; neutral channels, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, axis pivots, collision/nav/LOS/shot/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read keels/routes/state. Original base.
```

## Refinery — `zephyria_aerosol_refinery`

```text
Location class: `refinery`.
Create `Aerosol Fractionation Yard`, root `GSITE_ZEPHYRIA_AEROSOL_REFINERY`, a plant harvesting rare particles from cloud rivers. Hero: a 78 m horizontal intake wing feeding three orange separator drums on anchored piers. Include 30 m tanker road, 18 m lee loop, 24×12 m high bay, 48 m turnaround and 3 m catwalk. Objective: feather the intake and isolate a charged separator. Damage: harvesting → wing flutter → drum tear → bypass vent. Use seamless 2K `zephyria_intake_composite`, `zephyria_separator_orange_ceramic`, `zephyria_cloudsalt_deposit` PBR plus 14 original flow/wind/hazard decals; neutral channels, stable intake mesh alpha, no baked clouds, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read wing/routes/state.
```

## Relic / ruin — `zephyria_windcarved_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Aeolian Ledger`, root `GSITE_ZEPHYRIA_WINDCARVED_RELIC_RUIN`, an ancient atmospheric observatory cut into three eroded stone vanes. Hero: a 66 m perforated central fin whose openings encode wind history through structure, not text. Add 18 m lee route, 24×12 m exterior mech opening, 46 m sheltered court and two 3 m survey flanks. Objective: rotate the buried ledger drum. Damage: exposed → bearing jam → vane fracture → drum accessible. Use seamless 2K `zephyria_ancient_aerostone`, `zephyria_mineral_bearing_weathered` PBR plus 12 original nonmodern survey/wind marks; neutral channels, no baked wind, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read fins/objective. Copy no relic/glyph.
```

## Spaceport — `zephyria_skykeel_spaceport`

```text
Location class: `spaceport`.
Create `Skykeel Spaceport`, root `GSITE_ZEPHYRIA_SKYKEEL_SPACEPORT`, an anchored launch platform sheltered behind an immense functional wind keel. Hero: a 108 m orange-black keel separating three recessed landing cradles from the jet stream. Provide two 30 m approaches, 24×12 m deployer gates, 48 m lee court, 32×36 m pads and 3 m crew tube. Objective: lock the keel and reopen cradle three. Damage: sheltered → actuator flutter → keel fracture → alternate leeward cradle. Use seamless 2K `zephyria_launchdeck_graphite`, `zephyria_skykeel_aeroshell`, `zephyria_cradle_mechanism` PBR and 16 original pad/wind/LZ decals; neutral channels, no baked clouds, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone silhouette. No copied port/craft.
```

## Pressure dome — `zephyria_calmeye_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Calm-Eye Habitat`, root `GSITE_ZEPHYRIA_CALMEYE_PRESSURE_DOME`, three low aerodynamic pressure shells arranged inside a natural lee basin. Hero: a 62 m orange teardrop dome surrounded by four black ground anchors. Include 18×8 m connector, 24×12 m emergency lock, 48 m sheltered court and two 3 m interior loops. Objective: retension an anchor before the storm eye moves. Damage: anchored → cable slip → shell yaw → one dome isolated. Use seamless 2K `zephyria_calmedge_pressure_shell`, `zephyria_anchor_cable_metal`, `zephyria_habitat_floor` PBR and 12 original pressure/wind/evac decals; neutral channels, stable transparent strips, no baked sky, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge/contact pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read dome/anchors/state.
```

## Derelict megastructure — `zephyria_broken_tether_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Broken Weather Tether`, root `GSITE_ZEPHYRIA_BROKEN_TETHER_DERELICT_MEGASTRUCTURE`, a fallen atmospheric-control tether draped across two tablelands. Hero: a 230 m segmented black spine with three orange aerodynamic nodes and a snapped vertical anchor. Provide two 30 m ground routes through different segments, 24×12 m portals, 48 m courts and 3 m elevated salvage flank. Objective: recover the weather governor. Damage: grounded → node roll → spine shift → governor exposure, deterministic route swaps. Use seamless 2K `zephyria_tether_superstructure`, `zephyria_aerodynamic_node_shell`, `zephyria_storm_weathering` PBR plus 18 original sector/collapse/extraction decals; neutral channels, no baked wind/lightning, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read spine/nodes/routes. Copy no orbital tether.
```
