/* Focused source regression for defense-role metadata and Horde production.
   The game is one classic-script scope, so these checks intentionally inspect
   the authoritative call sites: a later fireProj refactor must preserve the
   weapon class and payload writes immediately after allocation. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sim=fs.readFileSync(path.join(root,'src/game/sim.js'),'utf8');
const ai=fs.readFileSync(path.join(root,'src/game/ai.js'),'utf8');

function block(src,start,end){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  if(a<0||b<0) throw new Error('missing source block: '+start);
  return src.slice(a,b);
}
function need(src,re,msg){ if(!re.test(src)) throw new Error(msg); }

/* Markers stop at the closing quote, not the closing paren. Structures share a
   firing branch when they share a weapon — the Concussion Mortar picked up the
   Seafort as `B.type==='bastion'||B.type==='seafort'`, which is a correct
   consolidation that this gate read as the whole branch having been deleted.
   The point of these checks is the payload written after fireProj, not the
   exact shape of the condition that reaches it. */
const bunker=block(sim,"else if(B.type==='bunker'","else if(B.type==='aatower'");
const bastion=block(sim,"else if(B.type==='bastion'","else if(B.type==='turret'");
const missiles=block(sim,"else if(B.type==='missilebastion'","else if(B.type==='plasma'");
const plasma=block(sim,"else if(B.type==='plasma'","else if(B.type==='nova'");
need(bunker,/const pk=fireProj[\s\S]*pwk\[pk\]='e'/,'Bunker projectile lost explosive class');
need(bastion,/const pk=fireProj[\s\S]*pwk\[pk\]='e'[\s\S]*pConcuss\[pk\]=BASTION_CONCUSS/,
  'Bastion projectile lost explosive concussion payload');
need(missiles,/const pk=fireProj[\s\S]*pwk\[pk\]='e'/,'Missile Bastion projectile lost explosive class');
need(plasma,/const pk=fireProj[\s\S]*pwk\[pk\]='i'/,'Plasma Charger projectile lost ion class');
need(sim,/const BASTION_CONCUSS=\[1\.8,2\.3,3\.0\]/,'Bastion Mk concussion durations drifted');
need(sim,/if\(pConcuss\[i\]>0\) uhaz\[j\]=Math\.max\(uhaz\[j\],pConcuss\[i\]\)/,
  'Concussion payload is not applied to AOE victims');
need(sim,/pConcuss\[i\]=0/,'Recycled projectile concussion payload is not reset');

/* ZERO-BUILD-TIME UNITS CAN NEVER ENTER A PRODUCTION QUEUE.
   Wildlife and heroes carry bt:0 — they are spawned, not manufactured — and a
   factory that queues one never finishes it, which is a permanent production
   deadlock for that seat.

   This used to be checked by reading the hardcoded `if(AI.fac==='horde')`
   pool. That block is gone on purpose: three per-faction pools disagreed with
   FACTIONS[k].bias, and production is now driven by the bias table plus the
   behaviour pools, filtered through factionDoctrineRoster. So check the
   mechanism that exists instead of the one that was deleted — and check ALL
   of it, not just the Horde's share. */
const zeroBuild=new Set();
{
  const a=sim.indexOf('const TYPES=['),b=sim.indexOf('\n];',a);
  const rows=[...sim.slice(a,b).matchAll(/\{name:'([^']+)'[\s\S]*?bt:\s*([0-9.]+)/g)];
  if(rows.length<20) throw new Error('could not read the TYPES table');
  rows.forEach((r,i)=>{ if(+r[2]<=0) zeroBuild.add(i); });
  if(!zeroBuild.size) throw new Error('no zero-build-time types found — the guard below would be vacuous');
}
const offenders=(label,list)=>{
  const bad=list.filter(t=>zeroBuild.has(t));
  if(bad.length) throw new Error(label+' can queue zero-build-time type(s) '+bad.join(', '));
};

/* 1. Every behaviour pool. */
const behaviour=block(ai,'function aiBehaviorUnitPool(','\n}\n');
let pools=0;
for(const m of behaviour.matchAll(/\[([0-9,\s]+)\]/g)){
  offenders('aiBehaviorUnitPool',m[1].split(',').map(n=>+n.trim()));
  pools++;
}
if(pools<8) throw new Error('aiBehaviorUnitPool pools not found ('+pools+')');

/* 2. Every faction bias table — this is what actually names a faction's
      signature units now. */
let biases=0;
for(const m of ai.matchAll(/bias:\{([^}]+)\}/g)){
  offenders('a faction bias table',[...m[1].matchAll(/(\d+)\s*:/g)].map(x=>+x[1]));
  biases++;
}
if(biases<3) throw new Error('faction bias tables not found ('+biases+')');

/* 3. The factory's own base pools. */
const basePools=[...ai.matchAll(/const basePool=B\.tier===2\?\[([0-9,\s]+)\]:\[([0-9,\s]+)\]/g)];
if(!basePools.length) throw new Error('factory basePool not found');
for(const m of basePools){
  offenders('the tier-2 basePool',m[1].split(',').map(n=>+n.trim()));
  offenders('the tier-1 basePool',m[2].split(',').map(n=>+n.trim()));
}

/* 4. And the two filters that are the last line of defence, because the pools
      above are not the only thing that can name a type. */
need(ai,/legal=factionDoctrineRoster\(basePool,[^)]*\)\.filter\(q=>TYPES\[q\]&&TYPES\[q\]\.bt>0\)/,
  'the legal roster no longer rejects zero-build-time types');
need(ai,/if\(!TYPES\[t\]\|\|TYPES\[t\]\.bt<=0\)/,'AI production lacks zero-build-time fail-safe');
need(ai,/const themed=legal\.filter\(t=>b\[t\]>0&&TYPES\[t\]&&TYPES\[t\]\.bt>0\)/,
  'the faction bias override no longer rejects zero-build-time types');

/* 5. The Brood still fights like the Brood. The old gate protected Reaper and
      Cinder specifically; those live in the bias table and the tier-2 pool
      now, so say so by name rather than by array position. */
const hordeBias=/horde:\s*\{[\s\S]*?bias:\{([^}]+)\}/.exec(ai);
if(!hordeBias) throw new Error('Umbral Brood bias table missing');
const hordeKeys=[...hordeBias[1].matchAll(/(\d+)\s*:/g)].map(x=>+x[1]);
if(!hordeKeys.includes(21)) throw new Error('Umbral Brood bias no longer weights the Cinder');
if(!hordeKeys.includes(0)||!hordeKeys.includes(9))
  throw new Error('Umbral Brood bias lost its cheap swarm core (Striker / Pyro)');
if(!basePools[0][1].split(',').map(n=>+n.trim()).includes(20))
  throw new Error('the tier-2 factory pool no longer reaches the Reaper');

console.log('Defense role integrity QA passed.');
