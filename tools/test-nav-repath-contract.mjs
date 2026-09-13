import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/game/sim.js',import.meta.url),'utf8');
const begin=source.indexOf('const uNavProgressGen=');
const end=source.indexOf('function mfNavFindAttackBlocker',begin);
assert.ok(begin>=0&&end>begin,'source must provide bounded progress/repath helpers');
const code=source.slice(begin,end);
const makeArray=()=>new Float32Array(4);
const c=vm.createContext({MAXU:4,Math,Float32Array,Uint32Array,
  ugen:new Uint32Array([1,1,1,1]),ux:makeArray(),uy:makeArray(),ufield:new Int16Array(4).fill(-1),
  fields:[],tick:0,mfMoveBlockRevision:1,requests:0,builds:0,
  dist2:(a,b,x,y)=>(a-x)**2+(b-y)**2,mfNavUnitClearance:()=>0,
  mfMoveFieldFresh:F=>F,
});
c.requestField=(x,y,naval,clearance,defer)=>{assert.equal(defer,true);c.requests++;if(c.poolFull)return -1;
  c.fields.push({tx:x,ty:y,naval,clearance,rev:1,pending:true,dirs:null});return c.fields.length-1;};
c.mfNavQueueBuild=F=>{c.builds++;F.pending=true;};
vm.runInContext(code+'\nglobalThis.api={mfNavProgressRepath,mfNavFieldForMove,mfNavProgressReset};',c);
const {api}=c,T={spd:20,naval:false};
assert.equal(api.mfNavProgressRepath(0,T,100,0,.1,true),false);
let stuck=false;
for(let n=0;n<15;n++)stuck=api.mfNavProgressRepath(0,T,100,0,.1,true)||stuck;
assert.equal(stuck,true,'standing at a wall triggers progress-based recovery');
stuck=false;
for(let n=0;n<40;n++){c.ux[0]+=1;stuck=api.mfNavProgressRepath(0,T,100,0,.1,true)||stuck;}
assert.equal(stuck,false,'real displacement during a detour is progress even away from goal');
for(let n=0;n<12;n++)api.mfNavProgressRepath(1,T,100,0,.1,true);
c.ugen[1]++;assert.equal(api.mfNavProgressRepath(1,T,100,0,.1,true),false,'reused slot clears prior stall history');
assert.equal(api.mfNavProgressRepath(1,T,500,0,.1,true),false,'new destination clears prior stall history');
assert.equal(api.mfNavProgressRepath(1,T,500,0,10,false),false,'holding/arrival never triggers recovery');

let F=api.mfNavFieldForMove(0,T,100,0,false,false);
assert.equal(c.requests,1);assert.equal(F.pending,true);
api.mfNavFieldForMove(0,T,100,0,false,true);
assert.equal(c.builds,0,'stuck retry cannot repeatedly restart a pending field');
F.pending=false;F.dirs=new Uint8Array([0]);c.tick=100;
api.mfNavFieldForMove(0,T,100,0,false,true);
assert.equal(c.builds,1,'stalled fresh route can be rebuilt asynchronously');
F.pending=false;c.tick=101;api.mfNavFieldForMove(0,T,100,0,false,true);
assert.equal(c.builds,1,'shared route rebuild is throttled across units');
api.mfNavFieldForMove(0,T,500,0,true,false);
assert.equal(c.requests,2,'combat chase does not follow a field for another destination');
c.mfMoveBlockRevision++;api.mfNavProgressRepath(0,T,100,0,.1,true);
const strategic=api.mfNavFieldForMove(0,T,100,0,false,false);
assert.equal(c.requests,3);assert.equal(strategic.tx,100,'ending pursuit after blocker destruction reacquires the original strategic route');
c.poolFull=true;api.mfNavFieldForMove(2,T,100,0,false,false);
const tries=c.requests;api.mfNavFieldForMove(2,T,100,0,false,false);
assert.equal(c.requests,tries,'saturated field pool retries on cooldown, not every tick');
api.mfNavProgressReset();api.mfNavFieldForMove(2,T,100,0,false,false);
assert.equal(c.requests,tries+1,'world reset clears retries even if slot and generation repeat');
for(let n=0;n<12;n++)api.mfNavProgressRepath(1,T,500,0,.1,true);
c.mfMoveBlockRevision++;assert.equal(api.mfNavProgressRepath(1,T,500,0,.1,true),false,'map revision invalidates progress history');

const hashSource=await readFile(new URL('../src/game/statehash.js',import.meta.url),'utf8');
const navStart=hashSource.indexOf('  const nav='),navEnd=hashSource.indexOf('\n',hashSource.indexOf('for(const x of nav)',navStart));
assert.ok(navStart>=0&&navEnd>navStart,'future-routing state must participate in gameplay hash');
c.units=[0];c.w={};c.hashed={};c.MF_SH_indexed=(w,name,array)=>{c.hashed[name]=array[0];};
vm.runInContext(hashSource.slice(navStart,navEnd),c);
assert.equal(Object.keys(c.hashed).length,8);
vm.runInContext('uNavRetryFor[0]=.375;',c);
vm.runInContext('{'+hashSource.slice(navStart,navEnd)+'}',c);
assert.equal(c.hashed.uNavRetryFor,.375,'retry timing is observable to the hash writer');
function firstTickHash(epoch){
  api.mfNavProgressReset();c.mfMoveBlockRevision=epoch;c.hashed={};
  api.mfNavProgressRepath(0,T,100,0,.1,true);
  vm.runInContext('{'+hashSource.slice(navStart,navEnd)+'}',c);
  return {...c.hashed};
}
assert.deepEqual(firstTickHash(1),firstTickHash(99),'local map-cache epoch must not change fresh-match authority hash inputs');

// Execute the actual movement-steering block with controlled surrounding
// simulation inputs. Browser acceptance still owns collision and visual paths.
const steerBegin=source.indexOf('      // flow-field steering for long marches');
const steerEnd=source.indexOf('    // physical separation;',steerBegin);
assert.ok(steerBegin>=0&&steerEnd>steerBegin);
const movement=source.slice(steerBegin,steerEnd).replace(/\n    }\s*$/,'');
function steer({pending=false,stale=false,noDirections=false,engaging=false,direct=false,unreachable=false,state=1,blocker=-1,passable=true,portal=null}) {
  const goalX=new Float32Array([500]),goalY=new Float32Array([20]),states=new Int16Array([state]);
  const field={naval:false,dirs:noDirections?null:new Uint8Array([unreachable?8:2]),pending,rev:stale?0:1};
  const s=vm.createContext({T:{air:false,naval:false},engaging,i:0,gx:500,gy:20,sp:20,distGoal:500,
    mvx:0,mvy:0,moving:false,navRepath:false,mfMoveBlockRevision:1,
    uMoveCohort:new Int16Array([-1]),uPatrolRoute:new Int16Array([-1]),ufield:new Int16Array([0]),
    ux:new Float32Array([0]),uy:new Float32Array([0]),utx:goalX,uty:goalY,ustate:states,
    utgt:new Int16Array([-1]),utgtg:new Int16Array([-1]),umarch:new Int16Array([0]),
    fields:[field],DIRX:[1,1,0],DIRY:[0,1,1],Math,
    mfNavDirectApproachClear:()=>direct,mfNavFieldForMove:()=>field,
    mfMoveFieldFresh:F=>F,ffCell:()=>0,mfNavPass:()=>passable,mfNavSectorWaypoint:()=>portal,
    mfNavFindAttackBlocker:()=>blocker});
  vm.runInContext(movement,s);
  assert.equal(goalX[0],500);assert.equal(goalY[0],20);assert.equal(states[0],state,'route wait must not falsely complete queued order');
  return s;
}
for(const options of [{pending:true},{stale:true}]){
  const s=steer(options);assert.equal(s.mvx,0);assert.equal(s.mvy,20,'published directions remain usable while their refresh is pending');
}
for(const options of [{noDirections:true},{unreachable:true}]){
  const s=steer(options);assert.equal(s.mvx,0);assert.equal(s.mvy,0,'unavailable blocked route waits without pushing');
}
const combat=steer({engaging:true});assert.equal(combat.mvx,0);assert.equal(combat.mvy,20,'combat uses obstacle-aware field direction');
const breach=steer({state:2,unreachable:true,blocker:3});assert.equal(breach.utgt[0],-5,'completed unreachable attack route can target enemy obstruction without losing destination');
const waiting=steer({state:2,pending:true,unreachable:true,blocker:3});assert.equal(waiting.utgt[0],-5,'a completed published unreachable route remains authoritative while its refresh is pending');
const falsePortal=steer({state:2,unreachable:true,blocker:3,portal:{x:100,y:0}});
assert.equal(falsePortal.utgt[0],-5,'coarse portal cannot override completed exact unreachable result');assert.equal(falsePortal.mvx,0);
const outside=steer({unreachable:true,passable:false,portal:{x:100,y:0}});
assert.ok(outside.mvx>0,'outside-clearance spawn retains bounded sector escape steering');
const blockerCode=source.slice(source.indexOf('function mfNavFindAttackBlocker('),source.indexOf('function mfNavAttackClear('));
const bc=vm.createContext({TYPES:[{dmg:5,r:4}],utype:[0],ux:[0],uy:[0],uteam:[0],Math,
  dist2:(a,b,x,y)=>(a-x)**2+(b-y)**2,
  blds:[{alive:true,team:0,prog:1,x:20,y:0,r:8},{alive:false,team:1,prog:1,x:30,y:0,r:8},{alive:true,team:1,prog:1,x:40,y:0,r:8}]});
vm.runInContext(blockerCode+'\nglobalThis.blocker=mfNavFindAttackBlocker;',bc);
assert.equal(bc.blocker(0,100,0),2,'real unit blocker API returns numeric enemy index, ignoring friendly/dead buildings');
bc.blds[2].team=0;assert.equal(bc.blocker(0,100,0),-1);
const clear=steer({pending:true,direct:true});assert.ok(Math.hypot(clear.mvx,clear.mvy)>0,'verified clear local approach may continue while rebuilding');
const rallyCode=source.slice(source.indexOf('function mfFactoryRallyGoal('),source.indexOf('function bldTick('));
assert.ok(rallyCode.length>0,'production rally resolver must exist');
const r=vm.createContext({MAP:1000,Math,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
  mfSimRange:()=>{throw new Error('explicit rally must not consume random scatter');},
  findLand:(x,y)=>[x+1,y+1],findWater:(x,y)=>[x+2,y+2]});
vm.runInContext(rallyCode+'\nglobalThis.rally=mfFactoryRallyGoal;',r);
const factory={team:0,rally:{x:250,y:300}};
assert.deepEqual(Array.from(r.rally(factory,{air:true},0,0)),[250,300],'air rally preserves marker without land projection');
assert.deepEqual(Array.from(r.rally(factory,{},0,0)),[251,301],'ground medium projection receives exact marker');
assert.deepEqual(Array.from(r.rally(factory,{naval:true},0,0)),[252,302],'naval projection receives exact marker');
r.findWater=()=>null;assert.deepEqual(Array.from(r.rally(factory,{naval:true},10,15)),[10,15],'unavailable water does not create invalid rally endpoint');
console.log('PASS navigation progress, deferred retry, combat routing, pending/unreachable goal preservation (source-block contract; not full battle acceptance)');
