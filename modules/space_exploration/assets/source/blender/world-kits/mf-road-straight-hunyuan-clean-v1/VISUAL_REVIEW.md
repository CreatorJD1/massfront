# Hunyuan Straight Road Cleanup v1 — Visual Review

Decision: `SOURCE_CANDIDATE_ACCEPTED`, `RUNTIME_REJECTED`.

The cleaned authoring candidate is materially closer to the approved road direction than the procedural greybox: it has a readable four-lane surface, segmented cyan edge channels, restrained transverse joints, exact 20×40 m bounds, and deterministic north/south sockets. The procedural kit remains the stronger topology reference for corners, junctions, adapters, and gates.

The previous black fragments were reproducible and had two causes: a global normal recalculation across 762 disconnected generated islands, and flat overlays intersecting the uneven source deck. The current build preserves source winding, removes only 12 metric-bounded single-triangle specks, segments long channels, and locally clears every overlay. The provenance report records 0 overlay intersections and 0 coplanar placements at a minimum 0.008 m clearance. Matched top and isometric evidence no longer shows the earlier field of flipped black shards.

Runtime acceptance is blocked by:

- softened, locally wavy generated geometry that still needs human art approval;
- no verified normal, ambient-occlusion, or emissive texture inputs;
- no integrated material-scale or seam proof across adjacent modules;
- no real phone tactical or command-zoom capture;
- no runtime manifest or map-planner consumer.

Evidence:

- `evidence/mf-road-straight-hunyuan-reference-iso-1024.png`
- `evidence/mf-road-straight-hunyuan-clean-iso-1024.png`
- `evidence/mf-road-straight-hunyuan-reference-top-1024.png`
- `evidence/mf-road-straight-hunyuan-clean-top-1024.png`
- `evidence/mf-road-straight-hunyuan-reference-low_entry-1024.png`
- `evidence/mf-road-straight-hunyuan-clean-low_entry-1024.png`
- `mf-road-straight-hunyuan-clean-v1.provenance.json`
- `source-topology-diagnostic.json`

The next content pass should author a complete material set, prove two-module seams at tactical scale, and use this straight module as the material/silhouette reference while preserving the exact procedural socket grammar for the complete road family.
