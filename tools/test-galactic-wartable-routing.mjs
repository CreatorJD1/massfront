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
const opened = await host.openBaseRoute('operations', { systemId: 'veyra', targetId: 'veyra_nacre' });
assert.equal(opened.launchUrl, `../../../index.html?galacticRoute=${nonce}`);
assert.deepEqual(navigations, [opened.launchUrl]);
const routeKey = `${MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX}${nonce}`;
const routeRecord = JSON.parse(sessionStorage.getItem(routeKey));
assert.equal(routeRecord.kind, 'MassfrontGalacticRouteRequestV2');
assert.equal(routeRecord.schemaVersion, 2);
assert.equal(routeRecord.profileId, profileId);
assert.equal(routeRecord.routeId, 'operations');
assert.deepEqual(routeRecord.location, { systemId: 'veyra', targetId: 'veyra_nacre' });
assert.ok(!opened.launchUrl.includes(profileId));
assert.ok(!opened.launchUrl.includes('operations'));
for (const unsupportedRoute of ['mmo', 'mode-coop', 'mode-versus']) {
  await assert.rejects(
    () => host.openBaseRoute(unsupportedRoute, { systemId: 'aelos', targetId: 'nexus_vii' }),
    error => error?.code === 'GALACTIC_BASE_ROUTE_REJECTED',
    `${unsupportedRoute} must never gain a fake base-game bridge route`
  );
}
await assert.rejects(
  () => host.openBaseRoute('operations', { systemId: 'unknown', targetId: null }),
  error => error?.code === 'GALACTIC_BASE_LOCATION_REJECTED',
  'the module host must reject unrecognized systems before navigation'
);

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
let returnedContext=null;
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
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: { experimentalExploration: false } },
  MAPDEFS: {
    nordhall_peaks_medium: { region: 'nordhall_peaks', theme: 'arctic' },
    aelos_north_medium: { region: 'aelos_north', theme: 'verdant' },
    vespera_spire_medium: { region: 'vespera_spire', theme: 'ashland' },
    vespera_refinery_medium: { region: 'vespera_refinery', theme: 'ashland' }
  },
  curMap: 'aelos_north_medium', curRegionId: 'aelos_north', curTheme: 'verdant',
  initAudio: () => sound.push('audio'),
  sfx: name => sound.push(name),
  mfDismissIntroForGalacticRoute: () => introDismissals.push('dismissed'),
  renderOps: () => routeScreens.push('renderOps'),
  showFrontScreen: id => { routeScreens.push(id); return true; },
  mfOpenExploration: (view, options) => {
    returnedContext=options?.menuReturn;
    assert.equal(context.__MF_GALACTIC_BRIDGE.isMenuReturnContext(returnedContext),true,
      'only a validated live submenu Back owns the neutral return context');
    moduleReturns.push(view); return Promise.resolve(true);
  }
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
assert.equal(context.curMap, 'aelos_north_medium', 'a UGA menu route must not relabel Veyra as a base War Table homeworld');
assert.equal(context.curRegionId, 'aelos_north');
assert.equal(context.curTheme, 'verdant');
const karakLocation = context.__MF_GALACTIC_BRIDGE.resolveExpeditionLocation({ systemId: 'karak', targetId: 'karak_tethys' });
assert.deepEqual(JSON.parse(JSON.stringify(karakLocation)), { systemId: 'karak', targetId: 'karak_tethys' },
  'the secured route may carry UGA origin identity but no hidden RTS map choice');
assert.equal(context.__MF_GALACTIC_BRIDGE.resolveExpeditionLocation({ systemId: 'karak', targetId: 'unknown' }), null);

context.showFrontScreen('startScreen');
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(moduleReturns, ['campaign_hub'], 'submenu Back must return to the Galactic strategic layer');
assert.equal(context.__MF_GALACTIC_BRIDGE.menuRouteActive, false, 'return guard must clear before navigation');
assert.equal(context.__MF_GALACTIC_BRIDGE.isMenuReturnContext(returnedContext),false,'return context cannot be replayed after the opener call');
assert.equal(context.__MF_GALACTIC_BRIDGE.isMenuReturnContext({kind:'validated-menu-return'}),false,'matching object shape cannot manufacture a return');
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
await lateHost.openBaseRoute('new-career-faction', { systemId: 'aelos', targetId: 'nexus_vii' });
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
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: {} },
  MAPDEFS: { aelos_north_medium: { region: 'aelos_north', theme: 'verdant' } },
  curMap: 'aelos_north_medium', curRegionId: 'aelos_north', curTheme: 'verdant',
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

/* The secured War Room route must pass through the strategic-home guard once,
   then restore that guard so Back returns to the integrated campaign hub. */
const warRoomNonce = '11223344556677889900aabbccddeeff';
const warRoomStorage = createMemoryStorage({
  [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
});
const warRoomHost = new MassfrontSoloHost({
  sessionStorage: warRoomStorage,
  storage: createMemoryStorage(),
  database: new FakeIndexedDbHostDatabase(),
  expectedProfileId: profileId,
  now: () => Date.now(),
  nonceFactory: () => warRoomNonce,
  navigation() {}
});
await warRoomHost.openBaseRoute('war-room', { systemId: 'aelos', targetId: 'nexus_vii' });
const warRoomRouteKey = `${MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX}${warRoomNonce}`;
const warRoomScreens = [];
const warRoomReturns = [];
const warRoomContext = {
  console,
  document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
  location: { search: `?galacticRoute=${warRoomNonce}`, pathname: '/index.html', hash: '', href: '' },
  history: {
    state: null,
    replaceState(_state, _title, url) {
      warRoomContext.location.search = '';
      warRoomContext.location.href = url;
    }
  },
  sessionStorage: warRoomStorage,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  bootConfirmed: true,
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: {} },
  MAPDEFS: { aelos_north_medium: { region: 'aelos_north', theme: 'verdant' } },
  curMap: 'aelos_north_medium', curRegionId: 'aelos_north', curTheme: 'verdant',
  initAudio() {}, sfx() {}, mfDismissIntroForGalacticRoute() {},
  showFrontScreen(id) { warRoomScreens.push(id); return true; },
  openWarRoom() {
    warRoomScreens.push('renderWarRoom');
    return warRoomContext.showFrontScreen('warScr');
  },
  mfOpenExploration(view) { warRoomReturns.push(view); return Promise.resolve(true); }
};
warRoomContext.window = warRoomContext;
vm.createContext(warRoomContext);
vm.runInContext(source, warRoomContext, { filename: 'src/galactic-operations.js#war-room-route' });
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(warRoomContext.__MF_GALACTIC_BRIDGE.status, 'menu-route');
assert.deepEqual(warRoomScreens, ['renderWarRoom', 'warScr'],
  'the secured route must reveal the real War Room instead of immediately redirecting');
assert.equal(warRoomStorage.getItem(warRoomRouteKey), null, 'the War Room route nonce is consumed exactly once');
warRoomContext.showFrontScreen('startScreen');
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(warRoomReturns, ['campaign_hub'], 'War Room Back must return to the integrated campaign hub');

/* Standard and Training are not decorative Galactic cards: each secured route
   must reach its real base-game owner without silently choosing a homeworld or
   map, and keep Back connected to the integrated strategic shell. */
async function verifySecuredModeRoundTrip(routeId, routeNonce) {
  const modeStorage = createMemoryStorage({
    [MASSFRONT_GALACTIC_ENTRY_TICKET_KEY]: JSON.stringify(ticket)
  });
  const modeHost = new MassfrontSoloHost({
    sessionStorage: modeStorage,
    storage: createMemoryStorage(),
    database: new FakeIndexedDbHostDatabase(),
    expectedProfileId: profileId,
    now: () => Date.now(),
    nonceFactory: () => routeNonce,
    navigation() {}
  });
  await modeHost.openBaseRoute(routeId, { systemId: 'veyra', targetId: 'veyra_nacre' });
  const modeRouteKey = `${MASSFRONT_GALACTIC_ROUTE_REQUEST_PREFIX}${routeNonce}`;
  const modeEvents = [];
  const modeReturns = [];
  const modeContext = {
    console,
    document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
    location: { search: `?galacticRoute=${routeNonce}`, pathname: '/index.html', hash: '', href: '' },
    history: {
      state: null,
      replaceState(_state, _title, url) {
        modeContext.location.search = '';
        modeContext.location.href = url;
      }
    },
    sessionStorage: modeStorage,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: callback => callback(0),
    bootConfirmed: true,
    __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
    PROFILES: { active: profileId },
    META: { settings: {} },
    MAPDEFS: {
      aelos_north_medium: { region: 'aelos_north', theme: 'verdant' },
      nordhall_peaks_medium: { region: 'nordhall_peaks', theme: 'arctic' }
    },
    curMap: 'aelos_north_medium', curRegionId: 'aelos_north', curTheme: 'verdant',
    mfGalaxyStage: 'deploy',
    initAudio() {}, sfx() {}, mfDismissIntroForGalacticRoute() {},
    showFrontScreen(id) { modeEvents.push(`screen:${id}`); return true; },
    openSkirmishSetup() { modeEvents.push('standard:setup'); modeContext.mfGalaxyStage = 'galaxy'; },
    renderPlanetRow() { modeEvents.push('standard:planet'); },
    renderMapRow() { modeEvents.push('standard:map'); },
    renderSpawnPlanner() { modeEvents.push('standard:spawn'); },
    resumeTrainingMission() { modeEvents.push('training:resume'); },
    MFNewCareerFactionGate: {
      afterOnboardingChoice(detail) { modeEvents.push(`training:gate:${detail.choice}:${detail.source}`); }
    },
    mfOpenExploration(view) { modeReturns.push(view); return Promise.resolve(true); }
  };
  modeContext.window = modeContext;
  vm.createContext(modeContext);
  vm.runInContext(source, modeContext, { filename: `src/galactic-operations.js#${routeId}` });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(modeContext.__MF_GALACTIC_BRIDGE.status, 'menu-route', `${routeId} must be accepted`);
  assert.equal(modeStorage.getItem(modeRouteKey), null, `${routeId} nonce must be consumed exactly once`);
  assert.equal(modeContext.curMap, 'aelos_north_medium', `${routeId} must not turn Veyra into Nordhall or choose a battlefield`);
  if (routeId === 'mode-standard') {
    assert.deepEqual(modeEvents, ['standard:setup']);
    assert.equal(modeContext.mfGalaxyStage, 'galaxy', 'Standard must expose the base War Table galaxy-first hierarchy');
  } else {
    assert.deepEqual(modeEvents, ['training:gate:training:secured-base-route', 'training:resume']);
  }
  modeContext.showFrontScreen('startScreen');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(modeReturns, ['campaign_hub'], `${routeId} Back must return to UGA Command`);
}
await verifySecuredModeRoundTrip('mode-standard', '223344556677889900aabbccddeeff11');
await verifySecuredModeRoundTrip('mode-training', '3344556677889900aabbccddeeff1122');

/* An emergency UGA escape is different from an ordinary Classic visit. It owns
   the base War Room for this tab until the player explicitly retries UGA. */
const fallbackStorage = createMemoryStorage();
const fallbackScreens = [];
const fallbackReturns = [];
const fallbackHistory = [];
const fallbackContext = {
  console,
  document: { getElementById: () => null, createElement: () => ({}), querySelectorAll: () => [] },
  location: { search: '?galacticFallback=classic', pathname: '/index.html', hash: '', href: '' },
  history: {
    state: null,
    replaceState(_state, _title, url) {
      fallbackHistory.push(url);
      fallbackContext.location.search = '';
      fallbackContext.location.href = url;
    }
  },
  sessionStorage: fallbackStorage,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(0),
  bootConfirmed: true,
  __MF_BUILD_HAS_GALACTIC_EXPLORATION: true,
  PROFILES: { active: profileId },
  META: { settings: {} },
  MAPDEFS: { aelos_north_medium: { region: 'aelos_north', theme: 'verdant' } },
  curMap: 'aelos_north_medium', curRegionId: 'aelos_north', curTheme: 'verdant',
  initAudio() {}, sfx() {}, mfDismissIntroForGalacticRoute() {},
  showFrontScreen(id) { fallbackScreens.push(id); return true; },
  openWarRoom() {
    fallbackScreens.push('renderWarRoom');
    return fallbackContext.showFrontScreen('warScr');
  },
  mfOpenExploration(view) { fallbackReturns.push(view); return Promise.resolve(true); }
};
fallbackContext.window = fallbackContext;
vm.createContext(fallbackContext);
vm.runInContext(source, fallbackContext, { filename: 'src/galactic-operations.js#classic-fallback' });
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(fallbackContext.__MF_GALACTIC_BRIDGE.status, 'classic-fallback-war-room');
assert.equal(fallbackContext.__MF_GALACTIC_BRIDGE.classicFallbackActive, true);
assert.equal(fallbackStorage.getItem('massfront.galactic.classic-fallback.v1'), '1');
assert.deepEqual(fallbackHistory, ['/index.html']);
assert.deepEqual(fallbackScreens, ['renderWarRoom', 'warScr']);
fallbackContext.showFrontScreen('startScreen');
assert.deepEqual(fallbackScreens, ['renderWarRoom', 'warScr', 'startScreen'],
  'the emergency latch must keep ordinary Classic navigation inside the base game');
assert.deepEqual(fallbackReturns, []);
assert.equal(fallbackContext.__MF_GALACTIC_BRIDGE.clearClassicFallback(), true);
assert.equal(fallbackContext.__MF_GALACTIC_BRIDGE.classicFallbackActive, false);
fallbackContext.showFrontScreen('warScr');
await new Promise(resolve => setTimeout(resolve, 0));
assert.deepEqual(fallbackReturns, ['campaign_hub'], 'an explicit UGA retry must restore strategic-home interception');

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const hudflow = fs.readFileSync(new URL('../src/ui/hudflow.js', import.meta.url), 'utf8');
const intro = fs.readFileSync(new URL('../src/intro.js', import.meta.url), 'utf8');
const launcher = fs.readFileSync(new URL('../src/launcher.js', import.meta.url), 'utf8');
const meta = fs.readFileSync(new URL('../src/game/meta.js', import.meta.url), 'utf8');
const responsiveVerifier = fs.readFileSync(new URL('../modules/space_exploration/tools/verify-responsive-interface.mjs', import.meta.url), 'utf8');
/* The primary action is DEPLOY MASSFRONT, the label the owner concept uses.
   What this guards is not the wording but the claim: galaxyui.js writes this
   button first and said it opened the war table, which is not where it goes.
   hudflow.js runs later and therefore owns both the label and an accurate
   aria-label. Pinning the exact words is what made a legitimate copy change
   fail here before, so the semantic guard is its own assertion. */
assert.match(html, /id="startBtn"[^>]*>DEPLOY MASSFRONT <i class="ctaChev"/);
assert.match(hudflow, /start\.innerHTML='DEPLOY MASSFRONT <i class="ctaChev"/,
  'the late home-chrome takeover must own the label, not leave galaxyui to win');
assert.match(hudflow, /start\.setAttribute\('aria-label','Deploy: open the Galactic command shell'\)/);
assert.doesNotMatch(hudflow, /aria-label','[^']*war table/i,
  'the primary action enters the Galactic command shell; it must not promise the war table');
assert.match(main, /mfOpenExploration\('campaign_hub',\{explicitRetry:true,launchButtonId:'startBtn'\}\)/,
  'START must enter the stable Galactic home; orbital travel requires deliberate Depart');
assert.match(main, /mfOpenExploration\('campaign_hub',\{explicitRetry:true\}\)/,
  'the visible UGA Command control must be an explicit retry that can leave Classic fallback');
assert.match(main, /options&&options\.explicitRetry===true[\s\S]*?clearClassicFallback\(\);[\s\S]*?location\.href=packUrl/,
  'the Classic latch must clear only after UGA ticket and mount preparation succeed');
assert.match(main, /if\(!opened\)openLegacyWarRoom\(\)/, 'packaged build must keep the installed War Room fallback');
assert.match(main, /window\.openWarRoom=\(\)=>\{[\s\S]*?renderWarRoom[\s\S]*?showFrontScreen\('warScr'\)/,
  'the base game must expose one non-rewarding real War Room route to the secured Galactic adapter');
assert.match(source, /if\(window\.__MF_COMMISSIONING_RETURN_ACTIVE__!==true&&!classicFallbackOn\(\)&&currentFlagOn\(\)&&\(id==='startScreen'\|\|id==='warScr'\)\)/,
  'legacy home exits must return to Galactic Command except during a latched emergency Classic session');
assert.match(source, /if\(!baseRouteTargetReady\(request\.routeId\)\)\{setTimeout\(routeTick,50\);return;\}/,
  'secured onboarding routes must wait for late-loaded target owners before nonce consumption');
assert.match(source, /if\(routeId==='mode-standard'\)return typeof openSkirmishSetup==='function'/,
  'secured Standard routes must wait for the public setup owner before consuming their nonce');
assert.match(responsiveVerifier, /page\.click\('\[data-nav="classic"\]'\)/,
  'responsive evidence must invoke the visible Classic navigation control');
assert.match(responsiveVerifier, /page\.waitForSelector\('#warScr', \{ state: 'visible'/,
  'responsive evidence must wait for the real base War Room before capture');
assert.doesNotMatch(responsiveVerifier, /button\[data-district="command"\][\s\S]{0,160}classic-terminal/,
  'responsive evidence must not relabel Command Core as the Classic destination');
for (const [script, functionName] of [[intro, 'galacticMenuRouteLaunch'], [launcher, 'isGalacticReturn']]) {
  const declaration = script.match(new RegExp(`function ${functionName}\\(\\)\\{[\\s\\S]*?\\n  \\}`))?.[0];
  assert.ok(declaration, `${functionName} must remain inspectable`);
  for (const key of ['galacticRoute', 'groundOperation']) {
    const cases = [
      [`?${key}=${nonce}`, true],
      [`?${key}=${'a'.repeat(16)}`, true],
      [`?${key}=${'a'.repeat(128)}`, true],
      [`?${key}=${'a'.repeat(15)}`, false],
      [`?${key}=${'a'.repeat(129)}`, false],
      [`?${key}=${nonce}&extra=1`, false],
      [`?extra=1&${key}=${nonce}`, false],
      [`?${key}=${nonce}&${key}=${nonce}`, false],
      [`?${key}=%61${nonce}`, false],
      [`?${key}=${nonce}/`, false],
      ['', false],
      [`?groundResult=${nonce}`, false]
    ];
    for (const [search, expected] of cases) {
      assert.equal(vm.runInNewContext(`${declaration}; ${functionName}()`, { location: { search } }), expected,
        `${functionName}: only an exact supported opaque bridge query may bypass startup (${search})`);
    }
  }
  for (const [search, expected] of [
    ['?galacticFallback=classic', true],
    ['?galacticFallback=classic&extra=1', false],
    ['?extra=1&galacticFallback=classic', false],
    ['?galacticFallback=Classic', false]
  ]) {
    assert.equal(vm.runInNewContext(`${declaration}; ${functionName}()`, { location: { search } }), expected,
      `${functionName}: only the exact Classic fallback query may bypass startup (${search})`);
  }
  const fallbackSession = { getItem: key => key === 'massfront.galactic.classic-fallback.v1' ? '1' : null };
  assert.equal(vm.runInNewContext(`${declaration}; ${functionName}()`, {
    location: { search: '' }, sessionStorage: fallbackSession
  }), true, `${functionName}: query cleanup must not replay startup over a latched Classic recovery`);
  assert.equal(vm.runInNewContext(`${declaration}; ${functionName}()`, {
    location: { search: '' }, sessionStorage: { getItem: () => null }
  }), false, `${functionName}: an ordinary clean launch must retain its normal startup`);
}
assert.match(launcher, /L\.bypass=isGalacticReturn\(\);if\(L\.bypass\)\{L\.gate=false;L\.passed=true;return;\}/,
  'internal menu and battle handoffs must leave startup before login/update phases can redirect them');
assert.match(intro, /if\(galacticMenuRouteLaunch\(\)\)\{ revealFront\(\); return; \}/,
  'a Galactic submenu return must reveal the base UI without replaying the launch title');
assert.match(intro, /window\.mfDismissIntroForGalacticRoute=dismissIntroForGalacticRoute/);
assert.doesNotMatch(meta, /Side preview only|Does not replace the home menu, START|Open Galactic Campaign Preview|Isolated preview/,
  'settings copy must not describe the integrated strategic layer as a separate preview');

console.log('Galactic Command strategic-home replacement routing: PASS');
