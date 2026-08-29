/* Stage 8 portable-save acceptance.

   This deliberately evaluates the production codec/import functions instead
   of handing applyIncoming() an already-decoded object. The old regression did
   that and could not detect broken .mfsave headers, hashes, browser export, or
   an import that changed the live career while localStorage was full. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const accountSource=await readFile(new URL('../src/account.js',import.meta.url),'utf8');
const metaSource=await readFile(new URL('../src/game/meta.js',import.meta.url),'utf8');
const factionSource=await readFile(new URL('../src/faction-id.js',import.meta.url),'utf8');
const economySource=await readFile(new URL('../src/economy-net.js',import.meta.url),'utf8');
const probeSource=await readFile(new URL('./probe-stage8-save-transfer.mjs',import.meta.url),'utf8');

/* The browser proof shares one canonical evidence directory. Ownership must be
   established before cleanup, and a PASS must require every final artifact. */
const probeGuard=probeSource.indexOf('guard=await acquireVerificationFreeze');
const probePrepare=probeSource.indexOf('legacyArtifactsRemoved=await prepareEvidenceOutput()');
assert.ok(probeGuard>=0&&probePrepare>probeGuard,
  'save-transfer probe cleans shared evidence before acquiring the freeze');
assert.ok(probeSource.includes("const downloadCaptureDir=join(output,'downloads-current')"),
  'save-transfer probe restored timestamped scratch directories');
assert.ok(probeSource.includes("verifyArtifact('download'")&&
  probeSource.includes("verifyArtifact('corrupt save'")&&
  probeSource.includes("verifyArtifact('screenshot'"),
  'save-transfer probe can report PASS without all final artifacts');
assert.ok(probeSource.includes('reportPath:null'),
  'a blocked competing probe can overwrite the active shared report');

function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing production '+name+'()');
  const open=source.indexOf('{',start);
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(lineComment){ if(ch==='\n') lineComment=false; continue; }
    if(blockComment){ if(ch==='*'&&next==='/'){ blockComment=false;i++; } continue; }
    if(quote){
      if(escaped){ escaped=false; continue; }
      if(ch==='\\'){ escaped=true; continue; }
      if(ch===quote) quote='';
      continue;
    }
    if(ch==='/'&&next==='/'){ lineComment=true;i++;continue; }
    if(ch==='/'&&next==='*'){ blockComment=true;i++;continue; }
    if(ch==='\''||ch==='"'||ch==='`'){ quote=ch;continue; }
    if(ch==='{') depth++;
    else if(ch==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error('unterminated production '+name+'()');
}

const profKeyMatch=/\bconst\s+PROF_KEY\s*=\s*'([^']+)'/.exec(metaSource);
assert.ok(profKeyMatch,'missing PROF_KEY in production meta source');
const PROF_KEY=profKeyMatch[1];
const META_KEY='massfront_meta_p1';
const productionPersistence=[
  extractFunction(metaSource,'profSave'),
  extractFunction(metaSource,'metaSave')
].join('\n');
const productionMetaFresh=extractFunction(metaSource,'metaFresh');
const productionMetaHarden=extractFunction(metaSource,'metaHarden');
const productionCoreGrantId=extractFunction(metaSource,'metaCoreGrantId');
const migrationStart=metaSource.indexOf('const ARMORY_RETIRED_OVERLAPS');
const migrationEnd=metaSource.indexOf('const META_DEF',migrationStart);
assert.ok(migrationStart>=0&&migrationEnd>migrationStart,'missing production Armory migration block');
const productionMigration=metaSource.slice(migrationStart,migrationEnd);

function plain(value){ return JSON.parse(JSON.stringify(value)); }
function quotaError(){
  const error=new Error('Storage quota exhausted');
  error.name='QuotaExceededError';
  return error;
}

class TestStorage{
  constructor(initial={}){
    this.records=new Map(Object.entries(initial).map(([key,value])=>[key,String(value)]));
    this.failKeys=new Set();
    this.throwOnceKeys=new Set();
    this.thrownOnceKeys=new Set();
    this.discardKeys=new Set();
    this.failAfter=null;
    this.writes=[];
  }
  getItem(key){ return this.records.has(key)?this.records.get(key):null; }
  setItem(key,value){
    value=String(value);this.writes.push({key,value});
    if(this.failAfter!=null&&this.writes.length>this.failAfter) throw quotaError();
    if(this.throwOnceKeys.has(key)&&!this.thrownOnceKeys.has(key)){
      this.thrownOnceKeys.add(key);throw quotaError();
    }
    if(this.failKeys.has(key)) throw quotaError();
    if(!this.discardKeys.has(key)) this.records.set(key,value);
  }
  removeItem(key){ this.records.delete(key); }
  value(key){ const value=this.getItem(key);return value==null?null:JSON.parse(value); }
}

const oldProfile={id:'p1',name:'Local',emblem:'L',char:'kai',title:'VETERAN',frame:'steel'};
const oldProfiles={active:'p1',seq:1,list:[oldProfile]};
const oldMeta={
  xp:120,cores:4,researchData:2,matches:3,color:'azure',owned:{starter:1},
  facWins:{},mapWins:{},campaign:{missions:{}},coreGrantPending:[],
  res:{targetOnlyResearch:1},
  inventory:{gear:{target_only_gear:1},consumables:{},equipped:{weapon:'target_only_gear',armor:'',utility:''},ready:[]},
  setup:{pf:'syndicate',f:'brood'},
  settings:{sound:true,music:true,cine:true,fog:true,quality:'high'}
};
const incoming={
  v:1,
  profile:{name:'Transferred',emblem:'T',char:'renn',title:'IRONSIDE',frame:'gold'},
  meta:{
    xp:940,cores:18,researchData:12,matches:21,color:'violet',owned:{neural:1,col_violet:1},
    facWins:{nova:5},mapWins:{aelos:3},campaign:{missions:{intro:{stars:3}}},
    settings:{sound:false,music:false,cine:false,fog:false,quality:'low'}
  }
};

function makeHarness(options={}){
  const priorMeta=plain(options.meta||oldMeta),priorProfiles=plain(options.profiles||oldProfiles);
  const initial={};
  if(!options.omitProfileRecord) initial[PROF_KEY]=JSON.stringify(priorProfiles);
  if(!options.omitMetaRecord) initial[META_KEY]=JSON.stringify(priorMeta);
  if(options.economyQueue) initial.massfront_econ_queue_v1=JSON.stringify(options.economyQueue);
  const storage=new TestStorage(initial);
  const toasts=[],downloads=[],revoked=[],timers=[],intervals=[],warnings=[];
  const ctx={
    console:{log(){},warn(...args){warnings.push(args.map(String).join(' '));},error(){}},
    TextEncoder,TextDecoder,File,Blob,Response,DataView,Uint8Array,
    crypto:globalThis.crypto,
    btoa(value){ return Buffer.from(value,'binary').toString('base64'); },
    atob(value){ return Buffer.from(value,'base64').toString('binary'); },
    localStorage:storage,
    META:plain(priorMeta),
    PROFILES:plain(priorProfiles),
    META_DEF:{xp:0,cores:0,researchData:0,owned:{},color:'azure',wins:0,matches:0,
      standardMatches:0,kills:0,wcPref:0,losses:0,streak:0,bestStreak:0,playSec:0,
      built:0,lost:0,structs:0,bestKills:0,fastestWin:0,favFac:'',facWins:{},mapWins:{},
      firstPlayed:0,lastPlayed:0,campaign:{missions:{}},settings:{}},
    DEF_SETTINGS:{sound:true,music:true,cine:true,fog:true,quality:'high'},
    COLORS:{azure:{},emerald:{},gold:{},violet:{},frost:{}},
    APP_VERSION:'1.33.48-test',
    window:{addEventListener(){}},
    navigator:options.navigator||{},
    document:{
      visibilityState:'visible',
      addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},
      createElement(tag){
        assert.equal(tag,'a','save download created an unexpected element');
        const anchor={tag,href:'',download:'',style:{},
          click(){ downloads.push({href:this.href,name:this.download}); },remove(){this.removed=true;}};
        return anchor;
      },
      body:{appendChild(node){node.appended=true;return node;},classList:{toggle(){}}}
    },
    URL:{
      createObjectURL(file){ ctx.__exportedFile=file;return 'blob:massfront-save-test'; },
      revokeObjectURL(url){ revoked.push(url); }
    },
    setTimeout(fn,delay){ timers.push(delay);fn();return timers.length; },
    clearTimeout(){},setInterval(fn,delay){intervals.push({fn,delay});return intervals.length;},clearInterval(){},
    toast(message){ toasts.push(String(message)); },
    activeProf(){ return ctx.PROFILES.list.find(item=>item.id===ctx.PROFILES.active)||ctx.PROFILES.list[0]; },
    renderMetaHead(){},renderProfile(){},renderAccount(){},renderSettings(){},
    renderBoosts(){},storyRefreshBadge(){},applyColor(){},applySettings(){},
    netAllowed(){return false;},
    mfGuessMobile(){return false;},mfGpuTier(){return null;},
    fetch(){ throw new Error('network is forbidden in save transfer acceptance'); },
    __networkCalls:0,
    __exportedFile:null
  };
  if(!options.productionMigration) ctx.armoryRetireOverlaps=()=>({changed:false});
  if('showSaveFilePicker' in options) ctx.showSaveFilePicker=options.showSaveFilePicker;
  vm.createContext(ctx);
  vm.runInContext(
    'const PROF_KEY='+JSON.stringify(PROF_KEY)+';\n'+
    "function metaKey(){return 'massfront_meta_'+PROFILES.active;}\n"+
    (options.productionMigration?productionMigration+'\n':productionCoreGrantId+'\n')+
    productionMetaFresh+'\n'+productionMetaHarden+'\nlet metaSaveWarned=false;\n'+productionPersistence,
    ctx,{filename:'src/game/meta.js#stage8-save-persistence'});
  vm.runInContext(accountSource+`\n;globalThis.__stage8SaveTest={
    sync:function(){return JSON.parse(JSON.stringify(SYNC));},
    cloud:function(){return JSON.parse(JSON.stringify(CLOUD));}
  };`,ctx,{filename:'src/account.js'});
  if(options.productionMigration)
    vm.runInContext('globalThis.__stage8CoreGrants=function(){return JSON.parse(JSON.stringify(metaCoreGrantQueue()));};',ctx);
  if(options.factionTakeover) vm.runInContext(factionSource,ctx,{filename:'src/faction-id.js'});
  if(options.economyTakeover)
    vm.runInContext(economySource+'\ninitEconomyNet();globalThis.__stage8Eco=function(){return JSON.parse(JSON.stringify(ECO));};',ctx,{filename:'src/economy-net.js'});
  return {ctx,storage,toasts,downloads,revoked,timers,intervals,warnings,priorMeta,priorProfiles,
    priorMetaRecord:initial[META_KEY]??null,priorProfileRecord:initial[PROF_KEY]??null};
}

/* A post-init grant rejected by localStorage stays pending, blocks destructive
   server reconciliation, and enters the durable economy queue on the periodic
   retry as soon as storage becomes writable again. */
{
  const h=makeHarness({productionMigration:true,economyTakeover:true});
  const queueKey='massfront_econ_queue_v1';
  h.storage.failKeys.add(queueKey);
  assert.equal(h.ctx.metaGrantCores(7,'post-init retry'),7);
  assert.equal(h.ctx.META.cores,oldMeta.cores+7);
  assert.deepEqual(plain(h.ctx.__stage8CoreGrants()).map(grant=>grant.amount),[7]);
  const stableKey=h.ctx.__stage8CoreGrants()[0].idemKey;
  assert.match(stableKey,/^meta:/,'grant without a caller key did not receive a stable id');
  assert.deepEqual(plain(h.ctx.__stage8Eco().queue),[],'rejected grant remained in the volatile economy queue');
  assert.equal(h.ctx.metaSave(true),true,'pending grant was not written with the credited career');
  assert.deepEqual(h.storage.value(META_KEY).coreGrantPending.map(grant=>grant.amount),[7],
    'pending grant was not durable across an app exit');

  /* Simulate the hardest restart point: the economy event became durable, but
     the subsequent META write that removes the pending copy failed. */
  h.storage.failKeys.delete(queueKey);h.storage.failKeys.add(META_KEY);
  const retry=h.intervals.find(item=>item.delay===45000);
  assert.ok(retry,'economy pending-grant retry interval was not installed');
  retry.fn();
  const durableQueue=h.storage.value(queueKey);
  assert.equal(durableQueue.length,1);assert.equal(durableQueue[0].idemKey,stableKey);
  assert.equal(h.storage.value(META_KEY).coreGrantPending[0].idemKey,stableKey,
    'restart fixture did not retain the stale pending copy');

  const restarted=makeHarness({meta:h.storage.value(META_KEY),economyQueue:durableQueue,
    productionMigration:true,economyTakeover:true});
  assert.deepEqual(plain(restarted.ctx.__stage8CoreGrants()),[],'restart did not replay the pending grant');
  assert.equal(restarted.storage.value(queueKey).length,1,'restart duplicated an already-durable grant');
  assert.equal(restarted.storage.value(queueKey)[0].idemKey,stableKey,
    'restart changed the persisted grant idempotency key');

  assert.deepEqual(plain(h.ctx.__stage8CoreGrants()),[],
    'same-session retry did not move the grant into the economy queue');
}

/* Imported careers retain supported commander colors and deliberately repair
   unsupported historical/test values to the production default. */
for(const [color,expected] of [['violet','violet'],['crimson','azure']]){
  const colorCtx={META:{color,owned:{},facWins:{},mapWins:{},campaign:{missions:{}},coreGrantPending:[],
    res:{},resQueue:[],mats:{alloy:0,circuit:0,isotope:0,relic:0},mods:{},equip:[],settings:{gfxOver:{}}},
    DEF_SETTINGS:{},COLORS:{azure:{},emerald:{},gold:{},violet:{},frost:{}},
    mfGuessMobile:()=>false,mfGpuTier:()=>null,Math,Date};
  vm.createContext(colorCtx);
  vm.runInContext(productionCoreGrantId+'\n'+productionMetaHarden+'\nmetaHarden();',colorCtx);
  assert.equal(colorCtx.META.color,expected,'production hardening returned the wrong commander color for '+color);
}

/* Hardening imported/legacy careers may repair missing ids, but it may never
   silently discard valid pending rewards just because there are more than 64. */
{
  const pending=Array.from({length:80},(_,index)=>({amount:index+1,reason:'offline',idemKey:''}));
  const hardenCtx={META:{coreGrantPending:pending,owned:{},facWins:{},mapWins:{},campaign:{missions:{}},
    res:{},resQueue:[],mats:{alloy:0,circuit:0,isotope:0,relic:0},mods:{},equip:[],
    settings:{gfxOver:{},gfxPhoneMed:1,gfxGpuTier:1}},DEF_SETTINGS:{},
    mfGuessMobile:()=>false,mfGpuTier:()=>null,Math,Date};
  vm.createContext(hardenCtx);
  vm.runInContext(productionCoreGrantId+'\n'+productionMetaHarden+'\nmetaHarden();',hardenCtx);
  const repaired=plain(hardenCtx.META.coreGrantPending);
  assert.equal(repaired.length,80,'career hardening discarded valid pending grants');
  assert.equal(new Set(repaired.map(grant=>grant.idemKey)).size,80,'repaired pending grants did not receive stable unique ids');
}

/* A balance GET that started before a gameplay grant is stale. Its response
   must not replace the locally credited balance even if the grant POST happens
   to finish before that older GET. */
{
  const h=makeHarness({productionMigration:true,economyTakeover:true});
  let resolveBalance,balanceStarted=false;
  h.ctx.netAllowed=()=>true;
  vm.runInContext("var AP_SESSION={token:'stage8-economy'};ECO.endpoint='https://economy.test';ECO.endpointResolved=true;",h.ctx);
  h.ctx.ecoRequest=async(method,path)=>{
    if(path==='/balance'){
      balanceStarted=true;return await new Promise(resolve=>{resolveBalance=resolve;});
    }
    if(path==='/entitlements') return {entitlements:[]};
    if(path==='/grant') return {balance:oldMeta.cores+9};
    throw new Error('unexpected economy request '+method+' '+path);
  };
  const reconcile=h.ctx.ecoReconcile();
  while(!balanceStarted) await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.ctx.metaGrantCores(9,'in-flight grant','stage8:in-flight'),9);
  await new Promise(resolve=>setImmediate(resolve));
  resolveBalance({cores:oldMeta.cores});
  await reconcile;
  assert.equal(h.ctx.META.cores,oldMeta.cores+9,'stale balance GET overwrote an in-flight grant');
  assert.equal(h.ctx.__stage8Eco().confirmed,false,'stale reconciliation was marked confirmed');
}

async function rejectFile(ctx,bytes,label,pattern){
  const before={meta:plain(ctx.META),profiles:plain(ctx.PROFILES)};
  const file=new File([bytes],label+'.mfsave',{type:'application/octet-stream'});
  await assert.rejects(()=>ctx.mfReadFile(file),pattern,label+' was accepted');
  assert.deepEqual(plain(ctx.META),before.meta,label+' changed live META');
  assert.deepEqual(plain(ctx.PROFILES),before.profiles,label+' changed live profiles');
}

let decodedTransfer=null;
/* Production encoder -> actual File -> production decoder. */
{
  const {ctx}=makeHarness({meta:incoming.meta,profiles:{active:'p1',seq:1,list:[{id:'p1',...incoming.profile}]}});
  const bytes=await ctx.mfSaveBytes();
  assert.ok(bytes instanceof Uint8Array,'mfSaveBytes did not return bytes');
  const env=await ctx.mfReadFile(new File([bytes],'roundtrip.mfsave'));
  assert.equal(env.kind,'MASSFRONT_SAVE');
  assert.equal(env.schema,1);
  assert.equal(env.gameVersion,'1.33.48-test');
  assert.equal(env.payload.meta.xp,incoming.meta.xp);
  assert.equal(env.payload.profile.name,incoming.profile.name);
  decodedTransfer=plain(env.payload);

  const flipped=bytes.slice();flipped[20]^=1;
  await rejectFile(ctx,flipped,'payload corruption',/integrity/i);
  await rejectFile(ctx,bytes.slice(0,-1),'truncated digest',/damaged|invalid/i);
  const badMagic=bytes.slice();badMagic[0]^=1;
  await rejectFile(ctx,badMagic,'foreign magic',/not a MASSFRONT/i);
  const badSchema=bytes.slice();new DataView(badSchema.buffer).setUint16(8,2,true);
  await rejectFile(ctx,badSchema,'unsupported schema',/unsupported save version/i);
  await rejectFile(ctx,new Uint8Array(5*1024*1024+1),'oversized file',/invalid save file size/i);
}

/* Deterministic browser-fallback contract: construct a File, click one download
   anchor, and revoke its object URL. The separate hardware probe owns actual
   Chromium download and re-selection evidence. */
{
  const {ctx,downloads,revoked,timers}=makeHarness();
  await ctx.mfWriteFile();
  assert.equal(downloads.length,1,'download fallback did not click exactly once');
  assert.match(downloads[0].name,/^MASSFRONT-Local-\d{8}-\d{4}\.mfsave$/);
  assert.equal(downloads[0].href,'blob:massfront-save-test');
  assert.ok(ctx.__exportedFile instanceof File,'download fallback did not wrap bytes in a File');
  assert.equal(ctx.__exportedFile.name,downloads[0].name);
  assert.deepEqual(revoked,['blob:massfront-save-test'],'download URL was not revoked');
  assert.deepEqual(timers,[30000],'download URL did not use the bounded revoke delay');
  const decoded=await ctx.mfReadFile(ctx.__exportedFile);
  assert.equal(decoded.payload.meta.xp,oldMeta.xp);
}

/* Cancelling the native file picker is a user choice, not permission to start
   a surprise fallback download. */
{
  const aborted=new Error('cancelled');aborted.name='AbortError';
  const {ctx,downloads}=makeHarness({showSaveFilePicker:async()=>{throw aborted;}});
  await ctx.mfWriteFile();
  assert.equal(downloads.length,0,'cancelled picker fell through to download');
}

/* Web downloads must start from Chromium's trusted click path, while a native
   WebView keeps the drift-tolerant pointer-up contract used on real phones. */
for(const native of [false,true]){
  const h=makeHarness(),listeners=[],taps=[];
  const button={textContent:'↓ SAVE FILE',disabled:false,
    addEventListener(type,handler){listeners.push({type,handler});}};
  h.ctx.document.getElementById=id=>id==='saveFileGet'?button:null;
  h.ctx.mfBindTap=(element,handler)=>taps.push({element,handler});
  if(native)h.ctx.window.Capacitor={isNativePlatform:()=>true};
  await h.ctx.initAccounts();
  if(native){
    assert.equal(taps.length,1,'native save control did not use mfBindTap');
    assert.equal(listeners.filter(item=>item.type==='click').length,0,
      'native save control also installed a duplicate click handler');
  }else{
    assert.equal(taps.length,0,'web save control incorrectly used pointer-up binding');
    assert.equal(listeners.filter(item=>item.type==='click').length,1,
      'web save control did not use the trusted click path');
  }
}

function assertRolledBack(h,label){
  assert.deepEqual(plain(h.ctx.META),h.priorMeta,label+' did not restore live career');
  assert.deepEqual(plain(h.ctx.PROFILES),h.priorProfiles,label+' did not restore live identity');
  assert.equal(h.storage.getItem(META_KEY),h.priorMetaRecord,label+' did not restore stored career');
  assert.equal(h.storage.getItem(PROF_KEY),h.priorProfileRecord,label+' did not restore stored profiles');
  assert.notEqual(h.ctx.__stage8SaveTest.sync().state,'ok',label+' reported sync success');
  assert.ok(!h.toasts.some(message=>/restored from/i.test(message)),label+' emitted a restore-success toast');
  assert.ok(h.toasts.some(message=>/storage|space|saved on this device/i.test(message)),
    label+' did not explain the local-storage failure');
}

/* Either record failing must make the import all-or-nothing. */
for(const [label,key] of [['career quota failure',META_KEY],['profile quota failure',PROF_KEY]]){
  const h=makeHarness();h.storage.failKeys.add(key);
  h.ctx.applyIncoming(plain(incoming),'game save file',true);
  assertRolledBack(h,label);
}

/* A WebView can acknowledge setItem while silently retaining an older record.
   Read-back verification catches that just like a thrown quota exception. */
{
  const h=makeHarness();h.storage.discardKeys.add(META_KEY);
  h.ctx.applyIncoming(plain(incoming),'game save file',true);
  assertRolledBack(h,'career read-back mismatch');
}

{
  const h=makeHarness();h.storage.discardKeys.add(PROF_KEY);
  h.ctx.applyIncoming(plain(incoming),'game save file',true);
  assertRolledBack(h,'profile read-back mismatch');
}

/* Both persistence functions promise one retry for a transient WebView write
   rejection, then prove the stored bytes before returning success. */
for(const [label,key,save] of [
  ['career retry',META_KEY,'metaSave'],['profile retry',PROF_KEY,'profSave']
]){
  const h=makeHarness();h.storage.throwOnceKeys.add(key);
  assert.equal(h.ctx[save](),true,label+' did not recover from one rejected write');
  assert.equal(h.storage.writes.filter(write=>write.key===key).length,2,label+' did not retry exactly once');
}

/* An unsaved in-memory career has no old keys to put back. Rollback must remove
   only the records this import created and preserve that prior absence. */
{
  const h=makeHarness({omitMetaRecord:true,omitProfileRecord:true});
  h.storage.failKeys.add(META_KEY);
  h.ctx.applyIncoming(plain(incoming),'game save file',true);
  assertRolledBack(h,'absent-record rollback');
}

/* If storage disappears after the profile write, exact disk rollback is no
   longer possible. The live career still rolls back, but the game must report
   the split-record risk instead of claiming all-or-nothing safety. */
{
  const h=makeHarness();h.storage.failAfter=1;
  h.ctx.applyIncoming(plain(incoming),'game save file',true);
  assert.deepEqual(plain(h.ctx.META),oldMeta,'mid-transaction outage changed live career');
  assert.deepEqual(plain(h.ctx.PROFILES),oldProfiles,'mid-transaction outage changed live profile');
  assert.equal(h.storage.value(META_KEY).xp,oldMeta.xp,'mid-transaction outage changed stored career');
  assert.equal(h.storage.value(PROF_KEY).list[0].name,incoming.profile.name,
    'outage fixture did not leave the expected split record');
  assert.equal(h.ctx.__stage8SaveTest.sync().state,'error');
  assert.ok(h.toasts.some(message=>/keep the game open/i.test(message)),
    'mid-transaction outage did not give explicit recovery guidance');
}

/* Exercise the production Armory retirement and faction-ID takeovers together.
   A lower-score file proves the wrapper forwards force=true; its refund signal
   may publish only after local persistence succeeds. */
{
  const advanced=plain(oldMeta);advanced.xp=9000;advanced.matches=90;
  const legacy={v:1,profile:plain(incoming.profile),meta:{
    xp:10,cores:5,researchData:0,matches:1,color:'azure',owned:{armor:2,trade:1},
    facWins:{dominion:2,brood:1},mapWins:{},campaign:{missions:{}},
    setup:{pf:'dominion',f:'brood'},settings:plain(oldMeta.settings)
  }};
  const h=makeHarness({meta:advanced,productionMigration:true,factionTakeover:true,economyTakeover:true});
  assert.equal(h.ctx.applyIncoming(plain(legacy),'game save file',true),true,
    'loaded faction wrapper dropped forced file import');
  assert.equal(h.ctx.META.xp,10);
  assert.equal(h.ctx.META.cores,1205,'legacy Armory refund did not apply exactly once');
  assert.deepEqual(plain(h.ctx.META.owned),{trade:1});
  assert.deepEqual(plain(h.ctx.META.facWins),{legion:2,horde:1});
  assert.deepEqual(h.storage.value(META_KEY).facWins,{dominion:2,brood:1});
  assert.deepEqual(plain(h.ctx.__stage8CoreGrants()),[],
    'loaded observer left the committed grant in the pre-init queue');
  assert.deepEqual(h.storage.value('massfront_econ_queue_v1').map(grant=>grant.amount),[1200],
    'committed import did not durably queue exactly one retirement grant');

  const failed=makeHarness({meta:advanced,productionMigration:true,factionTakeover:true,economyTakeover:true});
  failed.storage.failKeys.add('massfront_econ_queue_v1');
  assert.equal(failed.ctx.applyIncoming(plain(legacy),'game save file',true),false);
  assert.deepEqual(plain(failed.ctx.META),advanced,'failed legacy import did not restore live career');
  assert.deepEqual(plain(failed.ctx.__stage8CoreGrants()),[],
    'failed legacy import leaked a non-durable retirement grant');
  assert.deepEqual(plain(failed.ctx.__stage8Eco().queue),[],
    'failed economy persistence left an in-memory grant behind');
}

/* The successful path is the actual bytes decoded above, imported into a fresh
   device harness, persisted, and only then announced. */
{
  const h=makeHarness();
  h.ctx.applyIncoming(plain(decodedTransfer),'game save file',true);
  assert.equal(h.storage.value(META_KEY).xp,incoming.meta.xp);
  assert.equal(h.storage.value(PROF_KEY).list[0].name,incoming.profile.name);
  assert.equal(h.ctx.META.xp,incoming.meta.xp);
  assert.equal(h.ctx.PROFILES.list[0].name,incoming.profile.name);
  assert.deepEqual(plain(h.ctx.META.res),{},'older save inherited target-device research');
  assert.deepEqual(plain(h.ctx.META.inventory.gear),{},'older save inherited target-device gear');
  assert.equal('setup' in h.ctx.META,false,'older save inherited target-device match setup');
  assert.equal(h.ctx.__stage8SaveTest.sync().state,'ok');
  assert.ok(h.toasts.some(message=>/restored from game save file/i.test(message)));
}

/* Automatic cloud merge must not retain its optimistic "ok" state when the
   downloaded career could not be made durable locally. */
{
  const h=makeHarness();h.storage.failKeys.add(META_KEY);
  assert.equal(h.ctx.cloudMerge(plain(incoming)),false);
  const cloud=h.ctx.__stage8SaveTest.cloud();
  assert.equal(cloud.state,'error');
  assert.match(cloud.err,/could not verify/i);
}

/* A present but unreadable automatic-cloud payload is not an empty slot. It
   must never mark the account pulled or schedule a blind overwrite. */
{
  const h=makeHarness();let gets=0,puts=0;
  h.ctx.netAllowed=()=>true;
  h.ctx.fetch=async(url,opts={})=>{
    if((opts.method||'GET')==='GET'){
      gets++;return {ok:true,status:200,json:async()=>({payload:'M2AA'})};
    }
    puts++;return {ok:true,status:200,json:async()=>({ok:true})};
  };
  vm.runInContext("AUTH_CFG.syncUrl='https://save.test';var AP_SESSION={token:'stage8-token'};",h.ctx);
  assert.equal(await h.ctx.cloudPull(),false,'unreadable cloud payload reported success');
  const cloud=h.ctx.__stage8SaveTest.cloud();
  assert.equal(gets,1);assert.equal(puts,0,'unreadable cloud payload scheduled an overwrite');
  assert.equal(cloud.state,'error');assert.equal(cloud.pulledFor,'');
  assert.match(cloud.err,/did not overwrite/i);
}

console.log(JSON.stringify({
  ok:true,
  codec:['round-trip','integrity','truncation','magic','schema','size-ceiling'],
  export:['download-fallback','picker-cancel','url-revoke','platform-input-binding'],
  transaction:['decoded-file-import','career-quota-rollback','profile-quota-rollback',
    'readback-rollback','retry-once','absent-record-rollback','outage-warning',
    'replacement-defaults','faction-migration-grant-boundary','grant-storage-retry',
    'grant-restart-replay','stale-reconcile-rejection',
    'color-hardening','cloud-failure-state','cloud-decode-preservation','success']
},null,2));
