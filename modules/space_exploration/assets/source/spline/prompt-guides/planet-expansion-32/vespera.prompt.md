# Vespera — Spline 3D prompt guide

**Expansion slot:** 13; existing runtime-canon homeworld  
**Sector:** Helios Quarantine  
**Status:** source-only authoring expansion; orbital identity and the eight preset IDs remain compatible with `src/engine/gl.js`; `runtimeReady:false` for new assets  
**Canon:** Vespera is the hostile Brood hiveworld: volcanic ashlands, Caldera Nests, Infestation Fields, Magma Hatcheries and an Overgrown Front under a low magenta-lilac dusk. Brood is non-playable, non-humanoid and visibly invasive. It never becomes a humanoid settlement skin or selectable production architecture.

## Orbital / war-table — `PLANET_VESPERA`

```text
Create an original game-ready orbital presentation for canon MASSFRONT planet Vespera, root `PLANET_VESPERA`, retaining its Helios Core/Helios Quarantine identity from `src/engine/gl.js`. Build a huge volcanic hiveworld with continent-scale caldera chains, violet-brown ashlands, dim magenta-lilac atmosphere, orange magma fractures, dark infestation fields, a green-black overgrown plateau front and drifting spore/ash belts. Show hostile non-humanoid Brood ecology as asymmetric vascular continent scars and calcified reef masses, never as cities, humanoids or playable buildings. Add one broken captured industrial ring fragment and sparse dead settlement lights for orbital silhouette.

Separate named terrain sphere, magma/ichor mask layer, ash-spore cloud shell, atmosphere limb and instanced orbital wreck group. Author neutral 2048×2048 base color, tangent normal, linear ORM, height and emission plus caldera, magma, infestation, plateau, dead-city and cloud masks. No baked star lighting, UI labels or universal purple overlay. Add anchors for `vespera_spire`, `vespera_dunes`, `vespera_refinery`, `vespera_plateau`. Use center pivot, UV0/tangents, applied transforms, no more than three transparent shells, `LOD0_`/`LOD1_`/`LOD2_`; LOD1≤40%, LOD2≤12% while retaining calderas, overgrown front and ring wreck. Export editable Spline and source/runtime GLB with manifests/provenance. Pass 412×915 war-table silhouette, texture fallback, alpha sorting and WebGL checks. Reference titles may guide biome readability only; copy no hive, planet, organism, texture, logo or screenshot.
```

## City / colony — `vespera_spire_caldera_colony_shell`

```text
Location class: `city_colony`.
Create canon-compatible preset `vespera_spire_caldera_colony_shell`, display name `Caldera Colony Shell`, root `GSITE_VESPERA_SPIRE_CALDERA_COLONY_SHELL`. Show evacuated civic blocks, a ruptured road deck and a dedicated Brood spire tearing through the colony; the hero is the sharp contrast between a 65 m abandoned civic tower and a 78 m asymmetrical chitin/vascular spire. Include two 28–30 m roads, 24×12 m mech opening, 48 m civic court and 3 m survivor flank. Objective: secure survivor archives and sever the spire root. Damage/Brood graph: `B0_evacuated_clean` → `B1_spore_contact` → `B2_route_encroachment` → `B3_spire_breach` → `B4_spire_purged`; every state keeps a declared route.

Use seamless 2K `vespera_abandoned_colony_composite_ash` and `vespera_living_chitin_tissue_contact` PBR with neutral albedo, tangent normal, linear ORM, height and restrained evacuation/neural emission; graded mineral-to-tissue masks and 14 original district/quarantine/purge decals. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, floor/contact pivots, applied transforms, collision/nav/LOS/cover/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline and source/runtime GLB plus state/manifests/provenance. Pass 412×915 readability without particles. Brood is hostile/non-playable/non-humanoid; copy nothing from reference games.
```

## Outpost — `vespera_dunes_tide_relay_outpost`

```text
Location class: `outpost`.
Create canon-compatible preset `vespera_dunes_tide_relay_outpost`, display name `Tide Relay Outpost`, root `GSITE_VESPERA_DUNES_TIDE_RELAY_OUTPOST`. Build a failed UGA/resident relay shelter, a 46 m damaged signal mast, spore-field berms and authored tissue encroachment. The canted mast and half-buried shelter are the unique hero silhouette. Include an 18 m service loop, 32×36 m bay, 14×7 m light-mech gate, exterior 24×12 m transit envelope and 3 m trench. Objective: restore the relay and recover the last transmission. States: `B0_abandoned_clean`, `B1_spore_perimeter`, `B2_tissue_contact`, `B3_relay_occluded`, `B4_purged_relay`, with a marked alternate when encroachment closes a lane.

Author seamless 2K `vespera_relay_composite_spore_contact` PBR, graded tissue contact and 8 original relay/quarantine/safe-route decals; neutral albedo, tangent normal, linear ORM, height and restrained signal/neural emission, no baked glow, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, pivots/transforms, separate collision/nav/LOS/portal/objective/hazard/destruction proxies and LOD1≤40%/LOD2≤12%. Export editable Spline and GLBs with manifests/provenance; verify 412×915 mast, loop, objective and state. No playable or humanoid Brood, generic recolor, protected relay or copied infestation.
```

## Military base — `vespera_plateau_quarantine_bastion`

```text
Location class: `military_base`.
Create canon-compatible preset `vespera_plateau_quarantine_bastion`, display name `Quarantine Bastion`, root `GSITE_VESPERA_PLATEAU_QUARANTINE_BASTION`. Build a failed coalition containment fort on the Overgrown Front with a wide decontamination gate, offset command shelter, burn corridors, hardpoints and visible non-humanoid Brood breaches. Hero silhouette: twin decon arches split by a collapsed watchtower and vascular breach wedge. Provide two 28–30 m approaches, 24×12 m heavy gate, 48 m court, 32×36 m bay and separate personnel decon route. Objective: recover command records and reopen the burn corridor. States: `B0_failed_clean`, `B1_perimeter_spores`, `B2_gate_breach`, `B3_command_encroachment`, `B4_burn_corridor_purge`.

Use seamless 2K `vespera_failed_coalition_armor_quarantine` and `vespera_living_tissue_burn_overgrowth` PBR plus 14 original containment/decon/breach decals; neutral albedo, tangent normal, linear ORM, height and disciplined decon/neural emission, graded contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, ramps≤8.3%, UV0/tangents, floor/hinge pivots, applied transforms, collision/nav/LOS/shot/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline and GLBs/manifests/provenance; phone portrait must show gates, routes, objective and B-state. Original architecture; Brood remains hostile/non-playable/non-humanoid.
```

## Refinery — `vespera_refinery_megaforge_refinery`

```text
Location class: `refinery`.
Create canon-compatible preset `vespera_refinery_megaforge_refinery`, display name `Megaforge Hatchery Refinery`, root `GSITE_VESPERA_REFINERY_MEGAFORGE_REFINERY`. Build an abandoned magma intake, refractory process line, heavy service loop, tissue-clogged process gates and Brood hatchery chambers occupying—not imitating—the machinery. Hero silhouette: a ribbed 72 m forge gantry crossed by three pulsing vascular conduits. Provide two combined-arms routes, 24×12 m high bay, 48 m court and elevated 3 m catwalk. Objective: isolate the hatchery feed and purge the separator. States: `B0_abandoned_forge`, `B1_spore_contact`, `B2_hatchery_takeover`, `B3_process_gate_occlusion`, `B4_hatchery_purged`, with deterministic bypass.

Use seamless 2K `vespera_vitrified_forge_refractory` and `vespera_hatchery_membrane_acid_slag` PBR plus 14 original flow/magma/quarantine/purge decals; neutral albedo, tangent normal, linear ORM, height and controlled magma/neural emission, graded tissue contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, legal route envelopes/ramps≤8.3%, UV0/tangents, axis/floor pivots, applied transforms, collision/nav/LOS/hazard/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export editable Spline and GLBs/manifests/provenance; verify phone readability without particles. No protected refinery/hive forms or playable Brood language.
```

## Relic / ruin — `vespera_dunes_ichor_relic`

```text
Location class: `relic_ruin`.
Create canon-compatible preset `vespera_dunes_ichor_relic`, display name `Ichor Relic`, root `GSITE_VESPERA_DUNES_ICHOR_RELIC`. Build a pre-infestation processional landmark of buried mineral fins, fossilized tissue ribs, excavation cuts, dried ichor channels and fresh living seams. Hero silhouette: a split 50 m mineral arch pierced by one calcified organic rib, making old ruin and later Brood accretion visibly separable. Include an 18 m vehicle approach, 24×12 m exterior mech opening, 42–48 m court and two 3 m archaeology flanks. Objective: sample the landmark core and seal the active ichor well. States: `B0_preinfestation_exposed`, `B1_fossil_crust`, `B2_fresh_seams`, `B3_ichor_active_breach`, `B4_sampled_purged`.

Use seamless 2K `vespera_ancient_mineral_ash_surface` and `vespera_calcified_crust_ichor_tissue` PBR plus 10 original archaeology/containment/hazard decals; neutral albedo, tangent normal, linear ORM, height and restrained fresh-tissue emission, 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, contact pivots, applied transforms, collision/nav/LOS/hazard/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline and GLBs/manifests/provenance. At phone portrait show arch, rib, channels, flank, objective and state. No copied relic, glyph, creature or hive.
```

## Spaceport — `vespera_plateau_evac_spaceport`

```text
Location class: `spaceport`.
Create canon-compatible preset `vespera_plateau_evac_spaceport`, display name `Evacuation Spaceport`, root `GSITE_VESPERA_PLATEAU_EVAC_SPACEPORT`. Build an overgrown evacuation apron with original abandoned lander shells, sealed survivor concourse, approach roads, membrane-blocked gates and last-flight evidence. Hero silhouette: a collapsed control tower leaning over two empty hexagonal cradles and one grounded rescue hull. Provide two 28–30 m approaches, 24×12 m deployer high bay, 48 m court, 32×36 m staging bays and separate survivor tube. Objective: reopen the extraction cradle. States: `B0_abandoned_evac`, `B1_spore_overgrowth`, `B2_gate_membrane`, `B3_concourse_encroachment`, `B4_extraction_reopened`, retaining an alternate LZ.

Use seamless 2K `vespera_aged_evac_apron_aerospace` and `vespera_spore_overgrowth_organic_gate` PBR plus 12 original pad/survivor/quarantine/extraction decals; neutral albedo, tangent normal, linear ORM, height and status/neural emission, graded contact and stable alpha. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, pivots/transforms, LZ/collision/nav/LOS/portal/objective/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline and GLBs/manifests/provenance; pass phone visibility without particles. Copy no protected spacecraft/spaceport; Brood non-playable/non-humanoid.
```

## Pressure dome — `vespera_spire_infested_pressure_dome`

```text
Location class: `pressure_dome`.
Create canon-compatible preset `vespera_spire_infested_pressure_dome`, display name `Infested Pressure Dome`, root `GSITE_VESPERA_SPIRE_INFESTED_PRESSURE_DOME`. Build abandoned faceted pressure domes with quarantine locks, collapsed connectors, intact survivor pockets and staged living membrane breaches. Hero silhouette: one intact pale dome, one split shell and a 40 m asymmetric membrane crest bridging them. Include personnel/vehicle connector graphs, 18×8 m vehicle locks, 24×12 m emergency high lock, a 48 m exterior court and legal bypass. Objective: rescue the safe cell and vent the infested connector. States: `B0_abandoned_pressurized`, `B1_spore_seep`, `B2_membrane_breach`, `B3_connector_occluded`, `B4_purged_vented`.

Use seamless 2K `vespera_heat_clouded_pressure_glass_seal` and `vespera_living_membrane_acid_contact` PBR plus 10 original pressure/quarantine/survivor decals; neutral albedo, tangent normal, linear ORM, height and restrained pressure/neural emission, graded transition, no baked reflections, stable alpha and 3×3 proof. Meters/Y-up/-Z, 4/16 m grids, UV0/tangents, floor/hinge pivots, applied transforms, separate glass, collision/nav/LOS/portal/objective/hazard/destruction proxies, LOD1≤40%/LOD2≤12%. Export Spline/GLBs/manifests/provenance; pass 412×915 shell/route/state readability. Brood is hostile invasion, never a building skin.
```

## Derelict megastructure — `vespera_refinery_silent_megaforge`

```text
Location class: `derelict_megastructure`.
Create canon-compatible preset `vespera_refinery_silent_megaforge`, display name `Silent Megaforge`, root `GSITE_VESPERA_REFINERY_SILENT_MEGAFORGE`. Build a collapsed forge spine, giant casting halls, broken logistics lattice, Brood arteries, deterministic bridge failures and extraction boundaries. Hero silhouette: a 190 m broken furnace ribcage with a diagonal living artery visibly bracing and digesting it. Include two 28–30 m routes, 24×12 m portals, 48 m courts and elevated 3 m flank; objective is to extract the dormant process core. States: `B0_derelict_clean`, `B1_artery_contact`, `B2_logistics_infestation`, `B3_bridge_occlusion`, `B4_purged_extraction`, with explicit route swaps.

Use seamless 2K `vespera_heat_dead_superstructure`, `vespera_cooled_slag_ash` and `vespera_vascular_tissue_acid_contact` PBR plus 16 original collapse/artery/logistics/extraction decals; neutral albedo, tangent normal, linear ORM, height and restrained residual/neural emission, graded contact, 3×3 proof. Meters/Y-up/-Z, 4/16 m grid, UV0/tangents, axis/contact pivots, applied transforms, collision/nav/LOS/shot/occluder/objective/extraction/destruction proxies, LOD1≤40%/LOD2≤12%. Export editable Spline and GLBs/manifests/provenance. Phone portrait must show spine, artery, routes, objective and state without effects. No copied megastructure or hive.
```
