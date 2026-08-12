# Regression-test baseline — 2026-08-12, commit `039c172`

Recorded **before** the strategic-zoom/tactical-icon work, so a later failure can be
attributed correctly. Per `docs/POSTMORTEM-1.33.31-REGRESSION.md`, the project's rule is
to establish red/green state first rather than assume a clean tree.

## Result: the three "guard" tests are ALL ALREADY RED at HEAD

These are the tests whose literal source-string assertions constrain how the icon layer
may edit `render3d.js`. None of them currently passes, and each fails **earlier** than the
assertion we care about — so none is currently protecting the line it was cited for.

| Test | Fails at | Message |
|---|---|---|
| `tools/test-faction-unit-identity.mjs` | **:51** | `nova: missing authored energy/light language` — `MAT.LAMP` absent from both the ground and air Nova meshes |
| `tools/test-faction-strategic-defense.mjs` | **:57** | `Legion Mk1 rail lost material zoning` |
| `tools/test-fog-pickups.mjs` | **:62** | `one or more fog render/minimap/AI gates are missing: {"render":true,"legacy":true,"minimap":true,"shadow":true,"aiPing":false}` |

### Notes that matter for the icon work

- **The fog gates the plan depends on are intact.** `test-fog-pickups` reports
  `render:true, legacy:true, minimap:true, shadow:true` — 4 of 5 pass. Only **`aiPing`**
  is missing. So the constraint "icon branches must go *after* the existing
  `fogEntityVisible` call sites, never replacing them" is still correct and still
  enforceable; it is simply not currently guarded end-to-end by a green test.
- **The predicted failure did not occur.** The design pass expected
  `test-faction-unit-identity.mjs:112` to fail on a missing `orthoSpan<2700` literal. It
  never reaches line 112 — it dies at line 51 on a *material* assertion. The
  `orthoSpan<2700` concern is unverified either way.
- All three failures are **art/material or AI-gate** assertions, not rendering-structure
  assertions. They are consistent with the reconstructed v1.33.31 source genuinely
  differing from what these tests were authored against — i.e. the tests drifted from the
  shipped build, or the shipped build regressed these areas. **Worth investigating
  separately; out of scope for the icon tier.**

## Consequence for the strategic-zoom work

These tests **cannot be used as pass/fail gates** for the icon layer. The rule for this
workstream is therefore:

> Do not require them to pass. Require that they **fail at the same line with the same
> message** afterwards. Any *new* or *moved* failure is attributable to the icon work.

Re-run command:

```bash
node tools/test-faction-unit-identity.mjs; node tools/test-faction-strategic-defense.mjs; node tools/test-fog-pickups.mjs
```

## Green gates that DO protect this work

| Gate | State |
|---|---|
| `node tools/bundle.mjs` | **PASS** — 67 sources → `dist/massfront.html` 24.12 MB. This is the syntax/global-collision gate and the real guard for adding `tacticons.js`. |
| `node tools/pack-www.mjs` | **PASS** — `www/` staged, `index.html` + `boot.js` MANIFEST fully resolved. |
| `node tools/artv2.mjs verify --all` | Fails only on the intended authoring-ceiling errors (tank 32,018 and factory 11,564 both over the 10,000 source ceiling). Battle LODs pass: tank 3,752, factory 5,058. |

Real-GPU capture harness (headed Chrome, `--use-angle=d3d11`) is the authoritative visual
check; SwiftShader output is **not** trustworthy for material/detail questions.
