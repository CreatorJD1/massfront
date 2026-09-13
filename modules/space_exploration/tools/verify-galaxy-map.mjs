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

function fail(message, details) {
  throw new Error(`${message}${details === undefined ? '' : `: ${JSON.stringify(details)}`}`);
}

async function openChart() {
  await page.click('#btnGalaxyMap');
  await page.waitForFunction(() => document.querySelector('#moduleFrame')?.dataset.scene === 'galaxy'
    && window.__MASSFRONT_SPACE__?.galaxyMap);
  await page.waitForTimeout(260);
}

async function closeChart() {
  await page.click('#btnCloseGalaxy');
  await page.waitForFunction(() => document.querySelector('#moduleFrame')?.dataset.scene === 'system'
    && !window.__MASSFRONT_SPACE__?.galaxyMap);
}

async function capture(name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true });
}

async function diagnostics() {
  return page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const map = experience.galaxyMap;
    const gl = experience.engine.renderer.getContext();
    const rect = experience.engine.renderer.domElement.getBoundingClientRect();
    const signatures = [];
    const forbidden = [];
    map.scene.traverse(object => {
      const type = object.geometry?.type || '';
      if (object.isSprite || ['SphereGeometry', 'TorusGeometry', 'RingGeometry'].includes(type)) {
        forbidden.push({ name: object.name || '', type: object.isSprite ? 'Sprite' : type });
      }
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        if (material.map?.image instanceof HTMLCanvasElement) forbidden.push({ name: object.name || '', type: 'CanvasTexture' });
      }
    });
    for (const [id, node] of Object.entries(map.systemNodes)) {
      const values = node.core.geometry.getAttribute('position').array;
      let hash = 2166136261;
      for (let i = 0; i < values.length; i++) {
        hash ^= Math.round(values[i] * 1000);
        hash = Math.imul(hash, 16777619);
      }
      const projected = node.core.position.clone().project(map.camera);
      signatures.push({
        id,
        name: node.core.geometry.name,
        type: node.core.geometry.type,
        vertices: node.core.geometry.getAttribute('position').count,
        triangles: node.core.geometry.index.count / 3,
        hash: hash >>> 0,
        screen: [
          Math.round(rect.left + (projected.x * 0.5 + 0.5) * rect.width),
          Math.round(rect.top + (-projected.y * 0.5 + 0.5) * rect.height)
        ]
      });
    }
    const routes = map.routeMeshes.map(route => ({
      name: route.geometry.name,
      type: route.geometry.type,
      vertices: route.geometry.getAttribute('position')?.count || 0,
      triangles: (route.geometry.index?.count || 0) / 3,
      routeU: Boolean(route.geometry.getAttribute('aRouteU')),
      across: Boolean(route.geometry.getAttribute('aAcross')),
      visible: route.visible && route.material.visible,
      transparent: route.material.transparent,
      doubleSided: route.material.side === THREE.DoubleSide
    }));
    const labels = [...document.querySelectorAll('.galaxy-system-label')].map(label => {
      const bounds = label.getBoundingClientRect();
      return {
        id: label.dataset.id,
        text: label.textContent.replace(/\s+/g, ' ').trim(),
        display: getComputedStyle(label).display,
        bounds: [Math.round(bounds.left), Math.round(bounds.top), Math.round(bounds.right), Math.round(bounds.bottom)]
      };
    });
    return {
      canvasCount: document.querySelectorAll('canvas').length,
      externalLoop: map._externalLoop,
      privateRaf: map._raf || 0,
      contextLost: gl.isContextLost(),
      glError: gl.getError(),
      aspect: Number(map.camera.aspect.toFixed(3)),
      fov: map.camera.fov,
      framingProfile: map._framingProfile,
      camera: map.camera.position.toArray().map(value => Number(value.toFixed(2))),
      target: map._camTarget.toArray().map(value => Number(value.toFixed(2))),
      signatures,
      routes,
      labels,
      forbidden,
      starCount: map.starPoints.geometry.getAttribute('position').count,
      discCount: map.galacticDisc.geometry.getAttribute('position').count,
      memory: { ...experience.engine.renderer.info.memory },
      programs: experience.engine.renderer.info.programs?.length || 0
    };
  });
}

async function verifyPicking(ids) {
  const picked = [];
  for (const id of ids) {
    const point = await page.evaluate(systemId => {
      const map = window.__MASSFRONT_SPACE__.galaxyMap;
      const rect = map.inputElement.getBoundingClientRect();
      const projected = map.systemNodes[systemId].core.position.clone().project(map.camera);
      return {
        x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height
      };
    }, id);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(systemId => window.__MASSFRONT_SPACE__.galaxyMap?.selectedId === systemId, id);
    picked.push(await page.locator('#galaxyInfoName').textContent());
  }
  return picked;
}

try {
  const probe = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await probe.goto('about:blank');
  const gpu = await assertHardwareGpu(probe);
  await probe.close();

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
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 20000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(700);

  await openChart();
  const landscape = await diagnostics();
  if (landscape.canvasCount !== 1 || !landscape.externalLoop || landscape.privateRaf) fail('Galaxy chart created a second canvas or RAF', landscape);
  if (landscape.contextLost || landscape.glError) fail('Galaxy chart WebGL context is unhealthy', landscape);
  if (landscape.signatures.length !== 3 || new Set(landscape.signatures.map(item => item.hash)).size !== 3
      || landscape.signatures.some(item => item.type !== 'BufferGeometry' || item.vertices < 40 || item.triangles < 30)) {
    fail('Navigation beacons are not three distinct authored meshes', landscape.signatures);
  }
  if (landscape.routes.length !== 2 || landscape.routes.some(route => route.type !== 'BufferGeometry'
      || route.vertices < 400 || route.triangles < 600 || !route.routeU || !route.across || !route.visible || !route.doubleSided)) {
    fail('Phase corridors are incomplete or invisible', landscape.routes);
  }
  if (landscape.forbidden.length) fail('Generic marker fallback found in Star Chart', landscape.forbidden);
  if (landscape.labels.length !== 3 || landscape.labels.some(label => label.display === 'none' || !label.text)) fail('Projected system labels are incomplete', landscape.labels);
  if (landscape.discCount < 15000 || landscape.starCount < 5000) fail('Deterministic chart depth field is under budget', landscape);
  const landscapePicks = await verifyPicking(['veyra', 'karak', 'aelos']);
  await capture('galaxy-qa-landscape');
  await closeChart();

  // Warm the renderer once, then prove repeated route planning does not retain
  // geometry, textures, programs, canvases, or a private animation loop.
  const baseline = await page.evaluate(() => {
    const renderer = window.__MASSFRONT_SPACE__.engine.renderer;
    return { memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length || 0 };
  });
  for (let i = 0; i < 50; i++) {
    await openChart();
    await page.evaluate(() => window.__MASSFRONT_SPACE__.galaxyMap.renderFrame(performance.now()));
    await closeChart();
  }
  await page.waitForTimeout(180);
  const cycleResult = await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    return {
      memory: { ...experience.engine.renderer.info.memory },
      programs: experience.engine.renderer.info.programs?.length || 0,
      canvasCount: document.querySelectorAll('canvas').length,
      mapDisposed: !experience.galaxyMap,
      scene: experience.scene
    };
  });
  if (cycleResult.canvasCount !== 1 || !cycleResult.mapDisposed || cycleResult.scene !== 'system'
      || cycleResult.memory.geometries !== baseline.memory.geometries
      || cycleResult.memory.textures !== baseline.memory.textures
      || cycleResult.programs !== baseline.programs) {
    fail('Star Chart retained GPU or lifecycle state across 50 open/close cycles', { baseline, cycleResult });
  }

  await page.setViewportSize({ width: 430, height: 932 });
  await page.waitForTimeout(180);
  await openChart();
  const portrait = await diagnostics();
  if (portrait.framingProfile !== 'portrait' || portrait.labels.some(label => label.display === 'none'
      || label.bounds[0] < -1 || label.bounds[2] > 431 || label.bounds[1] < -1 || label.bounds[3] > 590)) {
    fail('Portrait chart framing clips a beacon label or places it under the dossier', portrait.labels);
  }
  const portraitPicks = await verifyPicking(['veyra', 'karak', 'aelos']);
  await capture('galaxy-qa-portrait');

  // Exercise the shared renderer's actual loss/restoration path while the map
  // is active. ThreeSpaceEngine owns the listener and re-uploads this scene.
  const lossExtension = await page.evaluate(() => {
    const gl = window.__MASSFRONT_SPACE__.engine.renderer.getContext();
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 180);
    return true;
  });
  if (!lossExtension) fail('WEBGL_lose_context is unavailable for restoration QA');
  await page.waitForFunction(() => window.__mfContextRestores === 1
    && !window.__MASSFRONT_SPACE__.engine.contextLost, null, { timeout: 10000 });
  await page.waitForTimeout(320);
  const restored = await diagnostics();
  if (restored.contextLost || restored.glError || restored.canvasCount !== 1 || restored.signatures.length !== 3) {
    fail('Star Chart did not recover on the shared hardware context', restored);
  }
  await capture('galaxy-qa-restored-portrait');

  let frames = 0;
  const fps = await page.evaluate(async () => {
    let count = 0;
    const start = performance.now();
    await new Promise(resolve => {
      const tick = now => {
        count++;
        if (now - start >= 1500) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return Math.round(count / ((performance.now() - start) / 1000));
  });
  frames += fps;

  const report = {
    gpu,
    fps: frames,
    contextEvents: await page.evaluate(() => ({ losses: window.__mfContextLosses, restores: window.__mfContextRestores })),
    landscape,
    portrait,
    restored,
    landscapePicks,
    portraitPicks,
    cycles: { count: 50, baseline, result: cycleResult }
  };
  console.log(JSON.stringify(report, null, 2));
  await closeChart();
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
