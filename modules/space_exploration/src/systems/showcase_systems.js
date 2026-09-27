/* --------------------------------------------------------------------------
   MASSFRONT — AUTHORED SHOWCASE STAR CHART

   Runtime scene data is deliberately separate from the persistent domain
   catalog.  These records describe what the renderer needs; discoveries and
   depletion live in the versioned store and are joined by stable IDs.

   The chart carries the four War Table stellar systems alongside the frontier
   systems, so the homeworlds the player knows from the base game's galaxy are
   the same places here — same star, same capital world, same POI names.
   -------------------------------------------------------------------------- */

export const SHOWCASE_SYSTEMS = Object.freeze({
  aelos: {
    id: 'aelos',
    name: 'Aelos',
    cluster: 'Sombrero-I · UGA Anchorage',
    security: 'UGA CONTROL · CIVILIAN CORRIDOR',
    starColor: '#ffd7a3',
    hasAsteroidBelt: false,
    description: 'The inhabited embarkation system surrounding NEXUS-VII, resident-faction embassies, and regulated traffic lanes.',
    planets: [
      {
        id: 'aelos_caldris', name: 'Caldris', biome: 'terrestrial',
        sub: 'OCEANIC HABITAT · UGA BIOSPHERE PRESERVE', radius: 28,
        orbitDist: 205, orbitSpeed: 0.0012, orbitAngle: 0.55,
        color: '#0b3150', veinColor: '#34c9d8', atmosphereColor: '#4f8997', rings: false, isScanning: true,
        discoverySiteIds: ['caldris_pelagic_archive', 'caldris_alloy_shelf', 'caldris_capitol_vector'],
        mineralDeposits: [
          { id: 'caldris_alloy_shelf', type: 'alloys', amount: 620, x: 0.31, y: -0.18 },
          { id: 'caldris_pelagic_archive', surveyId: 'aelos_phase_trace', name: 'Outer Relay Phase Trace', type: 'researchPoints', amount: 180, x: -0.37, y: 0.42 },
          { id: 'caldris_capitol_vector', surveyId: 'aelos_capitol_vector', name: 'Capitol Vector Fix', type: 'components', amount: 120, x: 0.05, y: -0.45 }
        ]
      },
      {
        id: 'aelos_ithara', name: 'Ithara', biome: 'golden_jade',
        sub: 'TEMPERATE SUPER-EARTH · DIPLOMATIC RESERVE', radius: 22,
        orbitDist: 345, orbitSpeed: 0.00082, orbitAngle: 2.7,
        color: '#443820', veinColor: '#52e6c4', atmosphereColor: '#758b7b', ringColor: '#64756f', rings: true,
        discoverySiteIds: ['ithara_embassy_signal'],
        mineralDeposits: [
          { id: 'ithara_embassy_signal', surveyId: 'aelos_traffic_census', name: 'Orbital Traffic Census', type: 'components', amount: 410, x: 0.12, y: 0.35 }
        ]
      },
      {
        /* Zephyros is the authored gas_air host world (stage-10 canon slot 7):
           an outer Aelos fuel giant reserved for air-only ops, so it carries
           scannable deposits but no ground area, no survey rung and — until
           the air theatre ships — no runtime template. The Tethys-Foundry
           pattern: last rung of the planet ladder, deposits only. */
        id: 'aelos_zephyros', name: 'Zephyros', biome: 'gas',
        sub: 'AURELIAN FUEL GIANT · ATMOSPHERIC HARVEST BAN', radius: 36,
        orbitDist: 470, orbitSpeed: 0.00058, orbitAngle: 4.9,
        color: '#123349', veinColor: '#7fd8e8', atmosphereColor: '#8fb3bd', ringColor: '#5d7a86', rings: true,
        discoverySiteIds: ['zephyros_jetstream_geode'],
        mineralDeposits: [
          { id: 'zephyros_jetstream_geode', name: 'Jetstream Geode Cache', type: 'components', amount: 640, x: 0.21, y: 0.26 }
        ]
      }
    ],
    contacts: [
      {
        id: 'aelos_embassy_spindle', name: 'Concord Spindle', kind: 'station',
        sub: 'NOVA · DOMINION · SYNDICATE RESIDENCY OFFICES', dist: 145, angle: 1.28,
        interaction: 'faction-residency'
      },
      {
        id: 'aelos_logistics_array', name: 'Peregrine Logistics Array', kind: 'fuel',
        sub: 'FUEL · PROBES · EXPEDITION SUPPLY', dist: 178, angle: 4.92,
        interaction: 'logistics'
      },
      {
        id: 'aelos_veyra_gate', name: 'Veyra Phase Gate', kind: 'relay',
        sub: 'AUTHORIZED FRONTIER TRANSIT', dist: 285, angle: 3.62,
        interaction: 'system-jump', jumpTo: 'veyra'
      },
      {
        id: 'aelos_sombrero_gate', name: 'Sombrero Capitol Gate', kind: 'relay',
        sub: 'FRONTLINE PRIME TRANSIT', dist: 320, angle: 5.55,
        interaction: 'system-jump', jumpTo: 'sombrero_i'
      }
    ]
  },

  veyra: {
    id: 'veyra',
    name: 'Veyra',
    cluster: 'Andromeda-IV · Cinder Reach',
    security: 'FRONTIER CAUTION · GRAVITIC SHEAR',
    isBlackHole: true,
    hasAsteroidBelt: true,
    // Belt lanes are declared per system — see engine loadSystemBodies. Veyra
    // has no star to light rock (sunLight sits unused at origin), so a lane
    // crossing a planet reads as a halo of teal-lit orbs instead of a belt.
    // 128-148 clears Nacre (orbitDist 382), the singularity (r24 disk at 105),
    // and the innermost contact (Archive Hulk at 164).
    asteroidBelt: { radius: 138, width: 20 },
    description: 'A lensing scar surrounded by ancient wreckage, scarce research sites, and unstable approach corridors.',
    planets: [
      {
        id: 'veyra_orison', name: 'Orison', biome: 'volcanic',
        sub: 'TIDALLY LOCKED RELIC WORLD · ACTIVE SHEAR', radius: 20,
        orbitDist: 255, orbitSpeed: 0.0025, orbitAngle: 0.82,
        color: '#170b08', veinColor: '#ff6f32', atmosphereColor: '#765340', rings: false,
        discoverySiteIds: ['orison_drive_fragment', 'orison_bio_vault', 'orison_cinder_ephemeris'],
        mineralDeposits: [
          { id: 'orison_drive_fragment', surveyId: 'veyra_derelict_echo', name: 'Derelict Distress Echo', type: 'researchPoints', amount: 360, x: 0.16, y: 0.28 },
          { id: 'orison_bio_vault', type: 'bioSamples', amount: 210, x: -0.42, y: -0.12 },
          { id: 'orison_cinder_ephemeris', surveyId: 'veyra_cinder_reach_fix', name: 'Cinder Reach Ephemeris', type: 'components', amount: 150, x: 0.45, y: 0.05 }
        ]
      },
      {
        id: 'veyra_nacre', name: 'Nacre', biome: 'cyber_purple',
        sub: 'CRYOVOLCANIC MOON · ANCIENT TRANSMISSION', radius: 16,
        orbitDist: 382, orbitSpeed: 0.0011, orbitAngle: 3.94,
        color: '#160b2e', veinColor: '#bf63ff', atmosphereColor: '#756c83', ringColor: '#6b6575', rings: true, isScanning: true,
        discoverySiteIds: ['nacre_cartography_core'],
        mineralDeposits: [
          { id: 'nacre_cartography_core', surveyId: 'veyra_photon_ring', name: 'Photon-Ring Spectrography', type: 'components', amount: 540, x: 0.43, y: -0.38 }
        ]
      }
    ],
    contacts: [
      {
        id: 'veyra_archive_hulk', name: 'Archive Hulk KX-19', kind: 'derelict',
        sub: 'SEALED PRE-UGA RESEARCH VESSEL', hazard: true, dist: 164, angle: 2.45,
        interaction: 'discovery', siteId: 'veyra_archive_hulk'
      },
      {
        id: 'veyra_cinder_barge', name: 'Cinder Salvage Barge', kind: 'derelict',
        sub: 'LENS-SHEAR WRECK · CREW EVAPORATED AT ANCHOR', hazard: true, dist: 226, angle: 1.35,
        interaction: 'discovery'
      },
      {
        id: 'veyra_aelos_gate', name: 'Aelos Phase Gate', kind: 'relay',
        sub: 'UGA ANCHORAGE TRANSIT', dist: 302, angle: 4.68,
        interaction: 'system-jump', jumpTo: 'aelos'
      },
      {
        id: 'veyra_karak_gate', name: 'Karak Phase Gate', kind: 'relay',
        sub: 'COLONY ROUTE · RESPONSE DELAY 19 HOURS', dist: 328, angle: 5.68,
        interaction: 'system-jump', jumpTo: 'karak'
      },
      {
        id: 'veyra_andromeda_gate', name: 'Andromeda Phase Gate', kind: 'relay',
        sub: 'FURNACE STAR TRANSIT · DOMINION CHARTERED', dist: 342, angle: 0.9,
        interaction: 'system-jump', jumpTo: 'andromeda_iv'
      }
    ]
  },

  karak: {
    id: 'karak',
    name: 'Karak',
    cluster: 'Orion Arc · Hesper Line',
    security: 'DISTRESS STATE · TRAFFIC SILENCE',
    starColor: '#ff9a62',
    hasAsteroidBelt: true,
    // Karak: Meridian (230, r27) and its Colony Spine (150) rule the inside;
    // Tethys (356) and the outer gates (310/336/352) rule the outside. The
    // only clear lane is 257-310 between Meridian and the return corridor.
    asteroidBelt: { radius: 284, width: 24 },
    description: 'An abruptly silent colony system where missing traffic, broken relays, and biological contamination reveal a major Brood infestation.',
    planets: [
      {
        id: 'karak_meridian', name: 'Meridian K-4', biome: 'terrestrial',
        sub: 'COLONY WORLD · ALL NETWORKS SILENT', radius: 27,
        orbitDist: 230, orbitSpeed: 0.00105, orbitAngle: 1.35,
        color: '#14283a', veinColor: '#db273f', atmosphereColor: '#7c5960', rings: false, isScanning: true,
        discoverySiteIds: ['meridian_lost_transponder', 'meridian_hive_complex', 'meridian_grid_triangulation'],
        mineralDeposits: [
          { id: 'meridian_lost_transponder', surveyId: 'karak_silent_beacons', name: 'Silent Beacon Triangulation', type: 'researchPoints', amount: 420, x: -0.21, y: 0.36 },
          { id: 'meridian_hive_complex', surveyId: 'karak_hive_scan', name: 'Subsurface Hive Tomography', type: 'bioSamples', amount: 330, x: 0.39, y: -0.19 },
          { id: 'meridian_grid_triangulation', surveyId: 'karak_grid_triangulation', name: 'League Grid Triangulation', type: 'components', amount: 180, x: 0.0, y: 0.15 }
        ]
      },
      {
        id: 'karak_tethys', name: 'Tethys Foundry', biome: 'volcanic',
        sub: 'AUTOMATED EXTRACTION WORLD · EMERGENCY SHUTDOWN', radius: 19,
        orbitDist: 356, orbitSpeed: 0.00076, orbitAngle: 4.24,
        color: '#21100a', veinColor: '#ff7f2b', atmosphereColor: '#725945', ringColor: '#76634f', rings: true,
        discoverySiteIds: ['tethys_component_cache'],
        mineralDeposits: [
          { id: 'tethys_component_cache', type: 'components', amount: 780, x: 0.18, y: 0.23 }
        ]
      }
    ],
    contacts: [
      {
        id: 'karak_colony_spine', name: 'Karak Colony Spine', kind: 'station',
        sub: 'NO LIFE-SUPPORT TELEMETRY · QUARANTINE', hazard: true, dist: 154, angle: 0.62,
        interaction: 'brood-intelligence', siteId: 'karak_colony_spine'
      },
      {
        id: 'karak_lifeboat_field', name: 'Lifeboat Debris Field', kind: 'derelict',
        sub: 'MULTIPLE EMPTY CRAFT · ORGANIC RESIDUE', hazard: true, dist: 190, angle: 2.88,
        interaction: 'discovery', siteId: 'karak_lifeboat_field'
      },
      {
        id: 'karak_veyra_gate', name: 'Veyra Phase Gate', kind: 'relay',
        sub: 'RETURN CORRIDOR · DEGRADED', dist: 310, angle: 4.82,
        interaction: 'system-jump', jumpTo: 'veyra'
      },
      {
        id: 'karak_orion_gate', name: 'Orion Phase Gate', kind: 'relay',
        sub: 'GRID SUN TRADE SPUR · SYNDICATE TOLLED', dist: 336, angle: 1.75,
        interaction: 'system-jump', jumpTo: 'orion_arc'
      },
      {
        id: 'karak_helios_gate', name: 'Helios Quarantine Gate', kind: 'relay',
        sub: 'BROOD ORIGIN CORRIDOR · SEALED', hazard: true, dist: 352, angle: 2.9,
        interaction: 'system-jump', jumpTo: 'helios_core'
      }
    ]
  },

  sombrero_i: {
    id: 'sombrero_i',
    name: 'Sombrero-I',
    cluster: 'Sombrero-I · UGA Anchorage',
    security: 'UGA CORE · CAPITOL TRAFFIC CONTROL',
    starColor: '#55e9ff',
    hasAsteroidBelt: false,
    description: 'The capital star system of FRONTLINE PRIME: Nova\u2019s homeworld of Aelos, the Command Circumference, and the lanes the UGA was built to hold.',
    planets: [
      {
        id: 'sombrero_aelos', name: 'Aelos', biome: 'terrestrial',
        sub: 'ULTRAMARINE TERRAN CAPITAL WORLD · UGA CORE', radius: 30,
        orbitDist: 225, orbitSpeed: 0.00095, orbitAngle: 1.05,
        color: '#0d2f52', veinColor: '#4fd2ff', atmosphereColor: '#6fb6d8', rings: false,
        discoverySiteIds: ['aelos_heartland_foundry', 'aelos_port_admiralty', 'aelos_divide_gate'],
        mineralDeposits: [
          { id: 'aelos_heartland_foundry', name: 'Heartland Foundry', type: 'alloys', amount: 840, x: 0.22, y: -0.31 },
          { id: 'aelos_port_admiralty', name: 'Port Admiralty', type: 'components', amount: 720, x: -0.38, y: 0.18 },
          { id: 'aelos_divide_gate', name: 'Great Divide Gate', type: 'researchPoints', amount: 460, x: 0.41, y: 0.33 }
        ]
      }
    ],
    contacts: [
      {
        id: 'sombrero_high_anchorage', name: 'Concord High Anchorage', kind: 'station',
        sub: 'CAPITOL COMMAND · CIVILIAN TRAFFIC CONTROL', dist: 150, angle: 1.1,
        interaction: 'discovery', siteId: 'sombrero_command_circumference'
      },
      {
        id: 'sombrero_aelos_gate', name: 'Aelos Phase Gate', kind: 'relay',
        sub: 'UGA ANCHORAGE TRANSIT', dist: 295, angle: 3.9,
        interaction: 'system-jump', jumpTo: 'aelos'
      },
      {
        /* Frontier derelicts: one relic contact per thin system so every
           charted star carries at least one salvage mystery between its gate
           and its station. Geometry aliases the authored hulk meshes until the
           Blender pack grows unique art (see showcase_contact_ids.js). */
        id: 'sombrero_tithe_wreck', name: 'Tithe Wreck OQ-44', kind: 'derelict',
        sub: 'EMPTY TITHE CONVOY · SEALS STILL LOCKED', hazard: true, dist: 176, angle: 2.9,
        interaction: 'discovery'
      }
    ]
  },

  andromeda_iv: {
    id: 'andromeda_iv',
    name: 'Andromeda-IV',
    cluster: 'Andromeda-IV · Cinder Reach',
    security: 'DOMINION FOUNDRY · SPECTRAL OVERWATCH',
    starColor: '#ff7a45',
    hasAsteroidBelt: true,
    // Andromeda: Forge Spindle (155), Quench wreck (210) and Pyraeth
    // (262, r26 -> edge 288) leave only the 161-204 lane; the belt rides it.
    asteroidBelt: { radius: 182, width: 16 },
    description: 'The forge star of the DOMINION FURNACE: Pyraeth\u2019s obsidian foundries feed the Promethean mega-grid and every Dominion war league.',
    planets: [
      {
        id: 'andromeda_pyraeth', name: 'Pyraeth', biome: 'volcanic',
        sub: 'OBSIDIAN VOLCANIC FORGE WORLD · DOMINION FURNACE', radius: 26,
        orbitDist: 262, orbitSpeed: 0.0014, orbitAngle: 2.35,
        color: '#1c0c06', veinColor: '#ff7a30', atmosphereColor: '#8a4a2c', rings: false,
        discoverySiteIds: ['pyraeth_court_of_iron', 'pyraeth_mega_grid', 'pyraeth_ignis_dome'],
        mineralDeposits: [
          { id: 'pyraeth_court_of_iron', name: 'Court of Iron', type: 'alloys', amount: 920, x: -0.24, y: 0.27 },
          { id: 'pyraeth_mega_grid', name: 'Promethean Mega-Grid', type: 'components', amount: 760, x: 0.35, y: 0.12 },
          { id: 'pyraeth_ignis_dome', name: 'Ignis Dome Court', type: 'researchPoints', amount: 520, x: 0.08, y: -0.42 }
        ]
      }
    ],
    contacts: [
      {
        id: 'andromeda_forge_spindle', name: 'Dominion Forge Spindle', kind: 'station',
        sub: 'PROMETHEAN MEGA-GRID COMMAND', dist: 155, angle: 2.1,
        interaction: 'discovery', siteId: 'pyraeth_court_of_iron'
      },
      {
        id: 'andromeda_veyra_gate', name: 'Veyra Phase Gate', kind: 'relay',
        sub: 'CINDER REACH TRANSIT', dist: 300, angle: 5.2,
        interaction: 'system-jump', jumpTo: 'veyra'
      },
      {
        id: 'andromeda_quench_wreck', name: 'Quench-Wreck Valkyr', kind: 'derelict',
        sub: 'COOLANT-STARVED FORGE BARGE · SLAG GLAZED', hazard: true, dist: 210, angle: 3.8,
        interaction: 'discovery'
      }
    ]
  },


  orion_arc: {
    id: 'orion_arc',
    name: 'Orion Arc',
    cluster: 'Orion Arc · Hesper Line',
    security: 'SYNDICATE GRID · SKYSHIELD ACTIVE',
    starColor: '#ff3d7e',
    hasAsteroidBelt: true,
    // Orion: Skyshield station (150), Nordhall (300, r25 -> edge 275), Hesper
    // gate (305) — the clear lane is 175-205, between station and Lasher (232).
    asteroidBelt: { radius: 190, width: 28 },
    description: 'The trade star of the GRID SUN: Nordhall\u2019s citadels and skyshield arrays meter every joule and every credit crossing the league grid.',
    planets: [
      {
        id: 'orion_nordhall', name: 'Nordhall', biome: 'terrestrial',
        sub: 'AMARANTH TUNDRA OCEANIC WORLD · GRID SUN', radius: 25,
        orbitDist: 300, orbitSpeed: 0.0008, orbitAngle: 4.05,
        color: '#2b2140', veinColor: '#d66bff', atmosphereColor: '#7a6f96', ringColor: '#6b6575', rings: true,
        discoverySiteIds: ['nordhall_core_vault', 'nordhall_pale_trench', 'nordhall_archipelago_bio'],
        mineralDeposits: [
          { id: 'nordhall_core_vault', name: 'Archipelago Core Vault', type: 'researchPoints', amount: 560, x: 0.19, y: 0.41 },
          { id: 'nordhall_pale_trench', name: 'Pale Trench Reactor', type: 'components', amount: 690, x: -0.33, y: -0.14 },
          { id: 'nordhall_archipelago_bio', name: 'Skyshield Bio Shelf', type: 'bioSamples', amount: 480, x: 0.42, y: -0.28 }
        ]
      }
    ],
    contacts: [
      {
        id: 'orion_grid_citadel', name: 'Grid Citadel Relay', kind: 'station',
        sub: 'SYNDICATE SKYSHIELD COMMAND', dist: 150, angle: 0.7,
        interaction: 'discovery', siteId: 'nordhall_citadel_pinnacle'
      },
      {
        id: 'orion_karak_gate', name: 'Karak Phase Gate', kind: 'relay',
        sub: 'HESPER LINE TRANSIT', dist: 305, angle: 4.4,
        interaction: 'system-jump', jumpTo: 'karak'
      },
      {
        id: 'orion_condemned_lasher', name: 'Condemned Lasher', kind: 'derelict',
        sub: 'SKYSHIELD-TOLL RUNNER · BEAM-CUT FROM ORBIT', dist: 232, angle: 2.6,
        interaction: 'discovery'
      }
    ]
  },

  helios_core: {
    id: 'helios_core',
    name: 'Helios Core',
    cluster: 'Helios Core · Brood Space',
    security: 'BROOD HOMELAND · SWARM DIRECTIVE ACTIVE',
    starColor: '#c46bff',
    hasAsteroidBelt: false,
    description: 'The hive star of the HIVE STAR: Vespera\u2019s jungles breed under the Great Hive Spire, and every swarm the UGA has fought takes its directives from here.',
    planets: [
      {
        id: 'helios_vespera', name: 'Vespera', biome: 'cyber_purple',
        sub: 'INDIGO JUNGLE HIVE WORLD · BROOD HOMELAND', radius: 28,
        orbitDist: 245, orbitSpeed: 0.00125, orbitAngle: 5.5,
        color: '#1d1030', veinColor: '#a24bff', atmosphereColor: '#6b4a8f', rings: false,
        discoverySiteIds: ['vespera_hive_spire', 'vespera_megaforge', 'vespera_tide_relay'],
        mineralDeposits: [
          { id: 'vespera_hive_spire', name: 'Great Hive Spire', type: 'bioSamples', amount: 640, x: -0.27, y: 0.22 },
          { id: 'vespera_megaforge', name: 'Megaforge Spire', type: 'alloys', amount: 780, x: 0.31, y: -0.24 },
          { id: 'vespera_tide_relay', name: 'Tide Relay Net', type: 'components', amount: 620, x: 0.05, y: 0.43 }
        ]
      }
    ],
    contacts: [
      {
        id: 'helios_hive_spire', name: 'Great Hive Spire', kind: 'derelict',
        sub: 'BROOD HOMELAND · ACTIVE BIOMASS', hazard: true, dist: 160, angle: 1.9,
        interaction: 'brood-intelligence', siteId: 'vespera_great_hive_spire'
      },
      {
        id: 'helios_karak_gate', name: 'Karak Phase Gate', kind: 'relay',
        sub: 'CONTAINMENT CORRIDOR · QUARANTINED', dist: 315, angle: 5.5,
        interaction: 'system-jump', jumpTo: 'karak'
      },
      {
        id: 'helios_relic_spiral', name: 'Relic Spiral', kind: 'derelict',
        sub: 'PRE-COLLAPSE SHELL WHIRL · DOCKED HULLS DESICCATED', hazard: true, dist: 208, angle: 3.6,
        interaction: 'discovery'
      }
    ]
  }
});

export const SHOWCASE_LAYOUT = Object.freeze({
  clusters: {
    'Sombrero-I · UGA Anchorage': { color: '#42d8ff', center: { x: -190, y: 55, z: 35 } },
    'Andromeda-IV · Cinder Reach': { color: '#ffae45', center: { x: 20, y: 40, z: 210 } },
    'Orion Arc · Hesper Line': { color: '#ef435f', center: { x: 205, y: -75, z: -35 } },
    'Helios Core · Brood Space': { color: '#c46bff', center: { x: -55, y: -145, z: -125 } }
  },
  systems: {
    aelos: { coord: { x: -190, y: 55, z: 35 }, relays: ['veyra', 'sombrero_i'] },
    veyra: { coord: { x: 20, y: 40, z: 210 }, relays: ['aelos', 'karak', 'andromeda_iv'] },
    karak: { coord: { x: 205, y: -75, z: -35 }, relays: ['veyra', 'orion_arc', 'helios_core'] },
    sombrero_i: { coord: { x: -262, y: 118, z: -55 }, relays: ['aelos'] },
    andromeda_iv: { coord: { x: 128, y: 128, z: 108 }, relays: ['veyra'] },
    orion_arc: { coord: { x: 122, y: -152, z: -118 }, relays: ['karak'] },
    helios_core: { coord: { x: -55, y: -145, z: -125 }, relays: ['karak'] }
  }
});
