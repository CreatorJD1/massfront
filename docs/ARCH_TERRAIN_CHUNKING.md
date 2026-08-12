# Terrain chunking — culling the last unculled pass

**Target:** 4,000 units on mobile. Remove the ~205k triangles of terrain that are
submitted every frame regardless of where the camera is looking.
**Status:** architecture + staged migration plan. **No code changed.**

---

## 0. The measured problem

Everything in `render3d.js` is culled against `camBounds()` — units, buildings,
props, rocks, trees, crystals, world sites, shadows, burns, particles all pass
through `vis()` (`src/ui/render3d.js:621`, and again for shadows at `:75`).
Terrain does not.

| Fact | Where | Value |
|---|---|---|
| Grid resolution | `src/engine/terrain.js:27` | `TGRID=320` → 10 m cells on the 3,200-unit map |
| Vertices | `terrain.js:28` (`TVERT=321`) | **103,041** (`321²`) |
| Indices | `terrain.js:170,177` | **614,400** → **204,800 triangles** |
| The draw | `terrain.js:611-613` | `gl.drawElements(TRIANGLES, terrIdxCount, UNSIGNED_INT, 0)` — **the whole grid, every frame** |
| Edge skirt | `terrain.js:615-620` | one more unculled draw, **4,800 tris** |
| Water sheet | `terrain.js:621-626` | one more unculled draw, sparse but map-wide |
| VBO | `103041 × 12 floats × 4 B` | **4.72 MB** |
| IBO | `614400 × 4 B` (`UNSIGNED_INT`) | **2.34 MB** |

Against that, `camBounds()` (`src/engine/mesh.js:2080-2092`) says the camera
usually sees a *sliver*. The projection is **orthographic**
(`m4ortho`, `mesh.js:2033`), so `camBounds()` is not a heuristic — it is the exact
axis-aligned bound of the visible ground rectangle.

At the phone viewport used by the capture harness (412×915,
`tools/capture-strategic-icons.mjs:26`) and the most oblique legal pitch
(`PITCH_MIN=1.05`, `mesh.js:2017`):

| `orthoSpan` | yaw | visible ground box | % of the 3,200² map |
|---|---|---|---|
| 420 (`SPAN_MIN`) | 0° | 309 × 604 | **1.8 %** |
| 420 | 45° | 596 × 596 | **3.5 %** |
| 900 (typical tactical) | 0° | 525 × 1158 | **5.9 %** |
| 900 | 45° | 1140 × 1140 | **12.7 %** |
| 1400 | 45° | 1707 × 1707 | 28.5 % |
| 3400 (`SPAN_MAX`) | 45° | 3974 × 3974 | 100 % (clamped) |

**We are paying 100 % of the terrain to display 2–13 % of it**, in the zoom band
where the game is actually played, on the hardware least able to afford it.

---

## 1. The seam constraint — answered, not dodged

`terrain.js:62-70` documents the un-chunked design on purpose:

> HEIGHT TEXTURE — the terrain's own normal map […] Uploading it as ONE global
> R16F sheet lets the fragment stage derive per-pixel normals […] with no new
> geometry, **no chunks**, and — because every deformation already funnels through
> `terrainDirty()` — crater edits re-upload just their window into the same sheet.
> **A single texture cannot have chunk seams.**

### 1.1 That reasoning is still completely valid

It is a statement about **textures and shading continuity**, and it is correct:

- `uHeight` (`heightTex`, `terrain.js:71,84-94`) is one global `R16F` sheet at
  `TS=2048` (`gl.js:1407`). The fragment stage takes central differences across it
  (`uHexelW`, `FST` at `mesh.js:1257-1258`). Split it per chunk and every chunk
  border samples clamped edge texels — the derivative goes to zero along the seam
  axis and you get a lit crease on every boundary. This is the *exact* failure the
  skirt normals hit and which `terrain.js:256-260` records in detail.
- `uMap` is sampled with a **global** UV: `vMapUV = aPos.xz / MAPSIZE_CONST`
  (`mesh.js:1208`). Same for `uGMask` (`FST:1291`) and the detail layers. There is
  no per-chunk UV space to begin with.
- `terrainDirty()` (`terrain.js:397-421`) is a single choke point that re-uploads
  one rectangular window into one sheet. Per-chunk textures turn that into a
  fan-out across up to four sheets with four `texSubImage2D` calls and four
  clamped borders.

**So: do not chunk the texture. Do not chunk the vertex buffer either.**

### 1.2 What we chunk instead: the index buffer, and nothing else

The comment forbids chunking the *data*. It says nothing about the *order in
which we hand triangles to `drawElements`*.

> **Chunk the INDEX BUFFER. Keep one vertex buffer, one height texture, one map
> texture, one program, one VAO, one set of uniforms.**

Seam risk is not "low". It is **structurally zero**:

| Seam mechanism | Why it cannot happen here |
|---|---|
| Texture-border clamping | There is still exactly one of every texture. Not one bind changes. |
| UV discontinuity | UVs are derived from world position in the vertex shader (`mesh.js:1208-1209`). Untouched. |
| Duplicated border vertices drifting apart | There are no duplicates. Neighbouring chunks **reference the same global vertex indices** — one shared vertex, one position, one normal, one colour. |
| Normal discontinuity | Vertex normals come from `refreshTerrainVerts` central differences of the heightfield (`terrain.js:356-359`), which knows nothing about chunks. Per-pixel normals come from the one global sheet. |
| Cracks from partial deform updates | Deformation writes **vertices** (`terrain.js:384-394`). Indices are never touched. See §4.1. |

We are not changing one byte of geometry. We are changing the **order** of the
triangle list and then choosing not to submit some of it. For an opaque,
depth-tested, back-face-culled pass (`render3d.js:611-614`) triangle order is
observationally irrelevant, and the terrain triangles tile the plane without
overlap, so there is not even a z-fight to reorder.

### 1.3 Alternatives considered and rejected

| Option | Verdict |
|---|---|
| Per-chunk VBO + per-chunk height/map textures | **Rejected.** Violates `terrain.js:67-69` directly. Lighting seams, 100× the texture binds, `terrainDirty` fan-out. This is what the comment was written to prevent. |
| Per-chunk VBO, shared textures | **Rejected.** No shading seam, but duplicated border vertices mean a crater that updates one chunk's copy and not its neighbour's opens a geometric crack. `terrainDirty` would need to fan out to 4 chunks and `uploadTerrainRegion`'s clean row-contiguous `bufferSubData` (`terrain.js:390-393`) would be destroyed. All of the risk, none of the extra reward. |
| Geometry/tessellation shader LOD | **N/A.** WebGL2 is ES 3.0. No geometry shaders, no tessellation. |
| GPU-driven vertex-texture-fetch clipmap | **Rejected for now.** Throws away every per-vertex thing `refreshTerrainVerts` computes on the CPU — biome colour, road tiles via `ROADG`, slope-driven `MAT.*` selection (`terrain.js:362-379`). A rewrite of the terrain look, not a culling change. |
| Per-chunk geometric **LOD** (stride-2 indices for far chunks) | **Deliberately deferred.** It works on the same shared VBO, but LOD transitions create T-junctions — real geometric cracks. That is exactly the seam class `terrain.js:69` warns about, re-entering by the back door. Needs skirts or stitched transition strips. Not in this plan. See §8. |
| **Index-range culling on one shared buffer** | **Accepted.** §2. |

---

## 2. Recommended design — two steps, the first is three lines

Ship these in order. Step A is nearly risk-free and captures most of the win;
Step B roughly halves what is left.

### 2.1 Step A — Z-strip culling. No build change at all.

The existing index buffer is already built row-major (`terrain.js:172-176`):

```js
for(let z=0;z<TGRID;z++) for(let x=0;x<TGRID;x++){ … 6 indices … }
```

Therefore **grid row `z` occupies exactly indices `[z*TGRID*6, (z+1)*TGRID*6)`**,
contiguously. A contiguous *range of rows* is one contiguous index range. So
culling in Z costs one clamp pair and a different `count`/`offset` on the *same*
`drawElements` — still **one draw call**, still the whole width, no chunk table,
no reordering, and therefore **zero chance of an index-construction bug**.

```js
function drawTerrain(){
  if(terrainStale()&&!terrainSelfHeal()) return;
  if(!terrVAO) return;
  gl.bindVertexArray(terrVAO);
  if(!TERR_CULL){                                   // kill switch → today's behaviour
    gl.drawElements(gl.TRIANGLES,terrIdxCount,gl.UNSIGNED_INT,0);
    drawCalls++; triCount+=terrIdxCount/3; return;
  }
  const B=camBounds(), cell=MAP/TGRID;              // cell = 10 world units
  const z0=clamp(Math.floor((B.y0-TERR_PAD)/cell),0,TGRID-1);
  const z1=clamp(Math.floor((B.y1+TERR_PAD)/cell),0,TGRID-1);
  const cnt=(z1-z0+1)*TGRID*6;
  gl.drawElements(gl.TRIANGLES,cnt,gl.UNSIGNED_INT,z0*TGRID*6*4);   // *4: Uint32
  drawCalls++; triCount+=cnt/3;
  terrTrisDrawn=cnt/3;                              // §6 instrumentation
}
```

That is the entire change. Result (see the table in §3): **75 % fewer terrain
triangles at `SPAN_MIN`, 58 % fewer at the typical tactical span**, one draw call,
no new memory, no new state.

### 2.2 Step B — 2D chunked index buffer with row-merged draws

Step A cannot cull in X. Step B does, by emitting the same 614,400 indices in
**chunk-major order (x fastest within a chunk row)**.

The critical structural property: because chunks are laid out with X fastest, a
horizontal run of adjacent chunks in the same chunk-row is **still one contiguous
index range**. So a selected `nx × nz` rectangle of chunks costs **`nz` draw
calls, not `nx*nz`** — one per chunk row. That is what makes a fine chunk size
affordable.

Second structural property: the chunk ranges tile `[0, terrIdxCount)` exactly and
without gaps, so **a single `drawElements` over the whole buffer is still a
complete, correct terrain draw**. That is the rollback path, the
`terrainProgOK` fallback path, and the strategic-zoom fast path — for free, with
no duplicate index buffer.

---

## 3. Chunk size — pick 20 cells (200 world units, 16×16 = 256 chunks)

`TGRID=320` divides evenly by 16, 20, 32, 40, 64 and 80. Measured with the real
`camBounds()` formula, real `SPAN_MIN/MAX`, `PITCH_MIN=1.05` (the most oblique,
i.e. worst case), the harness's 412×915 viewport, a 96-unit pad (§3.2) and
row-merged draws:

| span / yaw | 16 cells (20²=400) | **20 cells (16²=256)** | 32 cells (10²=100) | 40 cells (8²=64) |
|---|---|---|---|---|
| 420 / 0° | 6 dr · 15k · 8 % | **5 dr · 16k · 8 %** | 4 dr · 25k · 12 % | 3 dr · 29k · 14 % |
| 420 / 45° | 6 dr · 18k · 9 % | **5 dr · 20k · 10 %** | 4 dr · 33k · 16 % | 3 dr · 29k · 14 % |
| 900 / 0° | 10 dr · 31k · 15 % | **8 dr · 32k · 16 %** | 6 dr · 49k · 24 % | 5 dr · 48k · 23 % |
| 900 / 45° | 10 dr · 51k · 25 % | **8 dr · 51k · 25 %** | 6 dr · 74k · 36 % | 5 dr · 80k · 39 % |
| 1400 / 45° | 13 dr · 87k · 42 % | **11 dr · 97k · 47 %** | 7 dr · 100k · 49 % | 6 dr · 115k · 56 % |
| 2200 / 0° | 19 dr · 97k · 48 % | **16 dr · 102k · 50 %** | 10 dr · 123k · 60 % | 8 dr · 128k · 63 % |
| ≥ 2200 / 45° | full-map fast path → **1 dr · 205k** | | | |

### 3.1 Why 20 and not 16 or 32

- **20 ties 16 on triangles where it matters.** At span 900 both land on 51k. At
  span 420 the gap is 18k vs 20k — 2,000 triangles, noise — for 36 % fewer chunk
  records and 2 fewer draw calls.
- **32 costs 30–65 % more triangles** than 20 across the whole played band (33k vs
  20k at `SPAN_MIN`, 74k vs 51k at span 900). Chunks of 320 world units are simply
  coarser than the 596-unit view they are being fitted to.
- **Draw-call overhead is not the constraint here, and the numbers say so.** A
  `drawElements` with *no intervening state change* — same VAO, same program, same
  uniforms, same textures (§5) — costs roughly 3–8 µs of CPU inside a Chrome/WebView
  command buffer. Eleven of them is **0.03–0.09 ms**, against 1–3 ms of GPU
  geometry work removed. Row-merging is what keeps us in that regime: without it,
  span 900/45° would be 64 draws instead of 8.
- **Going finer than 16 cells** (e.g. 10 cells, 32²=1024 chunks) buys ~1 % more
  culling at `SPAN_MIN` and costs more rows. Past the knee.

**Chosen: `TCHUNK = 20` cells = 200 world units. `TCX = 16`. 256 chunks. 800
triangles / 2,400 indices per chunk.** Bookkeeping cost: two `Int32Array(256)` =
**2 KB**.

### 3.2 The pad, derived not guessed

`camBounds()` bounds the ground *plane* rectangle. A hill inside a chunk whose XZ
footprint sits just outside that rectangle can still project into frame. Under an
**orthographic** projection this displacement is exact, not approximate:

```
max playable relief  = (1 − WATER_H) × HSCALE = (1 − 0.335) × 118 ≈ 78 world units
                        gl.js:2487              terrain.js:34
lean toward the eye  = 78 / tan(PITCH_MIN) = 78 / tan(1.05) = 78 / 1.743 ≈ 45 units
```

`camBounds()` already adds **+60** on every side (`mesh.js:2090`), which alone
covers the 45. `TERR_PAD = 96` is set at ~2× the computed requirement so the cull
stays conservative even if that `+60` is ever retuned for a different reason.
Cost: about one extra chunk per axis, already included in the §3 table.

*(The skirt's 255-unit mountain frame is not covered by this number — it is a
separate mesh with its own rule, §7.)*

---

## 4. Pseudo-code

### 4.1 Build-time — chunk index construction

Goes inside `buildTerrainMesh()` (`terrain.js:166`), replacing only the loop at
`terrain.js:172-176`. Nothing else in that function changes: `terrVerts`
(`:169`), `refreshTerrainVerts` (`:178`), the VAO/attribute setup (`:180-196`) and
the `terrEpoch` stamp (`:207`) are all untouched.

```js
/* 320 % 20 === 0. 16x16 = 256 chunks of 200 world units.
   X IS THE FAST AXIS ON PURPOSE: it is what makes a horizontal run of chunks a
   single contiguous index range, so a selected rectangle costs one draw PER ROW
   instead of one per chunk (§2.2). */
const TCHUNK=20, TCX=TGRID/TCHUNK;                 // 16
const TCHUNK_IDX=TCHUNK*TCHUNK*6;                  // 2400 indices, 800 tris
const TCHUNK_W=MAP/TCX;                            // 200 world units
const TERR_PAD=96;                                 // §3.2
let TERR_CULL=true;                                // the kill switch (§8)
let terrChunkOff=null;                             // Int32Array(TCX*TCX), INDEX units

function buildTerrainIndices(){
  const idx=new Uint32Array(TGRID*TGRID*6);
  const off=new Int32Array(TCX*TCX);
  let ii=0;
  for(let cz=0;cz<TCX;cz++) for(let cx=0;cx<TCX;cx++){
    off[cz*TCX+cx]=ii;
    const x0=cx*TCHUNK, z0=cz*TCHUNK;
    for(let z=z0;z<z0+TCHUNK;z++) for(let x=x0;x<x0+TCHUNK;x++){
      /* IDENTICAL winding and IDENTICAL global vertex ids to terrain.js:173-175.
         Only the order in which the triples appear changes. */
      const a=z*TVERT+x, b=a+1, c=a+TVERT, d=c+1;
      idx[ii++]=a; idx[ii++]=c; idx[ii++]=b;
      idx[ii++]=b; idx[ii++]=c; idx[ii++]=d;
    }
  }
  /* SELF-CHECK, NOT AN ASSERT. If this table is wrong the symptom is a missing
     or shredded map — the catastrophic case (§8). Verify the invariants that
     make the whole-buffer draw legal, and on any doubt fall back to today's
     behaviour rather than draw garbage. */
  const ok = ii===TGRID*TGRID*6
          && off[0]===0
          && off[TCX*TCX-1]+TCHUNK_IDX===ii;
  if(!ok){ console.warn('terrain: chunk table invalid — culling disabled');
           TERR_CULL=false; terrChunkOff=null; }
  else     terrChunkOff=off;
  terrIdxCount=ii;                                 // still 614400 — unchanged
  return idx;
}
```

`terrIdxCount` keeping its value matters: `drawTerrainFallback` (`terrain.js:599`)
and the diagnostics readout (`mesh.js:1912`) both use it and neither needs to
know chunking exists.

### 4.2 Per-frame — cull and draw

Replaces `drawTerrain()` (`terrain.js:608-614`). The stale/self-heal guard at
`:609` is preserved verbatim — it is load-bearing (`terrain.js:557-568`).

```js
let terrChunksDrawn=0, terrTrisDrawn=0;            // §6 instrumentation
function drawTerrain(){
  if(terrainStale()&&!terrainSelfHeal()) return;   // UNCHANGED
  if(!terrVAO) return;                             // UNCHANGED
  gl.bindVertexArray(terrVAO);

  /* Three ways to end up drawing the whole grid, all of them producing exactly
     today's single call: the kill switch, a table that failed its self-check or
     was cleared by terrainGLReset(), and the strategic-zoom fast path below. */
  if(!TERR_CULL||!terrChunkOff){
    gl.drawElements(gl.TRIANGLES,terrIdxCount,gl.UNSIGNED_INT,0);
    drawCalls++; triCount+=terrIdxCount/3;
    terrChunksDrawn=TCX*TCX; terrTrisDrawn=terrIdxCount/3; return;
  }

  const B=camBounds();                             // mesh.js:2080 — the shipped authority
  const inv=1/TCHUNK_W;
  const cx0=clamp(Math.floor((B.x0-TERR_PAD)*inv),0,TCX-1);
  const cx1=clamp(Math.floor((B.x1+TERR_PAD)*inv),0,TCX-1);
  const cz0=clamp(Math.floor((B.y0-TERR_PAD)*inv),0,TCX-1);
  const cz1=clamp(Math.floor((B.y1+TERR_PAD)*inv),0,TCX-1);
  const nx=cx1-cx0+1, nz=cz1-cz0+1, sel=nx*nz;

  /* WHOLE-MAP FAST PATH — two jobs.
     (a) Past ~2/3 coverage the culled triangles no longer pay for the extra
         calls, so one call is simply better.
     (b) It keeps terrain draw calls MONOTONIC IN ZOOM. Without it, strategic
         zoom would issue 16 terrain draws where tactical zoom issues 5, which
         inverts the assertion at tools/capture-strategic-icons.mjs:87. See §6.2. */
  if(sel*3>=TCX*TCX*2){
    gl.drawElements(gl.TRIANGLES,terrIdxCount,gl.UNSIGNED_INT,0);
    drawCalls++; triCount+=terrIdxCount/3;
    terrChunksDrawn=TCX*TCX; terrTrisDrawn=terrIdxCount/3; return;
  }

  /* ONE DRAW PER CHUNK ROW. Chunks in a row are contiguous (x is the fast axis),
     so nx chunks collapse into a single range. No state changes between calls —
     same VAO, same program, same uniforms, same textures (§5). */
  const cnt=nx*TCHUNK_IDX;
  let tris=0;
  for(let cz=cz0;cz<=cz1;cz++){
    gl.drawElements(gl.TRIANGLES,cnt,gl.UNSIGNED_INT,terrChunkOff[cz*TCX+cx0]*4);
    tris+=cnt/3;
  }
  drawCalls+=nz; triCount+=tris;
  terrChunksDrawn=sel; terrTrisDrawn=tris;
}
```

Allocation per frame: **zero**. `camBounds()` returns a fresh object literal —
if that shows up in a GC profile, hoist the call from `render3d.js:619` and pass
the bounds in, since the render loop has already computed it that frame.

### 4.3 Dirty-chunk update after deformation — **there isn't one**

This is the strongest argument for index-only chunking, so it is worth stating
flatly rather than burying in a table.

Every deformation path in the game funnels into `terrainDirty(wx,wy,rad)`
(`terrain.js:397`):

| Caller | Where |
|---|---|
| `applyDeform` (shell craters, superweapon pits, collapses) | `gl.js:3237` |
| `linkFoundation` (apron links between structures) | `gl.js:3562` |
| `makeFoundation` (levelled + paved building pads) | `gl.js:3612` |
| `makeOrganicFoundation` (Brood creep beds) | `gl.js:3663` |

`terrainDirty` does exactly four things (`terrain.js:399-420`):

1. `refreshTerrainVerts(gx0,gz0,gx1,gz1)` — rewrites **vertices** in `terrVerts`.
2. `uploadTerrainRegion(...)` — row-contiguous `bufferSubData` into **`terrVBO`**.
3. `uploadHeightTex(...)` — `texSubImage2D` into the one global **`heightTex`**.
4. A wet/dry comparison that may set `waterDirty`.

**None of these touches the index buffer.** The chunk table is a function of
`(TGRID, TCHUNK)` — both compile-time constants — and of nothing else. It cannot
go stale, because there is nothing in it that deformation can invalidate.

```js
function terrainDirty(wx,wy,rad){
  // ... unchanged, byte for byte ...
  // NO chunk invalidation. NO index rebuild. NO per-chunk bounds recompute.
}
```

The one thing that *would* have needed dirty tracking is a per-chunk Y extent for
a 3D frustum test — a crater deepens a chunk, a foundation flattens one. **We
deliberately do not have one.** The cull is XZ-only with a pad derived from the
global height range (§3.2), which is precisely how `vis()` culls everything else
in the renderer (`render3d.js:621`). The pad is ~2× the worst case any
deformation can produce, so it stays valid without bookkeeping. Consistency with
the existing culling convention *and* zero deform coupling, for the price of
about one extra chunk ring.

The only invalidation that exists is context loss, and it is one line in
`terrainGLReset()` (`terrain.js:96-103`, which already nulls
`terrVAO/terrVBO/terrIBO`):

```js
function terrainGLReset(){
  heightTex=null; terrHealTries=0; terrEpoch=-1;
  terrVAO=terrVBO=terrIBO=null;
  terrChunkOff=null;              // ← rebuilt by buildTerrainIndices on self-heal;
  terrEdgeVAO=terrEdgeVBO=terrEdgeIBO=null;   //  null makes drawTerrain take the
  waterVAO=waterVBO=waterIBO=null;            //  full-draw path until it is back.
}
```

---

## 5. What a per-chunk draw does and does not rebind

Read `render3d.js:654-713`. Every piece of terrain state is set **once**, before
`drawTerrainEdge()`/`drawTerrain()`:

| State | Set at | Per-chunk? |
|---|---|---|
| `gl.useProgram(progT)` | `render3d.js:654` | **No** |
| `uVP`, `uEye`, `uSun`, `uSunC`, `uAmbSky/Gnd`, `uFogC` | `:655-661` | **No** |
| `uMap`(0), `uDetail`(1), `uFogMap`(7), splats(8,9,11,12,13), `uHeight`(10), normals(2,3,14,15) | `:662-682` | **No** |
| `uRealTex`, `uPlayBounds`, `uEdgeStyle`, `uEdgeTime`, `uEdgeTint`, `uFogActive` | `:667,683,688-689,711` | **No** |
| `uBurns[16]`, `uBurnKind[16]`, `uBurnN` | `:693-710` | **No** |
| `gl.bindVertexArray(terrVAO)` | once in `drawTerrain` | **No** |
| `gl.drawElements(TRIANGLES, count, UNSIGNED_INT, offset)` | — | **Yes, and only this** |

Nothing in `VST` (`mesh.js:1195-1241`) or `FST` (`mesh.js:1242+`) is per-chunk.
Everything either comes from the vertex attributes or is derived from world
position (`vMapUV`, `vDetUV`, `vBorder`, `vFog`, the superellipse `vPlayBorder`
block). There is no chunk id, no per-chunk transform, no per-chunk texture.

This is the cheapest kind of multi-draw there is: **N calls, zero state changes**,
i.e. N × the driver's per-call validation cost and nothing else. It is also why
Step A and Step B produce a pixel-identical image to today.

Worth noting for the win estimate: `VST` is **not** a trivial vertex shader. Lines
`1221-1231` run one `atan`, three `pow` and six `sin` per vertex for the
superellipse play-boundary term. Culling 75 % of 103,041 vertices removes ~77,000
executions of that block per frame.

---

## 6. Index width: does 16-bit become possible?

**Globally, no.** 103,041 vertices > 65,535. `UNSIGNED_INT` is mandatory for a
whole-map draw — which is exactly why `terrain.js:612` uses it.

**Per chunk, technically yes.** A 20×20 chunk touches 21×21 = 441 distinct
vertices, and — the number that actually matters — the *span* of global vertex ids
it references is `20*TVERT + 20 = 6,440`, comfortably inside 16 bits. (Even a
80-cell chunk spans `80*321+80 = 25,760`.) So chunk-relative 16-bit indices are
representable.

**But you cannot cheaply use them, and the saving is not worth what it costs:**

- **WebGL 2.0 core has no `drawElementsBaseVertex`.** There is no parameter on
  `drawElements` to add a base vertex. The only core-adjacent route is the
  `WEBGL_draw_instanced_base_vertex_base_instance` extension, which is not
  dependable across the Android WebView / iOS WKWebView estate this game ships to.
- **The fallback route costs more than it saves.** Offsetting the attribute
  pointers per chunk (`base * VSTRIDE`, 48 B — legal, `mesh.js:547`) needs **one
  VAO per chunk**, so every draw becomes `bindVertexArray` + `drawElements`. A VAO
  bind is a heavier state change than the draw it enables — we would trade a free
  multi-draw for 256 state changes.
- **It destroys the two properties the whole design rests on**: chunk-relative
  indices are not valid for the whole-buffer draw, so the rollback path, the
  `terrainProgOK` fallback and the strategic-zoom fast path all break, and the
  render stops being pixel-identical to today.

**What it would actually save:** IBO 2.34 MB → 1.17 MB, and index-fetch bandwidth
halves. At the typical culled load (51,200 tris = 153,600 indices) that is
614 KB/frame → 307 KB/frame; at 60 fps, 37 MB/s → 18 MB/s. On a phone with
~10–25 GB/s of memory bandwidth that is **0.1–0.4 %**. Index fetch is not the
bottleneck — vertex shading and tile binning are, and culling addresses those
directly.

**Verdict: keep `UNSIGNED_INT`.** Revisit only if VRAM pressure becomes real, and
note the IBO is half the size of the VBO it indexes (4.72 MB) and ~1/7 the size of
the 2048² RGBA terrain texture with mips.

A secondary, *unquantified* effect worth measuring rather than claiming: today's
row-major order puts a quad's upper vertices **321 indices** behind its lower ones,
which no vertex-reuse window reaches. Chunk-major order shortens that distance to
**21**, which is inside the batch window some mobile vertex pipelines use. It may
improve vertex reuse. Do not budget for it; measure it (§7.2).

---

## 7. Interaction with the edge skirt and the water pass

### 7.1 Edge skirt (`drawTerrainEdge`, `terrain.js:615-620`)

Built by `buildTerrainEdgeMesh` (`terrain.js:216-328`) as four rectilinear strips:
north and south are `along`(73) × `bands`(11), west and east are `bands`(11) ×
`middle`(49). That is `2×(72×10×2) + 2×(10×48×2) = 4,800 triangles` — **2.3 % of
terrain**, one draw call, drawn immediately before the terrain
(`render3d.js:714`) with the same program and the same uniforms.

- **Phase 1: leave it alone.** 2.3 % is not where the win is, and it shares
  `progT`'s state so it costs nothing extra to keep as one call.
- **Phase 3 (cheap, and it deletes the pass entirely when mid-map):**
  `addRect` (`terrain.js:268-299`) already appends each strip contiguously, so
  capturing `[base, count]` per side is four lines and gives four natural index
  ranges. Reject a side when its expanded rect misses `camBounds()`.
- **Its pad is different and larger.** The skirt carries the mountain frame:
  `peakAmp` up to **255** (`terrain.js:233`) over a `TERR_EDGE_EXT=960` band
  (`terrain.js:53`). At `PITCH_MIN` a 255-unit peak leans `255/tan(1.05) ≈ 146`
  units toward the eye. Use **`SKIRT_PAD = 220`** for the skirt, not the terrain's
  96. Do not share the constant.
- With that pad, a camera at `SPAN_MIN` anywhere in the map interior rejects all
  four sides: **−4,800 triangles and −1 draw call**.
- The skirt is a **separate VBO/VAO** (`terrEdgeVAO`, `terrain.js:54,306-327`)
  built from its own `edgeH` function, joining the playable field at
  `outside == 0` where relief is forced to zero (`terrain.js:272-276`). Terrain
  index chunking cannot affect that join in any way — different buffer, different
  vertices, untouched.

### 7.2 Water (`drawWater`, `terrain.js:621-626`)

Water is **already partly culled by construction**: `buildWaterMesh`
(`terrain.js:436-510`) emits triangles only for cells that are actually wet
(`terrain.js:441-450, 465-469`), and `render3d.js:1521` skips the whole pass when
`waterIdxCount === 0`. On dry maps this pass costs nothing; on `isles` it is large.

Three things to say about it:

1. **The same index-chunking trick applies, and applies more easily than it looks.**
   Water vertices are compacted through `map[]` (`terrain.js:439,456,466`), so they
   are not on the terrain's vertex numbering — but chunk assignment is by **cell**
   `(z,x)`, and the triangle-emitting loop at `terrain.js:465` is already indexed
   by cell. Reordering that loop chunk-major and recording offsets is the same
   change as §4.1. Chunks are sparse (many contain no water), so store
   `[off,count]` pairs rather than assuming a fixed stride.
2. **Staleness is impossible by construction.** A crater that floods triggers
   `waterDirty` (`terrain.js:412-420`), and `waterMaintain` rebuilds via
   `buildWaterMesh`, which **deletes and recreates the entire VAO atomically**
   (`terrain.js:489-509`) precisely because a partial rebuild once drew "enormous
   stretched sheets off the map". The chunk table is produced by the same function
   in the same pass, so it is replaced atomically with the buffers it describes.
3. **Water is the one pass where triangle order is not free.** It is drawn with
   `prog3D` under `BLEND`, `depthMask(false)` and `CULL_FACE` disabled
   (`render3d.js:1523-1526`), and alpha blending is order-dependent. In practice
   the sheet is a single non-overlapping plane at `WATER_Y` ± wave amplitude
   (`terrain.js:546-548`), so overlapping fragments only occur at grazing angles
   through crests. The risk is small but it is **not structurally zero the way the
   terrain's is**. Therefore: **chunk water last, and gate it on a screenshot diff
   on the `isles` map at low pitch.**

**Adjacent finding, out of scope but worth recording:** `animateWater`
(`terrain.js:515-556`) rewrites **every** water vertex on the CPU and re-uploads
the **entire** buffer (`terrain.js:554-555`) every 4th frame
(`render3d.js:1522`) — including the fog-of-war colour pass at `:540-545`, which
calls `covAt`/`fogExploredAt` per vertex. That cost is unculled and index chunking
does not touch it. On a flooded map it is likely a bigger CPU win than the draw
call. Worth its own pass: restrict the loop and the `bufferSubData` to the vertex
rows inside `camBounds()`.

---

## 8. Risks and rollback

**"The map isn't rendering" is the catastrophic failure**, and this repo has been
there — `render3d.js:640-647` documents a build where the terrain program failed
to link and the ground was simply absent, visible only in a phone's console. Every
mitigation below exists to make that outcome impossible to reach from this change.

| Risk | Severity | Mitigation |
|---|---|---|
| Chunk table wrong → shredded or missing map | **Catastrophic** | Build-time self-check (§4.1) validates `ii`, `off[0]` and `off[last]+stride === ii`. On failure it `console.warn`s and sets `TERR_CULL=false` — degrading to today's exact behaviour, never to garbage. |
| Latent bug found in the field | **Catastrophic** | `TERR_CULL=false` is a one-flag revert to `drawElements(…, terrIdxCount, …, 0)`. Because the chunk ranges tile the buffer exactly, this is not "close to" today's render — for an opaque depth-tested back-face-culled pass it is **pixel-identical**. |
| `terrainProgOK` fallback breaks | **Catastrophic** | `drawTerrainFallback()` (`terrain.js:595-607`) is the emergency path taken at `render3d.js:648-653`. **Do not chunk it.** Leave it as the single full-buffer draw. It works untouched because `terrIdxCount` is unchanged. |
| Context loss leaves a stale table | High | `terrChunkOff=null` in `terrainGLReset()` (§4.3). `drawTerrain` takes the full-draw path while it is null, and `terrainSelfHeal()` (`terrain.js:575-590`) rebuilds it via `buildTerrainMesh`. Test with `WEBGL_lose_context` × 3 cycles — the self-heal is bounded to 3 attempts (`terrain.js:576`). |
| Terrain pops in at the view edge | High (very visible) | Orthographic projection makes `camBounds()` exact; the pad is derived at ~2× worst-case relief (§3.2). Verified by the screenshot-equality test (§9), which must show **zero** differing pixels, not "close". |
| `camBounds()` semantics change later | Medium | The terrain cull uses the same helper as every other pass, so it moves with them. `TERR_PAD` is an independent constant, not a reuse of the `+60`. |
| Existing strategic-zoom harness flips | **Medium — will happen without the fast path** | `tools/capture-strategic-icons.mjs:87-88` asserts draw calls and triangles both *fall* as you zoom out. Terrain is constant today, so it is neutral to both. After chunking it *rises* with zoom-out. The §4.2 fast path fixes the draw-call assertion outright (1 call at strategic zoom vs 5–11 at tactical). The **triangle** assertion is not automatically safe: terrain adds back ~154k triangles going from span 900 to span 3400, and the check only passes if the unit-model drop exceeds that. Run the harness before and after; if it flips, subtract `terrTrisDrawn` rather than loosening the check — the assertion is about the icon tier and should keep measuring the icon tier. |
| Water blend order (Phase 4 only) | Medium | See §7.2.3. Gate on an `isles` screenshot diff. |
| Per-chunk LOD cracks | — | **Not in this plan.** Deferred precisely because it re-creates the seam class `terrain.js:69` warns about. If ever attempted it needs skirts or stitched transition strips, and its own document. |

### Rollout order (each step independently shippable and revertable)

1. **Step A** (§2.1) behind `TERR_CULL`, default **off**. Verify pixel-equality
   and the counters. Flip on. Measure on device.
2. **Step B** (§2.2/§4) behind the same flag. Verify pixel-equality again. Flip on.
3. Skirt side rejection (§7.1).
4. Water index chunking + camera-culled `animateWater` (§7.2).
5. Per-chunk LOD — **not scheduled**.

---

## 9. Expected win, and how to measure it

### 9.1 Expected win

| Quantity | Today | Step A | Step B | Note |
|---|---|---|---|---|
| Terrain tris @ span 420 | 204,800 | ~51,000 (−75 %) | **~18,000 (−91 %)** | |
| Terrain tris @ span 900 (typical) | 204,800 | ~86,000 (−58 %) | **~51,000 (−75 %)** | |
| Terrain tris @ span 1400 | 204,800 | ~122,000 (−40 %) | **~97,000 (−53 %)** | |
| Terrain tris @ span ≥ 2200/45° | 204,800 | 204,800 | 204,800 (0 %) | fast path; the whole map really is on screen |
| Terrain VS invocations @ span 900 | ~103,000 | ~43,000 | **~26,000** | each running `VST`'s `atan`+3×`pow`+6×`sin` block |
| Terrain draw calls | 1 | **1** | 5–11, or 1 at strategic zoom | |
| CPU in `drawTerrain` | ~0 | ~0 | **+0.03–0.09 ms** (a real, accepted regression) | |
| GPU frame time, mid-range Android, span 900 | — | — | **−0.8 to −3.5 ms** | see the honesty note below |
| VRAM | 7.06 MB (VBO+IBO) | unchanged | **unchanged** | |
| Per-frame allocation | 0 | 0 | **0** | |

**State the mechanism honestly, because it determines whether you see the win:**

- The saving is in the **geometry / tile-binning stage**, not fill. The visible
  terrain covers the same pixels either way, so the (very heavy — 10+ samplers,
  `fwidth`-gated branches) terrain fragment shader costs the same. **Anyone
  expecting a fill-rate win will be disappointed and will conclude the change
  did nothing.**
- On tile-based mobile GPUs (Mali, Adreno, Apple) every submitted triangle is
  position-shaded and binned before any tile is rasterised. 200k unculled
  triangles is a classic binning bottleneck there, which is why this change
  targets exactly the hardware that needs it.
- Corollary: **the desktop d3d11 harness will under-report the win.** A discrete
  GPU eats 200k triangles without noticing. Use the harness for *correctness and
  counters*; take the frame-time number on a phone.

### 9.2 How to measure it

**Instrumentation first.** Add two globals beside `drawCalls`/`triCount`
(`mesh.js:678`, zeroed at `render3d.js:597`):

```js
let terrChunksDrawn=0, terrTrisDrawn=0;
```

They isolate the terrain from the aggregate `triCount`, which mixes every pass and
therefore cannot show whether *this* change worked.

**Harness.** Copy the pattern of `tools/capture-strategic-icons.mjs` into
`tools/capture-terrain-chunking.mjs`. The non-negotiable parts of that pattern:

- Headed Chrome at the real executable (`capture-strategic-icons.mjs:20,24-25`),
  `--use-angle=d3d11 --ignore-gpu-blocklist --enable-gpu`.
- **Refuse to run on a software renderer** (`:33-39`) — read
  `WEBGL_debug_renderer_info` and `process.exit(3)` on `/swiftshader|software/i`.
  `docs/POSTMORTEM-1.33.31-REGRESSION.md` records that SwiftShader previews
  already sent one terrain investigation down a wrong path. **Never SwiftShader
  for anything about terrain.**
- Collect `pageerror` and `console` errors across the sweep and fail on any.
- Fill the field first (`:51-64` spawns 220 units) so the measurement means
  something; scale toward 4,000 for the frame-time run.

Then three measurements:

1. **Counters — the culling itself.** Sweep
   `orthoSpan ∈ {420, 900, 1400, 2200, 3400} × camYaw ∈ {0, π/4, π/2}` and read
   `{terrChunksDrawn, terrTrisDrawn, drawCalls, triCount}`. Assert §10's targets.
   This is deterministic and is the primary gate.

2. **Pixel equality — the safety gate.** For each of 8 camera poses (2 yaws × 2
   pitches × 2 spans): pin the camera, screenshot with `TERR_CULL=true`, toggle it
   to `false` in-page, screenshot again, compare. **Require zero differing pixels
   over the terrain region.** Freeze or ignore the animated inputs (`animateWater`
   at `render3d.js:1522`, `uEdgeTime` at `render3d.js:689`, `groundBurns` at
   `:693-710`) so the comparison is meaningful. A nonzero diff means the cull is
   not conservative — that is a hard failure, not a tuning knob.

3. **Frame time — the actual win.** Pin the camera, disable vsync
   (`--disable-gpu-vsync --disable-frame-rate-limit`), collect ~300 `requestAnimationFrame`
   deltas per configuration, report p50 and p95, A/B on `TERR_CULL`.
   `EXT_disjoint_timer_query_webgl2` would be better but is usually not exposed in
   Chrome, so rAF deltas with vsync off are the practical instrument. **Repeat on a
   real Android device** (Capacitor build, `chrome://inspect`) — the desktop number
   is a floor, not the answer.

---

## 10. Acceptance targets

| # | Metric | Instrument | Target |
|---|---|---|---|
| 1 | Terrain triangles @ span 420, any yaw | `terrTrisDrawn` | **≤ 25,000** (from 204,800) |
| 2 | Terrain triangles @ span 900, any yaw | `terrTrisDrawn` | **≤ 60,000** |
| 3 | Terrain triangles @ span 1400, any yaw | `terrTrisDrawn` | **≤ 105,000** |
| 4 | Terrain triangles @ span 3400 | `terrTrisDrawn` | **= 204,800** (whole map is on screen; culling must not lie) |
| 5 | Terrain draw calls, any camera | count in `drawTerrain` | **≤ 12**, and **= 1** for span ≥ 2200 |
| 6 | Monotonic draw calls vs zoom | `capture-strategic-icons.mjs:87` | still **PASS** |
| 7 | Pixel diff, `TERR_CULL` on vs off, 8 poses | screenshot compare | **0 differing pixels** in the terrain region |
| 8 | CPU cost of `drawTerrain` | `performance.now()` around the call, 300 frames | **≤ 0.10 ms p95** |
| 9 | GPU frame time @ span 900, 4,000 units, real device | rAF delta p50 | **≥ 1.0 ms faster**, and **no p95 regression** |
| 10 | Allocation per frame in `drawTerrain` | heap profile | **0 bytes** |
| 11 | VBO / IBO / texture bytes | `gl` buffer sizes | **unchanged** (4.72 MB / 2.34 MB / 2048² set) |
| 12 | Deformation path source | `git diff` | **0 changed lines** in `refreshTerrainVerts`, `uploadTerrainRegion`, `terrainDirty`, `uploadHeightTex` |
| 13 | 60 craters + 20 foundations, then screenshot | scripted, real GPU | ground matches the unchunked build; **no cracks, no seams, no missing chunks** |
| 14 | Context-loss recovery | `WEBGL_lose_context` × 3 | terrain returns each time; `terrChunkOff` rebuilt; `terrHealTries` back to 0 |
| 15 | `terrainProgOK=false` forced | force a `progT` link failure | `drawTerrainFallback` still draws the **full** ground (`terrain.js:599`) |
| 16 | Console errors across the sweep | `pageerror` + `console` | **0** |

Targets 4, 7, 12, 13, 14 and 15 are the ones that protect against "the map isn't
rendering". They are not optional and they are not tuning knobs.

Measure on a real GPU and a real device — **never SwiftShader** — per
`docs/POSTMORTEM-1.33.31-REGRESSION.md`.
