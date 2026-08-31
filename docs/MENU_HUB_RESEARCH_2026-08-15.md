# Menu / research hub — implementer research (2026-08-15)

Research only. No `src/` changes, no `#startScreen` rewrite, no second progression
system, no research minigame. Index lives in `docs/MOBILE_QOL_REVIEW_2026-08-15.md`
section 8 (8.1–8.5 stand; this note is the concrete follow-on). Custom access
rules: `docs/CUSTOM_VS_ARCADE_2026-08-15.md`. `docs/HANDOFF.md` does **not**
describe a menu hub.

**Rule:** the hub is chrome over screens that already exist. Every destination
is an existing `showFrontScreen(id)` call. `showScr` is a **local** helper inside
`boot()` in `src/main.js` (`showFrontScreen` + `sfx('ui')`). It is not a global
and not a router. A later takeover calls `showFrontScreen`, not a new route table.

---

## Verdict

Do not implement the hub in this pass. When it is allowed, the first slice is
navigation chrome only. Custom is **not** a war mode today — the hub must not
show a playable Custom card, a Campaign continue, or an MMO loop. Match research
(`RESEARCH[]` / `applyResearch`) stays inside a live Complex. Account research
(`DEVTREE` / `devBuy`) stays on `#devScr`.

---

## 1. Front-screen inventory

`FRONT_SCREEN_IDS` in `src/main.js`:

`startScreen`, `warScr`, `setupScr`, `devScr`, `opsScr`, `dailyScr`,
`dossierScr`, `inboxScr`, `updScr`, `profileScr`, `settingsScr`, `armory`.

`showFrontScreen(id)` hides every other id, sets `body.dataset.frontScreen`, and
sets `attractVisible` **only** when `id==='startScreen'`. Other overlays keep
`#gl` from ticking the diorama (see the comment above `attractVisible`).

Live labels after `mfRenameFrontNav()` (`src/galaxyui.js`): DEPLOY, OPERATIONS,
RESEARCH, ARSENAL, CONTRACTS, CAREER, INTEL, SANDBOX, SETTINGS. HTML defaults
still say War Room / Development / Armory / Orders / Factions / Mega.

| Screen | Markup | Open today | Hub later (same functions) | Notes |
|---|---|---|---|---|
| Home | `#startScreen` | `showFrontScreen('startScreen')`; `returnToMainMenu()`; most `*Back` | Tab Home → same | Attract diorama only while this id is showing |
| War Room | `#warScr` | `#startBtn` → `renderWarRoom()` + `showFrontScreen('warScr')` | Tab Deploy / Continue → same | Mode door. Do not skip to setup |
| War Table | `#setupScr` | `openSkirmishSetup()` → `openPlanetarySetup('standard')` → `showFrontScreen('setupScr')`. `initGalaxyUI` wraps `openPlanetarySetup` | Only after a **playable** War Room card | `galaxyui.js` hologram. Campaign/MMO/Co-op return before paint |
| Development | `#devScr` | `#devBtn` → `renderDevelop()` + `showScr('devScr')` | Tab Research → same | `restree3d.js` takes over `renderDevelop` when `devTab==='research'` |
| Operations | `#opsScr` | `#opsBtn` → `renderOps()` + `showScr('opsScr')` | Tab Ops → same | Threat / modifiers / weekly. Campaign tab still denies |
| Orders | `#dailyScr` | `#dailyBtn` → `renderDaily()` + `showScr('dailyScr')` | Overflow or Contracts chip → same | `META.daily` streak already exists |
| Intel | `#dossierScr` | `#dossierBtn` → `renderCodex()` + `showScr('dossierScr')` | Overflow → same | Faction codex, not a second research tree |
| Inbox | `#inboxScr` | `#inboxBtn` → `renderInbox()` + `showFrontScreen('inboxScr')` | Header / overflow → same | In-match `#inboxHudBtn` is a popup, **not** `showFrontScreen` |
| Updater | `#updScr` | `#updDot` → `renderUpdatePanel()` + `showFrontScreen('updScr')` | Header glyph → same | |
| Profile | `#profileScr` | `#profileBtn` / `#metaHead` / `#rankEm` → `renderProfile()` + `showFrontScreen('profileScr')` | Overflow / header → same | Guard `#metaHead` so child buttons do not also open Profile |
| Settings | `#settingsScr` | `openSettings('menu'\|'pause')` → `renderSettings()` + `showFrontScreen('settingsScr')` | Overflow → `openSettings('menu')` | `offline.js` already wraps `renderSettings` |
| Arsenal | `#armory` | `#armoryBtn` → `renderArmory()` + `showFrontScreen('armory')` | Tab Arsenal → same | `storeui.js` paints `#storeList` inside this overlay |

War Room cards (`WAR_MODES` in `src/game/meta.js` — **no Custom**):

| Card | Open | Hub |
|---|---|---|
| Training | `resumeTrainingMission()` (`src/tutorial.js`) | Unchanged. Not a hub tab |
| Standard | `openSkirmishSetup()` | Unchanged |
| Campaign / MMO / Co-op | locked: `sfx('deny')` + toast; `openPlanetarySetup` also rejects those strings | Stay locked. Do not deep-link |

Other live doors that are **not** front screens (do not invent routes):

| Door | Function | Why it is not a hub page |
|---|---|---|
| Sandbox | `#demoBtn` → `newDemo()` → `hideFrontScreens()` | Instant `demoMode` match. Not Custom. Not a picker |
| Resume dropped session | `sessRenderResume()` inserts `#sessResume` → `sessResume()` | Sits above DEPLOY. Goes straight into the match |
| Continue conquest | `#mfConquestContinue` → `mfGalaxyResumeConquest()`; victory → `continueToNextMap()` | Standard-only. Lives on the War Table, not home |
| Weekly | `#weeklyGo` → `startWeekly()` (`src/endgame.js`) | Ops footer. Campaign mode on that button still toasts |
| Intro / account | `#mfIntroStart`, `apClose` | Boot, not hub |
| Confirm / mail modal | `#accDlg`, `#dispatch` | Native-back layers |
| Match chrome | `#pauseOverlay`, `#gameOver`, `#levelUp`, `#loadScr` | Not menu |

Android Back already walks the front-screen stack in `handleNativeBack`
(`settingsScr` … `updScr` then `gameOver`). Hub chrome must not add a layer
that Back cannot close via an existing `*Back` id.

---

## 2. Concept-shot mapping

2026-08-15 images 3–5 are a **home hub**, not a new game (QoL 8.1). Map each
beat to a live function. Do not add a destination that is not in the table
above.

| Concept beat | Shot intent | Live owner | Hub mapping | Do not |
|---|---|---|---|---|
| Home diorama | 3D base behind chrome | `setupAttract` / `attractTick` / `stopAttract` on `#gl` (`src/main.js`) | Keep. Hub chrome is DOM over the same canvas | Replace with a fake city; second WebGL context; tick attract under opaque screens |
| Resource header | Cores / mats / data on home | `#metaHead`: rank, greet, `#coreV`, `#metaRec` via `renderMetaHead()`. Mats + ◆ Data live on `#devScr` (`matBag`, `META.researchData`) | First slice: leave header as-is. Later: `renderMetaHead` may also print `matBag()` / Data — still those fields | New hub currency; hide cores |
| Continue Campaign | Big resume CTA | **Not Campaign.** Dropped match = `#sessResume` / `sessResume()`. Arcade next site = `mfGalaxyResumeConquest` / `mfConquestNextMap` / `continueToNextMap`. Home primary = `#startBtn` → War Room | Label **CONTINUE** or keep **DEPLOY**. Action: `sessResume` if a snapshot exists, else `renderWarRoom` + `showFrontScreen('warScr')` | Open the locked Campaign card; write `storyCampaignActiveId`; skip War Room |
| Mode cards | Training / Standard / … on home | `#warScr` + `renderWarRoom` / `WAR_MODES` | First slice: **no** home mode cards (would advertise Custom). Later: same handlers as `renderWarRoom` (locked cards toast) | A playable Custom / MMO / Co-op / Campaign card; `mfQuickPlan==='custom'` as a mode |
| Bottom tabs | 4–5 persistent destinations | Four `.gbtn` + four `.sbtn` on `#startScreen`. No tab bar | First slice: Home / Deploy / Research / Ops / Arsenal → the openers in §1 | Tabs that start a match; a Research tab that launches a minigame |
| War Room as base-node graph | Spatial index of bases | `galaxyui.js`: `#mfGalaxyCanvas` (2D), stages galaxy → system → planet → region → deploy, locks via `mfConquest*` | Later restyle of `mfGalaxyDraw*` / chips only. Same 48 `MAPDEFS` sites | Second map catalog; WebGL on the hologram; treating the graph as a different 48 |
| Research-as-minigame | Short phone session that shortcuts an MMO grind | Two live graphs: match `RESEARCH[]` (`sim.js`) and account `DEVTREE` (`develop.js` + `restree3d.js`) | After ship gate only. Pays into those graphs. See §3 | Third tree; `applyResearch` from the menu; MMO scout that writes `META.mapWins` |

`docs/MASSFRONT-STAGED-DESIGN-PLAN-2026-08-02.md` already said “do not add tabs”
on home, then a later four-hub IA (Play / Command / Loadout / Profile). The
concept-shot tab bar is that later pass. First slice is five **navigation**
tabs that call existing screens — not a new IA and not a ninth equally weighted
home button.

---

## 3. Two graphs, and minigame sinks

There is no third graph. A menu toy that grants different bonuses than these
two is a new game.

### Match field studies — `src/game/sim.js`

Eleven nodes in `RESEARCH[]`: `bal1`, `plate1`, `optics`, `nano`, `fusion`,
`hardpoint`, `contain`, `defnet` (req `hardpoint`), `bal2` (req `bal1`),
`plate2` (req `plate1`). Paid in mass/energy on a live `techlab` (Research
Complex). `bldTick` advances `B.resT` and calls `bankResearchProgress(R.id, B.resT)`;
at `R.t` it calls `applyResearch(id)` (army scalars + toast “+3 ◆ Data at
debrief”).

`researchCarry` / `bankResearchProgress` / `researchResumeTime` are **this
match only**. `resetWorld()` (`src/main.js` ~568) clears `researched`,
`resDone`, and `researchCarry`. `setupAttract()` and `newSkirmish()` both call
`resetWorld()`. HUD `renderResearchMenu()` is the only consumer: starting a
study sets `Bb.resT = Math.min(R.t-.01, researchResumeTime(R.id))`.

So a menu call to `bankResearchProgress` **does not survive** into the next
match unless something re-seeds carry **after** the next `resetWorld()`.

`applyResearch(id)` from the menu is illegal: it mutates match scalars on the
attract sim, is wiped by the next `resetWorld`, and skips the Complex economy.

### Account development — `src/develop.js` + `src/restree3d.js`

`DEVTREE` unlocks craft rights / slots / salvage — **not** a combat stat.
Completion is only `devBuy(n)` (materials + `META.researchData`). Queue is
`META.resQueue` (max 5). `devFlushQueue()` spends the queue after a match
(`developRecord`) or a Data crate (`applyCrate` wrap). Presentation takeover:
`initResTree3D` reassigns `renderDevelop`; purchases still go through `devBuy`.
Public hooks: `window.__MF_RESEARCH_TREE__.queueAdd` / `queuePath` /
`flushQueue`.

Materials: `matBag` / `matHas` / `matSpend` / `matGrant`. Match drip:
`matsFromMatch` / `fieldRecoveryFromMatch` (requires `matchCommitted`). Wear:
`modRepair` (needs `devHas('refit')`), `modCraft`, `wearModules`. Data drip:
`researchDataFromMatch` (debrief) and crate `data` (`META.researchData += 4`).

### Options A–D (refine QoL 8.2; do not add a fifth)

Still: **A or B first. Never C+D together.** Never `applyResearch()` from the
menu.

| Option | Loop | Legal sink (file / function) | Illegal | Why not yet |
|---|---|---|---|---|
| **A. Field sample** | One-thumb trace on a still/overlay of the attract view. ≤90s. Accuracy → a **drip**, not a complete node | **Account (preferred):** `matGrant({alloy:1})` or `META.researchData += 1..2` + `metaSave` + `renderMetaHead` / `renderDevelop`. Cap with `META.daily.day` (existing sitrep), not a new streak. **Match (only if you must touch `RESEARCH[]`):** persist a pending ticket (e.g. `{id,t,day}` on `META.daily` or a single `META.resCarryTicket`) and consume it in `newSkirmish` **after** `resetWorld()` by calling `bankResearchProgress(id,t)` with `t < RESEARCH[i].t`. Player still taps the study on a Complex (`renderResearchMenu`) | `applyResearch`; `devBuy`; writing `researchCarry` on the menu (wiped); completing a node (`t >= R.t`); `matsFromMatch` | Without Custom/MMO, a menu tick that finishes `bal2` skips the match economy. Account Data/mats do not |
| **B. Module bench** | Drag a worn module onto a plate; hold to confirm | `modRepair(m)` — already checks `devHas('refit')`, `matSpend(half)`, tops `META.mods` | `modCraft` for free; `applyModules` on the attract sim; skipping `refit` | Repair-as-hold is chrome on a list row until wear is felt (several Standard matches) |
| **C. Doctrine hand** | Three cards from the next `devAvail` / not-`devHas` nodes. Pick one to **queue** | `__MF_RESEARCH_TREE__.queueAdd(id)` or `rtQueueAdd` → `META.resQueue`. Spend later via `devFlushQueue` / `devBuy` when Data+mats exist | `devBuy` from the hand; granting `META.res[id]`; a second card UI that hides `#devScr` | Two UIs for one `req` graph. Players lose the tree |
| **D. MMO scout** | ≤30s flyover, one flavour grab | Nothing, or one `matGrant({alloy:1})` under the same daily cap as A | `matsFromMatch`; `metaGrant`; `META.mapWins`; `openPlanetarySetup('mmo')`; loading a locked theatre as a real match | No MMO loop. Flavour only after the ship gate |

**A — match-ticket rules (if built later):** pick the next affordable
`RESEARCH` node the player has not finished *in a match they actually play*
(req edges + `clvl` still apply in HUD). Ticket expires with `META.daily.day`.
Fail / quit grants nothing. Do not auto-start `B.res` on the Complex.

**Daily cap:** hook `dailyState()` / `META.daily.day`. Do not add a fourth
streak next to `META.daily.streak`, `META.streak`, and sitrep.

---

## 4. Mobile constraints

- One thumb, portrait 355–430 CSS px. No two-stick “play the RTS in the menu.”
- Session ≤ 90s or it blocks Continue / Deploy — the actual door.
- One WebGL2 context: `#gl` via `src/engine/gl.js` (`getContext('webgl2')`).
  Galaxy hologram is **2D** (`#mfGalaxyCanvas`). `restree3d.js` is a 2D SVG
  graph, not a GL tree. Minigame board = DOM / 2D overlay on the attract view.
- Reuse attract `#gl`. `stopAttract` already shows the canvas; `attractVisible`
  already stops the diorama under opaque screens. Do not `getContext('webgl2')`
  on a second canvas.
- Haptics: `buzz` / `rumbleHaptic` on success only. `rumbleInMatch()` is false
  on the menu so leftover `shake` cannot nudge the diorama.
- No new large media in the installer. Reuse `ITEM_ART`, unit sheet, attract
  scene.
- `#startScreen` stays the fallback. Hub chrome is a **takeover** (same pattern
  as `src/offline.js` wrapping `renderSettings`, `src/restree3d.js` wrapping
  `renderDevelop`). It **calls** `showFrontScreen`, it does not replace the
  overlay set.
- Safe-area / 48 px targets: staged UI plan already requires this. War Room
  still clips on some cutouts (QoL §2) — hub tabs must sit above `--sal` /
  home indicator.

---

## 5. Ship gate

Do **not** ship hub chrome or a minigame until all of these are true:

1. **Custom is a real War Room card** — `WAR_MODES` entry, `openPlanetarySetup('custom')`
   keeps `activeWarMode==='custom'`, War Table playable. Spec:
   `docs/CUSTOM_VS_ARCADE_2026-08-15.md`. Not `mfQuickPlan==='custom'`.
2. **Custom writes no `META.mapWins`.** Today `metaGrant` increments mapWins
   when `!gated` — that would open later Standard planets. Also no
   `mfConquestReward` first-clear, no `continueToNextMap`, no departure arm,
   no `META.standardMatches++`.
3. **MMO stays a locked card.** No browse stub, no scout that starts a match,
   no `openPlanetarySetup('mmo')`.
4. Match Complex path remains the way field studies complete. A minigame is a
   drip, not `applyResearch`.
5. Until 1–3 land, **no hub chrome** — not even a tab bar that only calls
   `showFrontScreen`. The live `#startScreen` grid is the menu.

This VFX / QoL pass does not rewrite `#startScreen`.

---

## 6. Do not implement now

- Hub chrome, tab bar, home mode cards, or a `#startScreen` rewrite / VFX pass.
- Research minigame (A–D). No field-sample overlay on `#gl`.
- Second progression: hub XP, hub skill tree, `META.hub*`, a fourth daily streak.
- `applyResearch()` from any menu / attract / hub path.
- `devBuy()` from a minigame (skips the Data+mat cost).
- `bankResearchProgress` / writes to `researchCarry` on the menu (wiped by
  `resetWorld` / `setupAttract`).
- `matsFromMatch`, `metaGrant`, `META.mapWins`, or `mfConquestReward` from the
  menu, Custom, or a scout grab.
- Pretending Custom / Campaign / MMO / Co-op are playable. No Custom card on
  the hub before the War Room card exists.
- Using Sandbox (`newDemo`) or `mfQuickPlan==='custom'` as Custom.
- Second WebGL context; replacing attract with a fake city; ticking the
  diorama under opaque overlays.
- Replacing `galaxyui.js` with a second 48-site graph.
- New routes, `import`/`export` under `src/`, version bump, bundle, OTA.
- C+D together. Option D that loads a locked theatre as a real match.

---

## 7. Recommended first implement slice (later — describe only)

**After** the Custom War Room card and the `mapWins` leak are fixed.

One new takeover file (register in `boot.js` `MANIFEST` **and**
`assets/data/manifest.json` `order`). At init, wrap or overlay `#startScreen`
the way `offline.js` wraps settings. **Do not** replace the overlay markup as
the only path — old APKs without `#warScr` still fall back to
`openSkirmishSetup()`.

Paint:

- Keep the attract diorama (`applyMenuBackdrop` / `setupAttract`). No new GL.
- A bottom tab bar, 48 px, safe-area padded: **Home / Deploy / Research / Ops /
  Arsenal**.
- A single primary **CONTINUE** (or keep DEPLOY) above the tabs.

Each control calls existing functions only:

| Tab / button | Calls |
|---|---|
| Home | `showFrontScreen('startScreen')`; `renderMetaHead()` |
| Deploy / Continue | If `#sessResume` would show: `sessResume()`. Else `renderWarRoom()`; `showFrontScreen('warScr')` |
| Research | `renderDevelop()`; `showFrontScreen('devScr')` |
| Ops | `renderOps()`; `showFrontScreen('opsScr')` |
| Arsenal | `renderArmory()`; `showFrontScreen('armory')` |

Overflow (existing buttons, not new screens): Profile → `renderProfile` +
`profileScr`; Settings → `openSettings('menu')`; Contracts → `renderDaily` +
`dailyScr`; Intel → `renderCodex` + `dossierScr`; Inbox / updater stay on
`#metaHead`.

Out of this slice: minigame, home mode cards, Custom/MMO copy, `matBag` header
rewrite, War Table restyle, any `META` field, any `RESEARCH[]` / `devBuy` write.

Back: existing `#warBack` / `#devBack` / … already return to `startScreen`.
Native Back keeps the same layer list. Attract stays off on every id except
`startScreen`.
