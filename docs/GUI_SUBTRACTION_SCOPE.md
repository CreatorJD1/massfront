# GUI subtraction pass — runtime inventory and change list (audit item 1)

**Status: changes 1–4 IMPLEMENTED and verified 2026-09-30 (see "Implemented"
at the end). Change 5 satisfied by inspection. Change list below is the
owner-approved scope.**

**2026-09-30.** Audit §2.1–2.3 graded the three hottest screens from template
source. Before cutting anything, this pass measured what a player actually
sees: a Playwright probe ([tmp/inventory-subtraction.mjs](../tmp/inventory-subtraction.mjs),
kept as the reusable harness) walked the live route — launcher → offline
identity → UGA command home → classic door → War Room → Standard → all five
setup stages — on packed `www` at 412×900, hardware WebGL2, offline identity,
and reported visible words, tap targets (with `checkVisibility`), copy panels,
and vocabulary per screen. Evidence: `tmp/subtraction-inventory-*.json` +
numbered screenshots; a deploy-stage DOM differential lives in
[tmp/diag-deploy-dom.mjs](../tmp/diag-deploy-dom.mjs).

## What the runtime said (and where the audit was wrong)

| Screen | Visible words | Real taps | Copy panels | Verdict vs audit |
|---|---|---|---|---|
| UGA Galactic Command hub | 270 | 20 | 3 (top = **190**) | Audit's ~517–583 w / 19 taps: count roughly right, but density is ONE panel |
| War Room (Standard) | 70 | 4 | 3 (≤24 w) | **Already clean** — no subtraction needed |
| Setup GALAXY | 140 | 14 | 1 | Fine |
| Setup SYSTEM | 126 | 10 | 1 | Fine |
| Setup PLANET | 124 | 13 | 1 | Fine |
| Setup REGION | 243 | 9 | 4 (49/48/30 w site dossiers) | The only wordy stage — three site cards ×~50 words |
| Setup DEPLOY | 197 | **15** | 1 | Audit's "87 taps" was an artifact; fold works |

- **Deploy's 87-tap figure was false.** Chromium's closed-`<details>` hide
  (`content-visibility:hidden`) keeps invisible layout boxes, so a
  `getClientRects`-based counter saw all 75 advanced controls. `checkVisibility()`
  is the correct test; with it, deploy measures **15 real taps**. Two CSS
  "fixes" were applied and then **fully reverted** after the DOM differential
  proved the fold was never broken — both trees are byte-identical to
  pre-session source.
- **`#startScreen` never displays on the live route.** The UGA takeover
  intercepts `startScreen`/`warScr` and navigates to the module document
  (`galactic-operations.js` `showFrontScreen` override, line ~1184). The
  audit's ~2,134-word front screen is a **source-only surface**; players meet
  the 270-word UGA hub instead. The metric to beat is 270/20, not 2,134.
- The War Primer "WAR TABLE ORIENTATION" guide
  ([warprimer.js:204](../src/warprimer.js#L204)) is the biggest repeatable
  panel (26–28 words + 2 buttons), is dismissible (GOT IT/SKIP, persisted),
  and on the REGION stage it stacks on top of three ~50-word site dossiers —
  that stacking, not any single panel, is what makes region feel dense (243 w).
- Vocabulary: "front" (pressure/regions) is the only term that repeats across
  screens (hub 4, galaxy 4, region 7). Mission/operation/contract rarely
  co-occur on one screen (worst: War Room, 2+1+0), so a per-screen glossary
  is unnecessary; the §2.3 problem is cross-layer, not per-screen.

## Change list — cut / fold / halve (proposed, awaiting owner go)

### 1. Fold the dedication ladder on the hub (FOLD) — the one real finding
`uga_command.js` `uga-ladder` section: **190 words**, 43% of all hub copy and
roughly a third of the panel height (five rungs × charted-when copy), and it
pushes the primary objective panel down. Fold it behind a
`<details>`-style collapsed header row that keeps the summary line visible:
`FRONTIER DEDICATION LADDER — 0/9 REGIONS HELD · EXPAND`. Collapsed state
persists. Recovers ~150 words and ~2,000 px of scroll. Pair with audit item 4
(surface the ladder) by making the expanded rungs *interactive*: show locked
rungs with what unlocks them, instead of prose per rung.

### 2. Region site dossiers: one open, rest summarized (HALVE)
Three simultaneous ~50-word site cards (49/48/30) duplicate per-map copy the
deploy brief re-states later. Keep the selected site's dossier fully expanded
with its condition rows (the 2026-09-27 overlap fix asserted these), collapse
the other two to name + size + hazard chip (~12 words each). Net −60 to −70
words, zero decision-critical info hidden.

### 3. War Primer: shorten REGION card to one line (HALVE)
Keep the guide (it is dismissible and compact elsewhere), but cut the REGION
card copy so it never stacks ~30 words on top of three dossiers. One line:
`Choose a site. STANDARD is the balanced pick.`
Net −15 to −20 words on the densest moment of onboarding.

### 4. Deploy: rename `MISSION INTEL & EQUIPMENT` → `LOADOUT & RULES` (CUT)
Summary label only; 8 chars saved and the jargon read shrinks. Deploy is
otherwise already the designed screen: 15 taps, one folded drawer, quick
plan/team/commander primary. **No structural change.**

### 5. One-screen primary CTA pass (FOLD — smallest, do last)
Every measured screen already has exactly one visually primary action
(hub: HIRE COMMANDER on uncommissioned ships; setup: the dock's single
▶ button). Confirm and preserve this with a regression check rather than
re-layout: assert per screen that exactly one button carries the
`.uga-primary-button`/`.mbtn` emphasis class.

### Explicitly rejected
- **Deploy drawer CSS re-scoping** — applied, measured, reverted (fold works).
- **Deleting War Primer cards** — guide is dismissible + persisted; cutting it
  removes onboarding, not clutter.
- **Glossary strip on every screen** — vocabulary rarely co-occurs within a
  screen; §2.3 needs a cross-layer pass (audit item 6), not per-screen plates.
- **Trimming the War Room** — 70 words / 4 taps; already passes.

## Verified non-changes (measured, left alone)
War Room (70/4), GALAXY/SYSTEM/PLANET stages (126–140 words, ≤14 taps), the
deploy fold itself (works as designed), and `#startScreen` (dead surface on
the live route — worth removing only if the takeover is ever retired, and
that is a product decision, not a subtraction).

## Verification plan (per change, before any five-channel move)
1. Re-run `tmp/inventory-subtraction.mjs` — hub words ≤ ~120, region ≤ ~180,
   no screen above 200 words.
2. `verify-classic-mobile-flow` must stay green (11 captures, both
   orientations).
3. `verify-menu-chrome` + space_exploration suites stay green.
4. Screenshot diff against `tmp/subtraction-inventory-1790773407669/` for
   visual regression; inspect via the luminance renderer.

## Implemented (2026-09-30)

| # | Change | Files | Measured result |
|---|---|---|---|
| 1 | Ladder folds by default | `modules/space_exploration/src/ui/uga_command.js` — one entry in `collapsedSections`, comment records the 190-word measurement | Hub **270 → 88 words**, taps 20→20 (header still tappable), primary CTA still exactly one (HIRE COMMANDER) |
| 2 | Unselected region cards drop prose rows | `src/galaxyui.js` CSS: `:not(.sel) .mDs/.mHz{display:none}` | Region **243 → 196 words**; selected card keeps all asserted rows (49 w), others 26/20 w |
| 3 | War Primer REGION card one line | `src/warprimer.js` copy only — no `PRIMER_VERSION` bump, veterans are not re-lectured | Region card 26 → 20 words, single line |
| 4 | Deploy drawer label | `src/galaxyui.js`: `MISSION INTEL & EQUIPMENT` → `LOADOUT & RULES` (sole occurrence repo-wide) | Deploy unchanged at 196 w / 15 taps |
| 5 | One primary CTA per screen | No code — probe now reports primary-class buttons | Hub: 1 (HIRE COMMANDER); classic screens: dock pattern, single `#setupStart` per stage |

Verification all green: `verify-classic-mobile-flow` **PASS** (11 captures,
both orientations — the region row-overlap and dock-clearance assertions run
against the modified cards), `verify-menu-chrome` **PASS**, space_exploration
suites frontier-ladder / duty-watch / front-status-ground-control /
contract-planning-fallback / core-commission-rescue all **PASS** (duty-watch
passes silently, exit 0). Post-change probe:
`tmp/subtraction-inventory-1790774990143.json`; screenshots inspected via the
luminance renderer — hub ladder rail gone, region unselected cards render as
chip rows, no overlap or clipping. Note: editing a module file staled the
signed exploration manifest, so `pack-www` required
`node modules/space_exploration/tools/build-runtime-content-manifest.mjs`
first — expected on any module edit.

Not shipped to the five channels yet: per `docs/FIVE_CHANNEL_UPDATE.md`, that
is a release act with version bumps, deliberately left for the next release
cut rather than folded into this UI change.
