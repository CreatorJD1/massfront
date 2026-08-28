# MASSFRONT master plan — Stage 8 progress · 2026-08-28

Status: **IN PROGRESS** on `cursor/strip-mass-node-bloom` at committed tip
`c4090cc`. This checkout is the sole Main Source integration target.

Stage 7 engineering is complete. Its remaining unfamiliar-player comprehension
check is human acceptance, not an automation gap, and still blocks release
sign-off. Stage 8 engineering is allowed to proceed while that answer is
collected.

## Accepted implementation in this slice

- The effects-budget preset contract remains independent of graphics quality.
- Audio now has four real control lanes: effects, battlefield ambience, music,
  and voice. New and old saves preserve the prior effective defaults. Rendered
  unit/commander/tutorial samples use the voice bus; OS speech follows the same
  level; subtitles do not depend on voice volume.
- Match-entry commander subtitles and the HUD drain share the fixed-step match
  clock; `tools/test-stage8-commander-entry-clock.mjs` preserves that boundary.
  The apparent multi-viewport startup failure was a probe error: a fixed 1.8 s
  wall-clock sample sometimes represented only 0.1–0.2 s of headless match
  progress and caught the accepted cue before the next HUD service frame. The
  probe now waits on the real `hold` state with a bounded timeout, fingerprints
  `src/main.js`, and records queue/body/training counters on failure. Its four-
  viewport entry diagnostic passes 15/15 on AMD/D3D11 at
  `.tmp/commander-hud/runs/2026-08-28T17-00-32-793Z/report.json`.
- The updater retry regression discovers `gl.js` by manifest identity instead
  of a historical fixed index, preserving the same check as data scripts move.
- `commander-anime-flat-v1` is the sole new-work authority for human and robotic
  commanders: solid fills, crisp linework, and no shading. The registered
  portraits and PBR-lit robotic battle chassis currently fail that new visual
  contract and remain a bounded replacement task; this documentation change
  does not falsely mark them accepted.
- Main Source verification now acquires an atomic
  `.git/massfront-verification.freeze`, waits through a quiet preflight, and
  watches the checkout at every interface-matrix route boundary. Repository
  writers must honor the freeze; a missed instruction still aborts the capture
  on its first observed write instead of producing a long stale evidence run.
  Every checkpoint revalidates token ownership, branch, and HEAD; boot,
  completion-fingerprint, audit, and final-release boundaries are guarded.
  Authority-root, authority-branch, linked-worktree refusal, allowed `.tmp/`
  output, nested mutation/rename/deletion detection, token deletion/replacement,
  final-release detection, and cleanup pass in the temporary-repository test.
  Interrupted same-host leases have a PID-verified `clear-stale` path instead
  of being deleted or stolen.

Deterministic contracts:

- `node tools/test-stage8-effects-budget.mjs`
- `node tools/test-stage8-audio-buses.mjs`
- `node tools/test-stage8-commander-entry-clock.mjs`
- `node tools/test-save-persist.mjs`
- `node tools/test-updater-boot-retry.mjs`
- `node tools/probe-commander-voice.mjs --json`
- `node tools/evidence-foundation/workspace-guard-self-test.mjs`

## Rejected hard-surface source candidate

Claude's post-fix rebuild/consolidate/test cycle is not accepted, but it did
repair the proof-geometry contamination. The pre-fix history was 79 failures of
644; the completed property-aware rebuild reduced that to **11 failures of 644
checks**. The remaining failures are four small footprint violations—three
transit flyover merges at 2.7 m and one colonial depot shed at 2.1 m—and seven
road hygiene failures. Two road blends retain Camera/Cube/Light; 1,319 render
meshes in those blends remain without UVs, and their LOD0 smoothing/sharp-edge
contracts are incomplete.

The corrected consolidation exported all 262 modules and kept flagged proof/
evidence objects separate in the authoring blends. The generated world-kit GLBs
remain ignored and unregistered. They have no browser, OTA, APK, or IPA runtime
effect and must not be registered until the complete suite passes and
representative modules are visually inspected.

## Quiescent acceptance sequence

The final result for this slice is the last run after all source and document
writers stop:

1. `npm run gate`
2. `node tools/probe-commander-hud.mjs --json`
3. `node tools/capture-interface-matrix.mjs stage8-audio-accessibility-20260828-quiescent-v4`
4. `node tools/interface-audit/audit-interface-matrix.mjs .tmp/stage8-audio-accessibility-20260828-quiescent-v4/report.json`

Evidence counts only when the report binds the current HEAD, dirty-content
fingerprint, source runtime, hardware GPU, and unchanged completion state.
Derived output under `.tmp/` is evidence, never a second source tree.

The first 196-view attempt is retained as `UNKNOWN`: Claude changed source
during capture and two Windows headless pages reported WebAudio-device errors.
It is diagnostic history, not acceptance evidence. A later v3 diagnostic was
clean across all 196 views, but a read-only race review found that its guard did
not recheck a replaced lease or protect the post-fingerprint audit boundary, so
that result is also deliberately not accepted. Only the v4 path above may count,
and only when its own report is `PASS` with matching start/end fingerprints.

## Still open in Stage 8

- Replace and visually approve all commander art that fails
  `commander-anime-flat-v1`: the nine registered base-game portraits, the three
  exploration portraits, and the three shared PBR-lit robotic battle chassis.
  None may be promoted by reusing the shaded legacy profile.
- A current, accepted 1v1/1v2/1v3 performance set and minimum physical-device
  sustained-battle result. The five-seat 1v4 target is unsupported by the
  current four-seat runtime and must not be mislabeled as tested.
- Current GL recovery, terrain comparison, color-vision/high-contrast,
  non-color/non-audio alarm, keyboard/focus, large-text, and native Android Back
  acceptance.
- Real `.mfsave` export/download/re-import, corrupted input, low-storage, and
  interrupted local update/cancel/retry coverage.
- Current Android APK and iOS IPA install, lifecycle, interruption, offline,
  clean-install, upgrade, and new-game-to-result device runs.
- Hardening performance/device/updater harnesses to set `mf_offline=1` and
  reject every non-loopback request before they are allowed to run. No release,
  upload, deployment, or production request is authorized by this stage slice.

## Stage 7 human acceptance still required

Show a genuinely unfamiliar person the fresh Arsenal and Development screens
once, without coaching, and record verbatim answers to:

1. “What do Cores buy, and what do Research Data plus recovered materials buy?”
2. “Which effects persist, which crafted items wear, and which supplies apply
   to one match?”

Do not reveal the scoring key before the participant answers.
