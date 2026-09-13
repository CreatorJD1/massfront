# Spline 3D prompt guide — Asterion

**Ordinal:** 32 / 32  
**Planet ID:** `asterion`  
**Sector:** `outer_reach`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** crystalline alpine ranges, violet tundra, mirror lakes and ringfall impact valleys  
**Atmosphere:** cold teal air with prismatic ice clouds  
**Hazards:** crystal shard storms, radar mirage, avalanche, ringfall debris and refracted energy  
**Orbital silhouette:** teal-violet continents, a bright diagonal ring, star-shaped polar fracture and prismatic cloud flashes  
**Material grammar:** pale alpine stone, iridescent crystal, brushed silver alloy, dark thermal ceramic and translucent ice glass

## Orbital / war-table prompt — The Compass World

> Create an original orbital asset for **Asterion**, root `PLANET_ASTERION`, in the Outer Reach. Show teal-violet alpine continents, mirror lakes, a star-shaped polar fracture and a bright but thin diagonal ring casting a moving shadow. Prismatic ice clouds and sparse silver-blue night routes reinforce navigation-world identity. Separate terrain, lake/ice, cloud, atmosphere, ring/debris, shadow mask, night emission and region anchors. Author 2K neutral geology, crystal, ice/water, ringfall, cloud-density, polar-fracture, lights and hazard masks. Preserve ring and polar-star silhouette on phone without excessive transparency or rainbow noise.

## Eight location prompts

### `city_colony` — Cartographer’s Crown

Site ID: asterion_cartographers_crown. Location class: city_colony.

> Build `SITE_ASTERION_CARTOGRAPHERS_CROWN`, a 448 × 384 m alpine city arranged as radial navigation districts around a low observatory. Hero: a silver compass crown stepping across three ridges. Use two 28 m mixed-unit loops, 24 × 12 m snow gates, 48 m civic court and 4 m glazed pedestrian galleries. Objective: restore the planetary route lattice during a shard storm. Damage creates avalanche blocks and fractured crystal screens while alternate routes remain authored.

### `outpost` — Pole Star Relay

Site ID: asterion_pole_star. Location class: outpost.

> Build `SITE_ASTERION_POLE_STAR`, a 240 × 208 m navigation outpost perched beside a polar fracture. Hero: a tripod relay holding a faceted calibration prism. Include an 18 m loop, 32 m pad and 3 m heated trench. Objective: align the prism through radar mirage. Damage clouds crystal, shears tripod feet and accumulates directional ice.

### `military_base` — Prism Bastion

Site ID: asterion_prism_bastion. Location class: military_base.

> Build `SITE_ASTERION_PRISM_BASTION`, a 496 × 400 m defense base using angled nontransparent armor to redirect ringfall fragments. Hero: three offset silver wedges around a dark command core. Provide two 28 m roads, 24 × 12 m blast gates, 48 m court and 4 m heated galleries. Objective: rotate debris shields. Damage embeds crystal fragments and jams shield pivots; Brood B2 develops opaque layered carapace in crystal fields rather than becoming colorful glass.

### `refinery` — Facet Quarry

Site ID: asterion_facet_quarry. Location class: refinery.

> Build `SITE_ASTERION_FACET_QUARRY`, a 512 × 416 m controlled crystal quarry around a stepped mirror lake. Hero: a suspended diamond-wire cutting frame over a luminous seam. Add 30 m hauler loops, 48 m courts, 24 × 12 m processing portals and 4 m shielded catwalks. Objective: stop resonance before the seam fractures. Damage produces large authored slabs, wire failure and lake cracking—no tiny cube spray.

### `relic_ruin` — Labyrinth of Bearings

Site ID: asterion_labyrinth_bearings. Location class: relic_ruin.

> Build `SITE_ASTERION_LABYRINTH_BEARINGS`, a 352 × 304 m ancient navigational ruin of offset stone arcs and rotating mineral bearings. Hero: a nonliteral labyrinth visible as concentric broken paths from RTS view. Include a 16 m outer loop, 42 m alignment court and 4 m interior routes. Objective: orient bearings to reveal a buried coordinate. Use original geometry and symbols, not a copied maze or alien temple.

### `spaceport` — Ringfall Terminal

Site ID: asterion_ringfall_terminal. Location class: spaceport.

> Build `SITE_ASTERION_RINGFALL_TERMINAL`, a 544 × 432 m port under movable debris canopies. Hero: a long silver terminal crossed by three angled canopy shields. Provide 30 m cargo routes, 56 × 48 m LZ, 24 × 12 m hangars and 4 m passenger tubes. Objective: track a ringfall window and clear one pad. Damage punctures individual canopy bays and deposits measurable fragment fields.

### `pressure_dome` — Constellation Conservatory

Site ID: asterion_constellation. Location class: pressure_dome.

> Build `SITE_ASTERION_CONSTELLATION`, a 400 × 336 m alpine conservatory dome whose glazing maps star routes only through structural seams, never baked UI. Hero: a low faceted dome around tall violet flora. Two 18 m locks, one 24 × 12 m freight portal, 42 m garden court and 3 m heated loops define circulation. Objective: isolate a shattered cold bay. Damage clouds or cracks individual facets; interior remains warm and readable.

### `derelict_megastructure` — Asterion Compass Array

Site ID: asterion_compass_array. Location class: derelict_megastructure.

> Build `SITE_ASTERION_COMPASS_ARRAY`, a 704 × 544 m abandoned planetary navigation machine of four vast directional arms and a broken central gimbal. Hero: asymmetric arms aligned to ring shadow and polar fracture. Add 30 m service avenues, 48 m gimbal courts, 24 × 12 m arm portals and 4 m machinery galleries. Objective: recover lost route coordinates while rotating one surviving arm. Damage uses seized bearings, avalanche burial and fallen crystal counterweights; local Brood follows geothermal machinery rather than mimicking crystal.

## Spline production contract

- Author 1 m/Y-up/-Z-forward, 4 m modular grid, applied transforms and triangles. Mixed lanes 18–30 m, portals 24 × 12 m, courts 42–48 m; snow, ice, avalanche and fragment areas require separate traversal/hazard proxies.
- Create seamless 2048² `asterion_alpine_stone`, `asterion_iridescent_crystal`, `asterion_brushed_silver`, `asterion_thermal_ceramic`, `asterion_iceglass_snow`: neutral BaseColor, tangent Normal, ORM, optional Height/controlled Emissive. Avoid rainbow noise and baked illumination.
- Provide a 2K decal atlas for compass sectors, ringfall timing, avalanche zones, quarry cuts, route calibration, districts, evacuation, extraction and objectives; 16 px gutters/8 px dilation.
- UV0/tangents and stable density required. Pivot bearings/gimbals/canopies at true axes, gates at hinges and crystal breakables at authored fractures. Separate watertight collision `COL_`, `NAV_`, `LOS_`, avalanche and shard proxies.
- Name `PLANET_ASTERION`, `SITE_ASTERION_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, preserving ring/polar/compass silhouettes.
- Export editable Spline source, GLB and `intake.json` with IDs, axes, scale, PBR, alpha/emission declarations, counts, provenance and runtimeReady false. Capture matched phone orbit/ground and clean/storm states; reject shimmer, illegible objectives, transparent overdraw or false runtime evidence.
- C&C3, Supreme Commander 2, XCOM 2 and StarCraft II may inform only broad composition, combined-arms scale, tactical readability and biome contrast. Copy no assets, maps, buildings, materials, decals, crystals, organisms, symbols, units, UI, palettes or names. No generic recolors.
