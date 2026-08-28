# MASSFRONT — Claude Handoff (2026-08-20)

## Purpose

Continue the remaining MASSFRONT master-plan work from a **dirty shared worktree**. This is a quality-and-verification pass, not permission to discard prior work or activate a release.

Repository:

`C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`

Branch at handoff: `cursor/strip-mass-node-bloom` (`c4090cc` HEAD).

## Non-negotiable rules

- Preserve all existing uncommitted changes. Do **not** use `git reset --hard`, `git checkout --`, broad cleanup, or delete generated assets merely because they are untracked.
- Run `node tools/bundle.mjs` after **every runtime/source edit**. Classic-global source order must remain synchronized in both `boot.js` and `assets/data/manifest.json` when adding a new script.
- Do not activate Hugging Face/Cloudflare release channels, `update.json`, or an Android release. This handoff authorizes local work, verification, and safe staging only.
- Do not claim a visual or hardware result unless the evidence is a valid AMD ANGLE/D3D11 capture with PNG signature/decode/variance checks and zero page/GL errors.
- Keep gameplay, save, replay, network, and destruction outcomes unchanged unless a deliberate gameplay change is explicitly requested. This pass is primarily presentation, duplication removal, quality tiers, and verification.
- Keep custom GL state restoration strict: restore blend/cull/depth state and the expected 3D program after a custom pass.
- Do not add another blanket particle emitter to mask an existing effect. Macro effects have a strict transient layer budget.

## What is already implemented

### Combat / destruction / shields

- `mfEmitMacroFx()` recipe ownership and stable event kinds are in `src/game/sim.js`.
- Macro flipbook renderer: `src/engine/macrofx.js`.
- Shield dome/plate renderer and bounded hit queue: `src/engine/shieldfx.js`.
- GPU point-spray use was removed from audited explosions, impacts, beam termini, collapse, and shield feedback. Macro recipes use at most three transient logical layers.
- Nova keeps its gameplay damage circles but emits one authoritative visual event with merged crater/burn presentation.
- Building collapse uses 1–3 airborne slabs and bounded aftermath; physics has deterministic seeded behavior, pause suppression, and pool trimming.
- Original authored runtime atlases exist under `assets/textures/vfx/` (blast, collapse dust, wreck fire, missile/air smoke, beam terminus, organic ichor, aircraft destruction).
- `tools/verify-runtime-fx-contracts.mjs` previously reported 22/22 numeric contract checks on AMD Radeon 610M through ANGLE/D3D11. Those numbers do **not** constitute final art approval.

### Terrain / city / buildings

- Terrain uses authored material pairs, atomic albedo+normal readiness, a neutral normal fallback, `uGroundQ`, shared anisotropy budgeting, and location profile/theme selection.
- Runtime terrain assets are under `assets/terrain/`; location-specific soil pairs are under `assets/terrain/locations/`.
- Building-v3 atlas triplet exists:
  - `assets/textures/mat-albedo-building-v3.png`
  - `assets/textures/mat-normal-building-v3.png`
  - `assets/textures/mat-orm-building-v3.png`
- World-kit semantic material IDs 108–111 exist. They improve semantics but are not sufficient on mobile because the shared 11×11 atlas is downsampled to 1408² (128 texels/cell).
- New compact world-kit assets are present and are the required route for the remaining low-resolution building defect:
  - `assets/textures/materials/mf-worldkit-v4-baseao.png`
  - `assets/textures/materials/mf-worldkit-v4-nre.png`
  - `assets/textures/materials/mf-worldkit-v4-masks.png`
  - `assets/textures/materials/mf-worldkit-v4-provenance.json` (**do not package this provenance file**)

### Other completed master-plan tracks

- Physics/debris/cloud deterministic behavior is implemented and verified by the physics capture/probe lane.
- Galaxy/planet/region/mobile War Table UI is complete and previously passed 20/20 D3D11 checks.
- Auth/friends/block/report core has been live-tested against the Cloudflare Worker/D1 target. Chat/presence foundation is deliberately feature-gated and not activated.
- Android candidate packaging was built, signed, and 16 KiB-aligned earlier; it is stale after later source/art changes and must be rebuilt only at final freeze.

## Current active work at cutover

### 1. City/terrain quality — active, highest priority

Owner workstream: `city_terrain_finish`.

Target: replace the rejected mobile 128-texel-per-material world-kit sampling with the compact 1024² BaseAO/NRE/mask triplet (512 texels/material; 4× density) without adding sampler units or draw calls. Existing units 4/5/6 and `uAssetOn=2` are the intended path.

Likely owned runtime files:

- `src/engine/mesh.js`
- `src/engine/worldsites.js`
- `src/engine/gl.js`
- `src/engine/materials.js`
- `tools/capture-megacity-materials.mjs`
- the three compact world-kit textures and provenance

Latest reported state:

- Runtime edits bundle cleanly (`82 sources -> dist/massfront.html`, approximately 25.28 MB at the time of report).
- Compact source is 1024², four PBR roles, deterministic seamless-bake QA, ~5.15 MB package bytes, ~16 MiB mip residency.
- Latest AMD 610M ANGLE/D3D11 compact-worldkit capture reports **19/19 assertions**, valid 824x1830 PNG, seven mode-2 meshes, actual 1024² GPU maps, zero GL/page errors, and normal close/tactical captures. Do not cite the old `faceclass-worldkit` capture; it is rejected evidence.

Required package/OTA integration (exact):

`tools/pack-www.mjs`

```js
// Keep only runtime texture files, never provenance.
|mf-worldkit-v4-(?:baseao|nre|masks)\\.png$
```

Assert all three exact paths:

```js
assets/textures/materials/mf-worldkit-v4-baseao.png
assets/textures/materials/mf-worldkit-v4-nre.png
assets/textures/materials/mf-worldkit-v4-masks.png
```

`tools/bundle-update.mjs`: place the same three strings in `OTA_RUNTIME_PATHS`, not a static binary list, because `mfWorldKitSkin()` builds the URLs dynamically. Do **not** add PNGs to `assets/data/manifest.json`; it is a classic-JS script manifest.

Required city/terrain acceptance:

- Mobile user agent must truly match `/Android|Mobile/`; `isMobile:true` alone is insufficient.
- Shared material atlas is 1408² on mobile / 128 texels per cell.
- Compact base/NRE/mask are each 1024² on GPU / 512 texels per material.
- Exactly three compact requests; all ready; zero failed/rejected; seven world-kit meshes use `assetMode===2` and the same compact map object.
- Capture same Vespera seed/camera at 412×915@2 on AMD ANGLE/D3D11.
- Sidewalk pair narrower than carriageway; no repeated command-zoom square expansion-joint grid; sidewalks/pad borders are not the brightest large-area feature.
- Pads remain chamfered; no square material halos; world-kit wall/roof/trim contrast remains readable without black platform dominance.
- Shore transition is continuous, non-circular, and limited to the authored near-water band.
- The latest city/terrain harness still fails the road edge at **3.131 physical px** versus target `<=2 px`; pan shimmer passes at **0.1818%**. This remains an open visual gate.
- Close terrain must reduce turbulent/cloud-like procedural relief rather than hiding it with blur.

### 2. Combat FX art and Cinematic volumetrics — active, highest priority

Owner workstream: `combat_fx_finish`.

Latest saved correction pass (already bundled after each source edit):

- Rebaked four 512² combat atlas sets, 6px gutters, 685,792 package bytes, ~4 MiB RGBA8 residency.
- Air-death alpha changed to one feathered cohesive silhouette; smoke retains low-alpha feather.
- One owned aerodynamic plume stretches rather than stamping a rectangular matte.
- Air-core matte shrunk; generic mechanical debris tinted dark alloy.
- Single shield ripple strengthened.
- Volumetric bilateral composite scissored to projected proxy union while preserving half resolution and High/Cinematic max steps of 24/32.
- `tools/verify-runtime-fx-contracts.mjs` now waits for authored atlas readiness and isolates macro/shield scenes.

Do not undo these structural constraints:

- Direct impact: core + optional ring/fragment.
- Explosive/strategic: core + one shockwave + one grouped debris layer.
- Building collapse: dust + 1–3 large slabs.
- Shielded hit: localized shield ripple only; no hull impact.
- Beam terminus: core + optional ring; beam geometry remains separate.
- No audited recipe may emit GPU point sprays. Paused beam rendering must not increase `gpfxLive`.
- Low/Medium use one billboard per macro layer; High uses 24 steps, Cinematic uses **32** steps. Do not reduce `volSteps` to pass a timer.

Previously rejected visual frames to replace:

- Macro blast (`02`): generic/radial/nested appearance; needs one readable core, one annulus, one dark coherent debris group.
- Damaged aircraft trail (`05`): blocky/pixel-stepped smoke; needs a continuous velocity-aligned plume.
- Aircraft destruction (`06`): translucent flower/matte lobes and pale slabs; needs a compact feathered fire/soot core + dark metallic debris.
- Shield (`07`): too faint/contaminated; capture it isolated and readable.

Required final proof:

- Fresh valid 1800² (or recorded viewport-equivalent) AMD ANGLE/D3D11 captures for 02/05/06/07.
- Full macro telemetry remains `<=3` transient layers and `forbiddenGpu===0`.
- Latest focused timer with exactly three volumes passes: High 24-step p95 **0.086 ms** and Cinematic 32-step p95 **0.100 ms** over 184 samples, both within `<=2.5 ms`.
- The performance target now passes, but visual approval remains open: blast core 02 is nearly invisible behind a flat ring; 05 smoke remains dark/stamp-like; 06 retains orange lobes and pale debris; 07 shield contact is obscured by residual crash/fire imagery.

### 3. Social/chat/presence/multiplayer readiness — active audit, no deploy

Owner workstream: `asset_bake_qa` is currently producing a compact capability matrix only.

Known state:

- Live Worker health/auth/social core has already been tested, documented in `docs/LIVE_SOCIAL_VERIFY_2026-08-19.md`.
- Worker/client staged changes include additive `migrations/0002-chat-presence.sql`, friend-only messaging/presence controls, blocks, bounded normalization/rate limits, keyset pagination, content-safety seam, session-epoch safety, and local tests.
- Current auth-owned dirty files are `cloudflare/massfront-auth/{package.json,schema.sql,src/index.js,test/social.test.mjs,wrangler.toml,migrations/0002-chat-presence.sql}`, `src/authportal.js`, and `tools/probe-social-client.mjs`.
- Last recorded local evidence is Worker `npm test` **262/262** and `node tools/probe-social-client.mjs` **46/46**. This cutover audit did not make a remote deploy/live endpoint call, so do not infer currently deployed chat/presence availability.
- Feature flags and email bindings intentionally remain disabled/commented. Do not enable chat, presence, or email without an explicit operational decision, Worker/D1 migration confirmation, sender-domain onboarding for email, and live negative-path testing.
- There is no genuine real-time multiplayer transport/service yet. Do not claim multiplayer is live; create a separate architecture/implementation effort only if explicitly requested.

## Master-plan status at cutover

| Track | Status | Gate |
|---|---|---|
| Combat FX / destruction / shields | In progress | Fresh art captures + Cinematic p95 |
| City / buildings / terrain / shore | In progress | Compact skin actually bound + close/tactical evidence |
| Physics / debris / cloud sim | Implemented | Re-run after freeze only |
| Galaxy / planet / region UX | Complete | Preserve 20/20 mobile D3D11 result |
| Auth/friends/report core | Live-tested | Preserve; do not regress |
| Chat/presence | Staged/disabled | Requires operational enablement decision |
| Multiplayer | Not implemented | Honest architecture blocker |
| Asset/package integrity | Pending final freeze | Exact paths, no source-art leakage |
| Android package | Candidate exists but stale | Rebuild/sign after source freeze |
| Release/update channels | Blocked | All gates + regenerated updater required |

## Final verification sequence after active edits freeze

Run from repository root. Use `git -c safe.directory=...` if the sandbox user sees the Windows ownership warning; do not mutate global Git configuration merely to inspect status.

1. `node tools/bundle.mjs`
2. Run the relevant deterministic terrain/world-kit and combat-atlas bake verification modes.
3. `node tools/verify-runtime-fx-contracts.mjs`
4. `node tools/verify-perf-terrain-acceptance.mjs` — it should fail loudly if a covered gate fails; inspect JSON/PNGs, not just console output.
5. `node tools/capture-megacity-materials.mjs` after compact asset binding is instrumented.
6. `node tools/pack-www.mjs`; assert the three compact runtime images are present and `assets/source/` is absent from `www/`.
7. `git diff --check` (ignore only known line-ending warnings; do not hide real whitespace errors).
8. Rebuild Android only after all source/art inputs are frozen: Capacitor sync, offline `:app:assembleInstallable`, shrink/sign, `apksigner` v2/v3 verification, `zipalign -c -P 16`, runtime-byte parity.

## Release blockers

Do not release until all are true:

- Combat and city visual captures are approved, not merely contract-green.
- Cinematic volumetric p95 is within the stated target or the target is deliberately renegotiated by the user.
- Road edge/terrain quality gate passes.
- Compact world-kit resources are packaged/OTA-covered and proven on mobile GPU.
- Final package/build evidence is from the frozen tree, not the older 1.33.46 candidate.
- `update.json` is regenerated under a **new version**. Existing updater fallback/delta content is stale and omits current sources; do not activate it.
- Chat/presence stays off unless explicitly operationally approved and live-tested.

## Useful evidence and tools

- `tools/verify-runtime-fx-contracts.mjs`
- `tools/verify-perf-terrain-acceptance.mjs`
- `tools/capture-megacity-materials.mjs`
- `tools/capture-physics-destruction.mjs`
- `tools/capture-wartable-mobile.mjs`
- `tools/probe-cloudfx.mjs`
- `tools/probe-social-client.mjs`
- `docs/ANDROID_PACKAGE_EVIDENCE_2026-08-19.md`
- `docs/LIVE_SOCIAL_VERIFY_2026-08-19.md`
- `docs/LOCATION_SURFACE_ART_V1.md`

## Handoff note

The worktree contains unrelated user work, Android build intermediates, source art, historical probes, and generated assets. Treat every existing change as intentional until examined. Make the smallest compatible edits, keep evidence adjacent to the affected tool, and report failures honestly rather than weakening acceptance criteria.
