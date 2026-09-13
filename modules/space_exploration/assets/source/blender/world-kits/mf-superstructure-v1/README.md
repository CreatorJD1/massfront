# MASSFRONT Superstructure Kit v1

The tier above [mf-modular-building-v1](../mf-modular-building-v1/README.md):
curtain walls you can run for kilometres, skyscrapers that dominate a skyline,
and platforms that stand out of the terrain or straight out of the ocean.

**14 archetypes × 3 style sets (colonial / Nova brutalist / derelict) = 42
modules**, on the same 32 m placement grid as the building and road kits.

The generator **imports the building kit's geometry vocabulary** rather than
copying it (`runpy.run_path` with a non-`__main__` run name, so importing it
doesn't kick off a 36-module build). The party-plane rules therefore live in
exactly one place.

## Engine anchors

These are read from `src/engine/terrain.js`, not invented:

| Constant | Value | Meaning |
| --- | --- | --- |
| `WATER_Y` | `0` | Sea level sits at world y=0 by construction (terrain.js:168) |
| `SEABED` | `-26` | Ocean bottom is floored there, so water has depth |
| `HSCALE` | `118` | Terrain vertical exaggeration — roughly the tallest landform |

So ocean platforms run their caissons from the deck down to **−26** and are cut
by the waterline at **0**, with a distinct darker, greener `submerged` material
below it — the waterline reads as a material change, not a shadow. Towers are
scaled against `HSCALE`: the 140–200 m band reads as a big-city skyline, the
200–300 m band as genuinely towering.

## Contents

**Curtain wall (6)** — `wall_straight`, `wall_corner`, `wall_gate`,
`wall_bastion`, `wall_ramp`, `wall_terminus`. All 1×1, ~18–24 m.

**Skyscrapers (4)** — `spire_needle` (1×1, 156 m), `tower_monolith`
(2×2, 188 m), `spire_crown` (2×2, 248 m), `arcology_pylon` (2×2, 292 m).
Deliberately split across both height bands so a skyline has variety.

**Platforms (6)** — `platform_deck` (3×3, ocean), `platform_rig` (2×2, ocean),
`platform_landing` (2×2, terrain), `platform_causeway` (2×1, ocean), plus deck
access:

- `platform_ramp` (3×1) — straight approach climbing the full 26 m over 96 m
  (1:3.7). Grade at the W edge, deck level at the E edge; both ends land exactly
  on their cell plane at the right height, so a causeway or platform can butt
  either one.
- `platform_ramp_tower` (2×2) — the same climb folded into a single cell, two
  flights at right angles around a central core: in at the S edge at grade, out
  at the N edge at deck level. For sites with no room for a 96 m approach.

Without these the platforms were marooned — a 26 m deck on caissons with no way
up. Every socket now declares **`mf_edge_z`**, the height that edge presents, so
a placer puts a ramp's high end against a deck and its low end on the ground
rather than the other way round.

Ramps needed a new primitive. Every other mass in these kits lofts between two
*horizontal* rings, which cannot express a slope, and a ramp built from stepped
boxes reads as a staircase at this scale — so `sloped_slab` pushes its eight
corners directly.

## The contract

Same rule as the building kit — **nothing crosses the party plane** — plus two
this tier adds:

- **Wall runs must REACH the plane exactly on their E/W axis.** A rampart is
  only as good as its worst joint; a segment that stops 20 cm short shows a
  seam every 32 m for the whole run. Wall bodies are therefore *not* inset and
  *not* battered on X. The fortress slope is applied in Y only, which is where
  it reads anyway.
- **Ocean platforms must reach the seabed.** Legs that stop short read as a
  table standing in water.

The rampart deliberately sits at mid-cell rather than on the boundary, which is
what lets `wall_bastion` project toward the field without ever leaving its own
cell.

`verify_super` checks CROSS, GAP, RUN, SEABED and LOD monotonicity across all
42 modules at all 3 LODs. It caught, among others, a bastion cornice built on
`0.60` against a body built on `0.58` — 5 cm of oversail into the field cell,
invisible in any render.

## Scale-specific detail

Superstructures band on a **mega-course of 10–14 m**, not the building kit's 4 m
floor. A 292 m tower banded on 4 m floors emits 70 courses, reads as corduroy
from the RTS camera, and costs three times the triangles. Tall shafts also get
**belt cornices every ~60 m**: without them a 250 m tower has detail only at head
and foot and reads as a short tower seen close up.

## Blender command line

```bash
blender --background --factory-startup --python tools/blender/build-mf-superstructure-kit.py
```

With a JSON override file:

```bash
blender --background --python tools/blender/build-mf-superstructure-kit.py -- C:\path\super-config.json
```

Keys: `blend_path`, `export_dir`, `evidence_dir`, `report_path`, `styles`,
`save_blend`, `export_glb`, `render_evidence`, `render_block_proof`,
`render_resolution`, `evidence_views`.

## Evidence

Four views per module, one overview per style, and four **tiling proofs**:
`rampart_run` (brutalist, 6 cells), `breached_wall` (ruined), `skyline`
(brutalist, the four towers together) and `offshore` (colonial platforms over
water).

The evidence rig carries **two ground planes and a water sheet**, toggled per
shot: land at z=0 for dry modules, seabed at −26 plus a translucent sheet at
`WATER_Z` for ocean ones. Without that swap the caissons photograph as legs on a
table and the whole point of the archetype is lost.

## Status

Exported GLBs are **source candidates**. This generator adds nothing to
`boot.js` or `assets/data/manifest.json`; runtime integration and phone-first
evidence remain a separate gate.
