;
;
/* ============================================================================
   FACTION VOICE — what each army calls its own hardware, and how it describes it
   ----------------------------------------------------------------------------
   Owner report: "even previews and descriptions are reused per unit, ability
   and structure."

   That was exactly true, and worse than it sounds. There was no per-unit
   description anywhere in the game: TYPES carries a `name` and nothing else,
   and every card, tooltip and production entry generated its prose from TEN
   category strings (INTEL_ROLE_COPY). Rhino, Goliath and Hornet are three
   completely different vehicles and all three read "Durable direct-fire battle
   unit". Structures had one shared name and one shared line. The only
   per-faction prose in the codebase — FACART.units — was Dossier decoration,
   never wired to the roster at all; it reads its names from this file now (see
   facUnitName in src/factions.js), so the codex and the build menu cannot call
   the same chassis two different things.

   So a Brood player built a "Factory" that produced a "Rhino" described as a
   durable direct-fire battle unit, in a faction whose entire premise is that it
   has no vehicles and no factories.

   This file is the overlay. Nova keeps the base names — it is the roster's
   native voice — and the other three armies get their own name and their own
   sentence for every chassis and every structure they can field.

   SECOND PASS — the same defect in the VERB tables. Names and descriptions
   were faction-aware; everything the army DOES was not. A Brood "SIEGE" stance
   and a Dominion "SIEGE" stance read identically, in an army that has no
   machinery at all, and the Commander level-up deck offered a Brood player
   "Nano Plating" and "Assembly Protocols". So three more groups live here:

     mode:{}     the eight stances in MODES (sim.js), keyed by mode index, plus
                 the key `mine` for the miner's chassis-specific mode 0
     classab:{}  the three contextual doctrines in CLASS_AB (commander.js)
     upgrade:{}  the eight Commander level-up cards in UPGRADES (commander.js)

   RULES THE CONTENT FOLLOWS, because they are load-bearing:
     - `nm` <= 16 characters. The production and build cards are narrow.
       STANCES and DOCTRINES are stricter — <= 12 — because they also render on
       a hot-slot chip (.hotSlot .hNm) that is 62px wide and ellipsises.
     - `ds` <= 88 characters, one sentence, no trailing full stop.
     - A stance or upgrade description states the REAL MECHANICAL EFFECT and
       NEVER changes the numbers. SIEGE is +75% range and +45% damage in every
       army; only the words around it move. A player who cannot trust the
       numbers on a stance chip has to test each faction by hand.
     - The description states what the thing DOES. A player reads it to decide
       whether to build it, so accuracy outranks flavour: a Bulwark has no
       weapon, a Constructor has no weapon, a Warden heals. Where the base text
       carries a number or a condition (+4 Mass on a ◆ node, build on shore,
       on a ✦ geyser) the faction version keeps that fact.
     - No two entries in a faction may be interchangeable sentences. That
       interchangeability was the defect.
     - The Brood uses NO mechanical vocabulary. Not "factory", "reactor",
       "turret", "wall" or "engine" — every structure is an organ and every unit
       is a creature. An organic army described in machine words is the same bug
       in a different coat. That extends to the verbs: a Brood stance is a
       posture of an animal (rooting itself, hunkering, flooding itself, going
       silent), never a deployment, an overclock or a protocol. "fire rate"
       becomes "strikes faster"; "range" becomes "reach"; "damage" becomes
       "harm". The number survives, the machine does not.
   ============================================================================ */
const FAC_TEXT={

  /* TERRAN FRONTLINE COMMAND — the roster's native voice, so it keeps the base
     NAMES (Rhino and Goliath are canon; the dispatches use them). What it did
     not have was descriptions: the generated fallback gave Rhino, Goliath and
     Hornet the same sentence, which is the defect this whole file exists for.
     Voice: professional, doctrinal, understated. Hold what you take. */
  nova:{
    units:{
      0:{ds:'Cheap line rifleman that screens armour and holds ground while heavier units arrive'},
      1:{ds:'Main battle tank and the backbone of the line — everything else is built behind it'},
      2:{ds:'Assault walker with 450 hull and a splash cannon, sent to break a defended position'},
      3:{ds:'Field artillery that softens a position from 265 range and never has to enter it'},
      4:{ds:'Your Commander: heavy, self-repairing, and the one unit the match is decided around'},
      5:{ds:'Interceptor for air cover — cheap enough to lose, fast enough not to'},
      6:{ds:'Long-range missile carrier that kills armour it can see and dies to anything that closes'},
      7:{ds:'Rocket vehicle whose splash punishes formations that have not spread out'},
      8:{ds:'Sixteen thousand hull of walking siege — the answer when the line will not break'},
      9:{ds:'Flame trooper that clears entrenched infantry out of cover at close range'},
      10:{ds:'Tank destroyer that trades armour for reach and kills heavies before they answer'},
      11:{ds:'Unarmed mobile shield that walks in front of the advance and absorbs the volley'},
      14:{ds:'Light warship for coastal screening and shore bombardment at medium range'},
      15:{ds:'Capital warship whose 290-range guns hold an entire coastline'},
      16:{ds:'Siege platform at 400 range — out-ranges every static defence in the game'},
      17:{ds:'Strike craft that drops onto a worker line at point-blank and is gone'},
      18:{ds:'Armoured flame tank that pushes into massed infantry and burns the position clear'},
      19:{ds:'Unarmed engineer: builds, auto-repairs nearby structures and salvages wrecks at 2× speed'},
      20:{ds:'Mid-range splash gun that cuts down infantry advancing behind enemy armour'},
      21:{ds:'Close-support launcher that scatters area fire over anything bunched in front of it'},
      22:{ds:'Fragile 150-damage lance that removes one heavy target per shot from 230 range'},
      23:{ds:'Sonic platform whose waves pass straight through Bulwark shields'},
      24:{ds:'Unarmed field medic that repairs armour and treats wounded inside the fight'},
      25:{ds:'Fast recon flyer with 150 sight — it sees first and leaves first'},
      26:{ds:'Experimental heavy with 1,100 hull and a main gun no line unit can trade with'},
      27:{ds:'Siege titan whose area barrage grinds an entrenched position down from 210 range'},
      31:{ds:'A brood caster that forms from 28 nearby creatures and directs the mass as one'},
      32:{ds:'Unarmed mobile miner that works phase-ore in the field and hauls the mass home'}
    },
    bld:{
      mex:{nm:'Extractor',ds:'+4 Mass, sited on a ◆ deposit and worked for as long as you hold the ground'},
      pgen:{nm:'Reactor',ds:'+14 Energy from a shielded core — the first thing to build after an Extractor'},
      fac:{nm:'Factory',ds:'Builds ground units, and keeps building them while you are looking elsewhere'},
      turret:{nm:'Sentinel',ds:'Automated laser turret covering an approach you cannot spare units to watch'},
      bunker:{nm:'Bulwark',ds:'Armoured close-defence cannon that holds a chokepoint against ground assault'},
      sgen:{nm:'Aegis Barrier',ds:'Projects a shield field over the position and repairs the structures under it'},
      tgate:{nm:'Titan Gate',ds:'Builds TITANs — the single largest commitment of the match'},
      harbor:{nm:'Harbor',ds:'Builds warships; must be sited on the shore'},
      bastion:{nm:'Concussion Mortar',ds:'Long-range explosive shells that stun clustered targets before they reach you'},
      techlab:{nm:'Research Complex',ds:'Shielded studies that bank ◆ Data to your account for the doctrine tree'},
      aatower:{nm:'Skyguard',ds:'Anti-air flak covering the airspace over your base and nothing else'},
      airfield:{nm:'Airfield',ds:'Builds aircraft and turns them around between sorties'},
      uplink:{nm:'Targeting Array',ds:'Extends the build zone and adds range to every tower near it'},
      hq:{nm:'Carrier HQ',ds:'Your deployed super carrier — a wide build zone and the anchor of the position'},
      hellstorm:{nm:'Hellfire Rotary',ds:'Rapid rotary fire that shreds swarms and light armour before they close'},
      arc:{nm:'Tesla Coil',ds:'Chain lightning that arcs through packed enemies and punishes tight formations'},
      rail:{nm:'Rail Battery',ds:'Long-range penetrator that answers heavy armour on approach'},
      nova:{nm:'NOVA Missile Silo',ds:'Strategic superweapon with map-wide strike range and a long, honest cooldown'},
      minelaser:{nm:'Mining Laser',ds:'Sustained beam that melts heavy armour once it comes inside reach'},
      missilebastion:{nm:'Missile Bastion',ds:'Long-range guided salvos holding standing area defence over your ground'},
      plasma:{nm:'Plasma Charger',ds:'Charged ion blast with heavy splash — one shot answers a whole formation'},
      wall:{nm:'Barricade',ds:'Blocks ground units and forces the attack into the lane you prepared'},
      gate:{nm:'Gate',ds:'A wall section your own units pass through and the enemy does not'},
      geo:{nm:'Geo Plant',ds:'+30 Energy, sited on a ✦ geyser — the best power on the map if you can hold it'},
      silo:{nm:'Silo',ds:'+600 mass and +2000 energy of storage, so a good economy stops overflowing'},
      fab:{nm:'Fabricator',ds:'Burns 58 energy for +3.6 mass when the ground has no ore left to give'}
    }
  },

  /* CRIMSON DOMINION — imperial, unsentimental, contemptuous of weakness.
     Machinery is an instrument of authority and units are expendable. */
  legion:{
    units:{
      0:{nm:'Warden',ds:'Line infantry that holds ground until it dies and is replaced, never pulled back'},
      1:{nm:'Iron Ram',ds:'Mass-built assault tank, cheap enough to spend and armoured enough to reach the line'},
      2:{nm:'Warlord',ds:'Heavy anti-armour brawler that walks into the enemy column and cracks it open'},
      3:{nm:'Bloodhound',ds:'Thin-hulled siege battery that shells the enemy line from far behind your own'},
      5:{nm:'Shrike',ds:'Light gunship that strafes infantry and soft armour, and is expected to be lost'},
      6:{nm:'Executioner',ds:'Heavier shells than a Bloodhound at shorter reach, with no armour to survive a reply'},
      7:{nm:'Scourge',ds:'Rocket carrier that saturates packed formations with splash fire at long range'},
      8:{nm:'Ascendant',ds:'Walking fortress built to break one front alone and hold the ruin it makes'},
      9:{nm:'Immolator',ds:'Flame trooper that burns entrenched infantry out of cover at knife range'},
      10:{nm:'Carrion',ds:'Thin-skinned tank hunter that kills armour from outside its reply'},
      11:{nm:'Shieldbearer',ds:'Unarmed mobile shield that soaks the volley so the advance reaches the enemy line'},
      14:{nm:'Enforcer',ds:'Light warship that screens the coast and guns down lighter hulls in the shallows'},
      15:{nm:'Dominator',ds:'Capital warship that bombards the shoreline from far out on open water'},
      16:{nm:'Siege Hammer',ds:'Longest-ranged gun in the column, built to flatten fixed defences before it advances'},
      17:{nm:'Talon',ds:'Heavy gunship that drops onto armour and empties its guns at point-blank range'},
      18:{nm:'Inferno',ds:'Armoured flame tank that rolls into massed infantry and burns the position clean'},
      19:{nm:'Overseer',ds:'Unarmed engineer rig that raises and rebuilds structures while under fire'},
      20:{nm:'Thresher',ds:'Mid-range splash gun that scythes down infantry following behind the armour'},
      21:{nm:'Ashfall',ds:'Close-range launcher that scatters area blasts over anything bunched in front of it'},
      22:{nm:'Impaler',ds:'Fragile long-range lance that deletes one heavy target per enormous shot'},
      23:{nm:'Shieldbreaker',ds:'Sonic vehicle whose waves pierce shields and strike what shelters behind them'},
      24:{nm:'Reclaimer',ds:'Unarmed crew that repairs armour and patches the wounded in the middle of the fight'},
      25:{nm:'Watchman',ds:'Fast scout aircraft that maps the enemy line, armed only enough to leave it'},
      26:{nm:'Tyrant',ds:'Experimental heavy carrying armour and a main gun no line unit can answer'},
      27:{nm:'Warbringer',ds:'Siege titan whose area barrage grinds entrenched defences down from long range'},
      32:{nm:'Requisitor',ds:'Unarmed mobile miner that strips ore off the field and feeds it to the war machine'}
    },
    bld:{
      mex:{nm:'Tithe Rig',ds:'+4 Mass, clamped onto a ◆ deposit and worked until nothing is left'},
      pgen:{nm:'Furnace',ds:'+14 Energy, burned hot and without apology'},
      fac:{nm:'War Forge',ds:'Builds ground units in a continuous line, replacements included'},
      turret:{nm:'Beam Post',ds:'Fixed laser turret that burns whatever walks into its arc'},
      bunker:{nm:'Iron Redoubt',ds:'Armoured close-defence cannon that holds a chokepoint against ground assault'},
      sgen:{nm:'Iron Aegis',ds:'Projects a shield field over the position and repairs the structures beneath it'},
      tgate:{nm:'Ascension Gate',ds:'Builds TITANs, the only chassis Vex trusts to finish a front'},
      harbor:{nm:'War Anchorage',ds:'Builds warships, and must be raised on the shore'},
      bastion:{nm:'Concussion Pit',ds:'Long-range explosive shells that stun clustered targets before the assault lands'},
      techlab:{nm:'Doctrine Vault',ds:'Shielded complex whose studies bank ◆ Data to your account'},
      aatower:{nm:'Flak Tower',ds:'Anti-air flak that tears aircraft out of the sky above the column'},
      airfield:{nm:'Talon Field',ds:'Builds aircraft and turns them around for the next sortie'},
      uplink:{nm:'Command Array',ds:'Extends the build zone and lengthens the reach of nearby towers'},
      hq:{nm:'Throne Carrier',ds:'Deployed super carrier that opens a wide build zone and anchors the offensive'},
      hellstorm:{nm:'Meatgrinder',ds:'Rapid rotary fire that shreds swarms and light armour at close quarters'},
      arc:{nm:'Arc Lash',ds:'Chain lightning that arcs through packed enemies and punishes tight formations'},
      rail:{nm:'Rail Lance',ds:'Long-range penetrator that punches through the heaviest armour on approach'},
      nova:{nm:'Verdict Silo',ds:'Strategic superweapon with map-wide strike range, the last word in any argument'},
      minelaser:{nm:'Cutting Beam',ds:'Sustained beam that melts the heaviest armour once it comes inside reach'},
      missilebastion:{nm:'Salvo Bastion',ds:'Long-range guided salvos that blanket an area and cover the ground you hold'},
      plasma:{nm:'Ion Charger',ds:'Charged ion blast with heavy splash, one shot answering a whole formation'},
      wall:{nm:'Iron Wall',ds:'Blocks ground units and forces the enemy into the lane you chose for them'},
      gate:{nm:'Iron Gate',ds:'A wall your own units pass through and the enemy does not'},
      geo:{nm:'Geo Furnace',ds:'+30 Energy, sunk into a ✦ geyser and tapped until it is dry'},
      silo:{nm:'War Stores',ds:'+600 mass and +2000 energy storage, held back for the next offensive'},
      fab:{nm:'Transmuter',ds:'Burns 58 energy to force out +3.6 mass when the ground has nothing left'}
    },
    /* Stances are orders, and an order in the Dominion is a thing you are held
       to: emplace and you do not move again until told. */
    mode:{
      0:{nm:'MARCH',     ds:'Marching order: no bonus and no penalty, the footing the column fights from'},
      1:{nm:'EMPLACE',   ds:'Emplaced: +75% range and +45% damage, and it will not move again until told'},
      2:{nm:'SHIELDWALL',ds:'Braced behind the shields: −45% damage taken, −60% speed'},
      3:{nm:'BLOODRUSH', ds:'Redlined: +60% fire rate, +35% speed, and it burns its own hull to pay'},
      4:{nm:'BLACKOUT',  ds:'Runs dark: nothing sees it until it opens fire, −35% speed'},
      5:{nm:'GRIND',     ds:'Rooted and grinding: +85% fire rate, −30% range, no movement'},
      6:{nm:'LABOUR',    ds:'Sets the beam to work hastening a War Forge, a build site or the Throne Carrier'},
      7:{nm:'CLAIM',     ds:'Sends the rig to seize the nearest unclaimed phase-crystal field'},
      mine:{nm:'TITHE',  ds:'Clamps the extraction beam onto a working phase-crystal field and takes its due'}
    },
    classab:{
      assault:  {nm:'SHATTER', ds:'+28% damage, +22% speed and faster fire for 9s, paid with +12% damage taken'},
      intercept:{nm:'RUN DOWN',ds:'Fliers take +58% speed, +22% range and faster tracking for 8s'},
      service:  {nm:'PATCH UP',ds:'Crews restore nearby troops and hold a 28% damage screen over them for 7s'}
    },
    upgrade:{
      0:{nm:'Blood Edge',    ds:'+25% damage on everything the Commander carries'},
      1:{nm:'Iron Skin',     ds:'+20% Commander max HP, and the new hull comes filled'},
      2:{nm:'Undying',       ds:'The Commander mends 80% faster and does not stop to do it'},
      3:{nm:'Standing Order',ds:'Commander ability cooldowns cut by 20%'},
      4:{nm:'War Tithe',     ds:'+2.5 mass and +8 energy income, taken from the ground you hold'},
      5:{nm:'Blooded Ranks', ds:'Every unit you field deals 10% more damage'},
      6:{nm:'Forge Levy',    ds:'War Forges turn out units 25% faster'},
      7:{nm:'Wider Verdict', ds:'The orbital blast covers 35% more ground'}
    }
  },

  /* SYNDICATE COALITION — mercantile and clinical. Everything is an asset, a
     line item or a service level; violence is a maintenance schedule. */
  syndicate:{
    units:{
      0:{nm:'Retainer',ds:'Cheap legged skirmisher fielded in bulk and written off the moment it stops firing'},
      1:{nm:'Coil Skiff',ds:'Light hover gun platform trading stopping power for rate of fire at medium range'},
      2:{nm:'Bailiff',ds:'Heavy hover tank that pushes to short range and repossesses enemy armor plate by plate'},
      3:{nm:'Arc Mortar',ds:'Thin-hulled mortar that arcs shells onto static positions from far outside their reach'},
      5:{nm:'Hexwing',ds:'Cheap attack drone that swarms stragglers and pressures anything left without cover'},
      6:{nm:'Longcoil',ds:'Siege launcher whose single heavy shells break emplacements it never has to approach'},
      7:{nm:'Dividend',ds:'Rocket carrier that pays its payload out across clustered targets from standoff range'},
      8:{nm:'Liquidator',ds:'Striding titan whose emitters erase a defended position and close the account outright'},
      9:{nm:'Cauterizer',ds:'Legged thermal sprayer that burns infantry out of cover at point-blank range'},
      10:{nm:'Beam Culler',ds:'Standoff beam platform that cuts open heavy armor from outside its return fire'},
      11:{nm:'Indemnity',ds:'Unarmed hull that carries a shield over your advance and soaks fire your line cannot'},
      14:{nm:'Coil Cutter',ds:'Light warship that screens the coast and services shore targets at medium range'},
      15:{nm:'Embargo',ds:'Capital warship whose long guns close a coastline and shell anything anchored near it'},
      16:{nm:'Foreclosure',ds:'Siege battery that dismantles bases from beyond tower range, once it has time to set up'},
      17:{nm:'Auditor',ds:'Gunship that arrives unannounced, empties its coils point-blank, and leaves'},
      18:{nm:'Slagcaster',ds:'Armored hover flamer that pushes into cover and burns entrenched infantry out of it'},
      19:{nm:'Assembler',ds:'Unarmed drone rig that raises structures and extends your holdings in the field'},
      20:{nm:'Scatterbeam',ds:'Fan emitter that sweeps massed light targets off a lane in a single pass'},
      21:{nm:'Flux Caster',ds:'Close-support caster that lobs ionized bursts over cover into packed squads'},
      22:{nm:'Prism Lance',ds:'Long-range lance that removes one heavy target per shot and reloads in the open'},
      23:{nm:'Harmonic',ds:'Sonic hull whose resonance passes through shields to hit what they were protecting'},
      24:{nm:'Warranty',ds:'Unarmed service rig that repairs and heals nearby assets under standing warranty'},
      25:{nm:'Surveyor',ds:'Fast scout drone that maps ground the Coalition later sells by the tile, lightly armed'},
      26:{nm:'Overwrite',ds:'Experimental heavy hull that opens a lane through armor and rewrites who holds it'},
      27:{nm:'Final Notice',ds:'Siege platform that saturates entrenched positions with sustained area fire from range'},
      32:{nm:'Assayer',ds:'Unarmed mining rig that works ore deposits in the field and converts them to mass'}
    },
    bld:{
      mex:{nm:'Lien Drill',ds:'+4 Mass from a ◆ node, drilled under an exclusive Coalition claim'},
      pgen:{nm:'Coil Reactor',ds:'+14 Energy from a sealed coil core, metered down to the last unit'},
      fac:{nm:'Assembly Bay',ds:'Builds ground units, from leased skirmishers up to Phantom-pattern armor'},
      turret:{nm:'Beam Sentry',ds:'Automated laser turret that services anything entering its arc'},
      bunker:{nm:'Casemate',ds:'Armored emplacement whose close-defence cannon holds ground you cannot cede'},
      sgen:{nm:'Barrier Pylon',ds:'Projects a shield field over your holdings and repairs the structures inside it'},
      tgate:{nm:'Titan Cradle',ds:'Builds TITANs, the largest single line item the Coalition will ever approve'},
      harbor:{nm:'Freeport',ds:'Builds warships; must be sited on the shore'},
      bastion:{nm:'Shock Mortar',ds:'Long-range explosive shells that stun clustered targets and stall an advance'},
      techlab:{nm:'Data Vault',ds:'Shielded complex that studies and banks ◆ Data hauled in by Decryptor crews'},
      aatower:{nm:'Airspace Toll',ds:'Anti-air flak battery that prices every aircraft crossing your airspace'},
      airfield:{nm:'Launch Deck',ds:'Builds aircraft, chartered out by the sortie'},
      uplink:{nm:'Telemetry Mast',ds:'Extends your build zone and feeds nearby towers the telemetry to shoot further'},
      hq:{nm:'Brokerage',ds:'Deployed super carrier and the Broker\'s seat, opening a wide build zone'},
      hellstorm:{nm:'Rotary Coil',ds:'Rapid rotary fire that shreds swarms and light armor before they reach the line'},
      arc:{nm:'Chain Coil',ds:'Chain lightning that arcs from one packed enemy to the next until the queue clears'},
      rail:{nm:'Rail Spike',ds:'Long-range penetrator built to itemize heavy armor one target at a time'},
      nova:{nm:'Terminal Clause',ds:'Strategic superweapon with map-wide strike range, invoked once and never argued'},
      minelaser:{nm:'Asset Stripper',ds:'Sustained beam that melts heavy armor down to salvage value'},
      missilebastion:{nm:'Salvo Bastion',ds:'Long-range guided salvos holding standing area defense over your holdings'},
      plasma:{nm:'Surcharge',ds:'Charged ion blast with heavy splash, applied to anything that groups up'},
      wall:{nm:'Hex Barricade',ds:'Hexplate wall that blocks ground units and routes them where you want them'},
      gate:{nm:'Toll Gate',ds:'Wall section your own units pass through and nothing else does'},
      geo:{nm:'Vent Tap',ds:'+30 Energy tapped from a ✦ geyser on a lease that never expires'},
      silo:{nm:'Reserve Vault',ds:'Holds +600 mass and +2000 energy in reserve against a long campaign'},
      fab:{nm:'Arbitrage',ds:'Burns 58 energy to mint +3.6 mass at an exchange rate the Coalition sets'}
    },
    /* A stance is a service level: you buy something and something is billed
       for it, and the Coalition tells you the rate up front. */
    mode:{
      0:{nm:'BASE RATE', ds:'Baseline footing, nothing billed either way and nothing gained'},
      1:{nm:'HARD ASSET',ds:'Set down as fixed plant: +75% range, +45% damage, and it does not move'},
      2:{nm:'COVERAGE',  ds:'Full coverage: −45% damage taken, with −60% speed as the premium'},
      3:{nm:'OVERDRAW',  ds:'Drawn against its own hull: +60% fire rate, +35% speed'},
      4:{nm:'OFF BOOKS', ds:'Off the books: nothing sees it until it fires, −35% speed'},
      5:{nm:'SATURATE',  ds:'Standing service: +85% fire rate, −30% range, no movement while it fires'},
      6:{nm:'EXPEDITE',  ds:'Bills a tractor beam to speed an Assembly Bay, a build site or the Brokerage'},
      7:{nm:'ASSESS',    ds:'Sends the rig to appraise the nearest unclaimed phase-crystal field'},
      mine:{nm:'EXTRACT',ds:'Locks the mining beam onto a producing phase-crystal field and books the yield'}
    },
    classab:{
      assault:  {nm:'LEVERAGE', ds:'+28% damage, +22% speed and faster fire for 9s against +12% damage taken'},
      intercept:{nm:'INTERDICT',ds:'+58% speed, +22% range and faster tracking for 8s of airspace control'},
      service:  {nm:'SERVICING',ds:'Support assets restore nearby holdings and hold a 28% damage screen for 7s'}
    },
    upgrade:{
      0:{nm:'Weapon Uprate',  ds:'+25% Commander damage, uprated at Coalition expense'},
      1:{nm:'Hexplate Kit',   ds:'+20% Commander max HP, fitted and healed on the spot'},
      2:{nm:'Repair Retainer',ds:'Commander regeneration up 80% under a standing retainer'},
      3:{nm:'Fast Turnaround',ds:'Commander ability cooldowns down 20%'},
      4:{nm:'Margin Call',    ds:'+2.5 mass and +8 energy income booked against every deposit'},
      5:{nm:'Trained Assets', ds:'Every asset you field deals 10% more damage'},
      6:{nm:'Line Throughput',ds:'Assembly Bays turn out units 25% faster'},
      7:{nm:'Wider Writeoff', ds:'Orbital blast radius +35%, so more is written off per strike'}
    }
  },

  /* BROOD SWARM — unsettling, patient, physical. Organs and creatures only;
     see the no-mechanical-vocabulary rule at the top of this file. */
  horde:{
    units:{
      0:{nm:'Spawnling',ds:'Bred by the litter and spent without counting, it finds where you are soft first'},
      1:{nm:'Goreback',ds:'Heavy-shelled walker that flings barbs at short reach and holds while the brood grows'},
      2:{nm:'Sundermaw',ds:'Slow, thick-shelled breaker whose jaws split the hardest cases open at short reach'},
      3:{nm:'Spitter',ds:'Sac-bellied lobber that arcs burning bile far over the field and dies fast if reached'},
      5:{nm:'Hookwing',ds:'Membrane-winged biter grown in flights to harry light things from above'},
      6:{nm:'Quillcaster',ds:'Patient thrower that puts a single sharpened bone spine through a body at long reach'},
      7:{nm:'Rotslinger',ds:'Swollen thrower whose bursting sacs eat through anything clustered well out from it'},
      8:{nm:'Worldmaw',ds:'Hill-sized creature on seven-jointed limbs that eats whole formations and will not die'},
      9:{nm:'Bile Wretch',ds:'Legged sac that washes digesting bile over everything within a breath of it'},
      10:{nm:'Boreworm',ds:'Long-necked hunter that drives a hardened spine through heavy shells from well back'},
      11:{nm:'Shellback',ds:'Walking shell that soaks what is aimed at the brood behind it and never bites back'},
      12:{nm:'Ravager',ds:'Claw-first killer that closes to touching distance and opens light bodies in seconds'},
      13:{nm:'Alpha Ravager',ds:'A Ravager grown on and on, thick enough in the shell to tear a whole line open alone'},
      14:{nm:'Reefspine',ds:'Swimming body that holds open water and stings whatever floats near it'},
      15:{nm:'Drowner',ds:'Vast swimmer that flings bone across the water from further off than anything answers'},
      16:{nm:'Bone Hurler',ds:'Slow, sac-heavy thrower that lobs hardened bone from beyond all sight and answer'},
      17:{nm:'Rendwing',ds:'Heavy flier that stoops onto one target and opens it with hooked claws before rising'},
      18:{nm:'Rotbelly',ds:'Fat-bodied sprayer that walks into crowds and coats them in acid that keeps eating'},
      19:{nm:'Fleshweaver',ds:'Blind and jawless, it spits living matter into the shape of new organs'},
      20:{nm:'Splitspine',ds:'Flings a fan of hooked spines that opens several bodies standing shoulder to shoulder'},
      21:{nm:'Chokespore',ds:'Breathes a clinging cloud of burning spore over anything bunched at short reach'},
      22:{nm:'Impaler',ds:'Thin-bodied hunter that drives one heavy spine through a single hard target from far off'},
      23:{nm:'Wailer',ds:'Its low cry passes through shields as if they were not there and pulps what is inside'},
      24:{nm:'Knitter',ds:'Toothless nurse-body that pushes new tissue into wounded broodmates until they close'},
      25:{nm:'Skyeye',ds:'Fragile flier grown for its eyes, seeing far for the hive and stinging only lightly'},
      26:{nm:'Dreadspine',ds:'Thick-shelled hunter, costly to grow, that kills heavy things well before they close'},
      27:{nm:'Harrower',ds:'Siege-grown bulk that showers rot over packed lines and anything rooted, from far back'},
      31:{nm:'Brood Tidecaster',ds:'Rises where 28 broodmates gather, casting the will of the hive and stinging at reach'},
      32:{nm:'Massgrub',ds:'Soft, harmless grub that chews ore where it lies and carries the mass home to the hive'}
    },
    bld:{
      mex:{nm:'Gullet Root',ds:'Root sunk into a ◆ seam, digesting +4 Mass out of the rock'},
      pgen:{nm:'Vital Gland',ds:'Swollen gland that metabolises +14 Energy from what the creep feeds it'},
      fac:{nm:'Hatchery',ds:'Birthing organ that swells, splits and pushes out new creatures without end'},
      turret:{nm:'Acid Polyp',ds:'Rooted stalk that lashes a thin thread of acid at whatever walks into reach'},
      bunker:{nm:'Gnaw Burrow',ds:'Hard-shelled burrow that snaps at anything coming close and takes a beating'},
      sgen:{nm:'Caul Gland',ds:'Swells a living veil over nearby organs and knits their torn tissue closed'},
      tgate:{nm:'Queen Chamber',ds:'Buried chamber where the hive swells a TITAN into being'},
      nest:{nm:'Ravager Nest',ds:'Wild hive that answers to no brood — break it open for a bounty of 200 mass'},
      harbor:{nm:'Shore Womb',ds:'Grown on the shoreline, it births swimming creatures straight into the shallows'},
      bastion:{nm:'Shock Bladder',ds:'Lobs a swollen sac far out that leaves packed enemies stunned and staggering'},
      techlab:{nm:'Genome Sac',ds:'Veiled organ that digests what the brood has eaten and banks it as ◆ Data'},
      aatower:{nm:'Barb Bloom',ds:'Coughs clouds of barbed seed upward and shreds whatever tries to fly over'},
      airfield:{nm:'Flight Womb',ds:'Splits along its back to let newly grown fliers climb into the air'},
      uplink:{nm:'Nerve Node',ds:'Spreads living creep outward and lengthens the reach of the organs rooted near it'},
      hq:{nm:'Sovereign Hive',ds:'The Sovereign settles here, flooding creep wide so the brood can grow across all of it'},
      hellstorm:{nm:'Spine Storm',ds:'Rakes a ceaseless stream of small spines that tears massed light bodies apart'},
      arc:{nm:'Charge Gland',ds:'Living charge leaps body to body through anything standing crowded together'},
      rail:{nm:'Spine Root',ds:'Drives one long bone through a heavy target from far outside its answering reach'},
      nova:{nm:'World Seed',ds:'Grows a single living seed and casts it anywhere on the world to fall and consume'},
      minelaser:{nm:'Solvent Gland',ds:'Holds a steady thread of solvent on one heavy target until it softens and runs'},
      missilebastion:{nm:'Seeker Pods',ds:'Sends living seekers out to hunt down and burst over anything gathered far out'},
      plasma:{nm:'Rupture Sac',ds:'Swells, then throws a fat clot of acid that bursts wide over everything near it'},
      wall:{nm:'Bone Ridge',ds:'Grown ridge of fused bone that walking things cannot cross'},
      gate:{nm:'Sphincter Ridge',ds:'Bone ridge with a muscled slit that opens for the brood and shuts to everything else'},
      geo:{nm:'Vent Bloom',ds:'Clamped over a ✦ geyser, drinking its heat for +30 Energy'},
      silo:{nm:'Swollen Crop',ds:'Distended holding organ that keeps +600 mass and +2000 energy inside it'},
      fab:{nm:'Massflesh Gland',ds:'Eats 58 energy and lays it down as +3.6 mass of raw massflesh'}
    },
    /* Nothing here deploys, redlines or suppresses. A brood creature roots
       itself, hunkers, floods itself, goes still. The numbers are the same
       numbers; the words are the ones an animal would earn. */
    mode:{
      0:{nm:'ROAM',      ds:'How it carries itself when nothing is asked of it: no gain and no cost'},
      1:{nm:'ROOT',      ds:'Sinks into the ground: +75% reach and +45% harm, and it cannot move'},
      2:{nm:'HUNKER',    ds:'Draws its shell down over itself: takes 45% less harm, crawls 60% slower'},
      3:{nm:'FEVER',     ds:'Floods itself: strikes 60% faster, runs 35% quicker, eats its own flesh'},
      4:{nm:'UNSEEN',    ds:'Goes utterly still: nothing finds it until it strikes, and it creeps 35% slower'},
      5:{nm:'SMOTHER',   ds:'Plants itself and pours: 85% faster strikes, 30% less reach, no moving'},
      6:{nm:'TEND',      ds:'Feeds a swelling Hatchery, a growing organ or the Sovereign Hive to hasten it'},
      7:{nm:'SCENT',     ds:'Follows the scent to the nearest untaken phase-crystal field'},
      mine:{nm:'GRAZE',em:'🐛',ds:'Fastens onto a phase-crystal field and chews the mass loose to carry home'}
    },
    classab:{
      assault:  {nm:'REND', ds:'For 9s the brood bites 28% harder and runs 22% faster, and takes 12% more'},
      intercept:{nm:'STOOP',ds:'Fliers gain 58% speed, 22% more reach and quicker eyes for 8s'},
      service:  {nm:'KNIT', ds:'Nurse-bodies close wounds nearby and hold a 28% harm-blunting veil for 7s'}
    },
    upgrade:{
      0:{nm:'Sharper Claws',em:'🩸',ds:'The Sovereign strikes 25% harder'},
      1:{nm:'Thicker Shell', ds:'The Sovereign carries 20% more flesh, and the new flesh comes full'},
      2:{nm:'Fast Knitting', ds:'The Sovereign closes its own wounds 80% faster'},
      3:{nm:'Quick Blood',   ds:'The Sovereign is ready to use its gifts again 20% sooner'},
      4:{nm:'Deeper Roots',  ds:'+2.5 mass and +8 energy drawn up out of the ground'},
      5:{nm:'Fed Brood',     ds:'Every creature you have grown bites 10% harder'},
      6:{nm:'Swollen Wombs',em:'🐛',ds:'Hatcheries push out new creatures 25% faster'},
      7:{nm:'Wider Fall',    ds:'What the Sovereign calls down lands across 35% more ground'}
    }
  }
};

/* Whose vocabulary applies. Inspecting an ENEMY unit shows what THEY call it —
   that is a small piece of intelligence, and it is also the only honest answer:
   the thing in front of you is their hardware, not a Nova chassis in red. */
function factionTextKit(team){
  if(team===2) return 'horde';
  if(team===1){
    const f=(typeof AI!=='undefined'&&AI&&AI.fac)||'';
    return (typeof FACTIONS!=='undefined'&&FACTIONS[f]&&FACTIONS[f].kit)||f||'';
  }
  return (typeof playerKitKey==='function')?playerKitKey():'nova';
}
function facTextEntry(group,key,kit){
  const k=(kit===undefined)?factionTextKit(0):kit;
  const F=FAC_TEXT[k];
  return (F&&F[group]&&F[group][key])||null;
}
/* Nova is the base roster's own voice, so it has no overlay and these fall
   through to TYPES/BT unchanged. Anything a faction has not been given a name
   for also falls through rather than showing a blank card. */
function factionUnitName(ty,kit){
  const e=facTextEntry('units',ty,kit);
  return (e&&e.nm)||((typeof TYPES!=='undefined'&&TYPES[ty]&&TYPES[ty].name)||'');
}
function factionUnitDesc(ty,kit){
  const e=facTextEntry('units',ty,kit);
  return (e&&e.ds)||'';
}
function factionBldName(id,kit){
  const e=facTextEntry('bld',id,kit);
  return (e&&e.nm)||((typeof BT!=='undefined'&&BT[id]&&BT[id].name)||'');
}
function factionBldDesc(id,kit){
  const e=facTextEntry('bld',id,kit);
  return (e&&e.ds)||'';
}

/* ---- STANCES -------------------------------------------------------------
   MODES is indexed by mode id, but unitModeDef() already carries one
   chassis-specific override — the miner's mode 0 is MINE, not MOBILE — and a
   faction has to be able to rename that too. `modeBaseDef(ty,m)` in sim.js is
   the single owner of which base entry a (chassis, mode) pair resolves to; this
   mirrors only the KEY, so a second chassis override added there needs one line
   here rather than a parallel table. */
function factionModeKey(m,ty){
  return (typeof UT_MINER!=='undefined'&&ty===UT_MINER&&m===0)?'mine':m;
}
function factionModeBase(m,ty){
  if(typeof modeBaseDef==='function') return modeBaseDef(ty,m)||{};
  return {};
}
function factionModeName(m,ty,kit){
  const e=facTextEntry('mode',factionModeKey(m,ty),kit);
  return (e&&e.nm)||factionModeBase(m,ty).nm||'';
}
function factionModeDesc(m,ty,kit){
  const e=facTextEntry('mode',factionModeKey(m,ty),kit);
  return (e&&e.ds)||factionModeBase(m,ty).ds||'';
}
function factionModeEm(m,ty,kit){
  const e=facTextEntry('mode',factionModeKey(m,ty),kit);
  return (e&&e.em)||factionModeBase(m,ty).em||'';
}

/* ---- CONTEXTUAL DOCTRINES ------------------------------------------------ */
function factionClassAbName(key,kit){
  const e=facTextEntry('classab',key,kit);
  return (e&&e.nm)||((typeof CLASS_AB!=='undefined'&&CLASS_AB[key]&&CLASS_AB[key].nm)||'');
}
function factionClassAbDesc(key,kit){
  const e=facTextEntry('classab',key,kit);
  return (e&&e.ds)||((typeof CLASS_AB!=='undefined'&&CLASS_AB[key]&&CLASS_AB[key].ds)||'');
}
function factionClassAbEm(key,kit){
  const e=facTextEntry('classab',key,kit);
  return (e&&e.em)||((typeof CLASS_AB!=='undefined'&&CLASS_AB[key]&&CLASS_AB[key].em)||'');
}

/* ---- COMMANDER LEVEL-UP CARDS -------------------------------------------
   Only the WORDS are faction-aware. The eight cards keep their index, their
   order and their `fn`, so the effect a card applies can never drift from the
   effect its sentence promises. */
function factionUpgradeName(i,kit){
  const e=facTextEntry('upgrade',i,kit);
  return (e&&e.nm)||((typeof UPGRADES!=='undefined'&&UPGRADES[i]&&UPGRADES[i].nm)||'');
}
function factionUpgradeDesc(i,kit){
  const e=facTextEntry('upgrade',i,kit);
  return (e&&e.ds)||((typeof UPGRADES!=='undefined'&&UPGRADES[i]&&UPGRADES[i].ds)||'');
}
function factionUpgradeEm(i,kit){
  const e=facTextEntry('upgrade',i,kit);
  return (e&&e.em)||((typeof UPGRADES!=='undefined'&&UPGRADES[i]&&UPGRADES[i].em)||'');
}

