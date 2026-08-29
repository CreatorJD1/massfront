# MASSFRONT master plan — Stage 8 progress · 2026-08-28

Status: **IN PROGRESS — the local browser closure is implemented, while physical-
device, commander-art, human-comprehension, and historical terrain-baseline
acceptance remain open** on `cursor/strip-mass-node-bloom`. This slice started
from local Main Source tip `2d882397`; the local checkout remains the sole
integration authority and dated folders remain transfer inputs only.

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
- Local update transfer and installation are now transactional across
  interruption boundaries. Check, channel switch, download, final staging,
  Apply, and Rollback claim synchronous UI ownership; cancellation is honored
  after every network/hash await but ends before the verified IndexedDB commit;
  retries start from file zero with a fresh controller and progress feed. Patch
  offers disclose the actual full-fallback bytes before consent. Atomic pending
  writes, exact displayed-payload identity, channel rechecks, probation guards,
  and a payload-bound shared IndexedDB lease prevent another tab/WebView from
  replacing, applying, or deleting a payload mid-operation. Boot selection,
  failed-start recovery, confirmation, and supersession are serialized and
  exact-identity guarded. Rollback uses two bounded payload slots plus one
  atomic exact-identity pointer: a failed or quota-aborted Apply cannot overwrite
  the currently validated recovery, successful promotion alone swings the
  pointer, and promotion without room for a new copy retires the older pointer
  instead of exposing a two-releases-behind rollback. Boot also clears only an
  exact committed-operation orphan and reclaims unreferenced slots after their
  Apply owner expires. Lightweight bundle metadata keeps the healthy path to
  one active-payload read: the 85 MiB
  logical-memory regression records zero reads of pending and rollback payloads;
  failed-start recovery reads exactly one rollback payload and no active or
  pending payload. Legacy installs backfill metadata once instead of repeatedly
  deserializing full releases.
- Portable `.mfsave` imports now have a guarded two-record transaction. Profile
  and career writes retry once, require byte-exact read-back, and report strict
  success/failure instead of swallowing quota errors. A failed import restores
  live career, identity, sync state, and the exact prior storage records; if
  storage disappears during rollback, the game explicitly tells the player to
  keep the session open rather than claiming the disk copy is safe. Cloud pull,
  forced file replacement, and the Auth Portal now honor that result and never
  mark a failed import synced or pulled.
- The guarded Chromium player path now completes the portable-save round trip
  at a 412×900 touch viewport on the AMD/D3D11 hardware renderer: the visible
  button creates a real browser download, the same bytes are reselected through
  the hidden file input, a forced quota failure leaves live and stored state
  unchanged, a valid retry restores the exact career and profile, and a one-
  byte corruption is rejected before confirmation. Web/PWA builds bind export
  to Chromium's trusted click contract; native Capacitor builds retain the
  drift-tolerant pointer-up handler needed by Android WebView. The probe uses
  one bounded evidence directory and fixed artifact names so retries no longer
  accumulate timestamped folders or attach stale screenshots.
- Legacy Armory-refund grant signals are held until the imported career is
  durable. Rollback discards the non-durable signal, preventing a rejected old
  save from queuing a phantom Core refund. The canonical-faction takeover also
  forwards the full file-import argument list, so a player-confirmed lower-
  progress file still replaces the current career as requested.
- A temporary economy-queue storage failure now retains the idempotent grant in
  the career record, survives restart, retries it into the durable queue every
  45 seconds, and blocks server reconciliation from replacing local Cores while
  that grant is still pending. A queue revision also rejects a stale server
  balance response when a new gameplay grant arrives during the GET. Automatic
  cloud pull distinguishes an empty account slot from
  a present but unreadable payload; corrupt or unsupported cloud data is shown
  as an error and is never silently overwritten by the device save.
- Tactical team identification is now a persisted, default-off accessibility
  mode. Enabling it applies a fixed friendly/hostile/unaligned palette to unit
  presentation and health bars while preserving health as the bar-length cue;
  disabling it restores faction-authored livery. The minimap adds batched
  circles, triangles, and crosses so allegiance does not depend on color, keeps
  its markers and outlines legible at the reachable 56/84 px portrait and
  intrinsic 256 px landscape, tablet, and desktop sizes, and
  does not disclose units outside the existing visual/radar gates. Brood combat
  forces classify as hostile while ordinary wildlife remains unaligned.
- Its guarded hardware-GPU player-path capture passes 193 assertions across 20
  tactical states and 40 full/minimap PNGs at the reachable 56, 84, and 256 px
  minimap sizes. The set covers native and accessible close/strategic/radar-only/
  hidden states, exact native-livery restoration, and Brood hostile identity.
  The project owner visually reviewed and approved the captured set on
  2026-08-28; `.tmp/stage8-team-identification/report.json` is the bounded local
  machine-evidence report.
- The shared offline diagnostic boundary now fails closed across all 13 current
  browser lanes. Before navigation it blocks non-loopback HTTP and WebSocket
  traffic, bypasses service workers through Chromium CDP, blocks new service
  workers where the lane owns its context, verifies both supported offline
  storage keys by exact read-back, and rejects an active controller or any
  registration. Finalization closes the page before checking late unload or
  shutdown traffic, so an unfinalized run cannot claim network isolation. The
  portable-save browser probe uses the same finalization contract.
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
- Interface Text Size now persists independently at 100%, 125%, 150%, or 200%.
  Menus and critical HUD labels scale through rem-based layout without browser
  zoom or enlarged tactical hit geometry. Native battle controls provide
  exactly-once Enter/Space activation while retaining pointer timing, disabled
  controls cannot activate through assistive-technology click fallback, and
  front screens, Back navigation, Pause, and Resume explicitly preserve focus
  ownership. The guarded accessibility probe covers text scale, focus/Back
  hierarchy, contrast and forced-colors behavior, muted monochrome alarms,
  offline isolation, source identity, and hardware-GPU rendering.
- GL recovery acceptance now separates diagnostic lease/re-entrancy checks from
  the production test. The production page must traverse the real Standard-match
  UI through DEPLOY, prove an active unpaused match, lose and restore the actual
  WebGL context, and demonstrate owned pause/release, continued RAF service,
  held-then-advancing simulation time, automatic draw activity, fresh GL and
  terrain resources, and a non-empty readback. The report is invalid if the
  source, packaged runtime, branch, HEAD, or guarded completion state changes.
- New desktop performance evidence is isolated under `tmp/perf-lab/current/`;
  preserved legacy or rejected JSON cannot contaminate the current report.
  Scenario cleanup is bounded, unit counts are restricted to the declared test
  matrix, and console errors fail before, during, and after sampling. The current
  runtime supports four seats, so the valid stress set is 1v1, 1v2, and 1v3 at
  500 units per faction; a five-seat 1v4 result must not be invented.
  Contract-valid capture is distinct from performance success: the local desktop
  budget is frame-time p99 at or below 33.3 ms, while minimum-device sustained
  acceptance remains a separate physical-device gate.
- Terrain acceptance now records source/runtime fingerprints, fixed artifact
  hashes, checkpoints, and the exact baseline-file hash. It rejects a baseline
  inside its own bounded output directory. Without a valid historical baseline,
  it may capture current absolute sharpness and shoreline evidence but must exit
  as `INCOMPLETE`; it cannot claim the historical 30–50% high-frequency or
  shoreline-reduction comparisons passed.

Deterministic contracts:

- `node tools/test-stage8-effects-budget.mjs`
- `node tools/test-stage8-audio-buses.mjs`
- `node tools/test-stage8-commander-entry-clock.mjs`
- `node tools/test-stage8-save-transfer.mjs`
- `node tools/test-stage8-team-identification.mjs`
- `node tools/test-stage8-accessibility-contract.mjs`
- `node tools/test-stage7-input-navigation.mjs`
- `node tools/test-gl-probe-recovery-contract.mjs`
- `node tools/test-perf-terrain-evidence-contract.mjs`
- `node tools/perf-lab/perf-lab-self-test.mjs`
- `node tools/test-offline-network-isolation.mjs`
- `node tools/test-stage8-offline-diagnostics.mjs`
- `node tools/test-save-persist.mjs`
- `node tools/test-stage7-armory-migration.mjs`
- `node tools/test-faction-canonical-identity.mjs`
- `node tools/test-stage8-updater-interruption.mjs`
- `node tools/test-updater-boot-retry.mjs`
- `node tools/test-updater-two-launch.mjs`
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

1. Commit the complete local closure so every evidence report binds one stable
   branch and HEAD; do not edit tracked files during or after the capture.
2. `npm run gate`
3. `node tools/probe-stage8-accessibility.mjs`
4. `node tools/verify-gl-probe-recovery.mjs`
5. `node tools/verify-perf-terrain-acceptance.mjs` — expected `INCOMPLETE` until
   an owner-approved historical baseline exists; current absolute evidence is
   still useful and must not be relabeled `PASS`.
6. Run the isolated 1v1, 1v2, and 1v3 desktop performance probes sequentially
   at 500 units per faction, then generate the current-lane report.

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
  current four-seat runtime and must not be mislabeled as tested. Desktop
  evidence does not substitute for the physical-device sustained result.
- Historical terrain-comparison acceptance remains open until an owner-approved
  baseline is supplied. The current probe must report `INCOMPLETE` without it.
  Tactical team-identification small-phone shapes, health bars, restored faction
  livery, and fog/radar behavior have completed guarded browser visual review;
  the new GL-recovery and broader accessibility probes count only when their
  final guarded reports are `PASS` on the stable closure commit.
- Native Android Back acceptance remains a physical-device requirement even
  after the browser keyboard/focus/Back contract passes.
- Native Files/Share physical-device acceptance for `.mfsave` remains open.
  Actual Chromium download/re-selection is accepted by
  `tools/probe-stage8-save-transfer.mjs`; its current PASS report is
  `.tmp/stage8-save-transfer/report.json`, with isolated-browser ownership,
  hardware GPU, offline/network isolation, stable source identity, all five
  player-path assertions, hashed files, and a visually inspected screenshot.
  The deterministic contract covers
  production encode/decode, a fresh-device decoded-file import, magic/schema/
  hash/truncation/size rejection, download fallback/cancel, both quota keys,
  retry-once, read-back mismatch, absent prior records, mid-transaction outage
  disclosure, faction canonicalization, legacy-refund side effects, recovered
  grant-queue persistence/restart replay, stale-balance rejection, and corrupt-
  cloud preservation and supported/unsupported commander-color hardening.
- Physical WebView/background/OS-kill acceptance for local update download,
  cancel, retry, staging, Apply, automatic failed-start recovery, and Rollback.
  Deterministic production-source coverage for those interruption state
  transitions and cross-document storage races is complete.
- Current Android APK and iOS IPA install, lifecycle, interruption, offline,
  clean-install, upgrade, and new-game-to-result device runs.
- No release, upload, deployment, or production request is authorized by this
  stage slice.

## Next ordered local slices

1. Complete native Documents/Cache/Share behavior on Android/iOS physical
   devices; the real Chromium download/re-selection path is accepted.
2. Run current 1v1/1v2/1v3 performance evidence through the shared offline
   boundary only after hard-surface writers stop and source identity can remain
   stable for the whole capture.
3. Replace the registered commander portraits and shared robotic battle chassis
   that fail `commander-anime-flat-v1`, then visually approve the replacements
   before registration or release.

## Stage 7 human acceptance still required

Show a genuinely unfamiliar person the fresh Arsenal and Development screens
once, without coaching, and record verbatim answers to:

1. “What do Cores buy, and what do Research Data plus recovered materials buy?”
2. “Which effects persist, which crafted items wear, and which supplies apply
   to one match?”

Do not reveal the scoring key before the participant answers.
