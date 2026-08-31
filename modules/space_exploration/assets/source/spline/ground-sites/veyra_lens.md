# Lensing Observatory — Spline source brief

**Status:** authoring brief only. `veyra_lens` is a data-only site/mission record with no tactical geometry, navigation, collision, dedicated material/decal pack, or runtime capture. Target asset ID: `gsite_veyra_lens_observatory_01`; Spline root: `GSITE_VEYRA_LENS`.

## Lore and preset

The Lensing Observatory occupies Veyra’s gravitic frontier near a black-hole photon ring. “Lensing Perimeter” secures `lensing_calibration_core` amid time shear and radiation. `preset_veyra_lensing_observatory` must be recognizable through lens petals, baffles, umbra platforms, trenches, and instrument architecture; it cannot be another damaged spaceship with purple lights.

## Dedicated modular kit

- Heroes: calibration core, gravitic lens dish, umbra platform, coolant-trench turbine, chronometric mast, sensor petal, shielded laboratory, shear baffle, observation bridge.
- Modules: 4 m laboratory/platform grid, 24 × 12 m full-class portals, 42–48 m turn courts, coolant trenches, baffle walls, calibration galleries, heavy-lift apron pieces, hazard curbs, bridge supports, and roof/occluder groups.
- The lens/core silhouette, temporal decal language, and calibration-state geometry remain unique; only generic Veyra sensor supports may be shared.

## Materials, textures, and decals

Author four original aligned 2K PBR families: black gravitic ceramic; silver sensor metal; coolant ice/wet film; violet/cyan temporal emission. The 14 decals cover calibration arcs, time-offset ticks, radiation exclusion, umbra and coolant flow, bridge sectors, heavy-lift bounds, Dominion perimeter, Nova research, objective, and emergency-phase overlays. Unique optical response and geometry are mandatory; generic recolors are rejected.

## Scale, routes, and landing zones

- Envelope: 320 × 256 m; 4 m grid; 0.8 m nav cell; P/L/V/M.
- `full_class_perimeter`: P/L/V/M through 24 × 12 m gates with a 48 m turning court. `calibration_gallery_flank`: P, 3 m minimum. `baffle_breach_flank`: deterministic P/L alternate.
- `umbra_platform`: 52 × 44 m, P/L/V/M. `coolant_trench`: 44 × 36 m, P/L/V.
- Animated lens/time-shear effects never alter authoritative blockers. TITAN is excluded despite the full compact-map class route.

## Destruction and gameplay proxies

Author `calibrated`, `coolant_rupture`, `baffle_breach`, and `lens_disabled`. A coolant rupture creates a declared hazard; a destroyed baffle opens a deterministic flank and updates cover/LOS/shot state. Use separate `COLL_`, `NAV_`, `PORTAL_`, `LOS_`, `SHOT_`, `HAZARD_COOLANT_`, `HAZARD_RADIATION_`, `OBJ_LENSING_CALIBRATION_CORE`, `LZ_UMBRA_PLATFORM`, and `LZ_COOLANT_TRENCH` nodes.

## LOD, collision, export, and concept gate

Follow the shared LOD/collision/export contracts: deliberately authored LOD0/1/2, LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserved lens/baffle silhouette and gate openings, invariant simple collision, applied transforms, UV0/tangents, and GLB 2.0 PBR. Spline authoring is 1 unit = 1 m, Y-up/-Z-forward; normalize candidates to Z-up/+Y-forward.

Final geometry is blocked on an original measured board showing the black-hole silhouette, fixed baffle states, full-class court, coolant/radiation volumes, clearance sections, and phone crop. No Spline/model/texture source exists; runtime remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II are visual-language references only. Study hierarchy, scale, cover, and state readability; never copy or trace their meshes, surfaces, effects, layouts, logos, decals, factions, or named props.
