/* Real Worker/D1/WebSockets plus current upgrade/command-consumer source.
   This is a bounded authority fixture, not a rendered full-match acceptance. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2),option=name=>{
  const i=args.indexOf('--'+name);return i<0?null:args[i+1];
};
assert(option('base'),'Explicit --base is required; no service is contacted by default.');
const endpoint=new URL(option('base'));
assert(['http:','https:'].includes(endpoint.protocol)&&!endpoint.username&&!endpoint.password,'Invalid --base.');
const loopback=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
assert(loopback||args.includes('--allow-production'),'Nonloopback --base also requires --allow-production.');
const sendDelayMs=option('send-delay-ms')===null?0:Number(option('send-delay-ms'));
assert(Number.isInteger(sendDelayMs)&&sendDelayMs>=0&&sendDelayMs<=500,'--send-delay-ms must be an integer from 0 to 500.');
const base=endpoint.href.replace(/\/$/,''),wsBase=base.replace(/^http/,'ws'),run=Date.now().toString(36)+randomBytes(3).toString('hex'),
  out=resolve(root,option('out')||`.tmp/match-replay-live/${run}.json`),outRelative=relative(resolve(root,'.tmp'),out);
assert(outRelative&&!outRelative.startsWith('..')&&!isAbsolute(outRelative),'Evidence must stay under project .tmp/.');
const runtimePath=resolve(root,option('runtime')||'www/assets/data/runtime-compatibility.json'),
  runtimeTuple=JSON.parse(readFileSync(runtimePath,'utf8').replace(/^\uFEFF/,''));
assert(/^\d+\.\d+\.\d+/.test(runtimeTuple.buildVersion)&&/^[a-f0-9]{64}$/.test(runtimeTuple.manifestHash)&&
  /^[a-f0-9]{64}$/.test(runtimeTuple.balanceHash),'A real packaged runtime compatibility descriptor is required.');
const versionParts=runtimeTuple.buildVersion.split(/[.-]/).slice(0,3).map(Number),
  modernWindow=versionParts[0]>1||versionParts[0]===1&&(versionParts[1]>33||versionParts[1]===33&&versionParts[2]>=74),
  expectedInputWindow={min:2,max:modernWindow?18:3},productionDefaultDelay=modernWindow?8:2;
const simSource=readFileSync(resolve(root,'src/game/sim.js'),'utf8'),consumerSource=readFileSync(resolve(root,'src/game/matchconsumer.js'),'utf8'),
  upgrades=simSource.slice(simSource.indexOf('const BUP='),simSource.indexOf('function bldDmgTierMul('))+
    simSource.slice(simSource.indexOf('function mfBuildingUpgradeAuthority('),simSource.indexOf('/* ---------- research (Tech Lab)'));
const hash=value=>createHash('sha256').update(value).digest('hex'),checks=[],requests=[],wire=[],accounts=[],sockets=[];
const evidence={run,base,production:!loopback,startedAt:new Date().toISOString(),runtime:{buildVersion:runtimeTuple.buildVersion,
  manifestHash:runtimeTuple.manifestHash,balanceHash:runtimeTuple.balanceHash},
  source:{consumer:hash(consumerSource),simulation:hash(simSource)},sendDelayMs,productionDefaultDelay,
  expectedInputWindow,negotiatedWindows:[],checks,requests,wire,
  scope:'real Worker/auth/D1/WebSocket transport and actual upgrade consumer; fixture banks/buildings, no renderer/full simulation'};
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
  const registered=await call('POST','/register',{body:{email:account.email,password:account.password,ageOk:true,username:account.username}});
  assert(registered.token&&registered.user?.email===account.email,'Registration identity mismatch');
  account.token=registered.token;accounts.push(account);
  await call('POST','/age',{account,body:{ageOk:true}});
  const identity=await call('GET','/me',{account});
  assert(identity.user.email===account.email&&identity.user.username===account.username,'QA identity mismatch');
  return account;
}
function consumerFixture(seat){
  const banks=new Map([['0:-1',{m:10000,e:20000}],['1:0',{m:10000,e:20000}]]),
    status={state:'running',seat,started:true,ended:false,tick:0};
  const C={console,TextEncoder,POP_PLAYER_SLOT:-1,MAXU:20,MAP:3000,heroLvl:10,unitHigh:0,matchLive:true,
    TYPES:[],BT:Object.fromEntries(['pgen','turret','mex','fac','techlab','hq'].map(type=>[type,{name:type}])),
    blds:[],banks,paid:[],AI:{allies:[],bases:[{slot:0}]},commanderSlotForBuilding:B=>B.slot,
    canAfford:(team,m,e,slot)=>banks.get(team+':'+slot).m>=m&&banks.get(team+':'+slot).e>=e,
    pay:(team,m,e,slot)=>{assert(C.canAfford(team,m,e,slot));const bank=banks.get(team+':'+slot);
      bank.m-=m;bank.e-=e;C.paid.push({team,slot,m,e});},
    hasBld:(team,type)=>C.blds.some(B=>B.alive&&B.team===team&&B.type===type&&B.prog>=1),
    toast(){},addEventListener(){},ugen:[],uteam:[],uCmd:[],ualive:[],utype:[],
    MFMatchRuntime:{status:()=>({...status}),registerConsumer(){},submitCommands:commands=>C.submit(commands)},
    MFSocialUI:{state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}}};
  C.window=C;vm.createContext(C);vm.runInContext(upgrades,C);vm.runInContext(consumerSource,C);
  for(let index=0;index<4;index++)C.blds.push({alive:true,prog:1,type:'pgen',team:index<2?0:1,slot:index<2?-1:0,
    lvl:1,tier:1,upT:0,hp:100,hpm:100});
  return {C,status,api:C.MFMatchCommandConsumer,digests:new Map(),
    snapshot:()=>JSON.stringify({banks:[...banks],blds:C.blds,paid:C.paid})};
}
class Peer{
  constructor(url,protocols,fixture,label){
    this.label=label;this.fixture=fixture;this.messages=[];this.waiters=[];this.lastReceived=fixture.api.lastAppliedTick();
    this.rawTicks=new Map();this.withheld=[];this.holdFrom=Infinity;this.failed=null;this.chain=Promise.resolve();this.seq=0;
    this.commandTimers=new Set();this.inputWindow=null;
    this.ws=new WebSocket(url,protocols);sockets.push(this);
    this.opened=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(label+' socket open timeout')),6000);
      this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve();});
      this.ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error(label+' socket handshake failed'));});
    });
    this.ws.addEventListener('message',event=>{
      this.chain=this.chain.then(()=>this.receive(String(event.data))).catch(error=>{
        this.failed=new Error(label+' consumer/wire failure: '+error.message);
        for(const waiter of this.waiters.splice(0)){clearTimeout(waiter.timer);waiter.reject(this.failed);}
      });
    });
    fixture.C.submit=commands=>{
      assert(this.inputWindow&&productionDefaultDelay>=this.inputWindow.min&&productionDefaultDelay<=this.inputWindow.max,
        'Production default is outside the negotiated input window');
      const receipt={seq:++this.seq,targetTick:this.lastReceived+productionDefaultDelay,count:commands.length};
      this.send(frame('commands',{...receipt,commands}));return receipt;
    };
  }
  async receive(text){
    const value=JSON.parse(text),F=this.fixture;
    wire.push({at:Date.now(),peer:this.label,direction:'in',type:value.type,tick:value.tick,
      seq:value.seq,targetTick:value.targetTick,code:value.code,seat:value.seat,lastReceivedTick:this.lastReceived});
    if(value.type==='welcome'){
      this.welcome=value;this.seq=value.lastSeq||this.seq;
      assert(value.inputDelay?.min===expectedInputWindow.min&&value.inputDelay?.max===expectedInputWindow.max,
        'Server did not negotiate the expected release input window');
      this.inputWindow={min:value.inputDelay.min,max:value.inputDelay.max};
      evidence.negotiatedWindows.push({peer:this.label,...this.inputWindow,defaultDelay:productionDefaultDelay});
      if(value.resumed){F.status.state='replaying';assert(F.api.resumeState(value),'Consumer refused resume checkpoint');}
    }
    if(value.type==='tick'){
      this.lastReceived=value.tick;this.rawTicks.set(value.tick,text);
      if(value.tick>=this.holdFrom)this.withheld.push(value.tick);
      else{
        const packet={tick:value.tick,commands:value.commands},promise=F.api.enqueueTick(packet),previous=F.api.lastAppliedTick();
        if(value.tick>previous){assert(F.api.canAdvance(value.tick));assert(F.api.beginTick(value.tick));assert(F.api.commitTick(value.tick));}
        assert.equal(await promise,true);F.status.tick=F.api.lastAppliedTick();F.digests.set(value.tick,hash(F.snapshot()));
      }
      if(this.nextUpgrade){
        const pending=this.nextUpgrade;this.nextUpgrade=null;clearTimeout(pending.timer);
        try{
          const receipt=F.api.submitUpgrade(pending.building,true);assert(receipt,'Fresh-tick upgrade submission failed');
          if(pending.withhold)this.holdFrom=receipt.targetTick;pending.resolve(receipt);
        }catch(error){pending.reject(error);}
      }
    }
    if(value.type==='resumeReadyAck')F.status.state='running';
    for(let i=0;i<this.waiters.length;i++)if(this.waiters[i].match(value)){
      const waiter=this.waiters.splice(i,1)[0];clearTimeout(waiter.timer);waiter.resolve(value);return;
    }
    this.messages.push(value);
  }
  send(value){
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
    assert(!this.nextUpgrade,'One next-tick fixture action at a time');
    return new Promise((resolve,reject)=>{
      const pending={building,withhold,resolve,reject,timer:null};pending.timer=setTimeout(()=>{
        this.nextUpgrade=null;reject(new Error(this.label+' next-tick submission timeout'));
      },6000);this.nextUpgrade=pending;
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
  close(){for(const timer of this.commandTimers)clearTimeout(timer);this.commandTimers.clear();try{this.ws.close(1000,'QA replay check');}catch{}}
}
let a,b,resumed,passed=false;
try{
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
    try{
      const identity=await call('GET','/me',{account});
      assert(identity.user?.email===account.email&&identity.user?.username===account.username,'Cleanup identity mismatch');
      const deleted=await call('POST','/account/delete',{account,body:{}});assert(deleted.ok===true);
      evidence.cleanup.push({label:account.label,deleted:true});
    }catch{evidence.cleanup.push({label:account.label,deleted:false});passed=false;}
    account.token=null;account.password=null;
  }
  evidence.status=passed?'PASS':'FAIL';evidence.finishedAt=new Date().toISOString();
  mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({status:evidence.status,checks:checks.length,evidence:out,cleanup:evidence.cleanup}));
  if(!passed)process.exitCode=1;
}
