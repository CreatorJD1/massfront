# MASSFRONT Claude continuation handoff

Prepared 2026-09-08 PDT. The closing snapshot was refreshed after document validation.

This is the current continuation document for the integrated UGA / space-exploration overhaul. It is intentionally self-contained. Read `AGENTS.md` first, then this file, then `docs/UGA_PLAYER_FLOW.md`. Do not infer that the game or release is complete merely because this handoff is complete.

## 1. Scope and authority

The immediate task is to continue and verify the existing dirty Local checkout. Preserve all shared work. Do not reset, clean, move to a new worktree, create a replacement repository, or discard unfamiliar changes.

The last user request in this work session was to create this handoff. It superseded the earlier request to publish urgently. **No release, upload, pointer activation, Cloudflare mutation, or APK publication is authorized by this handoff.** Obtain fresh owner authorization after current source and packed acceptance pass.

Apple remains supported through the Safari-installed PWA. Native iOS, Xcode, TestFlight, IPA, and App Store delivery are retired and are not release gates.

## 2. Exact repository state

- Canonical user-facing Local path: `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`
- Physical Git root to which that junction resolves: `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`
- Branch: `cursor/strip-mass-node-bloom`
- HEAD: `0975bf6edc5a39d3b2ec76a40a6155072c726381`
- `.git` is a directory, not a linked-worktree file.
- Latest continuity snapshot: `tmp/continuity/engineering-state.json` and `tmp/continuity/engineering-state.md`
- Dirty entries at that snapshot: 546, including this new handoff file
- Evidence records indexed by that snapshot: 80
- Writer guard at handoff preparation: PASS; no verification freeze was present.

Dirty ownership is shared. Nearly all tracked and untracked changes predate this document and include UGA integration, RTS input/HUD repairs, tests, release tooling, documentation, and a large active model/art repair set. Treat them as user/team work. Do not use `git reset --hard`, `git checkout --`, `git clean`, or broad deletion. This handoff task itself only adds `docs/CLAUDE_HANDOFF.md` and updates the pointer near the top of `docs/HANDOFF.md`.

The three named parallel reviews from the final session are complete:

- `base_menu_visual_fix`: changed the base menu progression layout and its browser geometry verifier.
- `critical_integration_review`: read-only source review; no extra P0/P1 source defect found, but it required the runtime gates listed below.
- `release_preflight`: read-only remote/local release inspection; no release mutation.

Re-read `git status --short` and the guard before every new mutation because this was a high-churn shared checkout.

## 3. Product contract: what UGA is

UGA Command is the persistent strategic home for the player and the bridge into the real RTS. It is not a standalone minigame, a separate game mode, or a second launcher. The intended player loop is:

`updater/title/identity -> UGA home -> depart/orient -> scan -> result and next step -> planet/control region/map -> eligible commander and loadout -> real RTS battle -> one debrief/reward -> return to UGA`

The old dashboard/menu mockups were created before the space-sim progression direction. They are **not** instructions to replace the UGA home with a large mode-selection dashboard. They still apply as a compact **Basic Access** surface for Standard, Training, Campaign, and War Table/Classic. Those doors must remain easy to find and return from without competing with the persistent UGA loop.

The synchronized launch/update/loading path must converge on a usable persistent UGA home with obvious recovery through Settings, Back, Home, and Exit. No UGA action or tutorial action may appear dead for minutes while a hidden load runs.

The space camera should begin wide and cinematic. The closest permitted zoom should still be medium rather than an extreme planet close-up. A visible recenter action must restore orientation.

Scanning is the only Mass Effect 2-specific inspiration. A scan may reveal resources, a mission/control region, or both, and must show a concise result with an actionable next step. Planet selection must lead through authored areas/control regions and a player-visible battlefield choice into the real RTS.

Other inspiration boundaries:

- Helldivers 2: readable regions, allied/enemy pressure, operation selection, difficulty, and deploy preparation.
- XCOM 2: a persistent headquarters and progression that make tactical missions matter.
- StarCraft 2: campaign clarity and upgrades in service of the RTS.
- EVE and other space simulations: spatial orientation and progressive discovery only.

Reject EVE-style economy sprawl, excessive windows, travel downtime, duplicate currencies, or a second progression game. The space segment must create meaningful RTS decisions without turning MASSFRONT into bloatware.

Offline progression must remain first-class. Connected friends/co-op/social surfaces must be truthful: do not imply a live session or matchmaking adapter that does not exist.

## 4. UI and art direction

Use the actual MASSFRONT title art, never an invented text wordmark:

- `assets/brand/massfront-title-command-conquer-overwhelm-v1.png`
- 1280 x 681, 710,592 bytes
- SHA-256 `E11A316658C34D30A9B4ACED6F2BDFB7AE7A47F967F93389ACB55D8DB67FB279`

The supplied GUI pack is integrated under:

- `modules/space_exploration/assets/runtime/ui/gui-material-v1/manifest.json`
- `modules/space_exploration/assets/runtime/ui/gui-material-v1/1x/`
- `modules/space_exploration/assets/runtime/ui/gui-material-v1/2x/`

Use crisp neutral border/frame pieces for primary actions, tabs, entries, resources, context panels, production, and feeds. Do not use selection-state frames as generic decoration. Selection art is reserved for a real selected state. Prefer the 2x asset where device density needs it.

The target is a modern, streamlined mobile AAA interface consistent with the base War Table/RTS HUD: shallow navigation, large reachable actions, concise text, restrained ornament, and stable safe-area behavior. Reject overlapping panels, clipped labels, duplicate navigation, decorative bars that look selectable, or verbose explanations occupying play space.

The RTS interaction contract remains:

- One tap on a commander selects it. Information opens only from an explicit info affordance.
- Ability buttons arm/fire their authoritative ability; they must not leak into a battlefield MOVE command.
- Rally and move lines must persist long enough to read and must not jump or race across the screen.
- The tactical RTS remains the payoff during the UGA loop, not a hidden or degraded submode.

## 5. Implemented source state

These are source-observed changes in the current checkout. They are not a substitute for the remaining browser gates.

### Launch, commissioning, and UGA home

- `src/launcher.js` routes the main UGA entry to `campaign_hub`.
- `src/main.js` contains the START/UGA route and duplicate-tap protection.
- `src/career-faction-gate.js` now arms and persists commissioning for a genuinely fresh `campaign_hub` or `system` entry. The hub stays usable; failure to save blocks crossing documents; hiring/training can converge through a secured continuation ticket.
- `modules/space_exploration/src/space_experience.js` treats the campaign hub as independently ready. Exterior art is required for explicit `system`/ship entry, but a delayed optional exterior failure must not fatal a usable hub.
- `modules/space_exploration/src/ui/uga_command.js` and `.css` make the UGA home primary: Depart first, compact Basic Access for Standard/Training/Campaign/War Table, and mobile Play/Ship/Progress/Social/More navigation. Duplicate room/deck/X chrome and ornate inactive framing were removed or reduced.
- Legacy `classic` intent is normalized back to the hub/War Table route rather than becoming a competing shell.

### Camera, scan, and exploration decisions

- `modules/space_exploration/index.html` exposes a recenter control and visible survey-result card.
- `modules/space_exploration/src/core/three_space_engine.js` uses the wider default camera `{yaw: 0.55, pitch: 0.42, dist: 1.55}`, relative heading, and bounded wheel/pinch zoom of 0.55 to 2.5.
- `modules/space_exploration/src/systems/planetary_survey.js` frames planets farther out.
- `modules/space_exploration/src/space_experience.js` presents scan-result datasets, rewards, next-action CTA state, and handlers.
- `modules/space_exploration/src/domain/progression.js` derives a deterministic next action.

### Region, battlefield, deployment, and RTS return

- `modules/space_exploration/src/domain/catalog.js` is catalog version 8 and contains the UGA ground-area catalog: nine public areas with compact, standard, and large battlefield choices.
- `modules/space_exploration/src/ui/uga_command.js` requires an explicit player battlefield selection. It starts blank and keeps deploy disabled until the player chooses a valid map.
- `modules/space_exploration/src/domain/ground_operation.js` validates the map and canonical location.
- `modules/space_exploration/src/host/massfront_solo_host.js` validates host requests strictly and recovers legacy pending operations.
- `src/galactic-operations.js` maps public UGA battlefield choices to internal RTS templates without silently defaulting to `_medium`. It rewrites the base load-screen location with the public player location after `mfLoadScreenFill`, preventing Veyra/Karak from being shown as unrelated legacy planet names.
- `modules/space_exploration/src/space_experience.js` passes `mapId` into deployment.
- `modules/space_exploration/src/domain/ground_result.js` preserves legacy V2 exact hashes and adds the V3 pressure/receipt behavior used for idempotent results.

### RTS HUD, input, and effects

- `src/ui/hotslots.js` uses compact visible labels with full accessible names. Its activation replay includes both `pointerdown` and `pointerup`, allowing ability owners inside the scroller to arm before the next battlefield tap.
- `src/styles/ui.css` contains the base-menu progression containment/grid repair, the actual-logo/tactical-loading presentation, and neutral GUI-pack framing.
- `src/ui/orderfx.js` uses screen-speed-normalized order/rally path effects.
- Current sources/tests contain commander single-tap selection without automatic information opening. Runtime reacceptance is still required.

### Loading and branding

- UGA and tactical loaders use the owner MASSFRONT logo with an accessible fallback.
- The current single-file bundle is `dist/massfront.html`, 28,832,221 bytes, SHA-256 `C415E7AB35DF805C0BA536C54346FADD08FFAB68488EA4BEDBE7A09C64F5CE11`.
- The latest recorded clean `node tools/bundle.mjs` pass parsed 113 sources and produced about 27.49 MiB.

## 6. Current source verification that passed

The following current source/static checks passed in the coordinated final session:

```powershell
node tools\bundle.mjs
node tools\test-career-faction-gate.mjs
node tools\test-launch-sequence.mjs
node tools\test-start-galactic-entry.mjs
node tools\test-launcher-gateway.mjs
node tools\test-galactic-campaign-product-model.mjs
node tools\test-stage11-tutorial-contract.mjs
node modules\space_exploration\tests\ground-location-progression.test.mjs
node modules\space_exploration\tests\domain.test.mjs
node modules\space_exploration\tests\ground-operation-v3.test.mjs
node modules\space_exploration\tools\tests\exploration-host-v1.test.mjs
node modules\space_exploration\tools\tests\massfront-solo-host.test.mjs
node modules\space_exploration\tools\tests\space-experience-host-seam.test.mjs
node tools\test-galactic-operation-adapter.mjs
node tools\test-stage9-galactic-bridge.mjs
node tools\test-galactic-wartable-routing.mjs
node tools\test-exploration-flow-contract.mjs
node tools\test-hotslot-lifecycle-contract.mjs
node tools\test-commander-signatures.mjs
node tools\test-stage7-progression-presenters.mjs
node tools\test-hud-enlarged-text-contract.mjs
node tools\test-stage7-input-cancel.mjs
node tools\test-nav-repath-contract.mjs
node tools\test-menu-hud-isolation.mjs
node tools\test-stage7-economy-contracts.mjs
```

Notable current browser evidence:

- `.tmp/menu-hud-isolation/report.json`: PASS on hardware NVIDIA GeForce RTX 4060 / ANGLE D3D11.
- `.tmp/menu-hud-isolation/menu-hud-isolation-412x900-dpr3.png`: visually inspected; paired cards stay in the viewport, the real MASSFRONT logo is present, and controls are contained.

## 7. Failed, interrupted, stale, and limited evidence

Treat the distinctions in this section as release-critical.

### Newest interrupted gate: diagnose first

`tools/verify-launch-home-entry.mjs` was run with tag `source-final` and failed at line 115 while waiting up to 20 seconds for both `#mfBootCover` and `#bootCover` to disappear.

- Report: `.tmp/launch-home-entry/source-final/report.json`
- Hardware GPU: RTX 4060 / D3D11
- Source drift: false
- Verification freeze stable: true
- Screenshots: none were produced before the timeout

This is not yet classified as a product defect versus a harness timing/selector defect. Diagnose measured boot state and event progress. Do not merely raise the timeout without evidence.

### Stale packed runtime

`www/` does not match current source. At handoff, each of these packed copies differed from its source file:

- `src/career-faction-gate.js`
- `src/styles/ui.css`
- `src/ui/hotslots.js`
- `src/galactic-operations.js`
- `modules/space_exploration/src/space_experience.js`
- `modules/space_exploration/src/ui/uga_command.js`
- `modules/space_exploration/src/ui/uga_command.css`

Therefore no previous packed pass is current acceptance. Do not run packed acceptance until source is final and `node tools/pack-www.mjs` has been run deliberately.

### Historical evidence that remains useful but is not current acceptance

- `.tmp/boot-screen/v13380-coordinated-uga-tactical-final6/report.json`: four individual source/packed/reduced-motion/logo-fallback cases passed with six screenshots and no page/console errors, but the aggregate failed the UGA feedback-under-50ms assertion. It also predates later source changes, and packed content is now stale.
- `.tmp/first-contact-notices/source-20260908h/report.json`: historical source PASS with five portrait screenshots and valid notice geometry. No source-matched landscape center-notice capture was found. The reported landscape intersection repair and “third packed acceptance underway” were not confirmed as current evidence.
- `tmp/mission-return-mobile-v13380-source-campaign-hub-mission-return-20260908b/report.json`: historical source PASS covering real commissioning, deployment bridge, tactical package, commander selection/ability touch, debrief, reload, and replayed-return no-double-pay. It predates the current commissioning, explicit-map, location, and HUD changes.
- `tmp/mission-return-packed-mobile-v13380-packed-mission-touch-breach-final/report.json`: historical packed PASS; current `www/` is stale.
- `tmp/orderfx-route/uga-command-source-20260908a/report.json`: historical PASS with 150/1400/3000ms captures; source has since changed.
- `tmp/nav-next/uga-command-source-20260908a/report.json`: historical source PASS; source has since changed.
- `.tmp/uga-survey-scan/evidence.json`: old probe observed hub entry and locked/unlocked scan behavior but did not prove the final visible result card and CTA destination. The verifier has since been expanded.
- `tmp/space-bootstrap-fallback/report.json`: historical source PASS for import-blocked recovery, Classic/War Room recovery, and retry. Rerun against current source.
- `.tmp/rts-touch-actions/hud-mobile-cleanup-20260908/evidence.json`: **rejected**, not a pass. Concurrent writes changed dist/UGA/manifest files under the verifier, `sourceStable` was false, and the run timed out on an obsolete Standard selector.

No current physical Android-device or physical Safari/PWA acceptance exists. Describe these gates as **untested**, not as repeatedly broken.

Two older browser scripts still encode the rejected pre-redesign assumption that a fresh player lands directly in `system`:

- `tools/test-launch-sequence-browser.mjs` near line 62
- `tools/capture-stage11-space-ux.mjs` near line 695

Do not use them unchanged as proof. Update them to the hub-first contract or use the current hub-first verifiers.

## 8. Priority-ordered continuation

Do not start with cosmetic polish. Work in this order:

1. Read `AGENTS.md`, this handoff, and `docs/UGA_PLAYER_FLOW.md` completely.
2. Confirm the canonical root, `.git` directory, branch/head, dirty state, and writer guard. Preserve all WIP.
3. Diagnose the line-115 `verify-launch-home-entry` timeout. Record whether the covers are present, visible, waiting on content, or stale; capture the earliest failing frame. Fix the product or the harness according to measured evidence.
4. Rerun current source launch/home acceptance in portrait and landscape and visually inspect every screenshot.
5. Run a fresh-profile commissioning path: launcher -> UGA hub -> Hire Commander -> faction selection -> commissioned UGA continuation. Include failed-save/re-entry safety if the harness supports it.
6. Run the expanded survey probe and actually click its result CTA. Prove a resource, region/mission, or combined result leads to the expected next step.
7. Prove explicit area/map selection -> eligible commander/loadout -> deployment -> live RTS using `tools/test-space-module.mjs` and `tools/test-exploration-mission-return.mjs` as appropriate.
8. Rerun mobile commander selection, info separation, ability arm/fire, and timed rally/order-line captures. Visually inspect the captures.
9. Rerun First Contact notices in portrait and landscape plus Settings/Back/Home/Exit, boot/module-failure recovery, Training skip/completion, Standard, Campaign, and War Table/Classic return-to-UGA routes.
10. Only after source is stable, run `node tools/pack-www.mjs`, prove key source/packed hashes match, and repeat the full packed session.
11. Stop before any release mutation. Present the final evidence and obtain owner authorization for a coordinated release.

Immediate rerun examples, using unique evidence tags:

```powershell
node tools\evidence-foundation\workspace-guard.mjs check-write
$env:MF_LAUNCH_HOME_TAG='source-after-boot-diagnosis'; node tools\verify-launch-home-entry.mjs
node tools\probe-uga-survey-scan.mjs
$env:MF_MISSION_MOBILE='1'; $env:MF_MISSION_TAG='source-current'; node tools\test-exploration-mission-return.mjs
$env:MF_RTS_TOUCH_SOURCE='1'; node tools\verify-rts-touch-actions.mjs source-current
$env:MF_ORDERFX_TAG='uga-current'; node tools\verify-orderfx-route-persistence.mjs
node tools\verify-first-contact-notices.mjs source-current
node tools\test-space-bootstrap-fallback-browser.mjs
```

Use `tools/pw-browser.mjs` only. Assert hardware GPU and fail on SwiftShader/software rendering. Hold the verification freeze for source-matched acceptance, allow only evidence paths, and release it with stability asserted. Never change source while a verifier owns the freeze.

If a verifier leaves a token after a crash, do not delete it manually:

```powershell
node tools\evidence-foundation\workspace-guard.mjs clear-stale
```

That command removes only a readable same-host lease whose recorded PID is dead.

### Acceptance stopping criteria

Stop and do not pack/publish when any of these occurs:

- page error, uncaught rejection, fatal module state, or hardware-GPU failure;
- source drift or changed verification-freeze identity;
- launch or tutorial action without immediate feedback;
- stale packed/runtime hash;
- clipped, overlapping, off-screen, duplicated, or unreadable mobile UI;
- missing Settings/Back/Home/Exit recovery;
- Basic Access route that cannot return to UGA;
- automatic commander info opening, ability-to-MOVE leakage, or unreadable rally line;
- implicit/default battlefield substitution;
- battle reward applied more than once or debrief that does not return to UGA;
- physical-device claim without a physical-device run.

## 9. Release state and future release prerequisites

This section records the latest read-only preflight. Re-verify remote state immediately before any future mutation because it can drift.

Current local version fields are 1.33.80, including `boot.js`, `src/updater.js`, `sw.js`, `package.json`, `package-lock.json`, `index.html`, Android `versionCode 13380` / `versionName 1.33.80`, and `update.json`. `assets/data/exploration-pack-remote.json` still names `1.33.80/content-r1`.

At preflight, live HF updater, Cloudflare Worker updater, and HF Space all served 1.33.80 even though `docs/RELEASE_STATUS.md` still said 1.33.79. Do not “correct” that status document until the next actual coordinated release succeeds.

Verified current 1.33.80 manifest identity at preflight:

- bytes: 107,208
- SHA-256: `f2b8bbf20f790f8df8375f074b2d28cc5c581fe5b52a3ac93d9f25a2bd1a6aef`
- manifest root: `ff4eb65426ed5718d17d49c95d51f57220fc7caaafd5d193ad02d150f1ce7356`
- payload root: `d3f6fd988bac616827b584f726a59c54e372d32851d1104e3842e21e3f0302b8`
- runtime root: `7274dc467b8d3a580e304c8de198a0bdc5aa1e269cb45e4f7a42febd64b291aa`
- files: 115
- HF dataset head: `f026ac5ef5fc2a949ed87164bb1e973872edb0a0`
- HF Space head: `6fec1300e66800a004e771998a137a8e495082ec`, state RUNNING

`1.33.81/content-r1` already exists remotely and is stale against 16 changed module files. Never overwrite, delete, activate, or reuse it. The next coordinated candidate namespace is:

- exploration content: `1.33.81/content-r2`
- HF player artifacts: `v1.33.81-candidate-r2`
- APK: `MASSFRONT-v1.33.81-candidate-r2-mobile-install.apk`

At preflight, `1.33.81/content-r2`, the 1.33.81 player artifact index, OTA probe, candidate r1/r2 artifact indexes/APKs, and `update-v1.33.81.json` were absent at authoritative/public probes. Re-check rather than assuming they remain absent.

Preflight commands that passed without mutation:

```powershell
pwsh -NoProfile -File tools\test-publish-hf-release-safety.ps1
node tools\verify-release-channels.mjs --version 1.33.80 --timeout 15000
pwsh -NoProfile -File tools\publish-hf-release.ps1 -Version 1.33.81 -Category overhaul -ArtifactRevision r2 -Notes 'Preflight only; no publication.' -DryRun
```

HF CLI was authenticated as `CREATORJD` through cached credentials and exists at `C:\Users\Jason\AppData\Roaming\Python\Python313\Scripts\hf.exe`. Do not copy credentials into source, logs, or this document. Cloudflare token environment variables were absent; no local/global Wrangler was installed; saved Wrangler OAuth was unconfirmed. Before a future authorized mutation, check only identity:

```powershell
Push-Location cloudflare\massfront-update
npx --yes wrangler@3 whoami
Pop-Location
```

### Future safe release order, after explicit authorization

1. Complete current source and hardware-Playwright acceptance.
2. Build/upload immutable `1.33.81/content-r2` and bind its exact `delivery.json` to `assets/data/exploration-pack-remote.json`.
3. Bundle and pack.
4. Prepare a full 1.33.81 overhaul candidate r2 with final player-facing `APP_NOTES`. Do not use `-PatchFrom`.
5. Verify packed browser and Android APK; run the mandatory shrink/re-sign path and signature checks.
6. Upload immutable HF artifacts.
7. Prepare and verify the Cloudflare mirror without activating it.
8. Upload the exact `www/` to HF Space and verify the hosted player.
9. Immediately reread expected-prior HF and Worker version/root values.
10. Activate Worker and HF update pointers last, using the freshly observed expected-prior roots.
11. Run `node tools\verify-release-channels.mjs --version 1.33.81 --timeout 15000`.
12. Update release documentation only after all channels agree.

The relevant preparation commands are:

```powershell
node modules\space_exploration\tools\build-runtime-content-manifest.mjs
node tools\build-exploration-delivery.mjs --version 1.33.81 --base https://massfront-update.jasondixon1994.workers.dev/f/1.33.81/content-r2/ --output releases/exploration-delivery-v1.33.81-r2
node tools\mirror-exploration-content-to-cloudflare.mjs --version 1.33.81 --revision r2 --delivery releases/exploration-delivery-v1.33.81-r2 --out .tmp/exploration-delivery/1.33.81-r2-local.json --check-local
node tools\mirror-exploration-content-to-cloudflare.mjs --version 1.33.81 --revision r2 --delivery releases/exploration-delivery-v1.33.81-r2 --out .tmp/exploration-delivery/1.33.81-r2-upload.json --apply
pwsh -NoProfile -File tools\publish-hf-release.ps1 -Version 1.33.81 -Category overhaul -ArtifactRevision r2 -Notes '<final release notes>' -PrepareOnly
```

Do not execute the `--apply` or publisher commands without renewed owner authorization. Upload immutable artifacts before moving mutable pointers, and never hard-code a previously observed expected-prior root after time has passed.

## 10. Handoff completion versus game completion

This handoff is complete when Claude can reproduce the repository identity, understand the corrected UGA/Basic Access product model, distinguish current from stale evidence, and continue at the launch/home failure without discarding shared work.

The game/update is **not complete**. Current packed content is stale, the newest launch/home browser gate failed before screenshots, the redesigned scan/region/map/deploy/RTS/return loop has not passed a single current source-matched end-to-end acceptance, recovery routes need a current rerun, physical Safari/PWA and Android-device gates are untested, and no 1.33.81 release is authorized or published.
