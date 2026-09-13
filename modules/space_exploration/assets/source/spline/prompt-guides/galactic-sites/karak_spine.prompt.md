# Spline 3D production prompt — Colony Transit Spine

**Status:** `source_prompt_only`  
**Site ID:** `karak_spine`  
**Map asset ID:** `gsite_karak_spine_transit_01`  
**Mission / objectives:** `uga_silent_spine` / `spine_gestation_cluster`, `spine_feeder_root`  
**Spline root:** `GSITE_KARAK_SPINE`

## Paste-ready art-direction prompt

> Build an original modular 3D tactical environment for Meridian's Colony Transit Spine: a subterranean magrail system and parallel service artery after blackout, rail damage and Brood occlusion. Establish believable transit architecture first—platforms, concourse, magrail track, service road, power substation, maintenance shafts and lifts—then grow two biologically distinct non-humanoid objectives into it: a gestation cluster occupying a station volume and a feeder root penetrating power/utilities. Emergency wayfinding must remain readable in darkness. Do not make a generic corridor, soldier-only tunnel or one repeated organic prop. Design for combined soldiers, light mechs, vehicles and station-limited medium mechs.

## Measured layout and gameplay envelope

- Envelope **320 × 256 m**, **4 m grid**, **1 unit = 1 m**, **0.8 m nav cell**.
- `parallel_rail_service_route`: P/L/V at **18–24 m clear**; M only within station sections through measured **24 × 12 m** openings and a **48 m** turn court.
- `maintenance_shaft_branch`: P/L only through minimum **14 × 7 m** clearances.
- `railcar_wreck_bypass`: P-only, minimum **3 m**, active in the declared wreck state.
- `LZ_MAINTENANCE_SHAFT`: **32 × 28 m**, P/L only. `LZ_SEALED_PLATFORM`: **52 × 44 m**, P/L/V/M.
- Preserve parallel route redundancy. Medium mechs cannot enter tunnel segments not explicitly measured. Exclude TITAN.

## Hero and modular model set

Create hero LOD families for `spine_gestation_cluster`, `spine_feeder_root`, `spine_sealed_platform`, `spine_rail_car`, `spine_magrail_track`, `spine_station_concourse`, `spine_maintenance_shaft`, `spine_service_lift`, `spine_power_substation`, and `spine_collapsed_tunnel_mouth`.

Build 4 m platform/service straights, corners, T and end caps; 18–24 m rail/service routes; 42/48 m station courts; 14/18/24 m portal families; track/cable segments; blackout/emergency fixtures; personnel ducts; rail-door states; overhead supports; tissue membranes; class-specific rubble; route-safe cover sockets. Keep station, rail set, gestation and feeder anatomy unique; only utilitarian colony interfaces may bridge Meridian and Spine.

## 2K PBR material and decal set

Author five aligned seamless **2048²** families:

1. `spine_transit_tile` — civic platform tile, tactile edges and repair patches.
2. `spine_rail_steel` — magrail conductor, structural steel and heat-wear masks.
3. `spine_soot_service_concrete` — service wall/floor concrete with localized soot, no baked lighting.
4. `spine_emergency_light_strip` — dark fixture strip with narrow, readable emergency emission.
5. `spine_organic_overgrowth_blend` — distinct membrane/root/tissue transitions and wet wound states.

Deliver BaseColor, tangent Normal, ORM, optional Height/Emissive. Produce 16 decals: line maps, platform IDs, maintenance/power isolation, evacuation, sealed/quarantine, emergency paths, UGA purge and separate gestation-cluster/feeder-root objective marks.

## Environmental and Brood state set

- `blackout` / B0–B1: human transit space remains spatially legible through low-area emergency markers.
- `tissue_occluded` / B2–B3: station membranes and feeder invasion alter declared portals but preserve redundant route authority.
- `railcar_wreck_class_split`: fixed wreck blocks vehicle class while a personnel bypass and mixed alternate are already open.
- `targets_purged` / B4: separate wounds at gestation and feeder objectives, powered extraction route restored.

Brood is non-playable/non-humanoid. Gestation architecture is bulbous, chamber-forming and egg-supporting; feeder anatomy is rooted, directional and utility-seeking. They may not be palette variants.

## Technical construction contract

- Author Y-up/-Z-forward at 1 m; candidate Z-up/+Y-forward; origin at station floor datum.
- Apply transforms, triangulate, no negative scale, cameras/lights, hidden duplicates, embedded references or unsupported procedural materials.
- UV0+tangents required; consistent texel density; organic blend masks and emergency emission authored as dedicated channels; explicit alpha.
- Grid pivots at floor contact; rail doors/lifts at real axes; rail car pivot at chassis floor center; Brood targets at stable contact roots.
- Use required node families plus exact `OBJ_SPINE_GESTATION_CLUSTER`, `OBJ_SPINE_FEEDER_ROOT`, `LZ_MAINTENANCE_SHAFT`, `LZ_SEALED_PLATFORM`, `HAZARD_SPORE_`, and separate `COLL_`/`NAV_`/`PORTAL_`/`COVER_`/`LOS_`/`SHOT_`/`DESTRUCT_`/roof/occluder groups.
- Never use render geometry as collision. Author class-aware simple proxies; collision/nav remain stable across visual LODs.
- LOD1 ≤ **40%**, LOD2 ≤ **12%** of LOD0; preserve platform, rail, portal, emergency path and two objective silhouettes.
- Export editable source GLB and standards-bound candidate with stable names and provenance/intake/source link.

## Spline execution sequence

1. Create measured parallel route, station court, class-portal and LZ guides.
2. Greybox clean transit architecture and prove class restrictions before infestation.
3. Author station, rail car, track, lift, power and collapse hero families.
4. Build modular platform/rail/service/portal kits and independent gameplay proxies.
5. Model gestation and feeder systems separately; create B0–B4/contact state collections.
6. Bind five PBR families and the 16-decal system; test blackout value hierarchy.
7. Author route-affecting states, LODs and tactical roof/occluder behavior.
8. Capture phone-scale blackout and purged comparisons, then export without runtime promotion.

## Acceptance checks

- Parallel magrail/service layers read clearly, even in blackout.
- Exact class restrictions, portals, court and LZs are measurable.
- Ten hero families, modular intersections, five PBR sets and 16 decals exist.
- Gestation and feeder targets have clearly different anatomy and objective marks.
- Wreck/organic states preserve legal mixed-unit and extraction routes.
- Phone crops retain route separation, target locations and emergency path hierarchy.

## Original-work boundary

Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II are visual-language references only. Their transit sets, tunnels, infestation forms, organisms, layouts, textures, decals, symbols and factions may not be copied or traced.
