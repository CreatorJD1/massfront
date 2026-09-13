# Spline 3D production prompt — Caldris Orbital Ring

**Status:** `source_prompt_only` — authoring instructions, not a model or runtime asset.  
**Site ID:** `aelos_caldris`  
**Map asset ID:** `gsite_aelos_caldris_customs_01`  
**Mission / objective:** `dominion_caldris_claim` / `caldris_customs_core`  
**Spline root:** `GSITE_AELOS_CALDRIS`

## Paste-ready art-direction prompt

> Build an original, game-ready modular 3D environment kit and assembled greybox for MASSFRONT's Caldris Orbital Ring. It is a prosperous blue-white UGA civilian customs ward curved along an inhabited orbital ring above an ocean world. The unmistakable silhouette is a broad arc: pearl pressure architecture, teal transit glazing, a mag-tram ribbon, a customs core and a cargo high bay layered along the ring curvature. It must feel populated and regulated, with clear civilian-safe fire lanes, decompression shutters and cargo inspection infrastructure. Do not make a square room, generic spaceship corridor, or palette-swapped NEXUS-VII interior. Compose for an elevated RTS camera and preserve readable large forms on a phone.

## Measured layout and gameplay envelope

- Assemble a **320 × 256 m** small site on a **4 m structural grid**, using **1 Spline unit = 1 m** and a **0.8 m navigation cell**.
- Preserve `customs_loop` at **18 m clear** for personnel, light mechs and small vehicles.
- Preserve `cargo_high_bay` through a **24 × 12 m portal** and a **42–48 m turning court**. It admits one medium mech; all other medium-mech routes are rejected.
- Preserve `customs_office_flank` at **3 m clear** for personnel.
- Keep `LZ_CUSTOMS_RING` at **40 × 36 m** for P/L/V and `LZ_CARGO_LOCK` at **48 × 40 m** for P/L/V/M.
- Provide two complete mixed-unit routes from both compatible landing zones to `OBJ_CALDRIS_CUSTOMS_CORE` and extraction. No prop, decal mesh, shutter, debris or visual effect may intrude into a certified route.
- Exclude TITAN and unrestricted strategic units.

## Hero and modular model set

Create dedicated LOD families for: `caldris_customs_core`, `caldris_curved_habitat_viewport`, `caldris_mag_tram_station`, `caldris_civic_concourse_tower`, `caldris_cargo_lock`, `caldris_inspection_gantry`, and `caldris_ring_service_elevator`.

Create reusable 4 m-grid modules: straight/inside-corner/outside-corner curved floor arcs; curved pressure walls; intact/breached glazing; pressure-corridor straight/corner/T/end cap; tram rail straight/curve/platform; inspection booths; civic partitions; cargo high-bay portals; service ducts; shutters; structural ribs; floor-contact end caps; route-safe benches and cargo frames. The customs core, inhabited skyline, curved viewport, mag-tram/cargo relationship and LZ geometry remain Caldris-only.

## 2K PBR material and decal set

Author three aligned, seamless **2048 × 2048** families:

1. `caldris_pearl_arcology_ceramic` — lighting-neutral pearl ceramic, subtle panel seams, non-metallic, clean-to-scuffed variants.
2. `caldris_teal_civic_glazing_transit_inlay` — restrained teal laminated glass, transit inserts and narrow emissive edges; glass remains transparent rather than glowing solid.
3. `caldris_customs_scanner_alloy` — brushed inspection alloy, rubber contact strips, scanner apertures and controlled wear.

For each family deliver BaseColor sRGB, tangent-space Normal linear, ORM linear (**R AO / G roughness / B metallic**), optional Height linear and optional restrained Emissive sRGB. Supply seam and channel-alignment proofs. Produce a 12-entry decal atlas covering original UGA customs/ring-sector identity, resident claim overlays, tram direction, cargo-weight grids, evacuation/shelter paths, restricted-fire boundaries and decompression warnings. Decals need BaseColor+Alpha and optional Normal/ORM/Emissive; do not bake every marking into the tile set.

## State set

- `intact_civic`: clean commissioned ward, controlled traffic, no Brood layer.
- `customs_lockdown`: closed indexed shutters, amber security language and declared portal changes.
- `pressure_breach`: localized fractured glazing, vented clutter and frost; one route may close only after its alternate is open.
- `post_breach_sealed`: emergency patch panels, red/amber isolation tape and safe-route restoration.

Create named state meshes rather than random rubble. Every state must explicitly preserve or change collision, navigation, cover, LOS, shots, blast and hazard volumes.

## Technical construction contract

- Author Y-up / -Z-forward; export candidate normalized to Z-up / +Y-forward.
- Apply transforms; use triangles only; forbid negative scale, hidden duplicate geometry, cameras, lights and embedded concept/reference images.
- Every textured mesh requires UV0 and tangent basis. Keep texel scale consistent; isolate transparent glazing/decal UV islands with padding; do not rely on unsupported procedural shaders.
- Put reusable pivots at grid-aligned floor contact. Put shutters, lifts and doors on their physical hinge/track axis. Keep the assembled site origin at the floor datum.
- Prefix render and gameplay nodes exactly: `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_`, `LZ_`, `EXTRACT_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Never use render meshes as collision. Create simple watertight boxes/convex proxies; keep collision, walkable NAV surfaces, LOS and projectile blockers separate.
- Author LOD0/1/2 deliberately. LOD1 must be at most **40%** of LOD0 triangles and LOD2 at most **12%**, while preserving the ring curve, customs silhouette, all portals and emissive wayfinding.
- Export editable source GLB and standards-bound glTF 2.0 binary candidate with stable materials and explicit alpha modes.

## Spline execution sequence

1. Create `GSITE_AELOS_CALDRIS` at world origin and add locked 4 m-grid, route, portal, turning-court and LZ guides.
2. Greybox the full arc and validate route widths before adding detail.
3. Model the customs core, cargo lock and mag-tram station as separate hero families.
4. Build the modular pressure, transit and cargo kits; test snapping and pivots in a second assembly.
5. Add separate gameplay proxy collections and validate every admitted class in all four persistent states.
6. Bind the three PBR families, then apply decal planes/meshes with slight depth bias and no z-fighting.
7. Author state swaps and LODs; inspect tactical silhouette at phone-scale framing.
8. Export source and candidate files plus `intake.json`, provenance and scene/source URL record. Do not mark runtime-ready.

## Acceptance checks

- The site reads as a curved inhabited orbital district within one second at RTS zoom.
- Exact routes, gates, turning court and LZ dimensions are measurable in source.
- All seven hero families and required modular junctions exist with stable names and pivots.
- Three 2K PBR families and 12 original decals pass seam/channel checks.
- All four states preserve a legal objective/extraction route and use separate gameplay proxies.
- LOD ratios and silhouettes pass; GLB contains no reference-game content or unsupported materials.
- Phone portrait and landscape captures show the customs core, route choices and LZs without critical geometry hidden.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II are visual-language references only for hierarchy, combined-arms scale, tactical cover and environmental storytelling. Do **not** copy, trace, extract or closely reproduce any mesh, texture, layout, decal, symbol, logo, faction design, organism or named prop from those games.
