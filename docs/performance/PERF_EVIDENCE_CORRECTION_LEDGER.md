# MASSFRONT performance-evidence correction ledger

Status: **S25 Ultra performance proof is still blocked. No 500- or 1000-unit performance claim is accepted.**

## Rejected Antigravity artifact — 2026-08-24

The original files are deliberately preserved:

- `tmp/perf-lab/metrics/1v1_duel_verdant_500u.json`
- `tmp/perf-lab/captures/1v1_duel_verdant_500u_git-c4090cc5785e.png`
- `tmp/perf-lab/metrics/summary_matrix_git-c4090cc5785e.json`

They are not benchmark evidence. The screenshot is the account/authentication gate rather than a battlefield. Its SHA-256 is
`e80ce8492e9239e562643c91306ba6bdb65a2ef70ebc3c6b1ba76daf2e7a205a`.
The JSON claims `totalArmySpawned: 1000`, while its sampled visibility total is only 34. Simulation, render, and GPU timings are
zero-filled without a supported flag or sample count, so those zeroes cannot be distinguished from missing telemetry. The source
identity is only the abbreviated HEAD `c4090cc5785e`; it omits the dirty worktree and tested runtime/package identities.

`tools/perf-lab/benchmark-report-generator.mjs` now writes
`tmp/perf-lab/reports/EVIDENCE_REJECTION_LEDGER.json`, preserves the source files, excludes rejected rows from Markdown/CSV, and
returns a failure exit code while any invalid, mixed, or incomplete evidence is present. This failure is intentional.

## Corrected evidence contract

An accepted run must now prove all of the following:

1. Enter gameplay through **PLAY OFFLINE → War Room → setup stages → DEPLOY**. Global functions existing on the auth screen do not count.
2. Reject auth UI, absent battle HUD, false `matchLive`/`running`, page errors, context loss, or failed hardware-GPU validation.
3. Label directly injected armies as `synthetic-load-in-real-match`; never describe them as organic gameplay.
4. Reconcile attempted, spawn-accepted, and post-settle authoritative counts by seat, faction, and team with the exact requested totals.
5. Store `supported` and `sampleCount` for every telemetry family. Unsupported/empty statistics are `null`, not zero.
6. Record full HEAD, dirty state, deterministic worktree/runtime/package fingerprints, entry SHA-256, preset, viewport/DPR, URL,
   renderer/backend, seed, camera state, simulation duration, and capture SHA-256.
7. Capture hashed start/mid/end battlefield frames with the real HUD and a diagnostic authoritative-count overlay.
8. Reject missing capture files, capture-hash mismatches, and reports that mix source, package, preset, viewport, or renderer identities.

The deterministic synthetic load is allowed only after real deployment and is explicitly labelled. It is useful for controlled
scaling diagnosis, but it does not replace a long, player-reachable battle or physical-device measurement.

## Focused verification completed

- `node --check` passes for every file in `tools/perf-lab`, its fixtures, and the three `tools/debug-lab` scripts.
- `node tools/perf-lab/perf-lab-self-test.mjs` passes 16 fixtures covering roster cardinality, auth-gate rejection, population mismatch, null telemetry,
  missing provenance, mixed runtime fingerprints, capture hashes, rejection-ledger generation, and CSV exclusion.
- Running the report generator against the preserved Antigravity files exits rejected and lists the legacy metric JSON in the ledger.

No long benchmark was launched during this correction.

## Remaining physical-device gate

S25 Ultra proof remains blocked until a new v2 evidence run is captured on the target phone (or a device-connected harness that can
record the actual mobile GPU/backend) and then corroborated by a real sustained battle. Desktop ANGLE/D3D11 evidence must never be
labelled S25 evidence. Required device proof includes 1v1, 1v2, 1v3, and 1v4 at the accepted population targets, real 30-fps/p95
frame evidence, thermal state, power mode, graphics preset, physical resolution, renderer, context-loss status, and player-visible
start/mid/end captures. Until those artifacts pass the v2 contract, the 500–1000-units-per-faction target is a design goal, not a
verified capability.
