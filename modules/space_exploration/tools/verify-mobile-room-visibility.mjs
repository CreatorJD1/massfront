import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership, closePwBrowser, launchPwBrowser, pwBrowserEvidence, recordPwBrowserGpu
} from '../../../tools/pw-browser.mjs';
import { assertHardwareGpu } from '../../../tools/chrome-gpu.mjs';

const execFile = promisify(execFileCallback);
const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(moduleRoot, '..', '..');
const evidenceRoot = join(moduleRoot, 'tmp', 'mobile-room-visibility');
const runStartedUtc = new Date().toISOString();
const runId = runStartedUtc.replace(/[:.]/g, '-');
const output = join(evidenceRoot, 'runs', runId);
const requestedUrl = process.env.MF_SPACE_URL || 'http://127.0.0.1:9013/modules/space_exploration/index.html';
const expectedManifestPath = process.env.MF_MOBILE_ROOM_EXPECTED_HASHES
  ? resolve(process.env.MF_MOBILE_ROOM_EXPECTED_HASHES)
  : join(evidenceRoot, 'expected-hashes.json');
const MIN_TOUCH_PX = 44;
const MIN_TOUCH_GAP_PX = 4;
const viewports = [
  { id: 'phone-430x932', width: 430, height: 932, formFactor: 'phone-portrait' },
  { id: 'phone-412x915', width: 412, height: 915, formFactor: 'phone-portrait' },
  { id: 'phone-landscape-915x412', width: 915, height: 412, formFactor: 'phone-landscape' },
  { id: 'tablet-768x1024', width: 768, height: 1024, formFactor: 'tablet-portrait' },
];
const sourceEntries = [
  { key: 'index.html', local: join(moduleRoot, 'index.html'), served: 'index.html' },
  { key: 'src/ui/uga_command.css', local: join(moduleRoot, 'src', 'ui', 'uga_command.css'), served: 'src/ui/uga_command.css' },
  { key: 'src/ui/uga_command.js', local: join(moduleRoot, 'src', 'ui', 'uga_command.js'), served: 'src/ui/uga_command.js' },
  { key: 'src/core/uga_command_scene.js', local: join(moduleRoot, 'src', 'core', 'uga_command_scene.js'), served: 'src/core/uga_command_scene.js' },
  { key: 'src/core/window_emissive_bloom.js', local: join(moduleRoot, 'src', 'core', 'window_emissive_bloom.js'), served: 'src/core/window_emissive_bloom.js' },
  { key: 'assets/models/uga-command-cutaway.glb', local: join(moduleRoot, 'assets', 'models', 'uga-command-cutaway.glb'), served: 'assets/models/uga-command-cutaway.glb' },
];

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function sha256(path) {
  return hashBuffer(await readFile(path));
}

function hashObject(value) {
  return hashBuffer(Buffer.from(JSON.stringify(value)));
}

async function git(args) {
  const { stdout } = await execFile('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return stdout.trimEnd();
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(sourceEntries.map(async entry => [entry.key, await sha256(entry.local)])));
}

async function provenanceSnapshot() {
  const [head, status, hashes] = await Promise.all([
    git(['rev-parse', 'HEAD']),
    git(['status', '--porcelain=v1', '--untracked-files=all']),
    sourceHashes(),
  ]);
  const workspaceDirtyEntries = status ? status.split(/\r?\n/).filter(Boolean) : [];
  const sourceBearingEntries = workspaceDirtyEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return !path.startsWith('.tmp/') && !path.startsWith('modules/space_exploration/tmp/');
  });
  const dirtyEntries = sourceBearingEntries.filter(line => {
    const path = line.slice(3).replace(/\\/g, '/');
    return path.startsWith('modules/space_exploration/') || ['tools/pw-browser.mjs', 'tools/chrome-gpu.mjs'].includes(path);
  });
  return {
    head,
    dirty: dirtyEntries.length > 0,
    dirtyEntryCount: dirtyEntries.length,
    dirtyFingerprint: hashBuffer(Buffer.from(dirtyEntries.join('\n'))),
    workspaceDirtyEntryCount: workspaceDirtyEntries.length,
    workspaceDirtyFingerprint: hashBuffer(Buffer.from(status)),
    workspaceSourceDirtyEntryCount: sourceBearingEntries.length,
    workspaceSourceDirtyFingerprint: hashBuffer(Buffer.from(sourceBearingEntries.join('\n'))),
    dirtyScope: 'space exploration module + owned browser/GPU harness; generated evidence excluded',
    excludedGeneratedEvidenceEntries: workspaceDirtyEntries.length - sourceBearingEntries.length,
    runtimeFingerprint: hashObject(hashes),
    sourceHashes: hashes,
  };
}

async function readExpectedManifest() {
  try {
    const manifest = JSON.parse(await readFile(expectedManifestPath, 'utf8'));
    return { configured: true, path: expectedManifestPath, manifest };
  } catch (error) {
    if (error?.code === 'ENOENT') return { configured: false, path: expectedManifestPath, manifest: null };
    throw new Error(`Expected-hash manifest is invalid (${expectedManifestPath}): ${error.message}`);
  }
}

function compareExpected(actual = {}, expected = null) {
  if (!expected || typeof expected !== 'object' || !Object.keys(expected).length) {
    return { configured: false, pass: true, matched: [], missing: [], mismatched: [] };
  }
  const matched = [];
  const missing = [];
  const mismatched = [];
  for (const [key, expectedHash] of Object.entries(expected)) {
    if (!actual[key]) missing.push(key);
    else if (actual[key] !== expectedHash) mismatched.push({ key, expected: expectedHash, actual: actual[key] });
    else matched.push(key);
  }
  return { configured: true, pass: missing.length === 0 && mismatched.length === 0, matched, missing, mismatched };
}

async function fetchHash(resourceUrl) {
  const response = await fetch(resourceUrl, { cache: 'no-store', signal: AbortSignal.timeout(90_000) });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    url: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    contentLength: buffer.length,
    sha256: hashBuffer(buffer),
  };
}

function allTrue(record) {
  return Object.values(record).every(value => value === true);
}

async function measure(page) {
  return page.evaluate(({ minTouch, minGap }) => {
    const root = document.querySelector('.uga-command-shell');
    const visual = window.visualViewport;
    const visualBounds = {
      left: visual?.offsetLeft || 0,
      top: visual?.offsetTop || 0,
      right: (visual?.offsetLeft || 0) + (visual?.width || innerWidth),
      bottom: (visual?.offsetTop || 0) + (visual?.height || innerHeight),
      width: visual?.width || innerWidth,
      height: visual?.height || innerHeight,
    };
    const rectObject = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
      };
    };
    const selectorRect = selector => rectObject(document.querySelector(selector));
    const shown = element => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const intersect = (a, b) => {
      if (!a || !b) return null;
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : null;
    };
    const overlapArea = (a, b) => {
      const overlap = intersect(a, b);
      return overlap ? overlap.width * overlap.height : 0;
    };
    const label = element => {
      const explicit = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('name');
      const text = explicit || element.textContent || element.value || element.id || element.tagName;
      return String(text).trim().replace(/\s+/g, ' ').slice(0, 100);
    };
    const selectorFor = element => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const data = [...element.attributes].find(attribute => attribute.name.startsWith('data-') && attribute.value);
      if (data) return `${element.tagName.toLowerCase()}[${data.name}="${CSS.escape(data.value)}"]`;
      const classes = [...element.classList].slice(0, 2).map(name => `.${CSS.escape(name)}`).join('');
      return `${element.tagName.toLowerCase()}${classes}`;
    };
    const pointInBounds = (x, y) => x >= visualBounds.left && x < visualBounds.right && y >= visualBounds.top && y < visualBounds.bottom;
    const hitMatches = (element, hit) => {
      if (!hit) return false;
      if (element === hit || element.contains(hit)) return true;
      const associatedLabel = element.labels?.[0] || element.closest('label');
      return Boolean(associatedLabel && (associatedLabel === hit || associatedLabel.contains(hit)));
    };
    const clippedRect = element => {
      let clipped = intersect(rectObject(element), visualBounds);
      for (let ancestor = element.parentElement; clipped && ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const ancestorRect = rectObject(ancestor);
        const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX);
        const clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY);
        if (!clipsX && !clipsY) continue;
        const bounds = {
          left: clipsX ? ancestorRect.left : visualBounds.left,
          right: clipsX ? ancestorRect.right : visualBounds.right,
          top: clipsY ? ancestorRect.top : visualBounds.top,
          bottom: clipsY ? ancestorRect.bottom : visualBounds.bottom,
        };
        bounds.width = bounds.right - bounds.left;
        bounds.height = bounds.bottom - bounds.top;
        clipped = intersect(clipped, bounds);
      }
      return clipped;
    };

    const stage = selectorRect('.uga-command-stage');
    const panel = selectorRect('.uga-context-panel');
    const nav = selectorRect('.uga-command-nav');
    const rail = selectorRect('.uga-district-rail');
    const railTop = selectorRect('.uga-rail-top');
    const quickActions = selectorRect('.uga-quick-actions');
    const header = selectorRect('.uga-command-header');
    const toggleElement = document.querySelector('.uga-sheet-toggle');
    const toggle = rectObject(toggleElement);
    const canvas = selectorRect('.space-render-stage canvas');
    const visualStage = intersect(stage, visualBounds);
    const occluders = ['.uga-district-rail', '.uga-rail-top', '.uga-context-panel', '.uga-quick-actions']
      .map(selector => document.querySelector(selector)).filter(shown).map(rectObject)
      .map(rect => intersect(rect, visualStage)).filter(Boolean);
    let sampled = 0;
    let openSamples = 0;
    if (visualStage) {
      const columns = 72;
      const rows = 48;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = visualStage.left + (column + .5) * visualStage.width / columns;
          const y = visualStage.top + (row + .5) * visualStage.height / rows;
          sampled++;
          if (!occluders.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) openSamples++;
        }
      }
    }
    const cutawayVisibleArea = visualStage ? visualStage.width * visualStage.height * (openSamples / Math.max(1, sampled)) : 0;

    // Literal "leaves >= 45% viewport height for the cutaway" measurement.
    // The cutaway canvas is full-viewport; every OPAQUE overlay that sits over
    // it bounds the room vertically: the header (top chrome), the district-rail
    // / rail-top chips (authored at ~0.9 alpha over the stage, and the room
    // projects UP INTO their band -- they are not floating over empty space),
    // and the inspector sheet + bottom cluster (which grows on expand). So the
    // height a state "leaves for the cutaway" is the tallest contiguous
    // vertical band clear of ALL those overlays, expressed as a fraction of
    // viewport height. We gate on the MEDIAN column (a representative slice down
    // the stage) so a single thin edge strip cannot carry the claim, and we
    // report the max column and the width-fraction meeting 45% for transparency.
    // A "sheet-only" reading (header + sheet, excluding the nav chips) is also
    // recorded to show exactly how much the chips cost.
    const runForColumn = (crowders, x) => {
      // Merge covered [top,bottom] intervals at this x, return tallest gap px.
      const spans = crowders
        .filter(rect => x >= rect.left && x <= rect.right)
        .map(rect => [Math.max(rect.top, visualStage.top), Math.min(rect.bottom, visualStage.top + visualStage.height)])
        .filter(([top, bottom]) => bottom > top)
        .sort((a, b) => a[0] - b[0]);
      let cursor = visualStage.top;
      let best = 0;
      for (const [top, bottom] of spans) {
        if (top > cursor) best = Math.max(best, top - cursor);
        cursor = Math.max(cursor, bottom);
      }
      best = Math.max(best, visualStage.top + visualStage.height - cursor);
      return best;
    };
    const clearBandProfile = (crowders) => {
      if (!visualStage) return { medianRatio: 0, maxRatio: 0, minRatio: 0, widthFractionMeeting: 0 };
      const columns = 96;
      const minBandTarget = 0.45 * visualBounds.height;
      const bands = [];
      let columnsMeeting = 0;
      for (let column = 0; column < columns; column++) {
        const x = visualStage.left + (column + .5) * visualStage.width / columns;
        const band = runForColumn(crowders, x);
        bands.push(band);
        if (band >= minBandTarget) columnsMeeting++;
      }
      bands.sort((a, b) => a - b);
      const median = bands[Math.floor(bands.length / 2)];
      const vh = Math.max(1, visualBounds.height);
      return {
        medianRatio: median / vh,
        maxRatio: bands[bands.length - 1] / vh,
        minRatio: bands[0] / vh,
        widthFractionMeeting: columnsMeeting / columns,
      };
    };
    const headerRect = intersect(rectObject(document.querySelector('.uga-command-header')), visualStage);
    const opaqueOverlays = [headerRect, ...occluders].filter(Boolean);
    const sheetOnlyCrowders = ['.uga-command-header', '.uga-context-panel', '.uga-quick-actions']
      .map(selector => document.querySelector(selector)).filter(shown).map(rectObject)
      .map(rect => intersect(rect, visualStage)).filter(Boolean);
    const cutawayClear = clearBandProfile(opaqueOverlays);
    const sheetOnlyClear = clearBandProfile(sheetOnlyCrowders);

    const interactiveElements = root ? [...root.querySelectorAll('button, a[href], select, input:not([type="hidden"]), [role="button"]')]
      .filter((element, index, list) => list.indexOf(element) === index && shown(element) && !element.matches('[disabled], [aria-disabled="true"]')) : [];
    const interactives = interactiveElements.map((element, index) => {
      const rect = rectObject(element);
      const visibleRect = clippedRect(element);
      const center = visibleRect
        ? { x: visibleRect.left + visibleRect.width / 2, y: visibleRect.top + visibleRect.height / 2 }
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const centerOnscreen = Boolean(visibleRect && pointInBounds(center.x, center.y));
      const hit = centerOnscreen ? document.elementFromPoint(center.x, center.y) : null;
      return {
        index,
        selector: selectorFor(element),
        label: label(element),
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || null,
        rect,
        visibleRect,
        onscreen: Boolean(visibleRect),
        fullyOnscreen: Boolean(visibleRect && visibleRect.width >= rect.width - 1 && visibleRect.height >= rect.height - 1),
        centerOnscreen,
        hitTarget: hit ? selectorFor(hit.closest('button, a[href], select, input:not([type="hidden"]), [role="button"]') || hit) : null,
        hitTestPass: !centerOnscreen || hitMatches(element, hit),
        sizePass: rect.width >= minTouch && rect.height >= minTouch,
        spacingGroup: element.closest('.uga-command-nav, [role="tablist"], .uga-district-list, .uga-job-controls')
          ? selectorFor(element.closest('.uga-command-nav, [role="tablist"], .uga-district-list, .uga-job-controls')) : null,
      };
    });
    const onScreenControls = interactives.filter(control => control.centerOnscreen);
    const spacingIssues = [];
    const groupedTightSpacing = [];
    for (let i = 0; i < onScreenControls.length; i++) {
      for (let j = i + 1; j < onScreenControls.length; j++) {
        const a = onScreenControls[i];
        const b = onScreenControls[j];
        const xGap = Math.max(0, Math.max(a.visibleRect.left, b.visibleRect.left) - Math.min(a.visibleRect.right, b.visibleRect.right));
        const yGap = Math.max(0, Math.max(a.visibleRect.top, b.visibleRect.top) - Math.min(a.visibleRect.bottom, b.visibleRect.bottom));
        const gap = xGap > 0 && yGap > 0 ? Math.hypot(xGap, yGap) : Math.max(xGap, yGap);
        if (gap < minGap) {
          const issue = { first: a.label, second: b.label, gap, overlapArea: overlapArea(a.visibleRect, b.visibleRect), spacingGroup: a.spacingGroup };
          // Bottom navigation and explicit tablists are authored segmented
          // controls. Shared borders are valid, but actual hit-box overlap is
          // not. Keep their tight gap in telemetry without false-failing it.
          if (a.spacingGroup && a.spacingGroup === b.spacingGroup && issue.overlapArea <= 1) groupedTightSpacing.push(issue);
          else spacingIssues.push(issue);
        }
      }
    }

    const textMetric = element => {
      if (!element || !shown(element)) return null;
      return {
        selector: selectorFor(element),
        text: String(element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        truncated: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
      };
    };
    const ribbonElement = document.querySelector('.uga-resource-ribbon');
    const ribbonRect = rectObject(ribbonElement);
    let resourceTailReachable = true;
    let ribbonScrollable = false;
    if (ribbonElement && shown(ribbonElement)) {
      const originalScrollLeft = ribbonElement.scrollLeft;
      ribbonScrollable = ribbonElement.scrollWidth > ribbonElement.clientWidth + 1;
      ribbonElement.scrollLeft = ribbonElement.scrollWidth;
      const last = ribbonElement.lastElementChild?.getBoundingClientRect();
      const visibleRibbon = intersect(ribbonRect, visualBounds);
      resourceTailReachable = !last || !visibleRibbon || last.right <= visibleRibbon.right + 1;
      ribbonElement.scrollLeft = originalScrollLeft;
    }
    const resourceText = [...document.querySelectorAll('.uga-resource b, .uga-resource small')].map(textMetric).filter(Boolean);
    const identityText = [...document.querySelectorAll('.uga-command-identity strong, .uga-command-identity span:not(.uga-command-crest)')].map(textMetric).filter(Boolean);
    const exitRect = selectorRect('.uga-command-exit');
    const resourceExitOverlap = Math.max(0, ...[...document.querySelectorAll('.uga-resource')].filter(shown).map(element => overlapArea(rectObject(element), exitRect)));
    const headerTruncation = {
      ribbonScrollable,
      resourceTailReachable,
      resourceExitOverlap,
      resourceText,
      identityText,
      issues: [...resourceText, ...identityText].filter(item => item.truncated),
    };

    const majorSelectors = ['.uga-command-shell', '.uga-command-header', '.uga-command-stage', '.uga-district-rail', '.uga-context-panel', '.uga-command-nav'];
    const majorOverflow = majorSelectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element || !shown(element)) return null;
      const style = getComputedStyle(element);
      return {
        selector,
        rect: rectObject(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        unwantedX: element.scrollWidth > element.clientWidth + 1 && ['hidden', 'clip'].includes(style.overflowX),
        unwantedY: element.scrollHeight > element.clientHeight + 1 && ['hidden', 'clip'].includes(style.overflowY),
      };
    }).filter(Boolean);
    const visualViewportIssues = majorOverflow.filter(item => {
      if (item.selector === '.uga-command-stage') return false;
      const overlap = intersect(item.rect, visualBounds);
      return !overlap || overlap.width < item.rect.width - 1 || overlap.height < item.rect.height - 1;
    }).map(item => item.selector);

    const instance = window.__MASSFRONT_SPACE__;
    const commandScene = instance?.commandScene;
    const gl = instance?.engine?.renderer?.getContext?.();
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const renderInfo = instance?.engine?.renderer?.info?.render || {};
    const sceneMeshes = commandScene?.root?.traverse ? (() => {
      let objects = 0;
      let meshes = 0;
      commandScene.root.traverse(object => { objects++; if (object.isMesh) meshes++; });
      return { objects, meshes };
    })() : { objects: 0, meshes: 0 };
    const selectedDistrictProjection = (() => {
      const district = commandScene?.districtRoots?.get?.(root?.dataset.district);
      if (!district || !commandScene?.camera || !canvas) return null;
      district.updateWorldMatrix?.(true, true);
      const points = [];
      district.traverse?.(object => {
        if (!object.isMesh || !object.visible || !object.geometry) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox?.();
        const box = object.geometry.boundingBox;
        if (!box) return;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              const point = box.min.clone().set(x, y, z).applyMatrix4(object.matrixWorld).project(commandScene.camera);
              if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z) && point.z >= -1 && point.z <= 1 && Math.abs(point.x) < 20 && Math.abs(point.y) < 20) {
                points.push({ x: canvas.left + (point.x + 1) * canvas.width / 2, y: canvas.top + (1 - point.y) * canvas.height / 2 });
              }
            }
          }
        }
      });
      if (!points.length) return { pointCount: 0, projectedRect: null, visibleRect: null, viewportAreaRatio: 0, openAreaRatio: 0 };
      const projectedRect = {
        left: Math.min(...points.map(point => point.x)),
        top: Math.min(...points.map(point => point.y)),
        right: Math.max(...points.map(point => point.x)),
        bottom: Math.max(...points.map(point => point.y)),
      };
      projectedRect.width = projectedRect.right - projectedRect.left;
      projectedRect.height = projectedRect.bottom - projectedRect.top;
      const visibleRect = intersect(projectedRect, visualStage);
      let projectionSamples = 0;
      let projectionOpenSamples = 0;
      if (visibleRect) {
        for (let row = 0; row < 32; row++) {
          for (let column = 0; column < 32; column++) {
            const x = visibleRect.left + (column + .5) * visibleRect.width / 32;
            const y = visibleRect.top + (row + .5) * visibleRect.height / 32;
            projectionSamples++;
            if (!occluders.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) projectionOpenSamples++;
          }
        }
      }
      const openAreaRatio = projectionOpenSamples / Math.max(1, projectionSamples);
      const openArea = visibleRect ? visibleRect.width * visibleRect.height * openAreaRatio : 0;
      return {
        pointCount: points.length,
        projectedRect,
        visibleRect,
        openAreaRatio,
        viewportAreaRatio: openArea / Math.max(1, visualBounds.width * visualBounds.height),
        viewportWidthRatio: visibleRect ? visibleRect.width / visualBounds.width : 0,
        viewportHeightRatio: visibleRect ? visibleRect.height / visualBounds.height : 0,
      };
    })();
    return {
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        visual: visualBounds,
        orientation: matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
        phonePortrait: matchMedia('(max-width: 760px) and (orientation: portrait)').matches,
        compactRoomFocus: matchMedia('(max-width: 760px) and (orientation: portrait), (max-height: 620px) and (max-width: 1024px) and (orientation: landscape)').matches,
      },
      selectedDistrict: root?.dataset.district || null,
      expanded: Boolean(root?.classList.contains('is-sheet-expanded')),
      toggleAffordance: Boolean(shown(toggleElement)),
      toggleAriaExpanded: toggleElement?.getAttribute('aria-expanded') || null,
      stage, panel, nav, rail, railTop, quickActions, header, toggle, canvas,
      headers: {
        // "collapsed header >= 48px" is gated on the element that actually
        // collapses -- the inspector sheet's own header/handle (.uga-sheet-toggle,
        // coextensive with the collapsed .uga-context-panel peek). The persistent
        // top command bar is recorded too, but it never "collapses" and its CSS
        // floor is already >= 54px, so gating on it would be unfalsifiable.
        commandHeaderHeight: header ? header.height : 0,
        commandHeaderShown: shown(document.querySelector('.uga-command-header')),
        inspectorHeaderHeight: shown(toggleElement) && toggle
          ? Math.max(toggle.height, (!root?.classList.contains('is-sheet-expanded') && panel ? panel.height : 0))
          : (panel ? panel.height : 0),
        inspectorHeaderShown: shown(toggleElement),
      },
      cutaway: {
        stageAreaRatio: openSamples / Math.max(1, sampled),
        viewportAreaRatio: cutawayVisibleArea / Math.max(1, visualBounds.width * visualBounds.height),
        // Fraction of viewport HEIGHT the state leaves clear for the cutaway,
        // counting EVERY opaque overlay (header + rail chips + inspector sheet).
        // medianRatio (representative column) is authoritative for the 45%
        // contract; maxRatio (best column) and widthFractionMeeting45 expose
        // thin-strip / asymmetric-layout cases. sheetOnly* excludes the nav
        // chips, to show precisely what they cost.
        clearHeightMedianRatio: cutawayClear.medianRatio,
        clearHeightMaxRatio: cutawayClear.maxRatio,
        clearHeightMinRatio: cutawayClear.minRatio,
        clearWidthFractionMeeting45: cutawayClear.widthFractionMeeting,
        sheetOnlyClearHeightMedianRatio: sheetOnlyClear.medianRatio,
        sampled, openSamples, occluders,
      },
      overlap: {
        panelNav: overlapArea(panel, nav),
        railPanel: overlapArea(rail, panel),
        railTopPanel: overlapArea(railTop, panel),
        quickPanel: overlapArea(quickActions, panel),
      },
      interactives: {
        count: interactives.length,
        undersized: interactives.filter(control => !control.sizePass),
        occluded: interactives.filter(control => !control.hitTestPass),
        partlyOffscreen: interactives.filter(control => control.onscreen && !control.fullyOnscreen),
        spacingIssues,
        groupedTightSpacing,
        controls: interactives,
      },
      headerTruncation,
      overflow: {
        documentX: document.documentElement.scrollWidth > innerWidth + 1,
        documentY: document.documentElement.scrollHeight > innerHeight + 1,
        major: majorOverflow,
        visualViewportIssues,
      },
      runtime: {
        ready: Boolean(instance?.ready),
        sceneMode: instance?.scene || null,
        commandLoaded: Boolean(commandScene?.loaded),
        commandActive: Boolean(commandScene?.active),
        commandRootVisible: Boolean(commandScene?.root?.visible),
        sceneMeshes,
        selectedDistrictProjection,
        renderCalls: Number(renderInfo.calls || 0),
        triangles: Number(renderInfo.triangles || 0),
        contextLost: Boolean(gl?.isContextLost?.()),
        glError: Number(gl?.getError?.() || 0),
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) || null,
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl?.getParameter?.(gl.VENDOR) || null,
        version: gl?.getParameter?.(gl.VERSION) || null,
        backend: navigator.userAgent,
        moduleError: window.__MASSFRONT_SPACE_ERROR__?.message || null,
        failureVeil: document.querySelector('.render-veil.failed')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 240) || null,
      },
    };
  }, { minTouch: MIN_TOUCH_PX, minGap: MIN_TOUCH_GAP_PX });
}

async function screenshotState(page, viewport, stateName, captureHashes) {
  const filename = `${viewport.id}--${stateName}.png`;
  const path = join(output, filename);
  await page.screenshot({ path });
  const hash = await sha256(path);
  captureHashes[`${viewport.id}/${stateName}`] = hash;
  return { path, sha256: hash };
}

async function clickSheetToggle(page, previousExpanded) {
  await page.locator('.uga-sheet-toggle').click();
  await page.waitForFunction(previous => {
    const root = document.querySelector('.uga-command-shell');
    const button = document.querySelector('.uga-sheet-toggle');
    const expanded = Boolean(root?.classList.contains('is-sheet-expanded'));
    return expanded !== previous && button?.getAttribute('aria-expanded') === String(expanded);
  }, previousExpanded, { timeout: 5_000 });
  await page.waitForTimeout(260);
}

async function clickDifferentDistrict(page, currentDistrict) {
  const target = page.locator(`.uga-district-button[data-district]:not([data-district="${currentDistrict}"])`).first();
  const targetId = await target.getAttribute('data-district');
  if (!targetId) throw new Error(`No alternate district is available from ${currentDistrict}.`);
  await target.click();
  await page.waitForFunction(id => document.querySelector('.uga-command-shell')?.dataset.district === id, targetId, { timeout: 5_000 });
  // The authored district camera tween is 0.92 s. Capturing before it settles
  // produced a source-matched but visually false "room mostly offscreen" frame.
  await page.waitForTimeout(1100);
  return targetId;
}

async function clickSameDistrict(page, districtId, previousExpanded) {
  await page.locator(`.uga-district-button[data-district="${districtId}"]`).click();
  await page.waitForFunction(({ id, previous }) => {
    const root = document.querySelector('.uga-command-shell');
    return root?.dataset.district === id && root.classList.contains('is-sheet-expanded') !== previous;
  }, { id: districtId, previous: previousExpanded }, { timeout: 5_000 });
  await page.waitForTimeout(1100);
}

function checksForState(state) {
  return {
    cutawayStageVisible: state.cutaway.stageAreaRatio >= .45,
    cutawayViewportVisible: state.cutaway.viewportAreaRatio >= .30,
    // Literal contract: each state must leave >= 45% of viewport HEIGHT clear
    // for the cutaway, measured against EVERY opaque overlay (header + rail
    // chips + inspector sheet) down a representative (median) column, so a thin
    // clear edge strip cannot earn the pass.
    cutawayHeightForRoom: state.cutaway.clearHeightMedianRatio >= .45,
    // "collapsed header >= 48px": gated on the element that actually collapses,
    // the inspector sheet's header/handle. Only asserted in the collapsed state
    // (the criterion is about the collapsed presentation); expanded/tablet-natural
    // states pass through.
    collapsedHeaderTall: state.expanded
      ? true
      : Boolean(state.headers?.inspectorHeaderShown && state.headers.inspectorHeaderHeight >= 48),
    panelClearOfNav: state.overlap.panelNav <= 1,
    railClearOfPanel: state.overlap.railPanel <= 1 && state.overlap.railTopPanel <= 1,
    quickActionsClearOfPanel: state.overlap.quickPanel <= 1,
    controlsSized: state.interactives.undersized.length === 0,
    controlsSpaced: state.interactives.spacingIssues.length === 0,
    controlsHitTestable: state.interactives.occluded.length === 0,
    controlsNotClipped: state.interactives.partlyOffscreen.length === 0,
    headerTextNotTruncated: state.headerTruncation.issues.length === 0,
    resourceTailReachable: state.headerTruncation.resourceTailReachable,
    resourcesClearOfExit: state.headerTruncation.resourceExitOverlap <= 1,
    noDocumentOverflow: !state.overflow.documentX && !state.overflow.documentY,
    noMajorOverflow: state.overflow.major.every(item => !item.unwantedX && !item.unwantedY),
    safeViewportContained: state.overflow.visualViewportIssues.length === 0,
    cutawayRuntimeReady: state.runtime.sceneMode === 'uga' && state.runtime.commandLoaded && state.runtime.commandActive && state.runtime.commandRootVisible && state.runtime.sceneMeshes.meshes > 0,
    selectedRoomProjectedVisible: Boolean(state.runtime.selectedDistrictProjection?.pointCount > 0
      && state.runtime.selectedDistrictProjection.viewportAreaRatio >= .08
      && state.runtime.selectedDistrictProjection.viewportWidthRatio >= .20
      && state.runtime.selectedDistrictProjection.viewportHeightRatio >= .20),
    gpuHealthy: !state.runtime.contextLost && state.runtime.glError === 0 && !state.runtime.moduleError && !state.runtime.failureVeil,
  };
}

await mkdir(output, { recursive: true });
const [startProvenance, expectedManifest] = await Promise.all([provenanceSnapshot(), readExpectedManifest()]);
const browser = await launchPwBrowser({ ownershipMode: 'isolated' });
const runtimeErrors = [];
const loadedResourceUrls = new Set();
const captureHashes = {};
const results = [];
let hardwareGpu = null;
let browserVersion = null;
let actualEntryUrl = requestedUrl;
let browserOwnership = null;

try {
  browserVersion = browser.version();
  await assertPwBrowserOwnership(browser);
  const gpuPage = await browser.newPage({ viewport: { width: 320, height: 240 } });
  hardwareGpu = await assertHardwareGpu(gpuPage);
  recordPwBrowserGpu(browser, hardwareGpu);
  await gpuPage.close();

  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      screen: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('requestfailed', request => errors.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`));
    page.on('response', response => {
      const responseUrl = response.url();
      try {
        const parsed = new URL(responseUrl);
        const expectedOrigin = new URL(requestedUrl).origin;
        if (parsed.origin === expectedOrigin && parsed.pathname.includes('/modules/space_exploration/')) loadedResourceUrls.add(responseUrl);
        if (parsed.origin === expectedOrigin && response.status() >= 400) errors.push(`http ${response.status()}: ${responseUrl}`);
      } catch {}
    });
    await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    actualEntryUrl = page.url();
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
    await page.evaluate(async () => {
      const domain = await import('./src/domain/index.js');
      localStorage.setItem(domain.DOMAIN_STORAGE_KEY, domain.serializeDomainState(domain.createShowcaseReadyDomainState()));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.ready, null, { timeout: 30_000 });
    await page.evaluate(() => window.__MASSFRONT_SPACE__.ready);
    await page.evaluate(() => window.__MASSFRONT_SPACE__.openUga('factions'));
    await page.waitForSelector('.uga-command-shell:not([hidden])');
    await page.waitForFunction(() => window.__MASSFRONT_SPACE__?.scene === 'uga' && window.__MASSFRONT_SPACE__?.commandScene?.loaded && window.__MASSFRONT_SPACE__?.commandScene?.active, null, { timeout: 90_000 });
    await page.waitForTimeout(1200);

    const natural = await measure(page);
    const naturalStateName = natural.expanded ? 'natural-expanded' : 'natural-collapsed';
    const paths = { natural: await screenshotState(page, viewport, naturalStateName, captureHashes) };
    const states = { natural, collapsed: natural.expanded ? null : natural, expanded: natural.expanded ? natural : null };

    if (natural.toggleAffordance) {
      const currentName = natural.expanded ? 'expanded' : 'collapsed';
      paths[currentName] = await screenshotState(page, viewport, currentName, captureHashes);
      await clickSheetToggle(page, natural.expanded);
      const alternate = await measure(page);
      const alternateName = alternate.expanded ? 'expanded' : 'collapsed';
      states[alternateName] = alternate;
      paths[alternateName] = await screenshotState(page, viewport, alternateName, captureHashes);
      await clickSheetToggle(page, alternate.expanded);
      states.restored = await measure(page);
      paths.restored = await screenshotState(page, viewport, `restored-${states.restored.expanded ? 'expanded' : 'collapsed'}`, captureHashes);
    }

    let districtTapScenario = null;
    if (natural.viewport.compactRoomFocus && ['phone-430x932', 'phone-landscape-915x412'].includes(viewport.id)) {
      const targetDistrict = await clickDifferentDistrict(page, states.restored?.selectedDistrict || natural.selectedDistrict);
      const firstTap = await measure(page);
      const firstTapPath = await screenshotState(page, viewport, `different-${targetDistrict}-first-tap`, captureHashes);
      await clickSameDistrict(page, targetDistrict, firstTap.expanded);
      const secondTap = await measure(page);
      const secondTapPath = await screenshotState(page, viewport, `same-${targetDistrict}-second-tap`, captureHashes);
      districtTapScenario = {
        targetDistrict,
        firstTap,
        secondTap,
        checks: {
          firstTapSelectedDistrict: firstTap.selectedDistrict === targetDistrict,
          firstTapCollapsedForCameraFocus: !firstTap.expanded,
          firstTapCutawayVisible: firstTap.cutaway.stageAreaRatio >= .45 && firstTap.cutaway.viewportAreaRatio >= .30,
          secondTapKeptDistrict: secondTap.selectedDistrict === targetDistrict,
          secondTapOpenedDetails: secondTap.expanded,
          secondTapCutawayVisible: secondTap.cutaway.stageAreaRatio >= .45 && secondTap.cutaway.viewportAreaRatio >= .30,
        },
        paths: { firstTap: firstTapPath, secondTap: secondTapPath },
      };
    }

    const auditedStates = { ...states };
    if (districtTapScenario) {
      auditedStates.differentDistrictFirstTap = districtTapScenario.firstTap;
      auditedStates.sameDistrictSecondTap = districtTapScenario.secondTap;
    }
    const stateChecks = Object.fromEntries(Object.entries(auditedStates).filter(([, state]) => state).map(([name, state]) => [name, checksForState(state)]));
    const viewportChecks = {
      naturalStateMatchesResponsiveContract: natural.expanded === !natural.viewport.compactRoomFocus,
      toggleAffordancePresent: natural.toggleAffordance,
      collapsedStateReached: Boolean(states.collapsed && !states.collapsed.expanded),
      expandedStateReached: Boolean(states.expanded?.expanded),
      toggleRoundTripRestored: !natural.toggleAffordance || states.restored?.expanded === natural.expanded,
      districtTapSemanticsPass: !districtTapScenario || allTrue(districtTapScenario.checks),
      everyStatePasses: Object.values(stateChecks).every(allTrue),
      runtimeClean: errors.length === 0,
    };
    runtimeErrors.push(...errors.map(error => `${viewport.id}: ${error}`));
    results.push({ viewport, naturalState: naturalStateName, states, districtTapScenario, stateChecks, viewportChecks, errors, paths });
    const resourceUrls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    for (const resourceUrl of resourceUrls) {
      try {
        const parsed = new URL(resourceUrl);
        if (parsed.origin === new URL(actualEntryUrl).origin && parsed.pathname.includes('/modules/space_exploration/')) loadedResourceUrls.add(resourceUrl);
      } catch {}
    }
    await page.close();
  }
} finally {
  try { await assertPwBrowserOwnership(browser); } catch (error) {
    runtimeErrors.push(`browser ownership before cleanup: ${error?.stack || error?.message || String(error)}`);
  }
  try { await closePwBrowser(browser); } catch (error) {
    runtimeErrors.push(`browser cleanup: ${error?.stack || error?.message || String(error)}`);
  }
  browserOwnership = pwBrowserEvidence(browser);
}

const servedBaseUrl = new URL('.', actualEntryUrl);
const servedSources = Object.fromEntries(await Promise.all(sourceEntries.map(async entry => [entry.key, await fetchHash(new URL(entry.served, servedBaseUrl))])));
const servedSourceHashes = Object.fromEntries(Object.entries(servedSources).map(([key, value]) => [key, value.sha256]));
const localServedComparison = compareExpected(servedSourceHashes, startProvenance.sourceHashes);
const runtimeResources = [];
for (const resourceUrl of [...loadedResourceUrls].sort()) {
  const hashed = await fetchHash(resourceUrl);
  if (hashed.ok) runtimeResources.push(hashed);
}
const servedPackageHash = hashObject(runtimeResources.map(resource => {
  const parsed = new URL(resource.url);
  return { url: parsed.pathname + parsed.search, sha256: resource.sha256, contentLength: resource.contentLength };
}));
const endProvenance = await provenanceSnapshot();
const configuredSourceComparison = compareExpected(servedSourceHashes, expectedManifest.manifest?.sourceHashes);
const configuredCaptureComparison = compareExpected(captureHashes, expectedManifest.manifest?.captureHashes);
const configuredEntryComparison = expectedManifest.manifest?.entryHash
  ? { configured: true, pass: servedSources['index.html'].sha256 === expectedManifest.manifest.entryHash, expected: expectedManifest.manifest.entryHash, actual: servedSources['index.html'].sha256 }
  : { configured: false, pass: true, expected: null, actual: servedSources['index.html'].sha256 };
const configuredPackageComparison = expectedManifest.manifest?.packageHash
  ? { configured: true, pass: servedPackageHash === expectedManifest.manifest.packageHash, expected: expectedManifest.manifest.packageHash, actual: servedPackageHash }
  : { configured: false, pass: true, expected: null, actual: servedPackageHash };
const checks = {
  headStableDuringCapture: startProvenance.head === endProvenance.head,
  dirtyStateStableDuringCapture: startProvenance.dirtyFingerprint === endProvenance.dirtyFingerprint,
  runtimeSourcesStableDuringCapture: startProvenance.runtimeFingerprint === endProvenance.runtimeFingerprint,
  servedSourcesMatchLocal: localServedComparison.pass,
  configuredExpectedSourcesMatch: configuredSourceComparison.pass,
  configuredExpectedCapturesMatch: configuredCaptureComparison.pass,
  configuredExpectedEntryMatches: configuredEntryComparison.pass,
  configuredExpectedPackageMatches: configuredPackageComparison.pass,
  allViewportsPass: results.every(result => allTrue(result.viewportChecks)),
  runtimeErrorsAbsent: runtimeErrors.length === 0,
  browserOwnershipProven: browserOwnership?.launchMode === 'owned-isolated'
    && browserOwnership?.owned === true && browserOwnership?.reused === false
    && browserOwnership?.ownership?.status === 'PROVEN'
    && Boolean(browserOwnership?.pid && browserOwnership?.port && browserOwnership?.profile)
    && Boolean(browserOwnership?.gpu?.renderer && browserOwnership?.gpu?.vendor)
    && browserOwnership?.cleanup?.success === true
    && browserOwnership?.cleanup?.processExited === true
    && browserOwnership?.cleanup?.portReleased === true
    && browserOwnership?.cleanup?.profileRemoved === true
    && browserOwnership?.cleanup?.manifestRemoved === true,
};
const report = {
  schema: 'MassfrontMobileRoomVisibilityEvidenceV2',
  testedUrl: actualEntryUrl,
  requestedUrl,
  capturedAtUtc: runStartedUtc,
  completedAtUtc: new Date().toISOString(),
  browser: { version: browserVersion, hardwareGpu, ownership: browserOwnership },
  thresholds: { minimumTouchTargetCssPx: MIN_TOUCH_PX, minimumTouchGapCssPx: MIN_TOUCH_GAP_PX, minimumCollapsedInspectorHeaderCssPx: 48, minimumCutawayStageRatio: .45, minimumCutawayViewportRatio: .30, minimumCutawayViewportHeightMedianRatio: .45, minimumSelectedRoomViewportAreaRatio: .08 },
  safeAreaEmulated: false,
  coverageNotes: {
    safeArea: 'Device safe-area insets (notch/home indicator) are NOT emulated; visualViewport equals the full window, so the safe-area sub-clause of "no inspector/nav/safe-area overlap" is recorded but UNTESTED. safeViewportContained here proves only full-viewport containment.',
    cutawayHeight: 'clearHeight*Ratio count every opaque overlay (header + district-rail/rail-top chips + inspector sheet) and gate on the median column. maxRatio/widthFractionMeeting45 are reported to expose thin-strip and asymmetric (side-docked) layouts.',
    collapsedHeader: 'collapsedHeaderTall gates the collapsed inspector sheet header/handle (.uga-sheet-toggle / collapsed .uga-context-panel), the element that actually collapses; commandHeaderHeight is recorded but not gated.',
  },
  provenance: { start: startProvenance, end: endProvenance },
  served: { entry: servedSources['index.html'], sourceFiles: servedSources, runtimeResources, packageHash: servedPackageHash },
  captures: captureHashes,
  expectedHashes: {
    configured: expectedManifest.configured,
    path: expectedManifest.path,
    note: expectedManifest.configured ? 'Compared with the externally approved hash manifest.' : 'No approved capture manifest was supplied; exact screenshot hashes are recorded for provenance but are not treated as a visual-quality oracle.',
    localServedComparison,
    configuredSourceComparison,
    configuredCaptureComparison,
    configuredEntryComparison,
    configuredPackageComparison,
  },
  checks,
  runtimeErrors,
  results,
};
await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  testedUrl: actualEntryUrl,
  capturedAtUtc: report.capturedAtUtc,
  head: startProvenance.head,
  dirtyFingerprint: startProvenance.dirtyFingerprint,
  runtimeFingerprint: startProvenance.runtimeFingerprint,
  entryHash: servedSources['index.html'].sha256,
  packageHash: servedPackageHash,
  gpu: hardwareGpu,
  expectedHashesConfigured: expectedManifest.configured,
  checks,
  viewports: results.map(result => {
    const auditedStates = [...Object.values(result.states).filter(Boolean)];
    if (result.districtTapScenario) auditedStates.push(result.districtTapScenario.firstTap, result.districtTapScenario.secondTap);
    return {
      viewport: result.viewport.id,
      dpr: result.states.natural.viewport.dpr,
      naturalState: result.naturalState,
      collapsedCutawayRatio: result.states.collapsed?.cutaway.viewportAreaRatio ?? null,
      expandedCutawayRatio: result.states.expanded?.cutaway.viewportAreaRatio ?? null,
      collapsedCutawayHeightMedian: result.states.collapsed?.cutaway.clearHeightMedianRatio ?? null,
      expandedCutawayHeightMedian: result.states.expanded?.cutaway.clearHeightMedianRatio ?? null,
      collapsedCutawayHeightMax: result.states.collapsed?.cutaway.clearHeightMaxRatio ?? null,
      expandedCutawayHeightMax: result.states.expanded?.cutaway.clearHeightMaxRatio ?? null,
      collapsedCutawayWidthFrac45: result.states.collapsed?.cutaway.clearWidthFractionMeeting45 ?? null,
      expandedCutawayWidthFrac45: result.states.expanded?.cutaway.clearWidthFractionMeeting45 ?? null,
      commandHeaderPx: result.states.collapsed?.headers?.commandHeaderHeight ?? result.states.natural.headers?.commandHeaderHeight ?? null,
      inspectorHeaderPx: result.states.collapsed?.headers?.inspectorHeaderHeight ?? result.states.natural.headers?.inspectorHeaderHeight ?? null,
      undersized: Math.max(...auditedStates.map(state => state.interactives.undersized.length)),
      spacingIssues: Math.max(...auditedStates.map(state => state.interactives.spacingIssues.length)),
      occluded: Math.max(...auditedStates.map(state => state.interactives.occluded.length)),
      headerTruncation: Math.max(...auditedStates.map(state => state.headerTruncation.issues.length)),
      districtTapChecks: result.districtTapScenario?.checks || null,
      checks: result.viewportChecks,
    };
  }),
  output,
}, null, 2));
if (!allTrue(checks)) process.exitCode = 1;
process.exit(process.exitCode || 0);
