# Spline 3D Production Prompt — NEXUS-VII Fabrication & Armory

Status: source-only authoring guide; not runtime evidence.  
District ID: `fabricator` · Deck B.  
Authority: material/decal manifest, construction catalog, approved Deck-B concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for NEXUS-VII Fabrication & Armory. Build a dense automated industrial district, distinct from Engineering: parallel forge cells, robotic fabrication islands, overhead gantry cranes, alloy-feed trenches, precision machine bays, armory and mod racks, inspection stations, repair benches, and a heavy freight connector to Logistics. Use a layered factory-city composition with upper maintenance catwalks, service undercroft, visible material flow, and clear safe walking lanes. It fabricates ship modules, probes, equipment, and ground-operation gear; it is not a space-weapons battery.

Tier 1 contains a functional fabrication core, two forge cells, armory racks, repair station, and cargo interface. Tier 2 alternatives: Precision Forge uses enclosed clean machining cells, metrology arches, and isolated component trays; Rapid Tooling uses a reconfigurable rail-mounted tool line, quick-change heads, and an obvious fast transfer loop. Tier 3 alternatives: Megaship Yards uses a tall multi-bay assembly frame, heavy overhead crane, and large module cradle; Reclamation Works uses a disassembly carousel, sorter chutes, salvage bins, and material-return conveyors. Only selected alternatives appear. Provide empty utility foundation, structural frame, machinery installation, completed, power-paused, and amber retrofit-lockout groups.

Use S06 heavy-duty deck, S08 machinery toolsteel, S11 rubber antislip, S12 cargo polymer, T03 services, and T08 industrial trim. Use A00/A02/A05/A07 and A06 only at functional heat, trolley, oil, tie-down, and repair contacts. Place forge-cell numbers, hot-surface and laser zones, robotic sweep envelopes, crane load limits, alloy-feed arrows, armory/rack IDs, inspection status, welding/repair patches, emergency routes, and a static fabrication queue plate. Keep floors, grates, machinery, cargo cases, safety mats, structure, glazing, and decals separate.

Emission is restricted to machine status, laser-safe indicators, queue displays, and narrow work lights; no glowing forge body, no fake bloom shells, no emissive floor covering, and no baked directional light in albedo. Exterior uga-hull is forbidden across the interior. Do not use generic cubes as machines or crates, identical box towers, unsupported floating cranes, random pipes, weapon displays, a featureless flat floor, or tiny details that vanish from a phone view.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; personnel door 1.25 x 2.4 m; freight door 3.6 x 3.2 m; safe aisle 1.5 m; primary logistics route 3.2–4.0 m; machine clearance 1.0 m; guardrails 1.1 m; accessible ramp ≤1:12. Author UV0, optional UV1, tangents, true crane/tool pivots, hidden collision proxies, and LOD0/1/2. Export GLB with shared materials and no cameras, environment, scripts, unsupported procedural materials, or loose meshes.
```

## Required hierarchy

- `DISTRICT_fabricator`, shell/core/expansion LOD groups.
- `TRANSIT_fabricator_research`, `SERVICE_fabricator_engineering`, `LIFT_fabricator_logistics` with a continuous cargo conduit.
- `FACILITY_fabricator_t2_precision_forge`, `FACILITY_fabricator_t2_rapid_tooling`.
- `FACILITY_fabricator_t3_megaship_yards`, `FACILITY_fabricator_t3_reclamation_works`.
- Six stage groups per facility: `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, `STAGE_retrofit_lockout`.
- Modular forge, crane, toolhead, rack, conveyor, inspection, salvage, and cargo-interface props.
- Batched A00/A02/A05/A07 and authored A06 wear; collision and interaction/build/focus anchors.

## Contract IDs

Active: S06 heavy-duty deck; S08 machinery toolsteel; S11 rubber antislip; S12 cargo polymer; T03 services; T08 industrial; A00 core; A02 Deck B; A05 construction; A07 display; A06 role-specific wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 universal; A01 Deck A; A02 Deck B; A03 Deck C; A04 factions; A05 construction; A06 wear; A07 display.

## Production gates

- Phone LOD2 keeps parallel forge rhythm, overhead crane, large assembly/reclamation silhouette, cargo lift, and high-contrast safe routes.
- Focus budget ≤190k triangles LOD0 / 78k LOD1 / 25k LOD2; each alternative ≤30k.
- Precision Forge and Rapid Tooling differ by enclosed metrology cells versus reconfigurable rail line. Megaship Yards and Reclamation Works differ by assembly cradle versus descending sorter/disassembly flow.
- Keep a continuous 3.2 m freight route and 1.5 m pedestrian route. Collision must prevent pathing through machinery and crane exclusion zones.
- Use instancing for repeated racks/crates; introduce deterministic size/door/handle variants rather than random transforms.
- A06 soot and heat tint only near forges; oil only below plausible hydraulics; newly commissioned stage is clean.

## Rejection conditions

Reject a warehouse recolor, Engineering-room copy, gun shop, random cube factory, or dark pipe maze. Reject if material flow cannot be understood from one overhead view or if facilities differ only by signage.
