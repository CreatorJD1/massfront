# Step 6 cannot be a Blender bake — and does not need to be

**Status:** finding, with the replacement designed. Not implemented.

## The premise that fails

The plan's step 6 was "roll the 179 template packs through the real pipeline",
meaning: give each pack a genuine per-asset bake instead of a template copy, so
`verify`'s hash gate becomes meaningful and `?assetskin=1` can come off.

Measured:

| | |
|---|---|
| packs declaring `maps:` | **121** |
| `.blend` sources on disk | **4** (2 assets, each source + baked) |
| assets in `art-v2-assets.json` | **2** |

`tools/artv2/mf2_bake.py` bakes a Blender collection. **119 of 121 assets have no
Blender collection to bake.** They are built procedurally by JavaScript in
`models*.js` — `bevelBox`, `cyl`, `extrude` calls with a palette colour per
primitive. There is no source file, and authoring 119 of them in Blender to
recover maps the engine can already derive would be the most expensive possible
route to the same pixels.

So the correct output of step 6 is not 119 Blender bakes. It is one tool.

## What replaces it: bake in-engine, from the mesh that already exists

Everything the bake needs is now present at runtime:

- **An injective unwrap** — `MeshBuilder.unwrapAssetUV()` / `mfUnwrapGeoUV()`
  (`mesh.js`), verified 1 face per texel by `tools/verify-asset-unwrap.mjs`.
  Without this the idea is impossible; with it, every face owns known texels.
- **Per-vertex material ids** — lane 11 already says what each face IS.
- **The material atlas** — albedo, normal and ORM for all 108 materials, already
  generated at boot.
- **A delivery path** — `mfAssetSkin()` loads a triplet and binds it
  (`871e1fa`); `artv2 publish` puts files where the runtime reads them.

The baker rasterises each face into its own UV cell and writes, per texel:

- **BaseAO** — atlas albedo for that face's material, times an ambient-occlusion
  term computed from the mesh's own geometry (the thing the shared atlas can
  never know, because AO is a property of the ASSET, not of the material).
- **NRE** — atlas normal xy, roughness from `MAT_GLOSS`, emissive from the
  material's emissive value. Channel order copied from `materials-v2.js:84-115`,
  the same decode `FS3D` already implements.
- **Masks** — metal from `MAT_METAL`, plus team-livery mask from lane 11's sign
  bit, which currently costs a shader branch every fragment.

## Why this is worth doing at all

If it only re-encoded the atlas per asset it would be pure loss — more memory,
same picture. It earns its place on the parts an atlas structurally cannot hold:

1. **Baked ambient occlusion.** Contact shadows where a turret meets a hull,
   inside vents, under overhangs. The single largest readability gain available,
   and impossible from a tiling material.
2. **Per-asset wear and streaking** placed against the actual silhouette rather
   than repeating every 18 world units.
3. **Insignia and hull numbers** — placed imagery, which needs an injective UV
   and now has one. This was the one thing correctly identified as impossible
   before the unwrap existed.

## Order

1. `tools/bake-asset-maps.mjs` — in-page, real GPU, one asset, writes the triplet
   to `source-media/material-v2/<slug>/`. Reuse `tools/capture-mat-atlas.cjs`'s
   readback and `tools/artv2/pnglib.cjs`'s encoder.
2. Prove it on the Rhino: same silhouette, visible contact AO. Compare against
   `?assetskin=0` at SPAN_MIN.
3. `artv2 publish` it, then extend to a batch over the 121 packs.
4. Remove the `?assetskin=1` gate once the twins are gone —
   `tools/artv2-verify.mjs`'s hash gate can finally see both sides and will say
   so.

## What this does not fix

The Brood's 33 unit types share 14 meshes. Baked AO on six chassis that are the
same model gives six identical better-lit copies. Geometry first.
