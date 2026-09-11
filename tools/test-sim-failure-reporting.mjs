/* A FROZEN MATCH MUST SAY SO.
 *
 * frame() schedules its next frame on its first line and then runs the whole
 * simulation step unguarded, so one exception mid-step produces the worst shape
 * a failure can take: requestAnimationFrame keeps firing, the canvas holds its
 * last good frame, HUD animations and audio keep playing so the game looks
 * alive, pause does nothing because `paused` is only read inside the body that
 * is throwing, and the same error is discarded sixty times a second with nobody
 * listening. That was reported from a real match as "it froze at 22:02, sound
 * and animations play, nothing reacts, pause does not work" - and there was no
 * log to read afterwards.
 *
 * This asserts the source contract rather than driving an eight-minute match to
 * a crash that may not reproduce: the sim step is wrapped, the handler halts
 * instead of continuing, it reports exactly once, and it publishes the cause
 * where a probe or a bug report can read it back.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

/* 1. The sim step is guarded at all. */
const simOpen = source.indexOf("if(running&&!paused&&!gameEnded){");
assert.ok(simOpen > 0, 'the simulation step must still exist');
const simClose = source.indexOf("mfReportSimFailure(error,'sim')", simOpen);
assert.ok(simClose > simOpen, 'the simulation step must be wrapped so one bad tick cannot kill the loop silently');
const guarded = source.slice(simOpen, simClose);
assert.ok(/\btry\{/.test(guarded), 'the guard must be a real try block around the step');
for (const call of ['unitTick(simDt)', 'projTick(simDt)', 'bldTick(simDt)', 'econTick(simDt)']) {
  assert.ok(guarded.includes(call), `${call} must sit inside the guarded step, not outside it`);
}

/* 2. The reporter is module scope, not per-frame. A latch re-initialised every
      frame reports every frame, which is the log spam this replaces. */
const latch = source.indexOf('let mfSimFailure=null;');
const frameStart = source.indexOf('function frame(ts){');
assert.ok(latch > 0 && frameStart > 0, 'reporter and frame must both exist');
assert.ok(latch < frameStart, 'mfSimFailure must live at module scope; inside frame() it resets every frame');

const reporter = source.slice(source.indexOf('function mfReportSimFailure'), frameStart);
assert.ok(reporter.length > 100, 'reporter body must be found ahead of frame()');

/* 3. Report once. */
assert.match(reporter, /if\(mfSimFailure\)\s*return;/,
  'the reporter must return early once it has already reported, or it spams every frame');

/* 4. Halt, do not swallow. Continuing a deterministic simulation past an
      exception turns a crash into a desync. */
assert.match(reporter, /paused\s*=\s*true/,
  'a failed simulation must halt rather than keep re-entering the throwing step');

/* 5. Name the cause in all three places a human or a probe might look. */
assert.match(reporter, /console\.error/, 'the failure must reach the console');
assert.match(reporter, /window\.mfSimFailure\s*=/, 'the failure must be readable by a probe or bug report');
assert.match(reporter, /toast\(/, 'the player must be told the match stopped, not left staring at a live-looking freeze');
assert.match(reporter, /tick:/, 'the report must carry the tick so the failure can be located');

/* 6. And it must not be wrapped so broadly that rendering and input die with
      the simulation - the guard exists to keep the rest of the frame alive. */
const afterGuard = source.slice(simClose, simClose + 2000);
assert.ok(/render\(presentDt\)/.test(afterGuard),
  'rendering must remain outside the guarded step so a halted match still draws and responds');

console.log('sim failure reporting: PASS (guarded step, module-scope latch, halt-once, reported three ways)');
