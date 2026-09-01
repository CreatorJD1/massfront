#!/usr/bin/env node
/* Network-free contract probe for immutable lobby compatibility and the
   callback-only launch credential handoff. No credential is printed. */
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE=readFileSync(join(ROOT,'src','authportal.js'),'utf8');
const checks=[];
function check(name,ok,detail=''){checks.push(!!ok);console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));}
function response(status,body){return {ok:status>=200&&status<300,status,json:async()=>body};}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
function makeHarness(){
  const storage=new Map(),calls=[];let handler=async()=>response(500,{error:'unscripted'});
  const context={console,Promise,AbortController,Date,Math,JSON,Map,Set,URL,Object,TextEncoder,crypto:webcrypto,
    window:{},document:{},navigator:{onLine:true},netAllowed:()=>true,setTimeout,clearTimeout,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    fetch:async(url,opts={})=>{const call={path:new URL(String(url)).pathname,opts,
      body:opts.body===undefined?undefined:JSON.parse(opts.body)};calls.push(call);return handler(String(url),opts,call);},
    mfRuntimeCompatibility:async()=>({buildVersion:'1.33.48',manifestHash:'a'.repeat(64),balanceHash:'b'.repeat(64)})};
  vm.createContext(context);vm.runInContext(SOURCE,context,{filename:'src/authportal.js'});
  vm.runInContext(`AP_CFG={endpoint:'https://auth.invalid',src:'probe',resolved:true};
    AP_SESSION_EPOCH++;AP_SESSION={token:'${'S'.repeat(64)}',email:'seat@probe.invalid',username:'Seat_1',ageOk:true,expiresAt:Date.now()+60000};
    AP_SOCIAL_CAPS={handshake:true,sessionEpoch:AP_SESSION_EPOCH,checkedAt:Date.now(),version:1,
      friends:true,blocking:true,reporting:true,chat:false,presence:false,onlineCount:false,lobbies:true,invites:true,
      matchLaunch:true,realtimeMatch:false,multiplayer:false,note:'probe'};`,context);
  return {context,calls,storage,setHandler:fn=>{handler=fn;}};
}
const ID='1'.repeat(32),MATCH='2'.repeat(32),TOKEN='3'.repeat(64);
const RULES={mode:'coop',slots:4,map:'Ae!los_01'};
const NORMALIZED={mode:'coop',slots:4,map:'Aelos_01'};
const RULES_HASH=createHash('sha256').update(JSON.stringify(NORMALIZED)).digest('hex');

{
  const h=makeHarness();
  const hash=await h.context.window.MFSocial.rulesHash(RULES);
  check('rules hash uses exact normalized mode-slots-map order',hash===RULES_HASH,hash);
  check('capability keeps realtime gameplay disabled',h.context.window.MFSocial.capabilities().matchLaunch===true&&h.context.window.MFSocial.capabilities().realtimeMatch===false);
}

{
  const h=makeHarness();
  const locked=await h.context.window.MFSocial.onlineHeartbeat();
  check('absent online-count capability blocks heartbeat before network',locked.ok===false&&locked.code==='feature_disabled'&&h.calls.length===0);
  vm.runInContext('AP_SOCIAL_CAPS.onlineCount=true;',h.context);
  h.setHandler(async()=>response(200,{ok:true,count:17,expiresAt:Date.now()+120000,ttlMs:120000}));
  const live=await h.context.window.MFSocial.onlineHeartbeat();
  check('online heartbeat uses authenticated aggregate route',live.ok===true&&live.count===17&&h.calls[0].path==='/social/online/heartbeat'&&h.calls[0].opts.headers.authorization==='Bearer '+'S'.repeat(64));
  check('online client exposes only bounded aggregate fields',Object.keys(live).sort().join(',')==='count,expiresAt,ok,ttlMs');
}

{
  const h=makeHarness();vm.runInContext('AP_SOCIAL_CAPS.onlineCount=true;',h.context);
  h.setHandler(async()=>response(200,{ok:true,count:-1,ttlMs:120000}));
  const bad=await h.context.window.MFSocial.onlineCount();
  check('online count uses exact authenticated read route',h.calls[0].path==='/social/online'&&h.calls[0].opts.method==='GET');
  check('malformed online aggregate fails closed',bad.ok===false&&bad.code==='bad_response');
}

{
  const h=makeHarness();
  h.setHandler(async(url,opts,call)=>response(200,{ok:true,compatibility:{lobbyId:ID,...call.body,submittedAt:123}}));
  const r=await h.context.window.MFSocial.verifyLobbyCompatibility(ID,7,RULES),call=h.calls[0];
  check('compatibility uses exact authenticated route',call.path===`/multiplayer/lobbies/${ID}/compatibility`&&call.opts.headers.authorization==='Bearer '+'S'.repeat(64));
  check('compatibility body is current revision plus runtime tuple and rules hash',JSON.stringify(call.body)===JSON.stringify({revision:7,buildVersion:'1.33.48',manifestHash:'a'.repeat(64),balanceHash:'b'.repeat(64),rulesHash:RULES_HASH}));
  check('exact compatibility receipt is accepted',r.ok===true&&r.compatibility.revision===7);
}

{
  const h=makeHarness();h.context.mfRuntimeCompatibility=async()=>({buildVersion:'1.33.48',manifestHash:'A'.repeat(64),balanceHash:'b'.repeat(64)});
  const r=await h.context.window.MFSocial.verifyLobbyCompatibility(ID,7,RULES);
  check('untrustworthy runtime tuple fails before network',r.ok===false&&r.code==='compatibility_unavailable'&&h.calls.length===0);
}

{
  const h=makeHarness();
  h.setHandler(async(url,opts,call)=>response(200,{ok:true,compatibility:{lobbyId:ID,...call.body,rulesHash:'f'.repeat(64),submittedAt:123}}));
  const r=await h.context.window.MFSocial.verifyLobbyCompatibility(ID,7,RULES);
  check('mismatched compatibility receipt fails closed',r.ok===false&&r.code==='bad_response');
}

{
  const h=makeHarness(),gate=deferred();
  h.setHandler(async(url,opts,call)=>{await gate.promise;return response(200,{ok:true,compatibility:{lobbyId:ID,...call.body,submittedAt:123}});});
  const pending=h.context.window.MFSocial.verifyLobbyCompatibility(ID,7,RULES);
  for(let i=0;i<20&&!h.calls.length;i++)await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext(`AP_SESSION_EPOCH++;AP_SESSION={token:'${'T'.repeat(64)}',email:'other@probe.invalid',expiresAt:Date.now()+60000};`,h.context);
  gate.resolve();const r=await pending;
  check('account switch invalidates in-flight compatibility',r.ok===false&&r.code==='account_changed',JSON.stringify(r));
}

function matchReceipt(){return {id:MATCH,lobbyId:ID,launchRevision:7,rosterSize:4,buildVersion:'1.33.48',
  manifestHash:'a'.repeat(64),balanceHash:'b'.repeat(64),rulesHash:RULES_HASH,expiresAt:Date.now()+60000};}
{
  const h=makeHarness(),match=matchReceipt();h.setHandler(async()=>response(200,{ok:true,match}));
  const r=await h.context.window.MFSocial.getLobby(ID);
  check('non-host lobby poll accepts strict post-launch match receipt',r.ok===true&&r.lobby===null&&r.match.id===MATCH&&
    h.calls[0].path===`/multiplayer/lobbies/${ID}`);
}

{
  const h=makeHarness();h.setHandler(async()=>response(403,{error:'host_only',message:'Only the lobby host can launch the match.'}));
  const r=await h.context.window.MFSocial.launchLobby(ID,7,RULES);
  check('non-host launch denial remains explicit',r.ok===false&&r.code==='host_only');
}

{
  const h=makeHarness(),match=matchReceipt();h.setHandler(async()=>response(201,{ok:true,match}));
  const r=await h.context.window.MFSocial.launchLobby(ID,7,RULES);
  check('host launch uses exact revision route',h.calls[0].path===`/multiplayer/lobbies/${ID}/launch`&&h.calls[0].body.revision===7);
  check('strict match preparation receipt is accepted',r.ok===true&&r.match.id===MATCH);
}

{
  const h=makeHarness(),match=matchReceipt();
  const r=await h.context.window.MFSocial.claimMatchCredential(match,RULES,null);
  check('credential is never claimed without trusted handoff',r.ok===false&&r.code==='handoff_unavailable'&&h.calls.length===0);
}

{
  const h=makeHarness(),match=matchReceipt();let handoffs=0;
  h.setHandler(async()=>response(201,{ok:true,credential:{token:TOKEN,matchId:MATCH,lobbyId:ID,seat:2,userId:41,
    buildVersion:match.buildVersion,manifestHash:match.manifestHash,balanceHash:match.balanceHash,rulesHash:match.rulesHash,expiresAt:Date.now()+30000}}));
  let retained=null;const r=await h.context.window.MFSocial.claimMatchCredential(match,RULES,credential=>{
    retained=credential;if(credential.token===TOKEN)handoffs++;
  });
  check('one credential reaches only callback handoff',handoffs===1&&h.calls.length===1&&h.calls[0].path===`/multiplayer/matches/${MATCH}/token`);
  check('credential result is sanitized',r.ok===true&&!JSON.stringify(r).includes(TOKEN)&&!Object.prototype.hasOwnProperty.call(r.receipt,'token'));
  check('credential object is scrubbed after handoff',retained&&retained.token==='');
  check('credential is not persisted',![...h.storage.values()].some(v=>String(v).includes(TOKEN)));
}

{
  const h=makeHarness(),match=matchReceipt();let handoffs=0;
  h.setHandler(async()=>response(201,{ok:true,credential:{token:TOKEN,matchId:MATCH,lobbyId:ID,seat:2,userId:41,
    buildVersion:match.buildVersion,manifestHash:'f'.repeat(64),balanceHash:match.balanceHash,rulesHash:match.rulesHash,expiresAt:Date.now()+30000}}));
  const r=await h.context.window.MFSocial.claimMatchCredential(match,RULES,()=>{handoffs++;});
  check('credential mismatch never reaches handoff',r.ok===false&&r.code==='bad_response'&&handoffs===0);
}

{
  const h=makeHarness();
  vm.runInContext(`AP_SOCIAL_CAPS.matchLaunch=false;`,h.context);
  const r=await h.context.window.MFSocial.launchLobby(ID,7,RULES);
  check('absent server capability locks launch before network',r.ok===false&&r.code==='feature_disabled'&&h.calls.length===0);
}

const passed=checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} Stage 15 launch client checks passed`);
process.exit(passed===checks.length?0:1);
