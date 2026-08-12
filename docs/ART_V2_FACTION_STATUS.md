# MASSFRONT Art V2 — Faction Progress Matrix

Updated: 2026-08-10

This matrix records the state of the staged bespoke-pack program from the
current source. It deliberately distinguishes a **completed semantic stage**
from a completed authored texture pack. Semantic stages are live, per-slot
material contracts; they are valuable production scaffolding, but they are not
UV-authored `BaseAO` / `NRE` / `Masks` packs.

## Status legend

| State | Meaning |
| --- | --- |
| **Semantic stage complete** | Every listed live unit slot is routed through the faction's per-slot V2 semantic surface pass. |
| **Authored map pack** | The exact asset has imported UV0 and an on-disk `baseao`, `nre`, and `masks` triplet. |
| **Prototype** | Dedicated V2 semantics exist, but the maps are generated or absent. It is not an authored pack. |
| **Queued** | No completed faction-specific semantic stage or authored maps in this pass. |

## Faction matrix

| Faction | Live semantic V2 state | Authored map packs | Current bespoke stage | Next queue |
| --- | --- | --- | --- | --- |
| **Nova Vanguard (blue)** | Live per-slot semantic V2 coverage is complete for the current roster. | Rhino showcase and Factory showcase have imported-UV map packs. The later `nova-*-v2` triplets are generated material templates, not asset-specific UV bakes. | Semantic stage complete; authored conversion is still limited to the two showcase references. | Export actual production UVs, starting with commander and HQ. |
| **Dominion Legion (red)** | Live per-slot semantic V2 coverage is complete for all 27 active slots. | `legion-*-v2` triplets exist as generated material templates. No production mesh has imported those maps through the live battle renderer. | Semantic stage complete. | Author and integrate one red HQ or artillery family on real UVs. |
| **Syndicate Coalition (green)** | First frontline/landmark semantic stage is live; later full-template assets are not proof of live integration. | `syndicate-*-v2` triplets are generated templates, not verified asset-specific UV bakes. | In progress. | Finish source-backed roster/structure route validation, then author one hero asset on real UVs. |
| **Brood Swarm (AI-only)** | Existing organic semantic route is live. | `brood-*-v2` triplets are generated biological material templates, not verified specimen-specific UV bakes. | Queued for an organic benchmark after mechanical production integration. | One caste plus one hive structure with real organic UVs. |

## Source evidence

| Area | Source-backed evidence |
| --- | --- |
| Nova unit semantic routing | `src/engine/models-units-nova.js`: `TFC_NOVA_BESPOKE_PACKS`, `tfcNovaFactory()`, `UNIT_MDL_NOVA`. |
| Dominion unit semantic routing | `src/engine/models-units-legion.js`: `DOM_LEGION_BESPOKE_PACKS`, `domLegionFactory()`, `UNIT_MDL_LEGION`. |
| Syndicate live unit routing | `src/engine/models-units-syndicate.js`: `COA_SYN_BESPOKE_PACKS`, `coaSyndicateFactory()`, `UNIT_MDL_SYNDICATE`. |
| Brood organic unit routing | `src/engine/models-units-brood.js`: `UNIT_MDL_BROOD`; `src/engine/models.js`: `FAC_KIT.horde`. |
| Material-template generation | `tools/build-bespoke-v2-textures.py` creates the broad `*-v2` texture catalogue. It uses generic quadrant/panel templates and does not consume a target model's UV layout. |
| Lab integration boundary | `src/engine/materials-v2.js` begins as an explicit `?materiallab=1` benchmark. Its broad registry and file presence do not activate those maps for production battles. |
| Verified imported-UV reference maps | `assets/textures/materials/nova-heavy-tank-v2-{baseao,nre,masks}.png` and `nova-factory-v2-{baseao,nre,masks}.png`, used by the Material V2 lab's imported reference geometry. |

## Required validation

Run these from the repository root after changing a relevant stage:

```powershell
node tools/verify-bespoke-packs.mjs
node tools/verify-nova-semantic-packs.mjs
node tools/verify-dominion-semantic-packs.mjs
node tools/verify-unit-v2.mjs
node tools/bundle.mjs
```

`verify-bespoke-packs` currently proves only declaration/file presence. It does
not prove a map was painted or baked for the exact mesh, nor that the map is
connected to the live battle renderer. Use the visual and performance gates in
`docs/ART_V2_ACCEPTANCE.md` before moving any queued pack to complete.

## Stage gate for the next faction

Before Syndicate or Brood is marked as a completed semantic stage, add a
faction-specific validator that proves:

1. every intended roster slot reaches its faction surface factory;
2. the semantic registry has an entry for every intended slot;
3. gait/servo markers remain raw where the vertex animation relies on them;
4. shared mesh builders are cache-keyed by slot so they retain individual
   material contracts; and
5. any new authored declaration has all three actual map files.

No faction may borrow Nova, Dominion, or Brood geometry or authored maps as a
substitute for its own bespoke pack.
