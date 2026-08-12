# MASSFRONT — RTS balance and onboarding next pass

**Audit date:** 2026-08-11  
**Evidence:** `node tools/extract-design-db.mjs` (app version `1.33.8`, 36
units, 31 structures, 25 account-research nodes, 56 maps) plus the live
simulation and AI code. This is a design-and-balance plan only; no balance
values were changed by this audit.

## Executive call

The foundation is stronger than the UI currently communicates. Standard already
has a dedicated training mode, three map sizes, explicit AI opening grace,
faction commanders, finite three-tier resources, salvage, and a bounded
population model. The next pass should **make the first two minutes legible and
different by faction**, then fix the two systemic balance debts: the Rhino's
value and the Brood's shared-chassis production logic.

Do not add more early systems until a new player can answer, at a glance:

1. What should I build next?
2. Which enemy pressure is coming, and when?
3. Which unit counters it?
4. What makes this faction play differently?
5. What field objective is worth leaving my base for?

## Current state — verified

### Opening economy and pressure

- `resetWorld()` seeds both teams at **260 mass / 1,000 energy**. The deployed
  HQ produces **5 mass / 26 energy per second**, in addition to the 0.6 / 2
  baseline (`src/game/economy.js`).
- The default **Prepared Landing** creates HQ, Commander, Constructor, Reactor
  and Factory; Expedition deliberately starts only HQ + Constructor
  (`src/main.js`, `DEPLOYMENT_PACKAGES`, `deployCarrier()`). The selected package
  is explicit, not an invisible difficulty multiplier.
- A first Reactor + Extractor + Factory costs **215 mass / 500 energy** in
  nominal costs, leaving a prepared or expedition player enough reserve to
  begin a sensible opening. Extractors need deposits; Geo Plants need geysers.
- Every start receives three nearby mass nodes and one nearby geyser through
  `setupDeposits()`. Deposits and geysers have visible/finite tiers, so expansion
  is a real long-match decision rather than an infinite-income race.
- Standard's first enemy-wave grace is **180 / 120 / 75 seconds** for
  Easy / Normal / Hard. Harassment is scheduled 60 seconds later
  (`src/game/ai.js`). This is a good contract, but the current UI must make the
  selected clock and first-contact route impossible to miss.
- The AI begins with a Commander, Reactor, Factory, one Extractor, difficulty
  guards, and escalating structures. Its economy, health, damage and build rate
  scale from the match clock, not from player success. Easy caps below economic
  parity; behind-state territory softens the ramp (`aiThreat()`).
- Map size is already meaningful: Compact / Standard / Large are 2.2 / 2.6 /
  3.2 km theatres, allow 2 / 3 / 4 factions respectively, and scale resource
  fields and hazards (`src/main.js`). Population remains 1,000 per faction;
  wildlife is separately governed by map/difficulty caps (`src/game/sim.js`).

### Faction identity

- **Playable:** Nova, Crimson Dominion, Syndicate Coalition. **Brood remains
  AI-only**, as required (`playableFactions()`).
- Nova has 6% lower unit costs and 12% faster construction. Its commander set
  reinforces precision fire, forward engineering, and reconnaissance.
- Dominion gains a ramping +18% sustained-combat bonus; its faction research
  reinforces artillery, denser formations, and temporary artillery overcharge.
- Syndicate gains +18% output from claimed nodes/salvage; its faction research
  reinforces energy efficiency, scout/air marking, and transport range.
- Per-faction command rosters are substantive: each has three passives, a
  signature active, and primary/secondary weapons (`src/factions.js`).
- The production filter is not merely cosmetic: Dominion and Syndicate each
  have their own legal factory, airfield and harbor rosters
  (`FAC_ARSENAL` in `src/factiondoctrine.js`).

### Unit roles and balance signals

- The basic role triangle exists: infantry/skirmish, vehicle, anti-tank,
  artillery, anti-air, area denial, support, air, naval, experimental and
  transport. Production UI already groups the roster by these roles.
- Weapon languages are differentiated in data: projectile, beam/energy,
  missile, explosive, gauss, flame, sonic and Brood splash. Commanders add
  faction-specific primary/secondary weapon profiles.
- **Known numeric outlier:** the Rhino is still the strongest low-tier
  efficiency package. The main handoff records 0.702 damage-per-cost and 7.95
  health-per-cost, well beyond the normal early armour band. It risks making
  Striker/Constructor openings look like a mistake.
- The production data contains a deeper identity mismatch: the Brood AI's
  factory fallback still selects shared chassis IDs such as 0, 9, 20 and 21 in
  `src/game/ai.js`, while lore says the Brood uses no machines. The renderer can
  keep its biological visual identity, but its *economy and role language* is
  still partially shared. This must be corrected before making the Brood
  playable.

### Recovery, salvage and long-game economy

- Wrecks are typed: gear, machine scrap, heavy armor, structures, ruins,
  biomass, air and naval. Human remains drop gear/blood representation; Brood
  remains are biomass. Wreck reclamation is bounded to 460 fields, and stains
  to 180 (`src/game/sim.js`).
- Constructors reclaim twice as fast as ordinary units; Fabricators reclaim at
  range. The explicit salvage order can target neutral relics, and Constructors
  dismantle them with a visible deconstruction beam. This is now implemented;
  it needs phone QA and a clearer command affordance, not a second parallel
  salvage system.
- Account research has 16 universal nodes, three Dominion nodes, three
  Syndicate nodes, and three intentionally non-purchasable Brood dossier nodes.
  Account research pays from committed wins **and losses**, avoiding a research
  deadlock. Modules have durations, so account power carries an ongoing choice.

## Problems to solve next

### P0 — make the opening readable, not merely safe

The opening numbers are forgiving, but a new player still encounters an HQ,
Commander, deployment package, resource nodes, build territory, production,
two resource streams, tech, fog, and an enemy timer at once. Prepared Landing
helps mechanically; it does not sufficiently teach **why** the first decisions
matter.

**Proposed change:** replace the current first-Standard overlay with a
three-card *First Contact Brief* that appears only for the first three Standard
matches and collapses after deployment:

| Moment | One required read | One suggested action | Success signal |
|---|---|---|---|
| Landing | First Contact timer + enemy doctrine | Build or confirm power | green stable-grid state |
| Minute 0–1 | nearest phase field | place / protect extractor | income card ticks upward |
| Minute 1–2 | first contact lane + enemy role | queue the counter shown as a role icon | counter badge and rally line |

- The player may dismiss this immediately. It must never lock input, duplicate
  the Tutorial, or cover the minimap.
- Default first-time selection: **Prepared Landing, Easy, one Balanced enemy,
  infestation off**. Expedition, Hard, modifiers and multi-faction are visible
  but labeled Advanced.
- Make the First Contact banner actionable: tap opens a tiny enemy dossier that
  contains faction, behavior, first likely counters and time-to-contact. Do not
  make users hunt a submenu.

**Acceptance metric:** in a recorded first Standard match, a player can create
power, secure one mass field, queue a combat unit and identify the first attack
lane without opening more than one full-screen menu.

### P0 — separate faction *decisions*, not only stats and skins

The live doctrine system is a solid start. Nova is still effectively the broad
default roster, and the Brood uses shared production roles. The next step is
one unmistakable early decision per faction.

| Faction | Current identity | Proposed first-two-minute decision | Do not do |
|---|---|---|---|
| Nova | cheaper production, faster builds, combined arms | choose **Secure Line** (faster hardening/repairs) or **Forward Screen** (scout/rally vision) at HQ; both remain modest | do not give free unit stats to every Nova body |
| Dominion | sustained fire, artillery/formation doctrine | choose a **Siege stance** for a selected artillery group or a **Breach order** for armor; show setup/recovery visibly | do not solve identity with universal red glow or pure damage multipliers |
| Syndicate | efficiency, marks, high-tech mobility | choose **Survey mesh** (scouting/marking) or **Grid routing** (active-energy efficiency) based on map | do not hide the advantage in a passive income scalar |
| Brood AI-only | tide, biological utility, structure pressure | replace shared factory-roll logic with caste spawn pools: runner, rending swarm, anti-air organism, caster, massflesh | do not call a recolored chassis a Brood unit or expose Brood player tech early |

Keep these as operational choices with a cooldown, position requirement or
energy cost. They should change commands and map play, not just increase DPS.

### P0 — repair the low-tier choice set

1. **Rhino:** run a 2-minute controlled opening benchmark against Striker,
   Constructor + early economy, and Rhino-first. Adjust **one variable at a
   time**—prefer its mass/energy/build-time cost before changing damage or HP.
   Target: Rhino is the durable early anchor, not the default answer to every
   role.
2. **Striker:** preserve its cheap, fast, disposable role. Its counter-value
   needs to appear in the unit preview: “beats unescorted artillery / loses to
   armor,” backed by actual target/armor multipliers rather than text alone.
3. **Support:** Constructor, Warden and Prospector currently have distinct
   mechanics but compete for a player's attention. Pin a short purpose tag in
   production: `BUILD + RECLAIM`, `HEAL`, `MINE + SCOUT`. Use an icon and one
   sentence, not a stat wall.
4. **Artillery:** retain slow, arcing, off-camera ballistic shots, minimum
   range and strong splash. Add explicit danger indicators for minimum range
   and friendly clustering before changing its numbers.

### P1 — make map control the economy lesson

Maps already provide fair nearby nodes, three resource tiers, finite capacity,
hazards and city salvage. The player needs a visible *reason to leave the HQ*.

- Add exactly one early contested objective at a time: a rich phase field,
  neutral city salvage block, or geo vent. Its reward type should match the
  chosen faction's early operational decision.
- Present depleted nodes as an understandable route change: node tier icon,
  remaining tier segments, and a suggested next known/scouted target.
- Keep city salvage an opt-in order. Constructors should never silently raze
  civilian structures just because they stand nearby.
- Each map metadata record should declare: **opening lane, first contest,
  intended power position, and hazard lesson**. That metadata should drive both
  the cinematic briefing and the AI behavior recommendation—not random scenery.

### P1 — better AI through disclosed doctrine

The AI's current behavior types—Balanced, Land, Air, Naval, Rush and Turtle—do
shape construction, production and wave cadence. That is the correct basis.
The player currently has too little prediction of it.

**Proposed changes:**

- Show each enabled AI slot as `Faction + Behavior + Difficulty + start zone`.
  The initial scouting report should reveal the behavior but not a full build
  queue.
- Give each behavior one counter-teachable telegraph before the first wave:
  Land = armored column, Air = airfield contact, Naval = harbor radio call,
  Rush = shorter warning with cheap signatures, Turtle = shield/scanner
  signature.
- Establish per-behavior 10/20-minute scorecards: army value, build mix,
  number of useful attacks, attack composition, recovery time and defeat cause.
  Tune from those records, not anecdotes.
- Preserve the explicit muster requirement and wave retention rule. Do not
  return to small timed suicide waves.

### P1 — account progression must explain a session payoff

Research and modules have useful foundations but are multi-layered for a player
who has not yet learned the base game.

- First three match rewards should show only three buckets: **account rank,
  research data, and materials recovered**. Expand a detail drawer only on
  demand.
- The Research Complex should visibly show its live match contribution and the
  account-tree category it is feeding. It should not imply that account research
  is the same as session tech.
- Keep Brood tree entries as a locked intelligence dossier; never offer them as
  purchasable player progress while Brood remains AI-only.

## Phased implementation order

1. **Instrumentation first (no balance changes):** add match telemetry for
   first build, first unit, first extractor, first loss, first contact,
   resource stall time, selection/production failures, faction, difficulty,
   map size and AI behavior. Store locally until server authority is in scope.
2. **First Contact Brief:** one small persistent, non-modal first-match guide;
   entry/exit animation and phone QA. Keep Tutorial mode untouched.
3. **Production role clarity:** counter tags, support purpose tags and enemy
   behavior telegraphs. Verify 412×915 layout with a full notification feed.
4. **Rhino benchmark:** scripted 2-minute simulations with fixed resource
   supply, terrain and command choices; adjust one economic variable, repeat.
5. **Faction micro-decisions:** implement Nova, Dominion and Syndicate choices
   one faction at a time, each with an AI and UI explanation.
6. **Brood production redesign:** create biological caste data and AI spawn
   pools before any Brood-playable work. Validate no shared mechanical model,
   name, weapon or structure is exposed by a Brood route.
7. **Map-intent metadata and city/resource objectives:** attach authored
   strategic purpose to the existing 56 maps, starting with one compact, one
   standard and one large map.
8. **Difficulty/AI tuning pass:** use telemetry and 2-minute/10-minute
   deterministic scenarios. Only then retune clocks, composition, income or
   build speed.

## Test gates for any implementation

- `node tools/bundle.mjs` after every source edit.
- Run `node tools/extract-design-db.mjs` after balance-table changes and save a
  before/after diff of relevant units/buildings/research.
- Keep an automated first-contact smoke run under two minutes at 412×915:
  Prepared and Expedition; Easy and Normal; one Land and one Rush AI.
- Capture one screenshot each at deployment, 60 seconds and first contact. The
  test must assert that the next objective, resource state, enemy warning and
  production choice do not overlap.
- For balance, test **win rate, time-to-first-loss, economy stall duration,
  army value at first contact, and device frame time**. Do not judge from one
  showcase battle.

## Out of scope for this pass

- Publishing, server-authoritative economy, paid checkout, Co-op Versus,
  matchmaking and MMO deployment.
- Making Brood selectable.
- Replacing the material/rendering pipeline or changing V2 art contracts.
- Global stat inflation to create apparent faction uniqueness.
