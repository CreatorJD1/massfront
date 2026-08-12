# MASSFRONT multi-stage production plan

## Operating rules

- Root integrates shared systems, resolves conflicts, captures final mobile QA, and owns releases.
- Specialist agents work in parallel on bounded stages and do not publish independently.
- Every verification batch is capped at 120 seconds. Broader suites are split into focused batches.
- A stage closes only after its source bundle, focused smoke test, mobile-safe layout check, and in-game PNG pass.
- Canonical factions remain Nova Federation, Red Ascendancy, Syndicate Coalition, and Brood Swarm. Reference labels such as Terran Frontline Command, Crimson Dominion, Machine Ascendancy/Emerald Triad, and Infestation/Void Swarm are art-direction aliases, not extra factions.

## Stage 0 — Baseline lock

Protect account/cloud resolution, portable save files, updater behavior, tutorial state, Android back behavior, safe-area padding, unit separation, faction identity, and audio routing with focused regression tests.

Status: complete.

## Stage 1 — Battlefield intelligence

- True current vision and persistent explored terrain.
- Enemy entities, effects, health bars, selection, and minimap information hidden until scouted.
- Five-rarity battlefield pickups and temporary scan rewards.
- Radio/action confirmations with overlap limits.
- Unit and defensive-structure previews driven by the live damage matrices.

Status: complete.

## Stage 2 — Maps and hazards

Owner: map/hazards agent.

- Mobile-safe battlefield scale presets.
- Fair player and AI spawn placement.
- Vision-reducing storms with advance warning.
- Telegraph-driven unstable and collapsing terrain.
- Resource sites and tactical salvage routes.
- Map-setting controls that explain performance and gameplay impact.

## Stage 3 — Faction production art

Owner: faction-art agent.

- A complete unit/building production matrix for all four factions.
- Distinct silhouette, material, movement, projectile, commander, and deployment language.
- Faction-specific towers and production structures in three readable tiers.
- Mobile LOD, baked-detail/PBR atlas targets, clean UVs, hollow barrels, and live preview coverage.
- In-engine contact sheets are generated from current runtime models, never stale icons.

## Stage 4 — RTS and tower-defense gameplay

Owner: root with reassigned gameplay agents after Stages 2–3.

- Defensive layers, tower roles, upgrade branches, repair and shielding support.
- Formation-aware move/attack/patrol behavior and visible waypoint loops.
- Explicit weapon/armor counter balance with test scenarios.
- Economy pacing, harvestable sites, research protection, mission rewards, and anti-snowball buffers.

## Stage 5 — Meta and interface

Owner: progression/UX agent.

- Touch-first Operations activity log with mission categories.
- Categorized doctrine research rather than one oversized list.
- Mission briefing/debriefing with portraits, objectives, bonuses, rewards, and collected resources.
- Five-rarity inventory, equipment, consumables, components, and later crafting hooks.
- Context panels show live models, purpose, costs, prerequisites, and matchup symbols.

## Stage 6 — Content and onboarding

- First-time guided operation that teaches deployment, economy, production, defense, commander identity, formations, and victory.
- Guidance tapers progressively instead of disappearing after one tooltip.
- Mission families, dynamic hazards, optional objectives, and repeatable rewards.

## Stage 7 — Performance and release

- Split sub-two-minute regression batches.
- Independent in-app browser QA at representative phone viewports.
- Android packaging, signing, install verification, updater payload, and rollback verification.
- Publish optional full soundtrack pack separately from the lightweight offline build.
- Produce APK, web playtest update, release notes, hashes, and iOS cloud-build handoff without claiming an unsigned IPA is installable.

