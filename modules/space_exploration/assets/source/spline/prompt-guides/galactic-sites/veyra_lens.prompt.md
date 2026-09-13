# Spline 3D production prompt — Lensing Observatory

**Status:** `source_prompt_only`  
**Site ID:** `veyra_lens`  
**Map asset ID:** `gsite_veyra_lens_observatory_01`  
**Mission / objective:** `dominion_lens_perimeter` / `lensing_calibration_core`  
**Spline root:** `GSITE_VEYRA_LENS`

## Paste-ready art-direction prompt

> Build an original modular 3D tactical environment for Veyra's Lensing Observatory near a black-hole photon ring. Create a precise scientific campus whose identity comes from a gravitic lens dish, articulated sensor petals, shear baffles, an umbra platform, coolant trenches and a shielded calibration core. Use black optical ceramic, silver instruments, wet/icy coolant infrastructure and restrained violet/cyan temporal emission. Keep the full-class perimeter and turning court readable from an elevated RTS view. Do not make a generic observatory dome, damaged spaceship or black buildings with purple lights.

## Measured layout and gameplay envelope

- Envelope **320 × 256 m**, **4 m grid**, **1 unit = 1 m**, **0.8 m nav cell**.
- `full_class_perimeter`: P/L/V/M through **24 × 12 m** gates with a **48 m preferred turning court**.
- `calibration_gallery_flank`: P only, minimum **3 m**.
- `baffle_breach_flank`: deterministic P/L alternate.
- `LZ_UMBRA_PLATFORM`: **52 × 44 m**, P/L/V/M. `LZ_COOLANT_TRENCH`: **44 × 36 m**, P/L/V.
- Preserve two legal paths or an already-open breach alternate in every persistent state. Animated lensing/time-shear visuals never modify blockers.
- Exclude TITAN.

## Hero and modular model set

Create hero LOD families for `lensing_calibration_core`, `lensing_gravitic_dish`, `lensing_umbra_platform`, `lensing_coolant_turbine`, `lensing_chronometric_mast`, `lensing_sensor_petal`, `lensing_shielded_laboratory`, `lensing_shear_baffle`, and `lensing_observation_bridge`.

Create 4 m laboratory/platform straight/corner/T/end pieces; 24 × 12 full-class portals; 42/48 m turn-court segments; coolant trench straights/corners/crossings; baffle walls; calibration galleries; heavy-lift aprons; hazard curbs; bridge supports; optical cable trunks; roof and occluder groups. The lens/core silhouette, temporal markings, baffle geometry and calibration states remain exclusive.

## 2K PBR material and decal set

Author four aligned seamless **2048²** families:

1. `lensing_black_gravitic_ceramic` — near-black optical ceramic with readable roughness, edge profile and no crushed detail.
2. `lensing_silver_sensor_metal` — precision metal with fine machining and limited handling wear.
3. `lensing_coolant_ice_wet_film` — separate coolant channel, wet-film and ice/frost masks for localized layering.
4. `lensing_temporal_emissive` — violet/cyan instrument inlays with small controlled emissive coverage.

Deliver BaseColor, tangent Normal, ORM, optional Height and Emissive. Produce 14 original decals: calibration arcs, time-offset ticks, radiation exclusion, umbra sectors, coolant flow, bridge sectors, heavy-lift bounds, Dominion perimeter, Nova research, objective and emergency-phase overlays.

## State set

- `calibrated`: clean operational array and stable baffles; no Brood layer.
- `coolant_rupture`: local wet/ice damage and deterministic coolant hazard volumes.
- `baffle_breach`: declared destroyed baffle opens the P/L alternate and updates cover/LOS/shot proxies.
- `lens_disabled`: lens petals parked or broken in an indexed non-authoritative visual state; core remains readable.

No random moving geometry may alter tactical authority.

## Technical construction contract

- Author Y-up/-Z-forward at 1 m; normalize GLB to Z-up/+Y-forward; origin at floor datum.
- Apply transforms, triangles only, no negative scales, cameras/lights, hidden duplicates, embedded references or unsupported procedural materials.
- Require UV0+tangents, consistent texel density and padded atlas islands. Transparent/wet/decal materials declare alpha modes explicitly.
- Pivots: modular pieces at grid-aligned floor contact; lens petals/baffles on real hinge axes; turbine on actual rotation axis.
- Use required prefixes and IDs: `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `HAZARD_COOLANT_`, `HAZARD_RADIATION_`, `OBJ_LENSING_CALIBRATION_CORE`, `LZ_UMBRA_PLATFORM`, `LZ_COOLANT_TRENCH`, `EXTRACT_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Collision/nav/LOS/projectile/hazard proxies are separate simple meshes and do not switch with visual LOD.
- LOD1 ≤ **40%**, LOD2 ≤ **12%** of LOD0; retain lens, petals, baffles, gates, bridge and emissive objective.
- Export editable source GLB and standards-bound glTF 2.0 binary candidate with stable material names and source metadata.

## Spline execution sequence

1. Build measured guides for the perimeter, two LZs, 24 × 12 portals, 48 m court, trenches and hazard volumes.
2. Greybox all legal routes before adding the lens structure.
3. Model calibration core, dish/petals, baffles, mast, turbine and bridge hero families.
4. Build platform, trench, portal, gallery and heavy-lift modular kits; snap-test them.
5. Create deterministic state meshes and all gameplay proxy collections.
6. Bind four PBR families and 14-decal atlas; keep temporal bloom narrow.
7. Author LODs and tactical roof/occluder behavior; compare phone portrait/landscape crops.
8. Export source/candidate packages and remain `source_prompt_only` pending runtime proof.

## Acceptance checks

- The lens/petal/baffle silhouette is unique and survives top-down distance.
- Full-class route, 48 m court, portals and landing zones are exact and unobstructed.
- Nine hero families plus all junction modules exist with correct pivots.
- Four 2K sets and 14 decals pass seam/channel/emission inspection.
- Coolant/baffle changes update declared proxies without stranding units.
- Phone captures preserve objective, hazard and route readability.

## Original-work boundary

Use Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II only as high-level references for silhouette hierarchy, scale, cover and readable state change. Copying or tracing any asset, layout, lens design, material, glyph, decal, logo or faction identity is forbidden.
