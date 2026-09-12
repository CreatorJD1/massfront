/* THE ECONOMY WARNINGS HAVE TO REACH THE BATTLEFIELD.
 *
 * STORAGE FULL, LOW MASS and LOW ENERGY are the game's only explanation of the
 * most punishing state it can put a player in. hudflow's showCoach wrapper
 * submitted them at MF_N_INFO - and mfNoticeLiveAllowed() rejects everything at
 * MF_N_INFO or below outright, because info, chatter and loot are not allowed
 * to occupy the battlefield. So the three messages never appeared anywhere on
 * screen. They went straight into the event feed, which the player has to open,
 * while two of them still played a notify sound: the build pinged the player
 * about a problem and then showed them nothing.
 *
 * Measured in a real match: a bare HQ earns 5.6 mass/s and 28 energy/s against
 * caps of 1200 and 6000, so both banks are full about three minutes in and the
 * whole income is discarded from then on, silently.
 *
 * Asserting the literal priority would be worthless - the bug WAS a literal
 * that looked reasonable. This runs the real gate function against the real
 * submitted priority and requires the answer to be yes.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../src/ui/hudflow.js', import.meta.url), 'utf8');
/* Comments blanked to spaces, offsets preserved, before anything is read as
   code. The comment on this very wrapper names both MF_N_INFO and
   MF_N_ORDER while explaining the bug. */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, b => ' '.repeat(b.length));

/* The priority showCoach actually submits, taken from the call itself. */
const wrapper = source.slice(source.indexOf('showCoach=function(msg){'));
const body = wrapper.slice(0, wrapper.indexOf('\n};'));
const submit = /mfNoticeSubmit\(\s*([A-Z_0-9]+)\s*,/.exec(body);
assert.ok(submit, 'the showCoach wrapper must still route through the notice director');
const coachPriorityName = submit[1];

/* The real constants and the real gate, lifted from source. */
const consts = /const MF_N_CRIT=(\d+), MF_N_ORDER=(\d+), MF_N_INFO=(\d+), MF_N_CHAT=(\d+);/.exec(source);
assert.ok(consts, 'the notice priority ladder must still be declared in one place');
const [MF_N_CRIT, MF_N_ORDER, MF_N_INFO, MF_N_CHAT] = consts.slice(1, 5).map(Number);
const window = /const MF_N_MAXQ=\d+, MF_N_LIVE_WINDOW=(\d+), MF_N_LIVE_MAX=(\d+);/.exec(source);
assert.ok(window, 'the live-rail budget must still be declared');

const gateStart = source.indexOf('function mfNoticeLiveAllowed(');
assert.ok(gateStart > 0, 'mfNoticeLiveAllowed must exist');
let depth = 0, gateEnd = source.indexOf('{', gateStart);
for (let i = gateEnd; i < source.length; i++) {
  if (source[i] === '{') depth++;
  else if (source[i] === '}' && --depth === 0) { gateEnd = i; break; }
}
const gateSource = source.slice(gateStart, gateEnd + 1);

const live = new Function('MF_N_CRIT', 'MF_N_ORDER', 'MF_N_INFO', 'MF_N_CHAT',
  'MF_N_LIVE_WINDOW', 'MF_N_LIVE_MAX', `
  let mfNLiveTimes=[];
  ${gateSource}
  return {allowed:(pri,urgent,now)=>mfNoticeLiveAllowed(pri,urgent,now),reset:()=>{mfNLiveTimes=[];}};`)(
  MF_N_CRIT, MF_N_ORDER, MF_N_INFO, MF_N_CHAT, Number(window[1]), Number(window[2]));

const PRIORITIES = { MF_N_CRIT, MF_N_ORDER, MF_N_INFO, MF_N_CHAT };
const coachPriority = PRIORITIES[coachPriorityName];
assert.ok(coachPriority != null, `showCoach submits at an unknown priority: ${coachPriorityName}`);

/* 1. THE MESSAGE REACHES THE RAIL. This is the whole point. */
live.reset();
assert.equal(live.allowed(coachPriority, false, 1000), true,
  `showCoach submits at ${coachPriorityName} (${coachPriority}) and mfNoticeLiveAllowed refuses it, so the `
  + 'economy warnings never appear on screen at all — they only land in the event feed the player has to open');

/* 2. AND IT IS STILL RATE-LIMITED. The fix must not turn coaching into a
      banner that can pin itself over the battlefield. */
live.reset();
const admitted = [0, 1, 2, 3, 4].filter(i => live.allowed(coachPriority, false, 1000 + i * 100)).length;
assert.ok(admitted <= Number(window[2]),
  `a burst at the coach priority must stay inside the live budget (${admitted} admitted, budget ${window[2]})`);

/* 3. THE LADDER IS UNCHANGED BELOW IT. Raising coaching must not have been
      done by weakening the gate that keeps chatter and loot off the screen. */
live.reset();
assert.equal(live.allowed(MF_N_INFO, false, 2000), false, 'plain info must still stay off the battlefield');
live.reset();
assert.equal(live.allowed(MF_N_CHAT, false, 2000), false, 'commander chatter must still stay off the battlefield');
live.reset();
assert.equal(live.allowed(MF_N_CRIT, false, 2000), true, 'critical alerts must always reach the rail');

/* 4. THE THREE MESSAGES STILL EXIST AND STILL EXPLAIN THE FIX, not just the
      problem — a warning with no instruction is noise. */
const hud = (await readFile(new URL('../src/ui/hud.js', import.meta.url), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, b => ' '.repeat(b.length));
const coachTick = hud.slice(hud.indexOf('function coachTick(){'));
const tickBody = coachTick.slice(0, coachTick.indexOf('\n}'));
for (const [name, cue] of [['energy stall', 'Build ☀ Reactors'], ['mass stall', 'Extractors'], ['storage full', 'Build a Silo']]) {
  assert.ok(tickBody.includes(cue), `the ${name} coach must still tell the player what to do (${cue})`);
}
assert.match(tickBody, /fullAcc>12/, 'the storage-full branch must still fire on sustained overflow');

console.log(`coach reaches screen: PASS (submitted at ${coachPriorityName}, admitted by the live rail, budget and ladder intact)`);
