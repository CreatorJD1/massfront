# MASSFRONT post-1.33.49 master plan

> **Superseded 2026-08-31.** This is a historical post-1.33.49 snapshot. Use
> [`MASTER_PLAN.md`](MASTER_PLAN.md), [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md),
> [`REMAINING_WORK.md`](REMAINING_WORK.md), and
> [`RELEASE_STATUS.md`](RELEASE_STATUS.md) for current authority.

Plan owner: Jason  
Created: 2026-08-30  
Applies after: the 1.33.49 release checkpoint  
Authority: this is the ordered plan for work intentionally remaining after
1.33.49. It does not rewrite the historical 18-stage plan or claim that an
unverified item was completed.

## Release boundary

Version 1.33.49 is currently a locally built release candidate, not a live
release. Publishing, OTA activation, store submission, production flags, and
production data changes still require Jason's explicit approval. If 1.33.49 is
released with an item below unfinished, that item is an explicit deferral into
this plan rather than an implied pass.

## Product decisions carried forward

- Standard/Classic, Campaign, and Co-op Versus remain player-selectable modes.
- MASSFRONT supports offline standard play and an MMO-connected mode without
  replacing the core main menu.
- The War Table entry becomes **START MASSFRONT** and routes into the unified
  mode flow. Galactic Exploration adds its screens and game modes to the main
  game instead of booting a disconnected replacement application.
- A new game opens with a short world-introduction sequence, then a basic
  planet-side RTS tutorial. Players may skip it. Afterward they choose a
  faction and receive that faction's starter **Commander 1** before entering
  space aboard the UGA ship.
- Keel is UGA. Keel provides contextual hints throughout sessions and must not
  be presented as Nova or as a member of another playable faction.
- Commander/Keel portraits, animation, and voice presentations must never make
  the minimap flicker. Tactical RTS dialogue may temporarily use a stable
  reserved comms frame near the minimap; normal exploration uses a dedicated
  non-tactical conversation location.
- Ship cutaway management uses a full side profile, not the current angled
  presentation.
- The 327 accepted Stage 10 models are locked. They may be integrated,
  optimized, cleaned, UV-cubed where required, and texture-corrected, but not
  regenerated or aesthetically substituted. Rejected assets remain excluded.
- UI direction is image-, motion-, and interaction-first. Long text is moved
  behind progressive disclosure. Art of War 3 is a quality reference only;
  its protected art and interface are not copied.
- Smoke Desert content is optional and is not a dependency for a release.

## Ordered remaining work

### 01 — Expand the accepted multiplayer baseline

Goal: build beyond the Stage 15 release baseline without destabilizing it.

- Preserve the shipped two-player PvP and two-to-four-player Co-op paths.
- Add typed cancellation, rally, repeat-queue, jump, and remaining specialized
  ability commands where they improve shared-control play.
- Design a broader global team/seat simulation before offering three- or
  four-seat PvP; never alias extra players onto the wrong army.
- Add matchmaking/MMO population services only behind moderation, capacity,
  observability, rollback, and staged rollout controls.
- Run ongoing packaged-device soak and latency/loss simulation against the
  exact release identity.

Acceptance: the 1.33.49 modes remain deterministic and compatible while every
new layout or command is separately proven and fails closed before acceptance.

### 02 — Reconcile original gameplay-stage acceptance debt

Goal: replace ambiguous historical status for original Stages 2–6 and 8 with
current-source evidence.

- Navigation, formation, blockers, naval goals, and per-Commander 500-unit cap.
- Projectiles, turrets, charge weapons, singularity behavior, beams, trails,
  intelligence contacts, and utility jobs.
- Air missions and air targeting.
- Commander roster, identity, voice routing, and Deployment Arena.
- Faction VFX, terrain response, readability, and approved gore settings.

Acceptance: one current-source ledger per delivery stage, with automated
mechanics checks plus visual evidence where rendering is part of the claim.

### 03 — Physical mobile acceptance and performance

Goal: close the evidence that desktop hardware emulation cannot provide.

- Galaxy S25 Ultra sustained 1v1 through 1v4 tests, including the 2,500-unit
  maximum scenario.
- Safe areas, touch targets, thermal behavior, memory pressure, recovery,
  suspend/resume, and rotation checks on physical Android hardware.
- Equivalent iPhone/iPad safe-area, WebGL, audio, suspend/resume, and package
  checks before an iOS store claim.
- Capture source identity, settings, duration, percentile frame times, memory,
  and screenshots for every accepted run.

Acceptance: the physical-device matrix passes against the exact candidate
package; failures become measured fixes rather than waived checks.

### 04 — Finish audio content acceptance

Goal: turn the technically complete dual-codec audio pipeline into approved
player-facing content.

- Approve final masters and provenance.
- Close the remaining voice-performance/content blockers.
- Verify loudness, ducking, subtitles, faction identity, music transitions,
  speaker playback, and headphones on physical devices.
- Keep AAC and Vorbis pairs intact; neither format is redundant.

Acceptance: content approval plus physical speaker/headphone evidence with no
missing codec fallback.

### 05 — Complete unified Galactic Exploration

Goal: make Galactic Exploration part of MASSFRONT rather than a separate demo.

- Preserve the main menu and replace the War Table call to action with
  **START MASSFRONT**.
- Wire Standard/Classic, Campaign, Co-op Versus, and connected MMO paths into
  one coherent mode flow.
- Start with the world-introduction art/cutscene and planet-side tutorial, not
  inside the ship cutaway.
- Implement skip-tutorial, faction choice, Commander 1 award, and transition
  into the UGA ship/space layer.
- Use the full side-view ship cutaway and connect every finished room,
  submenu, resource, mission, and return path.
- Keep unfinished content visibly locked or absent; no dead controls.

Acceptance: a fresh profile and a returning profile can traverse every
supported route without leaving the main game shell or losing state.

### 06 — Rebuild tutorial and contextual guidance

Goal: teach navigation and basic RTS play with minimal reading.

- Teach camera navigation, selection, movement, attack, construction,
  production, economy, objectives, and extraction through short playable
  actions.
- Let the player skip cleanly without losing required starter state.
- Make UGA Keel's hints contextual, rate-limited, dismissible, subtitle-safe,
  and non-blocking.
- Separate tactical comms placement from exploration dialogue placement.

Acceptance: first-time comprehension tests succeed without requiring an
external guide; skip and resume paths produce the same valid post-tutorial
profile state.

### 07 — Image-, animation-, and dynamic-UI pass

Goal: replace the current text-heavy presentation with a polished mobile RTS
interface.

- Replace paragraph-heavy mode, mission, faction, commander, research, and
  exploration screens with illustrated cards, animated previews, map motion,
  icon-led state, and short labels.
- Use progressive disclosure for lore and detailed statistics.
- Add responsive transitions and feedback without hiding state or increasing
  input latency.
- Establish a consistent visual hierarchy, typography scale, icon family,
  faction color system, loading treatment, and reduced-motion mode.
- Re-test phone portrait, phone landscape, tablet, desktop, and accessibility
  settings.

Acceptance: all major menus and submenus pass visual, interaction, overflow,
touch, and reduced-motion review; no primary task depends on reading a dense
paragraph.

### 08 — Integrate accepted world models and control optional-pack cost

Goal: use the locked Stage 10 library in gameplay without bloating the base
installer.

- Place accepted models through deterministic world/site manifests rather
  than hard-coded scene edits.
- Preserve lazy loading and keep the optional Galactic pack outside the base
  APK/OTA payload.
- Establish an owner-approved optional-pack download and installed-size
  budget, then measure against it.
- Verify PBR channels, texture residency/fallback quality, collision, LOD,
  z-fighting, UV stretch, and construction visibility only where each model is
  actually used.

Acceptance: no rejected model is referenced, no accepted model is regenerated,
and every shipped placement has bounded memory, collision, and fallback proof.

### 09 — Exploration characters for small rooms

Goal: add people only where they improve small-scale room storytelling.

- Use VRoid and other creator-approved character tools later for compact room
  encounters, conversations, and crew presence—not for major RTS battlefield
  sections.
- Define mobile polygon, material, texture, rig, animation, voice, and crowd
  budgets before importing characters.
- Preserve UGA/faction identity and lore-bible canon.

Acceptance: characters meet the room budget, animate correctly on target
devices, and do not change large-scale RTS readability or performance.

### 10 — Repair source retention and release history

Goal: close the Stage 16 retention gate without deleting recoverable material.

- Repair legacy release pointer/hash drift and reconcile local/remote artifact
  identity.
- Re-run the preservation fixtures before any cleanup.
- Classify source, accepted runtime art, rejected work, generated evidence,
  caches, and release products with an auditable retention decision.
- Prune only after the ledger proves the exact targets are recoverable or
  disposable.

Acceptance: preservation checks pass and every deletion has a specific ledger
entry and recovery status.

### 11 — Lore-aware visual development tools

Goal: let Jason edit levels and placement visually after the game plan is
stable.

- Treat the lore bible as authoritative for names, factions, locations,
  chronology, characters, and allowed relationships.
- Provide visual placement, transform, snapping, layer, spawn, objective,
  pathing, collision, lighting, and validation tools.
- Save deterministic edit manifests instead of rewriting source GLBs.
- Show mobile budgets, missing dependencies, illegal references, overlap, and
  route blockers before export.
- Produce a reviewable handoff package; Hugging Face submission remains an
  explicit user-approved action.

Acceptance: an edit can round-trip from game state to editor to deterministic
manifest to local preview, with lore and runtime validation passing before an
HF handoff is offered.

### 12 — Release and live-operations closure

Goal: ship each future version as one identifiable build across every approved
channel.

- Bundle, package, verify hardware WebGL, run compatibility/adversarial gates,
  and produce immutable hashes.
- Upload immutable artifacts first, verify them remotely, and activate the live
  updater last.
- Keep browser, OTA, APK, stores, source handoff, and Space versions aligned or
  explicitly record every skipped channel.
- Activate multiplayer/MMO capabilities only after their own acceptance and
  explicit approval.

Acceptance: the five-channel checklist passes, the live manifest points only
to verified immutable bytes, rollback remains available, and the published
version matches the tested package identity.

## Priority order after 1.33.49

1. Multiplayer expansion and original-stage acceptance debt.
2. Physical S25/iOS and audio acceptance.
3. Unified Galactic Exploration and the rebuilt tutorial.
4. Image/motion-first UI overhaul.
5. Accepted-model placement and optional-pack budgeting.
6. Small-room characters, source-retention repair, and visual development
   tools.
7. Future channel releases and separately approved live-service activation.

Work may run in parallel where file ownership is safe, but acceptance follows
this dependency order. No later visual polish is allowed to conceal a failed
simulation, device, content, or release gate.
