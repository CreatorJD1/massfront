#!/usr/bin/env node
/* Stage 11C space/main-menu acceptance capture.

   This is deliberately a source-bound acceptance tool rather than a beauty-shot
   script. It enters the real same-tab MASSFRONT bridge, records the hardware GPU,
   console/page failures, DOM contracts and source hashes, then writes a portable
   HTML showcase under audit/stage11-space-ux. Battle transmissions are exercised
   in their authored minimap receiver; normal-space KEEL transmissions are
   exercised in #storyRail. No source or save fixture is rewritten by this tool.

   Usage: node tools/capture-stage11-space-ux.mjs
*/
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'audit', 'stage11-space-ux');
const shotsDir = join(outDir, 'screenshots');
const startedUtc = new Date().toISOString();
const VIEW_PHONE = { width: 412, height: 900 };
const VIEW_LANDSCAPE = { width: 915, height: 412 };
const ROOMS_ONLY = process.argv.includes('--rooms-only');
const ROOM_CONTROLLERS = Object.freeze([
  Object.freeze({ id: 'command', deck: 'A', label: 'Command Core' }),
  Object.freeze({ id: 'navigation', deck: 'A', label: 'Navigation Bridge' }),
  Object.freeze({ id: 'survey', deck: 'A', label: 'Survey Lab' }),
  Object.freeze({ id: 'mission_ops', deck: 'A', label: 'Mission Operations' }),
  Object.freeze({ id: 'research', deck: 'B', label: 'Research Directorate' }),
  Object.freeze({ id: 'fabricator', deck: 'B', label: 'Fabrication & Armory' }),
  Object.freeze({ id: 'engineering', deck: 'B', label: 'Engineering & Drive' }),
  Object.freeze({ id: 'habitat', deck: 'C', label: 'Habitat & Medical' }),
  Object.freeze({ id: 'factions', deck: 'C', label: 'Coalition Embassy' }),
  Object.freeze({ id: 'hangar', deck: 'C', label: 'Strike & Expedition Bay' }),
  Object.freeze({ id: 'logistics', deck: 'C', label: 'Logistics & Cargo' })
]);
const SOURCE_PATHS = [
  'index.html',
  'src/main.js',
  'src/galactic-operations.js',
  'src/career-faction-gate.js',
  'src/ui/hud.js',
  'src/styles/ui.css',
  'src/onboarding.js',
  'src/tutorial.js',
  'src/styles/tutorial.css',
  'modules/space_exploration/index.html',
  'modules/space_exploration/src/space_module.js',
  'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/core/uga_command_scene.js',
  'modules/space_exploration/src/core/uga_management_profile_camera.js',
  'modules/space_exploration/src/ui/story_transmission_controller.js',
  'modules/space_exploration/src/ui/campaign_hub_registry.js',
  'modules/space_exploration/src/ui/uga_command.js',
  'modules/space_exploration/src/ui/uga_command.css',
  'tools/test-galactic-entry-intro-ticket.mjs',
  'tools/capture-stage11-space-ux.mjs'
];
const TESTS = [
  ['node tools/test-galactic-entry-intro-ticket.mjs', ['tools/test-galactic-entry-intro-ticket.mjs']],
  ['node tools/test-galactic-campaign-product-model.mjs', ['tools/test-galactic-campaign-product-model.mjs']],
  ['node tools/test-galactic-wartable-routing.mjs', ['tools/test-galactic-wartable-routing.mjs']],
  ['node modules/space_exploration/tools/tests/story-transmission-controller.test.mjs', ['modules/space_exploration/tools/tests/story-transmission-controller.test.mjs']],
  ['node tools/test-uga-management-profile-camera.mjs', ['tools/test-uga-management-profile-camera.mjs']],
  ['node tools/test-career-faction-gate.mjs', ['tools/test-career-faction-gate.mjs']],
  ['node tools/test-stage11-tutorial-contract.mjs', ['tools/test-stage11-tutorial-contract.mjs']],
  ['node tools/test-stage9-galactic-bridge.mjs', ['tools/test-stage9-galactic-bridge.mjs']]
];
const MIME = {
  '.basis': 'application/octet-stream', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.ktx2': 'image/ktx2', '.m4a': 'audio/mp4', '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.webm': 'video/webm', '.webp': 'image/webp', '.woff2': 'font/woff2'
};

const evidence = {
  schema: 'massfront.stage11-space-ux-acceptance.v2',
  startedUtc,
  finishedUtc: null,
  repository: {},
  sourceStamp: '',
  sources: {},
  gpu: [],
  captures: [],
  checks: [],
  tests: [],
  pageDiagnostics: [],
  unproven: [
    'A complete manual play-through of every protected tutorial objective was not performed. The completion transaction is accelerated only after the real protected match starts, and is labelled as such.',
    'Co-op / Versus and MMO cannot be entered because no synchronized session or persistent-sector authority exists in this build.'
  ]
};
let failures = 0;

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[char]);
}
function posix(path) { return path.replace(/\\/g, '/'); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
async function screenshotRoiMetrics(file, relativeRoi) {
  const png = await readFile(file);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Screenshot is not PNG.');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = -1;
  const idat = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error(`Unsupported screenshot PNG ${width}x${height} depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }
  const packed = inflateSync(Buffer.concat(idat));
  const rowBytes = width * channels;
  const pixels = Buffer.alloc(rowBytes * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[sourceOffset++];
    const rowOffset = y * rowBytes;
    const priorOffset = rowOffset - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = packed[sourceOffset++];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const up = y ? pixels[priorOffset + x] : 0;
      const upperLeft = y && x >= channels ? pixels[priorOffset + x - channels] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + up
            : filter === 3 ? raw + Math.floor((left + up) / 2)
              : filter === 4 ? raw + paeth(left, up, upperLeft)
                : NaN;
      if (!Number.isFinite(value)) throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[rowOffset + x] = value & 255;
    }
  }
  const x0 = Math.max(0, Math.floor(width * relativeRoi.x));
  const y0 = Math.max(0, Math.floor(height * relativeRoi.y));
  const x1 = Math.min(width, Math.ceil(width * (relativeRoi.x + relativeRoi.width)));
  const y1 = Math.min(height, Math.ceil(height * (relativeRoi.y + relativeRoi.height)));
  const values = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const index = (y * width + x) * channels;
    values.push(0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]);
  }
  values.sort((a, b) => a - b);
  const q = fraction => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * fraction)))] || 0;
  const average = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return {
    roi: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    average: Number(average.toFixed(2)), p20: Number(q(.2).toFixed(2)), p50: Number(q(.5).toFixed(2)),
    p75: Number(q(.75).toFixed(2)), p80: Number(q(.8).toFixed(2)), p90: Number(q(.9).toFixed(2)),
    contrastP80P20: Number((q(.8) - q(.2)).toFixed(2)),
    fractionAbove32: Number((values.filter(value => value >= 32).length / Math.max(1, values.length)).toFixed(4))
  };
}
function check(scope, name, ok, detail = '') {
  const row = { scope, name, ok: Boolean(ok), detail: String(detail || '') };
  evidence.checks.push(row);
  if (!row.ok) failures++;
  console.log(`${row.ok ? 'PASS' : 'FAIL'} [${scope}] ${name}${row.detail ? ` — ${row.detail}` : ''}`);
  return row.ok;
}
function gpuRecord(label, result) {
  const row = { label, renderer: result.renderer, vendor: result.vendor, version: result.version || '', shadingLanguageVersion: result.shadingLanguageVersion || '' };
  evidence.gpu.push(row);
  check(label, 'hardware GPU, never SwiftShader', Boolean(row.renderer) && !/swiftshader|llvmpipe|software/i.test(row.renderer), row.renderer);
  return row;
}

async function git(args) {
  try { return (await execFile('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).stdout.trim(); }
  catch { return ''; }
}
async function fingerprint(paths) {
  const out = {};
  for (const path of paths) {
    const bytes = await readFile(join(root, path));
    out[path] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  return out;
}
async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(root, `.${requested}`);
      const rel = relative(root, file);
      if (!rel || rel.startsWith(`..${sep}`) || resolve(root, rel) !== file || !existsSync(file)) throw new Error('outside root');
      const bytes = await readFile(file);
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      if (request.method === 'HEAD') response.end();
      else response.end(bytes);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  return { baseUrl: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(done => server.close(done)) };
}

async function newPage(browser, label, viewport = VIEW_PHONE) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: false, colorScheme: 'dark' });
  const diagnostics = { label, viewport: { ...viewport }, navigations: [], pageErrors: [], consoleErrors: [], requestFailures: [], expectedNavigationAborts: [], blockedExternal: [] };
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) diagnostics.navigations.push(frame.url());
  });
  page.on('pageerror', error => diagnostics.pageErrors.push(String(error?.message || error)));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/ERR_BLOCKED_BY_CLIENT/.test(text)) return;
    diagnostics.consoleErrors.push(text);
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(url)) return;
    const failure = request.failure()?.errorText || 'failed';
    if (failure === 'net::ERR_ABORTED') {
      diagnostics.expectedNavigationAborts.push(`${failure} ${url}`);
      return;
    }
    diagnostics.requestFailures.push(`${failure} ${url}`);
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:') await route.continue();
    else {
      diagnostics.blockedExternal.push(url.href);
      await route.abort('blockedbyclient');
    }
  });
  await page.addInitScript(() => {
    try {
      // Every acceptance page represents a separate new player. The browser is
      // shared intentionally for hardware-GPU ownership, so clear origin state
      // before restoring only the non-product launch gates below.
      if (!sessionStorage.getItem('mf_stage11_acceptance_page')) {
        localStorage.clear();
        sessionStorage.setItem('mf_stage11_acceptance_page', '1');
      }
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch {}
  });
  evidence.pageDiagnostics.push(diagnostics);
  return { page, diagnostics };
}

async function bootBase(page, baseUrl, gpuLabel) {
  await page.goto(`${baseUrl}index.html`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  gpuRecord(gpuLabel, await assertHardwareGpu(page));
  await page.waitForFunction(() => typeof META === 'object' && META && typeof metaSave === 'function' && typeof mfOpenExploration === 'function', null, { timeout: 180_000 });
  const enabled = await page.evaluate(() => {
    META.settings = META.settings || {};
    META.settings.experimentalExploration = true;
    return metaSave() === true && META.settings.experimentalExploration === true;
  });
  check(gpuLabel, 'experimental Galactic setting persisted in isolated acceptance profile', enabled);
  await page.waitForFunction(() => typeof bootConfirmed !== 'undefined' && bootConfirmed, null, { timeout: 180_000 });
  const intro = page.locator('#mfIntroStart');
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await page.waitForFunction(() => document.body.classList.contains('mfIntroDone') && !document.getElementById('mfBootCover'), null, { timeout: 90_000 }).catch(() => {});
  const apClose = page.locator('#apCloseBtn');
  if (await apClose.isVisible().catch(() => false)) await apClose.click();
  await page.waitForFunction(() => {
    const el = document.getElementById('startScreen');
    const start = document.getElementById('startBtn');
    if (!el || !start) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && start.getBoundingClientRect().height > 0;
  }, null, { timeout: 60_000 });
  await page.waitForTimeout(550);
}

async function waitModule(page, gpuLabel) {
  await page.waitForURL(/\/modules\/space_exploration\/index\.html/, { timeout: 120_000 });
  gpuRecord(gpuLabel, await assertHardwareGpu(page));
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__ && window.__MASSFRONT_SPACE_HOST__ && !window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const veil = document.getElementById('renderVeil');
    if (!veil?.classList.contains('ready')) return false;
    const style = getComputedStyle(veil);
    return style.visibility === 'hidden' && Number(style.opacity) === 0;
  }, null, { timeout: 180_000 });
  // Re-check after the transition window so a screenshot can never certify a
  // one-frame hidden veil that later returns over the world scene.
  await page.waitForTimeout(900);
  await page.waitForFunction(() => {
    const veil = document.getElementById('renderVeil');
    const style = veil && getComputedStyle(veil);
    return veil?.classList.contains('ready') && style?.visibility === 'hidden' && Number(style.opacity) === 0;
  }, null, { timeout: 15_000 });
}

async function capture(page, name, title, description, state = {}) {
  const file = join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file });
  const bytes = await readFile(file);
  const viewport = page.viewportSize();
  const row = {
    name, title, description, viewport,
    path: posix(relative(outDir, file)),
    bytes: bytes.length,
    sha256: sha256(bytes),
    url: page.url(),
    state
  };
  evidence.captures.push(row);
  console.log(`CAPTURE [${viewport.width}x${viewport.height}] ${row.path} sha256=${row.sha256.slice(0, 16)}`);
  return row;
}

async function assertPageClean(scope, diagnostics) {
  check(scope, 'no page errors', diagnostics.pageErrors.length === 0, diagnostics.pageErrors.join(' | ') || 'clean');
  check(scope, 'no console errors', diagnostics.consoleErrors.length === 0, diagnostics.consoleErrors.join(' | ') || 'clean');
  check(scope, 'no local request failures', diagnostics.requestFailures.length === 0, diagnostics.requestFailures.join(' | ') || 'clean');
}

async function baseMenuState(page) {
  return page.evaluate(() => ({
    bodyClass: document.body.className,
    frontScreen: document.body.dataset.frontScreen || '',
    startText: document.getElementById('startBtn')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    onboardingVisible: Boolean(document.getElementById('mfOnboardingChoice')),
    originalMenuDestinations: ['armoryBtn', 'opsBtn', 'dailyBtn', 'dossierBtn', 'settingsBtn', 'profileBtn'].filter(id => Boolean(document.getElementById(id))),
    gate: window.MFNewCareerFactionGate?.state?.() || null
  }));
}

async function normalSpaceState(page) {
  return page.evaluate(() => {
    const veil = document.getElementById('renderVeil');
    const veilStyle = veil && getComputedStyle(veil);
    return ({
    runtime: document.getElementById('moduleFrame')?.dataset.runtime || '',
    entryView: document.getElementById('moduleFrame')?.dataset.entryView || '',
    scene: window.__MASSFRONT_SPACE__?.scene || '',
    storyRailHidden: document.getElementById('storyRail')?.getAttribute('aria-hidden'),
    transmitting: document.getElementById('storyRail')?.classList.contains('is-transmitting') || false,
    channel: document.getElementById('storyTransmissionChannel')?.textContent || '',
    speaker: document.getElementById('storyTransmissionSpeaker')?.textContent || '',
    title: document.getElementById('storyTransmissionTitle')?.textContent || '',
    body: document.getElementById('storyTransmissionText')?.textContent || '',
    actions: [...document.querySelectorAll('[data-story-action]')].map(button => ({ id: button.dataset.storyAction, text: button.textContent.replace(/\s+/g, ' ').trim() })),
    minimapNodes: document.querySelectorAll('#minimapWrap,#minimap,#cmdrTx').length,
    renderVeil: veil ? {
      ready: veil.classList.contains('ready'),
      visibility: veilStyle.visibility,
      opacity: veilStyle.opacity,
      pointerEvents: veilStyle.pointerEvents
    } : null
    });
  });
}

async function hubState(page) {
  return page.evaluate(() => ({
    runtime: document.getElementById('moduleFrame')?.dataset.runtime || '',
    scene: window.__MASSFRONT_SPACE__?.scene || '',
    cards: [...document.querySelectorAll('.uga-session-type')].map(card => ({
      label: card.querySelector('h3')?.textContent || '',
      status: card.querySelector('small')?.textContent || '',
      action: card.querySelector('button')?.textContent || '',
      disabled: Boolean(card.querySelector('button')?.disabled),
      visiblePixels: (() => {
        const rect = card.getBoundingClientRect();
        return Math.max(0, Math.min(rect.bottom, innerHeight - 54) - Math.max(rect.top, 0));
      })()
    })),
    canvas: (() => { const canvas = document.querySelector('#spatialHudLayer canvas'); const rect = canvas?.getBoundingClientRect(); return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null; })(),
    horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
    buttons: [...document.querySelectorAll('.uga-session-type button')].map(button => {
      const rect = button.getBoundingClientRect();
      return { text: button.textContent.trim(), width: Math.round(rect.width), height: Math.round(rect.height), left: Math.round(rect.left), right: Math.round(rect.right) };
    })
  }));
}

async function roomControllerState(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.uga-command-shell');
    const context = shell?.querySelector('.uga-context-panel');
    const body = context?.querySelector('.uga-context-body');
    const heading = body?.querySelector('.uga-context-heading h2, .uga-section-title h2');
    const scroll = body?.querySelector('.uga-context-scroll');
    const contextRect = context?.getBoundingClientRect();
    const bodyStyle = body && getComputedStyle(body);
    const districtId = shell?.dataset.district || '';
    const districtState = window.__MASSFRONT_SPACE__?.getState?.()?.ship?.districts?.[districtId] || null;
    const telemetry = (() => {
      const badge = shell?.querySelector('.uga-ship-telemetry-badge');
      const value = badge?.querySelector('.uga-telemetry-power b');
      const surplus = badge?.querySelector('.uga-telemetry-power span');
      const label = badge?.querySelector('.uga-telemetry-power small');
      const box = badge?.getBoundingClientRect();
      const valueBox = value?.getBoundingClientRect();
      const surplusBox = surplus?.getBoundingClientRect();
      if (!box || !valueBox || !surplusBox) return null;
      const contained = [valueBox, surplusBox].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
      const overlap = !(valueBox.right <= surplusBox.left || surplusBox.right <= valueBox.left || valueBox.bottom <= surplusBox.top || surplusBox.bottom <= valueBox.top);
      return { contained, overlap, labelDisplay: label ? getComputedStyle(label).display : '', value: value.textContent?.trim() || '', surplus: surplus.textContent?.trim() || '' };
    })();
    return {
      runtime: document.getElementById('moduleFrame')?.dataset.runtime || '',
      scene: window.__MASSFRONT_SPACE__?.scene || '',
      view: shell?.dataset.view || '',
      districtId,
      sceneLabel: shell?.querySelector('[data-region="scene-label"]')?.textContent?.trim() || '',
      heading: heading?.textContent?.trim() || '',
      commissioned: districtState?.commissioned === true,
      tier: Number(districtState?.level || 0),
      sheetExpanded: shell?.classList.contains('is-sheet-expanded') || false,
      bodyDisplay: bodyStyle?.display || '',
      bodyVisibility: bodyStyle?.visibility || '',
      contextTextLength: body?.textContent?.replace(/\s+/g, ' ').trim().length || 0,
      contextScrollHeight: scroll?.scrollHeight || body?.scrollHeight || 0,
      contextClientHeight: scroll?.clientHeight || body?.clientHeight || 0,
      contextRect: contextRect ? {
        x: Math.round(contextRect.x), y: Math.round(contextRect.y),
        width: Math.round(contextRect.width), height: Math.round(contextRect.height)
      } : null,
      horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      telemetry,
      actionableControls: body ? [...body.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled])')].length : 0
    };
  });
}

async function managementProfileState(page) {
  return page.evaluate(() => {
    const scene = window.__MASSFRONT_SPACE__?.commandScene;
    if (!scene?.camera || !scene.cameraTarget) return null;
    const position = scene.camera.position;
    const target = scene.cameraTarget;
    const up = scene.camera.up;
    return {
      selectedDistrictId: scene.selectedDistrictId,
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
      up: { x: up.x, y: up.y, z: up.z },
      sideOn: scene.selectedDistrictId === null && Math.abs(position.x - target.x) < 0.05
        && Math.abs(position.z - target.z) < 0.05 && position.y < target.y
        && Math.abs(up.x) < 0.01 && Math.abs(up.y) < 0.01 && Math.abs(up.z - 1) < 0.01
    };
  });
}

async function scrollSessionCard(page, index) {
  await page.evaluate(cardIndex => {
    const scroll = document.querySelector('.uga-context-scroll');
    const card = document.querySelectorAll('.uga-session-type')[cardIndex];
    if (!scroll || !card) return;
    scroll.scrollTop += card.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8;
  }, index);
  await page.waitForTimeout(450);
}

function minimapPresentation(state) {
  return {
    wrapTransmission: state.wrapTransmission,
    wrapAttributes: state.wrapAttributes,
    mapAttributes: state.mapAttributes,
    mapComputed: state.mapComputed,
    mapRect: state.mapRect,
    txState: state.txState,
    txDisplay: state.txDisplay
  };
}

async function minimapState(page) {
  return page.evaluate(() => {
    const wrap = document.getElementById('minimapWrap');
    const map = document.getElementById('minimap');
    const tx = document.getElementById('cmdrTx');
    const style = map ? getComputedStyle(map) : null;
    const rect = map?.getBoundingClientRect();
    return {
      receiver: typeof cmdrTxDebug === 'function' ? cmdrTxDebug() : null,
      wrapTransmission: wrap?.dataset.transmission || '',
      wrapAttributes: wrap ? [...wrap.attributes].map(attribute => [attribute.name, attribute.value]).sort() : [],
      mapAttributes: map ? [...map.attributes].map(attribute => [attribute.name, attribute.value]).sort() : [],
      mapComputed: style ? {
        display: style.display, visibility: style.visibility, opacity: style.opacity,
        filter: style.filter, animationName: style.animationName,
        animationDuration: style.animationDuration, animationIterationCount: style.animationIterationCount,
        transform: style.transform
      } : null,
      mapRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      txState: tx?.dataset.state || '',
      txDisplay: tx ? getComputedStyle(tx).display : ''
    };
  });
}

async function enterStandardBattleFromHub(page) {
  await page.setViewportSize(VIEW_PHONE);
  await page.waitForTimeout(650);
  await page.click('[data-nav="more"]');
  await page.waitForFunction(() => document.querySelectorAll('.uga-session-type').length === 4, null, { timeout: 30_000 });
  await scrollSessionCard(page, 0);
  await page.click('[data-session-route="standard-classic"]');
  const classicTerminal = page.locator('[data-host-route="mode-standard"]');
  await classicTerminal.waitFor({ state: 'visible', timeout: 30_000 });
  const terminalState = await page.evaluate(() => ({
    view: document.querySelector('.uga-command-shell')?.dataset.view || '',
    modes: [...document.querySelectorAll('[data-session-mode]')].map(button => ({
      label: button.dataset.sessionMode,
      route: button.dataset.hostRoute || '',
      disabled: button.disabled
    }))
  }));
  check('standard-route', 'Standard / Classic opens the preserved session terminal before leaving space',
    terminalState.view === 'classic'
      && terminalState.modes.some(mode => mode.label === 'Standard / Classic' && mode.route === 'mode-standard' && !mode.disabled)
      && terminalState.modes.some(mode => mode.label === 'Campaign' && mode.route === 'mode-campaign' && !mode.disabled)
      && terminalState.modes.some(mode => mode.label === 'Co-op / Versus' && mode.disabled)
      && terminalState.modes.some(mode => mode.label === 'MMO' && mode.disabled),
    JSON.stringify(terminalState));
  const classicState = await roomControllerState(page);
  check('all-rooms', 'Classic MASSFRONT terminal opens its real integrated controller', classicState.scene === 'uga' && classicState.view === 'classic' && classicState.heading === 'Classic MASSFRONT Terminal' && classicState.contextTextLength >= 180 && classicState.actionableControls >= 3, JSON.stringify(classicState));
  check('all-rooms', 'Classic MASSFRONT terminal stays within the 412px viewport', classicState.horizontalOverflow <= 0 && classicState.contextRect?.width <= VIEW_PHONE.width, JSON.stringify(classicState));
  await capture(page, '05b-classic-massfront-terminal-412x900', 'Classic MASSFRONT terminal', 'The twelfth Stage 11 management destination opens the integrated local mode router; playable Standard/Campaign routes and unavailable network modes remain distinct.', classicState);
  const baseNavigation = page.waitForURL(url => url.pathname === '/index.html', { timeout: 120_000 });
  await classicTerminal.click();
  await baseNavigation;
  gpuRecord('standard-battle-base-412x900', await assertHardwareGpu(page));
  await page.waitForFunction(() => typeof bootConfirmed !== 'undefined' && bootConfirmed
    && typeof mfGalaxyStage !== 'undefined' && mfGalaxyStage === 'galaxy', null, { timeout: 180_000 });

  const stages = [];
  const expected = ['galaxy', 'system', 'planet', 'region', 'deploy'];
  for (let index = 0; index < expected.length - 1; index++) {
    await page.locator('#setupStart').waitFor({ state: 'visible', timeout: 60_000 });
    const before = await page.evaluate(() => ({
      stage: typeof mfGalaxyStage !== 'undefined' ? mfGalaxyStage : '',
      label: document.getElementById('setupStart')?.textContent?.trim() || ''
    }));
    check('standard-route', `real War Table stage ${expected[index]} is active`, before.stage === expected[index], JSON.stringify(before));
    stages.push(before);
    await page.locator('#setupStart').click();
    await page.waitForFunction(stage => typeof mfGalaxyStage !== 'undefined' && mfGalaxyStage === stage,
      expected[index + 1], { timeout: 45_000 });
    await page.waitForTimeout(450);
  }
  const deployStage = await page.evaluate(() => ({
    stage: mfGalaxyStage,
    label: document.getElementById('setupStart')?.textContent?.trim() || ''
  }));
  stages.push(deployStage);
  check('standard-route', 'Standard / Classic reaches the real deploy-stage START BATTLE action', deployStage.stage === 'deploy' && /START BATTLE/.test(deployStage.label), JSON.stringify(deployStage));
  await page.locator('#setupStart').press('Enter');
  await page.waitForFunction(() => typeof running !== 'undefined' && running === true, null, { timeout: 180_000 });
  await page.locator('#deployBtn').waitFor({ state: 'visible', timeout: 180_000 });
  await page.locator('#deployBtn').press('Enter');
  await page.waitForFunction(() => typeof matchLive !== 'undefined' && matchLive === true
    && running === true && paused === false && Number(stats?.t) > 0
    && document.body.classList.contains('hudTacticalDock'), null, { timeout: 90_000 });
  const live = await page.evaluate(() => ({
    activeWarMode, matchLive, running, paused, simTime: Number(stats.t),
    playerFaction, playerCommanderId, stage: mfGalaxyStage,
    hudTacticalDock: document.body.classList.contains('hudTacticalDock')
  }));
  check('standard-route', 'Standard / Classic opens a live non-Training RTS battle', live.activeWarMode === 'standard' && live.matchLive && live.running && live.hudTacticalDock, JSON.stringify(live));
  return { stages, live };
}

async function verifyBattleReceiver(page, route) {
  await page.evaluate(() => {
    try { if (typeof commanderDialogueReset === 'function') commanderDialogueReset(); } catch {}
    try { if (typeof cmdrTxReset === 'function') cmdrTxReset(); } catch {}
  });
  await page.waitForFunction(() => typeof cmdrTxDebug === 'function' && cmdrTxDebug().state === 'idle');
  await page.waitForTimeout(350);
  const baseline = await minimapState(page);
  check('battle-receiver', 'minimap begins in an unmodified Standard-battle idle state', baseline.wrapTransmission === '' && baseline.receiver?.state === 'idle', JSON.stringify(baseline));

  await page.evaluate(() => {
    window.__STAGE11_TX_TIMELINE__ = [];
    window.__STAGE11_TX_LAST__ = '';
    window.__STAGE11_TX_TIMER__ = setInterval(() => {
      const value = typeof cmdrTxDebug === 'function' ? cmdrTxDebug().state : 'missing';
      if (value !== window.__STAGE11_TX_LAST__) {
        window.__STAGE11_TX_LAST__ = value;
        window.__STAGE11_TX_TIMELINE__.push({ state: value, at: performance.now() });
      }
    }, 8);
  });
  const raised = await page.evaluate(() => {
    const result = commanderCue('research', 'complete', { subject: 'stage11_acceptance', force: true });
    if (result.ok && result.cue) result.cue.durationMs = 1400;
    return { ok: result.ok, reason: result.reason, text: result.cue?.subtitle?.text || '', speaker: result.cue?.subtitle?.speaker || '' };
  });
  check('battle-receiver', 'real Commander cue is accepted in the authoritative Standard battle', raised.ok && raised.text && raised.speaker, JSON.stringify(raised));
  if (!raised.ok) throw new Error(`Standard-battle Commander cue rejected: ${JSON.stringify(raised)}`);
  await page.waitForFunction(() => cmdrTxDebug().state === 'hold', null, { timeout: 20_000 });
  const active = await minimapState(page);
  check('battle-receiver', 'Commander profile replaces only the minimap during hold', active.wrapTransmission === 'hold' && active.receiver?.placement === 'minimap' && active.mapComputed?.animationName.includes('mfMinimapSignal'), JSON.stringify(active));
  await capture(page, '09-battle-minimap-commander-takeover-412x900', 'Battle minimap takeover — Commander', 'A real Commander cue in a live Standard battle temporarily replaces only the minimap with the authored profile/subtitle receiver.', { route, raised, active });

  await page.waitForFunction(() => cmdrTxDebug().state === 'exit', null, { timeout: 20_000 });
  const exiting = await minimapState(page);
  check('battle-receiver', 'receiver reaches the bounded exit state', exiting.wrapTransmission === 'exit' && exiting.receiver?.state === 'exit', JSON.stringify(exiting));
  await page.waitForFunction(() => cmdrTxDebug().state === 'idle', null, { timeout: 20_000 });
  await page.waitForTimeout(350);
  const restored = await minimapState(page);
  const timeline = await page.evaluate(() => {
    clearInterval(window.__STAGE11_TX_TIMER__);
    return window.__STAGE11_TX_TIMELINE__ || [];
  });
  const baselineComparable = minimapPresentation(baseline);
  const restoredComparable = minimapPresentation(restored);
  const stateOrder = timeline.map(entry => entry.state).filter((state, index, array) => index === 0 || state !== array[index - 1]);
  check('battle-receiver', 'enter / hold / exit / idle sequence is bounded', stateOrder.includes('enter') && stateOrder.includes('hold') && stateOrder.includes('exit') && stateOrder.at(-1) === 'idle', JSON.stringify(timeline));
  check('battle-receiver', 'minimap DOM and computed presentation restore exactly', stable(baselineComparable) === stable(restoredComparable), `baseline=${stable(baselineComparable)} restored=${stable(restoredComparable)}`);
  await page.waitForTimeout(900);
  const stableIdle = await minimapState(page);
  check('battle-receiver', 'no persistent signal/flicker remains after restoration', stableIdle.wrapTransmission === '' && stableIdle.receiver?.state === 'idle' && stableIdle.mapComputed?.animationName === 'none', JSON.stringify(stableIdle));
  await capture(page, '10-battle-minimap-exact-restoration-412x900', 'Battle minimap restored', 'After bounded enter, hold and exit, the transmission attribute is removed and the minimap returns to its exact baseline presentation with no persistent flicker.', { baseline, timeline, restored, stableIdle });

  const keelCue = await page.evaluate(() => window.MFOnboarding?.present?.('battle-camera', {
    force: true, persist: false, durationMs: 1400,
    text: 'KEEL tactical receiver acceptance: battle guidance belongs in the minimap bay.'
  }) || null);
  await page.waitForFunction(() => cmdrTxDebug().state === 'hold', null, { timeout: 20_000 });
  const keelActive = await minimapState(page);
  check('battle-receiver', 'KEEL battle hint selects the minimap presenter', keelCue?.presenter === 'battle-minimap' && keelCue?.handled === true && keelActive.receiver?.who === 'KEEL', JSON.stringify({ keelCue, keelActive }));
  await capture(page, '11-battle-minimap-keel-takeover-412x900', 'Battle minimap takeover — KEEL', 'KEEL uses the same bounded minimap receiver only in battle; normal-space KEEL remains in the dedicated story rail.', { keelCue, keelActive });
  await page.waitForFunction(() => cmdrTxDebug().state === 'idle', null, { timeout: 20_000 });
}

async function runFreshCareerFlow(browser, baseUrl) {
  const { page, diagnostics } = await newPage(browser, 'fresh-career');
  try {
    await bootBase(page, baseUrl, 'fresh-base-412x900');
    const menu = await baseMenuState(page);
    check('main-menu', 'existing main menu remains the front screen', menu.frontScreen === 'startScreen' || /mfMenuOpen/.test(menu.bodyClass), JSON.stringify(menu));
    check('main-menu', 'primary action reads START MASSFRONT', menu.startText === '▶ START MASSFRONT', menu.startText);
    check('main-menu', 'original menu destinations remain mounted', menu.originalMenuDestinations.length >= 6, menu.originalMenuDestinations.join(','));
    check('main-menu', 'experimental career choice does not cover the main menu before START', menu.onboardingVisible === false, String(menu.onboardingVisible));
    await capture(page, '01-main-menu-start-massfront-412x900', 'Existing MASSFRONT main menu', 'The original front-end remains intact; its primary action is START MASSFRONT and the existing destinations remain mounted.', menu);

    await page.click('#startBtn');
    await waitModule(page, 'fresh-space-412x900');
    const introVisible = await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'system' && !document.getElementById('storyTransmission')?.hidden, null, { timeout: 45_000 })
      .then(() => true, () => false);
    if (!introVisible) {
      const diagnostic = await page.evaluate(() => ({
        url: location.href,
        runtime: document.getElementById('moduleFrame')?.dataset.runtime || '',
        entryView: document.getElementById('moduleFrame')?.dataset.entryView || '',
        ticket: window.__MASSFRONT_SPACE_HOST__?.ticket || null,
        firstEntry: window.__MASSFRONT_SPACE__?.firstEntryIntro || null,
        story: window.__MASSFRONT_STORY_RAIL__?.debug?.() || null,
        scene: window.__MASSFRONT_SPACE__?.scene || '',
        error: String(window.__MASSFRONT_SPACE_ERROR__?.stack || window.__MASSFRONT_SPACE_ERROR__?.message || window.__MASSFRONT_SPACE_ERROR__ || ''),
        transmissionHidden: document.getElementById('storyTransmission')?.hidden,
        railClass: document.getElementById('storyRail')?.className || '',
        veil: document.getElementById('renderVeil')?.className || ''
      }));
      throw new Error(`First-entry story rail did not start automatically: ${JSON.stringify(diagnostic)}`);
    }
    const intro = await normalSpaceState(page);
    check('world-intro', 'new career enters the exterior system scene', intro.scene === 'system', intro.scene);
    check('world-intro', 'normal-space KEEL uses the dedicated story rail', intro.transmitting && intro.speaker === 'KEEL' && intro.channel === 'UGA PERSONNEL LINK', JSON.stringify(intro));
    check('world-intro', 'space document contains no battle minimap receiver', intro.minimapNodes === 0, String(intro.minimapNodes));
    check('world-intro', 'opening veil is fully gone and stays gone before capture', intro.renderVeil?.ready && intro.renderVeil.visibility === 'hidden' && intro.renderVeil.opacity === '0', JSON.stringify(intro.renderVeil));
    await capture(page, '02-world-intro-keel-story-rail-412x900', 'Cinematic world introduction + normal-space KEEL', 'A genuine new career enters the exterior Aelos system. KEEL occupies the dedicated story rail; there is no minimap receiver in the space document.', intro);

    await page.waitForFunction(() => document.querySelectorAll('[data-story-action]').length === 2, null, { timeout: 30_000 });
    const choice = await normalSpaceState(page);
    check('first-choice', 'both optional tutorial paths are visible', choice.actions.map(action => action.id).join(',') === 'begin-planetary-training,skip-to-faction-selection', JSON.stringify(choice.actions));
    await capture(page, '03-optional-tutorial-choice-412x900', 'Optional protected tutorial choice', 'Both paths remain explicit: begin the protected planetary basics or skip directly to required faction commissioning.', choice);

    const skipBefore = await page.evaluate(() => {
      sessionStorage.removeItem('mf_stage11_skip_pagehide');
      addEventListener('pagehide', () => {
        const routeKey = Object.keys(sessionStorage).find(key => key.startsWith('massfront.galactic.route.v1.')) || '';
        sessionStorage.setItem('mf_stage11_skip_pagehide', JSON.stringify({
          url: location.href,
          choice: window.__MASSFRONT_SPACE_ONBOARDING_CHOICE__ || null,
          firstEntry: window.__MASSFRONT_SPACE__?.firstEntryIntro || null,
          ticket: window.__MASSFRONT_SPACE_HOST__?.ticket || null,
          routeKey,
          route: routeKey ? JSON.parse(sessionStorage.getItem(routeKey) || 'null') : null
        }));
      }, { once: true });
      return {
        url: location.href,
        firstEntry: window.__MASSFRONT_SPACE__?.firstEntryIntro || null,
        ticket: window.__MASSFRONT_SPACE_HOST__?.ticket || null
      };
    });
    await page.click('[data-story-action="skip-to-faction-selection"]');
    await page.waitForURL(url => url.pathname === '/index.html', { timeout: 120_000 });
    gpuRecord('skip-return-base-412x900', await assertHardwareGpu(page));
    const gateVisible = await page.waitForSelector('#mfCareerFactionGate', { state: 'visible', timeout: 45_000 })
      .then(() => true, () => false);
    if (!gateVisible) {
      const diagnostic = await page.evaluate(() => {
        const keys = Object.keys(sessionStorage);
        const routeKey = keys.find(key => key.startsWith('massfront.galactic.route.v1.')) || '';
        const parse = value => { try { return JSON.parse(value || 'null'); } catch { return value; } };
        return {
          url: location.href,
          profileId: typeof PROFILES !== 'undefined' ? PROFILES?.active : '',
          bootConfirmed: typeof bootConfirmed !== 'undefined' ? bootConfirmed : null,
          metaGate: typeof META !== 'undefined' ? META?.newCareerFactionGate || null : null,
          gateState: window.MFNewCareerFactionGate?.state?.() || null,
          gateChoices: window.MFNewCareerFactionGate?.choices?.().map(option => ({ id: option.id, runtime: option.runtime, commander: option.commander?.id })) || null,
          bridge: window.__MF_GALACTIC_BRIDGE ? {
            status: window.__MF_GALACTIC_BRIDGE.status,
            reason: window.__MF_GALACTIC_BRIDGE.reason,
            menuRouteActive: window.__MF_GALACTIC_BRIDGE.menuRouteActive
          } : null,
          routeKey,
          routeRecord: routeKey ? parse(sessionStorage.getItem(routeKey)) : null,
          entryTicket: parse(sessionStorage.getItem('massfront.galactic.entry.v1')),
          pagehide: parse(sessionStorage.getItem('mf_stage11_skip_pagehide')),
          initMarker: sessionStorage.getItem('mf_stage11_acceptance_page'),
          dialogMounted: Boolean(document.getElementById('mfCareerFactionGate'))
        };
      });
      throw new Error(`Secured skip return did not mount commissioning: ${JSON.stringify({ diagnostic, navigations: diagnostics.navigations })}`);
    }
    await page.evaluate(() => document.querySelector('.mfcfgCard')?.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(450);
    const commission = await page.evaluate(() => ({
      returnUrl: location.href,
      bridge: window.__MF_GALACTIC_BRIDGE ? {
        status: window.__MF_GALACTIC_BRIDGE.status,
        reason: window.__MF_GALACTIC_BRIDGE.reason
      } : null,
      pagehide: (() => { try { return JSON.parse(sessionStorage.getItem('mf_stage11_skip_pagehide') || 'null'); } catch { return null; } })(),
      phase: window.MFNewCareerFactionGate?.state?.().phase || '',
      guide: document.querySelector('.mfcfgGuideCopy small')?.textContent || '',
      options: [...document.querySelectorAll('.mfcfgCard')].map(card => ({
        faction: card.dataset.faction, commander: card.querySelector('.mfcfgCommander b')?.textContent || '',
        grant: card.querySelector('.mfcfgGrant b')?.textContent || '', action: card.querySelector('.mfcfgChoose b')?.textContent || ''
      }))
    }));
    check('commissioning', 'skip route converges on required faction selection', commission.phase === 'faction-selection', commission.phase);
    check('commissioning', 'three playable factions expose real Commander 1 grants', commission.options.length === 3 && commission.options.every(option => option.commander && option.grant === 'COMMANDER 1'), JSON.stringify(commission.options));
    await capture(page, '04-faction-commander1-commissioning-412x900', 'Faction + Commander 1 commissioning', 'The visible Nova card grants Captain Elara Kai as Commander 1; the bound live state records equivalent real Commander 1 grants for all three playable factions while KEEL remains neutral UGA guidance.', { skipBefore, commission, navigations: diagnostics.navigations });

    await page.click('.mfcfgCard[data-faction="nova"]');
    await waitModule(page, 'commissioned-space-412x900');
    const assignment = await page.evaluate(() => ({
      ticket: window.__MASSFRONT_SPACE_HOST__?.ticket?.commissioning || null,
      scene: window.__MASSFRONT_SPACE__?.scene || '',
      introRequired: window.__MASSFRONT_SPACE_HOST__?.ticket?.introRequired
    }));
    check('commissioning', 'selected faction and its Commander 1 crossed the secured ticket', assignment.ticket?.factionId === 'nova' && assignment.ticket?.commanderId === 'nova_kai', JSON.stringify(assignment));

    await page.click('#btnUgaCommand');
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'uga' && document.querySelector('.uga-command-shell'), null, { timeout: 180_000 });
    await page.waitForTimeout(900);
    const management = await hubState(page);
    const managementProfile = await managementProfileState(page);
    check('management', 'ship management uses the full side-profile camera', management.scene === 'uga' && managementProfile?.sideOn === true, JSON.stringify(managementProfile));
    const phoneManagementShot = await capture(page, '05-full-side-profile-management-412x900', 'Full side-profile ship management', 'The overview-only material grade, key and rim reveal the full vessel in an axis-aligned side elevation; focused room materials retain their authored values.', { ...management, managementProfile });
    const phoneShipRoi = await screenshotRoiMetrics(join(outDir, phoneManagementShot.path), { x: .05, y: .38, width: .90, height: .23 });
    phoneManagementShot.state.shipRoi = phoneShipRoi;
    // The vessel deliberately occupies about one quarter of this wide ROI, so
    // p75 lands on black space. Gate the illuminated hull at p80, then require
    // both background separation and a meaningful share of readable pixels.
    check('management', '412x900 ship ROI has readable luminance and silhouette contrast', phoneShipRoi.p80 >= 45 && phoneShipRoi.contrastP80P20 >= 35 && phoneShipRoi.fractionAbove32 >= .20, JSON.stringify(phoneShipRoi));

    await page.click('[data-nav="more"]');
    await page.waitForFunction(() => document.querySelectorAll('.uga-session-type').length === 4, null, { timeout: 30_000 });
    const hub = await hubState(page);
    const labels = hub.cards.map(card => card.label);
    check('campaign-hub', 'four product session families are distinct', stable(labels) === stable(['Standard / Classic', 'Campaign', 'Co-op / Versus', 'MMO']), JSON.stringify(hub.cards));
    check('campaign-hub', 'offline routes open and network routes remain unavailable', hub.cards.slice(0, 2).every(card => !card.disabled && card.action === 'OPEN') && hub.cards.slice(2).every(card => card.disabled && card.action === 'UNAVAILABLE'), JSON.stringify(hub.cards));
    check('campaign-hub', '412x900 cards and actions stay within the viewport', hub.horizontalOverflow <= 0 && hub.buttons.every(button => button.height >= 38 && button.left >= 0 && button.right <= VIEW_PHONE.width), JSON.stringify({ horizontalOverflow: hub.horizontalOverflow, buttons: hub.buttons }));
    await scrollSessionCard(page, 0);
    const offlineHub = await hubState(page);
    check('campaign-hub', 'Standard / Classic and Campaign cards are both visibly captured', offlineHub.cards[0].visiblePixels > 80 && offlineHub.cards[1].visiblePixels > 80, JSON.stringify(offlineHub.cards.slice(0, 2)));
    await capture(page, '06-four-session-hub-offline-412x900', 'Four-session Campaign Hub — offline routes', 'The visible Standard / Classic and Campaign cards are both real, open routes in the integrated host.', offlineHub);

    await scrollSessionCard(page, 2);
    const networkHub = await hubState(page);
    check('campaign-hub', 'Co-op / Versus and MMO cards are both visibly captured', networkHub.cards[2].visiblePixels > 80 && networkHub.cards[3].visiblePixels > 80, JSON.stringify(networkHub.cards.slice(2)));
    await capture(page, '07-four-session-hub-network-412x900', 'Four-session Campaign Hub — network routes', 'The visible Co-op / Versus and MMO cards remain separate and explicitly unavailable rather than routing to a fake local mode.', networkHub);

    await page.setViewportSize(VIEW_LANDSCAPE);
    await page.waitForTimeout(1100);
    const inspectorToggle = page.locator('.uga-sheet-toggle[data-action="toggle-sheet"]');
    await inspectorToggle.waitFor({ state: 'visible', timeout: 30_000 });
    if (await inspectorToggle.getAttribute('aria-expanded') === 'true') await inspectorToggle.click();
    await page.waitForFunction(() => {
      const shell = document.querySelector('.uga-command-shell');
      const toggle = shell?.querySelector('.uga-sheet-toggle[data-action="toggle-sheet"]');
      return Boolean(shell && toggle && !shell.classList.contains('is-sheet-expanded') && toggle.getAttribute('aria-expanded') === 'false');
    }, null, { timeout: 30_000 });
    const landscapeInspector = await page.evaluate(() => {
      const shell = document.querySelector('.uga-command-shell');
      const toggle = shell?.querySelector('.uga-sheet-toggle[data-action="toggle-sheet"]');
      const panel = shell?.querySelector('.uga-context-panel');
      const body = shell?.querySelector('.uga-context-body');
      const rect = panel?.getBoundingClientRect();
      return {
        shellExpanded: shell?.classList.contains('is-sheet-expanded') || false,
        ariaExpanded: toggle?.getAttribute('aria-expanded') || '',
        bodyDisplay: body ? getComputedStyle(body).display : '',
        panelRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null
      };
    });
    const landscape = await hubState(page);
    const landscapeProfile = await managementProfileState(page);
    check('landscape', 'landscape explicitly restores the null-district axis-aligned management profile', landscape.scene === 'uga' && landscape.canvas?.width > landscape.canvas?.height && landscapeProfile?.selectedDistrictId === null && landscapeProfile?.sideOn === true, JSON.stringify(landscapeProfile));
    check('landscape', 'visible landscape inspector control collapses its body before capture', !landscapeInspector.shellExpanded && landscapeInspector.ariaExpanded === 'false' && landscapeInspector.bodyDisplay === 'none' && landscapeInspector.panelRect?.height <= 50, JSON.stringify(landscapeInspector));
    const landscapeShot = await capture(page, '08-full-side-profile-management-915x412', 'Landscape side-profile management', 'The unobscured full-ship side elevation remains active at 915×412; the visible inspector is collapsed and runtime camera state proves it did not fall into an angled Command Core cutaway.', { ...landscape, managementProfile: landscapeProfile, inspector: landscapeInspector });
    const landscapeShipRoi = await screenshotRoiMetrics(join(outDir, landscapeShot.path), { x: .07, y: .22, width: .86, height: .50 });
    landscapeShot.state.shipRoi = landscapeShipRoi;
    check('landscape', '915x412 ship ROI retains readable luminance and contrast', landscapeShipRoi.p80 >= 80 && landscapeShipRoi.contrastP80P20 >= 60 && landscapeShipRoi.fractionAbove32 >= .20, JSON.stringify(landscapeShipRoi));
    const panel = landscapeInspector.panelRect;
    const roi = landscapeShipRoi.roi;
    const inspectorOverlap = panel && roi
      ? Math.max(0, Math.min(panel.x + panel.width, roi.x + roi.width) - Math.max(panel.x, roi.x))
        * Math.max(0, Math.min(panel.y + panel.height, roi.y + roi.height) - Math.max(panel.y, roi.y))
      : -1;
    check('landscape', 'collapsed inspector does not overlap the measured ship ROI', inspectorOverlap === 0, JSON.stringify({ panel, roi, overlapPixels: inspectorOverlap }));

    const standardRoute = await enterStandardBattleFromHub(page);
    await verifyBattleReceiver(page, standardRoute);

    await assertPageClean('fresh-career', diagnostics);
  } finally {
    await page.close();
  }
}

async function runAllRoomControllerFlow(browser, baseUrl) {
  const { page, diagnostics } = await newPage(browser, 'all-room-controllers');
  try {
    await page.goto(`${baseUrl}modules/space_exploration/index.html`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    gpuRecord('all-rooms-sandbox-412x900', await assertHardwareGpu(page));
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ && window.__MASSFRONT_SPACE_HOST__ && !window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 180_000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
    const seeded = await page.evaluate(async () => {
      const { createShowcaseReadyDomainState } = await import('./src/domain/state_store.js?v=20260830-stage11-all-rooms');
      const state = createShowcaseReadyDomainState();
      const saved = window.__MASSFRONT_SPACE_HOST__.saveCampaignSnapshot(state);
      return {
        runtime: document.getElementById('moduleFrame')?.dataset.runtime || '',
        accountId: window.__MASSFRONT_SPACE_HOST__.accountId || '',
        profileId: saved?.profileId || '',
        commissionedRooms: Object.values(saved?.ship?.districts || {}).filter(room => room?.commissioned).length
      };
    });
    check('all-rooms', 'authored showcase fixture seeds all eleven commissioned room controllers in the isolated host', seeded.runtime === 'sandbox' && seeded.profileId === seeded.accountId && seeded.commissionedRooms === ROOM_CONTROLLERS.length, JSON.stringify(seeded));

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
    gpuRecord('all-rooms-reloaded-412x900', await assertHardwareGpu(page));
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__ && window.__MASSFRONT_SPACE_HOST__ && !window.__MASSFRONT_SPACE_ERROR__, null, { timeout: 180_000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openUga());
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'uga' && document.querySelector('.uga-command-shell'), null, { timeout: 180_000 });
    // The UI can mount before the asynchronous Draco cutaway has installed its
    // authored camera anchors. Capturing that brief state proved the controller
    // DOM, but falsely reported focus failures because the real click had no 3D
    // target yet. Wait for the renderer's complete authored contract, then keep
    // every focus action on the visible district buttons below.
    await page.waitForFunction(() => {
      const scene = window.__MASSFRONT_SPACE__?.commandScene;
      return scene?.focusAnchors?.size > 0 && scene?.districtRoots?.size > 0;
    }, null, { timeout: 180_000 });
    const authoredFocusInventory = await page.evaluate(() => {
      const scene = window.__MASSFRONT_SPACE__?.commandScene;
      return {
        anchors: [...(scene?.focusAnchors?.keys?.() || [])],
        roots: [...(scene?.districtRoots?.keys?.() || [])]
      };
    });
    check('all-rooms', 'decoded cutaway exposes every authored district root and focus anchor',
      ROOM_CONTROLLERS.every(room => authoredFocusInventory.anchors.includes(room.id) && authoredFocusInventory.roots.includes(room.id)),
      JSON.stringify(authoredFocusInventory));
    await page.waitForTimeout(900);

    for (let index = 0; index < ROOM_CONTROLLERS.length; index += 1) {
      const room = ROOM_CONTROLLERS[index];
      await page.locator(`[data-deck-filter="${room.deck}"]`).click({ force: true });
      await page.waitForFunction(id => Boolean(document.querySelector(`button[data-district="${id}"]`)), room.id, { timeout: 30_000 });
      await page.locator(`button[data-district="${room.id}"]`).click({ force: true });
      await page.waitForFunction(id => window.__MASSFRONT_SPACE__?.commandScene?.selectedDistrictId === id, room.id, { timeout: 30_000 });
      await page.waitForFunction(id => {
        const shell = document.querySelector('.uga-command-shell');
        return shell?.dataset.district === id && shell?.dataset.view === 'command';
      }, room.id, { timeout: 30_000 });
      const toggle = page.locator('.uga-sheet-toggle[data-action="toggle-sheet"]');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click({ force: true });
      await page.waitForFunction(id => {
        const shell = document.querySelector('.uga-command-shell');
        const body = shell?.querySelector('.uga-context-body');
        const heading = body?.querySelector('.uga-context-heading h2, .uga-section-title h2');
        return shell?.dataset.district === id && shell.classList.contains('is-sheet-expanded')
          && body && getComputedStyle(body).display !== 'none' && Boolean(heading?.textContent?.trim());
      }, room.id, { timeout: 30_000 });
      await page.evaluate(() => {
        const scroll = document.querySelector('.uga-context-body .uga-context-scroll');
        if (scroll) scroll.scrollTop = 0;
      });
      await page.waitForTimeout(550);
      const state = await roomControllerState(page);
      const profile = await managementProfileState(page);
      check('all-rooms', `${room.label} opens its commissioned room controller`, state.scene === 'uga' && state.view === 'command' && state.districtId === room.id && state.heading === room.label && state.commissioned && state.sheetExpanded && state.contextTextLength >= 180, JSON.stringify({ state, profile }));
      check('all-rooms', `${room.label} controller stays within the 412px viewport`, state.horizontalOverflow <= 0 && state.contextRect?.width <= VIEW_PHONE.width && state.bodyDisplay !== 'none' && state.bodyVisibility !== 'hidden', JSON.stringify(state));
      check('all-rooms', `${room.label} power telemetry stays contained without label/value collisions`, state.telemetry?.contained === true && state.telemetry?.overlap === false && state.telemetry?.labelDisplay === 'none', JSON.stringify(state.telemetry));
      check('all-rooms', `${room.label} focuses the matching authored cutaway district`, profile?.selectedDistrictId === room.id, JSON.stringify(profile));
      const sequence = String(index + 1).padStart(2, '0');
      await capture(page, `05a-${sequence}-${room.id.replaceAll('_', '-')}-controller-412x900`, `${room.label} room controller`, `The current-source ${room.label} controller is open against its matching authored cutaway district under the fully commissioned isolated showcase fixture.`, { ...state, managementProfile: profile, fixture: 'createShowcaseReadyDomainState' });
      if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click({ force: true });
    }

    await assertPageClean('all-room-controllers', diagnostics);
  } finally {
    await page.close();
  }
}

async function startTrainingFromSpace(page, baseUrl, gpuPrefix) {
  await bootBase(page, baseUrl, `${gpuPrefix}-base-412x900`);
  await page.click('#startBtn');
  await waitModule(page, `${gpuPrefix}-space-412x900`);
  await page.waitForFunction(() => document.querySelectorAll('[data-story-action]').length === 2, null, { timeout: 45_000 });
  await page.click('[data-story-action="begin-planetary-training"]');
  await page.waitForURL(url => url.pathname === '/index.html', { timeout: 120_000 });
  gpuRecord(`${gpuPrefix}-training-412x900`, await assertHardwareGpu(page));
  await page.waitForFunction(() => typeof trainingUiState === 'function' && trainingUiState().active === true, null, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const load = document.getElementById('loadScr');
    return !load || getComputedStyle(load).display === 'none';
  }, null, { timeout: 180_000 });
  await page.waitForTimeout(1400);
}

async function runTrainingAndBattleFlow(browser, baseUrl) {
  const { page, diagnostics } = await newPage(browser, 'training-and-battle');
  try {
    await startTrainingFromSpace(page, baseUrl, 'tutorial-choice');
    const training = await page.evaluate(() => ({
      state: trainingUiState(), gate: window.MFNewCareerFactionGate?.state?.() || null,
      bodyClass: document.body.className, scene: 'protected planetary RTS battle',
      keel: typeof cmdrTxDebug === 'function' ? cmdrTxDebug() : null
    }));
    check('training', 'tutorial choice enters a protected planetary match', training.state.active === true && training.gate.phase === 'training' && /trainingOperation/.test(training.bodyClass), JSON.stringify(training));
    await capture(page, '12-protected-planetary-training-412x900', 'Protected planetary Training', 'The tutorial branch lands in a real protected RTS match, not the ship cutaway. Training remains its own protected state and does not accept ordinary Commander chatter.', training);

    await page.click('#keelSkip');
    await page.waitForSelector('#accDlg', { state: 'visible', timeout: 15_000 });
    await page.click('#accDlgY');
    await page.waitForSelector('#mfCareerFactionGate', { state: 'visible', timeout: 30_000 });
    const skipConvergence = await page.evaluate(() => ({ gate: window.MFNewCareerFactionGate?.state?.() || null, training: trainingUiState() }));
    check('tutorial-skip', 'in-battle tutorial skip converges on the same commissioning gate', skipConvergence.gate.phase === 'faction-selection' && skipConvergence.gate.pending === true, JSON.stringify(skipConvergence));
    await capture(page, '13-tutorial-skip-convergence-412x900', 'Tutorial skip → commissioning convergence', 'A confirmed skip from the live protected match returns to required faction commissioning; it does not escape to an unrelated menu or grant a default faction.', skipConvergence);

    await assertPageClean('training-and-battle', diagnostics);
  } finally {
    await page.close();
  }
}

async function runAcceleratedCompletionConvergence(browser, baseUrl) {
  const { page, diagnostics } = await newPage(browser, 'accelerated-tutorial-completion');
  try {
    await bootBase(page, baseUrl, 'completion-base-412x900');
    const launched = await page.evaluate(() => {
      const armed = window.MFNewCareerFactionGate?.arm?.({ source: 'stage11-acceptance', returnToSpace: false });
      const training = window.MFNewCareerFactionGate?.afterOnboardingChoice?.({ choice: 'training', source: 'stage11-acceptance' });
      window.__tutDebug?.().startTraining?.();
      return { armed, training };
    });
    check('tutorial-complete', 'completion harness starts the real protected Training transaction', launched.armed?.armed === true && launched.training === true, JSON.stringify(launched));
    await page.waitForFunction(() => trainingUiState().active === true, null, { timeout: 180_000 });
    const accelerated = await page.evaluate(() => {
      const debug = window.__tutDebug();
      debug.TUT.doneFlags = debug.activeSteps.map(() => true);
      debug.TUT.stepIdx = 0;
      return { objectives: debug.activeSteps.map(step => step.id), acceleration: 'Only objective flags are accelerated after the real protected match starts.' };
    });
    await page.waitForFunction(() => document.getElementById('goTitle')?.textContent === 'TRAINING COMPLETE', null, { timeout: 30_000 });
    await page.waitForSelector('#mfCareerFactionGate', { state: 'visible', timeout: 30_000 });
    const completion = await page.evaluate(() => ({
      title: document.getElementById('goTitle')?.textContent || '',
      gate: window.MFNewCareerFactionGate?.state?.() || null,
      training: trainingUiState()
    }));
    check('tutorial-complete', 'saved tutorial completion converges on required commissioning', completion.title === 'TRAINING COMPLETE' && completion.training.done === true && completion.gate.phase === 'faction-selection', JSON.stringify(completion));
    await capture(page, '14-tutorial-completion-convergence-412x900', 'Tutorial completion → commissioning convergence', 'Acceptance acceleration marks the real protected mission objectives complete only after launch, then exercises the actual save, completion event, result state, and required commissioning gate.', { accelerated, completion });
    await assertPageClean('accelerated-tutorial-completion', diagnostics);
  } finally {
    await page.close();
  }
}

async function runTests() {
  for (const [label, args] of TESTS) {
    const row = { command: label, ok: false, exitCode: 1, output: '' };
    try {
      const result = await execFile(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      row.ok = true;
      row.exitCode = 0;
      row.output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    } catch (error) {
      row.exitCode = Number(error.code) || 1;
      row.output = `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`.trim();
    }
    evidence.tests.push(row);
    check('focused-tests', row.command, row.ok, row.output.split(/\r?\n/).slice(-2).join(' | '));
  }
}

function renderShowcase() {
  const captures = evidence.captures.map(captureRow => `<article class="shot">
    <a class="image-link" href="./${esc(captureRow.path)}" download><img src="./${esc(captureRow.path)}" alt="${esc(captureRow.title)}"></a>
    <div class="shot-copy"><span>${esc(captureRow.viewport.width)} × ${esc(captureRow.viewport.height)}</span><h2>${esc(captureRow.title)}</h2><p>${esc(captureRow.description)}</p>
      <dl><div><dt>SHA-256</dt><dd>${esc(captureRow.sha256)}</dd></div><div><dt>Source stamp</dt><dd>${esc(evidence.sourceStamp)}</dd></div></dl>
      <details><summary>Captured runtime state</summary><pre>${esc(JSON.stringify(captureRow.state, null, 2))}</pre></details>
      <a class="download" href="./${esc(captureRow.path)}" download>Download PNG</a>
    </div></article>`).join('\n');
  const checks = evidence.checks.map(row => `<tr class="${row.ok ? 'pass' : 'fail'}"><td>${row.ok ? 'PASS' : 'FAIL'}</td><td>${esc(row.scope)}</td><td>${esc(row.name)}</td><td>${esc(row.detail)}</td></tr>`).join('\n');
  const tests = evidence.tests.map(row => `<li class="${row.ok ? 'pass' : 'fail'}"><b>${row.ok ? 'PASS' : 'FAIL'}</b><code>${esc(row.command)}</code><pre>${esc(row.output)}</pre></li>`).join('\n');
  const sources = Object.entries(evidence.sources).map(([path, value]) => `<li><code>${esc(path)}</code><span>${esc(value.sha256)}</span></li>`).join('\n');
  const gpu = evidence.gpu.map(row => `<li><b>${esc(row.label)}</b><span>${esc(row.renderer)}</span></li>`).join('\n');
  const unproven = evidence.unproven.map(item => `<li>${esc(item)}</li>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MASSFRONT Stage 11 Space UX Acceptance</title>
<style>
:root{color-scheme:dark;--bg:#02070d;--panel:#071521;--line:#17384a;--cyan:#60ddff;--green:#6ce2a5;--red:#ff7883;--muted:#87a5b6}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#0a2536,#02070d 38%);color:#e9f8ff;font:14px/1.55 system-ui,sans-serif}header,.section{width:min(1200px,calc(100% - 28px));margin:auto}header{padding:48px 0 24px}header small,.eyebrow{color:var(--cyan);font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.16em}h1{max-width:820px;margin:10px 0 12px;font-size:clamp(34px,6vw,68px);line-height:.98}header p{max-width:760px;color:#a9c4d2}.meta{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.meta span,.download{padding:8px 11px;border:1px solid var(--line);background:#071521;color:#bcecff;text-decoration:none;font:700 11px ui-monospace,monospace}.section{padding:28px 0;border-top:1px solid var(--line)}.shot{display:grid;grid-template-columns:minmax(260px,412px) minmax(0,1fr);gap:24px;margin:0 0 28px;padding:14px;border:1px solid var(--line);background:linear-gradient(135deg,#071521,#030b12)}.image-link{display:block;align-self:start}.shot img{display:block;width:100%;height:auto;border:1px solid #28556b;background:#000}.shot h2{margin:5px 0 8px;font-size:24px}.shot-copy>span{color:var(--green);font:700 10px ui-monospace,monospace}.shot p{color:#a9c4d2}.shot dl{display:grid;gap:5px;margin:16px 0}.shot dl div{min-width:0}.shot dt{color:#67889a;font:700 9px ui-monospace,monospace}.shot dd{margin:2px 0;color:#c5e5f2;font:10px/1.4 ui-monospace,monospace;overflow-wrap:anywhere}details{margin:14px 0}summary{cursor:pointer;color:#a7eaff}pre{max-width:100%;overflow:auto;padding:12px;background:#010509;border:1px solid #112c3b;color:#9fc9da;font:10px/1.45 ui-monospace,monospace}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px;border-bottom:1px solid #102b3a;text-align:left;vertical-align:top}th{color:#83dfff;font:700 10px ui-monospace,monospace}.pass td:first-child,.pass>b{color:var(--green)}.fail td:first-child,.fail>b{color:var(--red)}.tests,.sources,.gpu,.unproven{padding:0;list-style:none}.tests li,.gpu li,.unproven li{margin:8px 0;padding:10px;border:1px solid #163545;background:#06131d}.tests code{margin-left:8px}.tests pre{white-space:pre-wrap}.sources li{display:grid;grid-template-columns:minmax(220px,1fr) minmax(260px,2fr);gap:10px;padding:7px 0;border-bottom:1px solid #102b3a}.sources span,.gpu span{display:block;color:#7eabbf;font:10px ui-monospace,monospace;overflow-wrap:anywhere}.gpu b{display:block;color:#bcecff}.unproven li{border-color:#5e4d25;color:#dfca8c}@media(max-width:760px){header{padding-top:30px}.shot{grid-template-columns:1fr}.shot .image-link{width:min(100%,412px);margin:auto}.sources li{grid-template-columns:1fr}}
</style></head><body>
<header><small>MASSFRONT // STAGE 11C // SOURCE-BOUND ACCEPTANCE</small><h1>Space command UX visual evidence</h1><p>This portable showcase records only states reached in the hardware-GPU browser run. Battle Commander/KEEL cues use the minimap receiver; normal-space KEEL uses the dedicated story rail.</p>
<div class="meta"><span>HEAD ${esc(evidence.repository.head)}</span><span>${esc(evidence.repository.branch)}</span><span>Source ${esc(evidence.sourceStamp)}</span><span>${evidence.captures.length} captures</span><span>${failures} failed checks</span><a class="download" href="./evidence.json" download>Download evidence JSON</a></div></header>
<main><section class="section"><div class="eyebrow">CAPTURED STATES</div>${captures}</section>
<section class="section"><div class="eyebrow">HARDWARE GPU</div><ul class="gpu">${gpu}</ul></section>
<section class="section"><div class="eyebrow">FOCUSED SOURCE TESTS</div><ul class="tests">${tests}</ul></section>
<section class="section"><div class="eyebrow">RUNTIME ASSERTIONS</div><div class="table-wrap"><table><thead><tr><th>RESULT</th><th>SCOPE</th><th>CONTRACT</th><th>EVIDENCE</th></tr></thead><tbody>${checks}</tbody></table></div></section>
<section class="section"><div class="eyebrow">EXPLICITLY NOT PROVEN</div><ul class="unproven">${unproven}</ul></section>
<section class="section"><div class="eyebrow">SOURCE FINGERPRINTS</div><ul class="sources">${sources}</ul></section></main></body></html>`;
}

async function finalize(beforeSources) {
  evidence.finishedUtc = new Date().toISOString();
  evidence.repository = {
    root: posix(root), head: await git(['rev-parse', 'HEAD']), branch: await git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: Boolean(await git(['status', '--porcelain=v1', '--untracked-files=all']))
  };
  evidence.sources = await fingerprint(SOURCE_PATHS);
  evidence.sourceStamp = sha256(Buffer.from(SOURCE_PATHS.map(path => evidence.sources[path].sha256).join('|'))).slice(0, 16);
  const drifted = SOURCE_PATHS.filter(path => beforeSources[path].sha256 !== evidence.sources[path].sha256);
  check('source-binding', 'acceptance-owned source did not change during capture', drifted.length === 0, drifted.join(',') || `${SOURCE_PATHS.length} files stable`);
  evidence.summary = {
    passed: evidence.checks.filter(row => row.ok).length,
    failed: evidence.checks.filter(row => !row.ok).length,
    captures: evidence.captures.length,
    pageErrors: evidence.pageDiagnostics.reduce((sum, row) => sum + row.pageErrors.length, 0),
    consoleErrors: evidence.pageDiagnostics.reduce((sum, row) => sum + row.consoleErrors.length, 0),
    localRequestFailures: evidence.pageDiagnostics.reduce((sum, row) => sum + row.requestFailures.length, 0)
  };
  await writeFile(join(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(join(outDir, 'stage11-space-ux-showcase.html'), renderShowcase());
}

await mkdir(shotsDir, { recursive: true });
const beforeSources = await fingerprint(SOURCE_PATHS);
const server = await startServer();
let browser = null;
try {
  browser = await launchPwBrowser({ headless: true });
  if (!ROOMS_ONLY) await runFreshCareerFlow(browser, server.baseUrl);
  await runAllRoomControllerFlow(browser, server.baseUrl);
  if (!ROOMS_ONLY) {
    await runTrainingAndBattleFlow(browser, server.baseUrl);
    await runAcceleratedCompletionConvergence(browser, server.baseUrl);
    await runTests();
  }
} catch (error) {
  check('run', 'acceptance capture completed', false, error?.stack || error?.message || String(error));
  evidence.unproven.push(`Capture run stopped early: ${error?.message || String(error)}`);
} finally {
  if (browser) await closePwBrowser(browser).catch(() => {});
  await server.close().catch(() => {});
  await finalize(beforeSources);
}

console.log(`SHOWCASE ${join(outDir, 'stage11-space-ux-showcase.html')}`);
console.log(`EVIDENCE ${join(outDir, 'evidence.json')}`);
process.exitCode = failures ? 1 : 0;
