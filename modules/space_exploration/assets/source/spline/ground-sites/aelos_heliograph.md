# Heliograph Relay — Spline source brief

**Status:** authoring brief only. `aelos_heliograph` has mission data but no tactical geometry, navmesh, collision, dedicated material/decal pack, or runtime capture. Target asset ID: `gsite_aelos_heliograph_relay_01`; Spline root: `GSITE_AELOS_HELIOGRAPH`.

## Lore and presets

Heliograph is an exposed Aelos phase-communications relay where regulated core-space infrastructure meets radiation risk. “Heliograph Wake” secures `heliograph_control_spine` from `relay_shadow` or `maintenance_spar`. Build `preset_aelos_heliograph_relay_outpost` and a dedicated `preset_aelos_heliograph_security_base`; the base needs its own hardened motor apron, sensor pickets, bunker, and breachable gates, not military props scattered over the outpost.

## Dedicated modular kit

- Heroes: heliostat array, relay control spine, phase-coil tower, maintenance spar, radiation-shutter bank, coolant mast, signal lens, service capsule.
- Modules: 4 m apron/deck pieces, solar-array pivots, spar trusses, 14 × 7 m light-mech portals, 18 × 8 m vehicle gates, service branches, radiation-shadow cover, security barriers, and phase-cable trunks.
- The control spine, signal lens, security silhouette, and calibrated vane states remain Heliograph-specific.

## Materials, textures, and decals

Author three original 2K aligned PBR families: solar ceramic/gold foil; radiation-blackened titanium; cyan-white phase-coil emission. The 12 decals cover azimuth and spectrum calibration, phase lock, radiation arcs, antenna keep-clear, emergency shadow zones, spar IDs, maintenance rails, and original faction seizure/recovery overlays. Do not create the security-base preset by recoloring the relay kit.

## Scale, routes, and landing zones

- Envelope: 192 × 160 m; 4 m grid; 0.5 m nav cell; P/L/V only.
- `maintenance_apron_loop`: P/L/V through an 18 × 8 m gate. `relay_spine`: P/L through a 14 × 7 m gate. `service_branch`: P only, at least 3 m.
- `relay_shadow`: 36 × 32 m, P/L/V. `maintenance_spar`: 40 × 32 m, P/L.
- Heliostat animation is visual; authoritative cover and LOS use fixed indexed states. TITAN and medium-mech admission are explicitly excluded.

## Destruction and gameplay proxies

Author `calibrated`, `arc_flash_damage`, `spar_breach`, and `relay_disabled` states. Relay shutters and one breach panel may change portals, but no state may remove both apron-to-core routes. Declare radiation volumes and every collision/nav/LOS/shot change. Use separate `COLL_`, `NAV_`, `PORTAL_`, `LOS_`, `SHOT_`, `HAZARD_RADIATION_`, `OBJ_HELIOGRAPH_CONTROL_SPINE`, `LZ_RELAY_SHADOW`, and `LZ_MAINTENANCE_SPAR` nodes.

## LOD, collision, export, and concept gate

Use the manifest’s LOD/collision/export contracts: authored LOD0/1/2 with LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserving the array/spine silhouette and all route openings; stable non-render collision proxies; applied transforms; UV0/tangents; GLB 2.0 PBR. Spline scale is 1 unit = 1 m, Y-up/-Z-forward; candidate normalization is Z-up/+Y-forward.

Final geometry is blocked on an original measured board showing the solar-relay silhouette, radiation-shadow cover, fixed vane/LOS states, security-cordon preset, clearance sections, and phone crop. No Spline or texture/model source exists; provenance remains empty and runtime status remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II may guide only silhouette hierarchy, scale separation, tactical cover, and readable state changes. Their assets, layouts, iconography, logos, markings, and faction designs are not source material and may not be copied or traced.
