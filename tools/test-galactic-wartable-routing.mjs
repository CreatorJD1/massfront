import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMemoryStorage } from '../modules/space_exploration/src/domain/state_store.js';
import { FakeIndexedDbHostDatabase } from '../modules/space_exploration/src/host/host_database.js';
import {
  MASSFRONT_GALACTIC_ENTRY_TICKET_KEY,
  MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX,
  MassfrontSoloHost,
  createMassfrontGalacticEntryTicket
} from '../modules/space_exploration/src/host/massfront_solo_host.js';
import {
  CAMPAIGN_HUB_ROUTE_STATUS,
  auditCampaignHubRegistry,
  campaignHubRouteIsReachable,
  getCampaignHubRoute
} from '../modules/space_exploration/src/ui/campaign_hub_registry.js';
import { loadProductionCommanderRosterSnapshot } from '../modules/space_exploration/tools/tests/production-commander-roster.fixture.mjs';

const profileId = 'p1';
const nonce = 'abcdef0123456789abcdef0123456789';
const issuedAt = Date.now() - 10;
const commanderRosterSnapshot = await loadProductionCommanderRosterSnapshot();
const ticket = createMassfrontGalacticEntryTicket(profileId, {
  issuedAt,
  ttlMs: 60_000,
  entryView: 'campaign_hub',
  commanderRosterSnapshot,
  commanderRosterFingerprint: commanderRosterSnapshot.fingerprint
});
assert.equal(ticket.entryView, 'campaign_hub');

const sessionStorage = createMemoryStorage({
  [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
});
const navigations = [];
const host = new MassfrontSoloHost({
  sessionStorage,
  storage: createMemoryStorage(),
  database: new FakeIndexedDbHostDatabase(),
  expectedProfileId: profileId,
  now: () => Date.now(),
  nonceFactory: () => nonce,
  navigation: url => { navigations.push(url); }
});
const opened = await host.openBaseRoute('operations');
assert.equal(opened.launchUrl, `../../../index.html?galacticRoute=${nonce}`);
assert.deepEqual(navigations, [opened.launchUrl]);
const routeKey = `${MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX}${nonce}`;
const routeRecord = JSON.parse(sessionStorage.getItem(routeKey));
assert.equal(routeRecord.kind, 'MassfrontGalacticRouteRequestV1');
assert.equal(routeRecord.profileId, profileId);
assert.equal(routeRecord.routeId, 'operations');
assert.ok(!opened.launchUrl.includes(profileId));
assert.ok(!opened.launchUrl.includes('operations'));
for (const unsupportedRoute of ['mmo', 'mode-coop', 'mode-versus']) {
  await assert.rejects(
    () => host.openBaseRoute(unsupportedRoute),
    error => error?.code === 'GALACTIC_BASE_ROUTE_REJECTED',
    `${unsupportedRoute} must never gain a fake base-game bridge route`
  );
}

const registryAudit = auditCampaignHubRegistry();
assert.equal(registryAudit.ok, true, JSON.stringify(registryAudit));
const operations = getCampaignHubRoute('operations');
const mmo = getCampaignHubRoute('mmo');
assert.equal(operations.status, CAMPAIGN_HUB_ROUTE_STATUS.HOST_ROUTE);
assert.equal(campaignHubRouteIsReachable(operations), false, 'host routes stay disabled in standalone mode');
assert.equal(campaignHubRouteIsReachable(operations, { hostRoutes: true }), true);
assert.equal(campaignHubRouteIsReachable(mmo, { hostRoutes: true }), false, 'unimplemented MMO stays locked');

const routeScreens = [];
const sound = [];
const historyUrls = [];
const moduleReturns = [];
const introDismissals = [];
const source = fs.readFileSync(new URL('../src/galactic-operations.js', import.meta.url), 'utf8');
const context = {
  console,
  document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
  location: { search: `?galacticRoute=${nonce}`, pathname: '/index.html', hash: '', href: '' },
  history: {
    state: null,
    replaceState(_state, _title, url) {
      historyUrls.push(url);
      context.location.search = '';
    }
  },
  sessionStorage,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  bootConfirmed: true,
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: true } },
  initAudio: () => sound.push('audio'),
  sfx: name => sound.push(name),
  mfDismissIntroForGalacticRoute: () => introDismissals.push('dismissed'),
  renderOps: () => routeScreens.push('renderOps'),
  showFrontScreen: id => { routeScreens.push(id); return true; },
  mfOpenExploration: view => { moduleReturns.push(view); return Promise.resolve(true); }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'src/galactic-operations.js' });
await new Promise(resolve => setTimeout(resolve, 30));

assert.equal(context.__MF_GALACTIC_BRIDGE.status, 'menu-route');
assert.equal(context.__MF_GALACTIC_BRIDGE.menuRouteActive, true);
assert.deepEqual(routeScreens, ['renderOps', 'opsScr']);
assert.equal(sessionStorage.getItem(routeKey), null, 'one-time route record must be consumed');
assert.deepEqual(historyUrls, ['/index.html']);
assert.deepEqual(sound, ['audio', 'ui']);
assert.deepEqual(introDismissals, ['dismissed'], 'validated submenu routes must not replay the launch title');

context.showFrontScreen('startScreen');
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(moduleReturns, ['campaign_hub'], 'submenu Back must return to the Galactic strategic layer');
assert.equal(context.__MF_GALACTIC_BRIDGE.menuRouteActive, false, 'return guard must clear before navigation');
assert.deepEqual(routeScreens, ['renderOps', 'opsScr'], 'return guard must not expose the superseded base War Room');

/* galactic-operations.js loads before career-faction-gate.js. A secured skip
   can therefore return after bootConfirmed but before its destination owner is
   installed. The one-time record must wait intact for that late owner. */
const lateNonce = 'fedcba9876543210fedcba9876543210';
const lateStorage = createMemoryStorage({
  [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
});
const lateNavigations = [];
const lateHost = new MassfrontSoloHost({
  sessionStorage: lateStorage,
  storage: createMemoryStorage(),
  database: new FakeIndexedDbHostDatabase(),
  expectedProfileId: profileId,
  now: () => Date.now(),
  nonceFactory: () => lateNonce,
  navigation: url => { lateNavigations.push(url); }
});
await lateHost.openBaseRoute('new-career-faction');
const lateRouteKey = `${MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX}${lateNonce}`;
const lateHistory = [];
const lateContext = {
  console,
  document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
  location: { search: `?galacticRoute=${lateNonce}`, pathname: '/index.html', hash: '', href: '' },
  history: {
    state: null,
    replaceState(_state, _title, url) {
      lateHistory.push(url);
      lateContext.location.search = '';
    }
  },
  sessionStorage: lateStorage,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  bootConfirmed: true,
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: true } },
  initAudio() {}, sfx() {},
  mfDismissIntroForGalacticRoute() {},
  showFrontScreen: () => true
};
lateContext.window = lateContext;
vm.createContext(lateContext);
vm.runInContext(source, lateContext, { filename: 'src/galactic-operations.js#late-career-owner' });
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(lateContext.__MF_GALACTIC_BRIDGE.status, 'waiting-for-base-route');
assert.notEqual(lateStorage.getItem(lateRouteKey), null,
  'secured return nonce must remain unconsumed while the career gate script is still loading');
const delivered = [];
lateContext.MFNewCareerFactionGate = {
  openFromRoute(detail) { delivered.push(detail); return true; }
};
await new Promise(resolve => setTimeout(resolve, 90));
assert.equal(delivered.length, 1);
assert.equal(delivered[0].choice, 'skipped');
assert.equal(lateStorage.getItem(lateRouteKey), null, 'nonce is consumed exactly when its owner receives it');
assert.equal(lateContext.__MF_GALACTIC_BRIDGE.status, 'menu-route');
assert.deepEqual(lateHistory, ['/index.html']);

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const hudflow = fs.readFileSync(new URL('../src/ui/hudflow.js', import.meta.url), 'utf8');
const intro = fs.readFileSync(new URL('../src/intro.js', import.meta.url), 'utf8');
const meta = fs.readFileSync(new URL('../src/game/meta.js', import.meta.url), 'utf8');
assert.match(html, /id="startBtn"[^>]*>\s*\u25b6\s*&nbsp;START MASSFRONT<\/button>/);
assert.match(hudflow, /start\.innerHTML='▶&nbsp;START MASSFRONT'/,
  'late home-chrome takeover must not restore the obsolete WAR ROOM label');
assert.match(hudflow, /start\.setAttribute\('aria-label','Start MASSFRONT'\)/);
assert.match(main, /mfOpenExploration\('system'\)/,
  'experimental START must enter live space before Training or War Table choice');
assert.match(main, /if\(!opened\)openLegacyWarRoom\(\)/, 'packaged build must keep the installed War Room fallback');
assert.match(source, /if\(!baseRouteTargetReady\(request\.routeId\)\)\{setTimeout\(routeTick,50\);return;\}/,
  'secured onboarding routes must wait for late-loaded target owners before nonce consumption');
assert.ok(intro.includes("return /^\\?galacticRoute=[A-Za-z0-9_-]{16,128}$/.test"),
  'only the exact opaque Galactic menu-route query may bypass the launch title');
assert.match(intro, /if\(galacticMenuRouteLaunch\(\)\)\{ revealFront\(\); return; \}/,
  'a Galactic submenu return must reveal the base UI without replaying the launch title');
assert.match(intro, /window\.mfDismissIntroForGalacticRoute=dismissIntroForGalacticRoute/);
assert.match(meta, /Experimental: Galactic War Table/);
assert.match(meta, /shared strategic layer/);
assert.doesNotMatch(meta, /Open Galactic Campaign Preview|Isolated preview/,
  'settings copy must not describe the integrated strategic layer as a separate preview');

console.log('Galactic strategic War Table routing: PASS');
