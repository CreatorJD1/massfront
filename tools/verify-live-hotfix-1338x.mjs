/* LIVE ACCEPTANCE FOR THE 1.33.86 HOTFIX.
 *
 * Tests the reported failures against the hosted build, not a local server, and
 * in both engines - the report came from Safari and Chromium passed the whole
 * flow, which is the shape this project's OTA bugs keep taking.
 *
 *   1. The browser build reports the expected version. It was serving 1.33.84
 *      while the update channel advertised something newer, because the Space
 *      publish is a separate step from the OTA release and had been skipped.
 *   2. DEPLOY MASSFRONT still works after entering UGA Command and pressing
 *      Back. Safari restores the page from bfcache with its JavaScript heap
 *      intact, so the one-shot launch latch stayed set and every later tap was
 *      swallowed by the duplicate guard.
 *   3. The update and profile controls on the main menu are reachable.
 *   4. A base-game route opened from the module lands on that screen instead of
 *      being re-swallowed into UGA Command.
 *
 * Usage: node tools/verify-live-hotfix-1338x.mjs [version] [url]
 */
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(pathToFileURL(join(root, 'package.json')).href);
const { webkit } = require('playwright');
/* Chromium has to come through pw-browser.mjs: MASSFRONT refuses to boot
   without WebGL2 on a hardware GPU, and a plain chromium.launch() gets
   SwiftShader and dies at the graphics gate with 9 of 113 scripts loaded.
   WebKit does not take that path, so it launches directly. */
const { launchPwBrowser, closePwBrowser } = await import(pathToFileURL(join(root, 'tools', 'pw-browser.mjs')).href);

const EXPECTED = process.argv[2] || '1.33.86';
const LIVE = process.argv[3] || 'https://creatorjd-massfront-playtest.static.hf.space/';
const outDir = join(root, 'tmp', 'live-hotfix-verify');
await mkdir(outDir, { recursive: true });

const IPHONE = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
};
const ANDROIDISH = { viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, hasTouch: true };

async function enterGame(page) {
  await page.waitForFunction(() => typeof mfLauncherSnapshot === 'function', null, { polling: 250, timeout: 120000 });
  await page.waitForFunction(() => {
    const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline');
    return (p && !p.disabled) || (o && !o.disabled);
  }, null, { polling: 250, timeout: 90000 });
  await page.evaluate(() => {
    const p = document.getElementById('mfLaunchPlay'), o = document.getElementById('mfLaunchOffline');
    (p && !p.disabled ? p : o)?.click();
  });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.getElementById('mfIntroStart')?.click());
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.getElementById('apOfflineBtn')?.click());
  await page.waitForTimeout(9000);
}

async function run(engine, name, contextOptions) {
  const browser = engine === 'gpu-chromium' ? await launchPwBrowser() : await engine.launch({ headless: true });
  const results = [];
  const errors = [];
  const add = (id, pass, detail) => results.push({ id, pass, detail });
  try {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      const t = m.text();
      if (m.type() === 'error' && !/interactive-widget/.test(t)) errors.push('console: ' + t.slice(0, 150));
    });

    await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(7000);

    /* 1. Version */
    const version = await page.evaluate(() => (typeof APP_VERSION !== 'undefined' ? APP_VERSION : null));
    add('version', version === EXPECTED, `reported ${version}, expected ${EXPECTED}`);

    /* 3. Update + profile controls exist on the menu surface */
    const controls = await page.evaluate(() => {
      const probe = id => {
        const el = document.getElementById(id);
        if (!el) return { present: false };
        const r = el.getBoundingClientRect();
        return { present: true, w: Math.round(r.width), h: Math.round(r.height), disabled: Boolean(el.disabled) };
      };
      return { updDot: probe('updDot'), rankEm: probe('rankEm'), metaHead: probe('metaHead') };
    });
    add('update-control', controls.updDot.present && !controls.updDot.disabled, JSON.stringify(controls.updDot));
    add('profile-control', controls.rankEm.present && !controls.rankEm.disabled, JSON.stringify(controls.rankEm));

    /* 2. THE REPORTED BUG: enter the module, come back, press DEPLOY MASSFRONT. */
    await enterGame(page);
    const entered = await page.evaluate(() => location.pathname);
    const inModule = entered.includes('space_exploration');
    add('enters-uga', inModule, `landed on ${entered}`);
    await page.screenshot({ path: join(outDir, `${name}-01-entered.png`) });

    if (inModule) {
      await page.goBack({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(7000);
      const back = await page.evaluate(() => ({
        path: location.pathname,
        latch: typeof mfExplorationLaunching !== 'undefined' ? mfExplorationLaunching : 'out-of-scope',
        startBtn: (() => {
          const b = document.getElementById('startBtn');
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), launching: b.classList.contains('is-launching'), busy: b.hasAttribute('aria-busy') };
        })()
      }));
      add('back-restores-menu', !back.path.includes('space_exploration'), `back landed on ${back.path}`);
      add('latch-cleared', back.latch === false || back.latch === 'out-of-scope',
        `mfExplorationLaunching = ${back.latch} (true here is the reported dead-button bug)`);
      add('button-not-stuck', !back.startBtn || (!back.startBtn.launching && !back.startBtn.busy),
        JSON.stringify(back.startBtn));
      await page.screenshot({ path: join(outDir, `${name}-02-after-back.png`) });

      /* Press it. It must do something observable: navigate back into the
         module, or open the local War Room fallback. Silence is the bug. */
      const before = await page.evaluate(() => location.href + '|' + ([...document.querySelectorAll('[id$="Scr"]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id).join(',')));
      await page.evaluate(() => document.getElementById('startBtn')?.click());
      await page.waitForTimeout(9000);
      const after = await page.evaluate(() => ({
        key: location.href + '|' + ([...document.querySelectorAll('[id$="Scr"]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id).join(',')),
        inModule: location.pathname.includes('space_exploration'),
        screens: [...document.querySelectorAll('[id$="Scr"]')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id)
      }));
      add('deploy-massfront-responds', before !== after.key,
        after.inModule ? 're-entered UGA Command' : `opened ${JSON.stringify(after.screens)}`);
      await page.screenshot({ path: join(outDir, `${name}-03-after-deploy.png`) });
    }

    /* 4. A base route opened from inside the module must land on its screen. */
    await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(7000);
    await enterGame(page);
    if (await page.evaluate(() => location.pathname.includes('space_exploration'))) {
      await page.evaluate(() => document.querySelector('.uga-command-nav [data-nav="more"]')?.click());
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const s = document.querySelector('.uga-command-shell');
        if (s && !s.classList.contains('is-sheet-expanded')) document.querySelector('.uga-sheet-toggle')?.click();
      });
      await page.waitForTimeout(1500);
      const opened = await page.evaluate(() => {
        const el = document.querySelector('[data-hub-route="settings"]');
        if (!el || el.disabled) return false;
        el.click();
        return true;
      });
      await page.waitForTimeout(10000);
      const landed = await page.evaluate(() => ({
        screens: [...document.querySelectorAll('[id$="Scr"], #armory')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 80).map(e => e.id),
        inModule: location.pathname.includes('space_exploration')
      }));
      add('base-route-lands', opened && !landed.inModule && landed.screens.includes('settingsScr'),
        `screens ${JSON.stringify(landed.screens)} inModule=${landed.inModule}`);
      await page.screenshot({ path: join(outDir, `${name}-04-settings.png`) });
    }

    add('no-page-errors', errors.length === 0, errors.length ? [...new Set(errors)].slice(0, 3).join(' | ') : 'clean');
    await page.close();
  } finally {
    if (engine === 'gpu-chromium') await closePwBrowser(browser); else await browser.close();
  }
  return { engine: name, results, errors: [...new Set(errors)] };
}

const report = [];
report.push(await run('gpu-chromium', 'chromium', ANDROIDISH));
report.push(await run(webkit, 'webkit-iphone', IPHONE));
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));

let failed = 0;
for (const engine of report) {
  console.log('');
  console.log(`=== ${engine.engine} ===`);
  for (const r of engine.results) {
    if (!r.pass) failed += 1;
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(26)} ${r.detail}`);
  }
}
console.log('');
if (failed) throw new Error(`live hotfix acceptance: ${failed} check(s) failed`);
console.log(`live hotfix acceptance: PASS (${EXPECTED} on ${LIVE})`);
