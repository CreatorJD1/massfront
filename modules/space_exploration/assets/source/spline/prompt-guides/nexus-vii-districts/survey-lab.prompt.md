# Spline 3D Production Prompt — NEXUS-VII Survey Lab

Status: source-only authoring guide; not runtime evidence.  
District ID: `survey` · Deck A.  
Authority: material/decal manifest, construction catalog, approved Survey concept, and NEXUS audit.

## Paste into Spline

```text
Create an original, game-ready modular 3D environment for the NEXUS-VII Survey Lab, dedicated to noncombat exploration, probe telemetry, planetary scanning, anomaly analysis, and mission intelligence. Build a recognizable observatory district rather than a generic laboratory: a circular planetary scan theater, an elevated anomaly-analysis platform, radial probe storage and service racks, clean sample-processing islands, a limited sealed anomaly chamber, a retractable sensor mast or interior telescope alignment instrument, a glass pressure connector toward Navigation, and an intelligence link toward Mission Operations and the Deck-B Research lift.

Tier 1 contains the scan theater, probe intake/service, sample processing, and safe routes. Tier 2 alternatives: Probe Telemetry uses a ring of compact probe cradles feeding a central telemetry mast; Anomaly Filter uses a shielded analysis drum, spectral vanes, and a clean isolation vestibule. Tier 3 alternatives: Interstellar Observatory uses a tall open-frame sensor crown with layered scan arcs and an overhead alignment ring; Probe Reclaimer uses a robotic disassembly, sterilization, and cartridge-return line. Only the selected alternative is visible. Supply foundation, structural frame, machinery-install, completed, power-paused, and amber retrofit-lockout groups for every buildable plot.

Use S04 clean deck, S09 clean ceramic, S01 structure, limited S14 containment coating, S17 display glass, T03 service and T05 console trim. Use A00, A01, A05, A07, and restrained A06 only where probe handling or service access causes wear. Required identity: scan arcs, spectral scales, probe-bay IDs, sensor-calibration circles, scan-volume arcs, anomaly quarantine, sample intake, telescope reticle, emergency/pressure labels, and a static spectrogram. Separate all floor, wall, containment, glazing, structure, machinery, and display materials. The anomaly zone is not Brood-themed decoration: S14 and hazard marks are confined to sealed scientific use.

Emissive maps drive instrument lines, sensor status, sample indicators, and faint glazing occupancy. No giant glowing surfaces, no halo meshes, no nebula baked into albedo, and no floating opaque cards pretending to be volumetric instruments. Holographic elements must have physical emitters, bounded transparency, and remain secondary to readable machinery.

Use meters, Y-up, floor y=0, +Z forward; 1.8 m human reference, 1.25 x 2.4 m pressure doors, 2.4 m public routes, 1.5 m service aisles, 0.9 m bench clearance, 1.1 m rails, 1:12 accessible ramps. Author UV0, optional UV1, tangents, correct pivots, simple collision, and LOD0/1/2. Export clean GLB only; no cameras, environment, scripts, generic cubes, detached room shell, or exterior uga-hull on interiors.
```

## Required hierarchy

- `DISTRICT_survey`, `SHELL_survey_LOD0..2`, `CORE_survey_t1`, `EXPANSION_survey_t2`, `EXPANSION_survey_t3`.
- `TRANSIT_survey_navigation`, `TRANSIT_survey_mission_ops`, `LIFT_survey_research` with visible pressure, glass, and service connections.
- `FACILITY_survey_t2_probe_telemetry`, `FACILITY_survey_t2_anomaly_filter`.
- `FACILITY_survey_t3_interstellar_observatory`, `FACILITY_survey_t3_probe_reclaimer`.
- Six visibility stages within each facility: `STAGE_empty`, `STAGE_foundation`, `STAGE_frame`, `STAGE_machinery`, `STAGE_complete`, `STAGE_retrofit_lockout`.
- `PROP_probe_cradle_*`, `PROP_sample_station_*`, `PROP_sensor_mast`, `PROP_anomaly_chamber`, all modular and instancing-safe.
- Batched A00/A01/A05/A07 overlays and optional A06; `COLLISION_survey`; focus, entry, lift, probe, and build anchors.

## Contract IDs

Active: S01 structure, S04 clean deck, S09 clean ceramic, S14 containment coating, S17 display glass; T03 services and T05 console; A00 universal, A01 Deck A, A05 construction, A07 displays, optional A06 wear.

Full allowed vocabulary: S01 structure; S02 bulkhead; S03 door; S04 clean deck; S05 transit; S06 heavy deck; S07 grate; S08 machinery; S09 ceramic; S10 civic; S11 antislip; S12 cargo; S13 biophilic; S14 containment; S15 pressure glazing; S16 transit glazing; S17 display glass; S18 acoustic. T01 structure; T02 door; T03 services; T04 facility; T05 console; T06 transit; T07 civic; T08 industrial. A00 core; A01 Deck A; A02 Deck B; A03 Deck C; A04 factions; A05 construction; A06 wear/story; A07 static displays.

## Production gates

- Phone LOD2 must preserve the circular scan theater, tall sensor crown/anomaly drum, probe rack rhythm, sealed chamber, and three route mouths.
- Focus budget ≤170k triangles LOD0 / 70k LOD1 / 23k LOD2; each facility ≤25k LOD0.
- Probe Telemetry and Probe Reclaimer need distinct cradle versus recovery-line silhouettes; Anomaly Filter and Observatory need distinct sealed drum versus open sensor crown silhouettes.
- Keep clean circulation and service clearances; probe racks cannot create a maze of sub-meter gaps.
- Decal text must not mirror or stretch. Batch by atlas/material, preserve atlas gutters, and keep transparent displays depth-sorted.
- No universal grime. Use A06 only at probe tracks, handled rails, sample intake, and maintenance panels.
- LOD2 may merge small probes into rack masses but cannot erase the probe/service identity.

## Rejection conditions

Reject a medical room recolor, empty glowing dome, fantasy observatory, generic server room, billboard-only scanner, or contamination spread across the whole district. Reject if the survey purpose disappears when emissive maps are disabled.
