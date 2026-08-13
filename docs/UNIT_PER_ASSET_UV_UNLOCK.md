# Unit per-asset maps — how the plumbing works

**Status:** plumbing implemented and inert. The unwrap (step 2) is not written.

## What was thought to block this

> "Units have no per-asset UV; `_planarUV` projects by world distance, there is
> no second UV slot and no free vertex lane. A baked per-asset map cannot be
> applied without re-unwrapping every mesh and widening the vertex format."

The facts are right. The conclusion was wrong twice over, and the first
correction to it — recorded here previously — was also wrong. Both are written
down because each cost real time.

### Wrong answer #1: widen the vertex

Unnecessary. See below.

### Wrong answer #2: derive the tiling UV from `vObj`

The previous version of this document proposed freeing lanes 9-10 by computing
the atlas UV in the shader from `vObj` (model-space position) plus the
dominant-axis weights the damage and detail maps already use, with the
acceptance test "the screenshot must not change".

**That test could never pass.** `_planarUV` (`mesh.js:143-154`) origins each face
at *its own first vertex* and orients it along that face's first edge. The UVs
are therefore not a function of position at all — two coplanar faces get
different origins. Any position-derived projection shifts texture placement on
every face in the game. It might look fine, or better, but it is not a refactor,
and shipping it as one would have been a silent visual change across every model.

## The actual answer

**An asset cannot want both surfacing schemes at once.** One that carries baked
maps has no use for the shared atlas; one that uses the atlas has no baked maps.
They are mutually exclusive *per asset*, so lanes 9-10 can carry whichever
meaning the draw call declares — the atlas planar UV as today, or that asset's
own 0..1 unwrap. Nothing needs freeing, because nothing needs to coexist.

The declaration rides a **per-draw uniform**, which is free here for a reason
already proven in this file: **one `InstMesh` is one geometry**. `flush()`
(`mesh.js:654`) already uploads per-model uniforms on exactly this basis — the
bone skeleton, whose comment notes it "costs two small uniform arrays per draw
call and nothing per unit". Per-asset surfacing is the same shape.

## What is implemented

- `InstMesh.assetMaps` — null by default; `{base, nre, mask}` when an asset has a
  baked triplet.
- `flush()` binds them to texture units 4-6 and sets `uAssetOn=1`, or clears it.
  The clear is gated behind a module flag `MF_ASSET_ON` so the uniform is never
  written until something actually uses the feature — `flush()` is reached with
  programs other than `prog3D` bound, and writing a `prog3D` location then is an
  `INVALID_OPERATION`. (The shared `uBoneN` upload above it already emits that
  warning on every such draw; this deliberately does not add a second source.)
- `FS3D` branches on `uAssetOn`. The branch is uniform across a draw, so it does
  not diverge and does not disturb the derivatives taken above it.
- Channel decode is copied from `materials-v2.js:84-115`, the shader that already
  reads artv2 output, so both paths read identical files:
  `ba.rgb` albedo, `ba.a` AO, `nr.rg` normal xy, `nr.b` roughness, `nr.a`
  emissive, `mk.r` metal. FS3D carries **gloss**, so it takes `1.0 - rough`.

## The trap that cost an hour — read this before touching sampler units

Pointing `uAssetBase/Nre/Mask` at units 4-6 without binding anything there
**made every model in the game disappear.** Terrain, hardstands, effects and HUD
still drew; every mesh vanished.

WebGL2 validates **every sampler the program references** at draw time, not only
the ones the taken branch reads. An unbound unit is incomplete, so the entire
draw call is dropped — silently, with the program still reporting as linked.

That is why `prog3D === true` is a **worthless** health check for a shader edit,
and why the harness now reads the uniform's live value with `gl.getUniform` and
looks at the frame instead. `begin3D()` (`render3d.js`) binds the atlas to units
4-6 as a completeness stand-in; `uAssetOn` keeps it from ever being sampled.

## Also learned: the pixel diff cannot judge this

"The screenshot must not change" is unusable as an acceptance test here. Two runs
of the **same build** differ by **72% of pixels** (mean delta 27) because the
scene animates and reseeds; the two builds under test differed by 16%. The
comparison is pure noise. Inertness is asserted where it is decidable instead:
`gl.getUniform(prog3D, U3.uAssetOn) === 0` means every draw took the pre-existing
atlas branch, whatever the pixels are doing.

## Step 2 — the unwrap (not done)

`MeshBuilder` emits an asset-local 0..1 UV into lanes 9-10 for assets that
declare baked maps. It does not have to be a good unwrap; it has to be
**injective**, which the current one is not (measured mean overlap factor 8.59,
worst texel 500-1500 faces). A per-primitive box unwrap packed into a grid is
sufficient — every primitive already knows its own extent.

Until then `assetMaps` is never set, so the path stays inert.

## What this does not fix

The Brood's 33 unit types share 14 meshes
(`tools/audit-material-variety.mjs`). Six chassis that are the same model remain
the same model with better texels on them.
