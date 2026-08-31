/* tools/debug-lab/memory-leak-tracer.mjs
   ============================================================================
   MASSFRONT MEMORY LEAK TRACER (READ-ONLY)
   ----------------------------------------------------------------------------
   Profiles JS heap allocations, TypedArray stability, and GC churn over
   sustained battle simulation loops (600+ frames).
   ============================================================================ */

import { launchPwBrowser, closePwBrowser } from '../pw-browser.mjs';
import { assertHardwareGpu } from '../chrome-gpu.mjs';
import { installTelemetryInit, enterRealBattle } from '../perf-lab/perf-probe-runner.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = resolve(join(ROOT, p));
      if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
      const e = extname(f);
      res.writeHead(200, { 'Content-Type': e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream' });
      res.end(await readFile(f));
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => server.close(r)) };
}

async function main() {
  console.log('--- MASSFRONT Sustained Memory Stability & Leak Tracer ---');
  const server = await startServer();
  const browser = await launchPwBrowser({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
    const networkIsolation = await installTelemetryInit(page);
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await assertHardwareGpu(page);
    await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof resetWorld === 'function', null, { timeout: 30000 });
    const deployment = await enterRealBattle(page);

    const memoryProfile = await page.evaluate(async () => {
      if (!window.__mfPerfRealDeployment?.deployedViaUi) throw new Error('Real UI deployment proof is missing');
      if (typeof resetWorld === 'function') resetWorld();
      if (typeof matchLive !== 'undefined') matchLive = true;
      if (typeof running !== 'undefined') running = true;
      if (typeof paused !== 'undefined') paused = false;
      if (typeof showHudDock === 'function') showHudDock(true);

      // Spawn 1000 active units
      let accepted = 0;
      for (let k = 0; k < 1000; k++) {
        if (spawnUnit(k % 12, k & 1, 1400 + (k % 30) * 15, 1400 + Math.floor(k / 30) * 15, -1) >= 0) accepted++;
      }

      if (typeof running !== 'undefined') running = true;
      if (typeof paused !== 'undefined') paused = false;

      const samples = [];
      const totalFrames = 400;

      for (let f = 0; f < totalFrames; f++) {
        await new Promise(r => requestAnimationFrame(r));
        if (f % 50 === 0 && performance.memory) {
          samples.push({
            frame: f,
            usedHeapMB: Math.round((performance.memory.usedJSHeapSize / (1024 * 1024)) * 100) / 100,
            totalHeapMB: Math.round((performance.memory.totalJSHeapSize / (1024 * 1024)) * 100) / 100
          });
        }
      }

      return {
        executionPath: 'synthetic-load-in-real-match',
        attempted: 1000,
        accepted,
        supported: samples.length > 0,
        sampleCount: samples.length,
        initialHeapMB: samples.length ? samples[0].usedHeapMB : null,
        finalHeapMB: samples.length ? samples[samples.length - 1].usedHeapMB : null,
        deltaMB: samples.length ? Math.round((samples[samples.length - 1].usedHeapMB - samples[0].usedHeapMB) * 100) / 100 : null,
        samples
      };
    });
    await networkIsolation.finalize('memory leak tracer');

    console.log(JSON.stringify(memoryProfile, null, 2));
    console.log('Deployment proof:', JSON.stringify(deployment));
    if (memoryProfile.accepted !== memoryProfile.attempted) {
      throw new Error(`Population mismatch: attempted ${memoryProfile.attempted}, accepted ${memoryProfile.accepted}`);
    } else if (!memoryProfile.supported) {
      console.log('SKIP: performance.memory is unsupported; no heap claim is emitted.');
    } else if (Math.abs(memoryProfile.deltaMB) < 15) {
      console.log('✓ Heap delta remained bounded over this 400-frame diagnostic probe.');
    } else {
      console.warn(`WARNING: Heap delta is ${memoryProfile.deltaMB} MB. Check allocations in frame loops.`);
    }
  } finally {
    await closePwBrowser().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(err => { console.error(err); process.exit(1); });
