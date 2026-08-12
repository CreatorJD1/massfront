# MASSFRONT — Art V2 Unit Bespoke-Pack Inventory

Updated: 2026-08-10

This is the source-backed backlog for authored Unit Material V2 packs. It is
intentionally separate from the live semantic V2 renderer. A unit listed here
as **semantic V2** already receives the shared battle material treatment
(faction masks, micro-surface detail, damage response, and material LOD), but
does **not** yet have its own authored BaseAO / NRE / Masks texture triplet.

## Current distinction

| State | Meaning |
| --- | --- |
| Semantic V2 | Live shared material response. It is not a unique texture pack. |
| Bespoke pack | Asset-specific `BaseAO`, `NRE` (normal/roughness/emissive), and `Masks` maps on the model's authored UVs. |
| Showcase prototype | A deliberately isolated V2 proof asset, not proof that a complete faction has bespoke maps. |

The current V2 showcase registry in `src/engine/materials-v2.js` contains only
`novaHeavyTankV2`, `novaFactoryV2`, and `novaCommanderV2`. The same file marks
the commander entry as a semantic bake; do not call it a finished authored map
set until imported map files exist and are validated. No roster unit below is
therefore marked complete solely because it uses Semantic V2.

## Stage 0 — pack contract (once, before per-unit authoring)

Every bespoke unit pack must provide, at mobile resolution appropriate to the
unit tier:

1. `BaseAO`: authored base colour plus baked AO.
2. `NRE`: tangent-space normal XY, roughness, and restrained emissive.
3. `Masks`: structural metal, faction primary, faction secondary/role, and
   wear/damage.
4. A damaged/burning variant or compatible damage mask where the unit can use
   the existing destruction material path.
5. A source note with model builder, faction, unit ID, UV source, resolution,
   and verification screenshots at Arsenal, tactical, and strategic distance.

Use one shared map per intentionally shared chassis only after checking that it
does not hide a role difference. A shared builder is not automatic approval for
a shared pack.

## Stage 1 — Nova Vanguard (blue)

Source registry: `src/engine/models-units-nova.js`, `UNIT_MDL_NOVA`.

| IDs | Unit | Current V2 state | Bespoke-pack stage |
| --- | --- | --- | --- |
| 4 | Commander | semantic V2; showcase commander prototype exists | N1 — first imported authored commander pack |
| 1 | Rhino | semantic V2; heavy-tank showcase prototype exists | N2 — first battle-quality imported tank pack |
| 0, 9 | Striker, Pyro | semantic V2 | N3 — infantry/servo family |
| 2, 8, 26 | Goliath, TITAN, Basilisk | semantic V2 | N4 — walkers and experimental armor |
| 3, 16, 20, 21, 27 | Thumper, Bombard, Reaper, Cinder, Harbinger | semantic V2 | N5 — artillery / launcher family |
| 6, 10, 22, 23 | Longbow, Vulture, Lancer, Resonator | semantic V2 | N6 — precision / AA / energy weapons |
| 5, 17, 25 | Wasp, Raptor, Kestrel | semantic V2 | N7 — aircraft family |
| 14, 15 | Corvette, Dreadnought | semantic V2 | N8 — naval family |
| 7, 18 | Hornet, Scorcher | semantic V2 | N9 — assault vehicle family |
| 11, 19, 24, 32 | Bulwark, Constructor, Warden, Prospector | semantic V2 | N10 — support / utility family |

## Stage 2 — Dominion Legion (red)

Source registry: `src/engine/models-units-legion.js`, `UNIT_MDL_LEGION`.

| IDs | Unit | Current V2 state | Bespoke-pack stage |
| --- | --- | --- | --- |
| 28 | Lord Darion Vex | semantic V2 commander path | L1 — hero commander |
| 0, 9 | Striker, Pyro | semantic V2 | L2 — breacher / furnace infantry |
| 1, 18 | Rhino, Scorcher | semantic V2 | L3 — slab armor / flame armor |
| 2, 8, 26 | Goliath, TITAN, Basilisk | semantic V2 | L4 — walkers and experimental armor |
| 3, 16, 20, 21, 27 | Thumper, Bombard, Reaper, Cinder, Harbinger | semantic V2 | L5 — siege and mortar family |
| 6, 7, 10, 22, 23 | Longbow, Hornet, Vulture, Lancer, Resonator | semantic V2 | L6 — missile / hunter / sonic family |
| 5, 17, 25 | Wasp, Raptor, Kestrel | semantic V2 | L7 — aircraft family |
| 14, 15 | Corvette, Dreadnought | semantic V2 | L8 — naval family |
| 11, 19, 24, 32 | Bulwark, Constructor, Warden, Prospector | semantic V2 | L9 — shield, engineer, medic, miner |

## Stage 3 — Syndicate Coalition (green)

Source registry: `src/engine/models-units-syndicate.js`, `UNIT_MDL_SYNDICATE`.

| IDs | Unit | Current V2 state | Bespoke-pack stage |
| --- | --- | --- | --- |
| 29 | Broker Lys Renn | semantic V2 commander path | S1 — hero commander |
| 0, 9 | Striker, Pyro | semantic V2 | S2 — strider / incinerator infantry |
| 1, 2, 18, 26 | Rhino, Goliath, Scorcher, Basilisk | semantic V2 | S3 — nano armor / experimental family |
| 3, 16, 20, 21, 27 | Thumper, Bombard, Reaper, Cinder, Harbinger | semantic V2 | S4 — phase artillery family |
| 6, 7, 10, 22, 23 | Longbow, Hornet, Vulture, Lancer, Resonator | semantic V2 | S5 — beam / rocket / sonic family |
| 5, 17, 25 | Wasp, Raptor, Kestrel | semantic V2 | S6 — drone / gunship / scout family |
| 14, 15 | Corvette, Dreadnought | semantic V2 | S7 — skimmer / capital family |
| 11, 19, 24, 32 | Bulwark, Constructor, Warden, Prospector | semantic V2 | S8 — shield, builder, service, miner |

## Stage 4 — Brood Swarm (AI-only)

Source registries: `src/engine/models.js`, `FAC_KIT.horde`; and
`src/engine/models-units-brood.js`, `UNIT_MDL_BROOD`.

The Brood must use the organic material family—not mechanical packs recoloured
purple/green. Pack channels remain compatible with the renderer, but their
meaning is chitin/tissue/bone/mutation/wound/bioluminescence.

| IDs | Unit | Current V2 state | Bespoke-pack stage |
| --- | --- | --- | --- |
| 30 | The Brood Sovereign | semantic V2 organic commander path | B1 — hero organic material study |
| 31 | Brood Tidecaster | semantic V2 organic path | B2 — synaptic tissue / lumen study |
| 32 | Prospector | semantic V2 organic path | B3 — grub / mineral-sack study |
| 0–27 | Horde role replacements | semantic V2 organic path | B4 — castes by silhouette: beast, spitter, bombardier, leviathan, flyer, swimmer, support |
| 12, 13 | Ravager, Alpha Ravager | semantic V2 organic path | B5 — assault-caste family |

## Required order of execution

1. Finish N1/N2 using imported, authored UV maps and compare them to the V2
   showcase under identical light.
2. Convert the rest of Nova by the family stages above, verifying every pack
   at tactical and strategic camera distance before moving on.
3. Repeat Legion, then Syndicate. Do not share Nova maps across those factions.
4. Move to Brood only after mechanical map packing, LOD, and damage states are
   proven; Brood requires a separate organic material grammar.
5. Record every completed pack in this document with source paths and screenshot
   evidence. A green semantic tint or global micro-detail pass is never a
   completion criterion.

## Explicit exclusions from this unit inventory

- Structures/HQs/factories/civilian buildings: tracked in a separate structure
  pack inventory; they are not unit IDs.
- `novaFactoryV2`: a structure showcase prototype, therefore not a completed
  unit pack.
- Legacy/default `UNIT_MDL` fallback builders: not faction-complete bespoke
  units. The faction registries above are the source of truth for intended
  faction-specific unit model coverage.
