import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/game/sim.js',import.meta.url),'utf8');
const helper=source.match(/function mfProductionDuration\(T\)[\s\S]*?(?=function mfBuildingActivity\()/);
assert(helper,'production speed authority');
const branchAt=source.indexOf('if(B.queue.length){',source.indexOf("else if(B.type==='fac'||B.type==='tgate'"));
const branchEnd='} else {B.prodT=0;B.prodStalled=\'\';}';
const branchTo=source.indexOf(branchEnd,branchAt);
assert(branchAt>0&&branchTo>branchAt,'actual bldTick production branch');
/* In the real loop `continue` advances to the next building. A one-building VM
   harness uses `return`, which is the identical boundary for this branch. */
const branch=source.slice(branchAt,branchTo+branchEnd.length).replaceAll('continue;','return;');

const ctx={
  Math,playerBuildMult:1,aiBuildMult:1,tick:1,perfScale:0,MAXU:34000,MAP:2048,
  BT:{fac:{size:20}},TYPES:[
    {name:'Goliath',bt:6,cm:60,ce:240,air:0,naval:0},
    {name:'Rhino',bt:2.6,cm:26,ce:100,air:0,naval:0}
  ],
  factionDoctrineBuildSpeedMul(){return 1;},fortOf(){return {prod:1};},
  factionDoctrineUnitCost(T){return {m:T.cm,e:T.ce};},
  popOK:true,payOK:true,payments:[],spawnCalls:0,spawnResult:0,teamCount:[0,0,0],
  populationCanSpawn(){return ctx.popOK;},commanderSlotForBuilding(){return -1;},
  payStream(team,m,e,slot){ctx.payments.push({team,m,e,slot});return ctx.payOK;},
  spawnUnit(){ctx.spawnCalls++;return ctx.spawnResult;},
  ustate:[],ux:[100],uy:[100],utx:[],uty:[],ufield:[],
  mfSimRange(a,b){return (a+b)/2;},rr(a,b){return (a+b)/2;},
  clamp(v,a,b){return Math.max(a,Math.min(b,v));},dist2(x0,y0,x1,y1){return (x0-x1)**2+(y0-y1)**2;},
  findLand(x,y){return [x,y];},findWater(x,y){return [x,y];},
  requestField(){return 7;},mfNavUnitClearance(){return 0;},addParticle(){},sfx(){},
  mfBuildingWorkFx(){},
  resM:[1000,1000],resE:[1000,1000],stallM:0,stallE:0
};
vm.createContext(ctx);
vm.runInContext(helper[0]+`\nfunction runProductionTick(B,dt){const b=0;${branch}}\n`,ctx);

function building(queue=[0]){
  return {type:'fac',team:0,x:300,y:300,r:30,queue:[...queue],prodT:0,prodStalled:'',repeat:false,
    adj:0,tractorT:0,rally:{x:500,y:500}};
}
function reset(){ctx.popOK=true;ctx.payOK=true;ctx.payments.length=0;ctx.spawnCalls=0;ctx.spawnResult=0;ctx.teamCount.fill(0);}
function near(a,b,label){assert(Math.abs(a-b)<1e-10,`${label}: ${a} != ${b}`);}

// Partial saved work advances and bills only the new fraction.
reset();
let B=building();B.prodT=3;
ctx.runProductionTick(B,1);
const speed=6/22,work=speed;
near(B.prodT,3+work,'partial progress');
near(ctx.payments[0].m,60*work/6,'partial mass');
near(ctx.payments[0].e,240*work/6,'partial energy');
assert.equal(ctx.spawnCalls,0);

// The final tick clamps work and payment to the exact unpaid tail.
reset();
B=building([0,1]);B.prodT=5.9;
ctx.runProductionTick(B,1);
assert.deepEqual(B.queue,[1],'completed item advances queue once');
near(ctx.payments[0].m,1,'final fractional mass');
near(ctx.payments[0].e,4,'final fractional energy');
assert.equal(ctx.spawnCalls,1,'one completed item produces one body');
ctx.runProductionTick(B,0);
assert.equal(ctx.spawnCalls,1,'completed item cannot output twice');

// Repeat appends the completed chassis behind already queued work.
reset();
B=building([0,1]);B.repeat=true;B.prodT=5.9;
ctx.runProductionTick(B,1);
assert.deepEqual(B.queue,[1,0]);
assert.equal(ctx.spawnCalls,1);

// A rejected resource stream cannot advance, pop, repeat, or spawn.
reset();
B=building();B.prodT=2.25;ctx.payOK=false;
ctx.runProductionTick(B,1);
assert.equal(B.prodT,2.25);assert.deepEqual(B.queue,[0]);
assert.equal(B.prodStalled,'resources');assert.equal(ctx.spawnCalls,0);

// Population admission happens before both payment and work.
reset();
B=building();B.prodT=5.995;ctx.popOK=false;
ctx.runProductionTick(B,1);
assert.equal(B.prodT,5.995,'population stall retains every paid work unit');assert.deepEqual(B.queue,[0]);
assert.equal(B.prodStalled,'population');assert.equal(ctx.payments.length,0);assert.equal(ctx.spawnCalls,0);

/* A global-pool failure can occur after the admission check. The finished item
   stays ready and repeat ordering stays untouched; recovery retries at zero
   work/cost and delivers exactly once before advancing the queue. */
reset();
B=building([0,1]);B.repeat=true;B.prodT=5.9;ctx.spawnResult=-1;
ctx.runProductionTick(B,1);
assert.equal(B.prodT,6,'failed output remains fully paid and ready');
assert.deepEqual(B.queue,[0,1]);assert.equal(B.prodStalled,'population');
assert.equal(ctx.spawnCalls,1);assert.equal(ctx.payments.length,1);
near(ctx.payments[0].m,1,'failed output final fractional mass paid once');
near(ctx.payments[0].e,4,'failed output final fractional energy paid once');
ctx.spawnResult=0;
ctx.runProductionTick(B,1);
assert.equal(B.prodT,0);assert.deepEqual(B.queue,[1,0],'repeat advances only after delivery');
assert.equal(ctx.spawnCalls,2,'one failed attempt and one successful delivery');
assert.equal(ctx.payments.length,2,'recovery follows the same payment path');
near(ctx.payments[1].m,0,'recovery adds no mass debit');
near(ctx.payments[1].e,0,'recovery adds no energy debit');

console.log('production tick accounting: PASS');
