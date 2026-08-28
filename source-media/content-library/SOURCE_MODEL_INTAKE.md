# Source Model Intake

`tools/source-model-intake.mjs` converts an exported Spline/Hunyuan GLB into a
truthful, self-contained **source-authoring** GLB. It does not optimize or admit
the model into a runtime package.

```powershell
node tools/source-model-intake.mjs `
  --input C:\path\model_raw-spline.glb `
  --output modules\space_exploration\assets\source\spline\hunyuan\kit\model_source.glb `
  --target-bounds-m 32,20,32 `
  --fit exact
```

The tool:

- refuses in-place edits and existing output/report paths;
- removes cameras, lights, the known `Ground Shadow Catcher`, any additional
  exact `--remove-name`, and any `--remove-regex` match (including descendants);
- preserves all remaining meshes and their material assignments;
- bakes generated wrapper transforms;
- normalizes to explicit glTF Y-up meter bounds;
- moves the aggregate pivot to floor-center;
- stages and validates the GLB before an atomic commit;
- emits a sibling `.intake.json` report with input/output SHA-256, geometry,
  bounds, cleanup details, and `runtimeReady: false`.

Use `--fit exact` for a contracted modular footprint. It can scale axes
independently, so generated proportions should be reviewed afterward. Use
`--fit uniform` when preserving proportions matters more than filling every
target dimension.

Additional studio objects can be removed without changing the tool:

```powershell
node tools/source-model-intake.mjs ... `
  --remove-name "Studio Cyclorama" `
  --remove-regex "^(Reference|Preview) (Grid|Backdrop)$"
```

Run the Blender-backed fixture test with:

```powershell
node tools/source-model-intake.selftest.mjs
```

A passing intake is not a runtime approval. Topology cleanup, UV/material
semantics, LODs, collision/navigation, package allowlisting, and matched phone
evidence remain required.
