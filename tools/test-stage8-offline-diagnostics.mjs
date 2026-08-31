#!/usr/bin/env node
/* Stage 8 source contract for browser diagnostics that are allowed to produce
   current performance, physical-device, or updater evidence. Historical
   one-off samplers are intentionally absent: passing this gate does not make
   their old output authoritative. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sharedInstall = /(?:(?:const\s+)?networkIsolation\s*=|network\s*=)\s*await\s+(?:installTelemetryInit|installOfflineNetworkIsolation)\(page\)\s*;/;
const finalCheckpoint = /await\s+(?:networkIsolation|network)\.finalize\s*\(/;
const contracts = [
  ['performance scenario runner', 'tools/perf-lab/perf-probe-runner.mjs', true],
  ['physical Android device harness', 'tools/device-harness.mjs', false],
  ['perfScale threshold gate', 'tools/verify-perfscale-gates.mjs', true],
  ['GL state inspector', 'tools/debug-lab/gl-state-inspector.mjs', true],
  ['spatial hash validator', 'tools/debug-lab/spatial-hash-validator.mjs', true],
  ['memory leak tracer', 'tools/debug-lab/memory-leak-tracer.mjs', true],
  ['deployment-flow diagnostic', 'tools/diagnose-deploy-flow.mjs', true],
  ['shader compile performance probe', 'tools/probe-shader-compile.mjs', true],
  ['cloud post-FX hardware probe', 'tools/test-cloud-postfx.mjs', true],
  ['portable-save transfer browser probe', 'tools/probe-stage8-save-transfer.mjs', true],
  ['updater status browser regression', 'tools/test-updater-status.mjs', true],
  ['terrain/performance acceptance verifier', 'tools/verify-perf-terrain-acceptance.mjs', true]
];

for (const [label, relative, createsContext] of contracts) {
  const source = await readFile(resolve(ROOT, relative), 'utf8');
  const installed = source.search(sharedInstall);
  const navigated = source.lastIndexOf('await page.goto');
  const finalized = source.search(finalCheckpoint);
  assert.ok(installed >= 0, `${label} does not install the shared offline boundary`);
  assert.ok(navigated > installed, `${label} does not install the boundary before navigation`);
  assert.ok(finalized > navigated, `${label} does not finalize the boundary after browser activity`);
  assert.doesNotMatch(source.slice(finalized),
    /await\s+page\.(?:goto|evaluate|screenshot|waitForTimeout|waitForFunction|reload)\s*\(/,
    `${label} performs browser activity after its final offline checkpoint`);
  assert.match(source.slice(finalized), /(?:await\s+writeFile|console\.log)/,
    `${label} emits its report/status before the final offline checkpoint`);
  if (createsContext) {
    assert.match(source, /new(?:Page|Context)\s*\(\s*\{[\s\S]{0,650}?serviceWorkers\s*:\s*['"]block['"]/,
      `${label} does not block service workers when creating its browser context`);
  } else {
    assert.match(source, /chromium\.connectOverCDP/,
      `${label} must identify its reused physical-device CDP context`);
  }
}

/* The GL recovery gate intentionally owns four pages in one same-origin
   context. Its shared helper installs the boundary before any caller is able
   to navigate, and the finalizer closes every page before evidence is judged. */
{
  const label = 'GL probe/recovery acceptance verifier';
  const source = await readFile(resolve(ROOT, 'tools/verify-gl-probe-recovery.mjs'), 'utf8');
  const helper = source.indexOf('async function isolatedPage(context,label)');
  const installed = source.indexOf('row.networkIsolation=await installOfflineNetworkIsolation(page)', helper);
  const firstNavigation = source.indexOf('await first.goto(', installed);
  const lastBrowserActivity = Math.max(source.lastIndexOf('await normal.goto('),
    source.lastIndexOf("await capture(normal,'normal-after-probe.png')"));
  const finalized = source.lastIndexOf('await finalizeAllNetworkPages()');
  assert.ok(helper >= 0 && installed > helper,
    `${label} does not install the shared offline boundary in its page factory`);
  assert.ok(firstNavigation > installed,
    `${label} does not install the boundary before its first navigation`);
  assert.match(source, /newContext\s*\(\s*\{[\s\S]{0,650}?serviceWorkers\s*:\s*['"]block['"]/,
    `${label} does not block service workers when creating its browser context`);
  const labels = [...source.matchAll(/isolatedPage\(context,'([^']+)'\)/g)].map(match => match[1]);
  assert.deepEqual(labels, ['first-probe', 'blocked-probe', 'recovered-probe', 'normal-after-probe'],
    `${label} must isolate exactly its four declared pages`);
  assert.ok(finalized > lastBrowserActivity,
    `${label} does not finalize every boundary after browser activity`);
  for (const field of ['finalized===true', 'pageClosed===true', 'offlineStorage?.verified===true',
    'serviceWorkers?.bypassConfigured===true', 'serviceWorkers?.verified===true',
    'blockedRequests?.length===0', 'blockedWebSockets?.length===0']) {
    assert.ok(source.includes(field), `${label} final gate omits ${field}`);
  }
  assert.match(source, /networkEvidence\.length===4&&networkEvidence\.every\(/,
    `${label} does not fail closed unless all four pages finalize cleanly`);
}

/* The terrain verifier records a report even when the network gate fails, so
   it must retain the failed finalization snapshot and reject the report. */
{
  const label = 'terrain/performance acceptance verifier';
  const source = await readFile(resolve(ROOT, 'tools/verify-perf-terrain-acceptance.mjs'), 'utf8');
  const snapshot = source.indexOf('report.networkIsolation=networkIsolation.snapshot()');
  const asserted = source.indexOf("finalGate('offline mode blocks all non-loopback requests'", snapshot);
  const exitsFailed = source.indexOf('if(failed.length)exitStatus=1', asserted);
  assert.ok(snapshot >= 0 && asserted > snapshot, `${label} does not retain failed final network evidence`);
  for (const field of ['finalized', 'pageClosed', 'offlineStorage.verified',
    'serviceWorkers.bypassConfigured', 'serviceWorkers.verified']) {
    assert.ok(source.includes(`report.networkIsolation.${field}`), `${label} final gate omits ${field}`);
  }
  assert.ok(exitsFailed > asserted, `${label} does not fail closed after its final network gate`);
}

const helper = await readFile(resolve(ROOT, 'tools/offline-network-isolation.mjs'), 'utf8');
for (const required of [
  "['mf_offline', 'massfront_offline']",
  "await page.route('**/*'",
  "await page.routeWebSocket('**/*'",
  "await cdp.send('Network.setBypassServiceWorker', { bypass: true })",
  'navigator.serviceWorker.controller',
  'navigator.serviceWorker.getRegistrations()',
  'async verifyPageState(label',
  'async finalize(label',
  'OFFLINE_NETWORK_FINALIZATION_REQUIRED',
  'await page.close()',
  'guard.assertNoExternalRequests(label'
]) assert.ok(helper.includes(required), `shared offline helper lost contract: ${required}`);
const closeAt = helper.indexOf('await page.close()');
const assertAt = helper.indexOf('guard.assertNoExternalRequests(label', closeAt);
assert.ok(closeAt >= 0 && assertAt > closeAt,
  'shared offline helper must assert network attempts after page shutdown');

console.log(`PASS Stage 8 offline diagnostic source contract (${contracts.length + 1} current browser lanes)`);
