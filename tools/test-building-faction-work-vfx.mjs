import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/game/sim.js',import.meta.url),'utf8');
const at=source.indexOf('const MF_BUILDING_WORK_PROFILES='),to=source.indexOf('\nfunction finishUpgrade(',at);
assert(at>=0&&to>at,'building work VFX authority');
const workSource=source.slice(at,to);
let rngCalls=0;
const safeMath=Object.create(Math);safeMath.random=()=>{rngCalls++;throw new Error('work VFX used random');};
const ctx={
  Math:safeMath,Object,WeakMap,Number,paused:false,gfxQ:'high',perfScale:1,tick:0,blds:[],
  BT:{fac:{size:48}},
  MAXPART:64,fCount:0,fHead:0,flife:new Float32Array(64),fzh:[],particles:[],
  activityCalls:0,activityKind:'idle',activityStalled:false,visible:true,owner:{team:0,slot:-1},
  bldFactionKey:B=>B.fac,
  mfGfxKey(){return ctx.gfxQ;},
  mfBuildingActivity(){ctx.activityCalls++;return {kind:ctx.activityKind,stalled:ctx.activityStalled};},
  mfBuildingUpgradeAuthority(){return ctx.owner;},commanderSlotForBuilding:B=>B.slot,
  fogPointVisible(){return ctx.visible;},terrainH(){return 10;},
  addParticle(...args){ctx.particles.push(args);ctx.fHead=(ctx.fHead+1)%64;}
};
vm.createContext(ctx);
vm.runInContext(workSource+'\nthis.workApi={MF_BUILDING_WORK_PROFILES,mfBuildingWorkProfile,mfBuildingWorkFx,mfBuildingWorkFxReset};',ctx);
const {MF_BUILDING_WORK_PROFILES:profiles,mfBuildingWorkProfile,mfBuildingWorkFx,mfBuildingWorkFxReset}=ctx.workApi;

assert(Object.isFrozen(profiles),'profile registry immutable');
const identities=new Set();
for(const faction of ['nova','legion','syndicate','horde']){
  const P=profiles[faction];assert(P&&Object.isFrozen(P),faction+' recipe immutable');
  assert(Object.isFrozen(P.color)&&Object.isFrozen(P.accent),faction+' colors immutable');
  assert(P.period>=1&&Number.isInteger(P.period)&&P.life>0&&P.size>0,faction+' bounded recipe');
  identities.add(P.color.join(',')+'|'+P.accent.join(',')+'|'+P.particleType+'|'+P.period);
  const B={fac:faction};assert.equal(mfBuildingWorkProfile(B),P,faction+' resolves own recipe');
  assert.deepEqual(B,{fac:faction},faction+' profile lookup is pure');
}
assert.equal(identities.size,4,'all faction work languages distinct');
assert.equal(profiles.syndicate.particleType,20,'Syndicate motes use moving work-particle type');
assert.equal(profiles.horde.particleType,20,'Brood motes use moving work-particle type');
assert.equal(mfBuildingWorkProfile({fac:'unknown'}),profiles.nova,'unknown recipe fails safe');
assert(!/Math\.random|mfSimRandom|\brr\s*\(/.test(workSource),'work effect never consumes RNG');

function B(fac='nova'){return {alive:true,team:0,slot:-1,fac,type:'fac',x:100,y:120,r:20,prog:.5,prodT:1,upT:2,res:0};}
function cadence(P,index=0,base=0){let t=base;while((t+index*7)%P.period!==0)t++;return t;}
function reset(kind='constructing',fac='nova'){
  ctx.activityKind=kind;ctx.activityStalled=false;ctx.paused=false;ctx.gfxQ='high';ctx.perfScale=1;
  ctx.visible=true;ctx.owner={team:0,slot:-1};ctx.particles.length=0;ctx.fHead=0;ctx.fzh.length=0;
  ctx.fCount=0;ctx.flife.fill(0);
  const b=B(fac);ctx.blds=[b];ctx.tick=cadence(profiles[fac]);return b;
}

// Every paid-work kind reaches the same bounded faction recipe without mutating the building.
for(const kind of ['constructing','producing','upgrading','researching']){
  const b=reset(kind,'syndicate'),before=structuredClone(b);
  assert.equal(mfBuildingWorkFx(b,0,kind,1/30),true,kind+' emits on cadence');
  assert.deepEqual(b,before,kind+' does not mutate gameplay state');
  assert.equal(ctx.particles.length,1,kind+' emits one particle');
  const expectedHeight=kind==='constructing'?35.584:49.36;
  assert(Math.abs(ctx.fzh[0]-expectedHeight)<1e-8,kind+' particle uses authored structure height');
  assert.equal(mfBuildingWorkFx(b,0,kind,1/30),false,kind+' duplicate suppressed');
}

// Idle, stalled, paused, unpaid/no-dt, hidden, wrong-owner, and low-quality work stay silent.
for(const gate of ['idle','stalled','paused','dt','hidden','owner','low']){
  const b=reset(gate==='idle'?'idle':'constructing');
  if(gate==='stalled')ctx.activityStalled=true;
  if(gate==='paused')ctx.paused=true;
  if(gate==='hidden')ctx.visible=false;
  if(gate==='owner')ctx.owner={team:1,slot:0};
  if(gate==='low')ctx.gfxQ='low';
  assert.equal(mfBuildingWorkFx(b,0,'constructing',gate==='dt'?0:1/30),false,gate+' gate');
  assert.equal(ctx.particles.length,0,gate+' emits nothing');
}

// World replacement plus authority-tick rollback rearms the bounded cosmetic budget.
let resetB=reset('constructing');ctx.tick=profiles.nova.period;
assert.equal(mfBuildingWorkFx(resetB,0,'constructing',1/30),true);
resetB=B('nova');ctx.blds=[resetB];ctx.tick=0;
assert.equal(mfBuildingWorkFx(resetB,0,'constructing',1/30),true,'reset world may emit at its own cadence');
assert.equal(ctx.particles.length,2,'reset clears prior-world duplicate and budget state');

// Reset must rearm the same const blds array used by resetWorld, even at the same tick.
const sameWorld=[];ctx.blds=sameWorld;ctx.particles.length=0;ctx.tick=0;ctx.fCount=0;ctx.flife.fill(0);
let sameB=B('nova');sameWorld.push(sameB);ctx.activityKind='constructing';
assert.equal(mfBuildingWorkFx(sameB,0,'constructing',1/30),true);
sameWorld.length=0;mfBuildingWorkFxReset();sameB=B('nova');sameWorld.push(sameB);
assert.equal(mfBuildingWorkFx(sameB,0,'constructing',1/30),true,'explicit reset rearms same-array tick zero');

// Decorative work never overwrites a live ring-head slot or an 80%-full combat pool.
for(const pressure of ['head','pool']){
  const b=reset('constructing');ctx.tick=0;
  if(pressure==='head')ctx.flife[ctx.fHead]=1;
  else ctx.fCount=Math.ceil(ctx.MAXPART*.8);
  const head=ctx.fHead;
  assert.equal(mfBuildingWorkFx(b,0,'constructing',1/30),false,pressure+' pressure suppresses work mote');
  assert.equal(ctx.fHead,head,pressure+' pressure does not advance particle head');
  assert.equal(ctx.particles.length,0,pressure+' pressure does not overwrite particle');
}

// Per-authority-tick budgets are four on High and two on Medium.
for(const [quality,limit] of [['high',4],['medium',2]]){
  ctx.activityKind='constructing';ctx.activityStalled=false;ctx.paused=false;ctx.gfxQ=quality;ctx.perfScale=1;
  ctx.visible=true;ctx.owner={team:0,slot:-1};ctx.particles.length=0;ctx.fHead=0;ctx.fCount=0;ctx.flife.fill(0);ctx.tick=profiles.nova.period;
  const many=Array.from({length:6},(_,n)=>B('nova'));ctx.blds=many;
  const indices=[0,15,30,45,60,75];
  for(let n=0;n<many.length;n++)mfBuildingWorkFx(many[n],indices[n],'constructing',1/30);
  assert.equal(ctx.particles.length,limit,quality+' per-tick particle cap');
}
assert.equal(rngCalls,0,'no gameplay or presentation RNG consumed');

// Execute the exact generic planar-integration expression: new type 20 moves;
// legacy type 0 remains attached to its authored static point.
const moveAt=source.indexOf("if(tp!==0&&tp!==3&&tp!==4&&(tp!==6||fpz[i]>0)){"),moveTo=source.indexOf('\n    if(tp===2||tp===5)',moveAt);
assert(moveAt>=0&&moveTo>moveAt,'particle integration authority');
const moveCtx={fx:[10],fy:[20],fvx:[6],fvy:[-3],fpz:[0]};vm.createContext(moveCtx);
vm.runInContext(`function integrate(tp,i,dt){${source.slice(moveAt,moveTo)}}this.integrate=integrate;`,moveCtx);
moveCtx.integrate(20,0,.5);assert.deepEqual([...moveCtx.fx,...moveCtx.fy],[13,18.5],'type 20 integrates velocity');
moveCtx.fx[0]=10;moveCtx.fy[0]=20;moveCtx.integrate(0,0,.5);
assert.deepEqual([...moveCtx.fx,...moveCtx.fy],[10,20],'legacy type 0 stays static');

// Call-site contracts: only paid/advancing work owns emission.
assert.match(source,/if\(B\.prog>wasProg\)mfBuildingWorkFx\(B,b,'constructing',dt\)/,'construction only after progress');
assert.match(source,/B\.upT-=dt;\s*mfBuildingWorkFx\(B,b,'upgrading',dt\)/,'upgrade advancement');
const researchCall=source.slice(source.indexOf("if(B.res>=0){"),source.indexOf("else if(B.type==='bunker')"));
assert(researchCall.indexOf('if(payStream(')>=0&&researchCall.indexOf('if(payStream(')<researchCall.indexOf('B.resT+=dt;')&&
  researchCall.indexOf('B.resT+=dt;')<researchCall.indexOf("mfBuildingWorkFx(B,b,'researching',dt)"),'research only after payment');
assert.match(source,/B\.prodT\+=work;\s*if\(work>0\)mfBuildingWorkFx\(B,b,'producing',dt\)/,'production only after paid work');
/* WHAT MATTERS IS THE ORDER, NOT ADJACENCY.
   The emitter keys off building slots, so its state has to be rearmed AFTER
   the building array is emptied or a new match inherits the old base's work
   plumes. This asserted the three statements as one contiguous run, which
   broke the moment navigation reset was inserted between them — a correct
   change that this read as the rearm having been deleted. */
{
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const reset=main.slice(main.indexOf('function resetWorld(){'));
  const body=reset.slice(0,reset.indexOf('\nfunction '));
  const cleared=body.indexOf('blds.length=0;');
  const rebuilt=body.indexOf('rebuildBGrid()');
  const rearmed=body.search(/if\(typeof mfBuildingWorkFxReset==='function'\)mfBuildingWorkFxReset\(\)/);
  assert.ok(cleared>=0,'resetWorld must still empty the building array');
  assert.ok(rebuilt>cleared,'the building grid must be rebuilt after the array is emptied');
  assert.ok(rearmed>rebuilt,
    'resetWorld must rearm the work-VFX state after clearing buildings, or a new match inherits the previous base\'s work plumes');
}

console.log('building faction work VFX: PASS');
