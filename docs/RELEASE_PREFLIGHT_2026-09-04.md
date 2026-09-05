# Publication preflight — 2026-09-04

**Historical preflight snapshot.** The owner subsequently approved repairing these blockers and publishing v1.33.74 SYSTEM. Current execution and live-backend receipts are tracked in `RELEASE_1.33.74_SYSTEM.md`; the original failures below remain preserved.

User requested publication of the current local update. **Publication held: required gates fail.** No upload, activation, version assignment, Android build or gameplay Worker deployment occurred. This is not a failed release attempt and must not consume a version number.

## Current identity

- Canonical Local root verified, `.git` is a directory; HEAD `d180831ca4eb3caffd8bb34dcf20004dbcd86b7f`, existing branch `cursor/strip-mass-node-bloom`. Shared dirty work preserved.
- Local source remains v1.33.73, runtime `d31cb0bd901f`, balance `589728025661`. The prior Brood/building/utility browser results are local feature evidence, not publication acceptance.
- Fresh read-only GETs of Hugging Face `CREATORJD/massfront-releases` and the configured update Worker both returned **v1.33.73 HOTFIX**, root `ec25c9e3f44b6a1f70f308057caef6e35379f3fb45dde6d7983892d331d97263`.
- Each advertises five delta entries and 113 full-recovery entries. HF recovery entries still use `huggingface.co`; the Worker recovery entries use the redirect-free Worker.

## Gates

| Gate | Result | Evidence / action |
|---|---|---|
| Existing Brood, building and utility feature checks | Locally passed | See `BROOD_FOUNDATION_REPAIR_2026-09-04.md` and `BUILDING_AND_DELIVERY_BATCH_2026-09-04.md`; these are not old-package OTA/recovery or two-client acceptance. |
| Source / packed web identity | Passed | Current source and www match the final captures' tested runtime fingerprint `3c8ec95f1da31aad902a966b845788b4819b48ecc0f0c43ac16942c511ead4a1`. `d31cb0bd901f` is the separate compatibility manifest hash prefix, not this evidence-closure hash. |
| Android package | Stale / not rebuilt | Copied Android HUD/sim/manifest/SW differ from current www; both Brood WebPs are absent. The existing 138,091,701-byte APK with SHA-256 `4341372131bdf5a4e9619ac6c6fb028da4d440aa8d87594dc53a6158b9c21371` is the old release, not this batch. |
| Full-recovery delivery | **Failed for HF representation** | Fresh `Range: bytes=0-255` against the full-list `ota/00-runtime.js`: HF responds 302 to `us.aws.cdn.hf.co`, no Content-Range; Worker responds 206, `bytes 0-255/25132191`, no redirect. This bounded sample does not certify all payloads. |
| Publisher activation ordering | **Failed** | `tools/publish-hf-release.ps1` activates HF `update.json` near line 1054, then runs the redirect-free transport gate near line 1075. A failure can therefore happen after activation. |
| Repoint contract | Locally passed; not activated | The newer repointer handles delta plus recovery inventories and write-free dry runs. `test-release-delivery-contract.mjs` passes. Older preparation text saying this code is still unimplemented is superseded. |
| Brood OTA asset inclusion | Locally fixed | Both existing WebPs are registered in `tools/bundle-update.mjs`; no models or raster masters regenerated. Exact candidate old-package install/restart coverage still required. |
| Multiplayer reconnect authority | **Failed** | Root and independent agent reproduced `test-match-reconnect-authority.mjs` exit 1. See below. Multiplayer was not disabled. |
| New release identity/package | Not prepared | No new version assigned. Source order now has 112 scripts versus the published 111; use a full ordered release, not `-PatchFrom`. Do not overwrite existing v1.33.73 artifacts. |
| Large-transfer/device acceptance | Incomplete | Synthetic optional-pack tests and desktop mobile profiles do not prove an interrupted large transfer on Android/Safari. No phone was accessed. Native iOS remains retired. |

## Reconnect failure, not a hypothetical risk

The real source-backed regression reports:

```json
{"serverTickBeforeDisconnect":1,"resumedServerTick":2,"serverAdvancedWithoutSeat":true,"pendingSurvivedResume":false,"firstMissingTickAccepted":false}
```

The Worker advances while a seat is disconnected. Resume welcome jumps client cursors and clears pending upgrade state, but the simulation still needs the missing tick. The new strict queue can then wait permanently for the discarded packet. The upgrade command and fixed-step queue are new relative to published v1.33.73: the prior staged consumer/transport bytes match that release's full-manifest hashes. Normal building-upgrade tests passing 15/15 do not close this reconnect failure because their reconnect fixture does not deliver a welcome packet.

A sound repair crosses MatchRoom, transport and consumer: bounded exact-frame retention/replay, last-applied-tick resume state, preserved pending commands, fail-closed recovery outside the retained window, and two-client convergence/no-double-spend checks. A pause alone or a cursor-only client patch is insufficient. This includes a gameplay-backend change, beyond merely uploading the already tested terrain assets.

## Next safe release sequence

1. Split the established publisher so immutable upload and pinned candidate creation can stop before any activation. Mirror and verify the complete candidate inventory first; publish matching client-visible manifests last. Preserve prior rollback pointers.
2. Repair and verify reconnect end-to-end; deploy backwards-compatible Worker support before dependent client changes. Do not disable multiplayer or bypass the failing gate.
3. Confirm a fresh version/category/target/artifact scope with the owner. The next sequential proposal is **v1.33.74 SYSTEM**, not assigned or consumed. Proposed player channels are Hugging Face Stable OTA, its established R2/Worker delivery mirror, exact packed browser/PWA Space, and signed Android installer as required by packaged boot changes. No monolithic source archive or Galactic content upload.
4. Update packaged `APP_NOTES` deliberately: publisher `-Notes` alone changes manifest notes, not the in-app constant. Rebuild all required packages from the settled source; verify old-package update/restart/rollback, asset presence and signing.
5. Upload immutable artifacts, verify complete payload/recovery bytes and ranges, then activate only after current version/target-specific approval and all required gates pass. Record skipped channels honestly.

Independent lanes: delivery audit, reconnect audit, package/evidence audit; all read-only. Root owns integration and the release hold. The publication request did not result in any remote mutation.
