/* THE FEED BADGE COUNTS THINGS TO READ.
 *
 * Reported from live play: the FEED badge climbed 8 -> 10 -> 20 -> 47 -> 99+
 * inside single matches. The panel behind it deduplicates - one base alert
 * repeated forty times collapses to a single row marked "x40" - but the badge
 * incremented once per SUBMISSION, so the two numbers described different
 * things and the badge was a busyness meter that could only go up.
 *
 * And nothing reset either one at a match boundary, so a second deployment
 * opened carrying the first one's alerts.
 *
 * This runs the real function against a DOM stub rather than asserting on
 * source text, because the bug was arithmetic, not vocabulary.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../src/ui/hudflow.js', import.meta.url), 'utf8');
/* Comments are blanked to spaces before anything is extracted. Two gates in
   this repo have now passed on their own explanatory prose - a `@media` and an
   `if(matchLive) return` that existed only inside the comment describing them.
   Offsets are preserved so slice indices stay meaningful. */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, b => ' '.repeat(b.length));

function extract(signature) {
  const start = source.indexOf(signature);
  assert.ok(start > 0, `missing ${signature}`);
  let depth = 0, i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return signature.slice(0, signature.indexOf('(')) + source.slice(start + signature.indexOf('('), open) + source.slice(open, i + 1);
}

/* The three functions under test, lifted with their real bodies and given only
   the globals they touch. */
const bodies = ['function mfNoticeHistoryAdd(pri,key,label,channel){',
  'function mfNoticeMatchReset(){',
  'function mfNoticeHistoryOpen(){'].map(extract);

let historyShown = false;
const scope = {
  MF_N_HISTORY_MAX: 80,
  mfNHistory: [], mfNUnread: 0, mfNHistoryFilter: 'all',
  mfNQ: [], mfNLiveTimes: [],
  mfNKey: '', mfNPri: 99, mfNRender: null, mfNUrgent: false, mfNUntil: 0, mfNCount: 1, mfNHold: false,
  now: 0
};
const prelude = `
  let ${Object.keys(scope).filter(k => k !== 'MF_N_HISTORY_MAX').map(k => k + '=' + JSON.stringify(scope[k])).join(',')};
  const MF_N_HISTORY_MAX=80;
  const performance={now:()=>now};
  const Date_={now:()=>now};
  const mfFlowEl=()=>null;
  const mfFlowQueueLayout=()=>{};
  const sfx=()=>{};
  const document={body:{classList:{add(){},remove(){}}}};
  const mfNoticeHistoryShown=()=>SHOWN();
  const mfNoticeBadgeSync=()=>{};
  const mfNoticeHistoryRender=()=>{};
  const mfNoticeHistoryShell=()=>({style:{}});
  const mfNoticeLogShell=()=>({setAttribute(){}});
`;
const harness = new Function('SHOWN', 'setNow', `${prelude}
  ${bodies.join('\n')}
  return {
    add:(pri,key,label,ch)=>mfNoticeHistoryAdd(pri,key,label,ch),
    reset:()=>mfNoticeMatchReset(),
    open:()=>mfNoticeHistoryOpen(),
    tick:(ms)=>{now+=ms;},
    rowFor:(key)=>mfNHistory.find(r=>r.key===key)||null,
    state:()=>({unread:mfNUnread,rows:mfNHistory.length,raw:mfNHistory.reduce((a,r)=>a+(r.n||1),0)})
  };`)(() => historyShown, null);

/* 1. A REPEATED EVENT IS ONE THING TO READ. Forty submissions of the same
      alert inside the 8s dedupe window are one row, so one unread.

      This is deliberately run against a feed that ALREADY holds many rows.
      Measured from a bare feed the assertion is vacuous: the badge would read
      40, and the `unread <= rows` clamp would quietly pull it back to 1, so a
      reverted fix still passed. The clamp bounds the badge by TOTAL rows, not
      by unread ones, which is exactly the gap this has to probe. */
for (let i = 0; i < 60; i++) { harness.tick(9000); harness.add(2, 'seed' + i, 'SEED ' + i, 'command'); }
harness.open();
assert.equal(harness.state().unread, 0, 'opening must clear before the repeat measurement');
harness.tick(9000);
for (let i = 0; i < 40; i++) harness.add(0, 'base:3,4', 'BASE UNDER ATTACK', 'alert');
let s = harness.state();
assert.ok(s.rows > 40, 'the repeat case must be measured on a populated feed, not a bare one');
assert.equal(s.unread, 1,
  `badge must count the one unread row, not the forty submissions (got ${s.unread})`);
const attackRow = harness.rowFor('base:3,4');
assert.equal(attackRow && attackRow.n, 40, 'the row must still record all forty for its ×40 marker');

/* 2. DISTINCT EVENTS EACH COUNT. The fix must not suppress real news. */
harness.add(1, 'prod:fac1', 'FACTORY STALLED', 'command');
harness.add(2, 'loot:crate9', 'SUPPLY CRATE', 'pickup');
assert.equal(harness.state().unread, 3, 'three distinct unread rows must read as three');

/* 3. OPENING THE FEED CLEARS IT, AND A LATER REPEAT COUNTS AGAIN. The per-row
      flag has to be cleared on open or an already-seen row is permanently
      treated as counted and never re-badges. */
harness.open();
assert.equal(harness.state().unread, 0, 'opening the feed must clear the badge');
harness.add(0, 'base:3,4', 'BASE UNDER ATTACK', 'alert');
assert.equal(harness.state().unread, 1,
  'a repeat AFTER the feed was read is new news and must badge again');

/* 4. THE BADGE CAN NEVER EXCEED WHAT THE PANEL HOLDS. That gap is exactly what
      "99+ over a thirty-row feed" was. */
harness.open();
for (let i = 0; i < 300; i++) { harness.tick(9000); harness.add(2, 'ev' + i, 'EVENT ' + i, 'command'); }
s = harness.state();
assert.ok(s.rows <= 80, 'history stays bounded');
assert.ok(s.unread <= s.rows,
  `badge (${s.unread}) must never exceed the rows the panel can show (${s.rows})`);

/* 5. A MATCH BOUNDARY CLEARS THE FEED. */
harness.reset();
s = harness.state();
assert.equal(s.rows, 0, 'a new match must not open with the last match\'s feed');
assert.equal(s.unread, 0, 'a new match must not open with the last match\'s badge');

/* 6. resetWorld() actually calls it, or none of the above ships. */
const main = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, b => ' '.repeat(b.length));
const reset = main.slice(main.indexOf('function resetWorld(){'));
const resetBody = reset.slice(0, reset.indexOf('\nfunction '));
assert.match(resetBody, /mfNoticeMatchReset\(\)/,
  'resetWorld must clear the event feed at the same boundary it clears commander dialogue');

console.log('notice feed badge: PASS (repeats collapse, distinct events count, open clears, badge <= rows, match boundary resets)');
