# Stage 10 model-admission and locked-model preparation ledger — 2026-08-29

## Current result

Stage 10 has an exact, generated review catalogue for the surviving model
candidates and a separate, derived Blender preparation lane. Neither lane
registers a model with the game or changes a canonical source GLB.

Generated review artifacts:

- `tmp/stage10-model-review/index.html`
- `tmp/stage10-model-review/catalog.json`

The review catalogue verifier currently passes **6,185 checks**. That pass
proves the catalogue membership and the inactive runtime boundary; it is not a
PBR, z-fighting, render-quality, or runtime-admission pass.

## Exact inventory contract

| Group | Count | Stage 10 disposition |
| --- | ---: | --- |
| Report-authoritative world-kit modules | 320 | Retained in the review catalogue |
| World-kit models included in derived preparation | 320 | Former seven repair-locks visually accepted and unlocked |
| Retained Spline exports | 7 | All seven included in the derived schedule |
| Total retained catalogue candidates | 327 | 320 world-kit + 7 Spline |
| Exact derived preparation set | 327 | 320 world-kit + 7 Spline |
| Exact retained pipeline exclusions | 0 | Former three Spline exclusions deleted from source |
| Road-QA GLBs | 31 | Separate QA-only inventory; never part of the 320 |
| Discarded Spline Props & POI | 12 | User-rejected and absent from the retained catalogue |
| Discarded Stage 10 pack failures | 8 | Removed from source after pack failure or worst remaining exact-duplicate performance |

The 320 world-kit modules come from eight report-authoritative families:

- ground, plazas, and pathing surfaces — 36;
- modular roads — 7;
- transit, bridges, and ramps — 54;
- platforms and floating/sea infrastructure — 30;
- modular structures — 36;
- hard-surface buildings — 33;
- city forms and industrial landmarks — 68; and
- megastructures and fortifications — 56.

Here, “module” means one report-authoritative kit export or piece. It does not
mean that MASSFRONT has 320 distinct production buildings.

## The 12 discarded Spline Props & POI

The following Spline Props & POI models are the exact user-approved discard
set recorded in
`modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_SPLINE_PROPS.json`:

- `MF_PROP_CARGODEPOT_01`
- `MF_PROP_CRYSTAL_01`
- `MF_PROP_DEPOSIT_01`
- `MF_PROP_GEYSER_01`
- `MF_PROP_ICESPIRE_01`
- `MF_PROP_MOUNTAIN_02`
- `MF_PROP_RELIC_01`
- `MF_PROP_ROCK_01`
- `MF_PROP_ROCKARCH_01`
- `MF_PROP_TREE_01`
- `MF_PROP_TREE_02`
- `MF_PROP_WRECK_01`

No remaining hard-surface model is part of that discard instruction. The later
CityTower 02 / Caldris Spline discard is a separate ledger.

## The 8 discarded Stage 10 pack failures

These export GLBs were removed from source. The first seven failed the v18
derived pack. The eighth, `brutalist_arcology_stack`, was the worst remaining
exact-duplicate performer (298 stacked faces). The ledger is
`modules/space_exploration/assets/source/blender/world-kits/DISCARDED_STAGE10_PACK_FAILURES.json`:

- `mf-building-hs-v1/colonial_arcology_stack`
- `mf-building-hs-v1/ruined_arcology_stack`
- `mf-building-hs-v1/brutalist_arcology_stack`
- `mf-cityforms-kit-v1/brutalist_blade_tower`
- `mf-cityforms-kit-v1/ruined_mega_slab_stepped`
- `mf-cityforms-kit-v1/ruined_flare_stack`
- `mf-cityforms-kit-v1/ruined_container_yard`
- `mf-superstructure-v1/ruined_spire_crown`

## Former seven repair-locks — user accepted as good

On 2026-08-31 the creator reviewed the source evidence PNGs and judged all
seven former repair-locked hard-surface buildings good. They are keepers.
They are no longer pipeline-excluded. Do not describe them as broken, known
geometry failures, or a delete set.

Ledger:
`modules/space_exploration/assets/source/blender/world-kits/USER_ACCEPTED_STAGE10_REPAIR_UNLOCKS.json`

- `mf-building-hs-v1/colonial_gatehouse`
- `mf-building-hs-v1/colonial_depot_shed`
- `mf-building-hs-v1/colonial_industrial_hall`
- `mf-building-hs-v1/brutalist_tank_farm`
- `mf-building-hs-v1/ruined_depot_shed`
- `mf-building-hs-v1/ruined_tower_slab`
- `mf-building-hs-v1/ruined_tower_spire`

## The 3 discarded Stage 10 Spline exclusions

The creator rejected the last three pipeline exclusions from source on
2026-08-31. They are gone from the catalogue, the derived schedule, and disk.
The ledger is
`modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_STAGE10_SPLINE_EXCLUSIONS.json`:

- `spline/MF_STRUCT_CITYTOWER_02`
- `spline/gsite-aelos-caldris-customs-depot-spline-v1`
- `spline/gsite-aelos-caldris-hero-spline-v1`

Do not restore those export GLBs. Other Caldris hunyuan/processed pieces and
`MF_STRUCT_CITYTOWER_01` stay. The 31 road-QA GLBs remain a separate QA
inventory, not pipeline exclusions.

## Locked-model preparation contract

The creator has locked the surviving models. Stage 10 therefore performs no
model regeneration and no geometry, topology, triangle-winding, normal, or
canonical-material rewrite. It does not overwrite a source GLB.

Blender repair pipeline v18 still runs in
`DERIVED_SAME_WINDING_RASTER_CLEAN_AND_UV` and writes only derived artifacts
below `tmp/stage10-model-repair/`. Canonical GLB bytes stay locked. If a cleaned
mesh fails the frozen tiled-UV Jacobian, that mesh is restored from an
in-memory source snapshot and re-unwrapped. A post-export proof miss retries
source-only UVs and quarantines instead of aborting the pack.

An earlier v18 catalogue write stopped at 117 processed / 3 hard failures /
15 `RECONSTRUCTION_REQUIRED`. Blender 5.2 then recovered the four blocked
models to `UV_READY_GEOMETRY_REVIEW` with zero failures
(`tmp/stage10-model-repair-uv-revert-smoke/`). The derived schedule is now
327 after eight pack failures were deleted, the remaining brutalist
arcology stack was removed, the former seven hard-surface repair-locks were
visually accepted and unlocked, and the last three Spline exclusions were
deleted from source.
`summary.json` is still the interrupted 330 write and is not a passing pack
summary. Do not treat it, or the older v17 88/242/0 counts, as current
acceptance.

The two derived UV channels have separate purposes:

- `UV_GEN` / `TEXCOORD_0` is a non-overlapping per-render-mesh bake atlas; and
- `UVMap_Tile` / `TEXCOORD_1` is the world-scale cubic PBR path used to avoid
  visible texture stretching.

Those numbers prove only that the locked-geometry UV pass completed. The 242
geometry-review statuses remain review evidence, not permission to alter or
regenerate those models.

## PBR, flicker, and visual acceptance state

Full PBR v1, the Blender z-fighting audit, and paired source/PBR renders are
Stage 10 acceptance evidence only when their own complete-catalogue summaries
and the unified verifier pass. Partial or smoke summaries must not be promoted
to a Stage 10 pass.

At this documentation checkpoint:

- the culling-correct PBR v1 export completed all 330 models with zero failed
  outputs and `PBR_TEXTURED: 330`. It remains derived, unpromoted evidence and
  still requires the unified material-binding verifier;
- the authoritative read-only Blender z-fighting audit v2 completed all 330
  models with zero audit failures, but **failed acceptance**: only 19 models
  passed and 311 are `Z_FIGHTING_REVIEW_REQUIRED`;
- the v2 reports contain 103,121 face-level findings: 1,883 authoritative raw
  nondegenerate exact duplicate faces plus 101,238 near-coplanar overlaps. Five
  Blender-only degenerate duplicate faces were correctly ignored by the raw
  nondegenerate authority;
- the renderer has only a two-model paired-render smoke summary, not the
  required 330 matched source/PBR pairs; and
- no passing unified `tools/verify-stage10-repaired-model-pack.mjs` result is
  present. Stage 10 model acceptance is therefore blocked and incomplete.

The authoritative audit is bound to catalogue SHA-256
`32af2e02ae018a3e818df5580ae1e9dc0e32e77ef952232a77680964de930684`
and audit-script SHA-256
`927c424616ca2efdf034e70cce656dba2da6938449efe7850d328df9168066d6`.
The 330-model run took 1,312.389 seconds and mutated no model.

The Blender z-fighting gate checks the render geometry at the same active LOD
for exact duplicate faces, identical or nested duplicate render meshes, exact
cross-mesh face overlap, and near-coplanar overlap that can cause polygon
flicker. Collision, navigation, evidence helpers, and alternate LODs are typed
and excluded from false cross-comparisons. These authoritative findings remain
blocking review results. The audit itself is read-only and does not mutate the
locked model. A blanket face deletion is not acceptable: only a separately
proven, derived-output cleanup may remove a strictly equivalent duplicate, and
every cleaned result must pass the full v2 audit again without changing the
canonical source GLB.

The PBR gate requires every material primitive in all 330 derived GLBs to bind
base colour, normal, metallic-roughness, and ambient-occlusion textures, with
emissive texture where the mapped authored material supplies emissive data.
The textures are derived from the authored MASSFRONT live material atlas and
are not generic regenerated models.

## Runtime and source boundary

- No surviving canonical source GLB is overwritten.
- No model builder or regeneration pipeline is run.
- No derived repair, PBR, or evidence GLB is promoted to runtime source.
- Every retained candidate remains runtime inactive and unregistered.
- The review and acceptance artifacts stay below `tmp/` until their complete
  gates pass and the creator gives explicit visual approval.
- Character/VRoid assets and paths below `rejected-candidates` remain outside
  this model lane.
- The stale road aliases remain excluded while their report-authoritative
  underscore forms remain represented in the separate road-QA inventory.

## Remaining acceptance sequence

1. Preserve the historical 330-of-330 PBR v1 export as provenance, then rebind
   or re-export against the current 328-model schedule and run the unified
   verifier over every remaining material and texture binding; do not promote
   it to runtime.
2. Resolve or explicitly quarantine the 311 z-fighting-review models. Any
   automated cleanup must be restricted to strictly proven equivalent geometry
   in derived outputs; never blanket-delete faces or overwrite a canonical GLB.
3. Re-run Blender z-fighting audit v2 across the exact 328 and require zero
   duplicate, nested, cross-mesh, or near-coplanar blockers.
4. Render all 328 matched source/PBR pairs with identical camera, framing,
   lights, LOD selection, and backface-culling policy.
5. Run `tools/verify-stage10-repaired-model-pack.mjs` and require every repair,
   UV, PBR, flicker, topology-preservation, source-hash, exclusion, and render
   binding to pass.
6. Perform human visual review of the paired gallery for stretching, seams,
   material correctness, backfaces, nested geometry, and polygon flicker.
7. Keep runtime promotion out of Stage 10 unless it is separately requested
   after acceptance.
