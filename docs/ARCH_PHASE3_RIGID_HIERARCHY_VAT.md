# Phase 3 — Rigid mesh hierarchies + animation offloading

**Target:** 4,000 active units, 150–400 visible, MASSFRONT's plain-JS/WebGL2 engine
in a Capacitor WebView (Android/iOS) and the web build.
**Status:** architecture + migration plan. No code changed.

Supreme Commander 2 animated mechanical units as **rigid piece hierarchies** — a hull
carrying a turret carrying a barrel — not as skinned skeletons. This engine already
made that same call, in two different places, for two different reasons. This document
establishes exactly how far that gets us, what a third level actually costs, and
whether Vertex Animation Textures are worth anything on the organic side.

## 0. What this engine already has (measured, not assumed)

| Existing | Where | Role in this design |
|---|---|---|
| `INST_FLOATS=12`, `INST_STRIDE=48` | `mesh.js:548` | **All 12 lanes are spoken for** (see §0.1) |
| `UNIT_MESH[t] = {hull, tur, s, turH, air}` | `models.js:4167-4171` | **Hull and turret are already SEPARATE InstMesh streams** |
| Hull at `uang[i]-π/2`, turret at `uturr[i]-π/2` | `render3d.js:1213-1214` | A working, batched, 2-level rigid hierarchy |
| Rigid FK bone chain in the vertex stage | `mesh.js:697-762` | 8 links deep, per-MODEL uniforms, per-INSTANCE phase |
| `MAX_BONES=80`; largest live rig uses **72** | `mesh.js:554`; Brood Sovereign | 8 bones of headroom, no more |
| `aMat` is TRIPLE-packed: sign / int / fraction | `mesh.js:745-746, 763, 813` | **No spare vertex float either** (`VFLOATS=12`, `mesh.js:90`) |
| `MAT.SERVO=18` drives the machine walk cycle | `materials.js:26`; `mesh.js:764, 776-778` | Guarded by four `verify-*-semantic-packs.mjs` tools |
| `gl_VertexID` already used in a shipped shader | `mesh.js:1580` | GLSL ES 300 VAT reads are available on this target *today* |
| `drawDropCraft()` composes child transforms on the CPU | `render3d.js:508-563` | The existing deep-hierarchy pattern — **and why it doesn't scale** |
| `MF2InstMesh`/`MFWorldV2InstMesh` `extends InstMesh` | `materials-v2.js:253`, `materials-world-v2.js:172` | Any instance-layout change propagates to all three automatically |
| Strategic icon tier `continue`s before all mesh work | `render3d.js:1142-1153` | Most of a 4,000-unit army never reaches the animation path at all |
| Texture units 0,1,2,3,7,8 bound for `prog3D` | `mesh.js:1955`; `render3d.js:303` | Unit 9+ is free for a VAT sampler |

### 0.1 The instance stream is full. This is the fact everything else hangs on.

```
loc5  vec4  aInst   x, height, y, uniform scale          mesh.js:595, 642
loc6  float aYaw    yaw                                   mesh.js:597, 643
loc7  vec4  aTint   r, g, b, a                            mesh.js:599, 644
loc8  float aWide   independent Z scale (lines need it)   mesh.js:601, 645
loc9  float aAnim   gait phase                            mesh.js:606, 646
loc10 float aState  V2 profile band * 2 + damage, 0..5.999 mesh.js:612, 651
```

Two of those are already carrying a second signal on top of the first:

- **`aTint.a` is overloaded.** `vAlpha=min(aTint.a,1.0); vInstEmis=max(0.0,aTint.a-1.0)`
  (`mesh.js:818`) — alpha 0..1 is transparency, everything above 1.0 is per-instance
  emissive. There is no room above or below.
- **`aState` is overloaded.** `clamp(state||0,0,5.999)` (`mesh.js:651`) packs
  `profile*2 + damage` — three V2 profile bands each carrying a `[0,1)` damage
  fraction. Adding a third field means re-cutting the band and invalidating every
  existing profile assignment.

`aWide` is a real geometric parameter (`FX.line` needs length and thickness to be
separate numbers — `mesh.js:635-638`). `aAnim` is read by both the bone chain
(`mesh.js:758`) and the SERVO walk (`mesh.js:776-778`).

**Conclusion: there is no spare instance float.** Every proposal below is measured
against that, not against a hope that one turns up.

### 0.2 Measured geometry (built from the live builders, not estimated)

The five organic models, and the roster they sit in:

| Model | verts | tris | bones |
|---|---|---|---|
| `UNIT_MDL[12]` (base roster organic) | 3,860 | 1,930 | 48 |
| `UNIT_MDL[13]` | 6,496 | 3,248 | 62 |
| Brood Sovereign (30) | 9,684 | 4,842 | **72** |
| Brood Tidecaster (31) | 5,224 | 2,612 | 57 |
| Brood Prospector (32) | 2,932 | 1,466 | 30 |
| **Total, five organic models** | **28,196** | 14,098 | — |

Roster shape: **31 `UNIT_MDL` slots, 11 of which have a separate turret stream, and
exactly 3 of which carry any bones at all** (12, 13, 30). Faction kits add up to 27
(nova) / 27 (legion) / 14 (syndicate) / 5 (brood) more entries, deduplicated by
builder name at `models.js:2175`.

**26 of 31 unit models are rigid boxes with a yaw and nothing else.** Hold that number
in mind through §2 and §3.

---

## 1. Parent–child transform hierarchy that still batches

### 1.1 What already works, and *why* it works

```js
// render3d.js:1213-1214 — two levels, two streams, still one draw call each.
M.hull.add(X,Y,H+bob,        ss, uang[i] -Math.PI/2+bank, tc[0],tc[1],tc[2],a,wide,anim,        surfaceState);
if(M.tur)
M.tur .add(X,Y,H+M.turH*ss,  ss, uturr[i]-Math.PI/2,      tc[0],tc[1],tc[2],a,wide,organicPhase,surfaceState);
```

The turret does **not** read a parent matrix. It re-derives its own world transform
from the same sim anchor `(X, Y)` with its own height offset `M.turH*ss` and its own
yaw `uturr[i]`. There is no matrix stack, no per-instance parent index, no GPU-side
composition — and therefore nothing that breaks instancing.

That works because of a constraint the whole engine is built on: **every transform in
this game is (translate, yaw, uniform scale)**. `mesh.js:798-801` composes exactly
that and nothing else:

```glsl
vec3 sp=vec3(ap.x*aInst.w, ap.y*aInst.w, ap.z*aWide);
vec3 p =vec3(sp.x*c - sp.z*s, sp.y, sp.x*s + sp.z*c) + aInst.xyz;   // yaw only
```

A child transform under that algebra is closed-form. If the child pivot is on the
parent's vertical axis — which every turret in this roster is — the child's world
position is *independent of the parent's yaw*, so it needs no parent data at all.

**Cost of level 2 today: zero.** 11 extra `InstMesh` streams for 11 turreted types,
flushed once each per frame (`render3d.js:1246`). That is already shipped and already
paid for.

### 1.2 An off-axis mount is still cheap — but the existing example does it wrong

When the child pivot is **not** on the parent's axis, the CPU must rotate the local
offset into world space. `drawDropCraft()` already does exactly that:

```js
// render3d.js:519-520
const ca=Math.cos(ang), sa=Math.sin(ang);
const xf=(lx,lz)=>[x+lx*ca-lz*sa, y+lx*sa+lz*ca];
// ...and the four VTOL ducts are placed through it — render3d.js:527-533
```

Two multiplies and two adds per child. That scales fine.

**What does not scale is what surrounds it.** `drawDropCraft` calls `.flush(gl)`
*inside* the per-craft function — `render3d.js:514`, `:517`, `:534`. Three-plus draw
calls **per craft**. That is correct for the 1–6 dropships on screen and would be
catastrophic at 150–400 units. The unit loop gets this right by accumulating across
the whole loop and flushing once at `render3d.js:1246`.

> **Rule for any deeper hierarchy: accumulate into the child stream inside the unit
> loop, flush after it. Never flush per entity.** The dropship pattern is a template
> for the *math*, not for the *batching*.

### 1.3 Level 3 — hull → turret → barrel recoil. Four options, honestly costed.

The roster has no animated recoil today. Every "recoil sleeve", "recoil cradle" and
"recoil spade" in `models-units-nova.js:442`, `models-units-legion.js:196/275/570`
etc. is **static geometry named after a mechanism it does not perform**.

#### Option A — a third `InstMesh` stream, composed on the CPU

Split the barrel out of the turret geometry; add `UNIT_MESH[t].bar`.

```js
// inside the existing unit loop, after the M.tur.add() at render3d.js:1214
if(M.bar){
  /* Recoil is DERIVED, not stored. ucool[i] is set to the full cooldown at the
     instant of firing (sim.js:4592) and decays every tick (sim.js:4409), so the
     first ~18% of the cooldown window is the recoil stroke. No new sim array,
     no new instance float, no new per-unit state of any kind. */
  const T2=TYPES[utype[i]], k=T2.cool>0 ? ucool[i]/T2.cool : 0;
  const kick=k>0.82 ? (k-0.82)/0.18 : 0;            // 1 at fire, 0 by 18% elapsed
  const ta=uturr[i]-Math.PI/2, back=-kick*T2.size*0.10;
  M.bar.add(X + Math.cos(ta)*back, Y + Math.sin(ta)*back,
            H + M.turH*ss, ss, ta, tc[0],tc[1],tc[2], a, wide, 0, surfaceState);
}
// ...and flush with the rest at render3d.js:1246, NOT here.
```

- **Instance floats needed: 0.** The recoil scalar is reconstructed from `ucool[i]`,
  which already exists and is already decremented every tick.
- **Draw calls: +1 per turreted type actually on screen** — up to +11 for the base
  roster, more once faction kits (`models.js:2177`) are counted. `render3d.js` already
  has 27 flush sites, so this is a ~40% increase in *unit* draw calls.
- **Bandwidth: +48 B per visible barrel.** At 150 turreted units on screen: 7.2 KB per
  frame. Irrelevant.
- **The real cost is art**, not engine: the barrel is currently welded into the turret
  mesh in 11+ builder functions. This is a geometry-split pass across
  `models-units-{nova,legion,syndicate}.js`.

#### Option B — a 13th instance float

Mechanically straightforward: `INST_FLOATS` 12→13, `INST_STRIDE` 48→52,
`layout(location=11) in float aChild;` at offset 48, divisor 1.

- **Attribute budget is fine.** Locations 0–10 are used (`mesh.js:564-613`); GLES 3.0
  guarantees 16 vertex attributes. Location 11 is legal.
- **Propagation is safe-ish.** `INST_FLOATS` is referenced at `mesh.js:548, 558, 626,
  641, 672` and *only* there; `MF2InstMesh` and `MFWorldV2InstMesh` inherit the VAO by
  subclassing (`materials-v2.js:253`, `materials-world-v2.js:172`), and a V2 program
  that does not declare location 11 simply ignores the enabled attribute.
- **Bandwidth: +4 B per instance**, i.e. +104 KB on a full `MAX_INST=26000` buffer
  (`mesh.js:549`) and +4 B × instances actually flushed per frame.

**Reject it anyway**, for two reasons:

1. It buys *one scalar*. A general third level needs at minimum an offset **and** an
   angle. One float only covers a child constrained to pure translation along the
   parent's forward axis — which is exactly the case Option D already covers for free.
2. `mesh.js:80-89` documents what happened the last time a stride grew in this
   codebase: growing `VFLOATS` 12→13 for a bone index left five sites striding by a
   literal 12, "read each vertex from the middle of its predecessor, and sheared whole
   models into coloured shards with a completely clean console." `INST_FLOATS` is
   better contained than `VFLOATS` was, but the precedent is the reason the vertex is
   back to 12 and the bone index lives in a *fraction* instead.

Add a 13th float only when a genuine per-instance scalar appears with **no derivable
source**. Recoil is not that.

#### Option C — pack recoil into an existing lane

Covered in §0.1. `aTint.a` carries alpha and emissive. `aState` carries profile and
damage. `aWide` is a real Z scale. `aAnim` is the gait phase. **Rejected on inspection,
not on principle.**

#### Option D — put the barrel on the FK chain that is already there. **Recommended.**

The vertex stage already evaluates an 8-deep rigid hinge chain:

```glsl
// mesh.js:750-762
if(uBoneN>0 && aBone>=0.0){
  int cur=int(aBone+0.5);
  for(int k=0;k<8;k++){
    if(cur<0 || cur>=uBoneN) break;
    vec4 J=uJoint[cur]; vec4 A=uAxis[cur]; vec2 S=uSwing[cur];
    float ang = S.y + S.x*sin(aAnim + A.w);
    ap = J.xyz + rotAxis(ap - J.xyz, A.xyz, ang);
    cur = int(J.w);
  }
}
```

This is per-**model** state (`uJoint/uAxis/uSwing` uniforms, `mesh.js:663-669`) driven
by one per-**instance** float. It costs nothing per unit and it is already 8 levels
deep. It is the right home for a recoil.

**Why it cannot do the turret**, and this is the important half: the joint angle is
`S.y + S.x*sin(aAnim + A.w)` — an *oscillator*, not an arbitrary angle. A turret must
point at a target. A recoil is genuinely an oscillation. So the chain is wrong for
level 2 (which is why level 2 is a separate stream) and right for level 3.

**Where the free lane is.** `render3d.js:1214` passes `organicPhase` as the turret
stream's `aAnim`, and `organicPhase` is non-zero only for organic units
(`render3d.js:1199`: team 2, horde AI, or types 12/13/30). Turreted units are
machines. **The turret stream's `aAnim` lane is already zero for every unit that has
a turret.** That is the spare per-instance float, and it costs nothing.

**One shader hazard, and it is real.** The whole legacy motion block is gated on
`if(aAnim!=0.0)` (`mesh.js:767`), and inside it:

```glsl
ap.y += (1.0-leg) * abs(sin(aAnim)) * 0.32;      // mesh.js:778 — body bob
```

`leg` is 1 only for `MAT.SERVO` vertices. Every plate vertex on a turret has
`leg == 0`, so writing a non-zero `aAnim` on a turret stream would bob the turret by
up to 0.32 model units — about 1 world unit at typical unit scale. Visible.

**The clean fix is a sign convention.** `aAnim` is always ≥ 0 today: `organicPhase` is
`t*k + i*1.618 + uwalk*0.45` (all positive, `render3d.js:1204-1205`) and `uwalk` is
`% TAU` (`sim.js:4778`). The negative half of the lane is genuinely unused.

```glsl
// mesh.js:767 — one-token change, zero behavioural difference today.
if(aAnim > 0.0){ ...existing walk / spring / breath block, unchanged... }

// new, additive: negative aAnim = rigid actuator drive for the FK chain only.
// The chain at 750-762 reads aAnim through sin(); feed it a mapped stroke instead.
float actuate = aAnim < 0.0 ? -aAnim : 0.0;      // 0..1 recoil stroke
```

and inside the chain, `float ang = S.y + S.x * (A.w < 0.0 ? actuate : sin(aAnim + A.w));`
— joints authored with a negative phase are *actuators* driven linearly by the stroke;
every existing joint keeps its sine.

- **Instance floats: 0. Draw calls: 0. Streams: 0. Sim state: 0.**
- Cost: one shader branch, one `m.joint(...)` + `m.bone(id)` call per turret builder,
  and the barrel geometry emitted on that bone.
- Trade-off stated plainly: a bone-chain recoil is a *rigid pivot about a joint*, so a
  barrel recoiling straight back along its own axis needs the joint placed far behind
  the muzzle to approximate translation with rotation. At battle zoom that reads
  correctly; in the Arsenal close-up it will show as a slight arc. If that matters,
  Option A is the honest answer for the showcase LOD.

#### Decision table

| | New instance floats | New streams | New draw calls | Per-unit sim state | Art work |
|---|---|---|---|---|---|
| **A** separate barrel stream | 0 | +1/type | +11 (base roster) | 0 (derived from `ucool`) | split barrel geo |
| **B** 13th float | +1 | 0 | 0 | 0 | — |
| **C** pack into a lane | 0 | 0 | 0 | 0 | — |
| **D** FK chain, negative `aAnim` | 0 | 0 | 0 | 0 | one joint per turret |

**Ship D. Keep A in reserve for the Arsenal/showcase LOD only.**

### 1.4 Mapping the SC2 piece vocabulary onto this engine

| SC2 piece behaviour | Mechanism here | Status |
|---|---|---|
| Turret aim | Separate `InstMesh` + `uturr[i]` | **shipped** (`render3d.js:1214`) |
| Barrel recoil | FK chain, negative `aAnim` (§1.3 D) | proposed, ~free |
| Spinning radar / rotor | Separate stream, yaw `ang + t*k` | **shipped** for dropships (`render3d.js:531-532`) |
| Off-axis sub-piece | CPU `xf()` into a shared stream | pattern exists (`render3d.js:520`), needs batched flush |
| Leg / walk cycle | `MAT.SERVO` vertex walk + FK chain | **shipped** (`mesh.js:750-778`) |
| Suspension / track sag | — | not worth it at ortho battle zoom |

Depth beyond 3 is already supported: the chain walks 8 links. `hull → turret → barrel
→ muzzle brake` costs nothing extra once the barrel is on a bone.

---

## 2. Vertex Animation Textures for the Brood

### 2.1 What a VAT is, in this engine's terms

Bake the model-space position of every vertex for `F` frames into a texture; the
vertex shader replaces `aPos` with a `texelFetch` keyed on `(gl_VertexID, frame)`.
The bone chain and the spring oscillators are then dead code for that model.

Everything needed is already proven on this target: `gl_VertexID` is used in a shipped
shader at `mesh.js:1580`, the programs are `#version 300 es` (`mesh.js:684`), and
`texelFetch` is core GLSL ES 300.

### 2.2 The exact shader read

```glsl
uniform sampler2D uVAT;        // texture unit 9 — 0,1,2,3 and 7,8 are taken
uniform vec4  uVATCfg;         // x = frames, y = row base, z = decode scale, w = decode bias
uniform float uVATW;           // texel width actually used (see the wrap note below)
uniform float uVATRate;        // gait phase -> animation cycles

vec3 vatPos(){
  float ph = fract(aAnim * uVATRate);          // aAnim is ALREADY the per-instance phase
  float f  = ph * uVATCfg.x;
  float f0 = floor(f), f1 = mod(f0 + 1.0, uVATCfg.x);
  /* Vertex count exceeds the GLES3 MAX_TEXTURE_SIZE floor of 2048 for three of the
     five Brood models, so the row is wrapped. rowsPerFrame is baked into uVATCfg.y
     stride, never computed from a divide here. */
  float col  = mod(float(gl_VertexID), uVATW);
  float wrap = floor(float(gl_VertexID) / uVATW);
  float rpf  = ceil(uVATCfg.x);                // rows per frame, uploaded, not derived
  vec3 p0 = texelFetch(uVAT, ivec2(int(col), int(uVATCfg.y + f0*rpf + wrap)), 0).xyz;
  vec3 p1 = texelFetch(uVAT, ivec2(int(col), int(uVATCfg.y + f1*rpf + wrap)), 0).xyz;
  return mix(p0, p1, f - f0) * uVATCfg.z + uVATCfg.w;
}

vec3 ap = (uVATOn > 0.5) ? vatPos() : aPos;
```

Four details that decide whether this works or produces garbage:

1. **`gl_VertexID` under `drawElementsInstanced` is the *index value* fetched from the
   element buffer**, not a draw-order counter. That is exactly the row we bake — the
   VAT indexes the same vertex array `aNrm/aCol/aUV/aMat` come from, so nothing has to
   be re-derived.
2. **`NEAREST` + `CLAMP_TO_EDGE`, no mips, and blend the two frames manually.**
   Hardware bilinear along the horizontal axis would interpolate between *different
   vertices*. This is the classic VAT bug and it produces a model that melts.
3. **The row must wrap.** GLES 3.0 only guarantees `MAX_TEXTURE_SIZE ≥ 2048`. Three of
   the five measured Brood models exceed that (`6,496`, `9,684`, `5,224` vertices).
   Most Adreno/Mali parts report 4096–16384, but "most" is not a contract for a
   Capacitor build shipping to unknown Android hardware.
4. **`aAnim` is unbounded.** `organicPhase = t*(umov?6.8:2.15) + i*1.618 + uwalk*0.45`
   with `t = performance.now()/1000` (`render3d.js:579, 1204-1205`) grows without
   limit. After an hour it is ~24,000; `fract()` of that in `highp` still resolves, but
   the frame index quantises visibly. **Bound the phase at the source** before shipping
   a VAT — `organicPhase % TAU` costs one modulo per unit per frame.

### 2.3 Format and precision on mobile

| Format | B/vertex/frame | Quantisation over a 14-unit body | Notes |
|---|---|---|---|
| `RGBA16F` | 8 | exact for this range | Filterable in GLES3 core; **no extension needed to *sample***. `EXT_color_buffer_float` is only for rendering *into* it, and we upload. Needs a hand-written f32→f16 packer (~20 lines) — the WebView's `Float16Array` availability is not something to depend on. |
| **`RGB10_A2`** | **4** | **0.0137 units** | **Recommended default.** Core GLES3, filterable, same bandwidth as RGBA8, 2.5× the precision per axis. 2 spare bits in alpha, not enough to be useful. |
| `RGBA8` + decode range | 4 | 0.055 units | Fine at battle zoom (a unit spans 20–40 px over ~25 world units, so this is sub-pixel). Shimmers in the Arsenal close-up. |

The decode range is the AABB of the *animation*, not of the rest pose — a Sovereign's
tendrils sweep outside its static bounds and clamping them is a visible clip.

### 2.4 Memory, with the measured vertex counts

`bytes = Σ(verts) × frames × bytesPerVertexPerFrame`, plus row padding.

At **`RGB10_A2` (4 B)**, all five Brood models at their *current* geometry
(28,196 vertices):

| Frames | Raw | With 2048-wide row padding (14% waste) | Texture |
|---|---|---|---|
| 16 | 1.72 MiB | 2.00 MiB | 2048 × 256 |
| 24 | 2.58 MiB | 3.00 MiB | 2048 × 384 |
| **32** | **3.44 MiB** | **4.00 MiB** | **2048 × 512** |

The Sovereign alone at 32 frames is **1.18 MiB** (9,684 × 32 × 4). `RGBA16F` doubles
every figure — 6.88 MiB for the set at 32 frames.

**What that replaces:** the FK chain's per-model uniform upload is
`80 bones × (vec4 + vec4 + vec2) = 800 floats = 3.125 KiB`, pushed once per
`InstMesh.flush()` (`mesh.js:663-669`). The static vertex buffers for all five models
total `28,196 × 48 B = 1.29 MiB`.

> **So: a 32-frame VAT costs ~4 MiB of GPU memory to eliminate ~3 KiB of uniform
> upload per draw call and ~100 ALU per vertex.** That is the whole trade, stated
> without decoration. Whether it is a good one depends entirely on §3.

**The version actually worth shipping** is the one built on the battle LOD that
`docs/ART_V2_POLY_LOD_PLAN.md` already mandates (200–1,000 tris for these classes;
the measured models are 1,466–4,842 tris, i.e. **5–25× over budget**). Five models at
a 1,000-tri battle LOD ≈ 2,000 vertices each:

`5 × 2,000 × 24 frames × 4 B = 938 KiB` — under 1 MiB, and that is a defensible number.

**Order of operations matters: LOD first, VAT second.** Baking a VAT against geometry
the art plan already says must be deleted means baking it twice.

### 2.5 Interaction with the existing instancing — the strongest argument for VAT

**A VAT changes nothing about the instance stream.** Same `InstMesh`, same
`bufferSubData`, same `drawElementsInstanced`, same one draw call per model
(`mesh.js:671-673`). The per-instance animation phase that a VAT needs is *already
there* in `aAnim` (loc 9), and the phase is *already* desynchronised across a squad
two independent ways:

- `+ i*1.618` per slot at `render3d.js:1205`
- `uwalk[i]=Math.random()*6.283` at spawn (`sim.js:547`), advanced by distance
  travelled at `sim.js:4778` — so a slowed unit takes shorter strides rather than
  moon-walking.

Both survive a VAT unchanged. That is unusual and it is the reason a VAT is even worth
discussing here: in most engines a VAT forces an instancing rework, and in this one it
does not.

What is lost: the FK chain is **continuous** in phase; a VAT is quantised to `F`
frames plus a lerp. At `F=24` over a ~0.9 s stride that is 37 ms per frame — under the
threshold for a walk cycle, and the two-frame lerp hides the rest.

Texture-unit budget is fine: `prog3D` binds 0/1/2/3 (`uMat`/`uDamageTex`/`uNrm`/`uOrm`)
and 7 (`uDetail`) at `mesh.js:1955`, plus 8 (`uFowMap`) at `render3d.js:303`. Units
4/5/6 belong to the AO/bloom post pass (`mesh.js:1848-1849, 1876-1877`) and are not
bound during the 3D pass, but **bind the VAT at unit 9** rather than reusing them —
GLES3 guarantees 16 vertex and 32 combined texture units, so there is no reason to
share.

### 2.6 Coexisting with `SERVO` — the part that will break if it is rushed

`SERVO` is not a vertex *channel* in the usual sense. It is a material id
(`MAT.SERVO=18`, `materials.js:26`) carried in the per-vertex `aMat` attribute
(location 4, `mesh.js:568`) — and `aMat` is **triple-packed**:

```glsl
// mesh.js:745-746, 763, 813
float aMatAbs = abs(aMat);
float aBone   = floor(fract(aMatAbs)*128.0 + 0.5) - 1.0;   // fraction  -> bone index
float matId   = floor(aMatAbs) - 1.0;                       // integer   -> material id
float tw      = aMat < 0.0 ? 1.0 : mix(0.46,0.14,towerSurface);  // sign -> team livery
```

`matId == SERVO_CONST` selects the machine walk (`mesh.js:764, 776-778`);
`BIOLEG_CONST` / `CHITIN_CONST` select the Brood spring and breath
(`mesh.js:765-766, 791-796`). Four tools guard this — `verify-brood-semantic-packs.mjs`
fails the build if `m.mat(MAT.SERVO)` appears anywhere in Brood source (`:36-37`) and
requires the rationale comment to survive (`:43-44`); `verify-{dominion,nova,syndicate}-
semantic-packs.mjs` are the parallel checks.

**A VAT does not touch any of it — provided the bake obeys five rules.**

1. **The VAT is an *additional* resource, never a replacement vertex format.** It
   overrides `aPos` only. The vertex buffer and index buffer stay byte-identical, so
   `aMat`, `aNrm`, `aCol` and `aUV` continue to line up. `gl_VertexID` indexes the same
   array.
2. **The bake must not weld, decimate or re-order vertices.** Any of those silently
   re-assigns every material id, every bone index and every livery sign. This is the
   single most dangerous step in the pipeline. Assert it:
   `bakedRows === geo.v.length / VFLOATS`, and that row *i* is vertex *i*.
3. **Turn the chain and the spring OFF for VAT-driven meshes**, or they double-animate.
   `mesh.js:782-785` already documents this exact failure in the existing system:
   running the two-oscillator spring on top of a real hinge chain "adds a second,
   uncorrelated wobble and the limb reads as rubber." Gate both on `uVATOn`.
4. **Normals go stale.** Baking positions alone freezes lighting in the rest pose. Two
   honest options: (a) for the battle LOD, keep the static `aNrm` — a chitin shell's
   normals barely rotate under a walk cycle, and the whole faction is armour plate by
   design (`models-units-brood.js` header: "chitin is armour"); (b) for the Arsenal
   LOD, bake a second row-block of octahedral-encoded normals (2 B/vertex/frame). Do
   not pretend (a) is free — it is a real, if small, lighting error.
5. **Extend the semantic-pack guard to cover the new asset class.** The Brood check is
   a *source-text* regex over the model source. A VAT pipeline emitting
   `assets/data/*-vat.js` sits outside that glob, so the guard would silently stop
   covering the animated path while still reporting green. Add the new files to the
   verifier's source set **in the same commit** that adds the first VAT.

---

## 3. When VAT is **not** worth it on this project

This is the section that decides the phase. Six reasons, in descending order of force.

1. **26 of 31 unit models have zero bones and zero animation.** They are rigid hulls
   with a yaw (§0.2). A VAT for them is pure loss — memory spent to replicate a
   transform the instance stream already carries in one float.

2. **Most of a 4,000-unit army never reaches the vertex stage at all.**
   `render3d.js:1142-1153` replaces a unit with two billboard quads past a screen-span
   threshold and `continue`s **before** the mesh lookup, the doctrine shell and the
   organic motion. The comment at `:1136` is explicit that this "saves CPU as well as
   pixels." A VAT can only pay across the 150–400 visible band, and inside that band
   only for the ~5 organic models that could use one.

3. **The geometry it would animate is already scheduled for deletion.** Measured Brood
   models are 1,466–4,842 tris against an already-agreed battle budget of 200–1,000
   (`docs/ART_V2_POLY_LOD_PLAN.md`). Baking 1.18 MiB of Sovereign animation before the
   LOD lands is work that gets thrown away.

4. **The FK chain is not a fallback — it is a tuned, working, zero-memory system.**
   30–72 bones with per-joint amplitude, bias and phase (`mesh.js:754-759`), plus a
   two-oscillator spring for unboned parts (`mesh.js:779-793`), plus a breath term for
   chitin (`:794-796`). It costs 3 KiB of uniform per flush and nothing per unit, and
   it produces **continuous** phase where a VAT is quantised. Replacing it buys vertex
   ALU, not fidelity.

5. **GPU memory is the binding constraint on this target, not vertex ALU.** The project
   already treats phone GPU memory as scarce enough to mandate one shared 2816² atlas
   rather than per-variant textures (`ART_V2_POLY_LOD_PLAN.md`, "no unique GPU texture
   per cosmetic variant"), and `sim.js:286-292` says outright that the population cap
   exists because "a phone loses graphics memory before the player has a chance to
   react." A 4 MiB VAT is the same order as the entire material atlas. Spending it to
   win vertex ALU on a top-down orthographic camera — which is fragment- and
   bandwidth-bound long before it is vertex-bound — is the wrong trade.

6. **There is no VAT baker, and four verifiers would have to learn about it.** There
   *is* a working Blender → GLB → `tools/glb-v2-import.mjs` route, a bake pipeline
   (`tools/bake-material-v2-*.py`) and four semantic-pack guards. A VAT introduces a
   new asset class every one of those has to be taught, plus a new failure mode
   (rule 2 above) that is invisible in a screenshot.

### Verdict

**Ship §1 (Option D). Defer VAT.**

The rigid-hierarchy work is essentially free: zero instance floats, zero draw calls,
zero sim state, one shader branch. It delivers the SC2 piece-hierarchy result the phase
is named after.

Revisit VAT only when **both** are true:

- the Brood battle LOD from `ART_V2_POLY_LOD_PLAN.md` has shipped (bringing the bake to
  under 1 MiB), **and**
- a capture on a real device — not SwiftShader — shows the **vertex** stage, not
  fragment or fill, is what limits a Brood-heavy frame.

If a profile ever says otherwise, VAT's correct first scope is exactly one thing the
rigid chain provably cannot express: an **8-frame death/gib deformation** for one or
two models. That is ~300 KiB and it buys something the current system has no path to.

---

## 4. Migration plan (each step independently shippable)

1. **`aAnim > 0.0` gate** (`mesh.js:767`). One token. Zero behavioural change today —
   `aAnim` is never negative. Ship it alone so the sign convention is established
   before anything depends on it.
2. **Actuator joints in the chain**: `A.w < 0.0` selects linear drive instead of sine
   (`mesh.js:758`). Still inert — no model authors a negative phase yet.
3. **One turret, one barrel bone.** Pick the Nova heavy tank (the only fully-authored
   asset per `ART_V2_POLY_LOD_PLAN.md` §"Proof-of-concept"). Author the joint, emit the
   barrel on it, feed `-kick` through the existing turret `aAnim` argument at
   `render3d.js:1214`. Verify draw calls are unchanged.
4. **Roll out across the 11 turreted base-roster types, then faction kits**, one commit
   per family, exactly as the art plan sequences its own rollout.
5. **Off-axis children** (multi-barrel, side sponsons) only if a design needs them —
   using `xf()` from `render3d.js:520` but accumulating into a shared stream and
   flushing at `render3d.js:1246`, never per entity.
6. **VAT: not scheduled.** Revisit against the two conditions in §3.

## 5. Acceptance targets (measure, don't assume)

| Metric | Target |
|---|---|
| Instance floats added | **0** (`INST_FLOATS` stays 12) |
| Vertex floats added | **0** (`VFLOATS` stays 12) |
| Draw calls, 400 visible units, recoil on vs off | **identical** |
| Bone budget after adding barrel joints | ≤ 80 (`mesh.js:554`); Sovereign stays at 72 |
| Turret vertical position, machine unit, recoil active | **0 world units** of bob (the `mesh.js:778` hazard) |
| Existing Brood gait, before vs after the `aAnim>0.0` gate | pixel-identical capture |
| `verify-{brood,nova,legion,syndicate}-semantic-packs.mjs` | pass, unchanged |
| Per-frame allocation in the unit loop | **0 bytes** |
| fps delta at 100 / 200 / 400 units, recoil on vs off | within noise (±1 fps) |
| *If VAT is ever built:* bake row count | `== geo.v.length / VFLOATS`, asserted |
| *If VAT is ever built:* total VAT memory | ≤ 1 MiB (battle LOD only) |

Gate every visual change through the eight states in `docs/ART_V2_ACCEPTANCE.md`, and
measure on a real device (and the real-GPU harness), not SwiftShader — per
`docs/POSTMORTEM-1.33.31-REGRESSION.md`.
