import { deepFreeze } from './deterministic.js';

export const CONSTRUCTION_JOB_VERSION = 1;
export const CONSTRUCTION_QUEUE_LIMIT = 6;
export const CONSTRUCTION_POWER_PER_SLOT_MW = 6;
export const CONSTRUCTION_EVENT_HISTORY_LIMIT = 128;

export const INITIAL_COMMISSIONED_DISTRICTS = deepFreeze([
  'command', 'navigation', 'survey', 'engineering', 'habitat', 'logistics'
]);

const DISTRICT_NAMES = {
  navigation: 'Navigation Bridge',
  survey: 'Survey Lab',
  mission_ops: 'Mission Operations',
  research: 'Research Directorate',
  fabricator: 'Fabrication & Armory',
  engineering: 'Engineering & Drive',
  habitat: 'Habitat & Medical',
  factions: 'Coalition Embassy',
  hangar: 'Strike & Expedition Bay',
  logistics: 'Logistics & Cargo'
};

const TIER_COSTS = {
  // Facility hardware is a surcharge on the district's existing structural
  // expansion cost. These values keep the required Survey II -> III campaign
  // route affordable from a fresh expedition without making retrofits free.
  2: { credits: 300, alloys: 10, components: 15 },
  3: { credits: 500, alloys: 20, components: 25 }
};

const CHOICES = {
  navigation: {
    2: [
      ['navigation_t2_efficient_routing', 'Efficient Routing', 'Transit fuel cost −15%.', { transitFuelPct: -15 }],
      ['navigation_t2_transit_coordination', 'Transit Coordination', 'Transit adds one work to the oldest construction job.', { transitOldestWork: 1 }]
    ],
    3: [
      ['navigation_t3_fleet_lattice', 'Fleet Route Lattice', 'Transit fuel cost falls by another 10%, capped at 25%.', { transitFuelPct: -10 }],
      ['navigation_t3_continuity_scheduler', 'Continuity Scheduler', 'Transit adds one work to every active construction job.', { transitAllWork: 1 }]
    ]
  },
  survey: {
    2: [
      ['survey_t2_probe_telemetry', 'Probe Telemetry', 'Directed surveys cost one fewer probe, minimum one.', { surveyProbeDiscount: 1 }],
      ['survey_t2_anomaly_filter', 'Anomaly Filter', 'Directed surveys provide one additional intelligence.', { surveyIntelligenceBonus: 1 }]
    ],
    3: [
      ['survey_t3_interstellar_observatory', 'Interstellar Observatory', 'Survey research rewards increase by 25%.', { surveyResearchRewardPct: 25 }],
      ['survey_t3_probe_reclaimer', 'Probe Reclaimer', 'Every second completed survey refunds one probe.', { surveyProbeRefundInterval: 2 }]
    ]
  },
  mission_ops: {
    2: [
      ['mission_ops_t2_readiness_network', 'Readiness Network', 'Operation packages gain one mod slot.', { operationModSlots: 1 }],
      ['mission_ops_t2_debrief_archive', 'Debrief Archive', 'Ground-operation research rewards increase by 15%.', { operationResearchRewardPct: 15 }]
    ],
    3: [
      ['mission_ops_t3_coalition_planner', 'Coalition Planner', 'Ground deployments gain two slots.', { deploymentSlots: 2 }],
      ['mission_ops_t3_casualty_forecasting', 'Casualty Forecasting', 'One operation injury is reduced by one severity band.', { casualtyForecast: 1 }]
    ]
  },
  research: {
    2: [
      ['research_t2_gravitic_computation', 'Gravitic Computation', 'Committed research points produce 20% more progress.', { researchProgressPct: 20 }],
      ['research_t2_xenology_directorate', 'Xenology Directorate', 'Bio-sample rewards increase by 25%.', { bioRewardPct: 25 }]
    ],
    3: [
      ['research_t3_frontier_institute', 'Frontier Institute', 'Committed research points produce another 20% progress.', { researchProgressPct: 20 }],
      ['research_t3_containment_institute', 'Containment Institute', 'Bio-sample research costs fall by 25%.', { bioResearchCostPct: -25, advancedContainment: 1 }]
    ]
  },
  fabricator: {
    2: [
      ['fabricator_t2_precision_forge', 'Precision Forge', 'Construction alloy and component costs fall by 15%.', { constructionMaterialCostPct: -15 }],
      ['fabricator_t2_rapid_tooling', 'Rapid Tooling', 'The oldest active construction job gains one work each cycle.', { cycleOldestWork: 1 }]
    ],
    3: [
      ['fabricator_t3_megaship_yards', 'Megaship Yards', 'Construction gains one additional active slot.', { constructionSlots: 1 }],
      ['fabricator_t3_reclamation_works', 'Reclamation Works', 'Retrofit salvage rises to 60% and cancellation refunds gain 15 points.', { retrofitSalvagePct: 60, cancelRefundBonusPct: 15 }]
    ]
  },
  engineering: {
    2: [
      ['engineering_t2_reactor_baffles', 'Reactor Baffles', 'Ship generation increases by 35 MW.', { powerGenerationMW: 35 }],
      ['engineering_t2_drive_tuner', 'Drive Tuner', 'Transit fuel cost falls by 12%.', { transitFuelPct: -12 }]
    ],
    3: [
      ['engineering_t3_civilization_grid', 'Civilization Grid', 'Ship generation increases by 65 MW.', { powerGenerationMW: 65 }],
      ['engineering_t3_thermal_reclaimer', 'Thermal Reclaimer', 'Active construction draws only 3 MW per slot.', { constructionPowerPerSlotMW: 3 }]
    ]
  },
  habitat: {
    2: [
      ['habitat_t2_recovery_ward', 'Recovery Ward', 'Personnel injuries recover one cycle sooner.', { personnelRecoveryCycles: -1 }],
      ['habitat_t2_civilian_works', 'Civilian Works', 'The oldest district expansion gains one work every second cycle.', { districtWorkEverySecondCycle: 1 }]
    ],
    3: [
      ['habitat_t3_trauma_institute', 'Trauma Institute', 'Operation injury severity falls by one band.', { injurySeverityBands: -1 }],
      ['habitat_t3_arcology_workforce', 'Arcology Workforce', 'Every active district expansion gains one work every second cycle.', { allDistrictWorkEverySecondCycle: 1 }]
    ]
  },
  factions: {
    2: [
      ['factions_t2_diplomatic_forum', 'Diplomatic Forum', 'Faction reputation gains increase by 15%.', { factionReputationPct: 15 }],
      ['factions_t2_readiness_office', 'Readiness Office', 'Faction recovery is one cycle shorter.', { factionRecoveryCycles: -1 }]
    ],
    3: [
      ['factions_t3_accord_council', 'Accord Council', 'Faction reputation and positive loyalty gains increase by 25%.', { factionReputationPct: 25, factionLoyaltyPct: 25 }],
      ['factions_t3_joint_command', 'Joint Command', 'One ready specialist may come from another resident faction.', { crossFactionSpecialists: 1 }]
    ]
  },
  hangar: {
    2: [
      ['hangar_t2_support_bay', 'Support Bay', 'Ground deployments gain two slots.', { deploymentSlots: 2 }],
      ['hangar_t2_medevac_cradle', 'Medevac Cradle', 'Deployed personnel injuries recover one cycle sooner.', { personnelRecoveryCycles: -1 }]
    ],
    3: [
      ['hangar_t3_heavy_lift_complex', 'Heavy-Lift Complex', 'Ground deployments gain another four slots.', { deploymentSlots: 4 }],
      ['hangar_t3_rapid_turnaround', 'Rapid Turnaround', 'Faction and personnel recovery are one cycle shorter.', { personnelRecoveryCycles: -1, factionRecoveryCycles: -1 }]
    ]
  },
  logistics: {
    2: [
      ['logistics_t2_salvage_sorting', 'Salvage Sorting', 'Alloy and component rewards increase by 15%.', { materialRewardPct: 15 }],
      ['logistics_t2_probe_magazine', 'Probe Magazine', 'System transit restores one probe.', { transitProbeRestore: 1 }]
    ],
    3: [
      ['logistics_t3_deep_stores', 'Deep Stores', 'Alloy, component, and bio-sample rewards increase by 20%.', { materialRewardPct: 20, bioRewardPct: 20 }],
      ['logistics_t3_autonomous_resupply', 'Autonomous Resupply', 'A successful ground operation restores one probe and five fuel.', { victoryProbeRestore: 1, victoryFuelRestore: 5 }]
    ]
  }
};

function facility(id, districtId, tier, name, description, effects, index) {
  const base = TIER_COSTS[tier];
  return {
    id,
    districtId,
    tier,
    plotId: `tier${tier}`,
    name,
    description,
    effects,
    powerDrawMW: tier === 2 ? 7 + index * 2 : 12 + index * 3,
    cost: { ...base, credits: base.credits + index * 120, components: base.components + index * 8 }
  };
}

const facilities = {};
for (const [districtId, tiers] of Object.entries(CHOICES)) {
  facilities[`${districtId}_tier1_core`] = {
    id: `${districtId}_tier1_core`,
    districtId,
    tier: 1,
    plotId: 'tier1',
    name: `${DISTRICT_NAMES[districtId]} Core`,
    description: `Required operating core for ${DISTRICT_NAMES[districtId]}.`,
    effects: {},
    powerDrawMW: 0,
    cost: {}
  };
  for (const [tierText, entries] of Object.entries(tiers)) {
    const tier = Number(tierText);
    entries.forEach((entry, index) => {
      facilities[entry[0]] = facility(entry[0], districtId, tier, entry[1], entry[2], entry[3], index);
    });
  }
}

export const CONSTRUCTION_FACILITY_CATALOG = deepFreeze(facilities);

export function getFacilityChoices(districtId, tier) {
  return Object.values(CONSTRUCTION_FACILITY_CATALOG).filter(entry => entry.districtId === districtId && entry.tier === tier);
}

export function getCoreFacilityId(districtId) {
  return districtId === 'command' ? 'command_core' : `${districtId}_tier1_core`;
}
