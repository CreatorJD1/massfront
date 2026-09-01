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
    ['standard-classic', 'Standard / Classic'],
    ['campaign', 'Campaign'],
    ['coop-versus', 'Co-op / Versus'],
    ['mmo', 'MMO']
  ],
  'the product model must expose Standard / Classic, Campaign, Co-op / Versus, and MMO as distinct routes'
);

const classic = getCampaignHubSessionType('standard-classic');
const campaign = getCampaignHubSessionType('campaign');
const network = getCampaignHubSessionType('coop-versus');
const mmo = getCampaignHubSessionType('mmo');
assert.equal(classic.status, CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY);
assert.equal(classic.routeId, 'classic');
assert.equal(campaign.status, CAMPAIGN_HUB_SESSION_STATUS.OFFLINE_READY);
assert.equal(campaign.routeId, 'campaign');
assert.equal(network.status, CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE);
assert.equal(network.routeId, null, 'unsupported networking must never gain a fake target');
assert.equal(mmo.status, CAMPAIGN_HUB_SESSION_STATUS.NETWORK_UNAVAILABLE);
assert.equal(mmo.routeId, null, 'unsupported MMO must never gain a fake target');
assert.equal(campaignHubSessionIsReachable(classic), false, 'standalone module cannot pretend it owns base-game offline play');
assert.equal(campaignHubSessionIsReachable(classic, { hostRoutes: true }), true);
assert.equal(campaignHubSessionIsReachable(campaign, { hostRoutes: true }), true);
assert.equal(campaignHubSessionIsReachable(network, { hostRoutes: true }), false, 'future persistent networking stays unavailable');
assert.equal(campaignHubSessionIsReachable(mmo, { hostRoutes: true }), false, 'future MMO authority stays unavailable');

for (const id of ['galactic-operations', 'galactic-research', 'galactic-intel']) {
  assert.equal(campaignHubRouteIsReachable(getCampaignHubRoute(id)), true, `${id} must keep its real local controller`);
}
assert.equal(CAMPAIGN_HUB_PRIMARY_NAV.find(entry => entry.id === 'missions').target.routeId, 'galactic-operations');
assert.equal(CAMPAIGN_HUB_QUICK_NAV.find(entry => entry.id === 'research').target.routeId, 'galactic-research');

const uiSource = await readFile(new URL('../modules/space_exploration/src/ui/uga_command.js', import.meta.url), 'utf8');
const uiCss = await readFile(new URL('../modules/space_exploration/src/ui/uga_command.css', import.meta.url), 'utf8');
assert.match(uiSource, /data-session-route=/, 'Campaign Hub must render explicit session selectors');
assert.match(uiSource, /OFFLINE READY/);
assert.match(uiSource, /PERSISTENT MMO/);
assert.match(uiSource, /NETWORK UNAVAILABLE/);
assert.doesNotMatch(uiSource, /SIMULATE CINEMATIC LAUNCH|Simulated sector population|data-classic-field|data-classic-mode|onClassicMode/, 'the UI must not retain simulated placeholder launches');
assert.match(uiCss, /\.uga-strategic-layer-model/);
assert.match(uiCss, /\.uga-session-type-grid\s*\{[^}]*repeat\(2,/,
  'the four session families must form a balanced two-column command grid before the mobile single-column breakpoint');

console.log('Galactic Campaign Hub product model: PASS');
