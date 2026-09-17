# MASSFRONT Stormpeak ocean theatre

Isolated ES-module drop of the Tessendorf FFT ocean (Stormpeak) built in Grok
Build. It does **not** import, launch, or write to the production RTS, native
packages, cloud saves, or OTA channel — same contract as
`modules/space_exploration`.

Production lockstep sea height / hull drag still lives in [`src/sea.js`](../../src/sea.js).
That file is the sim authority (deterministic, Douglas scale, `waterMode: 'none'`
is free). This module is the **visual and acoustics theatre**: JONSWAP FFT,
Gerstner 100ft-class swell, Snell underside, buoyancy/splashes, Mackenzie SSP
sonar.

Do **not** register these files in `boot.js` or `assets/data/manifest.json`.
They use `import`/`export` and three.js; concatenating them into the one-global
WebGL2 bundle will crash the game.

## Layout

| Path | Role |
|------|------|
| `ocean/` | Tessendorf FFT, Gerstner, material, physics, hydrophone, sonar |
| `rts/` | Beaufort heading-drag port used by the theatre HUD |
| `hud/` | React command / sonar HUD (reference, not production UI) |
| `assets/waternormals.jpg` | Capillary normal map |

## Ocean contracts (do not drift)

- Gerstner sets must stay in sync across `ocean/ocean/oceanMaterial.js`,
  `ocean/physics/gerstner.js`, and CPU swell. Y is `48 * tanh(disp.y/48)`.
- FFT `displacementScale` is cut so Gerstner owns the tall sets. Cranking FFT Y
  makes cyan iceberg crests.
- Ocean material is `DoubleSide`. Backfaces = Snell’s window + TIR + caustics.
- Remount the lab with `SIM_REV`. Never `import('StormpeakLab?rev=')`.
- Ping is **P**. Space is pause. Q/E (and Shift+wheel) dive.

## Next integration (not done here)

Drive `src/sea.js` from the same spectrum the GPU uses, or replace the glass
water plane in the production renderer with this displacement field, without
breaking lockstep.

## Origin

Brought over from the Grok Build sandbox / the temporary
`CreatorJD1/Stormpeak-MASSFRONT` dump. Source of truth is this folder on
`stormpeak/ocean`.
