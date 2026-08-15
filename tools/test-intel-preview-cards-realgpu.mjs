/* The other half of the context-leak proof: the preview cards must still LOOK
   right in the places players actually meet them — the unit info card, the
   building info card, and the menu's rotating LIVE 3D window — now that they
   are 2D surfaces fed by one shared WebGL2 context. Real GPU only. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, 'audit', 'intel-context-leak');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(8994, '127.0.0.1', r));
await mkdir(outDir, { recursive: true });

const browser = await launchPwBrowser({
  headless: false, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});
const fail = [];
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
  await page.addInitScript(() => { try { localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1'); localStorage.setItem('mf_offline','1'); } catch {} });
  page.on('pageerror', e => fail.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:8994/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2'); if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    const r = String(d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
    const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
    return r;
  });
  console.log('UNMASKED_RENDERER_WEBGL: ' + renderer);
  if (/swiftshader|software|llvmpipe/i.test(renderer)) throw new Error('REFUSING: software renderer');

  await page.waitForFunction(() => typeof showUnitTypeCard === 'function' && typeof UNIT_GEO !== 'undefined' && !!UNIT_GEO[1], { timeout: 90000 });
  await page.waitForTimeout(1500);

  // the menu's own rotating LIVE 3D window, in situ
  await page.waitForFunction(() => document.querySelector('#menuIntelModel canvas')?._mfIntel3D?.parts?.length > 0, null, { timeout: 30000 });
  const menuBox = await page.locator('#menuIntelModel').boundingBox();
  if (menuBox) await page.screenshot({ path: join(outDir, 'cards-menu-live3d.png'), clip: menuBox });
  console.log('menu LIVE 3D window: parts present, shot saved');

  const shotCard = async (name) => {
    await page.waitForFunction(() => document.querySelector('#unitCard canvas')?._mfIntel3D?.parts?.length > 0, null, { timeout: 20000 });
    /* The card is display:none until the in-match flow shows it, and a hidden
       card has no offsetParent so the pump never draws it. Show it for real. */
    const box = await page.evaluate(() => {
      const el = document.getElementById('unitCard');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('z-index', '9000', 'important');
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width), height: Math.round(r.height),
        css: getComputedStyle(el).display, parentCss: getComputedStyle(el.parentElement).display };
    });
    console.log('  #unitCard box:', JSON.stringify(box));
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(outDir, name), clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    return page.evaluate(() => {
      const c = document.querySelector('#unitCard canvas'), V = c._mfIntel3D;
      // the card canvas holds real pixels, not an empty surface
      const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
      const x = g.getContext('2d'); x.drawImage(c, 0, 0);
      const d = x.getImageData(0, 0, g.width, g.height).data;
      let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 24) lit++;
      return { kind: V.kind, id: V.id, parts: V.parts.length, w: c.width, h: c.height,
        opaqueFrac: +(lit / (g.width * g.height)).toFixed(3), is2D: !!c.getContext('2d') };
    });
  };

  await page.evaluate(() => { document.body.classList.add('mfIntroDone'); showUnitTypeCard(1, true, 'nova'); });
  const unit = await shotCard('cards-unitcard-unit.png');
  console.log('unit info card:', JSON.stringify(unit));
  if (!(unit.parts > 0 && unit.opaqueFrac > 0.02)) fail.push('unit info card preview is blank: ' + JSON.stringify(unit));

  await page.evaluate(() => { showBuildingTypeCard('turret', -1, true, 'nova'); });
  await page.waitForFunction(() => document.querySelector('#unitCard canvas')?._mfIntel3D?.kind === 'building', null, { timeout: 20000 });
  const bld = await shotCard('cards-unitcard-building.png');
  console.log('building info card:', JSON.stringify(bld));
  if (!(bld.parts > 0 && bld.opaqueFrac > 0.02)) fail.push('building info card preview is blank: ' + JSON.stringify(bld));

  const ctxCount = await page.evaluate(() => {
    let n = 0; for (const c of document.querySelectorAll('canvas')) { try { if (c.getContext('webgl2')) n++; } catch {} } return n;
  });
  console.log('canvases in the DOM still holding a webgl2 context:', ctxCount);
} catch (e) {
  fail.push('HARNESS: ' + (e && e.stack || e));
} finally {
  await browser.close(); server.close();
}
if (fail.length) { console.log('FAIL:\n  ' + fail.join('\n  ')); process.exitCode = 1; }
else console.log('PASS — intel preview cards render in situ on a real GPU');
