# Spline 3D production prompt — Orison Derelict

**Status:** `source_prompt_only`  
**Site ID:** `veyra_orison`  
**Map asset ID:** `gsite_veyra_orison_archive_01`  
**Mission / objective:** `nova_orison_recovery` / `orison_memory_vault`  
**Spline root:** `GSITE_VEYRA_ORISON`  
**Original concept:** `../../../concepts/ground-sites/orison-derelict/orison-derelict-combined-arms-concept-v1.png` (source reference only; measured approval still required)

## Paste-ready art-direction prompt

> Build an original modular tactical environment for Orison Derelict, a broken pre-UGA archive/transit megaframe on Veyra's tidally locked black-hole frontier. Its defining form is one axial structure: a broken spine linking a memory vault, archive galleries, an aft lattice, shattered reactor ring and collapsed docking jaw. Use cold cyan emergency wayfinding against burnt metal, vacuum frost and localized warm breach damage. The place must feel ancient, engineered and partially navigable—not disconnected sci-fi rooms, a recolored UGA hull, or a flat smoke billboard. Preserve light-vehicle and measured medium-mech paths at RTS scale and make damage readable from a phone camera.

## Measured layout and gameplay envelope

- Envelope **192 × 160 m**, **4 m grid**, **1 unit = 1 m**, **0.5 m nav cell**.
- `archive_recovery_loop`: P/L/V through **18 × 8 m** portals.
- `measured_high_bay`: conditional P/L/V/M through **24 × 12 m** portals and a **42–48 m** turn court. Medium-mech admission remains conditional until clearance proof.
- `data_duct_flank`: P-only, **3 m** minimum.
- `LZ_BROKEN_SPINE`: **44 × 36 m**, P/L/V. `LZ_AFT_LATTICE`: **48 × 40 m**, P/L/V and conditional M.
- Preserve objective-to-extraction redundancy in every persistent state. Moving debris is visual only; authoritative routes use fixed indexed geometry.
- Exclude TITAN.

## Hero and modular model set

Create hero LOD families for `orison_memory_vault`, `orison_broken_axial_spine`, `orison_aft_lattice`, `orison_archive_chamber`, `orison_collapsed_docking_jaw`, `orison_shattered_reactor_ring`, `orison_breach_shutters`, `orison_debris_bridge`, `orison_emergency_lift`, and `orison_escape_pod_cluster`.

Build 4 m megaframe floor/wall straight/corner/T/end pieces; pressure bulkheads; data-glass galleries; service trunks; 18 × 8 vehicle portals; 24 × 12 high-bay portals; pressure tunnels; debris bridges with class variants; breach caps; archival racks; roof/occluder groups; and personnel data ducts. The vault, axial silhouette, damage choreography, pre-UGA script and LZ forms remain site-exclusive.

## 2K PBR material and decal set

Author four aligned seamless **2048²** families:

1. `orison_burnt_megaframe_alloy` — layered heat-cycled alloy with structural wear, no baked directional light.
2. `orison_fractured_data_glass` — transparent data laminate with separate intact/cracked masks and restrained internal emission.
3. `orison_frost_vacuum_residue` — edge frost, vent deposits and cold dust used as overlays rather than universal whitening.
4. `orison_emergency_emissive` — dark emergency housings with narrow red/amber/cyan emission channels.

Deliver BaseColor, tangent Normal, ORM, optional Height/Emissive. Create 14 original decals: pre-UGA archive script, fracture numbers, vacuum hatches, shear vectors, rescue routes, deck coordinates, Nova recovery, Syndicate salvage, emergency power and memory-vault objective marks. The script must be newly designed, non-copied and internally consistent.

## State set

- `sealed_archive`: cleanest surviving state; powered vault seals and intact primary loop.
- `shear_damaged`: bent frames, indexed frost/debris and declared gravitic hazard boundaries.
- `breach_open`: open breach shutters with vacuum hazard; alternate path already available.
- `lattice_collapse_safe_extraction`: ruined aft lattice that preserves a legal extraction path.

No Brood infestation is authored for this site. Damage states use fixed meshes and explicit collision/nav/LOS/shot/hazard swaps.

## Technical construction contract

- Spline Y-up/-Z-forward at 1 m scale; normalize candidate Z-up/+Y-forward; site origin at floor datum.
- Applied transforms, triangles only, no negative scale, cameras/lights, unsupported procedural nodes or embedded concept/reference imagery.
- UV0+tangents on all textured meshes; consistent texel density; padded transparent/decal islands; explicit alpha modes.
- Modular pivots at floor contact; shutters/lift on actual movement axes; debris-bridge pivots at authored snap datum.
- Node prefixes plus exact gameplay IDs: `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `HAZARD_VACUUM_`, `OBJ_ORISON_MEMORY_VAULT`, `LZ_BROKEN_SPINE`, `LZ_AFT_LATTICE`, `EXTRACT_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Separate simple watertight collision and nav from dense render geometry; class-aware rubble proxies are mandatory.
- LOD1 ≤ **40%** and LOD2 ≤ **12%** of LOD0; preserve vault/spine silhouettes, openings, emergency landmarks and damage readability.
- Export editable source GLB and glTF 2.0 binary candidate plus `intake.json`, provenance and source URL record.

## Spline execution sequence

1. Import the original concept only as a locked reference plane outside export; add measured route/LZ/clearance guides.
2. Greybox the full axial spine, vault and both landing zones; prove P/L/V and conditional-M paths.
3. Model vault, docking jaw, reactor ring and aft lattice hero families.
4. Build megaframe, portal, pressure, gallery and breach modules; snap-test a second axial configuration.
5. Add explicit gameplay proxies and four state collections.
6. Bind four PBR sets; layer frost/damage locally and apply the 14-decal archive language.
7. Author LODs, roof groups and phone-scale tactical framing.
8. Export source/candidate assets, leaving runtime status false until measured concept, path and hardware gates pass.

## Acceptance checks

- One coherent axial megastructure, not a pile of rooms.
- Exact portals, routes, turning court and LZs are measurable; conditional M is not overclaimed.
- Ten hero families, modular junctions, four 2K materials and 14 decals exist.
- Every destruction state preserves objective-to-extraction continuity.
- Collision/nav/LOS/shot/hazard proxies remain separate and stable across LODs.
- Phone crops retain spine, vault, breach and route hierarchy.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II are visual-language references only. Do not copy or trace their derelicts, architecture, materials, layouts, glyphs, decals, props, logos or factions.
