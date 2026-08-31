# MASSFRONT Generated 3D and Texture Asset Gap Audit V1

**Audit date:** 2026-08-26  
**Source revision:** `c4090cc5785e6c30b342f58beca52d34585e9bfc` on `cursor/strip-mass-node-bloom`  
**Worktree:** dirty and preserved; 2,545 pre-audit porcelain entries  
**Scope:** source inventory only. No runtime file, manifest, model, texture, or package was changed.

The machine-readable companion is [`generated-3d-texture-asset-gap-audit.v1.json`](./generated-3d-texture-asset-gap-audit.v1.json).

## Verdict

The requested reusable, game-ready model library is **not complete**. The repository has a strong authoring foundation—20 catalogued concepts, 288 planet/location prompts, detailed socket contracts, 90 interior-module definitions, seven hash-verified Hunyuan ledger entries, and several source-preserved LOD experiments—but the distinction between “planned,” “generated,” “processed,” and “runtime-ready” is critical:

- **No Hunyuan ledger asset is runtime-ready.** All seven retain `UNKNOWN` runtime evidence.
- Of seven Hunyuan ledger entries, three are accepted as their intended source role, three are reclassified, and one is rejected.
- The 30 inspected GLB files represent only 27 unique hashes. Three pairs are intentional processing mirrors, not extra models.
- Roads, junctions, adapters, service lanes, pedestrian connectors, perimeter walls, and deterministic assembly examples do not yet exist as geometry.
- The six XS/SMALL interior packs define 90 assets but have **zero** source GLBs.
- Dominion has no dedicated generated architecture; Syndicate has a ready Nordhall concept but no model; Brood has zero accepted architecture because its only generated candidate was correctly rejected.
- Thirty planned 2K texture-theme packs and 34 planned NEXUS-VII 2K material/decal families remain unproduced.

The next production wave must finish interoperable transport and access grammar before generating more isolated landmarks. That is the fastest route from attractive one-off models to believable cities, colonies, outposts, refineries, and tactical interiors.

## Inventory summary

| Inventory | Actual current state |
|---|---:|
| GLB files inspected | 30 |
| Unique GLB hashes | 27 |
| Exact duplicate file instances | 3 |
| Runtime model files present | 4 |
| Models admitted by current exploration content manifest | 3 |
| Hunyuan ledger assets | 7 |
| Hunyuan accepted as intended / reclassified / rejected | 3 / 3 / 1 |
| Hunyuan runtime-ready | 0 |
| Processed Hunyuan candidate kits | 3, all blocked |
| Existing UGA material families | 13 at 1024² |
| Existing planet surface families | 6 at 1024×512 |
| Planned 2K global texture-theme packs | 30 |
| Planned 2K NEXUS material/trim/decal families | 34 |
| Planet profiles / location prompts / total prompts | 32 / 256 / 288 |
| Galactic ground sites with tactical runtime geometry | 0 of 9 |
| Base planet/region/location presets | 4 planets / 16 regions / 32 presets |
| Interior tactical definitions with geometry | 0 of 90 |

## Actual generated Hunyuan sources

| Asset | Intended → accepted role | Planet / region | Faction applicability | Source state | Runtime |
|---|---|---|---|---|---|
| `gsite_aelos_caldris_control_tower_tall` | skyscraper → skyscraper | Aelos / Caldris | UGA civic, Nova, Dominion/Syndicate overlays | 373,680-triangle verified source | blocked |
| `gsite_aelos_caldris_customs_depot` | drive-through hall → closed customs/world-detail building | Aelos / Caldris | UGA civic, Nova, Dominion/Syndicate overlays | 374,034-triangle reclassified source | blocked |
| `gsite_aelos_caldris_inspection_gantry` | inspection gantry → inspection gantry | Aelos / Caldris | UGA civic, Nova, Dominion/Syndicate overlays | 498,292-triangle verified source | blocked |
| `mf_elysion_cumulus_conservatory_pressure_dome` | traversable pressure dome → sealed world-detail landmark | Elysion / Cumulus Conservatory | UGA Coalition | 374,876-triangle reclassified source | blocked |
| `mf_vespera_megaforge_brutish_structure_rejected` | Brood industrial architecture → none | Vespera / Megaforge Refinery | Brood hostile | rejected; reads as creature/face/limbs | forbidden |
| `mf_city_outpost_gatehouse_command_tower` | broad command hub → fortified gatehouse/command tower | multi-planet layout kit | UGA, Nova, Dominion, Syndicate | 373,060-triangle reclassified source | blocked |
| `mf_city_outpost_operations_block` | compact outpost core → compact outpost core | multi-planet layout kit | UGA, Nova, Dominion, Syndicate | 374,298-triangle verified source, 32×20×32 m | blocked |

The gatehouse and operations block each preserve a raw Spline export and a cleaned source. Those are lifecycle variants of one asset, not additional library members.

### Processed candidates are still blocked

Three source families have LOD0/1/2 plus collision outputs, but their own human-review records prevent promotion:

1. **Caldris control tower:** source and derived degenerates, underexposed proof, no mobile evidence.
2. **Caldris inspection gantry:** three embedded 4K textures, aperture-filling convex collision, incomplete Spline identity, no mobile evidence.
3. **Elysion dome:** closed service portal, source degenerates, whole-dome convex collision, no mobile evidence.

This is 12 derivative GLBs—nine LODs and three collision files—but zero runtime-approved kits.

## Exact duplicate and lifecycle accounting

Three hashes occur twice because the immutable source is mirrored inside a processing directory:

| Canonical asset | SHA-256 | Meaning |
|---|---|---|
| Caldris control tower | `332ef639646021e499958aa6692634f31af918f12c12d371aab17bf6fe611ff0` | original Hunyuan source + processing source mirror |
| Caldris inspection gantry | `cec01fd1cba4eba411b900f790c97a7e4a828100cfffc9bd218ad9c0976925b8` | original Hunyuan source + processing source mirror |
| Elysion pressure dome | `8514b00845b09bf764ece0ede56c4c29408360b905f79af109b8b1476ceb8f54` | original Hunyuan source + processing source mirror |

These mirrors are expected provenance, but inventories must count each pair as **one canonical source asset**. Raw Spline versus cleaned GLB pairs are not byte duplicates, yet also count as one canonical asset.

## Canonical family coverage

### Runtime ship and contact models

Four GLBs are present under `modules/space_exploration/assets/models`, while the current optional-pack manifest admits three:

- `massfront-showcase-contacts.glb`
- `nexus-vii-civilization-ship.glb`
- `uga-command-cutaway.glb`
- `uga-civilization-ark.glb` — present but absent from the manifest, so its current role is unreconciled

The 81,372,160-byte command cutaway contains the current 11-district scene, but it is not a reusable per-room model kit. The source audit did not reproduce its visual or mobile performance approval.

### City and outpost kit

The city/outpost queue has 13 jobs. Two useful sources exist:

- the reclassified gatehouse/command tower;
- the accepted operations block.

The queue still reports the operations block as `GENERATING`, and the planned broad command-hub job is not satisfied by the gatehouse. All road topology and most supporting buildings are absent.

### Aelos / Caldris city kit

The model-pack catalog defines 16 members: one direct source candidate, 11 concept-ready members, and four planned members. The ledger proves two more Caldris sources now exist—the tower and gantry—but the catalog still labels them `CONCEPT_READY`. Nothing in this pack is runtime-ready.

### XS/SMALL combined-arms interiors

The library correctly avoids soldier-only layouts. It defines:

- 6 faction/location packs;
- 15 members per pack, 90 total;
- 4 map templates: 40×40, 48×32, 64×64, and 80×64 m;
- infantry, small-vehicle, and mech socket/turning contracts.

However, all 90 members remain prompt definitions. No corridor, room, gate, objective, cover module, lift, damage shell, or landmark source GLB exists.

### Character source

The UGA anime human source is a 375,004-triangle, unrigged T-pose. It is preserved as provenance only and rejected for runtime because its surfaces are stretched and sliced. It needs a clean rebuild from the approved turnaround, not decimation.

## Texture coverage

### Existing NEXUS-VII textures

There are 13 produced 1024² material families and 91 production channel images:

`uga-city-architecture`, `uga-civic-medical`, `uga-command-navigation`, `uga-deck-floor`, `uga-diplomatic`, `uga-hull`, `uga-industrial`, `uga-interior`, `uga-interior-transit`, `uga-operations`, `uga-pressure-wall`, `uga-science`, and `uga-window-glazing`.

The directory also holds 11 source masters at 1536² and 11 previews at 1254². These materials are useful but are not the newer 2K semantic material system, and the current exploration content manifest lists no `assets/textures/uga` files. Their current packaged integration therefore remains unverified.

The next-generation NEXUS contract is stronger and correctly separates interior structure, floors, pressure walls, door hardware, machinery, civic composites, glazing, transit, trims, and decals from exterior hull material. It declares 18 physical bases, eight trim sheets, and eight decal atlases at 2K across 11 districts—but all 34 are `planned_unproduced`.

### Planet globe textures

Six globe-rendering families exist: Caldris, Ithara, Orison, Nacre, Meridian, and Tethys. They contain 54 production images at 1024×512 plus six 1774×887 source masters; the runtime manifest admits six channels for each body, 36 images total.

These are **planet-renderer maps**, not seamless ground material packs. They do not satisfy the 32-planet world-kit requirement.

### Global tileable materials

The texture-theme catalog specifies 30 planned 2048² seamless PBR packs:

- 20 map-domain packs;
- 5 city-domain packs;
- 5 ship-section packs.

All 30 remain `PLANNED`; none has approved seam/mobile evidence in that catalog.

## Planet, region, and faction coverage

### Base canon

The ground-site authoring manifest defines four current planet identities, 16 regions, eight location classes, and 32 location presets:

| Planet | Regions | Faction / lore identity | Current generated model coverage |
|---|---|---|---|
| Aelos | north, basin, coast, ridge | Nova / UGA civic | Caldris hero, tower, depot, gantry source candidates; no complete kit |
| Pyraeth | crater, belt, caldera, flats | Crimson Dominion | none |
| Nordhall | isles, cliff, frost, peaks | Syndicate | approved skyscraper concept only |
| Vespera | spire, dunes, refinery, plateau | lost civilization under Brood infestation | one rejected candidate; zero accepted architecture |

Those presets target 64 models, 32 2K PBR families, and 96 decal entries in total, but remain authoring targets only.

### Thirty-two-planet expansion library

The 32-planet prompt library has 4 current-canon planets and 28 expansion proposals. Each planet has eight location classes, producing 256 location prompts plus 32 orbital prompts. The first-wave queue marks 29 jobs concept-blocked and three ready, but two “ready” jobs are stale because Elysion and Vespera were already attempted.

Faction applicability by planet proposal:

- **Nova frontline:** Aelos.
- **Crimson Dominion:** Pyraeth, Cinderfall.
- **Syndicate:** Ferrum, Nordhall.
- **UGA Coalition:** Elysion, Thalassa, Viridia, Talos, Nacre, Borealis, Mycora, Ossara, Pelagos.
- **Neutral frontier:** Erebos, Karaxis, Ichoris, Caligo, Lumen, Prismara, Zephyria, Tempestus, Causton, Qadesh, Helion, Gravem, Asterion.
- **Lost colonies:** Karak Prime, Sablemarch, Dredge, Umbra.
- **Brood-hostile overlays or control:** Vespera, Karaxis, Mycora, Ichoris, Karak Prime.

The proposals are authoring guidance, not current runtime canon or generated assets.

### Galactic ground sites

Nine mission seeds and 14 related presets exist. Only Caldris has any dedicated source model. All nine still report no tactical runtime geometry, navigation, collision, dedicated materials, or runtime captures:

`aelos_caldris`, `aelos_heliograph`, `aelos_freeport`, `veyra_orison`, `veyra_lens`, `veyra_ossuary`, `karak_meridian`, `karak_spine`, and `karak_hive`.

## Ranked next 20 missing kit assets

| Rank | Asset | Applies to | Why next / anti-soup constraint |
|---:|---|---|---|
| 1 | `mf_hi_road_primary_straight_32_01` | all 4 canon planets / 16 regions; Nova, Dominion, Syndicate, lost-city Brood overlay | Establish the 18 m socket calibration. Share topology only; bind distinct planet surfaces and contacts. |
| 2 | `mf_hi_road_primary_corner_32_01` | same | Enables legal loops. Must match the straight socket and keep the turn empty. |
| 3 | `mf_hi_road_primary_t_32_01` | same | Creates controlled district branches. No unique landmark on a reusable junction. |
| 4 | `mf_hi_road_primary_x_plaza_48_01` | same | Fixes cross-street placement with a 28×28 m no-building hardstand. |
| 5 | `mf_hi_road_primary_endcap_adapter_32x16_01` | same | Cleanly terminates or adapts primary to local roads; never hide mismatched seams with props. |
| 6 | `mf_hi_road_local_straight_16_01` | canon + frontier colonies | Adds secondary access with visibly subordinate width and markings. |
| 7 | `mf_hi_lane_service_straight_16_01` | rear service, refineries, cargo yards | Connect only declared service sockets; keep public and service circulation distinct. |
| 8 | `mf_hi_concourse_ped_straight_16_01` | cities, colonies, domes, NEXUS-VII | Establish human scale; author open, sealed, and glazed variants from one socket cage. |
| 9 | `mf_hi_wall_gate_32_01` | outposts, bases, refineries, quarantine | Preserve the 18 m open portal and compound collision. |
| 10 | `mf_hi_logistics_depot_01` | Aelos, Pyraeth, Nordhall, frontier | Gives roads and cargo corridors a functional destination rather than another landmark. |
| 11 | `mf_hi_true_broad_command_hub_64_01` | civic/outpost/military cores | Fills the role the current gatehouse failed; one per layout, broad and four-sided. |
| 12 | `mf_hi_refinery_spine_32x64_01` | Pyraeth, Ferrum, Cinderfall, Dredge, Vespera | Makes process flow readable and anchors later tanks/pipes; variants must change machinery/hazards, not color alone. |
| 13 | `mf_hi_industrial_ruin_32_01` | destroyed cities and industrial sites | Derive from a named intact family with one surviving route; no universal ruin pile. |
| 14 | `mf_elysion_cumulus_pressure_dome_traversable_v2` | Elysion / UGA Coalition | Replaces the closed-portal failure with an explicit 18×8 m usable portal. |
| 15 | `mf_aelos_capital_ward_skyscraper_podium_01` | Aelos / Nova | Adds an actual Nova tall family on the 32 m podium rather than repeating the Caldris tower. |
| 16 | `mf_nordhall_cliff_arcology_skyscraper_01` | Nordhall / Syndicate | Convert the approved concept into a glacial machine-vault tower; do not recolor Aelos. |
| 17 | `mf_pyraeth_promethean_base_hero_01` | Pyraeth / Dominion | First dedicated Dominion generated architecture with foundry, motor-court, and pressure-access logic. |
| 18 | `mf_vespera_megaforge_brood_industrial_structure_v2` | Vespera / Brood | Replace the rejected creature-like result with functional living industrial architecture—no face, limbs, or creature pose. |
| 19 | `mf_hi_world_detail_utility_cluster_8_01` | all worlds through distinct variants | Socket water/atmosphere, transformer, valve, vent, and comms detail to utility plots; no random scatter. |
| 20 | `int_uga_n7_deployer_lane_8x8` | NEXUS-VII Strike/Logistics/Mission Ops | First XS/SMALL mixed-mobility module; preserve 8×6 m mech/deployer sockets and protected personnel flanks. |

Full target envelopes and planet/region/faction arrays are recorded in the JSON companion.

## Anti-model-soup production rules

1. A site selects one planet material grammar, one resident-faction silhouette binding, one location-class kit, and one authored damage/infestation state.
2. Generate isolated interoperable modules—not complete random Hunyuan city dioramas.
3. Every generation brief declares scale, floor pivot, footprint, socket faces, clearances, material regions, collision intent, and LOD role.
4. Finish transit topology before hero landmarks.
5. Use a rough 70/20/10 composition ratio: repeatable infrastructure and low/mid modules / identity structures / unique hero landmarks.
6. Palette swaps do not qualify as planet or faction variants.
7. World-detail props attach only to authored service, utility, curb, roof, or plot sockets; never navigation or landing volumes.
8. Road and concourse socket planes stay identical, flat, and obstruction-free.
9. Brood architecture must be functional non-humanoid living infrastructure—not a creature or recolored resident structure.
10. Raw exports, cleaned sources, processing mirrors, LODs, collision, and damage states are lifecycle forms of one canonical asset.
11. Split Hunyuan single-material sources into structural, facade, roof, contact, glazing, emissive, damage, and infestation regions before runtime consideration.
12. Admit a completed pack only after a deterministic socket assembly and phone RTS-scale intact/damaged/infested comparison.

## Catalog contradictions to repair later

This audit does not modify the existing catalogs, but records five status mismatches:

1. Elysion and Vespera are still `READY_FOR_HUNYUAN` in the 32-planet queue after generation attempts.
2. The city/outpost queue still says the operations block is `GENERATING` after its clean export and ledger acceptance.
3. The Caldris model catalog still says the generated tower and gantry are `CONCEPT_READY`.
4. The city/outpost blueprint still says the operations source is pending final completion, although runtime admission correctly remains false.
5. `aelos_caldris.md` says no Spline scene or model source exists even though its adjacent provenance and GLB prove otherwise.

These mismatches can cause duplicate paid generation, inflated asset counts, or skipped downstream work. They should be reconciled in a separately owned catalog-maintenance pass after active model generation is quiescent.

## Recommended generation sequence

1. Approve concepts for ranks 1–4 as one visual family.
2. Generate and normalize one asset at a time; close each finished Spline tab only after export, hash, and ledger capture.
3. Assemble straight + corner + T + X on the 16 m macro grid and prove all 18 m routes.
4. Add adapter, local road, service lane, concourse, and gate; prove public/service/pedestrian hierarchy.
5. Assemble the existing operations block and gatehouse without overlaps, blocked sockets, or random props.
6. Only then add logistics, command, refinery, ruin, dome, faction skyscrapers, Brood industry, and interior modules.
7. Keep every output source-only until semantic materials, compound collision/navigation, authored LODs, damage states, mobile captures, package budgets, and performance evidence pass.

