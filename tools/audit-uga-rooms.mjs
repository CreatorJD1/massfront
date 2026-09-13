/* WHAT IS THERE TO DO IN EACH ROOM?
 *
 * Every district on NEXUS-VII renders the same compartment chrome — heading,
 * tier badge, capability progression, specialist stations, visual upgrades,
 * module sockets — whether or not it has any actual job attached. That chrome
 * is generous enough that an empty room does not look empty: it looks like a
 * room whose work you have not unlocked yet.
 *
 * districtPanel() only emits the "COMPARTMENT HARDWARE" divider when
 * roomWorkBody() returned something, so that divider is an exact detector for
 * "this room has work". This mounts the real uga_command.js, walks every
 * district, and reports what each one offers a player who walks into it.
 *
 * Usage: node tools/audit-uga-rooms.mjs [--json]
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
const jsonOnly = process.argv.includes('--json');

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
  '.ktx2': 'image/ktx2', '.svg': 'image/svg+xml'
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
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('nf');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const origin = `http://127.0.0.1:${server.address().port}`;

/* A commissioned career with room to act: resources to spend, a resident
   faction, a commander, and a discovered system. An under-resourced state
   would make every room look empty for the wrong reason. */
const CAREER = {
  /* Domain commands validate the whole state before they will quote a cost, so
     an audit state missing schemaVersion makes every gated control look broken
     for a reason that is the harness, not the room. */
  schemaVersion: 7,
  revision: 1,
  resources: { credits: 24000, alloys: 2400, components: 2400, researchPoints: 3200, fuel: 180, probes: 40, bioSamples: 24 },
  ship: { districts: {} },
  world: { systems: { aelos: { discovered: true, soloFront: { pressure: 18 }, infestation: {} } } },
  route: { systemId: 'aelos', scene: 'uga' },
  intelligence: { bySystem: {} },
  personnel: { commanders: { nova_lead: { id: 'nova_lead', name: 'Commander Vale', factionId: 'nova', status: 'ready' } }, specialists: {} },
  factions: { nova: { resident: true, status: 'ready' }, dominion: {}, syndicate: {} },
  research: {},
  discoveries: { foundIds: [] },
  inventory: {},
  operations: { history: [{ result: { outcome: 'victory', missionId: 'heliograph_wake' } }] },
  commissioning: { completed: true }
};

/* Every district the shell defines. The rail is DECK-FILTERED — it shows one
   of three decks at a time — so walking only the rendered buttons audits a
   third of the ship and calls it complete. Read the ids from the source table
   instead, so a room cannot be missed by sitting on another deck. */
const DISTRICT_IDS = await (async () => {
  const source = await readFile(join(moduleRoot, 'src', 'ui', 'uga_command.js'), 'utf8');
  const from = source.indexOf('const DISTRICT_DEFAULTS = Object.freeze({');
  const to = source.indexOf('\n});', from);
  assert.ok(from >= 0 && to > from, 'could not read DISTRICT_DEFAULTS');
  const ids = [...source.slice(from, to).matchAll(/^ {2}([a-z_]+): \{/gm)].map(m => m[1]);
  assert.ok(ids.length >= 8, `expected the full district table, found ${ids.length}`);
  return ids;
})();

const report = { rooms: [], errors: [] };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

  const rooms = await page.evaluate(async ({ origin, career, ids }) => {
    const mod = await import(origin + '/src/ui/uga_command.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const api = mod.createUgaCommand({
      container: host,
      visible: true,
      /* Supplied because hostRoutesAvailable() gates every base-game route on
         its presence. Without it the harness disables controls the real shell
         enables, and a working room reports as a broken one. */
      onHostRoute: () => {},
      onExit: () => {},
      getState: () => career,
      getCatalog: () => ({
        missions: [{ id: 'heliograph_wake', name: 'Heliograph Wake', systemId: 'aelos' }],
        factions: [
          { id: 'nova', name: 'Terran Frontline Command' },
          { id: 'dominion', name: 'Crimson Dominion' },
          { id: 'syndicate', name: 'Syndicate Coalition' }
        ]
      })
    });

    const railIds = new Set([...host.querySelectorAll('[data-district]')].map(el => el.dataset.district));
    const out = [];
    for (const id of ids) {
      let error = null;
      try { api.selectDistrict(id); } catch (e) { error = String(e && e.message || e); }
      const scroll = host.querySelector('.uga-context-scroll');
      const html = scroll ? scroll.innerHTML : '';
      const text = scroll ? scroll.textContent.replace(/\s+/g, ' ').trim() : '';
      /* districtPanel emits this divider ONLY when roomWorkBody returned
         content, so it is an exact "this room has a job" detector. */
      const hardwareAt = html.indexOf('COMPARTMENT HARDWARE');
      const hasWork = hardwareAt >= 0;
      const workHtml = hasWork ? html.slice(0, hardwareAt) : '';
      const workNode = document.createElement('div');
      workNode.innerHTML = workHtml;
      const headingChrome = workNode.querySelectorAll('.uga-context-heading').length;
      const controls = [...workNode.querySelectorAll('button,input,select,textarea,[data-action],[data-residency],[data-mission]')]
        .filter(el => !el.closest('.uga-context-heading'));
      const enabled = controls.filter(el => !el.disabled).length;
      /* A disabled control is not automatically a defect — it can be a real
         gate the player has not met. Capture the reason the panel gives, so a
         missing feature is told apart from a working requirement, and so a
         thin synthetic career cannot be mistaken for a broken room. */
      const blocked = controls.filter(el => el.disabled).map(el => {
        const card = el.closest('article,section,.uga-record-card,.uga-research-card') || el.parentElement;
        const reason = card?.querySelector('.uga-research-requirement,.uga-requirement,small,em')?.textContent
          || card?.textContent || '';
        return reason.replace(/\s+/g, ' ').trim().slice(0, 90);
      }).filter(Boolean);
      const heading = scroll?.querySelector('.uga-context-heading h2')?.textContent?.trim() || id;
      out.push({
        id, name: heading, error,
        rendered: Boolean(scroll),
        hasWork,
        workChars: workNode.textContent.replace(/\s+/g, ' ').trim().length,
        workControls: controls.length,
        workControlsEnabled: enabled,
        chromeOnlyHeading: headingChrome,
        totalChars: text.length,
        onOpeningDeck: railIds.has(id),
        blockedReasons: [...new Set(blocked)].slice(0, 3),
        commissionCard: html.includes('uga-commission-card')
      });
    }
    try { api.destroy(); } catch {}
    return out;
  }, { origin, career: CAREER, ids: DISTRICT_IDS });

  report.rooms = rooms;
  await page.close();
} finally {
  await browser.close().catch(() => {});
  server.close();
}

if (jsonOnly) { console.log(JSON.stringify(report, null, 2)); process.exit(report.rooms.some(r => !r.hasWork) ? 1 : 0); }

console.log('');
console.log('  ROOM                      WORK   CHARS  CONTROLS  TOTAL   NOTE');
let missing = 0;
for (const room of report.rooms) {
  if (!room.hasWork) missing++;
  const note = room.error ? 'THREW: ' + room.error.slice(0, 40)
    : !room.rendered ? 'did not render'
    : !room.hasWork ? 'no work panel — compartment chrome only'
    : room.workControls === 0 ? 'read-only panel — informative, nothing to act on'
    /* A domain command refusing to quote against a SYNTHETIC state is the
       harness, not the room. Say so instead of reporting a working room as
       broken — this audit twice produced that false positive before the state
       was filled in, and a synthetic save can never be complete enough to
       settle it. Judge these from a real career. */
    : room.workControlsEnabled === 0 && /Campaign sta|Expected sch|schema|ledger/i.test(room.blockedReasons.join(' '))
      ? 'controls gated by a domain check this synthetic career cannot satisfy — verify from a real save'
    : room.workControlsEnabled === 0 ? 'every control gated: ' + (room.blockedReasons[0] || 'no reason shown')
    : '';
  console.log(`  ${room.name.padEnd(24)} ${(room.hasWork ? 'yes' : 'NO ').padEnd(6)} `
    + `${String(room.workChars).padStart(5)} ${String(room.workControlsEnabled + '/' + room.workControls).padStart(9)} `
    + `${String(room.totalChars).padStart(6)}   ${note}`);
}
console.log('');
console.log(`${report.rooms.length - missing} / ${report.rooms.length} rooms give the player something to do`);
if (report.errors.length) {
  console.log('');
  console.log('PAGE ERRORS');
  for (const e of [...new Set(report.errors)].slice(0, 6)) console.log('  ' + e.slice(0, 140));
}
process.exit(missing ? 1 : 0);
