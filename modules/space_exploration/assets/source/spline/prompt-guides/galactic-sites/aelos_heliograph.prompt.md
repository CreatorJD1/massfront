# Spline 3D production prompt — Heliograph Relay

**Status:** `source_prompt_only`  
**Site ID:** `aelos_heliograph`  
**Map asset ID:** `gsite_aelos_heliograph_relay_01`  
**Mission / objective:** `nova_heliograph_wake` / `heliograph_control_spine`  
**Spline root:** `GSITE_AELOS_HELIOGRAPH`

## Paste-ready art-direction prompt

> Build an original modular Spline environment for MASSFRONT's Heliograph Relay: an exposed Aelos phase-communications installation where elegant core-world engineering meets dangerous radiation and hardened security. Its signature silhouette is a tilted heliostat array orbiting a narrow control spine, phase-coil tower, maintenance spar and deep radiation-shadow structures. Readability must come from the array/spine relationship, solar surfaces, cable trunks and fixed cover states—not a generic radar dish or military base with cyan lights. Design for elevated RTS viewing and phone-scale silhouette recognition.

## Measured layout and gameplay envelope

- Assemble a **192 × 160 m** site on a **4 m grid**, at **1 unit = 1 m**, with **0.5 m nav cells**.
- `maintenance_apron_loop`: P/L/V through an **18 × 8 m** vehicle gate.
- `relay_spine`: P/L through a **14 × 7 m** portal.
- `service_branch`: P only, at least **3 m** clear.
- `LZ_RELAY_SHADOW`: **36 × 32 m**, P/L/V. `LZ_MAINTENANCE_SPAR`: **40 × 32 m**, P/L.
- Maintain two apron-to-core routes in every persistent state. Visual heliostat movement never changes authoritative blockers; use indexed fixed states.
- Exclude medium mechs and TITAN.

## Hero and modular model set

Create hero LOD families for `heliograph_array`, `heliograph_control_spine`, `heliograph_phase_coil_tower`, `heliograph_maintenance_spar`, `heliograph_radiation_shutter_bank`, `heliograph_coolant_mast`, `heliograph_signal_lens`, and `heliograph_service_capsule`.

Build 4 m modular apron/deck straight/corner/T/end pieces; solar-array pivots; spar trusses; 14 × 7 and 18 × 8 portal families; service branches; radiation-shadow cover fins; phase-cable trunks; coolant runs; barrier sockets; and two distinct preset layers: a relay outpost and a hardened security-base variant with its own motor apron, sensor pickets, bunker and breachable gates. The security base may share utility interfaces but cannot be a prop scatter or recolor.

## 2K PBR material and decal set

Author seamless aligned **2048²** families:

1. `heliograph_solar_ceramic_gold_foil` — pale thermal ceramic, selective metallic foil and micro-scratches without baked lighting.
2. `heliograph_radiation_blackened_titanium` — heat-cycled dark metal with restrained oxidation and roughness variation.
3. `heliograph_phase_coil_emissive` — insulated coil ceramic and controlled cyan-white emission masks, never full-surface bloom.

Deliver BaseColor, tangent Normal, ORM (R AO/G roughness/B metallic), optional Height and Emissive. Create 12 original decal entries: azimuth/spectrum scales, phase-lock calibration, radiation arcs, antenna keep-clear, emergency-shadow zones, spar IDs, maintenance rails, seizure/recovery and security-cordon overlays. Decal emissions remain narrow and legible.

## State set

- `calibrated`: clean relay alignment, readable safety zones, no Brood layer.
- `arc_flash_damage`: scorched coil housings and indexed electrical hazard without random path changes.
- `spar_breach`: one declared breach panel opens a route while retaining redundant access.
- `relay_disabled`: shutters and coils visually depowered; objective state remains identifiable.

Create separate, deterministic state meshes. Declare radiation hazard, portal, collision, nav, cover, LOS and projectile changes for every state.

## Technical construction contract

- Spline Y-up/-Z-forward, **1 unit = 1 m**; candidate Z-up/+Y-forward. Site origin is floor datum.
- Apply transforms, triangulate, forbid negative scale, cameras/lights, hidden duplicates and embedded references.
- UV0+tangents on textured meshes; consistent texel density, padded decal/transparent islands, explicit alpha modes and standards-bound PBR only.
- Modular pivots at grid-aligned floor contact; array/shutter pivots on true axes. Never allow a visual pivot animation to become authoritative collision.
- Use `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_HELIOGRAPH_CONTROL_SPINE`, `LZ_RELAY_SHADOW`, `LZ_MAINTENANCE_SPAR`, `EXTRACT_`, `HAZARD_RADIATION_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Collision is simple, watertight and separate from rendering/navigation/LOS.
- Authored LOD1 ≤ **40%** and LOD2 ≤ **12%** of LOD0; retain the array, control-spine silhouette, gate openings, shadow-cover boundary and phase landmark.
- Export editable source GLB plus glTF 2.0 binary candidate, stable material names, intake/provenance/source-link files.

## Spline execution sequence

1. Lock scale and place route/LZ/portal/hazard measurement guides under `GSITE_AELOS_HELIOGRAPH`.
2. Greybox the control spine, apron loop, relay shadow and spar; prove both legal routes.
3. Build array, signal lens, coil tower and fixed indexed vane states.
4. Author modular deck/truss/portal/cable kits, then create the visually distinct security-base assembly.
5. Add independent collision, nav, LOS, shot and radiation volumes.
6. Bind PBR families; add calibrated decal atlas and narrow emissions.
7. Author damage states and deliberate LODs; inspect top-down and phone portrait crops.
8. Export candidates and evidence metadata; retain `source_prompt_only` until runtime integration and device proof.

## Acceptance checks

- Array + control spine + radiation shadow form a unique one-glance silhouette.
- Measured gate, route, LZ and hazard envelopes match the IDs above.
- Relay and security-base assemblies are geometrically distinct.
- Three 2K families and 12 decals pass seam, alignment and emission checks.
- No state removes both core routes; animation cannot desynchronize gameplay proxies.
- LODs preserve portals and skyline; phone captures retain objective/readable cover.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II may inform hierarchy, scale and tactical readability only. Never copy or trace their arrays, bases, assets, layouts, textures, symbols, decals, factions or effects.
