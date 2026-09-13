#!/usr/bin/env node
/* Deterministic fail-closed tests for interface evidence and CLI exit codes. */

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';
import {
  DIRTY_FINGERPRINT_SCHEMA,
  EVIDENCE_SCHEMA,
  EXPECTED_ROUTES,
  EXPECTED_VIEWPORTS,
  VIEWPORT_PROFILES,
  computeDeviceIdentityId,
  readRepositoryFingerprint,
  readRuntimeFingerprint,
  sha256,
  summarizeEvidenceData,
  verifyInterfaceEvidence
} from './verify-interface-matrix.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const VERIFIER = join(ROOT, 'tools/interface-audit/verify-interface-matrix.mjs');
const FIXTURES_DIR = join(ROOT, '.tmp/interface-audit/fixtures-v2');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-S938U) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
let EXPECTED_SOURCE;
let EXPECTED_RUNTIME;
let ARTIFACTS;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function makePng(width, height) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

async function createArtifacts() {
  const artifacts = {};
  for (const key of EXPECTED_VIEWPORTS) {
    const profile = VIEWPORT_PROFILES[key];
    const width = Math.round(profile.width * profile.dpr);
    const height = Math.round(profile.height * profile.dpr);
    const bytes = makePng(width, height);
    const file = `clean-${key}.png`;
    await writeFile(join(FIXTURES_DIR, file), bytes);
    artifacts[key] = { file, screenshot: { sha256: sha256(bytes), bytes: bytes.length, width, height, mime: 'image/png' } };
  }
  const corrupt = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  await writeFile(join(FIXTURES_DIR, 'corrupt.png'), corrupt);
  return artifacts;
}

function makeDevice(key) {
  const profile = VIEWPORT_PROFILES[key];
  const device = {
    profileKey: key,
    captureKind: 'playwright-emulated-viewport',
    browserName: 'chromium',
    browserVersion: '131.0.6778.260',
    userAgent: profile.mobile ? MOBILE_UA : DESKTOP_UA,
    platform: profile.mobile ? 'Linux armv8l' : 'Win32',
    maxTouchPoints: profile.touch ? 5 : 0,
    renderer: 'ANGLE (NVIDIA GeForce RTX, Direct3D11)',
    requested: { width: profile.width, height: profile.height, dpr: profile.dpr, mobile: profile.mobile, touch: profile.touch },
    actual: { width: profile.width, height: profile.height, dpr: profile.dpr }
  };
  device.id = computeDeviceIdentityId(device);
  return device;
}

function makeCleanCapture(viewportKey, route, devices) {
  const profile = VIEWPORT_PROFILES[viewportKey];
  const artifact = ARTIFACTS[viewportKey];
  const headerRequired = route !== 'home';
  return {
    route,
    tab: 'default',
    viewportKey,
    viewport: { w: profile.width, h: profile.height },
    deviceScaleFactor: profile.dpr,
    deviceId: devices[viewportKey].id,
    binding: {
      sourceHead: EXPECTED_SOURCE.head,
      sourceDirtyFingerprint: EXPECTED_SOURCE.dirtyFingerprint,
      runtimeFingerprint: EXPECTED_RUNTIME.fingerprint,
      deviceId: devices[viewportKey].id,
      viewportKey
    },
    display: 'flex',
    root: { x: 0, y: 0, w: profile.width, h: profile.height },
    documentOverflowX: 0,
    routeOverflowX: 0,
    routeOverflowActionable: false,
    textLength: 350,
    controlCount: 8,
    onScreenControls: 8,
    under44: [],
    clippedControls: [],
    scrollHosts: [],
    headerRequired,
    headerPresent: headerRequired,
    headerVisible: headerRequired,
    footerRequired: false,
    footerPresent: false,
    footerVisible: false,
    file: artifact.file,
    screenshot: { ...artifact.screenshot }
  };
}

function buildCompleteCleanReport() {
  const devices = Object.fromEntries(EXPECTED_VIEWPORTS.map(key => [key, makeDevice(key)]));
  const captures = [];
  for (const viewport of EXPECTED_VIEWPORTS) {
    for (const route of EXPECTED_ROUTES) captures.push(makeCleanCapture(viewport, route, devices));
  }
  const report = {
    evidenceSchema: EVIDENCE_SCHEMA,
    url: 'http://127.0.0.1:8901/',
    generatedAt: new Date().toISOString(),
    source: { ...EXPECTED_SOURCE },
    sourceAtCompletion: { ...EXPECTED_SOURCE },
    runtime: structuredClone(EXPECTED_RUNTIME),
    runtimeAtCompletion: structuredClone(EXPECTED_RUNTIME),
    captureCompleted: true,
    captureKind: 'fixture',
    browser: { name: 'chromium', version: '131.0.6778.260', headless: true },
    devices,
    gpu: { renderer: 'ANGLE (NVIDIA GeForce RTX, Direct3D11)' },
    webglContextLost: false,
    errors: { page: [], console: [], requests: [], capture: [], contextLossEvents: 0 },
    captures
  };
  report.summary = summarizeEvidenceData(report);
  return report;
}

function withSummary(report) {
  report.summary = summarizeEvidenceData(report);
  return report;
}

async function cliExitCode(fixtureFile) {
  const args = [
    VERIFIER, '--evidence', fixtureFile,
    '--expected-head', EXPECTED_SOURCE.head,
    '--expected-dirty-fingerprint', EXPECTED_SOURCE.dirtyFingerprint,
    '--expected-runtime-fingerprint', EXPECTED_RUNTIME.fingerprint
  ];
  try {
    await execFileAsync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return 0;
  } catch (error) {
    return Number.isInteger(error.code) ? error.code : 1;
  }
}

async function runFixtureTests() {
  await mkdir(FIXTURES_DIR, { recursive: true });
  ARTIFACTS = await createArtifacts();
  EXPECTED_SOURCE = await readRepositoryFingerprint(ROOT);
  EXPECTED_RUNTIME = await readRuntimeFingerprint(ROOT);

  const cases = [
    { name: 'clean compliant matrix', pass: true, outcome: 'PASS', rules: [], build: () => buildCompleteCleanReport() },
    { name: 'undersized touch target', pass: false, outcome: 'FAIL', rules: ['UNDERSIZED_CONTROL'], build: () => { const r=buildCompleteCleanReport();r.captures[1].under44=[{id:'small',w:32,h:32}];return withSummary(r); } },
    { name: 'required header missing', pass: false, outcome: 'FAIL', rules: ['HEADER_MISSING_OR_CLIPPED'], build: () => { const r=buildCompleteCleanReport();r.captures[1].headerPresent=false;r.captures[1].headerVisible=false;return withSummary(r); } },
    { name: 'required footer clipped', pass: false, outcome: 'FAIL', rules: ['FOOTER_MISSING_OR_CLIPPED'], build: () => { const r=buildCompleteCleanReport();r.captures[2].footerRequired=true;r.captures[2].footerPresent=true;r.captures[2].footerVisible=false;return withSummary(r); } },
    { name: 'control clipped', pass: false, outcome: 'FAIL', rules: ['CONTROL_CLIPPED'], build: () => { const r=buildCompleteCleanReport();r.captures[3].clippedControls=[{id:'offscreen'}];return withSummary(r); } },
    { name: 'document and route overflow', pass: false, outcome: 'FAIL', rules: ['DOCUMENT_OVERFLOW','ROUTE_OVERFLOW'], build: () => { const r=buildCompleteCleanReport();r.captures[4].documentOverflowX=14;r.captures[4].routeOverflowX=14;r.captures[4].routeOverflowActionable=true;return withSummary(r); } },
    { name: 'runtime page and console exceptions', pass: false, outcome: 'FAIL', rules: ['RUNTIME_PAGE_ERROR','RUNTIME_CONSOLE_ERROR'], build: () => { const r=buildCompleteCleanReport();r.errors.page.push({viewport:'phone-p',message:'TypeError'});r.errors.console.push({viewport:'desktop-1440',message:'WebGL INVALID_OPERATION'});return withSummary(r); } },
    { name: 'failed request', pass: false, outcome: 'FAIL', rules: ['REQUEST_FAILED'], build: () => { const r=buildCompleteCleanReport();r.errors.requests.push({viewport:'phone-p',url:'https://invalid.example/a',error:'net::ERR_FAILED'});return withSummary(r); } },
    { name: 'HTTP error response', pass: false, outcome: 'FAIL', rules: ['REQUEST_FAILED'], build: () => { const r=buildCompleteCleanReport();r.errors.requests.push({viewport:'phone-p',url:'http://127.0.0.1/missing',status:404,error:'HTTP 404'});return withSummary(r); } },
    { name: 'blank rendered route', pass: false, outcome: 'FAIL', rules: ['BLANK_ROUTE'], build: () => { const r=buildCompleteCleanReport();r.captures[5].textLength=0;return withSummary(r); } },
    { name: 'missing screenshot is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SCREENSHOT_MISSING'], build: () => { const r=buildCompleteCleanReport();r.captures[6].file='absent.png';return withSummary(r); } },
    { name: 'corrupt screenshot is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SCREENSHOT_INVALID'], build: () => { const r=buildCompleteCleanReport();r.captures[6].file='corrupt.png';return withSummary(r); } },
    { name: 'screenshot hash tampering', pass: false, outcome: 'FAIL', rules: ['SCREENSHOT_SHA256_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.captures[7].screenshot.sha256='0'.repeat(64);return withSummary(r); } },
    { name: 'screenshot dimension metadata tampering', pass: false, outcome: 'FAIL', rules: ['SCREENSHOT_DIMENSION_METADATA_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.captures[8].screenshot.width+=1;return withSummary(r); } },
    { name: 'screenshot byte-size metadata tampering', pass: false, outcome: 'FAIL', rules: ['SCREENSHOT_BYTE_SIZE_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.captures[9].screenshot.bytes+=1;return withSummary(r); } },
    { name: 'viewport identity mismatch is unknown', pass: false, outcome: 'UNKNOWN', rules: ['VIEWPORT_IDENTITY_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.captures[10].viewport.w+=1;return withSummary(r); } },
    { name: 'capture/device binding mismatch is unknown', pass: false, outcome: 'UNKNOWN', rules: ['CAPTURE_DEVICE_MISMATCH','CAPTURE_BINDING_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.captures[11].deviceId='f'.repeat(64);return withSummary(r); } },
    { name: 'device identity hash mismatch is unknown', pass: false, outcome: 'UNKNOWN', rules: ['DEVICE_ID_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.devices['phone-p'].id='a'.repeat(64);return withSummary(r); } },
    { name: 'incomplete evidence schema is unknown', pass: false, outcome: 'UNKNOWN', rules: ['UNSUPPORTED_EVIDENCE_SHAPE','CAPTURE_TELEMETRY_MISSING'], build: () => { const r=buildCompleteCleanReport();delete r.errors.capture;delete r.captures[12].documentOverflowX;return withSummary(r); } },
    { name: 'software renderer', pass: false, outcome: 'FAIL', rules: ['HARDWARE_GPU_REQUIRED'], build: () => { const r=buildCompleteCleanReport();r.gpu.renderer='Google SwiftShader';return withSummary(r); } },
    { name: 'route coverage missing is unknown', pass: false, outcome: 'UNKNOWN', rules: ['ROUTE_COVERAGE_MISSING'], build: () => { const r=buildCompleteCleanReport();r.captures=r.captures.filter(c=>!(c.viewportKey==='phone-p'&&c.route==='social'));return withSummary(r); } },
    { name: 'WebGL context loss', pass: false, outcome: 'FAIL', rules: ['WEBGL_CONTEXT_LOSS'], build: () => { const r=buildCompleteCleanReport();r.webglContextLost=true;r.errors.contextLossEvents=1;r.errors.console.push({viewport:'phone-p',message:'CONTEXT_LOST_WEBGL'});return withSummary(r); } },
    { name: 'stale source HEAD is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SOURCE_HEAD_MISMATCH'], build: () => { const r=buildCompleteCleanReport();const value='deadbeef'.padEnd(40,'0');r.source.head=value;r.sourceAtCompletion.head=value;r.captures.forEach(c=>c.binding.sourceHead=value);return withSummary(r); } },
    { name: 'stale dirty content fingerprint is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SOURCE_DIRTY_FINGERPRINT_MISMATCH'], build: () => { const r=buildCompleteCleanReport();const value='b'.repeat(64);r.source.dirtyFingerprint=value;r.sourceAtCompletion.dirtyFingerprint=value;r.captures.forEach(c=>c.binding.sourceDirtyFingerprint=value);return withSummary(r); } },
    { name: 'stale runtime fingerprint is unknown', pass: false, outcome: 'UNKNOWN', rules: ['RUNTIME_FINGERPRINT_MISMATCH'], build: () => { const r=buildCompleteCleanReport();const value='c'.repeat(64);r.runtime.fingerprint=value;r.runtimeAtCompletion.fingerprint=value;r.captures.forEach(c=>c.binding.runtimeFingerprint=value);return withSummary(r); } },
    { name: 'source changed during capture is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SOURCE_CHANGED_DURING_CAPTURE'], build: () => { const r=buildCompleteCleanReport();r.sourceAtCompletion.dirtyFingerprint='d'.repeat(64);return withSummary(r); } },
    { name: 'runtime changed during capture is unknown', pass: false, outcome: 'UNKNOWN', rules: ['RUNTIME_CHANGED_DURING_CAPTURE'], build: () => { const r=buildCompleteCleanReport();r.runtimeAtCompletion.fingerprint='e'.repeat(64);return withSummary(r); } },
    { name: 'route open failure', pass: false, outcome: 'FAIL', rules: ['ROUTE_OPEN_FAILED'], build: () => { const r=buildCompleteCleanReport();r.captures[13].openError='route rejected';return withSummary(r); } },
    { name: 'fatal/incomplete capture', pass: false, outcome: 'FAIL', rules: ['CAPTURE_INCOMPLETE','CAPTURE_RUNTIME_ERROR'], build: () => { const r=buildCompleteCleanReport();r.captureCompleted=false;r.errors.capture.push({viewport:'phone-p',message:'browser closed'});return withSummary(r); } },
    { name: 'summary mismatch is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SUMMARY_COUNT_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.summary.under44=1;return r; } },
    { name: 'unsupported evidence schema is unknown', pass: false, outcome: 'UNKNOWN', rules: ['EVIDENCE_SCHEMA_UNSUPPORTED'], build: () => { const r=buildCompleteCleanReport();r.evidenceSchema='massfront.interface-matrix/v0';return r; } },
    { name: 'missing GPU identity is unknown', pass: false, outcome: 'UNKNOWN', rules: ['GPU_EVIDENCE_MISSING'], build: () => { const r=buildCompleteCleanReport();delete r.gpu;return r; } },
    { name: 'missing device profile is unknown', pass: false, outcome: 'UNKNOWN', rules: ['DEVICE_PROFILE_MISSING','CAPTURE_DEVICE_MISMATCH'], build: () => { const r=buildCompleteCleanReport();delete r.devices['phone-p'];return r; } },
    { name: 'physical screenshot/viewport mismatch is unknown', pass: false, outcome: 'UNKNOWN', rules: ['SCREENSHOT_VIEWPORT_DIMENSION_MISMATCH'], build: () => { const r=buildCompleteCleanReport();r.captures[0].file=ARTIFACTS['tablet-p'].file;r.captures[0].screenshot={...ARTIFACTS['tablet-p'].screenshot};return r; } },
    { name: 'missing context-loss telemetry is unknown', pass: false, outcome: 'UNKNOWN', rules: ['CONTEXT_LOSS_TELEMETRY_MISSING'], build: () => { const r=buildCompleteCleanReport();delete r.errors.contextLossEvents;r.summary=summarizeEvidenceData(r);return r; } },
    { name: 'missing evidence report is unknown', pass: false, outcome: 'UNKNOWN', rules: ['EVIDENCE_FILE_MISSING'], missingReport: true }
  ];

  let passed = 0;
  for (let index = 0; index < cases.length; index += 1) {
    const test = cases[index];
    const fixtureFile = test.missingReport
      ? join(FIXTURES_DIR, `intentionally-missing-${process.pid}.json`)
      : join(FIXTURES_DIR, `fixture-${String(index + 1).padStart(2, '0')}.json`);
    if (!test.missingReport) {
      const report = test.build();
      await writeFile(fixtureFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    const audit = await verifyInterfaceEvidence(fixtureFile, { root: ROOT, expectedSource: EXPECTED_SOURCE, expectedRuntime: EXPECTED_RUNTIME });
    const cliCode = await cliExitCode(fixtureFile);
    const rules = Object.keys(audit.blockerSummary.byCode);
    const ok = audit.passed === test.pass
      && audit.outcome === test.outcome
      && test.rules.every(rule => audit.blockerSummary.byCode[rule] > 0)
      && cliCode === (test.pass ? 0 : 1);
    if (ok) passed += 1;
    console.log(`[${String(index + 1).padStart(2, '0')}] ${ok ? 'PASS' : 'FAIL'} ${test.name} | outcome=${audit.outcome} cli=${cliCode} rules=${rules.join(',') || 'none'}`);
  }

  console.log(`INTERFACE_VERIFIER_FIXTURES=${passed}/${cases.length}`);
  if (passed !== cases.length) process.exitCode = 1;
}

runFixtureTests().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
