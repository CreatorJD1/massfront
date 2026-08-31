# Claude handoff: hard-surface world-kit recovery - 2026-08-28

## Objective and current verdict

Recover the deterministic hard-surface world-kit generators, not the rejected
binary output. The current saved candidate is **not ready to upload, register,
or describe as finished**.

The authoritative checkout for this work is:

- root: `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`
- permanent Local alias: `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`
- branch: `cursor/strip-mass-node-bloom`
- inspected HEAD: `c4090cc5785e6c30b342f58beca52d34585e9bfc`

Read `AGENTS.md`, `docs/HANDOFF.md`, and
`docs/BRANCH_WORKTREE_CONSOLIDATION_2026-08-28.md` before changing anything.
Run the workspace guard immediately before each mutation session:

```powershell
node tools/evidence-foundation/workspace-guard.mjs check-write
```

Do not delete or bypass `.git/massfront-verification.freeze`. Do not create a
new branch, worktree, dated source copy, or external evidence folder.

## Ownership boundary

Claude may change only:

- `tools/blender/**`
- `modules/space_exploration/assets/source/blender/world-kits/**`
- this handoff, only when recording verified results

Do not touch:

- `boot.js`
- `assets/data/manifest.json`
- `assets/data/worldkit.js`
- `src/**`
- `modules/space_exploration/assets/models/**`
- `modules/space_exploration/assets/textures/**`
- any runtime manifest, package/version field, updater, release, or native tree
- any already accepted runtime asset

Do not stage, commit, push, upload, publish, or register anything during the
repair. Generated GLBs remain rejected and unregistered until every acceptance
gate below passes.

## Exact source and output folders

The ten saved kits currently occupy 1,468 files / about 938.15 MiB:

| Kit folder | Files | MiB | Generator |
|---|---:|---:|---|
| `mf-platform-hs-v1` | 66 | 40.65 | `tools/blender/build-mf-platform-hs.py` |
| `mf-building-hs-v1` | 78 | 85.96 | `tools/blender/build-mf-building-hs.py` |
| `mf-ground-kit-v1` | 163 | 78.89 | `tools/blender/build-mf-ground-kit.py` |
| `mf-cityforms-kit-v1` | 306 | 176.59 | `tools/blender/build-mf-cityforms-kit.py` |
| `mf-superstructure-v1` | 306 | 186.06 | `tools/blender/build-mf-superstructure-kit.py` |
| `mf-transit-kit-v1` | 234 | 126.23 | `tools/blender/build-mf-transit-kit.py` |
| `mf-modular-building-v1` | 199 | 127.51 | `tools/blender/build-mf-modular-building-kit.py` |
| `mf-modular-road-v1` | 43 | 21.56 | `tools/blender/build-mf-modular-road-kit.py` |
| `mf-road-straight-hunyuan-clean-v1` | 18 | 47.80 | `tools/blender/hf-road-cleanup/build-hf-road-cleanup.py` |
| `mf-road-junctions-v1` | 55 | 46.90 | `tools/blender/hf-road-cleanup/build-hf-road-junctions.py` |

The shared finishing library is `tools/blender/mf_hardsurface.py`. The six
array kits (ground, cityforms, superstructure, transit, modular building, and
modular road) must be rebuilt by their generators and then processed through
`tools/blender/consolidate-mf-kits.py`. The acceptance suite is
`tools/blender/test_mf_kits.py`.

The generators and JSON/Markdown reports are reviewable source. The `.blend`,
`.blend1`, `exports/`, `review-exports/`, and `evidence/` products are ignored
deliberately. Do not force-add the current binary set.

## Reconciliation: 100/652 versus 11/644

These are two different suite states, not competing accounts of the same run.

The earlier final run failed **100 of 652 checks**:

- 85 footprint failures
- 8 shell-count failures
- 2 factory-startup failures
- 2 UV failures
- 2 smooth-shading failures
- 1 sharp-edge failure

The root cause of the largest footprint failures was the consolidator. Tiling
proof and evidence copies are sometimes named exactly like production LODs and
are distinguished only by custom properties. The old consolidator filtered
names, but ignored `mf_proof_only` and `mf_evidence_only`, so unparented proof
copies spread over roughly 1.3 km were joined into 90 production LOD0 groups.

The current `tools/blender/consolidate-mf-kits.py` contains the required first
repair:

- `SKIP_PROPS = ("mf_proof_only", "mf_evidence_only", "mf_collision")`
- `group_modules()` calls `is_skippable(obj)`, not just a name predicate
- `join_group()` transforms each source by its own `matrix_world`
- the joined result is recentered on its geometry footprint, not a root empty

That removed the kilometre-scale contamination and the wrong-root scatter. In
the current saved candidate, 81 of the former 85 footprint failures are gone.

However, **the check count also fell from 652 to 644 because eight shell checks
were disabled**. `tools/blender/test_mf_kits.py` now sets `shell_cap=0` for
ground, cityforms, superstructure, transit, modular building, modular road,
road junctions, and the cleaned Hunyuan straight. That removes exactly eight
checks. It does not prove those former failures were repaired. Platform and
building still use a cap of 12 and pass.

Do not report `11/644` as a 89-check geometry fix. The honest statement is:

- proof-property filtering and root-relative consolidation fixed the broad
  footprint contamination;
- four footprint defects remain;
- eight old shell checks were removed pending meaningful assembly contracts;
- seven road hygiene checks remain.

## Reproduced current failures

On 2026-08-28, Blender 5.2.0 LTS reproduced the current result from the Main
Source checkout:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup `
  --python tools/blender/test_mf_kits.py
```

Result: exit 1, **FAILED 11 of 644 checks**.

```text
transit/colonial_flyover_merge: overhangs by 2.7 m
transit/brutalist_flyover_merge: overhangs by 2.7 m
transit/ruined_flyover_merge: overhangs by 2.7 m
modular-bld/colonial_depot_shed: overhangs by 2.1 m
road-junctions: factory leftovers Camera, Cube, Light
road-junctions: 1308 renderable meshes without UVs
road-junctions: MF_HF_ROAD_CLEAN_V1_RENDER_LOD0 is not smooth-shaded
road-hy-clean: factory leftovers Camera, Cube, Light
road-hy-clean: 11 renderable meshes without UVs
road-hy-clean: MF_HF_ROAD_CLEAN_V1_RENDER_LOD0 is not smooth-shaded
road-hy-clean: MF_HF_ROAD_CLEAN_V1_RENDER_LOD0 has no sharp_edge attribute
```

The three transit failures share `form_fly_merge()` in
`tools/blender/build-mf-transit-kit.py`; one geometry decision affects all
three styles. The depot failure is `form_shed()` in
`tools/blender/build-mf-modular-building-kit.py` and currently affects only the
colonial style. Fix generator geometry or the declared archetype envelope; do
not increase the test tolerance to make either disappear. Keep the one-cell
merge contract unless its sockets and tiling proof demonstrate that it was
intended to be a two-cell asset.

The two Hunyuan road folders are deliberately
`SOURCE_AUTHORING_ONLY`, `runtimeAccepted: false`, and `visualAccepted: false`.
Their UV and shading work must preserve source face winding and must not use a
blanket disconnected-island normal recalculation.

## Additional stale-provenance blocker

The junction generator changed after the saved provenance report was written:

- report-recorded `build-hf-road-junctions.py`: 64,994 bytes, SHA-256
  `9E0FBFCA55D1B06835F2DBF6E7419338CFCBABBC54CA5E7F3127CEC0B70CF662`
- current generator: 65,123 bytes, SHA-256
  `12765AA619317575CA6057C996B04060886753C10696D95AA9F43B1947006CFD`

Current verifier results:

```text
Blender 5.2 + static-check-hf-road-junction-build.py  PASS
python verify-cleanup-source.py                      PASS
python verify-hf-road-junctions.py                   FAIL stale generator hash
python test-hf-road-junction-fixtures.py             FAIL stale generator hash
```

Do not edit the hash in JSON by hand. Rebuild the junction source candidate
from the current generator after the road fixes, then rerun both verifiers.

## Required repair sequence

1. Preserve the property-aware consolidator. Add or retain a regression that
   creates an identically named `mf_proof_only` / `mf_evidence_only` LOD copy
   and proves it cannot enter `group_modules()`.
2. Replace blanket `shell_cap=0` exemptions with meaningful per-archetype or
   per-module shell contracts. Assemblies such as antenna farms may legitimately
   have multiple shells, but every kit still needs a checked contract. A
   no-growth/no-fragmentation guard plus an explicit authored assembly allowance
   is acceptable; silently omitting the check is not.
3. Correct `form_fly_merge()` once and prove all three style variants remain
   inside their declared cell and still meet their open/service sockets.
4. Correct the colonial `form_shed()` footprint without changing unrelated
   style geometry or hiding the discrepancy in tolerance.
5. In both road generators, remove only genuine untouched factory-startup
   Camera/Cube/Light objects when running in a fresh factory-startup scene.
   Preserve unrelated objects in an interactive Blender/MCP scene.
6. Give every production render mesh a stable UV layer. Keep collision, nav,
   socket, proof, evidence, and hidden straight-reference objects out of that
   requirement only when their role property proves they are non-production.
7. Apply hard-surface smoothing and sharp-edge marking to actual production
   LOD0 meshes. The junction blend imports a straight seam reference; tag and
   test that reference honestly rather than letting its `_LOD0` suffix pose as
   a junction production module.
8. Rebuild reports and provenance from the current scripts. Never patch hashes
   manually and never hand-edit a generated `.blend`; the generators are the
   source of truth.
9. Inspect representative GLBs visually after the numeric suite passes. Check
   the flyover branch, depot roof/base flare, straight-road seam, corner,
   T-junction, X/plaza, endcap, and primary/local adapter.

## Commands

Run from Main Source using PowerShell. Stop if the workspace guard fails.

```powershell
node tools/evidence-foundation/workspace-guard.mjs check-write

$blender = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'

# Rebuild the two array kits with remaining footprint failures.
& $blender --background --factory-startup --python tools/blender/build-mf-transit-kit.py
& $blender --background --factory-startup --python tools/blender/build-mf-modular-building-kit.py

# Consolidation is destructive to the generated blends, so always rebuild first.
& $blender --background --factory-startup `
  --python tools/blender/consolidate-mf-kits.py -- `
  mf-transit-kit-v1 mf-modular-building-v1

# Rebuild straight first; junctions consume its reviewed source candidate.
& $blender --background --factory-startup `
  --python tools/blender/hf-road-cleanup/build-hf-road-cleanup.py
& $blender --background --factory-startup `
  --python tools/blender/hf-road-cleanup/build-hf-road-junctions.py

# Narrow road contracts.
& $blender --background --factory-startup `
  --python tools/blender/hf-road-cleanup/static-check-hf-road-junction-build.py
python tools/blender/hf-road-cleanup/verify-cleanup-source.py
python tools/blender/hf-road-cleanup/verify-hf-road-junctions.py
python tools/blender/hf-road-cleanup/test-hf-road-junction-fixtures.py

# Full acceptance suite. Blender must exit zero and print PASSED.
& $blender --background --factory-startup --python tools/blender/test_mf_kits.py
```

If common finishing or consolidation changes, rebuild all six array kits before
the final suite, not just transit and modular building. If
`mf_hardsurface.py` changes, rebuild all ten kits.

## Runtime isolation proof

At this handoff, exact-name searches for all ten folder IDs return no hits in
`boot.js`, `assets/data/manifest.json`, module manifests, or `update.json`.
The live runtime still registers `assets/data/worldkit.js`; none of these GLBs
is loaded. Preserve that state throughout recovery.

After the repair, repeat:

```powershell
rg -n 'mf-(platform-hs|building-hs|ground-kit|cityforms-kit|superstructure|transit-kit|modular-building|modular-road|road-junctions|road-straight-hunyuan-clean)-v1' `
  boot.js assets/data/manifest.json update.json
```

Expected result: no matches.

## Acceptance criteria

The recovery is ready for Codex integration review only when all are true:

- every changed kit is rebuilt from `--factory-startup`; no manual `.blend`
  correction is the only copy of a fix;
- proof/evidence copies remain excluded by property, even when names match LODs;
- the four reported footprint failures are zero without relaxing tolerance;
- every kit has a meaningful shell/assembly check; the eight removed checks
  are restored or replaced by stronger per-module checks and documented;
- both road-specific verifiers and the mutation-fixture suite pass against
  current hashes;
- `tools/blender/test_mf_kits.py` exits zero and prints a complete pass;
- there is no `Traceback` hidden in Blender output;
- representative GLBs pass human visual review for silhouette, seams, UV
  continuity, normals, smoothing, sharp edges, and mobile-scale readability;
- reports still say `SOURCE_CANDIDATE` or `SOURCE_AUTHORING_ONLY`, and the road
  reports remain `runtimeAccepted: false` / `visualAccepted: false` until the
  separate human promotion decision;
- no runtime manifest or accepted runtime asset changed;
- rejected pre-pass binaries are not staged, committed, pushed, or uploaded.

## Git LFS and upload guidance after acceptance

The repository now has LFS attributes for large binary art, including `.blend`
and `.glb`, while `.gitignore` intentionally excludes world-kit blends,
exports, review exports, and evidence. That is the correct state for the
rejected candidate.

After full numeric and visual acceptance, make a separate storage decision:

- commit generators, tests, JSON reports, provenance, and README/visual-review
  notes as ordinary Git text;
- if the owner wants canonical authoring scenes in GitHub, promote only one
  current `.blend` per accepted kit through Git LFS with an explicit force-add;
- never add `.blend1` backups;
- do not upload duplicate `exports/`, `review-exports/`, or `evidence/` trees
  merely because they exist locally;
- keep deployable GLBs in the asset/release channel unless an explicit accepted
  LFS source-archive decision says otherwise;
- run `git lfs status` and confirm every promoted binary is an LFS pointer
  before any commit or push.

No binary promotion is authorized by this handoff. The current 938.15 MiB tree
is retained locally as rejected source-candidate evidence and remains
non-runtime.

## Inspected source identities

```text
tools/blender/consolidate-mf-kits.py
  596959799A89E91B87A6F323434A06E7DABB7822DF9B82F89239FF19CCA7C26D
tools/blender/test_mf_kits.py
  4C2D8B5EEB75112D58FA35BE2D508BB3A4A914D152763C42C4A060C032BC14ED
tools/blender/mf_hardsurface.py
  81478FA1B6A3301D91A1218014C07432F51878F52801A4B9BDA68D4B01BF438A
tools/blender/build-mf-transit-kit.py
  9F106F792176002D469F40E09BAE025EC24042EFF338028DF054642C02F93F8F
tools/blender/build-mf-modular-building-kit.py
  F524D61F7DCEC1F761DEAF1314309776EA3C70F4CE9573A3155A56D3435CDE3C
tools/blender/hf-road-cleanup/build-hf-road-cleanup.py
  13AC634B9BA4E29A8B024FF223C28A7EBCDBBFC203859D9A867CEC9D78139BBB
tools/blender/hf-road-cleanup/build-hf-road-junctions.py
  12765AA619317575CA6057C996B04060886753C10696D95AA9F43B1947006CFD
```

If any hash differs when Claude begins, re-audit the current file before
applying this diagnosis. Do not overwrite concurrent Main Source work with a
stale whole-file copy.
