#!/usr/bin/env node
/* Focused Stage-6 proof for sim-owned commander dialogue hooks.

   This executes the real cue-wiring block from src/game/sim.js with a tiny,
   explicit fixed-step fixture. It does not evaluate the rest of the simulation
   and cannot mutate gameplay. Exit is nonzero for any missing hook, wall-clock
   dependency, random dependency, wrong cue classification, rate-limit failure,
   or match-clock reset failure. */
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const execFile=promisify(execFileCallback);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const simPath=join(root,'src','game','sim.js');
const source=await readFile(simPath,'utf8');
const sha256=v=>createHash('sha256').update(v).digest('hex');
const git=async args=>{
  try{return (await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024})).stdout.trimEnd();}
  catch{return '';}
};
const startedUtc=new Date().toISOString();
const outDir=join(root,'.tmp','commander-cue-wiring','runs',startedUtc.replace(/[:.]/g,'-'));
const checks=[];
let failed=0;
function check(name,ok,detail){
  ok=!!ok;checks.push({name,ok,detail:String(detail==null?'':detail)});if(!ok)failed++;
  console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` [${detail}]`:''}`);
}

const start=source.indexOf('const MF_COMMANDER_CUE_WIRING=');
const finish=source.indexOf('/* END COMMANDER CUE WIRING */',start);
const block=start>=0&&finish>start?source.slice(start,finish):'';
check('real sim cue-wiring block found',block.length>2500,`${block.length} chars`);
const codeOnly=block.replace(/\/\*[\s\S]*?\*\//g,' ');
check('cue wiring consumes no random values',!/Math\.random|\brr\s*\(|\bband\s*\(/.test(codeOnly),'no simulation RNG call');
check('cue wiring consumes no wall clock',!/Date\.now|performance\.now|new Date\s*\(/.test(codeOnly),'stats.t only');

const calls=[];
let contacts=[];
const sandbox={
  console,Math,Object,Number,String,
  stats:{t:0},MAXU:8,
  TYPES:[
    {name:'Scout',size:12,tier:1,cat:'inf',air:0},
    {name:'Goliath',size:25,tier:2,cat:'veh',air:0},
    {name:'Wasp',size:15,tier:1,cat:'air',air:1},
  ],
  ARM:[0,2,1],
  ualive:new Uint8Array([1,1,1,0,0,0,0,0]),
  uteam:new Uint8Array([1,1,1,0,0,0,0,0]),
  ugen:new Int32Array([10,11,12,0,0,0,0,0]),
  utype:new Uint8Array([0,1,2,0,0,0,0,0]),
  mfCombatFactionTeam:team=>team===2?'horde':'legion',
  goalDef:()=>({id:'annihilate'}),
  intelContactList:()=>contacts,
  commanderCue:(category,kind,opts)=>{
    const cue={category,kind,opts:Object.assign({},opts)};
    calls.push(cue);return {ok:true,reason:'queued',cue};
  },
};
sandbox.globalThis=sandbox;
const ctx=vm.createContext(sandbox);
if(block)vm.runInContext(block,ctx,{filename:'src/game/sim.js#commander-cue-wiring'});
const run=expr=>vm.runInContext(expr,ctx);

run('stats.t=1.25;mfCommanderCueCasualty("unit","Rhino",100,200,false)');
check('casualty uses fixed-step milliseconds',calls.length===1&&calls[0].opts.now===1250,JSON.stringify(calls[0]||null));
check('ordinary unit casualty is classified correctly',calls[0]?.category==='casualty'&&calls[0]?.kind==='unit'&&calls[0]?.opts.subject==='Rhino','casualty.unit / Rhino');
const rate=run('stats.t=2;mfCommanderCueCasualty("structure","Factory",20,30,false).reason');
check('source burst limiter suppresses casualty spam',rate==='source-rate'&&calls.length===1,rate);
run('stats.t=2;mfCommanderCueCasualty("commander","commander",20,30,true)');
check('terminal commander casualty bypasses ordinary loss throttle',calls.length===2&&calls[1].kind==='commander'&&calls[1].opts.force===true,JSON.stringify(calls[1]||null));

calls.length=0;
run('stats.t=10;mfCommanderCueStrategic(0,"nova",300,400);stats.t=17;mfCommanderCueStrategic(1,"singularity",500,600)');
check('friendly strategic launch maps to launch',calls[0]?.category==='strategic'&&calls[0]?.kind==='launch'&&calls[0]?.opts.now===10000,JSON.stringify(calls[0]||null));
check('hostile strategic launch maps to incoming',calls[1]?.category==='strategic'&&calls[1]?.kind==='incoming'&&calls[1]?.opts.now===17000,JSON.stringify(calls[1]||null));

calls.length=0;
run('stats.t=23.75;mfCommanderCueRaise("research","complete",{subject:"optics"},0,"research:optics")');
check('research completion carries id and fixed-step timestamp',calls.length===1&&calls[0].category==='research'&&calls[0].kind==='complete'&&calls[0].opts.subject==='optics'&&calls[0].opts.now===23750,JSON.stringify(calls[0]||null));

calls.length=0;
contacts=[
  {target:0,generation:10,x:100,y:100,confidence:1},
  {target:1,generation:11,x:200,y:200,confidence:1},
  {target:2,generation:12,x:300,y:300,confidence:1},
];
run('stats.t=0;mfCommanderCueIntelTick();stats.t=20.1;mfCommanderCueIntelTick();stats.t=40.2;mfCommanderCueIntelTick()');
check('confirmed contacts emit first, heavy, then air without a burst',calls.map(c=>c.kind).join(',')==='first,heavy,air',calls.map(c=>c.kind).join(','));
check('contact subjects come from faction/type truth',calls[0]?.opts.subject==='legion'&&calls[1]?.opts.subject==='Goliath'&&calls[2]?.opts.subject==='Wasp',calls.map(c=>c.opts.subject).join(','));
run('stats.t=0;mfCommanderCueResetForClock(0)');
const reset=JSON.parse(run('JSON.stringify({first:MF_COMMANDER_CUE_WIRING.sightedFirst,heavy:MF_COMMANDER_CUE_WIRING.sightedHeavy,air:MF_COMMANDER_CUE_WIRING.sightedAir,last:Object.keys(MF_COMMANDER_CUE_WIRING.lastSourceAt).length})'));
check('backwards simulation clock resets match-local cue state',!reset.first&&!reset.heavy&&!reset.air&&reset.last===0,JSON.stringify(reset));

function between(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+1);return i>=0&&j>i?source.slice(i,j):'';}
const kill=between('function killUnit(','// ---------- spatial hash ----------');
const bld=between('function damageBld(','function repairBld(');
const research=between('function applyResearch(','/* (volumetric terrain destruction');
const nova=between('function novaFire(','function band(');
const singularity=between('function spawnSingularity(','function mfSingularityMassResponse(');
check('unit death path raises player casualty cues',/mfCommanderCueCasualty\(/.test(kill),'killUnit');
check('commander death raises terminal objective failure',/mfCommanderCueObjective\('failed'/.test(kill),'killUnit');
check('last hostile commander raises objective completion',/enemyHeroIdxs\.length[\s\S]*mfCommanderCueObjective\('complete'/.test(kill),'killUnit');
check('structure death path raises casualty cues',/mfCommanderCueCasualty\('structure'/.test(bld),'damageBld');
check('last purge nest raises exact objective completion',/liveNests\(\)\.length[\s\S]*mfCommanderCueObjective\('complete','purge'/.test(bld),'damageBld');
check('authoritative research mutation raises completion cue',/researched\[id\]=true;\s*resDone\+\+;[\s\S]{0,160}mfCommanderCueRaise\('research','complete',\{subject:id\}/.test(research),'applyResearch');
check('NOVA launch path raises a strategic cue',/mfCommanderCueStrategic\(B\.team,'nova'/.test(nova),'novaFire');
check('singularity launch path raises a strategic cue',/mfCommanderCueStrategic\(S\.team,'singularity'/.test(singularity),'spawnSingularity');
check('normal fixed-step unit loop polls confirmed intel',/function unitTick\(dt\)\{[\s\S]{0,500}mfCommanderCueIntelTick\(\)/.test(source),'unitTick');
check('internal detonation conversion suppresses duplicate singularity cue',/spawnSingularity\(x,y,pow,byTeam,\{cue:false\}\)/.test(source),'superDetonation');

const status=await git(['status','--porcelain=v1','--untracked-files=all']);
const report={
  probe:'commander-cue-wiring',startedUtc,finishedUtc:new Date().toISOString(),
  source:{branch:await git(['rev-parse','--abbrev-ref','HEAD']),head:await git(['rev-parse','HEAD']),
    dirty:true,dirtyFingerprint:sha256(status),path:'src/game/sim.js',sha256:sha256(source),bytes:Buffer.byteLength(source)},
  checks,passed:checks.filter(c=>c.ok).length,failed
};
await mkdir(outDir,{recursive:true});
await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2));
console.log(`report ${join(outDir,'report.json')}`);
console.log(`${report.passed} passed, ${failed} failed`);
process.exit(failed?1:0);
