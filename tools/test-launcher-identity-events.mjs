/* Launcher identity-state contract regression test.
   Runs the real classic-script source in a tiny browser shell so the launcher
   can rely on events/snapshots without scraping account portal markup. */
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/authportal.js',import.meta.url),'utf8');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};

function makeHarness(fetchImpl){
  const values=new Map(),events=[];
  const ctx={
    console,setTimeout,clearTimeout,TextEncoder,TextDecoder,URL,
    performance:{now:()=>Date.now()},
    requestAnimationFrame:fn=>{fn();return 1;},
    CustomEvent:class CustomEvent{
      constructor(type,options={}){this.type=type;this.detail=options.detail;}
    },
    localStorage:{
      getItem:key=>values.has(key)?values.get(key):null,
      setItem:(key,value)=>values.set(key,String(value)),
      removeItem:key=>values.delete(key)
    },
    document:{
      getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
      createElement:()=>({style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},addEventListener(){}}),
      body:{appendChild(){},classList:{add(){},remove(){},toggle(){}},addEventListener(){}},
      addEventListener(){},removeEventListener(){},activeElement:null
    },
    renderAccount(){},renderMetaHead(){},toast(){},
    fetch:fetchImpl||(async()=>{throw new Error('network unavailable');})
  };
  ctx.window={dispatchEvent:event=>{events.push(event);return true;}};
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:'src/authportal.js'});
  return {ctx,values,events};
}

const run=(h,expression)=>vm.runInContext(expression,h.ctx);
const latest=h=>h.events.at(-1);
const assertClean=detail=>{
  const serialized=JSON.stringify(detail);
  assert(!/token|email|username|commander@example/i.test(serialized),'identity event leaked account data');
  assert(Object.keys(detail).sort().join(',')==='revision,signedIn,source,state,verified',
    'identity event fields changed or include unsanitized data');
};

// A cached session advances only after /me verifies that exact token.
{
  const h=makeHarness(async()=>({ok:true,status:200,json:async()=>({
    user:{email:'commander@example.com',username:'SecretCommander'}
  })}));
  run(h,`AP_CFG={endpoint:'https://auth.test',src:'test',resolved:true};
         AP_SESSION={token:'0123456789abcdef',email:'commander@example.com',expiresAt:0,offline:false};
         AP_SESSION_VERIFIED=false;`);
  await run(h,'apVerifySession()');
  const snapshot=h.ctx.window.MFIdentity.snapshot();
  assert(snapshot.state==='connected'&&snapshot.verified&&snapshot.source==='session-verified',
    'successful cached-session verification did not emit connected');
  assertClean(latest(h).detail);
}

// A late listener can always read the current deterministic boot snapshot.
{
  const h=makeHarness();
  const snapshot=h.ctx.window.MFIdentity.snapshot();
  assert(h.ctx.window.MFIdentity.event==='massfront:identity-state','public event name is missing');
  assert(snapshot.state==='pending'&&!snapshot.signedIn&&!snapshot.verified,'boot snapshot is not pending');
  assertClean(snapshot);
}

// A prior PLAY OFFLINE decision is replayed by mfAuthGate without opening UI.
{
  const h=makeHarness();
  h.values.set('mf_auth_gate_v1','1');
  const snapshot=run(h,'mfAuthGate()');
  assert(snapshot.state==='offline'&&snapshot.source==='remembered-offline','remembered offline choice was not emitted');
  assert(latest(h).type==='massfront:identity-state','identity event name changed');
  assertClean(latest(h).detail);
}

// A cached bearer token is deliberately pending until this process verifies it.
{
  const h=makeHarness();
  run(h,`AP_SESSION={token:'0123456789abcdef',email:'commander@example.com',expiresAt:0,offline:false};
         AP_SESSION_VERIFIED=false;`);
  const snapshot=run(h,'mfAuthGate()');
  assert(snapshot.state==='pending'&&snapshot.signedIn&&!snapshot.verified,
    'cached unverified session was falsely marked connected');
  assert(snapshot.source==='session-verification','cached session did not identify verification wait');
  assertClean(latest(h).detail);
}

// Login/register server responses are trusted session creation paths.
{
  const h=makeHarness();
  run(h,`apSetSessionFrom({token:'0123456789abcdef',expiresAt:0,
    user:{email:'commander@example.com',username:'SecretCommander'}},'commander@example.com')`);
  const snapshot=h.ctx.window.MFIdentity.snapshot();
  assert(snapshot.state==='connected'&&snapshot.signedIn&&snapshot.verified,
    'server-created session did not emit connected');
  assert(snapshot.source==='session-server','connected source is not stable');
  assertClean(latest(h).detail);
}

// PLAY OFFLINE remains an explicit, replayable outcome even without an account.
{
  const h=makeHarness();
  const snapshot=run(h,"apGateSatisfied('offline')");
  assert(snapshot.state==='offline'&&!snapshot.signedIn&&!snapshot.verified,
    'explicit offline choice did not emit offline');
  assert(snapshot.source==='offline-choice','offline source is not stable');
  assert(h.ctx.window.MFIdentity.snapshot().revision===snapshot.revision,
    'late snapshot did not replay the latest state');
  assertClean(latest(h).detail);
}

// Closing the first-run welcome is also an offline continuation, not a stuck pending gate.
{
  const h=makeHarness(),overlay={style:{}};
  h.ctx.document.getElementById=id=>id==='apOverlay'?overlay:null;
  run(h,'AP_GATE_OPEN=true; apClose()');
  const snapshot=h.ctx.window.MFIdentity.snapshot();
  assert(snapshot.state==='offline'&&snapshot.source==='gate-dismissed',
    'closing the identity gate left the launcher pending');
  assertClean(latest(h).detail);
}

assert(/apGateSatisfied\('offline'\)/.test(source),'PLAY OFFLINE button is not wired to the offline outcome');
console.log('launcher identity events: pending, connected, offline, privacy, and late snapshot passed');
