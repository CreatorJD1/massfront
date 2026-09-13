# Mycora — Spline 3D prompt guide

**Expansion slot:** 15  
**Sector:** Helios Quarantine  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A humid, dim world dominated by continent-scale fungal forests, hollow shelf mesas, phosphorescent spore rivers and seasonal canopy blooms. Settlements stand on elevated ceramic roots and sealed amber membranes. Native fungal ecology uses soft fan geometry; hostile Brood parasitism is black-red vascular grafting that consumes it and remains non-humanoid/non-playable.

## Orbital / war-table — `PLANET_MYCORA`

```text
Create original orbital planet Mycora, root `PLANET_MYCORA`: a humid olive/umber world with giant pale shelf-forest continents, dark teal inland seas, luminous spore-river deltas, spiral bloom storms and a broad amber atmosphere. Add one porous captured moon and a faint polar spore torus. Separate terrain sphere, water layer, canopy/bloom mask, spore-cloud shell, atmosphere limb, moon/torus and sparse elevated colony emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and ocean/canopy/bloom/hazard/city masks; no baked light or UI. Center pivot, UV0/tangents, applied transforms, ≤3 transparent shells, instanced torus spores, marker anchors, LOD1≤40%/LOD2≤12% retaining shelf continents and spiral blooms. Export editable Spline/source/runtime GLB, manifests/provenance; pass 412×915 silhouette/fallback/alpha/WebGL. Make original MASSFRONT ecology, never a copied zerg/fungal planet.
```

## City / colony — `mycora_canopy_confluence_city_colony`

```text
Location class: `city_colony`.
Create `Canopy Confluence`, root `GSITE_MYCORA_CANOPY_CONFLUENCE_CITY_COLONY`, an elevated settlement woven among three immense native shelf trunks. Hero: a 64 m ceramic-root civic lantern suspended between mushroom fans. Include two 28–30 m raised vehicle viaducts, 24×12 m mech locks, 48 m deck court and 3 m pedestrian bridges. Objective: isolate a toxic bloom intake. Damage: sealed → spore filter choke → bridge sag → one terrace quarantined, with lower bypass. Use seamless 2K `mycora_elevated_ceramic_root`, `mycora_amber_membrane_glass`, `mycora_native_shelf_bark` PBR plus 14 original district/filter/route decals; neutral channels, stable alpha, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, pivots/transforms, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read shows trunks, lantern, routes and state. No generic fantasy mushroom town or copied city.
```

## Outpost — `mycora_sporeline_outpost`

```text
Location class: `outpost`.
Create `Sporeline Listening Post`, root `GSITE_MYCORA_SPORELINE_OUTPOST`, a sealed sensor station on the edge of a luminous spore river. Hero: a 48 m stacked filter sail with visibly different intake/exhaust faces. Add 18 m service loop, 32×36 m scrubber bay, 14×7 m light-mech gate and 3 m raised sampling walk. Objective: recover bloom forecast cores. Damage: clear → filter saturation → sail tear → shelter sealed. Use seamless 2K `mycora_filter_polymer_sporefilm` and `mycora_wet_shelfwood` PBR plus 8 original air-quality/sampling/route decals; neutral channels, tangent normal, linear ORM, height/emission, no baked mist, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, 24×12 m exterior clearance, UV0/tangents, floor pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; verify mobile hero/objective. Original only.
```

## Military base — `mycora_barkshield_military_base`

```text
Location class: `military_base`.
Create `Barkshield Redoubt`, root `GSITE_MYCORA_BARKSHIELD_MILITARY_BASE`, a quarantine fort grown around—but not made from—three native shelf trunks. Hero: a segmented white ceramic defense ring punctured by tall amber filter towers. Two 30 m approaches, 24×12 m decon gates, 48 m court, 32×36 m bay and 3 m canopy flank. Objective: restore the quarantine ring. Damage: sealed → filter breach → ring segment collapse → command pod exposed. Include optional hostile Brood graft stages as black-red vascular braces digesting native tissue, never playable. Use 2K `mycora_quarantine_ceramic_armor`, `mycora_filter_tower_membrane`, `mycora_brood_parasitic_graft` PBR and 16 original decon/breach decals; neutral channels, graded contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, pivots, collision/nav/LOS/shot/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone routes/state. Copy no faction base/hive.
```

## Refinery — `mycora_sapworks_refinery`

```text
Location class: `refinery`.
Create `Amber Sapworks`, root `GSITE_MYCORA_SAPWORKS_REFINERY`, a sustainable refinery tapping shed fungal resin without harming live trunks. Hero: twin 58 m translucent settling columns around a low ceramic distillation spine. Provide 30 m tanker road, 18 m service loop, 24×12 m high bay, 48 m turnaround and 3 m operator catwalk. Objective: stop a contaminated batch. Damage: flowing → valve occlusion → column crack → isolated drain. Use seamless 2K `mycora_resin_process_ceramic`, `mycora_amber_column_glass`, `mycora_wet_service_deck` PBR plus 14 original flow/biocontainment decals; neutral channels, stable transparency, restrained process emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m grid, UV0/tangents, pipe pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read without fluids/particles. No copied refinery.
```

## Relic / ruin — `mycora_ancestor_ring_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Ancestor Ring`, root `GSITE_MYCORA_ANCESTOR_RING_RELIC_RUIN`, a mineral civilization ruin slowly incorporated by harmless native fungal shelves. Hero: a 62 m broken stone torus carrying concentric shelf fans, visibly archaeological rather than organic architecture. Add 18 m vehicle approach, 24×12 m exterior mech gate, 46 m court and two 3 m excavation paths. Objective: expose three sealed memory niches. Damage: buried → excavated → torus fracture → niche collapse. Use seamless 2K `mycora_ancient_porous_stone`, `mycora_native_shelf_growth_contact` PBR plus 12 original survey/age/protection decals; neutral channels, graded mineral/native contact, restrained bioluminescence, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, contact pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; show ring/objective at phone scale. Copy no relic/hive/glyph.
```

## Spaceport — `mycora_canopy_lift_spaceport`

```text
Location class: `spaceport`.
Create `Canopy Lift Spaceport`, root `GSITE_MYCORA_CANOPY_LIFT_SPACEPORT`, an elevated launch deck above the spore canopy. Hero: a tripod 82 m lift tower with petal-like blast baffles that are mechanical, not floral decoration. Include two 30 m raised approaches, 24×12 m deployer gates, 48 m court, 32×36 m staging pads and sealed 3 m crew tubes. Objective: clear a bloom-clogged intake and reopen LZ two. Damage: ready → baffle jam → deck breach → alternate lower cradle. Use seamless 2K `mycora_aerospace_ceramic_deck`, `mycora_bloom_resistant_baffle`, `mycora_pressure_membrane` PBR plus 16 original pad/filter/LZ decals; neutral channels, stable alpha, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, hinge pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance and phone evidence. No copied aircraft/spaceport.
```

## Pressure dome — `mycora_mycoglass_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Mycoglass Conservatory`, root `GSITE_MYCORA_MYCOGLASS_PRESSURE_DOME`, three sealed research domes interlocked with native shelf trunks but structurally independent. Hero: one 54 m amber ribbed dome with a central white filter chimney. Include 18×8 m vehicle connector, 24×12 m emergency lock, 48 m exterior court and two 3 m interior loops. Objective: separate a parasitized specimen wing. Damage: clean → spore seep → membrane rip → wing isolation. Use seamless 2K `mycora_mycoglass_ribbed_seal`, `mycora_conservatory_ceramic`, `mycora_specimen_contact` PBR plus 12 original pressure/lab/quarantine decals; neutral channels, stable transparent edges, graded contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, hinge/floor pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone gate shows shells/connectors/state. Brood parasitism non-humanoid/non-playable.
```

## Derelict megastructure — `mycora_hollow_worldtree_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Hollow Worldtree Array`, root `GSITE_MYCORA_HOLLOW_WORLDTREE_DERELICT_MEGASTRUCTURE`, an ancient artificial climate tower now hollow and colonized by native shelf forests. Hero: a 190 m lattice trunk split lengthwise to reveal spiral environmental decks. Provide two 28–30 m root routes, 24×12 m mech portals, 48 m courts and 3 m spiral salvage flank. Objective: recover the climate seed core. Damage: dormant → deck failure → trunk split → core exposure, deterministic route swaps. Use seamless 2K `mycora_worldtree_mineral_lattice`, `mycora_climate_deck_weathered`, `mycora_native_canopy_contact` PBR plus 18 original sector/climate/salvage decals; neutral channels, graded contact, no baked light, 3×3 proof. Meters/Y-up/-Z, 4/16 m grid, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance and mobile evidence. Original megastructure; no copied world tree/hive.
```
