# MASSFRONT experimental preview

**This is not the ship path.** Production remains the hand-written WebGL2 engine (`src/engine/mesh.js`, live `index.html` / `boot.js`). Capacitor / `tools/pack-www.mjs` does not copy this folder. Do not point the APK at it.

The preview is **Babylon.js only**. Three.js is not a dependency and is not used.

## How to run

```bash
npm install
npm run preview:experimental
```

Serves `http://127.0.0.1:5177/preview.html` — a 412×900 phone frame titled **EXPERIMENTAL / PREVIEW**. Open that URL in a browser.

Controls: drag to pan, wheel or pinch to zoom, shift-drag or two-finger twist to yaw. Pitch stays in the command band (not an FPS camera). FAR zoom is clamped so the pad rim stays off-screen.

## Layout

| Path | Role |
|------|------|
| `experimental/preview/preview.html` | Entry |
| `experimental/preview/src/mf-engine.js` | MASSFRONT scene layer: ortho cam, `sunFor`, pad world, FOW paint, fake 1v1 |
| `experimental/preview/src/kit.js` | Procedural tanks / HQ / crystals |
| `experimental/preview/src/babylon-backend.js` | Babylon PBR, CSM, instancing, bloom, SSAO |
| `experimental/preview/src/main.js` | HUD overlay |

## Feature checklist vs production WebGL2

| Feature | Status | Notes |
|---------|--------|--------|
| Ortho / tilt command camera | **done** | Same pitch band (1.05–1.50), yaw orbit, no FPS fly |
| Pinch / wheel zoom | **done** | |
| Per-map FAR clamp (`spanMaxNow` idea) | **done** | Footprint kept inside the 220wu pad so the rim is not visible |
| Day / night cycle + UI toggle | **done** | Slider + noon / night / auto; `sunFor` equivalent |
| Directional sun | **done** | |
| Hemispheric sky / ground ambient | **done** | |
| Modest bloom | **done** | DefaultRenderingPipeline, night-weighted |
| Cascaded shadows | **done** | 2 cascades @ 1024 |
| Contact shadows | **done** | Ground blob discs under units (production uses footprint decals) |
| SSAO | **stub** | SSAO2 at low strength; skipped if the pipeline throws. Ortho + CSM can flicker — disable in `babylon-backend.js` if it strobes |
| Displaced terrain quad | **done** | Height-sampled ground, green field |
| Civic / city cement patches | **done** | Grey slabs painted on the pad texture |
| Resource crystals + soft cyan ground glow | **done** | Faceted shards + flat additive disc. No point-light fireball |
| Instanced faction-tinted units | **done** | Nova cyan / Legion red tanks + skirmishers |
| Syndicate tint | **stub** | Color exists on `FACTIONS`; not fielded on the v1 pad |
| Charcoal buildings + small emissive windows | **done** | HQ hulls charcoal; sharp gold window boxes |
| Selection rings on ground | **done** | Torus, depth-write off, sits on terrain (no z-fight) |
| Tracers as directed streaks | **done** | Barrel → impact, not orbiting |
| Muzzle at barrel | **done** | |
| Fire on impact point | **done** | Billboard disc that rises in place |
| Fog of war | **done** | Projected dark texture with vision holes around Nova |
| HUD mass / energy / pop n/1K | **done** | Fake numbers; pop cap displayed as 1000, not raised in production |
| Full `sim.js` / pathfinding / AI | **skipped** | Fake 1v1 pad only |
| Production mesh atlas / V2 materials | **skipped** | Reimplemented feel, not the shader graph |
| Packed into APK | **skipped** | Preview-only by design |

## Rules this tree obeys

- No `import`/`export` under existing `src/`
- Production WebGL2 renderer is untouched
- `FACTION_POP_CAP` in production is unchanged
- `galaxyui.js` is untouched
- One WebGL context (Babylon). No Three.js
