# Nova Commander and HQ — Authored Material V2 Pipeline

Updated: 2026-08-10

This is a source-backed authoring route for the two next Nova bespoke packs.
It does not claim that either pack has already been authored.

## Current state

| Asset | Production geometry source | Existing authored source | Existing authored maps | Status |
| --- | --- | --- | --- | --- |
| Nova Commander | `mdlCommander()` in `src/engine/models.js` | none | none | semantic-bake prototype only |
| Nova HQ | `mdlHQ()` in `src/engine/models.js` | none | none | live landmark profile only |
| Nova Factory reference | not the live `mdlFac` binding | `source-media/material-v2/nova-factory-v2/nova-factory-v2.blend` | `assets/textures/materials/nova-factory-v2-{baseao,nre,masks}.png` | authored showcase reference |
| Nova heavy tank reference | not confirmed as the live Rhino binding | `source-media/material-v2/nova-heavy-tank-v2/nova-heavy-tank-v2.blend` | `assets/textures/materials/nova-heavy-tank-v2-{baseao,nre,masks}.png` | authored showcase reference |

The commander's current model is procedural MeshBuilder geometry with animated
leg parts. The HQ is procedural MeshBuilder geometry. Neither has an imported
Blender source, production UV0, GLB, or authored map triplet in this repository.
Do not call either asset an authored map pack until those deliverables exist.

## Reusable tools that already exist

| Tool | Proven purpose | Use for this work |
| --- | --- | --- |
| `tools/build-material-v2-tank.py` | creates the heavy-tank Blender source hierarchy | reference for creating a new commander's authored hierarchy |
| `tools/bake-material-v2-tank.py` | joins evaluated parts, creates UV0, bakes packed maps, exports GLB and LOD1 | closest template for a static HQ; only a template for the commander's rigid hero shell |
| `tools/build-material-v2-nova-factory.py` | creates a Nova structure Blender hierarchy | closest template for the HQ source scene |
| `tools/bake-material-v2-nova-factory.py` | bakes BaseAO/NRE/Masks, GLB, sockets, LOD1 | direct structure-pack template for the HQ |
| `tools/blender_export.py` | exports one evaluated Blender mesh into MASSFRONT's 12-float runtime layout | usable for a static asset or a separately exported commander shell; it retains rigid or `bone.NN` groups |
| `tools/blender_import.mjs` | converts the Blender JSON export into an `MF_BLENDER_GEO` entry | usable only after its runtime lookup is deliberately wired; it is not a proof that the current commander/HQ uses that route |
| `tools/test-material-v2-lab.mjs` | checks the opt-in Material V2 lab | use after a showcase asset is wired |
| `tools/test-material-v2-optout.mjs` | checks normal-game V2 lab opt-out | use to confirm authored showcase payloads do not burden ordinary launches |

The existing bake scripts use Cycles, `bpy.ops.uv.smart_project`, packed map
generation, GLB export, and deterministic offline LOD1 decimation. This is a
practical local Blender path; no generated image is required.

## Required pack outputs

For each exact asset prefix, create all of the following:

```text
source-media/material-v2/<pack>/<pack>.blend
source-media/material-v2/<pack>/<pack>-baked.blend
source-media/material-v2/<pack>/<pack>-baked.glb
source-media/material-v2/<pack>/<pack>-lod1.glb
source-media/material-v2/<pack>/<pack>-baseao.png
source-media/material-v2/<pack>/<pack>-nre.png
source-media/material-v2/<pack>/<pack>-masks.png
assets/textures/materials/<pack>-baseao.png
assets/textures/materials/<pack>-nre.png
assets/textures/materials/<pack>-masks.png
```

The existing pack contract is:

- `BaseAO`: RGB authored base colour, A baked ambient occlusion.
- `NRE`: R/G tangent-space normal XY, B roughness, A emissive.
- `Masks`: R metal/structural, G faction primary, B faction secondary/role,
  A wear/damage.

Use a 1024-square map for initial commander/HQ showcase review, matching the
two reference packs. Select a lower battle resolution only after tactical and
100-unit material-LOD validation.

## Minimal Blender authoring route

### A. Nova Commander (`nova-commander-v2`)

1. Create `source-media/material-v2/nova-commander-v2/`.
2. Rebuild the production silhouette from `mdlCommander()` rather than baking
   a screenshot or applying factory/tank maps. Preserve its recognizable wide
   pauldrons, digitigrade legs, arm cannons, backpack, visor, command beacon,
   halo, and capacitor towers.
3. Build a hierarchy with separate animation-safe groups for left leg, right
   leg, torso, arms, and head. The source MeshBuilder model currently produces
   a distinct leg definition; flattening the full commander into one static
   mesh would remove that motion.
4. Use named Blender materials which `tools/blender_export.py` recognizes
   (`PLATE`, `GREEBLE`, `TRIM`, `GLASS`, `LAMP`, `SERVO`, or `*_TEAM`). Keep
   livery on only marked armor panels.
5. Give the renderable parts one non-overlapping UV0. Bake the three packed
   maps. Damage/wear should avoid the glass visor, energy strips, and moving
   mechanical cavities.
6. Export a hero preview payload only after selecting an animation-compatible
   runtime route. The existing `tools/blender_export.py` supports `bone.NN`
   vertex groups, but the current commander path is MeshBuilder plus runtime
   hierarchy, not an already-wired `MF_BLENDER_GEO` replacement.
7. Keep the existing live semantic commander profile as the gameplay fallback
   until the animated showcase path has close, tactical, damaged, and Android
   evidence.

### B. Nova HQ (`nova-hq-v2`)

1. Create `source-media/material-v2/nova-hq-v2/`.
2. Rebuild the actual `mdlHQ()` layout: the 88x74 service pad, large command
   deck, rear command block, glazing bands, vent/sensor assembly, forward
   landing rings, and deployment bay/ramp. Do not use the factory as a stand-in.
3. Use the Nova factory build/bake scripts as the direct template. Its
   hierarchy → evaluated duplicate → join → unique UV0 → packed maps → GLB →
   LOD1 flow is already proven for a static structure.
4. Preserve an authored metadata/socket set appropriate to this building, at
   minimum `socket_rally`, `socket_production_exit`, `socket_sensor`, and
   `socket_power` if those points are needed by the eventual runtime binding.
   These names are a proposed authoring set; no current HQ source declares
   them, so do not claim they are already live.
5. Bake `nova-hq-v2-baseao.png`, `nova-hq-v2-nre.png`, and
   `nova-hq-v2-masks.png`; keep glass, landing-pad markings, structural seams,
   and controlled faction accents in separate semantic regions.
6. Retain the live HQ profile in `src/ui/render3d.js` as fallback until exact
   production binding and visual/performance validation are complete.

## Repeatable commands after source scenes exist

Run these from repository root with an installed Blender executable:

```powershell
blender --background --python tools/build-material-v2-nova-factory.py
blender --background --python tools/bake-material-v2-nova-factory.py
blender --background --python tools/build-material-v2-tank.py
blender --background --python tools/bake-material-v2-tank.py
node tools/bundle.mjs
node tools/pack-www.mjs
node tools/test-material-v2-optout.mjs http://127.0.0.1:8974/
node tools/test-material-v2-lab.mjs http://127.0.0.1:8974/
```

The first four commands are verified only for the existing Factory/Tank source
assets. Commander/HQ-specific build/bake scripts do **not** exist yet and must
be created by copying their appropriate reference script and changing only
asset-specific hierarchy/material/semantic data.

## Missing work before either pack can be marked authored

- No `nova-commander-v2` Blender source, bake script, GLB, LOD, or map triplet.
- No `nova-hq-v2` Blender source, bake script, GLB, LOD, or map triplet.
- No production runtime binding that replaces the procedural commander/HQ
  geometry with an imported pack.
- No proof that a Blender commander export preserves the current left/right
  leg motion and all hero attachments.
- No phone/Android screenshots or 100-unit material-LOD measurement for either
  candidate pack.

## Acceptance gate

Before migrating a live asset:

1. `node tools/bundle.mjs` succeeds after every source edit.
2. BaseAO, NRE, and Masks are aligned to the exact imported UV0.
3. Commander animation is intact; HQ bounds, production and rally behavior are
   unchanged.
4. Check close, tactical, far, bright, dark, selected, damaged, and burning
   views at 412x915.
5. Run the Material V2 lab and normal-game opt-out tests.
6. Record actual map paths, Blender source, render evidence, and a 100-unit
   comparison in `docs/ART_V2_REGISTRY.md`.

Do not apply a shared factory or tank texture triplet to either asset. That
would be a semantic mismatch, not a bespoke pack.
