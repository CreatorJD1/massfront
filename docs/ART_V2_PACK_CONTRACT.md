# MASSFRONT Art V2 Bespoke Pack Contract

This contract keeps the V2 conversion honest: a live semantic material route is
not the same thing as a completed bespoke asset pack.

## Asset pack contents

Each hero, landmark structure, or unit family pack supplies these authored
inputs when its UV export is ready:

- `BaseAO`: RGB base color, alpha baked ambient occlusion.
- `NRE`: normal XY, roughness, emissive mask.
- `Masks`: structural alloy, faction-primary/role accent, faction-secondary,
  and controlled wear/damage masks.
- `pack.json`: asset ID, faction, tier, material family, texture resolution,
  map paths, authored sockets, and validation state.

Generated semantic islands may be used as a temporary bridge only when an
asset has no imported UV layout. They must be labelled `semantic-bake`, never
`authored`, in pack metadata and release notes.

## Surface families

Mechanical packs separate painted armor, structural alloy, dark machinery,
weapon treatment, glass, faction accents, wear, damage, and emissive systems.
Brood packs use the biological equivalents: chitin, tissue, bone/tendon,
membrane, wetness, wounds, secretion, mutation, and bioluminescence.

Faction tint belongs only in authored masks. It must never wash the entire
model with one team color.

## Mobile budgets

- Ordinary battle unit: 512 px map set maximum until profiling proves 1K safe.
- Commander, HQ, or Arsenal showcase asset: 1K map set maximum.
- Far material LOD: base/AO, faction recognition, restrained emissive; omit
  microdetail and costly roughness response.
- Reuse shared GPU maps and material programs; cosmetic variation is per
  instance data, not a new texture allocation.

## Conversion order

1. Nova commander and command HQ.
2. Nova production/research/economy/defense structure families.
3. Nova frontline, armor, air, and support unit families.
4. Dominion commander, HQ, structures, then units.
5. Syndicate commander, HQ, structures, then units.
6. Brood organic showcase caste, hive, and remaining AI-only families.
7. Civilian and military world landmarks after faction gameplay assets.

The detailed, source-backed queues are `ART_V2_PACK_QUEUE.md` and
`ART_V2_UNIT_PACKS.md`.

## Acceptance gate

A pack cannot advance beyond prototype until it is checked at 412 x 915 in
Arsenal, normal battle zoom, far strategy zoom, bright terrain, dark terrain,
selected state, and damaged state. It must retain silhouette, faction, weapon
role, and tier readability. Performance checks must include base, effects,
selection, and roughly 100 unit battle conditions; quality cannot trade away
large-scale RTS readability.

## Current state

- Nova heavy tank and Nova factory: authored bespoke map packs.
- Nova commander: dedicated semantic-bake V2 pack; awaiting Blender-authored
  BaseAO/NRE/Masks exports.
- Other gameplay assets: live semantic V2 material coverage only until their
  individual pack enters and passes this queue.
