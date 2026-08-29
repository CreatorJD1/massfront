# Stage 10 model-admission review ledger — 2026-08-29

## Result

Stage 10 now has a generated, categorized **review-only** gallery for existing
model candidates. It is deliberately separate from runtime registration and
from Blender authoring. Running the generator does not open, inspect through,
save, or modify the user's active Blender or VRoid sessions.

Generated review artifacts:

- `tmp/stage10-model-review/index.html`
- `tmp/stage10-model-review/catalog.json`

## Admission boundaries

| Group | Count | Review state | Runtime state |
| --- | ---: | --- | --- |
| Report-authoritative world-kit modules | 328 | Existing report-bound evidence is displayed | Inactive and unregistered |
| World-kit processing candidates | 321 | Awaiting human review and later admission gates | Inactive and unregistered |
| Repair-locked hard-surface buildings | 7 | Displayed with a red quarantine marker | Ineligible, inactive and unregistered |
| Road-QA GLBs | 31 | Separate LOD/collision/nav/reference review group | QA-only, inactive and unregistered |
| Spline exports | 22 | Isolated scratch render when present; otherwise `NEEDS_ISOLATED_RENDER` | Inactive and unregistered |

The 328 world-kit modules come from eight report-authoritative families:

- ground, plazas, and pathing surfaces — 36;
- modular roads — 7;
- transit, bridges, and ramps — 54;
- platforms and floating/sea infrastructure — 30;
- modular structures — 36;
- hard-surface buildings — 36;
- city forms and industrial landmarks — 72;
- megastructures and fortifications — 57.

## Repair lock

The verifier requires this exact seven-ID set and will fail if it drifts:

- `colonial_gatehouse`
- `colonial_depot_shed`
- `colonial_industrial_hall`
- `brutalist_tank_farm`
- `ruined_depot_shed`
- `ruined_tower_slab`
- `ruined_tower_spire`

The repaired numeric report does not release the visual quarantine. Explicit
human approval is still required before any of these modules can enter layout
processing, conversion, export, registration, or runtime work.

The generated board places these seven in a dedicated **Unfinished models /
repair required** section. Other source candidates are not described as
unfinished merely because they remain unregistered or await human review.

Spline models use separate visual states: `MODEL_VISUAL_REVIEW_PENDING` after a
successful isolated scratch render, `NEEDS_ISOLATED_RENDER` before one exists,
and `METADATA_BLOCKED_VISUAL_REVIEW` for `MF_STRUCT_CITYTOWER_02` until its
required size metadata is authored. All remain
`PRODUCTION_PROCESSING_PENDING` because preview success does not provide LOD,
collision, optimization, or runtime admission.

## Explicit exclusions

The gallery excludes the three stale road aliases while retaining the
report-authoritative underscore forms:

- `mf-road-primary-local-adapter.glb`
- `mf-road-t-junction.glb`
- `mf-road-x-plaza.glb`

Character/VRoid assets and every path below a `rejected-candidates` directory
are excluded. The 22 Spline entries are only the 18 world-prefab exports, two
Aelos Caldris ground-site exports, and two Hunyuan Spline exports.

## Verification contract

`tools/verify-stage10-model-review-gallery.mjs` fails closed on:

- exact family, module, repair-lock, road-QA, and Spline counts;
- exact Spline export-manifest membership, byte sizes, and SHA-256 hashes;
- exact report-authoritative module IDs;
- current source-report, model, and evidence byte counts and SHA-256 hashes;
- missing or non-family evidence paths;
- stale alias inclusion;
- character or rejected-candidate inclusion;
- any lifecycle, processing-eligibility, runtime-active, or runtime-registered
  flag that becomes permissive;
- any catalog model basename appearing in runtime JavaScript, JSON, or HTML;
- output or source-root boundary drift.

This is an admission-review aid, not acceptance evidence. Optional Spline
previews are read only from the isolated `tmp/model-review-2026-08-29/`
workspace; they do not change source models or runtime state.
