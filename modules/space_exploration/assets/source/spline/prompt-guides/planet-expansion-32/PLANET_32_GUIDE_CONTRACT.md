# MASSFRONT 32-Planet Spline Prompt Contract

**Status:** source-only expansion authoring. The four existing homeworlds remain runtime canon; the other 28 worlds are proposals until separately approved and integrated.

## Required library size

- 32 distinct planets.
- One orbital/war-table 3D prompt per planet.
- Eight named ground-location prompts per planet:
  `city_colony`, `outpost`, `military_base`, `refinery`, `relic_ruin`, `spaceport`, `pressure_dome`, and `derelict_megastructure`.
- Total: 32 orbital prompts + 256 location prompts = 288 paste-ready prompts.

## Canon boundary

- `aelos`, `pyraeth`, `nordhall`, and `vespera` must retain the identities and save-stable keys in `src/engine/gl.js`.
- `aelos`, `veyra`, and `karak` remain existing exploration-system IDs. A new world must not overwrite a system, site, mission, map, or save key.
- `karak_prime` is an expansion planet proposal inside the Karak system; it does not replace `karak_meridian`, `karak_spine`, or `karak_hive`.
- Every newly proposed planet stays `runtimeReady:false` until content, progression, save compatibility, performance and evidence gates pass.

## Diversity contract

No planet may be a generic recolor. Every planet must differ substantively on at least six axes:

1. Geology and large-scale landform.
2. Atmosphere, cloud behavior and orbital limb.
3. Hydrology or volatile cycle.
4. Dominant biome/ecology.
5. Settlement/industrial construction logic.
6. Hazard and destruction language.
7. Planetary material response and 2K texture families.
8. Night-side emission, rings, moons, debris or other orbital silhouette feature.

Every ground location must name its own hero silhouette, circulation logic, material/decal identity, damage graph and gameplay objective. Reusing a shared structural grid is allowed; cloning one layout and changing color is not.

## Orbital/war-table prompt requirements

- Root `PLANET_<planet_id>` with separately named terrain sphere, water/volatile layer when applicable, cloud layer, atmosphere limb, ring/debris/moon elements and night emission.
- Lighting-neutral authored albedo plus normal/roughness/height/emission drivers. No baked star light or screenshot-derived surface.
- Declare polar, equatorial, ocean/ice, city-light and hazard masks where relevant.
- Supply tactical-region marker anchors without baking UI labels into the planet texture.
- Preserve a strong silhouette at phone war-table size; clouds and atmosphere must not erase landform identity.
- Target a bounded preview: one primary sphere, no more than three transparent shell layers, instanced debris, and declared LOD/texture fallback.

## Ground-location prompt requirements

- Use the shared combined-arms dimensions in `../PROMPT_GUIDE_CONTRACT.md`.
- Each location gets a named hero, modular output list, exact meter envelope, routes/portals/turn courts, cover/breach/objective logic, damage states and applicable Brood stages.
- Brood remains non-playable and non-humanoid. Infestation must invade, digest, brace or replace materials according to the local ecology; it cannot be a universal purple/green overlay.
- Every location declares 2K PBR source families, decal language, UVs, pivots, collision/nav/LOS proxies, LODs, naming, export and matched mobile evidence.

## Original-art boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2 and StarCraft II may guide only broad visual principles. Do not copy or trace any protected asset, map, building, unit, material, decal, symbol, logo, UI, palette, organism, animation, effect, screenshot, or named landmark. Every output must be original MASSFRONT work with source provenance.

## Runtime truth rule

A prompt, concept, Spline scene, or source GLB is not a playable planet or level. `runtimeReady:true` requires an approved catalog contract, unique IDs, packaged assets, navigation/collision/destruction data, save migration, phone-first captures, source/runtime hashes, performance evidence and zero runtime/WebGL errors. Missing evidence is `UNKNOWN` or failure.
