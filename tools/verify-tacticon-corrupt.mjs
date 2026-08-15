/* INDEPENDENT VERIFICATION — the CORRUPT half of the stated fallback
   requirement. capture-tacticons.mjs proves the 404 case only. This serves the
   sheet as (a) truncated garbage that cannot decode and (b) a VALID PNG of the
   WRONG SIZE, which decodes fine and therefore never reaches img.onerror.

   Local checkout, not www/: pack-www is a Capacitor staging step and may lag
   the source sheet. Node resolves playwright from this repo's node_modules.

     node tools/verify-tacticon-corrupt.mjs
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { encode } = require('./artv2/pnglib.cjs');

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const outDir = resolve(join(root, '.tmp', 'verify-tacticons'));
await mkdir(outDir, { recursive: true });

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.wasm':'application/wasm' };

const sheetPath = join(root, 'assets/textures/ui/tacticons-faction.png');
const realSheet = await readFile(sheetPath);
const index = JSON.parse(await readFile(join(root, 'assets/textures/ui/tacticon-faction-index.json'), 'utf8'));

/* Opaque-white 512² PNG. Size is the only property under test: if the engine
   skipped the geometry gate, the scan would report every cell present (alpha
   180 everywhere) and the UVs would sample empty texture → blank plates. */
const halfPath = join(outDir, 'halfsize-512.png');
{
  const px = Buffer.alloc(512 * 512 * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i+1] = 255; px[i+2] = 255; px[i+3] = 180; }
  encode(512, 512, px, halfPath);
}
const halfSheet = await readFile(halfPath);

/* mode: 'ok' | 'garbage' | 'halfsize' */
let mode = 'ok';
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (p.includes('tacticons-faction.png')) {
      if (mode === 'garbage') {
        /* Not a PNG at all. Taking the real file's first 64 bytes left a
           complete IHDR, so Chrome fired onload on a 1024² empty bitmap
           instead of onerror — that is the blank-scan path, not decode-fail. */
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(Buffer.from('not a png')); return;
      }
      if (mode === 'halfsize') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(halfSheet); return;
      }
    }
    const filePath = resolve(join(root, p.replace(/^\//, '')));
    if (!filePath.startsWith(resolve(root))) { res.writeHead(403); res.end(); return; }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not Found'); }
});
const PORT = 9021;
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await launchPwBrowser({
  headless: false,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu',
         '--disable-gpu-sandbox', '--disable-software-rasterizer']
});

const out = [];
let fails = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   ' + extra : ''));
  if (!cond) fails++;
};

try {
  /* 'ok' is the POSITIVE CONTROL. Without it a harness that simply fails to
     load anything would report every corrupt case as "degraded gracefully"
     while proving nothing. */
  for (const m of ['ok', 'garbage', 'halfsize']) {
    mode = m;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => {
      /* The harness strips every HUD node so the screenshot is the canvas.
         Resource labels still tick and hit null.textContent — that is not the
         icon path, and it fires on the positive control too. */
      if (/textContent/.test(e.message)) return;
      errs.push(e.message);
    });
    await page.addInitScript(() => { try {
      localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_offline','1'); } catch (e) {} });

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction(() => typeof render === 'function' && typeof heightF !== 'undefined'
      && !!heightF && typeof FX !== 'undefined' && !!FX.rock, null, { timeout: 90000 });
    await page.waitForTimeout(900);
    const gpu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2');
      const d = g && g.getExtension('WEBGL_debug_renderer_info');
      return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    if (/swiftshader|software|llvmpipe/i.test(gpu)) throw new Error('REFUSING: software renderer -> ' + gpu);

    const clip = await page.evaluate(() => {
      if (typeof apClose === 'function') apClose();
      window.checkVictory = () => {}; window.gameOver = () => {};
      matchLive = true; running = true; paused = false; demoMode = false; fogOn = false; victoryDone = true;
      document.body.className = 'mfIntroDone';
      document.querySelectorAll('body > *:not(canvas)').forEach(e => e.remove());
      window.toast = () => {}; window.mfNoticeShow = () => {}; window.mfNoticeSubmit = () => {};
      playerFaction = 'nova'; if (typeof AI !== 'undefined' && AI) AI.fac = 'legion';
      blds.length = 0; if (typeof rebuildBGrid === 'function') rebuildBGrid();
      for (let i = 0; i < unitHigh; i++) ualive[i] = 0;
      const cx = MAP * 0.5, cy = MAP * 0.5;
      const rank = ['wall','wall','turret','turret','aatower','mex','pgen','sgen','techlab','fac','airfield','hq'];
      const put = (team, ox, oy) => rank.forEach((ty, i) =>
        addBld(ty, team, cx + ox + (i % 6) * 90, cy + oy + Math.floor(i / 6) * 90, true, 0));
      put(0, -560, -220); put(1, 80, -220);
      for (let k = 0; k < 21; k++) {
        const t = [0,1,2,3,4,5,6][k % 7];
        spawnUnit(t, 0, cx - 560 + (k % 7) * 92, cy + 90 + Math.floor(k / 7) * 96);
        spawnUnit(t, 1, cx +  80 + (k % 7) * 92, cy + 90 + Math.floor(k / 7) * 96);
      }
      cam.x = cx - 30; cam.y = cy - 40; orthoSpan = distTarget = SPAN_MAX;
      clampCam(); camUpdateMatrices(); render();
      const pts = blds.map(b => w2s(b.x, b.y));
      for (let i = 0; i < unitHigh; i++) if (ualive[i]) pts.push(w2s(ux[i], uy[i]));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 46;
      return { x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - pad),
               width: Math.min(VW, Math.max(...xs) + pad) - Math.max(0, Math.min(...xs) - pad),
               height: Math.min(VH, Math.max(...ys) + pad) - Math.max(0, Math.min(...ys) - pad) };
    });
    /* mfIconFacLoad() only STARTS the fetch on the first icon frame. Wait for
       the gate to fire — loaded OR an explicit reject — so a slow decode cannot
       make a corrupt case look like a graceful degrade for the wrong reason. */
    await page.waitForFunction(() => {
      const f = MFTiers.fac();
      return f.tried && (f.loaded || !!f.reject);
    }, null, { timeout: 12000 });
    const st2 = await page.evaluate(() => { render(); render();
      return { fac: MFTiers.fac(), icons: MFTiers.last(), atlas: MFTiers.atlas() }; });
    await page.screenshot({ path: join(outDir, 'corrupt-' + m + '.png'), clip });
    out.push({ mode: m, gpu, loaded: st2.fac.loaded, scanned: st2.fac.scanned,
               reject: st2.fac.reject, authored: st2.fac.authored, icons: st2.icons,
               tex: st2.atlas.tex, errs: errs.slice(0, 4) });
    console.log(`[${m}] gpu=${gpu.slice(0,60)} loaded=${st2.fac.loaded} scanned=${st2.fac.scanned} ` +
                `reject=${st2.fac.reject} authoredCells=${st2.fac.authored} iconInstances=${st2.icons} ` +
                `tex=${st2.atlas.tex} pageErrs=${errs.length}`);

    ok(m + ': no pageerror', errs.length === 0, errs[0] || '');
    ok(m + ': icon instances still submitted', st2.icons > 0, 'icons=' + st2.icons);
    ok(m + ': atlas texture uploaded', !!st2.atlas.tex);
    if (m === 'ok') {
      ok('ok: faction sheet loaded', st2.fac.loaded === true);
      ok('ok: cells scanned', st2.fac.scanned === true);
      ok('ok: authored cells present', st2.fac.authored >= 60, 'authored=' + st2.fac.authored);
      ok('ok: no reject', st2.fac.reject == null, 'reject=' + st2.fac.reject);
      ok('ok: role order matches bake index',
         st2.fac.roles.join(',') === index.roleOrder.join(','));
      ok('ok: faction order matches bake index',
         st2.fac.order.join(',') === index.facOrder.join(','));
    } else if (m === 'garbage') {
      ok('garbage: sheet not loaded', st2.fac.loaded === false);
      ok('garbage: reject=decode', st2.fac.reject === 'decode', 'reject=' + st2.fac.reject);
      ok('garbage: zero authored cells', st2.fac.authored === 0);
    } else {
      ok('halfsize: sheet not loaded', st2.fac.loaded === false);
      ok('halfsize: reject=size', st2.fac.reject === 'size', 'reject=' + st2.fac.reject);
      ok('halfsize: zero authored cells', st2.fac.authored === 0);
    }
    await page.close();
  }
} catch (err) {
  console.error('FAILED: ' + (err && err.stack || err));
  fails++;
} finally {
  await browser.close(); server.close();
  await writeFile(join(outDir, 'corrupt-result.json'), JSON.stringify({ fails, out }, null, 1));
}
console.log('\nartifacts in ' + outDir);
if (fails) { console.log(fails + ' CHECK(S) FAILED'); process.exit(1); }
console.log('all corrupt-resilience checks passed');
