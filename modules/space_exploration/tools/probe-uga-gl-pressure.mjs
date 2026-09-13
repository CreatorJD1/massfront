import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership, closePwBrowser, launchPwBrowser, pwBrowserEvidence, recordPwBrowserGpu
} from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(moduleRoot, '..', '..');
const execFile = promisify(execFileCallback);
const repeatLimit = Math.max(1, Number.parseInt(process.env.MF_GL_PRESSURE_REPEATS || '24', 10));
const settleMs = Math.max(0, Number.parseInt(process.env.MF_GL_PRESSURE_SETTLE_MS || '80', 10));
const pressureMode = String(process.env.MF_GL_PRESSURE_MODE || 'reload').trim().toLowerCase();
if (!['reload', 'held-pages'].includes(pressureMode)) throw new Error(`Unknown MF_GL_PRESSURE_MODE ${pressureMode}.`);
const heldPageLimit = Math.max(2, Math.min(8, Number.parseInt(process.env.MF_GL_PRESSURE_HELD_PAGE_LIMIT || '4', 10)));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(moduleRoot, 'tmp', 'gl-pressure', runId);
const MIME = {
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp'
};
const sourceFiles = [
  'index.html', 'src/space_experience.js', 'src/core/uga_command_scene.js',
  'src/core/window_emissive_bloom.js',
  'src/ui/uga_command.js', 'src/ui/uga_command.css', 'tools/probe-uga-gl-pressure.mjs'
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sourceProvenance() {
  const files = [];
  for (const name of sourceFiles) {
    const bytes = await readFile(join(moduleRoot, name));
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const [{ stdout: headOut }, { stdout: statusOut }] = await Promise.all([
    execFile('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
    execFile('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 })
  ]);
  const workspaceEntries = statusOut.split(/\r?\n/).filter(Boolean);
  const sourceBearingEntries = workspaceEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return !path.startsWith('.tmp/') && !path.startsWith('modules/space_exploration/tmp/');
  });
  const sourceEntries = sourceBearingEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return path.startsWith('modules/space_exploration/') || ['tools/pw-browser.mjs', 'tools/chrome-gpu.mjs'].includes(path);
  });
  return {
    head: headOut.trim(),
    dirtyFingerprint: sha256(sourceEntries.join('\n')),
    dirtyEntries: sourceEntries.length,
    workspaceDirtyFingerprint: sha256(statusOut),
    workspaceDirtyEntries: workspaceEntries.length,
    workspaceSourceDirtyEntries: sourceBearingEntries.length,
    workspaceSourceDirtyFingerprint: sha256(sourceBearingEntries.join('\n')),
    dirtyScope: 'space exploration module + owned browser/GPU harness; generated evidence excluded',
    excludedGeneratedEvidenceEntries: workspaceEntries.length - sourceBearingEntries.length,
    sourceSetSha256: sha256(files.map(file => `${file.path}:${file.sha256}`).join('\n')),
    files
  };
}

function sameProvenance(start, end) {
  return Boolean(start && end
    && start.head === end.head
    && start.dirtyFingerprint === end.dirtyFingerprint
    && start.sourceSetSha256 === end.sourceSetSha256);
}

function markdown(report) {
  const lines = [
    '# MASSFRONT UGA GL-pressure evidence', '',
    `- Status: **${report.status}**`,
    `- Mode: \`${report.pressureMode}\``,
    `- Iterations: ${report.iterations.length}/${report.repeatLimit}`,
    `- Held-page bound: ${report.heldPageLimit}`,
    `- Peak live authored pages: ${report.peakLivePages}`,
    `- Retired held pages: ${report.retiredHeldPages}`,
    `- GPU: \`${report.gpu?.renderer || 'UNKNOWN'}\``,
    `- Browser: PID ${report.browserOwnership?.pid ?? 'UNKNOWN'}, port ${report.browserOwnership?.port ?? 'UNKNOWN'}, owned=${report.browserOwnership?.owned ?? 'UNKNOWN'}, reused=${report.browserOwnership?.reused ?? 'UNKNOWN'}`,
    `- Cleanup: ${report.browserOwnership?.cleanup?.success ?? false}`,
    `- Git HEAD: \`${report.provenance.start?.head || 'UNKNOWN'}\``,
    `- Start dirty fingerprint: \`${report.provenance.start?.dirtyFingerprint || 'UNKNOWN'}\``,
    `- End dirty fingerprint: \`${report.provenance.end?.dirtyFingerprint || 'UNKNOWN'}\``,
    `- Source-set stable: ${report.provenance.stable}`, ''
  ];
  if (report.error) lines.push('## Blocker', '', `- ${String(report.error).split('\n')[0]}`, '');
  lines.push('## Source hashes', '');
  for (const file of report.provenance.start?.files || []) lines.push(`- \`${file.path}\`: \`${file.sha256}\` (${file.bytes} bytes)`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function bounded(action, timeoutMs = 5000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action).catch(() => null),
      new Promise(resolveTimeout => { timer = setTimeout(() => resolveTimeout(null), timeoutMs); })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function compactConsoleMessage(type, message, iteration, phase) {
  const text = String(message || '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const shaderNames = [...new Set([...text.matchAll(/#define SHADER_NAME ([^\r\n]+)/g)].map(match => match[1].trim()))];
  const defines = [...new Set([...text.matchAll(/#define (STANDARD|PHYSICAL|USE_[A-Z0-9_]+|DOUBLE_SIDED|FLAT_SHADED)/g)].map(match => match[1]))];
  const shaderFailure = /THREE\.WebGLProgram: shader error:/i.test(text);
  const glErrorMatch = firstLine.match(/shader error:\s+(\d+)\s+35715\s+(true|false)/i);
  return {
    iteration,
    phase,
    type,
    firstLine,
    bytes: Buffer.byteLength(text),
    sha256: sha256(text),
    shaderFailure,
    glError: glErrorMatch ? Number(glErrorMatch[1]) : null,
    validateStatus: glErrorMatch ? glErrorMatch[2] === 'true' : null,
    shaderNames,
    defines
  };
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? '/index.html' : pathname;
      const file = resolve(moduleRoot, `.${requested}`);
      if (file !== moduleRoot && !file.startsWith(`${moduleRoot}${sep}`)) throw new Error('path outside module root');
      const bytes = await readFile(file);
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      response.end(bytes);
    } catch {
      response.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/index.html`,
    close: () => new Promise(resolveClose => server.close(resolveClose))
  };
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
}

async function openUga(page) {
  await page.evaluate(() => {
    Promise.resolve(window.__MASSFRONT_SPACE__.openUga('research')).catch(error => {
      window.__MF_GL_PRESSURE_OPEN_ERROR__ = String(error?.stack || error?.message || error);
    });
  });
  await page.waitForFunction(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const veil = document.querySelector('#renderVeil');
    return (experience?.commandScene?.loaded && veil?.classList.contains('ready'))
      || veil?.classList.contains('failed')
      || window.__MF_GL_PRESSURE_OPEN_ERROR__;
  }, null, { timeout: 60_000 });
  const loadState = await page.evaluate(() => ({
    loaded: Boolean(window.__MASSFRONT_SPACE__?.commandScene?.loaded),
    veil: document.querySelector('#renderVeil')?.className || null,
    status: document.querySelector('#loadStatus')?.textContent || null,
    error: window.__MF_GL_PRESSURE_OPEN_ERROR__ || null
  }));
  if (!loadState.loaded || /\bfailed\b/.test(loadState.veil || '')) {
    throw new Error(`UGA load failed: ${loadState.error || loadState.status || loadState.veil || 'unknown state'}`);
  }
  await page.waitForTimeout(300);
}

async function sample(page) {
  return page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const renderer = experience?.engine?.renderer;
    const gl = renderer?.getContext?.();
    return {
      contextLost: Boolean(gl?.isContextLost?.()),
      glError: gl?.getError?.() ?? null,
      rendererInfo: renderer ? {
        programs: renderer.info?.programs?.length ?? null,
        geometries: renderer.info?.memory?.geometries ?? null,
        textures: renderer.info?.memory?.textures ?? null,
        calls: renderer.info?.render?.calls ?? null,
        triangles: renderer.info?.render?.triangles ?? null
      } : null,
      bloom: experience?.commandScene?.windowBloom?.getTelemetry?.() || null,
      gpu: renderer?.userData?.gpu || null,
      error: window.__MASSFRONT_SPACE_ERROR__ ? String(window.__MASSFRONT_SPACE_ERROR__?.stack || window.__MASSFRONT_SPACE_ERROR__) : null
    };
  });
}

await mkdir(output, { recursive: true });
const report = {
  schemaVersion: 2,
  probe: 'probe-uga-gl-pressure.mjs',
  runId,
  startedAt: new Date().toISOString(),
  repeatLimit,
  settleMs,
  pressureMode,
  heldPageLimit,
  lifecycle: pressureMode === 'held-pages'
    ? 'one browser process; keep each authored UGA page and WebGL2 context alive while opening the next page'
    : 'one browser process + one page; explicit experience.dispose(), wait, reload, then reopen authored UGA cutaway',
  url: null,
  gpu: null,
  browserOwnership: null,
  provenance: { start: null, end: null, stable: false },
  peakLivePages: 0,
  retiredHeldPages: 0,
  iterations: [],
  console: [],
  rawConsoleArtifact: 'console-messages.json',
  firstShaderFailureIteration: null,
  firstContextLossIteration: null,
  status: 'UNKNOWN'
};
const rawConsole = [];
let browser;
let server;
let page;
let currentIteration = 0;
let phase = 'boot';
const heldPages = [];

function attachPageTelemetry(targetPage, iteration) {
  targetPage.on('console', message => {
    const eventIteration = pressureMode === 'held-pages' ? iteration : currentIteration;
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = message.text();
    rawConsole.push({ iteration: eventIteration, phase, type, message: text });
    const compact = compactConsoleMessage(type, text, eventIteration, phase);
    report.console.push(compact);
    if (compact.shaderFailure && report.firstShaderFailureIteration == null) report.firstShaderFailureIteration = iteration;
  });
  targetPage.on('pageerror', error => {
    const eventIteration = pressureMode === 'held-pages' ? iteration : currentIteration;
    const text = error?.stack || error?.message || String(error);
    rawConsole.push({ iteration: eventIteration, phase, type: 'pageerror', message: text });
    report.console.push(compactConsoleMessage('pageerror', text, eventIteration, phase));
  });
  targetPage.on('requestfailed', request => {
    const eventIteration = pressureMode === 'held-pages' ? iteration : currentIteration;
    const text = `${request.failure()?.errorText || 'request failed'} ${request.url()}`;
    rawConsole.push({ iteration: eventIteration, phase, type: 'requestfailed', message: text });
    report.console.push(compactConsoleMessage('requestfailed', text, eventIteration, phase));
  });
}

try {
  report.provenance.start = await sourceProvenance();
  server = await startServer();
  report.url = server.url;
  browser = await launchPwBrowser({ ownershipMode: 'isolated' });
  await assertPwBrowserOwnership(browser);
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  try {
    report.gpu = await assertHardwareGpu(gpuPage);
    recordPwBrowserGpu(browser, report.gpu);
  } finally {
    await gpuPage.close();
  }
  report.browserOwnership = await assertPwBrowserOwnership(browser);

  page = await browser.newPage({ viewport: { width: 430, height: 932 }, hasTouch: true, deviceScaleFactor: 1 });
  report.peakLivePages = 1;
  attachPageTelemetry(page, 1);

  phase = 'initial-navigation';
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  for (currentIteration = 1; currentIteration <= repeatLimit; currentIteration++) {
    const record = { iteration: currentIteration, startedAt: new Date().toISOString() };
    try {
      phase = 'ready';
      await waitReady(page);
      phase = 'open-uga';
      await openUga(page);
      phase = 'sample';
      record.sample = await sample(page);
      if (record.sample.contextLost && report.firstContextLossIteration == null) report.firstContextLossIteration = currentIteration;
    } catch (error) {
      record.error = error?.stack || error?.message || String(error);
      try { record.sample = await sample(page); } catch {}
    }
    record.shaderFailures = report.console.filter(entry => entry.iteration === currentIteration && entry.shaderFailure).length;
    record.warnings = report.console.filter(entry => entry.iteration === currentIteration && entry.type === 'warning').length;
    record.finishedAt = new Date().toISOString();
    report.iterations.push(record);
    console.log(JSON.stringify({
      iteration: currentIteration,
      shaderFailures: record.shaderFailures,
      warnings: record.warnings,
      contextLost: record.sample?.contextLost ?? null,
      glError: record.sample?.glError ?? null,
      programs: record.sample?.rendererInfo?.programs ?? null,
      error: record.error ? record.error.split('\n')[0] : null
    }));
    if (record.shaderFailures > 0 || record.sample?.contextLost || record.error) break;
    if (currentIteration >= repeatLimit) continue;
    if (pressureMode === 'held-pages') {
      heldPages.push(page);
      page = null;
      while (heldPages.length >= heldPageLimit) {
        const retired = heldPages.shift();
        await bounded(() => retired.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()), 2000);
        await bounded(() => retired.close(), 5000);
        report.retiredHeldPages++;
      }
      phase = 'new-held-page';
      page = await bounded(() => browser.newPage({ viewport: { width: 430, height: 932 }, hasTouch: true, deviceScaleFactor: 1 }), 20_000);
      if (!page) {
        report.transitionFailure = { afterIteration: currentIteration, phase, error: 'NEW_HELD_PAGE_TIMEOUT_OR_ERROR', timeoutMs: 20_000 };
        break;
      }
      report.peakLivePages = Math.max(report.peakLivePages, heldPages.length + 1);
      attachPageTelemetry(page, currentIteration + 1);
      await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    } else {
      phase = 'dispose';
      await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()).catch(() => {});
      await page.waitForTimeout(settleMs);
      phase = 'reload';
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    }
  }
  report.status = report.firstShaderFailureIteration == null && report.firstContextLossIteration == null
    && report.iterations.length === repeatLimit && report.iterations.every(record => !record.error)
    ? 'NO_FAILURE_WITHIN_LIMIT'
    : 'REPRODUCED';
} catch (error) {
  report.status = 'PROBE_ABORTED';
  report.error = error?.stack || error?.message || String(error);
} finally {
  if (page) {
    await bounded(() => page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()), 2000);
    await bounded(() => page.close(), 5000);
  }
  for (const heldPage of heldPages) {
    await bounded(() => heldPage.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()), 2000);
    await bounded(() => heldPage.close(), 5000);
  }
  if (browser) {
    try {
      await closePwBrowser(browser);
    } catch (error) {
      report.status = 'PROBE_ABORTED';
      report.error = `Browser cleanup failed: ${error?.stack || error?.message || String(error)}`;
    }
    report.browserOwnership = pwBrowserEvidence(browser);
  }
  if (server) await server.close().catch(() => {});
  try {
    report.provenance.end = await sourceProvenance();
    report.provenance.stable = sameProvenance(report.provenance.start, report.provenance.end);
    if (!report.provenance.stable) {
      report.status = 'PROBE_ABORTED';
      report.error = 'Evidence provenance changed during the run (HEAD, dirty fingerprint, or source-set hash mismatch).';
    }
  } catch (error) {
    report.status = 'PROBE_ABORTED';
    report.error = `Evidence provenance unavailable: ${error?.stack || error?.message || String(error)}`;
  }
  const owned = report.browserOwnership;
  const ownershipValid = owned?.launchMode === 'owned-isolated' && owned?.owned === true && owned?.reused === false
    && owned?.ownership?.status === 'PROVEN' && Boolean(owned?.pid && owned?.port && owned?.profile)
    && Boolean(owned?.gpu?.renderer && owned?.gpu?.vendor)
    && owned?.cleanup?.success === true && owned?.cleanup?.processExited === true
    && owned?.cleanup?.portReleased === true && owned?.cleanup?.profileRemoved === true
    && owned?.cleanup?.manifestRemoved === true;
  if (!ownershipValid) {
    report.status = 'PROBE_ABORTED';
    report.error = 'Owned-browser provenance or cleanup is UNKNOWN/incomplete.';
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'console-messages.json'), `${JSON.stringify(rawConsole, null, 2)}\n`);
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, 'report.md'), markdown(report));
  console.log(JSON.stringify({
    status: report.status,
    firstShaderFailureIteration: report.firstShaderFailureIteration,
    firstContextLossIteration: report.firstContextLossIteration,
    iterations: report.iterations.length,
    report: relative(moduleRoot, join(output, 'report.json')).split(sep).join('/'),
    rawConsole: relative(moduleRoot, join(output, 'console-messages.json')).split(sep).join('/'),
    markdown: relative(moduleRoot, join(output, 'report.md')).split(sep).join('/')
  }, null, 2));
}

process.exit(report.status === 'NO_FAILURE_WITHIN_LIMIT' ? 0 : report.status === 'PROBE_ABORTED' ? 2 : 1);
