# Spline 3D Production Prompt — NEXUS-VII Logistics & Cargo

Status: source-only authoring guide; not runtime evidence.  
District ID: `logistics` · Deck C.  
Authority: material/decal manifest, construction catalog, approved Deck-C concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for NEXUS-VII Logistics & Cargo. Build a high-throughput cargo-city district, distinct from the Strike Bay: multi-level storage racks, freight streets, automated sorter lanes, pallet courts, probe/fuel/sample segregation, cryogenic holds, drone/forklift exclusion routes, cargo control tower, loading bridges, service grates and undercroft, and direct freight links to Fabrication, Habitat, and the Strike Bay. Show how material enters, is classified, stored, and dispatched in one readable top-down composition.

Tier 1 contains the cargo intake, general stores, sorter, probe/fuel/sample zones, inventory control, and safe circulation. Tier 2 alternatives: Salvage Sorting uses reinforced tip tables, robotic material classifiers, magnetic separation conveyors, and marked output bins; Probe Magazine uses protected vertical probe racks, cartridge handling arms, charging/service cradles, and blast-separated storage. Tier 3 alternatives: Deep Stores uses a tall multi-level high-bay with lift aisles, cryogenic modules, and protected reserve vaults; Autonomous Resupply uses a closed-loop robotic pick/pack/dispatch line, overhead shuttle rails, fuel/probe service nodes, and two-direction freight flow. Only selected alternatives appear. Include empty foundation, frame, machinery-install, completed, power-paused, and amber retrofit-lockout states.

Use S06 heavy-duty deck, S07 service grate, S08 machinery toolsteel, S12 cargo polymer, T03 services, T06 transit, and T08 industrial trim. Use A00/A03/A05/A07 and causal A06 at wheel tracks, cargo scrapes, hydraulics, handled rails, and loading edges. Required markings: freight arrows, cargo bay IDs, pallet grids, mass limits, cryogenic warnings, probe/fuel/sample symbols, sorter/drone/forklift exclusion, container ownership/status bands, emergency lanes, and static cargo inventory. Use faction ownership bands sparingly only on cargo props that require them; do not turn Logistics into the Embassy or Hangar.

Emissive texture input comes from sorter status, rack identifiers, safe-route indicators, cold-store status, and displays. No glowing cargo, halo geometry, luminous floor field, all-white signs, or baked lighting. Keep heavy floor, grate, machinery, cargo polymer, structure, transit, display, and decal materials separate. Exterior uga-hull is forbidden inside. Do not make a random crate pile, generic cubes, a generic warehouse, flat empty slab, hangar recolor, decorative conveyor to nowhere, inaccessible shelf maze, or duplicated identical storage towers.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; personnel door 1.25 x 2.4 m; freight door 4.0 x 3.8 m; primary freight lane 4–5 m; two-way vehicle passing court 8 m; pedestrian lane 1.8 m with barrier; rack service aisle 1.2 m; rail 1.1 m; public ramps ≤1:12. Author UV0, optional UV1, tangents, conveyor/lift/door pivots, hidden collision, and LOD0/1/2. Export GLB without camera, environment, scripts, unsupported procedural materials, or loose meshes.
```

## Required hierarchy

- `DISTRICT_logistics`, shell/core/expansion LOD groups.
- `LIFT_logistics_fabricator`, `TRANSIT_logistics_habitat`, `FREIGHT_logistics_hangar`.
- `FACILITY_logistics_t2_salvage_sorting`, `FACILITY_logistics_t2_probe_magazine`.
- `FACILITY_logistics_t3_deep_stores`, `FACILITY_logistics_t3_autonomous_resupply`.
- Every facility has `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, and `STAGE_retrofit_lockout`.
- Modular rack, container, cryo module, probe cradle, sorter, conveyor, lift, control tower, drone dock, barrier, and service-grate parts.
- Batched A00/A03/A05/A07 and A06; collision and focus/build/freight/animation anchors.

## Contract IDs

Active: S06 heavy deck; S07 service grate; S08 machinery; S12 cargo polymer; T03 services; T06 transit; T08 industrial; A00 core; A03 Deck C; A05 construction; A07 display; A06 wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 universal; A01 Deck A; A02 Deck B; A03 Deck C; A04 factions; A05 construction; A06 wear; A07 display.

## Production gates

- Phone LOD2 keeps high-bay rack skyline, cargo control tower, sorter/probe alternative, freight crossroad, three district links, and Tier-3 mass.
- Focus budget ≤200k triangles LOD0 / 82k LOD1 / 27k LOD2; repeated racks/containers must be instancing-safe.
- Salvage Sorting versus Probe Magazine and Deep Stores versus Autonomous Resupply differ in machinery, section, and flow, not color.
- Every conveyor begins and ends at real intake, process, storage, or dispatch equipment. Maintain unbroken freight and pedestrian routes.
- Collision blocks rack volumes and machinery but retains all service approaches and vehicle turning courts.
- Deterministic container variants only; no random rotations or ownership colors. A06 wear follows traffic maps.

## Rejection conditions

Reject a random crate pile, generic warehouse, empty box, Hangar copy, flat cargo grid, exterior-hull interior, or facility that cannot explain its input/output path in one top-down view.
