# MASSFRONT — Expert Game, Level and Visual Design Plan

## North star

MASSFRONT should feel like a readable large-scale RTS on a phone, not a PC RTS
shrunk into touch controls. Every map must create a battle story: establish a
foothold, scout a contested resource route, make a combined-arms decision, and
break or survive a decisive push. The player should understand that story from
the battlefield without opening a text panel.

## Release definition

The first public release is **single-player Pre-Alpha**, not co-op/versus.
It needs one complete, stable path from first launch through tutorial, skirmish,
rewards, research, saving, updating and replay. Multiplayer is a separate
production milestone after this is dependable on target phones.

## Stage 0 — Release gates

1. Every menu action has one clear result, a reachable back action, and a
   44px-or-larger touch target.
2. Test low, mid and high Android devices for a 15-minute session: boot,
   deployment, 300+ units, artillery, night, end screen, save and resume.
3. Resolve remaining missing media and updater rollback issues before adding
   live features. A build that can update but cannot reliably recover is not
   ready for public testing.
4. Label all unavailable modes as in development. Never make a card look
   playable when it opens local skirmish instead.

## Stage 1 — Art/material language

### Material rules

- Use semantic material roles: hull, trim, tracks, canopy glass, warm windows,
  cool windows, solar roof, faction surface, scorch, crater, rubble and ember.
- Keep physical texel density constant. Mesh UVs are world-scaled and
  face-projected; new models must use MeshBuilder primitives or supply
  equivalent physical UVs. Never stretch a 0–1 texture across a building side.
- An emissive surface has gameplay meaning: power, active shield, charged
  weapon, sensor, damaged heat or collectible. It is not generic decoration.
- Give each faction a constrained material family:
  - Nova: composite ceramic, carbon, restrained cyan instrumentation.
  - Ascendancy/Legion: cast iron, rivets, thermal orange, siege soot.
  - Syndicate: dark nano panels, mirror glass, gold conductors, cyan phase flow.
  - Brood: chitin, membrane, wet vein, controlled bioluminescence.

### Destruction language

- Kinetic: steel fragments, dark impact scar, dust.
- Beam: melted glass/metal streak, brief hot core.
- Explosive: crater, radial slag, persistent rubble and smoke.
- Fire: blackened ground, ember glow, longer smoke.
- Bio: contaminated soil, acid mist, organic residue.

Do not add these as unrestricted particle spam. Use persistent decals for
history, short particles for impact, and volumetric smoke only for large events.

## Stage 2 — Map and level design

Build three map-size bands around match length and decision density.

| Size | Target session | Shape and purpose |
| --- | --- | --- |
| Strike | 8–12 min | One central contest, two flank routes, tutorial/quick play |
| Front | 15–22 min | Three resource lanes, a defensible expansion, two viable attacks |
| Theatre | 25–35 min | Asymmetric terrain, multiple objectives, carrier/flanking play |

Each map needs:

1. A protected starting shelf with enough room to learn base placement.
2. One low-risk resource field, one contested field and one high-risk payoff.
3. At least two movement choices: a fast exposed route and a slower protected
   route. Artillery must have a useful but vulnerable firing shelf.
4. A readable boundary: water, canyon, storm wall or holographic exclusion
   grid before decorative fake land.
5. One map-specific gameplay modifier, visibly telegraphed:
   collapse zones, electrical storms, toxic corrosion, lava vents, snow
   occlusion or phase fog. Never stack more than two modifiers in a first-run
   mission.

## Stage 3 — Combat and faction design

Give every combat role a simple answer to “what does this win against, and what
punishes it?”

- Infantry: capture/screen; vulnerable to flame and splash.
- Light vehicle: flank and raid; vulnerable to anti-tank.
- Heavy armor: pushes lines; vulnerable to artillery, air and immobilisation.
- Artillery: breaks fixed defenses; vulnerable while moving and at close range.
- Anti-air: protects columns; weak into tanks and structures.
- Air: bypasses terrain; countered by AA and interceptors.
- Support: repairs, shields, control; weak alone.
- Experimental: visible strategic commitment, not a generic bigger tank.

Faction research must unlock actual mechanics, not only describe them. Limit
each faction to three unmistakable signature systems in the first release.
Examples: Ascendancy siege discipline, Syndicate phase network, Brood
Tidecaster/Massflesh. Tooltips must show strong-against and weak-against icons.

## Stage 4 — Mobile RTS interface

The command dock has three jobs only: select, issue orders, inspect. It must not
become a second strategy game.

1. Keep one active secondary dock row at a time.
2. Prioritise high-frequency RTS commands: army select, idle constructor,
   build, stop, formation, patrol, stance and camera.
3. Use world-space previews for routes, formation landing positions, range,
   placement validity and resource-node ownership.
4. Selection opens a compact purpose card; detailed inspection replaces the
   panel and always has a clear back action.
5. Notifications use a dedicated rail. They never cover the build, production
   or command controls.
6. Hide optional visual detail at strategic zoom before hiding tactical state.

## Stage 5 — First-time player flow

The tutorial is a protected mission, not a string of tips.

1. Move camera and select the Commander.
2. Deploy base and place an extractor on a marked node.
3. Find the idle Constructor button and establish a forward build zone.
4. Produce two complementary unit roles.
5. Demonstrate fog/scouting, a formation order, and an enemy counter.
6. Defend one short wave with a tower and a mobile response.
7. End with an explicit reward, account research data and a recommended next
   skirmish.

Every instruction highlights the target control or world object and waits for
the player action. No step may silently return to the front menu.

## Stage 6 — Progression and retention

- Session inventory: temporary pickups, consumables and recovered modules.
- Account inventory: crafted gear, cosmetics and unlocked module slots.
- Match loss still grants small, transparent recovery rewards; quitting early
  does not.
- Research is a visual node graph. Nodes grant concrete permissions, slots or
  abilities; stat growth comes from equipment and battle choices.
- Building upgrades show the complete path, costs, timing and resulting stat
  difference. Recycle shows its exact refund before confirmation.

## Stage 7 — Co-op and versus, after single-player release

Do not build multiplayer UI first. Build the service spine first:

1. Account handle lookup, friend requests, accept/decline/block and privacy.
2. Presence and invite-only lobby service.
3. Server-authoritative or proven deterministic lockstep match simulation,
   reconnect, desync recovery, surrender and result validation.
4. Two-player co-op against AI.
5. One-versus-one ranked/unranked play only after networking telemetry proves
   match completion and fairness.

This order protects player trust and avoids shipping a social screen that cannot
reliably put two players in the same battle.
