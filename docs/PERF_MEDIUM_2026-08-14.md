# MEDIUM / HIGH draw-cost pass — 2026-08-14

Owner: runtime cost (billboards, main.js CPU binds, HUD write guards, InstMesh flush).
Not owner: `meta.js` preset titles, terrain deform, GPUFX look, shader tonemap.

Verify: `node tools/bundle.mjs` + `node tools/pack-www.mjs` clean. One 8901 hard-refresh after the first pack (reused the existing tab; no refresh loop). Sampled on ANGLE D3D11 GeForce RTX 4060 — this is **not** a mid-tier phone.

## What MEDIUM already was

`GFX_PRESETS.medium` (read-only; settings sibling owns the object):

| Knob | MEDIUM | HIGH |
|---|---|---|
| particles | 0.75 | 1 |
| dprCap | 1.25 | 0 (uncapped) |
| worldV2 | false | true |
| aoSamples | 4 | 12 |
| bloomBlur | 0 | 2 |
| glowDiv | 3 (1/8) | 2 (1/4) |
| shadowQ | 1 | 2 |
| organicSpan | 1800 | 2700 |
| lights | 4 | 8 |

Live sample confirmed those knobs after pack: `quality=medium`, `worldV2=false`, `aoSamples=4`, `glowDiv=3`, `shadowQ=1`, `particles=0.75`.

## Before (hotspots this pass targeted)

- **Billboards:** every `add()` uploaded, including offscreen and sub-pixel sparks. `flush()` allocated a `subarray()` view per batch per frame. Caps were 9k / 72k so HIGH never overflowed — MEDIUM still *submitted* HIGH-class junk.
- **Tacticons / mesh handover:** `mfIconQ` used 24→15 CSS px on every preset. Infantry stayed meshes on MEDIUM at the same span HIGH needs for the silhouette read.
- **Civic / minimap:** deform nulls `mmBg`; the 2048→256 `terrainCanvas` blit was held 700 ms only above 350 pop, then every other `renderMinimap` (itself already 1/5 frames).
- **Unit separation:** skip every other unselected unit only above 800 pop — MEDIUM paid HIGH pair tests in the 400–800 band.
- **InstMesh.flush:** `gl.getParameter(CURRENT_PROGRAM)` on every flush (40–80/frame). GPU sync, not a look feature.
- **HUD:** resource `textContent` / `style.color` rewritten every 10 frames even when unchanged, which retriggers the hudflow `MutationObserver` (style attribute) and queues a layout.

## After — what landed

### `src/engine/billboard.js`

- Frustum + screen-footprint gate in `add` / `addOrientedRect`, refreshed once per `beginBB`.
- Local pixel floors keyed off the existing quality name (not a new settings field): LOW 3.4 px, MEDIUM 2.1 px, HIGH 0.65 px, CINEMATIC 0.40 px. HIGH still submits the close-up sparks the preset promises.
- Offscreen and alpha&lt;4 dropped on every preset (invisible work).
- `bufferSubData` uses the WebGL2 offset/length form — no per-flush `subarray()` allocation.
- Batch caps stay large so HIGH cannot overflow mid-fight.

### `src/engine/mesh.js`

- `MF_PROG_MODEL` tracks the last `useProgram`. `InstMesh.flush` no longer queries `CURRENT_PROGRAM`.
- HIGH still binds per-asset skins and bones when `prog3D` is current. Glow / FX flushes (`progG`) still skip those uniforms.

### `src/main.js` (takeover, no `meta.js`)

- **Icons:** wrap `mfIconQ`. HIGH/CINEMATIC keep 24→15 px. MEDIUM converts at 28→17 px; LOW at 34→20 px. Infantry drop meshes sooner on mid; experimentals / commanders still layer the plate over the mesh.
- **Minimap civic hold:** LOW 1600 ms, MEDIUM 1100 ms, HIGH 520 ms, CINEMATIC 320 ms. Extra frame skip on MEDIUM above 280 pop. Scar refresh stays faster on HIGH.
- **Separation:** MEDIUM starts skipping at 420 pop (stride 2, 3 above 900). HIGH stays 800 / every-other.
- **CPU particles:** thin type 9 (ambience) and type 10 (dust) on MEDIUM/LOW — half / quarter, not deleted. Combat flashes untouched. GPUFX burst counts stay on `GFX.particles` (do not double-scale).

### `src/ui/hud.js` / `hudflow.js`

- `hudTxt` / `hudCol` / `hudDisp` write only on change (mass/energy/pop/fps/hero/ability rings).
- Selection intel and wave banner skip identical `innerHTML`.
- Infestation-off path no longer rewrites HTML every tick.
- hudflow caches `offsetHeight` between mutations; a real layout pass remasures.

## Measured (desktop 4060, 8901, one refresh)

Empty live MEDIUM (`nordhall_isles_medium`, 9 pop, span ~420, canvas 900²): **p50 4.3 ms**, p95 12.1 ms, **~18 draws**, ~184k tris.

Spawned pile on the same tab (224 pop, span clamped ~520): **p50 5.8 ms**, p95 33.8 ms, **~20 draws**, ~125k tris, `fpsShow` 120.

This GPU is not the target. The useful signal is draw count staying ~20 with 200 extra chassis (instancing + earlier MEDIUM icon drop + billboard cull). Mid-tier impact is reasoned below.

## Reasoned mid-tier impact

- **Fillrate:** dropping sub-2 px and offscreen billboards cuts the additive/alpha upload that used to scale with `MAXPART` (9000) plus muzzle/engine glows. MEDIUM phones feel this more than the 4060.
- **CPU:** no `getParameter` per mesh flush; no `subarray` per billboard flush; civic blit held longer; HUD style writes no longer poke the observer every 10 frames.
- **Meshes:** earlier infantry icon-out on MEDIUM only. HIGH still draws those hulls until 15 px.

## Leftover hotspots (not this owner, or not proven on a phone)

1. **`render3d.js` walks all 9000 CPU particles every frame** even when `flife` is 0. Cap/scan lives next to VFX look — leave it unless that sibling is idle.
2. **`gpufx.js` `drawArrays(POINTS, 0, GPFX_CAP)`** whenever anything is live. Count scale is already `GFX.particles`; the full-buffer draw is the leftover.
3. **Fullscreen SSAO / scene FBO is still canvas-sized on MEDIUM** (4 taps, 1/8 bloom). Half-res scene would change the look; not done.
4. **`mfIconStackRebuild` allocates a `Map` every frame** (`tacticons.js`). Stacking is a feature; the alloc is the cost.
5. **1000-pop `unitTick` / path / AI** — previous pass claimed 28→47 FPS @ 987. This pass did not re-measure that band (spawned 224, not 1000).
6. **Terrain + water + wake fillrate** — deform sibling / water path. Do not restyle.
7. **Phone DPR 1.25 @ 412×915** was not the sample canvas (900², DPR 1 on the capture Chrome). Physical-notch / device pass still open.

## Files changed

- `src/engine/billboard.js`
- `src/engine/mesh.js`
- `src/main.js`
- `src/ui/hud.js`
- `src/ui/hudflow.js`
- `docs/PERF_MEDIUM_2026-08-14.md` (this file)
