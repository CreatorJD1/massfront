# Stages 06–09 current verification — 2026-08-30

This is a current-source acceptance record for delivery Stages 6–9 in
`MASTER_PLAN.md`. It does not replace the immutable plan or the mutable master
status. The dirty checkout was preserved and no runtime source was changed by
this verification lane.

## Evidence identity

- HEAD: `0ea4e1ed9d99df55b4088e812736400cca8bff69`
- Branch: `cursor/strip-mass-node-bloom`
- Working tree: dirty and preserved
- Browser GPU: AMD Radeon 610M through ANGLE Direct3D 11; never SwiftShader
- Commander-HUD source stamp: `9f92c1fd7a89`
- Stage 7 production dirty fingerprint: `fca480e32e7a7d5ed0d449d0086339f83c17b1ced034c24fa25995c458b622e2`, stable before/after
- Stage 9 plan source set: `e809341aa9d89d21ffc93fbcdb9d0d0728db3bb44752c377577bf754b561a548`
- Physical S25 Ultra: not connected or tested
- Production services: not contacted or changed

The machine-readable summary is
[`../audit/stages06-09-current/summary.json`](../audit/stages06-09-current/summary.json).

## Stage 06 — Commander identity, voice and Deployment Arena

State: **partial**.

Current passes:

- `probe-commander-hud.mjs --json`: 139/139 on live offline matches across
  412×915, 915×412, 800×1280 and 1440×900, plus reduced-motion and
  missing-portrait cases. Six fresh captures were produced; source stayed
  unchanged throughout.
- `probe-commander-cue-wiring.mjs`: 23/23 deterministic fixed-step call-site
  checks.
- `probe-commander-voice.mjs --json`: 69/69 identity, roster, taxonomy,
  deterministic ordering, fallback and training-compatibility checks.
- `test-commander-signatures.mjs`: all nine playable signature IDs passed.

Visual review: the receiver remained inside the minimap, did not obscure or
capture gameplay controls, and the portrait/subtitle presentation was coherent
in the four captured viewports. The narrow phone receiver necessarily uses a
small portrait and abbreviated subtitle, but it stayed readable at capture
scale.

Open acceptance:

- The shipped state has **zero commander voice takes** for all nine
  commanders. Subtitle fallback works, but approved performances are absent.
- No current test proves the 3D Deployment Arena, shared card/hotspot state, or
  the 45% portrait-height requirement.
- The plan also requires 1280×800, 1920×1080 and one narrow/foldable capture;
  those were not covered by the current HUD probe.
- Physical-phone and owner presentation approval remain open.

## Stage 07 — Mobile UI and progression

State: **partial; core current automation passes, final acceptance does not**.

Current passes:

- `probe-stage7-production-ui.mjs`: 2/2 hardware-GPU profiles accepted, with
  10/10 fresh screenshots at 412×915 and 344×882. Production, construction,
  economy, queue-full, energy-full, keyboard, touch-target, overflow and WebGL
  checks passed with stable source identity.
- `test-stage7-production-contracts.mjs`,
  `test-stage7-input-navigation.mjs`, `test-stage7-input-cancel.mjs`,
  `test-stage7-economy-contracts.mjs`,
  `test-stage7-armory-migration.mjs`,
  `test-stage7-progression-presenters.mjs` and
  `test-stage7-progression-coherence.mjs` all passed.

Current failures and limits:

- `probe-stage7-loadout-summary.mjs` accepted 0/2 profiles. The new
  `#mfOnboardingChoice` dialog intercepted the probe's Start MASSFRONT tap in
  both viewports. A concurrent source change also caused the probe to reject
  its identity. No fresh screenshot from that failed run is claimed.
- A first `test-progression-rewards.mjs` invocation used its default inactive
  port 8100 and failed with `ERR_CONNECTION_REFUSED`; it refreshed no release
  artifact and is an invocation/environment failure, not gameplay proof.
- Manual inspection of the successful 344px captures found the population
  value abbreviated in the top bar and a partially visible production tab
  label. The automated row-overflow and 44px control contracts still passed,
  so this is recorded for human UX review rather than mislabeled as a runtime
  failure.
- Fresh-profile comprehension and physical-device sign-off remain open.

## Stage 08 — Faction VFX, gore and terrain response

State: **incomplete**.

Current passes:

- `verify-vfx-api-pickup-contracts.mjs`: 10/10 authoritative explosion/pickup
  ownership checks.
- `verify-resource-drop-presentation.mjs`: 16/16 static source-contract checks.
  The tool explicitly classifies itself as static evidence, not visual or
  release proof.
- `test-stage8-commander-entry-clock.mjs`: fixed-step entry-clock contract
  passed.

Current failures:

- `test-mobile-mobility-fx.mjs` failed immediately. Its expected Striker,
  Pyro, Rhino and Goliath speeds are 38/36/27/22; current `sim.js` values are
  21/18/13/10. This may be a stale expectation or an intentional rebalance,
  but the current gate is red until reconciled.
- `test-dark-faction-readability.mjs` failed on `Legion/mex`: the generated
  mesh did not contain both coated structural-core and armor material zones.

Open acceptance:

- No fresh, source-matched combat-VFX phone capture was created in this lane.
- The full weapon/faction matrix, gore Off/Reduced/Full, biological/material
  aftermath, force fields, fog, depth, GL-state restoration and context
  recovery remain unproven here.
- Cloud/high-altitude presentation still requires the actual S25 Ultra.

## Stage 09 — Planet-aware map grammar

State: **incomplete**.

Current passes:

- `verify-stage9-location-grammar.mjs`: PASS for five V1 contracts, 16 regions
  and 48 maps. Its own output still marks full catalog/planner/runtime coverage
  pending.
- `verify-stage9-location-plans.mjs`: 59/60 checks passed. All ten semantic
  classes, six map plans, deterministic hashes, rotation geometry and hostile
  fault cases passed.
- `test-stage9-galactic-bridge.mjs`: PASS.

Current failures:

- The Stage 9 plan verifier failed `source.stage9-runtime-chain`: the current
  manifest inserts `assets/data/battlefieldtopology-stage10.js` between
  `assets/data/locationplans.js` and `src/engine/worldsites.js`, while the gate
  requires the old contiguous chain. Planner execution and runtime topology
  remain explicitly pending.
- `verify-world-catalog.mjs` failed because `aelos_ridge_small` is tagged
  `arctic` rather than the planet theme expected by the gate.
- `test-world-asset-quality.mjs` failed because `mdlGatehouse` has no generated
  runtime payload.
- `test-world-boundary-content.mjs http://127.0.0.1:8901/` failed because the
  compact scenario did not exercise a city relic.

Open acceptance:

- No current source-matched Stage 9 phone visual matrix was produced.
- Planner execution, runtime topology, recovery fidelity, all required tactical
  scales and physical-phone visual acceptance remain open.

## Commands executed

```text
node tools/probe-commander-hud.mjs --json
node tools/probe-commander-cue-wiring.mjs
node tools/probe-commander-voice.mjs --json
node tools/test-commander-signatures.mjs
node tools/test-stage7-production-contracts.mjs
node tools/test-stage7-input-navigation.mjs
node tools/test-stage7-input-cancel.mjs
node tools/test-stage7-economy-contracts.mjs
node tools/test-stage7-armory-migration.mjs
node tools/test-stage7-progression-presenters.mjs
node tools/test-stage7-progression-coherence.mjs
node tools/test-progression-rewards.mjs
node tools/probe-stage7-production-ui.mjs
node tools/probe-stage7-loadout-summary.mjs
node tools/verify-vfx-api-pickup-contracts.mjs
node tools/verify-resource-drop-presentation.mjs
node tools/test-mobile-mobility-fx.mjs
node tools/test-dark-faction-readability.mjs
node tools/test-stage8-commander-entry-clock.mjs
node tools/verify-stage9-location-grammar.mjs
node tools/verify-stage9-location-plans.mjs
node tools/test-stage9-galactic-bridge.mjs
node tools/verify-world-catalog.mjs
node tools/test-world-asset-quality.mjs
node tools/test-world-boundary-content.mjs http://127.0.0.1:8901/
```

## Evidence files

- `audit/stages06-09-current/summary.json`
- `audit/stages06-09-current/commander-hud/report.json` and six PNGs
- `audit/stages06-09-current/commander-cue-wiring/report.json`
- `audit/stages06-09-current/commander-voice/report.json`
- `audit/stages06-09-current/stage7-production-ui/report.json` and ten PNGs
- `audit/stages06-09-current/stage7-loadout-summary-failed/report.json`
- `audit/stages06-09-current/stage9-location-grammar-report.json`
- `audit/stages06-09-current/stage9-location-plans-report.json`

The moved probe reports retain their original `.tmp`/`tmp` path strings because
those paths describe where the probe wrote them. The files listed above are the
durable locations for this verification pass.
