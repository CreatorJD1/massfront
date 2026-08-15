/* Strategic-tier acceptance capture — REAL GPU.

     node tools/capture-tacticons.mjs [outDir]

   Copied from tools/capture-real-ingame-screenshot.mjs for the server and page
   bootstrap (several harnesses embed their own http.createServer; rather than
   write a fourth, this reuses the one that is known to work), with two
   differences that matter:

     * headed Chrome on the real d3d11 device, and it REFUSES to run on
       SwiftShader. A software rasteriser will happily produce a screenshot that
       proves nothing about what a phone does.
     * it asserts on MFTiers.fac() as well as on pixels, because the failure
       mode of this feature is invisible: a 404, a blank decode or a blocked
       canvas readback all leave the game looking correct — the procedural
       placeholders are still standing.
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = resolve(process.argv[2] || join(root, '.tmp', 'tacticons'));
await mkdir(outDir, { recursive: true });

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.wasm':'application/wasm' };

/* Windows join() returns backslashes; resolve() both sides or the guard rejects
   every path and the server 404s the whole game. */
let blockFaction = false;
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (blockFaction && p.includes('tacticons-faction.png')) { res.writeHead(404); res.end(); return; }
    /* Strip the leading slash: join(root, '/index.html') on Windows discards
       root and serves C:\index.html, which 404s the whole game. */
    const filePath = resolve(join(root, p.replace(/^\//, '')));
    if (!filePath.startsWith(resolve(root))) { res.writeHead(403); res.end(); return; }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not Found'); }
});
const PORT = 9017;
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await launchPwBrowser({
  headless: false,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu',
         '--disable-gpu-sandbox']
});

const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark'
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed','1');
      localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_offline','1');
    } catch (e) {}
  });
  page.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));

  async function boot() {
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
    return gpu;
  }

  const gpu = await boot();
  console.log('GPU: ' + gpu);

  /* Strip the DOM overlay and put the engine into a live match, exactly as the
     existing capture harness does. */
  const stage = async (opts) => page.evaluate((o) => {
    if (typeof apClose === 'function') apClose();
    window.checkVictory = () => {}; window.gameOver = () => {};
    matchLive = true; running = true; paused = false; demoMode = false; fogOn = false; victoryDone = true;
    document.body.className = 'mfIntroDone';
    document.querySelectorAll('body > *:not(canvas)').forEach(e => e.remove());
    /* The HUD nodes just went away, so anything that narrates into them has to
       go too — addBld() toasts when it deploys an extractor miner. */
    window.toast = () => {}; window.mfNoticeShow = () => {}; window.mfNoticeSubmit = () => {};

    playerFaction = o.you;
    if (typeof AI !== 'undefined' && AI) AI.fac = o.them;
    if (typeof FACTIONS !== 'undefined') {
      /* Livery is set directly rather than through applyColor(), which reads the
         purchased-colour meta. TEAMC is what the icon path samples. */
    }
    TEAMC[0][0]=o.you_c[0]; TEAMC[0][1]=o.you_c[1]; TEAMC[0][2]=o.you_c[2];
    TEAMB[0][0]=o.you_b[0]; TEAMB[0][1]=o.you_b[1]; TEAMB[0][2]=o.you_b[2];
    TEAMC[1][0]=o.them_c[0]; TEAMC[1][1]=o.them_c[1]; TEAMC[1][2]=o.them_c[2];

    blds.length = 0; if (typeof rebuildBGrid === 'function') rebuildBGrid();
    for (let i = 0; i < unitHigh; i++) ualive[i] = 0;

    const cx = MAP * 0.5, cy = MAP * 0.5;
    /* Structures span the whole footprint range on purpose: walls convert
       fully, turrets and extractors mostly, factories and the HQ must NOT —
       mfBldSpan is footprint-based and landmarks are meant to keep silhouettes.
       Laid out on a rank so no two icons overlap at this zoom. */
    const rank = ['wall','wall','turret','turret','aatower','mex','pgen','sgen','techlab','fac','airfield','hq'];
    const put = (team, ox, oy) => rank.forEach((ty, i) =>
      addBld(ty, team, cx + ox + (i % 6) * 90, cy + oy + Math.floor(i / 6) * 90, true, 0));
    put(0, -560, -220);
    put(1,   80, -220);

    /* Units across the role range: infantry, armour, anti-tank, artillery,
       aircraft, hero. */
    const roles = [0, 1, 2, 3, 4, 5, 6];
    for (let k = 0; k < 21; k++) {
      const t = roles[k % roles.length];
      spawnUnit(t, 0, cx - 560 + (k % 7) * 92, cy + 90 + Math.floor(k / 7) * 96);
      spawnUnit(t, 1, cx +  80 + (k % 7) * 92, cy + 90 + Math.floor(k / 7) * 96);
    }
    cam.x = cx - 30; cam.y = cy - 40;
    orthoSpan = distTarget = SPAN_MAX;
    clampCam(); camUpdateMatrices();
    render();

    /* The engine's own projection decides the crop, so the artifact frames the
       bases rather than a guessed rectangle. */
    const pts = blds.map(b => w2s(b.x, b.y));
    for (let i = 0; i < unitHigh; i++) if (ualive[i]) pts.push(w2s(ux[i], uy[i]));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const pad = 46;
    return { span: orthoSpan, VH, worldPx: mfWorldPx(), blds: blds.length,
      clip: { x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - pad),
              width: Math.min(VW, Math.max(...xs) + pad) - Math.max(0, Math.min(...xs) - pad),
              height: Math.min(VH, Math.max(...ys) + pad) - Math.max(0, Math.min(...ys) - pad) } };
  }, opts);

  async function shot(name, opts, extra) {
    const info = await stage(opts);
    /* mfIconFacLoad starts on the first icon frame. Wait for loaded-or-reject
       so a 404 shot cannot race a still-in-flight decode. */
    await page.waitForFunction(() => {
      try { const f = MFTiers.fac(); return f.tried && (f.loaded || !!f.reject); }
      catch (e) { return false; }
    }, null, { timeout: 12000 });
    const st = await page.evaluate(() => {
      render();
      const all = MFTiers.last();
      /* SEPARATE THE TWO HALVES OF THE FEATURE. A total instance count cannot
         tell a building icon from a unit icon, and PART 2's whole claim is that
         buildings now contribute. Render once with every unit killed and the
         remainder is, by construction, the structure contribution. */
      const live = []; for (let i = 0; i < unitHigh; i++) if (ualive[i]) { live.push(i); ualive[i] = 0; }
      render();
      const bldOnly = MFTiers.last();
      for (const i of live) ualive[i] = 1;
      render();
      return { fac: MFTiers.fac(), icons: all, bldIcons: bldOnly, atlas: MFTiers.atlas() };
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => render());
    const file = join(outDir, name + '.png');
    await page.screenshot({ path: file, clip: info.clip });
    const rec = { name, file, span: info.span, VH: info.VH, icons: st.icons,
                  bldIcons: st.bldIcons, unitIcons: st.icons - st.bldIcons,
                  facLoaded: st.fac.loaded, authoredCells: st.fac.authored, ...(extra || {}) };
    results.push(rec);
    console.log(name.padEnd(28) + ' span=' + info.span + ' VH=' + info.VH +
      ' icons=' + st.icons + ' (units ' + (st.icons - st.bldIcons) + ' + buildings ' + st.bldIcons + ')' +
      ' factionSheet=' + (st.fac.loaded ? 'LOADED ' + st.fac.authored + ' cells' : 'ABSENT'));
    if (st.fac.loaded) for (const f of st.fac.byFaction)
      if (f.procedural.length) console.log('    ' + f.kit + ' procedural roles: ' + f.procedural.join(' '));
    return rec;
  }

  const NOVA_BLUE = [ [96,176,255], [190,228,255] ];
  const RED       = [ [226,64,52],  [255,168,150] ];

  await shot('01-nova-vs-legion-blue', { you:'nova', them:'legion',
    you_c:NOVA_BLUE[0], you_b:NOVA_BLUE[1], them_c:[236,96,64] });
  await shot('02-nova-vs-legion-RED', { you:'nova', them:'legion',
    you_c:RED[0], you_b:RED[1], them_c:[110,196,255] });
  await shot('03-syndicate-vs-horde-green', { you:'syndicate', them:'horde',
    you_c:[86,222,140], you_b:[196,255,214], them_c:[176,110,255] });
  await shot('04-syndicate-vs-horde-AMBER', { you:'syndicate', them:'horde',
    you_c:[240,190,60], you_b:[255,238,180], them_c:[176,110,255] });

  /* PART 2 on its own. With every unit removed, anything left in the icon batch
     came from the building loop — which had no icon branch at all before this
     change, so this frame was previously empty of symbols by construction. */
  const bInfo = await stage({ you:'nova', them:'legion', you_c:NOVA_BLUE[0], you_b:NOVA_BLUE[1], them_c:[236,96,64] });
  await page.waitForTimeout(400);
  const bOnly = await page.evaluate(() => {
    for (let i = 0; i < unitHigh; i++) ualive[i] = 0;
    render();
    const rows = [];
    for (const b of blds) rows.push({ type: b.type, team: b.team,
      span: +mfBldSpan(BT[b.type]).toFixed(1), q: +mfIconQ(mfBldSpan(BT[b.type])).toFixed(2) });
    return { icons: MFTiers.last(), rows };
  });
  await page.evaluate(() => render());
  await page.screenshot({ path: join(outDir, '05-buildings-only.png'), clip: bInfo.clip });
  console.log('\n05-buildings-only.png   ' + bOnly.icons + ' icon instances, units all removed');
  const seen = new Map();
  for (const r of bOnly.rows) if (!seen.has(r.type)) seen.set(r.type, r);
  console.log('  structure     footprint   q at SPAN_MAX/VH800');
  for (const r of seen.values())
    console.log('  ' + r.type.padEnd(12) + String(r.span).padStart(7) + '   ' + r.q + (r.q >= 1 ? '  (mesh dropped)' : r.q > 0 ? '  (icon over mesh)' : '  (mesh only)'));

  /* ---- FALLBACK: the sheet 404s. The game must still draw icons, from the
     procedural cells, and must not throw. ---- */
  blockFaction = true;
  await boot();
  const fb = await shot('06-fallback-sheet-404', { you:'nova', them:'legion',
    you_c:NOVA_BLUE[0], you_b:NOVA_BLUE[1], them_c:[236,96,64] });
  blockFaction = false;
  if (fb.facLoaded) throw new Error('FALLBACK TEST INVALID: the sheet loaded despite the 404');
  if (!(fb.icons > 0)) throw new Error('FALLBACK BROKEN: no icon instances with the sheet missing');
  console.log('\nFALLBACK OK: sheet 404, ' + fb.icons + ' icon instances still submitted from procedural cells');

  console.log('\nartifacts in ' + outDir);
} catch (err) {
  console.error('FAILED: ' + (err && err.stack || err));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
