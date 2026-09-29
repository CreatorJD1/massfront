/* UGA COMMAND OPENS ON THE SHIP IN SPACE.
 *
 * The main menu now has one MASSFRONT entry, into the stable UGA home. Its
 * visible Depart button opens the orbital scene. Saved orbital locations still
 * restore there without letting a ship-interior UI mode override the route.
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

/* 1. ONE MENU DOOR, THEN THE IN-MODULE DEPART CONTROL. */
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /id="ugaBtn"/, 'a second Explore Space tile must not compete with Enter MASSFRONT');
const entry = handlerFor('startBtn');
const entryCall = /mfOpenExploration\(\s*'([a-z_]+)'/.exec(entry);
assert.ok(entryCall, 'the main action no longer opens the exploration module');
assert.equal(entryCall[1], 'campaign_hub', 'the single door must enter the stable UGA home');
const commandUi = blank(await readFile(new URL('../modules/space_exploration/src/ui/uga_command.js', import.meta.url), 'utf8'));
assert.match(commandUi, /uga-campaign-depart[^\n]*data-action="exit"/, 'UGA home must expose orbital Depart');
assert.match(commandUi, /button\.dataset\.action === 'exit'\) return void call\('onExit'\)/,
  'the Depart control must invoke the real onExit callback');

/* 2. The orbital view remains a valid ticket for first-career entry. */
const operations = blank(await readFile(new URL('../src/galactic-operations.js', import.meta.url), 'utf8'));
assert.match(operations, /ticket\.entryView!=='system'&&ticket\.entryView!=='campaign_hub'/,
  'the entry-ticket validator no longer accepts the system view');
const host = blank(await readFile(
  new URL('../modules/space_exploration/src/host/massfront_solo_host.js', import.meta.url), 'utf8'));
assert.match(host, /ALLOWED_ENTRY_VIEWS = new Set\(\[[^\]]*'system'/,
  'the solo host no longer allows the system entry view');
assert.match(experience, /onExit: \(\) => openSystem\(\)/,
  'the Depart callback must open the orbital scene');

/* 3. ARRIVING IN SPACE IS NOT UNDONE BY THE SAVE. restoreSavedLocation honours
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

console.log('UGA orbital access: PASS (one menu entry, UGA Depart opens space, saved galaxy/survey still restore)');
