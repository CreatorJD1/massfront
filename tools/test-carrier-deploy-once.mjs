/* LANDING HAPPENS ONCE.
 *
 * Reported from a resumed session: the dropship deployed twice. Resuming arms
 * the carrier through newSkirmish() and then polls every 250ms to land it
 * automatically - a player nine minutes into a fight should not be asked to
 * pick a drop site again. But the DEPLOY button is still on screen until
 * deployCarrier() hides it, and its handler calls straight in with no check.
 *
 * Two callers, and the only thing between them was the poll's own
 * `if(matchLive) return`. matchLive is not assigned until partway through the
 * landing - after the HQ, the commander and the constructor are spawned - so a
 * tap inside that window ran the whole sequence again: two drops, two HQs, two
 * starting armies.
 *
 * The guard has to sit inside deployCarrier(), not on a caller, or the next
 * entry point added reintroduces the bug. That is what this asserts.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
/* Comments are blanked - to spaces, so every offset still lines up - before any
   search for code. The comment ABOVE this guard quotes `if(matchLive) return`
   while explaining the bug, and on the first run that quotation satisfied the
   assertion after the real guard had been deleted: the test passed on its own
   documentation. Strip first, then look for code. */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, block => ' '.repeat(block.length));

const start = source.indexOf('function deployCarrier(){');
assert.ok(start > 0, 'deployCarrier must exist');
const body = source.slice(start, source.indexOf('\nfunction ', start + 10));

/* 1. The guard exists, and it is the FIRST thing the function does - before
      carrierCanDeploy(), before the landing zone is cleared, before addBld. */
const guard = body.indexOf('matchLive) return');
assert.ok(guard > 0, 'deployCarrier must refuse to run a second landing');

const canDeploy = body.indexOf('carrierCanDeploy()');
assert.ok(guard < canDeploy,
  'the already-landed guard must precede carrierCanDeploy(); that check asks whether the GROUND is landable, not whether you already landed');

const addHq = body.indexOf("addBld('hq'");
assert.ok(addHq > 0 && guard < addHq, 'the guard must precede the HQ spawn');

const setsLive = body.indexOf('matchLive=true');
assert.ok(setsLive > 0 && guard < setsLive,
  'the guard must precede the matchLive assignment it tests, or the window between them is the bug');

/* 2. The guard is silent. A duplicate call is not a player error, and a toast
      on every resume would be noise reporting a bug that no longer happens. */
const guardLine = body.slice(body.lastIndexOf('\n', guard) + 1, body.indexOf('\n', guard));
assert.doesNotMatch(guardLine, /toast|sfx/, 'a suppressed duplicate landing must not toast or play a sound');

/* 3. Both known callers still exist, so the guard is actually load-bearing
      rather than protecting a path nothing uses. */
/* The handler body contains its own parentheses (ev.stopPropagation()), so the
   span between the bind and the call cannot be matched with [^)]*. */
assert.match(source, /mfBindNativePress\(\$\('deployBtn'\)[\s\S]{0,160}?deployCarrier\(\)/,
  'the DEPLOY button must still call deployCarrier');

const session = await readFile(new URL('../src/session.js', import.meta.url), 'utf8');
assert.match(session, /if\(carrierCanDeploy\(\)\)\{ deployCarrier\(\); return; \}/,
  'the resume path must still auto-land, or resuming sends the player back to the drop screen');

console.log('carrier deploy once: PASS (guard precedes ground check, HQ spawn and matchLive; both callers intact)');
