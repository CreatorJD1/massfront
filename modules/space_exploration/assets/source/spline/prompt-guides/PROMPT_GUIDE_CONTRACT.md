# MASSFRONT Spline 3D Prompt Guide Contract

**Status:** source prompts only; no prompt output is runtime-ready until it passes the evidence gates below.

## How to use the guides

1. Open a new or intentionally selected Spline 3D document and enable its AI bridge.
2. Build one guide and one asset family at a time. Do not combine several sites or districts into one generation request.
3. Paste the guide's **Spline master prompt**, then execute its numbered build passes in order.
4. After every pass, inspect the scene tree and compare actual object counts, dimensions, names, and positions with the guide. A screenshot alone is not verification.
5. Preserve the editable Spline source. Export GLB only after the geometry, material, and state checks pass.
6. Record the Spline document ID, source revision, exporter settings, GLB hash, triangle/material/texture counts, and matched screenshots in the asset's provenance record.

## Original-art boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II may inform only broad visual-language principles: grounded industrial function and damage, strategic-scale silhouette readability, compact objective/cover/breach logic, and strong biome/faction/infestation separation. Never copy or trace their assets, layouts, silhouettes, textures, logos, icons, faction marks, palettes, effects, or named landmarks. Every MASSFRONT output must be original and source-provenanced.

## Required prompt contents

Every guide must define:

- Exact MASSFRONT site, preset, district, and asset IDs.
- Gameplay function and original silhouette nouns.
- Meter-based footprint, height, portals, lanes, turn courts, ramps, cover and objective clearances.
- Hero meshes, reusable modules, props, connectors, transit pieces and authored state variants.
- Material families, 2K source texture requirements, texel scale and decal language.
- Mesh names, pivots, transforms, modular snap increments, UVs, collision proxies and LODs.
- Clean, damaged and ruined states; Brood states only where the lore calls for them.
- Phone tactical-zoom, close-camera and cutaway acceptance views.
- Explicit exclusions and failure conditions.

## Shared geometry contract

- World unit: `1 Spline unit = 1 meter` at export.
- Exterior structural snap: 4 m; macro planning tile: 16 m.
- Interior structural snap: 1 m; detail snap: 0.25 m.
- Ground contact pivots sit at local `Y=0`; modular wall/road pivots use a documented end or center snap point.
- Apply transforms before export. Positive uniform scale is required.
- No invisible duplicate faces, internal coplanar shells, zero-area triangles, open accidental seams, or z-fighting overlays.
- Use beveled silhouette edges where they survive tactical zoom. Do not spend geometry on invisible micro-panels.
- Glass, emissive displays, decals and collision are separate named objects/material roles when their render behavior differs.

## Combined-arms exterior clearances

- Human reference: 1.8 m.
- Light vehicle reference: 6.5 m long.
- Medium mech reference: 7.5 m tall.
- Heavy vehicle reference: 10 m long.
- Light-mech portal: at least 14 x 7 m.
- Small-vehicle gate: at least 18 x 8 m.
- Medium-mech high bay: at least 24 x 12 m.
- One-way service lane: 16–18 m.
- Two-way primary route: 28–30 m.
- Turn court: 42–48 m.
- Traversable ramps: target 6–8%; never exceed 8.3% without a separate infantry-only route classification.
- Compact maps reduce block count and route length, never required vehicle/mech clearance.

## Mobile geometry and LOD targets

Targets are per authored family and may be lowered after device measurement:

- Large hero structure: LOD0 15k–40k triangles, LOD1 no more than 50%, LOD2 no more than 20%, proxy no more than 3%.
- Medium module: LOD0 2k–12k triangles; small prop: 300–3k triangles.
- Repeated props require a shared mesh/material and instance-safe pivot.
- A single exterior site should target no more than 350k authored LOD0 triangles and no more than 140k simultaneously visible mobile triangles before occlusion/LOD measurement.
- A single NEXUS district should target no more than 180k authored LOD0 triangles and no more than 90k simultaneously visible mobile triangles.
- Every LOD transition needs matched screenshots and hysteresis in runtime; no silhouette pop may be accepted from the prompt output alone.

## UV and material contract

- UV0: non-overlapping for unique PBR surfaces or consistently tiled for declared trim/material sheets.
- UV1: non-overlapping lightmap/auxiliary channel only when the consumer requires it; do not fake one by duplicating broken UV0 data.
- Preserve tangents for normal-mapped assets.
- Author lighting-neutral 2048 x 2048 masters. Runtime KTX2/downsizing is a separate approved derivation.
- Default packed PBR convention: ORM `R=ambient occlusion`, `G=roughness`, `B=metalness`; alpha is reserved and must be documented.
- Normal maps use tangent-space orientation expected by the current renderer and must have a neutral fallback.
- No baked directional lighting, fake global specular streaks, large non-tileable grime, or exterior hull texture smeared across unrelated interiors.
- Decal/trim atlases require at least 16 px gutters at 2K and 12 px edge dilation. Keep signs legible without depending on microscopic text.

## Naming and export contract

- Mesh: `MF_<scope>_<asset>_LOD0`, with `_LOD1`, `_LOD2`, `_PROXY`, `_DMG`, `_RUIN`, or `_BROOD_B1`–`_BROOD_B4` suffixes where applicable.
- Collision: matching mesh name plus `__COL`; use primitive/convex proxies rather than render meshes.
- Materials: `MAT_<planet-or-deck>_<family>_<role>`.
- Decals: `DEC_<scope>_<purpose>`.
- Anchors: `ANCHOR_<scope>_<function>`; NEXUS construction anchors retain `BUILD_<district>_<plot>` metadata.
- Export one documented GLB family at a time with embedded or explicitly allowlisted textures. Do not silently mix authoring-only concept images into GLBs.

## Mandatory evidence before `runtimeReady:true`

- Scene-tree/object inventory and exact dimensions.
- Triangle count by LOD, draw-material count, texture dimensions/format and estimated GPU memory.
- UV proof, seam proof, normal/ORM channel proof and decal bleed check.
- Collision/navigation clearance probe for every admitted class.
- Clean/damaged/ruined and applicable Brood-state screenshots.
- Matched top-down, tactical-oblique and close views; NEXUS also requires phone-portrait cutaway visibility.
- Exported GLB hash and source document provenance.
- Real packaged-runtime capture with source/runtime fingerprints and zero page/WebGL errors.

Missing evidence is `UNKNOWN` or failure, never zero/pass.
