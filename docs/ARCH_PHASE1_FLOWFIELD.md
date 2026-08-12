# Phase 1 — Flowfield pathfinding for 4,000 units on mobile

**Target:** 4,000 active units, 150–400 visible, MASSFRONT's plain-JS/WebGL2 engine
in a Capacitor WebView (Android/iOS) and the web build.
**Status:** architecture + migration plan. No code changed.

## 0. What this engine already has (why this is a migration, not a rewrite)

| Existing | Where | Role in the flowfield design |
|---|---|---|
| `PGS = 384` grid, ~8.33 m cells on the 3,200-unit map | `gl.js:2484` | **This is the flowfield grid.** No new resolution needed. |
| `PASS` — `Uint8Array(384*384)`, 1 = walkable | `gl.js:2485` | **Cost-field source, already built.** |
| `ROADG` — `Uint8Array(PGS*PGS)` road movement bonus | `gl.js:2108/2450` | Cost multiplier (roads = cheaper) |
| `NAVW / NAVCOMP` connected water components | `gl.js:2486` | Per-movement-class passability + unreachable-goal rejection |
| Structure-of-arrays units (`ux[] uy[] uteam[] utype[] ualive[]`) | `sim.js` | Ideal memory layout for a tight lookup loop |
| Local separation / avoidance steering | `sim.js:4138-4238` | **Keep it.** It becomes the local layer under the field. |
| Adaptive fixed-timestep sim (1/12–1/30 s, accumulator, max 3 steps) | `main.js:958-978` | Flowfield consumers run here, not in the render loop |
| **No A\*, no navmesh, no flowfield** | — | Nothing to remove; units currently drive straight at goals |
| **Single-threaded** — no Worker/SharedArrayBuffer anywhere | — | The one genuinely new piece of infrastructure |

**Consequence:** the work is (a) a cost/integration/flow builder, (b) a Worker to run
it off the main thread, (c) a per-unit lookup that replaces "steer at goal" with
"steer along field", keeping the existing separation pass untouched.

---

## 1. Spatial data structure

### 1.1 Grid, not navmesh

Use the existing **uniform 384×384 grid** (147,456 cells, 8.33 m each).

- A navmesh/quadtree wins on memory for sparse static worlds; a flowfield wants
  **O(1) position→cell** (`(y*PGS+x)`) and a dense array to sweep. Uniform grid gives
  both, and matches how `PASS` is already produced.
- 8.33 m ≈ one medium vehicle footprint — fine for strategic routing. Local precision
  is the separation layer's job, not the field's.

### 1.2 Memory layout (all preallocated once per match — zero per-frame allocation)

| Buffer | Type | Bytes | Lifetime |
|---|---|---|---|
| `cost` | `Uint8Array(147456)` | 144 KB | rebuilt on terrain/building change |
| `integration` | `Uint16Array(147456)` | 288 KB | **one shared scratch**, reused per field build |
| `flow[fieldId]` | `Uint8Array(147456)` | 144 KB each | cached per active destination |
| `sectorDirty` | `Uint8Array(576)` | 576 B | 24×24 sectors of 16×16 cells |

**Direction quantisation is the key mobile decision.** Do **not** store `{vx,vy}`
floats (8 B/cell → 1.2 MB per field, thrashes L2). Store **one byte per cell**: an
index into a fixed 256-entry unit-vector LUT (`DIR_X[256]`, `DIR_Y[256]`, `Float32Array`,
8 KB total, permanently hot in L1).

```
flow[c] = 0        → no route (unreachable / blocked)
flow[c] = 1..255   → direction index; angle = (idx-1) * (2π/255)
```

A 144 KB field fits comfortably in a modern mobile L2 (1–4 MB). **30 simultaneous
fields = 4.3 MB** — acceptable, and 30 is far more than a real match needs (see §3.4).

### 1.3 Sectors: partial rebuild + hierarchical culling

Split into **24×24 sectors** of 16×16 cells. A sector stores `{ passableCount, dirtyFlag,
componentId }`.

- Building placed/destroyed → mark that sector dirty → **only its cells** re-cost, and
  only fields whose integration touched that sector are invalidated.
- Sector `componentId` (flood-filled once per map) gives an **O(1) reachability test**:
  if goal and unit are in different components, reject the order immediately instead of
  building a field that can never reach.

---

## 2. Cost → Integration → Flow

### 2.1 Cost field (per movement class: ground / hover / naval / air)

Air skips the field entirely (straight-line + separation). Build one cost field per
class actually in play; ground is the only mandatory one.

```js
// Rebuilt only for dirty sectors. Values are SMALL INTEGERS on purpose (see 2.2).
const COST_IMPASSABLE = 255;
function buildCostField(cls) {
  for (const s of dirtySectors) {
    for (const c of cellsOf(s)) {
      if (!PASS[c])                 { cost[c] = COST_IMPASSABLE; continue; }
      if (!classCanEnter(cls, c))   { cost[c] = COST_IMPASSABLE; continue; } // water/land
      let v = 10;                                    // 10 = "1 tile" baseline
      if (ROADG[c])            v = 6;                // roads cheaper -> traffic uses them
      v += slopePenalty[c];                          // 0..8 from heightF gradient
      v += buildingPad[c] ? 6 : 0;                   // discourage squeezing past bases
      cost[c] = v > 200 ? 200 : v;                   // keep headroom under IMPASSABLE
    }
  }
}
```

**Why integer costs 6–200:** it makes the integration solvable with a *bucket queue*
instead of a binary heap — the single biggest CPU win here (§2.2).

**Deliberately excluded from cost:** unit density. Continuum Crowds folds it in, but it
forces a per-tick global rebuild. On mobile, congestion is handled by the existing
separation pass at ~1/20th the cost. (Optional later: a coarse 24×24 *sector* density
term, rebuilt at 2 Hz.)

### 2.2 Integration field — Dial's bucket queue, not a binary heap

This is the hot algorithm. A binary heap costs `O(N log N)` with unpredictable branches
and pointer chasing; **Dial's algorithm** exploits small integer costs for effectively
`O(N)` with pure sequential array access.

```js
// 147k cells, integer costs -> bucket queue with wrap-around.
const NB = 256;                       // buckets; must exceed max single-step cost
const buckets = Array.from({length: NB}, () => new Int32Array(4096));
const bucketLen = new Int32Array(NB);

function buildIntegration(goalCells) {
  integration.fill(0xFFFF);           // 65535 = unvisited
  bucketLen.fill(0);
  for (const g of goalCells) { integration[g] = 0; push(0, g); }

  let scanned = 0, bucket = 0;
  while (scanned < NB) {
    if (bucketLen[bucket] === 0) { bucket = (bucket + 1) % NB; scanned++; continue; }
    scanned = 0;
    const cell = pop(bucket);
    const base = integration[cell];
    if (base > bucket + (bucket < base ? NB : 0)) continue;   // stale entry

    const cx = cell % PGS, cy = (cell / PGS) | 0;
    for (let n = 0; n < 8; n++) {
      const nx = cx + NX[n], ny = cy + NY[n];
      if (nx < 0 || ny < 0 || nx >= PGS || ny >= PGS) continue;
      const nc = ny * PGS + nx;
      const cc = cost[nc];
      if (cc === COST_IMPASSABLE) continue;
      // Diagonals cost sqrt(2); pre-scaled so everything stays integer.
      const step = (n < 4 ? cc : ((cc * 14) / 10) | 0);
      // Corner-cut guard: a diagonal is illegal if either orthogonal side is solid.
      if (n >= 4 && (cost[cy*PGS+nx] === COST_IMPASSABLE || cost[ny*PGS+cx] === COST_IMPASSABLE)) continue;
      const nd = base + step;
      if (nd < integration[nc] && nd < 0xFFFF) {
        integration[nc] = nd;
        push(nd % NB, nc);
      }
    }
  }
}
```

Notes that matter on mobile:
- **Multi-goal is free.** Seed every cell of a building's footprint, or an entire
  formation target area, with `0`. One field serves "attack this base".
- `Uint16` caps a path at 65,534 cost ≈ 6,500 tiles — far beyond a 384-cell map.
- No allocation inside the loop; buckets are preallocated `Int32Array`s that grow only
  on first use.

### 2.3 Flow field — gradient descent, quantised to a byte

```js
function buildFlow(flow) {
  for (let y = 0; y < PGS; y++) {
    for (let x = 0; x < PGS; x++) {
      const c = y * PGS + x;
      if (cost[c] === COST_IMPASSABLE) { flow[c] = 0; continue; }
      if (integration[c] === 0)        { flow[c] = 0; continue; }   // at the goal
      let best = integration[c], bx = 0, by = 0;
      for (let n = 0; n < 8; n++) {
        const nx = x + NX[n], ny = y + NY[n];
        if (nx < 0 || ny < 0 || nx >= PGS || ny >= PGS) continue;
        const v = integration[ny * PGS + nx];
        if (v < best) { best = v; bx = NX[n]; by = NY[n]; }
      }
      flow[c] = (bx | by) ? encodeDir(bx, by) : 0;
    }
  }
}
```

**Kill grid bias with one smoothing pass.** Pure 8-neighbour descent produces
octile-looking movement. Rather than a costlier eikonal/fast-marching solver, do a
**bilinear sample of the integration field at lookup time** (§3.2) — it converts the
discrete field into a continuous gradient for free and removes almost all visible
staircase.

*(Trade-off, stated plainly: true Continuum-Crowds fast-marching yields ideal
isotropic paths; Dial + bilinear-sampled gradient gets ~95% of the visual quality at a
fraction of the cost, which is the correct call for a 10–15 Hz mobile sim.)*

---

## 3. 4,000 simultaneous lookups without cache misses or main-thread spikes

Four independent problems; each has its own mechanism.

### 3.1 Move field generation off the main thread — **Workers + transferables**

⚠️ **Mobile-web constraint most designs miss:** `SharedArrayBuffer` requires
cross-origin isolation (`COOP`/`COEP` headers). You cannot rely on that for a
HuggingFace-hosted web build, and it is fragile inside a WebView. **Do not architect on
SAB.** Use **transferable `ArrayBuffer`s** — ownership moves, zero copy:

```js
// main thread
worker.postMessage({ type:'buildField', id, goals, costBuf: cost.buffer }, [cost.buffer]);
// cost is now NEUTERED here; the worker owns it and transfers it back with the flow.

// worker
onmessage = ({data}) => {
  const cost = new Uint8Array(data.costBuf);
  const flow = new Uint8Array(PGS*PGS);
  buildIntegration(data.goals); buildFlow(flow);
  postMessage({ id, costBuf: cost.buffer, flowBuf: flow.buffer },
              [cost.buffer, flow.buffer]);
};
```

- The sim **never blocks**: it keeps using the previous field until the new one lands
  (double-buffered per field id). A field that is one tick stale is invisible.
- Worker startup on low-end Android is ~10–30 ms — create it once at match start.
- **Fallback path is mandatory** (old WebViews / worker creation failure): run the same
  builder on the main thread under a **time budget** (§3.3).

### 3.2 The per-unit lookup — SoA + spatial sort + bilinear gradient

The lookup itself is trivial; **the access pattern** is what decides performance.

```js
// Runs inside the existing unitTick(simDt) at 12-30 Hz — NOT at 60 Hz.
function applyFlow(order) {                   // `order` = units sorted by cell (3.2b)
  const inv = PGS / MAP;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const gx = ux[i] * inv, gy = uy[i] * inv;     // continuous grid coords
    const x0 = gx | 0, y0 = gy | 0;
    const f = flowOf(ufield[i]);                  // Uint8Array for this unit's field
    const d = f[y0 * PGS + x0];
    if (!d) { /* no route: fall back to existing direct steer */ continue; }
    // Bilinear-blend the four neighbouring directions -> smooth, no grid staircase.
    const fx = gx - x0, fy = gy - y0;
    let vx = 0, vy = 0;
    for (let n = 0; n < 4; n++) {
      const cx = x0 + (n & 1), cy = y0 + (n >> 1);
      if (cx >= PGS || cy >= PGS) continue;
      const w = ((n & 1) ? fx : 1 - fx) * ((n >> 1) ? fy : 1 - fy);
      const dd = f[cy * PGS + cx];
      if (!dd) continue;
      vx += DIR_X[dd] * w; vy += DIR_Y[dd] * w;
    }
    const l = Math.hypot(vx, vy) || 1;
    uvx[i] = vx / l; uvy[i] = vy / l;             // consumed by the EXISTING separation pass
  }
}
```

**(3.2a) Why this is cache-friendly:** `ux/uy/uvx/uvy` are already parallel typed arrays
(SoA) — the engine's existing layout. Each unit touches 4 adjacent bytes of one 144 KB
field; the direction LUT is 8 KB and stays in L1.

**(3.2b) Spatial sort = the cache-miss fix.** Random unit order → random 144 KB stride →
constant L2 misses. Units in an RTS are **spatially clustered**, so:

- Keep a per-field **counting sort** of unit indices by `cellId >> 4` (sector). Counting
  sort over 576 sectors is `O(n)`, ~4,000 int writes, and runs once per sim tick.
- Iterating in sector order makes field access **near-sequential** — typically a 2–4×
  speedup on the lookup loop on ARM, for ~0.1 ms of sorting.
- Bonus: it's the same ordering the separation pass wants for its neighbour queries.

**(3.2c) Optional swizzle.** For further locality, store fields in 16×16 **tiled (Morton)
order** so a sector is one contiguous 256-byte run (= 4 cache lines). Do this only if
profiling shows the lookup still dominates; it complicates every index.

### 3.3 Never spike the frame — hard time budget + amortised rebuilds

```js
const FIELD_BUDGET_MS = 2.0;                 // main-thread fallback only
function pumpFieldQueue(now) {
  const t0 = performance.now();
  while (fieldQueue.length && performance.now() - t0 < FIELD_BUDGET_MS) {
    stepFieldBuild(fieldQueue[0]);           // resumable: bucket index is state
  }
}
```

- The builder is **resumable** — its state is `(bucketIndex, scanned)`, so it can stop
  mid-integration and continue next tick. A partially-built field is never published.
- **Coalesce requests:** orders issued in the same tick to nearby goals snap to a common
  goal cell and share one field.
- **Rate-limit rebuilds:** a destroyed building dirties sectors, but re-integration runs
  at most once per ~250 ms per field.

### 3.4 Field count is bounded by *destinations*, not units

This is why the design scales to 4,000 units: **units don't own fields, destinations
do.** A 4,000-unit battle realistically has 10–30 distinct goals.

```js
key = hash(goalCellId, movementClass)        // -> fieldId
ufield[i] = fieldId                          // one Uint8/Uint16 per unit
```
LRU-evict beyond `MAX_FIELDS = 24` (3.5 MB). Refcount by unit; a field with zero users
is freed at the next eviction pass.

---

## 4. Migration plan (each step independently shippable)

1. **Field builder + Worker, ground class only**, behind `?flowfield=1`. Units keep
   direct steering; the field is built and validated but not consumed. Verify with a
   debug overlay that draws `flow` as arrows on the minimap.
2. **Consume the field** in `unitTick`, keeping the existing separation pass unchanged.
   Fall back to direct steering wherever `flow[c] === 0`.
3. **Sector dirtying** on build/destroy + reachability rejection via `componentId`.
4. **Naval/hover classes** using the existing `NAVCOMP`.
5. Delete the direct-steer path only once flowfield has shipped and been measured.

## 5. Acceptance targets (measure, don't assume)

| Metric | Target |
|---|---|
| Field build (384², 1 goal, Worker) | < 8 ms; never on the main thread in the default path |
| Main-thread fallback step budget | ≤ 2 ms/tick, resumable |
| 4,000-unit lookup pass @ 12 Hz | ≤ 1.5 ms total (after spatial sort) |
| Memory, 24 cached fields | ≤ 4 MB |
| Per-tick allocation | **0 bytes** (all buffers preallocated) |
| Frame-time variance during mass repath | < 2 ms added p99 |

Measure on a real device (and the real-GPU harness), not SwiftShader — per
`docs/POSTMORTEM-1.33.31-REGRESSION.md`.
