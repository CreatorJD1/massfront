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

const bunker=block(sim,"else if(B.type==='bunker')","else if(B.type==='aatower')");
const bastion=block(sim,"else if(B.type==='bastion')","else if(B.type==='turret')");
const missiles=block(sim,"else if(B.type==='missilebastion')","else if(B.type==='plasma')");
const plasma=block(sim,"else if(B.type==='plasma')","else if(B.type==='nova')");
need(bunker,/const pk=fireProj[\s\S]*pwk\[pk\]='e'/,'Bunker projectile lost explosive class');
need(bastion,/const pk=fireProj[\s\S]*pwk\[pk\]='e'[\s\S]*pConcuss\[pk\]=BASTION_CONCUSS/,
  'Bastion projectile lost explosive concussion payload');
need(missiles,/const pk=fireProj[\s\S]*pwk\[pk\]='e'/,'Missile Bastion projectile lost explosive class');
need(plasma,/const pk=fireProj[\s\S]*pwk\[pk\]='i'/,'Plasma Charger projectile lost ion class');
need(sim,/const BASTION_CONCUSS=\[1\.8,2\.3,3\.0\]/,'Bastion Mk concussion durations drifted');
need(sim,/if\(pConcuss\[i\]>0\) uhaz\[j\]=Math\.max\(uhaz\[j\],pConcuss\[i\]\)/,
  'Concussion payload is not applied to AOE victims');
need(sim,/pConcuss\[i\]=0/,'Recycled projectile concussion payload is not reset');

const horde=block(ai,"if(AI.fac==='horde')","else if(AI.fac==='legion')");
if(/\b(?:12|13)\b/.test(horde)) throw new Error('Horde factory doctrine queues a zero-build-time wildlife unit');
need(horde,/\b20\b[\s\S]*\b21\b|\b21\b[\s\S]*\b20\b/,'Horde T2 doctrine lost Reaper/Cinder production');
need(ai,/if\(!TYPES\[t\]\|\|TYPES\[t\]\.bt<=0\)/,'AI production lacks zero-build-time fail-safe');

console.log('Defense role integrity QA passed.');
