# MASSFRONT master plan — Stage 9 exact-location progress · 2026-08-29

Status: **BOUNDED STAGE 9 ENGINEERING COMPLETE; integration acceptance remains
open. Stage 9A/9B are committed; Stage 9C bounded-transaction execution and
Stage 9D dropped-session recovery are implemented in the Local working tree.
Current-source plan verification passes 60/60, V1 runtime passes 6/6 maps and
16/16 authored sites, full compatibility passes 77/77, utility/recovery passes
38/38, the clean 12-image hardware recapture passes its machine gate, and
`npm run gate` passes. Explicit owner visual approval remains open. The
bounded implementation is isolated by
the Local engineering commit containing this ledger; that commit is not visual
approval or release authorization. The accepted boundary and P2 debts are
recorded below rather than hidden inside a broad completion claim.**

This record covers the Stage 9 exact-location slice. It does not replace
`docs/MASTER_PLAN_STAGE9_PROGRESS_2026-08-28.md`, the separate Galactic
Operations record, and it does not close Stage 8's physical-device,
commander-art, performance, terrain-history, or human-review gates.
The separate Galactic Operations full capture remains deferred because a
concurrent Blender-source report write prevented a clean whole-capture window;
that is not an exact-location blocker and is not evidence for this slice.

## Source authority and ownership

- Canonical Local checkout:
  `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`
  (also exposed through the `MASSFRONT-main-source` junction).
- Branch: `cursor/strip-mass-node-bloom`.
- Parent committed tip before this bounded integration:
  `17707b46cadadf067975758d3c6a30a9fadb2f0f`.
- The Local engineering commit containing this ledger integrates the Stage
  9C/9D source and verifier changes. Its evidence remains tied to the explicit
  fingerprints below and is not presented as release evidence.
- This slice owns `src/engine/gl.js`, `src/engine/worldsites.js`,
  `src/game/sim.js`, `src/main.js`, `src/session.js`,
  `tools/probe-exact-template-runtime.mjs`,
  `tools/probe-live-utility-jobs.mjs`, the dropped-session sentinel adjustment
  in `tools/capture-stage9-galactic-operations.mjs`,
  `tools/capture-stage9-location-visuals.mjs`, and this ledger.
- Blender world kits, the hard-surface model pack, VRoid characters, and all
  Stage 10 files remain separate parallel ownership. This slice does not
  modify, stage, validate, register, or claim those products.

## Stage 9A — committed location grammar

Commit `54e43aec8436645cbadfdf2a78920fead8ce4fe7`
(`feat: add stage 9 location grammar contracts`) established the data contract
before production placement changed:

- Added versioned world-location, region, adaptation, faction-occupation, and
  condition-variant grammar in `assets/data/locationgrammar.js`.
- Bound the four homeworld catalogs and their 16 regions to 48 canonical maps
  without treating Aelos as an implicit fallback.
- Added typed `LOCATION_*` failures for missing, unknown, incomplete, and
  incompatible catalog data.
- Registered the grammar in both runtime and bundler load order.
- Added `tools/verify-stage9-location-grammar.mjs` so catalog drift remains
  deterministic and source-bound.

## Stage 9B — committed exact plans

Commit `17707b46cadadf067975758d3c6a30a9fadb2f0f`
(`feat: add stage 9 exact location plans`) added the first exact plan catalog:

- Six `LocationMapPlanV1` maps use ten authored template classes: city,
  colony, outpost, base, refinery, relic, ruin, spaceport, derelict, and Brood
  site.
- `assets/data/sitetemplates-stage9.js` is FULL_V1-only. `LEGACY_V0` and
  `PENDING_V0` maps continue to use their existing legacy templates.
- Pure preflight validates map, region, template identity, semantics,
  adaptation, topology, geometry, layout, count source, and seed before it can
  consume planner RNG or mutate the live world.
- Plan hashes include semantic and layout signatures. Unknown, invalid,
  hybrid, and incomplete plans fail closed instead of borrowing a generic
  procedural site.
- `tools/verify-stage9-location-plans.mjs` enforces the plan catalog and both
  new data files are registered in both manifest paths.

The current FULL_V1 boundary is deliberately limited to these six maps:
`pyraeth_caldera_medium`, `nordhall_frost_medium`,
`pyraeth_flats_medium`, `aelos_basin_medium`, `aelos_coast_medium`, and
`vespera_refinery_medium`. The other maps are not silently upgraded.

## Stage 9C — bounded atomic FULL_V1 execution

The production planner treats exact planning and the pre-commit CPU terrain
state as one transaction. A successful `planDistricts()` call is the bounded
commit point; this is not a claim that every later terrain/GPU finalization
step is transactional:

- Each request is bound to its exact preflight template. FULL_V1 never calls
  the generic runtime selector.
- Districts, streets, plots, props, rejection counters, and resource movement
  are built in scratch state. Production arrays are replaced only after every
  required request and required plot succeeds.
- A preflight failure, injected Nth-request failure, or unexpected planning
  exception before commit leaves the previous world intact and emits a typed
  failure. No partially authored hybrid planner world is accepted.
- `SITE_STAMP` v4 records planner schema/version, plan hash, normalized
  topology key, all ten V1 class counts, request/template identities, required
  plots, props, typed failure detail, and a realization hash over committed
  sites and final resource coordinates.
- Stable IDs bind sites, template plots, authored props, relics, site crates,
  industrial ring tanks, rocks, and flora to request instances. Recovery uses
  these IDs, not transient array indices.
- FULL_V1 resource fields move only after exact site spans are known. The
  cached `siteResourcePlan` stores final mass/energy coordinates, seed, plan
  hash, and topology key, and reapplies them on a same-map reset. Each active
  start retains required opening mass and energy access.
- `mfWorldTopologyKey()` includes battlefield scale, player start zone, and
  normalized active AI/ally seat zones. Terrain and resource caches bind to
  this topology so a changed spawn layout cannot reuse a world authored for a
  different start arrangement.
- `applyTheme()` and direct `buildTerrain()` calls run fail-closed preflight
  before terrain mutation. FULL_V1 suppresses provisional resource bumps and
  grades only the final committed resource fields.
- `buildTerrain()` checkpoints the previous terrain canvas, heightfield,
  land/water passability arrays, in-place slope/cell/repair bytes, seeded
  stream, terrain statistics, and road-grade telemetry before it begins the
  destination CPU build. An injected failure after those globals have changed
  but before the planner commits restores both their identities and bytes.
- `applyTheme()` separately restores AI/start selectors, deposits, geysers,
  seed/civic cursor, and setup window properties when the build rejects. Theme
  texture replacement is deferred until the destination build succeeds.
- Persistent prop plans re-arm transient setup queues on reset, preserving the
  same authored tanks, crates, rocks, and flora.
- Legacy repeat determinism resets process-global `civicKitSeq` at the same
  seeded `planDistricts()` boundary as map-local RNG. Civic kit choice,
  district span, and adjacent resource movement no longer depend on the map
  generated immediately beforehand.

### Bounded terrain transaction residual (P2)

The production fault fixture reaches a mutated destination canvas,
heightfield, `PASS`, and `PASS_WATER`, injects a missing second authored
request inside `planDistricts()`, and proves exact rollback of the previous
CPU/planner/resource state. A following clean build is deterministic and
produces the expected topology, plan hash, realization hash, and stamp.

The rollback is deliberately bounded at the planner commit. Once
`planDistricts()` succeeds and `locationPlanCommitted` becomes true, a later
exception from world-kit initialization, final resource grading, terrain
painting, naval/road-mask construction, terrain-mesh creation, height-texture
upload, or terrain-texture upload is rethrown without restoring the old world.
There is no post-commit failure-injection proof. Extending the transaction
through those CPU/GPU finalization phases remains P2 transaction-completeness
debt; Stage 9 closure therefore claims atomic planning and pre-commit terrain
rollback, not an atomic end-to-end terrain/GPU build.

### Traversal and corner-cut correction

The exact runtime probe now validates every one of the 16 realized FULL_V1
sites against the authoritative infantry clearance grid. For each site it
samples passable authored-street cells, selects a passable outer-annulus goal,
runs the production distance field, and traces a bounded route while rejecting
blocked cells, loops, invalid steps, and diagonal corner cuts. Repeat runs must
produce the same route signature.

That gate exposed a production mismatch: `computeField()` correctly prevented
diagonal corner cutting while flooding distances, but final direction
extraction could still select a diagonal whose two orthogonal neighbors were
blocked. Direction extraction now applies the same two-cardinal clearance
check as the flood. The source-matched V1 run passes **16/16 authored sites**.

Spawn-to-site reachability is recorded as a diagnostic only. It is not an
acceptance gate because a location can be intentionally disconnected from a
particular spawn while still requiring internally valid authored streets and
an accessible site perimeter.

## Stage 9D — deterministic, reward-free dropped-session recovery

Dropped sessions retain storage key `mf_dropped_session_v1`, while new
snapshots use root schema version 2:

- FULL_V1 snapshots bind map seed, planner schema/version, stamp version, plan
  hash, realization hash, topology key, ordered site/plot/prop IDs, and dynamic
  state for zones, relics, tanks, crates, authored flora, finite resources, and
  site timers.
- Remaining wreck salvage, Commander level/XP/modifiers/unlocks/cooldowns, and
  reward-bearing statistics are captured so recovery cannot recreate an
  already-paid reward or roll earned progression backward.
- Resource identity includes final coordinates, initial tier/capacity,
  remaining reserves, complete survey bit mask, and restored
  extractor/geothermal binding. Runtime `taken` state is derived from restored
  buildings rather than trusted from storage.
- Version-1 hashless snapshots remain compatible with known `LEGACY_V0` and
  `PENDING_V0` maps. They are rejected on FULL_V1 maps. Unknown maps,
  mismatched setup/theme, hybrid plans, stale hashes, topology drift,
  realization drift, invalid IDs, impossible resource claims, and malformed
  dynamic state fail with typed `SESSION_*` codes.
- Static compatibility is checked before resume setup mutates menu globals.
  Regenerated world state and additive payloads are validated before a fresh
  unit or structure is removed, so failure leaves a coherent fresh match.
- `sessCheckRosterRealizable()` proves before the wipe that combat rosters fit
  their shared faction caps while reserving absent Commander seats, neutral
  bodies fit the neutral cap, hostile Brood bodies fit the opposing faction
  cap, and version-2 wallet rows exactly match regenerated seat topology. A
  failure returns `SESSION_ROSTER_UNREALIZABLE` without changing the world.
- After the wipe, each building and unit replay is mandatory and counted. A
  rejected spawn, incomplete handle map, or other replay invariant returns
  `SESSION_RESTORE_REPLAY_FAILED`; `deployCarrier()` immediately regenerates a
  clean normal deployment rather than leaving a partial restored match.
- Recovery writes stored state directly. It does not call reward-emitting
  collapse, tank, wreck, or crate handlers. District completion uses a
  persistent `claimed` guard, preventing duplicate bounty payment.
- Story-campaign, Weekly, and Training snapshots are deliberately suppressed
  while those modes are active. Their recovery is **unsupported** in this
  Stage 9 slice; this is an explicit fail-closed limitation, not implied
  coverage.

The exact FULL_V1 fixture restores a finite resource with survey mask `3`,
remaining capacity, and its binding exactly, while `rewardCalls` remains
empty. Plan-, realization-, and hashless-v1 rejection fixtures also prove the
fresh world remains unchanged on rejection.

The live utility fixture adds exact extractor lifecycle coverage. It preserves
three unique finite-node reservations, a nearly complete extractor's progress
and paid construction state, one already-spent package-Prospector grant, and
one pending grant. The restored unfinished extractor remains unfinished before
simulation advances, then completion grants exactly one new Prospector; the
spent grant does not resurrect.

The same fixture proves three admission failures are atomic: 501 combat bodies
against a 500 cap, 152 neutral bodies against a 151 cap, and hostile Brood
bodies consuming the enemy cap plus its missing Commander reservation. All
three return `SESSION_ROSTER_UNREALIZABLE` with an unchanged world signature.
The exact 500/500 boundary succeeds with the player's Commander deliberately
ordered last. An injected first-row replay exception through the real
`deployCarrier()` path returns `SESSION_RESTORE_REPLAY_FAILED` and leaves a
fresh active phase-0 carrier, no live match, no player units or structures, no
pending snapshot, and no stored dropped session.

The V1-only hardware fixture also covers the true cold-reload chain. It loads a
version-2 FULL_V1 session, calls `sessResume()`, `newSkirmish()`,
`deployCarrier()`, and `sessRestoreInto()` exactly once in the production
order, then matches the saved units, structures, Commander state, clocks,
banks, and finite resources and clears the pending/storage state.

### Recovery fidelity debt (P2)

Atomic rejection and replay do not make the schema a complete serialization of
every match subsystem. Version 2 still does not round-trip:

- generic non-Commander maximum HP (`uhpm`); the player Commander has a
  separate exact `maxHp` field;
- complete structure-upgrade internals: `lvl` is saved, but upgraded `hpm`,
  factory `tier`, and active `upT`/`upMax` progress are not;
- structure production `queue`, `repeat`, and `prodT`; or
- `researched`, `resDone`, `researchCarry`, and their derived research
  multipliers.

Those omissions can lose or re-derive technology and production progress even
when the enumerated Stage 9 state restores coherently. They remain explicit P2
recovery-fidelity debt. This ledger claims fail-closed, reward-free, atomic
recovery for the state listed above, not exact full-match recovery for these
unserialized systems.

## Verification ledger

| Gate | Current result | Evidence / qualification |
| --- | --- | --- |
| `node tools/verify-stage9-location-grammar.mjs` | **PASS** | Five contracts, 16 regions, and 48 canonical maps at `.tmp/stage9-location-grammar/report.json`. |
| `node tools/verify-stage9-location-plans.mjs` | **PASS 60/60** | Six plans and ten templates at `.tmp/stage9-location-plans/report.json`. Its two static-only pending notes are supplied by the live runtime lanes below, not failures. |
| `MF_STAGE9_V1_ONLY=1 node tools/probe-exact-template-runtime.mjs` | **PASS; 6/6 maps and 16/16 sites** | Current deep report `.tmp/stage9-v1-only-final/report.json`, generated `2026-08-29T13:59:29.583Z` on source set `314110af7fff210f522c3199f91ab8695e26815a45458f4480db3b6f13cb9131`, AMD Radeon 610M through ANGLE D3D11. It covers exact order/IDs, topology-bound resources, deterministic repeat, planner and production-terrain rollback, traversal, v2 recovery/rejection, and the true cold-reload path. |
| Full compatibility run of `node tools/probe-exact-template-runtime.mjs` | **PASS 77/77** | Current-source report `tmp/site-template-runtime/report.json`, generated `2026-08-29T14:11:30.583Z` on the same source set with `v1Only: false`: 71 legacy cases plus FULL_V1 6/6 and authored-site traversal 16/16; four typed environmental-exhaustion warnings; zero required-plot failures, silent drops, missing templates, probe failures, page errors, or console errors. |
| `node tools/probe-exact-template-placement.mjs` | Historical PASS | The legacy geometry fixture previously retained identical before/after hash `7c1f8ffd8cd8090a62ff8d8e12551ee527ebd60b799b6e37d50f6b7b0dbcbb74`. It is historical context, not the current closure authority; the source-matched 77/77 production runtime lane is. |
| `node tools/probe-live-utility-jobs.mjs` | **PASS 38/38** | Current report `.tmp/utility-job-integration/2026-08-29T13-54-21-982Z/report.json`; includes exact finite-resource/extractor recovery, malformed-state fail-closed checks, combat/neutral/hostile-Brood cap admission, exact boundary order, clean replay fallback, v1 pending-map compatibility, and deterministic repeat. Zero runtime or console errors. |
| `node tools/capture-stage9-location-visuals.mjs` | **MACHINE PASS 12/12; HUMAN REVIEW PENDING** | Clean current-source tactical/close capture at `tmp/stage9-location-visuals/report.json`, `2026-08-29T14:25:34.530Z`–`14:26:58.437Z`, AMD Radeon 610M through ANGLE D3D11, stable scoped/runtime fingerprints, offline isolation, valid nonblank PNGs, and no runtime errors. The report still says `PENDING_HUMAN_REVIEW`; explicit owner approval remains open. |
| `npm run gate` | **PASS** | Final quiescent 2026-08-29 gate: 99 classic scripts parsed with no global collisions, bundle produced at 26.31 MB, and `www/` staged successfully. |

### Current evidence identity and measured details

- The V1-only and full runtime reports are both source-bound to
  `314110af7fff210f522c3199f91ab8695e26815a45458f4480db3b6f13cb9131`.
  `.tmp/stage9-v1-only-final/report.json` has SHA-256
  `46d1a49cbf6a55bc4991326de43c928d0b2f7fd42f008812cff8a4133e21a79d`;
  `tmp/site-template-runtime/report.json` has SHA-256
  `5df199573ee1c63273bf9ac03f48ea10bbc9beae12eff9dee3f5b8cd0ef1a0a8`.
  The latter records `v1Only: false`, `status: PASS`, and 77 cases. Its four
  warnings are typed environmental placement exhaustion in legacy
  forced-template cases, not required-plot failures or silent drops.
- The production-terrain deep check records one build call and one planner
  call, reaches changed canvas/height/passability state, then restores exact
  state, object identities, and in-place terrain bytes on the typed injected
  failure. Its following success path records plan hash `0e61460f`, realization
  hash `4e847f04`, exact topology, and deterministic output.
- The six map resource-relocation counts are `8, 1, 10, 13, 5, 6`; every row
  records zero failed moves, restored repeat state, and topology key
  `standard|player:sw|ai:0:enemy:ne`. The topology fixture changes the player
  start key, observes a changed realization, restores the original key/hash,
  and verifies reset stability without invoking the planner cache again.
- The V1 session round trip validates location, wreck, Commander, and dynamic
  state exactly, including survey mask `3`, and records an empty reward-call
  list. Hashless FULL_V1, plan-hash, and realization-hash fixtures are rejected
  without changing the fresh world. The cold-reload result records exact
  production call counts, exact restored state, and cleared session storage.
- The latest 38/38 utility report binds committed HEAD `17707b4`, dirty source
  set `54d90ed28027059570e443961396cd5c5bf9cab022e19387d1f9d4e11cc26803`,
  repeat hash
  `2ed3e44e172dae3e6908faa7570c028497c2b6460aaf5af146f28c1078b96d6c`,
  and AMD/D3D11. Report SHA-256 is
  `564a55ff65ee2115f3da6bb0e324f88a9d3f20cea57fd9f1a4ce703586968189`.
  Its recovery record confirms campaign suppression, malformed-v2 rejection
  code `SESSION_LOCATION_LEGACY_CONTRACT_MISMATCH`, exact pre-completion state,
  exactly one completion grant, three unique deposit bindings, and no
  serialized transient utility-board state. Its atomicity record additionally
  confirms the three over-cap rejections, exact boundary order, and clean
  production fallback described above.
- The 60/60 plan report binds committed HEAD `17707b4`, source set
  `0ab6f4205d4fd125c2c5c1879580814ac7eca9a417942893662614430afd18c8`,
  and report SHA-256
  `98abb2d692b36213141b427eeb2e411ff06888d6447cb63737a11cb1a0788b13`.
  The grammar report has source binding
  `2e4b5752b91459e1ed49edbc34161549291a885418db53f1baff521c84faf1a4`
  and has report SHA-256
  `7ccccfc1a320b55262180ba6ec5d222f9fecf002a0427a0318e74da1def132a1`.
- The clean visual report has SHA-256
  `408061b8b9f5759acd72556612c4caa4bcf0d8c017aca99442d618a79de3d239`.
  Its Stage 9 scoped fingerprint remains
  `a92d13191b7d481fdd9766b721956099c6525686f2fed40de03dba1aeec38289`
  and its runtime fingerprint remains
  `7d2746e78fd882680184db6736b8ecc098a5a563dc0e1b9da4437a50fc18366f`
  from start through completion. It records hardware AMD/D3D11, offline
  isolation, 12 valid 1440x900 PNGs, and no page, console, request, response,
  or fatal errors.

These are engineering results for the Local slice. They do not authorize an
OTA, APK, IPA, browser, or Space release.

## Visual acceptance remains open

The clean current-source producer captured two High-quality 1440x900 views for
each FULL_V1 map from `2026-08-29T14:25:34.530Z` through
`2026-08-29T14:26:58.437Z`. Its machine gate proves exact map/plan identity,
expected counts and template order, stable IDs, live geometry/supporting props,
settled runtime, valid nonblank PNGs, hardware GPU, stable Stage 9 scoped and
runtime fingerprints, offline isolation, and no GL, page, console, request, or
response errors. This satisfies the final machine recapture requirement.

The report intentionally remains `PENDING_HUMAN_REVIEW`. The project owner
must inspect and explicitly approve these exact replacement images for
silhouette, street/plot/prop composition, terrain grading, resource clearance,
and overlap, floating, or sunken defects. A machine PASS and inspection of an
older capture are not owner approval of this source-matched set.

## Known boundaries

- Only six maps are FULL_V1. The rest remain explicitly legacy or pending.
- Spawn-to-site reachability is diagnostic, not traversal acceptance.
- The terrain transaction ends when `planDistricts()` commits. Post-commit
  finalization and GPU-upload rollback remain P2 debt.
- Story-campaign, Weekly, and Training recovery are unsupported and snapshots
  are suppressed while those modes are active.
- Recovery is atomic for the enumerated state, but generic unit maximum HP,
  complete structure upgrades, production queues, and research state remain
  explicit P2 fidelity debt.
- The Galactic Operations capture and record are separate. Its full capture is
  deferred because a concurrent Blender-source report write prevented a clean
  evidence window; that does not invalidate the exact-location reports.
- No Stage 9 file is release-approved until the current images receive owner
  approval. The bounded Local engineering commit and global gate are complete,
  but acceptance recording and release activation remain separately authorized.

## Next safe sequence

1. Preserve the current V1-only, PASS 77/77 full compatibility, PASS 38/38
   utility/recovery, and 12-image machine reports. Any later change to their
   scoped source requires matched reruns.
2. Inspect the 12 PNGs under `tmp/stage9-location-visuals/` and record explicit
   owner approval or concrete rejection notes against this exact capture.
3. After approval, record that owner verdict against this exact report and
   decide whether the non-blocking shadow and shoreline polish notes belong in
   Stage 10. Upload, push, release activation, and large-model registration
   remain separate user-authorized actions.

Bounded Stage 9 engineering is complete: exact planning, pre-commit terrain
rollback, deterministic enumerated-state recovery, full compatibility,
authored-site traversal, current-source visual machine capture, and the global
gate are green. Integration acceptance now consists of owner approval of the
current images and its recorded verdict. The two P2 debt boundaries above
remain deliberately deferred rather than being represented as completed
full-terrain or full-match serialization.
