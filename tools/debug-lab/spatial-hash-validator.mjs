/* tools/debug-lab/spatial-hash-validator.mjs
   ============================================================================
   MASSFRONT SPATIAL HASH VALIDATOR (READ-ONLY)
   ----------------------------------------------------------------------------
   Analyzes spatial binning distribution (GW, CS=44), linked list bucket
   depths (gHead / gNext), and identifies collision hot-spots at scale
   (1000–5000 units).
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
  console.log('--- MASSFRONT Spatial Hash & Bucket Depth Validator ---');
  const server = await startServer();
  const browser = await launchPwBrowser({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
    const networkIsolation = await installTelemetryInit(page);
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await assertHardwareGpu(page);
    await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof resetWorld === 'function', null, { timeout: 30000 });
    const deployment = await enterRealBattle(page);

    const report = await page.evaluate(() => {
      if (!window.__mfPerfRealDeployment?.deployedViaUi) throw new Error('Real UI deployment proof is missing');
      if (typeof resetWorld === 'function') resetWorld();
      if (typeof matchLive !== 'undefined') matchLive = true;
      if (typeof running !== 'undefined') running = true;
      if (typeof paused !== 'undefined') paused = false;
      if (typeof showHudDock === 'function') showHudDock(true);

      // Spawn 1,000 units for test
      const spawned = [];
      for (let k = 0; k < 1000; k++) {
        const x = 1200 + (k % 30) * 25 + Math.sin(k) * 10;
        const y = 1200 + Math.floor(k / 30) * 25 + Math.cos(k) * 10;
        const idx = spawnUnit(1, 0, x, y, -1);
        if (idx >= 0) spawned.push(idx);
      }

      if (typeof rebuildGrid === 'function') rebuildGrid();

      // Analyze gHead / gNext chains
      let totalCells = GW * GW;
      let occupiedCells = 0;
      let maxChainDepth = 0;
      let totalChainSteps = 0;
      const chainHistogram = {};

      for (let c = 0; c < totalCells; c++) {
        let head = gHead[c];
        if (head >= 0) {
          occupiedCells++;
          let depth = 0;
          let curr = head;
          while (curr >= 0) {
            depth++;
            totalChainSteps++;
            curr = gNext[curr];
            if (depth > 2000) break; // safety guard against circular loops
          }
          if (depth > maxChainDepth) maxChainDepth = depth;
          chainHistogram[depth] = (chainHistogram[depth] || 0) + 1;
        }
      }

      const avgDepth = occupiedCells > 0 ? (totalChainSteps / occupiedCells) : 0;

      return {
        executionPath: 'synthetic-load-in-real-match',
        unitsAttempted: 1000,
        gridConstants: { CS, GW, totalCells },
        unitsSpawned: spawned.length,
        occupiedCells,
        occupancyRatio: occupiedCells / totalCells,
        maxChainDepth,
        avgChainDepthInOccupied: Math.round(avgDepth * 100) / 100,
        chainHistogram
      };
    });
    await networkIsolation.finalize('spatial hash validator');

    console.log(JSON.stringify(report, null, 2));
    console.log('Deployment proof:', JSON.stringify(deployment));
    if (report.unitsSpawned !== report.unitsAttempted) {
      throw new Error(`Population mismatch: attempted ${report.unitsAttempted}, accepted ${report.unitsSpawned}`);
    }
  } finally {
    await closePwBrowser().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(err => { console.error(err); process.exit(1); });
