/* Verification for the onboarding pass of 2026-08-14.
   One page load, one tab: walks the war table primer across all five stages
   and reports the KEEL step list, so both surfaces are checked in a single
   run rather than a loop of reloads. Screenshots land in audit/screenshots/. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { mkdirSync } from 'fs';

const OUT = 'audit/screenshots';
mkdirSync(OUT, { recursive: true });

const b = await launchPwBrowser();
try {
  const p = await b.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
  p.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8901/');
  await assertHardwareGpu(p);
  await p.waitForTimeout(12000);

  // Fresh-career state: the primer is armed and KEEL's guide is unseen.
  await p.evaluate(() => {
    if (window.META) {
      window.META.warPrimer = { done: false, version: 0 };
      window.META.tutorial = { done: false, skipped: false, version: 0, progress: 0, rewardedVersion: 0 };
    }
  });

  const boot = await p.evaluate(() => ({
    wtp: typeof window.__wtpDebug === 'function' ? window.__wtpDebug().STAGES.map(s => s.id) : null,
    armed: typeof window.__wtpDebug === 'function' ? window.__wtpDebug().armed : null,
    steps: typeof window.__tutDebug === 'function' ? window.__tutDebug().STEPS.map(s => s.id) : null
  }));
  console.log('primer stages :', JSON.stringify(boot.wtp), 'armed=' + boot.armed);
  console.log('keel steps    :', boot.steps && boot.steps.length, JSON.stringify(boot.steps));

  // The attract/intro reveal owns the menu for several seconds after boot and
  // leaves #startBtn present but not clickable. Clear it the same way
  // tools/test-map-sizes.mjs does, then use the real button.
  await p.evaluate(() => {
    if (typeof apGateSatisfied === 'function') apGateSatisfied();
    const ap = document.getElementById('apOverlay'); if (ap) ap.style.display = 'none';
    document.body.classList.add('mfIntroDone');
    const boot = document.getElementById('mfBootCover'); if (boot) boot.remove();
    if (typeof stopAttract === 'function') stopAttract();
    document.querySelectorAll('#introReveal,.introReveal').forEach(e => e.style.display = 'none');
  });
  await p.waitForTimeout(900);
  await p.click('#startBtn');
  await p.waitForTimeout(2500);

  const shot = async (name) => {
    const card = await p.evaluate(() => {
      const c = document.getElementById('wtpCard');
      const panel = document.querySelector('#setupScr .mfStagePanel.on');
      return { stage: panel && panel.dataset.stage, card: !!c, cardStage: c && c.dataset.stage,
               head: c ? c.querySelector('header b').textContent : '' };
    });
    console.log('stage', JSON.stringify(card));
    await p.screenshot({ path: `${OUT}/${name}.png` });
  };

  await shot('v1.34-warprimer-1-galaxy');

  // Advance the route with the war table's own controls, never by calling
  // galaxyui internals — the point is that the card survives its rerenders.
  await p.evaluate(() => { const b = document.querySelector('.mfWorldChip:not(.locked)'); if (b) b.click(); });
  await p.waitForTimeout(1400);
  await shot('v1.34-warprimer-2-system');

  await p.evaluate(() => { const b = document.querySelector('[data-mf-stage="planet"]'); if (b) b.click(); });
  await p.waitForTimeout(1400);
  await shot('v1.34-warprimer-3-planet');

  await p.evaluate(() => { const b = document.querySelector('.mfRegionChip:not(.locked)'); if (b) b.click(); });
  await p.waitForTimeout(1400);
  await shot('v1.34-warprimer-4-region');

  await p.evaluate(() => { const b = document.querySelector('[data-mf-stage="deploy"]'); if (b) b.click(); });
  await p.waitForTimeout(1400);
  await shot('v1.34-warprimer-5-deploy');

  // Dismiss must remove the card and persist, with no reload involved.
  await p.evaluate(() => { const b = document.querySelector('#wtpCard .wtpDone'); if (b) b.click(); });
  await p.waitForTimeout(700);
  console.log('after dismiss :', JSON.stringify(await p.evaluate(() => ({
    card: !!document.getElementById('wtpCard'),
    meta: window.META && window.META.warPrimer
  }))));
} finally {
  await closePwBrowser();
}
