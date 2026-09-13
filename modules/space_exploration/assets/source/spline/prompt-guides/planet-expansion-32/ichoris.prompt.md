# Ichoris — Spline 3D prompt guide

**Expansion slot:** 16  
**Sector:** Helios Quarantine  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A cool ocean world of black ferrous brine, rust-red tidal marshes, salt-ice shelves and long causeway settlements. Architecture is elevated, floodable and sacrificial: pale saltcrete, dark titanium, red ceramic buoyancy cells and teal navigation emission. Amphibious Brood siphon reefs may consume pumps and channels but remain hostile, non-humanoid and non-playable.

## Orbital / war-table — `PLANET_ICHORIS`

```text
Create original orbital planet Ichoris, root `PLANET_ICHORIS`: a dark ocean world with black ferrous seas, rust-red tidal deltas, pale salt-ice shelves, narrow causeway lights and two uneven moons driving obvious tide bulges. Add separate terrain sphere, ocean layer, salt-ice mask, low storm-cloud shell, blue-grey atmosphere limb, moons and sparse causeway emission. Preserve a strong black/red/white geographic silhouette without making a blood planet. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and ocean/tide/salt/storm/city masks; no baked light/UI. Center pivot, UV0/tangents, marker anchors, ≤3 shells, instanced moon debris, LOD1≤40%/LOD2≤12% retaining deltas, shelves and tide scars. Export editable Spline/source/runtime GLB, manifests/provenance; pass 412×915 silhouette, alpha, fallback and WebGL gates. Reference works guide clarity only; copy no ocean planet or palette.
```

## City / colony — `ichoris_tidevault_city_colony`

```text
Location class: `city_colony`.
Create `Tidevault Colony`, root `GSITE_ICHORIS_TIDEVAULT_CITY_COLONY`, an elevated city on floodable saltcrete caissons. Hero: a 66 m split floodgate tower joining three red buoyancy terraces. Provide twin 30 m causeways, 24×12 m mech locks, 48 m tidal court and 3 m raised pedestrian spine. Objective: close the surge gates and evacuate the low ward. Damage: dry → overtopped → caisson shear → low ward flooded, with high causeway bypass. Use seamless 2K `ichoris_saltcrete_tidal_civic`, `ichoris_red_buoyancy_ceramic`, `ichoris_blackbrine_wetline` PBR plus 14 original tide/ward/evac decals; neutral channels, tangent normal, linear ORM, height/status emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, hinge/floor pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read shows floodgates/routes/state. Original city only.
```

## Outpost — `ichoris_saltwatch_outpost`

```text
Location class: `outpost`.
Create `Saltwatch Beacon`, root `GSITE_ICHORIS_SALTWATCH_OUTPOST`, a compact tide/salinity station on three retractable pylons. Hero: a 44 m forked beacon over a circular red buoyancy collar. Add 18 m causeway loop, 32×36 m service float, 14×7 m light-mech gate and 3 m sampling pier. Objective: recover the tide predictor. Damage: elevated → pylon jam → collar breach → shelter stranded, while one causeway stays legal. Use seamless 2K `ichoris_saltwatch_composite`, `ichoris_brinecorroded_titanium` PBR plus 8 original tide/depth/navigation decals; neutral channels, no baked water, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, 24×12 m exterior envelope, UV0/tangents, pylon pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; verify phone hero. No copied buoy/base.
```

## Military base — `ichoris_deltaward_military_base`

```text
Location class: `military_base`.
Create `Deltaward Citadel`, root `GSITE_ICHORIS_DELTAWARD_MILITARY_BASE`, a flood-defense base controlling three river mouths. Hero: a low triangular saltcrete bastion surrounded by three articulated surge shields. Provide two 30 m causeways, 24×12 m amphibious/mech gates, 48 m court, 32×36 m bay and 3 m floodwall flank. Objective: retake the shield controls. Damage: sealed → shield jam → embankment breach → command island exposed; alternate route is deterministic. Optional Brood siphon reefs attach under gates as asymmetric wet chitin, never humanoid/playable. Use seamless 2K `ichoris_deltaward_armor`, `ichoris_surgeshield_titanium`, `ichoris_siphonreef_contact` PBR and 16 original flood/garrison/breach decals; neutral channels, graded contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, pivots, collision/nav/LOS/shot/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance and phone evidence.
```

## Refinery — `ichoris_blackbrine_refinery`

```text
Location class: `refinery`.
Create `Blackbrine Fractionator`, root `GSITE_ICHORIS_BLACKBRINE_REFINERY`, a tidal mineral plant whose hero is a 72 m horizontal separator drum elevated above red intake basins. Include 30 m tanker causeway, 18 m pump loop, 24×12 m high bay, 48 m turnaround and 3 m catwalk. Objective: isolate a ferrous brine overpressure. Damage: processing → intake clog → drum split → emergency drain, with dry bypass. Use seamless 2K `ichoris_fractionator_titanium`, `ichoris_ferrous_brine_deposit`, `ichoris_red_pump_ceramic` PBR plus 14 original flow/corrosion/hazard decals; neutral channels, tangent normal, linear ORM, height/emission, no baked liquid, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, pipe-axis pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile read shows drum/basins/routes/state. Original refinery.
```

## Relic / ruin — `ichoris_drowned_covenant_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Drowned Covenant`, root `GSITE_ICHORIS_DROWNED_COVENANT_RELIC_RUIN`, an ancient tidal calendar exposed only at low water. Hero: six white stone fins around a black 46 m basin and one half-submerged archive gate. Provide 18 m causeway, 24×12 m exterior mech passage, two 3 m wading/raised archaeology routes and 32×36 m refuge. Objective: open the archive before tide return. Damage: submerged → exposed → fin collapse → gate inundation. Use seamless 2K `ichoris_ancient_saltstone`, `ichoris_ferrous_tidepatina` PBR plus 12 original nonmodern tide/survey markings; neutral channels, optional mineral emission, no baked water, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, contact pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone gate shows fins/basin/objective. Copy no ruin/glyph.
```

## Spaceport — `ichoris_causeway_spaceport`

```text
Location class: `spaceport`.
Create `Long Causeway Spaceport`, root `GSITE_ICHORIS_CAUSEWAY_SPACEPORT`, an offshore landing field on articulated flood pylons. Hero: a 110 m segmented approach spine terminating in three fan-shaped cradles. Provide two 30 m approach lanes, 24×12 m deployer locks, 48 m apron court, 32×36 m staging floats and 3 m crew tube. Objective: level the sinking third cradle. Damage: level → pylon lag → causeway split → alternate cradle live. Use seamless 2K `ichoris_floodable_apron`, `ichoris_pylon_titanium`, `ichoris_navigation_glass` PBR and 16 original pad/tide/LZ decals; neutral channels, stable alpha, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, pylon pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone evidence must read causeway/cradles. No copied spaceport/craft.
```

## Pressure dome — `ichoris_pressure_ark_dome`

```text
Location class: `pressure_dome`.
Create `Pressure Ark`, root `GSITE_ICHORIS_PRESSURE_ARK_DOME`, a chain of half-floating habitats with opaque lower hulls and faceted upper shells. Hero: one 60 m red-ringed dome riding an articulated tidal cradle. Include 18×8 m vehicle connector, 24×12 m emergency lock, 48 m service float and two 3 m interior loops. Objective: detach a contaminated ballast cell. Damage: balanced → ballast leak → connector shear → one ark grounded. Use seamless 2K `ichoris_ark_pressure_shell`, `ichoris_ballast_hull`, `ichoris_saltfog_glass` PBR plus 12 original pressure/ballast/evac decals; neutral channels, stable transparency, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge/floor pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile gate shows shell/cradle/state. Original.
```

## Derelict megastructure — `ichoris_sunken_harvester_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Sunken Pelagic Harvester`, root `GSITE_ICHORIS_SUNKEN_HARVESTER_DERELICT_MEGASTRUCTURE`, a continent-feed machine stranded diagonally across a tidal shelf. Hero: a 190 m ribbed intake mouth and broken conveyor spine emerging from black water. Provide two 30 m causeway routes, 24×12 m mech portals, 48 m courts and 3 m elevated salvage route. Objective: extract the dormant separator core. Damage: stranded → conveyor fall → intake collapse → core exposed, deterministic route swaps. Optional hostile amphibious Brood siphon reef grows as low wet filter mouths consuming pipes, never humanoid/playable. Use seamless 2K `ichoris_harvester_superstructure`, `ichoris_tidal_corrosion`, `ichoris_siphonreef_contact` PBR plus 18 original sector/collapse/extraction decals; neutral channels, graded contact, no baked water, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone silhouette. Copy no harvester/hive.
```
