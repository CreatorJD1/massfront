import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const url = process.env.MF_SPACE_URL || 'http://127.0.0.1:8991/';
const tag = process.env.MF_PLANET_TAG || 'current';
const output = new URL(`../tmp/planet-runtime/${tag}/`, import.meta.url);
await mkdir(output, { recursive: true });

const browser = await launchPwBrowser();
const errors = [];
let page;

try {
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await gpuPage.goto('about:blank');
  const gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 20000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__MASSFRONT_SPACE__.pause());
  await page.addStyleTag({ content: `
    #moduleFrame > *:not(#spatialHudLayer) { display: none !important; }
    #spatialHudLayer > *:not(#threeCanvas) { display: none !important; }
  ` });

  const diagnostics = await page.evaluate(async () => {
    const { SHOWCASE_SYSTEMS } = await import('./src/systems/showcase_systems.js');
    const experience = window.__MASSFRONT_SPACE__;
    const engine = experience.engine;
    const results = [];
    engine.gridMesh.visible = false;
    engine.shipGroup.visible = false;
    engine.starPoints.visible = false;
    engine.particlePoints.visible = false;
    engine.scene.fog = null;
    engine.camera.fov = 32;
    engine.camera.near = 0.25;
    engine.camera.updateProjectionMatrix();

    for (const system of Object.values(SHOWCASE_SYSTEMS)) {
      await engine.loadSystemBodies(system);
      for (const definition of system.planets) {
        const record = engine._planetMeshes.get(definition);
        const body = record?.body;
        const surface = body?.getObjectByName(`${definition.id}_AuthoredSurface`);
        const clouds = body?.getObjectByName(`${definition.id}_AuthoredCloudLayer`);
        const group = record?.group;
        if (!surface || !clouds || !group) throw new Error(`Authored planet did not attach: ${definition.id}`);

        for (const child of engine.celestialGroup.children) child.visible = child === group;
        group.visible = true;
        body.visible = true;
        group.updateWorldMatrix(true, true);
        const center = group.getWorldPosition(new THREE.Vector3());
        const toStar = center.clone().multiplyScalar(-1).normalize();
        const side = new THREE.Vector3(0, 1, 0).cross(toStar).normalize();
        const view = toStar.clone().multiplyScalar(0.9)
          .addScaledVector(side, 0.34)
          .add(new THREE.Vector3(0, 0.18, 0))
          .normalize();
        engine.camera.position.copy(center).addScaledVector(view, definition.radius * 4.5);
        engine.camera.lookAt(center);
        engine.camera.updateMatrixWorld(true);
        engine.renderer.render(engine.scene, engine.camera);

        const material = surface.material;
        const maps = {};
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'displacementMap', 'emissiveMap']) {
          const texture = material[key];
          maps[key] = texture ? {
            source: texture.image?.currentSrc || texture.image?.src || '',
            width: texture.image?.naturalWidth || texture.image?.width || 0,
            height: texture.image?.naturalHeight || texture.image?.height || 0,
            encoding: texture.encoding,
            wrapS: texture.wrapS,
            wrapT: texture.wrapT
          } : null;
        }
        results.push({
          id: definition.id,
          radius: definition.radius,
          vertexCount: surface.geometry.getAttribute('position').count,
          material: {
            roughness: material.roughness,
            metalness: material.metalness,
            aoMapIntensity: material.aoMapIntensity,
            displacementScale: material.displacementScale,
            displacementBias: material.displacementBias,
            emissiveIntensity: material.emissiveIntensity,
            maps
          },
          clouds: {
            opacity: clouds.material.opacity,
            depthWrite: clouds.material.depthWrite,
            alphaSource: clouds.material.alphaMap?.image?.currentSrc || clouds.material.alphaMap?.image?.src || ''
          },
          contextLost: engine.renderer.getContext().isContextLost(),
          glError: engine.renderer.getContext().getError()
        });
      }
    }
    window.__MF_PLANET_DIAGNOSTICS__ = results;
    return { gpu: engine.renderer.userData.gpu, planets: results };
  });

  for (const planet of diagnostics.planets) {
    await page.evaluate(async id => {
      const { SHOWCASE_SYSTEMS } = await import('./src/systems/showcase_systems.js');
      const experience = window.__MASSFRONT_SPACE__;
      const engine = experience.engine;
      const system = Object.values(SHOWCASE_SYSTEMS).find(item => item.planets.some(world => world.id === id));
      if (engine.currentSystem !== system) await engine.loadSystemBodies(system);
      const definition = system.planets.find(world => world.id === id);
      const record = engine._planetMeshes.get(definition);
      const group = record.group;
      for (const child of engine.celestialGroup.children) child.visible = child === group;
      group.visible = true;
      record.body.visible = true;
      group.updateWorldMatrix(true, true);
      const center = group.getWorldPosition(new THREE.Vector3());
      const toStar = center.clone().multiplyScalar(-1).normalize();
      const side = new THREE.Vector3(0, 1, 0).cross(toStar).normalize();
      const view = toStar.clone().multiplyScalar(0.9)
        .addScaledVector(side, 0.34)
        .add(new THREE.Vector3(0, 0.18, 0))
        .normalize();
      engine.camera.position.copy(center).addScaledVector(view, definition.radius * 4.5);
      engine.camera.lookAt(center);
      engine.camera.updateMatrixWorld(true);
      engine.renderer.render(engine.scene, engine.camera);
    }, planet.id);
    await page.locator('#threeCanvas').screenshot({
      path: fileURLToPath(new URL(`${planet.id}.png`, output))
    });
  }

  const lifecycle = await page.evaluate(async () => {
    const { createAuthoredPlanetVisual } = await import('./src/planet/authored_planet.js');
    const originalLoad = THREE.TextureLoader.prototype.load;
    const renderer = window.__MASSFRONT_SPACE__.engine.renderer;
    const fakeRenderer = { capabilities: { getMaxAnisotropy: () => 1 } };
    let failureDisposed = 0;
    let cancelDisposed = 0;
    let rejected = false;
    try {
      THREE.TextureLoader.prototype.load = function(url, onLoad, onProgress, onError) {
        queueMicrotask(() => {
          if (url.includes('-normal.png')) onError();
          else onLoad({ dispose() { failureDisposed++; } });
        });
      };
      const failed = createAuthoredPlanetVisual({ id: 'probe_failed', radius: 1 }, fakeRenderer);
      try { await failed.ready; }
      catch (_) { rejected = true; }

      THREE.TextureLoader.prototype.load = function(url, onLoad) {
        queueMicrotask(() => onLoad({ dispose() { cancelDisposed++; } }));
      };
      const cancelled = createAuthoredPlanetVisual({ id: 'probe_cancelled', radius: 1 }, fakeRenderer);
      cancelled.cancel();
      const cancelResult = await cancelled.ready;
      return {
        failedPackageRejected: rejected,
        failureSiblingTexturesDisposed: failureDisposed,
        cancelledLateTexturesDisposed: cancelDisposed,
        cancelledResult: cancelResult,
        contextLost: renderer.getContext().isContextLost()
      };
    } finally {
      THREE.TextureLoader.prototype.load = originalLoad;
    }
  });

  const swapStress = await page.evaluate(async () => {
    const { SHOWCASE_SYSTEMS } = await import('./src/systems/showcase_systems.js');
    const engine = window.__MASSFRONT_SPACE__.engine;
    const worlds = Object.values(SHOWCASE_SYSTEMS);
    const baseline = { ...engine.renderer.info.memory };
    const pending = [];
    for (let i = 0; i < 12; i++) pending.push(engine.loadSystemBodies(worlds[i % worlds.length]));
    const settled = await Promise.allSettled(pending);
    engine.renderer.render(engine.scene, engine.camera);
    return {
      baseline,
      after: { ...engine.renderer.info.memory },
      fulfilled: settled.filter(result => result.status === 'fulfilled').length,
      rejected: settled.filter(result => result.status === 'rejected').length,
      contextLost: engine.renderer.getContext().isContextLost(),
      glError: engine.renderer.getContext().getError()
    };
  });

  console.log(JSON.stringify({ preflightGpu: gpu, ...diagnostics, lifecycle, swapStress }, null, 2));
  await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose());
  await page.close();
  page = null;
} finally {
  if (page) await page.close().catch(() => {});
  await Promise.race([closePwBrowser(), new Promise(resolve => setTimeout(resolve, 5000))]);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}

await new Promise(resolve => setImmediate(resolve));
process.exit(process.exitCode || 0);
