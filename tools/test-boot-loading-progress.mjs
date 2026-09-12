/* THE BOOT SCREEN MUST TELL THE TRUTH ABOUT WHAT IT IS DOING.
 *
 * #mfBootCover is the first thing a player sees and it holds for a long time,
 * so every number and phrase on it has to be honest: a count that cannot
 * exceed its total, a phase that names the work actually in flight, and a bar
 * whose ARIA values match the bar itself.
 *
 * This gate used to describe a richer display — a separate count element, a
 * "Packaged game" source label and a live elapsed timer — none of which exist
 * any more, in the markup or the script. That is a deliberate simplification
 * (verified: no orphaned ids in index.html), but the gate kept asserting the
 * old one. Worse, its slice began at `var bootStartedAt=`, which is gone, so
 * String.slice(-1) handed it a single character and the very first assertion
 * failed — it had stopped reading boot.js at all.
 *
 * So: same intent, measured against the display that ships.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../boot.js', import.meta.url), 'utf8');
const from = source.indexOf('  function bootText(');
const to = source.indexOf('  function rendererGateIndex');
assert.ok(from >= 0 && to > from, 'could not locate the boot progress block in boot.js');
const display = source.slice(from, to);
assert.ok(display.includes('function bootProgress('), 'boot.js no longer reports loading progress');

/* Ids the cover actually carries. A writer for an id that is not in the shell
   paints nothing; an id in the shell with no writer is a permanently blank
   field. Both are failures, so check the pairing rather than trusting either. */
const shell = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const written = [...display.matchAll(/bootText\('([^']+)'/g)].map(m => m[1])
  .concat([...display.matchAll(/getElementById\('(mfBoot[^']+)'\)/g)].map(m => m[1]));
for (const id of new Set(written)) {
  assert.ok(shell.includes('id="' + id + '"'),
    `boot.js writes #${id}, which the boot cover does not contain — that update paints nothing`);
}
/* The reverse direction only applies to VALUE fields. A layout container is
   legitimately never written — it holds the fields — so an element whose
   opening tag is immediately followed by more markup is skipped, and one that
   opens straight onto its own text content is treated as a field. */
const writes = new Set(written);
for (const m of shell.matchAll(/id="(mfBoot[A-Za-z]+)"[^>]*>([^<]*)</g)) {
  const [, id, inner] = m;
  if (id === 'mfBootCover' || id === 'mfBootWordmark') continue;
  if (!inner.trim() && !writes.has(id)) continue;   // container, or a field with a writer
  if (writes.has(id)) continue;
  assert.fail(`the boot cover contains #${id} with placeholder text and nothing writes it — `
    + 'it would show that placeholder for the whole load');
}

const nodes = new Map();
const make = id => ({ id, textContent: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
for (const id of ['mfBootCover', 'mfBootPct', 'mfBootPhase', 'mfBootDetail', 'mfBootBar', 'mfBootFill']) nodes.set(id, make(id));
const context = vm.createContext({ document: { getElementById: id => nodes.get(id) || null } });
vm.runInContext(display, context);
const run = code => vm.runInContext(code, context);
const text = id => nodes.get(id).textContent;

/* 1. PHASE NAMES THE WORK. Each branch is reachable and says something a
      player can act on, rather than a generic spinner caption. */
run("bootProgress(8,112,'src/engine/gl.js')");
assert.match(text('mfBootPhase'), /GRAPHICS/i, 'the graphics stage is not named while gl.js loads');
assert.equal(text('mfBootPct'), '8 / 112', 'the script count is not reported honestly');
assert.equal(nodes.get('mfBootBar').attrs['aria-valuenow'], '8', 'the bar exposes a different value than it shows');
assert.equal(nodes.get('mfBootBar').attrs['aria-valuemax'], '112', 'the bar does not expose its real total');
assert.ok(text('mfBootDetail').length > 12, 'the graphics stage has no plain-language detail line');

run("bootProgress(112,112,'src/main.js','verify')");
assert.match(text('mfBootPhase'), /VERIF/i, 'the verify stage is not distinguished from ordinary loading');

run("bootProgress(40,112,'src/audio.js')");
assert.match(text('mfBootPhase'), /CONTENT|SYSTEMS/i, 'the content stage is not named');
const contentDetail = text('mfBootDetail');
run("bootProgress(60,112,'src/ui/hud.js')");
assert.notEqual(text('mfBootDetail'), contentDetail,
  'every stage shows the same detail line, which makes the line decoration rather than information');

/* 2. FINISHED MEANS FINISHED, and only when not verifying. */
run("bootProgress(112,112,'src/main.js')");
assert.match(text('mfBootPhase'), /STARTING/i, 'a completed load does not say the game is starting');
assert.equal(nodes.get('mfBootFill').style.width, '100%', 'a completed load does not fill the bar');

/* 3. THE NUMBERS CANNOT LIE. A count past the total, or a negative one, is
      how a progress bar loses the player's trust for the rest of the load. */
run("bootProgress(500,112,'src/main.js')");
assert.equal(text('mfBootPct'), '112 / 112', 'an over-count is not clamped to the total');
assert.equal(nodes.get('mfBootFill').style.width, '100%', 'an over-count overfills the bar');
run("bootProgress(-9,112,'src/main.js')");
assert.equal(text('mfBootPct'), '0 / 112', 'a negative count is not clamped to zero');
assert.equal(nodes.get('mfBootFill').style.width, '0%', 'a negative count produces a negative bar');
run("bootProgress(0,0,'src/main.js')");
assert.equal(text('mfBootPct'), 'STARTING', 'a zero total divides into the bar instead of reading as STARTING');
assert.equal(nodes.get('mfBootFill').style.width, '0%', 'a zero total produces NaN width');

/* 4. THE COVER STAYS HONEST TO ASSISTIVE TECHNOLOGY while it is up. */
assert.equal(nodes.get('mfBootCover').attrs['aria-busy'], 'true', 'the cover stops declaring itself busy mid-load');
assert.equal(nodes.get('mfBootCover').attrs['data-progress'], 'determinate',
  'the cover does not switch from indeterminate once real progress is known');

/* 5. OPTIONAL NODES. An OTA can install a new boot.js against an older shell,
      so every element read here must be allowed to be missing. */
nodes.clear();
assert.doesNotThrow(() => run("bootProgress(1,2,'src/main.js')"),
  'boot progress throws on a shell that lacks its elements — that kills the loader before the game can start');
assert.doesNotThrow(() => run('bootProgress()'),
  'boot progress throws when called with no arguments');

console.log('Boot loading progress: PASS (stages named, counts clamped, bar and ARIA agree, ids paired both ways, optional nodes)');
