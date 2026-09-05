# Building and Delivery Batch Handoff — 2026-09-04

Status: local implementation, contract tests and bounded hardware-browser checks passed, including the corrected utility-healing test below. This document does not claim a release, upload, activation, APK update, physical-phone acceptance or successful large transfer.

## Buildings, production, faction work and Brood terrain

Locally implemented in the canonical v1.33.73 source:

- Selecting an owned building offers upgrade-all for **all owned buildings of that exact type**. Affordability and authoritative order handling use actual per-building costs; other owners and types are excluded.
- Factory production preserves authored work units and save progress but uses a neutral duration of `max(8, 4 + 3 × bt)` seconds, modified by the existing doctrine/infrastructure rules. The fully funded floor is four seconds. Paid queues remain intact when spawning is temporarily impossible. Allied AI direct-spawn reinforcements are a separate cadence and remain outside this pacing change.
- Construction, upgrade, production and research have bounded world-space progress rails and stall states. Paid work drives capped faction-specific rooftop glows and motes: Nova cyan, Legion orange/red, Syndicate mint/violet and Horde lime/purple. Render-only calls do not advance simulation work or emit new particles while paused.
- The selected-unit HUD reads active utility leases instead of reporting generic READY. The visible feedback and actual healing acceptance are tracked separately; see [utility review](UTILITY_PRODUCTION_REVIEW_2026-09-04.md).
- Claude's original purple organic Brood foundations and connecting veins are restored, including wildcard nests. The final fault was a foundation refresh incorrectly triggering shoreline flooding and repainting the organic tissue. [Full causes, exact identities and visually inspected images](BROOD_FOUNDATION_REPAIR_2026-09-04.md).

Building browser checks covered 360×740 and 412×915 portrait, 915×412 landscape, 800×1280, 1280×800 and 1440×900, with 100%, 125%, 150% and 200% UI scaling as applicable. These used desktop ANGLE/D3D11 hardware with mobile viewport emulation, not an S25 phone. `mobile-building-20260904-e` passed the bounded building/action/FX matrix. Its utility screenshot showed unit intel, so it was not accepted as proof of visible selected-unit HEAL feedback. The later current-source `mobile-building-20260904-f` passed the eight layout/action/production/FX checks but **failed overall** because the Warden target did not gain HP in the fixture. No clean-console result overrides that failure.

The independent `utility-heal-clear-20260904` fixture also failed: both units were on clear walkable land, a repair-unit job and matching claim existed, but HP stayed 14/40 after 300 direct fixed steps. Its first assertion additionally compared numeric walkability flags with booleans. Source diagnosis found that both utility fixtures incremented `tick` before calling `unitTick`, which already increments it. This +2 cadence could permanently miss the worker's four-phase LOD slot while the planner still ran. Normal gameplay uses one increment. Both verifiers now use that cadence and assert tick delta equals step count; fresh runtime verification is still required. Building overlap was a disproved hypothesis, not a runtime cause. Prior failure evidence is preserved under `.tmp/utility-heal/` and `.tmp/building-command/`.

### Final integrated rerun

Runtime `d31cb0bd901f`, balance `589728025661`; bundled 112 scripts, packed `www/` 142.4 MiB. No version bump. Current-source bounded results:

- `.tmp/utility-heal/utility-heal-cadence-20260904/evidence.json`: **PASS**. On clear land the Warden healed 14→18 HP in four actual ticks, with all four LOD phases visited and no travel. Root inspected the screenshot: HEAL remains visible after opening and closing native unit intel.
- `.tmp/building-command/mobile-building-20260904-g/evidence.json`: **PASS** for all eight layout/scale combinations, real upgrade-this/upgrade-all taps, factory panel navigation, enqueue, slower production, four-faction work effects and pause stability. Striker completion remained 215 total ticks / 7.1667 simulation seconds. The combined Warden fixture healed 20→32 HP in 45 ticks and exposed visible HEAL status.
- `.tmp/environment-upgrade/brood-after-integrated-20260904/evidence.json`: **PASS visual diagnostic**, purple terrain and connecting veins inspected at tactical/close views; Medium/High/Cinematic captures, zero false floods, unchanged neutral-nest authority and stable paused terrain. The report deliberately does not claim the full product/device acceptance matrix.

All three record `sourceStable:true`, finalized network isolation, a closed capture page and no runtime errors. The two earlier no-healing failures remain preserved as verifier-cadence failures, not silently rewritten passes. No runtime healing algorithm was changed to satisfy the test. The building-faction work fixture recolours existing buildings to inspect work lights only; its old human pads are not organic-foundation evidence. The separate Brood fixture places fresh buildings through the real `addBld` route.

Unit intel without a selected facility now shows the authoritative neutral build duration (Constructor 16s; Warden/Prospector 19s), while selected-factory ETA remains live. `test-unit-intel-production-eta` covers that boundary and the legacy helper fallback.

These checks do not close the high-unit frame-tail, multiplayer reconnect or release-delivery gates.

## Optional large-content downloader

The existing format-2, sectioned asset-pack path remains the compatible architecture for optional content. Packs can declare dependencies and independently downloadable chunks, so terrain, models, audio, and space content can be delivered in controlled sections instead of one installer-sized update. Locked models were not regenerated or altered.

Changed files:

- `src/assetpack.js`
- `tools/test-assetpack-large-content.mjs`

The downloader now verifies a persisted synthetic/format-1 chunk against its locally recorded fetch hash when the manifest does not provide per-chunk hashes. A corrupted same-size partial is refetched instead of poisoning final assembly and causing every otherwise valid resumable chunk to be discarded.

The focused contract covers runtime reload using shared IndexedDB state, successful resume, corrupted persisted-chunk refetch after another reload, persistent-storage requests, low-space rejection before network fetch, HTTP 200 streaming fallback, final corruption rejection, atomic pack replacement, dependency ordering, and garbage collection. It also validates a metadata-only 768 MiB logical format-2 plan (three 256 MiB sections and 384 chunk records). That case proves bounded planning/metadata behavior only; it is not evidence of a real 768 MiB device transfer.

Local result:

```text
node tools/test-assetpack-large-content.mjs
PASS
```

Compression remains transport-compatible only when content is authored in a format the current runtime can consume directly, such as WebP/KTX2 or an already supported compressed asset. No new archive format, phone-side recompression, or incompatible extraction layer was introduced.

## OTA mirror repoint and delivery gates

Changed or added files:

- `tools/repoint-manifests-to-mirror.mjs`
- `tools/release-delivery-contract.mjs`
- `tools/test-release-delivery-contract.mjs`
- `tools/probe-payload-cors.mjs`
- `tools/verify-release-channels.mjs`

The repoint contract validates schema/version/channel, complete chunk coverage and ordering, file sizes and hashes, payload/full/runtime fingerprints, and all recomputed roots before performing a URL-only rewrite. It now covers both incremental `files[]` and recovery `full[]` / `full.files[]` inventories while preserving the source full-manifest shape. Required same-version remote manifests must all be present and identity-compatible before an apply can write anything. Dry-run mode performs no temporary or local writes; apply staging is kept under the project scratch directory and the live `update.json` is ordered last.

The delivery gates now use the complete deduplicated incremental-plus-full inventory and explicitly retain full-only entries. Every multi-chunk entry receives bounded one-byte Range and OPTIONS checks with manual redirect handling, CORS headers, `206`, `Content-Range`, `Content-Length`, and exposed-header validation. Whole-file-only entries are clearly reported as a bounded sample rather than whole-inventory proof. A local candidate manifest can be supplied for preactivation verification.

Local results:

```text
node tools/test-release-delivery-contract.mjs
PASS
node --check tools/probe-payload-cors.mjs
PASS
node --check tools/verify-release-channels.mjs
PASS
```

The current local v1.33.73 manifest intentionally fails the stricter delivery contract because its incremental payload URLs point at the mirror while matching full-recovery entries still point at Hugging Face. That is the source-confirmed recovery-path gap these tools are designed to repair; it must not be described as released or fixed on the public channel until the gates below pass.

## Required gates before publication

1. Run the normal bundle and repository test suite after all concurrent source work settles.
2. Produce a same-version candidate manifest whose incremental and full-recovery entries resolve to the verified mirror and pass all identity/root checks.
3. Run the read-only delivery probe against that candidate and verify every Range-bearing incremental and full entry through its actual cross-origin route. Confirm no Hugging Face redirect remains in the full-recovery path.
4. Run the release-channel verifier against the staged candidate and every public channel before activation. Do not treat sampled whole-file probes as complete inventory coverage.
5. Exercise a real large optional pack on supported Android and Safari-installed PWA paths: interrupt mid-download, restart the runtime, resume from persisted chunks, inject or simulate one corrupted stored chunk, retry under low free space, mount the completed pack, and confirm rollback/removal behavior.
6. Record at least one actual large transfer. The 768 MiB case above is metadata-only and cannot be used as device throughput, storage, or maximum-size evidence.
7. Keep publication and activation as explicit release actions after evidence review; none occurred in this work batch.

## Scope left for the main batch owner

The local building, utility-healing and terrain results are recorded above. Remaining ownership includes broader balance/utility rewards, high-unit frame-tail acceptance, and the multiplayer and public-transfer gates below. No release was performed.

## Multiplayer reconnect authority gate

`tools/test-match-reconnect-authority.mjs` is a source-backed regression fixture that executes the real Durable Object tick loop and real match command consumer. Current source fails the desired continuity contract with this evidence: the room advances from tick 1 to tick 2 while a seat is absent, resume clears an unresolved upgrade order, and the consumer rejects tick 2 after its committed counter jumps to the server head. This expected failing regression is an open multiplayer release gate. Multiplayer remains active; no feature was disabled and no Worker or client was deployed from this batch.

The bounded repair must combine pause and replay:

1. When any admitted, non-forfeited seat disconnects or is synchronizing, pause authoritative room advancement and reset the next deadline so recovery cannot trigger a catch-up burst.
2. Retain a bounded exact-frame ring for ticks that may have been sent immediately before disconnect detection. A 64–128 tick ring covers roughly 2.1–4.3 seconds at 30 Hz; if the client's required suffix is absent or discontinuous, reject recovery instead of skipping simulation.
3. Add a backward-compatible resume credential carrying the seat's last **applied** tick. The client already assigns its transport tick only after the consumer's enqueue promise commits, so that value is the correct replay boundary.
4. Send the unchanged welcome followed by every frame from `lastAppliedTick + 1` through the frozen room head in strict order. Keep the client in a replaying state, disallow submissions, and retain consumer `mcLastCommittedTick`, queued state, and `mcUpgradePendingTick` until sequential commits reach their authoritative targets.
5. Mark the seat synchronized only after replay frames have been queued in order, then resume the room at a fresh future deadline. WebSocket ordering must place all replay frames before newly generated live frames.
6. A Durable Object restart or deployment that no longer has the required bounded ring must fail reconnect closed. It must never advance the client counter without applying those frames.

Rollout order is mandatory: deploy Worker support that accepts both legacy resume and the new last-applied-tick credential first; verify existing clients still connect; then publish the client/consumer update and exercise disconnect immediately before and after an authoritative command. Required tests include exact missed-command replay, empty ticks, in-flight last-delivered-tick ambiguity, corrupted or out-of-window replay requests, pending upgrade preservation, no duplicate spending, no interleaving live tick, reconnect timeout/forfeit, and state-hash agreement after recovery. Only after the new client population is established should legacy resume be retired.

Commander rank clarification: `heroLvl` resets at the start of each match and advances from shared simulation events. It is not read from cloud commander progression. Human-seat upgrade parity now uses that match-local shared rank; it is separate from the reconnect delivery gate above.
