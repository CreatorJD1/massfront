#!/usr/bin/env node
/* Phone 412×915 War Table recapture. Writes .tmp/wartable-mobile-YYYY-MM-DD/
   so stage0 / planner folders are not raced. Do not commit. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', process.argv[2] || 'wartable-mobile-2026-08-14');
await mkdir(outDir, { recursive: true });

const [androidManifest, iosInfo, webManifestText] = await Promise.all([
  readFile(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8'),
  readFile(join(root, 'ios', 'App', 'App', 'Info.plist'), 'utf8'),
  readFile(join(root, 'assets', 'app.webmanifest'), 'utf8')
]);
const iosPhoneOrientations = (iosInfo.match(/<key>UISupportedInterfaceOrientations<\/key>[\s\S]*?<\/array>/) || [''])[0];
const iosTabletOrientations = (iosInfo.match(/<key>UISupportedInterfaceOrientations~ipad<\/key>[\s\S]*?<\/array>/) || [''])[0];
const webManifest = JSON.parse(webManifestText);
const nativeOrientationPolicy = {
  androidRespectsUserRotation: /android:screenOrientation="fullUser"/.test(androidManifest),
  iosPhonePortrait: /UIInterfaceOrientationPortrait/.test(iosPhoneOrientations),
  iosPhoneLandscapeLeft: /UIInterfaceOrientationLandscapeLeft/.test(iosPhoneOrientations),
  iosPhoneLandscapeRight: /UIInterfaceOrientationLandscapeRight/.test(iosPhoneOrientations),
  iosTabletPortrait: /UIInterfaceOrientationPortrait/.test(iosTabletOrientations),
  iosTabletPortraitUpsideDown: /UIInterfaceOrientationPortraitUpsideDown/.test(iosTabletOrientations),
  iosTabletLandscapeLeft: /UIInterfaceOrientationLandscapeLeft/.test(iosTabletOrientations),
  iosTabletLandscapeRight: /UIInterfaceOrientationLandscapeRight/.test(iosTabletOrientations),
  pwaAllowsAnyOrientation: webManifest.orientation === 'any'
};

const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm'
};
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';
console.log('serving ' + url);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: chrome, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const footMetrics = () => {
  const foot = document.querySelector('#setupScr .setupFoot');
  const back = document.getElementById('setupBack');
  const launch = document.getElementById('setupStart');
  const cs = foot ? getComputedStyle(foot) : null;
  const br = back ? back.getBoundingClientRect() : null;
  const lr = launch ? launch.getBoundingClientRect() : null;
  return {
    stage: typeof mfGalaxyStage !== 'undefined' ? mfGalaxyStage : '',
    backText: back ? back.textContent.replace(/\s+/g, ' ').trim() : '',
    launchText: launch ? launch.textContent.replace(/\s+/g, ' ').trim() : '',
    footDisplay: cs ? cs.display : 'missing',
    grid: cs ? cs.gridTemplateColumns : '',
    backW: br ? Math.round(br.width) : 0,
    launchW: lr ? Math.round(lr.width) : 0,
    widthDelta: (br && lr) ? Math.abs(Math.round(br.width) - Math.round(lr.width)) : null,
    equalWidth: !!(br && lr && Math.abs(br.width - lr.width) <= 2),
    y: br ? Math.round(br.y) : null
  };
};

const layoutMetrics = () => {
  const setup = document.getElementById('setupScr');
  const scroll = setup && setup.querySelector('.setupScroll');
  const foot = setup && setup.querySelector('.setupFoot');
  const world = document.getElementById('mfWorldStrip');
  const region = document.getElementById('mfRegionStrip');
  const mapRow = document.getElementById('mapRow');
  const cv = document.getElementById('mfGalaxyCanvas');
  const dossier = document.getElementById('mfGalaxySelection');
  const fr = foot && foot.getBoundingClientRect();
  const sr = scroll && scroll.getBoundingClientRect();
  const head = setup && setup.querySelector('.setupHead');
  const hr = head && head.getBoundingClientRect();
  const stage = typeof mfGalaxyStage !== 'undefined' ? mfGalaxyStage : '';
  const activeSelector = stage === 'galaxy' ? '.mfGalaxyViewport'
    : stage === 'system' ? '.mfSystemViewport'
    : stage === 'planet' ? '.mfPlanetViewport'
    : stage === 'region' ? '#mapRow .mapCard.sel'
    : stage === 'deploy' ? '#mfStageDeploy .mfMissionHero' : '';
  const active = activeSelector ? document.querySelector(activeSelector) : null;
  const activeCanvas = active && active.querySelector('canvas');
  const ar = active && active.getBoundingClientRect();
  const crx = activeCanvas && activeCanvas.getBoundingClientRect();
  const gridCount = el => {
    if (!el) return 0;
    const cols = getComputedStyle(el).gridTemplateColumns.trim();
    return cols && cols !== 'none' ? cols.split(/\s+/).length : 0;
  };
  let dossierTargetOverlaps = 0;
  if (cv && dossier && typeof mfGalaxyTargets !== 'undefined') {
    const cr = cv.getBoundingClientRect(), dr = dossier.getBoundingClientRect();
    const sx = cr.width / Math.max(1, cv.width), sy = cr.height / Math.max(1, cv.height);
    for (const T of mfGalaxyTargets) {
      const x = cr.left + T.x * sx, y = cr.top + T.y * sy;
      /* The 56-backing-pixel touch radius may legitimately extend beneath the
         pointer-transparent dossier. What must never be masked is the visible
         core/label center itself. Counting full hit circles made a safe layout
         fail even though taps pass through and every caption remains legible. */
      if (x > dr.left && x < dr.right && y > dr.top && y < dr.bottom) dossierTargetOverlaps++;
    }
  }
  const clipTop = Math.max(0, sr ? sr.top : 0, ar ? ar.top : 0);
  const clipBottom = Math.min(innerHeight, sr ? sr.bottom : innerHeight, fr ? fr.top : innerHeight, ar ? ar.bottom : innerHeight);
  const activeVisiblePx = ar ? Math.max(0, clipBottom - clipTop) : 0;
  const activeVisibleFraction = ar && ar.height ? activeVisiblePx / ar.height : 0;
  let activeCenterHit = '';
  if (crx) {
    const hit = document.elementFromPoint(crx.left + crx.width * .5, crx.top + crx.height * .5);
    activeCenterHit = hit ? (hit.id || hit.tagName || '') : '';
  }
  const chips = stage === 'galaxy' ? Array.from(document.querySelectorAll('#mfWorldStrip .mfWorldChip'))
    : stage === 'planet' ? Array.from(document.querySelectorAll('#mfRegionStrip .mfRegionChip')) : [];
  const chipVisible = chips.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1
      && r.top >= (sr ? sr.top - 1 : -1) && r.bottom <= (fr ? fr.top + 1 : innerHeight + 1);
  }).length;
  const maps = Array.from(document.querySelectorAll('#mapRow .mapCard'));
  const mapVisible = maps.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1
      && r.bottom > (sr ? sr.top : 0) && r.top < (fr ? fr.top : innerHeight);
  }).length;
  const mapFullyVisible = maps.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1
      && r.top >= (sr ? sr.top - 1 : -1) && r.bottom <= (fr ? fr.top + 1 : innerHeight + 1);
  }).length;
  const tapEls = [
    ...document.querySelectorAll('.mfGalaxyStep'),
    ...document.querySelectorAll('#setupScr .setupFoot button'),
    ...chips,
    ...(stage === 'region' ? maps : [])
  ].filter(el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  });
  const tapRects = tapEls.map(el => {
    const r = el.getBoundingClientRect(); return { id: el.id || el.dataset.mfStage || el.dataset.map || el.className,
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  });
  const minTapW = tapRects.length ? Math.min(...tapRects.map(r => r.w)) : 0;
  const minTapH = tapRects.length ? Math.min(...tapRects.map(r => r.h)) : 0;
  return {
    stage,
    viewport: { w: innerWidth, h: innerHeight },
    windowScroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
    documentOverflowX: document.documentElement.scrollWidth - innerWidth,
    setupOverflowX: setup ? setup.scrollWidth - setup.clientWidth : null,
    scrollOverflowX: scroll ? scroll.scrollWidth - scroll.clientWidth : null,
    worldColumns: gridCount(world),
    regionColumns: gridCount(region),
    mapLayout: mapRow ? getComputedStyle(mapRow).display : 'missing',
    mapColumns: gridCount(mapRow),
    mapCount: maps.length,
    mapVisible,
    mapFullyVisible,
    footerVisible: !!(fr && fr.top >= -1 && fr.bottom <= innerHeight + 1),
    headerVisible: !!(hr && hr.top >= -1 && hr.bottom <= innerHeight + 1),
    scroll: sr ? { top: Math.round(sr.top), bottom: Math.round(sr.bottom), height: Math.round(sr.height), max: Math.round(scroll.scrollHeight - scroll.clientHeight) } : null,
    activeSpatialView: ar ? { selector: activeSelector, left: Math.round(ar.left), top: Math.round(ar.top), right: Math.round(ar.right), bottom: Math.round(ar.bottom), width: Math.round(ar.width), height: Math.round(ar.height) } : null,
    activeVisiblePx: Math.round(activeVisiblePx),
    activeVisibleFraction: Math.round(activeVisibleFraction * 1000) / 1000,
    activeCenterHit,
    chipCount: chips.length,
    chipVisible,
    contentFooterOverlapPx: ar && fr ? Math.max(0, Math.round(ar.bottom - fr.top)) : 0,
    tapTargets: { count: tapRects.length, minW: minTapW, minH: minTapH,
      under44: tapRects.filter(r => r.w < 44 || r.h < 44).slice(0, 12) },
    dossierPointerEvents: dossier ? getComputedStyle(dossier).pointerEvents : 'missing',
    dossierTargetOverlaps
  };
};

try {
  const page = await browser.newPage({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  const consoleErrs = [];
  const resourceConsoleErrs = [];
  const requestFails = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('ERR ' + e.message); });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const msg = m.text();
    /* Chromium mirrors blocked/404 resource loads into console.error. They are
       retained separately with requestfailed detail, but are not JavaScript
       runtime exceptions and must not hide a clean offline UI run. */
    if (/^Failed to load resource:/i.test(msg)) resourceConsoleErrs.push(msg);
    else consoleErrs.push(msg);
    console.log('CONSOLE ERROR ' + msg);
  });
  page.on('requestfailed', req => {
    const msg = (req.failure() && req.failure().errorText || 'failed') + ' ' + req.url();
    requestFails.push(msg); console.log('REQUEST FAILED ' + msg);
  });
  await page.addInitScript(() => {
    try {
      /* launchPwBrowser uses a dedicated repo QA profile. A preceding battle
         can otherwise leave conquest state that makes a later UI-only run
         nondeterministic; this never touches the user's normal Chrome data. */
      localStorage.clear();
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return { renderer: 'NO-WEBGL2' };
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER)) };
  });
  console.log('UNMASKED_RENDERER_WEBGL: ' + gpu.renderer);
  if (/swiftshader|software|llvmpipe/i.test(gpu.renderer)) {
    throw new Error('REFUSING: software renderer ' + gpu.renderer);
  }

  try {
    await page.waitForFunction(() =>
      typeof openPlanetarySetup === 'function' &&
      typeof mfGalaxyReady !== 'undefined' && mfGalaxyReady === true &&
      typeof mfGalaxyOpenOriginal === 'function' &&
      typeof PLANETS === 'object', null, { timeout: 120000 });
  } catch (e) {
    const readiness = await page.evaluate(() => ({
      ready: typeof mfGalaxyReady === 'undefined' ? 'undefined' : mfGalaxyReady,
      open: typeof openPlanetarySetup,
      original: typeof mfGalaxyOpenOriginal,
      planets: typeof PLANETS,
      setup: !!document.getElementById('setupScr'),
      scroll: !!document.querySelector('#setupScr .setupScroll'),
      galaxyHost: !!document.querySelector('.mfGalaxyHost'),
      scripts: Array.from(document.scripts).slice(-8).map(s => s.src || '[inline]')
    })).catch(evalError => ({ evaluateError: String(evalError) }));
    throw new Error('War Table readiness timeout: ' + JSON.stringify(readiness) +
      '; console=' + JSON.stringify(consoleErrs.slice(-12)) +
      '; page=' + JSON.stringify(errs.slice(-12)) +
      '; requests=' + JSON.stringify(requestFails.slice(-12)) + '; ' + e.message);
  }
  await page.waitForTimeout(300);

  const pngChecks = [];
  const verifyPng = async (name, buffer) => {
    const signature = buffer.subarray(0, 8).toString('hex').toUpperCase();
    if (signature !== '89504E470D0A1A0A') throw new Error(name + ': invalid PNG signature ' + signature);
    const decoded = await page.evaluate(async b64 => {
      const raw = atob(b64), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const stride = Math.max(1, Math.floor(Math.sqrt((canvas.width * canvas.height) / 50000)));
      let n = 0, mean = 0, m2 = 0, min = 255, max = 0, opaque = 0;
      for (let y = 0; y < canvas.height; y += stride) for (let x = 0; x < canvas.width; x += stride) {
        const i = (y * canvas.width + x) * 4, a = data[i + 3];
        const lum = data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
        if (a) opaque++; min = Math.min(min, lum); max = Math.max(max, lum);
        n++; const delta = lum - mean; mean += delta / n; m2 += delta * (lum - mean);
      }
      return { width: canvas.width, height: canvas.height, samples: n, opaque,
        luminanceRange: Math.round((max - min) * 100) / 100,
        luminanceStdDev: Math.round(Math.sqrt(m2 / Math.max(1, n - 1)) * 100) / 100 };
    }, buffer.toString('base64'));
    if (!decoded.width || !decoded.height || decoded.opaque === 0 || decoded.luminanceRange < 2 || decoded.luminanceStdDev < .25) {
      throw new Error(name + ': decoded PNG has no meaningful pixel variance ' + JSON.stringify(decoded));
    }
    const check = Object.assign({ name, signature }, decoded); pngChecks.push(check);
    console.log('png qa ' + JSON.stringify(check));
  };
  const shot = async (name) => {
    const p = join(outDir, name);
    const buffer = await page.screenshot({ path: p, fullPage: false });
    await verifyPng(name, buffer);
    console.log('wrote ' + p);
    return p;
  };
  const shotEl = async (sel, name) => {
    const h = await page.$(sel);
    if (!h) { console.log('skip ' + name + ': no ' + sel); return; }
    const p = join(outDir, name);
    const buffer = await h.screenshot({ path: p, timeout: 8000 });
    await verifyPng(name, buffer);
    console.log('wrote ' + p);
  };
  const settleUi = async (ms = 700) => {
    await page.waitForTimeout(ms);
    await page.evaluate(() => new Promise(resolveFrame =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  };

  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    document.body.classList.add('mfIntroDone');
    /* This is a layout/art capture, not a first-run tutorial capture. Mark the
       primer complete so its deliberately large teaching card cannot hide the
       galaxy, dossier or four-column landscape strips being measured. */
    if (typeof META !== 'undefined' && META) META.warPrimer = {
      done: true, version: 2, forceFull: false,
      seen: { galaxy:true, system:true, planet:true, region:true, deploy:true }
    };
    const primer = document.getElementById('wtpCard'); if (primer) primer.remove();
    for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
      const el = document.getElementById(id);
      if (el) el.style.setProperty('display', 'none', 'important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
    openPlanetarySetup('standard');
    mfGalaxySelectSystem('sombrero', false);
    mfGalaxyYaw = 0.12;
    mfGalaxyPitch = -0.20;
    mfGalaxySetStage('galaxy');
    if (typeof mfGalaxyStopAnim === 'function') mfGalaxyStopAnim();
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    if (typeof mfGalaxyDraw === 'function') mfGalaxyDraw(performance.now());
  });
  await page.waitForSelector('#mfGalaxyCanvas', { timeout: 15000 });
  await settleUi();
  await shot('01-galaxy-dock.png');
  await shotEl('#setupScr .setupFoot', '01b-galaxy-foot.png');
  const galaxy = await page.evaluate(footMetrics);
  const portraitGalaxyLayout = await page.evaluate(layoutMetrics);
  console.log('galaxy ' + JSON.stringify(galaxy));

  await page.evaluate(() => {
    mfGalaxySelectSystem('sombrero', false);
    mfGalaxySetStage('system');
    if (typeof mfGalaxyStopAnim === 'function') mfGalaxyStopAnim();
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    /* Fixed clock so Aelos sits on the ellipse, sun stays screen-center.
       t=12000 → ~103° from 3 o'clock (upper-left of the ring). */
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(12000);
  });
  await page.waitForSelector('#mfSystemCanvas', { timeout: 8000 });
  await settleUi();
  await shot('02-system-dock.png');
  await shotEl('#mfSystemCanvas', '02b-system-orbit.png');
  await shotEl('#setupScr .setupFoot', '02c-system-foot.png');
  const system = await page.evaluate(() => {
    const foot = (function () {
      const footEl = document.querySelector('#setupScr .setupFoot');
      const back = document.getElementById('setupBack');
      const launch = document.getElementById('setupStart');
      const cs = footEl ? getComputedStyle(footEl) : null;
      const br = back ? back.getBoundingClientRect() : null;
      const lr = launch ? launch.getBoundingClientRect() : null;
      return {
        stage: mfGalaxyStage,
        backText: back ? back.textContent.replace(/\s+/g, ' ').trim() : '',
        launchText: launch ? launch.textContent.replace(/\s+/g, ' ').trim() : '',
        footDisplay: cs ? cs.display : 'missing',
        grid: cs ? cs.gridTemplateColumns : '',
        backW: br ? Math.round(br.width) : 0,
        launchW: lr ? Math.round(lr.width) : 0,
        widthDelta: (br && lr) ? Math.abs(Math.round(br.width) - Math.round(lr.width)) : null,
        equalWidth: !!(br && lr && Math.abs(br.width - lr.width) <= 2)
      };
    })();
    const cv = document.getElementById('mfSystemCanvas');
    const home = (mfSystemTargets && mfSystemTargets[0]) || null;
    return Object.assign(foot, {
      canvas: cv ? { w: cv.width, h: cv.height } : null,
      home: home ? { key: home.key, x: Math.round(home.x), y: Math.round(home.y), r: Math.round(home.r) } : null,
      sunFixed: true
    });
  });
  console.log('system ' + JSON.stringify(system));

  await page.evaluate(() => {
    planetYaw = 0.42;
    planetPitch = -0.08;
    mfGalaxySetStage('planet');
    const sc = document.querySelector('#setupScr .setupScroll');
    if (sc) sc.scrollTop = 0;
    const cv = document.getElementById('mfPlanetCanvas');
    if (cv && typeof draw3DPlanetSphere === 'function') draw3DPlanetSphere(cv, mfGalaxyPlanetKey(), planetYaw, planetPitch, curRegionId);
  });
  await page.waitForSelector('#mfPlanetCanvas', { timeout: 8000 });
  await settleUi();
  await shot('03-planet-dock.png');
  await shotEl('#mfPlanetCanvas', '03b-planet-globe.png');
  await shotEl('#setupScr .setupFoot', '03c-planet-foot.png');
  const planet = await page.evaluate(footMetrics);
  const portraitPlanetLayout = await page.evaluate(layoutMetrics);
  console.log('planet ' + JSON.stringify(planet));

  await page.evaluate(() => {
    curRegionId = 'aelos_north'; curMap = 'aelos_north_small'; curTheme = 'verdant';
    mfGalaxySetStage('region');
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
  });
  await page.waitForSelector('#mapRow .mapCard', { timeout: 8000 });
  await settleUi();
  await page.evaluate(() => { const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0; });
  await settleUi(120);
  await shot('04-region-dock.png');
  const portraitRegionTopLayout = await page.evaluate(layoutMetrics);
  await page.evaluate(() => {
    const sc = document.querySelector('#setupScr .setupScroll'), row = document.getElementById('mapRow');
    if (sc && row) sc.scrollTop = Math.max(0, row.offsetTop - 8);
  });
  await settleUi(250);
  await shot('04b-map-dock.png');
  await shotEl('#mapRow', '04c-map-selector.png');
  const portraitMapLayout = await page.evaluate(layoutMetrics);

  await page.evaluate(() => {
    mfGalaxySetStage('deploy');
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
  });
  await page.waitForSelector('#mfStageDeploy .mfMissionHero', { timeout: 8000 });
  await settleUi();
  await shot('05-deploy-dock.png');
  const portraitDeployLayout = await page.evaluate(layoutMetrics);

  await page.setViewportSize({ width: 915, height: 412 });
  await page.evaluate(() => {
    mfGalaxySetStage('galaxy');
    if (typeof mfGalaxyStopAnim === 'function') mfGalaxyStopAnim();
    const primer = document.getElementById('wtpCard'); if (primer) primer.remove();
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
    if (typeof mfGalaxyDraw === 'function') mfGalaxyDraw(12000);
  });
  await settleUi();
  await shot('03d-landscape-galaxy.png');
  await shotEl('.mfGalaxyViewport', '03d2-landscape-galaxy-map.png');
  const landscapeGalaxy = await page.evaluate(layoutMetrics);
  console.log('landscape galaxy ' + JSON.stringify(landscapeGalaxy));

  await page.evaluate(() => {
    mfGalaxySetStage('system');
    if (typeof mfGalaxyStopAnim === 'function') mfGalaxyStopAnim();
    const primer = document.getElementById('wtpCard'); if (primer) primer.remove();
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
    if (typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(12000);
  });
  await settleUi();
  await shot('03e-landscape-system.png');
  await shotEl('.mfSystemViewport', '03e2-landscape-system-orbit.png');
  const landscapeSystem = await page.evaluate(layoutMetrics);
  console.log('landscape system ' + JSON.stringify(landscapeSystem));

  await page.evaluate(() => {
    mfGalaxySetStage('planet');
    const primer = document.getElementById('wtpCard'); if (primer) primer.remove();
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
    const cv = document.getElementById('mfPlanetCanvas');
    if (cv && typeof draw3DPlanetSphere === 'function') draw3DPlanetSphere(cv, mfGalaxyPlanetKey(), planetYaw, planetPitch, curRegionId);
  });
  await settleUi();
  await shot('03f-landscape-planet.png');
  await shotEl('.mfPlanetViewport', '03f2-landscape-planet-globe.png');
  const landscapePlanet = await page.evaluate(layoutMetrics);
  console.log('landscape planet ' + JSON.stringify(landscapePlanet));

  await page.evaluate(() => {
    mfGalaxySetStage('region');
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
  });
  await settleUi();
  await page.evaluate(() => { const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0; });
  await settleUi(120);
  await shot('03g-landscape-region-map.png');
  await shotEl('#mapRow', '03g2-landscape-map-selector.png');
  const landscapeRegion = await page.evaluate(layoutMetrics);
  console.log('landscape region ' + JSON.stringify(landscapeRegion));

  await page.evaluate(() => {
    mfGalaxySetStage('deploy');
    const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
  });
  await settleUi();
  await shot('03h-landscape-deploy.png');
  const landscapeDeploy = await page.evaluate(layoutMetrics);
  console.log('landscape deploy ' + JSON.stringify(landscapeDeploy));

  /* A phone-only capture can pass while tablet and desktop break at different
     media-query boundaries. Exercise every War Table stage at both wider
     form factors on the real app, and retain a screenshot for comparison. */
  const captureFormFactor = async (key, width, height) => {
    await page.setViewportSize({ width, height });
    const stages = {};
    for (const stage of ['galaxy', 'system', 'planet', 'region', 'deploy']) {
      await page.evaluate(nextStage => {
        mfGalaxySetStage(nextStage);
        const primer = document.getElementById('wtpCard'); if (primer) primer.remove();
        const sc = document.querySelector('#setupScr .setupScroll'); if (sc) sc.scrollTop = 0;
        if (nextStage === 'galaxy' && typeof mfGalaxyDraw === 'function') mfGalaxyDraw(12000);
        if (nextStage === 'system' && typeof mfGalaxyDrawSystemView === 'function') mfGalaxyDrawSystemView(12000);
        if (nextStage === 'planet') {
          const cv = document.getElementById('mfPlanetCanvas');
          if (cv && typeof draw3DPlanetSphere === 'function') draw3DPlanetSphere(cv, mfGalaxyPlanetKey(), planetYaw, planetPitch, curRegionId);
        }
      }, stage);
      await settleUi(350);
      await shot(`${key}-${stage}.png`);
      stages[stage] = await page.evaluate(layoutMetrics);
    }
    return { viewport: { width, height }, stages };
  };

  const tablet = await captureFormFactor('07-tablet-1024x768', 1024, 768);
  const desktop = await captureFormFactor('08-desktop-1440x900', 1440, 900);

  await page.setViewportSize({ width: 412, height: 915 });

  let battle = { ok: false, reason: 'not attempted' };
  try {
    await page.evaluate(() => {
      infestationOn = false;
      fogOn = false;
      defenseFocus = 0;
      curMap = 'aelos_north_small';
      curTheme = 'verdant';
      curRegionId = 'aelos_north';
      if (typeof META !== 'undefined' && META.settings) {
        META.settings.fog = false;
        META.settings.dayNight = false;
      }
      dayT = 0.08;
      if (typeof hideFrontScreens === 'function') hideFrontScreens();
      const setup = document.getElementById('setupScr');
      if (setup) setup.style.display = 'none';
      document.body.classList.remove('menuMode', 'mfMenuOpen');
      document.body.dataset.frontScreen = '';
      newSkirmish();
    });
    await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, null, { timeout: 90000 });
    await page.waitForFunction(() => typeof carrier !== 'undefined' && carrier && carrier.active && carrier.phase === 1, null, { timeout: 30000 });
    await page.waitForTimeout(200);
    battle = await page.evaluate(() => {
      try { if (typeof apClose === 'function') apClose(); } catch (e) {}
      for (const id of ['pauseOverlay', 'gameOver', 'levelUp', 'loadScr', 'dispatch', 'apOverlay', 'setupScr']) {
        const e = document.getElementById(id); if (e) e.style.setProperty('display', 'none', 'important');
      }
      demoMode = false; running = true; paused = false; fogOn = false; gameEnded = false;
      try { if (typeof deployCarrier === 'function') deployCarrier(); } catch (e) {}
      matchLive = true; paused = true;
      for (const id of ['toast', 'coach']) {
        const e = document.getElementById(id); if (e) { e.style.display = 'none'; e.textContent = ''; }
      }
      try { if (typeof clearFirstContactGuide === 'function') clearFirstContactGuide(); } catch (e) {}
      if (typeof refreshBldLive === 'function') refreshBldLive();
      const cities = (typeof cityZones !== 'undefined' && cityZones) ? cityZones : [];
      const Z = cities[0];
      if (Z) { cam.x = Z.x; cam.y = Z.y; }
      camFollow = -1;
      camYaw = yawTarget = 0.28;
      camPitch = pitchTarget = 0.95;
      orthoSpan = distTarget = 520;
      if (typeof showHudDock === 'function') showHudDock(true, 'orders');
      if (typeof clampCam === 'function') clampCam();
      if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
      if (typeof updateHUD === 'function') updateHUD(60);
      if (typeof render === 'function') render(0.016);
      const popEl = document.getElementById('unitV');
      return {
        ok: true,
        cities: cities.length,
        map: curMap,
        theme: curTheme,
        popText: popEl ? popEl.textContent : '',
        popCap: typeof populationCapFor === 'function' ? populationCapFor(0) : null
      };
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => { if (typeof updateHUD === 'function') updateHUD(60); if (typeof render === 'function') render(0.016); });
    await shot('06-battle-city-tactical.png');
    const mm = await page.$('#minimap') || await page.$('canvas#mm') || await page.$('#mm');
    if (mm) {
      const p = join(outDir, '06b-minimap.png');
      const buffer = await mm.screenshot({ path: p, timeout: 8000 });
      await verifyPng('06b-minimap.png', buffer);
      console.log('wrote ' + p);
    } else {
      console.log('skip 06b-minimap.png: no minimap node');
    }
  } catch (e) {
    battle = Object.assign(battle || {}, { ok: false, reason: String(e && e.message || e) });
    console.log('BATTLE SKIP: ' + battle.reason);
  }

  const tabletLayouts = Object.values(tablet.stages);
  const desktopLayouts = Object.values(desktop.stages);
  const noHorizontalOverflow = layouts => layouts.every(m =>
    m.documentOverflowX <= 1 && m.setupOverflowX <= 1 && m.scrollOverflowX <= 1);
  const routesVisible = layouts => layouts.every(m =>
    m.headerVisible && m.footerVisible && m.activeVisibleFraction >= .9);
  const tapsAtLeast44 = layouts => layouts.every(m => m.tapTargets.under44.length === 0);
  const report = {
    gpu: gpu.renderer,
    viewport: { w: 412, h: 915 },
    nativeOrientationPolicy,
    errs: errs.slice(0, 12), consoleErrs: consoleErrs.slice(0, 12), resourceConsoleErrs: resourceConsoleErrs.slice(0, 12), requestFails: requestFails.slice(0, 12), pngChecks,
    galaxy, system, planet, portraitGalaxyLayout, portraitPlanetLayout,
    portraitRegionTopLayout, portraitMapLayout, portraitDeployLayout,
    landscapeGalaxy, landscapeSystem, landscapePlanet, landscapeRegion, landscapeDeploy,
    tablet, desktop, battle,
    gates: {
      galaxyWarRoomEnterSombrero: !!(/WAR ROOM/i.test(galaxy.backText) && /ENTER SOMBRERO/i.test(galaxy.launchText)),
      galaxyEqualWidth: !!galaxy.equalWidth,
      systemWarRoomEnterAelos: !!(/WAR ROOM/i.test(system.backText) && /ENTER AELOS/i.test(system.launchText)),
      systemEqualWidth: !!system.equalWidth,
      planetPreviousOpenRegion: !!(/PREVIOUS/i.test(planet.backText) && /OPEN REGION/i.test(planet.launchText)),
      planetEqualWidth: !!planet.equalWidth,
      portraitNoHorizontalOverflow: !!(
        portraitGalaxyLayout.documentOverflowX <= 1 && portraitGalaxyLayout.setupOverflowX <= 1 && portraitGalaxyLayout.scrollOverflowX <= 1 &&
        portraitPlanetLayout.documentOverflowX <= 1 && portraitPlanetLayout.setupOverflowX <= 1 && portraitPlanetLayout.scrollOverflowX <= 1 &&
        portraitRegionTopLayout.documentOverflowX <= 1 && portraitRegionTopLayout.setupOverflowX <= 1 && portraitRegionTopLayout.scrollOverflowX <= 1 &&
        portraitMapLayout.documentOverflowX <= 1 && portraitMapLayout.setupOverflowX <= 1 && portraitMapLayout.scrollOverflowX <= 1 &&
        portraitDeployLayout.documentOverflowX <= 1 && portraitDeployLayout.setupOverflowX <= 1 && portraitDeployLayout.scrollOverflowX <= 1
      ),
      portraitTwoColumnChips: portraitGalaxyLayout.worldColumns === 2 && portraitPlanetLayout.regionColumns === 2,
      portraitMapReachable: portraitMapLayout.mapCount === 3 && portraitMapLayout.mapVisible >= 1 && portraitMapLayout.activeVisibleFraction >= .9,
      portraitFooterVisible: [portraitGalaxyLayout, portraitPlanetLayout, portraitRegionTopLayout, portraitMapLayout, portraitDeployLayout].every(m => m.footerVisible),
      landscapeNoHorizontalOverflow: !!(
        landscapeGalaxy.documentOverflowX <= 1 && landscapeGalaxy.setupOverflowX <= 1 && landscapeGalaxy.scrollOverflowX <= 1 &&
        landscapeSystem.documentOverflowX <= 1 && landscapeSystem.setupOverflowX <= 1 && landscapeSystem.scrollOverflowX <= 1 &&
        landscapePlanet.documentOverflowX <= 1 && landscapePlanet.setupOverflowX <= 1 && landscapePlanet.scrollOverflowX <= 1 &&
        landscapeRegion.documentOverflowX <= 1 && landscapeRegion.setupOverflowX <= 1 && landscapeRegion.scrollOverflowX <= 1 &&
        landscapeDeploy.documentOverflowX <= 1 && landscapeDeploy.setupOverflowX <= 1 && landscapeDeploy.scrollOverflowX <= 1
      ),
      landscapeFourColumnChips: landscapeGalaxy.worldColumns === 4 && landscapePlanet.regionColumns === 4,
      landscapeChipsVisible: landscapeGalaxy.chipVisible === 4 && landscapePlanet.chipVisible === 4,
      landscapeMapReachable: landscapeRegion.mapCount === 3 && landscapeRegion.mapColumns === 3 &&
        landscapeRegion.mapVisible === 3 && landscapeRegion.mapFullyVisible === 3 && landscapeRegion.activeVisibleFraction >= .9,
      landscapeSpatialViewsVisible: [landscapeGalaxy, landscapeSystem, landscapePlanet].every(m =>
        m.activeVisibleFraction >= .95 && /^mf(?:Galaxy|System|Planet)Canvas$/.test(m.activeCenterHit)),
      landscapeFooterVisible: [landscapeGalaxy, landscapeSystem, landscapePlanet, landscapeRegion, landscapeDeploy].every(m => m.footerVisible),
      tabletNoHorizontalOverflow: noHorizontalOverflow(tabletLayouts),
      tabletRoutesVisible: routesVisible(tabletLayouts),
      tabletTapTargetsAtLeast44: tapsAtLeast44(tabletLayouts),
      desktopNoHorizontalOverflow: noHorizontalOverflow(desktopLayouts),
      desktopRoutesVisible: routesVisible(desktopLayouts),
      desktopTapTargetsAtLeast44: tapsAtLeast44(desktopLayouts),
      headersVisible: [portraitGalaxyLayout, portraitPlanetLayout, portraitRegionTopLayout, portraitMapLayout, portraitDeployLayout,
        landscapeGalaxy, landscapeSystem, landscapePlanet, landscapeRegion, landscapeDeploy].every(m => m.headerVisible),
      tapTargetsAtLeast44: [portraitGalaxyLayout, portraitPlanetLayout, portraitRegionTopLayout, portraitMapLayout, portraitDeployLayout,
        landscapeGalaxy, landscapeSystem, landscapePlanet, landscapeRegion, landscapeDeploy].every(m => m.tapTargets.under44.length === 0),
      galaxyDossierSafe: landscapeGalaxy.dossierPointerEvents === 'none' && landscapeGalaxy.dossierTargetOverlaps === 0,
      nativeOrientationPolicy: Object.values(nativeOrientationPolicy).every(Boolean),
      consoleClean: errs.length === 0 && consoleErrs.length === 0
    }
  };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const failedGates = Object.entries(report.gates).filter(([, ok]) => !ok).map(([name]) => name);
  if (failedGates.length) throw new Error('WAR TABLE GATES FAILED: ' + failedGates.join(', '));
} finally {
  /* On some Windows/ANGLE runs CDP acknowledges every screenshot but never
     resolves Browser.close(). Bound cleanup; pw-browser's synchronous exit
     hook still terminates only this project's recorded Chrome pid. */
  await Promise.race([
    closePwBrowser(),
    new Promise(resolveClose => setTimeout(resolveClose, 3000))
  ]);
  /* Chrome can leave keep-alive asset sockets open after the page closes.
     They must not keep a completed capture process alive indefinitely. */
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise(resolveClose => {
    const timeout = setTimeout(resolveClose, 1000);
    server.close(() => { clearTimeout(timeout); resolveClose(); });
  });
}
/* This is a one-shot QA CLI. Explicit success prevents a stuck CDP transport
   handle from keeping an otherwise complete, all-green capture alive. */
process.exit(0);
