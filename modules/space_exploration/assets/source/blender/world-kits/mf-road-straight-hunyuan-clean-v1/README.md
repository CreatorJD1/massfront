# Hunyuan Straight Road Cleanup v1

This is an isolated, non-destructive Blender preparation target for the verified Hunyuan3D 2.1 straight-road source candidate.

Immutable input:

`modules/space_exploration/assets/source/huggingface/world-kits/mf-road-straight-hunyuan3d21-v1/mf-road-straight-hunyuan3d21-v1.glb`

Expected SHA-256:

`62EC702437FAC75D3651B0130BE094DD8A824FB559A97A46319B131F6225B166`

The checked-in build script reuses the normalization and pivot helpers from `tools/blender/source-model-intake.py`. It imports the source into a tagged collection, preserves a normalized 40,000-triangle high-detail reference, and derives review-only LOD0/1/2 meshes, collision, nav proxy, sockets, end-joint bands, four-lane markings, and separate cyan service channels.

The source contains 762 disconnected components. Cleanup is intentionally conservative: it preserves source face winding, protects every component touching the exact envelope, removes only sub-12 cm/sub-0.002 m² one-to-three-triangle islands, and records every removal. The current build removes 12 isolated triangles and retains 39,988 source triangles in LOD0. It does not weld or remesh legitimate deck, rail, median, or corner shells.

Every authored overlay is placed above the maximum locally sampled source height. The current report records 0 intersections, 0 coplanar placements, and a minimum 0.008 m surface clearance for all three LODs.

The original embedded JPEG base color and PNG metallic-roughness are retained as reference. They are not claimed to be a complete PBR set: the source has no verified normal, AO, or emissive map. New cyan channels use separate geometry and an authored emissive material.

## Blender execution

The current evidence set was generated with the installed Blender 5.2 command-line runtime. The same checked-in entry point can also be driven through a Blender MCP session:

```python
import runpy

tool = runpy.run_path(
    r"C:\Users\Jason\Documents\Codex\MASSFRONT-main-source\tools\blender\hf-road-cleanup\build-hf-road-cleanup.py",
    run_name="mf_hf_road_cleanup",
)
report = tool["build_cleanup"]({})
print(report["status"], report["runtimeAccepted"], report["lods"])
```

The build produces:

- normalized high-detail reference review GLB
- LOD0, LOD1, and LOD2 review GLBs with exact actual triangle counts
- collision and navigation review GLBs
- 1024×1024 same-camera reference/clean pairs for iso, top, and low-entry views
- `.blend` source and JSON provenance report

Every report is marked `SOURCE_AUTHORING_ONLY`, `runtimeAccepted: false`, and `visualAccepted: false`. No runtime manifest is touched.

## Current review decision

The exact 20×40 m lane topology, sockets, collision proxy, navigation proxy, LODs, markings, and cyan service channels are suitable as an authoring foundation. The prior dark flipped fragments are no longer present in the matched evidence. The candidate remains rejected for runtime use until its softened generated geometry receives art approval, a complete PBR material set is authored, adjacent-module seam/scale proof exists, and source-matched phone captures prove tactical and command-zoom quality.

## Static verification

```powershell
py -3 tools/blender/hf-road-cleanup/verify-cleanup-source.py
node modules/space_exploration/tools/model-kits/test-model-kit-fixtures.mjs
```
