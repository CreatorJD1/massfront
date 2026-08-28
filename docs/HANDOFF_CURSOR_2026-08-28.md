# Handoff to Cursor — 2026-08-28

Session focus: the 3D asset pipeline. Two hard-surface Blender kits were given a
real boolean/cleanup/merge stage, six array-built kits were consolidated onto
the same pipeline, and 22 models were exported out of Spline that had never
produced a file.

Read `AGENTS.md` first for the build rules. This document is only about assets.

---

## What is new in `tools/`

| File | What it does |
|---|---|
| `blender/mf_hardsurface.py` | The hard-surface toolkit. Gained boolean union, mesh repair, cleanup, coplanar merge, hidden-face removal, UV projection, shading and collider generation this session. |
| `blender/consolidate-mf-kits.py` | Joins the array kits' role-split objects into one mesh per module per LOD, then runs `finalize`. Also `--refresh-reports`. |
| `blender/test_mf_kits.py` | 652 contract checks across all ten kits. Exits non-zero. |
| `blender/inventory-mf-blends.py` | Surveys every `.blend` in the repo; writes `blender-inventory.json`. |
| `intake-spline-prefabs.mjs` | Drives `source-model-intake.mjs` over the exported Spline prefabs, taking target bounds from `PREFAB_LIBRARY.json` `sizeMeters`. |

Run the tests after any asset change:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python tools/blender/test_mf_kits.py
```

**Blender exits 0 even when a script raises.** Redirect to a log and grep for
`Traceback`. Piping through `grep` reports grep's exit code, not Blender's.

---

## Three facts that will save you a day

**Compare LODs in TRIANGLES, never polygons.** Decimate's ratio applies to
triangles and always outputs triangles; LOD0 is n-gons after the coplanar
merge. Comparing polygon counts made a healthy 36%/15% ladder look like a
broken 72%/20% one. The kit reports now carry `tris` alongside `polys`.

**A boolean fails by returning plausible rubbish, not by raising.** Every union
in `weld_parts` is validated three ways: non-empty, bounding box unmoved, and
shell count not *risen* against what went in. The shell check is the one that
catches a shattered mesh, because the fragments still fill the same box.

**Decimate will not collapse through boundary edges, custom normals or UV
seams.** Boolean output is not watertight — the arcology came out of the union
with 3,430 boundary edges, and a 10% LOD request came back at 49%. `finalize`
now seals the mesh after the union, and `decimated_copy` strips shading and UVs
before decimating and re-applies them after.

---

## Remaining tasks, highest value first

### 1. Verify the array-kit cycle landed

The property-aware consolidation exported **262/262 modules** and kept the
proof/evidence objects separate. Its completed rebuild → consolidate → test
cycle still exited 1, but reduced the pre-fix 79 failures to **11 of 644**.

- **Wrong transform.** `join_group` transformed every object in a module by a
  single root's inverse, but the roles inside one module do *not* all share a
  parent. The ground kit's landing pad came out spanning 1950 m instead of 32.
  Now recentres on geometry.
- **Proof geometry had been swept into modules.** The cityforms kit lays tiling-proof
  copies of a module across ~1,300 m to demonstrate seams, and names them
  exactly like the module — the flag is the custom property `mf_proof_only`,
  not the name. `group_modules` joined them in, so `colonial_mega_slab` came
  out 1,322 m wide. `is_skippable` now tests the property as well as the name,
  and the post-fix suite confirms the kilometre-scale footprint failures are
  gone.

**Final inspection verdict: rejected `SOURCE_CANDIDATE`.** The 79 failures are
pre-fix history. The current 11 failures are three transit flyover merges that
overhang by 2.7 m, one colonial depot shed that overhangs by 2.1 m, and seven
road hygiene failures. Two road blends retain Camera/Cube/Light and 1,319
render meshes lack UVs; LOD0 smoothing/sharp-edge checks also remain open.

All generated world-kit GLBs remain ignored and unregistered, so this rejected
candidate has no runtime effect. Do not register, copy to a release path, or
describe the kits as complete until `tools/blender/test_mf_kits.py` passes in
full and representative GLBs pass visual inspection.

Expected shape per kit: `collision:N lodtier:2N lod0:N`.

### 2. Three Spline prefabs still have no file

`PREFAB_LIBRARY.json` lists 20 prefabs; 17 now point at a GLB. Missing:

- `MF_PROP_MOUNTAIN_01`
- `MF_PROP_RELICMONOLITH_01`
- `GSITE_AELOS_CALDRIS_HERO` (the older one; `_V1` is exported)

Spline's file list has several **Untitled** documents. These three are probably
among them, but identifying which is which needs a human eye — do not guess.

Export procedure (the MCP bridge has no export verb, this is UI only):
`Export` → **`3D Formats`** → Format `GLB` → Material `Color & Texture` → Save.
The panel opens on **Public URL** and its primary button is "Update Public URL";
clicking it publishes rather than exports. Format and Material reset to
`GLTF` + grey per document and must be set every time.

### 3. `MF_STRUCT_CITYTOWER_02` has no recorded size

Every other prefab has `sizeMeters` in the library, which is what
`source-model-intake.mjs --target-bounds-m` needs. This one is blank, so it was
skipped rather than guessed. Same for the customs depot: no envelope is
declared anywhere for it. **These are authoring calls — ask the owner.**

### 4. Derive LOD and collision for the 16 intaken prefabs

`tools/intake-spline-prefabs.mjs` produced source-only models under
`spline/processed/<slug>-v1/source/`. They are explicitly **not runtime ready**:
no LOD0/1/2, no collider. Compare against the three assets that do have the full
set — `gsite-aelos-caldris-control-tower-tall-v1`,
`gsite-aelos-caldris-inspection-gantry-v1`,
`mf-elysion-cumulus-conservatory-pressure-dome-v1` — and match that shape.

### 5. 46 raw AI meshes never processed

33 Tripo3D (`source-media/.../tripo3dmodels/` and `design/tripo/`) and 13
Hunyuan3D. Each needs a target envelope and a classification before intake.
`design/tripo/` also duplicates much of `tripo3dmodels/` — worth reconciling.

### 6. The two road kits are held deliberately

`mf-road-junctions-v1` and `mf-road-straight-hunyuan-clean-v1` are
`SOURCE_AUTHORING_ONLY`, `runtimeAccepted: false`, with explicit next steps in
their `provenance.json` that all require human review. **I did not restructure
them** — consolidating assets that are mid-review would invalidate the review.

They do still carry a factory `Cube` and 1,308 un-unwrapped meshes between them.
Purging the Cube is safe; the UVs are part of their pending texture work.

---

## Known limits, stated plainly

- **Building kit LOD2 sits at 21% against a 10% target.** It passes only because
  the test tolerance is 12 points. That geometry hits a genuine decimation floor
  even sealed and planar-dissolved. Tightening it needs hand-authored low tiers
  or a remesh-based LOD2.
- **`uga-command-cutaway.glb` is 81 MB** and is loaded at runtime. On a mobile
  target that is a budget decision, not a defect to fix unilaterally.
- **`MF_PROP_ROCK_01`'s public share URL was refreshed by mistake** while
  exporting. The document already had a public URL so nothing new was exposed,
  but confirm that is acceptable.
- **Consolidation is destructive to the `.blend`.** The generators are the
  source of truth and rebuild everything, which is exactly why the 1950 m bug
  was recoverable. Never hand-edit a kit blend.

---

## Where the numbers live

- `tools/blender/blend-inventory.json` — every model in every save file
- `modules/.../world-kits/consolidation-report.json` — per-kit consolidation
- `modules/.../world-kits/*/[kit]-report.json` — per-module, with `tris`
- `modules/.../spline/world-prefabs/SPLINE_EXPORT_MANIFEST.json` — the 22 exports with SHA-256
- `modules/.../spline/processed/spline-prefab-intake-summary.json` — intake results

The publish pipeline is **Hugging Face + Cloudflare + Drive, never GitHub**. Do
not push, open PRs, or propose GitHub workflows. Local commits are fine.
