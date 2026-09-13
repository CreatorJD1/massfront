# MASSFRONT Complete Master Plan

## Summary

Develop MASSFRONT into a large-scale, mobile-first RTS with a clearly documented
and verified population contract, readable faction-specific combat,
planet-authentic maps, stronger commander gameplay, and a production-quality
Galactic Exploration layer integrated with the main game.

Codex orchestrates architecture and integration. Claude handles isolated implementation and Blender-production lanes. Antigravity performs fast audits and evidence validation. Spline/Hunyuan supplies concepts and source candidates; Blender converts them into game-ready assets.

No visual task is complete without source-matched before/after captures, automated evidence validation, Codex visual review, and recursive correction.

## Operating and Evidence Rules

- Preserve the dirty worktree, authoring sources, Blender/Spline files, concept art, raw audio and rejected candidates.
- Assign exclusive file ownership before parallel work; never allow two agents to edit the same subsystem concurrently.
- Record HEAD, dirty/runtime/package fingerprints, seed, renderer, viewport, camera, device and image hashes.
- Missing or mismatched evidence is `UNKNOWN`/failure.
- Phone portrait is the primary visual target; desktop evidence cannot substitute for mobile.
- Require captures at 412×915, 915×412, 800×1280, 1280×800, 1440×900, 1920×1080 and one narrow/foldable viewport.
- Use real S25 Ultra evidence for performance acceptance.
- Run the source bundle gate after runtime edits and rebuild the runtime package before browser/device verification.
- Do not publish, activate multiplayer, delete cloud releases or migrate Galactic Campaign into production without explicit approval.

## Capability Tracks

These headings are intentionally unnumbered. The Delivery Order below is the
only numbered 18-stage plan and the only meaning of “Stage 10,” “Stage 15,” and
similar references.

### Navigation, Movement and Population

- Preserve deterministic flow fields while adding weighted static and dynamic blockers.
- Include cliffs, water boundaries, indestructible geometry, buildings, city walls, wrecks and large obstacles.
- Add infantry, light, heavy, superheavy and naval clearance classes.
- Add strategic sector routing above tactical flow fields.
- Add arrival deadbands, damped steering, separation and formation offsets that survive arrival.
- Persist naval goals instead of repeatedly rejecting and repicking them.
- Route around indestructible objects and create explicit attack-to-clear tasks for destructible blockers.
- Make diagonal movement follow the unit’s actual facing and movement model.
- Enforce a hard population limit at spawn and production admission after the
  owner resolves whether “500” means each playable faction/team or each
  Commander seat. Current simulation behavior is 500 per Commander seat.

### Projectile Flight, Turrets and Charge States

Add an authoritative `WeaponFlightProfile` containing weapon family, faction style, guidance, turn rate, acceleration, altitude, trail, fuse, impact and physical-force behavior.

- Remove unintended homing from unguided rockets, bullets and ordinary cannon rounds.
- Give guided missiles predictive interception, capped turns and proximity fuses.
- Preserve deterministic artillery arcs while checking major terrain and structure obstruction.
- Separate turret-base rotation, turret yaw and barrel pitch.
- Prevent firing outside authored traverse and elevation limits.

Add `WeaponChargeProfile` states: idle, acquire, charging, committed, firing, cooldown and interrupted.

- Energy artillery uses emitter buildup and containment glow.
- Heavy kinetic artillery uses loading/breech motion and barrel heat.
- Singularity weapons use lensing and inward matter flow.
- Strategic weapons receive faction-specific world-space warnings.
- Ordinary rapid weapons remain immediate.

### Beams, Trails and Singularities

Keep `addBeam()` compatible and add:

- `mfBeamUpsert(key, …)`
- `mfBeamStop(key, fadeOut)`

Use keyed fixed-step beams for mining, repair, reclaim and construction assistance. Instant combat beams remain transient unless gameplay explicitly sustains them.

Create a new trail renderer using fixed-step path history and continuous ribbon/tube geometry:

- Energy artillery.
- Kinetic shells.
- Missiles.
- Plasma.
- Atmospheric smoke.
- Air-damage trails.

Trails must support fog, world depth, distance LOD and High/Cinematic raymarched cores with authored fallbacks.

Singularities must:

- Pull units according to mass class.
- Affect rigid debris, wreckage, salvage and legacy debris.
- Add tangential orbit and bounded horizon consumption.
- Keep buildings anchored while applying structural damage.
- Produce consistent physical and visual behavior.

### Intelligence, Artillery and Utility AI

Add persistent `IntelContact` records containing target identity, position, source, confidence and age.

- Permit artillery attacks on visible, radar-designated, player-designated and last-known areas.
- Apply confidence-based scatter to stale contacts.
- Make basic bombardment available by default; research improves accuracy, coordination, salvo size and counterbattery capability.
- Display weapon, radar, minimum-range, HQ, repair and construction overlays.

Add a deterministic utility-job system for:

- Unit and structure repair.
- Construction and production assistance.
- Salvage.
- Mining.
- Survey.
- Escort.
- Return-to-base.

Use stable claims, leases, bounded searches, manual overrides and diminishing assistance.

### Air Warfare

- Add landing, low, tactical, high and crashing altitude bands.
- Implement air-to-air lead pursuit, firing cones, attack passes, break/extend, reacquisition, CAP, escort and interception.
- Implement air-to-ground ingress, alignment, release, pull-up, egress and reformation.
- Drive pitch and banking from real movement.
- Add exhaust, contrails, missile rails, engine damage, breakup and airbursts.
- Feed aerial reconnaissance into artillery and mission intelligence.

### Mobile Interface, Production and Progression

- Use screen-silhouette-aware selection instead of oversized world-space circles.
- Add deliberate touch box selection without conflicting with camera movement.
- Prevent tap-through and bounced-tap duplicate commands.
- Keep benign navigation one tap and confirm only disruptive/destructive actions.
- Enforce 44×44 minimum and 48px primary controls.
- Support safe areas, rotation, Android Back, keyboard navigation and visible focus.

Production previews show:

- Build time and queue position.
- Footprint and size class.
- Resources and power.
- Population.
- Prerequisites.
- Deployment capacity.
- Unit/structure function.

Research, crafting and resources use one authoritative source and show prerequisites, exact unlocks, stat deltas, recommendations, affected modes, inputs, outputs, compatibility, income, storage and bottlenecks.

### Commanders, Voice and Deployment Arena

Make the base-game commander roster authoritative and expose it to Galactic Campaign through the exploration host.

Treat the commander as the pilot and the mech as the command chassis.

Commander records include:

- Faction, rank, biography and lore.
- Passive and signature ability.
- Primary/secondary weapon role.
- Chassis binding.
- Readiness, fatigue and injury.
- Voice and portrait bindings.

Extend commander dialogue beyond training to objectives, enemy sightings, research, casualties, strategic weapons and mission outcomes. Add a rate-limited portrait, subtitle and voice panel.

Replace the placeholder Strike Bay with a 3D Deployment Arena showing:

- Command chassis on a maintenance turntable.
- Commander/pilot gantry or hologram.
- Base Deployer aircraft.
- Specialist muster positions.
- Unit staging racks.
- Starting structures on cargo pallets.
- Support attachments, service arms, deck crew and operational lighting.

UI cards and 3D hotspots modify the same deployment state. Phone portrait reserves at least 45% of usable height for the arena.

### Combat VFX, Gore and Terrain Response

Resolve charge, muzzle, projectile, trail, beam, impact, explosion, shield, destruction and aftermath presentation from one authoritative faction/weapon profile.

- Preserve playable-faction canon; Brood remains non-playable and non-humanoid.
- Eliminate outdated generic effects only after real call-site verification.
- Add Off, Reduced and Full biological-gore settings.
- Resolve blood, ichor, sparks, mechanical fluids and destruction by biology/material.
- Keep resource drops and collection effects distinct from explosions.
- Preserve bounded macro-FX recipes and depth-aware volumetric fallbacks.
- Strengthen crater depth, displaced soil, grass removal, dark scorch, textured emissive embers, smoke and wreck aftermath.
- Validate force fields, fog, depth and GL-state restoration.
- Validate cloud/high-altitude rendering on the actual S25 Ultra.

### Planet-Aware Settlements and Tactical Maps

Add:

- `WorldLocationStyleV1`
- `LocationGrammarV1`
- `PlanetAdaptationV1`
- `FactionOccupationV1`
- `ConditionVariantV1`

Resolve every location from planet, biome, region/geology, faction, purpose, era and condition.

Remove the generic template fallback. An incompatible location must fail planning instead of silently receiving an ordinary city.

World adaptation changes topology and geometry:

- Volcanic: basalt, refractory structures, geothermal infrastructure, heat shielding, ash roads and elevated causeways.
- Glacial: thermal corridors, enclosed transit, berms and ice anchors.
- Desert: wind walls, shade structures and buried services.
- Jungle/wetland: pylons, drainage and canopy routes.
- Oceanic: sea walls, raised/floating platforms and pressure systems.
- Brood: staged organic conversion of buildings, roads and traversal.

Complete dedicated cities, colonies, outposts, military bases, refineries, relics, ruins, spaceports, derelicts and Brood sites. Tactical maps must support infantry, small vehicles and mechs.

### Blender Modular Content Production

Claude owns isolated Blender/source-art production. Codex owns runtime integration. Antigravity owns inventory and evidence checks.

Spline/Hunyuan models are source candidates only. Blender must normalize, repair and export them.

First production wave:

1. Primary road straight, corner, T and X/plaza.
2. Endcaps and primary/local adapters.
3. Local roads and service lanes.
4. Pressure/glass corridors and airlocks.
5. Cargo corridors, bridges and tunnels.
6. Perimeter walls and gates.
7. Broad command hub, operations block and logistics depot.
8. Refinery spine, pipe kit, tank farm and processing block.
9. Low, mid, tall and hero structures across four silhouette families.
10. Damage, ruin, environmental-contact and Brood variants.

Every accepted asset requires:

- Meter-normalized origin and grid-compatible bounds.
- Named sockets and navigation links.
- Semantic structural, facade, roof, contact, glazing, emissive, decal, damage and infestation materials.
- Merged overlapping surfaces with no z-fighting.
- LOD0/1/2 and appropriate LOD3/impostor.
- Separate collision and unit-clearance declarations.
- Triangle inventory and source hash.
- Four-view Blender evidence.
- Real phone tactical and command captures after integration.

### Galactic Exploration Module

- Preserve the existing main menu. Replace the War Table action with **START
  MASSFRONT**, which enters one unified mode flow for Standard/Classic,
  Campaign, Co-op Versus, and the connected/MMO experience.
- Use Experimental Gameplay as a staged rollout gate while the layer is
  incomplete, not as the permanent product entry point.
- Start a new career with a brief art/cinematic world introduction and a basic
  planet-side RTS tutorial. The tutorial is skippable. After it, the player
  chooses a faction and receives that faction's starter **Commander 1** before
  boarding the UGA ship.
- Keel is UGA. Keel supplies contextual hints without being presented as Nova
  or another playable faction.
- Keep commander/Keel dialogue in a stable comms surface that never flickers
  the minimap; use a dedicated conversation surface during exploration.
- Show the management cutaway as a full side profile of the ship.
- Favor image-, animation-, and interaction-led presentation with progressive
  disclosure instead of text-heavy panels.
- Convert existing main-game functions into ship-room controllers without
  inventing duplicate menus or replacing working game modes.
- Complete Command, Navigation, Survey, Mission Operations, Research, Fabrication, Engineering, Habitat, Embassy, Strike Bay, Logistics and Classic terminal.
- Complete deterministic district construction and exact-once cycle advancement.
- Preserve XCOM-style commander, specialist and deployment preparation.
- Reuse the real RTS engine for ground operations.

Maintain versioned contracts:

- `ExplorationHostV1`
- `GroundOperationRequestV1`
- `GroundOperationResultV1`
- `ExplorationContentManifestV1`

Use same-tab launch, opaque operation nonces and an account-scoped IndexedDB envelope/result ledger. Apply results exactly once and resume the same ship room.

Optimize only the optional runtime pack; preserve all source-quality assets.

### Music and Audio

Create an authoritative music manifest covering:

- Main menu.
- War table.
- Galactic navigation.
- Ship rooms/decks.
- Calm gameplay.
- Tension.
- Combat.
- Victory and defeat.
- Story and mission cues.

Each track records provenance, license, master, loop metadata, mood, allowed contexts, loudness, codecs, pack and fallback.

- Prevent ordinary menu navigation from restarting music.
- Use controlled explore → tension → combat hysteresis.
- Duck music for voices, alarms and story events.
- Verify `.ogg`/`.m4a`, mobile decoding, first-gesture unlock, offline fallback and volume persistence.
- Keep full masters outside runtime packages.

### PWA, OTA and Platform Delivery

Support:

- Desktop browser/PWA.
- Android Capacitor APK and browser/PWA.
- iPhone/iPad Safari-installed PWA through Share → Add to Home Screen.
- Windows PWA.

Apple support is browser/PWA-only. Native iOS/IPA/Xcode/TestFlight/App Store
delivery is permanently retired and is never a version, build, signing,
submission, device-acceptance or release gate. Retained native-project material
is historical reference only. Continue to treat Safari/WebKit behavior, WebGL2,
AAC decoding and gesture unlock, safe-area layout, standalone launch, storage,
offline behavior, OTA update and rollback as supported compatibility surfaces.

Add:

- Versioned service worker without precaching the entire payload.
- iOS Add-to-Home-Screen guidance.
- Chromium install affordance.
- `?diag=1` for renderer, texture family, storage, service-worker state, updater version and runtime/GL errors.
- Content-addressed OTA chunks, hashes, IndexedDB shadow staging and atomic activation.
- Resumable downloads and existing watchdog rollback.
- Optional content packs isolated from core payloads.

Keep Hugging Face primary and Cloudflare fallback after live verification. Retain five selectable rollback releases.

### Social and Multiplayer

Keep multiplayer active only for server- and simulation-supported tuples.
Unsupported layouts fail closed instead of launching an unusable match.

- Repair friends/chat/lobby error messages.
- Complete Worker/D1 migration and production verification.
- Add moderation queue, reports, enforcement, appeal state and actor/reason audit trails.

Implement multiplayer in this order:

1. Seat-bound launch tokens and compatibility handshake.
2. Durable Object match room.
3. Deterministic fixed-tick relay.
4. Input delay and batching.
5. Divergence hashes.
6. Reconnect, grace and forfeit.
7. Socket rate limits and moderation.
8. Two-client end-to-end tests.

For the current implementation, Skirmish PvP is exactly two human players and
Co-op vs AI is two to four humans. Larger PvP rosters are a long-term goal and
require a real multi-army seat/team simulation, expanded capacity, moderation,
observability, and device/network acceptance; they must not be implemented by
aliasing extra players onto two armies.

### Source Quality, Archives and Documentation

Run only after feature stabilization.

- Inventory every file by hash, size, tracked state, runtime reachability, ownership and reproducibility.
- Classify files as active runtime, authoring source, derived cache, superseded release or unknown.
- Preserve valuable “why,” measurement and compatibility comments.
- Remove only stale, duplicated, contradictory or code-restating comments.
- Externalize embedded binary payloads where safe while retaining the generated single-file build.
- Audit duplicate globals, dead branches, stale adapters, duplicate faction profiles, orphaned tools and false-green tests.
- Split oversized files only through verified seams.
- Never delete exploration/source assets because they are large, untracked or absent from runtime.
- Retain five rollback releases and prune older local/HF/Cloudflare artifacts only after hash and rollback validation.
- Produce a retained/moved/excluded/regenerated/removed ledger with recovery paths.
- Create a tracked documentation archive, repair links and publish one authoritative master-plan document after the sprint.

## Verification

- Global-scope, bundle and package gates after runtime changes.
- Deterministic probes for movement, naval arrival, formations, population, projectiles, turrets, charge states, keyed beams, singularities, utility AI and air missions.
- Compatibility tests proving hostile environments cannot resolve ordinary settlement templates.
- Modular-kit socket, navigation, collision, LOD, material and seeded-layout tests.
- Mobile-first screenshot matrix for every modified screen and visual system.
- Real S25 performance tests across 1v1 through 1v4.
- Music manifest, codec, loudness and playback tests.
- PWA install/offline/update/rollback tests, including Safari/WebKit Add to Home
  Screen, standalone launch, AAC unlock and safe-area/rotation behavior on
  Apple devices.
- Two-client multiplayer tests before activation.
- Repository-cleanup fixtures proving active runtime, source art and unknown files cannot be removed.

## Delivery Order

1. Evidence foundation.
2. Navigation, movement and population.
3. Projectile, turret, charge and singularity systems.
4. Beams, trails, intelligence and utility AI.
5. Air warfare.
6. Commander identity, voice and Deployment Arena.
7. Mobile UI and progression.
8. Faction VFX, gore and terrain response.
9. Planet-aware map grammar.
10. Blender modular content.
11. Galactic Exploration completion.
12. S25 performance optimization.
13. Music/audio.
14. PWA/OTA.
15. Social/multiplayer.
16. Final source-quality review.
17. Documentation reset.
18. Release after explicit approval.

## Assumptions

- The commander is the pilot of their command chassis.
- Brood remains a hostile, non-playable, non-humanoid enemy.
- Galactic Exploration may remain feature-gated during rollout, but its target
  state is the unified START MASSFRONT flow rather than a disconnected app.
- Missing evidence is failure, not success.
- Source-quality content is preserved even when excluded from runtime packages.
- Generated concepts and models require real runtime verification before acceptance.
