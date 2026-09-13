# MASSFRONT City and Outpost Modular Layout Blueprints V1

This is the map-builder companion to [city-outpost-modular-layout-blueprints.v1.json](./city-outpost-modular-layout-blueprints.v1.json). It defines how the validated gatehouse source candidate, the contracted operations block, and the planned road pieces become believable places instead of an incoherent pile of models.

It is a source-authoring blueprint only. It does not add models to runtime, mark an unfinished Hunyuan export game-ready, or change map generation.

## 1. Current usable truth

| Family | Honest state | Intended map role |
|---|---|---|
| Gatehouse / command tower | Hash-verified, reclassified source candidate; runtime blocked | Fortified entry, visible command landmark, primary-road threshold |
| Operations block | Socket and acceptance contract established; final source/runtime admission still pending | Compact staffed operations core with separate public, vehicle, and service access |
| Primary straight | Planned; concept blocked | Repeatable heavy road spine |
| Primary corner | Planned; concept blocked | Legal cardinal turn and perimeter loop |
| Primary X plaza | Planned; concept blocked | Four-way district distributor with an authored no-building center |

The existing gatehouse is not the broad stepped command hub originally requested. The ledger correctly retains it as a fortified gatehouse and command tower. A true broad command hub remains a missing family.

## 2. Assembly grammar

MASSFRONT settlements use a 16 m macro grid and a 4 m detail snap. Modules use meters, `+Y` up, `+Z` north, cardinal yaw only, and runtime scale `1`. A module is placed by its floor-center origin. It does not get stretched, tilted, or arbitrarily rotated to hide a mismatch.

Construction order is mandatory:

1. Place the authored road graph.
2. Match socket profiles and validate every external termination.
3. Reserve intersections, sight triangles, frontage bands, service routes, and gate approach fans.
4. Place required functional plots.
5. Fill restricted optional plots from their local allowlists.
6. Connect pedestrian, cargo, service, and utility paths.
7. Add bounded props, decals, damage, and infestation last.

Socket faces must meet within 0.01 m, oppose one another, and differ in elevation by no more than 0.02 m. Every road or corridor that leaves the layout must end at another compatible module, an authored endcap/gate, a declared map boundary, or a specific damaged termination.

## 3. Roads, frontage, and clear space

| Route | Clear route | Reserved behavior |
|---|---:|---|
| Primary road | 18 m | 32 m module reservation, 7 m side bands, 14 m minimum curb-to-building frontage, 24 m intersection sight-triangle legs |
| Local road | 12 m | At least 16 m reservation, 8 m minimum curb-to-building frontage, 16 m sight-triangle legs |
| Service lane | 8 m | At least 12 m reservation and 4 m building setback |
| Pedestrian concourse | 6 m × 3.5 m | 2 m structure setback; rails and glazing outside the opening |
| Cargo corridor | 12 m × 8 m | Heavy-vehicle clear; doors park outside the opening |

Ordinary structures remain at least 8 m apart, towers at least 16 m apart, and industrial hazards at least 24 m from public or inhabited frontage. The gatehouse keeps a 12 m approach fan on both sides of its portal. The operations block keeps a 12 m front apron and an 8 m rear service apron.

The primary X plaza reserves its central 28×28 m as empty traversable hardstand. No required plot, tower, statue, defense, or decorative island belongs there.

## 4. The two anchor structures

### Gatehouse / command tower

The current source is treated as a 64×64 m landmark shell. Its map integration target is a continuous 18 m wide by 16 m high primary through-route, public concourses on the two interior sides, and a separate 8 m service exit. These sockets still need to be authored and verified against the source mesh; the blueprint does not pretend they already exist.

The gatehouse must remain the approach silhouette. Low optional buildings can flank it, but nothing may hide the portal, narrow its route, or occupy its sight fan.

### Operations block

The operations block target is 32×20×32 m with four distinct interfaces:

- South: 12 m local-road frontage with 8 m vertical vehicle clearance.
- North: 8 m service access with 4 m vertical clearance.
- West and east: 6 m by 3.5 m public concourses.

Its public entrance, freight/service entry, and internal operations core must be reachable independently. It cannot be dropped beside a road with the wrong face outward and called connected.

## 5. Five authored layout archetypes

### Checkpoint outpost — 160×160 m

The gatehouse controls one primary north–south road. A straight module forms the external approach and a second straight continues into the site. The operations block sits inside the perimeter, connected by a real primary-to-local adapter, a pedestrian concourse, and a rear service loop.

Only two flank plots vary: an inspection/customs hardstand and a vehicle-hold/maintenance hardstand. Their buildings stay below 20 m so the portal remains visible. The layout is not allowed to roll away its gate, operations core, or road spine.

### Logistics outpost — 192×160 m

A four-way freight plaza distributes traffic; its center stays empty. The operations block controls dispatch from a local spur. A dedicated depot, cargo corridor, loading hardstand, service loop, and bounded fuel or battery yard create an understandable supply chain.

Containers, tanks, cranes, and repair props are restricted to those yards. They are not scattered around the operations frontage to imply “detail.” At least three plaza faces continue to authored roads or boundaries.

### Frontier colony block — 256×256 m

The X plaza is the public orientation point. The operations block faces the north local spine. Occupied 64 m blocks contain authored low, mid, and tall compositions with public concourses in front and a separate service backplane behind.

Each block has a real purpose—habitat and services, commerce and clinic, utilities, or civic space. Every 2×2 block passes repetition rules. A decal or color swap is not a new building silhouette.

### Military base edge — 224×160 m

The gatehouse forms the perimeter threshold and a straight primary road becomes the deployment spine. The operations block sits on a protected local spur. The base deployer and Strikers share a dedicated deployment hangar, while maintenance uses the rear service network.

Perimeter walls must close or reach authored map-boundary anchors. Personnel facilities stay away from hazard and ammunition plots. Defense props belong on perimeter frontage and never block a road socket or large-unit route.

### City district entry — 320×256 m

The gatehouse, entry boulevard, X plaza, and terminal hero landmark create one readable civic axis. The operations block connects to one side of the plaza through local road and public concourse systems. Low and mid structures frame the foreground; tall structures frame, but never cover, the axis.

Skyline variation comes from distinct model families and height bands, not random scale. Every tower receives public frontage and rear service access without crossing the public plaza.

## 6. Rules that prevent model soup

- Never scatter from one global building list. Every object fills a named authored plot with a local functional-family allowlist.
- Required plots never disappear because of a random roll.
- Roads are complete before buildings are considered.
- No model may be resized or rotated off-grid to make an invalid placement appear valid.
- No required plot occupies an intersection, sight triangle, road reservation, gate approach, service route, or plaza no-plot zone.
- Roads, doors, pipes, tunnels, corridors, and utilities always reach a plausible destination or authored termination.
- Civic props stay with civic frontage; cargo with logistics; tanks with industry; defenses with military perimeter.
- One asset cannot fill all four cells of a 2×2 block or appear more than twice adjacently.
- Optional structures cannot obscure the primary route, gatehouse portal, operations frontage, or plaza topology.
- Generated source geometry remains source-only until topology, UVs, materials, collision, navigation, LODs, allowlists, and matched phone captures pass.

The deterministic hash chooses only among already legal alternatives. It does not excuse a stable but nonsensical layout.

## 7. Missing model families, in build order

The minimum transit graph is still incomplete. Priority should remain topology before landmarks:

1. Primary T, gated endcap, and primary-to-local adapter.
2. Local straight/corner/T/endcap.
3. Service straight/corner/branch/endcap.
4. Pedestrian concourse straight/corner/T/endcap.
5. Perimeter wall straight/corner and a measured wall gate.
6. Cargo corridor and loading end.

After the graph can connect, build the functional families:

- Outpost: true broad command hub, logistics depot, service annex, utility block, inspection canopy, vehicle hold, maintenance bay, shared deployer/Striker hangar, barracks, medical, power, and sensors.
- City/colony: at least two low civic, two low commercial, two mid habitat, two mid mixed-use, two tall residential, two tall commercial, one city hero, one utility tower, one transit/parking structure, and authored 64 m mixed-height compositions.
- Industry: refinery spine, small tank farm, pipe straight/corner/T, processing block, cargo crane, and battery-exchange yard.
- States: light/heavy damage, ruins, Brood contact/encroached/consumed overlays, planet foundations, faction bindings, collision/navigation, and LOD0–LOD3.

## 8. Map-builder acceptance

A layout is rejected when its road graph is disconnected, a socket is unmatched, a route is blocked, a required plot overlaps a reservation, public/service access is missing, functional zoning is violated, repetition is excessive, or evidence is stale/missing.

Source acceptance and runtime acceptance are separate. The final proof must include connected-road and nav visualizations plus source-matched phone tactical and command captures from the same runtime fingerprint. Until then, `runtimeReady` remains `false`.
