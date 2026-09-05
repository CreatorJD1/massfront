import assert from 'node:assert/strict';
import {
  boundedPwBrowserCloseAttempt,
  retryPwProfileRemovalOperation
} from './pw-browser.mjs';

const ok = await boundedPwBrowserCloseAttempt(async () => {}, 20);
assert.deepEqual(ok, { completed: true, timedOut: false, rejected: false, error: null });

const rejected = await boundedPwBrowserCloseAttempt(async () => { throw new Error('CDP disconnected'); }, 20);
assert.equal(rejected.completed, true);
assert.equal(rejected.rejected, true);
assert.match(rejected.error, /CDP disconnected/);

let lateReject;
let unhandled = null;
const onUnhandled = error => { unhandled = error; };
process.once('unhandledRejection', onUnhandled);
const timedOut = await boundedPwBrowserCloseAttempt(() => new Promise((resolve, reject) => { lateReject = reject; }), 5);
assert.equal(timedOut.completed, false);
assert.equal(timedOut.timedOut, true);
lateReject(new Error('late CDP failure'));
await new Promise(resolveWait => setTimeout(resolveWait, 10));
process.removeListener('unhandledRejection', onUnhandled);
assert.equal(unhandled, null, 'late close rejection must already have a handler');

let transientExists = true, transientRemoves = 0, transientAuthorizations = 0, transientWaits = 0;
const transient = await retryPwProfileRemovalOperation({
  authorize: async () => { transientAuthorizations++; return true; },
  remove: async () => {
    transientRemoves++;
    if (transientRemoves < 3) throw Object.assign(new Error('Crashpad busy'), { code: 'EBUSY' });
    transientExists = false;
  },
  exists: async () => transientExists,
  wait: async () => { transientWaits++; }
}, { attempts: 4, retryDelayMs: 1 });
assert.equal(transient.removed, true);
assert.equal(transient.attempts, 3);
assert.equal(transient.errors.length, 2);
assert.equal(transientAuthorizations, 3);
assert.equal(transientWaits, 2);

let failedRemoves = 0;
const exhausted = await retryPwProfileRemovalOperation({
  authorize: async () => true,
  remove: async () => { failedRemoves++; throw Object.assign(new Error('profile locked'), { code: 'EPERM' }); },
  exists: async () => true,
  wait: async () => {}
}, { attempts: 3, retryDelayMs: 0 });
assert.equal(exhausted.removed, false);
assert.equal(exhausted.authorized, true);
assert.equal(exhausted.attempts, 3);
assert.equal(exhausted.errors.length, 3);
assert.equal(failedRemoves, 3);

let revokeChecks = 0, revokeRemoves = 0;
const revoked = await retryPwProfileRemovalOperation({
  authorize: async () => ++revokeChecks === 1,
  remove: async () => { revokeRemoves++; throw Object.assign(new Error('busy then replaced'), { code: 'EBUSY' }); },
  exists: async () => true,
  wait: async () => {}
}, { attempts: 3, retryDelayMs: 0 });
assert.equal(revoked.authorized, false);
assert.equal(revoked.removed, false);
assert.equal(revokeRemoves, 1, 'containment authorization must be rechecked before every retry');

console.log('pw-browser cleanup bounds: close success/rejection/timeout and profile transient/exhausted/revoked paths PASS');
