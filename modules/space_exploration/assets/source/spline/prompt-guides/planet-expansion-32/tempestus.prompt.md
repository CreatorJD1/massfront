# Spline 3D prompt guide — Tempestus

**Ordinal:** 22 / 32  
**Planet ID:** `tempestus`  
**Sector:** `perseus_expanse`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** electrically active basalt archipelagos, cloud forests and flash-flood calderas  
**Atmosphere:** dense cobalt-grey supercell bands with a cold cyan ionized limb  
**Hazards:** stepped lightning, hurricane crosswind, flash floods, conductive ash and sensor bloom  
**Orbital silhouette:** three white spiral storms crossing a dark ocean, forked night-side lightning and a narrow cyan aurora  
**Material grammar:** rain-black basalt, matte storm ceramic, galvanized titanium, wet anti-slip polymer and amber/cyan safety emission

## Orbital / war-table prompt — The Three Tempests

> Create an original game-ready orbital planet for **Tempestus**, root `PLANET_TEMPESTUS`. Build a dark cobalt ocean world broken by hooked basalt island chains and three differently sized counter-rotating supercells. Add a thin cyan ionosphere, localized fork-lightning emission and narrow night-side settlements sheltered on leeward caldera rims. Separate `GEO_TERRAIN`, `GEO_OCEAN`, `FX_CLOUD_LOW`, `FX_CLOUD_SUPERCELL`, `FX_ATMOSPHERE`, `FX_AURORA`, `FX_LIGHTNING` and `ANCHOR_REGION_*`; do not paint labels into textures. The phone-scale silhouette must read from storm geometry and island arcs, not from color alone. Author neutral 2K surface, bathymetry/roughness, cloud-density, storm-mask, city-light and hazard-mask sources; one sphere, at most three transparent shells, instanced lightning cards, declared LOD and low-tier fallback.

## Eight location prompts

### `city_colony` — Stormcrown Terraces

Site ID: tempestus_stormcrown. Location class: city_colony.

> Build `SITE_TEMPESTUS_STORMCROWN`, a 448 × 384 m stepped colony inside a leeward caldera. Its hero is a terraced lightning-diverter crown above stacked hab blocks. Route two 18 m vehicle/light-mech switchbacks into a 48 m civic turn court, with a separate 4 m covered pedestrian spine and a 24 × 12 m medium-mech service portal. Use rain-black basalt retaining walls, storm ceramic, galvanized ribs and water-channel glazing. Objective: restart three surge sinks while flood gates change traversal. Author intact, inundated, strike-damaged and Brood B1/B3 drainage-invasion states; infestation follows wet utilities rather than recoloring buildings.

### `outpost` — Needlewatch Station

Site ID: tempestus_needlewatch. Location class: outpost.

> Build `SITE_TEMPESTUS_NEEDLEWATCH`, a 256 × 224 m weather outpost wrapped around one tall, guyed atmospheric needle. Provide an 18 m loop, a 32 m turning pad, 3 m service crawlways and wind-shadow cover that changes with deployable shutters. Objective: align three storm vanes before the next lightning front. Make mast segments break progressively without blocking every route; ground hardware uses insulated ceramic and wet titanium, with original barometric and lightning-exclusion decals.

### `military_base` — Thunder Bastion

Site ID: tempestus_thunder_bastion. Location class: military_base.

> Build `SITE_TEMPESTUS_THUNDER_BASTION`, a 480 × 416 m low-profile defense complex sunk into conductive basalt. Hero silhouette: a split Faraday citadel with four grounded lightning pylons. Include two complete 28 m mixed-unit routes, 24 × 12 m armored gates, 48 m maneuver courts and 4 m infantry breach galleries. Objective: disable the storm-fed shield grid. Damage progresses from grounded/intact to arc-overload, pylon fracture and flooded lower casemates; Brood can brace pylons with non-humanoid conductive tissue but never inherits the base silhouette.

### `refinery` — Voltglass Harvester

Site ID: tempestus_voltglass. Location class: refinery.

> Build `SITE_TEMPESTUS_VOLTGLASS`, a 448 × 352 m atmospheric-charge refinery whose hero is a suspended capacitor orchard. Create 30 m haul lanes, crane clearances, two 48 m courts, personnel catwalks and isolated transformer yards. Objective: vent three charge reservoirs in the correct order. Use fulgurite glass, charred basalt, galvanized frames and ceramic dielectric panels; destruction chains from corona leak to bus rupture to fused-glass crater while keeping one extraction route open.

### `relic_ruin` — Storm Choir Ruin

Site ID: tempestus_storm_choir. Location class: relic_ruin.

> Build `SITE_TEMPESTUS_STORM_CHOIR`, a 320 × 288 m pre-colonial acoustic ruin of hollow basalt fins that sing under storm pressure. The hero ring must look carved by local wind, not like a copied alien temple. Use a 16 m outer traversal loop, 4 m resonant trenches and one 42 m central court. Objective: tune five pressure chambers while lightning opens temporary passages. Damage means cracked fins and water-scoured chambers; Brood B2 growth colonizes sheltered acoustic cavities with pale insulating membranes.

### `spaceport` — Cyclone Breaker Port

Site ID: tempestus_cyclone_breaker. Location class: spaceport.

> Build `SITE_TEMPESTUS_CYCLONE_BREAKER`, a 512 × 416 m recessed spaceport behind two aerodynamic storm walls. Hero silhouette: three hinged windbreak petals around a dry launch apron. Provide 30 m heavy lanes, 56 × 48 m LZ, 24 × 12 m hangar portals and 4 m passenger tubes. Objective: retract windbreaks and secure launch clamps. Author calm, gale-locked, impact-damaged and flooded states; runway paint, lightning zones and evacuation arrows are original Tempestus decals.

### `pressure_dome` — Faraday Haven

Site ID: tempestus_faraday_haven. Location class: pressure_dome.

> Build `SITE_TEMPESTUS_FARADAY_HAVEN`, a 384 × 320 m inhabited dome nested inside a grounded hexagonal cage. Its hero is the offset cage/dome silhouette, with two 18 m vehicle locks, one 24 × 12 m freight lock, a 42 m inner plaza and raised 3 m pedestrian loops. Objective: reconnect cage sectors without energizing flooded streets. Use laminated storm glass, braided conductor ribs and warm civilian interiors; damage stages isolate individual glazing wedges rather than shattering the whole dome.

### `derelict_megastructure` — Riven Weather Loom

Site ID: tempestus_weather_loom. Location class: derelict_megastructure.

> Build `SITE_TEMPESTUS_WEATHER_LOOM`, a 640 × 512 m broken atmospheric-control ring embedded in a mountain saddle. Hero silhouette: two surviving arc towers and a hanging segmented collector ribbon. Create two 28 m service boulevards, 48 m equipment courts, 24 × 12 m gantries and 4 m interior maintenance routes. Objective: cross the loom, recover its storm model and survive scheduled arc sweeps. Destruction uses torn conductive ribbons and fulgurite scars; infestation grows toward electrical gradients as separate tendrils, nests and insulation bladders.

## Spline production contract

- Author at **1 unit = 1 m**, Y-up/-Z-forward, applied transforms, triangulated export and floor-contact origins. Use 4 m modular increments; mixed routes 18–30 m, medium-mech portals 24 × 12 m and turn courts 42–48 m.
- Create aligned seamless **2048²** `tempestus_basalt_wet`, `tempestus_storm_ceramic`, `tempestus_galvanized_titanium`, `tempestus_fulgurite_glass`, and `tempestus_flood_residue` families: BaseColor, tangent Normal, ORM (AO/Roughness/Metalness), optional Height/Emissive. No baked lighting.
- Provide a 2K decal atlas for storm zoning, grounding points, flood depth, rescue arrows, civic marks, serials, damage masks and objective states; minimum 16 px gutters with 8 px dilation.
- UV0 and tangents are mandatory. Keep consistent texel density; use deliberate trim/decal UVs, padded alpha islands and no stretched auto projections. Pivot modules at floor contact, doors at hinges, rotors/radars at axes and breakables at authored fracture centers.
- Name `PLANET_` or `SITE_` root, then `GEO_*`, `MAT_*`, `DECAL_*`, `LOD0/1/2`, `COL_*`, `NAV_*`, `LOS_*`, `PORTAL_*`, `COVER_*`, `OBJECTIVE_*`, `HAZARD_*`, `DESTROY_*`, `LZ_*` and `ANCHOR_*`. Separate simple watertight collision/nav/LOS proxies from render geometry.
- Preserve hero silhouettes at LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0. Export editable Spline source plus GLB candidate and `intake.json` with IDs, units, axes, PBR bindings, triangle/material counts, provenance and runtimeReady false.
- Capture matched phone portrait/landscape orbital and ground views. Reject clipped heroes, lost objectives, unreadable routes, texture shimmer, >3 transparent planet shells, missing proxies or unverified mobile frame cost.
- C&C3, Supreme Commander 2, XCOM 2 and StarCraft II are broad visual-language references only. Do not copy or trace any building, layout, unit, material, decal, logo, organism, palette or named landmark. No generic recolors.
