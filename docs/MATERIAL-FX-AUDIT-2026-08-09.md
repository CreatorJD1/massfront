# MASSFRONT material and combat-FX audit

Updated: 2026-08-09  
Target: web/PWA and Google Android  
Reference standard: the supplied blue/yellow heavy vehicle and commander art

## Verdict

MASSFRONT has a credible mobile rendering foundation, but its current unit art
cannot reach the supplied reference standard through shader tuning alone. The
main renderer already has normal/ORM materials, directional and hemispheric
lighting, eight selected local lights, SSAO, bloom, FXAA, decals and a broad
combat-effects vocabulary. The remaining quality gap is dominated by asset
authorship:

- most combat units are assembled from procedural primitives;
- one repeating material atlas supplies almost every surface;
- automatic planar UVs provide consistent scale but no unique asset layout;
- there is no per-vehicle baked AO, curvature, wear, livery or decal mask;
- close views expose overlapping/disconnected assemblies that are acceptable
  only at strategic camera distance;
- smoke, glow and impact rings are reusable billboards, so distinct weapons
  still converge on the same visual language during a large battle.

The correct strategy is a **hybrid hero pipeline**. Keep procedural/instanced
models for mass armies and distant LODs, but give commanders, deployers, HQs,
large naval units, super units and a small faction-defining roster authored
Blender models with unique UVs and baked masks.

## What the target art is doing

The reference does not look detailed merely because it has more polygons. It
uses a deliberate hierarchy:

1. A strong class silhouette readable before any texture detail.
2. Large, connected armor masses with believable structural load paths.
3. Deep dark recesses separating armor from machinery.
4. Bevels on every important exposed edge, producing reliable highlights.
5. Several material families: painted armor, bare/dark metal, mechanisms,
   rubber/treads, emissive lamps and glass/optics.
6. Crisp yellow livery blocks placed on important armor, not a global tint.
7. Unique markings, serials and panel graphics.
8. Edge wear concentrated on exposed corners, with dirt in cavities and lower
   surfaces. The noise is directional and functional rather than uniform.
9. Strong daylight, contact shadow and self-shadow preserve value separation.

MASSFRONT's current Nova deployer has the broad silhouette but not this
hierarchy: most surfaces share similar blue-grey values, the cockpit reads as
a colored cap rather than layered glass, attachments appear placed on the hull
instead of engineered into it, and the ground/fog palette reduces separation.

## Current material system

### Strengths

- A semantic role table separates hull, glass, faction, emissive, organic,
  ground and damage jobs from numeric material IDs.
- Albedo uses an sRGB upload; normal and ORM stay linear.
- ORM carries AO, gloss, emissive and metalness in one texture fetch.
- World-space tiling and gradient-aware sampling avoid the worst stretching and
  mip seams on procedural geometry.
- The shader has faction-restrained tinting, gloss/metal response, rim light,
  Brood transmission, eight local lights and seven visual-debug modes.
- Mobile resamples the 2816 atlas to 1408, retaining roughly 128 px per tile
  while holding the three-map material set near 32 MB.
- The repository already contains Blender/GLB conversion tools, so adopting
  authored assets does not require changing engines.

### Quality ceilings and risks

1. **The shared atlas is a material library, not a finished asset texture.**
   It provides generic plates and scratches but cannot put a warning stripe,
   access hatch, soot trail or serial number in a model-specific location.
2. **Procedural planar UVs cannot deliver hero bakes.** Equal texel density is
   useful, but baked AO and curvature need a stable unique unwrap.
3. **The atlas itself is broad and soft.** Many tiles have low-frequency grey
   noise or simple lines. They lack the sharp micro/mid-frequency breakup seen
   in the supplied armor, so normal mapping cannot invent the missing forms.
4. **Vertex-color faction tint is too coarse for livery.** It is effective for
   army identification, but it cannot replace authored paint blocks and decals.
5. **No image-based lighting/reflection probe exists.** Metal currently relies
   on sun, ambient and a half-vector highlight. It can react to the world, but
   large metal faces lack reflected-environment structure.
6. **Only eight local lights affect geometry.** That is a sensible mobile cap,
   but dense combat promotes many visible glows that do not illuminate nearby
   hulls or ground, creating a pasted-on look.
7. **Grounding quality is adaptive.** SSAO can disable below 0.5 performance
   scale. Dense battles therefore lose contact depth when the scene is already
   visually difficult.
8. **Color-space documentation and code are out of sync.** The bloom comments
   still describe an output-gamma conversion no longer present in the model
   fragment path. This should be measured with a grey-card/debug capture before
   another brightness pass; guessing here can reintroduce crushed or clipped
   materials.

## Target asset pipeline

### Asset tiers

| Tier | Examples | Recommended art path |
| --- | --- | --- |
| Hero | commanders, deployers, HQs, super weapons, tier-three capitals | authored Blender model, unique UV0, baked AO/normal/curvature, 1024 map set, 3 LODs |
| Signature | faction-defining tanks, artillery, towers, factories | authored or heavily refined mesh, trim sheet plus 512 unique macro/decal mask, 3 LODs |
| Mass | infantry, scouts, swarm bodies, common drones | efficient procedural/shared-trim model, strong silhouette and material IDs, 2 LODs |
| Distant | strategic zoom and very large battles | simplified mesh/impostor; preserve faction color, turret direction and weapon event only |

The player can field 1,000 units per faction, so the target cannot mean a
1,024-texture hero asset for every body. It should mean reference-level hero
quality where the camera can inspect it, with disciplined LOD substitution at
normal command zoom.

### Blender authoring rules

1. Block the vehicle as one engineered assembly. Attachments need mounting
   brackets, pivots, conduits or recesses; never leave decorative parts floating.
2. Use weighted normals and small bevels on important silhouette/panel edges.
   Bake micro-bevels and rivets instead of modelling every fastener.
3. Separate functional material IDs: armor, recessed metal, mechanisms,
   rubber/tread, glass, emissive, weapon bore and faction livery.
4. Apply transforms, mark hard edges and create a non-overlapping UV0 for
   unique bakes. Add a second trim/detail coordinate only if the importer gains
   explicit support; do not overload the existing UV silently.
5. Bake high-to-low normal, object AO and curvature. Pack a per-asset macro map
   for AO/wear/dirt/livery selection; keep roughness/metal values linear.
6. Author wear from function: exposed edges chip, moving joints polish, exhausts
   soot backward, track zones collect dirt, and recessed panels stay darker.
7. Supply LOD0/LOD1/LOD2 and collision/selection bounds. LOD transition must be
   based on screen size, not world distance alone under the orthographic camera.
8. Validate with a checker texture, material debug captures, day/night damage
   shots and a 100-unit performance scene before promotion.

### First vertical slice

Do not convert the whole roster at once. Establish the quality bar with:

1. Nova commander;
2. Nova command deployer/HQ transformation;
3. one Nova heavy tank matching the supplied blue/yellow material standard;
4. one Legion artillery vehicle;
5. one Syndicate energy unit;
6. one Brood organic heavy unit.

That slice exercises hard surface, articulation, glass, faction livery,
energy, artillery and organic rendering before a mass conversion begins.

## Combat-effects audit

### What is already implemented well

- Launch and impact signatures are separated, so a weapon can communicate
  before damage resolves.
- Gauss, sonic, ion/plasma, fire, rockets, missiles, flak, cluster shells,
  artillery and Brood payloads have distinct code paths.
- Important projectiles survive strategic-zoom sampling and performance cuts.
- Artillery owns a true curved flight height and persistent 3D smoke samples.
- The renderer replaced soft debris billboards with hard shards after white
  rectangular impact artifacts were observed.
- Damaged units/buildings can retain attached fire, smoke, sparks and local
  lights, and explosions can deform terrain and leave craters.

### Remaining visual problems

1. **Shared glow/ring vocabulary.** Many families reduce to a colored core,
   a broad corona and one or two rings. Color changes, but the material motion
   and impact behavior are not distinctive enough.
2. **Billboards are depth-tested but not soft-intersection particles.** Smoke
   can clip into terrain and hulls because it does not fade against scene depth.
3. **LDR additive composition clips easily.** Strong particles are stacked in
   an RGBA8 scene and bloom is display-thresholded, which encourages hot white
   centers and loses faction color during large impacts.
4. **FX do not react to target material.** A shell hitting concrete, armor,
   glass, water, crystal or flesh should emit different fragments, dust, steam,
   sparks, fluids and persistent decals.
5. **Performance fallback removes context before punctuation.** Core impacts
   survive, but reduced smoke, AO, local lighting and trails can make battles
   look like disconnected flashes.
6. **No authored FX event asset.** Launch/travel/impact/decal/light/audio/shake
   logic is spread across simulation and rendering branches, making consistent
   art direction difficult.

## Recommended faction/weapon effect language

| Family | Launch / travel | Impact / persistence |
| --- | --- | --- |
| Nova energy | tight cyan-white aperture, clean charge arcs, controlled beam core | ion splash, geometric lensing ring, blue-white local light, brief conductor crawl |
| Legion kinetic | hot orange muzzle, recoil, smoke pressure cone, visible casing/solid shell | metal sparks or material dust, fragmentation cone, soot/scorch and heavier camera impulse |
| Syndicate phase | violet/green segmented pulses, distortion or discontinuous trail | implosion then outward phase fragments, precise hex/radial mark, little ordinary smoke |
| Brood | wet sac contraction, bile/spore glob, irregular living trail | fluid/chitin spray, corrosive vapor, organic stain and lingering tissue burn |
| Artillery | recoil, pressure dust, large dark shell, turbulent arcing smoke | white pressure flash, earth/material debris, broad dust wall, crater, short hot fire and bass-driven shake |

Create one data-driven effect recipe per weapon family containing launch,
travel, impact, material-response, persistent decal, promoted local light,
camera shake and audio cue. Rendering can then scale each layer independently
without deleting the event's identity.

## Mobile rendering changes in priority order

### P0: diagnose and stabilize

- Capture albedo, normals, gloss, metal, emissive, direct and local-light debug
  views for the six vertical-slice assets.
- Add an 18% grey card and chrome/rough-metal spheres to a hidden lighting lab.
- Resolve the output-transfer/bloom documentation mismatch with measured pixel
  values; keep one explicit linear-to-display conversion point.
- Record local-light selection, particle counts, projectile counts, draw calls,
  visible triangles, CPU frame time and context-loss events in the same scene.

### P1: make one asset reach the standard

- Import the Nova heavy-tank LOD0 through the existing Blender pipeline.
- Extend the imported asset payload with a small unique macro/decal texture and
  stable unique UV, while retaining the shared atlas for tileable micro detail.
- Add glass Fresnel/reflection treatment and a restrained environment probe.
- Preserve baked/self AO even when screen-space AO is disabled.
- Add selective real shadowing for the commander/deployer/hero unit near the
  camera; keep projected contact shadows for mass units.

### P2: rebuild FX around event recipes

- Add target-material response categories.
- Add soft-particle terrain/depth fade for smoke and fire where supported.
- Keep one promoted geometry light per important event, not one per particle.
- Move bloom to a linear floating-point target when supported, with a measured
  LDR fallback.
- Retain faction color in the core/outer layers instead of clipping all intense
  effects toward white.

### P3: scale without losing quality

- Select LOD and FX detail from projected screen size and event importance.
- Reserve full hero shading for selected, nearby and cinematic units.
- Batch distant weapon fire into faction-readable event impostors.
- Keep contact AO/shadow information through lower performance tiers even if
  sample counts or resolution fall.

## Approval gates

The vertical slice is accepted only when all of these pass on a real Android
device and the web build:

- no stretched checker squares on any exposed hero face;
- no disconnected/floating parts at any deploy animation frame;
- armor, recess, mechanism, glass, emissive and livery remain distinguishable
  at normal game zoom;
- faction and unit class are identifiable in under one second;
- day, night, fog and damage states preserve silhouette and functional lights;
- projectile launch, travel and impact identify the weapon without relying on
  color alone;
- concrete, metal, water, crystal and organic impacts do not share debris;
- 100-unit combat holds the chosen frame target without disappearing FX;
- the 1,000-unit stress test degrades by LOD/secondary detail, not by removing
  essential fire/impact feedback or breaking the graphics context.

## Relevant implementation files

- `src/engine/materials.js` — atlas roles, authored-map loading and mobile size
- `src/engine/mesh.js` — model shader, local lights, SSAO, bloom and composite
- `src/engine/billboard.js` — smoke/fire/glow batching
- `src/ui/render3d.js` — projectile, beam, particle and damage presentation
- `src/game/sim.js` — fire/impact events, particles, craters and damage state
- `src/engine/models-units-*.js` — current procedural faction rosters
- `tools/blender_export.py`, `tools/blender_import.mjs`, `tools/glb_import.mjs`
  — existing authored-mesh path
