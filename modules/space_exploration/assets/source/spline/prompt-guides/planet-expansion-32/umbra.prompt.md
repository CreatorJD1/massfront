# Spline 3D prompt guide — Umbra

**Ordinal:** 28 / 32  
**Planet ID:** `umbra`  
**Sector:** `karak_lost_colonies`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** moonless basalt canyons, cryofog basins and bioluminescent lichen shelves  
**Atmosphere:** dim nitrogen haze with cyan magnetic curtains and almost no reflected night light  
**Hazards:** extreme darkness, cryofog, magnetic compass loss, brittle ice and false silhouettes  
**Orbital silhouette:** nearly black globe edged in cyan, with a thin luminous canyon web and no moon  
**Material grammar:** matte graphite, vesicular black basalt, photo-reactive glass, cold titanium and cyan navigation resin

## Orbital / war-table prompt — The Unlit Canyon World

> Create an original orbital asset for **Umbra**, root `PLANET_UMBRA`, in the Karak Lost Colonies. Its identity is controlled darkness: a nearly black basalt world with a sharp cyan atmospheric rim, faint bioluminescent canyon web, patchy polar cryofog and no moon. Use physically readable grazing normals rather than crushing everything to black. Separate terrain, ice/fog, high haze, atmosphere, magnetic aurora, night-biological emission and region anchors. Author 2K neutral basalt, canyon-height, ice, fog-density, magnetic, lichen-emission, settlement and hazard masks. Phone output must preserve the sphere and canyon identity without over-bloom.

## Eight location prompts

### `city_colony` — Lumen Deep

Site ID: umbra_lumen_deep. Location class: city_colony.

> Build `SITE_UMBRA_LUMEN_DEEP`, a 448 × 384 m canyon city organized around vertical light wells. Hero: three suspended hab bridges crossing a black chasm. Provide two 24–28 m mixed-unit shelf roads, 24 × 12 m tunnel portals, 48 m lift court and 4 m luminous pedestrian galleries. Objective: restore light wells while magnetic fog changes sensor range. Use matte graphite, basalt and cyan resin sparingly; destruction drops bridge sections into authored alternate routes.

### `outpost` — Blackline Observatory

Site ID: umbra_blackline. Location class: outpost.

> Build `SITE_UMBRA_BLACKLINE`, a 240 × 208 m dark-sky observatory whose hero is a low rotating slit dome with a cyan calibration edge. Include an 18 m loop, 32 m pad and 3 m instrument trench. Objective: align three magnetic baselines without visual landmarks. Damage exposes frost, jammed bearings and broken light baffles; no generic glowing tower.

### `military_base` — Nightglass Bastion

Site ID: umbra_nightglass. Location class: military_base.

> Build `SITE_UMBRA_NIGHTGLASS`, a 496 × 400 m stealth-defense base cut into a canyon wall. Hero: a black faceted gate revealed only by narrow edge illumination. Two 28 m roads, 24 × 12 m pressure portals, 48 m inner court and 4 m cliff galleries support combined arms. Objective: disable field occluders. Damage creates fractured photo-reactive glass and localized emergency light; Brood B2 uses light-avoiding sensory fronds in shadow, not the Umbral Brood’s name or a faction identity.

### `refinery` — Helium Rift Tap

Site ID: umbra_helium_rift. Location class: refinery.

> Build `SITE_UMBRA_HELIUM_RIFT`, a 480 × 384 m cryogenic refinery drawing gas from a deep fissure. Hero: paired low condenser arches spanning the rift. Add 28 m tanker loops, 48 m courts, 24 × 12 m cold-room portals and 4 m insulated catwalks. Objective: close three superconducting taps. Damage progresses through frost bloom, pipe embrittlement and vapor plume; keep transparent fog bounded.

### `relic_ruin` — Eclipse Monastery

Site ID: umbra_eclipse_monastery. Location class: relic_ruin.

> Build `SITE_UMBRA_ECLIPSE_MONASTERY`, a 336 × 288 m secular contemplative ruin carved to frame stars from the moonless sky. Hero: a stepped aperture wall above a dark reflecting basin. Include 16 m outer path, 42 m court and 4 m observation galleries. Objective: reconstruct an ancient star catalog. Use basalt, dark metal and mineral inlay; avoid copied monastic or alien motifs.

### `spaceport` — Penumbra Lift

Site ID: umbra_penumbra_lift. Location class: spaceport.

> Build `SITE_UMBRA_PENUMBRA_LIFT`, a 544 × 432 m canyon-wall port using an inclined magnetic launch track. Hero: a luminous diagonal track rising from darkness. Provide 30 m cargo roads, 56 × 48 m LZ, 24 × 12 m hangars and 4 m passenger lifts. Objective: restore guide lights and launch clamps. Damage blacks out sections and bends rails while preserving one visible extraction path.

### `pressure_dome` — Aurora Vault

Site ID: umbra_aurora_vault. Location class: pressure_dome.

> Build `SITE_UMBRA_AURORA_VAULT`, a 384 × 336 m low dome beneath a magnetic curtain. Hero: dark glass ribs with a restrained cyan rim and warm internal agriculture. Two 18 m locks, one 24 × 12 m freight portal, 42 m central garden and 3 m inner loop define circulation. Objective: isolate a cryofog breach. Damage is frost delamination and sector blackout, not full-scene glow.

### `derelict_megastructure` — Occlusion Lens

Site ID: umbra_occlusion_lens. Location class: derelict_megastructure.

> Build `SITE_UMBRA_OCCLUSION_LENS`, a 672 × 512 m abandoned magnetic telescope formed by three enormous black rings across a canyon. Hero: the offset ring silhouette and broken suspended detector. Add 28 m service routes, 48 m actuator courts, 24 × 12 m ring portals and 4 m maintenance interiors. Objective: cross the lens and recover a lost deep-space map. Damage uses buckled rings and frozen cable fans; local Brood develops vibration-sensing whiskers and insulated sacs.

## Spline production contract

- Work at 1 m, Y-up/-Z-forward, 4 m modules, applied transforms, triangles. Mixed routes 18–30 m, 24 × 12 m portals, 42–48 m courts. Author light/fog/sensor volumes independently of geometry.
- Create seamless 2048² `umbra_matte_graphite`, `umbra_black_basalt`, `umbra_photoreactive_glass`, `umbra_cold_titanium`, `umbra_lichen_frost`: neutral BaseColor, tangent Normal, ORM, optional Height/controlled Emissive.
- Provide a 2K decal atlas for edge routes, low-light navigation, magnetic zones, cryogenic danger, districts, calibration, extraction and objectives; 16 px gutters/8 px dilation.
- UV0/tangents and stable density required. Pivot observatory/lens rings at axes, gates at hinges, bridge sections at joints and breakables at fracture centers. Separate watertight collision `COL_`, `NAV_`, `LOS_`, fog and hazard proxies.
- Name `PLANET_UMBRA`, `SITE_UMBRA_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%; retain black-on-cyan silhouettes without relying on bloom.
- Export Spline source, GLB and `intake.json` with IDs, axes, scale, PBR, emission luminance, counts, provenance and runtimeReady false. Phone captures must prove readable geometry at minimum brightness and no clipped black values.
- The named reference games may guide macro readability only. Copy no assets, maps, buildings, materials, silhouettes, decals, units, organisms, UI, logos, palette or name. `umbra` is a planet ID, not a playable Brood faction; no generic recolors.
