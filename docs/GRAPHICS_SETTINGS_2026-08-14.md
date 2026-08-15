# Graphics settings — 2026-08-14

Honest presets + Advanced Graphics overrides. State lives in `META.settings.quality` + sparse `META.settings.gfxOver`. The renderer reads only `GFX` (preset merged with overrides).

## Toggles added (Settings → Display → Advanced Graphics)

| Row | GFX key | What it actually drives |
|---|---|---|
| Shadows OFF/LOW/HIGH | `shadowQ` 0/1/2 | `drawShadows()` early-out / stride |
| SSAO | `ao` | `aoBeginScene` / `aoDoSSAO` |
| Bloom | `bloom` | GL bloom pass + 2D `bloomOn` sprites |
| Contact Shadows | `contact` | Unit/rock/tree blobs inside `drawShadows` (buildings stay) |
| Water Quality | `waterAmp` | Existing `waterAmpNow()` / splash gate at 0.55 |
| Particles / VFX | `particles` | `mfVfxQ()` + `perfScale` fold in `main.js` |
| Anisotropic Filtering | `aniso` 1/4/8 | `mfAnisoCap` + `mfApplyAnisoBudget` (correct `MAX_TEXTURE_MAX_ANISOTROPY_EXT`) |
| Resolution Scale | `dprCap` | `resize()` fillrate cap. AUTO = preset. No native 2×/3× on phones |
| Mesh LOD / Motion | `organicSpan` + `lodBias` | Organic animation span + strategic mesh/icon cutovers |
| Local Lights | `lights` 0/4/8 | `sceneLightCap()` |
| World PBR Materials | `worldV2` | `mfWorldV2Enabled()` — locked on LOW (compiled off) |

Screen Grade stays the existing Display row (neutral/soft/punchy). Not duplicated. Not tied to Cinematic Lighting.

Cinematic Lighting is now honest: in-engine sun wash + `#grade` overlay only.

## Preset mapping (title → actual features)

| | LOW | MEDIUM (phone default) | HIGH (desktop default / flagship) | CINEMATIC (desktop / high-end only) |
|---|---|---|---|---|
| SSAO | off | 4-tap, amt 0.12 | 12-tap, amt 0.18 | 12-tap, amt 0.20 |
| Bloom | off | bright-pass only, amt 0.10 | 2-pass, amt 0.14 | 2-pass, amt 0.16 |
| Shadows | off | low stride | full | full |
| Contact blobs | off | on | on | on |
| Lights | 0 | 4 | 8 | 8 |
| Water | 0.40 (no splash) | 0.70 | 1.00 | 1.15 |
| Particles | 0.5 | 0.75 | 1.0 | 1.5 |
| Aniso | off (1×) | 4× | 8× | 8× |
| World V2 | off (locked) | off | on | on |
| DPR cap | 1.15 | 1.25 | phone 1.52–1.65 / desktop 2 | phone 1.70–1.80 / desktop 2 |
| Organic / LOD | off / 0.75 | 1800 / 0.90 | 2700 / 1.00 | 4600 / 1.15 |
| FX floor | 0 | 0.35 | 0.55 | 0.75 |

Changing Graphics Quality clears `gfxOver` so Advanced rows match the new title. Overrides persist in the career save.

## Not listed (no real pass)

Film grain, god rays, volumetric fog, cascaded shadow maps. Distance/border haze is shader-baked and always on (hides the map edge). FXAA rides the FBO present path whenever bloom or SSAO is up.

## Verification (8901, one hard-refresh)

- `node tools/bundle.mjs` clean (75 sources, no duplicate globals).
- `node tools/pack-www.mjs` staged `www/`.
- Reused the existing 8901 tab, one cache-disabled reload.
- Advanced Graphics rows present: Shadows, SSAO, Bloom, Contact Shadows, Water, Particles, Aniso, Resolution Scale, Mesh LOD, Local Lights, World PBR.
- Bloom tap flipped `GFX.bloom` true→false, wrote `settings.gfxOver.bloom`, survived `metaLoad()`.
- Preset sweep LOW/MEDIUM/HIGH/CINEMATIC: `gl.getError` stayed `[]` (no `MAX_TEXTURE_MAX_ANISOTROPY_EXT` regression).
- Screen Grade row still in Display, not coupled to Cinematic Lighting.

## Remaining debt

- World V2 / Material V2 upload still hardcodes 4× aniso; live taps re-apply via `mfApplyAnisoBudget`.
- `mfWorldV2Enabled()` still refuses LOW even if `gfxOver.worldV2` is forced (toggle is locked).
- HIGH/CINEMATIC CSM: living walk + gated bone palettes; carrier/modules in the atlas; terrain casts near (HIGH) / near+mid (CINEMATIC). Far cine clip skipped (fillrate). Leftover: apply is still screen-space multiply (not material `ndl` — civic filmic write / World V2 / unit 4). Filmic grade pass still absent.
- Existing phone careers that already saved `quality:'high'` are not migrated down to MEDIUM.
