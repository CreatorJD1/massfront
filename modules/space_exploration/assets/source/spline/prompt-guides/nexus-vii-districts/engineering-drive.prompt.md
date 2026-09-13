# Spline 3D Production Prompt — NEXUS-VII Engineering & Drive

Status: source-only authoring guide; not runtime evidence.  
District ID: `engineering` · Deck B.  
Authority: material/decal manifest, construction catalog, approved Deck-B concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for NEXUS-VII Engineering & Drive. This is the propulsion, power distribution, thermal-management, and ship-service district—not Fabrication and not a weapon room. Build a tall mechanical hall around a protected reactor/service spine, paired fold-drive harmonic assemblies, visible coolant loops, high-current bus channels, pressure-relief trunks, maintenance gantries, breaker galleries, and a vector-link lift toward the Strike Bay. Give it strong vertical machinery and a clear central service route so it reads at tilted top-down phone scale.

Tier 1 provides the drive-service core, primary reactor interfaces, coolant circulation, breaker wall, and maintenance access. Tier 2 alternatives: Reactor Baffles uses layered segmented flux shields around the power spine, with mechanical gaps and inspection bridges; Drive Tuner uses paired calibrated harmonic drums, rail-mounted sensor forks, and a long alignment datum. Tier 3 alternatives: Civilization Grid uses a branching high-current distribution crown and redundant power buses; Thermal Reclaimer uses heat exchangers, condenser fins, recovery turbines, and closed coolant return loops. Only selected facilities are visible. Provide empty foundation, structural frame, machinery-install, completed, power-paused, and amber retrofit-lockout states.

Use S06 heavy deck, S08 machinery toolsteel, S01 structural gunmetal, S11 antislip, T03 services, and T08 industrial trim. Use A00/A02/A05/A07 and localized A06 at coolant, hydraulic, heat, and handrail contacts. Required overlays: high voltage, reactor and magnetic exclusion, coolant flow, pressure relief, drive-harmonic calibration, thermal ceilings, breaker IDs, no-step boundaries, emergency isolation, and a static reactor schematic. Keep floors, structure, machinery, service conduits, safety mats, glazing, and displays separate.

Emissive texture inputs are limited to power status, coolant-flow arrows, inspection lamps, drive calibration, and displays. No glowing reactor shell, no volumetric effect geometry baked into the model, no halo cards, no emissive wall wash, and no illumination baked into base color. Exterior uga-hull is forbidden inside. Avoid generic cubes or cylinders without functional assemblies, random pipes, exposed fantasy energy cores, weapon barrels, flat empty slabs, and machinery that blocks every route.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; personnel door 1.25 x 2.4 m; equipment door 3.6 x 3.2 m; primary service route 3.2 m; maintenance aisle 1.2–1.5 m; gantry clear height 2.2 m; rails 1.1 m; ramps ≤1:12 where public. Author UV0, optional UV1, tangents, functional pivots for turbines/baffles/valves, hidden collision, and LOD0/1/2. Export GLB without cameras, environment, scripts, unsupported procedural materials, or loose meshes.
```

## Required hierarchy

- `DISTRICT_engineering`, `SHELL_engineering_LOD0..2`, Tier core/expansion groups.
- `SERVICE_engineering_fabricator`, `SERVICE_engineering_research`, `LIFT_engineering_hangar`.
- `FACILITY_engineering_t2_reactor_baffles`, `FACILITY_engineering_t2_drive_tuner`.
- `FACILITY_engineering_t3_civilization_grid`, `FACILITY_engineering_t3_thermal_reclaimer`.
- Six stage groups per facility: `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, `STAGE_retrofit_lockout`.
- Hero components: reactor spine, harmonic drum pair, coolant loop, breaker gallery, bus crown, heat exchanger, recovery turbine.
- Batched A00/A02/A05/A07 and optional A06; collision and focus/build/service/animation anchors.

## Contract IDs

Active: S01 structure gunmetal; S06 heavy deck; S08 machinery toolsteel; S11 antislip; T03 services; T08 industrial; A00 universal; A02 Deck B; A05 construction; A07 display; A06 conditional wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 core; A01 Deck A; A02 Deck B; A03 Deck C; A04 faction; A05 construction; A06 wear; A07 static displays.

## Production gates

- Phone LOD2 retains vertical reactor spine, paired drive drums/baffles, coolant loop, grid crown/reclaimer silhouette, and Strike-Bay lift.
- Focus budget ≤190k triangles LOD0 / 78k LOD1 / 25k LOD2; each facility ≤30k.
- Reactor Baffles and Drive Tuner differ structurally; Civilization Grid and Thermal Reclaimer show branching distribution versus closed thermal loop with emissive off.
- Collision preserves one uninterrupted 3.2 m service spine, inspection approaches, and emergency isolation space.
- Pipes must terminate at believable pumps, manifolds, tanks, or machines; label flow direction and avoid decorative spaghetti.
- A06 is causal: coolant mineral trace at joints, heat tint near exhaust/exchanger, rubbed rails at access, no universal dirt.

## Rejection conditions

Reject a generic reactor room, Fabrication copy, exposed magic orb, random pipe maze, weapon-engine room, or exterior hull interior. Reject any option that is only a recolor or whose moving part lacks a valid pivot and clearance envelope.
