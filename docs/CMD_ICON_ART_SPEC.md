# MASSFRONT — Command Icon Sheet: art brief

**Deliverable:** one PNG, `cmdicons.png`, dropped at
`assets/textures/ui/cmdicons.png`. The engine already reads it. Until it exists,
the HUD keeps its current emoji — nothing breaks, nothing is blank.

**What these are:** the COMMON / NEUTRAL row of the icon library — the buttons a
player presses (move, attack, hold, patrol…) and the readouts they glance at
(mass, energy, population). These are **not** the tactical map icons; those live
in `tacticons.png` and are a separate sheet with a separate brief
(`docs/TACTICON_ART_SPEC.md`).

**Critical difference from the tactical sheet:** these render at **40–60 CSS
pixels** in the HUD, not 26. That is roughly double the size, so real
illustrative detail *does* survive here — a recognisable tank, wrench or shield
reads fine. This is where the concept sheet's drawing quality belongs.

---

## 1. Sheet format (must match exactly)

| | |
|---|---|
| File | `cmdicons.png`, **PNG-32 with alpha** |
| Canvas | **1024 × 1024** |
| Grid | **8 columns × 8 rows of 128 × 128 cells** |
| Cell order | left→right, then top→bottom (cell 0 = top-left) |
| Used cells | **32** (cells 0–31). Cells 32–63 must be left fully transparent. |
| Safe area | keep art inside the central **112 × 112** of each cell |
| Background | **fully transparent**. No tile frames, no borders, no labels. |

⚠️ **Do not include the tile frames or the caption text** from the concept
sheet. The HUD draws its own button chrome; the sheet supplies the glyph only.

## 2. Colour

**Pure white (`#FFFFFF`) on transparency. Nothing else.**

No colour, no gradients, no glows, no drop shadows, no rim. The HUD tints and
lights these itself, and a baked-in colour fights that. Anti-aliased edges are
fine and expected — use the alpha channel, not grey pixels.

## 3. Style

Match the concept sheet's common row: clean, solid, confident silhouettes with
enough internal detail to be recognisable at ~48 px. Heavier and more
mechanical than a generic UI icon set, but still instantly readable.

- Minimum stroke ~6 px at 128 px cell size.
- Prefer a solid filled form over a thin outline.
- Optically balance each glyph in its cell — match apparent weight, not bounding box.

---

## 4. Cell list — 32 icons in this exact order

| Cell | Name | Meaning | Currently wired to |
|---|---|---|---|
| 0 | `move` | move order | — |
| 1 | `attack` | attack-move | **A-MOVE button** |
| 2 | `hold` | hold position | **HOLD button** |
| 3 | `stop` | stop / cancel orders | **CLEAR button** |
| 4 | `patrol` | patrol between points | **PATROL button** |
| 5 | `guard` | guard a unit or area | — |
| 6 | `rally` | rally point | — |
| 7 | `group` | unit group / formation | **SPREAD button** |
| 8 | `selectall` | select all | — |
| 9 | `unload` | unload transport | — |
| 10 | `load` | load transport | — |
| 11 | `land` | land aircraft | — |
| 12 | `repair` | repair | **Repair ability** |
| 13 | `resupply` | resupply | — |
| 14 | `retreat` | retreat | — |
| 15 | `delete` | delete / scuttle | — |
| 16 | `zoomin` | zoom in | **NEAR button** |
| 17 | `zoomout` | zoom out | **FAR button** |
| 18 | `minimap` | minimap toggle | — |
| 19 | `ping` | map ping | — |
| 20 | `waypoint` | waypoint | — |
| 21 | `resource` | mass / resource | — |
| 22 | `energy` | energy | — |
| 23 | `crystals` | crystals | — |
| 24 | `gas` | gas | — |
| 25 | `population` | unit cap / population | — |
| 26 | `time` | match clock | — |
| 27 | `score` | score | — |
| 28 | `victory` | victory | — |
| 29 | `defeat` | defeat | — |
| 30 | `pause` | pause | — |
| 31 | `options` | settings | — |

Eight are wired today; the rest are reserved so the sheet does not need
re-cutting when the remaining HUD surfaces adopt it. **Ship all 32** — an unused
cell costs nothing, a missing one forces a re-export.

---

## 5. Acceptance

1. Exactly **1024 × 1024**, PNG-32, transparent background.
2. Cells 0–31 filled in the order above; 32–63 empty.
3. **Pure white glyphs only** — no colour, no frames, no text.
4. Art within the central 112 px of each cell.
5. Downscale to **48 px** per cell and check every glyph is still recognisable.
6. Check again at 40 px — that is the smallest the HUD uses on a phone.

## 6. Delivery

Save to `assets/textures/ui/cmdicons.png`. That is the whole integration: the
loader picks it up, `<html>` gains `.cmdIcons`, and every tagged control swaps
its emoji for the sprite. If the file is absent or fails to decode, the emoji
simply stay — so this can be delivered incrementally and tested at any point.
