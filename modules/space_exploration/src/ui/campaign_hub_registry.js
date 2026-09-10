/* --------------------------------------------------------------------------
   MASSFRONT — ISOLATED GALACTIC CAMPAIGN HUB ROUTES

   This registry is the sole navigation contract for the experimental module.
   A route marked `implemented` has a real local controller. `local-preview`
   exposes authoritative read-only/module state without pretending a complete
   workflow exists. `host-required` stays visible but cannot navigate until an
   integrated host supplies the missing capability.
   -------------------------------------------------------------------------- */

export const CAMPAIGN_HUB_ROUTE_STATUS = Object.freeze({
  IMPLEMENTED: 'implemented',
  LOCAL_PREVIEW: 'local-preview',
  HOST_ROUTE: 'host-route',
  HOST_REQUIRED: 'host-required'
});

export const CAMPAIGN_HUB_SESSION_STATUS = Object.freeze({
  OFFLINE_READY: 'offline-ready',
  NETWORK_UNAVAILABLE: 'network-unavailable'
});

const route = (id, label, icon, status, description, target = null, detail = '') => Object.freeze({
  id, label, icon, status, description, target: target ? Object.freeze(target) : null, detail
});

const sessionType = (id, label, icon, status, description, routeId = null, detail = '') => Object.freeze({
  id, label, icon, status, description, routeId, detail
});

export const CAMPAIGN_HUB_ROUTES = Object.freeze([
  route('galactic-operations', 'Galactic Expedition Operations', 'mission_ops', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Open the local expedition contract board and deployment planner backed by Galactic campaign state.',
    { kind: 'view', view: 'contracts' }, 'LOCAL GALACTIC CONTROLLER'),
  route('galactic-research', 'Galactic Expedition Research', 'research', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Open the local expedition research controller without leaving the shared strategic layer.',
    { kind: 'view', view: 'research' }, 'LOCAL GALACTIC CONTROLLER'),
  route('galactic-intel', 'Galactic Expedition Intel', 'intel', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Inspect local expedition discoveries and intelligence recorded in Galactic campaign state.',
    { kind: 'view', view: 'intel' }, 'LOCAL GALACTIC CONTROLLER'),
  route('operations', 'MASSFRONT Operations', 'contracts', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing weekly operations and playable campaign mission ladder in MASSFRONT.',
    { kind: 'host-route', routeId: 'operations' }, 'LIVE MASSFRONT SUBMENU'),
  route('development', 'Development & Research', 'research', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing research, crafting, and loadout progression screens in MASSFRONT.',
    { kind: 'host-route', routeId: 'development' }, 'LIVE MASSFRONT SUBMENU'),
  route('armory', 'Armory & Loadout', 'fabricator', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing MASSFRONT armory, vault, loadout, and style screens.',
    { kind: 'host-route', routeId: 'armory' }, 'LIVE MASSFRONT SUBMENU'),
  route('orders', 'Orders & Boosters', 'contracts', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open active orders, claimable rewards, and field boosters in MASSFRONT.',
    { kind: 'host-route', routeId: 'orders' }, 'LIVE MASSFRONT SUBMENU'),
  route('intel', 'Intel & Faction Dossier', 'intel', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing faction codex and current intelligence archive.',
    { kind: 'host-route', routeId: 'intel' }, 'LIVE MASSFRONT SUBMENU'),
  route('profile', 'Career & Account', 'staff', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing career, account, transfer, and identity screens.',
    { kind: 'host-route', routeId: 'profile' }, 'LIVE MASSFRONT SUBMENU'),
  route('inbox', 'Inbox', 'contracts', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open transmissions, requests, messages, newsletters, and update history.',
    { kind: 'host-route', routeId: 'inbox' }, 'LIVE MASSFRONT SUBMENU'),
  route('social', 'Social Command', 'factions', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the real MASSFRONT friends, chat, and lobby capability screen. Signed-out and unavailable services remain explicit.',
    { kind: 'host-route', routeId: 'social' }, 'LIVE MASSFRONT SUBMENU'),
  route('settings', 'Settings', 'engineering', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing audio, gameplay, display, command, and system settings.',
    { kind: 'host-route', routeId: 'settings' }, 'LIVE MASSFRONT SUBMENU'),
  route('game-version', 'Game Version & Updates', 'terminal', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the current release channel, notes, checks, and rollback controls.',
    { kind: 'host-route', routeId: 'game-version' }, 'LIVE MASSFRONT SUBMENU'),
  route('inventory', 'Inventory', 'inventory', CAMPAIGN_HUB_ROUTE_STATUS.LOCAL_PREVIEW,
    'Inspect authoritative expedition modules and cargo without implying that crafting or loadout mutation is complete.',
    { kind: 'view', view: 'inventory' }, 'READ-ONLY LOCAL MANIFEST'),
  route('factions', 'Factions & Embassy', 'factions', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Manage resident coalition factions and inspect their campaign readiness from the Embassy controller.',
    { kind: 'view', view: 'factions' }, 'LOCAL CAMPAIGN CONTROLLER'),
  route('crew', 'Crew & Profile', 'staff', CAMPAIGN_HUB_ROUTE_STATUS.LOCAL_PREVIEW,
    'Review the locally available commander and specialist roster. Account profile synchronization still requires a host.',
    { kind: 'view', view: 'crew' }, 'READ-ONLY LOCAL ROSTER'),
  route('logistics', 'Logistics & Cargo', 'logistics', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Inspect fuel, probes, resources, and the expedition supply manifest from authoritative campaign state.',
    { kind: 'view', view: 'logistics' }, 'LOCAL CAMPAIGN CONTROLLER'),
  route('training', 'Training', 'terminal', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Enter the real KEEL-guided protected training operation.',
    { kind: 'host-route', routeId: 'mode-training' }, 'PLAYABLE MASSFRONT MODE'),
  route('standard', 'Standard', 'command', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the real solo War Table setup with AI opponents and optional AI allies.',
    { kind: 'host-route', routeId: 'mode-standard' }, 'PLAYABLE MASSFRONT MODE'),
  route('campaign', 'Campaign Prologue', 'mission_ops', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the existing five-mission playable Prologue and authored objectives.',
    { kind: 'host-route', routeId: 'mode-campaign' }, 'PLAYABLE MASSFRONT MODE'),
  route('weekly', 'Weekly Operation', 'contracts', CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE,
    'Open the current real weekly operation briefing and deployment action.',
    { kind: 'host-route', routeId: 'mode-weekly' }, 'PLAYABLE MASSFRONT MODE'),
  route('mmo', 'MMO Warfront', 'galaxy', CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED,
    'Persistent planetary warfront service is not implemented yet.',
    null, 'LONG TERM // LOCKED'),
  route('coop', 'Co-op / Versus', 'factions', CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED,
    'Networked co-op and commander-versus-commander sessions are not implemented yet.',
    null, 'NETWORK IN DEVELOPMENT // LOCKED')
]);

// These are product-level session families, not speculative game modes. The
// The first two resolve to existing MASSFRONT routes; the two network families
// remain separate and have no targets until real session authorities exist.
export const CAMPAIGN_HUB_SESSION_TYPES = Object.freeze([
  sessionType('standard-classic', 'Standard Deployment', 'command', CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY,
    'Deploy from Galactic Command into an offline battle against AI opponents, with optional AI allies.',
    'standard', 'TACTICAL OPERATION'),
  sessionType('campaign', 'Campaign', 'mission_ops', CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY,
    'Enter the existing playable Campaign Prologue and authored mission progression.',
    'campaign', 'STORY MISSIONS'),
  sessionType('coop-versus', 'Co-op / Versus', 'factions', CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE,
    'Future commanders may cooperate or fight through this strategic layer. No synchronized session service exists in this build.',
    null, 'CO-OP VS NETWORK // NOT IMPLEMENTED'),
  sessionType('mmo', 'MMO', 'galaxy', CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE,
    'The persistent planetary warfront remains a separate future route. No sector authority or MMO connection exists in this build.',
    null, 'PERSISTENT WARFRONT // NOT IMPLEMENTED')
]);

export const CAMPAIGN_HUB_PRIMARY_NAV = Object.freeze([
  Object.freeze({ id: 'galaxy', label: 'Galaxy', icon: 'overview', target: Object.freeze({ kind: 'host-action', action: 'open-galaxy' }) }),
  Object.freeze({ id: 'ship', label: 'Ship', ariaLabel: 'Ship / Development', icon: 'command', target: Object.freeze({ kind: 'view', view: 'command' }) }),
  Object.freeze({ id: 'missions', label: 'Progress', ariaLabel: 'Progress / Operations', icon: 'contracts', target: Object.freeze({ kind: 'view', view: 'progress' }) }),
  Object.freeze({ id: 'classic', label: 'Play', ariaLabel: 'Play / Command access', icon: 'terminal', target: Object.freeze({ kind: 'hub' }) }),
  Object.freeze({ id: 'social', label: 'Social', icon: 'factions', target: Object.freeze({ kind: 'route', routeId: 'social' }) }),
  Object.freeze({ id: 'settings', label: 'Settings', icon: 'engineering', target: Object.freeze({ kind: 'route', routeId: 'settings' }) }),
  Object.freeze({ id: 'crew', label: 'Crew', icon: 'staff', target: Object.freeze({ kind: 'route', routeId: 'crew' }) }),
  Object.freeze({ id: 'more', label: 'More', icon: 'logistics', target: Object.freeze({ kind: 'view', view: 'services' }) })
]);

export const CAMPAIGN_HUB_QUICK_NAV = Object.freeze([
  Object.freeze({ id: 'construction', label: 'Construction', icon: 'build', target: Object.freeze({ kind: 'view', view: 'construction' }) }),
  Object.freeze({ id: 'research', label: 'Research', icon: 'research', target: Object.freeze({ kind: 'route', routeId: 'galactic-research' }) }),
  Object.freeze({ id: 'armory', label: 'Armory', icon: 'fabricator', target: Object.freeze({ kind: 'route', routeId: 'armory' }) }),
  Object.freeze({ id: 'hub', label: 'Campaign Hub', icon: 'overview', target: Object.freeze({ kind: 'hub' }) })
]);

const ROUTES_BY_ID = new Map(CAMPAIGN_HUB_ROUTES.map(entry => [entry.id, entry]));
const SESSION_TYPES_BY_ID = new Map(CAMPAIGN_HUB_SESSION_TYPES.map(entry => [entry.id, entry]));
const REQUIRED_ROUTE_IDS = Object.freeze([
  'galactic-operations', 'galactic-research', 'galactic-intel',
  'operations', 'development', 'armory', 'orders', 'intel', 'profile',
  'inbox', 'social', 'settings', 'game-version', 'inventory', 'factions',
  'crew', 'logistics', 'training', 'standard', 'campaign',
  'weekly', 'mmo', 'coop'
]);
const REQUIRED_SESSION_TYPE_IDS = Object.freeze(['standard-classic', 'campaign', 'coop-versus', 'mmo']);

export function getCampaignHubRoute(id) {
  return ROUTES_BY_ID.get(String(id || '')) || null;
}

export function getCampaignHubSessionType(id) {
  return SESSION_TYPES_BY_ID.get(String(id || '')) || null;
}

export function campaignHubRouteIsReachable(entry, capabilities = {}) {
  const routeEntry = typeof entry === 'string' ? getCampaignHubRoute(entry) : entry;
  if (!routeEntry?.target || routeEntry.status === CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED) return false;
  if (routeEntry.status === CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE) return capabilities.hostRoutes === true;
  return true;
}

export function campaignHubSessionIsReachable(entry, capabilities = {}) {
  const sessionEntry = typeof entry === 'string' ? getCampaignHubSessionType(entry) : entry;
  if (!sessionEntry?.routeId || sessionEntry.status === CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE) return false;
  // Offline play is owned by the base game. A standalone module can explain
  // the product model, but must not pretend it can launch those sessions.
  if (capabilities.hostRoutes !== true) return false;
  return campaignHubRouteIsReachable(sessionEntry.routeId, capabilities);
}

export function auditCampaignHubRegistry() {
  const ids = CAMPAIGN_HUB_ROUTES.map(entry => entry.id);
  const sessionIds = CAMPAIGN_HUB_SESSION_TYPES.map(entry => entry.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const duplicateSessionIds = sessionIds.filter((id, index) => sessionIds.indexOf(id) !== index);
  const missingIds = REQUIRED_ROUTE_IDS.filter(id => !ROUTES_BY_ID.has(id));
  const missingSessionIds = REQUIRED_SESSION_TYPE_IDS.filter(id => !SESSION_TYPES_BY_ID.has(id));
  const invalidStatuses = CAMPAIGN_HUB_ROUTES.filter(entry => !Object.values(CAMPAIGN_HUB_ROUTE_STATUS).includes(entry.status)).map(entry => entry.id);
  const invalidSessionStatuses = CAMPAIGN_HUB_SESSION_TYPES.filter(entry => !Object.values(CAMPAIGN_HUB_SESSION_STATUS).includes(entry.status)).map(entry => entry.id);
  const falseHostTargets = CAMPAIGN_HUB_ROUTES.filter(entry => entry.status === CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED && entry.target).map(entry => entry.id);
  const falseNetworkTargets = CAMPAIGN_HUB_SESSION_TYPES.filter(entry => entry.status === CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE && entry.routeId).map(entry => entry.id);
  const unreachableLocalRoutes = CAMPAIGN_HUB_ROUTES.filter(entry => entry.status !== CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED && !entry.target).map(entry => entry.id);
  const invalidOfflineSessionRoutes = CAMPAIGN_HUB_SESSION_TYPES.filter(entry => entry.status === CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY && !ROUTES_BY_ID.has(entry.routeId)).map(entry => entry.id);
  return Object.freeze({
    ok: duplicateIds.length === 0 && duplicateSessionIds.length === 0 && missingIds.length === 0 && missingSessionIds.length === 0 && invalidStatuses.length === 0 && invalidSessionStatuses.length === 0 && falseHostTargets.length === 0 && falseNetworkTargets.length === 0 && unreachableLocalRoutes.length === 0 && invalidOfflineSessionRoutes.length === 0,
    duplicateIds: Object.freeze(duplicateIds),
    duplicateSessionIds: Object.freeze(duplicateSessionIds),
    missingIds: Object.freeze(missingIds),
    missingSessionIds: Object.freeze(missingSessionIds),
    invalidStatuses: Object.freeze(invalidStatuses),
    invalidSessionStatuses: Object.freeze(invalidSessionStatuses),
    falseHostTargets: Object.freeze(falseHostTargets),
    falseNetworkTargets: Object.freeze(falseNetworkTargets),
    unreachableLocalRoutes: Object.freeze(unreachableLocalRoutes),
    invalidOfflineSessionRoutes: Object.freeze(invalidOfflineSessionRoutes)
  });
}

const registryAudit = auditCampaignHubRegistry();
if (!registryAudit.ok) throw new Error(`Invalid Campaign Hub registry: ${JSON.stringify(registryAudit)}`);
