# MASSFRONT — Galactic Lore Design Bible

**Document status:** Working canon and proposal ledger  
**Date:** 2026-08-28  
**Scope:** Factions, commanders, governments, worlds, colonies, cities, internal organizations, corporations, the United Galactic Authority, and the Brood  
**Gameplay boundary:** Three playable sovereign factions; the UGA, corporations, internal organizations, and the Brood are not selectable factions

## 1. Canon authority

This document reconciles the current game text with the setting direction established by the creator. It is intended to become the narrative source of truth, but it does not silently turn every new name into finished canon.

The labels used throughout are:

- **DIRECTED CANON** — a rule or identity established directly by the creator. This overrides conflicting legacy wording.
- **LIVE CANON** — a fact already represented in the current base-game source.
- **WORKING CANON** — the recommended reconciliation of directed and live canon. It may be written against, but its final name or detail still needs a creator lock.
- **PROPOSED** — new material offered for approval. It must not be presented as shipped history until approved.
- **OPTIONAL CONCEPT** — material from the isolated space-exploration module. It is not automatically base-game canon.
- **LEGACY ALIAS** — an older name that may remain in save keys, dialogue, or technical identifiers without defining a separate political entity.

Canon precedence is:

1. Direct creator corrections.
2. Approved entries in this lore bible.
3. Current shipped narrative and faction data.
4. Optional-module concepts.
5. Older planning notes, technical labels, and aliases.

Mechanics alone do not establish lore. A technical key, AI roster entry, resident-faction flag, or proxy label cannot create a new government, species, or selectable faction.

## 2. Core setting premise

MASSFRONT takes place across a contested galactic theatre linked by strategic transit and mass-energy infrastructure. Three sovereign powers govern populated worlds, cities, colonies, and stations. Their wars are political: they fight over security, territory, industry, information, resources, and the right to define the next interstellar order.

Above their rivalry sits the **United Galactic Authority**, a treaty institution intended to keep civilization connected without becoming a galactic empire. Outside that political order is the **Brood**, an infestation that does not conquer in any civilized sense. It consumes life, transforms environments, and replaces inhabited space with a living predatory ecology.

The central dramatic question is not simply which army wins. It is whether incompatible civilizations can preserve a shared galaxy when faced with something that erases civilization itself.

## 3. The galactic political order

| Entity | Classification | Territory | Selectable | Command role |
| --- | --- | --- | --- | --- |
| **Nova Coalition** | Sovereign coalition | Governs member worlds, colonies, cities, and stations | **Yes** | Player chooses a Nova commander under Terran Frontline Command |
| **Crimson Dominion** | Sovereign authoritarian state | Governs dominion worlds, prefectures, fortress cities, and industrial colonies | **Yes** | Player chooses a Dominion commander shaped by the Red Ascendancy |
| **Syndicate Coalition** | Sovereign charter coalition | Governs charter worlds, city-states, commercial colonies, and stations | **Yes** | Player chooses a Syndicate commander or director |
| **United Galactic Authority** | Neutral intergovernmental institution | Administers treaty sites and temporary mandates; does not own member worlds | **No** | Mediator, relief coordinator, standards body, peacekeeper, and containment authority |
| **Brood** | Extragalactic or extra-planar infestation | Infests and consumes; never governs | **No** | Hostile AI threat represented by strategic hive minds |

The relationship is deliberately asymmetric:

```text
Sovereign political order
├─ Nova Coalition
│  └─ Terran Frontline Command and other non-selectable institutions
├─ Crimson Dominion
│  └─ Red Ascendancy and other non-selectable institutions
└─ Syndicate Coalition
   └─ charter blocs, directorates, and non-selectable corporations

Treaty order
└─ United Galactic Authority
   └─ delegations, courts, relief agencies, peacekeepers, and mandates

Outside the political order
└─ Brood
   └─ hives, strains, gestation organs, and linked strategic minds
```

## 4. Naming authority

| Stable identity | Canonical lore use | Subordinate or associated identity | Legacy or technical labels |
| --- | --- | --- | --- |
| `nova` | **Nova Coalition** | **Terran Frontline Command** is its principal expeditionary military arm | Nova Federation, Federation, Frontline Command |
| `dominion` | **Crimson Dominion** | **Red Ascendancy** is its founding movement, ruling ideology, and military-political order | Legion, Ascendancy, Bloodward Legion, runtime key `legion` |
| `syndicate` | **Syndicate Coalition** | Member charters, directorates, guilds, city-states, and corporate blocs | Machine Ascendancy, Emerald Triad |
| `brood` | **Brood** or **Brood Swarm** | Hives, strains, and strategic organisms | Horde, Umbral Brood, Infestation Swarm, runtime key `horde` |
| `uga` | **United Galactic Authority** | Treaty institutions and authorized missions | UGA |

**WORKING CANON:** The red naming problem is resolved by making the **Crimson Dominion** the state and the **Red Ascendancy** the movement that founded and governs it. They are not two selectable factions.

**DIRECTED CANON:** Terran Frontline Command belongs to the Nova Coalition; it is not a fourth polity beside Nova.

**DIRECTED CANON:** Internal blocs, military formations, corporations, and sponsors are never separate selectable factions.

## 5. Territorial and civic rules

The three sovereign factions must read as civilizations, not armies with a single battlefield.

Their territorial hierarchy is:

```text
Sovereign polity
└─ controlled systems or treaty-recognized claims
   └─ worlds
      ├─ planetary governments or appointed administrations
      ├─ cities and regional capitals
      ├─ colonies and industrial concessions
      └─ orbital stations, ports, relays, and defence networks
```

Every sovereign faction may have:

- a capital or political seat;
- multiple governed worlds and colony claims;
- cities with civilian populations and local administrations;
- frontier colonies with different legal arrangements from the core;
- military bases that answer to civilian, imperial, or charter authority;
- corporations operating under licenses, concessions, or public contracts;
- disputed borders and treaty obligations;
- residents who are not soldiers.

Every location must carry exactly one primary legal status:

- **Sovereign** — governed by a recognized polity.
- **Disputed** — claimed by more than one polity.
- **Treaty-neutral** — sovereign ownership exists, but military or commercial use is limited by treaty.
- **UGA-administered** — held temporarily under a defined multilateral mandate; not UGA sovereign territory.
- **Quarantined** — access controlled because of infestation, contamination, or another civilization-scale hazard.
- **Infested** — Brood organisms have established a self-spreading ecology.
- **Consumed** — organized civilian life and ordinary governance have collapsed under the Brood.
- **Abandoned** — no active recognized administration, without necessarily being infested.

The UGA **administers**. Sovereign factions **govern, control, or claim**. The Brood **infests, consumes, transforms, or renders a world lost**.

## 6. Nova Coalition

### 6.1 Identity

**DIRECTED / WORKING CANON:** The Nova Coalition is a sovereign alliance of self-governing worlds and colonies. Its legitimacy comes from common defence, shared infrastructure, representative compacts, and the promise that technical progress should protect civilian life.

**Terran Frontline Command** is the Coalition's best-known military arm. It is a combined-arms expeditionary command built around hardened positions, precision fire, disciplined advance, and dependable logistics. It may be the selectable banner in the current war without being the whole Nova civilization.

**LIVE CANON motto:** `DISCIPLINE. TECHNOLOGY. UNITY.`  
**LIVE CANON public ideal:** `For peace. For the people. For tomorrow.`

Nova's central tension is the gap between representative ideals and emergency command. Its people accept strong coordinated defence because frontier worlds cannot survive disunity, but every prolonged crisis risks turning temporary military authority into permanent rule.

### 6.2 Government and society

**PROPOSED constitutional model:**

- A coalition assembly represents member worlds and major chartered colonies.
- A civil executive coordinates transit, science, reconstruction, and interworld standards.
- Member worlds retain local law unless a defence compact or emergency mandate applies.
- Terran Frontline Command answers to civilian authority but receives broad operational discretion in an active theatre.
- Frontier governors combine elected local councils with professional emergency administrators.
- Citizenship emphasizes civil service, technical education, disaster readiness, and mutual defence rather than compulsory military identity.

Nova cities should feel inhabited, organized, and maintained: transit grids, civil shelters, public fabrication yards, universities, defence infrastructure, and carefully planned expansion zones. Even its fortifications should imply that people live behind them.

### 6.3 Territory and settlements

**LIVE CANON anchor:** **Aelos**, in **Sombrero-I**, is Nova's featured homeworld and the seat of the current Frontline campaign.

Existing Aelos place anchors:

| Location | Working civic interpretation | Status |
| --- | --- | --- |
| Capital Circumference / Command Circumference | Planetary capital belt and Coalition command district | LIVE CANON name; civic role refined here |
| Heartland Foundry / Heartland Yards | Heavy fabrication, repair, and public-works region | LIVE CANON |
| Port Admiralty / Harbor Command | Naval, orbital-transfer, and disaster-logistics port | LIVE CANON |
| Great Divide Gate / High Shelf | Frontier defence, transit, and continental access corridor | LIVE CANON |

**DIRECTED CANON:** Aelos is not Nova's only inhabited possession. The Coalition governs additional worlds, colony settlements, and stations even where their final names have not yet been locked.

**PROPOSED expansion slots:**

- one established agricultural or ecological colony that demonstrates Nova civilian life outside Aelos;
- one high-risk scientific frontier world whose research charter tests Coalition oversight;
- one reconstruction colony jointly supported by the UGA after an earlier war;
- one strategic orbital shipyard or transit station administered by Nova under treaty inspection.

Optional names such as **Caldris Orbital Ring** may be retained later as Aelos orbital infrastructure, but the exploration module's use of “Aelos” as a system conflicts with the base game's use of Aelos as a planet and is not adopted here.

### 6.4 Non-selectable internal organizations

| Organization | Function | Canon status |
| --- | --- | --- |
| Terran Frontline Command | Coalition expeditionary and theatre military command | DIRECTED + LIVE |
| Federation Expeditionary Command | Legacy or constitutional service name within Nova's armed forces | LIVE; hierarchy needs final wording |
| Fourth Landing Group | Major landing and occupation-relief formation | LIVE |
| Third Striker Company | Frontline reporting and combat formation | LIVE |
| Federation Corps of Engineers | Fortification, recovery, construction, and field infrastructure | LIVE |
| Forward Works Detachment | Deployed engineering formation | LIVE |
| Reconnaissance Doctrine Office | Intelligence, reconnaissance standards, and battlefield doctrine | LIVE |

These organizations provide characters, missions, doctrine, equipment, and political pressure. None is separately selectable.

### 6.5 Commanders

| Commander | Role | Narrative identity | Canon status |
| --- | --- | --- | --- |
| Captain Elara Kai | Vanguard | “The Clean Landing”; wins by precision, restraint, and decisive force | LIVE |
| Major Rowan Holt | Engineer | “Forward Works”; builds positions meant to outlast the campaign | LIVE |
| Commander Sera Vale | Tactician | “Long Sight”; reads the battlefield before others accept what is coming | LIVE |

### 6.6 Proposed sponsor corporations

| Sponsor | Specialty | Typical sponsorship |
| --- | --- | --- |
| Aegis Frontier Works | Defensive systems and hardened civil engineering | Shields, armor packages, fortification prototypes |
| Kestrel Aerospace Cooperative | Aerospace, sensors, and lift systems | Aircraft gear, reconnaissance packages, airlift contracts |
| Horizon Fabrication Union | Construction and modular industry | Workshop gear, build support, mass-processing grants |
| Farline Logistics | Transit, fuel, and distributed supply | Energy reserves, supply drops, recovery contracts |

All four names are **PROPOSED**. Their products may be selected as sponsorships or rewards; the companies themselves never replace the Nova Coalition on the faction screen.

## 7. Crimson Dominion

### 7.1 Identity

**LIVE / WORKING CANON:** The Crimson Dominion is an authoritarian sovereign state built around armored strength, hierarchy, industrial control, and the belief that survival proves the right to rule. The **Red Ascendancy** began as a movement that rejected Nova restraint and now functions as the Dominion's governing ideology and elite political-military order.

The Dominion is not merely cruel for spectacle. It offers security, infrastructure, clear authority, and rapid mobilization to worlds that fear collapse. Its central contradiction is that a system built to prevent disorder requires permanent enemies and permanent emergency.

**LIVE CANON motto:** `STRENGTH. AUTHORITY. CONQUEST.`  
**LIVE CANON command creed:** `The weak are fuel. The strong ascend.`

### 7.2 Government and society

**PROPOSED governing model:**

- The Dominion is divided into territorial prefectures governed by appointed authorities.
- Military and industrial offices overlap; foundries, logistics, and defence are treated as state functions.
- Fortress cities receive protection and resources in exchange for production quotas and political obedience.
- Citizenship tiers are tied to service, technical value, family standing, or demonstrated loyalty.
- Local customs may survive when they do not obstruct quotas, mobilization, or Ascendancy doctrine.
- Military governors can assume emergency authority, but the definition of emergency is deliberately broad.

Dominion civilian life should show order under pressure: pressure-dome cities, subterranean foundries, ceremonial courts, state housing, ration networks, martial schools, and public monuments to continuity through strength.

### 7.3 Territory and settlements

**LIVE CANON anchor:** **Pyraeth**, in **Andromeda-IV**, is the Dominion's featured homeworld and its principal war-forge theatre.

| Location | Working civic interpretation | Status |
| --- | --- | --- |
| Court of Iron / Buried Court | Political seat, military tribunal, and ceremonial capital | LIVE CANON name; civic role refined here |
| Promethean Mega-Grid / Mech Foundry | Foundry arcology and armored-production zone | LIVE CANON |
| Ignis Dome Court / Dome Arcology | Protected urban population center under prefectural rule | LIVE CANON |
| Hub Delta Pads / Orbital Aprons | Storm-lashed military and freight spaceport | LIVE CANON |

**DIRECTED CANON:** The Dominion governs additional worlds, colonies, cities, and extraction territories beyond Pyraeth.

**PROPOSED expansion slots:**

- one fortress colony established to hold a contested transit corridor;
- one resource world governed directly by an industrial prefecture;
- one annexed civilian world whose local identity survives beneath Dominion rule;
- one penal or service colony that exposes the moral cost of Ascendancy citizenship.

### 7.4 Non-selectable internal organizations

| Organization | Function | Canon status |
| --- | --- | --- |
| Red Ascendancy | Founding movement, ruling doctrine, and elite order | LIVE name; WORKING political role |
| First Wardens | Vex's elite formation and coercive symbol | LIVE |
| Crimson Advance | Operational command built around sustained offensive tempo | LIVE |
| Prefecture of Fortifications | Fortress construction, siege defence, and territorial hardening | LIVE concept |
| Dominion Iron Assembly | Potential industrial mission authority, not a replacement faction name | OPTIONAL CONCEPT, pending reconciliation |

### 7.5 Commanders

| Commander | Role | Narrative identity | Canon status |
| --- | --- | --- | --- |
| Lord Darion Vex | Juggernaut | “The Grading Hand”; treats war as proof of who deserves authority | LIVE |
| Marshal Rhea Korr | Warmaster | “Cadence”; turns unbroken forward motion into doctrine | LIVE |
| Prefect Amon Dravik | Fortifier | “The Iron Mandate”; builds the wall the counterattack must break upon | LIVE |

### 7.6 Proposed state combines and sponsors

| Sponsor | Specialty | Typical sponsorship |
| --- | --- | --- |
| Pyraeth State Arsenal | Artillery and siege ordnance | Ammunition, targeting packages, bombardment contracts |
| Red Mantle Foundries | Heavy armor and chassis production | Armor kits, vehicle replacements, prototype hulls |
| Mandate Reactor Combine | Reactors and high-energy weapon systems | Energy reserves, reactor upgrades, weapon trials |
| Bastion Supply Authority | Alloys, fortification, and replacement logistics | Defensive materials, garrison supply, emergency reconstruction |

These are **PROPOSED** and may function more like state combines than independent firms. None has political sovereignty or a faction-selection slot.

## 8. Syndicate Coalition

### 8.1 Identity

**DIRECTED + LIVE CANON:** The Syndicate Coalition is a sovereign coalition of charter worlds, city-states, guilds, commercial houses, technical directorates, and corporate blocs. It governs through negotiated charters, arbitration, reputation, and enforceable contracts rather than a single royal or military chain.

Its promise is freedom through voluntary association, information, and access to markets. Its danger is that rights become products and power belongs to whoever can afford the strongest contract.

**LIVE CANON motto:** `ADAPT. PROFIT. SURVIVE.`  
**LIVE CANON political creed:** `Information is power. Profit is freedom.`

### 8.2 Government and society

**PROPOSED governing model:**

- Member worlds ratify a shared coalition charter while retaining different local constitutions.
- A rotating arbitration board settles disputes between governments, guilds, and corporate members.
- Coalition law guarantees transit, contract enforcement, data standards, and mutual defence.
- City citizenship, professional membership, and commercial residency may coexist.
- Corporations can administer concessions or infrastructure, but a sovereign charter and applicable public law must always be named.
- Autonomous systems may advise or execute policy, but accountability remains a live political fault line.

Syndicate cities should combine civic life with visible commerce: exchange towers, autonomous freight, layered neighborhoods, data markets, salvage yards, contract courts, weather shields, and privately sponsored public systems.

### 8.3 Territory and settlements

**LIVE CANON anchor:** **Nordhall**, in the **Orion Arc**, is the Coalition's featured homeworld and the center of its autonomous defence network.

| Location | Working civic interpretation | Status |
| --- | --- | --- |
| Archipelago Core Vault / Frostwake Grid | Secured data, finance, and infrastructure district | LIVE CANON name; civic role refined here |
| Citadel Command Pinnacle / Frontline Shelf | Coalition defence and arbitration command center | LIVE CANON |
| Pale Trench Reactor / Reactor Rift | Energy-production and industrial concession zone | LIVE CANON |
| Skyshield Array / Orbital Weather | Climate defence, aerospace, and orbital-control district | LIVE CANON |

**DIRECTED CANON:** The Coalition governs additional worlds, cities, colonies, freeports, and contracted stations beyond Nordhall.

**PROPOSED expansion slots:**

- one prosperous freeport whose neutrality depends on Coalition arbitration;
- one salvage colony built around a pre-collapse debris field;
- one research world where autonomous governance is being tested;
- one frontier concession whose corporate operator and public government are in open conflict.

**Morrow Freeport** may be retained from the optional exploration material as a Coalition-aligned station after its galactic location is reconciled.

### 8.4 Non-selectable internal organizations

| Organization | Function | Canon status |
| --- | --- | --- |
| Accounts, Field Division | Battlefield finance, recovery, settlement, and resource accounting | LIVE |
| Infiltration, unlisted | Covert access, intelligence, and deniable operations | LIVE |
| Directorate of Autonomous Systems | Machine cadres, predictive systems, and automation policy | LIVE |
| Veil Network | Potential covert logistics and intelligence consortium | OPTIONAL CONCEPT |
| Machine Ascendancy | Legacy label best retained as a machine-governance doctrine or political bloc | LEGACY ALIAS; proposed internal use |
| Emerald Triad | Legacy label best retained as a three-member commercial bloc | LEGACY ALIAS; proposed internal use |

### 8.5 Commanders

| Commander | Role | Narrative identity | Canon status |
| --- | --- | --- | --- |
| Broker Lys Renn | Broker | “The Black Ledger”; converts information, wreckage, and risk into leverage | LIVE |
| Operative Nyx Calder | Infiltrator | “Ghost Optics”; exists in records only as an equipment anomaly | LIVE |
| Director Oren Voss | Controller | “The Predictive Core”; tries to engineer delay and uncertainty out of command | LIVE |

### 8.6 Proposed sponsor corporations

| Sponsor | Specialty | Typical sponsorship |
| --- | --- | --- |
| Meridian Exchange | Resource markets, credit, and market intelligence | Resource advances, price data, procurement access |
| Ghostline Systems | Cloaking, phase systems, and electronic warfare | Stealth gear, sensor denial, infiltration contracts |
| Axiom Autonomous | Drones, control networks, and predictive automation | Drone packages, command software, prototype controllers |
| Nordhall Reclamation Guild | Salvage, recovery, and battlefield recycling | Salvage rights, recovery teams, material bonuses |

All names are **PROPOSED**. A sponsor may be powerful enough to pressure a government, but it never becomes a selectable sovereign faction.

## 9. United Galactic Authority

### 9.1 Definition

**DIRECTED CANON:** The **United Galactic Authority** operates like the United Nations and other international institutions on a galactic scale. It is neutral between recognized powers. It is not a fourth sovereign civilization, not a galaxy-wide empire, and not a selectable army.

The UGA exists because transit, refugees, trade standards, contamination, scientific risk, and interstellar war cross borders. Its authority comes from charters, treaties, member consent, court recognition, and narrowly defined emergency mandates.

The UGA does not own or rule the Nova, Dominion, or Syndicate worlds. It may administer a site only when a treaty or time-limited mandate says so.

### 9.2 Neutrality doctrine

UGA neutrality means:

- no ordinary war aim may favor one member's ideology;
- humanitarian relief is offered by need rather than allegiance;
- treaty inspectors operate under published mandates;
- peacekeepers use force only within an authorized mission, in self-defence, or to protect civilians under that mission;
- arbitration is distinct from conquest;
- an anti-Brood response is civilization-level containment, not support for one faction's territorial ambitions;
- a member fighting the Brood does not gain automatic UGA approval for unrelated annexation or repression.

Neutrality does not require passivity. Rescue, evacuation, quarantine, investigation of reality wounds, protection of relief corridors, and collective defence against active infestation are compatible with the UGA charter.

### 9.3 Proposed institutions

| Institution | Mandate |
| --- | --- |
| Assembly of Member Polities | Debate, budgets, treaties, elections, and broad multilateral legitimacy |
| Galactic Security Council | Emergency mandates, sanctions, peacekeeping, and collective-defence authorization |
| UGA Secretariat | Civil administration, records, coordination, and implementation |
| Interstellar Court of Arbitration | Treaty disputes, transit law, claims, and commercial conflicts between polities |
| Neutral Transit Commission | Lattice access, navigation standards, inspection, and demilitarized corridors |
| Relief and Reconstruction Agency | Refugees, medical relief, food, shelter, and postwar restoration |
| Xenothreat Containment Directorate | Brood detection, quarantine, biosafety, and coordinated containment doctrine |
| Scientific Standards Council | Shared research safety, evidence protocols, and dangerous-technology controls |
| UGA Expeditionary Command | Limited-mandate peacekeeping, evacuation, escort, and containment coordination |

All institution names are **PROPOSED**, except the United Galactic Authority itself.

### 9.4 Jurisdiction and administered places

The UGA may operate:

- treaty stations;
- diplomatic enclaves hosted on sovereign worlds;
- demilitarized transit corridors;
- inspection and navigation relays;
- emergency refugee settlements under temporary trusteeship;
- quarantine and containment zones;
- shared scientific observatories;
- civilization ships supporting diplomacy, relief, research, and expedition coordination.

**NEXUS-VII** is the preferred **OPTIONAL CONCEPT** for a UGA civilization ship and neutral operational hub. If adopted, it hosts delegations and missions; their presence does not transfer sovereignty to the UGA.

### 9.5 Membership and force limits

**WORKING CANON:** Nova, the Dominion, and the Syndicate all maintain formal relations and accredited missions with the UGA. Their precise status—full member, signatory, observer, sanctioned member, or treaty counterparty—may vary by era and remains to be locked.

UGA force is limited to:

- treaty enforcement accepted by the relevant parties;
- peacekeeping and ceasefire observation;
- civilian protection within an active mandate;
- rescue, evacuation, and corridor defence;
- self-defence;
- quarantine enforcement;
- collectively authorized Brood containment.

The UGA cannot simply end every faction war because it lacks sovereign ownership of member militaries, depends on member funding and consent, and must preserve enough neutrality to remain useful after the shooting stops.

### 9.6 UGA support and procurement

UGA support may appear as:

- medical and evacuation equipment;
- survey instruments and biosafety gear;
- repair and emergency logistics packages;
- reconstruction grants;
- neutral navigation data;
- anti-infestation equipment certified for joint operations;
- time-limited mission resources.

These are mandate resources, not a hidden fourth-faction tech tree.

## 10. The Brood exception

### 10.1 What the Brood is

**DIRECTED CANON:** The Brood is the only exception to the rule that major factions govern worlds, colonies, and cities. It consumes and infests.

**LIVE CANON:** The Brood is wholly biological and enters material space through reality wounds connected to the soul plane—the space between the living and the dead. It spreads living territory, mutates under pressure, and overwhelms defence through mass, adaptation, and relentless numbers. It uses no vehicles, factories, or manufactured weapons.

The Brood is not a sovereign state. It has:

- no government;
- no citizenship;
- no civilian population;
- no cities or colonies;
- no corporations;
- no trade or taxation;
- no recognized borders;
- no diplomatic standing;
- no UGA membership;
- no legitimate territorial claims.

### 10.2 Infestation lifecycle

| Stage | Meaning |
| --- | --- |
| Reality wound | A breach allows Brood organisms or influence to cross into material space |
| Incursion | Organisms appear, hunt, seed, and test local resistance |
| Infestation | A self-sustaining biological network establishes nests, feeder roots, gestation organs, and spore fields |
| Planetary consumption | The network converts ecosystems, cities, industry, and populations into biomass or hive function |
| Consumed world | Ordinary governance and civilian continuity cease; the world is lost, dead, or transformed into a hostile living ecology |

The Brood does not “capture a city.” It overruns, hollows, digests, nests within, or transforms it. It does not “colonize a planet.” It seeds, infests, and consumes it.

### 10.3 Vespera

**DIRECTED RECONCILIATION:** **Vespera**, in the **Helios Core**, is a consumed or actively infested world. It is not the sovereign Brood homeworld. Existing references to a Brood “homeworld” describe the central world of the current Brood theatre, not a lawful seat of government.

Existing site names such as **Great Hive Spire**, **Infestation Fields**, **Magma Hatcheries**, and **Terminator Hive Spire** describe infestation anatomy built through or over swallowed civilization. Their ruined cities, factories, and foundries are evidence of consumption, not Brood urban life.

Vespera's pre-infestation sovereign and the continuing legal status of its refugees remain open canon decisions.

### 10.4 Strategic minds and strains

| Identity | Interpretation | Selectable |
| --- | --- | --- |
| The Brood Sovereign | Strategic organism or distributed command intelligence | No; AI only |
| The Veil Matron | Organism specialized in widening or exploiting reality wounds | No; AI only |
| The Ossuary Mind | Death-tide intelligence associated with consumed biomass | No; AI only |

These are not kings, elected leaders, corporations, or political subfactions. A “strain” is a biological adaptation and mission variant, not a player allegiance.

**PROPOSED strain vocabulary:** Sovereign Host, Veil Strain, Ossuary Communion, Tide Broods, and Worldheart Hives. These names require approval and must remain biological classifications.

### 10.5 Communication rule

Brood communication may appear as intercepted neural pattern, translated sensory impulse, corrupted broadcast, mimicked voice, or collective pressure. It must not read like normal diplomatic correspondence. Apparent negotiation is manipulation, predation, or failed translation unless the creator later establishes otherwise.

## 11. Corporations and sponsorship

Corporations exist inside the law and territory of the three sovereign factions. They can be influential, transnational, state-owned, cooperative, privately held, or chartered, but they are never selectable factions.

A corporation may:

- sponsor gear or a prototype;
- provide resources, fuel, alloys, components, or research grants;
- issue a mission contract;
- hold a licensed mining, salvage, transit, or fabrication concession;
- operate infrastructure under public law;
- fund a commander or expedition;
- offer a cosmetic livery or manufacturer identity;
- lobby, pressure, bribe, or oppose a government.

A corporation may not:

- replace the player's faction allegiance;
- receive sovereign status merely because it operates a colony;
- become a hidden fourth or fifth faction;
- overrule local law without a clearly written political conflict;
- erase the civilian government of a location from the lore;
- grant UGA voting rights through wealth alone.

### 11.1 Player-facing sponsorship model

The player chooses:

1. a sovereign faction;
2. a commander from that faction;
3. optionally, a non-sovereign sponsor or contract package.

A sponsor can change the source, appearance, or narrative framing of gear and resources without changing political allegiance. Rival sponsors within one faction create texture without fragmenting the faction-selection screen.

The Brood has no sponsor layer. Its equivalent variation is biological strain, environmental adaptation, hive objective, or infestation stage, all controlled by the scenario and AI.

## 12. Commander presentation rules

### 12.1 Character authority

The nine playable commanders are the current base roster. Their rank, personality, and service history belong to their sovereign faction even when their immediate organization is more specific.

The Brood's three named minds are encounter identities only. They do not make the Brood playable.

### 12.2 Visual canon

**DIRECTED CANON — `commander-anime-flat-v1`:**

- Human commanders use an anime-flat illustration style.
- Robotic commanders or robotic command avatars use the same flat visual language.
- Lines are crisp, deliberate, and readable at phone scale.
- Forms use solid color separation.
- No painted shading, airbrushed gradients, glossy rendering, cinematic rim light, or PBR lighting may define the portrait.
- Silhouette, face, insignia, and faction color must remain legible at small size.
- A faction may change shape language, uniform, palette, and iconography without breaking the common portrait style.

Brood encounter art may use organic silhouettes and disturbing biological forms, but it should still prioritize clean visual readability rather than photoreal gore.

### 12.3 Writing voices

| Voice | Language rule |
| --- | --- |
| Nova | Professional, doctrinal, humane, precise, and understated |
| Crimson | Imperial, severe, unsentimental, declarative, and concerned with strength/order |
| Syndicate | Mercantile, clinical, witty when useful, and concerned with value/information |
| UGA | Restrained, procedural, neutral, evidence-led, and careful about mandate |
| Brood | Physical, organic, sensory, collective; never casually mechanical or commercial |

## 13. Inter-faction relations

### Nova and the Crimson Dominion

Nova sees the Dominion as proof that emergency defence can devour the society it claims to protect. The Dominion sees Nova's consensus as a luxury purchased by stronger people holding the frontier. Their shared military history—especially Vex's Federation training—makes the conflict personal as well as ideological.

### Nova and the Syndicate Coalition

They cooperate on transit, science, logistics, and reconstruction, but disagree over who owns strategic data and whether public safety can be left to contract. Nova fears that the Syndicate sells common security; the Syndicate fears that Nova turns standards into soft control.

### Crimson Dominion and the Syndicate Coalition

The Dominion wants predictable obedience; the Syndicate monetizes ambiguity. They trade when it is profitable, sanction one another when it is useful, and conduct constant intelligence and procurement warfare beneath formal agreements.

### The sovereign powers and the UGA

All three need the UGA's neutral corridors, arbitration, evidence standards, and relief capacity. All three also accuse it of bias whenever a ruling limits their freedom. This tension is healthy for the setting: the UGA matters because it has enough authority to frustrate power, but not enough to abolish politics.

### Civilization and the Brood

Brood containment is the one issue that can produce genuine joint command. Cooperation remains unstable because each faction suspects the others of using the emergency to seize territory, technology, or legitimacy.

## 14. Narrative architecture

### 14.1 Faction arcs

**Nova Coalition:** `LANDING → RELIEF CORRIDOR → PLANETARY SHIELD`  
Hold Aelos, restore the Sombrero command lattice, protect civilian continuity, and build a defensive alliance strong enough to survive the next incursion.

**Crimson Dominion:** `CONQUEST → WAR FORGES → IMPERIAL ASCENSION`  
Seize Pyraeth's pre-collapse war forges and prove that one authority can unify the theatre, while revealing the cost of unity imposed by force.

**Syndicate Coalition:** `INFILTRATION → MACHINE AWAKENING → PERFECT NETWORK`  
Awaken Nordhall's buried planetary intelligence and connect markets and defence networks, while deciding whether indispensability is service or domination.

**Brood threat:** `REALITY BLEED → PLANETARY NERVOUS SYSTEM → CONSUMPTION`  
Spread through wounds, turn infrastructure and ecology into hive anatomy, and make separate living worlds continuous with the Brood.

### 14.2 Shared campaign spine

**PROPOSED:**

1. The three powers fight localized wars over transit, resources, and recovering infrastructure.
2. Evidence shows that apparently separate outbreaks share one infestation pattern.
3. Each power tries to contain or exploit the threat alone.
4. A failed unilateral operation produces refugees, quarantine conflict, and political blame.
5. The UGA brokers a limited joint-containment mandate.
6. Internal organizations and corporate sponsors compete to shape the response.
7. The alliance fractures over territory, classified research, and acceptable losses.
8. The final campaign turns on control of the mass-energy lattice and whether it can be used without widening the reality wounds.

The Brood does not need to become sympathetic for this story to have moral complexity. The moral choices come from how the civilizations respond.

## 15. World and colony dossier standard

Every authored world, colony, city, or station should answer:

| Field | Required content |
| --- | --- |
| Name and implementation key | Stable lore name plus technical identifier, if one exists |
| Location class | World, moon, colony, city, station, ring, ship, relay, or derelict |
| Legal status | Sovereign, disputed, treaty-neutral, UGA-administered, quarantined, infested, consumed, or abandoned |
| Sovereign or former sovereign | Exactly who governs it, claims it, or governed it before loss |
| Local administration | Council, prefect, charter board, governor, mandate office, or none |
| Civil population | Who lives there and how civilian life functions |
| Principal settlements | Capital, cities, colonies, ports, and stations |
| Economy | Food, industry, research, trade, salvage, transit, or another material purpose |
| Military role | Defence, logistics, shipyard, listening post, fortress, training, or demilitarized |
| Corporate presence | Named concession, sponsor, contractor, or explicitly none |
| UGA presence | Embassy, inspection, relief, peacekeeping, quarantine, or none |
| Brood status | None, alert, incursion, infestation, consumption, or recovered |
| Cultural identity | What residents value, celebrate, fear, and remember |
| Story conflict | The local political or survival problem that can create missions |

No new location is ready for canon if its sovereign and civilian status are unclear.

## 16. Working historical sequence

Dates and calendar names are not yet locked. The safe relative sequence is:

1. Human or multispecies settlement expands through connected systems.
2. The political traditions that become Nova, the Dominion, and the Syndicate take shape.
3. The Red Ascendancy breaks with or grows out of Federation military culture and establishes Dominion rule.
4. Syndicate worlds ratify a shared charter and arbitration network.
5. The UGA treaty system forms to regulate transit, conflict, relief, and shared hazards.
6. Strategic lattice infrastructure is discovered, restored, or expanded.
7. Reality wounds and early Brood incursions are identified.
8. Vespera is overrun and becomes the defining consumed-world warning.
9. The Aelos landing and the current four-system crisis begin.

Every dated history added later should preserve this causal order unless the creator explicitly changes it.

## 17. Optional exploration-module boundary

The space-exploration module is isolated experimental work. Its material must be reconciled before promotion.

Usable concepts include:

- the full name **United Galactic Authority**;
- a UGA civilization ship such as **NEXUS-VII**;
- Coalition embassies and resident delegations;
- neutral survey, research, relief, logistics, and containment functions;
- sites such as Caldris Orbital Ring, Heliograph Relay, Morrow Freeport, Orison Derelict, Ossuary Vault, and Meridian Colony, after their locations and sovereign status are corrected.

Material that is not automatically canon:

- Nova Expeditionary Compact as a replacement for Nova Coalition or Terran Frontline Command;
- Dominion Iron Assembly as a replacement for Crimson Dominion;
- Syndicate Veil Network as a replacement for Syndicate Coalition;
- UGA “civilization authority” wording that implies galactic sovereignty;
- optional commanders whose names overlap or conflict with the base roster;
- any map that changes Aelos from a planet into a system;
- any hierarchy that places Veyra or Karak in conflict with the four-system base map;
- any wording that treats Vespera as a legitimate Brood polity.

If retained, the optional faction labels should become mission contingents, industrial bodies, intelligence networks, or expedition contracts beneath the canonical entities.

## 18. Canon locks and forbidden implications

The following rules are mandatory unless the creator explicitly revises them:

- There are **three playable sovereign factions**, not four.
- The Nova Coalition, Crimson Dominion, and Syndicate Coalition govern populated territory.
- Terran Frontline Command is part of Nova, not a separate sovereign faction.
- Red Ascendancy is part of the Dominion's political history and structure, not another selectable red faction.
- Machine Ascendancy and Emerald Triad do not create additional selectable green factions.
- The UGA is neutral and non-selectable.
- The UGA does not own member worlds or command every member military.
- Corporations, guilds, directorates, formations, ministries, and sponsors are non-selectable.
- A corporate concession must name the sovereign law under which it operates.
- The Brood is hostile and AI-controlled.
- The Brood has no government, cities, colonies, civilian economy, corporations, or legal territory.
- The Brood does not manufacture vehicles, factories, or weapons.
- Vespera is infested or consumed, not governed as a Brood homeworld.
- Technical keys such as `legion`, `ascendancy`, `horde`, and `uga` do not prove political equivalence.
- Human and robotic commander portraits follow the flat-anime, crisp-line, no-shading visual rule.

## 19. Open canon decisions

These decisions are deliberately visible rather than hidden inside prose:

1. Confirm whether **Nova Coalition** completely replaces **Nova Federation** as the sovereign name, or whether “Federation” remains the constitutional name inside the Coalition.
2. Confirm the working red hierarchy: **Crimson Dominion** as the state and **Red Ascendancy** as its ruling movement.
3. Decide whether the three featured powers are the UGA's only full members or only the principal powers in this theatre.
4. Define UGA voting, veto, funding, sanctions, and peacekeeping limits.
5. Name and locate the additional worlds and colonies already implied for each sovereign power.
6. Decide Vespera's pre-infestation sovereign, refugee nationality, and surviving legal claim.
7. Decide whether a consumed world becomes ecologically dead, remains a living hive ecology, or can exist in either state.
8. Decide whether the Brood is one distributed intelligence, several Sovereigns, or a hierarchy of linked minds.
9. Establish the calendar, current year, UGA founding era, and Brood first-contact date.
10. Decide whether the setting's political populations are human-only or multispecies.
11. Reconcile the four-system base theatre with the optional Aelos–Veyra–Karak exploration route.
12. Approve, rename, or reject each proposed corporate sponsor.
13. Decide whether apparent Brood communication can ever be genuine exchange while keeping the Brood outside recognized diplomacy.

## 20. Source and proposal ledger

### Live base sources consulted

- `src/faction-id.js` — stable faction identities, display names, aliases, and runtime-key mapping.
- `src/factions.js` — faction doctrine, homeworld anchors, mottos, commanders, goals, rosters, and Brood biological rules.
- `src/story.js` — commander biographies, service organizations, faction voices, and dispatch language.
- `src/factext.js` — faction-specific vocabulary and the rule that Brood language remains organic rather than mechanical.
- `src/engine/gl.js` — four-system/world presentation and named planetary regions.

### Optional sources consulted

- `modules/space_exploration/README.md` — isolation boundary, UGA sponsor role, resident factions, and hostile-only Brood rule.
- `modules/space_exploration/src/domain/catalog.js` — United Galactic Authority name, NEXUS-era expedition concepts, optional sites, and conflicting faction labels.
- `modules/space_exploration/src/systems/showcase_systems.js` — optional world and station presentation requiring hierarchy reconciliation.

### Implementation consequences for later stages

- Faction-selection UI should expose only Nova, Crimson, and Syndicate.
- Commander selection remains nested under the chosen sovereign faction.
- Sponsor selection, if implemented, is a subordinate loadout or contract choice.
- The UGA appears through missions, diplomacy, relief, standards, and containment—not faction selection.
- Brood hives and minds appear through enemy/scenario selection, never player sovereignty.
- Location data should carry explicit legal and infestation status.
- Base and exploration naming should be reconciled before the optional module is promoted.
- Display-name changes must preserve stable save/runtime identifiers.
- Narrative copy must use `govern/administer/infest` according to the entity's legal nature.

This document authorizes further lore development within these boundaries. It does not itself register new factions, assets, commanders, corporations, worlds, or gameplay content.
