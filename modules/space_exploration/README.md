# MASSFRONT Cinematic Exploration & UGA Command Test Room

This folder is an isolated ES-module experiment for MASSFRONT's strategic
exploration layer. It does not import, launch, migrate, or write to the
production RTS, native packages, cloud saves, or OTA channel.

The default scene is non-combat capital-ship exploration. Selecting the UGA
civilization ark opens its Blender-authored command cutaway, where each real
district can be selected to focus the 3D camera and expose construction,
modules, research, resident factions, contracts, personnel, and local mission
simulation. Classic Modes is a Command Core terminal and never opens the
production game.

## Player-facing contract

- No space weapons, shields, dogfighting, or hostile flight encounters.
- Course plotting and capital-ship autopilot are primary; the helm remains a
  deliberately slow cinematic inspection control.
- UGA is the civilization authority and sponsor, not a selectable ground army.
- Nova, Dominion, and Syndicate become permanent resident proxy factions.
- Brood is hostile only. UGA Brood operations require a live infestation and
  confirmed hive targets; any ready resident faction can deploy as proxy.
- Construction exists only inside the UGA ark. There is no planetary city
  builder in this experiment.
- Every directed probe resolves one authored, persistent discovery. Sites do
  not regenerate for resource farming.
- Unfinished foreground art must remain unavailable rather than being replaced
  with an on-screen primitive or generic background.

## Showcase flow

1. **Aelos** — UGA anchorage, traffic census, phase-corridor research, faction
   embassies, recruitment, and resident contracts.
2. **Veyra** — black-hole frontier, photon-ring science, derelicts, ancient
   evidence, scarce resources, and the hidden route to Karak.
3. **Karak** — missing traffic and transmissions reveal an active Brood
   infestation, hive intelligence, and a UGA-sponsored purge package.

The intended vertical slice is:

```text
explore -> survey -> discover -> develop ark -> recruit resident faction
        -> unlock mission -> prepare proxy team -> simulate result -> persist
```

## Run locally

Port 8901 belongs to another workflow. Serve this module on 8991 from this
directory:

```powershell
python -m http.server 8991 --bind 127.0.0.1 --directory .
```

Then open <http://127.0.0.1:8991/>. Direct `file:///` loading is unsupported
because the experience uses ES modules and local GLB requests.

There is no app build step. The player runtime is pinned locally in
`lib/three.min.js` and `lib/GLTFLoader.js`; it makes no CDN request.

## Verification

Domain and contract tests:

```powershell
node tests/domain.test.mjs
```

Syntax gates for the entry path:

```powershell
node --check src/space_experience.js
node --check src/space_module.js
node --check src/core/three_space_engine.js
node --check src/core/uga_command_scene.js
node --check src/galaxy/galaxy_map_engine.js
node --check src/ui/uga_command.js
```

Hardware-GPU capture flow, using the repository's single approved Chrome/CDP
launcher and rejecting SwiftShader:

```powershell
node tools/verify-test-room.mjs
node tools/stress-test-room.mjs
```

Captures are written to `tmp/browser-captures/`. The script checks the single
canvas/single lifecycle, authored asset readiness, WebGL context state, and
landscape/portrait views of Exploration, Galaxy, Survey, UGA overview, and a
focused district. A clean console is not treated as visual proof.

The stress script warms every scene, runs 50 Galaxy/Survey/Interior cycles and
20 rendered system-body transitions, verifies renderer geometry/texture counts
return to baseline, checks pause/resume, rejects duplicate canvases, and fails
on any lost WebGL context.

## Runtime lifecycle

`src/space_module.js` is only the standalone bootstrap. The reusable API lives
in `src/space_experience.js`:

```js
const experience = createSpaceExperience(container, {
  host: LocalSandboxHost,
  seed
});

await experience.ready;
experience.pause();
experience.resume();
experience.dispose();
```

One owner coordinates System, Survey, Galaxy, UGA Command, and local Results.
`ThreeSpaceEngine` owns the sole WebGL renderer and canvas; the galaxy and UGA
scenes render through it. The exterior and current system material package load
at startup; the 18.8 MB command cutaway is deferred until the player enters UGA
management. System swaps hold the transition veil until authored planet maps
decode. The lifecycle removes listeners, resize observers, timers, animations,
scene resources, and the context on final disposal.

The host seam supports `loadSnapshot()`, `saveSnapshot(state)`,
`launchGroundOperation(operation)`, and `subscribeResult(listener)`. The local
adapter is deterministic and has no production-game side effects.

## Persistent domain

`src/domain/` owns a versioned, validated local state containing:

- route and active scene;
- Credits, Alloys, Components, Bio Samples, Research Points, Fuel, and Probes;
- fixed Command Core plus eight buildable districts, tier progress, and three
  internal sockets per district;
- survey completion, discoveries, intelligence, and site depletion;
- UGA, Universal, and Faction research allocations;
- permanent faction residency and reputation;
- commanders, specialists, experience, loyalty, readiness, and injuries;
- mission/world progression, one pending operation, and applied result IDs;
- Classic Mode simulations isolated from exploration progression.

Operation and result IDs are deterministic and idempotent. An unresolved
operation survives reload. Results update exploration state once, never cause
permanent personnel death, and return along the exact route in the operation
envelope.

## UGA command districts

Blender and runtime use these IDs as a stable contract:

```text
command
survey
research
fabricator
engineering
habitat
factions
hangar
logistics
```

The fixed Command Core and eight buildable districts are exported as
`DISTRICT_*` scene nodes. Matching `FOCUS_*` nodes carry camera distance and
height metadata. Selecting either the 3D structure or its district rail moves
the real perspective camera to that authored focus point; the adjacent panel
shows level, costs, capabilities, construction, and module sockets.

## Authored asset pipeline

Runtime showcase assets:

```text
assets/models/uga-civilization-ark.glb
assets/models/uga-command-cutaway.glb
assets/models/massfront-showcase-contacts.glb
assets/textures/uga/source/uga-hull-material-source.png
assets/textures/uga/source/uga-interior-material-source.png
assets/textures/uga/uga-*-basecolor.png
assets/textures/uga/uga-*-normal.png
assets/textures/uga/uga-*-roughness.png
assets/textures/uga/uga-*-metallic.png
assets/textures/uga/uga-*-ao.png
assets/textures/uga/uga-*-emissive.png
assets/textures/uga/uga-*-height.png
assets/textures/planets/source/*-surface-source.png
assets/textures/planets/*-basecolor.png
assets/textures/planets/*-normal.png
assets/textures/planets/*-orm.png
assets/textures/planets/*-height.png
assets/textures/planets/*-emissive.png
assets/textures/planets/*-clouds.png
assets/textures/personnel/commander-*.png
assets/textures/personnel/specialist-*.png
```

The two material sources were generated specifically for this experiment, then
aligned maps were derived with `tools/build_pbr_maps.py`. Maps are not generated
independently, so panel features remain pixel-aligned between channels. The
exact generation prompts and constraints are recorded in
`docs/ASSET_PROVENANCE.md`.

The six hero-planet color sources are original 2:1 equirectangular image
generations. `tools/build_planet_pbr_maps.py` retains those full-resolution
sources and builds streamed 1024 × 512 system-view LODs with aligned normal,
height, ORM, emissive, and weather channels. The runtime binds ORM as red AO,
green roughness, and blue metallic, displaces the high-density terrain shell,
and keeps the complete planet group hidden if any required channel fails.
Exact prompts are retained in `docs/PLANET_TEXTURE_PROMPTS.md`.

All nine Aelos/Veyra/Karak foreground contacts share one 16.6 MB Blender GLB.
Each exact catalog root contains authored `LOD0`, `LOD1`, and `LOD2` children,
plus stable focus and interaction anchors. Runtime selection is by exact ID and
projected screen diameter; there is no default fuel-depot, station, derelict,
or relay primitive. The three tiers total 67,022 / 27,966 / 7,866 triangles and
embed the aligned UGA hull/interior PBR packages. Rebuild and audit them with:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/build_showcase_contact_pack.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/audit_showcase_contact_pack.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/render_showcase_contact_preview.py
```

Blender 5.2 build and deterministic preview:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/build_uga_assets.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/render_uga_previews.py
```

`build_uga_assets.py` constructs visible geometry from authored profiles,
lofts, footprints, lathes, and `from_pydata`; it does not create showcase
geometry through Blender mesh-primitive operators. It writes editable `.blend`
sources under `assets/source/blender/` and optimized GLBs under
`assets/models/`.

The exporter uses standards-bound base color, emissive, normal, metallic,
roughness, and ambient occlusion. Height is packed into the normal texture's
alpha channel while its RGB remains a valid tangent-space glTF normal; Blender
combines that channel through a subtle bump node for the authored previews.
Current budgets are 34,512 triangles/76 meshes for the exterior and 107,688
triangles/442 meshes and primitives for the cutaway. The final cutaway is
18,795,892 bytes with SHA-256
`17560ab7f6236e3c7fb2d4f1db59bd472a93ab0e641dace1f9027ae19ad154c8`;
it is streamed only for UGA management and its draw calls remain part of the
hardware performance gate.

The resident-faction roster uses 15 original image-generated commander and
specialist portraits. Exact prompts and paths are retained in
`docs/PERSONNEL_PORTRAIT_PROMPTS.md`. The UI validates every local file before
offering that person and never falls back to a crest, initials, or generic
silhouette.

## Important source map

```text
index.html                         test-room shell and SVG icon set
src/space_experience.js            lifecycle and gameplay integration
src/domain/                        catalogs, store, progression, operations
src/core/three_space_engine.js     exploration renderer and system streaming
src/core/seeded_random.js          repeatable visual density and QA captures
src/core/uga_command_scene.js      cutaway camera, picking, district animation
src/planet/authored_planet.js      streamed hero-planet PBR ownership
src/celestial/showcase_contact_assets.js exact-ID GLB/LOD ownership
src/ship/uga_blender_assets.js     GLB loading, ownership, caching, disposal
src/galaxy/galaxy_map_engine.js    shared-renderer star chart
src/systems/showcase_systems.js    Aelos/Veyra/Karak rendered catalog
src/ui/uga_command.js              transparent command UI and interactions
src/ui/uga_command.css             original MASSFRONT command presentation
tests/domain.test.mjs              deterministic vertical-slice tests
tools/verify-test-room.mjs         hardware-GPU visual verification
tools/stress-test-room.mjs         50-cycle/20-transition lifecycle gate
tools/build_planet_pbr_maps.py     aligned planet system-view texture LODs
tools/blender/build_showcase_contact_pack.py authored 3-system contacts
tools/verify-galaxy-map.mjs        shared-renderer Star Chart GPU gate
tools/verify-uga-focus.mjs         nine-district camera/art GPU gate
```

Legacy experiments under `_archive/`, old survey/renderers, combat modules, and
the procedural dreadnought are not imported by the live lifecycle. They remain
source references only and must not be mistaken for the showcase path.
