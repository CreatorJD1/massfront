# Planet map art v2 tooling

Run from the repository root:

```powershell
python tools/planet-map-art/bake-planet-map-v2.py
python tools/planet-map-art/bake-planet-map-v2.py --verify-only
node tools/planet-map-art/capture-material-ab.mjs
python tools/planet-map-art/analyze-capture-ab.py
node tools/planet-map-art/verify-packed-assets.mjs
```

Production maps and their hash/quality report are written under
`assets/textures/terrain/planet-map-v2/`. Visual seam proofs are written under
`tools/planet-map-art/previews/`; inspect the 3x3 repeats and the normal-light
contact sheet before wiring a material into a live biome slot.

The capture script stages a natural grass/soil site selected through the live
hardscape mask and macro material semantics. It records matched 412x915 mobile
captures through an isolated hardware ANGLE/D3D11 browser, replacing only the
live texture contents after the baseline frame. The analysis script creates a
paired contact sheet and numerical image-energy report under `evidence/`.
