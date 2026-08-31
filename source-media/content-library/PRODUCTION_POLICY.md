# MASSFRONT Content Production Policy V1

This policy separates visual direction from runtime evidence. A concept can guide shape, scale, materials, and presentation, but it is never a finished game asset by implication.

## Promotion boundary

Every runtime 3D model must link one approved concept record before the model can be marked `APPROVED` or `runtimeReady: true`.

The linked concept must have:

- A repository-relative source path.
- A verified SHA-256 digest.
- Explicit `APPROVED` concept status.
- Source-only classification.
- Camera, scale, LOD, runtime-consumer, and model-target declarations.
- `pixelUsage: concept-reference-only` and `pixelsUsedAsTexture: false`.

Generated concepts that still live outside the repository may be inventoried as `CREATED_EXTERNAL_AWAITING_INGEST`. Their measured hash can be recorded, but they cannot satisfy the runtime promotion gate until the exact file is ingested at its planned repository path and reviewed.

Concept pixels must not be cropped, projected, baked, or relabeled as model textures. Runtime albedo, normal, roughness, emissive, opacity, masks, and flipbooks are separately authored outputs with their own provenance and validation.

## Character face policy

The default character presentation is an opaque sealed helmet or opaque mask whenever `faceAnimation.enabled` is false.

A bare face, open helmet, or transparent visor is permitted only when all of the following are declared and verified:

- Facial rig.
- Animation-safe morph targets.
- Lip-sync support.
- Expression set.
- Close-up visual QA with an evidence reference.

An attractive static face is not sufficient evidence for cinematic use. If any facial-animation requirement is missing, the asset returns to the sealed-face presentation rather than shipping an unmoving visible face.

## Shared taxonomy

The same registry supports `world`, `ship`, `faction`, `character`, `interior`, `prop`, `planet-location`, and `vfx-presentation` content. Classification uses three controlled axes:

- `biomeOrBiodome`: existing MASSFRONT theme, region-kit, planet-biome, or exploration-site biome IDs.
- `faction`: canonical `uga`, `nova`, `dominion`, `syndicate`, and `brood` IDs from the current source.
- `intention`: the gameplay or presentation purpose, such as combat unit, production structure, civic/exploration space, navigation prop, world landmark, resource site, cinematic character, or damage state.

An empty biome or faction list means the axis is not applicable or intentionally cross-cutting; it must not be replaced with an invented runtime ID.

Every concept and planned brief also carries an explicit `forceRelationshipRole`:

- `uga-institutional`: UGA ship, exploration, research, and mission authority.
- `resident-playable`: Nova, Dominion, and Syndicate personnel or forces available to the player-facing roster and campaign systems.
- `faction-neutral`: environment, infrastructure, or presentation not owned by a force.
- `hostile-ai`: non-playable enemy content. Brood always maps here.

Brood is non-humanoid, AI-only, hostile to every playable faction, and the primary galactic enemy of UGA. A Brood concept or brief must never claim ship residency, humanoid personnel, a playable commander, a Strike-Team roster slot, commander-icon source, or routine civic/expedition coverage. Brood content aboard the ship is limited to clearly hostile encounter, anomaly, quarantine, containment, or breach contexts. Ground-biome Brood hives, creatures, infrastructure, destruction, and enemy LOD silhouettes remain valid.

## Production coverage matrix

Approved modeling references that fall within the core ship/battlefield matrix also declare a narrower, non-runtime `productionAxes` classification used to expose art-library gaps consistently:

- Production biome/biodome: ship civic biodome, ship research/industrial, ship expedition staging, Verdant, Arctic, Ashland, or Vespera.
- Production faction: UGA, Nova, Dominion, Syndicate, Brood, or explicit faction-neutral.
- Model intention: hero landmark, modular kit, infrastructure, character, vehicle/creature, damage state, LOD silhouette, or environment/terrain.

The complete 7×6 biome/biodome-by-faction matrix is stored in the catalog. Every applicable cell declares the model intentions it requires. A requirement is `COVERED` only when an approved source-only concept declares that exact triple. If no approved reference exists, a concrete planned brief must own the gap; otherwise validation fails with `PRODUCTION_COVERAGE_GAP_UNBRIEFED`.

Approved exploration locations or presentation sources whose real biome taxonomy falls outside those seven production categories must declare `coverageScope: outside-production-matrix` and retain their detailed canonical classification. They may not be mislabeled as Verdant, Arctic, Ashland, Vespera, or a ship district merely to improve a matrix score.

Coverage is reference coverage, not asset completion. It never implies that runtime geometry, authored textures, rigs, animation, optimized LODs, matched captures, or device QA exist. The deterministic human-readable matrix is generated at `PRODUCTION_COVERAGE.md` and checked for drift during file validation.

Rejected or canonically superseded concepts remain hashed in the source catalog for audit history but provide zero production coverage. Their evidence approval is `REJECTED`, their replacement brief is explicit, and the generated report separates them from approved references.

## Evidence and paths

Machine-local absolute paths, home-directory paths, UNC paths, and `file:` URLs are forbidden in authoritative provenance. Generated-image execution IDs may be retained for traceability, while the authoritative asset path must be repository-relative.

Planned briefs are backlog records, not completed assets. They have no source path, hash, or approval claim until art actually exists and is ingested.

## Character model sequence

1. Approve and ingest concept art.
2. Author or generate the high-density source mesh.
3. Normalize coordinates and materials in Blender.
4. Produce measured LODs.
5. Rig within the declared bone and influence budgets.
6. Author and verify animation clips.
7. Derive portraits from the approved 3D character, never from a T-pose frame.
8. Capture matched desktop and phone evidence before runtime approval.

The current `uga_anime_human_master_v1` source mesh remains rejected for runtime use and reference-only because Blender evidence exposed stretched/sliced surface topology. Its approved concept is ingested, but a clean topology rebuild, measured LODs, rig, animation, and mobile visual gates remain incomplete; automatic decimation is forbidden.
