#!/usr/bin/env node
/* Probe: is the Nova plume actually reaching MAT.PLASMA_JET, and is that tile's
   packed emissive actually 1.0?

   The capture says the brightest plume pixel is (104,115,186) — a mid slate
   blue, where vCol*emis*1.45*1.18 through 1-exp(-x*1.55) should have produced
   near-white. One of three things is false and guessing which one is how this
   project has burned a dozen probes:
     A. the plume vertices do not carry material id 74 at all,
     B. tile 74's ORM.b (emissive) is not 255,
     C. both are right and the arithmetic expectation was wrong.

   CONTROLS THAT CAN FAIL, both reported next to the answer:
     - the same two questions asked of MAT.LAMP (5), a material that is known
       to glow in this game, so a "0" here means the probe is broken, not the
       plume;
     - a count of plume vertices found. Zero means the decoration never ran and
       every other number in this output is meaningless.

   Usage: node tools/probe-nova-plume.mjs
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav',
  '.glb':'model/gltf-binary', '.webmanifest':'application/manifest+json', '.wasm':'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_offline','1'); localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof initFactionKits === 'function' && typeof MAT !== 'undefined'
    && typeof mdlWasp === 'function', { timeout: 120000 });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(() => {
    const r = {};
    /* --- A. do the plume vertices carry id 74? ------------------------- */
    const g = UNIT_MDL_NOVA[5]();
    const hist = {};
    for (let o = 11; o < g.hull.v.length; o += VFLOATS) {
      const id = Math.floor(Math.abs(g.hull.v[o])) - 1;
      hist[id] = (hist[id] || 0) + 1;
    }
    r.waspVerts = g.hull.v.length / VFLOATS;
    r.plumeVerts = hist[MAT.PLASMA_JET] || 0;              // CONTROL: 0 = decoration never ran
    r.brassVerts = hist[MAT.BRASS] || 0;
    r.lampVerts = hist[MAT.LAMP] || 0;
    r.topIds = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8);

    /* --- B. what is actually in the packed ORM for those tiles? -------- */
    /* Read the LIVE GPU TEXTURE, not the loaded PNG. The first version of this
       probe sampled matImgOrm with a 2D canvas and reported ao 255 / gloss 128 /
       metal 255 for PLATE, LAMP and PLASMA_JET alike - i.e. it was reading
       something that is not the packed ORM at all, most likely a premade image
       that materials.js REJECTED on size and replaced with the procedural
       atlas. Whatever the GPU is sampling is the only answer that counts. */
    const fb = gl.createFramebuffer();
    const read = id => {
      if (typeof matOrmTex === 'undefined' || !matOrmTex) return 'no matOrmTex';
      const S = MAT_TS, tx = (id % MAT_TILES) * S + (S >> 1), ty = Math.floor(id / MAT_TILES) * S + (S >> 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, matOrmTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); return 'fb incomplete';
      }
      const d = new Uint8Array(4), f = new Uint8Array(4);
      gl.readPixels(tx, ty, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, d);
      /* The atlas is uploaded with UNPACK_FLIP_Y, and readPixels' origin is
         bottom-left, so the image-space row is NOT the texture row. Read both
         and let the expected gloss/metal say which one is the real tile - that
         is the control. Default fill is #ff8000 + alpha 255, i.e.
         ao255/gloss128/emis0/metal255: seeing exactly that means MISSED TILE. */
      gl.readPixels(tx, MAT_ATLAS - 1 - ty, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, f);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return {
        asImageY: { ao: d[0], gloss: d[1], emis: d[2], metal: d[3] },
        asFlipY:  { ao: f[0], gloss: f[1], emis: f[2], metal: f[3] },
        expect: { gloss: Math.round((MAT_GLOSS[id] == null ? 0.4 : MAT_GLOSS[id]) * 255),
                  metal: Math.round((MAT_METAL[id] == null ? 0 : MAT_METAL[id]) * 255),
                  hasEmisPainter: !!MAT_EMIS[id] }
      };
    };
    r.ormPlasmaJet = read(MAT.PLASMA_JET);
    r.ormLamp = read(MAT.LAMP);                            // CONTROL: a known glow
    r.ormPlate = read(MAT.PLATE);                          // CONTROL: must be emis 0
    r.ormLampAlt = read(MAT.TWR_GLOW);
    r.premadeImageLoaded = (typeof matImgOrm !== 'undefined' && !!matImgOrm);
    r.atlasSideExpected = MAT_ATLAS;
    r.teamColour = (typeof TEAMC !== 'undefined' && TEAMC[0]) ? TEAMC[0].map(v => +v.toFixed(3)) : 'none';

    /* --- C. INVARIANTS of the finish pass ------------------------------
       Two things it must never do, asserted against a freshly built copy
       rather than assumed: change a material id (SERVO is a gait marker and
       the vertex stage reads it), and touch a team-livery vertex. */
    const raw = mdlWasp();
    const idsBefore = [], teamColsBefore = [];
    for (let o = 11; o < raw.hull.v.length; o += VFLOATS) {
      idsBefore.push(raw.hull.v[o]);
      if (raw.hull.v[o] < 0) teamColsBefore.push(raw.hull.v[o - 5], raw.hull.v[o - 4], raw.hull.v[o - 3]);
    }
    tfcNovaFinishPass(raw.hull);
    let idChanged = 0, teamChanged = 0, k = 0, t = 0;
    for (let o = 11; o < raw.hull.v.length; o += VFLOATS) {
      if (raw.hull.v[o] !== idsBefore[k++]) idChanged++;
      if (raw.hull.v[o] < 0) {
        if (raw.hull.v[o - 5] !== teamColsBefore[t] || raw.hull.v[o - 4] !== teamColsBefore[t + 1]
          || raw.hull.v[o - 3] !== teamColsBefore[t + 2]) teamChanged++;
        t += 3;
      }
    }
    r.invariant_materialIdsChanged = idChanged;     // MUST be 0
    r.invariant_teamVertsChanged = teamChanged;     // MUST be 0
    r.invariant_teamVertsSeen = t / 3;              // CONTROL: 0 here = nothing was checked

    /* --- D. cost, and does every slot still build? --------------------- */
    const rawTris = { 5: mdlWasp().hull.count / 3, 17: mdlRaptor().hull.count / 3, 25: mdlKestrel().hull.count / 3 };
    const built = [], failed = [];
    let totalTris = 0;
    for (const slot in UNIT_MDL_NOVA) {
      try {
        const gg = UNIT_MDL_NOVA[slot]();
        const tris = (gg.hull ? gg.hull.count / 3 : 0) + (gg.tur ? gg.tur.count / 3 : 0);
        totalTris += tris;
        built.push(slot + ':' + tris);
      } catch (e) { failed.push(slot + ':' + String(e).slice(0, 60)); }
    }
    r.slotsBuilt = built.length;                    // CONTROL: must be 28
    r.slotsFailed = failed;
    r.trianglesAddedByDecor = {
      wasp: UNIT_MDL_NOVA[5]().hull.count / 3 - rawTris[5],
      raptor: UNIT_MDL_NOVA[17]().hull.count / 3 - rawTris[17],
      kestrel: UNIT_MDL_NOVA[25]().hull.count / 3 - rawTris[25]
    };
    r.rosterTriangles = totalTris;
    r.perSlot = built.join(' ');
    return r;
  });
  console.log(JSON.stringify(out, null, 2));
  await page.close();
} catch (e) {
  console.log('FATAL ' + e.message);
} finally {
  await closePwBrowser();
  try { server.closeAllConnections && server.closeAllConnections(); } catch (e) {}
  server.close();
}
process.exit(0);
