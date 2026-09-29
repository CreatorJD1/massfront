/* --------------------------------------------------------------------------
   MASSFRONT — UGA COMMAND OVERLAY

   The cutaway itself is always the shared Three.js scene. This module only
   supplies controls and information around the canvas; it deliberately has no
   illustrated ship, CSS district map, or raster backdrop.
   -------------------------------------------------------------------------- */

import {
  CAMPAIGN_HUB_PRIMARY_NAV,
  CAMPAIGN_HUB_QUICK_NAV,
  CAMPAIGN_HUB_ROUTES,
  CAMPAIGN_HUB_ROUTE_STATUS,
  CAMPAIGN_HUB_SERVICE_GROUPS,
  campaignHubRouteIsReachable,
  campaignHubSessionIsReachable,
  getCampaignHubRoute,
  getCampaignHubSessionType
} from './campaign_hub_registry.js?v=20260908-commandhome2';
import { commitResearch } from '../domain/progression.js';
import { calculateFacilityCapabilities } from '../domain/construction.js';
import { COMMANDER_ROSTER_IDS } from '../domain/commander_roster_contract.js';
import { readAccountLedger, subscribeAccountLedger } from '../domain/account_ledger.js';
import { deriveGroundControl, groundControlSummary, isGroundAreaUnlocked, isGroundMapUnlocked } from '../domain/ground_control.js';
import { resolveBaseRuntimeUrl } from '../host/base_runtime_url.js';

const CAMPAIGN_HUB_SESSION_ROUTE_IDS = new Set([
  'classic', 'training', 'standard', 'campaign', 'weekly', 'mmo', 'coop'
]);

const DISTRICT_ORDER = [
  'command', 'navigation', 'survey', 'mission_ops', 'research', 'fabricator', 'engineering',
  'habitat', 'factions', 'hangar', 'logistics'
];

const DISTRICT_DEFAULTS = Object.freeze({
  command: {
    id: 'command', name: 'Command Core', eyebrow: 'UGA CIVILIZATION AUTHORITY', fixed: true,
    description: 'Strategic control, expedition governance, diplomacy, and simulation access.',
    activity: 'Command watch active',
    features: ['Expedition governance', 'Civilization telemetry', 'Classic Modes terminal'],
    sockets: []
  },
  navigation: {
    id: 'navigation', name: 'Navigation Bridge', eyebrow: 'COMMAND DISTRICT',
    description: 'Plans autopilot routes, orbital approaches, fuel use, and safe expedition returns.',
    activity: 'Astrogation watch active',
    features: ['System routes', 'Hazard-aware navigation', 'Emergency return planning'],
    sockets: [
      ['navigation-route', 'Route Computation', ['route_predictor']],
      ['navigation-orbit', 'Orbital Control', ['orbit_scheduler']],
      ['navigation-hazard', 'Hazard Intelligence', ['transit_archive']]
    ]
  },
  survey: {
    id: 'survey', name: 'Survey Lab', eyebrow: 'SCIENCE DISTRICT',
    description: 'Processes orbital scans, probe telemetry, and authored planetary discoveries.',
    activity: 'Cartography teams correlating returns',
    features: ['Directed orbital scans', 'Probe signal analysis', 'Deep-site triangulation'],
    sockets: [
      ['survey-analysis', 'Analysis Rack', ['spectral_array', 'xenology_console']],
      ['survey-probe', 'Probe Interface', ['probe_uplink', 'deep_range_link']],
      ['survey-archive', 'Archive Core', ['survey_archive', 'anomaly_index']]
    ]
  },
  mission_ops: {
    id: 'mission_ops', name: 'Mission Operations', eyebrow: 'OPERATIONS DISTRICT',
    description: 'Converts survey intelligence into contracts, readiness checks, landing plans, and debriefs.',
    activity: 'Ground-link telemetry synchronized',
    features: ['Contract review', 'Landing-zone comparison', 'Persistent operation debriefs'],
    sockets: [
      ['mission-ops-table', 'Planning Systems', ['operation_table']],
      ['mission-ops-ready', 'Readiness Systems', ['readiness_net']],
      ['mission-ops-debrief', 'Debrief Systems', ['debrief_archive']]
    ]
  },
  research: {
    id: 'research', name: 'Research Directorate', eyebrow: 'SCIENCE DISTRICT',
    description: 'Commits shared research points to UGA, universal, and faction programs.',
    activity: 'Laboratory shifts operating',
    features: ['UGA research branch', 'Universal research branch', 'Faction research branch'],
    sockets: [
      ['research-wetlab', 'Wet Lab', ['bio_isolation', 'sample_forge']],
      ['research-compute', 'Compute Vault', ['quantum_simulator', 'doctrine_matrix']],
      ['research-contain', 'Containment Cell', ['brood_containment', 'medical_quarantine']]
    ]
  },
  fabricator: {
    id: 'fabricator', name: 'Fabrication & Armory', eyebrow: 'INDUSTRIAL DISTRICT',
    description: 'Converts alloys and components into expedition hardware and ship modules.',
    activity: 'Assembly gantries cycling',
    features: ['Module fabrication', 'Probe production', 'Component reclamation'],
    sockets: [
      ['fabricator-line', 'Assembly Line', ['precision_forge', 'rapid_tooling']],
      ['fabricator-feed', 'Material Feed', ['alloy_refiner', 'salvage_sorter']],
      ['fabricator-qc', 'Quality Cell', ['metrology_suite', 'stress_scanner']]
    ]
  },
  engineering: {
    id: 'engineering', name: 'Engineering & Drive', eyebrow: 'PROPULSION DISTRICT',
    description: 'Maintains the NEXUS-VII drive, power distribution, hull systems, and course endurance.',
    activity: 'Drive crews on rotation',
    features: ['Drive efficiency', 'Transit endurance', 'Exterior engine refit'],
    sockets: [
      ['engineering-drive', 'Drive Socket', ['vector_coils', 'thermal_baffles']],
      ['engineering-grid', 'Power Grid', ['grid_balancer', 'reserve_capacitor']],
      ['engineering-hull', 'Hull Works', ['damage_control', 'armor_lattice']]
    ]
  },
  habitat: {
    id: 'habitat', name: 'Habitat & Medical', eyebrow: 'CIVILIAN DISTRICT',
    description: 'Supports population capacity, recovery, health, and visible civilian life.',
    activity: 'Civilian concourse populated',
    features: ['Population capacity', 'Injury recovery', 'Civilian activity'],
    sockets: [
      ['habitat-medical', 'Medical Wing', ['trauma_center', 'recovery_theatre']],
      ['habitat-life', 'Life Support', ['biosphere_loop', 'water_reclaimer']],
      ['habitat-civic', 'Civic Block', ['family_quarters', 'commons_deck']]
    ]
  },
  factions: {
    id: 'factions', name: 'Coalition Embassy', eyebrow: 'DIPLOMATIC DISTRICT',
    description: 'Houses permanent Nova, Dominion, and Syndicate resident delegations.',
    activity: 'Embassy concourse monitored',
    features: ['One resident faction', 'Two resident factions', 'All resident factions'],
    sockets: [
      ['factions-nova', 'Nova Annex', ['nova_embassy', 'nova_readiness']],
      ['factions-dominion', 'Dominion Annex', ['dominion_embassy', 'dominion_readiness']],
      ['factions-syndicate', 'Syndicate Annex', ['syndicate_embassy', 'syndicate_readiness']]
    ]
  },
  hangar: {
    id: 'hangar', name: 'Strike & Expedition Bay', eyebrow: 'OPERATIONS DISTRICT',
    description: 'Stages each commander, command chassis, specialists, and expedition package around that commander\'s faction-authentic HQ deployment ship.',
    activity: 'HQ deployment carrier and expedition crews at readiness',
    features: ['Commander HQ deployment carrier', 'Command chassis and specialist muster', 'Starting-force cargo integration'],
    sockets: [
      ['hangar-command', 'Command Bay', ['tactical_uplink', 'field_intelligence']],
      ['hangar-support', 'Support Bay', ['medical_drop', 'survey_beacon']],
      ['hangar-flight', 'Flight Deck', ['rapid_launch', 'heavy_lift']]
    ]
  },
  logistics: {
    id: 'logistics', name: 'Logistics & Cargo', eyebrow: 'SUPPLY DISTRICT',
    description: 'Controls expedition stores, cargo throughput, fuel, probes, and manifests.',
    activity: 'Cargo trams routing',
    features: ['Expanded stores', 'Automated manifests', 'High-throughput cargo grid'],
    sockets: [
      ['logistics-cargo', 'Cargo Grid', ['dense_racking', 'priority_lanes']],
      ['logistics-fuel', 'Fuel Handling', ['cryogenic_cells', 'transfer_manifold']],
      ['logistics-probe', 'Probe Magazine', ['probe_carousel', 'field_reloader']]
    ]
  }
});

const RESOURCE_META = Object.freeze({
  credits: ['Credits', 'credit'],
  alloys: ['Alloys', 'alloy'],
  components: ['Components', 'component'],
  bioSamples: ['Bio Samples', 'bio'],
  researchPoints: ['Research', 'research'],
  fuel: ['Fuel', 'fuel'],
  probes: ['Probes', 'probe']
});

const PERSONNEL_PORTRAIT_MIN_WIDTH = 512;
const PERSONNEL_PORTRAIT_MIN_HEIGHT = 640;
const PERSONNEL_PORTRAIT_MIN_ASPECT = 0.6;
const PERSONNEL_PORTRAIT_MAX_ASPECT = 1;

// This is an allowlist, not a fallback catalog. Only final, art-approved,
// original illustrations belong at these paths. Missing cosmetic files never
// revoke domain personnel readiness or substitute another character's face.
export const UGA_PERSONNEL_PORTRAIT_CONTRACT = Object.freeze({
  ...Object.fromEntries(COMMANDER_ROSTER_IDS.map(id => [id, Object.freeze({ kind: 'commander', approved: true, basePortrait: true, path: `../../../../assets/factions/commanders/${id}.jpg` })])),
  nova_scout_ilan: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-ilan-reeve.webp' }),
  nova_tech_sumi: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-sumi-kade.webp' }),
  nova_medic_orr: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-orr-sato.webp' }),
  nova_support_vik: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-vik-arden.webp' }),
  dominion_scout_brann: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-brann-holt.webp' }),
  dominion_tech_vesk: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-vesk-orra.webp' }),
  dominion_medic_tala: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-tala-rune.webp' }),
  dominion_support_kray: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-kray-damar.webp' }),
  syndicate_scout_nix: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-nix-ravel.webp' }),
  syndicate_tech_aya: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-aya-senn.webp' }),
  syndicate_medic_lev: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-lev-iora.webp' }),
  syndicate_support_kest: Object.freeze({ kind: 'specialist', approved: true, path: '../../assets/runtime/personnel/specialist-kest-morrow.webp' })
});

const ICON_PATHS = Object.freeze({
  crest: '<path d="M12 1.8 20.2 5v6.1c0 5.1-3.5 9.3-8.2 11.1-4.7-1.8-8.2-6-8.2-11.1V5L12 1.8Z"/><path d="m8.1 14.6 3.9-9 3.9 9-3.9-2.2-3.9 2.2Z"/>',
  close: '<path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8"/>',
  overview: '<path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="5"/>',
  command: '<path d="M4 8.3 12 3l8 5.3v7.4L12 21l-8-5.3V8.3Z"/><circle cx="12" cy="12" r="3.1"/><path d="M12 3v6M20 8.3l-5.2 3M20 15.7l-5.2-3M12 21v-6M4 15.7l5.2-3M4 8.3l5.2 3"/>',
  navigation: '<circle cx="12" cy="12" r="8.5"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5 5-2.2Z"/><path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2"/>',
  survey: '<circle cx="9.5" cy="9.5" r="5.5"/><path d="m13.6 13.6 6.2 6.2M9.5 6.5v6M6.5 9.5h6"/>',
  mission_ops: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M7 10h4M7 14h7M17 10v5"/>',
  research: '<path d="M9 3h6M10 3v6l-5.5 9.1A1.9 1.9 0 0 0 6.1 21h11.8a1.9 1.9 0 0 0 1.6-2.9L14 9V3"/><path d="M7.5 16h9"/>',
  fabricator: '<path d="M4 7h16v10H4zM8 3v4M16 3v4M8 17v4M16 17v4"/><path d="m9 12 2 2 4-4"/>',
  engineering: '<path d="m8.2 4.4 1.2 2.8-2.2 2.2-2.8-1.2L3 11.6l2.8 1.2v3.1l-2.1 2.1 2.3 2.3 2.1-2.1h3.1l1.2 2.8 3.4-1.4-1.2-2.8 2.2-2.2 2.8 1.2 1.4-3.4-2.8-1.2V8.1l2.1-2.1L18 3.7l-2.1 2.1h-3.1L11.6 3 8.2 4.4Z"/><circle cx="11.8" cy="12" r="2.6"/>',
  habitat: '<path d="M12 20s-7.8-4.4-7.8-10.5A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.8 2.2C19.8 15.6 12 20 12 20Z"/><path d="M12 7.4v7.2M8.4 11h7.2"/>',
  factions: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.8 20c.3-4.3 2-6.5 5.2-6.5s4.9 2.2 5.2 6.5M13.2 15c1-.9 2.2-1.4 3.8-1.4 2.7 0 4.1 2.1 4.3 6.4"/>',
  hangar: '<path d="M3 20V8l9-5 9 5v12M7 20v-8h10v8"/><path d="M9 16h6M12 13v6"/>',
  logistics: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 7 9 5 9-5v10l-9 5-9-5V7Z"/><path d="M12 12v10"/>',
  credit: '<path d="M16.5 7.2A6 6 0 1 0 16.5 16.8M14.5 9.2c-.7-.8-1.6-1.2-2.7-1.2-2 0-3.4 1.6-3.4 4s1.4 4 3.4 4c1.1 0 2-.4 2.7-1.2"/>',
  alloy: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z"/><path d="m7.4 8.7 4.6-2.6 4.6 2.6v5.2L12 16.5l-4.6-2.6V8.7Z"/>',
  component: '<path d="M7 3v4M17 3v4M7 17v4M17 17v4M3 7h4M17 7h4M3 17h4M17 17h4"/><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 10h4v4h-4z"/>',
  bio: '<path d="M12 2c3.3 4 6 6.9 6 11a6 6 0 0 1-12 0c0-4.1 2.7-7 6-11Z"/><path d="M9 14c.5 1.6 1.5 2.4 3 2.4"/>',
  fuel: '<path d="M7 3h9v18H7zM9 6h5v5H9zM16 8h2l2 2v7a2 2 0 0 1-4 0"/>',
  probe: '<path d="m12 2 3.6 6.4L12 22 8.4 8.4 12 2Z"/><path d="m8.5 10-4 3v5l5.5-2M15.5 10l4 3v5L14 16"/><circle cx="12" cy="9" r="1.5"/>',
  build: '<path d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-7h6v7"/>',
  upgrade: '<path d="m12 3 6 6h-4v5h-4V9H6l6-6Z"/><path d="M5 20h14"/>',
  inventory: '<path d="M4 5h16v4H4zM5 9h14v11H5zM9 13h6"/>',
  intel: '<path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>',
  contracts: '<path d="M7 3h10v3h3v15H4V6h3V3Z"/><path d="M8 11h8M8 15h8"/>',
  check: '<path d="m5 12.5 4.3 4.3L19 7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 16h5"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  power: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  staff: '<circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>',
  synergy: '<circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/><path d="m11 11 2 2"/>',
  sector_func: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polygon points="2 17 12 22 22 17 12 12 2 17"/><polygon points="2 12 12 17 22 12 12 7 2 12"/>',
  sector_civil: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2v3H9zm4 0h2v3h-2zm-4 5h2v3H9zm4 0h2v3h-2z"/>'
});

function icon(name, className = '') {
  const body = ICON_PATHS[name] || ICON_PATHS.command;
  return `<svg class="uga-svg ${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function commandVisual(kind, label) {
  return `<div class="uga-command-visual is-${escapeHtml(kind)}" role="img" aria-label="${escapeHtml(label)}"><i aria-hidden="true"></i></div>`;
}

const UGA_DISTRICT_VISUAL_KIND = Object.freeze({
  command: 'concourse',
  navigation: 'navigation',
  survey: 'survey',
  mission_ops: 'contracts',
  research: 'research',
  fabricator: 'arsenal',
  engineering: 'engineering',
  embassy: 'embassy',
  factions: 'embassy',
  habitat: 'habitat',
  hangar: 'hangar',
  logistics: 'logistics'
});

function districtVisualKind(districtId) {
  return UGA_DISTRICT_VISUAL_KIND[districtId] || 'concourse';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.entries(value).map(([id, item]) => ({ id, ...item }));
  return [];
}

function formatValue(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return Math.round(number).toLocaleString();
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const result = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(result[key], value) : value;
  }
  return result;
}

function normalizeSocket(socket, index) {
  if (Array.isArray(socket)) return {
    id: socket[0], name: socket[1], compatibleModuleTypes: socket[2] || [], unlockTier: index + 1
  };
  return {
    id: socket.id || `socket-${index + 1}`,
    name: socket.name || socket.label || `Module Socket ${index + 1}`,
    compatibleModuleTypes: socket.compatibleModuleTypes || socket.modules || [],
    unlockTier: Number(socket.unlockTier || socket.tier || index + 1)
  };
}

function normalizeDistrict(id, catalog = {}) {
  const fallback = DISTRICT_DEFAULTS[id];
  const raw = catalog[id] || asArray(catalog).find(item => item.id === id) || {};
  const sockets = (raw.sockets || fallback.sockets || []).map(normalizeSocket);
  const staffSlots = raw.staffSlots || fallback.staffSlots || [];
  const sector = raw.sector || fallback.sector || (['habitat', 'factions', 'logistics'].includes(id) ? 'civil' : 'function');
  const deck = raw.deck || (['command', 'navigation', 'survey', 'mission_ops'].includes(id) ? 'A' : ['research', 'fabricator', 'engineering'].includes(id) ? 'B' : 'C');
  // Deck letters are still domain IDs, but player-facing zones follow their
  // actual position in the longitudinal NEXUS-VII cutaway.
  const deckName = deck === 'A' ? 'Forward · Command' : deck === 'B' ? 'Upper · Ship Systems' : 'Lower · Crew & Bay';
  const authoredTierFeatures = Array.isArray(raw.tiers) ? raw.tiers.map(tier => {
    if (Array.isArray(tier.features)) return tier.features.join(' · ');
    return tier.feature || tier.name;
  }) : null;
  return {
    ...fallback,
    ...raw,
    id,
    sector,
    deck,
    deckName,
    staffSlots,
    name: raw.name || raw.label || fallback.name,
    eyebrow: raw.eyebrow || raw.category || fallback.eyebrow,
    description: raw.description || fallback.description,
    activity: raw.activity || raw.populationActivity || fallback.activity,
    features: raw.features || raw.tierFeatures || authoredTierFeatures || fallback.features,
    sockets
  };
}

function ensureStylesheet() {
  if (document.querySelector('link[data-uga-command-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./uga_command.css?v=20260908-uga81r2', import.meta.url).href;
  link.dataset.ugaCommandStyle = 'true';
  document.head.appendChild(link);
}

function districtTierState(state, id, definition) {
  const raw = state?.ship?.districts?.[id] || state?.districts?.[id] || {};
  const tier = definition.fixed ? 3 : Math.max(1, Math.min(3, Number(raw.tier || raw.level || definition.initialTier || definition.initialLevel || 1)));
  const staff = Array.isArray(raw.staff) ? raw.staff : (definition.staffSlots || []).map(() => null);
  return {
    ...raw,
    id,
    tier,
    staff,
    socketModules: raw.socketModules || raw.modules || {}
  };
}

function upgradeCost(definition, tier) {
  const raw = definition.tiers?.find?.(entry => Number(entry.level) === tier + 1)?.cost ||
    definition.tiers?.[tier]?.cost || definition.upgradeCosts?.[tier + 1] ||
    definition.upgradeCosts?.[tier] || definition.costs?.[tier + 1];
  if (raw) return raw;
  return { credits: 1800 * tier, alloys: 240 * tier, components: 120 * tier };
}

function prettyToken(token) {
  return String(token || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function personnelState(state, kind, id) {
  return state?.personnel?.[kind]?.[id] || state?.[kind]?.[id] || {};
}

function isBroodMission(mission) {
  return mission?.missionType === 'uga_brood_purge' ||
    mission?.access?.type === 'uga_brood_proxy' ||
    mission?.opposition === 'brood' ||
    mission?.enemyFactionId === 'brood' ||
    mission?.opponentFactionId === 'brood';
}

export function createUgaCommand(options = {}) {
  ensureStylesheet();
  const container = options.container || document.getElementById('moduleFrame') || document.body;
  let localState = options.state || {};
  let selectedDistrictId = DISTRICT_DEFAULTS[options.selectedDistrict]?.id ? options.selectedDistrict : 'command';
  let activeView = 'command';
  let selectedMissionId = null;
  let selectedBuildPlotId = null;
  let activeHubRouteId = null;
  let confirmationKey = null;
  let sheetExpanded = false;
  let shipOverviewActive = false;
  let deploymentLoadoutExpanded = false;
  const hardwareExpandedDistricts = new Set();
  const deploymentDrafts = new Map();
  let visible = options.visible !== false;
  let destroyed = false;
  /* Read once at construction, then only when the classic shell writes. A
     ground operation settles its Cores over there and returns, so the rail has
     to pick that up without a reload. */
  let accountLedger = readAccountLedger();
  const releaseAccountLedger = subscribeAccountLedger(next => {
    if (destroyed) return;
    if (next.cores === accountLedger.cores && next.xp === accountLedger.xp) return;
    accountLedger = next;
    render();
  });
  const portraitStatus = new Map();
  const portraitUrls = new Map();
  const portraitProbes = new Map();

  function usesCompactRoomFocus() {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(max-width: 760px) and (orientation: portrait), (max-height: 620px) and (max-width: 1024px) and (orientation: landscape)').matches;
  }

  const root = document.createElement('section');
  root.className = 'uga-command-shell';
  root.setAttribute('aria-label', 'UGA civilization ship management');
  root.innerHTML = `
    <header class="uga-command-header">
      <div class="uga-command-identity">
        <span class="uga-command-crest">${icon('crest')}</span>
        <div><strong>NEXUS-VII</strong><span>UGA EXPLORER · SHIP INTERIOR</span></div>
      </div>
      <div class="uga-resource-ribbon" data-region="resources" tabindex="0" aria-label="Ship resources. Swipe horizontally for more."></div>
      <span class="uga-scroll-cue uga-resource-scroll-cue" aria-hidden="true">SWIPE <b>›</b></span>
      <button type="button" class="uga-icon-button uga-command-exit" data-action="exit" aria-label="Return to space">${icon('close')}</button>
    </header>
    <nav class="uga-deployment-context" data-deployment-context hidden aria-label="Hangar section navigation">
      <button type="button" data-action="deployment-sections" aria-label="Return to ship sections; keep deployment draft">${icon('chevron')}<span>SHIP SECTIONS</span></button>
      <div><small>NEXUS-VII // LOWER SECTION</small><strong>STRIKE BAY</strong></div>
    </nav>
    <div class="uga-command-stage">
      <aside class="uga-district-rail" data-region="districts" aria-label="Ship districts"></aside>
      <div class="uga-scene-overlay" aria-hidden="true">
        <div class="uga-scene-title"><span>LIVE CUTAWAY</span><strong data-region="scene-label">Command Core</strong></div>
        <div class="uga-camera-readout"><i></i><span>SELECT A DISTRICT OR OBJECT TO FOCUS CAMERA</span><i></i></div>
      </div>
      <aside class="uga-context-panel">
        <div class="uga-deployment-toolbar" data-deployment-toolbar hidden>
          <button type="button" data-action="deployment-back" aria-label="Back to missions">${icon('chevron')}<span>BACK TO MISSIONS</span></button>
          <button type="button" class="uga-deployment-toggle" data-action="toggle-deployment-loadout" aria-expanded="false"><span>EDIT LOADOUT</span>${icon('chevron')}</button>
        </div>
        <button type="button" class="uga-sheet-toggle" data-action="toggle-sheet" aria-expanded="true" aria-label="Collapse ship room controls"><span></span><b>SHIP ROOM CONTROLS</b>${icon('chevron')}</button>
        <div class="uga-context-body" data-region="context"></div>
      </aside>
    </div>
    <div class="uga-quick-actions" data-region="quick-actions"></div>
    <nav class="uga-command-nav" data-region="navigation" aria-label="UGA management sections"></nav>
  `;
  container.appendChild(root);

  const region = name => root.querySelector(`[data-region="${name}"]`);
  const getState = () => typeof options.getState === 'function' ? (options.getState() || localState) : localState;
  const getCatalog = () => typeof options.getCatalog === 'function' ? (options.getCatalog() || {}) : (options.catalog || {});
  const districtsCatalog = catalog => catalog.districts || catalog.DISTRICT_CATALOG || catalog.shipDistricts || {};
  const facilitiesCatalog = catalog => catalog.facilities || catalog.CONSTRUCTION_FACILITY_CATALOG || {};

  function constructionStatus() {
    return typeof options.getConstructionStatus === 'function'
      ? options.getConstructionStatus(getState())
      : { cycle: 0, capacity: 1, queueLimit: 6, active: 0, queue: [], power: { surplusMW: 0, constructionPowerPerSlotMW: 6 } };
  }

  function constructionQuote(districtId, facilityId = null) {
    return typeof options.getConstructionQuote === 'function'
      ? options.getConstructionQuote(getState(), districtId, facilityId)
      : { ok: false, issues: [{ message: 'Construction authority is unavailable.' }] };
  }

  function coreCommissionRescueQuote() {
    return typeof options.getCoreCommissionRescueQuote === 'function'
      ? options.getCoreCommissionRescueQuote()
      : { ok: false, issues: [] };
  }

  function facilityChoices(districtId, tier) {
    return Object.values(facilitiesCatalog(getCatalog())).filter(facility => facility.districtId === districtId && Number(facility.tier) === tier);
  }

  function constructionEffectMarkup(effects = {}) {
    const labels = {
      transitFuelPct: '% transit fuel', transitOldestWork: ' oldest-job work after transit', transitAllWork: ' work to every active job after transit',
      surveyProbeDiscount: ' probe survey discount', surveyIntelligenceBonus: ' survey intelligence', surveyResearchRewardPct: '% survey research', surveyProbeRefundInterval: ' surveys per probe refund',
      operationModSlots: ' operation mod slot', operationResearchRewardPct: '% operation research', deploymentSlots: ' deployment slots', casualtyForecast: ' forecasted injury downgrade',
      researchProgressPct: '% research progress', bioRewardPct: '% bio-sample rewards', bioResearchCostPct: '% bio research cost', advancedContainment: ' advanced containment access',
      constructionMaterialCostPct: '% alloy/component cost', cycleOldestWork: ' oldest-job work per cycle', constructionSlots: ' active construction slot', retrofitSalvagePct: '% retrofit salvage', cancelRefundBonusPct: '% cancellation refund',
      powerGenerationMW: ' MW generation', constructionPowerPerSlotMW: ' MW per construction slot', personnelRecoveryCycles: ' personnel recovery cycles', districtWorkEverySecondCycle: ' district work every second cycle',
      injurySeverityBands: ' injury severity band', allDistrictWorkEverySecondCycle: ' work to all expansions every second cycle', factionReputationPct: '% faction reputation', factionRecoveryCycles: ' faction recovery cycles',
      commanderXpPct: '% commander experience',
      factionLoyaltyPct: '% faction loyalty', crossFactionSpecialists: ' cross-faction specialist', materialRewardPct: '% material rewards', transitProbeRestore: ' probe after transit', victoryProbeRestore: ' probe after victory', victoryFuelRestore: ' fuel after victory'
    };
    const entries = Object.entries(effects);
    if (!entries.length) return '<span>Required district operating core.</span>';
    return entries.map(([key, value]) => `<span><b>${Number(value) > 0 ? '+' : ''}${formatValue(value)}</b>${escapeHtml(labels[key] || ` ${prettyToken(key)}`)}</span>`).join('');
  }

  function personnelPortraitUrl(id) {
    const definition = UGA_PERSONNEL_PORTRAIT_CONTRACT[id];
    if (!definition) return '';
    if (!portraitUrls.has(id)) portraitUrls.set(id, (definition.basePortrait
      ? resolveBaseRuntimeUrl(definition.path, import.meta.url)
      : new URL(definition.path, import.meta.url)).href);
    return portraitUrls.get(id);
  }

  function personnelPortraitReady(id) {
    return portraitStatus.get(id) === 'ready';
  }

  function personnelPortraitImage(id, name = 'Personnel') {
    if (!personnelPortraitReady(id)) return `<span class="uga-portrait-unavailable" role="img" aria-label="${escapeHtml(`${name}: portrait unavailable`)}" title="Portrait unavailable">${icon('staff')}</span>`;
    return `<img src="${escapeHtml(personnelPortraitUrl(id))}" alt="${escapeHtml(`${name} portrait`)}" loading="lazy" decoding="async" draggable="false" data-personnel-id="${escapeHtml(id)}">`;
  }

  function portraitMeetsContract(image) {
    const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
    return image.naturalWidth >= PERSONNEL_PORTRAIT_MIN_WIDTH &&
      image.naturalHeight >= PERSONNEL_PORTRAIT_MIN_HEIGHT &&
      aspect >= PERSONNEL_PORTRAIT_MIN_ASPECT && aspect <= PERSONNEL_PORTRAIT_MAX_ASPECT;
  }

  function settlePortraitProbe(id, status) {
    portraitProbes.delete(id);
    if (destroyed || portraitStatus.get(id) !== 'pending') return;
    portraitStatus.set(id, status);
    if (activeView === 'factions' || activeView === 'contracts' || activeView === 'deployment') render();
  }

  function primePersonnelPortraits() {
    for (const [id, definition] of Object.entries(UGA_PERSONNEL_PORTRAIT_CONTRACT)) {
      if (portraitStatus.has(id)) continue;
      // Approval is explicit because dimensions can reject an icon-sized file,
      // but runtime code cannot judge whether an image is original final art.
      if (!definition.approved) {
        portraitStatus.set(id, 'unavailable');
        continue;
      }
      portraitStatus.set(id, 'pending');
      const probe = document.createElement('img');
      portraitProbes.set(id, probe);
      probe.onload = () => settlePortraitProbe(id, (definition.basePortrait ? probe.naturalWidth > 0 && probe.naturalHeight > 0 : portraitMeetsContract(probe)) ? 'ready' : 'unavailable');
      probe.onerror = () => settlePortraitProbe(id, 'unavailable');
      probe.src = personnelPortraitUrl(id);
    }
  }

  function portraitAuditPending() {
    return [...portraitStatus.values()].some(status => status === 'pending');
  }

  function readyPersonnel(items, state, kind, factionId) {
    return items.filter(item => item.factionId === factionId &&
      personnelState(state, kind, item.id).unlocked !== false &&
      !personnelState(state, kind, item.id).injury &&
      personnelState(state, kind, item.id).status === 'ready');
  }

  function personnelSelect(kind, items, index = 0, selectedId = '') {
    const specialist = kind === 'specialist';
    const selected = items.find(item => item.id === selectedId) || items[index] || items[0];
    const label = specialist ? `Specialist ${index + 1}` : 'Hired Commander';
    const data = specialist ? `data-specialist="${index}"` : 'data-deploy="commanderId"';
    return `<label class="uga-personnel-field"><span>${label}</span><div class="uga-personnel-select${selected ? '' : ' is-unavailable'}">
      <span class="uga-personnel-portrait uga-deployment-portrait" data-personnel-portrait ${selected ? '' : 'hidden'}>${selected ? personnelPortraitImage(selected.id, selected.name || prettyToken(selected.id)) : ''}</span>
      <select ${data} aria-label="${label}" ${items.length ? '' : 'disabled'}>${items.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(item.name || prettyToken(item.id))}</option>`).join('')}</select>
    </div></label>`;
  }

  function deploymentDraft(missionId, defaults) {
    const previous = deploymentDrafts.get(missionId);
    if (previous) return previous;
    const created = {
      missionId,
      station: 'base_deployer',
      proxyFactionId: defaults.proxyFactionId || '',
      commanderId: defaults.commanderId || '',
      specialistIds: [...(defaults.specialistIds || [])],
      mapId: defaults.mapId || '',
      landingZoneId: defaults.landingZoneId || '',
      supportId: defaults.supportId || '',
      doctrineId: defaults.doctrineId || '',
      deploymentManifest: {
        units: (defaults.deploymentManifest?.units || []).map(item => ({ ...item })),
        structures: (defaults.deploymentManifest?.structures || []).map(item => ({ ...item })),
        modIds: [...(defaults.deploymentManifest?.modIds || [])]
      }
    };
    deploymentDrafts.set(missionId, created);
    return created;
  }

  function readDeploymentPlanner(planner, station = null) {
    if (!planner) return null;
    const value = key => planner.querySelector(`[data-deploy="${key}"]`)?.value || '';
    const missionId = planner.dataset.missionId;
    const previous = deploymentDrafts.get(missionId) || {};
    const next = {
      missionId,
      station: station || previous.station || 'base_deployer',
      proxyFactionId: value('factionId'),
      commanderId: value('commanderId'),
      specialistIds: [...planner.querySelectorAll('[data-specialist]')].map(select => select.value).filter(Boolean),
      mapId: value('mapId'),
      landingZoneId: value('landingZone'),
      supportId: value('support'),
      doctrineId: value('doctrine'),
      deploymentManifest: {
        units: [...planner.querySelectorAll('[data-deploy-unit]')].map(select => ({ id: select.dataset.deployUnit, count: Number(select.value) || 0 })).filter(item => item.count > 0),
        structures: [...planner.querySelectorAll('[data-deploy-structure]')].map(select => ({ id: select.dataset.deployStructure, count: Number(select.value) || 0 })).filter(item => item.count > 0),
        modIds: [...planner.querySelectorAll('[data-deploy-mod]:checked')].map(input => input.dataset.deployMod)
      }
    };
    const selectedMap = planner.querySelector('[data-deploy="mapId"]')?.selectedOptions?.[0] || null;
    const selectedAreaId = planner.dataset.selectedAreaId || '';
    const selectedMapSize = selectedMap?.dataset.mapSize || '';
    planner.dataset.selectedMapId = next.mapId;
    planner.dataset.selectedMapSize = selectedMapSize;
    planner.dataset.factionId = next.proxyFactionId;
    const shipNames = { nova: 'Nova Orbital Carrier', dominion: 'Dominion Assault Lander', syndicate: 'Syndicate Phase Manta' };
    const shipName = shipNames[next.proxyFactionId] || 'HQ Deployment Ship';
    const commanderName = planner.querySelector('[data-deploy="commanderId"]')?.selectedOptions?.[0]?.textContent?.trim() || 'Select a ready commander';
    const summaryName = planner.querySelector('.uga-deployment-summary strong');
    const summaryCrew = planner.querySelector('.uga-deployment-summary p');
    const shipStation = planner.querySelector('[data-deployment-station="base_deployer"] small');
    const chassisStation = planner.querySelector('[data-deployment-station="command_chassis"] small');
    if (summaryName) summaryName.textContent = shipName;
    if (summaryCrew) summaryCrew.textContent = `${commanderName} · ${next.specialistIds.length} / 3 specialists`;
    if (shipStation) shipStation.textContent = `${shipName} // ${commanderName}`;
    if (chassisStation) chassisStation.textContent = commanderName;
    root.dataset.groundRouteStage = planner.dataset.groundRouteStage || '';
    root.dataset.selectedAreaId = selectedAreaId;
    root.dataset.selectedMapId = next.mapId;
    root.dataset.selectedMapSize = selectedMapSize;
    deploymentDrafts.set(missionId, next);
    call('onDeploymentPreview', next);
    return next;
  }

  /* Every loadout edit must ask the same domain validator that launch uses.
     The old manifest and faction handlers each toggled the button from only
     their local field, so a later edit could re-enable an over-capacity or
     duplicate-personnel request and defer the rejection until deployment. */
  function updateDeploymentReadiness(planner, payload) {
    if (!planner || !payload) return { ready: false, message: 'Deployment loadout is unavailable.' };
    const manifest = planner.querySelector('.uga-deployment-manifest');
    const unitInputs = [...planner.querySelectorAll('[data-deploy-unit]')];
    const structureInputs = [...planner.querySelectorAll('[data-deploy-structure]')];
    const slots = [...unitInputs, ...structureInputs]
      .reduce((sum, select) => sum + (Number(select.value) || 0) * (Number(select.dataset.slotCost) || 0), 0);
    const capacity = Number(manifest?.dataset.slotCapacity) || 0;
    const unitCount = unitInputs.reduce((sum, select) => sum + (Number(select.value) || 0), 0);
    const structureCount = structureInputs.reduce((sum, select) => sum + (Number(select.value) || 0), 0);
    const modCount = planner.querySelectorAll('[data-deploy-mod]:checked').length;
    const unitLimit = Number(manifest?.dataset.unitLimit) || Infinity;
    const structureLimit = Number(manifest?.dataset.structureLimit) || Infinity;
    const modLimit = Number(manifest?.dataset.modLimit) || Infinity;
    const requiredUnitIds = String(manifest?.dataset.requiredUnitIds || '').split(',').filter(Boolean);
    const selectedUnitIds = new Set(unitInputs.filter(select => Number(select.value) > 0).map(select => select.dataset.deployUnit));
    const specialistIds = payload.specialistIds || [];
    const fieldsReady = Boolean(payload.proxyFactionId && payload.commanderId && payload.mapId && payload.landingZoneId && payload.supportId && payload.doctrineId);
    const personnelReady = specialistIds.length === 3 && new Set(specialistIds).size === 3;
    const manifestReady = slots > 0 && slots <= capacity && unitCount <= unitLimit
      && structureCount <= structureLimit && modCount <= modLimit
      && requiredUnitIds.every(id => selectedUnitIds.has(id));
    const eligibility = typeof options.getMissionEligibility === 'function'
      ? options.getMissionEligibility(payload.missionId, payload) : null;
    const ready = fieldsReady && personnelReady && manifestReady && eligibility?.eligible !== false;
    const message = eligibility?.locks?.[0]?.message
      || (!personnelReady ? 'Select exactly three unique specialists.'
        : slots <= 0 ? 'Select at least one starting unit group.'
          : slots > capacity ? `Deployment uses ${slots} of ${capacity} available slots.`
            : unitCount > unitLimit ? `Mission allows at most ${unitLimit} starting unit groups.`
              : structureCount > structureLimit ? `Mission allows at most ${structureLimit} starting structures.`
                : modCount > modLimit ? `Mission allows at most ${modLimit} operation mods.`
                  : !manifestReady ? 'The required starting force is incomplete.'
                    : !fieldsReady ? 'Choose a battlefield and complete each deployment selection.'
                      : 'Deployment loadout is blocked.');
    const usage = manifest?.querySelector('[data-slot-usage]');
    if (usage) usage.textContent = `${slots} / ${capacity}`;
    const summaryUsage = planner.querySelector('[data-slot-usage-summary]');
    if (summaryUsage) summaryUsage.textContent = `${slots} / ${capacity} SLOTS`;
    manifest?.classList.toggle('is-over-capacity', slots > capacity);
    const blocker = planner.querySelector('[data-deployment-blocker]');
    if (blocker) {
      blocker.hidden = ready;
      const text = blocker.querySelector('span');
      if (text) text.textContent = message;
    }
    const readiness = planner.querySelector('.uga-deployment-readiness');
    readiness?.classList.toggle('is-ready', ready);
    readiness?.classList.toggle('is-blocked', !ready);
    if (readiness) readiness.dataset.deploymentConfirmState = ready ? 'ready' : 'blocked';
    const readinessMessage = planner.querySelector('[data-readiness-message]');
    if (readinessMessage) readinessMessage.textContent = ready ? 'READY FOR LANDING' : message;
    const mapSelect = planner.querySelector('[data-deploy="mapId"]');
    const mapName = planner.querySelector('.uga-selected-map');
    if (mapName) mapName.textContent = mapSelect?.selectedOptions?.[0]?.dataset.mapName || 'Choose a battlefield';
    const deploy = planner.querySelector('[data-action="deploy"]');
    if (deploy) {
      deploy.disabled = !ready;
      if (deploy.childNodes[0]) deploy.childNodes[0].nodeValue = ready ? 'CONFIRM & DEPLOY' : 'LOADOUT BLOCKED';
    }
    planner.classList.toggle('is-invalid', !ready);
    return { ready, message, eligibility };
  }

  function syncDeploymentPlanner(planner, station = null) {
    const payload = readDeploymentPlanner(planner, station);
    return { payload, ...updateDeploymentReadiness(planner, payload) };
  }

  function syncPersonnelPortrait(select) {
    const frame = select.closest('.uga-personnel-select')?.querySelector('[data-personnel-portrait]');
    if (!frame) return;
    const id = select.value;
    const name = select.selectedOptions[0]?.textContent || 'Personnel';
    frame.innerHTML = personnelPortraitImage(id, name);
    frame.hidden = !id;
    frame.parentElement.classList.toggle('is-unavailable', !id);
  }

  function call(name, ...args) {
    const fn = options[name];
    if (typeof fn !== 'function') return undefined;
    let result;
    try {
      result = fn(...args);
    } catch (error) {
      root.classList.remove('is-busy');
      if (name !== 'onError' && typeof options.onError === 'function') options.onError(error, { callback: name, args });
      return undefined;
    }
    if (result && typeof result.then === 'function') {
      root.classList.add('is-busy');
      Promise.resolve(result).catch(error => {
        if (typeof options.onError === 'function') options.onError(error, { callback: name, args });
      }).finally(() => {
        if (destroyed) return;
        root.classList.remove('is-busy');
        render();
      });
    } else {
      queueMicrotask(() => { if (!destroyed) render(); });
    }
    return result;
  }

  function hostRoutesAvailable() {
    return typeof options.onHostRoute === 'function';
  }

  function hubRouteReachable(entry) {
    return campaignHubRouteIsReachable(entry, { hostRoutes: hostRoutesAvailable() });
  }

  function hubSessionReachable(entry) {
    return campaignHubSessionIsReachable(entry, { hostRoutes: hostRoutesAvailable() });
  }

  function resources() {
    const state = getState();
    const values = state.resources || state.economy || {};
    const expedition = Object.entries(RESOURCE_META).map(([key, [label, iconName]]) => {
      let value = values[key];
      if (value === undefined && key === 'researchPoints') value = values.research ?? values.science;
      if (value === undefined && key === 'credits') value = values.requisition;
      return `<div class="uga-resource" title="${escapeHtml(label)}"><span>${icon(iconName)}</span><b>${formatValue(value)}</b><small>${escapeHtml(label)}</small></div>`;
    }).join('');
    /* Cores and XP lead the rail. They are the account ledger the classic menu
       shows and the only currency a match actually pays out, so a strategic home
       that omitted them was showing the player seven numbers they had never
       earned and hiding the one they had. Read-only here — the classic shell
       stays the sole writer, see domain/account_ledger.js. The seven stay as
       expedition materials because every construction and research cost in the
       catalog is priced in them. */
    const ledger = accountLedger;
    if (!ledger) return expedition;
    /* Distinct glyphs on purpose. Cores first took 'credit' and XP took
       'research', which put the same two icons on four different rows — Cores
       looked like Credits and XP looked like Research Points, which is the exact
       confusion this change exists to remove. 'crest' reads as account identity
       and 'upgrade' as advancement, and neither is used by the seven materials. */
    const account = [
      ['Cores', 'crest', ledger.cores],
      ['XP', 'upgrade', ledger.xp]
    ].map(([label, iconName, value]) =>
      `<div class="uga-resource is-account" title="${escapeHtml(label)} — shared with the MASSFRONT main menu"><span>${icon(iconName)}</span><b>${formatValue(value)}</b><small>${escapeHtml(label)}</small></div>`
    ).join('');
    return account + expedition;
  }

  let selectedDeckFilter = 'A';

  function districtRail() {
    const catalog = districtsCatalog(getCatalog());
    const state = getState();
    const powerGrid = typeof options.getPowerGridStatus === 'function' ? options.getPowerGridStatus(state) : { totalGeneratedMW: 160, totalConsumedMW: 120, surplusMW: 40, isBrownout: false };
    const shipRating = typeof options.getShipExplorationRating === 'function' ? options.getShipExplorationRating(state) : { rating: 12, className: 'Class I · Survey Cruiser' };

    const filteredIds = DISTRICT_ORDER.filter(id => normalizeDistrict(id, catalog).deck === selectedDeckFilter);
    const deckMeta = {
      A: ['FORWARD', 'COMMAND & MISSIONS', 'Command Core, routes, surveys, and mission planning'],
      B: ['UPPER', 'SYSTEMS & RESEARCH', 'Research, fabrication, drive, and ship engineering'],
      C: ['LOWER', 'CREW & DEPLOYMENT', 'Habitat, diplomacy, Strike Bay, and expedition cargo']
    }[selectedDeckFilter];
    const sectionNames = { A: 'Forward command rooms', B: 'Upper systems rooms', C: 'Lower crew and deployment rooms' };
    const sectionShort = { A: 'COMMAND', B: 'SYSTEMS', C: 'CREW & BAY' };
    const sectionPosition = { A: 'FORWARD', B: 'UPPER', C: 'LOWER' };

    return `
      <div class="uga-rail-top">
        <div class="uga-ship-location"><b>INSIDE NEXUS-VII</b><small>${shipOverviewActive ? 'SHIP OVERVIEW' : `${sectionPosition[selectedDeckFilter]} · ${sectionShort[selectedDeckFilter]}`}<span class="uga-location-power"> · GRID ${powerGrid.totalConsumedMW}/${powerGrid.totalGeneratedMW} MW</span></small></div>
        <button type="button" class="uga-overview-button" data-action="overview">${icon('overview')}<span>SHIP OVERVIEW</span></button>
        <div class="uga-ship-telemetry-badge">
          <div class="uga-telemetry-rating">
            <small>EXPLORATION CLASS</small>
            <b>${escapeHtml(shipRating.className)}</b>
            <span>RATING ${shipRating.rating}</span>
          </div>
          <div class="uga-telemetry-power ${powerGrid.isBrownout ? 'is-brownout' : ''}">
            <small>${icon('power')} POWER GRID</small>
            <b>${powerGrid.totalConsumedMW} / ${powerGrid.totalGeneratedMW} MW</b>
            <span>${powerGrid.surplusMW >= 0 ? `+${powerGrid.surplusMW} MW SURPLUS` : 'BROWNOUT'}</span>
          </div>
        </div>
        <div class="uga-sector-filter-bar uga-deck-filter-bar" role="tablist" aria-label="Ship interior areas">
          ${['A', 'B', 'C'].map(deck => `<button type="button" role="tab" aria-selected="${selectedDeckFilter === deck}" aria-label="${sectionNames[deck]}" class="uga-filter-chip${selectedDeckFilter === deck ? ' is-active' : ''}" data-deck-filter="${deck}"><span>${sectionPosition[deck]}</span></button>`).join('')}
        </div>
      </div>
      <div class="uga-deck-summary"><small>${deckMeta[0]} SECTION</small><b>${deckMeta[1]}</b><span>${deckMeta[2]}</span></div>
      <div class="uga-district-list">
        ${filteredIds.map((id, index) => {
          const def = normalizeDistrict(id, catalog);
          const dState = districtTierState(getState(), id, def);
          const level = dState.tier;
          const active = !shipOverviewActive && selectedDistrictId === id && ['command', 'construction'].includes(activeView);
          const staffCount = (dState.staff || []).filter(Boolean).length;
          return `<button type="button" class="uga-district-button${active ? ' is-active' : ''} is-${def.sector}" data-district="${id}" aria-pressed="${active}">
            <span class="uga-district-index">${String(index + 1).padStart(2, '0')}</span>
            <span class="uga-district-icon">${icon(id)}</span>
            <span class="uga-district-copy">
              <b>${escapeHtml(def.name)}</b>
              <small>${def.fixed ? 'FIXED CORE' : dState.commissioned === false ? 'UNCOMMISSIONED' : `TIER ${level} // 3`} · <em class="uga-sector-tag ${def.sector}">${def.sector.toUpperCase()}</em>${staffCount > 0 ? ` · ${icon('staff', 'uga-staff-mini')} ${staffCount}` : ''}</small>
            </span>
            ${icon('chevron', 'uga-row-chevron')}
          </button>`;
        }).join('')}
      </div>
      <span class="uga-scroll-cue uga-district-scroll-cue" aria-hidden="true">SWIPE <b>›</b></span>`;
  }

  function tierRail(tier, fixed) {
    return `<div class="uga-tier-rail" aria-label="${fixed ? 'Fixed command core' : `Tier ${tier} of 3`}">
      ${[1, 2, 3].map(level => `<span class="${level <= tier ? 'is-on' : ''}"><i></i><b>${level}</b></span>`).join('')}
    </div>`;
  }

  function featureRows(definition, tier) {
    const features = Array.isArray(definition.features) ? definition.features : Object.values(definition.features || {});
    return [0, 1, 2].map(index => {
      const value = features[index] || `Tier ${index + 1} capability`;
      return `<div class="uga-feature ${index < tier ? 'is-unlocked' : ''}">${icon(index < tier ? 'check' : 'lock')}<span><b>TIER ${index + 1}</b>${escapeHtml(typeof value === 'string' ? value : value.name || value.label)}</span></div>`;
    }).join('');
  }

  function visualUpgradeRows(definition, districtState) {
    const tiers = definition.tiers || [];
    return [0, 1, 2].map(index => {
      const tierDef = tiers[index] || {};
      const visualList = Array.isArray(tierDef.visualChanges) ? tierDef.visualChanges : [];
      const isReached = index < districtState.tier;
      return `<div class="uga-visual-upgrade-row ${isReached ? 'is-active' : ''}">
        <span class="uga-visual-badge">${isReached ? icon('check') : icon('lock')} TIER ${index + 1}</span>
        <div class="uga-visual-copy">
          <b>${escapeHtml(tierDef.name || `Tier ${index + 1} Architecture`)}</b>
          <p>${escapeHtml(visualList.join(' · ') || 'Compartment architectural upgrades active.')}</p>
        </div>
      </div>`;
    }).join('');
  }

  function adjacencySynergyBanner(districtId) {
    const state = getState();
    const synergies = typeof options.getAdjacencySynergies === 'function' ? options.getAdjacencySynergies(state) : [];
    const districtSynergies = synergies.filter(s => s.districts.includes(districtId));
    if (!districtSynergies.length) return '';
    return `<div class="uga-synergy-banner">
      ${districtSynergies.map(syn => `<div class="uga-synergy-item">
        ${icon('synergy', 'uga-synergy-icon')}
        <div>
          <small>⚡ DECK SYNERGY ACTIVE // ${escapeHtml(syn.name)}</small>
          <p>${escapeHtml(syn.bonus)}</p>
        </div>
      </div>`).join('')}
    </div>`;
  }

  function staffRows(definition, districtState) {
    const slots = definition.staffSlots || [];
    if (!slots.length) return '<div class="uga-empty-state">No specialist staffing designated for this compartment.</div>';
    /* The domain refuses every assignment on an uncommissioned compartment
       (DISTRICT_NOT_COMMISSIONED), so offering the picker there could only
       produce an error toast — which read as "the crew system is broken".
       State the actual gate instead, and point at what unblocks it. */
    if (districtState.commissioned === false) return `<div class="uga-empty-state">Crew stations open after this compartment is commissioned. Finish the ${escapeHtml(definition.name || 'district')} core commissioning first — commissioning work advances as surveys, travel and operations complete expedition cycles.</div>`;
    const state = getState();
    const catalog = getCatalog();
    const allSpecialists = asArray(catalog.specialists || catalog.SPECIALIST_CATALOG || state.specialists || {});

    const assignedIds = new Set(
      Object.values(state.ship?.districts || {}).flatMap(d => Array.isArray(d.staff) ? d.staff.filter(Boolean) : [])
    );

    return slots.map((slot, index) => {
      const assignedId = districtState.staff?.[index] || null;
      const locked = slot.unlockTier > districtState.tier;
      const assigned = assignedId ? allSpecialists.find(s => s.id === assignedId) || { id: assignedId, name: prettyToken(assignedId) } : null;
      const eligible = allSpecialists.filter(s => {
        const pState = personnelState(state, 'specialists', s.id);
        return pState.unlocked && pState.status === 'ready' && !pState.injury && (!assignedIds.has(s.id) || s.id === assignedId);
      });

      return `<article class="uga-staff-card ${locked ? 'is-locked' : ''} ${assigned ? 'is-assigned' : ''}">
        <div class="uga-staff-header">
          <div class="uga-staff-mark">${icon(locked ? 'lock' : 'staff')}<span>${String(index + 1).padStart(2, '0')}</span></div>
          <div class="uga-staff-title"><small>${escapeHtml(slot.label || `Staff Station ${index + 1}`)}</small><b>${locked ? `UNLOCKS AT TIER ${slot.unlockTier}` : assigned ? escapeHtml(assigned.name) : 'VACANT STATION'}</b></div>
          ${assigned ? `<button type="button" class="uga-mini-button is-danger" data-staff-unassign="${escapeHtml(districtState.id)}:${index}">UNASSIGN</button>` : ''}
        </div>
        ${assigned ? `<div class="uga-staff-assigned-body">
          <span class="uga-personnel-portrait uga-staff-portrait">${personnelPortraitImage(assigned.id, assigned.name)}</span>
          <div class="uga-staff-perk-copy">
            <small>${escapeHtml(assigned.specialty || prettyToken(assigned.role || 'Specialist'))}</small>
            <p>${escapeHtml(assigned.perk || 'Stationed personnel efficiency active.')}</p>
          </div>
        </div>` : !locked ? `<div class="uga-staff-assign-box">
          ${eligible.length ? `<label class="uga-staff-picker"><span class="sr-only">Assign Specialist</span><select data-staff-select="${escapeHtml(districtState.id)}:${index}">
            <option value="">-- SELECT SPECIALIST --</option>
            ${eligible.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} (${prettyToken(s.role)}) - ${escapeHtml(s.specialty || '')}</option>`).join('')}
          </select></label>
          <button type="button" class="uga-mini-button is-primary" data-staff-assign="${escapeHtml(districtState.id)}:${index}">ASSIGN</button>` : '<div class="uga-empty-note">No available specialists in crew quarters.</div>'}
        </div>` : ''}
      </article>`;
    }).join('');
  }

  function costMarkup(cost) {
    return Object.entries(cost || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => {
      const meta = RESOURCE_META[key] || [prettyToken(key), 'component'];
      return `<span>${icon(meta[1])}<b>${formatValue(value)}</b><small>${escapeHtml(meta[0])}</small></span>`;
    }).join('');
  }

  /* An installed module reports what it is doing; an empty socket reports what
     the module on offer would do. Both read the same catalog the domain
     aggregates from, so the card cannot promise an effect the ship will not
     apply. Power draw stays visible because it is the cost of the choice. */
  function socketEffectMarkup(modules, installedId, choices) {
    const shown = installedId || (Array.isArray(choices) && choices.length === 1 ? choices[0] : null);
    const module = shown ? modules[shown] : null;
    if (!module) return '';
    const effects = module.effects || {};
    const draw = Number(module.powerDrawMW) || 0;
    const generation = Number(module.powerGenerationBonusMW) || 0;
    const power = generation ? `+${generation} MW generated` : draw ? `${draw} MW draw` : '';
    if (!Object.keys(effects).length) return power ? `<em class="uga-socket-effects">${escapeHtml(power)}</em>` : '';
    return `<em class="uga-socket-effects">${constructionEffectMarkup(effects)}${power ? `<span>${escapeHtml(power)}</span>` : ''}</em>`;
  }

  function socketRows(definition, districtState) {
    if (!definition.sockets.length) return '<div class="uga-empty-state">The Command Core is fixed and does not accept internal modules.</div>';
    const modules = getCatalog().modules || getCatalog().MODULE_CATALOG || {};
    return definition.sockets.map((socket, index) => {
      const installed = districtState.socketModules?.[socket.id] || districtState.socketModules?.[index] || null;
      const locked = socket.unlockTier > districtState.tier;
      const choices = socket.compatibleModuleTypes || [];
      return `<article class="uga-socket ${locked ? 'is-locked' : ''}">
        <div class="uga-socket-mark">${icon(locked ? 'lock' : 'component')}<span>${String(index + 1).padStart(2, '0')}</span></div>
        <div class="uga-socket-copy"><small>${escapeHtml(socket.name)}</small><b>${escapeHtml(installed ? modules[installed]?.name || prettyToken(installed) : locked ? `UNLOCKS AT TIER ${socket.unlockTier}` : 'EMPTY SOCKET')}</b>
          ${/* What the module DOES, on the card that offers it. Sockets used to
                show a name, a cost and nothing else, which was honest while a
                module only changed the power bill and is not any more. An
                effect a player cannot read before paying for it is not a
                choice, and one they cannot read after installing it is not a
                reward. */ ''}
          ${socketEffectMarkup(modules, installed, locked ? null : choices)}</div>
        ${!locked && !installed && choices.length ? `<label class="uga-module-picker"><span class="sr-only">Module</span><select data-module-choice="${escapeHtml(socket.id)}">${choices.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(modules[type]?.name || prettyToken(type))}</option>`).join('')}</select></label><button type="button" class="uga-mini-button" data-install="${escapeHtml(socket.id)}">INSTALL</button>` : ''}
      </article>`;
    }).join('');
  }

  /* Situational awareness for the strategic home.

     This is the one part of the retired classic terminal worth keeping. That
     terminal was a second, unreachable "choose a deployment" screen carrying
     its own mode picker, its own Build/Research/Craft row and its own War
     Table button - a whole duplicate of the hub that no route could reach,
     which is how the module ended up with three different answers to "what do
     I play". Only this block said something the hub did not: where the
     expedition actually is and how hard the front is pushing back. The
     objective above says what to do next; this says what you are looking at. */
  /* The five things a commander does to their own ship, in the one place they
     are actually standing. These shortcuts existed only inside the retired
     classic terminal, so every handler behind them - openCommandConstruction
     for build and upgrade, the research route, the host Development and
     Inventory routes - has been live and unreachable. Putting the row in the
     strategic home is what finally connects "command the expedition" to
     "change the ship it commands". */
  function commandQuickPanel() {
    return `<nav class="uga-command-quick" aria-label="Command quick access">
      <button type="button" data-command-construction="build">${icon('build')}<span>Build</span></button>
      <button type="button" data-hub-route="galactic-research">${icon('research')}<span>Research</span></button>
      <button type="button" data-host-route="development" ${hostRoutesAvailable() ? '' : 'disabled aria-disabled="true"'}>${icon('fabricator')}<span>Craft</span></button>
      <button type="button" data-command-construction="upgrade">${icon('upgrade')}<span>Upgrade</span></button>
      <button type="button" data-hub-route="inventory">${icon('inventory')}<span>Inventory</span></button>
    </nav>`;
  }
  function commandFrontPanel() {
    const state = getState();
    const systems = state.world?.systems || {};
    const systemId = state.route?.systemId || Object.keys(systems).find(id => systems[id]?.discovered) || 'aelos';
    const system = systems[systemId] || {};
    const pressure = Number(system.soloFront?.pressure);
    const hasPressure = Number.isFinite(pressure);
    const infestation = system.infestation || {};
    const frontLabel = infestation.confirmed ? 'BIO-THREAT' : !hasPressure ? 'STATUS UNKNOWN' : pressure >= 66 ? 'HIGH PRESSURE' : pressure >= 34 ? 'CONTESTED' : 'STABLE';
    const frontTone = infestation.confirmed || (hasPressure && pressure >= 66) ? 'danger' : hasPressure && pressure >= 34 ? 'warning' : 'stable';
    const discovered = Object.values(systems).filter(entry => entry?.discovered).length;
    const systemCount = Object.keys(systems).length;
    const intelligence = Number(state.intelligence?.bySystem?.[systemId]) || 0;
    const operations = Array.isArray(state.operations?.history) ? state.operations.history.length : 0;
    // L1: the strategic home finally carries the expedition clock it reports.
    // The watch quote comes from the domain so a pending operation (which must
    // resolve first) disables the button for the same reason the ledger would.
    const watchQuote = typeof options.getDutyWatchQuote === 'function' ? options.getDutyWatchQuote() : null;
    const watchReady = Boolean(watchQuote?.available);
    const watchCycles = Number(watchQuote?.cycles) || 0;
    const atCap = hasPressure && pressure >= 100;
    // Keep the label to one line at 88px: the front card already shows the
    // pressure the watch feeds, and the toast spells out the full effect.
    const watchLabel = !watchReady ? 'FRONT RESOLVING'
      : atCap ? 'HOLD WATCH · RISK'
        : `HOLD WATCH +${watchCycles}`;
    return `<section class="uga-command-front is-${frontTone}" aria-label="Current Galactic front status">
      <span>${icon(infestation.confirmed ? 'warning' : 'overview')}</span>
      <div><small>CURRENT SYSTEM</small><strong>${escapeHtml(prettyToken(systemId))}</strong><p>${escapeHtml(frontLabel)}${hasPressure ? ` · PRESSURE ${formatValue(pressure)}` : ''}</p></div>
      <dl><div><dt>ROUTES</dt><dd>${formatValue(discovered)} / ${formatValue(systemCount)}</dd></div><div><dt>INTEL</dt><dd>${formatValue(intelligence)}</dd></div><div><dt>OPS</dt><dd>${formatValue(operations)}</dd></div></dl>
      <div class="uga-front-actions">
        <button type="button" data-front-watch ${watchReady ? '' : 'disabled aria-disabled="true"'} aria-label="Hold duty watch: advance ${watchCycles} expedition cycles, front pressure rises">${escapeHtml(watchLabel)}</button>
        <button type="button" data-nav="galaxy">OPEN GALAXY${icon('chevron')}</button>
      </div>
    </section>`;
  }

  function constructionQueueMarkup(status) {
    const queue = status.queue || [];
    const emergencyTransit = getState().ship?.emergencyFuelActive === true;
    return `<section class="uga-construction-queue">
      <header>
        <div><small>EXPEDITION CYCLE ${formatValue(status.cycle)}</small><h3>Global Construction Queue</h3></div>
        <span>${formatValue(status.active)} / ${formatValue(status.capacity)} POWERED · ${queue.length} / ${formatValue(status.queueLimit)} QUEUED</span>
      </header>
      <p>Construction advances with expeditions: completed surveys add 1 cycle, returning ground operations add 2, and each duty watch on the command front adds 2. ${emergencyTransit ? 'Emergency jumps advance only powered Mission Ops and Strike Bay commissioning; all other jobs pause on those jumps. Clear emergency service in Stores to restore normal travel work.' : 'Normal travel adds 2 cycles.'} Queued work waits for a powered slot; opening this screen does not advance time.</p>
      <div class="uga-construction-power ${status.power?.surplusMW < 0 ? 'is-deficit' : ''}">
        ${icon('power')}<div><b>${status.power?.surplusMW >= 0 ? '+' : ''}${formatValue(status.power?.surplusMW)} MW FORECAST</b><small>${formatValue(status.power?.constructionPowerPerSlotMW)} MW PER ACTIVE SLOT</small></div>
      </div>
      <div class="uga-job-list">${queue.length ? queue.map((job, index) => {
        const facility = facilitiesCatalog(getCatalog())[job.facilityId] || {};
        const progress = Math.min(100, Math.floor((Number(job.workCompleted) || 0) / Math.max(1, Number(job.workRequired) || 1) * 100));
        const cancelKey = `cancel:${job.id}`;
        const protectedCore = job.kind === 'commission' && (job.districtId === 'mission_ops' || job.districtId === 'hangar') && !(getState().operations?.history?.length);
        const pausedOnEmergencyJump = emergencyTransit && !(job.kind === 'commission' && (job.districtId === 'mission_ops' || job.districtId === 'hangar'));
        return `<article class="uga-job-card is-${escapeHtml(job.status || 'queued')}${job.status === 'active' ? ' uga-attention' : ''}">
          <div class="uga-job-order"><b>${String(index + 1).padStart(2, '0')}</b><span>${pausedOnEmergencyJump ? 'PAUSED ON EMERGENCY JUMPS' : escapeHtml(prettyToken(job.status || 'queued'))}</span></div>
          <div class="uga-job-copy"><small>${escapeHtml(prettyToken(job.kind))} · TIER ${formatValue(job.targetTier)}</small><b>${escapeHtml(facility.name || prettyToken(job.facilityId))}</b><div class="uga-job-progress"><i style="--value:${progress}%"></i><span>${formatValue(job.workCompleted)} / ${formatValue(job.workRequired)} WORK</span></div></div>
          <div class="uga-job-controls">
            <button type="button" data-job-order="${escapeHtml(job.id)}:-1" aria-label="Move ${escapeHtml(facility.name || 'job')} earlier" ${index === 0 ? 'disabled' : ''}>${icon('chevron')}</button>
            <button type="button" data-job-order="${escapeHtml(job.id)}:1" aria-label="Move ${escapeHtml(facility.name || 'job')} later" ${index === queue.length - 1 ? 'disabled' : ''}>${icon('chevron')}</button>
            <button type="button" class="is-danger${confirmationKey === cancelKey ? ' is-confirming' : ''}" data-job-cancel="${escapeHtml(job.id)}" ${job.rescueFunded || protectedCore ? 'disabled' : ''}>${job.rescueFunded ? 'CORE RESCUE' : protectedCore ? 'REQUIRED CORE' : confirmationKey === cancelKey ? 'CONFIRM' : 'CANCEL'}</button>
          </div>
        </article>`;
      }).join('') : '<div class="uga-empty-state">No construction jobs queued. Select a district plot to commission or expand.</div>'}</div>
    </section>`;
  }

  function constructionPlotMarkup(definition, districtState, tier, status) {
    const plotId = `tier${tier}`;
    const job = status.queue.find(entry => entry.districtId === selectedDistrictId && Number(entry.targetTier) === tier);
    const installedId = districtState.facilities?.[plotId] || null;
    const installed = facilitiesCatalog(getCatalog())[installedId];
    const complete = districtState.commissioned !== false && tier <= districtState.tier;
    const locked = tier > districtState.tier + 1 || (districtState.commissioned === false && tier > 1);
    const selected = selectedBuildPlotId === plotId;
    const label = tier === 1 ? 'Required Core' : `Tier-${tier} Specialization`;
    return `<button type="button" class="uga-build-plot${selected ? ' is-selected' : ''}${complete ? ' is-complete' : ''}${job ? ' is-building' : ''}${locked ? ' is-locked' : ''}" data-build-plot="${plotId}" ${locked ? 'disabled' : ''}>
      <span class="uga-build-plot-tier">T${tier}</span>
      <span class="uga-build-plot-copy"><small>${label}</small><b>${escapeHtml(job ? (facilitiesCatalog(getCatalog())[job.facilityId]?.name || 'Construction active') : installed?.name || (complete ? 'Operational' : 'Available Plot'))}</b></span>
      <span class="uga-build-plot-state">${job ? `${formatValue(job.workCompleted)} / ${formatValue(job.workRequired)}` : complete ? 'ONLINE' : locked ? 'LOCKED' : 'SELECT'}</span>
    </button>`;
  }

  function facilityChoiceMarkup(facility, districtState) {
    const installedId = districtState.facilities?.[`tier${facility.tier}`];
    const installed = installedId === facility.id;
    const quote = installed ? null : constructionQuote(selectedDistrictId, facility.id);
    const key = `build:${selectedDistrictId}:${facility.id}`;
    const issueCopy = quote?.issues?.map(entry => entry.message || entry.code).filter(Boolean).join(' · ');
    return `<article class="uga-facility-choice${installed ? ' is-installed' : ''}${quote && !quote.ok ? ' is-unavailable' : ''}">
      <div class="uga-facility-preview" aria-hidden="true"><i></i><span>${icon(selectedDistrictId)}</span><b>T${facility.tier}</b></div>
      <div class="uga-facility-copy"><small>${installed ? 'INSTALLED FACILITY' : installedId ? 'RETROFIT ALTERNATIVE' : 'AVAILABLE FACILITY'}</small><h3>${escapeHtml(facility.name)}</h3><p>${escapeHtml(facility.description)}</p><div class="uga-facility-effects">${constructionEffectMarkup(facility.effects)}</div></div>
      <div class="uga-facility-authorization">
        ${quote ? `<div class="uga-facility-cost">${costMarkup(quote.cost)}</div><dl><div><dt>WORK</dt><dd>${formatValue(quote.workRequired)} CYCLES</dd></div><div><dt>POWER AFTER</dt><dd>${formatValue(quote.projectedPower?.consumedMW)} / ${formatValue(quote.projectedPower?.generatedMW)} MW</dd></div></dl>` : ''}
        ${issueCopy ? `<p class="uga-construction-issue">${icon('warning')}${escapeHtml(issueCopy)}</p>` : ''}
        <button type="button" class="uga-primary-button${confirmationKey === key ? ' is-confirming' : ''}" data-build-facility="${escapeHtml(facility.id)}" ${installed || (quote && !quote.ok) ? 'disabled' : ''}>${installed ? 'INSTALLED' : confirmationKey === key ? (installedId ? 'CONFIRM RETROFIT' : 'CONFIRM CONSTRUCTION') : (installedId ? 'AUTHORIZE RETROFIT' : 'AUTHORIZE CONSTRUCTION')}</button>
      </div>
    </article>`;
  }

  function constructionPanel() {
    const catalog = districtsCatalog(getCatalog());
    const definition = normalizeDistrict(selectedDistrictId, catalog);
    const districtState = districtTierState(getState(), selectedDistrictId, definition);
    const status = constructionStatus();
    if (!selectedBuildPlotId) selectedBuildPlotId = districtState.commissioned === false ? 'tier1' : `tier${Math.min(3, districtState.tier + 1)}`;
    const tier = Math.max(1, Math.min(3, Number(String(selectedBuildPlotId).replace('tier', '')) || 1));
    const commissionQuote = districtState.commissioned === false ? constructionQuote(selectedDistrictId) : null;
    const rescueQuote = coreCommissionRescueQuote();
    const rescueGrant = rescueQuote.grant || {};
    const rescueNeeded = Object.values(rescueGrant).some(value => Number(value) > 0) || Number(rescueQuote.powerGrantMW) > 0;
    const rescueUsed = getState().ship?.coreCommissionRescueUsed === true;
    const rescueKey = 'construction:core-rescue';
    const rescueDetails = [
      ...['credits', 'alloys', 'components'].filter(key => Number(rescueGrant[key]) > 0).map(key => `${formatValue(rescueGrant[key])} ${key}`),
      ...(Number(rescueQuote.powerGrantMW) > 0 ? [`${formatValue(rescueQuote.powerGrantMW)} MW backup`] : [])
    ].join(' · ');
    const commissionKey = `build:${selectedDistrictId}:commission`;
    const choices = tier > 1 ? facilityChoices(selectedDistrictId, tier) : [];
    return `<div class="uga-context-scroll uga-construction-view">
      <div class="uga-context-heading"><div class="uga-heading-icon">${icon('build')}</div><div><span class="uga-sector-pill is-${definition.sector}">NEXUS-VII INTERNAL WORKS</span><h2>Construction</h2></div><div class="uga-heading-badges"><span class="uga-tier-badge">${escapeHtml(definition.name)}</span></div></div>
      ${commandVisual(districtVisualKind(selectedDistrictId), `${definition.name} sealed interior construction bay`)}
      ${rescueNeeded || rescueUsed ? `<section class="uga-commission-card"><div><small>FIRST-OPERATION SAFETY NET // ONE TIME</small><h3>Core Commissioning Requisition</h3><p>${rescueUsed ? 'Required core work is protected from cancellation. The backup allocation remains tied to this career.' : `Requisition only the missing Mission Ops and Strike Bay core work. ${escapeHtml(rescueDetails)}; no optional construction budget is paid out.`}</p>${!rescueQuote.ok && !rescueUsed ? `<p class="uga-construction-issue">${icon('warning')}${escapeHtml((rescueQuote.issues || []).map(entry => entry.message).join(' · '))}</p>` : ''}</div>${!rescueUsed ? `<button type="button" class="uga-primary-button${confirmationKey === rescueKey ? ' is-confirming' : ''}" data-core-rescue ${rescueQuote.ok ? '' : 'disabled'}>${confirmationKey === rescueKey ? 'CONFIRM REQUISITION' : 'REQUISITION CORE WORK'}</button>` : ''}</section>` : ''}
      ${constructionQueueMarkup(status)}
      <section class="uga-district-plots"><header><div><small>AUTHORED COMPARTMENT PLOTS</small><h3>${escapeHtml(definition.name)}</h3></div><span>${districtState.commissioned === false ? 'UNCOMMISSIONED' : `TIER ${districtState.tier} ONLINE`}</span></header>
        <div class="uga-build-plot-grid">${[1, 2, 3].map(plotTier => constructionPlotMarkup(definition, districtState, plotTier, status)).join('')}</div>
      </section>
      ${districtState.commissioned === false ? `<section class="uga-commission-card"><div><small>PHYSICAL DISTRICT COMMISSIONING</small><h3>${escapeHtml(definition.name)} Core</h3><p>Bring the visible compartment online, install its required Tier-1 core, and preserve future Tier-2 and Tier-3 plots.</p><div class="uga-facility-cost">${costMarkup(commissionQuote?.cost)}</div>${commissionQuote?.issues?.length ? `<p class="uga-construction-issue">${icon('warning')}${escapeHtml(commissionQuote.issues.map(entry => entry.message).join(' · '))}</p>` : ''}</div><button type="button" class="uga-primary-button${confirmationKey === commissionKey ? ' is-confirming' : ''}" data-build-commission ${commissionQuote?.ok ? '' : 'disabled'}>${confirmationKey === commissionKey ? 'CONFIRM COMMISSION' : 'AUTHORIZE COMMISSIONING'}</button></section>` : tier === 1 ? `<section class="uga-commission-card is-complete"><div><small>REQUIRED CORE // ONLINE</small><h3>${escapeHtml(facilitiesCatalog(getCatalog())[districtState.facilities?.tier1]?.name || `${definition.name} Core`)}</h3><p>The district core remains permanent while Tier-2 and Tier-3 specializations can be replaced through retrofits.</p></div></section>` : `<section class="uga-facility-choices"><header><small>TIER ${tier} MUTUALLY EXCLUSIVE FACILITIES</small><h3>Choose one authored specialization</h3><p>The installed Tier-${tier} facility remains authoritative until a confirmed retrofit completes.</p></header>${choices.length ? choices.map(facility => facilityChoiceMarkup(facility, districtState)).join('') : '<div class="uga-empty-state">No authored facility choices are available for this plot.</div>'}</section>`}
    </div>`;
  }

  /* THE SHIP IS THE MENU.

     NEXUS-VII commissions a Research Directorate, a Coalition Embassy, a
     Mission Operations deck, a Survey Lab, a Habitat and a Logistics hold -
     and until now standing in any of them showed tier plots and module
     sockets, while the actual research, recruiting, contracts, archive,
     roster and cargo lived under separate tabs that never mentioned a room.
     A player who walked to the Research Directorate to do research found
     construction. That is the same disconnect the Command Core had, repeated
     five more times, and it is why the module read as a ship bolted to a menu
     rather than a ship you command from.

     A room now opens with its work and keeps its hardware below, so there is
     one place each job happens and it is somewhere you can walk to. */
  function roomWorkBody(districtId) {
    /* Research is the one job that genuinely cannot happen until its room is
       built, and the room already shows a commission card. Rendering the
       panel's own offline notice above it would say the same thing twice. */
    /* COMMAND CORE IS GALACTIC COMMAND.
       The ship commissions a command_core from first launch - the one district
       with its own facility id rather than the generic tier1 core - and it
       renders as a room with a holo table and console banks. It was briefly a
       special case that replaced the whole district panel, which fixed the
       disconnect but cost the Command Core the one thing every other room on
       the ship has: its own identity header, sector, power draw and tier. It is
       the seventh room with work now, on the same rule as the other six. */
    if (districtId === 'command') return campaignHubPanel(true);
    if (districtId === 'research') return getState().ship?.districts?.research?.commissioned === false ? '' : withoutContextScroll(researchPanel());
    if (districtId === 'factions') return withoutContextScroll(factionPanel());
    if (districtId === 'mission_ops') return withoutContextScroll(contractsPanel('contracts'));
    if (districtId === 'survey') return withoutContextScroll(intelPanel());
    if (districtId === 'habitat') return withoutContextScroll(crewPanel());
    if (districtId === 'logistics') return withoutContextScroll(logisticsPanel());
    /* THE LAST FOUR ROOMS HAD NO JOB IN THEM.
       Every district renders the same compartment chrome — tier rail, staffing,
       visual upgrades, module sockets — so a room with no work body does not
       read as unfinished, it reads as a room whose work is not unlocked yet.
       Four of the eleven were in that state, and three of them already had a
       panel written for them that nothing routed here:

         engineering  constructionPanel() — the Stores & Manifest room links
                      straight to it with "UPGRADE SHIP · ENGINEERING", and the
                      button landed on an empty compartment.
         hangar       deploymentViewPanel() — the deployment-sections action
                      calls selectDistrict('hangar') expecting the planner, and
                      the planner was not there.
         fabricator   inventoryPanel() — Fabrication & Armory is where the
                      manifest belongs. */
    if (districtId === 'engineering') return withoutContextScroll(constructionPanel());
    if (districtId === 'hangar') return withoutContextScroll(deploymentViewPanel('hangar'));
    if (districtId === 'fabricator') return withoutContextScroll(inventoryPanel('arsenal'));
    if (districtId === 'navigation') return navigationPanel();
    return '';
  }

  /* The Navigation Bridge is the only one of the four with no panel already
     written, and it is the room the ship departs from — so it answers the two
     questions a bridge exists to answer: where are we, and can we leave.
     Departure reuses the same onExit the Command Core's objective card raises,
     rather than inventing a second route out of the ship. */
  function navigationPanel() {
    const state = getState();
    const catalog = getCatalog();
    const systemId = state.route?.systemId || 'aelos';
    const systems = asArray(catalog.systems || catalog.SHOWCASE_SYSTEMS);
    const current = systems.find(entry => entry.id === systemId) || null;
    const known = asArray(state.world?.systems && Object.entries(state.world.systems)
      .filter(([, entry]) => entry && entry.discovered !== false)
      .map(([id, entry]) => ({ id, ...entry })));
    const fuel = Math.max(0, Math.floor(Number(state.resources?.fuel) || 0));
    const probes = Math.max(0, Math.floor(Number(state.resources?.probes) || 0));
    const canDepart = fuel > 0;
    return `<div class="uga-section-title"><small>ASTROGATION // CURRENT PLOT</small><h2>Navigation Bridge</h2>
        <p>The ship's position, the systems on file, and the consumables a departure spends.</p></div>
      ${commandVisual('navigation', 'NEXUS-VII sealed navigation bridge and physical astrogation console')}
      <div class="uga-record-list">
        <article class="uga-record-card">
          <span class="uga-record-sigil">${icon('navigation')}</span>
          <div><small>CURRENT SYSTEM</small><h3>${escapeHtml(current?.name || prettyToken(systemId))}</h3>
            <p>${escapeHtml(current?.summary || current?.description || 'Holding station at the expedition anchorage.')}</p></div>
        </article>
        <article class="uga-record-card">
          <span class="uga-record-sigil">${icon('power')}</span>
          <div><small>TRANSIT STORES</small><h3>${fuel} fuel · ${probes} probes</h3>
            <p>${canDepart ? 'Sufficient for departure. Probes are spent on orbital surveys once underway.'
              : 'No fuel aboard. Recover fuel from an operation or the Stores & Manifest before plotting a departure.'}</p></div>
        </article>
        <article class="uga-record-card">
          <span class="uga-record-sigil">${icon('survey')}</span>
          <div><small>SYSTEMS ON FILE</small><h3>${known.length || 1} charted</h3>
            <p>${known.length > 1 ? escapeHtml(known.map(entry => prettyToken(entry.id)).join(' · '))
              : 'Only the anchorage is charted. Survey further out to resolve the next vector.'}</p></div>
        </article>
      </div>
      <button type="button" class="uga-primary-button" data-action="exit"${canDepart ? '' : ' disabled'}>
        ${canDepart ? 'DEPART THE SHIP' : 'DEPARTURE UNAVAILABLE — NO FUEL'}${icon('chevron')}</button>`;
  }

  /* Each of those panels owns a uga-context-scroll because each is also a
     whole context in its own right. Inside a room the district panel is
     already providing one, so take exactly one wrapper off. A shape this does
     not recognise is returned untouched - a nested scroll looks wrong but
     still renders, where a throw here would blank the interface mid-session.
     test-galactic-campaign-product-model.mjs asserts the shape instead, so a
     panel that stops being scroll-wrapped fails a gate rather than a player. */
  function withoutContextScroll(markup) {
    const open = markup.indexOf('>');
    const close = markup.lastIndexOf('</div>');
    if (open < 0 || close <= open) return markup;
    if (!markup.slice(0, open).includes('uga-context-scroll')) return markup;
    if (markup.slice(close + 6).trim()) return markup;
    return markup.slice(open + 1, close);
  }
  function districtPanel() {
    const catalog = districtsCatalog(getCatalog());
    const definition = normalizeDistrict(selectedDistrictId, catalog);
    const districtState = districtTierState(getState(), selectedDistrictId, definition);
    const canUpgrade = !definition.fixed && districtState.tier < 3;
    const activeTier = definition.tiers?.find?.(entry => Number(entry.level) === districtState.tier) || definition.tiers?.[districtState.tier - 1];
    const capacity = definition.capacity || definition.population || activeTier?.capacity || null;
    const capacityLabel = capacity && typeof capacity === 'object'
      ? Object.entries(capacity).map(([key, value]) => `${prettyToken(key)} ${formatValue(value)}`).join(' // ')
      : capacity ? `${formatValue(capacity)} CAPACITY` : '';
    const powerDraw = activeTier?.capacity?.powerDrawMW ?? definition.basePowerDrawMW ?? 10;
    const work = roomWorkBody(selectedDistrictId);

    if (districtState.commissioned === false) return `<div class="uga-context-scroll">
      <div class="uga-context-heading"><div class="uga-heading-icon">${icon(selectedDistrictId)}</div><div><span class="uga-sector-pill is-${definition.sector}">${escapeHtml(definition.deckName)}</span><h2>${escapeHtml(definition.name)}</h2></div><div class="uga-heading-badges"><span class="uga-tier-badge">UNCOMMISSIONED</span></div></div>
      <section class="uga-commission-card"><div><small>ROOM OFFLINE</small><h3>Commission this compartment</h3><p>Build the Tier-1 core to unlock its crew, modules, and services.</p></div><button type="button" class="uga-primary-button" data-action="open-construction">OPEN CONSTRUCTION</button></section>
      ${!work ? commandVisual(districtVisualKind(selectedDistrictId), `${definition.name} sealed interior awaiting commissioning`) : ''}
      ${/* A dark compartment does not suspend the job. Recruiting a resident
           faction and reading contracts are how a commander reaches step 03,
           and Mission Operations and the Embassy both start uncommissioned -
           gating them behind their own construction would strand the player
           in front of a commission card with no way to afford it. */ work}
    </div>`;

    return `<div class="uga-context-scroll">
      <div class="uga-context-heading">
        <div class="uga-heading-icon">${icon(selectedDistrictId)}</div>
        <div>
          <span class="uga-sector-pill is-${definition.sector}">${definition.sector === 'civil' ? 'CIVIL SECTOR' : 'FUNCTION SECTOR'} // ${escapeHtml(definition.deckName)}</span>
          <h2>${escapeHtml(definition.name)}</h2>
        </div>
        <div class="uga-heading-badges">
          <span class="uga-power-pill">${icon('power')} ${powerDraw} MW</span>
          <span class="uga-tier-badge">${definition.fixed ? 'FIXED' : `TIER ${districtState.tier}`}</span>
        </div>
      </div>
      ${canUpgrade ? `<section class="uga-upgrade-block">
        <div><small>ROOM UPGRADE</small><b>Tier ${districtState.tier + 1} facilities</b></div>
        <button type="button" class="uga-primary-button" data-action="upgrade">VIEW OPTIONS${icon('chevron')}</button>
      </section>` : ''}
      ${work}
      <details class="uga-hardware-details" data-hardware-district="${escapeHtml(selectedDistrictId)}" ${hardwareExpandedDistricts.has(selectedDistrictId) ? 'open' : ''}>
        <summary>${icon('engineering')}<span>ROOM SYSTEMS</span><small>CREW · MODULES · TIERS</small>${icon('chevron')}</summary>
        <div class="uga-hardware-body">
          ${adjacencySynergyBanner(selectedDistrictId)}
          ${tierRail(districtState.tier, definition.fixed)}
          <p class="uga-district-description">${escapeHtml(definition.description)}</p>
          <div class="uga-activity-line"><i></i><span>${escapeHtml(activeTier?.activity ? prettyToken(activeTier.activity) : definition.activity)}</span>${capacityLabel ? `<b>${escapeHtml(capacityLabel)}</b>` : ''}</div>
          <section class="uga-panel-section"><header><span>CAPABILITY PROGRESSION</span><small>01</small></header>${featureRows(definition, districtState.tier)}</section>
          <section class="uga-panel-section"><header><span>SPECIALIST STATIONS</span><small>02</small></header><div class="uga-staff-list">${staffRows(definition, districtState)}</div></section>
          <section class="uga-panel-section"><header><span>VISUAL UPGRADES & ARCHITECTURE</span><small>03</small></header><div class="uga-visual-list">${visualUpgradeRows(definition, districtState)}</div></section>
          <section class="uga-panel-section"><header><span>INTERNAL MODULE SOCKETS</span><small>04</small></header><div class="uga-socket-list">${socketRows(definition, districtState)}</div></section>
          ${!definition.fixed && !canUpgrade ? '<div class="uga-max-tier">MAXIMUM AUTHORIZED TIER REACHED</div>' : ''}
        </div>
      </details>
    </div>`;
  }

  function factionPanel() {
    const catalog = getCatalog();
    const state = getState();
    const fallback = [
      { id: 'nova', name: 'Nova', doctrine: 'Precision and reconnaissance' },
      { id: 'dominion', name: 'Dominion', doctrine: 'Heavy assault and containment' },
      { id: 'syndicate', name: 'Syndicate', doctrine: 'Infiltration and field logistics' }
    ];
    const definitions = asArray(catalog.factions || catalog.FACTION_CATALOG);
    const factions = fallback.map(base => ({ ...base, ...(definitions.find(item => item.id === base.id) || {}) }));
    return `<div class="uga-context-scroll">
      <div class="uga-section-title"><small>PERMANENT NEXUS-VII RESIDENCY</small><h2>Resident Factions</h2><p>UGA sponsors operations. Resident factions provide the deployable proxy force.</p></div>
      ${commandVisual('embassy', 'NEXUS-VII sealed coalition embassy and diplomatic chamber')}
      <div class="uga-record-list">${factions.map(faction => {
        const progress = state.factions?.[faction.id] || {};
        const resident = progress.resident === true || progress.residency === 'resident' || progress.status === 'ready' || progress.status === 'recovering' || progress.status === 'deployed';
        return `<article class="uga-record-card">
          <span class="uga-record-sigil">${icon('factions')}</span>
          <div><small>${resident ? 'RESIDENT DELEGATION' : 'RECRUITMENT CHAIN REQUIRED'}</small><h3>${escapeHtml(faction.name)}</h3><p>${escapeHtml(faction.doctrine || faction.description || '')}</p><div class="uga-reputation"><span style="--value:${Math.min(100, Number(progress.reputation || 0))}%"></span><b>${formatValue(progress.reputation || 0)} REP</b></div></div>
          <button type="button" class="uga-mini-button" data-residency="${escapeHtml(faction.id)}" ${resident ? 'disabled' : ''}>${resident ? 'RESIDENT' : 'RECRUIT'}</button>
        </article>`;
      }).join('')}</div>
      ${commanderPanel()}
    </div>`;
  }

  function commanderPanel() {
    const catalog = getCatalog();
    const state = getState();
    const commanders = asArray(catalog.commanders || catalog.COMMANDER_CATALOG || state.commanders)
      .filter(commander => {
        const progress = personnelState(state, 'commanders', commander.id);
        return progress.unlocked !== false && progress.status !== 'locked';
      });
    if (!commanders.length) return `<section class="uga-panel-section"><header><span>COMMANDER READINESS</span><small>02</small></header><div class="uga-empty-state">${portraitAuditPending() ? 'Authenticating authored commander dossiers.' : 'Commander dossiers remain sealed until approved illustrated portraits are installed.'}</div></section>`;
    return `<section class="uga-panel-section"><header><span>COMMANDER READINESS</span><small>02</small></header><div class="uga-commander-grid">${commanders.map(commander => {
      const progress = { ...commander, ...personnelState(state, 'commanders', commander.id) };
      const name = commander.name || prettyToken(commander.id);
      return `<button type="button" class="uga-commander-card" data-commander="${escapeHtml(commander.id)}"><span class="uga-personnel-portrait">${personnelPortraitImage(commander.id, name)}</span><b>${escapeHtml(name)}</b><small>${escapeHtml(progress.injury ? `INJURED // ${progress.injury}` : progress.readiness !== undefined ? `READINESS ${progress.readiness}%` : 'READY')}</small></button>`;
    }).join('')}</div></section>`;
  }

  function planningEligibility(mission, state) {
    if (typeof options.getMissionEligibility !== 'function') return null;
    // A contract is open for planning if any authored proxy/support pair can
    // launch. Otherwise a probe shortage can hide Field Lab, or wounded Nova
    // crew can hide a valid Dominion-led UGA purge before the planner opens.
    const residents = Object.entries(state.factions || {})
      .filter(([, faction]) => faction?.resident)
      .map(([id]) => id);
    const proxyIds = mission.access?.type === 'faction_exclusive'
      ? [mission.access.factionId]
      : residents.sort((a, b) => Number(b === state.commissioning?.factionId) - Number(a === state.commissioning?.factionId));
    const supports = asArray(mission.supportIds);
    let first = null;
    for (const proxyFactionId of proxyIds.length ? proxyIds : [null]) {
      for (const supportId of supports.length ? supports : [null]) {
        const request = { ...(proxyFactionId ? { proxyFactionId } : {}), ...(supportId ? { supportId } : {}) };
        const result = options.getMissionEligibility(mission.id, request);
        first ||= result;
        if (result?.eligible) return result;
      }
    }
    return first;
  }

  function missionLocks(mission, state) {
    const progress = state.missions?.[mission.id] || {};
    const eligibility = planningEligibility(mission, state);
    const locks = eligibility?.locks || mission.locks || progress.locks || [];
    if (progress.lockedReason) return [progress.lockedReason];
    return Array.isArray(locks) ? locks
      .filter(lock => typeof lock === 'string' || lock?.met === false || lock?.message)
      .map(lock => typeof lock === 'string' ? lock : lock.message || lock.reason || lock.label)
      .filter(Boolean) : [];
  }

  function debriefRewardSummary(result) {
    const rewards = Object.entries(result?.rewards || {}).filter(([, value]) => Number(value) !== 0)
      .map(([key, value]) => `+${formatValue(value)} ${prettyToken(key)}`);
    return rewards.length ? rewards.join(' // ') : 'No material rewards';
  }

  function debriefArchive(state, catalog) {
    const history = Array.isArray(state.operations?.history)
      ? state.operations.history.filter(entry => entry?.operation && entry?.result?.resultId)
      : [];
    const visible = [...history].reverse().slice(0, 8);
    const missions = asArray(catalog.missions || catalog.MISSION_CATALOG);
    const factions = asArray(catalog.factions || catalog.FACTION_CATALOG);
    const resultIds = visible.map(entry => entry.result.resultId);
    return `<section class="uga-debrief-archive" data-debrief-archive data-archive-count="${history.length}" data-archive-visible-count="${visible.length}" data-archive-result-ids="${escapeHtml(resultIds.join(','))}">
      <header><div><small>EXPERIMENTAL PREVIEW // SOLO LOCAL CAREER</small><h3>Debrief Archive</h3></div><b>${history.length} RESULT${history.length === 1 ? '' : 'S'}</b></header>
      <p>This archive is stored only in this experimental local career. It does not transfer to a cloud account.</p>
      <div class="uga-debrief-list">${visible.length ? visible.map(entry => {
        const operation = entry.operation;
        const result = entry.result;
        const mission = missions.find(item => item.id === (result.missionId || operation.missionId));
        const proxy = factions.find(item => item.id === (result.proxyFactionId || operation.proxyFactionId));
        return `<article class="uga-debrief-record is-${escapeHtml(result.outcome || 'unknown')}" data-result-id="${escapeHtml(result.resultId)}" data-outcome="${escapeHtml(result.outcome || 'unknown')}">
          <div><small>${escapeHtml(result.resultId)}</small><strong>${escapeHtml(mission?.name || mission?.title || prettyToken(result.missionId || operation.missionId))}</strong></div>
          <dl><div><dt>PROXY</dt><dd>${escapeHtml(proxy?.name || prettyToken(result.proxyFactionId || operation.proxyFactionId))}</dd></div><div><dt>OUTCOME</dt><dd>${escapeHtml(prettyToken(result.outcome || 'unknown'))}</dd></div><div><dt>SCORE</dt><dd>${formatValue(result.score || 0)} / 100</dd></div></dl>
          <p>${escapeHtml(debriefRewardSummary(result))}</p>
        </article>`;
      }).join('') : '<div class="uga-empty-state">Completed ground operations will appear here after their exactly-once result is acknowledged.</div>'}</div>
    </section>`;
  }

  function debriefCount(state) {
    const history = state?.operations?.history;
    return Array.isArray(history) ? history.length : 0;
  }

  function contractsPanel(visualKind = 'contracts') {
    const catalog = getCatalog();
    const state = getState();
    const missions = asArray(catalog.missions || catalog.MISSION_CATALOG || state.availableMissions || state.missions).filter(item => item.id);
    /* Keep live contracts and completed debriefs as separate shelves. Rendering
       every briefing and archive entry at equal weight previously buried the
       operation the player came here to launch. This comment must stay outside
       the template literal so implementation notes never reach the UI. */
    return `<div class="uga-context-scroll">
      <div class="uga-section-title"><small>SPONSORSHIP AND ELIGIBILITY</small><h2>Contracts</h2><p>Faction conflicts require their resident sponsor. Brood purges are issued only by UGA.</p></div>
      ${commandVisual(visualKind, visualKind === 'hangar' ? 'NEXUS-VII sealed strike hangar and deployment gantry' : 'NEXUS-VII mission planning table and planetary objective beacon')}
      ${!state.commissioning?.completed ? `<section class="uga-commission-card"><div><h3>Hire your first commander</h3><p>Choose a faction and complete commander hiring before planning ground missions. Once hired, select an available commander from that faction in the Deployment Hangar.</p></div><button type="button" class="uga-primary-button" data-host-route="new-career-faction" ${hostRoutesAvailable() ? '' : 'disabled'}>HIRE COMMANDER</button></section>` : ''}
      <section class="uga-panel-section" aria-label="Available operations">
        <header><span>AVAILABLE OPERATIONS</span><small>${String(missions.length).padStart(2, '0')}</small></header>
      <div class="uga-record-list">${missions.length ? missions.map(mission => {
        const locks = missionLocks(mission, state);
        const isBrood = isBroodMission(mission);
        const contractFaction = mission.contractFactionId || mission.access?.factionId;
        const summary = mission.description || mission.summary || [
          prettyToken(mission.objective?.type || mission.missionType),
          mission.systemId ? `${prettyToken(mission.systemId)} SYSTEM` : '',
          mission.difficulty ? `THREAT ${mission.difficulty}` : ''
        ].filter(Boolean).join(' // ');
        return `<button type="button" class="uga-mission-card${selectedMissionId === mission.id ? ' is-selected' : ''}${locks.length ? ' is-locked' : ''}" data-mission="${escapeHtml(mission.id)}" ${locks.length ? 'disabled' : ''}>
          <span class="uga-mission-code">${escapeHtml(mission.code || (isBrood ? 'UGA-PURGE' : 'CONTRACT'))}</span>
          <h3>${escapeHtml(mission.name || mission.title || prettyToken(mission.id))}</h3>
          <p>${escapeHtml(summary)}</p>
          <div><small>${isBrood ? 'UGA SPONSOR // THREAT' : 'UGA SPONSOR // CONTRACT'}</small><b>${escapeHtml(isBrood ? 'UGA // BROOD' : `UGA // ${prettyToken(contractFaction || 'Resident Faction')}`)}</b></div>
          ${locks.length ? `<ul>${locks.map(lock => `<li>${icon('lock')}${escapeHtml(lock)}</li>`).join('')}</ul>` : `<span class="uga-mission-ready">${icon('check')} READY FOR PLANNING</span>`}
        </button>`;
      }).join('') : '<div class="uga-empty-state">No operation packages are currently available.</div>'}</div>
      </section>
      <section class="uga-panel-section" aria-label="Operation debriefs">
        <header><span>DEBRIEF ARCHIVE</span><small>${String(debriefCount(state)).padStart(2, '0')}</small></header>
        ${debriefArchive(state, catalog)}
      </section>
    </div>`;
  }

  function missionUnfinished(mission, state, control) {
    const region = Object.values(control.areas || {}).find(area => area.missionId === mission.id);
    if (region) return !region.controlled;
    return !(state.operations?.history || []).some(entry => entry?.result?.outcome === 'victory'
      && (entry.result.missionId || entry.operation?.missionId) === mission.id);
  }

  function progressPanel() {
    const catalog = getCatalog();
    const state = getState();
    const missions = asArray(catalog.missions || catalog.MISSION_CATALOG || state.availableMissions || state.missions).filter(item => item.id);
    const control = groundControl();
    const unfinished = missions.filter(mission => missionUnfinished(mission, state, control)
      && (mission.access?.type !== 'faction_exclusive' || state.factions?.[mission.access.factionId]?.resident));
    const foundIds = new Set(Array.isArray(state.discoveries)
      ? state.discoveries.map(item => item.id) : state.discoveries?.foundIds || []);
    const known = unfinished.filter(mission => (mission.requirements?.discoveryIds || []).every(id => foundIds.has(id)));
    const nextMission = known.find(mission => missionLocks(mission, state).length === 0) || known[0] || null;
    const nextLocks = nextMission ? missionLocks(nextMission, state) : [];
    const needsCommission = !state.commissioning?.completed;
    const authoredSurveys = asArray(catalog.surveys || catalog.SURVEY_CATALOG);
    const remainingSignals = authoredSurveys.filter(survey => state.world?.systems?.[survey.systemId]?.discovered
      && !state.surveys?.[survey.id]?.depleted);
    const signalsExhausted = authoredSurveys.length > 0 && !remainingSignals.length;
    const needsSurvey = !needsCommission && !nextMission && unfinished.length > 0 && !signalsExhausted;
    const nextTitle = needsCommission ? 'Hire your first commander'
      : nextMission?.name || nextMission?.title || (nextMission ? prettyToken(nextMission.id)
        : needsSurvey ? 'Survey to reveal the next region' : unfinished.length ? 'Review operation requirements' : 'Current frontier clear');
    const routes = [
      { id: 'galactic-operations', action: needsSurvey ? 'exit' : null, icon: 'contracts', title: 'Expedition', detail: nextTitle, status: needsCommission ? 'COMMISSION' : nextMission ? (nextLocks.length ? 'LOCKED' : 'READY') : needsSurvey ? 'SURVEY' : unfinished.length ? 'REVIEW' : 'COMPLETE' },
      { id: 'operations', icon: 'mission_ops', title: 'Classic Operations', detail: 'Missions & weekly operations', status: hostRoutesAvailable() ? 'PLAYABLE' : 'MASSFRONT HOST' },
      { id: 'development', icon: 'research', title: 'Classic Development', detail: 'Classic crafting & loadouts · separate from UGA', status: hostRoutesAvailable() ? 'AVAILABLE' : 'MASSFRONT HOST' }
    ];
    return `<div class="uga-context-scroll uga-progress-view"><div class="uga-section-title"><small>PROGRESS</small><h2>Choose your next move</h2></div>${commandVisual('navigation', 'NEXUS-VII sealed navigation bridge showing the next expedition routes')}<div class="uga-progress-grid">${routes.map(route => {
      const entry = getCampaignHubRoute(route.id);
      const reachable = route.action === 'exit' || entry && hubRouteReachable(entry);
      const target = route.action ? `data-action="${escapeHtml(route.action)}"` : `data-hub-route="${escapeHtml(route.id)}"`;
      return `<button type="button" class="uga-progress-route${reachable ? '' : ' is-locked'}${route.status === 'LOCKED' ? ' is-objective-locked' : ''}" ${target} ${reachable ? '' : 'disabled'}><span>${icon(route.icon)}</span><div><small>${escapeHtml(route.status)}</small><strong>${escapeHtml(route.title)}</strong><p>${escapeHtml(route.detail)}</p></div>${icon(reachable ? 'chevron' : 'lock')}</button>`;
    }).join('')}</div></div>`;
  }

  function deploymentViewPanel(visualKind = 'contracts') {
    if (!selectedMissionId) return contractsPanel(visualKind);
    return `<div class="uga-context-scroll uga-deployment-view">${deploymentPanel(selectedMissionId)}</div>`;
  }

  function deploymentPanel(missionId) {
    const catalog = getCatalog();
    const state = getState();
    const mission = asArray(catalog.missions || catalog.MISSION_CATALOG).find(item => item.id === missionId) || {};
    const residentIds = Object.entries(state.factions || {}).filter(([, progress]) => progress?.resident).map(([id]) => id);
    const factions = asArray(catalog.factions || catalog.FACTION_CATALOG)
      .filter(f => residentIds.includes(f.id) && state.factions?.[f.id]?.status === 'ready');
    const commanders = asArray(catalog.commanders || catalog.COMMANDER_CATALOG || state.commanders);
    const specialists = asArray(catalog.specialists || catalog.SPECIALIST_CATALOG || state.specialists);
    const authoredDoctrines = asArray(catalog.doctrines || catalog.DOCTRINE_CATALOG);
    const authoredSupport = asArray(catalog.supportPackages || catalog.SUPPORT_CATALOG);
    const deploymentUnits = asArray(catalog.deploymentUnits || catalog.DEPLOYMENT_UNIT_CATALOG);
    const deploymentStructures = asArray(catalog.deploymentStructures || catalog.DEPLOYMENT_STRUCTURE_CATALOG);
    const operationMods = asArray(catalog.operationMods || catalog.OPERATION_MOD_CATALOG);
    const doctrines = (authoredDoctrines.length ? authoredDoctrines : [{ id: 'containment', name: 'Containment' }]).filter(item => !mission.doctrineIds || mission.doctrineIds.includes(item.id));
    const support = (authoredSupport.length ? authoredSupport : [{ id: 'survey_drones', name: 'Survey Drone Net' }]).filter(item => !mission.supportIds || mission.supportIds.includes(item.id));
    const exclusiveId = mission.access?.type === 'faction_exclusive' ? mission.access.factionId : null;
    const factionOptions = exclusiveId ? factions.filter(item => item.id === exclusiveId) : factions;
    const previousDraft = deploymentDrafts.get(missionId);
    const defaultEligibility = planningEligibility(mission, state);
    const initialFactionId = factionOptions.some(item => item.id === previousDraft?.proxyFactionId)
      ? previousDraft.proxyFactionId
      : factionOptions.some(item => item.id === defaultEligibility?.defaults?.proxyFactionId)
        ? defaultEligibility.defaults.proxyFactionId
        : factionOptions.some(item => item.id === state.commissioning?.factionId)
          ? state.commissioning.factionId : factionOptions[0]?.id || '';
    const commanderOptions = readyPersonnel(commanders, state, 'commanders', initialFactionId);
    const specialistOptions = readyPersonnel(specialists, state, 'specialists', initialFactionId);
    const landingZones = mission.landingZoneIds?.length ? mission.landingZoneIds : ['primary'];
    const authoritativeManifest = defaultEligibility?.defaults?.deploymentManifest;
    const groundArea = defaultEligibility?.defaults?.groundArea || null;
    const groundMaps = asArray(groundArea?.maps);
    const clearedMapIds = new Set(groundControl().areas[groundArea?.areaId || groundArea?.id]?.clearedMapIds || []);
    // Frontier ladder, tier 4 — battlefield sizes unlock in sequence; locked
    // sizes stay visible with their rung so the next directive is readable.
    const lockedMapIds = new Set((groundArea?.maps || [])
      .filter(map => !isGroundMapUnlocked(state, groundArea?.areaId || groundArea?.id || '', map.id))
      .map(map => map.id));
    const authoredCapacity = mission.deploymentCapacity || { slots: 8, unitLimit: 4, structureLimit: 2, modLimit: 2 };
    const capacity = {
      ...authoredCapacity,
      slots: authoritativeManifest?.slotCapacity ?? authoredCapacity.slots,
      unitLimit: authoritativeManifest?.unitLimit ?? authoredCapacity.unitLimit,
      structureLimit: authoritativeManifest?.structureLimit ?? authoredCapacity.structureLimit,
      modLimit: authoritativeManifest?.modLimit ?? authoredCapacity.modLimit
    };
    const allowedUnits = deploymentUnits.filter(item => !capacity.allowedUnitIds || capacity.allowedUnitIds.includes(item.id));
    const allowedStructures = deploymentStructures.filter(item => !capacity.allowedStructureIds || capacity.allowedStructureIds.includes(item.id));
    const allowedMods = operationMods.filter(item => !capacity.allowedModIds || capacity.allowedModIds.includes(item.id));
    const draft = deploymentDraft(missionId, {
      proxyFactionId: initialFactionId,
      commanderId: commanderOptions.find(item => item.id === state.commissioning?.commanderId)?.id || commanderOptions[0]?.id || '',
      specialistIds: specialistOptions.slice(0, 3).map(item => item.id),
      mapId: defaultEligibility?.defaults?.mapId || '',
      landingZoneId: landingZones[0] || '',
      supportId: defaultEligibility?.defaults?.supportId || support[0]?.id || '',
      doctrineId: doctrines[0]?.id || '',
      deploymentManifest: {
        units: allowedUnits.filter(item => ['recon_team', 'line_section', 'armored_element'].includes(item.id)).map(item => ({ id: item.id, count: 1 })),
        structures: allowedStructures.filter(item => item.id === 'field_relay').map(item => ({ id: item.id, count: 1 })),
        modIds: allowedMods.slice(0, 1).map(item => item.id)
      }
    });
    // Saved UI drafts are not personnel authority. Preserve cargo selections,
    // but reconcile recovered/deployed personnel against the current roster.
    draft.proxyFactionId = initialFactionId;
    if (draft.mapId && (!groundMaps.some(map => map.id === draft.mapId) || lockedMapIds.has(draft.mapId))) draft.mapId = '';
    if (!commanderOptions.some(item => item.id === draft.commanderId)) {
      draft.commanderId = commanderOptions.find(item => item.id === state.commissioning?.commanderId)?.id || commanderOptions[0]?.id || '';
    }
    const readySpecialistIds = new Set(specialistOptions.map(item => item.id));
    draft.specialistIds = [...new Set(draft.specialistIds.filter(id => readySpecialistIds.has(id)))].slice(0, 3);
    for (const person of specialistOptions) if (draft.specialistIds.length < 3 && !draft.specialistIds.includes(person.id)) draft.specialistIds.push(person.id);
    const unitCounts = new Map(draft.deploymentManifest.units.map(item => [item.id, Number(item.count) || 0]));
    const structureCounts = new Map(draft.deploymentManifest.structures.map(item => [item.id, Number(item.count) || 0]));
    const selectedModIds = new Set(draft.deploymentManifest.modIds);
    const slotUsage = allowedUnits.reduce((sum, item) => sum + (unitCounts.get(item.id) || 0) * item.slotCost, 0)
      + allowedStructures.reduce((sum, item) => sum + (structureCounts.get(item.id) || 0) * item.slotCost, 0);
    const deployable = Boolean(initialFactionId && commanderOptions.length && specialistOptions.length >= 3 && doctrines.length && support.length && landingZones.length);
    const specialistIdsReady = draft.specialistIds.length === 3 && new Set(draft.specialistIds).size === 3;
    const unitCount = draft.deploymentManifest.units.reduce((sum, item) => sum + item.count, 0);
    const structureCount = draft.deploymentManifest.structures.reduce((sum, item) => sum + item.count, 0);
    const selectedUnitIds = new Set(draft.deploymentManifest.units.filter(item => item.count > 0).map(item => item.id));
    const manifestReady = slotUsage > 0 && slotUsage <= capacity.slots
      && unitCount <= capacity.unitLimit && structureCount <= capacity.structureLimit
      && draft.deploymentManifest.modIds.length <= capacity.modLimit
      && (capacity.requiredUnitIds || []).every(id => selectedUnitIds.has(id));
    const selectedGroundMap = groundMaps.find(map => map.id === draft.mapId) || null;
    const battlefieldReady = Boolean(groundArea && selectedGroundMap);
    const selectionEligibility = typeof options.getMissionEligibility === 'function'
      ? options.getMissionEligibility(missionId, draft) : null;
    const canCommit = deployable && specialistIdsReady && manifestReady && battlefieldReady && selectionEligibility?.eligible !== false;
    const blockerMessage = selectionEligibility?.locks?.[0]?.message
      || (!specialistIdsReady ? 'Select exactly three unique specialists.'
        : slotUsage <= 0 ? 'Select at least one starting unit group.'
          : slotUsage > capacity.slots ? `Deployment uses ${slotUsage} of ${capacity.slots} available slots.`
            : !manifestReady ? 'The required starting force is incomplete.'
              : !battlefieldReady ? 'Choose a compact, standard, or large battlefield.'
              : 'Deployment loadout is blocked.');
    const deploymentShipNames = { nova: 'Nova Orbital Carrier', dominion: 'Dominion Assault Lander', syndicate: 'Syndicate Phase Manta' };
    const selectedCommander = commanderOptions.find(item => item.id === draft.commanderId);
    const deploymentShipName = deploymentShipNames[draft.proxyFactionId] || 'HQ Deployment Ship';
    return `<section class="uga-deployment-planner" data-mission-id="${escapeHtml(missionId)}" data-faction-id="${escapeHtml(draft.proxyFactionId)}" data-deployment-screen="loadout" data-route="contracts" data-deployment-state="planning" data-ground-route-stage="map" data-selected-area-id="${escapeHtml(groundArea?.areaId || groundArea?.id || '')}" data-selected-map-id="${escapeHtml(draft.mapId)}" data-selected-map-size="${escapeHtml(selectedGroundMap?.size || '')}">
      <div class="uga-deployment-summary" aria-label="Current deployment loadout">
        <span>${icon('hangar')}</span><div><small>HQ DEPLOYMENT CARRIER</small><strong>${escapeHtml(deploymentShipName)}</strong><p>${escapeHtml(selectedCommander?.name || 'Select a ready commander')} · ${draft.specialistIds.length} / 3 specialists</p></div>
      </div>
      <div class="uga-deployment-fields">
      <header><small>STRIKE BAY // HQ CARRIER LOADOUT</small><h3>Deployment Hangar</h3><p>The selected commander\'s carrier delivers the command chassis, starting force, structures, and support package.</p></header>
      <section class="uga-ground-route" data-ground-route-stage="map" data-ground-area="${escapeHtml(groundArea?.areaId || groundArea?.id || '')}">
        <div><small>${escapeHtml(groundArea?.planetName || 'PLANET')}</small><strong>${escapeHtml(groundArea?.areaName || groundArea?.name || 'Deployment area')}</strong></div>
        <label><span>Battlefield · ${clearedMapIds.size} / ${groundMaps.length} cleared</span><strong class="uga-selected-map">${escapeHtml(selectedGroundMap?.name || 'Choose a battlefield')}</strong><select data-deploy="mapId" aria-label="Battlefield size"><option value="">CHOOSE SIZE</option>${groundMaps.map(map => `<option value="${escapeHtml(map.id)}" data-ground-map="${escapeHtml(map.id)}" data-map-size="${escapeHtml(map.size)}" data-map-name="${escapeHtml(map.name)}" ${map.id === draft.mapId ? 'selected' : ''} ${lockedMapIds.has(map.id) ? 'disabled' : ''}>${escapeHtml(map.name)} · ${escapeHtml(prettyToken(map.size))} · ${lockedMapIds.has(map.id) ? 'LOCKED · CLEAR PREVIOUS' : clearedMapIds.has(map.id) ? 'CLEARED / REPLAY' : 'UNCLEARED'}</option>`).join('')}</select></label>
      </section>
      <div class="uga-deployment-identity" aria-label="Commander and resident force selection">
        <label class="uga-deployment-faction"><span>Resident Faction</span><select data-deploy="factionId">${factionOptions.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.proxyFactionId ? 'selected' : ''}>${escapeHtml(item.name || prettyToken(item.id))}</option>`).join('')}</select></label>
        ${personnelSelect('commander', commanderOptions, 0, draft.commanderId)}
      </div>
      <nav class="uga-deployment-stations" aria-label="Deployment Arena stations">
        ${[
          ['base_deployer', 'HQ Deployment Ship', `${deploymentShipName}${selectedCommander ? ` // ${selectedCommander.name || prettyToken(selectedCommander.id)}` : ''}`],
          ['command_chassis', 'Command Chassis', draft.commanderId ? prettyToken(draft.commanderId) : 'Select pilot'],
          ['specialist_muster', 'Specialist Muster', `${draft.specialistIds.length} assigned`],
          ['unit_staging', 'Unit Staging', `${draft.deploymentManifest.units.reduce((sum, item) => sum + item.count, 0)} elements`],
          ['structure_cargo', 'Structure Pallets', `${draft.deploymentManifest.structures.reduce((sum, item) => sum + item.count, 0)} loaded`],
          ['support_service', 'Support & Service', draft.supportId ? prettyToken(draft.supportId) : 'Select support']
        ].map(([id, label, value]) => `<button type="button" class="uga-deployment-station${draft.station === id ? ' is-active' : ''}" data-deployment-station="${id}" aria-pressed="${draft.station === id}"><span>${icon(id === 'command_chassis' ? 'staff' : id === 'base_deployer' ? 'hangar' : id === 'structure_cargo' ? 'inventory' : 'build')}</span><b>${escapeHtml(label)}</b><small>${escapeHtml(value)}</small></button>`).join('')}
      </nav>
      <fieldset data-deployment-section="specialist_muster"><legend>Three Specialists</legend>${[0, 1, 2].map(index => personnelSelect('specialist', specialistOptions, index, draft.specialistIds[index])).join('')}</fieldset>
      <div class="uga-personnel-lock" ${deployable ? 'hidden' : ''}>${icon('lock')}<span>Deployment requires one ready hired commander and three available specialists from your resident faction.</span></div>
      <section class="uga-deployment-manifest${slotUsage > capacity.slots ? ' is-over-capacity' : ''}" data-slot-capacity="${capacity.slots}" data-unit-limit="${capacity.unitLimit}" data-structure-limit="${capacity.structureLimit}" data-mod-limit="${capacity.modLimit}" data-required-unit-ids="${escapeHtml((capacity.requiredUnitIds || []).join(','))}">
        <header><div><small>STARTING FORCE & STRUCTURES</small><h4>Sized Deployment Slots</h4></div><strong data-slot-usage>${slotUsage} / ${capacity.slots}</strong></header>
        <p>Large units and structures consume more capacity. These selections seed the planetary RTS match.</p>
        <div class="uga-manifest-picker" data-deployment-section="unit_staging">
          ${allowedUnits.map(item => {
            const initial = unitCounts.get(item.id) || 0;
            return `<label><span>${escapeHtml(item.name)}<small>${item.slotCost} SLOT${item.slotCost === 1 ? '' : 'S'} // ${escapeHtml(prettyToken(item.role))}</small></span><select data-deploy-unit="${escapeHtml(item.id)}" data-slot-cost="${item.slotCost}">${[0, 1, 2, 3, 4].map(count => `<option value="${count}" ${count === initial ? 'selected' : ''}>${count}</option>`).join('')}</select></label>`;
          }).join('')}
        </div><div class="uga-manifest-picker" data-deployment-section="structure_cargo">
          ${allowedStructures.map(item => {
            const initial = structureCounts.get(item.id) || 0;
            return `<label><span>${escapeHtml(item.name)}<small>${item.slotCost} SLOT${item.slotCost === 1 ? '' : 'S'} // STRUCTURE</small></span><select data-deploy-structure="${escapeHtml(item.id)}" data-slot-cost="${item.slotCost}">${[0, 1, 2].map(count => `<option value="${count}" ${count === initial ? 'selected' : ''}>${count}</option>`).join('')}</select></label>`;
          }).join('')}
        </div>
        <fieldset class="uga-mod-picker" data-deployment-section="support_service"><legend>Operation Mods // max ${capacity.modLimit}</legend>${allowedMods.map(item => `<label class="uga-mod-control"><input type="checkbox" data-deploy-mod="${escapeHtml(item.id)}" ${selectedModIds.has(item.id) ? 'checked' : ''}><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.effect || '')}</small></span></label>`).join('')}</fieldset>
        <div class="uga-slot-warning" data-deployment-blocker ${canCommit ? 'hidden' : ''}>${icon('warning')}<span>${escapeHtml(blockerMessage)}</span></div>
      </section>
      <label data-deployment-section="base_deployer"><span>HQ Ship Landing Zone</span><select data-deploy="landingZone">${landingZones.map(id => `<option value="${escapeHtml(id)}" ${id === draft.landingZoneId ? 'selected' : ''}>${escapeHtml(prettyToken(id))}</option>`).join('')}</select></label>
      <label data-deployment-section="support_service"><span>Support Package</span><select data-deploy="support">${support.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.supportId ? 'selected' : ''}>${escapeHtml(item.name || prettyToken(item.id))}</option>`).join('')}</select></label>
      <label><span>Doctrine</span><select data-deploy="doctrine">${doctrines.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === draft.doctrineId ? 'selected' : ''}>${escapeHtml(item.name || prettyToken(item.id))}</option>`).join('')}</select></label>
      </div>
      <div class="uga-deployment-readiness${canCommit ? ' is-ready' : ' is-blocked'}" data-deployment-confirm-state="${canCommit ? 'ready' : 'blocked'}">
        <span><small data-readiness-message>${canCommit ? 'READY FOR LANDING' : escapeHtml(blockerMessage)}</small><b data-slot-usage-summary>${slotUsage} / ${capacity.slots} SLOTS</b></span>
        <button type="button" class="uga-primary-button" data-action="deploy" ${canCommit ? '' : 'disabled'}>${canCommit ? 'CONFIRM & DEPLOY' : 'LOADOUT BLOCKED'}${icon('chevron')}</button>
      </div>
    </section>`;
  }

  function researchPanel() {
    const catalog = getCatalog();
    const state = getState();
    if (state.ship?.districts?.research?.commissioned === false) return `<div class="uga-context-scroll"><div class="uga-section-title"><h2>Research Directorate Offline</h2><p>Commission its Tier-1 core before assigning research points.</p></div>${commandVisual('research', 'Dark NEXUS-VII research directorate awaiting commissioning')}<button type="button" class="uga-primary-button" data-action="open-research-construction">OPEN RESEARCH CONSTRUCTION</button></div>`;
    const research = asArray(catalog.research || catalog.RESEARCH_CATALOG);
    const fallback = [
      { id: 'uga_brood_containment', branch: 'UGA', name: 'Brood Containment', cost: 180 },
      { id: 'universal_spectral_cartography', branch: 'Universal', name: 'Deep Survey Sensors', cost: 120 },
      { id: 'nova_pathfinder_doctrine', branch: 'Nova', name: 'Proxy Doctrine Uplink', cost: 140 }
    ];
    const entries = research.length ? research : fallback;
    const capabilities = calculateFacilityCapabilities(state);
    return `<div class="uga-context-scroll">
      <div class="uga-section-title"><small>SHARED RESEARCH BANK</small><h2>Research Allocation</h2><p>Commit points manually. UGA, universal, and faction programs never spend automatically.</p></div>
      ${commandVisual('research', 'Active NEXUS-VII research directorate and holographic planetary model')}
      <div class="uga-research-bank">${icon('research')}<span>AVAILABLE RESEARCH POINTS</span><b>${formatValue(state.resources?.researchPoints ?? state.resources?.research ?? state.resources?.science)}</b></div>
      <div class="uga-record-list">${entries.map(node => {
        const progress = state.research?.progressById?.[node.id] ?? state.research?.allocations?.[node.id] ?? node.progress ?? 0;
        const cost = node.cost?.researchPoints || node.cost || node.points || 100;
        const baseBioCost = Number(node.bioSampleCost) || 0;
        const completed = state.research?.completedIds?.includes(node.id) || Number(progress) >= Number(cost);
        const prerequisites = (node.prerequisites || []).map(id => entries.find(entry => entry.id === id)?.name || prettyToken(id));
        const effects = (node.effects || []).map(prettyToken);
        const containmentReady = !node.advancedContainment || Boolean(capabilities.advancedContainment);
        const bioCost = baseBioCost ? Math.max(1, Math.floor(baseBioCost * (100 + (capabilities.bioResearchCostPct || 0)) / 100)) : 0;
        const amount = Math.max(1, Math.min(10, Math.floor(Number(state.resources?.researchPoints) || 0)));
        // The domain command returns a new state without mutating its input.
        // The integrated UI receives a display projection (including discovery
        // rows), so its preview must use the host's authoritative domain state.
        let quote = null, blockedReason = '';
        if (!completed) {
          try { quote = typeof options.getResearchQuote === 'function'
            ? options.getResearchQuote(node.id, amount)
            : commitResearch(state, node.id, amount); }
          catch (error) {
            blockedReason = error.issues?.map(issue => issue.message || issue.code).filter(Boolean).join(' · ') || error.message;
          }
        }
        const available = Boolean(quote);
        const scope = node.branch === 'universal' ? 'GALACTIC + CLASSIC PROFILE' : node.branch === 'uga' ? 'GALACTIC CAMPAIGN' : 'FACTION PROFILE + GALACTIC';
        const requirement = blockedReason || (!containmentReady ? 'Containment Institute required' : prerequisites.length ? prerequisites.join(' · ') : 'No prerequisite');
        return `<article class="uga-research-card${available ? '' : ' is-locked'}"><span>${escapeHtml(node.branch || node.category || 'Universal')} // ${scope}</span><h3>${escapeHtml(node.name || prettyToken(node.id))}</h3><p>${escapeHtml(node.description || effects.join(' · ') || 'Research capability.')}</p><dl><div><dt>REQUIRES</dt><dd>${escapeHtml(requirement)}</dd></div><div><dt>UNLOCKS</dt><dd>${escapeHtml(effects.length ? effects.join(' · ') : 'Program capability')}${bioCost ? ` · ${formatValue(bioCost)} bio-sample completion cost` : ''}</dd></div></dl><div class="uga-progress"><i style="--value:${Math.min(100, Number(progress) / Math.max(1, Number(cost)) * 100)}%"></i><b>${formatValue(progress)} / ${formatValue(cost)}</b></div><button type="button" class="uga-mini-button" data-research="${escapeHtml(node.id)}" data-research-amount="${amount}" ${completed || !available ? 'disabled' : ''}>${completed ? 'COMPLETE' : available ? `COMMIT ${quote.committed}` : 'REQUIREMENTS NOT MET'}</button></article>`;
      }).join('')}</div>
    </div>`;
  }

  function intelPanel() {
    const catalog = getCatalog();
    const state = getState();
    const discoveryCatalog = catalog.discoveries || catalog.DISCOVERY_CATALOG || {};
    const discoveries = Array.isArray(state.discoveries?.foundIds)
      ? state.discoveries.foundIds.map(id => discoveryCatalog[id] || { id }).filter(Boolean)
      : asArray(state.discoveries || state.intelligence || state.surveys);
    return `<div class="uga-context-scroll"><div class="uga-section-title"><small>EXPEDITION INTELLIGENCE</small><h2>Intel Archive</h2><p>Persistent survey discoveries, threat assessments, and system-state evidence.</p></div>${commandVisual('survey', 'NEXUS-VII sealed survey laboratory and expedition intelligence archive')}<div class="uga-record-list">${discoveries.length ? discoveries.map(item => `<article class="uga-intel-card"><span>${icon('intel')}</span><div><small>${escapeHtml(item.systemName || item.systemId || 'EXPEDITION RECORD')}</small><h3>${escapeHtml(item.name || item.title || prettyToken(item.id))}</h3><p>${escapeHtml(item.description || item.summary || '')}</p></div></article>`).join('') : '<div class="uga-empty-state">No archived discoveries. Launch probes from planetary orbit to establish records.</div>'}</div></div>`;
  }

  function moduleManifest() {
    const state = getState();
    const moduleCatalog = getCatalog().modules || getCatalog().MODULE_CATALOG || {};
    const installedModules = Object.entries(state.ship?.districts || {}).flatMap(([districtId, district]) =>
      Object.entries(district.modules || {}).filter(([, moduleId]) => moduleId).map(([, moduleId]) => ({
        ...(moduleCatalog[moduleId] || { id: moduleId }), status: `INSTALLED // ${prettyToken(districtId)}`, quantity: 1
      }))
    );
    return asArray(state.inventory?.modules || state.modules || installedModules);
  }

  function manifestRows(modules) {
    return modules.length ? modules.map(item => `<div class="uga-manifest-row"><span>${icon('component')}</span><div><b>${escapeHtml(item.name || prettyToken(item.id))}</b><small>${escapeHtml(item.status || item.type || 'AVAILABLE')}</small></div><strong>${formatValue(item.quantity || 1)}</strong></div>`).join('') : '<div class="uga-empty-state">No authored ship modules are present in the local campaign manifest.</div>';
  }

  function logisticsPanel() {
    const state = getState();
    const quote = typeof options.getRefuelQuote === 'function' ? options.getRefuelQuote() : null;
    const probeQuote = typeof options.getProbeResupplyQuote === 'function' ? options.getProbeResupplyQuote() : null;
    const refuel = quote ? `<section class="uga-panel-section"><header><span>SHIP REFUEL</span><small>${quote.targetFuel} TARGET</small></header>
      <p>${quote.emergencyActive ? 'Emergency fuel is aboard. Jumps recover crew and can finish essential commissioning, but pause other construction until the 600-credit service is cleared.' : 'Top up fuel for the next deployment or route.'}</p>
      <button type="button" class="uga-primary-button" data-action="refuel" ${quote.available ? '' : 'disabled'}>${quote.available
        ? quote.mode === 'paid'
          ? quote.amount
            ? `REFUEL +${quote.amount} · ${formatValue(quote.creditsCost)} CREDITS${quote.clearanceCost ? ' INCLUDING SERVICE' : ''}`
            : `CLEAR EMERGENCY SERVICE · ${formatValue(quote.creditsCost)} CREDITS`
          : `EMERGENCY REFUEL +${quote.amount} · NO CREDITS`
        : quote.emergencyActive ? `NEED ${formatValue(quote.clearanceCost)} CREDITS TO CLEAR SERVICE` : 'FUEL RESERVE FULL'}</button>
      ${quote.mode === 'emergency' && quote.available ? '<small>Emergency fuel has no upfront charge; a 600-credit service clearance restores normal travel construction later. Missions and surveys still progress.</small>' : ''}
    </section>` : '';
    const resupply = probeQuote ? `<section class="uga-panel-section"><header><span>SURVEY PROBE RESUPPLY</span><small>${probeQuote.targetProbes} TARGET</small></header>
      <p>${Number(state.resources?.probes) === 0 ? 'Critical campaign signals have one emergency telemetry launch each. Deposits and Survey Drone support still require stocked probes.' : 'Replenish probes for mineral extraction, mission support, and further surveys.'}</p>
      <button type="button" class="uga-primary-button" data-action="probe-resupply" ${probeQuote.available && probeQuote.canPay ? '' : 'disabled'}>${probeQuote.available
        ? probeQuote.canPay ? `RESUPPLY +${probeQuote.amount} · ${formatValue(probeQuote.creditsCost)} CREDITS` : 'RESUPPLY BLOCKED · KEEP CORE RESERVE'
        : 'PROBE STOCK READY'}</button>
    </section>` : '';
    return `<div class="uga-context-scroll"><div class="uga-section-title"><small>UGA EXPEDITION SUPPLY</small><h2>Stores & Manifest</h2><p>Manage Galactic fuel, probes, materials, and ship modules here. Classic Development crafting is a separate battle system.</p></div>${commandVisual('logistics', 'NEXUS-VII sealed logistics and cargo control deck')}<div class="uga-logistics-grid">${Object.entries(RESOURCE_META).map(([key, [label, iconName]]) => `<article>${icon(iconName)}<span>${escapeHtml(label)}</span><b>${formatValue(state.resources?.[key] ?? state.economy?.[key])}</b></article>`).join('')}</div>${refuel}${resupply}<section class="uga-panel-section"><header><span>INSTALLED & STORED MODULES</span><small>01</small></header>${manifestRows(moduleManifest())}</section></div>`;
  }

  function returnServicesPanel() {
    return `<div class="uga-context-scroll uga-return-services" data-return-services>
      <div class="uga-section-title"><small>EXPEDITION COMPLETE // BACK ABOARD</small><h2>Your next command</h2><p>Result saved. Upgrade NEXUS-VII or choose the next expedition. Classic gear and crafting stay in Classic battles.</p></div>
      ${commandVisual('concourse', 'NEXUS-VII sealed command concourse ready for the next assignment')}
      <button type="button" class="uga-primary-button" data-district="engineering">UPGRADE SHIP · ENGINEERING</button>
      <button type="button" class="uga-primary-button" data-nav="missions">NEXT EXPEDITION OBJECTIVE</button>
    </div>`;
  }

  function inventoryPanel(visualKind = 'logistics') {
    const visualLabel = visualKind === 'arsenal' ? 'NEXUS-VII sealed fabrication and armory systems deck' : 'NEXUS-VII sealed cargo manifest and inventory scanning deck';
    return `<div class="uga-context-scroll"><div class="uga-section-title"><small>UGA // READ-ONLY SHIP MANIFEST</small><h2>Ship Inventory</h2><p>This lists ship modules; it is not a gear-equipping screen. Classic Armory equipment slots do not carry into Galactic deployments.</p></div>${commandVisual(visualKind, visualLabel)}<section class="uga-panel-section"><header><span>EXPEDITION MODULE MANIFEST</span><small>${String(moduleManifest().length).padStart(2, '0')}</small></header>${manifestRows(moduleManifest())}</section></div>`;
  }

  function crewPanel() {
    const state = getState();
    const catalog = getCatalog();
    const commanders = asArray(catalog.commanders || catalog.COMMANDER_CATALOG || state.personnel?.commanders);
    const specialists = asArray(catalog.specialists || catalog.SPECIALIST_CATALOG || state.personnel?.specialists);
    const roster = [...commanders.map(item => ({ ...item, kind: 'commanders' })), ...specialists.map(item => ({ ...item, kind: 'specialists' }))];
    return `<div class="uga-context-scroll"><div class="uga-section-title"><small>LOCAL PREVIEW // ACCOUNT HOST NOT CONNECTED</small><h2>Crew & Profile</h2><p>Read-only local commander and specialist readiness. This is not the Embassy and it does not claim account-profile synchronization.</p></div>${commandVisual('habitat', 'NEXUS-VII sealed habitat and medical personnel readiness deck')}<div class="uga-crew-summary"><article><span>COMMANDERS</span><b>${formatValue(commanders.length)}</b></article><article><span>SPECIALISTS</span><b>${formatValue(specialists.length)}</b></article></div><section class="uga-panel-section"><header><span>LOCAL PERSONNEL ROSTER</span><small>01</small></header>${roster.length ? roster.map(person => { const progress = personnelState(state, person.kind, person.id); return `<div class="uga-manifest-row"><span>${icon('staff')}</span><div><b>${escapeHtml(person.name || prettyToken(person.id))}</b><small>${escapeHtml(prettyToken(person.role || person.kind))} // ${escapeHtml(prettyToken(progress.status || 'UNAVAILABLE'))}</small></div><strong>${escapeHtml(prettyToken(person.factionId || 'UGA'))}</strong></div>`; }).join('') : '<div class="uga-empty-state">No local personnel catalog is available.</div>'}</section></div>`;
  }

  function hubStatusLabel(status) {
    if (status === CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED) return 'AVAILABLE';
    if (status === CAMPAIGN_HUB_ROUTE_STATUS.LOCAL_PREVIEW) return 'VIEW ONLY';
    if (status === CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE) return hostRoutesAvailable() ? 'AVAILABLE' : 'OPEN FROM MASSFRONT';
    return 'UNAVAILABLE';
  }

  function basicAccessPanel() {
    const modes = [
      ['standard', 'Standard'],
      ['training', 'Training'],
      ['campaign', 'Campaign']
    ];
    const warTableReady = hostRoutesAvailable();
    return `<section class="uga-basic-access" aria-label="Basic play access"><header><small>BASIC ACCESS</small></header><div class="uga-basic-access-grid">${modes.map(([id, label]) => {
      const entry = getCampaignHubRoute(id);
      const reachable = hubRouteReachable(entry);
      return `<button type="button" data-hub-route="${escapeHtml(id)}" ${reachable ? '' : 'disabled aria-disabled="true"'} aria-label="${escapeHtml(`${label}${reachable ? '' : ' unavailable'}`)}">${icon(entry?.icon || 'terminal')}<span>${escapeHtml(label)}</span>${icon(reachable ? 'chevron' : 'lock')}</button>`;
    }).join('')}<button type="button" data-host-route="war-room" ${warTableReady ? '' : 'disabled aria-disabled="true"'} aria-label="Classic War Table${warTableReady ? '' : ' unavailable'}">${icon('terminal')}<span>Classic War Table</span>${icon(warTableReady ? 'chevron' : 'lock')}</button></div></section>`;
  }

  /* The single question the strategic home has to answer: what do I do next.
     It previously answered nothing — the hub was a title, a depart button and
     four classic-mode doors, and the deterministic next action existed only on
     the survey result card, which the player cannot reach until they have
     already guessed to depart and scan. This walks the real career state and
     returns the first unmet step, so the answer is derived, never authored.

     Every action reuses a handler that already exists — data-host-route,
     data-mission and data-action="exit" — so this block adds direction without
     adding a new control surface to keep working. */
  /* Control is derived from settled operation history, so it is cheap but not
     free; the hub re-renders often, so compute it once per render pass. */
  let groundControlCache = null;
  let groundControlCacheRevision = -1;
  function groundControl() {
    const state = getState();
    const revision = Number(state?.revision);
    if (groundControlCache && groundControlCacheRevision === revision) return groundControlCache;
    groundControlCache = deriveGroundControl(state);
    groundControlCacheRevision = revision;
    return groundControlCache;
  }

  /* ONE JOURNEY, ONE SET OF NUMBERS.
     career-faction-gate.js numbered onboarding 01 WORLD LINK / 02 orientation /
     03 COMMISSION / 04 UGA SPACE while this hub separately called commissioning
     "STEP 1". COMMISSION therefore carried two different numbers depending on
     which screen the player was looking at, and the hub's own numbering ran
     1 COMMISSION / 2 SURVEY / 3 GROUND while its code could hand out STEP 3
     before STEP 2 was ever current. One list fixes both. Arriving in UGA space
     is not a step here because it is not an action the player performs.

     04 and 05 are a cycle, not a finish line: survey reveals an operation,
     ground resolves it, and the front moves. `loops` marks that pair so the rail
     can say so instead of pretending the journey ends. */
  const COMMAND_JOURNEY = [
    { key: 'world-link', no: '01', name: 'WORLD LINK' },
    { key: 'orientation', no: '02', name: 'ORIENTATION' },
    { key: 'commission', no: '03', name: 'COMMISSION' },
    { key: 'survey', no: '04', name: 'SURVEY', loops: true },
    { key: 'ground', no: '05', name: 'GROUND', loops: true }
  ];
  /* KEEL is live canon from career-faction-gate.js: a neutral UGA guide who
     commissions a choice and transfers authority. The lore bible's canon locks
     forbid wording that implies UGA sovereignty, ownership of member worlds, or
     command over a member military, so KEEL coordinates and records here - it
     never orders, owns, or claims. */
  const KEEL_DIRECTIVE = {
    'world-link': 'Channel open. You are reading UGA traffic.',
    orientation: 'Orientation logged. The theatre is yours to read.',
    commission: 'I commission your choice and transfer command authority to your career. I do not choose for you.',
    survey: 'Survey is how a front becomes legible. I coordinate the sweep; your fleet answers to you.',
    ground: 'The operation is yours to run. The Authority records the outcome. It does not claim the ground.'
  };
  const OBJECTIVE_STEP_KEY = { commission: 'commission', scan: 'survey', deploy: 'ground' };

  /* The rail needs every step and where the player stands in it, which the
     single-objective early-return below cannot express on its own. */
  function commandJourney(objective) {
    if (objective?.step === 'complete') return COMMAND_JOURNEY.map(step => ({ ...step, status: 'done', directive: '' }));
    const currentKey = OBJECTIVE_STEP_KEY[objective && objective.step] || 'survey';
    const currentIndex = COMMAND_JOURNEY.findIndex(step => step.key === currentKey);
    const cycled = currentKey === 'survey' && objective && objective.control
      && Object.values(objective.control.areas || {}).some(area => (area.clearedMapIds || []).length > 0);
    return COMMAND_JOURNEY.map((step, index) => {
      /* A player back on SURVEY who has already taken ground has completed the
         cycle once. Showing GROUND as "ahead" there would deny work they did. */
      const status = index === currentIndex ? 'current'
        : index < currentIndex ? 'done'
        : (cycled && step.key === 'ground') ? 'done'
        : 'ahead';
      return Object.assign({}, step, { status, directive: KEEL_DIRECTIVE[step.key] || '' });
    });
  }

  function journeyRailMarkup(objective) {
    const steps = commandJourney(objective);
    const items = steps.map((step, index) => `<li class="uga-journey-step is-${step.status}" style="--uga-journey-index:${index}"${step.status === 'current' ? ' aria-current="step"' : ''}>
        <b>${escapeHtml(step.no)}</b><span>${escapeHtml(step.name)}</span>
      </li>`).join('');
    return `<div class="uga-journey" role="group" aria-label="Command journey">
      <ol class="uga-journey-rail">${items}</ol>
    </div>`;
  }

  function commandObjective() {
    const state = getState();
    const catalog = getCatalog();

    if (!state.commissioning?.completed) {
      return {
        step: 'commission', eyebrow: '03 // COMMISSION',
        title: 'Hire your first commander',
        detail: 'Choose a faction and hire a commander. No ground operation can be prepared until a commander is on the roster.',
        label: 'HIRE COMMANDER',
        attrs: `data-host-route="new-career-faction" ${hostRoutesAvailable() ? '' : 'disabled'}`
      };
    }

    const missions = asArray(catalog.missions || catalog.MISSION_CATALOG || state.availableMissions || state.missions)
      .filter(item => item && item.id);
    const control = groundControl();
    const unfinished = missions.filter(mission => missionUnfinished(mission, state, control));
    const ready = unfinished.find(mission => missionLocks(mission, state).length === 0);

    if (ready) {
      const region = Object.values(control.areas).find(area => area.missionId === ready.id);
      const remaining = region ? region.totalMaps - region.clearedMapIds.length : 0;
      return {
        step: 'deploy', eyebrow: '05 // GROUND OPERATION',
        title: `Prepare ${ready.name || ready.title || prettyToken(ready.id)}`,
        detail: region
          ? `${region.areaName} on ${region.planetName}. ${region.clearedMapIds.length} of ${region.totalMaps} maps cleared — take ${remaining === 1 ? 'the last one' : `${remaining} more`} and the region falls under your control.`
          : 'Select a battlefield, an eligible commander of your faction and a deployment package, then drop into the live RTS.',
        label: 'PREPARE DEPLOYMENT',
        attrs: `data-mission="${escapeHtml(ready.id)}"`,
        control
      };
    }

    // A found region can be blocked by ship commissioning or research; another
    // scan cannot fix those prerequisites and may waste the player's last probe.
    const foundIds = new Set(Array.isArray(state.discoveries)
      ? state.discoveries.map(item => item.id)
      : state.discoveries?.foundIds || []);
    const known = unfinished.find(mission => {
      const required = mission.requirements?.discoveryIds || [];
      return required.length && required.every(id => foundIds.has(id))
        && (mission.access?.type !== 'faction_exclusive' || state.factions?.[mission.access.factionId]?.resident);
    });
    if (known) {
      const locks = planningEligibility(known, state)?.locks || [];
      const name = known.name || known.title || prettyToken(known.id);
      const core = locks.some(lock => lock.code === 'MISSION_OPS_NOT_COMMISSIONED') ? 'mission_ops'
        : locks.some(lock => lock.code === 'HANGAR_NOT_COMMISSIONED') ? 'hangar' : null;
      if (core) return {
        step: 'deploy', eyebrow: '05 // PREPARE GROUND',
        title: `Prepare ${name}`,
        detail: `${name} is discovered. Commission ${core === 'mission_ops' ? 'Mission Operations' : 'Strike Bay'} before planning the deployment.`,
        label: `OPEN ${core === 'mission_ops' ? 'MISSION OPS' : 'STRIKE BAY'} CONSTRUCTION`,
        attrs: `data-objective-construction="${core}"`, control
      };
      const research = locks.find(lock => lock.code === 'RESEARCH_REQUIRED');
      return {
        step: 'deploy', eyebrow: '05 // PREPARE GROUND',
        title: `Prepare ${name}`,
        detail: research ? `${name} is discovered. ${research.message}`
          : `${name} is discovered. ${locks[0]?.message || 'Review its deployment requirements.'}`,
        label: research ? 'OPEN RESEARCH DIRECTORATE' : 'REVIEW MISSION REQUIREMENTS',
        attrs: research ? 'data-district="research"' : 'data-district="mission_ops"', control
      };
    }

    /* An authored signal is one-shot. Once all discovered signals are depleted,
       directing the player to scan again promises content that cannot appear. */
    const blocked = unfinished;
    const authoredSurveys = asArray(catalog.surveys || catalog.SURVEY_CATALOG);
    const remainingSignals = authoredSurveys.filter(survey =>
      state.world?.systems?.[survey.systemId]?.discovered && !state.surveys?.[survey.id]?.depleted);
    if (authoredSurveys.length && !remainingSignals.length) return blocked.length ? {
      step: 'deploy', eyebrow: '05 // OPERATIONS NEED ATTENTION',
      title: 'Review known operation locks',
      detail: 'All discovered survey signals are archived. Review sponsor, research, and ship requirements; another scan cannot reveal an authored region here.',
      label: 'VIEW PROGRESS', attrs: 'data-hub-route="progress"', control
    } : {
      step: 'complete', eyebrow: 'CURRENT FRONTIER CLEAR',
      title: 'All authored signals are complete',
      detail: 'There are no new survey signals or unresolved operations in the current expedition. Review your progress or return to Classic battles.',
      label: 'VIEW PROGRESS', attrs: 'data-hub-route="progress"', control
    };
    return {
      step: 'scan', eyebrow: blocked.length ? '04 // SURVEY' : '04 // FRONTIER CLEAR',
      title: blocked.length ? 'Depart and scan for an objective' : 'Scan for the next frontier',
      detail: state.resources?.probes === 0
        ? 'No probes are stocked. Critical campaign signals can use an emergency telemetry launch; deposits and Survey Drone support still require Stores resupply.'
        : blocked.length
          ? 'Fly to a planet and run a survey. A successful scan reveals resources, a mission-bearing region, or both.'
          : 'Every reachable operation is resolved. Survey further out to open the next region.',
      label: 'DEPART AND SURVEY',
      attrs: 'data-action="exit"',
      control
    };
  }

  function commandObjectivePanel(objective = commandObjective(), embedded = false) {
    /* Territory is the progress that matters — "operations cleared" counted
       paperwork, this counts ground held. Maps are shown alongside regions so a
       player mid-region sees movement instead of a stuck 0. */
    const summary = objective.control ? groundControlSummary(getState()) : null;
    const progress = summary
      ? `<div class="uga-objective-progress">
          <span>REGIONS HELD</span><b>${summary.areasControlled} / ${summary.areasTotal}</b>
          <span>MAPS CLEARED</span><b>${summary.mapsCleared} / ${summary.mapsTotal}</b>
        </div>`
      : '';
    /* The full hub already has Depart below this card. Inside the Command room,
       that control would land below the phone fold, so the survey action lives
       in the card instead. Only one copy of that action is rendered per view. */
    const action = objective.step === 'scan' && !embedded ? ''
      : `<button type="button" class="uga-primary-button uga-attention" ${objective.attrs}>${escapeHtml(objective.label)}</button>`;
    const art = objective.step === 'commission' ? 'embassy'
      : objective.step === 'scan' ? 'survey'
      : objective.step === 'deploy' ? 'hangar' : 'navigation';
    const directive = commandJourney(objective).find(step => step.status === 'current')?.directive;
    return `<section class="uga-objective is-${escapeHtml(objective.step)}" data-objective="${escapeHtml(objective.step)}" aria-labelledby="ugaObjectiveTitle">
      <div class="uga-objective-hero is-${art}">
        <span class="uga-objective-art" role="img" aria-label="${escapeHtml(art === 'embassy' ? 'Coalition command chamber' : art === 'survey' ? 'Survey laboratory' : art === 'hangar' ? 'Strike hangar' : 'Navigation bridge')}"></span>
        <div class="uga-objective-hero-copy"><small>${escapeHtml(objective.eyebrow)}</small><h3 id="ugaObjectiveTitle">${escapeHtml(objective.title)}</h3></div>
      </div>
      ${embedded ? action : ''}
      ${journeyRailMarkup(objective)}
      ${progress}
      ${embedded ? '' : action}
      <details class="uga-objective-brief"><summary>MISSION BRIEF</summary><p>${escapeHtml(objective.detail)}</p>${directive ? `<p><b>KEEL</b> ${escapeHtml(directive)}</p>` : ''}</details>
    </section>`;
  }

  function campaignHubPanel(embedded = false) {
    /* ONE THING IS ASKING FOR YOU. The full hub keeps its Depart below the
       directive; the embedded room puts the same survey action in the card,
       where it is reachable before the journey and briefing. */
    const objective = commandObjective();
    const departAttention = objective.step === 'scan' ? ' uga-attention' : '';
    return `<div class="${embedded ? 'uga-campaign-hub is-room-embedded' : 'uga-context-scroll uga-campaign-hub'}">${embedded ? '' : '<div class="uga-section-title"><small>GALACTIC EXPEDITION // UGA COMMAND</small><h2>Galactic Command</h2><p>Explore the expanding galaxy and deploy RTS operations. Classic Standard remains the direct War Table battle route.</p></div>'}
      ${commandObjectivePanel(objective, embedded)}
      ${embedded && objective.step === 'scan' ? '' : `<button type="button" class="uga-campaign-depart${departAttention}" data-action="exit">${icon('chevron')}<span><small>EXPLORE THE FRONTIER</small><b>DEPART / RETURN TO ORBIT</b></span></button>`}
      ${commandFrontPanel()}
      ${commandQuickPanel()}
      ${basicAccessPanel()}</div>`;
  }

  /* Grouped, not listed. Each shelf is a .uga-panel-section, which is the same
     element the rooms use, so it inherits the authored plate and the fold
     affordance without a second implementation of either - and a player who
     folds MASSFRONT SERVICES away keeps it folded, because folding is part of
     rendering now. The count sits in the header where the rooms put their
     sequence number, so a shelf says how much is behind it before you open it. */
  function campaignServicesPanel() {
    const shelves = CAMPAIGN_HUB_SERVICE_GROUPS.map(group => {
      const entries = group.routeIds.map(getCampaignHubRoute).filter(Boolean);
      if (!entries.length) return '';
      return `<section class="uga-panel-section uga-service-shelf" data-service-group="${escapeHtml(group.id)}">
        <header><span>${escapeHtml(group.label)}</span><small>${String(entries.length).padStart(2, '0')}</small></header>
        <p class="uga-service-shelf-detail">${escapeHtml(group.detail)}</p>
        <div class="uga-hub-route-list">${entries.map(entry => {
          const reachable = hubRouteReachable(entry);
          return `<article class="uga-hub-route is-${entry.status}${activeHubRouteId === entry.id ? ' is-selected' : ''}">
            <span class="uga-hub-route-icon">${icon(entry.icon)}</span>
            <div class="uga-hub-route-copy"><div><h3>${escapeHtml(entry.label)}</h3><span>${escapeHtml(hubStatusLabel(entry.status))}</span></div><p>${escapeHtml(entry.description)}</p><small>${escapeHtml(entry.detail)}</small></div>
            <button type="button" data-hub-route="${escapeHtml(entry.id)}" ${reachable ? '' : 'disabled'}>${reachable ? 'OPEN' : 'UNAVAILABLE'}</button>
          </article>`;
        }).join('')}</div>
      </section>`;
    }).join('');
    return `<div class="uga-context-scroll uga-campaign-services"><div class="uga-section-title"><small>MORE</small><h2>Services</h2><p>Every destination, shelved by where it happens. Tap a heading to fold it away.</p></div>
      ${commandVisual('concourse', 'NEXUS-VII sealed command concourse and department access corridor')}
      ${moreNavigationShortcuts()}
      ${shelves}</div>`;
  }

  function renderContext() {
    if (activeView === 'return-services') return returnServicesPanel();
    if (activeView === 'campaign_hub') return campaignHubPanel();
    if (activeView === 'services') return campaignServicesPanel();
    if (activeView === 'progress') return progressPanel();
    if (activeView === 'construction') return constructionPanel();
    if (activeView === 'factions') return factionPanel();
    if (activeView === 'contracts') return contractsPanel();
    if (activeView === 'deployment') return deploymentViewPanel();
    if (activeView === 'research') return researchPanel();
    if (activeView === 'intel') return intelPanel();
    if (activeView === 'inventory') return inventoryPanel();
    if (activeView === 'crew') return crewPanel();
    if (activeView === 'logistics') return logisticsPanel();
    // The Campaign Hub is the only player-facing Play authority. Keep the
    // legacy terminal implementation as a compatibility helper, but never
    // render a second mode picker inside Ship or through an old view token.
    if (activeView === 'classic') return campaignHubPanel();
    return districtPanel();
  }

  function quickActions() {
    const active = entry => (entry.id === 'construction' && activeView === 'construction') ||
      (entry.id === 'research' && (activeView === 'research' || (activeView === 'command' && selectedDistrictId === 'research'))) ||
      (entry.id === 'armory' && activeView === 'command' && selectedDistrictId === 'fabricator') ||
      (entry.id === 'hub' && activeView === 'campaign_hub');
    return CAMPAIGN_HUB_QUICK_NAV.map(entry => `<button type="button" data-quick="${escapeHtml(entry.id)}" class="${active(entry) ? 'is-active' : ''}">${icon(entry.icon)}<span>${escapeHtml(entry.label)}</span></button>`).join('');
  }

  function navigation() {
    /* Exactly one dock lights, and Ship owns every compartment. Crew, Research
       and the rest are shortcuts into rooms now, the way the Research pill in
       quick access always was - being in a room is being on the ship, and the
       Crew dock is not even rendered at narrow widths, so letting it claim the
       Habitat would leave no dock lit at all there. The stale view tokens stay
       in the lists so an older saved route still highlights something while it
       resolves. */
    const active = id => (id === 'ship' && ['command', 'construction', 'return-services'].includes(activeView)) ||
      (id === 'missions' && ['progress', 'contracts', 'deployment'].includes(activeView)) ||
      (id === 'classic' && ['campaign_hub', 'classic'].includes(activeView)) ||
      (id === 'crew' && activeView === 'crew') ||
      (id === 'more' && ['services', 'factions', 'research', 'logistics', 'inventory'].includes(activeView));
    const entries = usesCompactRoomFocus()
      ? ['classic', 'ship', 'missions', 'social', 'more'].map(id => CAMPAIGN_HUB_PRIMARY_NAV.find(entry => entry.id === id)).filter(Boolean)
      : CAMPAIGN_HUB_PRIMARY_NAV;
    return entries.map(entry => `<button type="button" data-nav="${escapeHtml(entry.id)}" ${entry.id === 'classic' ? 'data-nav-primary="true" ' : ''}aria-label="${escapeHtml(entry.ariaLabel || entry.label)}" class="${active(entry.id) ? 'is-active' : ''}">${icon(entry.icon)}<span>${escapeHtml(entry.label)}</span></button>`).join('');
  }

  function moreNavigationShortcuts() {
    const ids = ['galaxy', 'crew', 'settings'];
    return `<nav class="uga-more-shortcuts" aria-label="More command destinations">${ids.map(id => {
      const entry = CAMPAIGN_HUB_PRIMARY_NAV.find(item => item.id === id);
      return entry ? `<button type="button" data-nav="${escapeHtml(entry.id)}" aria-label="${escapeHtml(entry.ariaLabel || entry.label)}">${icon(entry.icon)}<span>${escapeHtml(entry.label)}</span></button>` : '';
    }).join('')}</nav>`;
  }

  function openNavigationTarget(target, routeId = null) {
    if (!target) return false;
    if (target.kind === 'route') {
      const entry = getCampaignHubRoute(target.routeId);
      if (!entry || !hubRouteReachable(entry)) {
        activeHubRouteId = target.routeId || null;
        activeView = 'campaign_hub';
        sheetExpanded = true;
        render();
        return false;
      }
      return openNavigationTarget(entry.target, entry.id);
    }
    if (target.kind === 'hub') {
      activeHubRouteId = null;
      activeView = 'campaign_hub';
      sheetExpanded = true;
      render();
      // The strategic home shares the complete vessel as its spatial context.
      // Refit after rendering so the camera reserves the hub inspector's real
      // bounds instead of retaining a cropped room pose from the previous tab.
      call('onOverviewFocus');
      return true;
    }
    if (target.kind === 'host-action') {
      if (target.action === 'open-galaxy') call('onOpenGalaxy');
      return true;
    }
    if (target.kind === 'host-route') {
      if (!hostRoutesAvailable()) return false;
      call('onHostRoute', target.routeId);
      return true;
    }
    if (target.kind === 'district') {
      if (!DISTRICT_DEFAULTS[target.districtId]) return false;
      shipOverviewActive = false;
      activeHubRouteId = routeId;
      selectedDistrictId = target.districtId;
      selectedBuildPlotId = null;
      confirmationKey = null;
      selectedDeckFilter = normalizeDistrict(target.districtId, districtsCatalog(getCatalog())).deck;
      activeView = 'command';
      sheetExpanded = true;
      call('onDistrictFocus', target.districtId);
      render();
      return true;
    }
    if (target.kind === 'view') {
      shipOverviewActive = false;
      activeHubRouteId = routeId;
      activeView = target.view;
      if (activeView === 'command') {
        sheetExpanded = !usesCompactRoomFocus();
        call('onDistrictFocus', selectedDistrictId);
      } else {
        sheetExpanded = true;
      }
      render();
      if (activeView !== 'command') call('onOverviewFocus');
      return true;
    }
    return false;
  }

  function openCommandConstruction(intent) {
    const state = getState();
    const catalog = districtsCatalog(getCatalog());
    const candidates = DISTRICT_ORDER.filter(id => !normalizeDistrict(id, catalog).fixed);
    const targetId = candidates.find(id => {
      const district = districtTierState(state, id, normalizeDistrict(id, catalog));
      return intent === 'upgrade'
        ? district.commissioned !== false && district.tier < 3
        : district.commissioned === false || district.tier < 3;
    }) || 'engineering';
    const definition = normalizeDistrict(targetId, catalog);
    const district = districtTierState(state, targetId, definition);
    selectedDistrictId = targetId;
    selectedDeckFilter = definition.deck;
    activeHubRouteId = null;
    activeView = 'construction';
    sheetExpanded = true;
    confirmationKey = null;
    selectedBuildPlotId = district.commissioned === false ? 'tier1' : `tier${Math.min(3, district.tier + 1)}`;
    render();
    call('onDistrictFocus', targetId);
  }

  function activeViewLabel(definition) {
    if (['command', 'construction'].includes(activeView)) return definition.name;
    if (activeView === 'campaign_hub') return 'Campaign Hub';
    if (activeView === 'services') return 'Services';
    const routeEntry = activeHubRouteId ? getCampaignHubRoute(activeHubRouteId) : null;
    return routeEntry?.label || prettyToken(activeView);
  }

  function activateDeploymentStation(station, { emit = true } = {}) {
    if (!selectedMissionId || !['command_chassis', 'base_deployer', 'specialist_muster', 'unit_staging', 'structure_cargo', 'support_service'].includes(station)) return false;
    const planner = root.querySelector('.uga-deployment-planner');
    const current = planner ? readDeploymentPlanner(planner, station) : deploymentDrafts.get(selectedMissionId);
    if (!current) return false;
    current.station = station;
    deploymentDrafts.set(selectedMissionId, current);
    sheetExpanded = true;
    deploymentLoadoutExpanded = true;
    if (emit && !planner) call('onDeploymentPreview', current);
    render();
    requestAnimationFrame(() => {
      const nextPlanner = root.querySelector('.uga-deployment-planner');
      const section = nextPlanner?.querySelector(`[data-deployment-section="${CSS.escape(station)}"]`);
      section?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      section?.querySelector?.('select, input, button')?.focus?.({ preventScroll: true });
    });
    return true;
  }

  function openMissionDeployment(missionId, { emit = true } = {}) {
    const mission = asArray(getCatalog().missions || getCatalog().MISSION_CATALOG).find(item => item.id === missionId);
    if (!mission) return false;
    selectedMissionId = missionId;
    selectedDistrictId = 'hangar';
    selectedDeckFilter = 'C';
    activeView = 'deployment';
    sheetExpanded = true;
    deploymentLoadoutExpanded = usesCompactRoomFocus();
    call('onDistrictFocus', 'hangar');
    if (emit) call('onMissionSelect', selectedMissionId);
    render();
    queueMicrotask(() => readDeploymentPlanner(root.querySelector('.uga-deployment-planner')));
    return true;
  }

  function render() {
    if (destroyed) return;
    if (activeView !== 'command') shipOverviewActive = false;
    root.hidden = !visible;
    if (!visible) return;
    if (activeView === 'factions' || activeView === 'contracts' || activeView === 'deployment') primePersonnelPortraits();
    region('resources').innerHTML = resources();
    region('districts').innerHTML = districtRail();
    region('context').innerHTML = renderContext();
    region('quick-actions').innerHTML = quickActions();
    region('navigation').innerHTML = navigation();
    const def = normalizeDistrict(selectedDistrictId, districtsCatalog(getCatalog()));
    const viewLabel = activeViewLabel(def);
    region('scene-label').textContent = viewLabel;
    root.dataset.view = activeView;
    root.dataset.district = selectedDistrictId;
    /* A MENU WITH NO ROOM SHOULD NOT RESERVE ONE.

       Only three views are about a place on the ship: a compartment, its
       construction, and a deployment staging in the hangar. Services,
       Progress, Inventory and the post-operation debrief are directories -
       they were still laying out a room viewport, a district rail and a deck
       filter above themselves and then leaving roughly 500px of black where
       the room would have been. The strategic home already solved this by
       taking the full stage; this is the same treatment, named once so a new
       view gets it by default instead of having to remember to ask. */
    root.dataset.stage = ['command', 'construction', 'deployment'].includes(activeView) ? 'room' : 'full';
    root.dataset.activeHubRoute = activeHubRouteId || '';
    const deploymentMode = activeView === 'deployment' && Boolean(selectedMissionId) && Boolean(root.querySelector('.uga-deployment-planner'));
    root.dataset.mode = deploymentMode ? 'deployment' : 'management';
    root.dataset.deploymentMission = deploymentMode ? selectedMissionId : '';
    const groundPlanner = root.querySelector('.uga-deployment-planner[data-ground-route-stage]');
    if (deploymentMode && groundPlanner) {
      root.dataset.groundRouteStage = groundPlanner.dataset.groundRouteStage || '';
      root.dataset.selectedAreaId = groundPlanner.dataset.selectedAreaId || '';
      root.dataset.selectedMapId = groundPlanner.dataset.selectedMapId || '';
      root.dataset.selectedMapSize = groundPlanner.dataset.selectedMapSize || '';
    } else {
      delete root.dataset.groundRouteStage;
      delete root.dataset.selectedAreaId;
      delete root.dataset.selectedMapId;
      delete root.dataset.selectedMapSize;
    }
    root.classList.toggle('is-deployment-mode', deploymentMode);
    root.classList.toggle('is-loadout-expanded', deploymentMode && deploymentLoadoutExpanded);
    root.classList.toggle('is-sheet-expanded', sheetExpanded);
    const sheetToggle = root.querySelector('.uga-sheet-toggle');
    const deploymentToolbar = root.querySelector('[data-deployment-toolbar]');
    if (deploymentToolbar) deploymentToolbar.hidden = !deploymentMode;
    const deploymentContext = root.querySelector('[data-deployment-context]');
    if (deploymentContext) deploymentContext.hidden = !deploymentMode;
    const deploymentToggle = root.querySelector('[data-action="toggle-deployment-loadout"]');
    if (deploymentToggle) {
      deploymentToggle.setAttribute('aria-expanded', String(deploymentLoadoutExpanded));
      deploymentToggle.setAttribute('aria-label', deploymentLoadoutExpanded ? 'Collapse loadout and view hangar; keep all selections' : 'Edit deployment loadout');
      deploymentToggle.querySelector('span').textContent = deploymentLoadoutExpanded ? 'VIEW HANGAR' : 'EDIT LOADOUT';
    }
    /* The hub hides its own toggle because collapsing it would expose an
       unmounted scene. Restore this alongside the scene, not before it. */
    if (sheetToggle) sheetToggle.hidden = deploymentMode || activeView === 'campaign_hub';
    const commandExit = root.querySelector('.uga-command-exit');
    if (commandExit) commandExit.hidden = activeView === 'campaign_hub';
    if (sheetToggle) {
      sheetToggle.setAttribute('aria-expanded', String(sheetExpanded));
      sheetToggle.setAttribute('aria-label', `${sheetExpanded ? 'Collapse' : 'Expand'} ${root.dataset.stage === 'room' ? `${viewLabel} room controls` : 'management inspector'}`);
      const sheetLabel = sheetToggle.querySelector('b');
      if (sheetLabel) sheetLabel.textContent = sheetExpanded
        ? root.dataset.stage === 'room' ? `${viewLabel.toUpperCase()} · CONTROLS` : 'MANAGEMENT INSPECTOR'
        : shipOverviewActive ? 'SHIP OVERVIEW · TAP A ROOM' : `${viewLabel.toUpperCase()} · DETAILS`;
    }
    // Portrait probes can settle after the deployment route opens and cause a
    // fresh planner render. Re-publish the authoritative draft so those
    // asynchronous dossier updates cannot detach the 3D arena from the UI.
    if (deploymentMode) {
      const currentDraft = deploymentDrafts.get(selectedMissionId);
      if (currentDraft && typeof options.onDeploymentPreview === 'function') {
        try {
          options.onDeploymentPreview(currentDraft);
        } catch (error) {
          if (typeof options.onError === 'function') options.onError(error, { callback: 'onDeploymentPreview', args: [currentDraft] });
        }
      }
    }

    /* FOLDING IS PART OF RENDERING.

       Every section is rebuilt from markup on each render, so the fold
       affordance - role, tabindex, aria-expanded, is-collapsed - has to be
       re-applied with it. This used to run only after selectDistrict, which
       meant the headers announced themselves as buttons when you walked into
       a room and stopped being buttons the moment anything else re-rendered:
       a resource tick, a construction cycle, expanding the sheet. A player who
       folded SPECIALIST STATIONS away watched it silently unfold on the next
       state change, which is worse than never having offered to fold it. */
    applyCollapsedSections();
  }

  function selectDistrict(id, settings = {}) {
    if (!DISTRICT_DEFAULTS[id]) return api;
    shipOverviewActive = false;
    const emit = typeof settings === 'boolean' ? settings : settings.emit !== false;
    const keepConstructionOpen = activeView === 'construction';
    selectedDistrictId = id;
    activeHubRouteId = null;
    selectedBuildPlotId = null;
    confirmationKey = null;
    selectedDeckFilter = normalizeDistrict(id, districtsCatalog(getCatalog())).deck;
    activeView = keepConstructionOpen ? 'construction' : 'command';
    // Section selection is also a management action. The camera fits the
    // remaining room viewport, so hiding its controls behind a second tap
    // no longer buys visibility and makes the upgrade path undiscoverable.
    sheetExpanded = true;
    render();
    if (emit) call('onDistrictFocus', id);
    return api;
  }

  /* CATEGORIES THAT FOLD.
     The hub stacked every section open at once, so a district view was a wall
     of text boxes and the thing a player actually wanted was somewhere down a
     scroll. These sections already share one header shape with a number, so
     folding is a behaviour on the existing pattern rather than a new component.
     Collapsed state is per-section and remembered for the session: a player who
     folds SPECIALIST STATIONS away is telling us they are not working on that
     right now, and reopening the district should respect that. */
  /* Seeded, not empty. Shelving the operation board cut nothing on its own
     because both shelves opened by default - the measured density actually
     rose. What a player came to Mission Operations to do is take a contract;
     the archive of what they already did is reference, and reference starts
     folded. They are the only two surfaces that open closed, and reopening one
     is remembered for the session like any other fold. */
  /* More is a visual directory, not a seventeen-row report. Its three authored
     compartment shelves begin closed, show their category artwork, and reveal
     every existing route with one deliberate tap. */
  const collapsedSections = new Set([
    'DEBRIEF ARCHIVE', 'VISUAL UPGRADES & ARCHITECTURE',
    'ABOARD NEXUS-VII', 'MASSFRONT SERVICES', 'ACCOUNT & SETTINGS'
  ]);
  function sectionKey(section) {
    const label = section.querySelector('header span, header small');
    return label ? label.textContent.trim() : '';
  }
  function applyCollapsedSections() {
    for (const section of root.querySelectorAll('.uga-panel-section, .uga-basic-access')) {
      const header = section.querySelector('header');
      if (!header) continue;
      const key = sectionKey(section);
      const collapsed = collapsedSections.has(key);
      section.classList.toggle('is-collapsed', collapsed);
      header.setAttribute('role', 'button');
      header.setAttribute('tabindex', '0');
      header.setAttribute('aria-expanded', String(!collapsed));
      header.setAttribute('aria-label', `${key || 'Section'}, ${collapsed ? 'collapsed' : 'expanded'}`);
    }
  }
  root.addEventListener('toggle', event => {
    const details = event.target;
    if (!details?.matches?.('[data-hardware-district]')) return;
    if (details.open) hardwareExpandedDistricts.add(details.dataset.hardwareDistrict);
    else hardwareExpandedDistricts.delete(details.dataset.hardwareDistrict);
  }, true);
  root.addEventListener('click', event => {
    const sectionHeader = event.target.closest('.uga-panel-section > header, .uga-basic-access > header');
    if (sectionHeader && root.contains(sectionHeader) && !event.target.closest('button')) {
      const section = sectionHeader.parentElement;
      const key = sectionKey(section);
      if (collapsedSections.has(key)) collapsedSections.delete(key); else collapsedSections.add(key);
      applyCollapsedSections();
      if (typeof sfx === 'function') sfx('ui');
      return;
    }
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.hasAttribute('data-front-watch')) return void call('onDutyWatch');
    if (button.dataset.action === 'refuel') return void call('onRefuel');
    if (button.dataset.action === 'probe-resupply') return void call('onProbeResupply');
    if (button.dataset.deckFilter) {
      shipOverviewActive = false;
      activeHubRouteId = null;
      selectedDeckFilter = button.dataset.deckFilter;
      const nextDistrict = DISTRICT_ORDER.find(id => normalizeDistrict(id, districtsCatalog(getCatalog())).deck === selectedDeckFilter);
      if (nextDistrict) selectedDistrictId = nextDistrict;
      activeView = 'command';
      sheetExpanded = !usesCompactRoomFocus();
      render();
      if (nextDistrict) call('onDistrictFocus', nextDistrict);
      return;
    }
    if (button.dataset.objectiveConstruction) return void api.openConstructionPlot(button.dataset.objectiveConstruction, 'tier1');
    if (button.dataset.district) return void selectDistrict(button.dataset.district);
    if (button.dataset.deploymentStation) {
      activateDeploymentStation(button.dataset.deploymentStation);
      return;
    }
    if (button.dataset.action === 'deployment-back') {
      readDeploymentPlanner(root.querySelector('.uga-deployment-planner'));
      selectedMissionId = null;
      confirmationKey = null;
      activeView = 'contracts';
      sheetExpanded = true;
      call('onDeploymentPreview', null);
      render();
      return;
    }
    if (button.dataset.action === 'deployment-sections') {
      readDeploymentPlanner(root.querySelector('.uga-deployment-planner'));
      call('onDeploymentPreview', null);
      selectDistrict('hangar');
      return;
    }
    if (button.dataset.action === 'toggle-deployment-loadout') {
      // Keep one real planner and snapshot its controls before rendering. A
      // collapsed scene view is not a reset, separate preset, or confirmation.
      readDeploymentPlanner(root.querySelector('.uga-deployment-planner'));
      deploymentLoadoutExpanded = !deploymentLoadoutExpanded;
      render();
      return;
    }
    if (button.dataset.sessionRoute) {
      const sessionType = getCampaignHubSessionType(button.dataset.sessionRoute);
      activeHubRouteId = sessionType?.routeId || null;
      if (sessionType && hubSessionReachable(sessionType)) {
        openNavigationTarget({ kind: 'route', routeId: sessionType.routeId }, sessionType.routeId);
      } else {
        render();
      }
      return;
    }
    if (button.dataset.hubRoute) {
      const entry = getCampaignHubRoute(button.dataset.hubRoute);
      activeHubRouteId = entry?.id || null;
      if (entry && hubRouteReachable(entry)) openNavigationTarget(entry.target, entry.id);
      else render();
      return;
    }
    if (button.dataset.commandConstruction) {
      openCommandConstruction(button.dataset.commandConstruction);
      return;
    }
    if (button.dataset.hostRoute) {
      if (hostRoutesAvailable()) call('onHostRoute', button.dataset.hostRoute);
      return;
    }
    if (button.dataset.buildPlot) {
      selectedBuildPlotId = button.dataset.buildPlot;
      confirmationKey = null;
      render();
      return;
    }
    if (button.hasAttribute('data-build-commission')) {
      const key = `build:${selectedDistrictId}:commission`;
      if (confirmationKey !== key) {
        confirmationKey = key;
        render();
        return;
      }
      confirmationKey = null;
      return void call('onConstructionStart', selectedDistrictId, null);
    }
    if (button.hasAttribute('data-core-rescue')) {
      if (confirmationKey !== 'construction:core-rescue') {
        confirmationKey = 'construction:core-rescue';
        // Keep the confirmation under the player's finger. Re-rendering this
        // long inspector reset its scroll and hid the second-tap affordance.
        button.classList.add('is-confirming');
        button.textContent = 'CONFIRM REQUISITION';
        return;
      }
      confirmationKey = null;
      return void call('onCoreCommissionRescue');
    }
    if (button.dataset.buildFacility) {
      const key = `build:${selectedDistrictId}:${button.dataset.buildFacility}`;
      if (confirmationKey !== key) {
        confirmationKey = key;
        render();
        return;
      }
      confirmationKey = null;
      return void call('onConstructionStart', selectedDistrictId, button.dataset.buildFacility);
    }
    if (button.dataset.jobCancel) {
      const key = `cancel:${button.dataset.jobCancel}`;
      if (confirmationKey !== key) {
        confirmationKey = key;
        render();
        return;
      }
      confirmationKey = null;
      return void call('onConstructionCancel', button.dataset.jobCancel);
    }
    if (button.dataset.jobOrder) {
      const [jobId, direction] = button.dataset.jobOrder.split(':');
      const key = `reorder:${jobId}:${direction}`;
      if (confirmationKey !== key) {
        confirmationKey = key;
        button.classList.add('is-confirming');
        button.setAttribute('aria-label', 'Press again to confirm queue reorder');
        return;
      }
      confirmationKey = null;
      return void call('onConstructionReorder', jobId, Number(direction));
    }
    if (button.dataset.staffAssign) {
      const [districtId, slotIndex] = button.dataset.staffAssign.split(':');
      const select = root.querySelector(`[data-staff-select="${CSS.escape(button.dataset.staffAssign)}"]`);
      if (select && select.value) {
        return void call('onSpecialistAssign', districtId, Number(slotIndex), select.value);
      }
      return;
    }
    if (button.dataset.staffUnassign) {
      const [districtId, slotIndex] = button.dataset.staffUnassign.split(':');
      return void call('onSpecialistUnassign', districtId, Number(slotIndex));
    }
    if (button.dataset.nav) {
      const entry = CAMPAIGN_HUB_PRIMARY_NAV.find(item => item.id === button.dataset.nav);
      if (entry) {
        if (activeView === 'deployment') call('onDeploymentPreview', null);
        openNavigationTarget(entry.target);
      }
      return;
    }
    if (button.dataset.quick) {
      const entry = CAMPAIGN_HUB_QUICK_NAV.find(item => item.id === button.dataset.quick);
      if (!entry) return;
      if (entry.target.kind === 'view' && entry.target.view === 'construction') {
        activeHubRouteId = null;
        activeView = 'construction';
        selectedBuildPlotId = null;
        call('onDistrictFocus', selectedDistrictId);
        sheetExpanded = true;
        render();
      } else openNavigationTarget(entry.target);
      return;
    }
    if (button.dataset.install) {
      const select = root.querySelector(`[data-module-choice="${CSS.escape(button.dataset.install)}"]`);
      return void call('onModuleInstall', selectedDistrictId, button.dataset.install, select?.value);
    }
    if (button.dataset.research) return void call('onResearchAllocate', button.dataset.research, Number(button.dataset.researchAmount) || 10);
    if (button.dataset.residency) return void call('onFactionResidency', button.dataset.residency);
    if (button.dataset.commander) return void call('onCommanderPrepare', button.dataset.commander);
    if (button.dataset.mission) {
      openMissionDeployment(button.dataset.mission);
      return;
    }
    if (button.dataset.action === 'overview') {
      activeHubRouteId = null;
      sheetExpanded = false;
      shipOverviewActive = true;
      render();
      // The scene fits to live control and sheet bounds. Refit only after the
      // collapsed sheet has actually changed layout on compact phones.
      call('onOverviewFocus');
      return;
    }
    if (button.dataset.action === 'toggle-sheet') {
      sheetExpanded = !sheetExpanded;
      if (['command', 'construction'].includes(activeView)) shipOverviewActive = false;
      render();
      if (['command', 'construction'].includes(activeView)) call('onDistrictFocus', selectedDistrictId);
      else call('onOverviewFocus');
      return;
    }
    if (button.dataset.action === 'open-construction' || button.dataset.action === 'open-research-construction' || button.dataset.action === 'upgrade') {
      if (button.dataset.action === 'open-research-construction') selectedDistrictId = 'research';
      selectedDeckFilter = normalizeDistrict(selectedDistrictId, districtsCatalog(getCatalog())).deck;
      activeView = 'construction';
      sheetExpanded = true;
      selectedBuildPlotId = button.dataset.action === 'upgrade' ? `tier${Math.min(3, Number(getState().ship?.districts?.[selectedDistrictId]?.level || 1) + 1)}` : 'tier1';
      confirmationKey = null;
      render();
      // A management route must move both the inspector and the physical room.
      call('onDistrictFocus', selectedDistrictId);
      return;
    }
    if (button.dataset.action === 'deploy') {
      const planner = button.closest('.uga-deployment-planner');
      const readiness = syncDeploymentPlanner(planner);
      if (!readiness.ready) return void call('onDeploymentInvalid', readiness.message);
      return void call('onDeploy', readiness.payload);
    }
    if (button.dataset.action === 'exit') return void call('onExit');
  });

  root.addEventListener('error', event => {
    const image = event.target.closest?.('img[data-personnel-id]');
    if (!image || !root.contains(image)) return;
    portraitStatus.set(image.dataset.personnelId, 'unavailable');
    render();
  }, true);

  root.addEventListener('change', event => {
    const personnel = event.target.closest('[data-deploy="commanderId"], [data-specialist]');
    if (personnel) {
      syncPersonnelPortrait(personnel);
      const planner = personnel.closest('.uga-deployment-planner');
      syncDeploymentPlanner(planner, personnel.hasAttribute('data-specialist') ? 'specialist_muster' : 'command_chassis');
      return;
    }
    const manifestControl = event.target.closest('[data-deploy-unit], [data-deploy-structure], [data-deploy-mod]');
    if (manifestControl) {
      const planner = manifestControl.closest('.uga-deployment-planner');
      const manifest = planner?.querySelector('.uga-deployment-manifest');
      if (!manifest) return;
      const stagedUnits = [...manifest.querySelectorAll('[data-deploy-unit]')].reduce((sum, select) => sum + (Number(select.value) || 0), 0);
      const stagedStructures = [...manifest.querySelectorAll('[data-deploy-structure]')].reduce((sum, select) => sum + (Number(select.value) || 0), 0);
      const unitSummary = planner.querySelector('[data-deployment-station="unit_staging"] small');
      const structureSummary = planner.querySelector('[data-deployment-station="structure_cargo"] small');
      if (unitSummary) unitSummary.textContent = `${stagedUnits} elements`;
      if (structureSummary) structureSummary.textContent = `${stagedStructures} loaded`;
      const modLimit = Number(manifest.dataset.modLimit) || 0;
      const checkedMods = [...manifest.querySelectorAll('[data-deploy-mod]:checked')];
      if (checkedMods.length > modLimit) {
        manifestControl.checked = false;
      }
      syncDeploymentPlanner(planner, manifestControl.hasAttribute('data-deploy-unit') ? 'unit_staging' : manifestControl.hasAttribute('data-deploy-structure') ? 'structure_cargo' : 'support_service');
      return;
    }
    const deploymentField = event.target.closest('[data-deploy="mapId"], [data-deploy="landingZone"], [data-deploy="support"], [data-deploy="doctrine"]');
    if (deploymentField) {
      const planner = deploymentField.closest('.uga-deployment-planner');
      const station = deploymentField.matches('[data-deploy="mapId"], [data-deploy="landingZone"]') ? 'base_deployer'
        : deploymentField.matches('[data-deploy="support"]') ? 'support_service'
          : deploymentDrafts.get(planner.dataset.missionId)?.station || 'base_deployer';
      syncDeploymentPlanner(planner, station);
      return;
    }
    const factionSelect = event.target.closest('[data-deploy="factionId"]');
    if (!factionSelect) return;
    const planner = factionSelect.closest('.uga-deployment-planner');
    const factionId = factionSelect.value;
    const catalog = getCatalog();
    const state = getState();
    const commanders = readyPersonnel(asArray(catalog.commanders || catalog.COMMANDER_CATALOG), state, 'commanders', factionId);
    const specialists = readyPersonnel(asArray(catalog.specialists || catalog.SPECIALIST_CATALOG), state, 'specialists', factionId);
    const commander = planner.querySelector('[data-deploy="commanderId"]');
    if (commander) {
      commander.innerHTML = commanders.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || prettyToken(item.id))}</option>`).join('');
      commander.disabled = !commanders.length;
      syncPersonnelPortrait(commander);
    }
    planner.querySelectorAll('[data-specialist]').forEach((select, index) => {
      select.innerHTML = specialists.map((item, itemIndex) => `<option value="${escapeHtml(item.id)}" ${itemIndex === index ? 'selected' : ''}>${escapeHtml(item.name || prettyToken(item.id))}</option>`).join('');
      select.disabled = !specialists.length;
      syncPersonnelPortrait(select);
    });
    const personnelReady = Boolean(factionId && commanders.length && specialists.length >= 3);
    const portraitLock = planner.querySelector('.uga-personnel-lock');
    if (portraitLock) portraitLock.hidden = personnelReady;
    syncDeploymentPlanner(planner, 'command_chassis');
    return;
  });

  const api = {
    root,
    setState(nextState) {
      localState = nextState || {};
      render();
      return api;
    },
    update(next) {
      if (typeof next === 'function') localState = next(localState) || localState;
      else if (next && typeof next === 'object') localState = deepMerge(localState, next);
      render();
      return api;
    },
    selectDistrict,
    openView(view) {
      const allowed = new Set(['command', 'construction', 'return-services', 'campaign_hub', 'services', 'progress', 'factions', 'contracts', 'research', 'intel', 'logistics', 'inventory', 'crew', 'classic']);
      if (allowed.has(view)) {
        shipOverviewActive = false;
        activeHubRouteId = null;
        activeView = view === 'classic' ? 'campaign_hub' : view;
        sheetExpanded = activeView !== 'command';
      }
      render();
      return api;
    },
    openConstructionPlot(districtId, plotId = null) {
      if (!DISTRICT_DEFAULTS[districtId]) return api;
      activeHubRouteId = null;
      selectedDistrictId = districtId;
      selectedDeckFilter = normalizeDistrict(districtId, districtsCatalog(getCatalog())).deck;
      selectedBuildPlotId = /^tier[123]$/.test(String(plotId || '')) ? String(plotId) : null;
      confirmationKey = null;
      activeView = 'construction';
      sheetExpanded = true;
      render();
      call('onDistrictFocus', districtId);
      return api;
    },
    activateDeploymentHotspot(station) {
      activateDeploymentStation(station);
      return api;
    },
    openMission(missionId) {
      openMissionDeployment(missionId);
      return api;
    },
    getDeploymentDraft(missionId = selectedMissionId) {
      const value = deploymentDrafts.get(missionId);
      return value ? {
        ...value,
        specialistIds: [...value.specialistIds],
        deploymentManifest: {
          units: value.deploymentManifest.units.map(item => ({ ...item })),
          structures: value.deploymentManifest.structures.map(item => ({ ...item })),
          modIds: [...value.deploymentManifest.modIds]
        }
      } : null;
    },
    show() { visible = true; sheetExpanded = false; render(); return api; },
    hide() { visible = false; render(); return api; },
    destroy() {
      destroyed = true;
      releaseAccountLedger();
      for (const probe of portraitProbes.values()) {
        probe.onload = null;
        probe.onerror = null;
      }
      portraitProbes.clear();
      root.remove();
    }
  };

  render();
  return api;
}
