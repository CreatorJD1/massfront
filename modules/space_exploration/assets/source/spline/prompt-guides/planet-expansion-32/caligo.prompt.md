# Caligo — Spline 3D prompt guide

**Expansion slot:** 17  
**Sector:** Veyra Frontier  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A dense-atmosphere frontier planet of slate mesas, permanent silver fog seas, towering storm cells and black fern forests. Settlements use elevated ceramic piers, copper lightning drains, matte blue composites and powerful silhouette beacons. The danger is visibility, charge and landslip—not a generic swamp recolor.

## Orbital / war-table — `PLANET_CALIGO`

```text
Create original orbital planet Caligo, root `PLANET_CALIGO`: dark slate continents rising above global silver fog basins, black fern belts, towering white storm anvils, copper lightning scars and a small inner moon casting a moving clear wake through the cloud deck. Separate terrain sphere, fog-sea shell, storm cloud shell, atmosphere limb, moon and sparse mesa settlement emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission plus mesa/fog/forest/storm/city masks; no baked lightning or UI. Keep at most three transparent shells, center pivot, UV0/tangents, marker anchors, applied transforms, LOD1≤40%/LOD2≤12% retaining mesa/fog contrast and moon wake. Export editable Spline/source/runtime GLB, manifests/provenance; pass phone silhouette, alpha sorting, fallback and WebGL checks. Original art; no copied fog world.
```

## City / colony — `caligo_fogstep_city_colony`

```text
Location class: `city_colony`.
Create `Fogstep City`, root `GSITE_CALIGO_FOGSTEP_CITY_COLONY`, a stepped settlement on three elevated mesa shelves. Hero: a 70 m clear-air chimney with copper lightning drains, linking compact blue composite blocks by covered bridges. Two 28–30 m shelf roads, 24×12 m mech portals, 48 m upper court and 3 m enclosed walkways. Objective: restore the fog pumps. Damage: clear → intake overload → bridge strike → lower shelf isolated, with upper bypass. Use seamless 2K `caligo_mesa_civic_composite`, `caligo_copper_lightning_drain`, `caligo_fogseal_glass` PBR and 14 original elevation/weather/route decals; neutral channels, stable alpha, no baked fog/lightning, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; 412×915 must show terraces/chimney/routes/state. Original only.
```

## Outpost — `caligo_beacon_outpost`

```text
Location class: `outpost`.
Site ID: `caligo_beacon_outpost`.
Create `Silverwake Beacon`, root `GSITE_CALIGO_SILVERWAKE_BEACON_OUTPOST`, a compact navigation outpost above a fog basin. Hero: a 50 m tri-lobed beacon with an open central void and copper discharge whiskers. Add 18 m loop, 32×36 m service bay, 14×7 m gate and 3 m cliff walk. Objective: restart the beacon and map a fog surge. Damage: online → charge buildup → lobe strike → shelter-only mode. Use seamless 2K `caligo_beacon_composite_wet`, `caligo_discharge_copper` PBR plus 8 original navigation/storm decals; neutral channels, restrained emission, no baked lightning/fog, 3×3 proof. Meters/Y-up/-Z, 4/16 m, 24×12 m exterior clearance, UV0/tangents, pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile silhouette gate. No copied beacon.
```

## Military base — `caligo_thunderhead_military_base`

```text
Location class: `military_base`.
Treat every listed 2K material family as a complete PBR source set.
Create `Thunderhead Redoubt`, root `GSITE_CALIGO_THUNDERHEAD_MILITARY_BASE`, a mesa-edge base built around four grounded lightning towers. Hero: a low wedge command bunker inside a square of tall forked conductors. Two 30 m approaches, 24×12 m gates, 48 m court, 32×36 m bay and 3 m fog-side infiltration route. Objective: ground the conductor grid. Damage: grounded → tower overload → arc trench collapse → bunker exposed; preserve one approach. Use seamless 2K `caligo_redoubt_wet_armor`, `caligo_lightning_conductor_copper`, `caligo_fogproof_polymer` and 16 original storm/garrison/breach decals; neutral channels, no baked arcs, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, hinge/floor pivots, collision/nav/LOS/shot/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read conductors/routes/state. Original base.
```

## Refinery — `caligo_cloudwell_refinery`

```text
Location class: `refinery`.
Create `Cloudwell Condensate Works`, root `GSITE_CALIGO_CLOUDWELL_REFINERY`, a refinery harvesting atmospheric volatiles through hanging intake veils. Hero: a 74 m inverted funnel tower over terraced separator tanks. Provide 30 m tanker road, 18 m service loop, 24×12 m bay, 48 m turnaround and 3 m catwalk. Objective: vent a charged condensate column. Damage: condensing → veil tear → column flashover → safe drain, deterministic bypass. Use seamless 2K `caligo_condensate_plant_composite`, `caligo_wet_separator_metal`, `caligo_intake_mesh` PBR and 14 original flow/charge/hazard decals; neutral channels, stable alpha, no baked cloud/electricity, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read tower/routes/state.
```

## Relic / ruin — `caligo_veiled_archive_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Veiled Archive`, root `GSITE_CALIGO_VEILED_ARCHIVE_RELIC_RUIN`, a precolonial stone observatory revealed when fog drains from a mesa cleft. Hero: four 48 m slate fins enclosing a suspended mineral drum, structurally supported and not magically floating. Include 18 m route, 24×12 m exterior mech opening, 46 m court and two 3 m survey flanks. Objective: rotate the archive drum. Damage: veiled → exposed → support fracture → drum grounded. Use seamless 2K `caligo_ancient_slate_archive`, `caligo_silver_mineral_patina` PBR plus 12 original nonmodern survey/weather marks; neutral channels, mineral emission only, no baked fog, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile gate shows fins/drum. Copy no relic/glyph.
```

## Spaceport — `caligo_stormbreak_spaceport`

```text
Location class: `spaceport`.
Treat every listed 2K material family as a complete PBR source set.
Create `Stormbreak Spaceport`, root `GSITE_CALIGO_STORMBREAK_SPACEPORT`, a mesa-top launch port ringed by charge-drain masts. Hero: a 90 m crescent wind baffle and three recessed cradles. Two 30 m approaches, 24×12 m deployer gates, 48 m court, 32×36 m pads and enclosed 3 m crew tube. Objective: discharge the apron and reopen cradle one. Damage: clear → mast overload → baffle tear → alternate sheltered cradle. Use seamless 2K `caligo_storm_apron_composite`, `caligo_charge_drain_metal`, `caligo_pressure_glass` and 16 original pad/storm/LZ decals; neutral channels, stable alpha, no baked storm, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone silhouette. No copied ship/port.
```

## Pressure dome — `caligo_clearhold_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Clearhold Habitat`, root `GSITE_CALIGO_CLEARHOLD_PRESSURE_DOME`, a cluster of low domes generating a visible clear-air courtyard amid dense fog. Hero: a 58 m matte shell with an external ring of vertical scrubber vanes. Include 18×8 m connector, 24×12 m emergency lock, 48 m exterior court and two 3 m loops. Objective: isolate a lightning-damaged scrubber. Damage: clear → vane failure → seal strike → one dome fogged. Use seamless 2K `caligo_clearhold_shell`, `caligo_scrubber_vane_copper`, `caligo_habitat_floor` PBR and 12 original pressure/air-quality/evac decals; neutral channels, stable transparency, no baked fog, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read shells/vanes/state.
```

## Derelict megastructure — `caligo_hanging_foundry_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Hanging Foundry`, root `GSITE_CALIGO_HANGING_FOUNDRY_DERELICT_MEGASTRUCTURE`, a ruined atmospheric factory spanning a mesa chasm on massive tension frames. Hero: a 200 m broken horizontal forge deck with three hanging separator drums disappearing into fog. Provide two 30 m deck arteries, 24×12 m portals, 48 m courts and 3 m lower maintenance flank. Objective: extract the storm-core governor. Damage: suspended → cable failure → deck tilt → core exposure, with deterministic route swaps. Use seamless 2K `caligo_foundry_superstructure_wet`, `caligo_tension_cable_metal`, `caligo_condensate_deposit` PBR plus 18 original sector/collapse/extraction decals; neutral channels, no baked fog, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read deck/drums/routes. Original megastructure.
```
