# MASSFRONT review — 2026-09-01

Written after a working session that shipped v1.33.63, v1.33.64 and v1.33.65.
Everything below is either measured or read directly from the source. Where I
did not measure something, it says so.

## What this review is based on

- **119 static tests run** (`tools/test-*.mjs`, `tools/verify-*.mjs` that do not
  drive a browser): **91 pass, 28 fail**.
- **71 browser-driving tests run** on the hardware GPU: **27 pass, 44 fail**.
  The first attempt reported 20/71 and was discarded — it ran without the dev
  server on :8100 that 23 of those tools require. Re-running the failures with
  the server up recovered 7; the remaining 44 are genuine.
- **Three new real-browser probes written and run** (`probe-hud-flicker`,
  `probe-boot-recovery`, `probe-live-ota`).
- **Direct reading** of `boot.js`, `src/updater.js`, `src/launcher.js`,
  `src/authportal.js`, `src/offline.js`, `src/ui/hudflow.js`,
  `src/ui/cinematic-hud.js`, `tools/publish-hf-release.ps1`.
- **Live endpoint probing** of Hugging Face, the Cloudflare worker and the Space.

**Combined suite health: 118 of 190 pass (62%).**

**Not covered:** gameplay balance, audio mixing, live multiplayer against a
second human, iOS, and long-session memory/thermals. Treat those as unknown,
not as passing.

---

## 1. The update system — the honest verdict

**The core is genuinely good, and better than I expected before reading it.**

Verified working:

- Manifest loading tries **five independent sources**, picks the numerically
  newest, and refuses mirrors that disagree on bytes for the same version.
- Endpoint resolution falls back to a hard-coded official manifest, so a damaged
  or missing `update-config.json` cannot permanently disable updates.
- Every request is timeout-bounded (12s connect / 15s read native, 16s abort on
  fetch), so no path can hang forever.
- Publishing uploads immutable bytes first and **activates last**, with pinned
  Range verification before the live manifest moves.
- **`boot.js` recovers from every damaged update state I could construct.** New
  probe `tools/probe-boot-recovery.mjs` writes ten broken record sets into real
  IndexedDB — junk `active`, schema-3 records with bad or mismatched roots, an
  orphan probation, a stranded apply lease, a dangling rollback pointer, a torn
  pending write, and all of them at once — reloads, and the game still boots the
  packaged build every time without adopting any of the junk. **10/10.**

This is the first time that property has been proven against real IndexedDB
rather than a `node:vm` stand-in.

### What was actually broken (all fixed and shipped)

| Defect | Effect | Shipped |
|---|---|---|
| Legacy-boot Apply refused | shells ≤ v1.33.56 could not install any update | 1.33.63 |
| Launcher lockout | identity stuck `pending` left **no usable control at all** | 1.33.64 |
| Identity never resolved | four paths left `pending` with nothing scheduled to retry | 1.33.64 |
| `navigator.onLine` treated as truth | a WebView false negative permanently killed updates | 1.33.64 |

### What is still weak

1. **Publishing is three steps and only one is scripted.**
   `publish-hf-release.ps1` writes Hugging Face and exits 0. Cloudflare is a
   separate `mirror-release-to-cloudflare.mjs` run. The Space is a third upload.
   v1.33.63 shipped with HF on the new version and Cloudflare a version behind.
   Mitigated by the new `tools/verify-release-channels.mjs`, but **nothing
   enforces the order** — the guard only tells you afterwards.

2. **The Cloudflare mirror has no retry.** It failed twice today: once on a
   transient wrangler `r2 object put`, once because a `taskkill` caught it. Both
   times it correctly did *not* activate (latest.json is written last), so the
   fail-safe is right — but a 113-file upload with zero retry will keep failing.

3. **No manifest signing.** Hashes prove integrity, not authorship. A compromised
   release account could publish a valid-looking update. Already logged as P0.5
   in `REMAINING_WORK.md`; still open.

4. **`update-config.json` ships only in the APK.** A build with a bad endpoint
   can never be repaired over the air. The hard-coded fallback covers this in
   practice, but it is a single point of failure by construction.

5. **The delivery boundary is narrow and worth internalising:** the OTA channel
   carries **JavaScript only** — 113 files, all `.js`. No CSS, no `index.html`,
   no `boot.js`, no `sw.js`, no `update-config.json`. Every styling or DOM
   structure change therefore requires a new APK.

---

## 2. The whole-HUD flicker — found, measured, fixed

**Cause:** `mfCinematicEnsureStructure()` in `src/ui/cinematic-hud.js` ran on
every sync and called `classList.add('mfCinematicCommander')` on `#heroBar` and
`classList.add('mfCinematicCommandDock')` on `#cmdbar` **unconditionally**.
Adding a class an element already carries still produces an attribute mutation
record, which re-triggered `mfCinematicWatch` → `mfCinematicQueueSync` → rAF →
the same writes. A self-sustaining loop.

**Measured on hardware, in a live match** (`tools/probe-hud-flicker.mjs`):

| | mutations/sec | heroBar | cmdbar |
|---|---|---|---|
| Before | 87 peak / 68 mean | 166 | 166 |
| After | **3 peak / 2 mean** | 0 | 0 |

Shipped in v1.33.65.

**The general lesson, which matters beyond this bug:** `el.style.x = same` is
free — browsers skip it, and I verified that directly. `classList.add` and
`setAttribute` are **not** skipped. Any redundant call feeds every observer
watching that element.

**This class of bug is not exhausted.** `cinematic-hud.js` still has 49
`setAttribute` and 22 `classList.add` calls with only 34 guards; `hud.js` has 47
`setAttribute` with 7 guards. There is already a comment in `cinematic-hud.js`
about killing a previous 60 Hz loop, which means this is the *second* one found
in that file. A systematic pass with the probe as the gate is warranted.

---

## 3. Test health — 91/119 static, with real clusters

The 28 failures are not noise. They group cleanly:

### Faction art and identity (11 failures) — the largest cluster
`faction-doctrines`, `faction-identity-contract`, `faction-model-exclusivity`,
`faction-rhino-identity`, `faction-structure-distinctiveness`, `faction-tech`,
`models-machine`, `models-infestation`, `nova-conversion-stage1`,
`legion-conversion-stage2`, `syndicate-conversion-stage3`, `unit-art-tranche`,
`defense-role-integrity`.

Representative messages, quoted from the runs:
- "thumbnail fallback does not enforce faction ownership" — **one faction can
  display another faction's art**
- "Blue slot 1 lacks Nova painted composite" — faction repaint incomplete
- "wall: insufficient material zoning (3)" — art quality gate unmet
- "Pyro: runtime scale changed" — an art regression against a recorded baseline
- "Syndicate production must gate pure AA against an actual air threat" — an
  actual **AI/production logic** gap, not art

**Honest read:** the faction visual identity programme is partially converted
and the tests are correctly reporting it. This is the single biggest body of
unfinished work in the game.

### Galactic layer (2)
`galactic-wartable-routing`, `stage9-galactic-bridge`.

### Stage 10 world content (4)
`verify-stage10-layouts`, `verify-stage10-model-review-gallery`,
`verify-stage10-repaired-model-pack`, `verify-stage9-location-plans`,
`verify-stage9-location-grammar`.

### Broken harnesses, not broken game (3)
- `verify-sim-combat-fixes` — `unitTick is not defined`
- `verify-econ-seats` — `window is not defined`
- `test-stage7-input-cancel` — `s2w is not defined`

These test *nothing* in their current state. They pass no signal either way and
should be repaired or deleted; leaving them failing trains everyone to ignore
the suite.

### Browser suite — 44 failures, and they are about the playable game

The static suite mostly checks contracts and data. The browser suite drives the
real game, and it is where the product's condition actually shows. Verified
examples, quoted from the runs:

- **`test-airlift-transport`** — the UNLOAD control renders **0x0** while
  correctly labelled and enabled: `{"w":0,"h":0,"display":"flex","disabled":false,
  "label":"Unload Skycrane cargo, 4 of 12 slots used"}`. Present, invisible,
  untappable. Same class as the clipped PLAY OFFLINE and the clipped dock tabs —
  this is now the third confirmed instance of controls that exist but cannot be
  hit, which makes it a pattern rather than three coincidences.
- **`test-campaign-prologue`** — the mission preset never reaches the setup UI:
  active mission `mosswatch-breach`, map shown "Parade Circumference".
- **`test-artillery-barrage`** — barrage targets overlap instead of spreading.
- **`test-city-combat-surface`** — "no relic pad to flatten", "collapse left no
  type-4 civic flames", "soil deform punched civic height".
- **`test-cloud-playtest`** and **`test-inventory-loadout`** — both stall behind
  `body.mfLauncherGate` with `front: updScr`; the launcher never hands off, so
  every downstream screen measures `h:0`. **Confirmed pre-existing**: both fail
  identically against the published v1.33.63 launcher, which predates this
  session's launcher changes.

Fast-failing tests (7-10s) dominate, which means these are assertion failures
reached quickly, not timeouts or flakiness.

### Stale fingerprint test (1)
`test-v133-second-pass` asserts exact source literals
(`battlefieldPreset='large';deploymentPackage='prepared'`,
`cv3.width=192; cv3.height=120`) that are absent at committed HEAD too. It has
been failing for a long time and is not a regression signal.

---

## 4. Space Exploration module — built, and unreachable

This is the starkest finding in the review.

**What exists:** 60 source files, 13 tests, **330 unique GLB models** (327 in
`world-models`, 3 in `models`), 51 webp textures, a full domain layer
(commander catalog, progression, ground operations, host contracts).

**What ships: nothing.** `www/modules/` is empty. The publisher does not merely
omit it — it **asserts the module is absent** and fails the release if it leaks
in:

```
Need (-not (Test-Path 'www\modules\space_exploration\index.html'))
  'Base www unexpectedly contains the optional Galactic pack;
   publish it through the typed pack pipeline instead.'
```

**And the pipeline it defers to is not wired.** `assets/packs/packs.json`
contains exactly two packs — `music` and `voice`. There is no exploration pack
entry, so the launcher's "Optional Downloads" section cannot offer it. An older
`exploration-pack` folder exists on Hugging Face but nothing in the shipped
build points at it.

**Honest take:** a large, genuinely substantial body of content is finished
enough to have 735 source GLBs and its own test suite, and **no player can reach
any of it**. Either wire the optional-pack manifest and ship it, or stop
investing in it until the delivery path exists. The current state is the worst
of both — carrying the cost without any of the benefit.

(On the count: 382 files sit under `assets/runtime`, of which 330 are GLB and 51
webp. If your 320 figure comes from an admitted-model catalog rather than the
directory, those are different measures and both can be right — I could not find
a runtime catalog that resolves to 320, so I am reporting what is on disk.)

---

## 5. Quality-of-life issues observed

- **HUD dock tab labels were clipped.** Measured at 412 px: each tab gets 78 px,
  `PLATOONS` needed 81 px, and `BUILDINGS` only fitted because it was pinned to
  a one-off 7 px against its neighbours' 9 px. Cause: a shared typography rule
  (`.settingsNav .screenTabBtn, .setupTabBtn, .hudDeckBtn{font-size:.5625rem}`)
  appended later in the stylesheet silently overrode the portrait sizing.
  **Fixed locally, not shipped** — it is CSS, so it needs an APK.
- **`COMMAND NOTICE` truncates mid-word** ("research a Targeting Arr…"). The
  banner has no expansion affordance, so the instruction is unreadable.
- **Dock tabs are 38 px tall**, below the 44 px touch-target minimum the
  stylesheet itself sets elsewhere. Pre-existing.
- **`PREVIEW · SOON` is a dead control.** No preview endpoint is configured
  (`update-config.json` has no `channels` key), so the button exists purely to
  be disabled. Either wire it or remove it.
- **Launcher hero art bleeds off-canvas**, clipping the logo mid-word, and the
  three-line headline collides with it at 412 px.
- **`v—` placeholder chips** render before data arrives, which reads as broken
  rather than loading.

---

## 6. Repository and process risks

**1. Three runtime-critical files are not in git.**

```
src/launcher.js
src/ui/cinematic-hud.js
src/ui/unit-stack-hotbar.js
```

They are not gitignored — they were simply never `git add`ed.
`verify-clean-checkout` has been failing on this. **Two of them contain fixes
shipped to players today** (the launcher lockout repair and the flicker repair)
and exist nowhere but this working tree. A clean checkout produces a broken
game; a disk loss loses shipped work. This is the highest-severity item in the
review and it takes one command to fix.

**2. `APP_NOTES` is a manual step with no gate.** The publisher stamps every
version surface from `-Version` but never touches `APP_NOTES`, which is why it
sat on v1.33.60 Overhaul text through two releases. It should either be a
publisher parameter or be asserted against `-Notes`.

**3. 387 uncommitted paths.** The working tree carries a very large amount of
uncommitted change, which makes bisecting any regression impractical.

---

## 7. Honest overall take

**The engineering under the update system is better than the product's surface
suggests.** Five-source manifest resolution, activation-last publishing, pinned
Range verification, and a boot path that survived every fault I could inject are
not typical. That part is close to done.

**The failures are concentrated in two places:** unfinished faction art identity
(the largest cluster of real test failures), and a delivery gap that leaves a
whole finished module unreachable.

**The recurring pattern worth naming:** several serious defects this session
survived because the tests around them asserted the wrong thing. The updater
suite passed with an entire fix deleted. `test-launcher-gateway` asserted the
*buggy* line as a contract, so fixing the bug broke the test. Three verifiers
crash before asserting anything. The suite is large and looks reassuring, and in
these specific places it was not measuring what it claimed. Mutation-testing
every fix — deleting it and confirming the suite fails — caught this repeatedly
and should be standard for anything shipped.

**On my own accuracy:** I got the flicker cause wrong twice before measuring it
(first `showHazChip`, then `hudflow`'s mute). Both were plausible from reading
the code and both were wrong. The probe settled it in one run. Where this review
states a cause, it was measured.

---

## 8. Recommended order

1. **`git add` the three untracked runtime files.** One command; removes the
   largest single risk in the repo.
2. **Repair or delete the three crashing verifiers.** A suite with known-dead
   tests erodes trust in the rest of it.
3. **Sweep the redundant-write class** using `tools/probe-hud-flicker.mjs` as
   the gate — `cinematic-hud.js` and `hud.js` both still carry the pattern.
4. **Decide on Space Exploration.** Wire the optional-pack manifest and ship it,
   or shelve it explicitly. Not both.
5. **Close the faction art identity cluster**, or reclassify those tests if the
   contract has legitimately changed.
6. **Batch the GUI/CSS work into one APK** — dock tabs, notice truncation, hero
   art bleed, touch targets, `v—` placeholders, and the dead PREVIEW control.
7. **Make the publish sequence one command** that runs HF → Cloudflare → Space →
   `verify-release-channels`, with retry on the mirror.
8. **Manifest signing** (already P0.5).
