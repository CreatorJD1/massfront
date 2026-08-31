# Spline 3D production prompt — Meridian Colony

**Status:** `source_prompt_only`  
**Site ID:** `karak_meridian`  
**Map asset ID:** `gsite_karak_meridian_colony_01`  
**Mission / objective:** `uga_pale_bloom` / `meridian_breeder_nest`  
**Spline root:** `GSITE_KARAK_MERIDIAN`  
**Original concept:** `../../../concepts/ground-sites/meridian-colony/meridian-colony-brood-infestation-concept-v1.png` (source reference only; measured approval still required)

## Paste-ready art-direction prompt

> Build an original combined-arms 3D tactical environment for Meridian Colony, an abruptly silent Karak settlement under graded Brood infestation. First make a believable human colony: clinic, school/civic hall, habitats, greenhouse pressure dome, transit court, utilities, roads, glass pressure tunnels and evacuation infrastructure. Then author a non-humanoid Brood takeover that grows through drainage, foundations, ruptured glazing and utility corridors while leaving civilian history readable. Add a later UGA containment layer with decontamination and burn-lane hardware. Do not produce a soldier-only arena, generic cubes, a recolored Aelos dome or one organic mesh repeated everywhere. The result must accommodate soldiers, light mechs, small vehicles and medium mechs.

## Measured layout and gameplay envelope

- Large compact site **480 × 384 m**, **4 m grid**, **1 unit = 1 m**, **1.25 m nav cell**.
- `colony_road_loop_a`: complete P/L/V/M loop through **24 × 12 m** gates and a **48 m** turning court.
- `colony_road_loop_b`: second complete P/L/V/M loop, at least **28 m two-way clear**.
- `clinic_service_flanks`: P-only, at least **3 m**.
- `LZ_CLINIC_ROOF`: **32 × 28 m**, P/L only; reject vehicles and medium mechs.
- `LZ_TRANSIT_COURT`: **56 × 48 m**, P/L/V/M.
- Hedges, bodies, dome braces, spore masses, props and rubble never intrude into certified routes/LZs. Exclude TITAN.

## Hero and modular model set

Create hero LOD families for `meridian_breeder_nest`, `meridian_clinic`, `meridian_transit_court`, `meridian_colony_habitat`, `meridian_evacuation_depot`, `meridian_water_tower`, `meridian_comms_mast`, `meridian_school_civic_hall`, `meridian_greenhouse_biodome`, `meridian_road_bridge`, and `meridian_quarantine_gate`.

Build 4 m civic/hab straight/corner/T/end modules; 16–30 m roads/intersections; 24 × 12 gates; 48 m courts; pressure-tunnel straight/corner/T/airlock modules; dome shell/intact/ruptured panels; utility alleys; decon/burn-lane hardware; rooftop insertion pieces; route-safe civilian props; Brood contact blends; personnel shortcuts; and class-aware rubble. Produce three distinct preset assemblies: silent colony, pressure biodome and later containment base. Preserve unique clinic, civic, biodome, nest and evacuation silhouettes.

## 2K PBR material and decal set

Author five aligned seamless **2048²** families:

1. `meridian_colony_concrete_paving` — civic concrete, road/paver joints and controlled weathering.
2. `meridian_hab_composite` — warm neutral habitation panels, trim and service access.
3. `meridian_wet_vegetation_spore_residue` — separate vegetation, moisture and spore overlays.
4. `meridian_quarantine_steel_plastic` — clean later UGA containment hardware with amber/red isolation accents.
5. `meridian_brood_infestation_blend` — chitin/tissue/root transition masks, wetness and wounds; never a simple hue shift.

Deliver BaseColor, tangent Normal, ORM, optional Height/Emissive. Produce 18 original decals: districts, clinic/medical, utility, shelter, evacuation, missing-person, quarantine, spore danger, UGA containment, breeder objective and purge-state marks.

## Environmental and Brood state set

- `silent_intact` / B0: clean abandoned colony with readable civilian function and evacuation evidence.
- `brood_overgrown` / B2–B3: directional infestation following plausible service routes; intact combined-arms clearances remain measurable.
- `nest_purged` / B4 wound: breeder destroyed, charred organic residue and declared spore hazards without erasing objective/extraction.
- `civic_collapse_safe_evacuation`: authored ruined civic state preserving at least one complete mixed route.

Brood is non-playable and non-humanoid. Living growth uses distinct nest, feeder, vascular, membrane and spore forms, not human architecture with organic paint.

## Technical construction contract

- Author Y-up/-Z-forward at 1 m; normalize candidate Z-up/+Y-forward; origin at site floor datum.
- Applied transforms, triangles only, no negative scale, cameras/lights, unsupported procedural nodes, hidden duplicates or embedded references.
- UV0+tangents required. Keep stable texel density; allocate clean/infested blend masks intentionally; pad decal/transparent islands and declare alpha.
- Grid modules pivot at floor contact; doors/gates at true hinges; dome panels around authored seam axes; nest root at floor-contact center.
- Prefix all nodes with contract names; include `OBJ_MERIDIAN_BREEDER_NEST`, `LZ_CLINIC_ROOF`, `LZ_TRANSIT_COURT`, `HAZARD_SPORE_`, plus `GEO_`, LOD, collision, nav, portal, cover, LOS, shot, extraction, destruction, roof and occluder groups.
- Separate watertight collision/nav/LOS/shot/hazard proxies. Organic render surfaces never become dense collision.
- LOD1 ≤ **40%**, LOD2 ≤ **12%** of LOD0; preserve clinic/biodome/nest silhouettes, routes, gates, glass tunnels and infestation-stage readability.
- Export editable source GLB and standards-bound candidate plus `intake.json`, source URL and provenance.

## Spline execution sequence

1. Lock the concept as non-export reference and create measured roads, courts, gates, LZs and class silhouettes.
2. Greybox the clean colony first; prove both P/L/V/M loops and rooftop restrictions.
3. Model all civic hero families and modular roads/tunnels/dome/utilities.
4. Author later UGA containment as a distinct overlay kit.
5. Create Brood B0–B4 direction maps, dedicated living models and clean-to-infested material blends.
6. Add independent gameplay proxies and four deterministic state collections.
7. Bind five PBR families, apply 18 decals and author deliberate LODs.
8. Capture phone portrait/landscape clean versus infested states; export source/candidate without runtime promotion.

## Acceptance checks

- Clean Meridian reads as a functioning colony before infestation is visible.
- Two full mixed-unit loops, gate/court dimensions and both class-specific LZs are exact.
- Eleven heroes, modular civic/tunnel/Brood sets, five PBR families and 18 decals exist.
- Infestation follows environmental logic and never becomes repeated blobs or humanoid structures.
- Every state preserves safe objective/extraction flow with separate proxies.
- Phone crops show clinic, biodome, transit court, breeder nest and route hierarchy.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II may guide macro hierarchy, combined-arms scale, cover and infestation storytelling only. Do not copy or trace their colony buildings, organisms, creep, textures, decals, layouts, logos, props or faction designs.
