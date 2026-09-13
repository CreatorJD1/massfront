# Spline 3D Production Prompt — NEXUS-VII Strike & Expedition Bay

Status: source-only authoring guide; not runtime evidence.  
District ID: `hangar` · Deck C.  
Authority: material/decal manifest, construction catalog, approved shared Base Deployer v2 concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for the NEXUS-VII Strike & Expedition Bay. This is one integrated hangar for the Base Deployer air unit, Striker ground teams, commander and specialists, starting vehicles/structures, support cargo, equipment mods, and mission landing preparation. It supports planetary ground operations only; no ship-to-ship combat or space-weapons infrastructure. Build a large central Base Deployer landing/service pad, a real aircraft ramp and lift clearance, road-like taxi lanes, striker muster lanes, commander/specialist ready boxes, sized vehicle and structure-staging pads, HQ transformation service racks, equipment/mod lockers, medevac zone, cargo interface, overhead service gantries, glass pressure connector, and utility undercroft.

Tier 1 has the Base Deployer pad, basic Striker muster, equipment racks, and launch/service route. Tier 2 alternatives: Support Bay adds two clearly sized deployment staging lanes, service cranes, support-package racks, and vehicle access; Medevac Cradle adds a protected medical landing alcove, triage transfer line, recovery pods, and unobstructed emergency route. Tier 3 alternatives: Heavy-Lift Complex adds a tall reinforced lift frame, large starting-structure cradles, wide cargo gates, and expanded vehicle lanes; Rapid Turnaround adds parallel service pits, quick-change rack carousels, refuel/service arms, and separate ingress/egress flow. Only selected facilities appear. Include empty foundation, frame, machinery-install, completed, power-paused, and amber retrofit-lockout stages.

Use S06 heavy-duty deck, S08 machinery toolsteel, S11 rubber antislip, S12 cargo polymer, S15 pressure glazing, T03 services, T06 transit, and T08 industrial trim. Use A00/A03/A04/A05/A07 and strongly causal A06 at tires, tie-downs, ramps, hydraulic points, service pits, and intake/exhaust boundaries. Required markings: pad perimeter, taxi centerline, deck grid, tie-down points, no-step arcs, intake/blast boundaries, Base Deployer silhouette/alignment, Striker muster, commander/specialist boxes, medevac, clearance/mass limits, faction equipment ownership, emergency routes, and static Strike Team manifest.

Emissive maps only for pad guidance, status strips, occupied glazing, service indicators, and displays. No glowing floor disk, halo geometry, flat force-field rings, giant neon walls, or illumination baked into albedo. Maintain separate floor, antislip, machinery, cargo, glazing, structure, decal, and display materials. Never apply exterior uga-hull to the interior. Do not model generic cubes as vehicles/cargo, tiny aircraft, random weapon racks, detached rooms, impossible ramp grades, flat empty pads, or a soldiers-only scale.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; Base Deployer envelope authored from its approved reference and never scaled to fit after modeling; light vehicle gate 4.0 x 3.2 m minimum; heavy service gate 6.0 x 5.0 m; primary taxi lane 8–10 m; pedestrian route 1.8–2.4 m with barriers; maintenance clearance 1.2 m; guardrails 1.1 m; personnel ramps ≤1:12 and aircraft ramp within vehicle specification. Author UV0, optional UV1, tangents, functional pivots for doors/lifts/arms, hidden collision, and LOD0/1/2. Export GLB without camera/environment/scripts/unsupported procedural materials or loose meshes.
```

## Required hierarchy

- `DISTRICT_hangar`, shell/core/expansion LOD groups.
- `TRANSIT_hangar_factions`, `LIFT_hangar_engineering`, `FREIGHT_hangar_logistics`.
- `PAD_base_deployer`, `LANE_striker_muster_*`, `PAD_vehicle_*`, `PAD_structure_*`, `ZONE_commander_specialist`, `RACK_hq_transformation_*`.
- `FACILITY_hangar_t2_support_bay`, `FACILITY_hangar_t2_medevac_cradle`.
- `FACILITY_hangar_t3_heavy_lift_complex`, `FACILITY_hangar_t3_rapid_turnaround`.
- Every facility has `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, and `STAGE_retrofit_lockout`.
- Batched A00/A03/A04/A05/A07 and authored A06; walk, vehicle, aircraft-clearance, and machine collision proxies; focus/build/animation/route anchors.

## Contract IDs

Active: S06 heavy deck; S08 machinery; S11 antislip; S12 cargo polymer; S15 pressure glazing; T03 services; T06 transit; T08 industrial; A00 universal; A03 Deck C; A04 faction; A05 construction; A07 display; A06 wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 core; A01 Deck A; A02 Deck B; A03 Deck C; A04 faction; A05 construction; A06 wear; A07 static displays.

## Production gates

- Phone LOD2 retains Base Deployer pad/aircraft silhouette, two muster lanes, overhead service frame, medevac/support alternative, freight gate, and glass connector.
- Focus budget excluding Base Deployer vehicle: ≤210k triangles LOD0 / 86k LOD1 / 28k LOD2; each facility ≤32k.
- Support Bay versus Medevac and Heavy Lift versus Rapid Turnaround must differ by route, volume, and machinery with all emissive disabled.
- Validate vehicle envelopes, door/lift travel, overhead clearances, and uninterrupted emergency/pedestrian paths. Collision must not reduce pad usability.
- Decals follow world scale and tire/service logic; no uniform grime or random scorch.
- LOD2 keeps pad boundaries, route colors/shapes, facility masses, and aircraft clearance; small lockers may merge.

## Rejection conditions

Reject a soldiers-only armory, tiny aircraft room, empty glowing pad, exterior carrier deck, random cube cargo scene, weapons bay, or Hangar/Logistics recolor. Reject if the Base Deployer and Strikers are placed in separate unrelated rooms.
