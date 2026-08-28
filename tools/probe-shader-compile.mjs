#!/usr/bin/env node
/* Runtime probe for shader compile/link cost. Read-only: it instruments the
   WebGL2 prototype from an init script and never patches engine source.

   What it answers:
     1. How many programs does a real match build, and what do they cost?
     2. How much of that cost is the BLOCKING status query? mkProg() calls
        getShaderParameter(COMPILE_STATUS) and getProgramParameter(LINK_STATUS)
        immediately after each compile/link, which forces the driver to finish
        that program before the next one starts. That serialized wait is the
        budget a two-phase (compile-all, then query-all) restructure recovers.
     3. Is KHR_parallel_shader_compile available on this driver?
     4. Do any programs compile DURING the match (a first-use frame hitch)
        rather than up front? That is what a warm-up pass removes.

   Entry drives the real PLAY OFFLINE -> War Room -> setup route, because
   initGL3D() runs past the menu. Probing only the boot phase would report zero
   programs and read as a false pass.

   It reuses perf-lab's enterRealBattle(), which walks the war-table stages and
   completes the carrier base drop so the run reaches matchLive === true. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from './mobile-device-profile.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { enterRealBattle, installTelemetryInit } from './perf-lab/perf-probe-runner.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function startStaticServer() {
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
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise(done => server.close(done))
  };
}

/* Runs before any page script. Wraps the prototype so every engine program is
   measured, including ones built during glrecover rebuilds. */
function instrument() {
  const COMPILE_STATUS = 0x8B81, LINK_STATUS = 0x8B82;
  const M = {
    programs: 0, shaders: 0,
    compileMs: 0, linkMs: 0,
    compileStatusMs: 0, linkStatusMs: 0,
    compileStatusCalls: 0, linkStatusCalls: 0,
    parallelExt: null,
    firstProgramAt: null, lastProgramAt: null,
    // Programs linked after the match is live are first-use frame hitches.
    liveMarkAt: null, programsAfterLiveMark: 0,
    perProgram: []
  };
  window.__MF_SHADER_PROBE__ = M;
  window.__MF_MARK_LIVE__ = () => { M.liveMarkAt = performance.now(); };

  const proto = (typeof WebGL2RenderingContext !== 'undefined') && WebGL2RenderingContext.prototype;
  if (!proto) return;

  const origCompile = proto.compileShader;
  proto.compileShader = function (sh) {
    const t = performance.now();
    const r = origCompile.call(this, sh);
    M.compileMs += performance.now() - t;
    M.shaders++;
    return r;
  };

  const origLink = proto.linkProgram;
  proto.linkProgram = function (p) {
    const t = performance.now();
    const r = origLink.call(this, p);
    const dt = performance.now() - t;
    M.linkMs += dt;
    M.programs++;
    const now = performance.now();
    if (M.firstProgramAt === null) M.firstProgramAt = now;
    M.lastProgramAt = now;
    if (M.liveMarkAt !== null) M.programsAfterLiveMark++;
    /* Identify late programs without touching engine source: the call stack at
       linkProgram() names the creator (initGL3D, volFxInit, shieldFxBoot, ...). */
    let origin = '';
    try {
      origin = (new Error().stack || '').split(String.fromCharCode(10)).slice(1, 6)
        .map(l => (l.match(/at ([\w$.]+)/) || [])[1]).filter(Boolean).join(' <- ');
    } catch {}
    M.perProgram.push({ linkMs: +dt.toFixed(2), at: +now.toFixed(0), afterLive: M.liveMarkAt !== null, origin });
    if (M.parallelExt === null) {
      try { M.parallelExt = !!this.getExtension('KHR_parallel_shader_compile'); } catch { M.parallelExt = false; }
    }
    return r;
  };

  const origShaderParam = proto.getShaderParameter;
  proto.getShaderParameter = function (sh, pname) {
    if (pname !== COMPILE_STATUS) return origShaderParam.call(this, sh, pname);
    const t = performance.now();
    const r = origShaderParam.call(this, sh, pname);
    M.compileStatusMs += performance.now() - t;
    M.compileStatusCalls++;
    return r;
  };

  const origProgParam = proto.getProgramParameter;
  proto.getProgramParameter = function (p, pname) {
    if (pname !== LINK_STATUS) return origProgParam.call(this, p, pname);
    const t = performance.now();
    const r = origProgParam.call(this, p, pname);
    M.linkStatusMs += performance.now() - t;
    M.linkStatusCalls++;
    return r;
  };
}

const ms = v => `${v.toFixed(1)} ms`;
let failures = 0;
const note = (label, value) => console.log(`  ${label.padEnd(42)} ${value}`);

const server = await startStaticServer();
const browser = await launchPwBrowser({ headless: true });
let metrics = null;
try {
  const page = await browser.newPage({
    viewport: { width: S25_VIEWPORT.width, height: S25_VIEWPORT.height },
    deviceScaleFactor: S25_VIEWPORT.dpr,
    hasTouch: true,
    isMobile: true,
    userAgent: ANDROID_S25_USER_AGENT
  });
  await page.addInitScript(instrument);
  await installTelemetryInit(page);
  await page.goto(`${server.url}?mfperf=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const gpu = await assertHardwareGpu(page);
  // Let the engine finish booting before driving the menu, or the war-table
  // buttons are still animating in and never satisfy Playwright's stability check.
  await page.waitForFunction(
    () => typeof spawnUnit === 'function' && typeof resetWorld === 'function',
    null, { timeout: 90000 });
  const mobileProof = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    mobileGpu: typeof MF_MOBILE_GPU === 'boolean' ? MF_MOBILE_GPU : null
  }));
  assertMobileGpuBranch(mobileProof.mobileGpu, mobileProof.userAgent, 'probe-shader-compile');

  const proof = await enterRealBattle(page);
  const entryState = proof.matchLive ? true : 'renderer-live-not-match';
  // Everything linked from here on is a first-use hitch, not boot cost.
  /* Warm-up proof: volfx normally compiles its two programs on the FIRST
     detonation. If warming ran, they are linked before combat starts. */
  const warm = await page.evaluate(() => ({ volProg: typeof volProg !== 'undefined' && !!volProg, volInitFailed: typeof volInitFailed !== 'undefined' ? volInitFailed : '<undef>', volFxEnabled: typeof volFxEnabled === 'function' ? volFxEnabled() : '<undef>', warmDone: typeof mfWarmDone !== 'undefined' ? mfWarmDone : '<undef>', gpfxProgU: typeof gpfxProgU !== 'undefined' && !!gpfxProgU })).catch(e => ({ error: e.message }));
  await page.evaluate(() => window.__MF_MARK_LIVE__ && window.__MF_MARK_LIVE__());
  await page.waitForTimeout(6000);

  metrics = await page.evaluate(() => window.__MF_SHADER_PROBE__);

  console.log(`\nGPU: ${gpu.renderer}\n`);
  console.log('SHADER COMPILE / LINK COST (real match, hardware GPU)');
  note('programs linked', metrics.programs);
  note('shaders compiled', metrics.shaders);
  note('compileShader total', ms(metrics.compileMs));
  note('linkProgram total', ms(metrics.linkMs));
  note('COMPILE_STATUS query (blocking)', `${ms(metrics.compileStatusMs)}  x${metrics.compileStatusCalls}`);
  note('LINK_STATUS query (blocking)', `${ms(metrics.linkStatusMs)}  x${metrics.linkStatusCalls}`);
  const blocking = metrics.compileStatusMs + metrics.linkStatusMs;
  const total = metrics.compileMs + metrics.linkMs + blocking;
  note('TOTAL shader setup', ms(total));
  note('  of which blocking status queries', `${ms(blocking)}  (${total > 0 ? (100 * blocking / total).toFixed(0) : 0}%)`);
  note('KHR_parallel_shader_compile', metrics.parallelExt ? 'SUPPORTED' : 'not available');
  if (metrics.firstProgramAt !== null)
    note('link window (first -> last program)', ms(metrics.lastProgramAt - metrics.firstProgramAt));

  console.log(`\nWARM-UP: ${JSON.stringify(warm)}`);
  console.log('\nFINDINGS');
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? 'PASS' : 'WARN'} ${name}${detail ? `  [${detail}]` : ''}`);
    if (!ok) failures++;
  };
  // A zero here means the probe never reached the code, not that the cost is free.
  check('probe observed real programs', metrics.programs > 0,
    metrics.programs > 0 ? `${metrics.programs} programs` : 'ZERO programs — probe did not reach initGL3D');
  const late = (metrics.perProgram || []).filter(e => e.afterLive);
  if (late.length) {
    console.log('\n  programs linked DURING the live match (frame hitches):');
    for (const e of late) console.log(`    +${e.at} ms  link ${e.linkMs} ms   ${e.origin || '<no stack>'}`);
  }
  check('no programs linked after match went live', metrics.programsAfterLiveMark === 0,
    `${metrics.programsAfterLiveMark} linked in-match — first-use frame hitch, a warm-up pass removes these`);
  /* Blocking is always ~100% of "shader setup" because compileShader/linkProgram
     themselves are async and near-free; the share is not the useful signal. The
     useful signal is the absolute main-thread stall. Pre-fix this was ~1550 ms
     with inline status queries; deferred batch validation brought it to ~440 ms.
     The warm-up then deliberately moves gpufx's two programs (which still use
     their own inline LINK_STATUS query, not the deferred path) out of the first
     muzzle flash and into load, adding ~240 ms here to remove an in-battle
     hitch. Budget guards against a regression back to serialised querying.
     Converting gpufx to the deferred path would recover that ~240 ms. */
  const BUDGET_MS = 900;
  check(`main-thread shader stall within ${BUDGET_MS} ms budget`, blocking < BUDGET_MS,
    `${ms(blocking)} blocking (was ~1550 ms with inline status queries)`);
} finally {
  await Promise.race([closePwBrowser(), new Promise(r => setTimeout(r, 5000))]);
  await server.close();
}

if (metrics && metrics.programs === 0) process.exitCode = 1;
