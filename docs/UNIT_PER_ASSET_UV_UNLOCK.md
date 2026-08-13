# Unit per-asset UVs — the blocker is not real

**Status:** designed, not implemented. Everything below is verified in source.

## The claim this replaces

> "V2 textures on units are not reachable. Units have no per-asset UV;
> `_planarUV` projects by world distance, there is no second UV slot and no free
> vertex lane. A baked per-asset map cannot be applied without re-unwrapping
> every mesh and widening the vertex format, which sheared every model last time
> it moved."

Every clause is true **except the conclusion**. Widening the vertex is not
required, because the engine already computes model-space triplanar UVs for two
other maps and has been doing it all along.

## The unlock

`vObj` is the **model-space** vertex position, already declared and already
interpolated:

- `src/engine/mesh.js:723` — `out vec3 vObj;`
- `src/engine/mesh.js:819` — `vObj=ap;` (`ap` is pre-instance model space)
- `src/engine/mesh.js:835` — `in vec3 vObj;`

And the fragment shader already samples triplanar off it, with dominant-axis
weights `dw` computed from the normal:

```glsl
// mesh.js:934-935  (damage)
float damageData=texture(uDamageTex,vObj.zy*.070).r*dw.x+
  texture(uDamageTex,vObj.xz*.070).r*dw.y+texture(uDamageTex,vObj.xy*.070).r*dw.z;
// mesh.js:939-940  (detail)
float detailData=texture(uDetail,vObj.zy*.115).r*dw.x+ ... ;
```

`_planarUV` (`mesh.js:143-154`) is itself a **model-space, distance-scaled**
projection — `(p-a)·tangent * UVS`, with `UVS=0.055` (`mesh.js:80`). It picks one
dominant plane per face. That is the same thing the `dw` triplanar blend already
does, computed per fragment instead of baked per vertex.

**So the atlas tiling UV does not need to come from a vertex attribute at all.**
Derive it from `vObj` + `dw`, and lanes 9-10 (`aUV`) become free for a genuine
per-asset 0..1 unwrap — no `VFLOATS` change, no new attribute, no stride edits,
and therefore none of the failure documented at `mesh.js:81-89`.

## Implementation order (each step independently verifiable)

### Step 1 — free the lanes, change nothing on screen

In the fragment shader, replace the `vUV`-derived `muv` with a triplanar
model-space UV built from `vObj` and `dw`, scaled by `UVS`. Keep `vUV` declared
and still fed, so nothing else moves yet.

Two known differences to handle, both real:

1. **Instance width scaling.** `mesh.js:820` is `vUV=aUV*max(aInst.w,0.001)`, so
   width-scaled instances currently stretch their tiling. `vObj` is pre-scale, so
   the derived UV will not. Pass `aInst.w` through as a varying and multiply, or
   accept the change deliberately — but decide it, do not discover it.
2. **`cotangent(gN,vWorld,vUV)`** at `mesh.js:916` builds the tangent frame from
   `vUV`. It must use whichever UV actually addresses the normal map, or the
   normal map's tangent basis and its lookup disagree and lighting goes subtly
   wrong in a way that is easy to miss on flat faces and obvious on curved ones.

**Acceptance:** an A/B capture at `SPAN_MIN` over the same seed must be visually
indistinguishable. This step is a refactor; if it changes the picture, it is
wrong. `tools/audit-material-variety.mjs` and the tile metrics in
`.tmp/tilestats` should be unchanged.

### Step 2 — write a real unwrap into the freed lanes

`MeshBuilder` starts emitting an asset-local 0..1 UV into lanes 9-10 instead of
the planar one. The unwrap does not have to be good; it has to be **injective**,
which the current one is not (measured mean overlap factor 8.59, worst texel
500-1500 faces). A per-primitive box unwrap packed into a grid is sufficient and
is a few dozen lines in the builder — every primitive already knows its own
extent.

### Step 3 — bind the per-asset map

`materials-world-v2.js:177` already demonstrates the pattern with `uRect`: one
extra uniform selecting a sub-rectangle of a shared page, so per-asset maps cost
one uniform, not one texture bind per unit. Copy that rather than inventing a
second scheme, and keep it in FS3D rather than adding a third lighting shader to
hold in sync.

## Why this order

Step 1 is the only risky part and it is a pure refactor with an exact acceptance
test — a screenshot that must not change. Steps 2 and 3 are additive and cannot
regress anything that does not opt in. Doing them in the other order means
debugging a new unwrap and a new binding against a UV path that is still moving.

## What this does not fix

Nothing here touches the Brood's 33 unit types sharing 14 meshes
(`tools/audit-material-variety.mjs`). Six chassis that are the same model remain
the same model with better texels on them. That is separate, larger, and worth
doing first if the goal is "units look like themselves".
