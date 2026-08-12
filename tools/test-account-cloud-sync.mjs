/* Focused account-save reconciliation regression test.
   The live Worker contract stays GET/PUT /save; this harness replaces only
   fetch and the DOM shell so it can prove no career is overwritten before an
   explicit choice. */
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/authportal.js', import.meta.url), 'utf8');
const fail = message => { throw new Error(message); };
const assert = (ok, message) => { if (!ok) fail(message); };

function makeHarness(remote){
  const ctx = {
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL,
    performance: { now: () => Date.now() },
    requestAnimationFrame: fn => { fn(); return 1; },
    window: {}, localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document: {
      getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
      createElement: () => ({ style:{}, classList:{toggle(){}}, appendChild(){}, addEventListener(){} }),
      body: { appendChild(){}, classList:{toggle(){}}, addEventListener(){} },
      addEventListener(){}, removeEventListener(){}, activeElement:null,
    },
    META: { xp: 120, cores: 8, researchData: 3, matches: 2, inventory:{gear:{local:1}} },
    __profile: { id:'p1', name:'Local Commander', emblem:'L' },
    __remote: remote,
    __puts: 0, __confirm: null, __error: '', __toast: '',
    activeProf(){ return ctx.__profile; },
    syncPayload(){ return { v:1, at:Date.now(), profile:ctx.__profile, meta:ctx.META }; },
    encodeSave: async () => 'encoded-local',
    decodeSave: async code => {
      if (code !== 'encoded-remote') throw new Error('unexpected encoded save');
      return ctx.__remote;
    },
    metaSave(){}, profSave(){}, applyColor(){}, applySettings(){},
    renderMetaHead(){}, renderProfile(){}, renderAccount(){}, sfx(){},
    toast(message){ ctx.__toast = message; },
    fetch: async (url, opts={}) => {
      if (String(url).endsWith('/save') && (opts.method || 'GET') === 'GET')
        return { ok:true, status:200, json:async()=>({ok:true,payload:ctx.__remote?'encoded-remote':null,at:1700000000000}) };
      if (String(url).endsWith('/save') && opts.method === 'PUT'){
        ctx.__puts++;
        return { ok:true, status:200, json:async()=>({ok:true,at:1700000001000}) };
      }
      throw new Error('unexpected request '+url+' '+(opts.method||'GET'));
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename:'src/authportal.js' });
  vm.runInContext(`
    AP_CFG={endpoint:'https://auth.test',src:'test',resolved:true};
    AP_SESSION={token:'token',email:'commander@example.com',expiresAt:0};
    apRender=function(){};
    apSetError=function(message){__error=message||'';};
    apToast=function(message){__toast=message||'';};
    apConfirm=function(){__confirm=Array.from(arguments);};
  `, ctx);
  return ctx;
}

async function run(ctx, expression){
  return await vm.runInContext(expression, ctx);
}

const remote = {
  v:1, at:1699999999000,
  profile:{id:'other',name:'Cloud Commander',emblem:'C'},
  meta:{xp:900,cores:42,researchData:18,matches:11,inventory:{gear:{cloud:1}}},
};

// Pull must fetch and show a decision, but must not mutate until RESTORE CLOUD.
{
  const h = makeHarness(remote);
  await run(h, 'apPullSave()');
  assert(h.__confirm && h.__confirm[1] === 'RESTORE CLOUD', 'Pull did not offer a restore confirmation');
  assert(h.META.xp === 120, 'Pull overwrote local progress before confirmation');
  h.__confirm[3]();
  assert(h.META.xp === 900 && h.__profile.name === 'Cloud Commander', 'Confirmed Pull did not apply the cloud career');
  assert(await run(h, `AP_SYNC_KIND==='success' && /restored/.test(AP_SYNC_MESSAGE)`), 'Pull success state is not visible');
}

// Push must first read an existing cloud save and cannot PUT until confirmed.
{
  const h = makeHarness(remote);
  await run(h, 'apPushSave()');
  assert(h.__puts === 0, 'Push overwrote an existing cloud save before confirmation');
  assert(h.__confirm && h.__confirm[1] === 'OVERWRITE CLOUD', 'Push did not identify the overwrite action');
  h.__confirm[3]();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(h.__puts === 1, 'Confirmed Push did not upload the device save');
  assert(await run(h, `AP_SYNC_KIND==='success' && /backed up/.test(AP_SYNC_MESSAGE)`), 'Push success state is not visible');
}

// Sign-in comparison offers Cloud, Device and Not Now; it performs no write itself.
{
  const h = makeHarness(remote);
  await run(h, 'apOfferSyncAfterSignIn()');
  assert(h.__confirm && h.__confirm[1] === 'USE CLOUD', 'Sign-in did not offer the cloud save');
  assert(h.__confirm[5] === 'USE THIS DEVICE', 'Sign-in did not offer the device save');
  assert(h.__puts === 0 && h.META.xp === 120, 'Sign-in comparison changed a save without a choice');
}

// A new account has no overwrite risk and offers an explicit first backup.
{
  const h = makeHarness(null);
  await run(h, 'apOfferSyncAfterSignIn()');
  assert(h.__confirm && h.__confirm[1] === 'BACK UP DEVICE', 'New account did not offer first cloud backup');
  assert(h.__puts === 0, 'New-account comparison uploaded without consent');
}

console.log('account cloud sync: pull, push, sign-in choice and overwrite guards passed');
