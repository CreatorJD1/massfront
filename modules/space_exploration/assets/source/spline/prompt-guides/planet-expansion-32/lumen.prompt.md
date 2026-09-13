# Lumen — Spline 3D prompt guide

**Expansion slot:** 18  
**Sector:** Veyra Frontier  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A dry high-albedo world of white salt plateaus, gold heliostat fields, turquoise mineral sinkholes and periodic ultraviolet auroras. Architecture relies on shaded stone, matte ceramics, fine gold reflector structures and deep blue thermal wells. Its brightness comes from material response, not excessive bloom or a generic glowing recolor.

## Orbital / war-table — `PLANET_LUMEN`

```text
Create original orbital planet Lumen, root `PLANET_LUMEN`: white salt continents, ochre shadow basins, turquoise mineral sinkholes, dark equatorial thermal rifts, vast but subtle gold heliostat fields and a narrow ultraviolet auroral crown. Add one tiny dark moon for scale. Separate terrain sphere, rare brine layer, thin dust-cloud shell, atmosphere/aurora limb, moon and concentrated night emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and salt/brine/heliostat/aurora/hazard/city masks; no baked sunlight or bloom. Center pivot, UV0/tangents, marker anchors, ≤3 transparent shells, applied transforms, LOD1≤40%/LOD2≤12% preserving sinkholes, rifts and auroral crown. Export editable Spline/source/runtime GLB, manifests/provenance; pass 412×915 silhouette, fallback, alpha and WebGL checks. Original MASSFRONT art only.
```

## City / colony — `lumen_heliostat_city_colony`

```text
Location class: `city_colony`.
Create `Heliostat Crown City`, root `GSITE_LUMEN_HELIOSTAT_CITY_COLONY`, a shaded saltstone city arranged around a 72 m central reflector crown. Hero: a functional ring of articulated gold mirrors above stepped white civic blocks and deep-blue cooling courtyards. Provide two 28–30 m boulevards, 24×12 m mech portals, 48 m court and 3 m shaded arcades. Objective: feather the reflector crown before a flare. Damage: tracking → mirror jam → crown shear → cooling district isolated, with rear bypass. Use seamless 2K `lumen_saltstone_civic`, `lumen_matte_gold_reflector`, `lumen_blue_thermal_ceramic` PBR and 14 original district/heat/route decals; neutral channels, restrained status emission, no baked highlight, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, hinge pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read crown/routes/state. No copied utopia/city.
```

## Outpost — `lumen_glintwatch_outpost`

```text
Location class: `outpost`.
Create `Glintwatch Station`, root `GSITE_LUMEN_GLINTWATCH_OUTPOST`, a compact radiation/weather observatory whose hero is a 46 m folding shade sail over a blue instrument vault. Add 18 m service loop, 32×36 m calibration bay, 14×7 m light-mech gate and 3 m shadow trench. Objective: deploy the shade and recover flare telemetry. Damage: folded → actuator jam → sail tear → vault-only survival. Use seamless 2K `lumen_uvproof_outpost_composite` and `lumen_reflector_mesh_gold` PBR plus 8 original UV/calibration/safe-shadow decals; neutral channels, stable alpha, no baked glare, 3×3 proof. Meters/Y-up/-Z, 4/16 m, 24×12 m exterior clearance, UV0/tangents, hinge/floor pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile gate shows sail/vault. Original only.
```

## Military base — `lumen_radiant_bastion_military_base`

```text
Location class: `military_base`.
Treat every listed 2K material family as a complete PBR source set.
Create `Radiant Bastion`, root `GSITE_LUMEN_RADIANT_BASTION_MILITARY_BASE`, a low, deeply shaded base protected by articulated reflector armor. Hero: two 60 m opposing mirror fins framing a black command trench. Provide two 30 m approaches, 24×12 m gates, 48 m court, 32×36 m bay and 3 m thermal-tunnel flank. Objective: disable the mirror lock and seize the trench. Damage: aligned → lock fault → fin fall → trench exposed, maintaining alternate road. Use seamless 2K `lumen_bastion_white_armor`, `lumen_matte_reflector_gold`, `lumen_shadow_trench_composite` and 16 original garrison/flare/breach decals; neutral channels, no baked highlights, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, axis pivots, collision/nav/LOS/shot/cover/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance and phone evidence. Copy no protected base.
```

## Refinery — `lumen_sunwell_refinery`

```text
Location class: `refinery`.
Create `Sunwell Mineral Works`, root `GSITE_LUMEN_SUNWELL_REFINERY`, a solar-thermal refinery descending into a turquoise mineral sinkhole. Hero: a 78 m annular heliostat gantry around a deep blue extraction throat. Include 30 m haul road, 18 m service loop, 24×12 m high bay, 48 m turnaround and 3 m shaded catwalk. Objective: cool the throat and recover a crystal slurry core. Damage: focused → coolant loss → gantry warp → throat shuttered. Use seamless 2K `lumen_sunwell_refractory`, `lumen_turquoise_mineral_deposit`, `lumen_heliostat_mechanism` PBR and 14 original flow/heat/hazard decals; neutral channels, controlled thermal emission, no baked light, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read ring/throat/routes.
```

## Relic / ruin — `lumen_chromatic_archive_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Chromatic Archive`, root `GSITE_LUMEN_CHROMATIC_ARCHIVE_RELIC_RUIN`, an ancient optical calendar made from weathered mineral slats, not rainbow fantasy crystal. Hero: nine narrow white fins casting functional bands into a 46 m recessed court and a dark archive aperture. Add 18 m approach, 24×12 m exterior mech opening, two 3 m survey flanks and 32×36 m refuge. Objective: align three surviving fins. Damage: buried → uncovered → fin fracture → aperture jam. Use seamless 2K `lumen_ancient_saltglass_stone` and `lumen_optical_mineral_inlay` PBR plus 12 original nonmodern alignment/survey marks; neutral channels, tiny mineral emission, no baked caustics, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12% retaining nine fins. Export Spline/GLBs/manifests/provenance; mobile read objective. Copy no relic/glyph.
```

## Spaceport — `lumen_dawnrail_spaceport`

```text
Location class: `spaceport`.
Create `Dawnrail Spaceport`, root `GSITE_LUMEN_DAWNRAIL_SPACEPORT`, a launch field using long shaded magnetic rails across a salt plateau. Hero: a 105 m black-and-gold launch rail ending beneath a folded white shade arch. Provide two 30 m approaches, 24×12 m deployer gates, 48 m court, 32×36 m staging pads and 3 m crew tunnel. Objective: release the rail brake and open LZ two. Damage: ready → brake seize → rail buckle → short alternate cradle. Use seamless 2K `lumen_launchrail_dark_ceramic`, `lumen_apron_saltcrete`, `lumen_shade_arch_gold` PBR and 16 original rail/pad/thermal/LZ decals; neutral channels, no baked glare, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone silhouette. No copied rail/ship/port.
```

## Pressure dome — `lumen_shadevault_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Shadevault Habitat`, root `GSITE_LUMEN_SHADEVAULT_PRESSURE_DOME`, three mostly opaque pressure shells beneath a shared articulated sunshade. Hero: a 64 m wing-like shade supported above low blue-rimmed domes. Include 18×8 m connector, 24×12 m emergency lock, 48 m exterior court and two 3 m loops. Objective: realign the shade before ultraviolet noon. Damage: tracking → hinge failure → membrane scorch → one vault sealed. Use seamless 2K `lumen_shadevault_shell`, `lumen_uv_membrane`, `lumen_blue_habitat_floor` PBR and 12 original pressure/UV/evac decals; neutral channels, stable alpha, restrained status emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge/floor pivots, separate membranes/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone gate shows shade/shells/state.
```

## Derelict megastructure — `lumen_broken_corona_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Broken Corona Array`, root `GSITE_LUMEN_BROKEN_CORONA_DERELICT_MEGASTRUCTURE`, a fallen planetary solar regulator across a salt basin. Hero: a 220 m segmented gold-white arc with three collapsed mirror petals and exposed blue coolant channels. Provide two 30 m routes through separate arc gaps, 24×12 m portals, 48 m courts and 3 m elevated salvage path. Objective: extract the regulator core. Damage: dormant → petal drop → arc twist → core exposure, deterministic route swaps. Use seamless 2K `lumen_corona_superstructure`, `lumen_weathered_reflector`, `lumen_coolant_salt_deposit` PBR plus 18 original sector/collapse/salvage decals; neutral channels, no baked reflections, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone silhouette gate. Original megastructure.
```
