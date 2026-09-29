# MASSFRONT whole-game GUI overhaul ledger

Status: active local-source work; **not** a release or a claim that the GUI is complete. This ledger covers the entire player path, not only Strike Bay or multiplayer. UGA Command expands the same galaxy, systems, planets, regions, and maps used by Classic; it is the persistent exploration/command layer, while Classic is another route into those shared battle spaces.

## Product rule

Make the next useful action visually obvious at phone size. Keep the battlefield or relevant world/object/art in view, with short primary labels and detail on demand. Preserve real capabilities, costs, warnings, accessible names, online/offline state, and RTS command meanings. A geometry pass or clean console does not constitute visual acceptance.

Use the established MASSFRONT navy/graphite, gold action, cyan telemetry, faction/anime character identity, authored environments, and live models. Do not spread the grey `mf-ui-v3` boxed plates simply to increase image coverage. Open rails/brackets and purpose-made backings should support content, not become the content. Real game art should have one contextual host per view; avoid repeating the same image as both wallpaper and card. No new release/version/channel work is implied.

## Surface coverage and current gate

`Source` means inspected; `Packed` means a source-matched real-game screenshot/interaction exists. `Accept` requires a fresh visual and task-flow review after the change, not just an older capture.

| Player surface | Current evidence / live issue | Next acceptance |
| --- | --- | --- |
| Boot, launcher, account, offline/update, intro/title | The current packed front at `tmp/send-all-2026-09-26/packed-front-final/` boots on hardware GPU with no page/console errors and an inspected 412×915 screenshot. Hero art and the short brief replace the clipped changelog; full notes are optional. This is one ready/front state, not the cold/warm/offline/update matrix. | Real cold, warm, update, offline, and recovery paths; no startup-layer overlap or false-ready capture; 320/360 and enlarged text. |
| War Room and Classic galaxy → system → planet → region → deployment | The fresh packed 412×900/915×412 route at `tmp/classic-mobile-flow-2026-09-27T06-45-37.060Z-1388020/report.json` passes all five stages on hardware GPU. A visual false-green exposed reward/weather overlap, now repaired with a sibling-collision assertion. The full Clear Skies explanation remains above the short-landscape dock. The card is still text-dense and 100% text only. | Same shared world/map choice is obvious; one primary action, readable map/force choice, short-landscape reflow at 125–200% text, 44px targets. |
| UGA galaxy, helm, orbit, survey, probes, return | Prior 131-shot crawl is stale for current UGA source; current mission-return captures cover part of the flow. | Fresh narrow/landscape path through real scenes, readable drawers, safe-area and navigation continuity. |
| UGA command home and 11 districts, build/research, ship/progress/services/inventory/social | The newer packed 320/412/915 room-state run at `tmp/uga-room-visual-state-packed-2026-09-27T04-17-18.790Z/report.json` passes source/pack parity, hardware GPU, streaming/ready/failure, and Forward/Upper/Lower switching. A separate authored hull overlay supplies the bow and deck-sized rear shell, with the grey inspection bay hidden; the 44-case packed all-room run at `tmp/uga-authored-sections/shared-2026-09-27T04-19-49-611Z/report.json` passes room focus and real mesh taps at four viewports. Portrait overview remains thin/pale, small rooms still feel box-like, and the inspector remains dense. | Task-first cards, truthful state names, accessible next action, reference-level connected ship art, no label clipping at 320/360/412 and text scaling. |
| Strike Bay, commander/faction/loadout, map/mission deployment | Current packed `01-deployment.png` shows oversized stage above cramped planner. | On the first phone fold: map, commander/faction, readiness/blocker, and deploy action; secondary detail remains reachable. |
| Live RTS HUD, selection/build/ability/order controls, notifications | The focused packed 412×900 six-state run now passes 234/234 checks; Build/Production sheets expose more battlefield, Event Feed clears the minimap, typography and loading textures are repaired. Mixed-stance selection/action passes a separate 412×900 and 915×412 real-match test. This is not a full HUD matrix or game-loop sign-off. | Extend to 320/360, short landscape and text-scale stress; verify catalogue/queue/feed scrolling and full order/ability/weapon feedback, then physical touch. |
| Loading, tutorials, pause, debrief, failure/recovery | Offline Classic defeat now offers Restart Battle instead of a dead Continue; UGA setback retry replans a fresh operation. Focused source tests pass; a packed real-defeat interaction and the debrief/tutorial text pass remain open. | Each transition gives truthful progress/next action; short, staged teaching; result/rewards visible without a scroll trap. |
| Operations, Development, Armory/gear/equipment, Contracts, Career/Profile/Inbox | Current packed 412×915 menu-art capture measures 883/918/866 chars in Operations/Development/Arsenal; panels are image-backed but still text-first. | Selected object, state and consequence first; detail on demand; gear sockets and owned/locked states visual, not a checklist wall. |
| Social/multiplayer, disconnected/invites/chat | Social packed capture exists but is sparse/boxed; functionality must be checked separately from appearance. | Clear online/offline state, real available actions, keyboard-safe chat, no dead-end CTA or fake capability. |
| Settings/help/accessibility, monetized proximity map billboards | Settings packed capture is dense; ad-board gameplay/safety and revenue integration are separate from GUI polish. | Grouped controls, visible current values, readable help, safe-area/scale; billboards never obstruct play or imply revenue without a live delivery/payment path. |
| Art and performance across all surfaces | `mf-ui-v3` has 36 separate assets but grey boxed treatments conflict with the requested established look. Existing portraits include anime/realism mismatch. | Approved coherent art language, real alpha, no baked dynamic text, source/packed parity, measured GPU/memory cost. |

## Continuous work sequence

1. Audit all routes and states in parallel, mark source versus packed evidence honestly, and keep disjoint file ownership.
2. Repair the first-screen tasks and visual hierarchy across Classic, UGA, and battle in parallel. Do not stop at one screen and call it a game-wide pass.
3. Apply one shared art/layout language to launcher, meta screens, social, settings, onboarding, and results without replacing meaningful functionality with decoration.
4. Verify the full launch → choose world/map → deploy → command → debrief → progression/return loop in both Classic and UGA, plus disconnected/social and ocean/gas variants.
5. Capture 344×760, 412×900, 915×412, 1024×768, 1920×1080 and 100/125/150/200% text-scale states. Check real touch targets, overflow, image loads, safe areas, rotation, keyboard, reduced motion, performance, and screenshots. Physical Safari/PWA acceptance remains separate.

## Evidence boundary

The older menu-art census at `tmp/menu-art/packed/report.json` is still invalid for its `main-menu` row: the returning startup cover was in front. The focused packed `verify-menu-chrome.mjs` run now passes at 412/360 portrait, 320 portrait with 200% text, and 915 short landscape with 150% text; its inspected screenshots are under `tmp/menu-chrome/`. That closes the entry/touch/title-clipping check, not the whole-game art audit. Existing captures are local evidence, not hosted or physical-device acceptance.

The September 27 UTC Classic and UGA reports above are focused local packed-browser evidence, not a full-game acceptance. The Classic map screenshot was inspected after the CSS selector fix. The newer UGA cutaway screenshots show a connected silhouette and unobscured primary controls, but remain short of the richer reference art and mobile-first whole-game GUI target. No publish/version/channel operation is included in this GUI wave.

## September 27 cross-surface mobile checkpoint

- Classic region selection at 915×412 now gives the selected battlefield card the right-hand lane while retaining neighboring card peeks. The 44px Standard summary no longer wastes 15px above the region card. In the final packed `tmp/classic-mobile-flow-2026-09-27T04-40-17.294Z-1358900/report.json`, the Clear Skies explanation ends at y=298.4, above the fixed dock; alternate-map selection updates the dossier, all five stages pass at 412×900 and 915×412, and the hardware-GPU screenshot was inspected. This does not clear text scaling or every Classic map.
- Command Core's embedded next-objective card is compact, uses contextual authored art rather than the grey player-info plate, and puts its existing action before optional journey/brief details. The duplicate room heading is removed on compact views; the full Galactic hub and deeper room systems remain. The packed `tmp/uga-room-visual-state-packed-2026-09-27T04-47-23.592Z/report.json` passes real orbit-to-Ship ready/streaming/failure states at 320×700, 412×900 and 915×412, source/package parity, hardware WebGL and the new >=44px action-above-dock gate. All three ready screenshots were inspected. This does not finish every district or the ship's portrait art treatment.
- A mixed eligible RTS platoon no longer calls itself a single chassis stance just because current mode IDs match. `src/ui/hud.js` reports Mixed and supplies an action/current-state accessibility label without changing issued orders or HUD geometry. Bundle, focused HUD contracts and a before/after actual-function probe pass. A packed mixed-platoon tap has **not** been captured; the live packed HUD run reached battle with a Commander selection, not that exact mixed case.
- `tools/verify-cinematic-hud.mjs` now follows offline entry through UGA to Classic. Its packed six-state hardware run at `.tmp/cinematic-hud/gui-stage-after-2026-09-27/report.json` was the **pre-fix FAIL (221/234 checks)**, not a GUI sign-off. The 13 failures were six typography-token checks, three center-playfield-clearance checks, two HUD-occupancy checks, and two network/error checks for `soil-albedo.webp` and `aelos-basecolor-v1.png` requests wrongly resolved under `/src/styles/assets/`. The inspected Build and Event Feed captures showed oversized battlefield panels. The diagnosed fix and fresh packed result are recorded below; physical Safari/PWA remains open.

## September 27 packed phone-HUD follow-up

- The earlier 221/234 HUD report above remains the pre-fix baseline. The final source-matched packed run at `.tmp/cinematic-hud/gui-stage-final-source-2026-09-27/report.json` follows the real offline War Table → deployed Standard battle on RTX 4060 D3D11 and passes **234/234** checks across resting, unit-group palette, abilities, Build, Production and Event Feed at 412×900 with 100% text. It records zero page/runtime errors, HTTP failures or request failures. Final Build, Production and Event Feed PNGs were inspected, not inferred from DOM geometry.
- At this phone size, Build/Production HUD occupancy is 0.421 (pre-fix 0.545) and centre-playfield coverage is 0.238 (pre-fix 0.571); the compact panels retain the first actionable cards, with the remaining catalogue/queue content in their scroll area. Event Feed centre coverage is 0.167 (pre-fix 0.518), with a visible gutter from the minimap. Resource/feed text meets the verifier's tokens. The two former texture 404s were CSS custom-property relative-URL resolution, not missing assets: the whitelisted paths are now anchored to the app document while preserving OTA data-URI mapping.
- `.tmp/hud-mixed-stance/final-2026-09-27/report.json` passes **13/13** checks after a real Standard deployment at 412×900 and 915×412. The actual Army → Platoons → cycle button selects a mixed Striker/Thumper group and issues Overdrive/Siege respectively; the rail now shows a cycle symbol and Mixed rather than an ambiguous double question mark. Four screenshots were inspected. The two chassis are a disclosed live `spawnUnit` fixture after deployment, so this proves HUD/selection/order integration, **not** Tech-2 research or production progression.
- This is a bounded local GUI stage, not whole-game acceptance. The 320/360 widths, 125–200% text, wider HUD matrix, catalogue/queue/feed end-to-end scroll actions, full Classic/UGA battle-return loop and physical Android/Safari/PWA checks remain open. No release or channel activation occurred.

## NEXUS-VII section-map direction

The user's two attached ship references show rooms nested inside one visible hull: a side cutaway for room context and a whole-ship plan for orientation. The original project concept at `modules/space_exploration/assets/source/concepts/nexus-vii-v1/nexus-vii-master-concept-v1.png` already expresses the same exterior/plan/section relationship. These are design inputs, not runtime texture replacements.

The 11 authored room positions support three spatial zones without changing domain deck IDs: A is **Forward / Command & Missions**, B is **Upper / Systems & Research**, and C is **Lower / Crew & Bay**. The mobile rail uses these location words so players know where they are aboard NEXUS-VII. The delivered v5 `NEXUS_VII_LONGITUDINAL_CUTAWAY` remains intact. Its editable main Blender file has pending v6 Strike Bay changes, so the local hull stage uses a separate Blender-authored, geometry-only overlay rather than silently promoting that unrelated content. The overlay adds a Command bow and rear shell, near-side silhouette, frames, and lower-deck rear panels; the rectangular inspection bay is hidden in authored ship mode. Focus keeps only local structure while overview restores the whole hull. The intact exterior shell still cannot be reused because it would cover the rooms.

Matched 320/412 portrait and 915 landscape packed captures now show a continuous hull without the generic grey bay or primary-control overlap; the 44-case all-room run passes actual mesh taps. This closes the bounded connected-cutaway functional stage, **not** the final art acceptance. The ship remains visually small/pale in portrait overview compared with the reference, and the v5 rooms themselves still need an art-consistency and density pass before a complete ship GUI sign-off.

## Next design phase, after GUI acceptance

Design SX interior maps, sky-map systems, and ocean-world map systems (including water/gas-world unit and structure roles for all factions and Brood) as a separate gameplay/world-content phase. The user's older Google Drive models are potential later inputs, not part of this GUI pass. Do not let future world design mask today's navigation, readability, or broken-loop work.

## September 27 send-all source versus release boundary

The current local packed preview includes the launcher and Classic Region fixes
above, but the public channels remain on the earlier 1.33.97 bytes. The full
game GUI is **not** accepted: current HUD evidence predates the latest CSS,
and the narrower/text-scaled launcher, map, ship, Strike Bay, social, inventory,
settings, results and multiplayer states are still open. See
`docs/CODEX_HANDOFF.md` for exact source/branch/release state, test inventory,
Stormpeak policy conflict, credential rotation warning and Freebuff/Grok next
actions. Do not turn this focused visual cleanup into a claim that the entire
mobile-first overhaul or five-channel game update shipped.
