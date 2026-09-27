# MAP DESIGN TARGETS — target vs. measured
**Date:** 2026-08-18 · **Engine revision measured:** `1.33.42` (`fc0b5d1`, branch `cursor/strip-mass-node-bloom`)
**Status:** measurement + documentation only. **No engine code was changed by this pass.**

This document encodes the engine-relevant parts of the external map-design library
as a reference, then reports what the MASSFRONT generator *actually* produces for
every one of the 48 authored homeworld sites. Every "actual" number below was
produced by generating the map in the real engine on a real GPU and counting —
not by reading source and reasoning about it.

---

## 1. How the numbers were produced (reproduce before trusting)

A Playwright harness served this worktree root over HTTP, booted `index.html` in
Chrome with hardware ANGLE/D3D11 (`ANGLE (AMD, AMD Radeon(TM) 610M, Direct3D11)` —
software rasterisers were rejected), and then for each map ran the **exact** rebuild
path the game and TerraLab use:

```js
curMap = id;  curTheme = MAPDEFS[id].theme;  battlefieldPreset = MAPDEFS[id].size;
setupDeposits();                       // node layout follows the map seed
terrainTex = buildTerrain(curTheme);   // heightF, PASS, WATER_AUTH, NAVW, planDistricts, grading
```

and then counted engine state directly: `WATER_AUTH`, `PASS`, `NAVW`/`NAVCOMP`,
`deposits[]`, `geysers[]`, `cityZones[]`, `cityPlan[]`, `SITE_REJ`.

Two full sweeps were run — a 2-seat duel (player SW, one AI NE) and a 4-seat game
(SW/NE/NW/SE) — because seat count feeds both the node target formula and the
`farFromStartZones` rejection used by settlement placement.

**Sanity anchor:** the harness reports `aelos_north_medium` whole-map water
coverage as **9.079 %**, matching the 9.08 % figure this task was briefed with.
That confirms the reference measurement's denominator is the whole 2048×2048
`WATER_AUTH` field over the full 3.2 km terrain allocation, not the playable arena.

---

## 2. Engine facts any map target has to be written against

These are the fixed constraints. A target that ignores them cannot be implemented
without changing engine code.

| Fact | Value | Where |
|---|---|---|
| Terrain allocation | `MAP = 3200` world units (1 wu ≈ 1 m) — **one fixed square for every size** | `src/engine/gl.js` |
| Heightfield resolution | `TS = 2048` → 1.5625 wu/texel | `src/engine/gl.js` |
| Pathing grid | `PGS = 384` → 8.33 wu/cell | `src/engine/gl.js` |
| Sea level / beach | `WATER_H = 0.335`, `BEACH_H = 0.375` | `src/engine/gl.js:3198` |
| Height scale | `HSCALE = 118` m per unit height | `src/engine/terrain.js:32` |
| Crest ceiling | `terragen` `ceiling: 0.93` | `src/engine/terragen.js:69` |
| Authored hydrology | frozen at gen into `WATER_AUTH`; combat craters never add water | `snapshotAuthoredWater()` |
| Size ≠ terrain size | `size` selects a **playable theatre inside** the fixed square | `BATTLEFIELD_PRESETS`, `src/main.js:82` |

### 2.1 The three theatres (there is no "massive")

`BATTLEFIELD_PRESETS` (`src/main.js:82`) defines exactly three:

| Preset | `world` | Nominal | Measured playable area (superellipse) | Spawn separation | `nodes` | `geysers` |
|---|---:|---|---:|---:|---:|---:|
| `compact` | 0.6875 | 2.2 km | 3.86 – 4.29 km² | 2085 wu | 16 | 1 |
| `standard` | 0.8125 | 2.6 km | 5.39 – 6.00 km² | 2491 wu | 20 | 2 |
| `large` | 1.0 | 3.2 km | 8.16 – 9.09 km² | 2896 wu | 24 | 3 |

The playable edge is not a square: `battlefieldShapeRadius()` cuts a per-theme
superellipse with authored inlets, which trims 11–20 % off the nominal square.
**Measured, not assumed** — the theatre areas above are integrated `battlefieldContains()`
samples, not `world²·MAP²`.

There is **no `massive` size**, so the library's fourth band (water 20–50 %,
28–50+ clusters, 8–14 lanes, 12–24 POIs) has no engine target to compare against.
Adding one is not a data change: `MAP` is baked into terrain, pathfinding, fog and
the shaders, and the comment at `src/main.js:79` says resizing that buffer would
desynchronise all four. A "massive" theatre would have to be `world: 1.0` with a
different *content density*, not a bigger world.

### 2.2 Passability is water-only — there are no terrain-gated lanes

This is the single most important fact for the "primary land lanes" target.
Every write to `PASS` in the codebase is the same test:

```js
PASS[y*PGS+x] = heightF[hy*TS+hx] >= WATER_H - 0.004 ? 1 : 0;
```

(`gl.js:3381`, `gl.js:4459`, `gl.js:4922`, `sim.js:3284`), plus `waterFloodCommit()`
in `terrain.js:656` which clears a cell when a crater floods. A grep for
`maxSlope` / `slopeBlock` / `SLOPE` across `src/game/` and `src/engine/gl.js`
returns nothing. **Cliffs, ravines and crater walls do not block ground movement.**
Consequently a "lane" in MASSFRONT can only be created by water, and every dry map
is one undifferentiated open field regardless of how much relief it has.

### 2.3 Relief authoring is saturated

`MAPDEFS.relief` spans 0.86 → 1.54 (a 1.8× authored spread), but measured land
height range is **70.1–70.2 m on 42 of 48 maps** — exactly
`(0.93 − 0.335) × 118 = 70.21 m`, i.e. pinned between the terragen crest ceiling
and sea level. The only maps below the cap are wet ones whose sampled land floor
sits above `WATER_H` (59.6 – 69.2 m). The `relief` field currently changes noise
*texture*, not the height range the player traverses.

### 2.4 What a "resource cluster" and a "POI" map to

| Library concept | Engine object | Notes |
|---|---|---|
| resource cluster | `deposits[]` + `geysers[]` | The engine places **individual nodes**, not clusters. There is no clustering step; `addNode` enforces a *minimum* separation (88–190 wu × `spread`), which actively prevents clumping. |
| POI / landmark | `cityZones[]` | Written by `planDistricts()` — template stamps (`tpl:1`, from `assets/data/sitetemplates.js`) and procedural districts (`makeDistrict`). |
| named POI | `MAPDEFS[id].poi` | A display string only (e.g. `'Prefecture Plaza'`). Exactly one per site, 48 total. It is **not** placed as an object. |
| primary land lane | contiguous walkable run on a cut across the spawn axis | Derived, not stored. See §2.2. |

Clusters are reported below at three single-linkage link distances (200 / 260 / 320 wu)
so the library's count can be compared against whichever definition it intends.

The site-template library is **8 templates across 5 classes**, several gated by climate:

| class | template | climate gate |
|---|---|---|
| outpost | RIDGE GATE OUTPOST | any |
| outpost | SUPPLY YARD | civic |
| relic | GAUSS SHRINE | none |
| relic | BROKEN SPAN | none |
| city | WALLED TOWN | dusk |
| city | BRUTALIST PREFECTURE | civic |
| spaceport | ORBITAL APRON | dusk |
| dome | PRESSURE DOME COURT | dusk |

`BIOME_KITS` (`gl.js:1829`) assigns one climate per region: `civic` (aelos_north/basin/coast),
`alpine` (aelos_ridge), `dusk` (all four pyraeth), `ice` (all four nordhall), `hive`
(all four vespera). `siteTemplateFor()` maps `ice → alpine` and `hive → dusk`, so
`alpine` regions can only ever draw RIDGE GATE OUTPOST for the outpost class.

---

## 3. Target vs. actual

Library bands mapped onto the three MASSFRONT sizes: small→`compact`,
medium→`standard`, large→`large`. The `massive` band has no counterpart.

### 3.1 Water coverage — **the largest gap in the generator**

| Size | Target | Measured whole-map (min / median / max) | Measured in-theatre (min / median / max) | In band |
|---|---|---|---|---|
| compact | 10 – 25 % | 0.17 / **1.22** / 29.53 % | 0.07 / 0.78 / 38.68 % | **1 / 16** |
| standard | 15 – 35 % | 0.05 / **0.73** / 20.98 % | 0.01 / 0.46 / 18.61 % | **2 / 16** |
| large | 20 – 40 % | 0.06 / **0.58** / 18.73 % | 0.07 / 0.55 / 16.49 % | **0 / 16** |

Across all 48 maps: median **1.04 %**, mean 4.54 %. **23 of 48 maps are under 1 % water.**
Only **9 of 48** reach 10 %. Not one map reaches the 20 % floor of the large band.

The cause is structural, not tuning. `mapWaterCarve()` (`gl.js` ~2438) only runs when
`def.waterMode !== 'none'`, and `waterMode` is set from a hand-written `wet{}` allow-list
of 12 map IDs in the `MAPDEFS` IIFE. So:

* **36 of 48 maps carve no water at all.** Their measured 0.05–4.03 % (median 0.44 %)
  is incidental low-noise ponding, not authored hydrology. (2-seat figures; the 4-seat
  sweep reads 0.45 % — extra deposits raise land under more of the map.)
* **12 maps are wet**, median 15.23 % — rivers median 8.29 %, oceans median 17.08 %.
  Only these are anywhere near the library bands, and only the ocean maps land inside one.
* Water presence does **not** scale with size, which is the library's core premise.
  Wet maps by size: compact 2, standard 6, large 4. `aelos_north_large` is dry (1.33 %)
  while its own region's `_medium` is a river map (9.08 %).

The measured 9.08 % on `aelos_north_medium` is therefore not an outlier low — it is
**one of the nine wettest maps in the game**, and it is still below the small-region floor.

**Navigability caveat:** even on wet maps the fleet-usable water is much smaller than
coverage suggests. On `aelos_north_medium`, 4.02 % of theatre cells are water but only
**1.80 %** belong to `NAV_MAIN`, the single largest navigable component
(1395 cells out of ~77.6k theatre cells on the `standard` grid). `battlefieldNavalEnabled()` needs ≥ 360 cells in that
component; all 12 wet maps pass, but only just, on the rivers.

### 3.2 Resource clusters

Node counts are **fully determined by preset and seat count** — the map seed changes
positions, never quantity. From `setupDeposits()` (`sim.js:1930`):

```
depositTarget = max(starts*3 + 4, presets.nodes + max(0, starts-2)*3)
geyserTarget  = starts + presets.geysers
```

| Size | 2-seat deposits / geysers | 4-seat deposits / geysers | Variance across the 16 maps |
|---|---|---|---|
| compact | 16 / 3 | 22 / 5 | **zero** |
| standard | 20 / 4 | 26 / 6 | **zero** |
| large | 24 / 5 | 30 / 7 | **zero** |

Against the library's cluster bands (6-10 / 10-16 / 16-28):

| Size | Target clusters | Raw nodes (2-seat) | Clusters @200 wu | Clusters @320 wu | In band |
|---|---|---:|---|---|---|
| compact | 6 – 10 | 19 | 10 – 13 (med 12) | 6 – 10 (med 8) | @200: 2/16 · @320: **16/16** · raw nodes: 0/16 |
| standard | 10 – 16 | 24 | 13 – 17 (med 16) | 7 – 13 (med 11) | @200: **10/16** · @320: 14/16 · raw nodes: 0/16 |
| large | 16 – 28 | 29 | 19 – 23 (med 22) | 10 – 17 (med 15.5) | @200: **16/16** · @320: 8/16 · raw nodes: 0/16 |

Read the table this way: **if a "cluster" means a group, MASSFRONT is broadly on
target; if it means a single harvestable site, MASSFRONT has roughly 2–3× the
library count.** No single link distance satisfies all three bands simultaneously —
@320 fits compact, @200 fits large — which is the real finding: the engine's node
spacing does not scale the way the library's cluster spacing does.

Measured nearest-neighbour spacing (median of per-node NN distance), 2-seat:
compact 169 wu, standard 225 wu, large 255 wu; minimum NN 95 / 115 / 127 wu. Nodes
are *evenly spread*, never clumped — `addNode`'s `minD` floor (88–145 wu × `spread`)
makes a genuine cluster impossible by construction. Adding seats compresses this:
4-seat median NN drops to 137 / 165 / 204 wu.

Node tiering (2-seat, `standard`): 6 starter (Tier II), 2 rich (Tier III), the rest
Tier I or the `patterned` Tier II from `makeDeposit`'s `(⌊x/97⌋+⌊y/113⌋)&3` rule.

### 3.3 Primary land lanes — **structurally absent**

Measured by cutting perpendicular to the spawn axis at five points (t = 0.25 … 0.75)
and counting contiguous walkable runs ≥ 150 wu inside the theatre.

| Size | Target lanes | Lanes at the mid cut | Lanes at the *best* of five cuts | In band (mid) | In band (best) |
|---|---|---|---|---|---|
| compact | 2 – 3 | 1 on 14/16 maps | 1–3 | **2 / 16** | 13 / 16 |
| standard | 3 – 5 | 1 on 15/16 maps | 1–5 | **1 / 16** | 9 / 16 |
| large | 5 – 8 | 1 on 15/16 maps | 1–5 | **0 / 16** | **1 / 16** |

**44 of 48 maps present exactly one lane at the midpoint** — a single open field
2.50–3.88 km wide on 43 of them. (The 44th, `nordhall_isles_small`, is the opposite
problem: at 38.7 % theatre water its mid cut is `56 / 712 / 24` wu, so only one run
clears the 150 wu bar and the map reads as a single 712 wu island crossing.)
Only four maps do better, and only two of
them for an authored reason: `nordhall_isles_medium` (runs 776 / 712 / 944 wu) and
`nordhall_isles_large` (1088 / 712 / 664 wu) are genuine archipelagos. The other two
are dry maps whose runs are split by incidental noise ponds, not hydrology —
`vespera_dunes_small` (264 / 1920 / 384 wu, 0.60 % theatre water) and
`vespera_spire_small` (2472 / 184 wu, 1.11 %).

The "best cut" column is generous — it takes the most-divided of five cuts and so
counts transient inlets that a player would walk around. Even so, no large map ever
exceeds 5 and only one reaches the 5–8 band.

This follows directly from §2.2: with slope-impassability absent, the only lane-forming
feature is water, and §3.1 shows there is almost none. Roads (`mfRoadNetworkSpec()`,
2 paths: a `freight` diagonal and a 24-wide `artery` through centre) give a +12 %
movement bonus (`ROAD_SPD = 1.12`) but do not gate anything.

### 3.4 POIs / settlements — **placement fails far more often than it succeeds**

| Size | Target POIs | MAPDEFS *asks for* (med, range) | Actually placed, 2-seat (med, range) | Actually placed, 4-seat | In band (placed) | In band (authored intent) |
|---|---|---|---|---|---|---|
| compact | 2 – 4 | 3.5 (0 – 6) | **1** (0 – 2) | 0 (0 – 1) | 3 / 16 | 10 / 16 |
| standard | 4 – 7 | 5 (1 – 8) | **2** (0 – 3) | 1 (0 – 2) | 0 / 16 | 11 / 16 |
| large | 7 – 12 | 6.5 (2 – 9) | **3** (1 – 4) | 2 (0 – 3) | 0 / 16 | 8 / 16 |

Across 48 maps: **229 sites authored, 86 placed (37.5 %) at 2 seats; 54 (23.6 %) at 4 seats.**
**46 of 48 maps place fewer than authored.** 5 maps place zero at 2 seats, 15 at 4 seats.

The authored intent (the `city`/`indus`/`towns`/`outpost`/`relic`/`spaceport`/`domes`
counts in `MAPDEFS`) is *already roughly on target* for compact and standard —
29 of 48 maps are in band as authored. The gap is entirely in placement.

Summed `SITE_REJ` across all 48 maps (2-seat) names the culprit:

| rejection reason | count | meaning |
|---|---:|---|
| `res` | **1257** | inside a resource site's reserved clearance |
| `spawn` | 678 | too close to a start zone (`minSpawnDist` 640–900) |
| `arena` | 389 | template clearance crosses the theatre edge |
| `plots` | 263 | centre was legal but a **required plot** could not be laid |
| `near` | 155 | clashes with an already-placed zone span |
| `water` | 84 | centre not walkable |
| `ok` | 39 | template stamps that succeeded (the other 47 placed zones are procedural districts, which do not increment `ok`) |

A direct admissible-area probe confirms it. Sampling the candidate box
(`rr(MAP*0.18, MAP*0.82)`, 16 wu grid) and scoring each `tryStamp`/`tryPlace` filter:

| map | template | arena % | spawn % | land % | clear-of-resources % | **all filters %** | P(place \| 100 draws) |
|---|---|---:|---:|---:|---:|---:|---:|
| `aelos_north_small` | BRUTALIST PREFECTURE | 61.5 | 63.8 | 99.1 | **15.2** | 6.84 | 99.9 % |
| `aelos_north_small` | WALLED TOWN | 49.3 | 41.5 | 99.1 | **2.9** | **0.01** | **1.2 %** |
| `aelos_north_small` | procedural DERELICT DISTRICT | 51.9 | 59.1 | 99.1 | **1.4** | **0.05** | **5.3 %** |
| `aelos_north_small` | procedural INDUSTRIAL BELT | 51.9 | 59.1 | 99.1 | 2.9 | 0.52 | 40.8 % |
| `aelos_north_medium` | procedural DERELICT DISTRICT | 73.3 | 71.0 | 96.4 | **3.5** | 2.39 | 91.1 % |
| `pyraeth_crater_medium` | procedural DERELICT DISTRICT | 81.7 | 71.0 | 100 | **1.5** | **0.03** | **3.0 %** |
| `nordhall_isles_medium` | procedural DERELICT DISTRICT | 73.3 | 71.0 | 80.3 | 2.3 | 0.41 | 33.6 % |
| `aelos_north_large` | procedural DERELICT DISTRICT | 100 | 81.4 | 99.7 | 7.4 | 7.42 | 100 % |

`clearOfResourceSites` is the binding constraint in every row. It reserves
`r + 118` around every deposit and `r + 96` around every geyser, where `r` is the
caller's own clearance (190–330 wu for templates; 370 for a derelict district, 330 for
an industrial belt) — so a derelict district (`clearOfResourceSites(x, y, 370)`)
needs a spot **≥ 488 wu from every deposit and ≥ 466 wu from every geyser** — on a
compact theatre 2.2 km across carrying 19 economy nodes. `aelos_north_small` asks for
three such districts and has 1.4 % of the candidate box available for the first one.

Two second-order effects worth recording:

* **Adding commanders removes settlements.** 4-seat play adds 6 deposits and 2 geysers
  *and* two more `farFromStartZones` exclusion discs, cutting placed POIs from 86 to 54
  (templates 39→31, procedural districts 47→23) and taking `compact` to a median of **zero**.
* **`WORLDSITES_ENABLED = false`** (`src/engine/worldsites.js:34`, hotfix 1.33.31).
  `worldSitesGenerate()` returns 0 on every map — measured `worldSites.length === 0` on
  all 48. `SITE_ARCH` (town / city / dead / mining / outpost / derelict / alien, r = 130–250)
  and `worldSitePlan()` are complete and unreachable. This is a fully-written second
  settlement layer that contributes nothing today; it is the obvious place to look
  before authoring anything new.

---

## 4. Gap list (ranked by distance from target)

| # | Gap | Target | Measured | Root cause (in code) |
|---|---|---|---|---|
| 1 | **Water coverage is ~10× under target on the median map** | 10–40 % by size | median **1.04 %**; 23/48 under 1 %; 3/48 in band | `waterMode` comes from a 12-entry hand-written `wet{}` allow-list in the `MAPDEFS` IIFE; `mapWaterCarve()` is a no-op for the other 36 maps. |
| 2 | **Land lanes do not exist as a design surface** | 2–8 by size | 1 lane on 44/48 maps; 3/48 in band at the mid cut | `PASS` is a pure `heightF >= WATER_H` test in all four write sites; no slope gate anywhere. Water is the only divider, and per gap 1 there is almost none. |
| 3 | **POI placement succeeds 37.5 % of the time (23.6 % at 4 seats)** | 2–12 by size | 229 authored → 86 placed; 46/48 maps short; 5–15 maps place zero | `clearOfResourceSites` (`r+118` / `r+96`) leaves 1.4–7.4 % admissible area for a district; `tryPlace`/`tryStamp` only get 100 random draws. |
| 4 | **Water does not scale with map size** | monotonically rising band | wet maps by size: 2 / 6 / 4; `aelos_north_large` dry while `_medium` is a river | `waterMode` is authored per map ID, with no size term. |
| 5 | **No `massive` size exists** | 4th band (20–50 % water, 28–50+ clusters, 8–14 lanes, 12–24 POIs) | 3 presets only; `large` already uses the entire 3200 wu allocation | `MAP` is baked into terrain/pathing/fog/shaders (`src/main.js:79`); a 4th tier must be a density change, not a bigger world. |
| 6 | **Resource "clusters" are evenly-spaced singletons** | clustered fields | min NN 95–127 wu, median NN 169–255 wu; no clumping possible | `addNode`'s `minD` floor rejects any node inside 88–190 wu × `spread` of another. Raw node counts are 0/48 in band at every size. |
| 7 | **Authored `relief` (0.86–1.54) produces one height range** | varied | 70.1–70.2 m on 42/48 maps = the terragen ceiling exactly | `terragen` `ceiling: 0.93` minus `WATER_H` 0.335, × `HSCALE` 118. |
| 8 | **A whole settlement layer is switched off** | — | `worldSites.length === 0` on all 48 maps | `WORLDSITES_ENABLED = false`, hotfix 1.33.31. `SITE_ARCH` + `worldSitePlan()` are written and never called. |
| 9 | **Site-template pool is thin and climate-gated** | varied landmarks | 8 templates / 5 classes; `alpine` regions can draw only 1 outpost template | `siteTemplateFor()` climate match; `SITE_TPL` has one `city` template per climate. |

### Cheapest measurable wins, in order

1. **Gap 1** is a data change with no engine risk: `waterMode` is read once per map in
   the `MAPDEFS` IIFE and `mapWaterCarve()` already produces correct shorelines, seabed
   noise, naval masks and land bridges. Widening the allow-list and adding a size term to
   `half`/`bank` moves the median from 1.04 % toward the bands without new code paths.
2. **Gap 3** is a constant: dropping `clearOfResourceSites`' pad from `r+118`/`r+96`, or
   ordering `planDistricts()` before `setupDeposits()` so nodes yield to settlements rather
   than the reverse, is a one-line change with an admissible-area metric already defined
   above to verify it (re-run the probe and watch the "all filters %" column).
3. **Gap 2** cannot be fixed by content. It needs either gap 1 (water as the divider) or a
   slope term in the `PASS` build — the latter touches pathfinding and must not be attempted
   without a separate measured pass.

---

## 5. Appendix A — per-map measurements, 2-seat duel (player SW, AI NE)

`water % (whole 3.2 km)` is the denominator the 9.08 % reference figure uses.
`water % (theatre)` is the same field restricted to the playable superellipse.
`clusters @200` / `@320` are single-linkage groupings of all deposits+geysers.
`lanes` are contiguous walkable runs ≥ 150 wu across the spawn axis.

| map | size | water mode | water % (whole 3.2 km) | water % (theatre) | dep | gey | clusters @200 | clusters @320 | POI asked | POI placed | lanes (mid cut) | lanes (best cut) |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `aelos_north_small` | compact | none | 2.59 | 1.10 | 16 | 3 | 13 | 10 | 6 | 1 | 1 | 2 |
| `aelos_north_medium` | standard | river | 9.08 | 4.38 | 20 | 4 | 14 | 10 | 7 | 3 | 1 | 4 |
| `aelos_north_large` | large | none | 1.33 | 1.39 | 24 | 5 | 22 | 16 | 9 | 4 | 1 | 4 |
| `aelos_basin_small` | compact | none | 4.03 | 1.46 | 16 | 3 | 12 | 8 | 5 | 1 | 1 | 3 |
| `aelos_basin_medium` | standard | river | 12.35 | 5.82 | 20 | 4 | 14 | 12 | 7 | 3 | 1 | 5 |
| `aelos_basin_large` | large | none | 2.48 | 2.45 | 24 | 5 | 22 | 16 | 9 | 3 | 1 | 3 |
| `aelos_coast_small` | compact | ocean | 16.67 | 14.77 | 16 | 3 | 11 | 8 | 4 | 1 | 1 | 3 |
| `aelos_coast_medium` | standard | ocean | 17.00 | 13.56 | 20 | 4 | 13 | 7 | 8 | 2 | 1 | 4 |
| `aelos_coast_large` | large | ocean | 18.73 | 16.49 | 24 | 5 | 19 | 13 | 7 | 3 | 1 | 4 |
| `aelos_ridge_small` | compact | none | 0.43 | 0.16 | 16 | 3 | 12 | 9 | 4 | 1 | 1 | 1 |
| `aelos_ridge_medium` | standard | none | 0.08 | 0.04 | 20 | 4 | 17 | 11 | 5 | 1 | 1 | 1 |
| `aelos_ridge_large` | large | river | 7.49 | 7.28 | 24 | 5 | 23 | 16 | 7 | 3 | 1 | 4 |
| `pyraeth_crater_small` | compact | none | 1.11 | 0.61 | 16 | 3 | 11 | 9 | 5 | 2 | 1 | 2 |
| `pyraeth_crater_medium` | standard | none | 0.49 | 0.16 | 20 | 4 | 16 | 13 | 6 | 3 | 1 | 1 |
| `pyraeth_crater_large` | large | none | 0.08 | 0.07 | 24 | 5 | 23 | 12 | 7 | 3 | 1 | 1 |
| `pyraeth_belt_small` | compact | none | 1.34 | 0.95 | 16 | 3 | 13 | 10 | 4 | 2 | 1 | 3 |
| `pyraeth_belt_medium` | standard | none | 0.27 | 0.20 | 20 | 4 | 17 | 12 | 6 | 2 | 1 | 1 |
| `pyraeth_belt_large` | large | none | 0.38 | 0.36 | 24 | 5 | 22 | 16 | 7 | 3 | 1 | 2 |
| `pyraeth_caldera_small` | compact | none | 0.17 | 0.07 | 16 | 3 | 12 | 8 | 4 | 1 | 1 | 2 |
| `pyraeth_caldera_medium` | standard | none | 0.32 | 0.21 | 20 | 4 | 17 | 11 | 7 | 1 | 1 | 2 |
| `pyraeth_caldera_large` | large | none | 0.06 | 0.07 | 24 | 5 | 22 | 16 | 8 | 3 | 1 | 1 |
| `pyraeth_flats_small` | compact | none | 3.05 | 1.33 | 16 | 3 | 11 | 8 | 3 | 1 | 1 | 1 |
| `pyraeth_flats_medium` | standard | none | 2.31 | 1.58 | 20 | 4 | 17 | 10 | 7 | 2 | 1 | 3 |
| `pyraeth_flats_large` | large | none | 2.15 | 1.48 | 24 | 5 | 21 | 15 | 7 | 2 | 1 | 3 |
| `nordhall_isles_small` | compact | ocean | 29.53 | 38.68 | 16 | 3 | 12 | 7 | 3 | 0 | 1 | 3 |
| `nordhall_isles_medium` | standard | ocean | 20.98 | 18.61 | 20 | 4 | 16 | 11 | 4 | 2 | 3 | 5 |
| `nordhall_isles_large` | large | ocean | 17.15 | 16.13 | 24 | 5 | 23 | 14 | 6 | 4 | 3 | 4 |
| `nordhall_cliff_small` | compact | none | 1.06 | 0.41 | 16 | 3 | 10 | 8 | 3 | 1 | 1 | 2 |
| `nordhall_cliff_medium` | standard | ocean | 13.80 | 9.95 | 20 | 4 | 14 | 9 | 5 | 2 | 1 | 4 |
| `nordhall_cliff_large` | large | none | 0.10 | 0.10 | 24 | 5 | 22 | 15 | 6 | 4 | 1 | 1 |
| `nordhall_frost_small` | compact | none | 0.45 | 0.29 | 16 | 3 | 11 | 6 | 4 | 2 | 1 | 2 |
| `nordhall_frost_medium` | standard | river | 7.24 | 3.79 | 20 | 4 | 15 | 11 | 5 | 1 | 1 | 3 |
| `nordhall_frost_large` | large | none | 0.18 | 0.17 | 24 | 5 | 22 | 17 | 6 | 3 | 1 | 1 |
| `nordhall_peaks_small` | compact | none | 0.19 | 0.14 | 16 | 3 | 10 | 8 | 3 | 1 | 1 | 2 |
| `nordhall_peaks_medium` | standard | none | 0.05 | 0.01 | 20 | 4 | 16 | 10 | 5 | 2 | 1 | 1 |
| `nordhall_peaks_large` | large | ocean | 13.72 | 13.35 | 24 | 5 | 20 | 13 | 6 | 3 | 1 | 5 |
| `vespera_spire_small` | compact | none | 2.30 | 1.11 | 16 | 3 | 12 | 10 | 1 | 1 | 2 | 2 |
| `vespera_spire_medium` | standard | none | 0.71 | 0.50 | 20 | 4 | 14 | 12 | 2 | 1 | 1 | 2 |
| `vespera_spire_large` | large | none | 0.42 | 0.42 | 24 | 5 | 22 | 16 | 3 | 2 | 1 | 2 |
| `vespera_dunes_small` | compact | none | 1.02 | 0.60 | 16 | 3 | 12 | 7 | 0 | 0 | 3 | 3 |
| `vespera_dunes_medium` | standard | none | 0.29 | 0.38 | 20 | 4 | 16 | 12 | 1 | 0 | 1 | 3 |
| `vespera_dunes_large` | large | none | 0.24 | 0.22 | 24 | 5 | 23 | 16 | 2 | 1 | 1 | 2 |
| `vespera_refinery_small` | compact | none | 2.11 | 1.86 | 16 | 3 | 13 | 8 | 2 | 0 | 1 | 3 |
| `vespera_refinery_medium` | standard | none | 0.75 | 0.42 | 20 | 4 | 17 | 12 | 3 | 1 | 1 | 3 |
| `vespera_refinery_large` | large | none | 0.74 | 0.68 | 24 | 5 | 22 | 10 | 4 | 2 | 1 | 2 |
| `vespera_plateau_small` | compact | none | 0.38 | 0.10 | 16 | 3 | 11 | 9 | 1 | 0 | 1 | 1 |
| `vespera_plateau_medium` | standard | none | 0.14 | 0.04 | 20 | 4 | 17 | 12 | 2 | 1 | 1 | 1 |
| `vespera_plateau_large` | large | none | 0.22 | 0.22 | 24 | 5 | 22 | 15 | 3 | 1 | 1 | 1 |

## 6. Appendix B — per-map economy and POI counts, 4-seat game (SW/NE/NW/SE)

Water, lanes and relief are unchanged by seat count (they are terrain, not economy).
Deposits, geysers and POI placement are not.

| map | size | dep | gey | nodes | clusters @200 | POI placed |
|---|---|---:|---:|---:|---:|---:|
| `aelos_north_small` | compact | 22 | 5 | 27 | 14 | 1 |
| `aelos_north_medium` | standard | 26 | 6 | 32 | 15 | 2 |
| `aelos_north_large` | large | 30 | 7 | 37 | 25 | 2 |
| `aelos_basin_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `aelos_basin_medium` | standard | 26 | 6 | 32 | 17 | 1 |
| `aelos_basin_large` | large | 30 | 7 | 37 | 23 | 2 |
| `aelos_coast_small` | compact | 22 | 5 | 27 | 12 | 1 |
| `aelos_coast_medium` | standard | 26 | 6 | 32 | 14 | 1 |
| `aelos_coast_large` | large | 30 | 7 | 37 | 21 | 3 |
| `aelos_ridge_small` | compact | 22 | 5 | 27 | 12 | 0 |
| `aelos_ridge_medium` | standard | 26 | 6 | 32 | 18 | 0 |
| `aelos_ridge_large` | large | 30 | 7 | 37 | 24 | 2 |
| `pyraeth_crater_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `pyraeth_crater_medium` | standard | 26 | 6 | 32 | 17 | 1 |
| `pyraeth_crater_large` | large | 30 | 7 | 37 | 24 | 2 |
| `pyraeth_belt_small` | compact | 22 | 5 | 27 | 15 | 1 |
| `pyraeth_belt_medium` | standard | 26 | 6 | 32 | 18 | 1 |
| `pyraeth_belt_large` | large | 30 | 7 | 37 | 24 | 2 |
| `pyraeth_caldera_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `pyraeth_caldera_medium` | standard | 26 | 6 | 32 | 18 | 0 |
| `pyraeth_caldera_large` | large | 30 | 7 | 37 | 25 | 2 |
| `pyraeth_flats_small` | compact | 22 | 5 | 27 | 13 | 1 |
| `pyraeth_flats_medium` | standard | 26 | 6 | 32 | 17 | 1 |
| `pyraeth_flats_large` | large | 30 | 7 | 37 | 24 | 2 |
| `nordhall_isles_small` | compact | 22 | 5 | 27 | 11 | 0 |
| `nordhall_isles_medium` | standard | 26 | 6 | 32 | 16 | 1 |
| `nordhall_isles_large` | large | 30 | 7 | 37 | 23 | 3 |
| `nordhall_cliff_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `nordhall_cliff_medium` | standard | 26 | 6 | 32 | 16 | 2 |
| `nordhall_cliff_large` | large | 30 | 7 | 37 | 25 | 3 |
| `nordhall_frost_small` | compact | 22 | 5 | 27 | 13 | 1 |
| `nordhall_frost_medium` | standard | 26 | 6 | 32 | 17 | 1 |
| `nordhall_frost_large` | large | 30 | 7 | 37 | 24 | 3 |
| `nordhall_peaks_small` | compact | 22 | 5 | 27 | 13 | 1 |
| `nordhall_peaks_medium` | standard | 26 | 6 | 32 | 18 | 1 |
| `nordhall_peaks_large` | large | 30 | 7 | 37 | 23 | 2 |
| `vespera_spire_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `vespera_spire_medium` | standard | 26 | 6 | 32 | 16 | 1 |
| `vespera_spire_large` | large | 30 | 7 | 37 | 23 | 2 |
| `vespera_dunes_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `vespera_dunes_medium` | standard | 26 | 6 | 32 | 16 | 0 |
| `vespera_dunes_large` | large | 30 | 7 | 37 | 25 | 1 |
| `vespera_refinery_small` | compact | 22 | 5 | 27 | 15 | 0 |
| `vespera_refinery_medium` | standard | 26 | 6 | 32 | 18 | 0 |
| `vespera_refinery_large` | large | 30 | 7 | 37 | 24 | 1 |
| `vespera_plateau_small` | compact | 22 | 5 | 27 | 13 | 0 |
| `vespera_plateau_medium` | standard | 26 | 6 | 32 | 17 | 1 |
| `vespera_plateau_large` | large | 30 | 7 | 37 | 24 | 1 |

---

## 7. What this pass did NOT verify

Recorded honestly so nobody builds on an unmeasured claim.

* **The library's own numbers.** The four target bands were supplied to this task as
  text. The external map-design library was not read; its definitions of "cluster",
  "lane" and "POI" are inferred, and §2.4 states the mapping used. If the library
  defines a cluster as a group of 3–5 nodes, §3.2's `@320` column is the right
  comparison; if it defines one as a single harvestable site, the raw-node column is.
* **Whether the measured water bands are *good*.** This is a conformance report against
  a supplied target, not a playtest. No claim is made that 20 % water plays better than 1 %.
* **Lane counts as a player would experience them.** The lane metric is a straight cut
  across the spawn axis. It does not model detours, unit radius, building blockers
  (`blds`, ruins, unclaimed nodes — `sim.js:3784` stamps those into a separate
  build-blocking grid, not `PASS`), or the fact that a 40 wu gap is not a usable lane
  for a formation. Treat the counts as an upper bound on terrain-imposed structure.
* **Runtime effects.** All measurements are of the world at generation time. Crater
  flooding (`waterFloodCommit`) can add water during a match; that was not simulated.
* **4-seat lane/water figures** were measured but are identical to 2-seat by construction
  (terrain does not read seat count); only economy and POI columns differ, and only those
  are reported in Appendix B.
* **Legacy maps** (`vanguard`, `highland`, `isles`, `crater`, `oasis`, `ruins_reach`,
  `frost_reach`, `ash_ridge`) were excluded. They remain in `MAPDEFS` for save
  compatibility but `homeworldMapIds()` does not advertise them and no War Room region
  offers them.
* **Cross-seed variance.** Each map has one authored seed (`base + i*7919`), so each map
  was generated exactly once. The counts above are that seed's result, not a distribution.
  Node *counts* are seed-independent by construction; POI placement is not, and a
  different seed would move the 37.5 % placement rate somewhat.
