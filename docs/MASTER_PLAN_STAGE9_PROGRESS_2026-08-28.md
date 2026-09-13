# MASSFRONT master plan — Stage 9 progress · 2026-08-28

Status: **IMPLEMENTATION COMPLETE — source-bound local hardware-browser
acceptance and owner visual approval remain pending** on
`cursor/strip-mass-node-bloom`. Stage 9 is an explicitly proposed extension
beyond the tracked Stage 8 plan; it does not close or replace Stage 8's open
release gates.

## Stage 9 slice

The default-off `uga_pale_bloom` experiment connects the standalone Galactic
Operations module to a real local-solo base-game battle and back again. UGA is
the neutral operation authority, the player deploys a Nova Coalition, Crimson
Dominion, or Syndicate Coalition proxy force, and the Brood is the only AI
opponent. The bounded tactical proxy is `vespera_spire_medium` (Vespera Spire),
not a claim that the authored Karak mission world has been implemented.

The operation remains source-tree experimental and is excluded from packaged
builds. Direct standalone module launches retain the LocalSandbox simulator.
There is no co-op, multiplayer, MMO, production-service, release, upload, or
deployment scope in this slice.

## Accepted engineering contract

- The base game issues a seven-day, same-tab entry ticket. The module prepares
  a 24-hour request and launches the base runtime with only an opaque nonce.
  Profile-hashed storage namespaces prevent cross-career result application.
- Only the Pale Bloom UGA/Brood/local-solo operation is accepted. The request
  fixes purge rules, hard difficulty, infestation, one Brood AI, no allies, and
  the Vespera Spire medium map. Invalid, stale, mismatched, or unsupported
  requests fail closed instead of falling into the standalone career.
- The selected deployment is translated into real base-game units and
  structures. Doctrine and support choices apply catalog-driven tactical score
  modifiers. Survey Link creates a 24-second, radius-15 deployment scan.
  Repair Nanites heal only starting friendly units at one percent max HP per
  second from a finite 20-percent reserve and use unit-generation checks so a
  recycled simulation slot cannot inherit the effect. Medical Cache reduces
  module-result injury severity by one band.
- While the bridge owns the match, base-career rewards, snapshots, permanent
  crates, post-match ads, and billboard impressions are suppressed. A pre-
  existing dropped-session record is preserved. The bridge records diagnostics
  for the package, spawn manifest, selected effects, and suppressed writes.
- A terminal tactical report is serialized once and retried as the same exact
  byte sequence after storage failure. Reloading after the result mirror is
  written returns that existing result rather than replaying or overwriting the
  battle outcome.
- Module result application is exactly once and crash-consistent. Consumption
  durably writes the receipt and ledger application before the URL is cleaned;
  mirror cleanup is a separate idempotent finalization handshake. Reloading in
  any window resumes, proves the prior application, or offers an explicit
  abandonment/refund path without double payout.
- The debrief and persistent Debrief Archive expose the applied result. A
  returned-result validation error is quarantined and shown in the mounted
  recovery UI; only host/bootstrap selection failure uses the fatal veil.

## Deterministic verification

- `node tools/test-stage9-galactic-bridge.mjs`
- `node modules/space_exploration/tools/tests/massfront-solo-host.test.mjs`
- `node modules/space_exploration/tests/domain.test.mjs`
- `node modules/space_exploration/tools/tests/exploration-host-v1.test.mjs`
- `node modules/space_exploration/tools/tests/space-experience-host-seam.test.mjs`
- `node modules/space_exploration/tools/tests/commander-roster-contract.test.mjs`
- `node modules/space_exploration/tools/readiness/readiness-selftest.mjs`
- `node tools/test-space-module.mjs --self-test`
- `node tools/capture-stage9-galactic-operations.mjs --self-test`
- `node tools/bundle.mjs`
- `npm run gate`

## Source-bound acceptance

Final browser evidence must be generated only after the Stage 9 source is
committed and quiescent. `tools/capture-stage9-galactic-operations.mjs` owns the
workspace freeze, uses an isolated no-store local server and the project
Playwright launcher, requires a hardware WebGL renderer, traverses the visible
module and base-game interfaces through deployment and natural match result,
then returns through debrief, archive, and reload.

The authoritative local report is
`.tmp/stage9-galactic-operations/report.json`. It must bind the branch, HEAD,
base/module/runtime fingerprints, viewport, graphics backend, network
isolation, career bytes, request/result key lifecycle, package/effect
diagnostics, exactly-once receipt, and all screenshots. A machine PASS does not
substitute for the project owner's visual approval of those screenshots.

## Gates that remain open

Stage 8 still requires physical-device lifecycle and native-file acceptance,
current performance evidence, an owner-approved historical terrain baseline,
anime-flat commander-art replacement and approval, and the remaining human
comprehension check. Stage 9 does not authorize an APK, IPA, OTA, web, Space,
or source release.
