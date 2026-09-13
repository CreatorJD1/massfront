/* Real Worker/D1/WebSockets plus current command submission/consumer source.
   --scenario all adds factory/repeat/rally/cancellation and real 30 Hz factory
   production in a bounded world. Neither scenario is rendered-match acceptance.
   --self-test is offline harness assembly only: no accounts, sockets or files. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2),option=name=>{
  const i=args.indexOf('--'+name);return i<0?null:args[i+1];
};
const selfTest=args.includes('--self-test'),scenario=option('scenario')||(selfTest?'all':'upgrades');
assert(['upgrades','all'].includes(scenario),'--scenario must be upgrades or all.');
assert(selfTest||option('base'),'Explicit --base is required; no service is contacted by default.');
assert(!selfTest||!option('base'),'--self-test cannot be combined with a service endpoint.');
const endpoint=new URL(option('base')||'http://127.0.0.1');
assert(['http:','https:'].includes(endpoint.protocol)&&!endpoint.username&&!endpoint.password,'Invalid --base.');
const loopback=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
assert(loopback||args.includes('--allow-production'),'Nonloopback --base also requires --allow-production.');
assert(!endpoint.search&&!endpoint.hash&&(loopback||endpoint.protocol==='https:'),'Service endpoint must be query-free HTTPS except loopback.');
const sendDelayMs=option('send-delay-ms')===null?0:Number(option('send-delay-ms'));
assert(Number.isInteger(sendDelayMs)&&sendDelayMs>=0&&sendDelayMs<=500,'--send-delay-ms must be an integer from 0 to 500.');
const base=endpoint.href.replace(/\/$/,''),wsBase=base.replace(/^http/,'ws'),run=Date.now().toString(36)+randomBytes(3).toString('hex'),
  out=resolve(root,option('out')||`.tmp/match-replay-live/${run}.json`),outRelative=relative(resolve(root,'.tmp'),out);
assert(outRelative&&!outRelative.startsWith('..')&&!isAbsolute(outRelative),'Evidence must stay under project .tmp/.');
assert(selfTest||!existsSync(out),'Refusing to run over an existing evidence report; choose a fresh --out.');
const runtimePath=resolve(root,option('runtime')||'www/assets/data/runtime-compatibility.json'),
  runtimeTuple=JSON.parse(readFileSync(runtimePath,'utf8').replace(/^\uFEFF/,''));
assert(/^\d+\.\d+\.\d+/.test(runtimeTuple.buildVersion)&&/^[a-f0-9]{64}$/.test(runtimeTuple.manifestHash)&&
  /^[a-f0-9]{64}$/.test(runtimeTuple.balanceHash),'A real packaged runtime compatibility descriptor is required.');
const versionParts=runtimeTuple.buildVersion.split(/[.-]/).slice(0,3).map(Number),
  modernWindow=versionParts[0]>1||versionParts[0]===1&&(versionParts[1]>33||versionParts[1]===33&&versionParts[2]>=74),
  expectedInputWindow={min:2,max:modernWindow?18:3},productionDefaultDelay=modernWindow?8:2;
const sourcePaths=['src/game/sim.js','src/game/matchconsumer.js','src/socialui.js'],
  sourceText=Object.fromEntries(sourcePaths.map(path=>[path,readFileSync(resolve(root,path),'utf8')])),
  [simSource,consumerSource,socialSource]=sourcePaths.map(path=>sourceText[path]);
const between=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'Source seam missing: '+start);return source.slice(a,b);};
const upgrades=between(simSource,'const BUP=','function bldDmgTierMul(')+
  between(simSource,'function mfBuildingUpgradeAuthority(','/* ---------- research (Tech Lab)'),
  clientSubmission=between(socialSource,"  const MR_PROTOCOL=",'  function createMatchRuntime(){')+
    between(socialSource,'    function socketReady(){','    async function runtimeTuple(){')+
    between(socialSource,'    function submitCommands(commands,delay){','    function unregisterConsumer(value){'),
  productionHelpers=between(simSource,'function mfProductionDuration(T)','function mfBuildingActivity(')+
    between(simSource,'function mfFactoryRallyGoal(B,T,spawnX,spawnY)','function bldTick('),
  factoryStart=simSource.indexOf('if(B.queue.length){',simSource.indexOf("else if(B.type==='fac'||B.type==='tgate'")),
  factoryEnd="} else {B.prodT=0;B.prodStalled='';}";
assert(factoryStart>=0,'Actual factory production branch exists');
const factoryBranch=between(simSource.slice(factoryStart),'if(B.queue.length){',factoryEnd)+factoryEnd;
const hash=value=>createHash('sha256').update(value).digest('hex'),checks=[],requests=[],wire=[],accounts=[],sockets=[];
const evidence={run,base,production:!loopback,startedAt:new Date().toISOString(),runtime:{buildVersion:runtimeTuple.buildVersion,
  manifestHash:runtimeTuple.manifestHash,balanceHash:runtimeTuple.balanceHash,path:relative(root,runtimePath),
  sha256:hash(readFileSync(runtimePath))},scenario,
  source:Object.fromEntries(sourcePaths.map(path=>[path,hash(sourceText[path])])),
  verifierSha256:hash(readFileSync(new URL(import.meta.url))),sendDelayMs,productionDefaultDelay,
  expectedInputWindow,negotiatedWindows:[],checks,requests,wire,
  scope:'Real Worker/auth/D1/WebSocket transport, current client submission and actual command consumer. Fixture banks/buildings, deterministic spawn/terrain/flowfield sinks; actual production branch at 30 Hz in scenario all. No renderer/full world, device or terrain navigation acceptance.',
  limitations:['Worker attaches authenticated seats but has no simulation ownership state. A valid-shape foreign-building command is rejected by each consumer, not by the Worker, and can stop client advancement. This verifier does not fix that availability limitation.']};
const frame=(type,extra={})=>({protocol:'massfront-match',v:1,type,...extra});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(name,condition,details={})=>{checks.push({name,pass:!!condition,...details});assert(condition,name);console.log('PASS '+name);};
async function call(method,path,{account,body}={}){
  const headers={};if(account)headers.authorization='Bearer '+account.token;
  if(body!==undefined)headers['content-type']='application/json';
  let response;
  try{response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
  catch{throw new Error(`HTTP ${method} ${path.split('/').slice(0,3).join('/')} failed or timed out`);}
  let json;try{json=await response.json();}catch{json={};}
  requests.push({method,path,status:response.status,error:typeof json.error==='string'?json.error:undefined});
  if(!response.ok)throw new Error(`HTTP ${method} ${path}: ${response.status} ${json.error||'request_failed'}`);
  return json;
}
async function provision(label){
  const account={label,email:`mf-replay-qa-${run}-${label}@example.com`,username:`qa${label}${run}`.slice(0,16),
    password:'ReplayQA-'+randomBytes(18).toString('hex'),token:null};
  // Track even a lost registration response. Without a confirmed session we
  // cannot safely delete anything, and cleanup must report that uncertainty.
  accounts.push(account);
  const registered=await call('POST','/register',{body:{email:account.email,password:account.password,ageOk:true,username:account.username}});
  assert(registered.token&&registered.user?.email===account.email,'Registration identity mismatch');
  account.token=registered.token;
  await call('POST','/age',{account,body:{ageOk:true}});
  const identity=await call('GET','/me',{account});
  assert(identity.user.email===account.email&&identity.user.username===account.username,'QA identity mismatch');
  return account;
}
function consumerFixture(seat){
  const banks=new Map([['0:-1',{m:10000,e:20000}],['1:0',{m:10000,e:20000}]]),
    status={state:'running',seat,started:true,ended:false,tick:0};
  const C={console,TextEncoder,POP_PLAYER_SLOT:-1,MAXU:100,MAP:3000,heroLvl:10,unitHigh:0,matchLive:true,
    // Eight-second fixture chassis avoids changing simulation time or speeding
    // work up to manufacture completion. Terrain/spawn remain explicit fixtures.
    TYPES:[{name:'QA ground chassis',bt:1,cm:60,ce:240,air:0,naval:0}],
    BT:Object.fromEntries(['pgen','turret','mex','fac','techlab','hq'].map(type=>[type,{name:type}])),
    blds:[],banks,paid:[],streamed:[],refunded:[],spawned:[],fields:[],AI:{allies:[],bases:[{slot:0}]},commanderSlotForBuilding:B=>B.slot,
    canAfford:(team,m,e,slot)=>banks.get(team+':'+slot).m>=m&&banks.get(team+':'+slot).e>=e,
    pay:(team,m,e,slot)=>{assert(C.canAfford(team,m,e,slot));const bank=banks.get(team+':'+slot);
      bank.m-=m;bank.e-=e;C.paid.push({team,slot,m,e});},
    hasBld:(team,type)=>C.blds.some(B=>B.alive&&B.team===team&&B.type===type&&B.prog>=1),
    credit:(team,m,e,slot)=>{const bank=banks.get(team+':'+slot);bank.m+=m;bank.e+=e;C.refunded.push({team,slot,m,e});},
    payStream:(team,m,e,slot)=>{if(!C.canAfford(team,m,e,slot))return false;const bank=banks.get(team+':'+slot);
      bank.m-=m;bank.e-=e;C.streamed.push({team,slot,m,e});return true;},
    playerBuildMult:1,aiBuildMult:1,MF_PRODUCTION_QUEUE_CAP:30,factionDoctrineBuildSpeedMul:()=>1,
    factionDoctrineUnitCost:T=>({m:T.cm,e:T.ce}),fortOf:()=>({prod:1}),populationCanSpawn:()=>true,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),battlefieldClampPoint:(x,y)=>[x,y],
    mfSimRange:(a,b)=>(a+b)/2,findLand:(x,y)=>[x,y],findWater:(x,y)=>[x,y],
    dist2:(a,b,c,d)=>(a-c)**2+(b-d)**2,mfNavUnitClearance:()=>0,
    requestField:(...args)=>{C.fields.push(args);return C.fields.length;},
    spawnUnit:(type,team,x,y,slot)=>{const id=C.unitHigh++;C.ux[id]=x;C.uy[id]=y;
      C.spawned.push({id,type,team,slot,tick:C.tick,x,y});return id;},
    mfBuildingWorkFx(){},addParticle(){},sfx(){},toast(){},addEventListener(){},emit(){},render(){},
    ugen:[],uteam:[],uCmd:[],ualive:[],utype:[],ustate:[],ux:[],uy:[],utx:[],uty:[],ufield:[],
    state:'running',seq:0,tick:0,pending:new Map(),consumer:null,expected:runtimeTuple,socket:null,
    MFSocialUI:{state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}}};
  C.window=C;vm.createContext(C);vm.runInContext(upgrades+clientSubmission,C);
  C.MFMatchRuntime={status:()=>({...status}),registerConsumer:C.registerConsumer,submitCommands:C.submitCommands};
  vm.runInContext(consumerSource,C);assert.equal(C.consumer,C.MFMatchCommandConsumer);
  if(scenario==='all')vm.runInContext(productionHelpers+`\nfunction stepFactories(){
    const dt=1/30;for(let b=4;b<blds.length;b++){const B=blds[b];${factoryBranch}}
  }`,C);
  for(let index=0;index<4;index++)C.blds.push({alive:true,prog:1,type:'pgen',team:index<2?0:1,slot:index<2?-1:0,
    lvl:1,tier:1,upT:0,hp:100,hpm:100});
  if(scenario==='all')for(let id=4;id<12;id++)C.blds.push({alive:true,prog:1,type:'fac',team:id%2,slot:id%2?0:-1,
    tier:1,queue:[],queueRevision:0,repeat:false,prodT:0,prodStalled:'',x:id%2?1000:100,y:100,r:20,adj:0,tractorT:0});
  const F={C,status,api:C.MFMatchCommandConsumer,digests:new Map(),commits:new Map(),
    snapshot:()=>JSON.stringify({banks:[...banks],blds:C.blds,paid:C.paid,streamed:{count:C.streamed.length,
      totals:[0,1].map(team=>C.streamed.filter(p=>p.team===team).reduce((a,p)=>({m:a.m+p.m,e:a.e+p.e}),{m:0,e:0}))},refunded:C.refunded,
      spawned:C.spawned,fields:C.fields,utx:C.utx,uty:C.uty,ufield:C.ufield})};
  F.commit=async packet=>{
    const before=F.snapshot(),previous=F.api.lastAppliedTick(),promise=F.api.enqueueTick(packet);
    assert.equal(F.snapshot(),before,'Packet arrival cannot mutate simulation');
    if(packet.tick>previous){
      assert(F.api.canAdvance(packet.tick));assert(F.api.beginTick(packet.tick));
      const afterCommands=F.snapshot();C.tick=packet.tick;
      if(scenario==='all')C.stepFactories();
      assert(F.api.commitTick(packet.tick));
      F.commits.set(packet.tick,{before:JSON.parse(before),afterCommands:JSON.parse(afterCommands),
        afterSimulation:JSON.parse(F.snapshot()),commands:packet.commands});
    }
    assert.equal(await promise,true);status.tick=F.api.lastAppliedTick();F.digests.set(packet.tick,hash(F.snapshot()));
  };
  return F;
}
function pacedLiveTicks(previousArrival,arrivedAt,processedAt,prior){
  const gap=previousArrival==null?null:arrivedAt-previousArrival;
  return gap!=null&&gap>=15&&gap<=120&&processedAt-arrivedAt<100?prior+1:0;
}
class Peer{
  constructor(url,protocols,fixture,label){
    this.label=label;this.fixture=fixture;this.messages=[];this.waiters=[];this.lastReceived=fixture.api.lastAppliedTick();
    this.rawTicks=new Map();this.withheld=[];this.holdFrom=Infinity;this.failed=null;this.chain=Promise.resolve();this.seq=0;
    this.commandTimers=new Set();this.inputWindow=null;this.sentCommands=new Map();this.rejectedTick=null;
    this.lastTickArrival=null;this.pacedTicks=0;
    this.ws=new WebSocket(url,protocols);sockets.push(this);
    this.opened=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(label+' socket open timeout')),6000);
      this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve();});
      this.ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error(label+' socket handshake failed'));});
    });
    this.ws.addEventListener('message',event=>{
      const arrivedAt=Date.now();
      this.chain=this.chain.then(()=>this.receive(String(event.data),arrivedAt)).catch(error=>{
        this.failed=new Error(label+' consumer/wire failure: '+error.message);
        for(const waiter of this.waiters.splice(0)){clearTimeout(waiter.timer);waiter.reject(this.failed);}
      });
    });
    // The real client's validation/sequence/window function owns submission;
    // this adapter only forwards its serialized frame to the actual socket.
    const fixturePeer=this;
    fixture.C.socket={get readyState(){return fixturePeer.ws.readyState;},send:text=>this.send(JSON.parse(text))};
  }
  async receive(text,arrivedAt=Date.now()){
    const value=JSON.parse(text),F=this.fixture;
    wire.push({at:Date.now(),peer:this.label,direction:'in',type:value.type,tick:value.tick,
      seq:value.seq,targetTick:value.targetTick,code:value.code,seat:value.seat,lastReceivedTick:this.lastReceived,arrivedAt});
    if(value.type==='welcome'){
      this.welcome=value;this.seq=value.lastSeq||this.seq;F.C.seq=this.seq;
      assert(value.inputDelay?.min===expectedInputWindow.min&&value.inputDelay?.max===expectedInputWindow.max,
        'Server did not negotiate the expected release input window');
      this.inputWindow={min:value.inputDelay.min,max:value.inputDelay.max};
      evidence.negotiatedWindows.push({peer:this.label,...this.inputWindow,defaultDelay:productionDefaultDelay});
      assert.equal(value.tickRate,30,'Real server uses the simulation fixed-step rate');
      if(value.resumed){F.status.state=F.C.state='replaying';assert(F.api.resumeState(value),'Consumer refused resume checkpoint');}
    }
    if(value.type==='tick'){
      const gap=this.lastTickArrival==null?null:arrivedAt-this.lastTickArrival;
      this.pacedTicks=pacedLiveTicks(this.lastTickArrival,arrivedAt,Date.now(),this.pacedTicks);
      this.lastTickArrival=arrivedAt;
      this.lastReceived=value.tick;F.C.tick=value.tick;this.rawTicks.set(value.tick,text);
      if(this.rejectedTick){/* Deliberately rejected final QA tick: do not apply later authority. */}
      else if(value.tick===this.expectConsumerReject){
        const before=F.snapshot(),lastApplied=F.api.lastAppliedTick(),accepted=await F.api.enqueueTick({tick:value.tick,commands:value.commands});
        assert.equal(accepted,false,'Actual consumer must reject the foreign-building authoritative packet');
        assert.equal(F.snapshot(),before,'Rejected foreign-building tick must be atomic');
        assert.equal(F.api.lastAppliedTick(),lastApplied,'Rejected authority cannot advance simulation');
        this.rejectedTick={tick:value.tick,lastApplied,beforeHash:hash(before),afterHash:hash(F.snapshot()),commands:value.commands};
      }else if(value.tick>=this.holdFrom)this.withheld.push(value.tick);
      else{
        await F.commit({tick:value.tick,commands:value.commands});
      }
      // Synthetic input must not fire inside the first old frame of a server
      // catch-up burst. Wait for two paced live arrivals; keep the real client's
      // default delay/window unchanged and continue to fail every actual reject.
      if(this.nextAction&&this.pacedTicks<2)(evidence.suppressedCatchupInputs??=[]).push({peer:this.label,tick:value.tick,
        proposedTarget:value.tick+productionDefaultDelay,arrivedAt,gap,processingAgeMs:Date.now()-arrivedAt,pacedTicks:this.pacedTicks});
      if(this.nextAction&&this.pacedTicks>=2){
        const pending=this.nextAction;this.nextAction=null;clearTimeout(pending.timer);
        try{
          F.C.state=F.status.state;
          const result=pending.action(F.api,F.C),receipts=Array.isArray(result)?result:[result];
          assert(receipts.length&&receipts.every(r=>r&&Number.isSafeInteger(r.seq)),'Fresh-tick submission failed');
          this.seq=F.C.seq;
          if(pending.withhold)this.holdFrom=Math.min(...receipts.map(r=>r.targetTick));pending.resolve(result);
        }catch(error){pending.reject(error);}
      }
    }
    if(value.type==='ack'||value.type==='reject')F.C.pending.delete(value.seq);
    if(value.type==='resumeReadyAck')F.status.state=F.C.state='running';
    for(let i=0;i<this.waiters.length;i++)if(this.waiters[i].match(value)){
      const waiter=this.waiters.splice(i,1)[0];clearTimeout(waiter.timer);waiter.resolve(value);return;
    }
    this.messages.push(value);
  }
  send(value){
    if(value.type==='commands'){
      if(this.forgeNextSeat!=null){value={...value,seat:this.forgeNextSeat};this.forgeNextSeat=null;}
      this.sentCommands.set(value.seq,JSON.parse(JSON.stringify(value)));
    }
    const serialized=JSON.stringify(value),queuedAt=Date.now(),queuedTick=this.lastReceived;
    const transmit=()=>{
      wire.push({at:Date.now(),peer:this.label,direction:'out',type:value.type,tick:value.tick,
        seq:value.seq,targetTick:value.targetTick,lastReceivedTick:this.lastReceived,queuedAt,queuedTick,
        actualSendDelayMs:Date.now()-queuedAt});
      this.ws.send(serialized);
    };
    if(value.type==='commands'&&sendDelayMs){
      wire.push({at:queuedAt,peer:this.label,direction:'queued',type:value.type,seq:value.seq,
        targetTick:value.targetTick,lastReceivedTick:queuedTick,requestedSendDelayMs:sendDelayMs});
      const timer=setTimeout(()=>{
        this.commandTimers.delete(timer);
        try{transmit();}catch{
          this.failed=new Error(this.label+' delayed command send failed');
          for(const waiter of this.waiters.splice(0)){clearTimeout(waiter.timer);waiter.reject(this.failed);}
        }
      },sendDelayMs);this.commandTimers.add(timer);
    }else transmit();
  }
  upgradeOnNextTick(building,withhold=false){
    return this.actionOnNextTick(api=>api.submitUpgrade(building,true),withhold);
  }
  actionOnNextTick(action,withhold=false){
    assert(!this.nextAction,'One next-tick fixture action at a time');
    return new Promise((resolve,reject)=>{
      const pending={action,withhold,resolve,reject,timer:null};pending.timer=setTimeout(()=>{
        this.nextAction=null;reject(new Error(this.label+' next-tick submission timeout'));
      },6000);this.nextAction=pending;
    });
  }
  async ack(seq){
    const outcome=await this.wait('ack-or-reject',value=>value.seq===seq);
    if(outcome.type==='reject')throw new Error(this.label+' command rejected: '+outcome.code);
    return outcome;
  }
  wait(type,predicate=()=>true,timeout=6000){
    if(this.failed)return Promise.reject(this.failed);
    const match=value=>(value.type===type||type==='ack-or-reject'&&['ack','reject'].includes(value.type))&&predicate(value),
      index=this.messages.findIndex(match);
    if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
    return new Promise((resolve,reject)=>{
      const waiter={match,resolve,reject,timer:null};waiter.timer=setTimeout(()=>{
        const index=this.waiters.indexOf(waiter);if(index>=0)this.waiters.splice(index,1);
        reject(new Error(this.label+' timeout waiting for '+type));
      },timeout);this.waiters.push(waiter);
    });
  }
  close(){for(const timer of this.commandTimers)clearTimeout(timer);this.commandTimers.clear();
    if(this.nextAction){clearTimeout(this.nextAction.timer);this.nextAction.reject(new Error(this.label+' closed'));this.nextAction=null;}
    try{this.ws.close(1000,'QA replay check');}catch{}}
}
const clone=value=>JSON.parse(JSON.stringify(value));
const produce=(id,count=1)=>({type:'produce',building:{id,type:'fac'},unit:0,count});
async function through(peers,tick,timeout=6000){
  for(const peer of peers)if(peer.lastReceived<tick)await peer.wait('tick',value=>value.tick>=tick,timeout);
  await Promise.all(peers.map(peer=>peer.chain));
}
async function factoryScenario(left,right,{url,seatA,seatB}){
  let peers=[left,right];const [FA,FB]=peers.map(peer=>peer.fixture),
    factoryEvidence=evidence.factory={fixedStepSeconds:1/30,fixtureUnit:{bt:1,cm:60,ce:240},
      terrain:'Identity land projection, deterministic spawn point, recorded flowfield request; not physical navigation acceptance.',orders:[]};
  async function order(label,action){
    const submitted=await Promise.all(peers.map((peer,i)=>peer.actionOnNextTick((api,C)=>action(i,api,C)))),
      rows=submitted.map(result=>Array.isArray(result)?result:[result]),target=Math.max(...rows.flat().map(r=>r.targetTick));
    await Promise.all(rows.flatMap((receipts,i)=>receipts.map(r=>peers[i].ack(r.seq))));
    await through(peers,target);
    check(label+' converges on both real consumers',FA.digests.get(target)===FB.digests.get(target),{tick:target});
    factoryEvidence.orders.push({label,tick:target,stateDigest:FA.digests.get(target),
      seats:rows.map((receipts,i)=>({seat:i+1,receipts,commands:receipts.flatMap(r=>peers[i].sentCommands.get(r.seq).commands)}))});
    return {rows,target};
  }
  // Starting queues are empty. All queue changes below originate from real
  // consumer submissions admitted by the service, not fixture state assignment.
  const initial=await order('Both seats produce, enable repeat and set their own rally', (i,api,C)=>{
    const id=4+i,before=JSON.stringify(C.blds),seq=C.seq;
    assert.equal(api.submitRepeat(5-i,true),null);assert.equal(api.submitRally(5-i,500,600),null);
    assert.equal(C.seq,seq,'Foreign owner API calls cannot reach the socket');
    const result=[api.submit(produce(id,2)),api.submitRepeat(id,true),api.submitRally(id,610.4+i*300,744.6)];
    assert.equal(JSON.stringify(C.blds),before,'Submission must not alter queue, progress, repeat or rally');
    assert.equal(api.repeatIntent(id).active,true);assert.equal(api.repeatIntent(id).pending,true);
    return result;
  });
  for(let i=0;i<2;i++){
    const F=peers[i].fixture,receipt=initial.rows[i][0],commit=F.commits.get(receipt.targetTick),B=commit.afterCommands.blds[4+i];
    assert.deepEqual(B.queue,[0,0]);assert.equal(B.repeat,true);assert.deepEqual(B.rally,{x:610+i*300,y:745});
  }
  check('Local unauthorized factory commands were refused and both explicit ON states committed',true);
  const off=await order('Explicit OFF and duplicate OFF preserve queued work', (i,api,C)=>{
    const id=4+i,before=JSON.stringify(C.blds[id]),receipts=[api.submitRepeat(id,false),api.submitRepeat(id,false)];
    assert.equal(JSON.stringify(C.blds[id]),before);assert.equal(api.repeatIntent(id).active,false);
    assert.equal(api.repeatIntent(id).pending,true);return receipts;
  });
  for(let i=0;i<2;i++){
    const commit=peers[i].fixture.commits.get(off.rows[i][0].targetTick),before=commit.before.blds[4+i],after=commit.afterCommands.blds[4+i];
    assert.deepEqual(after.queue,before.queue);assert.equal(after.prodT,before.prodT);
    assert.equal(after.queueRevision,before.queueRevision);assert.equal(after.repeat,false);
    assert.equal(peers[i].fixture.api.repeatIntent(4+i).pending,false);
  }
  check('OFF preserves both queues, paid work and revision at the actual command boundary',true);
  // Re-sending an already accepted sequence must be rejected by transport, not
  // replayed as a new logical command. It is safe on this disposable QA match.
  left.send(left.sentCommands.get(off.rows[0][0].seq));
  const duplicateReject=await left.wait('reject',v=>v.seq===off.rows[0][0].seq);
  check('Worker rejects duplicate accepted repeat command sequence',duplicateReject.code==='duplicate_or_stale_sequence');
  const completed=await right.wait('tick',value=>{
    const state=FB.commits.get(value.tick)?.afterSimulation;
    return state&&state.spawned.some(u=>u.team===0)&&state.spawned.some(u=>u.team===1);
  },20000);
  await through(peers,completed.tick);
  const completion=FB.commits.get(completed.tick).afterSimulation;
  for(let i=0;i<2;i++){
    const B=completion.blds[4+i],unit=completion.spawned.find(u=>u.team===i);
    assert.equal(B.queue.length,1,'OFF completes queued work without re-enqueue');assert.equal(B.queueRevision,2);
    assert.equal(completion.utx[unit.id],610+i*300);assert.equal(completion.uty[unit.id],745);
    assert(completion.fields.some(f=>f[0]===610+i*300&&f[1]===745&&f[2]===false&&f[3]===0));
  }
  check('Real 30 Hz production completes once per owner after OFF and uses exact rally/flowfield goals',
    FA.digests.get(completed.tick)===FB.digests.get(completed.tick),{tick:completed.tick,spawned:completion.spawned,
      fields:completion.fields,queues:[completion.blds[4].queue,completion.blds[5].queue]});
  await order('Owned tail, active-head and stale-click queues are produced', (i,api)=>
    [api.submit(produce(6+i,2)),api.submit(produce(8+i)),api.submit(produce(10+i))]);
  const tail=await order('Each owner cancels the last member of a visible stack', (i,api)=>api.submitCancelProduction(6+i,0));
  for(let i=0;i<2;i++){
    const commit=peers[i].fixture.commits.get(tail.rows[i][0].targetTick),before=commit.before,after=commit.afterCommands;
    assert.deepEqual(after.blds[6+i].queue,[0]);assert.equal(after.blds[6+i].prodT,before.blds[6+i].prodT);
    assert.equal(after.refunded.length,before.refunded.length);assert.equal(after.blds[6+i].queueRevision,before.blds[6+i].queueRevision+1);
  }
  check('Tail cancellation preserves paid head progress and refunds no unbuilt work',true);
  const stale=peers.map((peer,i)=>({revision:peer.fixture.C.blds[10+i].queueRevision,queue:clone(peer.fixture.C.blds[10+i].queue)}));
  await order('Another production order changes the observed queue revision', (i,api)=>api.submit(produce(10+i)));
  await order('Tail cancellation restores the same visible queue with a new revision', (i,api)=>api.submitCancelProduction(10+i,0));
  const staleOrder=await order('Stale same-looking queue cancellation consumes a safe no-op', (i,api)=>api.submitCancelProduction(10+i,0,stale[i]));
  for(let i=0;i<2;i++){
    const commit=peers[i].fixture.commits.get(staleOrder.rows[i][0].targetTick),before=commit.before,after=commit.afterCommands;
    assert.deepEqual(before.blds[10+i].queue,stale[i].queue);assert.notEqual(before.blds[10+i].queueRevision,stale[i].revision);
    assert.deepEqual(after.blds[10+i],before.blds[10+i]);assert.deepEqual(after.refunded,before.refunded);
  }
  check('Revision-bound cancellation cannot remove the next identically displayed chassis',true);
  // Lose a paid-head cancellation plus repeat intent and a new rally marker
  // after real server admission, before this peer applies the emitted tick.
  const dropped=await Promise.all(peers.map((peer,i)=>peer.actionOnNextTick((api,C)=>{
    const before=JSON.stringify(C.blds),receipts=[api.submitRepeat(4+i,true),api.submitRally(4+i,670+i*300,810),api.submitCancelProduction(8+i,0)];
    assert.equal(api.submitCancelProduction(8+i,0),null,'One pending cancellation per factory');
    assert.equal(JSON.stringify(C.blds),before);return receipts;
  },i===0)));
  // Each peer submits from its own fresh tick; the other owner can target one
  // tick earlier. Withhold the whole accepted batch, including that first tick.
  left.holdFrom=Math.min(...dropped.flat().map(r=>r.targetTick));
  await Promise.all(dropped.flatMap((rows,i)=>rows.map(r=>peers[i].ack(r.seq))));
  const droppedTarget=Math.max(...dropped.flat().map(r=>r.targetTick));
  await left.wait('tick',v=>v.tick>=droppedTarget+1);
  left.close();FA.status.state=FA.C.state='reconnecting';
  const absent=await right.wait('disconnected',v=>v.seat===seatA);await Promise.all(peers.map(p=>p.chain));
  const cursor=FA.api.lastAppliedTick(),head=absent.tick;
  check('Accepted repeat/cancel/rally work remains unapplied and pending across transport loss',
    cursor<dropped[0][0].targetTick&&FA.api.repeatIntent(4).pending&&FA.C.blds[8].queue.length===1&&FA.C.refunded.length===0,
    {cursor,head,withheld:left.withheld});
  const again=new Peer(url,['massfront.v1',`mf-resume.${seatA}.${left.welcome.resumeToken}.${cursor}`],FA,'A-factory-resumed');
  await again.opened;const welcome=await again.wait('welcome'),replayEnd=await again.wait('replayEnd');
  check('Factory reconnect preserves the highest accepted sequence and complete replay range',
    welcome.lastSeq===dropped[0].at(-1).seq&&welcome.resumeFromTick===cursor&&welcome.replayThroughTick===head&&replayEnd.tick===head);
  const missing=Array.from({length:head-cursor},(_,i)=>cursor+i+1);
  check('Factory command and empty frames replay byte-for-byte from the real Worker',
    missing.every(tick=>again.rawTicks.get(tick)===right.rawTicks.get(tick)));
  for(let i=0;i<2;i++){
    const C=FA.C,B=C.blds[8+i],refund=C.refunded.find(r=>r.team===i),commit=FA.commits.get(dropped[i].at(-1).targetTick),
      progress=commit.before.blds[8+i].prodT;
    assert.equal(B.queue.length,0);assert.equal(B.queueRevision,2);
    assert(refund&&Math.abs(refund.m-60*progress)<1e-9&&Math.abs(refund.e-240*progress)<1e-9);
    assert.equal(refund.slot,i===0?-1:0);assert.equal(C.blds[4+i].repeat,true);
    assert.deepEqual(clone(C.blds[4+i].rally),{x:670+i*300,y:810});
  }
  check('Replay converges repeat/rally/queues and refunds exactly the two owning paid heads once',
    FA.digests.get(head)===FB.digests.get(head)&&FA.C.refunded.length===2&&FB.C.refunded.length===2&&!FA.api.repeatIntent(4).pending,
    {tick:head,stateDigest:FA.digests.get(head),refunds:clone(FA.C.refunded)});
  const once=FA.snapshot(),replayed=JSON.parse(again.rawTicks.get(dropped[0].at(-1).targetTick));
  assert(await FA.api.enqueueTick({tick:replayed.tick,commands:replayed.commands}));
  check('Exact cancellation replay duplicate cannot refund or remove twice',FA.snapshot()===once);
  assert.equal(await FA.api.enqueueTick({tick:replayed.tick,commands:[]}),false);
  check('Altered replay duplicate is refused without changing simulation',FA.snapshot()===once);
  again.send(frame('resumeReady',{tick:head}));await again.wait('resumeReadyAck',v=>v.tick===head);
  await through([again,right],head+1);left=again;peers=[left,right];
  await order('Both owners can turn repeat OFF after replay', (i,api)=>api.submitRepeat(4+i,false));
  // The Worker ignores a claimed body seat and stamps the authenticated socket
  // seat. This probes that boundary without claiming server world validation.
  left.forgeNextSeat=seatB;
  const bound=await left.actionOnNextTick(api=>api.submitRally(4,701,811));await left.ack(bound.seq);
  await through(peers,bound.targetTick);
  const boundPacket=JSON.parse(right.rawTicks.get(bound.targetTick)),boundRow=boundPacket.commands.find(row=>row.seq===bound.seq&&row.seat===seatA);
  check('Worker binds factory commands to authenticated seat despite a forged body seat',
    left.sentCommands.get(bound.seq).seat===seatB&&seatA!==seatB&&!!boundRow&&boundRow.commands[0].building.id===4&&
    FA.digests.get(bound.targetTick)===FB.digests.get(bound.targetTick),
    {tick:bound.targetTick,claimedSeat:seatB,authenticatedSeat:seatA,authoritativeRow:boundRow});
  // Final destructive-to-this-QA-session case only: the Worker has no building
  // map. Both real consumers must reject the same admitted foreign-owner tick.
  const foreign=await right.actionOnNextTick((api,C)=>C.submitCommands([
    {type:'repeat',building:{id:5,type:'fac'},active:true},
    {type:'rally',building:{id:4,type:'fac'},x:999,y:999},
    {type:'cancel_production',building:{id:4,type:'fac'},start:0,unit:0,
      revision:C.blds[4].queueRevision,queue:clone(C.blds[4].queue)}]));
  for(const peer of peers)peer.expectConsumerReject=foreign.targetTick;
  await right.ack(foreign.seq);await through(peers,foreign.targetTick);
  check('Both actual consumers reject the live foreign-factory tick atomically',peers.every(peer=>
    peer.rejectedTick?.tick===foreign.targetTick&&peer.rejectedTick.beforeHash===peer.rejectedTick.afterHash)&&
    left.rejectedTick.beforeHash===right.rejectedTick.beforeHash,
    {tick:foreign.targetTick,scope:'Client fail-closed ownership check, not Worker-side gameplay authority or availability hardening.'});
  factoryEvidence.rejectedAuthority=peers.map(peer=>({peer:peer.label,...peer.rejectedTick}));
  return left;
}

async function selfTestHarness(){
  assert.equal(pacedLiveTicks(null,1000,1000,0),0);
  assert.equal(pacedLiveTicks(1000,2000,2000,5),0,'A stalled stream resets input pacing');
  assert.equal(pacedLiveTicks(2000,2001,2001,0),0,'Catch-up frames cannot trigger input');
  assert.equal(pacedLiveTicks(2001,2034,2034,0),1);
  assert.equal(pacedLiveTicks(2034,2067,2067,1),2,'Two normally paced arrivals restore input eligibility');
  assert.equal(pacedLiveTicks(2067,2100,2250,2),0,'Queued processing latency also postpones synthetic input');
  const A=consumerFixture(1),B=consumerFixture(2),frames=[];
  for(const [i,F] of [A,B].entries())F.C.socket={readyState:1,send:raw=>frames.push({seat:i+1,...JSON.parse(raw)})};
  for(const [i,F] of [A,B].entries()){
    assert(F.api.submitUpgrade(i?2:0,true));
    if(scenario==='all'){
      assert(F.api.submit(produce(4+i,2)));assert(F.api.submitRepeat(4+i,true));
      assert(F.api.submitRally(4+i,610.4+i*300,744.6));assert(F.api.submitRepeat(4+i,false));
    }
  }
  async function advance(tick){
    const commands=frames.filter(f=>f.targetTick===tick).map(f=>({seat:f.seat,seq:f.seq,commands:f.commands})).sort((a,b)=>a.seat-b.seat||a.seq-b.seq);
    for(const F of [A,B]){F.C.tick=tick;await F.commit({tick,commands});}
    assert.equal(A.snapshot(),B.snapshot());
  }
  for(let tick=1;tick<=productionDefaultDelay+242;tick++)await advance(tick);
  assert.equal(A.C.paid.length,2);
  if(scenario==='all'){
    assert.equal(A.C.spawned.length,2);assert.equal(A.C.blds[4].queue.length,1);assert.equal(A.C.blds[5].queue.length,1);
    assert.equal(A.C.utx[0],610);assert.equal(A.C.utx[1],910);
    for(const [i,F] of [A,B].entries())assert(F.api.submitCancelProduction(4+i,0));
    const last=A.api.lastAppliedTick();for(let tick=last+1;tick<=last+productionDefaultDelay;tick++)await advance(tick);
    assert.equal(A.C.refunded.length,2);assert.equal(A.C.blds[4].queue.length,0);
  }
  assert.equal(requests.length,0);assert.equal(accounts.length,0);assert.equal(sockets.length,0);
  console.log(JSON.stringify({status:'PASS',scope:'Offline harness assembly only; no Worker, auth, real WebSocket, browser or release acceptance.',
    scenario,source:evidence.source,frames:frames.length,simulatedTicks:A.api.lastAppliedTick(),networkRequests:0,filesWritten:0}));
}
if(selfTest){await selfTestHarness();process.exit(0);}
let a,b,resumed,passed=false,guard;
try{
  guard=await acquireVerificationFreeze({root,label:'authenticated match replay '+scenario,allowedPaths:[resolve(root,'.tmp'),resolve(root,'tmp'),resolve(root,'audit')]});
  for(const path of sourcePaths){
    const entry=runtimeTuple.manifestEntries?.find(entry=>entry.path===path);
    check('Packaged runtime identity matches tested source '+path,entry?.sha256===evidence.source[path]&&
      entry.size===Buffer.byteLength(sourceText[path])&&hash(readFileSync(resolve(root,path)))===evidence.source[path]);
  }
  check('Runtime descriptor is unchanged before any service request',hash(readFileSync(runtimePath))===evidence.runtime.sha256);
  const A=await provision('a'),B=await provision('b'),caps=await call('GET','/social/capabilities',{account:A});
  evidence.capabilities=caps.capabilities;
  check('real service advertises realtime and match launch',caps.capabilities?.realtimeMatch===true&&caps.capabilities?.matchLaunch===true);
  const made=await call('POST','/multiplayer/lobbies',{account:A,body:{rules:{mode:'skirmish',slots:2,map:'auto'}}}),lobby=made.lobby,
    joined=await call('POST','/multiplayer/lobbies/join',{account:B,body:{code:lobby.code}}),
    readyA=await call('POST',`/multiplayer/lobbies/${lobby.id}/ready`,{account:A,body:{revision:joined.lobby.revision,ready:true}}),
    readyB=await call('POST',`/multiplayer/lobbies/${lobby.id}/ready`,{account:B,body:{revision:readyA.lobby.revision,ready:true}}),
    revision=readyB.lobby.revision,compatibility={revision,buildVersion:runtimeTuple.buildVersion,
      manifestHash:runtimeTuple.manifestHash,balanceHash:runtimeTuple.balanceHash,rulesHash:hash(JSON.stringify(lobby.rules))};
  await call('POST',`/multiplayer/lobbies/${lobby.id}/compatibility`,{account:A,body:compatibility});
  await call('POST',`/multiplayer/lobbies/${lobby.id}/compatibility`,{account:B,body:compatibility});
  const launched=await call('POST',`/multiplayer/lobbies/${lobby.id}/launch`,{account:A,body:{revision}}),match=launched.match,
    ta=await call('POST',`/multiplayer/matches/${match.id}/token`,{account:A}),
    tb=await call('POST',`/multiplayer/matches/${match.id}/token`,{account:B}),url=`${wsBase}/multiplayer/matches/${match.id}/socket`,
    FA=consumerFixture(ta.credential.seat),FB=consumerFixture(tb.credential.seat);
  a=new Peer(url,['massfront.v1',`mf-seat.${ta.credential.seat}.${ta.credential.token}`],FA,'A');await a.opened;
  const welcomeA=await a.wait('welcome');
  b=new Peer(url,['massfront.v1',`mf-seat.${tb.credential.seat}.${tb.credential.token}`],FB,'B');await b.opened;
  await b.wait('welcome');await a.wait('start');await b.wait('start');await a.wait('tick');
  check('actual packaged compatibility was accepted',welcomeA.compatibility.manifestHash===runtimeTuple.manifestHash);
  // Each fixture submits immediately on its own fresh received tick. Waiting
  // for A alone can leave B at tick zero and manufacture a stale-target reject.
  const [orderA,orderB]=await Promise.all([a.upgradeOnNextTick(0,true),b.upgradeOnNextTick(2)]);
  await Promise.all([a.ack(orderA.seq),b.ack(orderB.seq)]);
  evidence.admission=[a,b].map(peer=>{
    const sent=wire.find(item=>item.peer===peer.label&&item.type==='commands'&&item.direction==='out'),
      ack=wire.find(item=>item.peer===peer.label&&item.type==='ack');
    return {peer:peer.label,targetTick:sent.targetTick,queuedTick:sent.queuedTick,sentAtTick:sent.lastReceivedTick,
      ackObservedTick:ack.lastReceivedTick,actualSendDelayMs:sent.actualSendDelayMs,sendToAckMs:ack.at-sent.at,
      queuedToAckMs:ack.at-sent.queuedAt};
  });
  check('both commands admitted once using negotiated window and requested outbound delay',
    evidence.admission.every(item=>item.actualSendDelayMs>=Math.max(0,sendDelayMs-2))&&
    wire.filter(item=>item.type==='commands'&&item.direction==='out').length===2,
    {sendDelayMs,inputWindow:expectedInputWindow,defaultDelay:productionDefaultDelay});
  // Receive but deliberately withhold the paid upgrade tick and a following
  // empty tick. This exercises loss after server emission, before client apply.
  await a.wait('tick',value=>value.tick>=Math.max(orderA.targetTick,orderB.targetTick)+1);
  a.close();FA.status.state='reconnecting';const disconnected=await b.wait('disconnected',value=>value.seat===ta.credential.seat);
  await a.chain;await b.chain;
  const cursor=FA.api.lastAppliedTick(),head=disconnected.tick;
  check('lost authoritative upgrade tick leaves actual client behind frozen room',cursor<head&&cursor<orderA.targetTick,
    {lastAppliedTick:cursor,roomHead:head,withheld:a.withheld});
  check('pending upgrade survives transport loss without spending',FA.api.upgradePending()&&
    FA.C.paid.filter(charge=>charge.team===0&&charge.slot===-1).length===0);
  const beforeWait=b.lastReceived;await wait(150);
  check('room emits no authority while a seat is absent',b.lastReceived===beforeWait);
  resumed=new Peer(url,['massfront.v1',`mf-resume.${ta.credential.seat}.${welcomeA.resumeToken}.${cursor}`],FA,'A-resumed');
  await resumed.opened;const welcome=await resumed.wait('welcome'),replayEnd=await resumed.wait('replayEnd');
  check('resume reports accepted sequence and exact replay interval',welcome.lastSeq===orderA.seq&&welcome.resumeFromTick===cursor&&
    welcome.replayThroughTick===head&&replayEnd.tick===head);
  const expected=[];for(let tick=cursor+1;tick<=head;tick++)expected.push(tick);
  check('every missing emitted frame replays byte-for-byte',expected.every(tick=>resumed.rawTicks.get(tick)===b.rawTicks.get(tick)));
  check('replay includes empty authoritative ticks',expected.some(tick=>JSON.parse(resumed.rawTicks.get(tick)).commands.length===0));
  check('both real consumers converge after replay with exactly two owner charges',FA.digests.get(head)===FB.digests.get(head)&&
    FA.C.paid.length===2&&FB.C.paid.length===2&&!FA.api.upgradePending(),{stateDigest:FA.digests.get(head)});
  const once=FA.snapshot(),duplicate=JSON.parse(resumed.rawTicks.get(head));
  assert(await FA.api.enqueueTick({tick:duplicate.tick,commands:duplicate.commands}));
  check('exact applied replay duplicate never charges twice',FA.snapshot()===once);
  const held=b.lastReceived;await wait(150);check('room stays frozen until explicit resume readiness',b.lastReceived===held);
  resumed.send(frame('resumeReady',{tick:head}));await resumed.wait('resumeReadyAck',value=>value.tick===head);
  await resumed.wait('tick',value=>value.tick===head+1);await b.wait('tick',value=>value.tick===head+1);
  check('both peers continue at the next contiguous tick',FA.digests.get(head+1)===FB.digests.get(head+1));
  if(scenario==='all')resumed=await factoryScenario(resumed,b,{url,seatA:ta.credential.seat,seatB:tb.credential.seat});
  resumed.close();FA.status.state='reconnecting';await b.wait('disconnected',value=>value.seat===ta.credential.seat);
  const forfeit=await b.wait('forfeit',value=>value.seat===ta.credential.seat,13000),end=await b.wait('matchEnd',()=>true,3000);
  check('unresumed QA seat expires and room terminates',forfeit.reason==='reconnect_timeout'&&end.reason==='forfeit'&&end.winnerSeat===tb.credential.seat);
  passed=true;
}catch(error){evidence.failure=String(error?.message||'verification_failed');console.error('FAIL '+evidence.failure);}
finally{
  for(const socket of sockets)socket.close();
  evidence.cleanup=[];
  // /account/delete consumes only the authenticated session, no target ID or
  // password. Verify the session belongs to this exact newly-created QA user.
  for(const account of accounts){
    if(!account.token){evidence.cleanup.push({label:account.label,deleted:false,reason:'registration_session_not_confirmed'});
      account.password=null;passed=false;continue;}
    try{
      const identity=await call('GET','/me',{account});
      assert(identity.user?.email===account.email&&identity.user?.username===account.username,'Cleanup identity mismatch');
      const deleted=await call('POST','/account/delete',{account,body:{}});assert(deleted.ok===true);
      evidence.cleanup.push({label:account.label,deleted:true});
    }catch{evidence.cleanup.push({label:account.label,deleted:false});passed=false;}
    account.token=null;account.password=null;
  }
  try{
    evidence.sourceAfter=Object.fromEntries(sourcePaths.map(path=>[path,hash(readFileSync(resolve(root,path)))]));
    evidence.runtimeAfterSha256=hash(readFileSync(runtimePath));
    assert.equal(JSON.stringify(evidence.sourceAfter),JSON.stringify(evidence.source));
    assert.equal(evidence.runtimeAfterSha256,evidence.runtime.sha256);
  }catch{passed=false;evidence.stabilityFailure='Source or runtime descriptor missing/changed during verification';}
  if(guard){try{evidence.freeze=await guard.checkpoint('match replay complete');}
    catch(error){passed=false;evidence.stabilityFailure=error.message;}
    finally{try{await guard.release({assertStable:true});}catch(error){passed=false;evidence.stabilityFailure=error.message;}}}
  evidence.status=passed?'PASS':'FAIL';evidence.finishedAt=new Date().toISOString();
  mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:evidence.status,checks:checks.length,evidence:out,cleanup:evidence.cleanup}));
  if(!passed)process.exitCode=1;
}
