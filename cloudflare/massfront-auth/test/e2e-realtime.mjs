#!/usr/bin/env node
/* Real workerd + D1 + SQLite Durable Object WebSocket acceptance. Start a
   local Worker with every lobby flag and MULTIPLAYER_REALTIME_ENABLED=1, then
   run this file. It creates its own two accounts and never contacts production. */
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2),opt=(name,fallback)=>{
  const i=args.indexOf('--'+name);return i>=0&&args[i+1]?args[i+1]:fallback;
};
const BASE=opt('base','http://127.0.0.1:8807').replace(/\/+$/,''),RUN=Date.now().toString(36);
const WSBASE=BASE.replace(/^http/,'ws'),PASSWORD='Realtime-Correct-Horse-9!';
const evidence=[],checks=[];
function check(name,condition,detail=''){
  const pass=!!condition;checks.push({name,pass,detail:String(detail)});
  console.log((pass?'PASS  ':'FAIL  ')+name+(detail?'   ['+detail+']':''));
}
async function call(method,path,{token,body}={}){
  const headers={};if(token)headers.authorization='Bearer '+token;
  if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await res.text();let json=null;try{json=JSON.parse(text);}catch(e){}
  evidence.push({kind:'http',method,path,status:res.status,
    body:json?JSON.parse(JSON.stringify(json,(k,v)=>k==='token'?'<redacted>':v)):text.slice(0,120)});
  return {status:res.status,json,text};
}
async function provision(label){
  const email=`mf-realtime-${RUN}-${label}@example.com`;
  const reg=await call('POST','/register',{body:{email,password:PASSWORD,ageOk:true}});
  if(reg.status!==201&&reg.status!==200)throw new Error('register '+label+' '+reg.status+' '+reg.text);
  const token=reg.json.token;
  await call('POST','/age',{token,body:{ageOk:true}});
  const req=await call('POST','/verify/request',{token});
  if(!req.json||!req.json.code)throw new Error('DEV_ECHO_CODE missing');
  await call('POST','/verify/confirm',{token,body:{code:String(req.json.code)}});
  await call('POST','/username',{token,body:{username:'rt'+label+RUN.slice(-7)}});
  return {token,email};
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class SocketClient{
  constructor(ws,label){
    this.ws=ws;this.label=label;this.messages=[];this.waiters=[];this.lastTick=0;
    ws.addEventListener('message',event=>{
      let value=null;try{value=JSON.parse(String(event.data));}catch(e){return;}
      if(value&&value.type==='tick'&&Number.isSafeInteger(value.tick))this.lastTick=Math.max(this.lastTick,value.tick);
      evidence.push({kind:'socket',client:label,direction:'in',type:value.type,
        tick:value.tick,code:value.code,seat:value.seat});
      for(let i=0;i<this.waiters.length;i++){
        const w=this.waiters[i];if(w.match(value)){this.waiters.splice(i,1);clearTimeout(w.timer);w.resolve(value);return;}
      }
      this.messages.push(value);if(this.messages.length>500)this.messages.shift();
    });
  }
  send(value){
    evidence.push({kind:'socket',client:this.label,direction:'out',type:value.type,
      tick:value.tick,targetTick:value.targetTick,seq:value.seq});
    this.ws.send(JSON.stringify(value));
  }
  wait(type,predicate=()=>true,timeout=5000){
    const match=v=>v&&v.type===type&&predicate(v);
    const index=this.messages.findIndex(match);
    if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
    return new Promise((resolve,reject)=>{
      const waiter={match,resolve,reject,timer:null};
      waiter.timer=setTimeout(()=>{const i=this.waiters.indexOf(waiter);if(i>=0)this.waiters.splice(i,1);
        reject(new Error(this.label+' timeout waiting for '+type));},timeout);
      this.waiters.push(waiter);
    });
  }
  close(){try{this.ws.close(1000,'test disconnect');}catch(e){}}
}
function openOutcome(path,protocols,label,timeout=5000){
  return new Promise(resolve=>{
    const ws=new WebSocket(WSBASE+path,protocols);let done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>{try{ws.close();}catch(e){}finish({ok:false,error:'timeout'});},timeout);
    ws.addEventListener('open',()=>finish({ok:true,client:new SocketClient(ws,label),protocol:ws.protocol}));
    ws.addEventListener('error',()=>finish({ok:false,error:'handshake_rejected'}));
    ws.addEventListener('close',event=>finish({ok:false,error:'closed_'+event.code}));
  });
}
const proto=(kind,seat,token)=>['massfront.v1',`mf-${kind}.${seat}.${token}`];
const frame=(type,extra={})=>Object.assign({protocol:'massfront-match',v:1,type},extra);

let A,B,a=null,b=null,reconnected=null,raceWinner=null;
try{
  A=await provision('a');B=await provision('b');
  const caps=await call('GET','/social/capabilities',{token:A.token});
  check('realtime capability requires and sees the local flag + DO + D1 tables',
    caps.status===200&&caps.json.capabilities.matchLaunch===true&&caps.json.capabilities.realtimeMatch===true,
    JSON.stringify(caps.json&&caps.json.capabilities));
  const made=await call('POST','/multiplayer/lobbies',{token:A.token,
    body:{rules:{mode:'skirmish',slots:2,map:'realtime-e2e'}}});
  const lobby=made.json.lobby;
  const joined=await call('POST','/multiplayer/lobbies/join',{token:B.token,body:{code:lobby.code}});
  const readyA=await call('POST',`/multiplayer/lobbies/${lobby.id}/ready`,{token:A.token,
    body:{revision:joined.json.lobby.revision,ready:true}});
  const readyB=await call('POST',`/multiplayer/lobbies/${lobby.id}/ready`,{token:B.token,
    body:{revision:readyA.json.lobby.revision,ready:true}});
  const revision=readyB.json.lobby.revision;
  const rulesHash=Buffer.from(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(lobby.rules)))).toString('hex');
  const compatibility={revision,buildVersion:'1.33.48',manifestHash:'1'.repeat(64),
    balanceHash:'2'.repeat(64),rulesHash};
  await call('POST',`/multiplayer/lobbies/${lobby.id}/compatibility`,{token:A.token,body:compatibility});
  const afterA=await call('GET',`/multiplayer/lobbies/${lobby.id}`,{token:A.token});
  check('lobby exposes exact per-seat compatibility state',
    afterA.json.lobby.members.filter(m=>m.compatible).length===1&&
    afterA.json.lobby.members.every(m=>Object.hasOwn(m,'compatibilityRevision')),
    JSON.stringify(afterA.json.lobby.members));
  await call('POST',`/multiplayer/lobbies/${lobby.id}/compatibility`,{token:B.token,body:compatibility});
  const launched=await call('POST',`/multiplayer/lobbies/${lobby.id}/launch`,{token:A.token,body:{revision}});
  const match=launched.json.match;
  const ta=await call('POST',`/multiplayer/matches/${match.id}/token`,{token:A.token});
  const tb=await call('POST',`/multiplayer/matches/${match.id}/token`,{token:B.token});
  const bad=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('seat',1,'0'.repeat(64)),'bad');
  check('invalid launch token is rejected before WebSocket upgrade',!bad.ok,bad.error);
  const oa=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('seat',ta.json.credential.seat,ta.json.credential.token),'A');
  check('first verified seat upgrades',oa.ok&&oa.protocol==='massfront.v1',oa.error||oa.protocol);a=oa.client;
  const welcomeA=await a.wait('welcome');
  const replay=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('seat',ta.json.credential.seat,ta.json.credential.token),'replay');
  check('single-use launch token replay is rejected before 101',!replay.ok,replay.error);
  const ob=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('seat',tb.json.credential.seat,tb.json.credential.token),'B');
  check('second verified seat upgrades',ob.ok&&ob.protocol==='massfront.v1',ob.error||ob.protocol);b=ob.client;
  await b.wait('welcome');await a.wait('start');await b.wait('start');

  const hzFrom=a.lastTick,hzTarget=hzFrom+30,hzAt=Date.now();
  await a.wait('tick',m=>m.tick===hzTarget,2500);
  const hzElapsed=Date.now()-hzAt;
  check('room advances a contiguous fixed 30Hz tick stream',hzElapsed>=750&&hzElapsed<=1400,
    '30 ticks in '+hzElapsed+'ms');

  await sleep(10);
  const baseTick=a.lastTick,target=baseTick+3;
  const commandA=frame('commands',{seq:1,targetTick:target,commands:[{type:'move',entityIds:[7],x:10,y:20}]});
  a.send(commandA);await a.wait('ack',m=>m.seq===1);
  a.send(commandA);
  check('duplicate sequence gets an explicit rejection',
    (await a.wait('reject',m=>m.seq===1)).code==='duplicate_or_stale_sequence');
  const relayed=await b.wait('tick',m=>m.tick===target,6000);
  check('accepted command relays on its deterministic delayed tick',
    relayed.commands.length===1&&relayed.commands[0].seat===1&&relayed.commands[0].seq===1,
    JSON.stringify(relayed.commands));
  await a.wait('tick',m=>m.tick>target);
  const nowTick=a.lastTick;
  a.send(frame('commands',{seq:2,targetTick:nowTick,commands:[{type:'stop',entityIds:[7]}]}));
  check('stale target tick is rejected explicitly',(await a.wait('reject',m=>m.seq===2)).code==='stale_target_tick');
  a.send(frame('commands',{seq:2,targetTick:nowTick+12,commands:[{type:'stop',entityIds:[7]}]}));
  check('future target tick is rejected explicitly',(await a.wait('reject',m=>m.seq===2)).code==='future_target_tick');
  a.send(frame('commands',{seq:2,targetTick:nowTick+3,commands:[{type:'chat',body:'not gameplay'}]}));
  check('socket command moderation rejects text/chat payloads',(await a.wait('reject',m=>m.seq===2)).code==='invalid_commands');

  await sleep(20);
  const common=Math.max(a.lastTick,b.lastTick),targetOrder=common+3;
  a.send(frame('commands',{seq:2,targetTick:targetOrder,commands:[{type:'attack',targetId:9}]}));
  b.send(frame('commands',{seq:1,targetTick:targetOrder,commands:[{type:'move',x:2,y:3}]}));
  await a.wait('ack',m=>m.seq===2);await b.wait('ack',m=>m.seq===1);
  const ordered=await a.wait('tick',m=>m.tick===targetOrder,6000);
  check('same-tick batches are ordered by seat then sequence',
    ordered.commands.length===2&&ordered.commands[0].seat===1&&ordered.commands[1].seat===2,
    JSON.stringify(ordered.commands.map(x=>[x.seat,x.seq])));

  const next30=Math.ceil((a.lastTick+1)/30)*30;
  const tick30=await a.wait('tick',m=>m.tick===next30,8000);
  a.send(frame('stateHash',{tick:tick30.tick,hash:'a'.repeat(64)}));
  b.send(frame('stateHash',{tick:tick30.tick,hash:'a'.repeat(64)}));
  const agreement=await a.wait('hashAgreement',m=>m.tick===tick30.tick);
  check('same-tick matching hashes produce agreement',agreement.hash==='a'.repeat(64));
  const next60=Math.ceil((a.lastTick+1)/30)*30;
  const tick60=await a.wait('tick',m=>m.tick===next60,8000);
  a.send(frame('stateHash',{tick:tick60.tick,hash:'b'.repeat(64)}));
  b.send(frame('stateHash',{tick:tick60.tick,hash:'c'.repeat(64)}));
  const divergence=await b.wait('divergence',m=>m.tick===tick60.tick);
  check('same-tick differing hashes produce deterministic divergence evidence',
    divergence.seats.map(x=>x.seat).join(',')==='1,2');

  a.send(frame('commands',{seq:3,targetTick:a.lastTick+3,
    commands:Array.from({length:9},(_,i)=>({type:'move',entityIds:[i],x:i,y:i}))}));
  check('command batches are bounded',(await a.wait('reject',m=>m.seq===3)).code==='invalid_commands');
  a.ws.send(JSON.stringify(frame('commands',{seq:3,targetTick:a.lastTick+3,
    commands:[{type:'move',blob:'x'.repeat(17000)}]})));
  check('oversized socket messages are explicitly rejected before close',
    (await a.wait('reject',m=>m.code==='message_too_large')).code==='message_too_large');
  await b.wait('disconnected',m=>m.seat===1);
  const theft=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('resume',2,welcomeA.resumeToken),'theft');
  check('resume capability is seat-bound',!theft.ok,theft.error);
  const resumed=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('resume',1,welcomeA.resumeToken),'A2');
  check('valid grace-bounded resume upgrades',resumed.ok,resumed.error);reconnected=resumed.client;
  const welcome2=await reconnected.wait('welcome');
  check('resume rotates the capability',welcome2.resumed===true&&welcome2.resumeToken!==welcomeA.resumeToken);
  const oldReuse=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('resume',1,welcomeA.resumeToken),'old-resume');
  check('rotated resume capability cannot be replayed',!oldReuse.ok,oldReuse.error);

  reconnected.close();await b.wait('disconnected',m=>m.seat===1);
  const race=await Promise.all([
    openOutcome(`/multiplayer/matches/${match.id}/socket`,proto('resume',1,welcome2.resumeToken),'race-a'),
    openOutcome(`/multiplayer/matches/${match.id}/socket`,proto('resume',1,welcome2.resumeToken),'race-b'),
  ]);
  check('concurrent reconnect has exactly one winner',race.filter(x=>x.ok).length===1,
    race.map(x=>x.ok?'open':x.error).join(','));
  raceWinner=race.find(x=>x.ok).client;
  const welcome3=await raceWinner.wait('welcome');

  const nextRateTick=Math.ceil((raceWinner.lastTick+1)/30)*30;
  const latestMultiple=await raceWinner.wait('tick',m=>m.tick===nextRateTick,8000);
  for(let i=0;i<50;i++)raceWinner.send(frame('stateHash',{tick:latestMultiple.tick,hash:'d'.repeat(64)}));
  const limited=await raceWinner.wait('reject',m=>m.code==='rate_limited',5000);
  check('per-socket message rate limit rejects and closes abusive flow',limited.code==='rate_limited');
  await b.wait('disconnected',m=>m.seat===1,5000);
  const afterRate=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('resume',1,welcome3.resumeToken),'A-after-rate');
  check('rate-closed seat can recover only with its current resume capability',afterRate.ok,afterRate.error);
  raceWinner=afterRate.client;const welcome4=await raceWinner.wait('welcome');
  raceWinner.close();await b.wait('disconnected',m=>m.seat===1);
  const forfeited=await b.wait('forfeit',m=>m.seat===1,15000);
  const ended=await b.wait('matchEnd',m=>m.reason==='forfeit',3000);
  check('expired reconnect grace produces a room-owned deterministic forfeit',
    forfeited.reason==='reconnect_timeout'&&ended.winnerSeat===2,
    JSON.stringify({forfeited,ended}));
  const expiredResume=await openOutcome(`/multiplayer/matches/${match.id}/socket`,
    proto('resume',1,welcome4.resumeToken),'expired-resume');
  check('resume after deterministic forfeit is rejected',!expiredResume.ok,expiredResume.error);
}catch(error){
  check('realtime E2E completed without an uncaught error',false,error&&error.stack||error);
}finally{
  if(a)a.close();if(b)b.close();if(reconnected)reconnected.close();if(raceWinner)raceWinner.close();
  await sleep(100);
  if(A)await call('POST','/account/delete',{token:A.token,body:{password:PASSWORD}}).catch(()=>{});
  if(B)await call('POST','/account/delete',{token:B.token,body:{password:PASSWORD}}).catch(()=>{});
  const out={schema:'massfront.realtime-e2e',schemaVersion:1,base:BASE,run:RUN,
    at:new Date().toISOString(),passes:checks.filter(x=>x.pass).length,failures:checks.filter(x=>!x.pass),
    checks,evidence};
  const dir=join(dirname(fileURLToPath(import.meta.url)),'..','.tmp');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'realtime-e2e-evidence.json'),JSON.stringify(out,null,2));
  const failed=checks.filter(x=>!x.pass).length;
  console.log(`\n${checks.length-failed}/${checks.length} checks passed${failed?' — FAILED':' — ALL GREEN'}`);
  process.exitCode=failed?1:0;
}
