#!/usr/bin/env node
/* SCREENSHOT EVERY ROOM, PLUS THE SOCKET CARDS AND THE NEW PANELS.
 *
 * The room work is easy to describe and hard to believe without seeing it, so
 * this mounts the real uga_command.js against a fitted career and captures each
 * district exactly as it renders: the four rooms that had no work panel, the
 * sockets that now print what a module does, and the Navigation Bridge.
 *
 * Usage: node tools/capture-uga-rooms.mjs [--out tmp/uga-shots]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outDir = join(root, (argv.indexOf('--out') >= 0 && argv[argv.indexOf('--out') + 1]) || join('tmp', 'uga-shots'));
await mkdir(outDir, { recursive: true });
const moduleRoot = join(root, 'modules', 'space_exploration');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2'
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const file = resolve(moduleRoot, pathname.replace(/^\/+/, ''));
    assert.ok(file.startsWith(moduleRoot), 'path escape');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    if (!response.headersSent) response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('nf');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const origin = `http://127.0.0.1:${server.address().port}`;

const shots = [];
/* pw-browser, not a plain chromium.launch: MASSFRONT needs WebGL2 on a real
   GPU, and a software context paints "HARDWARE GPU REQUIRED" across the room
   viewport — which is half of every capture. */
const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

  const districts = await page.evaluate(async origin => {
    const ui = await import(origin + '/src/ui/uga_command.js');
    const cat = await import(origin + '/src/domain/catalog.js');
    /* The mount is a bare page; give it the shell's ground so the captures do
       not read as light-mode fragments. */
    document.body.style.margin = '0';
    document.body.style.background = '#05080e';

    /* ENTER THE UGA SCENE THE WAY setScene DOES.
       Without this the module's own FUEL / PROBES / RESEARCH / CREDITS topbar
       stays on screen underneath the mounted panel, and the capture shows TWO
       resource rails stacked with different numbers in each. That is the
       harness, not the game: space_module.css hides .exploration-topbar
       outright at [data-scene="uga"]. Setting the same attribute the real
       setScene() sets makes these captures show what a player sees. */
    const experience = document.querySelector('.space-experience');
    if (experience) experience.dataset.scene = 'uga';
    document.getElementById('ugaMode')?.classList.add('active');

    const host = document.createElement('div');
    host.id = 'shotHost';
    document.body.appendChild(host);

    /* A fitted career: level 3 everywhere, one module in every socket, both
       upgrade facilities chosen — so the captures show what an upgraded ship
       actually looks like rather than an empty hull. */
    const construction = await import(origin + '/src/domain/construction_catalog.js');
    const districtsState = {};
    for (const [id, definition] of Object.entries(cat.DISTRICT_CATALOG)) {
      const modules = {};
      for (const socket of definition.sockets || []) {
        const moduleId = socket.compatibleModuleIds?.[0];
        if (moduleId) modules[socket.id] = moduleId;
      }
      const facilities = {};
      for (const tier of [2, 3]) {
        const choice = Object.values(construction.CONSTRUCTION_FACILITY_CATALOG)
          .find(f => f.districtId === id && f.tier === tier);
        if (choice) facilities[`tier${tier}`] = choice.id;
      }
      districtsState[id] = { level: 3, tier: 3, commissioned: true, modules, facilities, staff: [] };
    }
    const state = {
      schemaVersion: 7, revision: 1,
      resources: { credits: 48000, alloys: 4200, components: 4200, researchPoints: 3600, fuel: 164, probes: 38, bioSamples: 26 },
      ship: { districts: districtsState },
      world: { systems: { aelos: { discovered: true, soloFront: { pressure: 18 }, infestation: {} },
        veyra: { discovered: true, soloFront: { pressure: 30 }, infestation: {} } } },
      route: { systemId: 'aelos' },
      intelligence: { bySystem: {} },
      personnel: { commanders: { nova_lead: { id: 'nova_lead', name: 'Commander Vale', factionId: 'nova', status: 'ready', level: 4, experience: 520, readiness: 96, loyalty: 80 } }, specialists: {} },
      factions: { nova: { resident: true, status: 'ready' }, dominion: {}, syndicate: {} },
      research: {}, discoveries: { foundIds: [] }, inventory: {},
      operations: { history: [{ result: { outcome: 'victory', missionId: 'heliograph_wake' } }] },
      commissioning: { completed: true }
    };
    window.__api = ui.createUgaCommand({
      container: host, visible: true, onHostRoute: () => {}, onExit: () => {},
      getState: () => state, getCatalog: () => cat
    });
    return Object.keys(cat.DISTRICT_CATALOG);
  }, origin);

  /* The inspector opens as a peeking sheet. Expand it so a capture shows the
     room's work rather than the top inch of it. */
  const expandSheet = () => page.evaluate(() => {
    const toggle = document.querySelector('[data-action="toggle-sheet"], .uga-sheet-toggle, .uga-inspector-toggle');
    if (toggle) toggle.click();
    document.body.classList.add('uga-sheet-expanded');
    for (const sheet of document.querySelectorAll('.uga-management-sheet, .uga-inspector, .uga-context-sheet, .uga-context-panel')) {
      sheet.style.height = '80vh';
      sheet.style.maxHeight = '80vh';
    }
  }).catch(() => {});

  const label = id => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  for (const id of districts) {
    await page.evaluate(district => {
      /* Re-applied per capture, not once at mount: the module's own boot is
         still settling when the mount runs and writes data-scene back to its
         own value, which is what put the module resource topbar back behind
         the panel after the first attempt to hide it. */
      const experience = document.querySelector('.space-experience');
      if (experience) experience.dataset.scene = 'uga';
      window.__api.selectDistrict(district);
      const scroll = document.querySelector('.uga-context-scroll');
      if (scroll) scroll.scrollTop = 0;
    }, id);
    await page.waitForTimeout(350);
    const file = join(outDir, `room-${id}.png`);
    await page.screenshot({ path: file, timeout: 20000 });
    const measured = await page.evaluate(() => {
      const scroll = document.querySelector('.uga-context-scroll');
      /* Guard the capture against the exact mistake this harness made once:
         if the module's own resource topbar is still visible behind the UGA
         panel, the screenshot shows two resource rails and is not evidence of
         anything a player sees. */
      const moduleBar = document.querySelector('.exploration-topbar');
      const moduleBarVisible = Boolean(moduleBar)
        && getComputedStyle(moduleBar).display !== 'none'
        && moduleBar.getBoundingClientRect().height > 4;
      return {
        hasWork: (scroll?.innerHTML || '').includes('COMPARTMENT HARDWARE'),
        socketEffects: document.querySelectorAll('.uga-socket-effects').length,
        moduleBarVisible,
        heading: scroll?.querySelector('.uga-context-heading h2')?.textContent?.trim() || ''
      };
    });
    /* A second frame scrolled to the room's own work panel — the part that was
       missing entirely in four of these rooms. */
    await expandSheet();
    /* The work body sits at the TOP of the scroll, above the COMPARTMENT
       HARDWARE divider — scrolling to the first .uga-section-title lands on
       that divider instead, which is the generic chrome every room already
       had. Go to the top with the sheet expanded. */
    await page.evaluate(() => {
      const scroll = document.querySelector('.uga-context-scroll');
      if (scroll) scroll.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    const workFile = join(outDir, `work-${id}.png`);
    await page.screenshot({ path: workFile, timeout: 20000 });
    if (measured.moduleBarVisible) {
      throw new Error(`the module's own resource topbar is visible behind the ${id} panel — `
        + 'the capture would show two resource rails, which is the harness, not the game');
    }
    shots.push({ id, file, workFile, ...measured });
    console.log(`${(measured.heading || label(id)).padEnd(26)} work=${measured.hasWork ? 'yes' : 'NO '}  socket-effect cards=${measured.socketEffects}  -> ${file.replace(root, '.')}`);
  }

  /* A close-up of the sockets, which is where module effects now print. */
  await page.evaluate(() => {
    window.__api.selectDistrict('survey');
    const sockets = [...document.querySelectorAll('.uga-panel-section')]
      .find(section => section.textContent.includes('INTERNAL MODULE SOCKETS'));
    sockets?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
  const socketShot = join(outDir, 'detail-module-sockets.png');
  await page.screenshot({ path: socketShot, timeout: 20000 });
  shots.push({ id: 'detail-module-sockets', file: socketShot });
  console.log(`module socket detail            -> ${socketShot.replace(root, '.')}`);

  if (errors.length) console.log('\npage errors: ' + [...new Set(errors)].slice(0, 3).join(' | '));
  await writeFile(join(outDir, 'index.json'), JSON.stringify(shots, null, 2));
  await page.close();
} finally {
  try { await closePwBrowser(browser); } catch {}
  server.close();
}
console.log(`\n${shots.length} captures -> ${outDir.replace(root, '.')}`);
