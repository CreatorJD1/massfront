# MASSFRONT release status

Last reconciled: 2026-09-10 (v1.33.83 shipped)

## Live - v1.33.83 SYSTEM (2026-09-10)

Main menu rebuilt on the authored MASSFRONT UI Production V3 pack. The command
slices, the deploy action and the dock destinations are drawn from authored art
with real pressed/selected states instead of gradients; tapping a slice reveals
what it does before entering it; rank, experience, cores and record collapse
into one commander banner; and the update surface floats over the live menu and
minimises to a status pill rather than taking the screen.

Every slice number in `src/styles/ui.css` is a restatement of one in the pack
manifest, so `tools/test-menu-slice-geometry.mjs` reads
`assets/textures/ui/mf-ui-v3/ASSET_MANIFEST.json` and fails on three kinds of
drift: CSS against the manifest borders, shipped PNG bytes against the pack
checksums, and any authored state that is never referenced.

- In-game updater: **v1.33.83** active on Stable, HF + Cloudflare in agreement,
  115 artifacts, manifest root
  `5894baebf2907da9a4dad2341a4b833848c21177be7fbb4f453a59f7bcee6324`.
  Expected-prior guard at activation: 1.33.82 /
  `0ecf9c1cb1ca6c60a515972c21cde0e0e729d6b767755113f1c896cb2cba28c8`.
  HF activation commit `75bb5394f663dc586ba3abbda77cc2307903da2d`; immutable
  artifacts pinned at `bbb9adc6fd7c7ecf6b12661e6a2744c111fdb154`.
- Exploration content: `/f/1.33.83/content-r1/`, 483 files (148,420,183 bytes),
  manifest SHA-256
  `5e56b78c82b4e9a3172fc63824be00c9eb6a3a430050a36e2183c0abe78b8833`.
  This carries the release's UGA work: `account_ledger.js` and
  `ground_control.js` are new; `catalog.js`, `uga_command.js` and
  `uga_command.css` changed. The OTA builder requires the delivery descriptor
  bound to the release being built, so the content namespace moved with it.
- HF Space: commit `2f7c4686d452d520b94d3fa02804bb6d49b1f0b6`, serving
  PACKAGED_REV 1.33.83.
- Android: versionCode 13383, shrunk/aligned/signed via `tools/shrink-apk.ps1`
  (`test-apk-release-gate` ok:true). `boot.js` changed, so a new package was
  required rather than optional.
- Gates: `verify-release-channels` PASS; `probe-payload-cors` PASS on all three
  channels; 29/29 source acceptance; `verify-menu-chrome` 33/33;
  `verify-launch-home-entry` and `test-menu-hud-isolation` PASS on hardware
  RTX 4060 / ANGLE D3D11.

### Version fields the five-channel table omits

`sw.js` `MF_SW_VERSION` is a required bump and is not in the table in
`docs/FIVE_CHANNEL_UPDATE.md`. The publisher refuses to build without it, which
is how it was caught. `assets/data/exploration-pack-remote.json` must also move,
but only together with a republished content namespace - it pins immutable
content by SHA-256, so bumping its version alone would point at content that
does not exist.

### Known deviation

16 retired `gui-material-v1/*_normal.png` files remain on the HF Space from an
earlier GUI iteration. Every reference in packed `www/` is to the `_frame`
variants, so they are unreferenced dead weight rather than a different build.
They were left in place rather than deleting live files during an active
release; worth reconciling in a quiet moment.


## Live - v1.33.82 HOTFIX (2026-09-09)

Fixes the bottom command dock sitting under the home indicator on installed
phone builds. `body.mf-cinematic-hud #cmdbar` positioned itself as
`bottom: calc(var(--sab) + var(--mfHudEdge))`, trusting the safe-area inset
outright. Measured in WebKit (Safari engine) at iPhone 13 geometry 390x844:
a reported 34px inset leaves the last dock row 40px of clearance, but a 0px
inset leaves it **6px** - and the last row is DEPLOY BASE HERE, which is how it
ended up cut in the owner capture. The gap is now floored at the full indicator
height (34px clearance when the inset is missing); a device that reports its
inset correctly is byte-for-byte unchanged at 38px. The legacy non-cinematic
dock already floored itself this way via --mmDockPad; the cinematic dock never did.

- In-game updater: **v1.33.82** active on Stable, HF + Cloudflare in agreement,
  115 artifacts, manifest root `0ecf9c1cb1ca6c60a515972c21cde0e0e729d6b767755113f1c896cb2cba28c8`.
  Expected-prior guard at activation: 1.33.81 / `e56111e5...`.
- Exploration content: `/f/1.33.82/content-r1/`, 481 files (148,152,239 bytes),
  manifest SHA-256 `74d39e8b76bd52fd7fd3374f1856e28efa2f1e3a0f64a4d5c28bd33fe6494296`.
- HF Space: commit `77db5d11521879885c169f5334c567ea8395cca8`.
- Android: versionCode 13382, shrunk/aligned/signed via tools/shrink-apk.ps1
  (test-apk-release-gate ok:true).
- Gates: verify-release-channels PASS; verify-live-space-release PASS, 0 page
  errors; source + packed launch/home acceptance PASS on hardware RTX 4060;
  source and www/ byte-identical across 173 compared files; 8 HUD-adjacent
  contract tests PASS.

### Still untested

- Physical Apple Safari-installed PWA and physical Android device acceptance.
  The dock fix above was proven in WebKit with an injected inset; no desktop
  engine reports a real env(safe-area-inset-*), so an owner device check on
  1.33.82 is what closes it.

## Live — v1.33.81 OVERHAUL (2026-09-09)

- In-game updater: **v1.33.81** is active on Stable across matching Hugging Face
  and Cloudflare manifests. 115 artifacts, manifest root
  `e56111e5930748e3550ded1c527045217f2d9a0ad1b900c6ac03a647177b072d`.
  Prior root at activation was `ff4eb654...` at v1.33.80, used as the
  expected-prior guard for both repointers.
- Galactic Exploration content: immutable Cloudflare namespace
  `/f/1.33.81/content-r2/`, 481 files (148,152,239 bytes), manifest SHA-256
  `4bdbfd4c3076ade4e931125ab6c8353f32d0bc334bd55e67edc525adf4ea45e3`.
  `content-r1` was left untouched, as required.
- Browser/PWA playtest: packed www/ is live on HF Space
  `CREATORJD/massfront-playtest` at commit
  `e3b816202738433969f1be0e90d0974a0420099f`.
- Android installer built: `MASSFRONT-v1.33.81-candidate-r2-mobile-install.apk`,
  261,852,358 bytes, SHA-256
  `f16962a15adfefb249ae82c5b2f697e5e59597eba0dcbdc16eb15fc0c7e0aa98`,
  versionCode 13381. **Not** run through tools/shrink-apk.sh this cycle.
- Verified after activation: `verify-release-channels --version 1.33.81` PASS on
  all three channels; source and packed launch/home acceptance PASS on hardware
  RTX 4060 / D3D11; source and www/ are byte-identical across 173 compared files.

### Post-release re-verification (same day)

Three items were flagged immediately after activation and all three were then
disproved by measurement. Recording them so the corrections are not lost:

- **Live HF Space gate.** `verify-live-space-release.mjs` first FAILED with page
  error `HSCALE is not defined`. Re-run after the Space finished committing:
  **PASS, 0 page errors**. The upload lands in 5 commits and the first run hit a
  part-propagated tree. The packed tree itself is clean locally: 113/113 scripts,
  `HSCALE` resolves to a number, no page errors. Not a shipped defect.
- **APK optimisation.** The APK WAS shrunk, aligned and signed. The publisher runs
  `tools/shrink-apk.ps1` (16 KiB-aware) with `zipalign -P 16 4` and a post-shrink
  gate; `tools/test-apk-release-gate.mjs` returns ok:true and actively forbids the
  legacy `shrink-apk.sh` that AGENTS.md still names. 261,852,358 bytes is the
  optimised size for a content-bearing package, in line with 1.33.76-1.33.80.
- **iPhone DEPLOY BASE HERE clipping** (owner capture taken on installed 1.33.80).
  Not reproducible on 1.33.81. Measured on the packed tree at iPhone geometries
  393x852 and 375x812 with `--safe-area-inset-bottom: 34px`: the control is 48px
  tall, sits 40px above the viewport bottom and 6px clear of the home-indicator
  safe area, and its label is not clipped (scrollHeight 46 = clientHeight 46).
  The HUD repairs carried in this release appear to have fixed it. Needs an owner
  device re-check on 1.33.81 before it is called closed.

### Still untested

- Physical Apple Safari-installed PWA and physical Android device acceptance.

## Live (previous, v1.33.79 record)

- In-game updater: **v1.33.79 OVERHAUL** is active on Stable through matching
  Hugging Face and Cloudflare manifests. The full release contains 115
  artifacts, 96,949,402 bytes, with manifest root
  `94589e7169dac160bb27fafff0e1b57ef0507e6546d45e4ad04d95408b585bb3`.
- Android installer: **v1.33.79 is the current APK**,
  `MASSFRONT-v1.33.79-mobile-install.apk`, 260,847,561 bytes, SHA-256
  `cb305cff7cfca7539d90eeb3bfda257e686397677ecfa0bdcd6ab64ed6fd068f`,
  versionCode 13379. The optimized package is 16 KiB-aligned and v2/v3 signed
  with one pinned signer.
- Browser/PWA playtest: exact packed v1.33.79 is live on HF Space
  `CREATORJD/massfront-playtest` at commit
  `41b7d636397b2d8d0cc881fa5841dbc50725ead8`.
- Galactic Exploration content: immutable Cloudflare namespace
  `/f/1.33.79/content-r1/` serves all 473 files (147,930,767 bytes), bound by
  manifest SHA-256
  `edc34c6b67b26026da6e46db37a0890b85d9342e7073c76afec696c312193d6d`.
- Automated acceptance passed: exact-channel comparison, public CORS/range
  delivery, packed launcher/UGA/Standard/commissioning routes, all nine
  operation bridges, protected Training and Skip convergence, 91 responsive
  captures, deterministic navigation, and the live Space on hardware WebGL2.
- Physical Android install/update and Apple Safari-installed PWA acceptance
  remain device checks. Native iOS/IPA/TestFlight/App Store work is retired.

See [`RELEASE_1.33.79_GALACTIC_INTEGRATION.md`](RELEASE_1.33.79_GALACTIC_INTEGRATION.md) for the concise
release record and evidence paths.

## v1.33.73 HOTFIX — stack selection reachable, commander XP in session

Player report: individual and stack unit selection missing, no XP on the
character profile in a match, and no structure upgrades. Measured in a real
skirmish with `tools/probe-session-features.mjs` rather than read from source,
because all three already had working code that ships.

Two of the three were reachability failures, one was not a defect at all.

- **Stack selection was unreachable.** The PLATOONS deck owns the per-type
  unit-stack rail, and a cinematic rule hid `#grpRow` on `.uiPrimaryOpen` --
  which is `(panel || intel)`, where "intel" is only "#unitCard is visible",
  i.e. exactly what selecting a unit opens. Selecting a unit therefore
  collapsed the deck holding the stack selector: 0x0 with a unit selected
  against 149x44 once the card was dismissed, and a card tap selecting 0 of 7
  against 7 of 7. Narrowed to `.uiPanelOpen`. Enforced in `src/uistack.js` as
  well as the stylesheet, and verified the JS carries it alone with the old CSS
  in place -- CSS never ships over the air, so that is what reaches installed
  players.
- **Commander XP was invisible.** `heroXp/heroLvl` is a real in-match track
  that unlocks abilities, but its readout lived in `.heroVital`, hidden below
  700px: 0x0/display:none on a 412x900 portrait. The grid row needs ~78px
  against a 55px body, so progress and real numbers now sit on the portrait
  chip, inline-styled for the same over-the-air reason.
- **Structure upgrades needed no work.** `startUpgrade`/`BUP` already back a
  hittable `UPGRADE TO MK2 · 80m 300e · 10s`. The first probe runs said
  otherwise only because they tested an HQ, which correctly has no BUP path.
  Individual unit selection also already worked.

The new deliverability gate earned itself immediately: the publisher refused to
report success on v1.33.73 because payloads still resolved off-origin, naming
the mirror and repoint commands. It also exposed a defect in the gate itself --
the pass path never exited, because undici holds keep-alive sockets open; now
explicit.

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
