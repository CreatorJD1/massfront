# MASSFRONT faction art conversion

Updated: 2026-08-28

The reference target is Supreme Commander-scale role readability plus the
surface hierarchy and battlefield atmosphere associated with Command & Conquer
3-era military science fiction. It is a quality target, not a request to copy
another game's protected models, textures, logos, or faction designs.

## Conversion order

1. Blue — Nova Federation / Frontline Command
2. Red — Crimson Dominion
3. Green — Syndicate Coalition
4. Brood — AI-only organic pass after the three playable armies are stable

## Completed production-unit foundation

All 26 currently buildable roles for Blue, Red, and Green now resolve through
their faction kit. Intentional role variants share GPU mesh resources; faction
identity is authored through geometry plus semantic materials, not a whole-body
color multiply.

### Blue: maintained combined-arms technology

- welded composite armor with broad quiet panels
- carbon structural recesses without checker/moire noise
- machined servo and weapon hardware
- routed cyan energy circuits with physical dark housings
- restrained livery landmarks
- dedicated sonic Resonator geometry

### Red: replaceable industrial siege hardware

- pitted cast iron primary armor
- riveted applique with sparse chips and worn seam shoulders
- non-emissive heat-cycled mechanism steel
- emissive thermite channels restricted to actual heat hardware
- blunt prows, exposed stacks, narrow vision slits, heavy weapon mass

### Green: autonomous field technology

- smooth nano-ceramic shells with faint large service grids
- brushed gold field frames and accelerator hardware
- dark polarized holographic housings
- cyan conductors with emissive cores inside physical casings
- hover plenums, suspended cores, triangular pylons, open energy throats

## Remaining gates, in order

### A. Phone visual acceptance

Capture each faction at 412 x 915 in bright, neutral, and dark terrain at
typical, close, and strategic zoom. Reject materials that shimmer, turn into
noise, flatten under world light, or hide the role silhouette.

### B. Structure conversion

Convert command center, power, economy, production, defense, research, naval,
and experimental structures in the same Blue → Red → Green order. Preserve
foundation contact and separate roof, window, mechanism, armor, and emissive
materials.

### C. Hero and deployment assets

Convert the three commanders and faction deployment craft. These receive the
highest geometry/material LOD while battle copies retain production-safe LODs.

Commander art is the deliberate exception to the surrounding PBR material
language. Every human, cyborg, robot, or mech commander must use the
`commander-anime-flat-v1` profile in portraits and in its commander-only battle
rendering path:

- one solid fill per semantic region; no cel bands, gradients, baked shadows,
  ambient occlusion, specular highlights, skin pores, or material microtexture;
- continuous crisp outer contours 2–6 pixels wide at portrait master size and
  internal lines 1–3 pixels wide, still readable at 48, 96, and 192 pixels;
- at most 24 declared solid colors per portrait master, except edge
  antialiasing;
- robotic commander battle meshes use an unlit commander-only pass with no
  normal-dependent sun/local light, GGX, AO, roughness, metal, or rim shading,
  plus a stable 1–2 CSS-pixel silhouette outline;
- faction emissive accents, selection outlines, whole-object fog modulation,
  and damage decals remain allowed when they do not create surface shading.

Acceptance covers all nine base commander identities, the three registered
exploration commander portraits, and all three shared robotic battle chassis at
412 x 915 and 1920 x 1080, on bright and dark terrain at close, normal, and
strategic zoom. A commander asset cannot be approved without the style tag,
palette declaration, dimensions, provenance, and matching visual evidence.

### D. Weapons and damage

Bind projectile, beam, muzzle, impact, shield, scorch, cracked-hot, burning,
and destroyed states to faction weapon families. Destroyed metal loses its
clean specular response; fire remains billboard/sprite volume, not solid blobs.

### E. Scale validation

Compare legacy and converted rendering with roughly 100 and 200 units plus a
base, terrain, effects, UI, selection, and shadows. Record frame time, draw
calls, program changes, and visible material-LOD transitions before converting
the rest of the library.

## Automated gates

- `node tools/test-nova-conversion-stage1.mjs`
- `node tools/test-legion-conversion-stage2.mjs`
- `node tools/test-syndicate-conversion-stage3.mjs`
- `node tools/build-faction-production-matrix.mjs`
- `node tools/bundle.mjs`

Passing these gates proves routing, geometry validity, semantic material use,
production triangle ceilings, livery masks, and shared-resource behavior. It
does not replace phone screenshot review or real-device performance profiling.
