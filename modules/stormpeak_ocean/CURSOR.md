# Continue this in Cursor

Private GitHub repo: https://github.com/CreatorJD1/Stormpeak-MASSFRONT

```bash
git clone https://github.com/CreatorJD1/Stormpeak-MASSFRONT.git
cd Stormpeak-MASSFRONT
npm install
npm run dev
```

Needs Node 20+ and WebGL2.

Full tree with `node_modules` already installed: GitHub Releases → [v1.0](https://github.com/CreatorJD1/Stormpeak-MASSFRONT/releases/tag/v1.0) → `Stormpeak-MASSFRONT-full.zip`.

## What is built

Playable Tessendorf FFT storm sea (Beaufort up to hurricane / 100ft-class Gerstner sets), RTS produce/deploy, hull buoyancy + splashes + wet caustics, dive-able hydrophone (Snell’s window, jade volume, god rays), Mackenzie SSP sonar (P to ping).

## Suggested next work

- Tighten close-up capillary / foam so Close camera never reads as ice
- Stronger hull slam / spray at hurricane
- Make sonar PPI a real 3D volume, not a HUD-only canvas
- Persist sea-state + camera in localStorage
