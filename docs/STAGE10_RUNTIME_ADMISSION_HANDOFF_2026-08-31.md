# Stage 10 runtime admission handoff — 2026-08-31

## Result

The creator accepted Cursor's surviving Stage 10 model handoff as good enough
for in-game use. The exact retained set is now registered as a lazy-loaded
runtime model library: **320 world-kit models + 7 retained Spline models = 327
models**. No model was regenerated and the locked source files were not
overwritten.

Runtime catalog:
`modules/space_exploration/assets/runtime/world-models/world-model-catalog-v1.json`

Runtime API: `window.__MASSFRONT_WORLD_MODELS__`. Call `getCatalog()` to inspect
the accepted inventory and `load(key)` to load one GLB on demand through the
pinned local Three.js GLTF/Draco loader. Models are not bulk-decoded at boot.

The runtime admission deliberately excludes the creator-rejected 12 Spline
Props & POI, the 8 discarded Stage 10 pack failures, CityTower 02, and both
discarded Caldris Spline dumps. The 31 road-QA files remain review-only.

Of the 327 accepted entries, 320 use Cursor's handed-off `PBR_TEXTURED` GLBs.
The seven explicitly accepted former repair-locks use their locked source GLBs
because the historical PBR summary has no matching output for those seven;
they were not regenerated or substituted.

## Packaging

`modules/space_exploration/dist/exploration-content-manifest-v1.json` now
includes the catalog and all 327 lazy-loaded assets. The Galactic Exploration
pack remains optional and is included in `www/` only when
`MASSFRONT_INCLUDE_EXPLORATION=1` is set.

## Boundaries

- No rejected or discarded model was restored or admitted.
- No source GLB was modified.
- No model generation, rerender, quality re-audit, upload, deployment, or
  activation was performed.
- Exact map/site placement remains a gameplay-authoring decision; this handoff
  provides the accepted runtime library without randomly placing models.
