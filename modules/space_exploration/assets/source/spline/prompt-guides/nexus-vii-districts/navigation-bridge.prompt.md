# Spline 3D Production Prompt — NEXUS-VII Navigation Bridge

Status: source-only authoring guide; not runtime evidence.  
District ID: `navigation` · Deck A.  
Authority: NEXUS-VII material/decal manifest, catalog construction choices, approved ship concepts, and current audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment set for the NEXUS-VII Navigation Bridge. It is an exploration and autopilot control district inside a civilization ship, not a fighter cockpit and not a space-combat bridge. Build a tiered astrogation hall connected directly to the Command Core through a broad pressure corridor and to the Survey Lab through a secondary route. Use a forward panoramic pressure-glazing ribbon, a sunken route theater, raised helm stations, a central orbital-lattice projector, a visible emergency-return lane, and service access beneath the deck. The architecture should feel like a civic transit command center scaled for hundreds of simultaneous routes, while remaining legible from a tilted top-down phone view.

Tier 1 contains the essential helm, autopilot route predictor, orbital approach scheduler, and safe egress. Tier 2 adds an astrogation mezzanine and one authored facility alternative: Efficient Routing is a long low route-optimization table with fuel-flow visualization; Transit Coordination is a stepped scheduling array overlooking a physical transit-status spine. Tier 3 adds one authored alternative: Fleet Route Lattice is a suspended layered orbital-ring instrument; Continuity Scheduler is a redundant dual-core scheduling gallery with visibly paired time-line displays. Do not render both alternatives simultaneously. Include empty foundation, frame, machinery-install, completed, power-paused, and amber retrofit-lockout geometry for each facility plot.

Use S04/S05 decks, S02 pressure bulkheads, S01 structure, S17 display glass, T02/T05/T06 trims, and A00/A01/A05/A07 with A06 only for believable foot and service wear. Place route-node lattice, orbit rings, helm IDs, hazard lanes, fuel-estimate ticks, approach corridors, emergency-return vector, astrometric grid, deck/door IDs, and a non-authoritative static route chart. Use restrained cyan with small amber hazard/status accents. Emission comes only from texture-driven displays, route strips, instrument indicators, and faint occupied glazing; no all-white luminous surfaces, halo geometry, or baked light in albedo.

Keep floor, wall, transit, glazing, structure, machinery, and display materials separate. Exterior uga-hull is forbidden on all interior surfaces. Do not use generic cubes, floating hologram slabs, copied science-fiction interfaces, weapons consoles, pilot seats facing arbitrary directions, or a flat empty floor. Add doors, railings, stairs/ramps, handholds, vent/service panels, cable trunks, and maintenance clearances.

Use meters, Y-up, y=0 deck, +Z forward. Human reference 1.8 m; pressure doors 1.25 x 2.4 m; public route 2.4 m minimum; primary bridge aisle 3.2 m; operator clearance 0.9 m; guardrails 1.1 m; ramps no steeper than 1:12. Author UV0, optional non-overlapping UV1, tangents, hidden collision proxies, correct pivots, and LOD0/1/2. Export GLB without cameras, baked environment, scripts, loose meshes, or procedural-only materials.
```

## Required object set

- `DISTRICT_navigation`, `SHELL_navigation_LOD0..2`, `CORE_navigation_t1`, `EXPANSION_navigation_t2`, `EXPANSION_navigation_t3`.
- `TRANSIT_navigation_command`: primary 3.2 m pressure corridor; `TRANSIT_navigation_survey`: secondary 2.4–3.2 m connector.
- `FACILITY_navigation_t2_efficient_routing` and `FACILITY_navigation_t2_transit_coordination`, mutually exclusive.
- `FACILITY_navigation_t3_fleet_lattice` and `FACILITY_navigation_t3_continuity_scheduler`, mutually exclusive.
- Each facility contains six stage groups: `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, `STAGE_retrofit_lockout`.
- Batched `DECAL_navigation_A00`, `DECAL_navigation_A01`, `DECAL_navigation_A05`, `DISPLAY_navigation_A07`, optional `DECAL_navigation_A06`.
- `COLLISION_navigation`, `ANCHOR_FOCUS_navigation`, connector, build-plot, operator, and phone-camera anchors.

## Contract IDs

Active bases: S01 structure gunmetal, S02 pressure bulkhead, S04 clean deck, S05 transit deck, S17 display glass. Active trims: T02 pressure door, T05 console, T06 transit. Active atlases: A00 core, A01 Deck A, A05 construction, A07 static displays; A06 conditional wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door trim; S04 clean deck; S05 transit deck; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display glass; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 universal; A01 Deck A; A02 Deck B; A03 Deck C; A04 faction; A05 construction; A06 wear; A07 display. Inactive IDs are reserved, not substitutes.

## Geometry and mobile gates

- At phone portrait LOD2, retain panoramic bridge arc, central orbital instrument, tiered helm silhouette, command connector, and emergency lane.
- Focus budget ≤165k triangles LOD0 / 68k LOD1 / 22k LOD2; each facility alternative ≤24k LOD0.
- Efficient Routing must read as flow optimization; Transit Coordination as schedule/throughput. Fleet Lattice must read as a suspended orbital mechanism; Continuity Scheduler as redundant paired infrastructure, even with all emissive disabled.
- Static display plates cannot present authoritative live numbers; runtime UI owns changing data.
- Batch decals; prevent z-fighting and mirrored route labels. Keep signage large enough to read as shapes at tactical zoom, with fine text only for close focus.
- Collision must preserve the primary aisle, helm access, emergency route, and all pressure-door clearances.
- Name mesh roles and material IDs in export metadata; use shared materials rather than per-object duplicates.

## Rejection conditions

Reject any fighter cockpit, weapons bridge, empty conference hall, flat billboard interface, generic blue room, or exterior-hull-clad interior. Reject if alternative facilities differ only by color or if the orbital lattice blocks walkable routes/camera sightlines.

