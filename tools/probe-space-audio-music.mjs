/* Real local entry/click/decode/music-bus probe. No autoplay-policy override,
   simulated AudioContext, external network, or generated replacement audio. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

const root = process.cwd(), packed = process.argv.includes('--packed');
const label = process.argv[2] || 'source-audio';
assert.match(label, /^[a-z0-9-]+$/);
const serveRoot = packed ? resolve(root, 'www') : root;
const out = resolve(root, 'tmp/space-audio-music', label);
await mkdir(resolve(root, 'tmp/space-audio-music'), { recursive: true });
await mkdir(out); // Keep failed attempts; never replace prior evidence.
const files = [
  'index.html', 'boot.js', 'src/launcher.js', 'src/galactic-operations.js',
  'modules/space_exploration/index.html', 'modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/audio/space_audio.js', 'modules/space_exploration/src/startup_content.js',
  'assets/audio/mus_ambient.ogg', 'assets/audio/mus_ambient.m4a'
];
async function hashes(base) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(resolve(base, file))).digest('hex')])));
}
const report = {
  startedAt: new Date().toISOString(), label, packed, serveRoot, viewport: { width: 412, height: 900 },
  verifierSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  scope: 'Real updater -> existing intro -> offline login -> Galactic document -> actual Galaxy button gesture. Persisted-level fixtures exercise the same click refresh path. Forced OGG failure separately proves real AAC fallback decode, not native Safari behavior.',
  errors: [], requests: [], checks: [], pass: false
};
let guard, browser, page, server;
try {
  guard = await acquireVerificationFreeze({ root, label: `Galactic music ${label}`, allowedPaths: [resolve(root, 'tmp'), resolve(root, 'audit')] });
  report.sourceBefore = await hashes(root); report.packageBefore = await hashes(serveRoot);
  if (packed) for (const file of files.filter(path => path.startsWith('modules/') || path.startsWith('assets/'))) {
    assert.equal(report.packageBefore[file], report.sourceBefore[file], `source/package parity: ${file}`);
  }
  server = createServer(async (req, res) => {
    try {
      const path = resolve(serveRoot, '.' + new URL(req.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
      if (relative(serveRoot, path).startsWith('..')) { res.writeHead(403); return res.end(); }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch (_) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
  report.url = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchPwBrowser();
  page = await browser.newPage({ viewport: report.viewport, hasTouch: true, serviceWorkers: 'block' });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (/mus_ambient\.(ogg|m4a)/.test(response.url())) report.requests.push({ url: response.url(), status: response.status() }); });
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) || /^(blob|data):/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  report.gpu = await assertHardwareGpu(page);
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function' && !document.getElementById('mfBootCover'), null, { timeout: 60000 });
  await page.waitForFunction(() => {
    const play = document.getElementById('mfLaunchPlay'), offline = document.getElementById('mfLaunchOffline');
    return play && !play.disabled || offline && !offline.disabled && getComputedStyle(offline).display !== 'none';
  });
  if (await page.locator('#mfLaunchPlay').isEnabled() && /CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText())) await page.locator('#mfLaunchPlay').click();
  else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click(); await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*');
  const ready = async () => {
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  };
  const openGalaxyByUi = async () => {
    const exitUga = page.locator('.uga-command-shell [data-action="exit"]');
    if (await exitUga.isVisible()) await exitUga.click();
    if (await page.locator('#btnCloseGalaxy').isVisible()) await page.locator('#btnCloseGalaxy').click();
    await page.locator('#btnGalaxyMap').click();
  };
  await ready();
  report.beforeGesture = await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__.audio;
    return { runtime: document.getElementById('moduleFrame')?.dataset.runtime, state: audio.ctx?.state || 'not-created', activeMusic: !!audio.activeMusic, scene: audio.scene };
  });
  assert.equal(report.beforeGesture.runtime, 'massfront');
  await openGalaxyByUi();
  async function playing() {
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__.audio.activeMusic?.source?.buffer?.duration > 0, null, { timeout: 30000 });
    return page.evaluate(async () => {
      const audio = window.__MASSFRONT_SPACE__.audio, track = audio.activeMusic, context = audio.ctx;
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; audio.buses.music.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let peakRms = 0;
      const start = context.currentTime;
      try {
        for (let n = 0; n < 100 && peakRms < 0.00001; n++) {
          await new Promise(resolveTick => setTimeout(resolveTick, 80));
          analyser.getFloatTimeDomainData(samples);
          peakRms = Math.max(peakRms, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
        }
      } finally { audio.buses.music.disconnect(analyser); analyser.disconnect(); }
      return { state: context.state, stem: track.stem, loop: track.source.loop, duration: track.source.buffer.duration,
        sampleRate: track.source.buffer.sampleRate, channels: track.source.buffer.numberOfChannels,
        musicLevel: audio.settings.musicLevel, busGain: audio.buses.music.gain.value,
        sourceGain: track.gain.gain.value, contextAdvanced: context.currentTime - start, peakRms,
        pending: !!audio.musicRequest, retiring: audio.retiringMusic.size, scene: audio.scene };
    });
  }
  report.playback = await playing();
  assert.equal(report.playback.state, 'running'); assert.equal(report.playback.stem, 'mus_ambient');
  assert.equal(report.playback.loop, true); assert.ok(report.playback.peakRms > 0.00001);
  assert.ok(report.playback.contextAdvanced > 0); report.checks.push('actual gesture starts decoded approved music with nonzero music-bus RMS');
  await page.evaluate(() => { window.__musicProbeSource = window.__MASSFRONT_SPACE__.audio.activeMusic.source; });
  await page.locator('#btnCloseGalaxy').click();
  await page.locator('#btnUgaCommand').click();
  await page.locator('.uga-command-shell [data-action="exit"]').waitFor({ state: 'visible', timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__MASSFRONT_SPACE__.audio.scene), 'rooms');
  await openGalaxyByUi();
  report.sceneDedup = await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__.audio;
    return { sameSource: audio.activeMusic?.source === window.__musicProbeSource, retiring: audio.retiringMusic.size, scene: audio.scene };
  });
  assert.equal(report.sceneDedup.sameSource, true); assert.equal(report.sceneDedup.retiring, 0); report.checks.push('actual Ship/Galaxy navigation preserves one loop');
  async function settingFixture(values) {
    await page.evaluate(values => {
      const audio = window.__MASSFRONT_SPACE__.audio, key = `massfront_meta_${audio.profileId}`;
      const record = JSON.parse(localStorage.getItem(key) || '{}');
      record.settings = { ...record.settings, audioLevelSteps: 2, ...values }; localStorage.setItem(key, JSON.stringify(record));
    }, values);
    await openGalaxyByUi();
  }
  await settingFixture({ sound: false, sfxVol: 0, music: true, musicVol: 4 });
  report.sfxMuted = await playing(); assert.equal(report.sfxMuted.musicLevel, 1); assert.ok(report.sfxMuted.peakRms > 0.00001);
  await settingFixture({ music: false }); await page.waitForTimeout(450);
  report.muted = await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__.audio;
    return { active: !!audio.activeMusic, retiring: audio.retiringMusic.size, pending: !!audio.musicRequest, music: audio.settings.music };
  });
  assert.equal(report.muted.active, false); assert.equal(report.muted.retiring, 0); assert.equal(report.muted.pending, false);
  await settingFixture({ music: true, musicVol: 2 }); report.unmuted = await playing();
  assert.equal(report.unmuted.musicLevel, 0.5); assert.ok(report.unmuted.peakRms > 0.00001);
  report.checks.push('persisted SFX mute does not mute music; music toggle stops nodes and volume restore restarts one audible bed');
  await page.screenshot({ path: resolve(out, 'galactic-music-runtime.png') });
  await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__.audio, dispose = audio.dispose.bind(audio);
    audio.dispose = () => {
      const context = audio.ctx;
      dispose();
      sessionStorage.setItem('spaceAudioMusicExit', JSON.stringify({ ctxCleared: audio.ctx === null, active: !!audio.activeMusic, pending: !!audio.musicRequest, retiring: audio.retiringMusic.size, oldState: context?.state }));
    };
  });
  await page.goto(report.url, { waitUntil: 'domcontentloaded' });
  report.disposal = await page.evaluate(() => JSON.parse(sessionStorage.getItem('spaceAudioMusicExit')));
  assert.equal(report.disposal.ctxCleared, true); assert.equal(report.disposal.active, false); assert.equal(report.disposal.pending, false); assert.equal(report.disposal.retiring, 0);
  report.checks.push('same-tab exit synchronously clears owned loop, pending start, and mixer');
  /* New document plus actual gesture; only the OGG request is failed. Chrome
     then decodes the real accepted AAC file. This is not a Safari emulator. */
  await page.route('**/assets/audio/mus_ambient.ogg', route => route.abort('failed'));
  await page.goto(`${report.url}modules/space_exploration/index.html`, { waitUntil: 'domcontentloaded' }); await ready();
  await openGalaxyByUi(); report.aacFallback = await playing();
  assert.ok(report.aacFallback.peakRms > 0.00001);
  assert.ok(report.requests.some(item => item.url.endsWith('mus_ambient.m4a') && item.status === 200));
  report.checks.push('forced OGG request failure falls back to actual decoded AAC with nonzero RMS');
  assert.deepEqual(report.errors, []);
  report.sourceAfter = await hashes(root); report.packageAfter = await hashes(serveRoot);
  assert.deepEqual(report.sourceAfter, report.sourceBefore); assert.deepEqual(report.packageAfter, report.packageBefore);
  report.pass = true;
} catch (error) { report.failure = error.stack; }
finally {
  if (browser) await closePwBrowser();
  if (server) await new Promise(resolveClose => server.close(resolveClose));
  if (guard) try { await guard.release({ assertStable: true, name: 'Galactic music verification complete' }); report.freezeStable = true; }
  catch (error) { report.freezeStable = false; report.pass = false; report.freezeFailure = error.stack; }
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass: report.pass, out, checks: report.checks, playback: report.playback, aacFallback: report.aacFallback, failure: report.failure, freezeStable: report.freezeStable }, null, 2));
process.exitCode = report.pass ? 0 : 1;
