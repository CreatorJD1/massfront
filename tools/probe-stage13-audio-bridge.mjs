import assert from 'node:assert/strict';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { loadProductionCommanderRosterSnapshot } from '../modules/space_exploration/tools/tests/production-commander-roster.fixture.mjs';

const browser = await launchPwBrowser();
const productionRoster = await loadProductionCommanderRosterSnapshot();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8901/modules/space_exploration/index.html', { waitUntil: 'domcontentloaded' });
  await assertHardwareGpu(page);
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.locator('#btnGalaxyMap').click();
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__?.audio;
    return {
      runtime: document.querySelector('#moduleFrame')?.dataset.runtime,
      hasContext: Boolean(audio?.ctx),
      hasMaster: Boolean(audio?.master),
      busNames: audio?.buses ? Object.keys(audio.buses).sort() : [],
      external: Boolean(audio?.external),
      documentFallback: Boolean(audio?.allowDocumentFallback)
    };
  });
  assert.equal(state.runtime, 'sandbox');
  assert.equal(state.documentFallback, true);
  assert.equal(state.hasContext, true, 'a real tap did not unlock the contained standalone mixer');
  assert.equal(state.hasMaster, true);
  assert.deepEqual(state.busNames, ['ambience', 'music', 'sfx', 'voice']);

  await page.evaluate(async commanderRosterSnapshot => {
    const host = await import('/modules/space_exploration/src/host/massfront_solo_host.js');
    const profileId = 'stage13-audio-probe';
    const ticket = host.createMassfrontGalacticEntryTicket(profileId, {
      entryView: 'campaign_hub',
      introRequired: false,
      commanderRosterSnapshot,
      commanderRosterFingerprint: commanderRosterSnapshot?.fingerprint
    });
    sessionStorage.setItem(host.MASSFRONT_GALACTIC_ENTRY_TICKET_KEY, JSON.stringify(ticket));
    localStorage.setItem(`massfront_meta_${profileId}`, JSON.stringify({
      settings: {
        audioLevelSteps: 2,
        sound: false,
        music: true,
        sfxVol: 0,
        ambVol: 2,
        musicVol: 0,
        voiceVol: 4
      }
    }));
  }, productionRoster);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  /* Integrated campaign-hub entry may transition under its render veil before
     a stable button becomes clickable. Dispatching the real button event still
     exercises the shared frame listener and proves ownership of this document's
     graph; the sandbox half above separately proves user-gesture unlock. */
  await page.evaluate(() => document.querySelector('#btnGalaxyMap')?.click());
  await page.waitForTimeout(500);
  const integrated = await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__?.audio;
    return {
      runtime: document.querySelector('#moduleFrame')?.dataset.runtime,
      hasContext: Boolean(audio?.ctx),
      hasMaster: Boolean(audio?.master),
      external: Boolean(audio?.external),
      levels: { ...audio?.settings },
      busNames: audio?.buses ? Object.keys(audio.buses).sort() : []
    };
  });
  assert.equal(integrated.runtime, 'massfront');
  assert.equal(integrated.external, false, 'same-tab integrated proof unexpectedly retained the old document bridge');
  assert.equal(integrated.hasContext, true, 'integrated document did not create its sole contained mixer');
  assert.equal(integrated.hasMaster, true);
  assert.deepEqual(integrated.busNames, ['ambience', 'music', 'sfx', 'voice']);
  assert.equal(integrated.levels.sfx, 0);
  assert.equal(integrated.levels.musicLevel, 0);
  assert.equal(integrated.levels.voice, 1);
  await page.evaluate(() => {
    const audio = window.__MASSFRONT_SPACE__?.audio;
    const dispose = audio.dispose.bind(audio);
    audio.dispose = () => {
      sessionStorage.setItem('massfront.stage13.audioClosedOnExit', 'true');
      return dispose();
    };
  });
  await page.goto('http://127.0.0.1:8901/', { waitUntil: 'domcontentloaded' });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('massfront.stage13.audioClosedOnExit')), 'true',
    'integrated Galactic pagehide did not tear down audio before entering the next document');
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log(`PASS Stage13 hardware browser audio bridge ${JSON.stringify({ sandbox: state, integrated })}`);
} finally {
  await closePwBrowser();
}
