#!/usr/bin/env node
/* STEP 4 OF THE FIVE-CHANNEL CHECKLIST, AS A COMMAND.
 *
 * docs/FIVE_CHANNEL_UPDATE.md: serve www/ on 8901 only - not npm run dev /
 * 8100 - hard-refresh once, and LOOK at the screenshot, because "console-clean
 * is not success". That step is easy to skip when a release is otherwise
 * green, and skipping it is how a packed tree that boots to nothing reaches a
 * channel. This runs it the documented way: the real packed www/ on 8901, a
 * hardware GPU (never SwiftShader), one load, and evidence on disk.
 *
 * Usage: node tools/verify-packed-www-8901.mjs [--out tmp/verify-8901]
 * Exit 0 only when the packed build reaches its front screen.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const outDir = join(root, (argv.indexOf('--out') >= 0 && argv[argv.indexOf('--out') + 1]) || join('tmp', 'verify-8901'));
await mkdir(outDir, { recursive: true });

const PORT = 8901;
const URL_8901 = `http://127.0.0.1:${PORT}/`;

/* serve.mjs already defaults to www/ on 8901 - the documented verify server. */
const server = spawn(process.execPath, [join(root, 'serve.mjs'), 'www', String(PORT)],
  { cwd: root, stdio: 'ignore', windowsHide: true });
const stopServer = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stopServer);

const reachable = async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(URL_8901, { cache: 'no-store' });
      await response.body?.cancel();
      if (response.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};
if (!await reachable()) { stopServer(); throw new Error(`8901 never came up; is www/ packed?`); }

const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
let verdict = { ok: false };
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const consoleErrors = [], pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 300)));
  await page.goto(URL_8901, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await assertHardwareGpu(page);

  /* The pre-alpha cover sits over everything until revealFront() removes it,
     so every rect reads 0x0 before this. polling:250 because the default rAF
     polling never fires on a GPU-busy MASSFRONT page. */
  let reachedFront = true;
  try {
    await page.waitForFunction(
      () => document.body.classList.contains('mfIntroDone') && !document.getElementById('mfBootCover'),
      {}, { timeout: 180000, polling: 250 });
  } catch { reachedFront = false; }

  const probe = await page.evaluate(() => {
    const text = (id) => document.getElementById(id)?.textContent?.trim().slice(0, 120) || null;
    return {
      packagedRev: typeof window.__MASSFRONT_PACKAGED_REV === 'string' ? window.__MASSFRONT_PACKAGED_REV : null,
      appVersion: typeof APP_VERSION === 'string' ? APP_VERSION : null,
      title: document.title,
      bootPhase: text('mfBootPhase'),
      hasCover: !!document.getElementById('mfBootCover'),
      introDone: document.body.classList.contains('mfIntroDone'),
      canvases: document.querySelectorAll('canvas').length,
      visibleButtons: [...document.querySelectorAll('button')]
        .filter(b => b.offsetParent && b.getBoundingClientRect().width > 0).length
    };
  });
  const shot = join(outDir, 'packed-8901.png');
  await page.screenshot({ path: shot });

  verdict = { ok: reachedFront && probe.visibleButtons > 0, reachedFront, shot, probe, consoleErrors, pageErrors };
  await writeFile(join(outDir, 'verdict.json'), JSON.stringify(verdict, null, 2));

  console.log(`packed www/ on ${URL_8901}`);
  console.log(`  APP_VERSION      ${probe.appVersion}`);
  console.log(`  title            ${probe.title}`);
  console.log(`  intro done       ${probe.introDone}   boot cover ${probe.hasCover}`);
  console.log(`  canvases         ${probe.canvases}   visible buttons ${probe.visibleButtons}`);
  console.log(`  console errors   ${consoleErrors.length}`);
  consoleErrors.slice(0, 6).forEach(e => console.log(`    ${e}`));
  console.log(`  page errors      ${pageErrors.length}`);
  pageErrors.slice(0, 6).forEach(e => console.log(`    ${e}`));
  console.log(`  screenshot       ${shot}`);
} finally {
  await closePwBrowser(browser);
  stopServer();
}

if (!verdict.ok) {
  console.error('FAIL packed www/ did not reach a usable front screen on 8901');
  process.exit(1);
}
console.log('PASS packed www/ reaches its front screen on 8901 with a hardware GPU');
