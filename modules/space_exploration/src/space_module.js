/* --------------------------------------------------------------------------
   MASSFRONT — EXPLORATION DOCUMENT BOOTSTRAP

   The reusable lifecycle lives in space_experience.js. Direct document loads
   retain the standalone simulator; a live same-tab base-game ticket selects
   the profile-isolated solo adapter. Production code is never imported into
   this renderer document, so MASSFRONT and Three.js still cannot compete for
   one WebGL context.
   -------------------------------------------------------------------------- */

import { createSpaceExperience } from './space_experience.js?v=20260830-sessionroutes4';
import { MASSFRONT_WORLD_MODEL_LIBRARY } from './core/world_model_catalog.js';
import { LocalSandboxHost } from './host/local_sandbox_host.js?v=20260825-host1';
import {
  MASSFRONT_GALACTIC_ENTRY_TICKET_KEY,
  MassfrontSoloHost,
  readMassfrontGalacticEntryTicket
} from './host/massfront_solo_host.js?v=20260829-careergate1';

export {
  SPACE_FIRST_ENTRY_CONTINUATION,
  createSpaceExperience
} from './space_experience.js?v=20260830-sessionroutes4';
export {
  ExplorationHostError,
  LocalSandboxHost,
  createExplorationHostV1
} from './host/local_sandbox_host.js?v=20260825-host1';
export {
  MassfrontSoloHost,
  createMassfrontGalacticEntryTicket,
  createMassfrontGalacticTacticalReportV1,
  createMassfrontSoloHost,
  readMassfrontGalacticEntryTicket,
  validateMassfrontGalacticEntryTicket
} from './host/massfront_solo_host.js?v=20260829-careergate1';

let gpuRebuilds = 0;
let gpuRebuildPending = false;
let selectedHost = null;
let hostSelectionError = null;
const consumedReturnNonces = new Set();

function hasIntegratedReturnQuery() {
  const parameters = new URLSearchParams(window.location.search);
  return parameters.has('groundResult') || parameters.has('groundRejected');
}

function hasGalacticEntryRecord() {
  try {
    return window.sessionStorage?.getItem(MASSFRONT_GALACTIC_ENTRY_TICKET_KEY) !== null;
  } catch (_) {
    return false;
  }
}

function chooseHost() {
  if (selectedHost) return selectedHost;
  const ticket = readMassfrontGalacticEntryTicket();
  if (ticket) {
    try {
      selectedHost = new MassfrontSoloHost({ expectedProfileId: ticket.profileId });
      return selectedHost;
    } catch (error) {
      hostSelectionError = error;
      throw error;
    }
  }
  if (hasIntegratedReturnQuery() || hasGalacticEntryRecord()) {
    hostSelectionError = new Error('The MASSFRONT Galactic entry ticket is missing, unreadable, or expired. The standalone career was not opened.');
    throw hostSelectionError;
  }
  selectedHost = new LocalSandboxHost();
  return selectedHost;
}

function showIntegratedFailure(error) {
  window.__MASSFRONT_SPACE_ERROR__ = error;
  window.__MASSFRONT_GALACTIC_RESULT__ = null;
  console.error('[MASSFRONT GALACTIC BRIDGE]', error);
  const frame = document.getElementById('moduleFrame');
  const veil = frame?.querySelector('#renderVeil');
  if (!veil) return;
  veil.className = 'render-veil failed';
  const title = veil.querySelector('b');
  const status = veil.querySelector('#loadStatus');
  if (title) title.textContent = 'GALACTIC RESULT REJECTED';
  if (status) status.textContent = String(error?.message || 'THE TACTICAL RESULT COULD NOT BE VERIFIED').toUpperCase();
}

function quarantineReturnedTacticalResult(experience, error) {
  window.__MASSFRONT_SPACE_ERROR__ = error;
  window.__MASSFRONT_GALACTIC_RESULT__ = null;
  console.warn('[MASSFRONT GALACTIC RESULT RECOVERY]', error);
  if (window.history && typeof window.history.replaceState === 'function') {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash || ''}`);
  }
  experience.recoverGroundOperation?.(error);
}

async function consumeReturnedTacticalResult(experience, host) {
  const parameters = new URLSearchParams(window.location.search);
  if (!parameters.has('groundResult')) return;
  await experience.ready;
  const nonce = parameters.get('groundResult');
  if (consumedReturnNonces.has(nonce)) return;
  if (hostSelectionError) throw hostSelectionError;
  if (host.productionIntegrated !== true || typeof host.consumeTacticalResult !== 'function') {
    throw new Error('A live MASSFRONT Galactic entry ticket is required to consume this tactical result.');
  }
  const outcome = await host.consumeTacticalResult(nonce);
  if (!outcome?.accepted && !outcome?.duplicate) throw new Error('The MASSFRONT tactical result was not accepted.');
  consumedReturnNonces.add(nonce);
  let queryStripped = false;
  if (window.history && typeof window.history.replaceState === 'function') {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash || ''}`);
    queryStripped = !new URLSearchParams(window.location.search).has('groundResult');
  }
  let finalization = { finalized: false, deferred: true };
  if (queryStripped && typeof host.finalizeTacticalResult === 'function') {
    try {
      finalization = await host.finalizeTacticalResult(nonce, outcome.resultId);
    } catch (error) {
      finalization = { finalized: false, deferred: true, warning: String(error?.message || error) };
      console.warn('[MASSFRONT GALACTIC RESULT FINALIZATION]', error);
    }
  }
  window.__MASSFRONT_GALACTIC_RESULT__ = { ...outcome, finalization };
}

function boot() {
  const container = document.getElementById('moduleFrame');
  if (!container || window.__MASSFRONT_SPACE__) return;
  try {
    const host = chooseHost();
    const integrated = host.productionIntegrated === true;
    container.dataset.runtime = integrated ? 'massfront' : 'sandbox';
    container.dataset.entryView = host.ticket?.entryView || 'system';
    const reset = container.querySelector('#btnResetRoom');
    if (reset) reset.hidden = integrated;
    const experience = createSpaceExperience(container, {
      host,
      seed: 'massfront-cinematic-test-room-v1'
    });
    window.__MASSFRONT_SPACE__ = experience;
    window.__MASSFRONT_SPACE_HOST__ = host;
    window.__MASSFRONT_SPACE_ERROR__ = null;
    window.__MASSFRONT_STORY_RAIL__ = experience.transmissions;
    window.__MASSFRONT_WORLD_MODELS__ = MASSFRONT_WORLD_MODEL_LIBRARY;
    window.__MASSFRONT_SPACE_ENTRY__ = {
      getState: () => experience.firstEntryIntro,
      start: () => experience.startFirstEntryIntro()
    };
    const entryView = host.ticket?.entryView || 'system';
    const introRequired = host.ticket?.introRequired !== false;
    if (host.productionIntegrated === true && entryView === 'system' && introRequired && !hasIntegratedReturnQuery()) {
      /* A new experimental career first sees the real exterior scene. The
         story rail then offers the protected tutorial or the required faction
         gate without ever routing through the ship cutaway. */
      experience.ready.then(() => experience.startFirstEntryIntro()).catch(error => {
        window.__MASSFRONT_SPACE_ERROR__ = error;
        console.error('[MASSFRONT GALACTIC FIRST ENTRY]', error);
      });
    } else if (host.productionIntegrated === true && entryView === 'campaign_hub') {
      /* START MASSFRONT is a strategic entry, not an orbital-camera shortcut.
         Wait for the exterior bootstrap so its real GPU/asset failure state is
         still authoritative, then let an already commissioned career enter the
         UGA Campaign Hub. */
      experience.ready.then(() => experience.openCampaignHub()).catch(error => {
        window.__MASSFRONT_SPACE_ERROR__ = error;
        console.error('[MASSFRONT GALACTIC ENTRY]', error);
      });
    }
    experience.ready.catch(error => {
      window.__MASSFRONT_SPACE_ERROR__ = error;
      console.error('[MASSFRONT SPACE]', error);
    });
    consumeReturnedTacticalResult(experience, host).catch(error => quarantineReturnedTacticalResult(experience, error));
  } catch (error) {
    if (hostSelectionError || hasIntegratedReturnQuery()) showIntegratedFailure(error);
    else {
      // createSpaceExperience paints the player-facing failure state before it
      // throws. Catch here so the standalone bootstrap never strands the shell
      // in an indefinite loading state or produces an unhandled module error.
      window.__MASSFRONT_SPACE_ERROR__ = error;
      console.error('[MASSFRONT SPACE]', error);
    }
  }
}

function rebuildAfterGpuInterruption() {
  if (gpuRebuildPending) return;
  gpuRebuildPending = true;
  const current = window.__MASSFRONT_SPACE__;
  window.__MASSFRONT_SPACE__ = null;
  try { current?.dispose?.(); } catch (error) { console.warn('[MASSFRONT GPU] renderer disposal during recovery failed', error); }
  gpuRebuilds++;
  window.setTimeout(() => {
    gpuRebuildPending = false;
    if (gpuRebuilds <= 2) boot();
    else {
      const frame = document.getElementById('moduleFrame');
      const veil = frame?.querySelector('#renderVeil');
      if (veil) {
        veil.className = 'render-veil failed';
        const title = veil.querySelector('b');
        const status = veil.querySelector('#loadStatus');
        if (title) title.textContent = 'GPU PROCESS REMAINS UNSTABLE';
        if (status) status.textContent = 'TWO CLEAN WEBGL2 RENDERERS WERE INTERRUPTED · CLOSE OTHER GPU-HEAVY WINDOWS, THEN RETRY';
      }
    }
  }, 500);
}

window.addEventListener('massfront:space-gpu-stalled', rebuildAfterGpuInterruption);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
