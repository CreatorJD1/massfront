# MASSFRONT — mechanics deep dive 2026-08-14

Inventory of **gameplay that C&C3 / Supreme Commander 2 taught players to expect**, scored against what this tree actually runs. Scoped for a **phone RTS**: one thumb, WebGL2 battle, pop cap 1000/seat, The Four, Standard `*_medium`. Not a campaign design doc.

Identity at writing: local `1.33.31`. Source of truth is `src/`, plus `docs/MASTER_PLAN_2026-08-14.md`, `docs/BALANCE_REVIEW_2026-08-14.md`, `docs/HANDOFF.md`. Balance numbers in §6 are measured; they were **not** applied here.

## Locks (do not undo)

- Campaign / MMO / Co-op stay locked War Room cards.
- Production battle renderer is hand-written WebGL2. `experimental/preview/` (Babylon, cascaded shadows) is not the ship path.
- `FACTION_POP_CAP` stays 1000 per seat (`src/game/sim.js`). Theatre sum is 2000/3000/4000.
- The Four: 4 systems (`sombrero` / `andromeda` / `orion` / `helios`), 4 playable homeworlds (`aelos` / `pyraeth` / `nordhall` / `vespera`). No moons. 4 regions × 3 maps = 48 sites.
- Standard theatres are `*_medium` (`MAPDEFS.size === 'standard'`). Fresh Standard landing is `aelos_north_medium`. Compact dailies may stay `*_small`.
- Brood stays AI-only until a product call. Nova-as-enemy is a separate product call (`playableFactions()` vs `FACTIONS` in `ai.js`).

## Method

Each gap below answers five questions: **what exists (file cites)**, **what is missing vs C&C3 / SupCom2**, **why it matters on a phone**, **mobile feasibility**, **priority**.

Severity matches the master plan: **P0** player trap / ship-blocker, **P1** high-value gap, **P2** quality debt, **P3** later / locked.

Agent ownership this close (do not duplicate): orders+AI = `sim.js` / `input.js` / `ai.js` (Guard + queued moves **in flight**); session/HUD = `session.js` / `hud.js`; audio = `audio.js`; graphics = `render3d.js` / `gl.js` / `materials.js` / `gpufx.js` / `terrain.js` / `meta.js` `GFX_PRESETS`. This pass **did not edit those files**, did not open extra 8901 tabs, and **did not land a second mechanic** — the remaining P1 systems either already have an unowned module (`intel.js`, `repairbay.js`) or they require a contended file.

---

## 0. Already landed (do not list as unfinished)

C&C3 / SupCom2 command verbs that are **in the tree today**:

| Verb | Where |
|---|---|
| Retreat / move-only vs attack-move | `input.js` `orderMove` / `moveMode`; sim `ustate===1` vs `2`, `umarch` |
| Stop (no idle-chase) | `input.js` `stopSelected` writes `uhold=1`; `hudflow.js` STOP vs HOLD readout |
| Hold position | `input.js` `orderHold`; `#holdBtn` in `index.html` / `main.js` |
| Patrol loops | `input.js` `patrolDraft` / `commitPatrolDraft`; sim `uPatrolRoute` |
| Ambush peel + base recall | `ai.js` `ambushQ` / `peelSnap` / `recallSnap` |
| Airlift + commander AI | `airlift.js`, `airlift-factions.js`, `commander.js` |
| Economy + in-match research | `economy.js` streaming mass/energy; `sim.js` `RESEARCH` / `applyResearch` |
| Dailies / hazards / endgame ladder | `daily.js`, `hazards.js`, `endgame.js` (Threat / Ops / Weekly / Mastery) |
| Save / account | `account.js` (identity, linking, `.mfsave`); `session.js` dropped-match recovery |
| The Four doctrine | `factiondoctrine.js`; codex `factions.js` |
| Guard + queued moves | **In flight** in `input.js` / `sim.js` (`orderGuard`, `ustate===7`, `uQueue`). Escort is not dug-in `umode===2`. Queue is a tac-row button, not shift-click. Do not start a parallel orders rewrite. |

Genre analogues that already exist as **systems**, not just copy: mass/energy + reclaim (SupCom), commander-as-hero (SupCom ACU / C&C3 epic unit), experimentals + Titan Gate (SupCom), GHOST stance + Kestrel scout (C&C3 stealth/recon), NOVA silo (C&C3 superweapon), Barricade/Gate walls (C&C3 garrison-lite / SupCom wall sections).

---

## 1. Veterancy

**C&C3:** three veteran ranks on units; promoted bodies are worth keeping. **SupCom2:** research/experimentals, not per-unit stars.

**Exists**

- Units: `ukills` / `uvet` in `sim.js`. Stars at 4 / 10 / 24 kills; `+15%` damage per star (`sim.js` kill path ~4577, combat mul ~5405). HUD paints stars (`hud.js` ~819, ~2720). Airlift preserves veteran payload (`airlift.js`).
- Towers: `B.vet` / `DEF_VET_TIERS=[6,16,32]`, `+12%` damage per tier, kill bounty (`sim.js` ~1298–1326).
- Banking the body: `repairbay.js` HQ/Factory/Airfield/Harbor/Titan Gate aprons mend out of combat at 35% chassis cost. Without that, a veteran hull was strictly worse than a fresh one (the file header states the C&C3 Repair Facility / SupCom build-arm comparison).
- Pickup stim: crate `vet` is a 30 s army damage buff, not a star (`sim.js` `CRATE_KINDS`).

**Missing**

- No HP/regen-per-star (C&C3 veterans tank more). Damage-only.
- No elite/hero unit promotion past ★3.
- No persistent career veterancy across matches (correct for skirmish; do not invent MMO ranks).

**Why it matters.** On a phone, micro is scarce. Stars + an apron are how “pull out and mend” pays. Without the apron, attack-move into the grinder is dominant.

**Mobile.** Already cheap: no extra dock button. Apron is drive-home, not an aura (intentional).

**Priority: P2 — accept.** Unit + defence vet + repair bay is the C&C3 loop. Do not add HP-per-star without a measured pass. Do not rebuild `repairbay.js`.

---

## 2. Formations

**C&C3:** attack-move blobs; limited formation. **SupCom2:** formation move is a headline.

**Exists**

- Six forms: Spread / Battle Line / Wedge / Box / Column / Arc (`input.js` `FORMS`).
- Spacing, tightening near enemies, Legion `asc_iron_discipline` (`factiondoctrine.js` wraps `formationSpacing`).
- Preview hologram (`formationPreview` setting in `meta.js`; draw in `hud.js` / `render3d.js`).
- Patrol and queued routes reuse formation slots per waypoint (`input.js`).
- Tutorial step `formation` (`tutorial.js`).

**Missing**

- No facing-hold / “turn in formation” after arrival (SupCom).
- No stagger / wall-of-fire facing independent of move heading.
- No formation-break under splash as a rule (splash already punishes clumps via `hm` crowd scaling in `projImpact`).

**Why it matters.** Phone taps issue one order to N units. The hologram is the readability layer that mouse-drag formations used on PC.

**Mobile.** Six forms is already a lot for a tac row. Do not add a seventh dock button (master plan).

**Priority: P2 — accept.** Polish only if Guard+queue proof shows holograms lying. Do not rewrite `input.js`.

---

## 3. Recon / stealth / radar

**C&C3:** shroud + fog, stealth, detectors, radar. **SupCom2:** omni/radar/sonar, weak cloak.

**Exists**

- Fog of war: 64×64 sensor grid in `hud.js` (`updateFog`, `fogPointVisible`, `fogEntityVisible`, `fogStartScan`). Units, buildings, carrier, and survey scans stamp coverage. Fog Bank wildcard and hazards shorten reach (`intelVisionScale`, `hazVisionMult`).
- Scout chassis: Kestrel `TYPES[].scout` (`sim.js` ~96). Wider visual bubble via `intel.js` `intelUnitVision` (`INTEL_VIS_SCOUT=18` vs air 14). Tutorial scouts the Kestrel (`tutorial.js`).
- GHOST stance (`umode===4`): Wasp / Vulture / Kestrel (`UNIT_MODES`). Firing breaks cover (`sim.js` ~5423). Default `intelCanTarget` in `sim.js` skips GHOST; `intel.js` takes that seam so detectors can pierce.
- Radar: Targeting Array (`BT.uplink`) and Research Complex stamp `fogRadar`. Minimap paints contacts without lighting the 3D model (`hud.js` ~1505–1522, `intelRadarContact`). **By design, radar is a command-map layer, not a second 3D reveal** (`intel.js` header).
- Detection: scouts, uplink, techlab, HQ, live scans stamp `fogDetect`. Cloaked hulls hide in fog-on 3D until detected (`intel.js` wraps `fogEntityVisible`).
- One-shot scans: Survey Beacon crates (`CRATE_KINDS` `scan`); commander Ghost Net (`commander.js` `fogStartScan`).
- Optics research is **weapon range**, not vision (`sim.js` `RESEARCH` `optics` → `resRngMult`). Account module “Sensor Mast” is also range (`develop.js` `MODULES` `range`).

**Missing**

- No dedicated stealth *faction* (C&C3 Nod cloak everywhere). GHOST is a stance on a few chassis.
- No jamming / radar-denial radius (`intel.js` records this as later, not invented here).
- No sonar-only water layer (harbor is a shipyard, not a sonar building).
- Uplink visual fog is still the generic 10-cell building stamp (`intelBldVision`). C&C3 radar lifted shroud; here the dish hears on the minimap and detects GHOST, it does not paint a huge 3D bubble. That is an explicit product split, not an unfinished stamp.

**Why it matters.** Fog makes landing routes and scouting real. Cloak without detectors is a player trap; detectors without cloak is dead UI. The intel module closed both.

**Mobile.** Minimap radar blips are the right density. A second 3D reveal radius on every uplink would wash the board at 412×915.

**Priority: P2 — accept what `intel.js` shipped.** Do not start a parallel fog rewrite in `hud.js`. Jamming / sonar are P3. Do not silently turn uplink into omni vision.

---

## 4. Engineering / reclaim

**C&C3:** engineers capture, repair, place buildings. **SupCom2:** reclaim mass from wrecks; engineers are the economy.

**Exists**

- Streaming build cost (`economy.js` `payStream`); Constructor is the mobile build-range source (`TYPES` `builder:1`).
- Reclaim tick (`sim.js` `reclaimTick`): fabricator drones, any unit on a wreck, Constructor at 2×, commander at 3.2×. Wildlife leaves no salvage (wreck-cap protection).
- Hotslots: Constructor BUILD / REPAIR / SALVAGE (`hotslots.js`).
- Constructor raise on foundations (`repairbay.js` `mfEngineerRaiseTick` — `tractorT` was previously Prospector-only).
- Field repair aprons (`repairbay.js`).
- Warden medic; Aegis Barrier structure repair; commander regen with in-combat gate.
- Account reclaim research (`develop.js` `recl`); Syndicate +18% salvage (`factiondoctrine.js`).
- No-Salvage op modifier (`endgame.js` `nofab`).

**Missing**

- Engineers do **not** capture (see §7).
- No area-reclaim order (SupCom drag-reclaim). SALVAGE walks to the nearest wreck.
- No reclaim-while-moving as a dedicated stance.

**Why it matters.** Reclaim is why wrecks are a front, not litter. On a phone, “tap SALVAGE” beats a reclaim cursor.

**Mobile.** Feasible as-is. Area-reclaim would fight the one-tap order model.

**Priority: P2 — accept.** Do not rebuild `repairbay.js` or `hotslots.js` salvage.

---

## 5. Walls

**C&C3:** almost none (garrison / buildings as chokes). **SupCom:** wall sections + gates.

**Exists**

- Barricade + Gate (`BT.wall` / `BT.gate`): block ground, friendly pass through gates (`sim.js` pathing ~5561). Chain-lay in `economy.js` (`lastPlaceRot`, stay in placement).
- `WALL_LINK=60`, linked runs draw as continuous spans (`render3d.js` / `hud.js`).
- Fortification score: connected walls + defences around HQ → cover, structure armor, regen, prod, tower range (`sim.js` `recomputeFort`, tiers Fortified / Stronghold / Citadel).
- Cheap (`cm:12` / `ce:16`, `bt:1.2`).

**Missing**

- No wall HP sharing / hardened linked HP (SupCom).
- No climb/jump over walls for specific chassis.
- AI walling is not a doctrine (AI spends on turrets/harbors first).

**Why it matters.** Walls are the phone-friendly “hold this approach” tool. Fort tiers make a ring *pay*, so they are not cosmetic.

**Mobile.** Chain-lay + sticky facing is the right input. Do not add a wall-draw spline.

**Priority: P3 — accept.** AI walling is a contended `ai.js` behaviour pass, not this close.

---

## 6. Superweapons

**C&C3:** faction nukes / ion / rift, long charge, counterplay (stealth, destroy silo). **SupCom2:** experimental-scale nukes / nukes as research.

**Exists**

- NOVA Missile Silo (`BT.nova`, `clvl:7`, req techlab). Map-wide, `NOVA={dmg:2800,aoe:235,cd:90,e:1500}` (`sim.js` ~1258, `novaFire` ~3858). Mk2/Mk3 shorten recharge. HUD charge ring (`hud.js` ~643).
- Commander signatures: Skybreaker (orbital), Seismic Decree, Lance (`commander.js`, `AB_CD`).
- Strike-code crate recharges NOVA (`CRATE_KINDS` `nova`).
- Terrain deformation / craters on strike (`terrain.js` comments; `novaFire` deform).

**Missing**

- No anti-nuke / interceptor layer (C&C3). Counterplay is “kill the silo” and energy starve (`1500` e).
- No second faction super (Legion/Syndicate/Brood reskins of the same silo via `factext.js` / `facticons.js`).
- No dual-silo / build-limit rule beyond cost and tech.

**Why it matters.** One honest map-strike is enough for a 10-minute phone match. A second silo class would eat the economy identity (energy as the NOVA bill).

**Mobile.** Tap-to-aim on the silo is feasible; a second superweapon button is not (dock is full).

**Priority: P3 — accept one silo.** Anti-nuke is P3. Do not add Campaign-scale “planet crackers.”

---

## 7. Capture

**C&C3:** engineer capture of buildings / husks is core. **SupCom2:** no capture; reclaim and rebuild.

**Exists**

- Neutral **economy nodes** (deposits / geysers) are claimed by building Extractor / Geo, not by converting a structure.
- Neutral **infestation** (team 2) is wildlife / Brood, not capturable buildings.
- Relics / crates / city salvage are pickups or wrecks, not ownership flips.
- `territoryScore` counts *your* buildings for Domination (`meta.js`).

**Missing**

- No engineer-capture of enemy structures, husks, or tech buildings.
- No C&C3-style “partial capture bar.”
- No converting a captured factory to your roster (would explode `FAC_ARSENAL` / save format).

**Why it matters.** Capture is C&C3’s mid-game. MASSFRONT’s analogue is **reclaim + rebuild + node control**, which is the SupCom loop. Mixing both on a phone double-loads the Constructor (build, repair, salvage, *and* capture).

**Mobile.** A capture bar needs a selected engineer parked on a husk — doable, but it fights SALVAGE and the apron. It also needs `sim.js` ownership transfer (contended).

**Priority: P3 — reject for this product.** Stay SupCom-shaped. If capture ever lands, it should be **neutral tech husks only**, not enemy factories, and it needs a product call.

---

## 8. Terrain advantage

**C&C3:** garrison / cover. **SupCom:** height affects guns less than pathing; cliffs still matter.

**Exists**

- Authored heightfield; hills occlude visually; pathing uses passability / naval mask, not slope-as-cover (`terragen.js` notes slope is not read for passability).
- Roads speed land units (`ROAD_SPD` in `sim.js`).
- Highland Scar rockslides are **sited on steep ground** so holding the high ground is a hazard trade, not a free perch (`hazards.js` `hazPickSteep`).
- Visual-only water bob (`render3d.js` `unitGroundY`); sim stays on the flat naval mask.

**Missing**

- No damage / range bonus from height.
- No garrison-in-building.
- No cover from trees/rocks (scenery is collision/decoration).
- No line-of-sight weapons blocked by ridges (targeting is 2D range).

**Why it matters.** True LOS + height combat is a PC-RTS luxury. On a 412×915 ortho board it reads as “my shot vanished.” Hazards already make cliffs *meaningful* without a silent 10% mul.

**Mobile.** Height-damage without a HUD chip is an invisible rubber band (hud-in-match is contended). LOS blocking needs sim + FX.

**Priority: P3 — accept visual + hazard terrain.** Do not add a silent `dealDamage` height mul. If it ever lands, it needs a readout and a measured table.

---

## 9. Naval depth

**C&C3:** Kane’s Wrath naval is a side theatre. **SupCom2:** navy is a real domain.

**Exists**

- Domain mask: land / air / naval (`sim.js` `mfDomainOfType`, `TYPES[].naval`, `findWater` / `NAVW`).
- Harbor + Sea Bastion; Corvette + Dreadnought; Legion/Syndicate domain muls (`sim.js` ~171–178).
- AI naval behaviour when the map has water (`ai.js` `AI_BEHAVIOR_TYPES.naval`, harbor cadence).
- Sea Bastion / Stormcaller meshes landed (master plan).
- GPU water swell / flow / foam (`terrain.js`, `gl.js`); visual bob only.

**Missing**

- Only two combat hulls. No sub, no sonar, no torpedo/anti-sub split, no hover-vs-keel.
- No beach assault rules beyond “naval field vs land field.”
- No ship wakes (graphics leftover, §A).
- Syndicate hover flavour is art/copy (`factext.js`); sim treats them as land/naval flags, not a third domain.

**Why it matters.** Standard `*_medium` maps have water, so a two-hull navy is enough to make Harbor a building. A third hull class is roster work in `sim.js` (contended, ARM-length trap).

**Mobile.** Two hulls + Harbor is the right cap. Submarines need stealth+sonar (intel already said jamming/sonar is later).

**Priority: P2 for wakes (graphics); P3 for more hulls.** Do not raise pop cap to “pay for” fleets. Do not bob `sim.js` pathing.

---

## 10. Rally points

**C&C3 / SupCom:** every factory has a rally flag.

**Exists**

- Player production buildings store `B.rally`; spawn uses it (`sim.js` ~6309). Naval/air respect domain.
- `#rallyBtn` in factory menu (`hud.js` ~3143); tap-to-place (`input.js` ~770, `main.js` ~2218).
- Rally flags drawn on the board (`hud.js` ~879).

**Missing**

- No per-waypoint rally chain (that is the **queue** work in flight).
- AI factories do not expose a player-visible rally (they use wave muster instead).
- No “rally on unit” (escort spawn) — Guard-in-flight is the related order.

**Why it matters.** Rally is how a phone player avoids selecting every Rhino that pops.

**Mobile.** One flag per factory is enough. Rally-on-unit needs Guard to be proven first.

**Priority: P2 — accept.** Prove Guard+queue; do not add a second rally UX.

---

## 11. Control groups

**C&C3 / SupCom:** Ctrl+0–9, shift-add, double-tap jump.

**Exists**

- Four platoons P1–P4 (`input.js` `ctrlGroups`, generation-safe `[index,gen]`). Long-press save, tap recall, optional camera focus (`main.js` ~2201).
- Saved form per group (`groupForms`).
- Tutorial stores P1 (`tutorial.js`).

**Missing**

- No 5–10 extra groups.
- No shift-add to group (would need `input.js`).
- No “select all of type” beyond existing type-select.

**Why it matters.** Four groups match four fingers of doctrine (main, siege, air, scout). Ten groups on a 412-px dock is unreadable.

**Mobile.** Four is the cap. Keyboard 0–9 is PC residue.

**Priority: P3 — accept four.** Do not add groups without removing something else from the dock.

---

## 12. Replay

**C&C3:** full match replay. **SupCom2:** limited.

**Exists**

- War Primer can be replayed from Settings (`warprimer.js` `replay`) — onboarding, not combat.
- Tutorial replay from Settings (`tutorial.js`); first-clear reward is gated.
- “Replay” in comments = capture harness / evaluating `sim.js` alone, not a recorder.
- Session snapshot is **resume after context loss**, not a replay file (`session.js`).

**Missing**

- No command stream, no deterministic lockstep replay, no after-action playback.

**Why it matters.** Replays are a PC QA/social feature. On a phone they fight OTA patches (script order changes break old streams) and the 1000-unit SoA (you would serialize every tick or every input).

**Mobile.** Infeasible as a ship feature this year. A lightweight “last 30 s kill-cam” still needs sim hooks.

**Priority: P3 — reject.** Keep session resume. Do not start a recorder.

---

## 13. Difficulty

**C&C3:** Easy–Hard + campaign. **SupCom2:** AI personality + handicap.

**Exists**

- Match Easy / Normal / Hard (`main.js` `difficulty` 0–2) drives `ai.js` income / HP / damage / build / wave cadence. Easy is a shallower threat clock so Training is not parity at 7 minutes (`aiThreat`).
- Threat Level 1–12 on top of that (`endgame.js` `threatEcon/Hp/Dmg/Tech`) — the difficulty the player **chose**.
- Operation modifiers (Iron Enemy, Fog Bank, Scarce Veins, …) priced individually.
- Wildcards as the random alternative; chosen mods win at start.
- Infestation vs Brood-as-enemy uses `infQty()` so Easy is not 325 bugs at 2 minutes (`HANDOFF.md`).
- AI must muster before attacking; faction resolved up front (`HANDOFF.md`).

**Missing**

- Dead `bias` tables in `ai.js` — authored as “what makes Legion feel different,” **never read**. Production identity is hardcoded (~672–691) and disagrees with the map (`BALANCE_REVIEW` §4.7).
- No Brutal / Cheat AI.
- No per-personality (rusher / turtler) beyond air/naval/land behaviour keys.

**Why it matters.** Difficulty the player did not choose is a punishment (`endgame.js` / `hazards.js` design rule). The unread `bias` table is a **maintenance trap**: the next tuner will “balance” weights the game ignores.

**Mobile.** Three match difficulties + Threat + Ops is already a lot of cards. Do not add Brutal.

**Priority: P1 documentation, P2 code — wire or delete `bias`.** That edit is `ai.js` (contended). Do not silent-flip it here. Personality beyond air/naval is P3.

---

## 14. Objectives

**C&C3:** mission scripts, bonus objectives. **SupCom2:** annihilation + research race.

**Exists**

- Four match goals (`meta.js` `GOALS`): Annihilation, Domination (territory at clock), Hive Purge, Last Stand. Resolver in `main.js` `checkVictory` (~996+). HUD line `goalStatus()`.
- Weekly contract rolls goal + map + mods (`endgame.js` `weeklyDef`).
- Dailies include goal-specific orders (`daily.js` `goalDom` / `goalPurge` / `goalSurv`).
- Training / First Contact / War Primer are onboarding, not authored campaign missions.
- Locked War Room Campaign card toasts only.

**Missing**

- No in-match bonus objectives (hold this ridge, escort, destroy the silo first).
- No scripted mission triggers beyond `story.js` flavour / KEEL training lines.
- QA noted a capture where the objective bar showed **enemy commanders left: 0** on a paused Standard drop (`docs/QA_SWEEP_2026-08-14.md`) — verify on a live unpaused match, do not “fix” from a still.

**Why it matters.** Four goals already rotate the same theatres. Scripted bonus objs are Campaign, which is locked.

**Mobile.** One goal chip is readable. A bonus stack would fight the hazard chip and the clock.

**Priority: P3 — accept four goals.** Do not invent campaign scripts. Fix the “0 commanders” readout only with a live packed-www repro (hud/session ownership).

---

## 15. Apply-or-accept — 14 Aug balance review

From `docs/BALANCE_REVIEW_2026-08-14.md`. **Nothing below is applied in this pass.** Contended files: `sim.js`, `ai.js`. Faction-identity: `factiondoctrine.js`.

| # | Finding | Call |
|---|---|---|
| 1 | `ARM` 33 vs `TYPES` 36 — Skycrane + two Massflesh states fall to LIGHT | **P1, apply when sim.js is owned.** Recommended `1,2,2` plus `assert(ARM.length===TYPES.length)`. Still in flight per master plan. |
| 2 | Basilisk T3 loses to Goliath per cost | **Document until product call.** HP/cool or cost; do not silent-nerf. |
| 3 | Legion Titan Gate is Basilisk-only | **Applied 2026-08-14.** `tgate:[8,26]`. Flavor already named the TITAN; no written forbid. |
| 4 | Syndicate ground ceiling 210 vs Mk3 Sentinel 238 | **Faction-identity call.** Thumper token would restore a 265 answer. |
| 5 | Bombard 400 vs Mk1 Mortar/Stormcaller/Bastion | Codex **already corrected** (`factions.js`). Range vs cost is a sim.js call. |
| 6 | Plasma Charger `aoe` 72 | Document; `aoe` 56 if retuned. |
| 7 | Concussion Mortar fires free at 520 | Document; energy tax if retuned. |
| 8 | Unread AI `bias` | **Wire or delete** in `ai.js` (see §13). |
| 9 | Nova widest roster + cost discount | Likely onboarding; leave. |
| 10 | `optics` id in two trees | Note only; separate stores. |

`FACTION_POP_CAP` and Standard `*_medium` are untouched. Brood research nodes that no-op are honest (AI DOSSIER).

---

## 16. Priority board (mechanics only)

Do **not** start: Campaign, MMO, Co-op, capture-the-factory, match replay, cascaded battle shadows, sim buoyancy, pop-cap raise, Brood-as-player, Nova-as-enemy, uplink-as-omni-vision, seventh dock button.

| Order | Item | Sev | Owner |
|---|---|---|---|
| 1 | Guard + queued moves — **prove**, do not rewrite | P1 | `input.js`, `sim.js` |
| 2 | `ARM` length 36 | P1 | `sim.js` (+ `airlift.js` class assignment) |
| 3 | Wire or delete AI `bias` | P2 | `ai.js` |
| 4 | Basilisk / Legion `tgate` / Syndicate siege / Bombard range | P1 product | `sim.js` / `factiondoctrine.js` after a call |
| 5 | Mid-tier CPU (MEDIUM still spends HIGH CPU) | P1 | graphics + sim tick; not a mechanic |
| 6 | Onboarding smoke path / e2e on packed 8901 | P1 | `AGENTS.md`, intro, War Primer |
| 7 | Water wakes / ripples (no sim bob) | P2 | graphics |
| 8 | Jamming / sonar / extra hulls / capture husks | P3 | later |

---

## A. Graphics leftovers

Not gameplay. Recorded so the next graphics owner does not rediscover them. **Do not treat these as mechanics work.** Do not bob `sim.js` pathing.

### A.1 Water wakes / ripples / sim buoyancy — P2

**Landed:** GPU swell, river flow, shore foam (`terrain.js` water program, `gl.js` `battlefieldWaterFlow`). Visual hull bob for naval (`render3d.js` `unitGroundY` — comment: sim stays on the flat naval mask). Cheap particle splash when ships move (`sim.js` naval particle ~5591).

**Open:** ship wake meshes, projectile/impact ripples on the water sheet. Master plan: after CPU budget is honest.

**Do not:** a buoyancy solver, or feeding swell into `findWater` / flowfields.

### A.2 Cascaded shadows — P3 (lab only)

Production battle uses **projected contact-shadow decals** + SSAO, quality-scaled by `GFX.shadowQ` (`render3d.js` ~121–124; `docs/ART-SYSTEM-V2-AUDIT-AND-PLAN-2026-08-09.md` §14). There are **no** shadow maps in the WebGL2 path.

Babylon CSM lives in `experimental/preview/` (`CascadedShadowGenerator`, 2 cascades) and is explicitly not the ship renderer.

**Call:** keep decals in battle. A bounded shadow-map test belongs in Arsenal / `?materiallab`, never as a Material V2 dependency.

### A.3 Physical-phone sign-off — P0 release

QA sweep and load health were **CDP / ANGLE D3D11 laptop**, viewport 412×915, not a device (`docs/QA_SWEEP_2026-08-14.md`, `docs/LOAD_HEALTH_2026-08-14.md`). Master plan: 412×915 **device** pass not done; APK assemble + shrink still P1; iOS IPA not from this Windows tree.

Music AAC path unverified on hardware (`HANDOFF.md`). Context-loss resume is `session.js` — needs a warm-phone swarm test, not a still.

### A.4 HIGH over-bloom — P2 polish

`GFX_PRESETS.high` uses two-pass quarter bloom, `bloomAmt:0.14`, 12-tap SSAO (`meta.js`). Bright-pass threshold is **0.925** so noon water and pale roofs stay out of the glow target; 0.90 over-bloomed (`mesh.js` ~2297–2300). Terrain glitter was already cut because it filled the HIGH noon ocean bright-pass (`terrain.js` ~731).

MEDIUM uses bloom without the extra gaussian (`bloomBlur:0`). HIGH still wants a **visual pass after CPU is honest** (master plan “HIGH polish”), not another threshold guess.

### A.5 Material lab extra gamma — P2, already patched in-lab

Production FS3D writes the filmic curve as display-referred (`1-exp`, no extra gamma). The V2 lab shader used to run `linearToSrgb` after that curve, which lifted charcoal into mid-grey — the **extra-gamma lab wash**. Current `materials-v2.js` (~268–271) **omits** that second gamma; debug views stay raw. `?materiallab=1` remains opt-in and is not the default battle path.

**Call:** do not reintroduce `linearToSrgb` after filmic. Do not promote the lab to default. World V2 stays HIGH/CINEMATIC (`GFX_PRESETS`; MEDIUM `worldV2:false`).

---

## B. This pass

Wrote this document. **No `src/` mechanic.** Remaining high-value verbs either already have unowned modules (`intel.js` recon/stealth/radar, `repairbay.js` aprons + constructor raise) or they live in contended files (Guard+queue, `ARM`, `bias`, Basilisk). A silent height-damage wrap or uplink-as-omni would fight those designs.

No commit. No extra 8901 tabs. No `sim.js` / `input.js` / `ai.js` / in-match HUD / `galaxyui.js` / audio / graphics edits.
