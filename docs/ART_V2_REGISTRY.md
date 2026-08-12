# MASSFRONT Art V2 Bespoke Asset Registry

Updated: 2026-08-10

This is the source-backed status register for the first Nova bespoke-material
slice. It deliberately separates an authored UV map pack from a live semantic
V2 route or a showcase-only prototype.

## Status key

| Status | Meaning |
| --- | --- |
| **Authored map pack** | The exact asset has BaseAO, NRE, and Masks files on imported UVs. |
| **Semantic-bake prototype** | The exact asset has dedicated material semantics but no authored map triplet. |
| **Live landmark profile** | The normal live V2 shader gives a profile/state improvement; it is not a bespoke pack. |
| **Queued** | No asset-specific V2 maps or semantic-pack contract yet. |

## Verified authored Nova packs

| Registry key | Asset | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| `novaHeavyTankV2` | Rhino / Nova heavy-tank showcase | **Authored map pack** | `src/engine/materials-v2.js`, `assets/textures/materials/nova-heavy-tank-v2-{baseao,nre,masks}.png` | Imported UV0; this is the reference battle-unit pack. It must not be treated as a universal Nova texture. |
| `novaFactoryV2` | Nova factory showcase | **Authored map pack** | `src/engine/materials-v2.js`, `assets/textures/materials/nova-factory-v2-{baseao,nre,masks}.png` | Imported UV0; this is the reference faction-structure pack. |

## Verified semantic and live prototypes

| Asset | Current status | Evidence | What it is today | What is still required |
| --- | --- | --- | --- | --- |
| Nova Commander | **Semantic-bake prototype** | `MF2_BESPOKE_PACKS.novaCommanderV2` in `src/engine/materials-v2.js`; `TFC_NOVA_BESPOKE_PACKS[4]` in `src/engine/models-units-nova.js` | A generated-island showcase bake plus a live Nova commander semantic contract. Its armor, structure, machine, weapon, glass, and energy values are intentionally separate. | Imported commander UVs; authored `BaseAO`, `NRE`, and `Masks`; tactical and damage validation. |
| Nova HQ | **Live landmark profile** | `surfaceState=(Bd.type==='hq'?4:0)+damageState` in `src/ui/render3d.js`; profile decoding in `src/engine/mesh.js` | Dedicated per-instance landmark finish, HQ beacon/VFX, and V2 damage state in the live path. | An explicit `nova-hq-v2` pack with three authored maps. It is not a semantic-bake or completed bespoke map pack. |
| Nova Research (`techlab`, `uplink`) | **Live semantic V2 only** | Hero light selection and research emissive/guard effects in `src/ui/render3d.js`; no matching `MF2_BESPOKE_PACKS` or texture names | Shared V2 materials plus special gameplay/VFX lighting. | Separate `nova-research-v2` authored pack(s), including quiet roof armor, emissive research apertures, glass, and controlled wear. |
| Striker | **Semantic-bake prototype** | `TFC_NOVA_BESPOKE_PACKS[0]` in `src/engine/models-units-nova.js` | Unit-specific semantic contract: `nova-striker-semantic-v2`; no maps. | UV export and authored infantry/servo family map pack. |
| Rhino | **Semantic-bake prototype + authored showcase reference** | `TFC_NOVA_BESPOKE_PACKS[1]` in `src/engine/models-units-nova.js`; `MF2_BESPOKE_PACKS.novaHeavyTankV2` and tank texture triplet | The live Rhino slot has a semantic contract; the separate heavy-tank Material Lab asset has authored maps. These should be matched only after confirming the imported showcase geometry is the production Rhino mesh. | Explicit production binding or a production Rhino UV bake, then phone/battle validation. |
| Goliath | **Semantic-bake prototype** | `TFC_NOVA_BESPOKE_PACKS[2]` | Walker armor keeps a dedicated composite trim response. | Actual Goliath UVs and a walker-specific triplet. |
| Thumper | **Semantic-bake prototype** | `TFC_NOVA_BESPOKE_PACKS[3]` | Artillery rack/open-mount areas are separated from healthy armor. | Actual Thumper UVs and an artillery-specific triplet. |
| Wasp | **Semantic-bake prototype** | `TFC_NOVA_BESPOKE_PACKS[5]` | Formation lamps have a dedicated beacon/emissive material role. | Actual Wasp UVs and an airframe-specific triplet. |
| Longbow | **Semantic-bake prototype** | `TFC_NOVA_BESPOKE_PACKS[6]` | Capacitor collars use a dedicated charge-strip role. | Actual Longbow UVs and a weapon-platform triplet. |
| Nova Factory | **Live semantic prototype + authored showcase reference** | `mdlFac` and `MF2_BESPOKE_PACKS.novaFactoryV2` | Production building armor, roof, core, and glazing are separated in the live path. | Bind the authored showcase maps only after matching the production mesh/UVs. |
| Nova Power Plant | **Live semantic prototype** | `mdlPgen` in `src/engine/models.js` | Power landmark uses a dedicated armor/core/roof/glass palette. | Actual power-plant UVs and an authored triplet. |
| Nova Airfield | **Live semantic prototype** | `mdlAirfield` in `src/engine/models.js` | Airfield receives isolated Nova roof/core/glass treatment. | Actual airfield UVs and an authored triplet. |
| Nova Fabrication / Refinery | **Live semantic prototype** | `mdlFab` in `src/engine/models.js` | Fabrication landmark has separate armor/core/roof/glass treatment. | Actual fabrication UVs and an authored triplet. |

## Important exclusions

- A shared microdetail tile, faction surface pass, profile band, light, or
  damage shader is **not** an authored bespoke asset pack.
- `novaCommanderV2` uses generated UV islands and is therefore a prototype,
  even though it has dedicated semantics.
- The current research treatment is VFX/lighting support, not an individual
  research-building material pack.
- This register names no Dominion, Syndicate, or Brood asset as complete. Their
  live semantic routes remain fallbacks until they have their own maps.

## Next concrete Nova batch

1. **Commander:** export/import the production commander UV layout and make
   `nova-commander-v2-baseao.png`, `-nre.png`, and `-masks.png`.
2. **HQ:** create `nova-hq-v2` from the actual deployed-HQ geometry. Preserve
   the existing profile band as fallback; do not replace it until the maps pass
   tactical and damaged-state checks.
3. **Research:** author the `techlab` and `uplink` pair as `nova-research-v2`.
   Shared maps are allowed only if their UVs and role readability are proven.
4. **Production Rhino:** verify the showcase tank mesh versus the live Rhino
   mesh, then bind or rebake the exact production geometry.
5. **Striker/Pyro family:** make an infantry family pack only after the shared
   chassis and role landmarks are confirmed. Do not apply Rhino metal maps to
   infantry.
6. **Goliath/Thumper/Wasp/Longbow:** export the four distinct production UV
   layouts before giving any of them imported maps. Their semantic entries are
   deliberately role-specific, but remain prototypes.

After each item, record map paths, UV source, screenshot evidence at 412 x
915, and a 100-unit material-LOD performance result here.
