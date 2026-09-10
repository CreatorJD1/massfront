# MASSFRONT UGA Space Exploration Design Research

## Executive decision

UGA should not become a separate space game attached to MASSFRONT. It should be
the strategic layer that makes the ground RTS battles matter. The strongest
reference structure is:

- **Helldivers 2 for the operational spine:** ship home, readable galactic
  conflict, planet, operation, preparation, deployment, reward, return.
- **Mass Effect 2 for one tactile scanning interaction:** rotate a planet,
  locate a strong signal, spend a probe, and reveal resources or a mission.
- **XCOM 2 for persistent headquarters progression:** research, engineering,
  personnel, recovery, and threats all feed the next tactical battle.
- **StarCraft II for campaign clarity:** a small number of ship services and
  mission choices improve the army used in the core RTS.
- **EVE Online for spatial readability:** uncertain contacts become precise
  destinations, the camera can focus or recenter, and scan results always lead
  somewhere. Its economy, fitting depth, window density, travel downtime, and
  open-ended simulation are not appropriate for this mobile loop.

The old UGA dashboard reference still applies, but only as a compact access
layer. It should expose the next operation and a few ship services without
replacing the space view, scan, live front, or ship progression.

The resulting product promise is simple: **explore to find a reason to fight,
fight the real RTS battle, then return stronger and change the front.**

## Evidence from the reference games

### Helldivers 2: one legible war loop

Arrowhead describes the ship's War Table as the place where the squad observes
the changing conflict, selects a planet, chooses an operation, and prepares a
loadout. Missions return resources and intelligence, while completion advances
planetary and sector liberation.^1 A separate hands-on description closes the
loop explicitly: complete a mission, visit Ship Management for upgrades, select
the next mission, choose gear and stratagems, and deploy again.^2

The transferable lesson is not Helldivers' exact UI or live-service scale. It is
the continuity of intent. At every step the player knows:

1. what part of the front needs attention;
2. what operation is available there;
3. what difficulty, environment, and reward it carries;
4. what they are taking into the mission; and
5. how the result changes the wider war.

For MASSFRONT, that sequence should end in the existing warfare RTS rather than
an action-shooter drop. Protected, contested, and enemy-controlled space can be
shared online when available, but the same interface must remain useful with a
local simulated front when offline.

### Mass Effect 2: scanning as a bridge, not a destination

The Mass Effect 2 manual gives scanning a concrete economic and mission role.
The player orbits a planet, moves a reticle over the surface, rotates the globe,
launches probes at signals, recovers minerals, and can reveal anomalies that
open N7 missions and permit landing.^3 The same ship then provides squad,
armory, research, and upgrade access.^3

That is the useful inspiration. MASSFRONT should preserve the satisfying signal
hunt but compress the repetition:

- one readable waveform and one fixed reticle;
- a short sweep across a fully rotatable globe;
- obvious signal thresholds and finite probe cost;
- one strong resource result, one mission-bearing result, or both;
- an immediate **Inspect Region** or **Prepare Operation** action.

It should not ask players to methodically drain every planet. A scan that only
adds a number and then leaves the player in the same state is a broken loop.
Minerals should fund ship or army improvements; anomalies should reveal a real
ground operation; completed surveys should visibly change the planet record.

### XCOM 2: strategy exists to alter tactical decisions

The XCOM 2 Geoscape combines movement, scanning, resources, hostile plans, and
mission choice. Its Avenger facilities provide battlefield capabilities through
research, engineering, equipment, and personnel preparation.^4,5 The important
relationship is bidirectional: strategy prepares the squad, tactical results
change the strategic situation, and injuries or recovered assets shape the next
choice.

MASSFRONT already has the more complex tactical core, so UGA needs less
administrative friction than XCOM. Ship compartments should answer one of three
questions:

- What can I improve before the next deployment?
- Who and what is available to deploy?
- Where should I intervene next?

Any compartment, timer, currency, or status that cannot affect one of those
questions is a candidate for removal or progressive disclosure.

### StarCraft II: upgrades and mission choice stay subordinate to RTS

Blizzard presents Wings of Liberty as a campaign where the player chooses a
mission path and technology/research upgrades across the campaign.^6 Its ship
services support the next authored RTS mission instead of becoming a parallel
simulation. This is the right restraint for MASSFRONT: UGA can deepen ownership
of the expedition, but combat units, economy, building, control, and tactical
abilities remain the game players ultimately deploy to play.

### EVE Online: borrow orientation and progressive certainty

CCP describes its Probe Scanner and Solar System map as a paired discovery
interface: the scan list shows signatures and anomalies while the map visualizes
their position and probe work. Its camera can snap to a celestial and align the
scanner with the view.^7 An earlier sensor-overlay design also reveals rough
contacts on arrival, then progressively improves location and identity until a
perfect result enables direct travel or saving the destination.^8

This directly answers why EVE should not be avoided. MASSFRONT should borrow:

- a wide system overview with current location, destination, and bearing;
- rough contacts that become named, selectable targets after scanning;
- focus and recenter controls that never destroy spatial context;
- clear differences between a visible anomaly and a hidden signature;
- one list and one spatial view sharing the same selection;
- higher danger producing better opportunities and harder RTS missions.

MASSFRONT should not borrow:

- a multi-window desktop cockpit;
- ship fitting with hundreds of interchangeable modules;
- long manual transit or empty travel time;
- market, industry, insurance, sovereignty, and logistics simulations;
- mandatory online persistence for basic progression;
- unexplained specialist vocabulary.

The distinction is agency versus complexity. Spatial agency makes exploration
feel real. Systemic breadth that does not strengthen the RTS loop makes the app
feel bloated.

## Recommended player loop

### 1. Coordinated launch

The updater owns readiness first. The title surface then hands off to identity
and a stable UGA home. A player must never see two competing loaders, a complete
bar while interaction is unsafe, or a late optional model failure repainting a
fatal screen over a usable interface.

The canonical owner MASSFRONT wordmark is used on every loading family. Tactical
and UGA loaders may show different facts, but their hierarchy, typography,
progress behavior, fallback, and recovery actions should feel like one product.

### 2. Persistent UGA home

The normal landing state is the player's ship and strategic home, not immediate
free flight and not a second main menu. The first screen should answer:

- **Front:** where is the current threat or opportunity?
- **Next action:** scan, inspect operation, resume deployment, or review result.
- **Readiness:** commander, probes/fuel, and deployment capacity.
- **Progress:** one concise upgrade or research state.

The old dashboard composition can serve this summary. It should use one primary
action and a five-destination mobile dock: Play, Ship, Progress, Social, More.
Classic and offline play remain reachable within one shallow step.

### 3. Depart and orient

Leaving UGA is deliberate. The default camera is the farthest practical
gameplay view, with medium as the closest routine view. It centers enough empty
space ahead of the ship to show heading and destination rather than presenting
a decorative close-up.

Portrait and landscape both need:

- ship marker and forward heading;
- selected target, route line, and distance;
- protected, contested, enemy, and unknown control states;
- off-screen bearing indicator;
- focus target and recenter ship actions;
- touch orbit/pan and bounded pinch zoom;
- no gesture conflict with bottom navigation or system cards.

Travel should be short and interactive. Autopilot can compress routine distance;
manual alignment and piloting provide presence without becoming a waiting game.

### 4. Scan and resolve

Entering orbit presents the planet far enough out to see the whole globe and its
orientation. The player rotates beneath a fixed scanner, follows visual/audio
signal strength, and spends a probe only after a valid lock.

Every successful scan resolves into one of three result cards:

| Result | Immediate value | Required next action |
|---|---|---|
| Resource deposit | Credits, alloys, components, samples, fuel, or research | Apply to Ship/Progress or continue survey |
| Mission anomaly | Named area, enemy/control state, objective, environment | Inspect Region |
| Combined find | Resource recovery plus operation reveal | Inspect Region, with reward already settled |

The card must replace the generic scan control long enough to establish cause
and effect. It then offers one emphasized action. **Close** and **Return to UGA**
remain available, but no completed scan returns silently to an unchanged panel.

### 5. Planet, control region, playable map

The spatial hierarchy is explicit and truthful:

`System → Planet/body → Control region/site → Playable map → Drop zone`

These are decisions, not repeated labels. The planet establishes fiction and
control; the region establishes objective and environmental risk; the playable
map establishes battlefield footprint; the drop zone establishes the opening
tactical position.

Internal terrain reuse is acceptable, but the UI must not rename Veyra as
Nordhall or Karak as Vespera. Strategic identity and underlying terrain preset
are separate fields. The chosen map identifier must travel in the secured
ground-operation request and be validated against that mission's allowlist.
The tactical bridge must never silently append `_medium` after the player has
made a different choice.

For a phone, show no more than three map choices at once:

- **Compact:** faster battle, tighter resources, lower force cap;
- **Standard:** intended baseline and default;
- **Large:** longer battle, wider economy, higher force cap when supported.

If only one map is currently authored and verified, show that one truthfully as
Standard rather than drawing disabled fake choices.

### 6. Prepare and deploy

Preparation follows the Helldivers clarity model while keeping MASSFRONT's RTS
semantics:

1. operation and difficulty;
2. playable map and drop zone;
3. eligible commander;
4. starting units/structures;
5. doctrine and orbital support;
6. solo/AI ally/human co-op availability;
7. deploy.

Unavailable choices state one actionable blocker. Human co-op and Versus remain
visibly unavailable until a real authenticated synchronized-session adapter
exists. Relabeling a local ally slot is not multiplayer.

### 7. Play the warfare RTS

The deployment opens the existing real battle with the selected commander,
force, map, objective, opponent, and support. The space layer does not simplify
away building, resource management, unit control, abilities, rally orders, or
victory conditions.

Touch behavior is a release gate: a commander tap selects without opening an
info panel, an ability button arms/fires that ability rather than issuing a move,
and rally feedback moves at a readable stable speed.

### 8. Settle and return

Victory or defeat produces one result receipt. Rewards, injuries, control, and
progression apply exactly once across reloads and result-URL replay. The player
returns to UGA at the same strategic context with a concise explanation of what
changed and one next action.

The reward is incomplete until its use is visible. Samples point to research,
alloys/components to upgrades or crafting, recovered intelligence to the newly
revealed region, and commander injuries to recovery/personnel.

## Mobile information architecture

### Global destinations

| Dock item | Primary content | Secondary content |
|---|---|---|
| Play | Current front, scan, operations, Classic | Training and supported Versus |
| Ship | Sectional ship, facilities, readiness | Fuel, probes, construction |
| Progress | Research, development, contracts | Rewards and campaign record |
| Social | Friends, party, inbox | Offline/disconnected state |
| More | Settings, profile, help, accessibility | Version and recovery tools |

The dock should remain available in UGA service views. Full-screen travel,
survey, galaxy, and deployment states may replace it, but must show explicit
Back and UGA/Home recovery controls. Android/browser Back follows the same state
hierarchy instead of exiting or doing nothing.

### Density rules

- One title, one sentence or less, and one primary action per mobile panel.
- Use progressive disclosure for lore and detailed statistics.
- Keep interactive targets at least 44 by 44 logical pixels.
- Avoid nested scrolling; one panel owns vertical scroll at a time.
- Reserve selection borders for actual selection/focus.
- Keep passive top/resource rails visually quieter than action cards.
- Do not repeat control, threat, and objective text in three adjacent panels.
- At 125–200% UI scale, reflow secondary data rather than clipping it.

## Art and interface system

The supplied GUI pack is suitable for structural framing when each component is
used according to its declared role. Use its 2× assets through density-aware
`image-set` for crisp phone rendering and preserve transparent centers. The
runtime text, values, icons, progress fills, focus state, and hit targets remain
separate DOM layers.

The correct hierarchy is:

1. restrained translucent backing where contrast is needed;
2. role-correct frame or rail;
3. live 3D/map/portrait content;
4. canonical icon and runtime copy;
5. explicit selected/focus/damaged state only when true.

Do not use unit-selection frames as generic top bars, inspectors, or passive
containers. Do not stretch an illustrated composition into a panel. Do not use
generated wordmarks, invented crests, or unresolved portraits. The existing
MASSFRONT logo, commander bindings, command atlas, and exact model thumbnails
remain authoritative.

## Anti-bloat budget

UGA earns its place only if each system closes into the RTS loop. Apply these
tests before adding or retaining a feature:

| Test | Keep when | Cut or defer when |
|---|---|---|
| Tactical consequence | Changes units, map, objective, commander, support, or enemy pressure | Produces only a collectible number |
| Strategic clarity | Helps choose the next intervention | Creates another dashboard to monitor |
| Mobile interaction | Works with one-thumb targets and shallow navigation | Requires desktop window management |
| Offline value | Preserves useful local progression | Exists only to imitate a live-service feed |
| Content leverage | Reuses verified RTS maps while preserving truthful identity | Requires a parallel combat engine |
| Recovery | Can be backed out of or resumed safely | Can strand the player or corrupt a pending result |

The space layer should not add ship-to-ship combat in this release. Piloting,
route choice, scanning, and war-front context already provide meaningful space
agency. A second combat engine would compete with the RTS for controls, balance,
assets, performance, and player attention.

## Offline, social, and live-front policy

The same UGA shell supports both local and connected play:

- **Offline:** a deterministic local front advances through scans, travel, and
  mission results. Campaign, Classic, ship progression, and earned rewards work.
- **Connected:** server-authoritative regional pressure and community outcomes
  can replace or merge with the local presentation only after identity and
  exactly-once settlement are secured.
- **Co-op:** friends can join an operation only through a real session contract
  binding map, objective, rosters, simulation state, and result authority.
- **Disconnected:** online actions show a short state and recovery choice, while
  offline progression remains visible.

This preserves the Helldivers-style feeling of a shared front without making a
network outage erase the game.

## Acceptance targets

The redesign is not accepted by static screenshots. A source and freshly packed
runtime must demonstrate one continuous hardware-GPU session:

1. updater/title to interactive UGA with no loader overlap;
2. Settings, Back, Home/UGA, Exit, and fatal/retry recovery where appropriate;
3. portrait and landscape travel with heading, destination, wide zoom, and
   recenter;
4. a fresh valid scan producing resources and/or a named operation plus an
   immediate next action;
5. visible planet, region/control, and explicit playable-map selection;
6. commander/loadout validation and real RTS deployment;
7. unit selection, movement, rally, and ability behavior during combat;
8. victory and defeat receipts applied exactly once;
9. return to the same UGA career context after reload;
10. Classic, Social, Settings, and offline entry still reachable;
11. canonical logo and intended GUI assets load at source and packed hashes;
12. forced logo, optional 3D asset, and network failures retain legible recovery.

Capture 344×760, 412×900, 915×412, 1024×768, and 1920×1080 where the state is
responsive, plus 100%, 125%, 150%, and 200% UI scale for critical menu/HUD
states. Inspect the screenshots for clipping, overlap, false selection borders,
obstructed gameplay, unreadable scale, and inappropriate close framing. Browser
emulation is evidence for that browser configuration, not a claim of physical
Android or Safari-device testing.

## Sources

1. Arrowhead Game Studios / PlayStation Blog. “[Helldivers 2 Galactic War gameplay detailed: complete missions, reclaim planets, rescue the galaxy](https://blog.playstation.com/2024/01/23/helldivers-2-galactic-war-gameplay-detailed-complete-missions-reclaim-planets-rescue-the-galaxy/).” January 23, 2024.
2. PlayStation Blog. “[Helldivers 2 hands-on report: Chaotic co-op and empowering Stratagems](https://blog.playstation.com/2024/02/02/helldivers-2-hands-on-report-chaotic-co-op-and-empowering-stratagems/).” February 2, 2024.
3. Electronic Arts / BioWare. “[Mass Effect 2 PC Manual](https://eaassets-a.akamaihd.net/eahelp/manuals/mass-effect-2-manuals_PC.pdf).” 2010, pp. 8–9.
4. Feral Interactive. “[XCOM 2 Manual](https://feralinteractive.com/en/manuals/xcom2/latest/steam/).” Sections “Tactical Layer” and “Geoscape.”
5. 2K. “[XCOM 2](https://store.2k.com/game/buy-xcom-2-pc).” Key features: “Each Mission Is a Unique Challenge” and “Research, Develop and Upgrade.”
6. Blizzard Entertainment. “[Welcome to StarCraft II: Wings of Liberty](https://news.blizzard.com/en-us/article/117470/welcome-to-starcraft-ii-wings-of-liberty).” Campaign overview.
7. CCP Games. “[Scanning and Probing Changes in Parallax](https://www.eveonline.com/news/view/scanning-and-probing-changes-in-parallax).” November 4, 2015.
8. CCP Games. “[Sensor Overlay Changes in EVE Odyssey](https://www.eveonline.com/news/view/sensor-overlay-changes-in-eve-odyssey).” June 3, 2013.
