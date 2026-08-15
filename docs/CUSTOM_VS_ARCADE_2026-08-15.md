# Custom vs Standard arcade unlock — research (2026-08-15)

Research only. No `src/` changes, no map/MAPDEFS split, no unlock edits, no HF publish.
Sibling owns difficulty / reward numbers. This note owns **access rules** only.

**Rule:** same `PLANETS` / `SYSTEMS` / `MAPDEFS` catalog. Two access policies.

---

## Verdict

There is **no playable Custom war mode today**. The only War Table that can start a battle is Standard, and Standard **is** the conquest arcade. That is the coupling the player is hitting.

A gate bypass already exists (`mfConquestGateActive()` is false for any `activeWarMode` other than `standard`), but every non-standard mode is treated as **browse-only / not playable**. `openPlanetarySetup` then **forces** `activeWarMode='standard'`, so the bypass never runs for a real match.

Custom should be a second playable door into the **same** galaxy → system → planet → region → deploy chrome, with conquest locks off. Do not duplicate maps, sites, or pickers.

---

## 1. Current coupling (file + function)

### Catalog (do not split)

| Layer | Count | Source |
|---|---|---|
| Systems | 4 | `SYSTEMS` in `src/engine/gl.js` — sombrero, andromeda, orion, helios |
| Planets | 4 (one homeworld each) | `PLANETS` in `src/engine/gl.js` — aelos, pyraeth, nordhall, vespera |
| Regions | 16 (4 per planet) | `PLANETS[k].regions` |
| Sites | 48 (3 sizes each) | `MAPDEFS` IDs `{region}_{small\|medium\|large}` |

`Object.keys(PLANETS)` insertion order **is** the arcade sequence: Aelos → Pyraeth → Nordhall → Vespera.

Eight **legacy** `MAPDEFS` (`vanguard`, `highland`, `isles`, `crater`, `oasis`, `ruins_reach`, `frost_reach`, `ash_ridge`) stay loadable for training/saves. They are **not** drop worlds (`isHomeworldMap` is false). Custom should not advertise them either. “Every map” means the **48 homeworld sites**, not a second geometry set.

Helpers: `planetForMap`, `systemForPlanet`, `homeworldMapIds`, `isHomeworldMap`, `theatreMapId`, `getPlanetMaps` — all `src/engine/gl.js`.

### Arcade lock (Standard)

All live in `src/galaxyui.js` unless noted.

| Function | What it gates |
|---|---|
| `mfConquestGateActive()` | `true` iff `activeWarMode` is missing or `'standard'` |
| `mfConquestWon(map)` | `META.mapWins[map] > 0` |
| `mfConquestPlanetOpen(key)` | Planet 0, or any win on that planet, or previous planet **complete** (all 12 sites) |
| `mfConquestRegionOpen(key,id)` | Region 0 of an open planet, or any win in that region, or previous region complete (all 3 sites) |
| `mfConquestMapOpen(map)` | Region must be open. Compact (`mi===0`) open. Medium (`size==='standard'`) open. Large needs a win on the previous site in the region |
| `mfConquestNormalizeSelection()` | Clamps `curMap` / region / planet back onto an open homeworld site. No-op when gate is off |
| `mfConquestNextMap()` | First open unwon site, preferring medium |
| `mfConquestReward(map)` | First-clear cores/XP + unlock copy. Already returns `null` when gate is off |
| `mfConquestLocate` / `*Wins` / `*Complete` / `*Total*` | Progress chrome and Continue |

**Fresh Standard career can pick 2 of 48 sites:** Aelos / Capital Circumference / compact + medium. Large and every later region/planet/system are locked.

### UI that *enforces* those functions

`src/galaxyui.js`

- `mfGalaxySelectSystem` / `mfGalaxySelectWorld` / `mfGalaxySelectRegion` / `mfGalaxyAdvance` — toast + deny
- `mfGalaxyRenderWorldChips` — `.mfWorldChip.locked` + “SYSTEM LOCKED”
- `mfGalaxyRenderPlanet` — `.mfRegionChip.locked` + “REGION LOCKED”
- `mfGalaxyDrawWorld` / `mfGalaxyDrawSystemMark` / `mfGalaxyDrawLockHex` — gold lock hex on gated stars
- `mfGalaxyResumeConquest` / `#mfConquestContinue` — Standard-only “CONTINUE CONQUEST · N / 48”
- `mfGalaxyRenderStage` — `playable = activeWarMode==='standard'`; deploy CTA otherwise “SERVICE IN DEVELOPMENT”
- setupStart capture listeners — same `playable` check

`src/main.js`

- `selectPlanetKey` — planet deny
- `renderPlanetRow` globe tap — region deny
- `syncBattlefieldFromMap` — **refuses to set `curMap` if `!mfConquestMapOpen`**
- `renderMapRow` — `.mapCard.locked` + “SECURE PREVIOUS SITE” + first-clear payout line
- `openPlanetarySetup(mode)` — rejects coop/mmo/campaign, then **`activeWarMode='standard'` always**, then `mfConquestNormalizeSelection`
- `setupStart` — `isHomeworldMap` + `mfConquestMapOpen` deny (“SECURE THE PREVIOUS BATTLEFIELD FIRST”)
- `continueToNextMap` — launches `mfConquestNextMap()`
- `commitSetupFromDom` — Standard remaps an unpicked compact/large card back to medium

`src/departure.js`

- `mfVictoryHasNext` / `mfDepartureTheatreDone` — already no-op when gate is off
- `mfVictoryContinue` → `continueToNextMap`

`src/game/meta.js`

- `WAR_MODES` — training, standard, campaign, mmo, coop. **No custom card**
- `renderWarRoom` — Standard → `openSkirmishSetup()` → `openPlanetarySetup('standard')`
- `metaGrant` — first-clear via `mfConquestReward`; **`META.mapWins` increments when `!gated || open`**
- `MODE_REWARD_CONTRACTS` — standard / campaign / mmo / coop only
- `matchRewardMode()` — falls back to `'standard'` for unknown modes

### What is *not* Custom

| Name | What it actually is |
|---|---|
| `activeWarMode` | Session mode. Default `'standard'`. Training temporarily sets `'training'`. |
| `mfQuickPlan==='custom'` | Deploy preset detector: player edited away from First / Classic / Fortress. Not a war mode. |
| endgame `state='CUSTOM'` | Ops brief label when threat > 1 or modifiers are on. |
| Home **SANDBOX** (`#demoBtn` → `newDemo()`) | Instant `demoMode` match. No War Table, no `metaGrant`, no map picker. HTML still says “Mega”; `mfRenameFrontNav` relabels it. |
| Campaign / MMO / Co-op cards | Visible roadmap. Locked. Opening them toasts; they must not enter the table. |

---

## 2. Recommended split

**Standard = sequential arcade unlock.** Keep the current `mfConquest*` rules, Continue banner, first-clear copy, lock hexes, and “secure previous” denies. `activeWarMode==='standard'`. Gate stays on.

**Custom = full 48-site catalog, no conquest gate.** Same maps. `activeWarMode==='custom'` (new). Because `mfConquestGateActive()` already returns false for that string, planet/region/site open-checks already return true — **if** setup is allowed to keep the mode and treat it as playable.

Do **not**:

- Clone `MAPDEFS` / `PLANETS` / terrain seeds
- Split regions into “arcade copies” vs “custom copies”
- Change Standard unlock order
- Use Sandbox/demo as the Custom door (no picker, no real match economy)

Minimum future wiring (not done here):

1. `WAR_MODES` card `custom` (playable, after Standard).
2. `openPlanetarySetup('custom')` sets `activeWarMode='custom'` instead of forcing standard. Stop treating custom like coop/mmo/campaign.
3. `playable = standard \|\| custom` in `mfGalaxyRenderStage` and the setupStart capture listeners.
4. Allow `mfQuickApplyPlan` / `mfQuickApplyTeam` when mode is custom (they currently deny any non-standard as “mission controlled”).
5. Hide or disable `#mfConquestContinue` and first-clear / FRONT N/48 lock chrome in Custom. Keep SECURED marks as optional flavor if `mapWins` from Standard exist; do not require them.
6. **Do not write `META.mapWins` from a Custom win.** Today `!gated` makes `metaGrant` record every win. That would open later planets in Standard via `mfConquestPlanetHasWin` / region complete. This is the load-bearing leak. Sibling owns whether Custom still pays XP/cores/loot; access research only requires mapWins + `mfConquestReward` stay Standard-only.
7. Keep `isHomeworldMap` — Custom still drops on the 48, not legacy IDs.

`mfConquestNormalizeSelection` already no-ops when the gate is off, so Custom will not snap Vespera back to Aelos.

---

## 3. UI proposal (no implementation)

**Reuse the War Table chrome.** Do not build a second picker.

The five-stage hologram already lists every system, planet, region, and size card. Locks are CSS/canvas overlays on top of that list. Custom is an access-rule swap plus copy, not a new map UI.

| Surface | Standard | Custom |
|---|---|---|
| War Room | STANDARD card → gated table | New CUSTOM card → same table, gate off |
| Title | `STANDARD WAR TABLE` (already `activeWarMode` text) | `CUSTOM WAR TABLE` |
| Continue conquest banner | Keep | Hide / disable |
| Star / chip / map-card locks | Keep | No lock class, no lock hex, no deny toast |
| Region row | Compact / medium / large; medium is the mode-contract default | All three pickable; honor the tapped card (`commitSetupFromDom` medium-force is already Standard-only) |
| Deploy CTA | START BATTLE | START BATTLE (must not say SERVICE IN DEVELOPMENT) |
| First-clear reward line on cards | Keep | Hide |
| First / Classic / Fortress + Advanced | Keep | Keep (editable skirmish is the point) |
| Sandbox home button | Unchanged | Unchanged |

A separate flat 48-card list would re-author the same catalog and drift. That is the UI equivalent of splitting maps. Reject it.

---

## 4. Risks

### Save format (`META.setup`)

`META.setup` stores `{d,t,m,f,pf,pc,bs,pkg,g,tl,rp,cr,ps,ais,df,inf}` — **not** `activeWarMode`. Boot restores the last `m` into `curMap`.

- Standard entry already runs `mfConquestNormalizeSelection`, so a Custom Vespera pick will not stay selected when the player opens Standard.
- Optional later: `META.setup.mode` so Custom remembers its last site without colliding. Not required for a first split if Standard always normalizes.
- Do not persist Custom `m` as a Standard unlock.

### First-clear / arcade progress leaking from Custom

`mfConquestReward` is already gate-safe.

`metaGrant` is **not**: when the gate is off it still increments `META.mapWins`. One Custom win on Pyraeth opens that planet in Standard (`mfConquestPlanetHasWin`). Clearing a region/planet in Custom would unlock the next arcade beat.

`matchRewardMode()` would also classify `'custom'` as `'standard'` (unknown → standard contract) unless a Custom contract is added. Sibling owns the payout table; access work must still stop mapWins and first-clear **unlock text** from Custom.

Weekly already avoids writing mapWins for locked later worlds while the gate is on. Custom must not punch a hole in that.

### Continue-next-map

`mfVictoryHasNext` is already false when the gate is off. Keep it that way. A Custom victory must not chain into `continueToNextMap` / `mfConquestNextMap` (that function still walks the arcade path).

If someone later leaves Custom on `activeWarMode==='standard'` and only hides chips, Continue would still fire and skip the player through locked Standard sites.

### Departure cutscene

`mfDepartureTheatreDone` is already false when the gate is off. Custom must not arm the four-system departure. If Custom were left on Standard mode, winning the 48th site in Custom would play the theatre-complete carrier lift on return to menu.

### Other collisions

- **First Contact / assisted opening** (`assistedOpeningActive`, `startFirstContactGuide`) is Standard-only and keyed off `META.standardMatches`. Custom must not increment `standardMatches` (today only `mode==='standard'` does).
- **Training** snapshots `activeWarMode` and restores it. A Custom → Training → return path must restore `'custom'`, not snap to standard.
- **Homeworld clamp** on setupStart / boot is correct for both modes (48 sites only).
- **Naming:** three existing “custom” strings (`mfQuickPlan`, ops brief state, this proposed war mode). Use `activeWarMode==='custom'` only for the free catalog.

---

## 5. What “every map / planet / region” means

Against the live catalog, Custom selectable means:

- All 4 systems (Sombrero-I, Andromeda-IV, Orion Arc, Helios Core)
- All 4 homeworlds (Aelos, Pyraeth, Nordhall, Vespera)
- All 16 regions
- All 48 sites (compact + medium + large per region)

Not: legacy MAPDEFS, not a duplicated theatre, not moons (systems have one playable homeworld).

Standard stays sequential: site → region → planet → system, using `META.mapWins` as the only unlock ledger (no second save system).

---

## Out of scope (this note)

- Difficulty floors / reward multipliers (sibling)
- Publishing, unlock table edits, map geometry edits
- Implementing the War Room card
