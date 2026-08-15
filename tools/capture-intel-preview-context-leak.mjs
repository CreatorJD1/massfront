/* WebGL context-budget harness for the LIVE 3D intel preview cards.
   Opens and closes far more preview cards than Chrome's per-page WebGL context
   budget (16) allows, and reports, per cycle:
     - how many webgl2 contexts the page has created
     - whether the BATTLEFIELD context (#gl, the oldest) has been lost
     - whether glrecover's GRAPHICS PAUSED card is on screen
     - how black the ground actually is, measured from a real screenshot
   Run with --tag before|after. Real GPU only: refuses swiftshader.  */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const tag = (args.find(a => a.startsWith('--tag=')) || '--tag=run').slice(6);
const CARDS_PER_CYCLE = 6;
const CYCLES = +((args.find(a => a.startsWith('--cycles=')) || '--cycles=9').slice(9));
const outDir = resolve(args.find(a => a.startsWith('--out=')) ? args.find(a => a.startsWith('--out=')).slice(6)
  : join(root, 'audit', 'intel-context-leak'));

const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ogg':'audio/ogg', '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.wasm':'application/wasm',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.webmanifest':'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    /* join() hands back backslashes on Windows; resolve() both sides or the
       startsWith guard rejects every path and the server 404s the whole game. */
    const file = resolve(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
const PORT = 8993;
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

await mkdir(outDir, { recursive: true });

const browser = await launchPwBrowser({
  headless: false,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-sandbox']
});

const log = [];
const say = s => { console.log(s); log.push(s); };

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 780 }, deviceScaleFactor: 1, colorScheme: 'dark' });

  await page.addInitScript(() => {
    try { localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1'); localStorage.setItem('mf_offline','1'); } catch {}
    /* Count webgl2 contexts without pinning them: a strong ref would stop GC and
       would flatter any fix that relies on collection. */
    window.__glCtx = { made: 0, refs: [], where: {} };
    const seen = new WeakSet();     // getContext() on the SAME canvas returns the SAME context: count once
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const ctx = orig.call(this, type, ...rest);
      if (ctx && /webgl/.test(String(type)) && !seen.has(ctx)) {
        seen.add(ctx);
        window.__glCtx.made++;
        try { window.__glCtx.refs.push(new WeakRef(ctx)); } catch {}
        // who asked for it? top non-wrapper frame, so a per-card leak is nameable
        try {
          const f = (new Error().stack || '').split('\n').slice(2, 4).join(' | ').replace(/https?:\/\/[^ )]*\//g, '');
          window.__glCtx.where[f] = (window.__glCtx.where[f] || 0) + 1;
        } catch {}
      }
      return ctx;
    };
  });

  const consoleHits = [];
  page.on('console', m => {
    const t = m.text();
    if (/Too many active WebGL contexts|context lost|WARNING: Too many/i.test(t)) consoleHits.push(t);
  });
  page.on('pageerror', e => say('PAGE ERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas'), g = c.getContext('webgl2');
    if (!g) return 'NO-WEBGL2';
    const d = g.getExtension('WEBGL_debug_renderer_info');
    const r = d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    const ext = g.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    return String(r);
  });
  say('UNMASKED_RENDERER_WEBGL: ' + renderer);
  if (/swiftshader|software|llvmpipe/i.test(renderer)) throw new Error('REFUSING: software renderer -> ' + renderer);

  await page.waitForFunction(() => typeof render === 'function' && typeof UNIT_GEO !== 'undefined' && !!UNIT_GEO[1] && typeof mfIntelPreviewWindow === 'function', { timeout: 90000 });
  await page.waitForTimeout(1200);

  // ---- put a real battlefield on screen so "the ground goes black" is measurable
  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch {}
    try { if (typeof stopAttract === 'function') stopAttract(); } catch {}
    try { if (typeof resetWorld === 'function') resetWorld(); } catch {}
    try { attractOn = false; } catch {}
    demoMode = true; matchLive = true; fogOn = false; running = true; paused = true;
    try { gameEnded = false; } catch {}
    document.body.className = 'mfIntroDone';
    for (const el of [...document.body.children]) if (el.id !== 'gl') el.style.display = 'none';
    const cv = document.getElementById('gl');
    cv.style.display = 'block'; cv.style.position = 'fixed'; cv.style.inset = '0';
    cv.style.width = '100vw'; cv.style.height = '100vh'; cv.style.filter = 'none';
    if (typeof resize === 'function') resize();
    cam.x = MAP * 0.5; cam.y = MAP * 0.5;
    orthoSpan = distTarget = 420;
    if (typeof clampCam === 'function') clampCam();
    if (typeof camUpdateMatrices === 'function') camUpdateMatrices();
    // keep the battlefield painting every frame regardless of the sim pause
    window.__battlePump = () => { try { render(); } catch (e) {} requestAnimationFrame(window.__battlePump); };
    requestAnimationFrame(window.__battlePump);

    // host strip for the churned preview cards, on top of the battlefield
    const host = document.createElement('div');
    host.id = '__previewHost';
    host.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;display:flex;gap:8px;flex-wrap:wrap;width:880px';
    document.body.appendChild(host);
  });
  await page.waitForTimeout(900);

  const GROUND = { x: 150, y: 60, width: 600, height: 420 };
  const CARDSTRIP = { x: 8, y: 780 - 8 - 130, width: 880, height: 130 };

  /* Measure real composited pixels: screenshot -> decode in the page -> stats.
     drawImage() straight off a live WebGL canvas can read an already-composited
     (cleared) drawing buffer, which would silently score a working card as blank. */
  const measure = async (clip, name) => {
    const buf = await page.screenshot({ clip });   // Playwright always returns a Buffer
    const b64 = buf.toString('base64');
    if (name) await writeFile(join(outDir, name), buf);
    return page.evaluate(async src => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = 'data:image/png;base64,' + src; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, lit = 0, n = d.length / 4; const seen = new Set();
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        sum += l; if (l > 18) lit++;
        if (i % 400 === 0) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
      }
      return { mean: +(sum / n).toFixed(2), litFrac: +(lit / n).toFixed(4), colors: seen.size };
    }, b64);
  };

  const probe = () => page.evaluate(() => {
    const cv = document.getElementById('gl');
    let lost = null;
    try { const g = cv.getContext('webgl2'); lost = g ? g.isContextLost() : 'no-ctx'; } catch (e) { lost = 'throw:' + e.message; }
    const card = document.getElementById('glrCard') || document.getElementById('glLostOverlay');
    return {
      made: window.__glCtx.made,
      lost,
      glrLost: (typeof glrLost !== 'undefined') ? glrLost : null,
      pausedCard: card ? (card.textContent || '').slice(0, 40) : '',
      views: (typeof mfIntel3DViews !== 'undefined') ? mfIntel3DViews.length : -1
    };
  });

  const base = await probe();
  const groundBase = await measure(GROUND, `${tag}-00-ground-baseline.png`);
  say(`[${tag}] baseline: contexts=${base.made} battlefieldLost=${base.lost} ground=${JSON.stringify(groundBase)}`);

  const rows = [];
  let firstLossAt = -1;
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    await page.evaluate(n => {
      /* The auth portal fades in a few seconds after boot and dims everything
         behind it, which would show up as "the ground went dark" and mask the
         real signal. Re-hide anything that is not the battlefield or the strip. */
      for (const el of [...document.body.children])
        if (el.id !== 'gl' && el.id !== '__previewHost') el.style.display = 'none';
      const host = document.getElementById('__previewHost');
      for (let i = 0; i < n; i++) {
        const kinds = [['unit', 1], ['unit', 3], ['building', 'turret'], ['unit', 5], ['building', 'techlab'], ['building', 'aatower']];
        const s = kinds[i % kinds.length];
        const w = mfIntelPreviewWindow(s[0], s[1], 'LIVE 3D', 'nova');
        w.style.cssText = 'width:132px;height:112px;flex:0 0 auto';
        host.appendChild(w);
      }
    }, CARDS_PER_CYCLE);
    // let the rAF constructor run and the cards paint a few frames
    await page.waitForTimeout(320);

    const openProbe = await probe();
    const cardShot = await measure(CARDSTRIP, `${tag}-c${String(cycle).padStart(2, '0')}-cards.png`);

    await page.evaluate(() => { document.getElementById('__previewHost').replaceChildren(); });
    await page.waitForTimeout(260);   // pump notices the disconnect and disposes

    const p = await probe();
    const ground = await measure(GROUND, `${tag}-c${String(cycle).padStart(2, '0')}-ground.png`);
    const opened = cycle * CARDS_PER_CYCLE;
    rows.push({ cycle, opened, ...p, ground, cards: cardShot });
    say(`[${tag}] cycle ${cycle} (cards opened+closed so far: ${opened}) contexts=${p.made} live3DViews=${p.views} `
      + `battlefieldLost=${p.lost} glrLost=${p.glrLost} card="${p.pausedCard}" `
      + `ground(mean=${ground.mean} lit=${ground.litFrac} colors=${ground.colors}) `
      + `cards(mean=${cardShot.mean} lit=${cardShot.litFrac} colors=${cardShot.colors})`);
    if (p.lost === true && firstLossAt < 0) {
      firstLossAt = opened;
      await page.screenshot({ path: join(outDir, `${tag}-LOSS-fullpage.png`) });
      say(`[${tag}] *** BATTLEFIELD CONTEXT LOST after ${opened} preview cards — full page shot saved`);
      break;
    }
  }

  say(`[${tag}] console "Too many active WebGL contexts" hits: ${consoleHits.length}`);
  for (const h of consoleHits.slice(0, 4)) say(`[${tag}]   ${h}`);

  const where = await page.evaluate(() => window.__glCtx.where);
  say(`[${tag}] webgl context creators (count x call site):`);
  for (const [k, v] of Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 8)) say(`[${tag}]   ${v} x ${k.trim()}`);

  // Final render check: leave a strip of cards up and photograph them.
  await page.evaluate(() => {
    const host = document.getElementById('__previewHost');
    host.replaceChildren();
    const kinds = [['unit', 1], ['unit', 3], ['building', 'turret'], ['unit', 5], ['building', 'techlab'], ['building', 'aatower']];
    for (const s of kinds) {
      const w = mfIntelPreviewWindow(s[0], s[1], String(s[1]).toUpperCase(), 'nova');
      w.style.cssText = 'width:132px;height:112px;flex:0 0 auto';
      host.appendChild(w);
    }
  });
  await page.waitForTimeout(900);
  const finalCards = await measure(CARDSTRIP, `${tag}-FINAL-cards.png`);
  const finalGround = await measure(GROUND, `${tag}-FINAL-ground.png`);
  await page.screenshot({ path: join(outDir, `${tag}-FINAL-fullpage.png`) });
  const end = await probe();
  say(`[${tag}] FINAL contexts=${end.made} battlefieldLost=${end.lost} `
    + `cards(mean=${finalCards.mean} lit=${finalCards.litFrac} colors=${finalCards.colors}) `
    + `ground(mean=${finalGround.mean} lit=${finalGround.litFrac} colors=${finalGround.colors})`);

  /* If the ONE preview context is ever lost anyway, the cards must come back
     rather than sit dead. Force it and look. */
  let restore = null;
  const hasShared = await page.evaluate(() => typeof mfIntel3DSurf !== 'undefined' && !!mfIntel3DSurf);
  if (hasShared) {
    await page.evaluate(() => { window.__lc = mfIntel3DGL.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
    await page.waitForTimeout(400);
    const dead = await measure(CARDSTRIP, `${tag}-LOSE-cards.png`);
    await page.evaluate(() => window.__lc.restoreContext());
    await page.waitForTimeout(1200);
    const back = await measure(CARDSTRIP, `${tag}-RESTORE-cards.png`);
    /* A frozen last frame looks identical to a live one in a still, so prove
       the views actually came back: buffers rebuilt, and pixels moving. */
    const revived = await page.evaluate(async () => {
      const grab = () => [...document.querySelectorAll('#__previewHost canvas')].map(c => c.toDataURL().length);
      const a = grab();
      await new Promise(r => setTimeout(r, 400));
      const b = grab();
      return {
        parts: mfIntel3DViews.map(V => V.parts.length),
        programs: mfIntel3DViews.map(V => !!V.program),
        moving: a.filter((v, i) => v !== b[i]).length + '/' + a.length
      };
    });
    say(`[${tag}] after restore: view parts=${JSON.stringify(revived.parts)} programs=${JSON.stringify(revived.programs)} cards animating=${revived.moving}`);
    restore = { dead, back, revived };
    say(`[${tag}] shared preview context lost -> cards(mean=${dead.mean} lit=${dead.litFrac}); restored -> cards(mean=${back.mean} lit=${back.litFrac} colors=${back.colors})`);
    const still = await probe();
    say(`[${tag}] after forced preview-context loss: battlefieldLost=${still.lost} contexts=${still.made}`);
  }

  /* The STILL-thumbnail path shares the same renderer and ends in toDataURL();
     a blank PNG there would be an invisible regression in the build menu. */
  const thumbs = await page.evaluate(async () => {
    const host = document.getElementById('__previewHost');
    const subs = [['unit', 1], ['unit', 5], ['building', 'turret'], ['building', 'techlab']];
    const out = [];
    for (const s of subs) {
      const holder = document.createElement('div'); holder.style.cssText = 'width:52px;height:44px';
      const img = document.createElement('img'); holder.appendChild(img); host.appendChild(holder);
      mfIntelThumbRequest(img, holder, s[0], s[1], 'nova');
      out.push({ key: mfIntelThumbKey(s[0], s[1], 'nova'), img });
    }
    await new Promise(r => setTimeout(r, 1400));
    const res = [];
    for (const o of out) {
      const url = mfIntelThumbCache.get(o.key) || '';
      let lit = 0, w = 0, h = 0;
      if (url) {
        const im = new Image();
        await new Promise(ok => { im.onload = ok; im.onerror = ok; im.src = url; });
        w = im.width; h = im.height;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, w, h).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 24) lit++;
        lit = +(lit / (w * h)).toFixed(3);
      }
      res.push({ key: o.key, bytes: url.length, w, h, opaqueFrac: lit });
    }
    return res;
  });
  for (const t of thumbs) say(`[${tag}] thumbnail ${t.key}: ${t.bytes} b, ${t.w}x${t.h}, opaque ${t.opaqueFrac}`);

  await writeFile(join(outDir, `${tag}-result.json`), JSON.stringify({
    tag, renderer, cardsPerCycle: CARDS_PER_CYCLE, cycles: CYCLES, firstLossAt,
    consoleHits, where, restore, thumbs, baseline: { ...base, ground: groundBase }, rows,
    final: { ...end, cards: finalCards, ground: finalGround }, log
  }, null, 2));
  say(`[${tag}] artifacts -> ${outDir}`);
} catch (err) {
  say('HARNESS FAILED: ' + (err && err.stack || err));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
