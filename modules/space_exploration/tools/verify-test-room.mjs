import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8991/';
const output = new URL('../tmp/browser-captures/', import.meta.url);
await mkdir(output, { recursive: true });

const browser = await launchPwBrowser();
const errors = [];
let page;
let ugaDiagnostics = null;
let explorationDiagnostics = null;
let gpu;

async function capture(name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
}

async function assertLiveContext(label) {
  const status = await page.evaluate(sceneLabel => {
    const experience = window.__MASSFRONT_SPACE__;
    const gl = experience?.engine?.renderer?.getContext?.();
    return {
      label: sceneLabel,
      ready: Boolean(experience),
      lost: gl ? gl.isContextLost() : true,
      losses: window.__mfContextLosses || 0,
      restores: window.__mfContextRestores || 0
    };
  }, label);
  if (!status.ready || status.lost || status.losses) {
    throw new Error(`WebGL context unhealthy after ${label}: ${JSON.stringify(status)}`);
  }
  return status;
}

async function loadQaSystem(systemId) {
  await page.evaluate(async id => {
    const { SHOWCASE_SYSTEMS } = await import('./src/systems/showcase_systems.js');
    await window.__MASSFRONT_SPACE__.engine.loadSystemBodies(SHOWCASE_SYSTEMS[id]);
  }, systemId);
  await page.waitForTimeout(650);
  return page.evaluate(id => {
    const engine = window.__MASSFRONT_SPACE__.engine;
    const roots = [];
    engine.celestialGroup.traverse(object => {
      if (object.name?.startsWith('CONTACT_')) roots.push(object.name.slice(8));
    });
    const gl = engine.renderer.getContext();
    return {
      id,
      currentSystem: engine.currentSystem?.id,
      contactIds: roots.sort(),
      lensing: Boolean(engine._blackHoleLensing),
      glError: gl.getError(),
      contextLost: gl.isContextLost()
    };
  }, systemId);
}

try {
  // The repository GPU assertion creates a probe context. Run it on a short-
  // lived page so the showcase page owns the only context during GLB upload,
  // scene handoff, and screenshot capture.
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await gpuPage.goto('about:blank');
  gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await page.addInitScript(() => {
    window.__mfContextLosses = 0;
    window.__mfContextRestores = 0;
    document.addEventListener('webglcontextlost', () => { window.__mfContextLosses++; }, true);
    document.addEventListener('webglcontextrestored', () => { window.__mfContextRestores++; }, true);
  });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 15000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(1200);

  await assertLiveContext('exploration load');
  explorationDiagnostics = await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const planets = [];
    const contacts = [];
    experience.engine.celestialGroup.traverse(object => {
      if (object.name?.endsWith('_AuthoredSurface')) {
        planets.push({
          name: object.name,
          material: object.material?.name || '',
          maps: {
            basecolor: Boolean(object.material?.map),
            normal: Boolean(object.material?.normalMap),
            orm: object.material?.aoMap === object.material?.roughnessMap
              && object.material?.roughnessMap === object.material?.metalnessMap,
            height: Boolean(object.material?.displacementMap),
            emissive: Boolean(object.material?.emissiveMap)
          }
        });
      }
      if (object.name?.startsWith('CONTACT_')) {
        const id = object.name.slice('CONTACT_'.length);
        const levels = [0, 1, 2].map(level => object.getObjectByName(`LOD${level}_${id}`));
        const meshTypes = [];
        object.traverse(child => {
          if (child.isMesh) meshTypes.push(child.geometry?.type || '');
        });
        contacts.push({
          id,
          levels: levels.map(Boolean),
          visibleLevels: levels.filter(level => level?.visible).length,
          allBufferGeometry: meshTypes.length > 0 && meshTypes.every(type => type === 'BufferGeometry')
        });
      }
    });
    return {
      cutawayDeferred: !experience.commandScene.loaded,
      authoredPlanetCount: planets.length,
      planets,
      authoredContactCount: contacts.length,
      contacts
    };
  });
  if (!explorationDiagnostics.cutawayDeferred
      || explorationDiagnostics.authoredPlanetCount !== 2
      || explorationDiagnostics.planets.some(planet => Object.values(planet.maps).some(value => !value))
      || explorationDiagnostics.authoredContactCount !== 3
      || explorationDiagnostics.contacts.some(contact => contact.levels.some(value => !value)
        || contact.visibleLevels !== 1 || !contact.allBufferGeometry)) {
    throw new Error(`Authored exploration package is incomplete: ${JSON.stringify(explorationDiagnostics)}`);
  }
  await capture('exploration-landscape');

  const systemDiagnostics = [];
  for (const [id, expectedContacts, expectedLensing] of [
    ['veyra', ['veyra_aelos_gate', 'veyra_archive_hulk', 'veyra_karak_gate'], true],
    ['karak', ['karak_colony_spine', 'karak_lifeboat_field', 'karak_veyra_gate'], false]
  ]) {
    const diagnostic = await loadQaSystem(id);
    systemDiagnostics.push(diagnostic);
    if (diagnostic.currentSystem !== id
        || JSON.stringify(diagnostic.contactIds) !== JSON.stringify(expectedContacts)
        || diagnostic.lensing !== expectedLensing || diagnostic.glError || diagnostic.contextLost) {
      throw new Error(`Authored ${id} scene failed: ${JSON.stringify(diagnostic)}`);
    }
    await capture(`${id}-exploration-landscape`);
  }
  const restoredAelos = await loadQaSystem('aelos');
  if (restoredAelos.lensing || restoredAelos.contactIds.length !== 3 || restoredAelos.glError) {
    throw new Error(`Aelos did not restore after QA systems: ${JSON.stringify(restoredAelos)}`);
  }

  await page.click('#btnUgaCommand');
  await page.waitForFunction(() => document.querySelector('#moduleFrame')?.dataset.scene === 'uga');
  await page.waitForTimeout(1100);
  await assertLiveContext('UGA overview');
  await capture('uga-overview-landscape');
  ugaDiagnostics = await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const scene = experience.commandScene;
    const renderer = experience.engine.renderer;
    scene.render();
    const bounds = new THREE.Box3().setFromObject(scene.root);
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return {
      camera: scene.camera.position.toArray().map(value => Number(value.toFixed(2))),
      target: scene.cameraTarget.toArray().map(value => Number(value.toFixed(2))),
      boundsMin: bounds.min.toArray().map(value => Number(value.toFixed(2))),
      boundsMax: bounds.max.toArray().map(value => Number(value.toFixed(2))),
      background: `#${scene.scene.background.getHexString()}`,
      centerPixel: [...pixel],
      contextLost: gl.isContextLost(),
      glError: gl.getError()
    };
  });
  await page.click('[data-district="survey"]');
  await page.waitForTimeout(1100);
  await assertLiveContext('UGA Survey focus');
  await capture('uga-survey-focus-landscape');

  await page.click('.uga-command-exit');
  await page.click('#actSurvey');
  await page.waitForFunction(() => document.querySelector('#moduleFrame')?.dataset.scene === 'survey');
  await page.waitForTimeout(400);
  await assertLiveContext('orbital Survey');
  await capture('survey-landscape');
  await page.click('#btnCloseSurvey');

  await page.click('#btnGalaxyMap');
  await page.waitForFunction(() => document.querySelector('#moduleFrame')?.dataset.scene === 'galaxy');
  await page.waitForTimeout(900);
  await assertLiveContext('Galaxy');
  const galaxyDiagnostics = await page.evaluate(() => {
    const map = window.__MASSFRONT_SPACE__.galaxyMap;
    const nodes = Object.entries(map.systemNodes).map(([id, node]) => ({
      id,
      geometry: node.core.geometry?.name || '',
      type: node.core.geometry?.type || '',
      vertices: node.core.geometry?.getAttribute('position')?.count || 0
    }));
    return { count: nodes.length, nodes };
  });
  if (galaxyDiagnostics.count !== 3
      || galaxyDiagnostics.nodes.some(node => node.type !== 'BufferGeometry'
        || !node.geometry.endsWith('_AuthoredNavigationBeacon') || node.vertices < 40)) {
    throw new Error(`Galaxy beacons are not authored geometry: ${JSON.stringify(galaxyDiagnostics)}`);
  }
  await capture('galaxy-landscape');
  await page.click('#btnCloseGalaxy');

  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(700);
  await capture('exploration-portrait');
  await page.click('#btnUgaCommand');
  await page.waitForTimeout(900);
  await capture('uga-overview-portrait');

  const report = await page.evaluate(async input => {
    const experience = window.__MASSFRONT_SPACE__;
    let frames = 0;
    const start = performance.now();
    await new Promise(resolve => {
      const tick = now => {
        frames++;
        if (now - start >= 1500) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const renderer = experience.engine.renderer;
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      title: document.title,
      scene: experience.scene,
      canvasCount: document.querySelectorAll('canvas').length,
      fps: Math.round(frames / ((performance.now() - start) / 1000)),
      gpu: {
        renderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
        vendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR))
      },
      contextEvents: { losses: window.__mfContextLosses || 0, restores: window.__mfContextRestores || 0 },
      renderMemory: { ...renderer.info.memory },
      shipReady: experience.engine.isShipReady,
      cutawayReady: experience.commandScene.loaded,
      stateRevision: experience.getState().revision,
      explorationDiagnostics: input.explorationDiagnostics,
      ugaDiagnostics: input.ugaDiagnostics
    };
  }, { ugaDiagnostics, explorationDiagnostics });
  report.preflightGpu = gpu;
  report.galaxyDiagnostics = galaxyDiagnostics;
  report.systemDiagnostics = systemDiagnostics;
  console.log(JSON.stringify(report, null, 2));
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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}

// The shared project CDP endpoint can deliberately outlive this script. Once
// the page lifecycle has disposed its WebGL context, do not let that endpoint
// keep an otherwise completed verification process open.
await new Promise(resolve => setImmediate(resolve));
process.exit(process.exitCode || 0);
