# MASSFRONT game audit — current main

Prepared **2026-09-13** against `main` at `becd52f` (tree version **1.33.88**).
This is a source-and-content audit of what the game actually does after the
large post-1.33.88 push (UGA rooms, module effects, notice ladder, match-halt,
faction identity). It is **not** a stage-status document and does not override
[`MASTER_PLAN.md`](MASTER_PLAN.md) or [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md).

**Method.** Read runtime paths under `src/` and `modules/space_exploration/`,
cross-checked catalogs and UI markup, and ran existing static gates (listed
below). No hardware-GPU match or UGA walk was driven in this pass. Claims that
need a live client are marked **unverified in-client**.

**Companion docs that are partly stale.** [`UGA_PROGRESSION_AUDIT.md`](UGA_PROGRESSION_AUDIT.md)
(2026-09-09) still describes missing region control and an empty tactical
bridge; both now exist in code. [`RELEASE_STATUS.md`](RELEASE_STATUS.md) last
reconciles **1.33.83**. [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md) last
reconciles **1.33.60**. Use this file for current player-facing gaps; use the
handoff for release mechanics.

---

## 1. Executive summary

MASSFRONT is a working Supreme-Commander-style mobile RTS with a second,
integrated galactic layer (UGA Command). The recent push closed several
**match-breaking** defects (level-up freeze, unguarded `heroXP`, non-sticky sim
halt, double dropship, silent economy coaching, feed-badge inflation, faction
resolver mapping Nova → Syndicate) and made ship rooms and socket modules
actually do something.

The game is **playable**. It is **not release-ready as a coherent career**.

The biggest remaining risk is not a missing feature. It is **two overlapping
products that disagree**:

1. **Classic Standard** — four homeworlds, 16 regions, 48 conquest maps, War
   Table galaxy flow, optional Training / five-mission Prologue.
2. **UGA expedition** — three systems, five planets, nine ground areas × three
   maps, ship rooms, scan → deploy → settle.

Those loops share a renderer and a match engine. They do **not** share a
progress spine. UGA treats “mission complete” and “region held” as different
facts, then shows the player one objective rail that follows the wrong one.
Standard conquest and UGA control never write to each other. The War Room
advertises a playable Campaign that the UGA hub still labels *in development*.

**Release-readiness gut-check.** Fine for a closed playtest if operators know
the seams. Not ready to present as one finished galactic RTS: a new player can
finish a map, lose the next-action prompt, fill their banks and watch income
vanish, and tap locked Co-op / MMO cards that still promise XP. Cutting 1.33.89
without a progression-spine pass would ship a better *match* on top of a
still-confused *career*.

| Severity | Count in this inventory |
|---|---:|
| Critical | 2 |
| High | 8 |
| Medium | 11 |
| Low | 8 |

---

## 2. How the game works (brief)

### Cold launch

`index.html` → immutable `boot.js` → `src/main.js` `boot()`. The visual
launcher (`#updScr`, `src/launcher.js`) owns the first screen. Play goes
intro (`src/intro.js`) → auth gate (`src/authportal.js`) → UGA when galactic
content is present, else the legacy dashboard (`#startScreen`).

Galactic deep links (`?galacticRoute=`, `?groundOperation=`,
`?galacticFallback=classic`) skip intro.

### Two doors into space

| Control | Entry view | Player sees |
|---|---|---|
| Launcher Play / `#startBtn` | `campaign_hub` | Ship interior + Galactic Command |
| `#ugaBtn` (UGA COMMAND) | `system` | Orbit around NEXUS-VII |

Ticket: `sessionStorage` key `massfront.galactic.entry.v1`. Module boot:
`modules/space_exploration/src/space_experience.js`.

### UGA loop (intended career)

1. Commission a faction + Commander 1 (`career-faction-gate.js`, Command Core).
2. Walk ship districts (11 rooms). Construction and research advance on
   **expedition cycles** (surveys, transit, mission results) — not wall-clock.
3. DEPART → `system` scene → select a planet → `survey` → spend a probe.
4. Scan next-action (`getSurveyNextAction`) opens Mission Ops, not the hangar.
5. Pick mission + map + commander + doctrine → `beginGroundOperation()` →
   base game at `?groundOperation=<nonce>`.
6. Carrier phase (`matchLive=false`) until `#deployBtn` → `deployCarrier()`.
7. RTS match. On end, `returnToNexus()` → `?groundResult=<nonce>` →
   `applyGroundResult()` once (`appliedResultIds`) → return-services view.

Domain owner: `modules/space_exploration/src/domain/*`.
RTS bridge: `src/galactic-operations.js`.

### Classic Standard loop (still the finished local mode)

War Room **STANDARD** → five-stage War Table
(`galaxy → system → planet → region → deploy` in `src/galaxyui.js`) over the
four homeworlds in `src/engine/gl.js` `PLANETS` (Aelos, Pyraeth, Nordhall,
Vespera = 16 regions × 3 sizes = 48 maps). `#setupStart` at deploy runs
`newSkirmish()`. Same carrier → deploy → match. Return is
`returnToMainMenu()` unless a galactic intercept sends the player back to UGA.

### Other modes

| Mode | What it actually is |
|---|---|
| Training | KEEL-protected course (`src/tutorial.js`). Basics (10) then optional certification. |
| Campaign | Five-mission Prologue in `#opsScr` (`src/story.js` `STORY_CAMPAIGN_PROLOGUE`). Playable from War Room. **Locked** on the UGA hub (`HOST_REQUIRED`, “in development”). |
| Weekly | Host-routed briefing (`#opsScr`). |
| MMO / Co-op | Visible, locked, toast *not available yet*. Reward strip still renders. |
| Social / realtime | `src/socialui.js` + Worker. Lobbies exist; `realtimeMatch` must be advertised or launch fails closed. |

### Match systems (shared)

Economy (`src/game/economy.js`): streaming mass/energy, HQ + extractors +
reactors + fabricators, silo caps. AI wallets exist but **mirror** unless
`AI_ECON_REAL` / `window.__aiEconReal`. HUD notices
(`src/ui/hudflow.js`): `CRIT / ORDER / INFO / CHAT` — INFO never hits the
live rail. Level-up chooser (`src/game/commander.js`) builds cards **then**
pauses. Session snapshots (`src/session.js`) restore mid-match with generation
handles.

---

## 3. Issue inventory

### Critical

#### C1. Pause RESUME after a sim halt looks like recovery; the match stays dead

- **What's wrong.** An exception in the sim step now latches `mfSimFailure`,
  toasts once, and sets `paused=true`. Rendering and audio keep going (that
  part is correct). **RESUME** only clears `paused`. `frame()` still refuses
  the step while the latch is set. The world is frozen, the pause title still
  says PAUSED, and the only way out is Abandon Match — which a player who just
  tapped Resume will not expect.
- **Where.** `src/main.js` `mfReportSimFailure()`, `frame()`
  (`!mfSimFailure` gate ~1611), `mfClosePause()` (~2311). Overlay:
  `index.html` `#pauseOverlay` / `#resumeBtn`.
- **Evidence.** `tools/test-sim-failure-reporting.mjs` **PASS** — it asserts
  the latch is sticky *inside* a match (so RESUME cannot re-enter the throwing
  step). It does **not** assert that the pause UI changes. `resetWorld()`
  clears the latch (next match is fine).
- **Fix direction.** When `mfSimFailure` is set, retitle the overlay and hide
  or disable Resume. Keep Abandon / Settings. Do not clear the latch from
  Resume.

#### C2. Mid-deploy save can drop the pending operation and leave personnel deployed

- **What's wrong.** A player who starts a ground op, then reloads, can lose
  the pending ticket. If hydrate decides the proxy faction is not resident it
  nulls `operations.pending` and does **not** walk commanders/specialists back
  to `ready`. The next deploy can then fail as “already deployed” / “resolve
  the pending operation” with nothing to resolve.
- **Where.** `modules/space_exploration/src/domain/state_store.js`
  `hydrateDomainState` (~674–684). Pending is required by
  `ground_operation.js` (`OPERATION_ALREADY_PENDING`) and
  `ground_result.js` (recovery blocked while pending).
- **Evidence.** The resident check is the only keep-path. The else branch is
  a silent drop. Host restore (`massfront_solo_host.js`,
  `space_experience.js` ~974) can re-show a pending op **only if it survived
  hydrate**.
- **Fix direction.** Keep pending across load; validate on resume; offer
  explicit Resume / Abandon (Abandon refunds and resets personnel). Never
  drop without a compensating personnel write.

---

### High

#### H1. “Mission complete” and “region held” are different facts — the hub follows the wrong one

- **What's wrong.** Owner spine: a region has three maps; clearing all three
  holds the region. The data layer now does that (`deriveGroundControl`).
  Command Core, brood-chain gates, and solo-front pressure still treat **one
  victory** as the mission being done. After the compact map, the hub can
  stop pointing at the other two maps, brood ops can unlock, and REGIONS HELD
  still reads 0/9. The three-map ladder becomes invisible.
- **Where.**
  - Correct: `modules/space_exploration/src/domain/ground_control.js`
  - Wrong consumers: `uga_command.js` `commandObjective()` (~1753–1788)
    builds `cleared` from any `outcome === 'victory'` mission id;
    `ground_operation.js` `completedMissionIds` uses
    `completions >= 1`; `progression.js` `hasUnresolvedSoloFront` same.
- **Evidence.** `commandObjective` even *computes* `region.clearedMapIds`
  for the *next* ready mission, then marks the current mission cleared after
  one win so that block never runs again. Hub then falls through to
  “Depart and scan”.
- **Fix direction.** One spine: “ready / in-progress / held” from
  `deriveGroundControl()`. Prioritize areas with
  `0 < clearedMapIds.length < totalMaps`. Increment `completions` (or add
  `missionComplete`) only when the region is held — or split map-clears from
  mission-complete everywhere.

#### H2. Two galaxies, two progress ledgers, no shared conquest

- **What's wrong.** Standard’s War Table is four stars and four homeworlds
  (48 maps). UGA’s catalog is Aelos / Veyra / Karak and five named planets
  (9 areas × 3 maps). Winning on Aelos Capital Circumference does nothing
  for UGA Caldris, and the reverse. Players who enter through UGA COMMAND
  and players who enter through STANDARD are not playing the same war.
- **Where.** Classic: `src/engine/gl.js` `PLANETS`, `src/galaxyui.js`,
  `META.mapWins`. UGA: `catalog.js` `UGA_GROUND_AREA_CATALOG` /
  `MISSION_CATALOG`, `ground_control.js`.
- **Evidence.** War Room copy is accurate for Classic
  (`4 planets · 16 regions · 48 conquest battlefields`). UGA areas reuse
  some `runtimeRegionId`s (`aelos_ridge`, …) as **terrain templates**, not
  as shared ownership. No write path from `deriveGroundControl` into
  `mfConquestWon`.
- **Fix direction.** Product call: either (a) make UGA the only career and
  treat Standard as a sandbox that does not claim conquest, or (b) map each
  UGA area onto a Classic region and settle both ledgers from one result.

#### H3. Storage caps dump all income a few minutes in

- **What's wrong.** Bare HQ: `mi+=5.0`, `ei+=26` per tick against
  `MCAP0=1200`, `ECAP0=6000`. Energy fills ~t=230 s of HQ-only income,
  mass ~t=240 s (starting banks 220 / 900). After that, surplus is
  discarded (`mWasted`). HUD shows the exact caps. Players report “full
  banks, nothing happening.”
- **Where.** `src/game/economy.js`. Coach now fires at `MF_N_ORDER`
  (fixed). Caps unchanged. Silo: +600 mass / +2000 energy each.
- **Evidence.** Explicitly left open in `CODEX_HANDOFF.md`. Overflow is
  tracked only to drive the coach, not to store or convert.
- **Fix direction.** Raise base caps, scale with HQ / commander tier, or
  add a visible sink (auto-reclaim / overflow research). Re-measure with
  `tools/probe-match-health.mjs` on a real `newSkirmish()`.

#### H4. Cutting the AI’s power does nothing

- **What's wrong.** `AI_ECON_REAL=false`. Team-1 mass/energy are a
  **derived mirror** of seat wallets; spend on the ledger is erased next
  tick. Enemy energy weapons are free. Destroying reactors does not stall
  production or turrets. “Kill their eco, then push” is inert vs AI.
- **Where.** `src/game/economy.js` ~78–104, `econAiReal()`,
  `econMirrorAiBanks()`. Override: `window.__aiEconReal`.
- **Evidence.** Comment records measured free draw (201 e/s Hard Nova,
  463 e/s Hard Syndicate turtle). Flag ships false on purpose so a
  difficulty change is A/B-able.
- **Fix direction.** Flip the flag in a dedicated balance pass. Probe with
  `newSkirmish()`, not a hand-built world (missing seat wallets fake
  `eStarved` and look like an AI bug).

#### H5. Hive Purge with unlimited time has no commander-kill win

- **What's wrong.** Purge wins only when `liveNests().length===0`. The
  following branch (commanders **and** nests dead) is dead code. Survival
  already gained a “siege broken” win; purge did not. Wipe every enemy
  commander, leave a hive, and the clock runs to `MATCH_HARD_CAP` (40 min)
  for a territory stalemate — or the timed purge simply **loses**
  (“hives still stand”).
- **Where.** `src/main.js` `checkVictory()` ~1178–1207. Campaign P-01 /
  P-04 and all `uga_brood_purge` ops use purge.
- **Evidence.** Survival special-case comment at 1182–1187 documents the
  same class of bug, already fixed for that goal only.
- **Fix direction.** Decide the rule: “hives only”, “commanders **or**
  hives”, or force a timer on infestation maps. Encode it in one branch.

#### H6. UGA hub locks Campaign; War Room Campaign is playable

- **What's wrong.** Galactic Command lists Campaign Prologue as
  `HOST_REQUIRED` / “in development” with **no** host target. War Room
  **CAMPAIGN** opens the five-mission Prologue (`P-00`…`P-04`) and starts
  real matches. A UGA-first player never sees the authored story; a
  War-Room player does. Copy disagrees with the live path.
- **Where.** `campaign_hub_registry.js` `campaign` route (~105–107).
  `src/game/meta.js` `renderWarRoom` → `#opsScr`. `src/story.js`
  `STORY_CAMPAIGN_PROLOGUE`.
- **Evidence.** Registry comment says authoring waits on the engine. The
  engine path already exists and is wired.
- **Fix direction.** Either host-route UGA Campaign to `mode-campaign` /
  `operations`, or mark the War Room card with the same “prologue / not
  the galactic campaign” language so the two doors match.

#### H7. Faction-exclusive contracts hide most of the thin UGA map

- **What's wrong.** Nine missions: six `faction_exclusive` (2 Nova / 2
  Dominion / 2 Syndicate), three UGA brood ops (chained). One career sees
  **two** faction contracts + the brood chain — six of nine areas are
  someone else’s war. Combined with H1, the map feels empty after one
  drop.
- **Where.** `catalog.js` `MISSION_CATALOG`. Access checked in
  `missionLocks` / `ground_operation.js`.
- **Evidence.** Catalog is internally consistent (`validateCatalogs()`).
  This is content policy, not a crash — but it is why the loop reads as
  directionless even after control math landed.
- **Fix direction.** Add UGA-neutral or cross-faction variants for the
  locked areas, or show locked contracts as “held by X / replay as Y”
  instead of omitting them.

#### H8. Locked MMO / Co-op cards still advertise XP and loot

- **What's wrong.** Cards are locked and toast correctly. They still
  render `MODE_REWARD_CONTRACTS` (`+50% XP` on MMO, mode consumable on
  others). That is a false affordance on the first screen after Play.
- **Where.** `src/game/meta.js` `WAR_MODES`, `MODE_REWARD_CONTRACTS`,
  `renderWarRoom()` (~1552–1572). UGA hub `mmo` / `coop` are
  `HOST_REQUIRED` (honest). Social can still stage a lobby; launch
  refuses if `realtimeMatch!==true`.
- **Evidence.** Reward HTML is built whenever `C` exists; lock is a
  sibling span, not a gate on the strip.
- **Fix direction.** Omit the reward strip when `locked`. Grey Social
  “create lobby” until the capability bit is true.

---

### Medium

#### M1. Three rooms look like workplaces and are archives

Survey Lab → `intelPanel()` (read-only discoveries; probes fire in
orbit). Fabrication & Armory → `inventoryPanel()` (“READ-ONLY MANIFEST”,
no craft). Habitat & Medical → `crewPanel()` (roster, no treat/assign).
`uga_command.js` `roomWorkBody()` ~1086–1108. Players walk in expecting
a job. **Fix:** header copy “ARCHIVE / VIEW ONLY”, or add the missing
actions (probe from lab, craft via host Development, medical recover).

#### M2. Scan does not land in the hangar

`getSurveyNextAction` → `inspect-ground-area` → Mission Ops list
(`space_experience.js` `followSurveyNextAction`). Commander and map are
still manual. Owner spine was “scan → commander + loadout → drop.”
**Fix:** next-action opens hangar with `areaId` / commissioned commander
pre-selected.

#### M3. Region control is almost invisible outside Command Core

`deriveGroundControl()` is used for the hub objective / REGIONS HELD
tally. Contracts, map picker, and survey cards do not show 2/3 maps or
holder. **Fix:** stamp `groundControlSummary` on those surfaces; grey
cleared maps.

#### M4. Socket modules: install is yes/no, no replace

Domain `installDistrictModule` can overwrite. UI only offers install
when `!installed` (`uga_command.js` ~922). All personalisation is the
tier-2/3 facility pick. **Fix:** REPLACE with cost/refund, or say the
choice is permanent.

#### M5. Construction does not tick in real time

`advanceExpeditionCycles()` in `construction.js` — work is cycle-based
(survey / transit / result). Sitting in Engineering watching a queue
does nothing. Copy in the room mentions upgrades; it does not shout
“progresses when you leave.” Easy to file as “construction is broken.”
**Fix:** queue rows show “Advances on next survey / transit / operation”
and refuse a fake skip button (already a product rule).

#### M6. Player-facing “Nova Coalition” leftovers after the identity fix

Catalog display name is **Terran Frontline Command**. Error strings in
`progression.js` (~245, ~280) still say Nova Coalition.
`modules/space_exploration/tests/domain.test.mjs:110` still asserts the
old name and **fails** against current catalog (ran 2026-09-13). Resolver
in `src/faction-id.js` is otherwise healthy (distinctive tokens first).
**Fix:** align copy + test to `FACTION_CATALOG.nova.name`.

#### M7. Economy coach waits while Build / Prod is open

`src/uistack.js` `mfUiBusy()` defers `showCoach` into
`mfUiCoachPending`. STORAGE FULL during a long build session never hits
the rail until the panel closes (and then only if a flush window is
free). Priority itself is correct (`MF_N_ORDER`). **Fix:** flush
economy-critical coaches through the notice rail even when a panel is
open, or exempt them from `mfUiBusy()`.

#### M8. Level-up chooser hides behind a chip in hot fights

`hudflow.js` defers `showLevelUp()` while `mfFlowModalBusy()` (heat,
alerts). Cards stack in `pendingLevels` until a ~1.4 s calm window.
Better than the old freeze; easy to miss the chip. **Fix:** pulse
`#heroBar`; auto-open at `pendingLevels>=2` or on pause.

#### M9. Online pause is local-only

`mfOpenPause()`: `paused=!(net.state==='running')`. Lockstep rooms keep
ticking. Overlay still says PAUSED. **Fix:** label
“LOCAL VIEW — MATCH CONTINUES” or a server pause-vote. Relevant when
realtime co-op is actually advertised.

#### M10. Training is optional; FIRST CONTACT is a toast drip

`needsTraining()` does not auto-start on Standard deploy (`main.js`
~3082–3089). Skippers get `startFirstContactGuide()` only if
`assistedOpeningActive()` **and** `deploymentPackage==='prepared'`.
Everyone else gets no KEEL and no chips. **Fix:** one soft prompt on
the first Standard match if `!META.tutorial.basicDone`.

#### M11. Status / progression docs disagree with the tree

Live/tree version is **1.33.88**. `RELEASE_STATUS.md` = 1.33.83.
`MASTER_PLAN_STATUS.md` = 1.33.60. `UGA_PROGRESSION_AUDIT.md` lists
gaps that have since shipped (control derivation, tactical profiles,
scan next-action). Operators will “fix” ghosts. **Fix:** rewrite
those three in place (handoff rule: no dated siblings).

---

### Low

#### L1. INFO / CHAT notices never reach the live rail

By design (`mfNoticeLiveAllowed`: `pri >= MF_N_INFO` → false). Radio
and flavour are feed-only. Economy coaching was the real bug (fixed).
**Fix:** keep the rule; audit new call sites. Documented in
`CODEX_HANDOFF.md` “notice ladder.”

#### L2. Doubled loading covers

`#mfBootCover` then `#updScr.mfLauncher`, with the title overlapping the
launcher. Measured in the handoff (~32 s + ~27 s). Product decision, not
a logic bug. Violates `UGA_PLAYER_FLOW.md` “one readiness owner.”

#### L3. UGA COMMAND tap path unproven in the browser harness

Source gate `tools/test-uga-command-opens-in-space.mjs` **PASS** (entry
view `system`). Pointer harness reported `handler ran 0x` on that button
while DEPLOY worked. **Unverified in-client.**

#### L4. Thin UGA planet layering

Caldris 2 areas; Ithara / Orison 1; Nacre 2; Meridian K-4 3. “Layered
regions per planet” is only real on Meridian.

#### L5. `#dossierBtn` is `display:none`

Codex exists (`#dossierScr`) and UGA can host-route `intel`. Main
dashboard has no visible Intel slice.

#### L6. Multiplayer orders cap at 64 unit refs per command

`src/game/matchconsumer.js` `MC_UNIT_COMMAND_MAX=64`, 8 batches, 2048
bytes. Single-player unlimited. UI should warn before submit when
`requiresLockstep()`. Stage 2 / 15 still open on this.

#### L7. Operation mods exist in UGA; Standard op-mod / spawn-fairness rows do not come across

`configureBattle()` now drives timer, pace, crates, wildcards, enemies,
defense, goal, package, infestation (`galactic-operations.js` ~782–832).
`tools/test-uga-tactical-profiles.mjs` **PASS**. `spawnFairness` is
Classic-only (`src/main.js` ~579). UGA `OPERATION_MOD_CATALOG` applies
via `applyOperationMatchEffects` (survey_link / repair_nanites /
medical_cache) — not via the Standard modifier row.

#### L8. Harness-only ghosts (do not treat as player bugs)

| Symptom | Actual cause |
|---|---|
| AI builds only reactors | Probe skipped `newSkirmish()` / seat wallets |
| UGA rooms “empty” | Mount without `onHostRoute` or `schemaVersion: 7` |
| Two resource rails in a screenshot | Panel mounted without `data-scene="uga"` |
| “Ship complete” after three rooms | District rail is deck-filtered (A/B/C) |

---

## 4. Systems checklist

| Area | Status | Notes |
|---|---|---|
| Exploration / UGA scenes | **Partial** | Four scenes (`system` / `survey` / `galaxy` / `uga`) work. Scan → hangar is multi-hop. Two entry doors are now distinct (static **PASS**). Live `#ugaBtn` tap **unverified in-client**. |
| Rooms (11 districts) | **Partial** | All have a work body. 8 actionable, 3 archives (M1). Navigation Bridge is new and honest. |
| Modules / facility effects | **Healthy** | 33/33 modules effectful; `calculateFacilityCapabilities` is the single aggregator. `tools/test-room-upgrades-have-effects.mjs` **PASS**. Commander XP scales, cap 60% (45% on a maxed ship in that test). |
| UGA resources / construction | **Partial** | Credits, alloys, fuel (start 90), probes (start 8). No artificial UGA caps. Construction is cycle-based (M5). Fuel gates travel (`plotCourse`). |
| RTS economy | **Playable / mis-tuned** | Caps too small (H3). AI eco mirrored (H4). Production no longer charges for units the pop cap then refuses (`sim.js` ~10126–10149). |
| Combat / units | **Playable** | MOVE exists (`ustate===1`, toggle + double-tap retreat) — older reviews that say “no move order” are stale. Slot generation (`ugen`) is live. WKM counters exist; sonic pierces Bulwark. Striker/Rhino/Hornet were rebalanced in-source. Balance still needs a measured pass, not a feel pass. |
| Victory / goals | **Partial** | Annihilate / domination / survival (unlimited) look sound. Purge unlimited is incomplete (H5). Hard cap 2400 s prevents infinite matches. |
| Save / load (match) | **Mostly healthy** | Session restore is seat-aware; dropship double-deploy guarded inside `deployCarrier()`. `tools/test-save-persist.mjs` **PASS**. |
| Save / load (UGA) | **Hazard** | Pending-op drop (C2). Legacy history without `battlefield.location` does not count toward control. Results are idempotent (`appliedResultIds`). |
| UI / HUD | **Playable** | Notice ladder works as designed after the coaching fix. Feed badge counts unread rows and resets per match (`test-notice-feed-badge.mjs` **PASS**). Level-up cannot deadlock (`test-levelup-cannot-deadlock.mjs` **PASS**). Pause overlay ignores sim-halt (C1). |
| Tutorials / onboarding | **Partial** | Career gate + KEEL basics **PASS** (`test-career-faction-gate.mjs`, `test-onboarding-foundation.mjs`). Skip path is thin (M10). |
| Audio | **Handled** | Dual-codec SFX; AAC music with three-fail fallback to bundled stems. Open-source Chromium will lose playlist music, not SFX. |
| Performance | **Open (Stage 12)** | High-unit p99 still fails the 33.3 ms gate per `MASTER_PLAN_STATUS.md`. Not re-measured here. |
| Multiplayer / social | **Partial** | 2p skirmish / 2–4p co-op are the supported shapes in the consumer. >64-unit orders chunk/reject. Human co-op from UGA is not a real adapter (`UGA_PLAYER_FLOW.md`). War Room cards oversell (H8). |
| Tools / probes | **Healthy, GPU-bound** | `probe-match-health`, `probe-levelup-flow`, `probe-loading-screens`, `probe-commander-hud`, `audit-uga-rooms`, `capture-uga-*`. This environment did not launch Playwright/GPU. |
| Docs / handoffs | **Split** | `CODEX_HANDOFF.md` is current for traps and unreleased work. Version status docs lag (M11). This file is the player-facing audit. |

---

## 5. Open questions / unknowns

Needs a hardware-GPU client (`tools/pw-browser.mjs`), not more reading:

1. Does `#ugaBtn` fire the `system` entry on a real pointer (L3)?
2. After one compact victory, what does Command Core *look* like — does the
   player still see “2 of 3 maps” anywhere besides the REGIONS HELD fraction?
3. Mid-deploy reload: are commanders stuck `deployed` (C2) in a commissioned
   career, or only on malformed saves?
4. Storage-full timing in a real match with one HQ and no silos — confirm
   the coach appears on the rail, not only in FEED (H3 + M7).
5. Purge / Pale Bloom: after killing commanders with hives up, does anything
   on the HUD imply the match should have ended (H5)?
6. Doubled loaders: still ~32 s + ~27 s on this tree (L2)?
7. Physical phone: safe areas, AAC, PWA install, Android OTA probation
   (Stages 14 / 18). Last phone-accepted release in older status docs is
   **1.33.58**; that number was not re-verified here.
8. Live Worker: is `realtimeMatch` on for playtest accounts right now?
9. Stage 12 high-unit frame tail — current p95/p99 on this tree unknown.
10. Apple Safari PWA contract (viewport-fit, standalone, gesture unlock) —
    not exercised.

---

## 6. Recommended next fixes (player impact)

1. **Unify the UGA “done” spine (H1, then H7 / M3).** Until Command Core,
   brood gates, and region control agree, every new planet or timer is
   decoration. Derive readiness from `deriveGroundControl()`; keep pointing
   at a region that is 1/3 or 2/3.
2. **Sim-halt pause UI (C1).** Small change, prevents a silent post-crash
   lock the moment something throws again.
3. **Pending-op hydrate (C2).** Preserve or explicitly abandon. Do not
   orphan deployed personnel.
4. **Storage caps and/or a visible sink (H3).** Highest-frequency “the
   economy is broken” report; coaching already tells the truth.
5. **Honest mode doors (H6, H8).** Host-route Campaign from UGA *or* mark
   both doors the same; strip rewards off locked MMO / Co-op cards.

After those five: AI real wallets (H4) as a flagged balance experiment;
purge victory rule (H5); scan → hangar (M2); Nova copy + `domain.test.mjs`
(M6).

---

## Appendix A — Static checks run (2026-09-13)

| Gate | Result |
|---|---|
| `tools/test-room-upgrades-have-effects.mjs` | PASS (33/33, XP cap 45% fitted) |
| `tools/test-uga-command-opens-in-space.mjs` | PASS |
| `tools/test-notice-feed-badge.mjs` | PASS |
| `tools/test-levelup-cannot-deadlock.mjs` | PASS |
| `tools/test-sim-failure-reporting.mjs` | PASS (latch contract; not pause UX) |
| `tools/test-uga-tactical-profiles.mjs` | PASS |
| `tools/test-uga-deployment-bridge.mjs` | PASS (18 landing zones; doctrines map) |
| `tools/test-galactic-wartable-routing.mjs` | PASS |
| `tools/test-career-faction-gate.mjs` | PASS |
| `tools/test-onboarding-foundation.mjs` | PASS |
| `tools/test-save-persist.mjs` | PASS |
| `modules/space_exploration/tests/domain.test.mjs` | **FAIL** — expects `Nova Coalition`, catalog is `Terran Frontline Command` |

Not run: Playwright/GPU probes, `node tools/bundle.mjs` (no source change),
pack/APK.

---

## Appendix B — Recently fixed (do not re-open from old reviews)

These were real and are **closed in current source**. Older audits that still
list them are stale.

| Item | Where it was closed |
|---|---|
| Level-up chooser can freeze a match (`paused` before DOM) | `commander.js` `showLevelUp()` — pause last; empty chooser bails |
| `heroXP()` unguarded `#levelUp` | `commander.js` |
| Sim halt not sticky / not cleared on new match | `main.js` latch + `resetWorld()` |
| Dropship double-deploy on resume | `deployCarrier()` `if(matchLive) return` |
| Economy coaching at `MF_N_INFO` never on-screen | `hudflow.js` `showCoach` → `MF_N_ORDER` |
| FEED badge counted submissions; no match reset | `hudflow.js` unread rows + `mfNoticeMatchReset()` |
| Coaching cooldowns leaked across matches | `hud.js` `mfCoachMatchReset()` from `resetWorld()` |
| Player faction name resolved to Syndicate | `src/faction-id.js` + catalog `Terran Frontline Command` |
| UGA COMMAND and DEPLOY both opened `campaign_hub` | `#ugaBtn` → `system` |
| Four rooms had no work panel | `roomWorkBody()` routes engineering / hangar / fabricator / navigation |
| Socket modules drew power only | `effects` on all 33 + `calculateFacilityCapabilities` |
| Survival unlimited had no win | `checkVictory()` siege-broken |
| No MOVE order (`ustate===1` unwritten) | `src/ui/input.js` `moveMode` + double-tap retreat |
| Slot reuse without generation | `ugen` / `liveTgt` in `sim.js` |
| Factory paid then silently discarded at pop cap | `sim.js` pause-before-pay |

---

## Appendix C — Orientation constants

```
FRONT_SCREEN_IDS          src/main.js
MF_GALAXY_STAGES          src/galaxyui.js          galaxy|system|planet|region|deploy
SCENES                    space_experience.js     system|survey|galaxy|uga
PLANETS                   src/engine/gl.js        4 homeworlds, 16 regions, 48 maps
UGA_GROUND_AREA_CATALOG   catalog.js              9 areas, 27 maps
MISSION_CATALOG           catalog.js              9 missions
ENTRY_KEY                 massfront.galactic.entry.v1
PACKAGED_REV              boot.js                 1.33.88
```
