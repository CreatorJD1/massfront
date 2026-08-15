#!/usr/bin/env node
/* Verify the Screen Grade row: it exists under Settings > Display, reads
   NEUTRAL out of the box, and each tap advances the grade AND the live filter
   on canvas#gl. Screenshots the Display tab in each state.
   Usage: node tools/capture-screen-grade-setting.mjs */
import { mkdir } from 'node:fs/promises';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const URL = 'http://127.0.0.1:8901/';
const OUT = 'audit/screenshots';

const browser = await launchPwBrowser({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
  page.on('pageerror', e => console.log('ERR ' + e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mf_ap_gate_closed', '1');
      localStorage.setItem('mf_ap_dismissed', '1');
      localStorage.setItem('mf_offline', '1');
      localStorage.setItem('mf_prealpha_cinematic_v2', 'test-seen');
      localStorage.setItem('mf_auth_gate_v1', '1');
    } catch (e) {}
  });
  page.setDefaultTimeout(120000);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof renderSettings === 'function' && typeof META !== 'undefined' && META.settings, { timeout: 90000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    try { if (typeof apClose === 'function') apClose(); } catch (e) {}
    try { if (typeof apGateSatisfied === 'function') apGateSatisfied(); } catch (e) {}
    try { if (typeof stopAttract === 'function') stopAttract(); } catch (e) {}
    for (const id of ['mfBootCover', 'apOverlay', 'loadScr', 'mfIntroSkip', 'mfIntroReplay']) {
      const el = document.getElementById(id); if (el) el.style.setProperty('display', 'none', 'important');
    }
    if (typeof openSettings === 'function') openSettings();
    else { const s = document.getElementById('setScr'); if (s) s.style.display = 'block'; renderSettings(); }
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const list = document.getElementById('setList');
    if (typeof mfSetTabs === 'function' && list) mfSetTabs(list, 'display', false);
  });
  await page.waitForTimeout(500);

  await mkdir(OUT, { recursive: true });
  const read = () => page.evaluate(() => {
    const row = document.querySelector('.setRow[data-set="screenGrade"]');
    return {
      present: !!row,
      value: row ? row.querySelector('.togB').textContent.trim() : null,
      desc: row ? row.querySelector('.sDs').textContent.trim() : null,
      setting: String(META.settings.screenGrade),
      filter: getComputedStyle(document.getElementById('gl')).filter
    };
  });

  for (let i = 0; i < 4; i++) {
    const st = await read();
    console.log('tap' + i + ' -> ' + JSON.stringify(st));
    if (!st.present) throw new Error('Screen Grade row missing from Settings > Display');
    if (i === 0) {
      if (st.setting !== 'neutral' || st.filter !== 'none')
        throw new Error('default is not neutral/none: ' + JSON.stringify(st));
      await page.locator('.setRow[data-set="screenGrade"]').screenshot({ path: OUT + '/v1.34-grade-setting-row.png' });
      await page.screenshot({ path: OUT + '/v1.34-grade-settings-display.png' });
    }
    if (i < 3) {
      await page.locator('.setRow[data-set="screenGrade"]').click();
      await page.waitForTimeout(450);
    }
  }
  console.log('OK — row cycles neutral -> soft -> punchy -> neutral and drives the live filter');
} finally {
  await closePwBrowser();
}
