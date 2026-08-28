#!/usr/bin/env node
/* Deterministic, network-free probe for the classic-global auth/social client.
   It executes the shipped source in a VM with a scripted fetch transport. */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const CLIENT=readFileSync(join(ROOT,'src','authportal.js'),'utf8');
const WORKER=readFileSync(join(ROOT,'cloudflare','massfront-auth','src','index.js'),'utf8');
const checks=[];
function check(name,condition,details=''){
  checks.push({name,ok:!!condition,details});
  if(!condition) process.exitCode=1;
}
function response(status,body){
  return {ok:status>=200&&status<300,status,json:async()=>body};
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
function makeHarness({fastTimeout=false}={}){
  const storage=new Map();
  const calls=[];
  let handler=async()=>response(500,{error:'unscripted'});
  const context={
    console,Promise,AbortController,Date,Math,JSON,Map,Set,URL,
    window:{},document:{},
    localStorage:{
      getItem:k=>storage.has(k)?storage.get(k):null,
      setItem:(k,v)=>storage.set(k,String(v)),
      removeItem:k=>storage.delete(k)
    },
    netAllowed:()=>true,
    setTimeout:(fn,ms)=>setTimeout(fn,fastTimeout&&ms===12000?5:ms),
    clearTimeout,
    fetch:async(url,opts={})=>{
      calls.push({url:String(url),path:new URL(String(url)).pathname,opts,
        body:opts.body===undefined?undefined:JSON.parse(opts.body)});
      return handler(String(url),opts);
    }
  };
  vm.createContext(context);
  vm.runInContext(CLIENT,context,{filename:'src/authportal.js'});
  vm.runInContext(`AP_CFG={endpoint:'https://auth.invalid',src:'probe',resolved:true};`,context);
  const setSession=(which='A')=>vm.runInContext(`
    AP_SESSION_EPOCH++;
    AP_SESSION={token:'${which.repeat(64)}',email:'${which.toLowerCase()}@probe.invalid',
      username:'User_${which}',ageOk:true,expiresAt:Date.now()+60000};`,context);
  const session=()=>vm.runInContext(`({token:AP_SESSION&&AP_SESSION.token,
    email:AP_SESSION&&AP_SESSION.email,epoch:AP_SESSION_EPOCH})`,context);
  return {context,calls,setSession,session,setHandler:fn=>{handler=fn;}};
}

check('worker exposes exact friend request route',WORKER.includes("path === '/social/friend/request'"));
check('worker exposes exact friend response route',WORKER.includes("path === '/social/friend/respond'"));
check('worker exposes separate request-list route',WORKER.includes("path === '/social/requests'"));
check('worker exposes abuse-report route',WORKER.includes("path === '/social/report'"));
check('worker exposes capability handshake route',WORKER.includes("path === '/social/capabilities'"));
check('worker exposes friend message routes',WORKER.includes("path === '/social/message/send'")&&
  WORKER.includes("path === '/social/messages'")&&WORKER.includes("path === '/social/message/report'"));
check('worker exposes presence route',WORKER.includes("path === '/social/presence'"));
check('client removed obsolete social mutation paths',
  !CLIENT.includes("'/social/request'")&&!CLIENT.includes("'/social/respond'"));

{
  const h=makeHarness(); h.setSession();
  h.setHandler(async(url)=>{
    const path=new URL(url).pathname;
    if(path==='/social/friends') return response(200,{friends:[{username:'Ally_1'}]});
    if(path==='/social/requests') return response(200,{requests:[{id:17,username:'Rival_2'}]});
    return response(404,{error:'route_not_found'});
  });
  const result=await h.context.window.MFSocial.friends();
  check('friend refresh uses both server list routes',
    h.calls.length===2&&h.calls.some(x=>x.path==='/social/friends')&&
    h.calls.some(x=>x.path==='/social/requests'),h.calls.map(x=>x.path).join(','));
  check('friend refresh normalizes friends and incoming',result.ok&&
    result.friends[0]?.username==='Ally_1'&&result.incoming[0]?.id==='17');
  check('authenticated lists send initiating bearer token',
    h.calls.every(x=>x.opts.headers?.authorization==='Bearer '+'A'.repeat(64)));
}

{
  const h=makeHarness(); h.setSession();
  h.setHandler(async()=>response(200,{ok:true}));
  await h.context.window.MFSocial.request(' Target_3 ');
  await h.context.window.MFSocial.respond('42',true);
  await h.context.window.MFSocial.block('Target_3');
  await h.context.window.MFSocial.unblock('Target_3');
  await h.context.window.MFSocial.report('Target_3','harassment','match 12');
  const paths=h.calls.map(x=>x.path);
  check('mutations use exact deployed routes',JSON.stringify(paths)===JSON.stringify([
    '/social/friend/request','/social/friend/respond','/social/block','/social/unblock','/social/report'
  ]),paths.join(','));
  check('response ID remains server-compatible integer',h.calls[1]?.body?.id===42&&h.calls[1]?.body?.accept===true);
  check('abuse report is bounded and carries explicit context',h.calls[4]?.body?.username==='Target_3'&&
    h.calls[4]?.body?.reason==='harassment'&&h.calls[4]?.body?.context==='match 12');
  const before=h.calls.length;
  const badUser=await h.context.window.MFSocial.request('<img src=x>');
  const badReason=await h.context.window.MFSocial.report('Target_3','x'.repeat(501));
  check('invalid social input is rejected without network traffic',!badUser.ok&&!badReason.ok&&h.calls.length===before);
}

{
  const h=makeHarness(); h.setSession();
  const gate=deferred();
  h.setHandler(async(url)=>{
    await gate.promise;
    return new URL(url).pathname==='/social/friends'
      ? response(200,{friends:[]}) : response(200,{requests:[]});
  });
  const a=h.context.window.MFSocial.friends();
  const b=h.context.window.MFSocial.friends();
  await Promise.resolve(); await Promise.resolve();
  check('concurrent refreshes coalesce to one two-request transaction',h.calls.length===2,`fetches=${h.calls.length}`);
  gate.resolve();
  const [ra,rb]=await Promise.all([a,b]);
  const probe=h.context.window.MFSocial.probe();
  check('coalesced callers receive the same successful state',ra.ok&&rb.ok&&probe.coalesced>=1);
}

{
  const h=makeHarness(); h.setSession('A');
  const held=deferred();
  h.setHandler(async()=>held.promise);
  const old=h.context.apRequest('GET','/save',undefined,true).catch(e=>e);
  await Promise.resolve();
  h.setSession('B');
  held.resolve(response(401,{error:'unauthorized',message:'expired'}));
  const err=await old;
  const now=h.session();
  check('late account-A response is rejected as stale',err?.kind==='stale_session');
  check('late account-A 401 cannot sign account B out',now.token==='B'.repeat(64)&&now.email==='b@probe.invalid');
  check('stale response is observable in telemetry',h.context.window.MFSocial.probe().staleResponses===1);
}

{
  const h=makeHarness(); h.setSession('A');
  const body=deferred();
  h.setHandler(async()=>({ok:true,status:200,json:()=>body.promise}));
  const old=h.context.apRequest('GET','/save',undefined,true).catch(e=>e);
  await Promise.resolve(); await Promise.resolve();
  h.setSession('B');
  body.resolve({save:null});
  const err=await old;
  check('account switch while response body streams is stale too',err?.kind==='stale_session');
  check('streaming account-A body cannot mutate account B',h.session().token==='B'.repeat(64));
}

{
  const h=makeHarness(); h.setSession('A');
  h.setHandler(async()=>response(401,{error:'unauthorized',message:'expired'}));
  const err=await h.context.apRequest('GET','/me',undefined,true).catch(e=>e);
  const probe=h.context.window.MFSocial.probe();
  check('matching 401 clears the expired local session',err?.status===401&&h.session().token===null);
  check('matching 401 is counted',probe.unauthorized===1&&probe.httpErrors===1);
}

{
  const h=makeHarness(); h.setSession();
  h.context.netAllowed=()=>false;
  const result=await h.context.window.MFSocial.friends();
  check('offline preflight returns stable offline UX code',!result.ok&&result.code==='offline');
  check('offline preflight does not touch transport',h.calls.length===0);
}

{
  const h=makeHarness({fastTimeout:true}); h.setSession();
  h.setHandler(async(_url,opts)=>new Promise((_,reject)=>{
    opts.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  }));
  const result=await h.context.window.MFSocial.friends();
  const probe=h.context.window.MFSocial.probe();
  check('hung social request returns bounded timeout UX',!result.ok&&result.code==='timeout');
  check('request timeout is visible in telemetry',probe.timeouts>=1);
}

{
  const h=makeHarness({fastTimeout:true}); h.setSession();
  h.setHandler(async(_url,opts)=>({ok:true,status:200,json:()=>new Promise((_,reject)=>{
    opts.signal.addEventListener('abort',()=>reject(new Error('aborted body')),{once:true});
  })}));
  const result=await h.context.window.MFSocial.friends();
  check('timeout remains active while response body streams',!result.ok&&result.code==='timeout');
}

{
  const h=makeHarness(); h.setSession();
  const many=Array.from({length:514},(_,i)=>({username:`User_${i}`}));
  many[0]={username:'<script>'};
  h.setHandler(async(url)=>new URL(url).pathname==='/social/friends'
    ? response(200,{friends:many}) : response(200,{requests:[]}));
  const result=await h.context.window.MFSocial.friends();
  check('remote social rows are bounded before rendering',result.ok&&result.friends.length<=512);
  check('unsafe remote username is dropped',!result.friends.some(x=>x.username.includes('<')));
  const caps=h.context.window.MFSocial.capabilities();
  check('capabilities start false before an explicit handshake',caps.handshake===false&&caps.version===0&&
    caps.friends===false&&caps.chat===false&&caps.presence===false&&caps.multiplayer===false);
}

{
  const h=makeHarness();h.setSession();
  h.setHandler(async()=>response(200,{protocol:'wrong-server',version:1,
    capabilities:{friends:true,blocking:true,reporting:true,chat:true,presence:true}}));
  const result=await h.context.window.MFSocial.handshake();
  const caps=h.context.window.MFSocial.capabilities();
  check('unknown capability protocol fails closed',!result.ok&&result.code==='bad_response'&&caps.handshake===false&&
    caps.chat===false&&caps.presence===false);
}

{
  const h=makeHarness();h.setSession();
  h.setHandler(async()=>response(200,{protocol:'massfront-social',version:1,
    capabilities:{friends:true,blocking:true,reporting:true,chat:1,presence:'true'}}));
  const result=await h.context.window.MFSocial.handshake();
  check('capability flags require literal true',result.ok&&result.capabilities.handshake===true&&
    result.capabilities.friends===true&&result.capabilities.chat===false&&result.capabilities.presence===false);
}

{
  const h=makeHarness();h.setSession();
  h.setHandler(async(url,opts)=>{
    const u=new URL(url),path=u.pathname;
    if(path==='/social/capabilities')return response(200,{protocol:'massfront-social',version:1,
      capabilities:{friends:true,blocking:true,reporting:true,chat:true,presence:true}});
    if(path==='/social/message/send')return response(201,{message:{id:7,to:'Target_3',body:opts.body?JSON.parse(opts.body).body:'',at:123}});
    if(path==='/social/messages')return response(200,{messages:[
      {id:7,from:'User_A',to:'Target_3',body:'hello',at:123,mine:true,readAt:null},
      {id:6,from:'Target_3',to:'User_A',body:'reply',at:120,mine:false,readAt:122}],
      hasMore:true,nextBefore:6});
    if(path==='/social/presence'&&opts.method==='POST')return response(200,{state:'online',expiresAt:Date.now()+120000});
    if(path==='/social/presence')return response(200,{friends:[{username:'Target_3',state:'away',at:99}],truncated:false});
    if(path==='/social/message/report')return response(201,{reported:true,id:3,messageId:7});
    return response(404,{error:'route_not_found'});
  });
  const sent=await h.context.window.MFSocial.sendMessage(' Target_3 ','  hello\r\n');
  const page=await h.context.window.MFSocial.messages('Target_3',77,20);
  const set=await h.context.window.MFSocial.setPresence('ONLINE');
  const presence=await h.context.window.MFSocial.presence();
  const reported=await h.context.window.MFSocial.reportMessage(7,'harassment');
  const caps=h.context.window.MFSocial.capabilities(),paths=h.calls.map(x=>x.path);
  check('first communication call performs explicit handshake',paths[0]==='/social/capabilities'&&caps.handshake&&caps.chat&&caps.presence,paths.join(','));
  check('message receipt is normalized and bounded',sent.ok&&sent.message?.id===7&&sent.message?.to==='Target_3'&&sent.message?.body==='hello');
  check('message page wrapper preserves keyset contract',page.ok&&page.messages.length===2&&page.hasMore&&page.nextBefore===6&&
    h.calls.find(x=>x.path==='/social/messages')?.url.includes('before=77')&&
    h.calls.find(x=>x.path==='/social/messages')?.url.includes('limit=20'));
  check('presence wrapper has no arbitrary-user query',set.ok&&presence.ok&&presence.friends[0]?.username==='Target_3'&&
    h.calls.find(x=>x.path==='/social/presence'&&x.opts.method==='GET')?.url.endsWith('/social/presence'));
  check('message report uses participant-evidence route',reported.ok&&h.calls.some(x=>x.path==='/social/message/report'&&x.body?.messageId===7));
  check('communication requests keep initiating bearer token',h.calls.every(x=>x.opts.headers?.authorization==='Bearer '+'A'.repeat(64)));
  const probe=h.context.window.MFSocial.probe();
  check('communication telemetry is explicit',probe.handshakes===1&&probe.messagesSent===1&&probe.presenceWrites===1);
}

{
  const h=makeHarness();h.setSession();
  h.setHandler(async()=>response(200,{protocol:'massfront-social',version:1,
    capabilities:{friends:true,blocking:true,reporting:true,chat:false,presence:false}}));
  const result=await h.context.window.MFSocial.sendMessage('Target_3','hello');
  check('disabled handshake prevents speculative message request',!result.ok&&result.code==='feature_disabled'&&
    h.calls.length===1&&h.calls[0].path==='/social/capabilities',h.calls.map(x=>x.path).join(','));
}

{
  const h=makeHarness();h.setSession('A');
  h.setHandler(async()=>response(200,{protocol:'massfront-social',version:1,
    capabilities:{friends:true,blocking:true,reporting:true,chat:true,presence:true}}));
  await h.context.window.MFSocial.handshake();
  check('CONTROL account A completed handshake',h.context.window.MFSocial.capabilities().chat===true);
  h.setSession('B');
  const caps=h.context.window.MFSocial.capabilities();
  check('account switch invalidates old capability truth',caps.handshake===false&&caps.chat===false&&caps.presence===false);
}

{
  const h=makeHarness();h.setSession('A');
  const held=deferred();h.setHandler(async()=>held.promise);
  const old=h.context.window.MFSocial.handshake();
  await Promise.resolve();h.setSession('B');
  held.resolve(response(200,{protocol:'massfront-social',version:1,
    capabilities:{friends:true,blocking:true,reporting:true,chat:true,presence:true}}));
  const result=await old,caps=h.context.window.MFSocial.capabilities();
  check('late account-A handshake cannot enable account B',!result.ok&&caps.handshake===false&&caps.chat===false);
}

{
  const h=makeHarness();h.setSession();
  const before=h.calls.length;
  const long=await h.context.window.MFSocial.sendMessage('Target_3','x'.repeat(501));
  const badPage=await h.context.window.MFSocial.messages('Target_3',0,51);
  const badPresence=await h.context.window.MFSocial.setPresence('invisible');
  check('invalid communication input is local-only',!long.ok&&!badPage.ok&&!badPresence.ok&&h.calls.length===before);
}

for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'}  ${c.name}${c.details?'  '+c.details:''}`);
const passed=checks.filter(x=>x.ok).length;
console.log(`\n${passed}/${checks.length} social client checks passed (no network used)`);
if(process.exitCode) process.exit(process.exitCode);
