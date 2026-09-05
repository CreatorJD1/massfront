# GUI, art, Brood, aircraft and multiplayer — source audit

2026-09-04. Root plus three parallel read-only delegates reviewed the current
canonical checkout. This is a broad source/inventory audit, **not a claim that
every screen or model has passed a current visual test**. No gameplay source,
asset, live account, Worker, release or version was changed during this pass.

Release preparation and current live-download checks are recorded separately in
`docs/UPDATE_PREPARATION_2026-09-04.md`. Existing performance evidence remains
failed; all 273 inputs were rehashed and still match. The original 18-stage
plan and the creator's locked geometry/accepted-model decision are unchanged.

## Priorities

| Priority | Finding | Required acceptance |
|---|---|---|
| High | Full recovery URLs still redirect on the HF channel although the incremental-download check passes | Delta AND recovery delivery checks, identical payload identity, old-base install/restart/rollback |
| High | High-unit p99 frame time is 101.3 ms, not the 33.3 ms target | Source-matched hardware stress, dense visible fight, sustained run, unchanged AI/graphics/caps |
| High | Raptor's low attack altitude exceeds weapon range against small targets | Ground-strike damage test across small/large targets and altitude transitions |
| High | Aircraft projectiles start below the visible aircraft | Muzzle/projectile world-height equality and visual trail continuity |
| High | Multiplayer starting state, reconnection and normal termination are incomplete | Two independently initialized clients agree through play, loss/rejoin and victory |
| High | New Brood terrain pair missing from OTA embedding allowlists | Asset byte/hash proof after updating an older installation, then offline render |
| Medium | Space controls/text remain undersized; current HUD visual matrix missing | Current portrait/landscape/scaling/touch screenshots and real interaction checks |
| Medium | 327 accepted models are catalogued but not consumed by world-placement code | Deterministic authored site/room placement, collision/scale/material checks |

These priorities separate shipped behavior, local implementation, verification
gaps and future content. They are not all new regressions or all mandatory
contents of one release. Do not bundle the entire space-content backlog into a
performance patch.

## 1. Brood crowds and terrain

### Implemented

`src/engine/brood-crowd.js` submits cosmetic cluster instances through the real
`InstMesh` renderer. `src/ui/render3d.js:1955` queues them only after camera and
fog checks. Real units retain their own simulation, targeting, pathfinding and
network identity; cosmetic bodies do not multiply authoritative unit count.
The feature checks the resolved horde kit, not merely one hard-coded team.

- Global cluster budget is 96 Low / 160 Medium / 256 High, with pressure caps
  64 or 112 (`brood-crowd.js:95-103`).
- Near/mid/far meshes contain one/three/four visible bodies per cluster.
  High-quality upper bounds are therefore 256 / 768 / **1,024** cosmetic bodies,
  subject to visible eligible anchors, difficulty and near-density thinning.
- The near stream's constructor argument 64 is an initial buffer allocation,
  not a hard limit: `src/engine/mesh.js:943-985` grows instance storage.
- Up to three extra draw calls; distant/pressure views use cheaper animation.
  This is not independently simulated GPU pathfinding or a 3,000-body renderer.
- Cosmetic placement is anchored to units, not collision-aware crowd simulation
  or cross-anchor spatial clustering. Watch for piles at choke points.

### Unproven

The final 2,500-authoritative-body benchmark admitted 500 Brood, but all ten
sampled views had zero visible real Brood and zero proxy bodies. Its final
screenshot snapshot reported only three cosmetic bodies. It does not establish
the quality or frame cost of a visible dense swarm. The focused test uses a
stub instance mesh, so it cannot certify WebGL output or allocation behavior.

Next test: same seed/camera/tick, Brood in view at near/mid/far distances, with
fog visible/hidden, pressure changes, movement through a choke, combat and GL
context recovery. Record real visible units, clusters, cosmetic bodies, draw
calls, triangles and CPU/GPU frame tails separately. Do not increase the
authoritative caps to imitate cosmetic density.

### Terrain

The new 1024px albedo plus packed normal/roughness pair reuses the SOIL sampler
(`src/engine/gl.js:4603-4646`). Hardscape/creep mask meanings remain intact;
organic foundations avoid rectangular pads (`:5923-5963`). Infested terrain is
selected by authored map identity, not simply by the wildcard appearing.

This improves soil/creep, not the entire biome: palette, distant ground,
cliffs, props and transitions still need a coherent art pass. No new seam,
normal orientation or grazing-light visual certification was performed here.
The files exist in www, but the packer's required-art check list omits them
(`tools/pack-www.mjs:350-354`) and OTA's art lists omit them entirely. A passing
path gate therefore does not protect this new delivery boundary.

## 2. Aircraft heights and concrete defects

Heights are **world units above local terrain**, not meters or absolute sea-level
altitude. The active constants are `[22,62,128,196,0]` in
`src/game/airwarfare.js:15`. Rendering adds terrain height at
`src/ui/render3d.js:1085`. Legacy 58-unit values are fallback paths.

| Aircraft | Default cruise | Role |
|---|---:|---|
| Wasp, type 5 | 128 | Air combat |
| Raptor, type 17 | 128 | Ground strike; low release at 62 |
| Kestrel, type 25 | 196 | Recon/scout |
| Atlas Skycrane, appended type 33 | 128 | Transport |
| Massflesh Ascendant, appended type 35 | 128 | Temporary airborne form |

Ordinary move/escort/reform use 128; recon uses 196. Strike phases descend to
62 and climb to 196 on egress. Return-to-base approaches at 62, then 22 close
to base. Landing 22 is still above-ground approach/hover, not touchdown zero.
Transitions interpolate at 30 units/s, or 22 toward landing. The Massflesh
constant 26 is its flight duration, not its altitude.

1. **Raptor firing envelope:** base range 52 (`src/game/sim.js:63`) is checked
   against 3D distance plus target radius (`airwarfare.js:236-247,389-393`).
   At settled low height 62, a ground target with radius below 10 is unreachable
   even directly below. This is a source-mathematical finding, not a newly run
   combat test. Make release altitude/range compatible without removing the
   3D authority check; test real damage, not only mission-state changes.
2. **Projectile origin:** `fireProj` initializes line-flight source height at
   terrain+16 (`sim.js:6185-6195`); the muzzle helper contains only planar
   coordinates and source-unit identity is assigned after creation
   (`:6143-6153,8600-8607`). Visible muzzle flashes already use aircraft height
   (`render3d.js:723-738`), so the trail can begin below the hull. Carry the
   resolved source height into initialization and test every projectile family.
3. Atlas unload checks horizontal distance but not landing altitude
   (`src/airlift.js:255-305`). Massflesh tentacle targeting uses planar range
   and its transformation can change directly from airborne to terrain
   (`:742-840`). Decide/verify authored drops and transformations explicitly.
4. Same-band aircraft separate in XY only when vertical difference is below
   18 (`sim.js:7430-7449`). Air bypasses ordinary terrain/building collision;
   following terrain-relative height is not forward obstacle-clearance logic.
5. `tools/probe-air-warfare.mjs:307-309,345-349` still expects the old
   8/27/58/94 bands. Update that contract before counting it as current evidence.

## 3. GUI/UI inventory and remaining work

| Surface | Source inspected | Current visual status |
|---|---|---|
| Main menu and launcher/update/history/downloads | `index.html:188`, `src/launcher.js:300` | Wiring present; no new complete visual/interaction matrix |
| Account/profile | `src/authportal.js`, `src/main.js:2926` | Persistent username path present; current scaled layouts unverified |
| Settings/audio/graphics/performance | `src/game/meta.js:1973-2125` | Generated tabs and diagnostics present; description-heavy sections remain |
| War Table/setup/campaign | `index.html:253`, `src/galactic-operations.js:357` | Host routes present; complete forward/back route proof pending |
| Battle HUD/building/selection/repair/feed | `src/ui/hud.js`, `cinematic-hud.js`, `unit-stack-hotbar.js`, `src/styles/ui.css` | Current source inspected; older visuals are not current acceptance |
| Social/friends/chat/lobbies | `src/socialui.js` | Real feature wiring; all-user directory absent and presentation text-heavy |
| Space/tutorial/UGA submenus | `modules/space_exploration/src/` UI, campaign registry and first-entry controller | Older limited-width evidence only; several source-level sizing defects |

### Keep the improvements already wired

The battle HUD has translucent frame/rail rules without blur, safe-area math,
44px controls, a scrollable type-stack selector, two-line names in the final CSS
cascade, commander tap-to-select/center (`src/main.js:3188`), repair/recycle and
a bounded collapsible notification feed. See `ui.css:3668-3882,4006-4096,4634-4679`.
Do not report the earlier overridden nowrap rule as a current clipping bug.

Unit/building cards and stacks call the shared, faction/model-specific runtime
thumbnail renderer (`src/ui/hud.js:1784-1855,2401-2429` and
`src/ui/unit-stack-hotbar.js:109`). This is stronger than generic role glyphs,
but the existing thumbnail test checks source patterns. Verify that actual
visible cards resolve geometry rather than a loading reticle/error fallback.

Reuse original MASSFRONT panel material, command icon atlas, commander/KEEL
portraits and faction cinematic art. C&C3/Supreme Commander references guide
compact layout and interaction; they are not replacement faction art.

### Fix or explicitly accept

- Space target buttons are 42px and autopilot buttons 38px
  (`modules/space_exploration/src/ui/space_presentation.css:135,151`); UGA session
  buttons are 38px (`uga_command.css:587`). Numerous 5–9px labels/forced
  ellipses remain in that stylesheet. Increase hit areas and use progressive
  disclosure/meaningful short labels rather than merely shrinking text.
- At <=365px, battle CSS deliberately hides resource icons and the goal chip
  (`src/styles/ui.css:4202-4208`). That fits width but conflicts with an
  always-icon-led presentation; validate with the owner rather than claiming
  the reference design is fully preserved.
- Social draws initials/gradient avatars and many action buttons per chat row.
  On <=520px those actions form two-column, up-to-three-row grids
  (`src/socialui.js:400-425,589-606`). Prefer a player portrait/name target
  opening one compact action sheet, with chat occupying the main area.
- UGA's Co-op/Versus and MMO entries are explicitly unavailable in the space
  campaign registry (`uga_command.js:787-810`, `campaign_hub_registry.js:98-124`).
  This is separate from the base Social lobby foundation; do not describe those
  space entries as functional multiplayer.

### Required visual/interaction matrix

Run the actual packed game, not only a mockup: 360, 390, 393, 412 and 430 CSS-pixel
portrait widths and their landscape counterparts; tablet and desktop; UI scale
minimum/default/maximum; safe areas, rotation, reduced motion and text growth.
The existing cinematic verifier has several widths but no exact 390 entry.

For each surface above, exercise open/back/close and disabled/offline behavior;
measure overflow, minimum hit targets, contrast against bright/dark terrain,
text clipping, active-tab visibility and battlefield obstruction. Test hotbar
drag versus tap, long names, hundreds of selected units, build filters/queue,
repair resources/health changes, feed bursts and commander/minimap dialogue.
Verify popup bounds and focus too. Use current source hashes and actually view
the screenshots. The located September 1 HUD audit and limited Stage 11 space
captures cannot certify September 4 CSS. No physical S25 test is claimed.

## 4. Art, model pack, map layout and space integration

### Inventory is present; placement is not complete

The accepted catalog contains **327 models: 320 world-kit + 7 Spline**, not
328 modules. Its declared model bytes total 450,496,672. The delegate checked
all 327 paths and catalog sizes; all matched. The optional runtime manifest's
440 files also exist/size-match, totaling 568,156,643 bytes (~541.8 MiB).
These are file/inventory checks, not fresh visual or mesh-quality acceptance.

`modules/space_exploration/src/core/world_model_catalog.js:7-33` validates the
locked inventory and `:48-62` provides lazy loading. `src/space_module.js:149`
exposes that library, but the source search found no placement consumer calling
its load API. Being admitted to the pack does not place a model on a planet or
inside a room.

Current scene GLBs are much narrower: Nexus-VII and UGA cutaway
(`ship/uga_blender_assets.js:6-7,123-133`) plus a nine-contact showcase pack
(`celestial/showcase_contact_assets.js:4-16,114-134`), placed by
`three_space_engine.js:1109-1143`. Station/relic interaction still reaches
`CONTACT INTELLIGENCE ARCHIVED` (`space_experience.js:1598-1605`); that is not
a playable boarding/interior loop.

### Useful next content, without regenerating models

- Add deterministic placement tables using approved catalog keys for one
  station/room/site at a time. Connect entry, exit, objectives and host-mode
  handoff before increasing the number of sites.
- Families already offer cityforms 68, superstructure 56, transit 54, ground
  36, modular building 36, building 33, platform 30, road 7 and Spline 7.
  Apply them to authored arcologies, relays, stations, derelicts, transit
  spines and hive depths in `domain/catalog.js:487-496`.
- Base RTS maps need navigation-clear placement: spawn/buildable-area checks,
  wide alternate routes for large chassis, consistent footprint/collision
  bounds, readable resource access and landmark silhouettes. Check balanced
  travel/economy opportunities with the real sim; do not guess faction balance
  from an attractive map screenshot.
- Read-only GLB inspection found 4,992 embedded PNG images and no declared
  glTF compression extensions across the catalog. Preserve all locked masters;
  investigate per-family derived texture delivery/compression with matching
  normals, roughness, UV scale, silhouettes and runtime fallbacks. The current
  loader's compressed-derivative comment is not proof of compressed assets.
- Lazy-load only a selected room/site and release its resources on exit.
  Do not eagerly load ~542 MiB to make the catalog appear integrated.
- The 15 approved UGA personnel portraits exist. Syndicate Renn remains
  `SOURCE_ACCEPTED_RUNTIME_UNREGISTERED` in `commander_roster_contract.js:26-35`:
  the gap is registration/identity wiring, not missing portrait files. KEEL
  stays UGA; no faction reassignment or model regeneration is authorized here.

Full PBR correctness, duplicate inner geometry/flicker, UV stretch, LOD popping,
terrain seams and every model's rendered appearance were **not** re-certified
by this inventory audit. Those require a separately executed visual/Blender
acceptance matrix, not a catalog count or successful HTTP load.

## 5. Multiplayer and Social truth

There is substantial implementation, but current evidence does not establish
production-ready multiplayer. No feature was disabled by this audit.

1. **Start-state divergence:** compatibility hashes build/balance plus
   `{mode,slots,map}` (`src/authportal.js:1935`, Worker `index.js:1425`). Network
   bootstrap calls ordinary `newSkirmish()` (`src/game/matchconsumer.js:80-95`),
   which consumes device/account-local faction, commander, perks, modules,
   loadout and wildcard choices (`src/main.js:759-790`). Wildcard selection
   can use `Math.random()` (`src/game/meta.js:1187-1217`). Freeze the complete
   authoritative descriptor and seed, then initialize every seat from it.
   A state digest detects divergence; it does not prevent it.
2. **Reconnect skips state:** the room keeps ticking while a seat is absent
   (`cloudflare/massfront-auth/src/index.js:2703-2766`). Welcome supplies the
   current tick; client resets its cursor (`src/socialui.js:127-143`,
   `src/game/matchconsumer.js:33-40`) without missed-order replay or snapshot
   restoration. Test convergence, not only reconnect token/deadline success.
3. **Normal victory is not network termination:** local victory sets
   `gameEnded` (`src/main.js:1130-1184`). Worker `matchEnd` emission was found
   for admission/reconnect forfeits (`index.js:2729-2741`), not normal gameplay
   victory. Add validated terminal-state propagation and room cleanup.
4. **Online count is narrower than its name:** the aggregate heartbeat runs
   every 45 seconds while Social is visible (`src/socialui.js:707-763,915-928`).
   It is not all active gameplay clients. Named rows include friends/lobby
   members and up to eight recent chat authors (`:377-386`), not a public
   directory of every online username. Renew presence across authenticated
   sessions if the product promises a true live-player count, with privacy and
   offline rules preserved.
5. **Friend presence expires:** Worker TTL is 120 seconds (`index.js:759-761`),
   but `setPresence` is manually invoked (`socialui.js:541-542,799-801`) rather
   than renewed with the aggregate heartbeat. A friend may drift offline while
   still using the game.

Username persistence/cloud-account hydration, World Chat author actions,
friends, blocking, PMs and invitations have real source routes. Checked-in
flags request realtime/lobbies/chat/count, but friend-presence enablement is
unset. Do not infer deployed flags/D1 schema from local wrangler configuration.
Supported base topology is intentionally 2-player PvP and 2–4-player co-op;
larger PvP fails closed. This is not the same as four human PvP factions plus
Brood being ready online.

Existing command-consumer evidence covers command ingestion and large-selection
batching and explicitly has `releaseProof:false`. Local/in-memory/mock tests
do not prove deployed accounts, two-client sustained hash agreement, reconnect
convergence, normal victory or packaged WAN behavior. The live Social contract
probe also omits online-count/World Chat action coverage. Production capability
and D1 verification remain pending; no accounts/messages were created here.

## 6. Astra Ultra versus Sol Ultra for MASSFRONT

Assuming "Astro" means **GPT-6 Astra**. Ultra is the app's reasoning-effort
choice, not a separate art generator. No model switch was performed here.

OpenAI describes Astra as strongest for complex multistep software/computer-use
work. My inference for MASSFRONT: use it for difficult cross-system renderer,
determinism, release and visual-integration decisions; Sol remains appropriate
for well-scoped implementation, tests and review. This is a workload recommendation,
not a measured MASSFRONT A/B result. [Official model guidance](https://developers.openai.com/api/docs/guides/latest-model).

There is real first-party evidence of Astra making editable Blender geometry,
materials, lighting and camera scenes through `bpy`, then inspecting renders and
repairing geometry. That makes it a credible candidate for room layout and
material/lighting refinement here. It is a demonstrated workflow, **not proof
that Sol cannot do those tasks or that Astra always creates better meshes**.
[Blender case study](https://developers.openai.com/blog/architectural-visualization-with-astra).

The separate space-game case study combines art direction, generated concept
images, procedural rendering, instrumentation and repeatable browser tests.
Those workflow ideas fit MASSFRONT; its engine/framework choices do not imply
we should replace this game's WebGL2 engine or add dependencies.
[Game-development case study](https://developers.openai.com/blog/how-to-build-games-with-astra).

Sol supports image input and image-generation tools, code/shell and computer-use
tools. Switching the reasoning model does not alone add a new image or 3D
generator. Compare one identical constrained task using the same assets/tools,
then score appearance, geometry/material correctness, mobile frame/texture cost,
integration and time. Respect the locked-model decision in either model.
[Sol capabilities](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

## Handoff

Root owns the two preparation/audit documents and continuity snapshot. Delegates
completed read-only Brood/art, aircraft/multiplayer and GUI/evidence reviews;
none edited source. No delegate has an outstanding implementation task.

Next safe action: local delivery-gap regression work, then the measured
performance and aircraft repairs, followed by source-matched visual/runtime
acceptance. Optional world placement and full multiplayer convergence deserve
explicit batches, not unsupported claims in this performance release. See the
release-preparation document for exact gates and publication boundaries.
