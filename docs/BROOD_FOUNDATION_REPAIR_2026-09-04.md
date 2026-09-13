# Brood foundation restoration — 2026-09-04

Status: locally implemented and visually inspected in a source-matched packed hardware-browser diagnostic. This is not full product/device acceptance. No version increment, upload, APK, or Stable activation. Source remains v1.33.73; this is not a claim about the installed public build.

## Result and causes

Claude's existing organic beds, purple territory, pores and connecting veins are visible again. No models or raster masters were regenerated.

- The relief crop was reading world-space coordinates from a local canvas. Most off-origin colonies therefore had zero relief/G-mask coverage. It now reads the local origin.
- Paint, relief and G now share bounded quadratic neighbour links, including their control-point bounds. The local rim clip no longer cuts off the connecting trunks. The existing two-neighbour/340-world-unit limit stays intact.
- Wildcard `nest` placement now takes the organic foundation route. Neutral nests do not flatten terrain or change authoritative passability.
- Organic G takes visual precedence over hardscape R in the terrain shader; purple macro RGB survives the soil-PBR blend. Horde structures no longer receive rectangular mechanical skirts. R and PASS are not repurposed as creep masks.
- **The final erasure bug was hydrology:** foundation refreshes called the same shoreline reaction as a crater. Near water this relit the fresh tissue as biome soil. Only positive finite impact depth now triggers that reaction. Legitimate later relights preserve dry organic paint from `terrainBase`, apply scorch once, and still permit genuinely flooded pixels to use water shading.
- Dirty menu terrain is rebuilt after resetting the old entities and before creating the attract scene, preventing old colony paint from leaking into that scene.
- The existing Brood albedo and normal/roughness WebPs are included together in the OTA binary list and explicit package checks. They total 915,046 bytes. Local creep still borrows the currently bound soil material; this change does not add a per-colony sampler or fullscreen pass.

Relief here means shader-lit surface height/normal response, not a newly displaced CPU mesh or pathfinding terrain layer.

## Evidence

Current runtime compatibility: `d31cb0bd901f`; balance compatibility: `589728025661`. The integrated rerun includes the subsequent unit-intel duration correction without changing Brood source.

Tested-package/runtime fingerprint: `3c8ec95f1da31aad902a966b845788b4819b48ecc0f0c43ac16942c511ead4a1`.
Source-runtime fingerprint: `ec56ff9559694b725670e523f98744329a9d66bc50e6f6fcd0a3d8f8e5b9f19c`.

Hardware: ANGLE / AMD Radeon 610M / D3D11, desktop mobile profile 412×900 at DPR 2. This is not a physical S25 or Safari device test. The browser entered the offline launcher, War Room and deployment through the UI; the diagnostic then placed fresh Horde structures through actual `addBld`, not by recolouring an existing human foundation. Fog was explicitly disabled for the visual fixture.

- Before: [baseline](../.tmp/environment-upgrade/brood-before-read-fix-20260904/evidence.json), [close image](../.tmp/environment-upgrade/brood-before-read-fix-20260904/high-close.png). All four fixture foundation samples had zero creep coverage.
- After: [source-matched integrated evidence](../.tmp/environment-upgrade/brood-after-integrated-20260904/evidence.json), [tactical image](../.tmp/environment-upgrade/brood-after-integrated-20260904/high-tactical.png), [close image](../.tmp/environment-upgrade/brood-after-integrated-20260904/high-close.png).
- Both use Aelos North, seed 118020 and the same final site/camera coordinates. The before and final initial clocks were 20.000 s; final normal mip maintenance completed at 20.300 s. These are static-terrain comparisons, not frame-time or pixel-identical simulation benchmarks.
- Medium, High and Cinematic each have tactical and close captures. Root inspected the actual final images. JavaScript errors: none; source freeze: stable.
- The diagnostic deliberately records `acceptance:false`: it covers newly placed foundations after real deployment, not the complete gameplay, fog, context-recovery and device matrix. The earlier `brood-after-hydrology-20260904` capture at runtime `9bc116284d32` recorded its network snapshot before page teardown. The final integrated rerun now records `status:PASS`, `finalized:true`, `pageClosed:true`, zero blocked external requests/WebSockets, and stable source through cleanup.
- All four final colony samples have nonzero relief and 649–887 purple tissue pixels in their 33×33 sample windows. Placement generated zero flood events. Neutral nest placement preserved height, PASS and hardscape hashes. Twelve paused renders did not alter the infestation field.

Intermediate captures remain recorded, **not accepted as visual success**:

- `brood-after-repair-20260904`: nonzero G but green output; the diagnostic also paused before queued albedo mip maintenance.
- `brood-after-final-20260904`: corrected maintenance and link curves, but CPU albedo was still green because hydrology erased it. Its no-error result was not a visual pass. This failure caused the hydrology fix and explicit purple-pixel assertions.

## Gates and ownership

Passed: bundle of 112 classic scripts; pack-www with asset resolution; `test-brood-foundation-routing`, `test-brood-foundation-links` (13), `test-brood-organic-surface-precedence` (5), `test-brood-relight-preservation` (14), `test-foundation-hydrology-boundary` (6), `test-brood-delivery-reset`, and the existing Brood crowd contract.

- Root: `src/game/sim.js` nest routing; `src/main.js` dirty attract reset; `src/engine/gl.js` relight preservation; pack/OTA lists; capture integration and this ledger.
- Brood lane: `src/engine/gl.js` crop, curve, clip and neutral-leveling repair; connective-territory and relight tests.
- GUI/render lane: `src/engine/mesh.js`, `src/ui/render3d.js`, `src/engine/terrain.js`; surface-precedence and hydrology-boundary tests.
- Engine lane: routing and delivery/reset tests.

All lanes shared the canonical checkout with non-overlapping file/function ownership. No external agents remain writing this slice.

Not claimed: live OTA delivery, physical-device acceptance, context-loss acceptance for this particular colony fixture, high-unit performance improvement, or completion of the full 18-stage plan. The existing multiplayer reconnect and full-recovery delivery gates remain open; see [batch handoff](BUILDING_AND_DELIVERY_BATCH_2026-09-04.md).
