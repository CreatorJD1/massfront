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
  HOST_REQUIRED: 'host-required'
});

const route = (id, label, icon, status, description, target = null, detail = '') => Object.freeze({
  id, label, icon, status, description, target: target ? Object.freeze(target) : null, detail
});

export const CAMPAIGN_HUB_ROUTES = Object.freeze([
  route('operations', 'Operations & Missions', 'contracts', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Review authored contracts, readiness locks, deployment capacity, and Strike Team preparation.',
    { kind: 'view', view: 'contracts' }, 'LOCAL CAMPAIGN CONTROLLER'),
  route('development', 'Development & Research', 'research', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Allocate the shared research bank against authored prerequisites and exact campaign unlocks.',
    { kind: 'view', view: 'research' }, 'LOCAL CAMPAIGN CONTROLLER'),
  route('armory', 'Armory & Fabrication', 'fabricator', CAMPAIGN_HUB_ROUTE_STATUS.LOCAL_PREVIEW,
    'Inspect the commissioned Fabrication district. A dedicated crafting transaction controller is not connected yet.',
    { kind: 'district', districtId: 'fabricator' }, 'DISTRICT PREVIEW ONLY'),
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
  route('social', 'Social Status', 'factions', CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED,
    'Friends, chat, invitations, and player lobbies belong to the production social host and are not available in isolation.',
    null, 'HOST CAPABILITY REQUIRED'),
  route('settings', 'Settings', 'engineering', CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED,
    'Account, graphics, audio, accessibility, and experimental-module settings remain owned by the MASSFRONT host.',
    null, 'HOST CAPABILITY REQUIRED'),
  route('classic', 'Classic MASSFRONT Terminal', 'terminal', CAMPAIGN_HUB_ROUTE_STATUS.IMPLEMENTED,
    'Open the isolated Command Core simulation terminal. Classic launches do not mutate Galactic campaign progression.',
    { kind: 'view', view: 'classic' }, 'LOCAL ISOLATED SIMULATION')
]);

export const CAMPAIGN_HUB_PRIMARY_NAV = Object.freeze([
  Object.freeze({ id: 'galaxy', label: 'Galaxy', icon: 'overview', target: Object.freeze({ kind: 'host-action', action: 'open-galaxy' }) }),
  Object.freeze({ id: 'ship', label: 'Ship', icon: 'command', target: Object.freeze({ kind: 'view', view: 'command' }) }),
  Object.freeze({ id: 'missions', label: 'Missions', icon: 'contracts', target: Object.freeze({ kind: 'route', routeId: 'operations' }) }),
  Object.freeze({ id: 'crew', label: 'Crew', icon: 'staff', target: Object.freeze({ kind: 'route', routeId: 'crew' }) }),
  Object.freeze({ id: 'more', label: 'More', icon: 'logistics', target: Object.freeze({ kind: 'hub' }) })
]);

export const CAMPAIGN_HUB_QUICK_NAV = Object.freeze([
  Object.freeze({ id: 'construction', label: 'Construction', icon: 'build', target: Object.freeze({ kind: 'view', view: 'construction' }) }),
  Object.freeze({ id: 'research', label: 'Research', icon: 'research', target: Object.freeze({ kind: 'route', routeId: 'development' }) }),
  Object.freeze({ id: 'armory', label: 'Armory', icon: 'fabricator', target: Object.freeze({ kind: 'route', routeId: 'armory' }) }),
  Object.freeze({ id: 'hub', label: 'Campaign Hub', icon: 'overview', target: Object.freeze({ kind: 'hub' }) })
]);

const ROUTES_BY_ID = new Map(CAMPAIGN_HUB_ROUTES.map(entry => [entry.id, entry]));
const REQUIRED_ROUTE_IDS = Object.freeze([
  'operations', 'development', 'armory', 'inventory', 'factions',
  'crew', 'social', 'settings', 'classic'
]);

export function getCampaignHubRoute(id) {
  return ROUTES_BY_ID.get(String(id || '')) || null;
}

export function campaignHubRouteIsReachable(entry) {
  const routeEntry = typeof entry === 'string' ? getCampaignHubRoute(entry) : entry;
  return Boolean(routeEntry?.target && routeEntry.status !== CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED);
}

export function auditCampaignHubRegistry() {
  const ids = CAMPAIGN_HUB_ROUTES.map(entry => entry.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingIds = REQUIRED_ROUTE_IDS.filter(id => !ROUTES_BY_ID.has(id));
  const invalidStatuses = CAMPAIGN_HUB_ROUTES.filter(entry => !Object.values(CAMPAIGN_HUB_ROUTE_STATUS).includes(entry.status)).map(entry => entry.id);
  const falseHostTargets = CAMPAIGN_HUB_ROUTES.filter(entry => entry.status === CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED && entry.target).map(entry => entry.id);
  const unreachableLocalRoutes = CAMPAIGN_HUB_ROUTES.filter(entry => entry.status !== CAMPAIGN_HUB_ROUTE_STATUS.HOST_REQUIRED && !entry.target).map(entry => entry.id);
  return Object.freeze({
    ok: duplicateIds.length === 0 && missingIds.length === 0 && invalidStatuses.length === 0 && falseHostTargets.length === 0 && unreachableLocalRoutes.length === 0,
    duplicateIds: Object.freeze(duplicateIds),
    missingIds: Object.freeze(missingIds),
    invalidStatuses: Object.freeze(invalidStatuses),
    falseHostTargets: Object.freeze(falseHostTargets),
    unreachableLocalRoutes: Object.freeze(unreachableLocalRoutes)
  });
}

const registryAudit = auditCampaignHubRegistry();
if (!registryAudit.ok) throw new Error(`Invalid Campaign Hub registry: ${JSON.stringify(registryAudit)}`);
