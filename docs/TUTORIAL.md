# The tutorial — KEEL

Runtime ownership remains isolated to `src/tutorial.js` and
`src/styles/tutorial.css`, self-booting through `initTutorial()`. Regression
drivers live under `tools/test-training-*.mjs`; screenshots live under
`releases/training-operation/`. See **Integration seams** for how the runtime
extends the game without editing its HUD or frame loop.

---

## KEEL

Ship liaison intelligence, carrier *Lance of Morning* — the same carrier the
dispatches in `src/story.js` already named. Not a mentor character, not a
mascot: a shipboard system that was doing this job for five other commanders
before you and will do it for whoever comes after. It talks the way the
dispatches read — short, declarative, no cheerleading, dry rather than warm —
because it is meant to sit in the same voice as the rest of the game's
writing, not announce itself as a separate "tutorial mode."

Rules for anyone adding a line later:

* No exclamation points as reward. "Nice crater" lands harder than "Great job!"
  because it treats the player as competent.
* React to what happened, don't restate it. `src/ui/hud.js`'s `coachTick()`
  already has the mechanical "LOW ENERGY — build a Reactor" message; KEEL's
  low-power line never repeats that instruction, it only ever comments on the
  situation.
* One canonical line per tutorial step (consistency beats novelty when
  someone is actually trying to learn a control scheme). Reactive barks that a
  returning player will hear many times over a career get two or three
  variants instead, picked at random, so they don't wear out.
* Reference real UI labels. "Tap 🏗 BUILD → ⛏ ECONOMY → Extractor" uses the
  exact button/tab names in `src/ui/hud.js`'s `renderBuildMenu()` /
  `BCAT`, not a paraphrase.

All copy lives in one block at the top of `src/tutorial.js` (`GREETING`,
`STEPS[].say`/`.done`, `GRADUATION`, `SKIP_LINE`, and the reactive line
banks) so the voice stays in one place instead of scattered through the
engine code below it.

---

## The 19 objectives

Shown one at a time in a protected Easy operation. Most gates read real game
state; three short explanation gates use a clearly labelled action button.
Every objective also highlights its current control or places a gold cue in
the world.

| # | id | gate (real state) | what it teaches |
|---|----|--------------------|------------------|
| 1 | `camera` | pan/zoom/rotation changes from the starting camera | drag, pinch, VIEW rotation and minimap navigation |
| 2 | `deploy` | `matchLive === true` | fly the faction carrier to valid ground and deploy |
| 3 | `commander` | the live Commander is selected | hero identity, CDR shortcut and defeat condition |
| 4 | `pickup` | the training cache is collected through `applyCrate()` | resources, repairs, scans, veterancy and strike-code pickups |
| 5 | `mex` | a player Extractor exists | mass deposits and hologram placement |
| 6 | `power` | a player Reactor or Geothermal exists | energy supply and stalled production |
| 7 | `fac` | a player Factory exists | the army's barracks / vehicle-production role |
| 8 | `territory` | player taps `GOT IT` | blue build grid, mobile builder zones, anchors and silos |
| 9 | `queue` | a player production queue is non-empty | unit cards and production queues |
| 10 | `train` | a new combat unit exists and is selected | ARMY selection and unit role / ammo information |
| 11 | `turret` | a player Sentinel exists | perimeter-first defence and tower role |
| 12 | `platoon` | a live control group is saved | hold-to-save / tap-to-recall platoons |
| 13 | `formation` | a formation confirmation hologram exists | drag-and-release formation placement and spacing |
| 14 | `attack` | a selected combat platoon receives attack-move | engagement orders and green/red matchup chips |
| 15 | `fog` | the supplied scout moves 115 world units | black fog, remembered grey terrain and sensor coverage |
| 16 | `tech` | a player Research Complex exists | field research, shield buffer and account-level Data |
| 17 | `ability` | a Commander cooldown starts | POWERS, energy cost and targeted BLAST |
| 18 | `objective` | player taps `CALL EXTRACTION` | operation objectives, rewards and extraction |
| 19 | `cloud` | player taps `FINISH TRAINING` | local autosave, cloud comparison and portable `.mfsave` |

The training mission pauses scripted attack clocks, disables Infestation and
timers, keeps a resource floor, protects the Commander/HQ from accidental
early loss, and grants the training-only rank needed to place the Research
Complex. None of those rules leak back into normal skirmish setup.

### Why every step is checked every tick, not just the current one

`evalSteps()` doesn't only test the step on screen — it tests **every
incomplete step, every poll**, and marks each one `done` the moment its
condition is real, regardless of what's currently displayed. A player who
queues a unit before their power plant finishes, or wins a fight with their
starting Commander before ever opening the build menu, doesn't stall the
tutorial: those steps are silently marked complete, and the displayed
instruction fast-forwards to the first one that genuinely isn't. Only the
step that *was* on screen when it completed gets a spoken "done" line — a
step finished out of order completes quietly, which is what stops a
mid-match state refresh from reading off nineteen congratulations in a
row for things the player did ten minutes ago.

### `queue` is a live check, not a memory

Unlike the other structure steps, "queue a unit" tests whether a production
queue is non-empty *right now*. A queued unit stays at `B.queue[0]` for its
full build time (minimum 1.1s — see `TYPES[0].bt`), which is far longer than
this module's own 350ms poll, so the check never misses it. But it also means
the condition can become false again once the queue empties — which is
correct: if a mid-match replay lands back on this step, "queue a unit" really
does mean queue another one. That's two taps, not a chore, and it means the
step is never lying about whether a production line is actually moving.

---

## Reactive narration (beyond the tutorial)

Five triggers, independent of tutorial state, each **at most once per
match**:

| trigger | polls | line bank |
|---|---|---|
| first base attack | `alarmT` (set by `baseAlarm()` in `src/game/sim.js`) changing | `BASE_ATTACK_LINES` |
| low power | `stallE` (in `src/game/economy.js`) going positive | `LOW_POWER_LINE` |
| hazard incoming | `HAZ.warn` (in `src/hazards.js`) going positive | `HAZARD_LINES`, keyed by `curMap` |
| first unit lost | `stats.kills[1]` or `stats.kills[2]` going above 0 | `UNIT_LOST_LINES` |
| enemy wave massing | `AI.warned` (in `src/game/ai.js`) going true | `WAVE_LINE` |

These are gated on `matchLive === true`, not merely `running` — nothing here
is meaningful before the HQ is down (no base to attack, no grid to stall, no
wave to mass against), and gating on the later flag also means any state left
over from the *tail* of a previous match — a grid still reading "stalled" in
the instant before defeat — has finished decaying before it could fire a
premature bark at the very start of the next drop, before the player has even
landed. All five latches reset together the moment a new drop begins (see
**Match-start detection**).

None of these repeat what `coachTick()` already says mechanically. The base
game already toasts "⚠ Enemy wave massing" and "⚡ LOW ENERGY — production
stalled" — KEEL's lines only ever add reaction or consequence, never restate
the instruction.

---

## Engine

* **Polling, not hooking.** A private `setInterval(tutTick, 350)`, started
  from `initTutorial()`. Nothing in `src/main.js`'s frame loop was touched,
  per the brief — this file calls its own timer and reads globals that
  already exist (`bldLive`, the unit arrays, `stats`, `abCool`, `HAZ`, `AI`,
  `carrier`, `matchLive`, `META`).
* **Match-start detection.** `carrier.active && carrier.phase===0` is true
  for the ~2.3s the carrier is falling, exactly once per drop (see
  `newSkirmish()` in `src/main.js`). Catching that transition is what arms a
  fresh tutorial run and resets every reactive latch — polled, never hooked.
* **One bubble, two moods.** `#keelWrap` > `#keelBar` is the only DOM this
  module owns, created once by `buildDOM()`. A fresh line pulses in at full
  emphasis and holds for a few seconds; once its hold elapses it settles to a
  dimmed "resting" state showing the current step's objective (or hides
  entirely if there is nothing to say). Tapping the bar while resting re-shows
  it at full emphasis — a quiet "say that again."
* **The queue is capped at 3** and hold times compress to ≤2.4s once a
  backlog exists, so a burst of state changes (several structures finishing
  in the same poll, or a mid-match replay silently back-filling a lot of
  already-true steps) can never leave a minute of stale dialogue queued up —
  the line the player is looking at now always matters more than a stale
  "done" bark for something finished three actions ago.
* **Voice is opt-in and inert by default.** `speakVoice()` only runs if
  `META.settings.tutorialVoice` is on, checks `'speechSynthesis' in window`
  first, and is wrapped in `try/catch` with no fallback behaviour needed —
  silence *is* the fallback. It is never awaited and never blocks `pump()`.

---

## Persistence

Tutorial state rides the existing profile save (`META`, written by
`metaSave()` in `src/game/meta.js` — this module never writes its own career
blob):

```
META.tutorial = {
  done: false,
  skipped: false,
  version: 3,
  progress: 0,
  rewardedVersion: 0
}
META.settings.tutorialVoice = false     // merges into the existing settings blob
```

`progress` is a high-water mark used by the briefing; live state remains the
authority during a mission. `version` re-recommends a materially expanded
guide to profiles that completed an older one. `rewardedVersion` makes the
150-core first-clear payout idempotent for each guide version.

`META.settings` already round-trips arbitrary extra keys through
`{...DEF_SETTINGS, ...savedSettings}` in `metaLoad()`, so adding
`tutorialVoice` needed no changes there — it simply persists like any other
setting meta.js doesn't specifically know about.

---

## Entry points

1. **First-profile callout.** Before a profile has played a match, a compact
   FIELD ORIENTATION card appears above PLAY and opens the mission briefing.
   PLAY itself remains a normal skirmish.
2. **Operations.** FIELD ORIENTATION is the first recommended operation and
   shows the nine topic groups, 19-objective progress, fixed Easy rules,
   portrait, first-clear reward, and START / RESUME / REPLAY state.
3. **Settings → 🎓 Training Operation.** Starts, resumes or replays the same
   protected operation. It never converts a live normal match into training.
4. **Settings → 🔊 KEEL Voice.** Independent opt-in speech synthesis.
5. **SKIP in KEEL's panel.** Leaves training, restores every snapshotted
   skirmish choice, returns to the main menu, and preserves replay access.

Nothing here can trap the player: every step is satisfied by playing
normally, and the panel never intercepts a tap on the game underneath it
(`pointer-events` is `none` on the outer wrapper and only `auto` on the
visible bar itself, and only while it's actually shown).

---

## Integration seams (why nothing else needed editing)

* **`initTutorial()`** — the one required global. `src/main.js`'s `boot()`
  already calls `window[fn]()` for a list of optional subsystem
  initializers, wrapped in `try/catch`, so this file only had to define the
  function.
* **`renderSettings()`** is owned by `src/game/meta.js` and rebuilds
  `#setList`'s entire `innerHTML` on *every* call — including every time a
  player flips an unrelated toggle. Appending a row once at boot would vanish
  on the first click anywhere else on that screen. Instead this file wraps
  the function — `var _keelRenderSettings=renderSettings; renderSettings=
  function(){ _keelRenderSettings(); appendTutorialSettingsRow(); };` — the
  same call-through pattern `src/game/commander.js` already uses on
  `econTick()` and `src/game/meta.js` already uses on `heroXP()`. The wrap
  runs once, at parse time, after `meta.js` has defined the original
  (`tutorial.js` loads after `meta.js` in both `boot.js`'s and
  `assets/data/manifest.json`'s script order).
* **`renderOps()`** is wrapped in the same takeover style so the Training
  Operation card survives every Operations rerender.
* **`orderMove()`** is wrapped only to remember a valid selected-combat
  attack-move after formation placement. **`applyCrate()`** is wrapped only
  to remember that a training pickup was actually collected. Both call the
  original function first and preserve its return value.
* Every other touchpoint — `toast()`, `sfx()`, `$()`, `bldLive`, `TYPES`,
  `BT`, the unit arrays, `stats`, `abCool`, `HAZ`, `AI`, `carrier`,
  `matchLive`, `META`/`metaSave()` — is read or called as a plain global,
  the same way every other file in this classic-script, one-scope codebase
  talks to every other file. Nothing is imported and nothing here is
  imported elsewhere.

---

## Visual placement

`#keelWrap` is centred, docked at `top: calc(var(--sat) + 204px)`. That
point was chosen empirically, not guessed: it sits below the
goal/hero/hive-meter cluster (which ends around `+105px` once a match is
live) and below the native `#toast`'s usual footprint (up to `+192px` for a
three-line toast), verified against 412×900 screenshots taken mid-drop and
immediately post-deploy — the two moments a stock toast is most likely to be
on screen at the same time as KEEL. They still can coincide on an unusually
long toast; when they do, KEEL's panel sits at `z-index:19`, the same layer
as `#coach`, and simply renders as a second HUD-native line rather than a
modal fighting the toast for attention.

Colour and type reuse the HUD's existing custom properties (`--panelG2`,
`--fT`/`--fU`, the bevelled-gradient border trick from `src/styles/ui.css`)
so KEEL reads as native chrome. It gets one new token,
`--keelB` (a cyan border gradient), so its panel is visually its own
character rather than a re-skinned dispatch or coach banner.

### Accessibility

* `#keelWrap` carries `aria-live="polite"` so a screen reader announces new
  lines without interrupting.
* `#keelProgress` is a real `role="progressbar"` with live `aria-valuenow`
  and `aria-valuemax`; the thin visual fill is not the only representation.
* The skip button is a real `<button>` (native keyboard operability) with
  `aria-label="Skip tutorial"`; its visible glyph is small but the hit box is
  44×44 CSS px (verified against the rendered `getBoundingClientRect()`, not
  just the source, since padding under `box-sizing:border-box` doesn't
  enlarge a `min-width` the way it would under the default box model).
* The two Settings rows this file adds are plain `div.setRow` — matching the
  *existing* pattern every other row in that screen already uses (none of
  them are real buttons either; that's an existing characteristic of
  `renderSettings()` in `src/game/meta.js`, outside this file's ownership to
  change). Both of this file's rows additionally carry `role="button"`,
  `tabindex="0"`, and a `keydown` handler for Enter/Space, which the native
  rows do not — verified with a real keyboard Tab + Enter/Space in testing.
* `prefers-reduced-motion: reduce` turns off the pulse and ring animations
  as well as target/progress motion; the text content is unaffected.

---

## Known limitations, honestly

* `tools/test-training-deep.mjs` completes all 19 real-state gates with the
  production functions (`deployCarrier`, `applyCrate`, `addBld`, `spawnUnit`,
  `saveGroup`, `orderMove`, `tryAbility` / `fireBlast`) but accelerates long
  construction and travel by setting their resulting state. It is a focused
  runtime regression, not a replacement for a human playing the whole lesson
  through touch input at production build times.
* The protected opponent still builds a visible base and army. Its scripted
  wave clocks are parked while the lesson runs; this operation therefore does
  not teach high-pressure recovery or late-game counterplay.
* Voice was verified to not throw and to leave the text-only path fully
  intact in a headless Chromium with no real TTS backend (the realistic
  "unsupported" case for most CI/automation environments); it was not
  verified against a real device voice, since none was available in this
  environment.
