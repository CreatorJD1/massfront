/* Real MatchRoom methods, WebCrypto, credential parser and serialized wire
   frames. Storage/socket adapters are in memory; no network or files written. */
import assert from 'node:assert/strict';
import {MatchRoom} from '../src/index.js';

const nativeResponse=globalThis.Response,nativeNow=Date.now,nativeSetTimeout=globalThis.setTimeout,
  nativeClearTimeout=globalThis.clearTimeout;
let now=2000000,timerId=0;const timers=new Map(),checks=[];
Date.now=()=>now;
globalThis.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;};
globalThis.clearTimeout=id=>timers.delete(id);
globalThis.Response=function(body,options){
  return options?.status===101?{status:101,webSocket:options.webSocket,headers:new Headers(options.headers)}:
    new nativeResponse(body,options);
};
class Socket{
  constructor(){this.sent=[];this.closed=false;this.attachment=null;}
  send(text){if(this.closed)throw new Error('socket closed');this.sent.push(text);}
  close(){this.closed=true;}
  serializeAttachment(value){this.attachment=value;}
  deserializeAttachment(){return this.attachment;}
  frames(){return this.sent.map(text=>JSON.parse(text));}
}
globalThis.WebSocketPair=class{
  constructor(){this[0]=new Socket();this[1]=new Socket();this[0].peer=this[1];this[1].peer=this[0];}
};
const frame=(type,extra={})=>({protocol:'massfront-match',v:1,type,...extra});
const hex=n=>String(n).repeat(64);
async function make(saved=null,sockets=[]){
  const writes=[],alarms=[],state={storage:{sql:{exec(){}},get:async()=>saved,
    put:async(k,v)=>{writes.push(structuredClone(v));},setAlarm:async at=>{alarms.push(at);}},
    blockConcurrencyWhile(fn){this.ready=Promise.resolve().then(fn);},
    getWebSockets:()=>sockets.filter(s=>!s.closed),acceptWebSocket:socket=>sockets.push(socket)};
  const room=new MatchRoom(state,{});await state.ready;return {room,state,sockets,writes,alarms};
}
async function admit(H,seat,rosterSize=2,buildVersion='1.33.74'){
  const metadata={matchId:'a'.repeat(32),lobbyId:'b'.repeat(32),userId:seat,seat,rosterSize,
    buildVersion,manifestHash:hex(1),balanceHash:hex(2),rulesHash:hex(3)};
  const response=await H.room.fetch(new Request('https://room.invalid/socket',{headers:{upgrade:'websocket',
    'x-mf-seat-verification':JSON.stringify(metadata)}}));
  assert.equal(response.status,101);const socket=response.webSocket.peer;
  return {socket,welcome:socket.frames().find(f=>f.type==='welcome')};
}
async function pair(roster=2){
  const H=await make();H.a=await admit(H,1,roster);H.b=await admit(H,2,roster);
  if(roster===3)H.c=await admit(H,3,roster);return H;
}
async function step(H){
  assert(H.room.nextTickAt>0);now=Math.ceil(H.room.nextTickAt);
  clearTimeout(H.room.tickTimer);H.room.tickTimer=null;await H.room._runTicks();
}
async function disconnect(H,client){client.socket.close();await H.room.webSocketClose(client.socket,1006);}
async function resume(H,client,cursor,token=client.welcome.resumeToken){
  const suffix=cursor===undefined?'':'.'+cursor;
  return H.room.fetch(new Request('https://room.invalid/socket',{headers:{upgrade:'websocket',
    'x-mf-resume-forwarded':'1','sec-websocket-protocol':`massfront.v1, mf-resume.${client.welcome.seat}.${token}${suffix}`}}));
}
async function send(H,socket,value){await H.room.webSocketMessage(socket,JSON.stringify(value));}
const upgrade=frame('commands',{seq:1,targetTick:2,commands:[{type:'upgrade',building:{id:0,type:'pgen'},scope:'same-type'}]});
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
try{
  await test('1.33.74 mobile window admits 100-150ms delayed commands without rebucketing and preserves legacy bounds',async()=>{
    const H=await pair();assert.deepEqual(H.a.welcome.inputDelay,{min:2,max:18});
    H.room.tick=5;const delayed=frame('commands',{seq:1,targetTick:9,commands:[{type:'move',x:10,y:20}]});
    await send(H,H.a.socket,delayed);assert.equal(H.room.commands.get(9)[0].seq,1);
    assert.deepEqual(H.a.socket.frames().at(-1),frame('ack',{seq:1,targetTick:9,count:1}));
    await send(H,H.a.socket,{...delayed,seq:2,targetTick:6});assert.equal(H.a.socket.frames().at(-1).code,'stale_target_tick');
    await send(H,H.a.socket,{...delayed,seq:2,targetTick:24});assert.equal(H.a.socket.frames().at(-1).code,'future_target_tick');
    const L=await make();L.a=await admit(L,1,2,'1.33.73');L.b=await admit(L,2,2,'1.33.73');
    assert.deepEqual(L.a.welcome.inputDelay,{min:2,max:3});
    await send(L,L.a.socket,frame('commands',{seq:1,targetTick:4,commands:[{type:'move',x:1,y:2}]}));
    assert.equal(L.a.socket.frames().at(-1).code,'future_target_tick');
  });
  await test('missing seat freezes room, preserves accepted future upgrade and forgets elapsed wall time',async()=>{
    const H=await pair();await send(H,H.a.socket,upgrade);await step(H);
    assert.equal(H.room.tick,1);const queued=JSON.stringify(H.room.commands.get(2));
    await disconnect(H,H.a);assert.equal(H.room.nextTickAt,0);now+=9000;await H.room._runTicks();
    assert.equal(H.room.tick,1);assert.equal(JSON.stringify(H.room.commands.get(2)),queued);
    const response=await resume(H,H.a,1);assert.equal(response.status,101);const socket=response.webSocket.peer;
    assert.equal(H.room.tickTimer,null);await H.room._runTicks();assert.equal(H.room.tick,1);
    await send(H,socket,frame('resumeReady',{tick:1}));assert(H.room.nextTickAt>now);
    assert.deepEqual(socket.frames().filter(f=>f.type==='resumeReadyAck'),[frame('resumeReadyAck',{tick:1})]);
    await step(H);assert.equal(H.room.tick,2);
    assert.equal(socket.frames().filter(f=>f.type==='tick'&&f.commands.length).length,1);
    assert.equal(H.room.commands.has(2),false);
  });
  await test('replay includes unchanged nonempty and empty authoritative ticks in exact order',async()=>{
    const H=await pair();await send(H,H.a.socket,upgrade);await step(H);await step(H);await step(H);
    const original=H.b.socket.sent.filter(s=>JSON.parse(s).type==='tick');await disconnect(H,H.a);
    const response=await resume(H,H.a,0);assert.equal(response.status,101);const socket=response.webSocket.peer;
    const messages=socket.frames(),welcome=messages[0];
    assert.equal(welcome.resumeFromTick,0);assert.equal(welcome.replayThroughTick,3);
    assert.equal(welcome.tick,3);assert.equal(welcome.lastSeq,1);
    assert.deepEqual(socket.sent.filter(s=>JSON.parse(s).type==='tick'),original);
    assert.deepEqual(messages.slice(1,5).map(f=>f.type),['tick','tick','tick','replayEnd']);
    assert.deepEqual(messages[4],frame('replayEnd',{tick:3}));
    assert.deepEqual(messages.filter(f=>f.type==='tick').map(f=>f.commands.length),[0,1,0]);
  });
  await test('syncing closes command admission and exact duplicate ready is idempotent',async()=>{
    const H=await pair();await step(H);await disconnect(H,H.a);
    const response=await resume(H,H.a,0),socket=response.webSocket.peer;
    await send(H,socket,{...upgrade,targetTick:3});assert.equal(H.room.seats.get(1).lastSeq,0);
    assert.equal(socket.frames().at(-1).code,'resume_not_ready');
    await send(H,socket,frame('resumeReady',{tick:0}));assert.equal(H.room.seats.get(1).syncing,true);
    await send(H,socket,frame('resumeReady',{tick:1}));const deadline=H.room.nextTickAt;
    await send(H,socket,frame('resumeReady',{tick:1}));assert.equal(H.room.nextTickAt,deadline);
    assert.equal(H.room.seats.get(1).syncing,false);assert.equal(H.room.tick,1);
  });
  await test('resume lastSeq resolves accepted-versus-unaccepted in-flight commands without resubmitting',async()=>{
    const H=await pair();await send(H,H.a.socket,upgrade);
    // Pretend the ack was lost. The accepted command remains in the room.
    H.a.socket.sent=H.a.socket.sent.filter(s=>JSON.parse(s).type!=='ack');await disconnect(H,H.a);
    const response=await resume(H,H.a,0),socket=response.webSocket.peer;
    assert.equal(socket.frames()[0].lastSeq,1);assert.equal(H.room.commands.get(2).length,1);
    await send(H,socket,frame('resumeReady',{tick:0}));await send(H,socket,upgrade);
    assert.equal(socket.frames().at(-1).code,'duplicate_or_stale_sequence');assert.equal(H.room.commands.get(2).length,1);
    const H2=await pair();await disconnect(H2,H2.a);const response2=await resume(H2,H2.a,0);
    assert.equal(response2.webSocket.peer.frames()[0].lastSeq,0);assert.equal(H2.room.commands.size,0);
  });
  await test('old socket generation cannot issue authority after a successful resume',async()=>{
    const H=await pair();await disconnect(H,H.a);const response=await resume(H,H.a,0),socket=response.webSocket.peer;
    await send(H,socket,frame('resumeReady',{tick:0}));await send(H,H.a.socket,upgrade);
    assert.equal(H.room.seats.get(1).lastSeq,0);assert.equal(H.room.commands.size,0);
  });
  await test('concurrent use of one resume capability admits exactly one socket',async()=>{
    const H=await pair();await disconnect(H,H.a);
    const results=await Promise.all([resume(H,H.a,0),resume(H,H.a,0)]);
    assert.equal(results.filter(r=>r.status===101).length,1);
    const reuse=await resume(H,H.a,0);assert.equal(reuse.status,401);
  });
  await test('missing middle frame, future cursor and exhausted history fail before token rotation',async()=>{
    const H=await pair();await step(H);await step(H);await disconnect(H,H.a);
    const generation=H.room.seats.get(1).generation;H.room.replayFrames.delete(1);
    const missing=await resume(H,H.a,0);assert.equal(missing.status,409);
    assert.equal((await missing.json()).error,'resume_history_unavailable');
    assert.equal(H.room.seats.get(1).generation,generation);assert.equal(H.room.seats.get(1).connected,false);
    const future=await resume(H,H.a,3);assert.equal((await future.json()).error,'invalid_resume_cursor');
    H.room.tick=200;assert.equal(H.room._resumePlan(0).code,'resume_history_unavailable');
  });
  await test('frame-count and byte caps independently bound replay memory',async()=>{
    const H=await pair();for(let tick=1;tick<=140;tick++)H.room._recordTick(frame('tick',{tick,commands:[]}));
    assert.equal(H.room.replayFrames.size,128);assert.equal(H.room.replayFrames.keys().next().value,13);
    const large='x'.repeat(1024*1024);
    for(let tick=141;tick<=146;tick++)H.room._recordTick(frame('tick',{tick,commands:[large]}));
    assert(H.room.replayBytes<=4*1024*1024);assert(H.room.replayFrames.size<128);
    assert(H.room.replayFrames.has(146));assert(!H.room.replayFrames.has(141));
  });
  await test('legacy credentials preserve fresh admission and only provably empty resume',async()=>{
    const H=await pair();assert(!Object.hasOwn(H.a.welcome,'resumeFromTick'));await disconnect(H,H.a);
    const empty=await resume(H,H.a,undefined);assert.equal(empty.status,101);
    assert(!Object.hasOwn(empty.webSocket.peer.frames()[0],'resumeFromTick'));
    const H2=await pair();await step(H2);await disconnect(H2,H2.a);
    const gap=await resume(H2,H2.a,undefined);assert.equal((await gap.json()).error,'resume_cursor_required');
  });
  await test('malformed credential cursors are rejected before changing seat state',async()=>{
    const H=await pair();await disconnect(H,H.a);
    for(const cursor of ['-1','01','2147483648','1.5','NaN']){
      const response=await resume(H,H.a,cursor);assert.equal(response.status,401);
      assert.equal(H.room.seats.get(1).connected,false);
    }
  });
  await test('sync timeout preserves original grace and forfeits without hanging other seats',async()=>{
    const H=await pair(3);await disconnect(H,H.a);const deadline=H.room.seats.get(1).disconnectDeadline;
    now+=9000;const response=await resume(H,H.a,0),socket=response.webSocket.peer;
    assert.equal(H.room.seats.get(1).disconnectDeadline,deadline);await disconnect(H,{socket});
    assert.equal(H.room.seats.get(1).disconnectDeadline,deadline);now=deadline+1;
    await H.room.alarm();assert.equal(H.room.seats.get(1).forfeited,true);assert.equal(H.room.ended,false);
    assert(H.room.nextTickAt>now);await step(H);assert.equal(H.room.tick,1);
  });
  await test('normal two-seat reconnect expiry ends the room with deterministic winner',async()=>{
    const H=await pair();await disconnect(H,H.a);now+=10001;await H.room.alarm();
    assert.equal(H.room.ended,true);assert.equal(H.room.tick,0);
    const end=H.b.socket.frames().find(f=>f.type==='matchEnd');assert.equal(end.reason,'forfeit');assert.equal(end.winnerSeat,2);
  });
  await test('restoring active room without exact history ends it rather than replaying stale snapshot',async()=>{
    const H=await pair();await send(H,H.a.socket,upgrade);await step(H);
    const old=H.room._snapshot();old.tick=0; // durable snapshot may precede emitted head
    const restored=await make(old,[H.b.socket]);assert.equal(restored.room.ended,true);
    assert.equal(restored.room.tick,0);assert.equal(restored.room.tickTimer,null);
    assert.equal(restored.room.endReason,'recovery_history_unavailable');
    assert.equal(H.b.socket.frames().at(-1).reason,'recovery_history_unavailable');
    await restored.room._runTicks();assert.equal(restored.room.tick,0);
    assert.equal(restored.writes.at(-1).ended,true);assert.equal(restored.room.commands.get(2).length,1);
  });
  await test('modern resume before roster start waits for readiness before emitting start',async()=>{
    const H=await make();H.a=await admit(H,1);await disconnect(H,H.a);
    const response=await resume(H,H.a,0),socket=response.webSocket.peer;H.b=await admit(H,2);
    assert.equal(H.room.started,false);await send(H,socket,frame('resumeReady',{tick:0}));
    assert.equal(H.room.started,true);assert.equal(socket.frames().filter(f=>f.type==='start').length,1);
  });
  await test('overlapping alarm and timer callbacks cannot emit the same authority twice',async()=>{
    const H=await pair();await send(H,H.a.socket,upgrade);now=Math.ceil(H.room.nextTickAt);
    clearTimeout(H.room.tickTimer);H.room.tickTimer=null;
    await Promise.all([H.room._runTicks(),H.room._runTicks(),H.room.alarm()]);
    assert.equal(H.room.tick,1);assert.equal(H.b.socket.frames().filter(f=>f.type==='tick').length,1);
    assert.equal(H.room.commands.get(2).length,1);assert.equal(H.room.runningTicks,false);
  });
  await test('grace expiry during asynchronous credential rotation cannot revive a seat',async()=>{
    const H=await pair();await disconnect(H,H.a);const rotate=H.room._newResume.bind(H.room);
    H.room._newResume=async seat=>{const token=await rotate(seat);now=seat.disconnectDeadline+1;return token;};
    const response=await resume(H,H.a,0);assert.equal(response.status,401);
    assert.equal(H.room.seats.get(1).connected,false);assert.equal(H.room.seats.get(1).resuming,false);
    await H.room.alarm();assert.equal(H.room.ended,true);
  });
  console.log(JSON.stringify({status:'PASS',checks:checks.length,realMatchRoom:true,network:false,
    replayMaxFrames:128,replayMaxBytes:4*1024*1024}));
}finally{
  globalThis.Response=nativeResponse;Date.now=nativeNow;globalThis.setTimeout=nativeSetTimeout;
  globalThis.clearTimeout=nativeClearTimeout;delete globalThis.WebSocketPair;
}
