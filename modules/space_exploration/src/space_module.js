/* --------------------------------------------------------------------------
   MASSFRONT — SELF-CONTAINED TEST-ROOM BOOTSTRAP

   The reusable lifecycle lives in space_experience.js. This file only mounts
   the standalone room from index.html and exposes the handle for GPU/browser
   verification. Production MASSFRONT is never imported or modified.
   -------------------------------------------------------------------------- */

import { createSpaceExperience } from './space_experience.js?v=20260823-transit1';
import { LocalSandboxHost } from './host/local_sandbox_host.js?v=20260825-host1';

export { createSpaceExperience } from './space_experience.js?v=20260823-transit1';
export {
  ExplorationHostError,
  LocalSandboxHost,
  createExplorationHostV1
} from './host/local_sandbox_host.js?v=20260825-host1';

let gpuRebuilds = 0;
let gpuRebuildPending = false;

function boot() {
  const container = document.getElementById('moduleFrame');
  if (!container || window.__MASSFRONT_SPACE__) return;
  try {
    const experience = createSpaceExperience(container, {
      host: new LocalSandboxHost(),
      seed: 'massfront-cinematic-test-room-v1'
    });
    window.__MASSFRONT_SPACE__ = experience;
    window.__MASSFRONT_SPACE_ERROR__ = null;
    experience.ready.catch(error => {
      window.__MASSFRONT_SPACE_ERROR__ = error;
      console.error('[MASSFRONT SPACE]', error);
    });
  } catch (error) {
    // createSpaceExperience paints the player-facing failure state before it
    // throws. Catch here so the standalone bootstrap never strands the shell
    // in an indefinite loading state or produces an unhandled module error.
    window.__MASSFRONT_SPACE_ERROR__ = error;
    console.error('[MASSFRONT SPACE]', error);
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
