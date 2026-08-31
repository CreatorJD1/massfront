# MASSFRONT Production Concept Coverage

> Generated deterministically from `concept-catalog.v1.json`. Do not edit this report by hand.

A covered requirement has an approved source-only modeling reference with explicit biome/biodome, faction, model-intention, scale, camera, runtime-consumer, and LOD declarations; it does not imply a finished runtime asset.

## Summary

- Required cells: 37 of 42.
- Required model-intention references: 213.
- Covered by approved source concepts: 169.
- Missing but assigned to concrete planned briefs: 44.
- Missing and unbriefed: 0.

## Coverage matrix

| Biome / biodome | Faction | Status | Covered intentions | Planned gaps | Concrete brief IDs |
|---|---|---|---|---|---|
| ship-civic-biodome | uga | COVERED | hero-landmark, modular-kit, infrastructure, character, damage-state, lod-silhouette, environment-terrain | — | — |
| ship-civic-biodome | nova | COVERED | character, lod-silhouette | — | — |
| ship-civic-biodome | dominion | COVERED | character, lod-silhouette | — | — |
| ship-civic-biodome | syndicate | COVERED | character, lod-silhouette | — | — |
| ship-civic-biodome | brood | N/A | — | — | — |
| ship-civic-biodome | faction-neutral | COVERED | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | — | — |
| ship-research-industrial | uga | COVERED | hero-landmark, modular-kit, infrastructure, character, damage-state, lod-silhouette, environment-terrain | — | — |
| ship-research-industrial | nova | COVERED | character, lod-silhouette | — | — |
| ship-research-industrial | dominion | COVERED | character, lod-silhouette | — | — |
| ship-research-industrial | syndicate | COVERED | character, lod-silhouette | — | — |
| ship-research-industrial | brood | N/A | — | — | — |
| ship-research-industrial | faction-neutral | N/A | — | — | — |
| ship-expedition-staging | uga | COVERED | hero-landmark, modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| ship-expedition-staging | nova | COVERED | character, vehicle-creature, lod-silhouette | — | — |
| ship-expedition-staging | dominion | COVERED | character, vehicle-creature, lod-silhouette | — | — |
| ship-expedition-staging | syndicate | COVERED | character, vehicle-creature, lod-silhouette | — | — |
| ship-expedition-staging | brood | N/A | — | — | — |
| ship-expedition-staging | faction-neutral | N/A | — | — | — |
| verdant | uga | PLANNED | hero-landmark, modular-kit, infrastructure, character, damage-state, lod-silhouette, environment-terrain | vehicle-creature | brief_uga_four_biome_expedition_vehicles |
| verdant | nova | COVERED | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| verdant | dominion | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_dominion_verdant_arctic_vespera_contact_kit |
| verdant | syndicate | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_syndicate_verdant_ashland_vespera_contact_kit |
| verdant | brood | COVERED | modular-kit, infrastructure, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| verdant | faction-neutral | COVERED | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | — | — |
| arctic | uga | PLANNED | hero-landmark, modular-kit, infrastructure, character, damage-state, lod-silhouette, environment-terrain | vehicle-creature | brief_uga_four_biome_expedition_vehicles |
| arctic | nova | COVERED | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| arctic | dominion | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_dominion_verdant_arctic_vespera_contact_kit |
| arctic | syndicate | COVERED | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| arctic | brood | COVERED | modular-kit, infrastructure, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| arctic | faction-neutral | COVERED | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | — | — |
| ashland | uga | PLANNED | hero-landmark, modular-kit, infrastructure, character, damage-state, lod-silhouette, environment-terrain | vehicle-creature | brief_uga_four_biome_expedition_vehicles |
| ashland | nova | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_nova_ashland_vespera_contact_kit |
| ashland | dominion | COVERED | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| ashland | syndicate | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_syndicate_verdant_ashland_vespera_contact_kit |
| ashland | brood | COVERED | modular-kit, infrastructure, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| ashland | faction-neutral | COVERED | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | — | — |
| vespera | uga | PLANNED | hero-landmark, modular-kit, infrastructure, character, damage-state, lod-silhouette, environment-terrain | vehicle-creature | brief_uga_four_biome_expedition_vehicles |
| vespera | nova | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_nova_ashland_vespera_contact_kit |
| vespera | dominion | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_dominion_verdant_arctic_vespera_contact_kit |
| vespera | syndicate | PLANNED | character, lod-silhouette | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | brief_syndicate_verdant_ashland_vespera_contact_kit |
| vespera | brood | COVERED | modular-kit, infrastructure, vehicle-creature, damage-state, lod-silhouette, environment-terrain | — | — |
| vespera | faction-neutral | COVERED | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | — | — |

## Concrete missing briefs

| Brief ID | Production cells | Model intentions | Deliverable |
|---|---|---|---|
| brief_uga_four_biome_expedition_vehicles | verdant / uga, arctic / uga, ashland / uga, vespera / uga | vehicle-creature | UGA ground-operation lander, survey rover, logistics carrier, and support-drone family with Verdant, Arctic, Ashland, and Vespera contact variants and measured tactical LOD silhouettes. |
| brief_nova_ashland_vespera_contact_kit | ashland / nova, vespera / nova | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | Nova Ashland and Vespera contact adapters for foundations, roads, production structures, representative vehicles, dust/mineral accumulation, terrain blending, and damaged/wrecked states without duplicating the approved personnel base. |
| brief_dominion_verdant_arctic_vespera_contact_kit | verdant / dominion, arctic / dominion, vespera / dominion | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | Dominion Verdant, Arctic, and Vespera contact adapters for foundry foundations, roads, representative vehicles, vegetation/snow/mineral accumulation, terrain blending, and collapsed industrial states. |
| brief_syndicate_verdant_ashland_vespera_contact_kit | verdant / syndicate, ashland / syndicate, vespera / syndicate | modular-kit, infrastructure, vehicle-creature, damage-state, environment-terrain | Syndicate Verdant, Ashland, and Vespera contact adapters for concealed foundations, roads, representative vehicles/drones, terrain-matching camouflage, environmental deposits, and failing/destroyed states. |

## Approved modeling references

| Concept ID | Force / relationship role | Matrix scope | Biome / biodome axes | Faction axes | Model-intention axes | Camera / scale / consumers / LOD |
|---|---|---|---|---|---|---|
| concept_uga_nexus_vii_ship_cutaway_v1 | uga-institutional | production-matrix | ship-civic-biodome, ship-research-industrial, ship-expedition-staging | uga | hero-landmark, infrastructure, lod-silhouette | orthographic-multi-view; capital-ship; space-exploration-module, cinematic-pipeline, content-authoring; ship-hub-static (LOD0, LOD1, LOD2) |
| concept_uga_command_navigation_ops_kit_v1 | uga-institutional | production-matrix | ship-research-industrial | uga | modular-kit, infrastructure, environment-terrain | isometric-cutaway; room-and-human; space-exploration-module, cinematic-pipeline, content-authoring; interior-modular (LOD0, LOD1, LOD2) |
| concept_world_verdant_ashland_language_v1 | faction-neutral | production-matrix | verdant, ashland | faction-neutral | damage-state, environment-terrain | tactical-rts, material-board; battlefield-region; main-rts, space-exploration-module, content-authoring; terrain-material-kit (MACRO, MATERIAL, MICRO) |
| concept_world_environment_modular_kit_v1 | faction-neutral | production-matrix | verdant, arctic, ashland, vespera | faction-neutral | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | tilted-top-down-mobile-rts, orthographic-multi-view, material-board; battlefield-region; main-rts, space-exploration-module, content-authoring; world-modular-kit (LOD0, LOD1, LOD2) |
| concept_nexus_vii_deck_c_biodome_civic_v1 | uga-institutional | production-matrix | ship-civic-biodome | uga | hero-landmark, modular-kit, infrastructure, environment-terrain | isometric-cutaway, orthographic-multi-view, material-board; room-and-human; space-exploration-module, cinematic-pipeline, content-authoring; interior-modular (DISTRICT, ROOM, PROP) |
| concept_nova_aelos_verdant_arctic_model_sheet_v1 | resident-playable | production-matrix | verdant, arctic | nova | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | orthographic-multi-view, character-turnaround, material-board; structure-family; main-rts, space-exploration-module, cinematic-pipeline, content-authoring; rts-instanced (LOD0, LOD1, LOD2) |
| concept_dominion_pyraeth_ashland_model_sheet_v1 | resident-playable | production-matrix | ashland | dominion | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | orthographic-multi-view, character-turnaround, material-board; structure-family; main-rts, space-exploration-module, cinematic-pipeline, content-authoring; rts-instanced (LOD0, LOD1, LOD2) |
| concept_syndicate_nordhall_arctic_model_sheet_v1 | resident-playable | production-matrix | arctic | syndicate | modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | orthographic-multi-view, character-turnaround, material-board; structure-family; main-rts, space-exploration-module, cinematic-pipeline, content-authoring; rts-instanced (LOD0, LOD1, LOD2) |
| concept_brood_vespera_ashland_verdant_model_sheet_v1 | hostile-ai | production-matrix | verdant, ashland | brood | modular-kit, infrastructure, vehicle-creature, damage-state, lod-silhouette, environment-terrain | orthographic-multi-view, tactical-rts, material-board; structure-family; main-rts, space-exploration-module, cinematic-pipeline, content-authoring; rts-instanced (LOD0, LOD1, LOD2) |
| concept_brood_galactic_enemy_ecology_model_sheet_v1 | hostile-ai | production-matrix | verdant, arctic, ashland, vespera | brood | modular-kit, infrastructure, vehicle-creature, damage-state, lod-silhouette, environment-terrain | orthographic-multi-view, tilted-top-down-mobile-rts, tactical-rts, material-board; structure-family; main-rts, space-exploration-module, cinematic-pipeline, content-authoring; rts-instanced (LOD0, LOD1, LOD2) |
| concept_uga_expedition_specialist_turnaround_v1 | uga-institutional | production-matrix | ship-expedition-staging | uga | character, lod-silhouette | orthographic-multi-view, character-turnaround, portrait-three-quarter; human-full-body; space-exploration-module, cinematic-pipeline, commander-portrait, content-authoring; character-cinematic (LOD0_25000_40000, LOD1_8000_12000, LOD2_2500_3000) |
| concept_nexus_vii_deck_b_research_industrial_v1 | uga-institutional | production-matrix | ship-research-industrial | uga | modular-kit, infrastructure, damage-state, environment-terrain | isometric-cutaway, orthographic-multi-view, material-board; room-and-human; space-exploration-module, cinematic-pipeline, content-authoring; interior-modular (LOD0, LOD1, LOD2) |
| concept_nexus_vii_survey_lab_v1 | uga-institutional | production-matrix | ship-research-industrial | uga | hero-landmark, modular-kit, infrastructure, lod-silhouette | isometric-cutaway, orthographic-multi-view, material-board; room-and-human; space-exploration-module, cinematic-pipeline, content-authoring; interior-modular (LOD0, LOD1, LOD2) |
| concept_nexus_vii_strike_expedition_bay_shared_base_deployer_v2 | uga-institutional, resident-playable | production-matrix | ship-expedition-staging | uga | hero-landmark, modular-kit, infrastructure, character, vehicle-creature, damage-state, lod-silhouette, environment-terrain | isometric-cutaway, orthographic-multi-view, tactical-rts; room-and-human; space-exploration-module, main-rts, cinematic-pipeline, content-authoring; interior-modular (LOD0, LOD1, LOD2) |
| concept_biodome_habitat_typology_v1 | uga-institutional, faction-neutral | production-matrix | ship-civic-biodome, verdant, arctic, ashland, vespera | uga, faction-neutral | hero-landmark, modular-kit, infrastructure, damage-state, lod-silhouette, environment-terrain | isometric-cutaway, orthographic-multi-view, material-board; room-and-human; space-exploration-module, main-rts, cinematic-pipeline, content-authoring; interior-modular (LOD0, LOD1, LOD2) |
| concept_helmeted_human_faction_personnel_v1 | uga-institutional, resident-playable | production-matrix | ship-civic-biodome, ship-research-industrial, ship-expedition-staging, verdant, arctic, ashland, vespera | uga, nova, dominion, syndicate | character, lod-silhouette | orthographic-multi-view, character-turnaround; human-full-body; space-exploration-module, main-rts, cinematic-pipeline, commander-portrait, content-authoring; character-cinematic (LOD0, LOD1, LOD2) |
| concept_base_deployer_striker_hangar_manifests_v2 | uga-institutional, resident-playable | production-matrix | ship-expedition-staging | nova, dominion, syndicate | character, vehicle-creature, damage-state, lod-silhouette | orthographic-multi-view, tilted-top-down-mobile-rts, tactical-rts; combat-unit; space-exploration-module, main-rts, cinematic-pipeline, content-authoring; rts-instanced (LOD0, LOD1, LOD2) |
| concept_planetary_landmark_resource_library_v1 | uga-institutional, resident-playable, hostile-ai | outside-production-matrix | — | — | — | tilted-top-down-mobile-rts, tactical-rts, orthographic-multi-view; planetary-landmark; space-exploration-module, main-rts, cinematic-pipeline, content-authoring; planet-location (ORBIT, APPROACH, GROUND) |

## Deliberately outside this model matrix

- **concept_planetary_landmark_resource_library_v1 (approved source concept):** Six exploration planet families covering volcanic calderas, alien jungle organisms, cyber-purple ruins, golden-jade terraces, terrestrial relay sites, and gas/high-atmosphere platforms, with UGA institutional, three resident-playable, faction-neutral, and hostile Brood infestation overlay sockets, survey and mission objectives, resource access, pristine/scanned/exploited/damaged states, and orbit-to-ground silhouettes.
- **brief_faction_production_structures:** Four clearly distinct production-structure families: Nova, Dominion, and Syndicate player production plus hostile-AI Brood hive production, each with authored construction, powered, damaged, and destroyed reads.
- **brief_combat_vfx_damage_states:** Nova, Dominion, and Syndicate player-facing plus hostile-AI Brood impact, explosion, beam, trail, shield, scorch, crater, debris, and persistent damage-state presentation board.
- **brief_brood_hostile_encounter_containment_v1:** Non-humanoid hostile Brood encounter and containment reference for scanned organisms, quarantine specimens, breached containment, infestation damage, and enemy silhouettes. It is anomaly/hostile-event content, never resident housing, routine expedition staging, or a playable Strike Team roster.

## Rejected or superseded source concepts

- **concept_nexus_vii_strike_expedition_bay_v1:** Superseded as modeling authority by the integrated shared Base Deployer and Striker hangar v2, which fixes the room, deployment manifest, aircraft, HQ transformation, personnel, and cargo relationship in one authored bay. Replacement: concept_nexus_vii_strike_expedition_bay_shared_base_deployer_v2.
- **concept_strike_bay_faction_expedition_manifests_v1:** Rejected for canonical use because the v1 sheet presents hostile-ai Brood as a peer Strike Bay manifest column alongside playable factions. Replacement: concept_base_deployer_striker_hangar_manifests_v2.

Coverage means an approved source-only modeling reference exists for the category. It does not mean runtime geometry, textures, rigs, animation, LODs, or device QA are complete.

