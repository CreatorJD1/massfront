/* UGA COMMAND OPENS ON THE SHIP IN SPACE.
 *
 * The main menu has two doors into the strategic layer and they used to lead
 * to the same place: DEPLOY MASSFRONT and UGA COMMAND both entered at
 * 'campaign_hub', the War Table panel. So the button named after the ship
 * never showed the ship, and the orbital scene — the thing the whole
 * exploration module is built around — was reachable only by leaving the panel
 * that opened on top of it.
 *
 * 'system' is the existing, validated entry view for this; the career gate's
 * own 'full-uga-space' continuation already uses it.
 *
 * Two halves have to hold together or the change does nothing:
 *   1. the door asks for the space view, and
 *   2. arriving there is not overridden by a saved ship-interior scene.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const blank = source => source
  .replace(/\/\*[\s\S]*?\*\//g, block => ' '.repeat(block.length))
  .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) => lead + ' '.repeat(match.length - lead.length));

/* Comments blanked first, offsets preserved. The comment on the handler under
   test names both 'system' and 'campaign_hub' while explaining the change, and
   gates in this repo have twice passed on exactly that kind of prose. */
const main = blank(await readFile(new URL('../src/main.js', import.meta.url), 'utf8'));
const experience = blank(await readFile(
  new URL('../modules/space_exploration/src/space_experience.js', import.meta.url), 'utf8'));

function handlerFor(id) {
  const at = main.indexOf(`mfBindTap($('${id}')`);
  assert.ok(at > 0, `${id} is no longer bound as a tap target`);
  let depth = 0, i = main.indexOf('{', at), start = i;
  for (; i < main.length; i++) {
    if (main[i] === '{') depth++;
    else if (main[i] === '}' && --depth === 0) break;
  }
  return main.slice(start, i + 1);
}

/* 1. THE UGA COMMAND DOOR ASKS FOR SPACE. */
const uga = handlerFor('ugaBtn');
const ugaCall = /mfOpenExploration\(\s*'([a-z_]+)'/.exec(uga);
assert.ok(ugaCall, 'the UGA COMMAND button no longer opens the exploration module');
assert.equal(ugaCall[1], 'system',
  `UGA COMMAND enters at '${ugaCall[1]}' — it must open on the ship in space, not on the War Table, `
  + 'which is what DEPLOY MASSFRONT is for');

/* 2. AND DEPLOY MASSFRONT STILL OPENS THE WAR TABLE. Pointing both doors at
      the same view is the thing being fixed; pointing them both at the OTHER
      view would be the same bug wearing different clothes. */
const deploy = handlerFor('startBtn');
const deployCall = /mfOpenExploration\(\s*'([a-z_]+)'/.exec(deploy);
assert.ok(deployCall, 'DEPLOY MASSFRONT no longer opens the exploration module');
assert.equal(deployCall[1], 'campaign_hub',
  `DEPLOY MASSFRONT enters at '${deployCall[1]}' — it is the War Table door`);
assert.notEqual(ugaCall[1], deployCall[1], 'both menu doors lead to the same view again');

/* 3. 'system' IS A VALID TICKET VIEW. The ticket schema is versioned and
      strictly validated; a door asking for a view the validator rejects would
      fail at the crossing, not here. */
const operations = blank(await readFile(new URL('../src/galactic-operations.js', import.meta.url), 'utf8'));
assert.match(operations, /ticket\.entryView!=='system'&&ticket\.entryView!=='campaign_hub'/,
  'the entry-ticket validator no longer accepts the system view');
const host = blank(await readFile(
  new URL('../modules/space_exploration/src/host/massfront_solo_host.js', import.meta.url), 'utf8'));
assert.match(host, /ALLOWED_ENTRY_VIEWS = new Set\(\[[^\]]*'system'/,
  'the solo host no longer allows the system entry view');

/* 4. ARRIVING IN SPACE IS NOT UNDONE BY THE SAVE. restoreSavedLocation honours
      a saved survey or galaxy position — those are places the player navigated
      to. A saved 'uga' scene is not a place, it is a UI mode, and restoring it
      would land the player back inside the ship through a door that asked for
      space. */
const at = experience.indexOf('async function restoreSavedLocation()');
assert.ok(at > 0, 'restoreSavedLocation is missing');
const restore = experience.slice(at, experience.indexOf('\n  function ', at + 10));
const ugaBranch = restore.indexOf("savedRoute.scene === 'uga'");
assert.ok(ugaBranch > 0, 'the saved ship-interior branch is gone');
const branchBody = restore.slice(ugaBranch, restore.indexOf('}', ugaBranch));
assert.match(branchBody, /setScene\('system'/,
  'a saved ship-interior scene still reopens the interior, overriding a door that asked for space');
assert.doesNotMatch(branchBody, /openUga\(/,
  'the saved ship-interior branch reopens the UGA scene again');
/* The positions that ARE places must still come back. */
for (const scene of ['galaxy', 'survey']) {
  assert.ok(restore.includes(`savedRoute.scene === '${scene}'`),
    `restoreSavedLocation no longer returns the player to a saved ${scene} position`);
}

console.log("UGA Command opens in space: PASS (door asks for 'system', War Table door unchanged, "
  + 'ticket view valid, saved interior does not override, saved galaxy/survey still restore)');
