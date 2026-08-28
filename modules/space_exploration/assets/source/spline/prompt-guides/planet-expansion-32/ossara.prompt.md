# Ossara — Spline 3D prompt guide

**Expansion slot:** 19  
**Sector:** Veyra Frontier  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A dry world of bone-white karst, ochre dry seabeds, black flint ridges and enormous fossilized marine skeletons exposed by erosion. Settlements carve and brace around the geology using lime ceramic, dark steel and blue shade cloth. Fossils remain fossils—not Brood—and architecture must avoid a generic bone-hive look.

## Orbital / war-table — `PLANET_OSSARA`

```text
Create original orbital planet Ossara, root `PLANET_OSSARA`: bone-white karst continents, ochre dry ocean basins, black flint ridges, blue-grey dust bands and continent-scale fossil reef traces visible only as subtle arcs. Add a thin dusty atmosphere, two irregular captured moons and a broken pale ring. Separate terrain sphere, rare subsurface-brine mask, dust shell, limb, moons/ring and sparse basin-edge city emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and karst/basin/flint/fossil/dust/city masks; no baked light/UI. Center pivot, UV0/tangents, marker anchors, ≤3 shells, instanced debris, LOD1≤40%/LOD2≤12% preserving white/ochre/black geography and ring. Export Spline/source/runtime GLB/manifests/provenance; pass 412×915 phone silhouette, alpha, fallback and WebGL gates. Original art; never copy a bone world or turn fossils into a faction.
```

## City / colony — `ossara_ribcage_city_colony`

```text
Location class: `city_colony`.
Create `Ribcage Terrace Colony`, root `GSITE_OSSARA_RIBCAGE_CITY_COLONY`, a city built beside—not from—the arches of a fossil leviathan. Hero: three 70 m fossil ribs crossing above low lime-ceramic terraces and blue shade roofs, with clear support exclusions. Provide two 28–30 m basin roads, 24×12 m mech gates, 48 m court and 3 m shaded arcades. Objective: stabilize a failing rib brace and evacuate the archive ward. Damage: stable → brace shear → rib fall → ward isolated, with road bypass. Use seamless 2K `ossara_limeceramic_civic`, `ossara_fossil_calcite_weathered`, `ossara_blue_shade_fabric` PBR and 14 original district/fossil-protection/route decals; neutral channels, no baked shadows, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read ribs/routes/state. No bone-hive or copied city.
```

## Outpost — `ossara_marrowscan_outpost`

```text
Location class: `outpost`.
Create `Marrowscan Post`, root `GSITE_OSSARA_MARROWSCAN_OUTPOST`, a compact paleontology and groundwater station around a 48 m forked tomography mast. Hero: the mast aligns with one huge fossil vertebra but never touches it. Add 18 m loop, 32×36 m survey bay, 14×7 m light-mech gate and 3 m excavation trench. Objective: recover scan data before a dust front. Damage: scanning → antenna jam → mast tilt → buried shelter. Use seamless 2K `ossara_survey_composite_dust`, `ossara_fossil_surface_protected` PBR and 8 original survey/heritage/safe-route decals; neutral channels, restrained scanner emission, no baked dust, 3×3 proof. Meters/Y-up/-Z, 4/16 m, 24×12 m exterior clearance, UV0/tangents, pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile hero gate.
```

## Military base — `ossara_fossil_redoubt_military_base`

```text
Location class: `military_base`.
Create `Fossil Redoubt`, root `GSITE_OSSARA_FOSSIL_REDOUBT_MILITARY_BASE`, a defensive base hidden behind a natural flint ridge and protected fossil reserve. Hero: a dark steel command wedge under two white ceramic blast fins, clearly manufactured. Provide two 30 m roads, 24×12 m gates, 48 m court, 32×36 m bay and 3 m karst-cave flank. Objective: secure command and prevent demolition of the reserve. Damage: sealed → fin breach → ridge slide → command exposed; reserve route remains protected. Use seamless 2K `ossara_redoubt_darksteel`, `ossara_white_blast_ceramic`, `ossara_flint_dust` PBR and 16 original garrison/heritage/breach decals; neutral channels, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, hinge pivots, collision/nav/LOS/shot/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read base/routes/state. No copied base/bone architecture.
```

## Refinery — `ossara_calcite_kiln_refinery`

```text
Location class: `refinery`.
Create `Calcite Kiln Works`, root `GSITE_OSSARA_CALCITE_KILN_REFINERY`, a mineral plant processing non-fossil karst stone. Hero: four 58 m white vertical kilns around a black conveyor saddle. Add 30 m haul road, 18 m service loop, 24×12 m high bay, 48 m turnaround and 3 m maintenance catwalk. Objective: cool an overfired kiln and stop a dust cascade. Damage: firing → duct blockage → kiln crack → line isolation. Use seamless 2K `ossara_kiln_lime_refractory`, `ossara_black_conveyor_steel`, `ossara_calcite_dust_deposit` PBR and 14 original flow/heat/heritage exclusion decals; neutral channels, controlled heat emission, no baked dust, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile read kilns/routes/state. Original refinery.
```

## Relic / ruin — `ossara_leviathan_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Leviathan Ossuary`, root `GSITE_OSSARA_LEVIATHAN_RELIC_RUIN`, a natural fossil excavation intertwined with a small ancient survey shrine. Hero: a 110 m skull-like fossil plate lying horizontally, with clearly nonorganic stone survey pylons around a 46 m court. Provide 18 m route, 24×12 m exterior mech opening, two 3 m archaeology paths and 32×36 m refuge. Objective: recover the shrine record without damaging the fossil. Damage: buried → exposed → plate fracture → chamber collapse. Use seamless 2K `ossara_leviathan_fossil_calcite`, `ossara_ancient_flint_shrine` PBR plus 12 original archaeology/protection/strata decals; neutral channels, no fantasy glow, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, contact pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile silhouette. No copied creature/skull/relic.
```

## Spaceport — `ossara_drysea_spaceport`

```text
Location class: `spaceport`.
Create `Drysea Terminal`, root `GSITE_OSSARA_DRYSEA_SPACEPORT`, a launch field on a flat ancient seabed using wind-cut berms and deeply recessed cradles. Hero: a 96 m blue shade canopy spanning three black landing slots. Provide two 30 m approaches, 24×12 m deployer gates, 48 m court, 32×36 m staging pads and 3 m crew trench. Objective: clear a dust-buried cradle. Damage: ready → berm breach → canopy tear → alternate slot live. Use seamless 2K `ossara_drysea_apron`, `ossara_blue_aerospace_canopy`, `ossara_dustproof_cradle_metal` PBR and 16 original pad/wind/LZ decals; neutral channels, stable alpha, no baked dust, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read canopy/cradles. No copied port/craft.
```

## Pressure dome — `ossara_osteon_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Osteon Habitat`, root `GSITE_OSSARA_OSTEON_PRESSURE_DOME`, a cluster of ribbed engineered shells whose pattern comes from pressure logic, not literal bones. Hero: a 60 m opaque white dome with blue translucent clerestory and external dark compression ribs. Include 18×8 m connector, 24×12 m emergency lock, 48 m exterior court and two 3 m loops. Objective: repair a karst-sink seal. Damage: stable → foundation slip → rib buckle → one shell isolated. Use seamless 2K `ossara_osteon_pressure_shell`, `ossara_compression_rib_steel`, `ossara_blue_clerestory_glass` PBR plus 12 original pressure/foundation/evac decals; neutral channels, stable alpha, no bone texture, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge/floor pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone shell/state gate.
```

## Derelict megastructure — `ossara_spinal_ark_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Spinal Ark`, root `GSITE_OSSARA_SPINAL_ARK_DERELICT_MEGASTRUCTURE`, an ancient manufactured climate carrier stranded beside a fossil reef. Hero: a 210 m segmented black-and-white machine spine with collapsed habitat drums; it must remain visibly mechanical, not a skeleton. Provide two 30 m routes, 24×12 m portals, 48 m courts and 3 m upper salvage flank. Objective: extract the dormant climate core. Damage: dormant → drum fall → spine buckle → core exposure, deterministic route swaps. Use seamless 2K `ossara_ark_superstructure`, `ossara_habitat_drum_weathered`, `ossara_karst_dust_deposit` PBR plus 18 original sector/collapse/extraction decals; neutral channels, no baked light, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass mobile silhouette. Copy no ark/ship/skeleton design.
```
