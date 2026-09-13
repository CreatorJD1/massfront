# Spline 3D prompt guide — Pelagos

**Ordinal:** 24 / 32  
**Planet ID:** `pelagos`  
**Sector:** `perseus_expanse`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** equatorial archipelagos, floating kelp shelves, volcanic reefs and abyssal trenches  
**Atmosphere:** clear marine blue with towering white typhoon walls and salt haze  
**Hazards:** storm surge, wave impact, salt corrosion, unstable flotation and deep-water breach  
**Orbital silhouette:** brilliant cyan ocean, a broken emerald equatorial island chain and one immense white typhoon eye  
**Material grammar:** reef basalt, marine titanium, nacre composite, salt-weathered concrete and pressure glass

## Orbital / war-table prompt — The Broken Blue

> Create an original orbital asset for **Pelagos**, root `PLANET_PELAGOS`. Make ocean coverage dominant, with a bright equatorial archipelago, turquoise shelf seas, two black trench arcs and one large typhoon eye offset from the primary settlements. Use a transparent water/foam shell, cloud bands, marine atmosphere, night fishing/colony lights and optional tiny tether buoys, never baked UI labels. Supply 2K neutral seafloor/land, bathymetry, water roughness, foam/current, cloud-density, reef, city-light and hazard masks. At phone war-table size it must read as the broken blue archipelago planet, not Earth recolored.

## Eight location prompts

### `city_colony` — Nacre Reach

Site ID: pelagos_nacre_reach. Location class: city_colony.

> Build `SITE_PELAGOS_NACRE_REACH`, a 448 × 384 m amphibious colony across three linked reef platforms. Hero silhouette: a crescent nacre civic shell above a sheltered lagoon. Use two 18 m amphibious vehicle loops, 24 × 12 m bridge locks, a 48 m tidal plaza and 4 m enclosed personnel tubes. Objective: stabilize platform ballast during a surge. Create dry, awash, bridge-broken and Brood B2 reef-root invasion states; organic growth follows wet ballast channels without becoming generic creep.

### `outpost` — Tidepost Kappa

Site ID: pelagos_tidepost_kappa. Location class: outpost.

> Build `SITE_PELAGOS_TIDEPOST_KAPPA`, a 240 × 224 m wave-monitoring rig on four articulated legs. Hero: a vertical tide gauge with a split radar crown. Include an 18 m deck loop, 32 m landing pad, 3 m underdeck maintenance route and retractable wave shields. Objective: recover a trench sensor before the lowest deck floods. Use marine titanium, anti-slip composite and salt decals; breakable legs tilt the deck but preserve one extraction path.

### `military_base` — Breakwater Citadel

Site ID: pelagos_breakwater_citadel. Location class: military_base.

> Build `SITE_PELAGOS_BREAKWATER_CITADEL`, a 512 × 416 m naval-defense base integrated into a curved artificial reef. Hero: three armored breakwater teeth flanking a recessed command basin. Provide two 30 m mixed-unit routes, 24 × 12 m flood gates, 48 m turn courts and 4 m dry infantry galleries. Objective: disable sonar denial pylons. Damage moves from armor spall to flooded compartments and breached causeways; route states remain deterministic.

### `refinery` — Abyssal Brine Works

Site ID: pelagos_abyssal_brine. Location class: refinery.

> Build `SITE_PELAGOS_ABYSSAL_BRINE`, a 480 × 400 m brine/mineral refinery suspended over a trench lip. Hero: paired pressure towers connected by a transparent mineral-flow bridge. Add 28 m tanker loops, two 48 m courts, 24 × 12 m lift portals and protected 4 m catwalks. Objective: equalize three risers before a pressure rupture. Materials are wet basalt, marine titanium, nacre ceramic and salt crust; damage creates brine jets and mineral fans, not fire-only destruction.

### `relic_ruin` — Drowned Choir

Site ID: pelagos_drowned_choir. Location class: relic_ruin.

> Build `SITE_PELAGOS_DROWNED_CHOIR`, a 336 × 288 m tidal ruin visible at low water. Hero: an arc of resonant stone chambers pierced by tide. Give it a 16 m amphibious outer route, 4 m interior ledges and a 42 m flooded central basin. Objective: activate chambers in the order revealed by currents. Use reef-encrusted basalt and translucent shell-like mineral, with intact/submerged/storm-broken states and no copied alien temple motifs.

### `spaceport` — Equatorial Wakeport

Site ID: pelagos_equatorial_wakeport. Location class: spaceport.

> Build `SITE_PELAGOS_EQUATORIAL_WAKEPORT`, a 544 × 432 m floating spaceport with three elongated launch decks aligned to prevailing wind. Hero: a high central flight spine above visible flotation cells. Include 30 m cargo roads, 56 × 48 m LZ, 24 × 12 m hangars, 4 m passenger tubes and vessel slips. Objective: re-level deck segments and launch before typhoon closure. Damage visibly floods individual cells while other sections maintain buoyancy.

### `pressure_dome` — Reefglass Habitat

Site ID: pelagos_reefglass. Location class: pressure_dome.

> Build `SITE_PELAGOS_REEFGLASS`, a 400 × 336 m partially submerged dome enclosing a living reef and habitation terraces. Hero: a low clear dome split by an elevated dry transit spine. Provide two 18 m wet locks, one 24 × 12 m freight gate, a 42 m inner lagoon court and 3 m dry walkways. Objective: isolate a cracked pressure wedge and rescue the lower ring. Use pressure glass, nacre ribs and warm habitat materials; water level is an authored gameplay state.

### `derelict_megastructure` — Leviathan Mooring

Site ID: pelagos_leviathan_mooring. Location class: derelict_megastructure.

> Build `SITE_PELAGOS_LEVIATHAN_MOORING`, a 672 × 512 m abandoned oceanic shipyard whose vast docking arms emerge from a trench. Hero silhouette: two asymmetric mooring claws around a collapsed central cradle. Provide 30 m service causeways, 48 m equipment courts, 24 × 12 m pressure doors and 4 m underarm routes. Objective: traverse the arms and recover the submerged control core. Broken cables, buoyant wreckage and wave-driven hazards replace generic rubble; Brood stages use filter-feeding polyps and tendon anchors adapted to salt water.

## Spline production contract

- Build at 1 m, Y-up/-Z-forward, 4 m modules, applied transforms and triangulated export. Certified routes: 18–30 m mixed lanes, 24 × 12 m portals, 42–48 m courts; clearly tag dry, wet, amphibious and submerged navigation.
- Author seamless 2048² `pelagos_reef_basalt`, `pelagos_marine_titanium`, `pelagos_nacre_composite`, `pelagos_salt_concrete`, `pelagos_pressure_glass_growth`: BaseColor, tangent Normal, ORM, optional Height/Emissive. Keep lighting neutral.
- Provide a 2K decal atlas for tide depth, ballast, deck load, flotation cells, dive/rescue lanes, colony districts, storm closure and objectives; 16 px gutters and 8 px dilation.
- UV0/tangents required with stable texel density. Pivot bridges at hinges, flotation segments at buoyancy centers, doors at seals, cranes at axes and breakables at fracture centers. Use independent simple `COL_`, `NAV_`, `LOS_`, water-volume and hazard proxies.
- Prefix `PLANET_`/`SITE_`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `COL_`, `NAV_`, `LOS_`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `HAZARD_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, preserving reef/platform/typhoon identity.
- Export editable Spline source, GLB candidate and `intake.json` with scale, axes, IDs, PBR bindings, counts, alpha/water declarations, provenance and runtimeReady false.
- Capture matched phone portrait/landscape at dry and storm states. Reject unreadable water boundaries, route ambiguity, shimmer, flattened hero silhouettes, missing collision or unmeasured transparent overdraw.
- Reference games provide only broad hierarchy, scale, cover and biome lessons. Never copy C&C3, Supreme Commander 2, XCOM 2 or StarCraft II assets, maps, silhouettes, textures, decals, organisms, logos, palette recipes or names. No generic recolors.
