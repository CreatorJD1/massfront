#!/usr/bin/env node
/* Local-only failure simulation for the disposable staging lifecycle.
   No Wrangler command, network request, Worker deploy, or D1 mutation occurs. */
import assert from 'node:assert/strict';
import {
  assertDisposableTargets,
  isMissingDisposableResource,
  runStagingProvision,
  shouldKeepDisposableStack,
  teardownDisposableStack,
} from './staging-provision.mjs';

const WORKER = 'massfront-auth-staging-safetytest';
const DATABASE = 'massfront-staging-safetytest';
const DB_ID = '11111111-2222-4333-8444-555555555555';
const CONFIG = 'wrangler.staging.test.toml';

function silentLog() {
  return { log() {}, error() {} };
}

function fakeProvision({ createOutput = `database_id = "${DB_ID}"`, deployOutput, deployError, e2eError, keep = false }) {
  const calls = [];
  const removed = [];
  const runWrangler = args => {
    calls.push(args.slice());
    if (args[0] === 'd1' && args[1] === 'create') return createOutput;
    if (args[0] === 'deploy') {
      if (deployError) throw deployError;
      return deployOutput;
    }
    return '';
  };
  const exitCode = runStagingProvision({
    confirm: true,
    keep,
    workerName: WORKER,
    databaseName: DATABASE,
    configPath: CONFIG,
    runWrangler,
    runE2e() { if (e2eError) throw e2eError; },
    writeConfig() {},
    fileExists() { return true; },
    removeFile(path) { removed.push(path); },
    log: silentLog(),
  });
  return { calls, exitCode, removed };
}

function cleanupCalls(calls) {
  return calls.filter(args =>
    args[0] === 'delete' || (args[0] === 'd1' && args[1] === 'delete'));
}

/* A created D1 remains cleanable by name even if its UUID cannot be parsed. */
{
  const result = fakeProvision({ createOutput: 'Created database, but output format changed' });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(cleanupCalls(result.calls), [
    ['d1', 'delete', DATABASE, '-y'],
  ]);
  assert.deepEqual(result.removed, [CONFIG]);
}

/* A successful deploy with unparseable output must still delete both names. */
{
  const result = fakeProvision({ deployOutput: 'Uploaded massfront Worker successfully (URL omitted)' });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(cleanupCalls(result.calls), [
    ['delete', WORKER, '--force'],
    ['d1', 'delete', DATABASE, '-y'],
  ]);
  assert.deepEqual(result.removed, [CONFIG]);
}

/* An E2E abort must override --keep and tear down the DEV_ECHO_CODE stack. */
{
  const result = fakeProvision({
    deployOutput: `Published at https://${WORKER}.example.workers.dev`,
    e2eError: new Error('simulated E2E abort'),
    keep: true,
  });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(cleanupCalls(result.calls), [
    ['delete', WORKER, '--force'],
    ['d1', 'delete', DATABASE, '-y'],
  ]);
}

/* An ambiguous deploy command failure is treated as "Worker may exist". */
{
  const result = fakeProvision({ deployError: new Error('simulated client disconnect after upload') });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(cleanupCalls(result.calls), [
    ['delete', WORKER, '--force'],
    ['d1', 'delete', DATABASE, '-y'],
  ]);
}

/* The default successful run still tears down; a successful --keep does not. */
{
  const deployed = `Published at https://${WORKER}.workers.dev`;
  const defaultRun = fakeProvision({ deployOutput: deployed });
  assert.equal(defaultRun.exitCode, 0);
  assert.equal(cleanupCalls(defaultRun.calls).length, 2);

  const keptRun = fakeProvision({ deployOutput: deployed, keep: true });
  assert.equal(keptRun.exitCode, 0);
  assert.deepEqual(cleanupCalls(keptRun.calls), []);
  assert.deepEqual(keptRun.removed, []);
}

/* Cleanup continues to D1 even if Worker deletion itself fails. */
{
  const calls = [];
  const errors = teardownDisposableStack({
    workerName: WORKER,
    databaseName: DATABASE,
    databaseId: DB_ID,
    workerMayExist: true,
    databaseMayExist: true,
    configPath: CONFIG,
    runWrangler(args) {
      calls.push(args.slice());
      if (args[0] === 'delete') throw new Error('simulated Worker delete failure');
    },
    fileExists() { return true; },
    removeFile() { throw new Error('config must be preserved on teardown failure'); },
    log: silentLog(),
  });
  assert.equal(errors.length, 1);
  assert.deepEqual(cleanupCalls(calls), [
    ['delete', WORKER, '--force'],
    ['d1', 'delete', DATABASE, '-y'],
  ]);
}

/* Explicit already-absent responses are idempotent cleanup, not blockers. */
{
  const removed = [];
  const errors = teardownDisposableStack({
    workerName: WORKER,
    databaseName: DATABASE,
    databaseId: DB_ID,
    workerMayExist: true,
    databaseMayExist: true,
    configPath: CONFIG,
    runWrangler(args) {
      if (args[0] === 'delete') throw new Error('Worker script does not exist');
      throw new Error('d1 database lookup database not found');
    },
    fileExists() { return true; },
    removeFile(path) { removed.push(path); },
    log: silentLog(),
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(removed, [CONFIG]);
  assert.equal(isMissingDisposableResource(new Error('Authentication error [code: 10000]')), false);
}

/* Keep is legal only after create, deploy, URL discovery, and E2E success. */
assert.equal(shouldKeepDisposableStack({
  keepRequested: true,
  failed: null,
  databaseCreated: true,
  deploySucceeded: true,
  deployedUrl: `https://${WORKER}.workers.dev`,
}), true);
assert.equal(shouldKeepDisposableStack({
  keepRequested: true,
  failed: new Error('E2E failed'),
  databaseCreated: true,
  deploySucceeded: true,
  deployedUrl: `https://${WORKER}.workers.dev`,
}), false);
assert.equal(shouldKeepDisposableStack({
  keepRequested: true,
  failed: null,
  databaseCreated: true,
  deploySucceeded: true,
  deployedUrl: null,
}), false);

/* Production and arbitrary identifiers remain hard-refused. */
assert.throws(() => assertDisposableTargets('massfront-auth', DATABASE), /refusing cleanup/);
assert.throws(() => assertDisposableTargets(WORKER, 'massfront-accounts'), /refusing cleanup/);
assert.throws(() => assertDisposableTargets(
  WORKER,
  DATABASE,
  'e3c74e0d-59b8-427e-92b8-ea8a3bbd6573',
), /PRODUCTION database id/);

console.log('staging provision safety: PASS (D1/URL parsing, E2E abort, ambiguous deploy, keep policy, teardown failure, production guards)');
