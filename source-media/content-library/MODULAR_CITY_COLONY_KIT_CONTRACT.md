# MASSFRONT Modular City and Colony Kit Contract V1

This contract turns generated buildings, towers, roads, domes, corridors, and world-detail props into coherent reusable kits. It is intentionally stricter than a concept sheet: an attractive Hunyuan or Spline mesh is a source candidate, not a game-ready model, until its scale, sockets, LODs, collision, navigation, semantic materials, states, and evidence pass.

The machine-readable authority is [modular-city-colony-kit-contract.v1.json](./modular-city-colony-kit-contract.v1.json). Its shape is checked by [modular-city-colony-kit-contract.v1.schema.json](./modular-city-colony-kit-contract.v1.schema.json). These files are authoring contracts only and do not alter the runtime or approve any existing pack.

## 1. Shared spatial language

- One world unit is one meter after deterministic import normalization.
- The macro grid is 16 m, the detail snap is 4 m, the district block is 64 m, and the vertical step is 2 m.
- Ground-module origin is the center of its footprint at `Y=0`. Building origin is the center of its podium at `Y=0`.
- Only 0°, 90°, 180°, and 270° yaw are legal in generated assemblies. Runtime scale is exactly `1`; arbitrary and non-uniform scaling is rejected.
- Socket position tolerance is 5 mm, matched gap tolerance is 10 mm, and yaw tolerance is 0.05°.

This separates authored shape from placement. A road, corridor, or tower can be visually elaborate, but it still connects on exact measured planes.

## 2. Roads and portals

Every socket has a profile, bottom-center position, and outward cardinal vector. Matching sockets must occupy the same world position, face opposite directions, share a compatible profile, and preserve a common navigation class.

The required transit kit is not optional decoration:

| Family | Required pieces | Primary dimensions |
|---|---|---|
| Primary road | straight, corner, T, X/plaza, gated endcap | 18 m clear road on 32 m or 48 m modules |
| Local road | straight plus primary/local adapter | 12 m clear road on 16 m modules |
| Service lane | straight and authored branch/end treatment | 8 m clear route on 16 m modules |
| Pressure corridor | straight, corner, T, airlock/endcap | 8 m × 6 m clear portal |
| Cargo corridor | straight plus loading/airlock end treatment | 12 m × 8 m clear portal |
| Pedestrian concourse | entrance and bridge connections | 6 m × 3.5 m minimum clearance |

Curbs, rails, doors, signs, debris, pipes, and light fixtures stop before the clearance plane. A visually connected road that blocks heavy vehicles at its seam is a failed model.

## 3. Podiums and towers

Towers do not float on arbitrary terrain. They attach to one of five measured podium profiles: 16×16, 32×32, 32×48, 48×48, or 64×64 m. Each profile reserves setbacks and declares required public/service access.

Each usable kit supplies at least two low, two mid, two tall, one hero, and one industrial/logistics structure. At least three height bands and four silhouette families must appear in every district before material or decal changes count as variety. A color swap, mirrored texture, or different sign does not count as a different tower.

## 4. LOD, collision, and navigation

LOD0/1/2 are required for structural assets. LOD3 can be a simplified mesh or an approved impostor. Socket planes, podium bounds, ground contact, height class, entrance, faction marker, damage breach, and primary roofline remain stable. The supplied budgets cap the asset classes from close tactical through strategic view.

Collision is authored separately under `COLL_` roots and never uses the render mesh. Ordinary modules use at most 12 convex hulls, each no more than 64 triangles. Collision stays 5 cm inside the visible solid and outside every socket clearance.

Each road and portal emits matching `NAV_LINK_` records. The contract defines infantry, light-vehicle, heavy-vehicle, and superheavy clearances. Destroyed or consumed variants must publish deterministic replacement blockers and pass reroute tests rather than silently changing traversability.

## 5. Faction and planet bindings

Geometry exposes semantic material slots: structural, facade, roof, contact, glazing, emissive, decal, damage, and infestation. Texture packs bind to those slots without destroying model identity.

- UGA uses measured institutional frames, operational crescents, and pressure links.
- Nova uses clean aerodynamic crowns, terraced civic towers, and precise luminous seams.
- Dominion uses armored brutalist masses, deep buttresses, and heat-shielded domes.
- Syndicate uses faceted automation towers, sensor cantilevers, and machine-service terraces.
- Brood is a hostile, non-playable infestation overlay with non-humanoid biomass; it is never a selectable faction skin.

Planet bindings change foundations, drainage, weather protection, material contact, and environmental wear. Aelos, Pyraeth, Nordhall, and Vespera have explicit bindings to the planned texture families. A new planet or region is rejected until it gains its own binding; global tint is not coverage.

## 6. Damage and infestation

The required state ladder is pristine, weathered, light damage, heavy damage, ruin, contact infestation, encroached infestation, and consumed infestation.

- Weather and light damage preserve sockets, collision, and navigation.
- Heavy damage may add blockers but must declare them.
- Ruin requires authored collision and navigation overrides.
- Infestation grows from authored sockets in clusters, not as an even noise layer across every surface.
- The host site's original function and silhouette remain readable until the consumed state.
- Damage exposes plausible frame, wall, conduit, and foundation layers. Random cubes are not debris.

## 7. Anti-nonsense assembly rules

A generated settlement is rejected when any of these are true:

- Roads are disconnected, intersect buildings, end without authored treatment, or become narrower than their declared vehicle class.
- Corridors lead nowhere; doors face walls; service pipes have no source or destination.
- Towers float, intersect, bury entrances, ignore podiums, or use unsupported masses.
- The same asset fills a 2×2 block or appears adjacently more than twice.
- Props ignore function: cargo away from logistics, tanks away from refineries, or defenses without military frontage.
- Faction identity is only a palette swap, or planet identity is only a full-scene color tint.
- Hunyuan output keeps source cameras/lights, unknown scale, hundreds of thousands of triangles, one baked material for every role, or lacks deterministic roots.
- Missing evidence is presented as a pass. Missing or stale evidence is always failure.

Assemblies use a stable hash of world seed, planet, region, site, district, plot, and kit version. `Math.random`, clock time, filesystem order, and GPU readback may not affect placement.

## 8. Approval evidence

Approval requires all of the following:

1. Schema and cross-reference validation with unique IDs.
2. Source hash, normalized meter bounds, root inventory, and source-hygiene report.
3. A measured straight/corner/T/X/endcap socket assembly.
4. Collision and navigation visualization for every declared agent class.
5. LOD triangle inventory plus matched close, tactical, command, and pan captures.
6. Semantic material inventory, 2K source hashes, four-way seam proof, 3×3 repeat proof, and mobile mip captures.
7. Three seeded district assemblies with connected-road, repetition, and silhouette reports.
8. Explicit runtime allowlist, package delta, source/runtime fingerprint, real phone portrait and landscape captures, and zero page/WebGL errors.

Concept art guides silhouette and material language. It never substitutes for a real exported model, a game capture, or a runtime binding.
