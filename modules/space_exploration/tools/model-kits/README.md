# MASSFRONT AI Model Kit Pipeline

This directory contains the source-intake and derived-asset pipeline for AI-assisted
Spline models. It deliberately does not register assets in the game or copy them
into a runtime pack. A model is only a candidate until the generated evidence and
the existing game-specific runtime gates approve it.

## Design goals

- Preserve the original exported GLB byte-for-byte.
- Bind every build to a Spline public scene, document name, root/object IDs,
  generation IDs, concept image, scene digest, source hash, and repository state.
- Normalize generated transforms deterministically in Blender: Z-up, +Y forward,
  centered in X/Y, grounded at Z=0, and scaled to a declared physical size.
- Produce LOD0/LOD1/LOD2 GLBs, an isolated convex-hull collision proxy, extracted
  source textures, deterministic thumbnails, and a contact sheet.
- Measure texture borders. UV atlases explicitly record seam checking as not
  applicable; assets that claim tileability must pass numerical border limits.
- Keep mobile evidence fail-closed. Blender previews are art evidence, not proof
  of appearance, performance, depth, or interaction inside the game.
- Never overwrite an existing source GLB. A changed source creates a new kit or a
  deliberate new source version.

## Kit layout

Each model has its own directory outside this tools folder:

```text
<kit>/
  kit.json
  source/<kit-id>-source.glb
  concept/<kit-id>-concept.png
  evidence/scene-digest.json
  evidence/source-lock.json
  evidence/build-report.json
  evidence/verification-report.json
  evidence/artifact-index.json
  evidence/mobile-evidence.json
  evidence/thumb-iso.png
  evidence/thumb-front.png
  evidence/thumb-side.png
  evidence/thumb-top.png
  evidence/contact-sheet.png
  derived/<kit-id>-lod0.glb
  derived/<kit-id>-lod1.glb
  derived/<kit-id>-lod2.glb
  derived/<kit-id>-collision.glb
  derived/textures/*
  provenance.json
```

`kit.json` paths are relative to the kit directory and may not escape it. A
starter manifest is available as `kit.example.json` and is constrained by
`model-kit.schema.json`.

The per-source manifest is not an alternate content catalog. When present, the
authoritative `source-media/content-library/model-pack-catalog.v1.json` is read
without modification and its path/hash are bound into the build provenance.

## Spline authoring sequence

1. Generate one square, isolated concept image for 3D conversion.
2. Generate one textured 3D model from that exact image generation ID.
3. Do not switch tabs until `get_generation`, `get_scene`, `get_objects`,
   `analyze_scene`, and the final live screenshot are complete.
4. Persist those responses in `evidence/scene-digest.json`.
5. Publish the Spline scene and record its durable public URL and object IDs in
   `kit.json`.
6. Export the generated mesh with `export-spline-mesh.mjs`. The exporter refuses
   to overwrite a source file.

The Spline bridge does not expose a native GLB-export verb. The exporter reads the
published scene, extracts the exact generated mesh arrays and embedded texture,
and writes a self-contained GLB. It supports a generated `NonParametricGeometry`
mesh, not a hand-built multi-object Spline level.

## Commands

From the repository root:

```powershell
# 1. Export and lock the source. The output path must not already exist.
node modules/space_exploration/tools/model-kits/export-spline-mesh.mjs `
  "https://my.spline.design/<scene>/" `
  "<mesh-object-id>" `
  "modules/space_exploration/assets/source/spline/world-prefabs/<kit>/source/<kit>-source.glb"

# 2. Build normalized derivatives and evidence.
node modules/space_exploration/tools/model-kits/model-kit.mjs build `
  "modules/space_exploration/assets/source/spline/world-prefabs/<kit>/kit.json"

# 3. Verify without rebuilding.
node modules/space_exploration/tools/model-kits/verify-model-kit.mjs `
  "modules/space_exploration/assets/source/spline/world-prefabs/<kit>/kit.json"

# 4. Exercise all fail-closed fixture classes without Blender or Spline.
node modules/space_exploration/tools/model-kits/test-model-kit-fixtures.mjs
```

Set `BLENDER_EXE` if Blender is not installed at
`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.

## Promotion rules

`SOURCE_CANDIDATE` proves only that the source, concept, scene identity, Blender
derivatives, texture extraction, collision, and previews are internally valid.

`REVIEW_CANDIDATE` additionally requires that all generated visual evidence is
present and source-matched. Human art review is still required.

`RUNTIME_CANDIDATE` additionally requires current phone portrait and landscape
captures bound to the exact build artifact-set hash, zero page/WebGL errors,
zero context losses, and a compatible source fingerprint. Missing evidence is
`UNKNOWN` and fails runtime promotion.

This pipeline never marks an asset `APPROVED`, edits a runtime manifest, or claims
mobile performance. Those remain separate game-integration decisions.
