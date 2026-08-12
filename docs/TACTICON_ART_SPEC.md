# MASSFRONT — Tactical Icon Sheet: art brief

**Deliverable:** one PNG, `tacticons.png`, dropped at
`assets/textures/ui/tacticons.png`. Nothing else. The engine already reads it;
until it exists, procedural placeholders render in its place.

**What these are:** when the player zooms out to command view, units and
structures stop drawing as 3D models and become flat tactical symbols — the
Supreme Commander 2 / C&C3 "strategic view". At that zoom a unit is **~26 screen
pixels**. Everything below is in service of reading clearly at 26 px.

---

## 1. Sheet format (must match exactly)

| | |
|---|---|
| File | `tacticons.png`, **PNG-32 with alpha** |
| Canvas | **1024 × 1024** |
| Grid | **8 columns × 8 rows of 128 × 128 cells** |
| Cell order | left→right, then top→bottom (cell 0 = top-left) |
| Used cells | **37** (cells 0–36). Cells 37–63 must be left fully transparent. |
| Safe area | keep art inside the central **118 × 118** of each cell — the engine insets 5 px per side to prevent bleed |
| Background | **fully transparent** everywhere. No cell backgrounds, no padding colour. |

## 2. Colour rules — this is the part that is easy to get wrong

**The engine tints every icon at runtime.** Each faction's livery colour is
applied by multiplying your artwork. So:

### Plates (cells 0–16) — draw in **WHITE + near-black**
- Fill the shape **pure white** (`#FFFFFF`).
- Draw its outline/rim in **near-black** (`#0A0E14`, ~92% alpha).
- Nothing else. No colour, no gradients, no glows.
- *Why:* white × faction colour = the faction's colour; near-black × anything
  stays near-black, so your rim survives as a legible border. One shape gives a
  coloured icon **and** its outline.

### Glyphs (cells 17–36) — draw in **WHITE ONLY**
- Pure white (`#FFFFFF`) on transparent. No rim, no colour.
- *Why:* the engine picks dark or light ink per faction automatically for contrast.

### Do not include
Drop shadows · outer glows · gradients · bevels · colour of any kind (other than
the plate rim) · text · any background.

## 3. Style

**Brutish military sci-fi, flat, high contrast.** Reference: Supreme Commander 2
strategic icons, C&C3 Tiberium Wars sidebar, NATO map symbology — but heavier and
more aggressive than NATO.

- **Bold.** Minimum stroke ~7 px at 128 px cell size. Thin lines disappear at 26 px.
- **Flat.** Silhouette only. These are read, not admired.
- **Simple.** If it needs more than ~6 shapes, simplify it.
- **Squint test:** shrink to 26 px. If two icons are confusable, redraw.

---

## 4. Cells 0–16 — FACTION PLATES

The plate is the **frame** that carries allegiance; the glyph sits on top of it.
Each faction plate must be a **reduction of that faction's crest** (crests
supplied separately), so the tactical layer and the brand are one design scheme.

The four gestures are deliberately **opposed** so they separate at a glance
before colour registers — please preserve that opposition:

| Faction | Crest gesture | Plate must read as |
|---|---|---|
| **Nova** (blue) | winged chevron, spear point, 4-point star core | swept wings rising, spear point **up**, tapering keel below |
| **Legion** (red) | downward barbed spearhead | flat broad crown, side barbs, mass driven to a point **down** |
| **Syndicate** (green) | nested triangles | stable **triangle**, apex up, flat base |
| **Horde** (purple) | radial clawed star with core | curved **claws radiating** off an organic core |

Each faction needs **4 domain variants** of its plate. Keep the faction gesture
dominant — the domain is a modifier, not a redesign:

- `gnd` — the base plate.
- `air` — same plate, stretched/pulled **upward**, more acute.
- `nav` — same plate, flattened, weight **downward** (a keel).
- `str` (structure) — same plate, **squarer and wider**, sitting solid.

Every plate must leave a clear interior region roughly **60% of the cell**, centred,
for the glyph to sit in without clashing with the rim.

| Cell | Name |
|---|---|
| 0 | `pl_nova_gnd` |
| 1 | `pl_nova_air` |
| 2 | `pl_nova_nav` |
| 3 | `pl_nova_str` |
| 4 | `pl_legion_gnd` |
| 5 | `pl_legion_air` |
| 6 | `pl_legion_nav` |
| 7 | `pl_legion_str` |
| 8 | `pl_syndicate_gnd` |
| 9 | `pl_syndicate_air` |
| 10 | `pl_syndicate_nav` |
| 11 | `pl_syndicate_str` |
| 12 | `pl_horde_gnd` |
| 13 | `pl_horde_air` |
| 14 | `pl_horde_nav` |
| 15 | `pl_horde_str` |
| 16 | `pl_neutral` — unaligned/wildlife. **No faction language**: a plain rounded rectangle. It must look deliberately generic. |

## 5. Cell 17 — SELECTION RING

| Cell | Name | Notes |
|---|---|---|
| 17 | `pl_ring` | **Outline only, white, transparent centre.** Drawn over a plate at ~126% scale for selected/hero units. Must not fill. |

## 6. Cells 18–28 — UNIT ROLE GLYPHS

White on transparent. These are shared across all factions.

| Cell | Name | Role | Suggested symbol |
|---|---|---|---|
| 18 | `u_inf` | Infantry | stylised trooper, or two stacked chevrons |
| 19 | `u_veh` | Armour / vehicle | tank hull silhouette with road wheels |
| 20 | `u_at` | Anti-tank | armour-piercing dart / upward spike |
| 21 | `u_aoe` | Crowd control | radiating burst from a core |
| 22 | `u_art` | Artillery | high-arc trajectory with a shell |
| 23 | `u_aa` | Anti-air | two stacked upward chevrons |
| 24 | `u_air` | Aircraft | delta wing planform |
| 25 | `u_nav` | Naval | hull + mast, waterline |
| 26 | `u_sup` | Support | bold cross / wrench |
| 27 | `u_exp` | Experimental | radiation trefoil, heavy |
| 28 | `u_hero` | Hero / commander | five-point star |

## 7. Cells 29–36 — STRUCTURE ROLE GLYPHS

| Cell | Name | Role | Suggested symbol |
|---|---|---|---|
| 29 | `b_eco` | Economy / extractor | diamond (mass crystal) |
| 30 | `b_prod` | Production / factory | factory roofline + stack |
| 31 | `b_nav` | Naval yard | anchor |
| 32 | `b_def` | Defence | shield |
| 33 | `b_tech` | Tech / research | atom with orbits |
| 34 | `b_wall` | Fortification | brick courses |
| 35 | `b_sup` | Support / radar | dish on a mast |
| 36 | `b_sup2` | Superweapon | eight-point starburst |

---

## 8. Acceptance

Before delivering, verify:

1. Exactly **1024 × 1024**, PNG-32, transparent background.
2. All 37 cells filled in the exact order above; cells 37–63 empty.
3. Plates are white with a near-black rim. Glyphs are pure white. **No other colour.**
4. Art stays within the central 118 px of each cell.
5. **Downscale the whole sheet to 26 px per cell and look at it.** Every plate must
   still be identifiable by faction; every glyph still separable by role.
6. Nova/Legion/Syndicate/Horde plates remain distinguishable **in greyscale**
   (they will often be seen at small size and similar value).

## 9. Delivery

Save to `assets/textures/ui/tacticons.png`. That is the whole integration —
the engine loads it automatically, replaces the placeholders, and needs no code
change. If the file is missing or fails to decode, placeholders simply remain.

> **Note on the current placeholders:** the shapes rendering in-game today are
> procedurally generated stand-ins built to this same spec and cell order. They
> are functional, not final — treat them as a layout reference, not an art target.
