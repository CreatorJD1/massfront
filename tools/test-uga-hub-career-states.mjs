/* THE STRATEGIC HOME MUST RENDER FOR EVERY CAREER, NOT JUST A NEW ONE.
 *
 * A fresh profile stops at the commission step, so every probe that starts a new
 * career exercises exactly one branch of commandObjective() and never reaches
 * groundControlSummary(), the deploy branch, or the survey branch. A player with
 * a real career reaches those on their first frame - and if any of them throws,
 * renderContext() never returns, the panel's innerHTML is never assigned, and on
 * a first render that leaves a completely empty panel with no error visible to
 * the player.
 *
 * This mounts the real uga_command.js against synthetic states covering each
 * branch and asserts the hub produced content. It is deliberately a unit-level
 * mount rather than a driven game: driving the game can only ever test the
 * career the harness happens to have.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { chromium } = createRequire(pathToFileURL(join(root, 'package.json')).href)('playwright');
const moduleRoot = join(root, 'modules', 'space_exploration');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const file = resolve(moduleRoot, pathname.replace(/^\/+/, ''));
    assert.ok(file.startsWith(moduleRoot), 'path escape');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('nf');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const origin = `http://127.0.0.1:${server.address().port}`;

/* Careers that must all render. `commissioning.completed` is the switch that
   moves commandObjective() off its first branch. */
const CAREERS = {
  'fresh-commission': { commissioning: { completed: false } },
  'commissioned-no-history': { commissioning: { completed: true }, operations: { history: [] } },
  'commissioned-with-victories': {
    commissioning: { completed: true },
    operations: { history: [
      { result: { outcome: 'victory', missionId: 'heliograph_wake' } },
      { result: { outcome: 'defeat', missionId: 'caldris_claim' } },
      { operation: { missionId: 'black_manifest' }, result: { outcome: 'victory' } }
    ] }
  },
  /* Shapes a real save can legitimately hold and a naive reader can trip on. */
  'history-not-an-array': { commissioning: { completed: true }, operations: { history: { '0': { result: { outcome: 'victory' } } } } },
  'missing-operations': { commissioning: { completed: true } },
  'null-result-entries': { commissioning: { completed: true }, operations: { history: [null, { result: null }, {}] } }
};

const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

  for (const [name, career] of Object.entries(CAREERS)) {
    pageErrors.length = 0;
    const result = await page.evaluate(async ({ origin, career }) => {
      const mod = await import(origin + '/src/ui/uga_command.js');
      const host = document.createElement('div');
      document.body.appendChild(host);
      const baseState = {
        revision: 1,
        resources: { credits: 7700, alloys: 360, components: 365, researchPoints: 240, fuel: 78, probes: 12, bioSamples: 0 },
        ship: { districts: {} },
        world: { systems: { aelos: { discovered: true, soloFront: { pressure: 18 }, infestation: {} } } },
        route: { systemId: 'aelos' },
        intelligence: { bySystem: {} },
        personnel: { commanders: {}, specialists: {} },
        factions: {},
        research: {},
        discoveries: { foundIds: [] },
        inventory: {},
        ...career
      };
      try {
        const api = mod.createUgaCommand({
          container: host,
          visible: true,
          getState: () => baseState,
          getCatalog: () => ({ missions: [
            { id: 'heliograph_wake', name: 'Heliograph Wake' },
            { id: 'caldris_claim', name: 'Caldris Claim' },
            { id: 'black_manifest', name: 'Black Manifest' }
          ] })
        });
        api.openView('campaign_hub');
        const hub = host.querySelector('.uga-campaign-hub');
        const scroll = host.querySelector('.uga-context-scroll');
        return {
          ok: true,
          hub: Boolean(hub),
          length: scroll ? scroll.innerHTML.length : -1,
          text: scroll ? scroll.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) : null
        };
      } catch (error) {
        return { ok: false, error: String(error && error.message || error), stack: String(error && error.stack || '').split('\n').slice(1, 3).join(' | ') };
      }
    }, { origin, career });

    if (!result.ok) {
      failures.push(`${name}: THREW ${result.error} @ ${result.stack}`);
      continue;
    }
    if (!result.hub || result.length < 400) {
      failures.push(`${name}: hub rendered empty (len ${result.length}) - this is the blank Play panel`);
      continue;
    }
    if (pageErrors.length) failures.push(`${name}: page errors ${pageErrors.slice(0, 2).join(' | ')}`);
    console.log(`  OK   ${name.padEnd(28)} ${result.length} chars  "${result.text}"`);
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  for (const f of failures) console.error('  FAIL ' + f);
  throw new Error(`UGA hub career states: ${failures.length} failing state(s)`);
}
console.log('UGA hub career states: PASS');
