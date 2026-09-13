# Spline 3D Production Prompt — NEXUS-VII Habitat & Medical

Status: source-only authoring guide; not runtime evidence.  
District ID: `habitat` · Deck C.  
Authority: material/decal manifest, construction catalog, approved Deck-C biodome concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for the NEXUS-VII Habitat & Medical district. It must read as an inhabited compact city layer inside a civilization ship, not a basic room with furniture. Build terraced residential blocks around a central civic garden, a small medical complex with triage and recovery wings, hydroponic planters, public concourses, road-like pedestrian/service lanes, bridges, stairs and accessible ramps, glass pressure tunnels to the Coalition Embassy, a lift toward Logistics, visible life-support trunks, and a bounded utility undercroft. Use a simulated-daylight roof or light wells without exposing an exterior skybox inside the model.

Tier 1 includes essential residence, clinic, life support, sanitation, public circulation, and emergency muster. Tier 2 alternatives: Recovery Ward is a quiet medical terrace with treatment pods, privacy screens, rehabilitation route, and direct clinic access; Civilian Works is a civic construction/maintenance court with modular utility kiosks, workforce muster, and district-expansion service access. Tier 3 alternatives: Trauma Institute is a larger protected surgical and recovery complex with clear sterile/nonsterile zoning; Arcology Workforce is an expanded terraced neighborhood with workshops, childcare/community rooms, gardens, and multiple connected circulation levels. Only selected facilities are visible. Provide empty foundation, structural frame, machinery-install, completed, power-paused, and amber retrofit-lockout states.

Use S04 clean deck, S05 transit deck, S10 civic composite, S13 biophilic resin, S09 medical ceramic, S18 upholstery/acoustic, T06 transit, and T07 civic trim. Use A00/A03/A05/A07 and causal A06 at trolley routes, handrails, planters, and cleaned medical surfaces. Required overlays: residence block numbers, pedestrian route, clinic/triage/recovery, botanical zone, potable water, sanitation, life-support access, quiet zone, emergency muster, accessibility, and a static census/medical-status plate. Floor, civic wall, medical insert, transit, planter, glazing, upholstery, and machinery materials remain separate.

Emissive texture inputs are limited to warm occupied-window bands, clinic status, route strips, and displays. Windows should emit a faint narrow interior glow through S15/S16-compatible glazing, not a solid white rectangle; no fake halo geometry, giant neon walls, or light baked into albedo. Exterior uga-hull is forbidden on interiors. Do not create generic cubes as apartment towers, a flat tiled box, empty plazas, identical buildings, oversized furniture, random vegetation, or a hospital-only room.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; public doors 1.25 x 2.4 m; corridors 2.4 m minimum; civic promenade 3.2–4.0 m; medical aisle 1.8 m; stair riser 0.17 m; rail 1.1 m; accessible ramps ≤1:12; inhabited blocks generally 4–8 m tall so the cutaway reads as a compact district, not full skyscrapers. Author UV0, optional UV1, tangents, correct pivots, collision, and LOD0/1/2. Export GLB without cameras, environment, scripts, loose meshes, or unsupported procedural materials.
```

## Required hierarchy

- `DISTRICT_habitat`, `SHELL_habitat_LOD0..2`, `CORE_habitat_t1`, Tier expansions.
- `TRANSIT_habitat_factions`: broad civic concourse plus glass pressure tunnel; `LIFT_habitat_logistics`; `SERVICE_habitat_life_support`.
- `FACILITY_habitat_t2_recovery_ward`, `FACILITY_habitat_t2_civilian_works`.
- `FACILITY_habitat_t3_trauma_institute`, `FACILITY_habitat_t3_arcology_workforce`.
- Six stage groups per facility: `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, `STAGE_retrofit_lockout`.
- Modular residence facade, clinic, garden, planter, bridge, stair/ramp, utility kiosk, street furniture, light well, and transit-tunnel components.
- Batched A00/A03/A05/A07 and authored A06; collision and focus/build/route/occupancy anchors.

## Contract IDs

Active: S04 clean deck; S05 transit; S09 clean ceramic; S10 civic composite; S13 biophilic resin; S18 upholstery/acoustic; T06 transit; T07 civic; A00 universal; A03 Deck C; A05 construction; A07 display; A06 function-led wear. Use S15/S16 only where actual pressure glazing/tunnels are modeled.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 core; A01 Deck A; A02 Deck B; A03 Deck C; A04 faction; A05 construction; A06 wear; A07 displays.

## Production gates

- Phone LOD2 keeps three height bands of habitat, central garden, clinic mass, glass connector, public spine, and selected Tier-3 silhouette.
- Focus budget ≤200k triangles LOD0 / 82k LOD1 / 27k LOD2; repeated residence/planter modules must be instancing-safe.
- Recovery Ward versus Civilian Works and Trauma Institute versus Arcology Workforce differ by building program and massing, not tint.
- Reserve at least 30% of plan area for connected circulation/open civic space while avoiding a single empty plaza.
- Collision supports public paths, bridges, stairs/ramps, and facility entrances; inaccessible roof/utility spaces remain blocked.
- Deterministic facade variants: no random placement. Keep room/building/furniture scale consistent with the 1.8 m mannequin.

## Rejection conditions

Reject a basic room, flat pad with props, hospital-only scene, exterior city skyline, repeated cube towers, all-cyan emissive district, or exterior-hull-clad interior. Reject if roads/tunnels do not physically connect buildings.
