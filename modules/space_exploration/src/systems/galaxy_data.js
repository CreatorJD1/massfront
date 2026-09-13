/* --------------------------------------------------------------------------
   MASSFRONT — GALAXY STAR SYSTEMS DATABASE
   Rich Multi-Biome Planets (Volcanic, Alien Emerald, Cyber Purple, Jade, Terrestrial)
   Mass Relays, Jump Gates, Omega Citadel, Fuel Depots, and Derelicts
   -------------------------------------------------------------------------- */

export const GALAXY_DATA = {
  sahrabarik: {
    name: 'Sahrabarik',
    cluster: 'Omega Nebula',
    security: '0.2 SEC · LAWLESS FRONTIER',
    starColor: '#ffe088',
    hasAsteroidBelt: true,
    planets: [
      {
        id: 'amada',
        name: 'Amada III',
        biome: 'alien_jungle', // Planet A - Color 1 from reference
        sub: 'BIOLUMINESCENT JUNGLE WORLD',
        radius: 20,
        orbitDist: 180,
        orbitSpeed: 0.003,
        orbitAngle: 0.4,
        color: '#2a1a0f',
        veinColor: '#00ff88', // Emerald Green Fissures
        rings: true,
        mineralDeposits: [
          { type: 'eezo', amount: 850, x: 0.35, y: 0.22, found: false },
          { type: 'platinum', amount: 1400, x: -0.42, y: 0.65, found: false },
          { type: 'palladium', amount: 900, x: 0.12, y: -0.58, found: false }
        ]
      },
      {
        id: 'klendagon',
        name: 'Klendagon Prime',
        biome: 'volcanic', // Planet B from reference
        sub: 'MOLTEN BASALT MAGMA CRUST',
        radius: 26,
        orbitDist: 310,
        orbitSpeed: 0.0018,
        orbitAngle: 2.1,
        color: '#140c0a',
        veinColor: '#ff6600', // Molten Orange Magma
        rings: false,
        mineralDeposits: [
          { type: 'iridium', amount: 2200, x: 0.55, y: -0.15, found: false },
          { type: 'eezo', amount: 1100, x: -0.28, y: 0.44, found: false }
        ]
      },
      {
        id: 'terrestrial_m3',
        name: 'Terrestrial M3',
        biome: 'terrestrial', // Planet from Reference Image 1
        sub: 'COLONY WORLD · ACTIVE SURVEY',
        radius: 22,
        orbitDist: 430,
        orbitSpeed: 0.0012,
        orbitAngle: 4.2,
        color: '#0e2b4d',
        veinColor: '#00f0ff',
        isScanning: true, // Holographic coordinate scan grid
        rings: false,
        mineralDeposits: [
          { type: 'platinum', amount: 1600, x: 0.18, y: 0.32, found: false },
          { type: 'palladium', amount: 1200, x: -0.52, y: -0.22, found: false }
        ]
      }
    ],
    contacts: [
      {
        id: 'omega_station',
        name: 'Omega Citadel',
        kind: 'station',
        sub: 'Mercenary Outpost & Trade Hub',
        dist: 140,
        angle: 1.2,
        recruits: [
          { id: 'archangel', name: 'Archangel (Garrus Vakarian)', role: 'Sniper & Calibration Specialist', cost: '1,200 CR', quote: 'I have some reach, she had flexibility.' },
          { id: 'professor', name: 'Mordin Solus', role: 'Salarian Scientist & Geneticist', cost: '950 CR', quote: 'Had to be me. Someone else might have gotten it wrong.' },
          { id: 'veteran', name: 'Zaeed Massani', role: 'Veteran Bounty Hunter & Commando', cost: '800 CR', quote: 'Rage is a hell of an anesthetic.' }
        ]
      },
      {
        id: 'jump_gate_alpha',
        name: 'Alpha Jump Gate',
        kind: 'jump_gate',
        sub: 'Deep Space Transit Vortex',
        dist: 220,
        angle: 3.6
      },
      {
        id: 'fuel_depot',
        name: 'Helium-3 Tanking Array',
        kind: 'fuel',
        sub: 'Fuel & Probe Replenishment',
        dist: 190,
        angle: 5.2
      }
    ]
  },

  thorne: {
    name: 'Thorne',
    cluster: 'Valhallan Threshold',
    security: '0.0 NULL · ANOMALOUS ZONE',
    starColor: '#a8d5ff',
    hasAsteroidBelt: true,
    planets: [
      {
        id: 'cyber_xenon',
        name: 'Xenon VII',
        biome: 'cyber_purple', // Planet A - Color 3 from reference
        sub: 'INDIGO CRAGS · MAGENTA BIOLUMINESCENCE',
        radius: 24,
        orbitDist: 210,
        orbitSpeed: 0.0022,
        orbitAngle: 1.5,
        color: '#120822',
        veinColor: '#dd22ff', // Neon Magenta Veins
        rings: true,
        mineralDeposits: [
          { type: 'eezo', amount: 1500, x: 0.22, y: 0.45, found: false },
          { type: 'iridium', amount: 1800, x: -0.35, y: -0.28, found: false }
        ]
      },
      {
        id: 'golden_ravine',
        name: 'Aurelia Prime',
        biome: 'golden_jade', // Planet A - Color 2 from reference
        sub: 'OCHRE DESERT & JADE MINERAL CANYONS',
        radius: 22,
        orbitDist: 340,
        orbitSpeed: 0.0016,
        orbitAngle: 3.8,
        color: '#423418',
        veinColor: '#00ddbb', // Turquoise / Jade Mineral Veins
        rings: true,
        mineralDeposits: [
          { type: 'platinum', amount: 2400, x: 0.12, y: -0.42, found: false }
        ]
      }
    ],
    contacts: [
      {
        id: 'derelict_reaper',
        name: 'Derelict Leviathan Hulk',
        kind: 'derelict',
        sub: 'Ancient Biomechanoid Wreckage',
        hazard: true,
        dist: 160,
        angle: 2.8,
        mission: { title: 'LEVIATHAN SALVAGE OPS', enemy: 'Indoctrinated Husk Swarm', reward: '3,500 CR + 2,000 EEZO' }
      }
    ]
  },

  cygnus: {
    name: 'Cygnus X-1',
    cluster: 'Gravitational Anomaly',
    security: '0.0 NULL · BLACK HOLE ACCRETION',
    isBlackHole: true,
    hasAsteroidBelt: true,
    planets: [
      {
        id: 'charred_core',
        name: 'Singularity Forge',
        biome: 'volcanic',
        sub: 'TIDALLY LOCKED BASALT CORE',
        radius: 18,
        orbitDist: 260,
        orbitSpeed: 0.0035,
        orbitAngle: 0.8,
        color: '#100806',
        veinColor: '#ff4400',
        rings: false,
        mineralDeposits: [
          { type: 'eezo', amount: 4500, x: 0.1, y: 0.1, found: false }
        ]
      }
    ],
    contacts: [
      {
        id: 'cygnus_relay',
        name: 'Mu Mass Relay',
        kind: 'relay',
        sub: 'Inter-Cluster Transit Accelerator',
        dist: 280,
        angle: 4.5
      }
    ]
  },

  meridian: {
    name: 'Meridian Prime',
    cluster: 'Serpent Nebula',
    security: '1.0 SEC · ALLIANCE CAPITAL',
    starColor: '#fff5d8',
    hasAsteroidBelt: false,
    planets: [
      {
        id: 'meridian_prime',
        name: 'Meridian Prime',
        biome: 'terrestrial',
        sub: 'ALLIANCE CORE WORLD · SANCTUARY',
        radius: 28,
        orbitDist: 240,
        orbitSpeed: 0.0014,
        orbitAngle: 1.2,
        color: '#0a2540',
        veinColor: '#7dff9a',
        isScanning: true,
        rings: false,
        mineralDeposits: [
          { type: 'platinum', amount: 3200, x: 0.25, y: 0.4, found: false },
          { type: 'palladium', amount: 2100, x: -0.4, y: -0.1, found: false }
        ]
      },
      {
        id: 'orbital_shipyards',
        name: 'Sanctuary Orbital',
        biome: 'golden_jade',
        sub: 'ORBITAL SHIPYARDS & FLEET YARDS',
        radius: 18,
        orbitDist: 360,
        orbitSpeed: 0.0010,
        orbitAngle: 3.4,
        color: '#3a2812',
        veinColor: '#00ddbb',
        rings: true,
        mineralDeposits: []
      }
    ],
    contacts: [
      {
        id: 'alliance_command',
        name: 'Alliance Citadel',
        kind: 'station',
        sub: 'Council Headquarters & Fleet Command',
        dist: 180,
        angle: 0.6
      },
      {
        id: 'meridian_relay',
        name: 'Alpha Centauri Relay',
        kind: 'relay',
        sub: 'Capital Cluster Transit',
        dist: 220,
        angle: 2.8
      },
      {
        id: 'fuel_depot',
        name: 'Helium-3 Tanking Array',
        kind: 'fuel',
        sub: 'Fuel & Probe Replenishment',
        dist: 160,
        angle: 5.1
      }
    ]
  }
};

// Galaxy-scale spatial layout for the 3D star map.
// All coordinates in arbitrary "cluster units" (the macro map will
// scale these to fit the camera frustum). Negative-Y is "core-ward".
// Listed here so adding new systems to the galaxy map is a one-line change.
export const GALAXY_LAYOUT = {
  // Cluster metadata
  clusters: {
    'Omega Nebula':        { color: '#c84a4a', center: { x: -180, y:  60, z:  90 } },
    'Valhallan Threshold': { color: '#5ad4ff', center: { x:  220, y: -40, z: -110 } },
    'Gravitational Anomaly': { color: '#ffaa00', center: { x:   60, y: 180, z:  220 } },
    'Serpent Nebula':      { color: '#7dff9a', center: { x:  -90, y:-200, z: -160 } }
  },

  // Per-system map position + the systems reachable via mass relay
  systems: {
    sahrabarik: { coord: { x: -180, y:   60, z:   90 }, relays: ['thorne', 'meridian'] },
    thorne:     { coord: { x:  220, y:  -40, z: -110 }, relays: ['sahrabarik', 'cygnus'] },
    cygnus:     { coord: { x:   60, y:  180, z:  220 }, relays: ['thorne', 'meridian'] },
    meridian:   { coord: { x:  -90, y: -200, z: -160 }, relays: ['sahrabarik', 'cygnus'] }
  }
};
