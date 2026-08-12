# Regression-test baseline — 2026-08-12, commit `039c172`

Recorded **before** the strategic-zoom/tactical-icon work, so a later failure can be
attributed correctly. Per `docs/POSTMORTEM-1.33.31-REGRESSION.md`, the project's rule is
to establish red/green state first rather than assume a clean tree.

## Result: the three "guard" tests are ALL ALREADY RED at HEAD

These are the tests whose literal source-string assertions constrain how the icon layer
may edit `render3d.js`. None of them currently passes, and each fails **earlier** than the
assertion we care about — so none is currently protecting the line it was cited for.

| Test | Fails at | Message |
|---|---|---|
| `tools/test-faction-unit-identity.mjs` | **:51** | `nova: missing authored energy/light language` — `MAT.LAMP` absent from both the ground and air Nova meshes |
| `tools/test-faction-strategic-defense.mjs` | **:57** | `Legion Mk1 rail lost material zoning` |
| `tools/test-fog-pickups.mjs` | **:62** | `one or more fog render/minimap/AI gates are missing: {"render":true,"legacy":true,"minimap":true,"shadow":true,"aiPing":false}` |

### Notes that matter for the icon work

- **The fog gates the plan depends on are intact.** `test-fog-pickups` reports
  `render:true, legacy:true, minimap:true, shadow:true` — 4 of 5 pass. Only **`aiPing`**
  is missing. So the constraint "icon branches must go *after* the existing
  `fogEntityVisible` call sites, never replacing them" is still correct and still
  enforceable; it is simply not currently guarded end-to-end by a green test.
- **The predicted failure did not occur.** The design pass expected
  `test-faction-unit-identity.mjs:112` to fail on a missing `orthoSpan<2700` literal. It
  never reaches line 112 — it dies at line 51 on a *material* assertion. The
  `orthoSpan<2700` concern is unverified either way.
- All three failures are **art/material or AI-gate** assertions, not rendering-structure
  assertions. They are consistent with the reconstructed v1.33.31 source genuinely
  differing from what these tests were authored against — i.e. the tests drifted from the
  shipped build, or the shipped build regressed these areas. **Worth investigating
  separately; out of scope for the icon tier.**

## Consequence for the strategic-zoom work

These tests **cannot be used as pass/fail gates** for the icon layer. The rule for this
workstream is therefore:

> Do not require them to pass. Require that they **fail at the same line with the same
> message** afterwards. Any *new* or *moved* failure is attributable to the icon work.

Re-run command:

```bash
node tools/test-faction-unit-identity.mjs; node tools/test-faction-strategic-defense.mjs; node tools/test-fog-pickups.mjs
```

## Green gates that DO protect this work

| Gate | State |
|---|---|
| `node tools/bundle.mjs` | **PASS** — 67 sources → `dist/massfront.html` 24.12 MB. This is the syntax/global-collision gate and the real guard for adding `tacticons.js`. |
| `node tools/pack-www.mjs` | **PASS** — `www/` staged, `index.html` + `boot.js` MANIFEST fully resolved. |
| `node tools/artv2.mjs verify --all` | Fails only on the intended authoring-ceiling errors (tank 32,018 and factory 11,564 both over the 10,000 source ceiling). Battle LODs pass: tank 3,752, factory 5,058. |

Real-GPU capture harness (headed Chrome, `--use-angle=d3d11`) is the authoritative visual
check; SwiftShader output is **not** trustworthy for material/detail questions.

---

## Addendum — `test-fog-pickups` is racy (found during the icon work)

After the icon tier landed, this test began failing *earlier* than its baseline
line, with `TypeError: Cannot read properties of null` in `hAt` (`gl.js:2491`) via
`resetWorld()` → `setupDoodads()` — i.e. `heightF` was still null.

Measured directly against the same server the test uses:

| moment | `heightF` |
|---|---|
| when the test's `waitForFunction` is satisfied (**+217 ms**) | **false** |
| ~1 s later | true |

with **zero console errors** throughout. The test waits only for *function
declarations* (`resetWorld`, `render`, …), which hoist and exist almost
immediately, then calls `resetWorld()` — but `heightF` is only populated later by
`buildTerrain()` during async init. The pass/fail therefore depends on which side
of a ~1 s boot step the evaluate lands, and **any** timing change flips it.

This is a pre-existing defect in the test, not a product regression: the game
boots clean and terrain is present a second later. Making the icon atlas build
lazily (it now rasterises on first icon draw rather than on the boot path) was
worth doing on its own merits — no session should pay 1024² rasterisation plus a
mipmap upload for a feature that only engages past ~2200 span — but it does not
and cannot fix the race.

**Proper fix (separate change):** have the test wait for readiness rather than
existence, e.g. `waitForFunction(() => typeof heightF !== 'undefined' && !!heightF)`
before calling `resetWorld()`.

---

## Resolution — both material tests were TEST DRIFT, not regressions (2026-08-12)

Investigated with a decisive control: the **v1.33.7 shipped copy** under
`android/app/src/main/assets/public/src/` produces **byte-for-byte the same
material sets** as current `src/` for both assertions, while the trees genuinely
differ (`materials.js` 68 KB → 546 KB, `mesh.js` 100 KB → 116 KB). Nothing
regressed between 1.33.7 and 1.33.31 — both tests fail identically against the
older shipped build too. **The shipped faction palettes are intact.**

### `test-faction-unit-identity.mjs` — FIXED, now PASSES
Two drifts, one behind the other:

1. **:51 demanded `MAT.LAMP` alone.** There are *two* authored emissive roles —
   `materials.js:83` binds `'emissive.light' → MAT.LAMP` **and**
   `'emissive.energy' → MAT.SYN_CONDUIT`, wired to the `HOT` and `ENERGY` colour
   keys at `models.js:117`. `mdlNovaDoctrine` (`models.js:2068-2093`) is built
   *entirely* from `ENERGY`, so Nova's energy language is emphatically present —
   in the other role. Syndicate likewise. Now accepts either.
2. **:121 asserted the literal `orthoSpan<2700`.** That was refactored to
   `orthoSpan<organicSpan` with `GFX.organicSpan ?? 2700`
   (`render3d.js:1203-1204`) — same default, now configurable. Marker updated.

### `test-faction-strategic-defense.mjs` — FIXED, now PASSES
1. **:57 required ≥5 base materials.** Structurally unreachable *because the
   faction identity pass works*: `domLegionStructureSurfacePass`
   (`models-legion.js:552-567`) remaps six generic `TWR_*` slots onto the Legion
   signature palette, which has exactly **four** entries (`materials.js:44`:
   `LEGION_CAST/RIVET/THERMITE/SIEGE`). Demanding 5 *rewarded structures that had
   not been given the faction palette*. Floor is now 4 for the base; the turret
   still requires 5 (`LEG_BORE` passes through unmapped) and :56 guards the bore
   independently.
2. **:69 assumed every faction fields a `rail` tower.** Nova does not — its tier
   map is turret/bunker/bastion/sgen/uplink/hellstorm/arc/nova/minelaser/
   missilebastion/plasma. The loop now skips factions lacking the structure and
   asserts at least two still field it, so the cross-faction check cannot go
   vacuously green.

### Gating status
Neither test is in CI — `.github/workflows/ios-ipa.yml` runs only
`tools/pack-www.mjs`. Both are listed as focused gates in
`docs/HANDOFF_CLAUDE_CODE.md:240` and `docs/HANDOFF_CODEX_SPARK.md:211`.

### Genuine (pre-existing, non-regressive) art gap found on the way
`BLD_MDL_LEGION.nova` is **missing from the remap key list** at
`src/engine/models-legion.js:566`, so the Legion NOVA tower base is the only
Legion structure still wearing the generic `TWR_*` palette instead of the
`LEGION_*` signature set (its turret also deliberately borrows the `hellstorm`
pack at `:569`). Worth folding into the art pass — it is an identity
inconsistency, not a test failure.
