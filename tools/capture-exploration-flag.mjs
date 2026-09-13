#!/usr/bin/env node
/* Before/after evidence for the Settings-only Galactic preview.
   Boots the real game, screenshots Gameplay settings at four form factors with
   the opt-in OFF and ON, and proves no Galactic destination enters the base
   main menu. Output: .tmp/exploration-flag/{off,on}-<size>.png

       node tools/capture-exploration-flag.mjs

   The OPEN action stays in Settings and performs a launch-time module probe. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRepositoryFingerprint, readRuntimeFingerprint, sha256 } from './interface-audit/verify-interface-matrix.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'exploration-flag');
await mkdir(outDir, { recursive: true });

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.wav':'audio/wav',
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
const url = 'http://127.0.0.1:' + server.address().port + '/';

const SIZES = [
  { name: 'phone-portrait',  w: 412, h: 915 },
  { name: 'phone-landscape', w: 915, h: 412 },
  { name: 'tablet',          w: 834, h: 1112 },
  { name: 'desktop',         w: 1440, h: 900 },
];

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await launchPwBrowser({
  executablePath: existsSync(chrome) ? chrome : undefined, headless: true,
  args: ['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'],
});

const source=await readRepositoryFingerprint(root);
const runtime=await readRuntimeFingerprint(root);
const out = { schema:'massfront.exploration-settings-evidence/v1', when: new Date().toISOString(), source, runtime,
  sourceAtCompletion:null, runtimeAtCompletion:null, shots: [], errors: [] };
try {
  for (const state of ['off', 'on']) {
    for (const s of SIZES) {
      const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, colorScheme: 'dark' });
      page.on('pageerror', e => out.errors.push(state + '/' + s.name + ': ' + e.message.slice(0, 160)));
      await page.addInitScript(() => { try {
        localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1');
        localStorage.setItem('mf_offline','1'); localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
        localStorage.setItem('mf_auth_gate_v1','1');
      } catch (e) {} });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => typeof META !== 'undefined' && !!document.getElementById('startScreen'),
        null, { timeout: 120000 }).catch(() => {});
      /* Exercise the real launch-title dismissal. Hiding a node before
         initIntro() creates it is a race on slower phone-sized boots and can
         leave the menu behind the reveal while still producing a PNG. */
      await page.waitForFunction(() => !document.getElementById('mfBootCover') || !!document.getElementById('mfIntroSkip'),
        null, { timeout: 120000 });
      if (await page.locator('#mfBootCover').count()) {
        await page.locator('#mfIntroSkip').click({ timeout: 30000 });
        await page.waitForFunction(() => !document.getElementById('mfBootCover'), null, { timeout: 30000 });
      }
      await page.evaluate(() => {
        try { if (typeof apClose === 'function') apClose(); } catch (e) {}
        try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
        try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
        document.body.classList.add('mfIntroDone');
        for (const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay']) {
          const el = document.getElementById(id); if (el) el.style.setProperty('display','none','important');
        }
      });
      await page.evaluate(want => {
        if (typeof META !== 'undefined' && META.settings) META.settings.experimentalExploration = want;
        if (typeof applySettings === 'function') { try { applySettings(); } catch (e) {} }
        try { if (typeof renderMetaHead === 'function') renderMetaHead(); } catch (e) {}
        document.querySelectorAll('.mfTitleReveal').forEach(el => el.style.setProperty('display','none','important'));
        if (typeof openSettings === 'function') { try { openSettings('menu'); } catch (e) {} }
        else {
          if (typeof renderSettings === 'function') { try { renderSettings(); } catch (e) {} }
          if (typeof showFrontScreen === 'function') { try { showFrontScreen('settingsScr'); } catch (e) {} }
        }
      }, state === 'on');
      await page.locator('#setTab-battle').click({ timeout: 30000 });
      await page.waitForFunction(want => {
        const toggle=document.querySelector('[data-set="experimentalExploration"]');
        const open=document.querySelector('[data-set="openExperimentalExploration"]');
        return !!(toggle&&(toggle.offsetWidth||toggle.offsetHeight))
          &&(want?!!(open&&(open.offsetWidth||open.offsetHeight)):!open);
      }, state === 'on', { timeout: 30000 });
      if (state === 'on') await page.locator('[data-set="openExperimentalExploration"]').scrollIntoViewIfNeeded();
      const info = await page.evaluate(async () => {
        const toggle=document.querySelector('[data-set="experimentalExploration"]');
        const open=document.querySelector('[data-set="openExperimentalExploration"]');
        let probe = null;
        try { probe = (await fetch('./modules/space_exploration/index.html', { method:'HEAD' })).ok; }
        catch (e) { probe = false; }
        return { setting: !!(META && META.settings && META.settings.experimentalExploration),
                 mainMenuEntry: !!document.querySelector('#startScreen #exploreBtn'),
                 toggleVisible: !!(toggle&&(toggle.offsetWidth||toggle.offsetHeight)),
                 openPresent: !!open,
                 openVisible: !!(open&&(open.offsetWidth||open.offsetHeight)), probe };
      });
      await page.waitForTimeout(300);
      const name = state + '-' + s.name + '.png';
      const png=await page.screenshot({ type: 'png', animations: 'disabled', timeout: 120000 });
      await writeFile(join(outDir, name), png);
      info.evidence={path:join(outDir,name),bytes:png.length,sha256:sha256(png),width:s.w*2,height:s.h*2};
      if(state==='on'&&s.name==='phone-portrait'){
        await Promise.all([
          page.waitForURL(/\/modules\/space_exploration\/index\.html(?:[?#].*)?$/, { timeout: 30000 }),
          page.locator('[data-set="openExperimentalExploration"]').click({ timeout: 30000 })
        ]);
        info.launchRouted=/\/modules\/space_exploration\/index\.html(?:[?#].*)?$/.test(page.url());
      }
      out.shots.push({ name, state, size: s.name, ...info });
      console.log(`${name.padEnd(28)} setting=${info.setting} settingsOpen=${info.openVisible} mainMenuEntry=${info.mainMenuEntry}`);
      await page.close();
    }
  }
  out.sourceAtCompletion=await readRepositoryFingerprint(root);
  out.runtimeAtCompletion=await readRuntimeFingerprint(root);
  await writeFile(join(outDir, 'report.json'), JSON.stringify(out, null, 2));
  console.log('\nerrors: ' + (out.errors.length ? out.errors.join(' | ') : 'none'));
  console.log('output: ' + outDir);
  const invalid=out.errors.length||out.shots.some(shot=>shot.mainMenuEntry||!shot.toggleVisible
    ||(shot.state==='off'&&shot.openPresent)||(shot.state==='on'&&!shot.openVisible))
    ||!out.shots.some(shot=>shot.state==='on'&&shot.size==='phone-portrait'&&shot.launchRouted)
    ||source.head!==out.sourceAtCompletion.head||source.dirtyFingerprint!==out.sourceAtCompletion.dirtyFingerprint
    ||runtime.fingerprint!==out.runtimeAtCompletion.fingerprint;
  if(invalid) process.exitCode=1;
} finally {
  await closePwBrowser();
  server.close();
}
