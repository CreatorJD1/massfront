# Prismara — Spline 3D prompt guide

**Expansion slot:** 20  
**Sector:** Veyra Frontier  
**Status:** source-only proposal; `runtimeReady:false`  
**Identity:** A cold tectonic world of birefringent mineral shelves, dark basalt underplates, clear glacial lakes and polarized auroras. Color comes from angle-dependent mineral seams and controlled optical machinery—not rainbow paint, excessive transparency or generic crystal spikes. Settlements use charcoal composite, milk-glass ceramic and precise spectral wayfinding.

## Orbital / war-table — `PLANET_PRISMARA`

```text
Create original orbital planet Prismara, root `PLANET_PRISMARA`: charcoal tectonic plates edged by pale birefringent shelves, clear blue glacial lakes, sparse faceted mineral ridges, polarized violet/green auroras and one ring of thin shard-like moon debris. Keep color physically restrained and landforms readable; no rainbow sphere or all-over crystal spikes. Separate terrain sphere, water/ice layer, thin cloud shell, atmosphere/aurora limb, instanced debris ring and sparse settlement emission. Author neutral 2048×2048 base color, tangent normal, linear ORM, height/emission and plate/mineral/ice/aurora/city masks; no baked star lighting/UI. Center pivot, UV0/tangents, marker anchors, ≤3 transparent shells, LOD1≤40%/LOD2≤12% preserving plate edges, lakes and shard ring. Export Spline/source/runtime GLB/manifests/provenance; pass 412×915 silhouette, alpha, fallback and WebGL gates. Original art; copy no crystal planet/palette.
```

## City / colony — `prismara_spectrum_city_colony`

```text
Location class: `city_colony`.
Create `Spectrum Terrace`, root `GSITE_PRISMARA_SPECTRUM_CITY_COLONY`, a city built along one stepped mineral shelf. Hero: a 68 m milk-glass civic prism with opaque structural ribs, splitting restrained wayfinding light onto charcoal terraces. Provide two 28–30 m roads, 24×12 m mech gates, 48 m court and 3 m covered arcade. Objective: shut down a runaway optical grid. Damage: calibrated → lens drift → rib fracture → civic prism dark, with lower bypass. Use seamless 2K `prismara_charcoal_civic_composite`, `prismara_milkglass_ceramic`, `prismara_birefringent_mineral_trim` PBR plus 14 original district/spectrum/route decals; neutral channels, stable alpha, restrained emission, no baked caustics, 3×3 proof. Meters/Y-up/-Z, 4/16 m, ramps≤8.3%, UV0/tangents, hinge pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read hero/routes/state. No copied crystal city.
```

## Outpost — `prismara_caustic_watch_outpost`

```text
Location class: `outpost`.
Create `Caustic Watch`, root `GSITE_PRISMARA_CAUSTIC_WATCH_OUTPOST`, a compact optical survey station beside a clear glacial lake. Hero: a 47 m split-ring polarimeter on an opaque charcoal base. Add 18 m loop, 32×36 m calibration bay, 14×7 m light-mech gate and 3 m lake-edge walk. Objective: realign the polarimeter. Damage: aligned → actuator frost → ring split → shelter-only mode. Use seamless 2K `prismara_optical_outpost_composite`, `prismara_frosted_instrument_ceramic` PBR plus 8 original calibration/ice/safe-route decals; neutral channels, stable transparent inserts, no baked caustics, 3×3 proof. Meters/Y-up/-Z, 4/16 m, 24×12 m exterior clearance, UV0/tangents, axis pivots, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass phone silhouette. Original only.
```

## Military base — `prismara_refraction_bastion_military_base`

```text
Location class: `military_base`.
Create `Refraction Bastion`, root `GSITE_PRISMARA_REFRACTION_BASTION_MILITARY_BASE`, a dark low-profile base using angled opaque armor and limited optical decoys. Hero: three 55 m slanted sensor fins over an offset command wedge. Provide two 30 m approaches, 24×12 m gates, 48 m court, 32×36 m bay and 3 m under-shelf flank. Objective: disable the decoy grid and seize command. Damage: masked → emitter fault → fin fall → command exposed, with alternate road. Use seamless 2K `prismara_bastion_charcoal_armor`, `prismara_optical_sensor_ceramic`, `prismara_frost_deposit` PBR and 16 original garrison/decoy/breach decals; neutral channels, controlled emission, no invisible gameplay geometry, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, pivots, collision/nav/LOS/shot/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read fins/routes/state. Copy no faction base.
```

## Refinery — `prismara_fluxglass_refinery`

```text
Location class: `refinery`.
Create `Fluxglass Works`, root `GSITE_PRISMARA_FLUXGLASS_REFINERY`, a mineral refinery cutting controlled optical ceramics from a shelf face. Hero: a 74 m opaque cutting gantry framing a narrow translucent process ribbon. Include 30 m haul road, 18 m service loop, 24×12 m high bay, 48 m turnaround and 3 m operator catwalk. Objective: stop a thermal fracture through the cutter. Damage: cutting → coolant frost → gantry misalign → line isolation. Use seamless 2K `prismara_fluxglass_process_ceramic`, `prismara_cutting_gantry_metal`, `prismara_mineral_slurry_deposit` PBR and 14 original flow/optical/hazard decals; neutral channels, stable alpha, no baked sparkle, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read gantry/routes/state.
```

## Relic / ruin — `prismara_split_light_relic_ruin`

```text
Location class: `relic_ruin`.
Create `Split-Light Archive`, root `GSITE_PRISMARA_SPLIT_LIGHT_RELIC_RUIN`, an ancient mineral observatory composed of opaque stone frames and small precisely placed optical inserts. Hero: six 52 m black frames surrounding a 46 m clear-shadow court; one broken insert exposes the archive. Add 18 m approach, 24×12 m exterior mech portal, two 3 m survey flanks and 32×36 m refuge. Objective: rotate the surviving frames. Damage: buried → exposed → insert fracture → archive aperture open. Use seamless 2K `prismara_ancient_darkstone`, `prismara_weathered_optical_insert` PBR and 12 original nonmodern alignment/survey marks; neutral channels, restrained emission, no baked rainbows, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; mobile gate shows frames/objective. Copy no relic/crystal glyph.
```

## Spaceport — `prismara_aperture_spaceport`

```text
Location class: `spaceport`.
Create `Terminus Aperture Spaceport`, root `GSITE_PRISMARA_APERTURE_SPACEPORT`, a cold launch field sheltered inside a natural tectonic notch. Hero: a 92 m segmented aperture arch over three opaque landing cradles. Provide two 30 m approaches, 24×12 m deployer gates, 48 m court, 32×36 m pads and 3 m crew tube. Objective: thaw the aperture drive and reopen LZ one. Damage: open → actuator frost → arch jam → side cradle active. Use seamless 2K `prismara_cold_apron_composite`, `prismara_aperture_mechanism`, `prismara_pressure_glass` PBR and 16 original pad/frost/LZ decals; neutral channels, stable alpha, no baked caustics, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge pivots, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone silhouette gate. No copied ship/port.
```

## Pressure dome — `prismara_clearfacet_pressure_dome`

```text
Location class: `pressure_dome`.
Create `Clearfacet Habitat`, root `GSITE_PRISMARA_CLEARFACET_PRESSURE_DOME`, low polygonal pressure shells with mostly opaque panels and narrow clear facets to avoid transparency noise. Hero: a 60 m twelve-sided shell with external charcoal compression hoop. Include 18×8 m connector, 24×12 m emergency lock, 48 m exterior court and two 3 m loops. Objective: replace a frost-cracked facet. Damage: sealed → frost stress → facet rupture → one dome isolated. Use seamless 2K `prismara_clearfacet_shell`, `prismara_compression_hoop`, `prismara_habitat_floor` PBR and 12 original pressure/facet/evac decals; neutral channels, stable alpha, no baked reflection, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, hinge/floor pivots, separate glass/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone read shell/state.
```

## Derelict megastructure — `prismara_shard_ring_derelict_megastructure`

```text
Location class: `derelict_megastructure`.
Create `Grounded Shard Ring`, root `GSITE_PRISMARA_SHARD_RING_DERELICT_MEGASTRUCTURE`, a fallen orbital fabrication ring whose opaque truss sections lie across a glacial basin with limited transparent process plates. Hero: a 210 m broken arc and three radial fabrication arms. Provide two 30 m routes through separate gaps, 24×12 m portals, 48 m courts and 3 m elevated salvage flank. Objective: recover the fabrication kernel. Damage: dormant → arm drop → arc roll → kernel exposure, deterministic route swaps. Use seamless 2K `prismara_ring_superstructure`, `prismara_fabrication_plate`, `prismara_glacial_weathering` PBR plus 18 original sector/collapse/extraction decals; neutral channels, stable alpha, no baked sparkle, 3×3 proof. Meters/Y-up/-Z, 4/16 m, UV0/tangents, axis pivots, collision/nav/LOS/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; phone silhouette. Copy no orbital ring.
```
