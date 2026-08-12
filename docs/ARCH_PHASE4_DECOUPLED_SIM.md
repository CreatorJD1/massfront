# Phase 4 — Decoupled simulation & tick rate

**Target:** 4,000 active units, 150–400 visible, MASSFRONT's plain-JS/WebGL2 engine
in a Capacitor WebView (Android/iOS) and the web build.
**Status:** architecture + migration plan. No code changed.

> **Read this first: roughly 80% of this phase is already shipped.** The adaptive
> fixed-timestep accumulator at `main.js:956-1003` is correct, is in production, and is
> not the subject of this document. The gap is one specific, bounded thing — **render-
> side interpolation** — and about six lines of hardening around it.

## 0. What this engine already has

| Existing | Where | Verdict |
|---|---|---|
| `requestAnimationFrame` loop with `dt` clamped to 0.25 s | `main.js:926-931` | Correct |
| Adaptive `simDt`: 1/12 · 1/16 · 1/22 · 1/30 by unit count | `main.js:958` | Correct — and keep it (§4) |
| Accumulator with `gameSpeed` folded in | `main.js:959` | Correct |
| `while(acc>=simDt && steps<3)` — bounded catch-up | `main.js:961-962` | Correct |
| Overload drain `if(acc>simDt*3) acc=0` | `main.js:1003` | Correct today, **wrong once alpha exists** (§3.5) |
| All sim consumers inside the step, render outside it | `main.js:963-1002` vs `:1018` | Correct — this is the decoupling |
| Sub-rate work inside the step (AI 0.5 s, fog 0.4/0.5 s, timeline 5 s) | `main.js:992, 996-999, 1000` | Correct |
| Half-rate wildlife with doubled `dt` | `sim.js:4399-4407` | Correct, but **hostile to naive interpolation** (§3.9) |
| Structure-of-arrays units, `MAXU = 34000` | `sim.js:188-190`; `gl.js:28` | Ideal layout for the interpolator |
| `(slot, generation)` pairing via `ugen[]` | `sim.js:232, 235, 546` | **The existing mechanism for exactly this problem** — reuse it |
| `perfBand` hysteresis on a noisy signal | `main.js:937-946` | The pattern §4 asks to copy onto the `simDt` thresholds |
| **No render-side interpolation anywhere** | — | The whole of this document |

---

## 1. What is already correct (quoted, so nobody rebuilds it)

```js
// main.js:926-931 — the render clock, clamped so a backgrounded tab can't
// produce a 30-second dt and detonate the accumulator.
function frame(ts){
  requestAnimationFrame(frame);
  if(!bootConfirmed) confirmBoot();
  if(!lastT) lastT=ts;
  let dt=(ts-lastT)/1000; lastT=ts;
  if(dt>0.25) dt=0.25;
```

```js
// main.js:956-962 — the accumulator. Sim rate falls as the army grows; game
// speed scales time INTO the accumulator, not the step size; catch-up is
// bounded at 3 steps so a slow frame cannot spiral.
  if(running&&!paused){
    const totAll=teamCount[0]+teamCount[1]+teamCount[2];
    const simDt= totAll>22000?1/12 : totAll>13000?1/16 : totAll>6500?1/22 : 1/30;
    acc+=dt*gameSpeed;
    let steps=0;
    while(acc>=simDt&&steps<3){
      acc-=simDt; steps++;
```

```js
// main.js:976-989 — every mutator of world state is inside the step.
      unitTick(simDt); projTick(simDt); bldTick(simDt); fortTick(simDt);
      buildZoneTick(simDt); reclaimTick(simDt); econTick(simDt); abilTick(simDt);
      beamTick(simDt); envTick(simDt); crateTick(simDt); sceneryTick(simDt);
      shardTick(simDt); updParticles(simDt);
```

```js
// main.js:1003 / 1018 — drain, then render exactly once per animation frame.
    if(acc>simDt*3) acc=0;
    checkVictory();
  }
  ...
    render(dt);
```

Four things this gets right that are commonly got wrong:

- **The step size is a constant *within* a tick.** Everything receives `simDt`, never
  the wall-clock `dt`. Determinism inside a tick is intact.
- **Speed multiplies the accumulator, not the step.** `acc += dt*gameSpeed`
  (`main.js:959`) with `gameSpeed ∈ {1, 1.5, 2}` (`main.js:1052, 1627`) means 2× speed
  runs *twice as many* fixed steps rather than one double-size step. Physics, turn
  rates and cooldowns behave identically at every speed.
- **Sub-rate systems are driven off sim time, not frames.** `aiAcc += simDt` at
  `main.js:996`, fog at `:992/999`. They stay correct when the sim rate changes.
- **Pause and attract are separate paths.** `running && !paused` gates the entire block
  (`main.js:956`); attract mode runs one deliberate 1/24 step per frame with no
  accumulator (`main.js:912-915`).

### 1.1 The one thing in the accumulator that is not right

`if(acc>simDt*3) acc=0;` (`main.js:1003`) is a correct *spiral-of-death* guard and a
**broken alpha source**. It fires exactly on the frames that are already late, and it
throws away the sub-tick remainder that interpolation needs. Fixed in §3.5 with one
line.

### 1.2 The render clock is a *third* clock, and it is not the sim's

`render3d.js:579` uses `const t=performance.now()/1000` for every cosmetic wobble —
air bank (`:1193`), air bob (`:1207`), Brood pulse (`:1170`), ring spin, glow pulses.
That clock ignores `gameSpeed` and keeps running while paused.

That is pre-existing and mostly harmless, but it must not be confused with the
interpolation clock. **Interpolation reads the sim accumulator. Nothing else.**

---

## 2. The actual gap: render-side interpolation

### 2.1 Why it is visible, in numbers

The renderer reads the sim arrays directly:

```js
// render3d.js:1107-1109 and 1213-1214
for(let i=0;i<unitHigh;i++){
  if(!ualive[i]) continue;
  const X=ux[i], Y=uy[i];
  ...
  M.hull.add(X,Y,H+bob,ss,uang[i]-Math.PI/2+bank, ...);
  if(M.tur) M.tur.add(X,Y,H+M.turH*ss,ss,uturr[i]-Math.PI/2, ...);
```

At 60 fps render and a 12 Hz sim, that draws **five identical frames, then a jump**.
And the rotation is worse than the translation, because the angle integrators are
rate-clamped per tick:

| Site | Clamp | Max change at `simDt=1/12` |
|---|---|---|
| Hull, moving (`sim.js:4717`) | `±(isBug?11:5)*dt` | 0.42 rad = **24°** (bugs: 0.92 rad = **53°**) |
| Hull, engaging, no turret (`sim.js:4587`) | `±6*dt` | 0.50 rad = **29°** |
| Turret, engaging (`sim.js:4583`) | `±8*dt` | 0.67 rad = **38°** |
| Turret, travelling (`sim.js:4721`) | `±4*dt` | 0.33 rad = 19° |

A tank snapping its turret 38° once every 83 ms is the artefact, and it is far more
legible than the positional stutter.

### 2.2 Honest value per sim rate

| `simDt` | Trigger (`main.js:958`) | Render frames/tick @60 | Worst turret step | Worth it? |
|---|---|---|---|---|
| 1/30 | ≤ 6,500 units | 2.0 | 15° | **Marginal.** Most players will not see it. |
| 1/22 | > 6,500 | 2.7 | 22° | Yes |
| 1/16 | > 13,000 | 3.75 | 30° | Clearly yes |
| 1/12 | > 22,000 | 5.0 | 38° | Mandatory |

So interpolation is a **big-battle** feature. That is also when the frame budget is
tightest — hence the ≤ 0.2 ms target in §6.

### 2.3 The arrays

```js
/* sim.js — declare beside the existing SoA at 188-190.
   Render-side interpolation source. MAXU-shaped for the same reason ux/uy are:
   the renderer indexes by SLOT, and a compacted array would need a second
   indirection in the hottest loop in the game. */
const pux  =new Float32Array(MAXU), puy   =new Float32Array(MAXU);
const puang=new Float32Array(MAXU), puturr=new Float32Array(MAXU);
/* Which unit the snapshot belongs to. Pairs with ugen[] exactly as liveTgt()
   does at sim.js:235 and the move cohorts do at 374-382. */
const pugen=new Int32Array(MAXU);
```

**Memory, stated both ways:**

- **Allocation is `MAXU`-shaped: 5 × 34,000 × 4 B = 680 KB.** That is the honest
  number, because `MAXU = 34000` (`gl.js:28`) and the arrays must be index-parallel
  with `ux`/`uy`.
- **Working set at 4,000 live units: 4,000 × 20 B = 80 KB**, touched sequentially once
  per tick and once per frame. It fits in L2 on any device this ships to.

For comparison the existing unit SoA is already ~40 typed arrays over `MAXU`. 680 KB
is a ~2% increase on a JS heap allocation that is made once per process. This is not
the expensive part; §2.6 is.

### 2.4 Where to snapshot — and the trap that looks obvious and is wrong

**The wrong answer #1 — a bulk copy before the loop:**

```js
pux.set(ux); puy.set(uy);        // DO NOT
```

Copies all 34,000 slots regardless of how many are alive, every tick.

**The wrong answer #2 — snapshot from the movement block's own locals.**
`sim.js:4756` already has the previous position sitting in a local:

```js
const ox=ux[i], oy=uy[i];        // sim.js:4756
...
const travel=Math.hypot(nx-ox,ny-oy);
ux[i]=nx; uy[i]=ny;              // sim.js:4771
```

It is tempting to write `pux[i]=ox; puy[i]=oy;` right there for free. **It is wrong**,
because that block is inside a movement conditional: an idle, deployed, mining or
stunned unit never reaches it. Its `pux[i]` would keep the last position it moved
*from*, forever — so a unit that stops after a move renders permanently smeared
between two points, jittering as alpha sweeps. That is a worse artefact than the one
being fixed.

**The right answer — one snapshot at the top of the per-unit body**, after the
half-rate `continue` and before anything can write a position or an angle:

```js
  // sim.js:4406-4408 — existing:
    if(isBug&&swarmLOD&&((i+tick)&1)) continue;  // this bug ticks next frame with 2x dt
    if(isBug&&swarmLOD) dt=dtBug; else dt=dtBase;
  // ADD, immediately here — the single snapshot point:
    /* Sited AFTER the swarmLOD skip on purpose: a bug that is not ticking this
       frame must keep last tick's snapshot, or it would record a zero-length
       segment and then jump the full 2x dt next tick. Sited BEFORE every writer
       (4330, 4366, 4583, 4587, 4717, 4721, 4771) so there is exactly one. */
    pux[i]=ux[i]; puy[i]=uy[i];
    puang[i]=uang[i]; puturr[i]=uturr[i];
    pugen[i]=ugen[i];
    const T=TYPES[utype[i]];
```

Five typed-array stores per live unit per tick — 20,000 stores at 4,000 units,
sequential, no reads, no branches. Well under 0.05 ms.

### 2.5 Alpha

```js
// main.js — replace line 1003 and publish the phase.
    /* Refuse to catch up on WHOLE ticks, but keep the sub-tick phase. Zeroing
       acc here snapped alpha to 0 on exactly the frames that were already late,
       which reads as the army stepping BACKWARD one tick under load. */
    if(acc>simDt*3) acc%=simDt;
    checkVictory();
  }
  /* Published for the renderer. Must be the SIM accumulator, never the
     performance.now() cosmetic clock at render3d.js:579. */
  renderAlpha = (running&&!paused&&simDtLast>0) ? acc/simDtLast : 1;
```

`simDt` is currently block-scoped inside `if(running&&!paused)`; hoist it to a
module-level `simDtLast` (one global in a single-scope codebase, same as `perfScale`).

- `steps === 0` on a frame is normal at 60 fps with a 30 Hz sim. `acc` still advanced,
  so alpha still moves. That is the entire point.
- Paused: alpha pins to 1 so the last simulated state is shown exactly, not a stale
  interpolation.
- Attract mode (`main.js:912-915`) runs one fixed 1/24 step with no accumulator, so it
  must also pin alpha to 1 or the menu army renders one tick stale forever.

### 2.6 The render-loop change

`ux`/`uy` are read at ~20 sites in `render3d.js` alone — the shadow/occluder pass
(`:118-122`), scene lights (`:231-246`), the unit loop (`:1109`), selection rings
(`:1281-1283`), artillery aiming (`:1382-1391`), health and shield bars
(`:2279-2308`), commander FX (`:2160-2180`) — plus `tacticons.js` and `orderfx.js`.

**Interpolating only the mesh would visibly detach the selection ring and the health
bar from the unit.** That is a worse bug than the stutter.

**Option (a): patch every read site.** ~20 sites plus two other files. Any missed one
is a floating decal, invisible in a still screenshot. Rejected.

**Option (b): one interpolated scratch set, filled once per frame. Recommended.**

```js
// render3d.js — module scope, allocated once, exactly like _hbI/_hbF at :566.
const rux=new Float32Array(MAXU),  ruy=new Float32Array(MAXU),
      ruang=new Float32Array(MAXU),ruturr=new Float32Array(MAXU);

/* Shortest-arc angle interpolation.
   uang/uturr are UNBOUNDED accumulators: sim.js normalises the DELTA at
   4586/4716/4720 but never the value, so a unit that has been circling can hold
   uang = 37.4 rad. Three sites then assign an atan2 result outright — spawn
   (sim.js:539) and the two mining/docking snaps (sim.js:4330, 4366) — and a naive
   lerp from 37.4 to 1.2 spins the model 5.7 revolutions in one tick.
   The round() form handles arbitrary magnitude in one branch-free step; the
   while-loops used inside the sim would iterate six times for that case. */
const TAU2=Math.PI*2;
function angLerp(a0,a1,t){
  let d=a1-a0;
  if(d>Math.PI||d<-Math.PI) d-=TAU2*Math.round(d/TAU2);
  return a0+d*t;
}

// inside render(), immediately after `const t=performance.now()/1000;` (:579)
{
  const a=renderAlpha;
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]) continue;
    if(pugen[i]!==ugen[i]){            // spawned / recycled: no valid history
      rux[i]=ux[i]; ruy[i]=uy[i]; ruang[i]=uang[i]; ruturr[i]=uturr[i];
      continue;
    }
    rux[i]  = pux[i] + (ux[i]-pux[i])*a;
    ruy[i]  = puy[i] + (uy[i]-puy[i])*a;
    ruang[i]= angLerp(puang[i], uang[i], a);
    ruturr[i]=angLerp(puturr[i],uturr[i],a);
  }
}
```

Then the read sites become `rux[i]` / `ruy[i]` / `ruang[i]` / `ruturr[i]` — a
mechanical substitution with **one** place to get it wrong instead of twenty, and
**one** place to switch the feature off for an A/B measurement (`a=0` → the loop
degenerates to a copy; or alias `rux = ux` outright when disabled, which costs nothing).

Cost: a sweep over `unitHigh` slots doing one `ualive` test and, for live units,
~14 flops plus two `angLerp`s. At 4,000 live units inside a 34,000 high-water space
that is 34,000 byte tests + 4,000 × ~20 ops — **≈ 0.1 ms**, sequential over five
typed arrays, zero allocation.

**What must NOT be interpolated:** `utx`/`uty` (order goals — they are set, not
integrated), `uhp` (bar length; a lerped health bar lies about a kill), `ucool`
(§Phase 3 derives recoil from it), and anything the sim reads back. The scratch arrays
are render-only and are never written by the sim.

---

## 3. Edge cases that will bite

### 3.1 Spawns — and an ordering trap

`spawnUnit` (`sim.js:525-561`) writes position at `:539` and bumps generation at `:546`:

```js
ux[i]=x; uy[i]=y; uang[i]=team?Math.PI:0; uturr[i]=uang[i];   // :539
...
ugen[i]=(ugen[i]+1)|0;                    // this slot is now a different unit  :546
```

`pux[i]` still holds whatever the **previous occupant** left. Fix, placed **after**
`:546` because the generation must already be current:

```js
  ugen[i]=(ugen[i]+1)|0;
  /* A recycled slot inherits every array it is not explicitly cleared from — the
     exact class of bug sim.js:549-553 already documents for umarch. Without this
     a tank spawning at (2000,2000) into a Ravager's old slot renders a streak
     across the map on its first frame. */
  pux[i]=x; puy[i]=y; puang[i]=uang[i]; puturr[i]=uturr[i]; pugen[i]=ugen[i];
```

**Why the `pugen` check in §2.6 is not sufficient on its own:** spawns happen inside
`bldTick`/`econTick`, which run at `main.js:978/982` — *after* `unitTick` at `:976`.
A unit spawned this tick was never seen by the §2.4 snapshot point, so its `pu*` is
stale until the next tick. The `pugen` guard catches it; writing `pu*` in `spawnUnit`
makes it correct rather than merely guarded. Do both.

### 3.2 Deaths

`killUnit` (`sim.js:566+`) clears `ualive[i]` and pushes the slot onto `freeList`
(`:574`). The render loop already skips `!ualive[i]` (`render3d.js:1108`) and the
interpolation sweep does the same. **Nothing lerps across a death.** No change needed.

### 3.3 Slot recycling — use `ugen[]`, do not invent a second epoch

`spawnUnit` pops a dead slot at `sim.js:529` and can hand it out **in the same tick**
it was freed. Without a guard, a Ravager that died at (100,100) whose slot is reused
for a tank at (2000,2000) renders as a single unit crossing 1,900 units over one tick.

`ugen[]` is exactly this mechanism and the codebase already leans on it in four places:

- `liveTgt(tg,gen)` — `sim.js:235`
- projectile target pairing — `sim.js:3556`, `:4557`
- move-cohort membership — `sim.js:374-375`, `:382`

Reuse it. A second counter would be a second thing to keep in sync. `ugen` is
`Int32Array`; it wraps after 2.1 billion respawns *of one slot* — unreachable.

### 3.4 Teleports — five sites, all of which will smear without a helper

Every non-integrated position write in the codebase:

| Site | What it is |
|---|---|
| `commander.js:212` | Commander recall to a point |
| `commander.js:221` | Squad recall — `ux[i]=x; uy[i]=y` per affected unit |
| `commander.js:691` | "JET ASSIST" auto-unstick, fires after 0.9 s wedged |
| `commander.js:724` | Jump-jet landing |
| `session.js:173` | Save-game restore (`uang[i]=U.ang[k]`) |

All five must set `pu* = the NEW value`, not the old one. Five call sites is few
enough to convert by hand, but a helper next to the arrays makes the contract
discoverable:

```js
/* sim.js — any code that MOVES a unit without integrating velocity must call
   this. The render interpolator will otherwise draw a streak from the old
   position to the new one over the next frame — invisible in a screenshot, and
   only ever reported as "the commander smears when it blinks".
   Callers: commander.js 212/221/691/724, session.js 173. */
function unitWarp(i,x,y,ang){
  ux[i]=x; uy[i]=y; pux[i]=x; puy[i]=y;
  if(ang!==undefined){ uang[i]=ang; puang[i]=ang; uturr[i]=ang; puturr[i]=ang; }
  pugen[i]=ugen[i];
}
```

**Angle snaps are the same class of bug and are easy to miss** because they are not
position writes:

```js
sim.js:4330   const B=blds[bi],a=Math.atan2(B.y-uy[i],B.x-ux[i]);umov[i]=0;uang[i]=a+Math.PI/2;
sim.js:4366   const a=Math.atan2(D.y-uy[i],D.x-ux[i]); uang[i]=a+Math.PI/2;
```

Both slam an unbounded accumulator to an `atan2` result. `angLerp` (§2.6) caps the
visible artefact at π — a 180° flip in one frame instead of several revolutions —
which makes it *tolerable*. Writing `puang[i]=uang[i]` immediately after each
assignment makes it *correct*. Do both; `angLerp` is the safety net for the site
somebody adds next year.

### 3.5 The `steps<3` clamp and partial catch-up

```js
while(acc>=simDt&&steps<3){ ... }     // main.js:961
if(acc>simDt*3) acc=0;                // main.js:1003
```

When the loop exits on the step cap, `acc ≥ simDt` — the sim is behind wall clock.
Zeroing `acc` is the correct refusal to catch up, and the **worst possible thing for
alpha**: it snaps to 0, so the renderer shows the *older* of the two snapshots and the
whole army visibly steps backward one tick — on a frame that was already late.

```js
if(acc>simDt*3) acc%=simDt;           // drop whole ticks, keep the phase
```

Two honest caveats:

- This does **not** hide the slow-motion. While the sim is capped at 3 steps the world
  genuinely runs slower than wall clock. Interpolation removes the *sampling* stutter,
  not the time debt. Nothing at the render layer can fix that; the fix is the sim
  budget (Phase 1's flowfield, the LOD work in Phase 3).
- `acc %= simDt` is a modulo on a float in the hot path — once per frame, immaterial.

### 3.6 Pause

`running && !paused` (`main.js:956`) freezes the whole block, so `acc` freezes and
alpha freezes with it — the interpolated pose holds exactly. `render()` still runs
(`main.js:1014-1022`), which is what keeps the pause overlay compositing.

The only wrinkle is `render3d.js:579`'s `performance.now()` clock: bobs, banks, ring
spins and Brood pulses keep animating while paused. That is pre-existing, orthogonal,
and if a fully frozen pause is wanted, **that clock** is the thing to change — not the
interpolator.

### 3.7 Speed multiplier

`acc += dt*gameSpeed` with `gameSpeed ∈ {1, 1.5, 2}` (`main.js:959, 1052, 1627`).
`simDt` is unchanged; the accumulator simply crosses it more often. `alpha = acc/simDt`
stays in `[0,1)` and stays correct with no special case. **Nothing to do.**

### 3.8 `unitHigh` growth

`i=unitHigh++` at `sim.js:530` hands out a never-used slot whose `pux[i]` is 0 from the
initial zero-fill. A unit spawned at (2000,2000) would lerp from the map origin. The
`pugen[i] !== ugen[i]` check catches the *first* spawn only by luck (`ugen` 0→1 while
`pugen` is 0). The `spawnUnit` write in §3.1 is what makes it right in every case.

### 3.9 `swarmLOD` — the one case interpolation cannot fix, stated plainly

```js
const swarmLOD=teamCount[2]>3000;              // sim.js:4399
const dtBase=dt, dtBug=dt*2;                   // sim.js:4400
...
if(isBug&&swarmLOD&&((i+tick)&1)) continue;    // sim.js:4406
if(isBug&&swarmLOD) dt=dtBug; else dt=dtBase;  // sim.js:4407
```

A skipped bug does not move, so `pux == ux` and `lerp` returns the same value —
correct, it genuinely did not move. But on its *next* tick it moves 2× as far, and
alpha sweeps that whole double-length segment over one `simDt` window. Net effect:
**wildlife stutters at half the frequency and double the amplitude.** Interpolation
does not remove it.

Three responses, in order of preference:

1. **Accept and document it.** `swarmLOD` only engages above 3,000 wildlife
   (`sim.js:4399`), and at that population nearly all of it is past the iconisation
   threshold at `render3d.js:1142-1153` — drawn as two billboard quads, where a
   position lerp is a sub-pixel concern.
2. Give bugs a two-tick alpha: `aBug = ((tick&1) ? 0.5 : 0) + a*0.5`. One extra
   multiply-add in the sweep, and it is only correct if the parity is stable — which
   it is not, because the skip key is `(i+tick)&1`, i.e. per-slot.
3. Snapshot bugs at their *own* cadence (a per-unit `pugen`-style tick stamp and a
   per-unit alpha). Correct, and not worth the array.

**Recommend (1).** Naming it in the doc is the deliverable; building for it is not.

### 3.10 Projectiles and buildings — out of scope for 4a

`projTick(simDt)` runs in the same loop (`main.js:977`) over `MAXP=6000` slots
(`gl.js:29`, `sim.js:3508-3519`). Projectiles stutter *more* visibly than units — a
shell crossing the screen at 12 Hz reads as a dotted line. But they already carry a
parametric flight: `psx/psy/pex/pey/pt/pmax` (`sim.js:3516-3517`). If they read badly,
the cheap fix is to advance `pt` by `renderAlpha*simDt` at draw time, **not** to add
six more `MAXP`-wide previous-state arrays.

Buildings do not move; `bldTick` changes state, not position. The one exception is the
building-turret angle `Bd.tang` (`render3d.js:966`), which rotates slowly and numbers
in the tens. Same `angLerp` treatment if it ever reads badly — low priority.

---

## 4. Should `simDt` be fixed instead, with interpolation covering the difference?

**No. Keep the adaptive rate and add interpolation.** The adaptive table does two
different jobs and only one of them is replaced:

| Job | Mechanism | Replaced by interpolation? |
|---|---|---|
| **Budget protection** — a `unitTick` over 22,000 units is expensive | drop to 12 Hz | **No.** Interpolation adds cost, it does not remove sim cost. |
| **Sampling smoothness** — the visible stutter | (nothing today) | **Yes.** This is exactly what interpolation is for. |

Why a fixed rate is worse in both directions:

- **Fixed high (30 Hz always).** At 22,000 units that is ~2.5× the sim CPU of the
  current 12 Hz. The frame drops instead, and a 30 fps game with a 30 Hz sim looks
  worse than a 60 fps game with an interpolated 12 Hz sim. The player notices frame
  rate before they notice tick rate.
- **Fixed low (12 Hz always).** Wastes headroom in the common case (≤ 6,500 units,
  where 1/30 is comfortably affordable) **and degrades gameplay**, not just visuals:
  turn rates are `rad/s × dt` *clamped* (`sim.js:4583/4587/4717/4721`), separation
  resolves once per tick (`sim.js:4726`), goal arrival is a distance test evaluated per
  tick (`sim.js:4723`), and cooldowns decrement per tick (`sim.js:4409`). A coarser
  tick makes units overshoot goals and fire in coarser quanta. **This sim is not
  rate-independent enough for 12 Hz to be the universal choice.**

### 4.1 Two things the adaptive rate needs once alpha exists

**(a) Hysteresis on the thresholds.** `main.js:958` is a bare threshold on a noisy
signal. A battle hovering at 6,500 units flips 1/30 ↔ 1/22 several times a second, and
`alpha = acc/simDt` jitters with it. This is precisely the bug `main.js:937-946`
already diagnosed and fixed for `perfBand`:

> *"a bare threshold on a noisy fps signal flipped it 0.55↔1.0 twice a second and
> strobed all of them at once… Drop instantly to protect the frame, rise only with
> headroom"* — `main.js:937-941`

Copy that shape exactly: fall to a coarser `simDt` immediately, return to a finer one
only with a margin (e.g. drop at 6,500, return at 5,800).

**(b) Rescale the accumulator when the rate changes.** `simDt` changing mid-frame makes
`acc/simDt` jump discontinuously even though no time passed:

```js
if(simDt!==simDtLast&&simDtLast>0) acc*=simDt/simDtLast;   // preserve PHASE, not absolute time
simDtLast=simDt;
```

One line, and it turns a visible one-frame pop into nothing.

### 4.2 The real payoff

Once interpolation ships, a coarse tick costs much less visually — which means the
thresholds can be made **more aggressive**, not less. Dropping to 1/16 at 9,000 units
instead of 13,000 buys sim CPU headroom that Phase 1's flowfield rebuilds and Phase 3's
draw calls can spend. **Interpolation's real return is sim budget, not smoothness.**

---

## 5. Migration plan (each step independently shippable)

1. **Accumulator hardening only.** `acc%=simDt` at `main.js:1003`; hoist `simDtLast`;
   publish `renderAlpha`. **Zero visual change** — verify with a debug readout that
   alpha sweeps 0→1 and never snaps under load.
2. **Snapshot arrays + the single snapshot point** (`sim.js:4406-4408`), the
   `spawnUnit` write (`sim.js:546`), and `unitWarp()` conversion of the five teleport
   sites. **Still zero visual change** — the renderer does not read them yet. This step
   is where the correctness work lives, and it can be reviewed without any visual risk.
3. **Scratch arrays + swap the `render3d.js` read sites**, behind `?interp=0`. Measure
   the sweep cost and the fps delta at 400 visible units, on a real device. This is the
   only step that can regress anything.
4. **Threshold hysteresis + `acc *= simDt/simDtLast`** (§4.1).
5. **Tighten the thresholds** (§4.2) once 3 and 4 have shipped and been measured.
6. **Projectiles**, only if they read badly, and via `pt` advancement (§3.10) — never
   via six more `MAXP` arrays.

## 6. Acceptance targets (measure, don't assume)

| Metric | Target |
|---|---|
| Interpolation sweep, 4,000 live units | **≤ 0.2 ms/frame** |
| Snapshot cost inside `unitTick`, 4,000 units | ≤ 0.05 ms/tick |
| Per-frame allocation | **0 bytes** |
| Added heap | ≤ 700 KB (5 × `MAXU` arrays) |
| Position discontinuity, constant-velocity unit, `simDt`=1/12 @60 fps | **0 px** between consecutive frames |
| Rotation shown in one frame, any unit, any tick | **≤ π** (`angLerp` shortest arc) |
| Miner dock spin (`sim.js:4330`, `:4366`) | 0 frames showing > π of rotation |
| Teleport smear (`commander.js` 212/221/691/724) | 0 frames drawing the unit between old and new position |
| Slot-recycle streak | 0 — enforced by `pugen[i] !== ugen[i]` |
| Selection ring / health-bar offset from the mesh | **0 px** at every alpha |
| Alpha on an overloaded frame (`steps===3`) | continuous; **never** snaps to 0 |
| `simDt` threshold changes at 6,400–6,600 units | ≤ 1 per 3 s (hysteresis) |
| fps delta, interpolation on vs off, 400 visible | within noise (±1 fps) |
| Paused frame | pose identical to the last simulated tick, frame after frame |

Measure on a real device (and the real-GPU harness), not SwiftShader — per
`docs/POSTMORTEM-1.33.31-REGRESSION.md`.
