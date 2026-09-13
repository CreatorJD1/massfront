# Ossuary Vault — Spline source brief

**Status:** authoring brief only. `veyra_ossuary` has catalog/mission semantics but no playable geometry, navmesh, collision, dedicated texture/decal pack, or runtime evidence. Target asset ID: `gsite_veyra_ossuary_vault_01`; Spline root: `GSITE_VEYRA_OSSUARY`.

## Lore and preset

Ossuary is an ancient subsurface Veyra vault whose automation does not match known construction. “Ossuary Dividend” extracts `ossuary_phase_engine` through `vault_aperture` or `collapsed_gallery`. `preset_veyra_ossuary_relic_vault` needs a wide processional route, narrow research galleries, autonomous apertures, and excavation damage. It must not resemble UGA corridors painted dark with generic “alien” purple light.

## Dedicated modular kit

- Heroes: phase engine, vault-aperture iris, processional arch, guardian plinth, sarcophagus bank, collapsed gallery, artifact cradle, phase conduit, sealed lift, sentinel gate, relief wall.
- Modules: 4 m processional floor/wall grammar, 18 × 8 m vehicle apertures, 3 m galleries, iris leaves, portal-state frames, excavation braces, artifact rails, mineral rubble classes, relief panels, and roof/occluder groups.
- Ancient silhouettes, glyphs, phase materials, objective, and exact aperture choreography remain Ossuary-specific.

## Materials, textures, and decals

Author five original aligned 2K PBR families: ancient stone-metal; phase crystal; bone-white ceramic; oxidized bronze; sealed mineral dust. The 16 decals include original non-linguistic relief motifs and phase-flow glyphs plus excavation grids, lockdown/collapse warnings, Syndicate extraction, Dominion denial, and artifact-objective overlays. No reference alphabet, franchise glyph, or recolored UGA surface is allowed.

## Scale, routes, and landing zones

- Envelope: 192 × 160 m; 4 m grid; 0.5 m nav cell; P/L/V, no M or TITAN.
- `processional_vehicle_route`: P/L/V through an 18 × 8 m aperture. `research_gallery_flanks`: P, 3 m minimum. `automation_portal_graph`: explicit locked/open/failed P/L portals.
- `vault_aperture`: 40 × 32 m, P/L/V. `collapsed_gallery`: 32 × 28 m, P/L.
- Plinths and relief walls are declared LOS/shot blockers; visual automation never silently changes navigation.

## Destruction and gameplay proxies

Author `dormant_sealed`, `automation_awake`, `gallery_collapse`, and `phase_engine_extraction`. The phase engine is an objective state machine, never generic rubble. Gallery collapse must declare class-specific passage and preserve extraction. Use separate `COLL_`, `NAV_`, `PORTAL_`, `LOS_`, `SHOT_`, `OBJ_OSSUARY_PHASE_ENGINE`, `LZ_VAULT_APERTURE`, `LZ_COLLAPSED_GALLERY`, and `DESTRUCT_` nodes.

## LOD, collision, export, and concept gate

Use authored LOD0/1/2, LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserving iris, engine, relief silhouette, and route apertures. Collision is simple, watertight, independent, and invariant across visual LODs. Export applied-transform, UV0/tangent, standards-bound GLB 2.0 PBR at 1 m Spline scale; author Y-up/-Z-forward and normalize to Z-up/+Y-forward.

Final geometry is blocked on an original measured board with the processional plan, portal-state diagram, artifact extraction sequence, relief language, clearance sections, and phone crop. No Spline/model/texture source exists; provenance is unclaimed and runtime remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II are references only for composition, class readability, cover, and environmental storytelling. Their assets, alphabets, motifs, layouts, factions, logos, and props may not be copied, traced, extracted, or used as provenance.
