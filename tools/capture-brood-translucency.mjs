#!/usr/bin/env node
/* ============================================================================
   BROOD TRANSLUCENCY CAPTURE — the back-lit test
   ----------------------------------------------------------------------------
   Derived from tools/capture-stagec-fx.mjs: serves the repo ROOT so it tests
   src/ live (no `npm run pack` in the loop), boots past the auth gate, drives
   real Chrome on d3d11, and pins perfScale to the owner's device value 0.4125.

   WHAT MAKES THIS DIFFERENT FROM A PRETTY SCREENSHOT
   --------------------------------------------------
   Front-lit flesh looks fine with no transmission term whatsoever — a good
   albedo and a wrap term will fake it all day. The only shot that can falsify
   a translucency claim is BACK-LIT: sun behind the creature relative to the
   camera. If thin tissue does not light up there, nothing is transmitting.

   So every unit is shot twice from the IDENTICAL camera, once with the sun in
   front and once with it behind, and the two frames are differenced in-page.
   The metric is the RED SHIFT of the back-lit frame relative to the front-lit
   one — mean(R) - mean(G+B)/2 — because a colour shift toward red is the thing
   subsurface scattering does that a surface tint cannot.

   THE CONTROL THAT CAN FAIL
   -------------------------
   Two units are always captured together:
     STINGWING (5) — two pairs of membrane wings, BROOD_MEMBRANE, thickness 1.0
     GORGER    (1) — a solid armoured brawler, BROOD_CHITIN/CHITIN, thickness ~0.14
   If the Gorger's back-lit red shift matches the Stingwing's, the thickness
   signal is not doing anything and the "SSS" is a global haze. That is exactly
   the failure mode the previous implementation had, and it is why this harness
   refuses to report a single number.

   USAGE
     node tools/capture-brood-translucency.mjs            after  (working tree, landed or staged mesh patch)
     node tools/capture-brood-translucency.mjs --stock    before (git HEAD, unpatched)

   `--stock` serves `git show HEAD:<path>` for the two model files this agent
   owns and leaves mesh.js untouched, so the two runs are a true A/B of the
   whole change without ever mutating the working tree.

   Output: .tmp/brood-translucency/<after|before>/
   ============================================================================ */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STOCK = process.argv.includes('--stock');
const MODE = STOCK ? 'before' : 'after';
const outDir = join(root, '.tmp', 'brood-translucency', MODE);
await mkdir(outDir, { recursive: true });

const log = [];
const say = m => { log.push(String(m)); console.log(String(m)); };
say('mode: ' + MODE + (STOCK ? '  (git HEAD sources, stock mesh.js)' : '  (working tree with Brood SSS)'));

/* ---- source overrides ----------------------------------------------------- */
/* The two files this agent owns. In `before` mode they are served from HEAD. */
const OWNED = ['src/engine/models-units-brood.js', 'src/engine/models-infestation.js'];
/* mesh.js is part of the authority source now. Never recover it from an agent
   scratch directory: that can silently test stale code from another checkout. */

const overrides = new Map();
if (STOCK) {
  for (const p of [...OWNED, 'src/engine/mesh.js']) {
    const txt = execFileSync('git', ['show', 'HEAD:' + p], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    overrides.set('/' + p, txt);
    say('  serving HEAD copy of ' + p + ' (' + txt.length + ' bytes)');
  }
} else {
  const meshSrc = await readFile(join(root, 'src', 'engine', 'mesh.js'), 'utf8');
  if (!meshSrc.includes('BRDMEM_CONST')) {
    say('!! authority src/engine/mesh.js is missing BRDMEM_CONST; refusing stale scratch fallback');
    process.exit(2);
  }
  const patched=meshSrc;
  overrides.set('/src/engine/mesh.js', patched);
  say('  mesh.js ' + (patched===meshSrc?'already patched on disk':'patched in memory') + ': ' + meshSrc.length + ' -> ' + patched.length + ' bytes'
    + '  (+' + (patched.split('thinAuth').length - 1) + ' thinAuth, +'
    + (patched.split('deepFlesh').length - 1) + ' deepFlesh)');
}

/* ---- server --------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm'
};
let servedOverrides = 0;
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    if (overrides.has(p)) {
      servedOverrides++;
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(overrides.get(p)); return;
    }
    const file = resolve(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/';
say('serving ' + url);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const boot = () => {
  try { if (typeof apClose === 'function') apClose(); } catch (e) {}
  try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
  try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
  document.body.classList.add('mfIntroDone');
  for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }
  document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display', 'none', 'important'));
};

/* THE UNITS. Slot ids are indices into UNIT_MDL_BROOD (models-units-brood.js).
   `thin` says what the eye is supposed to do with each one; it is also the
   pass/fail expectation for the red-shift metric. */
const SUBJECTS = [
  { id: 5,  name: 'stingwing',   thin: 'membrane wings — MUST glow back-lit' },
  { id: 21, name: 'emberthroat', thin: 'five dorsal membrane vanes' },
  { id: 20, name: 'bloomsac',    thin: 'one huge gravid sac' },
  { id: 14, name: 'razorfinn',   thin: 'dorsal vane (was authored CHITIN) + wings' },
  { id: 1,  name: 'gorger',      thin: 'CONTROL — solid carapace, must NOT glow' }
];

try {
  const page = await browser.newPage({
    viewport: { width: 760, height: 760 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark'
  });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message.slice(0, 200)); });
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER));
  });
  say('GPU: ' + gpu);
  if (/swiftshader|llvmpipe|lavapipe/i.test(String(gpu)))
    say('*** SOFTWARE RASTERISER — shading is NOT representative, treat every number below as void ***');

  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof render === 'function' &&
    typeof resetWorld === 'function', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(boot);
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF && typeof terrainTex !== 'undefined' && terrainTex, { timeout: 90000 }).catch(() => {});

  /* ---- did the shader even compile? ------------------------------------- */
  const shader = await page.evaluate(() => {
    const e = (typeof GL_PROG_ERRORS !== 'undefined' && GL_PROG_ERRORS) ? GL_PROG_ERRORS.slice(0, 3) : [];
    return { errors: e, n: e.length, prog: (typeof prog3D !== 'undefined' && !!prog3D) };
  });
  say('shader: prog3D=' + shader.prog + '  GL_PROG_ERRORS=' + shader.n + (shader.n ? ('  ' + JSON.stringify(shader.errors)) : ''));
  if (shader.n || !shader.prog) say('*** THE MODEL PROGRAM DID NOT COMPILE — every capture below is meaningless ***');

  /* ---- world at DEVICE settings ------------------------------------------ */
  const setup = await page.evaluate(() => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true; fogOn = false;
    running = true; paused = false; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.fog = false; META.settings.dayNight = false;
      META.settings.quality = 'medium';
    }
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.20;
    resetWorld();
    playerFaction = 'nova';
    perfScale = 0.4125;                               // the owner's device value
    if (typeof GFX !== 'undefined') { GFX.particles = 0.75; GFX.fxFloor = 0.35; }

    const cv = document.getElementById('gl');
    for (const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch','apOverlay','setupScr','startScreen']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display','none','important');
    }
    document.body.classList.remove('menuMode', 'mfMenuOpen');
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    cv.style.display = 'block'; cv.style.position = 'fixed'; cv.style.inset = '0';
    cv.style.width = '100vw'; cv.style.height = '100vh';
    camFollow = -1;
    if (typeof resize === 'function') resize();

    /* SUN OVERRIDE. sunFor() is a top-level function DECLARATION, so it is a
       property of the global object and can be replaced; render3d.js resolves
       it unqualified and therefore picks up the replacement. The original is
       still called for colour/ambient/fog — only .dir is rewritten, so the ONLY
       variable between the two shots is where the light is. */
    window.__sunMode = 'front';
    const _sunFor = sunFor;
    sunFor = function (nA) {
      const r = _sunFor(nA);
      if (window.__sunMode === 'default') return r;
      /* Camera forward, horizontal. camEye() puts the eye at
         cam - (cos(camYaw), sin(camYaw)) * hor, so forward is +that. */
      const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
      const back = window.__sunMode === 'back';
      const el = back ? 0.30 : 0.62;                  // low sun behind, higher in front
      const s = back ? 1 : -1;
      const ch = Math.cos(el), sy = Math.sin(el);
      const L = Math.hypot(fx * ch * s, sy, fz * ch * s) || 1;
      r.dir[0] = fx * ch * s / L; r.dir[1] = sy / L; r.dir[2] = fz * ch * s / L;
      return r;
    };
    return { perfScale, MAP };
  });
  say('world ready at perfScale=' + setup.perfScale + ' (device value), sunFor override installed');

  const step = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => {
    const dt = 1 / 30;
    try { unitTick(dt); } catch (e) {}
    try { projTick(dt); } catch (e) {}
    try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
    render(dt);
  }); };

  /* ---- place the subjects on open ground --------------------------------- */
  const placed = await page.evaluate((SUBJECTS) => {
    /* Open, non-civic, walkable ground. A city tile changes the ground albedo
       under the creature and would pollute the red-shift metric. */
    let p = null;
    for (let r = 200; r < MAP * 0.45 && !p; r += 90) {
      for (let a = 0; a < 12; a++) {
        const x = MAP * 0.5 + Math.cos(a * 0.523) * r, y = MAP * 0.5 + Math.sin(a * 0.523) * r;
        if (x < 300 || y < 300 || x > MAP - 300 || y > MAP - 300) continue;
        const civic = typeof cityGroundAt === 'function' && cityGroundAt(x, y) >= 1;
        if (!civic && isWalkable(x, y)) { p = [x, y]; break; }
      }
    }
    if (!p) return { err: 'no open ground' };
    const out = [];
    for (let k = 0; k < SUBJECTS.length; k++) {
      const S = SUBJECTS[k];
      const gx = p[0] + k * 140, gy = p[1];
      const i = spawnUnit(S.id, 2, gx, gy);            // team 2 => the 'horde' kit
      if (i < 0) { out.push({ ...S, err: 'spawnUnit refused' }); continue; }
      if (typeof uvx !== 'undefined') { uvx[i] = 0; uvy[i] = 0; }
      /* READ THE POSITION BACK, do not assume it. spawnUnit runs the spawn
         point through findLand() — or findWater() for a naval type — and the
         Razorfinn and Keelback are naval, so forcing ux/uy back to the
         requested land point put a swimmer on a hillside where it did not
         draw at all. That is what produced two 0-pixel masks. */
      const T = TYPES[S.id];
      const fn = (typeof FAC_KIT !== 'undefined' && FAC_KIT.horde && FAC_KIT.horde[S.id]) || null;
      out.push({
        ...S, idx: i, x: ux[i], y: uy[i], air: !!(T && (T.air || T.naval)),
        type: (T && T.name) || '?', model: fn ? fn.name : 'NO BROOD MODEL'
      });
    }
    return { ok: true, at: [Math.round(p[0]), Math.round(p[1])], units: out };
  }, SUBJECTS);
  if (placed.err) { say('FATAL placement: ' + placed.err); throw new Error(placed.err); }
  say('open ground at ' + placed.at.join(','));
  for (const u of placed.units) say('  slot ' + u.id + ' ' + u.name.padEnd(12) + ' -> ' + (u.err || (u.type + '  model=' + u.model)));
  /* CONTROL: if these are not the Brood builders, the whole capture is testing
     somebody else's geometry. Say so loudly rather than shipping a pretty lie. */
  const wrong = placed.units.filter(u => !u.model || !/^brdPurple/.test(u.model));
  if (wrong.length) say('*** ' + wrong.length + ' subject(s) did NOT resolve to a Brood builder: '
    + wrong.map(u => u.name + '=' + u.model).join(', ') + ' ***');

  await step(8);

  /* ---- shoot each subject front-lit and back-lit -------------------------- */
  /* ---- THE MEASUREMENT ---------------------------------------------------
     The first version of this harness averaged a fixed centre crop and got
     five near-identical numbers, because at the camera's own SPAN_MIN the
     creature is ~27 px in a 1520 px frame and the "metric" was measuring
     GRASS. So the sample region is now derived, not assumed:

       for each sun mode, render WITH the unit and again with the unit
       teleported off-camera, and take the pixels that changed;
       then INTERSECT the front-lit and back-lit masks.

     The intersection matters: a unit's ground shadow also changes when the
     unit is removed, but the front-lit and back-lit shadows fall on opposite
     sides, so they mostly do not survive the intersection while the creature's
     own body does. The mask pixel count is reported — if it collapses toward
     zero the measurement is void and says so, rather than quietly averaging
     scenery again. */
  const shoot = async (S) => page.evaluate(({ idx, span }) => {
    camFollow = -1;
    /* LIVE position. unitTick runs between spawn and shot and units drift;
       a naval type is also relocated by findWater() inside spawnUnit, which
       is what left the Razorfinn framed on empty hillside and its mask at
       0 px. Read where the unit actually IS. */
    const x = ux[idx], y = uy[idx];
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 0.58;   // low: a low sun can get behind
    /* ALTITUDE COMPENSATION. A flyer is drawn well above the ground, and under
       an orthographic camera a point h above the look-at leaves the frame
       entirely at span 34 — which is exactly why the Stingwing's first mask was
       0 px. Under ortho every ray is parallel to (f*cos p, -sin p), so sliding
       the look-at forward by h/tan(p) puts the elevated body back on the
       centre ray. */
    const T = TYPES[utype[idx]];
    const gh = terrainH(x, y);
    const drawY = (typeof unitGroundY === 'function') ? unitGroundY(T, x, y, idx) : gh;
    const lift = Math.max(0, drawY - gh) / Math.max(0.15, Math.tan(camPitch));
    cam.x = x + Math.cos(camYaw) * lift;
    cam.y = y + Math.sin(camYaw) * lift;
    /* NOT clampCam(): SPAN_MIN is 420 and this is a cinematic inspection
       shot. The gameplay-distance pair is captured separately below. */
    orthoSpan = distTarget = span;
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();

    const cv = document.getElementById('gl');
    const grab = () => {
      const dt = 1 / 30;
      render(dt); render(dt);                     // twice: uSun is uploaded per frame
      const t = document.createElement('canvas');
      t.width = cv.width; t.height = cv.height;
      const c2 = t.getContext('2d');
      /* drawImage in the SAME task as render(): the drawing buffer is still
         valid here even with preserveDrawingBuffer false, which is why pixels
         are read this way rather than through a Playwright screenshot. */
      c2.drawImage(cv, 0, 0);
      return { t, d: c2.getImageData(0, 0, t.width, t.height).data };
    };
    const out = {};
    const ox = ux[idx], oy = uy[idx];
    for (const mode of ['front', 'back']) {
      window.__sunMode = mode;
      const withU = grab();
      ux[idx] = 40; uy[idx] = 40;                 // off-camera, still alive
      const noU = grab();
      ux[idx] = ox; uy[idx] = oy;
      out[mode] = { withU, noU };
    }
    /* mask = changed in front AND changed in back */
    const A = out.front, B = out.back, n = A.withU.d.length;
    const mask = new Uint8Array(n >> 2);
    let count = 0;
    for (let i = 0, p = 0; i < n; i += 4, p++) {
      const da = Math.abs(A.withU.d[i] - A.noU.d[i]) + Math.abs(A.withU.d[i + 1] - A.noU.d[i + 1]) + Math.abs(A.withU.d[i + 2] - A.noU.d[i + 2]);
      const db = Math.abs(B.withU.d[i] - B.noU.d[i]) + Math.abs(B.withU.d[i + 1] - B.noU.d[i + 1]) + Math.abs(B.withU.d[i + 2] - B.noU.d[i + 2]);
      if (da > 34 && db > 34) { mask[p] = 1; count++; }
    }
    const stat = (d) => {
      let R = 0, G = 0, Bl = 0;
      /* The whole-body MEAN cannot see a local effect. An Emberthroat is five
         thin vanes on a large armoured body: if the vanes light up and the
         carapace correctly does not, the mean barely moves. So the 90th
         percentile is reported alongside it - that is the brightest tenth of
         the creature, which is where transmitted light actually lives. */
      const rs = new Float32Array(count);
      let q = 0;
      for (let i = 0, p = 0; i < n; i += 4, p++) if (mask[p]) {
        R += d[i]; G += d[i + 1]; Bl += d[i + 2];
        rs[q++] = d[i] - (d[i + 1] + d[i + 2]) / 2;
      }
      const k = Math.max(1, count);
      R /= k; G /= k; Bl /= k;
      rs.sort();
      const p90 = count ? rs[Math.min(count - 1, Math.floor(count * 0.90))] : 0;
      return { R, G, B: Bl, lum: (R + G + Bl) / 3, redShift: R - (G + Bl) / 2, p90 };
    };
    window.__sunMode = 'front';
    return {
      maskPx: count, framePx: n >> 2,
      front: stat(A.withU.d), back: stat(B.withU.d),
      pngFront: A.withU.t.toDataURL('image/png'),
      pngBack: B.withU.t.toDataURL('image/png')
    };
  }, { idx: S.idx, span: 34 });

  const results = [];
  for (const S of placed.units) {
    if (S.err) continue;
    await step(2);
    const g = await shoot(S);
    await writeFile(join(outDir, S.name + '-front.png'), Buffer.from(g.pngFront.split(',')[1], 'base64'));
    await writeFile(join(outDir, S.name + '-back.png'), Buffer.from(g.pngBack.split(',')[1], 'base64'));
    const dRed = g.back.redShift - g.front.redShift;
    const dLum = g.back.lum - g.front.lum;
    const dP90 = g.back.p90 - g.front.p90;
    const cover = (100 * g.maskPx / g.framePx).toFixed(1);
    results.push({ name: S.name, note: S.thin, maskPx: g.maskPx, coverPct: +cover, front: g.front, back: g.back, dRed, dLum, dP90 });
    say('  ' + S.name.padEnd(12) + ' mask=' + String(g.maskPx).padStart(7) + 'px(' + cover + '%)'
      + '  redShift front=' + g.front.redShift.toFixed(2).padStart(7)
      + '  back=' + g.back.redShift.toFixed(2).padStart(7)
      + '  Δred=' + dRed.toFixed(2).padStart(7)
      + '  Δlum=' + dLum.toFixed(2).padStart(7)
      + '  Δp90red=' + dP90.toFixed(2).padStart(7));
    if (g.maskPx < 2000) say('    !! mask is tiny — this row measures scenery, not the creature. VOID.');
  }

  /* ---- honesty shot: the closest a PLAYER can actually get ---------------- */
  {
    const S = placed.units.find(u => u.name === 'stingwing') || placed.units[0];
    for (const mode of ['front', 'back']) {
      const png = await page.evaluate(({ x, y, mode }) => {
        cam.x = x; cam.y = y; camFollow = -1;
        camYaw = yawTarget = 0.22; camPitch = pitchTarget = 0.58;
        orthoSpan = distTarget = 420;             // SPAN_MIN — the game's own floor
        if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
        window.__sunMode = mode;
        render(1 / 30); render(1 / 30);
        const cv = document.getElementById('gl');
        const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
        t.getContext('2d').drawImage(cv, 0, 0);
        return t.toDataURL('image/png');
      }, { x: S.x, y: S.y, mode });
      await writeFile(join(outDir, 'gameplay-span420-' + mode + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    }
    say('  gameplay-span420 pair written (SPAN_MIN — the closest zoom the game allows)');
  }

  /* ---- the verdict -------------------------------------------------------- */
  say('');
  const wing = results.find(r => r.name === 'stingwing');
  const ctrl = results.find(r => r.name === 'gorger');
  if (wing && ctrl && wing.maskPx >= 2000 && ctrl.maskPx >= 2000) {
    const margin = wing.dRed - ctrl.dRed;
    say('BACK-LIT RED SHIFT, membrane vs carapace:');
    say('  stingwing Δred ' + wing.dRed.toFixed(2) + '   gorger(control) Δred ' + ctrl.dRed.toFixed(2)
      + '   margin ' + margin.toFixed(2));
    say(margin > 1.0
      ? '  => thin tissue reddens under back light MORE than solid shell. Transmission is thickness-aware.'
      : '  => NO separation. Either nothing is transmitting, or the term is a thickness-blind global haze.');
  } else say('verdict unavailable: stingwing and/or gorger did not spawn, or their masks were too small to measure');

  say('');
  say('overrides served: ' + servedOverrides + (STOCK ? ' (expect 3)' : ' (expect 1)'));
  say('page errors: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'none'));
  await writeFile(join(outDir, 'metrics.json'), JSON.stringify({ mode: MODE, gpu, shader, results }, null, 2), 'utf8');
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
  await page.close();
} catch (e) {
  say('FATAL ' + e.message);
  await writeFile(join(outDir, 'log.txt'), log.join('\n'), 'utf8');
} finally {
  await closePwBrowser();
  server.close();
  if (server.closeAllConnections) server.closeAllConnections();
}
console.log('output: ' + outDir);
/* Chrome's pipe and the keep-alive sockets otherwise hold the loop open long
   after the last file is written; the run is finished, so end it. */
process.exit(0);
