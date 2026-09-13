# MASSFRONT Interior Tactical Model Packs V1

## Purpose

This is the first production specification for interior XS and SMALL tactical maps. It is deliberately not an infantry-only kit. Every authored map has:

- A continuous mixed-mobility route for infantry, one small vehicle, and one mech.
- Optional 4 m personnel branches for flanking, consoles, rescue rooms, and short cuts.
- 8 m structural modules for vehicle and mech circulation, objectives, turns, and extraction.
- Authored deterministic damage states, cover transitions, collision, and navigation.

The machine-readable source is [interior-tactical-model-packs.v1.json](./interior-tactical-model-packs.v1.json). Its validation contract is [interior-tactical-model-packs.v1.schema.json](./interior-tactical-model-packs.v1.schema.json). These files are source-authoring data only. Nothing in this specification is runtime-ready.

## Scale and Grid Contract

| Item | Exact contract |
|---|---|
| World unit | 1 unit = 1 meter |
| Up / forward | +Y / +Z |
| Pivot | Floor center |
| Detail snap | 0.5 m |
| Structural snap | 4 m |
| Vertical snap | 4 m |
| Personnel module | 4 m opening, 3.2 m clear width, 3.2 m clear height |
| Mixed module | 8 m opening, 6.4 m clear width, 5.8 m clear height |
| Small vehicle envelope | 3.2 m wide, 2.6 m high, 5.5 m long; 7 m turning diameter |
| Mech envelope | 5.5 m wide, 5.4 m high, 4.5 m long; 9 m turning diameter |

The 4 m modules are tactical enrichment, not the primary route. A mission fails layout review if its objective or extraction can only be reached through a 4 m personnel socket.

## First-Wave Packs

| Pack | Faction / owner | Planet and locations | Tactical identity |
|---|---|---|---|
| `interior_uga_nexus_vii_strike_logistics_v1` | UGA | NEXUS-VII Strike Bay, Logistics, Mission Operations | Expedition staging, cargo recovery, base-deployer sabotage, medical evacuation |
| `interior_nova_aelos_caldris_customs_v1` | Nova | Aelos; Caldris, Capital Circumference, Harbor Command | Orbital customs, hostage rescue, contraband interdiction, civilian evacuation |
| `interior_dominion_pyraeth_mech_foundry_v1` | Dominion | Pyraeth; Mech Foundry, Dome Arcology, Orbital Aprons | Heavy mech assembly, foundry sabotage, reactor shutdown, worker extraction |
| `interior_syndicate_nordhall_reactor_vault_v1` | Syndicate | Nordhall; Reactor Rift, Frontline Shelf, Orbital Weather | Data theft, drone control, reactor stabilization, stealth infiltration |
| `interior_neutral_veyra_orison_derelict_v1` | Faction-neutral | Veyra; Orison Derelict, Lensing Observatory, Ossuary Vault | Derelict salvage, relic recovery, ancient observatory reactivation |
| `interior_brood_karak_meridian_breach_v1` | Hostile Brood | Karak; Meridian Colony, Transit Spine, Primary Hive | Colony rescue, infestation purge, hive-sample recovery; Brood remains non-playable and nonhumanoid |

Each pack specifies 15 individual Hunyuan targets:

1. 4×4 room.
2. 8×8 mixed-mobility room.
3. 4×8 straight personnel corridor.
4. 4×4 personnel corner.
5. 8×8 mixed corridor.
6. 8×8 mixed junction.
7. 8×8 vertical link.
8. 4×4 personnel door.
9. 8×6 vehicle/mech gate.
10. 2 m destructible half cover.
11. 4 m destructible full cover.
12. 3 m interactive console.
13. 4 m objective machine.
14. 8 m location landmark.
15. 8 m authored damage shell.

This gives the first wave 90 named source targets before variants or damage-state children.

## Hunyuan Generation Method

Generate one object at a time. Do not ask Hunyuan to generate an entire level, a contact sheet as geometry, or a combined model pack. A combined result cannot reliably meet pivots, socket planes, collision, nav, or independent LOD requirements.

Build each request as:

```text
<pack.hunyuanPromptBase>

Asset: <member.displayName>
Exact envelope: <member.sizeMeters> meters, X width / Y height / Z depth.
Purpose: <member.gameplayRole>
Form intent: <member.hunyuanPromptIntent>
Hard requirements: isolated single object, floor-center pivot, +Y up, +Z forward,
socket faces planar and undecorated within 0.25 m of the edge, no geometry outside
the exact envelope, separate major material regions, no baked lighting.

Avoid: <pack.hunyuanNegativePrompt>
```

The high-level references are strategic silhouette clarity, modular construction, legible material grouping, and tactical cover readability associated with *Supreme Commander 2*, *Command & Conquer 3*, *StarCraft II*, and *XCOM 2*. They are not prompts to reproduce a building, logo, unit, texture, or identifiable prop from those games.

### Required AI-output handling

1. Preserve the raw Hunyuan source with generation ID, exact prompt, date, generator version, source hash, and preview capture.
2. Normalize scale and pivot without changing socket locations.
3. Remove cameras, lights, hidden helpers, duplicate shells, floating fragments, and baked ground.
4. Retopologize to the archetype LOD0 cap. Raw Hunyuan topology is never considered a runtime LOD.
5. Build LOD1 and LOD2 from the approved silhouette, preserving socket planes and gameplay openings.
6. Author primitive or convex-compound collision separately from the render mesh.
7. Author intact, damaged, and destroyed state roots where required. Damage is an explicit state swap, not a random fracture at runtime.
8. Validate the module inside a 4 m / 8 m socket assembly before any map integration.

## XS and SMALL Map Rules

### XS Breach — 40×40 m

- Supports one small vehicle or one mech plus infantry.
- Uses a continuous 8 m route from insertion through objective to extraction.
- Includes at least one personnel flank between two mixed-route nodes.
- Provides two 9 m turning pockets.
- Avoids any uninterrupted combat lane longer than 24 m.

### XS Linear — 48×32 m

- Uses an 8 m mixed spine with a turning pocket at both ends.
- Uses two personnel branches to avoid a corridor shooting gallery.
- Places the objective landmark off the route center so it does not become an accidental mech blocker.

### SMALL Loop — 64×64 m

- Uses an 8 m circulation loop with four turning pockets.
- Adds at least three infantry shortcuts.
- Keeps two approaches to every primary objective.
- Provides enough floor area for one small vehicle and one mech to pass or disengage without stacking.

### SMALL Multilevel — 80×64 m

- Uses one authored 4 m vertical step between levels.
- Provides a 6.4 m-wide, maximum-12-degree ramp or explicit vehicle/mech lift.
- Provides a separate infantry route so a disabled lift never makes the mission unwinnable.
- Requires cutaway masks for roofs and upper walls so the tactical camera never loses the selected squad or objective.

## Damage, Cover, Collision, and Navigation

- **Cover:** Half and full cover have intact, damaged, and destroyed roots. Their collision changes at the same deterministic tick as their visual state. Cosmetic fragments never become navigation authority.
- **Doors:** Personnel doors and mixed gates have closed, opening/open, jammed, and destroyed states. The open state has no invisible collision. A jammed gate declares its remaining measured clearance.
- **Rooms and corridors:** Decorative ribs, conduits, furniture, ice, roots, and infestation membrane stay outside their required clear route.
- **Landmarks:** Landmarks occupy one 8 m cell but keep authored circulation around the base. They must remain recognizable at LOD2 and from phone tactical zoom.
- **Damage shells:** Broken modules use a small number of large, deterministic debris islands. They retain at least one full 6.4 m route and never rely on random rubble placement.
- **Navigation:** Navigation data derives from authored clearance and simplified collision, never directly from the Hunyuan render mesh.

## LOD and Runtime Budgets

Per-asset triangle budgets are in the JSON archetypes. Additional assembled-map gates are:

- XS: at most 180,000 visible LOD0 triangles and 90 draw calls before batching.
- SMALL: at most 320,000 visible LOD0 triangles and 140 draw calls before batching.
- LOD1 and LOD2 preserve the exterior silhouette, portal aperture, objective interaction face, and all socket planes.
- Shared materials are packed by kit; unique materials are reserved for the landmark and mission objective.
- Emissive details remain restrained and do not replace readable albedo/roughness structure.

## Planned Source Naming and Layout

The eventual generated assets should use this structure; this document does not create or integrate these paths:

```text
source-media/models/interiors/<pack-id>/<asset-id>/
  source/<asset-id>_hunyuan_source.glb
  concept/<asset-id>_concept.png
  processed/<asset-id>_lod0.glb
  processed/<asset-id>_lod1.glb
  processed/<asset-id>_lod2.glb
  collision/<asset-id>_collision.glb
  evidence/<asset-id>_socket.png
  evidence/<asset-id>_lod_compare.png
  provenance.json
```

Runtime paths must be generated from an approved allowlist. Source masters and evidence remain outside the player package.

## Approval Sequence

1. Generate and preserve the source asset.
2. Compare it with the approved concept and pack identity.
3. Reject incoherent silhouettes, accidental copied motifs, route obstructions, or incorrect dimensions.
4. Normalize, retopologize, create LODs, collision, and damage states.
5. Assemble straight, rotated, corner, T, and loop socket tests.
6. Run infantry, small-vehicle, and mech traversal probes.
7. Build one XS and one SMALL map using the same pack.
8. Capture phone portrait and landscape at tactical and close zoom.
9. Approve only when visual, collision, nav, performance, provenance, and package evidence all pass.

Until all nine steps pass, the catalog remains `PLANNED` and `runtimeReady: false`.
