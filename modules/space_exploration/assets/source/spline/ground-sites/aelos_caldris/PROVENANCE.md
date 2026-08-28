# Aelos Caldris model-kit provenance

This directory preserves source-quality AI-assisted authoring material. Nothing
here is runtime-ready by implication, and `assets/source/**` is excluded from
player content packs.

## Concept sheet

- File: `concepts/caldris-modular-kit-concept-v1.png`
- SHA-256: `75cb5efbc15ce642533fa67f1c72fbd09a0fd16cd438189e3c73232a16148fab`
- Generator: OpenAI image generation
- Pixel policy: concept reference only; no concept pixels may be baked into a
  runtime texture.
- Status: candidate review. It establishes the first 12 interoperable members,
  but does not itself approve geometry, materials, collision, or runtime use.

## Spline source master

- Spline document: `GSITE_AELOS_CALDRIS_HERO_V1`
- Public source URL:
  `https://my.spline.design/gsiteaeloscaldrisherov1-lwL0GOgAhye1BRh3R0qkk0Gl/`
- Generated parent object: `97f4d4f5-0332-4495-b001-567b39c160eb`
- Generated mesh object: `cff22468-c8ac-45a0-9373-0490dec1314b`
- Source image generation ID: `3fe1a6ed-422d-4410-9901-0c86ea2a9228`
- Source image asset ID: `b9b629fb-fa15-4707-aa93-1ead3e11b6a2`
- Export: GLB, Color & Texture
- File: `aelos-caldris-source.glb`
- SHA-256: `56dfd9ed08ad8d0e04b00de14f1151ec3a9b4ab1fcff988a9aa731d37578a5f6`

Blender 5.2 inspection measured the generated hero mesh at 234,845 vertices,
374,994 triangles, one embedded 1024x1024 image texture, and exported bounds of
0.56 x 0.26 x 0.32 Blender units. The intended authoring envelope is 56 x 26 x
32 meters, so the source requires a verified 100x normalization and applied
transforms before any runtime candidate is created. The export also contains a
default cube, cameras, and lights that must not appear in the runtime asset.

The source master is intentionally retained even after optimized derivatives
exist. Automated LODs are candidates only until matched renders prove that
silhouette, entrances, glazing, and mobile-scale readability survive.
