import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..'),source=readFileSync(resolve(root,'src/socialui.js'),'utf8');
const MATCH='1'.repeat(32),LOBBY='2'.repeat(32),TOKEN='3'.repeat(64),RESUME1='4'.repeat(64),RESUME2='5'.repeat(64);
const MANIFEST='a'.repeat(64),BALANCE='b'.repeat(64),RULES='c'.repeat(64);
const SETUP={schema:1,mode:'coop',slots:2,map:'aelos_north_medium',seed:'network:'+MATCH+':'+RULES,
  preset:'standard',difficulty:1,playerFaction:'nova',commander:'nova_kai',enemyFaction:'horde',
  goal:'annihilate',timeLimit:600,resPace:1,crateRate:1,infestationOn:false,defenseFocus:0,
  deploymentPackage:'prepared',wildcards:0};
const SETUP_HASH=createHash('sha256').update(JSON.stringify(SETUP)).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate,label){
  for(let i=0;i<100;i++){if(predicate())return;await delay(5);}
  assert.fail(label);
}

function harness(){
  const listeners=new Map(),tickEvents=[],applied=new Map(),applyCount=new Map(),resumeCalls=[];
  let cursor=0,delayed=null,delayTick=-1;
  const addEventListener=(name,fn)=>{const row=listeners.get(name)||[];row.push(fn);listeners.set(name,row);};
  const dispatchEvent=event=>{for(const fn of listeners.get(event.type)||[])fn(event);return true;};
  class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}}
  class MockWebSocket{
    static instances=[];
    constructor(url,protocols){this.url=url;this.protocols=protocols.slice();this.protocol='massfront.v2';this.readyState=0;this.sent=[];this.listeners={};MockWebSocket.instances.push(this);}
    addEventListener(name,fn){(this.listeners[name]||(this.listeners[name]=[])).push(fn);}
    fire(name,event={}){for(const fn of this.listeners[name]||[])fn(event);}
    open(){this.readyState=1;this.fire('open');}
    message(body){this.fire('message',{data:typeof body==='string'?body:JSON.stringify(body)});}
    send(value){this.sent.push(JSON.parse(value));}
    close(code=1000,reason=''){this.readyState=3;this.fire('close',{code,reason});}
    serverClose(){this.readyState=3;this.fire('close',{code:1006,reason:''});}
  }
  const consumer={
    applyTick(packet){return this.enqueueTick(packet);},
    enqueueTick(packet){
      const signature=JSON.stringify(packet.commands);
      if(packet.tick<=cursor)return Promise.resolve(applied.get(packet.tick)===signature);
      if(packet.tick!==cursor+1)return Promise.resolve(false);
      const commit=()=>{cursor=packet.tick;applied.set(packet.tick,signature);applyCount.set(packet.tick,(applyCount.get(packet.tick)||0)+1);return true;};
      if(packet.tick===delayTick&&!delayed)return new Promise((resolve,reject)=>{delayed={commit,resolve,reject};});
      return Promise.resolve(commit());
    },
    lastAppliedTick:()=>cursor,
    resumeState:info=>{resumeCalls.push({...info,cursor});return info.resumeFromTick<=cursor&&info.replayThroughTick-info.resumeFromTick<=128;},
    release(value=true){const d=delayed;delayed=null;delayTick=-1;if(!d)return;if(value instanceof Error)d.reject(value);else d.resolve(value===false?false:d.commit());},
    delay(tick){delayTick=tick;},
  };
  const C={console,window:null,WebSocket:MockWebSocket,CustomEvent,TextEncoder,crypto:webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,
    addEventListener,dispatchEvent,navigator:{onLine:true},
    mfRuntimeCompatibility:async()=>({buildVersion:'1.33.74',manifestHash:MANIFEST,balanceHash:BALANCE}),
    mfGameplayStateHash:async()=> 'd'.repeat(64),
    MFSocial:{signedIn:()=>true,probe:()=>({sessionEpoch:1}),capabilities:()=>({handshake:true,lobbies:true,invites:true,matchLaunch:true,realtimeMatch:true}),
      matchSocketUrl:id=>'ws://match.invalid/'+id,rulesHash:async()=>RULES},
  };
  C.window=C;vm.createContext(C);vm.runInContext(source,C,{filename:'src/socialui.js'});
  C.MFSocialUI.state.lobby={id:LOBBY,rules:{mode:'coop',slots:2,map:'auto'},members:[]};
  C.MFMatchRuntime.registerConsumer(consumer);
  addEventListener('massfront-match:tick',e=>tickEvents.push(e.detail.tick));
  return {C,consumer,MockWebSocket,tickEvents,applyCount,resumeCalls};
}
function welcome(resumed=false){
  const value={protocol:'massfront-match',v:2,type:'welcome',matchId:MATCH,seat:1,tick:resumed?3:0,tickRate:30,
    inputDelay:{min:2,max:18},reconnectGraceMs:10000,resumed,resumeToken:resumed?RESUME2:RESUME1,generation:resumed?2:1,
    compatibility:{buildVersion:'1.33.74',manifestHash:MANIFEST,balanceHash:BALANCE,rulesHash:RULES}};
  if(resumed)Object.assign(value,{resumeFromTick:1,replayThroughTick:3,lastSeq:1});
  return value;
}
const frame=(tick,commands=[])=>({protocol:'massfront-match',v:2,type:'tick',tick,commands});
async function prepareAndStart(socket,C){
  socket.message({protocol:'massfront-match',v:2,type:'prepare',tick:0,seats:[1,2],setup:SETUP,setupHash:SETUP_HASH});
  await waitFor(()=>C.MFMatchRuntime.status().state==='preparing','canonical world did not prepare');
  assert.equal(C.MFMatchRuntime.status().state,'preparing','canonical world must prepare before start');
  assert.equal(await C.MFMatchRuntime.bootstrapReady(SETUP_HASH),true,'tick-zero world acknowledges its hash');
  assert(socket.sent.some(x=>x.type==='bootstrapReady'&&x.tick===0&&x.setupHash===SETUP_HASH&&x.hash==='d'.repeat(64)));
  socket.message({protocol:'massfront-match',v:2,type:'start',tick:0,seats:[1,2]});
  await delay(0);
  assert(socket.sent.some(x=>x.type==='startReady'&&x.tick===0&&x.setupHash===SETUP_HASH),
    'start is acknowledged only after the prepared world is ready');
}

const {C,consumer,MockWebSocket,tickEvents,applyCount,resumeCalls}=harness();
const credential={token:TOKEN,matchId:MATCH,lobbyId:LOBBY,seat:1,userId:9,buildVersion:'1.33.74',manifestHash:MANIFEST,
  balanceHash:BALANCE,rulesHash:RULES,expiresAt:Date.now()+30000};
const admitted=C.mfMatchCredentialHandoff(credential);await delay(0);
const first=MockWebSocket.instances[0];first.open();first.message(welcome(false));await admitted;
await prepareAndStart(first,C);first.message(frame(1));await delay(0);
assert.equal(C.MFMatchRuntime.status().tick,1);
assert.equal(C.MFMatchRuntime.submitCommands([{type:'move',x:10,y:20}]).targetTick,9,'1.33.74 default leaves eight authority ticks for mobile RTT');
assert.equal(C.MFMatchRuntime.submitCommands([{type:'move',x:20,y:30}],18).targetTick,19,'negotiated maximum remains explicitly available');
assert.equal(C.MFMatchRuntime.submitCommands([{type:'move',x:30,y:40}],19),null,'delay above negotiated maximum is rejected');
first.message({protocol:'massfront-match',v:2,type:'ack',seq:1,targetTick:9,count:1});await delay(0);

consumer.delay(2);first.message(frame(2));await delay(0);first.serverClose();await delay(150);
const resumed=MockWebSocket.instances[1];
assert(resumed,'resume socket was not opened');
assert.equal(resumed.protocols[1],`mf-resume.1.${RESUME1}.1`,'resume credential uses actual applied cursor, not received/server head');
consumer.release();await delay(0);
assert.equal(C.MFMatchRuntime.status().tick,1,'stale socket continuation cannot move transport cursor');

resumed.open();resumed.message(welcome(true));await delay(0);
assert.equal(C.MFMatchRuntime.status().state,'replaying');
assert.equal(C.MFMatchRuntime.status().pending,0,'accepted and unaccepted transport submissions are reconciled from server lastSeq');
assert.equal(C.MFMatchRuntime.submitCommands([{type:'move',x:1,y:1}]),null,'commands remain closed during replay');
resumed.message(frame(2));resumed.message(frame(3));await delay(0);
assert.equal(applyCount.get(2),1,'in-flight then replayed exact frame applies once');
assert.deepEqual(tickEvents,[1,2,3],'only the active generation emits the ordered replay cursor');
resumed.message({protocol:'massfront-match',v:2,type:'replayEnd',tick:3});await delay(0);
assert.equal(C.MFMatchRuntime.status().state,'syncing');
assert(resumed.sent.some(x=>x.type==='resumeReady'&&x.tick===3));
assert.equal(C.MFMatchRuntime.submitCommands([{type:'move',x:1,y:1}]),null,'commands remain closed until ready acknowledgement');
resumed.message({protocol:'massfront-match',v:2,type:'resumeReadyAck',tick:3});await delay(0);
assert.equal(C.MFMatchRuntime.status().state,'running');
const next=C.MFMatchRuntime.submitCommands([{type:'move',x:30,y:40}]);
assert.equal(next.seq,2,'unaccepted old sequence is reused only after server lastSeq reconciliation');
assert.deepEqual(resumeCalls,[{resumeFromTick:1,replayThroughTick:3,lastSeq:1,cursor:2}]);

{
  const H=harness(),credential2={token:TOKEN,matchId:MATCH,lobbyId:LOBBY,seat:1,userId:9,buildVersion:'1.33.74',
    manifestHash:MANIFEST,balanceHash:BALANCE,rulesHash:RULES,expiresAt:Date.now()+30000};
  const admitted2=H.C.mfMatchCredentialHandoff(credential2);await delay(0);
  const old=H.MockWebSocket.instances[0];old.open();old.message(welcome(false));await admitted2;
  old.message({protocol:'massfront-match',v:2,type:'prepare',tick:0,seats:[1,2],setup:SETUP,setupHash:SETUP_HASH});
  await waitFor(()=>H.C.MFMatchRuntime.status().state==='preparing','pre-tick setup missing');
  assert.equal(await H.C.MFMatchRuntime.bootstrapReady(SETUP_HASH),true);
  old.serverClose();await delay(150);
  const again=H.MockWebSocket.instances[1];assert(again,'pre-tick reconnect socket opened');again.open();
  again.message({...welcome(false),resumed:true,resumeToken:RESUME2,generation:2,resumeFromTick:0,replayThroughTick:0,lastSeq:0});
  await delay(0);again.message({protocol:'massfront-match',v:2,type:'replayEnd',tick:0});await delay(0);
  again.message({protocol:'massfront-match',v:2,type:'resumeReadyAck',tick:0});await delay(0);
  again.message({protocol:'massfront-match',v:2,type:'start',tick:0,seats:[1,2]});await delay(0);
  assert.equal(H.C.MFMatchRuntime.status().state,'running','pre-tick resume keeps proven setup for reissued start');
  assert(again.sent.some(x=>x.type==='startReady'&&x.setupHash===SETUP_HASH),'reissued start receives a fresh acknowledgement');
  again.message({protocol:'massfront-match',v:2,type:'start',tick:0,seats:[1,2]});await delay(0);
  assert.equal(again.sent.filter(x=>x.type==='startReady').length,2,'duplicate tick-zero start safely refreshes readiness');
  H.C.MFMatchRuntime.close();
}

for(const staleResult of [false,new Error('old consumer failed')]){
  const H=harness(),credential2={token:TOKEN,matchId:MATCH,lobbyId:LOBBY,seat:1,userId:9,buildVersion:'1.33.74',manifestHash:MANIFEST,
    balanceHash:BALANCE,rulesHash:RULES,expiresAt:Date.now()+30000};
  const admitted2=H.C.mfMatchCredentialHandoff(credential2);await delay(0);
  const old=H.MockWebSocket.instances[0];old.open();old.message(welcome(false));await admitted2;
  await prepareAndStart(old,H.C);old.message(frame(1));await delay(0);
  H.consumer.delay(2);old.message(frame(2));await delay(0);old.serverClose();await delay(150);
  assert(H.MockWebSocket.instances[1],'new generation must exist before stale consumer completion');
  H.consumer.release(staleResult);await delay(0);
  assert.notEqual(H.C.MFMatchRuntime.status().state,'error','stale consumer failure cannot terminate the new socket generation');
  H.C.MFMatchRuntime.close();
}

console.log(JSON.stringify({status:'PASS',evidence:{resumeProtocol:resumed.protocols[1],tickEvents,
  tick2Applications:applyCount.get(2),finalState:C.MFMatchRuntime.status().state,nextSeq:next.seq,staleFailuresIgnored:2},
  contract:'actual applied cursor, generation-safe replay, ready acknowledgement and lastSeq reconciliation'}));
