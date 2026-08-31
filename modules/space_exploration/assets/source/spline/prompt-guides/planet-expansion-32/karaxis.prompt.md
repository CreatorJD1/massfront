# Karaxis — Spline 3D prompt guide

**Expansion slot:** 14  
**Sector:** Helios Quarantine  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A high-gravity tectonic world of red iron knife-ranges, cobalt rift lakes, migrating metallic dust cyclones and deep mantle elevators. Settlements clamp into fault-safe terraces using layered slate armor, shock-isolated bronze machinery and white stress gauges. A distinct non-humanoid Brood lithovore strain may wedge silicate-chitin roots into faults; it is hostile ecology, never a playable faction.

## Orbital / war-table — `PLANET_KARAXIS`

```text
Create original orbital planet Karaxis for MASSFRONT, root `PLANET_KARAXIS`: a high-gravity red-iron super-Earth with continent-long knife ranges, cobalt rift lakes, pale fault scars, metallic dust cyclones, a flattened atmosphere and two shepherd moons pulling a thin equatorial debris braid. Night emission follows fault-safe terrace settlements, never uniform coastlines. Add separate terrain sphere, rift-water layer, metallic-dust cloud shell, atmosphere limb, moons/debris and settlement emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and geology/water/dust/city/hazard masks; no baked light/UI text. Add marker anchors. Center pivot, UV0/tangents, applied transforms, ≤3 transparent shells, instanced debris, `LOD0_`/`LOD1_`/`LOD2_`, LOD1≤40%/LOD2≤12% preserving ranges, rifts and moon braid. Export editable Spline/source/runtime GLB, manifests/provenance; pass 412×915 silhouette, fallback, alpha and WebGL gates. Reference games guide strategic clarity only; copy no planet, material, mark or screenshot.
```

## City / colony — `karaxis_riven_crown_city_colony`

```text
Location class: `city_colony`.
Create `Riven Crown Foundry Colony`, root `GSITE_KARAXIS_RIVEN_CROWN_CITY_COLONY`, a terraced city bolted across a stable fault saddle. Hero: three 68 m shock-isolated habitation crowns joined by bronze compression bridges. Two 28–30 m switchback roads, 24×12 m mech gates, 48 m turn court and 3 m lift galleries must remain clear. Objective: stabilize the central crown before a fault pulse. Damage: intact → isolator shear → bridge drop → crown evacuation, with a deterministic lower bypass. Use seamless 2K `karaxis_faultsafe_slate_civic`, `karaxis_bronze_shock_machinery`, `karaxis_cobalt_glass` PBR and 14 original stress/ward/route decals; neutral albedo, tangent normal, linear ORM, height/status emission, 3×3 proof. Meters, Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, pivots/transforms, `COLL_`/`NAV_`/`LOS_`/`COVER_`/`PORTAL_`/`OBJ_`/`DESTRUCT_`, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance and verify 412×915 hero/routes/state. Original MASSFRONT art; no copied city.
```

## Outpost — `karaxis_faultwatch_outpost`

```text
Location class: `outpost`.
Create `Faultwatch Needle`, root `GSITE_KARAXIS_FAULTWATCH_OUTPOST`: a compact seismic outpost whose hero is a forked 52 m white stress-gauge tower anchored between iron fins. Add an 18 m vehicle loop, 32×36 m instrument bay, 14×7 m light-mech gate and 3 m protected survey trench. Objective: recalibrate three fault probes. Damage: calibrated → anchor slip → needle fracture → buried shelter, keeping the loop open. Use seamless 2K `karaxis_seismic_composite_dust` and `karaxis_stress_gauge_ceramic` PBR plus 8 original fault/depth/safe-route decals; neutral channels, tangent normal, linear ORM, height/emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m grid, exterior 24×12 m envelope, ramps≤8.3%, UV0/tangents, floor pivots, applied transforms, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export editable Spline/GLBs/manifests/provenance; phone gate must show forked needle and objective. No generic recolor or copied outpost.
```

## Military base — `karaxis_bastion_nine_military_base`

```text
Location class: `military_base`.
Treat every listed 2K material family as a complete PBR source set.
Create `Bastion Nine`, root `GSITE_KARAXIS_BASTION_NINE_MILITARY_BASE`, a high-gravity fort sunk into nine staggered basalt teeth. Hero: a low armored command wedge beneath a fan of retractable counterweight fins. Provide two 30 m approaches, 24×12 m heavy portals, 48 m court, 32×36 m bay and 3 m fault-gallery flank. Objective: disable the counterweight locks. Damage: sealed → fin jam → tooth collapse → command wedge exposed; both routes cannot fail together. Use seamless 2K `karaxis_layered_redoubt_armor`, `karaxis_counterweight_bronze` and 16 original garrison/stress/gate/breach decals. Neutral albedo, tangent normal, linear ORM, height/emission, 3×3 proof. Apply meters/Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, hinge/floor pivots, collision/nav/LOS/shot/cover/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/runtime GLB/manifests/provenance; phone read must retain nine teeth, routes and state. Copy no protected base.
```

## Refinery — `karaxis_mantle_lift_refinery`

```text
Location class: `refinery`.
Treat every listed 2K material family as a complete PBR source set.
Create `Mantle Lift Kappa`, root `GSITE_KARAXIS_MANTLE_LIFT_REFINERY`, a deep-bore mineral refinery around a 76 m counterbalanced ore elevator. Hero: twin bronze lift yokes straddling a glowing but contained bore, with stepped crushers below. Include 30 m haul road, 18 m service loop, 24×12 m high bay, 48 m turnaround and 3 m maintenance galleries. Objective: stop an elevator runaway and recover the core sample. Damage: operating → cable snap → yoke tilt → controlled bore seal, with deterministic bypass. Use seamless 2K `karaxis_iron_ore_crusher`, `karaxis_bronze_lift_machinery`, `karaxis_heatglazed_bore_liner` and 14 original flow/load/hazard decals; neutral base color, normal, linear ORM, height/emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, axis pivots, transforms, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; verify mobile hero/routes/state without particles. Original only.
```

## Relic / ruin — `karaxis_graven_choir_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Graven Choir`, root `GSITE_KARAXIS_GRAVEN_CHOIR_RELIC_RUIN`, an ancient seismic calendar cut into concentric red-rock fins. Hero: five 45 m tuning slabs leaning over a sunken 46 m court, one split by a recent quake. Add 18 m vehicle route, 24×12 m exterior mech portal, two 3 m archaeology paths and 32×36 m refuge. Objective: read the fault chronicle. Damage: buried → exposed → slab fracture → court subsidence. Use seamless 2K `karaxis_graven_ironstone` and `karaxis_pale_mineral_inlay` PBR plus 12 original nonlinguistic survey/resonance decals; neutral albedo, tangent normal, linear ORM, height/mineral emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m grid, ramps≤8.3%, UV0/tangents, contact pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read must show five slabs and state. Copy no relic/glyph.
```

## Spaceport — `karaxis_anvil_gate_spaceport`

```text
Location class: `spaceport`.
Treat every listed 2K material family as a complete PBR source set.
Create `Anvil Gate Spaceport`, root `GSITE_KARAXIS_ANVIL_GATE_SPACEPORT`, a high-gravity launch field embedded between two iron mesas. Hero: a broad 85 m counterweighted launch gantry shaped by function, not a copied spacecraft silhouette. Provide two 30 m approaches, 24×12 m deployer bays, 48 m court, 32×36 m staging pads and 3 m crew tubes. Objective: release a jammed launch cradle. Damage: ready → counterweight failure → gantry shear → alternate cradle active. Use seamless 2K `karaxis_launch_apron_ironceramic`, `karaxis_counterweight_mechanism`, `karaxis_cobalt_pressure_glass` and 16 original pad/load/route decals; neutral channels, stable alpha, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, axis pivots, `LZ_` plus collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance and mobile evidence. No copied airport, ship or logo.
```

## Pressure dome — `karaxis_quakeglass_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Quakeglass Habitat`, root `GSITE_KARAXIS_QUAKEGLASS_PRESSURE_DOME`, a chain of low faceted domes suspended on visible seismic isolators above a fault terrace. Hero: one 56 m hexagonal shell ringed by nine bronze dampers. Include 18×8 m vehicle connector, 24×12 m emergency lock, 48 m exterior court and two 3 m interior loops. Objective: lock the dampers before a quake train. Damage: stable → damper leak → connector shear → one dome isolated. Use seamless 2K `karaxis_quakeglass_seal`, `karaxis_isolator_bronze`, `karaxis_habitat_slate_floor` PBR plus 12 original pressure/stress/evac decals; neutral channels, stable transparency, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, hinge/floor pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export editable Spline/GLBs/manifests/provenance; phone gate shows shell, dampers and state. Original only.
```

## Derelict megastructure — `karaxis_sundered_elevator_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Sundered Equatorial Elevator`, root `GSITE_KARAXIS_SUNDERED_ELEVATOR_DERELICT_MEGASTRUCTURE`, the grounded base of a snapped orbital tether. Hero: a 210 m leaning anchor fork crossed by broken magnetic rail ribs. Provide two 30 m ground arteries, 24×12 m mech portals, 48 m courts and 3 m elevated salvage flank. Objective: recover the tether field core. Damage: dormant → rail cascade → anchor fork fall → core exposure, with deterministic route swaps. Optional hostile lithovore Brood state may brace cracks using layered silicate-chitin wedges, never humanoid/playable. Use seamless 2K `karaxis_tether_superalloy`, `karaxis_faultglass_deposit`, `karaxis_lithovore_contact` PBR plus 18 original sector/collapse/salvage decals; neutral channels, graded contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, axis pivots, collision/nav/LOS/shot/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone silhouette. Copy no space elevator or hive design.
```
