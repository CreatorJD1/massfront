# MASSFRONT Art V2 — Bespoke Structure Pack Queue

Updated: 2026-08-10  
Scope: authored material packs for the three playable faction structure kits.
This queue does **not** claim that the packs are already integrated or that the
global live V2 shader is an authored asset conversion.

## Verified starting point

- The renderer has a live V2 material baseline for all instanced units and
  structures: normal response, AO, metal/roughness separation, faction masks,
  damage charcoal/cracks, local lighting, and material LOD.
- The three playable structure registries each expose 27 primary building keys:
  Nova in `BLD_MDL`, Dominion in `BLD_MDL_LEGION`, and Syndicate in
  `BLD_MDL_MACHINE`.
- Nova Factory is the only faction-structure asset with a complete bespoke V2
  showcase map set at present:
  `nova-factory-v2-baseao.png`, `nova-factory-v2-nre.png`, and
  `nova-factory-v2-masks.png`.
- The five neutral map structures (city tower, dome, hall, tank farm, civic
  block) use their own shared three-map V2 atlas. This is not a faction
  structure pack.
- No bespoke HQ, power, economy, research, defense, naval, or transit pack is
  currently present for Nova, Dominion, or Syndicate.

## Pack contract

Every bespoke structure pack has exactly three authored maps, kept separate
from the shared micro-surface and damage tiles:

| File suffix | Channels | Required content |
|---|---|---|
| `-baseao.png` | RGB / A | authored base colour / baked AO |
| `-nre.png` | RG / B / A | tangent normal XY / roughness / emissive |
| `-masks.png` | R / G / B / A | structural-metal / faction-primary / faction-secondary-role / wear-damage |

Rules:

- Author UV-correct maps for the target mesh. Do not project a global grunge
  texture onto the asset and call it a bespoke pack.
- Faction colour exists only in the G/B mask landmarks; it must not recolour
  the entire model.
- Keep large armor/roof/foundation planes quiet at RTS distance. Put dense
  detail around mechanical intersections, panel transitions, vents, doors,
  weapons, and service areas.
- Normal and roughness information must remain useful at Arsenal distance but
  not shimmer at 412 x 915 tactical range.
- Damage is a material state: charcoal/roughness must replace healthy paint
  and polish before fire sprites are layered on top.

## Staged production queue

Each completed family must be integrated behind an opt-in asset key, then
checked at Arsenal, tactical, battle, and strategic material LOD before the
next family starts. A V2 shader fallback remains mandatory throughout.

### Stage S1 — Command landmarks (highest priority)

| Faction | Asset key | Structure key | Required visual focus | Status |
|---|---|---|---|---|
| Nova | `nova-hq-v2` | `hq` | command armor, glass command spaces, blue power routing, landing/service wear | queued |
| Dominion | `legion-hq-v2` | `hq` | brutal cast armor, red command pennants/heat vents, soot and siege wear | queued |
| Syndicate | `syndicate-hq-v2` | `hq` | clean advanced alloys, holographic command apertures, controlled green energy | queued |

### Stage S2 — Production and research landmarks

| Faction | Asset family | Structure keys | Status |
|---|---|---|---|
| Nova | `nova-factory-v2` | `fac` | **complete pack; integration/reference asset** |
| Nova | `nova-production-v2` | `airfield`, `harbor`, `tgate`, `nest` | queued |
| Nova | `nova-research-v2` | `techlab`, `uplink` | queued |
| Dominion | `legion-production-v2` | `fac`, `airfield`, `harbor`, `tgate`, `nest` | queued |
| Dominion | `legion-research-v2` | `techlab`, `uplink` | queued |
| Syndicate | `syndicate-production-v2` | `fac`, `airfield`, `harbor`, `tgate`, `nest` | queued |
| Syndicate | `syndicate-research-v2` | `techlab`, `uplink` | queued |

`fac` must receive its own map set in every faction. The Nova factory maps are
not a generic factory texture and must never be reused on Dominion or Syndicate
geometry.

### Stage S3 — Economy and power landmarks

| Faction | Asset family | Structure keys | Status |
|---|---|---|---|
| Nova | `nova-economy-v2` | `mex`, `pgen`, `geo`, `silo`, `fab` | queued |
| Dominion | `legion-economy-v2` | `mex`, `pgen`, `geo`, `silo`, `fab` | queued |
| Syndicate | `syndicate-economy-v2` | `mex`, `pgen`, `geo`, `silo`, `fab` | queued |

The five keys above may share a faction texture-array/atlas only after an
authored UV layout and mip test prove it. Power plants must use emissive glass,
heat, or containment details sparingly; extractors must show mining function
without becoming a neon beacon.

### Stage S4 — Defensive landmark families

| Faction | Asset family | Structure keys | Status |
|---|---|---|---|
| Nova | `nova-defense-v2` | `turret`, `bunker`, `bastion`, `aatower`, `minelaser`, `missilebastion`, `hellstorm`, `arc`, `rail`, `nova`, `plasma` | queued |
| Dominion | `legion-defense-v2` | `turret`, `bunker`, `bastion`, `aatower`, `minelaser`, `missilebastion`, `hellstorm`, `arc`, `rail`, `nova`, `plasma` | queued |
| Syndicate | `syndicate-defense-v2` | `turret`, `bunker`, `bastion`, `aatower`, `minelaser`, `missilebastion`, `hellstorm`, `arc`, `rail`, `nova`, `plasma` | queued |

For defenses with a separate tracking assembly, pack the base and turret as a
matched material family. Do not bake static lighting onto a component that
rotates in battle. Each Mk1/Mk2/Mk3 must keep its family lineage while receiving
separate material landmarks rather than just more glow.

### Stage S5 — Perimeter and support completion

| Faction | Asset family | Structure keys | Status |
|---|---|---|---|
| Nova | `nova-support-v2` | `sgen`, `wall`, `gate` | queued |
| Dominion | `legion-support-v2` | `sgen`, `wall`, `gate` | queued |
| Syndicate | `syndicate-support-v2` | `sgen`, `wall`, `gate` | queued |

## Integration order per pack

1. Preserve the existing faction mesh and material-semantic IDs.
2. Confirm UVs; fix stretching in the source mesh before baking maps.
3. Bake BaseAO, NRE, and Masks at showcase resolution; produce a battle-safe
   reduced map only after the showcase result is approved.
4. Register the pack under a new explicit V2 asset key; legacy rendering and
   the common live V2 path remain fallbacks.
5. Verify the selected asset alone in Arsenal, then at 412 x 915 in bright and
   night maps, healthy/damaged/burning, selected/unselected, and low/high
   quality.
6. Measure a representative base scene before allowing the pack to replace the
   fallback route.

## Explicit non-goals

- This queue does not share faction texture packs across Nova, Dominion, and
  Syndicate.
- This queue does not alter building statistics, AI, construction rules, or
  faction ownership.
- Brood remains on its organic Material V2 track and is intentionally absent
  from this mechanical-faction queue.
