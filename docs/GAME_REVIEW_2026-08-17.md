# MASSFRONT — Full System Review

**Date:** 2026-08-17 · **Source version:** 1.33.44 live, 1.33.45 staged · **Basis:** code-level audit

## How this was produced, and its limits

This is a **code and architecture audit**. I read the source directly and cite files and lines. I did **not** playtest every system, and I did not measure performance on a real device. Where I infer rather than confirm, I say so. Anything marked *unverified* is a hypothesis to test before spending money on it.

Scale established: **7 factions**, **4 planets** (Aelos / Pyraeth / Nordhall / Vespera) across 4 systems → **16 regions** → **48 maps**, **62 unit types**, plus commanders, research, hazards, endgame and a meta layer.

Verdict up front: the **content and simulation layers are far more mature than the interaction layer**. Most of what is missing from your list is UX and feedback, not engine capability. That is the cheaper half.

---

# A. World, content and lore

## 1. Factions — STRONG

7 factions in `src/factions.js`, with per-faction unit model files (`models-units-nova/legion/syndicate/brood`, `models-machine`, `models-infestation`) and per-faction naming in `src/factext.js` — the extractor is a "Tithe Rig" with ability *TITHE*, "Clamps the extraction beam onto a working phase-crystal field and takes its due".

**Gap:** identity is carried by models and names; thinner in *mechanics*. `factiondoctrine.js` exists but doctrine is mostly stat nudges.
**Recommend:** one signature *rule* per faction, not a stat delta.

## 2. Planet bios — STRONG, UNDER-EXPOSED

`PLANETS` in `src/engine/gl.js:1768` is genuinely rich: `ds`, `biodome`, `sector`, `diameter`, `dayLen`, `temp`, `climate`, `lore`, `atmosphereColor`, `ringColor`, and per-region `poi` + `hook`.

**Gap:** a lot of authored text for how briefly it is seen.
**Recommend:** surface `hook`/`poi` at match load and on the results screen. Zero new content, meaningful perceived depth.

## 3. Galactic exploration (the "Mass Effect 2" ask) — EXISTS, BUT IS NOT EXPLORATION

Real conquest system in `src/galaxyui.js`: planets → regions → maps, gated by `mfConquestMapOpen`, `mfConquestRegionComplete`, `mfConquestDifficultyFloor`, tracked via `META.mapWins`.

**Gap:** it is a **progress gate**, not exploration. Nothing is discovered, scanned, or chosen at cost. The ME2 loop is *scan → find → decide → commit*.
**Recommend — highest-value item on your list:** add a scan/intel layer. Regions start unknown; a cheap action reveals modifiers, reward and threat; the player *chooses* where to commit. The data model already supports it — this is UI plus one `META` flag per region.

## 4. Brood threat and lore — PARTIAL

`infTier()` scales infestation, nests spawn and spread with toasts (`src/game/sim.js:2357`), and `models-infestation.js` carries the art.

**Gap:** the Brood escalate *numerically* but never change the player's plan. There is no dread curve.
**Recommend:** stage the threat — tier thresholds that add a *behaviour*, not just a count: burrowing, night aggression, an infested structure that must be purged.

## 5. Blood / brood pools — MINIMAL

Referenced only in `factext.js` and `ui/hud.js`; `WRECK_BIO` distinguishes nest wreckage from structural.
**Recommend:** low cost, high flavour — persistent creep/blood decals stamped on the terrain canvas at nest deaths, reusing the `paintResourceGroundNode` stamping path.

## 6. Dynamic city / map features — ENGINE READY, CONTENT THIN

Terrain is capable: `cityGroundAt`, `relightCivicAlbedo`, `stampHardscapeAlbedo`, `paintFadingRoad`, `makeOrganicFoundation`, biome kits.
**Gap:** regions are described as distinct in lore but render similarly.
**Recommend:** bind `PLANETS[].theme` harder to terrain kit and prop set so Nordhall *reads* glacial and Pyraeth *reads* storm-lashed, without new art.

---

# B. Core gameplay

## 7. Unit and structure production — SOLID

Queue in `B.queue`; escrow model in `src/game/economy.js` — `MF_BUILD_ESCROW_FRAC=0.02` then pay-as-you-progress via `bldTick`. Keeping player and AI on one helper is correct and well reasoned.

## 8. Production speed, stacking, arrows, locked units — PARTIAL, NARROWER THAN FIRST STATED

**Correction.** An earlier draft claimed there was no queue stacking UI. That was false. `renderQueue()` (`src/ui/hud.js:3282`) with `queueStacks()` (`:3249`) already merges consecutive runs into `.qPlate` chips carrying an icon, a clipped name, a **`×N` count badge** and a `.qBar` progress bar. Hold-to-batch queues ×5, cap 30, and cancelling refunds partial cost via `cancelQueuedUnit`.

**What is genuinely missing:**

1. **Unit production is the only system with no numeric time feedback.** Structures show `UPGRADING… Ns` (`hud.js:2921`), research shows `Researching X — Ns` (`:3291`), Nova shows charge seconds. Units get a bar width only, head item only — `bar.style.width=…clamp(B.prodT/T.bt,0,1)…` (`:3341`). The card never displays `bt` at all, only `cm`/`ce`.
2. **Locked units are invisible; locked structures are not.** Structures get `.locked` greyscale, a 🔒 `.lockOv`, a reason line (`CDR LV 4`, `Needs Tech Lab`) and an explanatory toast. Tier-2 chassis in a tier-1 factory are simply **absent from the grid** (`hud.js:3166`) — no card, no padlock, no hint they exist. Faction-doctrine cuts vanish just as silently through `factionDoctrineRoster` (`factiondoctrine.js:70`).
3. **Five lock gates, presented inconsistently:** commander level (`clvl`), prerequisite structure (`req`), naval domain, factory tech tier, and account research (`develop.js` — which gates *rights to craft*, never build cards).
4. **The queue is invisible with the panel closed** — only a small world-space progress bar under the factory.

**Recommend:** ETA from `bt` on the queue head, `bt` on the card, and render locked units as `.locked` cards the way structures already are.

## 9. Resource gathering — SOLID, NOW CORRECT

Deposits and geysers with tiers and bands; the extractor deploys a Prospector miner. Two reservation bugs were fixed this session: the leak on failed build start (`economy.js:467`) and the claim/release predicate mismatch (`sim.js:1741` vs `1848`).

## 10. Destruction — GOOD

`addWreckField` with `WRECK_STRUCT` / `WRECK_BIO`, staged collapse, salvage paid to whoever holds the ground afterwards. Deliberate and well commented.

## 11. Weapons and artillery — BROAD

Styles: `laser`, `lance`, `thermal`, `sniper`, `tracer`, `repair`, `arc`, `orbital`, plus the new `mining`. Artillery spans `develop.js` and `airlift.js`.
**Gap:** nothing teaches *why* a weapon suits a target. `wk`/`tg` fields exist but are never explained.

## 12. Physics — NOT A SYSTEM, AND SHOULD NOT BE

No rigid-body or ragdoll layer. Projectiles are parametric; recoil and bob are authored sinusoids. **This is the right call for 10k units on mobile.**
**Recommend:** if you want physicality, add impulse-driven debris and decals, not simulation.

## 13. Tower mechanics — SOLID

`BLD_TUR_MDL`, `BLD_TUR_H`, `BLD_TIER_MDL` with per-tier variants; charge-gated emissives for `rail`, `minelaser`, `plasma`. Well covered — the `?defenseshow=1` lab exists to capture these families.

## 14. Commanders — STRONG

`src/game/commander.js` is 1,016 lines: per-faction heroes, abilities, XP via `heroXP`. Hero swap by `playerFaction` is real, not cosmetic.

## 15. Research and mods — PRESENT, PRESENTED AS LISTS

`applyResearch` / `devBuy` in `src/develop.js`; modifiers through `endgame.js` and `galaxyui.js`. Functional, but presented as inventories rather than choices with tradeoffs.

---

# C. AI

## 16. Navigation — BETTER THAN EXPECTED

Flow-field steering for long marches (`sim.js:5881`) plus physical separation (`5910`). Armies route around lakes rather than pile into them.

## 17. Tactics — SHALLOW

`src/game/ai.js` is a priority ladder: energy-starved → pgen, then mex, fac, then behaviour-specific (air / naval / turtle). Behaviours are real (`aiBehaviorKey`), with per-seat wallets and army caps.

**Gap:** no engagement intelligence — no focus fire, no retreat when losing, no combined arms, no counter-composition. `aiPickTarget` is proximity and priority based.
**Recommend in order:** (1) retreat below an HP threshold, (2) focus fire within a wave, (3) composition response to what the player fields. Items 1 and 2 are small and move perceived competence the most.

---

# D. Interface — the weakest layer

## 18. Selection — BOX SELECT EXISTS, BUT IS BUTTON-GATED

**Correction.** An earlier draft of this document claimed no marquee existed. That was false — the claim came from grepping one vocabulary. A complete screen-space box select is present and working:

- Armed by `#boxBtn` — `src/main.js:2464`, `boxMode=!boxMode`, toast "Drag on the map to box-select your units"
- Started `src/ui/input.js:998` (only when `boxMode`), drawn `:1040` into the DOM overlay `#selbox` (`index.html:61`, `ui.css:65`)
- Committed `:1103` — projects every live unit with `w2s` and tests a screen AABB

**The real gaps**, which are narrower:
1. It must be **armed by a button** — a bare drag pans the camera instead
2. **One-shot** — `boxMode=false` after every box (`input.js:1107`)
3. **No shift-additive** — always `clearSel()` first (`:1111`)
4. **Units only** — no buildings, no enemy capture

**Why a bare drag is hard:** one-finger drag is the unconditional camera-pan fallback (`input.js:1047`) with no distance or time threshold, and it competes with artillery aim, formation preview, a 28 px queue-path latch, ghost drag, a 520 ms long-press and the 9 px `moved` flag. The work is **gesture arbitration**, not building a marquee.

**Constraint for any implementation:** `s2w` (`mesh.js:3240`) is a terrain raycast — up to 900 march steps plus 26 bisections. Project world→screen per unit with `w2s`, as the existing commit already does. Never call `s2w` per unit in a drag loop.

## 19. Grid snap and gradient build zones — MOSTLY BUILT, AND PARTLY A DELETION

More exists than first stated. `bzGrid` is a `Uint8Array(BZN*BZN)` = 224×224 with three states `BZ_OUT` / `BZ_OK` / `BZ_BAD` (`sim.js:3744-3757`), rasterised every 1.2 s by `markBuildZone()` (`:3758`) in three passes: territory union, walkability sweep, then footprint/relic/deposit occupancy. It is already drawn as a 3D ground-decal batch (`render3d.js:1966-2002`) with red plates on `BZ_BAD` and cyan edge segments via `bzEdge()`.

**The headline problem is a guard, not a missing feature:**

```js
if(bzShow>0&&!placing){   // render3d.js:1966
```

The entire territory overlay is suppressed **the moment the player picks up a building ghost** — exactly when it is needed. The in-source comment justifies this by saying the placement UI "already draws the exact local grid, invalid footprint cells, alignment guides and builder ranges in hud.js" — but that code lives inside `renderLegacySprites`, which is dead (see §32). So during placement the player gets only the ghost's red/green outline.

**Recommended implementation, cheapest correct path:** upload `bzGrid` as a data texture and tint in the terrain shader, following the fog-of-war pattern (`updateFog`, `hud.js:236`). The fog texture is `RGBA8` but **only `.a` is ever read, with RGB deliberately zeroed and documented as such** (`hud.js:230`) — so build validity can ride in the unused R/G/B channels: no new textures, no new texture units, no new binds. Tint alongside fog at `mesh.js:2091`. `LINEAR` filtering across 20-unit cells produces the gradient for free.

**Do not** implement it with `FX.plate`/`FX.line` decals: caps are 2600 and 9000 instances, and an in-source comment at `render3d.js:1961` records that a full-territory scan "emitted thousands of plates/lines per frame and made the battle appear frozen."

**Watch:** `bzGrid` refreshes at 1.2 s while `placementValid()` runs per frame, so force a `markBuildZone()` on `startPlacing()` or accept up to 1.2 s of drift between the gradient and the ghost colour.

## 20. Hotbars — PARTIAL

`src/ui/hotslots.js` (423 lines) plus commander hotslots. Abilities only — no unit or production binding.

## 21. Waypoint arrows — PRESENT, WEAK

Patrol drafting is real: `beginPatrolDraft`, `addPatrolWaypoint`, `refreshPatrolRoute`, `patrolTargetRows`, with formation support (`formationOffsets`, `formationPreviewSlots`).
**Gap:** the route is not legibly drawn in 3D.
**Recommend:** chevron ribbons along the route reusing `addBeamRibbon`, which already produces that shape.

## 22. Veterancy and rank — DATA EXISTS, DISPLAY THIN

Per-unit veterancy and per-structure Mk/tech pips are drawn in `src/ui/render3d.js`.
**Gap:** no rank *identity* — no promotion moment, no roster view.

## 23. Menus — RECENTLY CHURNED

The front strip relabels at runtime via `mfRenameFrontNav` (War Room→OPERATIONS, Mega→SANDBOX, now removed). HTML captions and displayed labels disagree by design.
**Risk:** this indirection already confuses your own docs — `MENU_HUB_RESEARCH_2026-08-15.md` notes "HTML defaults still say…".
**Recommend:** collapse the relabel; make the HTML say what the player sees.

---

# E. Presentation

## 24. Music — GOOD ARCHITECTURE

Intensity-driven bed selection: `AUD_MUSIC_FOR = i > 0.55 ? 'mus_combat' : i > 0.22 ? 'mus_tension' : 'mus_ambient'`, with match and screen transitions (`audMusicEnterMatch`, `audMusicEnterScreen`).

## 25. Radio VO — REAL, INCOMPLETE

`RADIO_COPY` covers select, move, retreat, attack, build, patrol, hold, guard, stop, ability, deploy, underfire, victory, defeat. `VO_ACTION_ALIAS` maps `retreat→stop`, `underfire→attack`, `victory→ability`, `defeat→hold`, `guard→hold` because **those five banks do not exist**. 1.33.42 correctly suppressed VO rather than play a wrong line (`audio.js:1684`).
**Recommend:** recording those five per faction is the highest-value audio work available — the code path is already correct and waiting for the files.

## 26. Effects — RICH, WITH A CAUTION

Beams, bursts, helixes, GPU sparks, wreck fields, superweapon detonation. **But** this session's white-disc bug came from exactly here: additive stacking with no budget at a fixed point, and two prior in-source comments blame the same 0.936 bright-pass.
**Recommend:** a per-point additive budget, or a standing rule that any beam clamped to a static target uses the `mining` style.

---

# F. Platform

## 27. Mobile friendliness — THE PRIMARY TARGET, HANDLED

`perfScale`, `mfVfxQ()`, LOD bands (`renderBand`, `unitTickLod`), `sceneryStep`, headlight caps, `beamLimit`. Real budgeting throughout, not decoration.

## 28. Desktop / GPU vendor detection — DATA CAPTURED, NEVER USED

`WEBGL_debug_renderer_info` is read twice in `src/engine/gl.js`: once to detect *software* rasterisers (swiftshader / llvmpipe / lavapipe), once to store `window.__MF_GL_INFO.renderer`.

**Finding: nothing branches on AMD vs NVIDIA vs Adreno vs Apple.** The string is stored and ignored.
**Recommend:** a vendor → default-quality table at boot. Close to free, and precisely the item you asked for.

---

# G. Meta systems

## 29. Rewards and unlocks — PRESENT, UNSHAPED

`metaGrant`, `META.owned`, `META.mapWins`, store and inventory in `src/storeui.js`, daily contracts in `daily.js`.
**Gap:** rewards are granted but never *anticipated*. Nothing shows the next unlock.
**Recommend:** a visible "next unlock" track — the cheapest retention change available.

## 30. Revenue — INFRASTRUCTURE, NO PRODUCT

`authportal.js`, `economy-net.js`, `adboards.js` (1,142 lines of in-world ad boards) and a store all exist.
**Gap:** no defined offer.
**Recommend:** decide the model first. Cosmetic commander skins fit this game and do not touch balance; the plumbing is largely in place.

## 31. Update system — SINGLE-STAGE, FULL PAYLOAD

`src/updater.js` fetches one `MASSFRONT-v<ver>-update.js` (~54 MB) with sha256 verification, IndexedDB storage, stable/preview channels and rollback.

**Finding: there is no delta or per-file update path.** Every fix, however small, is a 54 MB download.
**Recommend — your "multi-stage internal system upgrade":** add a `patch` manifest kind listing individual file overwrites with hashes, applied over the cached payload. The manifest is already versioned (`schema`, `optionalPacks`, `packsIndex`), so this extends cleanly rather than replacing anything.

---

## 32. Dead code — `renderLegacySprites` never runs

`renderLegacySprites` (`src/ui/hud.js:252`) is roughly 900 lines of 2D sprite rendering — deposits, geysers, crystals, building overlays, the mex rotor — and it is **called from nowhere**. The only reference in the entire tree is `tools/test-fog-pickups.mjs`, which inspects it via `.toString()`.

Two consequences worth acting on:

1. **1.33.42 edited this function.** Its `if(!use3D)` gating of deposit and geyser sprites, and the `Bd.type==='mex'&&!use3D` rotor guard, are changes to code that cannot execute.
2. **It is cited as justification elsewhere.** The `!placing` guard on the build-zone overlay (§19) points at it as the thing that draws placement guides. Since it never runs, that justification is void.

**Recommend:** delete the function and the comments that reference it, or wire it back in deliberately. Leaving ~900 lines of plausible-looking dead rendering in the file has already caused one wrong architectural decision and one wasted edit.

# Proposed next update

Chosen for impact per unit of risk.

**Tier 1 — interface, biggest perceived gain, lowest risk**

1. **Drag-select arbitration** — the marquee exists; promote a bare stroke to it on a distance/time threshold and add shift-additive. Not a rewrite.
2. **Build-zone gradient** — delete the `!placing` guard, then pack `bzGrid` validity into the fog texture's unused RGB and tint in the terrain shader.
3. **Production legibility** — ETA from `bt`, `bt` on the card, and show locked units as `.locked` cards instead of hiding them.

Note how much of Tier 1 is *unblocking or exposing existing systems* rather than building new ones. That is the shape of this whole review: the simulation is ahead of the interface, and several requested features are already written but invisible.

**Tier 2 — cheap systemic wins**

4. GPU vendor → default quality tier (data already captured)
5. Waypoint chevron ribbons via `addBeamRibbon`
6. "Next unlock" track on the front screen

**Tier 3 — needs design decisions from you**

7. Region scan/intel layer (the real ME2 ask)
8. AI retreat and focus fire
9. Delta update manifest

**Explicitly deferred** — multi-week each, not one release: per-faction VO recording, new Brood enemy types, dynamic city regions, revenue product design.
