import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8991/';
const browser = await launchPwBrowser();
let page;

function sameMemory(a, b) {
  return a.geometries === b.geometries && a.textures === b.textures;
}

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await gpuPage.goto('about:blank');
  const gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 20000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);

  const report = await page.evaluate(async () => {
    const experience = window.__MASSFRONT_SPACE__;
    const renderer = experience.engine.renderer;
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const healthy = label => {
      const gl = renderer.getContext();
      if (gl.isContextLost()) throw new Error(`WebGL context lost during ${label}`);
      if (document.querySelectorAll('canvas#threeCanvas').length !== 1) {
        throw new Error(`Expected one shared WebGL canvas during ${label}; found ${document.querySelectorAll('canvas#threeCanvas').length}`);
      }
    };

    // Warm every renderer path before measuring retained resources.
    await experience.openUga();
    await frame();
    await frame();
    experience.openSystem();
    experience.openGalaxy();
    await frame();
    await frame();
    experience.openSystem();
    await frame();
    const baseline = { ...renderer.info.memory };

    // Player-visible scene churn: 50 Galaxy/Survey/Interior cycles through the
    // same public API used by the UI. Every scene uses the shared renderer.
    for (let i = 0; i < 50; i++) {
      await experience.openUga();
      await frame();
      experience.openSystem();
      experience.openSurvey();
      await frame();
      experience.openSystem();
      experience.openGalaxy();
      await frame();
      experience.openSystem();
      healthy(`scene cycle ${i + 1}`);
    }
    await frame();
    await frame();
    const afterSceneCycles = { ...renderer.info.memory };

    // Exercise the actual system-body disposal path 20 times without altering
    // the persistent campaign. The imported catalog is the same one used by
    // normal loadSystem(), and the final load restores the saved route.
    const { SHOWCASE_SYSTEMS } = await import('./src/systems/showcase_systems.js');
    const ids = ['aelos', 'veyra', 'karak'];
    for (let i = 0; i < 20; i++) {
      await experience.engine.loadSystemBodies(SHOWCASE_SYSTEMS[ids[i % ids.length]]);
      await frame();
      healthy(`system transition ${i + 1}`);
    }
    await experience.engine.loadSystemBodies(SHOWCASE_SYSTEMS[experience.getState().route.systemId]);
    await frame();
    const afterSystemTransitions = { ...renderer.info.memory };

    const beforePause = renderer.info.render.frame;
    experience.pause();
    await new Promise(resolve => setTimeout(resolve, 350));
    const afterPause = renderer.info.render.frame;
    experience.resume();
    await frame();
    await frame();
    const afterResume = renderer.info.render.frame;
    healthy('pause/resume');

    return {
      canvasCount: document.querySelectorAll('canvas').length,
      webglCanvasCount: document.querySelectorAll('canvas#threeCanvas').length,
      baseline,
      afterSceneCycles,
      afterSystemTransitions,
      stableAfterSceneCycles: baseline.geometries === afterSceneCycles.geometries && baseline.textures === afterSceneCycles.textures,
      stableAfterSystemTransitions: baseline.geometries === afterSystemTransitions.geometries && baseline.textures === afterSystemTransitions.textures,
      pauseStoppedRendering: afterPause === beforePause,
      resumeRestartedRendering: afterResume > afterPause,
      contextLost: renderer.getContext().isContextLost()
    };
  });

  report.preflightGpu = gpu;
  console.log(JSON.stringify(report, null, 2));
  if (report.webglCanvasCount !== 1 || report.contextLost || !report.pauseStoppedRendering || !report.resumeRestartedRendering) {
    throw new Error(`Lifecycle stress verification failed: ${JSON.stringify(report)}`);
  }
  if (!sameMemory(report.baseline, report.afterSceneCycles) || !sameMemory(report.baseline, report.afterSystemTransitions)) {
    throw new Error(`Renderer memory grew after stress cycles: ${JSON.stringify(report)}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose());
  await page.close();
  page = null;
} finally {
  if (page) await page.close().catch(() => {});
  await Promise.race([
    closePwBrowser(),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
}

await new Promise(resolve => setImmediate(resolve));
process.exit(0);
