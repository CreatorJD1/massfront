# MASSFRONT — Handoff to GPT Codex · 2026-08-19

Branch `cursor/strip-mass-node-bloom`. **9 commits this session**, `adf911e` → `71b2153`.
Nothing published. Tree is clean.

---

## 0. Read this first — a measured result that overturns the plan

The owner's working assumption, which I affirmed and which turned out to be
**wrong**, was that replacing additive billboards with raymarched volumes would
*save* performance by cutting draw-call and overdraw spam. A dedicated agent
measured it. It does not.

| Claim | Measured reality |
|---|---|
| "hundreds of billboard draw calls" | **2 draw calls for the entire billboard system.** `BBBatch.flush()` (`billboard.js:135`) is one `drawElementsInstanced` per batch; the ~133 `.add()` sites are *instance writes into a Float32Array*, not draws. Whole frame is 27 draw calls at combat zoom. |
| "one explosion spawns hundreds of quads" | **6–7 additive + 7–15 alpha quads**, flat from sz 9 to sz 39. Sparks, embers and ballistic debris are **not billboards** — types 2/5/7 go to `FX.shard` (an `InstMesh`), the energy blast to `gpfxBurst` transform-feedback points. |
| "volumetrics will save fill rate" | The billboard fragment shader (`billboard.js:51` `FSBB`) is **one `texture()` and one multiply** — about the cheapest shaded fragment that exists. Any believable march step costs several times that. And on `medium`, `aoDiv=1`, so billboards already rasterise into a 257×572 quarter-res target. |
| "this is where the frame goes" | **Whole billboard system = 0.6–1.2 ms of a 23–25 ms frame.** Deleting it outright moves 24.1 ms → 23.5 ms: **under 1 fps.** |

Overdraw was *measured*, not estimated — the resident instance buffers were
replayed through a counting shader built from the **same vertex shader** as the
live path, blend `ONE/ONE`, summed via `readPixels`, zero saturated pixels so the
counts are exact: **29.3× the target, 38.9 layers on an average covered pixel,
peak 117.**

**What actually stands between MASSFRONT and 30 fps is the 19.2 ms floor** —
terrain, ~250 units at ~637k triangles, SSAO, bloom. No volumetric system touches
that.

**Two real fill savings the same measurement did surface:**
1. **36% of rasterised additive fragments are discarded** by the shader's own
   `alpha < 0.004` test, because glow quads are oversized relative to their
   visible content — `render3d.js:556` (`sprites.glow` at `sz*3.4`), and the
   `S*0.95` glow stacked on the `S*(0.55+age*0.85)` fireball at `:2599`/`:2607`.
   Tightening those footprints is a shader-free win.
2. **`bbAlpha` is the larger half** (~0.94 ms vs ~0.23 ms additive), dominated by
   smoke at `render3d.js:2603` and `:2541/:2543` — not by UI.

> **Volumetrics may well be worth building as a LOOK. The performance argument
> for it does not survive measurement.** Tell the owner that before spending
> their budget on it.

---

## 1. The single highest-value fix available

**`metal = 1.0` on every surface in the game.** Found by GPU read-back, not by
reading code.

- `materials.js` **never runs its procedural generator in the shipped build** —
  it prefers baked `assets/textures/mat-*.png` and returns early. So
  `MAT_GLOSS` / `MAT_METAL` / `MAT_EMIS` are dead fallback tables describing
  nothing on screen.
- **`mat-orm.png`'s alpha channel is uniformly 255**, and that alpha *is*
  metalness.

At `metal=1.0`, FS3D halves diffuse and sets `f0 = albedo`. Every unit and
structure is therefore **a flat mirror wearing its own albedo** — which is why
the whole army reads as pale plastic across all seven factions, and why the Nova
work could only partly compensate.

Also: **`MAT.PLASMA_JET` and `MAT.LAMP` have zero baked emissive** despite having
emissive painters. Sample the **mip average**, not the tile centre — `CHARGE_STRIP`
is 178 at centre and 40 averaged, and the mip is what an RTS camera reads.

This is an **asset bake** problem, not a shader problem. A background task was
already spawned for it (`task_863cec7a`).

---

## 2. Shipped and verified this session

| Commit | What | Key evidence |
|---|---|---|
| `4b374af` | Record the 1.33.46 bump the published release was built from | — |
| `048bfac` | **Previews render the real map.** `drawMapPreview` was a second, divergent generator: a 6th octave the real map never has, Gaussian mounds instead of the real land guarantees, no `terraShape` at all | correlation 0.748 → **0.875**; land/water agreement 78.7% → **94.5%**; wrong-map control r=0.065 |
| `e05ea46` | **Cloud save.** Not a nag — a false positive that also **silently disabled backup** | Dominion career DIFFERS→EQUAL; **Nova-only unaffected before the fix**, which is what proves the faction-rename seam is the cause |
| `13daa1a` | **Movement.** One world unit = one metre, so `spd` is m/s: siege at 50 km/h, Commander at 108. Plus two flatteners | solo speeds exact (ratio 1.00, spread 3.13×); mixed group holds at 1.26× vs 3.13× |
| `92f2f12` | **FX.** Wrecks kept **92% of team colour** at full damage; every blast rendered the same size; water striping; red halos | captures at 0.4125 on real GPU |
| `ab300b8` | Explosion puff cluster; veins stopped beading | captures |
| `36dc7a4` | **Previews square + cropped to the playable theatre** | 20 checks, each with a control that can fail |
| `c194b56` | **Physics, Brood translucency, Nova hull, shock waves** | see §3 |
| `71b2153` | **Volumetric raymarcher, defaulted OFF** | see §4 |

---

## 3. Systems that are real now

**Physics** — `src/engine/physics.js`, 705 lines. Quaternion angular integration,
box inertia tensor, 8-corner contacts, restitution + Coulomb friction applied **at
the contact point** so they generate torque, Baumgarte correction, sleeping.
**0.070 ms/step for 96 bodies = 0.93% of a 30 fps budget.**

Two blockers from the previous cancelled attempt, settled with evidence:
- *"instance attribute 10 is bound to Material V2"* — **true but not fundamental.**
  Max bound slot across `src/` is 10, at exactly one site (`mesh.js:847`). Nothing
  uses `getAttribLocation`. WebGL2 guarantees ≥16, so **slots 11–15 are free.**
- *"wasm delivery was mis-specified"* — **true and architectural.**
  `updater.js:657` does `new TextDecoder().decode(bytes)` on **every** OTA
  artifact, and `boot.js` requires strings and wraps each in a `text/javascript`
  Blob. A wasm binary cannot survive that path, and `injectScripts` is synchronous
  with nowhere to `await WebAssembly.instantiate`. **Rapier is not shippable
  through the current OTA path** — that is why a compact JS solver was correct.

**Brood translucency** — the root cause was a classification error.
`surfaceOrganic` (`mesh.js:1342`) covered material ids **8 and 13 only**, but the
Brood band is **67–70**. So every Brood wing was **machinery**: rubbed-metal wear
at `metal=0.82`, carbonising like steel on death, while the correctly-written
`wound` term could never fire. `models-infestation.js` was worse — `INF_SAC` was
`GLASS` (excluded from both branches) and `INF_MUCUS` was `CRYST`, forcing the
faction's wet green to render **blue** on every nest.
Back-lit red shift: membranes **+1.07 → +11.08**; solid-carapace control correctly
goes **+6.85 → −2.22**. The baseline was *inverted*.

**Nova** — hull palette was near-white so albedo sat at 0.5–0.7 and the modelled
panel lines had nowhere dark to be. A `luminance^1.28` retone drops `DARKER` to
~0.04 while `MET_L` only falls to ~0.40. Thruster plumes via a material ladder;
cyan efflux pixels **0 → 4087**.

---

## 4. In flight / staged — pick these up first

| Item | State | Where |
|---|---|---|
| **volfx raymarcher** | Real, registered, hooked, **defaulted to 0 steps**. Never verified: not shader link, not depth compositing, not cost. `verify:volumetric` died on the session limit. | `src/engine/volfx.js`; opt in via `GFX.volSteps` |
| **Charcoal burn crust** | **Staged patch, dry-run clean (4 anchors).** The burn mixes toward near-black ash then immediately drags it back with `base=mix(base,scar,charA*heat*0.34)` across the *whole* disc — `scar` starts dark red, so the ash is cancelled everywhere. Patch confines red to where the coal-bed mask is hot. | `scratchpad/patch-mesh-charcoal.mjs <repoRoot> [--check]` |
| **Brood SSS shader half** | **Staged patch, 11 anchors, re-validated after `mesh.js` moved.** | `scratchpad/patch-mesh-brood-sss.mjs` |
| **Ground/terrain quality** | Agent died on session limit; only +16 lines landed. **This is the owner's biggest open visual complaint.** | `mesh.js` |
| **SC2 water + shoreline** | Agent died; **nothing landed, `terrain.js` is clean.** It had self-identified a real bug: `CAM_HEIGHT` is a constant 3000, so eye distance is *not* a zoom proxy and its LOD gate was killing both detail wave octaves at every zoom. | `terrain.js` |
| **Blended pass for membranes** | Designed, deliberately not staged — the `mesh.js` half is **unsafe alone** (once the index buffer is partitioned, `flush()` draws only the opaque range and every wing vanishes until `render3d.js` calls `flushThin()`). Must land as one coordinated change. | design in the Brood agent report |
| **Shield hex-domes** | Not started. Owner supplied references. | needs `render3d.js` |
| **Remaining 6 factions** | Nova establishes the material path; Legion/Syndicate/Brood/Machine/Infestation inherit it. Do **not** parallelise across `materials-v2.js`. | |

---

## 5. Traps that have each cost real time

1. **A probe is wrong more often than the code.** Thirteen recorded cases. Three
   today: one measured `groundTerrainRecovery` **teleports** instead of movement
   (`spawnUnit` relocates via `findLand` — never write `ux/uy` back, *read* them,
   and assert the global `groundRescues` doesn't change); one couldn't see GL
   programs because **top-level `const` are not `window` properties**; one had a
   control invalidated by the change under test.
2. **Mixed line endings.** Never anchor a replacement across a newline — it fails
   *silently*. Single-line anchors, then grep to prove.
3. **`node --check` does not validate GLSL.** A backtick inside a GLSL comment
   terminates the `FS3D` template literal and black-screens the game with no
   syntax error. This happened today.
4. **Never emit an escaped regex through a shell** — backslashes get eaten. Five
   bugs, worst `/^https?:///i`, which JS parses as a regex plus a comment and so
   accepted every URL.
5. **Capture at `perfScale 0.4125`**, the device value (medium band .55 ×
   `GFX.particles` .75). The most common effect gate is `perfScale > 0.48` — *above*
   the device. A capture at 1.0 shows a build the owner does not have.
6. **`PITCH_MIN = 1.05` is a lexical `const`** (`mesh.js:3253`) — assigning it is a
   no-op, and it is the *lowest* angle the engine allows (~60°). To shoot lower you
   must replace `clampCam` itself. `clampCam` also floors `orthoSpan` at 200.
7. **`tools/pw-browser.mjs` hardcodes CDP port 9333** (`PW_CDP_PORT` overrides), and
   its `--kill-orphans` reports 0 while orphaned capture Chromes are still running —
   its matcher doesn't recognise harness-launched processes. Concurrent captures
   collide; a stale CDP endpoint hijacked one run today.
8. **`AGENTS.md` Rule 4**, which the Antigravity engine guide omits: any custom GL
   pass must save/restore `BLEND`, `CULL_FACE`, `DEPTH_TEST`, `DEPTH_WRITEMASK` and
   call `begin3D(S_nA)` on exit, or the next draw uses your shader.

---

## 6. Corrections to `docs/ENGINE_UPGRADE_SUGGESTION_GUIDE.md`

That document is largely sound — height fog, depth-aware water, `TEXTURE_2D_ARRAY`
splat and staged collapse are all good. Five things are wrong:

1. **The texture-unit table is wrong and dangerous.** It says units 4/5/6 are
   "Sun CSM Depth 1 / 2 / Bloom — NEVER REALLOCATE". They actually hold
   `assetMaps.base` / `nre` / `mask` and `matTex` — **the Material V2 asset maps** —
   during the model pass (`mesh.js:925-949`). Unit 6 only carries `aoColA/aoColB`
   later, in post. Correct conclusion, wrong reason: rebinding them mid-model-pass
   corrupts Material V2 across every mesh stream.
2. **It omits the dangerous half of Rule 4** — the state save/restore above.
3. **Its "smooth 60 FPS" verification bar contradicts the owner's budget** of
   30 fps cinematic on a device running 28–42 fps.
4. **Parts 2.2 and 2.3 are already built** — `sim.js:2193` is titled *"VOLUMETRIC
   SHATTER"*, `pArc` is *"authored visual arc height for true ballistic shells"*,
   and type-7 debris got real world-Z ballistics in `58f2421`.
5. **Part 5 is a new content library, not a translation.** Its 14 named worlds
   exist nowhere — `PLANETS` is Aelos/Pyraeth/Nordhall/Vespera and `BIOME_KITS`
   has 20 keys, all matching those four.

Also: `worldProps[]` (Part 3.2) does not exist. Texture unit 3 is free in
`mesh.js`/`terrain.js`/`gl.js` but already used twice in `render3d.js`.

---

## 7. Owner decisions already locked

- **Everything in one release** (accepted: long freeze)
- **Previews square** — done
- **Movement: halve and widen the band** — done
- **Build order: volumetric first, then physics** — physics is further along
- **30 fps cinematic budget**
- Maps come from the owner's Google Drive dossiers. One was reviewed
  (`tools/04_Veridian_IX_Jungle_Swamp/`): a genuine annotated design spec with
  spawns, primary/flank lanes, naval routes, amphibious landings, bridges,
  resource clusters, colonies, derelict cities, strategic objectives,
  destructibles and hazards. **Map work is parked until the engine is under it.**
- **Pipeline is Hugging Face · Cloudflare · Google Drive. Never GitHub.**
  Publish is `tools/publish-hf-release.ps1`, never a git push. Activation is the
  *last* step, so a version check mid-run correctly reports the old version.

---

## 8. Verification commands

```
node tools/bundle.mjs                 # init-order gate; FAILS the build if a
                                      # main.js init-list function is declared in
                                      # a file loading after main.js
node tools/pack-www.mjs               # www/ is a COPY; the dev server serves it
PW_CDP_PORT=9471 node tools/capture-showcase.mjs
PW_CDP_PORT=9472 node tools/capture-stagec-fx.mjs
PW_CDP_PORT=9473 node tools/capture-physics-destruction.mjs
PW_CDP_PORT=9474 node tools/capture-brood-translucency.mjs   # --stock for baseline
PW_CDP_PORT=9475 node tools/capture-nova-art.mjs
PW_CDP_PORT=9476 node tools/measure-billboard-baseline.mjs
```

`tools/capture-*.mjs` serve the **repo root**, so they test `src/` live and need
no `pack`. The dev server on 127.0.0.1:8901 serves `www/` and does.
