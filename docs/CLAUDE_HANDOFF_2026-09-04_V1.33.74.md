# Claude handoff — MASSFRONT after v1.33.74 SYSTEM

Prepared 2026-09-04 PDT. This handoff is documentation only: no gameplay changes, builds, device access, or new publication were performed for this request. Three read-only delegates cross-checked release, performance and gameplay state. Production status below is the recorded release acceptance, not a new production test performed during handoff.

## Start here

Continue in **`C:\Users\Jason\Documents\Codex\MASSFRONT-main-source` as Local**. This is a junction to the existing physical checkout:

`C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`

**v1.33.74 SYSTEM is already published and activated. Do not republish it, overwrite its immutable files, or bump a version to resolve a failed test.** The next development priority is measured high-unit stability, followed by the remaining multiplayer/runtime acceptance gaps. Preserve the working updater and all accepted assets.

Read in order:

1. `AGENTS.md` — source containment, ownership, classic-script build and verification rules.
2. This handoff and `docs/RELEASE_1.33.74_SYSTEM.md` — final release receipts and remaining limits.
3. `docs/MASTER_PLAN.md` — the original authoritative plan. Its **Delivery Order** is the only 18-stage namespace; do not replace or renumber it.
4. `docs/MASTER_PLAN_STATUS.md` — useful stage context, but historical rows need reconciliation; see the warning below.
5. `docs/STAGE12_HIGH_UNIT_DEEP_DIVE_2026-09-04.md` and `docs/GAMEPLAY_COMMAND_SYSTEM_HANDOFF_2026-08-31.md` — performance and command-system background, checked against current source.
6. `docs/FIVE_CHANNEL_UPDATE.md` — only when preparing a later, separately approved release.

### Important documentation conflicts

- `MASTER_PLAN_STATUS.md` still contains .60-live, .73-unreleased and Worker-not-deployed statements. `UPDATE_PREPARATION_2026-09-04.md`, old preflight documents and earlier sections within the release ledger are historical, not current deployment authority.
- `docs/HANDOFF.md` still calls Stage 10 Cursor work in progress. The later runtime-admission ledger and owner decision accept the locked model set: **320 world-kit + 7 retained Spline = 327 optional catalog models**. Do not regenerate, delete, or redo their repair based on the older sentence. Runtime placement coverage is a separate issue from asset acceptance.
- Historical claims that all selections above 64 units are unimplemented are also stale: current source has byte-bounded multi-command batching. It still needs current end-to-end acceptance.
- `docs/GALACTIC_COMMAND_LAYER_HANDOFF_2026-08-31.md` is a plan, not a completion record. Its old packaging/network restrictions must not disable currently supported live multiplayer. Re-audit its claims before implementation.
- Final sections in `RELEASE_1.33.74_SYSTEM.md` supersede its explicitly retained intermediate candidates and failed attempts. A preparation receipt with `activated:false` describes its own phase; it does not mean the final release is unactivated.

A good first documentation task is to reconcile these narrow stale statements against receipts without inventing new stage completion or editing the immutable master plan.

## Workspace and authority

- Recorded HEAD: `d180831ca4eb3caffd8bb34dcf20004dbcd86b7f`; existing branch: `cursor/strip-mass-node-bloom`. This is a shared dirty checkout, not a committed release snapshot. The handoff-start continuity capture recorded 133 dirty entries before adding this document. Preserve them all unless ownership is explicitly established.
- `.git` is a directory. Before any write, run `git rev-parse --show-toplevel`, verify the physical root above, then `node tools/evidence-foundation/workspace-guard.mjs check-write`.
- Never delete a verification freeze manually. `clear-stale` may remove only an eligible dead same-host lease. No source, docs, packages or generated assets may change during an active verification freeze.
- No shadow repositories, new branches, worktrees or projectless source copies. Scratch/evidence stays under this checkout. User-named external screenshots are read-only inputs.
- Use parallel delegates with exclusive file ownership, but serialize hardware browser work through `tools/pw-browser.mjs`. Do not use SwiftShader or close another task's browser/server.
- This document transfers context, **not authorization for a new release**. Ask the owner before another upload/activation or broader production mutation. Batch by stage/system/overhaul/content/hotfix; do not release every minor fix. Updater regressions take priority if one is genuinely reproduced.
- Do not access a phone. The owner requested desktop mobile-profile simulation, not phone playtesting. Physical Android/WebKit acceptance remains unproven and requires a separately agreed session.

At release closeout, verification browsers/freeze leases were released, QA accounts were cleaned up, and the owned local Worker/D1 test server was stopped. Preview was left on `http://127.0.0.1:8901/`; check it rather than assuming it still runs. No prior delegate has implementation or publication work pending. Continuity snapshots live in `tmp/continuity/engineering-state.{json,md}`; they are diagnostics, not authority.

## What is live

| Item | Final identity |
| --- | --- |
| Release | **1.33.74**, category **system**, channel **stable**, full OTA |
| OTA size | 114 artifacts, **96,859,456 bytes**; 130 chunk hashes, six multi-chunk files |
| HF Stable activation | `CREATORJD/massfront-releases`, commit `788af33658f1e65ce669c88e7f4cf343c61ba45b` |
| Update service | `https://massfront-update.jasondixon1994.workers.dev/update.json` |
| Browser/PWA | `https://creatorjd-massfront-playtest.static.hf.space/`, Space commit `aed627e1ac2055a3ac2d82904c64265211cf4f36` |
| Multiplayer backend | `massfront-auth`, deployment `36a81088-3c7e-4f5d-aa3f-7ae114d9667d` |
| Final APK | `releases/MASSFRONT-v1.33.74-candidate-r2-mobile-install.apk`, **136,345,250 bytes** |

Final hashes:

```text
Release manifest: 93b2006041491075e5f99733cecfc0bdbde4240650019655e2e83c1859a5ad8f
Canonical compatibility: ad9c15db798d9ca4733e0104cc500d8ecb7f8cd3b52302aaa7ac16b150570274
Balance compatibility: 589728025661bfca37b7c2460dac69bde7fd0833b340b168e66de8d8b3d8418a
Packed www: 7ef85e4c8ef651d6e58a30e669770cd837de9a117a33329b44bb9c7534668fa6
Source runtime fingerprint: 9561f92571a31f34c687b7518218e270ce1f9394df95306b42c04ee02f2f043c
Final APK SHA256: 18a540c415e5b227f8240de351d3973bd8f738e4ddd000fc33c9461299bfaddf
Signing certificate SHA256: d61aaf77c171f0f1e7841394eb0adaed196e146ad90226a0f07854c29ee073f0
```

This handoff audit independently rehashed current canonical/packed compatibility records and the final APK: they still match. There are 852 local www files including `.gitkeep`, and 851 shipped www files matched inside the APK. Compatibility, transport, release-root and whole-directory fingerprints are different contracts; do not interchange them.

**Only candidate-r2 was activated.** The first .74 candidate remains on HF as preserved history. Do not mistake the unsuffixed first-candidate APK or intermediate `9c15…` compatibility hash for the shipped release. The final pinned APK is:

[v1.33.74 final Android installer](https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/ed860aed17b0771a014af02b880ce32b1cb77a7b/MASSFRONT-v1.33.74-candidate-r2-mobile-install.apk?download=true).

Prior Stable .73 manifest root was `ec25c9e3f44b6a1f70f308057caef6e35379f3fb45dde6d7983892d331d97263`; its artifacts/rollback records are retained. No collaborator source ZIP or monolithic Galactic pack was uploaded. Native iOS/IPA/Xcode is retired; Apple remains supported via Safari-installed PWA.

## Completed in the shipped batch — preserve

- Publisher separates preparation, immutable upload, full payload/recovery verification and guarded activation. Expected-prior roots and an HF parent-commit check prevent overwriting intervening releases. HF aliases update together; previous rollback artifacts remain intact.
- Chunked OTA resume, staged/active handling, shared packaged/OTA compatibility, and async offline PWA `reg.update()` rejection handling were repaired. Do not remove integrity checks to make a failing updater appear to work.
- Bounded multiplayer reconnect preserves exact frames/pending commands, pauses missing/synchronizing seats, resumes from actually applied ticks, rejects stale callbacks and avoids duplicate charges. .74 negotiates 2–18 input ticks/default 8; legacy clients retain 2–3/default 2.
- Brood organic foundations and connecting veins restored using the accepted textures. Neutral nests preserve authoritative terrain/pathing; foundation refresh is not an impact/flood. Relighting/reset boundaries repaired. Both new textures reach older installations through OTA and decode offline.
- Selected-building **upgrade all owned buildings of this exact type**, atomic cost behavior, slower measured production, world progress/stall indicators, bounded faction work effects and useful utility feedback are included.
- Current local order batching and aircraft fixes below are implemented; preserve them and close their remaining runtime evidence rather than starting from old audit assumptions.

## Evidence to retain

All paths are relative to the verified root. These are recorded results, not a claim they were rerun for this handoff.

| Evidence | What it proves / limit |
| --- | --- |
| `.tmp/prepared-ota-upgrade/ota-73-to-74-r2-final-20260905-a/evidence.json` | PASS: exact shipped .73 APK public payload, durable chunk interruption/restart/resume, all 114 artifacts, actual .74 apply/confirmed boot, two offline restarts, both Brood textures offline, real rollback to .73. Hardware desktop Chromium, **not** Android native bridge/physical phone/Safari. |
| `.tmp/gl-probe-recovery/report.json` | PASS 31/31: real UI deployment, real WebGL context loss/restoration, simulation hold/resume, rebuilt GPU resources, preserved CPU terrain, nonempty output. Six screenshots; current packed hash still matches. |
| `.tmp/pwa-shell/release-v13374-r2-final/evidence.json` | PASS: two real origin-denied offline reloads, cached runtime and zero page errors. Chrome's online hint was not spoofed. Not WebKit certification. |
| `.tmp/live-space-release/release-v13374-r2-hosted-accepted/evidence.json` | PASS: fresh actual Space, all 112 runtime scripts and 117 browser files matched; four real clicks to unobstructed menu; zero page/request/HTTP errors. Service workers blocked to prove hosted bytes, not installed-PWA gameplay. |
| `.tmp/match-replay-live/release-v13374-r2-final-baseline-20260905T021556Z.json` | PASS 14/14 real Worker/auth/D1/WebSocket + actual upgrade consumer; fixture banks/buildings, **not a full two-client rendered simulation**. QA cleanup recorded. |
| `.tmp/match-replay-live/release-v13374-r2-final-delay80-20260905T021700Z.json` | PASS 14/14 with 80/87 ms held sends, 163/171 ms queued-to-ack. Bounded replay/charges/convergence, not arbitrary latency or WAN soak. |
| `.tmp/building-command/release-v13374-r2/evidence.json` | Eight layouts/scales and building/production/faction/utility checks. Earlier capture's 270/273 source inputs remain applicable; later boot/descriptor changes are separately verified. Recolored work-FX fixtures are not foundation proof. |
| `.tmp/environment-upgrade/brood-after-release-v13374-r2/evidence.json` | Actual placement including neutral nest; organic coverage, no new flooding, Medium/High/Cinematic close/tactical captures. |

Post-activation channel/range/CORS checks passed. Complete remote bytes/chunks were checked before both activations; the later plain-file CORS smoke samples 2/108 files and must not be described as another complete download.

Keep failed evidence. Historical GL/menu fixtures, offline-network fixtures, strict hosted-HTML/redirect fixtures, and a real transient HF 429 are explained in the release ledger. The final Space verifier permits only the exact 101-byte HF insertion and known local-file-to-HF-CDN chains; it does not strip arbitrary HTML or permit arbitrary external networking. Failed fixtures did not create new releases. Normal auth rate limits were never bypassed.

## Recommended next work — bounded batches, not a replacement master plan

### A. High-unit performance: fresh baseline and attribution first

Target remains four normal participants ×500 units, with Brood as an optional additional wildcard force; distinguish authoritative Brood from cosmetic GPU crowd bodies. Preserve graphics quality, unit caps, AI decisions and deterministic outcomes. Do not obtain a pass by hiding active units or disabling effects/AI.

The strongest retained benchmark is a **historical valid failure**, recorded `2026-09-04T20:22:53.028Z` in `audit/stage12-high-unit-deep-profile-20260904/final/evidence.json`:

- High, 412×900, DPR 2, AMD 610M, seed 99412: frame p50/p95/p99 **23.1/31.6/101.3 ms**, against **33.3 ms p99** target. Simulation p99 30.8 ms; render p99 25.9 ms; 40 fresh GPU samples p99 17.52 ms.
- Exactly 2,500 admitted; 2,359–2,383 live during sampling, 2,000 normal participants. Only ~500 normal units were visible; sampled visible Brood/proxies were zero. This does not prove dense close-model battle or visible swarm performance.
- Host free RAM was 514–662 MiB: a confounder, not proof that Windows caused every stall. Do not derive an FPS multiplier from incomparable runs.
- **Handoff audit: 39 of its 273 input-closure files have since changed**, including simulation, AI, terrain, renderer and packed copies. Same Git HEAD is not source identity. Reproduce on current source before claiming a new performance result.

Suggested exclusive work lanes:

1. **Simulation attribution** — `src/main.js`, `src/engine/perf.js`, focused hitch tests. Split `simWorld` into `envTick`/`crateTick`/`sceneryTick`/`shardTick`; split deformation into `processDeforms`/`waterFloodTick`/`deformMaintain`. A historical 176.1 ms CPU hitch spent 96.3 ms in deformation and 65.1 ms in world work; precise children remain unknown. Measure before coalescing or deterministically slicing work.
2. **Renderer/Brood attribution** — `src/ui/render3d.js`, `src/engine/brood-crowd.js` and its focused tests. Split billboard flush/ordnance/particles/cloud/icons/macro timing: a historical 123.1 ms render spike spent 111.2 ms in this group. Do not confuse delayed GPU-query delivery with GPU work for that exact CPU frame. Verify visible crowd near/mid/far, fog concealment, choke movement, combat, pressure changes and context recovery; proxies must not add gameplay entities.
3. **Harness / integration** — `tools/perf-lab/perf-probe-runner.mjs`, evidence and HUD acceptance. Record exact timestamps for each sample half, excluding screenshot gaps. Consider bounded detailed attribution below the current 100 ms hitch threshold. Run the population ladder, dense contact and sustained tests with recorded host headroom. Serialize browser access with the other lanes.

Once local implementation is authorized, the established baseline command sequence is:

```powershell
node tools/evidence-foundation/workspace-guard.mjs check-write
node tools/bundle.mjs
node tools/pack-www.mjs
node tools/perf-lab/perf-probe-runner.mjs --scenario 1v4_continental_conquest --units 500 --preset high --frames 240
```

The runner owns its freeze/server/hardware browser. `--cpu-profile` is a separately labeled diagnostic, not interchangeable acceptance. **`bundle.mjs --help` is not read-only: it writes the bundle.** Do not run it during a freeze. Preserve baseline screenshots, raw profiles, failures and exact identities.

### B. Multiplayer: do not confuse repaired replay with complete matches

- **Shared match initialization:** `src/game/matchconsumer.js` captures `{mode,slots,map}` and calls ordinary `newSkirmish()`. `src/main.js` still consumes local setup, wildcards, perks, modules, inventory, commander and doctrine choices. Verify two independently initialized real accounts/clients share an authoritative deterministic startup contract; fixture replay does not establish this.
- **Normal end-of-match lifecycle:** local `gameEnded` handling in `src/main.js` is not evidence of authoritative room victory/results/cleanup. The bounded server trace found recovery/forfeit `matchEnd` paths, not the complete normal-victory integration. Trace and test the real outcome path before declaring Stage 15 complete.
- **Durable recovery:** `cloudflare/massfront-auth/src/index.js` keeps only a bounded 128-frame/4 MiB in-memory replay journal. Eviction/deploy of an active room fails closed with `recovery_history_unavailable`; `_snapshot()` does not persist emitted frames. `src/socialui.js` also correctly fails closed with `resume_start_missing` when initial start state was never received. Do not remove these protections without a tested durable state/replay protocol.
- **Online counter semantics:** `src/socialui.js` heartbeats only while Social is visible and polls at 45 seconds; it is not an all-gameplay-session census. Individual presence remains disabled. A later redesign needs privacy/TTL/heartbeat correctness, not invented player counts or a flag-only fix.
- **Large selections already implemented:** `matchconsumer.js` splits move/stop/hold/attack/guard into ≤64 refs and ≤2,048 bytes per command, at most eight commands, and rejoins/validates atomically before mutation. 512 is a structural ceiling; byte limits can reduce capacity. Preserve visible failure and all-or-nothing application. Existing `audit/stage15-match-consumer/evidence.json` and takeover hashes are stale against current consumer `7177f2e2fb4edb2f9bcf35f8b5cf8726f4b4e899988a8387b7e6a1d96df18593`; both are nonvisual, nonrelease probes. Run current 1/48/100/250/500 selection and real two-client checks, not another blind rewrite of the old 64-unit limitation.

Keep supported modes and backend flags active. Any future Worker deploy or production QA run requires its scoped approval; do not disable multiplayer to pass a release gate.

### C. Aircraft, GUI, content and small updater debt

- **Aircraft fixes exist but need broader acceptance.** Current altitude bands are `[22,62,128,196,0]`. Raptor ground-strike range now uses planar distance with a 72-unit ceiling; air-target range retains 3D distance and ≤22 vertical separation. Aircraft supply world `sourceZ` to line projectiles and height-aware swept fuses. Same-generation Massflesh ascent/landing resets exist; transports skip generic combat acquisition.
- Do not blindly rerun `tools/probe-air-warfare.mjs`: it still expects old 8/27/58/94 heights. Current isolated VM tests do not prove real damage or visual muzzle/trail continuity. Arc initialization still ignores `sourceZ`; the renderer's muzzle offset is not the same as hull altitude. Verify all actual aircraft/projectile families, high-altitude/superweapon paths and real visible output before closing Stage 5.
- **Rollback-label cosmetic defect:** `src/updater.js:3075–3076` uses running `APP_VERSION` for the packaged fallback label. A .73 installer running .74 OTA can display “packaged v1.33.74.” Actual rollback to .73 passed. Fix display identity only in a later batch; preserve proven installation/rollback behavior.
- **GUI direction remains locked:** cinematic original MASSFRONT art inspired by the supplied C&C3/Supreme Commander references, battlefield visibility, selectively transparent/stylized frames, readable/clamped text, icons matching actual models, commander shortcut, scrollable unit-stack/hotslot controls and nonobstructive notification feed. Do not regress to opaque box/text-heavy layouts. Test portrait, landscape, enlarged scaling, touch actions and clipping; a clean console is not visual approval. See `docs/GUI_ART_MULTIPLAYER_AUDIT_2026-09-04.md`, but distinguish its superseded bugs from open work.
- **Optional packs:** resume/checksum/storage/quota tests and the 768 MiB metadata fixture are not proof of a physical interrupted massive download. Retain original art/model source quality; compression/LOD/runtime packaging need before/after visual and delivery acceptance. No giant source ZIP or whole Galactic upload as a shortcut.
- **Galactic work is later, not silently completed.** Revisit `docs/GALACTIC_COMMAND_LAYER_HANDOFF_2026-08-31.md` and audit R0/R1/P1–P6 against current source. Preserve the unified main-game intention, real submenu/mode wiring, side-on ship management, skippable planetary tutorial, post-tutorial faction/starter commander choice, and KEEL as UGA. Do not fake persistence/boarding or invent commander/catalog IDs. Post-stage-18 visual editing tools remain a separate later handoff (`docs/POST_STAGE18_VISUAL_EDITOR_UI_HANDOFF_2026-08-31.md`).

## Build/release invariants for Claude

- Plain classic JS, one concatenated global scope; no imports/exports/framework in game source. Register new scripts in both `boot.js` and `assets/data/manifest.json` in correct order. Run the bundle syntax gate after source changes.
- Preserve renderer ownership, sampler units 4/5/6, GL state restoration and hardware-only verification. Keep AAC+OGG fallback behavior and Apple safe areas/offline/rotation support.
- Android artifacts require current www sync, signed build, mandatory shrink and signature/alignment checks. Compare actual packaged bytes, not filenames. No native iOS work.
- Release metadata, packed source, OTA and Android must agree. Use current `tools/publish-hf-release.ps1`, delivery/activation contracts and expected-prior checks; read their actual options before running. The final .74 Space verifier is pinned to .74 identities/observed hosting behavior: adapt deliberately for a future approved candidate, not by reusing a stale green report.
- A new approved release must upload immutable artifacts first, verify every required full and incremental artifact/chunk/CORS/range, preserve rollback, and activate mutable pointers only after gates pass. Publish exact www to the existing Space without deleting its README/config. No same-version overwrite of live bytes.

## Suggested first response from Claude

Confirm the canonical checkout, current .74 identities and dirty ownership; identify which historical documents are stale. Propose exclusive performance-attribution lanes and a fresh source-bound baseline. Separately flag the multiplayer initialization/result/durable-recovery gaps and preserve existing batching/aircraft/Brood fixes. Do not announce another release or claim the full 18-stage plan is complete. Report every pass, failure, untested area and intended next boundary explicitly.
