# MASSFRONT meta-UI implementation blueprint

Status: repo audit and staged implementation plan, 2026-08-03. This document
covers Operations, Development, mission debrief, inventory, and the shared
mobile panel architecture. It deliberately does not change combat balance,
mission rewards, or save ownership.

## 1. Design direction

MASSFRONT should borrow interaction principles, not another game's skin.

- **EVE Online:** put the object or decision at the centre, keep requirements,
  outcome, and action in one view, show unavailable states instead of hiding
  them, and remember the player's filters. CCP's Industry UI write-up is
  especially relevant: it prioritises discoverability, pre-visualisation,
  meaningful interactions, clear feedback, and graphical summaries while
  retaining efficient lists for comparison. Its more recent ship-card work
  also makes owned ships visually primary rather than treating them like rows
  of generic inventory.
- **Spore:** make the selected thing tangible. A unit, structure, module, or
  mission should have a visual preview that reacts immediately to category and
  configuration changes. Palette navigation stays simple enough that the
  player can experiment without reading a manual.
- **Command & Conquer / Red Alert:** keep operational essentials persistent and
  group actions by their battlefield purpose. The production sidebar's
  Structures, Infantry, and Vehicles categories are useful because each tab is
  a stable answer to one question, and unavailable categories explain their
  prerequisite rather than silently disappearing.
- **Mobile:** one primary focus and one primary action per screen. A category
  strip is navigation, not a row of actions. Every interactive target is at
  least 48 CSS pixels tall/wide where practical, remains clear of safe areas,
  and provides immediate pressed/audio/haptic feedback.

Reference material:

- [CCP: Industry UI](https://www.eveonline.com/news/view/industry-ui)
- [CCP: The Agency 3.0](https://www.eveonline.com/news/view/eve-online-invasion-the-agency-3.0)
- [CCP: ship cards and 3D presentation](https://www.eveonline.com/news/view/its-all-about-spaceships)
- [EA: Spore Creature Creator](https://www.ea.com/en/games/spore/spore-creature-creator)
- [EA: C&C Remastered in-game sidebar](https://help.ea.com/articles/command-and-conquer/command-and-conquer-remastered/how-to-play/)
- [Apple: tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Google: mobile game touch targets](https://developers.google.com/youtube/gaming/playables/certification/best_practices_design)

## 2. Current repo architecture

### Shared panel/navigation layer

| Concern | Current owner | Current behaviour | Main risk |
|---|---|---|---|
| Top-level screens | `index.html`, `src/main.js` | Static `.overlay` elements; `showScr()` makes one front screen visible; `FRONT_SCREEN_IDS` and Android back handling own the stack | A new overlay must be registered with back/safe-area handling or Android exits instead |
| Category tabs | `mfBindTap()`, `mfSetTabs()`, `mfBindTabs()` in `src/game/meta.js` | One visible `[data-mf-panel]`, remembered selection in `MF_TAB_STATE`, 12px touch slop, keyboard traversal, global ghost-click guard | Hand-written tab systems elsewhere do not automatically inherit these fixes |
| Mobile layout | `src/styles/ui.css` | Safe-area variables, sticky category rows, scrollable body, fixed `.setupFoot` | `.tabBtn` is still 44px while the newer `.screenTabBtn` is 48px; some old screens use inline widths and headings |
| Main menu routing | `src/main.js` boot bindings | Buttons call render function, then `showScr()` | Replacing a render function is safe; replacing routing or screen IDs is high risk |

The correct reusable primitive already exists: `screenTabs` + `mfBindTabs`.
New long-form screens should use it instead of inventing another tab listener.

### Operations

- Markup: `#opsScr` in `index.html`.
- UI renderer and saved progression: `src/endgame.js`.
- Simulation mapping: chosen modifier IDs are resolved through `WILDCARDS` in
  `src/game/meta.js`, while reward multipliers come from `OPMODS`.
- Existing categories: Threat, Modifiers, Weekly, Mastery.
- Saved root keys: `META.threat`, `META.threatSel`, `META.opmods`,
  `META.weekly`, `META.mastery`, and `META.bestScore`.

What already works:

- The four categories are stable, reachable, and remember selection.
- Difficulty selected by the player pays a visible multiplier.
- Locked threat levels remain visible.
- Weekly and mastery are derived from real map/faction data.

What is missing:

- No persistent operation brief summarises the combined threat, modifier count,
  and payout while moving between categories.
- There is no first-class mission definition or mission list. Story/tutorial,
  skirmish setup, weekly contracts, and mastery are separate entry paths.
- `OPMODS` and `WILDCARDS` are parallel definition tables. A missing ID can
  advertise a reward without implementing the rule unless regression-tested.
- A category is still mostly a text/list surface; no map, opposing commander,
  hazard, or faction preview is attached to a selected operation.

### Development and research

- Definitions and rendering: `src/develop.js` (`MATS`, `DEVTREE`, `MODULES`,
  `renderDevelop()`).
- Spatial research takeover: `src/restree3d.js`; it calls the original renderer
  first and replaces only the Research body when the viewport is roomy.
- Existing categories: Research, Crafting, Loadout. Research has Fabrication,
  Doctrine, and Xenology branches.
- Saved root keys are created lazily: `META.materials`, `META.res`, `META.mods`,
  and `META.equipped`.

The taxonomy is already correct. The weakness is presentation consistency:
desktop can receive the 3D tree while compact phones get a flat list, crafting
and loadout have no persistent object preview, and the material header competes
with the first decision on short screens.

### Inventory and Armory

- Persistent definitions and reward grant: `src/game/meta.js`
  (`INV_RARITIES`, `INV_GEAR`, `INV_CONSUMABLES`, `invGrantMatchLoot()`).
- UI takeover: `src/storeui.js`; categories are Operations, Battlefield,
  Commander, Gear, Supplies, and Identity.
- Styling: `src/styles/store.css`.
- Saved shape:

```js
META.inventory = {
  gear: { [definitionId]: count },
  consumables: { [definitionId]: count },
  equipped: { weapon: id, armor: id, utility: id },
  ready: [consumableId, consumableId]
};
```

The five rarity levels and mission loot loop are implemented. The principal UI
issue is six peer tabs mixing three different concepts: permanent upgrades,
inventory, and identity. Gear rows have no visual model/part preview or detail
view, and locked inventory creates a long collection checklist with no filter.

### Mission complete / failure debrief

- Match termination and debrief composition: `endGame()` in `src/main.js`.
- Career ledger and inventory drop: `metaGrant()` in `src/game/meta.js`.
- Materials and module wear: `developRecord()` in `src/develop.js`.
- Threat, score, weekly, and mastery: `endgameRecord()` in `src/endgame.js`.
- Markup: `#gameOver` in `index.html`; presentation: `src/styles/ui.css`.

The current debrief is richer than it first appears: outcome, six performance
figures, operation score, XP/cores/research data, a transparent core ledger,
field recovery, crafted materials, rarity loot, promotions, unlocks, module
breakage, and a chart. Its weakness is structural coupling. `endGame()` builds
the entire view directly from globals after three different subsystems mutate
the save. There is no serialisable `MatchResult` that tests, future campaign
missions, cloud telemetry, or a replay screen can consume.

## 3. Target screen hierarchy

### Operations: now, then later

Stage 1 keeps the current four-tab vocabulary so no saved state or player habit
is invalidated:

```text
OPERATIONS
  persistent deployment brief: Threat / Modifiers / Payout
  THREAT      permanent ladder and enemy scaling
  MODIFIERS   player-chosen rules with individual reward value
  WEEKLY      fixed mission card, opposing faction, map, hazards, best score
  MASTERY     map x faction completion matrix
```

Once authored tutorial/campaign missions exist, evolve the information
architecture without adding more top-level tabs:

```text
OPERATIONS
  MISSIONS    Tutorial / Campaign / Skirmish cards
  CONTRACTS   Weekly contract + chosen modifier package
  THREAT      permanent challenge ladder
  RECORDS     Mastery, personal bests, completed objectives
```

The selected mission card becomes the visual centre: map thumbnail, enemy
commander portrait, faction crest, goal, hazard icons, estimated duration, and
reward range. `START` remains the only primary action.

### Development

Keep the existing top level:

```text
DEVELOPMENT
  RESEARCH   branch chips: Fabrication / Doctrine / Xenology
  CRAFTING   unlocked recipes, missing inputs, output preview
  LOADOUT    Commander/HQ preview, slots, durability, refit
```

On phones, use a compact selected-item preview above the list rather than the
desktop spatial tree. The preview must show the same definition and calculated
state as the list: owned tier, actual effect, prerequisites, material deficit,
and what the next action changes.

### Armory and inventory

Reduce six top-level categories to four and move the first three current tabs
into a secondary filter:

```text
ARMORY
  UPGRADES    Economy / Battlefield / Commander filters
  GEAR        Weapon / Armor / Utility filters
  SUPPLIES    Ready 0/2, owned consumables
  IDENTITY    Commander colours and later cosmetic previews
```

Selecting an item opens one detail card in place, not another full overlay:
large icon or 3D part preview, rarity, purpose, current versus equipped values,
quantity/durability, and one primary action.

### Debrief

Do not make the debrief another tab maze. It is a short, linear conclusion:

```text
OUTCOME + reason
  mission score and 3-4 primary performance figures
  REWARDS     total first, then expandable ledger
  RECOVERY    materials and loot cards
  PROGRESSION rank/threat/research/mastery changes
  primary: CONTINUE    secondary: VIEW LOADOUT / RETRY
```

Failure uses the same hierarchy and still shows recovered value. Never hide a
reward because the player lost; explain why a category paid zero.

## 4. Data contracts

Definitions remain immutable source data. Saved data contains IDs and numbers,
never functions, DOM state, or calculated display strings.

```js
// Authored source data.
MissionDefinition = {
  id, mode, title, summary, mapId, goalId, enemyFactionId,
  difficultyRange, threatRange, modifierIds, hazardIds,
  previewAssetId, commanderId, estimatedMinutes, rewardProfileId,
  prerequisites: [{kind, id, value}]
};

// Saved player choice. It can be validated against definitions after updates.
OperationSelection = {
  schema: 1, missionId, threat, modifierIds, setupOverrides,
  selectedAt
};

// Created once before any progression system mutates META.
MatchResult = {
  schema: 1, matchId, missionId, startedAt, endedAt, win, reason,
  setup: {mapId, goalId, enemyFactionId, difficulty, threat, modifierIds},
  performance: {seconds, kills, losses, built, nests, reclaimed,
                commanderLevel, territory},
  resources: {massRemaining, energyRemaining},
  score
};

RewardLedger = {
  schema: 1,
  totals: {xp, cores, researchData},
  lines: [{category, label, base, multiplier, awarded}],
  materials: {[materialId]: count},
  items: [{definitionId, kind, rarity, count, duplicate}],
  progression: [{kind, id, from, to}],
  wear: [{definitionId, before, after, broke}]
};

InventoryState = {
  schema: 2,
  gear: {[definitionId]: {count, discoveredAt}},
  consumables: {[definitionId]: count},
  equipped: {weapon: id, armor: id, utility: id},
  ready: [id, id],
  newItemIds: []
};
```

The existing inventory count maps remain valid during migration; accessors can
normalise a number into `{count}` only when schema 2 UI is ready. Gear `apply`
closures remain in `INV_GEAR` definitions and are never serialised.

## 5. Save and migration risks

1. `metaLoad()` uses a shallow `Object.assign`. New nested defaults are not
   automatically merged, and `META_DEF.inventory` can be shared by reference
   when an old save has no inventory. Every nested system needs a normalising
   accessor like `invBag()` before it is read or written.
2. Cloud and local restore also merge payloads shallowly. A new nested object
   must be normalised after `applyIncoming()` and file import, not just at boot.
3. Existing operation data lives at META root. Moving it immediately would
   strand old saves. Introduce `opsState()` as a compatibility facade, read the
   legacy fields first, and dual-write until two release cycles have passed.
4. Local `.mfsave` envelope schema 1 protects file structure, not the inner
   career schema. Add `META.schema` and per-subsystem schema numbers before any
   destructive shape change; do not bump the file schema for additive fields.
5. `careerWeight()` currently compares XP, cores, research data, and matches.
   A cloud save with rarer gear or more mastery can be judged "equal" to a less
   complete local save. Conflict UI should compare a visible progress summary,
   not extend one opaque scalar indefinitely.
6. OTA clients can load a newer UI over an older saved career. IDs must remain
   stable, removed definitions need tombstones/fallback names, and a category
   may be empty but must never disappear.
7. Classic scripts share one lexical scope. New top-level names require the
   bundle syntax gate, and a new source file must be registered in both
   `boot.js` and `assets/data/manifest.json`.
8. `src/restree3d.js`, `src/storeui.js`, and other feature modules take over
   render functions. Change their public render contract or DOM anchors only
   with explicit fallbacks.

## 6. Touch, layout, and feedback rules

- Primary navigation and actions: minimum `48px` height and width. Increase
  legacy `.tabBtn` from 44px before relying on it for high-frequency phone use.
- Minimum gap: `6px`; use `8px` around destructive or mutually exclusive
  controls. A visual glyph may be smaller, but its button hit box is not.
- No more than four peer tabs in portrait. Secondary branches use chips or a
  filter row inside the selected category.
- Tabs stay present when content is locked or empty. The panel explains the
  prerequisite and offers the nearest valid next action.
- The scroll body owns vertical movement. Header, category strip, and back/
  primary footer stay outside it and respect `--sat`, `--sab`, `--sal`, `--sar`.
- Use `mfBindTap()` for phone controls and `mfBindTabs()` for category strips.
  Do not mix `pointerdown` and `click` on the same control without the shared
  ghost-click guard.
- Every action produces all applicable feedback within 100ms: pressed state,
  one short UI sound, optional haptic, and changed text/value. Errors name the
  missing requirement.
- Android system Back first closes a detail/modal, then returns to the parent
  screen, and only exits from the root menu. The visible Back button must have
  the same result.
- Validate at `360x800`, `393x852`, and phone landscape. A clean console is not
  visual validation; inspect a PNG from each changed screen.

## 7. Staged implementation and acceptance criteria

### Stage 1 — shared Operations shell

Scope: presentation only. Preserve the four existing categories and all combat
settings. Add a persistent compact deployment brief above category content.

Acceptance:

- Threat, active modifier count, and total payout are visible on every tab.
- Exactly one category panel is visible; selection survives re-render.
- Four category targets are at least 48px and remain reachable at 360px width.
- Back is visible above the device safe area in portrait and landscape.
- Changing threat or a modifier updates the summary immediately.
- Bundle, focused DOM test, and one inspected 393x852 PNG pass.

### Stage 2 — mission directory and authored tutorial entry

Scope: introduce `MissionDefinition` and a mission-card list. Route the existing
first-player tutorial through a visible Tutorial Operation card without changing
its scripted steps.

Acceptance:

- A new account sees Tutorial as the recommended first operation.
- Each card shows map, faction commander, objective, length, locks, and rewards.
- Locked cards remain inspectable and state the prerequisite.
- Selecting a mission only writes validated IDs; old setup choices still load.

### Stage 3 — Development object-first preview

Scope: reuse the same research/crafting definitions, add a compact selected-item
preview on phones, and unify input/output/missing-state presentation.

Acceptance:

- Research, Crafting, and Loadout share one preview contract.
- A player can understand purpose, actual current effect, next effect, cost, and
  missing prerequisite without opening another screen.
- The desktop 3D tree remains optional; compact fallback has feature parity.

### Stage 4 — inventory detail and filters

Scope: consolidate Armory navigation, add selected-item details, discovery/new
markers, and definition-backed filters.

Acceptance:

- No more than four top-level categories.
- Gear and supplies can be filtered by slot/rarity/owned without losing tab state.
- Equip/ready actions update the preview, counts, save, sound, and haptic once.
- Old numeric inventory maps migrate without loss; unknown IDs remain recoverable.

### Stage 5 — serialisable debrief pipeline

Scope: snapshot `MatchResult`, then have progression systems return ledger
fragments without rendering. Compose the existing visual result from that data.

Acceptance:

- The same result object can render victory, failure, replay/history, and tests.
- Reward totals equal their ledger lines after all multipliers.
- The result is applied exactly once across background/resume and repeated taps.
- Failure shows recovered resources and a useful next action.

### Stage 6 — faction previews and combat relationship language

This waits for the unit/structure art roster and weapon-role pass to stabilise.
Add `role`, `damageType`, `targetClass`, `strongAgainst`, and `weakAgainst` to
definitions, then show icons on unit/building previews, mission intel, build
cards, and debrief losses. Do not infer these relationships from flavour text;
extract and validate them through the design database.

Acceptance:

- Every buildable unit/structure has a faction-correct preview and purpose.
- Strong/weak claims match real simulation multipliers and target rules.
- Brood previews contain no machine vocabulary or mechanical fallback art.
- Nova previews visibly prioritise advanced energy technology and weapons.

## 8. Test strategy

Keep focused checks below two minutes each.

- Static/data contract: category IDs are unique, every modifier resolves to a
  real `WILDCARDS` rule, every inventory ID has one definition and rarity.
- Operations DOM smoke: open screen at 393x852, traverse all tabs by the real
  touch binding, verify one panel, 48px targets, summary updates, Back bounds.
- Save migration fixtures: empty legacy, pre-inventory, current, unknown item,
  cloud/local conflict, and round-trip `.mfsave` payload.
- Debrief ledger: deterministic result fixture, exact totals, apply-once guard,
  win/loss snapshots.
- Visual: at least one portrait PNG per changed screen and landscape PNG for
  any footer/back/navigation change.

The immediate low-risk implementation is Stage 1 only. It adds useful hierarchy
without changing game simulation, reward formulas, save shape, or screen routing.
