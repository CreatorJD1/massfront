# MASSFRONT — engineering handoff

Everything a new agent or developer needs to continue this project. `AGENTS.md`
at the repo root is the short version; this is the reasoning behind it, the
current state, and the open work.

---

## 1. What this is

A Supreme-Commander-style real-time strategy game for phones. Orthographic
top-down, thousands of units, procedurally generated terrain, four factions.

It is **not** built on an engine. The renderer is hand-written WebGL2: instanced
meshes, a material atlas, SSAO, FXAA, emissive bloom, ground-shadow decals, and
a linear-space lighting pipeline. There is no Three.js, no Babylon, no React. If
you are about to reach for a framework, don't — the whole thing is ~20,000 lines
of plain JavaScript and its coherence is the reason it runs on a phone.

**Platforms:** Android + iOS via Capacitor, and the same `www/` runs as a web
build. **Backend:** Cloudflare Workers + D1 + R2, all deployed and live.

---

## 2. Architecture

### Load model

34 classic `<script>` files, concatenated into one global scope. `boot.js` holds
the runtime `MANIFEST`; `assets/data/manifest.json` holds the same list as
`order` for the bundler and the OTA packer. **Both must be updated when adding a
file, and order matters.**

There is no module system. This was not an oversight — it means no build step is
required to run the game (open `index.html`), and the OTA updater can ship a
patch as a list of source files with no bundler on the device.

### Layout

```
boot.js                 loader: packaged files, or a patched bundle from IndexedDB
index.html              all UI markup; overlays are hidden divs toggled by JS
src/engine/             gl.js mesh.js billboard.js materials.js terrain.js models.js
src/game/               sim.js economy.js commander.js meta.js ai.js
src/ui/                 input.js hud.js render3d.js
src/*.js                feature modules (see below)
assets/data/            unitsheet.js (baked sprite/stat sheet), itemart.js (inlined art)
assets/audio/           33 effects + 15 music tracks, dual-format
cloudflare/             three workers: update, auth, economy
tools/                  build, asset pipelines, design-database extraction
docs/                   this file and per-subsystem notes
```

**The engine layer** (`src/engine/`) owns GL state, geometry and terrain.
**The game layer** (`src/game/`) owns simulation, economy, AI and progression.
**The UI layer** (`src/ui/`) owns input, HUD and the 3D scene composition.
**Feature modules** (`src/*.js`) are self-contained additions that hook in by
taking over a global rather than editing the layers below them.

### The takeover pattern

Feature modules extend the game by reassigning a global function at init:

| Module | Takes over | Falls back to |
|---|---|---|
| `audio.js` | `sfx()`, `musicTickFrame()` | the original oscillator synthesiser |
| `restree3d.js` | `renderDevelop()` | the flat research list |
| `offline.js` | `renderSettings()` | — (appends a row) |
| `tutorial.js` | hooks game events | — |

This works because a top-level `function f(){}` in a classic script creates a
reassignable global binding. It keeps optional features separable and preserves
the original as a fallback path — which is why a device with no AAC decoder
still gets sound, and a build with no `sfx.json` behaves exactly as before.

### Key data structures

Units are **structure-of-arrays**, not objects: `ux[]`, `uy[]`, `uhp[]`,
`uteam[]`, `utype[]`, `ualive[]` and friends, indexed by slot. Slots are
recycled, so a bare index is not a stable reference — pair it with `ugen[i]`
(a generation counter). Wave membership is stored as `[index, generation]`
tuples for exactly this reason; counting bare slots once made attack waves
"survive" on units that had died and been replaced.

Teams: **0 = player, 1 = AI opponent, 2 = the infestation** (hostile to both).

---

## 3. Subsystem notes

### Rendering

- Vertex format is 12 floats: `pos(3) normal(3) colour(3) uv(2) material(1)`,
  `VSTRIDE=48`. Instance stride is 11 floats, attribute locations 0–9.
- Material atlas is 5×5 at 256 px per tile.
- Lighting is **linear-space**: sRGB uploads, `pow(lit, 1/2.2)` on output, CPU-side
  `_lin()` conversion of sun and ambient, and an exposure curve
  `1 - exp(-lit * 1.55)`. Getting this wrong produced blown-out white.
- **Texture units 4/5/6 belong to the post chain.** See `AGENTS.md`.
- Triangle-fan caps must wind CCW when viewed from outside. A reversed fan makes
  every cylinder and extrusion look hollow — this shipped once and was hard to
  diagnose because nothing errors.

### Simulation and AI

`src/game/ai.js` runs the opponent. Two rules were learned the hard way:

- **The AI must not attack without an army.** The wave clock used to fire on
  schedule regardless of what was standing — at 90 seconds that is four units,
  which die crossing the map and take the AI's whole force with them. Waves now
  require a muster (`need` scales with wave number) and wait, with a patience cap
  so a starved AI still attacks eventually.
- **The faction is resolved once, up front** (`aiPickFaction()`), because both
  the enemy commander spawn and the hive seeding read `AI.fac` before `aiSetup()`
  used to set it.

### The infestation

Team 2 is the Umbral Brood's swarm, and that is a **design rule with teeth**:
`broodIsEnemy()` gates every quantity through `infQty()`. Against the Brood the
hive is the war; against anyone else it is wildlife at ~35% strength with a
capped tier, because the faction the player chose has to be the faction they
fight. Before this rule, Easy had 325 bugs on the field at two minutes and the
enemy army was being eaten before it ever arrived.

### Audio

Two pipelines, deliberately separate:

- `tools/make-audio.py` — synthesises 33 effects from scratch with real DSP
  (layered transient/body/tail, convolution reverb, saturation, limiting).
- `tools/ingest-sfx.py` — ingests library WAVs: trims to the transient, matches
  levels **against the existing bank** rather than an absolute target, fills
  variant slots, and handles looping ambience separately from one-shots.
- `tools/ingest-music.py` — sorts tracks into faction playlists by measured
  character (tempo, percussiveness, spectral balance, dynamic range), ranked
  **within the batch** because absolute thresholds are useless on mastered music.

`assets/audio/sfx.json` maps slots to files and is merged into the sound tables
at load, so new effects need **no code change**.

### Backend (deployed, live)

| Worker | URL | Binding |
|---|---|---|
| `massfront-update` | `https://massfront-update.jasondixon1994.workers.dev` | R2 `massfront-releases` |
| `massfront-auth` | `https://massfront-auth.jasondixon1994.workers.dev` | D1 `massfront-accounts` |
| `massfront-economy` | **not deployed** | D1 (see `docs/ECONOMY.md`) |

D1 database `massfront-accounts` = `e3c74e0d-59b8-427e-92b8-ea8a3bbd6573`.
Auth uses PBKDF2-SHA256 with per-user salt and a per-row iteration count, and
opaque server-side session tokens (revocation is a row delete). Release files are
uploaded under an immutable version prefix with the manifest written **last**, so
a client polling mid-upload can never see a manifest promising files that are not
there yet.

Deploying anything requires a scoped Cloudflare API token — Workers Scripts:Edit,
Workers R2 Storage:Edit, Account Settings:Read. **No token is in this repo.**

---

## 4. Current state

Working and verified: the renderer, simulation and AI; four factions with art,
crests and commanders; four maps each with an exclusive environmental hazard;
33 sound effects and 15 music tracks across seven playlists; a 3D research tree;
the Armory; 27 story dispatches and 23 daily orders; accounts with cloud saves;
an OTA updater; on-demand asset packs; a tutorial; offline mode; Android and iOS
packaging.

**Offline is verified, not assumed:** a full match with every non-local request
blocked attempts **zero** external requests.

### Known issues, in priority order

1. **Rhino is now the cost-efficiency outlier** — 0.702 damage-per-cost with
   7.95 health-per-cost, the best combined ratio in the game. Striker was just
   fixed (was 3.5× median, now 1.4×); Rhino likely wants the same treatment.
2. **The economy worker is written but not deployed.** Until it is, all currency
   is client-side and trivially editable, which blocks any real monetisation.
   Ledger, idempotency keys and server-side prices are already implemented.
3. **`laser` has one variant, `gauss` has two.** Library files overwrote synth
   takes without replacing all of them, so sustained laser fire repeats
   audibly. Needs 2 more laser and 1 more railgun file.
4. **Ads are scaffolded, not live.** `src/adboards.js` renders in-world
   billboards behind a provider interface; going live needs AdMob plus consent,
   a privacy policy and an age rating.
5. **Music playback is unverified on real hardware.** It works in Chromium via
   Ogg; the AAC path that iOS and Android actually use has never been played on
   a device by anyone but you.

### Material V2 unit-conversion status — 2026-08-10

The terms below are deliberately separate. Do not report an asset as having a
bespoke showcase texture pack merely because it renders through the live V2
material path.

| Faction | Live unit route | Current conversion state |
|---|---|---|
| Nova / blue | `UNIT_MDL_NOVA` + `tfcNovaSurfacePass` | Every registered playable unit uses its individual Nova mesh and semantic composite/carbon/servo/circuit materials. Commander uses the live custom commander profile. |
| Dominion / red | `UNIT_MDL_LEGION` + `domLegionSurfacePass` | Every registered playable unit uses its individual Dominion mesh and cast/rivet/siege/thermite materials. Commander uses the live custom commander profile. |
| Syndicate / green | `UNIT_MDL_SYNDICATE` + `coaSyndicateSurfacePass` | Every registered playable unit uses its individual Syndicate mesh and nano/gold/holo/conduit materials. Commander uses the live custom commander profile. |
| Umbral Brood / AI-only | `FAC_KIT.horde` + `UNIT_MDL_BROOD` | Organic-exclusive meshes/materials; chitin, membrane and limb animation channels are never replaced with mechanical materials. |

The common production V2 shader now provides atlas normal detail, AO,
roughness/metal response, controlled micro-surface breakup, faction semantics,
local lights, health-driven soot/carbon/cracks, and material LOD to all routes
above. The ownership resolver refuses cross-faction mesh fallbacks.

**Bespoke showcase map packs complete:** Nova heavy tank and Nova factory.
**Shared bespoke world pack complete:** city tower, dome, hall, military tank
farm and civic block.
**Still needed for true close-up showcase parity:** authored BaseAO +
Normal/Roughness/Emissive + material-mask packs for the three commanders, then
HQ, factory, defense and economy landmarks per faction. Build those one asset
family at a time; do not replace the live semantic route until its 412×915
tactical and battle views are checked.

Run `node tools/verify-unit-v2.mjs` after changing a faction unit registry. It
verifies the conversion route, not image quality. For visual work, bundle then
inspect at 412×915 before claiming a conversion complete.

### Bespoke pack program - 2026-08-10

The next art pass is a staged, per-asset program rather than a claim that one
global material upgrade completes every model. The governing contract is
`docs/ART_V2_PACK_CONTRACT.md`. It requires a UV-correct BaseAO, NRE and Masks
triplet for a pack to be called authored; a generated semantic bake is an
explicit temporary bridge, not a finished texture export.

- `docs/ART_V2_PACK_QUEUE.md` is the exact structure sequence, starting with
  Nova landmarks, then Dominion, then Syndicate.
- `docs/ART_V2_UNIT_PACKS.md` is the source-backed unit sequence. It starts
  with Nova frontline families and does not confuse shared semantic V2 with
  bespoke maps.
- `src/engine/materials-v2.js` now has `MF2_BESPOKE_PACKS`: authored Nova tank
  and factory packs plus a Nova commander `semantic-bake` prototype. The
  commander is deliberately not an authored pack until Blender exports its
  BaseAO/NRE/Masks maps.
- `src/engine/models-units-nova.js` has completed semantic-bake coverage for
  Nova slots 0-11 and 14-19. The per-asset contracts do not remap raw `SERVO`:
  that vertex channel carries gait/hierarchy data, and remapping it breaks
  animated limbs. Run `node tools/verify-nova-semantic-packs.mjs` after edits
  to this roster.
- Nova landmark stages currently cover HQ, research, power, factory, airfield,
  fabrication, uplink and harbor as semantic material prototypes in
  `src/engine/models.js`.
  They are not authored map packs until their exact production UVs are baked.

Do not replace the legacy/live battle route globally. Integrate each pack
behind its asset key, test 412x915 Arsenal and battle views, then move it from
prototype to complete. Preserve shader/material LOD and shared GPU resources.

### OpenCode V2 checkpoint - 2026-08-10

The later OpenCode pass added a large `*-v2` texture catalogue and expanded
`MF2_BESPOKE_PACKS`. The assets exist on disk, but
`tools/build-bespoke-v2-textures.py` currently generates generic
quadrant/panel maps without consuming the exact production mesh UV layout.
Also, `src/engine/materials-v2.js` remains an explicit `?materiallab=1`
benchmark path; its broad catalogue is not live battle-map integration.

Treat those files as material templates, not proof of an authored asset
conversion. `tools/verify-bespoke-packs.mjs` now reports that distinction:
file presence is useful, while per-mesh UV authorship and live binding still
need visual/performance validation. The current live four-faction artillery
capture is `releases/bespoke-heavy-artillery-live3d.png`; it shows distinct
silhouettes but does not yet meet the close-up reference material bar.

### Terrain + V2 validation checkpoint - 2026-08-10

The 412x915 live city gate now passes with 256x256 terrain geometry, seven
planned plots, zero wilderness props inside city occupancy, zero street/apron
overlaps, and the World Structures V2 material path ready. Its visual capture
is `releases/terrain-city-v2/city-terrain-mobile.png`. The dedicated civilian
and military V2 live captures are under `releases/art-v2/`.

Two boot regressions introduced during the wide V2 route expansion were fixed:
`models-machine.js` no longer reads the turret registry before it is assigned,
and `renderBuildMenu()` ignores intentionally unavailable faction build keys
instead of dereferencing them. The semantic roster validators were then updated
to the expanded live unit coverage. They verify semantic routing and animation
safeguards; they do **not** upgrade generated texture templates into verified
UV-authored maps.

The city road pass now has terrain-owned intersection slabs and curb-derived
street lamps. `planCityRoadLights()` is deterministic, keeps poles out of
junction turning space, and uses the same planned street network that grades
terrain, paints roads, and places building aprons. The phone QA gate asserts
that planned cities retain both road/frontage clearance and at least one road
light; `--night` produces `releases/terrain-city-v2/city-terrain-night-mobile.png`.

The first replacement-infrastructure stage is now present: `cityRoadEdges` and
`cityRoadJunctions` resolve the legacy planned street tuples into deterministic
blueprint data. Tactical view renders shallow real road, curb, sidewalk and
junction meshes from that data (`models-civic.js` / `render3d.js`), while the
terrain paint remains the far-LOD and map-thumbnail fallback. The current city
gate verifies one-to-one street-edge resolution and non-zero junction nodes.

### City ground-contact + World V2 normal checkpoint - 2026-08-10

Buildings previously had an independent terrain-painted apron while roads had
physical curb geometry, which made the former look pasted down beside the
latter. `planCityInfrastructure()` now also resolves every planned city plot
into `cityBuildPads` and its retained street frontage into `cityDriveways`.
`models-civic.js` supplies shallow hardstand and service-apron meshes, and
`render3d.js` queues them before the shadow pass. This means terrain grade,
sidewalk, driveway, hardstand and building all come from the same deterministic
city blueprint. The mobile city gate now asserts `hardstands === plots` and
non-zero driveways; the current 412x915 capture passes with 7/7 hardstands and
7 driveways.

World Structures V2 already samples Base+AO, normal/roughness/emissive and
material-mask atlases; it did not have a separate displacement/height-map
route. The civilian normal response was raised modestly from 1.18 to 1.34 so
facade relief survives against the new curbs without full parallax mapping.
Do not add parallax/displacement to the general battlefield path until it is
tested at city density: hardstands provide the silhouette/contact depth that a
per-fragment height effect cannot, while the shader remains mobile-scalable.

### Terrain infrastructure-resolution checkpoint - 2026-08-10

The terrain work is no longer limited to a painted road pass. `CITYG` was split
from the 384-cell path grid into `CITY_RES=768`, so city roads, sidewalks and
cleared lots resolve at ~4.2 m without increasing AI/pathfinding cost.
`PAVE_RES` now matches the 2048 terrain canvas; unioned foundations and service
roads no longer downsample through a 1024px mask before upload. `footOnCityRoad`
uses this field to prevent player foundations covering a civic road while still
allowing cleared city lots. The phone city gate verifies both conditions.

The current infrastructure quality issue is architectural rather than a lack
of one more colour layer. Next work should replace the legacy canvas city-road
pass progressively with module-based road classes (edge, straight, T, cross,
driveway), plus matching biome surface packs. Keep the 2048 canvas as distant
material/thumbnail fallback and keep the physical V2 meshes as tactical truth.

### Civic road V2 material + geometry checkpoint - 2026-08-11

The tactical road path now has a dedicated authored road-base source at
`assets/textures/materials/mf-civic-road-base-v1.png`. It is composited only
into the `ROAD_ASPHALT_WORN` tile of the existing authored V2 atlas at boot,
where a matching normal and AO/roughness response are derived. This preserves
the rest of the atlas and mobile LOD strategy; it does not replace every
material texture with a procedural fallback.

`models-civic.js` routes city deck, gutter/curb and paver strips through the
road, curb and sidewalk semantic tiles rather than battle-damage materials.
Road edges are modular 56/68 m physical pieces, and industrial 20 m corridors
resolve as arterial rather than civilian service roads. The city phone gate
continues to verify road/lot non-overlap, frontage, road rejection and valid
city-lot placement. The current capture is
`releases/terrain-city-v2/city-terrain-mobile.png`.

This is a foundation pass, not a claim that cities now meet C&C 3 visual
quality. The next asset task is a matched sidewalk/gutter/driveway authored
surface trio and topology-specific T/cross/endcap meshes; those should be
tested in the same mobile city gate instead of added as overlays.

The original modular-road implementation still let an edge module continue
through a graph crossing, while a junction slab rendered above it. This was a
genuine overlap, not an optical texture effect. `planCityInfrastructure()` now
finds crossing nodes before it resolves road modules, cuts each edge back by
the junction footprint, and leaves that footprint to one junction mesh. The
phone city test includes `moduleJunctionOverlaps===0` as a permanent regression
gate alongside road-vs-building-apron clearance.

The circled "second road" later traced to a separate terrain path: even after
3D modules were clipped, `paintCityGround()` and `paintRoadLand()` still used
the uncut `cityStreets` tuples. The wide canvas stroke therefore survived under
and beside the correct 3D path. Both terrain painting paths now consume
`cityRoadModules`, while `cityStreets` remains only as a coarse navigation mask
so its continuity never renders geometry. This makes the texture, V2 mesh and
junction graph use one footprint source.

The terrain no longer paints a full-width city asphalt path beneath the V2
road. It retains only a muted graded shoulder and a narrow (58% width), clipped
deck for phone-scale contrast; physical curbs/sidewalks define the visible
road boundary. Keep this distinction: restoring a full logical-street paint
pass will recreate the under-road/under-building ribbon reported in the mobile
capture.

The road at the upper-right of the reported mobile capture was identified as a
separate macro highway from `buildRoads()`, not a civic edge. Highways had no
city-footprint query and therefore could pass through a later-generated city.
`buildRoads()` now clips each macro segment outside every district envelope and
records its emitted pieces in `worldRoadSegments`; the mobile gate fails when a
world-road segment enters a city (`highwayCityIntrusions===0`). Civic streets
remain inside the city; world roads end at its perimeter pending future gate
or interchange art.

Macro routes no longer use the legacy fixed diagonal pair. Each generated
district receives a deterministic regional approach with a restrained logistics
bend and a perimeter endpoint. `MF_ROAD_LAYOUTS` now supplies authored entry
edges plus `frontier` / `ridge` / `bridge` / `interchange` / `freight` intent
for each legacy map and region. The current code uses that metadata to choose
which perimeter corridor is legal; it deliberately does **not** claim that
bespoke gates, bridges or interchanges are already modelled. Those next assets
must attach to named emitted `worldRoadSegments.kind` corridors, not reintroduce
random terrain strokes.

Driveways are now narrow curb-to-hardstand aprons rather than secondary roads,
and the terrain connector uses the same physical width. Each connection ends in
a short concrete threshold so it meets the building pad instead of fading under
the model. City ad boards reserve the frontage pass before rural road boards
and are constrained to a driveway's roadside edge; the city test now verifies
at least one road-connected city display and rejects detached city boards.

### Civic façade semantic checkpoint - 2026-08-11

`materials-world-v2.js` now transports each imported world's original material
id through the V2 shader as `vSurface`. This lets V2 distinguish authored wall,
glass/window, shopfront/door and signboard surfaces instead of treating every
face as generic albedo. The current `mdlCivicBlock` export contains BUILD,
ROOF, LAMP, GREEBLE and TRIM materials but no door/sign tags; a deliberately
limited fallback therefore gives only its generic BUILD vertical faces a low
service-door recess, upper windows and a short display band. An authored
`BUILD_SHOPFRONT` or `SIGNBOARD` material always overrides that fallback. Do
not call the fallback an authored door map: the next Blender export needs real
face-material assignments for bespoke façades.

`CITY_RES` is now 1024 (about 3.1 world metres per occupancy cell) while the
terrain texture remains 2048 to preserve mobile memory. This raises placement,
frontage and road/plot detection precision without turning every 3.2 km map
into a 4K multi-copy canvas allocation.

### Civic ground + material stability checkpoint - 2026-08-11

`models-civic.js` now authors roads, intersections, driveways and hardstands
in the scale convention used by `InstMesh`: X/Y scale together, while length
is the separate `wide` axis. Do not reintroduce centimetre-looking local Y
values such as `.024` on a 30 m road—the uniform instance scale turns those
into visibly floating slabs. The current roads have shallow 3D carriageway,
curb, sidewalk and terrain-facing slope geometry; terrain owns only the
compacted subgrade. `cityRoadJunctions` uses a carriageway plus sidewalk-corner
form rather than a contrasting square plate.

The broad shader flicker pass is in `mesh.js` and `materials-world-v2.js`:
legacy atlas materials now fade high-frequency normal/detail response by actual
screen footprint, while World V2 uses explicit texture gradients and removes
screen-space albedo derivatives from edge-wear decisions. Keep these material
LOD guards when adding V2 maps; do not restore per-pixel derivative wear or
large animated window pulses. Fog terrain is also atmospheric rather than pure
black; entity visibility remains enforced separately, so this preserves fog of
war without black theatre wedges.

`applyGroundDestruction()` in `sim.js` is the shared terrain-impact contract
for combat units, heroes, structures, city relics, volatile tanks and strikes.
Class-specific material burning, particles and salvage remain local, but crater,
rubble and deformation must use that helper so 3D objects retain a coherent
world reaction. Small units retain a size threshold to avoid pathing damage
during a large Brood tide.

### Faction aftermath + reclaim checkpoint - 2026-08-11

The V2 model pipeline wraps faction builders before instancing.  That made the
old function-identity material classifier falsely recognise Nova and Dominion
infantry as machinery, and could also make wrapped Brood models appear
non-organic to dependent gameplay code. `unitModelHuman()` now treats the real
Nova/Dominion infantry slots (rifle and flame infantry: 0 and 9) as humans, and
`unitModelOrganic()` treats the `horde` kit as biological. Keep this
roster-level rule when adding future wrappers; raw builder identity is no
longer safe after V2 semantic packing.

`dropRemains()` now produces distinct persistent aftermath using shared,
instanced resources: infantry leave a small gear/power-cell recovery pile and
dark-red blood, Brood casualties leave biomass plus toxic-green ichor, while
heavy armour, air and naval chassis resolve to their own debris categories.
`render3d.js` renders compact pooled splashes rather than a ring, because a
perfect bright circle read as a player-selection indicator. The bounded limits
remain 460 reclaim fields and 180 stains, so a Brood tide cannot turn aftermath
into an unbounded decal system. The validated phone reference is
`releases/terrain-city-v2/aftermath-salvage-mobile.png`; it is a renderer
sanity capture, not a claim that bespoke blood/ichor textures are final.

The Constructor's **SALVAGE** command now finds the nearest reclaimable wreck
or intact neutral city relic. A relic target is encoded through the existing
relic target channel and executes a safe-range, throttled deconstruction beam;
it is never accidentally selected as a combat target or approached through its
centre. City demolition remains an explicit player command. `collapseBlock()`
then uses the shared ground-destruction contract and emits a ruin salvage
field, concrete debris and normal destruction effects.

Current verification run:

```text
node tools/bundle.mjs                 PASS — 61 sources, 18.35 MB
node tools/pack-www.mjs               PASS
node tools/test-city-terrain-integration.mjs http://127.0.0.1:8982/
                                      PASS — macroRoadRejected, roadRejected,
                                      plotAllowed, 0 road/plot or highway/city
                                      intrusions, World V2 ready
node tools/verify-bespoke-packs.mjs   PASS — 0 failures
```

The bespoke verifier's current result is **0 verified UV-authored packs and
170 generated/unverified templates**. This is intentional truthfulness, not a
release blocker: semantic V2/faction routing is live, but generated texture
triplets must not be represented as mesh-specific authored bakes until a live
production mesh/UV/source scene/binding is proven. See
`docs/BESPOKE_V2_NEXT_PASS.md`.

The next terrain/infrastructure work is not another canvas-road coat. Follow
`docs/TERRAIN_CITY_NEXT_PASS.md`: establish a single InfrastructureGraph,
replace circular macro-road clipping with named city ingress/gates, add
topology-specific straight/corner/T/cross/bridge/freight modules, then move
road state into composited masks. A normal player foundation must preserve an
intact route; carrier landings and combat remain explicit damage profiles.

### If you want the highest-value next move

Server-authoritative currency. Everything on the monetisation path stacks on it,
it gets harder to retrofit as the game grows, and the auth layer it needs is
already built and live.

---

## 5. Tools reference

| Command | Does |
|---|---|
| `node tools/bundle.mjs` | single-file build **and the syntax gate** |
| `node tools/pack-www.mjs` | stage `www/`, verify no 404s |
| `npm run towers:blender -- http://127.0.0.1:8100` | export live Sentinel/Skyguard/Rail meshes and render the Blender tower lab |
| `bash tools/shrink-apk.sh` | repack + re-sign an APK (51 MB → 28 MB) |
| `node tools/extract-design-db.mjs` | evaluate real source → `design/design.json` |
| `python3 tools/build-design-db.py` | → SQLite + XLSX + browsable HTML |
| `python3 tools/make-audio.py` | render the 33 synthesised effects |
| `python3 tools/ingest-sfx.py <dir> --apply` | ingest library effects |
| `python3 tools/ingest-music.py <dir> --apply` | ingest and sort music |
| `python3 tools/make-faction-art.py` | cut crests from plates, resize portraits |
| `python3 tools/make-manifest.py . <ver> "<notes>"` | regenerate `update.json` |

The design database is the right way to reason about balance. It **runs the real
source** in a VM with proxied browser globals rather than parsing it, so the
numbers are the numbers the game uses. Note that the tables are declared with
`const`, which puts them in the global *lexical* scope and not on the global
object — reading them needs an in-context expression, not a property access.

---

## 6. Asset licensing

The soundtrack and the sound-effect library are the project owner's, purchased or
self-made. The faction art was supplied by the owner. If you add assets, record
provenance in `assets/AUDIO-LICENSES.md` — app review occasionally asks, and an
automated content-ID claim is a five-minute problem or a month-long one depending
entirely on whether you can produce the receipt.
