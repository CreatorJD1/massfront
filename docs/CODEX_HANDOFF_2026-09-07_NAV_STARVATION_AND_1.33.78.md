# Codex handoff — MASSFRONT nav starvation repair and the blocked v1.33.78 hotfix

Prepared 2026-09-07 PDT. This handoff records a **reproduced gameplay regression, its
repair, and a release that is built but blocked**. It is not authorization to publish.
Everything below was measured on hardware GPU (ANGLE D3D11, RTX 4060 Laptop), never
SwiftShader.

## Start here

Physical checkout: `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`
Branch `cursor/strip-mass-node-bloom`. HEAD is `97f6b77` — *"Stop starving the flow fields
that every ground order depends on"*.

Read `AGENTS.md` first. The five rules there still hold; in particular this repair touched
`src/game/sim.js`, so `node tools/bundle.mjs` is the syntax gate that must pass after every
edit.

**Three facts that will save you an hour:**

1. **The tree is version-bumped to 1.33.78 but no such release exists.** A publish attempt
   ran, bumped the six version files, and then failed. `update.json` correctly still reads
   `1.33.77`. See *The blocked hotfix* below before you build anything.
2. **This is a shared dirty checkout with concurrent sessions.** During this work another
   live session was editing `src/game/sim.js` and `src/ui/input.js` at the same time. Check
   `find src -name '*.js' -newermt '-10 minutes'` before you assume the tree is yours.
3. **A zero in a headless check is usually the harness.** Two measurements in this session
   read as failures and were the probe's own naive metric, not the game. Suspect the test
   first.

## What was broken, and the evidence

Commit `f5c4122` made flow-field builds incremental. The slicer was given a budget it could
never spend, and three faults compounded:

- `requestField()` began defaulting to `defer=true`, so **every** caller — simulation, AI,
  factory production — received a field with no directions. The comment above that line
  still claimed the opposite ("Simulation/AI callers retain the historical synchronous
  freshness contract"), which is the clearest tell that the default was not intended.
- One job built at a time. A 384×384 field is ~295,000 visited cells; at
  `MF_NAV_CELLS_PER_TICK = 8192` that is ~36 fixed ticks, about 1.2 s, serialized.
- Every `mfNavInvalidate` — a foundation crossing 15 % progress, a rock collapsing, a
  shoreline flood — called `mfNavCancelBuilds()`, which **destroyed the in-flight job and
  emptied the queue**.

Measured in a live match before the repair:

| metric | value |
| --- | --- |
| flow-field builds published | 5 |
| builds cancelled | **11** |
| nav invalidations in 12 s | 46 |
| distance an ordered 12-unit column travelled in 12 s | **41 world units** |

Every symptom the owner reported falls out of that one hole:

- **Units and the commander "no longer animate" on an order.** A unit whose field has no
  directions and no clear direct line takes the `mvx=0; mvy=0; moving=false` branch in
  `unitTick`. They were not failing to animate; they were standing still.
- **"Nav line is always straight regardless of direction."** `moveFxTrace`
  (`src/ui/orderfx.js`) walks `F.dirs`. With no directions it emits `[start, goal]` — a
  two-point beeline — whatever the terrain.
- **Rally placement.** Factory production called `requestField` and got a deferred field, so
  new units never walked to the flag.
- **AI attacks never arriving** is the same starvation seen from the other side.

## What the repair does

Four changes, none of which restore the frame hitch that slicing was added to remove:

1. `mfNavRestampBuilds()` replaces `mfNavCancelBuilds()`. Invalidation restamps the queue
   instead of discarding it. Each job owns a snapshot clearance grid — `mfNavBuildClearance`
   allocates a fresh `Uint16Array` every call — so finishing against the older revision is
   self-consistent.
2. `mfNavFinishJob` **publishes, then re-queues the refresh**. Directions one revision old
   are a usable route; discarding them is what stranded the army.
3. `mfNavBuildNow(F)`: a field with **no** directions is a cache miss, not a refresh, so it
   floods synchronously — still capped at one full flood per fixed tick by `mfNavBuildTick`.
   A player order answers with a real route on the frame it is given.
4. The movement consumer walks published directions **regardless of their age**. Requiring
   `F.rev === mfMoveBlockRevision` froze every marching unit the moment a foundation crossed
   15 %, because the replacement cannot land on the tick that invalidated it.

`MF_NAV_CELLS_PER_TICK` is now 32768.

Rally is now the order rather than a suggestion: `mfFactoryRallyGoal` uses the marker
exactly instead of jittering inside a 52 wu square, and an opposing human seat owns its
factories too. Separately, `endPtr` in `src/ui/input.js` rebuilt `orderConfirm` without
`noLine`, putting the straight centroid→destination beam on the ground beside the traced
route — that is the **doubled, differently-coloured order line** the owner reported.

### Determinism

All of this is keyed on `tick` and a fixed cell budget, never wall-clock, so two peers
publish a field on the same authoritative tick regardless of CPU speed. `mfNavBuildNow`'s
one-per-tick cap is `mfNavBuildTick === tick`. Lockstep is preserved. Do not "optimise" any
of these into a time-based budget.

### Verification

| probe | result |
| --- | --- |
| `node tools/probe-nav-field-publish.mjs` | 0 cancelled, 0 pending; columns at their full 21 wu/s (420 wu in 20 s) |
| `node tools/probe-rally-placement.mjs` | button arms, flag lands exactly on the tap (`rallyError: 0`), produced units march — 643 wu closed |
| ad-hoc wall test | 15 structures across the direct line; traced route is **150 points, 1113 wu arc against an 820 wu chord, peaking 361 wu off the straight line** |

That last one is the direct refutation of "the line is always straight": the broken build
emitted 2 points, the repaired build traces 150 through the field and detours around the
obstruction.

## The blocked hotfix

The owner asked for "the normal hotfix". This is an OTA-only JavaScript change — no CSS,
no DOM, no `index.html` — which is exactly the shape `docs/RELEASE_STATUS.md` describes as
OTA-only, and `-PatchFrom` makes the publisher skip the Android toolchain and APK entirely
("Devices keep the installer they already have").

Command attempted:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish-hf-release.ps1 `
  -Version 1.33.78 -Category hotfix -PatchFrom 1.33.77 -Notes "<player-facing notes>" -PrepareOnly
```

**These gates passed:** workspace writer-check, updater range-retry contract, bundle syntax
gate (113 sources), web staging (`www/` 283.4 MiB, Galactic base pack 457 files / 140.78 MiB).

**It then failed at `Build OTA patch`:**

```
tools/bundle-update.mjs:38
Error: OTA Galactic delivery descriptor is not bound to this release
```

`assets/data/exploration-pack-remote.json` is pinned to `version: "1.33.77"` with
`base: https://massfront-update.jasondixon1994.workers.dev/f/1.33.77/content-r1/`, and
`bundle-update.mjs` requires `explorationDelivery.version === version`. The Galactic
exploration content pack is namespaced **per release version**, so cutting 1.33.78 requires
that pack to exist under `/f/1.33.78/`.

**This is a genuine decision, not a bug to route around. Do not simply edit the version
field in the descriptor** — the content lives at the 1.33.77 path and devices would 404.
`contentObjectKey` in `tools/mirror-exploration-content-to-cloudflare.mjs` independently
enforces `base.pathname === /f/<version>/content-r<n>/`, so a hand-edited descriptor fails
there too.

The realistic options, for the owner to choose:

1. **Mirror the exploration content into the 1.33.78 namespace** and rebind the descriptor
   (`tools/mirror-exploration-content-to-cloudflare.mjs --version 1.33.78 --apply`). Costs a
   ~140 MiB upload. The mirror has no retry and has failed before succeeding in the past.
2. **Cut the hotfix from a tree that predates the exploration-pack work**, so the descriptor
   question does not arise — but the local exploration pack is mid-optimisation and
   uncommitted, so this needs a clean branch off the 1.33.77 release state plus `97f6b77`.
3. **Fold the nav repair into the next planned content/overhaul release** rather than
   hotfixing, accepting that players stay on broken navigation until then.

### Why this matters beyond the descriptor

A publish from the current tree would also ship **other sessions' unfinished work**. Real
code deltas against the shipped 1.33.77 tree include `src/galactic-operations.js` (+2828
bytes), `src/main.js` (+1765), `src/ui/hud.js` (−17841), `src/assetpack.js`, `src/audio.js`,
plus 69 new `modules/space_exploration/**` files. Confirm what is intended to ship before
activating anything.

Ignore the uniform **−49 byte** deltas when comparing `www/` against `releases/staging-*`:
that is the publisher's release stamp. Likewise the multi-megabyte deltas on
`src/engine/gl.js`, `materials.js`, `macrofx.js` and `volfx.js` are build-form differences
(the release tree inlines atlases), not changes.

### Current tree state

The failed publish left the six bumped files modified and `update.json` untouched:

```
M assets/app.webmanifest   M boot.js       M index.html
M package.json             M src/updater.js  M sw.js
```

`package.json` reads `1.33.78`; `update.json` reads `1.33.77`. No verification freeze lease
is held (`node tools/evidence-foundation/workspace-guard.mjs check-write` → PASS). To abandon
1.33.78: `git checkout -- boot.js sw.js src/updater.js package.json index.html assets/app.webmanifest`.

## Environment repair worth keeping

`tools/publish-hf-release.ps1` needs the `hf` CLI and **there is no launcher on this
machine** — `huggingface_hub` 1.27.0 is installed under `C:\Python313` but pip never wrote a
console script, and `C:\Python313\Scripts` is not writable without elevation.

A shim was created at `C:\Users\Jason\bin\hf.cmd`:

```
@echo off
"C:\Python313\python.exe" -m huggingface_hub.cli.hf %*
```

The publisher honours `$env:HF_CLI`, so set `$env:HF_CLI = 'C:\Users\Jason\bin\hf.cmd'`
before invoking it. That directory is **not** on PATH — either add it or keep using the
environment variable. Auth is live: `hf auth whoami` → `user=CREATORJD`. Note the subcommand
is `hf auth whoami`, not `hf whoami`, in this version.

Also: `pwsh` is **not** installed. `docs/RELEASE_STATUS.md` shows `pwsh -File ...`; use
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...` instead.

## Still open — not started

These were reported by the owner in the same session and are **not** fixed.

### 1. Planet scanning is decorative

`modules/space_exploration/src/space_experience.js`, `launchProbe()`:

```js
const next = surveyEntries().find(entry => !state.surveys[entry.id].depleted);
const result = deployProbe(state, next.id);        // reward granted here
if (planetarySurvey) planetarySurvey.launchProbe(); // animation played afterwards
```

The reward is taken from a catalog list **in order**. Aim, signal strength and probe flight
are cosmetic — which is exactly the owner's complaint that "all you do is tap your screen
and it scans", unlike Mass Effect 2 where a strong signal must be found before a probe is
worth spending.

The real mechanic **already exists and is simply never consulted**:
`modules/space_exploration/src/systems/planetary_survey.js` has `sensorThreshold = 76`,
`nearestDeposit()`, `calculateSignalStrength()` and `evaluateAim()` returning
`{hit, miss, signal, threshold, deposit}`, and `launchProbe()` already refuses to extract
below threshold.

The two halves were authored in **separate id spaces** and never joined:
`planet.mineralDeposits[].id` gives `caldris_alloy_shelf`, `ithara_embassy_signal`,
`orison_drive_fragment`…, while `SURVEY_CATALOG` keys are `aelos_traffic_census`,
`veyra_photon_ring`, `karak_hive_scan`… Each system has exactly two authored survey entries
and its planets carry two to three deposits, so a binding is feasible.

The owner's chosen behaviour is **signal gates the launch**: the LAUNCH button stays disabled
until the reticle finds a peak at or above threshold, and probes are *not* wasted on a miss.
Suggested shape, keeping the domain pure:

- Add `surveyId` to the deposits in `showcase_systems.js` so a site names the discovery it
  resolves — do not make `domain/catalog.js` reach into `systems/`, that inverts the
  dependency.
- Gate `btnSurveyLaunchProbe` on `planetarySurvey.signalPct >= sensorThreshold` alongside the
  existing eligibility and probe count. The oscilloscope loop already reads `signalPct` every
  frame, so the button can light up live as the player sweeps.
- On press, call `planetarySurvey.launchProbe()` **first** and resolve the reward from the
  deposit it returns, rather than from `surveyEntries()[0]`.
- `$('survSigVal')` currently shows `LOCKED`/`BLOCKED`/`ARCHIVED`. Show the live signal
  percentage instead — the player needs something to hunt.

`deployProbe(state, surveyId)` in `domain/progression.js` is a clean pure transition and
should not need changing for the gated design; it already consumes `probeCost` and grants the
discovery, story step and intelligence.

### 2. UGA content is not wired into the base game

Reported and confirmed only at the level of the earlier symptom list, **not yet
investigated**: sub-menus and main-menu items are not connected, space navigation does not
match the War Table's planets, and last-played location is not carried across. Relevant
surfaces are `src/galaxyui.js`, `src/galactic-operations.js`,
`modules/space_exploration/src/ui/campaign_hub_registry.js` and
`modules/space_exploration/src/space_experience.js` (`setScene`, `SHOWCASE_SYSTEMS`,
`state.route.systemId`). Note `surveyEntries()` filters by **system**, while the survey modal
displays a single **planet** — that mismatch is likely part of the same seam.

## Probes worth reusing

- `tools/probe-nav-field-publish.mjs` — does a field ever publish, and does an ordered
  column actually travel.
- `tools/probe-rally-placement.mjs` — the whole player-visible rally path: arm the real
  button, tap the map, produce a unit, march it.
- `tools/probe-navigation-blockers.mjs` — synthetic PASS/NAVW masks for clearance, water and
  cache-invalidation contracts.

All three serve the **repo root**, not `www/`, so they test live source and sidestep the
"dev server serves `www/`" trap. Any probe that serves `www/` needs `node tools/pack-www.mjs`
first or it silently tests stale code.

---

Prepared by Claude Opus 5. No release was published, no device was touched, and no
outward-facing mutation was performed.
