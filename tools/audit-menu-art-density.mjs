#!/usr/bin/env node
/* Browser evidence for the player complaint that front menus read as text
 * walls. Count only loaded media and CSS url(...) artwork. Gradients are
 * procedural chrome, not illustration. Motion is sampled, not inferred from
 * declarations. Usage: node tools/audit-menu-art-density.mjs [--source] [--json]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceMode = process.argv.includes('--source');
const jsonOnly = process.argv.includes('--json');
const serveRoot = sourceMode ? root : join(root, 'www');
const mode = sourceMode ? 'source' : 'packed';
const outDir = join(root, 'tmp', 'menu-art', mode);
await mkdir(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg'
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const file = resolve(serveRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    const rel = relative(serveRoot, file);
    assert.ok(rel && !rel.startsWith('..' + sep) && existsSync(file), 'outside root');
    response.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch {
    if (!response.headersSent) response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('nf');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const SCREENS = [
  { label: 'main-menu', expected: 'startScreen' },
  { label: 'operations', control: 'opsBtn', expected: 'opsScr', back: 'opsBack', slice: true },
  { label: 'arsenal', control: 'armoryBtn', expected: 'armory', back: 'armoryBack', slice: true },
  { label: 'development', control: 'devBtn', expected: 'devScr', back: 'devBack', slice: true },
  { label: 'contracts', control: 'dailyBtn', expected: 'dailyScr', back: 'dailyBack' },
  { label: 'social', control: 'socialBtn', expected: 'socialScr', back: 'socialBack' },
  { label: 'intel-profile', control: 'profileBtn', expected: 'profileScr', back: 'profBack' },
  { label: 'settings', control: 'settingsBtn', expected: 'settingsScr', back: 'setBack' },
  { label: 'inbox', control: 'inboxBtn', expected: 'inboxScr', back: 'inboxBack' }
];

const report = { mode, url, gpu: null, consoleErrors: [], screens: [], reducedMotion: null };
const browser = await launchPwBrowser();
let page;
try {
  page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
  page.on('pageerror', error => report.consoleErrors.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/interactive-widget|favicon/i.test(message.text())) report.consoleErrors.push('console: ' + message.text().slice(0, 240));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function', {}, { timeout: 30000, polling: 250 });
  report.gpu = await assertHardwareGpu(page);
  await page.waitForFunction(() => !document.getElementById('mfBootCover') && !document.getElementById('bootCover'), {}, { timeout: 90000, polling: 250 });
  /* Enter through the real launcher and Offline flow so the deferred classic
     scripts are installed and the separate UGA document is exercised once. */
  const launchAction = await page.waitForFunction(() => {
    const visible = element => { const rect = element?.getBoundingClientRect(); return Boolean(element && !element.disabled && rect?.width && rect?.height); };
    const primary = document.getElementById('mfLaunchPlay');
    if (visible(primary) && /CONTINUE TO INTRO/i.test(primary.innerText || '')) return '#mfLaunchPlay';
    return visible(document.getElementById('mfLaunchOffline')) ? '#mfLaunchOffline' : false;
  }, {}, { timeout: 60000, polling: 250 }).then(handle => handle.jsonValue());
  await page.locator(launchAction).click();
  await page.locator('#mfIntroStart').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.locator('#mfIntroStart').click({ timeout: 5000 }).catch(() => {});
  await page.locator('#apOfflineBtn').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*', { timeout: 30000 }).catch(() => {});
  if (page.url().includes('/modules/space_exploration/')) {
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ || window.__MASSFRONT_SPACE_ERROR__, {}, { timeout: 60000, polling: 250 });
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  // The classic host starts a fresh boot after returning from UGA. Waiting
  // only before that round-trip can capture the cover instead of the menu.
  await page.waitForFunction(() => {
    const cover = document.getElementById('mfBootCover') || document.getElementById('bootCover');
    return !cover || getComputedStyle(cover).display === 'none' || cover.getBoundingClientRect().height < 1;
  }, {}, { timeout: 90000, polling: 250 });
  await page.addStyleTag({ content: '#updScr{display:none!important}' });
  await page.waitForTimeout(800);
  /* From here the audit holds the restored host document open so every
     screenshot measures the same menu implementation. */
  await page.waitForFunction(() => document.getElementById('startScreen') && typeof showFrontScreen === 'function', {}, { timeout: 60000, polling: 250 });
  await page.evaluate(() => {
    hideFrontScreens('startScreen');
    const start = document.getElementById('startScreen');
    start.style.display = 'flex';
    document.body.dataset.frontScreen = 'startScreen';
  });
  const measure = async expected => page.evaluate(async id => {
    const screen = document.getElementById(id);
    if (!screen) return { missing: true };
    const clip = rect => ({ left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) });
    const area = rect => Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
    const unionArea = rects => {
      const xs = [...new Set(rects.flatMap(rect => [rect.left, rect.right]))].sort((a, b) => a - b);
      let sum = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        const left = xs[i], right = xs[i + 1];
        if (right <= left) continue;
        const intervals = rects.filter(rect => rect.left < right && rect.right > left).map(rect => [rect.top, rect.bottom]).sort((a, b) => a[0] - b[0]);
        let active = false, start = 0, end = 0;
        for (const interval of intervals) {
          if (!active) { start = interval[0]; end = interval[1]; active = true; }
          else if (interval[0] <= end) end = Math.max(end, interval[1]);
          else { sum += (right - left) * (end - start); start = interval[0]; end = interval[1]; }
        }
        if (active) sum += (right - left) * (end - start);
      }
      return sum;
    };
    const visible = element => {
      const style = getComputedStyle(element), rect = clip(element.getBoundingClientRect());
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .01 && area(rect) > 4;
    };
    const nodes = [screen, ...screen.querySelectorAll('*')].filter(visible);
    const artRects = [], textRects = [];
    let artNodes = 0, iconNodes = 0, textChars = 0, proceduralChrome = 0;
    for (const element of nodes) {
      const style = getComputedStyle(element), tag = element.tagName.toLowerCase(), rect = clip(element.getBoundingClientRect());
      const background = style.backgroundImage || '';
      if (background && background !== 'none' && !/url\(/.test(background)) proceduralChrome += 1;
      const loadedImage = tag === 'img' && element.complete && element.naturalWidth > 0;
      const drawnCanvas = tag === 'canvas' && element.width > 0 && element.height > 0;
      const drawnVideo = tag === 'video' && element.readyState >= 2;
      const isArt = loadedImage || drawnCanvas || drawnVideo || /url\(/.test(background) || tag === 'svg';
      if (isArt) {
        artNodes += 1;
        if (Math.min(rect.right - rect.left, rect.bottom - rect.top) < 28) iconNodes += 1;
        else artRects.push(rect);
      }
      for (const child of element.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE) continue;
        const value = child.nodeValue.replace(/\s+/g, ' ').trim();
        if (!value) continue;
        const range = document.createRange(); range.selectNodeContents(child);
        for (const raw of range.getClientRects()) { const textRect = clip(raw); if (area(textRect) > 1) textRects.push(textRect); }
        textChars += value.length;
      }
    }
    const animated = nodes.filter(element => {
      const style = getComputedStyle(element);
      return style.animationName !== 'none' && style.animationDuration !== '0s';
    }).slice(0, 80);
    const snapshot = () => animated.map(element => { const style = getComputedStyle(element); return [style.transform, style.opacity, style.backgroundPosition, style.clipPath].join('|'); });
    const first = snapshot();
    await new Promise(resolve => setTimeout(resolve, 280));
    const second = snapshot();
    const observedMotion = second.filter((value, index) => value !== first[index]).length;
    const screenRect = clip(screen.getBoundingClientRect()), screenArea = Math.max(1, area(screenRect));
    return {
      visible: screenArea > 60, width: Math.round(screenRect.right - screenRect.left), height: Math.round(screenRect.bottom - screenRect.top),
      artNodes, iconNodes, largeArtNodes: artNodes - iconNodes,
      artCoverage: Math.min(100, Math.round(unionArea(artRects) / screenArea * 100)),
      textCoverage: Math.min(100, Math.round(unionArea(textRects) / screenArea * 100)),
      textChars, proceduralChrome, observedMotion
    };
  }, expected);

  const isVisible = async id => page.locator('#' + id).evaluate(element => getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().height > 60).catch(() => false);
  for (const target of SCREENS) {
    if (target.control) {
      await page.evaluate(() => {
        if (typeof MF_POINTER_COMMIT !== 'undefined') MF_POINTER_COMMIT = -1e9;
        hideFrontScreens('startScreen');
        const start = document.getElementById('startScreen');
        start.style.display = 'flex';
        document.body.dataset.frontScreen = 'startScreen';
      });
      await page.evaluate(id => {
        if(id==='opsScr'){renderOps();mfEnsureMenu3D('opsMenuModel','building','turret','LIVE DEFENSE');}
        else if(id==='armory'){renderMetaHead();renderArmory();mfEnsureMenu3D('armoryMenuModel','unit',1,'LIVE CHASSIS');}
        else if(id==='devScr'){renderDevelop();mfEnsureMenu3D('devMenuModel','building','techlab','LIVE SYSTEM');}
        else if(id==='dailyScr')renderDaily();
        else if(id==='socialScr'&&window.MFSocialUI){MFSocialUI.open();return;}
        else if(id==='profileScr')renderProfile();
        else if(id==='settingsScr')renderSettings();
        else if(id==='inboxScr')renderInbox();
        showFrontScreen(id);
      }, target.expected);
      await page.waitForTimeout(350);
      assert.equal(await isVisible(target.expected), true, `${target.label} did not open ${target.expected}`);
      assert.equal(await page.evaluate(() => document.body.dataset.frontScreen || ''), target.expected, `${target.label} front-screen state mismatch`);
    }
    const row = { label: target.label, expected: target.expected, portrait: await measure(target.expected) };
    assert.equal(row.portrait.visible, true, `${target.label} was not visible for portrait capture`);
    await page.screenshot({ path: join(outDir, `${target.label}-portrait.png`), fullPage: false });
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(220);
    row.landscape = await measure(target.expected);
    await page.screenshot({ path: join(outDir, `${target.label}-landscape.png`), fullPage: false });
    row.horizontalOverflow = await page.evaluate(id => { const element = document.getElementById(id); return Boolean(element && element.scrollWidth > element.clientWidth + 2); }, target.expected);
    report.screens.push(row);
    await page.setViewportSize({ width: 412, height: 915 });
    if (target.back) {
      /* Navigation behavior has its own acceptance suite. This audit needs a
         deterministic reset between visual captures, without synthesizing a
         touch during the app's duplicate-tap window. */
      await page.evaluate(() => {
        hideFrontScreens('startScreen');
        const start = document.getElementById('startScreen');
        start.style.display = 'flex';
        document.body.dataset.frontScreen = 'startScreen';
      });
      await page.waitForFunction(() => { const element = document.getElementById('startScreen'); return element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().height > 60; }, {}, { timeout: 15000, polling: 100 });
    }
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    if (typeof MF_POINTER_COMMIT !== 'undefined') MF_POINTER_COMMIT = -1e9;
    hideFrontScreens('startScreen');
    const start = document.getElementById('startScreen');
    start.style.display = 'flex';
    document.body.dataset.frontScreen = 'startScreen';
    renderOps();mfEnsureMenu3D('opsMenuModel','building','turret','LIVE DEFENSE');showFrontScreen('opsScr');
  });
  await page.waitForTimeout(500);
  report.reducedMotion = await measure('opsScr');
  assert.equal(report.reducedMotion.observedMotion, 0, 'nonessential menu motion continued under prefers-reduced-motion');
} finally {
  try { if (page) await page.close(); } catch {}
  try { await closePwBrowser(browser); } catch {}
  server.close();
}

report.consoleErrors = [...new Set(report.consoleErrors)];
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (jsonOnly) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`\n${mode.toUpperCase()} MENU ART / MOTION AUDIT`);
  console.log('SCREEN              P-ART  L-ART  P-TEXT  CHARS  MOTION  OVERFLOW');
  for (const row of report.screens) console.log(`${row.label.padEnd(19)} ${String(row.portrait.artCoverage + '%').padStart(5)} ${String(row.landscape.artCoverage + '%').padStart(6)} ${String(row.portrait.textCoverage + '%').padStart(7)} ${String(row.portrait.textChars).padStart(6)} ${String(row.portrait.observedMotion).padStart(7)}  ${row.horizontalOverflow ? 'YES' : 'no'}`);
  console.log(`GPU: ${report.gpu?.renderer || 'unknown'}`);
  console.log(`Reduced-motion observed movement: ${report.reducedMotion?.observedMotion ?? 'not run'}`);
  console.log(`Console errors: ${report.consoleErrors.length}`);
  console.log(`Evidence: ${outDir}`);
}
if (report.consoleErrors.length || report.screens.some(row => row.horizontalOverflow)) process.exitCode = 1;
