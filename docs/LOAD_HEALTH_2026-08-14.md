# Load integrity & console health — 2026-08-14

Audit of the concatenated-scope load path after a day of many parallel edits.
Scope was deliberately narrow: does everything **load**, is the one global scope
free of collisions, and is the console clean from boot through a live match. No
gameplay, art or balance judgement. No fixes were made — see
[Nothing was changed](#nothing-was-changed).

Environment: live `http://127.0.0.1:8901/` (serves `www/`, staged by
`tools/pack-www.mjs`), headless Chrome on real GPU
(ANGLE / NVIDIA RTX 4060 Laptop, D3D11 — not SwiftShader), viewport 412x900.

## Verdict

**Healthy.** No duplicate globals, no load-order violations, no thrown errors.
Both manifests agree exactly, and a match booted, deployed and rendered
correctly. The only console errors were 404s: one is a documented by-design
probe, the rest were a transient artefact of concurrent tooling (below), and all
of them serve 200 on re-request.

| Check | Result |
| --- | --- |
| `node tools/bundle.mjs` (syntax gate) | PASS — 70 sources, no collision |
| Duplicate top-level declarations (incl. `var`/`function`) | 0 of 3,871 names |
| `boot.js` MANIFEST vs `assets/data/manifest.json` | Identical — membership and order |
| `node tools/pack-www.mjs` | PASS |
| Uncaught exceptions / `pageerror` | 0 |
| Console errors that are real defects | 0 |

## 1. Syntax gate

```
bundled 70 sources -> dist/massfront.html (24.62 MB)
```

Clean. No duplicate `const`/`let`/`class` at global scope — the failure mode
that has bitten this project four times (`bloomB`, `RESEARCH`, `resDone`,
`name`) did not recur.

### Gap worth knowing: the gate cannot see `var`/`function` collisions

`tools/bundle.mjs` ends in `new Function(body)`. That throws on **lexical**
redeclaration only. Two files both declaring `function sfx(){}` or `var HUD={}`
is legal JavaScript — the second silently overwrites the first — so the gate
passes while a module quietly loses its implementation. In a codebase whose
whole premise is one shared scope, that is the same bug class the gate exists to
catch, minus the crash.

I scanned for it separately (`.tmp/scan-global-dupes.mjs`: comment/string/regex
aware, brace-depth aware, resolves multi-binding `var a=1,b=2` statements):

```
=== DUPLICATE TOP-LEVEL DECLARATIONS ACROSS FILES ===
(none)
total top-level names: 3871 | duplicated: 0
```

**Zero duplicates, lexical or otherwise.** Promoting this scan into
`bundle.mjs` would close the gap permanently; left as a suggestion, not done
here, because `bundle.mjs` is shared infrastructure.

## 2. Manifest agreement

Both registries agree on **membership and order**, every entry exists on disk,
and the staged `www/boot.js` is byte-identical to the repo copy:

```
boot.js: 72   manifest.json: 72
boot-only: []    json-only: []
order mismatch: NONE
www missing on disk: []
```

Two files were added by other agents *while this audit was running* —
`src/repairbay.js` and `src/warprimer.js` (indices 66 and 68). Both were
correctly registered in **both** places by their owners; no action needed. The
count moving 70 → 72 mid-run is why the numbers differ between section 1 and
here.

Four `.js` files under `assets/data/` are in neither registry and **should not
be**: `material-v2-tank{,-lod1}.js` and `material-v2-nova-factory{,-lod1}.js`.
`src/engine/materials-v2.js:24` selects one by name at runtime
(`MF2_ASSET_FILE`) and loads it on demand. Not a missing registration.

## 3. `pack-www.mjs`

```
staged www/ — index.html + boot.js MANIFEST + audio banks fully resolved
```

Clean.

## 4. Live console — boot → war room → deploy → match

One tab, one navigation per run, tab closed afterwards. Two runs: the first
established the baseline, the second (the one permitted refresh) got through to
a live match after handling the boot overlays.

**Uncaught exceptions: 0. `pageerror`: 0.** The match reached first contact and
rendered correctly — terrain, HUD, resource ticker, minimap and unit selection
all present and correctly composited (`.tmp/load-health/b7-match.png`). No
hollow geometry, no atlas-over-screen, no overflowing cards.

### Errors

| # | Message | Status |
| --- | --- | --- |
| 1 | `404 assets/textures/ui/tacticons.png` | **By design — not a defect** |
| 2 | `404 src/ui/hotslots.js` + `boot: failed …` (`boot.js:204`) | Transient, see below |
| 3 | `404 assets/textures/ui/cmdicons.png` | Transient, see below |
| 4 | `404 assets/icons/icon-152.png` | Transient, see below |

**(1) `tacticons.png` is contractually absent.** `src/engine/tacticons.js:578-611`
documents it: the procedural icon cells are placeholders, and an authored sheet
at that path replaces them wholesale with no code change. `img.onerror` is an
explicit no-op so placeholders stand. `tools/capture-commander-icon.mjs:31-35`
already whitelists it for exactly this reason. It appears once per icon-sheet
init (twice per session: boot and first HUD build). **Leave it alone** — treat a
404 here as the contract working. Any future console-health gate should
whitelist this URL rather than "fix" it.

**(2)(3)(4) were a race with another agent's tooling, not a load bug.**
`tools/pack-www.mjs:20` does `rmSync(www, {recursive:true, force:true})` and
then re-copies. Any page load overlapping that window sees 404s for whatever has
not been copied back yet. Several agents were running captures and packs
concurrently. The evidence:

- The first run, minutes earlier, had **none** of these three — only the
  by-design `tacticons.png`.
- All three files exist in `www/` and serve **200** on re-request
  (`hotslots.js` 19,605 B, `cmdicons.png` 147,502 B, `icon-152.png` 44,046 B).
- They are unrelated to each other and span `src/` and `assets/` — the
  signature of a directory being rebuilt, not of a code change.

No fix applies. **Operational note for parallel work:** a `pack-www.mjs` run
makes the 8901 server briefly serve a half-empty tree, so a QA load that
overlaps one will report phantom 404s. Re-request before believing a 404 on this
server.

Because `boot.js:204` calls `next()` on `onerror`, a failed script does **not**
abort the chain: the remaining manifest files still load, and only the globals
owned by the failed file go missing. `hotslots.js` is last in the manifest, so
in this instance nothing downstream depended on it.

### Warnings

Both are pre-existing and neither affects correctness.

**Canvas2D `willReadFrequently`** (4 occurrences) — a Chrome performance hint,
not an error, raised where a 2D context is read back with `getImageData`:
`src/engine/gl.js:3164`, `:3165`, `:4286`, and `src/ui/hud.js:1523`.
*Owner: engine / HUD.* Adding `{willReadFrequently:true}` at those context
creations would silence it, but it is a throughput trade-off, so it belongs to
whoever owns those readbacks.

**Blocked `aria-hidden` on an element whose descendant retained focus**
(1 occurrence) — `src/intro.js:95`. `closeIntro()` sets
`aria-hidden="true"` on `#mfPreAlphaIntro` while `#mfIntroStart`, focused by
`openIntro()` at `src/intro.js:117`, is still inside that subtree. Focus is only
moved out afterwards, by the `setTimeout(..., 90|120)` at `src/intro.js:107`, so
for that gap the focused button sits in an `aria-hidden` subtree and Chrome
refuses to apply it. Real accessibility defect, small: blur or move focus
*before* line 95, or use `inert`. *Owner: intro / UI shell.*

## 5. Undefined globals from load-order violations

**None found.**

Nine symbols initially looked absent at runtime; all nine are false positives
and are recorded here so the next agent does not re-chase them:

- `tutMeta`, `pick`, `hasPlayerBld` (`src/tutorial.js`) and `primerMeta`,
  `armed`, `finish` (`src/warprimer.js`) are **function-scoped inside those
  files' IIFE wrappers**, not globals. My probe picked them up because it reads
  column-0 declarations, and an IIFE body in this codebase's style starts at
  column 0.
- `hotSlotRow`, `hotSrc`, `hotSrcUsable` (`src/ui/hotslots.js`) are genuine
  globals, absent only in the run where that file 404'd (error 2 above).

A first attempt at this probe used symbol names I guessed rather than read, and
reported 21 "missing globals" that do not exist anywhere in the source. Those
were harness error, not findings. The corrected probe reads one to three real
top-level declarations per manifest file and distinguishes *declared-but-
undefined* from *never-loaded* by catching `ReferenceError` rather than trusting
`typeof`.

## Nothing was changed

No file in the repo was modified. Every issue found is either by design
(`tacticons.png`), environmental (the `pack-www` race), or owned by another area
(`intro.js` focus, `gl.js`/`hud.js` canvas readbacks). Nothing met the bar of
"trivial and safe, and mine to fix". Not committed.

## QA note: the documented test flow in `AGENTS.md` is stale

`AGENTS.md` gives the smoke flow as `#startBtn` → `#setupStart` → `#deployBtn`.
Boot now puts two dismissable layers in front of that, and `#startBtn` no longer
leads straight to match setup:

1. `#mfPreAlphaIntro`, the pre-alpha title reveal — dismiss `#mfIntroStart`
   (auto-closes on a timer, so it is often already gone).
2. `#apOverlay`, the first-launch account gate — its `apForm` covers the whole
   viewport and **silently swallows clicks on `#startBtn`**, which is what
   Playwright reports as "element intercepts pointer events". Dismiss
   `#apCloseBtn` (or call `apClose()`); it records the gate as answered.
3. `#startBtn` (now labelled DEPLOY) opens the **WAR ROOM mode menu** —
   TRAINING / STANDARD / CAMPAIGN / MMO / CO-OP. A mode must be chosen before
   `#setupStart` exists and is visible.

A script that clicks straight through per `AGENTS.md` will time out at step 2 or
3 with no console error, because nothing is broken. Worth updating `AGENTS.md`,
but that file is shared and was left alone here.

## Artefacts

Screenshots and raw logs (untracked, `.tmp/load-health/`):
`b1-boot.png`, `b2-intro-dismissed.png`, `b3-gate-dismissed.png`,
`b4-wartable.png`, `b7-match.png`, `report.json`, `report2.json`,
`globals2.json`.

Scripts: `.tmp/scan-global-dupes.mjs` (duplicate-global scan),
`.tmp/check-manifest.mjs` (registry diff), `.tmp/load-health-8901b.mjs`
(live capture).
