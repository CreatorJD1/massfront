#!/usr/bin/env node
/*
 * Fail-closed verifier for stored MASSFRONT interface-matrix evidence.
 *
 * PASS means that the report is complete, is bound to the active source and
 * runtime, contains internally consistent device/viewport identities, and
 * every screenshot still has the exact bytes and dimensions authored by the
 * capture producer. Missing or stale proof is UNKNOWN and always exits 1.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, readFile, readlink, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const EVIDENCE_SCHEMA = 'massfront.interface-matrix/v2';
export const AUDIT_SCHEMA = 'massfront.interface-audit/v2';
export const RUNTIME_SCHEMA = 'massfront.runtime-source/v1';
export const DIRTY_FINGERPRINT_SCHEMA = 'massfront.git-dirty-content/v2';
export const MIN_CONTROL_PX = 44;

export const EXPECTED_ROUTES = Object.freeze([
  'home', 'war-room', 'operations', 'research', 'orders', 'intel',
  'arsenal', 'career', 'settings', 'inbox', 'updates', 'social'
]);

export const VIEWPORT_PROFILES = Object.freeze({
  'phone-p': Object.freeze({ width: 412, height: 915, dpr: 2, mobile: true, touch: true, formFactor: 'phone', orientation: 'portrait' }),
  'phone-l': Object.freeze({ width: 915, height: 412, dpr: 2, mobile: true, touch: true, formFactor: 'phone', orientation: 'landscape' }),
  'tablet-p': Object.freeze({ width: 768, height: 1024, dpr: 1, mobile: true, touch: true, formFactor: 'tablet', orientation: 'portrait' }),
  'tablet-l': Object.freeze({ width: 1024, height: 768, dpr: 1, mobile: true, touch: true, formFactor: 'tablet', orientation: 'landscape' }),
  'desktop-1440': Object.freeze({ width: 1440, height: 900, dpr: 1, mobile: false, touch: false, formFactor: 'desktop', orientation: 'landscape' }),
  'desktop-1920': Object.freeze({ width: 1920, height: 1080, dpr: 1, mobile: false, touch: false, formFactor: 'desktop', orientation: 'landscape' }),
  'foldable': Object.freeze({ width: 344, height: 882, dpr: 2, mobile: true, touch: true, formFactor: 'foldable', orientation: 'portrait' })
});
export const EXPECTED_VIEWPORTS = Object.freeze(Object.keys(VIEWPORT_PROFILES));

const REQUIRED_CAPTURE_FIELDS = Object.freeze([
  'route', 'tab', 'viewportKey', 'viewport', 'deviceScaleFactor', 'deviceId',
  'binding', 'file', 'screenshot', 'textLength', 'controlCount',
  'onScreenControls', 'under44', 'clippedControls', 'documentOverflowX',
  'routeOverflowX', 'routeOverflowActionable', 'headerRequired',
  'headerPresent', 'headerVisible', 'footerRequired', 'footerPresent',
  'footerVisible'
]);

const REQUIRED_SUMMARY_FIELDS = Object.freeze([
  'captures', 'openErrors', 'missingRoots', 'overflow', 'clipped', 'under44',
  'missingHeader', 'missingFooter', 'blank', 'runtimeErrors',
  'failedRequests', 'contextLosses'
]);

const CONTEXT_LOSS_RE = /(?:webgl\s*context\s*lost|webglcontextlost|context_lost_webgl|losecontext|gpu process (?:crash|exit)|context loss)/i;
const SOFTWARE_GPU_RE = /(?:swiftshader|software renderer|llvmpipe|no-webgl2)/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameNumber(a, b, epsilon = 0.001) {
  return isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= epsilon;
}

function isInside(base, target) {
  const rel = relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function hashFile(path) {
  const hash = createHash('sha256');
  await new Promise((accept, reject) => {
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', accept);
  });
  return hash.digest('hex');
}

function parsePorcelainZ(raw) {
  const tokens = String(raw || '').split('\0');
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const status = token.slice(0, 2);
    const path = token.slice(3);
    let originalPath = null;
    if (/[RC]/.test(status) && index + 1 < tokens.length) originalPath = tokens[++index] || null;
    entries.push({ status, path, originalPath });
  }
  return entries;
}

async function workingPathIdentity(root, entry) {
  const path = resolve(root, entry.path);
  if (!isInside(root, path)) return 'OUTSIDE_REPOSITORY';
  if (!existsSync(path)) return 'MISSING';
  const info = await lstat(path);
  if (info.isSymbolicLink()) return `SYMLINK:${await readlink(path)}`;
  if (info.isFile()) return `FILE:${info.size}:${await hashFile(path)}`;
  if (info.isDirectory()) return 'DIRECTORY';
  return `OTHER:${info.mode}:${info.size}`;
}

/** Bind dirty evidence to bytes, not merely to the set of dirty paths. */
export async function readRepositoryFingerprint(root = ROOT) {
  let head = 'UNKNOWN';
  let entries = null;
  try {
    const headResult = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
    });
    head = headResult.stdout.trim() || 'UNKNOWN';
    const statusResult = await execFileAsync(
      'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      {
        cwd: root, encoding: 'utf8', windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
      }
    );
    entries = parsePorcelainZ(statusResult.stdout);
  } catch {
    // The verifier turns unavailable repository identity into UNKNOWN.
  }

  if (!entries) {
    return {
      head,
      dirty: null,
      dirtyEntryCount: null,
      dirtyFingerprintSchema: DIRTY_FINGERPRINT_SCHEMA,
      dirtyFingerprint: 'UNKNOWN'
    };
  }

  const identities = [];
  for (const entry of entries) {
    identities.push({
      status: entry.status,
      path: entry.path.replace(/\\/g, '/'),
      originalPath: entry.originalPath ? entry.originalPath.replace(/\\/g, '/') : null,
      content: await workingPathIdentity(root, entry)
    });
  }
  identities.sort((a, b) => `${a.path}\0${a.status}`.localeCompare(`${b.path}\0${b.status}`));
  return {
    head,
    dirty: identities.length > 0,
    dirtyEntryCount: identities.length,
    dirtyFingerprintSchema: DIRTY_FINGERPRINT_SCHEMA,
    dirtyFingerprint: sha256(JSON.stringify({ schema: DIRTY_FINGERPRINT_SCHEMA, entries: identities }))
  };
}

function localRuntimeReference(value) {
  const raw = asString(value).split(/[?#]/, 1)[0].replace(/^\.\//, '');
  if (!raw || /^(?:[a-z]+:|\/\/|#)/i.test(raw) || raw.startsWith('/')) return null;
  return raw.replace(/\\/g, '/');
}

/** Hash the source-root shell, all HTML-linked local assets, and manifest order. */
export async function readRuntimeFingerprint(root = ROOT) {
  const paths = new Set(['index.html', 'boot.js', 'assets/data/manifest.json']);
  try {
    const html = await readFile(resolve(root, 'index.html'), 'utf8');
    for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const ref = localRuntimeReference(match[1]);
      if (ref) paths.add(ref);
    }
  } catch {
    // Missing index is recorded in the file table below.
  }
  try {
    const manifest = JSON.parse(await readFile(resolve(root, 'assets/data/manifest.json'), 'utf8'));
    for (const value of Array.isArray(manifest?.order) ? manifest.order : []) {
      const ref = localRuntimeReference(value);
      if (ref) paths.add(ref);
    }
  } catch {
    // Missing or malformed manifest is recorded as an incomplete runtime.
  }

  const files = [];
  for (const path of [...paths].sort()) {
    const abs = resolve(root, path);
    if (!isInside(root, abs) || !existsSync(abs)) {
      files.push({ path, bytes: null, sha256: null, missing: true });
      continue;
    }
    const info = await stat(abs);
    if (!info.isFile()) {
      files.push({ path, bytes: null, sha256: null, missing: true });
      continue;
    }
    files.push({ path, bytes: info.size, sha256: await hashFile(abs), missing: false });
  }
  const missingFiles = files.filter(file => file.missing).map(file => file.path);
  const fingerprint = sha256(JSON.stringify({ schema: RUNTIME_SCHEMA, files }));
  return { schema: RUNTIME_SCHEMA, mode: 'source-root', fingerprint, fileCount: files.length, missingFiles, files };
}

export function normalizeViewportKey(value) {
  if (typeof value === 'string') return EXPECTED_VIEWPORTS.includes(value) ? value : 'unknown';
  if (!value || typeof value !== 'object') return 'unknown';
  const w = Number(value.w ?? value.width);
  const h = Number(value.h ?? value.height);
  for (const [key, profile] of Object.entries(VIEWPORT_PROFILES)) {
    if (profile.width === w && profile.height === h) return key;
  }
  return 'unknown';
}

function deviceIdentityPayload(device) {
  return {
    profileKey: asString(device?.profileKey),
    captureKind: asString(device?.captureKind),
    browserName: asString(device?.browserName),
    browserVersion: asString(device?.browserVersion),
    userAgent: asString(device?.userAgent),
    platform: asString(device?.platform),
    maxTouchPoints: isFiniteNumber(device?.maxTouchPoints) ? device.maxTouchPoints : null,
    renderer: asString(device?.renderer),
    requested: {
      width: isFiniteNumber(device?.requested?.width) ? device.requested.width : null,
      height: isFiniteNumber(device?.requested?.height) ? device.requested.height : null,
      dpr: isFiniteNumber(device?.requested?.dpr) ? device.requested.dpr : null,
      mobile: typeof device?.requested?.mobile === 'boolean' ? device.requested.mobile : null,
      touch: typeof device?.requested?.touch === 'boolean' ? device.requested.touch : null
    },
    actual: {
      width: isFiniteNumber(device?.actual?.width) ? device.actual.width : null,
      height: isFiniteNumber(device?.actual?.height) ? device.actual.height : null,
      dpr: isFiniteNumber(device?.actual?.dpr) ? device.actual.dpr : null
    }
  };
}

export function computeDeviceIdentityId(device) {
  return sha256(JSON.stringify(deviceIdentityPayload(device)));
}

function blocker(code, category, message, details = {}) {
  return { code, category, message, ...details };
}

function captureViewportKey(capture) {
  const explicit = asString(capture?.viewportKey);
  return EXPECTED_VIEWPORTS.includes(explicit) ? explicit : normalizeViewportKey(capture?.viewport);
}

function captureId(capture, index) {
  const viewport = captureViewportKey(capture);
  const route = asString(capture?.route) || 'unknown-route';
  const tab = asString(capture?.tab) || 'default';
  return `${viewport}/${route}/${tab}#${index}`;
}

function sourceBinding(source) {
  return {
    head: asString(source?.head),
    dirtyFingerprint: asString(source?.dirtyFingerprint),
    dirtyFingerprintSchema: asString(source?.dirtyFingerprintSchema),
    dirty: typeof source?.dirty === 'boolean' ? source.dirty : null
  };
}

function runtimeBinding(runtime) {
  return {
    schema: asString(runtime?.schema),
    mode: asString(runtime?.mode),
    fingerprint: asString(runtime?.fingerprint),
    fileCount: Number.isInteger(runtime?.fileCount) ? runtime.fileCount : null,
    missingFiles: Array.isArray(runtime?.missingFiles) ? runtime.missingFiles : null
  };
}

function evidenceSchema(data) {
  return asString(data?.evidenceSchema || data?.schemaVersion);
}

function messageOf(error) {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return String(error ?? 'unknown error');
  return asString(error.message || error.error || error.errorText) || JSON.stringify(error);
}

function viewportOf(error) {
  return asString(error?.viewport) || 'unknown viewport';
}

export function summarizeEvidenceData(data) {
  const captures = asArray(data?.captures) || [];
  const valid = captures.filter(item => item && typeof item === 'object' && !item.openError && item.missing !== true);
  const contextLossEvents = isFiniteNumber(data?.errors?.contextLossEvents) ? data.errors.contextLossEvents : 0;
  return {
    captures: captures.length,
    openErrors: captures.filter(item => item?.openError).length,
    missingRoots: captures.filter(item => item?.missing === true).length,
    /* A route may deliberately contain overflow in a scroll or clip host (the
       home rank/requisition rail does). Controls outside such hosts are audited
       separately as clippedControls. Only document overflow or an uncontained
       route overflow is a defect. */
    overflow: valid.filter(item => (isFiniteNumber(item.documentOverflowX) && item.documentOverflowX > 1) || item.routeOverflowActionable === true).length,
    clipped: valid.filter(item => Array.isArray(item.clippedControls) && item.clippedControls.length > 0).length,
    under44: valid.filter(item => Array.isArray(item.under44) && item.under44.length > 0).length,
    missingHeader: valid.filter(item => item.headerRequired === true && (item.headerPresent !== true || item.headerVisible !== true)).length,
    missingFooter: valid.filter(item => item.footerRequired === true && (item.footerPresent !== true || item.footerVisible !== true)).length,
    blank: valid.filter(item => isFiniteNumber(item.textLength) && item.textLength <= 0).length,
    runtimeErrors: (asArray(data?.errors?.page)?.length || 0) + (asArray(data?.errors?.console)?.length || 0) + (asArray(data?.errors?.capture)?.length || 0),
    failedRequests: asArray(data?.errors?.requests)?.length || 0,
    contextLosses: contextLossEvents
  };
}

function validateTopLevel(data, blocks) {
  const arrays = [
    ['errors.page', data?.errors?.page], ['errors.console', data?.errors?.console],
    ['errors.requests', data?.errors?.requests], ['errors.capture', data?.errors?.capture],
    ['captures', data?.captures]
  ];
  for (const [field, value] of arrays) {
    if (!Array.isArray(value)) blocks.push(blocker('UNSUPPORTED_EVIDENCE_SHAPE', 'evidence', `Required evidence field ${field} is absent or not an array. Its value is UNKNOWN, not zero.`, { field }));
  }
  if (!isFiniteNumber(data?.errors?.contextLossEvents) || data.errors.contextLossEvents < 0) blocks.push(blocker('CONTEXT_LOSS_TELEMETRY_MISSING', 'evidence', 'errors.contextLossEvents is absent or invalid. Context-loss status is UNKNOWN.'));
  if (data?.captureCompleted !== true) blocks.push(blocker('CAPTURE_INCOMPLETE', 'runtime', 'The producer did not record a completed matrix capture.'));
  if (!data?.gpu || !asString(data.gpu.renderer)) blocks.push(blocker('GPU_EVIDENCE_MISSING', 'evidence', 'GPU renderer evidence is absent. Hardware/WebGL status is UNKNOWN.', { field: 'gpu.renderer' }));
  const generatedAt = asString(data?.generatedAt);
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) blocks.push(blocker('GENERATED_AT_MISSING', 'evidence', 'Evidence generation time is absent or invalid.', { field: 'generatedAt' }));
  if (!data?.devices || typeof data.devices !== 'object' || Array.isArray(data.devices)) blocks.push(blocker('DEVICE_EVIDENCE_MISSING', 'evidence', 'The device-profile identity table is absent.'));
}

function validateSummary(data, blocks) {
  if (!data?.summary || typeof data.summary !== 'object' || Array.isArray(data.summary)) {
    blocks.push(blocker('SUMMARY_MISSING', 'evidence', 'The producer defect-count summary is absent. Counts are UNKNOWN, not zero.'));
    return;
  }
  const computed = summarizeEvidenceData(data);
  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (!Number.isInteger(data.summary[field]) || data.summary[field] < 0) blocks.push(blocker('SUMMARY_COUNT_INVALID', 'evidence', `Summary count ${field} is absent or invalid.`, { field }));
    else if (data.summary[field] !== computed[field]) blocks.push(blocker('SUMMARY_COUNT_MISMATCH', 'evidence', `Summary count ${field}=${data.summary[field]} does not match recomputed ${computed[field]}.`, { field, reported: data.summary[field], computed: computed[field] }));
  }
}

function validateRuntimeErrors(data, blocks) {
  for (const error of asArray(data?.errors?.page) || []) {
    const message = messageOf(error);
    const contextLost = CONTEXT_LOSS_RE.test(message);
    blocks.push(blocker(contextLost ? 'WEBGL_CONTEXT_LOSS' : 'RUNTIME_PAGE_ERROR', contextLost ? 'webgl' : 'runtime', `[${viewportOf(error)}] ${message}`));
  }
  for (const error of asArray(data?.errors?.console) || []) {
    const message = messageOf(error);
    const contextLost = CONTEXT_LOSS_RE.test(message);
    blocks.push(blocker(contextLost ? 'WEBGL_CONTEXT_LOSS' : 'RUNTIME_CONSOLE_ERROR', contextLost ? 'webgl' : 'runtime', `[${viewportOf(error)}] ${message}`));
  }
  for (const error of asArray(data?.errors?.capture) || []) blocks.push(blocker('CAPTURE_RUNTIME_ERROR', 'runtime', `[${viewportOf(error)}] ${messageOf(error)}`));
  for (const error of asArray(data?.errors?.requests) || []) {
    const url = asString(error?.url) || 'unknown URL';
    const status = isFiniteNumber(error?.status) ? `HTTP ${error.status}` : messageOf(error);
    blocks.push(blocker('REQUEST_FAILED', 'request', `[${viewportOf(error)}] ${url}: ${status}`));
  }
  const explicitLoss = data?.webglContextLost === true || data?.gpu?.contextLost === true || (isFiniteNumber(data?.errors?.contextLossEvents) && data.errors.contextLossEvents > 0);
  if (explicitLoss) blocks.push(blocker('WEBGL_CONTEXT_LOSS', 'webgl', 'Evidence records an explicit WebGL/context-loss event.'));
  const renderer = asString(data?.gpu?.renderer);
  if (renderer && SOFTWARE_GPU_RE.test(renderer)) blocks.push(blocker('HARDWARE_GPU_REQUIRED', 'webgl', `Software or unavailable WebGL2 renderer recorded: ${renderer}`));
}

function inspectPng(bytes) {
  if (bytes.length < 8 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { ok: false, reason: 'PNG signature is absent' };
  let offset = 8;
  let width = 0;
  let height = 0;
  let ihdr = false;
  let idat = false;
  let iend = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4;
    if (next > bytes.length) return { ok: false, reason: 'PNG chunk is truncated' };
    const type = bytes.subarray(typeStart, dataStart).toString('ascii');
    if (!ihdr && type !== 'IHDR') return { ok: false, reason: 'IHDR is not the first PNG chunk' };
    if (type === 'IHDR') {
      if (ihdr || length !== 13) return { ok: false, reason: 'IHDR is duplicated or malformed' };
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      ihdr = true;
    } else if (type === 'IDAT') idat = true;
    else if (type === 'IEND') {
      if (length !== 0) return { ok: false, reason: 'IEND is malformed' };
      iend = true;
      offset = next;
      break;
    }
    offset = next;
  }
  if (!ihdr || !idat || !iend || width <= 0 || height <= 0) return { ok: false, reason: 'PNG lacks valid IHDR/IDAT/IEND structure' };
  if (offset !== bytes.length) return { ok: false, reason: 'PNG has trailing bytes after IEND' };
  return { ok: true, width, height };
}

async function validateScreenshot(evidenceDir, file) {
  const resolved = resolve(evidenceDir, file);
  if (!isInside(evidenceDir, resolved) || resolved === resolve(evidenceDir)) return { ok: false, path: resolved, hash: null, code: 'SCREENSHOT_PATH_INVALID', message: `Screenshot path escapes or names the evidence directory: ${file}` };
  if (!existsSync(resolved)) return { ok: false, path: resolved, hash: null, code: 'SCREENSHOT_MISSING', message: `Screenshot evidence is missing: ${file}` };
  const info = await stat(resolved);
  if (!info.isFile() || info.size <= 0) return { ok: false, path: resolved, hash: null, code: 'SCREENSHOT_EMPTY', message: `Screenshot evidence is empty or not a file: ${file}` };
  const bytes = await readFile(resolved);
  const png = inspectPng(bytes);
  if (!png.ok) return { ok: false, path: resolved, hash: sha256(bytes), code: 'SCREENSHOT_INVALID', message: `Screenshot is not a complete PNG (${png.reason}): ${file}` };
  return { ok: true, path: resolved, size: info.size, hash: sha256(bytes), width: png.width, height: png.height };
}

function validateDevices(data, blocks) {
  const devices = data?.devices && typeof data.devices === 'object' && !Array.isArray(data.devices) ? data.devices : {};
  const accepted = new Map();
  for (const [key, profile] of Object.entries(VIEWPORT_PROFILES)) {
    const device = devices[key];
    if (!device || typeof device !== 'object' || Array.isArray(device)) {
      blocks.push(blocker('DEVICE_PROFILE_MISSING', 'evidence', `Device identity for ${key} is absent.`, { viewport: key }));
      continue;
    }
    const fieldsComplete = [device.captureKind, device.browserName, device.browserVersion, device.userAgent, device.platform, device.renderer].every(value => asString(value));
    if (!fieldsComplete || !isFiniteNumber(device.maxTouchPoints)) blocks.push(blocker('DEVICE_IDENTITY_INCOMPLETE', 'evidence', `Device identity for ${key} lacks browser, UA, platform, touch, or renderer data.`, { viewport: key }));
    if (device.profileKey !== key
      || !sameNumber(device.requested?.width, profile.width) || !sameNumber(device.requested?.height, profile.height)
      || !sameNumber(device.requested?.dpr, profile.dpr) || device.requested?.mobile !== profile.mobile
      || device.requested?.touch !== profile.touch || !sameNumber(device.actual?.width, profile.width)
      || !sameNumber(device.actual?.height, profile.height) || !sameNumber(device.actual?.dpr, profile.dpr, 0.01)) {
      blocks.push(blocker('DEVICE_PROFILE_MISMATCH', 'provenance', `Device identity for ${key} does not match its required requested/actual viewport profile.`, { viewport: key }));
    }
    const computedId = computeDeviceIdentityId(device);
    if (!SHA256_RE.test(asString(device.id)) || device.id !== computedId) blocks.push(blocker('DEVICE_ID_MISMATCH', 'provenance', `Device identity hash for ${key} is absent or does not match its fields.`, { viewport: key, reported: device.id || null, computed: computedId }));
    if (SOFTWARE_GPU_RE.test(asString(device.renderer))) blocks.push(blocker('HARDWARE_GPU_REQUIRED', 'webgl', `${key} recorded software or unavailable WebGL2: ${device.renderer}`, { viewport: key }));
    accepted.set(key, device);
  }
  for (const key of Object.keys(devices)) {
    if (!EXPECTED_VIEWPORTS.includes(key)) blocks.push(blocker('DEVICE_PROFILE_UNSUPPORTED', 'evidence', `Unexpected device profile ${key} is present.`, { viewport: key }));
  }
  return accepted;
}

async function validateCaptures(data, evidenceDir, devices) {
  const captures = asArray(data?.captures);
  if (!captures) return { results: [], coverage: new Map() };
  const results = [];
  const coverage = new Map(EXPECTED_VIEWPORTS.map(viewport => [viewport, new Set()]));
  const reportSource = sourceBinding(data?.source);
  const reportRuntime = runtimeBinding(data?.runtime);

  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    const id = captureId(capture, index);
    const blocks = [];
    const viewport = captureViewportKey(capture);
    const derivedViewport = normalizeViewportKey(capture?.viewport);
    const route = asString(capture?.route);

    if (!capture || typeof capture !== 'object' || Array.isArray(capture)) blocks.push(blocker('CAPTURE_SHAPE_INVALID', 'evidence', `${id}: capture is not an object.`, { captureId: id }));
    else {
      const missingFields = REQUIRED_CAPTURE_FIELDS.filter(field => !(field in capture));
      if (missingFields.length) blocks.push(blocker('CAPTURE_TELEMETRY_MISSING', 'evidence', `${id}: required telemetry is absent (${missingFields.join(', ')}). Missing values are UNKNOWN, not zero.`, { captureId: id, fields: missingFields }));
    }

    if (!EXPECTED_VIEWPORTS.includes(viewport)) blocks.push(blocker('VIEWPORT_UNSUPPORTED', 'coverage', `${id}: viewport is unsupported or ambiguous.`, { captureId: id }));
    if (asString(capture?.viewportKey) !== derivedViewport || viewport !== derivedViewport) blocks.push(blocker('VIEWPORT_IDENTITY_MISMATCH', 'provenance', `${id}: viewport key does not match measured CSS dimensions.`, { captureId: id, reported: capture?.viewportKey || null, derived: derivedViewport }));
    const profile = VIEWPORT_PROFILES[viewport];
    if (profile && (!sameNumber(capture?.viewport?.w, profile.width) || !sameNumber(capture?.viewport?.h, profile.height) || !sameNumber(capture?.deviceScaleFactor, profile.dpr, 0.01))) blocks.push(blocker('VIEWPORT_PROFILE_MISMATCH', 'provenance', `${id}: viewport dimensions or DPR do not match required profile ${viewport}.`, { captureId: id }));
    if (!EXPECTED_ROUTES.includes(route)) blocks.push(blocker('ROUTE_UNSUPPORTED', 'coverage', `${id}: route is unsupported or missing.`, { captureId: id }));
    if (coverage.has(viewport) && EXPECTED_ROUTES.includes(route)) coverage.get(viewport).add(route);

    const device = devices.get(viewport);
    if (!device || asString(capture?.deviceId) !== asString(device.id)) blocks.push(blocker('CAPTURE_DEVICE_MISMATCH', 'provenance', `${id}: capture deviceId does not match the report profile.`, { captureId: id }));
    const binding = capture?.binding;
    if (!binding || typeof binding !== 'object' || binding.sourceHead !== reportSource.head
      || binding.sourceDirtyFingerprint !== reportSource.dirtyFingerprint
      || binding.runtimeFingerprint !== reportRuntime.fingerprint
      || binding.deviceId !== asString(capture?.deviceId) || binding.viewportKey !== viewport) {
      blocks.push(blocker('CAPTURE_BINDING_MISMATCH', 'provenance', `${id}: screenshot binding does not match source, runtime, device, and viewport identity.`, { captureId: id }));
    }

    if (capture?.openError) blocks.push(blocker('ROUTE_OPEN_FAILED', 'runtime', `${id}: ${messageOf(capture.openError)}`, { captureId: id }));
    if (capture?.missing === true) blocks.push(blocker('ROUTE_ROOT_MISSING', 'runtime', `${id}: route root was missing.`, { captureId: id }));

    if (!Array.isArray(capture?.under44)) blocks.push(blocker('CONTROL_SIZE_UNKNOWN', 'evidence', `${id}: under44 telemetry is unavailable.`, { captureId: id }));
    else if (capture.under44.length > 0) blocks.push(blocker('UNDERSIZED_CONTROL', 'layout', `${id}: ${capture.under44.length} control(s) are below ${MIN_CONTROL_PX}x${MIN_CONTROL_PX} CSS px.`, { captureId: id, count: capture.under44.length, examples: capture.under44.slice(0, 5) }));
    if (!Array.isArray(capture?.clippedControls)) blocks.push(blocker('CLIPPING_UNKNOWN', 'evidence', `${id}: clipped-control telemetry is unavailable.`, { captureId: id }));
    else if (capture.clippedControls.length > 0) blocks.push(blocker('CONTROL_CLIPPED', 'layout', `${id}: ${capture.clippedControls.length} control(s) are clipped.`, { captureId: id, count: capture.clippedControls.length, examples: capture.clippedControls.slice(0, 5) }));

    if (typeof capture?.headerRequired !== 'boolean' || typeof capture?.headerPresent !== 'boolean' || typeof capture?.headerVisible !== 'boolean') blocks.push(blocker('HEADER_TELEMETRY_UNKNOWN', 'evidence', `${id}: header presence/visibility telemetry is incomplete.`, { captureId: id }));
    else if (capture.headerRequired && (!capture.headerPresent || !capture.headerVisible)) blocks.push(blocker('HEADER_MISSING_OR_CLIPPED', 'layout', `${id}: required header is absent or not visible.`, { captureId: id }));
    if (typeof capture?.footerRequired !== 'boolean' || typeof capture?.footerPresent !== 'boolean' || typeof capture?.footerVisible !== 'boolean') blocks.push(blocker('FOOTER_TELEMETRY_UNKNOWN', 'evidence', `${id}: footer presence/visibility telemetry is incomplete.`, { captureId: id }));
    else if (capture.footerRequired && (!capture.footerPresent || !capture.footerVisible)) blocks.push(blocker('FOOTER_MISSING_OR_CLIPPED', 'layout', `${id}: required footer is absent or not visible.`, { captureId: id }));

    if (!isFiniteNumber(capture?.documentOverflowX)) blocks.push(blocker('DOCUMENT_OVERFLOW_UNKNOWN', 'evidence', `${id}: document overflow telemetry is unavailable.`, { captureId: id }));
    else if (capture.documentOverflowX > 1) blocks.push(blocker('DOCUMENT_OVERFLOW', 'layout', `${id}: document overflows horizontally by ${capture.documentOverflowX}px.`, { captureId: id }));
    if (!isFiniteNumber(capture?.routeOverflowX) || typeof capture?.routeOverflowActionable !== 'boolean') blocks.push(blocker('ROUTE_OVERFLOW_UNKNOWN', 'evidence', `${id}: route overflow telemetry is unavailable.`, { captureId: id }));
    else if (capture.routeOverflowActionable) blocks.push(blocker('ROUTE_OVERFLOW', 'layout', `${id}: route overflow is ${capture.routeOverflowX}px and is not contained by a scroll/clip host.`, { captureId: id }));

    if (!isFiniteNumber(capture?.textLength) || !isFiniteNumber(capture?.controlCount) || !isFiniteNumber(capture?.onScreenControls)) blocks.push(blocker('RENDER_TELEMETRY_UNKNOWN', 'evidence', `${id}: render/control counts are unavailable.`, { captureId: id }));
    else if (capture.textLength <= 0) blocks.push(blocker('BLANK_ROUTE', 'runtime', `${id}: route has no rendered text.`, { captureId: id }));

    const file = asString(capture?.file);
    let screenshot = { ok: false, path: null, hash: null, code: 'SCREENSHOT_FIELD_MISSING', message: `${id}: screenshot filename is absent.` };
    if (file) screenshot = await validateScreenshot(evidenceDir, file);
    if (!screenshot.ok) blocks.push(blocker(screenshot.code, 'artifact', `${id}: ${screenshot.message}`, { captureId: id }));
    else {
      const declared = capture?.screenshot;
      if (!declared || typeof declared !== 'object') blocks.push(blocker('SCREENSHOT_METADATA_MISSING', 'evidence', `${id}: authored screenshot hash/dimension metadata is absent.`, { captureId: id }));
      else {
        if (!SHA256_RE.test(asString(declared.sha256)) || declared.sha256 !== screenshot.hash) blocks.push(blocker('SCREENSHOT_SHA256_MISMATCH', 'artifact', `${id}: screenshot SHA-256 does not match authored evidence.`, { captureId: id, reported: declared.sha256 || null, actual: screenshot.hash }));
        if (declared.bytes !== screenshot.size) blocks.push(blocker('SCREENSHOT_BYTE_SIZE_MISMATCH', 'artifact', `${id}: screenshot byte size ${screenshot.size} does not match authored ${declared.bytes}.`, { captureId: id }));
        if (declared.width !== screenshot.width || declared.height !== screenshot.height) blocks.push(blocker('SCREENSHOT_DIMENSION_METADATA_MISMATCH', 'artifact', `${id}: screenshot dimensions ${screenshot.width}x${screenshot.height} do not match authored ${declared.width}x${declared.height}.`, { captureId: id }));
      }
      if (profile) {
        const expectedWidth = Math.round(profile.width * profile.dpr);
        const expectedHeight = Math.round(profile.height * profile.dpr);
        if (screenshot.width !== expectedWidth || screenshot.height !== expectedHeight) blocks.push(blocker('SCREENSHOT_VIEWPORT_DIMENSION_MISMATCH', 'provenance', `${id}: screenshot is ${screenshot.width}x${screenshot.height}; ${viewport} requires ${expectedWidth}x${expectedHeight}.`, { captureId: id }));
      }
    }

    results.push({
      id, viewport, route, tab: asString(capture?.tab) || 'default', accepted: blocks.length === 0,
      screenshot: screenshot.ok ? { path: screenshot.path, sha256: screenshot.hash, bytes: screenshot.size, width: screenshot.width, height: screenshot.height } : { path: screenshot.path, sha256: screenshot.hash, bytes: null, width: null, height: null },
      blockers: blocks
    });
  }
  return { results, coverage };
}

function coverageBlockers(coverage) {
  const blocks = [];
  for (const viewport of EXPECTED_VIEWPORTS) {
    const seen = coverage.get(viewport) || new Set();
    for (const route of EXPECTED_ROUTES) {
      if (!seen.has(route)) blocks.push(blocker('ROUTE_COVERAGE_MISSING', 'coverage', `${viewport}: no evidence for required route ${route}.`, { viewport, route }));
    }
  }
  return blocks;
}

const UNKNOWN_CODES = new Set([
  'EVIDENCE_FILE_MISSING', 'EVIDENCE_FILE_UNREADABLE', 'EVIDENCE_JSON_INVALID',
  'EVIDENCE_SCHEMA_UNSUPPORTED', 'UNSUPPORTED_EVIDENCE_SHAPE',
  'SOURCE_BINDING_MISSING', 'SOURCE_COMPLETION_BINDING_MISSING',
  'SOURCE_HEAD_UNKNOWN', 'SOURCE_DIRTY_FINGERPRINT_UNKNOWN',
  'SOURCE_HEAD_MISMATCH', 'SOURCE_DIRTY_FINGERPRINT_MISMATCH',
  'SOURCE_CHANGED_DURING_CAPTURE', 'RUNTIME_BINDING_MISSING',
  'RUNTIME_COMPLETION_BINDING_MISSING', 'RUNTIME_FINGERPRINT_UNKNOWN',
  'RUNTIME_FINGERPRINT_MISMATCH', 'RUNTIME_CHANGED_DURING_CAPTURE',
  'RUNTIME_INCOMPLETE', 'CAPTURE_SHAPE_INVALID', 'CAPTURE_TELEMETRY_MISSING',
  'VIEWPORT_UNSUPPORTED', 'VIEWPORT_IDENTITY_MISMATCH', 'VIEWPORT_PROFILE_MISMATCH',
  'ROUTE_UNSUPPORTED', 'CONTROL_SIZE_UNKNOWN', 'CLIPPING_UNKNOWN',
  'HEADER_TELEMETRY_UNKNOWN', 'FOOTER_TELEMETRY_UNKNOWN',
  'DOCUMENT_OVERFLOW_UNKNOWN', 'ROUTE_OVERFLOW_UNKNOWN', 'RENDER_TELEMETRY_UNKNOWN',
  'GPU_EVIDENCE_MISSING', 'CONTEXT_LOSS_TELEMETRY_MISSING', 'GENERATED_AT_MISSING',
  'DEVICE_EVIDENCE_MISSING', 'DEVICE_PROFILE_MISSING', 'DEVICE_IDENTITY_INCOMPLETE',
  'DEVICE_PROFILE_MISMATCH', 'DEVICE_ID_MISMATCH', 'DEVICE_PROFILE_UNSUPPORTED',
  'CAPTURE_DEVICE_MISMATCH', 'CAPTURE_BINDING_MISMATCH',
  'SUMMARY_MISSING', 'SUMMARY_COUNT_INVALID', 'SUMMARY_COUNT_MISMATCH',
  'SCREENSHOT_FIELD_MISSING', 'SCREENSHOT_PATH_INVALID', 'SCREENSHOT_MISSING',
  'SCREENSHOT_EMPTY', 'SCREENSHOT_INVALID', 'SCREENSHOT_METADATA_MISSING',
  'SCREENSHOT_VIEWPORT_DIMENSION_MISMATCH', 'ROUTE_COVERAGE_MISSING'
]);

function summarizeBlockers(blocks) {
  const byCode = {};
  const byCategory = {};
  for (const item of blocks) {
    byCode[item.code] = (byCode[item.code] || 0) + 1;
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }
  return { byCode, byCategory };
}

export async function verifyInterfaceEvidence(reportPath, options = {}) {
  const root = resolve(options.root || ROOT);
  const repository = options.expectedSource
    ? {
        head: asString(options.expectedSource.head) || 'UNKNOWN',
        dirty: typeof options.expectedSource.dirty === 'boolean' ? options.expectedSource.dirty : null,
        dirtyEntryCount: Number.isInteger(options.expectedSource.dirtyEntryCount) ? options.expectedSource.dirtyEntryCount : null,
        dirtyFingerprintSchema: asString(options.expectedSource.dirtyFingerprintSchema) || DIRTY_FINGERPRINT_SCHEMA,
        dirtyFingerprint: asString(options.expectedSource.dirtyFingerprint) || 'UNKNOWN'
      }
    : await readRepositoryFingerprint(root);
  const activeRuntime = options.expectedRuntime
    ? {
        schema: asString(options.expectedRuntime.schema) || RUNTIME_SCHEMA,
        mode: asString(options.expectedRuntime.mode) || 'source-root',
        fingerprint: asString(options.expectedRuntime.fingerprint) || 'UNKNOWN',
        fileCount: Number.isInteger(options.expectedRuntime.fileCount) ? options.expectedRuntime.fileCount : null,
        missingFiles: Array.isArray(options.expectedRuntime.missingFiles) ? options.expectedRuntime.missingFiles : []
      }
    : await readRuntimeFingerprint(root);
  const absPath = resolve(root, reportPath || '');
  const audit = {
    auditSchema: AUDIT_SCHEMA, outcome: 'UNKNOWN', passed: false, exitCode: 1,
    auditedAt: new Date().toISOString(),
    evidence: { path: absPath, exists: false, sha256: null, schema: null, generatedAt: null, source: { head: null, dirtyFingerprint: null, dirty: null }, runtime: { fingerprint: null, schema: null, mode: null } },
    repository: { root, ...repository }, activeRuntime,
    counts: { totalCaptures: 0, acceptedCaptures: 0, rejectedCaptures: 0, blockers: 0, unknownBlockers: 0 },
    blockerSummary: { byCode: {}, byCategory: {} }, blockers: [], captures: []
  };

  if (!reportPath || !existsSync(absPath)) {
    audit.blockers.push(blocker('EVIDENCE_FILE_MISSING', 'evidence', `Interface-matrix evidence does not exist: ${absPath}`));
    return finalizeAudit(audit);
  }
  audit.evidence.exists = true;
  let raw;
  try {
    raw = await readFile(absPath);
    audit.evidence.sha256 = sha256(raw);
  } catch (error) {
    audit.blockers.push(blocker('EVIDENCE_FILE_UNREADABLE', 'evidence', `Unable to read evidence: ${error.message}`));
    return finalizeAudit(audit);
  }
  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    audit.blockers.push(blocker('EVIDENCE_JSON_INVALID', 'evidence', `Evidence JSON is malformed: ${error.message}`));
    return finalizeAudit(audit);
  }

  const schema = evidenceSchema(data);
  const binding = sourceBinding(data?.source);
  const completionBinding = sourceBinding(data?.sourceAtCompletion);
  const runtime = runtimeBinding(data?.runtime);
  const runtimeAtCompletion = runtimeBinding(data?.runtimeAtCompletion);
  audit.evidence.schema = schema || null;
  audit.evidence.generatedAt = asString(data?.generatedAt) || null;
  audit.evidence.source = { head: binding.head || null, dirtyFingerprint: binding.dirtyFingerprint || null, dirty: binding.dirty };
  audit.evidence.runtime = { fingerprint: runtime.fingerprint || null, schema: runtime.schema || null, mode: runtime.mode || null };

  if (schema !== EVIDENCE_SCHEMA) audit.blockers.push(blocker('EVIDENCE_SCHEMA_UNSUPPORTED', 'evidence', `Evidence schema ${schema || '(missing)'} is unsupported; expected ${EVIDENCE_SCHEMA}.`));
  validateTopLevel(data, audit.blockers);
  validateSummary(data, audit.blockers);

  if (!binding.head || !binding.dirtyFingerprint || binding.dirtyFingerprintSchema !== DIRTY_FINGERPRINT_SCHEMA) audit.blockers.push(blocker('SOURCE_BINDING_MISSING', 'provenance', 'Evidence does not bind source HEAD and content-aware dirty fingerprint. Compatibility is UNKNOWN.'));
  if (!completionBinding.head || !completionBinding.dirtyFingerprint) audit.blockers.push(blocker('SOURCE_COMPLETION_BINDING_MISSING', 'provenance', 'Capture-completion source identity is absent.'));
  else if (binding.head !== completionBinding.head || binding.dirtyFingerprint !== completionBinding.dirtyFingerprint) audit.blockers.push(blocker('SOURCE_CHANGED_DURING_CAPTURE', 'provenance', 'Source HEAD or dirty content changed while the matrix was being captured.'));
  if (repository.head === 'UNKNOWN') audit.blockers.push(blocker('SOURCE_HEAD_UNKNOWN', 'provenance', 'Active repository HEAD could not be determined.'));
  if (repository.dirtyFingerprint === 'UNKNOWN') audit.blockers.push(blocker('SOURCE_DIRTY_FINGERPRINT_UNKNOWN', 'provenance', 'Active dirty-worktree fingerprint could not be determined.'));
  if (binding.head && repository.head !== 'UNKNOWN' && binding.head !== repository.head) audit.blockers.push(blocker('SOURCE_HEAD_MISMATCH', 'provenance', `Evidence HEAD ${binding.head} does not match active HEAD ${repository.head}.`));
  if (binding.dirtyFingerprint && repository.dirtyFingerprint !== 'UNKNOWN' && binding.dirtyFingerprint !== repository.dirtyFingerprint) audit.blockers.push(blocker('SOURCE_DIRTY_FINGERPRINT_MISMATCH', 'provenance', `Evidence dirty fingerprint ${binding.dirtyFingerprint} does not match active ${repository.dirtyFingerprint}.`));

  if (!runtime.fingerprint || runtime.schema !== RUNTIME_SCHEMA || runtime.mode !== 'source-root') audit.blockers.push(blocker('RUNTIME_BINDING_MISSING', 'provenance', 'Evidence does not contain a supported source-runtime fingerprint.'));
  if (!runtimeAtCompletion.fingerprint) audit.blockers.push(blocker('RUNTIME_COMPLETION_BINDING_MISSING', 'provenance', 'Capture-completion runtime identity is absent.'));
  else if (runtime.fingerprint !== runtimeAtCompletion.fingerprint) audit.blockers.push(blocker('RUNTIME_CHANGED_DURING_CAPTURE', 'provenance', 'Runtime bytes changed while the matrix was being captured.'));
  if (runtime.missingFiles === null || runtime.missingFiles.length > 0) audit.blockers.push(blocker('RUNTIME_INCOMPLETE', 'provenance', `Captured runtime is incomplete (${runtime.missingFiles?.join(', ') || 'missing-file list unavailable'}).`));
  if (activeRuntime.fingerprint === 'UNKNOWN') audit.blockers.push(blocker('RUNTIME_FINGERPRINT_UNKNOWN', 'provenance', 'Active runtime fingerprint could not be determined.'));
  if (runtime.fingerprint && activeRuntime.fingerprint !== 'UNKNOWN' && runtime.fingerprint !== activeRuntime.fingerprint) audit.blockers.push(blocker('RUNTIME_FINGERPRINT_MISMATCH', 'provenance', `Evidence runtime ${runtime.fingerprint} does not match active runtime ${activeRuntime.fingerprint}.`));

  validateRuntimeErrors(data, audit.blockers);
  const devices = validateDevices(data, audit.blockers);
  const captures = await validateCaptures(data, dirname(absPath), devices);
  audit.captures = captures.results;
  audit.blockers.push(...coverageBlockers(captures.coverage));
  for (const result of captures.results) audit.blockers.push(...result.blockers);
  audit.counts.totalCaptures = captures.results.length;
  return finalizeAudit(audit);
}

function finalizeAudit(audit) {
  const unknown = audit.blockers.filter(item => UNKNOWN_CODES.has(item.code));
  const globalTaint = audit.blockers.some(item => !item.captureId);
  if (audit.blockers.length === 0) {
    audit.outcome = 'PASS';
    audit.passed = true;
    audit.exitCode = 0;
  } else if (unknown.length > 0) audit.outcome = 'UNKNOWN';
  else audit.outcome = 'FAIL';
  if (audit.passed) {
    audit.counts.acceptedCaptures = audit.captures.length;
    audit.counts.rejectedCaptures = 0;
  } else if (globalTaint) {
    audit.counts.acceptedCaptures = 0;
    audit.counts.rejectedCaptures = audit.captures.length;
  } else {
    audit.counts.acceptedCaptures = audit.captures.filter(item => item.accepted).length;
    audit.counts.rejectedCaptures = audit.captures.length - audit.counts.acceptedCaptures;
  }
  audit.counts.blockers = audit.blockers.length;
  audit.counts.unknownBlockers = unknown.length;
  audit.blockerSummary = summarizeBlockers(audit.blockers);
  return audit;
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function formatAuditMarkdown(audit) {
  const lines = [
    '# MASSFRONT Interface Matrix Evidence Audit', '',
    `- Outcome: **${audit.outcome}**`, `- Evidence: \`${audit.evidence.path}\``,
    `- Evidence SHA-256: \`${audit.evidence.sha256 || 'UNKNOWN'}\``,
    `- Evidence schema: \`${audit.evidence.schema || 'UNKNOWN'}\``,
    `- Evidence source HEAD: \`${audit.evidence.source.head || 'UNKNOWN'}\``,
    `- Evidence dirty fingerprint: \`${audit.evidence.source.dirtyFingerprint || 'UNKNOWN'}\``,
    `- Evidence runtime fingerprint: \`${audit.evidence.runtime.fingerprint || 'UNKNOWN'}\``,
    `- Active HEAD: \`${audit.repository.head}\``,
    `- Active dirty fingerprint: \`${audit.repository.dirtyFingerprint}\``,
    `- Active runtime fingerprint: \`${audit.activeRuntime.fingerprint}\``,
    `- Active dirty entries: ${audit.repository.dirtyEntryCount ?? 'UNKNOWN'}`, '',
    '## Counts', '', '| Evidence rows | Accepted | Rejected | Blockers | Unknown blockers |',
    '|---:|---:|---:|---:|---:|',
    `| ${audit.counts.totalCaptures} | ${audit.counts.acceptedCaptures} | ${audit.counts.rejectedCaptures} | ${audit.counts.blockers} | ${audit.counts.unknownBlockers} |`,
    '', '## Blockers', ''
  ];
  if (audit.blockers.length === 0) lines.push('None. Evidence is compatible and all audited rows passed.');
  else {
    lines.push('| Code | Category | Evidence row | Detail |', '|---|---|---|---|');
    for (const item of audit.blockers) lines.push(`| ${mdCell(item.code)} | ${mdCell(item.category)} | ${mdCell(item.captureId || 'global')} | ${mdCell(item.message)} |`);
  }
  lines.push('', '## Fail-closed interpretation', '');
  if (audit.outcome === 'UNKNOWN') lines.push('The evidence cannot establish interface quality for the active source/runtime. Missing, stale, or incompatible proof is UNKNOWN, not zero defects. Re-capture with the supported schema and matching source/runtime/device identities before accepting this gate.');
  else if (audit.outcome === 'FAIL') lines.push('The evidence is compatible, but one or more measured acceptance criteria failed.');
  else lines.push('The evidence is source/runtime-compatible, schema-complete, artifact-bound, and contains no audited acceptance failure.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function parseCliArgs(argv) {
  const args = { evidence: null, expectedHead: null, expectedDirtyFingerprint: null, expectedRuntimeFingerprint: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--evidence') args.evidence = argv[++index];
    else if (token === '--expected-head') args.expectedHead = argv[++index];
    else if (token === '--expected-dirty-fingerprint') args.expectedDirtyFingerprint = argv[++index];
    else if (token === '--expected-runtime-fingerprint') args.expectedRuntimeFingerprint = argv[++index];
    else if (!token.startsWith('--') && !args.evidence) args.evidence = token;
    else throw new Error(`Unknown or incomplete argument: ${token}`);
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const expectedSource = args.expectedHead || args.expectedDirtyFingerprint
    ? { head: args.expectedHead || 'UNKNOWN', dirtyFingerprint: args.expectedDirtyFingerprint || 'UNKNOWN', dirtyFingerprintSchema: DIRTY_FINGERPRINT_SCHEMA, dirty: true, dirtyEntryCount: 1 }
    : undefined;
  const expectedRuntime = args.expectedRuntimeFingerprint
    ? { schema: RUNTIME_SCHEMA, mode: 'source-root', fingerprint: args.expectedRuntimeFingerprint, fileCount: 1, missingFiles: [] }
    : undefined;
  const audit = await verifyInterfaceEvidence(args.evidence, { expectedSource, expectedRuntime });
  process.stdout.write(`${JSON.stringify({ outcome: audit.outcome, passed: audit.passed, counts: audit.counts, blockerSummary: audit.blockerSummary }, null, 2)}\n`);
  process.exitCode = audit.exitCode;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}
