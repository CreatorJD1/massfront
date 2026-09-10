# Galactic Exploration pack — is it game-ready and optimized?

**Date:** 2026-09-05
**Verdict: no.** The gate that decides this now exists, it fails today, and it names
215 models. This document is what it measured.

> **Units.** Every "MB" here is MiB (1024²), the same convention the manifest and the
> existing pack tooling use. Numbers are stated as **MEASURED** or **PROJECTED** and
> never mixed inside a single figure.

---

## 1. The one-line answer

The pack is **541.84 MB across 440 files**, of which **99.4% is art** and **3.30 MB is
code**. Inside the art, the dominant problem is not that the models are detailed — it is
that **190.25 MB of the pack is byte-identical duplicate texture data**, and that **every
single texture in the pack is still raw PNG**. Not one model uses WebP or KTX2, and 327
of 330 use no mesh compression at all.

There are 140 unique texture images in this pack. They are stored 5,052 times.

---

## 2. How these numbers were produced

Everything below comes from `tools/verify-exploration-pack-optimized.mjs`, which parses
each GLB directly: 12-byte header, `glTF` magic, then the JSON and BIN chunks. Image
bytes come from the `bufferView` each `images[]` entry points at (deduped so two images
sharing a view are not counted twice); the codec is **sniffed from the actual first bytes
in the BIN**, not trusted from the optional `mimeType` field. Triangles are counted per
unique mesh from the `indices` accessor (or POSITION when non-indexed), honouring the
primitive mode. It reads only the header and JSON chunk, so a 518 MB pack scans in ~6s.

```
node tools/verify-exploration-pack-optimized.mjs --json .tmp/pack-scan.json
```

**Two independent cross-checks were run before trusting any of it:**

- The 330 GLBs found on disk are **exactly** the 330 GLB entries in
  `modules/space_exploration/dist/exploration-content-manifest-v1.json` — 0 missing, 0
  extra, 0 byte mismatches. The scan directory *is* the shipped model set.
- The manifest's declared `totalBytes` (568,156,643) equals the sum of its per-file
  `bytes` exactly, so the installer's hard-fail invariant holds and the manifest is a
  trustworthy inventory.

The PNG→WebP ratios in §7 were measured here, by extracting real embedded textures out of
these GLBs and re-encoding them with the local `ffmpeg`/libwebp. They are not borrowed
from a benchmark.

---

## 3. What is actually in the pack — MEASURED

| Type | Files | Bytes | Share |
|---|---:|---:|---:|
| `.glb` models | 330 | **518.56 MB** | 95.7% |
| `.webp` standalone textures | 51 | 19.98 MB | 3.7% |
| `.js` | 53 | 2.82 MB | 0.5% |
| `.wasm` | 1 | 0.19 MB | 0.03% |
| `.json` | 1 | 0.16 MB | 0.03% |
| `.css` | 3 | 0.12 MB | 0.02% |
| `.html` | 1 | 0.01 MB | 0.00% |
| **Total** | **440** | **541.84 MB** | |

**Code vs art: 59 files / 3.30 MB of code against 381 files / 538.54 MB of art.** The
module itself is tiny. The download is entirely an art problem.

Inside the 330 models:

| Measure | Value |
|---|---|
| Triangles (unique meshes) | **2,502,241** |
| Embedded images | **5,052**, totalling **260.30 MB** |
| Image codecs present | **PNG only** — 0 WebP, 0 KTX2, 0 JPEG, 0 external `uri` refs |
| Models carrying PNG | 323 of 330 |
| Models with mesh compression | **3 of 330** (all `KHR_draco_mesh_compression`) |
| Bytes in uncompressed models | **429.63 MB** |
| Extensions used anywhere | `KHR_draco_mesh_compression`, `KHR_texture_transform`, `KHR_materials_emissive_strength`, `KHR_materials_transmission` |

The 7 models with no PNG at all are all in `mf-building-hs-v1`
(`mf-bldhs-brutalist-tank-farm`, `-colonial-depot-shed`, `-colonial-gatehouse`,
`-colonial-industrial-hall`, `-ruined-depot-shed`, `-ruined-tower-slab`,
`-ruined-tower-spire`). The only three models using Draco are the three hand-authored hero
models in `models/`.

**Size distribution — MEASURED**

| Bucket | Models | Bytes |
|---|---:|---:|
| < 0.25 MB | 6 | 1.16 MB |
| 0.25–0.5 MB | 40 | 15.28 MB |
| 0.5–1 MB | 131 | 97.10 MB |
| 1–2 MB | 101 | 138.64 MB |
| 2–4 MB | 44 | 111.04 MB |
| 4–8 MB | 4 | 19.85 MB |
| **> 8 MB** | **4** | **135.50 MB** |

Four models carry 26% of all model bytes.

**Triangle distribution — MEASURED**

| Bucket | Models | Triangles |
|---|---:|---:|
| < 5k | 211 | 463,301 |
| 5k–20k | 108 | 1,065,216 |
| 20k–60k | 8 | 239,906 |
| **> 60k** | **3** | **733,818** |

Geometry is not the pack's main problem. 319 of 330 models are under 20k triangles. Three
models hold 29% of all triangles.

---

## 4. The finding that dominates everything else — MEASURED

The 5,052 embedded images in the pack hash to **140 unique blobs**.

| | Bytes | Share of PNG |
|---|---:|---:|
| Unique texture art | **70.05 MB** | 26.9% |
| **Byte-identical redundant copies (4,912 of them)** | **190.25 MB** | **73.1%** |

That 190.25 MB is **36.7% of the entire 518.56 MB model payload**, shipped to carry data
the device already has. The world kits are the cause: every model in a kit embeds its own
private copy of the same shared material atlas.

| Collection | Images | PNG bytes | Unique blobs | Unique bytes | **Redundant** |
|---|---:|---:|---:|---:|---:|
| `models` | 60 | 83.30 MB | 48 | 67.29 MB | 16.01 MB |
| `mf-superstructure-v1` | 1,236 | 44.01 MB | 50 | 1.56 MB | **42.45 MB** |
| `mf-cityforms-kit-v1` | 936 | 34.33 MB | 49 | 1.58 MB | **32.75 MB** |
| `mf-modular-building-v1` | 842 | 30.40 MB | 43 | 1.44 MB | **28.95 MB** |
| `mf-transit-kit-v1` | 703 | 23.50 MB | 47 | 1.45 MB | **22.05 MB** |
| `mf-ground-kit-v1` | 483 | 19.08 MB | 43 | 1.40 MB | **17.68 MB** |
| `mf-building-hs-v1` | 456 | 16.47 MB | 30 | 0.98 MB | **15.49 MB** |
| `spline` | 113 | 3.64 MB | 46 | 1.43 MB | 2.22 MB |
| `mf-modular-road-v1` | 133 | 3.33 MB | 19 | 0.48 MB | 2.85 MB |
| `mf-platform-hs-v1` | 90 | 2.23 MB | 9 | 0.22 MB | 2.01 MB |

The single worst blob is a 0.10 MB texture stored **205 times**, costing 20.18 MB on its
own. The top eight duplicated blobs alone cost 94.6 MB.

`models/` is the exception and is genuinely unique art — 67.29 MB of its 83.30 MB is
one-of-a-kind. (Note that `massfront-showcase-contacts.glb` and
`nexus-vii-civilization-ship.glb` have byte-identical 11.03 MB texture sets, so 11.03 MB
of that 16.01 MB redundancy is those two sharing a material set.)

**This is fixable without touching the art at all.** The shipped
`modules/space_exploration/lib/GLTFLoader.js` already resolves external image URIs
(`source.uri` → `resolveURL(..., options.path)`, lines 722 / 2259 / 2092), and the pack
already ships 51 standalone `.webp` files, so external texture references are an
established pattern here. Pointing the world-kit GLBs at a shared texture directory
instead of embedding is a build-step change, and the browser HTTP cache then downloads
each texture once.

---

## 5. Top 20 models by size, and why each is big — MEASURED

`bound` classifies the cause: **texture** = PNG is ≥55% of the file, **geometry** = ≤25%,
**mixed** in between.

| # | Size | PNG | PNG % | Triangles | Mesh compression | Bound by | Model |
|---:|---:|---:|---:|---:|---|---|---|
| 1 | **65.17 MB** | 61.25 MB | 94% | 262,248 | Draco | texture | `models/uga-command-cutaway.glb` |
| 2 | **46.56 MB** | 0.14 MB | 0% | **368,716** | none | geometry | `spline/mf-hy3d-nordhall-skyscraper-spline-v1.glb` |
| 3 | **12.42 MB** | 11.03 MB | 89% | 102,854 | Draco | texture | `models/massfront-showcase-contacts.glb` |
| 4 | **11.35 MB** | 11.03 MB | 97% | 43,104 | Draco | texture | `models/nexus-vii-civilization-ship.glb` |
| 5 | 6.46 MB | 0.83 MB | 13% | 45,334 | none | geometry | `mf-building-hs-v1/mf-bldhs-colonial-tower-spire.glb` |
| 6 | 5.01 MB | 1.02 MB | 20% | 32,961 | none | geometry | `mf-superstructure-v1/mf-sup-colonial-arcology-pylon.glb` |
| 7 | 4.36 MB | 1.15 MB | 26% | 26,462 | none | mixed | `mf-superstructure-v1/mf-sup-brutalist-arcology-pylon.glb` |
| 8 | 4.02 MB | 1.07 MB | 27% | 24,276 | none | mixed | `mf-superstructure-v1/mf-sup-colonial-spire-crown.glb` |
| 9 | 3.52 MB | 0.94 MB | 27% | 21,270 | none | mixed | `mf-superstructure-v1/mf-sup-colonial-tower-monolith.glb` |
| 10 | 3.33 MB | 1.14 MB | 34% | 17,978 | none | mixed | `mf-superstructure-v1/mf-sup-brutalist-spire-crown.glb` |
| 11 | 3.25 MB | 0.83 MB | 26% | 19,899 | none | mixed | `mf-building-hs-v1/mf-bldhs-colonial-civic-hall.glb` |
| 12 | 3.24 MB | 0.94 MB | 29% | 18,982 | none | mixed | `mf-modular-building-v1/mf-bld-colonial-arcology-stack.glb` |
| 13 | 3.23 MB | 0.75 MB | 23% | 20,432 | none | geometry | `mf-building-hs-v1/mf-bldhs-brutalist-civic-hall.glb` |
| 14 | 3.16 MB | 0.75 MB | 24% | 19,866 | none | geometry | `mf-building-hs-v1/mf-bldhs-brutalist-watchtower.glb` |
| 15 | 3.12 MB | 1.02 MB | 33% | 17,224 | none | mixed | `mf-superstructure-v1/mf-sup-colonial-platform-deck.glb` |
| 16 | 3.05 MB | 0.68 MB | 22% | 19,594 | none | geometry | `mf-modular-building-v1/mf-bld-brutalist-arcology-stack.glb` |
| 17 | 3.04 MB | 1.00 MB | 33% | 16,745 | none | mixed | `mf-cityforms-kit-v1/mf-frm-colonial-mega-slab.glb` |
| 18 | 3.00 MB | 0.94 MB | 31% | 16,884 | none | mixed | `mf-superstructure-v1/mf-sup-brutalist-platform-deck.glb` |
| 19 | 2.95 MB | 1.01 MB | 34% | 15,978 | none | mixed | `mf-superstructure-v1/mf-sup-colonial-spire-needle.glb` |
| 20 | 2.94 MB | 1.13 MB | 38% | 14,852 | none | mixed | `mf-superstructure-v1/mf-sup-brutalist-tower-monolith.glb` |

The shape of the list: **#1, #3 and #4 are pure texture problems** — Draco already
compressed their geometry, so almost everything left is PNG. **#2 is the opposite** — a
368,716-triangle Spline export with essentially no texture at all; its 46.56 MB is raw
vertex data. **#5 through #20 are all "mixed"**, and they are the world-kit tail: a few
hundred KB of duplicated atlas plus a few MB of uncompressed geometry each.

---

## 6. Per-collection rollup — MEASURED

| Collection | Models | Bytes | PNG | PNG % | Triangles | No mesh compression | Fails: size / png-share / tris |
|---|---:|---:|---:|---:|---:|---:|---|
| `mf-superstructure-v1` | 56 | 91.24 MB | 44.01 MB | 48% | 384,077 | 56/56 | 0 / **44** / 0 |
| `models` | 3 | 88.94 MB | 83.30 MB | 94% | 408,206 | 0/3 | **3** / **3** / 0 |
| `mf-cityforms-kit-v1` | 68 | 79.58 MB | 34.33 MB | 43% | 369,270 | 68/68 | 0 / **48** / 0 |
| `mf-modular-building-v1` | 36 | 59.64 MB | 30.40 MB | 51% | 236,650 | 36/36 | 0 / **29** / 0 |
| `mf-building-hs-v1` | 33 | 58.37 MB | 16.47 MB | 28% | 394,365 | 33/33 | 0 / 9 / 0 |
| `spline` | 7 | 52.03 MB | 3.64 MB | 7% | 383,676 | 7/7 | **1** / 6 / **1** |
| `mf-transit-kit-v1` | 54 | 40.27 MB | 23.50 MB | 58% | 134,634 | 54/54 | 0 / **40** / 0 |
| `mf-ground-kit-v1` | 36 | 22.56 MB | 19.08 MB | 85% | 24,977 | 36/36 | 0 / **34** / 0 |
| `mf-platform-hs-v1` | 30 | 16.83 MB | 2.23 MB | 13% | 119,726 | 30/30 | 0 / **0** / 0 |
| `mf-modular-road-v1` | 7 | 9.13 MB | 3.33 MB | 36% | 46,660 | 7/7 | 0 / 1 / 0 |

Reading it:

- **`mf-superstructure-v1` is the largest kit** at 91.24 MB, and 42.45 MB of that is
  duplicate textures.
- **`mf-ground-kit-v1` is the most texture-bound** — 85% PNG for only 24,977 triangles
  across 36 models. It is essentially 22.56 MB of ground decals, 17.68 MB of which is
  duplicated.
- **`mf-platform-hs-v1` is the model citizen** — 30 models, 16.83 MB, 13% PNG, and **zero
  rule failures**. Whatever was done here is the pattern the other kits should follow.
- **`spline` is a geometry outlier** — 7 models holding 383,676 triangles, more than the
  56-model superstructure kit, and one file (`nordhall`) is 90% of its bytes.

---

## 7. PNG → WebP, measured on this art

**Aggregate — MEASURED.** 264 PNGs extracted from 10 models spanning 6 collections,
80.1 MB of real embedded texture, re-encoded with local ffmpeg/libwebp:

| Encode | Result | Ratio |
|---|---:|---:|
| Lossy, quality 90 | 14.3 MB | **×5.58** |
| Lossless | 62.3 MB | **×1.29** |

The ×6.1 figure measured separately by the texture-compression work (86.2 MB → 14.1 MB
over 6 models) agrees with this within ~10%; the gap is sample and quality setting. Both
are real measurements on this art.

**The ×5.58 aggregate hides something important.** Broken out by texture role
(35 images, small sample — treat the spread as indicative, not precise):

| Role | q90 | q95 | lossless |
|---|---:|---:|---:|
| `baseColor` | ×7.66 | ×5.10 | ×1.25 |
| `metallicRoughness` | ×14.03 | ×8.31 | ×1.28 |
| `emissive` | ×3.72 | ×2.61 | ×1.81 |
| **`normal`** | **×3.54** | **×3.04** | **×1.17** |

And here is why that matters — the pack's PNG bytes by role, **MEASURED across all 330
models**:

| Role | Bytes | Share of PNG |
|---|---:|---:|
| **`normal`** | **135.23 MB** | **52.0%** |
| `baseColor` | 76.69 MB | 29.5% |
| `metallicRoughness` | 44.78 MB | 17.2% |
| `emissive` | 3.60 MB | 1.4% |

**More than half the PNG in this pack is normal-map data — the role that compresses
worst and the role where lossy artefacts show up as visible shading errors.** Any plan
that assumes a flat ×6 across the whole 260.30 MB is assuming the best-case ratio on the
bytes least able to deliver it.

---

## 8. Projections — PROJECTED, not measured

Applying the per-role ratios above to the measured per-role byte split. **These are
arithmetic projections. No one has re-encoded the whole pack and no one has looked at the
result.**

| Policy | PNG after | Saved | Pack after | …and after dropping nordhall |
|---|---:|---:|---:|---:|
| A — q90 everywhere | 52.4 MB | 207.9 MB | 310.6 MB | **264.1 MB** |
| B — q95 on normal/ORM, q90 on colour | 66.3 MB | 194.0 MB | 324.6 MB | 278.0 MB |
| C — lossless on normal/ORM, q90 on colour | 161.5 MB | 98.8 MB | 419.8 MB | 373.2 MB |

**No texture-recompression policy reaches the 200 MB ceiling.** The most aggressive one
still lands 64 MB over.

Deduplication changes that picture more than compression does:

| Step | Pack |
|---|---:|
| Today (MEASURED) | 518.56 MB |
| − duplicate textures externalised and shared (−190.25 MB) | 328.31 MB |
| − remaining 70.05 MB of unique PNG compressed at ~×5 (−~56 MB) | ~272 MB |
| − nordhall dropped (−46.56 MB) | **~226 MB** |

Still ~26 MB over. Closing that last gap needs geometry compression on the 327
uncompressed models (**252.6 MB** of geometry and JSON with no Draco or meshopt, 206.2 MB of it once nordhall is dropped), and **no
Draco or meshopt encoder exists in this repo** — only the decoders
(`lib/DRACOLoader.js`, `lib/draco/`). That is a tooling gap, not an art gap.

---

## 9. The two owner decisions and their effect

**KEEP `uga-command-cutaway.glb`, recompress its textures.**
Measured: 65.17 MB, of which 61.25 MB is PNG across 44 images — 24.48 MB normal,
17.63 MB metallicRoughness, 15.68 MB baseColor, 3.46 MB emissive. Draco already handles
its 262,248 triangles. Projected at per-role q90: PNG 61.25 → 11.15 MB, **model 65.17 →
~15.07 MB**. That is a 50 MB win and easily the highest-value single action available.

> **But it still fails the gate.** ~15.07 MB is over the 8 MB `MODEL_SIZE` cap, and its
> 262,248 triangles are over the 240,000 `COMPRESSED_TRIANGLE_BUDGET`. Keeping this model
> means one of three things, and it is an owner call which: decimate it, split it into
> streamed sub-meshes, or consciously raise the caps and record why this one asset is
> exempt. Recompressing its textures alone will not make the gate pass.

**DROP `mf-hy3d-nordhall-skyscraper-spline-v1.glb`.**
Measured: 46.56 MB, 368,716 triangles, no mesh compression, only 0.14 MB of texture. Pure
geometry. Dropping it removes 46.56 MB (9.0% of all model bytes) and 14.7% of all
triangles in the pack.

> Its effect on the gate is clean: it is **the only `TRIANGLE_BUDGET` failure in the
> entire pack**, so dropping it takes that rule to zero, and it removes one of the four
> `MODEL_SIZE` failures. It also takes `spline` from 52.03 MB to 5.47 MB.

Together the two decisions are worth a projected ~96.6 MB (46.56 measured + ~50.1
projected) and clear one of the five rules outright.

---

## 10. What the gate checks, and exactly how many models fail today

`tools/verify-exploration-pack-optimized.mjs`, run with defaults against
`modules/space_exploration/assets/runtime`. **Exit code 1. Runtime 5.8s.**

| Rule | Threshold | Failing today | Why the threshold |
|---|---|---:|---|
| `MODEL_SIZE` | > 8 MB | **4** | A model streams while the player is in the scene; past ~8 MB the pop-in is visible. |
| `RAW_PNG_SHARE` | PNG > 40% of file | **214** | The loader supports WebP and KTX2. A mostly-PNG model is not big, it is unconverted. |
| `TRIANGLE_BUDGET` | > 60,000 tris, no mesh compression | **1** | Uncompressed triangles cost wire bytes *and* phone GPU time. |
| `COMPRESSED_TRIANGLE_BUDGET` | > 240,000 tris even with Draco/meshopt | **1** | Mesh compression buys bytes, not vertices. Stops the rule above being gamed. |
| `PACK_BUDGET` | model bytes > 200 MB | **1** (518.56 MB, over by 318.56 MB) | The largest optional download to ask for in one sitting. GLB only — the 19.98 MB of `.webp` and 3.30 MB of code sit on top. |

**Total: 221 violations across 215 distinct models, plus the pack ceiling.**

A note on honesty in the counting: `RAW_PNG_SHARE` only fires once a model actually
carries 256 KB of PNG, so a tiny prop that happens to be 55% of a small PNG does not bury
the real offenders. **14 further models exceed the 40% share but sit under that floor**,
and the gate prints that count on every run rather than silently shrinking its own
result.

Named offenders, `MODEL_SIZE`:

```
uga-command-cutaway.glb                        65.2MB > 8.0MB
mf-hy3d-nordhall-skyscraper-spline-v1.glb      46.6MB > 8.0MB
massfront-showcase-contacts.glb                12.4MB > 8.0MB
nexus-vii-civilization-ship.glb                11.4MB > 8.0MB
```

`TRIANGLE_BUDGET`: `mf-hy3d-nordhall-skyscraper-spline-v1.glb`, 368,716 tris, no mesh
compression.
`COMPRESSED_TRIANGLE_BUDGET`: `uga-command-cutaway.glb`, 262,248 tris with Draco.
`RAW_PNG_SHARE`: 214 models, worst first — the cutaway (61.2 MB PNG = 94%), showcase
contacts (11.0 MB = 89%), nexus-vii (11.0 MB = 97%), then a long world-kit tail at
40–74%. The full list is in `--json`.

### The gate was mutation-tested

A check that cannot fail is worthless, so this one was made to fail and to pass on
demand. 35 assertions, all passing:

- **Synthetic GLBs were built that violate exactly one rule each**, and each fires that
  rule *and only that rule*: an oversize-but-clean model → `MODEL_SIZE` alone; a 60%-PNG
  model → `RAW_PNG_SHARE` alone; a 100k-triangle uncompressed model → `TRIANGLE_BUDGET`
  alone; a 300k-triangle meshopt model → `COMPRESSED_TRIANGLE_BUDGET` alone.
- **Negative cases stay silent**: a clean model passes; a 100k-triangle *Draco* model
  passes (under the compressed cap); a 60%-PNG model under the 256 KB floor passes and is
  reported as a floor skip.
- **The gate can reach exit 0.** Run against today's real pack with every threshold
  relaxed, it prints `PASS` and exits 0 — while still reporting 330 models and 2.5M
  triangles. It is not a constant failure.
- **Each rule is independently load-bearing on the real pack**: relax one threshold and
  only that rule's count drops to zero (4→0, 214→0, 1→0, 1→0).
- **Vacuous passes are blocked**: an empty directory exits 1 saying so; a missing
  directory exits 1; a file that is not a GLB exits 1 naming it as unparseable rather than
  skipping it; a non-numeric threshold exits 1. Two internal self-checks fail the run if
  the parser reports zero triangles or zero image bytes across a large pack — because on
  this project a zero in a headless check is usually the check, not the code.
- **A lying `mimeType` does not fool it**: a fixture declaring `image/jpeg` over PNG bytes
  is counted as PNG and the mismatch is reported. (Across the real pack: 0 mismatches.)

---

## 11. What this cannot tell you

Stated plainly, because the numbers above are easy to over-read.

- **No visual quality comparison has been done.** Not one re-encoded texture has been
  looked at, in isolation or in the engine. The ×5.58 is a byte ratio and says nothing
  about whether q90 WebP is acceptable on this art. Given that 52% of the payload is
  normal maps, this is the single largest open risk and it needs eyes, not arithmetic.
- **Compression ratio varies by texture content.** The per-role table comes from 35
  images weighted toward the largest textures in the pack. A flat, gradient-heavy atlas
  compresses very differently from a detailed albedo. Treat the per-role numbers as a
  spread, not a constant.
- **Every §8 figure is a projection.** Nothing in that table has been produced. The real
  numbers will differ, and the projections assume every PNG converts cleanly with no
  per-asset exceptions — which never happens.
- **The 200 MB ceiling is a judgement, not a measurement.** It is defensible (an optional
  mobile download over cellular) but it is a choice, and the gate takes
  `--max-pack-mb` precisely so it can be argued with. The same is true of all five
  thresholds.
- **The gate measures bytes and triangles. It does not measure whether the pack is
  good.** It cannot tell you draw calls, material count at runtime, texture memory after
  GPU decode (WebP and PNG both decode to the same uncompressed VRAM — only KTX2/Basis
  fixes *that*, and `KTX2Loader` is not wired up), shader cost, LOD coverage, whether the
  art is used, or whether it looks right. It is a download-budget gate, nothing more.
- **Triangles are counted per unique mesh, not per node instance.** That is the right
  measure for file size, but a model with one mesh instanced 200 times will draw far more
  geometry than its triangle count suggests. The gate does not model that.
- **The dedup saving assumes textures can be externalised.** The loader supports it and
  the pack already ships standalone `.webp`, but it changes GLBs from self-contained to
  dependent on a sibling directory, and every externalised texture becomes a new manifest
  entry the installer must account for. That work has not been scoped here.
- **Nothing published was checked.** All of this is local files. Per the pipeline's
  standing rule, release state comes from live endpoints, and no live manifest was fetched
  for this report.

---

## 12. Reproducing this

```bash
# The gate, defaults, against the shipped model set
node tools/verify-exploration-pack-optimized.mjs

# Machine-readable: per-model metrics, per-rule counts, every violation
node tools/verify-exploration-pack-optimized.mjs --json .tmp/pack-scan.json

# Argue with a threshold
node tools/verify-exploration-pack-optimized.mjs --max-pack-mb 280 --max-png-share 0.5

# Point it at a candidate optimized build instead
node tools/verify-exploration-pack-optimized.mjs --dir .tmp/exploration-optimized
```

Flags: `--dir`, `--json`, `--max-model-mb`, `--max-png-share`, `--min-png-bytes`,
`--max-tris`, `--max-tris-compressed`, `--max-pack-mb`, `--top`. Exit 0 inside budget,
1 otherwise.

---

## 13. What to do next, in value order

1. **Deduplicate the world-kit textures.** 190.25 MB, no art change, loader already
   supports it. Nothing else on this list comes close.
2. **Drop nordhall.** 46.56 MB, already decided, clears `TRIANGLE_BUDGET` entirely.
3. **Recompress the cutaway's textures.** ~50 MB projected, already decided — then decide
   what to do about it still being ~15 MB and 262k triangles.
4. **Convert the remaining unique PNG to WebP**, with normal and ORM maps reviewed by eye
   before committing to a lossy setting.
5. **Get a Draco or meshopt encoder into the repo.** 327 models and 252.6 MB of geometry
   currently have no compression path at all, and the last ~26 MB to the ceiling is on the
   other side of it.
6. **Copy whatever `mf-platform-hs-v1` did.** 30 models, zero violations, 13% PNG. It is
   the only collection in the pack that already behaves.

---

## 14. Continuation result — geometry delivery completed locally

The interrupted geometry pass is now implemented and verified. The exact build-only
toolchain is locked at `@gltf-transform/core`, `@gltf-transform/extensions`, and
`@gltf-transform/functions` 4.5.0 plus `draco3d` 1.5.7. The resulting 329-model
delivery set is fully Draco encoded: 326 models were newly encoded, three existing
Draco models were retained byte-for-byte, and the rejected Nordhall model remains
preserved outside the signed runtime catalog.

**Changelog: geometry ×3 compression with no runtime changes.** Model payload fell
from 245.04 MiB to 74.38 MiB (×3.294; 170.65 MiB saved). The complete signed optional
pack, including code and the newly enumerated KTX2/Basis decoder chain, is 98.22 MiB
across 446 files. Its self-hash is
`sha256-91120dfaf56cd0b880eb9c1f4afb85a560f0467333774a7dd520f1165e0725a6`.

This pass does not simplify or decimate geometry. Position quantization is disabled;
the verifier decodes every output and checks scene, node, mesh, primitive, material,
texture bytes, transforms, and bounds against the pre-Draco candidate. Draco removed
only two exact zero-area triangles from one inspected spire model; no visible surface
was removed. A corrected single-LOD comparison on the hardware NVIDIA/D3D11 path
showed matching representative models, with 0.257% changed pixels at worst and no
console or HTTP errors. The earlier stacked/washed-out diagnostic rendered LOD0,
LOD1, and LOD2 together and was invalid.

The runtime manifest, catalog counts (326 entries: 320 world-kit plus six spline),
budget gate, encoder mutation test, KTX2 loader wiring, bundle, and packed `www/`
preview were regenerated locally. No OTA, APK, Hugging Face, Cloudflare, or production
channel was published or activated.

---

## 15. Owner visual rejection and complete-base result

Section 14 records the compression result before the subsequent visual review;
it is not the current delivery count. The owner rejected 42 runtime models from
the original 330-model review set, including all 33 `mf-building-hs-v1`
duplicates, two unfinished container yards, five legacy Spline placeholders,
the screenshot-visible Brutalist Spire Crown, and the UGA Command Cutaway. The
runtime GLBs were deleted while authoring material remains only as rejected
provenance. The command system uses its procedural management-scene fallback
instead of mounting the rejected cutaway.

The current signed base closure contains **404 files / 73.41 MiB**, including
**287 GLBs / 49.6 MiB**. The world-model catalog contains **285 entries**:
284 world-kit models and one retained Spline model. The manifest declares
`delivery: "base"`, is not optional, and has self-hash
`sha256-fa051b04bbe66a8ed21f5f0ecfcc439f13db45320aa16379a81d3e121a399fb9`.
The catalog hash is
`901fcee3575d78ae82cf29997adc213e3c6114dfc9dc216ee65745501975a4dd`.

The rejection verifier, exact-path ledger gate, manifest integrity check, and
model budget gate all pass with none of the 42 visually rejected runtime paths
present. Normal browser/PWA and Android packaging now includes this signed
closure; only explicit diagnostic-slim packaging may omit it.
