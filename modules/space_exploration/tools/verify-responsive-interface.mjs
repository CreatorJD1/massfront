import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(moduleRoot, 'tmp', 'responsive-interface-audit');
const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8997/modules/space_exploration/index.html';
await mkdir(output, { recursive: true });

const viewports = [
  ['phone-portrait', 430, 932],
  ['phone-landscape', 932, 430],
  ['tablet-portrait', 820, 1180],
  ['tablet-landscape', 1180, 820],
  ['desktop-1440', 1440, 900],
  ['desktop-1920', 1920, 1080],
  ['foldable-narrow', 360, 740]
];

const errors = [];
const captures = [];
const browser = await launchPwBrowser();
let page;

async function settle(ms = 220) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function audit(label, viewportName) {
  const result = await page.evaluate(({ label, viewportName }) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const scrollClips = element => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const controls = [...document.querySelectorAll('button, select, input, [role="button"]')].filter(visible);
    const undersized = [];
    const clipped = [];
    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute('aria-label') || element.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) || element.id || element.tagName;
      const delegatedCheckbox = element.matches('input[type="checkbox"]') && element.closest('label')?.getBoundingClientRect().height >= 44;
      if (!delegatedCheckbox && (rect.width < 44 || rect.height < 44)) undersized.push({ label, width: +rect.width.toFixed(1), height: +rect.height.toFixed(1) });
      if (!scrollClips(element) && (rect.left < -1 || rect.top < -1 || rect.right > width + 1 || rect.bottom > height + 1)) clipped.push({ label, rect: [rect.left, rect.top, rect.right, rect.bottom].map(value => +value.toFixed(1)) });
    }
    const root = document.documentElement;
    return {
      label,
      viewportName,
      viewport: [width, height],
      controlCount: controls.length,
      undersized,
      clipped,
      pageOverflow: { x: Math.max(0, root.scrollWidth - width), y: Math.max(0, root.scrollHeight - height) },
      scene: document.querySelector('#moduleFrame')?.dataset.scene || '',
      contextLost: window.__MASSFRONT_SPACE__?.engine?.renderer?.getContext?.().isContextLost() ?? true
    };
  }, { label, viewportName });
  return result;
}

async function capture(viewportName, label) {
  await settle();
  const path = join(output, `${viewportName}--${label}.png`);
  await page.screenshot({ path });
  const result = await audit(label, viewportName);
  captures.push({ ...result, path });
}

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 20_000 });
  await page.evaluate(async () => {
    const domain = await import('./src/domain/index.js');
    localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(domain.createShowcaseReadyDomainState()));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 20_000 });

  for (const [viewportName, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openSystem());
    await capture(viewportName, 'system-autopilot');
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openGalaxy());
    await capture(viewportName, 'galaxy');
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openSystem());
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openSurvey());
    await capture(viewportName, 'survey');
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openUga());
    await page.waitForSelector('.uga-command-shell:not([hidden])');
    await capture(viewportName, 'uga-overview');

    for (const [deck, district] of [['A', 'navigation'], ['B', 'research'], ['C', 'hangar']]) {
      await page.click(`[data-deck-filter="${deck}"]`);
      await page.click(`button[data-district="${district}"]`);
      // UGA focus transitions run for 920 ms. A responsive screenshot taken
      // during that tween is useful for motion debugging but invalid as a
      // visual-quality comparison of the selected room.
      await settle(900);
      await capture(viewportName, `deck-${deck.toLowerCase()}-${district}`);
    }
    for (const [view, selector] of [
      ['missions', '[data-nav="missions"]'],
      ['crew', '[data-nav="crew"]'],
      ['logistics', '[data-nav="more"]'],
      ['research', '[data-quick="research"]'],
      ['construction', '[data-quick="construction"]']
    ]) {
      await page.evaluate(selector => document.querySelector(selector)?.click(), selector);
      await capture(viewportName, view);
    }
    await page.click('[data-deck-filter="A"]');
    await page.click('button[data-district="command"]');
    await capture(viewportName, 'classic-terminal');
  }

  const summary = {
    gpu,
    url,
    captureCount: captures.length,
    runtimeErrors: [...new Set(errors)],
    clipping: captures.reduce((sum, item) => sum + item.clipped.length, 0),
    undersizedControls: captures.reduce((sum, item) => sum + item.undersized.length, 0),
    overflow: captures.reduce((sum, item) => sum + Number(item.pageOverflow.x > 0 || item.pageOverflow.y > 0), 0),
    contextLosses: captures.filter(item => item.contextLost).length,
    captures
  };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    captureCount: summary.captureCount,
    runtimeErrors: summary.runtimeErrors.length,
    clipping: summary.clipping,
    undersizedControls: summary.undersizedControls,
    overflow: summary.overflow,
    contextLosses: summary.contextLosses,
    output
  }, null, 2));
  if (summary.runtimeErrors.length || summary.clipping || summary.undersizedControls || summary.overflow || summary.contextLosses) process.exitCode = 1;
} finally {
  if (page) await page.close();
  await Promise.race([closePwBrowser(), new Promise(resolve => setTimeout(resolve, 5000))]);
}
process.exit(process.exitCode || 0);
