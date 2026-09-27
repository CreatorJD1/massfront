import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import { sha256File } from './evidence-foundation/fingerprints.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = join(root, 'www');
/* Each capture gets a fresh evidence folder; reruns must never replace a
   prior screenshot/report (including a failed capture). */
const out = join(root, '.tmp', 'stormpeak-ocean-visual-' + new Date().toISOString().replace(/[:.]/g, '-'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
const missing = [];
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const target = resolve(webRoot, `.${name}`);
    if (!target.startsWith(webRoot + sep)) throw new Error('outside www');
    const bytes = await readFile(target);
    res.writeHead(200, { 'content-type': types[extname(target)] || 'application/octet-stream' });
    res.end(bytes);
  } catch {
    missing.push(req.url);
    res.writeHead(404);
    res.end('Not found');
  }
});
const report = { source: 'packed www Ocean Theatre Tester', tier: 'med', viewport: [900, 540], errors: [], contextLost: false, screenshots: [], missing };
let browser, guard;
try {
  await mkdir(out, { recursive: false });
  report.sourceHashes = {};
  for (const file of [
    'world/land.js', 'world/abyss.js', 'objects/seabed.js',
    'ocean/oceanMaterial.js', 'camera/OrbitFollowControls.js', 'StormpeakLab.js'
  ]) report.sourceHashes[file] = await sha256File(join(root, 'modules/stormpeak_ocean/src/lib/ocean', file));
  const manifestPath = 'modules/stormpeak_ocean/dist/stormpeak-runtime-manifest-v1.json';
  report.distManifestHash = await sha256File(join(root, manifestPath));
  report.packedManifestHash = await sha256File(join(webRoot, 'modules/stormpeak_ocean/stormpeak-runtime-manifest-v1.json'));
  if (report.distManifestHash !== report.packedManifestHash) throw new Error('STORMPEAK_SOURCE_PACK_MISMATCH');
  guard = await acquireVerificationFreeze({ root, label: 'short packed Ocean Theatre visual capture', quietMs: 5000 });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  browser = await launchPwBrowser({ ownershipMode: 'isolated' });
  const page = await browser.newPage({ viewport: { width: 900, height: 540 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(`console: ${message.text()}`); });
  page.on('crash', () => { report.errors.push('page crash'); });
  await page.goto(`http://127.0.0.1:${port}/modules/stormpeak_ocean/index.html?tier=med`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  report.gpu = await assertHardwareGpu(page);
  await page.evaluate(() => document.querySelector('canvas')?.addEventListener('webglcontextlost', () => { window.__oceanContextLost = true; }));
  await page.getByText('Tessendorf FFT ocean starting').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(1800);
  report.quality = await page.locator('body').innerText().then(text => text.match(/(?:HIGH|MED|LOW|med|high)/g)?.slice(0, 8) || []);
  await page.screenshot({ path: join(out, 'ocean-default.png') });
  report.screenshots.push('ocean-default.png');
  await page.getByRole('button', { name: 'Ocean' }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'Calm', exact: true }).click();
  await page.getByRole('button', { name: 'Cmd', exact: true }).click();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, 'ocean-command.png') });
  report.screenshots.push('ocean-command.png');
  await page.getByRole('button', { name: 'Sonar' }).click();
  await page.getByRole('button', { name: /Ping/i }).first().click();
  await page.screenshot({ path: join(out, 'ocean-ping.png') });
  report.screenshots.push('ocean-ping.png');
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await page.waitForTimeout(90);
  await page.screenshot({ path: join(out, 'ocean-ping-world-early.png') });
  report.screenshots.push('ocean-ping-world-early.png');
  await page.waitForTimeout(190);
  await page.screenshot({ path: join(out, 'ocean-ping-world-late.png') });
  report.screenshots.push('ocean-ping-world-late.png');
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, 'ocean-ping-retired.png') });
  report.screenshots.push('ocean-ping-retired.png');
  await page.getByRole('button', { name: 'Ocean' }).click();
  await page.getByRole('button', { name: 'Bed', exact: true }).click();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await page.locator('canvas').hover();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 660);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(out, 'ocean-underwater.png') });
  report.screenshots.push('ocean-underwater.png');
  report.contextLost = await page.evaluate(() => !!window.__oceanContextLost);
  await guard.checkpoint('packed Ocean visual capture');
  report.status = report.errors.length || report.contextLost || missing.filter(path => !path.startsWith('/favicon.ico')).length ? 'FAIL' : 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.errors.push(String(error?.stack || error));
} finally {
  if (browser) await closePwBrowser(browser);
  await new Promise(ok => server.close(ok));
  if (guard) {
    try { await guard.release({ assertStable: true, name: 'packed Ocean release' }); }
    catch (error) { report.status = 'FAIL'; report.errors.push(String(error)); }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, ...report }, null, 2));
}
if (report.status !== 'PASS') process.exitCode = 1;
