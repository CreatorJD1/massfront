# 1.33.76 follow-up: native content and synchronized factories

Internal engineering/acceptance ledger, not a published changelog. The owner
requested release with all fixes. No upload, Stable activation, Worker deployment
or HF Space publication has occurred in this pass. Existing source/artwork and
the original title are preserved. Native iOS remains retired; Apple Safari PWA
acceptance is still required.

## Implemented in canonical Local

- Factory repeat ON/OFF, rally and queue cancellation now use explicit,
  authenticated-seat tick commands in live matches, not local-only mutation.
  Exact queue snapshots/revisions prevent stale cancellation and double refunds.
  Refunds and rally markers follow the owning side/commander slot. Opposing-side
  factories now use their explicit rally target; AI without a marker retains its
  normal fallback. Ordinary offline controls remain immediate.
- New `src/content-mount.js` is registered after assetpack in both source orders
  (113 classic sources). The existing .74 Filesystem API writes separately owned,
  hash-addressed DATA content; no WebView root replacement or player-save writes.
  Bound raw manifests, chunked transfer, native readback, readiness probation,
  compatible last-good recovery and deliberate retry protect activation.
- The module resolves base audio, commander portraits and tactical/service
  returns to the original installed game. Three's local absolute loader URLs
  become same-origin relative requests, avoiding the exact .74 native XHR proxy
  hazard without changing global XHR or remote traffic.
- Routing records no longer expire overnight independently of valid missions.
  Missing mounted return context fails visibly instead of climbing into a DATA
  index. Manifest, descriptor and persisted candidate versions must match the
  running base exactly; incompatible old content cannot be launched as rollback.
- Launcher readiness checks compatible, nonfailed mounts. Cached bound content
  can stage/retry offline; absent/damaged content remains subject to the real
  installer's checks. Source/OTA delivery pins are separate from executable
  `files`/`full` inventory; no model/audio binary is evaluated as classic script.

Owners: root owns native mount/assetpack, module base-URL integration follow-up,
registrations, main/return hooks, metadata/build integration and this ledger.
UI agent owns factory-command/runtime tests and the bounded launcher correction.
Model agent owns module host/audio/portrait/readiness integration and the native
browser verifier. Verifier agent owns typed delivery builder/release gates,
uploader and live match verifier. All work shares the canonical checkout.

## Evidence and retained failed gates

- Actual-source native mount contracts: 18/18; report
  `tmp/native-content-mount-contract/2026-09-06T11-27-38-319Z/report.json`.
  Native/IDB doubles, not Android device behavior.
- Module base-URL/ready/actual Three plus exact native XHR contracts: 12/12.
  Factory network contracts: 32/32. Navigation repath and production accounting
  contracts pass. Launcher capability contracts pass including ten new
  version/offline boundaries; five prior failures were reproduced before repair.
- Entry ticket, save recovery, startup continuity and 12 audio contracts pass.
  Correctly targeted runtime compatibility build passes all 124 inputs.
  An initial invocation without its explicit staging argument inspected an old
  default fixture and failed; it was not waived or treated as current evidence.
- First r6 prepare-only build: Android offline build, shrink, alignment and v2/v3
  signatures pass with the existing debug signing identity. Publisher then
  stopped at binary-art parsing because the new capability field interrupted a
  strict asset-map boundary. The emitted field order was corrected; the test was
  not weakened. Binary-art and exact current www/OTA identities pass afterward.
  That APK predates the launcher correction and is NOT a current release.
- First old-.74 GPU-browser migration attempt failed during explicit OTA fixture
  fetch before the game started: Chromium returned ERR_EMPTY_RESPONSE on a
  25,152,283-byte fixture response. Evidence is retained at
  `tmp/native-exploration-browser/legacy74-release6-current/`. This is not a
  successful migration or a proved game defect. The verifier was corrected to
  fetch bounded ranges and verify complete artifact hashes before fixture IDB
  insertion; the actual old boot and installer are not replaced.
- First real Worker/D1/WebSocket all-fixes run failed after 24 passing checks:
  `.tmp/match-replay-live/all-fixes-20260906-r6-a.json`. Actual Repeat OFF queue
  drain and both owners' exact production rally/flowfield goals passed. A later
  cancellation was rejected `stale_target_tick` while the harness submitted
  inside a catch-up burst. Both newly created QA accounts were deleted; source
  freeze was stable and released. Do not report full multiplayer acceptance
  from this failed run. A bounded input-scheduling correction retains real
  client delay/window limits and treats every future rejection as failure.

## Immutable content-r6 and current runtime

`releases/exploration-delivery-v1.33.76-r6/` contains 457 module files,
147,617,270 bytes. Raw delivery manifest: 233,558 bytes, SHA256
`edb1c6f25fb2c4565e7c81ec3184dd204f8f7642cb8d96ddada6b9fc71fbaed3`.
Descriptor base is
`https://massfront-update.jasondixon1994.workers.dev/f/1.33.76/content-r6/`.
The manifest namespace is not the APK candidate revision. Launcher-only changes
do not alter this module closure; don't rebuild it under the same immutable name.

After launcher correction: canonical runtime root
`4efb1d4b39d2eed356adf3011b316bcf1f3cc0a41546c9fe0191104d4887d13f`;
balance root
`a184a48f8e9a2350f75109babf8fa8b8b5277af145b59b7c9c20b0796d0a9dca`.
OTA: 115 artifacts, 96,921,077 bytes. No new APK/candidate identity should be
inferred from these source/OTA hashes.

## Remaining release gates and retained scope

The typed-content public activation gate and uploader are being hardened for
MIME, range, immutable-path and Windows argument correctness; no upload ran.
An initial isolated 50-case suite passed, but it is not remote evidence.
All acceptance freezes require returned writer calls before starting captures.

Physical Android old-install launch/restart, interrupted native writes, rollback,
and save retention are unproved. Installed filesystem save calls run on IO
coroutines; serial JS awaits do not establish cross-document write ordering.
Specifically test pagehide during a held append, relaunch, and delayed rehash.
Native-only files cannot launch after manifest-authority eviction, and retired
native generations currently have no garbage collection. Multi-GB/background
claims are not supported by these bounded tests.

The broader scope remains in `UPDATE_SCOPE_2026-09-06.md`: practical action-gated
space onboarding, genuine optional Galactic ally/human co-op and Versus,
dropped-session production restoration, current broad visual/performance and
Android/Safari PWA acceptance are still incomplete. No budget was relaxed, no
locked feature was relabeled complete, and no artwork was regenerated.

Final test/build identities and explicit release decision must be appended when
this pass finishes. The requested public fixes/content list follows an actual
verified release, not local preparation.

## r7 verification checkpoint (2026-09-06)

The local r7 prepare-only publisher completed. No immutable files were uploaded
and no mutable release pointer was changed. Existing Stable 1.33.74 was observed
by the publisher's read-only unpublished-version checks. The current artifact is
`releases/MASSFRONT-v1.33.76-candidate-r7-mobile-install.apk`, 260,570,743 bytes,
SHA256 `364bba9eb2ebc2e3252840029e28d6802f389078bf187f1ede2a4efea24fd154`.
The r7 candidate manifest SHA256 is
`bd0a5c7b8bed2d31f4ad3859123f3528f2827aaba9305f6c4738e2b377b7c5d0`.
The canonical runtime/balance roots and content-r6 closure above remain current.
Android v2/v3 verification passes with unchanged Android Debug certificate
`d61aaf77c171f0f1e7841394eb0adaed196e146ad90226a0f07854c29ee073f0`.
This is not a Play Store signing claim. Source archive is explicitly opt-in and
was not built; native iOS remains retired.

Full read-only APK ZIP-entry hashing confirms 1,310 runtime files match www and
Android public, with all 1,309 direct canonical counterparts matching. The raw
audit also records the omitted zero-byte repository `.gitkeep`; Capacitor's two
cordova bridge files are the only APK-only public entries. The module has 458
packed files: the 457-file delivery closure plus its 109,095-byte embedded v1
manifest. Audio remains 476 files / 15,998,916 bytes. Evidence:
`.tmp/release-r7-apk-coverage.json`. Signing/parity alone is not device acceptance.

Typed delivery contracts now pass 59/59, builder contracts 34/34, and actual
content-r6 local closure verification passes. The activation gate verifies the
descriptor bound in actual OTA bytes, exact manifest identity, complete file
and chunk hashes, MIME, range and CORS behavior before activation. Immutable
upload tooling fails closed on conflicts, verifies readback, writes the manifest
last and never activates. Windows argument boundaries are tested. These are
local/adversarial tests, not public-content availability; no upload has run.

Live Worker/auth/D1/WebSocket rerun passed 40/40 checks at the unchanged real
8-tick input delay and negotiated window. Both owners' production, explicit
repeat ON/OFF, exact rally, tail/head cancellation, queue-revision stale-click
protection, refund accounting, reconnect and byte-exact replay pass. Both fresh
QA accounts were deleted, source freeze remained stable and was released.
Report: `.tmp/match-replay-live/all-fixes-20260906-r7-b.json`, SHA256
`904cbc4796b83703e3777221cbb1506f11c6b5bcb080302afa8fd5868b7a714f`.
The earlier failed live run remains preserved; the correction only schedules
test inputs outside a queued catch-up burst and does not widen production limits.

Packed navigation passed 11/11 after normal updater/intro/offline/Galactic/
Classic Standard entry and deployment on RTX 4060 / ANGLE D3D11. 127 runtime
source/package inputs match, no source/package drift, no page errors, stable
released freeze. Root and UI owner inspected the pre-fixture battlefield PNG.
Report: `tmp/nav-next/after-packed-r7/report.json`, SHA256
`448f5f7ef16ec6f88e68c9bd289ed8953897660002a146c6018ecb98bd7704e0`.
Rally marker error was 0.00004069 world units; repeat OFF drained to zero.
500-unit order-authoring p95 was 2.1 ms, simulation tick p95 1.9 ms (max 20.3 ms).
These are synthetic-mask real-function diagnostics after genuine entry, not
phone FPS, a fully played match, or broad art acceptance.

Native browser attempts A and B remain failed evidence. B used an unbounded
monolithic fixture IDB record; exact .74 supports per-file artifact-v1 records.
Attempt C used that actual preferred storage format and successfully ran .76
OTA on the exact .74 boot, with the packaged module absent and OTA capability
present. The actual installer staged and independently readback-verified all
457 files / 147,617,270 bytes (832 bounded writes), opened the native-mapped
module via real offline entry, and received the matching ready token. No mapped
404s or page errors occurred. Root inspected its launcher and first-entry PNGs.
It then failed a 30-second Nova commissioning locator on return to the base.
The route query was not stripped, and initial boot itself took about 40 seconds;
source permits rendering the menu before remaining OTA scripts/boot confirmation.
This is not a proved route rejection. Report:
`tmp/native-exploration-browser/legacy74-release7-current-c/report.json`.
Browser was closed and freeze released stable. A bounded real-bridge readiness
wait with richer failure diagnostics is being prepared; C is not relabeled PASS.

### Explicit remaining safety limits

Authenticated Worker seats are not server-side gameplay ownership validation.
A valid-shape foreign-building packet can be admitted, then rejected atomically
by both consumers, stopping match advancement. The live test proves consistent
rejection, NOT resolution of this availability/authority weakness. This remains
an open multiplayer gate and must be disclosed before any release decision.

Candidate notes saying "same-origin launch and rollback" refer only to compatible
last-good content recovery with retained authority and verified files. They do
not prove whole-game rollback, cross-version fallback, or interrupted Android
write safety. Narrow this wording before any future publication. Physical old
install/restart/interrupted-write/save-retention acceptance and all other open
product/mobile gates above remain required. A dedicated-device question remains
unanswered; installed SDKs have ADB but no emulator or system image. No device
was selected, installed to, wiped, or modified.

## Final pipeline handoff: local r7, not released

The owner's latest instructions explicitly request both the self-updater and
Android APK and require following the update pipeline. They do not waive failed
or missing acceptance gates. No upload or activation command was run. All five
channels remain explicitly accounted for: canonical Local and packed www are
prepared; the Android r7 APK is built/shrunk/signed/byte-verified but unpublished;
HF OTA/Cloudflare immutable delivery and activation are not performed; HF Space
is not published. No source archive, Git commit/push or native iOS work occurred.

Final old-loader browser run F passed:
`tmp/native-exploration-browser/legacy74-release7-current-f/report.json`, SHA256
`401398a47491c022737e26b070d887bad7d7827cf5bd1d03133985df4cb536e8`.
Verifier SHA256:
`81c714613020cacebedfef42bc6b7d430b086fa2ace89307fc4f615d58e0769d`.
Capture ran 12:17:35--12:23:00 UTC on 2026-09-06, RTX 4060 / ANGLE D3D11,
412x900. Runtime, package, APK, payload and candidate identities stayed unchanged.
Actual old .74 boot consumed the verified .76 per-file fixture, staged all 457
content files, entered the mapped module, commissioned Nova, loaded the canonical
Kai portrait, decoded/played the ambient bed (46.136 s; nonzero analyser output),
opened the original Standard War Table and returned through the real Back action
to the same generation with a fresh matching readiness token. Observed unchanged
localStorage writes prove old pending was cleared before the new token was set.
Browser/server closed; verification freeze released stable; no pending writes.

The F test corrections did not change runtime behavior: C timed out before the
115-artifact boot finished; D hit a detached portrait node during an asynchronous
factions rerender; E incorrectly required eager recovery on Classic entry.
Production intentionally reconciles the acknowledged pending token when Back
next invokes recovery. F observes that real lifecycle rather than calling recover
directly or removing the acknowledgment checks. All failed runs remain intact.

Root and module owner inspected the Command cutaway, visible Kai portrait and
Classic War Table captures. F's final 05 image catches the 100% streaming overlay,
so it is NOT settled campaign-hub visual acceptance. Its URL/state/ready/pointer
assertions prove functional reentry only. A temporary initWarPrimer-missing
diagnostic is stale: warprimer.js self-initializes idempotently after main's
earlier check, and the actual orientation guide is visible in the Classic image.
No associated page error occurred. No original title or model art was regenerated.

Important scope: this is a real hardware-browser run of exact old boot/current
runtime and the actual adapter, but seeded IDB and a native-filesystem/HTTP double
are NOT actual network update download/apply, physical Android I/O/interception,
process-kill/save-retention, service-worker offline or Safari/PWA acceptance.
Only the .74 base was exercised; the inherited candidate minBaseVersion 1.22.0
must not be described as independently verified across every older wrapper.

At 12:22:20 UTC, read-only checks found Worker update.json and both HF update
aliases still at Stable 1.33.74, agreeing on manifest root
`93b2006041491075e5f99733cecfc0bdbde4240650019655e2e83c1859a5ad8f`.
HF aliases were read at exact commit
`788af33658f1e65ce669c88e7f4cf343c61ba45b`.
1.33.76 is unactivated on all checked pointers. This checks active aliases,
not whether some unrelated unpublished remote artifact prefix exists.

Next safe work is to close the retained gates, not bypass activation checks:

1. Obtain dedicated Android test-device access and Safari/PWA acceptance access;
   verify the real old-install interrupted-write/restart/save-retention route.
2. Address the foreign-command match-stall issue under a fresh compatibility
   identity. Proposed design only: distinguish gameplay rejection from fatal
   protocol failure; reject an offending authenticated seat+sequence row before
   any mutation; preserve other rows; consume original tick/signature and clear
   receipts; verify unchanged accounting and continued valid commands through
   replay and real two-peer transport. Do not simply convert apply failures to
   success. The Worker still needs malformed/unsupported-input boundary review.
3. Narrow public rollback wording, reconcile remaining requested product scope,
   rebuild any changed candidate and repeat source-matched acceptance. Keep
   prior rejected/candidate artifacts and all failure evidence.
4. Only after required gates pass: use the existing immutable-first HF uploader,
   typed content-r6 delivery and mirror verification, then expected-prior-guarded
   Worker/HF activation. Publish exact www to HF Space and verify Apple PWA.
   Re-read prior pointers immediately before mutation; the roots above are not
   permission to overwrite changed state. Public changelog follows real release.

Final owners: root owns integration, source/package decisions and this ledger;
UI owner completed packed navigation; model owner completed the bounded native
browser verifier; verifier owner completed typed delivery/live QA and read-only
release/availability review. All three agents have returned their write/browser
ownership. No freeze is intentionally left behind.

## Activation result — 2026-09-06

The pipeline hold above was later explicitly accepted by the owner for a
recommended release. Cloudflare and both Hugging Face updater aliases now serve
v1.33.76/root `58ab8d7216a78c005a72a01d904854249b46d18e45030db90600f66f76618e35`;
HF Space serves exact packed commit `dd94c650736ce6b14d7a43c3953e9c19b09ddbc9`.
The r7 APK embeds the complete 457-file Galactic closure and the live manifest
contains zero optional packs. Retained device, Safari/PWA, co-op/Versus,
practical-onboarding and dropped-session limitations remain limitations.
