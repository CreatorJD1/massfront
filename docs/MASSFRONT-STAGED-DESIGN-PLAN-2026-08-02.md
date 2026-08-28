# MASSFRONT staged design and implementation plan

Date: 2026-08-02  
Baseline reviewed: v1.25.0 source and playable browser build  
Purpose: decide what should be improved, in what order, and which screens benefit from categories or tabs before adding more content.

## Executive decision

MASSFRONT already has a broader mechanical foundation than its menu presentation suggests: 31 unit definitions, 21 structures, four maps, three enemy doctrines, up to three independently configured AI commanders, eight selectable start zones, six formations, multi-waypoint patrols, four platoons, five defensive weapons, walls and gates, several victory conditions, optional infestation, and a Fortress/Tower Defence ruleset.

The next gains should come from making those systems legible and giving them authored progression. Adding more isolated units or buttons before that work would make the game feel larger but less coherent.

Recommended production order:

1. Finish information architecture and mobile interaction consistency.
2. Integrate the owned soundtrack and sound libraries as a deliberate adaptive mix.
3. Improve combat readability and command feedback.
4. Turn Fortress mode into a complete tower-defence loop.
5. Deepen faction-aware AI and combined-arms counters.
6. Build an authored ten-stage campaign that teaches and tests those systems.
7. Reconcile progression, store, research, and long-term rewards.
8. Complete performance, accessibility, update, and release QA.

## Research translated into rules

The plan uses these platform and game-UI constraints:

- Apple recommends a default 44×44 pt interactive target; Android recommends at least 48×48 dp. MASSFRONT should use a 48 px CSS minimum for primary touch targets so the same layout clears both baselines.
- Tabs are navigation between sibling destinations, not actions. Use them only when a screen contains multiple peer tasks, normally two to five.
- A phone root should expose roughly three to five primary destinations. Deeper or less frequent destinations belong in a hub, not as another equally weighted home button.
- The selected tab must be communicated by label, shape/border, and focus state—not color alone.
- Every overlay gets one predictable scroll region and one persistent safe-area Back footer. Android Back follows the same hierarchy as the visible Back control.
- Controls repeated across screens keep the same order and relative position.
- Audio alerts need a visual equivalent; color states need text, icon, or shape equivalents.
- Layouts must adapt to portrait, landscape, cutouts, gesture navigation, and large text without moving critical navigation below the safe area.

Primary references:

- Apple Human Interface Guidelines: [Designing for games](https://developer.apple.com/design/human-interface-guidelines/designing-for-games/), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), and [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls).
- Android Developers: [Accessible Views](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [Tabs](https://developer.android.com/develop/ui/compose/components/tabs), [Layout and navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns), and [Window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes).
- Xbox Accessibility Guidelines: [UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112), [Multisensory cues](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103), [Difficulty options](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/108), and [Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102).
- GDC Vault: [One Button to Rule Them All](https://www.gdcvault.com/play/1013375/One-Button-to-Rule-Them), a useful reference on reducing RTS interaction cost when moving from mouse/keyboard to constrained controls.

## UI information-architecture audit

| Area | Current condition | Decision | Reason |
| --- | --- | --- | --- |
| Home | PLAY plus Operations, Development, Armory, Orders, Profile, Dossier, Settings, and Account | Do not add tabs. In a later pass, consolidate into Play, Command, Loadout, and Profile hubs | Too many root destinations; another tab strip would hide the problem instead of defining hierarchy |
| Battle Setup | MAP / FORCES / RULES / ECONOMY | Keep | Four clear sibling tasks, with Show All for expert auditing |
| Settings | Four long sections plus appended system options | **Implemented:** AUDIO / BATTLE / DISPLAY / COMMAND / SYSTEM | Each category is a separate player intent; direct switching removes long scrolling |
| Operations | Threat, modifiers, weekly, and mastery stacked | **Implemented:** THREAT / MODIFIERS / WEEKLY / MASTERY | Four endgame tasks with different mental models |
| Daily Orders | Orders and boosters stacked | **Implemented:** ORDERS / BOOSTERS | Two sibling jobs; boosters no longer sit below a full order list |
| Profile | Career, account, file transfer, and identity stacked | **Implemented:** CAREER / ACCOUNT / TRANSFER / IDENTITY | Sign-in, save transfer, and commander identity are not one continuous form |
| Armory | Operations / Battlefield / Commander / Identity | Keep | Existing taxonomy already reduces search time |
| Development | Research / Crafting / Loadout, with branch navigation | Keep; clarify permanent unlock versus consumable module in copy | Correct two-level hierarchy; the problem is conceptual overlap with Armory, not missing tabs |
| Dossier | Dispatches / Factions | Keep | Two clear content collections |
| In-match command dock | Orders / Powers / Platoons / View | Keep, then reduce duplicated contextual actions | It is already the right mobile RTS pattern; density inside each deck needs tuning |
| Build and production menus | Role/category filters | Keep | A large roster needs role-first retrieval |
| Pause, result, confirmation, and unit card | Single-purpose | Never add tabs | One job should remain one surface |

### Category-tab implementation standard

The shared category component now has:

- a 48 px minimum target;
- icon plus text labels;
- one visible panel at a time;
- `tablist`, `tab`, and `tabpanel` semantics;
- visible active, focus, border, and underline states;
- Left/Right/Home/End traversal for keyboard or controller-style focus;
- remembered selection when a dynamic screen re-renders;
- scroll reset on a deliberate category change;
- no pointer-down navigation, avoiding touch-through into newly revealed controls.

### Next UI changes after the tab pass

1. Replace the nine-destination home grid with four hubs:
   - **PLAY:** Skirmish setup, weekly operation, resume.
   - **COMMAND:** Operations, Orders, Dossier.
   - **LOADOUT:** Armory, Development, equipped modules.
   - **PROFILE:** Career, account/transfer, accessibility and settings.
2. Keep PLAY as the visually dominant action and surface one contextual secondary card such as “Weekly contract” or “Unclaimed order.”
3. In battle, retain the four command decks but show only commands valid for the selection. Avoid showing Move twice in primary and secondary rows.
4. Add a compact/comfortable HUD density option. Compact is for tablets or expert players; comfortable is the phone default.
5. Keep the minimap, primary commands, pause, and resource strip in stable locations. Context panels may change; navigation anchors may not.
6. Add a UI-scale preview and safe-area diagnostic overlay to Settings for QA builds.

## Current game assessment

### What is already strong

- **Skirmish configuration:** eight start zones, one player plus up to three AI commanders, per-AI Easy/Normal/Hard settings, four maps, victory rules, economy pace, crate cadence, infestation toggle, and Fortress focus.
- **Mobile command vocabulary:** attack-move versus move, hold, six formations, four persistent platoons, formation holograms, and up to five patrol waypoints.
- **Counter framework:** visible unit roles, armour classes, weapon multipliers, crowd-control, anti-tank, anti-air, support, artillery, naval, and experimental roles.
- **Defence roster:** Sentinel, Skyguard, Bastion, Hellstorm, Arc Pylon, Aegis support, Uplink range network, barricades, gates, and upgrades.
- **AI pressure:** timed waves, under-strength muster checks, flanking around defended routes, target valuation, retreat logic, air-response building, and faction build biases.
- **Audio engine:** sample variation, per-event cooldowns, a 22-voice ceiling, per-sound caps, positional attenuation/panning, priority stealing, ducking, compression, two adaptive ambience beds, and eight proximity world loops.
- **Meta loop:** ranks, armory, research/crafting/loadout, orders, threat levels, modifiers, weekly operation, mastery, portable saves, and profiles.

### Highest-value gaps

1. **There is no authored learning and mastery ladder.** Four skirmish maps expose many systems at once; a player has no staged path from landing to multi-AI combined arms.
2. **Fortress mode is currently a modifier, not a complete tower-defence mode.** It buffs defences and accelerates waves, but lacks authored lanes, a wave forecast, preparation beats, tower targeting policy, and defence-specific rewards.
3. **The soundtrack is faction-aware but not situation-aware.** Full tracks are chosen for the menu or enemy faction; battle intensity only changes volume. Victory and defeat playlists exist in the manifest but are not selected by the current routing logic.
4. **Home and in-match HUD density still conceal quality.** The game exposes many valid systems simultaneously, making the player read before they can act.
5. **Progression surfaces compete for meaning.** Armory, Research, crafting modules, rank, orders, threat, and mastery are individually useful, but the relationship between permanent unlock, temporary power, skill achievement, and cosmetic identity needs one explicit funnel.
6. **AI composition adapts less than AI timing and routing.** Air and infestation reactions exist; armour, shield, artillery, fortification, and swarm composition reactions should become doctrine-level responses.
7. **Naval value is concentrated in Shattered Isles.** Harbor and two naval units have little relevance on the three land-dominant maps.

## Owned music and sound plan

### Inventory confirmed

The local soundtrack manifest contains 15 full tracks normalized around -16 LUFS:

| Context | Tracks |
| --- | ---: |
| Nova | 3 |
| Ascendancy | 3 |
| Syndicate | 3 |
| Horde | 3 |
| Menu | 1 |
| Victory | 1 |
| Defeat | 1 |

The supplied Drive libraries include broad SFX coverage: weapons, explosions, crashes, low-end sweeteners, metal, aircraft, automobiles, machinery and switches, sci-fi construction, designed sci-fi, creatures, communications, backgrounds, nature, rain/thunder, wind, transitions, vocals/walla, and cinematic trailer material.

The user-provided files are known to contain multiple distinct samples separated by pauses. They should be treated as source reels, not played as single game events.

### Music implementation

1. Keep full tracks streamed rather than decoded into memory.
2. Add explicit music states: MENU, DEPLOYMENT, CALM, PRESSURE, COMBAT, VICTORY, and DEFEAT.
3. Tag each owned track manually for faction, suitable states, intro length, ending behavior, intensity, density, and preferred repeat distance. The existing analyzer reports almost every track at maximum energy, so its energy field is not discriminating enough by itself.
4. Route the existing victory and defeat tracks when the result is known; they currently remain unused because the selector falls back to menu when `running` becomes false.
5. Choose the next faction track at a musical boundary based on current state. Do not seek rapidly between full tracks when combat intensity flickers.
6. Use 1.2–2.0 second crossfades, at least a two-track no-repeat window, and short score ducking under alarms, commander notifications, and major deployment impacts.
7. Keep the bundled ambient/tension/combat beds as the offline or missing-pack fallback.
8. Display the currently playing owned track and soundtrack-pack status in Settings > Audio.

### SFX reel ingestion

1. Copy source reels into a read-only staging area and preserve original filenames and ownership notes.
2. Detect silence candidates, starting with 250–450 ms below an adaptive noise-floor threshold.
3. Export each region with 10–25 ms edge fades; never hard-cut a waveform at a non-zero crossing.
4. Loudness-match by event class, not globally. A rifle, cannon, UI confirm, ambience loop, and alarm should not share the same peak or perceived loudness.
5. Classify every approved clip into an event taxonomy: UI, voice/radio, infantry weapon, cannon, artillery, missile, beam, energy, impact, explosion size, movement chassis, aircraft, naval, construction, production, structure loop, damage loop, alarm, creature, environment, and cinematic.
6. Reject obvious retro/arcade material and sources with audible low-bitrate warble, crushed transients, narrow-band hiss, or unsuitable sample quality.
7. Audition loop points, mono compatibility, phone-speaker intelligibility, and headphone fatigue before adding a clip to the live manifest.
8. Give frequent events multiple variants; reserve the best low-end sweeteners for commander cannon, TITAN, carrier deployment, superweapon, and major structure collapse.

### Mix rules

- Movement and machinery remain proximity loops with strict nearest-source limits.
- Repeated unit acknowledgements use a squad cooldown so 30 selected units do not speak 30 times.
- Rapid weapons aggregate into a perceptual volley instead of stacking every transient at full level.
- Critical-building alarms are locally positioned, globally rate-limited, and accompanied by a minimap pulse and on-screen warning.
- Ambient beds should be felt more than heard; the existing low-pass protection remains, with a user-facing Ambience volume control added separately from combat effects.
- Commander cannon gets a layered transient, mechanical body, low-frequency tail, distant report, and splash impact. Low bass must be supported by a midrange transient so it still reads on phone speakers.

## Production roadmap with stage gates

### Stage 0 — baseline and test harness

Goal: make improvement measurable.

Implementation:

- Record portrait and landscape captures for launch, setup, settings, profile transfer, live battle, build menu, platoons, and result.
- Define a device matrix: small Android phone, modern tall Android, iPhone with home indicator, iPhone landscape cutout, and tablet.
- Add QA-only readouts for frame time, particle count, active audio voices, world loops, selected unit count, and current music state.
- Establish three repeatable battles: 5-minute onboarding, 15-minute Fortress defence, and 20-minute multi-AI stress match.

Exit gate:

- All scenarios can be replayed from saved setup presets.
- Each release has before/after screenshots and a short issue checklist.

### Stage 1 — information architecture and safe navigation

Goal: every destination is understandable and reachable on a phone.

Implementation:

- Complete the new Settings, Operations, Orders, and Profile category tabs.
- Consolidate the home grid into four hubs.
- Enforce 48 px targets for high-frequency controls and 44 px as the absolute floor for compact secondary controls.
- Verify Back footer, Android Back, focus order, safe areas, long labels, and large-text behavior.
- Add compact/comfortable HUD density.

Exit gate:

- No critical button is clipped at either phone orientation.
- Settings category changes take one tap; local save transfer is reachable without scrolling past account and identity content.
- Android Back always closes the visible top layer before offering app exit.

### Stage 2 — owned soundtrack and major audio pass

Goal: the game sounds modern, physical, spatial, and musically responsive.

Implementation:

- Fix victory/defeat routing first.
- Add music-state metadata and an owned-track now-playing display.
- Segment and review the supplied multi-sample reels.
- Replace any remaining synthetic, retro, abrasive, or low-quality clip.
- Complete families for movement, commander cannon, building/production, construction, alarms, attacks, impacts, projectiles, beams, carrier flight, and deployment.
- Add an Ambience control and retain global/per-event overlap protection.

Exit gate:

- No clipping or obvious sample-machine repetition during a 200-unit fight.
- A listener can identify cannon, beam, missile, artillery, flame, and sonic attacks without looking.
- Menu, deployment, pressure, combat, victory, and defeat have distinct musical behavior.
- Carrier travel is smooth and spatial; deployment lands with controlled low-end impact rather than harsh noise.

### Stage 3 — command readability and combat feedback

Goal: commands, counters, and danger are readable without pausing.

Implementation:

- Refine formation holograms with role-colored silhouettes, facing arrow, footprint bounds, collision warning, and count.
- Refine patrol preview with numbered nodes, direction arrows, closed-loop preview, invalid-node feedback, and persistent selected-route display.
- Add platoon rename/icon, stance summary, composition strip, casualty count, and one-tap focus/long-press assign consistency.
- Show selected unit weapon class, preferred armour target, minimum range, mode tradeoff, and current order in one compact card.
- Add tower ranges, dead zones, Uplink influence, and target links when a defence is selected.
- Keep health bars selection-first by default, with Always and Hidden options already available.
- Complete billboard projectile, beam, muzzle, hit, shield, smoke, fire, scorch, and critical-damage readability tiers.

Exit gate:

- A player can predict where every selected unit will stand before releasing a formation.
- Every patrol route communicates order and direction at a glance.
- Major weapon families and critical damage are distinguishable at normal phone zoom.

### Stage 4 — Fortress Doctrine / tower-defence mode

Goal: make Tower Defence a complete mode rather than a stat modifier.

Implementation:

- Add authored approach lanes or attack sectors per map, visible before deployment.
- Split pacing into Preparation, Warning, Assault, and Recovery beats.
- Add a wave forecast showing faction, armour mix, air presence, boss/hero, lane, and arrival window.
- Add defence targeting policies: nearest, first, strongest, weakest, air, light, heavy, and structures where valid.
- Give defence families distinct jobs:
  - Sentinel: dependable beam, branches toward rapid anti-light or heavy penetration.
  - Skyguard: air denial and missile interception.
  - Bastion: long-range siege with a minimum-range vulnerability.
  - Hellstorm: close swarm suppression.
  - Arc Pylon: chain damage and shield disruption.
  - Aegis/Uplink: repair, range network, and fortification synergy.
  - Walls/Gates: lane shaping, not infinite stalling.
- Add limited repair/rebuild recovery between waves and an optional accelerated next-wave reward.
- Keep infestation independently OFF/ON; in Fortress mode it must never silently become a second enemy unless chosen.
- Add Fortress score based on leaks/damage taken, structures lost, waves cleared, time, and chosen difficulty.

Exit gate:

- Ten waves produce at least four meaningful build adaptations.
- No single tower family clears every armour/air composition efficiently.
- All lane, wave, and boss information has both visual and audio cues.

### Stage 5 — AI doctrine and combined arms

Goal: each opponent responds to what the player fields while retaining faction identity.

Implementation:

- Track player composition in broad buckets: light swarm, heavy armour, air, artillery, shields/support, static defence, and naval.
- Let each faction choose doctrine-appropriate counters rather than sharing a perfect universal response.
- Ascendancy answers fortification with siege and armour; Syndicate answers exposed economy with mobility, air, and disruption; Horde answers isolated positions with saturation, creatures, and multi-lane pressure.
- Add attack intent telegraphs: raid, siege, air strike, diversion, commander push, and retreat/regroup.
- Improve multi-AI messaging so each incoming front has a lane, commander identity, and separate difficulty marker.
- Give naval units amphibious relevance through coastal objectives, bombardment influence, transport, or resource control on more than one map.

Exit gate:

- Repeating the same army composition for three waves produces a visible, faction-authentic response.
- Multi-AI pressure is understandable rather than feeling like unexplained unit volume.

### Stage 6 — authored campaign and stage ladder

Goal: teach one idea at a time, then ask the player to combine them.

Each stage is designed with the same template:

1. Player fantasy and one-sentence purpose.
2. New mechanic introduced.
3. Starting kit and locked systems.
4. Map route, start zones, resources, and buildable space.
5. Enemy faction, doctrine, difficulty, and scripted pressure beats.
6. Tower-defence/RTS balance.
7. Primary objective, optional objective, failure condition.
8. Tutorial cue, visual telegraph, and audio identity.
9. Expected first-clear time and mastery target.
10. Playtest metrics and exit criteria.

Proposed ten-stage arc:

| # | Stage | Teaches | Escalation and mastery |
| ---: | --- | --- | --- |
| 1 | Landing Zone | Carrier deployment, extractor, reactor, factory, basic movement | Win with no structure loss |
| 2 | Hold the Line | Sentinel, walls, repair, first forecasted waves | Clear five waves without commander damage |
| 3 | Counterbattery | Artillery minimum range, Bastion, flanking | Destroy enemy siege before it fires three volleys |
| 4 | Air Warning | Radar/Uplink, Skyguard, mobile AA, visual warning | Intercept every bomber before base impact |
| 5 | The Infested Scar | Optional infestation, nests, fire/chain crowd control | Purge all nests before the final enemy wave |
| 6 | Broken Patrol | Platoons, six formations, five-node patrol loops, simultaneous objectives | Hold three checkpoints with no paused orders |
| 7 | Shattered Coast | Harbor, naval artillery, coastal economy | Win using both naval and ground production |
| 8 | Three Fronts | Player-selected start zone, two or three independently configured AIs | Defeat Hard commander last after surviving both flanks |
| 9 | Fortress Doctrine | Tower branches, targeting priorities, Uplink network, boss wave | Clear ten waves with a mixed defence portfolio |
| 10 | Supreme Front | Full combined arms, faction heroes, superweapon, multi-AI strategy | Win with optional Threat modifiers and score mastery |

Exit gate:

- Every core control and counter is introduced before the campaign requires it.
- No stage introduces more than one new primary interaction and one supporting concept.
- First-clear time, restart points, and mastery conditions are tuned from real device playtests.

### Stage 7 — progression and economy coherence

Status update (2026-08-28): **ENGINEERING COMPLETE; HUMAN ACCEPTANCE
PENDING**. All implementation items and the deterministic currency exit gate
are complete in the canonical source checkout. Stage 8 engineering may begin.
The fresh-profile comprehension gate remains a required early Stage 8
acceptance item and must close before release sign-off. Evidence, the measured
first-week envelope, and the exact human protocol are recorded in
`docs/MASTER_PLAN_STAGE7_PROGRESS_2026-08-28.md`.

Goal: every meta system answers a different player question.

Recommended ownership:

- **Rank:** identity and broad access milestones.
- **Arsenal:** permanent account capabilities, cosmetics, and command unlocks—not duplicate percentage stats.
- **Development:** research unlocks recipes; crafted modules provide temporary, replaceable match modifiers.
- **Orders:** short-session direction and small rewards.
- **Threat/Operations:** self-selected difficulty and score multiplication.
- **Mastery:** proof of breadth across maps, factions, modes, and stages.

Implementation:

- **Complete:** remove and migrate four overlapping permanent percentage upgrades from Arsenal where Development owns that fantasy.
- **Complete:** show the four duration labels “Permanent,” “Equipped,” “Wears,” and “One Match” from one shared authority; cosmetics carry a “Permanent · Cosmetic” qualifier.
- **Complete:** restrict Core spending to permanent protocols, sidegrades, and cosmetics; mission supplies are recovered in operations and cannot be Core-restocked.
- **Complete:** give rank ten visible, catalog-derived unlock milestones.
- **Complete:** add one live Loadout summary before battle: permanent perks, equipped modules with durability, fitted account gear, supplies, commander identity, team, and mode preset.
- **Complete:** measure Core/material income against the recorded first-week progression envelope rather than each screen independently.

Exit gate:

- **Human pending:** a fresh-profile player can explain why Arsenal and Development both exist after viewing each once. This is required before release sign-off.
- **PASS:** no reward currency has only one obscure use or several unexplained competing uses.

### Stage 8 — polish, performance, accessibility, and release

Status update (2026-08-28): **IN PROGRESS**. The adaptive effects-budget
contract and independent effects/ambience/music/voice mixer are implemented.
The final quiescent shipping gate and interface matrix must be rerun after this
source freeze. Physical-device performance, current Android/iOS packages,
save/update interruption, lifecycle, and minimum-device acceptance remain
open; earlier evidence must not be treated as current when its fingerprint
differs.

Goal: ship reliably on actual Android and iOS hardware.

Implementation:

- Tune adaptive particle, shadow, billboard, world-loop, and unit caps from measured frame time.
- Add color-vision-safe team palettes, high-contrast HUD plates, reduced motion, camera-shake control, subtitle/caption support, and independent ambience/music/effects/voice levels.
- Enforce `commander-anime-flat-v1` for every human or robotic commander: crisp continuous lines, solid fills, and no surface shading. The measurable contract and PBR exception live in `docs/FACTION-ART-CONVERSION.md`.
- Ensure alarms, objectives, wave warnings, and damage states never rely only on sound or color.
- Validate local `.mfsave` export/import, update manifest comparison, interrupted downloads, signature/package identity, offline fallback, and clean-install/upgrade paths.
- Run portrait/landscape, cutout, gesture bar, three-button navigation, background/resume, interrupted audio, phone call, low storage, and no-network tests.

Exit gate:

- No P0/P1 install, save, navigation, update, crash, or data-loss issue remains.
- Stress scenarios meet the agreed frame-time target on the minimum device.
- APK and IPA builds pass device installation and a complete new-game-to-result smoke test.

## Prioritized backlog

### P0 — do before adding content

- Visual QA and interaction QA of the new category system.
- Victory/defeat music routing.
- Home hierarchy consolidation specification.
- One repeatable phone and multi-AI stress test.

### P1 — highest player-facing return

- Owned soundtrack states and now-playing UI.
- Compound SFX reel segmentation and audition pipeline.
- Wave forecast and Fortress phase loop.
- Formation/patrol/platoon visual feedback pass.
- In-match HUD density and contextual command cleanup.

### P2 — depth and retention

- Ten authored stages.
- AI composition responses and attack intents.
- Tower branches and targeting policies.
- Progression ownership/migration.
- Naval relevance on additional maps.

### P3 — expansion after the foundation is proven

- More maps, faction-specific buildable rosters, cooperative play, leaderboard services, cosmetics, and live events.

## How the owner can help each stage

- Assign each owned music track a mood and a faction/context preference after short A/B auditions.
- Approve or reject segmented source clips in small named batches rather than reviewing thousands at once.
- Rank the four desired player fantasies: mobile combined arms, fortress defence, commander hero play, and large-scale multi-AI war.
- Play each campaign stage once without hints and once using the mastery goal; report where the intended lesson was unclear.
- Send portrait and landscape screenshots from every target phone whenever a safe-area or density issue appears.
- Pick preferred silhouettes and effects from side-by-side captures at actual phone zoom, not enlarged art previews.
- Report exact device model, Android/iOS version, installed game version, and reproduction steps for install/update/save defects.

## Immediate next implementation slice

After the category UI passes visual QA, the next contained slice should be the owned-music state pass:

1. add an explicit result music state;
2. route Victory and Defeat tracks;
3. add track metadata and a no-repeat policy;
4. expose Now Playing and soundtrack-pack status in Settings > Audio;
5. capture menu, deployment, battle, and result videos/screenshots plus an audio event log;
6. then begin controlled SFX reel segmentation, starting with commander cannon and carrier deployment because those are high-impact, low-frequency events.
