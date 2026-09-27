# MASSFRONT galactic gameplay: research, audit, and release direction

Date: 2026-09-07  
Target corrective release: 1.33.79 (`1.33.78` is already published and remains immutable)

## Verdict

Space exploration should remain a compact strategic layer that repeatedly creates better-informed ground battles. It should not become a second game about manual ship piloting, an MMO economy, or a collection of disconnected minigames.

The target loop is:

`read the front -> choose a system -> scan for actionable intelligence -> choose an authored operation -> configure the drop -> fight the RTS battle -> see the front and expedition change`

That loop is now represented by one connected domain state. Survey and travel consume deterministic expedition cycles; unresolved discovered fronts gain pressure; victory or partial success reduces pressure; setbacks increase it; and the same pressure value drives the visible allied-control meter and debrief. The ground adapter accepts all nine authored operations rather than only the Pale Bloom path.

## What to take from the inspirations

| Inspiration | Adopt | Do not import |
|---|---|---|
| Helldivers 2 | A legible war table, protected/contested/enemy regions, planet-to-operation selection, difficulty/threat framing, loadout before deployment, and a visible campaign consequence after the battle. Sony's official overview describes selecting a planet at the War Table, choosing an operation of up to three missions, choosing a loadout, and contributing to the wider Galactic War. | A live-service dependency, communal progress that makes solo play feel irrelevant, or many currencies that obscure the next useful action. |
| Mass Effect 2 | Planet scanning only: move a reticle over a globe, watch signal strength, resolve peaks with a probe, and let anomalies open missions. The official manual describes exactly that scanning/probe/anomaly chain. | Dialogue-wheel structure, RPG inventory, free-roaming hubs, or a Normandy imitation. The user's stated reference is the scanner, not the rest of Mass Effect 2. |
| XCOM 2 | A clean strategy/tactical boundary, competing urgent choices, a mobile command vessel, crew recovery, facilities, research, and consequences that persist after a mission. The official manual separates the Avenger/Geoscape strategy layer from tactical missions; Firaxis also described the strategic layer as dynamic rather than a static sequence. | A parallel base-management spreadsheet with enough subsystems to delay the core RTS battle. |
| StarCraft 2 | One-click movement between major campaign functions, readable unit/upgrade consequences, short authored briefings, and a strong transition into combat. Blizzard explicitly removed redundant screens and made major screens one click apart in its campaign UI update. | A literal Hyperion layout, duplicate armory trees, or lore/UI mimicry. |
| EVE Online | Sensor-overlay hierarchy, signatures that require probes for detail, finite probe/fuel logistics, and local system capacity that gives territory operational meaning. EVE's official help distinguishes immediate sensor results from probe-resolved signatures and describes sovereignty upgrades constrained by local power, workforce, and fuel. | Manual flight, fittings as a second career, player markets, corporations, sovereignty bureaucracy, real-time travel, or an MMO-scale economy. |

Sources: [Helldivers 2 Galactic War overview](https://blog.playstation.com/2024/01/23/helldivers-2-galactic-war-gameplay-detailed-complete-missions-reclaim-planets-rescue-the-galaxy/), [Mass Effect 2 official manual](https://eaassets-a.akamaihd.net/eahelp/manuals/mass-effect-2-manuals_PC.pdf), [XCOM 2 manual](https://www.feralinteractive.com/en/manuals/xcom2/latest/steam/), [Firaxis on XCOM 2's strategy layer](https://xcom.com/news/breathing-more-layers-and-life-into-xcom-2-war-of-the-chosen/amp), [StarCraft II campaign UI update](https://news.blizzard.com/en-us/article/8724162/starcraft-ii-wings-of-liberty-patch-2-0-4), [EVE scanning](https://support.eveonline.com/hc/en-us/articles/203209902-Scanning), [EVE sensor overlay](https://www.eveonline.com/news/view/sensor-overlay-changes-in-eve-odyssey), and [EVE sovereignty infrastructure](https://support.eveonline.com/hc/en-us/articles/14339751569436-Sovereignty).

## Why avoid whole-system imitation?

Avoidance applies to feature bulk, not to useful inspiration. Every adopted mechanic must answer at least one of these questions:

1. Does it reveal a better ground-operation choice?
2. Does it change what the player can deploy?
3. Does it make the result of a ground battle matter strategically?

If the answer is no to all three, it is likely ornamental bloat. For example, EVE-style manual piloting would add controls, tutorials, physics, encounters, networking expectations, and content costs without improving MASSFRONT's RTS decision loop. EVE-style local pressure and finite probes, however, make reconnaissance and intervention choices matter and are therefore useful.

## Implemented architecture

### 1. The UGA is a coordinator, not a fourth sovereign faction

- Playable sovereign factions remain Nova Coalition, Crimson Dominion, and Syndicate Coalition.
- UGA is explicitly neutral, non-sovereign, and non-selectable.
- Brood remains hostile and non-selectable.
- Authored operations preserve sponsor, opponent, access, roster, objective, landing-zone, support, and doctrine constraints across the exploration module and classic game bridge.

### 2. A solo war can move without pretending other players are present

Each discovered unresolved system stores deterministic `soloFront` pressure from 0 to 100. Survey, extraction, travel, and operation cycles add pressure. Successful ground operations reduce it; setbacks increase it. Undiscovered systems do not accumulate hidden punishment, resolved fronts stop worsening, and migrated saves begin tracking from their saved cycle instead of receiving retroactive penalties.

The galaxy map displays `allied control = 100 - pressure`, uses that result for protected/contested/enemy presentation, and names the current pressure in the selected-system directive. The ground debrief reports the exact pressure delta. This makes the space layer both a cause and a consequence of RTS play.

### 3. Scanning is information work, not filler

The planet remains zoomed out enough to read as a globe. Scanning uses a movable reticle, signal strength, discrete peaks, finite probes, mineral deposits, and mission-producing anomalies. The scanner's output feeds the same mission eligibility and resource state used by the warfront and loadout flow.

### 4. Deployment is the hinge into MASSFRONT

The galaxy map exposes authored operations per system. The player chooses an operation, then chooses landing zone, commander, starting force, structures, orbital support, and doctrine in the physical strike-bay/loadout view. The production adapter validates the exact catalog and schema and converts conflict objectives to the classic destroy runtime and Brood operations to purge. It rejects forged or mutated envelopes.

### 5. The flagship supports the loop

Facilities, construction, research, personnel recovery, resident-faction commissioning, logistics, and mission operations live on the flagship. They should improve reconnaissance or deployment capacity rather than become unrelated daily chores. The next expansion should deepen cross-links—for example, a survey upgrade that exposes an extra landing zone or a logistics upgrade that changes starting-force capacity—before adding a new facility family.

## Surface theatres: what KIND of battlefield a planet is

Added 2026-09-24, after the four-tier unlock ladder and the jump-gate arc. The
ladder answers *where* the war reaches next; this section answers *what the
fight looks like when it gets there*.

The contract lives in `modules/space_exploration/src/domain/catalog.js`:
`SURFACE_THEATER_CATALOG` defines the kinds, `PLANET_SURFACE_THEATER` assigns
exactly one theatre per planet, and `PLANET_RUNTIME_REGION` names the runtime
terrain kit each planet deploys on. `jump-gates-theatres.test.mjs` enforces
gate reciprocity (every relay lane has a system-jump gate in BOTH systems),
that every gate targets an authored lane, and that a planet's ground areas
resolve to its declared theatre.

The design rule that keeps this cheap and safe: a **reserved theatre claims no
runtime template**. The map receiver refuses any template id that does not
exist, so a reserved theatre cannot silently drop onto a land kit and look
wrong without throwing. Ships-the-contract first, art second.

| Theatre | Status | Shaped by | Planets assigned |
|---|---|---|---|
| Surface Assault (land) | shipped | existing land kits | Ithara, Orison, Nacre, Meridian, Sombrero-Aelos, Pyraeth, Vespera |
| Ocean Theatre | shipped | Stormpeak Ocean Theatre Tester (`modules/stormpeak_ocean`) proved naval play end to end; the `wet` table in `src/engine/gl.js` MAPDEFS already ships ocean/river water modes on `aelos_coast_*`, `nordhall_isles_*`, `nordhall_cliff_medium`, `nordhall_peaks_large` | Caldris, Nordhall |
| Gas-Giant Air Ops (`gas_air`) | reserved, next | air-only: platforms and skimmers, no seabed, no ground capture — objectives ride on floating structures | Zephyros (`aelos_zephyros`, Aelos fuel giant, stage-10 canon slot 7) authored 2026-09-25 with a full PBR package; the theatre stays reserved until the battle layer ships, so the giant claims no runtime template |
| Interior X-S (`interior_xs`) | reserved | close-quarters frame inside hulks and hive spires | none yet |
| Moon Regolith (`moon`) | reserved | low-gravity regolith ops | Tethys Foundry (region deliberately `null`) |

Sequencing and why this order:

1. **Ocean (done).** The experiment-first path worked: build the tester,
   prove the naval loop on real hardware-GPU Playwright runs, then promote the
   proven kit to shipping planets. Ocean planets reuse the existing wet kits
   instead of authoring new terrain.
2. **Gas-air (next).** Cheapest reserved theatre to unlock: the planet shader
   already has a `gas` biome and `three_space_engine.js` already branches on
   `volcanic`, so the orbiter art direction exists. The host world is now
   authored too — Zephyros, the Aelos fuel giant (verified streaming its PBR
   package on hardware GPU), reachable through the Aelos planet ladder. The
   remaining work is the battle layer — spawn/anchor rules on floating
   platforms, a no-ground-capture objective set, and unit filtering so
   ground-pure rosters cannot deploy.
3. **Moon.** Needs an actual sim change (gravity constant, traverse/drive
   feel) plus one regolith kit. Tethys Foundry stays undeployable until both
   exist; the `null` region makes that state explicit rather than accidental.
4. **Interior X-S.** The largest ask — authored interior spaces rather than
   terrain — so it waits until the other three prove the theatre plumbing.

Jump gates are the reach mechanism for all of this: four new authored gate
contacts (Sombrero, Andromeda, Orion, Helios — the last sealed as the Brood
origin corridor) mean every non-home system is now one authored lane from a
connected system, so a new theatre anywhere in the chart is reachable through
the existing survey → unlock → deploy ladder rather than needing new travel
plumbing.

## Region and map coverage: how much world is playable

Added 2026-09-25. The theatre table above answers *what kind* of battlefield a
planet hosts; this section answers *how much of the chart is actually
fightable*, and sequences the expansion without breaking the bloat budget.

The deployable chain already exists end to end — `system → planet → region
(ground area) → maps` — and every map rides a proven runtime terrain kit. What
lags is coverage: 9 authored regions (27 maps) sit on 4 of the 11 chart bodies,
while the base game already ships 48 authored homeworld battlefields (16
regions × 3 maps) that the exploration module does not expose. The 32-planet
Spline prompt library (2026-08-25, `runtimeReady:false`) carries 8 authored
locations per expansion planet but remains source-only until separately
approved. A planet without deployable regions is a chart pin, not a front.

| Body | Regions | Maps | State |
|---|---|---|---|
| Caldris | 2 | 6 | deployable |
| Ithara | 1 | 3 | deployable |
| Orison | 1 | 3 | deployable |
| Nacre | 2 | 6 | deployable |
| Meridian K-4 | 3 | 9 | deployable |
| Zephyros | 0 | 0 | gas_air reserved — needs the air battle layer |
| Tethys Foundry | 0 | 0 | moon reserved — needs gravity sim + regolith kit |
| Aelos / Pyraeth / Nordhall / Vespera (homeworld bodies) | 16 in the base game | 48 | authored and playable in the classic War Table, **not bridged** into the module |

Sequencing, cheapest-to-deepest:

1. **Phase A — bridge the homeworld battlefields (next).** The 16 regions ×
   3 maps already play end to end in the base game; exposing them onto the
   four homeworld bodies costs 16 authored operations plus catalog/ladder
   wiring, not new terrain. Hard dependency first: those four bodies ship no
   authored orbiter package, so `loadSystemBodies` currently rejects their
   systems — give them packages or an explicit lore-only visual treatment
   before fronts can live there.
2. **Phase B — replay value before new pins.** Objective variants and enemy
   composition rotations over the existing 27+ maps, measured with the
   extracted design database. This is the primary remedy for risk 2 below;
   coverage without new ways to fight is filler.
3. **Phase C — a fourth map tier.** A `siege` size above `large` only where
   the design database shows campaign pacing holds; three sizes remain the
   default for every new region.
4. **Phase D — expansion-library tranches.** Promote one library sector at a
   time following the Zephyros pattern (seeded source painting → PBR package →
   ladder rung → theatre assignment). A planet enters the chart only when it
   can host at least one region with an authored operation; slot 8 of the
   stage-10 ladder fills when a tranche earns it.

Non-goals, restated from the bloat budget: no procedural regions, no maps
without an authored operation, no planet promoted ahead of deployable content,
and reserved theatres stay empty until their battle layer ships.

## GUI integration and bloat budget

The supplied archive was treated as a source collection. Its embedded “do not implement/publish” language described the archival task, not the user's current explicit authorization to proceed. Its canon warnings and control invariants were retained.

Only 16 PNGs were admitted: 1x and 2x versions of eight neutral, open-center frame families (`primary`, `tab`, `resource rail`, `commander/resource join`, `context`, `unit slot`, `production card`, and `feed row`). They total 255,024 bytes. Runtime text, symbols, state colors, focus, hit testing, and model/portrait content remain separate live layers. Generated portraits, invented emblems, flattened concept screens, ambiguous state overlays, and missing historical originals were excluded.

The larger 147,627,666-byte exploration payload remains content-delivery data rather than mandatory shell weight. Automatic delivery pauses for Save-Data, metered connections, slow-2g/2g/3g, or reported downlink at or below 1.5 Mbps. Explicit user installation/retry can override that policy, and already verified cached content still mounts. This keeps the module important without forcing its heavy art onto a constrained connection.

## Interaction, accessibility, and artistic review

- Browser page zoom is no longer disabled. WCAG expects text to resize to 200 percent without loss of content or functionality, and reflow should avoid two-dimensional scrolling at narrow equivalent widths. [WCAG Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text) and [WCAG Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow).
- Primary touch actions use at least 44 logical pixels where the redesigned module owns the control. Apple recommends 44-by-44-point hit targets; WCAG 2.2 AA specifies a 24-by-24 CSS-pixel minimum or sufficient spacing. [Apple UI design tips](https://developer.apple.com/design/tips/) and [WCAG Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Decorative frames use pointer-events none and never own semantics.
- Small strategic labels were raised for portrait and short-landscape layouts. The operation and dossier panels scroll independently instead of covering the globe or pushing essential actions out of reach.
- The planet is intentionally framed farther away than the earlier close crop. The map, planet, ship bay, and ground battle remain visually distinct layers of one military-command journey.
- Motion remains restrained and respects reduced-motion preferences. Threat/control meaning is expressed with wording and state labels in addition to color.

## Remaining design risks

1. The warfront is intentionally solo and deterministic. If a future online aggregate is added, it must be a signed, bounded modifier layered on the local baseline—not a requirement for campaign progress.
2. There are only nine authored ground operations. Replay value should first come from objective variants, landing-zone tradeoffs, enemy compositions, and world-state consequences, not procedural filler cards. (Phases A–D in the coverage plan above sequence the fix.)
3. Personnel injuries and facility upgrades exist, but their effect on the tactical opening needs continued balance measurement using the extracted design database.
4. Physical Safari-installed PWA and physical Android acceptance remain untested for this corrective build until those devices are actually exercised. Browser emulation is not a physical-device result.
5. The GUI archive has unrecovered historical originals and unresolved portrait identities. Neither affects the neutral frame subset, but those gaps block future portrait or emblem integration without explicit creator approval.

## Release acceptance

Release acceptance requires all of the following on the exact 1.33.79 bits:

- classic-global syntax bundle and package staging pass;
- domain, all-nine-operation adapter, classic bridge, content-mount, and network-policy contracts pass;
- hardware-GPU Playwright route from orbit through scan, galactic map, operation choice, loadout, deployment, debrief, and return;
- visual inspection at portrait and 915x412 landscape, including the zoomed-out planet and scrollable panels;
- packaged `www/` navigation/play flow, not source-only verification;
- immutable OTA artifacts uploaded before guarded stable-pointer activation;
- Cloudflare mirror and Hugging Face manifests byte/hash checked;
- Android sync/build/shrink if packaged boot or native wrapper bits changed;
- exact packed `www/` uploaded to the browser playtest surface;
- physical device gaps reported as untested, never inferred from emulation.
