# Colony Transit Spine — Spline source brief

**Status:** authoring brief only. `karak_spine` has mission semantics but no tactical geometry, navmesh, collision, dedicated site materials/decals, or runtime proof. Target asset ID: `gsite_karak_spine_transit_01`; Spline root: `GSITE_KARAK_SPINE`.

## Lore and preset

The Spine is Meridian’s subterranean magrail and maintenance artery after power failure and organic occlusion. “Silent Spine” must purge two different Brood targets—`spine_gestation_cluster` and `spine_feeder_root`—from `maintenance_shaft` or `sealed_platform`. `preset_karak_spine_transit_infestation` needs parallel transport layers, readable blackout navigation, and two biologically distinct objectives; it is not a generic tunnel with the same organic prop repeated.

## Dedicated modular kit

- Heroes: gestation cluster, feeder root, sealed platform, rail car, magrail track, station concourse, maintenance shaft, service lift, power substation, collapsed tunnel mouth.
- Modules: 4 m platform/service pieces, 18–24 m rail/service routes, 42–48 m station courts, 14/18/24 m portals, track and cable segments, blackout/emergency fixtures, personnel ducts, rail-door states, tissue membranes, and class-specific rubble.
- Station silhouette, rail set, gestation cluster, feeder root, and platform language remain unique. Only colony utilities may bridge Meridian and Spine.

## Materials, textures, and decals

Author five original aligned 2K PBR families: transit tile; rail steel; soot/service concrete; emergency-light strip; organic overgrowth blend. The 16 decals include line maps, platform IDs, maintenance and power isolation, evacuation, sealed/quarantine, emergency path, UGA purge overlays, and separate gestation/feeder objective states. A recolored common tunnel or a single Brood surface cannot satisfy the pack.

## Scale, routes, and landing zones

- Envelope: 320 × 256 m; 4 m grid; 0.8 m nav cell.
- `parallel_rail_service_route`: P/L/V, with M admitted only in stations; 18–24 m route width and a 48 m station turn court. `maintenance_shaft_branch`: P/L only. `railcar_wreck_bypass`: P-only state route.
- `maintenance_shaft`: 32 × 28 m, P/L; reject vehicles and medium mechs. `sealed_platform`: 52 × 44 m, P/L/V/M.
- Parallel service and rail routes provide redundancy. TITAN is excluded.

## Destruction and gameplay proxies

Author `blackout`, `tissue_occluded`, `railcar_wreck_class_split`, and `targets_purged`. A wreck may be vehicle-blocking but personnel-passable only after an alternate mixed route is open. Each Brood target owns separate membrane, hazard, collision, nav, LOS, shot, and objective states. Use `COLL_`, `NAV_`, `PORTAL_`, `LOS_`, `SHOT_`, `OBJ_SPINE_GESTATION_CLUSTER`, `OBJ_SPINE_FEEDER_ROOT`, `LZ_MAINTENANCE_SHAFT`, and `LZ_SEALED_PLATFORM`.

## LOD, collision, export, and concept gate

Apply the manifest contracts: authored LOD0/1/2, LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserved platform/rail/objective silhouette and portals, simple stable collision, applied transforms, UV0/tangents, and GLB 2.0 PBR. Spline scale is 1 unit = 1 m, Y-up/-Z-forward; normalize candidates to Z-up/+Y-forward.

Final geometry is blocked on an original measured board covering parallel routes, station-only M clearance, the two Brood anatomies, blackout value grouping, destruction states, clearance sections, and phone crop. No Spline/model/texture source exists; runtime remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II are visual-language references only. Their route hierarchy, scale cues, cover language, and infestation readability may be studied; no asset, organism, texture, decal, layout, logo, faction design, or prop may be copied or traced.
