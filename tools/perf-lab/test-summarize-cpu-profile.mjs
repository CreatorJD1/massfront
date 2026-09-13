#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeCpuProfiles } from './summarize-cpu-profile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = join(ROOT, 'tools/perf-lab/summarize-cpu-profile.mjs');
const fixture = {
  startTime: 100000,
  endTime: 115000,
  nodes: [
    { id: 1, callFrame: { functionName: '(root)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 }, children: [2, 6, 7, 8] },
    { id: 2, callFrame: { functionName: '(program)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 }, children: [3] },
    { id: 3, callFrame: { functionName: 'updateArmy', scriptId: '12', url: 'http://127.0.0.1/src/game/sim.js', lineNumber: 99, columnNumber: 2 }, children: [4, 5] },
    { id: 4, callFrame: { functionName: 'updateArmy', scriptId: '12', url: 'http://127.0.0.1/src/game/sim.js', lineNumber: 99, columnNumber: 2 } },
    { id: 5, callFrame: { functionName: 'steerUnit', scriptId: '12', url: 'http://127.0.0.1/src/game/sim.js', lineNumber: 140, columnNumber: 4 } },
    { id: 6, callFrame: { functionName: '(garbage collector)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 } },
    { id: 7, callFrame: { functionName: '(idle)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 } },
    { id: 8, callFrame: { functionName: 'V8.RunMicrotasks', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 } }
  ],
  samples: [5, 4, 6, 7, 8],
  timeDeltas: [1000, 2000, 3000, 4000, 5000]
};

const summary = summarizeCpuProfiles([{ profile: fixture, path: 'fixture.cpuprofile' }], { top: 20 });
assert.equal(summary.totals.sampleCount, 5);
assert.equal(summary.totals.sampledMs, 15);
assert.equal(summary.totals.profileWindowMs, 15);
assert.equal(summary.totals.unattributedSelfMs, 0);

const byName = new Map(summary.topFunctionsBySelf.map(row => [row.functionName, row]));
assert.equal(byName.get('steerUnit').selfMs, 1);
assert.equal(byName.get('steerUnit').inclusiveMs, 1);
assert.equal(byName.get('updateArmy').selfMs, 2);
assert.equal(byName.get('updateArmy').inclusiveMs, 3,
  'recursive updateArmy nodes must receive one inclusive delta per sample, not one per recursive frame');
assert.equal(byName.get('updateArmy').nodeCount, 2);
assert.equal(byName.get('(garbage collector)').selfMs, 3);
assert.equal(byName.get('(idle)').selfMs, 4);
assert.equal(byName.get('V8.RunMicrotasks').selfMs, 5);

const category = new Map(summary.categories.map(row => [row.category, row]));
assert.equal(category.get('application').selfMs, 3);
assert.equal(category.get('application').inclusiveMs, 3);
assert.equal(category.get('gc').selfMs, 3);
assert.equal(category.get('idle').selfMs, 4);
assert.equal(category.get('program').selfMs, 0);
assert.equal(category.get('program').inclusiveMs, 3);
assert.equal(category.get('runtime').selfMs, 5);
assert.equal(category.get('runtime').inclusiveMs, 15);

assert.throws(() => summarizeCpuProfiles([{
  ...fixture,
  samples: [5],
  timeDeltas: []
}]), /samples\/timeDeltas length mismatch/);
assert.throws(() => summarizeCpuProfiles([{
  ...fixture,
  samples: [999],
  timeDeltas: [1000]
}]), /references missing node 999/);
assert.throws(() => summarizeCpuProfiles([], { top: 10 }), /At least one CPU profile/);
assert.throws(() => summarizeCpuProfiles([fixture], { top: 1000 }), /top must be an integer/);

const tempRoot = join(ROOT, 'tmp/perf-lab/cpu-profile-summary-self-test');
try {
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  const first = join(tempRoot, 'first.cpuprofile'), second = join(tempRoot, 'second.cpuprofile');
  await writeFile(first, JSON.stringify(fixture));
  await writeFile(second, JSON.stringify(fixture));
  const cli = spawnSync(process.execPath, [TOOL, '--top', '5', first, second], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true
  });
  assert.equal(cli.status, 0, cli.stderr);
  const combined = JSON.parse(cli.stdout);
  assert.equal(combined.totals.profileCount, 2);
  assert.equal(combined.totals.sampleCount, 10);
  assert.equal(combined.totals.sampledMs, 30);
  assert.equal(combined.topFunctionsBySelf.length, 5);
  assert.ok(combined.profiles.every(row => row.path.startsWith('tmp/perf-lab/cpu-profile-summary-self-test/')));

  const invalidPath = join(tempRoot, 'invalid.cpuprofile');
  await writeFile(invalidPath, JSON.stringify({ ...fixture, samples: [12345], timeDeltas: [1000] }));
  const invalid = spawnSync(process.execPath, [TOOL, invalidPath], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /references missing node 12345/);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log('CPU profile summarizer contract: PASS');
