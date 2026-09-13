#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'audit','stage15-match-runtime');
mkdirSync(out,{recursive:true});
const checks=[];
function check(name,ok,detail=''){checks.push({name,ok:!!ok,detail});console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));}
const ID='2'.repeat(32),LOBBY='1'.repeat(32),TOKEN='3'.repeat(64),RESUME='4'.repeat(64),RESUME2='5'.repeat(64);
const MANIFEST='a'.repeat(64),BALANCE='b'.repeat(64),RULES='c'.repeat(64),HASH='d'.repeat(64);

const browser=await launchPwBrowser();
async function harness(options={}){
  const page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  const selected=options.selectedProtocol===false?'': 'massfront.v1';
  const gameplay=options.gameplayHash===false?'1234abcd':HASH;
  const gameplayBody=options.gameplayReject?'async()=>{throw new Error("snapshot failed");}':`async()=> '${gameplay}'`;
  await page.setContent(`<!doctype html><html><body><div id="startScreen"><div class="menuStrip"></div></div><div id="inboxMessages"></div><script>
    window.__session=1;window.__now=100000;window.__tuple={buildVersion:'1.33.48',manifestHash:'${MANIFEST}',balanceHash:'${BALANCE}'};
    window.__caps={handshake:true,lobbies:true,invites:true,matchLaunch:true,realtimeMatch:true};
    window.__lobby={id:'${LOBBY}',revision:7,rules:{mode:'coop',slots:4,map:'auto'},members:[]};
    window.__events=[];window.__ticks=[];window.__consumer={applyTick:packet=>{window.__ticks.push({packet,frozen:Object.isFrozen(packet)&&Object.isFrozen(packet.commands)});return true;}};
    window.__realNow=Date.now;Date.now=()=>window.__now;
    class MockWebSocket{
      static OPEN=1;static instances=[];
      constructor(url,protocols){this.url=url;this.protocols=protocols.slice();this.protocol='${selected}';this.readyState=0;this.sent=[];this.closed=[];this.listeners={};MockWebSocket.instances.push(this);}
      addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);}
      fire(type,event){for(const fn of this.listeners[type]||[])fn(event);}
      open(){this.readyState=1;this.fire('open',{});}
      message(value){this.fire('message',{data:typeof value==='string'?value:JSON.stringify(value)});}
      send(value){this.sent.push(JSON.parse(value));}
      close(code,reason){if(this.readyState===3)return;this.readyState=3;this.closed.push({code,reason});this.fire('close',{code:code||1000});}
      serverClose(code=1006){if(this.readyState===3)return;this.readyState=3;this.fire('close',{code});}
    }
    window.WebSocket=MockWebSocket;window.mfRuntimeCompatibility=async()=>({...window.__tuple});window.mfGameplayStateHash=${gameplayBody};
    window.MFSocial={signedIn:()=>true,probe:()=>({sessionEpoch:window.__session}),capabilities:()=>({...window.__caps}),
      matchSocketUrl:id=>'ws://match.invalid/multiplayer/matches/'+id+'/socket',rulesHash:async()=> '${RULES}'};
    window.mfBindTap=(el,fn)=>el.addEventListener('click',fn);window.showFrontScreen=()=>{};window.toast=()=>{};window.sfx=()=>{};window.initAudio=()=>{};
    for(const type of ['status','welcome','start','tick','ack','reject','protocolError','hashAck','hashAgreement','divergence','disconnected','reconnected','forfeit','matchEnd'])
      addEventListener('massfront-match:'+type,e=>window.__events.push({type,detail:e.detail,frozen:Object.isFrozen(e.detail)}));
  </script></body></html>`);
  await page.addScriptTag({path:resolve(root,'src','socialui.js')});
  await page.evaluate(()=>MFMatchRuntime.registerConsumer(window.__consumer));
  return page;
}
function welcome({resumed=false,token=RESUME,generation=1,seat=1,matchId=ID,compat={}}={}){
  return {protocol:'massfront-match',v:1,type:'welcome',matchId,seat,tick:0,tickRate:30,inputDelay:{min:2,max:3},reconnectGraceMs:10000,resumed,
    resumeToken:token,generation,compatibility:{buildVersion:'1.33.48',manifestHash:MANIFEST,balanceHash:BALANCE,rulesHash:RULES,...compat}};
}
function start(){return {protocol:'massfront-match',v:1,type:'start',tick:0,seats:[1,2]};}
function tick(n,commands=[]){return {protocol:'massfront-match',v:1,type:'tick',tick:n,commands};}
async function begin(page,credential={}){
  return page.evaluate(({ID,LOBBY,TOKEN,MANIFEST,BALANCE,RULES,credential})=>{
    const c={token:TOKEN,matchId:ID,lobbyId:LOBBY,seat:1,userId:9,buildVersion:'1.33.48',manifestHash:MANIFEST,balanceHash:BALANCE,rulesHash:RULES,expiresAt:Date.now()+30000,...credential};
    window.__handoff=window.mfMatchCredentialHandoff(c);window.__credentialAfter=c;return Promise.resolve();
  },{ID,LOBBY,TOKEN,MANIFEST,BALANCE,RULES,credential});
}
async function settle(page,ms=20){await page.waitForTimeout(ms);}

try{
  {
    const page=await harness();await begin(page);await settle(page,0);
    const initial=await page.evaluate(()=>{let storage=[0,0];try{storage=[localStorage.length,sessionStorage.length];}catch(e){}return {protocols:WebSocket.instances[0].protocols,token:window.__credentialAfter.token,status:MFMatchRuntime.status(),body:document.body.textContent,storage};});
    check('launch token enters only exact initial WebSocket subprotocol',initial.protocols[0]==='massfront.v1'&&initial.protocols[1]===`mf-seat.1.${TOKEN}`);
    check('launch credential is scrubbed immediately',initial.token===''&&!initial.body.includes(TOKEN)&&initial.storage[0]===0&&initial.storage[1]===0);
    check('commands remain locked before welcome/start',await page.evaluate(()=>MFMatchRuntime.submitCommands([{type:'move',x:1,y:2}])===null));
    await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();s.message(w);},welcome());await settle(page);
    check('strict welcome selects massfront.v1 and exposes no resume token',await page.evaluate(t=>MFMatchRuntime.status().state==='welcomed'&&!JSON.stringify(MFMatchRuntime.status()).includes(t)&&!JSON.stringify(window.__events).includes(t),RESUME));
    await page.evaluate(frame=>WebSocket.instances[0].message(frame),start());await settle(page);
    const submits=await page.evaluate(()=>[MFMatchRuntime.submitCommands([{type:'move',unitIds:[1],x:10,y:20}]),MFMatchRuntime.submitCommands([{type:'attack',unitIds:[1],targetId:2}],3),MFMatchRuntime.submitCommands(new Array(9).fill({type:'move'})),MFMatchRuntime.submitCommands([{type:'chat',body:'x'}]),MFMatchRuntime.submitCommands([{type:'move'}],4)]);
    check('submitCommands assigns monotonic seq and +2/+3 ticks',submits[0].seq===1&&submits[0].targetTick===2&&submits[1].seq===2&&submits[1].targetTick===3);
    check('outbound command bounds reject oversized/chat/bad-delay frames',submits.slice(2).every(x=>x===null));
    const sent=await page.evaluate(()=>WebSocket.instances[0].sent);
    check('outbound frames use exact versioned command envelope',sent.length===2&&sent.every(x=>x.protocol==='massfront-match'&&x.v===1&&x.type==='commands'));
    await page.evaluate(({ack,tick1})=>{const s=WebSocket.instances[0];s.message(ack);s.message(tick1);},{ack:{protocol:'massfront-match',v:1,type:'ack',seq:1,targetTick:2,count:1},tick1:tick(1,[{seat:1,seq:1,commands:[{type:'move',unitIds:[1],x:10,y:20}]}])});await settle(page);
    const applied=await page.evaluate(()=>({ticks:window.__ticks,events:window.__events,status:MFMatchRuntime.status()}));
    check('authoritative tick reaches only registered frozen consumer',applied.ticks.length===1&&applied.ticks[0].packet.tick===1&&applied.ticks[0].frozen&&applied.status.tick===1);
    check('ack and authoritative tick dispatch frozen events',applied.events.some(e=>e.type==='ack'&&e.frozen)&&applied.events.some(e=>e.type==='tick'&&e.frozen));
    await page.evaluate(()=>{const s=WebSocket.instances[0];for(let n=2;n<=30;n++)s.message({protocol:'massfront-match',v:1,type:'tick',tick:n,commands:[]});});await settle(page,80);
    const hashes=await page.evaluate(()=>WebSocket.instances[0].sent.filter(x=>x.type==='stateHash'));
    check('real deterministic hash is sent exactly at tick 30',hashes.length===1&&hashes[0].tick===30&&hashes[0].hash===HASH);
    await page.evaluate(()=>WebSocket.instances[0].message({protocol:'massfront-match',v:1,type:'tick',tick:32,commands:[]}));await settle(page);
    check('out-of-order authoritative tick fails closed with protocol close',await page.evaluate(()=>MFMatchRuntime.status().state==='error'&&WebSocket.instances[0].closed.some(x=>x.code===1002)));
    await page.close();
  }
  {
    const page=await harness({selectedProtocol:false});await begin(page);await settle(page,0);await page.evaluate(()=>WebSocket.instances[0].open());await settle(page);
    check('server subprotocol omission is rejected before welcome',await page.evaluate(()=>MFMatchRuntime.status().state==='error'&&WebSocket.instances[0].closed.some(x=>x.code===1002)));
    await page.close();
  }
  {
    const page=await harness();await begin(page);await settle(page,0);await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();s.message(w);},welcome({seat:2}));await settle(page);
    check('welcome seat mismatch fails closed',await page.evaluate(()=>MFMatchRuntime.status().state==='error'));
    await page.close();
  }
  {
    const page=await harness();await begin(page);await settle(page,0);await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();window.__session=2;s.message(w);},welcome());await settle(page);
    check('account change during welcome is rejected',await page.evaluate(()=>MFMatchRuntime.status().state==='error'&&WebSocket.instances[0].closed.some(x=>x.code===1008)));
    await page.close();
  }
  {
    const page=await harness();await begin(page);await settle(page,0);await page.evaluate(({w,BALANCE})=>{const s=WebSocket.instances[0];s.open();window.__tuple.balanceHash=BALANCE;s.message(w);},{w:welcome(),BALANCE:'e'.repeat(64)});await settle(page);
    check('runtime tuple drift during welcome is rejected',await page.evaluate(()=>MFMatchRuntime.status().state==='error'));
    await page.close();
  }
  {
    const page=await harness();await begin(page);await settle(page,0);await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();s.message(w);},welcome());await settle(page);await page.evaluate(()=>WebSocket.instances[0].serverClose());await settle(page,170);
    const resume1=await page.evaluate(()=>WebSocket.instances[1]&&WebSocket.instances[1].protocols);
    check('reconnect uses seat-bound closure-only resume token',resume1&&resume1[0]==='massfront.v1'&&resume1[1]===`mf-resume.1.${RESUME}`);
    await page.evaluate(w=>{const s=WebSocket.instances[1];s.open();s.message(w);},welcome({resumed:true,token:RESUME2,generation:2}));await settle(page);await page.evaluate(()=>WebSocket.instances[1].serverClose());await settle(page,170);
    const resume2=await page.evaluate(()=>WebSocket.instances[2]&&WebSocket.instances[2].protocols);
    check('resume token rotates on every accepted welcome',resume2&&resume2[1]===`mf-resume.1.${RESUME2}`);
    await page.evaluate(()=>{window.__now+=11000;WebSocket.instances[2].serverClose();});await settle(page);
    check('resume attempts fail closed after the server grace deadline',await page.evaluate(()=>MFMatchRuntime.status().state==='error'));
    await page.close();
  }
  {
    const page=await harness({gameplayHash:false});await begin(page);await settle(page,0);await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();s.message(w);s.message({protocol:'massfront-match',v:1,type:'start',tick:0,seats:[1,2]});for(let n=1;n<=30;n++)s.message({protocol:'massfront-match',v:1,type:'tick',tick:n,commands:[]});},welcome());await settle(page,100);
    check('non-64-hex gameplay hash fails closed instead of being fabricated',await page.evaluate(()=>MFMatchRuntime.status().state==='error'&&WebSocket.instances[0].closed.some(x=>x.code===1011)&&!WebSocket.instances[0].sent.some(x=>x.type==='stateHash')));
    await page.close();
  }
  {
    const page=await harness({gameplayReject:true});await begin(page);await settle(page,0);await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();s.message(w);s.message({protocol:'massfront-match',v:1,type:'start',tick:0,seats:[1,2]});for(let n=1;n<=30;n++)s.message({protocol:'massfront-match',v:1,type:'tick',tick:n,commands:[]});},welcome());await settle(page,100);
    check('gameplay snapshot rejection fails closed without sending a hash',await page.evaluate(()=>MFMatchRuntime.status().state==='error'&&WebSocket.instances[0].closed.some(x=>x.code===1011)&&!WebSocket.instances[0].sent.some(x=>x.type==='stateHash')));
    await page.close();
  }
  {
    const page=await harness();await begin(page);await settle(page,0);await page.evaluate(w=>{const s=WebSocket.instances[0];s.open();s.message(w);},welcome());await settle(page);await page.evaluate(()=>WebSocket.instances[0].message('x'.repeat(262145)));await settle(page);
    check('oversized inbound frame closes with 1009',await page.evaluate(()=>MFMatchRuntime.status().state==='error'&&WebSocket.instances[0].closed.some(x=>x.code===1009)));
    await page.close();
  }
  {
    const page=await harness();await page.evaluate(({ID,LOBBY,TOKEN,MANIFEST,BALANCE,RULES})=>{const c={token:TOKEN,matchId:ID,lobbyId:LOBBY,seat:1,userId:9,buildVersion:'1.33.48',manifestHash:MANIFEST,balanceHash:BALANCE,rulesHash:RULES,expiresAt:Date.now()-1};window.__expired=c;window.__expiredResult=window.mfMatchCredentialHandoff(c).then(()=>null,e=>e.code);},{ID,LOBBY,TOKEN,MANIFEST,BALANCE,RULES});
    check('expired launch credential is rejected before socket creation',await page.evaluate(async()=>await window.__expiredResult==='compatibility_mismatch'&&window.__expired.token===''&&WebSocket.instances.length===0));
    await page.close();
  }
} finally {await closePwBrowser();}

const passed=checks.filter(x=>x.ok).length,source='src/socialui.js';
writeFileSync(resolve(out,'evidence.json'),JSON.stringify({generatedAt:new Date().toISOString(),sourceHash:createHash('sha256').update(readFileSync(resolve(root,source))).digest('hex'),passed,total:checks.length,checks},null,2)+'\n');
console.log(`\n${passed}/${checks.length} Stage 15 match runtime checks passed`);
process.exit(passed===checks.length?0:1);
