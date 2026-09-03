# MASSFRONT release status

Last reconciled: 2026-09-02

## Live

- In-game updater: **v1.33.72 HOTFIX** live on Stable, 113 OTA artifacts,
  95.4 MB. All three channels verified byte-identical by
  `node tools/verify-release-channels.mjs --version 1.33.72`, and delivery
  verified by `node tools/probe-payload-cors.mjs`. Confirmed installed **over
  the air** on Jason's phone 2026-09-02 (UP TO DATE, INTEGRITY VERIFIED) with
  no APK install.
- Android installer: **v1.33.64 remains the current APK**,
  `MASSFRONT-v1.33.64-mobile-install.apk`, 135,365,854 bytes, SHA-256
  `e54a88cfed62269e6db6ef6cb1e411396e3cc2c5e3de060c1cf4cea486d5d77b`,
  versionCode 13364. Installed and confirmed booting on Jason's phone.
- Browser playtest: HF Space `CREATORJD/massfront-playtest` at commit
  `565d44a1c46a57e1a86e8007a53257b3316e118a` (v1.33.65).
- The OTA channel carries **JavaScript only** — 113 files, all `.js`. CSS,
  `index.html`, `boot.js`, `sw.js` and `update-config.json` ship in the APK and
  the Space alone, so any styling or DOM change needs a new installer.
- **Publishing is four steps.** `tools/publish-hf-release.ps1` writes Hugging
  Face; `tools/mirror-release-to-cloudflare.mjs --version X --apply` copies the
  verified bytes into R2 and moves the worker pointer;
  `node tools/repoint-manifests-to-mirror.mjs --apply` points the published
  manifests at those redirect-free urls; `hf upload
  CREATORJD/massfront-playtest www . --repo-type space` publishes the browser
  build. Run `node tools/verify-release-channels.mjs --version X` and
  `node tools/probe-payload-cors.mjs` after every publish.
  The mirror has no retry and failed twice on 1.33.65 before succeeding.
- **A release is not shipped until a device can download it.** Hugging Face
  answers small files with a same-origin 307 but LFS-backed payloads with a 302
  to a signed CDN on another origin. Every chunked file carries a `Range`
  header, which makes the request non-simple and forces a preflight, and a
  strict engine will not follow a preflighted request off-origin: Android
  WebView refuses it, desktop Chrome follows it. The device reports NETWORK
  READY, finds the update, and dies on the first chunked file with a flat
  `network request failed`. Because every check ran in Chrome, the channel
  verified clean while no device could download a byte. Payload urls are **not**
  part of manifest identity (the client hashes path, size, sha256 and chunks
  only), so they can be repointed on a live release without reissuing it.
  `tools/probe-payload-cors.mjs` gates this, and the publisher now refuses to
  report success without it.

## v1.33.72 HOTFIX — OTA payloads were undeliverable to real devices

Devices on v1.33.70 could check for updates, find v1.33.72, and fail every
download attempt with a flat `network request failed` on `ota/00-runtime.js`,
while the launcher still showed COMMANDER VERIFIED and NETWORK READY. Root cause
was transport shape, not the client: the manifest advertised
`huggingface.co/.../resolve/<sha>/...` urls, which 302 off-origin for LFS-backed
files, and the `Range` header on every chunked file makes that redirect fatal in
a strict WebView.

Fixed **server-side with no reissue and no APK**: the three published manifests
(`update.json`, `MASSFRONT-update.json`, `update-v1.33.72.json`) were repointed
at the Cloudflare mirror, which serves the identical bytes as 206 with no
redirect. Identity was asserted unchanged before upload; every byte is still
sha256-checked on arrival.

Verified: `tools/probe-live-ota.mjs --from 1.33.70 --expect 1.33.72` took
95.4 MB from the live channel, verified, applied and restarted on the new build;
then confirmed on Jason's phone over the air.

Guards added, both mutation-tested against the pre-fix v1.33.71 manifest:
- `tools/probe-payload-cors.mjs` — fails on any off-origin payload redirect.
  Its in-page phase reports 4/4 PASS on the broken manifest, which is precisely
  why a Chrome-based check could not have caught this.
- `tools/repoint-manifests-to-mirror.mjs` — repeatable, refuses to write if
  manifest identity moves, skips no-op republishes.
- `publish-hf-release.ps1` now exits 1 with the remediation commands rather than
  reporting a published release that devices cannot download.

Local `update.json` carried the publisher-minted Hugging Face urls and would
have reintroduced the bug on the next publish; repointed.

## v1.33.65 HOTFIX — whole-HUD flicker

`mfCinematicEnsureStructure()` called `classList.add()` on `#heroBar` and
`#cmdbar` unconditionally on every sync. Adding a class an element already
carries still produces an attribute mutation record, which re-triggered
`mfCinematicWatch` -> `mfCinematicQueueSync` -> rAF -> the same writes, so the
top rail and bottom dock rewrote themselves continuously for the life of a
match. Guarding both with `classList.contains()` took the HUD from 87
mutations/sec to 3, measured on hardware in a live skirmish by the new
`tools/probe-hud-flicker.mjs`.

Note the asymmetry that hid this: `el.style.x = same` is skipped by the browser,
but `classList.add` and `setAttribute` are not. `cinematic-hud.js` and `hud.js`
both still carry unguarded writes of that kind.

Also landed locally but NOT shipped (CSS cannot travel by OTA): the launcher
footer dock-tab sizing fix. See [`GAME_REVIEW_2026-09-01.md`](GAME_REVIEW_2026-09-01.md).

## v1.33.64 SYSTEM — launcher lockout and network-gate repair

Category SYSTEM: updater and launcher plumbing plus reliability infrastructure.
Delivered after v1.33.63 without waiting for its device probation, because the
defect it repairs strands players on a screen with no usable control.

- **Launcher lockout.** `updatePrimary()` hides PLAY OFFLINE as its first act
  and re-enables it per branch; the identity-pending branch returned before
  doing so. A device whose identity never resolved showed a disabled
  "VERIFYING IDENTITY…" and nothing else — no route into a game that is
  playable offline. The escape now stays live while pending, and an in-flight
  transfer still suppresses it so offline play cannot race an install.
- **Identity could stay pending forever.** Four exits left `pending` with
  nothing scheduled to revisit it: a 401 that clears the session without
  reopening the gate, a stale-epoch handoff, a missing `#apOverlay`
  (`gate-unavailable`), and a gate throw (`gate-error`). A watchdog now
  degrades an unresolved identity to `offline` after 15s — past the 12s request
  timeout. An open sign-in gate (`awaiting-choice`) is exempt and never
  self-dismisses.
- **`navigator.onLine` was treated as an authority.** `updCheck()` refused to
  run and the launcher greyed out RETRY whenever the flag was false. An Android
  WebView reports false negatives, so one bad flag could permanently stop a
  device from ever seeing another update, with no error explaining it.
  `netForcedOffline()` (the player's own switch) is now the only hard gate; the
  browser hint still skips automatic passes, but a deliberate tap always
  attempts and reports a real result. Every request is timeout-bounded, so an
  attempt with no network fails fast.
- **Launcher footer clipped its own controls.** `#updBack` carries
  `.mbtn.alt{min-width:238px}`, which outranks `.mfLauncherFoot button` on
  specificity and then overrides `width:50px`, leaving PLAY OFFLINE 44px for a
  108px label at 412px wide. Constrained on its own rule.

Verification: `tools/test-launcher-identity-lockout.mjs` (new) plus network-gate
scenarios added to `tools/test-stage8-updater-interruption.mjs`. Every fix was
mutation-tested — reverting any one of the four fails its assertion. All nine
local gates pass, including both publisher gates.

## v1.33.63 HOTFIX candidate — legacy-boot Apply repair — NOT published

Prepared on 2026-09-01 and held at the publish gate. These bytes are not
uploaded and not activated, and owner publish approval has not been given.

**Category: HOTFIX.** The repair touches one file, `src/updater.js`, and is the
minimum change that restores a broken update path. The one-update-at-a-time
plan reserves exactly this case: "Only an urgent updater, recovery or security
repair may preempt as a minimum-scope HOTFIX." It is not an OVERHAUL and adds
no features.

**Owner decision still required.** The same plan also says a preempting HOTFIX
should follow acceptance or rollback of the active release, and v1.33.62 is
still in device probation. That ordering cannot be satisfied here: the defect
is what prevents affected shells from applying v1.33.62 at all, so waiting for
acceptance on those devices deadlocks. Publishing this hotfix ahead of
v1.33.62 acceptance is a deliberate, owner-authorized exception or it does not
happen.

`src/updater.js` carries a two-part repair for the failure old shells hit when
applying an update:

- `updStoredMatchesLegacyBoot()` accepts one immutable-shell compatibility
  shape while reading the authoritative active payload: a fully rooted stored
  record whose version, channel and attempt token exactly match a root-less
  running identity. A descriptor-capable boot (`__MF_ARTIFACT_BOOT_V1`), a
  running identity already carrying any root, a partially rooted stored record
  and a same-version rebuild under a different attempt token all still fail
  closed.
- `updApply()` then replaces the root-less legacy report with the exact stored
  identity taken from the payload it just read, so the promotion transaction
  stays root-strict. The relaxation never reaches promotion.

Verification completed locally on 2026-09-01:

- `tools/test-stage8-updater-interruption.mjs` PASS, now including a
  legacy-shell Apply scenario plus four fail-closed variants. Both halves of
  the repair were mutation-tested: removing either one fails the suite, and the
  positive case reproduces the exact live error string. Before this work the
  suite passed with the entire repair deleted, so the change had no coverage.
- `tools/test-updater-two-launch.mjs`, `tools/test-updater-status.mjs`,
  `tools/test-stage8-save-transfer.mjs` and `tools/verify-pwa-shell.mjs` PASS.
- Both publisher gates, `tools/test-update-binary-art.mjs` and
  `tools/test-updater-range-retry.mjs`, PASS.
- `www/` is repacked from this source; `www/src/updater.js` is byte-identical
  to `src/updater.js`.

`APP_NOTES` in `src/updater.js` was rewritten on 2026-09-01 for this candidate
and now reads as a Hotfix entry describing the install repair. This is a manual
step: the publisher stamps every version surface from `-Version` but never
rewrites `APP_NOTES`, which is why it sat on v1.33.60 Overhaul text through two
published releases. `www/` is repacked and all seven gates still pass.

Remaining before publication: owner approval, then the publisher's own
sequence — version bump, bundle, APK build/sign, immutable upload,
activation-last and remote verification. Publish command:

```
pwsh -File tools/publish-hf-release.ps1 -Version 1.33.63 -Category hotfix -Notes "<player-facing notes>"
```

Add `-PrepareOnly` to build and verify every local artifact while stopping
before any remote mutation. The publisher derives Android versionCode 13363
and bumps `boot.js`, `sw.js`, `src/updater.js`, `package.json`, `index.html`
and `assets/app.webmanifest` by replacing the current `1.33.62` string, so no
version surface should be edited by hand.

## v1.33.61 — abandoned attempt, never activated

v1.33.61 is not a release and must not appear in player history. The remote
`v1.33.61/` path holds only `ota/`, `src/` and `artifacts.json`; it has no
`assets/`, no `runtime-compatibility.json` and no Android installer. No live,
mirror or historical manifest ever advertised it and it was never ACTIVE. Those
bytes are retained only as an unpublished immutable attempt and are never
overwritten or activated, exactly as with v1.33.59.

## v1.33.60 OVERHAUL — active, remote verified, device probation open

Jason approved publication. The verified release contains 111 full artifacts,
93,486,258 bytes, manifest root
`f30a15b04854ab8dcf059be165a0c95cde78cdd61a5eeb1058ef00b25354ecb7`.
Every advertised file and chunk passed size/SHA-256 and pinned Range delivery
before the mutable Stable manifest was activated.

Delivered contents:

- visual account/updater launcher, structured release history, offline and
  connected entry, and sectioned optional-download presentation;
- persistent Social username/profile cards, online count, World Chat player
  actions and lobby presentation;
- top-left commander locate control and dedicated filtered Buildings deck;
- opt-in Graphics bottleneck diagnostics and a dedicated battle event feed;
- connected-play state-hash CPU repair, username hydration, building navigation
  and multiplayer-seat commander identity fixes;
- client/source removal of e-mail verification as a Social/multiplayer blocker.

Independent candidate verification passed all 111 hashes/chunks, launcher,
identity, updater interruption/two-launch/recovery, PWA offline shell, large
asset-pack, hardware AMD D3D11 browser and signed APK gates. Post-activation
readback confirmed the three manifest representations are byte-identical. The
published Android artifact is v1.33.60/versionCode 13360, 135,291,741 bytes,
SHA-256 `c6d3a05fd789913790a4d5a13f2be035d00ac9156b0a7ebbf02d493e2df59335`,
and verifies with APK v2/v3 signatures. Physical phone update/rollback and Apple
Safari-installed PWA probation remain open, so this release is not yet labeled
accepted.

The abandoned v1.33.59 attempt is not a release and must not appear in player
history. Immutable payload/APK bytes exist remotely, but no historical, mirror
or live manifest was published and it was never ACTIVE. Those bytes are retained
only as an unpublished immutable attempt and are never overwritten or activated.

## v1.33.58 SYSTEM — accepted

Jason gave release-specific approval and v1.33.58 was activated on Stable only
after immutable upload, commit pinning, full-byte checks and advertised Range
verification completed.

Delivered contents:

- separate player category from patch/full transport so large HOTFIX deltas are
  labeled correctly;
- deterministic schema-3 payload/full/manifest roots and same-version
  equivocation refusal;
- publisher-generated 4 MiB range tables with per-range and whole-file hashes;
- restart-resumable source transfers, storage/quota preflight and exact
  already-staged identity recovery;
- descriptor-aware packaged boot with ordered runtime/manifest verification and
  reachability-aware cleanup of interrupted/superseded source records;
- resumable integrity-checked optional content with install/repair/remove,
  atomic replacement, content-addressed finals and post-promotion cleanup;
- independent publisher resume proofs, HTTP Range acceptance gates, optional
  Galactic-pack separation and no default massive collaborator-source upload;
- no gameplay/content opportunism and no monolithic Galactic upload.

Verified local checkpoint: the optional-pack v1 -> interrupted v2 -> resumed v2
path passed 14/14 real-browser IndexedDB assertions on hardware AMD D3D11. The
executable two-launch, interruption/recovery, updater presentation and publisher
safety gates also pass. The published schema-3 SYSTEM release contains:
4 of 110 artifacts changed, 27.02 MiB adjacent transfer, 89.03 MiB complete
recovery view, with all payload/full/runtime/manifest roots independently
recomputed. At v1.33.58 activation, its then-live, mirror and historical
manifests were byte-identical and it was compatible with the accepted v1.33.57
client. Jason subsequently confirmed
the real phone update succeeded and told work to proceed, closing both device
probation and the next-slice gate for local work.

## Security action

- Unsafe v1.33.52 source archive removed from dataset main.
- Hugging Face release history super-squashed to remove deleted archive history.
- Seven production sessions revoked; accounts and saves were not deleted.
- Local unsafe archive is quarantined at
  `tmp/quarantine/UNSAFE-MASSFRONT-v1.33.52-source.zip`.
- Future database exports/bookmarks write only below ignored
  `tmp/migration-evidence/` and source packaging rejects `.migration-evidence`.

## Five-channel matrix

| Channel | Current | Next gate |
|---|---|---|
| Canonical source | Dirty integrated v1.33.60 checkout; no commit/push performed | Preserve exact source and user/Cursor changes; no blanket stage/cleanup. |
| Local development preview | Packed v1.33.60; portrait/landscape, reduced-motion, hardware-GPU and handoff checks pass | Keep as the evidence-matched development surface until the next accepted stage freezes. |
| HF OTA | v1.33.60 OVERHAUL live on Stable; 111 payloads and three manifests remote-verified | Physical phone Download -> Stage -> Apply -> restart and rollback probation. |
| Android native | Signed v1.33.60 installer published; v1.33.56 remains last accepted recovery APK | Install-over-old, launch, updater and rollback proof on a physical Android phone. |
| HF Space | Exact packed v1.33.60 at commit `0ec633a9f33567d06c1e603100751eabafb0550b`; clean-profile hardware-WebGL2 smoke passed | Apple Safari Add-to-Home-Screen/offline/safe-area/AAC acceptance. |

Apple remains supported through the Safari-installed PWA carried by the packed
preview/HF Space web package and the HF OTA path. Native iOS/IPA/Xcode,
TestFlight and App Store delivery are permanently retired and are not release
gates.
