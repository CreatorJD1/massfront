# Spline 3D prompt guide — Causton

**Ordinal:** 23 / 32  
**Planet ID:** `causton`  
**Sector:** `perseus_expanse`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** acid karst, sulfur flats, alkaline reed basins and vitreous rain gullies  
**Atmosphere:** opaque amber-green haze with slow corrosive rain bands  
**Hazards:** acid rain, chlorine pockets, sinkholes, brittle glass crust and seal failure  
**Orbital silhouette:** yellow-green cloud mantle cut by white alkali scars and black circular acid lakes  
**Material grammar:** pale alkali ceramic, nickel alloy, sulfur concrete, borosilicate glass and limewash sealant

## Orbital / war-table prompt — The Etched World

> Create an original orbital asset for **Causton**, root `PLANET_CAUSTON`. Show an amber-green atmospheric mantle whose moving clearings reveal chalk-white alkali basins, black acid lakes and radial etched drainage. Add a pale chartreuse limb, sparse night lights under sealed domes and one thin debris moonlet trail. Separate terrain, acid-water, high/low clouds, atmosphere, haze, night emission and `ANCHOR_REGION_*`. Author 2K neutral surface, mineral, acid-water, cloud-density, corrosive-front, city-light and hazard masks. Preserve the black-lake/white-scar silhouette on a phone; avoid a generic green toxic planet.

## Eight location prompts

### `city_colony` — Neutrality Stack

Site ID: causton_neutrality_stack. Location class: city_colony.

> Build `SITE_CAUSTON_NEUTRALITY_STACK`, a 416 × 352 m sealed vertical colony whose hero is a stepped tower wrapped in replaceable sacrificial shells. Two 18 m covered vehicle rings feed a 48 m neutralization court; a 24 × 12 m freight lock and 4 m elevated pedestrian galleries separate clean and contaminated circulation. Objective: restore reagent flow to three inhabited tiers. Use alkali ceramic, nickel ribs, milky glass and limewash; damage moves from stained seal to etched panel, pinhole leak and isolated tier.

### `outpost` — Limewatch Gauge

Site ID: causton_limewatch. Location class: outpost.

> Build `SITE_CAUSTON_LIMEWATCH`, a 240 × 208 m rain-sampling outpost on telescoping white legs above a sink basin. Hero: a broad funnel roof feeding an armored analysis drum. Include an 18 m service crescent, 32 m pad and 3 m sealed personnel tube. Objective: collect three samples while wind changes the safe side of the structure. Model replaceable corroded skins and lime slurry berms, not generic sci-fi crates.

### `military_base` — Sealant Redoubt

Site ID: causton_sealant_redoubt. Location class: military_base.

> Build `SITE_CAUSTON_SEALANT_REDOUBT`, a 480 × 384 m quarantine base organized as concentric pressure cells. Hero silhouette: three wedge bunkers behind a massive reagent curtain. Provide two 28 m mixed-unit approaches, 24 × 12 m decon gates, 48 m court and 4 m inspection corridors. Objective: capture the sealant plant before cascading breach. Damage opens cells sequentially; Brood B1/B3 adapts with mineralized acid-resistant hides around drains, never a universal slime coat.

### `refinery` — Vitriol Fractionary

Site ID: causton_vitriol_fractionary. Location class: refinery.

> Build `SITE_CAUSTON_VITRIOL_FRACTIONARY`, a 512 × 416 m chemical refinery of descending reaction basins. Hero: a tri-lobed distillation crown over black acid pools. Create 30 m tanker loops, two 48 m courts, pipe bridges, protected 4 m operator routes and 24 × 12 m maintenance portals. Objective: isolate incompatible streams. Destruction graphs from gasket leak to pipe jet, basin boil-over and vitrified spill while preserving one evacuation lane.

### `relic_ruin` — Glass Saint Cistern

Site ID: causton_glass_cistern. Location class: relic_ruin.

> Build `SITE_CAUSTON_GLASS_CISTERN`, a 320 × 272 m ancient rain-harvesting ruin formed from translucent mineral ribs and etched reservoirs. Hero: a hollow inverted dome visible beneath the crust. Provide a 16 m perimeter path, 4 m cistern ledges and 42 m ritual/engineering basin. Objective: decode flow gates using water level. Damage appears as chemical etching and mineral accretion; no copied religious iconography.

### `spaceport` — Dry Dock Epsilon

Site ID: causton_dry_dock_epsilon. Location class: spaceport.

> Build `SITE_CAUSTON_DRY_DOCK_EPSILON`, a 512 × 400 m elevated launch field held above the corrosive fog by clustered pylons. Hero: a long sealed spine connecting three dry launch islands. Include 30 m cargo lanes, 56 × 48 m LZ, 24 × 12 m hangars and redundant personnel tubes. Objective: purge acid vapor from launch clamps. Author intact, fog-inundated, pylon-damaged and evacuation states with original seal-integrity markings.

### `pressure_dome` — Alkali Crown

Site ID: causton_alkali_crown. Location class: pressure_dome.

> Build `SITE_CAUSTON_ALKALI_CROWN`, a 384 × 320 m settlement under a faceted double dome with a white neutralizing moat. Two 18 m locks and one 24 × 12 m freight airlock enter a 42 m central court; elevated 3 m walkways survive surface floods. Objective: balance pressure and reagent reserve. Use outer sacrificial panes, clear inner glazing and visible lime filters; damage affects wedges independently.

### `derelict_megastructure` — Caustic Crown Processor

Site ID: causton_caustic_crown. Location class: derelict_megastructure.

> Build `SITE_CAUSTON_CAUSTIC_CROWN`, a 640 × 512 m abandoned planetary scrubber shaped as a broken crown around an acid lake. Two 28 m process roads, 48 m pump courts, 24 × 12 m crown gates and 4 m maintenance galleries support combined arms. Objective: reach the central sorbent heart and vent a trapped chlorine front. Use collapsed nickel ribs, mineral stalactites and corroded glass; Brood tissue evolves waxy seal layers near acid rather than ignoring local chemistry.

## Spline production contract

- Work at 1 m, Y-up/-Z-forward, 4 m modules, applied transforms and triangulated geometry. Mixed lanes are 18–30 m; portals 24 × 12 m; courts 42–48 m. Model pressure boundaries and clean/dirty circulation explicitly.
- Author seamless 2048² `causton_alkali_ceramic`, `causton_nickel_alloy`, `causton_sulfur_concrete`, `causton_borosilicate`, `causton_acid_mineral_residue`: neutral BaseColor, tangent Normal, ORM, optional Height/Emissive. No baked highlights.
- Add a 2K atlas for corrosion grades, seal status, pH bands, decon lanes, respirator zones, evacuation, civic IDs, objectives and original hazard pictograms; 16 px gutters/8 px dilation.
- Require UV0/tangents and constant texel density. Pivot panels at replacement edges, doors at hinges, valves at stems and breakables at authored fracture origins. Use separate `COL_`, `NAV_`, `LOS_`, `HAZARD_` proxies.
- Prefix roots/nodes with `PLANET_`/`SITE_`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%; retain black-lake, tower-shell and crown silhouettes.
- Export Spline source, GLB candidate and `intake.json` with scale, axes, IDs, texture bindings, counts, alpha declarations, provenance and runtimeReady false. Provide collision/nav/LOS/damage collections separately.
- Capture phone portrait/landscape before approval; prove safe routes, pressure states, readable objectives, no shimmer, no stretched seals and bounded transparent shells.
- Use C&C3, Supreme Commander 2, XCOM 2 and StarCraft II only for broad hierarchy, combined-arms readability, tactical legibility and biome contrast. Copy nothing; no traced silhouettes, maps, props, textures, factions, organisms, logos or palettes, and no recolor-only variants.
