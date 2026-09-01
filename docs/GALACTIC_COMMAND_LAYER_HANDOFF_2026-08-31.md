# Galactic command layer — handoff — 2026-08-31

Repair the experimental Galactic module chrome first. Then flesh the command
layer so Standard, Campaign, and local AI-ally play sit inside a gamified UGA
ship — EVE / Mass Effect 2 / Supreme Commander 2 / XCOM 2 as feel references,
MASSFRONT catalogs as the only data.

This is a plan, not a completion record. No R0–P6 implementation is claimed.

## Product

Experimental Galactic is a same-tab command skin over live MASSFRONT, not a
second game.

- Settings → **Experimental: Galactic Campaign** (off by default) → **Open
  Experimental Galactic** lands `campaign_hub` / UGA.
- **START MASSFRONT** stays War Room. Do not hijack it.
- Do not remap commander catalogs or invent War Table IDs.
- **MMO** is the long-term ideal only. Hub card stays visible and locked. No
  fake persistence.
- **Co-op now** = Standard Allied Strike (player + one AI ally). Hub
  **Co-op / Versus** stays `NETWORK_UNAVAILABLE`. Do not unlock it and do not
  silently route it to Standard as if it were online co-op.

Host-routes already wrap Operations, Development, Arsenal, Orders, Intel,
Career, Inbox, Social, Settings, plus Training / Standard / Campaign / Weekly.
Local controllers already exist for galactic research, intel, contracts,
embassy, crew (preview), logistics.

Planet scanning: keep and deepen the Mass Effect 2 uncharted-world loop. Do
not strip MASS EFFECT 2 SCANNER copy. Planets, resources, and art stay original
MASSFRONT. No BioWare meshes, N7 decals, or eezo.

As of 1.33.52 the module is in packed `www/`, the APK, HF Space, and the HF
`exploration-pack/`. A 1.33.51 APK still needs the 1.33.52 installer (or Space)
for `./modules/space_exploration/index.html` to HEAD 200. R0 is UI repair, not
a packaging task.

## Build order

1. **R0** Repair — overlay soup, hub fold, resource clip, Galaxy/Ship
   reachability, dead host-route chrome. Leave scanner copy alone.
2. **R1** Repair — commander catalog/portrait wiring to the existing nine-row
   roster (no new IDs).
3. **P1** Vision — UGA ship sections read as rooms, not boxes.
4. **P2** Vision — hire commanders as Hangar / Embassy action.
5. **P3** Vision — research as a ship-lab loop that spends points.
6. **P4** Vision — Caldris / Ithara scan loop feels like ME2 uncharted-world
   survey.
7. **P5** Vision — missions that drop into real Standard / Campaign / Pale Bloom.
8. **P6** Vision — board stations / relics (after contacts are runtime-ready).

First build slice is **R0 only**. Then R1. Then P1.

## Broken module UI

Source: `modules/space_exploration` UI + `src/galactic-operations.js`.
Visual: `audit/stage11-space-ux/screenshots` 02, 05, 05a-01, 06.

| Issue | Class | Where it lives | Player sees |
|---|---|---|---|
| HOLDING ORBIT overlaps expedition directive | Overlay / layout | `space_experience.js` toast; `space_module.css` `.toast-banner` `top:102px` `z-index:120` over `.story-rail` `top:118–130px` `z-index:10` | Autopilot HOLD toast sits on the EXPLORE directive / KEEL rail |
| Hub inspector hides 4 session cards on 412 | Overlay / layout | `uga_command.css` expanded sheet `min(40%, 360px)`; mobile grid 1-col; `uga_command.js` `campaignHubPanel` title + horizons eat the fold. DOM has all 4 cards. Shot 06 shows Standard + Campaign only | MORE looks like inspector chrome, not a war table |
| RESEARCH clipped on resource ribbon | Overlay / layout | `uga_command.css` 7×52px chips + 88% fade mask. Shots 05 / 05a-01 / 06 | Research reads as RESEA…; fuel/probes off-screen |
| STARCHART / UGA COMMAND unreachable from hub | Overlay / layout | `space_module.css` hides `.exploration-topbar` when `data-scene` is `uga`. Portrait also hides button labels. Hub nav says Galaxy / Ship | Player in MORE cannot find the system-scene buttons they just used |
| Settings OPEN below the fold | Overlay / layout | `campaign_hub_registry.js` ~20 service rows; Settings is mid-list; 360px sheet cannot show it without scroll | Live MASSFRONT Settings looks missing even when host-routes work |
| UGA interiors read as boxes / washed hulls | Art / placeholder | `uga_command_scene.js` `BoxGeometry` fallbacks if `DISTRICT_*` missing; dark PBR + fog at overview. Shot 05 = schematic white rooms; 05a-01 = boxy Command Core | Biggest vision hole. Controllers work; rooms do not feel like a ship |
| Hire / crew keyed to three retired commander IDs | Controller exists but unusable | `catalog.js` `COMMANDER_CATALOG` still `nova_rhea_voss` / `dominion_toren_vale` / `syndicate_mara_quill`. Portrait allowlist in `uga_command.js` is the same three. Roster contract is the nine-row Kai / Vex / Renn set. Tests already require the alias | Embassy RECRUIT / Crew cards toast or show “dossiers sealed.” Bind the existing roster — do not invent IDs |
| Most missions cannot launch production MASSFRONT | Controller exists but unusable | `massfront_solo_host.js` `validateIntegratedOperation` accepts only `uga_pale_bloom`. Other `MISSION_CATALOG` rows plan locally then hit `GALACTIC_OPERATION_OUT_OF_SCOPE` | Missions tab looks full; Confirm & Deploy fails for faction contracts |
| Station / relic Interact only toasts | Missing loop | `space_experience.js` `actInteract` → `CONTACT INTELLIGENCE ARCHIVED`. Showcase contacts are 3D only. Spline ground/relic prompts `runtimeReady: false` | Boarding is not a feature yet |

No crash/blocker on the verified hardware-GPU path. Isolated sandbox also
disables every `host-route` because `onHostRoute` is null there.

## Vision splices — current truth

| Splice | State now | Repair / vision work |
|---|---|---|
| 1. UGA ship sections | Controller + cutaway GLB + eleven district IDs. Rooms still schematic / dark boxes | P1 after R0 layout so the cutaway is actually visible on 412 |
| 2. Hiring commanders | Embassy RECRUIT + Crew preview exist. Catalog/portraits still on three legacy IDs. Cards toast only | R1 bind nine-row roster + portraits. P2 make Hangar/Embassy a hire action, not a toast |
| 3. Researching | Local galactic-research controller + `commitResearch` + 9 programs. Ribbon clips the resource | R0 unclip RESEARCH. P3 spend-from-survey and show effect in the lab, not a second tech tree |
| 4. Scanning planets for resources | Playable Caldris / Ithara survey with ME2 HUD already in place. Aim is not yet the launch authority | P4 lean into ME2: spike-while-rotating, lock, missable probe, travel arc, anomaly vs mineral. Keep the ME2 copy |
| 5. Missions | Contracts planner + hangar loadout. Production host only accepts Pale Bloom. Standard/Campaign are host-routes | P5: faction contracts stay honest (local or locked). Standard / Campaign OPEN must leave the sheet and open the real War Table / Prologue |
| 6. Boarding stations / relics | 3D contacts + relic prompts, no board loop | P6 last. Do not fake an MMO dock. One authored contact → one interior or ground site when `runtimeReady` |

## P4 scanner — ME2 match vs missing

Source: `planetary_survey.js`, `space_experience.js` (`refreshSurvey` /
`initSurveyScanner` / `launchProbe`), `index.html` `surveyModal`,
`space_module.css` `me2-*` HUD, `showcase_systems.js` Caldris / Ithara deposits.

| ME2 uncharted-world beat | Already in MASSFRONT | Still missing |
|---|---|---|
| Orbital globe + lat/lon reticle | Authored PBR planet, atmosphere, optional rings, wireframe scan grid, dashed spinning reticle, LAT/LON readout | Reticle is a HUD overlay plus a scene ring, not a surface-locked scan cone |
| Spectrogram / oscilloscope | Canvas oscilloscope, signal meter, SWEEPING → HARMONIC → PEAK ANOMALY SPIKE. Dossier eyebrow already says MASS EFFECT 2 SCANNER | Waveform is a sine driven by a single percent, not a live mineral-vs-anomaly trace |
| Rotate to hunt, idle spin when not dragging | Pointer drag rotates the globe; idle yaw continues. Deposits stay hidden until a hit | Mineral side-bars are static planet abundance, not live spikes as the reticle crosses a deposit |
| Launch directed probe at the spike | LAUNCH DIRECTED PROBE button, probe cone, impact ring, site reveal octahedron, probe count in telemetry | 3D aim (`evaluateAim` / `sensorThreshold`) is ignored by domain `deployProbe`. Launch always consumes the next `SURVEY_CATALOG` row. Misses are cosmetic |
| Probe travel from ship to surface | Straight Z lerp from camera (`z=55`) to the globe (`z=22.4`) | No ballistic arc, no ship-origin, no camera punch on hit. Miss should skip off or waste the probe |
| Resource vs anomaly | Two data sets exist: `mineralDeposits` (alloys / components / researchPoints / bioSamples) and `SURVEY_CATALOG` discoveries (cipher, embassy signal, hive) | UI treats every peak as ANOMALY. No visual split between a mineral shelf and an authored relic / distress site |
| N7 / Normandy chrome | MASSFRONT / UGA dossier, Caldris / Ithara names, alloys-components-bio bars — original content | Keep it UGA-branded. The feel is ME2; the fiction is MASSFRONT |
| Ithara as a second uncharted body | Planet selector pills exist; Ithara has rings + one component deposit | Same aim-does-not-matter launch path. Ringed-world framing should be a first-class P4 proof, not Caldris-only |

P4 success: 412 Caldris rotate-to-spike-lock-launch (one hit, one miss); Ithara
the same loop on the ringed world; ribbon ticks the extracted MASSFRONT
resource; MASS EFFECT 2 SCANNER copy still on screen; no BioWare art.

## R0 — first build slice

**Goal.** A 412 portrait player can enter Experimental Galactic, read the
system scene, open MORE, see all four session cards, reach Galaxy and Ship,
read Research on the ribbon, and open Settings without hunting. No new
catalogs. Leave MASS EFFECT 2 SCANNER alone.

**Player-visible change.** HOLD toast no longer covers the directive. MORE
opens with Standard, Campaign, Co-op (locked), MMO (locked) on the first
screen. Resource chips wrap or scroll without a fade that eats RESEARCH.
Bottom nav (or a persistent header action) always exposes Galaxy and Ship
while the UGA overlay is up. Settings OPEN is on-screen, or live MASSFRONT
routes sit above the fold.

**Files.** `modules/space_exploration/src/ui/space_module.css`,
`space_presentation.css`, `uga_command.css`, `uga_command.js` (hub panel order /
sheet default), `space_experience.js` (toast vs story rail only). `index.html`
only if toast/rail slots need a dedicated host node. Do not edit survey
description strings in R0.

**Do not.** Hijack START. Enable Co-op or MMO cards. Remap commander or War
Table IDs. Add a fifth session family. Strip or rewrite the Mass Effect 2
scanner copy.

**Success check.** Settings → Experimental: Galactic Campaign → Open
Experimental Galactic. 412×900: system scene, tap HOLD, screenshot (toast
below or instead of the rail, not on it). MORE: all four session cards visible
without scrolling. Resource ribbon: RESEARCH fully readable. Tap Galaxy
(starchart) and Ship (UGA command) from the hub overlay. Land on Settings OPEN
and return to MASSFRONT Settings. Home START MASSFRONT still opens War Room.
Caldris survey still says MASS EFFECT 2 SCANNER.

## R1 — commander wiring (still not a remap)

`catalog.js` `COMMANDER_CATALOG` is still the three-row sandbox fixture.
`commander_roster_contract.js` and production commissioning use the nine-row
MASSFRONT roster (Kai, Holt, Vale / Vex, Korr, Dravik / Renn, Calder, Voss).
Portrait allowlist only lists the three retired IDs. Embassy therefore cannot
show hireable Commander 1s.

Alias `catalog.js` to the existing nine-row contract (tests already demand
this). Map the three approved webp files onto Commander 1 via the existing
legacy alias table. Do not add commanders.

## Vision phases after chrome works

**P1 Ship sections.** Deck A/B/C rooms readable at overview and focus. Prefer
lighting, naming, and authored `DISTRICT_*` interiors over more `BoxGeometry`.
Files: `uga_command_scene.js`, `uga_blender_assets.js`,
`uga-command-cutaway.glb`, nexus-vii district prompts. Success: 412 focus on
Command, Survey, Hangar, Embassy — each room identifiable in a screenshot.

**P2 Hire commanders.** Hangar or Embassy: pick a resident faction, see that
faction’s Commander 1 from the nine-row roster, hire/unlock, then assign.
`onCommanderPrepare` must stop being a toast-only dead click. Do not invent a
tenth commander. Success: after a Nova career, recruit Dominion → Vex appears
in Crew and can be selected for a drop.

**P3 Research.** Keep the local galactic-research controller. COMMIT 10 must
change the lab and the ribbon. Host-route Development stays the base-game tree
— do not merge trees. Success: finish Spectral Cartography, see Veyra survey
unlock, ribbon Research drops.

**P4 Survey for resources.** Make Caldris and Ithara feel like ME2 space
exploration. Keep the MASS EFFECT 2 SCANNER eyebrow, spectrogram, sweep
statuses, planet reticle, and LAUNCH DIRECTED PROBE. Wire 3D aim so a probe
only resolves a site at peak lock; a miss spends the probe. Replace the
straight Z lerp with a visible travel arc and impact. Mineral rows should
spike as the reticle crosses that resource; anomaly / discovery sites should
read differently from mineral shelves. Original MASSFRONT planets and
`RESOURCE_KEYS` only.

**P5 Missions.** Hub Standard / Campaign OPEN must call the existing
host-routes (`mode-standard`, `mode-campaign`). Pale Bloom is the only
production ground op today — keep that honest. Other catalog missions stay
locked or local-sim labeled until a host adapter exists. Success: MORE →
Standard → real War Table; MORE → Campaign → real Prologue. No fake MMO drop.

**P6 Boarding.** Last. Showcase contacts already render. Interact must stop as
a dead toast. One station or relic with `runtimeReady` true gets a
board/inspect loop; the rest stay locked. Do not spawn a persistent sector
authority.

## Risks

| Risk | Why it matters | Guard |
|---|---|---|
| Repair slides into catalog remap | Three-vs-nine commander IDs looks like a data rewrite | Only alias `catalog.js` + portraits to the existing nine-row contract |
| Hub Standard OPEN replaces home START | Owner forbade replacing home / START / Standard | Host-route to War Table; home START stays War Room |
| Co-op card enabled as AI-ally | Reads as fake online co-op | Keep `NETWORK_UNAVAILABLE`; send players to Standard Allied Strike by copy, not by unlocking the card |
| Interior pass before layout repair | 412 inspector still covers the ship the art just improved | R0 first so P1 screenshots can actually show the rooms |
| P4 copies ME2 assets or eezo | Owner wants the feel, not a clone of BioWare art | Keep MASSFRONT planets/resources; keep ME2 interaction + existing scanner copy; no N7 / Normandy / eezo assets |

## Hard constraints

- No `import`/`export` under `src/`.
- No new War Table IDs.
- No MMO backend.
- Module stays experimental. Player packs as of 1.33.52 include it; do not
  treat a missing module as an R0 UI bug.
- Evidence under `audit/` or `tmp/` only.
- Run `node tools/bundle.mjs` after any `src/` change. Module-only CSS/JS does
  not go through that concat, but must not collide if a file is later
  registered in `boot.js` and `assets/data/manifest.json`.

Grounded in Local checkout source and existing Stage 11 412 captures. Owner
correction 2026-08-31: keep ME2 scanner copy and feel.
