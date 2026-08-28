/* tools/perf-lab/scenario-manifests.mjs
   ============================================================================
   MASSFRONT PERFORMANCE LABORATORY — DETERMINISTIC SCENARIO MANIFESTS
   ----------------------------------------------------------------------------
   Provides deterministic, seeded scenario configurations for performance
   benchmarking across the current 1v1, 1v2 and 1v3 match topology at
   population ladders of 100, 250, 500, 750, and 1000 units per faction.
   The authored 1v4 case remains visible but explicitly UNSUPPORTED until the
   runtime has a fifth seat; slot 3 must never be aliased onto the player.

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

/**
 * Standard unit archetypes mapped to runtime TYPES index and role
 */
export const UNIT_ARCHETYPES = {
  SCOUT: 0,
  LIGHT_TANK: 1,
  HEAVY_TANK: 2,
  ARTILLERY: 3,
  COMMANDER: 4,
  FLAK_AA: 5,
  MISSILE_TRUCK: 6,
  ASSAULT_WALKER: 7,
  HEAVY_WALKER: 8,
  TITAN: 9,
  GUNSHIP: 10,
  INTERCEPTOR: 11,
  BROOD_SWARM: 12,
  BROOD_RAVAGER: 13,
  BROOD_TITAN: 30,
  BROOD_CASTER: 31,
  BROOD_MINER: 32,
  GUNBOAT: 14,
  CRUISER: 15,
  BATTLESHIP: 16,
  SUBMARINE: 17,
  CARRIER: 18,
  CONSTRUCTOR: 19
};

/**
 * Balanced combined-arms unit composition ratios (percentages sum to 1.0)
 */
export const COMPOSITION_PRESETS = {
  COMBINED_ARMS: [
    { type: UNIT_ARCHETYPES.LIGHT_TANK, ratio: 0.30 },
    { type: UNIT_ARCHETYPES.HEAVY_TANK, ratio: 0.25 },
    { type: UNIT_ARCHETYPES.MISSILE_TRUCK, ratio: 0.15 },
    { type: UNIT_ARCHETYPES.ASSAULT_WALKER, ratio: 0.10 },
    { type: UNIT_ARCHETYPES.GUNSHIP, ratio: 0.12 },
    { type: UNIT_ARCHETYPES.INTERCEPTOR, ratio: 0.05 },
    { type: UNIT_ARCHETYPES.TITAN, ratio: 0.03 }
  ],
  SWARM_INFESTATION: [
    { type: UNIT_ARCHETYPES.BROOD_SWARM, ratio: 0.45 },
    { type: UNIT_ARCHETYPES.BROOD_RAVAGER, ratio: 0.35 },
    { type: UNIT_ARCHETYPES.BROOD_CASTER, ratio: 0.12 },
    { type: UNIT_ARCHETYPES.BROOD_TITAN, ratio: 0.08 }
  ],
  ARMORED_DIVISION: [
    { type: UNIT_ARCHETYPES.HEAVY_TANK, ratio: 0.40 },
    { type: UNIT_ARCHETYPES.ARTILLERY, ratio: 0.25 },
    { type: UNIT_ARCHETYPES.MISSILE_TRUCK, ratio: 0.20 },
    { type: UNIT_ARCHETYPES.HEAVY_WALKER, ratio: 0.15 }
  ],
  AIR_CAVALRY: [
    { type: UNIT_ARCHETYPES.INTERCEPTOR, ratio: 0.40 },
    { type: UNIT_ARCHETYPES.GUNSHIP, ratio: 0.40 },
    { type: UNIT_ARCHETYPES.LIGHT_TANK, ratio: 0.20 }
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
export const POPULATION_LADDERS = [100, 250, 500, 750, 1000];
export const PERF_ACCEPTANCE_UNITS_PER_FACTION = 500;
export const PERF_CURRENT_MAX_SEATS = 4;
export const PERF_CURRENT_MAX_AI_SLOT = 2;

export function benchmarkScenarioSupport(scenario) {
  const factions = Array.isArray(scenario?.factions) ? scenario.factions : [];
  const explicit = scenario?.support;
  const invalidSlot = factions.find(spec => !Number.isInteger(spec?.slot) || spec.slot < -1 || spec.slot > PERF_CURRENT_MAX_AI_SLOT);
  const unsupported = explicit?.status === 'unsupported' || factions.length > PERF_CURRENT_MAX_SEATS || !!invalidSlot;
  if (unsupported) return {
    status: 'unsupported',
    reason: explicit?.reason || (invalidSlot
      ? `commander slot ${invalidSlot.slot} exceeds the current -1..${PERF_CURRENT_MAX_AI_SLOT} topology`
      : `scenario needs ${factions.length} seats; runtime supports ${PERF_CURRENT_MAX_SEATS}`),
    seats: factions.length,
    acceptanceUnitsPerFaction: PERF_ACCEPTANCE_UNITS_PER_FACTION,
    acceptanceTotal: factions.length * PERF_ACCEPTANCE_UNITS_PER_FACTION
  };
  return {
    status: 'supported', reason: null, seats: factions.length,
    acceptanceUnitsPerFaction: PERF_ACCEPTANCE_UNITS_PER_FACTION,
    acceptanceTotal: factions.length * PERF_ACCEPTANCE_UNITS_PER_FACTION
  };
}

/**
 * Deterministic Scenario Definitions
 */
export const BENCHMARK_SCENARIOS = {
  // 1v1 MATCHUPS (Duel: 2 Factions)
  '1v1_duel_verdant': {
    id: '1v1_duel_verdant',
    name: '1v1 Frontier Duel (Verdant Plains)',
    theatre: 'compact',
    mapSeed: 44019,
    theme: 'verdant',
    mapSpan: 3200,
    factions: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'COMBINED_ARMS' }
    ],
    camera: { x: 1600, y: 1600, zoom: 1200, pitch: 1.19, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 5, action: 'engage_line' },
      { timeSec: 15, action: 'flank_assault' }
    ]
  },
  '1v1_duel_megacity': {
    id: '1v1_duel_megacity',
    name: '1v1 Urban Warfare (Obsidian Megacity)',
    theatre: 'compact',
    mapSeed: 88301,
    theme: 'obsidian',
    mapSpan: 3200,
    factions: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'ne', composition: 'COMBINED_ARMS' }
    ],
    camera: { x: 1600, y: 1600, zoom: 1400, pitch: 1.19, yaw: 0.35 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 8, action: 'engage_line' }
    ]
  },

  // 1v2 MATCHUPS (Tri-Faction Skirmish: 3 Factions)
  '1v2_flank_arctic': {
    id: '1v2_flank_arctic',
    name: '1v2 Glacial Containment (Arctic Ridge)',
    theatre: 'standard',
    mapSeed: 55192,
    theme: 'arctic',
    mapSpan: 3200,
    factions: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 1, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'se', composition: 'AIR_CAVALRY' }
    ],
    camera: { x: 1600, y: 1600, zoom: 1800, pitch: 1.32, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 6, action: 'engage_line' }
    ]
  },

  // 1v3 MATCHUPS (4 Factions: All Playable + Brood Swarm)
  '1v3_crossfire_ashland': {
    id: '1v3_crossfire_ashland',
    name: '1v3 Ashland Crossfire (Volcanic Caldera)',
    theatre: 'large',
    mapSeed: 77203,
    theme: 'ashland',
    mapSpan: 3200,
    factions: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 1, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'se', composition: 'AIR_CAVALRY' },
      { team: 2, slot: 2, faction: FACTION_CONFIGS.BROOD, spawnZone: 'nw', composition: 'SWARM_INFESTATION' }
    ],
    camera: { x: 1600, y: 1600, zoom: 2200, pitch: 1.49, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 5, action: 'engage_line' }
    ]
  },

  // 1v4 MATCHUPS (5 Factions / Bases: Total Continental War)
  '1v4_continental_conquest': {
    id: '1v4_continental_conquest',
    name: '1v4 Continental War (Veridian Prime)',
    theatre: 'large',
    support: {
      status: 'unsupported',
      reason: 'Requires a fifth-seat/commander adapter; current runtime supports player plus three AI seats.'
    },
    mapSeed: 99412,
    theme: 'verdant',
    mapSpan: 3200,
    factions: [
      { team: 0, slot: -1, faction: FACTION_CONFIGS.NOVA, spawnZone: 'sw', composition: 'COMBINED_ARMS' },
      { team: 1, slot: 0, faction: FACTION_CONFIGS.LEGION, spawnZone: 'ne', composition: 'ARMORED_DIVISION' },
      { team: 1, slot: 1, faction: FACTION_CONFIGS.SYNDICATE, spawnZone: 'se', composition: 'AIR_CAVALRY' },
      { team: 1, slot: 2, faction: FACTION_CONFIGS.LEGION, spawnZone: 'nw', composition: 'COMBINED_ARMS' },
      { team: 2, slot: 3, faction: FACTION_CONFIGS.BROOD, spawnZone: 'center', composition: 'SWARM_INFESTATION' }
    ],
    camera: { x: 1600, y: 1600, zoom: 2600, pitch: 1.49, yaw: 0 },
    combatDirectives: [
      { timeSec: 0, action: 'advance_to_center' },
      { timeSec: 5, action: 'engage_line' }
    ]
  }
};

/**
 * Generate deterministic spawn coordinates and unit rosters for a faction
 * @param {object} factionSpec Faction scenario definition
 * @param {number} targetCount Total unit population for this faction (e.g. 500, 1000)
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

  // Always prepend Commander
  const cmdType = factionSpec.faction.key === 'horde' ? UNIT_ARCHETYPES.BROOD_TITAN : UNIT_ARCHETYPES.COMMANDER;
  roster.push({
    type: cmdType,
    team: factionSpec.team,
    slot: factionSpec.slot,
    x: baseX,
    y: baseY,
    isCommander: true
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
        slot: factionSpec.slot,
        x: Math.round(ux * 10) / 10,
        y: Math.round(uy * 10) / 10,
        isCommander: false
      });
      spawned++;
    }
  }

  return roster;
}
