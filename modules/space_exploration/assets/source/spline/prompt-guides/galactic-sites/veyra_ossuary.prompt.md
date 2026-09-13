# Spline 3D production prompt — Ossuary Vault

**Status:** `source_prompt_only`  
**Site ID:** `veyra_ossuary`  
**Map asset ID:** `gsite_veyra_ossuary_vault_01`  
**Mission / objective:** `syndicate_ossuary_dividend` / `ossuary_phase_engine`  
**Spline root:** `GSITE_VEYRA_OSSUARY`

## Paste-ready art-direction prompt

> Build an original modular tactical environment for Ossuary Vault, an ancient subsurface complex whose automation predates known Veyra settlement. Shape the level around a broad ceremonial processional route, monumental iris aperture, phase engine, guardian plinths and narrow research galleries cut by a modern excavation. Make it feel manufactured from stone-metal, bone-white ceramic, oxidized bronze and phase crystal, with a newly invented non-linguistic relief system. Do not make UGA corridors painted dark, generic fantasy ruins or franchise-style alien glyphs. Preserve compact combined-arms routes, cover and objective state changes at RTS/phone viewing distances.

## Measured layout and gameplay envelope

- Envelope **192 × 160 m**, **4 m grid**, **1 unit = 1 m**, **0.5 m nav cell**.
- `processional_vehicle_route`: P/L/V through **18 × 8 m** apertures.
- `research_gallery_flanks`: P-only, minimum **3 m**.
- `automation_portal_graph`: explicit locked/open/failed portals for P/L; never infer state from animation.
- `LZ_VAULT_APERTURE`: **40 × 32 m**, P/L/V. `LZ_COLLAPSED_GALLERY`: **32 × 28 m**, P/L.
- Plinths and relief walls have declared LOS/projectile behavior. Preserve an extraction route during every state transition.
- Exclude medium mechs and TITAN.

## Hero and modular model set

Create hero LOD families for `ossuary_phase_engine`, `ossuary_vault_aperture_iris`, `ossuary_processional_arch`, `ossuary_guardian_plinth`, `ossuary_sarcophagus_bank`, `ossuary_collapsed_gallery`, `ossuary_artifact_cradle`, `ossuary_phase_conduit`, `ossuary_sealed_lift`, `ossuary_sentinel_gate`, and `ossuary_relief_wall`.

Build 4 m processional floor/wall straight/corner/T/end pieces; 18 × 8 vehicle apertures; 3 m research galleries; iris leaves and portal-state frames; excavation braces; artifact rails; class-aware mineral rubble; modular relief panels; conduit junctions; roof/occluder groups. Ancient silhouettes, relief language, phase materials, engine and aperture choreography remain Ossuary-only.

## 2K PBR material and decal set

Author five aligned seamless **2048²** families:

1. `ossuary_ancient_stone_metal` — dense manufactured mineral-metal with subtle machining and age layers.
2. `ossuary_phase_crystal` — translucent/refractive-looking crystal represented with standards-safe PBR and restrained emissive core.
3. `ossuary_bone_white_ceramic` — pale hard ceramic, distinct from biological bone.
4. `ossuary_oxidized_bronze` — aged conductive bands and fittings.
5. `ossuary_sealed_mineral_dust` — localized excavation/dormancy overlay with no baked light.

Deliver BaseColor, tangent Normal, ORM, optional Height/Emissive. Produce 16 original decal/mask entries: consistent non-linguistic relief motifs, phase-flow indicators, excavation grids, lockdown/collapse warnings, Syndicate extraction, Dominion denial and artifact-objective overlays. Do not use any known alphabet or copied “alien” glyph.

## State set

- `dormant_sealed`: cleanest ancient state beneath contained dust; no Brood infestation.
- `automation_awake`: indexed iris/portal geometry, active phase paths and declared blocker changes.
- `gallery_collapse`: authored class-specific rubble preserving extraction.
- `phase_engine_extraction`: objective cradle opened/removed while the engine state remains visually legible.

The phase engine is an objective state machine, never generic debris.

## Technical construction contract

- Author Y-up/-Z-forward at 1 m; normalize candidate to Z-up/+Y-forward; site origin at floor datum.
- Apply transforms, triangles only; no negative scale, cameras/lights, hidden duplicates, unsupported procedural shaders or embedded references.
- UV0+tangents required; consistent texel density, padded atlas islands and explicit alpha modes for crystal/decals.
- Grid modules pivot at floor contact; iris leaves on true hinge/slide axes; artifact cradle and lift on physical movement axes.
- Required names: `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_OSSUARY_PHASE_ENGINE`, `LZ_VAULT_APERTURE`, `LZ_COLLAPSED_GALLERY`, `EXTRACT_`, `HAZARD_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Separate simple watertight collision, nav, LOS, shot and cover proxies; collision remains stable across visual LODs.
- Authored LOD1 ≤ **40%**, LOD2 ≤ **12%** of LOD0; preserve iris, engine, arches, relief silhouette and all route openings.
- Export editable source and standards-bound GLB candidate with stable materials, source-link, `intake.json` and provenance.

## Spline execution sequence

1. Create measured processional, gallery, portal-state, LZ and objective guides.
2. Greybox the aperture-to-engine route and redundant extraction before detail.
3. Model phase engine, iris, arches, plinths, cradle and sentinel hero families.
4. Build processional/gallery/relief/conduit/rubble modular kits and snap-test alternate assemblies.
5. Add separate gameplay proxies and all four deterministic state groups.
6. Bind five PBR sets; apply original relief and excavation decals by ownership.
7. Author LODs and phone-scale tactical roof/occluder behavior.
8. Export source/candidate package; do not claim runtime completion.

## Acceptance checks

- Processional route, iris and phase engine create a unique ancient identity.
- Exact route/LZ sizes and portal states are measurable and class-correct.
- Eleven heroes, necessary junctions, five 2K sets and 16 original decals exist.
- Gallery collapse and engine extraction preserve legal egress.
- No copied glyphs, generic UGA surfaces or dense render collision.
- Phone captures keep objective, route split and portal state readable.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II are references only for composition, scale, cover and environmental storytelling. Their ruins, glyphs, technology, layouts, textures, decals, props, logos and factions may not be copied, traced or used as provenance.
