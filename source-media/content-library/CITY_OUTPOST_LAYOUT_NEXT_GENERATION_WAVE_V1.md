# MASSFRONT City/Outpost Layout — Next Hunyuan Wave V1

This source-authoring plan selects the next three layout pieces after the saved outpost gatehouse and the outpost operations block. It does not approve a generated model for runtime use. The machine-readable prompts, dimensions, sockets, and concept requirements are in [city-outpost-layout-next-generation-wave.v1.json](./city-outpost-layout-next-generation-wave.v1.json).

## Decision

Generate these pieces next, in this order:

1. `road_primary_straight_32` — establishes the repeatable 18 m primary-road calibration spine.
2. `road_primary_corner_32` — permits legal cardinal turns and closed city/outpost blocks.
3. `road_primary_x_plaza_48` — supplies four-way branching plus the authored empty intersection needed to avoid placing a required building plot on a cross-street.

The T junction becomes the immediate fourth road-family job. The first three were selected because straight + corner + X/plaza can already assemble a connected looped district network; another hero building cannot.

## Exact topology

| Rank | Piece | Envelope | Required sockets | Non-negotiable clearance |
|---|---|---:|---|---|
| 1 | Primary straight | 32×0.6×32 m | N `(0,0,16)`, S `(0,0,-16)` | One continuous 18 m clear north/south route |
| 2 | Primary corner | 32×0.6×32 m | N `(0,0,16)`, E `(16,0,0)` | One broad 18 m clear 90-degree route, no center obstacle |
| 3 | Primary X/plaza | 48×0.6×48 m | N `(0,0,24)`, E `(24,0,0)`, S `(0,0,-24)`, W `(-24,0,0)` | Two continuous 18 m routes and an empty 28×28 m no-plot hardstand |

All coordinates use meters, `+Y` up, `+Z` north, and footprint-center origin at ground `Y=0`. Every socket is a flat `road_primary_18` boundary. Curb, rail, drain, light, decal, debris, or prop geometry may not cross a socket plane.

## Concept-image gate

None of the three required road concepts exists yet, so all three remain `BLOCKED_CONCEPT` and evidence remains `UNKNOWN`.

Each concept must be an original isolated module, preferably 2048×2048 and never below 1536×1536, shown in a clean elevated three-quarter orthographic-style view. The full footprint and all boundary seams must be visible. Use a neutral studio background, one soft contact shadow, large readable pavement/plate regions, and restrained graphite, warm-gray, pale armor, dark contact, cyan emissive, and amber hazard regions.

Do not include terrain, adjacent modules, buildings, vehicles, people, weapons, turrets, creatures, loose props, text, logos, watermarks, or perspective-cropped sockets. A concept that looks like a finished city scene is unsuitable for image-to-3D generation because it encourages baked terrain and disconnected background geometry.

Required concept paths:

- `source-media/concepts/hunyuan/city_outpost_layout_kits/road_primary_straight_32/mf_road_primary_straight_32-concept-v1.png`
- `source-media/concepts/hunyuan/city_outpost_layout_kits/road_primary_corner_32/mf_road_primary_corner_32-concept-v1.png`
- `source-media/concepts/hunyuan/city_outpost_layout_kits/road_primary_x_plaza_48/mf_road_primary_x_plaza_48-concept-v1.png`

## Audit note

The existing 13-job queue declares concept paths under `source-media/concepts/city-outpost-layout-kit-v1/`, while the two concepts saved so far are under `source-media/concepts/hunyuan/city_outpost_layout_kits/`. The queue must be reconciled to the real approved files and hashes before any selected job is marked ready. Missing evidence is not a pass.

The existing concept inventory is:

- Brutalist command-hub concept: 1536×1024, SHA-256 `f39b2020978c8c888f823458943364d596247f0900fb8405819872913892f32e`.
- Outpost operations-block concept: 1402×1122, SHA-256 `1c10bbc4bae58ce421414a1f53897b1f000699e1d71a69adcf68da2b90abf51d`.

These existing images do not substitute for the three road concepts. Hunyuan exports remain retained source candidates and require normalization, socket, topology, UV, semantic material, collision, navigation, LOD, package, and matched phone-evidence gates before runtime admission.
