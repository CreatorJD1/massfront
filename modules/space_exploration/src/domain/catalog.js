import { deepFreeze } from './deterministic.js';

export const CATALOG_VERSION = 5;

export const RESOURCE_KEYS = deepFreeze([
  'credits',
  'alloys',
  'components',
  'bioSamples',
  'researchPoints',
  'fuel',
  'probes'
]);

export const RESIDENT_FACTION_IDS = deepFreeze(['nova', 'dominion', 'syndicate']);
export const SHIP_DISTRICT_IDS = deepFreeze([
  'command',
  'navigation',
  'survey',
  'mission_ops',
  'research',
  'fabricator',
  'engineering',
  'habitat',
  'factions',
  'hangar',
  'logistics'
]);

export const SHIP_DECKS = deepFreeze({
  A: { id: 'A', name: 'Deck A — Command & Navigation', shortName: 'Deck A', role: 'Expedition governance, autopilot navigation, planetary cartography, and mission control', districtIds: ['command', 'navigation', 'survey', 'mission_ops'] },
  B: { id: 'B', name: 'Deck B — Science & Industry', shortName: 'Deck B', role: 'Research, fabrication, propulsion, and ship-service infrastructure', districtIds: ['research', 'fabricator', 'engineering'] },
  C: { id: 'C', name: 'Deck C — Civilization & Operations', shortName: 'Deck C', role: 'Resident diplomacy, civilian life support, strike-team deployment, and expedition logistics', districtIds: ['factions', 'habitat', 'hangar', 'logistics'] }
});

export const SHIP_SECTORS = deepFreeze({
  function: {
    id: 'function',
    name: 'Function & Operations',
    shortName: 'Function',
    theme: 'function',
    color: '#42ddff',
    badge: 'OPERATIONS // INDUSTRIAL // SCIENCE',
    description: 'Expedition command, autopilot navigation, mission control, planetary survey arrays, research, automated fabrication, propulsion, and strike bays.',
    districtIds: ['command', 'navigation', 'survey', 'mission_ops', 'research', 'fabricator', 'engineering', 'hangar']
  },
  civil: {
    id: 'civil',
    name: 'Civil & Habitats',
    shortName: 'Civil',
    theme: 'civil',
    color: '#74e0a2',
    badge: 'HABITATION // DIPLOMACY // LOGISTICS',
    description: 'Expedition population arcology, medical recovery wards, permanent resident faction embassies, and high-throughput cargo logistics.',
    districtIds: ['habitat', 'factions', 'logistics']
  }
});

export const DISTRICT_ADJACENCIES = deepFreeze([
  {
    id: 'command_navigation',
    districts: ['command', 'navigation'],
    name: 'Command Route Spine',
    bonus: 'Autopilot planning and expedition alerts share one command picture',
    perk: 'route_command_link'
  },
  {
    id: 'survey_mission_ops',
    districts: ['survey', 'mission_ops'],
    name: 'Intelligence Operations Link',
    bonus: 'Survey hazards and discoveries populate mission readiness automatically',
    perk: 'mission_intelligence_link'
  },
  {
    id: 'science_nexus',
    districts: ['survey', 'research'],
    name: 'Science Directorate Link',
    bonus: '+15% research point yield from planetary survey discoveries',
    perk: 'science_yield_boost'
  },
  {
    id: 'industrial_loop',
    districts: ['fabricator', 'logistics'],
    name: 'Autonomous Supply Conduit',
    bonus: '-15% component cost for ship module fabrication',
    perk: 'fabrication_efficiency'
  },
  {
    id: 'civic_accord',
    districts: ['habitat', 'factions'],
    name: 'Diplomatic Concourse',
    bonus: '+20% faster personnel recovery & +15% faction reputation gain',
    perk: 'diplomatic_recovery'
  },
  {
    id: 'strike_operations',
    districts: ['hangar', 'engineering'],
    name: 'Propulsion Vector Link',
    bonus: '+10% transit speed & reduced operational fuel consumption',
    perk: 'transit_fuel_reduction'
  }
]);

export const FACTION_CATALOG = deepFreeze({
  uga: {
    id: 'uga',
    name: 'United Galactic Authority',
    shortName: 'UGA',
    role: 'civilization_authority',
    hireable: false,
    residentCapable: false,
    hostile: false,
    color: '#73d7ff'
  },
  nova: {
    id: 'nova',
    name: 'Nova Expeditionary Compact',
    shortName: 'Nova',
    role: 'precision_expeditionary_force',
    hireable: true,
    residentCapable: true,
    hostile: false,
    color: '#40c8ff'
  },
  dominion: {
    id: 'dominion',
    name: 'Dominion Iron Assembly',
    shortName: 'Dominion',
    role: 'armored_industrial_force',
    hireable: true,
    residentCapable: true,
    hostile: false,
    color: '#f0a33b'
  },
  syndicate: {
    id: 'syndicate',
    name: 'Syndicate Veil Network',
    shortName: 'Syndicate',
    role: 'covert_logistics_force',
    hireable: true,
    residentCapable: true,
    hostile: false,
    color: '#c678ff'
  },
  brood: {
    id: 'brood',
    name: 'Brood Swarm',
    shortName: 'Brood',
    role: 'extragalactic_infestation',
    playable: false,
    humanoid: false,
    hireable: false,
    residentCapable: false,
    hostile: true,
    enemyOfFactionIds: ['uga', 'nova', 'dominion', 'syndicate'],
    primaryEnemyOfFactionId: 'uga',
    color: '#e34b45'
  }
});

function districtTier(level, name, cost, features, activity, visualChanges, capacity = {}) {
  return { level, name, cost, features, activity, visualChanges, capacity };
}

function socket(id, label, unlockLevel, compatibleModuleIds) {
  return {
    id,
    label,
    unlockLevel,
    unlockTier: unlockLevel,
    compatibleModuleIds,
    compatibleModuleTypes: compatibleModuleIds
  };
}

function staffSlot(id, label, unlockLevel, preferredRoles = []) {
  return {
    id,
    label,
    unlockLevel,
    unlockTier: unlockLevel,
    preferredRoles
  };
}

export const MODULE_CATALOG = deepFreeze({
  command_holotable: { id: 'command_holotable', name: 'Strategic Holography Vault', powerDrawMW: 5, cost: { components: 90, credits: 1200 } },
  command_archive: { id: 'command_archive', name: 'Continuity Archive', powerDrawMW: 5, cost: { components: 70, researchPoints: 80 } },
  command_terminal: { id: 'command_terminal', name: 'Classic Modes Terminal', powerDrawMW: 5, cost: { components: 55, credits: 900 } },
  route_predictor: { id: 'route_predictor', name: 'Autopilot Route Predictor', powerDrawMW: 9, cost: { components: 75, researchPoints: 60 } },
  orbit_scheduler: { id: 'orbit_scheduler', name: 'Orbital Approach Scheduler', powerDrawMW: 7, cost: { components: 60, credits: 700 } },
  transit_archive: { id: 'transit_archive', name: 'Transit Hazard Archive', powerDrawMW: 6, cost: { components: 55, researchPoints: 45 } },
  spectral_array: { id: 'spectral_array', name: 'Deep Spectral Array', powerDrawMW: 10, cost: { components: 85, alloys: 45 } },
  probe_telemetry: { id: 'probe_telemetry', name: 'Probe Telemetry Lattice', powerDrawMW: 8, cost: { components: 70, credits: 650 } },
  anomaly_filter: { id: 'anomaly_filter', name: 'Anomaly Discrimination Core', powerDrawMW: 12, cost: { components: 110, researchPoints: 120 } },
  operation_table: { id: 'operation_table', name: 'Mission Operations Table', powerDrawMW: 8, cost: { components: 65, credits: 800 } },
  readiness_net: { id: 'readiness_net', name: 'Strike Readiness Network', powerDrawMW: 10, cost: { components: 85, researchPoints: 75 } },
  debrief_archive: { id: 'debrief_archive', name: 'Ground Debrief Archive', powerDrawMW: 6, cost: { components: 55, credits: 650 } },
  xenology_suite: { id: 'xenology_suite', name: 'Xenology Suite', powerDrawMW: 10, cost: { components: 75, bioSamples: 20 } },
  gravitic_lab: { id: 'gravitic_lab', name: 'Gravitic Materials Lab', powerDrawMW: 14, cost: { components: 95, researchPoints: 90 } },
  containment_lab: { id: 'containment_lab', name: 'Brood Containment Lab', powerDrawMW: 16, cost: { components: 120, bioSamples: 35 } },
  precision_forge: { id: 'precision_forge', name: 'Precision Component Forge', powerDrawMW: 15, cost: { alloys: 80, components: 45 } },
  probe_foundry: { id: 'probe_foundry', name: 'Autonomous Probe Foundry', powerDrawMW: 18, cost: { alloys: 65, components: 70 } },
  repair_fabricator: { id: 'repair_fabricator', name: 'Field Repair Fabricator', powerDrawMW: 12, cost: { alloys: 90, credits: 850 } },
  drive_tuner: { id: 'drive_tuner', name: 'Fold-Drive Harmonic Tuner', powerDrawMW: 12, cost: { components: 105, researchPoints: 70 } },
  reactor_baffles: { id: 'reactor_baffles', name: 'Reactor Flux Baffles', powerGenerationBonusMW: 35, cost: { alloys: 100, components: 65 } },
  thermal_reclaimer: { id: 'thermal_reclaimer', name: 'Thermal Energy Reclaimer', powerGenerationBonusMW: 25, cost: { alloys: 75, credits: 750 } },
  trauma_bay: { id: 'trauma_bay', name: 'Expedition Trauma Bay', powerDrawMW: 8, cost: { components: 80, bioSamples: 25 } },
  habitation_arcology: { id: 'habitation_arcology', name: 'Habitation Arcology', powerDrawMW: 10, cost: { alloys: 95, credits: 1000 } },
  recovery_ward: { id: 'recovery_ward', name: 'Neural Recovery Ward', powerDrawMW: 12, cost: { components: 100, bioSamples: 30 } },
  nova_quarters: { id: 'nova_quarters', name: 'Nova Resident Enclave', powerDrawMW: 6, cost: { alloys: 55, credits: 750 } },
  dominion_quarters: { id: 'dominion_quarters', name: 'Dominion Resident Enclave', powerDrawMW: 8, cost: { alloys: 70, credits: 850 } },
  syndicate_quarters: { id: 'syndicate_quarters', name: 'Syndicate Resident Enclave', powerDrawMW: 7, cost: { alloys: 60, credits: 900 } },
  dropship_racks: { id: 'dropship_racks', name: 'Dropship Service Racks', powerDrawMW: 12, cost: { alloys: 90, components: 60 } },
  medevac_cradle: { id: 'medevac_cradle', name: 'Medevac Launch Cradle', powerDrawMW: 10, cost: { components: 90, bioSamples: 20 } },
  support_bay: { id: 'support_bay', name: 'Operational Support Bay', powerDrawMW: 14, cost: { alloys: 80, components: 85 } },
  cryo_cargo: { id: 'cryo_cargo', name: 'Cryogenic Sample Hold', powerDrawMW: 8, cost: { alloys: 60, components: 55 } },
  probe_magazine: { id: 'probe_magazine', name: 'Probe Magazine', powerDrawMW: 6, cost: { alloys: 65, credits: 650 } },
  fuel_bladders: { id: 'fuel_bladders', name: 'Armored Fuel Bladders', powerDrawMW: 4, cost: { alloys: 90, components: 50 } }
});

export const DISTRICT_CATALOG = deepFreeze({
  command: {
    id: 'command',
    blenderId: 'command',
    name: 'Command Core',
    shortName: 'Command',
    sector: 'function',
    deck: 'A',
    deckName: 'Deck A — Command & Science',
    buildable: false,
    fixed: true,
    initialLevel: 3,
    basePowerDrawMW: 15,
    focus: { anchor: 'FOCUS_command', cameraDistance: 8, cameraHeight: 6 },
    tiers: [
      districtTier(1, 'Fleet Coordination', {}, ['Expedition route control', 'Contract review'], 'command_staff', ['Lower holotable ring online', 'Primary tactical consoles illuminated'], { powerDrawMW: 15 }),
      districtTier(2, 'Strategic Nexus', {}, ['Faction liaison net', 'Multi-system intelligence'], 'command_staff_dense', ['Upper operations galleries illuminated', 'Strategic glass balconies deployed'], { powerDrawMW: 15 }),
      districtTier(3, 'Civilization Command', {}, ['Classic Modes terminal', 'Full expedition authority'], 'command_full', ['Command crown and continuity vault active', 'Golden apex bridge lighting engaged'], { powerDrawMW: 15 })
    ],
    sockets: [
      socket('command_socket_1', 'Strategic Systems', 1, ['command_holotable']),
      socket('command_socket_2', 'Continuity Systems', 2, ['command_archive']),
      socket('command_socket_3', 'Simulation Systems', 3, ['command_terminal'])
    ],
    staffSlots: [
      staffSlot('command_staff_1', 'Executive Officer', 1, ['support', 'recon'])
    ]
  },
  navigation: {
    id: 'navigation', blenderId: 'navigation', name: 'Navigation Bridge', shortName: 'Navigation', sector: 'function', deck: 'A', deckName: 'Deck A — Command & Navigation', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 9,
    focus: { anchor: 'FOCUS_navigation', cameraDistance: 8.2, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Autopilot Helm', {}, ['System routes', 'Orbital approach planning'], 'route_watch', ['Route table and system ephemeris online', 'Primary transit corridor illuminated'], { routeRange: 1, powerDrawMW: 9 }),
      districtTier(2, 'Expedition Astrogation', { credits: 1450, alloys: 70, components: 95 }, ['Multi-stop routes', 'Hazard-aware fuel estimates'], 'route_watch_dense', ['Secondary astrogation galleries active', 'Transit hazard projection ring deployed'], { routeRange: 2, powerDrawMW: 17 }),
      districtTier(3, 'Continuity Navigation', { credits: 2500, alloys: 120, components: 155 }, ['Frontier route chains', 'Emergency return planning'], 'route_watch_full', ['Full navigation crown and orbit scheduler active', 'Civilization-scale route lattice illuminated'], { routeRange: 3, powerDrawMW: 26 })
    ],
    sockets: [
      socket('navigation_socket_1', 'Route Computation', 1, ['route_predictor']),
      socket('navigation_socket_2', 'Orbital Control', 2, ['orbit_scheduler']),
      socket('navigation_socket_3', 'Hazard Intelligence', 3, ['transit_archive'])
    ],
    staffSlots: [
      staffSlot('navigation_staff_1', 'Chief Navigator', 1, ['recon', 'technical']),
      staffSlot('navigation_staff_2', 'Transit Controller', 2, ['support', 'recon'])
    ]
  },
  survey: {
    id: 'survey', blenderId: 'survey', name: 'Survey Lab', shortName: 'Survey', sector: 'function', deck: 'A', deckName: 'Deck A — Command & Navigation', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 10,
    focus: { anchor: 'FOCUS_survey', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Orbital Survey', {}, ['Directed scans', 'Basic probes'], 'long_range_scan', ['Primary sensor mast deployed', 'Telemetry receiver illuminated'], { probeRange: 1, powerDrawMW: 10 }),
      districtTier(2, 'Deep-Space Cartography', { credits: 1400, alloys: 80, components: 90 }, ['Gravitic anomaly scans', 'Probe telemetry fusion'], 'long_range_scan_dense', ['Secondary dishes and tracking galleries assembled', 'Spectral optical rings active'], { probeRange: 2, powerDrawMW: 20 }),
      districtTier(3, 'Interstellar Observatory', { credits: 2400, alloys: 130, components: 150 }, ['Black-hole lensing analysis', 'Hidden route resolution'], 'observatory_full', ['Full sensor crown and exterior array online', 'Multi-wave pulsar lens emitter active'], { probeRange: 3, powerDrawMW: 30 })
    ],
    sockets: [
      socket('survey_socket_1', 'Sensor Package', 1, ['spectral_array']),
      socket('survey_socket_2', 'Telemetry Package', 2, ['probe_telemetry']),
      socket('survey_socket_3', 'Analysis Package', 3, ['anomaly_filter'])
    ],
    staffSlots: [
      staffSlot('survey_staff_1', 'Cartography Officer', 1, ['recon', 'technical']),
      staffSlot('survey_staff_2', 'Signals Analyst', 2, ['recon', 'support'])
    ]
  },
  mission_ops: {
    id: 'mission_ops', blenderId: 'mission_ops', name: 'Mission Operations', shortName: 'Mission Ops', sector: 'function', deck: 'A', deckName: 'Deck A — Command & Navigation', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 10,
    focus: { anchor: 'FOCUS_mission_ops', cameraDistance: 8.2, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Operations Watch', {}, ['Contract review', 'Mission readiness'], 'mission_watch', ['Operations table and briefing wall online', 'Ground-link telemetry illuminated'], { concurrentPlans: 1, powerDrawMW: 10 }),
      districtTier(2, 'Expedition Mission Control', { credits: 1550, alloys: 75, components: 105 }, ['Comparative landing zones', 'Persistent debrief archive'], 'mission_watch_dense', ['Second planning theater staffed', 'Landing-zone holography active'], { concurrentPlans: 2, powerDrawMW: 19 }),
      districtTier(3, 'Coalition Operations Center', { credits: 2700, alloys: 130, components: 170 }, ['Coalition mission chains', 'Full operation continuity'], 'mission_watch_full', ['Coalition briefing crown active', 'Ground-operation continuity vault sealed'], { concurrentPlans: 3, powerDrawMW: 30 })
    ],
    sockets: [
      socket('mission_ops_socket_1', 'Planning Systems', 1, ['operation_table']),
      socket('mission_ops_socket_2', 'Readiness Systems', 2, ['readiness_net']),
      socket('mission_ops_socket_3', 'Debrief Systems', 3, ['debrief_archive'])
    ],
    staffSlots: [
      staffSlot('mission_ops_staff_1', 'Operations Officer', 1, ['support', 'recon']),
      staffSlot('mission_ops_staff_2', 'Ground Liaison', 2, ['support', 'technical'])
    ]
  },
  research: {
    id: 'research', blenderId: 'research', name: 'Research Directorate', shortName: 'Research', sector: 'function', deck: 'B', deckName: 'Deck B — Science & Industry', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 15,
    focus: { anchor: 'FOCUS_research', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Applied Sciences', {}, ['Shared research bank', 'Universal research'], 'science', ['Primary laboratory block occupied', 'Research terminals online'], { concurrentProjects: 1, powerDrawMW: 15 }),
      districtTier(2, 'Specialist Directorate', { credits: 1500, alloys: 65, components: 110 }, ['UGA research', 'Faction research'], 'science_dense', ['Glass laboratory galleries activated', 'Containment research cells illuminated'], { concurrentProjects: 2, powerDrawMW: 25 }),
      districtTier(3, 'Frontier Institute', { credits: 2600, alloys: 110, components: 175, bioSamples: 20 }, ['Brood containment research', 'Ancient technology analysis'], 'science_full', ['Containment vault and research crown sealed', 'Quantum core holographic array online'], { concurrentProjects: 3, powerDrawMW: 40 })
    ],
    sockets: [
      socket('research_socket_1', 'Life Sciences', 1, ['xenology_suite']),
      socket('research_socket_2', 'Physical Sciences', 2, ['gravitic_lab']),
      socket('research_socket_3', 'Containment Sciences', 3, ['containment_lab'])
    ],
    staffSlots: [
      staffSlot('research_staff_1', 'Chief Scientist', 1, ['technical', 'medical']),
      staffSlot('research_staff_2', 'Xenology Director', 2, ['technical', 'recon'])
    ]
  },
  fabricator: {
    id: 'fabricator', blenderId: 'fabricator', name: 'Fabrication & Armory', shortName: 'Fabrication', sector: 'function', deck: 'B', deckName: 'Deck B — Science & Industry', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 20,
    focus: { anchor: 'FOCUS_fabricator', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Component Works', {}, ['Component fabrication', 'Repair parts'], 'industry', ['Primary forge floor operating', 'Alloy feeder tracks active'], { fabricationSlots: 1, powerDrawMW: 20 }),
      districtTier(2, 'Autonomous Foundry', { credits: 1550, alloys: 120, components: 70 }, ['Probe fabrication', 'Module assembly'], 'industry_dense', ['Foundry cranes and second assembly line active', 'Automated laser welding gantries deployed'], { fabricationSlots: 2, powerDrawMW: 35 }),
      districtTier(3, 'Megaship Arsenal Works', { credits: 2700, alloys: 190, components: 130 }, ['High-grade modules', 'Rapid construction support'], 'industry_full', ['Full-height industrial crown and freight gantries active', 'Heavy orbital fabrication bay online'], { fabricationSlots: 3, powerDrawMW: 55 })
    ],
    sockets: [
      socket('fabricator_socket_1', 'Precision Line', 1, ['precision_forge']),
      socket('fabricator_socket_2', 'Autonomous Line', 2, ['probe_foundry']),
      socket('fabricator_socket_3', 'Repair Line', 3, ['repair_fabricator'])
    ],
    staffSlots: [
      staffSlot('fabricator_staff_1', 'Forge Master', 1, ['technical', 'support']),
      staffSlot('fabricator_staff_2', 'Automation Tech', 2, ['technical'])
    ]
  },
  engineering: {
    id: 'engineering', blenderId: 'engineering', name: 'Engineering & Drive', shortName: 'Engineering', sector: 'function', deck: 'B', deckName: 'Deck B — Science & Industry', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 0,
    focus: { anchor: 'FOCUS_engineering', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Drive Operations', {}, ['System course plotting', 'Standard fuel efficiency'], 'reactor', ['Primary drive control block active', 'Reactor core magnetic confinement online'], { fuelEfficiency: 0, powerGenerationMW: 160 }),
      districtTier(2, 'Fold Harmonics', { credits: 1700, alloys: 130, components: 95 }, ['Reduced travel fuel', 'Veyra approach stabilization'], 'reactor_dense', ['Twin reactor pylons synchronized', 'Harmonic plasma containment rings active'], { fuelEfficiency: 10, powerGenerationMW: 260 }),
      districtTier(3, 'Expedition Propulsion', { credits: 2900, alloys: 210, components: 150 }, ['Maximum route range', 'Emergency extraction'], 'reactor_full', ['Drive crown, radiator petals, and exterior emitters active', 'Pulsing fold-space warp nacelles engaged'], { fuelEfficiency: 20, powerGenerationMW: 380 })
    ],
    sockets: [
      socket('engineering_socket_1', 'Drive Control', 1, ['drive_tuner']),
      socket('engineering_socket_2', 'Reactor Control', 2, ['reactor_baffles']),
      socket('engineering_socket_3', 'Thermal Control', 3, ['thermal_reclaimer'])
    ],
    staffSlots: [
      staffSlot('engineering_staff_1', 'Chief Engineer', 1, ['technical']),
      staffSlot('engineering_staff_2', 'Drive Specialist', 2, ['technical', 'support'])
    ]
  },
  habitat: {
    id: 'habitat', blenderId: 'habitat', name: 'Habitat & Medical', shortName: 'Habitat', sector: 'civil', deck: 'C', deckName: 'Deck C — Civilization & Operations', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 10,
    focus: { anchor: 'FOCUS_habitat', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Expedition Habitat', {}, ['Civilian population', 'Basic personnel recovery'], 'civilian', ['Habitat canopy and clinic occupied', 'Civilian pod lighting active'], { population: 6200, recoveryBonus: 0, powerDrawMW: 10 }),
      districtTier(2, 'Arcology Ring', { credits: 1450, alloys: 105, components: 75 }, ['Expanded population', 'Improved injury recovery'], 'civilian_dense', ['Second residential spine and medical galleries occupied', 'Lush botanical gardens illuminated'], { population: 12400, recoveryBonus: 1, powerDrawMW: 20 }),
      districtTier(3, 'Civilization Habitat', { credits: 2550, alloys: 170, components: 135, bioSamples: 15 }, ['Maximum population', 'Advanced trauma recovery'], 'civilian_full', ['Park canopy, arcology crown, and exterior habitation lights active', 'Expedition bio-dome city fully powered'], { population: 24000, recoveryBonus: 2, powerDrawMW: 30 })
    ],
    sockets: [
      socket('habitat_socket_1', 'Medical Services', 1, ['trauma_bay']),
      socket('habitat_socket_2', 'Civilian Services', 2, ['habitation_arcology']),
      socket('habitat_socket_3', 'Recovery Services', 3, ['recovery_ward'])
    ],
    staffSlots: [
      staffSlot('habitat_staff_1', 'Chief Medical Officer', 1, ['medical']),
      staffSlot('habitat_staff_2', 'Life Support Lead', 2, ['medical', 'support'])
    ]
  },
  factions: {
    id: 'factions', blenderId: 'factions', name: 'Coalition Embassy', shortName: 'Embassy', sector: 'civil', deck: 'C', deckName: 'Deck C — Civilization & Operations', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 10,
    focus: { anchor: 'FOCUS_factions', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Resident Enclave', {}, ['One permanent resident faction'], 'diplomacy', ['First embassy tower occupied', 'Consular security perimeter active'], { residentCapacity: 1, powerDrawMW: 10 }),
      districtTier(2, 'Accord Concourse', { credits: 1650, alloys: 90, components: 100 }, ['Two permanent resident factions'], 'diplomacy_dense', ['Second embassy and shared concourse active', 'Inter-faction trade promenade illuminated'], { residentCapacity: 2, powerDrawMW: 18 }),
      districtTier(3, 'Coalition Forum', { credits: 2850, alloys: 145, components: 165 }, ['All three permanent resident factions'], 'diplomacy_full', ['Third embassy and coalition chamber illuminated', 'Crystal diplomatic rotunda crowned'], { residentCapacity: 3, powerDrawMW: 28 })
    ],
    sockets: [
      socket('factions_socket_1', 'Nova Enclave', 1, ['nova_quarters']),
      socket('factions_socket_2', 'Dominion Enclave', 2, ['dominion_quarters']),
      socket('factions_socket_3', 'Syndicate Enclave', 3, ['syndicate_quarters'])
    ],
    staffSlots: [
      staffSlot('factions_staff_1', 'Diplomatic Envoy', 1, ['support', 'recon'])
    ]
  },
  hangar: {
    id: 'hangar', blenderId: 'hangar', name: 'Strike & Expedition Bay', shortName: 'Strike Bay', sector: 'function', deck: 'C', deckName: 'Deck C — Civilization & Operations', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 15,
    layoutContract: {
      singleIntegratedHangarVolume: true,
      baseDeployerAirUnit: true,
      strikerMusterSharesBaseDeployerHangar: true,
      residentFactionIds: ['nova', 'dominion', 'syndicate'],
      excludedFactionIds: ['brood']
    },
    focus: { anchor: 'FOCUS_hangar', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Expedition Deck', {}, ['Commander deployment', 'Three-specialist teams'], 'flight_deck', ['Shared hangar pad, selected-faction Base Deployer, and Striker muster lanes active', 'Guidance runway lights operational'], { supportSlots: 1, powerDrawMW: 15 }),
      districtTier(2, 'Operations Deck', { credits: 1750, alloys: 125, components: 100 }, ['Expanded support packages', 'Medevac launch'], 'flight_deck_dense', ['Secondary bays and service cranes active', 'Rapid magnetic catapult rails active'], { supportSlots: 2, powerDrawMW: 28 }),
      districtTier(3, 'Coalition Deployment Hub', { credits: 3000, alloys: 205, components: 170 }, ['Full operational doctrines', 'Rapid readiness turnaround'], 'flight_deck_full', ['All shuttle cradles and exterior launch apertures active', 'Heavy orbital strike drop-pod tubes armed'], { supportSlots: 3, powerDrawMW: 45 })
    ],
    sockets: [
      socket('hangar_socket_1', 'Base Deployer Systems', 1, ['dropship_racks']),
      socket('hangar_socket_2', 'Medical Flight', 2, ['medevac_cradle']),
      socket('hangar_socket_3', 'Support Systems', 3, ['support_bay'])
    ],
    staffSlots: [
      staffSlot('hangar_staff_1', 'Flight Deck Marshall', 1, ['recon', 'support']),
      staffSlot('hangar_staff_2', 'Strike Specialist', 2, ['recon', 'technical'])
    ]
  },
  logistics: {
    id: 'logistics', blenderId: 'logistics', name: 'Logistics & Cargo', shortName: 'Logistics', sector: 'civil', deck: 'C', deckName: 'Deck C — Civilization & Operations', buildable: true, fixed: false, initialLevel: 1,
    basePowerDrawMW: 10,
    focus: { anchor: 'FOCUS_logistics', cameraDistance: 8.4, cameraHeight: 5.2 },
    tiers: [
      districtTier(1, 'Expedition Stores', {}, ['Base cargo capacity', 'Fuel and probe stores'], 'freight', ['Primary cargo block and transit lane active', 'Automated cargo sorting track operational'], { cargoCapacity: 100, powerDrawMW: 10 }),
      districtTier(2, 'Orbital Freight Hub', { credits: 1500, alloys: 115, components: 75 }, ['Expanded cargo', 'Reduced support cost'], 'freight_dense', ['Container cranes and second freight spine active', 'Cryogenic container manifold active'], { cargoCapacity: 180, powerDrawMW: 20 }),
      districtTier(3, 'Civilization Supply Network', { credits: 2650, alloys: 185, components: 135 }, ['Maximum cargo', 'Automated expedition resupply'], 'freight_full', ['Full cargo crown and exterior freight traffic active', 'Automated drone freight delivery fleet online'], { cargoCapacity: 300, powerDrawMW: 32 })
    ],
    sockets: [
      socket('logistics_socket_1', 'Sample Storage', 1, ['cryo_cargo']),
      socket('logistics_socket_2', 'Probe Storage', 2, ['probe_magazine']),
      socket('logistics_socket_3', 'Fuel Storage', 3, ['fuel_bladders'])
    ],
    staffSlots: [
      staffSlot('logistics_staff_1', 'Quartermaster', 1, ['support']),
      staffSlot('logistics_staff_2', 'Cargo Routing Lead', 2, ['support', 'technical'])
    ]
  }
});

export const SYSTEM_CATALOG = deepFreeze({
  aelos: {
    id: 'aelos',
    name: 'Aelos',
    sequence: 1,
    classification: 'UGA Core Anchorage',
    description: 'Populated UGA space threaded by embassies, orbital shipyards, and tightly managed civilian traffic lanes.',
    mapPosition: [-0.62, 0.18],
    travelFuel: 0,
    danger: 1,
    visualProfile: 'blue_white_trade_lanes',
    siteIds: ['aelos_caldris', 'aelos_heliograph', 'aelos_freeport']
  },
  veyra: {
    id: 'veyra',
    name: 'Veyra',
    sequence: 2,
    classification: 'Gravitic Frontier',
    description: 'A sparse frontier dominated by a lensing black hole, ancient debris fields, and research sites that do not match known construction methods.',
    mapPosition: [0.04, 0.42],
    travelFuel: 18,
    danger: 3,
    visualProfile: 'black_hole_accretion_frontier',
    siteIds: ['veyra_orison', 'veyra_lens', 'veyra_ossuary']
  },
  karak: {
    id: 'karak',
    name: 'Karak',
    sequence: 3,
    classification: 'Silent Colony System',
    description: 'A colony system whose extinguished traffic grid and fragmented distress traffic conceal a system-scale Brood infestation.',
    mapPosition: [0.68, -0.12],
    travelFuel: 24,
    danger: 5,
    visualProfile: 'silent_colony_brood_horror',
    siteIds: ['karak_meridian', 'karak_spine', 'karak_hive']
  }
});

export const SITE_CATALOG = deepFreeze({
  aelos_caldris: { id: 'aelos_caldris', systemId: 'aelos', name: 'Caldris Orbital Ring', biome: 'orbital_arcology', hazards: ['civilian_density'], hiveTargetIds: [] },
  aelos_heliograph: { id: 'aelos_heliograph', systemId: 'aelos', name: 'Heliograph Relay', biome: 'relay_superstructure', hazards: ['radiation_pulse'], hiveTargetIds: [] },
  aelos_freeport: { id: 'aelos_freeport', systemId: 'aelos', name: 'Morrow Freeport', biome: 'industrial_station', hazards: ['dense_cargo'], hiveTargetIds: [] },
  veyra_orison: { id: 'veyra_orison', systemId: 'veyra', name: 'Orison Derelict', biome: 'derelict_megaframe', hazards: ['vacuum_breaches', 'debris_motion'], hiveTargetIds: [] },
  veyra_lens: { id: 'veyra_lens', systemId: 'veyra', name: 'Lensing Observatory', biome: 'gravitic_observatory', hazards: ['time_shear', 'radiation'], hiveTargetIds: [] },
  veyra_ossuary: { id: 'veyra_ossuary', systemId: 'veyra', name: 'Ossuary Vault', biome: 'ancient_subsurface', hazards: ['unknown_automation'], hiveTargetIds: [] },
  karak_meridian: { id: 'karak_meridian', systemId: 'karak', name: 'Meridian Colony', biome: 'abandoned_colony', hazards: ['spore_fog', 'civilian_remains'], hiveTargetIds: ['meridian_breeder_nest'] },
  karak_spine: { id: 'karak_spine', systemId: 'karak', name: 'Colony Transit Spine', biome: 'subterranean_transit', hazards: ['organic_occlusion', 'power_failure'], hiveTargetIds: ['spine_gestation_cluster', 'spine_feeder_root'] },
  karak_hive: { id: 'karak_hive', systemId: 'karak', name: 'Karak Primary Hive', biome: 'brood_hive_depths', hazards: ['acidic_atmosphere', 'neural_spores', 'living_terrain'], hiveTargetIds: ['karak_hive_heart'] }
});

export const DISCOVERY_CATALOG = deepFreeze({
  aelos_traffic_cipher: { id: 'aelos_traffic_cipher', systemId: 'aelos', name: 'Embassy Traffic Cipher', category: 'intelligence' },
  veyra_route_solution: { id: 'veyra_route_solution', systemId: 'aelos', name: 'Veyra Phase Route', category: 'navigation' },
  veyra_photon_archive: { id: 'veyra_photon_archive', systemId: 'veyra', name: 'Photon-Ring Archive', category: 'research' },
  karak_distress_vector: { id: 'karak_distress_vector', systemId: 'veyra', name: 'Karak Distress Vector', category: 'navigation' },
  karak_silence_pattern: { id: 'karak_silence_pattern', systemId: 'karak', name: 'Karak Silence Pattern', category: 'story' },
  karak_hive_geometry: { id: 'karak_hive_geometry', systemId: 'karak', name: 'Confirmed Hive Geometry', category: 'brood_intelligence' }
});

export const SURVEY_CATALOG = deepFreeze({
  aelos_traffic_census: {
    id: 'aelos_traffic_census', systemId: 'aelos', name: 'Orbital Traffic Census', probeCost: 1, requiredSurveyLevel: 1,
    discoveryId: 'aelos_traffic_cipher', rewards: { credits: 500, components: 20, researchPoints: 60 }, intelligence: 1
  },
  aelos_phase_trace: {
    id: 'aelos_phase_trace', systemId: 'aelos', name: 'Outer Relay Phase Trace', probeCost: 1, requiredSurveyLevel: 1,
    discoveryId: 'veyra_route_solution', rewards: { researchPoints: 100, fuel: 8 }, intelligence: 1, unlockSystemId: 'veyra', storyStep: 'veyra_route_open'
  },
  veyra_photon_ring: {
    id: 'veyra_photon_ring', systemId: 'veyra', name: 'Photon-Ring Spectrography', probeCost: 1, requiredSurveyLevel: 2,
    discoveryId: 'veyra_photon_archive', rewards: { researchPoints: 220, components: 35 }, intelligence: 1
  },
  veyra_derelict_echo: {
    id: 'veyra_derelict_echo', systemId: 'veyra', name: 'Derelict Distress Echo', probeCost: 1, requiredSurveyLevel: 2,
    discoveryId: 'karak_distress_vector', rewards: { researchPoints: 140, fuel: 10 }, intelligence: 1, unlockSystemId: 'karak', storyStep: 'karak_route_open'
  },
  karak_silent_beacons: {
    id: 'karak_silent_beacons', systemId: 'karak', name: 'Silent Beacon Triangulation', probeCost: 1, requiredSurveyLevel: 2,
    discoveryId: 'karak_silence_pattern', rewards: { researchPoints: 180, bioSamples: 8 }, intelligence: 2, revealsInfestation: true, storyStep: 'karak_infestation_confirmed'
  },
  karak_hive_scan: {
    id: 'karak_hive_scan', systemId: 'karak', name: 'Subsurface Hive Tomography', probeCost: 1, requiredSurveyLevel: 3,
    discoveryId: 'karak_hive_geometry', rewards: { researchPoints: 260, bioSamples: 15 }, intelligence: 2, confirmsHiveTargets: true, storyStep: 'karak_hive_mapped'
  }
});

export const RESEARCH_CATALOG = deepFreeze({
  uga_resident_charter: { id: 'uga_resident_charter', name: 'Resident Faction Charter', branch: 'uga', cost: 100, prerequisites: [], effects: ['residency_protocols'] },
  uga_brood_containment: { id: 'uga_brood_containment', name: 'Brood Containment Protocols', branch: 'uga', cost: 180, prerequisites: [], effects: ['brood_purge_authorization'] },
  uga_trauma_recovery: { id: 'uga_trauma_recovery', name: 'Expedition Trauma Recovery', branch: 'uga', cost: 220, bioSampleCost: 32, advancedContainment: true, prerequisites: ['uga_brood_containment'], effects: ['injury_recovery'] },
  universal_spectral_cartography: { id: 'universal_spectral_cartography', name: 'Spectral Cartography', branch: 'universal', cost: 120, prerequisites: [], effects: ['veyra_precision_scans'] },
  universal_fold_harmonics: { id: 'universal_fold_harmonics', name: 'Fold Harmonics', branch: 'universal', cost: 200, prerequisites: ['universal_spectral_cartography'], effects: ['travel_efficiency'] },
  universal_probe_autonomy: { id: 'universal_probe_autonomy', name: 'Autonomous Probes', branch: 'universal', cost: 160, prerequisites: [], effects: ['probe_efficiency'] },
  nova_pathfinder_doctrine: { id: 'nova_pathfinder_doctrine', name: 'Nova Pathfinder Doctrine', branch: 'nova', cost: 140, prerequisites: [], effects: ['nova_methodical_bonus'] },
  dominion_breach_doctrine: { id: 'dominion_breach_doctrine', name: 'Dominion Breach Doctrine', branch: 'dominion', cost: 140, prerequisites: [], effects: ['dominion_fortified_bonus'] },
  syndicate_veil_doctrine: { id: 'syndicate_veil_doctrine', name: 'Syndicate Veil Doctrine', branch: 'syndicate', cost: 140, prerequisites: [], effects: ['syndicate_covert_bonus'] }
});

export const COMMANDER_CATALOG = deepFreeze({
  nova_rhea_voss: { id: 'nova_rhea_voss', factionId: 'nova', name: 'Commander Rhea Voss', trait: 'measured_advance', initialLevel: 1 },
  dominion_toren_vale: { id: 'dominion_toren_vale', factionId: 'dominion', name: 'Commander Toren Vale', trait: 'hold_the_line', initialLevel: 1 },
  syndicate_mara_quill: { id: 'syndicate_mara_quill', factionId: 'syndicate', name: 'Commander Mara Quill', trait: 'ghost_logistics', initialLevel: 1 }
});

export const SPECIALIST_CATALOG = deepFreeze({
  nova_scout_ilan: { id: 'nova_scout_ilan', factionId: 'nova', name: 'Ilan Reeve', role: 'recon', rating: 2, specialty: 'Pathfinder Telemetry', perk: '+30% Probe scan range & signal discovery rate', preferredDistrictIds: ['survey', 'hangar'] },
  nova_tech_sumi: { id: 'nova_tech_sumi', factionId: 'nova', name: 'Sumi Kade', role: 'technical', rating: 2, specialty: 'Harmonic Synthesis', perk: '-15% Component cost for ship modules & research', preferredDistrictIds: ['fabricator', 'research'] },
  nova_medic_orr: { id: 'nova_medic_orr', factionId: 'nova', name: 'Orr Sato', role: 'medical', rating: 2, specialty: 'Field Bio-Stasis', perk: '-50% Injury recovery time for Nova personnel', preferredDistrictIds: ['habitat'] },
  nova_support_vik: { id: 'nova_support_vik', factionId: 'nova', name: 'Vik Arden', role: 'support', rating: 2, specialty: 'Expedition Logistics', perk: '+20% Fuel storage efficiency & transit endurance', preferredDistrictIds: ['logistics', 'command'] },
  dominion_scout_brann: { id: 'dominion_scout_brann', factionId: 'dominion', name: 'Brann Holt', role: 'recon', rating: 2, specialty: 'Heavy Reconnaissance', perk: '+25% Discovery rewards in high-gravity systems', preferredDistrictIds: ['survey', 'hangar'] },
  dominion_tech_vesk: { id: 'dominion_tech_vesk', factionId: 'dominion', name: 'Vesk Orra', role: 'technical', rating: 2, specialty: 'Reactor Lattice Tuning', perk: '+25 MW Power Grid output from Engineering', preferredDistrictIds: ['engineering', 'fabricator'] },
  dominion_medic_tala: { id: 'dominion_medic_tala', factionId: 'dominion', name: 'Tala Rune', role: 'medical', rating: 2, specialty: 'Armored Trauma Surgery', perk: '-50% Injury recovery time for Dominion personnel', preferredDistrictIds: ['habitat'] },
  dominion_support_kray: { id: 'dominion_support_kray', factionId: 'dominion', name: 'Kray Damar', role: 'support', rating: 2, specialty: 'Siege Logistics', perk: '+20% Alloy refinement yield in Fabricator', preferredDistrictIds: ['fabricator', 'logistics'] },
  syndicate_scout_nix: { id: 'syndicate_scout_nix', factionId: 'syndicate', name: 'Nix Ravel', role: 'recon', rating: 2, specialty: 'Deep Infiltration', perk: 'Reveals hidden anomaly signatures without spending extra probes', preferredDistrictIds: ['survey', 'command'] },
  syndicate_tech_aya: { id: 'syndicate_tech_aya', factionId: 'syndicate', name: 'Aya Senn', role: 'technical', rating: 2, specialty: 'Sub-Grid Optimization', perk: '-20% Power consumption across all Deck B facilities', preferredDistrictIds: ['engineering', 'fabricator'] },
  syndicate_medic_lev: { id: 'syndicate_medic_lev', factionId: 'syndicate', name: 'Lev Iora', role: 'medical', rating: 2, specialty: 'Neural Regeneration', perk: '-50% Injury recovery time for Syndicate personnel', preferredDistrictIds: ['habitat'] },
  syndicate_support_kest: { id: 'syndicate_support_kest', factionId: 'syndicate', name: 'Kest Morrow', role: 'support', rating: 2, specialty: 'Black-Market Throughput', perk: '+25% Cargo capacity and credit salvage multiplier', preferredDistrictIds: ['logistics', 'factions'] }
});

export const DOCTRINE_CATALOG = deepFreeze({
  methodical: { id: 'methodical', name: 'Methodical Advance', scoreModifier: 7 },
  rapid: { id: 'rapid', name: 'Rapid Insertion', scoreModifier: 2 },
  containment: { id: 'containment', name: 'Containment Cordon', scoreModifier: 8 },
  covert: { id: 'covert', name: 'Covert Penetration', scoreModifier: 5 }
});

export const SUPPORT_CATALOG = deepFreeze({
  survey_drones: { id: 'survey_drones', name: 'Survey Drone Net', minimumHangarLevel: 1, cost: { probes: 1, fuel: 2 } },
  field_lab: { id: 'field_lab', name: 'Mobile Field Laboratory', minimumHangarLevel: 1, cost: { components: 8, fuel: 2 } },
  medevac: { id: 'medevac', name: 'Medevac Flight', minimumHangarLevel: 2, cost: { credits: 200, fuel: 3 } },
  heavy_lift: { id: 'heavy_lift', name: 'Heavy Lift Package', minimumHangarLevel: 2, cost: { alloys: 10, fuel: 4 } }
});

// These are deployment slots for planetary RTS missions, not space-combat
// weapons. Slot sizes keep the starting force proportional to physical mass
// and strategic function instead of treating every choice as interchangeable.
export const DEPLOYMENT_UNIT_CATALOG = deepFreeze({
  recon_team: { id: 'recon_team', name: 'Recon Team', slotCost: 1, role: 'vision' },
  line_section: { id: 'line_section', name: 'Line Section', slotCost: 2, role: 'combat' },
  support_vehicle: { id: 'support_vehicle', name: 'Support Vehicle', slotCost: 2, role: 'support' },
  armored_element: { id: 'armored_element', name: 'Armored Element', slotCost: 3, role: 'armor' }
});

export const DEPLOYMENT_STRUCTURE_CATALOG = deepFreeze({
  field_relay: { id: 'field_relay', name: 'Field Relay', slotCost: 1, role: 'communications' },
  resource_processor: { id: 'resource_processor', name: 'Resource Processor', slotCost: 2, role: 'economy' },
  defensive_emplacement: { id: 'defensive_emplacement', name: 'Defensive Emplacement', slotCost: 2, role: 'defense' },
  forward_command: { id: 'forward_command', name: 'Forward Command Structure', slotCost: 4, role: 'production' }
});

export const OPERATION_MOD_CATALOG = deepFreeze({
  survey_link: { id: 'survey_link', name: 'Survey Link', slotCost: 1, effect: 'Reveal nearby hazards at deployment.' },
  repair_nanites: { id: 'repair_nanites', name: 'Repair Nanites', slotCost: 1, effect: 'Starting mechanical forces recover minor damage.' },
  medical_cache: { id: 'medical_cache', name: 'Medical Cache', slotCost: 1, effect: 'Reduces post-operation injury severity.' }
});

function mission(id, fields) {
  return {
    id,
    sponsorId: 'uga',
    baseDeploymentCost: { fuel: 6 },
    requiredHangarLevel: 1,
    requiredReadiness: 55,
    requiredLoyalty: 35,
    deploymentCapacity: {
      slots: 8,
      unitLimit: 4,
      structureLimit: 2,
      modLimit: 2,
      requiredUnitIds: ['line_section'],
      allowedUnitIds: Object.keys(DEPLOYMENT_UNIT_CATALOG),
      allowedStructureIds: Object.keys(DEPLOYMENT_STRUCTURE_CATALOG),
      allowedModIds: Object.keys(OPERATION_MOD_CATALOG)
    },
    ...fields
  };
}

export const MISSION_CATALOG = deepFreeze({
  nova_heliograph_wake: mission('nova_heliograph_wake', {
    title: 'Heliograph Wake', missionType: 'faction_conflict', systemId: 'aelos', siteId: 'aelos_heliograph', contractFactionId: 'nova', opponentFactionId: 'dominion', difficulty: 1,
    access: { type: 'faction_exclusive', factionId: 'nova' }, requirements: { intelligence: 1, researchIds: [], discoveryIds: ['aelos_traffic_cipher'] },
    objective: { type: 'secure_relay', targetIds: ['heliograph_control_spine'] },
    landingZoneIds: ['relay_shadow', 'maintenance_spar'], supportIds: ['survey_drones', 'field_lab'], doctrineIds: ['methodical', 'rapid'], recommendedDoctrineId: 'methodical',
    rewards: { credits: 800, alloys: 25, components: 35, bioSamples: 0, researchPoints: 70, fuel: 3, probes: 0, reputation: 8 }
  }),
  dominion_caldris_claim: mission('dominion_caldris_claim', {
    title: 'Caldris Claim', missionType: 'faction_conflict', systemId: 'aelos', siteId: 'aelos_caldris', contractFactionId: 'dominion', opponentFactionId: 'syndicate', difficulty: 1,
    access: { type: 'faction_exclusive', factionId: 'dominion' }, requirements: { intelligence: 1, researchIds: [], discoveryIds: ['aelos_traffic_cipher'] },
    objective: { type: 'hold_infrastructure', targetIds: ['caldris_customs_core'] },
    landingZoneIds: ['customs_ring', 'cargo_lock'], supportIds: ['field_lab', 'heavy_lift'], doctrineIds: ['methodical', 'rapid'], recommendedDoctrineId: 'methodical',
    rewards: { credits: 900, alloys: 35, components: 25, bioSamples: 0, researchPoints: 60, fuel: 3, probes: 0, reputation: 8 }
  }),
  syndicate_black_manifest: mission('syndicate_black_manifest', {
    title: 'Black Manifest', missionType: 'faction_conflict', systemId: 'aelos', siteId: 'aelos_freeport', contractFactionId: 'syndicate', opponentFactionId: 'nova', difficulty: 2,
    access: { type: 'faction_exclusive', factionId: 'syndicate' }, requirements: { intelligence: 1, researchIds: [], discoveryIds: ['aelos_traffic_cipher'] },
    objective: { type: 'recover_manifest', targetIds: ['morrow_archive_stack'] },
    landingZoneIds: ['service_lock', 'freight_shadow'], supportIds: ['survey_drones', 'field_lab'], doctrineIds: ['covert', 'rapid'], recommendedDoctrineId: 'covert',
    rewards: { credits: 1000, alloys: 20, components: 40, bioSamples: 0, researchPoints: 80, fuel: 4, probes: 0, reputation: 9 }
  }),
  nova_orison_recovery: mission('nova_orison_recovery', {
    title: 'Orison Recovery', missionType: 'faction_conflict', systemId: 'veyra', siteId: 'veyra_orison', contractFactionId: 'nova', opponentFactionId: 'syndicate', difficulty: 2,
    access: { type: 'faction_exclusive', factionId: 'nova' }, requirements: { intelligence: 1, researchIds: ['universal_spectral_cartography'], discoveryIds: ['veyra_photon_archive'] },
    objective: { type: 'recover_archive', targetIds: ['orison_memory_vault'] },
    landingZoneIds: ['broken_spine', 'aft_lattice'], supportIds: ['survey_drones', 'field_lab', 'medevac'], doctrineIds: ['methodical', 'covert'], recommendedDoctrineId: 'methodical',
    rewards: { credits: 1250, alloys: 35, components: 55, bioSamples: 0, researchPoints: 130, fuel: 5, probes: 0, reputation: 11 }
  }),
  dominion_lens_perimeter: mission('dominion_lens_perimeter', {
    title: 'Lensing Perimeter', missionType: 'faction_conflict', systemId: 'veyra', siteId: 'veyra_lens', contractFactionId: 'dominion', opponentFactionId: 'nova', difficulty: 3,
    access: { type: 'faction_exclusive', factionId: 'dominion' }, requirements: { intelligence: 1, researchIds: ['universal_spectral_cartography'], discoveryIds: ['veyra_photon_archive'] },
    objective: { type: 'secure_observatory', targetIds: ['lensing_calibration_core'] },
    landingZoneIds: ['umbra_platform', 'coolant_trench'], supportIds: ['field_lab', 'heavy_lift', 'medevac'], doctrineIds: ['methodical', 'rapid'], recommendedDoctrineId: 'methodical',
    rewards: { credits: 1400, alloys: 60, components: 45, bioSamples: 0, researchPoints: 150, fuel: 6, probes: 0, reputation: 12 }
  }),
  syndicate_ossuary_dividend: mission('syndicate_ossuary_dividend', {
    title: 'Ossuary Dividend', missionType: 'faction_conflict', systemId: 'veyra', siteId: 'veyra_ossuary', contractFactionId: 'syndicate', opponentFactionId: 'dominion', difficulty: 3,
    access: { type: 'faction_exclusive', factionId: 'syndicate' }, requirements: { intelligence: 2, researchIds: ['universal_spectral_cartography'], discoveryIds: ['veyra_photon_archive'] },
    objective: { type: 'extract_artifact', targetIds: ['ossuary_phase_engine'] },
    landingZoneIds: ['vault_aperture', 'collapsed_gallery'], supportIds: ['survey_drones', 'field_lab', 'medevac'], doctrineIds: ['covert', 'methodical'], recommendedDoctrineId: 'covert',
    rewards: { credits: 1500, alloys: 40, components: 60, bioSamples: 5, researchPoints: 170, fuel: 6, probes: 0, reputation: 12 }
  }),
  uga_pale_bloom: mission('uga_pale_bloom', {
    title: 'Pale Bloom', missionType: 'uga_brood_purge', systemId: 'karak', siteId: 'karak_meridian', contractFactionId: null, opponentFactionId: 'brood', difficulty: 3,
    access: { type: 'uga_brood_proxy' }, requirements: { intelligence: 2, researchIds: ['uga_brood_containment'], discoveryIds: ['karak_silence_pattern'], infestationRequired: true, hiveTargetsRequired: true },
    objective: { type: 'purge_brood', infestation: true, hiveTargetIds: ['meridian_breeder_nest'], nestCount: 1 },
    landingZoneIds: ['clinic_roof', 'transit_court'], supportIds: ['survey_drones', 'field_lab', 'medevac', 'heavy_lift'], doctrineIds: ['containment', 'methodical', 'rapid'], recommendedDoctrineId: 'containment',
    rewards: { credits: 1800, alloys: 55, components: 65, bioSamples: 28, researchPoints: 210, fuel: 8, probes: 1, reputation: 16 }
  }),
  uga_silent_spine: mission('uga_silent_spine', {
    title: 'Silent Spine', missionType: 'uga_brood_purge', systemId: 'karak', siteId: 'karak_spine', contractFactionId: null, opponentFactionId: 'brood', difficulty: 4,
    access: { type: 'uga_brood_proxy' }, requirements: { intelligence: 3, researchIds: ['uga_brood_containment'], discoveryIds: ['karak_hive_geometry'], infestationRequired: true, hiveTargetsRequired: true, completedMissionIds: ['uga_pale_bloom'] },
    objective: { type: 'purge_brood', infestation: true, hiveTargetIds: ['spine_gestation_cluster', 'spine_feeder_root'], nestCount: 2 },
    landingZoneIds: ['maintenance_shaft', 'sealed_platform'], supportIds: ['field_lab', 'medevac', 'heavy_lift'], doctrineIds: ['containment', 'methodical'], recommendedDoctrineId: 'containment',
    rewards: { credits: 2300, alloys: 75, components: 80, bioSamples: 42, researchPoints: 270, fuel: 10, probes: 1, reputation: 20 }
  }),
  uga_hive_heart: mission('uga_hive_heart', {
    title: 'Hive Heart', missionType: 'uga_brood_purge', systemId: 'karak', siteId: 'karak_hive', contractFactionId: null, opponentFactionId: 'brood', difficulty: 5,
    access: { type: 'uga_brood_proxy' }, requiredHangarLevel: 2, requiredReadiness: 65,
    requirements: { intelligence: 4, researchIds: ['uga_brood_containment'], discoveryIds: ['karak_hive_geometry'], infestationRequired: true, hiveTargetsRequired: true, completedMissionIds: ['uga_silent_spine'] },
    objective: { type: 'purge_brood', infestation: true, hiveTargetIds: ['karak_hive_heart'], nestCount: 1 },
    landingZoneIds: ['vascular_breach', 'thermal_vent'], supportIds: ['field_lab', 'medevac', 'heavy_lift'], doctrineIds: ['containment', 'methodical'], recommendedDoctrineId: 'containment',
    rewards: { credits: 3200, alloys: 110, components: 120, bioSamples: 65, researchPoints: 360, fuel: 14, probes: 2, reputation: 28 }
  })
});

export function validateCatalogs() {
  const errors = [];
  const districtIds = Object.keys(DISTRICT_CATALOG);
  if (districtIds.length !== SHIP_DISTRICT_IDS.length || SHIP_DISTRICT_IDS.some(id => !DISTRICT_CATALOG[id])) {
    errors.push('Ship district catalog must contain the complete eleven-room UGA deck plan.');
  }
  for (const district of Object.values(DISTRICT_CATALOG)) {
    if (district.tiers.length !== 3 || district.tiers.some((tier, index) => tier.level !== index + 1)) {
      errors.push(`${district.id} must define authored tiers 1-3.`);
    }
    if (district.sockets.length !== 3) errors.push(`${district.id} must define exactly three module sockets.`);
    if (district.sockets.some(entry => entry.compatibleModuleIds.some(id => !MODULE_CATALOG[id]))) {
      errors.push(`${district.id} references an unknown module.`);
    }
  }
  for (const system of Object.values(SYSTEM_CATALOG)) {
    if (system.siteIds.some(id => SITE_CATALOG[id]?.systemId !== system.id)) errors.push(`${system.id} has an invalid site reference.`);
  }
  for (const survey of Object.values(SURVEY_CATALOG)) {
    if (!SYSTEM_CATALOG[survey.systemId]) errors.push(`${survey.id} references an unknown system.`);
    if (!DISCOVERY_CATALOG[survey.discoveryId]) errors.push(`${survey.id} references an unknown discovery.`);
  }
  for (const mission of Object.values(MISSION_CATALOG)) {
    const site = SITE_CATALOG[mission.siteId];
    if (!SYSTEM_CATALOG[mission.systemId] || site?.systemId !== mission.systemId) errors.push(`${mission.id} has an invalid system/site target.`);
    if (mission.sponsorId !== 'uga') errors.push(`${mission.id} must be sponsored by UGA.`);
    if (!FACTION_CATALOG[mission.opponentFactionId]) errors.push(`${mission.id} has an unknown opponent.`);
    if (mission.missionType === 'uga_brood_purge') {
      const targets = mission.objective?.hiveTargetIds || [];
      if (mission.opponentFactionId !== 'brood' || mission.objective?.type !== 'purge_brood' || !mission.objective?.infestation || !targets.length) {
        errors.push(`${mission.id} violates UGA Brood purge invariants.`);
      }
      if (targets.some(id => !site?.hiveTargetIds.includes(id))) errors.push(`${mission.id} references an invalid hive target.`);
    }
  }
  return { ok: errors.length === 0, errors };
}
