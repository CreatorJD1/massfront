# MASSFRONT delivery Stages 2–5 current verification — 2026-08-30

This is a read-only acceptance audit against `docs/MASTER_PLAN.md` SHA-256 `4be283fb5e094aa5a92b4975ea2cfd31d29e1c8bdd15aebc2490faef1cba9b20`, implementation-track requirements at lines 25–111. No game source, manifest, boot file, package, Stage 10 material, backend or release artifact was edited. The durable machine-readable summary is [`../audit/stages02-05-current/evidence-ledger.json`](../audit/stages02-05-current/evidence-ledger.json).

## Decision

| Delivery stage | Current decision | What is proven | What blocks acceptance |
| --- | --- | --- | --- |
| 2 — navigation, movement, population, naval/formations | **NOT ACCEPTED** | Navigation blocker probe 16/16; population admission 16/16 at its tested source; movement behavior itself reached the goal without penetration or stalls. | Naval probe fails one post-arrival heading-twitch check. Both movement runs correctly fail overall because the dirty worktree moved during execution; the second also observed WebGL context loss. Strategic sector routing lacks a dedicated current probe. |
| 3 — projectiles, turrets, charge, singularities | **NOT ACCEPTED** | Weapon-flight requirements pass; turret/charge suite 12/12; singularity physics 11/11; combined flight/singularity 10/10 at its tested source. | Turret-articulation audit reports 1 FAIL and 1 UNSUPPORTED, including missing authoritative Horde mappings. Authored charge/singularity/warning presentation has no current visual approval. |
| 4 — beams, trails, intelligence, utility AI/manual override | **NOT ACCEPTED** | Utility board passes all nine job kinds and deterministic ownership rules; live integration passes 38/38; beam runtime reaches the renderer and remains bounded/paused-stable. | Intel probe has a real page error (`Cannot redefine property: mfGameplayStateHash`) and explicitly says the artillery contact consumer is not wired. Air-projectile trail lifecycle fails. The runtime-FX report labels missiles/beams `fail-art`. Overlay and full contact/scatter requirements remain unproven. |
| 5 — air warfare | **PROVISIONAL FUNCTIONAL PASS; NOT FINAL ACCEPTANCE** | Air-war mission suite 22/22 and propulsion suite 19/19 on hardware WebGL2, source-stable during each run. | `boot.js` changed after both runs, so their package identity is no longer the final worktree snapshot. Damaged-aircraft and crash presentation remain `needs-art`; no physical-device or manual visual approval was performed. |

## Commands and results

All browser probes used the repository launcher and reported ANGLE D3D11 on AMD Radeon 610M. “PASS at execution” means start/end source sets matched inside that run; it does not erase later worktree drift.

| Command | Result | Durable interpretation |
| --- | --- | --- |
| `node tools/probe-navigation-blockers.mjs` | PASS, 16/16 | Deterministic terrain/water/building/city-wall/relic/rock/wreck blocking, clearance classes, attack-to-clear, cache invalidation and repeat hash. |
| `node tools/probe-movement-blockers.mjs --repetitions 2` | FAIL twice | Behavioral checks pass, but evidence identity fails closed on concurrent dirty-fingerprint drift; second run also reports context loss. Not green. |
| `node tools/probe-naval-rally.mjs` | FAIL | 16 checks pass and 1 fails: `noPostArrivalHeadingTwitch=false`. Formation spread and deterministic naval water goals pass. |
| `node tools/probe-population-cap.mjs` | PASS, 16/16 at execution | 500 per Commander seat, hard admission, reservations, opposing independence, cargo recount and factory admission. Later boot/manifest drift prevents final package acceptance. |
| `node tools/probe-weapon-flight.mjs` | PASS | Unguided rounds do not home; guided cap/intercept, proximity fuse, deterministic artillery arc and obstruction gates pass. |
| `node tools/probe-stage3-turret-charge.mjs` | PASS, 12/12 | Yaw/pitch/traverse gates, explicit charge states/interruption, immediate rapid fire and deterministic repeat. |
| `node tools/probe-singularity-physics.mjs` | PASS, 11/11 | Radial pull, orbit, mass response, bounded consumption/speed and determinism. |
| `node tools/probe-weapon-flight-singularity.mjs` | PASS, 10/10 at execution | Combined guided/unguided and rigid-debris attraction path. Its tested boot is no longer the ending boot. |
| `node tools/probe-turret-articulation.mjs` | FAIL: 6 PASS / 1 FAIL / 1 UNSUPPORTED | Missing authoritative Horde articulation and unsupported barrel coverage stay open. |
| `node tools/probe-intel-contacts.mjs` | FAIL | Contact creation, persistence, expiry and deterministic bounded capacity work; page runtime fails on duplicate `mfGameplayStateHash`, and artillery consumption is reported unwired. |
| `node tools/probe-utility-job-board.mjs` | PASS | Nine job types, deterministic leases/claims, bounded search, manual override and diminishing assistance. |
| `node tools/probe-live-utility-jobs.mjs` | PASS, 38/38 | Real salvage/repair/assistance/mining/survey/escort/return, invalidation, manual override, deterministic recovery and AI use. |
| `node tools/test-raymarched-artillery-trails.mjs` | FAIL | Air projectile has populated path history while `active=false`; no trail acceptance. |
| `node tools/verify-runtime-fx-contracts.mjs` | 36/36 runtime checks; visual audit not green | Beam lifecycle/render checks pass. Its own art audit calls missiles/beams `fail-art`; PNG decode/variance is not visual approval. |
| `node tools/probe-air-warfare.mjs` | PASS, 22/22 at execution | Altitude bands, lead pursuit, firing cones, CAP/escort/intercept, strike phases, recon and repeatability. |
| `node tools/probe-air-propulsion.mjs` | PASS, 19/19 at execution | Bounded authored exhaust, fixed-step histories, damage smoke/flame, fog/depth state and faction emitter topology. |

Three concurrent browser attempts (`probe-weapon-flight-singularity`, `probe-turret-traverse`, `probe-turret-charge`) initially failed on `PW_LOCK_NOT_OWNED`; they are infrastructure collisions, not gameplay failures. The combined flight/singularity probe was rerun alone and passed. The authoritative 12-check turret/charge suite passed; the separate articulation audit still failed and controls the open result.

## Source identity and drift

HEAD during the audit was `0ea4e1ed9d99df55b4088e812736400cca8bff69`. The worktree was already heavily dirty and shared with active work. Relevant ending hashes include:

- `src/game/sim.js`: `ce4cdf71ecafef10fcdf5ec75b6b1ba99df211a4cc135843e628a212dd0b6a48`
- `src/engine/physics.js`: `e4dc89f49a9bf2e1a5d2ced0e7fe3ee950bad30b6c3a4341af2787cb6d6f6867`
- `src/engine/ordnancetrails.js`: `d695c7bf8a524e0f1c3049aa9d56c9104e1e4f0b0bb2f9f07a257f1b0a7b89af`
- `src/game/utilityjobs.js`: `cf762f6a72144719df2fcf4bad0bcd7666609fcc50245e6fb30fa916ba9b28c1`
- `src/game/airwarfare.js`: `f1eadf76530d45a43d5f28314138e26ceabf107bd6133a7fb706f0eee46434fa`
- `src/intel.js`: `1ef9bb5c28723bd39e5b279307ccba5accf67b85f043a9908f4438558682b54e`
- `boot.js`: `a6ec2282721227596c4c017dcc010e290be0a605ea70ac14d674319bfb9b83a9`
- `assets/data/manifest.json`: `af6dd89e4955b8d571a734c0f9420a1aa44515773702cde01ac77beaec59ce95`

The clean air runs tested boot hash `bec4770754d550760ecde0b75783bdedcfcc0bec190399b6f4ca45f1a1ee4c45`; therefore they are valid point-in-time evidence but not final-current package evidence. This audit intentionally does not claim completion from a stale package fingerprint.

## Exact remaining acceptance work

1. Freeze or otherwise stabilize the shared checkout, then rerun movement, population, combined singularity, air-warfare and air-propulsion against one unchanged boot/manifest/runtime package.
2. Fix and rerun the naval post-arrival heading-twitch case and add a dedicated strategic-sector-routing scenario.
3. Resolve missing/unsupported turret articulation coverage, especially Horde mappings, and obtain actual visual approval for charge, breech/heat, singularity and warning presentation.
4. Resolve the duplicate non-configurable `mfGameplayStateHash`, wire artillery to `IntelContact` records with stale-confidence scatter, and verify the six required overlays.
5. Fix the air-projectile trail active/history mismatch; rerun fog, depth, distance-LOD and fallback coverage. Reduce the beam/trail overbright art called out by the current runtime-FX audit.
6. Repeat Stage 5 source-matched acceptance on the ending package, manually inspect fresh screenshots, then run Android and iOS device lanes. Static/VM/browser checks in this document are not device proof.

Until those items close, Stages 2–4 remain open and Stage 5 remains only a provisional functional pass.
