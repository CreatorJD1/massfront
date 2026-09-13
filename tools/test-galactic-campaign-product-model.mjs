import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CAMPAIGN_HUB_PRIMARY_NAV,
  CAMPAIGN_HUB_QUICK_NAV,
  CAMPAIGN_HUB_SESSION_STATUS,
  CAMPAIGN_HUB_SESSION_TYPES,
  auditCampaignHubRegistry,
  campaignHubRouteIsReachable,
  campaignHubSessionIsReachable,
  getCampaignHubRoute,
  getCampaignHubSessionType
} from '../modules/space_exploration/src/ui/campaign_hub_registry.js';

assert.equal(auditCampaignHubRegistry().ok, true, 'campaign hub registry must remain internally valid');
assert.deepEqual(
  CAMPAIGN_HUB_SESSION_TYPES.map(entry => [entry.id, entry.label]),
  [
    ['standard-classic', 'Standard Deployment'],
    ['campaign', 'Campaign'],
    ['coop-versus', 'Co-op / Versus'],
    ['mmo', 'MMO']
  ],
  'Galactic Command must expose tactical deployments without presenting itself as a game mode'
);

const nlToken = '\n';
const classic = getCampaignHubSessionType('standard-classic');
const campaign = getCampaignHubSessionType('campaign');
const network = getCampaignHubSessionType('coop-versus');
const mmo = getCampaignHubSessionType('mmo');
assert.equal(classic.status, CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY);
assert.equal(classic.routeId, 'standard');
assert.deepEqual(getCampaignHubRoute(classic.routeId).target,
  { kind: 'host-route', routeId: 'mode-standard' },
  'Standard deployment must open solo setup directly, without the retired War Table');
assert.equal(campaign.status, CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY);
assert.equal(campaign.routeId, 'campaign');
assert.equal(network.status, CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE);
assert.equal(network.routeId, null, 'unsupported networking must never gain a fake target');
assert.equal(mmo.status, CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE);
assert.equal(mmo.routeId, null, 'unsupported MMO must never gain a fake target');
assert.equal(campaignHubSessionIsReachable(classic), false, 'standalone module cannot pretend it owns base-game offline play');
assert.equal(campaignHubSessionIsReachable(classic, { hostRoutes: true }), true);
/* TEMPORARY, paired with campaign_hub_registry.js: the Campaign route is held at
   HOST_REQUIRED while the UGA command loop is finished, so its session is
   unreachable even inside the base game. The Prologue itself is built and
   unchanged. Restore this to `true` in the same commit that returns the route to
   HOST_ROUTE - if this line is still asserting false once Campaign is unlocked,
   the assertion is wrong, not the product. */
assert.equal(campaignHubSessionIsReachable(campaign, { hostRoutes: true }), false,
  'Campaign is deliberately held while the UGA command loop is completed');
assert.equal(campaignHubSessionIsReachable(network, { hostRoutes: true }), false, 'future persistent networking stays unavailable');
assert.equal(campaignHubSessionIsReachable(mmo, { hostRoutes: true }), false, 'future MMO authority stays unavailable');

for (const id of ['galactic-operations', 'galactic-research', 'galactic-intel']) {
  assert.equal(campaignHubRouteIsReachable(getCampaignHubRoute(id)), true, `${id} must keep its real local controller`);
}
assert.deepEqual(CAMPAIGN_HUB_PRIMARY_NAV.find(entry => entry.id === 'missions').target, { kind: 'view', view: 'progress' });
assert.deepEqual(CAMPAIGN_HUB_PRIMARY_NAV.find(entry => entry.id === 'classic').target, { kind: 'hub' },
  'Play must return to the stable strategic home and its shallow Basic Access layer');
assert.deepEqual(CAMPAIGN_HUB_PRIMARY_NAV.find(entry => entry.id === 'more').target, { kind: 'view', view: 'services' },
  'More must own the service directory instead of making it the cold-launch home');
assert.equal(CAMPAIGN_HUB_QUICK_NAV.find(entry => entry.id === 'research').target.routeId, 'galactic-research');
assert.equal(getCampaignHubRoute('home'), null, 'the retired main menu must not remain a Galactic destination');
assert.equal(getCampaignHubRoute('classic'), null, 'the retired War Table must not remain a duplicate destination');

const uiSource = await readFile(new URL('../modules/space_exploration/src/ui/uga_command.js', import.meta.url), 'utf8');
const uiCss = await readFile(new URL('../modules/space_exploration/src/ui/uga_command.css', import.meta.url), 'utf8');
const homeStart = uiSource.indexOf('  function campaignHubPanel(');
const servicesStart = uiSource.indexOf('  function campaignServicesPanel()', homeStart);
const renderStart = uiSource.indexOf('  function renderContext()', servicesStart);
assert.ok(homeStart >= 0 && servicesStart > homeStart && renderStart > servicesStart);
const homeSource = uiSource.slice(homeStart, servicesStart);
const servicesSource = uiSource.slice(servicesStart, renderStart);
assert.match(homeSource, /uga-campaign-depart[\s\S]*?basicAccessPanel\(\)/,
  'the cold strategic home must lead with deliberate exploration, then compact base play');
assert.doesNotMatch(homeSource, /uga-hub-services|moreNavigationShortcuts|uga-session-types/,
  'the cold strategic home must not lead with the long service directory or speculative session families');
/* SERVICES IS A DIRECTORY, SO IT NEEDS SHELVES.

   Seventeen destinations in one flat list is the screen that read as text
   boxes. The shelves are .uga-panel-section on purpose: that is the element
   the rooms use, so the authored plate and the fold affordance come from the
   same place rather than from a second implementation that can drift. */
assert.match(servicesSource, /uga-campaign-services[\s\S]*?moreNavigationShortcuts\(\)[\s\S]*?\$\{shelves\}/,
  'More must expose the shelved service directory and the phone-only shortcuts');
assert.match(servicesSource, /CAMPAIGN_HUB_SERVICE_GROUPS\.map/,
  'the directory must be built from the grouped registry, not listed flat');
assert.match(servicesSource, /class="uga-panel-section uga-service-shelf"/,
  'each shelf must be a panel section so plate and fold are inherited, never reimplemented');
assert.match(servicesSource, /uga-hub-route-list/,
  'shelving must not drop the route rows themselves');

/* Exhaustive and disjoint, enforced in the registry itself: a route that falls
   out of every group still exists and still works, and is simply unreachable. */
const registryAudit = auditCampaignHubRegistry();
assert.deepEqual([...registryAudit.ungroupedServices], [], 'every non-session route must sit on exactly one shelf');
assert.deepEqual([...registryAudit.duplicateGroupedServices], [], 'a route must not appear on two shelves');
assert.deepEqual([...registryAudit.unknownGroupedServices], [], 'a shelf must not name a route that does not exist');
for (const routeId of ['standard', 'training', 'campaign']) {
  assert.match(uiSource, new RegExp(`\\['${routeId}',`), `Basic Access must expose ${routeId}`);
}
assert.match(uiSource, /data-host-route="war-room"/, 'Play drawer must preserve an explicit base War Table escape');
assert.match(uiSource, /mapId:\s*value\('mapId'\)/,
  'the deployment draft must emit the player-selected battlefield map');
for (const selector of ['data-ground-route-stage="map"', 'data-selected-area-id=', 'data-selected-map-id=', 'data-selected-map-size=', 'data-ground-area=', 'data-ground-map=', 'data-map-size=']) {
  assert.ok(uiSource.includes(selector), `deployment route must expose ${selector}`);
}
assert.doesNotMatch(uiSource, /runtimeTemplateMapId/,
  'internal terrain-template identities must not leak into the UGA interface');
assert.match(uiSource, /data-command-construction="build"/);
assert.match(uiSource, /data-command-construction="upgrade"/);
assert.match(uiSource, /data-hub-route="galactic-research"/);
assert.match(uiSource, /data-host-route="development"/);
assert.match(uiSource, /data-hub-route="inventory"/);
assert.doesNotMatch(uiSource, /definition\.fixed\s*\?\s*classicTerminal\(\)/,
  'Ship management must not duplicate the authoritative Basic Access mode picker');
assert.match(uiSource, /if \(activeView === 'classic'\) return campaignHubPanel\(\)/,
  'restored legacy classic view tokens must resolve to the current Campaign Hub');
assert.match(uiSource, /activeView = view === 'classic' \? 'campaign_hub' : view/,
  'the public UGA view API must normalize classic to the current Play authority');
assert.doesNotMatch(uiSource, /Classic — Standard War Table|SELECT A MODE|CLASSIC \/ VERSUS · WAR TABLE/,
  'Galactic Command must not present itself as a mode picker layered over the old War Table');
assert.doesNotMatch(uiSource, /SIMULATE CINEMATIC LAUNCH|Simulated sector population|data-classic-field|data-classic-mode|onClassicMode/, 'the UI must not retain simulated placeholder launches');
assert.match(uiCss, /\.uga-basic-access-grid\s*\{[^}]*repeat\(2,/,
  'Basic Access must stay a compact two-column control grid');
assert.match(uiCss, /\.uga-basic-access-grid button::after,[\s\S]*?\.uga-command-nav button:not\(\.is-active\)::after\s*\{\s*display:\s*none;/,
  'ordinary inactive rows must use clean neutral borders instead of ornate selection frames');
assert.match(uiCss, /data-view="campaign_hub"[\s\S]*?\.uga-district-rail,[\s\S]*?\.uga-sheet-toggle\s*\{\s*display:\s*none !important;/,
  'Campaign Hub must hide duplicate exit, ship-room, and collapsible-sheet chrome');
assert.match(uiCss, /data-view="campaign_hub"[\s\S]*?\.uga-context-panel[\s\S]*?top:\s*var\(--uga-gap\);[\s\S]*?height:\s*auto;/,
  'Campaign Hub must use the available compact stage instead of leaving an empty ship viewport');
assert.match(uiCss, /\.uga-ground-route\s*\{[^}]*min-height:\s*54px/,
  'planet, control area, and battlefield choice must remain a compact touch-safe route');

/* THE SHIP IS THE MENU.

   Research, the Embassy, Mission Operations, the Survey archive, the crew
   roster and the cargo hold are compartments aboard NEXUS-VII, and their
   routes have to land in those compartments. A route that drifts back to a
   free-floating view recreates the split this replaced: a player walks to the
   Research Directorate to do research and finds a construction panel. */
const ROOM_ROUTES = Object.freeze({ 'galactic-operations': 'mission_ops', 'galactic-research': 'research', 'galactic-intel': 'survey', factions: 'factions', crew: 'habitat', logistics: 'logistics' });
const districtIds = new Set([...uiSource.matchAll(/^  (\w+): \{$/gm)].map(match => match[1]));
for (const [routeId, districtId] of Object.entries(ROOM_ROUTES)) {
  const target = getCampaignHubRoute(routeId)?.target;
  assert.equal(target?.kind, 'district', `${routeId} must open the room that does the work, not a separate view`);
  assert.equal(target.districtId, districtId, `${routeId} must open ${districtId}`);
  assert.ok(districtIds.has(districtId), `${districtId} must be a district the UI can render`);
}

/* roomWorkBody takes one uga-context-scroll wrapper off each work panel so a
   room renders one scroll, not two nested ones. It returns unrecognised markup
   untouched rather than throwing, because a throw there would blank the
   interface mid-session - which is exactly why the shape is asserted here
   instead, where a panel that stops being wrapped fails a build and not a
   player. */
assert.match(uiSource, /function roomWorkBody\(districtId\)/, 'rooms must resolve their own work');
assert.match(uiSource, /function withoutContextScroll\(markup\)/, 'room work must be unwrapped before it is embedded');
for (const name of ['researchPanel', 'factionPanel', 'contractsPanel', 'intelPanel', 'crewPanel', 'logisticsPanel']) {
  const start = uiSource.indexOf(`  function ${name}(`);
  assert.ok(start > 0, `${name} must exist for its room to render it`);
  const end = uiSource.indexOf(`${nlToken}  }${nlToken}`, start);
  const body = uiSource.slice(start, end < 0 ? undefined : end);
  assert.ok(body.includes('<div class="uga-context-scroll'),
    `${name} must stay uga-context-scroll wrapped; withoutContextScroll silently passes anything else through`);
}

/* THE AMBER SIGNAL MEANS "HERE".

   One action-level attention at a time, and it moves with the journey step:
   the objective's own button normally, Depart on the survey step where the
   objective deliberately renders no button of its own. Marking both would say
   two things are urgent when one is, and the moment a third and fourth surface
   wear this it stops meaning anything. */
assert.match(uiSource, /class="uga-primary-button uga-attention" \$\{objective\.attrs\}/,
  'the objective action must carry the attention signal');
assert.match(uiSource, /const departAttention = objective\.step === 'scan' \? ' uga-attention' : ''/,
  'Depart must carry the signal on the one step where Depart is the objective action');
assert.match(uiSource, /uga-job-card is-\$\{escapeHtml\(job\.status \|\| 'queued'\)\}\$\{job\.status === 'active' \? ' uga-attention' : ''\}/,
  'the active construction job is the unlock with an ETA and must be marked');
assert.equal((uiSource.match(/uga-attention/g) || []).length, 3,
  'attention is a scarce signal: exactly the objective action, Depart on survey, and the active job');

/* Reduced motion drops the movement, never the signal - this is information
   about what to do next, not decoration. */
assert.match(uiCss, /@keyframes ugaAttention/, 'the attention signal must be a slow pulse');
assert.match(uiCss, /prefers-reduced-motion: reduce\)\s*\{\s*\.uga-attention\s*\{[^}]*animation:\s*none;[^}]*box-shadow:/,
  'reduced motion must keep the amber ring and drop only the animation');

console.log('Galactic Campaign Hub product model: PASS');
