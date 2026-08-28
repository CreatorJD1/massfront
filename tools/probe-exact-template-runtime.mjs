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
const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = rel => readFileSync(join(ROOT, rel), 'utf8');

const SOURCE_PATHS = [
  'assets/data/sitetemplates.js',
  'src/engine/worldsites.js',
  'src/game/sim.js',
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

const cases = [];
for (const map of maps) {
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
  { map: 'aelos_coast_medium', class: 'spaceport', name: null, template: null, force: null, tag: 'incompatible', forbidden: ['ORBITAL APRON'] },
  { map: 'aelos_coast_large', class: 'spaceport', name: null, template: null, force: null, tag: 'incompatible', forbidden: ['ORBITAL APRON'] }
].filter(C => maps.some(M => M.id === C.map));

function mapRequest(C) {
  const map = maps.find(M => M.id === C.map);
  return map ? (map[classRequestKey(C.class)] | 0) : 1;
}
const allCases = [
  ...productionCases.map(C => ({ ...C, requested: mapRequest(C), tag: 'production' })),
  ...incompatibleCases.map(C => ({ ...C, requested: mapRequest(C) })),
  ...cases.map(C => ({ ...C, tag: 'force' }))
];

const FAIL = [], WARN = [];
const pageErrors = [], consoleErrors = [];
let fatal = null, gpu = null, runtimeUrl = null, browserCleanup = null, browserEvidence = null;
const results = [];

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
  if (boot.stampVer !== 2) FAIL.push(`SITE_STAMP.ver is ${boot.stampVer}, expected 2`);
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

  for (let i = 0; i < allCases.length; i++) {
    const C = allCases[i];
    const T = C.template ? templates.SITE_TPL[C.template] : null;
    const label = `${C.map}/${C.tag}/${C.template || C.class}`;
    process.stdout.write(`[${i + 1}/${allCases.length}] ${C.tag} ${C.map} ${C.template || C.class}\n`);
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
if (!aelos.length) FAIL.push('no Aelos prefecture runtime cases');
if (!pyraeth.length) FAIL.push('no Pyraeth dome runtime cases');
if (aelos.length && !aelosOk.length) FAIL.push('every Aelos prefecture runtime case missed the site');
if (pyraeth.length && !pyraethOk.length) FAIL.push('every Pyraeth dome runtime case missed the site');
if (!incompatible.length) FAIL.push('no incompatible runtime cases');
if (incompatible.length && incompatibleOk.length !== incompatible.length)
  FAIL.push(`incompatible runtime cases were not typed failures: ${incompatible.filter(r => r.status !== 'INCOMPATIBLE' && r.status !== 'TEMPLATE_MISSING').map(r => r.map + ':' + r.status).join(',')}`);
if (pageErrors.length) FAIL.push(`${pageErrors.length} page error(s)`);
if (consoleErrors.length) FAIL.push(`${consoleErrors.length} console error(s)`);

const envKind = r => r.status === 'ENVIRONMENTAL_EXHAUSTION' || r.status === 'environmental';
const plotKind = r => r.status === 'REQUIRED_PLOT_ROLLBACK' || r.status === 'required-plot';

const report = {
  schema: 'MassfrontExactTemplateRuntimeProbeV2',
  generatedAt: new Date().toISOString(),
  status: FAIL.length ? 'FAIL' : 'PASS',
  runtimeUrl, gpu, sourceSetSha256, sourceFiles,
  wrap: worldSrc.includes('siteStampWrapPlan'),
  cases: allCases.length, results,
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
console.log(`incompatible typed ${incompatibleOk.length}/${incompatible.length}  environmental ${report.environmental.length}  required-plot ${report.requiredPlot.length}  silent-drop ${report.silentDrop.length}`);
if (WARN.length) console.log(WARN.map(x => 'WARN  ' + x).join('\n'));
if (FAIL.length) console.log(FAIL.map(x => 'FAIL  ' + x).join('\n'));
console.log(`report ${join(OUT, 'report.json')}`);
process.exitCode = FAIL.length ? 1 : 0;
