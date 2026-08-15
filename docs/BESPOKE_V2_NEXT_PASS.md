# MASSFRONT — Bespoke Material V2 Next-Pass Audit

Updated: 2026-08-14 (Brood Gorger hull in-engine bake recorded under Batch B1;
Nova Rhino hull+turret remains the Batch N2 proof)
Scope: inventory/audit only. This document does not promote semantic V2 routes
or generated texture files to completed authored packs.

## Executive finding

MASSFRONT has a healthy **production semantic Material V2 baseline** and
faction-specific model routes, but it does not yet have broad production
integration of UV-authored bespoke texture packs. The repository contains a
large catalogue of V2 triplets; current evidence says those files are generated
templates unless a target production mesh, UV0, source scene and live renderer
binding are individually proven.

The safest next move is therefore **one real Nova asset at a time**—start with
the command landmark/commander assets that players inspect most—rather than
turning on all existing `*-v2` texture files in battle.

## Evidence reviewed

| Area | Current truth | Evidence |
| --- | --- | --- |
| Production material baseline | Live shared V2-style surface response: normal/AO/roughness/metal response, faction semantics, damage and material LOD. | `src/engine/materials.js`, `src/engine/mesh.js`, live render routes. |
| Faction unit ownership | Nova, Dominion, Syndicate and Brood have separate unit model registries/surface factories; validators pass. | `src/engine/models-units-{nova,legion,syndicate,brood}.js`; `node tools/verify-unit-v2.mjs`. |
| Bespoke material laboratory | Separate opt-in benchmark, enabled only by `?materiallab=1`; it does not establish battle-map integration. | `src/engine/materials-v2.js:4-9`. |
| Imported reference geometry | Nova heavy-tank and factory have source `.blend`, baked `.glb`, LOD1 `.glb`, imported JS geometry, and texture triplets. | `source-media/material-v2/nova-{heavy-tank,factory}-v2/`; `assets/data/material-v2-*.js`. |
| Generated catalogue | 543 `*-v2-*.png` files exist (181 triplets). The generator creates broad quadrant/panel templates and does not consume a target mesh UV layout. | `tools/build-bespoke-v2-textures.py`; `node tools/verify-bespoke-packs.mjs`. |
| Verifier result | **0 verified UV-authored packs, 170 generated/unverified templates, 0 prototype, 0 failures** from the current registry. The count excludes the two earlier reference names because the current large registry no longer declares their exact keys. | `node tools/verify-bespoke-packs.mjs`, 2026-08-11. |

## What is actually live today

### Semantic V2 (real, but not bespoke texture conversion)

- **Nova / blue:** `UNIT_MDL_NOVA` and `tfcNovaSurfacePass` supply a
  per-slot semantic material contract.
- **Dominion / red:** `UNIT_MDL_LEGION` and `domLegionSurfacePass` provide
  separate cast/rivet/siege/thermite semantics.
- **Syndicate / green:** `UNIT_MDL_SYNDICATE` and
  `coaSyndicateSurfacePass` provide nano/gold/holo/conduit semantics.
- **Brood / AI-only:** `UNIT_MDL_BROOD` and `FAC_KIT.horde` retain an organic
  chitin/tissue/membrane path rather than being recoloured machinery.
- **World/civic structures:** use the shared World V2 route, including the
  road/civic material work. This is not a faction bespoke pack.

These routes are the right scalable battle default. They preserve faction
ownership, damage presentation and LOD without allocating a unique texture
set per instance.

### Reference assets with usable authored source material

| Reference | What exists | Limitation before production conversion |
| --- | --- | --- |
| Nova heavy tank | Blender source, baked GLB, LOD1 GLB, imported UV data and a BaseAO/NRE/Masks triplet. | Must prove it is the same topology/UV family as the live Rhino (or re-bake the actual Rhino). It currently serves the material lab. |
| Nova factory | Blender source, baked GLB, LOD1 GLB, imported UV data and a triplet. | Must prove it matches the live factory or export/bake the live factory geometry. It currently serves the material lab. |

### Templates, not completed bespoke packs

- The broad `MF2_BESPOKE_PACKS` registry labels many entries `source:'authored'`,
  but the verifier classifies all current entries as **templates** because exact
  production-mesh UV authorship is not proven.
- Unit and structure registries repeat that metadata. Their maps must not be
  bound to battle geometry simply because the filenames match.
- The `nova-commander-v2` triplet exists, but there is no corresponding
  commander Blender/GLB export under `source-media/material-v2/`; treat it as
  a generated template until that source route exists.

## Required registry correction before the next release claim

This is documentation/data hygiene, not a rendering rewrite:

1. Separate the current monolithic map catalogue into `template` and
   `authored-verified` declarations.
2. Restore/retain explicit entries for the two reference assets only if their
   source paths and live binding are documented.
3. Do not use `source:'authored'` for generated quadrant/panel maps. Use an
   unambiguous `template`/`generated` state, or retain `semantic-bake` where
   no real UV pack exists.
4. Extend `tools/verify-bespoke-packs.mjs` only after the taxonomy is agreed;
   its current output correctly prevents false completion claims.

This avoids a release note saying "all units are bespoke" when the actual live
game correctly uses a performant semantic V2 fallback.

## Safest real conversion sequence

All batches use the same non-negotiable path:

`production mesh -> export UV0/source scene -> fix UV stretching -> bake BaseAO/NRE/Masks -> opt-in key -> lab comparison -> live 412x915 battle validation -> performance gate -> promote`

### Batch N1 — Nova command identity (highest impact)

| Asset | Why first | Deliverable |
| --- | --- | --- |
| Nova Commander | Seen constantly; its armor, limbs, cockpit/energy and damage states determine perceived quality. | New production commander Blender/GLB source; 1K close-up and 512 battle map variants; explicit `nova-commander-v2` pack; bind only after battle checks. |
| Nova HQ | Largest early-match landmark; strongest opportunity to establish glass, armor, service wear and blue energy language. | Production HQ UV source; `nova-hq-v2` triplet; preserve current landmark profile as fallback. |

Do not start with the existing `nova-commander-v2` images—they lack the
matching source/UV evidence required to safely render the production commander.

### Batch N2 — Nova production proof

| Asset | Why | Deliverable |
| --- | --- | --- |
| Rhino | Existing heavy-tank reference makes it the fastest direct topology comparison. | **2026-08-13:** live `mdlNovaRhino` hull+turret rebaked in-engine (`nova-rhino-v2`, `nova-rhino-v2-turret`), sibling-occluder AO, opt-in `?assetskin=rhino`. Do not bind the Blender heavy-tank UV maps onto this mesh. |
| Factory | Existing source lets this prove an actual structure migration path. | Match/bake the live factory geometry, validate selected/damaged/burning and a busy production scene. |

### Batch N3 — Nova readable combat families

1. **Striker + Pyro:** shared infantry/servo family only after their silhouettes,
   weapon mounts and texture density are demonstrably compatible.
2. **Thumper + Bombard:** artillery family; preserve quiet armor and put dense
   detail at recoil, breech and shell interfaces.
3. **Goliath + TITAN + Basilisk:** walker/experimental family; keep gait-marker
   channels untouched and never remap raw `SERVO` vertex data.
4. **Wasp + Raptor + Kestrel:** air family. Verify transparent/glass and
   engine emissive modes without expensive material features at distance.
5. **Constructor + Prospector + Warden + Bulwark:** utility/support family;
   build/repair visual language is more valuable than uniformly denser wear.

### Batch D1 — Dominion command proof, then landmarks

1. Dominion commander (`Lord Darion Vex`): one real hero pack to establish the
   brutal cast armor, soot, heated seams and red role marks.
2. Dominion HQ: command landmark and building material grammar.
3. Dominion factory + artillery family: validates moving weapon assemblies and
   Siege/Wear mask treatment.
4. Dominion infantry and armor families only after the hero/landmark quality
   standard is fixed.

### Batch S1 — Syndicate command proof, then landmarks

1. Syndicate commander (`Broker Lys Renn`): one real hero pack to define clean
   advanced alloy, holographic apertures and controlled green energy.
2. Syndicate HQ: validates the hard-surface/glass/holo building grammar.
3. Syndicate Strider/Rhino/Oracle: proves a shared high-tech armor family
   without reusing Dominion/Nova maps.
4. Then factory, research and emitter families.

### Batch B1 — Brood organic benchmark (after the mechanical proof)

1. **Gorger** (Rhino slot, the line brawler): **2026-08-14:** live `mdlBrdGorger` hull rebaked in-engine (`brood-gorger-v2`), opt-in `?assetskin=gorger` / `?assetskin=1`. Hull-only — the animal has no turret. Do not bind a generated template onto this mesh.
2. One hive structure remains later; it is civic and out of the unit-chassis lane.
3. Bake organic-compatible channels: chitin/tissue/bone/membrane/wetness/
   wounds/secretions/bioluminescence.
4. Validate that no mechanical metal, paint wear or shared faction map enters
   Brood rendering.

Brood remains AI-only; this is visual quality work, not a faction-playability
change. Remaining split models stay `maps:null` until each has its own triplet.

## Terrain/civic linkage for bespoke landmarks

Bespoke structure work must not bypass the current city/terrain contact
contract. When an HQ/factory/neutral landmark is converted, validate its:

- real hardstand/driveway/road frontage rather than a texture stamp;
- base pad blend and foundation shadow against the 256 terrain / CITY_RES 1024
  planning data;
- no road raster showing beneath the physical road module or building;
- window/door/sign material IDs preserved through World V2 (`vSurface`);
- common destruction contract via the recovered `CITYG >= 1` skip
  (`addGroundBurn` / `addCrater` / `applyDeform`); do not call the
  non-existent `applyGroundDestruction()`;
- damage/burning material response after ground deformation and debris.

## Promotion gates for every real pack

### Correctness

- Exact production geometry, source scene and imported UV0 are recorded.
- BaseAO, NRE and Masks are asset-specific—not generated quadrant templates.
- No UV stretch, accidental all-body tint, broken normal response, floating
  parts, wrong faction mesh or raw `SERVO` remap.
- Damaged/burning state becomes charred, rough and low-specular before fire
  sprites are layered; it must not look like clean paint under effects.

### Phone visual check (412 x 915)

Capture Arsenal/inspection, bright battle, night battle, tactical and far
zoom, selected/unselected, and damaged/burning. Confirm silhouette -> faction
-> role -> tier remains legible before close-up micro-detail.

### Performance

- Baseline shared semantic route then test the opt-in pack in the same scene.
- Test roughly 100 units plus base, terrain, projectiles, effects, UI and
  selection. Use 200 only where the class can plausibly be fielded at that
  density.
- Keep each automated run below roughly two minutes.
- Preserve shared texture/mesh resources, instancing and material LOD; no
  unique GPU texture per cosmetic variant.
- Do not enable the Material Lab shader globally as a shortcut. Its query-gated
  isolation exists to avoid sacrificing large-army scale.

## Do not touch during this pass

- Unit stats, AI, economy, faction playability, campaign or online/MMO rules.
- The live semantic V2 fallback until a pack passes the gates above.
- Cross-faction map/geometry sharing; faction identity is a source asset and
  semantic system, not a global color multiply.
- General battle SSR/parallax. Keep high-cost presentation to controlled
  Arsenal/showcase contexts until profiling proves a mobile-safe path.

## Commands to run after a future pack change

```powershell
node tools/verify-bespoke-packs.mjs
node tools/verify-nova-semantic-packs.mjs
node tools/verify-dominion-semantic-packs.mjs
node tools/verify-unit-v2.mjs
node tools/bundle.mjs
```

Then stage the web build and perform the visual/mobile capture; a passing
JavaScript console or texture-file count is not visual proof.
