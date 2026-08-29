#!/usr/bin/env node
/* Exact-template RUNTIME probe.

   This is the integration gate. The geometry replica in
   tools/probe-exact-template-placement.mjs cannot prove planDistricts.
   This file boots the manifest-ordered classic runtime in an isolated
   hardware-WebGL Chromium, then calls the real applyTheme/newSkirmish path
   (buildTerrain -> planDistricts -> stampSite) with SITE_TPL_FORCE and reads
   SITE_STAMP afterwards.

     node tools/probe-exact-template-runtime.mjs

   Fail-closed on: software GPU, missing SITE_STAMP wrap, FORCE pin dropping
   other classes, required-plot rollback, silently dropped required sites,
   production selector drift when FORCE is null, non-deterministic SITE_STAMP
   hashes, page/console/WebGL errors, or source/runtime fingerprint mismatch.
   Environmental candidate exhaustion (arena/spawn/water/res/near with plots=0)
   is recorded honestly and is not treated as a plaza-gap failure. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser, assertPwBrowserOwnership, pwBrowserEvidence, recordPwBrowserGpu } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { startStaticServer } from './perf-lab/perf-probe-runner.mjs';
import { parseMapDefs } from './mapgen/site-maps.mjs';
import { loadSiteTemplates, templateAppliesToMap, classRequestKey } from './mapgen/stamp-geometry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp', 'site-template-runtime');
mkdirSync(OUT, { recursive: true });
const V1_ONLY = process.env.MF_STAGE9_V1_ONLY === '1';
const V1_MAP_FILTER = process.env.MF_STAGE9_MAP || '';
let recoveryReloadE2E = { status: 'SKIP', reason: 'runs only in the unfiltered MF_STAGE9_V1_ONLY lane' };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

const SOURCE_PATHS = [
  'assets/data/sitetemplates.js',
  'assets/data/locationgrammar.js',
  'assets/data/sitetemplates-stage9.js',
  'assets/data/locationplans.js',
  'src/engine/gl.js',
  'src/engine/worldsites.js',
  'src/game/sim.js',
  'src/main.js',
  'src/session.js',
  'boot.js',
  'assets/data/manifest.json',
  'tools/probe-exact-template-runtime.mjs'
];
const sourceFiles = SOURCE_PATHS.map(path => {
  const bytes = readFileSync(join(ROOT, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
});
const sourceSetSha256 = sha256(sourceFiles.map(F => `${F.path}:${F.sha256}`).join('\n'));

const tplSrc = read('assets/data/sitetemplates.js');
const worldSrc = read('src/engine/worldsites.js');
const glSrc = read('src/engine/gl.js');
const templates = loadSiteTemplates(tplSrc);
for (const id of Object.keys(templates.SITE_TPL)) templates.SITE_TPL[id].id = id;
const maps = parseMapDefs(glSrc);
const ids = Object.keys(templates.SITE_TPL);
const v1Cases = [
  { map: 'pyraeth_caldera_medium', expected: { city: 2 },
    templates: ['city_pyraeth_caldera_crucible_v1','city_pyraeth_caldera_crucible_v1'] },
  { map: 'nordhall_frost_medium', expected: { outpost: 1, relic: 1 },
    templates: ['outpost_nordhall_frost_fault_gate_v1','relic_nordhall_frost_thermal_well_v1'] },
  { map: 'pyraeth_flats_medium', expected: { spaceport: 2, derelict: 1 },
    templates: ['spaceport_pyraeth_flats_blackwind_v1','spaceport_pyraeth_flats_blackwind_v1',
      'derelict_pyraeth_flats_buried_logistics_v1'] },
  { map: 'aelos_basin_medium', expected: { colony: 2, refinery: 2 },
    templates: ['colony_aelos_basin_canal_v1','colony_aelos_basin_canal_v1',
      'refinery_aelos_basin_quay_v1','refinery_aelos_basin_quay_v1'] },
  { map: 'aelos_coast_medium', expected: { base: 2 },
    templates: ['base_aelos_coast_admiralty_v1','base_aelos_coast_admiralty_v1'] },
  { map: 'vespera_refinery_medium', expected: { ruin: 1, brood: 2 },
    templates: ['ruin_vespera_refinery_megaforge_v1','brood_vespera_refinery_matrix_core_v1',
      'brood_vespera_refinery_matrix_core_v1'] }
].filter(C => !V1_MAP_FILTER || C.map === V1_MAP_FILTER);
const v1Maps = new Set(v1Cases.map(C => C.map));

const cases = [];
for (const map of maps) {
  if (v1Maps.has(map.id)) continue;
  for (const id of ids) {
    const T = templates.SITE_TPL[id];
    if (!templateAppliesToMap(T, map, { vm: templates })) continue;
    cases.push({
      map: map.id, seed: map.seed, template: id, class: T.class, name: T.name,
      climate: map.climate, planet: map.planet, faction: map.faction,
      requested: map[classRequestKey(T.class)] | 0, force: id
    });
  }
}
const productionCases = [
  { map: 'aelos_north_medium', template: 'city_brutalist_grid', class: 'city', name: 'BRUTALIST PREFECTURE', force: null },
  { map: 'pyraeth_crater_small', template: 'dome_cluster', class: 'dome', name: 'PRESSURE DOME COURT', force: null }
].filter(C => maps.some(M => M.id === C.map));
const incompatibleCases = [
  { map: 'aelos_ridge_medium', class: 'city', name: null, template: null, force: null, tag: 'incompatible', forbidden: ['BRUTALIST PREFECTURE', 'WALLED TOWN'] },
  { map: 'aelos_ridge_large', class: 'city', name: null, template: null, force: null, tag: 'incompatible', forbidden: ['BRUTALIST PREFECTURE', 'WALLED TOWN'] },
  { map: 'aelos_coast_large', class: 'spaceport', name: null, template: null, force: null, tag: 'incompatible', forbidden: ['ORBITAL APRON'] }
].filter(C => maps.some(M => M.id === C.map));

function mapRequest(C) {
  const map = maps.find(M => M.id === C.map);
  return map ? (map[classRequestKey(C.class)] | 0) : 1;
}
const legacyCases = [
  ...productionCases.map(C => ({ ...C, requested: mapRequest(C), tag: 'production' })),
  ...incompatibleCases.map(C => ({ ...C, requested: mapRequest(C) })),
  ...cases.map(C => ({ ...C, tag: 'force' }))
];
const allCases = V1_ONLY ? [] : legacyCases;

const FAIL = [], WARN = [];
const pageErrors = [], consoleErrors = [];
let fatal = null, gpu = null, runtimeUrl = null, browserCleanup = null, browserEvidence = null;
let deepChecks = { skipped: true };
const results = [], v1Results = [];

function classify(stamp, expectedName, requested, className) {
  const rej = stamp?.rej || {};
  const plots = rej.plots | 0;
  const env = (rej.arena | 0) + (rej.spawn | 0) + (rej.water | 0) + (rej.res | 0) + (rej.near | 0);
  const fail = (stamp?.fails || []).find(f => f.class === className);
  const telemReason = (stamp?.telem?.reason && stamp.telem.reason[className]) || (fail && fail.reason) || '';
  const got = expectedName
    ? (stamp?.zones || []).filter(z => z.name === expectedName).length
    : ((stamp?.realized && stamp.realized[className]) | 0);
  if (got >= requested && requested > 0) return { kind: plots ? 'ok-with-retries' : 'ok', got, requested, plots, env, rej, reason: fail?.reason || '' };
  if (telemReason === 'INCOMPATIBLE' || fail?.reason === 'INCOMPATIBLE')
    return { kind: 'INCOMPATIBLE', got, requested, plots, env, rej, reason: 'INCOMPATIBLE' };
  if (telemReason === 'TEMPLATE_MISSING' || fail?.reason === 'TEMPLATE_MISSING')
    return { kind: 'TEMPLATE_MISSING', got, requested, plots, env, rej, reason: 'TEMPLATE_MISSING' };
  if (telemReason === 'REQUIRED_PLOT_ROLLBACK' || (plots > 0 && ((stamp?.telem?.hits && stamp.telem.hits[className]) | 0) > 0))
    return { kind: 'REQUIRED_PLOT_ROLLBACK', got, requested, plots, env, rej, reason: 'REQUIRED_PLOT_ROLLBACK' };
  if (telemReason === 'ENVIRONMENTAL_EXHAUSTION' || env > 0)
    return { kind: 'ENVIRONMENTAL_EXHAUSTION', got, requested, plots, env, rej, reason: 'ENVIRONMENTAL_EXHAUSTION' };
  if (plots > 0) return { kind: 'REQUIRED_PLOT_ROLLBACK', got, requested, plots, env, rej, reason: 'REQUIRED_PLOT_ROLLBACK' };
  return { kind: 'silent-drop', got, requested, plots, env, rej, reason: fail?.reason || '' };
}

function requiredMissing(stamp, T) {
  const required = (T.plots || []).filter(p => p.required);
  const missing = [];
  const zones = (stamp?.zones || []).filter(z => z.name === T.name);
  for (const Z of zones) {
    for (const req of required) {
      if (!(Z.plots || []).some(p => p.kind === req.kind && (!req.role || p.role === req.role)))
        missing.push({ zone: Z.i, kind: req.kind, role: req.role || null });
    }
  }
  return missing;
}

const server = await startStaticServer();
runtimeUrl = server.url;
let browser = null;
try {
  browser = await launchPwBrowser({ ownershipMode: 'isolated', headless: true, args: ['--mute-audio'] });
  await assertPwBrowserOwnership(browser);
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1
  });
  page.setDefaultTimeout(180000);
  page.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ text: m.text(), location: m.location() }); });
  await page.context().route('**/*', async route => {
    const request = route.request();
    let u; try { u = new URL(request.url()); } catch { return route.abort('blockedbyclient'); }
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.hostname === '127.0.0.1') return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('massfront_offline', '1');
      localStorage.setItem('mf_auth_gate_v1', '1');
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
    } catch {}
  });
  await page.goto(`${server.url}?sitetemplateruntime=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() =>
    typeof newSkirmish === 'function' && typeof applyTheme === 'function'
    && typeof SITE_TPL === 'object' && typeof siteTemplateFor === 'function'
    && typeof SITE_STAMP === 'object' && typeof planDistricts === 'function'
    && typeof gl !== 'undefined' && !!gl, null, { timeout: 120000 });
  gpu = await assertHardwareGpu(page);
  recordPwBrowserGpu(browser, gpu);

  const boot = await page.evaluate(() => {
    if (typeof siteStampInstall === 'function') siteStampInstall();
    const streets = (SITE_TPL.city_brutalist_grid && SITE_TPL.city_brutalist_grid.streets) || [];
    const domeStreets = (SITE_TPL.dome_cluster && SITE_TPL.dome_cluster.streets) || [];
    SITE_TPL_FORCE = 'city_brutalist_grid';
    const cityPin = siteTemplateFor('city', () => 0);
    const outpostWhilePinned = siteTemplateFor('outpost', () => 0);
    SITE_TPL_FORCE = null;
    const civicCity = [];
    curMap = 'aelos_north_medium';
    for (let i = 0; i < 16; i++) {
      const T = siteTemplateFor('city', () => (i + 0.5) / 16);
      if (T) civicCity.push(T.name);
    }
    const duskDome = [];
    curMap = 'pyraeth_crater_small';
    for (let i = 0; i < 16; i++) {
      const T = siteTemplateFor('dome', () => (i + 0.5) / 16);
      if (T) duskDome.push(T.name);
    }
    SITE_TPL_FORCE = null;
    return {
      wrap: !!(planDistricts && planDistricts.__mfSiteStampWrap),
      stampVer: SITE_STAMP.ver | 0,
      forceIsNull: SITE_TPL_FORCE == null,
      cityPin: cityPin && cityPin.name,
      outpostWhilePinned: outpostWhilePinned && outpostWhilePinned.name,
      civicCity: [...new Set(civicCity)],
      duskDome: [...new Set(duskDome)],
      prefectureStreets: streets,
      domeStreets,
      kit: Object.keys(typeof WORLD_KIT === 'object' ? WORLD_KIT : {}),
      glError: gl.getError()
    };
  });

  if (!boot.wrap) FAIL.push('planDistricts is not wrapped by siteStampInstall');
  if (boot.stampVer !== 4) FAIL.push(`SITE_STAMP.ver is ${boot.stampVer}, expected 4`);
  if (boot.cityPin !== 'BRUTALIST PREFECTURE') FAIL.push(`FORCE pin failed: ${boot.cityPin}`);
  if (!boot.outpostWhilePinned) FAIL.push('SITE_TPL_FORCE still returns null for other classes (silent outpost drop)');
  if (!boot.forceIsNull) FAIL.push('SITE_TPL_FORCE was not restored to null after the selector snapshot');
  if (!boot.civicCity.includes('BRUTALIST PREFECTURE')) FAIL.push(`production civic city pool missing prefecture: ${boot.civicCity.join(',')}`);
  if (boot.civicCity.includes('WALLED TOWN')) FAIL.push('production civic city pool leaked dusk walled town');
  if (!boot.duskDome.includes('PRESSURE DOME COURT')) FAIL.push(`production dusk dome pool missing court: ${boot.duskDome.join(',')}`);
  const plaza = JSON.stringify(boot.prefectureStreets);
  if (!plaza.includes('-100') || !plaza.includes('100')) FAIL.push(`runtime prefecture streets lack plaza gap: ${plaza}`);
  const domePlaza = JSON.stringify(boot.domeStreets);
  if (!domePlaza.includes('-90') || !domePlaza.includes('90')) FAIL.push(`runtime dome streets lack plaza gap: ${domePlaza}`);
  if (boot.glError) FAIL.push(`boot WebGL error ${boot.glError}`);
  if (!boot.wrap) throw new Error('SITE_STAMP wrap missing; aborting runtime sweep');

  async function runCase(C) {
    return page.evaluate(({ mapId, forceId, expectedName, requested, className }) => {
      SITE_TPL_FORCE = forceId;
      if (typeof syncBattlefieldFromMap === 'function') {
        const ok = syncBattlefieldFromMap(mapId);
        if (!ok) {
          curMap = mapId;
          const D = MAPDEFS[mapId];
          if (D && D.theme) curTheme = D.theme;
          if (D && D.region) curRegionId = D.region;
          if (D && D.size && typeof battlefieldPresetKey === 'function') battlefieldPreset = battlefieldPresetKey(D.size);
        }
      } else {
        curMap = mapId;
      }
      builtMap = '';
      builtTheme = '';
      mmDirty = true;
      difficulty = 0; wcChoice = 0; infestationOn = false;
      try { if (typeof hideFrontScreens === 'function') hideFrontScreens(); } catch {}
      for (const overlayId of ['apOverlay', 'loadScr', 'mfUpdateOverlay', 'authPortal']) {
        const e = document.getElementById(overlayId); if (e) e.style.display = 'none';
      }
      applyTheme();
      newSkirmish();
      paused = true;
      const stamp = {
        map: SITE_STAMP.map, requested: { ...SITE_STAMP.requested }, realized: { ...SITE_STAMP.realized },
        fails: SITE_STAMP.fails.slice(), ok: SITE_STAMP.ok, hash: SITE_STAMP.hash,
        rej: SITE_STAMP.rej ? { ...SITE_STAMP.rej } : null,
        telem: SITE_STAMP.telem ? JSON.parse(JSON.stringify(SITE_STAMP.telem)) : null,
        zones: SITE_STAMP.zones.map(z => ({ i: z.i, name: z.name, site: z.site, r: z.r, plots: z.plots }))
      };
      const key = className === 'city' ? 'city' : className === 'dome' ? 'dome' : className;
      const glError = gl.getError();
      SITE_TPL_FORCE = null;
      return {
        curMap, forceAfter: SITE_TPL_FORCE, stamp, glError,
        named: (stamp.zones || []).filter(z => z.name === expectedName).length,
        requestedClass: stamp.requested[key] | 0,
        realizedClass: stamp.realized[key] | 0
      };
    }, {
      mapId: C.map, forceId: C.force, expectedName: C.name || (C.template && templates.SITE_TPL[C.template] && templates.SITE_TPL[C.template].name) || null,
      requested: C.requested,
      className: C.class
    });
  }

  async function runV1Case(C) {
    return page.evaluate(({ mapId, sentinel }) => {
      const selectorBase = siteTemplateFor;
      let selectorCalls = 0;
      siteTemplateFor = function () { selectorCalls++; return selectorBase.apply(this, arguments); };
      SITE_TPL_FORCE = sentinel;
      SITE_TPL_QUERY.force = sentinel;
      try {
        if (typeof syncBattlefieldFromMap === 'function') {
          const ok = syncBattlefieldFromMap(mapId);
          if (!ok) {
            curMap = mapId;
            const D = MAPDEFS[mapId];
            if (D && D.theme) curTheme = D.theme;
            if (D && D.region) curRegionId = D.region;
          }
        } else curMap = mapId;
        builtMap = ''; builtTheme = ''; mmDirty = true;
        difficulty = 0; wcChoice = 0; infestationOn = false;
        try { if (typeof hideFrontScreens === 'function') hideFrontScreens(); } catch {}
        for (const overlayId of ['apOverlay', 'loadScr', 'mfUpdateOverlay', 'authPortal']) {
          const e = document.getElementById(overlayId); if (e) e.style.display = 'none';
        }
        /* applyTheme owns final spawn normalization. Leaving the launch order
           unassisted here verifies that production boundary, not a test-only
           preparation path. */
        applyTheme();
        newSkirmish();
        paused = true;
        const stamp = JSON.parse(JSON.stringify(SITE_STAMP));
        const traversal = (() => {
          const missing = [];
          for (const [name, ok] of [
            ['computeField', typeof computeField === 'function'],
            ['mfMoveBlockersDirty', typeof mfMoveBlockersDirty === 'function'],
            ['mfNavClearanceGrid', typeof mfNavClearanceGrid === 'function'],
            ['MF_NAV_CLEARANCE', typeof MF_NAV_CLEARANCE === 'object'],
            ['MF_NAV_CLEARANCE_COST', typeof MF_NAV_CLEARANCE_COST === 'object'],
            ['DIRX/DIRY', typeof DIRX === 'object' && typeof DIRY === 'object'],
            ['battlefieldContains', typeof battlefieldContains === 'function']
          ]) if (!ok) missing.push(name);
          const fnv = value => {
            let h = 2166136261;
            for (let i = 0; i < value.length; i++) {
              h ^= value.charCodeAt(i); h = Math.imul(h, 16777619);
            }
            return (h >>> 0).toString(16).padStart(8, '0');
          };
          if (missing.length) return {
            ok: false, code: 'NAV_API_MISSING', missing, clearance: 'infantry',
            sites: [], signature: fnv(JSON.stringify(['NAV_API_MISSING', missing]))
          };

          /* Generated streets are the authored entrances, while PASS alone
             does not include live relic blocks and large props. Rebuild the
             authoritative clearance mask after newSkirmish instantiated them. */
          mfMoveBlockersDirty();
          const token = MF_NAV_CLEARANCE.infantry;
          const need = MF_NAV_CLEARANCE_COST[token];
          const clear = mfNavClearanceGrid(false);
          const side = PGS, total = side * side, cellWorld = MAP / side;
          const pass = c => c >= 0 && c < total && clear[c] > need;
          const cellAt = (x, y) => {
            const gx = Math.max(0, Math.min(side - 1, Math.floor(x / cellWorld)));
            const gy = Math.max(0, Math.min(side - 1, Math.floor(y / cellWorld)));
            return gy * side + gx;
          };
          const center = c => ({
            x: (c % side + .5) * cellWorld,
            y: ((c / side | 0) + .5) * cellWorld
          });
          const trace = (dirs, start, goal, Z, innerRadius) => {
            let c = start, steps = 0, minClearance = 65535, h = 2166136261;
            let entered = false;
            const seen = new Set();
            for (let guard = 0; guard <= total; guard++) {
              if (!pass(c)) return { ok: false, reason: 'blocked-cell', cell: c };
              minClearance = Math.min(minClearance, clear[c]);
              h ^= c; h = Math.imul(h, 16777619);
              const P = center(c);
              if (Math.hypot(P.x - Z.x, P.y - Z.y) <= innerRadius) entered = true;
              if (c === goal) return {
                ok: entered, reason: entered ? '' : 'did-not-enter', steps,
                minClearance, traceHash: (h >>> 0).toString(16).padStart(8, '0')
              };
              if (seen.has(c)) return { ok: false, reason: 'loop', cell: c };
              seen.add(c);
              const k = dirs[c];
              if (k < 0 || k >= 8) return { ok: false, reason: 'no-direction', cell: c };
              const x = c % side, y = c / side | 0;
              const nx = x + DIRX[k], ny = y + DIRY[k];
              if (nx < 0 || ny < 0 || nx >= side || ny >= side)
                return { ok: false, reason: 'out-of-grid', cell: c };
              if ((k & 1) && (!pass(y * side + nx) || !pass(ny * side + x)))
                return { ok: false, reason: 'corner-cut', cell: c };
              c = ny * side + nx; steps++;
            }
            return { ok: false, reason: 'trace-limit', steps };
          };

          const spawnFields = skirmishSpawnPoints().map(S => {
            const requested = cellAt(S.x, S.y), dirs = computeField(S.x, S.y, false, token);
            return { zone: S.zone, kind: S.kind, requested, goal: dirs.mfGoal, dirs };
          });
          const sites = [];
          for (const SZ of stamp.zones || []) {
            const Z = cityZones[SZ.i];
            if (!Z || !Z.siteId || Z.siteId !== SZ.siteId) {
              sites.push({ siteId: SZ.siteId || '', template: SZ.template || '', ok: false,
                reason: 'live-zone-mismatch', innerCandidates: 0, outerCandidates: 0 });
              continue;
            }
            const span = +(Z.span || Z.r || SZ.span || SZ.r || 0);
            const innerRadius = span * .60, outerMin = span * .82;
            const outerMax = span + Math.max(cellWorld * 3, 24);
            const innerByCell = new Map();
            const addInner = (x, y) => {
              const c = cellAt(x, y); if (!pass(c) || innerByCell.has(c)) return;
              const P = center(c), d2 = (P.x - Z.x) ** 2 + (P.y - Z.y) ** 2;
              if (d2 <= innerRadius * innerRadius)
                innerByCell.set(c, { c, d2, clearance: clear[c] });
            };
            for (const S of cityStreets) {
              if (!S || S[5] !== SZ.i) continue;
              const dx = S[2] - S[0], dy = S[3] - S[1];
              const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (cellWorld * .5)));
              for (let n = 0; n <= steps; n++) {
                const t = n / steps; addInner(S[0] + dx * t, S[1] + dy * t);
              }
            }
            const inner = Array.from(innerByCell.values()).sort((A, B) =>
              A.d2 - B.d2 || B.clearance - A.clearance || A.c - B.c);
            const outer = [];
            const gx0 = Math.max(0, Math.floor((Z.x - outerMax) / cellWorld));
            const gx1 = Math.min(side - 1, Math.floor((Z.x + outerMax) / cellWorld));
            const gy0 = Math.max(0, Math.floor((Z.y - outerMax) / cellWorld));
            const gy1 = Math.min(side - 1, Math.floor((Z.y + outerMax) / cellWorld));
            for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
              const c = gy * side + gx; if (!pass(c)) continue;
              const P = center(c), d2 = (P.x - Z.x) ** 2 + (P.y - Z.y) ** 2;
              if (d2 < outerMin * outerMin || d2 > outerMax * outerMax ||
                  !battlefieldContains(P.x, P.y, 0)) continue;
              outer.push({ c, d2 });
            }

            const notes = [], note = row => { if (notes.length < 6) notes.push(row); };
            let route = null;
            for (let ii = 0; ii < Math.min(3, inner.length) && !route; ii++) {
              const target = inner[ii], P = center(target.c);
              const dirs = computeField(P.x, P.y, false, token);
              if (dirs.mfGoal !== target.c) {
                note({ target: target.c, reason: 'goal-relocated', goal: dirs.mfGoal });
                continue;
              }
              const starts = outer.filter(O => O.c === dirs.mfGoal || dirs[O.c] < 8)
                .sort((A, B) => {
                  const AP = center(A.c), BP = center(B.c);
                  const ad = (AP.x - P.x) ** 2 + (AP.y - P.y) ** 2;
                  const bd = (BP.x - P.x) ** 2 + (BP.y - P.y) ** 2;
                  return ad - bd || A.c - B.c;
                });
              if (!starts.length) { note({ target: target.c, reason: 'no-reachable-outer' }); continue; }
              for (let oi = 0; oi < Math.min(8, starts.length); oi++) {
                const R = trace(dirs, starts[oi].c, target.c, Z, innerRadius);
                if (R.ok) {
                  route = { target: target.c, start: starts[oi].c, steps: R.steps,
                    minClearance: R.minClearance, traceHash: R.traceHash };
                  break;
                }
                note({ target: target.c, start: starts[oi].c, reason: R.reason });
              }
            }
            const spawnConnectivity = spawnFields.map(F => {
              let reachableOuter = 0;
              for (const O of outer) if (O.c === F.goal || F.dirs[O.c] < 8) reachableOuter++;
              return { zone: F.zone, kind: F.kind, requested: F.requested, goal: F.goal,
                exactGoal: F.goal === F.requested, reachableOuter };
            });
            sites.push({
              siteId: Z.siteId, template: SZ.template, ok: !!route,
              reason: route ? '' : (!inner.length ? 'no-passable-inner-street' :
                (!outer.length ? 'no-passable-outer-annulus' : 'no-bounded-route')),
              innerCandidates: inner.length, outerCandidates: outer.length,
              route, attempts: route ? undefined : notes, spawnConnectivity
            });
          }
          const compact = sites.map(S => [S.siteId, S.template, S.ok ? 1 : 0,
            S.innerCandidates, S.outerCandidates, S.route ? S.route.target : -1,
            S.route ? S.route.start : -1, S.route ? S.route.steps : -1,
            S.route ? S.route.minClearance : -1, S.route ? S.route.traceHash : '']);
          return { ok: sites.length === (stamp.zones || []).length && sites.every(S => S.ok),
            code: sites.every(S => S.ok) ? '' : 'SITE_TRAVERSAL_FAILED', clearance: 'infantry',
            clearanceThreshold: need, spawnConnectivityGating: false,
            sites, signature: fnv(JSON.stringify(compact)) };
        })();
        const requiredMissing = [];
        for (const Z of stamp.zones || []) {
          const T = SITE_TPL[Z.template];
          if (!T) { requiredMissing.push({ template: Z.template, reason: 'template-missing' }); continue; }
          const templatePlots = T.plots || [];
          for (let pi = 0; pi < templatePlots.length; pi++) {
            const P = templatePlots[pi];
            if (P.required && !(Z.plots || []).some(Q => Q.templatePlot === pi))
              requiredMissing.push({ template: Z.template, templatePlot: pi, kind: P.kind, role: P.role || null });
          }
        }
        const starts = skirmishSpawnPoints().map(S => ({ zone: S.zone, x: S.x, y: S.y, kind: S.kind }));
        const resources = {
          topologyKey: typeof mfWorldTopologyKey === 'function' ? mfWorldTopologyKey() : '',
          spread: battlefieldPresetDef().spread || 1,
          starts,
          mass: deposits.map(D => ({ x: D.x, y: D.y, rich: !!D.rich, starter: D.starter || '' })),
          energy: geysers.map(G => ({ x: G.x, y: G.y, starter: G.starter || '' }))
        };
        const instances = {
          plots: relics.filter(R => R.id).map(R => ({ id: R.id, templatePlot: R.templatePlot, x: R.x, y: R.y })),
          props: []
            .concat(tanks.filter(R => R.id).map(R => ({ id: R.id, type: 'tank', x: R.x, y: R.y })))
            .concat(crates.filter(R => R.id).map(R => ({ id: R.id, type: 'crate', x: R.x, y: R.y })))
            .concat(rocks.filter(R => R.id).map(R => ({ id: R.id, type: 'rock', x: R.x, y: R.y })))
            .concat(trees.filter(R => R.id).map(R => ({ id: R.id, type: 'flora', x: R.x, y: R.y })))
        };
        return {
          curMap, stamp, selectorCalls, requiredMissing,
          forceDirectAfter: SITE_TPL_FORCE, forceQueryAfter: SITE_TPL_QUERY.force,
          resourceRelocation: window.__mfResourceRelocation ? { ...window.__mfResourceRelocation } : null,
          resources, instances, traversal,
          propPlan: typeof sitePropPlan !== 'undefined' ? sitePropPlan.map(R => ({ ...R })) : [],
          expectedPropIds: typeof sessExpectedSitePropIds === 'function' ? sessExpectedSitePropIds() : [],
          glError: gl.getError()
        };
      } catch (error) {
        return {
          curMap, selectorCalls, threw: {
            message: String(error && error.message || error), code: error && error.code || '',
            locationPlan: error && error.locationPlan ? JSON.parse(JSON.stringify(error.locationPlan)) : null
          },
          stamp: JSON.parse(JSON.stringify(SITE_STAMP)),
          forceDirectAfter: SITE_TPL_FORCE, forceQueryAfter: SITE_TPL_QUERY.force,
          resourceRelocation: window.__mfResourceRelocation ? { ...window.__mfResourceRelocation } : null,
          propPlan: typeof sitePropPlan !== 'undefined' ? sitePropPlan.map(R => ({ ...R })) : [],
          requiredMissing: [], glError: gl.getError()
        };
      } finally {
        siteTemplateFor = selectorBase;
        SITE_TPL_FORCE = null;
        SITE_TPL_QUERY.force = null;
      }
    }, { mapId: C.map, sentinel: 'city_pyraeth_caldera_crucible_v1' });
  }

  for (let i = 0; i < allCases.length; i++) {
    const C = allCases[i];
    const T = C.template ? templates.SITE_TPL[C.template] : null;
    const label = `${C.map}/${C.tag}/${C.template || C.class}`;
    process.stdout.write(`[${i + 1}/${allCases.length + v1Cases.length}] ${C.tag} ${C.map} ${C.template || C.class}\n`);
    let a, b;
    try {
      a = await runCase(C);
      b = await runCase(C);
    } catch (e) {
      FAIL.push(`${label}: evaluate threw ${e && e.message || e}`);
      results.push({ ...C, status: 'THROW', error: String(e && e.stack || e) });
      continue;
    }
    if (a.forceAfter != null) FAIL.push(`${label}: SITE_TPL_FORCE leaked ${a.forceAfter}`);
    if (a.stamp.hash !== b.stamp.hash)
      FAIL.push(`${label}: SITE_STAMP.hash mismatch ${a.stamp.hash} vs ${b.stamp.hash}`);
    if (a.glError) FAIL.push(`${label}: WebGL error ${a.glError}`);
    if (b.glError) FAIL.push(`${label}: WebGL error on repeat ${b.glError}`);
    const verdict = classify(a.stamp, C.name || (T && T.name) || null, C.requested, C.class);
    const missing = (T && verdict.got > 0) ? requiredMissing(a.stamp, T) : [];
    const zoneNames = (a.stamp.zones || []).map(z => z.name);
    const leaked = (C.forbidden || []).filter(n => zoneNames.includes(n));
    if (missing.length) FAIL.push(`${label}: required plots missing ${JSON.stringify(missing)}`);
    if (verdict.kind === 'REQUIRED_PLOT_ROLLBACK' || verdict.kind === 'required-plot')
      FAIL.push(`${label}: required-plot rollback plots=${verdict.plots} got ${verdict.got}/${verdict.requested} rej=${JSON.stringify(verdict.rej)}`);
    if (C.tag === 'incompatible') {
      if (leaked.length) FAIL.push(`${label}: incompatible location received ordinary template ${leaked.join(',')}`);
      if (verdict.kind !== 'INCOMPATIBLE' && verdict.kind !== 'TEMPLATE_MISSING')
        FAIL.push(`${label}: expected typed INCOMPATIBLE/TEMPLATE_MISSING, got ${verdict.kind} reason=${verdict.reason}`);
      if ((a.stamp.realized[C.class] | 0) > 0)
        FAIL.push(`${label}: realized ${C.class}=${a.stamp.realized[C.class]} on an incompatible request`);
    } else {
      if (verdict.kind === 'silent-drop')
        FAIL.push(`${label}: silent drop got ${verdict.got}/${verdict.requested} with plots=0 env=0`);
      if (verdict.kind === 'ENVIRONMENTAL_EXHAUSTION' || verdict.kind === 'environmental')
        WARN.push(`${label}: environmental miss got ${verdict.got}/${verdict.requested} rej=${JSON.stringify(verdict.rej)}`);
      if (C.tag === 'production' && verdict.got < 1 && verdict.kind !== 'ENVIRONMENTAL_EXHAUSTION' && verdict.kind !== 'environmental')
        FAIL.push(`${C.map} production selector did not realize ${T && T.name}`);
    }
    results.push({
      ...C, status: verdict.kind, reason: verdict.reason || '',
      hash: a.stamp.hash, hash2: b.stamp.hash,
      requested: C.requested, realized: verdict.got, plots: verdict.plots, env: verdict.env,
      rej: verdict.rej, stampOk: a.stamp.ok, missingRequired: missing.length,
      telem: a.stamp.telem || null, fails: a.stamp.fails || []
    });
  }

  const v1Keys = ['city','colony','outpost','base','refinery','relic','ruin','spaceport','derelict','brood'];
  for (let i = 0; i < v1Cases.length; i++) {
    const C = v1Cases[i], label = `${C.map}/v1`;
    process.stdout.write(`[${allCases.length + i + 1}/${allCases.length + v1Cases.length}] v1 ${C.map}\n`);
    let a, b;
    try { a = await runV1Case(C); b = await runV1Case(C); }
    catch (e) {
      FAIL.push(`${label}: evaluate threw ${e && e.message || e}`);
      v1Results.push({ ...C, status: 'THROW', error: String(e && e.stack || e) });
      continue;
    }
    if (a.threw || b.threw) {
      const detail = a.threw || b.threw;
      FAIL.push(`${label}: ${detail.code || 'THROW'} ${JSON.stringify(detail.locationPlan || {})}`);
      v1Results.push({ ...C, status: 'THROW', error: detail });
      continue;
    }
    const problems = [];
    if (a.stamp.ver !== 4) problems.push(`stamp-ver-${a.stamp.ver}`);
    if (!a.stamp.ok || (a.stamp.fails || []).length) problems.push('stamp-failed');
    if (!a.stamp.plan || a.stamp.plan.status !== 'FULL_V1') problems.push('not-full-v1');
    if (!a.stamp.plan || !/^[0-9a-f]{8}$/.test(a.stamp.plan.planHash || '')) problems.push('plan-hash');
    if (!/^[0-9a-f]+$/.test(a.stamp.realizationHash || '')) problems.push('realization-hash');
    if (a.selectorCalls || b.selectorCalls) problems.push(`selector-calls-${a.selectorCalls}-${b.selectorCalls}`);
    if (a.forceDirectAfter !== 'city_pyraeth_caldera_crucible_v1' ||
        a.forceQueryAfter !== 'city_pyraeth_caldera_crucible_v1') problems.push('force-hooks-mutated');
    if (a.glError || b.glError) problems.push(`gl-${a.glError}-${b.glError}`);
    if (a.requiredMissing.length || b.requiredMissing.length) problems.push('required-plots-missing');
    if (!a.resourceRelocation || a.resourceRelocation.failed)
      problems.push('resource-relocation');
    if (!a.stamp.plan.topologyKey || a.stamp.plan.topologyKey !== a.resources.topologyKey)
      problems.push('topology-key');
    for (const S of a.resources.starts) {
      const mass = a.resources.mass.filter(R => R.starter === S.zone);
      const energy = a.resources.energy.filter(R => R.starter === S.zone);
      if (mass.length !== 3 || energy.length !== 1)
        problems.push(`starter-count-${S.zone}-${mass.length}-${energy.length}`);
      const spread = a.resources.spread;
      for (const R of mass) {
        const d = Math.hypot(R.x - S.x, R.y - S.y);
        if (d < 105 * spread || d > 430 * spread) problems.push(`starter-mass-band-${S.zone}-${d.toFixed(1)}`);
      }
      for (const R of energy) {
        const d = Math.hypot(R.x - S.x, R.y - S.y);
        if (d < 230 * spread || d > 520 * spread) problems.push(`starter-energy-band-${S.zone}-${d.toFixed(1)}`);
      }
    }
    const expectedTotal = Object.values(C.expected).reduce((n, v) => n + v, 0);
    for (const key of v1Keys) {
      const want = C.expected[key] || 0;
      if ((a.stamp.requested[key] | 0) !== want || (a.stamp.realized[key] | 0) !== want)
        problems.push(`${key}-${a.stamp.requested[key] | 0}-${a.stamp.realized[key] | 0}-want-${want}`);
    }
    if ((a.stamp.requested.dome | 0) !== 0 || (a.stamp.realized.dome | 0) !== 0)
      problems.push('legacy-dome-extra');
    const zoneTemplates = (a.stamp.zones || []).map(Z => Z.template);
    if (JSON.stringify(zoneTemplates) !== JSON.stringify(C.templates)) problems.push('template-order');
    if (zoneTemplates.length !== expectedTotal) problems.push(`zone-count-${zoneTemplates.length}`);
    const zoneIds = (a.stamp.zones || []).map(Z => `${Z.requestId}#${Z.instance}`);
    if (zoneIds.some(id => id === '#0') || new Set(zoneIds).size !== zoneIds.length) problems.push('zone-identity');
    const plannedPlotIds = (a.stamp.zones || []).flatMap(Z => (Z.plots || []).map(P => P.id));
    const livePlotIds = a.instances.plots.map(P => P.id);
    if (plannedPlotIds.some(id => !id) || new Set(plannedPlotIds).size !== plannedPlotIds.length ||
        JSON.stringify(plannedPlotIds.slice().sort()) !== JSON.stringify(livePlotIds.slice().sort()))
      problems.push('plot-instance-identity');
    /* The live stable-ID contract includes authored `/prop/` objects plus the
       deterministic district `/loot/` and `/ring-tank/` objects. */
    const plannedPropIds = a.expectedPropIds;
    const livePropIds = a.instances.props.map(P => P.id);
    if (plannedPropIds.some(id => !id) || new Set(plannedPropIds).size !== plannedPropIds.length ||
        JSON.stringify(plannedPropIds.slice().sort()) !== JSON.stringify(livePropIds.slice().sort()))
      problems.push('prop-instance-identity');
    if (!a.traversal || !a.traversal.ok || !b.traversal || !b.traversal.ok)
      problems.push('site-traversal');
    const repeat={plan:[a.stamp.plan.planHash,b.stamp.plan.planHash],
      realization:[a.stamp.realizationHash,b.stamp.realizationHash],hash:[a.stamp.hash,b.stamp.hash],
      zones:[sha256(JSON.stringify(a.stamp.zones)),sha256(JSON.stringify(b.stamp.zones))],
      props:[sha256(JSON.stringify(a.propPlan)),sha256(JSON.stringify(b.propPlan))],
      resources:[sha256(JSON.stringify(a.resources)),sha256(JSON.stringify(b.resources))],
      instances:[sha256(JSON.stringify(a.instances)),sha256(JSON.stringify(b.instances))],
      traversal:[a.traversal && a.traversal.signature,b.traversal && b.traversal.signature]};
    if (repeat.plan[0] !== repeat.plan[1]) problems.push('repeat-plan-drift');
    if (repeat.realization[0] !== repeat.realization[1]) problems.push('repeat-realization-drift');
    if (repeat.hash[0] !== repeat.hash[1]) problems.push('repeat-stamp-drift');
    if (repeat.zones[0] !== repeat.zones[1]) problems.push('repeat-zone-drift');
    if (repeat.props[0] !== repeat.props[1]) problems.push('repeat-prop-drift');
    if (repeat.resources[0] !== repeat.resources[1]) problems.push('repeat-resource-drift');
    if (repeat.instances[0] !== repeat.instances[1]) problems.push('repeat-instance-drift');
    if (repeat.traversal[0] !== repeat.traversal[1]) problems.push('repeat-traversal-drift');
    if (repeat.zones[0] !== repeat.zones[1]) { repeat.zoneA=a.stamp.zones;repeat.zoneB=b.stamp.zones; }
    if (repeat.props[0] !== repeat.props[1]) { repeat.propA=a.propPlan;repeat.propB=b.propPlan; }
    if (repeat.resources[0] !== repeat.resources[1]) { repeat.resourceA=a.resources;repeat.resourceB=b.resources; }
    if (repeat.instances[0] !== repeat.instances[1]) { repeat.instanceA=a.instances;repeat.instanceB=b.instances; }
    if (repeat.traversal[0] !== repeat.traversal[1]) {
      repeat.traversalA=a.traversal;repeat.traversalB=b.traversal;
    }
    if (problems.length) for (const problem of problems) FAIL.push(`${label}: ${problem}`);
    v1Results.push({ ...C, status: problems.length ? 'FAIL' : 'PASS', problems,
      planHash: a.stamp.plan && a.stamp.plan.planHash, realizationHash: a.stamp.realizationHash,
      hash: a.stamp.hash, zones: a.stamp.zones, requested: a.stamp.requested,
      realized: a.stamp.realized, props: a.propPlan.length, selectorCalls: a.selectorCalls,
      resourceRelocation: a.resourceRelocation, resources: a.resources, instances: a.instances,
      traversal: a.traversal, requiredMissing: a.requiredMissing,repeat });
  }

  if (V1_ONLY && !V1_MAP_FILTER) {
    deepChecks = await page.evaluate(() => {
      const copy = value => JSON.parse(JSON.stringify(value));
      const snapshot = () => JSON.stringify({
        seed: _seed, builtMap, builtTheme, builtTopology, mmDirty,
        cityPlan, cityStreets, cityZones, sitePropPlan, sitePropQueue, SITE_REJ,
        deposits, geysers, siteResourcePlan,
        cityGround: CITYG ? Array.from(CITYG) : null,
        depPts: window.__depPts || null,
        relocation: window.__mfResourceRelocation || null,
        cityAt: window.__cityAt || null,
        force: SITE_TPL_FORCE,
        queryForce: SITE_TPL_QUERY && SITE_TPL_QUERY.force
      });
      const instanceState = () => ({
        plots: relics.filter(R => R.id).map(R => [R.id,R.x,R.y]),
        props: []
          .concat(tanks.filter(R => R.id).map(R => [R.id,'tank',R.x,R.y]))
          .concat(crates.filter(R => R.id).map(R => [R.id,'crate',R.x,R.y]))
          .concat(rocks.filter(R => R.id).map(R => [R.id,'rock',R.x,R.y]))
          .concat(trees.filter(R => R.id).map(R => [R.id,'flora',R.x,R.y])),
        mass: deposits.map(D => [D.x,D.y,D.rich?1:0,D.starter||'']),
        energy: geysers.map(G => [G.x,G.y,G.starter||''])
      });
      const own = key => Object.prototype.hasOwnProperty.call(window,key);
      const propRef = key => ({ had:own(key),value:window[key] });
      const sameProp = (key,before) => own(key)===before.had&&(!before.had||window[key]===before.value);
      const sameTyped = (live,before) => {
        if(!live||!before)return live===before;
        if(live.length!==before.length)return false;
        for(let i=0;i<live.length;i++)if(!Object.is(live[i],before[i]))return false;
        return true;
      };
      const productionState = () => JSON.stringify({
        seed:_seed,civicKitSeq:typeof civicKitSeq==='number'?civicKitSeq:null,
        builtMap,builtTheme,builtTopology,mmDirty,playerStartZone,spawnPick,
        aiSlots,cityPlan,cityStreets,cityZones,sitePropPlan,sitePropQueue,SITE_REJ,
        deposits,geysers,siteResourcePlan,cityGround:CITYG?Array.from(CITYG):null,
        depPts:own('__depPts')?window.__depPts:null,
        relocation:own('__mfResourceRelocation')?window.__mfResourceRelocation:null,
        cityAt:own('__cityAt')?window.__cityAt:null,
        reclaimTip:own('__reclaimTip')?window.__reclaimTip:null,
        force:SITE_TPL_FORCE,queryForce:SITE_TPL_QUERY&&SITE_TPL_QUERY.force
      });
      const realizationState = () => JSON.stringify({
        topology:typeof mfWorldTopologyKey==='function'?mfWorldTopologyKey():'',
        plan:cityPlan,streets:cityStreets,zones:cityZones,props:sitePropPlan,rej:SITE_REJ,
        cityGround:CITYG?Array.from(CITYG):null,resourcePlan:siteResourcePlan,
        mass:deposits.map(D=>[D.x,D.y,D.rich?1:0,D.starter||'']),
        energy:geysers.map(G=>[G.x,G.y,G.starter||'']),
        stamp:{map:SITE_STAMP.map,ok:SITE_STAMP.ok,requested:SITE_STAMP.requested,
          realized:SITE_STAMP.realized,plan:SITE_STAMP.plan,zones:SITE_STAMP.zones,
          fails:SITE_STAMP.fails,rej:SITE_STAMP.rej,hash:SITE_STAMP.hash,
          realizationHash:SITE_STAMP.realizationHash}
      });
      const setMap = id => {
        if (!syncBattlefieldFromMap(id)) {
          const D=MAPDEFS[id];if(!D)throw new Error(`cannot select ${id}`);
          curMap=id;if(D.theme)curTheme=D.theme;if(D.region)curRegionId=D.region;
          if(D.size)battlefieldPreset=battlefieldPresetKey(D.size);
        }
        builtMap = ''; builtTheme = ''; builtTopology = ''; mmDirty = true;
        applyTheme(); newSkirmish(); paused = true;
      };
      setMap('pyraeth_flats_medium');
      const baseline = snapshot(), stampBaseline = JSON.stringify(SITE_STAMP);
      const originalPreflight = mfPreflightLocationPlanV1;
      let code = '';
      mfPreflightLocationPlanV1 = () => ({ ok:false,status:'FAIL',map:curMap,planHash:'',requests:[],
        error:{code:'TEST_LOCATION_PREFLIGHT'} });
      try { planDistricts(); } catch (error) { code = error && error.code || ''; }
      mfPreflightLocationPlanV1 = originalPreflight;
      const preflight = { code, worldUnchanged: snapshot() === baseline,
        stampUnchanged: JSON.stringify(SITE_STAMP) === stampBaseline };

      const valid = originalPreflight(curMap), bad = copy(valid);
      bad.requests[1].template = '__stage9_missing_after_first_request__';
      code = '';
      mfPreflightLocationPlanV1 = () => bad;
      try { planDistricts(); } catch (error) { code = error && error.code || ''; }
      mfPreflightLocationPlanV1 = originalPreflight;
      const nthFailure = { code, worldUnchanged: snapshot() === baseline,
        failure: copy(SITE_STAMP.plan && SITE_STAMP.plan.failure), rej: copy(SITE_STAMP.rej) };

      const later = valid.requests.find((R, i) => i > 0 && R.template !== valid.requests[0].template);
      const descriptor = Object.getOwnPropertyDescriptor(SITE_TPL, later.template);
      const throwing = Object.assign({}, SITE_TPL[later.template]);
      Object.defineProperty(throwing, 'rotation', { get(){ throw new Error('TEST_STAGE9_EXECUTION_THROW'); } });
      Object.defineProperty(SITE_TPL, later.template, { configurable:true,writable:true,enumerable:true,value:throwing });
      code = '';
      mfPreflightLocationPlanV1 = () => valid;
      try { planDistricts(); } catch (error) { code = error && error.code || 'LOCATION_PLAN_EXECUTION_FAILED'; }
      mfPreflightLocationPlanV1 = originalPreflight;
      Object.defineProperty(SITE_TPL, later.template, descriptor);
      const thrownFailure = { code, worldUnchanged: snapshot() === baseline,
        failure: copy(SITE_STAMP.plan && SITE_STAMP.plan.failure), rej: copy(SITE_STAMP.rej) };

      /* Direct planner rollback above is diagnostic. This transaction test
         enters through applyTheme, lets buildTerrain allocate the destination
         canvas/height/passability state, and fails only when the wrapped
         production planner consumes its second exact request. */
      setMap('pyraeth_flats_medium');
      const deterministicBaseline=realizationState();
      mmDirty=true;
      const productionBefore=productionState();
      const terrainRefs={terrainCanvas,heightF,PASS,PASS_WATER,PSLOPE,PCELLH,PREPAIR,terrainTex,
        terraStats:typeof terraLastStats!=='undefined'?terraLastStats:null};
      const mutableTerrain={pslope:PSLOPE?PSLOPE.slice():null,pcell:PCELLH?PCELLH.slice():null,
        prepair:PREPAIR?PREPAIR.slice():null};
      const setupRefs={ai:aiSlots.slice(),deposits:deposits.slice(),geysers:geysers.slice(),
        cityGround:CITYG,plan:cityPlan.slice(),streets:cityStreets.slice(),zones:cityZones.slice(),
        props:sitePropPlan.slice(),propQueue:sitePropQueue.slice(),
        depPts:propRef('__depPts'),relocation:propRef('__mfResourceRelocation'),
        cityAt:propRef('__cityAt'),reclaimTip:propRef('__reclaimTip'),
        roadGrade:propRef('__mfRoadGradeStats')};
      const productionBad=copy(originalPreflight(curMap));
      productionBad.requests[1].template='__stage9_missing_in_production_transaction__';
      const buildOriginal=buildTerrain,planOriginal=planDistricts,
        reloadOriginal=typeof reloadTerrainThemeTextures==='function'?reloadTerrainThemeTextures:null;
      let productionCode='',buildCalls=0,planCalls=0,reloadCalls=0,atBuild=null,atPlan=null;
      try{
        mfPreflightLocationPlanV1=()=>productionBad;
        buildTerrain=function(theme,locationPreview){
          buildCalls++;
          atBuild={ok:!!(locationPreview&&locationPreview.ok),status:locationPreview&&locationPreview.status,
            map:locationPreview&&locationPreview.map,
            secondTemplate:locationPreview&&locationPreview.requests&&locationPreview.requests[1]&&
              locationPreview.requests[1].template};
          return buildOriginal.apply(this,arguments);
        };
        planDistricts=function(){
          planCalls++;
          atPlan={terrainCanvasChanged:terrainCanvas!==terrainRefs.terrainCanvas,
            heightChanged:heightF!==terrainRefs.heightF,passChanged:PASS!==terrainRefs.PASS,
            passWaterChanged:PASS_WATER!==terrainRefs.PASS_WATER,
            hasDestinationTerrain:!!terrainCanvas&&!!heightF&&!!PASS&&!!PASS_WATER};
          return planOriginal.apply(this,arguments);
        };
        if(reloadOriginal)reloadTerrainThemeTextures=function(){reloadCalls++;return reloadOriginal.apply(this,arguments);};
        try{applyTheme();}catch(error){productionCode=error&&error.code||'';}
      }finally{
        mfPreflightLocationPlanV1=originalPreflight;
        buildTerrain=buildOriginal;planDistricts=planOriginal;
        if(reloadOriginal)reloadTerrainThemeTextures=reloadOriginal;
      }
      const productionTelemetry=copy(SITE_STAMP);
      const productionTerrain={
        code:productionCode,buildCalls,planCalls,reloadCalls,atBuild,atPlan,
        earlyPreflightAccepted:!!atBuild&&atBuild.ok&&atBuild.status==='FULL_V1'&&
          atBuild.secondTemplate==='__stage9_missing_in_production_transaction__',
        reachedMutatedCpu:!!atPlan&&atPlan.terrainCanvasChanged&&atPlan.heightChanged&&
          atPlan.passChanged&&atPlan.passWaterChanged&&atPlan.hasDestinationTerrain,
        rollback:{
          stateExact:productionState()===productionBefore,
          canvasIdentity:terrainCanvas===terrainRefs.terrainCanvas,
          heightIdentity:heightF===terrainRefs.heightF,passIdentity:PASS===terrainRefs.PASS,
          passWaterIdentity:PASS_WATER===terrainRefs.PASS_WATER,
          slopeIdentity:PSLOPE===terrainRefs.PSLOPE,cellIdentity:PCELLH===terrainRefs.PCELLH,
          repairIdentity:PREPAIR===terrainRefs.PREPAIR,textureIdentity:terrainTex===terrainRefs.terrainTex,
          slopeBytes:sameTyped(PSLOPE,mutableTerrain.pslope),cellBytes:sameTyped(PCELLH,mutableTerrain.pcell),
          repairBytes:sameTyped(PREPAIR,mutableTerrain.prepair),
          terraStatsIdentity:(typeof terraLastStats!=='undefined'?terraLastStats:null)===terrainRefs.terraStats,
          roadGradeIdentity:sameProp('__mfRoadGradeStats',setupRefs.roadGrade),
          aiIdentity:aiSlots.length===setupRefs.ai.length&&aiSlots.every((A,i)=>A===setupRefs.ai[i]),
          cityGroundIdentity:CITYG===setupRefs.cityGround,
          planIdentity:cityPlan.length===setupRefs.plan.length&&cityPlan.every((P,i)=>P===setupRefs.plan[i]),
          streetIdentity:cityStreets.length===setupRefs.streets.length&&
            cityStreets.every((S,i)=>S===setupRefs.streets[i]),
          zoneIdentity:cityZones.length===setupRefs.zones.length&&cityZones.every((Z,i)=>Z===setupRefs.zones[i]),
          propIdentity:sitePropPlan.length===setupRefs.props.length&&
            sitePropPlan.every((P,i)=>P===setupRefs.props[i]),
          propQueueIdentity:sitePropQueue.length===setupRefs.propQueue.length&&
            sitePropQueue.every((P,i)=>P===setupRefs.propQueue[i]),
          depositIdentity:deposits.length===setupRefs.deposits.length&&
            deposits.every((D,i)=>D===setupRefs.deposits[i]),
          geyserIdentity:geysers.length===setupRefs.geysers.length&&
            geysers.every((G,i)=>G===setupRefs.geysers[i]),
          depPtsIdentity:sameProp('__depPts',setupRefs.depPts),
          relocationIdentity:sameProp('__mfResourceRelocation',setupRefs.relocation),
          cityAtIdentity:sameProp('__cityAt',setupRefs.cityAt),
          reclaimTipIdentity:sameProp('__reclaimTip',setupRefs.reclaimTip)
        },
        telemetry:{changed:JSON.stringify(productionTelemetry)!==stampBaseline,
          ok:productionTelemetry.ok,failure:productionTelemetry.plan&&productionTelemetry.plan.failure,
          zones:productionTelemetry.zones&&productionTelemetry.zones.length,
          fails:productionTelemetry.fails&&productionTelemetry.fails.length},
        success:{applied:false,deterministic:false,stampOk:false,topologyExact:false}
      };
      try{
        mmDirty=true;applyTheme();
        const afterSuccess=realizationState();
        productionTerrain.success={applied:true,deterministic:afterSuccess===deterministicBaseline,
          stampOk:!!SITE_STAMP.ok&&!SITE_STAMP.plan.failure,
          topologyExact:mfWorldTopologyKey()===SITE_STAMP.plan.topologyKey,
          planHash:SITE_STAMP.plan.planHash,realizationHash:SITE_STAMP.realizationHash,
          builtTopology,mmDirty};
      }catch(error){productionTerrain.success.error=String(error&&error.stack||error);}

      setMap('pyraeth_flats_medium');
      const keyA = mfWorldTopologyKey(), hashA = SITE_STAMP.realizationHash;
      const startA = playerStartZone, slotsA = aiSlots.map(A => ({...A}));
      playerStartZone = startA === 'sw' ? 'se' : 'sw';
      mmDirty = false; applyTheme();
      const keyB = mfWorldTopologyKey(), hashB = SITE_STAMP.realizationHash;
      playerStartZone = startA;
      for (let i=0;i<aiSlots.length;i++) Object.assign(aiSlots[i],slotsA[i]);
      mmDirty = false; applyTheme(); newSkirmish(); paused = true;
      const keyC = mfWorldTopologyKey(), hashC = SITE_STAMP.realizationHash;
      const resetA = JSON.stringify(instanceState());
      const wrapped = planDistricts; let plannerCalls = 0;
      planDistricts = function(){ plannerCalls++; return wrapped.apply(this,arguments); };
      mmDirty = false; applyTheme();
      planDistricts = wrapped;
      newSkirmish(); paused = true;
      const resetB = JSON.stringify(instanceState());
      const topology = { keyA,keyB,keyC,hashA,hashB,hashC,builtTopology,
        changed:keyA!==keyB&&hashA!==hashB,
        restored:keyA===keyC&&hashA===hashC,
        cachePlannerCalls:plannerCalls,resetStable:resetA===resetB };

      /* Exercise the dropped-session helpers directly so this lane cannot
         accidentally emit salvage, pickup or XP rewards while replaying live
         authored-site state. The normal restore path separately replays units
         and buildings; this fixture is deliberately bounded to Stage 9D. */
      const session={skipped:false},storeKey='mf_dropped_session_v1';
      const hadStored=localStorage.getItem(storeKey)!==null,storedBefore=localStorage.getItem(storeKey);
      const hadReject=Object.prototype.hasOwnProperty.call(window,'__mfSessionReject');
      const rejectBefore=window.__mfSessionReject;
      const savedMap=curMap,savedStart=playerStartZone,savedSlots=aiSlots.map(A=>({...A}));
      const savedHero=sessCaptureHeroState(),savedWrecks=sessCaptureWrecks();
      const savedLocation=sessCaptureLocation(),savedBlds=sessCaptureBuildings();
      const rewardCalls=[];
      const rewardOriginals={collapseBlock,blowTank,applyCrate,addWreck,heroXP};
      let rewardWrapped=false;
      const stateSignature=()=>JSON.stringify({
        units:Array.from({length:unitHigh},(_,i)=>ualive[i]?[i,utype[i],uteam[i],uhp[i],ux[i],uy[i]]:null).filter(Boolean),
        blds:blds.map((B,i)=>B&&B.alive?[i,B.type,B.team,B.hp,B.x,B.y]:null).filter(Boolean),
        location:sessCaptureLocation(),wrecks:sessCaptureWrecks(),hero:sessCaptureHeroState()
      });
      try{
        const fixtureHero=spawnUnit(4,0,1080,1080,POP_PLAYER_SLOT);
        if(fixtureHero<0)throw new Error('Stage 9D fixture could not spawn a player Commander');
        heroIdx=fixtureHero;
        const fixtureBuilding=addBld('pgen',0,1160,1080,true);
        if(!fixtureBuilding)throw new Error('Stage 9D fixture could not add a core-state building');
        const relic=relics.find(R=>R&&R.id&&cityZones[R.zone]&&cityZones[R.zone].siteId);
        const tank=tanks.find(T=>T&&T.id);
        const crateIndex=crates.findIndex(K=>K&&K.id);
        const depIndex=deposits.findIndex(D=>Number.isFinite(D.capacity)&&D.capacity>1);
        if(!savedLocation||savedLocation.planner.status!=='FULL_V1'||!relic||!tank||crateIndex<0||depIndex<0)
          throw new Error('Stage 9D fixture lacks a FULL_V1 relic/tank/crate/finite-mass-node');

        /* Mutate raw state only. These assignments intentionally avoid the
           gameplay handlers whose side effects are the duplication risk. */
        const zone=cityZones[relic.zone],crateId=crates[crateIndex].id,dep=deposits[depIndex];
        relic.hp=0;relic.alive=false;relic.part=relic.kind===5?1:0;
        relic.lean=.17;relic.burn=.4;relic.fallT=2.5;
        zone.razed=relics.filter(R=>R&&R.zone===relic.zone&&!R.alive).length;
        zone.claimed=zone.total>0&&zone.razed===zone.total?1:0;
        tank.hp=0;tank.alive=false;tank.fuse=1.25;
        crates.splice(crateIndex,1);
        dep.remaining=+(dep.capacity*.371).toFixed(3);dep.surveyed=3;
        heroLvl=4;heroXp=41;heroXpNext=250;pendingLevels=1;
        heroDmgMult=1.17;heroRegen=.03;commanderHpMult=1.1;armyDmgMult=1.05;
        salvageMult=1.2;bldHpMult=1.08;playerBuildMult=.94;blastRadius=1.15;
        uhpm[fixtureHero]=uhpm[fixtureHero]*1.2;uhp[fixtureHero]=Math.min(uhp[fixtureHero],uhpm[fixtureHero]);
        const fixtureMaxHp=+uhpm[fixtureHero],fixtureAbilityCd=[20.8,16,24,70,45],fixtureIncome=[2.5,8];
        for(let i=0;i<AB_CD.length;i++)AB_CD[i]=fixtureAbilityCd[i];
        bonusMass=fixtureIncome[0];bonusEnergy=fixtureIncome[1];
        abUnlock=[true,false,true,false,false];abCool=[1,2,3,4,5];
        wrecks.push({x:321,y:654,a:.25,s:18,mass:75,m0:75,en:20,e0:20,kind:2,
          style:'stage9d-probe',life:12,glow:.4,ts:99});

        const location=sessCaptureLocation(),hero=sessCaptureHeroState(),wreckRows=sessCaptureWrecks();
        const setup={m:curMap,t:curTheme,d:difficulty|0,bs:battlefieldPreset,pkg:deploymentPackage,
          g:goalSel,tl:Number.isFinite(timeLimit)?+timeLimit:0,rp:Number.isFinite(resPace)?+resPace:1,
          cr:Number.isFinite(crateRate)?+crateRate:0,ps:playerStartZone,f:(AI&&AI.fac)||aiFactionSel,
          pf:playerFaction,pc:playerCommanderId,ais:aiSlots.map(A=>({on:!!A.on,diff:A.diff|0,zone:A.zone,
            ally:!!A.ally,behavior:aiBehaviorKey(A.behavior)})),df:defenseFocus?1:0,inf:infestationOn?1:0};
        const fixture={v:2,at:Date.now(),map:curMap,theme:curTheme,setup,
          goal:goalSel,timeLimit:setup.tl,aiFac:setup.f,playerFac:playerFaction,playerCommander:playerCommanderId,
          units:sessCaptureUnits(),blds:sessCaptureBuildings(),location,hero,wrecks:wreckRows,
          resM:[+resM[0],+resM[1]],resE:[+resE[0],+resE[1]],
          kills:stats.kills.slice(),built:stats.built.slice(),wallets:sessCaptureWallets(),
          patrols:sessCapturePatrols(),wave:{n:AI.wave|0,timer:+AI.waveTimer||0},
          clock:+matchClock||0,t:+stats.t||0,
          extraStats:{nests:0,reclaimed:0,campaignCache:0}};
        const captured=!!location&&location.schema==='DroppedLocationStateV1'&&location.version===1&&
          location.planner.status==='FULL_V1'&&!!location.planner.planHash&&
          !!location.planner.realizationHash&&!!location.planner.topologyKey;

        setMap(curMap);
        const replayHero=spawnUnit(4,0,1080,1080,POP_PLAYER_SLOT);
        if(replayHero<0)throw new Error('Stage 9D fixture could not spawn a replay Commander');
        heroIdx=replayHero;
        const locationCheck=sessLocationCurrentCheck(fixture);
        const wreckCheck=sessCheckWrecks(fixture),heroCheck=sessCheckHeroState(fixture);
        collapseBlock=function(){rewardCalls.push('collapseBlock');};
        blowTank=function(){rewardCalls.push('blowTank');};
        applyCrate=function(){rewardCalls.push('applyCrate');};
        addWreck=function(){rewardCalls.push('addWreck');};
        heroXP=function(){rewardCalls.push('heroXP');};
        rewardWrapped=true;
        const applied=locationCheck.ok&&wreckCheck.ok&&heroCheck.ok&&
          sessApplyLocationState(locationCheck)&&
          (sessApplyWrecks(wreckCheck),sessApplyHeroState(heroCheck),true);
        const restoredRelic=relics.find(R=>R.id===relic.id),restoredTank=tanks.find(T=>T.id===tank.id);
        const restoredZone=cityZones.find(Z=>Z.siteId===zone.siteId),restoredDep=deposits[depIndex];
        const locationExact=JSON.stringify(sessCaptureLocation())===JSON.stringify(location);
        const heroExact=JSON.stringify(sessCaptureHeroState())===JSON.stringify(hero);
        const heroProgressionExact=heroExact&&Math.abs(uhpm[heroIdx]-hero.maxHp)<.001&&hero.maxHp===fixtureMaxHp&&
          JSON.stringify(AB_CD)===JSON.stringify(hero.abilityCd)&&
          JSON.stringify(hero.abilityCd)===JSON.stringify(fixtureAbilityCd)&&
          bonusMass===hero.income[0]&&bonusEnergy===hero.income[1]&&
          JSON.stringify(hero.income)===JSON.stringify(fixtureIncome);
        const wrecksExact=JSON.stringify(sessCaptureWrecks())===JSON.stringify(wreckRows);
        const dynamicExact=!!restoredRelic&&!restoredRelic.alive&&restoredRelic.hp===0&&
          !!restoredTank&&!restoredTank.alive&&restoredTank.hp===0&&
          !!restoredZone&&restoredZone.razed===zone.razed&&restoredZone.claimed===zone.claimed&&
          !crates.some(K=>K.id===crateId)&&restoredDep.remaining===dep.remaining&&restoredDep.surveyed===3;

        const stable=stateSignature();
        const badSetupLoad=copy(fixture);badSetupLoad.setup.f='__stage9_unknown_faction__';
        window.__mfSessionReject='';localStorage.setItem(storeKey,JSON.stringify(badSetupLoad));
        const badSetupLoaded=sessLoad(),badSetupLoadCode=window.__mfSessionReject||'';
        const badSetupLoadUnchanged=stateSignature()===stable;
        const badSetupRestore=copy(fixture);badSetupRestore.setup.rp=NaN;window.__mfSessionReject='';
        const badSetupRestored=sessRestoreInto(badSetupRestore),badSetupRestoreCode=window.__mfSessionReject||'';
        const badSetupRestoreUnchanged=stateSignature()===stable;

        const badUnits=copy(fixture);badUnits.units.hp.pop();
        window.__mfSessionReject='';localStorage.setItem(storeKey,JSON.stringify(badUnits));
        const badUnitsLoaded=sessLoad(),badUnitsLoadCode=window.__mfSessionReject||'';
        const badUnitsLoadUnchanged=stateSignature()===stable;
        window.__mfSessionReject='';
        const badUnitsRestore=sessRestoreInto(badUnits),badUnitsCode=window.__mfSessionReject||'';
        const badUnitsUnchanged=stateSignature()===stable;

        const badBuilding=copy(fixture);
        if(!badBuilding.blds.length)throw new Error('Stage 9D core-state fixture lacks a building row');
        badBuilding.blds[0]=badBuilding.blds[0].slice(0,13);window.__mfSessionReject='';
        const badBuildingRestore=sessRestoreInto(badBuilding),badBuildingCode=window.__mfSessionReject||'';
        const badBuildingUnchanged=stateSignature()===stable;

        const hashless=copy(fixture);hashless.v=1;delete hashless.location;
        window.__mfSessionReject='';localStorage.setItem(storeKey,JSON.stringify(hashless));
        const hashlessLoaded=sessLoad(),hashlessLoadCode=window.__mfSessionReject||'';
        const hashlessRestore=sessRestoreInto(hashless),hashlessCode=window.__mfSessionReject||'';
        const hashlessUnchanged=stateSignature()===stable;

        const badPlan=copy(fixture);badPlan.location.planner.planHash='corrupt-plan-hash';
        const badPlanRestore=sessRestoreInto(badPlan),badPlanCode=window.__mfSessionReject||'';
        const badPlanUnchanged=stateSignature()===stable;
        const badRealization=copy(fixture);badRealization.location.planner.realizationHash+='0';
        const badRealizationRestore=sessRestoreInto(badRealization),badRealizationCode=window.__mfSessionReject||'';
        const badRealizationUnchanged=stateSignature()===stable;

        Object.assign(session,{
          capture:{valid:captured,schema:location&&location.schema,planHash:location&&location.planner.planHash,
            realizationHash:location&&location.planner.realizationHash,
            ids:{zone:zone.siteId,relic:relic.id,tank:tank.id,crateTombstone:crateId,mass:depIndex}},
          roundTrip:{validated:!!locationCheck.ok,wreckValidated:!!wreckCheck.ok,heroValidated:!!heroCheck.ok,
            applied:!!applied,locationExact,heroExact,heroProgressionExact,wrecksExact,dynamicExact,rewardCalls:rewardCalls.slice()},
          rejection:{
            setup:{loaded:!!badSetupLoaded,loadCode:badSetupLoadCode,loadUnchanged:badSetupLoadUnchanged,
              restore:!!badSetupRestored,code:badSetupRestoreCode,unchanged:badSetupRestoreUnchanged},
            coreUnits:{loaded:!!badUnitsLoaded,loadCode:badUnitsLoadCode,loadUnchanged:badUnitsLoadUnchanged,
              restore:!!badUnitsRestore,code:badUnitsCode,unchanged:badUnitsUnchanged},
            coreBuilding:{restore:!!badBuildingRestore,code:badBuildingCode,unchanged:badBuildingUnchanged},
            hashless:{loaded:!!hashlessLoaded,restore:!!hashlessRestore,loadCode:hashlessLoadCode,
              code:hashlessCode,unchanged:hashlessUnchanged},
            plan:{restore:!!badPlanRestore,code:badPlanCode,unchanged:badPlanUnchanged},
            realization:{restore:!!badRealizationRestore,code:badRealizationCode,unchanged:badRealizationUnchanged}
          }
        });
      }catch(error){session.error=String(error&&error.stack||error);}
      finally{
        if(rewardWrapped){collapseBlock=rewardOriginals.collapseBlock;blowTank=rewardOriginals.blowTank;
          applyCrate=rewardOriginals.applyCrate;addWreck=rewardOriginals.addWreck;heroXP=rewardOriginals.heroXP;}
        try{
          playerStartZone=savedStart;
          for(let i=0;i<aiSlots.length;i++)Object.assign(aiSlots[i],savedSlots[i]);
          setMap(savedMap);
          const originalFixture={v:2,map:savedMap,theme:curTheme,setup:{m:savedMap},blds:savedBlds,location:savedLocation};
          const originalLocationCheck=sessLocationCurrentCheck(originalFixture);
          if(originalLocationCheck.ok)sessApplyLocationState(originalLocationCheck);
          sessApplyWrecks({rows:savedWrecks});sessApplyHeroState({state:savedHero});
          session.fixtureRestored=originalLocationCheck.ok&&
            JSON.stringify(sessCaptureLocation())===JSON.stringify(savedLocation)&&
            JSON.stringify(sessCaptureWrecks())===JSON.stringify(savedWrecks)&&
            JSON.stringify(sessCaptureHeroState())===JSON.stringify(savedHero);
        }catch(error){session.fixtureRestored=false;session.restoreError=String(error&&error.stack||error);}
        if(hadStored)localStorage.setItem(storeKey,storedBefore);else localStorage.removeItem(storeKey);
        if(hadReject)window.__mfSessionReject=rejectBefore;else delete window.__mfSessionReject;
      }
      return { skipped:false,preflight,nthFailure,thrownFailure,productionTerrain,topology,session };
    });
    if (deepChecks.preflight.code !== 'TEST_LOCATION_PREFLIGHT' || !deepChecks.preflight.worldUnchanged || !deepChecks.preflight.stampUnchanged)
      FAIL.push(`FULL_V1 preflight rollback failed ${JSON.stringify(deepChecks.preflight)}`);
    if (deepChecks.nthFailure.code !== 'LOCATION_TEMPLATE_MISSING' || !deepChecks.nthFailure.worldUnchanged ||
        deepChecks.nthFailure.failure?.instance !== 2)
      FAIL.push(`FULL_V1 Nth-request rollback failed ${JSON.stringify(deepChecks.nthFailure)}`);
    if (deepChecks.thrownFailure.code !== 'LOCATION_PLAN_EXECUTION_FAILED' || !deepChecks.thrownFailure.worldUnchanged)
      FAIL.push(`FULL_V1 exception rollback failed ${JSON.stringify(deepChecks.thrownFailure)}`);
    const terrainTx=deepChecks.productionTerrain,terrainRollback=terrainTx&&terrainTx.rollback;
    if (!terrainTx||terrainTx.code!=='LOCATION_TEMPLATE_MISSING'||terrainTx.buildCalls!==1||
        terrainTx.planCalls!==1||terrainTx.reloadCalls!==0||!terrainTx.earlyPreflightAccepted||
        !terrainTx.reachedMutatedCpu||!terrainRollback||Object.values(terrainRollback).some(v=>v!==true)||
        !terrainTx.telemetry?.changed||terrainTx.telemetry?.ok!==false||
        terrainTx.telemetry?.failure?.code!=='LOCATION_TEMPLATE_MISSING'||
        terrainTx.telemetry?.failure?.instance!==2||terrainTx.telemetry?.zones!==0||
        !terrainTx.success?.applied||!terrainTx.success?.deterministic||!terrainTx.success?.stampOk||
        !terrainTx.success?.topologyExact||terrainTx.success?.mmDirty!==false)
      FAIL.push(`FULL_V1 production terrain transaction failed ${JSON.stringify(terrainTx)}`);
    if (!deepChecks.topology.changed || !deepChecks.topology.restored || deepChecks.topology.cachePlannerCalls ||
        !deepChecks.topology.resetStable || deepChecks.topology.builtTopology !== deepChecks.topology.keyC)
      FAIL.push(`FULL_V1 topology/cache/reset failed ${JSON.stringify(deepChecks.topology)}`);
    const session=deepChecks.session;
    if (!session||session.error||!session.capture?.valid||!session.roundTrip?.validated||
        !session.roundTrip?.wreckValidated||!session.roundTrip?.heroValidated||!session.roundTrip?.applied||
        !session.roundTrip?.locationExact||!session.roundTrip?.heroExact||!session.roundTrip?.heroProgressionExact||!session.roundTrip?.wrecksExact||
        !session.roundTrip?.dynamicExact||session.roundTrip?.rewardCalls?.length||!session.fixtureRestored)
      FAIL.push(`FULL_V1 dropped-session round trip failed ${JSON.stringify(session)}`);
    if (!session||session.rejection?.setup?.loaded||
        session.rejection?.setup?.loadCode!=='SESSION_SETUP_STATE_INVALID'||!session.rejection?.setup?.loadUnchanged||
        session.rejection?.setup?.restore||session.rejection?.setup?.code!=='SESSION_SETUP_STATE_INVALID'||
        !session.rejection?.setup?.unchanged||session.rejection?.coreUnits?.loaded||
        session.rejection?.coreUnits?.loadCode!=='SESSION_CORE_STATE_INVALID'||!session.rejection?.coreUnits?.loadUnchanged||
        session.rejection?.coreUnits?.restore||session.rejection?.coreUnits?.code!=='SESSION_CORE_STATE_INVALID'||
        !session.rejection?.coreUnits?.unchanged||session.rejection?.coreBuilding?.restore||
        session.rejection?.coreBuilding?.code!=='SESSION_CORE_STATE_INVALID'||!session.rejection?.coreBuilding?.unchanged||
        session.rejection?.hashless?.loaded||session.rejection?.hashless?.restore||
        session.rejection?.hashless?.loadCode!=='SESSION_FULL_V1_REQUIRES_V2'||
        session.rejection?.hashless?.code!=='SESSION_FULL_V1_REQUIRES_V2'||
        !session.rejection?.hashless?.unchanged||session.rejection?.plan?.restore||
        session.rejection?.plan?.code!=='SESSION_LOCATION_PLAN_MISMATCH'||
        !session.rejection?.plan?.unchanged||session.rejection?.realization?.restore||
        session.rejection?.realization?.code!=='SESSION_LOCATION_REALIZATION_MISMATCH'||
        !session.rejection?.realization?.unchanged)
      FAIL.push(`FULL_V1 dropped-session rejection failed ${JSON.stringify(session&&session.rejection)}`);
  }

  const selectorAfter = await page.evaluate(() => {
    SITE_TPL_FORCE = null;
    curMap = 'aelos_north_medium';
    const civicCity = [];
    for (let i = 0; i < 16; i++) {
      const T = siteTemplateFor('city', () => (i + 0.5) / 16);
      if (T) civicCity.push(T.name);
    }
    curMap = 'aelos_ridge_medium';
    const alpineCity = [];
    for (let i = 0; i < 16; i++) {
      const T = siteTemplateFor('city', () => (i + 0.5) / 16);
      if (T) alpineCity.push(T.name);
    }
    return {
      forceIsNull: SITE_TPL_FORCE == null,
      civicCity: [...new Set(civicCity)],
      alpineCity: [...new Set(alpineCity)],
      alpineReason: SITE_TPL_QUERY && SITE_TPL_QUERY.telem && SITE_TPL_QUERY.telem.reason.city
    };
  });
  if (!selectorAfter.forceIsNull) FAIL.push('SITE_TPL_FORCE was not null after the sweep');
  if (JSON.stringify(selectorAfter.civicCity) !== JSON.stringify(boot.civicCity))
    FAIL.push(`production civic city pool drifted: ${selectorAfter.civicCity.join(',')} vs ${boot.civicCity.join(',')}`);
  if (selectorAfter.alpineCity.length)
    FAIL.push(`alpine ridge city selector leaked ${selectorAfter.alpineCity.join(',')}`);
  if (selectorAfter.alpineReason !== 'INCOMPATIBLE')
    FAIL.push(`alpine ridge city reason was ${selectorAfter.alpineReason}, expected INCOMPATIBLE`);

  /* This is intentionally outside the large case sweep and outside the deep
     page.evaluate above. Reloading the same Page preserves this origin's
     localStorage while replacing every runtime global, which is the cold-start
     boundary the production recovery path must survive. */
  if (V1_ONLY && !V1_MAP_FILTER) {
    try {
      const prepared = await page.evaluate(() => {
        try {
          const mapId='pyraeth_flats_medium',D=MAPDEFS[mapId];
          if(!D)throw new Error('reload fixture map is missing');
          SITE_TPL_FORCE=null;if(SITE_TPL_QUERY)SITE_TPL_QUERY.force=null;
          if(!syncBattlefieldFromMap(mapId)){
            curMap=mapId;curTheme=D.theme;if(D.region)curRegionId=D.region;
            if(D.size)battlefieldPreset=battlefieldPresetKey(D.size);
          }
          playerFaction='nova';playerCommanderId='nova_kai';aiFactionSel='legion';
          deploymentPackage='expedition';difficulty=0;wcChoice=0;infestationOn=false;defenseFocus=0;
          goalSel='annihilate';timeLimit=1200;resPace=1;crateRate=crateRateBase=1;
          builtMap='';builtTheme='';builtTopology='';mmDirty=true;
          applyTheme();newSkirmish();

          /* Skip only the presentation descent. carrierCanDeploy and
             deployCarrier remain the real production entry points. */
          carrier.phase=1;carrier.active=true;carrier.alt=0;carrier.clearance=0;
          const step=Math.max(SNAP_GRID*2,40),ox=carrier.x,oy=carrier.y;
          let landing=null;
          const tryLanding=(x,y)=>{
            carrier.x=clamp(Math.round(x/SNAP_GRID)*SNAP_GRID,120,MAP-120);
            carrier.y=clamp(Math.round(y/SNAP_GRID)*SNAP_GRID,120,MAP-120);
            carrier.tx=carrier.x;carrier.ty=carrier.y;
            if(carrierCanDeploy()){landing=[carrier.x,carrier.y];return true;}return false;
          };
          if(!tryLanding(ox,oy)){
            for(let ring=1;ring<=12&&!landing;ring++){
              for(let y=-ring;y<=ring&&!landing;y++)for(let x=-ring;x<=ring&&!landing;x++){
                if(Math.max(Math.abs(x),Math.abs(y))!==ring)continue;
                tryLanding(ox+x*step,oy+y*step);
              }
            }
          }
          if(!landing){
            for(let y=160;y<MAP-160&&!landing;y+=step)
              for(let x=160;x<MAP-160&&!landing;x+=step)tryLanding(x,y);
          }
          if(!landing)throw new Error('reload fixture found no deployable carrier pad');
          deployCarrier();
          const hq=blds.find(B=>B&&B.alive&&B.type==='hq'&&B.team===0);
          if(!matchLive||heroIdx<0||!ualive[heroIdx]||!hq)throw new Error('reload fixture deployment did not start a live match');

          const massIndex=deposits.findIndex(D2=>Number.isFinite(D2.capacity)&&D2.capacity>1&&!D2.taken);
          const energyIndex=geysers.findIndex(G=>Number.isFinite(G.capacity)&&G.capacity>1&&!G.taken);
          if(massIndex<0||energyIndex<0)throw new Error('reload fixture needs unclaimed finite resource nodes');
          const mass=deposits[massIndex],energy=geysers[energyIndex];
          mass.remaining=+(mass.capacity*.347).toFixed(3);mass.surveyed=3;
          energy.remaining=+(energy.capacity*.413).toFixed(3);energy.surveyed=5;

          stats.t=543.25;stats.kills=[7,11,13];stats.built=[17,19];matchClock=987.5;
          econSetBanks(777,3333,0);AI.wave=4;AI.waveTimer=23.5;
          heroLvl=4;heroXp=41;heroXpNext=250;pendingLevels=1;
          heroDmgMult=1.17;heroRegen=18;commanderHpMult=1.1;armyDmgMult=1.05;
          salvageMult=1.2;bldHpMult=1.08;playerBuildMult=.94;blastRadius=126.5;
          uhpm[heroIdx]=uhpm[heroIdx]*1.2;uhp[heroIdx]=Math.min(2345,uhpm[heroIdx]);
          ux[heroIdx]=Math.round(hq.x+61);uy[heroIdx]=Math.round(hq.y+43);
          utx[heroIdx]=ux[heroIdx];uty[heroIdx]=uy[heroIdx];ustate[heroIdx]=0;
          const abilityCd=[20.8,16,24,70,45],income=[2.5,8];
          for(let i=0;i<AB_CD.length;i++)AB_CD[i]=abilityCd[i];
          bonusMass=income[0];bonusEnergy=income[1];
          abUnlock=[true,false,true,false,false];abCool=[1,2,3,4,5];

          META.setup={d:difficulty,t:curTheme,m:curMap,f:aiFactionSel,pf:playerFaction,pc:playerCommanderId,
            bs:battlefieldPreset,pkg:deploymentPackage,g:goalSel,tl:timeLimit,rp:resPace,cr:crateRate,
            ps:playerStartZone,ais:aiSlots.map(A=>({on:!!A.on,diff:A.diff|0,zone:A.zone,ally:!!A.ally,
              behavior:aiBehaviorKey(A.behavior)})),df:defenseFocus,inf:infestationOn?1:0};
          running=true;matchLive=true;gameEnded=false;demoMode=false;paused=true;sessClear();
          const snapOk=sessSnapshot('stage9-reload-e2e'),stored=snapOk?sessLoad():null;
          if(!stored||stored.v!==2||stored.location?.planner?.status!=='FULL_V1')
            throw new Error('reload fixture did not emit a valid FULL_V1 v2 snapshot: '+(window.__mfSessionReject||''));
          const heroRow=stored.units.t.findIndex((type,k)=>stored.units.tm[k]===0&&stored.units.cmd[k]===POP_PLAYER_SLOT&&
            (type===4||(TYPES[type]&&TYPES[type].cat==='hero')));
          const hqRow=stored.blds.find(B=>B[0]==='hq'&&B[1]===0);
          if(heroRow<0||!hqRow)throw new Error('reload fixture snapshot lacks player Commander/HQ');
          return {ok:true,expected:{map:stored.map,t:stored.t,clock:stored.clock,kills:stored.kills,built:stored.built,
            resM0:stored.resM[0],resE0:stored.resE[0],wave:stored.wave,
            unitCount:stored.units.t.length,bldCount:stored.blds.length,hq:[hqRow[2],hqRow[3]],
            hero:{x:stored.units.x[heroRow],y:stored.units.y[heroRow],hp:stored.units.hp[heroRow],
              lvl:stored.hero.lvl,xp:stored.hero.xp,maxHp:stored.hero.maxHp,
              abilityCd:stored.hero.abilityCd,income:stored.hero.income},
            mass:{index:massIndex,remaining:stored.location.resources.mass[massIndex][5],
              surveyed:stored.location.resources.mass[massIndex][6]},
            energy:{index:energyIndex,remaining:stored.location.resources.energy[energyIndex][5],
              surveyed:stored.location.resources.energy[energyIndex][6]}}};
        }catch(error){return {ok:false,error:String(error&&error.stack||error),reject:window.__mfSessionReject||''};}
      });
      if(!prepared.ok)throw new Error(prepared.error||'reload fixture preparation failed');

      await page.reload({waitUntil:'domcontentloaded',timeout:120000});
      /* Function declarations and `gl` appear before boot's awaited atlas work
         resumes. Calling sessResume at that point races the remainder of boot:
         recovery can build Pyraeth, then boot finishes by laying the Aelos
         attract world over it while the deferred carrier poll is still live.
         Wait for the actual menu world and its terrain/model buffers instead.
         `menuBg=off` deliberately has no attract units, but setupAttract still
         marks menuMode after the same boot boundary. */
      await page.waitForFunction(() => {
        const bgOff=typeof menuBg==='function'&&menuBg()==='off';
        const menuReady=!!document.body&&document.body.classList.contains('menuMode');
        const attractReady=bgOff||(typeof attractOn==='boolean'&&attractOn&&
          typeof blds!=='undefined'&&blds.some(B=>B&&B.alive&&B.type==='hq'));
        return typeof sessLoad==='function'&&typeof sessResume==='function'&&
          typeof newSkirmish==='function'&&typeof deployCarrier==='function'&&
          typeof sessRestoreInto==='function'&&typeof gl!=='undefined'&&!!gl&&
          typeof terrainTex!=='undefined'&&!!terrainTex&&
          typeof terrainCanvas!=='undefined'&&!!terrainCanvas&&terrainCanvas.width>0&&
          typeof heightF!=='undefined'&&!!heightF&&heightF.length>0&&
          typeof PASS!=='undefined'&&!!PASS&&PASS.length>0&&
          typeof terrVerts!=='undefined'&&!!terrVerts&&terrVerts.length>0&&
          menuReady&&attractReady;
      },null,{timeout:180000});
      const coldBootReady=await page.evaluate(() => ({
        map:typeof curMap==='string'?curMap:'',theme:typeof curTheme==='string'?curTheme:'',
        builtMap:typeof builtMap==='string'?builtMap:'',builtTheme:typeof builtTheme==='string'?builtTheme:'',
        topology:typeof mfWorldTopologyKey==='function'?mfWorldTopologyKey():'',
        builtTopology:typeof builtTopology==='string'?builtTopology:'',
        terrainTexture:typeof terrainTex!=='undefined'&&!!terrainTex,
        terrainCanvas:typeof terrainCanvas!=='undefined'&&terrainCanvas?
          [terrainCanvas.width,terrainCanvas.height]:null,
        heightSamples:typeof heightF!=='undefined'&&heightF?heightF.length:0,
        passSamples:typeof PASS!=='undefined'&&PASS?PASS.length:0,
        terrainVertices:typeof terrVerts!=='undefined'&&terrVerts?terrVerts.length:0,
        menuMode:!!document.body&&document.body.classList.contains('menuMode'),
        menuBackground:typeof menuBg==='function'?menuBg():'',
        attractReady:typeof attractOn==='boolean'&&attractOn,
        attractHq:typeof blds!=='undefined'&&blds.some(B=>B&&B.alive&&B.type==='hq'),
        running:typeof running!=='undefined'&&!!running,matchLive:typeof matchLive!=='undefined'&&!!matchLive
      }));
      const reloadGpu=await assertHardwareGpu(page);recordPwBrowserGpu(browser,reloadGpu);
      const cold=await page.evaluate(() => {
        const state={calls:{sessLoad:0,sessResume:0,newSkirmish:0,deployCarrier:0,sessRestoreInto:0,
          restoreResult:null},coldLoaded:false,coldVersion:null,coldPlanStatus:null,error:''};
        window.__mfRecoveryReloadE2E=state;
        const load0=sessLoad,resume0=sessResume,new0=newSkirmish,deploy0=deployCarrier,restore0=sessRestoreInto;
        sessLoad=function(){state.calls.sessLoad++;return load0.apply(this,arguments);};
        sessResume=function(){state.calls.sessResume++;return resume0.apply(this,arguments);};
        newSkirmish=function(){state.calls.newSkirmish++;return new0.apply(this,arguments);};
        sessRestoreInto=function(){state.calls.sessRestoreInto++;try{const ok=restore0.apply(this,arguments);
          state.calls.restoreResult=!!ok;if(ok)paused=true;return ok;}catch(error){state.error=String(error&&error.stack||error);
          state.calls.restoreResult=false;throw error;}};
        deployCarrier=function(){state.calls.deployCarrier++;return deploy0.apply(this,arguments);};
        const loaded=sessLoad();state.coldLoaded=!!loaded;state.coldVersion=loaded&&loaded.v;
        state.coldPlanStatus=loaded&&loaded.location&&loaded.location.planner&&loaded.location.planner.status;
        try{sessResume();}catch(error){state.error=String(error&&error.stack||error);}
        return {coldLoaded:state.coldLoaded,coldVersion:state.coldVersion,coldPlanStatus:state.coldPlanStatus,
          calls:{...state.calls},error:state.error,reject:window.__mfSessionReject||''};
      });
      await page.waitForFunction(() => window.__mfRecoveryReloadE2E&&
        window.__mfRecoveryReloadE2E.calls.restoreResult!==null,null,{timeout:55000}).catch(()=>{});
      const observed=await page.evaluate(expected => {
        const S=window.__mfRecoveryReloadE2E||{calls:{},error:'instrumentation missing'},near=(a,b)=>
          Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.001;
        const H=heroIdx>=0&&ualive[heroIdx]?heroIdx:-1,mass=deposits[expected.mass.index],energy=geysers[expected.energy.index];
        const hq=blds.find(B=>B&&B.alive&&B.type==='hq'&&B.team===0),
          unitCount=Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]).length,
          bldCount=blds.filter(B=>B&&B.alive).length;
        const callCountsExact=S.calls.sessLoad===2&&S.calls.sessResume===1&&S.calls.newSkirmish===1&&
          S.calls.deployCarrier===1&&S.calls.sessRestoreInto===1&&S.calls.restoreResult===true;
        const stateExact=curMap===expected.map&&near(stats.t,expected.t)&&near(matchClock,expected.clock)&&
          JSON.stringify(stats.kills)===JSON.stringify(expected.kills)&&JSON.stringify(stats.built)===JSON.stringify(expected.built)&&
          near(resM[0],expected.resM0)&&near(resE[0],expected.resE0)&&AI.wave===expected.wave.n&&
          near(AI.waveTimer,expected.wave.timer)&&unitCount===expected.unitCount&&bldCount===expected.bldCount&&
          !!hq&&near(hq.x,expected.hq[0])&&near(hq.y,expected.hq[1])&&H>=0&&near(ux[H],expected.hero.x)&&
          near(uy[H],expected.hero.y)&&near(uhp[H],expected.hero.hp)&&heroLvl===expected.hero.lvl&&
          heroXp===expected.hero.xp&&near(uhpm[H],expected.hero.maxHp)&&
          JSON.stringify(AB_CD)===JSON.stringify(expected.hero.abilityCd)&&
          bonusMass===expected.hero.income[0]&&bonusEnergy===expected.hero.income[1]&&!!mass&&!!energy&&
          near(mass.remaining,expected.mass.remaining)&&mass.surveyed===expected.mass.surveyed&&
          near(energy.remaining,expected.energy.remaining)&&energy.surveyed===expected.energy.surveyed;
        return {calls:{...S.calls},error:S.error||'',reject:window.__mfSessionReject||'',callCountsExact,stateExact,
          matchLive:!!matchLive,sessionKeyCleared:!localStorage.getItem('mf_dropped_session_v1'),
          pendingCleared:typeof sessPending!=='undefined'&&sessPending===null,map:curMap,statsT:stats.t,clock:matchClock,
          banks:[resM[0],resE[0]],hero:H<0?null:{i:H,x:ux[H],y:uy[H],hp:uhp[H],maxHp:uhpm[H],
            lvl:heroLvl,xp:heroXp,abilityCd:AB_CD.slice(),income:[bonusMass,bonusEnergy]},
          resources:{mass:mass&&[mass.remaining,mass.surveyed|0,!!mass.taken],
            energy:energy&&[energy.remaining,energy.surveyed|0,!!energy.taken]},unitCount,bldCount};
      },prepared.expected);
      const passed=cold.coldLoaded&&cold.coldVersion===2&&cold.coldPlanStatus==='FULL_V1'&&
        observed.callCountsExact&&observed.matchLive&&observed.sessionKeyCleared&&observed.pendingCleared&&
        observed.stateExact&&!cold.error&&!observed.error;
      recoveryReloadE2E={status:passed?'PASS':'FAIL',prepared:prepared.expected,
        bootReady:coldBootReady,cold,observed,gpu:reloadGpu};
      await page.evaluate(() => localStorage.removeItem('mf_dropped_session_v1')).catch(()=>{});
      if(!passed)FAIL.push(`FULL_V1 reload recovery E2E failed ${JSON.stringify(recoveryReloadE2E)}`);
    }catch(error){
      recoveryReloadE2E={status:'FAIL',error:String(error&&error.stack||error)};
      FAIL.push(`FULL_V1 reload recovery E2E failed ${recoveryReloadE2E.error.split('\n')[0]}`);
      await page.evaluate(() => localStorage.removeItem('mf_dropped_session_v1')).catch(()=>{});
    }
  }

  await assertPwBrowserOwnership(browser);
  browserEvidence = pwBrowserEvidence(browser);
} catch (error) {
  fatal = String(error && error.stack || error);
  FAIL.push(`fatal: ${fatal.split('\n')[0]}`);
} finally {
  if (browser) {
    try { browserCleanup = await closePwBrowser(browser); }
    catch (error) {
      browserCleanup = { cleanup: { success: false, error: String(error && error.stack || error) } };
      if (!fatal) FAIL.push('browser cleanup failed');
    }
  }
  await server.close();
}

const aelos = results.filter(r => r.template === 'city_brutalist_grid');
const pyraeth = results.filter(r => r.template === 'dome_cluster');
const aelosOk = aelos.filter(r => r.status === 'ok' || r.status === 'ok-with-retries');
const pyraethOk = pyraeth.filter(r => r.status === 'ok' || r.status === 'ok-with-retries');
const incompatible = results.filter(r => r.tag === 'incompatible');
const incompatibleOk = incompatible.filter(r => r.status === 'INCOMPATIBLE' || r.status === 'TEMPLATE_MISSING');
if (!V1_ONLY) {
  if (!aelos.length) FAIL.push('no Aelos prefecture runtime cases');
  if (!pyraeth.length) FAIL.push('no Pyraeth dome runtime cases');
  if (aelos.length && !aelosOk.length) FAIL.push('every Aelos prefecture runtime case missed the site');
  if (pyraeth.length && !pyraethOk.length) FAIL.push('every Pyraeth dome runtime case missed the site');
  if (!incompatible.length) FAIL.push('no incompatible runtime cases');
  if (incompatible.length && incompatibleOk.length !== incompatible.length)
    FAIL.push(`incompatible runtime cases were not typed failures: ${incompatible.filter(r => r.status !== 'INCOMPATIBLE' && r.status !== 'TEMPLATE_MISSING').map(r => r.map + ':' + r.status).join(',')}`);
}
const v1Passed = v1Results.filter(r => r.status === 'PASS');
if (v1Results.length !== v1Cases.length || v1Passed.length !== v1Cases.length)
  FAIL.push(`FULL_V1 runtime cases passed ${v1Passed.length}/${v1Cases.length}`);
if (pageErrors.length) FAIL.push(`${pageErrors.length} page error(s)`);
if (consoleErrors.length) FAIL.push(`${consoleErrors.length} console error(s)`);

const envKind = r => r.status === 'ENVIRONMENTAL_EXHAUSTION' || r.status === 'environmental';
const plotKind = r => r.status === 'REQUIRED_PLOT_ROLLBACK' || r.status === 'required-plot';

const report = {
  schema: 'MassfrontExactTemplateRuntimeProbeV2',
  generatedAt: new Date().toISOString(),
  status: FAIL.length ? 'FAIL' : 'PASS',
  runtimeUrl, gpu, sourceSetSha256, sourceFiles, v1Only: V1_ONLY,
  wrap: worldSrc.includes('siteStampWrapPlan'),
  cases: allCases.length + v1Cases.length, results, v1: {
    maps: v1Results.length, passed: v1Passed.length, rows: v1Results
  },
  deepChecks,recoveryReloadE2E,
  aelosPrefecture: { maps: aelos.length, realized: aelosOk.length, environmental: aelos.filter(envKind).length, requiredPlot: aelos.filter(plotKind).length },
  pyraethDomes: { maps: pyraeth.length, realized: pyraethOk.length, environmental: pyraeth.filter(envKind).length, requiredPlot: pyraeth.filter(plotKind).length },
  incompatible: { maps: incompatible.length, typed: incompatibleOk.length, rows: incompatible.map(r => ({ map: r.map, class: r.class, status: r.status, reason: r.reason, hash: r.hash })) },
  environmental: results.filter(envKind),
  requiredPlot: results.filter(plotKind),
  silentDrop: results.filter(r => r.status === 'silent-drop'),
  templateMissing: results.filter(r => r.status === 'TEMPLATE_MISSING'),
  fails: FAIL, warnings: WARN,
  errors: { fatal, pageErrors, consoleErrors },
  browser: browserEvidence || null, browserCleanup
};
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status} exact-template runtime`);
console.log(`cases ${results.length}  aelos prefecture ${aelosOk.length}/${aelos.length}  pyraeth domes ${pyraethOk.length}/${pyraeth.length}`);
console.log(`FULL_V1 ${v1Passed.length}/${v1Cases.length}`);
console.log(`incompatible typed ${incompatibleOk.length}/${incompatible.length}  environmental ${report.environmental.length}  required-plot ${report.requiredPlot.length}  silent-drop ${report.silentDrop.length}`);
if (WARN.length) console.log(WARN.map(x => 'WARN  ' + x).join('\n'));
if (FAIL.length) console.log(FAIL.map(x => 'FAIL  ' + x).join('\n'));
console.log(`report ${join(OUT, 'report.json')}`);
process.exitCode = FAIL.length ? 1 : 0;
