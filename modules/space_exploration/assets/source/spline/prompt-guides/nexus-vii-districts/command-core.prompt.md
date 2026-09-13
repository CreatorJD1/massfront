# Spline 3D Production Prompt — NEXUS-VII Command Core

Status: source-only authoring guide; not runtime evidence.  
District ID: `command` · Deck A · fixed Tier 3 command authority.  
Authoritative references: `nexus-vii-material-decal-manifest.json`, `catalog.js`, the approved NEXUS-VII concept set, and the current eleven-district audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment set for the NEXUS-VII Command Core, the civic and strategic heart of a civilization-scale exploration ship. This is a believable district connected to the rest of the ship, not a detached box room. Make it read as a compact command city from a tilted top-down RTS camera: a circular two-level strategy chamber around a central holography dais, a visible radial command spine, stepped operator galleries, pressure-door links to Navigation and Mission Operations, a lift/service trunk to Deck B, a secure Continuity Archive, and a clearly identifiable Classic Modes terminal alcove. Preserve broad circulation lanes and human scale. Use original geometry and graphic language; genre references are for hierarchy and readability only and must not be copied.

Build a shared carrier shell plus replaceable Tier and module groups. Tier 1 shows the lower holotable ring, primary tactical stations, pressure doors, and a functional core. Tier 2 adds upper operations galleries, strategic glass balconies, denser console stations, and the Strategic Nexus identity. Tier 3 adds the Civilization Command crown, continuity-vault entrance, golden apex lighting, executive stations, and a stronger long-distance silhouette without making the space gaudy. Model the Strategic Holography Vault, Continuity Archive, and Classic Modes Terminal as distinct selectable modules. Include empty foundation, structural frame, machinery-install, completed, power-paused, and amber retrofit-lockout groups for every buildable module.

Use the NEXUS-VII interior material contract. Active bases: S04 clean access deck, S02 pressure bulkhead, S01 structure gunmetal, S10 civic composite, and S17 display glass. Active trims: T01 structure, T02 pressure door, T05 console. Active atlases: A00 universal ship identity, A01 Deck-A command identity, A05 construction state, A07 static displays, with A06 wear only where traffic justifies it. Place an authority seal, radial strategy grid, theater sectors, station IDs, continuity-vault signage, Classic Modes signage, evacuation routes, pressure-door IDs, and restrained command amber/cyan status strips. Emissive content must come from texture inputs on screens, indicator strips, and occupied panes; use narrow low-area luminance, no painted halo, no giant glowing walls, no separate fake bloom geometry, and no lighting baked into base color.

Hard requirements: interior floors, walls, transit, glazing, machinery, civic furniture, and displays remain separate material slots; never assign exterior uga-hull to an interior object. Do not make generic cubes, repeated identical towers, floating furniture, a featureless flat floor, or one material over everything. Use authored bevels, believable panel breaks, handrails, doors, stairs/ramps, service access, ceiling rails, and underfloor trunks. The district must remain recognizable with UI hidden and at phone portrait scale.

Set real-world scale to meters, Y-up, floor at y=0, forward toward +Z. Use 1.8 m human references, 1.25 x 2.4 m personnel doors, 2.4 m minimum public corridors, 3.2 m command spine, 1.1 m guardrails, 0.17 m stair risers, and wheelchair-compatible ramps no steeper than 1:12. Author clean UV0 for PBR and trim strips, non-overlapping UV1 when supported, tangents, simple hidden collision proxies, and centered modular pivots on the build anchor. Export GLB with named LOD0/LOD1/LOD2 groups, no cameras, no baked environment, no runtime scripts, no unsupported procedural materials, and no loose objects outside the district root.
```

## Required object set and hierarchy

- `DISTRICT_command`
  - `SHELL_command_LOD0..2`: radial bulkheads, open cutaway edge, pressure frames, ceiling/service rails.
  - `TRANSIT_command_navigation` and `TRANSIT_command_mission_ops`: 3.2 m glazed/pressurized connectors with T02/T06-compatible interfaces.
  - `LIFT_command_deck_b`: visible lift tower and maintenance trunk, not a decorative block.
  - `CORE_command_t1`: central 10–12 m strategy dais, lower holotable ring, six to eight operator positions.
  - `EXPANSION_command_t2`: upper gallery, two strategic balconies, liaison stations.
  - `EXPANSION_command_t3`: crown bridge, continuity-vault threshold, executive overlook.
  - `MODULE_command_holotable`, `MODULE_command_archive`, `MODULE_command_terminal`.
  - `DECAL_command_A00`, `DECAL_command_A01`, `DECAL_command_A05`, `DISPLAY_command_A07` as batched overlay meshes.
  - `COLLISION_command`: simplified walkable deck, stair/ramp, rail, module, and wall proxies.
  - `ANCHOR_FOCUS_command`, `ANCHOR_ENTRY_*`, `ANCHOR_MODULE_*`, `ANCHOR_CAMERA_phone_portrait`.
- Every module root contains `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, and `STAGE_retrofit_lockout`; only one stage is visible at a time.

## Material, trim, and decal contract

Active material allocation:

| Role | Contract |
|---|---|
| Load-bearing ring, columns, vault frame | S01 + T01 |
| Pressure walls, door surrounds | S02 + T02 |
| Access floor and dais steps | S04 |
| Public/executive panels and seating | S10 |
| Holotable, consoles, situation boards | S17 + T05 + A07 |
| Universal markings | A00 |
| Command identity and Tier/module marks | A01 |
| Build/retrofit state | A05 |
| Conditional story wear | A06, sparse and function-led |

Full allowed library vocabulary: S01 structure gunmetal; S02 pressure bulkhead; S03 pressure-door trim; S04 clean deck; S05 transit deck; S06 heavy-duty deck; S07 service grate; S08 machinery toolsteel; S09 clean ceramic; S10 civic composite; S11 rubber antislip; S12 cargo polymer; S13 biophilic resin; S14 containment coating; S15 pressure glazing; S16 transit glazing; S17 display glass; S18 upholstery/acoustic. T01 structure; T02 pressure door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 core; A01 Deck A; A02 Deck B; A03 Deck C; A04 factions; A05 construction; A06 wear/story; A07 static displays. Do not silently substitute inactive IDs.

## Modeling and export gates

- Keep a strong concentric silhouette at 430×932 phone portrait: dais, upper gallery, vault crown, and two connector mouths must survive LOD2.
- Target focused-room visible geometry: ≤180k triangles at LOD0, ≤75k at LOD1, ≤24k at LOD2; each module ≤28k at LOD0. Prefer silhouette and bevel normals over tiny geometry.
- Use deterministic component variants. No random placement, mirrored text, stretched decals, overlapping coplanar stickers, or unique material per prop.
- Batch hard decals by atlas/material; use alpha test for paint and transparent blending only for display/glass transfer. Keep no more than four decal/display batches in the focused district.
- Pivots: district at carrier anchor; modules at floor-center of their authored plot; doors at hinge/slide origin; rotating holotable elements at their true axis.
- Collision meshes use `_COLLIDER` suffix and must exclude rail gaps narrower than the player-selection tolerance.
- LOD1 keeps all routes, hero silhouette, doors, Tier identity, and large signs. LOD2 may merge furniture but must keep the dais, crown, connectors, lift, and module footprints.
- Deliver editable Spline source plus GLB export and a manifest listing object names, triangle counts, material IDs, dimensions, pivots, and stage visibility.

## Rejection conditions

Reject if the result resembles a basic conference room, a row of identical boxes, a detached diorama, a dark empty shell, or an exterior hull interior. Reject if the only Tier change is color, if windows/screens glow uniformly, if navigation paths are blocked, or if the room cannot be identified without its UI label.

