# MASSFRONT Stages 2–5 repair handoff — 2026-08-30

## Outcome

The concrete Stage 2–5 failures were rechecked against the current runtime on hardware ANGLE/D3D11. Stage 2 is functionally green in the browser, the Stage 4 intel/trail/beam defects are cleared, and Stage 5 is source-current at 22/22 plus 19/19. No gameplay source or locked model file was changed by this repair lane.

Stage 3 is not fully accepted: turret articulation still has a genuine locked-model gap. Physical Android/iOS approval and several visual/overlay acceptance gaps also remain. The machine-readable evidence is in `audit/stages02-05-repair/evidence-ledger.json`.

## What changed

- `tools/probe-naval-rally.mjs`: corrected the twitch classifier. The old 0.006-radian threshold counted sub-degree quantized settling corrections as visible reversals. The source-matched rerun has all 8 ships settled, 0 arrival exits, 0 post-arrival reversals, 0 radial reversals, 0 late travel and 0 final overlaps.
- `tools/probe-movement-blockers.mjs`: retained broad dirty-tree drift as a diagnostic but bound acceptance to the runtime source, served package and tested package identities. This prevents unrelated docs/tools writes from invalidating an otherwise source-stable run.
- `tools/probe-navigation-blockers.mjs`: added a real strategic-sector-routing case. The live runtime selected a passable adjacent portal and reduced strategic distance from 22 to 21. The suite is now 17/17.
- `tools/probe-intel-contacts.mjs`: replaced the stale `UNSUPPORTED_NOT_WIRED` declaration with a live artillery-consumer scenario. A radar contact decayed from 0.72 to 0.44 at age 7, was captured by the charge, produced deterministic scatter, and was rejected after the record was cleared. Source identity now covers the consumer and sim.
- `tools/test-raymarched-artillery-trails.mjs`: queried the real `air:<slot>:<generation>` key. The old slot-only key caused the false active/history mismatch. All projectile families and the air trail now activate, retain bounded history, stop and clear correctly.
- `tools/verify-runtime-fx-contracts.mjs`: replaced the stale beam art rejection after inspecting the fresh 1800×1800 capture. Five missile silhouettes remain readable; three cyan beams are narrow and bounded with compact termini, without the reported broad white columns/discs.

## Current verification

| Stage | Probe | Result |
| --- | --- | --- |
| 2 | navigation blockers + strategic sector routing | PASS 17/17 |
| 2 | movement blockers, 2 deterministic repetitions | PASS; all 20 acceptance gates, unrelated dirty-tree diagnostic recorded false |
| 2 | naval rally, 2 deterministic repetitions | PASS; all 16 acceptance gates, unrelated dirty-tree diagnostic recorded false |
| 2 | population cap | PASS 16/16 |
| 3 | turret articulation | **FAIL: 6 PASS / 1 FAIL / 1 UNSUPPORTED** |
| 4 | intel contacts + artillery consumer | PASS 13/13; no page error |
| 4 | raymarched artillery/air trail matrix | PASS |
| 4 | runtime FX contracts | PASS 36/36; missiles/beams `pass-art` |
| 5 | air warfare | PASS 22/22, current source set |
| 5 | air propulsion | PASS 19/19, current source set |
| Global | bundle | PASS, 106 sources, 26.57 MB |
| Global | classic-script global scope | PASS, 3131 names, zero collisions |

All browser probes reported AMD Radeon 610M through ANGLE Direct3D11, not SwiftShader.

## Defect classification

The naval twitch, movement dirty-fingerprint rejection and air-trail mismatch were probe defects, not gameplay defects. The artillery consumer already existed in `src/game/commander.js`; the prior probe simply declared it unsupported without exercising it. The duplicate `mfGameplayStateHash` page failure is also absent from the current runtime and was resolved outside this lane; no statehash or social UI file was touched here.

The turret result is a genuine runtime-art limitation. Horde types 1, 2, 3, 16 and 26 have authoritative turret behavior but no articulated turret model. Fifteen mechanical faction/type mappings also lack independent barrel articulation. Because the user locked the models and Stage 10 model work belongs to Cursor, this lane did not rewrite procedural model builders or falsify the audit.

## Remaining acceptance gaps

1. Author or explicitly waive the locked-model Horde turret and mechanical barrel articulation gaps.
2. Consolidate proof for weapon, radar, minimum-range, HQ, repair and construction overlays, plus keyed utility-beam ownership across all mining/repair/reclaim/construction paths.
3. Art review remains open for terrain, organic hits, damaged-aircraft smoke and air-destruction smoke/fire/debris. Beam art alone is accepted by this handoff.
4. Run Android and iOS physical-device lanes. Hardware desktop WebGL evidence is not device approval.

No files were staged or committed.
