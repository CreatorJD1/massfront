/* THE LEVEL-UP CHOOSER MUST NOT BE ABLE TO STOP THE MATCH BY ITSELF.
 *
 * showLevelUp() is the only code in the game that pauses the simulation with
 * no pause menu behind it: the single control that clears `paused` is a
 * pointerdown on a card the same function creates. It used to set paused=true
 * on its FIRST line, before reading three elements out of the DOM, before
 * drawing from the upgrade pool, and before four faction text hooks - so
 * anything that threw or came back empty in that window left the match stopped
 * with an empty screen. Rendering and audio are on a different path and keep
 * going, which is why the reported symptom was "sound plays, animations play,
 * the sim is dead, and pause does nothing".
 *
 * The ordering IS the fix, so the ordering is what this asserts.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../src/game/commander.js', import.meta.url), 'utf8');
/* Comments blanked to spaces - offsets preserved - before any search for code.
   The comment inside this very function quotes `paused=true` while explaining
   the bug, and two earlier gates in this repo passed on exactly that kind of
   prose after their fix had been deleted. */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, b => ' '.repeat(b.length)).replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

const start = source.indexOf('function showLevelUp(){');
assert.ok(start > 0, 'showLevelUp must exist');
let depth = 0, end = source.indexOf('{', start);
for (let i = end; i < source.length; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}' && --depth === 0) { end = i; break; }
}
const body = source.slice(start, end + 1);

/* 1. THE PAUSE COMES LAST. Every assignment of `paused=true` in this function
      must follow the line that puts the chooser on screen. */
const shown = body.indexOf("el.style.display='flex'");
assert.ok(shown > 0, 'showLevelUp must still display the chooser');
const pauses = [...body.matchAll(/paused\s*=\s*true/g)].map(m => m.index);
assert.ok(pauses.length > 0, 'showLevelUp must still pause the match while the chooser is open');
for (const at of pauses) {
  assert.ok(at > shown,
    'paused=true must come AFTER the chooser is displayed; pausing first means any throw in between '
    + 'leaves the match stopped with no control on screen that can resume it');
}

/* 2. THE DOM IS CHECKED BEFORE IT IS WRITTEN. A missing shell element must
      return, not throw partway through. */
assert.match(body, /if\(!el\|\|!head\|\|!cards\)\s*return/,
  'showLevelUp must bail out when its shell elements are absent instead of throwing mid-build');
const guard = body.search(/if\(!el\|\|!head\|\|!cards\)/);
const firstWrite = body.search(/\.(textContent|innerHTML)\s*=/);
assert.ok(guard > 0 && guard < firstWrite,
  'the element guard must precede the first DOM write');

/* 3. AN EMPTY CHOOSER IS NEVER SHOWN PAUSED. A chooser with no cards has no
      dismiss control, so it must release the clock rather than hold it. */
const emptyBranch = body.indexOf('if(!cards.children.length)');
assert.ok(emptyBranch > 0 && emptyBranch < shown,
  'showLevelUp must check that it produced cards BEFORE displaying and pausing');
const emptyBody = body.slice(emptyBranch, body.indexOf('}', body.indexOf('{', emptyBranch)));
assert.match(emptyBody, /paused\s*=\s*false/,
  'the empty-chooser path must clear paused, because the recursive call from a card tap arrives holding it');
assert.match(emptyBody, /pendingLevels\s*=\s*0/,
  'the empty-chooser path must consume the pending levels, or it is re-entered every award');

/* 4. THE DRAW CANNOT PRODUCE AN UNDEFINED CARD. `pool` is UPGRADES-sized; a
      two-card loop over a one-entry pool used to splice undefined and then
      read .em off it, throwing after the pause was already set. */
assert.match(body, /for\(let k=0;k<2&&pool\.length;k\+\+\)/,
  'the card loop must stop when the pool is exhausted');
assert.match(body, /if\(!pick\)\s*continue/,
  'a drawn index that names no upgrade must be skipped, not dereferenced');

/* 5. THE ONLY DISMISS CONTROL STILL EXISTS. If this ever stops binding, the
      chooser becomes a deadlock no matter how carefully it is ordered. */
assert.match(body, /addEventListener\('pointerdown'/,
  'each card must still carry the handler that applies the upgrade and resumes');
assert.match(body, /paused\s*=\s*false/,
  'choosing a card must resume the match');

console.log('level-up deadlock: PASS (pause follows display, shell guarded, empty chooser releases, draw is bounded)');
