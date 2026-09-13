# MASSFRONT Modular Road Kit v1

This folder is the authoring/output target for MASSFRONT's deterministic first-wave road kit. The generator preserves a 32 m placement grid and a 20 m heavy-mech-capable primary corridor.

Generated modules:

- primary straight
- primary corner
- primary T junction
- primary X/plaza
- primary endcap
- primary-to-local adapter (20 m to 12 m)
- primary security gate with 20 m × 10 m clear opening

Each module contains `LOD0`, `LOD1`, and `LOD2`, a simplified collision mesh, cardinal `SOCKET_*_N/E/S/W` empties, and `NAV_*` metadata. Surface geometry is built as one non-overlapping road-surface mesh per LOD.

The concept-directed source pass adds:

- a clearly divided two-lane 20 m heavy-mech deck
- raised inner curbs, walkable service margins, and a lower structural edge frame
- deterministic LOD-specific chamfers on sidewalks, frames, barriers, bollards, and gate structure
- dark service beds with narrower cyan light channels
- center dashes, lane seams, transverse deck seams, crosswalks, and tiled junction plazas
- drainage/service panels with individual grate slots at road approaches
- modular outer barriers and service bollards
- a tiered security gate with plinths, pylons, shoulders, armored crossbeam, inset glazing, emissive strips, and hazard panels

Every visible layer uses a distinct elevation or touches only at its boundary. The collision proxy stays below the visible deck, preventing the coplanar overlap and flicker seen in rejected generated candidates.

## Blender command line

Use defaults:

```powershell
blender --background --python tools/blender/build-mf-modular-road-kit.py
```

Use a JSON override file:

```powershell
blender --background --python tools/blender/build-mf-modular-road-kit.py -- C:\path\road-kit-config.json
```

Supported override keys are `blend_path`, `export_dir`, `evidence_dir`, `report_path`, `concept_reference`, `save_blend`, `export_glb`, `render_evidence`, `render_resolution`, and `evidence_views`.

## Blender MCP `execute_blender_code`

Paste this into the Blender MCP execution call. It runs the checked-in authoring script rather than duplicating generator code in a chat prompt:

```python
import runpy

tool = runpy.run_path(
    r"C:\Users\Jason\Documents\Codex\MASSFRONT-main-source\tools\blender\build-mf-modular-road-kit.py",
    run_name="mf_modular_road_tool",
)
report = tool["build_road_kit"]({
    "render_evidence": True,
    "render_resolution": 768,
    "evidence_views": ["iso_ne", "iso_nw", "top", "entry"],
})
print(report["format"], len(report["modules"]))
```

The script replaces only the `MF_MODROAD_V1_SOURCE` collection and unused generated materials, so it is idempotent and does not clear unrelated scene content. It does not add anything to the game manifests; exported GLBs remain source candidates until runtime integration and phone-first evidence are approved.

The JSON report includes the rejected-greybox triangle baseline, the exact regenerated LOD triangle delta, per-role triangle inventory, material roles, and a concept-delta checklist. Checklist entries deliberately remain `IMPLEMENTED_PENDING_VISUAL_REVIEW` until the MCP regeneration and source-matched renders have been inspected.
