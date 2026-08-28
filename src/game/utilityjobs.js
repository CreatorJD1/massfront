/* Deterministic utility-job board foundation.
   This file intentionally has no sim consumers yet. It owns scheduling policy,
   not repair/mining/salvage effects, so integration can happen one authority at
   a time without changing saves or replay commands. */
;(function(root){
  'use strict';

  const KINDS=Object.freeze({
    REPAIR_UNIT:'repair-unit',REPAIR_STRUCTURE:'repair-structure',
    CONSTRUCTION_ASSIST:'construction-assist',PRODUCTION_ASSIST:'production-assist',
    SALVAGE:'salvage',MINING:'mining',SURVEY:'survey',ESCORT:'escort',RETURN:'return'
  });
  const KIND_SET=new Set(Object.values(KINDS));
  const BOARD_TAG='MassfrontUtilityJobBoardV1';
  const clampInt=(value,lo,hi,fallback)=>{
    const n=Number(value);return Number.isFinite(n)?Math.max(lo,Math.min(hi,Math.floor(n))):fallback;
  };
  const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const atom=value=>encodeURIComponent(String(value===undefined||value===null?'':value));
  const sourceOf=spec=>spec&&spec.source||{};
  const targetOf=spec=>spec&&spec.target||{};
  const workerIdentity=worker=>atom(worker&&worker.kind||'unit')+'|'+atom(worker&&worker.id);
  const workerKey=worker=>workerIdentity(worker)+'|'+clampInt(worker&&worker.generation,0,0x7fffffff,0);
  const hashIdentity=value=>{
    const s=String(value);let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  };

  function mfUtilityJobStableId(spec){
    const source=sourceOf(spec),target=targetOf(spec);
    return ['uj1',spec&&spec.kind,source.kind,source.id,
      clampInt(source.generation,0,0x7fffffff,0),target.kind,target.id,
      clampInt(target.generation,0,0x7fffffff,0),target.team,target.seat].map(atom).join('|');
  }
  function boardOk(board){return !!board&&board.schema===BOARD_TAG&&board.jobs instanceof Map;}
  function sourceValid(board,job){
    if(typeof board.sourceGeneration!=='function')return true;
    try{
      const actual=board.sourceGeneration(job.sourceKind,job.sourceId);
      return Number.isFinite(Number(actual))&&Math.floor(Number(actual))===job.sourceGeneration;
    }catch(_){return false;}
  }
  function targetValid(board,job){
    if(typeof board.targetGeneration!=='function')return true;
    try{
      const actual=board.targetGeneration(job.targetKind,job.targetId);
      if(!Number.isFinite(Number(actual))||Math.floor(Number(actual))!==job.targetGeneration)return false;
      if(typeof board.targetAuthority==='function'){
        const owner=board.targetAuthority(job.targetKind,job.targetId)||{};
        if(job.targetTeam!=null&&Number(owner.team)!==job.targetTeam)return false;
        if(job.targetSeat!=null&&Number(owner.seat)!==job.targetSeat)return false;
      }
      return true;
    }catch(_){return false;}
  }
  function jobOrder(a,b){return b.priority-a.priority||(a.id<b.id?-1:a.id>b.id?1:0);}
  function orderInsert(board,id){
    const job=board.jobs.get(id);let lo=0,hi=board.order.length;
    while(lo<hi){const mid=(lo+hi)>>1,other=board.jobs.get(board.order[mid]);if(jobOrder(job,other)<0)hi=mid;else lo=mid+1;}
    board.order.splice(lo,0,id);
  }
  function orderRemove(board,id){const at=board.order.indexOf(id);if(at>=0)board.order.splice(at,1);}
  function claimDrop(board,key){
    const claim=board.claims.get(key);if(!claim)return false;
    board.claims.delete(key);
    const count=board.claimCounts.get(claim.jobId)||0;
    if(count<=1)board.claimCounts.delete(claim.jobId);else board.claimCounts.set(claim.jobId,count-1);
    return true;
  }
  function jobDrop(board,id){
    if(!board.jobs.has(id))return false;
    board.jobs.delete(id);orderRemove(board,id);
    for(const [key,claim] of board.claims)if(claim.jobId===id)claimDrop(board,key);
    board.claimCounts.delete(id);return true;
  }
  function moveClock(board,tick){board.nowTick=Math.max(board.nowTick,clampInt(tick,0,0x7fffffff,board.nowTick));return board.nowTick;}

  function mfUtilityJobBoardCreate(options){
    const opts=options||{},maxJobs=clampInt(opts.maxJobs,1,4096,256);
    return {schema:BOARD_TAG,maxJobs,maxSearch:clampInt(opts.maxSearch,1,maxJobs,Math.min(64,maxJobs)),
      defaultLeaseTicks:clampInt(opts.defaultLeaseTicks,1,36000,90),nowTick:0,
      sourceGeneration:typeof opts.sourceGeneration==='function'?opts.sourceGeneration:null,
      targetGeneration:typeof opts.targetGeneration==='function'?opts.targetGeneration:null,
      targetAuthority:typeof opts.targetAuthority==='function'?opts.targetAuthority:null,
      jobs:new Map(),order:[],claims:new Map(),claimCounts:new Map(),manual:new Map(),searchCursor:new Map(),
      stats:{published:0,removed:0,claims:0,releases:0,renewals:0,expired:0,stale:0,
        capacityRejects:0,evictions:0,lastScan:0,scanWork:0,maxObservedScan:0}};
  }
  function mfUtilityJobPublish(board,spec){
    if(!boardOk(board))return {ok:false,reason:'invalid-board'};
    if(!spec||!KIND_SET.has(spec.kind))return {ok:false,reason:'invalid-kind'};
    const source=sourceOf(spec),target=targetOf(spec);
    if(source.id===undefined||target.id===undefined)return {ok:false,reason:'missing-identity'};
    /* IDs are derived, never caller-selected. A mutable/custom ID would let two
       producers alias the same job and make claim order depend on call order. */
    const id=mfUtilityJobStableId(spec);
    const job={id,kind:spec.kind,sourceKind:String(source.kind||'source'),sourceId:String(source.id),
      sourceGeneration:clampInt(source.generation,0,0x7fffffff,0),targetKind:String(target.kind||'target'),
      targetId:String(target.id),targetGeneration:clampInt(target.generation,0,0x7fffffff,0),
      targetTeam:target.team==null?null:clampInt(target.team,0,255,0),
      targetSeat:target.seat==null?null:clampInt(target.seat,-1,255,-1),
      x:finite(spec.x,finite(target.x,0)),y:finite(spec.y,finite(target.y,0)),
      priority:clampInt(spec.priority,-32768,32767,0),capacity:clampInt(spec.capacity,1,16,1),
      seat:spec.seat==null?null:clampInt(spec.seat,-1,255,-1),medium:String(spec.medium||'any')};
    if(!sourceValid(board,job))return {ok:false,reason:'source-generation-mismatch',id};
    if(!targetValid(board,job))return {ok:false,reason:'target-generation-mismatch',id};
    const old=board.jobs.get(id),active=board.claimCounts.get(id)||0;
    if(old&&job.capacity<active)return {ok:false,reason:'capacity-below-claims',id};
    let evicted=null;
    if(!old&&board.jobs.size>=board.maxJobs){
      /* Only strictly lower-priority, unclaimed work can be displaced. */
      for(const candidate of board.jobs.values()){
        if((board.claimCounts.get(candidate.id)||0)>0||candidate.priority>=job.priority)continue;
        if(!evicted||candidate.priority<evicted.priority||
           (candidate.priority===evicted.priority&&candidate.id>evicted.id))evicted=candidate;
      }
      if(!evicted){board.stats.capacityRejects++;return {ok:false,reason:'board-capacity',id};}
      jobDrop(board,evicted.id);board.stats.evictions++;
    }
    /* Position/progress refreshes dominate live publishing. Preserve the
       sorted slot when scheduling keys did not change instead of doing an
       O(n) remove/reinsert every 15 ticks. */
    if(old&&old.priority!==job.priority)orderRemove(board,id);
    board.jobs.set(id,job);
    if(!old||old.priority!==job.priority)orderInsert(board,id);
    board.stats.published++;
    return {ok:true,id,created:!old,evicted:evicted&&evicted.id||null};
  }
  function mfUtilityJobRemove(board,id){
    if(!boardOk(board))return false;
    const removed=jobDrop(board,String(id));if(removed)board.stats.removed++;return removed;
  }
  function mfUtilityJobAdvance(board,tick){
    if(!boardOk(board))return {ok:false,reason:'invalid-board'};
    const now=moveClock(board,tick);let expired=0,stale=0;
    for(const [key,claim] of Array.from(board.claims.entries()))if(claim.expiresAt<=now){claimDrop(board,key);expired++;}
    for(const id of board.order.slice()){
      const job=board.jobs.get(id);if(job&&(!sourceValid(board,job)||!targetValid(board,job))){jobDrop(board,id);stale++;}
    }
    board.stats.expired+=expired;board.stats.stale+=stale;
    return {ok:true,nowTick:now,expired,stale};
  }
  function mfUtilityJobSetManualOverride(board,worker,active){
    if(!boardOk(board)||!worker||worker.id===undefined)return {ok:false,reason:'invalid-worker'};
    const identity=workerIdentity(worker),generation=clampInt(worker.generation,0,0x7fffffff,0);
    if(active){
      board.manual.set(identity,generation);
      /* A recycled slot has the same stable identity but a new worker key.
         Manual control must release the prior generation's lease immediately
         instead of consuming capacity until its timeout. */
      for(const [key,claim] of Array.from(board.claims.entries()))
        if(claim.workerIdentity===identity)claimDrop(board,key);
    }
    else if(board.manual.get(identity)===generation)board.manual.delete(identity);
    return {ok:true,active:!!active};
  }
  function manualActive(board,worker){
    return !!(worker&&worker.manualOverride)||board.manual.get(workerIdentity(worker))===clampInt(worker&&worker.generation,0,0x7fffffff,0);
  }
  function mfUtilityJobClaim(board,worker,options){
    if(!boardOk(board))return {ok:false,reason:'invalid-board'};
    if(!worker||worker.id===undefined)return {ok:false,reason:'invalid-worker'};
    const opts=options||{},now=moveClock(board,opts.nowTick),key=workerKey(worker),identity=workerIdentity(worker);
    mfUtilityJobAdvance(board,now);
    for(const [otherKey,claim] of Array.from(board.claims.entries()))if(claim.workerIdentity===identity&&otherKey!==key)claimDrop(board,otherKey);
    if(manualActive(board,worker))return {ok:false,reason:'manual-override',scanned:0};
    const leaseTicks=clampInt(opts.leaseTicks,1,36000,board.defaultLeaseTicks),existing=board.claims.get(key);
    if(existing&&board.jobs.has(existing.jobId)){
      const renewed=mfUtilityJobRenew(board,worker,existing.jobId,now,leaseTicks,opts);
      return renewed.ok?{...renewed,existing:true,scanned:0}:renewed;
    }
    const allowed=opts.kinds||worker.kinds,kindSet=Array.isArray(allowed)?new Set(allowed):null;
    const limit=clampInt(opts.searchLimit,1,board.maxSearch,board.maxSearch),wx=finite(worker.x,0),wy=finite(worker.y,0);
    const workerSeat=worker.seat==null?null:clampInt(worker.seat,-1,255,-1),workerMedium=String(worker.medium||'any');
    const maxDistance2=Number.isFinite(Number(opts.maxDistance2))?Math.max(0,Number(opts.maxDistance2)):Infinity;
    const accept=typeof opts.acceptJob==='function'?opts.acceptJob:null;
    let best=null,bestD=Infinity,scanned=0;
    const count=board.order.length,prior=board.searchCursor.get(identity);
    const start=count?((prior==null?hashIdentity(identity):prior)%count):0;
    for(let step=0;step<count&&scanned<limit;step++){
      const id=board.order[(start+step)%count];scanned++;
      const job=board.jobs.get(id);if(!job||!sourceValid(board,job)||!targetValid(board,job))continue;
      if(kindSet&&!kindSet.has(job.kind))continue;
      if(job.seat!=null&&workerSeat!==job.seat)continue;
      if(job.medium!=='any'&&workerMedium!=='any'&&job.medium!==workerMedium)continue;
      if((board.claimCounts.get(id)||0)>=job.capacity)continue;
      const dx=job.x-wx,dy=job.y-wy,d=dx*dx+dy*dy;
      if(d>maxDistance2)continue;
      if(accept){let ok=false;try{ok=accept(job,worker)!==false;}catch(_){ok=false;}if(!ok)continue;}
      if(!best||job.priority>best.priority||(job.priority===best.priority&&(d<bestD||(d===bestD&&job.id<best.id)))){best=job;bestD=d;}
    }
    /* A hard window may contain only incompatible/full jobs. Advance per
       stable worker identity so repeated bounded searches eventually inspect
       every deterministic priority-ordered slice instead of starving the tail. */
    if(count)board.searchCursor.set(identity,(start+scanned)%count);
    board.stats.lastScan=scanned;board.stats.scanWork+=scanned;
    board.stats.maxObservedScan=Math.max(board.stats.maxObservedScan,scanned);
    if(!best)return {ok:false,reason:'no-job',scanned};
    const claim={workerKey:key,workerIdentity:identity,workerId:String(worker.id),
      workerGeneration:clampInt(worker.generation,0,0x7fffffff,0),
      workerSeat,workerMedium,
      jobId:best.id,claimedAt:now,expiresAt:now+leaseTicks};
    board.claims.set(key,claim);board.claimCounts.set(best.id,(board.claimCounts.get(best.id)||0)+1);board.stats.claims++;
    return {ok:true,jobId:best.id,expiresAt:claim.expiresAt,existing:false,scanned,distance2:bestD};
  }
  function mfUtilityJobRenew(board,worker,jobId,tick,leaseTicks,options){
    if(!boardOk(board)||!worker||worker.id===undefined)return {ok:false,reason:'invalid-worker'};
    const now=moveClock(board,tick),key=workerKey(worker),claim=board.claims.get(key);
    if(!claim||claim.jobId!==String(jobId))return {ok:false,reason:'no-claim'};
    if(manualActive(board,worker)){claimDrop(board,key);return {ok:false,reason:'manual-override'};}
    if(claim.expiresAt<=now){claimDrop(board,key);board.stats.expired++;return {ok:false,reason:'lease-expired'};}
    const job=board.jobs.get(claim.jobId);
    if(!job)return {ok:false,reason:'job-missing'};
    if(!sourceValid(board,job)){jobDrop(board,job.id);board.stats.stale++;return {ok:false,reason:'source-generation-mismatch'};}
    if(!targetValid(board,job)){jobDrop(board,job.id);board.stats.stale++;return {ok:false,reason:'target-generation-mismatch'};}
    const opts=options||{},allowed=opts.kinds||worker.kinds,kindSet=Array.isArray(allowed)?new Set(allowed):null;
    const workerSeat=worker.seat==null?null:clampInt(worker.seat,-1,255,-1),workerMedium=String(worker.medium||'any');
    if(kindSet&&!kindSet.has(job.kind)){claimDrop(board,key);return {ok:false,reason:'kind-changed'};}
    if(job.seat!=null&&workerSeat!==job.seat){claimDrop(board,key);return {ok:false,reason:'seat-changed'};}
    if(job.medium!=='any'&&workerMedium!=='any'&&job.medium!==workerMedium){claimDrop(board,key);return {ok:false,reason:'medium-changed'};}
    const maxDistance2=Number.isFinite(Number(opts.maxDistance2))?Math.max(0,Number(opts.maxDistance2)):Infinity;
    const dx=job.x-finite(worker.x,0),dy=job.y-finite(worker.y,0);
    if(dx*dx+dy*dy>maxDistance2){claimDrop(board,key);return {ok:false,reason:'distance-changed'};}
    if(typeof opts.acceptJob==='function'){
      let ok=false;try{ok=opts.acceptJob(job,worker)!==false;}catch(_){ok=false;}
      if(!ok){claimDrop(board,key);return {ok:false,reason:'route-changed'};}
    }
    claim.workerSeat=workerSeat;claim.workerMedium=workerMedium;
    claim.expiresAt=now+clampInt(leaseTicks,1,36000,board.defaultLeaseTicks);board.stats.renewals++;
    return {ok:true,jobId:claim.jobId,expiresAt:claim.expiresAt};
  }
  function mfUtilityJobRelease(board,worker,jobId){
    if(!boardOk(board)||!worker||worker.id===undefined)return false;
    const key=workerKey(worker),claim=board.claims.get(key);
    if(!claim||(jobId!==undefined&&claim.jobId!==String(jobId)))return false;
    const released=claimDrop(board,key);if(released)board.stats.releases++;return released;
  }
  function mfUtilityJobGet(board,id){return boardOk(board)?board.jobs.get(String(id))||null:null;}
  function mfUtilityJobActiveClaims(board,id){return boardOk(board)?board.claimCounts.get(String(id))||0:0;}
  function mfUtilityJobClaimForWorker(board,worker){
    if(!boardOk(board)||!worker||worker.id===undefined)return null;
    const claim=board.claims.get(workerKey(worker));return claim?{...claim}:null;
  }
  function mfUtilityJobClaims(board,id){
    if(!boardOk(board))return [];
    const want=id==null?null:String(id),out=[];
    for(const claim of board.claims.values())if(want==null||claim.jobId===want)out.push({...claim});
    return out.sort((a,b)=>a.workerKey<b.workerKey?-1:a.workerKey>b.workerKey?1:0);
  }
  function mfUtilityJobAssistMultiplier(ordinal,falloff){
    const n=clampInt(ordinal,0,1024,0),f=Math.max(0,finite(falloff,.5));return 1/(1+n*f);
  }
  function mfUtilityJobAssistTotal(count,falloff){
    const n=clampInt(count,0,1024,0);let total=0;for(let i=0;i<n;i++)total+=mfUtilityJobAssistMultiplier(i,falloff);return total;
  }
  function mfUtilityJobSnapshot(board){
    if(!boardOk(board))return null;
    const jobs=Array.from(board.jobs.values()).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(job=>({...job}));
    const claims=Array.from(board.claims.values()).sort((a,b)=>a.workerKey<b.workerKey?-1:a.workerKey>b.workerKey?1:0).map(claim=>({...claim}));
    return {schema:board.schema,nowTick:board.nowTick,maxJobs:board.maxJobs,maxSearch:board.maxSearch,
      defaultLeaseTicks:board.defaultLeaseTicks,jobs,claims,manual:Array.from(board.manual.entries()).sort(),
      searchCursor:Array.from(board.searchCursor.entries()).sort(),stats:{...board.stats}};
  }

  root.MF_UTILITY_JOB_KIND=KINDS;
  root.mfUtilityJobStableId=mfUtilityJobStableId;root.mfUtilityJobBoardCreate=mfUtilityJobBoardCreate;
  root.mfUtilityJobPublish=mfUtilityJobPublish;root.mfUtilityJobRemove=mfUtilityJobRemove;
  root.mfUtilityJobAdvance=mfUtilityJobAdvance;root.mfUtilityJobClaim=mfUtilityJobClaim;
  root.mfUtilityJobRenew=mfUtilityJobRenew;root.mfUtilityJobRelease=mfUtilityJobRelease;
  root.mfUtilityJobSetManualOverride=mfUtilityJobSetManualOverride;root.mfUtilityJobGet=mfUtilityJobGet;
  root.mfUtilityJobActiveClaims=mfUtilityJobActiveClaims;root.mfUtilityJobAssistMultiplier=mfUtilityJobAssistMultiplier;
  root.mfUtilityJobClaimForWorker=mfUtilityJobClaimForWorker;root.mfUtilityJobClaims=mfUtilityJobClaims;
  root.mfUtilityJobAssistTotal=mfUtilityJobAssistTotal;root.mfUtilityJobSnapshot=mfUtilityJobSnapshot;
})(typeof window!=='undefined'?window:globalThis);
