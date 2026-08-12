# MASSFRONT reference screenshot design breakdown

Status: reference audit and implementation direction, 2026-08-03.

This document converts the user-supplied screenshots into a production plan for
MASSFRONT. It is not a request to copy another game's visual skin. It identifies
why the references communicate well, what would fail on a phone, and how the
same principles should become native MASSFRONT systems.

It complements, rather than replaces:

- docs/UI_SYSTEM_BLUEPRINT.md
- docs/MULTI_STAGE_PRODUCTION_PLAN.md
- docs/TUTORIAL_STAGE6_AUDIT.md
- design/faction-production-matrix.md
- design/tower-factions/catalog.json

The implementation rule is simple: battlefield clarity comes first, faction
identity second, and RPG depth third. Meta systems are valuable only when they
create new tactical choices in the next match.

## 1. Executive decisions

1. **Show the object, role, cost, and consequence together.** The best supplied
   references make a selected tree, building, module, ship, mission, or research
   node tangible. MASSFRONT should stop asking an icon and two lines of text to
   carry an entire system.
2. **Faction identity must affect silhouette, movement, construction, weapons,
   effects, audio, UI framing, economy, and tactics at once.** A recolored shared
   chassis is not a distinct faction.
3. **The contact sheets are art direction, not shippable asset sheets.** They are
   useful for silhouette families, weapon roles, and material language. Their
   inconsistent labels, perspective, scale, fine detail, and AI-concept
   artifacts must not become runtime truth.
4. **Desktop information architecture must become phone drill-down.** Never
   shrink EVE-style window density onto a 360-pixel display. Preserve its
   object-centred logic using a preview, a short stat summary, a detail sheet,
   and one primary action.
5. **The first operation must teach the game in the game.** The existing
   state-driven Field Orientation is a strong foundation. Present it as a
   protected tutorial mission with a commander, briefing, visible objectives,
   build-purpose explanations, and a real debrief.
6. **Large maps need decisions, not empty travel time.** Add resource routes,
   ridges, cities, collapse zones, storms, neutral objectives, pickups, and
   concealed enemy starts. Every large region needs a reason to enter, fortify,
   flank, or avoid it.
7. **RPG progression should widen choices, not simply stack percentages.**
   Gear, doctrine, and unit ability unlocks should enable different tactics.
   Competitive skirmish should have a normalized option so career power never
   invalidates strategy.

## 2. Reference audit

The same images were uploaded more than once. Duplicates were compared by
SHA-256 and counted once. Short hashes below identify the exact audited files.
The three tower sheets are also preserved in design/tower-factions/source and
their extracted panels are catalogued in design/tower-factions/catalog.json.

| Reference family | Attachment ID / short SHA-256 | What it contributes |
|---|---|---|
| High-detail Gauss tower A | 71cd2bd9.../1-Photo-1.jpg · 15FEBA02E061 | PBR target, hard-surface hierarchy, readable muzzle and platform |
| High-detail Gauss tower B | 71cd2bd9.../2-Photo-2.jpg · C3D3EE9A1E2D | Alternate proportions, larger turret-to-base ratio, layered barrel |
| Tower sheet: batch 2 | 47e6bef8.../1-Photo-1.jpg · 6AD40F0DF3B5 | Three faction rows and eight distinct defensive roles |
| Tower sheet: faction bible | 47e6bef8.../2-Photo-2.jpg · 32656529A69F | Alternate names/colors and faction-card framing |
| Tower sheet: structures | 47e6bef8.../3-Photo-3.jpg · 2532430229BD | Utility defenses, barriers, repair, shield, production concepts |
| Crimson Dominion dossier | 77fb50b9.../1-Photo-1.jpg · 3B5FB7D3CB1A | Heavy assault/siege roster and red authoritarian identity |
| Void Swarm dossier | 77fb50b9.../2-Photo-2.jpg · F924D55F6962 | Fully biological roster, growth structures, mutation doctrine |
| Emerald Triad dossier | 77fb50b9.../3-Photo-3.jpg · 47D74E8CB00F | Autonomous constructs, fields, drones, precision control |
| Terran Frontline dossier | 77fb50b9.../4-Photo-4.jpg · C1BDBCEADA50 | Blue combined arms, advanced energy tech, defensive logistics |
| RTS building subsystem | 77fb50b9.../5-Photo-5.jpg · C35A0F8672CC | Contextual building interaction and persistent command panel |
| RTS resource gathering | e7993063.../1-Photo-1.jpg · FB2ED076AD86 | World highlighting, target health/yield, worker order feedback |
| RTS building upgrade | e7993063.../2-Photo-2.jpg · F392E522D363 | Selected-object outline, tier change, cost and action context |
| Inventory/recycling | e7993063.../3-Photo-3.jpg · 2F62E1D04135 | Item categories, central preview, ingredients, storage ledger |
| EVE fitting/assets | e7993063.../4-Photo-4.jpg · 1CCF898271A4 | Object-first loadout, slot topology, calculated outcomes |
| EVE mission briefing | e7993063.../5-Photo-5.jpg · 7083ECFC1528 | Character identity, objectives, fixed and bonus rewards |
| Activity/mission directory | bbe0ecb2.../2-Photo-2.jpg · F709B82329A7 | Mission families, state, portrait thumbnails, current objective |
| Branching research tree | bbe0ecb2.../3-Photo-3.jpg · 323F847793A0 | Dependency graph, era progression, visible queued research |
| Categorized research | bbe0ecb2.../4-Photo-4.jpg · 6D782539A26F | Doctrine categories and compact dependency lanes |
| Billboard beam example | b40a1d9e.../1-Photo-1.jpg · EA9AD902AE90 | Layered beam core, edge noise, emitter and impact distinction |
| Beam collection reference | e4f1f26e.../1-Photo-1.jpg · 2389D84B0FDF | Weapon-family differentiation through color, width, trail, glyph |
| City deployment bug reference | 058a0e3a.../2-Photo-2.jpg · C96EE4B383EB | Ship/building intersection, unclear legal landing area |
| Crowded combat HUD reference | accc7a3c.../1-Photo-1.jpg · 76FA03CEC10D | Evidence of command overlap, safe-area pressure, weak hierarchy |

Other screenshots in the thread document updater, account sync, back-navigation,
tap-target, save export, and safe-area defects. Those are product evidence rather
than visual inspiration; their requirements are already captured in
docs/UI_SYSTEM_BLUEPRINT.md and the handoff documents.

### Audit limitations

- A screenshot proves presentation, not underlying rules. Strong/weak claims
  must be validated against the actual simulation and design database.
- Concept sheets contain labels and silhouettes that disagree between versions.
  The catalog may preserve alternatives, but only one runtime definition can be
  canonical.
- Reference art can imply detail that disappears at battlefield camera height.
  Production models must be judged at real phone zoom, not only in a hero render.
- No third-party asset ownership or reuse right is inferred from a screenshot.
  It is a direction reference unless a licensed source file is separately
  documented.

## 3. What each reference family teaches

### 3.1 Faction dossiers

**Visible strengths**

- One dominant hue, crest, portrait, motto, doctrine summary, explicit strengths
  and weaknesses, then separate unit and structure grids.
- Every roster entry has an image, name, and one-sentence battlefield purpose.
- The page answers three questions quickly: who are they, how do they fight, and
  what will I see?

**Why it works**

- Silhouette and role are learned together.
- A portrait turns a rules package into an opponent with intent.
- “Good at / weak against” helps a player form a plan before memorizing stats.
- Repetition makes faction language legible: blue precision, red mass, green
  phase technology, purple/organic growth.

**What should not be copied**

- Ten tiny roster cards are too dense for portrait phones.
- Several names and rows disagree with the live roster and with other sheets.
- The layouts imply every faction has equivalent one-for-one units. MASSFRONT
  will feel more distinct if some roles are asymmetric or absent.
- Color alone cannot carry identity for color-blind players or in fog.

**Mobile-safe MASSFRONT adaptation**

- Faction header: crest, commander portrait, one-line doctrine, two strength
  icons, two vulnerability icons.
- Two tabs only: UNITS and STRUCTURES. Use a two-column card grid in portrait.
- Tapping a card opens an in-place detail sheet with a rotating live model,
  role, targets, counters, ability, costs, prerequisites, and an audio preview.
- Use shape-backed role icons: anti-light burst, anti-heavy penetrator, air
  denial, control, support, artillery, economy, production, detection.
- Every preview reads from the same definition as combat. Flavor copy may enrich
  the rule; it may not invent one.

### 3.2 Tower contact sheets and Gauss hero renders

**Visible strengths**

- The tower's weapon dominates its silhouette.
- Bases are broad enough to imply stability, rotation, ammunition, power, and
  tier growth.
- The high-detail references use large primary armor masses, medium mechanical
  assemblies, then sparse small details. Recessed joints, edge highlights,
  baked occlusion, emissive capacitors, and a real inner barrel prevent the
  “flat toy” look.
- Each weapon family promises a different response: single-shot kinetic,
  napalm cone, tracking AA, chain lightning, continuous beam, mortar arc,
  rapid autocannon, vertical missile.

**Why it works**

- A player can guess behavior before reading the label.
- Oversized barrels and emitters survive RTS camera distance.
- The platform tells the eye where the tower rotates and where recoil goes.
- Material separation creates depth without relying on excessive geometry.

**Production adaptation**

- Build each tower from three authored groups: foundation, traverse, weapon.
  Moving parts and muzzle origins must be explicit, not guessed from bounds.
- Make the turret larger than the early experiments and reduce base visual
  noise. The weapon should occupy roughly half the projected height for a
  direct-fire tower.
- Model hollow muzzles with an inner barrel or dark receiver cavity.
- Give faces consistent texel density. Cylinders need seam-aware unwraps;
  stretched automatic projection is not acceptable on the hero LOD.
- Use faction atlases and material masks rather than assigning the same noisy
  metal material to every part.
- Bake AO into the atlas, but keep normal, roughness/metallic/occlusion, and
  emissive masks separable enough for the mobile shader.
- Tier upgrades must change silhouette and function: extra capacitor, barrel,
  missile cell, cooling assembly, sac, tendril, drone ring, or armor buttress.
  A color shift alone is not a tier.
- Use the live model renderer to produce card thumbnails after the model is
  approved. Do not reuse the concept-panel crop as the final build icon.

**Suggested mobile asset tiers**

| Use | Geometry and texture direction |
|---|---|
| Battlefield far LOD | Role silhouette, muzzle, faction mark; 10–20% of hero geometry |
| Battlefield near LOD | Approximately 1.5k–4k triangles per unit and 3k–8k per major structure, adjusted by on-screen count |
| Codex/preview LOD | Approximately 10k–25k for a hero structure if loaded only in menus |
| Texture | Shared faction atlas; 512px common props, 1024px landmark/preview families; base color + packed ORM + normal + emissive mask |

Those numbers are starting budgets, not guarantees. Aggregate on-screen frame
cost decides the final budget.

### 3.3 Resource gathering and building upgrades

**Visible strengths**

- The selected world object receives a bright outline.
- The command panel names the object, shows remaining health/yield, and exposes
  actions tied to it.
- Upgrade UI shows cost, build time, the next level, and what changes.
- The world visibly changes when construction or an upgrade happens.

**Why it works**

- The player never has to guess whether they selected the worker, resource, or
  building.
- Resource gathering becomes an order with a target and duration rather than a
  passive number ticking at the top.
- A building's progress has visual meaning.

**MASSFRONT adaptation**

- Tap a deposit: show resource type, remaining yield, extraction rate, hazard,
  owner, and nearest eligible constructor. Primary action: BUILD EXTRACTOR.
- Tap an Extractor: show connected deposit, storage state, income rate,
  contested status, and upgrade/fortify action.
- Add 0%, 50%, and complete construction silhouettes; add distinct T1/T2/T3
  visual states for high-value economy, production, and defense structures.
- Selected-object outline should be thin and faction colored. Enemy/neutral
  targets use shape plus color so accessibility never depends on hue alone.
- Keep the object card in a bottom sheet occupying at most about one third of
  portrait height, with one row of contextual actions.

### 3.4 Inventory and recycling reference

**Visible strengths**

- Categories and owned items are separated from the selected item's large
  preview and from the resource ledger.
- Recycling communicates inputs, output, minimum batch, storage constraints,
  and the selected object's identity.
- Rarity and compatibility are visible at scan speed.

**Why it works**

- The player understands both the item and the economic transaction before
  committing.
- A central preview gives loot emotional weight.

**What fails on mobile**

- Three simultaneous columns, tiny filter icons, hover tooltips, keyboard
  shortcuts, and long ledgers are desktop-only.

**MASSFRONT adaptation**

- Top level: UPGRADES, GEAR, SUPPLIES, IDENTITY.
- Within a category: filter chips, two-column item grid, then a bottom detail
  sheet. Never show inventory list, 3D preview, and full resource storage at the
  same time on a phone.
- Rarity system: Common gray, Uncommon green, Rare blue, Epic violet, Legendary
  gold. Also use border shape/pips so rarity is not color-only.
- Gear detail: live commander/HQ part preview, role, current-versus-equipped
  change, durability, source, and one EQUIP action.
- Recycle/salvage is a later action inside the item detail. It must preview
  guaranteed return and warn only when the item is equipped, favorited, or rare.

### 3.5 EVE fitting and asset-management reference

**Visible strengths**

- The selected ship is the visual center.
- Slot locations form a spatial relationship around the object.
- Fitting changes update calculated offense, defense, energy, and mobility.
- Assets have filters, quantity, location, and ownership.

**What MASSFRONT should take**

- A commander's equipped modules should appear around a live commander or HQ
  preview.
- Loadout changes should immediately update four compact derived summaries:
  offense, defense, command/support, and energy.
- Unavailable slots remain visible and state their unlock requirement.
- Owned/equipped/new status must be visually distinct.

**What MASSFRONT should reject**

- Nested floating windows, tiny typography, horizontal desktop toolbars, and
  dozens of simultaneous values.
- A fitting mini-game so complex that it obscures the RTS. The loadout must
  change battlefield decisions, not become a spreadsheet tax.

### 3.6 Mission briefing and activity directory

**Visible strengths**

- Mission category, narrative portrait, location, objectives, fixed reward, and
  bonus reward are in one decision surface.
- A directory shows current, locked, completed, story, challenge, and daily
  content without pretending they are the same thing.
- The current objective remains visible outside the directory.

**MASSFRONT adaptation**

- Operations eventually exposes four tabs: MISSIONS, CONTRACTS, THREAT, RECORDS.
- A selected mission card shows map image, opposing commander, faction crest,
  objective, hazards, expected length, difficulty, fixed reward, bonus reward,
  and current best.
- START is the only primary action. Locked missions remain inspectable and name
  their prerequisite.
- During play, show only the active objective and one optional-objective chip.
  The full ledger stays in pause/Operations.
- Debrief uses the same mission identity and explains every reward line,
  including recovered value after defeat.

### 3.7 Research trees

**Visible strengths**

- Dependencies, branches, era/tier progression, and queued work are visible.
- Category lanes help the player reason about a build rather than reading one
  giant shop list.
- Node state is legible: locked, available, queued, completed.

**Mobile-safe adaptation**

- Keep three high-level branches: Fabrication, Doctrine, Xenology, with a
  faction-specific skin and vocabulary.
- On phones, show one branch as a vertical dependency lane. Selecting a node
  pins a compact preview above the list: current effect, next effect, cost,
  prerequisite, and unlock.
- A zoomable spatial tree can remain an optional tablet/landscape view; it is
  not the only way to access research.
- Unit-class ability unlocks belong in Doctrine. Example artillery progression:
  Passive Target Solution -> Charged Shell -> Barrage. The first new action
  should arrive early enough to enliven the mid-game, not behind the final tier.
- Avoid universal flat-stat nodes when an ability, role change, or tradeoff can
  create a more interesting choice.

### 3.8 Beam and billboard VFX

**Visible strengths**

- A bright inner core, softer colored body, noisy edge, emitter flash, impact
  flash, sparks, and a short afterimage produce depth.
- Different weapons vary more than hue: width, pulse timing, curvature, arc,
  ring glyphs, secondary strands, and impact behavior.

**MASSFRONT adaptation**

- Use camera-facing billboard strips or crossed strips for the soft body and
  particles, with a geometric or line core for aim readability.
- Pool particles and effect objects. Clamp per-weapon and global emission so a
  large battle does not become white noise or a frame spike.
- Weapon grammar:
  - Terran Frontline: hard blue-white rail/gauss cores, capacitor buildup,
    disciplined tracer spacing, sharp shield impacts.
  - Crimson Dominion: orange-red cannon flashes, heavy recoil, smoke, molten
    fragments, concussive rings.
  - Syndicate Coalition: green-violet phase ribbons, gravity distortion,
    rotating holo geometry, delayed implosion.
  - Brood Swarm: wet bile arcs, thorn trails, spores, mucus strands, expanding
    sonic membranes; never machined laser hardware.
- Critical damage uses stateful emitters: intermittent sparks for machines,
  smoke and flame for heat/fuel damage, ruptured sacs/spores for Brood. Effects
  stop when repaired or destroyed.

### 3.9 City deployment and current HUD screenshots

These are negative references and therefore especially useful.

The deployment ship visibly intersects a city building. A legal landing marker
does not communicate footprint clearance, approach path, building height, or
what will be destroyed. In combat, the command HUD shows too many equally
weighted controls at once, covers the minimap, reaches the system navigation
area, and makes confirm/cancel compete with formation, group, army, select,
stop, build, move, patrol, rotation, and tilt.

**Required corrections**

- Validate the carrier's full footprint and approach corridor before enabling
  DEPLOY. Show a green projected footprint and a dotted flight path; show red
  intersection volumes for buildings, steep terrain, water, or reserved starts.
- Aircraft use an air navigation layer. They may fly above low structures,
  route around tall blockers, and must not visually pass through roofs.
- If a mission allows destructive landing, label it explicitly, preview the
  blast radius, evacuate/mark neutral structures, and apply actual damage. It
  cannot be an accidental clipping side effect.
- Use mutually exclusive command modes. The bottom command tray displays the
  four most relevant actions for the selection; an overflow sheet contains the
  rest. Confirm/cancel replace the tray only while placing or forming.
- The minimap and primary command tray never overlap.
- All controls respect device safe areas; the screen adds real bottom content
  padding, not a back button hidden under Android navigation.
- Minimum phone hit target is 48 CSS pixels with at least 6 pixels between
  peers. Visual glyphs may be smaller than their hit boxes.

## 4. Canonical four-faction identity

Do not rename the stable save and AI keys. Preserve nova, ascendancy, syndicate,
and horde in data. The reference names can be reconciled in lore without
creating a fifth faction:

| Stable key | Player-facing identity | Existing name retained as | Reference aliases absorbed |
|---|---|---|---|
| nova | Terran Frontline Command | Military arm of the Nova Federation | Terran Frontline, TFC |
| ascendancy | Crimson Dominion | State built from the Red Ascendancy movement | Crimson, Bloodward, Legion |
| syndicate | Syndicate Coalition | Coalition umbrella | Machine Ascendancy and Emerald Triad are member blocs/doctrines |
| horde | Brood Swarm | Human intelligence designation Umbral Brood | Infestation Swarm and Void Swarm are field designations |

If product wants to keep Nova Federation and Red Ascendancy as the large
headings, invert the first two labels but retain the polity/armed-branch
relationship. The important requirement is one identity per stable key and one
shared vocabulary across Codex, missions, build cards, AI, story, and saves.

### 4.1 Terran Frontline Command

- **Fantasy:** an advanced expeditionary army that wins through preparation,
  disciplined combined arms, long-range precision, shields, and logistics.
- **Silhouette:** clean modular armor, broad stable platforms, visible
  capacitors, protected joints, coherent blue-white emitters.
- **Technology:** the game's most advanced conventional energy and weapon
  engineering. Gauss, rail, Tesla, coherent beams, shield projection, guided
  missiles, battlefield networking.
- **Movement:** tracks, articulated walkers, disciplined airframes, formation
  cohesion. No improvised asymmetry.
- **Strengths:** long-range firepower, layered defenses, reliable anti-air,
  repair/support, flexible combined arms.
- **Weaknesses:** slower deployment, expensive advanced upgrades, vulnerable
  logistics and energy grid, susceptible to flank/sabotage.
- **Construction:** carrier deploys a command core; constructors assemble
  modular frames, then armor and capacitors snap into place.
- **Audio:** clear radio discipline, heavy but controlled cannons, capacitor
  charge, servo detail, short confirmation barks.
- **Commander:** Captain Elara Kai. Calm, ethical, analytical; her conflict is
  whether unity can survive emergency power.

### 4.2 Crimson Dominion

- **Fantasy:** a siege empire that ends uncertainty by making resistance
  physically impossible.
- **Silhouette:** squat mass, forward armor, oversized barrels, recoil rails,
  heat vents, banners and red command optics.
- **Technology:** kinetic penetrators, rockets, artillery, thermobaric and
  incendiary weapons, suppression fields, morale beacons.
- **Movement:** tracked assault blocks, stomping walkers, armored carriers.
  Acceleration is slow; momentum is terrifying.
- **Strengths:** frontal breakthroughs, anti-armor, siege, bombardment,
  suppression, durable elite formations.
- **Weaknesses:** expensive losses, predictable lanes, low strategic mobility,
  vulnerable flanks and disruption.
- **Construction:** armored cofferdams descend first; foundries weld outward
  under smoke and sparks.
- **Audio:** deep cannon body, mechanical recoil, tracked mass, low brass alarms,
  authoritarian command cadence.
- **Commander:** Lord Darion Vex. Charismatic, severe, convinced that enforced
  order is kinder than endless collapse.

### 4.3 Syndicate Coalition

- **Fantasy:** a coalition of brokers, autonomous machine guilds, and energy
  scientists that wins by controlling information and the shape of a fight.
- **Silhouette:** compact asymmetric hover forms, levitating rings, phase coils,
  drone sockets, segmented green-violet fields.
- **Technology:** gravity manipulation, phase weapons, predictive targeting,
  drones, cloaking, repair swarms, resource capture, shield distortion.
- **Movement:** hover, blink-like dashes, orbiting modules, loose adaptive
  formations.
- **Strengths:** area denial, precision energy, drones, shield/repair support,
  economic capture, scouting and disengagement.
- **Weaknesses:** low raw hull, setup time, melee rushes, EMP, resource denial.
- **Construction:** projected framework appears first; drones weave matter onto
  hard-light anchors.
- **Audio:** clean synthesized transients, spatial pulses, servo swarms,
  encrypted confirmations, controlled sub-bass rather than retro bleeps.
- **Commander:** Broker Lys Renn. Wry, transactional, fiercely protective of
  voluntary association; her conflict is whether everything should have a
  price.

### 4.4 Brood Swarm

- **Fantasy:** a planetary super-organism that grows an army, learns from pain,
  and converts the battlefield into its body.
- **Silhouette:** chitin, asymmetry, muscle, membranes, claws, mouths, sacs,
  tendrils, spores, eggs, burrows.
- **Technology:** none in the mechanical sense. Weapons are glands, pressure
  organs, evolved bone, acid, venom, spores, sonic membranes, and psionic
  coordination.
- **Movement:** scuttle, lope, burrow, glide, leap, swarm. Use secondary/spring
  motion for antennae, mandibles, tails, membranes, and sacs with strict
  distance-based simulation limits.
- **Strengths:** numbers, regeneration, mutation, close pressure, tunneling,
  terrain spread, replacement.
- **Weaknesses:** area damage, long-range siege, anti-heal, detection, exposed
  growth nodes and supply organs.
- **Construction:** structures grow through larval, rooted, and mature stages.
  No cranes, weld sparks, plates, wheels, barrels, bearings, or machine UI.
- **Audio:** body mass, claws, breath, wet pressure, shell resonance, insect
  chorus, low biological pulses. Avoid repetitive squelch and harsh constant
  ambience.
- **Commander:** The Brood Sovereign. Not an armored humanoid and not a machine;
  a strategic organism whose portrait is a living sensory crown. Its conflict
  is between survival through assimilation and the emergence of individual
  thought inside the hive.

### Faction identity acceptance test

A grayscale silhouette clip, a muted five-second movement clip, a projectile
clip, a construction clip, and an audio-only clip should each let a playtester
identify the faction at least 80% of the time. If only the colored emissive
texture reveals the answer, the faction pass is incomplete.

### Current implementation reality

The user's concern that the factions still look alike is supported by the
current production matrix, not merely by taste:

- Structure geometry now reports dedicated families across all four factions.
- Nova/Terran still has 24 produced unit roles on shared role chassis.
- Crimson/Red still has 24 produced unit roles on shared role chassis.
- Syndicate still has 22 produced unit roles on shared role chassis.
- Brood reports zero shared unit chassis and is therefore the closest to its
  intended silhouette doctrine.

This explains why structure screenshots can look faction-specific while a
moving army still reads as one roster in different livery. The next art tranche
should prioritize the units the player sees most often—constructor, first
combat unit, main tank, artillery, air scout, support, and commander—before
adding more rare capstone structures.

## 5. Recommended story and end-goal bible

### 5.1 Shared setting

Keep the existing Halcyon Reach dispatch arc. Add one connective mystery rather
than replacing it:

Halcyon Reach sits over an ancient mass-energy lattice that can stabilize
climate, power gates, reshape terrain, and multiply industrial output. The four
factions initially believe it is infrastructure. The Brood has grown through it
for generations and treats it as a fossil nervous system. Activating more nodes
causes the beautiful and dangerous map behavior: electrical storms, gravity
fractures, rising water, collapsing shelves, awakened ruins, and accelerated
Brood growth. The war around those nodes becomes known as the Massfront.

This gives economy, research, hazards, map landmarks, campaign rewards, and the
title one shared cause. It also makes every faction's end goal mechanically
visible on maps.

### 5.2 Terran Frontline campaign

- **Opening belief:** secure the Reach, protect settlers, study the lattice, do
  not fire first.
- **Middle conflict:** holding the line requires surveillance, rationing, and
  emergency powers that resemble Dominion control.
- **Personal conflict:** Kai learns that Vex's original split came from a Nova
  command decision that sacrificed an outer colony to preserve the core.
- **End goal:** restore the lattice as a public defensive and climate network,
  then place it under a multi-faction charter.
- **Final choice:** centralize it under Kai for immediate safety, or distribute
  keys among settlements and accept a weaker but accountable defense.
- **Victory image:** blue shield corridors relight between surviving cities;
  civilian transports move while Frontline units stand down.
- **Cost:** unity remains work, not a magic ending. Some commanders and worlds
  reject the charter.

### 5.3 Crimson Dominion campaign

- **Opening belief:** fragmented rule caused the Reach's wars; one command can
  end them.
- **Middle conflict:** Vex's victories are real and his civilian corridors are
  safer than contested zones, but every emergency becomes permanent.
- **Personal conflict:** officers begin treating strength as obedience rather
  than competence, corrupting the doctrine Vex claims to uphold.
- **End goal:** seize the lattice's command spine and turn every defense,
  factory, and transit node into one Dominion war network.
- **Final choice:** rule through total coercion, or accept an earned-citizenship
  compact that limits Vex's authority but preserves his unified defense.
- **Victory image:** the planet's red batteries fire in perfect sequence and
  stop the last hive tide.
- **Cost:** peace is immediate; freedom depends on the player's final doctrine.

### 5.4 Syndicate Coalition campaign

- **Opening belief:** monopolies and empires manufacture scarcity; access and
  information are freedom.
- **Middle conflict:** Coalition cells liberate captured nodes, then compete to
  own the routes between them.
- **Personal conflict:** the Machine Ascendancy bloc wants to hand governance to
  a predictive system; Emerald Triad engineers warn that perfect optimization
  erases consent.
- **End goal:** partition the lattice into interoperable autonomous nodes and
  prevent any single faction from owning the network.
- **Final choice:** publish the protocol freely, or preserve priced access to
  fund defense and keep the Coalition intact.
- **Victory image:** green-violet nodes relight independently as civilian,
  machine, and military traffic negotiates passage in real time.
- **Cost:** decentralization prevents tyranny but cannot promise stability.

### 5.5 Brood Swarm campaign

- **Opening belief:** there is no conquest; the Reach and Brood are one wounded
  organism reclaiming disconnected tissue.
- **Middle conflict:** assimilated memories reveal that the lattice predates the
  Brood and may have shaped its intelligence.
- **Personal conflict:** new brood minds begin to experience separation,
  curiosity, and mercy as mutations rather than defects.
- **End goal:** grow a living neural mantle through every lattice node, making
  planet, hive, and network one adaptive organism.
- **Final choice:** consume all foreign minds into consensus, or evolve a
  symbiotic form that can exchange memory without erasing identity.
- **Victory image:** roots and bioluminescent membranes cover the old lattice;
  storms quiet as the planet breathes.
- **Cost:** survival is assured, but the meaning of the self is permanently
  changed.

### 5.6 Campaign structure

| Act | Purpose | Example mission grammar |
|---|---|---|
| Prologue — First Drop | Teach deploy, economy, commander, production, defense | Protected Field Orientation |
| I — Four Claims | Introduce each doctrine and map resource route | Hold, raid, recover, escort |
| II — Ground Remembers | Reveal lattice hazards and Brood intelligence | Storm survival, scan, rescue, collapse escape |
| III — Broken Arithmetic | Temporary alliances and betrayals | Two-front defense, convoy, ceasefire timer, joint boss |
| IV — The Massfront | Faction end-goal missions around command nodes | Multi-stage siege, network capture, evolving final map |
| Epilogue | Show the player's doctrine choice and persistent world state | Short in-engine ending plus unlocked operations |

The current sequential dispatches remain valuable between missions. They should
become optional context and reaction, while authored operations carry the major
turning points.

## 6. Map, economy, and battlefield recommendations

### 6.1 Large-map rule

Every 20–30 seconds of traversal needs a decision or information event:
resource, cover, sight line, hazard, neutral structure, shortcut, pickup, patrol
contact, or objective. Size without decisions is downtime.

### 6.2 Map grammar

Each map should combine:

- two to four candidate starting sectors per player;
- protected initial build pocket;
- at least two expansion routes with different risk;
- one central high-value conflict objective;
- flank corridors that punish a single static front;
- sight blockers and high-ground observation;
- faction-neutral resource and salvage sites;
- one signature hazard with readable warning and counterplay;
- concealed enemy starts under real fog of war.

### 6.3 Starting positions and AI setup

- Before launch, the host selects a player start from valid sectors.
- Each AI slot has faction, difficulty, team, start sector, and optional random
  toggle.
- Start-sector cards communicate resource richness, defensibility, terrain,
  naval access, and hazard exposure.
- Invalid or overlapping sectors are disabled, never accepted and silently
  moved.
- Fog hides enemy entities, health bars, effects, build queues, and minimap
  marks until scouted. A setup card may reveal the sector name without revealing
  the exact command center.

### 6.4 Dynamic map events

| Hazard | Warning | Tactical effect | Counterplay |
|---|---|---|---|
| Ion storm | darkening sky, radar noise, countdown | reduced sight/radar, energy instability | detectors, hardened power, sheltered route |
| Shelf collapse | cracks, dust, audible groan, red ground pulse | terrain becomes impassable or lower | evacuate, bridge/air route, trigger deliberately |
| Flood/tidal surge | waterline preview and siren | closes low routes, opens naval access | high ground, amphibious/naval units |
| Spore front | wind direction and biological alarm | vision loss, healing reduction, Brood buff | purifier/detection, burn corridor |
| Gravity shear | floating debris and field rings | projectile deflection, movement distortion | disable lattice node, switch to beam/close range |
| City fire/collapse | structure damage states and evacuation icon | falling debris, blocked streets, salvage | route around, stabilize, or demolish safely |

Hazards need preparation and counterplay. Random unavoidable damage is not
strategy.

### 6.5 Cities and neutral structures

- City blocks have collision, height class, health, fire, critical, collapse,
  wreck, and salvage states.
- Units do not attack cities merely on contact. Only explicit attack orders,
  hostile ownership, scripted objectives, or collateral damage can harm them.
- Ground pathfinding treats buildings and fresh wrecks as blockers. Air units
  use height clearance. Large carriers reserve an approach corridor.
- Civilian structures can host optional rewards: rescue, power restoration,
  radar uplink, repair yard, trade depot, or defensive emplacement.
- Destruction changes navigation and economy, so it must be deliberate and
  visible in the debrief.

### 6.6 Unit spacing and formation

- Maintain short-range personal separation so one unit does not occupy exactly
  the same point as another.
- Allow dense groups to compress when path width or army size demands it; do not
  force parade-ground spacing during mass battles.
- Separate collision radius from visual radius and formation slot radius.
- Resolve local overlap gradually to prevent jitter.
- Formation preview uses one hologram per assigned slot, based on selected count,
  footprint, class, and facing. Invalid slots turn red.
- Patrol paths show numbered nodes, arrows, loop direction, and a moving pulse.

## 7. Touch-first UI and menu direction

### 7.1 Main menu: a command deck, not an icon grid

- Keep one primary CONTINUE/PLAY operation card.
- Use a live background vignette tied to the active faction: carrier bay,
  command bridge, drone chamber, or living Brood nexus.
- Show the active commander portrait, rank, current story transmission, weekly
  objective, and account sync state as small contextual modules.
- Operations, Development, Armory, Dossier, and Settings become a restrained
  navigation bar or two-tier command deck. Do not give every destination equal
  visual weight.
- A newly unlocked system changes the environment or preview, not only a badge.

### 7.2 Unit and structure preview contract

Every buildable object needs:

- live faction-correct model/thumbnail;
- name and role icon;
- one-sentence purpose;
- targets and target restrictions;
- strong-against and weak-against icons grounded in real rules;
- mass, energy, population, build time, and prerequisites;
- range/area shape;
- passive trait and active ability;
- tap-to-hear selection/confirmation sample in Codex;
- upgrade/tier comparison where applicable.

Short form stays on the build card. Long form opens by hold or INFO, not on
every tap.

### 7.3 Combat HUD

- Top: compact resources, population, speed, pause. Negative rates are
  highlighted but do not animate constantly.
- Center: battlefield only, except urgent objective/alarm chips.
- Bottom-left: minimap, never covered by order confirmation.
- Bottom: selected-object strip and four contextual actions.
- Commander: a floating faction crest/star above the commander at medium zoom,
  fading at close zoom. The minimap uses the same distinct shape.
- Health bars: setting options for Selected, Damaged, Always, and Off. Default
  Selected + recently damaged; buildings and units use world-space bars that
  scale and occlude correctly.
- Dialogue: commander portrait, speaker name, faction frame, signal state, short
  text, optional voice. Generic text-only rectangles are reserved for system
  errors.

### 7.4 Navigation and input

- Visible Back and Android system Back follow the same stack: close detail,
  close overlay, return to parent, exit only at root.
- Header and footer remain outside the scroll body and respect all safe-area
  insets.
- No more than four peer tabs in portrait. Secondary categories use filter
  chips inside the selected tab.
- A tap receives pressed state, one UI sound, optional haptic, and result or
  named error within 100 ms.
- Do not bind both pointerdown and click to the same element without the shared
  ghost-click guard.

## 8. First-time player mission

The existing Field Orientation already reads real state and has a protected
ruleset. Keep those strengths. Upgrade its presentation and mission wrapper.

### Recommended flow

1. **Cold open, 6–10 seconds:** faction lander enters the map, commander portrait
   identifies Captain Kai, KEEL states the mission. Skippable immediately.
2. **Choose a landing zone:** legal footprint and approach path are visible.
3. **Find the commander:** camera briefly frames the commander; floating crest
   persists until first selection.
4. **Secure mass:** tap a highlighted deposit, inspect purpose, build Extractor.
5. **Stabilize power:** show why negative energy stalls production.
6. **Establish production:** build Factory; its card previews what it makes.
7. **Understand territory:** visualize build radius and expansion method.
8. **Build a defense:** show range, target role, and likely enemy approach.
9. **Create and move a squad:** queue unit, select, preview a simple line/wedge,
   issue move and patrol.
10. **Use the commander:** identify hero role and trigger one early ability.
11. **Survive a controlled attack:** wave targets the taught defensive lane.
12. **Debrief:** victory reason, resources, first item, tutorial reward, and a
   recommended next mission.

### Guidance after the tutorial

- Keep a short “First Command” objective chain through roughly the first five
  account ranks: upgrade a structure, use a formation, scout fog, counter an
  armor type, complete an optional objective.
- These are recommendations, not blockers. Experienced players can dismiss or
  replay them.
- Each lesson explains why, not only what to tap.
- Never interrupt active combat with a modal. Use a portrait transmission and
  highlight, then allow the player to act.

## 9. Cinematics and immersive presentation

### In-engine cinematic language

- 6–12 second shots using live models, camera rails, depth haze, particles,
  faction landers, and portrait transmissions.
- Skippable from the first frame; subtitles always available.
- Pause or simplify simulation while the camera is controlled.
- Use three quality profiles. Low quality replaces expensive volumetrics and
  secondary particles but preserves staging and information.
- Reserve pre-rendered video for a later marketing or chapter-capstone pass;
  it is large, rigid, and expensive to revise.

### Required beats

- faction-specific base deployer arrival and transformation;
- first sight of each enemy commander/faction;
- first major hazard awakening;
- first Brood Sovereign transmission;
- mid-campaign alliance/betrayal;
- faction final assault;
- selected ending consequence.

### Character presentation

- Use the existing canonical portraits for Kai, Vex, Renn, and the Sovereign.
- Give each speaker three expression or state variants where art permits:
  neutral, urgent, damaged/angry. A subtle camera crop or lighting state is
  acceptable before new portraits exist.
- Transmission frames communicate secure, open, intercepted, degraded, or
  biological signal before the text is read.
- Each faction lander, UI frame, stinger, radio filter, and deployment impact
  must share the same identity grammar as its units.

## 10. RPG and long-term progression

### Three nested loops

| Loop | Player question | Reward |
|---|---|---|
| 5–20 seconds | What do I select, target, build, or dodge now? | position, tempo, survival |
| 8–25 minutes | How do I win this operation? | mission resources, loot, mastery |
| days/weeks | What doctrine and faction expression am I building? | abilities, gear choices, story, cosmetics |

### Progression rules

- Permanent progression unlocks sidegrades, class abilities, recipes, loadout
  slots, mission access, and cosmetic identity before it grants raw power.
- Flat bonuses need caps and visible opportunity cost.
- Unit-class abilities become researchable tactical tools. Artillery can choose
  a charged precision shell or a barrage; support can choose repair burst or
  shield field; scouts can choose sensor flare or cloak break.
- Gear rarity changes affix complexity and specialization, not just a larger
  number in every stat.
- Consumables are mission preparation choices with clear limits, not energy
  timers or pressure to pay.
- Skirmish exposes a NORMALIZED PROGRESSION toggle. Campaign and high-threat
  operations may use the full career loadout.
- Mission failure still awards recovered salvage, partial mastery progress,
  and an explanation. It must not feel like total reset.

## 11. Prioritized implementation stages

This is a reference-driven sequencing overlay for
docs/MULTI_STAGE_PRODUCTION_PLAN.md. Each stage should ship behind a small data
contract and have a visible screenshot checkpoint.

### Stage R0 — Canon and data lock

**Priority:** P0. **Dependency:** none.

- Freeze four stable IDs and the polity/branch naming map.
- Reconcile Codex names with the real roster and tower catalog.
- Add role, target class, damage type, strong/weak, preview asset, ability, and
  faction identity fields to authoritative definitions.
- Audit all claims with tools/extract-design-db.mjs.

**Done when:** no UI invents a unit, faction, counter, or prerequisite; old
saves still resolve all four stable IDs.

### Stage R1 — Touch safety and first operation

**Priority:** P0. **Dependency:** R0 vocabulary.

- Fix navigation stack, safe-area footers, 48px tab/action targets, and
  mutually exclusive command modes.
- Wrap Field Orientation in a visible mission card and briefing.
- Add commander locator, object-purpose cards, protected first wave, and
  debrief.

**Done when:** a first-time phone player can deploy, build economy, produce,
defend, move, identify the commander, use an ability, and exit every screen
without outside instruction.

### Stage R2 — Object-first previews

**Priority:** P0. **Dependency:** R0.

- Shared preview component for unit, structure, research, gear, and mission.
- Render faction-correct live thumbnails.
- Add role and counter icons, costs, prerequisites, range shape, and ability.
- Replace outdated contact-sheet crops in runtime UI.

**Done when:** every buildable item explains what it is for in two taps or
fewer, and its thumbnail matches the battlefield model.

### Stage R3 — Battlefield intelligence

**Priority:** P0. **Dependency:** R1.

- True fog visibility for entities, effects, bars, minimap, targeting, and spawn.
- Personal separation without breaking dense armies.
- Formation holograms and patrol/waypoint visualization.
- Legal carrier path/footprint and aircraft height navigation.
- Selection/damage health-bar modes and commander marker.

**Done when:** hidden enemies do not leak, single units do not stack exactly,
and orders remain readable in a 100+ unit engagement.

### Stage R4 — Maps, economy, and hazards

**Priority:** P1. **Dependency:** R3.

- Larger map templates with start-sector choice, expansion routes, strategic
  landmarks, and neutral cities.
- Interactive resource/deposit selection and visible building upgrades.
- One readable, counterable signature hazard per map.
- Destructible city states and intentional collateral rules.
- Pickups: salvage, energy cache, intel scan, repair nanites, research sample.

**Done when:** each map creates a different build/route decision in the first
three minutes and at least one mid-match objective beyond waiting for waves.

### Stage R5 — Faction production and combat identity

**Priority:** P1. **Dependency:** R0 and stable gameplay roles.

- Finish dedicated shared-role replacements listed in
  design/faction-production-matrix.md.
- Faction-specific landers, constructors, structures, weapons, critical-damage
  effects, selection barks, and construction language.
- Brood remains completely biological.
- Implement counter relationships only after real roster rules stabilize.

**Done when:** the silhouette/audio identity test passes and no faction relies
on recolor to communicate its doctrine.

### Stage R6 — Doctrine, abilities, and tower-defense depth

**Priority:** P1. **Dependency:** R2 and R5 roles.

- Categorized mobile research lanes.
- Early unit-class active ability unlocks.
- Tower synergies, support structures, barriers/gates, upgrade tiers, and
  artillery/control tradeoffs.
- AI composition reacts to major player classes, not only fixed faction bias.

**Done when:** the mid-game offers meaningful actions between wave clocks and
every major defensive strategy has at least two readable counters.

### Stage R7 — Mission, inventory, and debrief RPG

**Priority:** P1. **Dependency:** R2 data contract.

- Missions/Contracts/Threat/Records operations shell.
- Five-rarity inventory filters and object detail.
- Serialized match result and exact reward ledger.
- Fixed, optional, faction, hazard, and challenge objectives.
- Horizontal loadout choices and normalized skirmish option.

**Done when:** victory and failure both explain outcome, recovered resources,
loot, progression, and the best next action.

### Stage R8 — Campaign and cinematic layer

**Priority:** P2. **Dependency:** R4–R7.

- Four campaign arcs and faction end goals.
- In-engine briefings, deployers, portrait transmissions, boss introductions,
  and endings.
- Reactive main menu command deck and story state.
- Faction music routing and authored stingers using documented owned assets.

**Done when:** the same faction identity is present in story, menu, deploy,
combat, research, debrief, and ending.

### Stage R9 — Scale, performance, accessibility, release

**Priority:** continuous; final gate after each stage.

- Profile aggregate geometry, particles, audio voices, fog, pathfinding, and DOM.
- LOD/culling/pooling and quality profiles.
- Reduced motion, readable contrast, shape-backed color, scalable text, subtitle
  and health-bar options.
- Android, web, updater, archive, and later signed iOS cloud build.

**Done when:** representative low/mid/high device profiles preserve orders and
simulation under intended army scale, and release artifacts pass install/update
rollback tests.

## 12. Acceptance and evidence plan

Keep each focused automated or visual gate below two minutes.

For every changed screen:

- inspect at 360x800 and 393x852 portrait;
- inspect phone landscape when a footer, Back control, map, or tab strip changes;
- measure visible tap bounds, not only CSS declarations;
- traverse tabs with the real touch binding;
- verify Android Back and visible Back match;
- capture a PNG and inspect it;
- capture an in-game PNG for every art/gameplay milestone, not only a menu mockup.

For every faction asset family:

- hero render;
- battlefield near and far screenshots;
- grayscale silhouette sheet;
- one construction clip/still;
- one firing/effect clip/still;
- material/UV check;
- mobile frame-cost comparison with the prior asset.

For every gameplay stage:

- deterministic setup fixture;
- one success path and one failure/invalid-action path;
- save round-trip if persistent data changed;
- design database extraction if balance definitions changed;
- node tools/bundle.mjs after every source change.

## 13. Things to avoid

- Do not create extra factions from reference aliases.
- Do not rename runtime/save keys to match marketing labels.
- Do not make the Brood use tanks, barrels, robots, factories, bolts, or
  mechanical deployers.
- Do not make all factions share a chassis and rely on emissive color.
- Do not paste desktop multi-window UI into portrait mobile.
- Do not ship strong/weak labels that are not true in simulation.
- Do not use contact-sheet panel crops as final in-game thumbnails after the
  model changes.
- Do not expose enemy starts, health bars, projectiles, or minimap marks through
  fog.
- Do not add larger empty maps without objectives and traversal decisions.
- Do not let career power replace tactical skill.
- Do not regard a clean console as visual validation.

## 14. Product north star

MASSFRONT's strongest achievable identity is not “a PC RTS squeezed onto a
phone.” It is a battlefield-first mobile command game that supports large
armies, tower-defense planning, readable faction doctrine, persistent commander
growth, and short authored operations without sacrificing direct control.

The player should be able to answer, at any moment:

1. What is happening?
2. Why is it happening?
3. What can I do about it?
4. What will this choice change now?
5. What will it unlock or teach me for the next operation?

When the world, UI, factions, progression, audio, and story all answer those
questions in the same language, the supplied references have served their real
purpose.
