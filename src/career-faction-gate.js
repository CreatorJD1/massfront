;
/* ============================================================================
   NEW-CAREER FACTION GATE
   ----------------------------------------------------------------------------
   The experimental world introduction and protected Training live on opposite
   sides of a document boundary. This takeover keeps their required continuation
   in the active base career without inventing a second faction or commander
   roster:

     world intro -> Training or skip -> faction -> roster Commander 1 -> UGA

   Only metaLoad() can distinguish a genuinely absent career record from an old
   zero-match career. Its transient provenance arms this flow on the first
   integrated system entry; a small pending workflow marker then survives the
   same-tab module/Training hops. The actual choice remains META.setup.pf/pc and
   persistCommanderPick(), the existing gameplay authority.
   ============================================================================ */
(function(){
'use strict';

var VERSION=1;
var META_FIELD='newCareerFactionGate';
var READY_EVENT='massfront:new-career-faction-ready';
var EXPLORATION_READY_EVENT='massfront:exploration-ready';
var PHASE_ELIGIBLE='eligible';
var PHASE_AWAIT='awaiting-onboarding';
var PHASE_TRAINING='training';
var PHASE_FACTION='faction-selection';
var PHASE_READY='ready';
var dialog=null,lastFocus=null,initialized=false,baseOpenExploration=null;

function now(){return Date.now();}
function profileId(){
  return typeof PROFILES!=='undefined'&&PROFILES&&typeof PROFILES.active==='string'?PROFILES.active:'';
}
function save(){
  if(typeof metaSave!=='function') return false;
  try{return metaSave()!==false;}catch(e){return false;}
}
function esc(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}
function colorAlpha(value,alpha){
  var match=String(value||'').trim().match(/^#([0-9a-f]{6})$/i);
  if(!match)return 'rgba(102,215,255,'+alpha+')';
  var n=parseInt(match[1],16);
  return 'rgba('+(n>>16)+','+((n>>8)&255)+','+(n&255)+','+alpha+')';
}
function playableRuntimeFactions(){
  var raw=typeof playableFactions==='function'?playableFactions():[];
  return Array.isArray(raw)?raw.filter(function(id){return id==='nova'||id==='legion'||id==='syndicate';}):[];
}
function canonicalFaction(runtime){
  if(typeof facCanonicalId==='function') return facCanonicalId(runtime);
  return runtime==='legion'?'dominion':runtime;
}
function runtimeFaction(value){
  var runtime=typeof facRuntimeKey==='function'?facRuntimeKey(value):value==='dominion'?'legion':value;
  return playableRuntimeFactions().indexOf(runtime)>=0?runtime:null;
}
function factionName(runtime){
  if(typeof facDisplayName==='function') return facDisplayName(runtime);
  var A=typeof facArt==='function'?facArt(runtime):null;
  return A&&A.nm||runtime;
}
function starterFor(runtime){
  if(typeof COMMANDER_ROSTERS==='undefined'||!COMMANDER_ROSTERS) return null;
  var key=typeof commanderFactionKey==='function'?commanderFactionKey(runtime):runtime;
  var roster=COMMANDER_ROSTERS[key];
  if(!Array.isArray(roster)) return null;
  return roster.find(function(C){return C&&!C.aiOnly;})||null;
}
function choices(){
  return playableRuntimeFactions().map(function(runtime){
    var commander=starterFor(runtime),art=typeof facArt==='function'?facArt(runtime):null;
    return commander?{id:canonicalFaction(runtime),runtime:runtime,name:factionName(runtime),
      commander:commander,art:art}:null;
  }).filter(Boolean);
}
function gateMeta(create){
  if(typeof META==='undefined'||!META) return null;
  var G=META[META_FIELD];
  if(G&&(!G.version||G.version>VERSION||G.profileId!==profileId())) G=null;
  if(!G&&create){
    G={version:VERSION,profileId:profileId(),phase:PHASE_AWAIT,armedAt:now(),returnToSpace:true};
    META[META_FIELD]=G;
  }
  return G;
}
function pending(){
  var G=gateMeta(false);
  return !!(G&&G.phase!==PHASE_READY&&G.phase!==PHASE_ELIGIBLE);
}
function genuinelyFresh(){
  if(typeof META==='undefined'||!META||!profileId()) return false;
  if((META.matches|0)>0||(META.standardMatches|0)>0||META.firstPlayed) return false;
  return typeof metaCareerLoadedFromStorage==='function'&&!metaCareerLoadedFromStorage();
}
function arm(opt){
  opt=opt||{};
  var id=profileId(),existing=gateMeta(false);
  if(!id||opt.profileId&&opt.profileId!==id) return {armed:false,reason:'profile-mismatch',state:state()};
  if(existing&&existing.phase!==PHASE_ELIGIBLE)
    return {armed:existing.phase!==PHASE_READY,reason:existing.phase===PHASE_READY?'resolved':'pending',state:state()};
  if(existing&&((META.matches|0)>0||(META.standardMatches|0)>0||META.firstPlayed
     ||META.onboarding&&META.onboarding.choice&&META.onboarding.flowId!=='experimental-space')){
    delete META[META_FIELD];save();
    return {armed:false,reason:'career-already-started',state:state()};
  }
  if(!existing&&!genuinelyFresh()) return {armed:false,reason:'existing-career',state:state()};
  var G=existing||gateMeta(true);G.phase=PHASE_AWAIT;G.armedAt=now();
  G.source=String(opt.source||'integrated-system-entry').slice(0,48);
  if(opt.returnToSpace===false)G.returnToSpace=false;
  if(!save()){delete META[META_FIELD];return {armed:false,reason:'save-failed',state:state()};}
  return {armed:true,reason:'new-career',state:state()};
}
function setPhase(phase,choice){
  var G=gateMeta(false);
  if(!G||G.phase===PHASE_READY) return false;
  G.phase=phase;G.updatedAt=now();
  if(choice==='training'||choice==='skipped')G.onboardingChoice=choice;
  return save();
}
function trainingComplete(){
  if(typeof window.trainingUiState!=='function') return false;
  try{return !!window.trainingUiState().done;}catch(e){return false;}
}
function afterOnboardingChoice(detail){
  detail=detail||{};
  var choice=detail.choice||(detail.action&&detail.action.choice)||'';
  if(choice!=='training'&&choice!=='skipped') return false;
  if(!pending()) return false;
  if(choice==='training'){
    if(!setPhase(PHASE_TRAINING,'training'))return false;
    if(trainingComplete()){setPhase(PHASE_FACTION,'training');show();}
    return true;
  }
  if(!setPhase(PHASE_FACTION,'skipped'))return false;
  show();return true;
}
function openFromRoute(opt){
  opt=opt||{};
  if(!pending()) return false;
  var choice=opt.choice==='training'?'training':'skipped';
  return afterOnboardingChoice({choice:choice,source:'secured-base-route'});
}
function style(){
  if(typeof document==='undefined'||document.getElementById('mfCareerFactionGateStyle'))return;
  var s=document.createElement('style');s.id='mfCareerFactionGateStyle';
  s.textContent=[
    '#mfCareerFactionGate{position:fixed;inset:0;z-index:2147482000;overflow:auto;color:#edfaff;font-family:var(--fU,system-ui,sans-serif);background:radial-gradient(ellipse at 50% -8%,rgba(60,166,210,.28),transparent 45%),radial-gradient(circle at 88% 44%,rgba(40,112,160,.12),transparent 30%),linear-gradient(180deg,#02080e 0%,#030c14 58%,#01060a 100%)}',
    '#mfCareerFactionGate:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.22;background-image:linear-gradient(rgba(98,197,235,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(98,197,235,.055) 1px,transparent 1px);background-size:46px 46px;mask-image:linear-gradient(to bottom,black,transparent 86%)}',
    '#mfCareerFactionGate .mfcfgFrame{position:relative;min-height:100%;display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}',
    '#mfCareerFactionGate .mfcfgShell{position:relative;width:min(1180px,100%);border:1px solid rgba(112,213,248,.35);border-radius:24px;overflow:hidden;background:linear-gradient(145deg,rgba(9,29,42,.985),rgba(3,13,21,.995) 60%);box-shadow:0 36px 120px rgba(0,0,0,.9),0 0 80px rgba(65,181,226,.11)}',
    '#mfCareerFactionGate .mfcfgShell:before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px rgba(223,248,255,.08),inset 0 0 70px rgba(70,187,230,.035)}',
    '#mfCareerFactionGate .mfcfgTopRail{position:relative;display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:48px;padding:10px clamp(18px,3.5vw,44px);border-bottom:1px solid rgba(105,207,246,.19);background:rgba(7,25,36,.86);color:#6edcff;font:900 10px/1.2 var(--fU,system-ui);letter-spacing:.19em}',
    '#mfCareerFactionGate .mfcfgSecure{color:#8aa8b4;font-size:9px;letter-spacing:.13em;text-align:right}',
    '#mfCareerFactionGate .mfcfgGuide{position:relative;display:grid;grid-template-columns:84px minmax(0,1fr) auto;align-items:center;gap:20px;margin:clamp(20px,3vw,34px) clamp(18px,3.5vw,44px) 0;padding:18px 20px;border:1px solid rgba(103,219,255,.24);border-left:3px solid #68ddff;border-radius:14px;background:linear-gradient(90deg,rgba(24,79,102,.29),rgba(6,27,39,.46));box-shadow:inset 0 1px rgba(211,247,255,.055)}',
    '#mfCareerFactionGate .mfcfgKeelSig{position:relative;display:grid;place-items:center;width:72px;height:72px;border:1px solid rgba(106,224,255,.55);border-radius:50%;color:#b7f4ff;background:radial-gradient(circle,rgba(94,224,255,.18),rgba(10,50,68,.54) 58%,transparent 60%);box-shadow:0 0 28px rgba(83,216,255,.16),inset 0 0 22px rgba(83,216,255,.14)}',
    '#mfCareerFactionGate .mfcfgKeelSig:before,#mfCareerFactionGate .mfcfgKeelSig:after{content:"";position:absolute;border:1px solid rgba(105,220,255,.28);border-radius:50%;inset:7px}.mfcfgKeelSig:after{inset:17px;border-style:dashed}',
    '#mfCareerFactionGate .mfcfgKeelSig i{font:900 28px/1 var(--fH,var(--fU,system-ui));font-style:normal;text-shadow:0 0 16px #61ddff}',
    '#mfCareerFactionGate .mfcfgGuideCopy small,#mfCareerFactionGate .mfcfgGuideCopy b{display:block}.mfcfgGuideCopy small{color:#68ddff;font:900 9px/1.2 var(--fU,system-ui);letter-spacing:.18em}.mfcfgGuideCopy b{margin-top:5px;font:900 17px/1.15 var(--fH,var(--fU,system-ui));letter-spacing:.035em}.mfcfgGuideCopy p{max-width:690px;margin:6px 0 0;color:#b9d0da;font:600 11px/1.55 var(--fU,system-ui)}',
    '#mfCareerFactionGate .mfcfgNeutral{display:block;max-width:230px;padding:10px 13px;border-left:1px solid rgba(111,218,250,.24);color:#7796a4;font:800 8px/1.5 var(--fU,system-ui);letter-spacing:.13em;text-align:right}.mfcfgNeutral b{display:block;color:#9deaff;font-size:9px}',
    '#mfCareerFactionGate .mfcfgProgress{display:grid;grid-template-columns:repeat(4,1fr);margin:20px clamp(18px,3.5vw,44px) 0;border-top:1px solid rgba(124,207,237,.14);border-bottom:1px solid rgba(124,207,237,.14)}',
    '#mfCareerFactionGate .mfcfgStep{position:relative;display:flex;align-items:center;gap:9px;min-height:48px;padding:8px 10px;color:#607b88;font:800 8px/1.3 var(--fU,system-ui);letter-spacing:.11em}.mfcfgStep:not(:last-child):after{content:"";position:absolute;right:0;width:1px;height:20px;background:rgba(124,207,237,.13)}.mfcfgStep b{display:grid;place-items:center;width:21px;height:21px;border:1px solid #4f7280;border-radius:50%;font-size:8px}.mfcfgStep.done{color:#83a7b6}.mfcfgStep.done b{border-color:#63cfea;color:#8deaff}.mfcfgStep.active{color:#d8f6ff;background:linear-gradient(90deg,rgba(63,192,235,.10),transparent)}.mfcfgStep.active b{border-color:#70e2ff;background:#164a60;color:#dffaff;box-shadow:0 0 14px rgba(90,221,255,.2)}',
    '#mfCareerFactionGate .mfcfgDecision{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:18px;padding:clamp(24px,4vw,42px) clamp(18px,3.5vw,44px) 20px}.mfcfgEyebrow{color:#68dfff;font:900 9px/1.2 var(--fU,system-ui);letter-spacing:.21em}.mfcfgDecision h2{max-width:780px;margin:8px 0 7px;font:900 clamp(30px,4.6vw,58px)/.98 var(--fH,var(--fU,system-ui));letter-spacing:.012em}.mfcfgLead{max-width:760px;margin:0;color:#9fb7c2;font:600 12px/1.55 var(--fU,system-ui)}.mfcfgRequired{padding:9px 12px;border:1px solid rgba(255,190,84,.32);border-radius:8px;color:#ffcf78;background:rgba(130,78,10,.14);font:900 8px/1.45 var(--fU,system-ui);letter-spacing:.14em;text-align:right}',
    '#mfCareerFactionGate .mfcfgGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 clamp(18px,3.5vw,44px) clamp(22px,3vw,34px)}',
    '#mfCareerFactionGate .mfcfgCard{position:relative;display:flex;flex-direction:column;min-width:0;min-height:480px;padding:0;overflow:hidden;border:1px solid var(--facSoft);border-radius:16px;color:inherit;background:linear-gradient(160deg,var(--facSoft),rgba(5,19,28,.98) 34%,rgba(2,11,17,.99));box-shadow:inset 0 1px rgba(255,255,255,.035),0 14px 38px rgba(0,0,0,.36);text-align:left;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}',
    '#mfCareerFactionGate .mfcfgCard:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:var(--fac);box-shadow:0 0 18px var(--facGlow)}.mfcfgCard:hover,.mfcfgCard:focus-visible{outline:none;transform:translateY(-4px);border-color:var(--fac);box-shadow:0 0 0 1px var(--facGlow),0 22px 52px rgba(0,0,0,.58)}',
    '#mfCareerFactionGate .mfcfgCardHead{display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:82px;padding:14px 16px;border-bottom:1px solid var(--facSoft);background:linear-gradient(90deg,var(--facSoft),transparent)}.mfcfgCardHead .mfcfgCrest{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 0 9px var(--facGlow))}.mfcfgFac{min-width:0}.mfcfgFac small,.mfcfgFac b{display:block}.mfcfgFac small{color:#7894a0;font:900 8px/1.2 var(--fU,system-ui);letter-spacing:.15em}.mfcfgFac b{margin-top:3px;overflow:hidden;color:var(--fac);font:900 15px/1.08 var(--fH,var(--fU,system-ui));letter-spacing:.025em;text-overflow:ellipsis}.mfcfgSelectTag{color:#72919e;font:900 8px/1 var(--fU,system-ui);letter-spacing:.12em}',
    '#mfCareerFactionGate .mfcfgDoctrine{display:block;min-height:74px;padding:15px 17px;color:#abc1cb;font:600 10px/1.45 var(--fU,system-ui)}.mfcfgMotto{display:block;margin-top:7px;color:var(--fac);font:900 8px/1.3 var(--fU,system-ui);letter-spacing:.14em}',
    '#mfCareerFactionGate .mfcfgGrant{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 16px;padding:11px 12px;border:1px solid var(--facSoft);border-radius:10px;background:var(--facSoft)}.mfcfgGrant span small,.mfcfgGrant span b{display:block}.mfcfgGrant span small{color:#9db4be;font:800 7px/1.2 var(--fU,system-ui);letter-spacing:.12em}.mfcfgGrant span b{margin-top:3px;color:#fff;font:900 16px/1 var(--fH,var(--fU,system-ui));letter-spacing:.06em}.mfcfgGrant>i{color:var(--fac);font:900 7px/1 var(--fU,system-ui);font-style:normal;letter-spacing:.12em}',
    '#mfCareerFactionGate .mfcfgCommander{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:stretch;gap:15px;margin:16px 16px 0}.mfcfgCommander>img{width:96px;height:126px;object-fit:cover;object-position:50% 18%;border:1px solid var(--fac);border-radius:10px;background:#06121a;box-shadow:0 0 22px var(--facSoft)}.mfcfgCmdCopy{display:flex;flex-direction:column;justify-content:center;min-width:0}.mfcfgCmdCopy small,.mfcfgCmdCopy b,.mfcfgCmdCopy i{display:block}.mfcfgCmdCopy small{color:#7f9aa6;font:900 7px/1.2 var(--fU,system-ui);letter-spacing:.14em}.mfcfgCmdCopy b{margin-top:7px;color:#f2fbff;font:900 19px/1.05 var(--fH,var(--fU,system-ui));letter-spacing:.025em}.mfcfgCmdCopy i{margin-top:5px;color:var(--fac);font:900 9px/1.2 var(--fU,system-ui);font-style:normal;letter-spacing:.1em}.mfcfgCmdCopy p{margin:9px 0 0;color:#9eb5bf;font:600 9px/1.42 var(--fU,system-ui)}',
    '#mfCareerFactionGate .mfcfgChoose{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:62px;margin:auto 16px 16px;padding:10px 15px;border:1px solid var(--fac);border-radius:10px;background:linear-gradient(90deg,var(--facSoft),rgba(7,21,29,.92));box-shadow:inset 0 1px rgba(255,255,255,.05)}.mfcfgChoose span b,.mfcfgChoose span small{display:block}.mfcfgChoose span b{color:#fff;font:900 11px/1.1 var(--fU,system-ui);letter-spacing:.105em}.mfcfgChoose span small{margin-top:4px;color:#9fb7c1;font:700 8px/1.2 var(--fU,system-ui);letter-spacing:.035em}.mfcfgChoose>i{color:var(--fac);font:300 30px/1 var(--fU,system-ui);font-style:normal}',
    '#mfCareerFactionGate .mfcfgFoot{display:flex;justify-content:space-between;gap:20px;margin:0;padding:15px clamp(18px,3.5vw,44px) 17px;border-top:1px solid rgba(102,210,247,.14);color:#66828e;background:rgba(2,10,16,.58);font:800 8px/1.5 var(--fU,system-ui);letter-spacing:.1em;text-align:right}.mfcfgFoot span:first-child{text-align:left}.mfcfgFoot b{color:#8bb5c5}',
    '@media(max-width:940px){#mfCareerFactionGate .mfcfgFrame{place-items:start center}.mfcfgGuide{grid-template-columns:64px minmax(0,1fr)!important}.mfcfgKeelSig{width:60px!important;height:60px!important}.mfcfgNeutral{grid-column:1/-1;max-width:none!important;padding:10px 0 0!important;border-left:0!important;border-top:1px solid rgba(111,218,250,.18);text-align:left!important}.mfcfgGrid{grid-template-columns:1fr!important}.mfcfgCard{min-height:0!important}.mfcfgCommander{grid-template-columns:112px minmax(0,1fr)!important}.mfcfgCommander>img{width:112px!important;height:136px!important}}',
    '@media(max-width:560px){#mfCareerFactionGate .mfcfgFrame{padding:max(10px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))}.mfcfgShell{border-radius:17px!important}.mfcfgTopRail{min-height:42px!important;padding:9px 14px!important}.mfcfgSecure{display:none}.mfcfgGuide{grid-template-columns:52px minmax(0,1fr)!important;gap:12px!important;margin:14px 12px 0!important;padding:13px!important}.mfcfgKeelSig{width:50px!important;height:50px!important}.mfcfgKeelSig i{font-size:22px!important}.mfcfgGuideCopy b{font-size:15px!important}.mfcfgGuideCopy p{font-size:10px!important}.mfcfgProgress{margin:14px 12px 0!important;grid-template-columns:repeat(4,1fr)}.mfcfgStep{min-height:42px!important;justify-content:center;padding:6px 3px!important;font-size:0!important}.mfcfgStep b{font-size:8px!important}.mfcfgDecision{grid-template-columns:1fr!important;padding:23px 14px 16px!important}.mfcfgDecision h2{font-size:34px!important}.mfcfgRequired{justify-self:start;text-align:left!important}.mfcfgGrid{gap:12px!important;padding:0 12px 20px!important}.mfcfgCardHead{padding:13px!important}.mfcfgDoctrine{min-height:0!important}.mfcfgCommander{grid-template-columns:88px minmax(0,1fr)!important;margin:14px 13px 0!important}.mfcfgCommander>img{width:88px!important;height:116px!important}.mfcfgChoose{min-height:66px!important;margin:15px 13px 13px!important}.mfcfgFoot{display:block!important;padding:14px!important;text-align:left!important}.mfcfgFoot span{display:block}.mfcfgFoot span+span{margin-top:8px}}',
    '@media(prefers-reduced-motion:reduce){#mfCareerFactionGate .mfcfgCard{transition:none}.mfcfgCard:hover,.mfcfgCard:focus-visible{transform:none}}'
  ].join('\n');
  document.head.appendChild(s);
}
function close(){
  if(!dialog)return;
  document.removeEventListener('keydown',key,true);
  dialog.remove();dialog=null;
  if(document.body)document.body.classList.remove('mfCareerFactionGateOpen');
  if(lastFocus&&lastFocus.focus)try{lastFocus.focus({preventScroll:true});}catch(e){}
  lastFocus=null;
}
function key(e){
  if(!dialog)return;
  if(e.key==='Escape'){e.preventDefault();return;}
  if(e.key!=='Tab')return;
  var buttons=Array.prototype.slice.call(dialog.querySelectorAll('button'));
  if(!buttons.length)return;
  var first=buttons[0],last=buttons[buttons.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}
function continueToSpace(detail){
  var event;
  try{event=new CustomEvent(READY_EVENT,{detail:detail,cancelable:true});window.dispatchEvent(event);}catch(e){}
  if(event&&event.defaultPrevented)return true;
  if(!detail.returnToSpace)return true;
  var open=baseOpenExploration||(typeof mfOpenExploration==='function'?mfOpenExploration:null);
  if(typeof open!=='function')return false;
  Promise.resolve(open('system')).catch(function(e){
    if(typeof toast==='function')toast('UGA link is unavailable — use START MASSFRONT to continue');
  });
  return true;
}
function select(value){
  var G=gateMeta(false),runtime=runtimeFaction(value),commander=runtime&&starterFor(runtime);
  if(!G||G.phase!==PHASE_FACTION||!runtime||!commander)return false;
  try{
    playerFaction=runtime;playerCommanderId=commander.id;
  }catch(e){return false;}
  META.setup=META.setup&&typeof META.setup==='object'?META.setup:{};
  META.setup.pf=runtime;META.setup.pc=commander.id;
  if(typeof persistCommanderPick==='function')persistCommanderPick();
  if(META.setup.pf!==runtime||META.setup.pc!==commander.id)return false;
  G.phase=PHASE_READY;G.resolvedAt=now();G.updatedAt=G.resolvedAt;
  if(!save()){G.phase=PHASE_FACTION;delete G.resolvedAt;return false;}
  var detail={schema:'massfront.new-career-faction-ready.v1',profileId:profileId(),
    factionId:canonicalFaction(runtime),runtimeFaction:runtime,commanderId:commander.id,
    commanderName:commander.nm,returnToSpace:G.returnToSpace!==false,
    continuation:{required:true,nextStep:'full-uga-space',entryView:'system'}};
  close();
  if(typeof applyFactionTheme==='function')try{applyFactionTheme(runtime);}catch(e){}
  if(typeof renderMetaHead==='function')try{renderMetaHead();}catch(e){}
  if(typeof sfx==='function')try{sfx('confirm');}catch(e){}
  if(typeof toast==='function')toast(commander.nm+' assigned · '+factionName(runtime));
  setTimeout(function(){continueToSpace(detail);},0);
  return detail;
}
function show(){
  var G=gateMeta(false);
  if(!G||G.phase!==PHASE_FACTION||typeof document==='undefined'||!document.body)return false;
  if(dialog)return true;
  var opts=choices();if(opts.length!==3)return false;
  var orientation=G.onboardingChoice==='training'?'PROTECTED TRAINING COMPLETE':'ORIENTATION SKIPPED';
  style();lastFocus=document.activeElement;
  var root=document.createElement('section');root.id='mfCareerFactionGate';root.setAttribute('role','dialog');
  root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','mfcfgTitle');
  root.innerHTML='<div class="mfcfgFrame"><div class="mfcfgShell">'+
    '<div class="mfcfgTopRail"><b>UGA // CAREER COMMISSION</b><span class="mfcfgSecure">SECURE PROFILE LINK · VERIFIED</span></div>'+
    '<section class="mfcfgGuide" aria-label="KEEL, neutral UGA commissioning guide"><span class="mfcfgKeelSig" aria-hidden="true"><i>K</i></span><div class="mfcfgGuideCopy">'+
      '<small>KEEL · UGA COMMISSIONING GUIDE</small><b>Commissioning link stable.</b><p>I am KEEL, your neutral UGA guide. I do not serve Nova, Dominion, or Syndicate; my role is to commission your choice and transfer command authority to your career.</p></div>'+
      '<span class="mfcfgNeutral"><b>NEUTRAL UGA GUIDANCE</b>NO FACTION AFFILIATION · NOT A SELECTABLE COMMANDER</span></section>'+
    '<div class="mfcfgProgress" aria-label="New career progress"><span class="mfcfgStep done"><b>01</b>WORLD LINK</span><span class="mfcfgStep done"><b>02</b>'+esc(orientation)+'</span><span class="mfcfgStep active"><b>03</b>COMMISSION</span><span class="mfcfgStep"><b>04</b>UGA SPACE</span></div>'+
    '<div class="mfcfgDecision"><div><div class="mfcfgEyebrow">NEW CAREER · COMMAND AUTHORITY REQUIRED</div><h2 id="mfcfgTitle">Choose the force you will lead.</h2><p class="mfcfgLead">Your allegiance defines your fleet doctrine and permanently assigns this career its authentic first roster Commander. Review each command package before commissioning.</p></div><span class="mfcfgRequired">REQUIRED<br>TO CONTINUE</span></div>'+
    '<div class="mfcfgGrid">'+opts.map(function(opt,index){
      var C=opt.commander,A=opt.art||{},portrait=typeof commanderPortraitSrc==='function'?commanderPortraitSrc(C):'';
      var fallback='./assets/factions/'+esc(A.id||opt.runtime)+'_192.jpg',col=A.col||'#66d7ff';
      var crest=typeof facIcon==='function'?facIcon(opt.runtime,48,'mfcfgCrest'):'<span aria-hidden="true">◈</span>';
      var short=A.short||String(opt.id||'').toUpperCase(),number=String(index+1).padStart(2,'0');
      return '<button type="button" class="mfcfgCard" data-faction="'+esc(opt.id)+'" style="--fac:'+esc(col)+';--facSoft:'+colorAlpha(col,.13)+';--facGlow:'+colorAlpha(col,.45)+'">'+
        '<span class="mfcfgCardHead">'+crest+'<span class="mfcfgFac"><small>FACTION '+number+'</small><b>'+esc(opt.name)+'</b></span><span class="mfcfgSelectTag">SELECT</span></span>'+
        '<span class="mfcfgDoctrine">'+esc(A.ds||'Faction command authority')+'<b class="mfcfgMotto">'+esc(A.motto||'COMMAND AUTHORITY')+'</b></span>'+
        '<span class="mfcfgGrant"><span><small>GRANTS THIS FACTION\'S REAL</small><b>COMMANDER 1</b></span><i>IMMEDIATE</i></span>'+
        '<span class="mfcfgCommander"><img src="'+esc(portrait)+'" data-fallback="'+fallback+'" alt="'+esc(C.nm)+', '+esc(opt.name)+' Commander 1" onerror="this.onerror=null;this.src=this.dataset.fallback"><span class="mfcfgCmdCopy"><small>YOUR STARTING COMMANDER</small><b>'+esc(C.nm)+'</b><i>'+esc(C.role)+'</i><p>'+esc(C.passive||'Starter command doctrine')+'</p></span></span>'+
        '<span class="mfcfgChoose"><span><b>COMMISSION '+esc(short)+'</b><small>Assign '+esc(C.nm)+' · enter UGA space</small></span><i aria-hidden="true">›</i></span></button>';
    }).join('')+'</div><p class="mfcfgFoot"><span><b>AUTHORITATIVE CAREER GRANT</b><br>Faction and Commander are read from the main MASSFRONT catalogs and saved to this profile.</span><span>BROOD COMMAND AUTHORITY REMAINS UNAVAILABLE</span></p></div></div>';
  dialog=root;document.body.appendChild(root);document.body.classList.add('mfCareerFactionGateOpen');
  root.querySelectorAll('.mfcfgCard').forEach(function(button){
    var choose=function(e){if(e)e.preventDefault();select(button.dataset.faction);};
    if(typeof mfBindTap==='function')mfBindTap(button,choose);else button.addEventListener('click',choose);
  });
  document.addEventListener('keydown',key,true);
  var first=root.querySelector('button');if(first)setTimeout(function(){try{first.focus({preventScroll:true});}catch(e){first.focus();}},0);
  return true;
}
function state(){
  var G=gateMeta(false),runtime=META&&META.setup&&runtimeFaction(META.setup.pf),C=runtime&&starterFor(runtime);
  return {version:VERSION,profileId:profileId(),armed:!!(G&&G.phase!==PHASE_ELIGIBLE),pending:pending(),
    phase:G&&G.phase||'pass-through',canEnterSpaceCareer:!pending(),
    factionId:runtime?canonicalFaction(runtime):null,runtimeFaction:runtime||null,
    commanderId:META&&META.setup&&META.setup.pc||null,starterCommanderId:C&&C.id||null};
}
function canEnterSpaceCareer(){return !pending();}
function tick(){
  var G=gateMeta(false);
  if(G&&G.phase===PHASE_TRAINING&&trainingComplete()){
    if(setPhase(PHASE_FACTION,'training'))show();
  }else if(G&&G.phase===PHASE_FACTION)show();
}
function wrapExploration(){
  if(typeof mfOpenExploration!=='function'||mfOpenExploration.__mfCareerFactionGate)return;
  baseOpenExploration=mfOpenExploration;
  var wrapped=function(entryView){
    var target=entryView==='system'?'system':'campaign_hub';
    if(target==='system'){
      var armed=arm({source:'integrated-system-entry',returnToSpace:true});
      /* A new career whose workflow marker cannot be saved must not enter a
         second document and lose the required gate. Existing/resolved careers
         still pass through; only the failed new-career transaction falls back
         to the installed War Room through main.js' ordinary false result. */
      if(armed.reason==='save-failed'){
        if(typeof toast==='function')toast('Career setup could not be saved — Galactic entry is paused');
        return Promise.resolve(false);
      }
    }
    else if(pending()){
      var G=gateMeta(false);
      if(G&&G.phase===PHASE_FACTION)show();
      if(typeof toast==='function')toast(G&&G.phase===PHASE_TRAINING?'Complete Training before entering full UGA operations':'Choose a faction before entering full UGA operations');
      return Promise.resolve(false);
    }
    return baseOpenExploration.apply(this,arguments);
  };
  wrapped.__mfCareerFactionGate=true;wrapped.__mfBase=baseOpenExploration;
  mfOpenExploration=wrapped;
}
function init(){
  if(initialized)return;initialized=true;
  wrapExploration();
  /* main.js wires the base opener inside async boot(), while this late takeover
     can finish loading first. Listen for its deterministic readiness handshake
     so the first START click cannot bypass arm(). wrapExploration is idempotent
     and still handles the opposite load order synchronously. */
  window.addEventListener(EXPLORATION_READY_EVENT,wrapExploration);
  window.addEventListener('massfront:onboarding-choice',function(event){afterOnboardingChoice(event&&event.detail);});
  setInterval(tick,350);setTimeout(tick,0);
}

window.MFNewCareerFactionGate=Object.freeze({
  VERSION:VERSION,READY_EVENT:READY_EVENT,arm:arm,state:state,choices:choices,
  afterOnboardingChoice:afterOnboardingChoice,openFromRoute:openFromRoute,
  show:show,select:select,canEnterSpaceCareer:canEnterSpaceCareer,continueToSpace:continueToSpace
});
try{init();}catch(e){if(window.console)console.error('init career faction gate',e);}
})();
