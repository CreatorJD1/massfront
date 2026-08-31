;
;
/* ============================================================================
   FIRST-CAREER ONBOARDING — one choice, two real teaching systems
   ----------------------------------------------------------------------------
   Training already owns the live RTS course (tutorial.js), and the War Table
   Primer owns galaxy -> deployment navigation (warprimer.js). This file does
   not duplicate either system or mark either one complete. It gives a fresh
   career an explicit, skippable choice and exposes durable KEEL hint events so
   later battle/space HUD presenters can render the same authored message.
   ============================================================================ */
(function(){
'use strict';

var ONBOARDING_VERSION=2;
var PRESENTER_EVENT='massfront:keel-hint';
var CHOICE_EVENT='massfront:onboarding-choice';
var presenter=null,choiceNode=null,lastFocus=null,initialized=false,activeOfferOptions=null;

/* This is a career contract, not a cut-scene asset list. The space module
   stages these beats with its existing live system view and story rail, so a
   missing video or portrait can never block a new career. */
var NEW_CAREER_SEQUENCE={
  schema:'massfront.new-career-onboarding.v2',entryView:'live-space',required:true,
  stages:[
    {id:'world-introduction',surface:'space-story-rail',scene:'deep-space',
      title:'THE FRACTURED FRONTIER',text:'Humanity crossed the relay network and found a frontier already at war.'},
    {id:'planet-approach',surface:'space-story-rail',scene:'planet-approach',
      title:'APPROACHING AELOS',text:'UGA traffic control has cleared one protected landing corridor for your first field operation.'},
    {id:'orientation-choice',surface:'space-story-rail',scene:'aelos-orbit',
      title:'YOUR FIRST COMMAND DECISION',text:'Take the short planetary basics course, or skip directly to required faction commissioning.'},
    {id:'protected-training',optional:true,surface:'battle-minimap',next:'faction-commissioning'},
    {id:'faction-commissioning',required:true,next:'starter-commander-1'},
    {id:'starter-commander-1',required:true,next:'full-uga-space'},
    {id:'full-uga-space',required:true}
  ],
  invariants:{mainMenuPreserved:true,trainingOptional:true,factionRequired:true,
    commanderGrant:'selected-faction-commander-1',keelAffiliation:'uga',
    keelSelectable:false,battleTransmissionSurface:'battle-minimap',
    spaceTransmissionSurface:'space-story-rail'}
};

/* Routing is declarative here. The Galactic integration owns the actual space
   entry and career transitions; callers receive these outcomes through the
   choice event/callback and route them on their own surface. */
var FLOWS={
  'default':{
    entryView:'front-command',trainingOutcome:'protected-planetary-training',skipOutcome:'front-command',
    title:'FIELD BASICS BEFORE DEPLOYMENT?',
    lead:'KEEL can guide one protected planetary drop, or you can continue to the current MASSFRONT command menu. This choice never replaces the main menu.',
    trainingTitle:'10-MINUTE PLANETARY BASICS',
    trainingText:'Learn camera control, deployment, Commander selection, economy, construction, production, army selection and orders in a protected mission.',
    skipTitle:'STRATEGIC NAVIGATION',
    skipText:'The War Table Primer teaches galaxy, system, planet, region and deployment when you enter Standard.',
    trainingLabel:'BEGIN PLANETARY BASICS',skipLabel:'KEEP CURRENT MAIN MENU',
    foot:'The tutorial remains replayable from the War Room, Settings, and UGA Command.'
  },
  'experimental-space':{
    entryView:'live-space',trainingOutcome:'protected-planetary-training',skipOutcome:'required-faction-selection',
    title:'CHOOSE YOUR FIRST PLANETARY DROP',
    lead:'Aelos is below. KEEL can run a short protected RTS orientation, or an experienced player can continue directly to commissioning.',
    trainingTitle:'BASIC ORIENTATION · RECOMMENDED',
    trainingText:'Ten essential objectives: camera, landing, Commander, mass, power, Factory, production, army selection, orders and extraction.',
    skipTitle:'COMMISSION IMMEDIATELY',
    skipText:'Skip the mission, then choose a faction and receive that faction\'s real Commander 1. Faction selection is still required.',
    trainingLabel:'LAND FOR BASIC TRAINING',skipLabel:'SKIP TRAINING · COMMISSION',
    foot:'Both paths converge on required faction selection and Commander 1 before full UGA-space access.'
  }
};

/* These ids match tutorial.js's new-career BASIC course. The longer field
   certification remains replayable, but it is not allowed to turn a first
   launch into a twenty-one-objective campaign. Progress remains a high-water
   mark; this layer never awards or advances a lesson. */
var RTS_STEPS=[
  ['camera','Camera'],['deploy','Landing'],['commander','Commander'],['mex','Mass economy'],
  ['power','Power grid'],['fac','Factory'],['queue','Production'],['train','Army selection'],
  ['orders','Basic orders'],['objective','Extraction']
];
var NAV_STEPS=[
  ['galaxy','Galaxy'],['system','System'],['planet','Planet'],['region','Region'],['deploy','Deployment plan']
];

/* Contexts are stable integration points. UGA can call presentContext() from a
   space surface; battle HUD code can use the battle-* contexts. Text names
   controls and rules that exist today — no placeholder missions or rewards. */
var HINTS={
  'menu-command':{
    context:'menu',surface:'front-end',durationMs:5600,priority:30,animationId:'keel-link',
    text:'Training is a protected live-fire orientation. Standard continues through the strategic deployment route.'
  },
  'war-table-route':{
    context:'war-table',surface:'front-end',durationMs:6000,priority:35,animationId:'keel-route',
    text:'Follow the active route: galaxy, system, planet, region, then deployment. Locked destinations remain on the current stage.'
  },
  'uga-command':{
    context:'uga-command',surface:'space-story-rail',durationMs:6200,priority:45,animationId:'keel-space-link',
    text:'UGA Command can route you to the protected Training Operation or a live deployment. Training progress remains with this profile.'
  },
  'uga-training':{
    context:'uga-training',surface:'space-story-rail',durationMs:5800,priority:50,animationId:'keel-space-link',
    text:'Training bypasses strategic deployment and starts a fixed protected operation under KEEL guidance.'
  },
  'space-first-choice':{
    context:'space-intro',surface:'space-story-rail',durationMs:6000,priority:70,animationId:'keel-space-link',
    text:'Live-space link stable. Deploy to protected planetary training, or continue directly to required faction commissioning.'
  },
  'battle-camera':{
    context:'battle-camera',surface:'battle-minimap',durationMs:5200,priority:50,animationId:'keel-tactical-link',
    text:'Drag to pan, pinch to zoom, and open VIEW for rotation and tilt.'
  },
  'battle-economy':{
    context:'battle-economy',surface:'battle-minimap',durationMs:6000,priority:55,animationId:'keel-tactical-link',
    text:'Build an Extractor on a mass deposit, then add Reactor power before expanding production.'
  },
  'battle-production':{
    context:'battle-production',surface:'battle-minimap',durationMs:5900,priority:55,animationId:'keel-tactical-link',
    text:'Select a Factory, queue units, then open ARMY to select the force you produced.'
  },
  'battle-orders':{
    context:'battle-orders',surface:'battle-minimap',durationMs:6200,priority:60,animationId:'keel-tactical-link',
    text:'Select combat units. Single-tap ground issues attack-move; double-tap breaks contact and retreats.'
  },
  'battle-intel':{
    context:'battle-intel',surface:'battle-minimap',durationMs:5800,priority:60,animationId:'keel-tactical-link',
    text:'Long-press suspected enemy ground to mark intel, then scout beyond friendly vision to confirm the contact.'
  }
};

function stamp(){ return Date.now(); }
function save(){
  if(typeof metaSave!=='function') return false;
  try{ return metaSave()!==false; }catch(e){ return false; }
}
function onboardingMeta(){
  if(typeof META==='undefined'||!META) return {version:ONBOARDING_VERSION,choice:'',hints:{}};
  var M=META.onboarding;
  if(!M||typeof M!=='object'||Array.isArray(M)) M=META.onboarding={};
  if(typeof M.version!=='number') M.version=0;
  if(M.choice!=='training'&&M.choice!=='skipped') M.choice='';
  if(!M.hints||typeof M.hints!=='object'||Array.isArray(M.hints)) M.hints={};
  return M;
}
function hintMeta(id){
  var M=onboardingMeta(),H=M.hints[id];
  if(!H||typeof H!=='object'||Array.isArray(H)) H=M.hints[id]={};
  return H;
}
function tutorialMeta(){
  return typeof META!=='undefined'&&META&&META.tutorial&&typeof META.tutorial==='object'?META.tutorial:{};
}
function primerMeta(){
  return typeof META!=='undefined'&&META&&META.warPrimer&&typeof META.warPrimer==='object'?META.warPrimer:{};
}
function trainingState(){
  try{ if(typeof window.trainingUiState==='function') return window.trainingUiState()||{}; }catch(e){}
  return {};
}
function cloneMap(src){
  if(Array.isArray(src)) return src.map(cloneMap);
  if(!src||typeof src!=='object') return src;
  var out={},k;
  for(k in src) if(Object.prototype.hasOwnProperty.call(src,k)){
    var v=src[k];
    out[k]=cloneMap(v);
  }
  return out;
}

/* Public progress is derived from the two authoritative systems. "Complete"
   therefore always means the real saved lesson/stage says so. */
function skills(){
  var T=tutorialMeta(),P=primerMeta(),TS=trainingState();
  var tDone=!!(T.basicDone||T.done||TS.done),active=!!TS.active,seen=P.seen||{},navDone=!!P.done;
  var stored=typeof T.basicProgress==='number'?T.basicProgress:(T.done?RTS_STEPS.length:T.progress|0);
  var progress=Math.max(0,Math.min(RTS_STEPS.length,TS.course==='basic'&&active?TS.progress|0:stored));
  var nav=NAV_STEPS.map(function(S){
    return {id:S[0],label:S[1],state:(navDone||!!seen[S[0]])?'complete':'pending'};
  });
  var rts=RTS_STEPS.map(function(S,i){
    var state=tDone||i<progress?'complete':active&&i===progress?'current':T.skipped?'deferred':'pending';
    return {id:S[0],label:S[1],state:state};
  });
  var navSeen=nav.filter(function(S){return S.state==='complete';}).length;
  var rtsSeen=rts.filter(function(S){return S.state==='complete';}).length;
  return [
    {id:'strategic-navigation',label:'Strategic navigation',source:'War Table Primer',
      status:navDone?'complete':navSeen?'in-progress':'pending',complete:navSeen,total:nav.length,steps:nav},
    {id:'rts-foundations',label:'RTS field skills',source:'KEEL Training Operation',
      status:tDone?'complete':active?'in-progress':T.skipped?'deferred':rtsSeen?'in-progress':'pending',
      complete:rtsSeen,total:rts.length,steps:rts}
  ];
}

function eligible(){
  if(typeof META==='undefined'||!META) return false;
  var M=onboardingMeta(),T=tutorialMeta();
  if(M.choice) return false;
  if(((META.matches|0)+(META.standardMatches|0))>0) return false;
  if(T.done||T.basicDone||T.skipped||T.basicSkipped||(T.progress|0)>0||(T.basicProgress|0)>0) return false;
  if(trainingState().active) return false;
  return true;
}
function experimentalEnabled(){
  return !!(typeof META!=='undefined'&&META&&META.settings&&META.settings.experimentalExploration);
}
function automaticEligible(){
  /* Experimental new careers make their choice after live space appears. A
     base-menu modal would reverse that sequence and cover the world intro. */
  return eligible()&&!experimentalEnabled();
}
function flowDef(id){ return FLOWS[id]||FLOWS['default']; }
function careerSequence(){ return cloneMap(NEW_CAREER_SEQUENCE); }
function phase(){
  try{
    var gate=window.MFNewCareerFactionGate;
    var G=gate&&typeof gate.state==='function'?gate.state():null;
    if(G&&G.phase==='ready') return 'ready';
    if(G&&G.phase==='faction-selection') return 'faction-commissioning';
    if(G&&G.phase==='training') return 'protected-training';
  }catch(e){}
  var M=onboardingMeta(),T=tutorialMeta(),TS=trainingState();
  if(!M.choice) return experimentalEnabled()?'world-introduction':'orientation-choice';
  if(M.choice==='skipped') return M.flowId==='experimental-space'?'faction-commissioning':'front-command';
  if(T.basicDone||T.done||TS.done) return M.flowId==='experimental-space'?'faction-commissioning':'front-command';
  return 'protected-training';
}
function choiceContract(id){
  id=FLOWS[id]?id:'default';
  var F=flowDef(id);
  return {schema:'massfront.onboarding-flow.v2',flowId:id,entryView:F.entryView,
    choiceContext:id==='experimental-space'?'space-intro':'front-command',
    speaker:'KEEL',speakerId:'keel',affiliation:'uga',speakerRole:'UGA EXPEDITION GUIDE',
    channel:'UGA PERSONNEL LINK',voiceId:'keen',profileId:'uga-keel-expedition-guide',
    animationId:id==='experimental-space'?'keel-space-link':'keel-link',
    title:F.title,text:F.lead,careerSequence:careerSequence(),
    continuation:id==='experimental-space'?{
      schema:'massfront.new-career-continuation.v1',required:true,
      afterTraining:'faction-commissioning',afterSkip:'faction-commissioning',
      afterFaction:'starter-commander-1',afterCommander:'full-uga-space'
    }:null,
    actions:[
      {choice:'training',label:F.trainingLabel,outcome:F.trainingOutcome,nextStep:'protected-planetary-training'},
      {choice:'skipped',label:F.skipLabel,outcome:F.skipOutcome,
        nextStep:id==='experimental-space'?'faction-commissioning':'front-command'}
    ]};
}
function state(){
  var M=onboardingMeta();
  return {version:ONBOARDING_VERSION,choice:M.choice||'',flowId:M.flowId||'',outcome:M.outcome||'',
    eligible:eligible(),automaticEligible:automaticEligible(),awaitingSpaceChoice:eligible()&&experimentalEnabled(),
    phase:phase(),trainingOptional:true,factionCommissioningRequired:experimentalEnabled(),
    offeredAt:M.offeredAt||0,decidedAt:M.decidedAt||0,offerCount:M.offerCount|0,
    careerSequence:careerSequence(),hints:cloneMap(M.hints||{}),skills:skills()};
}

function shown(el){
  if(!el) return false;
  try{ var s=getComputedStyle(el); return s.display!=='none'&&s.visibility!=='hidden'; }
  catch(e){ return !el.hidden; }
}
function menuReady(){
  if(typeof document==='undefined'||!document.body) return false;
  if(typeof bootConfirmed!=='undefined'&&!bootConfirmed) return false;
  if(typeof running!=='undefined'&&running) return false;
  if(document.body.classList.contains('mfIntroOpen')||document.body.classList.contains('trainingOperation')) return false;
  try{ if(/(?:^|[?&])galacticRoute=/.test(String(location.search||''))) return false; }catch(e){}
  var front=document.getElementById('startScreen');
  if(!shown(front)||front.getAttribute('aria-hidden')==='true') return false;
  var blockers=['mfPreAlphaIntro','apOverlay','apConfirmOverlay','accDlg','loadScr'];
  for(var i=0;i<blockers.length;i++){
    var b=document.getElementById(blockers[i]);
    if(b&&shown(b)&&!b.hidden&&b.getAttribute('aria-hidden')!=='true') return false;
  }
  return true;
}

function signal(type,detail,cancelable){
  if(typeof window==='undefined'||typeof window.dispatchEvent!=='function') return true;
  try{
    var ev;
    if(typeof CustomEvent==='function') ev=new CustomEvent(type,{detail:detail,cancelable:!!cancelable});
    else if(document&&document.createEvent){ ev=document.createEvent('CustomEvent');ev.initCustomEvent(type,false,!!cancelable,detail); }
    if(!ev) return true;
    var accepted=window.dispatchEvent(ev);
    if(accepted===false) detail.handled=true;
    return accepted;
  }catch(e){ return true; }
}
function payloadFor(id,def,opt){
  opt=opt||{};
  return {
    schema:'massfront.keel-hint.v1',hintId:id,context:opt.context||def.context,
    /* Surface is authored by context and cannot be redirected by callers.
       In battle KEEL takes the minimap receiver; in normal space she takes the
       existing story rail. This prevents a malformed hint from creating a
       third talking-head panel over either game surface. */
    surface:def.surface,speaker:'KEEL',speakerId:'keel',affiliation:'uga',
    speakerRole:'UGA EXPEDITION GUIDE',channel:'UGA PERSONNEL LINK',
    /* KEEL is UGA personnel. Do not let a caller skin the shared presenter as
       a selectable-faction voice or commander profile. */
    voiceId:'keen',profileId:'uga-keel-expedition-guide',
    animationId:opt.animationId||def.animationId||'keel-link',
    text:String(opt.text||def.text),durationMs:Math.max(1000,Math.min(12000,opt.durationMs||def.durationMs||5000)),
    priority:Math.max(0,opt.priority==null?def.priority||50:opt.priority|0),
    issuedAt:stamp(),handled:false
  };
}
function battleSurfaceActive(){
  if(typeof running==='undefined'||!running) return false;
  if(typeof matchLive==='undefined'||!matchLive) return false;
  if(typeof gameEnded!=='undefined'&&gameEnded) return false;
  try{
    var b=document&&document.body;
    if(b&&b.classList&&(b.classList.contains('mfMenuOpen')||b.classList.contains('menuMode')))return false;
  }catch(e){}
  return true;
}
function deliver(P){
  if(typeof presenter==='function'){
    try{ if(presenter(P)===true) P.handled=true; }
    catch(e){ if(window.console) console.error('MFOnboarding presenter',e); }
  }
  signal(PRESENTER_EVENT,P,true);
  return !!P.handled;
}
function retryBattle(P,attempt){
  if(P.handled||attempt>=24||!battleSurfaceActive()){
    if(!P.handled)P.presenter='battle-minimap-timeout';
    return;
  }
  setTimeout(function(){
    if(P.handled||!battleSurfaceActive())return;
    P.issuedAt=stamp();
    if(!deliver(P))retryBattle(P,attempt+1);
  },180);
}
function fallbackPresent(P){
  try{
    var D=typeof window.__tutDebug==='function'?window.__tutDebug():null;
    if(D&&typeof D.speak==='function'){
      D.speak(P.text,P.durationMs/1000,'onboarding',P.hintId);
      P.handled=true;P.presenter='keel-bubble';return;
    }
  }catch(e){}
  if(typeof toast==='function'){
    try{ toast('KEEL: '+P.text);P.handled=true;P.presenter='toast'; }catch(e2){}
  }
}
function present(id,opt){
  opt=opt||{};
  var def=HINTS[id];
  if(!def) return null;
  var H=hintMeta(id);
  if(!opt.force&&(H.completed||H.dismissed||(def.once!==false&&H.seen))) return null;
  var P=payloadFor(id,def,opt);
  if(opt.persist!==false){
    H.seen=true;H.count=(H.count|0)+1;H.lastAt=P.issuedAt;save();
  }
  deliver(P);
  if(!P.handled&&P.surface==='battle-minimap'&&battleSurfaceActive()){
    P.presenter='battle-minimap-pending';retryBattle(P,0);
  } else if(!P.handled) fallbackPresent(P);
  return P;
}
function presentContext(context,opt){
  var ids=Object.keys(HINTS).filter(function(id){return HINTS[id].context===context;});
  ids.sort(function(a,b){return (HINTS[b].priority|0)-(HINTS[a].priority|0);});
  for(var i=0;i<ids.length;i++){
    var out=present(ids[i],opt);
    if(out) return out;
  }
  return null;
}
function completeHint(id){
  if(!HINTS[id]) return false;
  var H=hintMeta(id);H.completed=true;H.dismissed=false;H.completedAt=stamp();save();return true;
}
function dismissHint(id){
  if(!HINTS[id]) return false;
  var H=hintMeta(id);H.dismissed=true;H.dismissedAt=stamp();save();return true;
}
function setPresenter(fn){
  presenter=typeof fn==='function'?fn:null;
  return function(){ if(presenter===fn) presenter=null; };
}

/* Onboarding is product UI, so its design belongs in the shipped stylesheet
   rather than a late inline block that wins the cascade and cannot be reviewed
   alongside the rest of the HUD. */
function ensureStyle(){}
function bindTap(el,fn){
  if(typeof mfBindTap==='function') mfBindTap(el,fn); else el.addEventListener('click',fn);
}
function onChoiceKey(ev){
  if(!choiceNode) return;
  /* Skip is a career decision, not a dialog dismissal. Escape cannot silently
     turn into a persisted skip; players choose one of the two explicit 52px
     actions. */
  if(ev.key==='Escape'){ ev.preventDefault();return; }
  if(ev.key!=='Tab') return;
  var list=Array.prototype.slice.call(choiceNode.querySelectorAll('button:not([disabled])'));
  if(!list.length) return;
  var first=list[0],last=list[list.length-1];
  if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
  else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
}
function closeChoice(restore){
  if(!choiceNode) return;
  document.removeEventListener('keydown',onChoiceKey,true);
  if(choiceNode.contains(document.activeElement)&&document.activeElement.blur) document.activeElement.blur();
  var old=choiceNode;choiceNode=null;
  if(old.parentNode) old.parentNode.removeChild(old);
  document.body.classList.remove('mfOnboardingOpen');
  if(restore&&lastFocus&&lastFocus.focus){ try{lastFocus.focus({preventScroll:true});}catch(e){lastFocus.focus();} }
  lastFocus=null;activeOfferOptions=null;
}
function decisionOptions(opt){
  var out={},src=activeOfferOptions||{},k;
  for(k in src) if(Object.prototype.hasOwnProperty.call(src,k)) out[k]=src[k];
  src=opt||{};
  for(k in src) if(Object.prototype.hasOwnProperty.call(src,k)) out[k]=src[k];
  out.flowId=FLOWS[out.flowId]?out.flowId:'default';
  return out;
}
function markChoice(value,opt){
  if((value!=='training'&&value!=='skipped')||(!opt.force&&!eligible())) return null;
  if(opt.flowId==='experimental-space'&&!experimentalEnabled()&&!opt.force) return null;
  if(opt.flowId==='default'&&experimentalEnabled()&&!opt.force) return null;
  var F=flowDef(opt.flowId),outcome=value==='training'?F.trainingOutcome:F.skipOutcome;
  var M=onboardingMeta(),before=cloneMap(M);
  M.version=ONBOARDING_VERSION;M.choice=value;M.flowId=opt.flowId;
  M.outcome=outcome;M.decidedAt=stamp();
  /* A cross-document training/faction handoff must never be emitted if the
     local decision was not durably saved. Revert the whole onboarding record
     on failure so a reload cannot observe half of a career transition. */
  if(!save()){
    if(typeof META!=='undefined'&&META)META.onboarding=before;
    if(typeof toast==='function')try{toast('Career choice could not be saved — try again');}catch(e){}
    return null;
  }
  var detail={schema:'massfront.onboarding-choice.v2',flowId:opt.flowId,entryView:F.entryView,
    choice:value,outcome:outcome,decidedAt:M.decidedAt,
    nextStep:value==='training'?'protected-planetary-training':
      (opt.flowId==='experimental-space'?'faction-commissioning':'front-command'),
    continuation:opt.flowId==='experimental-space'?{
      required:true,trainingOptional:true,factionRequired:true,
      commanderGrant:'selected-faction-commander-1',finalStep:'full-uga-space'
    }:null};
  signal(CHOICE_EVENT,detail,false);
  return detail;
}
function chooseTraining(opt){
  var cfg=decisionOptions(opt);
  if(typeof cfg.onTraining!=='function'&&cfg.launchTraining!==false&&typeof window.resumeTrainingMission!=='function'){
    if(typeof toast==='function') toast('Training is still loading — try again in a moment');
    return false;
  }
  var detail=markChoice('training',cfg);if(!detail)return false;closeChoice(false);
  var launch=function(){
    try{
      if(typeof cfg.onTraining==='function') cfg.onTraining(detail);
      else if(cfg.launchTraining!==false) window.resumeTrainingMission();
    }catch(e){if(window.console)console.error('Training launch',e);}
  };
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(launch);else setTimeout(launch,0);
  return true;
}
function skip(opt){
  var cfg=decisionOptions(opt),detail=markChoice('skipped',cfg);if(!detail)return false;closeChoice(true);
  if(typeof cfg.onSkip==='function'){
    try{cfg.onSkip(detail);}catch(e){if(window.console)console.error('Onboarding skip route',e);}
  }
  /* Skipping the prompt is not tutorial completion. Leave the real Training
     card available, then give one concise menu orientation through the same
     presenter contract future HUDs will consume. */
  if(cfg.flowId==='default')setTimeout(function(){
    /* A delayed menu hint used to survive a fast Training launch and then
       appear over the battlefield. Re-check the surface at delivery time. */
    if((typeof running==='undefined'||!running)&&menuReady()) present('menu-command');
  },120);
  return true;
}
function decide(choice,opt){
  return choice==='training'?chooseTraining(opt):choice==='skipped'?skip(opt):false;
}
function offer(opt){
  opt=opt||{};
  if(choiceNode) return true;
  if(!opt.force&&(!eligible()||!menuReady())) return false;
  if(typeof document==='undefined'||!document.body) return false;
  var flowId=FLOWS[opt.flowId]?opt.flowId:'default',F=flowDef(flowId);
  activeOfferOptions=decisionOptions(opt);activeOfferOptions.flowId=flowId;
  ensureStyle();lastFocus=document.activeElement;
  var d=document.createElement('section');d.id='mfOnboardingChoice';d.setAttribute('role','dialog');
  d.dataset.flow=flowId;d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','mfOnboardingTitle');
  d.innerHTML='<div class="mfOnboardingFrame"><div class="mfOnboardingScene" aria-hidden="true">'+
      '<span class="mfOnboardingPlanet"></span><span class="mfOnboardingMoon"></span><span class="mfOnboardingVector"></span>'+ 
      '<b>AELOS // PROTECTED CORRIDOR</b><i>UGA APPROACH VECTOR 07</i></div>'+ 
    '<div class="mfOnboardingCard"><header class="mfOnboardingHeader"><span class="mfOnboardingKeel" aria-hidden="true">K</span><span><b>KEEL</b><small>UGA EXPEDITION GUIDE · NEUTRAL PERSONNEL</small></span></header>'+ 
    '<div class="mfOnboardingPath" aria-label="New career sequence"><span class="done"><b>01</b>SPACE ARRIVAL</span><span class="on"><b>02</b>ORIENTATION</span><span><b>03</b>FACTION</span><span><b>04</b>COMMANDER 1</span></div>'+ 
    '<main><div class="mfOnboardingEyebrow">NEW CAREER · PLANETARY APPROACH</div>'+ 
    '<h2 id="mfOnboardingTitle">'+F.title+'</h2><p class="mfOnboardingLead">'+F.lead+'</p>'+ 
    '<div class="mfOnboardingTracks"><section class="mfOnboardingTrack recommended"><small>RECOMMENDED</small><b>'+F.trainingTitle+'</b><span>'+F.trainingText+'</span></section>'+ 
    '<section class="mfOnboardingTrack"><small>EXPERIENCED RTS PLAYERS</small><b>'+F.skipTitle+'</b><span>'+F.skipText+'</span></section></div>'+ 
    '<div class="mfOnboardingSteps" aria-label="Basic RTS tutorial objectives"><span>CAMERA</span><span>LAND</span><span>COMMANDER</span><span>MASS</span><span>POWER</span><span>BUILD</span><span>PRODUCE</span><span>SELECT</span><span>ORDER</span><span>EXTRACT</span></div>'+ 
    '<div class="mfOnboardingActions"><button id="mfOnboardingBegin" type="button"><small>OPTION 01</small>'+F.trainingLabel+'</button><button id="mfOnboardingSkip" class="quiet" type="button"><small>OPTION 02</small>'+F.skipLabel+'</button></div>'+ 
    '<p class="mfOnboardingFoot">'+F.foot+'</p></main></div></div>';
  choiceNode=d;document.body.appendChild(d);document.body.classList.add('mfOnboardingOpen');
  bindTap(document.getElementById('mfOnboardingBegin'),chooseTraining);
  bindTap(document.getElementById('mfOnboardingSkip'),skip);
  document.addEventListener('keydown',onChoiceKey,true);
  var M=onboardingMeta(),before=cloneMap(M);M.offeredAt=stamp();M.offerCount=(M.offerCount|0)+1;
  if(!save()){
    if(typeof META!=='undefined'&&META)META.onboarding=before;
    closeChoice(false);if(typeof toast==='function')try{toast('Career setup is unavailable until saving recovers');}catch(e){}
    return false;
  }
  var focus=function(){var b=document.getElementById('mfOnboardingBegin');if(b)try{b.focus({preventScroll:true});}catch(e){b.focus();}};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(focus);else setTimeout(focus,0);
  return true;
}

function definitions(){
  return Object.keys(HINTS).map(function(id){var d=cloneMap(HINTS[id]);d.id=id;return d;});
}
function init(){
  if(initialized) return;initialized=true;
  var poll=function(){ try{
    /* The account/offline gate can open a frame after the menu first becomes
       eligible. If that happens while this choice is already mounted, yield
       the modal layer and offer again after the blocking surface closes. */
    if(choiceNode&&!menuReady()){closeChoice(false);return;}
    if(automaticEligible()&&menuReady()) offer();
  }catch(e){if(window.console)console.error('MFOnboarding',e);} };
  setInterval(poll,450);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',poll,{once:true});
  else setTimeout(poll,0);
}

window.MFOnboarding={
  VERSION:ONBOARDING_VERSION,PRESENTER_EVENT:PRESENTER_EVENT,CHOICE_EVENT:CHOICE_EVENT,
  state:state,skills:skills,eligible:eligible,automaticEligible:automaticEligible,
  sequence:choiceContract,choiceContract:choiceContract,careerSequence:careerSequence,offer:offer,decide:decide,
  chooseTraining:chooseTraining,skip:skip,
  definitions:definitions,present:present,presentContext:presentContext,
  completeHint:completeHint,dismissHint:dismissHint,setPresenter:setPresenter
};
try{init();}catch(e){if(window.console)console.error('init onboarding',e);}
})();
