/* tools/perf-lab/scenario-manifests.mjs
   ============================================================================
   MASSFRONT PERFORMANCE LABORATORY — DETERMINISTIC SCENARIO MANIFESTS
   ----------------------------------------------------------------------------
   Provides deterministic, seeded scenario configurations for performance
   benchmarking across the current one-to-four normal-participant topology.
   The Brood wildcard is a system force, not a fifth normal commander. Its
   authoritative ladder stops at the runtime's real 500-body ceiling; larger
   apparent swarms belong to the separately measured proxy-density contract.

   Strict constraint: ZERO unseeded Math.random in scenario definition or
   spawn generation. Every coordinate, unit type, and combat directive is
   reproducible from the scenario seed.
   ============================================================================ */

/**
 * High-quality 32-bit Mulberry32 PRNG for deterministic load generation.
 * @param {number} seed 32-bit integer seed
 * @returns {() => number} Returns float in [0, 1)
 */
export function createPrng(seed) {
  let s = (seed | 0) ^ 0x6D2B79F5;
  return function next() {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact current chassis indices. Semantic aliases are deliberately forbidden:
 * a stale SUBMARINE=17 once benchmarked the airborne Raptor as a naval unit. */
export const UNIT_ARCHETYPES = Object.freeze({
  STRIKER: 0,
  RHINO: 1,
  GOLIATH: 2,
  THUMPER: 3,
  COMMANDER: 4,
  WASP: 5,
  LONGBOW: 6,
  HORNET: 7,
  TITAN: 8,
  PYRO: 9,
  VULTURE: 10,
  BULWARK: 11,
  RAVAGER: 12,
  ALPHA_RAVAGER: 13,
  CORVETTE: 14,
  DREADNOUGHT: 15,
  BOMBARD: 16,
  RAPTOR: 17,
  SCORCHER: 18,
  CONSTRUCTOR: 19,
  REAPER: 20,
  CINDER: 21,
  LANCER: 22,
  RESONATOR: 23,
  WARDEN: 24,
  KESTREL: 25,
  BASILISK: 26,
  HARBINGER: 27,
  LORD_DARION_VEX: 28,
  BROKER_LYS_RENN: 29,
  BROOD_SOVEREIGN: 30,
  BROOD_TIDECASTER: 31,
  PROSPECTOR: 32
});

const UNIT_NAMES = [
  'Striker','Rhino','Goliath','Thumper','Commander','Wasp','Longbow','Hornet','TITAN','Pyro','Vulture','Bulwark',
  'Ravager','Alpha Ravager','Corvette','Dreadnought','Bombard','Raptor','Scorcher','Constructor','Reaper','Cinder',
  'Lancer','Resonator','Warden','Kestrel','Basilisk','Harbinger','Lord Darion Vex','Broker Lys Renn',
  'The Brood Sovereign','Brood Tidecaster','Prospector'
];
export const UNIT_TYPE_CONTRACTS = Object.freeze(Object.fromEntries(UNIT_NAMES.map((name, index) => [index, Object.freeze({
  index, name, air: index === 5 || index === 17 || index === 25, naval: index === 14 || index === 15
})])));

export function rosterTypeContracts(rosters) {
  const used = new Set();
  for (const entry of rosters) for (const unit of entry.roster || entry) used.add(unit.type);
  return [...used].sort((a, b) => a - b).map(index => {
    const contract = UNIT_TYPE_CONTRACTS[index];
    if (!contract) throw new Error(`No runtime TYPES contract for roster index ${index}`);
    return contract;
  });
}

/**
 * Balanced combined-arms unit composition ratios (percentages sum to 1.0)
 */
export const COMPOSITION_PRESETS = {
  COMBINED_ARMS: [
    { type: UNIT_ARCHETYPES.RHINO, ratio: 0.22 },
    { type: UNIT_ARCHETYPES.GOLIATH, ratio: 0.16 },
    { type: UNIT_ARCHETYPES.THUMPER, ratio: 0.12 },
    { type: UNIT_ARCHETYPES.LONGBOW, ratio: 0.10 },
    { type: UNIT_ARCHETYPES.HORNET, ratio: 0.10 },
    { type: UNIT_ARCHETYPES.REAPER, ratio: 0.10 },
    { type: UNIT_ARCHETYPES.LANCER, ratio: 0.08 },
    { type: UNIT_ARCHETYPES.WASP, ratio: 0.05 },
    { type: UNIT_ARCHETYPES.RAPTOR, ratio: 0.04 },
    { type: UNIT_ARCHETYPES.KESTREL, ratio: 0.03 }
  ],
  SWARM_INFESTATION: [
    { type: UNIT_ARCHETYPES.RAVAGER, ratio: 0.72 },
    { type: UNIT_ARCHETYPES.ALPHA_RAVAGER, ratio: 0.18 },
    { type: UNIT_ARCHETYPES.BROOD_TIDECASTER, ratio: 0.10 }
  ],
  ARMORED_DIVISION: [
    { type: UNIT_ARCHETYPES.RHINO, ratio: 0.32 },
    { type: UNIT_ARCHETYPES.GOLIATH, ratio: 0.28 },
    { type: UNIT_ARCHETYPES.LANCER, ratio: 0.18 },
    { type: UNIT_ARCHETYPES.BASILISK, ratio: 0.10 },
    { type: UNIT_ARCHETYPES.HARBINGER, ratio: 0.08 },
    { type: UNIT_ARCHETYPES.TITAN, ratio: 0.04 }
  ],
  AIR_CAVALRY: [
    { type: UNIT_ARCHETYPES.WASP, ratio: 0.45 },
    { type: UNIT_ARCHETYPES.RAPTOR, ratio: 0.35 },
    { type: UNIT_ARCHETYPES.KESTREL, ratio: 0.20 }
  ]
};

/**
 * Faction configurations
 */
export const FACTION_CONFIGS = {
  NOVA: { key: 'nova', kit: 'nova', commander: 'nova_kai', color: '#58daff' },
  LEGION: { key: 'legion', kit: 'legion', commander: 'legion_vex', color: '#ff482a' },
  SYNDICATE: { key: 'syndicate', kit: 'syndicate', commander: 'syndicate_renn', color: '#5beeb7' },
  BROOD: { key: 'horde', kit: 'horde', commander: 'brood_sovereign', color: '#ba52f5' }
};

/**
 * Population ladder tiers for benchmark matrices
 */
export const POPULATION_LADDERS = Object.freeze([100, 250, 500]);
export const BROOD_AUTHORITATIVE_LADDERS = Object.freeze([100, 250, 500]);
export const BROOD_PROXY_DENSITY_PRESETS = Object.freeze({
  low: Object.freeze({ key: 'low', multiplier: 1, maxBodies: 600, bodiesPerCluster: 60 }),
  medium: Object.freeze({ key: 'medium', multiplier: 3, maxBodies: 1500, bodiesPerCluster: 72 }),
  high: Object.freeze({ key: 'high', multiplier: 6, maxBodies: 3000, bodiesPerCluster: 80 }),
  cinematic: Object.freeze({ key: 'cinematic', multiplier: 10, maxBodies: 5000, bodiesPerCluster: 96 })
});
export const PERF_ACCEPTANCE_UNITS_PER_FACTION = 500;
export const PERF_CURRENT_MAX_SEATS = 5;
export const PERF_CURRENT_MAX_AI_SLOT = 3;
export const PERF_CURRENT_MAX_NORMAL_PARTICIPANTS = 4;

function isBroodSystemForce(spec) {
  return spec?.authorityKind === 'system-force' || spec?.kind === 'brood-wildcard';
}

export function scenarioNormalParticipants(scenario) {
  if (Array.isArray(scenario?.participants)) return scenario.participants;
  return (Array.isArray(scenario?.factions) ? scenario.factions : []).filter(spec => !isBroodSystemForce(spec));
}

export function scenarioSystemForces(scenario) {
  if (Array.isArray(scenario?.systemForces)) return scenario.systemForces;
  return (Array.isArray(scenario?.factions) ? scenario.factions : []).filter(isBroodSystemForce);
}

export function scenarioAuthorities(scenario) {
  return [...scenarioNormalParticipants(scenario), ...scenarioSystemForces(scenario)];
}

export function broodProxyDensityPlan(authoritativeBodies, densityKey = 'high') {
  const density = BROOD_PROXY_DENSITY_PRESETS[densityKey];
  if (!density) throw new Error(`Unknown Brood proxy density: ${densityKey}`);
  if (!BROOD_AUTHORITATIVE_LADDERS.includes(authoritativeBodies)) {
    throw new Error(`Brood authoritative bodies must be one of: ${BROOD_AUTHORITATIVE_LADDERS.join(', ')}`);
  }
  const bodies = Math.min(density.maxBodies, Math.round(authoritativeBodies * density.multiplier));
  return {
    density: density.key,
    authoritativeBodies,
    requestedProxyBodies: bodies,
    requestedProxyClusters: Math.max(1, Math.ceil(bodies / density.bodiesPerCluster)),
    multiplier: density.multiplier,
    maxBodies: density.maxBodies,
    bodiesPerCluster: density.bodiesPerCluster
  };
}

export function benchmarkScenarioSupport(scenario) {
  const participants = scenarioNormalParticipants(scenario);
  const systemForces = scenarioSystemForces(scenario);
  const authorities = [...participants, ...systemForces];
  const explicit = scenario?.support;
  const invalidSlot = participants.find(spec => !Number.isInteger(spec?.slot) || spec.slot < -1 || spec.slot > PERF_CURRENT_MAX_AI_SLOT);
  const duplicateSlot = participants.find((spec, index) => participants.findIndex(other => other.slot === spec.slot) !== index);
  const invalidSystemForce = systemForces.find(spec => spec?.kind !== 'brood-wildcard' || spec?.team !== 2 || spec?.faction?.key !== 'horde');
  const unsupported = explicit?.status === 'unsupported' || participants.length > PERF_CURRENT_MAX_NORMAL_PARTICIPANTS ||
    systemForces.length > 1 || authorities.length > PERF_CURRENT_MAX_SEATS || !!invalidSlot || !!duplicateSlot || !!invalidSystemForce;
  if (unsupported) return {
    status: 'unsupported',
    reason: explicit?.reason || (participants.length > PERF_CURRENT_MAX_NORMAL_PARTICIPANTS
      ? `scenario needs ${participants.length} normal participants; runtime supports ${PERF_CURRENT_MAX_NORMAL_PARTICIPANTS} plus one system force`
      : invalidSlot ? `commander slot ${invalidSlot.slot} exceeds the current -1..${PERF_CURRENT_MAX_AI_SLOT} topology`
        : duplicateSlot ? `normal participants share commander slot ${duplicateSlot.slot}`
          : invalidSystemForce ? 'only one team-2 Brood wildcard is a supported system force'
            : `scenario needs ${authorities.length} authorities; runtime supports ${PERF_CURRENT_MAX_SEATS}`),
    seats: authorities.length,
    normalParticipantCount: participants.length,
    systemForceCount: systemForces.length,
    authorityCount: authorities.length,
    topologyKind: 'normal-participants-plus-system-forces',
    acceptanceUnitsPerFaction: PERF_ACCEPTANCE_UNITS_PER_FACTION,
    acceptanceTotal: authorities.length * PERF_ACCEPTANCE_UNITS_PER_FACTION
  };
  return {
    status: 'supported', reason: null, seats: authorities.length,
    normalParticipantCount: participants.length,
    systemForceCount: systemForces.length,
    authorityCount: authorities.length,
    topologyKind: systemForces.length ? 'normal-participants-plus-system-forces' : 'normal-participants',
    acceptanceUnitsPerFaction: PERF_ACCEPTANCE_UNITS_PER_FACTION,
    acceptanceTotal: authorities.length * PERF_ACCEPTANCE_UNITS_PER_FACTION
  };
}

function defineScenario(config) {
  const participants = Object.freeze([...(config.participants || [])]);
  const systemForces = Object.freeze([...(config.systemForces || [])]);
  return Object.freeze({ ...config, participants, systemForces, factions: Object.freeze([...participants, ...systemForces]) });
}

/**
 * Deterministic Scenario Definitions
 */
export const BENCHMARK_SCENARIOS = {
  // 1v1 MATCHUPS (Duel: 2 Factions)
  '1v1_duel_verdant': defineScenario({
    id: '1v1_duel_verdant',
    name: '1v1 Frontier Duel (Verdant Plains)',
    theatre: 'compact',
    mapSeed: 44019,
    theme: 'verdant',
    mapSpan: 3200,
    participants: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'COMBINED_ARMS' }
    ],
    camera: { x: 1600, y: 1600, zoom: 1200, pitch: 1.19, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 5, action: 'engage_line' },
      { timeSec: 15, action: 'flank_assault' }
    ],
    systemForces: []
  }),
  '1v1_duel_megacity': defineScenario({
    id: '1v1_duel_megacity',
    name: '1v1 Urban Warfare (Obsidian Megacity)',
    theatre: 'compact',
    mapSeed: 88301,
    theme: 'obsidian',
    mapSpan: 3200,
    participants: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'ne', composition: 'COMBINED_ARMS' }
    ],
    camera: { x: 1600, y: 1600, zoom: 1400, pitch: 1.19, yaw: 0.35 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 8, action: 'engage_line' }
    ],
    systemForces: []
  }),

  // 1v2 MATCHUPS (Tri-Faction Skirmish: 3 Factions)
  '1v2_flank_arctic': defineScenario({
    id: '1v2_flank_arctic',
    name: '1v2 Glacial Containment (Arctic Ridge)',
    theatre: 'standard',
    mapSeed: 55192,
    theme: 'arctic',
    mapSpan: 3200,
    participants: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 1, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'se', composition: 'AIR_CAVALRY' }
    ],
    camera: { x: 1600, y: 1600, zoom: 1800, pitch: 1.32, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 6, action: 'engage_line' }
    ],
    systemForces: []
  }),

  // Three normal participants plus the independent Brood wildcard.
  '1v3_crossfire_ashland': defineScenario({
    id: '1v3_crossfire_ashland',
    name: '1v3 Ashland Crossfire (Volcanic Caldera)',
    theatre: 'large',
    mapSeed: 77203,
    theme: 'ashland',
    mapSpan: 3200,
    participants: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 1, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'se', composition: 'AIR_CAVALRY' }
    ],
    systemForces: [
      { authorityKind: 'system-force', kind: 'brood-wildcard', team: 2, runtimeSlot: 3,
        faction: FACTION_CONFIGS.BROOD, spawnZone: 'nw', composition: 'SWARM_INFESTATION',
        authoritativeLadders: BROOD_AUTHORITATIVE_LADDERS, proxyDensities: BROOD_PROXY_DENSITY_PRESETS }
    ],
    camera: { x: 1600, y: 1600, zoom: 2200, pitch: 1.49, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 5, action: 'engage_line' }
    ]
  }),

  // Four normal participants plus one independent system force. This is valid;
  // five normal commander seats remain explicitly unsupported.
  '1v4_continental_conquest': defineScenario({
    id: '1v4_continental_conquest',
    name: '1v4 Continental War (Veridian Prime)',
    theatre: 'large',
    support: { status: 'supported', reason: null },
    mapSeed: 99412,
    theme: 'verdant',
    mapSpan: 3200,
    participants: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 1, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'se', composition: 'AIR_CAVALRY' },
      { team: 1, slot: 2, faction: FACTION_CONFIGS.LEGION, spawnZone: 'nw', composition: 'COMBINED_ARMS' }
    ],
    systemForces: [
      { authorityKind: 'system-force', kind: 'brood-wildcard', team: 2, runtimeSlot: 3,
        faction: FACTION_CONFIGS.BROOD, spawnZone: 'center', composition: 'SWARM_INFESTATION',
        authoritativeLadders: BROOD_AUTHORITATIVE_LADDERS, proxyDensities: BROOD_PROXY_DENSITY_PRESETS }
    ],
    camera: { x: 1600, y: 1600, zoom: 2600, pitch: 1.49, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 5, action: 'engage_line' }
    ]
  })
};

/**
 * Generate deterministic spawn coordinates and unit rosters for a faction
 * @param {object} factionSpec Faction scenario definition
 * @param {number} targetCount Total authoritative population for this authority
 * @param {number} seed Unique deterministic seed
 * @returns {Array<{type: number, team: number, slot: number, x: number, y: number}>}
 */
export function generateDeterministicRoster(factionSpec, targetCount, seed) {
  const prng = createPrng(seed);
  const roster = [];
  const comp = COMPOSITION_PRESETS[factionSpec.composition] || COMPOSITION_PRESETS.COMBINED_ARMS;

  // Determine base anchor coordinate based on spawnZone
  let baseX = 1600, baseY = 1600;
  const margin = 450;
  const span = 3200;
  switch (factionSpec.spawnZone) {
    case 'sw': baseX = margin; baseY = margin; break;
    case 'ne': baseX = span - margin; baseY = span - margin; break;
    case 'se': baseX = span - margin; baseY = margin; break;
    case 'nw': baseX = margin; baseY = span - margin; break;
    case 'center': baseX = span * 0.5; baseY = span * 0.5; break;
  }

  const systemForce = isBroodSystemForce(factionSpec);
  const runtimeSlot = systemForce ? factionSpec.runtimeSlot : factionSpec.slot;
  // A system force gets a deterministic anchor body, not a fifth commander.
  const cmdType = factionSpec.faction.key === 'horde' ? UNIT_ARCHETYPES.BROOD_SOVEREIGN : UNIT_ARCHETYPES.COMMANDER;
  roster.push({
    type: cmdType,
    team: factionSpec.team,
    slot: runtimeSlot,
    x: baseX,
    y: baseY,
    isCommander: !systemForce,
    isSystemAnchor: systemForce
  });

  const remainingCount = targetCount - 1;
  let spawned = 0;

  // Compute exact quota per unit type from ratio
  for (let cIdx = 0; cIdx < comp.length; cIdx++) {
    const entry = comp[cIdx];
    const countForType = cIdx === comp.length - 1
      ? (remainingCount - spawned)
      : Math.round(remainingCount * entry.ratio);

    for (let k = 0; k < countForType; k++) {
      if (spawned >= remainingCount) break;

      // Deterministic formation offset: spiral grid layout with bounded jitter
      const angle = (spawned * 0.381966) * Math.PI * 2; // Golden ratio spiral
      const radius = 35 + Math.sqrt(spawned) * 18 + (prng() - 0.5) * 10;
      const ux = Math.max(90, Math.min(span - 90, baseX + Math.cos(angle) * radius));
      const uy = Math.max(90, Math.min(span - 90, baseY + Math.sin(angle) * radius));

      roster.push({
        type: entry.type,
        team: factionSpec.team,
        slot: runtimeSlot,
        x: Math.round(ux * 10) / 10,
        y: Math.round(uy * 10) / 10,
        isCommander: false
      });
      spawned++;
    }
  }

  return roster;
}
