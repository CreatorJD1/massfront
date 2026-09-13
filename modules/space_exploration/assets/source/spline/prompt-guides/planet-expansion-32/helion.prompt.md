# Spline 3D prompt guide — Helion

**Ordinal:** 30 / 32  
**Planet ID:** `helion`  
**Sector:** `outer_reach`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** irradiated golden steppe, black lava shields, molten-salt valleys and mirror fields  
**Atmosphere:** thin white-gold haze with frequent high-energy flare curtains  
**Hazards:** solar radiation, thermal bloom, mirror flash, molten salt and brittle refractory surfaces  
**Orbital silhouette:** gold landmasses, black lava arcs, a brilliant white dayward cap and broken mirror glints around the equator  
**Material grammar:** refractory white ceramic, carbon-black composite, gold thermal foil, dark lava aggregate and molten-salt steel

## Orbital / war-table prompt — The Sunward Engine

> Create an original orbital asset for **Helion**, root `PLANET_HELION`, in the Outer Reach. Show golden highlands and black lava shields under a thin white-gold atmosphere, with organized equatorial mirror fields and irregular molten-salt basins. Add a restrained flare-facing glow, dark-side amber heat-storage lights and a sparse ring of broken solar collectors. Separate terrain, salt/volatile, cloud/haze, atmosphere, mirrors/debris, night emission and region anchors. Author 2K neutral surface, lava, albedo/thermal, mirror-field, salt, flare, light and hazard masks. Phone readability comes from black arcs and organized mirrors, not blown-out bloom.

## Eight location prompts

### `city_colony` — Radiant Step

Site ID: helion_radiant_step. Location class: city_colony.

> Build `SITE_HELION_RADIANT_STEP`, a 448 × 384 m city descending the shaded side of a lava mesa. Hero: cascading white thermal roofs above a black civic spine. Two 28 m mixed-unit routes, 24 × 12 m heat locks, 48 m shadow court and 4 m cooled pedestrian galleries support combined arms. Objective: rotate district shades during a flare. Damage uses foil peel, ceramic crazing and heat-storage leaks, preserving readable safe/shade zones.

### `outpost` — Flarewatch

Site ID: helion_flarewatch. Location class: outpost.

> Build `SITE_HELION_FLAREWATCH`, a 240 × 208 m solar-weather outpost under one enormous articulating sunshade. Include an 18 m loop, 32 m pad and 3 m cooled trench. Objective: deploy three flare sensors before the shade motor fails. Pivot shade petals correctly; damage creates bent petals, scorched ceramic and localized sensor blackout.

### `military_base` — Umbra Shield Station

Site ID: helion_umbra_shield. Location class: military_base.

> Build `SITE_HELION_UMBRA_SHIELD`, a 496 × 400 m defense base protected by layered thermal baffles rather than an energy dome. Hero: a stepped black-and-white shade wall. Provide two 28 m roads, 24 × 12 m blast/heat gates, 48 m armored court and 4 m cooled galleries. Objective: hold the shade generators through a flare window. Destruction exposes hot lanes; Brood B2 grows reflective mineral scales on day faces and shelters organs behind machinery.

### `refinery` — Heliostat Foundry

Site ID: helion_heliostat_foundry. Location class: refinery.

> Build `SITE_HELION_HELIOSTAT_FOUNDRY`, a 544 × 416 m solar refinery with a radial mirror orchard feeding a molten-salt tower. Hero: the tall receiver and asymmetric mirror field. Add 30 m hauler loops, 48 m courts, 24 × 12 m foundry portals and 4 m shaded catwalks. Objective: defocus mirrors and drain the receiver. Damage chains through mirror shatter, salt jet and receiver slump; keep flare emission restrained.

### `relic_ruin` — Burnt Coronagraph

Site ID: helion_burnt_coronagraph. Location class: relic_ruin.

> Build `SITE_HELION_BURNT_CORONAGRAPH`, a 336 × 288 m ancient solar observatory fused into lava. Hero: a thick occlusion disc suspended between scorched pylons. Provide a 16 m perimeter loop, 42 m instrument court and 4 m shadow trenches. Objective: align the disc to reveal a star map. Use refractory stone/metal and glassy impact scars; no copied observatory or alien temple design.

### `spaceport` — Sunward Lance Port

Site ID: helion_sunward_lance. Location class: spaceport.

> Build `SITE_HELION_SUNWARD_LANCE`, a 544 × 432 m launch field under retractable longitudinal shades. Hero: a narrow white launch spine pointing toward the horizon. Provide 30 m cargo routes, 56 × 48 m LZ, 24 × 12 m hangars and 4 m cooled passenger tubes. Objective: open shades only during a safe flare interval. Damage jams independent shade bays while one extraction lane remains functional.

### `pressure_dome` — Penumbra Habitat

Site ID: helion_penumbra_habitat. Location class: pressure_dome.

> Build `SITE_HELION_PENUMBRA_HABITAT`, a 400 × 336 m opaque day-side dome with a narrow transparent twilight garden. Hero: concentric white shade petals over a warm green interior slit. Two 18 m locks, one 24 × 12 m freight portal, 42 m garden court and 3 m cooled loops define circulation. Objective: restore heat pumps after salt ingress. Damage delaminates petals sector by sector.

### `derelict_megastructure` — Broken Dyson Petal

Site ID: helion_dyson_petal. Location class: derelict_megastructure.

> Build `SITE_HELION_DYSON_PETAL`, a 704 × 544 m fallen segment of an incomplete stellar collector, partly embedded in lava fields. Hero: one kilometer-scale curved mirror rib represented as three towering, fractured spans. Add 30 m service avenues, 48 m actuator courts, 24 × 12 m rib interiors and 4 m maintenance galleries. Objective: recover collector telemetry while managing reflected heat beams. Destruction uses warped mirror ribs and molten foundations; local Brood nests inhabit cold rear cavities only.

## Spline production contract

- Author 1 m/Y-up/-Z-forward, 4 m modular grid, applied transforms and triangles. Mixed lanes 18–30 m, portals 24 × 12 m, courts 42–48 m. Declare shade, radiation, mirror-beam and heat volumes separately.
- Create seamless 2048² `helion_refractory_ceramic`, `helion_carbon_composite`, `helion_thermal_foil`, `helion_lava_aggregate`, `helion_molten_salt_steel`: neutral BaseColor, tangent Normal, ORM, optional Height/controlled Emissive.
- Provide a 2K atlas for solar exposure, flare timing, mirror IDs, thermal lanes, coolant, districts, evacuation, extraction and objectives; 16 px gutters/8 px dilation.
- UV0/tangents and stable density required. Pivot mirrors/shades at axes, doors at hinges, receiver parts at joints and breakables at fracture centers. Separate simple watertight collision `COL_`, `NAV_`, `LOS_`, beam and hazard proxies.
- Name `PLANET_HELION`, `SITE_HELION_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, preserving shade/mirror silhouettes without bloom dependence.
- Export Spline source, GLB and `intake.json` with IDs, axes, scale, PBR, emission, counts, state collections, provenance and runtimeReady false. Phone captures must prove non-clipped highlights, readable shade routes and bounded transparent/reflective cost.
- C&C3, Supreme Commander 2, XCOM 2 and StarCraft II are broad visual references only. Do not copy or trace any assets, solar structures, maps, silhouettes, materials, decals, units, organisms, UI, logos, palettes or names. No recolor-only worlds.
