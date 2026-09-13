# Erebos — Spline 3D prompt guide

**Expansion slot:** 12  
**Sector:** Orion Cryosphere  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A tidally locked super-Earth whose inhabited terminator is a narrow copper-lit ribbon between a vitrified dayside and methane-frost nightside. Subglacial black-brine reservoirs, blade-like basalt uplifts, eclipse dust and a fractured moon define the world. Construction uses dark sintered basalt, pale aerogel, copper thermal buses and narrow amber emissions rather than a generic black recolor.

## Orbital / war-table — `PLANET_EREBOS`

```text
Create an original game-ready orbital planet for MASSFRONT named Erebos, root `PLANET_EREBOS`. Make a tidally locked super-Earth with a permanent incandescent white-gold dayside scar, a broad copper-red terminator, a blue-black methane-frost nightside, blade-shaped basalt uplifts, black-brine fracture lakes and one visibly fractured moon. Add separate named terrain sphere, brine/volatile layer, high-altitude eclipse-dust cloud shell, thin atmosphere limb, moon/debris group and sparse terminator settlement emission. Keep the silhouette asymmetrical and readable at phone war-table size; never make it a plain dark sphere.

Author neutral 2048×2048 equirectangular base color, tangent normal, linear ORM, height and emission drivers plus polar-frost, terminator, brine, city-light and eclipse-dust masks. UV seams and poles must pass visual inspection; no baked star lighting or UI labels. Add region-marker anchors without text. Use one primary sphere, at most three transparent shells, instanced moon debris, center pivot, applied transforms, UV0/tangents and `LOD0_`, `LOD1_`, `LOD2_` meshes; LOD1 ≤40% and LOD2 ≤12% while retaining the day/night boundary, fractured moon and brine scars. Export editable Spline source and source/runtime GLB with a manifest and provenance. Verify 412×915 portrait and tactical desktop captures, texture fallback, alpha sorting and no WebGL errors. Reference games may guide strategic readability only; copy no protected planet, palette, texture, symbol, UI, layout or screenshot.
```

## City / colony — `erebos_gloamline_meridian_colony`

```text
Location class: `city_colony`.
Create the original Erebos city/colony `Gloamline Meridian`, root `GSITE_EREBOS_GLOAMLINE_MERIDIAN_COLONY`: a stepped linear settlement straddling the permanent terminator. Its hero silhouette is a 70 m copper thermal-spine tower linking low basalt habitation terraces and a sunward heat shield. Provide two 28–30 m combined-arms streets parallel to the terminator, three 18×8 m cross gates, a 48 m turn court and a separate 3 m pressurized pedestrian arcade. Objective: reroute the thermal spine before eclipse cold reaches the habitat. Damage graph: intact → shield-punctured → spine-separated → frozen evacuation shell; keep a deterministic vehicle bypass.

Use unique seamless 2K PBR families `erebos_sintered_basalt_civic`, `erebos_copper_thermal_bus` and `erebos_frosted_aerogel`, with neutral base color, tangent normal, linear ORM, optional height and restrained amber/blue emission; prove 3×3 seams. Create 14 original district, heat-flow, frost, evacuation and route decals. Build in meters, Y-up/-Z forward, 4 m source/16 m macro grid; preserve 24×12 m mech portals, 32×36 m passing bays and ramps ≤8.3%. Use UV0/tangents, floor/hinge pivots, applied transforms, root-safe names, `COLL_`, `NAV_`, `LOS_`, `COVER_`, `PORTAL_`, `OBJ_`, `DESTRUCT_` proxies and LOD1≤40%/LOD2≤12%. Export editable Spline plus source/runtime GLB and manifests. At 412×915 the spine, heat shield, both routes, objective and damage state must read. Original MASSFRONT art only; do not copy reference cities, logos, materials or layouts.
```

## Outpost — `erebos_lantern_watch_outpost`

```text
Location class: `outpost`.
Create `Lantern Watch`, root `GSITE_EREBOS_LANTERN_WATCH_OUTPOST`, a compact nightside science outpost built around a 42 m amber thermal-lantern mast, three buried instrument pods and a frost-cut service loop. The mast is the hero; its triangular radiator fins must read from tactical zoom. Provide one 18 m one-way vehicle loop, a 32×36 m service bay, 14×7 m light-mech gate and a protected 3 m personnel trench. Objective: restart the lantern and retrieve eclipse telemetry. Damage graph: heated/operational → radiator jam → mast tilt → cold-dark shelter, with the loop always legally navigable.

Author seamless 2K `erebos_cryogenic_service_composite` and `erebos_amber_radiator_metal` PBR plus 8 original thermal, survey, ice-depth and emergency-route decals. Neutral albedo, tangent normal, linear ORM, optional height/emission, no baked glow; 3×3 seam proof. Work in meters, Y-up/-Z forward, 4/16 m grids; preserve 18×8 m vehicle and 24×12 m exterior mech envelopes, ramps ≤8.3%. Use UV0/tangents, contact/hinge pivots, applied transforms, `GEO_`/`LOD0_`/`LOD1_`/`LOD2_` and simple `COLL_`/`NAV_`/`LOS_`/`PORTAL_`/`OBJ_`/`DESTRUCT_` proxies. LOD1≤40%, LOD2≤12%, retaining mast fins and pod cluster. Export editable Spline/source/runtime GLB, manifest and provenance; pass 412×915 readability and runtime alpha/error checks. Copy no protected outpost or iconography.
```

## Military base — `erebos_sundagger_redoubt_military_base`

```text
Location class: `military_base`.
Create `Sundagger Redoubt`, root `GSITE_EREBOS_SUNDAGGER_REDOUBT_MILITARY_BASE`, an original Erebos fort dug into the sunward edge of a basalt knife ridge. Hero silhouette: a split-chevron solar armor wall surrounding an offset command bunker and retractable thermal artillery shutters. Lay out two 28–30 m approach roads, 24×12 m heavy gates, a 48 m armored turn court, 32×36 m passing bay and a 3 m frost-side infiltration gallery. Objective: seize the command bunker and disable the solar wall. Damage graph: sealed → shutter breach → wall segment collapse → exposed command core; debris cannot erase both approaches.

Create seamless 2K `erebos_redoubt_basalt_armor`, `erebos_solar_ceramic_shutter` and `erebos_coldside_bunker_polymer` PBR sets plus 16 original garrison, thermal danger, gate, lane and breach decals. Neutral albedo, tangent normal, linear ORM, optional height and disciplined amber status emission; prove 3×3 tiling. Meters, Y-up/-Z forward, 4/16 m grids, 3 m personnel paths, 18×8 vehicle and 24×12 mech clearances, ramps ≤8.3%. UV0/tangents, floor/hinge pivots, applied transforms, named collision/nav/LOS/cover/shot/portal/objective/destruction proxies, LOD1≤40%, LOD2≤12%. Export editable Spline and GLBs with manifests/provenance; phone portrait must show wall, bunker, two routes, flank and breach state. Original work only; reference games guide combined-arms clarity, never asset shape.
```

## Refinery — `erebos_brinefall_extraction_refinery`

```text
Location class: `refinery`.
Create `Brinefall Extraction`, root `GSITE_EREBOS_BRINEFALL_EXTRACTION_REFINERY`, where black subglacial brine rises through a terraced heat-exchange plant. Hero silhouette: a 60 m inverted condenser harp spanning a steaming fracture, paired with low pump galleries and insulated tanker gantries. Include a 30 m two-way logistics road, 18 m maintenance loop, 24×12 m mech bay, 48 m turnaround and elevated 3 m operator route. Objective: isolate a pressure cascade and secure the brine separator. Damage graph: flowing → iced valves → condenser rupture → controlled vent, with deterministic bridge and ground bypass states.

Author seamless 2K `erebos_black_brine_process`, `erebos_frosted_nickel_pipe` and `erebos_heat_exchange_ceramic` PBR families; use neutral base color, tangent normal, linear ORM, height and restrained pressure/temperature emission, never baked steam. Add 14 original flow, pressure, frost, isolation and logistics decals; prove 3×3 seams. Build meters/Y-up/-Z, 4/16 m grid; retain combined-arms envelopes and ramps≤8.3%. Supply UV0/tangents, pipe-axis and floor pivots, applied transforms, `COLL_`, `NAV_`, `LOS_`, `PORTAL_`, `OBJ_`, `HAZARD_`, `DESTRUCT_` proxies, LOD1≤40%/LOD2≤12%. Export Spline and source/runtime GLB plus manifests/provenance. At 412×915 the condenser, fracture, roads, objective and damage state must read without particles. No copied refinery forms or labels.
```

## Relic / ruin — `erebos_eclipse_choir_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Eclipse Choir`, root `GSITE_EREBOS_ECLIPSE_CHOIR_RELIC_RUIN`, an ancient nonhuman acoustic observatory carved into resonant basalt fins at the terminator. Hero silhouette: seven leaning monolith fins framing a circular 46 m resonance court, with a collapsed subterranean archive exposed on the cold side. Provide one 18 m vehicle approach, a 24×12 m exterior mech portal, two 3 m archaeology routes and a 32×36 m refuge bay. Objective: align three resonators and recover the archive. Damage graph: buried → excavated → resonator fracture → archive collapse; do not use magical floating stones.

Create seamless 2K `erebos_resonant_basalt_relic` and `erebos_mineral_inlay_weathered` PBR sets plus 12 original, unreadable-as-modern-language survey, resonance, excavation and hazard decals/glyph panels. Neutral base color, tangent normal, linear ORM, optional height and extremely restrained mineral emission; 3×3 seam proof. Meters/Y-up/-Z, 4/16 m grid, legal combined-arms clearances and ramps≤8.3%. UV0/tangents, floor/contact pivots, applied transforms, simple collision/nav/LOS/cover/objective/destruction proxies and LOD1≤40%/LOD2≤12% retaining all seven fins. Export editable Spline and GLBs with manifests/provenance; pass phone silhouette and objective readability. Make the archaeology original; copy no protected relic, glyph, layout or palette.
```

## Spaceport — `erebos_dawnbreak_apron_spaceport`

```text
Location class: `spaceport`.
Create `Dawnbreak Apron`, root `GSITE_EREBOS_DAWNBREAK_APRON_SPACEPORT`, a thermally divided spaceport on the bright terminator. Hero silhouette: a crescent sunshield wrapping three recessed landing cradles and a tall cold-side traffic needle. Provide two 30 m heavy approaches, 24×12 m deployer portals, a 48 m apron turn court, 32×36 m staging bays and segregated 3 m passenger tubes. Objective: reopen cradle two and extract before an eclipse front. Damage graph: operational → shield tear → cradle obstruction → emergency cold-side launch; retain a clear alternate LZ.

Author seamless 2K `erebos_apron_refractory_composite`, `erebos_landing_cradle_metal` and `erebos_pressure_glass_frost` PBR families plus 16 original pad, approach, thermal boundary, service and extraction decals. Neutral albedo, tangent normal, linear ORM, height and narrow status emission; transparent edges must not halo, and all tiles need 3×3 proof. Use meters, Y-up/-Z, 4/16 m grids, combined-arms clearances and ramps≤8.3%; UV0/tangents, hinge/contact pivots, applied transforms, `LZ_`, `COLL_`, `NAV_`, `LOS_`, `PORTAL_`, `OBJ_`, `DESTRUCT_` proxies, LOD1≤40%, LOD2≤12%. Deliver editable Spline/source/runtime GLB and manifests. Verify phone portrait with no UI-text baked into art. No copied spacecraft, airport or faction marks.
```

## Pressure dome — `erebos_penumbra_habitat_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Penumbra Habitat`, root `GSITE_EREBOS_PENUMBRA_HABITAT_PRESSURE_DOME`, an offset chain of three low pressure domes bridging warm and cold terrain. Hero silhouette: overlapping aerogel shells around a central copper heat tree; outer shells are faceted and partially buried, not generic glass bubbles. Include an 18 m pressurized vehicle connector, 24×12 m emergency high lock, 48 m exterior court and two 3 m interior loops. Objective: balance heat between domes and evacuate the failing cold cell. Damage graph: balanced → seal leak → connector isolation → cold-cell implosion, preserving exterior bypass.

Create seamless 2K `erebos_penumbra_aerogel_seal`, `erebos_habitat_basalt_floor` and `erebos_heat_tree_copper` PBR families plus 12 original pressure, habitat, heat circuit, quarantine and evacuation decals. Neutral base color, tangent normal, linear ORM, height/status emission; validate transparent shell sorting, no baked reflection and 3×3 seams. Meters/Y-up/-Z, 4/16 m grid, route clearances/ramps≤8.3%; UV0/tangents, floor/hinge pivots, applied transforms, separated glass, collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export editable Spline and GLBs with manifests/provenance. At 412×915 show all three shells, heat tree, connectors, objective and damage state. Original architecture only.
```

## Derelict megastructure — `erebos_shattered_oculus_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Shattered Oculus`, root `GSITE_EREBOS_SHATTERED_OCULUS_DERELICT_MEGASTRUCTURE`, the grounded remains of a planet-scale eclipse observatory. Hero silhouette: a broken 180 m annular lens frame half-buried across the terminator, crossed by collapsed calibration rails and an exposed archive drum. Build two legal 28–30 m ground routes through different ring gaps, a 24×12 m mech portal, 48 m turn court and 3 m elevated survey flank. Objective: recover the lens-control core before the next thermal shear. Damage graph: dormant → rail failure → ring segment fall → archive exposure, with deterministic route swaps and no random blockage.

Author seamless 2K `erebos_oculus_dark_alloy`, `erebos_lens_ceramic_weathered` and `erebos_terminator_dust_deposit` PBR families plus 18 original calibration, sector, collapse chronology, route and salvage decals. Neutral albedo, tangent normal, linear ORM, height and restrained dormant emission; prove seams and transparent lens fragments. Meters/Y-up/-Z, 4/16 m grids, combined-arms envelopes, ramps≤8.3%; UV0/tangents, axis/contact pivots, applied transforms, explicit occluder/collision/nav/LOS/shot/objective/extraction/destruction proxies, LOD1≤40%, LOD2≤12% retaining the broken ring. Export editable Spline/source/runtime GLB and reports. Phone portrait must show ring, routes, archive and state without effects. Copy no protected ringworld or megastructure design.
```
