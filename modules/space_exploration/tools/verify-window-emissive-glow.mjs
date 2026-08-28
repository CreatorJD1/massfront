import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(moduleRoot, '..', '..');
const outputRoot = join(moduleRoot, 'tmp', 'window-glow-comparison', 'after');
const reportPath = join(outputRoot, 'report.json');
const url = process.env.MF_SPACE_URL
  || 'http://127.0.0.1:9014/modules/space_exploration/index.html';
const viewport = Object.freeze({ width: 1440, height: 900 });
const expectedMaterial = 'NEXUS-VII Authored Window Glazing';
const expectedMapSize = 1024;
const minimumIntensity = 2.4;

await mkdir(outputRoot, { recursive: true });

function rel(path) {
  return relative(repoRoot, path).replaceAll('\\', '/');
}

async function hashFile(path) {
  try {
    const bytes = await readFile(path);
    return {
      path: rel(path),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex')
    };
  } catch (error) {
    return { path: rel(path), error: error.message };
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function frameCostSummary(samples) {
  return {
    samples: samples.length,
    minimumMs: samples.length ? Math.min(...samples) : 0,
    averageMs: samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 0,
    p95Ms: percentile(samples, 0.95),
    maximumMs: samples.length ? Math.max(...samples) : 0
  };
}

async function saveScreenshot(page, name, options = {}) {
  const path = join(outputRoot, name);
  const bytes = await page.screenshot({ path, animations: 'disabled', ...options });
  return { path, bytes };
}

async function saveLocatorScreenshot(locator, name) {
  const path = join(outputRoot, name);
  const bytes = await locator.screenshot({ path, animations: 'disabled' });
  return { path, bytes };
}

async function saveDataUrl(name, dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error(`The deterministic framebuffer capture ${name} was not a PNG data URL.`);
  const path = join(outputRoot, name);
  const bytes = Buffer.from(match[1], 'base64');
  await writeFile(path, bytes);
  return { path, bytes };
}

function sameBytes(left, right) {
  return left.length === right.length && left.equals(right);
}

async function readDomUiState(page) {
  return page.evaluate(() => {
    const selectors = [
      '.uga-command-header',
      '.uga-command-identity',
      '.uga-context-panel',
      '.uga-deck-panel',
      '#mfWindowGlowUiProbe'
    ];
    return selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        selector,
        text: element.textContent.replace(/\s+/g, ' ').trim(),
        rect: [rect.left, rect.top, rect.width, rect.height].map(value => Math.round(value * 1000) / 1000),
        style: {
          color: style.color,
          background: style.background,
          border: style.border,
          boxShadow: style.boxShadow,
          filter: style.filter,
          opacity: style.opacity,
          transform: style.transform,
          visibility: style.visibility,
          display: style.display
        }
      };
    });
  });
}

async function analysePair(page, disabledBytes, enabledBytes, projectedWindows, canvasRect) {
  return page.evaluate(async ({ disabled, enabled, projectedWindows, canvasRect }) => {
    const decode = async base64 => {
      const response = await fetch(`data:image/png;base64,${base64}`);
      return createImageBitmap(await response.blob());
    };
    const [offBitmap, onBitmap] = await Promise.all([decode(disabled), decode(enabled)]);
    if (offBitmap.width !== onBitmap.width || offBitmap.height !== onBitmap.height) {
      throw new Error('Bloom comparison images have different dimensions.');
    }
    const width = offBitmap.width;
    const height = offBitmap.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(offBitmap, 0, 0);
    const off = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height);
    context.drawImage(onBitmap, 0, 0);
    const on = context.getImageData(0, 0, width, height).data;
    offBitmap.close();
    onBitmap.close();

    const scaleX = width / Math.max(1, window.innerWidth);
    const scaleY = height / Math.max(1, window.innerHeight);
    const rects = projectedWindows.map(entry => ({
      name: entry.name,
      left: entry.left * scaleX,
      top: entry.top * scaleY,
      right: entry.right * scaleX,
      bottom: entry.bottom * scaleY
    }));
    const canvasBounds = {
      left: Math.max(0, Math.floor(canvasRect.left * scaleX)),
      top: Math.max(0, Math.floor(canvasRect.top * scaleY)),
      right: Math.min(width, Math.ceil(canvasRect.right * scaleX)),
      bottom: Math.min(height, Math.ceil(canvasRect.bottom * scaleY))
    };

    const distanceToRect = (x, y, rect) => {
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      return Math.hypot(dx, dy);
    };
    const empty = () => ({
      pixels: 0,
      sumAbs: 0,
      sumPositive: 0,
      changedPixels: 0,
      positivePixels: 0,
      maxAbs: 0,
      distances: []
    });
    const zones = { core: empty(), near: empty(), far: empty(), background: empty() };
    let positiveEnergyTotal = 0;
    let positiveEnergyLocalized = 0;
    let changedTotal = 0;
    let changedLocalized = 0;

    for (let y = canvasBounds.top; y < canvasBounds.bottom; y++) {
      for (let x = canvasBounds.left; x < canvasBounds.right; x++) {
        const index = (y * width + x) * 4;
        const dr = on[index] - off[index];
        const dg = on[index + 1] - off[index + 1];
        const db = on[index + 2] - off[index + 2];
        const abs = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
        const positive = Math.max(0, dr * 0.2126 + dg * 0.7152 + db * 0.0722);
        let distance = Number.POSITIVE_INFINITY;
        for (const rect of rects) distance = Math.min(distance, distanceToRect(x, y, rect));
        const zoneName = distance <= 0.5
          ? 'core'
          : distance <= 10
            ? 'near'
            : distance <= 28
              ? 'far'
              : 'background';
        const zone = zones[zoneName];
        zone.pixels++;
        zone.sumAbs += abs;
        zone.sumPositive += positive;
        zone.maxAbs = Math.max(zone.maxAbs, abs);
        if (abs > 2) {
          zone.changedPixels++;
          changedTotal++;
          if (distance <= 28) changedLocalized++;
        }
        if (positive > 1) {
          zone.positivePixels++;
          if (Number.isFinite(distance)) zone.distances.push(distance);
        }
        positiveEnergyTotal += positive;
        if (distance <= 28) positiveEnergyLocalized += positive;
      }
    }

    const finalized = {};
    for (const [name, zone] of Object.entries(zones)) {
      zone.distances.sort((a, b) => a - b);
      const p95Index = zone.distances.length
        ? Math.min(zone.distances.length - 1, Math.ceil(zone.distances.length * 0.95) - 1)
        : 0;
      finalized[name] = {
        pixels: zone.pixels,
        meanAbs: zone.pixels ? zone.sumAbs / zone.pixels : 0,
        meanPositive: zone.pixels ? zone.sumPositive / zone.pixels : 0,
        changedPixels: zone.changedPixels,
        changedFraction: zone.pixels ? zone.changedPixels / zone.pixels : 0,
        positivePixels: zone.positivePixels,
        maxAbs: zone.maxAbs,
        positiveDistanceP95: zone.distances.length ? zone.distances[p95Index] : 0
      };
    }
    return {
      dimensions: { width, height },
      projectedRegionCount: rects.length,
      canvasBounds,
      zones: finalized,
      positiveEnergyTotal,
      positiveEnergyLocalized,
      positiveEnergyLocalizedFraction: positiveEnergyTotal > 0
        ? positiveEnergyLocalized / positiveEnergyTotal
        : 0,
      changedTotal,
      changedLocalized,
      changedLocalizedFraction: changedTotal > 0 ? changedLocalized / changedTotal : 0
    };
  }, {
    disabled: disabledBytes.toString('base64'),
    enabled: enabledBytes.toString('base64'),
    projectedWindows,
    canvasRect
  });
}

function imageChecks(analysis, expectedDimensions) {
  const { core, near, far, background } = analysis.zones;
  const haloPositivePixels = near.positivePixels + far.positivePixels;
  const haloMeanPositive = Math.max(near.meanPositive, far.meanPositive);
  const localContrast = Math.max(core.meanPositive, near.meanPositive, far.meanPositive);
  return {
    dimensionsValid: analysis.dimensions.width === expectedDimensions.width
      && analysis.dimensions.height === expectedDimensions.height,
    projectedWindowsPresent: analysis.projectedRegionCount > 0,
    localizedHaloExists: haloPositivePixels >= 24
      && haloMeanPositive >= 0.05
      && localContrast >= 0.12,
    haloLocalized: analysis.positiveEnergyLocalizedFraction >= 0.68
      && analysis.changedLocalizedFraction >= 0.68,
    haloNarrow: background.meanPositive <= Math.max(0.04, near.meanPositive * 0.18)
      && background.changedFraction <= 0.012,
    backgroundStable: background.meanAbs <= 0.18
      && background.changedFraction <= 0.012
      && background.maxAbs <= 12
  };
}

async function prepareShowcase(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.evaluate(async () => {
    const domain = await import('./src/domain/index.js');
    localStorage.setItem(
      domain.DOMAIN_STORAGE_KEY,
      domain.serializeDomainState(domain.createShowcaseReadyDomainState())
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.evaluate(async () => {
    const experience = window.__MASSFRONT_SPACE__;
    await experience.commandScene.ready();
    await experience.openUga('factions');
    if (!experience.commandScene.focusDistrict('factions', false)) {
      throw new Error('The factions focus anchor is unavailable.');
    }
    experience.pause();
    experience.commandScene.update(0, 0);
    experience.commandScene.render();
    experience.engine.renderer.getContext().finish();
  });
  await page.waitForSelector('.uga-command-shell:not([hidden])');
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
  ` });
  await page.evaluate(() => {
    let marker = document.getElementById('mfWindowGlowUiProbe');
    if (!marker) {
      marker = document.createElement('div');
      marker.id = 'mfWindowGlowUiProbe';
      marker.textContent = 'DOM UI BLOOM ISOLATION PROBE';
      marker.style.cssText = [
        'position:fixed',
        'left:18px',
        'top:78px',
        'z-index:2147483647',
        'width:224px',
        'height:34px',
        'display:grid',
        'place-items:center',
        'background:#07131f',
        'border:2px solid #35cfee',
        'color:#d9f7ff',
        'font:700 11px/1 monospace',
        'letter-spacing:1px',
        'pointer-events:none',
        'opacity:1',
        'filter:none',
        'box-shadow:none'
      ].join(';');
      document.body.appendChild(marker);
    }
  });
}

async function auditScene(page) {
  return page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    const commandScene = experience.commandScene;
    const renderer = experience.engine.renderer;
    const canvas = renderer.domElement;
    const canvasRectRaw = canvas.getBoundingClientRect();
    const canvasRect = {
      left: canvasRectRaw.left,
      top: canvasRectRaw.top,
      right: canvasRectRaw.right,
      bottom: canvasRectRaw.bottom,
      width: canvasRectRaw.width,
      height: canvasRectRaw.height
    };
    const tagged = [];
    const projectedWindows = [];
    const effectivelyVisible = object => {
      for (let current = object; current; current = current.parent) {
        if (!current.visible) return false;
      }
      return true;
    };
    const project = object => {
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return null;
      const corners = [];
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
        }
      }
      const ndc = corners.map(point => point.project(commandScene.camera));
      if (ndc.every(point => point.z < -1 || point.z > 1)) return null;
      let left = Math.min(...ndc.map(point => (point.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left));
      let right = Math.max(...ndc.map(point => (point.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left));
      let top = Math.min(...ndc.map(point => (-point.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top));
      let bottom = Math.max(...ndc.map(point => (-point.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top));
      left = Math.max(canvasRect.left, left);
      right = Math.min(canvasRect.right, right);
      top = Math.max(canvasRect.top, top);
      bottom = Math.min(canvasRect.bottom, bottom);
      if (right - left < 1 || bottom - top < 1) return null;
      return { left, right, top, bottom, width: right - left, height: bottom - top };
    };

    commandScene.scene.traverse(object => {
      if (!object.isMesh || object.userData?.render_role !== 'window_emissive') return;
      const visible = effectivelyVisible(object);
      const materials = (Array.isArray(object.material) ? object.material : [object.material])
        .filter(Boolean)
        .map(material => {
          const map = material.emissiveMap;
          return {
            name: material.name || '',
            emissiveMap: Boolean(map),
            mapSize: [
              map?.image?.width || map?.image?.naturalWidth || 0,
              map?.image?.height || map?.image?.naturalHeight || 0
            ],
            emissiveIntensity: Number(material.emissiveIntensity) || 0,
            authoredIntensity: Number(material.userData?.baseEmissiveIntensity) || 0
          };
        });
      const projection = visible ? project(object) : null;
      tagged.push({ object: object.name, visible, materials, projection });
      if (projection) projectedWindows.push({ name: object.name, ...projection });
    });

    const gl = renderer.getContext();
    while (gl.getError() !== gl.NO_ERROR) {}
    const bloom = commandScene.windowBloom;
    const depthTexture = bloom._sceneTarget?.depthTexture || null;
    return {
      selectedDistrictId: commandScene.selectedDistrictId,
      active: commandScene.active,
      loaded: commandScene.loaded,
      tagged,
      projectedWindows,
      canvasRect,
      drawingBuffer: { width: canvas.width, height: canvas.height },
      fog: commandScene.scene.fog ? {
        type: commandScene.scene.fog.isFogExp2
          ? 'FogExp2'
          : commandScene.scene.fog.isFog
            ? 'Fog'
            : 'Unknown',
        density: Number(commandScene.scene.fog.density) || 0
      } : null,
      depth: {
        allocated: Boolean(depthTexture),
        isDepthTexture: Boolean(depthTexture?.isDepthTexture),
        width: bloom._sceneTarget?.width || 0,
        height: bloom._sceneTarget?.height || 0
      },
      telemetry: bloom.getTelemetry(),
      contextLost: gl.isContextLost()
    };
  });
}

function summarizeSceneAudit(audit) {
  const bindings = audit.tagged.flatMap(entry => entry.materials.map(material => ({
    object: entry.object,
    visible: entry.visible,
    ...material
  })));
  return {
    selectedDistrictId: audit.selectedDistrictId,
    active: audit.active,
    loaded: audit.loaded,
    taggedWindowCount: audit.tagged.length,
    visibleTaggedWindowCount: audit.tagged.filter(entry => entry.visible).length,
    materialBindingCount: bindings.length,
    uniqueMaterialNames: [...new Set(bindings.map(binding => binding.name))],
    invalidBindings: bindings.filter(binding => !binding.emissiveMap
      || binding.mapSize[0] !== expectedMapSize
      || binding.mapSize[1] !== expectedMapSize
      || binding.emissiveIntensity < minimumIntensity),
    projectedWindowCount: audit.projectedWindows.length,
    projectedWindows: audit.projectedWindows,
    canvasRect: audit.canvasRect,
    drawingBuffer: audit.drawingBuffer,
    fog: audit.fog,
    depth: audit.depth,
    telemetry: audit.telemetry,
    contextLost: audit.contextLost
  };
}

async function setBloomAndRender(page, enabled, frameCount = 2) {
  return page.evaluate(({ enabled, frameCount }) => {
    const experience = window.__MASSFRONT_SPACE__;
    const commandScene = experience.commandScene;
    const bloom = commandScene.windowBloom;
    const gl = experience.engine.renderer.getContext();
    if (!commandScene.focusDistrict('factions', false)) {
      throw new Error('The factions focus anchor became unavailable.');
    }
    commandScene.update(0, 0);
    const cameraBefore = {
      position: commandScene.camera.position.toArray(),
      quaternion: commandScene.camera.quaternion.toArray(),
      aspect: commandScene.camera.aspect
    };
    while (gl.getError() !== gl.NO_ERROR) {}
    bloom.setEnabled(enabled);
    for (let i = 0; i < frameCount; i++) commandScene.render();
    gl.finish();
    const glError = gl.getError();
    const rendererCanvas = experience.engine.renderer.domElement;
    const copy = document.createElement('canvas');
    copy.width = rendererCanvas.width;
    copy.height = rendererCanvas.height;
    const copyContext = copy.getContext('2d', { alpha: false });
    copyContext.drawImage(rendererCanvas, 0, 0);
    const framebufferPng = copy.toDataURL('image/png');
    const cameraAfter = {
      position: commandScene.camera.position.toArray(),
      quaternion: commandScene.camera.quaternion.toArray(),
      aspect: commandScene.camera.aspect
    };
    return {
      telemetry: bloom.getTelemetry(),
      glError,
      contextLost: gl.isContextLost(),
      experienceRecovering: experience.recovering,
      engineContextLost: experience.engine.contextLost,
      cameraBefore,
      cameraAfter,
      viewport: experience.engine.renderer.getViewport(new THREE.Vector4()).toArray(),
      framebufferPng
    };
  }, { enabled, frameCount });
}

async function sampleFrameCost(page, sampleCount = 14) {
  return page.evaluate(sampleCount => {
    const experience = window.__MASSFRONT_SPACE__;
    const commandScene = experience.commandScene;
    const gl = experience.engine.renderer.getContext();
    const samples = [];
    commandScene.windowBloom.setEnabled(true);
    commandScene.render();
    gl.finish();
    for (let i = 0; i < sampleCount; i++) {
      const started = performance.now();
      commandScene.render();
      gl.finish();
      samples.push(performance.now() - started);
    }
    return samples;
  }, sampleCount);
}

async function forceContextRecovery(page) {
  return page.evaluate(async () => {
    const experience = window.__MASSFRONT_SPACE__;
    const gl = experience.engine.renderer.getContext();
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is unavailable.');
    const canvas = experience.engine.renderer.domElement;
    const before = {
      losses: window.__mfWindowGlowContextLosses || 0,
      restores: window.__mfWindowGlowContextRestores || 0
    };
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for webglcontextrestored.')), 20_000);
      canvas.addEventListener('webglcontextrestored', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 180);
    });
    return {
      extensionAvailable: true,
      before,
      after: {
        losses: window.__mfWindowGlowContextLosses || 0,
        restores: window.__mfWindowGlowContextRestores || 0
      }
    };
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  url,
  viewport: { ...viewport, deviceScaleFactor: 1 },
  output: rel(outputRoot),
  hashes: [],
  gpu: null,
  captures: {},
  materials: null,
  initial: null,
  recovery: null,
  performance: null,
  checks: {},
  runtimeErrors: [],
  consoleErrors: [],
  requestFailures: [],
  fatal: null
};

const sourcePaths = [
  fileURLToPath(import.meta.url),
  join(moduleRoot, 'src', 'core', 'window_emissive_bloom.js'),
  join(moduleRoot, 'src', 'core', 'uga_command_scene.js'),
  join(moduleRoot, 'src', 'ship', 'uga_blender_assets.js'),
  join(moduleRoot, 'assets', 'models', 'uga-command-cutaway.glb')
];
report.hashes = await Promise.all(sourcePaths.map(hashFile));

let browser;
let page;
try {
  browser = await launchPwBrowser();
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  report.gpu = await assertHardwareGpu(gpuPage);
  await gpuPage.close();

  page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__mfWindowGlowContextLosses = 0;
    window.__mfWindowGlowContextRestores = 0;
    document.addEventListener('webglcontextlost', () => {
      window.__mfWindowGlowContextLosses++;
    }, true);
    document.addEventListener('webglcontextrestored', () => {
      window.__mfWindowGlowContextRestores++;
    }, true);
  });
  page.on('pageerror', error => report.runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    report.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'unknown'}`);
  });

  await prepareShowcase(page);
  const materialAudit = await auditScene(page);
  report.materials = summarizeSceneAudit(materialAudit);

  const disabledState = await setBloomAndRender(page, false, 2);
  const disabledDomUi = await readDomUiState(page);
  const disabledCanvas = await saveDataUrl('factions-canvas-bloom-disabled.png', disabledState.framebufferPng);
  delete disabledState.framebufferPng;
  const disabled = await saveScreenshot(page, 'factions-bloom-disabled.png');
  const disabledHeader = await saveLocatorScreenshot(page.locator('.uga-command-header'), 'factions-ui-header-bloom-disabled.png');
  const disabledMarker = await saveLocatorScreenshot(page.locator('#mfWindowGlowUiProbe'), 'factions-ui-probe-bloom-disabled.png');

  const enabledState = await setBloomAndRender(page, true, 2);
  const enabledDomUi = await readDomUiState(page);
  const enabledCanvas = await saveDataUrl('factions-canvas-bloom-enabled.png', enabledState.framebufferPng);
  delete enabledState.framebufferPng;
  const enabled = await saveScreenshot(page, 'factions-bloom-enabled.png');
  const enabledHeader = await saveLocatorScreenshot(page.locator('.uga-command-header'), 'factions-ui-header-bloom-enabled.png');
  const enabledMarker = await saveLocatorScreenshot(page.locator('#mfWindowGlowUiProbe'), 'factions-ui-probe-bloom-enabled.png');

  const initialAnalysis = await analysePair(
    page,
    disabledCanvas.bytes,
    enabledCanvas.bytes,
    materialAudit.projectedWindows,
    materialAudit.canvasRect
  );
  report.initial = {
    disabledState,
    enabledState,
    analysis: initialAnalysis,
    imageChecks: imageChecks(initialAnalysis, materialAudit.drawingBuffer),
    ui: {
      headerByteIdentical: sameBytes(disabledHeader.bytes, enabledHeader.bytes),
      markerByteIdentical: sameBytes(disabledMarker.bytes, enabledMarker.bytes),
      domStateIdentical: JSON.stringify(disabledDomUi) === JSON.stringify(enabledDomUi),
      disabledDomUi,
      enabledDomUi,
      disabledHeaderSha256: createHash('sha256').update(disabledHeader.bytes).digest('hex'),
      enabledHeaderSha256: createHash('sha256').update(enabledHeader.bytes).digest('hex'),
      disabledMarkerSha256: createHash('sha256').update(disabledMarker.bytes).digest('hex'),
      enabledMarkerSha256: createHash('sha256').update(enabledMarker.bytes).digest('hex')
    }
  };
  report.captures.initial = [
    disabled.path,
    enabled.path,
    disabledCanvas.path,
    enabledCanvas.path,
    disabledHeader.path,
    enabledHeader.path,
    disabledMarker.path,
    enabledMarker.path
  ].map(rel);

  report.performance = frameCostSummary(await sampleFrameCost(page));
  const telemetryBeforeLoss = await page.evaluate(() => (
    window.__MASSFRONT_SPACE__.commandScene.windowBloom.getTelemetry()
  ));
  const contextEvent = await forceContextRecovery(page);
  await page.waitForFunction(() => {
    const experience = window.__MASSFRONT_SPACE__;
    return experience
      && !experience.recovering
      && !experience.engine.contextLost
      && window.__mfWindowGlowContextLosses >= 1
      && window.__mfWindowGlowContextRestores >= 1;
  }, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const experience = window.__MASSFRONT_SPACE__;
    experience.commandScene.focusDistrict('factions', false);
    experience.commandScene.update(0, 0);
  });
  const restoredAudit = await auditScene(page);

  const restoredDisabledState = await setBloomAndRender(page, false, 2);
  const restoredDisabledDomUi = await readDomUiState(page);
  const restoredDisabledCanvas = await saveDataUrl(
    'factions-context-restored-canvas-bloom-disabled.png',
    restoredDisabledState.framebufferPng
  );
  delete restoredDisabledState.framebufferPng;
  const restoredDisabled = await saveScreenshot(page, 'factions-context-restored-bloom-disabled.png');
  const restoredDisabledHeader = await saveLocatorScreenshot(page.locator('.uga-command-header'), 'factions-context-restored-ui-header-bloom-disabled.png');
  const restoredDisabledMarker = await saveLocatorScreenshot(page.locator('#mfWindowGlowUiProbe'), 'factions-context-restored-ui-probe-bloom-disabled.png');

  const restoredEnabledState = await setBloomAndRender(page, true, 3);
  const restoredEnabledDomUi = await readDomUiState(page);
  const restoredEnabledCanvas = await saveDataUrl(
    'factions-context-restored-canvas-bloom-enabled.png',
    restoredEnabledState.framebufferPng
  );
  delete restoredEnabledState.framebufferPng;
  const restoredEnabled = await saveScreenshot(page, 'factions-context-restored-bloom-enabled.png');
  const restoredEnabledHeader = await saveLocatorScreenshot(page.locator('.uga-command-header'), 'factions-context-restored-ui-header-bloom-enabled.png');
  const restoredEnabledMarker = await saveLocatorScreenshot(page.locator('#mfWindowGlowUiProbe'), 'factions-context-restored-ui-probe-bloom-enabled.png');
  const restoredAnalysis = await analysePair(
    page,
    restoredDisabledCanvas.bytes,
    restoredEnabledCanvas.bytes,
    restoredAudit.projectedWindows,
    restoredAudit.canvasRect
  );

  const recoveryCounters = await page.evaluate(() => ({
    losses: window.__mfWindowGlowContextLosses || 0,
    restores: window.__mfWindowGlowContextRestores || 0
  }));
  report.recovery = {
    contextEvent,
    counters: recoveryCounters,
    telemetryBeforeLoss,
    restoredAudit: summarizeSceneAudit(restoredAudit),
    disabledState: restoredDisabledState,
    enabledState: restoredEnabledState,
    analysis: restoredAnalysis,
    imageChecks: imageChecks(restoredAnalysis, restoredAudit.drawingBuffer),
    ui: {
      headerByteIdentical: sameBytes(restoredDisabledHeader.bytes, restoredEnabledHeader.bytes),
      markerByteIdentical: sameBytes(restoredDisabledMarker.bytes, restoredEnabledMarker.bytes),
      domStateIdentical: JSON.stringify(restoredDisabledDomUi) === JSON.stringify(restoredEnabledDomUi),
      disabledDomUi: restoredDisabledDomUi,
      enabledDomUi: restoredEnabledDomUi
    }
  };
  report.captures.recovery = [
    restoredDisabled.path,
    restoredEnabled.path,
    restoredDisabledCanvas.path,
    restoredEnabledCanvas.path,
    restoredDisabledHeader.path,
    restoredEnabledHeader.path,
    restoredDisabledMarker.path,
    restoredEnabledMarker.path
  ].map(rel);

  const materialBindings = materialAudit.tagged.flatMap(entry => entry.materials);
  const initialTelemetry = enabledState.telemetry;
  const restoredTelemetry = restoredEnabledState.telemetry;
  report.checks = {
    showcaseReady: materialAudit.active
      && materialAudit.loaded
      && materialAudit.selectedDistrictId === 'factions',
    taggedWindowsPresent: materialAudit.tagged.length > 0,
    visibleProjectedWindowsPresent: materialAudit.projectedWindows.length > 0,
    dedicatedWindowMaterial: materialBindings.length > 0
      && materialBindings.every(material => material.name === expectedMaterial),
    emissiveInputsValid: materialBindings.length > 0
      && materialBindings.every(material => material.emissiveMap
        && material.mapSize[0] === expectedMapSize
        && material.mapSize[1] === expectedMapSize
        && material.emissiveIntensity >= minimumIntensity),
    fogEnabled: materialAudit.fog?.type === 'FogExp2' && materialAudit.fog.density > 0,
    depthTargetAllocated: materialAudit.depth.allocated
      && materialAudit.depth.isDepthTexture
      && materialAudit.depth.width > 0
      && materialAudit.depth.height > 0,
    initialBloomSucceeded: initialTelemetry.enabled
      && !initialTelemetry.failed
      && initialTelemetry.lastMode === 'bloom'
      && initialTelemetry.bloomFrames > 0
      && initialTelemetry.fallbackFrames === 0
      && initialTelemetry.passRenderCalls === 5
      && !initialTelemetry.lastError
      && enabledState.glError === 0
      && !enabledState.contextLost
      && JSON.stringify(disabledState.cameraBefore) === JSON.stringify(disabledState.cameraAfter)
      && JSON.stringify(enabledState.cameraBefore) === JSON.stringify(enabledState.cameraAfter)
      && JSON.stringify(disabledState.cameraAfter) === JSON.stringify(enabledState.cameraAfter),
    initialLocalizedHalo: Object.values(report.initial.imageChecks).every(Boolean),
    initialUiUnaffected: report.initial.ui.markerByteIdentical
      && report.initial.ui.domStateIdentical,
    contextLossObserved: contextEvent.after.losses > contextEvent.before.losses
      && recoveryCounters.losses >= 1,
    contextRestoreObserved: contextEvent.after.restores > contextEvent.before.restores
      && recoveryCounters.restores >= 1,
    restoredBloomResumed: restoredTelemetry.enabled
      && !restoredTelemetry.failed
      && restoredTelemetry.lastMode === 'bloom'
      && restoredTelemetry.bloomFrames > telemetryBeforeLoss.bloomFrames
      && restoredTelemetry.invalidations > telemetryBeforeLoss.invalidations
      && restoredTelemetry.lastInvalidation === 'webgl-context-restored'
      && restoredTelemetry.fallbackFrames === 0
      && restoredTelemetry.passRenderCalls === 5
      && !restoredTelemetry.lastError
      && restoredEnabledState.glError === 0
      && !restoredEnabledState.contextLost
      && !restoredEnabledState.experienceRecovering
      && !restoredEnabledState.engineContextLost
      && JSON.stringify(restoredDisabledState.cameraBefore) === JSON.stringify(restoredDisabledState.cameraAfter)
      && JSON.stringify(restoredEnabledState.cameraBefore) === JSON.stringify(restoredEnabledState.cameraAfter)
      && JSON.stringify(restoredDisabledState.cameraAfter) === JSON.stringify(restoredEnabledState.cameraAfter),
    restoredLocalizedHalo: Object.values(report.recovery.imageChecks).every(Boolean),
    restoredUiUnaffected: report.recovery.ui.markerByteIdentical
      && report.recovery.ui.domStateIdentical,
    frameBudget: report.performance.samples >= 10 && report.performance.p95Ms <= 33.3,
    runtimeClean: report.runtimeErrors.length === 0
      && report.consoleErrors.length === 0
      && report.requestFailures.length === 0
  };
} catch (error) {
  report.fatal = {
    name: error.name,
    message: error.message,
    stack: error.stack
  };
  process.exitCode = 1;
} finally {
  if (page) {
    await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()).catch(() => {});
    await page.close().catch(() => {});
  }
  await Promise.race([
    closePwBrowser(),
    new Promise(resolveTimeout => setTimeout(resolveTimeout, 5000))
  ]);
  const allChecksPass = Object.keys(report.checks).length > 0
    && Object.values(report.checks).every(value => value === true);
  if (!allChecksPass) process.exitCode = 1;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    report: rel(reportPath),
    gpu: report.gpu,
    checks: report.checks,
    fatal: report.fatal,
    runtimeErrors: report.runtimeErrors,
    consoleErrors: report.consoleErrors,
    requestFailures: report.requestFailures,
    performance: report.performance
  }, null, 2));
}

process.exit(process.exitCode || 0);
