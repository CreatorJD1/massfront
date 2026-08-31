/* MASSFRONT performance probe runner.
   Accepted evidence must enter a real match through PLAY OFFLINE -> War Room
   -> setup -> DEPLOY before any direct diagnostic load is injected. */

import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';
import { installOfflineNetworkIsolation } from '../offline-network-isolation.mjs';
import { acquireVerificationFreeze } from '../evidence-foundation/workspace-guard.mjs';
import { inspectPng } from '../evidence-foundation/png-evidence.mjs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BENCHMARK_SCENARIOS,
  POPULATION_LADDERS,
  benchmarkScenarioSupport
} from './scenario-manifests.mjs';
import {
  setupDeterministicScenario,
  collectAuthoritativePopulation,
  injectCombatDirective
} from './seeded-load-generator.mjs';
import {
  PERF_EVIDENCE_SCHEMA,
  PERF_EXECUTION_PATH,
  deriveStage8PerformanceGate,
  telemetryStats,
  validatePerfEvidence
} from './evidence-contract.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from '../mobile-device-profile.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEGACY_PERF_ROOT = join(ROOT, 'tmp/perf-lab');
const CURRENT_PERF_ROOT = join(LEGACY_PERF_ROOT, 'current');
const METRICS_DIR = join(CURRENT_PERF_ROOT, 'metrics');
const CAPTURES_DIR = join(CURRENT_PERF_ROOT, 'captures');
const LEGACY_CAPTURES_DIR = join(LEGACY_PERF_ROOT, 'captures');
const DEFAULT_VIEWPORT = S25_VIEWPORT;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function sameSourceIdentity(a, b) {
  return ['gitHead', 'worktreeFingerprint', 'runtimeFingerprint', 'testedEntrySha256', 'testedPackageSha256']
    .every(key => a?.[key] === b?.[key]);
}

function scenarioStem(scenarioId, unitsPerFaction) {
  if (!/^[a-z0-9_]+$/.test(scenarioId) || !Number.isInteger(unitsPerFaction) || unitsPerFaction < 1) {
    throw new Error(`Unsafe performance-output identity: ${scenarioId}/${unitsPerFaction}`);
  }
  return `${scenarioId}_${unitsPerFaction}u`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export function parsePerformancePopulations(args = []) {
  const unitFlag = args.indexOf('--units');
  const rawUnits = unitFlag >= 0 ? args[unitFlag + 1] : null;
  if (unitFlag >= 0 && (!rawUnits || rawUnits.startsWith('--') || !/^\d+$/.test(rawUnits))) {
    throw new Error(`--units must be one of: ${POPULATION_LADDERS.join(', ')}`);
  }
  const units = rawUnits == null ? 500 : Number(rawUnits);
  if (!POPULATION_LADDERS.includes(units)) {
    throw new Error(`--units must be one of: ${POPULATION_LADDERS.join(', ')}`);
  }
  return args.includes('--ladder') ? [...POPULATION_LADDERS] : [units];
}

async function prepareScenarioOutput(scenarioId, unitsPerFaction, metricsDir, capturesDir) {
  const stem = scenarioStem(scenarioId, unitsPerFaction);
  const removed = [];
  const metric = join(metricsDir, `${stem}_v3.json`);
  if (existsSync(metric)) { await rm(metric, { force: true }); removed.push(relative(ROOT, metric).replace(/\\/g, '/')); }
  const oldCapture = new RegExp(`^${escapeRegExp(stem)}_(?:[a-f0-9]{12}_\\d+|desktop-v3)_(?:start|mid|end)\\.png(?:\\.partial-\\d+)?$`);
  for (const file of await readdir(capturesDir)) {
    if (!oldCapture.test(file)) continue;
    const path = join(capturesDir, file);
    await rm(path, { force: true });
    removed.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  return { mode: 'bounded-current', removed };
}

export async function prepareCurrentPerfOutput({
  scenarios,
  populations,
  currentRoot = CURRENT_PERF_ROOT
} = {}) {
  if (!Array.isArray(scenarios) || !scenarios.length) throw new Error('Current performance output requires scenarios');
  if (!Array.isArray(populations) || !populations.length ||
      populations.some(value => !POPULATION_LADDERS.includes(value))) {
    throw new Error(`Current performance output populations must be one of: ${POPULATION_LADDERS.join(', ')}`);
  }
  const metricsDir = join(currentRoot, 'metrics');
  const capturesDir = join(currentRoot, 'captures');
  const reportsDir = join(currentRoot, 'reports');
  await Promise.all([
    mkdir(metricsDir, { recursive: true }),
    mkdir(capturesDir, { recursive: true }),
    mkdir(reportsDir, { recursive: true })
  ]);
  const removed = [];
  for (const scenario of scenarios) {
    const support = benchmarkScenarioSupport(scenario);
    if (support.status === 'supported') {
      for (const unitsPerFaction of populations) {
        removed.push(...(await prepareScenarioOutput(
          scenario.id, unitsPerFaction, metricsDir, capturesDir
        )).removed);
      }
      continue;
    }
    const unsupportedPath = join(metricsDir, `${scenario.id}_unsupported_v3.json`);
    if (existsSync(unsupportedPath)) {
      await rm(unsupportedPath, { force: true });
      removed.push(relative(ROOT, unsupportedPath).replace(/\\/g, '/'));
    }
  }
  for (const file of await readdir(metricsDir)) {
    if (!/^summary_matrix_[a-f0-9]{12}_v3\.json$/.test(file)) continue;
    const path = join(metricsDir, file);
    await rm(path, { force: true });
    removed.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  for (const file of ['EVIDENCE_REJECTION_LEDGER.json', 'BENCHMARK_MATRIX_REPORT.md', 'benchmark_matrix.csv']) {
    const path = join(reportsDir, file);
    if (!existsSync(path)) continue;
    await rm(path, { force: true });
    removed.push(relative(ROOT, path).replace(/\\/g, '/'));
  }
  return {
    mode: 'bounded-current',
    root: currentRoot,
    metricsDir,
    capturesDir,
    reportsDir,
    removed
  };
}

async function gitOutput(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function collectSourceIdentity() {
  const gitHead = (await gitOutput(['rev-parse', 'HEAD'])).trim();
  const status = await gitOutput(['status', '--porcelain=v1', '--untracked-files=all']);
  const dirty = status.trim().length > 0;
  const changed = new Set();
  for (const command of [
    ['diff', '--name-only', '-z', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard', '-z']
  ]) {
    const output = await gitOutput(command);
    for (const path of output.split('\0')) {
      const clean = path.replace(/\\/g, '/');
      if (clean && !clean.startsWith('tmp/perf-lab/')) changed.add(clean);
    }
  }
  const worktree = createHash('sha256');
  worktree.update(`head\0${gitHead}\0`);
  for (const path of [...changed].sort()) {
    const absolute = join(ROOT, path);
    worktree.update(`path\0${path}\0`);
    if (existsSync(absolute)) {
      const info = await stat(absolute);
      if (info.isFile()) worktree.update(await readFile(absolute));
      else worktree.update(info.isDirectory() ? '<directory>' : '<non-file>');
    } else worktree.update('<deleted>');
    worktree.update('\0');
  }

  const manifestPath = join(ROOT, 'assets/data/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entryText = await readFile(join(ROOT, 'index.html'), 'utf8');
  const linkedFiles = [...entryText.matchAll(/(?:src|href)=["']\.\/?([^"'?#]+)(?:\?[^"']*)?["']/g)]
    .map(match => match[1]).filter(path => existsSync(join(ROOT, path)));
  const runtimeFiles = [...new Set(['index.html', 'boot.js', 'assets/data/manifest.json', ...linkedFiles, ...(manifest.order || [])])];
  const runtime = createHash('sha256');
  for (const path of runtimeFiles) {
    const absolute = join(ROOT, path);
    if (!existsSync(absolute)) throw new Error(`Runtime fingerprint input is missing: ${path}`);
    runtime.update(`path\0${path}\0`);
    runtime.update(await readFile(absolute));
    runtime.update('\0');
  }
  const runtimeFingerprint = runtime.digest('hex');
  const testedEntry = 'index.html';
  return {
    gitHead,
    gitDirty: dirty,
    worktreeFingerprint: worktree.digest('hex'),
    runtimeFingerprint,
    testedEntry,
    testedEntrySha256: await fileSha256(join(ROOT, testedEntry)),
    /* Source-mode QA serves the entry plus the exact manifest-ordered runtime.
       This package digest therefore equals that deterministic payload digest. */
    testedPackageSha256: runtimeFingerprint
  };
}

export async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      let requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (requestPath === '/') requestPath = '/index.html';
      const file = resolve(ROOT, `.${requestPath}`);
      const rel = relative(ROOT, file);
      if (rel.startsWith(`..${sep}`) || rel === '..' || !existsSync(file)) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      const extension = extname(file).toLowerCase();
      const mime = extension === '.html' ? 'text/html'
        : extension === '.js' || extension === '.mjs' ? 'text/javascript'
        : extension === '.css' ? 'text/css'
        : extension === '.json' ? 'application/json'
        : extension === '.webmanifest' ? 'application/manifest+json'
        : extension === '.png' ? 'image/png'
        : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
        : extension === '.webp' ? 'image/webp'
        : extension === '.ogg' ? 'audio/ogg'
        : extension === '.m4a' ? 'audio/mp4'
        : extension === '.wasm' ? 'application/wasm'
        : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch (error) {
      res.writeHead(500); res.end(`Server Error: ${error.message}`);
    }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

export async function installTelemetryInit(page) {
  const networkIsolation = await installOfflineNetworkIsolation(page);
  await page.addInitScript(() => {
    /* The QA origin is an ephemeral local port. Clear only its auth keys so a
       reused Chrome profile must exercise PLAY OFFLINE on every evidence run. */
    try {
      localStorage.removeItem('mf_auth_gate_v1');
      localStorage.removeItem('massfront_authp_session_v1');
    } catch {}
    window.__mfProbe = {
      resourceCounts: { textures: 0, buffers: 0, programs: 0, vaos: 0, fbos: 0 },
      longTasks: [],
      contextLossEvents: 0
    };
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__mfProbe.longTasks.push({ name: entry.name, startTime: entry.startTime, duration: entry.duration });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {}
    document.addEventListener('webglcontextlost', () => { window.__mfProbe.contextLossEvents++; }, true);
    if (typeof WebGL2RenderingContext === 'undefined' || WebGL2RenderingContext.prototype.__mfPerfWrapped) return;
    const proto = WebGL2RenderingContext.prototype;
    Object.defineProperty(proto, '__mfPerfWrapped', { value: true, configurable: true });
    for (const [method, counter] of [
      ['createTexture', 'textures'], ['createBuffer', 'buffers'], ['createProgram', 'programs'],
      ['createVertexArray', 'vaos'], ['createFramebuffer', 'fbos']
    ]) {
      const original = proto[method];
      if (typeof original !== 'function') continue;
      proto[method] = function(...args) {
        window.__mfProbe.resourceCounts[counter]++;
        return original.apply(this, args);
      };
    }
  });
  return networkIsolation;
}

export async function applyPreset(page, preset) {
  const selected = await page.evaluate(value => {
    const allowed = ['low', 'medium', 'high', 'cinematic'];
    if (!allowed.includes(value)) throw new Error(`Unknown graphics preset: ${value}`);
    if (typeof META === 'undefined' || !META.settings) throw new Error('Graphics settings are unavailable');
    META.settings.quality = value;
    META.settings.gfxOver = {};
    if (typeof applyQualityPreset === 'function') applyQualityPreset();
    return typeof mfGfxKey === 'function' ? mfGfxKey() : value;
  }, preset);
  if (selected !== preset) throw new Error(`Graphics preset did not apply: requested ${preset}, live ${selected}`);
  return selected;
}

async function clickVisible(page, selector, label, timeout = 20000) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout });
  await locator.click();
  return label;
}

export async function enterRealBattle(page) {
  await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 90000 });
  const intro = page.locator('#mfIntroStart');
  if (await intro.isVisible().catch(() => false)) {
    await intro.click();
  }
  /* Each of these swaps a full-screen panel with a transition. Clicking the
     next control the instant it reports visible lands the tap mid-transition
     and it is swallowed, leaving the run stranded on the previous screen.
     Let each panel settle first. */
  await clickVisible(page, '#apOfflineBtn', 'PLAY OFFLINE', 30000);
  await page.waitForTimeout(700);
  await clickVisible(page, '#startBtn', 'War Room', 30000);
  await page.waitForTimeout(700);
  await clickVisible(page, '.warCard[data-mode="standard"]', 'Standard match card', 30000);
  await page.waitForTimeout(700);

  /* The war table is GALAXY -> SYSTEM -> PLANET -> REGION -> DEPLOY and each
     stage exposes its own commit control (#setupStart on some, a world/region
     chip or quick-plan card on others). The previous fixed loop of five
     #setupStart clicks stalled on a hidden #setupStart and no run could reach
     a battle. Advance on whichever control the current stage actually shows. */
  /* Deliberately no generic '.mbtn'/'.warCard' fallback: those match #setupBack
     / #warBack and silently walk the run BACKWARDS to the card list. Only
     forward controls belong here. #setupStart is the commit on the SYSTEM,
     REGION and DEPLOY stages (galaxyui.js:1230 binds it as `launch`). */
  const ADVANCE = [
    '#setupStart',            // commit (SYSTEM, REGION, DEPLOY stages)
    '.mfWorldChip',           // GALAXY: first chip is the unlocked system
    '.mfRegionChip',          // PLANET: first chip is the unlocked region
    '.mfQuickPlan',           // DEPLOY: force template
    '.mfTeamBtn',
    '#mfConquestContinue'
  ];
  // Which war-table stage panel is on screen, used to confirm a tap advanced us.
  const stageSignature = () => page.evaluate(() => {
    const vis = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    return [...document.querySelectorAll('[id^="mfStage"]')].filter(vis).map(el => el.id).join(',')
      || (vis(document.getElementById('cmdbar')) ? 'in-world' : 'unknown');
  }).catch(() => 'unknown');

  let setupClicks = 0;
  for (let step = 0; step < 20; step++) {
    // The world is up once the carrier's DEPLOY BASE HERE control appears.
    if (await page.locator('#deployBtn').first().isVisible().catch(() => false)) break;
    const before = await stageSignature();
    // War table done: the match world is up. DEPLOY BASE HERE appears a moment
    // later, so hand off to the wait below instead of hunting stage controls.
    if (before === 'in-world') break;
    let advanced = false;
    for (const selector of ADVANCE) {
      const locator = page.locator(selector).first();
      if (!(await locator.isVisible().catch(() => false))) continue;
      /* The war table uses two-tap arm/commit navigation (galaxyui.js:1349):
         the first tap arms a chip, the second commits it. Tapping once and
         judging "no progress" is what made the previous attempt fall through
         to a BACK button. Give each control both taps before moving on. */
      for (let tap = 0; tap < 2 && !advanced; tap++) {
        await locator.click({ timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(650);
        if (await stageSignature() !== before ||
            await page.locator('#deployBtn').first().isVisible().catch(() => false)) {
          advanced = true;
        }
      }
      if (advanced) break;
    }
    if (!advanced) throw new Error(`War-table setup stalled at stage "${before}" — no control advanced it.`);
    setupClicks++;
  }

  /* The match world loads with the carrier still airborne — the HUD says
     "tap ground to fly there, then DEPLOY". matchLive only becomes true once
     the base is actually placed, so the run must finish that placement. */
  await page.locator('#deployBtn').first().waitFor({ state: 'visible', timeout: 90000 });
  const canvasBox = await page.locator('#gl').boundingBox().catch(() => null);
  if (canvasBox) {
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.45);
    await page.waitForTimeout(2500);
  }
  // The button can be mid-animation as the carrier flies; the ground tap alone
  // often commits the drop, so a failed click here is not fatal. The
  // matchLive wait below is the real gate.
  await page.locator('#deployBtn').first().click({ timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    return typeof matchLive !== 'undefined' && matchLive === true &&
      typeof running !== 'undefined' && running === true &&
      visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar'));
  }, null, { timeout: 60000 });
  return page.evaluate(clicks => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const authUiVisible = visible(document.getElementById('apOverlay')) || visible(document.getElementById('apForm')) ||
      visible(document.getElementById('authPortal')) || visible(document.getElementById('apOfflineBtn'));
    const menuUiVisible = [...document.querySelectorAll('.overlay')].some(visible);
    const proof = {
      deployedViaUi: true,
      playOfflineUsed: true,
      warRoomUsed: true,
      /* Completion is "the war-table stages were traversed and the battle is
         actually live", not a fixed click count — the stage count is a UI
         detail that already changed once and silently broke every run. */
      setupStagesCompleted: clicks > 0 && typeof matchLive !== 'undefined' && matchLive === true,
      setupClicks: clicks,
      authUiVisible,
      menuUiVisible,
      battleHudVisible: visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar')),
      matchLive: typeof matchLive !== 'undefined' && matchLive === true,
      running: typeof running !== 'undefined' && running === true,
      atPerformanceMs: performance.now()
    };
    window.__mfPerfRealDeployment = proof;
    return proof;
  }, setupClicks);
}

async function runtimeState(page) {
  return page.evaluate(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    let authoritativeUnits = null;
    if (typeof teamCount !== 'undefined' && teamCount && teamCount.length >= 3) {
      authoritativeUnits = Number(teamCount[0]) + Number(teamCount[1]) + Number(teamCount[2]);
    } else if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
      authoritativeUnits = 0;
      for (let index = 0; index < unitHigh; index++) if (ualive[index]) authoritativeUnits++;
    }
    const menuUiVisible = [...document.querySelectorAll('.overlay')].some(visible);
    const simStepSec = authoritativeUnits > 22000 ? 1 / 12 : authoritativeUnits > 13000 ? 1 / 16
      : authoritativeUnits > 6500 ? 1 / 22 : authoritativeUnits > 900 ? 1 / 26 : 1 / 30;
    const simTimeSec = typeof stats !== 'undefined' && Number.isFinite(stats?.t) ? stats.t : null;
    return {
      authUiVisible: visible(document.getElementById('apOverlay')) || visible(document.getElementById('apForm')) ||
        visible(document.getElementById('authPortal')) || visible(document.getElementById('apOfflineBtn')),
      menuUiVisible,
      battleHudVisible: visible(document.getElementById('topbar')) && visible(document.getElementById('cmdbar')),
      matchLive: typeof matchLive !== 'undefined' && matchLive === true,
      running: typeof running !== 'undefined' && running === true,
      paused: typeof paused !== 'undefined' ? !!paused : null,
      contextLossCount: window.__mfProbe?.contextLossEvents ?? null,
      contextIsLost: typeof gl !== 'undefined' && gl && typeof gl.isContextLost === 'function' ? gl.isContextLost() : null,
      simTimeSec,
      simStepSec,
      simTick: simTimeSec == null ? null : Math.round(simTimeSec / simStepSec),
      simAccumulatorSec: typeof acc !== 'undefined' && Number.isFinite(acc) ? Number(acc) : null,
      simBacklogSteps: typeof acc !== 'undefined' && Number.isFinite(acc) ? Number(acc) / simStepSec : null,
      gameSpeed: typeof gameSpeed !== 'undefined' && Number.isFinite(gameSpeed) ? Number(gameSpeed) : null,
      authoritativeUnits,
      camera: typeof cam !== 'undefined' ? {
        x: Number(cam.x), y: Number(cam.y),
        span: typeof orthoSpan !== 'undefined' ? Number(orthoSpan) : null,
        pitch: typeof pitch !== 'undefined' ? Number(pitch) : null,
        yaw: typeof yaw !== 'undefined' ? Number(yaw) : null
      } : null,
      preset: typeof mfGfxKey === 'function' ? mfGfxKey() : null
    };
  });
}

function assertRuntimeState(state, label) {
  const failures = [];
  if (state.authUiVisible) failures.push('auth UI visible');
  if (state.menuUiVisible) failures.push('front/menu UI visible');
  if (!state.battleHudVisible) failures.push('battle HUD absent');
  if (!state.matchLive) failures.push('matchLive false');
  if (!state.running) failures.push('running false');
  if (state.contextLossCount !== 0) failures.push(`context loss count ${state.contextLossCount}`);
  if (state.contextIsLost) failures.push('WebGL context is lost');
  if (failures.length) throw new Error(`${label} runtime gate failed: ${failures.join(', ')}`);
}

export async function enableRuntimeTelemetry(page) {
  const enabled = await page.evaluate(() => typeof mfPerfEnable === 'function' ? mfPerfEnable(true) : false);
  if (!enabled) throw new Error('Native mfPerf telemetry could not be enabled');
}

async function takePerfCheckpoint(page, label) {
  return page.evaluate(checkpointLabel => {
    if (typeof mfPerfSnapshot !== 'function') throw new Error('Native mfPerfSnapshot is unavailable');
    return { label: checkpointLabel, atPerformanceMs: performance.now(), snapshot: mfPerfSnapshot() };
  }, label);
}

async function sampleFrames(page, totalFrames) {
  return page.evaluate(async frameCount => {
    const probe = {
      frameDts: [], simTimes: [], renderTimes: [], gpuTimes: [], drawCalls: [], triangles: [],
      totalUnits: [], visibleUnits: [], culledUnits: [], particleCounts: [], projectileCounts: [], heapUsed: [],
      simBacklogSteps: [], reconciliation: []
    };
    const push = (array, value) => { if (Number.isFinite(value)) array.push(value); };
    if (typeof mfPerfLatest !== 'function') throw new Error('Cheap mfPerfLatest telemetry is unavailable');
    const latest = {};
    let last = performance.now();
    for (let frame = 0; frame < frameCount; frame++) {
      await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
      const now = performance.now();
      push(probe.frameDts, now - last); last = now;
      const current = mfPerfLatest(latest);
      push(probe.simTimes, current?.cpu?.sim);
      push(probe.renderTimes, current?.cpu?.render);
      push(probe.gpuTimes, current?.gpu?.render);
      if (typeof drawCalls !== 'undefined') push(probe.drawCalls, Number(drawCalls));
      if (typeof triCount !== 'undefined') push(probe.triangles, Number(triCount));
      const counterTotal = typeof teamCount !== 'undefined' && teamCount && teamCount.length >= 3
        ? Number(teamCount[0]) + Number(teamCount[1]) + Number(teamCount[2]) : null;
      push(probe.totalUnits, counterTotal);
      if (typeof acc !== 'undefined' && Number.isFinite(acc)) {
        const step = counterTotal > 22000 ? 1 / 12 : counterTotal > 13000 ? 1 / 16
          : counterTotal > 6500 ? 1 / 22 : counterTotal > 900 ? 1 / 26 : 1 / 30;
        push(probe.simBacklogSteps, Number(acc) / step);
      }
      /* A complete authoritative/camera reconciliation is deliberately bounded
         to checkpoints. Scanning every unit every RAF would measure the probe. */
      if (frame === 0 || frame === frameCount - 1 || (frame + 1) % 30 === 0) {
        let scannedTotal = 0, visibleCount = 0;
        const bounds = typeof camBounds === 'function' ? camBounds() : null;
        if (typeof ualive !== 'undefined' && typeof unitHigh !== 'undefined') {
          for (let index = 0; index < unitHigh; index++) {
            if (!ualive[index]) continue;
            scannedTotal++;
            if (bounds && typeof ux !== 'undefined' && typeof uy !== 'undefined' &&
                ux[index] >= bounds.x0 && ux[index] <= bounds.x1 && uy[index] >= bounds.y0 && uy[index] <= bounds.y1) visibleCount++;
          }
        }
        const culled = scannedTotal - visibleCount;
        push(probe.visibleUnits, bounds ? visibleCount : NaN);
        push(probe.culledUnits, bounds ? culled : NaN);
        probe.reconciliation.push({
          frame, counterTotal: Number.isFinite(counterTotal) ? counterTotal : null,
          scannedTotal, visible: bounds ? visibleCount : null, culled: bounds ? culled : null,
          hasCameraBounds: !!bounds
        });
      }
      if (typeof nPart !== 'undefined') push(probe.particleCounts, Number(nPart));
      if (typeof nProj !== 'undefined') push(probe.projectileCounts, Number(nProj));
      if (performance.memory && Number.isFinite(performance.memory.usedJSHeapSize)) {
        push(probe.heapUsed, performance.memory.usedJSHeapSize / (1024 * 1024));
      }
    }
    return probe;
  }, totalFrames);
}

function appendProbe(target, source) {
  for (const key of Object.keys(target)) target[key].push(...(source[key] || []));
}

async function captureBattlefield(page, scenario, unitsPerFaction, stage, captureLane, authoritative, capturesDir) {
  if (!/^[a-z0-9-]+$/.test(captureLane) || !['start', 'mid', 'end'].includes(stage)) {
    throw new Error(`Unsafe performance-capture identity: ${captureLane}/${stage}`);
  }
  const state = await runtimeState(page);
  assertRuntimeState(state, `${stage} capture`);
  await page.evaluate(({ label, counts }) => {
    let overlay = document.getElementById('__mfPerfEvidenceHud');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '__mfPerfEvidenceHud';
      Object.assign(overlay.style, {
        position: 'fixed', left: '8px', top: '82px', zIndex: '99999', pointerEvents: 'none',
        padding: '7px 9px', color: '#dff8ff', background: 'rgba(2,8,15,.86)',
        border: '1px solid #38d8ff', font: '700 10px/1.45 monospace', whiteSpace: 'pre-wrap'
      });
      document.body.appendChild(overlay);
    }
    overlay.textContent = `${label}\nAUTHORITATIVE ${counts.total}\nFACTIONS ${JSON.stringify(counts.byFaction)}\nTEAMS ${JSON.stringify(counts.byTeam)}`;
  }, { label: `${scenario.id} ${unitsPerFaction}/FACTION ${stage.toUpperCase()}`, counts: authoritative });
  const file = `${scenarioStem(scenario.id, unitsPerFaction)}_${captureLane}_${stage}.png`;
  const path = join(capturesDir, file);
  await page.screenshot({ path });
  const png = await inspectPng(path);
  return {
    stage,
    file,
    sha256: await fileSha256(path),
    width: png.width,
    height: png.height,
    hudVisible: state.battleHudVisible,
    authoritativeTotal: authoritative.total,
    byFaction: authoritative.byFaction,
    byTeam: authoritative.byTeam,
    simTimeSec: state.simTimeSec
  };
}

function detectBackend(renderer) {
  if (/direct3d\s*11|d3d11/i.test(renderer)) return 'ANGLE/D3D11';
  if (/metal/i.test(renderer)) return 'ANGLE/Metal';
  if (/vulkan/i.test(renderer)) return 'ANGLE/Vulkan';
  if (/opengl/i.test(renderer)) return 'OpenGL';
  return 'unknown-hardware-backend';
}

export async function runScenarioBenchmark(page, scenario, unitsPerFaction, options) {
  const {
    durationFrames = 240,
    sourceIdentity,
    gpu,
    issues,
    deploymentProof,
    preset,
    viewport,
    url,
    captureLane = 'device-v3',
    capturesDir = LEGACY_CAPTURES_DIR,
    evidenceScope = 'physical-device-short-run',
    checkpoint = async () => {}
  } = options;
  const topology = benchmarkScenarioSupport(scenario);
  if (topology.status !== 'supported') {
    const error = new Error(`UNSUPPORTED ${scenario.id}: ${topology.reason}`);
    error.code = 'MASSFRONT_PERF_SCENARIO_UNSUPPORTED';
    throw error;
  }
  if (issues.pageErrors.length) throw new Error(`Pre-sample page errors: ${issues.pageErrors.join(' | ')}`);
  if (issues.consoleErrors.length) throw new Error(`Pre-sample console errors: ${issues.consoleErrors.join(' | ')}`);
  await checkpoint('before deterministic load');
  const preState = await runtimeState(page);
  assertRuntimeState(preState, 'pre-load');
  const setup = await setupDeterministicScenario(page, scenario, unitsPerFaction);

  for (let frame = 0; frame < 30; frame++) await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(resolveFrame)));
  const postSettle = await collectAuthoritativePopulation(page, scenario);
  if (!postSettle.supported) throw new Error('Authoritative population arrays are unavailable');
  const expectedTotal = setup.expected.total;
  if (setup.attempted.total !== expectedTotal || setup.accepted.total !== expectedTotal ||
      postSettle.total !== expectedTotal || postSettle.unmatched !== 0) {
    throw new Error(`Population gate failed: attempted=${setup.attempted.total}, accepted=${setup.accepted.total}, ` +
      `postSettle=${postSettle.total}, unmatched=${postSettle.unmatched}, requested=${expectedTotal}`);
  }
  await checkpoint('after population settle');

  const sampleStartState = await runtimeState(page);
  assertRuntimeState(sampleStartState, 'post-settle');
  const captures = [];
  captures.push(await captureBattlefield(
    page, scenario, unitsPerFaction, 'start', captureLane, postSettle, capturesDir
  ));
  await checkpoint('after start capture');
  await injectCombatDirective(page, 'advance_to_center');
  const nativeCheckpoints = [await takePerfCheckpoint(page, 'start')];
  const samples = {
    frameDts: [], simTimes: [], renderTimes: [], gpuTimes: [], drawCalls: [], triangles: [],
    totalUnits: [], visibleUnits: [], culledUnits: [], particleCounts: [], projectileCounts: [], heapUsed: [],
    simBacklogSteps: [], reconciliation: []
  };
  const firstFrames = Math.max(1, Math.floor(durationFrames / 2));
  const wallStart = performance.now();
  appendProbe(samples, await sampleFrames(page, firstFrames));
  nativeCheckpoints.push(await takePerfCheckpoint(page, 'mid'));
  const midPopulation = await collectAuthoritativePopulation(page, scenario);
  captures.push(await captureBattlefield(
    page, scenario, unitsPerFaction, 'mid', captureLane, midPopulation, capturesDir
  ));
  await checkpoint('after mid capture');
  appendProbe(samples, await sampleFrames(page, Math.max(1, durationFrames - firstFrames)));
  const wallDurationMs = performance.now() - wallStart;
  nativeCheckpoints.push(await takePerfCheckpoint(page, 'end'));
  const endPopulation = await collectAuthoritativePopulation(page, scenario);
  captures.push(await captureBattlefield(
    page, scenario, unitsPerFaction, 'end', captureLane, endPopulation, capturesDir
  ));
  await checkpoint('after end capture');

  const endState = await runtimeState(page);
  assertRuntimeState(endState, 'post-sample');
  if (issues.pageErrors.length) throw new Error(`Page errors during benchmark: ${issues.pageErrors.join(' | ')}`);
  if (issues.consoleErrors.length) throw new Error(`Console errors during benchmark: ${issues.consoleErrors.join(' | ')}`);
  const endSourceIdentity = await collectSourceIdentity();
  const sourceStable = sameSourceIdentity(sourceIdentity, endSourceIdentity);
  await checkpoint('after end source identity');
  const frameTimeMs = telemetryStats(samples.frameDts, { supported: true, source: 'requestAnimationFrame' });
  const simulatedDurationSec = endState.simTimeSec - sampleStartState.simTimeSec;
  const wallTimeRatio = simulatedDurationSec / (wallDurationMs / 1000);
  const maxBacklogSteps = samples.simBacklogSteps.length ? Math.max(...samples.simBacklogSteps) : null;
  const performanceGate = deriveStage8PerformanceGate({
    scenarioId: scenario.id,
    unitsPerFaction,
    expectedSeats: setup.expected.seats,
    expectedTotal,
    acceptanceTotal: topology.acceptanceTotal,
    frameTimeMs,
    scope: evidenceScope
  });
  const result = {
    schema: PERF_EVIDENCE_SCHEMA,
    evidenceStatus: performanceGate.evidenceStatus,
    executionPath: PERF_EXECUTION_PATH,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    theatre: scenario.theatre,
    unitsPerFaction,
    factionsCount: scenario.factions.length,
    evidenceClass: performanceGate.evidenceClass,
    topology: { ...topology, seatCount: scenario.factions.length },
    timestamp: new Date().toISOString(),
    performanceGate,
    runtimeGate: {
      ...deploymentProof,
      authUiVisible: endState.authUiVisible,
      menuUiVisible: endState.menuUiVisible,
      battleHudVisible: endState.battleHudVisible,
      matchLive: endState.matchLive,
      running: endState.running,
      gpuValidation: { passed: true, hardware: true, renderer: gpu.renderer, vendor: gpu.vendor },
      pageErrors: [...issues.pageErrors],
      consoleErrors: [...issues.consoleErrors],
      contextLossCount: endState.contextLossCount
    },
    population: {
      requestedPerFaction: unitsPerFaction,
      expected: { seats: setup.expected.seats, total: setup.expected.total },
      attempted: setup.attempted,
      accepted: setup.accepted,
      postSettle
    },
    provenance: {
      ...sourceIdentity,
      sourceDriftChecked: true,
      sourceStable,
      endWorktreeFingerprint: endSourceIdentity.worktreeFingerprint,
      endRuntimeFingerprint: endSourceIdentity.runtimeFingerprint,
      preset,
      viewport,
      url,
      renderer: gpu.renderer,
      vendor: gpu.vendor,
      backend: detectBackend(gpu.renderer),
      seed: scenario.mapSeed,
      camera: { start: sampleStartState.camera, end: endState.camera },
      simulation: {
        startTimeSec: sampleStartState.simTimeSec,
        endTimeSec: endState.simTimeSec,
        startTick: sampleStartState.simTick,
        endTick: endState.simTick,
        startStepSec: sampleStartState.simStepSec,
        endStepSec: endState.simStepSec,
        durationFrames,
        wallDurationMs: Math.round(wallDurationMs * 100) / 100,
        simulatedDurationSec: Math.round(simulatedDurationSec * 100000) / 100000,
        wallTimeRatio: Math.round(wallTimeRatio * 10000) / 10000,
        startBacklogSec: sampleStartState.simAccumulatorSec,
        endBacklogSec: endState.simAccumulatorSec,
        maxBacklogSteps: maxBacklogSteps == null ? null : Math.round(maxBacklogSteps * 10000) / 10000,
        backlogSampleCount: samples.simBacklogSteps.length,
        gameSpeed: endState.gameSpeed
      }
    },
    captures,
    metrics: {
      fpsEstimated: frameTimeMs.mean > 0 ? Math.round((1000 / frameTimeMs.mean) * 10) / 10 : null,
      frameTimeMs,
      simPhaseMs: telemetryStats(samples.simTimes, { supported: samples.simTimes.length > 0, source: 'mfPerfLatest.cpu.sim' }),
      renderCpuMs: telemetryStats(samples.renderTimes, { supported: samples.renderTimes.length > 0, source: 'mfPerfLatest.cpu.render' }),
      gpuTimeMs: telemetryStats(samples.gpuTimes, { supported: samples.gpuTimes.length > 0, source: 'EXT_disjoint_timer_query_webgl2/mfPerf' }),
      drawCalls: telemetryStats(samples.drawCalls, { supported: samples.drawCalls.length > 0, source: 'drawCalls' }),
      triangles: telemetryStats(samples.triangles, { supported: samples.triangles.length > 0, source: 'triCount' }),
      visibility: {
        total: telemetryStats(samples.totalUnits, { supported: samples.totalUnits.length > 0, source: 'teamCount authoritative counter' }),
        visible: telemetryStats(samples.visibleUnits, { supported: samples.visibleUnits.length > 0, source: 'bounded camBounds reconciliation scan' }),
        culled: telemetryStats(samples.culledUnits, { supported: samples.culledUnits.length > 0, source: 'bounded total-visible reconciliation' }),
        reconciliation: samples.reconciliation
      },
      simBacklogSteps: telemetryStats(samples.simBacklogSteps, {
        supported: samples.simBacklogSteps.length > 0, source: 'fixed-step accumulator/simStep'
      }),
      nativeCheckpoints,
      vfx: {
        particles: telemetryStats(samples.particleCounts, { supported: samples.particleCounts.length > 0, source: 'nPart' }),
        projectiles: telemetryStats(samples.projectileCounts, { supported: samples.projectileCounts.length > 0, source: 'nProj' })
      },
      webglResources: {
        supported: !!(await page.evaluate(() => window.__mfProbe?.resourceCounts)),
        sampleCount: 1,
        values: await page.evaluate(() => window.__mfProbe?.resourceCounts || null)
      },
      jsHeapMB: telemetryStats(samples.heapUsed, { supported: samples.heapUsed.length > 0, source: 'performance.memory.usedJSHeapSize' }),
      longTaskCount: await page.evaluate(() => window.__mfProbe?.longTasks?.length ?? null),
      contextLossCount: endState.contextLossCount
    }
  };
  const validation = validatePerfEvidence(result);
  if (!validation.valid) {
    result.evidenceStatus = 'rejected';
    result.rejectionReasons = validation.errors;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const runLadder = args.includes('--ladder');
  const scenarioKey = valueAfter(args, '--scenario') || '1v1_duel_verdant';
  const preset = valueAfter(args, '--preset') || 'high';
  const frameValue = Number.parseInt(valueAfter(args, '--frames') || '240', 10);
  if (!Number.isInteger(frameValue) || frameValue < 3) throw new Error('--frames must be an integer >= 3');
  const scenarios = runAll ? Object.values(BENCHMARK_SCENARIOS) : [BENCHMARK_SCENARIOS[scenarioKey]];
  if (scenarios.some(value => !value)) throw new Error(`Unknown scenario: ${scenarioKey}`);
  const populations = parsePerformancePopulations(args);
  const unsupportedUnits = runLadder ? 500 : populations[0];

  const unsupported = scenarios.filter(scenario => benchmarkScenarioSupport(scenario).status === 'unsupported');
  const supportedScenarios = scenarios.filter(scenario => benchmarkScenarioSupport(scenario).status === 'supported');
  const queuedOutputs = [];
  const unsupportedResults = [];
  const results = [];
  const outcomeLines = [];
  let hasDiagnostic = unsupported.length > 0;
  let hasPerformanceFailure = false;
  let sourceIdentity = null;
  let workspaceGuard = null;
  let server = null;
  let browser = null;
  let failure = null;
  try {
    workspaceGuard = await acquireVerificationFreeze({
      root: ROOT,
      label: 'Stage 8 performance evidence matrix',
      quietMs: Number(process.env.MF_QUIET_PREFLIGHT_MS || 15000),
      allowedPaths: [CURRENT_PERF_ROOT]
    });
    await workspaceGuard.checkpoint('before bounded performance-output preparation');
    await prepareCurrentPerfOutput({ scenarios, populations });
    await workspaceGuard.checkpoint('after bounded performance-output preparation');

    sourceIdentity = await collectSourceIdentity();
    await workspaceGuard.checkpoint('after initial performance source identity');
    console.log(`MASSFRONT perf evidence ${sourceIdentity.gitHead} dirty=${sourceIdentity.gitDirty}`);
    console.log(`worktree=${sourceIdentity.worktreeFingerprint} runtime=${sourceIdentity.runtimeFingerprint}`);

    for (const scenario of unsupported) {
      const topology = benchmarkScenarioSupport(scenario);
      const result = {
        schema: PERF_EVIDENCE_SCHEMA,
        evidenceStatus: 'unsupported',
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        unitsPerFaction: unsupportedUnits,
        factionsCount: scenario.factions.length,
        topology: { ...topology, seatCount: scenario.factions.length },
        timestamp: new Date().toISOString()
      };
      unsupportedResults.push(result);
      queuedOutputs.push({ path: join(METRICS_DIR, `${scenario.id}_unsupported_v3.json`), record: result });
    }

    if (supportedScenarios.length) {
      server = await startStaticServer();
      browser = await launchPwBrowser({ headless: true });
      for (const scenario of supportedScenarios) {
        for (const unitsPerFaction of populations) {
          const runLabel = `${scenario.id} ${unitsPerFaction}/faction`;
          await workspaceGuard.checkpoint(`before performance scenario ${runLabel}`);
          const page = await browser.newPage({
            viewport: { width: DEFAULT_VIEWPORT.width, height: DEFAULT_VIEWPORT.height },
            deviceScaleFactor: DEFAULT_VIEWPORT.dpr,
            hasTouch: true,
            isMobile: true,
            serviceWorkers: 'block',
            userAgent: ANDROID_S25_USER_AGENT
          });
          const issues = { pageErrors: [], consoleErrors: [] };
          page.on('pageerror', error => issues.pageErrors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
          try {
            const networkIsolation = await installTelemetryInit(page);
            const url = `${server.url}?mfperf=1&perfEvidence=1`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            const gpu = await assertHardwareGpu(page);
            await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof resetWorld === 'function', null, { timeout: 90000 });
            const mobileProof = await page.evaluate(() => ({
              userAgent: navigator.userAgent,
              mobileGpu: typeof MF_MOBILE_GPU === 'boolean' ? MF_MOBILE_GPU : null
            }));
            assertMobileGpuBranch(mobileProof.mobileGpu, mobileProof.userAgent, 'perf-probe-runner');
            const livePreset = await applyPreset(page, preset);
            const deploymentProof = await enterRealBattle(page);
            await workspaceGuard.checkpoint(`after real deployment ${runLabel}`);
            await enableRuntimeTelemetry(page);
            const result = await runScenarioBenchmark(page, scenario, unitsPerFaction, {
              durationFrames: frameValue,
              sourceIdentity,
              gpu,
              issues,
              deploymentProof,
              preset: livePreset,
              viewport: DEFAULT_VIEWPORT,
              url,
              captureLane: 'desktop-v3',
              capturesDir: CAPTURES_DIR,
              evidenceScope: 'desktop-short-run',
              checkpoint: name => workspaceGuard.checkpoint(`${runLabel}: ${name}`)
            });
            result.networkIsolation = await networkIsolation.finalize(`performance scenario ${scenario.id}`);
            result.runtimeGate.pageErrors = [...issues.pageErrors];
            result.runtimeGate.consoleErrors = [...issues.consoleErrors];
            await workspaceGuard.checkpoint(`after offline isolation ${runLabel}`);

            const scenarioEndIdentity = await collectSourceIdentity();
            result.provenance.sourceStable = sameSourceIdentity(sourceIdentity, scenarioEndIdentity);
            result.provenance.endWorktreeFingerprint = scenarioEndIdentity.worktreeFingerprint;
            result.provenance.endRuntimeFingerprint = scenarioEndIdentity.runtimeFingerprint;
            await workspaceGuard.checkpoint(`after final source identity ${runLabel}`);
            const validation = validatePerfEvidence(result);
            if (!validation.valid) {
              result.evidenceStatus = 'rejected';
              result.rejectionReasons = validation.errors;
              throw new Error(`Evidence rejected: ${validation.errors.join('; ')}`);
            }
            delete result.rejectionReasons;
            results.push(result);
            queuedOutputs.push({
              path: join(METRICS_DIR, `${scenarioStem(scenario.id, unitsPerFaction)}_v3.json`),
              record: result
            });
            const gate = result.performanceGate;
            if (validation.status === 'accepted') {
              outcomeLines.push(`SCENARIO DESKTOP PASS ${runLabel} p95=${gate.frameP95Ms}ms p99=${gate.frameP99Ms}ms <= ${gate.thresholdMs}ms`);
            } else if (validation.status === 'diagnostic') {
              hasDiagnostic = true;
              outcomeLines.push(`DIAGNOSTIC/INCOMPLETE ${runLabel} p95=${gate.frameP95Ms}ms p99=${gate.frameP99Ms}ms; acceptance requires exactly 500/faction`);
            } else {
              hasPerformanceFailure = true;
              outcomeLines.push(`SCENARIO DESKTOP FAIL ${runLabel} p95=${gate.frameP95Ms}ms p99=${gate.frameP99Ms}ms > ${gate.thresholdMs}ms`);
            }
          } finally {
            await page.close().catch(() => {});
          }
          await workspaceGuard.checkpoint(`after performance scenario ${runLabel}`);
        }
      }
    }

    if (browser) {
      await closePwBrowser();
      browser = null;
    }
    if (server) {
      await server.close();
      server = null;
    }
    const finalSourceIdentity = await collectSourceIdentity();
    if (!sameSourceIdentity(sourceIdentity, finalSourceIdentity)) {
      throw new Error('Performance matrix source identity changed before final evidence release');
    }
    await workspaceGuard.checkpoint('performance matrix completion');
    queuedOutputs.push({
      path: join(METRICS_DIR, `summary_matrix_${sourceIdentity.runtimeFingerprint.slice(0, 12)}_v3.json`),
      record: [...results, ...unsupportedResults]
    });
  } catch (error) {
    failure = error;
  } finally {
    if (browser) await closePwBrowser().catch(error => { failure ??= error; });
    if (server) await server.close().catch(error => { failure ??= error; });
    if (workspaceGuard) {
      try {
        await workspaceGuard.release({ assertStable: true, name: 'performance evidence final release' });
      } catch (error) {
        failure ??= error;
      }
      workspaceGuard = null;
    }
  }

  if (failure) throw failure;
  try {
    for (const output of queuedOutputs) {
      await writeFile(output.path, `${JSON.stringify(output.record, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    await Promise.all(queuedOutputs.map(output => rm(output.path, { force: true }).catch(() => {})));
    throw new Error(`Performance evidence publication failed: ${error.message}`, { cause: error });
  }
  for (const scenario of unsupported) {
    console.log(`UNSUPPORTED ${scenario.id}: ${benchmarkScenarioSupport(scenario).reason}`);
  }
  for (const line of outcomeLines) console.log(line);
  if (hasPerformanceFailure) process.exitCode = 1;
  else if (hasDiagnostic || !supportedScenarios.length) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(`Fatal probe error: ${error.stack || error.message}`); process.exit(1); });
}
