# MASSFRONT Hunyuan Road Junctions V1

This folder is an isolated, source-authoring-only extension of the cleaned
20 m × 40 m Hunyuan straight road. It is **not registered with the game** and
is **not visually or runtime accepted**.

## Authored pieces

- `corner_90`: primary S/E sockets with a connected curved service median,
  solved ±4.25 m turn guides, a raised service island, drain, and access hatch.
- `t_junction`: primary S/E/W sockets with visible approach lanes, protected
  median termini, structural corner islands, drains, and repair panels.
- `x_plaza`: four primary sockets with four real carriageway approaches,
  median termini, protected street corners, drains, and surface repairs. It
  intentionally has no floating crosswalks or decorative central octagon.
- `straight_endcap`: one primary S socket terminating at a vehicle-scale
  checkpoint gate, inspection pads, and physical barricade.
- `primary_local_adapter`: one 20 m primary S socket merging symmetrically to
  one 12 m local N socket with converging lane lines and a protected median tip.

Every piece has LOD0/1/2 review GLBs, a simplified collision proxy, a
navigation proxy, cardinal socket metadata, triangle accounting, and top/iso/
edge plus straight-adjacency evidence.

## Rebuild and verification

From the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/hf-road-cleanup/build-hf-road-junctions.py
py -3 tools/blender/hf-road-cleanup/verify-hf-road-junctions.py
py -3 tools/blender/hf-road-cleanup/test-hf-road-junction-fixtures.py
node modules/space_exploration/tools/model-kits/test-model-kit-fixtures.mjs
```

The fast geometry-only authoring check is:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/hf-road-cleanup/static-check-hf-road-junction-build.py
```

## Unresolved gates

- The Blender procedural bump is not a baked deployable PBR set.
- No verified normal, AO, or authored roughness texture family exists for the
  junctions.
- The cleaned straight retains its source texture while the junction surfaces
  use authored procedural materials, so material continuity still requires a
  dedicated bake and matched review.
- Collision and nav objects are authoring proxies; no planner integration or
  heavy-mech traversal proof exists.
- No tactical/command-zoom phone captures exist.
- Human visual review is still required for all 25 evidence renders.
- `runtimeAccepted` and `visualAccepted` remain `false` by design.
