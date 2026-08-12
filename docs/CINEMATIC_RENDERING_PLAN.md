# MASSFRONT cinematic rendering and visual-clarity plan

## Purpose

Make MASSFRONT readable at mobile RTS scale while giving important moments
(deployment, artillery, destruction, weather and combat) a cinematic impact.
This is an implementation plan for the existing WebGL2 renderer, not a proposal
to replace it with a desktop-only renderer.

## Audit conclusion

MASSFRONT already has a usable visual foundation:

- a directional sun plus sky/ground hemisphere lighting;
- normal, ORM and albedo material atlases;
- terrain, water, decals, a bloom pass, ambient-occlusion-style darkening and
  billboard effects;
- a compact forward renderer that can remain viable on phone GPUs.

The visual gap visible on the current command center and landing ship comes
from three connected problems.

1. **Lighting is global, not local.** Buildings, engines, weapon fire and
   lamps can glow, but their glow is normally a billboard/emissive effect. It
   does not cast a useful local light onto the hull, terrain, nearby units or
   deployed base. One sun and ambient term cannot establish a strong focal
   hierarchy at night or during combat.
2. **The material system is procedural, rather than asset-authored.** The
   material atlas is a good efficient base, but a command center, ship and
   turret need their own masks for panel scale, wear, windows, decals,
   emissive strips, cavities and dirt. Repeating procedural material alone
   makes different models feel like they are made from the same dark plastic.
3. **Hero-model value structure is too flat.** At the top-down mobile camera
   distance the player reads silhouette and large light/dark shapes before
   small detail. Several current hero assets have large dark regions with weak
   light-facing planes, so their geometry and material detail disappear into
   the terrain.

The current shader *does* react to the world sun and hemisphere light. The
problem is that its material values, metal response, faction tinting and
single-light limitation do not create enough separation. This is important:
the correct fix is a measured lighting/material pass, not simply making every
texture brighter.

## Visual direction

Use this hierarchy for every gameplay asset viewed at normal RTS height:

1. **Silhouette:** identify the class in under one second: HQ, refinery,
   anti-air tower, carrier, infantry, artillery or swarm.
2. **Large value shapes:** a clear hull/pad/roof split, with recesses and
   attachments visibly darker or lighter by design.
3. **Faction language:** a restrained faction color, architecture and
   material family—not a full-screen team-color tint.
4. **Functional signals:** lights, moving parts, heat, harvesting beam,
   build progress, ammo/energy behavior and damage state.
5. **Fine detail:** seams, scratches, decals and micro-normal detail only
   after the first four layers read correctly.

For the existing reference command center, the successful qualities are the
light concrete pad, readable roof panel pattern, cyan functional lighting,
separate dark modules, and a silhouette that remains clear against terrain.
The target is that same value clarity, not merely a higher polygon count.

## Rendering architecture recommendation

Keep the forward renderer. Do **not** add a full desktop-style deferred
G-buffer as the first solution. Mobile tile GPUs are sensitive to render-target
bandwidth and extra full-screen passes. Instead add a capped, screen/tile
culled local-light path to the existing model shader.

### Light classes

| Class | Used for | Mobile implementation |
| --- | --- | --- |
| Directional key | sun/moon | Existing directional light, retuned per biome/time-of-day. |
| Hemisphere fill | sky/ground bounce | Existing sky/ground terms, kept subtle so shadows remain readable. |
| Hero local light | HQ lamps, ship engines, reactor, artillery muzzle | Per-pixel point/spot lights, capped to the closest lights. |
| Gameplay light | construction, alerts, pickups, selected commander | Billboard plus terrain/light-probe approximation; only promotes to a real local light near camera. |
| Damage light | fire, explosion, beam impact | Brief local light with a short fade, never one light per particle. |

Quality budgets per frame:

| Tier | Local lights affecting a model | Post effects | Target |
| --- | ---: | --- | --- |
| Low | 0–2, only hero/event lights | emissive glow only | stable 30 FPS |
| Standard | 4 nearest lights | half-resolution bloom/AO | stable 30–45 FPS |
| High | 8 nearest lights | half-resolution bloom/AO, HDR where supported | 60 FPS target |

The CPU should cull lights by camera distance and screen influence before
uploading a small uniform array. A battle may contain hundreds of glowing
objects, but only the few that materially affect a visible model become true
lights. Every other glow stays a cheap billboard or emissive surface.

## Stage 0 — measure before changing art

Create a hidden visual-debug menu and a repeatable screenshot suite.

- Modes: albedo, normals, roughness, metallic, emissive, AO, direct light,
  local lights, fog and final composite.
- Counters: draw calls, visible triangles, particles, active local lights,
  CPU frame time and GPU timing where extension support permits it.
- Capture the same six scenes at 412 x 900: daylight base, night base,
  landing ship deployment, artillery impact, 50-unit skirmish and large
  battle/zoom-out.
- Add an image review gate. A clean console is not sufficient: inspect the
  screenshots for readability, material stretching, UI overlap and visual
  hierarchy.

Success criterion: a reviewer can identify team, unit class, selected unit and
the active combat focal point within one second in each capture.

## Stage 1 — correct the lighting and post-processing foundation

1. Audit color space end to end. Albedo/base-color textures are sampled as
   sRGB; normal, roughness, metallic, AO and masks remain linear. Never apply
   gamma conversion twice.
2. Move bloom thresholding to linear/HDR-like scene values when an RGBA16F
   color target is supported. Fall back to a carefully authored LDR luminance
   mask on devices that do not support it. Do not bloom everything bright.
3. Add a compact local-light uniform path to the model shader. Start with HQ
   windows/reactor, landing ship engines, artillery muzzle/impact and burning
   buildings. These are the events that most need depth and cinematic focus.
4. Tune a three-part day/night rig: directional key, colored sky fill and dark
   ground fill. Night should be darker than day, but local gameplay lights
   must restore orientation around bases and selected units.
5. Retain the existing AO/decal pass, but bias it toward contact grounding:
   feet, pads, walls, undercarriages and terrain intersections. Avoid broad
   grey screen darkening.
6. Add inexpensive distance haze and weather color grading per biome. Use it
   to make maps feel large, not to obscure unit silhouettes.

Success criterion: the command center has a bright, readable roof/pad and
visible cyan systems by day; at night its nearby terrain and geometry are
illuminated without making the entire map bright.

## Stage 2 — authored PBR and UV pipeline

Every new or rebuilt hero model must pass this pipeline before it enters the
game.

1. Model in functional parts: hull, painted armor, dark mechanical recess,
   glass, emissive light, rubber/cable, weapon barrel and decals are separate
   material groups.
2. Apply transforms and unwrap intentionally in Blender. Keep compatible
   texel density, hide seams on hard edges/undersides, prevent long thin UV
   islands, and inspect a checker texture before baking.
3. Bake at least AO, curvature/edge mask and normal information from the
   high-detail source. A low-poly mobile mesh does not need a high polygon
   count to look finished if its bake and value masks are good.
4. Build each asset from a material family plus masks:
   - shared tileable material gives efficient base response;
   - per-asset macro mask controls panel scale, edge wear, dirt and paint;
   - emissive mask controls windows, stripes and status lights;
   - decal mask carries faction marks and readable functional labels.
5. Pack non-color maps efficiently. Keep roughness/metal/AO/masks in linear
   data textures. Do not apply one material to every part of a turret or ship.
6. Add a mobile LOD set and test the silhouette at game camera height before
   approving details.

Material families:

| Faction | Dominant material language | Accent and damage treatment |
| --- | --- | --- |
| Nova / blue advanced faction | pale ceramic armor, carbon recesses, clean energy glass | cyan/white emissive channels, controlled heat discoloration |
| Legion / red human faction | painted kinetic armor, industrial steel, concrete | red/amber warnings, soot, impact chips and muzzle scorch |
| Syndicate Coalition | dark modular alloy, precise panels, optics | cool machine signal lights, clean geometric decals |
| Brood / infestation swarm | chitin, fibrous flesh, membranes, crystallized growth | internal bioluminescence, wet sheen, bruising/burn tissue—not metal panels |

The Brood requires its own organic foundation, construction animation and
surface shader language. A human concrete pad with a different tint is not a
faction conversion.

## Stage 3 — rebuild the first cinematic asset set

Do not attempt every unit at once. Establish the finished standard with six
assets that the player repeatedly sees:

1. Nova command center;
2. Nova deployer/landing ship;
3. Legion command center;
4. Syndicate command center;
5. Brood hive command structure and creep foundation;
6. one tier-one tower for each faction.

For each asset deliver:

- normal game-camera screenshot in day, night and damage state;
- wireframe/checker-UV screenshot;
- albedo/roughness/normal/emissive debug images;
- low, standard and high LOD triangle counts;
- faction-specific build card, name, icon and 3D preview.

Only then convert factories, resource buildings, vehicles and higher tier
towers. This prevents a large number of uniformly dark, generic models from
replacing a smaller number of good readable ones.

## Stage 4 — make combat cinematic but RTS-readable

Each major event gets a small visual recipe rather than indiscriminate
particles.

### Landing/deployment

- approach light, downward dust and ground contact shadow;
- engine local lights and a short camera-safe bass/rumble moment;
- believable opening/locking elements, landing pad rings and construction
  light sweep;
- deployer returns to a readable base form rather than abruptly vanishing.

### Artillery

- clear muzzle flash, recoil and a brief barrel local light;
- a curved ballistic arc that leaves the camera frame then re-enters near
  impact, with a controlled smoke ribbon and a diminishing flight sound;
- impact flash, expanding dust, debris/sparks appropriate to target material,
  ground scorch and a short-lived impact light;
- impact timing drives screen shake and low-frequency audio, not a continuous
  loud noise.

### Damage and destruction

- three damage states: clean, damaged, critical;
- critical state uses smoke, sparking, intermittent lamps and localized fire;
- destruction uses material-specific debris: metal/paint, concrete, crystal
  or organic tissue. It leaves a decal or wreck, not an instant generic puff.

### Fog and weather

- keep enemy silhouettes hidden until spotted;
- weather alters light/fog and produces selective particles, while retaining
  contrast around selected units and objectives;
- storms may reduce vision, but should not reduce input or command readability.

## Stage 5 — terrain and map composition

- Use a macro terrain map before adding more micro noise: dominant ground
  value, erosion routes, resource-corruption region, wet/ash/sand zones and
  readable traversal borders.
- Resource nodes need tall silhouette, emissive/crystal contrast and a small
  ground corruption radius so they are findable without labels.
- Use terrain decals for foundations, tire tracks, scorch, creep, crater rims
  and collapsed structures. Fade/age them by importance to keep the scene
  clean.
- Keep play boundaries clear with environment: water, ravine, storm wall or a
  red holographic grid before non-playable backdrop terrain. The boundary must
  be visible before a unit reaches it.

## Stage 6 — faction-aware UI and previews

Visual clarity does not end at the 3D world.

- Resolve every build card, inspect panel, unit preview and structure preview
  through the selected/inspected faction kit. Enemy inspection must not fall
  back to the player/Nova visual set.
- Replace generic small sprites with cached faction-specific 3D thumbnails or
  faction illustration cards for major units/buildings.
- Give each faction a restrained UI frame/palette/crest and commander portrait
  treatment. Maintain consistent button locations and touch targets across
  factions.
- Use visual symbols for armor, damage type, strong-against, weak-against,
  role, power and construction tier. Put optional text in a light inspection
  pane rather than making the command HUD a text wall.
- Keep notifications and speech in one reserved message region; it must not
  stack on the command panel, minimap or build menu.

## Stage 7 — mobile performance discipline

- Use feature tiers and dynamic scale based on frame time, not only device
  model. Preserve UI resolution while lowering 3D resolution when required.
- Prefer instancing/batching for repeated units, billboards and vegetation.
- Keep overdraw down: use particle caps, depth-aware smoke, half-resolution
  bloom/AO and an emission budget during large battles.
- Compress textures and mesh attributes for shipping builds. Color textures
  may use sRGB compression; data textures must remain linear. Make texture
  format selection platform-aware.
- Reuse framebuffers and texture storage. On tile GPUs, discard attachments
  that will not be read after a pass and avoid needless full-screen
  read/write chains.

Performance acceptance targets:

| Scenario | Low | Standard | High |
| --- | ---: | ---: | ---: |
| Base / 60 units | 30 FPS | 45 FPS | 60 FPS |
| 250-unit battle | 30 FPS | 30 FPS | 45 FPS |
| Landing/artillery cinematic event | no input hitch | no input hitch | no input hitch |

## Recommended execution order

1. **Week 1:** debug views, screenshot suite, color-space audit, command
   center/landing ship value pass, local lights for those two assets.
2. **Week 2:** HDR/LDR bloom fallback, night lighting, authored masks/UV
   checks, resource-node readability and terrain macro pass.
3. **Weeks 3–4:** six-asset hero set, faction UI/preview resolver, damage and
   destruction recipes.
4. **Weeks 5–6:** faction factories/vehicles/towers, weather/fog polish,
   device quality tiers and performance capture pass.

## External technical evidence

- [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
  recommends immutable texture allocation, sensible texture handling and
  avoiding unnecessary framebuffer work—relevant to the renderer’s mobile
  post-processing budget.
- [Android’s texture optimization guidance](https://developer.android.com/games/optimize/textures?hl=en)
  covers texture compression and the key color-space distinction: diffuse
  color data is sRGB, while normal/roughness/metallic-style data is linear.
- [Apple’s tile-based GPU guidance](https://developer.apple.com/documentation/metal/tailor-your-apps-for-apple-gpus-and-tile-based-deferred-rendering?changes=la__1&language=objc)
  explains why render-target bandwidth matters on phone GPUs. The forward-plus
  recommendation above is an inference for WebGL2: it avoids a costly
  full-screen G-buffer while still adding local cinematic lights.
- [Android’s vertex-data guidance](https://developer.android.com/games/optimize/vertex-data-management?hl=en)
  supports compact vertex attributes and data layouts for mobile memory and
  bandwidth pressure.
- [Android rendering performance guidance](https://developer.android.com/topic/performance/vitals/render)
  describes the frame-time/jank constraints behind the 60 FPS (about 16 ms)
  target and the need for a robust lower tier.

