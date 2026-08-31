#!/usr/bin/env node
/* Direct deterministic probe for the classic-global job-board module. The
   module is evaluated in isolation and its required pre-sim load order is
   verified against both source manifests. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=await readFile(resolve(root,'src/game/utilityjobs.js'),'utf8');
const boot=await readFile(resolve(root,'boot.js'),'utf8');
const manifest=JSON.parse(await readFile(resolve(root,'assets/data/manifest.json'),'utf8'));
const bootUtility=boot.indexOf("'./src/game/utilityjobs.js'");
const bootSim=boot.indexOf("'./src/game/sim.js'");
const manifestUtility=manifest.order.indexOf('src/game/utilityjobs.js');
const manifestSim=manifest.order.indexOf('src/game/sim.js');
assert(bootUtility>=0&&bootUtility<bootSim,'boot.js must load utilityjobs.js before sim.js');
assert(manifestUtility>=0&&manifestUtility<manifestSim,'manifest must load utilityjobs.js before sim.js');
const sandbox={console};sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.runInContext(source,vm.createContext(sandbox),{filename:'src/game/utilityjobs.js'});
const K=sandbox.MF_UTILITY_JOB_KIND;
const requiredKinds=['repair-unit','repair-structure','construction-assist','production-assist','salvage','mining','survey','escort','return'];
assert.deepEqual(Array.from(Object.values(K)).sort(),requiredKinds.slice().sort(),'all required job kinds must exist');

const generation=new Map();
const sourceGeneration=(kind,id)=>generation.get(kind+':'+id);
const targetGenerationMap=new Map();
const targetGeneration=(kind,id)=>targetGenerationMap.get(kind+':'+id);
const targetOwners=new Map(),targetAuthority=(kind,id)=>targetOwners.get(kind+':'+id)||{};
const sourceRef=(id,gen=1)=>{generation.set('building:'+id,gen);return {kind:'building',id,generation:gen};};
const targetRef=id=>({kind:'entity',id});
const spec=(kind,id,priority,x,capacity=1)=>({kind,source:sourceRef('src-'+id),target:targetRef(id),priority,x,y:0,capacity});

const board=sandbox.mfUtilityJobBoardCreate({maxJobs:16,maxSearch:16,defaultLeaseTicks:3,sourceGeneration});
const low=sandbox.mfUtilityJobPublish(board,spec(K.REPAIR_UNIT,'low',4,2));
const high=sandbox.mfUtilityJobPublish(board,spec(K.REPAIR_STRUCTURE,'high',8,200));
const near=sandbox.mfUtilityJobPublish(board,spec(K.REPAIR_STRUCTURE,'near',8,20));
assert(low.ok&&high.ok&&near.ok);
const worker={kind:'unit',id:7,generation:2,x:0,y:0};
const priorityClaim=sandbox.mfUtilityJobClaim(board,worker,{nowTick:0,leaseTicks:3});
assert.equal(priorityClaim.jobId,near.id,'priority ties must resolve by distance');
assert(sandbox.mfUtilityJobRelease(board,worker,near.id));
sandbox.mfUtilityJobRemove(board,near.id);
const highPriorityClaim=sandbox.mfUtilityJobClaim(board,worker,{nowTick:0,leaseTicks:3});
assert.equal(highPriorityClaim.jobId,high.id,'priority must outrank distance');

const leaseBefore=sandbox.mfUtilityJobAdvance(board,2);
assert.equal(leaseBefore.expired,0);assert.equal(sandbox.mfUtilityJobActiveClaims(board,high.id),1);
const leaseAt=sandbox.mfUtilityJobAdvance(board,3);
assert.equal(leaseAt.expired,1);assert.equal(sandbox.mfUtilityJobActiveClaims(board,high.id),0);

const renewBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,defaultLeaseTicks:3,sourceGeneration});
const renewJob=sandbox.mfUtilityJobPublish(renewBoard,spec(K.REPAIR_UNIT,'renew',4,3));
const renewWorker={kind:'unit',id:71,generation:2,x:0,y:0};
assert(sandbox.mfUtilityJobClaim(renewBoard,renewWorker,{nowTick:0,leaseTicks:3}).ok);
const renewed=sandbox.mfUtilityJobRenew(renewBoard,renewWorker,renewJob.id,2,4);
assert.equal(renewed.expiresAt,6,'renewal must extend from the authoritative board tick');
assert.equal(sandbox.mfUtilityJobAdvance(renewBoard,3).expired,0,'renewed claim must survive its original expiry');
assert.equal(sandbox.mfUtilityJobAdvance(renewBoard,6).expired,1,'renewed claim must expire at the extended lease');

const staleBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,defaultLeaseTicks:8,sourceGeneration});
const staleSpec=spec(K.SALVAGE,'wreck-1',9,4),stale=sandbox.mfUtilityJobPublish(staleBoard,staleSpec);
const staleWorker={kind:'unit',id:8,generation:1,x:0,y:0};
assert(sandbox.mfUtilityJobClaim(staleBoard,staleWorker,{nowTick:0}).ok);
generation.set('building:src-wreck-1',2);
const staleRenew=sandbox.mfUtilityJobRenew(staleBoard,staleWorker,stale.id,1,8);
assert.equal(staleRenew.reason,'source-generation-mismatch');
assert.equal(sandbox.mfUtilityJobGet(staleBoard,stale.id),null);

/* Target slots recycle just like worker/source slots. A claim to unit 12 gen 4
   must not silently become a claim to the unrelated gen-5 occupant. */
const staleTargetBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,defaultLeaseTicks:8,
  sourceGeneration,targetGeneration});
const targetSource=sourceRef('target-owner',1);
targetGenerationMap.set('unit:12',4);
const staleTarget=sandbox.mfUtilityJobPublish(staleTargetBoard,{kind:K.REPAIR_UNIT,source:targetSource,
  target:{kind:'unit',id:12,generation:4},priority:6,x:10,y:8,capacity:1});
assert(staleTarget.ok);
const targetWorker={kind:'unit',id:81,generation:1,x:0,y:0};
assert(sandbox.mfUtilityJobClaim(staleTargetBoard,targetWorker,{nowTick:0}).ok);
targetGenerationMap.set('unit:12',5);
const staleTargetAdvance=sandbox.mfUtilityJobAdvance(staleTargetBoard,1);
assert.equal(staleTargetAdvance.stale,1,'target generation mismatch must retire the job and its claim');
assert.equal(sandbox.mfUtilityJobGet(staleTargetBoard,staleTarget.id),null);

const captureBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,sourceGeneration,targetGeneration,targetAuthority});
targetGenerationMap.set('unit:captured',1);targetOwners.set('unit:captured',{team:0,seat:-1});
const captureJob=sandbox.mfUtilityJobPublish(captureBoard,{kind:K.REPAIR_UNIT,source:sourceRef('capture-owner'),
  target:{kind:'unit',id:'captured',generation:1,team:0,seat:-1},priority:9,x:2,y:0,capacity:1});
const captureWorker={kind:'unit',id:82,generation:1,x:0,y:0,kinds:[K.REPAIR_UNIT],seat:-1,medium:'land'};
assert(sandbox.mfUtilityJobClaim(captureBoard,captureWorker,{nowTick:0,kinds:captureWorker.kinds,maxDistance2:100}).ok);
targetOwners.set('unit:captured',{team:1,seat:0});
assert.equal(sandbox.mfUtilityJobAdvance(captureBoard,1).stale,1,'capture/transfer must invalidate old owner job');

const invariantBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,sourceGeneration});
const invariantJob=sandbox.mfUtilityJobPublish(invariantBoard,{...spec(K.MINING,'renew-invariants',5,8),seat:0,medium:'land'});
const invariantWorker={kind:'unit',id:83,generation:1,x:0,y:0,kinds:[K.MINING],seat:0,medium:'land'};
assert(sandbox.mfUtilityJobClaim(invariantBoard,invariantWorker,{nowTick:0,kinds:[K.MINING],maxDistance2:100}).ok);
invariantWorker.medium='water';
assert.equal(sandbox.mfUtilityJobRenew(invariantBoard,invariantWorker,invariantJob.id,1,8,
  {kinds:[K.MINING],maxDistance2:100,acceptJob:()=>true}).reason,'medium-changed',
  'renewal must reapply current medium');

const manualBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,sourceGeneration});
const manualJob=sandbox.mfUtilityJobPublish(manualBoard,spec(K.MINING,'ore-1',2,2));
const manualWorker={kind:'unit',id:9,generation:3,x:0,y:0};
sandbox.mfUtilityJobSetManualOverride(manualBoard,manualWorker,true);
assert.equal(sandbox.mfUtilityJobClaim(manualBoard,manualWorker,{nowTick:0}).reason,'manual-override');
sandbox.mfUtilityJobSetManualOverride(manualBoard,manualWorker,false);
assert(sandbox.mfUtilityJobClaim(manualBoard,manualWorker,{nowTick:0}).ok);
sandbox.mfUtilityJobSetManualOverride(manualBoard,manualWorker,true);
assert.equal(sandbox.mfUtilityJobActiveClaims(manualBoard,manualJob.id),0,'manual command must release automatic claim');

const recycledManualBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:4,maxSearch:4,sourceGeneration});
const recycledManualJob=sandbox.mfUtilityJobPublish(recycledManualBoard,spec(K.RETURN,'manual-recycle',3,1));
const recycledOld={kind:'unit',id:91,generation:4,x:0,y:0};
assert(sandbox.mfUtilityJobClaim(recycledManualBoard,recycledOld,{nowTick:0}).ok);
const recycledNew={kind:'unit',id:91,generation:5,x:0,y:0};
sandbox.mfUtilityJobSetManualOverride(recycledManualBoard,recycledNew,true);
assert.equal(sandbox.mfUtilityJobActiveClaims(recycledManualBoard,recycledManualJob.id),0,
  'manual override on a recycled identity must release the prior generation claim');

const bounded=sandbox.mfUtilityJobBoardCreate({maxJobs:3,maxSearch:2,sourceGeneration});
assert(sandbox.mfUtilityJobPublish(bounded,spec(K.REPAIR_UNIT,'bound-a',9,1)).ok);
assert(sandbox.mfUtilityJobPublish(bounded,spec(K.REPAIR_STRUCTURE,'bound-b',8,1)).ok);
assert(sandbox.mfUtilityJobPublish(bounded,spec(K.SURVEY,'bound-c',7,1)).ok);
assert.equal(sandbox.mfUtilityJobPublish(bounded,spec(K.RETURN,'bound-d',6,1)).reason,'board-capacity');
const boundedClaim=sandbox.mfUtilityJobClaim(bounded,{kind:'unit',id:10,generation:1,x:0,y:0,kinds:[K.SURVEY]},{nowTick:0});
assert(boundedClaim.scanned<=2,'search must stop at configured bound');
const boundedRetry=boundedClaim.ok?boundedClaim:
  sandbox.mfUtilityJobClaim(bounded,{kind:'unit',id:10,generation:1,x:0,y:0,kinds:[K.SURVEY]},{nowTick:1});
assert.equal(boundedRetry.jobId,sandbox.mfUtilityJobStableId(spec(K.SURVEY,'bound-c',7,1)),
  'bounded windows must advance deterministically so an eligible tail job cannot starve forever');
assert(boundedRetry.scanned<=2,'rotating bounded search must retain the hard scan cap');

const capacity=sandbox.mfUtilityJobBoardCreate({maxJobs:2,maxSearch:2,sourceGeneration});
const shared=sandbox.mfUtilityJobPublish(capacity,spec(K.CONSTRUCTION_ASSIST,'build-1',3,0,2));
for(let id=20;id<22;id++)assert(sandbox.mfUtilityJobClaim(capacity,{kind:'unit',id,generation:1,x:0,y:0},{nowTick:0}).ok);
assert.equal(sandbox.mfUtilityJobClaim(capacity,{kind:'unit',id:22,generation:1,x:0,y:0},{nowTick:0}).reason,'no-job');
assert.equal(sandbox.mfUtilityJobActiveClaims(capacity,shared.id),2);

const saturated=sandbox.mfUtilityJobBoardCreate({maxJobs:2,maxSearch:2,sourceGeneration});
const claimedLow=sandbox.mfUtilityJobPublish(saturated,spec(K.RETURN,'sat-claimed',1,1));
const freeLow=sandbox.mfUtilityJobPublish(saturated,spec(K.SURVEY,'sat-free',2,2));
const satWorker={kind:'unit',id:70,generation:1,x:1,y:1,kinds:[K.RETURN]};
assert(sandbox.mfUtilityJobClaim(saturated,satWorker,{nowTick:0}).ok);
const urgent=sandbox.mfUtilityJobPublish(saturated,spec(K.REPAIR_STRUCTURE,'sat-urgent',100,3));
assert.equal(urgent.evicted,freeLow.id,'urgent publish must evict lowest-priority unclaimed work');
assert(sandbox.mfUtilityJobGet(saturated,claimedLow.id),'claimed work must survive eviction');
const urgentWorker={kind:'unit',id:71,generation:1,x:3,y:3,kinds:[K.REPAIR_STRUCTURE]};
assert(sandbox.mfUtilityJobClaim(saturated,urgentWorker,{nowTick:0}).ok);
assert.equal(sandbox.mfUtilityJobPublish(saturated,spec(K.CONSTRUCTION_ASSIST,'sat-blocked',200,4)).reason,
  'board-capacity','a full claimed board must reject even higher-priority work');

const filterBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:8,maxSearch:8,sourceGeneration});
const seatJob=sandbox.mfUtilityJobPublish(filterBoard,{...spec(K.MINING,'seat-job',10,0),seat:1,medium:'land'});
const waterJob=sandbox.mfUtilityJobPublish(filterBoard,{...spec(K.MINING,'water-job',9,0),seat:0,medium:'water'});
const farJob=sandbox.mfUtilityJobPublish(filterBoard,{...spec(K.MINING,'far-job',8,5000),seat:0,medium:'land',x:5000,y:0});
const filtered=sandbox.mfUtilityJobClaim(filterBoard,{kind:'unit',id:80,generation:1,x:0,y:0,kinds:[K.MINING],seat:0,medium:'land'},
  {nowTick:0,maxDistance2:1000*1000,acceptJob:job=>job.id!==farJob.id});
assert.equal(filtered.reason,'no-job','wrong-seat, wrong-medium, remote/unreachable jobs must be rejected');

const windowBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:8,maxSearch:1,sourceGeneration});
for(let n=0;n<8;n++)sandbox.mfUtilityJobPublish(windowBoard,spec(K.RETURN,'window-'+n,1,n));
const firstWindows=new Set();
for(let n=0;n<12;n++){
  const w={kind:'unit',id:90+n,generation:1,x:0,y:0,kinds:[K.RETURN]};
  const c=sandbox.mfUtilityJobClaim(windowBoard,w,{nowTick:0});if(c.ok)firstWindows.add(c.jobId);
}
assert(firstWindows.size>1,'new worker identities must not all begin at slot zero');

const coverageBoard=sandbox.mfUtilityJobBoardCreate({maxJobs:80,maxSearch:48,sourceGeneration});
for(let n=0;n<64;n++)sandbox.mfUtilityJobPublish(coverageBoard,spec(n===63?K.SURVEY:K.RETURN,'coverage-'+n,1,n));
const coverageWorker={kind:'unit',id:333,generation:1,x:0,y:0,kinds:[K.SURVEY]};let coverage=null,coverageScans=0;
for(let attempt=0;attempt<3&&!coverage?.ok;attempt++){
  coverage=sandbox.mfUtilityJobClaim(coverageBoard,coverageWorker,{nowTick:attempt,kinds:[K.SURVEY],searchLimit:48});
  coverageScans+=coverage.scanned||0;
}
assert(coverage?.ok&&coverage.jobId.includes('coverage-63'),'>48 candidates must receive deterministic eventual coverage');
assert(coverageScans<=96,'64-candidate coverage must remain bounded to two 48-job windows');

const kindClaims={};
for(let index=0;index<requiredKinds.length;index++){
  const kind=requiredKinds[index],B=sandbox.mfUtilityJobBoardCreate({maxJobs:2,maxSearch:2,sourceGeneration});
  const job=sandbox.mfUtilityJobPublish(B,spec(kind,'kind-'+index,2,index));
  const claim=sandbox.mfUtilityJobClaim(B,{kind:'unit',id:100+index,generation:1,x:0,y:0,kinds:[kind]},{nowTick:0});
  assert.equal(claim.jobId,job.id,`required job kind ${kind} must be claimable`);
  kindClaims[kind]=claim.jobId;
}

const assists=[0,1,2,3].map(index=>sandbox.mfUtilityJobAssistMultiplier(index));
assert.deepEqual(assists,[1,2/3,.5,.4]);
assert(assists.every((value,index)=>index===0||value<assists[index-1]));
const assistTotals=[1,2,3,4].map(count=>sandbox.mfUtilityJobAssistTotal(count));
assert(assistTotals[3]-assistTotals[2]<assistTotals[1]-assistTotals[0]);

function repeatScenario(reverse){
  const localGeneration=new Map(),generationOf=(kind,id)=>localGeneration.get(kind+':'+id);
  const B=sandbox.mfUtilityJobBoardCreate({maxJobs:12,maxSearch:12,defaultLeaseTicks:5,sourceGeneration:generationOf});
  const jobs=requiredKinds.map((kind,index)=>{
    localGeneration.set('fixture:s'+index,4);
    return {kind,source:{kind:'fixture',id:'s'+index,generation:4},target:{kind:'fixture-target',id:'t'+index},
      priority:index%3,x:index*7,y:index*5,capacity:index===2?2:1};
  });
  for(const job of reverse?jobs.slice().reverse():jobs)assert(sandbox.mfUtilityJobPublish(B,job).ok);
  for(let id=0;id<4;id++)sandbox.mfUtilityJobClaim(B,{kind:'unit',id,generation:1,x:id*9,y:id*3},{nowTick:1});
  const snap=sandbox.mfUtilityJobSnapshot(B);snap.stats.published=0;
  return createHash('sha256').update(JSON.stringify(snap)).digest('hex');
}
const repeatHash=repeatScenario(false),reverseHash=repeatScenario(true);
assert.equal(repeatHash,reverseHash,'publication order must not change deterministic snapshot/claims');

const report={result:'PASS',module:'src/game/utilityjobs.js',manifestWired:true,
  loadOrder:{boot:{utility:bootUtility,sim:bootSim},manifest:{utility:manifestUtility,sim:manifestSim}},requiredKinds,
  priorityDistance:{nearWinner:priorityClaim.jobId,priorityWinner:highPriorityClaim.jobId},
  lease:{beforeExpiry:leaseBefore,atExpiry:leaseAt,renewed},generationMismatch:staleRenew.reason,
  targetGenerationMismatch:staleTargetAdvance,kindClaims,
  manualOverride:'PASS',recycledManualOverride:'PASS',
  bounded:{capacity:'PASS',firstScan:boundedClaim.scanned,retryScan:boundedRetry.scanned,
    retryWinner:boundedRetry.jobId,maxSearch:bounded.maxSearch},
  claimCapacity:sandbox.mfUtilityJobActiveClaims(capacity,shared.id),
  saturation:{evicted:urgent.evicted,claimedSurvived:!!sandbox.mfUtilityJobGet(saturated,claimedLow.id),
    claimedBoardReject:'board-capacity'},filters:'PASS',targetCaptureInvalidation:'PASS',renewalInvariants:'PASS',
  initialWindows:firstWindows.size,coverage:{candidates:64,scans:coverageScans},assists,assistTotals,repeatHash};
console.log(JSON.stringify(report,null,2));
