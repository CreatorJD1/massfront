# Location surface art v1

Four original, image-generated environment overlays now live in the local
source-art tree at `source-media/location-surfaces-v1/`:

- arctic wind-packed snow and exposed blue ice;
- ashland basalt, ash, oxidation, and sparse dormant ember seams;
- Vespera mineral-organic crust with restrained bioluminescent features;
- wet shoreline contact stone/silt with foam residue.

They deliberately do not replace the active ground/soil/pave/grass/metal set
and are not wired into the terrain shader. `source-media/` is git-ignored and
excluded from packaged assets, so this pack adds no installer or GPU cost until
an integration pass deliberately promotes selected files into `assets/`.

## Bake and proofs

Run:

```powershell
python tools\bake-location-surfaces-v1.py
```

The Pillow-only deterministic bake writes, per surface, 512 px albedo WebP,
tangent normal/rough WebP, lossless RGB mask WebP, and a decoded 3x3 wrap proof.
It also writes `bake-report.json` with source/output SHA-256 hashes, exact byte
costs, and pre-/post-encode border error. The checked-in tool produced identical
hashes for all 17 runtime/preview files in a second consecutive bake.

Current runtime-candidate cost is 1,795,912 bytes (1.71 MiB) for all 12 maps.
All 12 pre-encode maps and all four decoded lossless masks have zero opposite-
edge channel delta. Decoded lossy albedo mean wrap error is 2.29–3.02/255 with
maximum 22; decoded normal/rough maximum is 34. The 3x3 proofs show no hard
edge. Full prompts, channel semantics, per-surface costs, and integration notes
are in the pack's `README.md`, `PROMPTS.md`, and `bake-report.json`.

## Recommended runtime use

Select one active biome overlay from the existing region/`BIOME_KITS`, then add
shoreline contact only near authored water or wet crater lips. Use albedo as
sRGB and normal/masks as linear; REPEAT plus trilinear mips. A 32–48 world-meter
repeat with a low-frequency world mask prevents stamping. HIGH may blend one
90-degree rotated sample at roughly 1.7x scale; LOW should omit overlay normals.

Folding one active biome into the existing terrain draw adds no draw call and
three texture samples. Shoreline adds up to three more only in the contact band.
At 512 RGBA-equivalent, one surface is 3 MiB decoded or 4 MiB with full mips;
one biome plus shoreline is 6/8 MiB. Do not keep all four resident: that would
be 12/16 MiB and defeats the region-selected design.
