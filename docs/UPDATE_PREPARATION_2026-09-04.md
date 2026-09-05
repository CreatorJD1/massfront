# Next update — preparation and release hold

Prepared 2026-09-04 in the canonical Local checkout. This is an addendum to the
existing 18-stage plan, not a replacement plan or a release announcement.

**Status: preflight reviewed; NOT ready to activate.** No new version was
assigned, no candidate was built, and no remote file or live pointer was changed.
Preparation does not authorize publication. Obtain current approval naming the
version, category, targets, artifact scope and upload/activation action when ready.

## Source and evidence checkpoint

- Canonical root: `C:/Users/Jason/Documents/Codex/2026-08-01/massfront-rts-mobile-game-for-apple`.
  `MASSFRONT-main-source` is the user-facing junction to this checkout.
- HEAD: `d180831ca4eb3caffd8bb34dcf20004dbcd86b7f`; branch
  `cursor/strip-mass-node-bloom`; 65 dirty entries at pass start. Preserve all
  shared work. This pass changes documentation/continuity evidence only.
- Source version remains `1.33.73`; boot source revision `1.33.73-boot8`;
  service-worker cache revision `1.33.73-shell3`; Android metadata 13373/1.33.73.
- All 112 ordered source scripts match their `www/` copies byte-for-byte.
  `www/boot.js` intentionally changes only the Galactic inclusion marker from
  true to false, as implemented by `tools/pack-www.mjs:147`. That is a packaging
  boundary, not accidental drift. CSS, SW and both new Brood textures match www.
- Android's copied boot, CSS and SW do not match current source; the new Brood
  texture pair is not present as current matching assets there. No new APK has
  been built or signed in this pass; an old filename/version is not evidence.
- Rehashed all **273** inputs of
  `audit/stage12-high-unit-deep-profile-20260904/final/evidence.json`: zero
  differences. Input closure SHA-256:
  `7c1c4a2afcf5dd9be8586cabfdd517ef2f023c215d23292bdee032dbedfa33db`.
- That hardware capture remains **FAIL**: 2,500 admitted bodies, frame p95
  31.6 ms, p99 101.3 ms against a 33.3 ms gate. It used desktop AMD hardware with
  a 412x900/DPR2 profile, not an S25 Ultra, and is not a sustained thermal test.
  See `docs/STAGE12_HIGH_UNIT_DEEP_DIVE_2026-09-04.md` for the full limits.

## What Claude's delivery system actually does

Use the existing source/publisher/mirror contracts, not a new ad-hoc uploader.

| Component | Responsibility and verified limitation |
|---|---|
| `tools/publish-hf-release.ps1` | Version surfaces, bundle/pack, optional Android build, immutable HF artifacts, identity/range checks, manifests. `-PrepareOnly` stops before external writes, but still changes local version/package products; it is not a read-only preview. |
| `tools/bundle-update.mjs` | Ordered source artifacts plus `ota/00-runtime.js` and `ota/01-shell.js`, hash/chunk tables and runtime descriptor. The shell artifact embeds current HTML/CSS; selected binary art is embedded as data URIs. |
| `tools/mirror-release-to-cloudflare.mjs` | Checks immutable source bytes, mirrors complete payload plus recovery inventory to R2, verifies public bytes/ranges, then advances the Worker pointer. It does not deploy gameplay Worker code. |
| `tools/repoint-manifests-to-mirror.mjs` | Rewrites HF download URLs to the redirect-free Worker. Currently only handles `files[]`, not `full[]`; see blocker R1. |
| `tools/verify-release-channels.mjs` | Cross-channel version/root/payload checks and sampled CORS/Range delivery; not full recovery or installed-device proof. |
| `tools/probe-payload-cors.mjs` | Catches off-origin delivery redirects that desktop Chromium may tolerate. Currently samples `files[]` only. |
| HF Space | Separate upload of exact packed www; not performed by the publisher. Apple installs use this PWA lane. |

The claim in `docs/RELEASE_STATUS.md` that CSS/HTML cannot travel by OTA is stale.
The executing builder serializes styles/body (`tools/bundle-update.mjs:163`)
and replaces them before source execution (`:230`). JavaScript filenames do not
mean JavaScript-only content. Conversely, OTA does not replace the native
pre-script boot, Android permissions/native code, or the PWA service-worker file.
These require their browser/package lane. Do not reinstate native iOS work.

The older sentence in `docs/FIVE_CHANNEL_UPDATE.md` calling the Cloudflare
update path obsolete must not be used to skip the active R2 delivery mirror.
The historical version matrix at the bottom of RELEASE_STATUS is also stale.

## R1 — full recovery can still use the broken transport

Fresh read-only checks on 2026-09-04:

| Manifest | Version | Delta files | Recovery files | Recovery hosts |
|---|---:|---:|---:|---|
| HF resolve | 1.33.73 HOTFIX | 5 | 113 | `huggingface.co` for all 113 |
| Cloudflare Worker | 1.33.73 HOTFIX | 5 | 113 | redirect-free Worker for all 113 |

Both advertise manifest root
`ec25c9e3f44b6a1f70f308057caef6e35379f3fb45dde6d7983892d331d97263`.
URLs are deliberately excluded from identity, so equal roots do not prove equal
delivery reliability.

- HF full-list `ota/00-runtime.js`, `Range: bytes=0-255`: **302** to
  `us.aws.cdn.hf.co`, no Content-Range.
- Worker equivalent: **206**, no redirect, `bytes 0-255/25132191`.
- Existing channel/CORS tools pass because they inspect the mirrored delta.
- Repoint builds its URL map from `mirror.files` and mutates only `m.files`
  (`tools/repoint-manifests-to-mirror.mjs:48-64`).
- An off-base client takes `full[]` in `src/updater.js:2194-2216`. Equal-version
  mirrors do not replace the first valid manifest (`:383-393`); the configured
  HF endpoint can therefore retain the redirecting recovery URLs even when the
  Worker has healthy URLs.

Required before next activation: repoint and verify BOTH payload and full
inventories, preserve all identity fields/order/chunks, and add negative tests
where the delta is healthy but a full-only file redirects or is missing. Check
all entries for the candidate, not only the current four sampled payloads.
No conclusion here asserts that every existing device currently fails.

## R2 — activation sequencing is not fully fail-closed

The publisher activates HF `update.json` at `tools/publish-hf-release.ps1:1054`,
then runs the redirect gate at `:1075`. Mirroring and repointing are separate
commands. Thus a nonzero publisher exit can occur AFTER a live pointer moved.
Do not interpret it as an unpublished attempt or blindly increment the version.

Before unattended publication, split/guard the phases so redirect-free complete
payloads are ready before the first client-visible activation. Retain the same
immutable identity and explicit resume behavior. The mirror's own pointer-last
contract is good, but does not make the entire HF-then-mirror workflow atomic.

Also fix the repointer's purported dry run before relying on it: it currently
writes staged JSON into the OS temp directory before checking `--apply`
(`tools/repoint-manifests-to-mirror.mjs:100-102`). This pass did not execute it.
Scratch must remain below the project root, and unavailable/skipped manifests
must not be reported as a fully successful reconciliation.

## R3 — scope and asset delivery must match the candidate

The new Brood albedo and normal/roughness WebPs are in source and www, but absent
from `otaBinaryAssets` and `OTA_RUNTIME_PATHS` in `tools/bundle-update.mjs`.
Updating `gl.js` alone leaves old installers requesting files they do not have.
Choose an explicitly verified embedded-art or typed optional-pack delivery, then
test old-package -> OTA -> restart/offline with those exact assets available.

| New asset | Bytes | SHA-256 |
|---|---:|---|
| `assets/terrain/locations/brood-infested-soil-albedo-v1.webp` | 344552 | `1fa6411ec3a6ca4e8ee0319ec5f39d52a77dec56e594fff2144874a9f964c3b6` |
| `assets/terrain/locations/brood-infested-soil-normal-rough-v1.webp` | 570494 | `791840730c7149010d98dab9b7a7edc8d20e1b67b21a46cf4e5ba4582d970f37` |

Keep the ~542 MiB Galactic pack optional. Do not upload a massive collaborator
source archive, regenerate locked models, or include authoring/evidence folders
as a side effect. An approved model catalog is not proof of in-game placement.

## Checks run during this preparation

| Gate | Result and scope |
|---|---|
| Canonical root / `.git` directory / workspace guard | PASS |
| `node tools/verify-release-freeze.mjs` | PASS 4/4; source order, required paths, package containment, world-kit coverage |
| `node tools/verify-global-scope.mjs` | PASS, 112 scripts; lexical overwrite gate, not a substitute for final bundle |
| `node tools/test-updater-range-retry.mjs` | PASS; retry, partial body, integrity failure and cancellation contracts |
| `node tools/test-mirror-release-contract.mjs` | PASS; complete inventory and bad range response fixtures |
| `node tools/test-stage8-updater-interruption.mjs` | PASS; VM/storage/ownership/recovery contracts |
| `node tools/test-updater-two-launch.mjs` | PASS; current boot/main functions against historical .48 fixture, not the next candidate |
| `node tools/verify-release-channels.mjs --version 1.33.73` | PASS within its delta/sample scope |
| `node tools/probe-payload-cors.mjs --no-browser` | PASS, four sampled payloads per endpoint; full recovery not covered |
| Additional full-list transport probe | FAIL for HF recovery transport; Worker sample passes |
| Existing high-unit hardware gate, rehashed inputs | FAIL; p99 101.3 ms, visible dense Brood not covered |
| Live HF Space boot GET | HTTP 200, packaged 1.33.73 / boot8; not a browser execution/install test |
| New build / APK signing / full candidate runtime / Safari PWA / two-client online soak | NOT RUN; not certified |
| Upload / activation / gameplay Worker deploy | NOT REQUESTED HERE and NOT PERFORMED |

One initial ad-hoc Worker probe constructed an invalid query URL and received
404. The corrected URL returned 1.33.73 and 206; the malformed request is not a
service failure. No phone was accessed or tested.

## Ordered next work — one batched release at a time

1. Close delivery blockers R1/R2 and the Brood asset boundary R3; keep the known
   working live release unchanged while doing local work. Add regression tests
   that fail on the currently observed full-recovery redirect.
2. Resolve the measured simulation/world/deformation and billboard hitches;
   retain AI policy, 500-per-participant caps and authored graphics. Re-run
   source-matched hardware evidence including a close, visible dense Brood fight.
3. Resolve aircraft release-envelope/projectile-height bugs and complete the
   current UI resolution/scaling matrix. See the companion audit. Multiplayer
   determinism/reconnect/terminal-state gaps must not be advertised as finished.
4. Confirm the candidate's actual scope and category. SYSTEM is appropriate
   for a performance/delivery batch; a substantial visual redesign is OVERHAUL;
   optional maps/models are CONTENT. An urgent isolated updater repair may be
   HOTFIX. Do not label every individual fix as a new release.
5. Assign a fresh release version only after scope is settled. Run guarded
   local `-PrepareOnly`, bundle/pack, artifact/asset checks, old-package OTA
   recovery/restart/rollback, and Android signed-package verification when its
   lane changes. No fixed download-size promise before the candidate exists.
6. Obtain version/target-specific publication approval. Upload immutable
   artifacts, mirror and verify ALL delta/full bytes and ranges, pin manifests,
   then activate last. Verify HF representations, Worker and exact HF Space
   package, including Apple PWA behavior. Name any held lane explicitly.
7. Record install/rollback acceptance and player-facing Features / Bug fixes /
   Upcoming notes. Confirm readiness before starting the next release slice.

The companion audit is `docs/GUI_ART_MULTIPLAYER_AUDIT_2026-09-04.md`.
No candidate manifest exists for a new version yet, so there is no new manifest,
download size, APK hash, or signing result to report. That is a preparation hold,
not a failed release and not a reason to consume another version number.
