/* Deterministic overhead probe for the classic-global perf telemetry API.
   Wall-clock measurements are informational; sort/copy counts are the stable
   acceptance signal. */

import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PERF_PATH = join(ROOT, 'src/engine/perf.js');
const OUT_DIR = join(ROOT, '.tmp/perf-lab');
const CALLS = 240;

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function git(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function sourceIdentity(source) {
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  const status = await git(['status', '--porcelain=v1', '--untracked-files=all']);
  return { head, dirty: !!status.trim(), statusSha256: sha256(status), perfSha256: sha256(source) };
}

function loadRuntime(source) {
  let clock = 0;
  const window = {};
  const location = { search: '' };
  const performance = { now: () => clock };
  new Function('window', 'location', 'performance', source)(window, location, performance);
  if (!window.mfPerfEnable(true)) throw new Error('mfPerfEnable refused the probe');
  for (let index = 0; index < 180; index++) {
    window.mfPerfBegin('sim'); clock += 1 + (index % 3) * 0.125; window.mfPerfEnd('sim');
    window.mfPerfBegin('render'); clock += 2 + (index % 5) * 0.125; window.mfPerfEnd('render');
  }
  return window;
}

function measure(label, call) {
  const originalSort = Array.prototype.sort;
  let sortCalls = 0, sortedElements = 0;
  Array.prototype.sort = function(...args) {
    sortCalls++;
    sortedElements += this.length;
    return originalSort.apply(this, args);
  };
  const started = process.hrtime.bigint();
  let last;
  try {
    for (let index = 0; index < CALLS; index++) last = call();
  } finally {
    Array.prototype.sort = originalSort;
  }
  const elapsedNs = Number(process.hrtime.bigint() - started);
  return { label, calls: CALLS, sortCalls, sortedElements, elapsedNs, nsPerCall: Math.round(elapsedNs / CALLS), last };
}

const args = process.argv.slice(2);
const expect = args[args.indexOf('--expect') + 1] || 'optimized';
if (!['baseline', 'optimized'].includes(expect)) throw new Error('--expect must be baseline or optimized');
const sourceBefore = await readFile(PERF_PATH, 'utf8');
const identityBefore = await sourceIdentity(sourceBefore);
const runtime = loadRuntime(sourceBefore);
const snapshot = measure('mfPerfSnapshot', () => runtime.mfPerfSnapshot());
const latest = typeof runtime.mfPerfLatest === 'function'
  ? measure('mfPerfLatest', () => runtime.mfPerfLatest())
  : null;
const sourceAfter = await readFile(PERF_PATH, 'utf8');
const identityAfter = await sourceIdentity(sourceAfter);

const failures = [];
if (snapshot.sortCalls !== CALLS * 2 || snapshot.sortedElements !== CALLS * 2 * 180) {
  failures.push(`snapshot semantics changed: ${snapshot.sortCalls} sorts/${snapshot.sortedElements} elements`);
}
if (snapshot.last?.cpu?.sim?.n !== 180 || snapshot.last?.cpu?.render?.n !== 180) {
  failures.push('snapshot no longer preserves the 180-sample ring semantics');
}
if (expect === 'baseline' && latest) failures.push('baseline unexpectedly exposes mfPerfLatest');
if (expect === 'optimized') {
  if (!latest) failures.push('optimized source does not expose mfPerfLatest');
  else {
    if (latest.sortCalls !== 0 || latest.sortedElements !== 0) failures.push('mfPerfLatest sorted or copied a ring');
    if (!(latest.last?.cpu?.sim > 0) || !(latest.last?.cpu?.render > 0)) failures.push('mfPerfLatest omitted latest CPU values');
  }
}
if (identityBefore.perfSha256 !== identityAfter.perfSha256 || identityBefore.statusSha256 !== identityAfter.statusSha256) {
  failures.push('source/worktree drifted during probe');
}

const report = {
  schema: 'massfront-perf-api-probe-v1',
  capturedAt: new Date().toISOString(),
  expect,
  pass: failures.length === 0,
  failures,
  provenance: { ...identityBefore, sourceStableDuringRun: failures.every(item => !item.includes('drifted')) },
  snapshot,
  latest
};
await mkdir(OUT_DIR, { recursive: true });
const output = join(OUT_DIR, `perf-api-${expect}.json`);
await writeFile(output, JSON.stringify(report, null, 2), 'utf8');
console.log(`${report.pass ? 'PASS' : 'FAIL'} perf API ${expect}: snapshot=${snapshot.sortCalls} sorts/${snapshot.sortedElements} elements; ` +
  `latest=${latest ? `${latest.sortCalls} sorts/${latest.sortedElements} elements` : 'unavailable'}`);
console.log(output);
if (!report.pass) process.exitCode = 1;
