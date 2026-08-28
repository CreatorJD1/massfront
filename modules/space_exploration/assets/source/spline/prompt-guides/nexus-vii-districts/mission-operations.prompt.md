# Spline 3D Production Prompt — NEXUS-VII Mission Operations

Status: source-only authoring guide; not runtime evidence.  
District ID: `mission_ops` · Deck A.  
Authority: material/decal manifest, catalog construction choices, approved Deck-A concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for NEXUS-VII Mission Operations. This district converts exploration intelligence into planetary ground-operation plans; it is not the Strike Bay and must not look like a hangar. Make a compact operations center with a stepped briefing amphitheater, central physical deployment table, three readable theater pods, readiness and casualty-analysis stations, a debrief archive wall, medevac routing display, and direct pressure corridors to Survey and Command plus a visible secure route toward the Strike Bay lift. Use acoustic shaping, clear sightlines, and a civic-military planning character rather than weapon racks.

Tier 1 supplies the operation table, briefing seating, mission package terminals, and debrief access. Tier 2 alternatives: Readiness Network is a linked ring of personnel/equipment readiness boards with a strong chevron silhouette; Debrief Archive is a dense but orderly stepped archive wall and review booth cluster. Tier 3 alternatives: Coalition Planner is a larger multi-faction planning dais with four distinct liaison positions; Casualty Forecasting is a protected medical-analysis theater with a translucent casualty-flow model and direct medevac route. Only the selected alternative appears. Author empty foundation, frame, machinery-install, completed, power-paused, and amber retrofit-lockout states.

Use S04/S05 clean and transit decks, S01 structure, S17 displays, S18 acoustic/upholstery, T05 console and T06 transit trim. Use A00/A01/A05/A07 and sparse A06 at traffic/seat/service contacts. Required overlays: deployment grid, landing-zone boxes, readiness bands, mission package IDs, casualty and medevac routing, debrief index, theater-seat numbers, pressure and egress marks. Faction representation is restrained and uses liaison insets only when a facility requires it; do not turn the room into an Embassy.

Emissive input is limited to screens, table projection lines, route indicators, and faint occupied panes. Use texture emission and post-process-compatible luminance, no glow geometry, no full-surface neon, and no authoritative live statistics painted into A07. Floor, walls, transit, display, furniture/acoustic panels, structure, and glazing remain distinct. Never apply exterior uga-hull to any interior object. Do not make generic cubes, repeated server stacks, weapon displays, a flat empty arena, or a detached diorama.

Use meters, Y-up, y=0, +Z forward. Human 1.8 m; doors 1.25 x 2.4 m; primary corridor 2.4–3.2 m; seat row clearance 1.1 m; wheelchair turn diameter 1.5 m; rails 1.1 m; accessible ramps ≤1:12. Provide authored UV0, optional UV1, tangents, proper pivots, hidden simple collision, and LOD0/1/2. Export GLB without cameras, environment, scripts, or unsupported procedural materials.
```

## Required hierarchy

- `DISTRICT_mission_ops`, shell/core/expansion LOD groups.
- `TRANSIT_mission_ops_command`, `TRANSIT_mission_ops_survey`, `LIFT_mission_ops_hangar`.
- `FACILITY_mission_ops_t2_readiness_network`, `FACILITY_mission_ops_t2_debrief_archive`.
- `FACILITY_mission_ops_t3_coalition_planner`, `FACILITY_mission_ops_t3_casualty_forecasting`.
- Every facility has `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, and `STAGE_retrofit_lockout`.
- Hero props: `PROP_operation_table`, `PROP_briefing_gallery`, `PROP_theater_pod_*`, `PROP_debrief_wall`, `PROP_medevac_route`.
- Batched A00/A01/A05/A07 overlays; optional A06; `COLLISION_mission_ops`; focus/entry/build/camera anchors.

## Contract IDs

Active: S01 structure gunmetal; S04 clean deck; S05 transit deck; S17 display glass; S18 acoustic/upholstery; T05 console; T06 transit; A00 core; A01 Deck A; A05 construction; A07 static display; A06 conditional wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 universal; A01 Deck A; A02 Deck B; A03 Deck C; A04 faction; A05 construction; A06 wear; A07 display.

## Production gates

- Phone LOD2 retains the stepped amphitheater, central table, three theater pods, archive wall/medical theater alternative, and route links.
- Focus budget ≤160k triangles LOD0 / 66k LOD1 / 22k LOD2; facility alternative ≤24k.
- Readiness versus Archive and Planner versus Forecasting must be distinguishable by massing with emissive off, not merely labels or tint.
- Preserve clear seated and standing routes and a 3.2 m emergency spine. No table or gallery may block connector visibility.
- Use one batched overlay per required atlas/material class; no per-sticker draw-call design.
- LOD2 can merge seats into stepped banks but must keep the amphitheater and readiness/debrief identity.

## Rejection conditions

Reject if it looks like Command Core with different screens, a hangar, a cinema, a generic office, or a dark empty room. Reject if the center table is an ungrounded billboard or facility alternatives only swap a decal.
