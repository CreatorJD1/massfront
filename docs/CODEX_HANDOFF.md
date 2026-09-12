# Codex pass-down — MASSFRONT

Prepared 2026-09-12. This is the **only** pass-down in the repository. Every earlier
one was removed rather than archived, because sixteen competing snapshots of "current
state" is worse than none — each was true on the day it was written and wrong by the
time anyone read it. Do not create dated siblings of this file. Rewrite it in place.

Read [`AGENTS.md`](../AGENTS.md) first. Its five rules still hold and this file does
not repeat them.

---

## Where things stand

| | |
|---|---|
| Checkout | `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple` |
| Branch | `cursor/strip-mass-node-bloom` |
| HEAD | `ada7940` |
| Live everywhere | **1.33.88** (verified by fetching the Space's `sw.js`, not by reading a file) |
| Tree version | 1.33.88 — the tree is **not** bumped ahead of the release |
| Unreleased | **19 commits** since `ec28fe2` (the 1.33.88 activation), all destined for 1.33.89 |
| Static gates | **150 / 150 pass** |
| `www/` | packed and byte-matched to `src/` |
| OTA stage | `tmp/stage15-runtime-compatibility` regenerated and passing |

The only dirty paths are eight untracked `audit/stage11-space-ux-v13379-training-debug*/`
directories. They predate this work and nothing depends on them.

---

## Release state comes from the network, not from a file

`RELEASE_STATUS.md` and the version constants lag reality. Before you believe any
version number, fetch it:

```bash
curl -s https://creatorjd-massfront-playtest.static.hf.space/sw.js | grep -o '1\.33\.[0-9]*' | head -1
```

The pipeline is **Hugging Face + Cloudflare + Google Drive. Never GitHub.** Local
commits are fine; do not push, open PRs, or propose GitHub anything.

Publishing is an eleven-step sequence and `publish-hf-release.ps1` never activates on
its own — activation is two separate repointer steps afterwards. The Space upload is a
**separate step from OTA** and skipping it is how 1.33.85 shipped to devices while the
browser build sat on .84 for three releases.

Four invocation traps that look like a broken release and are not:

1. PowerShell `2>&1` turns `hf.exe`'s benign stderr warning into `NativeCommandError`
   and aborts the publisher. Use `Tee-Object` plus `$LASTEXITCODE`.
2. `powershell -File` mangles array parameters. Splat in-process instead.
3. **A new file blocks `-PatchFrom`**, and its absence is the difference between a
   30 MB delta and a 93 MB full download. If you add a file to the shipped runtime,
   expect the update to go full-size.
4. A retry with different bytes under the same version hits *"Refusing to overwrite
   immutable same-version bytes"*. Use `-ArtifactRevision r2`.

---

## What the 19 unreleased commits contain

### Match-breaking defects, fixed

- **The level-up chooser could freeze a match permanently.** `showLevelUp()` set
  `paused=true` on its first line, then did DOM work that could throw — leaving the
  simulation stopped with nothing on screen, because the only control that clears
  `paused` is a card it had not yet created. Rendering and audio are on a different
  path, so it looked alive. That is the exact shape of the reported 22:02 freeze. It
  now builds the chooser, verifies it has cards, shows it, *then* stops the clock.
- **`heroXP()` dereferenced `#levelUp` unguarded** — inside the simulation step, on
  every kill.
- **The sim halt from 1.33.88 was not sticky** and was never cleared, so RESUME
  re-entered the throwing step silently and one bad match would have frozen every
  later match.
- **The dropship deployed twice on resume**; the guard now lives inside
  `deployCarrier()` rather than on a caller.

### Things that were built but invisible

- **The economy coaching never reached the screen.** `showCoach` submitted STORAGE
  FULL / LOW MASS / LOW ENERGY at `MF_N_INFO`, and `mfNoticeLiveAllowed()` refuses
  everything at that level — they went to the EVENT FEED only, while two of them still
  played a notify sound. See *The notice ladder* below.
- **The FEED badge counted submissions, not unread rows**, and nothing reset the feed
  at a match boundary. That is the reported 8 → 10 → 20 → 47 → 99+.
- **Coaching cooldowns leaked across matches**, so a new match could open with every
  economy warning suppressed for 45 seconds.

### The player's own faction resolved to the Syndicate

`src/faction-id.js` is the canonical identity seam and a faction *name* is machine-read.
The exploration catalog called the player's faction "Nova Coalition", and the resolver
tested the shared word "coalition" — the Syndicate's — before it ever looked for "nova".
Wrong runtime key, wrong art kit, no error. Fixed on both sides: the catalog carries the
canonical `Terran Frontline Command`, and the resolver checks each faction's distinctive
tokens before any word several of them share.

### UGA Command

- **The door opens in space.** DEPLOY MASSFRONT and UGA COMMAND both entered at
  `campaign_hub`, so the button named after the ship never showed the ship. UGA COMMAND
  now enters at `system`; a saved ship-interior scene no longer overrides it, while a
  saved galaxy or survey position still restores.
- **Four of eleven rooms had no work panel.** Engineering, Strike Bay and Fabrication
  already had panels written that nothing routed to them — and the code was already
  navigating players to two of those rooms expecting content. Navigation Bridge is new.
- **Socket modules did nothing but draw power.** All 33 now carry effects that aggregate
  through `calculateFacilityCapabilities`, which is what makes them real in ~30
  consumers at once.
- **Commander experience was a flat number**, untouched by any room. `commanderXpPct`
  now scales it, capped at 60%; a fully fitted ship reaches 45%.

### 22 static gates repaired

They were all failing, and **none of them because the game was wrong**. Each had frozen
around a literal that moved, so it reported its own staleness and guarded nothing. Two
were worse than stale: three faction-conversion gates were asserting a *bug that had
been fixed* (shared wrappers meant bespoke art never reached a vertex), and
`stage8-team-identification` had silently stopped running its entire fog/radar
disclosure section because its slice end-marker got hoisted above its start.

Where a check encoded a snapshot it now checks the property: `MATERIAL_COUNT` derives
from the atlas, air/naval derive from `TYPES`, the design DB is compared against the
shipped table rather than a frozen list.

---

## Traps that cost real hours

**A zero in a headless check is usually the harness.** This is the single most
expensive lesson in this repo and it recurred four times in one session:

- A probe that hand-built a world instead of calling `newSkirmish()` left `AI.base`
  without a seat wallet, so `eStarved` was permanently true and the AI built 31
  Reactors and no units. It read exactly like a catastrophic AI bug. Through the real
  path the same AI fields 111 units and a balanced 34-structure base in three minutes.
- Mounting `createUgaCommand` without `onHostRoute` disables every base-game route
  control; without `schemaVersion: 7` every domain command refuses to quote. Both make
  working rooms report as broken.
- The district rail is **deck-filtered** (A/B/C), so walking rendered `[data-district]`
  buttons audits one deck of three and calls the ship complete.
- A screenshot harness that mounts the UGA panel without setting `data-scene="uga"`
  leaves the module's own resource topbar visible behind it, and the capture shows two
  stacked resource rails that no player ever sees.

**Suspect the test before the code.** Then prove it either way.

**Mutation-test every gate you write.** A gate in this repo has twice passed on its own
explanatory comment — a `@media` and an `if(matchLive) return` that existed only inside
the prose describing them. Blank comments to spaces before parsing for code. And
asserting that a function *mentions* a symbol is not a test: one gate here passed with
the whole calculation disabled, because `const xp = false ? …scaled… : baseXp` still
contains the words. Lift the function out of source and run it.

**Escapes.** Bash heredocs and Python heredocs both eat doubled backslashes, so a JS
regex written that way silently matches nothing. Use the editor for anything with
escapes.

**`design/` is gitignored and derived.** `tools/extract-design-db.mjs` regenerates it by
running the real source. It had been crashing inside its own sandbox (`URL` and
`URLSearchParams` are not visible in a `vm` context) and exiting before writing, which
is how every unit's `spd` stayed at roughly double the shipped value for 33 units with
nobody noticing.

**Module edits need a content-manifest rebuild.** After touching
`modules/space_exploration/src/**`, run
`node modules/space_exploration/tools/build-runtime-content-manifest.mjs` *before*
`node tools/pack-www.mjs`, or the pack aborts with *"Stale exploration runtime manifest
entry"*.

**GPU.** MASSFRONT needs WebGL2 on hardware. A plain `chromium.launch()` paints
"HARDWARE GPU REQUIRED" across the viewport — use `tools/pw-browser.mjs`. Playwright
waits need `polling: 250`; the default rAF polling never fires on a busy page. Check
`nvidia-smi` first: Ollama can hold most of the 8 GB.

---

## The notice ladder

Every in-match message routes through one priority queue in `src/ui/hudflow.js`:
`MF_N_CRIT=0, MF_N_ORDER=1, MF_N_INFO=2, MF_N_CHAT=3`, and `mfNoticeLiveAllowed()` opens
with `if (pri >= MF_N_INFO) return false;`.

**Anything at INFO or below never reaches the screen** — it lands only in the EVENT FEED
the player has to open. When you add an in-match message, pick the priority by whether
it must be seen, not by how it reads. Anything the player must act on is `MF_N_ORDER` at
the lowest.

---

## The UGA room effect seam

`calculateFacilityCapabilities(state)` in
`modules/space_exploration/src/domain/construction.js` is the single aggregation point
for everything the ship's rooms grant — the chosen facility at tiers 2 and 3, and every
installed socket module. About thirty consumers read the result, and
`ground_operation.js` snapshots it into `operation.configuration.facilityEffects`.

Adding a room bonus does not mean touching call sites: give the facility or module an
`effects` key and it is live everywhere at once. Clamp anything that stacks across
eleven rooms. Add a label in `constructionEffectMarkup` or it renders as a raw
camelCase token.

---

## Tools worth knowing

| Tool | What it answers |
|---|---|
| `tools/audit-uga-rooms.mjs` | what every district offers a player who walks into it |
| `tools/capture-uga-rooms.mjs` | screenshots of each room, twice — as it opens and on its work panel |
| `tools/capture-uga-space-entry.mjs` | what UGA COMMAND now opens on |
| `tools/probe-match-health.mjs` | economy, per-team units and structures, population, kills and feed volume, sampled through a real match |
| `tools/probe-levelup-flow.mjs` | the level-up chooser end to end in a real match |
| `tools/probe-loading-screens.mjs` | every full-screen cover in one launch, with timings and overlaps |
| `tools/probe-commander-hud.mjs` | the canonical `enterMatch()` recipe — copy it rather than rederiving |

---

## Open, and deliberately not done

- **1.33.89 is not cut.** Nineteen commits are staged for it. Nothing is published.
- **Loading screens are doubled, structurally.** Measured: `#mfBootCover` for ~32 s,
  then the title reveal, then `#updScr.mfLauncher` for ~27 s, with the title card
  overlapping the launcher for its whole nine seconds. The boot cover finishes loading
  the game and *then* the launcher runs its own readiness pass with its own progress UI.
  Merging them is a product decision, not a bug fix.
- **Storage caps are undersized against income.** A bare HQ earns 5.6 mass/s and 28
  energy/s against caps of 1200 and 6000, so energy fills at sim t=120 s and mass at
  t=168 s, and from then on the whole income is discarded. The player's own screenshots
  of "MASS 1.2K / NRG 6K" are those two caps exactly. Retuning is a balance call.
- **Every socket accepts exactly one module**, so installing is yes/no rather than a
  pick. All the personalisation is in the facility choice. Widening it is content
  authoring.
- **Three rooms are read-only** — Survey Lab, Fabrication & Armory, Habitat & Medical
  inform but offer nothing to act on.
- **MMO removal / Co-op under Standard / War Table shortcuts** were explicitly deferred
  by the owner to keep a hotfix focused. Still outstanding.
- **The UGA COMMAND button's live tap path is unproven.** The change is gated at source
  and mutation-verified, but the browser harness could not drive that particular
  handler (`handler ran 0x` on a node verified to be the original bound element) while
  the same interception worked on DEPLOY MASSFRONT. Worth confirming on device.
