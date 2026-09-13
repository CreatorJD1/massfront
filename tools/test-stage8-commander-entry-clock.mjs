/* Regression: the match-entry commander cue and the HUD drain must use the
   same fixed-step match clock. Page time is already old after a slow boot. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const commander=fs.readFileSync(new URL('../src/game/commander.js',import.meta.url),'utf8');
const start=main.indexOf("commanderCue('objective','assigned'");
assert(start>=0,'match entry no longer raises the objective-assigned cue');
const call=main.slice(start,main.indexOf(');',start)+2);
assert(/\bnow\s*:\s*0\b/.test(call),
  'match entry no longer starts on the fixed-step dialogue clock');
assert(commander.includes("const now=(typeof o.now==='number')?o.now:commanderDialogueClock();"),
  'commander cues no longer default to the dialogue authority clock');
assert(commander.includes("const t=(typeof now==='number')?now:commanderDialogueClock();"),
  'commander drain no longer defaults to the dialogue authority clock');

console.log('PASS Stage 8 commander entry clock contract (match entry and HUD drain share time zero)');
