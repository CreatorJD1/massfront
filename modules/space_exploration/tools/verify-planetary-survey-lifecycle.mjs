import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from '../../../tools/pw-browser.mjs';

const observeOnly = process.argv.includes('--observe');
const moduleRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const mime = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
        .replace(/^\/+/, '');
      const pathname = resolve(moduleRoot, relative);
      if (pathname !== moduleRoot && !pathname.startsWith(`${moduleRoot}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(pathname);
      if (!info.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': mime.get(extname(pathname).toLowerCase()) || 'application/octet-stream',
        'content-length': info.size
      });
      response.end(await readFile(pathname));
    } catch (_) {
      response.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function lifecycleInstrumentation() {
  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  const listenerTargets = new WeakMap();
  const listenerRecords = new Set();

  const captureOf = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
  const recordFor = (target, type, callback, capture) => {
    let records = listenerTargets.get(target);
    if (!records) {
      records = [];
      listenerTargets.set(target, records);
    }
    return { records, match: records.find(entry => entry.type === type && entry.callback === callback && entry.capture === capture) };
  };

  EventTarget.prototype.addEventListener = function (type, callback, options) {
    if (callback) {
      const capture = captureOf(options);
      const found = recordFor(this, type, callback, capture);
      if (!found.match) {
        const record = { target: this, type, callback, capture };
        found.records.push(record);
        listenerRecords.add(record);
      }
    }
    return nativeAdd.call(this, type, callback, options);
  };

  EventTarget.prototype.removeEventListener = function (type, callback, options) {
    if (callback) {
      const capture = captureOf(options);
      const found = recordFor(this, type, callback, capture);
      if (found.match) {
        found.records.splice(found.records.indexOf(found.match), 1);
        listenerRecords.delete(found.match);
      }
    }
    return nativeRemove.call(this, type, callback, options);
  };

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCancelRaf = window.cancelAnimationFrame.bind(window);
  const pendingRaf = new Map();
  window.requestAnimationFrame = callback => {
    let id = 0;
    id = nativeRaf(timestamp => {
      pendingRaf.delete(id);
      callback(timestamp);
    });
    pendingRaf.set(id, callback?.name || '(anonymous)');
    return id;
  };
  window.cancelAnimationFrame = id => {
    pendingRaf.delete(id);
    return nativeCancelRaf(id);
  };

  const NativeResizeObserver = window.ResizeObserver;
  const activeResizeObservers = new Set();
  if (NativeResizeObserver) {
    window.ResizeObserver = class TrackedResizeObserver extends NativeResizeObserver {
      observe(target, options) {
        activeResizeObservers.add(this);
        return super.observe(target, options);
      }
      disconnect() {
        activeResizeObservers.delete(this);
        return super.disconnect();
      }
    };
  }

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  const webglRecords = new Set();
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const context = nativeGetContext.call(this, kind, ...args);
    if (context && /^(webgl|webgl2|experimental-webgl)$/.test(String(kind))) {
      let record = [...webglRecords].find(entry => entry.canvas === this && entry.context === context);
      if (!record) {
        record = { canvas: this, context, lost: false };
        webglRecords.add(record);
        nativeAdd.call(this, 'webglcontextlost', () => { record.lost = true; }, false);
        nativeAdd.call(this, 'webglcontextrestored', () => { record.lost = false; }, false);
      }
    }
    return context;
  };

  window.__surveyLifecycleProbe = {
    snapshot(label) {
      const liveListeners = [...listenerRecords].filter(entry => {
        const target = entry.target;
        return target === window || target === document || !(target instanceof Node) || target.isConnected;
      });
      const liveListenerTypes = {};
      for (const entry of liveListeners) liveListenerTypes[entry.type] = (liveListenerTypes[entry.type] || 0) + 1;
      const surveySelectorListeners = liveListeners.filter(entry => {
        const target = entry.target;
        return target instanceof Element && (
          target.id === 'surveyPlanetSelector'
          || target.matches?.('.survey-planet-pill')
          || target.closest?.('#surveyPlanetSelector')
        );
      });
      const pendingRafByCallback = {};
      for (const callbackName of pendingRaf.values()) {
        pendingRafByCallback[callbackName] = (pendingRafByCallback[callbackName] || 0) + 1;
      }
      const lifecycleTypes = new Set([
        'pagehide', 'pointercancel', 'pointerdown', 'pointermove', 'pointerup',
        'touchcancel', 'touchend', 'touchmove', 'touchstart',
        'webglcontextlost', 'webglcontextrestored'
      ]);
      const lifecycleListeners = liveListeners.filter(entry => lifecycleTypes.has(entry.type));
      const activeRecords = [...webglRecords].filter(entry => {
        try { return !entry.lost && !entry.context.isContextLost(); } catch (_) { return false; }
      });
      const connectedRecords = [...webglRecords].filter(entry => entry.canvas.isConnected);
      return {
        label,
        canvasCount: document.querySelectorAll('canvas').length,
        surveyCanvasCount: document.querySelectorAll('canvas#surveyGlobeCanvas').length,
        webglContextsCreated: webglRecords.size,
        connectedWebglCanvases: connectedRecords.length,
        activeWebglContexts: activeRecords.length,
        activeListeners: liveListeners.length,
        lifecycleListeners: lifecycleListeners.length,
        surveySelectorListeners: surveySelectorListeners.length,
        listenerTypes: Object.fromEntries(Object.entries(liveListenerTypes).sort()),
        pendingRaf: pendingRaf.size,
        pendingRafByCallback,
        surveyOscilloscopeRaf: pendingRafByCallback.renderOscilloscope || 0,
        activeResizeObservers: activeResizeObservers.size
      };
    }
  };
}

function sameBaseline(baseline, sample) {
  return [
    'canvasCount',
    'surveyCanvasCount',
    'connectedWebglCanvases',
    'activeWebglContexts',
    'lifecycleListeners',
    'activeResizeObservers'
  ].every(key => sample[key] === baseline[key]);
}

const { server, url } = await startServer();
const browser = await launchPwBrowser();
let page;

try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await page.addInitScript(lifecycleInstrumentation);
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30000 });
  } catch (error) {
    const veil = await page.locator('#renderVeil').textContent().catch(() => 'render veil unavailable');
    throw new Error(`${error.message}\nRuntime errors:\n${runtimeErrors.join('\n') || '(none)'}\nVeil: ${String(veil).trim()}`);
  }
  await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
  await page.waitForTimeout(800);

  const report = await page.evaluate(async () => {
    const experience = window.__MASSFRONT_SPACE__;
    const probe = window.__surveyLifecycleProbe;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    experience.openSystem();
    experience.pause();
    await wait(150);
    const baseline = probe.snapshot('baseline-system');
    const cycles = [];
    let selectorDelegationWorked = false;

    for (let cycle = 1; cycle <= 5; cycle++) {
      experience.openSurvey();
      await wait(250);
      if (cycle === 1) {
        const pills = [...document.querySelectorAll('#surveyPlanetSelector .survey-planet-pill')];
        if (pills.length > 1) {
          const expectedName = pills[1].textContent.trim();
          pills[1].click();
          await wait(150);
          selectorDelegationWorked = document.querySelector('#surveyModalTitle')?.textContent.includes(expectedName) || false;
        }
      }
      const open = probe.snapshot(`cycle-${cycle}-open`);
      experience.openSystem();
      await wait(350);
      const closed = probe.snapshot(`cycle-${cycle}-closed`);
      cycles.push({ cycle, open, closed });
    }

    const final = probe.snapshot('final-system');
    experience.resume();
    experience.openSurvey();
    await wait(250);
    const beforeExperienceDispose = probe.snapshot('before-experience-dispose');
    experience.dispose();
    await wait(350);

    return {
      baseline,
      cycles,
      selectorDelegationWorked,
      final,
      beforeExperienceDispose,
      afterExperienceDispose: probe.snapshot('after-experience-dispose'),
      scene: experience.scene
    };
  });

  report.observeOnly = observeOnly;
  report.runtimeErrors = runtimeErrors;
  report.closedCyclesAtBaseline = report.cycles.filter(cycle => sameBaseline(report.baseline, cycle.closed)).length;
  report.allClosedCyclesAtBaseline = report.closedCyclesAtBaseline === report.cycles.length;
  report.rafStableAfterFirstClose = report.cycles.every(cycle => cycle.closed.pendingRaf === report.cycles[0].closed.pendingRaf);
  report.connectedListenerCountStableAfterFirstClose = report.cycles.every(cycle => cycle.closed.activeListeners === report.cycles[0].closed.activeListeners);
  report.maxConnectedWebglCanvases = Math.max(report.baseline.connectedWebglCanvases, ...report.cycles.map(cycle => cycle.open.connectedWebglCanvases));
  report.maxActiveWebglContexts = Math.max(report.baseline.activeWebglContexts, ...report.cycles.map(cycle => cycle.open.activeWebglContexts));
  console.log(JSON.stringify(report, null, 2));

  if (!observeOnly) {
    if (runtimeErrors.length) throw new Error(runtimeErrors.join('\n'));
    if (!report.allClosedCyclesAtBaseline) {
      throw new Error(`Survey lifecycle failed to return to baseline: ${report.closedCyclesAtBaseline}/${report.cycles.length} cycles`);
    }
    if (!report.rafStableAfterFirstClose || !report.connectedListenerCountStableAfterFirstClose) {
      throw new Error('Repeated survey cycles accumulated RAF callbacks or connected listeners.');
    }
    if (!report.selectorDelegationWorked) throw new Error('Delegated survey planet selection did not update the active planet.');
    if (report.maxConnectedWebglCanvases > report.baseline.connectedWebglCanvases + 1) {
      throw new Error(`Survey allocated more than one transient WebGL canvas: ${report.maxConnectedWebglCanvases}`);
    }
    if (report.maxActiveWebglContexts > report.baseline.activeWebglContexts + 1) {
      throw new Error(`Survey allocated more than one transient WebGL context: ${report.maxActiveWebglContexts}`);
    }
    if (
      report.afterExperienceDispose.surveyCanvasCount !== 0
      || report.afterExperienceDispose.connectedWebglCanvases !== 0
      || report.afterExperienceDispose.activeWebglContexts !== 0
    ) {
      throw new Error(`Full experience disposal retained survey GPU state: ${JSON.stringify(report.afterExperienceDispose)}`);
    }
    if (report.beforeExperienceDispose.surveyOscilloscopeRaf !== 1) {
      throw new Error(`Expected exactly one live survey oscilloscope RAF before disposal: ${JSON.stringify(report.beforeExperienceDispose)}`);
    }
    if (
      report.afterExperienceDispose.pendingRaf !== 0
      || report.afterExperienceDispose.surveyOscilloscopeRaf !== 0
      || report.afterExperienceDispose.surveySelectorListeners !== 0
    ) {
      throw new Error(`Full experience disposal retained survey callbacks: ${JSON.stringify(report.afterExperienceDispose)}`);
    }
  }
} finally {
  if (page) {
    await page.evaluate(() => window.__MASSFRONT_SPACE__?.dispose?.()).catch(() => {});
    await page.close().catch(() => {});
  }
  await Promise.race([closePwBrowser(), new Promise(resolve => setTimeout(resolve, 5000))]);
  await new Promise(resolve => server.close(resolve));
}
