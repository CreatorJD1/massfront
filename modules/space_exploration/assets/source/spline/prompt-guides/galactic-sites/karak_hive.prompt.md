# Spline 3D production prompt — Karak Primary Hive

**Status:** `source_prompt_only`  
**Site ID:** `karak_hive`  
**Map asset ID:** `gsite_karak_hive_heart_01`  
**Mission / objective:** `uga_hive_heart` / `karak_hive_heart`  
**Spline root:** `GSITE_KARAK_HIVE`

## Paste-ready art-direction prompt

> Build an original, game-ready modular 3D environment for Karak Primary Hive, a living non-humanoid Brood megastructure. Grow its architecture from biological function: two combined-arms arteries, vascular gates, heat exchange vents, brood chambers, feeding pits, neural nodes, acid basins, calcified load-bearing arches and a central heart. The space should appear evolved around circulation, feeding, thermoregulation and signal propagation—not a humanoid city, metal rooms covered in slime, or a repeated tunnel blob. Use strong macro silhouettes and controlled wet/emissive response so the anatomy stays readable from an RTS camera and on a phone.

## Measured layout and gameplay envelope

- Envelope **480 × 384 m**, **4 m macro contact grid**, **1 unit = 1 m**, **1.25 m nav cell**.
- `organic_artery_a` and `organic_artery_b`: two complete P/L/V/M routes through **24 × 12 m** membrane gates.
- Include at least one **48 m** medium-mech turning chamber.
- `crawl_observation_channels`: P-only, at least **3 m** clear.
- `LZ_VASCULAR_BREACH`: **44 × 36 m**, P/L/V. `LZ_THERMAL_VENT`: **56 × 48 m**, P/L/V/M.
- Acid, roots, tendons, spores, corpses, wounds and animated membranes never intrude into certified envelopes except through declared deterministic state swaps.
- Exclude TITAN.

## Hero and modular model set

Create hero LOD families for `karak_hive_heart`, `karak_vascular_gate`, `karak_thermal_vent`, `karak_brood_chamber`, `karak_egg_sac_cathedral`, `karak_acid_pool_basin`, `karak_neural_node`, `karak_root_bridge`, `karak_bone_arch`, `karak_feeding_pit`, `karak_spore_chimney`, `karak_membrane_valve`, and `karak_fossilized_colony_remnant`.

Build 4 m organic contact pieces; straight/curve/T/bifurcation artery segments; two distinct 24 × 12 gate families; 48 m chamber rings; 3 m crawl channels; tendon bridges; membrane portals; acid curbs; neural conduits; calcified supports; wound caps; heart-state shells; feeding/vent junctions; and class-aware organic obstruction proxies. Heart, chamber proportions, neural tissue and primary-hive skyline remain exclusive; smaller contact blends may support Meridian/Spine only.

## 2K PBR material and decal/mask set

Author six aligned seamless **2048²** families:

1. `karak_living_chitin` — layered armor plates with age and damage variation.
2. `karak_vascular_tissue` — directional soft tissue and vessel patterns driven by form, not random noise.
3. `karak_acid_wet_film` — wet-film/acid residue with bounded transparency and roughness.
4. `karak_calcified_bone` — structural mineralized tissue, distinct from human bone motifs.
5. `karak_spore_crust` — dry porous deposits and localized release masks.
6. `karak_neural_emissive_tissue` — narrow nerve pathways and pulse masks, not full-surface glow.

Deliver BaseColor, tangent Normal, ORM, optional Height/Emissive and clean seam/channel proofs. Create 20 decal/mask entries: UGA containment/probe/route breadcrumb/extraction overlays plus original wound, acid, spore-danger, neural-pulse and heart-objective masks. Human decals must visibly sit above living surfaces as expedition markers.

## Living state set

- `dormant`: low neural emission, relaxed membranes and stable dual arteries.
- `alert`: increased narrow pulse masks and indexed membrane state; gameplay blockers remain explicit.
- `wounded`: dedicated ruptures, acid/spore hazards and class-aware obstruction swaps.
- `heart_purged_safe_extraction`: heart death shell, non-random collapse and an already-safe extraction path.

The Brood is the non-playable galactic enemy. Do not introduce humanoid doors, furniture, faces, weapons or faction banners into its native anatomy.

## Technical construction contract

- Author Y-up/-Z-forward at 1 m; normalize candidate Z-up/+Y-forward; origin at primary chamber floor datum.
- Apply transforms, triangulate, no negative scale, cameras/lights, hidden duplicates, embedded references or unsupported procedural nodes.
- UV0+tangents required. Use deliberate directional UVs on vessels/arteries, padded mask islands and consistent texel density. Explicit alpha modes for wet films/decals.
- Modular pivots at floor contact and flow-aligned snap axes; membranes at true hinge/stretch axes; heart at grounded center datum.
- Required names include `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `HAZARD_ACID_`, `HAZARD_SPORE_`, `OBJ_KARAK_HIVE_HEART`, `LZ_VASCULAR_BREACH`, `LZ_THERMAL_VENT`, `EXTRACT_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Collision/nav/LOS/shot/hazard use simple stable proxies, never the dense organic surface. Keep persistent state proxies explicit.
- Author LOD1 ≤ **40%**, LOD2 ≤ **12%** of LOD0; preserve artery apertures, heart, neural landmark and hazard boundaries.
- Export editable source GLB and standards-bound glTF 2.0 candidate with stable materials plus intake/provenance/source record.

## Spline execution sequence

1. Establish measured artery, chamber, LZ, hazard and class-silhouette guides under `GSITE_KARAK_HIVE`.
2. Greybox two independent legal arteries and the heart/extraction relationship.
3. Model heart, gates, vent, chamber, acid basin, neural and calcified hero families.
4. Build organic modular junctions and snap-test multiple flow-consistent assemblies.
5. Add independent proxies and dormant/alert/wounded/purged state collections.
6. Bind six 2K PBR families, directional blend masks and 20 decal/mask entries.
7. Author deliberate LODs; validate phone readability without excessive emission or surface noise.
8. Export source/candidate package and retain `source_prompt_only` until map/runtime/device gates pass.

## Acceptance checks

- The environment reads as a functional living megastructure, not decorated metal corridors.
- Two full P/L/V/M arteries, gates, turn chamber, crawl channels and LZs are exact.
- Thirteen hero families and required junction/contact pieces exist.
- Six 2K families show distinct biological function; 20 masks/decals are original and aligned.
- Every living state has explicit proxies and safe objective/extraction behavior.
- Phone crops retain heart, dual arteries, hazards and LZ hierarchy.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II may inform only macro readability, class scale, tactical paths and infestation legibility. No creature, hive structure, mesh, texture, animation, layout, decal, logo or faction identity may be copied or traced.
