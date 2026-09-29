# Stormpeak / MASSFRONT

Tessendorf FFT ocean theatre with RTS command, hull buoyancy, and a hydrophone / sonar layer.

## Run

```bash
npm install
npm run dev
```

Needs **Node 20+** and **WebGL2** (floating-point render targets).

A full tree **with `node_modules` already installed** is attached on the [v1.0 release](https://github.com/CreatorJD1/Stormpeak-MASSFRONT/releases/tag/v1.0) (`Stormpeak-MASSFRONT-full.zip`, ~107 MB). Unzip and `npm run dev`. If native modules fail on your OS, run `npm ci`.

## Controls

- Drag to orbit (Hydrophone: drag looks around underwater)
- Scroll zoom (Shift+scroll dives)
- WASD pan
- **P** active sonar ping
- **Q** dive / **E** rise
- Space pause
- 1 / 2 / 3 produce constructor / corvette / destroyer

HUD: sea state (Calm → Tempest), cameras (Command / Tactical / Close / Hydrophone / Horizon), sonar PPI + sound-speed profile, LF/MF/HF, Mix / Thermo / SOFAR depth.

## Layout

```
src/lib/ocean/     Tessendorf FFT, Gerstner swell, Snell underside, physics, acoustics
src/lib/massfront/ RTS match
src/components/    HUD + viewport
src/routes/        app shell
```

Hydrophone starts underwater. Close is the surface shader view.
