#!/usr/bin/env node
/* REAL-GAMEPLAY CINEMATIC BLAST CAPTURE
   ---------------------------------------------------------------------------
   The combat-FX audit is about what a player sees when a unit dies in a match,
   so this harness refuses to use a helper/debug spawner. It boots a real
   skirmish world at the CINEMATIC preset, spawns a real vehicle on the enemy
   team, and kills it with dealDamage() - the same call the weapon code uses.
   killUnit -> spawnExplosion -> mfEmitMacroFx therefore runs exactly as it does
   in play, including recipe, volume, shockwave and debris ownership.

   Frames are captured across the blast's life so the late-life fade is visible
   rather than inferred, and every frame carries the runtime telemetry that
   proves WHICH path presented it.

     node tools/capture-cinematic-blast.mjs --label before
     node tools/capture-cinematic-blast.mjs --label after

   Output: .tmp/cinematic-blast/<label>/
*/
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PW_CDP_PORT ||= '9473';   // never share the fxprobe port
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const optOf = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LABEL = optOf('label', 'run').replace(/[^a-z0-9_.-]/gi, '_');
const QUALITY = optOf('quality', 'cinematic').toLowerCase();
if (QUALITY !== 'high' && QUALITY !== 'cinematic') throw new Error('--quality must be high or cinematic');
const EXPECTED_STEPS = QUALITY === 'cinematic' ? 32 : 24;
const outDir = join(root, '.tmp', 'cinematic-blast', LABEL);
await mkdir(outDir, { recursive: true });

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.glb':'model/gltf-binary','.webmanifest':'application/manifest+json','.wasm':'application/wasm' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]); if (p === '/') p = '/index.html';
    const f = resolve(join(root, p));
    if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(await readFile(f));
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/?fxprobe=1';

const log = [];
const say = m => { log.push(String(m)); console.log(m); };
let failures = 0;
const check = (name, ok, detail) => { if (!ok) failures++; say((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  [' + detail + ']' : '')); };

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});

const shots = [];
async function shot(page, name) {
  const png = await page.screenshot({ type: 'png', animations: 'disabled' });
  const sig = png.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error(name + ': bad PNG signature ' + sig);
  const dec = await page.evaluate(async b64 => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, mean = 0, m2 = 0, min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i]*0.2126 + d[i+1]*0.7152 + d[i+2]*0.0722;
      min = Math.min(min, v); max = Math.max(max, v); n++;
      const del = v - mean; mean += del / n; m2 += del * (v - mean);
    }
    return { w: im.naturalWidth, h: im.naturalHeight, variance: m2 / Math.max(1, n-1), min, max, mean };
  }, png.toString('base64'));
  if (!(dec.w > 0 && dec.variance > 4 && dec.max - dec.min > 8))
    throw new Error(name + ': screenshot has no useful variance ' + JSON.stringify(dec));
  await writeFile(join(outDir, name), png);
  shots.push(Object.assign({ name }, dec));
  return dec;
}

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 220)));
  const missing = [];
  page.on('response', r => { if (r.status() === 404) missing.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.addInitScript(() => { try {
    localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1'); localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  } catch (e) {} });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(g.getParameter(g.RENDERER));
  });
  say('GPU: ' + gpu);
  check('hardware GPU (not a software rasteriser)', !/swiftshader|llvmpipe|lavapipe|software/i.test(String(gpu)), gpu);

  await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof render === 'function' &&
    typeof resetWorld === 'function' && typeof spawnExplosion === 'function' &&
    typeof dealDamage === 'function' && typeof mfPhysStep === 'function', { timeout: 120000 });
  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    document.body.classList.add('mfIntroDone');
    for (const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay']) {
      const el = document.getElementById(id); if (el) el.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display','none','important'));
  });
  await page.waitForFunction(() => typeof heightF !== 'undefined' && heightF, { timeout: 90000 }).catch(() => {});

  /* ---- real skirmish world at the CINEMATIC preset --------------------- */
  const setup = await page.evaluate(quality => {
    try { stopAttract(); } catch (e) {}
    attractOn = false; demoMode = false; matchLive = true;
    /* Real render loop stays live (that is the real gameplay path); the sim is
       paused so ONLY this harness advances effect age. main.js frame() gates
       its sim block on running&&!paused but keeps rendering. */
    running = true; paused = true; gameEnded = false;
    if (typeof META !== 'undefined' && META.settings) {
      META.settings.quality = quality;
      META.settings.fog = false; META.settings.dayNight = false;
    }
    if (typeof applySettings === 'function') applySettings();
    dayT = 0.20;
    resetWorld();
    playerFaction = 'nova';
    fogOn = false;
    const cv = document.getElementById('gl');
    for (const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch','apOverlay','setupScr','startScreen']) {
      const e = document.getElementById(id); if (e) e.style.setProperty('display','none','important');
    }
    document.body.classList.remove('menuMode','mfMenuOpen');
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    cv.style.display = 'block'; cv.style.position = 'fixed'; cv.style.inset = '0';
    cv.style.width = '100vw'; cv.style.height = '100vh';
    running = true; paused = true;   /* resetWorld may clear these */
    if (typeof resize === 'function') resize();
    return { quality: typeof qualityKey === 'function' ? qualityKey() : '?',
             volSteps: (typeof GFX !== 'undefined' && GFX) ? GFX.volSteps : null };
  }, QUALITY);
  say('quality=' + setup.quality + '  GFX.volSteps=' + setup.volSteps);
  check('requested preset is active', setup.quality === QUALITY, setup.quality);
  check(QUALITY + ' declares expected volSteps', setup.volSteps === EXPECTED_STEPS, String(setup.volSteps));

  const step = async (n) => { for (let k = 0; k < n; k++) await page.evaluate(() => {
    const dt = 1/30;
    try { unitTick(dt); } catch (e) {}
    try { projTick(dt); } catch (e) {}
    try { beamTick(dt); } catch (e) {}
    try { if (typeof bldTick === 'function') bldTick(dt); } catch (e) {}
    try { if (typeof updParticles === 'function') updParticles(dt); } catch (e) {}
    try { if (typeof shardTick === 'function') shardTick(dt); } catch (e) {}
    render(dt);
  }); };

  /* ---- spawn a real vehicle and frame the camera on it ------------------ */
  const target = await page.evaluate(() => {
    let best = -1, bestSize = 0;
    for (let t = 0; t < TYPES.length; t++) {
      const T = TYPES[t]; if (!T || T.air || T.legs) continue;
      if (T.size >= 14 && T.size <= 26 && T.size > bestSize) { bestSize = T.size; best = t; }
    }
    if (best < 0) return null;
    /* The map centre can be a generated civic block.  Capturing there puts a
       legitimate volume behind a roof/force-field and visually proves nothing.
       Pick a deterministic open field away from city pads, structures and
       resource nodes while still using the normal spawn -> damage -> death path. */
    const candidates=[[.30,.50],[.70,.50],[.50,.30],[.50,.70],[.18,.50],[.82,.50],
                      [.36,.36],[.64,.36],[.36,.64],[.64,.64]];
    let cx=MAP*.30,cy=MAP*.50;
    for(const p of candidates){
      const x=MAP*p[0],y=MAP*p[1];
      if(typeof cityGroundAt==='function'&&cityGroundAt(x,y)>0) continue;
      let occupied=false;
      for(const B of blds) if(B&&B.alive&&dist2(x,y,B.x,B.y)<((B.r||24)+85)*((B.r||24)+85)){occupied=true;break;}
      if(!occupied) for(const D of deposits) if(dist2(x,y,D.x,D.y)<110*110){occupied=true;break;}
      if(!occupied){cx=x;cy=y;break;}
    }
    const idx = spawnUnit(best, 1, cx, cy);
    /* This is fixture isolation only.  It prevents a nearby friendly Bulwark
       from turning a death-path test into a shield-contact test; the kill below
       still enters production dealDamage -> killUnit -> spawnExplosion. */
    ushielded[idx]=0;
    cam.x = cx; cam.y = cy; camFollow = -1;
    camYaw = yawTarget = 0.22; camPitch = pitchTarget = 1.05;
    orthoSpan = distTarget = 220;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    return { idx: idx, type: best, size: TYPES[best].size,
             name: TYPES[best].name || ('type' + best), x: cx, y: cy };
  });
  check('real vehicle spawned', !!target && target.idx >= 0, target ? (target.name + ' size ' + target.size) : 'none');
  if (!target) throw new Error('no spawnable ground vehicle type found');
  await step(8);

  const telem = () => page.evaluate(() => {
    const vt = typeof volFxTelemetry === 'function' ? volFxTelemetry() : null;
    const mx = typeof macroFxTelemetry === 'function' ? macroFxTelemetry() : null;
    const mm = typeof mfMacroFxTelemetry === 'function' ? mfMacroFxTelemetry() : null;
    const ph = typeof mfPhysStats === 'function' ? mfPhysStats() : null;
    return {
      vol: vt ? JSON.parse(JSON.stringify(vt)) : null,
      driver: typeof volFxDriverTelemetry === 'function' ? volFxDriverTelemetry() : null,
      shock: (typeof MF_SW_TELEM !== 'undefined') ? JSON.parse(JSON.stringify(MF_SW_TELEM)) : null,
      macro: mx ? JSON.parse(JSON.stringify(mx)) : null,
      events: mm ? { total: mm.total, forbiddenGpu: mm.forbiddenGpu, last: mm.last,
                     recent: (mm.events || []).slice(-6) } : null,
      phys: ph ? JSON.parse(JSON.stringify(ph)) : null,
      volActive: typeof volFxActive === 'function' ? !!volFxActive() : null,
      volEnabled: typeof volFxEnabled === 'function' ? !!volFxEnabled() : null,
      aoActive: typeof aoActive !== 'undefined' ? !!aoActive : null,
      perfScale: typeof perfScale === 'number' ? perfScale : null,
      glErr: (typeof gl !== 'undefined' && gl) ? gl.getError() : null
    };
  });

  /* ---- kill it through the real damage path ----------------------------- */
  const killState = await page.evaluate(t => {
    if (typeof mfMacroFxResetTelemetry === 'function') { try { mfMacroFxResetTelemetry(); } catch (e) {} }
    dealDamage(t.idx, 1e9, 0, -1);
    return { alive: !!ualive[t.idx], hp: uhp[t.idx], shield: ushielded[t.idx] };
  }, target);
  check('real target reached the death path', !killState.alive, JSON.stringify(killState));

  const frames = [];
  const plan = [ ['t000', 0], ['t002', 2], ['t006', 4], ['t014', 8], ['t028', 14], ['t050', 22] ];
  for (const entry of plan) {
    const tag = entry[0], extra = entry[1];
    await step(extra || 1);
    const tl = await telem();
    const dec = await shot(page, LABEL + '-' + tag + '.png');
    frames.push({ tag: tag, telemetry: tl, image: dec });
    say(tag + '  volDrawn=' + (tl.vol ? tl.vol.drawn : '?') +
        ' steps=' + (tl.vol ? tl.vol.steps : '?') +
        ' driver=' + (tl.driver ? tl.driver.state : '?') +
        ' driverSamples=' + (tl.vol ? tl.vol.driverSamples : '?') +
        ' presentedBlast=' + (tl.vol ? tl.vol.presentedBlast : '?') +
        ' rings=' + (tl.shock ? tl.shock.rings : '?') +
        ' macroQueued=' + (tl.macro ? tl.macro.queued : '?') +
        ' macroDropped=' + (tl.macro ? tl.macro.dropped : '?') +
        ' bodies=' + (tl.phys ? tl.phys.bodies : '?') +
        ' mean=' + dec.mean.toFixed(2));
  }

  /* ---- contract assertions on the real event ---------------------------- */
  const ev = frames.find(f => f.telemetry.events && f.telemetry.events.last);
  const last = ev ? ev.telemetry.events.last : null;
  say('macro event: ' + JSON.stringify(last));
  const anyVolDrawn = frames.some(f => f.telemetry.vol && f.telemetry.vol.drawn > 0);
  const anyPresented = frames.some(f => f.telemetry.vol && f.telemetry.vol.presentedBlast > 0);
  const maxSteps = Math.max.apply(null, [0].concat(frames.map(f => (f.telemetry.vol && f.telemetry.vol.steps) || 0)));
  const maxRings = Math.max.apply(null, [0].concat(frames.map(f => (f.telemetry.shock && f.telemetry.shock.rings) || 0)));
  const maxBodies = Math.max.apply(null, [0].concat(frames.map(f => (f.telemetry.phys && f.telemetry.phys.bodies) || 0)));
  const forbidden = Math.max.apply(null, [0].concat(frames.map(f => (f.telemetry.events && f.telemetry.events.forbiddenGpu) || 0)));
  const layers = last && typeof last.layers === 'number' ? last.layers : -1;

  check('volume marched for the real blast', anyVolDrawn, 'drawn>0 in some frame');
  check('volume composited (presentedBlast>0)', anyPresented, 'presentedBlast');
  const driverReady = frames.some(f => f.telemetry.driver && f.telemetry.driver.ready);
  const driverSamples = Math.max.apply(null, [0].concat(frames.map(f => (f.telemetry.vol && f.telemetry.vol.driverSamples) || 0)));
  check(QUALITY + ' marched at volSteps ' + EXPECTED_STEPS, maxSteps === EXPECTED_STEPS, 'maxSteps=' + maxSteps);
  check('authored density/emission driver loaded', driverReady,
    JSON.stringify(frames.find(f => f.telemetry.driver)?.telemetry.driver || null));
  check('real blast sampled driver inside the volume', driverSamples > 0, 'driverSamples=' + driverSamples);
  check('exactly one shockwave ring live', maxRings === 1, 'maxRings=' + maxRings);
  check('one bounded debris group (1-3 bodies)', maxBodies >= 1 && maxBodies <= 3, 'bodies=' + maxBodies);
  check('no forbidden GPU point spray', forbidden === 0, 'forbiddenGpu=' + forbidden);
  check('at most three transient layers', layers >= 1 && layers <= 3, 'layers=' + (last ? JSON.stringify(last.layers) : 'none'));
  check('late-life core still visible', (function () {
    const lateA = frames.find(f => f.tag === 't028'), lateB = frames.find(f => f.tag === 't050');
    return !!(lateA && lateB && ((lateA.telemetry.vol && lateA.telemetry.vol.drawn > 0) ||
                                 (lateB.telemetry.vol && lateB.telemetry.vol.drawn > 0)));
  })(), 'volume alive at t028/t050');

  /* Driver failure cannot make the event disappear or stack its flipbook over
     the existing raymarch.  Exercise the same guarded failure branch used by
     an image decode/GPU upload error, then kill a second fixture through the
     normal production damage path.  This is deliberately after the authored
     capture above, so the visible hero frames always use the real loaded art. */
  const fallbackStart = await page.evaluate(t => {
    if (typeof volDriverFail !== 'function' || !volDriverTex)
      return { armed: false, reason: 'driver internals unavailable' };
    volDriverFail(volDriverTex, volEpoch, volDriverSerial, 'capture forced fallback');
    const x = Math.min(MAP - 120, t.x + 150), y = Math.max(120, Math.min(MAP - 120, t.y + 90));
    const idx = spawnUnit(t.type, 1, x, y);
    if (idx < 0) return { armed: false, reason: 'fallback fixture spawn failed' };
    ushielded[idx] = 0;
    if (typeof mfMacroFxResetTelemetry === 'function') mfMacroFxResetTelemetry();
    dealDamage(idx, 1e9, 0, -1);
    return { armed: true, killed: !ualive[idx], x, y };
  }, target);
  await step(4);
  const fallbackTelemetry = await telem();
  const fallbackImage = await shot(page, LABEL + '-fallback-procedural.png');
  const fallbackOK = !!fallbackStart.armed && !!fallbackStart.killed &&
    fallbackTelemetry.driver && fallbackTelemetry.driver.state === 'procedural-fallback' &&
    !fallbackTelemetry.driver.ready && fallbackTelemetry.vol &&
    fallbackTelemetry.vol.drawn > 0 && fallbackTelemetry.vol.presentedBlast > 0 &&
    fallbackTelemetry.vol.driverSamples === 0 && fallbackTelemetry.glErr === 0;
  check('driver decode/upload fallback keeps one procedural volume visible', fallbackOK,
    JSON.stringify({ start: fallbackStart, driver: fallbackTelemetry.driver,
      drawn: fallbackTelemetry.vol && fallbackTelemetry.vol.drawn,
      presentedBlast: fallbackTelemetry.vol && fallbackTelemetry.vol.presentedBlast,
      driverSamples: fallbackTelemetry.vol && fallbackTelemetry.vol.driverSamples,
      glErr: fallbackTelemetry.glErr, imageMean: fallbackImage.mean }));
  check('zero page/console errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  say('404 resources: ' + (missing.length ? missing.join(', ') : 'none'));
  const report = { label: LABEL, missing: missing, when: new Date().toISOString(), gpu: gpu, setup: setup, target: target,
                   frames: frames, fallback: { start: fallbackStart, telemetry: fallbackTelemetry, image: fallbackImage },
                   shots: shots, errors: errs, failures: failures, log: log };
  await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  say('wrote ' + join(outDir, 'report.json'));
  say(failures ? ('FAIL cinematic-blast (' + failures + ')') : 'OK   cinematic-blast');
} finally {
  await closePwBrowser();
  server.close();
}
process.exit(failures ? 1 : 0);
