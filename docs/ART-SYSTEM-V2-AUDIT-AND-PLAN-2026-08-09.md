# MASSFRONT Art System V2 and Procedural Asset Architecture

**Audit date:** 2026-08-09  
**Audited source lineage:** project handoff identifies 1.33.4  
**Delivery scope:** Web/PWA and Google Android  
**Status:** audit complete; an opt-in local Material V2/geometry-LOD laboratory is implemented; no roster migration or art-prototype release was performed

## Executive verdict

MASSFRONT already has a capable, scale-conscious WebGL2 battle renderer. It is not a sprite-only or flat-color engine: it has instanced indexed meshes, a three-map material atlas, normal mapping, AO/gloss/metal/emissive response, rigid hierarchical bones, local lights, projected contact shadows, depth-based SSAO, bloom, FXAA, fog, billboards, and aggressive adaptive effect budgets.

The missing layer is an **authored asset/material architecture**. The current atlas applies a shared tile vocabulary to largely procedural geometry. It does not retain glTF scene hierarchies, named sockets, general submeshes, authored per-asset masks, geometry LOD chains, material LODs, shadow maps, environment reflections, or a reusable high-quality Arsenal renderer. Procedural construction exists, but as hand-coded model builders and hard-coded part offsets—not as deterministic artist-authored modular assembly.

The safest direction is therefore evolutionary:

- keep the legacy atlas renderer as the large-army fallback;
- add an opt-in Material V2 program and asset metadata path beside it;
- prove one ordinary mechanical unit before converting anything else;
- merge modular parts into a bounded set of cached shared meshes instead of creating one GPU mesh per unit;
- reserve costly material features for close/Arsenal LODs;
- measure 100- and 200-unit mixed scenes before every expansion.

The supplied reference art is useful for its coherent load paths, connected mechanical construction, bevel hierarchy, restrained livery, readable armor/recess separation, and localized wear. It should guide quality—not replace MASSFRONT's faction silhouettes or identity.

## Audit method and evidence boundary

This report is based on the current repository, `AGENTS.md`, `docs/HANDOFF.md`, `docs/CHATGPT-PROJECTS-HANDOFF.md`, the existing material/FX audit, and the owner's supplied screenshots. A fresh interactive browser capture was not available in this session, so visual claims that need live confirmation are identified as validation gates rather than reported as completed facts.

One documentation mismatch matters: older handoff notes describe a smaller atlas and an explicit final gamma power. Current source uses an 11-column, 2816-pixel atlas and the current battlefield fragment shader does not apply that documented output transform. The code is authoritative for this audit; color transfer must be measured before tuning art around it.

---

# Deliverable 1 — 25-point renderer and asset audit

## 1. Renderer entry points and files

### Currently implemented

- `src/main.js` owns `boot()` and the animation frame loop. Boot preloads material atlases, creates the WebGL renderer, builds fallbacks, initializes billboards/models/terrain, and starts `requestAnimationFrame(frame)`.
- `src/ui/render3d.js` owns battlefield composition and draw ordering through `render(dt)`.
- `src/engine/gl.js` creates the WebGL2 context and contains shared GL, camera/math, legacy sprite, terrain-preview, and planet-preview utilities.
- `src/engine/mesh.js` is the primary 3D implementation: instanced mesh streams, cameras, shaders, model lighting, terrain, SSAO, bloom, and final composite.
- `src/engine/billboard.js` handles world-space alpha/additive billboards, including health bars and many effects.
- `src/engine/materials.js` defines material roles, loads the three atlases, and generates procedural fallback atlases.
- `src/engine/models*.js` and `src/engine/models-world-loader.js` construct or load the actual battlefield geometry.

### Proposed

Keep these entry points. Add small opt-in seams rather than replacing `render(dt)` or the current GL context.

## 2. Shader source files

### Currently implemented

- `src/engine/gl.js`: legacy 2D sprite vertex/fragment shaders.
- `src/engine/mesh.js`:
  - `VS3D` / `FS3D`: instanced battlefield models;
  - `VSG` / `FSG`: unlit/additive geometry;
  - `VST` / `FST`: terrain;
  - `VSQ` / `FSAO`: depth-based SSAO/composite;
  - `FSBRIGHT`, `FSBLUR`, `FSCOPY`: bloom extraction, blur, FXAA/final copy.
- `src/engine/billboard.js`: `VSBB` / `FSBB` for world-space sprites.
- `src/ui/hud.js`: `MF_INTEL3D_VS` / `MF_INTEL3D_FS` for the separate live intelligence preview.

### Proposed

Add a distinct `VS_MAT2` / `FS_MAT2_BATTLE` pair first. Add a far variant only after measurement. Do not turn `FS3D` into a boolean-heavy mega shader.

## 3. Current material inputs

### Currently implemented

The instanced model vertex format is 12 floats:

- position: 3;
- normal: 3;
- vertex color: 3;
- UV: 2;
- packed material/rigid-bone value: 1.

Per-instance data is 11 floats: position/scale, yaw, color/alpha, cross-axis width, and animation phase. The fragment material inputs are:

- albedo atlas;
- normal atlas;
- packed ORM atlas;
- vertex color;
- per-instance tint/emission encoding;
- material tile ID;
- faction/organic flags derived from geometry/material conventions.

The packed ORM meaning is:

- R: ambient occlusion;
- G: gloss, interpreted as inverse roughness;
- B: emissive strength;
- A: metallic response.

### Proposed

Material V2 should preserve the compact battle vertex/instance path where possible, but add authored asset metadata and authored masks. The opt-in laboratory now proves a provisional three-texture contract: Base+AO, NormalXY+Roughness+Emissive, and Metal+FactionPrimary+FactionSecondary+Wear. It remains provisional until one Blender-authored asset completes the export/import round trip.

## 4. Current texture formats and layout

### Currently implemented

- `assets/textures/mat-albedo.png`: uploaded as `SRGB8_ALPHA8`.
- `assets/textures/mat-normal.png`: linear RGBA.
- `assets/textures/mat-orm.png`: linear RGBA.
- Current atlas configuration is 11 columns at 256 pixels per tile, producing a 2816 × 2816 source atlas with material IDs 0–105.
- Mipmaps and anisotropic filtering are used when available.
- Mobile reduces the atlas to approximately 1408 × 1408 (about 128 pixels per tile). Source comments estimate roughly 32 MB for the three mobile atlases including mipmaps.
- A generated procedural atlas exists as a fallback when the authored atlas cannot load.
- PNG remains the current material delivery format. KTX2/Basis is not currently part of this material path.

### Proposed

Use authored per-asset V2 textures only for opted-in benchmarks, with explicit residency budgets. A 1024 RGBA8 three-map set with mipmaps is roughly 16 MB before compression; it is not a viable default for a large roster. Prefer 512 battle sets, shared sets/arrays where art permits, and 1024 only for controlled hero/Arsenal residency. Investigate KTX2 only after visual correctness and LOD policy are stable.

## 5. Mesh/model loader

### Currently implemented

Most units and structures are constructed once at initialization by `MeshBuilder` functions in `src/engine/models*.js`.

There are three import/data paths:

- `tools/blender_export.py` exports one evaluated Blender mesh object, triangulates it, maps Blender material names to atlas roles, marks team livery, and supports rigid `bone.NN` vertex groups.
- `tools/blender_import.mjs` converts exported data into the engine's packed 12-float geometry and writes `MF_BLENDER_GEO` payloads.
- `tools/glb_import.mjs` parses a GLB, but currently reads only `gltf.meshes[0]`, flattens its primitives, and does not traverse the retained scene-node graph or apply arbitrary node transforms.
- `src/engine/models-world-loader.js` consumes generated `WORLD_MODELS` from `src/engine/models-world-data.js` and produces a unified engine mesh.

The repository also contains named `MF_BLENDER_GEO` payloads in `assets/data/meshes.js`, while current numeric combat lookups and world-model lookups use different routes. This appears to be a legacy or incomplete pipeline transition and must be traced before removal; it is not safe to delete based on this audit alone.

### Proposed

Extend the existing exporter/importer in a versioned mode so it can emit UV0, material semantics, nodes/sockets, bounds, and optional LOD IDs while preserving legacy output.

## 6. Multiple submesh support

### Currently implemented

**Partial only.** One unified mesh can contain multiple material regions because every vertex carries a material tile ID. Hulls and turrets, dropship body/gear/VTOL parts, and building bases/turrets can also be separate `InstMesh` streams. There is no general retained submesh object with its own material, bounds, and node transform.

### Proposed

For battle assets, prefer merging compatible static modules into one geometry while retaining semantic material IDs. Preserve separate streams only for independently animated parts such as turrets, doors, rotors, articulated gear, or damage swaps.

## 7. Hierarchical transforms

### Currently implemented

**Limited.** `VS3D` supports up to 80 rigid bone matrices and a short parent chain. A vertex belongs to one rigid bone; there are no blended skin weights. This is sufficient for simple Brood articulation and mechanical leg motion. Separate meshes also use hard-coded part transforms.

There is no general retained scene graph for imported assets.

### Proposed

Keep the rigid-bone path for battle scale. Add a small CPU-side node hierarchy only for authored module/socket transforms and preview animation. Do not introduce full skeletal skinning to every battle unit without a measured use case.

## 8. Named nodes and sockets

### Currently implemented

There is no general named socket registry. The engine has semantic hardpoints expressed as code and numbers—for example hull/turret streams, dropship part offsets, module-kit mount offsets, and individual geometry builder helpers—but these are not portable socket metadata.

### Proposed

Add named socket metadata with:

- socket name and domain (`hull`, `turret`, `base`, `organic-body`);
- local transform;
- compatible factions, tiers, and archetypes;
- allowed module categories;
- semantic surface family;
- bounds and optional mirror rule.

## 9. Runtime mesh assembly

### Currently implemented

**Yes, but not as a generic asset system.** JavaScript model builders combine primitive forms deterministically at initialization. Faction factories and tier variants construct related geometry. `src/engine/modkit.js` attaches bounded module meshes at render time using deterministic variation.

This is not yet a data-driven `{generatorVersion, faction, archetype, tier, variantSeed}` assembly grammar. Separate module-kit draws have also contributed to the owner's reported floating/oversized attachment problems.

### Proposed

Build a bounded, deterministic author-authored module assembler. Merge static module geometry on the CPU into cached shared configurations; retain separate meshes only for animated parts. Never create a unique GPU mesh for every cosmetic seed.

## 10. Instancing

### Currently implemented

Yes. `InstMesh` queues visible instances and renders them with `drawElementsInstanced`. Streams grow geometrically and support large instance counts. Geometry and textures are shared.

### Proposed

Material V2 and procedural configurations must keep this contract. Cache by a bounded configuration key and render all units using the same resolved geometry/material set in one stream.

## 11. Batching

### Currently implemented

The renderer batches by shared mesh stream: unit model, hull/turret, faction kit, building type/upgrade variant, world prop, particle, and billboard. The global atlas avoids splitting ordinary model draws by material. There is no general global material/state sorter or multi-draw system; different meshes and module variants remain different draw calls.

### Proposed

Maintain an explicit batch key such as `program + geometry + textureSet + materialLOD`. Limit procedural catalogs so cosmetic variety cannot produce unbounded batch fragmentation.

## 12. Current geometry LOD

### Currently implemented

There is no true runtime geometry LOD chain for ordinary models. Building variants correspond primarily to gameplay upgrade levels, not view-distance LOD. GLB import can reduce a mesh during conversion, but produces one resulting level.

Adaptive systems reduce effects and animation work at low performance, but do not swap model geometry.

### Proposed

Add optional authored LOD0/LOD1/LOD2 metadata after the first Material V2 benchmark. Use hysteresis and projected screen size. Strategic silhouettes should preserve faction and weapon-role landmarks, not merely decimate every triangle uniformly.

## 13. Current culling

### Currently implemented

- CPU-side coarse camera-bound checks and fog-of-war visibility checks;
- adaptive skipping/sampling for very large Brood and projectile/effect populations;
- no retained frustum-plane culler, spatial hierarchy, occlusion culling, or Hi-Z system;
- major lists are still scanned per frame;
- imported bounds exist in parts of the pipeline but are not a general `InstMesh` culling primitive.

### Proposed

Before raising mesh density across the roster, introduce reusable model bounds and screen-size calculation. Spatial partitioning should be considered separately because CPU scanning may become the limiting factor before the new shader does.

## 14. Current shadows

### Currently implemented

There are no shadow maps or cascaded shadows. Units/buildings receive inexpensive projected footprint/contact-shadow decals using multiply blending and sun-relative offsets. Depth-based SSAO adds contact grounding when enabled.

### Proposed

Preserve projected shadows in battle. Test one higher-quality, tightly bounded shadow-map setup only in Arsenal/hero scenes first. Do not make cascaded battlefield shadows a Material V2 dependency.

## 15. Current lighting model

### Currently implemented

The battlefield model shader is a PBR-lite forward model:

- directional sun and day/night input;
- hemispheric sky/ground ambient;
- normal mapping through derivative-generated tangent space;
- AO-weighted ambient;
- wrapped/Lambert diffuse;
- roughness/gloss and metallic-influenced specular;
- subtle rim separation;
- special Brood wrapped/back-transmission response;
- up to eight selected local lights;
- fog, exposure mapping, and bloom support.

There is no environment cubemap/IBL response. The present color pipeline mixes sRGB atlas decoding, linearized CPU local-light colors, untreated vertex colors, and a fragment output without an explicit final gamma transform. That is a validation issue, not permission to blindly brighten assets.

### Proposed

First establish an 18% grey-card, rough-metal, chrome, emissive, and normal-map reference scene. Then make color transfer explicit in Material V2. Add a cheap environment-specular lookup before considering SSR.

## 16. Current emissive implementation

### Currently implemented

Emissive strength comes from ORM blue plus a global uniform and per-instance emission encoding. It is added after much of the lit/fogged surface calculation, receives a night boost, and feeds the bloom threshold. Its color is derived primarily from the lit surface/vertex color rather than a fully independent authored emissive-color texture.

### Proposed

Material V2 should retain restrained emissive masks, permit controlled authored emissive color, and clamp/budget bloom contribution by material LOD. T3 must not become “more glowing lines.”

## 17. Framebuffer, depth, and post-processing pipeline

### Currently implemented

- WebGL2 context with native antialiasing disabled.
- Optional scene render to an RGBA8 color buffer with a `DEPTH_COMPONENT24` texture.
- Depth-based SSAO/composite into a second RGBA8 buffer.
- Original depth is detached/reattached so transparent decals, water, additive geometry, and billboards can follow.
- Quarter-resolution RGBA8 bloom extraction and two-pass blur.
- Final FXAA plus bloom composite to the default framebuffer.
- Post resources reserve texture units 4/5/6; fog uses 7; material atlases use 0/2/3. Any V2 path must preserve this state discipline.
- No HDR floating-point scene color, material G-buffer, velocity buffer, TAA, or reflection buffer.

### Proposed

Do not replace this chain for the prototype. Material V2 should draw into the same opaque scene target and restore all blend/cull/depth/depth-write/program/texture state before legacy rendering continues.

## 18. SSR technical practicality

### Currently implemented

SSR is not implemented.

### Proposed assessment

It is technically possible because WebGL2, scene color, scene depth, and a known orthographic battlefield camera already exist. It is not a low-risk battle default because:

- no view-space normal/roughness buffer exists;
- normal-mapped reflection direction cannot be reconstructed accurately from depth alone;
- current scene color is LDR RGBA8;
- transparent/off-screen objects will be missing;
- ray marching adds substantial mobile bandwidth and fill cost;
- edge/disocclusion artifacts would be conspicuous on moving cameras.

The first reflection upgrade should be a roughness-driven environment cubemap/specular approximation. SSR should be an optional Arsenal/hero experiment with graceful fallback, device-quality gating, extension checks, and explicit frame-time measurements.

## 19. Current and possible Arsenal 3D preview path

### Currently implemented

Store/Arsenal presentation is still primarily card/2D-art based. `src/ui/hud.js` contains a live intelligence preview that:

- creates a separate WebGL2 context when opened;
- uses a hidden shared preview context for cached card PNGs;
- reuses faction model geometry and separate hull/turret parts;
- uses a perspective camera and rotation;
- uses a much simpler vertex-color + directional/hemi/rim shader.

It does not reproduce battlefield material atlases, normal/ORM response, skeleton animation, local lights, SSAO/bloom, authored reflections, or Material V2. It is therefore not a material-accurate Arsenal renderer.

### Proposed

Create one reusable `PreviewRenderer` with one managed context/canvas, its own FBO/state, and selectable showcase quality. Reuse it for Intel and Arsenal rather than creating more contexts. It can host highest geometry/material LOD, stronger shadows, environment reflection, and later optional SSR.

## 20. Safest Material V2 insertion point

### Proposed

1. Add `src/engine/materials-v2.js` after `materials.js` in both manifests.
2. Define a small opt-in descriptor (`materialVersion: 2`) and V2 texture-set cache.
3. Add a separate V2 program/mesh stream that preserves current instancing.
4. Add a narrow model registration seam in `src/engine/models.js`.
5. Queue V2 opaque objects from `src/ui/render3d.js` beside legacy opaque objects.
6. Keep every unconverted asset on legacy `FS3D`.

A separate vertex program is appropriate because current `VS3D` scales/tile-wraps UVs for atlas materials. Authored unique UV0 must not inherit that behavior.

## 21. Safest procedural assembly insertion point

### Proposed

Add `src/engine/model-assembly.js` after mesh/material declarations and before concrete model initialization. Its responsibilities should be:

- deterministic seed/hash utility;
- module compatibility resolution;
- named socket transform resolution;
- CPU geometry append/transform for static modules;
- separate animated-part output where necessary;
- semantic material remapping;
- bounds generation;
- cache by bounded configuration key;
- no gameplay stat generation.

This should feed the existing `InstMesh` path. It should not begin with runtime CSG or arbitrary topology generation.

## 22. Estimated performance and stability risks

### Currently observed architectural risks

- Material atlas residency is already meaningful on mobile.
- Full-resolution SSAO plus two color targets and depth increases context-loss sensitivity.
- Multiple preview WebGL contexts pressure Android context and memory limits.
- Main culling remains list-based/O(N).
- Imported geometry is restricted by 16-bit indices and current shared format.
- Derivative tangent frames may expose seams on authored unique normal maps.
- Color-transfer ambiguity can lead to incorrect brightness/material tuning.
- Extra procedural module streams increase draw calls and can visually detach.

### Proposed-system risks

- per-asset texture sets can fragment batches and cause excessive binds;
- unique mesh creation per seed would explode GPU memory;
- normal/mask/environment reads increase shader and bandwidth cost;
- higher geometry density amplifies CPU submission and GPU vertex cost;
- LOD transition/popping can damage role readability;
- SSR can dominate mobile fill rate;
- changing KTX2 and material semantics together would make failures hard to isolate.

Mitigation is mandatory: bounded shared configurations, material LOD, screen-size thresholds, strict texture budgets, one managed preview context, and 100/200-unit performance gates.

## 23. Exact files that would need modification

### Smallest prototype

- `boot.js` — registration only, not updater/rollback logic;
- `assets/data/manifest.json` — load/bundle order;
- `src/engine/materials-v2.js` — new opt-in material program/cache;
- `src/engine/models.js` — one benchmark registration seam;
- `src/ui/render3d.js` — one V2 opaque queue/flush seam;
- `tools/blender_export.py` and/or a versioned companion — V2 UV/material/socket metadata;
- `tools/blender_import.mjs` and/or a versioned companion — packed V2 asset generation;
- a new generated benchmark data file under `assets/data/`;
- new audit/test tools for the material lab, instance counts, and screenshots.

### Later phases only

- `src/engine/model-assembly.js` — new controlled assembly layer;
- `src/ui/hud.js` — migrate Intel preview to a shared preview renderer;
- `src/storeui.js` — connect Arsenal cards to that renderer;
- selected `src/engine/models-*.js` files only when individual benchmark conversions are approved;
- graphics-quality settings only after LOD variants are measured.

## 24. Exact files and systems that should not be touched

For the Material V2 prototype, do not modify:

- gameplay stats, weapon balance, `src/game/sim.js`, economy, AI, commander abilities, research/doctrine, or endgame systems;
- faction playability or Brood AI-only status;
- Standard/Campaign/Co-op/MMO availability or rules;
- account, authentication, store checkout, paid economy, Cloudflare, friend/chat, or matchmaking systems;
- updater/rollback logic or live `update.json`;
- Android billing/native bridge code;
- generated `www/`, `dist/`, or Android packaged web output by hand;
- generated mesh payloads by hand;
- the legacy material shader/atlas behavior for unconverted assets;
- established faction logos and approved silhouettes.

`boot.js` may receive only the normal manifest entry needed for a new source file. That does not authorize updater changes.

## 25. Proposed smallest implementation prototype

### Prototype: Nova ordinary heavy tank material lab

Use one ordinary mechanical tank—not a commander, experimental, or Brood unit—to compare legacy and V2 under identical production lighting.

Deliverables:

1. one connected, unique-UV benchmark mesh with primary armor, structural alloy, dark machinery, weapon material, restrained livery, glass/sensor, emissive, and localized wear;
2. legacy and V2 side-by-side in the same camera/light;
3. V2 debug views for albedo, AO, normal, roughness, metal/material class, faction masks, wear, and emissive;
4. deterministic asset ID and shared GPU resources;
5. 1-, 100-, and 200-instance test scenes with terrain, UI, effects, and selection state;
6. 412 × 915 captures at close, typical, and far camera distances on bright and dark terrain;
7. grey-card/rough-metal/chrome/emissive reference objects;
8. no SSR, no KTX2, no gameplay changes, no library migration.

Exit criteria:

- no UV stretching or floating intersections;
- faction, role, and tier remain readable at normal phone combat distance;
- armor, structure, machinery, glass, and emissive remain distinct;
- no context loss or broken post-process state;
- median 100-unit frame-time regression is no worse than 10% against the captured legacy baseline;
- the 200-unit case reaches a stable quality fallback rather than losing geometry/effects;
- all unused assets remain bit-for-bit on the legacy path.

---

# Deliverable 2 — staged implementation plan

Every phase ends with `node tools/bundle.mjs`, a phone visual inspection, and a comparison to the preceding performance baseline. No phase authorizes publishing.

## Phase 1 — Renderer and asset audit

**Deliverable:** this report, pipeline map, protected-system boundary, and baseline-test specification.  
**Exit gate:** current versus proposed systems are clearly separated; no gameplay or release mutation.

## Phase 2 — Material V2 beside legacy

**Deliverable:** opt-in V2 program, texture cache, debug views, reference material lab, and one registered test asset.  
**Exit gate:** legacy output is unchanged, GL state is restored, texture memory is reported, and material channels are visually verified.

## Phase 3 — Ordinary combat unit conversion

**Deliverable:** Nova heavy tank benchmark with coherent geometry/material hierarchy and RTS-distance readability.  
**Exit gate:** 1/100/200-unit test, bright/dark phone captures, no more than the agreed measured regression.

## Phase 4 — Material LOD

**Deliverable:** Showcase, Battle, and Far variants selected by context/projected size with hysteresis.  
**Exit gate:** far units lose invisible texture work without losing silhouette, faction, weapon role, or stable mip behavior.

## Phase 5 — Structure conversion

**Deliverable:** one factory, defensive, or power structure with foundation/core/machinery/roof/glass/emissive separation.  
**Exit gate:** large surfaces remain quiet, grounded, and free of stretching; mixed-base performance passes.

## Phase 6 — Hero/commander/experimental conversion

**Deliverable:** one fully authored hero benchmark using the highest justified close-up quality.  
**Exit gate:** combat LOD remains scalable; hero detail is not forced onto army units.

## Phase 7 — Mechanical modular/socket architecture

**Deliverable:** versioned module schema, named sockets, compatibility validation, deterministic resolver, static geometry merger, animated-part output, bounds, and cache.  
**Exit gate:** invalid intersections are rejected, repeated keys reproduce identical output, and resolved configurations share GPU resources.

## Phase 8 — Deterministic procedural tank family

**Deliverable:** related T1/T2/T3 mechanical tanks plus one role variant, all visibly sharing lineage.  
**Exit gate:** faction/tier/weapon role are readable, no arbitrary CSG, no per-unit unique GPU meshes, and 100/200-unit batching remains acceptable.

## Phase 9 — Procedural structure family

**Deliverable:** one foundation/core/tier-shell structure family with bounded production/power/defense/utility modules.  
**Exit gate:** upgrades look like coherent evolution, foundations remain connected, and module count does not fragment draws beyond the budget.

## Phase 10 — Brood Material V2

**Deliverable:** one AI-only Brood unit or structure using chitin, tissue, bone/tendon, membrane, wetness, wound, secretion, and bioluminescent semantics.  
**Exit gate:** it is visibly biological rather than recolored metal, keeps role silhouette, and preserves Brood AI-only status.

## Phase 11 — Brood procedural caste prototype

**Deliverable:** deterministic “same caste, different specimen” variations using bounded body/limb/carapace/sensory/weapon-organ modules.  
**Exit gate:** variation never obscures class silhouette or creates random-monster noise; GPU resources remain shared.

## Phase 12 — Arsenal high-quality rendering

**Deliverable:** one reusable managed `PreviewRenderer` shared by Intel and Arsenal with the highest material/geometry LOD, improved lighting, optional stronger shadows, and controlled camera.  
**Exit gate:** one context is reused, previews match production materials, no Android context pressure/regression, and fallback art remains available.

## Phase 13 — Optional advanced reflections/SSR test

**Deliverable:** environment reflection first, then an isolated Arsenal SSR experiment if still justified.  
**Exit gate:** documented device/frame-time/edge-artifact results and graceful fallback. Battle SSR remains off unless target-device evidence supports it.

## Phase 14 — KTX2/Basis investigation

**Deliverable:** offline conversion experiment on already-approved V2 textures, format fallback matrix, download/GPU-memory measurements.  
**Exit gate:** identical material interpretation and measurable distribution/memory benefit without coupling compression changes to shader redesign.

## Phase 15 — Controlled asset-library migration

**Deliverable:** prioritized migration in small tranches, each with visual, memory, performance, and gameplay-readability signoff.  
**Exit gate:** legacy fallback remains until each tranche passes; no bulk conversion is accepted solely because it renders.

---

# Cross-phase benchmark matrix

The four required representative assets must be accepted before broad conversion:

| Benchmark | Purpose | Minimum scene validation |
|---|---|---|
| Ordinary tank/mech | army-scale material and silhouette | 1, 100, 200 instances |
| Structure | broad surfaces and architectural separation | mixed base plus combat |
| Hero/commander | close-up/Arsenal ceiling | showcase and battle LOD |
| Brood unit/structure | organic grammar proof | mixed-faction battle |

For each applicable phase, record:

- browser/device and graphics quality;
- viewport and DPR;
- unit/building/projectile/effect counts;
- median and slow-frame timing where measurable;
- draw calls/program or texture-set changes where instrumented;
- triangle and texture-residency estimates;
- context-loss or allocation failures;
- close/typical/far 412 × 915 captures on bright/dark terrain;
- selected and unselected state.

# Immediate recommendation

Do not start by converting the Nova command deployer, all structures, or the Brood library. Begin with the ordinary Nova tank material lab. It is the fastest way to settle the color pipeline, UV/export contract, semantic masks, readable material ratio, batching cost, and material LOD before those decisions become expensive across the roster.

---

# Implementation record — 2026-08-09

## Published safety baseline

MASSFRONT `1.33.5` was built, signed, uploaded, and activated before this art
prototype began. The live updater was activated last. Its remote OTA SHA-256
matches the local release archive, and the Android package remains
`com.creatorjd.massfront` with v2/v3 signing intact.

## Currently implemented locally: Phase 2 laboratory and Phase 3 visual benchmark

- `src/engine/materials-v2.js` is registered immediately after the legacy
  material system in both runtime manifests.
- V2 is strictly opt-in through `?materiallab=1`. Without that query, it
  allocates no shader, textures, mesh streams, overlay, or diagnostic object.
- Three 512 × 512 battle maps implement the prototype contract: Base+AO,
  NormalXY+Roughness+Emissive, and Metal+FactionPrimary+FactionSecondary+Wear.
- The controlled Arsenal/showcase path uses three asset-specific 1024 × 1024
  maps generated from a unique, non-overlapping UV0: Base+AO,
  NormalXY+Roughness+Emissive, and
  Metal+FactionPrimary+FactionSecondary+Wear. They live under
  `assets/textures/materials/nova-heavy-tank-v2-*.png` and are loaded only by
  the explicit showcase. The semantic masks do not spill onto glass,
  emissives or open machinery.
- The earlier grayscale micro-surface source remains the fallback experiment
  for procedural geometry, but the authored tank no longer repeats it across
  semantic tiles. Its restrained variation is baked into the unique asset
  maps with face-scale macro separation and bevel-derived wear.
- Base color is stored as sRGB; data maps remain linear. The shader performs
  explicit color conversion and a PBR-lite GGX/specular plus cheap environment
  response suitable for testing army scale.
- Debug views expose albedo, normal, AO, roughness, metal, faction masks,
  emissive, and wear.
- A day/night switch and four calibrated reference blocks make channel and
  lighting failures visible on a 412 × 915 phone viewport.
- The source Blender scene contains 163 authored nodes and 156 rendered parts.
  The bake stage evaluates and joins those parts into one static battle-safe
  mesh while retaining six named sockets. The resulting showcase payload has
  19,154 triangles, 29,876 UV-split vertices, one rendered part, nine
  semantic material regions, unique UV0 and three packed maps. It contains continuous bevelled
  armor, linked suspension parts, tread shoes, supported twin cannon/recoil
  systems, hollow bores, rangefinders, exhausts, optics and service clusters.
  The source `.blend`, GLB and review render live under
  `source-media/material-v2/nova-heavy-tank-v2/`.
- The same bake generates authored LOD1 offline: 8,810 triangles and 19,185
  UV-split vertices (54% fewer triangles than LOD0). It reuses the three maps,
  keeps all nine semantic regions and six sockets, and preserves the twin
  cannon/track/turret silhouette in close, tactical and far phone captures.
- The established Nova crest is baked from `assets/factions/nova_icon_256.png`
  onto dedicated top/side identification plates. Runtime tint masks exclude
  the crest so established faction art is preserved rather than washed into a
  solid faction-color square. Layered turret cheeks, skirt armor groups and
  restrained role bars strengthen macro separation at phone scale.
- Clean, worn and critical presentation controls exercise the packed
  wear/damage channel without a new texture sample. Ordinary bevel wear stays
  below 0.48; three authored object-space strike regions occupy the high mask
  range. Strikes therefore stay on real vehicle regions after UV repacks, and
  critical heat/scorch remains local rather than blackening every AO cavity.
  Close, tactical and far controls validate which detail survives at real
  screen size.
- The imported two-megabyte geometry payload is loaded asynchronously only by
  the explicit showcase query. It is not registered as a boot script and is
  therefore not downloaded or parsed by an ordinary game launch.
- Battle LOD remains the 2,088-triangle procedural mesh with 207 UV islands and
  removes inspection geometry before large formations are submitted.
- Showcase-only geometry and its 1024 maps are selected by
  `?materialquality=showcase`; the 100/200-unit tests use battle geometry and
  512 maps. This is the first explicit geometry/material LOD split in the lab.
- The renderer returns to `begin3D()` immediately after V2 so production
  objects never inherit its program or texture bindings.

This tank is a geometry and material-architecture benchmark, not an approved
replacement for the production roster asset. It is more detailed than the
first primitive prototype, but it is **not Supreme Commander 2 visual parity**.
This stage proves Blender hierarchy, deterministic transform flattening,
unique UV0, packed asset maps, aligned faction/material masks, sockets and a
single-stream runtime payload. The remaining close-up gap is richer hand-painted
serial/stencil sheets beyond the first faction badges, stronger baked
macro-normal detail, and device-GPU lighting calibration—not another global
noise texture or a higher triangle count alone.

## Verification results

Environment: local Chrome/ANGLE SwiftShader, 412 × 915, touch enabled. These
numbers are a repeatable software-renderer comparison, not target Android GPU
performance.

| Scene | Legacy fps | Material V2 fps | Result |
|---|---:|---:|---|
| 100 battle-LOD tanks | 9.86 | 10.55 | no measured V2 regression; difference remains software-renderer noise |
| 200 battle-LOD tanks | 8.31 | 8.93 | no measured V2 regression; difference remains software-renderer noise |

The 19,154-triangle LOD0 showcase measured 14.13 fps and the 8,810-triangle
LOD1 showcase measured 14.42 fps in the same SwiftShader environment. Absolute
numbers are not Android performance claims; only like-for-like relationships
are meaningful here.

- 100- and 200-tank V2 scenes each remained one model draw stream.
- V2 shader/link errors: 0.
- V2-scoped GL errors: 0.
- Context losses: 0.
- Test console/page errors after excluding expected sandboxed remote-audio
  network denials: 0.
- Opt-out smoke test confirmed the normal game had no V2 diagnostic, overlay,
  program, resource allocation, or request for the authored payload.
- Bundle gate: 60 classic-script sources, 17.97 MB. The 2.0 MB generated GLB
  payload stays outside the boot bundle and is showcase-only.
- Re-importing the baked GLB produced the identical SHA-256
  `0C4B04119E5B5C4E3C96CA32B63CC316C2B844E45258DD351C590221EDF9A883`.
- Re-importing authored LOD1 produced the identical SHA-256
  `1494BE1D67730D1200DF80FF1F8995A4DE6D54D4EC9C91F06CEFCB1254A44888`.
- Repeated offline bakes also produced identical BaseAO, NRE and mask PNGs;
  object-space damage and faction badges are deterministic, not runtime noise.
- Capacitor web staging resolved the complete manifest without missing files.

Repeatable commands:

```text
node tools/bundle.mjs
node tools/pack-www.mjs
node tools/test-material-v2-optout.mjs http://127.0.0.1:8974/
node tools/test-material-v2-lab.mjs http://127.0.0.1:8974/
node tools/test-material-v2-lab.mjs http://127.0.0.1:8974/ quick 1
```

Captured local evidence:

- `.tmp/material-v2-1-v2-day.png`
- `.tmp/material-v2-1-night.png`
- `.tmp/material-v2-1-masks.png`
- `.tmp/material-v2-1-worn.png`
- `.tmp/material-v2-1-critical.png`
- `.tmp/material-v2-1-v2-lod1-day.png`
- `.tmp/material-v2-1-lod1-tactical.png`
- `.tmp/material-v2-1-lod1-far.png`
- `.tmp/material-v2-100-v2-day.png`
- `.tmp/material-v2-200-v2-day.png`

## Next safe implementation slice

Phase 3's UV/packed-map, first faction-marking and first authored geometry-LOD
gates now pass locally. Calibrate bright/dark plus close/tactical/far
presentation on a real Android GPU next. If that evidence is acceptable, begin
Phase 5 with exactly one structure benchmark; do not convert the command
deployer, full structure library, commander or Brood assets as a bulk tranche.

## Phase 5 local implementation record — Nova Factory benchmark

The first structure benchmark is now implemented locally and remains opt-in.
It is selected with
`?materiallab=1&materialquality=showcase&materialasset=factory`; neither factory
payload is registered in `boot.js` or `assets/data/manifest.json`, so an
ordinary launch does not download, parse, allocate or draw it.

- The Blender source is `source-media/material-v2/nova-factory-v2/` and the
  repeatable build/bake scripts are
  `tools/build-material-v2-nova-factory.py` and
  `tools/bake-material-v2-nova-factory.py`.
- The asset is a connected Nova production structure: planted foundation,
  recessed production bay, supported gantry, control tower, roof plant,
  exhausts, reactor, sensor and established Nova crest. Complexity stays at
  mechanical intersections while the main wall/roof masses remain readable.
- The bake joins the evaluated hierarchy into one runtime stream with unique
  UV0 and 11 semantic regions: structure, machinery, trim, armor, edge steel,
  team primary, team secondary, energy, weapon, glass and faction badge.
- The same three-map contract is used at 1024 × 1024: Base+AO,
  NormalXY+Roughness+Emissive, and
  Metal+FactionPrimary+FactionSecondary+Wear. The existing cracked-carbon tile
  is reserved for damage state and is not an extra clean-material detail map.
- LOD0 is 11,564 triangles / 18,680 UV-split vertices. Authored LOD1 is 6,012
  triangles / 12,516 UV-split vertices, a 48% triangle reduction with identical
  bounds, material regions and sockets.
- Seven exact named sockets survive both exports: production exit, rally,
  roof utility, sensor, left/right defense and power. A bake-time Blender
  naming collision that initially added `.001` was removed and regression
  tested.
- Destruction uses structure-specific breach regions. The shader no longer
  applies the vehicle's broad heat-spread profile to every factory wall, and
  fire/smoke billboard sources are placed at roof/bay height for this asset.
- Solid neon roof parts were rejected during phone review. The reactor and
  sensor are now dark supported housings with only a narrow energy inspection
  band and a small directional lens; Factory-only glass/emissive strength was
  reduced so cyan reads as status information instead of glowing plastic.
- Both GLBs are deterministic across repeated offline bakes:
  LOD0 `4B5B550AA1961C4C92945138449EFE0F59B2347DCEA5FB24958B108ACCBA54D4`;
  LOD1 `22C0028AD1966F3327AD2D05EFBEA76C668B8BE2A782DCAE217D8362DF9CAC4C`.
- At 412 × 915 through Chrome/ANGLE SwiftShader, LOD0 measured 9.70 fps and
  LOD1 9.90 fps in the isolated showcase. These are software-renderer
  comparisons, not Android GPU claims. Both runs reported zero shader errors,
  zero V2 GL errors, zero context loss and preserved close/tactical/far
  silhouettes. The normal-game opt-out gate still reports no V2 allocation or
  payload request.

Evidence is captured under `.tmp/material-v2-factory-*`. This is an art and
architecture benchmark, not yet a production replacement for `mdlFac`. The
next safe authored slice is the Nova commander hero benchmark (Phase 6), still
behind opt-in loading. Do not bulk-convert the Blue roster or begin Red/Green
V2 assets until the Blue unit, structure and hero gates have all passed on a
real Android GPU.

## Production map-structure V2 tranche

The complete map-generated structure roster now has a reversible production
Material V2 path. This is separate from faction base structures and covers the
five objects actually emitted by `setupRelics()`: CityTower, CityDome,
CityHall, CityTank and CivicBlock.

- `models-world-data.js` retains the legacy tiled UV channel and now also
  carries the source rebuilds' authored UV0. The V2 loader requests authored
  UVs; LOW quality and failed loads retain the old InstMesh geometry/material.
- Three shared 1024 atlases use the established BaseAO, NRE and mask contract.
  Five padded 304-pixel interiors keep one texture set shared across every
  district instance rather than loading fifteen individual 2048 maps.
- The first four source rebuilds contained usable geometry/base colour but
  incomplete black packed channels. A second packing defect then erased RGB
  normals whenever emissive alpha was zero because Pillow resized packed RGBA
  as premultiplied colour. `build-world-structures-v2.py` now resizes channels
  independently and bakes a restrained fallback micro-normal/roughness/metal
  response from the authored surface plus the established V2 micro-detail
  tile. Valid source channels remain authoritative.
- Civilian grading is warm, weathered concrete/ceramic with sparse tower
  occupancy and authored CivicBlock windows. Military grading is colder,
  more metallic and soot-heavy with localized orange warning fixtures. No
  full-model faction tint or blanket neon treatment is applied.
- Powered facade art participates in the existing eight-source forward-light
  budget. Emissive remains visible when it is not promoted to a local light,
  preserving district scale without a light per window.
- Critical damage reuses `mf2-carbon-cracks-v1.png` from the tank/factory V2
  system through triplanar object-space mapping. Burned material carbonizes,
  roughness approaches matte, metal/specular response dies, and heat remains
  inside cracks under the existing billboard flame layer.
- Runtime texture units are 0/1/2/3 only. The post chain's reserved 4/5/6 are
  untouched, GL state is restored, and the production shader is rebound with
  `begin3D()` after the V2 stream.
- HIGH and CINEMATIC opt in automatically; LOW and `?worldv2=0` use legacy.
  Missing or partially decoded atlases cannot make a city disappear.

Phone verification command:

```text
node tools/test-world-structures-v2-mobile.mjs http://127.0.0.1:8982/
```

The 412 × 915 live render loaded all four shared inputs (three structure maps
plus the carbon damage tile), drew the structures through the real battlefield
path, and reported no page exception. Captures are:

- `releases/art-v2/world-structures-v2-civilian-mobile.png`
- `releases/art-v2/world-structures-v2-military-mobile.png`

ANGLE/SwiftShader reports GL `1282` from the existing post path on both the
legacy `?worldv2=0` baseline and V2. It is recorded by the test rather than
misreported as a new V2 regression. Real Android GPU validation remains the
next device gate. This tranche improves material separation and damage; it
does not pretend the relatively simple legacy CityHall/CityTank geometry has
 become a newly authored hero-grade structure.

## Phase 6 local implementation record — Nova commander hero lab

The next V2 slice is available as an explicit showcase query:
`?materiallab=1&materialquality=showcase&materialasset=commander`. It does not
alter the production commander lookup or allocate anything during an ordinary
launch.

- The benchmark is a connected Nova command-mech silhouette assembled from the
  bounded V2 primitives, with armor, structure, machinery, weapon, glass and
  energy semantic regions.
- It uses the same packed BaseAO / Normal-Roughness-Emissive /
  Metal-Faction-Wear contract, unique UV cells, object-space damage tile,
  debug channels, day/night control and close/tactical/far controls as the tank
  and factory labs.
- The showcase uses procedural V2 maps intentionally. No commander Blender
  payload is claimed or requested yet; this isolates hero framing, semantic
  material separation and damage behavior before authoring the final source
  scene and completing an export/import round trip.
- The current local mobile capture reports 1,532 triangles, 155 authored UV
  cells, zero V2 shader errors and zero context loss under SwiftShader. This is
  a software-renderer gate, not an Android GPU performance claim.

This remains a benchmark, not approval to migrate the production Nova commander
or any other faction hero. The next quality gate is an authored commander bake
and real Android GPU review of the tank, factory and commander together.

The V2 lab also now keys all opt-in GPU resources to `glEpoch`. A restored WebGL
context rebuilds the V2 program, VAOs, buffers and textures, rejects stale async
image callbacks, restores unpack/binding state after image uploads, and reports
its active epoch in `window.__mfMaterialV2`. Showcase damage is applied only to
the benchmark asset; its presentation plinth remains clean.
