# Spline 3D Production Prompt — NEXUS-VII Coalition Embassy

Status: source-only authoring guide; not runtime evidence.  
District ID: `factions` · Deck C.  
Authority: material/decal manifest, construction catalog, approved Deck-C concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for the NEXUS-VII Coalition Embassy. Build a believable diplomatic city district inside the ship, not a single conference room: a central Accord rotunda, three architecturally related but distinct resident delegation towers for Nova, Dominion, and Syndicate, a public trade promenade, reception/security thresholds, consular offices, shared council route, diplomatic archive, civic plazas with useful circulation, and glass pressure tunnels to Habitat and the Strike/Expedition Bay. The UGA is the institutional host. The Brood is an enemy only and must have no embassy, ownership mark, resident space, or humanoid representation.

Tier 1 is a Resident Enclave with one active delegation tower, shared reception, security, and public route. Tier 2 alternatives: Diplomatic Forum expands the public circular debate chamber and faction liaison balconies; Readiness Office adds a compact operational recovery/coordination annex with secure briefing booths and personnel-status stations. Tier 3 alternatives: Accord Council creates a formal multi-level council rotunda with three equal delegation approaches; Joint Command creates a protected shared mission-coordination suite linked toward the Strike Bay while remaining visibly diplomatic, not a weapons room. Only selected facilities appear. Include empty foundation, structural frame, machinery-install, completed, power-paused, and amber retrofit-lockout groups.

Use S04/S05 clean and transit decks, S10 civic composite, S15 pressure glazing, S16 transit glazing, bronze variant T07, and original A04 faction insets. Use A00/A03/A04/A05/A07 and sparse A06 at public routes, handrails, and cleaned glazing. Place Accord seal, delegation IDs, consular/security boundaries, public/restricted routes, trade promenade, reception, council route/chamber, diplomatic archive, accessibility/egress, Tier and facility marks, plus a static faction-standing board without live numbers. Faction identity uses limited crests, lane stripes, material insets, and furnishings—not three unrelated art styles or solid faction-color buildings.

Use faint texture-driven occupancy glow in windows, restrained bronze/cyan route and status emission, and display emission only. No halo geometry, billboard banners, giant neon crests, all-white windows, or baked illumination. Floor, wall, civic facade, glazing, transit, furniture, machinery, and decals stay separate. Never assign exterior uga-hull inside. Do not use generic cubes, identical delegation towers, a flat tiled room, a throne room, weapons, or copied faction/logo art.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; public doors 1.4 x 2.4 m; secure doors 1.25 x 2.4 m; promenade 3.6–4.5 m; secondary corridor 2.4 m; council seating clearance 1.1 m; rails 1.1 m; accessible ramps ≤1:12. Author UV0, optional UV1, tangents, correct pivots, collision, and LOD0/1/2. Export clean GLB without cameras, environment, scripts, unsupported procedural materials, or loose meshes.
```

## Required hierarchy

- `DISTRICT_factions`, shell/core/expansion LOD groups.
- `TRANSIT_factions_habitat`, `TRANSIT_factions_hangar`, both physically sealed glass-pressure routes with T06-compatible frames.
- `TOWER_factions_nova`, `TOWER_factions_dominion`, `TOWER_factions_syndicate`: same ship kit, distinct silhouette/insets; never Brood.
- `FACILITY_factions_t2_diplomatic_forum`, `FACILITY_factions_t2_readiness_office`.
- `FACILITY_factions_t3_accord_council`, `FACILITY_factions_t3_joint_command`.
- Every facility has `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, and `STAGE_retrofit_lockout`.
- Batched A00/A03/A04/A05/A07 and optional A06; collision and focus/delegation/build/transit anchors.

## Contract IDs

Active: S04 clean deck; S05 transit; S10 civic composite; S15 pressure glazing; S16 transit glazing; T07 civic bronze variant; A00 core; A03 Deck C; A04 original faction identities; A05 construction; A07 display; A06 conditional wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 universal; A01 Deck A; A02 Deck B; A03 Deck C; A04 factions; A05 construction; A06 wear; A07 displays.

## Production gates

- Phone LOD2 retains rotunda, three delegation towers, two glass connectors, public promenade, and selected facility silhouette.
- Focus budget ≤195k triangles LOD0 / 80k LOD1 / 26k LOD2; delegation tower family must share instancing-safe structural parts.
- Nova/Dominion/Syndicate towers differ through crown, entrance, balcony and inset treatment, not mere color; they remain one UGA ship architecture.
- Diplomatic Forum versus Readiness Office and Accord Council versus Joint Command must be readable with decals/emission disabled.
- Public and secure routes are collision-separated but visually understandable. Do not hide the room behind solid perimeter walls in the cutaway camera.
- A04 contains original project identity only; no reference-game logos or copied graphic plates.

## Rejection conditions

Reject a basic room, generic office, throne chamber, row of identical towers, three disconnected faction dioramas, Brood residency, all-hull interior, or room whose main identity is emissive color.
