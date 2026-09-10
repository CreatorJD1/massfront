/* --------------------------------------------------------------------------
   MASSFRONT — EXPLORATION DOCUMENT BOOTSTRAP

   The reusable lifecycle lives in space_experience.js. Direct document loads
   retain the standalone simulator; a live same-tab base-game ticket selects
   the profile-isolated solo adapter. Only the canonical content downloader is
   shared with the base document; its renderer and updater are not imported,
   so MASSFRONT and Three.js cannot compete for one WebGL context.
   -------------------------------------------------------------------------- */

import './startup_content.js?v=20260906-release5';
import { createSpaceExperience } from './space_experience.js?v=20260908-uga81r1';
import { MASSFRONT_WORLD_MODEL_LIBRARY } from './core/world_model_catalog.js';
import { LocalSandboxHost } from './host/local_sandbox_host.js?v=20260825-host1';
import {
  readNativeExplorationMount,
  acknowledgeMountedRuntimeReady,
  installNativeExplorationLoaderUrls,
  resolveBaseRuntimeNavigation
} from './host/base_runtime_url.js?v=20260908-uga81r1';
import {
  MASSFRONT_GALACTIC_ENTRY_TICKET_KEY,
  MassfrontSoloHost,
  readMassfrontGalacticEntryTicket
} from './host/massfront_solo_host.js?v=20260906-release5';

export {
  SPACE_FIRST_ENTRY_CONTINUATION,
  createSpaceExperience
} from './space_experience.js?v=20260908-uga81r1';
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
} from './host/massfront_solo_host.js?v=20260906-release5';

let gpuRebuilds = 0;
let gpuRebuildPending = false;
let selectedHost = null;
let hostSelectionError = null;
const consumedReturnNonces = new Set();
const FATAL_RETURN_SYSTEM_IDS = new Set(['aelos', 'veyra', 'karak']);
const FATAL_RETURN_TARGET_ID = /^[a-z0-9_]{1,96}$/;
const CLASSIC_FALLBACK_SESSION_KEY = 'massfront.galactic.classic-fallback.v1';

function armClassicFallbackSession() {
  try {
    window.sessionStorage.setItem(CLASSIC_FALLBACK_SESSION_KEY, '1');
    return window.sessionStorage.getItem(CLASSIC_FALLBACK_SESSION_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function fatalReturnLocation() {
  let snapshot = null;
  try { snapshot = window.__MASSFRONT_SPACE__?.getState?.() || null; } catch (_) {}
  if (!snapshot) {
    try {
      const candidate = selectedHost?.loadCampaignSnapshot?.();
      if (candidate && typeof candidate.then !== 'function') snapshot = candidate;
    } catch (_) {}
  }
  const systemId = FATAL_RETURN_SYSTEM_IDS.has(snapshot?.route?.systemId) ? snapshot.route.systemId : 'aelos';
  const candidateTarget = snapshot?.route?.targetId;
  const targetId = typeof candidateTarget === 'string' && FATAL_RETURN_TARGET_ID.test(candidateTarget)
    ? candidateTarget
    : null;
  return { systemId, targetId };
}

async function returnToMassfrontFromFatalState() {
  const button = document.querySelector('[data-render-return]');
  if (button?.disabled) return;
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'RETURNING TO MASSFRONT';
  }
  const classicFallbackLatched = armClassicFallbackSession();
  try {
    if (classicFallbackLatched && selectedHost?.productionIntegrated === true && typeof selectedHost.openBaseRoute === 'function') {
      await selectedHost.openBaseRoute('war-room', fatalReturnLocation());
      return;
    }
  } catch (error) {
    // A corrupt or expired Galactic bridge must not remove the unprivileged
    // route back to the base game; the War Room request simply cannot be kept.
    console.warn('[MASSFRONT GALACTIC FAIL-SAFE]', error);
  }
  try {
    const target = resolveBaseRuntimeNavigation('../../../index.html?galacticFallback=classic');
    window.location.assign(target);
  } catch (error) {
    window.__MASSFRONT_SPACE_ERROR__ = error;
    console.error('[MASSFRONT GALACTIC FAIL-SAFE]', error);
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'RETURN TO MASSFRONT';
    }
  }
}

function installFatalReturn() {
  const button = document.querySelector('[data-render-return]');
  window.__MASSFRONT_FATAL_RETURN_HANDLER__ = returnToMassfrontFromFatalState;
  /* index.html owns a dependency-free dispatcher so an import failure still
     has a working escape. Direct embedders without that dispatcher retain the
     normal module binding here. */
  if (button && window.__MASSFRONT_INLINE_FATAL_RETURN_BOUND__ !== true) {
    button.addEventListener('click', returnToMassfrontFromFatalState);
  }
}

function exposeFatalActions(veil) {
  const retry = veil?.querySelector('[data-render-retry]');
  if (retry) {
    retry.hidden = false;
    retry.removeAttribute('aria-busy');
  }
}

function retrySpaceAfterFatalState() {
  if (gpuRebuildPending) return;
  const button = document.querySelector('[data-render-retry]');
  if (button) button.setAttribute('aria-busy', 'true');
  // A deliberate player retry starts a fresh bounded recovery attempt. The
  // context-loss listener still caps unattended rebuilds, so this cannot loop.
  gpuRebuilds = 0;
  rebuildAfterGpuInterruption();
}

function installFatalRetry() {
  const button = document.querySelector('[data-render-retry]');
  if (button) button.addEventListener('click', retrySpaceAfterFatalState);
}

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
  exposeFatalActions(veil);
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
    const mountedRuntime = readNativeExplorationMount();
    installNativeExplorationLoaderUrls();
    const host = chooseHost();
    const integrated = host.productionIntegrated === true;
    container.dataset.runtime = integrated ? 'massfront' : 'sandbox';
    container.dataset.entryView = host.ticket?.entryView || 'system';
    const reset = container.querySelector('#btnResetRoom');
    if (reset) reset.hidden = integrated;
    const experience = createSpaceExperience(container, {
      host,
      entryView: host.ticket?.entryView || 'system',
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
      /* Strategic controls are DOM + campaign state, so expose them on the
         first module frame. Exterior PBR and the optional ship cutaway no
         longer hold Campaign Hub navigation behind a multi-minute asset load. */
      Promise.resolve(experience.openCampaignHub({ persist: false })).catch(error => {
        window.__MASSFRONT_SPACE_ERROR__ = error;
        console.error('[MASSFRONT GALACTIC ENTRY]', error);
      });
    }
    experience.ready.catch(error => {
      window.__MASSFRONT_SPACE_ERROR__ = error;
      console.error('[MASSFRONT SPACE]', error);
    });
    experience.ready.then(() => {
      if (window.__MASSFRONT_SPACE__ === experience && !experience.disposed
        && !window.__MASSFRONT_SPACE_ERROR__) acknowledgeMountedRuntimeReady(mountedRuntime);
    }, () => {});
    consumeReturnedTacticalResult(experience, host).catch(error => quarantineReturnedTacticalResult(experience, error));
  } catch (error) {
    if (hostSelectionError || hasIntegratedReturnQuery() || selectedHost?.productionIntegrated === true) showIntegratedFailure(error);
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
    document.querySelector('[data-render-retry]')?.removeAttribute('aria-busy');
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
        exposeFatalActions(veil);
      }
    }
  }, 500);
}

window.addEventListener('massfront:space-gpu-stalled', rebuildAfterGpuInterruption);
installFatalReturn();
installFatalRetry();
window.__MASSFRONT_SPACE_MODULE_BOUND__ = true;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
