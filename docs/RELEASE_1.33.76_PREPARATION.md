# MASSFRONT v1.33.76 — local preparation, NOT activated

September 6, 2026. Continue in the canonical Local checkout. The owner's
"PROCEED" confirmed the proposed .76 release preparation on the existing
channels. It does not resolve the newly discovered migration choice or imply
that disabled Galactic human co-op is complete. Do not publish this candidate
as a complete automatic Galactic upgrade for existing .74 installations.

## Implemented and verified

- Navigation retains blocked destinations/queued orders, recomputes around
  construction and destroyed obstacles, routes combat pursuit, and restores
  the strategic route after pursuit/breach. Prior current-code browser evidence
  passes all 11 cases in `tmp/nav-next/after-orders-ui/report.json`. Navigation
  runtime hashes remain unchanged in this continuation and match the package.
- Rally goals no longer receive arbitrary scatter. Repeat OFF stops automatic
  replenishment while existing queued work completes. Endless repeat after OFF
  was not reproduced; do not describe that unobserved defect as independently
  reproduced and fixed. The bound control, drain-to-zero and deterministic
  reset cases passed; this is synthetic input, not physical-device evidence.
- Original title art, authored eleven-room ship and thirty upgrade plots stay
  intact. Lossless delivery retains all pixels, geometry views and scene
  semantics; see `docs/UGA_LOSSLESS_DELIVERY.md`. Shared-resource transfer is
  70,507,896 bytes, not a claim of reduced GPU residency or lazy room loading.
- Canonical commander portraits now resolve to the existing nine faction
  portraits. Domain-ready commanders remain deployable when cosmetic art is
  unavailable. Normal player debriefs no longer show diagnostic victory/setback
  controls; handlers also require an explicit localhost sandbox opt-in.
- Actual launch/commissioning/deployment/tactical-result/debrief/Command-return
  verification passes on source and packed 412x900 desktop Chromium. A fixture
  supplies campaign progression and lethal damage accelerates the tactical
  result; this is not a played full mission. Rewards remain exactly once after
  reload and result-URL replay. A service-worker-bypassed missing-portrait test
  confirms a real fallback, not a cached successful image.
- Startup content resumes verified chunks across documents, uses a same-origin
  Web Lock for one writer, reloads active/offered catalogs under that lock, and
  retries boundedly on reconnect. Endpoint handoff occurs before navigation,
  validates public same-origin-session metadata, and never changes OTA channel
  authority. Unsupported automatic locks fail closed; legacy manual use remains.
- The generated Galactic download engine is byte-identical to `src/assetpack.js`.
  The manifest generator synchronizes it; `pack-www` now checks freshness before
  touching the previous package. Status UI is positioned above measured nav
  controls. The seven browser cases use a 256 KiB controlled payload, not a
  multi-gigabyte or OS-background download.

## Evidence ledger

- `tmp/startup-pack-continuity/report.json`: 7/7 browser cases, source stable,
  RTX 4060 ANGLE D3D11; both responsive status screenshots reviewed.
- `tmp/mission-return/report.json`: normal real bridge/result/return sequence.
- `tmp/mission-return-missing-portrait/report.json`: corrected actual missing-art
  injection. Earlier route-abort-only attempts could be satisfied by the service
  worker and must not be counted as missing-art proof.
- `tmp/mission-return-packed-mobile-missing-portrait/report.json`: packed mobile
  route, 412px document width, enabled/unobscured 44px primary controls, no page
  errors or source/package drift. Source and actual served response hashes bound.
- `tmp/uga-authored-sections/shared-packed-13376-index/report.json`: all 33
  selections and real mesh taps, source/www/served resource closure verified,
  no GL/page errors. Earlier `shared-packed-13376-final` used a directory URL
  unsupported by that preview server and returned 404; explicit index.html
  fixed the harness URL. Preserve both records.
- Fresh source contracts pass for navigation, deterministic clock, campaign
  save recovery, startup packs, large-content atomic promotion, UGA ownership,
  cache/alpha/resource tampering, 42 readiness self-tests, domain rules, updater
  range retry, boot retry and runtime compatibility. GL recovery's source-only
  contract was updated to require the verifier's stronger actual package/entry
  identity; this is not a new hardware context-loss capture.
- Full readiness audit remains NOT_READY: 50 PASS, 3 FAIL, 6 UNKNOWN at
  `modules/space_exploration/tmp/readiness/a835dd5c5178-f17720bb1c30-875fad78dc5b/`.
  It records stale broader acceptance inputs, provenance/budget gaps and the
  140.74 MiB module exceeding the historical 125.20 MiB rejected bound. Exact
  shared-asset fidelity passes. No threshold was relaxed to obtain a green result.

## First local .76 artifact — not final release acceptance

Source version fields, PWA cache revisions and Android code 13376 were updated
together. Windows mapped-file truncation errors interrupted the normal publisher
before building; fixed-width mechanical version rewrites preserved byte lengths
and the idempotent publisher then completed. No permission/security settings or
other application processes were changed.

`tools/publish-hf-release.ps1 -Version 1.33.76 -Category overhaul -PrepareOnly`
completed: bundle, full pack, Android sync/offline build, shrink/sign/alignment,
OTA binary art and package/OTA classic-runtime identity checks all passed.

- APK: `releases/MASSFRONT-v1.33.76-mobile-install.apk`
- APK bytes: 260,549,953; SHA256:
  `ea099100ac19ed8c37f58b3223f41458679570a8718737130ba8e444f870445e`
- Exactly one signing certificate, SHA256:
  `d61aaf77c171f0f1e7841394eb0adaed196e146ad90226a0f07854c29ee073f0`.
  APK v2/v3 signature and 16 KiB-aware zip alignment verified.
- Independently compared all 1,307 packed files (297,097,691 bytes) inside the
  APK: zero missing, size or hash mismatches. Native public entries total 1,309.
- Full www is 283.3 MiB; exploration is 455 files / 140.74 MiB. The prior
  monolithic headquarters remains in source but is not duplicated in this pack.
- Classic OTA: 114 artifacts / 96,893,289 bytes, including zero module files.
  Its classic-runtime compatibility root matches www; this does NOT establish
  complete content parity. Candidate manifest is intentionally unpinned.
- Candidate manifest root:
  `359cbe03ea8ee1003732c5dfbf535bfadd11b1a47a47ba8872e5a2340fc4cb2d`.
- Collaborator source ZIP was intentionally skipped; canonical source is kept.
  Native iOS is retired; no iOS build or device access was performed.

This first APK is historical after the final UI polish below. Its original
manifest is preserved as `releases/candidates/update-v1.33.76-first-local.candidate.json`.
Do not substitute it for candidate-r2 merely because both use version .76.

## Candidate-r2 — previous locally derived package

The landscape header now reserves its actual two rows: resource captions end
at y68.25 and the rail begins at y88. Deployment fields scroll in a separate
grid row above the fixed action row; all six station cards fit above the footer
in both orientations and the primary target remains 44px high. `openUga` now
selects/expands the district inspector before fitting the camera, correcting a
real return-services framing bug without changing art or camera math.

Focused source layout proof is in `tmp/mission-return/report.json`; the earlier
full-source mission report was preserved as
`tmp/mission-return/source-full-mission-before-polish.json`.
Final startup rerun passes 7/7 with the new CSS hash in
`tmp/startup-pack-continuity-final-polish-v13376/report.json`.

Local preparation with `-ArtifactRevision r2 -PrepareOnly` completed. Same
signature/alignment and classic-runtime compatibility gates passed; no remote
mutation occurred. Current artifact:

- `releases/MASSFRONT-v1.33.76-candidate-r2-mobile-install.apk`
- 260,554,049 bytes; SHA256
  `e6d40b8a69155778e284ed8c243cd78588cb023a88fe8bdbbd762ce09196108f`
- Independently rechecked all 1,307 packed files / 297,099,734 bytes in this APK:
  zero missing/size/hash mismatches; 1,309 native public entries.
- Module manifest: 455 files / 147,578,911 bytes. Shared-model bytes unchanged.
- `releases/candidates/update-v1.33.76.candidate.json` now names the r2 namespace;
  SHA256 `91f3551aa649b12f35dda54dfc7999b058a1769f6be9258046bf105dbbe17321`.
  The manifest root is unchanged because the classic OTA bytes are unchanged;
  that root is not a fingerprint of the full standalone exploration package.
- Final packed mobile mission/camera and 33-room r2 captures are being completed.
  All earlier source/package-bound captures retain their original scope.

## Existing-install migration: corrected conclusion after native inspection

The exact shipped .74 APK is
`releases/MASSFRONT-v1.33.74-candidate-r2-mobile-install.apk`, 136,345,250 bytes,
SHA256 `18a540c415e5b227f8240de351d3973bd8f738e4ddd000fc33c9461299bfaddf`.
It contains NO `modules/space_exploration` files and declares its build capability
false. Current OTA replaces two preludes plus 112 classic sources, not a separate
same-origin document and its ES modules/assets.

`mfInstallExplorationPack` persists verified content in IndexedDB but returns
`openUrl:null`; `mfOpenExploration` deliberately refuses unsafe blob navigation
and requires same-origin packaged files. An "installed pack" is not proof that
the standalone module can open. Existing launcher capability tests do not close
this integration gap. Do not add binary/ES-module content to executable files[]
or claim `minBaseVersion` solves it: that field is not currently enforced.

An APK replacement is NOT established as necessary. Independent inspection of
the exact .74 APK found Filesystem in assets/capacitor.plugins.json and the
built-in WebView class plus setServerBasePath/getServerBasePath/
persistServerBasePath in classes6.dex. Existing Capacitor can serve a downloaded
directory at the same app URL. An OTA-delivered adapter can therefore plausibly
stage and activate a complete web tree without replacing the native binary.
That adapter, atomic activation, boot probation, last-good rollback, origin/save
retention, and interruption/restart tests are not yet implemented or verified.
Current openUrl:null proves an integration gap only. The comment claiming every
blob URL has a different origin is not a valid impossibility argument; resource
resolution and lifecycle are separate constraints. A full APK is an optional
delivery route, not a proved requirement.

## Publication boundary and next decision

No immutable uploads, HF Space changes, Worker changes, or activation occurred.
Read-only checks confirmed Stable .74 and existing HF dataset head
`788af33658f1e65ce669c88e7f4cf343c61ba45b`; local update.json remains .74.
The .76 candidate must not be activated as an automatic complete-game upgrade.

Outstanding implementation: transparent content staging/mounting on existing
native capabilities, and real Galactic human co-op. The authenticated shared-
session adapter does not exist; no multiplayer bot/local substitute may be
presented as human co-op. Preparation is not activation or a forced APK migration.
Also retain outstanding performance/PWA/full-source-matched acceptance gates.

Ownership: root integrates readiness, packaging, version fields and documentation;
delivery agent implemented canonical pack continuity and tests; flow agent owns
deployment/return UI and its verifier; section agent owns exact shared-resource
derivation, loader cache and room verifier. No branch/worktree/commit was created.

## Candidate-r3 — previous local preparation, not published

The Nova-specific hangar repair supersedes the r2 deployment presentation.
The original authored room remains visible and is temporarily scaled to
26.4 x 33.25 x 9.5 scene units. The deployment carrier is 60.2% shorter than
the previous presentation; the deck is 4.28 times its length. Returning to
ship sections restores all 74 original authored placements and unit scale.
The default compact deployment summary expands to the existing editable
loadout, retaining the selected commander, faction, and draft. Portrait and
landscape reserve space for the real control bounds.

Nova has a continuous upper shoulder, repaired winding, centered fans,
separated armor/glazing/machinery materials, a proportionate CLOSED hatch,
and a connected short ramp. No fictional open cargo interior is claimed.
The repair is a hangar-only derivative: tactical models, the original snapshot,
title artwork, and updater implementation were not changed in this pass.
Materials remain vertex-colored/semantic; the original tactical texture atlas
was NOT restored. Older rear-hangar gray props still have separate art-quality
limitations. This is scoped Nova acceptance, not approval of every hangar asset.

Final hardware-GPU packed capture:
`tmp/nova-hangar-scale/after-packed-r3/report.json` (PASS), SHA256
`a387d19bb6e1e0401557262470245a1c035c835edfb16475fab8327e9b253814`.
Source, package, and cooperative freeze remained stable. Four compact/expanded
portrait/landscape views, 12 station clicks, draft retention, physical floor
contacts, and section-return restoration passed. Main and two agents personally
inspected the screenshots. `nova-model-diagnostic-closeup.png` changes only the
inspection camera and is NOT the normal player-camera acceptance view.
The earlier `after-source` evidence is preserved: its undersized room framing
was visually rejected and corrected before r3 was packed.

Integrated geometry check (`node tmp/nova-hangar-scale/verify-geometry.mjs`):
3,176 triangles, zero degenerate triangles or supplied-normal/winding conflicts,
476 repaired triangle instances, four centered rotors, and two floor contacts.
Final helper SHA256:
`29c82ceb478840c0ba97b5d1791aba170f9c9c2108f543d238454aac2c220b15`.
The older `geometry-math.json` references an earlier helper and must not be used
as final r3 source identity.

`publish-hf-release.ps1 -Version 1.33.76 -Category overhaul -ArtifactRevision r3
-PrepareOnly` completed successfully. Bundle, full www pack, Capacitor sync,
offline Android build, shrink/sign, 16 KiB alignment, OTA binary-art checks,
and classic-runtime compatibility checks passed. Existing signing identity
is unchanged. No upload, activation, Worker deployment, or HF Space mutation
occurred; no native iOS artifact was attempted.

- APK: `releases/MASSFRONT-v1.33.76-candidate-r3-mobile-install.apk`
- APK bytes: 260,558,261; SHA256:
  `2d0797da1469114e60f158f141ff613a120ca743c4f7a78c62c3217ff4ed6ad0`.
- Independently compared 1,308 runtime files / 297,121,636 bytes between www
  and this APK: all runtime bytes match. One omitted `.gitkeep` is a repository
  placeholder, not missing playable content.
- Full www: 283.4 MiB. Module manifest: 456 files / 147,600,612 bytes;
  hash `sha256-aac5fd5240a1437f657b259a9009be4697c23279d13095bce26b75ccdac5780d`.
- Current candidate: `releases/candidates/update-v1.33.76.candidate.json`,
  SHA256 `8379aa5fd013f22015170eb48d6b1f9b60d8873177967ee3b7302ed43302b690`.
  This is unpinned local candidate evidence, not an active update.
- Classic OTA: 114 artifacts / 96,893,289 bytes. It still does not include
  the standalone module closure; classic parity is NOT full-content parity.
- Previous APK candidates remain available; no collaborator source ZIP built.

Fresh contracts passed: navigation repath, production pacing authority,
production tick accounting, Galactic save recovery, startup-pack continuity,
release delivery, and release activation. The first production tick accounting
run failed because its isolated VM omitted the real `mfFactoryRallyGoal` helper;
the test now loads that helper and checks projected/exact ground/air/naval rally
targets. This was a harness repair, not a newly reproduced runtime defect.
The prior 11-case real navigation evidence remains scoped to its original run;
its sim/main/statehash source hashes still match. The reported endless repeat
OFF behavior was not independently reproduced; do not invent a proven cause.

Final packed-mobile deployment/mission-return capture passed 6/6 in
`tmp/mission-return-packed-mobile-nova-r3/report.json`, SHA256
`59a1e9d5ece3d9e41d17ccaa4f0755a1187c38db724031ed2b63f4347f824b15`.
Nova commissioning, real deployment UI/opaque bridge, tactical package landing,
debrief and original Command-room return, reload without double rewards, and
actual result-URL replay without double rewards all passed. Source/package
hashes stayed stable; no page errors; real NVIDIA/ANGLE hardware GPU used.
Main personally inspected debrief and return-services screenshots, with the
authored Command room fully above its management inspector. This is a local
showcase-save fixture with accelerated enemy lethal damage, NOT a full-duration
played mission or human co-op test. Browser closed and verification freeze
released after both final captures.

Release remains held for existing-install automatic full-content staging/mounting,
real Galactic human co-op, and outstanding broader performance/PWA/source-matched
acceptance gates. The old .74 APK contains native mounting capabilities; an APK
replacement is NOT proved necessary. No mobile budget was silently relaxed.
Candidate release notes reflect these limits. Two `apply_patch` attempts to update
the built-in APP_NOTES fallback in `src/updater.js` failed to write; that file was
left unchanged, and packaged fallback-note housekeeping remains pending rather
than being falsely reported as complete. Full-content migration implementation
and old-install interruption/rollback/save-retention tests are still required.

Current-pass ownership: root changed `uga_scene.js`, module cache references in
`space_experience.js`, `space_module.js`, module `index.html`, the CSS query in
`uga_command.js`, generated package artifacts, and this ledger. Model agent
owns new `src/ui/nova_deployment_ship.js`; UI agent owns remaining deployment
edits in `uga_command.js`/`.css`, the production tick test harness, and safe
tag/hash additions to `tools/test-exploration-mission-return.mjs`; verifier
owns new `tools/test-nova-hangar-scale.mjs`. All module paths here are relative
to `modules/space_exploration/` unless prefixed `tools/`. No agent/browser or
freeze remains active. No accepted source artwork was deleted or regenerated.
Next safe engineering action is the existing-install mounting/rollback adapter
with old-APK migration evidence; public upload/activation requires release
authority and the outstanding gates, not merely this local candidate.

## Candidate-r4 — whole-day scope, still NOT released

The owner requested all fixes/content discussed in this task and the full
fixes/new-content list AFTER release. `docs/UPDATE_SCOPE_2026-09-06.md` is the
internal acceptance matrix, not a shipped changelog. Unfinished work remains
in scope rather than being silently removed to call this release complete.

Two cross-feature gaps were corrected. `startup_content.js` now reserves actual
inspector/header/navigation bounds so download details cannot cover Confirm;
responsive changes are observed and summary/Retry keep 44px targets. Existing
download authority is unchanged. `space_audio.js` now starts one existing
approved ambient bed through the music bus, respects mute/volume independently
of effects, ducks for voice, preserves the loop across supported scenes, and
tears down on exit. Pending decode/start cannot revive a disposed mixer.
No artwork, audio recordings, playlists or voice lines were generated.

Current evidence, all with stable final verification guards:

- `tmp/startup-pack-continuity-final-release4-source/report.json`: 15/15,
  zero errors; SHA256
  `405d1f166a5e8eef1ee7fa1f9d4dffec1aa6bad07df12375c4406b47a4e1c4a4`.
  The original baseline reproduced Confirm obstruction. The first corrected
  run was INVALIDATED by an overlapping audio write despite functional passes;
  the clean rerun supersedes it. Preserve both records.
- `tmp/nova-hangar-scale/after-packed-r4/report.json`: eight actual-module
  busy/paused compact/expanded portrait/landscape layouts, 12 station clicks,
  authored placement restoration, source/package stability, no page errors;
  SHA256 `96505995abdb49c607c28bab9dc126ed6dd6b736f307e4cf813021ef4fb070c5`.
  Status events are labeled UI fixtures, not actual large downloads. Open
  details can obscure the 3D preview but not tested controls. Main and verifier
  inspected the images; prior rear-prop art limitations remain.
- `tmp/space-audio-music/after-packed-r4/report.json`: real canonical entry,
  actual OGG decode and music-bus RMS 0.0021305, same-loop scene navigation,
  settings/mute, exit cleanup, and forced OGG failure followed by actual AAC
  decode/RMS 0.000211725; SHA256
  `fe14c1160be795f200302db2ca9266c499d0445e55ab073fcdee88f70fb1a3a7`.
  Existing stereo 48 kHz, 46.136-second bed. Entry was already gesture-enabled
  before STARCHART: the report's first-gesture label overstates that narrow
  point. This proves normal entry/playback, not STARCHART as first unlock or
  native Android/Safari behavior. Main inspected the actual-game screenshot.
- Twelve mock audio ownership/codec cases, shared audio bridge, navigation
  repath, production tick accounting, startup contract, updater range retries,
  release delivery and activation contracts pass. Mock audio checks are not
  substitutes for the separate actual decode/playback proof above.

Initial r4 preparation stopped on a stale module-manifest entry. Regenerated
the authoritative manifest and reran successfully. Final bundle (112 sources),
www, Android sync/offline build, shrink/sign, 16 KiB alignment, binary-art and
canonical/transport compatibility gates pass. Signing identity is unchanged.

- APK: `releases/MASSFRONT-v1.33.76-candidate-r4-mobile-install.apk`
- 260,562,357 bytes; SHA256
  `7c18bbd82c6d5775e3085fed6bc82c6f6dae5db60cae72265130d6d01469ee40`.
- Independently hashed 1,308 runtime files / 297,129,407 bytes inside APK:
  all match www. All 1,306 direct canonical counterparts and Android public
  entries match. 112 classic sources and 456 module entries are included.
- Module: 147,608,229 bytes; hash
  `sha256-8f8187eb6401fea403e5fed0b599eb288edc59070e1272e751c1007d1e3a8011`.
- Current candidate: `releases/candidates/update-v1.33.76.candidate.json`,
  SHA256 `8ad60bdab3d3c1002ce3dad0a66ea4b26eb994d94e757a88f0b85cfe1f3359ca`.
- Classic OTA: 114 artifacts / 96,893,443 bytes; still no standalone module.
  Canonical runtime root
  `7bf4d8cd73347d25e3e33709e5620f4c8b2417d31427f63d1c150577528fa60a`;
  balance root unchanged:
  `3bee2d32185bd66c415ebccc6670aaea51805d7bd478e8b83a9963b34ca5411d`.
- Consolidated coverage: `tmp/continuity/today-release-scope-final/coverage.json`.
  r3 APK and separately preserved candidate manifest remain available.

The broad built-in APP_NOTES update succeeded, superseding the r3 write failure.
A later expansion attempt failed to write; the successful broad notes remain.
Candidate-manifest notes include both new integrations. No updater algorithm
changed. Module entry and audio/status import cache tags changed together.

Remaining requirements include full-content mounting/rollback for older
installs, actual optional Galactic allies/human co-op/Versus, practical space
onboarding, synchronized multiplayer factory repeat/rally commands, broader
current visual acceptance and physical Android/Safari/performance tests.
Existing solo evidence does not prove multiplayer behavior. No budget was
relaxed. All requested gaps remain in the internal scope matrix.

Canonical Local, packed preview and Android candidate are prepared. No HF OTA
upload, mirror/Worker mutation, HF Space publication or Stable activation was
performed. No source archive or native iOS artifact was built. Agents/browsers
are finished and freezes released. Next engineering must close the retained
gaps before claiming the complete requested release. Public changelog follows
verified release, not local preparation.

## Subsequent r7 handoff

The current candidate/evidence is documented in
`RELEASE_1.33.76_NATIVE_MIGRATION.md`; earlier r3/r4 artifacts above are preserved
history. r7 includes native content staging, synchronized factory controls and
fresh live/packed/old-loader verification. Its APK is 260,570,743 bytes, SHA256
`364bba9eb2ebc2e3252840029e28d6802f389078bf187f1ede2a4efea24fd154`.
The latest owner request explicitly requires the normal update pipeline for both
self-updater and APK. No upload, Stable activation or Space publication occurred.
Required device/PWA acceptance and remaining runtime/product gates are not waived.

## Released 2026-09-06

This section supersedes every earlier statement that no publication occurred.
The owner explicitly authorized the recommended release with disclosed device
limitations. v1.33.76 is active on the Cloudflare updater and both Hugging Face
Stable aliases at manifest root
`58ab8d7216a78c005a72a01d904854249b46d18e45030db90600f66f76618e35`.
The aliases were activated at dataset commit
`eb43376c0d5e5c1988226fbbb9b0e148bc8331c8`. The exact packed `www/` is live
on HF Space at `dd94c650736ce6b14d7a43c3953e9c19b09ddbc9`.

The signed r7 APK is 260,570,743 bytes (248.50 MiB), SHA256
`364bba9eb2ebc2e3252840029e28d6802f389078bf187f1ede2a4efea24fd154`.
It embeds all 457 Galactic files (147,617,270 bytes) and advertises the module
as base content; the live update manifest has no optional packs. Older APKs use
the automatic, resumable 96,921,077-byte core OTA plus 147,850,828-byte typed
Galactic migration closure. Both closures passed public whole/chunk identity,
Range, MIME and CORS verification before activation.

HF Space pinned and hosted critical bytes match the packed build, but the
post-upload clean browser acceptance was throttled by HTTP 429 responses from
the static host. Do not reclassify that attempt as a gameplay/PWA/device pass.
Physical Android interruption/save-retention and Safari-installed PWA
acceptance remain open, as do the product limitations already recorded above.
