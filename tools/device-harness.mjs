#!/usr/bin/env node
/* Physical Android evidence lane. This tool fails closed: a desktop browser,
   an emulator, an unauthorised phone, or an S25-mismatched device cannot
   produce an accepted MASSFRONT mobile benchmark. */
import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S25_ULTRA_MODEL_PATTERN,
  isAndroidMobileUserAgent,
  assertMobileGpuBranch
} from './mobile-device-profile.mjs';
import {
  startStaticServer,
  collectSourceIdentity,
  installTelemetryInit,
  enterRealBattle,
  applyPreset,
  enableRuntimeTelemetry,
  runScenarioBenchmark
} from './perf-lab/perf-probe-runner.mjs';
import { BENCHMARK_SCENARIOS, benchmarkScenarioSupport } from './perf-lab/scenario-manifests.mjs';
import { readGpuRenderer } from './chrome-gpu.mjs';
import { collectEvidenceIdentity } from './evidence-foundation/fingerprints.mjs';
import { inspectPng } from './evidence-foundation/png-evidence.mjs';
import { EVIDENCE_FOUNDATION_SCHEMA, validateEvidenceRecord } from './evidence-foundation/contracts.mjs';
import { writeEvidenceDecision } from './evidence-foundation/ledger.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tmp', 'perf-lab', 'device');
const CAPTURES = join(ROOT, 'tmp', 'perf-lab', 'captures');
const DEFAULT_CDP_PORT = 9222;

function argValue(args, name, fallback = null) {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
}

export function parseAdbDevices(text) {
  return String(text || '').split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean)
    .map(line => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state: state || 'unknown', raw: line };
    });
}

export function selectAuthorizedDevice(devices, requestedSerial = null) {
  const selected = requestedSerial ? devices.filter(device => device.serial === requestedSerial) : devices;
  if (!selected.length) throw new Error(requestedSerial ? `DEVICE_NOT_FOUND: ${requestedSerial}` : 'NO_ANDROID_DEVICE: connect an authorised device with USB debugging enabled');
  if (!requestedSerial && selected.length > 1) throw new Error(`MULTIPLE_ANDROID_DEVICES: pass --serial (${selected.map(device => device.serial).join(', ')})`);
  const device = selected[0];
  if (device.state !== 'device') throw new Error(`ANDROID_DEVICE_NOT_AUTHORIZED: ${device.serial} state=${device.state}; unlock the phone and approve USB debugging`);
  return device;
}

async function findAdb() {
  const executable = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', executable),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', executable),
    process.platform === 'win32' && process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', executable),
    'adb'
  ];
  for (const candidate of candidates.filter(Boolean)) {
    try { await execFileAsync(candidate, ['version'], { windowsHide: true }); return candidate; } catch {}
  }
  throw new Error('ADB_NOT_FOUND: install Android Platform Tools, add adb to PATH, or set ADB_PATH');
}

async function adb(adbPath, serial, args) {
  const prefix = serial ? ['-s', serial] : [];
  const { stdout, stderr } = await execFileAsync(adbPath, [...prefix, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return String(stdout || stderr || '').trim();
}

async function deviceInfo(adbPath, serial) {
  const get = property => adb(adbPath, serial, ['shell', 'getprop', property]).catch(() => '');
  const shell = args => adb(adbPath, serial, ['shell', ...args]).catch(() => '');
  const [model, manufacturer, abi, androidVersion, sdk, size, density, battery, thermal] = await Promise.all([
    get('ro.product.model'), get('ro.product.manufacturer'), get('ro.product.cpu.abi'), get('ro.build.version.release'), get('ro.build.version.sdk'),
    shell(['wm', 'size']), shell(['wm', 'density']), shell(['dumpsys', 'battery']), shell(['dumpsys', 'thermalservice'])
  ]);
  return { model, manufacturer, abi, androidVersion, sdk, physicalSize: size, density, battery, thermal };
}

function assertTargetDevice(info, allowNonS25) {
  if (!allowNonS25 && !S25_ULTRA_MODEL_PATTERN.test(info.model || '')) {
    throw new Error(`WRONG_DEVICE: expected Galaxy S25 Ultra (SM-S938*), received ${info.manufacturer || 'unknown'} ${info.model || 'unknown'}; pass --allow-non-s25 only for harness development`);
  }
}

function expectSelfTestFailure(label, fn) {
  try { fn(); } catch { return; }
  throw new Error(`SELF_TEST_EXPECTED_FAILURE_NOT_RAISED: ${label}`);
}

async function preflight(options) {
  const adbPath = await findAdb();
  const devices = parseAdbDevices(await adb(adbPath, null, ['devices', '-l']));
  const device = selectAuthorizedDevice(devices, options.serial);
  const info = await deviceInfo(adbPath, device.serial);
  assertTargetDevice(info, options.allowNonS25);
  return { adbPath, device, info };
}

async function removeForward(adbPath, serial, direction, endpoint) {
  await adb(adbPath, serial, [direction, '--remove', endpoint]).catch(() => {});
}

export async function runDeviceHarness(options = {}) {
  const scenario = BENCHMARK_SCENARIOS[options.scenario || '1v1_duel_verdant'];
  if (!scenario) throw new Error(`UNKNOWN_SCENARIO: ${options.scenario}`);
  const support = benchmarkScenarioSupport(scenario);
  if (support.status !== 'supported') throw new Error(`UNSUPPORTED_SCENARIO: ${scenario.id}: ${support.reason}`);
  const units = Number(options.units || 500);
  if (!Number.isInteger(units) || units < 1) throw new Error('INVALID_UNITS: --units must be a positive integer');
  const pre = await preflight(options);
  const sourceIdentity = await collectSourceIdentity();
  const foundationIdentity = await collectEvidenceIdentity({ root: ROOT });
  const server = await startStaticServer();
  const hostPort = Number(new URL(server.url).port);
  const cdpPort = Number(options.cdpPort || DEFAULT_CDP_PORT);
  const cdpEndpoint = `tcp:${cdpPort}`;
  let browser = null;
  let page = null;
  try {
    await adb(pre.adbPath, pre.device.serial, ['reverse', `tcp:${hostPort}`, `tcp:${hostPort}`]);
    await adb(pre.adbPath, pre.device.serial, ['forward', cdpEndpoint, 'localabstract:chrome_devtools_remote']);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error('ANDROID_CDP_NO_CONTEXT: open Chrome on the connected device and enable remote debugging');
    page = await context.newPage();
    const issues = { pageErrors: [], consoleErrors: [] };
    page.on('pageerror', error => issues.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
    const networkIsolation = await installTelemetryInit(page);
    const url = `http://127.0.0.1:${hostPort}/?mfperf=1&perfEvidence=device`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof spawnUnit === 'function' && typeof resetWorld === 'function', null, { timeout: 90000 });
    const mobile = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      mobileGpu: MF_MOBILE_GPU,
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio
    }));
    if (!isAndroidMobileUserAgent(mobile.userAgent)) throw new Error(`ANDROID_UA_REQUIRED: device returned ${mobile.userAgent}`);
    assertMobileGpuBranch(mobile.mobileGpu, mobile.userAgent, 'device-harness');
    const gpu = await readGpuRenderer(page);
    const gpuCaps = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
      return {
        webgl2: !!gl,
        astc: !!(gl && gl.getExtension('WEBGL_compressed_texture_astc')),
        maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : null
      };
    });
    const gpuIdentity = `${gpu.renderer || ''} ${gpu.vendor || ''}`;
    if (!gpuCaps.webgl2 || /swiftshader|software|llvmpipe|lavapipe|microsoft basic/i.test(gpuIdentity)) {
      throw new Error(`DEVICE_HARDWARE_WEBGL2_REQUIRED: renderer=${gpu.renderer || 'unknown'}`);
    }
    if (!options.allowNonS25 && !gpuCaps.astc) {
      throw new Error(`S25_ASTC_REQUIRED: WEBGL_compressed_texture_astc unavailable on ${gpu.renderer || 'unknown renderer'}`);
    }
    Object.assign(gpu, gpuCaps);
    const preset = await applyPreset(page, options.preset || 'high');
    const deploymentProof = await enterRealBattle(page);
    await enableRuntimeTelemetry(page);
    const viewport = {
      width: Math.round(mobile.width), height: Math.round(mobile.height), dpr: Number(mobile.dpr),
      physicalWidth: Math.round(mobile.width * mobile.dpr), physicalHeight: Math.round(mobile.height * mobile.dpr),
      physicalSize: pre.info.physicalSize, density: pre.info.density, userAgent: mobile.userAgent,
      mobileGpuRequested: true, mobileGpuEffective: mobile.mobileGpu === true
    };
    const result = await runScenarioBenchmark(page, scenario, units, {
      durationFrames: Number(options.frames || 240), sourceIdentity, gpu, issues, deploymentProof, preset,
      viewport, url
    });
    await page.close();
    page = null;
    networkIsolation.assertNoExternalRequests(`physical-device scenario ${scenario.id}`);
    result.device = {
      serial: pre.device.serial, state: pre.device.state, ...pre.info,
      userAgent: mobile.userAgent, mobileGpu: mobile.mobileGpu,
      webgl2: gpuCaps.webgl2, astc: gpuCaps.astc, maxTextureSize: gpuCaps.maxTextureSize
    };
    const foundationCaptures = [];
    for (const capture of result.captures || []) {
      const details = await inspectPng(join(CAPTURES, capture.file));
      foundationCaptures.push({ ...capture, width: details.width, height: details.height });
    }
    const endFoundationIdentity = await collectEvidenceIdentity({ root: ROOT });
    const sourceIdentityStable = ['gitHead', 'dirtyFingerprint', 'runtimeFingerprint', 'packageFingerprint']
      .every(key => foundationIdentity[key] === endFoundationIdentity[key]);
    const foundationRecord = {
      foundationSchema: EVIDENCE_FOUNDATION_SCHEMA,
      eligibleForAcceptance: result.evidenceStatus === 'accepted' && !options.allowNonS25 && sourceIdentityStable,
      sourceIdentityStable,
      timestamp: result.timestamp,
      provenance: {
        gitHead: foundationIdentity.gitHead,
        dirtyFingerprint: foundationIdentity.dirtyFingerprint,
        runtimeFingerprint: foundationIdentity.runtimeFingerprint,
        packageFingerprint: foundationIdentity.packageFingerprint
      },
      device: result.device,
      viewport,
      captures: foundationCaptures
    };
    const validation = await validateEvidenceRecord(foundationRecord, {
      expectedIdentity: foundationIdentity, captureRoot: CAPTURES, requireS25: true
    });
    await mkdir(OUT, { recursive: true });
    const ledger = await writeEvidenceDecision({ ledgerRoot: join(OUT, 'ledger'), record: foundationRecord, validation });
    result.evidenceFoundation = { status: validation.status, errors: validation.errors, ledger };
    if (!validation.accepted) {
      result.evidenceStatus = 'rejected';
      result.rejectionReasons = [...new Set([...(result.rejectionReasons || []), ...validation.errors])];
    }
    const suffix = validation.accepted ? 'accepted' : 'rejected';
    const output = join(OUT, `${scenario.id}_${units}u_${sourceIdentity.runtimeFingerprint.slice(0, 12)}_${suffix}.json`);
    await writeFile(output, JSON.stringify(result, null, 2) + '\n');
    if (!validation.accepted) throw new Error(`EVIDENCE_REJECTED: ${validation.errors.join('; ')}; retained=${output}`);
    return { output, result };
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await removeForward(pre.adbPath, pre.device.serial, 'forward', cdpEndpoint);
    await removeForward(pre.adbPath, pre.device.serial, 'reverse', `tcp:${hostPort}`);
    await server.close().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    const parsed = parseAdbDevices('List of devices attached\nA\tdevice product:x\nB\tunauthorized\n');
    if (parsed.length !== 2 || selectAuthorizedDevice(parsed, 'A').serial !== 'A') throw new Error('SELF_TEST_PARSE_FAILED');
    expectSelfTestFailure('no device', () => selectAuthorizedDevice([]));
    expectSelfTestFailure('multiple devices', () => selectAuthorizedDevice([{ serial: 'A', state: 'device' }, { serial: 'C', state: 'device' }]));
    expectSelfTestFailure('unauthorised device', () => selectAuthorizedDevice(parsed, 'B'));
    assertTargetDevice({ model: 'SM-S938U', manufacturer: 'samsung' }, false);
    expectSelfTestFailure('wrong target model', () => assertTargetDevice({ model: 'Pixel 9' }, false));
    assertTargetDevice({ model: 'Pixel 9' }, true);
    console.log('DEVICE_HARNESS_SELF_TEST=PASS (parse, selection, authorization, target model)'); return;
  }
  if (args.includes('--dry-run')) {
    const pre = await preflight({ serial: argValue(args, '--serial'), allowNonS25: args.includes('--allow-non-s25') });
    console.log(JSON.stringify({ status: 'DEVICE_PREFLIGHT_OK', serial: pre.device.serial, ...pre.info }, null, 2)); return;
  }
  const outcome = await runDeviceHarness({
    serial: argValue(args, '--serial'), scenario: argValue(args, '--scenario', '1v1_duel_verdant'), units: argValue(args, '--units', '500'),
    preset: argValue(args, '--preset', 'high'), frames: argValue(args, '--frames', '240'), cdpPort: argValue(args, '--cdp-port', String(DEFAULT_CDP_PORT)),
    allowNonS25: args.includes('--allow-non-s25')
  });
  console.log(`DEVICE_EVIDENCE_ACCEPTED=${outcome.output}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch(error => { console.error(`DEVICE_HARNESS_FAILED: ${error.stack || error.message}`); process.exit(1); });
}
