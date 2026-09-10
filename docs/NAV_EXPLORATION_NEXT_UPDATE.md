# Navigation and exploration next-update acceptance

The first-pass record below is retained as history. For the September 6
continuation and current v1.33.76 candidate, read
`docs/RELEASE_1.33.76_PREPARATION.md`. In particular, the first-pass statement
that cross-page downloads and mission-return verification remain unfinished
has been superseded. Publication remains blocked, now including a verified
old-APK migration gap; no Stable activation has occurred.

Requested September 6, 2026: finish the existing exploration experience, fix
real-time obstacle routing, verify production repeat OFF and accurate rallying,
then release through the established updater. Multiple agents share the one
canonical Local checkout. No title-art replacement or geometry decimation.

## Ownership

- Navigation implementation: simulation, bounded repeat control in main,
  navigation hash/reset integration, focused navigation contracts.
- Independent verification: `tools/test-nav-orders.mjs`, real production and
  unit movement driven by the current browser runtime.
- Exploration implementation: existing space experience and UGA command UI;
  original authored section model and title art remain untouched.
- Integration owner: source review, acceptance checks, packaging and release.

## Acceptance required before activation

- Unresolved or temporarily rebuilding routes retain destination and queued
  orders; construction/destruction triggers rerouting without teleportation.
- Combat pursuit navigates around obstacles; existing attack-move behavior is
  preserved. Projectile line-of-sight redesign is not part of this correction.
- Production follows the selected rally marker without arbitrary random goal
  offsets; ground, water and air destination rules remain distinct.
- Repeat OFF stops automatic replenishment; existing explicitly queued work
  must not be silently deleted. Verify through the actual bound button and
  production completion, not by changing the repeat boolean directly.
- Deterministic reset/hash behavior and representative army navigation cost.
- Authored ship section UI, valid preferred-faction commander selection,
  debrief return, truthful crafting routes and old Classic War Table remain.
- Packed browser, Android assets, OTA and published surfaces share verified
  source identities. Do not use the earlier v1.33.75 APK as this candidate.

## Known unresolved release gates

The restored headquarters remains above per-model delivery budgets; the earlier
lossless pass did not clear phone performance or Safari acceptance. Galactic
human co-op lacks an authenticated synchronized session adapter and must not
be advertised as working. Future startup downloads are interrupted when their
owning page navigates into the standalone exploration document. These are not
fixed by navigation or UI-only changes.

Publication version and destination have been requested for confirmation.
No version bump, APK build, upload or activation has occurred in this pass.
This is a working acceptance ledger, not a release-completion claim.

## Verification so far

- Concatenated 112-source bundle passes. The first pack attempt correctly
  rejected a stale exploration manifest; rebuilding the manifest and packing
  then passed (405 module files, 146.06 MiB; complete www about 288.6 MiB).
- Packed 412x900 RTX 4060 launch test passes updater, original-title intro,
  offline login, space briefing, research construction, Classic War Table,
  return to exploration and secured commander-hiring route. External requests
  were deliberately blocked; this does not prove production updater delivery.
- Navigation browser failures are retained in `tmp/nav-next/`; initial tests
  exposed coarse-sector fallback overriding detailed unreachable results.
- Exploration component tests pass; `tmp/exploration-flow/` is component UI
  evidence, not a complete deployed mission/reward settlement test.
- The source-block navigation, asset-pack integrity/resume, save-recovery,
  launch-order, resource-ownership and deterministic-clock contracts pass.
  Focused tests do not substitute for mobile or online acceptance.

## Final local result

`tmp/nav-next/after-orders-ui/report.json` passes all 11 cases on RTX 4060
ANGLE D3D11 after real updater/intro/offline/UGA/Classic/setup/deploy entry.
All recorded runtime source hashes match both current source and `www`.
No page errors or source drift. Earlier failed reports are retained.

- Blocked routes preserve goals and queues, resume after reopening, avoid a
  newly constructed factory's full footprint and route a crowd through a gap.
- Combat pursuit reaches its target around a factory. Enemy-wall breach
  destroys five blocking walls and resumes the unchanged strategic goal.
- Rally goal differs from the marker only by Float32 representation
  (0.0000407 world units); hull-aware arrival settles 7.88 units from it.
- The visible, enabled, locally owned Repeat button receives synthetic touch
  and compatibility-click events through its real handler. ON requeues one;
  OFF drains to zero and stays false. Endless repeat after OFF was NOT
  reproduced. The UI now explains remaining queued work; no manual queue
  entries are silently deleted. This is not physical-device input evidence.
- Repeated reset/order trajectories match. Desktop 500-unit order authoring
  p95 is 2.3 ms and fixed unit-tick p95 is 1.4 ms; these are neither mobile
  measurements nor full rendered-frame performance.

Navigation implementation also restores the strategic field after temporary
combat pursuit, resets progress histories, and hashes behavioral history while
excluding the process-local cache epoch. The detailed field's unreachable
answer now outranks misleading coarse-sector portal hints.

No Android artifact, source archive, OTA, HF Space upload, version bump or
activation was performed. Canonical source and packed preview are updated;
all remote and native channels are skipped pending the release gates above.
The exploration UX improvements are implemented, but complete mission receipt
integration, human co-op, device performance and cross-page startup downloads
remain incomplete. No agents retain a write task after this pass.
