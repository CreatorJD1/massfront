/* --------------------------------------------------------------------------
   MASSFRONT — AUTHORED THREE-SYSTEM SHOWCASE

   Runtime scene data is deliberately separate from the persistent domain
   catalog.  These records describe what the renderer needs; discoveries and
   depletion live in the versioned store and are joined by stable IDs.
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
        discoverySiteIds: ['caldris_pelagic_archive', 'caldris_alloy_shelf'],
        mineralDeposits: [
          { id: 'caldris_alloy_shelf', type: 'alloys', amount: 620, x: 0.31, y: -0.18 },
          { id: 'caldris_pelagic_archive', type: 'researchPoints', amount: 180, x: -0.37, y: 0.42 }
        ]
      },
      {
        id: 'aelos_ithara', name: 'Ithara', biome: 'golden_jade',
        sub: 'TEMPERATE SUPER-EARTH · DIPLOMATIC RESERVE', radius: 22,
        orbitDist: 345, orbitSpeed: 0.00082, orbitAngle: 2.7,
        color: '#443820', veinColor: '#52e6c4', atmosphereColor: '#758b7b', ringColor: '#64756f', rings: true,
        discoverySiteIds: ['ithara_embassy_signal'],
        mineralDeposits: [
          { id: 'ithara_embassy_signal', type: 'components', amount: 410, x: 0.12, y: 0.35 }
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
    description: 'A lensing scar surrounded by ancient wreckage, scarce research sites, and unstable approach corridors.',
    planets: [
      {
        id: 'veyra_orison', name: 'Orison', biome: 'volcanic',
        sub: 'TIDALLY LOCKED RELIC WORLD · ACTIVE SHEAR', radius: 20,
        orbitDist: 255, orbitSpeed: 0.0025, orbitAngle: 0.82,
        color: '#170b08', veinColor: '#ff6f32', atmosphereColor: '#765340', rings: false,
        discoverySiteIds: ['orison_drive_fragment', 'orison_bio_vault'],
        mineralDeposits: [
          { id: 'orison_drive_fragment', type: 'researchPoints', amount: 360, x: 0.16, y: 0.28 },
          { id: 'orison_bio_vault', type: 'bioSamples', amount: 210, x: -0.42, y: -0.12 }
        ]
      },
      {
        id: 'veyra_nacre', name: 'Nacre', biome: 'cyber_purple',
        sub: 'CRYOVOLCANIC MOON · ANCIENT TRANSMISSION', radius: 16,
        orbitDist: 382, orbitSpeed: 0.0011, orbitAngle: 3.94,
        color: '#160b2e', veinColor: '#bf63ff', atmosphereColor: '#756c83', ringColor: '#6b6575', rings: true, isScanning: true,
        discoverySiteIds: ['nacre_cartography_core'],
        mineralDeposits: [
          { id: 'nacre_cartography_core', type: 'components', amount: 540, x: 0.43, y: -0.38 }
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
        id: 'veyra_aelos_gate', name: 'Aelos Phase Gate', kind: 'relay',
        sub: 'UGA ANCHORAGE TRANSIT', dist: 302, angle: 4.68,
        interaction: 'system-jump', jumpTo: 'aelos'
      },
      {
        id: 'veyra_karak_gate', name: 'Karak Phase Gate', kind: 'relay',
        sub: 'COLONY ROUTE · RESPONSE DELAY 19 HOURS', dist: 328, angle: 5.68,
        interaction: 'system-jump', jumpTo: 'karak'
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
    description: 'An abruptly silent colony system where missing traffic, broken relays, and biological contamination reveal a major Brood infestation.',
    planets: [
      {
        id: 'karak_meridian', name: 'Meridian K-4', biome: 'terrestrial',
        sub: 'COLONY WORLD · ALL NETWORKS SILENT', radius: 27,
        orbitDist: 230, orbitSpeed: 0.00105, orbitAngle: 1.35,
        color: '#14283a', veinColor: '#db273f', atmosphereColor: '#7c5960', rings: false, isScanning: true,
        discoverySiteIds: ['meridian_lost_transponder', 'meridian_hive_complex'],
        mineralDeposits: [
          { id: 'meridian_lost_transponder', type: 'researchPoints', amount: 420, x: -0.21, y: 0.36 },
          { id: 'meridian_hive_complex', type: 'bioSamples', amount: 330, x: 0.39, y: -0.19 }
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
      }
    ]
  }
});

export const SHOWCASE_LAYOUT = Object.freeze({
  clusters: {
    'Sombrero-I · UGA Anchorage': { color: '#42d8ff', center: { x: -190, y: 55, z: 35 } },
    'Andromeda-IV · Cinder Reach': { color: '#ffae45', center: { x: 20, y: 40, z: 210 } },
    'Orion Arc · Hesper Line': { color: '#ef435f', center: { x: 205, y: -75, z: -35 } }
  },
  systems: {
    aelos: { coord: { x: -190, y: 55, z: 35 }, relays: ['veyra'] },
    veyra: { coord: { x: 20, y: 40, z: 210 }, relays: ['aelos', 'karak'] },
    karak: { coord: { x: 205, y: -75, z: -35 }, relays: ['veyra'] }
  }
});
