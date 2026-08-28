# Spline 3D Production Prompt — NEXUS-VII Research Directorate

Status: source-only authoring guide; not runtime evidence.  
District ID: `research` · Deck B.  
Authority: material/decal manifest, construction catalog, approved Deck-B concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for the NEXUS-VII Research Directorate. Build a multilevel science district that transforms survey discoveries into applied research. It must read differently from the Survey Lab: use clean laboratory terraces, visible project bays, gravitic test cells, xenology sample processing, a decontamination vestibule, controlled Brood-containment infrastructure, a central research forum, and a lift/pressure connection to Survey above plus fabrication and engineering service links. The Brood is a nonplayable nonhumanoid enemy and appears only as securely contained scientific evidence, never as a resident faction or decorative ownership theme.

Tier 1 is a functioning general research core with clean benches, project bays, sample intake, decon, and a shared data forum. Tier 2 alternatives: Gravitic Computation is an open concentric instrument with suspended field rings, isolated vibration plinths, and calculation stations; Xenology Directorate is a sealed suite of specimen airlocks, articulated isolation pods, and clean observation windows. Tier 3 alternatives: Frontier Institute is an expanded two-level research forum with multiple discipline bays and a tall computation crown; Containment Institute is a heavily partitioned pressure-within-pressure laboratory with a robotic transfer spine and no exposed biological material. Only the selected alternatives are visible. Provide empty foundation, frame, machinery-install, completed, power-paused, and amber retrofit-lockout groups for each facility.

Use S04 clean access deck, S09 clean ceramic, S14 containment coating in bounded zones, S15 pressure glazing, S17 display glass, T03 services, T04 facility, and T05 console. Use A00/A02/A05/A07 plus highly restrained A06 in service and decon zones. Place clean-zone thresholds, specimen IDs, xenology and containment warnings, decon route, gravitic calibration, restricted Brood-containment warning, project-bay numbers, pressure status, and a static sample readout. Maintain visible material boundaries between clean science, containment, public forum, glazing, machinery, and service areas.

Emissive maps drive instrument indicators, field-ring calibration marks, pane occupancy, and screens. Use faint narrow emissive inputs with physically plausible source locations; no bloom meshes, no wall-sized neon, no biological glow across clean surfaces, and no light baked into base color. Exterior uga-hull is forbidden on interior floors, walls, labs, furniture, crowns, and containment shells. Avoid generic cubes, aquarium-like monster tanks, fantasy magic rings, repeated identical lab pods, featureless flat deck, or copied interface graphics.

Use meters, Y-up, floor y=0, +Z forward. Human 1.8 m; pressure doors 1.25 x 2.4 m; public corridors 2.4 m; clean lab aisles 1.5 m; decon airlock 2.4 x 3.0 m minimum; rails 1.1 m; ramps ≤1:12. Author UV0, optional UV1, tangents, correct pivots, simple collision, and LOD0/1/2. Export GLB without cameras, environment, scripts, unsupported procedural materials, or loose meshes.
```

## Required hierarchy

- `DISTRICT_research`, `SHELL_research_LOD0..2`, `CORE_research_t1`, Tier 2/3 expansions.
- `LIFT_research_survey`, `TRANSIT_research_fabricator`, `SERVICE_research_engineering`.
- `FACILITY_research_t2_gravitic_computation`, `FACILITY_research_t2_xenology_directorate`.
- `FACILITY_research_t3_frontier_institute`, `FACILITY_research_t3_containment_institute`.
- Each facility: `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, `STAGE_retrofit_lockout`.
- Hero props: gravitic ring, project-bay frame, sample airlock, decon arch, containment transfer arm, research forum.
- Batched A00/A02/A05/A07 and optional A06; `COLLISION_research`; focus/connector/build/phone anchors.

## Contract IDs

Active: S04 clean deck; S09 clean ceramic; S14 containment coating; S15 pressure glazing; S17 display; T03 services; T04 facility; T05 console; A00 universal; A02 Deck B; A05 construction; A07 displays; optional A06 wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display glass; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 core; A01 Deck A; A02 Deck B; A03 Deck C; A04 faction; A05 construction; A06 wear/story; A07 static displays.

## Production gates

- Phone LOD2 keeps multilevel terraces, forum, gravitic rings or pressure-within-pressure silhouette, project bays, and Survey lift.
- Focus budget ≤180k triangles LOD0 / 74k LOD1 / 24k LOD2; facility alternative ≤28k.
- Gravitic versus Xenology and Frontier versus Containment must be readable as different functional architecture with emission disabled.
- Containment has at least two physical pressure boundaries and a robotic transfer route; never rely on a red tint alone.
- Decals are batched, correctly oriented, mip-safe, and large enough to support close focus without cluttering tactical zoom.
- Collision excludes sealed cells and preserves public/clean/service routes as separate paths.

## Rejection conditions

Reject if it is a recolored Survey Lab, a monster aquarium, a generic hospital, an empty glowing ring room, or a single undivided lab floor. Reject exposed Brood ownership imagery or infestation in an operational clean district.

