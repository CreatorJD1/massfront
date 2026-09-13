# Spline 3D prompt guide — Sablemarch

**Ordinal:** 26 / 32  
**Planet ID:** `sablemarch`  
**Sector:** `karak_lost_colonies`  
**Status:** `source_prompt_only` · **runtimeReady:** `false`  
**Biome:** tidally locked obsidian dunes, copper twilight scrub and glacial night basins  
**Atmosphere:** thin bronze dust on the day side and indigo ice haze on the night side  
**Hazards:** abrasive glass sand, terminator storms, thermal shock, mirage and night-side cryofog  
**Orbital silhouette:** one black hemisphere, one copper hemisphere and a razor-thin luminous settlement ribbon at the terminator  
**Material grammar:** black glass aggregate, bronze alloy, white thermal ceramic, woven dust membrane and blue cryosteel

## Orbital / war-table prompt — The Long Dusk

> Create an original orbital asset for **Sablemarch**, root `PLANET_SABLEMARCH`, in the Karak Lost Colonies. Make the tidally locked division structural: copper dune seas and scorched plateaus on the star face, nearly black glacial basins on the far face, and a narrow inhabited green-violet terminator band. Add bronze dust streams crossing the limb, sparse blue night emissions and two small shepherd moons. Separate terrain, ice, high dust, low cloud, atmosphere, city lights, moons and region anchors. Author 2K neutral day/night terrain, ice, dust-density, thermal, settlement and hazard masks. The half-black/half-copper silhouette must survive phone scale without an artificial hard shader seam.

## Eight location prompts

### `city_colony` — Gloam Meridian

Site ID: sablemarch_gloam_meridian. Location class: city_colony.

> Build `SITE_SABLEMARCH_GLOAM_MERIDIAN`, a 448 × 384 m linear city straddling the habitable dusk line. Hero: twin thermal walls framing a luminous civic corridor. Use two 28 m longitudinal mixed-unit routes, 24 × 12 m climate gates, 48 m transit court and 4 m sheltered pedestrian spines. Objective: rebalance heat exchangers as the safe thermal band moves. Materials visibly transition from white day ceramic through bronze city alloy to blue cryosteel, never by simple recolor.

### `outpost` — Duskline Relay

Site ID: sablemarch_duskline. Location class: outpost.

> Build `SITE_SABLEMARCH_DUSKLINE`, a 240 × 208 m survey relay on rails that slowly follows the terminator. Hero: a broad sunshade over a compact crawler base. Include an 18 m maintenance loop, 32 m service pad and 3 m thermal trench. Objective: repair drive bogies before the site enters lethal daylight. Destruction exposes layered insulation and jammed rails; windblown glass accumulates directionally.

### `military_base` — Long Shadow Redoubt

Site ID: sablemarch_long_shadow. Location class: military_base.

> Build `SITE_SABLEMARCH_LONG_SHADOW`, a 496 × 400 m fortress embedded in the permanent shadow of an obsidian escarpment. Hero: three low bronze bastions linked by a white thermal spine. Create two 28 m routes, 24 × 12 m blast/thermal gates, 48 m court and 4 m cliff galleries. Objective: hold the moving shadow generators. Damage alters heat-safe traversal; Brood B2 organisms burrow under warm machinery and use insulating cocoons rather than generic surface growth.

### `refinery` — Obsidian Windworks

Site ID: sablemarch_obsidian_windworks. Location class: refinery.

> Build `SITE_SABLEMARCH_OBSIDIAN_WINDWORKS`, a 480 × 384 m glass-sand refinery along a terminator jet stream. Hero: tall canted sieve sails feeding black-glass furnaces. Add 30 m hauler lanes, two 48 m courts, 24 × 12 m furnace gates and 4 m shielded catwalks. Objective: feather three sails to prevent a molten-glass cascade. Damage creates sheet-glass shards, clogged conveyors and glowing cullet channels.

### `relic_ruin` — Sunken Orrery

Site ID: sablemarch_sunken_orrery. Location class: relic_ruin.

> Build `SITE_SABLEMARCH_SUNKEN_ORRERY`, a 336 × 288 m ancient astronomical mechanism half buried in dunes. Hero: nested stone/metal rings whose shadows mark the terminator drift. Provide a 16 m outer loop, 42 m central mechanism court and 4 m maintenance trenches. Objective: align rings with the shepherd moons. Use worn black stone, patinated bronze and mineral inlay; no copied celestial-temple layout.

### `spaceport` — Terminator Gate

Site ID: sablemarch_terminator_gate. Location class: spaceport.

> Build `SITE_SABLEMARCH_TERMINATOR_GATE`, a 544 × 432 m launch port moving on parallel crawler beds. Hero: a long thermal canopy and paired launch rails. Add 30 m cargo routes, 56 × 48 m LZ, 24 × 12 m climate hangars and 4 m passenger corridors. Objective: synchronize crawler alignment and launch before thermal overrun. Damage can immobilize one rail while the other remains a valid extraction route.

### `pressure_dome` — Aurora Ward

Site ID: sablemarch_aurora_ward. Location class: pressure_dome.

> Build `SITE_SABLEMARCH_AURORA_WARD`, a 384 × 336 m terminator dome with asymmetric day and night skins. Hero: a split dome, opaque white toward the star and clear blue toward darkness. Two 18 m locks, a 24 × 12 m freight gate, 42 m inner garden and 3 m circumferential walkways define circulation. Objective: rotate heat shutters and restore agriculture. Damage stages are thermal delamination, sand abrasion and cryo cracking by sector.

### `derelict_megastructure` — Day-Night Transit Crown

Site ID: sablemarch_transit_crown. Location class: derelict_megastructure.

> Build `SITE_SABLEMARCH_TRANSIT_CROWN`, a 672 × 512 m abandoned ring-crawler once transporting cities along the terminator. Hero: one immense broken wheel segment rising over its buried track. Provide 30 m maintenance avenues, 48 m bogie courts, 24 × 12 m internal portals and 4 m axle galleries. Objective: recover navigation archives across both hot and frozen halves. Damage uses seized bearings, buckled thermal skins and dune burial; distinct local Brood forms occupy warm bearing cavities only.

## Spline production contract

- Author 1 m/Y-up/-Z-forward, 4 m modular grid, applied transforms, triangles only. Use 18–30 m mixed routes, 24 × 12 m portals and 42–48 m courts; tag hot, habitable and cryogenic traversal volumes.
- Create seamless 2048² `sablemarch_obsidian_aggregate`, `sablemarch_bronze_alloy`, `sablemarch_white_thermal_ceramic`, `sablemarch_dust_membrane`, `sablemarch_cryosteel_ice`: neutral BaseColor, tangent Normal, ORM, optional Height/Emissive.
- Create a 2K atlas for temperature bands, shadow timing, thermal doors, dust danger, crawler alignment, settlement sectors, extraction and objectives, with 16 px gutters/8 px dilation.
- UV0/tangents mandatory; keep texel density consistent across day/night materials. Pivot shutters at hinges, crawler wheels at axles, sails at feather axes and breakables at authored centers. Separate simple watertight collision `COL_`, `NAV_`, `LOS_` and `HAZARD_` proxies.
- Naming: `PLANET_SABLEMARCH`, `SITE_SABLEMARCH_*`, `GEO_`, `MAT_`, `DECAL_`, `LOD0/1/2`, `PORTAL_`, `COVER_`, `OBJECTIVE_`, `DESTROY_`, `LZ_`, `ANCHOR_`. LOD1 ≤40%, LOD2 ≤12%, retaining terminator geometry and hero shapes.
- Export Spline source + GLB + `intake.json`; record scale, axes, IDs, PBR, counts, thermal state collections, provenance and runtimeReady false. Provide phone captures at day/dusk/night-biased angles and reject invisible night geometry or clipped city bands.
- C&C3, Supreme Commander 2, XCOM 2 and StarCraft II are inspiration for broad readability only. Do not copy maps, assets, units, silhouettes, materials, decals, colors, organisms, logos or named landmarks. No palette-swap planets.
