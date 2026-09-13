/* Regression: career file/cloud restore must reload settings + identity, and
   account fetches must honour the offline gate. */
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync(new URL('../src/account.js', import.meta.url), 'utf8');
const fail = message => { throw new Error(message); };
const assert = (ok, message) => { if (!ok) fail(message); };

function makeHarness(){
  const store = Object.create(null);
  const ctx = {
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder,
    btoa(s){ return Buffer.from(s, 'binary').toString('base64'); },
    atob(s){ return Buffer.from(s, 'base64').toString('binary'); },
    crypto: { subtle: { digest: async () => new Uint8Array(32) } },
    window: {},
    navigator: { onLine: true },
    document: {
      getElementById: () => null, querySelectorAll: () => [],
      createElement: () => ({ style:{}, classList:{toggle(){}}, appendChild(){}, addEventListener(){} }),
      body: { appendChild(){}, classList:{toggle(){}} },
      addEventListener(){},
    },
    localStorage: {
      getItem(k){ return store[k] ?? null; },
      setItem(k,v){ store[k]=String(v); },
      removeItem(k){ delete store[k]; },
    },
    META: {
      xp: 40, cores: 2, researchData: 0, matches: 1, wcPref: 0, color: 'azure',
      settings: { sound:true, music:true, cine:true, fog:true, quality:'high' },
      owned: {}, campaign: { missions: {} }, inventory: { gear:{}, consumables:{}, equipped:{}, ready:[] },
    },
    DEF_SETTINGS: { sound:true, music:true, cine:true, fog:true, quality:'high',
      sfxVol:3, ambVol:3, musicVol:2, voiceVol:3 },
    PROFILES: { active:'p1', list:[{ id:'p1', name:'Local', emblem:'L', char:'', title:'', frame:'steel' }] },
    activeProf(){ return ctx.PROFILES.list[0]; },
    metaHarden(){
      ctx.META.settings = Object.assign({}, ctx.DEF_SETTINGS, ctx.META.settings||{});
    },
    metaSave(){
      store['massfront_meta_'+ctx.PROFILES.active]=JSON.stringify(ctx.META);
      ctx.__saved = JSON.parse(JSON.stringify(ctx.META));
      return true;
    },
    profSave(){
      store.massfront_profiles_v1=JSON.stringify(ctx.PROFILES);
      ctx.__profSaved = true;
      return true;
    },
    applyColor(){ ctx.__color = ctx.META.color; },
    applySettings(){ ctx.__applied = Object.assign({}, ctx.META.settings); },
    renderMetaHead(){}, renderProfile(){}, renderAccount(){}, renderSettings(){},
    renderBoosts(){}, storyRefreshBadge(){}, toast(m){ ctx.__toast = m; },
    netAllowed(){ return ctx.__online !== false; },
    fetch: async () => { ctx.__fetched = true; return { ok:true, json:async()=>({}) }; },
    __online: true, __fetched: false, __applied: null, __color: null, __profSaved: false,
    __saved: null, __toast: '',
    APP_VERSION: 'test',
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename:'src/account.js' });
  return ctx;
}

{
  const h = makeHarness();
  const incoming = {
    v:1, profile:{ name:'Restored', emblem:'R', char:'kai', title:'IRONSIDE', frame:'gold' },
    meta:{
      xp:900, matches:11, color:'violet', wcPref:2,
      settings:{ sound:false, music:false, cine:false, fog:false, quality:'low',
        sfxVol:1, ambVol:2, musicVol:0, voiceVol:1 },
      owned:{ neural:1 },
    },
  };
  h.applyIncoming(incoming, 'game save file', true);
  assert(h.META.xp === 900, 'file load did not replace career XP');
  assert(h.META.settings.cine === false, 'file load did not restore cine=false');
  assert(h.META.settings.quality === 'low', 'file load did not restore quality');
  assert(h.META.settings.ambVol === 2, 'file load did not restore ambience volume');
  assert(h.META.settings.voiceVol === 1, 'file load did not restore voice volume');
  assert(h.__applied && h.__applied.cine === false, 'file load did not applySettings()');
  assert(h.__color === 'violet', 'file load did not applyColor()');
  const p = h.activeProf();
  assert(p.name === 'Restored' && p.char === 'kai' && p.title === 'IRONSIDE' && p.frame === 'gold',
    'file load dropped commander identity (char/title/frame)');
}

{
  const h = makeHarness();
  h.__online = false;
  let threw = false;
  try { await h.accFetch('https://auth.test/save', { method:'GET' }); }
  catch (e){ threw = String(e.message) === 'offline'; }
  assert(threw, 'accFetch did not refuse while offline');
  assert(!h.__fetched, 'accFetch reached the network while offline');
}

{
  const h = makeHarness();
  const remote = { v:1, profile:{ name:'Cloud' }, meta:{ xp:40, matches:1, settings:{ cine:false } } };
  h.cloudMerge(remote);
  assert(h.META.settings.cine !== false, 'similar-score cloud merge overwrote local settings');
}

{
  const h = makeHarness();
  h.META.xp = 10; h.META.matches = 0;
  const remote = {
    v:1, profile:{ name:'Cloud', char:'renn' },
    meta:{ xp:800, matches:20, settings:{ cine:false, quality:'low' }, color:'gold' },
  };
  h.cloudMerge(remote);
  assert(h.META.xp === 800, 'further cloud career was not restored');
  assert(h.__applied && h.__applied.quality === 'low', 'cloud restore skipped applySettings');
  assert(h.activeProf().char === 'renn', 'cloud restore dropped identity');
}

console.log('save persist: file reload, identity, offline gate, cloud merge guards passed');
