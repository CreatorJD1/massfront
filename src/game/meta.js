;
;
/* ============================================================
   META — user accounts (profiles), settings, ranks, cores,
   store, wildcards. All progression is tied to the active profile.
   ============================================================ */
const PROF_KEY='massfront_profiles_v1';
const EMBLEMS=['🎖','⭐','🦅','🐺','💀','🔥','🛡','👑'];
let PROFILES={active:null,seq:0,list:[]};
/* ---------- MASSFRONT character profiles ----------------------------------
   The identity a player wears is now a CHARACTER from the war, not an emoji.
   Every entry is gated on account rank, so the roster is also the progression
   readout: a locked card states the rank that opens it rather than hiding.

   The four here are the canonical faction commanders — the portraits and names
   already exist in assets/factions and src/factions.js, so nothing is invented.
   Adding another is one line: give it an id, a faction key for the portrait,
   and the rank index that unlocks it. `unlock:0` means available from Recruit. */
const CHARACTERS=[
  {id:'kai',      fac:'nova',       nm:'Captain Elara Kai',   role:'Terran Frontline Command', unlock:0},
  {id:'renn',     fac:'syndicate',  nm:'Broker Lys Renn',     role:'Syndicate Coalition',      unlock:2},
  {id:'vex',      fac:'ascendancy', nm:'Lord Darion Vex',     role:'Crimson Dominion',         unlock:5},
  {id:'sovereign',fac:'horde',      nm:'The Brood Sovereign', role:'Brood Swarm',              unlock:8}
];
/* Callsign suffixes. Cosmetic, stacked on top of the chosen commander name. */
const TITLES=[
  {id:'',          nm:'— none —',    unlock:0},
  {id:'IRONSIDE',  nm:'IRONSIDE',    unlock:1},
  {id:'LONGWATCH', nm:'LONGWATCH',   unlock:3},
  {id:'BLACKOUT',  nm:'BLACKOUT',    unlock:5},
  {id:'WARBORN',   nm:'WARBORN',     unlock:7},
  {id:'SOVEREIGN', nm:'SOVEREIGN',   unlock:9}
];
/* Portrait frames — pure CSS, no art dependency, so they cost nothing to ship. */
const FRAMES=[
  {id:'steel',    nm:'STEEL',     unlock:0},
  {id:'bronze',   nm:'BRONZE',    unlock:2},
  {id:'silver',   nm:'SILVER',    unlock:4},
  {id:'gold',     nm:'GOLD',      unlock:6},
  {id:'crimson',  nm:'CRIMSON',   unlock:8},
  {id:'warmaster',nm:'WARMASTER', unlock:9}
];
function charById(id){ return CHARACTERS.find(c=>c.id===id)||null; }
function charUnlocked(entry){ return metaRankIdx() >= (entry.unlock|0); }
function charPortrait(id){
  const c=charById(id); if(!c) return null;
  return './assets/factions/'+c.fac+'_192.jpg';
}
/* The identity actually in force. Falls back to the rank emblem so a profile
   that predates this system, or one whose character is no longer unlocked
   (a reset career), still renders something meaningful instead of a gap. */
function profIdentity(){
  const P=activeProf()||{}, R=RANKS[metaRankIdx()];
  const c=charById(P.char);
  const usable=c&&charUnlocked(c)?c:null;
  const t=TITLES.find(x=>x.id===P.title&&charUnlocked(x));
  return {char:usable, portrait:usable?charPortrait(usable.id):null,
          emblem:P.emblem||R.em, frame:(FRAMES.find(f=>f.id===P.frame&&charUnlocked(f))||FRAMES[0]).id,
          title:t&&t.id?t.id:'', rank:R};
}


function profSave(){
  let text;
  try{ text=JSON.stringify(PROFILES); }
  catch(e){ return false; }
  try{ localStorage.setItem(PROF_KEY,text); if(localStorage.getItem(PROF_KEY)===text)return true; }
  catch(e){}
  /* Some Android WebViews briefly reject a write while their storage process
     is being resumed. Match career saves and retry once before reporting the
     record as unavailable; callers that need atomicity can trust the boolean. */
  try{ localStorage.setItem(PROF_KEY,text); return localStorage.getItem(PROF_KEY)===text; }
  catch(e2){ return false; }
}
function profLoad(){
  try{ const s=localStorage.getItem(PROF_KEY); const o=s&&JSON.parse(s);
    if(o&&Array.isArray(o.list)) PROFILES=o; }catch(e){}
  if(!Array.isArray(PROFILES.list)) PROFILES.list=[];
  if(!PROFILES.list.length){
    const id='p'+(++PROFILES.seq);
    PROFILES.list.push({id,name:'Commander',emblem:'🎖'});
    PROFILES.active=id;
    try{ const legacy=localStorage.getItem('massfront_meta_v1');   // migrate pre-account progress
      if(legacy) localStorage.setItem('massfront_meta_'+id,legacy);
    }catch(e){}
  }
  if(!PROFILES.list.find(p=>p.id===PROFILES.active)) PROFILES.active=PROFILES.list[0].id;
  profSave();
}
function activeProf(){ return PROFILES.list.find(p=>p.id===PROFILES.active)||PROFILES.list[0]; }

/* menubg: 'live' | 'dim' | 'off'. Defaults to 'dim' — a moving battlefield at
   full strength behind a menu is scenery competing with the thing you came here
   to read. */
/* SCREEN GRADE — a CSS filter on canvas#gl, and the reason it now defaults to
   none. The frame is already graded four times before this stage: the lit pass
   warms the key and cools the shadow side, the present pass composites bloom,
   #grade lays a warm/cool gradient in soft-light (which is itself a contrast
   curve), and #vignette darkens the edges. A CSS contrast() is the fifth, and
   the only one that cannot do the job well: it runs on the composited 8-bit
   sRGB image, pivoting linearly around mid-grey, so there is no headroom left
   to roll off with and it just clips. contrast(1.17) — the old stylesheet
   value — sends everything below 7.3% sRGB to pure black; contrast(1.12) — the
   old cinematic value — takes 5.4%. That is most of the night, interior and
   shadow-side ramp, deleted after the renderer went to the trouble of
   producing it. saturate(1.16) compounds it on faction colours that are
   already near-primary: a channel clips and the hue shifts.
   PUNCHY keeps the old look for anyone whose panel really is that flat. */
const SCREEN_GRADES={
  neutral:{label:'NEUTRAL',css:'none',
           ds:'No screen filter. Shows the render as the lighting, bloom, and vignette authored it.'},
  soft:   {label:'SOFT',css:'contrast(1.05) saturate(1.06)',
           ds:'Gentle lift for washed-out panels. Clips only below 2% instead of eating the shadow ramp.'},
  punchy: {label:'PUNCHY',css:'contrast(1.12) saturate(1.16) brightness(1.03)',
           ds:'Heavy contrast for dim or flat displays. Crushes dark detail to black — this was the old default.'}
};
function screenGradeKey(){ return SCREEN_GRADES[META.settings.screenGrade]?META.settings.screenGrade:'neutral'; }
/* GPU vendor tiering. gl.js (manifest slot 3) stores the unmasked renderer
   string in __MF_GL_INFO long before meta.js (slot 35) runs, but nothing ever
   read it: the string was captured for diagnostics and then discarded, so an
   integrated laptop and a discrete desktop both booted on HIGH. Classify it
   once. Returns '' when the extension is masked, which is common and must
   leave the existing defaults alone rather than guess. */
function mfGpuTier(){
  try{
    const info=(typeof window!=='undefined'&&window.__MF_GL_INFO)||null;
    const r=String((info&&info.renderer)||'').toLowerCase();
    if(!r) return '';
    /* Chrome on Windows wraps everything as "ANGLE (vendor, part, D3D11)", and
       integrated AMD parts are named "Radeon(TM) 610M" with no RX/Pro token —
       a first pass that keyed on RX/Pro classified this author's own AMD box as
       '' and silently did nothing. Every branch below is unit-tested against
       real renderer strings; do not tighten one without a case for it. */
    if(/swiftshader|llvmpipe|lavapipe|software|basic render/.test(r)) return 'low';
    if(/apple m\d/.test(r)) return 'high';
    if(/apple a1[5-9]|apple a2\d/.test(r)) return 'medium';
    if(/geforce|\brtx\b|\bgtx\b|quadro|nvidia|titan/.test(r)) return 'high';
    /* AMD: discrete carries RX / Pro / FirePro / Wx000; APU graphics read as
       "Radeon(TM) NNNm" or "Radeon(TM) Graphics" or "Vega N Graphics". */
    if(/radeon/.test(r)||/\bamd\b/.test(r)){
      if(/\brx\b|radeon pro|firepro|\bw[5-7]\d00\b/.test(r)) return 'high';
      return 'medium';
    }
    if(/\barc\s*(\(tm\)\s*)?a\d{3}/.test(r)) return 'high';
    if(/intel|uhd graphics|\bhd graphics\b|iris/.test(r)) return 'medium';
    if(/adreno\s*(\(tm\)\s*)?(7|8)\d\d/.test(r)) return 'medium';
    if(/mali-g[78]\d/.test(r)) return 'medium';
    if(/adreno|mali|powervr|videocore|xclipse/.test(r)) return 'low';
  }catch(e){}
  return '';
}
function mfGuessMobile(){
  /* CINEMATIC/HIGH must not be the silent phone default. A 412×900 flagship
     at DPR 3 plus the FBO chain is the context-loss spike; mid-tier is the
     honest "this is a phone" preset. Desktop keeps HIGH. */
  try{
    if(typeof navigator==='undefined') return false;
    const ua=navigator.userAgent||'';
    if(/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    if(/Mac/i.test(navigator.platform||'') && typeof document!=='undefined' && 'ontouchend' in document) return true;
  }catch(e){}
  return false;
}
const DEF_SETTINGS={sound:true,music:true,fog:true,shake:true,fps:false,cine:true,dayNight:true,
                      haptics:true,formationPreview:true,orderPaths:true,screenGrade:'neutral',
                      godMode:false,tutorialVoice:true,sfxVol:3,ambVol:3,musicVol:2,voiceVol:3,
                      perf:'auto',menubg:'dim',healthBars:'select',
                     quality:mfGuessMobile()?'medium':'high', gfxAdvOpen:false,
                     /* EXPERIMENTAL, OFF BY DEFAULT AND NEVER DEFAULTED ON.
                        Gates the space-exploration module's menu entry. The
                        module is not packaged (tools/pack-www.mjs refuses
                        modules/), so with this off the game is byte-identical
                        to before and with it on the entry only appears where a
                        development checkout actually has the module present. */
                     experimentalExploration:false};
/* CAREER RECORD. The old set was four numbers, which is enough to compute a
   rank and nothing else — no history, no identity, nothing a player would want
   to look at. These are the ones a commander would actually care about. */
/* wcPref defaults to 0, not 1. Every new career was being handed a random
   danger modifier it never asked for — and one of them (Wildlands) raises the
   infestation a full tier, which on a fresh account meant the game silently
   made itself harder than the difficulty the player picked. Wildcards are a
   reward multiplier you opt into. */
/* These four permanent percentages duplicated Development modules exactly.
   Old saves only record the bought tier, not whether its 25%-off daily deal
   was used, so list price is the one deterministic, player-favouring refund.
   Deleting the old ownership key is the tombstone: a second load/save has
   nothing left to refund, while an imported legacy payload is handled again. */
const ARMORY_RETIRED_OVERLAPS=Object.freeze({
  armor:Object.freeze([400,800,1600]),
  targeting:Object.freeze([400,800,1600]),
  salvage:Object.freeze([400,800]),
  reactor:Object.freeze([380,760,1500]),
});
/* One local authority credits every earned Core. Pending idempotent grant
   events live inside the career record, not only in module memory: every real
   reward path saves META immediately after crediting it, so an OS kill cannot
   erase the server-reconciliation half of an already-saved local reward. */
let metaCoreGrantObserver=null;
let metaCoreGrantTransaction=null;
function metaCoreGrantId(){
  try{ if(typeof crypto!=='undefined'&&crypto.randomUUID) return 'meta:'+crypto.randomUUID(); }
  catch(e){}
  return 'meta:'+Date.now().toString(36)+':'+Math.random().toString(36).slice(2,12);
}
function metaCoreGrantQueue(){
  if(!META||typeof META!=='object') return [];
  if(!Array.isArray(META.coreGrantPending)) META.coreGrantPending=[];
  return META.coreGrantPending;
}
function metaDispatchCoreGrant(grant){
  if(!metaCoreGrantObserver){ metaCoreGrantQueue().push(grant); return true; }
  try{ return metaCoreGrantObserver(grant)!==false; }
  catch(e){ return false; }
}
/* Imported legacy careers can earn an Armory-retirement refund while their two
   local records are still being verified. Hold that external grant signal
   until the save transaction commits; rolling the live META back must also
   discard its not-yet-durable refund. */
function metaCoreGrantTxnBegin(){
  if(metaCoreGrantTransaction) return false;
  metaCoreGrantTransaction=[];
  return true;
}
function metaCoreGrantTxnEnd(commit){
  const held=metaCoreGrantTransaction||[];
  metaCoreGrantTransaction=null;
  if(!commit) return true;
  const queuedBefore=metaCoreGrantQueue().length;
  let accepted=true;
  for(const grant of held) if(!metaDispatchCoreGrant(grant)) accepted=false;
  /* Import can run before economy-net has installed its observer. In that case
     dispatch stores the held grant on META after the candidate's first write;
     make that queue addition durable before the account transaction succeeds. */
  if(accepted&&metaCoreGrantQueue().length!==queuedBefore&&typeof metaSave==='function')
    accepted=metaSave(true)===true;
  return accepted;
}
function metaRetryCoreGrants(){
  const queue=metaCoreGrantQueue();
  if(!queue.length) return true;
  if(!metaCoreGrantObserver) return false;
  const pending=queue.splice(0);
  let accepted=true;
  for(const grant of pending){
    if(!metaDispatchCoreGrant(grant)){ queue.push(grant); accepted=false; }
  }
  /* Accepted events are already durable in economy-net's queue. Persist their
     removal from META so restart cannot replay duplicates; idempotency still
     makes a failed cleanup write safe. */
  if(typeof metaSave==='function') metaSave(true);
  return accepted&&!queue.length;
}
function metaObserveCoreGrants(observer){
  metaCoreGrantObserver=typeof observer==='function'?observer:null;
  metaRetryCoreGrants();
}
function metaGrantCores(amount,reason,idemKey){
  amount=Math.trunc(Number(amount));
  if(!Number.isFinite(amount)||amount<=0) return 0;
  const balance=Number(META.cores);
  META.cores=(Number.isFinite(balance)?balance:0)+amount;
  const grant={amount,reason:String(reason||'grant').slice(0,64),
    idemKey:String(idemKey||metaCoreGrantId()).slice(0,160)};
  if(metaCoreGrantTransaction) metaCoreGrantTransaction.push(grant);
  else if(!metaDispatchCoreGrant(grant)) metaCoreGrantQueue().push(grant);
  return amount;
}
function armoryRetireOverlaps(){
  const owned=META&&META.owned&&typeof META.owned==='object'?META.owned:null;
  if(!owned) return {changed:false,refund:0};
  let changed=false,refund=0;
  for(const id in ARMORY_RETIRED_OVERLAPS){
    const costs=ARMORY_RETIRED_OVERLAPS[id];
    if(Object.prototype.hasOwnProperty.call(owned,id)){
      const raw=Number(owned[id]);
      const tier=Number.isNaN(raw)?0:Math.min(costs.length,Math.max(0,Math.floor(raw)));
      for(let i=0;i<tier;i++) refund+=costs[i];
      delete owned[id]; changed=true;
    }
    const claimed=META.deals&&META.deals.claimed;
    if(claimed&&typeof claimed==='object'&&Object.prototype.hasOwnProperty.call(claimed,id)){
      delete claimed[id]; changed=true;
    }
  }
  if(refund>0) metaGrantCores(refund,'armory_retirement','armory-retirement:v1');
  return {changed,refund};
}
const META_DEF={xp:0,cores:0,researchData:0,owned:{},color:'azure',wins:0,matches:0,standardMatches:0,kills:0,wcPref:0,
  losses:0, streak:0, bestStreak:0, playSec:0, built:0, lost:0, structs:0,
  bestKills:0, fastestWin:0, favFac:'', facWins:{}, mapWins:{}, firstPlayed:0, lastPlayed:0,
  campaign:{missions:{}}, coreGrantPending:[],
  /* Account research/crafting lived only on first UI open, so a match started
     before Development, or a cloud merge that omitted the keys, dropped the
     tree, queue and bag. Defaults here make every load a complete career. */
  res:{}, resQueue:[], mats:{alloy:0,circuit:0,isotope:0,relic:0}, mods:{}, equip:[],
  inventory:{gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[]},
  settings:{...DEF_SETTINGS}};
function metaFresh(){
  return {...META_DEF,owned:{},facWins:{},mapWins:{},campaign:{missions:{}},coreGrantPending:[],
    res:{},resQueue:[],mats:{alloy:0,circuit:0,isotope:0,relic:0},mods:{},equip:[],
    inventory:{gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[]},
    settings:{...DEF_SETTINGS}};
}
let META=metaFresh();
function metaKey(){ return 'massfront_meta_'+PROFILES.active; }
function metaHarden(){
  if(!META.owned||typeof META.owned!=='object') META.owned={};
  if(!META.facWins||typeof META.facWins!=='object') META.facWins={};
  if(!META.mapWins||typeof META.mapWins!=='object') META.mapWins={};
  if(!META.campaign||typeof META.campaign!=='object') META.campaign={missions:{}};
  if(!META.campaign.missions||typeof META.campaign.missions!=='object') META.campaign.missions={};
  if(!Array.isArray(META.coreGrantPending)) META.coreGrantPending=[];
  else META.coreGrantPending=META.coreGrantPending.filter(grant=>grant&&
    Number.isFinite(Number(grant.amount))&&Number(grant.amount)>0).map(grant=>({
      amount:Math.trunc(Number(grant.amount)),reason:String(grant.reason||'grant').slice(0,64),
      idemKey:String(grant.idemKey||metaCoreGrantId()).slice(0,160)}));
  if(!META.res||typeof META.res!=='object') META.res={};
  if(!Array.isArray(META.resQueue)) META.resQueue=[];
  if(!META.mats||typeof META.mats!=='object') META.mats={alloy:0,circuit:0,isotope:0,relic:0};
  else {
    for(const k of ['alloy','circuit','isotope','relic']) if(!(META.mats[k]>=0)) META.mats[k]=0;
  }
  if(!META.mods||typeof META.mods!=='object') META.mods={};
  if(!Array.isArray(META.equip)) META.equip=[];
  META.researchData=Math.max(0,META.researchData|0);
  const priorSettings=META.settings||{};
  const migrateExploration=!Object.prototype.hasOwnProperty.call(priorSettings,'experimentalExploration')
    &&Object.prototype.hasOwnProperty.call(priorSettings,'expExploration');
  META.settings={...DEF_SETTINGS,...priorSettings};
  /* Compatibility adapter for the short-lived preview key. Preserve an
     explicit opt-in from an existing local career, then remove the legacy key
     so every subsequent save has one authoritative setting. New careers still
     default off. */
  if(migrateExploration) META.settings.experimentalExploration=!!priorSettings.expExploration;
  delete META.settings.expExploration;
  /* gfxOver is a sparse bag. Sharing DEF_SETTINGS' empty object would make
     the first profile's taps leak into every later career. */
  if(!META.settings.gfxOver||typeof META.settings.gfxOver!=='object'||Array.isArray(META.settings.gfxOver))
    META.settings.gfxOver={};
  else META.settings.gfxOver=Object.assign({},META.settings.gfxOver);
  if(META.settings.gfxAdvOpen==null) META.settings.gfxAdvOpen=false;
  /* One-time phone default. Careers saved before MEDIUM became the phone
     preset still have quality:'high' and an empty gfxOver — that was the
     silent default, not a choice. Leave HIGH alone when Advanced overrides
     exist, and stamp gfxPhoneMed so a later HIGH tap is not undone. */
  if(!META.settings.gfxPhoneMed){
    const over=META.settings.gfxOver;
    const stock=!over||typeof over!=='object'||!Object.keys(over).length;
    if(mfGuessMobile()&&META.settings.quality==='high'&&stock)
      META.settings.quality='medium';
    META.settings.gfxPhoneMed=1;
  }
  /* One-time GPU tier, stamped separately from gfxPhoneMed so the two never
     fight. Runs AFTER the phone default, so on mobile it may only lower the
     preset further, never raise it back to HIGH. Skipped entirely once the
     player has any Advanced override — an explicit choice always wins. */
  if(!META.settings.gfxGpuTier){
    const gOver=META.settings.gfxOver;
    const gStock=!gOver||typeof gOver!=='object'||!Object.keys(gOver).length;
    const tier=mfGpuTier();
    if(gStock&&tier){
      if(mfGuessMobile()){ if(tier==='low') META.settings.quality='low'; }
      else META.settings.quality=tier;
    }
    META.settings.gfxGpuTier=1;
  }
  if(typeof invBag==='function') invBag();
  if(typeof COLORS!=='undefined'&&!COLORS[META.color]) META.color='azure';
}
function metaLoad(){
  /* Nested bags are cloned, not shared with META_DEF. A shallow spread left
     res/mats/mods pointing at the defaults, so researching on one profile
     silently wrote into the next empty career. */
  META=metaFresh();
  let loadedCareer=false,loadedStandardCount=false;
  try{
    const s=localStorage.getItem(metaKey());
    if(s){ const o=JSON.parse(s); if(o&&typeof o==='object'){
      loadedCareer=true;loadedStandardCount=Object.prototype.hasOwnProperty.call(o,'standardMatches');Object.assign(META,o);
    } }
  }catch(e){}
  /* Careers created before the protected-opening counter are veterans, not
     brand-new players. Migrating from completed matches prevents an update
     from forcing their next three battles back through onboarding defaults. */
  if(loadedCareer&&!loadedStandardCount)META.standardMatches=META.matches||0;
  const needGfxMed=!(META.settings&&META.settings.gfxPhoneMed);
  const needExplorationKey=!!(META.settings
    &&!Object.prototype.hasOwnProperty.call(META.settings,'experimentalExploration')
    &&Object.prototype.hasOwnProperty.call(META.settings,'expExploration'));
  const needCoreGrantRepair=Array.isArray(META.coreGrantPending)&&META.coreGrantPending.some(grant=>
    !grant||!Number.isFinite(Number(grant.amount))||Number(grant.amount)<=0||!grant.idemKey);
  metaHarden();
  const overlapMigration=armoryRetireOverlaps();
  if(needGfxMed||needExplorationKey||needCoreGrantRepair||overlapMigration.changed) metaSave();
}
/* Local save is the source of truth for progress on THIS device. Harden it so a
   transient write failure (quota pressure, a WebView hiccup) does not silently
   drop a career: retry once, and only if that also fails tell the player — and
   point them at the account backup, which now survives even a reinstall. */
let metaSaveWarned=false;
function metaSave(){
  const quiet=arguments[0]===true;
  /* Auth Portal restores assign META directly and then call metaSave without
     metaHarden. Keep the retirement invariant at the serialization boundary
     so local, cloud, file-import and profile-switch paths all converge. */
  armoryRetireOverlaps();
  let text;
  try{ text=JSON.stringify(META); }
  catch(e){ text=null; }
  const key=metaKey();
  try{ if(text===null) throw new Error('serialize'); localStorage.setItem(key,text);
    if(localStorage.getItem(key)!==text)throw new Error('readback');metaSaveWarned=false;return true; }
  catch(e){}
  try{ if(text===null) throw new Error('serialize'); localStorage.setItem(key,text);
    if(localStorage.getItem(key)!==text)throw new Error('readback');metaSaveWarned=false;return true; }
  catch(e2){
    if(!quiet&&!metaSaveWarned && typeof toast==='function'){
      metaSaveWarned=true;
      toast('⚠ Progress could not be saved on this device — sign in to back it up to your account');
    }
    return false;
  }
}
/* The live graphics budget. Every quality gate in the renderer reads this
   rather than testing META.settings itself, so there is exactly one place that
   decides what a preset means. Advanced rows write sparse gfxOver keys; this
   object is always the merge of preset + overrides. */
let GFX={ao:true, bloom:true, grade:true, fxFloor:0.55, organicSpan:2700, particles:1,
         lights:8, aoSamples:12, bloomBlur:2, bloomAmt:0.14, aoAmt:0.18, glowDiv:2, shadowQ:2,
         waterAmp:1, worldV2:true, dprCap:0, contact:true, aniso:8, lodBias:1,
         volSteps:24, groundQ:2};
const GFX_PRESETS={
  /* Knobs the GL path actually reads. ao/bloom/grade are the old on/off
     gates; lights/aoSamples/bloomBlur/glowDiv are the mid-tier cheapeners.
     Mid must still run the full FBO chain (clear + restore) — skipping a
     buffer write is the flicker class, not a budget win.
     waterAmp scales GPU swell/flow. 0 would look like a skipped pass; LOW
     keeps a quiet draw so the water target is always written.
     worldV2 is HIGH/CINEMATIC only. Mid kept the full PBR civic path and
     paid HIGH-class material cost on a mid-tier budget.
     dprCap>0 is an explicit fillrate ceiling. Desktop HIGH stays uncapped
     (min(raw,2)); MEDIUM must be cheaper on the same GPU.
     contact is the unit/scenery blob pass inside drawShadows — distinct from
     SSAO creases. aniso 1 is "off" (EXT treats 1× as no anisotropy).
     lodBias scales strategic mesh/icon cutovers; organicSpan is the zoom
     where secondary animation dies. */
  low:      {ao:false, bloom:false, grade:false, fxFloor:0,    organicSpan:0,    particles:0.5,
             lights:0, aoSamples:0,  bloomBlur:0, bloomAmt:0,    aoAmt:0,    glowDiv:3, shadowQ:0,
             waterAmp:0.40, worldV2:false, dprCap:1.15, contact:false, aniso:1, lodBias:0.75,
             volSteps:0, groundQ:0},
  medium:   {ao:true,  bloom:true,  grade:true,  fxFloor:0.35, organicSpan:1800, particles:0.75,
             lights:4, aoSamples:4,  bloomBlur:0, bloomAmt:0.10, aoAmt:0.12, glowDiv:3, shadowQ:1,
             waterAmp:0.80, worldV2:false, dprCap:1.25, contact:true, aniso:4, lodBias:0.90,
             volSteps:0, groundQ:1},
  high:     {ao:true,  bloom:true,  grade:true,  fxFloor:0.55, organicSpan:2700, particles:1,
             lights:8, aoSamples:12, bloomBlur:2, bloomAmt:0.14, aoAmt:0.18, glowDiv:2, shadowQ:2,
             waterAmp:1, worldV2:true, dprCap:0, contact:true, aniso:8, lodBias:1,
             volSteps:24, groundQ:2},
  cinematic:{ao:true,  bloom:true,  grade:true,  fxFloor:0.75, organicSpan:4600, particles:1.5,
             lights:8, aoSamples:12, bloomBlur:2, bloomAmt:0.16, aoAmt:0.20, glowDiv:2, shadowQ:2,
             waterAmp:1.15, worldV2:true, dprCap:0, contact:true, aniso:8, lodBias:1.15,
             volSteps:32, groundQ:3},
};
const GFX_OVER_KEYS=['ao','bloom','grade','fxFloor','organicSpan','particles','lights','aoSamples',
  'bloomBlur','bloomAmt','aoAmt','glowDiv','shadowQ','waterAmp','worldV2','dprCap','contact','aniso','lodBias',
  'volSteps','groundQ'];
function qualityKey(){
  const q=(META.settings&&META.settings.quality)||'high';
  return GFX_PRESETS[q]?q:'high';
}
function gfxOverBag(){
  const o=META.settings&&META.settings.gfxOver;
  return (o&&typeof o==='object'&&!Array.isArray(o))?o:{};
}
function gfxOverSet(key,val){
  if(!META.settings.gfxOver||typeof META.settings.gfxOver!=='object'||Array.isArray(META.settings.gfxOver))
    META.settings.gfxOver={};
  META.settings.gfxOver[key]=val;
}
function gfxOverNearest(cur,opts){
  let best=0, bd=1e9;
  for(let i=0;i<opts.length;i++){
    const d=Math.abs((+opts[i]||0)-(+cur||0));
    if(d<bd){bd=d;best=i;}
  }
  return (best+1)%opts.length;
}
function gfxOverCycle(key,opts){
  const cur=(typeof GFX!=='undefined'&&GFX[key]!=null)?GFX[key]:opts[0];
  gfxOverSet(key, opts[gfxOverNearest(cur,opts)]);
}
function gfxOverToggle(key){
  gfxOverSet(key, !(typeof GFX!=='undefined'&&GFX[key]));
}
function mfAnisoCap(){
  const a=(typeof GFX!=='undefined'&&GFX.aniso!=null)?+GFX.aniso:8;
  return a<1?1:a;
}
/* Takeover, not an edit of materials.js: upload-time mfAniso(8) would ignore
   the Advanced row until the next settings tap. */
if(typeof mfAniso==='function'&&!mfAniso._gfxCap){
  const _mfAniso=mfAniso;
  mfAniso=function(cap){ return _mfAniso(mfAnisoCap()); };
  mfAniso._gfxCap=true;
}
function mfAnisoSupported(){
  try{
    if(typeof gl==='undefined'||!gl||(gl.isContextLost&&gl.isContextLost())) return false;
    return !!(gl.getExtension('EXT_texture_filter_anisotropic')||gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'));
  }catch(e){ return false; }
}
function mfLodSpan(base){
  const b=(typeof GFX!=='undefined'&&GFX.lodBias>0)?+GFX.lodBias:1;
  return (base||0)*b;
}
function mfGfxLive(){
  return {
    quality:qualityKey(),
    over:Object.assign({},gfxOverBag()),
    gfx:Object.assign({},GFX),
    dpr:typeof DPR!=='undefined'?DPR:null,
    cine:!!(META.settings&&META.settings.cine),
    grade:screenGradeKey(),
    perf:META.settings&&META.settings.perf
  };
}
function applyQualityPreset(){
  const q=qualityKey(), P=GFX_PRESETS[q];
  GFX=Object.assign({},P);
  const O=gfxOverBag();
  for(let i=0;i<GFX_OVER_KEYS.length;i++){
    const k=GFX_OVER_KEYS[i];
    if(O[k]!==undefined) GFX[k]=O[k];
  }
  /* Enabling SSAO/bloom on LOW (preset samples/amount are 0) must actually
     run a cheap kernel — a toggle that writes ao:true and then samples 0
     taps is the "does nothing" class the Advanced rows are here to avoid. */
  if(GFX.ao && !(GFX.aoSamples>0)){ GFX.aoSamples=4; if(!(GFX.aoAmt>0)) GFX.aoAmt=0.12; }
  if(!GFX.ao){ GFX.aoSamples=0; GFX.aoAmt=0; }
  if(GFX.bloom && !(GFX.bloomAmt>0)) GFX.bloomAmt=0.10;
  if(!GFX.bloom){ GFX.bloomAmt=0; GFX.bloomBlur=0; }
  /* Do NOT write cine/perf back onto META.settings here. applySettings() runs
     after every Settings row tap, so rewriting those two from the quality
     preset made Cinematic Lighting and Effects Budget save, then snap back
     on the same tap and again on the next launch. Quality itself still
     drives GFX; the click handler below copies cine/perf only when the
     player actually cycles the quality row. */
  /* CINEMATIC must not be silently undone by the frame-rate scaler. The floor
     is what makes it a promise rather than a suggestion.
     A floor is NOT a licence to overrule the player, though. main.js applies
     perfFloor AFTER `META.settings.perf==='low'` caps perfScale at 0.45, so a
     preset floor above 0.45 erased the Effects Budget row outright: measured
     with the real perfScale block, HIGH read 0.55 and CINEMATIC 1.125 in every
     scenario whether the budget was AUTO or LOW — identical, i.e. the row did
     nothing. Clamping the floor to the budget keeps the preset promise while
     an explicit player cap still lands (HIGH 0.45, CINEMATIC 0.675).
     GFX.fxFloor itself is deliberately left alone: mesh.js reads `fxFloor>0`
     as the "SSAO/bloom FBO stays pinned" flag, so changing the preset value
     would silently drop the post chain. */
  if(typeof perfFloor!=='undefined'){
    let pf=+GFX.fxFloor||0;
    if(META.settings&&META.settings.perf==='low') pf=Math.min(pf,0.45);
    perfFloor=pf;
  }
  /* Quality changes also change the mobile render-resolution ceiling. Apply it
     immediately instead of making the player relaunch before the lower-memory
     preset can prevent another context loss. */
  if(typeof resize==='function') resize();
  if(typeof mfApplyAnisoBudget==='function') mfApplyAnisoBudget();
}
function applySettings(){
  const s=META.settings;
  /* GRAPHICS QUALITY — one dial, plus Advanced overrides underneath.
     A preset sets every renderer knob coherently; gfxOver then wins per key
     so a mid-tier phone can keep MEDIUM's DPR cap and still turn bloom off.

     LOW        no post, no directional shadows, no local lights. Quiet water,
                half particles, 1.15× cap. Still clears the default framebuffer.
     MEDIUM     honest mid-tier phone: 4-tap SSAO, bright-pass glow (no extra
                blur), low shadows + contact blobs, 4 lights, 1.25× cap.
                World V2 stays OFF — that path is HIGH-class fillrate.
     HIGH       flagship: 12-tap SSAO, two-pass quarter bloom, full shadows,
                8 lights, World V2. Phone DPR 1.52–1.65, desktop min(raw,2).
     CINEMATIC  desktop / high-end only. HIGH plus a higher FX floor, organic
                motion out to strategic zoom, stronger bloom/water, 1.5×
                particles. Not a second post stack — film grain and god rays
                are not in this renderer. */
  applyQualityPreset();
  muted=false; sfxOn=!!s.sound; musicOn=!!s.music;
  if(typeof audApplyLevels==='function') audApplyLevels();
  shakeMult=s.shake?1:0;
  /* Sprite bloom follows the GL bloom flag, not Cinematic Lighting. cine used
     to kill both the 2D wash AND imply the CSS grade; Screen Grade is its
     own row and GL bloom is the Advanced / preset knob. */
  bloomOn=GFX.bloom!==false;
  gradeOn=s.cine!==false;
  const cv4=document.getElementById('gl');
  /* Deliberately NOT tied to cine. Cinematic Lighting is the in-engine sun
     wash and the #grade overlay. The CSS filter is Screen Grade only. */
  if(cv4) cv4.style.filter=SCREEN_GRADES[screenGradeKey()].css;
  const gr=document.getElementById('grade');
  if(gr) gr.style.opacity=(s.cine!==false)?'1':'0';
  /* A body class, not an inline style: the inline one lost to an !important
     media rule that hid the counter on every phone. */
  document.body.classList.toggle('fpsOn',!!s.fps);
  document.body.classList.toggle('godMode',!!s.godMode);
  const god=document.getElementById('godBadge');
  if(god){ god.textContent='∞'; god.setAttribute('aria-label','God Mode enabled'); god.title='God Mode enabled'; }
  const bg=s.menubg||'dim';
  document.body.classList.toggle('bgDim',bg==='dim');
  document.body.classList.toggle('bgOff',bg==='off');
  /* Switching backdrop has to take effect now, not on the next launch. */
  if(typeof applyMenuBackdrop==='function') applyMenuBackdrop();
}
let shakeMult=1;
function switchProfile(id){
  metaSave();
  PROFILES.active=id; profSave();
  metaLoad(); applyColor(); applySettings();
  wcChoice=clamp(META.wcPref|0,0,3);
  document.querySelectorAll('.wbtn').forEach(b=>b.classList.toggle('on',+b.dataset.w===wcChoice));
  renderMetaHead();
}

/* ---------- account ranks ---------- */
const RANKS=[
 {nm:'Recruit',   em:'🎗', xp:0},
 {nm:'Private',   em:'🎖', xp:200},
 {nm:'Corporal',  em:'🥉', xp:500},
 {nm:'Sergeant',  em:'🥈', xp:1000},
 {nm:'Lieutenant',em:'🥇', xp:1800},
 {nm:'Captain',   em:'🏅', xp:3000},
 {nm:'Major',     em:'⭐', xp:4800},
 {nm:'Colonel',   em:'🌟', xp:7500},
 {nm:'General',   em:'✨', xp:11500},
 {nm:'Warmaster', em:'👑', xp:17000},
];
function metaRankIdx(){ let r=0; for(let i=0;i<RANKS.length;i++) if(META.xp>=RANKS[i].xp) r=i; return r; }
function metaRankProg(){
  const r=metaRankIdx();
  if(r>=RANKS.length-1) return 1;
  return (META.xp-RANKS[r].xp)/(RANKS[r+1].xp-RANKS[r].xp);
}

/* ---------- commander colors ---------- */
const COLORS={
 azure:  {nm:'Azure',   cost:0,   c:[120,205,255], b:[65,200,255]},
 emerald:{nm:'Emerald', cost:300, c:[110,255,170], b:[45,215,120]},
 gold:   {nm:'Gold',    cost:300, c:[255,216,110], b:[255,190,40]},
 violet: {nm:'Violet',  cost:300, c:[204,140,255], b:[178,90,255]},
 frost:  {nm:'Frost',   cost:300, c:[235,245,255], b:[190,210,235]},
};
let mmPCol='#41c8ff', mmPColA='rgba(120,220,255,.9)';
/* THE FACTION PAINTS THE ARMY, NOT THE SHOP.
   This is the single biggest reason "every faction looks like the blue one".
   All four factions ship a complete bespoke building kit and their own chassis,
   and the battlefield resolves both — but team 0's livery came from META.color,
   a cosmetic commander-colour purchase that defaults to azure [120,205,255],
   which is Nova blue. So a Brood player fielded grown tissue painted in Terran
   Frontline livery and read it as "the same blue base again".
   ai.js has done the faction-correct thing for team 1 since it shipped; this is
   the same rule for team 0. Values match FACART's crest colours, so the army,
   the crest and the UI accent finally agree. */
const FAC_LIVERY={
  nova:      {c:[ 93,182,255], b:[ 65,200,255]},
  ascendancy:{c:[255,107, 88], b:[255, 93, 67]},
  legion:    {c:[255,107, 88], b:[255, 93, 67]},
  syndicate: {c:[140,232, 90], b:[108,214, 52]},
  horde:     {c:[185,120,255], b:[160, 86,244]},
};
function playerLivery(){
  const pf=(typeof playerFaction!=='undefined'&&playerFaction)||'nova';
  /* An explicitly bought commander colour is a personal accent and still wins.
     Azure is the default nobody chose, so it yields to the faction. */
  const C=COLORS[META.color];
  if(C&&META.color&&META.color!=='azure') return {c:C.c.slice(),b:C.b.slice()};
  /* playerFaction carries ai.js FACTIONS keys (legion/syndicate/horde), not
     FACART ids, so read the faction's own colours first — that is the same
     table team 1 is painted from, which keeps both sides honest about who is
     who. FAC_LIVERY covers nova, which has no ai.js entry because it is never
     an opponent, plus the FACART aliases a save can carry. */
  const F=(typeof FACTIONS!=='undefined')&&FACTIONS[pf];
  if(F&&F.col&&F.colB) return {c:F.col.slice(),b:F.colB.slice()};
  const L=FAC_LIVERY[pf]||FAC_LIVERY.nova;
  return {c:L.c.slice(),b:L.b.slice()};
}
/* BOTH SIDES IN THE SAME COLOURS IS WORSE THAN THE WRONG COLOURS.
   Picking the faction you are fighting is a legitimate, common matchup. The
   player keeps their identity and the ENEMY takes a darkened, blue-shifted
   variant of its own colour — a different value AND a different hue, which
   survives colour-blindness better than a hue change alone. */
function liveryTooClose(a,b){
  return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2])<150;
}
function liveryContrast(c){
  return [Math.round(c[0]*0.46), Math.round(c[1]*0.40+18), Math.round(c[2]*0.52+92)];
}
function applyColor(){
  const L=playerLivery();
  TEAMC[0][0]=L.c[0]; TEAMC[0][1]=L.c[1]; TEAMC[0][2]=L.c[2];
  TEAMB[0][0]=L.b[0]; TEAMB[0][1]=L.b[1]; TEAMB[0][2]=L.b[2];
  if(typeof TEAMC!=='undefined'&&TEAMC[1]&&liveryTooClose(TEAMC[0],TEAMC[1])){
    const e=liveryContrast(TEAMC[1]), eb=liveryContrast(TEAMB[1]);
    TEAMC[1][0]=e[0]; TEAMC[1][1]=e[1]; TEAMC[1][2]=e[2];
    TEAMB[1][0]=eb[0]; TEAMB[1][1]=eb[1]; TEAMB[1][2]=eb[2];
    if(typeof mmECol!=='undefined'){
      mmECol='rgb('+eb[0]+','+eb[1]+','+eb[2]+')';
      mmEColA='rgba('+eb[0]+','+eb[1]+','+eb[2]+',.9)';
    }
  }
  mmPCol='rgb('+L.c[0]+','+L.c[1]+','+L.c[2]+')';
  mmPColA='rgba('+L.c[0]+','+L.c[1]+','+L.c[2]+',.9)';
}

/* ---------- shared livery swatch row ---------------------------------------
   ONE renderer and ONE tap binder for the five commander colours. The same
   markup used to be written out three separate times — the legacy renderArmory
   below, storeui.js's armColorsHTML(), and now Profile → Identity — which is
   exactly how a row ends up showing a colour as selected on one screen and not
   the other. Callers own the BEHAVIOUR (select here, stage a purchase there);
   these two own the MARKUP and the binding, and nothing else.
   The wrapper id is a parameter because two of these rows are in the document
   at the same time: #colorRow lives in #storeList and #idLiveryRow in the
   profile pane, and getElementById would silently return the wrong one if they
   shared a name. */
function mfLiveryRowHTML(rowId){
  let h='<div id="'+(rowId||'colorRow')+'">';
  for(const key in COLORS){
    const C=COLORS[key], owned=key==='azure'||!!META.owned['col_'+key];
    h+='<div class="swatch'+(META.color===key?' sel':'')+(owned?'':' lockd')+'" data-col="'+key+'" '
      +'style="background:rgb('+C.c[0]+','+C.c[1]+','+C.c[2]+')">'
      +(owned?'':'<span>⬡'+C.cost+'</span>')+'</div>';
  }
  return h+'</div>';
}
function mfLiveryRowWire(rootEl,onPick){
  if(!rootEl||typeof onPick!=='function') return;
  /* [data-col] rather than a bare .swatch: the emblem picker reuses the same
     class and must not be captured by a livery binding. */
  rootEl.querySelectorAll('.swatch[data-col]').forEach(el=>{
    const go=()=>onPick(el.dataset.col,el);
    if(typeof mfBindTap==='function') mfBindTap(el,go); else el.addEventListener('click',go);
  });
}
/* playerLivery()'s azure→faction fallback is invisible in the UI: azure is the
   default nobody chose, so it yields to the faction and the swatch you can see
   selected is NOT the colour your army is painted in. Say so out loud. */
function mfLiveryHint(){
  const key=COLORS[META.color]?META.color:'azure';
  const nm=COLORS[key].nm.toUpperCase();
  if(key==='azure'){
    const pf=(((typeof playerFaction!=='undefined'&&playerFaction)||'nova')+'').toUpperCase();
    return nm+" — your faction's colours ("+pf+"). Pick another to override.";
  }
  return nm+" — overrides your faction's colours.";
}

/* ---------- store (permanent perks, bought with ⬡ cores) ---------- */
const STORE=[
 {id:'cache',    em:'📦', nm:'Supply Cache',    ds:'Start every match with +300 mass, +1200 energy', max:1, cost:[250]},
 {id:'trade',    em:'🚚', nm:'Trade Network',   ds:'+1.5 mass, +5 energy income per tier', max:3, cost:[350,700,1400]},
 {id:'neural',   em:'🧠', nm:'Neural Uplink',   ds:'+15% Commander XP per tier',      max:2, cost:[300,600]},
 {id:'capacitor',em:'⚡', nm:'Rapid Capacitors',ds:'Ability cooldowns −10% per tier', max:2, cost:[300,600]},
 {id:'droppod', em:'📦', nm:'Drop Priority',  ds:'Supply pods arrive 25% more often per tier', max:2, cost:[350,700]},
 {id:'bastion', em:'🏰', nm:'Fortified Plating',ds:'Your structures +15% HP per tier', max:2, cost:[420,840]},
 {id:'orbital', em:'🛰', nm:'Orbital Uplink', ds:'Unlocks the ORBITAL LANCE ability', max:1, cost:[1200]},
];

/* ---------- field inventory -------------------------------------------------
   This is intentionally separate from Development's crafted modules. Modules
   are a planned, wearing build; mission loot is the lighter-weight collection
   loop the result screen can reward immediately. Gear is persistent and fits
   one of three slots. Consumables stack and a maximum of two can be readied for
   the next deployment. Nothing here is sold for money. */
const INV_RARITIES=[
 {id:'common',    nm:'COMMON',    col:'#aeb9c6'},
 {id:'uncommon',  nm:'UNCOMMON',  col:'#61dc86'},
 {id:'rare',      nm:'RARE',      col:'#4db9ff'},
 {id:'epic',      nm:'EPIC',      col:'#b67cff'},
 {id:'legendary', nm:'LEGENDARY', col:'#ffbf45'},
];
const INV_GEAR=[
 {id:'w_rangefinder',slot:'weapon',rarity:'common',nm:'Ballistic Rangefinder',em:'⌖',ds:'+3% unit damage',apply:()=>{armyDmgMult+=0.03;}},
 {id:'w_pulseoptic', slot:'weapon',rarity:'uncommon',nm:'Pulse Optic',em:'◉',ds:'+5% unit damage',apply:()=>{armyDmgMult+=0.05;}},
 {id:'w_gaussdir',   slot:'weapon',rarity:'rare',nm:'Gauss Director',em:'➤',ds:'+8% unit damage',apply:()=>{armyDmgMult+=0.08;}},
 {id:'w_voidlens',   slot:'weapon',rarity:'epic',nm:'Void-Focus Lens',em:'◆',ds:'+12% unit damage',apply:()=>{armyDmgMult+=0.12;}},
 {id:'w_relicscope', slot:'weapon',rarity:'legendary',nm:'Starfire Targeter',em:'✦',ds:'+16% unit damage',apply:()=>{armyDmgMult+=0.16;}},

 {id:'a_fieldplate', slot:'armor',rarity:'common',nm:'Field Plate',em:'⬢',ds:'+3% unit health',apply:()=>{resHpMult*=1.03;}},
 {id:'a_reinforced', slot:'armor',rarity:'uncommon',nm:'Reinforced Weave',em:'⬡',ds:'+5% unit health',apply:()=>{resHpMult*=1.05;}},
 {id:'a_phaseweave', slot:'armor',rarity:'rare',nm:'Phaseweave Armor',em:'◇',ds:'+8% unit health',apply:()=>{resHpMult*=1.08;}},
 {id:'a_aegis',      slot:'armor',rarity:'epic',nm:'Aegis Lattice',em:'⛨',ds:'+12% unit health',apply:()=>{resHpMult*=1.12;}},
 {id:'a_starforged', slot:'armor',rarity:'legendary',nm:'Starforged Bulwark',em:'✧',ds:'+16% unit health',apply:()=>{resHpMult*=1.16;}},

 {id:'u_toolkit',    slot:'utility',rarity:'common',nm:'Field Toolkit',em:'⚙',ds:'+5% structure build speed',apply:()=>{bldSpeedMult*=1.05;}},
 {id:'u_fluxcell',   slot:'utility',rarity:'uncommon',nm:'Flux Cell',em:'ϟ',ds:'+7% energy income',apply:()=>{resEnergyMult*=1.07;}},
 {id:'u_salvage',    slot:'utility',rarity:'rare',nm:'Salvage Lattice',em:'♻',ds:'+15% salvage recovery',apply:()=>{salvageMult*=1.15;}},
 {id:'u_chronorig',  slot:'utility',rarity:'epic',nm:'Chrono Rig',em:'◷',ds:'−10% ability cooldowns',apply:()=>{for(let i=0;i<AB_CD.length;i++)AB_CD[i]*=0.90;}},
 {id:'u_commandcore',slot:'utility',rarity:'legendary',nm:'Command Singularity',em:'◈',ds:'+8% damage and health',apply:()=>{armyDmgMult+=0.08;resHpMult*=1.08;}},
];
/* ITEM 5b — CONSUMABLES LOCK TO A CHASSIS.
   These were five flat global scalars: ready Repair Nanites, the whole army is
   8% tougher, and the game never asked you a question. `scope:'type'` items now
   bind to ONE unit type for the match and pay roughly three times as much for
   it, so the choice is "which of my units is carrying this fight" instead of a
   rounding error spread across everything. Resources cannot be scoped — a
   Supply Pack fills a bank, not a chassis — so those stay army-wide.
   `apply(ty)` receives the locked TYPES index, or -1 for army-wide. */
const INV_CONSUMABLES=[
 {id:'c_supply',rarity:'common',nm:'Supply Pack',em:'▰',scope:'army',
  ds:'Next match: +220 starting mass',apply:()=>{credit(0,220,0);}},
 {id:'c_power',rarity:'uncommon',nm:'Charged Power Cell',em:'ϟ',scope:'army',
  ds:'Next match: +900 starting energy',apply:()=>{credit(0,0,900);}},
 {id:'c_nanites',rarity:'rare',nm:'Repair Nanites',em:'✚',scope:'type',
  ds:'Next match: +26% health, locked to one chassis',
  apply:(ty)=>{ if(ty>=0&&typeof typeHpMult!=='undefined') typeHpMult[ty]*=1.26; else resHpMult*=1.08; }},
 {id:'c_overdrive',rarity:'epic',nm:'Overdrive Protocol',em:'»',scope:'type',
  ds:'Next match: +32% damage, locked to one chassis',
  apply:(ty)=>{ if(ty>=0&&typeof typeDmgMult!=='undefined') typeDmgMult[ty]*=1.32; else armyDmgMult+=0.10; }},
 {id:'c_command',rarity:'legendary',nm:'Supreme Command Cache',em:'★',scope:'type',
  ds:'Next match: +30% health and +30% damage, locked to one chassis',
  apply:(ty)=>{ if(ty>=0&&typeof typeHpMult!=='undefined'){ typeHpMult[ty]*=1.30; typeDmgMult[ty]*=1.30; }
                else { resHpMult*=1.10; armyDmgMult+=0.10; } }},
 /* Operation-exclusive supplies never enter the random loot pool or store
    restock. They make the mode choice visible in the Account Armory instead
    of reducing "boosted rewards" to a line of temporary payout text. */
 {id:'c_standard_order',rarity:'uncommon',nm:'Skirmish Requisition',em:'⚔',scope:'army',mode:'standard',
  ds:'Standard victory supply: +280 starting mass and +800 starting energy',
  apply:()=>{credit(0,280,800);}},
 {id:'c_campaign_intel',rarity:'rare',nm:'Campaign Command Intel',em:'◇',scope:'army',mode:'campaign',
  ds:'Campaign mission supply: +6% army damage for one deployment',apply:()=>{armyDmgMult+=0.06;}},
 {id:'c_warfront_beacon',rarity:'epic',nm:'Warfront Logistics Beacon',em:'☷',scope:'army',mode:'mmo',
  ds:'MMO warfront supply: +400 starting mass and +1400 starting energy',
  apply:()=>{credit(0,400,1400);}},
];
function invConsumableScope(id){
  const c=INV_CONSUMABLES.find(x=>x.id===id);
  return (c&&c.scope)||'army';
}
/* The chassis a charge may be locked to: every machine the player can actually
   field. Derived from TYPES rather than a hand-written list, so a new unit is
   lockable the day it ships instead of the day someone remembers this file. */
function invLockableTypes(){
  const out=[];
  if(typeof TYPES==='undefined') return out;
  for(let t=0;t<TYPES.length;t++){
    const T=TYPES[t];
    if(!T||!T.name||T.hero||T.brood||T.massflesh) continue;
    out.push(t);
  }
  return out;
}
function invLockName(ty){
  return (typeof TYPES!=='undefined'&&TYPES[ty]&&TYPES[ty].name)||'';
}
function invRarity(id){ return INV_RARITIES.find(r=>r.id===id)||INV_RARITIES[0]; }
function invBag(){
  let b=META.inventory;
  if(!b||typeof b!=='object') b=META.inventory={};
  if(!b.gear||typeof b.gear!=='object') b.gear={};
  if(!b.consumables||typeof b.consumables!=='object') b.consumables={};
  if(!b.equipped||typeof b.equipped!=='object') b.equipped={};
  for(const s of ['weapon','armor','utility']){
    const id=b.equipped[s]||'', g=INV_GEAR.find(x=>x.id===id);
    b.equipped[s]=(g&&g.slot===s&&(b.gear[id]||0)>0)?id:'';
  }
  if(!Array.isArray(b.ready)) b.ready=[];
  b.ready=b.ready.filter((id,i,a)=>a.indexOf(id)===i&&INV_CONSUMABLES.some(c=>c.id===id)&&(b.consumables[id]||0)>0).slice(0,2);
  /* The chassis each readied charge is locked to, kept OUT of b.ready so every
     existing `b.ready.indexOf(id)` in the Armory keeps working unchanged. A
     lock with no charge behind it is stale state, so it is dropped here. */
  if(!b.readyTy||typeof b.readyTy!=='object') b.readyTy={};
  for(const k in b.readyTy) if(b.ready.indexOf(k)<0) delete b.readyTy[k];
  return b;
}
function invEquipGear(id){
  const b=invBag(), g=INV_GEAR.find(x=>x.id===id);
  if(!g||(b.gear[id]||0)<=0) return false;
  b.equipped[g.slot]=b.equipped[g.slot]===id?'':id;
  metaSave(); return true;
}
function invReadyConsumable(id,ty){
  const b=invBag(), c=INV_CONSUMABLES.find(x=>x.id===id), at=b.ready.indexOf(id);
  if(!c||(b.consumables[id]||0)<=0) return false;
  if(at>=0){ b.ready.splice(at,1); delete b.readyTy[id]; }
  else{
    if(b.ready.length>=2){ toast('Only two consumables can be readied per mission'); return false; }
    if(c.scope==='type'){
      /* A type-scoped charge with no chassis is the old army-wide behaviour
         wearing a new label. Refuse it and say what is missing. */
      if(!(ty>=0)||invLockableTypes().indexOf(ty|0)<0){
        toast('Pick a chassis to lock '+c.nm+' to'); return false;
      }
      b.readyTy[id]=ty|0;
    }
    b.ready.push(id);
  }
  metaSave(); return true;
}
/* Small deterministic hash: the same completed match always yields the same
   drop, while career number, performance and profile keep rewards varied. */
function invHash(seed){
  let h=2166136261;
  for(let i=0;i<seed.length;i++){ h^=seed.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function invRarityRoll(win,seed){
  let r=invHash(seed)%100;
  r+=Math.min(10,(typeof wcActive!=='undefined'?wcActive.length:0)*2+Math.floor((stats.kills[0]||0)/180));
  const d=clamp(difficulty|0,0,2);
  if(!win){ if(r>=92&&d>0)return 'rare'; return r>=58?'uncommon':'common'; }
  if(d===2){ if(r>=97)return 'legendary'; if(r>=86)return 'epic'; if(r>=62)return 'rare'; if(r>=30)return 'uncommon'; }
  else if(d===1){ if(r>=99)return 'legendary'; if(r>=92)return 'epic'; if(r>=72)return 'rare'; if(r>=43)return 'uncommon'; }
  else { if(r>=97)return 'epic'; if(r>=86)return 'rare'; if(r>=62)return 'uncommon'; }
  return 'common';
}
function invGrantMatchLoot(win){
  const b=invBag(), p=activeProf(), seed=(p?p.id:'p')+'|'+META.matches+'|'+(stats.kills[0]|0)+'|'+(stats.t|0)+'|'+difficulty;
  const rarity=invRarityRoll(win,seed), loot={gear:null,consumables:[]};
  if(typeof matchCommitted==='function'&&!matchCommitted(win)) return loot;
  /* Victories always award gear. A committed loss can still recover a piece,
     but a quick surrender cannot be used to farm the inventory. */
  const gearDrop=win||((stats.t|0)>=180&&(invHash(seed+'|gear')%100)<35);
  if(gearDrop){
    const pool=INV_GEAR.filter(g=>g.rarity===rarity);
    if(pool.length){
      const unowned=pool.filter(g=>(b.gear[g.id]||0)<=0), src=unowned.length?unowned:pool;
      const g=src[invHash(seed+'|slot')%src.length];
      b.gear[g.id]=(b.gear[g.id]||0)+1;
      if(!b.equipped[g.slot]) b.equipped[g.slot]=g.id;
      loot.gear={id:g.id,nm:g.nm,em:g.em,rarity:g.rarity,duplicate:!unowned.length,count:b.gear[g.id]};
    }
  }
  const qualityHold=win&&(invHash(seed+'|consQuality')%100)<28;
  const ri=Math.max(0,INV_RARITIES.findIndex(r=>r.id===rarity)-(qualityHold?0:(win?1:2)));
  const cr=INV_RARITIES[ri].id, pool=INV_CONSUMABLES.filter(c=>c.rarity===cr&&!c.mode);
  const c=pool[invHash(seed+'|consumable')%pool.length], count=win?(difficulty>=2?2:1):1;
  b.consumables[c.id]=(b.consumables[c.id]||0)+count;
  loot.consumables.push({id:c.id,nm:c.nm,em:c.em,rarity:c.rarity,count});
  return loot;
}
/* Each strategic lane has one explicit reward contract. Standard stays the
   accessible solo ladder; Campaign pays more for authored constraints; MMO is
   the long-term persistent lane and its contract can be previewed before the
   network service is enabled. */
const MODE_REWARD_CONTRACTS=Object.freeze({
  standard:{id:'standard',nm:'STANDARD',xp:1.10,item:'c_standard_order',rule:'1 PLAYER · AI ALLIES OPTIONAL',accent:'#63d9ff'},
  campaign:{id:'campaign',nm:'CAMPAIGN',xp:1.25,item:'c_campaign_intel',rule:'AUTHORED STORY MISSIONS',accent:'#74f0b1'},
  mmo:{id:'mmo',nm:'MMO WARFRONT',xp:1.50,item:'c_warfront_beacon',rule:'PERSISTENT ONLINE CONQUEST',accent:'#c08cff'},
  coop:{id:'coop',nm:'CO-OP',xp:1.00,item:'',rule:'TWO COMMANDERS VS AI',accent:'#ffce72'}
});
function matchRewardMode(){
  if(typeof storyCampaignActiveId!=='undefined'&&storyCampaignActiveId)return 'campaign';
  const m=typeof activeWarMode!=='undefined'?activeWarMode:'standard';
  return MODE_REWARD_CONTRACTS[m]?m:'standard';
}
function modeRewardContract(mode){return MODE_REWARD_CONTRACTS[mode]||MODE_REWARD_CONTRACTS.standard;}
function invGrantModeReward(win,mode,loot){
  const C=modeRewardContract(mode),it=C.item&&INV_CONSUMABLES.find(x=>x.id===C.item);
  if(!win||!it)return null;
  const b=invBag();b.consumables[it.id]=(b.consumables[it.id]||0)+1;
  const drop={id:it.id,nm:it.nm,em:it.em,rarity:it.rarity,count:1,mode:C.id,exclusive:true};
  if(loot&&Array.isArray(loot.consumables))loot.consumables.push(drop);
  return drop;
}
/* Called after permanent perks and Development modules so every multiplier is
   layered once and the utility-slot build bonus is not reset by applyModules. */
function invApplyLoadout(){
  const b=invBag();
  for(const s of ['weapon','armor','utility']){
    const g=INV_GEAR.find(x=>x.id===b.equipped[s]);
    if(g&&(b.gear[g.id]||0)>0) try{g.apply();}catch(e){}
  }
  const used=[];
  for(const id of b.ready){
    const c=INV_CONSUMABLES.find(x=>x.id===id);
    if(!c||(b.consumables[id]||0)<=0) continue;
    /* -1 means army-wide; a type-scoped charge without a lock falls back to the
       old global effect rather than doing nothing at all. */
    try{c.apply(b.readyTy&&b.readyTy[id]!=null?b.readyTy[id]:-1);}catch(e){}
    b.consumables[id]--; used.push(c);
  }
  b.ready=[]; b.readyTy={}; metaSave();
  return used;
}
/* MUST stay in lockstep with AB_CD in commander.js — the rebuild loop below is
   driven by AB_CD.length, so a shorter AB_BASE writes `undefined * cd` = NaN
   into the extra slots. A NaN cooldown never satisfies `abCool[k]>0`, so the
   ability reads as permanently ready and its cooldown never displays. Adding
   the EMP as a fifth ability without this line did exactly that. */
const AB_BASE=[26,20,30,70,45];      // blast, repair, surge, lance, EMP
/* The setup screen's supply-drop choice, kept so perks can be re-applied on top
   of it every match instead of on top of last match's result. */
let crateRateBase=1;
function applyMetaPerks(){                    // call AFTER resetWorld, skirmish only
  const o=META.owned;
  /* Perks that MULTIPLY must start from the loadout value, not from whatever
     the previous match left behind. Drop Priority compounded 1.25x per tier per
     match — ten matches in with tier 2 it had multiplied by roughly fifty. */
  crateRate=crateRateBase;
  /* The loadout belongs to the HUMAN commander, never to a seat: credit with
     no slot is the human bank by construction. */
  if(o.cache){ credit(0,300,1200); }
  bonusMass+=1.5*(o.trade||0); bonusEnergy+=5*(o.trade||0);
  const cd=1-0.10*(o.capacitor||0);
  for(let i=0;i<AB_CD.length;i++) AB_CD[i]=AB_BASE[i]*cd;
  /* Retired percentage keys are intentionally not read here. Even a stale
     in-memory/imported object cannot restore the Development overlap. */
  salvageMult=1;
  if(WC.nofab) salvageMult=0;                       // No Salvage
  if(WC.brittle) resHpMult*=0.75;                   // Brittle Frames
  crateRate*=1+0.25*(o.droppod||0);
  bldHpMult=1+0.15*(o.bastion||0);
  abUnlock[3]=!!o.orbital;                       // Orbital Lance is a bought ability
}
// Neural Uplink: boost commander XP gain
const _heroXP0=heroXP;
heroXP=function(x){ _heroXP0(x*(1+0.15*(META.owned.neural||0))); };

/* ============================================================
   SESSION RULES — victory goal, clock, resource pace, crate rate
   ============================================================ */
const GOALS=[
 {id:'annihilate', em:'☠', nm:'Annihilation', ds:'Destroy every enemy Commander'},
 {id:'domination', em:'⛳', nm:'Domination',   ds:'Hold the most territory when the clock ends'},
 {id:'purge',      em:'🐛', nm:'Hive Purge',   ds:'Destroy every alien hive before time runs out'},
 {id:'survival',   em:'🛡', nm:'Last Stand',   ds:'Keep your Commander alive until the clock ends'},
];
/* Ten minutes by default. An open-ended match with no mid-session save is the
   wrong shape for a phone: an interrupted commute game is a total write-off.
   Infinity is still there, one tap away under ADVANCED. */
let goalSel='annihilate', timeLimit=600, resPace=1, crateRate=1;
/* The backstop for an UNLIMITED match that no victory condition can resolve.
   See checkVictory() in main.js. */
const MATCH_HARD_CAP=2400;
let matchClock=0, goalDone=false;
function goalDef(){ return GOALS.find(g=>g.id===goalSel)||GOALS[0]; }
function territoryScore(team){
  let n=0;
  for(const B of bldLive) if(B.alive&&B.team===team&&B.prog>=1) n+= (B.type==='hq'?4:B.type==='mex'||B.type==='geo'?2:1);
  return n;
}
function goalStatus(){                    // short HUD line describing progress
  const g=goalDef();
  if(g.id==='domination'){
    const a=territoryScore(0), b=territoryScore(1);
    return '⛳ '+a+' vs '+b+(a>b?'  LEADING':a<b?'  BEHIND':'  TIED');
  }
  if(g.id==='purge'){ const n=liveNests().length; return '🐛 hives left: '+n; }
  if(g.id==='survival') return '🛡 hold the line';
  const n=typeof livingEnemyCommanders==='function'?livingEnemyCommanders().length:1;
  return '☠ enemy commanders left: '+n;
}

/* ---------- wildcards (danger modifiers → bigger rewards) ---------- */
const WILDCARDS=[
 {id:'meteor',  em:'☄',  nm:'Meteor Season',    ds:'Meteor storms strike 3× as often'},
 {id:'wild',    em:'🐛', nm:'Rampant Wildlife', ds:'Nests swarm — double broods, fast respawns'},
 {id:'iron',    em:'🩸', nm:'Iron Enemy',       ds:'Enemy units +25% HP'},
 {id:'moon',    em:'🌑', nm:'Blood Moon',       ds:'The sun never rises'},
 {id:'veins',   em:'⛏',  nm:'Scarce Veins',     ds:'Your extractors yield −30%'},
 {id:'fogb',    em:'🌫', nm:'Fog Bank',         ds:'Your vision range −40%'},
 {id:'titan',   em:'👁',  nm:'Titan Rush',       ds:'The enemy fields TITANs early'},
 {id:'volatile',em:'💥', nm:'Volatile Cores',   ds:'Every destroyed unit detonates'},
 /* THESE FIVE PAID OUT FOR NOTHING.
    endgame.js's OPMODS listed them and payoutMult() counted them, but
    pickWildcards() resolves a chosen modifier by looking it up HERE — and when
    the lookup failed it dropped the entry silently. Selecting all five bought a
    +140% payout on a match that was mechanically identical to an unmodified
    one, which is free score on the weekly leaderboard: the one system whose
    entire value is that its numbers can be compared. Each now has a real
    effect, so the payout is earned. */
 {id:'swarm',   em:'🐝', nm:'Hiveworld',        ds:'The infestation runs at full strength whoever you fight'},
 {id:'blitz',   em:'⚡', nm:'Blitz Doctrine',   ds:'Enemy waves come 40% sooner'},
 {id:'brittle', em:'🥀', nm:'Brittle Frames',   ds:'YOUR units have −25% HP'},
 {id:'nofab',   em:'🚫', nm:'No Salvage',       ds:'Wrecks and bounties pay nothing'},
 {id:'dark',    em:'🌘', nm:'Total Eclipse',    ds:'Endless night, and vision suffers for it'},
];
let WC={}, wcActive=[], wcChoice=0;   // off by default: a first match should not be rolled
function pickWildcards(n){
  WC={}; wcActive=[];
  /* CHOSEN modifiers win over the dice. If the player has set any in
     Operations they get exactly those and nothing else — the roulette is a
     fallback for a player who has never opened that screen, not a tax on one
     who has. */
  if(typeof opModsOn==='function'){
    const chosen=Object.keys(opModsOn()).filter(id=>typeof opModUnlocked!=='function'||opModUnlocked(id)||
      (typeof weeklyMode!=='undefined'&&weeklyMode));
    if(chosen.length){
      for(const id of chosen){
        const w=WILDCARDS.find(x=>x.id===id);
        /* Set the flag even for an id with no card here. A modifier the player
           paid a payout multiplier for must at minimum reach the simulation;
           dropping it silently is how the five above went unnoticed. */
        if(w){ WC[w.id]=true; wcActive.push(w); }
        else { WC[id]=true; wcActive.push({id,em:'?',nm:id,ds:''}); }
      }
      return;
    }
  }
  const pool=WILDCARDS.filter(w=>{
    if(typeof opModUnlocked!=='function') return true;
    const mod=typeof OPMODS!=='undefined'&&OPMODS.find(o=>o.id===w.id);
    return !mod||opModUnlocked(mod);
  });
  for(let k=0;k<n&&pool.length;k++){
    const w=pool.splice(Math.random()*pool.length|0,1)[0];
    WC[w.id]=true; wcActive.push(w);
  }
}
/* Payout now comes from the endgame layer: the threat level the player chose to
   fight at, multiplied by the modifiers they chose to carry. The old flat +35%
   per random wildcard priced a cosmetic draw the same as a crippling one. */
function wcRewardMult(){
  if(typeof payoutMult==='function') return payoutMult();
  return 1+0.35*wcActive.length;
}
function renderWcRow(){
  const el=document.getElementById('wcRow');
  if(!el) return;
  /* hud.js owns the compact in-match banner. Keeping this setup row visible
     during a live match duplicated every modifier across the top of the HUD. */
  if(!wcActive.length||demoMode||matchLive){ el.style.display='none'; return; }
  el.style.display='flex';
  el.innerHTML=wcActive.map(w=>'<span class="wcChip" data-wc-id="'+w.id+'" title="'+w.nm+'">'+w.em+'</span>').join('')
    +'<span class="wcMult">+'+Math.round((wcRewardMult()-1)*100)+'%</span>';
  el.onclick=()=>toast(wcActive.map(w=>w.em+' '+w.nm+': '+w.ds).join('  ·  '));
  /* Long-press on individual wildcard chips shows a detailed tooltip card. */
  el.querySelectorAll('.wcChip').forEach(chip=>{
    let lpT=null;
    chip.addEventListener('pointerdown',ev=>{
      const w=wcActive.find(x=>x.id===chip.dataset.wcId);
      if(!w) return;
      lpT=setTimeout(()=>{
        if(typeof showModTooltip==='function') showModTooltip({id:w.id,em:w.em,nm:w.nm,ds:w.ds,rarity:'legendary',slot:''},'wildcard',ev.clientX,ev.clientY);
      },500);
    });
    const clear=()=>{ if(lpT){clearTimeout(lpT);lpT=null;} hideModTooltip(); };
    chip.addEventListener('pointerup',clear);
    chip.addEventListener('pointerleave',clear);
    chip.addEventListener('pointercancel',clear);
  });
}

/* ---------- match rewards ---------- */
function rewardDayKey(){
  const d=new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
}
/* One anti-farm rule for every persistent reward. A real early defeat still
   counts when the player fought or built; opening a match and immediately
   quitting cannot mint XP, cores, loot, Data or crafting materials. */
function matchCommitted(win){
  return !!win||(stats.t|0)>=180;
}
/* Cores used to be one opaque formula dominated by raw kill count. That made a
   defensive victory feel worse than farming wildlife and gave no clue what the
   economy valued. This ledger caps farmable categories, pays the objective and
   chosen difficulty, and rewards a genuinely fortified base. */
function coreRewardLedger(win){
  /* Zero was the wrong number for the one player who most needs a reason to
     press PLAY again: the new commander who fights through the three-minute
     commitment window and still loses. They saw MISSION FAILED over an empty
     payout panel — no cores, no XP, not even a breakdown explaining why. The
     anti-farm rule still blocks shorter exits; a committed loss earns a token
     recovery instead of a blank screen. */
  if(!matchCommitted(win)) return {base:0,parts:[]};
  const secs=stats.t|0, kills=stats.kills[0]|0;
  const fort=(typeof fortOf==='function'&&fortOf(0))?fortOf(0).tier|0:0;
  const completion=secs>=90?18:6;
  const service=Math.min(24,Math.floor(secs/45)*2);
  const combat=Math.min(36,Math.round(Math.sqrt(Math.max(0,kills))*3));
  const defence=Math.min(24,fort*8);
  const science=Math.min(18,(typeof resDone!=='undefined'?resDone:0)*3);
  const objective=win?50:0;
  const challenge=(win?[0,14,30]:[0,7,14])[clamp(difficulty|0,0,2)];
  const day=rewardDayKey();
  const firstWin=win&&META.firstWinDay!==day?25:0;
  if(firstWin) META.firstWinDay=day;
  return {base:completion+service+combat+defence+science+objective+challenge+firstWin,
    parts:[['Completion',completion],['Field time',service],['Combat',combat],
           ['Fortification',defence],['Research',science],['Objective',objective],
           ['Challenge',challenge],['First win',firstWin]].filter(p=>p[1]>0)};
}
function metaGrant(win){
  const mult=wcRewardMult();
  const committed=matchCommitted(win);
  const rewardScale=win?1:(committed?.35:0);
  /* Boosters apply on top of the wildcard multiplier, so a player who stacked
     both sees a genuinely large number — which is the point of spending an
     hour-long booster on a hard match rather than an easy one. */
  const bx=(typeof boostMul==='function')?boostMul('xp'):1;
  const bc=(typeof boostMul==='function')?boostMul('cores'):1;
  const mode=matchRewardMode(),modeContract=modeRewardContract(mode);
  const conquest=win&&typeof mfConquestReward==='function'?mfConquestReward(typeof curMap!=='undefined'?curMap:''):null;
  const xp=Math.round(((40+stats.kills[0]*0.35+(win?120:30)+difficulty*40)*mult*bx*rewardScale
    +(conquest?conquest.xp:0))*modeContract.xp);
  const ledger=coreRewardLedger(win);
  const cores=Math.round(ledger.base*mult*bc*rewardScale)+(conquest?conquest.cores:0);
  if(conquest)ledger.parts.push(['Conquest first clear',conquest.cores]);
  const data=(typeof researchDataFromMatch==='function')?researchDataFromMatch(win):{total:0,parts:[]};
  const field={mass:Math.max(0,Math.floor(resM[0]||0)),energy:Math.max(0,Math.floor(resE[0]||0)),
               reclaimed:Math.max(0,Math.round(stats.reclaimed||0))};
  const r0=metaRankIdx();
  META.xp+=xp; metaGrantCores(cores,'match_reward'); META.matches++; META.kills+=stats.kills[0];
  if(mode==='standard')META.standardMatches=(META.standardMatches||0)+1;
  META.modeMatches=META.modeMatches||{};META.modeMatches[mode]=(META.modeMatches[mode]||0)+1;
  /* The record a player would actually look back on: streaks, personal bests,
     how long they have spent, and which faction they keep beating. */
  if(win){ META.wins++; META.streak=(META.streak||0)+1;
           META.bestStreak=Math.max(META.bestStreak||0,META.streak);
           if(stats.t>0) META.fastestWin=META.fastestWin? Math.min(META.fastestWin,stats.t|0) : (stats.t|0);
           const f=(typeof AI!=='undefined'&&AI.fac)||'';
           if(f){ META.facWins=META.facWins||{}; META.facWins[f]=(META.facWins[f]||0)+1;
                  let best='',bn=0; for(const k in META.facWins) if(META.facWins[k]>bn){bn=META.facWins[k];best=k;}
                  META.favFac=best; }
           if(typeof curMap!=='undefined'&&curMap){
             const gated=typeof mfConquestGateActive==='function'&&mfConquestGateActive();
             const open=typeof mfConquestMapOpen!=='function'||mfConquestMapOpen(curMap);
             /* Weekly can loan a later homeworld. Recording that win as mapWins
                would skip the three locked systems on a fresh save (HasWin). */
             if(!gated||open){ META.mapWins=META.mapWins||{};
               META.mapWins[curMap]=(META.mapWins[curMap]||0)+1; }
           }
  } else { META.losses=(META.losses||0)+1; META.streak=0; }
  META.bestKills=Math.max(META.bestKills||0, stats.kills[0]|0);
  META.playSec=(META.playSec||0)+(stats.t|0);
  META.built=(META.built||0)+((stats.built&&stats.built[0])|0);
  META.lost=(META.lost||0)+(stats.kills[1]|0);
  if(!META.firstPlayed) META.firstPlayed=Date.now();
  META.lastPlayed=Date.now();
  const loot=invGrantMatchLoot(win);
  const modeReward=invGrantModeReward(win,mode,loot);
  const r1=metaRankIdx();
  metaSave();
  /* Daily orders read what actually happened, never a button press. */
  if(typeof dailyRecord==='function') dailyRecord({
    win:!!win, kills:stats.kills[0]|0, built:(stats.built&&stats.built[0])|0,
    nests:(stats.nests|0), difficulty:difficulty|0,
    wildcards:(typeof wcActive!=='undefined'?wcActive.length:0), seconds:stats.t|0});
  if(typeof syncPush==='function') syncPush();     // push the new record if linked
  return {xp,cores,mult,parts:ledger.parts,data:data.total||0,dataParts:data.parts||[],conquest,
          mode,modeContract,modeReward,field,loot,rankUp:r1>r0?RANKS[r1]:null};
}

/* The name we greet a player by. The profile name is what they chose in game
   and is what the account sync writes back into, so it wins; a signed-in player
   who never set one falls back to their e-mail's local part rather than to a
   generic word. */
function mfGreetName(){
  const P=(typeof activeProf==='function')?activeProf():null;
  if(P&&P.name&&P.name.trim()) return P.name.trim();
  if(typeof AP_SESSION!=='undefined'&&AP_SESSION&&AP_SESSION.email)
    return String(AP_SESSION.email).split('@')[0];
  return 'Commander';
}
/* Profile names are player-controlled and are also restored from account/save
   data. Keep the stored value untouched, but encode it at the two profile
   innerHTML boundaries so callsigns remain literal text rather than markup. */
function mfMetaEsc(v){
  return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

/* A player should not have to infer whether two similarly named systems stack,
   expire, or consume inventory. Keep the vocabulary and the two-system guide
   in one classic-script owner so every screen tells the same truth. */
const MF_OWNERSHIP_LABELS=Object.freeze({
  permanent:'PERMANENT', equipped:'EQUIPPED', crafted:'WEARS', match:'ONE MATCH', cosmetic:'PERMANENT · COSMETIC'
});
function mfOwnershipBadgeHTML(kind){
  const k=MF_OWNERSHIP_LABELS[kind]?kind:'permanent';
  return '<span class="mfOwnershipBadge kind-'+k+'" data-ownership="'+k+'" data-scope="'+k+'">'+MF_OWNERSHIP_LABELS[k]+'</span>';
}
function mfProgressionGuideHTML(active){
  const on=active==='development'?'development':'arsenal';
  return '<section class="mfProgressionGuide" data-active="'+on+'" aria-label="Arsenal and Development progression">'
    +'<div class="mfProgressionLane'+(on==='arsenal'?' on':'')+'" data-progression-system="arsenal"><b>ARSENAL / CORES</b>'
    +'<span>Earned Cores buy PERMANENT protocols and cosmetics. Vault gear stays owned; EQUIPPED effects apply only while fitted.</span></div>'
    +'<div class="mfProgressionLane'+(on==='development'?' on':'')+'" data-progression-system="development"><b>DEVELOPMENT / DATA + MATERIALS</b>'
    +'<span>Research Data buys PERMANENT account unlocks. Recovered materials craft modules that WEAR with use. Readied supplies are ONE MATCH and consume one charge at launch.</span></div>'
    +'</section>';
}

/* Rank rewards are derived from the actual unlock catalogs. Hand-authored rank
   prose drifted away from those gates; deriving the ledger makes the Career
   page and next-unlock rail change whenever a real gate changes. */
function mfRankMilestonesAt(rankIdx){
  const out=[];
  CHARACTERS.filter(x=>x.unlock===rankIdx).forEach(x=>out.push({scope:'cosmetic',label:'COMMANDER · '+x.nm}));
  TITLES.filter(x=>x.id&&x.unlock===rankIdx).forEach(x=>out.push({scope:'cosmetic',label:'TITLE · '+x.nm}));
  FRAMES.filter(x=>x.unlock===rankIdx).forEach(x=>out.push({scope:'cosmetic',label:'FRAME · '+x.nm}));
  if(typeof OPMODS!=='undefined') OPMODS.filter(x=>x.gate&&x.gate.kind==='rank'&&x.gate.n===rankIdx)
    /* Rank permanently unlocks access to the rule; selecting it later changes
       one operation. The Career milestone describes the entitlement. */
    .forEach(x=>out.push({scope:'permanent',label:'OPERATION RULE · '+x.nm}));
  return out;
}
function mfRankMilestoneSummary(rankIdx){
  return mfRankMilestonesAt(rankIdx).map(x=>x.label).join(' · ');
}

function getNextUnlockTrack(maxItems){
  const max=maxItems||3;
  const items=[];
  
  // 1. Account Rank Progression
  const r=metaRankIdx();
  const nextRank=RANKS[r+1];
  if(nextRank){
    const req=nextRank.xp;
    const cur=(typeof META!=='undefined'&&META.xp)||0;
    const pct=Math.min(100,Math.round(metaRankProg()*100));
    items.push({
      type:'rank',
      title:'ACCOUNT RANK '+(r+2),
      name:nextRank.nm,
      badge:nextRank.em||'🎖',
      progress:pct,
      progressLabel:cur+' / '+req+' XP ('+pct+'%)',
      desc:mfRankMilestoneSummary(r+1)
    });
  }

  // 2. Next Conquest Battlefield
  if(typeof mfConquestCatalog==='function'){
    const catalog=mfConquestCatalog();
    const nextSite=catalog.find(x=>!x.won&&x.open);
    if(nextSite){
      const D=(typeof MAPDEFS!=='undefined'&&MAPDEFS[nextSite.key])||{};
      const rew=(typeof mfConquestReward==='function')?mfConquestReward(nextSite.key):null;
      items.push({
        type:'conquest',
        title:'FRONT '+nextSite.tier+' / 48',
        name:D.nm||nextSite.key,
        badge:'⚔',
        progress:Math.round((nextSite.tier-1)/48*100),
        progressLabel:'FRONT '+nextSite.tier+' / 48',
        desc:rew?('First Clear: +'+rew.xp+' XP · +'+rew.cores+' Cores'):(D.ds||'Operational theatre')
      });
    }
  }

  // 3. Next Arsenal Perk
  if(typeof STORE!=='undefined'){
    const unbought=STORE.map(it=>({it,tier:Math.max(0,(META.owned&&META.owned[it.id])|0)}))
      .filter(x=>x.tier<x.it.max);
    if(unbought.length>0){
      const curCores=(typeof META!=='undefined'&&META.cores)||0;
      const next=unbought.find(x=>curCores>=x.it.cost[x.tier])||unbought[0];
      const affordable=next.it,price=affordable.cost[next.tier];
      const pct=Math.min(100,Math.round(curCores/Math.max(1,price)*100));
      items.push({
        type:'armory',
        title:'ARSENAL REQUISITION',
        name:affordable.nm,
        badge:affordable.em||'⚙',
        progress:pct,
        progressLabel:curCores+' / '+price+' Cores',
        desc:'PERMANENT · '+(affordable.ds||'combat doctrine upgrade')
      });
    }
  }

  return items.slice(0,max);
}

function renderNextUnlockRail(){
  const box=document.getElementById('mfNextUnlockRail');
  if(!box) return;
  const tracks=getNextUnlockTrack(3);
  box.innerHTML=tracks.map(t=>
    '<div class="mfNextCard type-'+t.type+'">'
    +'<div class="mfNextHead"><span class="mfNextBadge">'+t.badge+'</span><b>'+(typeof mfGalaxyEsc==='function'?mfGalaxyEsc(t.title):t.title)+'</b></div>'
    +'<div class="mfNextName">'+(typeof mfGalaxyEsc==='function'?mfGalaxyEsc(t.name):t.name)+'</div>'
    +'<div class="mfNextProg"><div class="mfNextFill" style="width:'+t.progress+'%"></div></div>'
    +'<div class="mfNextMeta"><span>'+(typeof mfGalaxyEsc==='function'?mfGalaxyEsc(t.progressLabel):t.progressLabel)+'</span><small>'+(typeof mfGalaxyEsc==='function'?mfGalaxyEsc(t.desc):t.desc)+'</small></div>'
    +'</div>'
  ).join('');
}

/* ---------- menu header + armory UI ---------- */
function renderMetaHead(){
  const r=metaRankIdx(), R=RANKS[r], next=RANKS[r+1], P=activeProf();
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  const ID=profIdentity();
  const glyph=document.getElementById('rankEmGlyph');
  if(glyph){
    /* Wearing a commander replaces the emoji with their portrait, framed by
       whichever frame the account has unlocked and chosen. The level badge is a
       sibling, so it survives this swap. */
    if(ID.portrait) glyph.innerHTML='<img class="badgePortrait fr-'+ID.frame+'" src="'+ID.portrait+'" alt="">';
    else glyph.textContent=ID.emblem;
  }
  set('rankLvl', r+1);
  /* The name / rank label / XP bar / XP count moved to Profile ▸ CAREER
     (renderCareer). The header keeps the badge and a one-line greeting; the
     badge's tooltip carries the rank so the symbol is never a mystery. */
  const be=document.getElementById('rankEm');
  if(be) be.title=R.nm+(next? ' · '+META.xp+' / '+next.xp+' XP' : ' · MAX RANK');
  const gl=document.getElementById('greetLine');
  if(gl) gl.textContent=(mfGreetName()+(ID.title?' \u00b7 '+ID.title:'')).toUpperCase();
  const gs=document.getElementById('greetSub');
  if(gs) gs.textContent=R.em+' '+R.nm+(next? ' · '+Math.round(metaRankProg()*100)+'% to '+next.nm : ' · max rank');
  set('coreV',META.cores);
  set('coreV2',META.cores);
  set('metaRec',META.wins+'W / '+(META.matches-META.wins)+'L');
  /* The menu header is redrawn on every return to the front end, which makes it
     the one reliable place to refresh the Inbox badge. Without this the dot only
     appeared after opening the Inbox — which is the one moment it is useless. */
  if(typeof storyRefreshBadge==='function'){ try{ storyRefreshBadge(); }catch(e){} }
  renderNextUnlockRail();
}

/* ---------- war room ----------
   Four operations behind one door. Playable modes come first and the locked
   ones stay VISIBLE rather than hidden — a locked card that explains itself is
   a roadmap; a hidden one is just a menu that looks small. */
/* Ordered by development priority, which is also the order a player should meet
   them: learn, skirmish, then enter the authored solo Prologue. MMO / Co-op
   stay visible as roadmap cards and never enter a stub. */
const WAR_MODES=[
  {id:'training', em:'\u25b6', nm:'TRAINING',  ds:'Field orientation under KEEL guidance',
   foot:''},
  /* Standard is the finished local mode. Advertising co-op here while the
     hosted service is locked creates a false affordance: the player taps a
     promised mode and lands in single-player setup instead. */
  {id:'standard', em:'\u2694', nm:'STANDARD',  ds:'Single-player against AI, with optional AI allies',
   foot:'4 planets \u00b7 16 regions \u00b7 48 conquest battlefields'},
  {id:'campaign', em:'\u2b21', nm:'CAMPAIGN',  ds:'Guided story missions with authored objectives',
   foot:'5-mission playable Prologue \u00b7 solo authored objectives'},
  {id:'mmo',      em:'\u2637', nm:'MMO',       ds:'Persistent planets \u00b7 build a commander HQ, take ground',
   foot:'Persistent warfront \u00b7 not yet in play', locked:'LONG TERM'},
  {id:'coop',   em:'\u25c8', nm:'CO-OP', ds:'Two commanders against adaptive AI',
   foot:'Separate online service \u00b7 not yet in play', locked:'NETWORK IN DEVELOPMENT'}
];
function renderWarRoom(){
  const g=document.getElementById('warGrid'); if(!g) return;
  const T=(typeof trainingUiState==='function')?trainingUiState():null;
  /* tutorial.js polls mission state while this screen is open. Record the
     exact state that produced these cards so the poll can refresh copy only
     when it has changed, rather than replacing a card mid pointer gesture. */
  g.dataset.mfTrainingSig=T?[T.done,T.active,T.interrupted,T.progress,T.rewarded,T.state,T.action].join(':'):'';
  g.innerHTML=WAR_MODES.map(M=>{
    let foot=M.foot, sub=M.ds;
    if(M.id==='training'&&T){
      foot=T.state;
      sub=(T.action||'\u25b6 START TRAINING').replace(/^\S+\s+/,'');
      sub=sub.charAt(0)+sub.slice(1).toLowerCase()+' \u00b7 protected drop, no early rush';
    }
    const C=MODE_REWARD_CONTRACTS[M.id],it=C&&C.item?INV_CONSUMABLES.find(x=>x.id===C.item):null;
    const reward=C?'<span class="warReward" style="--mode:'+C.accent+'"><b>+'+Math.round((C.xp-1)*100)+'% XP</b>'
      +(it?'<small>'+it.em+' '+it.nm.toUpperCase()+' · ONE MATCH</small>':'')+'</span>':'';
    const lock=M.locked
      ? '<span class="warLock">\ud83d\udd12 '+M.locked+'</span>' : '';
    return '<button type="button" class="warCard'+(M.locked?' locked':'')+(M.browse?' browse':'')+'" data-mode="'+M.id+'"'
      +(M.locked&&!M.browse?' aria-disabled="true"':'')+'>'
      +'<span class="warEm">'+M.em+'</span>'
      +'<span class="warBody"><span class="warNm">'+M.nm+'</span>'
      +'<span class="warDs">'+sub+'</span>'
      +(foot?'<span class="warFootTx">'+foot+'</span>':'')+reward+'</span>'
      +lock+'</button>';
  }).join('');
  g.querySelectorAll('.warCard').forEach(el=>{
    const go=()=>{
      const m=el.dataset.mode;
      if(el.classList.contains('locked')){
        /* Advertised, unimplemented. Opening setup / Operations from here was
           a trap: the card looked locked but still entered a stub room. */
        if(typeof sfx==='function'){ try{ sfx('deny'); }catch(e){} }
        if(typeof toast==='function') toast(el.querySelector('.warNm').textContent+' is not available yet.');
        return;
      }
      if(m==='standard'&&typeof openSkirmishSetup==='function') openSkirmishSetup();
      else if(m==='training'&&typeof resumeTrainingMission==='function') resumeTrainingMission();
      else if(m==='campaign'){
        if(typeof MF_TAB_STATE!=='undefined') MF_TAB_STATE.opsScr='campaign';
        if(typeof renderOps==='function') renderOps();
        if(typeof showFrontScreen==='function') showFrontScreen('opsScr');
      }
    };
    if(typeof mfBindTap==='function') mfBindTap(el,go); else el.addEventListener('click',go);
  });
}

/* ---------- profile (account) screen ---------- */
function fmtDur(s){
  s=Math.max(0,s|0);
  const h=(s/3600)|0, m=((s%3600)/60)|0;
  return h? h+'h '+m+'m' : m+'m';
}
/* The career card. Deliberately laid out as labelled figures rather than a
   sentence: a player checks these at a glance, and a glance wants columns. */
function renderCareer(){
  const el=document.getElementById('profStats'); if(!el) return;
  const R=RANKS[metaRankIdx()];
  const m=META, played=(m.matches||0), wins=(m.wins||0), losses=played-wins;
  const wr=played? Math.round(wins/played*100) : 0;
  const facNm=(typeof FACTIONS!=='undefined'&&m.favFac&&FACTIONS[m.favFac])?FACTIONS[m.favFac].nm:'—';
  const cell=(v,l)=>'<div class="cCell"><b>'+v+'</b><span>'+l+'</span></div>';
  const rankIdx=metaRankIdx(), nx=RANKS[rankIdx+1], P=(typeof activeProf==='function'?activeProf():null);
  const milestoneLedger='<section class="cMilestoneLedger" aria-label="Account rank unlock milestones">'
    +'<div class="cMilestoneHead"><b>RANK MILESTONES</b><span>Actual unlocks at every account rank</span></div>'
    +RANKS.map((rank,i)=>{
      const state=i<rankIdx?' done':i===rankIdx?' current':' locked';
      const milestones=mfRankMilestonesAt(i);
      return '<div class="cMilestone'+state+'" data-rank-index="'+i+'"><div class="cMilestoneRank"><i>'+rank.em+'</i><span><b>'+(i+1)+' · '+rank.nm+'</b><small>'+rank.xp.toLocaleString()+' XP</small></span></div>'
        +'<div class="cMilestoneItems">'+milestones.map(x=>'<div>'+mfOwnershipBadgeHTML(x.scope)+'<span>'+mfMetaEsc(x.label)+'</span></div>').join('')+'</div></div>';
    }).join('')+'</section>';
  el.innerHTML=
    /* The rank ladder lives here now, not in the menu header. */
    '<div class="cLadder">'+
      (()=>{ const I=profIdentity();
        return I.portrait
          ? '<div class="cLadEm"><img class="badgePortrait fr-'+I.frame+'" src="'+I.portrait+'" alt=""></div>'
          : '<div class="cLadEm">'+I.emblem+'</div>'; })()+
      '<div class="cLadInfo">'+
        '<div class="cLadNm">'+mfMetaEsc((P&&P.name)?P.name:'Commander')
          +((()=>{const I=profIdentity();return I.title?' <i>'+I.title+'</i>':'';})())+'</div>'+
        '<div class="cLadRank">'+R.em+' '+R.nm+'</div>'+
        '<div class="cLadBarO"><div class="cLadBarF" style="width:'+(metaRankProg()*100)+'%"></div></div>'+
        '<div class="cLadXp">'+(nx? (m.xp||0).toLocaleString()+' / '+nx.xp.toLocaleString()+' XP · next: '+nx.nm
                                  : (m.xp||0).toLocaleString()+' XP · MAX RANK')+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="cRank">'+R.em+' '+R.nm+' · '+(m.xp||0).toLocaleString()+' XP</div>'+
    '<div class="cGrid">'+
      cell(played,'MATCHES')+cell(wins+'/'+losses,'W / L')+cell(wr+'%','WIN RATE')+
      cell(m.bestStreak||0,'BEST STREAK')+cell((m.kills||0).toLocaleString(),'KILLS')+
      cell((m.bestKills||0).toLocaleString(),'BEST GAME')+
      cell(fmtDur(m.playSec),'TIME PLAYED')+cell((m.cores||0).toLocaleString(),'CORES')+
      cell((m.researchData||0).toLocaleString(),'RESEARCH DATA')+
      cell(m.fastestWin? fmtDur(m.fastestWin):'—','FASTEST WIN')+
    '</div>'+
    '<div class="cFoot">Most beaten: '+facNm+
      (m.streak? ' · on a '+m.streak+'-win run' : '')+'</div>'+milestoneLedger;
}

/* One category system for the long-form meta screens. It follows the same
   interaction contract everywhere: one visible sibling panel, remembered
   selection, 48px targets in CSS, and arrow-key/controller-style traversal. */
const MF_TAB_STATE={};
let MF_POINTER_COMMIT=-1e9;
const mfTapNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
/* A transformed control may disappear or move in its pointer-up callback. The
   browser then re-hit-tests the compatibility click against the NEW screen,
   where an element-local debounce cannot see it. Suppress that one click at
   document capture. A new pointer-down or keyboard action clears the guard, so
   fast intentional taps and accessibility activation still pass normally. */
if(typeof document!=='undefined'&&!document.__mfGhostClickGuard){
  document.__mfGhostClickGuard=true;
  document.addEventListener('pointerdown',()=>{ MF_POINTER_COMMIT=-1e9; },true);
  document.addEventListener('keydown',()=>{ MF_POINTER_COMMIT=-1e9; },true);
  document.addEventListener('click',e=>{
    if(mfTapNow()-MF_POINTER_COMMIT<650){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);
}
/* A phone tap is not the same thing as a desktop click. Android WebView can
   cancel the synthetic click when a finger drifts a few pixels inside a
   scrollable tab row, even though the player plainly tapped the control. Keep
   scrolling intact, commit on pointer-up only when the gesture stayed inside
   a small slop radius, and retain click as the keyboard/accessibility path. */
function mfBindTap(el,fn){
  if(!el||typeof fn!=='function') return;
  let press=null, pointerCommit=-1e9;
  const now=mfTapNow;
  el.addEventListener('pointerdown',e=>{
    if(e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0)) return;
    press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  },{passive:true});
  el.addEventListener('pointermove',e=>{
    if(!press||e.pointerId!==press.id) return;
    if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>12) press.moved=true;
  },{passive:true});
  el.addEventListener('pointercancel',e=>{
    if(press&&e.pointerId===press.id) press=null;
  },{passive:true});
  el.addEventListener('pointerup',e=>{
    if(!press||e.pointerId!==press.id) return;
    const ok=!press.moved&&el.contains(e.target);
    press=null;
    if(!ok||el.disabled) return;
    pointerCommit=MF_POINTER_COMMIT=now();
    fn(e);
  });
  el.addEventListener('click',e=>{
    /* A real pointer tap produces pointerup and then click. Swallow only that
       duplicate; Enter/Space and assistive-tech clicks have no pointer commit. */
    /* The pointerup callback is allowed to replace its own button (tabbed
       screens do this). The following click can then be retargeted to a NEW
       button at that coordinate, so the duplicate guard must be shared across
       every bound control rather than living only on the removed element. */
    if(now()-pointerCommit<600||now()-MF_POINTER_COMMIT<600){
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if(!el.disabled) fn(e);
  });
}
/* Settings rows are divs because their two-column visual treatment predates
   the tabbed screen. Give those existing controls the keyboard contract of a
   button without disturbing the pointer-up/slop path used by phones. The
   second callback argument lets renderSettings restore focus after it replaces
   the activated row. */
function mfSettingsBindRow(el,fn){
  if(!el||!el.dataset||!el.dataset.set||typeof fn!=='function') return;
  if(!el.hasAttribute('role')) el.setAttribute('role','button');
  if(!el.hasAttribute('tabindex')) el.tabIndex=0;
  let keyActivation=false;
  mfBindTap(el,e=>fn(keyActivation,e));
  el.addEventListener('keydown',e=>{
    if(e.isComposing||(e.key!=='Enter'&&e.key!==' ')) return;
    e.preventDefault();
    if(e.repeat) return;
    keyActivation=true;
    try{ el.click(); }finally{ keyActivation=false; }
  });
}
function mfSetTabs(root,key,focus){
  if(!root) return;
  const tabs=[...root.querySelectorAll('[data-mf-tab]')];
  const panels=[...root.querySelectorAll('[data-mf-panel]')];
  if(!tabs.length||!panels.length) return;
  const active=tabs.some(b=>b.dataset.mfTab===key)?key:tabs[0].dataset.mfTab;
  MF_TAB_STATE[root.id||'mfTabs']=active;
  tabs.forEach(b=>{
    const on=b.dataset.mfTab===active;
    b.classList.toggle('on',on);
    b.setAttribute('aria-selected',on?'true':'false');
    b.tabIndex=on?0:-1;
  });
  panels.forEach(p=>{ p.hidden=p.dataset.mfPanel!==active; });
  /* Feature screens can react to category context without adding a second tap
     handler to the same button. Operations uses this to keep its persistent
     deployment plan in sync with the Weekly contract being inspected. */
  try{ root.dispatchEvent(new CustomEvent('mftabchange',{detail:{key:active,focus:!!focus}})); }catch(e){}
  if(focus){
    const scroller=root.querySelector('.settingsScroll,.profileScroll,.opsScroll,.dailyScroll,.inboxScroll');
    if(scroller) scroller.scrollTop=0;
    const b=tabs.find(x=>x.dataset.mfTab===active);
    if(b) try{ b.focus({preventScroll:true}); }catch(e){ b.focus(); }
    /* Keep the active category fully inside its horizontal rail without using
       scrollIntoView, which can also move the entire Android page vertically. */
    if(b){
      const rail=b.closest('.screenTabs');
      if(rail) requestAnimationFrame(()=>{
        const left=b.offsetLeft,right=left+b.offsetWidth,viewL=rail.scrollLeft,viewR=viewL+rail.clientWidth;
        if(b===tabs[0]) rail.scrollLeft=0;
        else if(left<viewL+4) rail.scrollLeft=Math.max(0,left-8);
        else if(right>viewR-4) rail.scrollLeft=Math.max(0,right-rail.clientWidth+8);
      });
    }
    if(typeof sfx==='function') sfx('ui');
  }
}
function mfBindTabs(root,initial){
  if(!root) return;
  const tabs=[...root.querySelectorAll('[data-mf-tab]')];
  if(!tabs.length) return;
  tabs.forEach(b=>{
    if(b.dataset.mfTapBound) return;
    b.dataset.mfTapBound='1';
    mfBindTap(b,()=>mfSetTabs(root,b.dataset.mfTab,true));
  });
  if(!root.dataset.mfTabsBound){
    root.dataset.mfTabsBound='1';
    root.addEventListener('keydown',e=>{
      const b=e.target.closest&&e.target.closest('[data-mf-tab]');
      if(!b||!root.contains(b)||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
      e.preventDefault();
      const liveTabs=[...root.querySelectorAll('[data-mf-tab]')];
      const at=liveTabs.indexOf(b);
      const next=e.key==='Home'?0:e.key==='End'?liveTabs.length-1:
        (at+(e.key==='ArrowRight'?1:-1)+liveTabs.length)%liveTabs.length;
      mfSetTabs(root,liveTabs[next].dataset.mfTab,true);
    });
  }
  mfSetTabs(root,MF_TAB_STATE[root.id||'mfTabs']||initial||tabs[0].dataset.mfTab,false);
}
function renderProfile(){
  renderCareer();
  if(typeof renderAccount==='function') renderAccount();
  const P=activeProf(), R=RANKS[metaRankIdx()];
  const list=document.getElementById('profList');
  if(!list) return;
  let h='';
  for(const p of PROFILES.list){
    let st={xp:0,wins:0,matches:0};
    try{ const s=localStorage.getItem('massfront_meta_'+p.id); if(s) st=Object.assign(st,JSON.parse(s)); }catch(e){}
    let ri=0; for(let i=0;i<RANKS.length;i++) if(st.xp>=RANKS[i].xp) ri=i;
    h+='<div class="sItem pItem'+(p.id===PROFILES.active?' selP':'')+'" data-pid="'+p.id+'">'
      +'<div class="sEm">'+p.emblem+'</div>'
      +'<div class="sTx"><b>'+mfMetaEsc(p.name)+'</b><div class="sDs">'+RANKS[ri].em+' '+RANKS[ri].nm
      +' · '+(st.wins||0)+'W/'+((st.matches||0)-(st.wins||0))+'L</div></div>'
      +(p.id===PROFILES.active?'<div class="sBuy" style="background:var(--panelG2) padding-box,var(--steelB) border-box;color:#5dff9a">ACTIVE</div>':'')
      +'</div>';
  }
  list.innerHTML=h;
  list.querySelectorAll('.pItem').forEach(el=>{
    const choose=()=>{
      if(el.dataset.pid!==PROFILES.active){ switchProfile(el.dataset.pid); sfx('ui'); }
      renderProfile();
    };
    if(typeof mfBindTap==='function') mfBindTap(el,choose); else el.addEventListener('click',choose);
  });
  const inp=document.getElementById('profName');
  if(inp) inp.value=P.name;
  const em=document.getElementById('emblemRow');
  if(em){
    em.innerHTML=EMBLEMS.map(e=>'<div class="swatch embSw'+(P.emblem===e?' sel':'')+'" data-em="'+e+'" style="background:var(--panelG2)">'
      +'<span style="background:none;font-size:20px">'+e+'</span></div>').join('');
    em.querySelectorAll('.embSw').forEach(el=>{
      const choose=()=>{ P.emblem=el.dataset.em; profSave(); sfx('ui'); renderProfile(); renderMetaHead(); };
      if(typeof mfBindTap==='function') mfBindTap(el,choose); else el.addEventListener('click',choose);
    });
  }
  renderIdentityPickers();
  mfBindTabs(document.getElementById('profileScr'),'career');
  /* The two-line summary that used to live here has been replaced by the
     career card at the top of the screen — renderCareer() owns #profStats now,
     and writing over it from here was the reason the card never appeared. */
}

/* ---------- identity pickers ----------------------------------------------
   Three rank-gated grids. A locked entry is rendered, dimmed, and states the
   rank that opens it — the roster doubles as the progression screen. Selecting
   a locked entry is a no-op with an explanation, never a silent dead tap. */
function renderIdentityPickers(){
  const P=activeProf(); if(!P) return;
  const r=metaRankIdx();
  const need=e=>'\ud83d\udd12 '+RANKS[e.unlock].nm;

  const cr=document.getElementById('charRow');
  if(cr){
    cr.innerHTML=CHARACTERS.map(c=>{
      const open=r>=c.unlock, sel=P.char===c.id;
      return '<button type="button" class="charCard'+(open?'':' locked')+(sel?' sel':'')+'" data-char="'+c.id+'">'
        +'<span class="charPortrait fr-'+((FRAMES.find(f=>f.id===P.frame)||FRAMES[0]).id)+'">'
          +'<img src="'+charPortrait(c.id)+'" alt="" loading="lazy">'
        +'</span>'
        +'<span class="charNm">'+c.nm+'</span>'
        +'<span class="charRole">'+c.role+'</span>'
        +(open?(sel?'<span class="charState on">SELECTED</span>':'<span class="charState">TAP TO WEAR</span>')
              :'<span class="charState lock">'+need(c)+'</span>')
        +'</button>';
    }).join('');
    cr.querySelectorAll('.charCard').forEach(el=>{
      const go=()=>{
        const c=charById(el.dataset.char); if(!c) return;
        if(!charUnlocked(c)){
          if(typeof sfx==='function'){try{sfx('ui');}catch(e){}}
          if(typeof toast==='function') toast(c.nm+' unlocks at '+RANKS[c.unlock].nm+'.');
          return;
        }
        P.char=(P.char===c.id)?'':c.id;
        if(P.char) P.name=c.nm.replace(/^(Captain|Lord|Broker|The)\s+/,'').slice(0,14);
        profSave(); if(typeof sfx==='function'){try{sfx('ui');}catch(e){}}
        renderProfile(); renderMetaHead();
      };
      if(typeof mfBindTap==='function') mfBindTap(el,go); else el.addEventListener('pointerdown',go);
    });
  }

  const chips=(rowId,items,cur,apply)=>{
    const el=document.getElementById(rowId); if(!el) return;
    el.innerHTML=items.map(t=>{
      const open=r>=t.unlock, sel=cur===t.id;
      return '<button type="button" class="idChip'+(open?'':' locked')+(sel?' sel':'')+'" data-id="'+t.id+'">'
        +'<b>'+t.nm+'</b>'+(open?'':'<span>'+need(t)+'</span>')+'</button>';
    }).join('');
    el.querySelectorAll('.idChip').forEach(b=>{
      const go=()=>{
        const t=items.find(x=>x.id===b.dataset.id); if(!t) return;
        if(r<t.unlock){
          if(typeof sfx==='function'){try{sfx('ui');}catch(e){}}
          if(typeof toast==='function') toast(t.nm+' unlocks at '+RANKS[t.unlock].nm+'.');
          return;
        }
        apply(t.id); profSave(); if(typeof sfx==='function'){try{sfx('ui');}catch(e){}}
        renderProfile(); renderMetaHead();
      };
      if(typeof mfBindTap==='function') mfBindTap(b,go); else b.addEventListener('pointerdown',go);
    });
  };
  chips('titleRow',TITLES,P.title||'',v=>{P.title=v;});
  chips('frameRow',FRAMES,P.frame||'steel',v=>{P.frame=v;});

  /* ---- battle livery -------------------------------------------------------
     Which colours your army wears is an identity choice, so it is made here
     with the callsign and the emblem rather than three taps deep in a shop
     tab. The colour itself stays on META (career-wide, account-synced), NOT on
     the profile record — the row is only the control surface.
     Buying is deliberately NOT duplicated here: the Arsenal's earned-core
     basket is the one and only place cores are debited, so a locked swatch is
     staged there and the player is handed to that checkout. */
  const lvHost=document.getElementById('idLiveryRow');
  if(lvHost){
    /* The shared helper emits its own wrapper, so swap the placeholder node
       instead of nesting a second #idLiveryRow inside it. */
    lvHost.outerHTML=mfLiveryRowHTML('idLiveryRow');
    mfLiveryRowWire(document.getElementById('idLiveryRow'),key=>{
      const C=COLORS[key]; if(!C) return;
      const owned=key==='azure'||!!META.owned['col_'+key];
      if(typeof sfx==='function'){try{sfx('ui');}catch(e){}}
      if(!owned){
        if(typeof armCartAdd==='function'){
          if(typeof armTab!=='undefined') armTab='identity';
          armCartAdd('color',key);
          if(typeof renderMetaHead==='function') renderMetaHead();
          if(typeof renderArmory==='function') renderArmory();
          if(typeof showFrontScreen==='function') showFrontScreen('armory');
          if(typeof toast==='function') toast(C.nm+' staged in the Arsenal basket — confirm to unlock');
        } else if(typeof toast==='function') toast(C.nm+' unlocks in the Arsenal for ⬡'+C.cost);
        return;
      }
      META.color=key; metaSave(); applyColor();
      renderProfile(); renderMetaHead();
    });
  }
  const lvHint=document.getElementById('idLiveryHint');
  if(lvHint) lvHint.innerHTML=mfOwnershipBadgeHTML('cosmetic')+'<span>'+mfMetaEsc(mfLiveryHint())+'</span>';

  const hint=document.getElementById('charHint');
  if(hint){
    const nextC=CHARACTERS.find(c=>c.unlock>r), nextT=TITLES.find(t=>t.unlock>r), nextF=FRAMES.find(f=>f.unlock>r);
    const nx=[nextC&&{n:nextC.nm,u:nextC.unlock},nextT&&{n:nextT.nm+' title',u:nextT.unlock},
              nextF&&{n:nextF.nm+' frame',u:nextF.unlock}].filter(Boolean).sort((a,b)=>a.u-b.u)[0];
    hint.innerHTML=mfOwnershipBadgeHTML('cosmetic')+'<span>'
      +mfMetaEsc(nx ? ('Next unlock: '+nx.n+' at '+RANKS[nx.u].nm)
                    : 'Every commander, title and frame is unlocked.')+'</span>';
  }
}

/* ---------- settings screen ---------- */
function renderSettings(){
  const list=document.getElementById('setList');
  if(!list) return;
  const tog=(id,nm,ds)=>{
    const on=!!META.settings[id];
    return '<div class="sItem setRow" data-set="'+id+'" role="button" tabindex="0" aria-pressed="'+(on?'true':'false')+'"><div class="sTx"><b>'+nm+'</b>'
      +(ds?'<div class="sDs">'+ds+'</div>':'')+'</div><div class="sBuy togB'+(on?' onT':'')+'">'+(on?'ON':'OFF')+'</div></div>';
  };
  const cyc=(id,nm,ds,val,on)=>'<div class="sItem setRow" data-set="'+id+'" role="button" tabindex="0"><div class="sTx"><b>'+nm+'</b>'
      +'<div class="sDs">'+ds+'</div></div><div class="sBuy togB'+(on?' onT':'')+'">'+val+'</div></div>';
  const group=(id,nm,ds,body)=>'<section class="setGroup mfTabPanel" id="setGroup-'+id+'" role="tabpanel" aria-labelledby="setTab-'+id+'" data-mf-panel="'+id+'"><div class="setGroupHd">'+nm+'</div>'
      +'<div class="setGroupDs">'+ds+'</div>'+body+'</section>';
  let h='<div class="screenTabs settingsNav" role="tablist" aria-label="Settings categories">'
       +'<button class="screenTabBtn on" id="setTab-audio" type="button" role="tab" data-mf-tab="audio" aria-controls="setGroup-audio"><span class="tabGlyph">♪</span><span>AUDIO</span></button>'
       +'<button class="screenTabBtn" id="setTab-battle" type="button" role="tab" data-mf-tab="battle" aria-controls="setGroup-battle"><span class="tabGlyph">⚔</span><span>GAMEPLAY</span></button>'
       +'<button class="screenTabBtn" id="setTab-display" type="button" role="tab" data-mf-tab="display" aria-controls="setGroup-display"><span class="tabGlyph">◇</span><span>DISPLAY</span></button>'
       +'<button class="screenTabBtn" id="setTab-command" type="button" role="tab" data-mf-tab="command" aria-controls="setGroup-command"><span class="tabGlyph">⌁</span><span>COMMAND</span></button>'
       +'<button class="screenTabBtn" id="setTab-system" type="button" role="tab" data-mf-tab="system" aria-controls="setExtras"><span class="tabGlyph">⚙</span><span>SYSTEM</span></button></div>';
  const VL=['25%','50%','75%','100%'];
  const sv=clamp(META.settings.sfxVol|0,0,3), av=clamp(META.settings.ambVol|0,0,3);
  const mv=clamp(META.settings.musicVol|0,0,3), vv=clamp(META.settings.voiceVol|0,0,3);
  h+=group('audio','AUDIO MIX','Independent effects, ambience, music, and voice levels.',
       '<div class="audNowPlaying" id="audNowPlaying" role="status" aria-live="polite" aria-atomic="true" data-scene="menu" data-phase="locked">'
      +'<div class="audNowHead"><span>NOW PLAYING</span><b id="audNowScene">COMMAND MENU</b></div>'
      +'<strong id="audNowTitle">Tap to enable music</strong>'
      +'<span id="audNowSource">AUDIO PERMISSION REQUIRED</span>'
      +'<small id="audNowPack">SOUNDTRACK PACK · CHECKING</small></div>'
      +tog('sound','Sound Effects','Weapons, movement, construction, alarms, and interface feedback')
      +cyc('sfxVol','Effects Volume','Activate to cycle the effects bus',VL[sv],true)
      +cyc('ambVol','Ambience Volume','Activate to cycle the battlefield ambience bus',VL[av],true)
      +tog('music','Adaptive Music','Music intensity follows the battle')
      +cyc('musicVol','Music Volume','Activate to cycle the music bus',VL[mv],true)
      +cyc('voiceVol','Voice Volume','Activate to cycle commander, unit, and tutorial voices',VL[vv],true));

  const hb=META.settings.healthBars||'select';
  const HBL={always:'ALWAYS',select:'SELECT',off:'HIDDEN'};
  const HBD={always:'Bars hover over every visible unit and structure',
             select:'Bars appear above selected units and the opened structure',
             off:'All battlefield health bars are hidden'};
  const explorationOn=!!META.settings.experimentalExploration;
  const explorationOpen=explorationOn
    ?'<div class="sItem setRow" data-set="openExperimentalExploration" role="button" tabindex="0"><div class="sTx"><b>Open Galactic Campaign Preview</b>'
      +'<div class="sDs">Launch the isolated converted menu, War Table, ship hub, and campaign systems in this tab.</div></div>'
      +'<div class="sBuy togB onT">OPEN</div></div>'
    :'';
  h+=group('battle','GAMEPLAY & BATTLEFIELD','Information shown while commanding units and optional experimental experiences.',
      tog('godMode','God Mode (Solo)','Infinite mass and energy, instant ability recharge, and invulnerable friendly units and structures')
     +tog('fog','Fog of War','Hide unexplored and unobserved battlefield areas')
     +cyc('healthBars','3D Health Bars',HBD[hb],HBL[hb],hb!=='off')
     +tog('shake','Impact Camera Shake','Recoil and explosions move the camera')
     +tog('haptics','Haptic Feedback','Short vibration cues for confirmations and impacts')
      +tog('experimentalExploration','Experimental: Galactic Campaign',
           'Isolated preview. Converts the menu, War Table, and campaign systems inside the module; '
          +'Classic saves and live matches stay separate.')
      +explorationOpen);

  const perf=META.settings.perf;
  const bg=META.settings.menubg||'dim';
  const BGL={live:'LIVE',dim:'DIMMED',off:'OFF'};
  const BGD={live:'Full-strength battlefield behind the menu',
             dim:'Battlefield kept dark and slow so the menu reads first',
             off:'Flat plate — no 3D scene, lightest on battery'};
  const QL={low:'LOW',medium:'MEDIUM',high:'HIGH',cinematic:'CINEMATIC'};
  const QD={low:'Fastest. No SSAO, bloom, shadows, or local lights. Quiet water, half particles, 1.15x cap.',
            medium:'Mid-tier phones. 4-tap SSAO, cheap glow, low shadows, 4 lights, 1.25x cap. World PBR off.',
            high:'Flagship. 12-tap SSAO, two-pass bloom, full shadows, 8 lights, World PBR. Phone DPR stays under native.',
            cinematic:'Desktop / high-end only. HIGH plus a higher FX floor, far organic motion, stronger bloom and water. Costs frames.'};
  const qk=qualityKey(), sgk=screenGradeKey(), sgDef=SCREEN_GRADES[sgk];
  /* RENDERER STATUS. Three "the map isn't drawing" reports in a row were
     diagnosed by guesswork because the only evidence — a shader log — goes to
     a console no phone shows. This line states, in the game, exactly which
     stage is missing, so one screenshot answers it. */
  const diag=(typeof mfGraphicsDiag==='function')?mfGraphicsDiag():'unavailable';
  const diagBad=/MISSING|LOST|ERR/.test(diag);
  const shL=GFX.shadowQ<=0?'OFF':GFX.shadowQ===1?'LOW':'HIGH';
  const wL=GFX.waterAmp>=1.1?'ULTRA':GFX.waterAmp>=0.95?'HIGH':GFX.waterAmp>=0.55?'MED':'LOW';
  const pL=GFX.particles>=1.25?'ULTRA':GFX.particles>=0.95?'HIGH':GFX.particles>=0.65?'MED':'LOW';
  const aL=GFX.aniso>=8?'8x':GFX.aniso>=4?'4x':'OFF';
  const dL=!(GFX.dprCap>0)?'AUTO':(Math.round(GFX.dprCap*100)/100===1?'1':String(Math.round(GFX.dprCap*100)/100))+'x';
  /* resize() in gl.js overwrites the cap with 2 on a desktop GPU at HIGH or
     CINEMATIC, so this row could read "1.15x" while the colour buffer ran at
     DPR 2.00 — measured against the verbatim cap block: every one of 1 / 1.15 /
     1.25 / 1.5 came back as 2 there. Until that branch honours an explicit
     override, say so from the LIVE value instead of implying the tap took. */
  const dprRaw=(typeof window!=='undefined'&&window.devicePixelRatio)||1;
  const dprWant=GFX.dprCap>0?Math.min(dprRaw,GFX.dprCap):0;
  const dprIgnored=dprWant>0&&typeof DPR==='number'&&Math.abs(DPR-dprWant)>0.01;
  const dprDs='Fillrate cap. AUTO uses the preset. Native 2x/3x is never offered on phones — that is the context-loss spike.'
    +(dprIgnored?' ⚠ NOT APPLIED on this device — the renderer is running at '+DPR.toFixed(2)+'.':'');
  const lodL=(GFX.organicSpan||0)>=4000?'FAR':(GFX.organicSpan||0)>=2400?'STANDARD':(GFX.organicSpan||0)>=800?'NEAR':'OFF';
  const liL=GFX.lights<=0?'OFF':String(GFX.lights|0);
  const live='AO '+(GFX.ao?'on':'off')+' · BLM '+(GFX.bloom?'on':'off')+' · sh '+shL
    +(GFX.contact===false?' · no contact':'')+' · dpr '+(typeof DPR==='number'?DPR.toFixed(2):dL)
    +' · ani '+aL;
  const gfxRow=(id,nm,ds,val,on,lock)=>'<div class="sItem setRow" data-set="'+id+'" role="button" tabindex="0"'
      +(lock?' data-gfx-lock="'+lock.replace(/"/g,'')+'" aria-disabled="true" style="opacity:.55"':'')
      +'><div class="sTx"><b>'+nm+'</b><div class="sDs">'+(lock||ds)+'</div></div>'
      +'<div class="sBuy togB'+(on&&!lock?' onT':'')+'">'+(lock?'N/A':val)+'</div></div>';
  const aniOk=typeof mfAnisoSupported==='function'&&mfAnisoSupported();
  const worldLock=qk==='low'?'PBR civic materials are compiled off on LOW — raise Graphics Quality first.':'';
  const contactLock=GFX.shadowQ<=0?'Needs Shadows — these are the unit and scenery blobs on the directional pass.':'';
  const aniLock=aniOk?'':'This GPU does not expose EXT_texture_filter_anisotropic.';
  const advOpen=!!META.settings.gfxAdvOpen;
  let adv=cyc('gfxAdvOpen','Advanced Graphics',
    'Independent overrides. Changing Graphics Quality resets these to that preset. Screen Grade stays the row above — it is not tied to Cinematic Lighting. No film-grain or god-ray pass exists in this renderer, so those are not listed.',
    advOpen?'HIDE':'SHOW', advOpen);
  if(advOpen){
    adv+='<div style="display:flex;flex-direction:column;gap:7px;padding:2px 0 4px;padding-bottom:max(4px,env(safe-area-inset-bottom,0px))">'
      +gfxRow('gfxShadows','Shadows','Directional ground blobs. OFF skips the pass. LOW strides units. HIGH is full.',shL,GFX.shadowQ>0)
      +gfxRow('gfxSSAO','SSAO','Screen-space contact creases after the opaque pass.',GFX.ao?'ON':'OFF',!!GFX.ao)
      +gfxRow('gfxBloom','Bloom','Bright-pass glow. MEDIUM skips the extra blur; HIGH/CINEMATIC run two passes.',GFX.bloom?'ON':'OFF',!!GFX.bloom)
      +gfxRow('gfxContact','Contact Shadows','Unit, rock, and tree blobs under the directional shadow pass.',GFX.contact!==false?'ON':'OFF',GFX.contact!==false,contactLock)
      +gfxRow('gfxWater','Water Quality','GPU swell and splash budget. Splashes need MED or higher.',wL,GFX.waterAmp>=0.55)
      +gfxRow('gfxParticles','Particles / VFX','Scales GPUFX and the combat particle budget.',pL,GFX.particles>=0.95)
      +gfxRow('gfxAniso','Anisotropic Filtering','Sharpens ground and hull mips at a glancing camera. 1x is off.',aL,GFX.aniso>=4,aniLock)
      +gfxRow('gfxDpr','Resolution Scale',dprDs,dL,(!(GFX.dprCap>0)||GFX.dprCap>=1.25)&&!dprIgnored)
      +gfxRow('gfxLod','Mesh LOD / Motion','How far secondary animation and full meshes survive toward strategic zoom.',lodL,(GFX.organicSpan||0)>=800)
      +gfxRow('gfxLights','Local Lights','Forward lights promoted into the material shader. Everything else stays emissive.',liL,GFX.lights>0)
      +gfxRow('gfxWorldV2','World PBR Materials','HIGH-class civic materials. Off on MEDIUM by default.',GFX.worldV2?'ON':'OFF',!!GFX.worldV2,worldLock)
      +'</div>';
  }
  h+=group('display','DISPLAY & PERFORMANCE','Scale the presentation without hiding tactical information.',
      '<div class="sItem setRow" id="gfxDiagRow"><div class="sTx"><b>Renderer status</b>'
      +'<div class="sDs" id="gfxDiagTx" style="word-break:break-word">'+diag+'</div></div>'
      +'<div class="sBuy togB'+(diagBad?'':' onT')+'">'+(diagBad?'FAULT':'OK')+'</div></div>'
     +'<div class="sItem setRow" data-set="gfxLive" role="button" tabindex="0"><div class="sTx"><b>Live quality</b>'
      +'<div class="sDs" style="word-break:break-word">'+live+'</div></div>'
      +'<div class="sBuy togB onT">GFX</div></div>'
     +cyc('quality','Graphics Quality',QD[qk],QL[qk],qk!=='low')
     +tog('cine','Cinematic Lighting','In-engine sun wash and the #grade overlay. Not bloom — that is Advanced. Not the Screen Grade filter.')
     +cyc('screenGrade','Screen Grade',sgDef.ds,sgDef.label,sgk!=='neutral')
     +tog('dayNight','Day / Night Cycle','Animated time of day. OFF locks battles to clear daylight and overrides night-only modifiers')
     +cyc('perf','Effects Budget','AUTO lets the live effect scaler follow frame rate. LOW pins it to 0.45 or below on every preset — a second cap on top of Graphics Quality, for older phones.',perf==='auto'?'AUTO':'LOW',perf==='auto')
     +tog('fps','FPS Counter','Show the live frame-rate diagnostic')
     +cyc('menubg','Menu Backdrop',BGD[bg],BGL[bg],bg!=='off')
     +adv);

  h+=group('command','COMMAND INTERFACE','Planning aids for formations, platoons, and patrol routes.',
      tog('formationPreview','Formation Preview','Outline where the platoon will end up, on every move order, before it commits')
     +tog('orderPaths','Route Arrows & Patrol Cues','Flashing arrows along the real pathfinding route, plus numbered waypoints and committed patrol loops'));
  h+='<section class="setGroup mfTabPanel" id="setExtras" role="tabpanel" aria-labelledby="setTab-system" data-mf-panel="system"><div class="setGroupHd">SERVICES & ACCESSIBILITY</div>'
    +'<div class="setGroupDs">Tutorial, offline, connectivity, and optional world systems.</div><div id="setExtraRows"></div><div class="setEmpty">No additional services are configured.</div></section>';
  list.innerHTML=h;
  if(typeof audRenderNowPlaying==='function') audRenderNowPlaying();
  mfBindTabs(list,'audio');
  const advControl=list.querySelector('.setRow[data-set="gfxAdvOpen"]');
  if(advControl) advControl.setAttribute('aria-expanded',advOpen?'true':'false');
  list.querySelectorAll('.setRow[data-set]').forEach(el=>{
    mfSettingsBindRow(el,keyActivation=>{
      const k=el.dataset.set;
      if(el.dataset.gfxLock){
        if(typeof toast==='function') toast(el.dataset.gfxLock);
        return;
      }
      if(k==='sfxVol'||k==='ambVol'||k==='musicVol'||k==='voiceVol')
        META.settings[k]=((META.settings[k]|0)+1)%4;
      else if(k==='quality'){
        const o=['low','medium','high','cinematic'];
        META.settings.quality=o[(o.indexOf(qualityKey())+1)%4];
        /* A new preset is a new bundle. Clear overrides so the Advanced rows
           match the title the player just picked. cine follows grade (the
           overlay), not bloom — Screen Grade stays whatever they set. */
        META.settings.gfxOver={};
        const nq=qualityKey(), P=GFX_PRESETS[nq];
        /* Effects Budget is a SECOND, independent cap, and main.js multiplies
           it against this preset's own particles scale. Forcing it to LOW
           whenever the player picked the LOW preset stacked both penalties:
           min(perfBand,0.45) x particles 0.5 = perfScale 0.225 at a LOCKED
           60fps, which clears 3 of the 57 perfScale gates counted in src/ —
           worse than the 0.31 the compounding note in main.js already calls a
           bug, and flatly at odds with this preset's own "quiet water, half
           particles" brief. LOW already pays through particles 0.5, dprCap
           1.15, no post, no shadows and no local lights; left on AUTO it
           measures 0.5 (45/57 gates) at 60fps and still falls to 0.275/0.125
           with perfBand the moment frames sag. The budget row stays one tap
           away for anyone who wants the extra cap. */
        META.settings.perf='auto';
        META.settings.cine=!!P.grade;
      }
      else if(k==='screenGrade'){
        const o=['neutral','soft','punchy'];
        META.settings.screenGrade=o[(o.indexOf(screenGradeKey())+1)%o.length];
      }
      else if(k==='perf') META.settings.perf=META.settings.perf==='auto'?'low':'auto';
      else if(k==='menubg'){
        const o=['live','dim','off'];
        META.settings.menubg=o[(o.indexOf(META.settings.menubg||'dim')+1)%3];
      }
      else if(k==='healthBars'){
        const o=['always','select','off'];
        META.settings.healthBars=o[(o.indexOf(META.settings.healthBars||'select')+1)%3];
      }
      else if(k==='gfxShadows') gfxOverCycle('shadowQ',[0,1,2]);
      else if(k==='gfxSSAO') gfxOverToggle('ao');
      else if(k==='gfxBloom') gfxOverToggle('bloom');
      else if(k==='gfxContact') gfxOverToggle('contact');
      else if(k==='gfxWater') gfxOverCycle('waterAmp',[0.40,0.80,1,1.15]);
      else if(k==='gfxParticles') gfxOverCycle('particles',[0.5,0.75,1,1.5]);
      else if(k==='gfxAniso') gfxOverCycle('aniso',[1,4,8]);
      else if(k==='gfxDpr') gfxOverCycle('dprCap',[1,1.15,1.25,1.5,0]);
      else if(k==='gfxLod'){
        const steps=[{organicSpan:0,lodBias:0.75},{organicSpan:1800,lodBias:0.90},{organicSpan:2700,lodBias:1},{organicSpan:4600,lodBias:1.15}];
        const i=gfxOverNearest(GFX.organicSpan||0, steps.map(s=>s.organicSpan));
        gfxOverSet('organicSpan',steps[i].organicSpan);
        gfxOverSet('lodBias',steps[i].lodBias);
      }
      else if(k==='gfxLights') gfxOverCycle('lights',[0,4,8]);
      else if(k==='gfxWorldV2') gfxOverToggle('worldV2');
      else if(k==='gfxLive'){
        const snap=mfGfxLive();
        try{ console.log('[mfGfx]', snap); }catch(e){}
        if(typeof toast==='function') toast('Live GFX: AO '+(snap.gfx.ao?'on':'off')+' bloom '+(snap.gfx.bloom?'on':'off')+' sh'+snap.gfx.shadowQ);
      }
      else if(k==='gfxDiagRow'){ /* status only */ }
      else if(k==='openExperimentalExploration'){
        if(typeof mfOpenExploration==='function') mfOpenExploration();
        else { if(typeof toast==='function') toast('Galactic preview is not available yet'); sfx('ui'); }
        return;
      }
      else META.settings[k]=!META.settings[k];
      if(k==='fog'&&running&&!demoMode){ fogOn=META.settings.fog; if(fogOn) updateFog(); }
      metaSave(); applySettings(); sfx('ui'); renderSettings();
      if(keyActivation){
        const next=[...list.querySelectorAll('.setRow[data-set]')].find(row=>row.dataset.set===k);
        if(next) try{ next.focus({preventScroll:true}); }catch(e){ next.focus(); }
      }
    });
  });
  /* Other modules append their own rows after this function returns. Adopt
     those live nodes into the final group without stripping their listeners. */
  Promise.resolve().then(()=>{
    const extras=document.getElementById('setExtras'), rows=document.getElementById('setExtraRows');
    if(!extras||!rows) return;
    [...list.children].filter(n=>n.classList&&n.classList.contains('sItem')).forEach(n=>rows.appendChild(n));
    extras.classList.toggle('setGroupEmpty',!rows.children.length);
    mfSetTabs(list,MF_TAB_STATE[list.id]||'audio',false);
  });
}
function renderArmory(){
  const list=document.getElementById('storeList');
  if(!list) return;
  let h='';
  for(const it of STORE){
    const t=META.owned[it.id]||0, maxed=t>=it.max;
    const cost=maxed?0:it.cost[t];
    h+='<div class="sItem'+(maxed?' owned':'')+'" data-id="'+it.id+'">'
      +'<div class="sEm">'+(typeof itemArt==='function'?itemArt('st_'+it.id,it.em,36):it.em)+'</div>'
      +'<div class="sTx"><b>'+it.nm+(it.max>1?' <span class="sTier">'+t+'/'+it.max+'</span>':'')+'</b>'
      +'<div class="sDs">'+it.ds+'</div></div>'
      +'<div class="sBuy">'+(maxed?'✓ MAX':'⬡ '+cost)+'</div></div>';
  }
  h+='<div class="sHead">COMMANDER COLORS</div>'+mfLiveryRowHTML('colorRow');
  list.innerHTML=h;
  list.querySelectorAll('.sItem').forEach(el=>{
    el.addEventListener('pointerdown',()=>{
      const it=STORE.find(s=>s.id===el.dataset.id);
      const t=META.owned[it.id]||0;
      if(t>=it.max){ toast(it.nm+' is fully upgraded'); return; }
      const cost=it.cost[t];
      if(META.cores<cost){ toast('Not enough cores — earn ⬡ by finishing matches'); sfx('alarm'); return; }
      META.cores-=cost; META.owned[it.id]=t+1; metaSave();
      sfx('level'); toast(it.em+' '+it.nm+' → tier '+(t+1));
      renderMetaHead(); renderArmory();
    });
  });
  mfLiveryRowWire(list,key=>{
    const C=COLORS[key]; if(!C) return;
    const owned=key==='azure'||META.owned['col_'+key];
    if(!owned){
      if(META.cores<C.cost){ toast('Not enough cores'); sfx('alarm'); return; }
      META.cores-=C.cost; META.owned['col_'+key]=1;
      toast('🎨 '+C.nm+' unlocked'); sfx('level');
    } else sfx('ui');
    META.color=key; metaSave(); applyColor();
    renderMetaHead(); renderArmory();
  });
}

