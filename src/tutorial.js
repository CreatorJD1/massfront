;
;
/* ============================================================================
   TUTORIAL — KEEL, ship liaison intelligence, Lance of Morning
   ----------------------------------------------------------------------------
   Two jobs live in this file:

     1. A first-drop tutorial, narrated in character rather than read off a
        card. Every step is gated on the SAME state the rest of the game
        already tracks — bldLive, unit arrays, ability cooldowns, kill counts
        — polled from a private setInterval. Nothing here edits the frame
        loop, and nothing here can desync from what actually happened: if the
        player builds a Factory before a Reactor, or wins a fight before they
        ever open the build menu, the step order just adapts around them
        instead of stalling on a script it expected.

     2. A small set of reactive barks that outlive the tutorial — first base
        attack, first loss, a hazard telegraph, a wave massing, the grid
        running dry. Each fires at most once per match. The mechanical coach
        in hud.js already tells you WHAT to fix; KEEL never repeats that,
        it only ever reacts to what it means.

   KEEL is written the way the dispatches are written: short, declarative,
   never a pep talk. It respects that the player can read a build menu; it
   just narrates the war while they do.

   File ownership: this module speaks to the rest of the game entirely
   through globals that already exist (toast, sfx, $, META, metaSave,
   bldLive, TYPES, BT, the unit arrays) and extends exactly one function it
   does not own — renderSettings() — using the same wrap-and-call-through
   pattern src/game/commander.js and src/game/meta.js already use on
   econTick() and heroXP(). Nothing here is imported; it is one more script
   in the shared boot scope, loaded after meta.js and before main.js.
   ============================================================================ */
(function(){

/* ---------------------------------------------------------------------------
   THE SCRIPT
   Every line KEEL says lives here, in one place, so the voice stays one
   voice. Step copy is fixed (a lesson should say the same thing every time);
   reactive lines get two or three variants because a player who finishes a
   dozen matches will hear the same trigger a dozen times.
   --------------------------------------------------------------------------- */
var KEEL_NAME='KEEL';
var KEEL_TAG='SHIP LIAISON · LANCE OF MORNING';
var GUIDE_VERSION=4;

var GREETING='KEEL online — ship liaison, Lance of Morning. Follow the gold signal: it marks the exact control for your next action. '+
             'Tap SKIP any time; replay this guide from Settings.';

var SKIP_LINE='Understood. Find me again under Settings → Tutorial if you change your mind.';

var GRADUATION='Field orientation complete. Camera, economy, orders, logistics, formations, scouting, technology and extraction are certified. '+
               'Real operations are chosen at the WAR TABLE: system, planet, region, then a site. '+
               "I'll go quiet now — unless something's on fire.";

/* Each step tests REAL state. `say` is shown the moment a step becomes
   current; `done` fires once, the moment its test flips true — but only if
   it was the step on screen when that happened, so a player who does things
   out of order gets fast-forwarded in silence instead of congratulated for
   a step they finished five minutes ago. */
var STEPS=[
 { id:'camera', icon:'◇',
   say:'DRAG the battlefield to pan. PINCH to zoom and twist, or use VIEW → ROT / TILT. Move the camera once to confirm control.',
   done:'Command view responding. The minimap can jump across the whole battlefield.',
   test:function(){ return MATCH.sawCamera; } },

 { id:'deploy', icon:'⚓',
   say:'Tap open ground to fly the carrier there. When the landing signal turns green, tap DEPLOY BASE HERE.',
   done:"Hull's down, engines cold. That was the easy part.",
   test:function(){ return typeof matchLive!=='undefined' && !!matchLive; } },

  { id:'commander', icon:'★',
    say:'Your COMMANDER is the marked hero and a mobile builder. Tap the Commander bar at top-left to select and center it.',
   done:'Commander identified. Keep it alive: losing every Commander loses the match.',
   test:function(){ return typeof heroIdx==='number'&&heroIdx>=0&&!!usel[heroIdx]; } },

 { id:'pickup', icon:'◆',
   say:'A gold SUPPLY CACHE is marked nearby. Select the Commander or Constructor, then tap beside the cache so the unit collects it.',
   done:'Cache secured. Pickups can grant resources, repairs, scans, veterancy or rare strike codes.',
   test:function(){ return MATCH.sawPickup; } },

 /* Moved ahead of the economy steps. `power` tells the player to place a
    Reactor "inside the blue grid" — and the step that explains what the blue
    grid is used to sit three objectives further down. */
 { id:'territory', icon:'⌁', manual:'territoryAck', action:'GOT IT',
   say:'LOGISTICS: blue grid is legal build territory. Builders extend a mobile zone; Factories and Uplinks anchor it. Silos prevent resource overflow. Tap GOT IT.',
   done:'Logistics and territory rules logged.',
   test:function(){ return MATCH.territoryAck; } },

 { id:'mex', icon:'⛏',
   say:'Mass buys units and structures. Tap BUILD → ECONOMY → Extractor, drag its hologram onto a ◆ deposit, then tap ✓.',
   done:"Extractor placed. That's your first income line.",
   test:function(){ return hasPlayerBld('mex'); } },

 { id:'power', icon:'⚡',
   say:'Production also needs energy. Tap BUILD → ECONOMY → Reactor, place it on open ground inside the blue grid, then tap ✓.',
   done:'Reactor placed. Mass and energy must both stay positive while building.',
   test:function(){ return hasPlayerBld('pgen')||hasPlayerBld('geo'); } },

 { id:'fac', icon:'▣',
   say:"Build a Factory under BUILD → PRODUCTION. It is this army's barracks and vehicle plant, and expands construction territory.",
   done:'Factory placed. Open it to train the first field unit.',
   test:function(){ return hasPlayerBld('fac'); } },

 { id:'queue', icon:'▤',
   say:'Tap the Factory on the map, then tap the Striker unit card. The queue line shows what is being built. Each unit also costs population — the HUD counter reads pop n/500, shared by your combat faction.',
   done:'Striker queued. Production burns mass and energy over the build time. Pop n/500 is live faction headcount — adding commanders does not multiply the cap.',
   test:function(){ return MATCH.sawQueue; } },

 { id:'train', icon:'⚔',
   say:'Keep the Factory supplied until the Striker rolls out. Tap ARMY when it appears to select every field unit.',
   done:'Combat unit trained and selected. Unit cards show role, range, armor and ammunition.',
   test:function(){ return MATCH.sawCombatSel&&combatCount()>MATCH.startCombat; } },

 /* ORDERS ARE A GESTURE LANGUAGE AND NOTHING ON THE HUD SAYS SO.
    Ground tap, enemy tap and double-tap ground write three different unit
    states in orderMove()/orderAttack() (src/ui/input.js). Two of them a
    player discovers by accident within a minute; the double-tap retreat is
    the one nobody finds, and it is the one that saves an army — which is
    why this step gates on the retreat specifically rather than on any
    order at all. */
 { id:'orders', icon:'➤',
   say:'Orders are gestures. SINGLE-TAP GROUND is attack-move: units advance and fight what they meet. TAP AN ENEMY and they chase it. DOUBLE-TAP OPEN GROUND to RETREAT: they drop the target and reposition without stopping to fight. Break contact once now.',
   done:'Retreat confirmed — double-tap is how an army leaves a fight it is losing. Single-tap remains attack-move. Stop in the command row and Hold under ORDERS both plant units where they stand: they fire at whatever enters weapon range and never chase it out. Stop is the panic button, Hold is the same order given on purpose.',
   test:function(){ return MATCH.sawRetreat; } },

 /* THE ONE STEP THAT TEACHES THE GAME RATHER THAN THE BUTTONS.
    Every other objective here is "tap X to make Y happen", and the training
    match is deliberately combat-free — trainingSafety() parks the wave timers
    and floors resources — so a player can complete all of it without ever
    making a wrong-weapon decision. Meanwhile the counter card already renders
    the whole 0.45x-1.85x chip grid, splash, minimum range and shield-pierce
    prose, and it opens on a 520 ms long-press that nothing ever asks for.
    This step exists to make the player perform that gesture once. */
 { id:'intel', icon:'⬢',
   say:'Long-press any unit — yours or the enemy\'s — to open its counter card. Weapon class against armour class swings damage from 0.45x to 1.85x: KINETIC shreds LIGHT and dents HEAVY, GAUSS is the exact reverse.',
   done:'Counter card read. The wrong weapon against the wrong plate is a quarter of the damage you thought you had — and SONIC is the only thing in the roster that ignores Bulwark shields.',
   test:function(){ return shown(document.getElementById('unitCard')); } },

 { id:'turret', icon:'⛨',
   say:'Protect the economy before the first push. Tap BUILD → DEFENCE → Sentinel and place it on the likely approach.',
   done:'Basic perimeter online. Towers buy your army time; they do not replace it. Long-ranged guns — Bastions, Thumpers, Bombards — also have a MIN RANGE, and an enemy inside it is an enemy they cannot shoot.',
   test:function(){ return hasPlayerBld('turret'); } },

 { id:'platoon', icon:'Ⅳ',
   say:'With combat units selected, open PLATOONS and HOLD P1 to save them. Tap P1 later to recall; double-tap focuses the camera.',
   done:'Platoon P1 stored. Saved groups remember membership and formation.',
   test:function(){ return MATCH.sawPlatoon; } },

 { id:'formation', icon:'⌃',
   say:'Open ORDERS, tap the formation button, then drag the hologram on the map and release. Every marker is one unit slot.',
   done:'Formation placed. Spacing keeps mixed units readable and prevents stacking.',
   test:function(){ return MATCH.sawFormation; } },

 { id:'fog', icon:'⌾',
   say:'Black fog hides enemies; grey terrain is remembered, not currently visible. Move the marked SCOUT toward the signal to reveal the sector.',
   done:'Sensor contact expanded. Enemy positions remain hidden until a friendly sensor sees them.',
   test:function(){ return MATCH.sawScout; } },

 { id:'attack', icon:'➜',
   say:'Leave A-MOVE active and SINGLE-TAP unexplored ground. That is attack-move: units advance and engage contacts. DOUBLE-TAP is still retreat. Watch what actually does the killing: a unit with SPLASH on its card hits everything inside the radius, which beats raw damage against anything bunched up.',
   done:'Attack-move confirmed — single-tap ground fights on the way; double-tap ground breaks contact. Long-press a unit or structure for its full counter card.',
   test:function(){ return MATCH.sawAttackMove; } },

 { id:'tech', icon:'⌬',
   say:'Field rank 3 granted for training. Build BUILD → TECH → Research Complex; it unlocks studies and banks account-level ◆ Data after battle.',
   done:'Research Complex online. Its shield buffer protects studies from a sudden rush.',
   test:function(){ return hasPlayerBld('techlab'); } },

  { id:'ability', icon:'✦',
    say:'Select the Commander, then tap BLAST in the action bar above the selection panel. Abilities cost energy and have cooldowns.',
   done:'Special ability confirmed. Research and Commander levels unlock additional powers.',
   test:function(){ return MATCH.usedAbility; } },

 { id:'objective', icon:'◎', manual:'objectiveAck', action:'CALL EXTRACTION',
   say:'Normal operations end by their selected objective: destroy Commanders, hold territory, purge hives or survive. Training is secure—tap CALL EXTRACTION.',
   done:'Extraction acknowledged. Match resources, rewards and research are summarized after every operation.',
   test:function(){ return MATCH.objectiveAck; } },

 { id:'cloud', icon:'☁', manual:'cloudAck', action:'FINISH TRAINING',
   say:'Your career autosaves locally. After extraction, ACCOUNT can compare and sync a cloud save; PROFILE can export a portable .mfsave backup. Tap FINISH TRAINING.',
   done:'Career storage confirmed.',
   test:function(){ return MATCH.cloudAck; } }
];

var BASE_ATTACK_LINES=[
 'Contact on the perimeter — tap the ⚠ alert, top of screen, and go see for yourself.',
 "Something's testing your walls. The ⚠ alert will take you straight there."
];
var UNIT_LOST_LINES=[
 "That one's not getting up. Filed under acceptable losses — keep the file short.",
 'Lost one. It happens to everyone who actually fights. Keep moving.'
];
var LOW_POWER_LINE="Grid's in the red. Whatever's queued behind it just stopped moving.";
var WAVE_LINE="Enemy's massing for a real push — you'll feel this one land. Get your army somewhere useful.";
var HAZARD_LINES={
 vanguard:'Dust front inbound — sight and speed go with it. Get exposed units under cover.',
 highland:"The slope's about to become the valley floor. Clear the marked ground.",
 isles:"Storm's earthing through whatever's biggest and made of metal. Spread out.",
 crater:"The relic's stirring. The basin's about to go dark — don't be standing in it.",
 _default:"Something's inbound that isn't the enemy. Read the warning; it isn't decoration."
};

/* ---------------------------------------------------------------------------
   STATE
   --------------------------------------------------------------------------- */
var TUT={ active:false, stepIdx:0, doneFlags:[], shownStepIdx:-1, graduated:false, forceNext:false,
          trainingMode:false, finishTimer:0 };
var trainingPrev=null, trainingLaunched=false;
/* Set only while re-entering tutSkip from its own confirmation callback, so the
   dialog cannot ask twice. */
var tutSkipConfirmed=false;
/* Facts about THIS match, tracked whether or not the tutorial is running, so
   a mid-match "replay" (from Settings) can credit things the player already
   demonstrably knows how to do instead of waiting for them to happen again. */
var MATCH={ sawSel:false, sawCombatSel:false, sawMove:false, sawQueue:false, sawCamera:false,
            sawPickup:false, sawPlatoon:false, sawFormation:false, sawAttackMove:false,sawScout:false,
            sawRetreat:false,
            territoryAck:false,objectiveAck:false,cloudAck:false,usedAbility:false,
            startCombat:0,cameraBase:null,pickup:null,scoutIdx:-1,scoutStart:null,lastAbCool:[0,0,0,0] };
/* Reactive one-per-match latches. */
var REACT={ baseAttack:false, lowPower:false, hazard:false, unitLost:false, wave:false,
            lastAlarmT:0, lastStallE:false, lastHazWarn:false, lastWarned:false };
var prevDropping=false;

function tutMeta(){
  if(typeof META==='undefined'||!META) return {done:false,skipped:false,version:0};
  META.tutorial=META.tutorial||{done:false,skipped:false,version:0};
  /* `progress` is additive save metadata: old profiles load exactly as before,
     while the briefing can distinguish new, interrupted and completed runs.
     It is a high-water mark only; the live-state gates below remain the
     authority whenever a mission is running. */
  if(typeof META.tutorial.progress!=='number') META.tutorial.progress=META.tutorial.done?STEPS.length:0;
  META.tutorial.progress=Math.max(0,Math.min(STEPS.length,META.tutorial.progress|0));
  return META.tutorial;
}
function pick(arr){ return arr[(Math.random()*arr.length)|0]; }
function hasPlayerBld(type){
  if(typeof bldLive==='undefined') return false;
  for(var i=0;i<bldLive.length;i++){
    var B=bldLive[i];
    /* The lesson is about making a valid placement. Waiting through the full
       construction timer left the highlight pointing back at BUILD after the
       player had already done the requested action, which looked like a loop. */
    if(B.alive!==false && B.team===0 && B.type===type) return true;
  }
  return false;
}
function playerBld(type){
  if(typeof bldLive==='undefined') return null;
  for(var i=0;i<bldLive.length;i++) if(bldLive[i].alive!==false&&bldLive[i].team===0&&bldLive[i].type===type) return bldLive[i];
  return null;
}
function isCombatUnit(i){
  return typeof ualive!=='undefined'&&ualive[i]&&uteam[i]===0&&i!==heroIdx&&utype[i]!==19;
}
function hasCombatUnit(){
  if(typeof unitHigh!=='number') return false;
  for(var i=0;i<unitHigh;i++) if(isCombatUnit(i)) return true;
  return false;
}
function combatCount(){
  if(typeof unitHigh!=='number') return 0;
  var n=0;for(var i=0;i<unitHigh;i++)if(isCombatUnit(i))n++;return n;
}
function hasSelectedCombatUnit(){
  if(typeof unitHigh!=='number') return false;
  for(var i=0;i<unitHigh;i++) if(isCombatUnit(i)&&usel[i]) return true;
  return false;
}
function sawQueuedUnit(){
  if(typeof bldLive==='undefined') return false;
  /* A queued item stays at B.queue[0] for its full build time (>=1.1s for the
     cheapest unit — see TYPES[0].bt) and is only shifted off on completion,
     so a non-empty queue is never a one-frame flicker: it is guaranteed to be
     visible across many polls of this timer, with no need for a population
     backstop that would have to guess at a baseline. */
  for(var i=0;i<bldLive.length;i++){
    var B=bldLive[i];
    if(B.team===0 && B.queue && B.queue.length>0 &&
       (B.type==='fac'||B.type==='tgate'||B.type==='harbor'||B.type==='airfield')) return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
   THE BUBBLE — one element, two moods. "Speaking" (a fresh line just landed,
   full emphasis, brief pulse) settles into "resting" (the current step's
   objective, held at lower emphasis) once its hold time elapses. Reactive
   barks are not tied to a step: they interrupt, hold briefly, then hand back
   to whatever the resting text was (or hide, if the tutorial isn't running).
   --------------------------------------------------------------------------- */
var queue=[], holdUntil=0, restingText='', restingTag='', restingId='', lastText=null, domReady=false;
var focusEls=[], mapCue=null;

function buildDOM(){
  if(domReady) return;
  domReady=true;
  var wrap=document.createElement('div');
  wrap.id='keelWrap';
  wrap.setAttribute('aria-live','polite');
  wrap.innerHTML=
    '<div id="keelBar">'+
      '<div id="keelBadge" aria-hidden="true"><span class="kr kr1"></span><span class="kr kr2"></span><span class="kd"></span></div>'+
      '<div id="keelBody">'+
        '<div id="keelHd"><span id="keelName" title="'+KEEL_TAG+'">'+KEEL_NAME+'</span><span id="keelStepTag"></span></div>'+
        '<div id="keelTxt"></div>'+
        '<div id="keelProgress" role="progressbar" aria-label="Training objective progress" aria-valuemin="0"><i></i></div>'+
        '<button id="keelNext" type="button">GOT IT</button>'+
      '</div>'+
      '<button id="keelSkip" type="button" aria-label="Skip tutorial">SKIP</button>'+
    '</div>';
  document.body.appendChild(wrap);
  var cue=document.createElement('div');
  cue.id='keelMapCue'; cue.setAttribute('aria-hidden','true'); cue.innerHTML='<span></span>';
  document.body.appendChild(cue);
  var mode=document.createElement('div');
  mode.id='keelModeBadge'; mode.setAttribute('aria-live','polite');
  mode.innerHTML='<b>TRAINING OPERATION</b><span>KEEL GUIDANCE ACTIVE</span>';
  document.body.appendChild(mode);
  var skipBtn=document.getElementById('keelSkip');
  skipBtn.addEventListener('pointerdown',function(ev){ ev.stopPropagation(); tutSkip(); });
  /* A control that abandons a match should not be styled as a hint. In a
     training match the label becomes END and the button takes the warning
     treatment, so the destructive one is never the quiet one. */
  skipBtn.classList.toggle('keelSkipEnd',!!TUT.trainingMode);
  skipBtn.textContent=TUT.trainingMode?'END':'SKIP';
  var nextBtn=document.getElementById('keelNext');
  nextBtn.addEventListener('pointerdown',function(ev){
    ev.preventDefault(); ev.stopPropagation();
    var S=TUT.active&&STEPS[TUT.stepIdx];
    if(!S||!S.manual) return;
    MATCH[S.manual]=true;
    if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
  });
  /* Tapping the body re-shows the full-strength card if it has settled into
     its dim resting state — a quiet "say that again" without extra chrome. */
  document.getElementById('keelBar').addEventListener('pointerdown',function(ev){
    if(ev.target===skipBtn||ev.target===nextBtn) return;
    if(restingText) speak(restingText,4.2,'recall',restingId);
  });
  mapCue=cue;
}
function renderBubble(text,tag){
  if(!domReady) return;
  if(text!==lastText){ var t=document.getElementById('keelTxt'); if(t) t.textContent=text; lastText=text; }
  var tg=document.getElementById('keelStepTag'); if(tg) tg.textContent=tag||'';
  var pg=document.getElementById('keelProgress');
  if(pg){
    var at=Math.min(STEPS.length,TUT.stepIdx),pct=STEPS.length?at/STEPS.length*100:0;
    pg.setAttribute('aria-valuemax',STEPS.length);pg.setAttribute('aria-valuenow',at);
    var fill=pg.querySelector('i');if(fill)fill.style.width=pct+'%';
  }
}
function showWrap(fresh){
  if(!domReady) return;
  var w=document.getElementById('keelWrap');
  if(w) w.classList.add('show');
  var bar=document.getElementById('keelBar');
  if(bar){
    bar.classList.toggle('resting',!fresh);
    if(fresh){ bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse'); }
  }
}
function hideWrap(){
  if(!domReady) return;
  var w=document.getElementById('keelWrap');
  if(w) w.classList.remove('show');
}

/* ---------------------------------------------------------------------------
   CONTEXT SIGNAL — the copy names a control and this signal marks that exact
   control. It is recalculated every poll because BUILD changes from button →
   tab → card → world placement without changing tutorial steps. The signal is
   purely visual (pointer-events:none), so it can never become an input shield.
   --------------------------------------------------------------------------- */
function shown(el){
  if(!el||!el.isConnected) return false;
  var s=getComputedStyle(el),r=el.getBoundingClientRect();
  return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;
}
function byText(rootId,selector,text){
  var root=document.getElementById(rootId); if(!root) return null;
  var list=root.querySelectorAll(selector),want=String(text).toUpperCase();
  for(var i=0;i<list.length;i++) if((list[i].textContent||'').toUpperCase().indexOf(want)>=0) return list[i];
  return null;
}
function clearFocus(){
  for(var i=0;i<focusEls.length;i++){
    focusEls[i].classList.remove('keelFocus');
    if(focusEls[i].getAttribute('aria-describedby')==='keelTxt') focusEls[i].removeAttribute('aria-describedby');
  }
  focusEls.length=0;
  if(mapCue){ mapCue.classList.remove('show'); mapCue.style.removeProperty('left'); mapCue.style.removeProperty('top'); }
}
function focusEl(el){
  if(!shown(el)||focusEls.indexOf(el)>=0) return;
  el.classList.add('keelFocus'); el.setAttribute('aria-describedby','keelTxt'); focusEls.push(el);
}
function cueAt(x,y,label){
  if(!mapCue) return;
  var pad=62,bot=typeof VH==='number'?Math.max(210,VH*.25):220;
  x=Math.max(pad,Math.min((typeof VW==='number'?VW:innerWidth)-pad,x));
  y=Math.max(170,Math.min((typeof VH==='number'?VH:innerHeight)-bot,y));
  mapCue.style.left=x+'px'; mapCue.style.top=y+'px';
  var t=mapCue.querySelector('span'); if(t) t.textContent=label||'TAP MAP';
  mapCue.classList.add('show');
}
function cueWorld(x,y,label){
  try{ var p=w2s(x,y); cueAt(p[0],p[1],label); }
  catch(e){ cueAt((typeof VW==='number'?VW:innerWidth)*.5,(typeof VH==='number'?VH:innerHeight)*.5,label); }
}
function buildFocus(cat,name,type){
  if(typeof placing!=='undefined'&&placing&&placing.type===type){
    var valid=false;
    try{ valid=!!placementValid(); }catch(e){}
    if(valid) focusEl(document.getElementById('placeOk'));
    if(type==='mex'&&!valid&&typeof deposits!=='undefined'){
      var best=null,bd=Infinity;
      for(var i=0;i<deposits.length;i++) if(!deposits[i].taken){
        var d=placing?Math.hypot(deposits[i].x-placing.x,deposits[i].y-placing.y):i;
        if(d<bd){bd=d;best=deposits[i];}
      }
      if(best) cueWorld(best.x,best.y,'◆ DEPOSIT');
    } else cueWorld(placing.x,placing.y,valid?'TAP ✓':'BLUE GRID');
    return;
  }
  var bm=document.getElementById('buildMenu');
  if(shown(bm)){
    var tab=byText('buildTabs','.tabBtn',cat);
    var card=byText('buildGrid','.bcard',name);
    if(card) focusEl(card); else if(tab) focusEl(tab);
    return;
  }
  focusEl(document.getElementById('buildBtn'));
}
function syncFocus(){
  clearFocus();
  var badge=document.getElementById('keelModeBadge');
  /* The KEEL card already carries STEP / TOTAL and the current objective.
     Repeating that information in a second fixed badge consumed the same
     narrow phone lane as the goal bar and rank row, creating the exact stack
     the tutorial is meant to teach through. Keep the legacy node for old OTA
     shells, but it is no longer a visible surface. */
  if(badge) badge.classList.remove('show');
  if(!TUT.active||TUT.stepIdx>=STEPS.length) return;
  var S=STEPS[TUT.stepIdx],next=document.getElementById('keelNext');
  if(badge){
    var bs=badge.querySelector('span'); if(bs) bs.textContent='OBJECTIVE '+(TUT.stepIdx+1)+' / '+STEPS.length+' · '+S.id.toUpperCase();
  }
  if(next){
    next.style.display=S.manual?'inline-flex':'none';next.textContent=S.action||'GOT IT';
    next.setAttribute('aria-label',(S.action||'Confirm')+' — '+S.id+' lesson');
  }
  if(S.id==='camera'){
    focusEl(document.querySelector('.hudDeckBtn[data-deck="view"]'));
    focusEl(document.getElementById('rotL'));focusEl(document.getElementById('zoomIn'));focusEl(document.getElementById('tiltBtn'));focusEl(document.getElementById('zoomOut'));focusEl(document.getElementById('rotR'));
    cueAt((typeof VW==='number'?VW:innerWidth)*.5,(typeof VH==='number'?VH:innerHeight)*.52,'DRAG / PINCH');
  } else if(S.id==='deploy'){
    var dep=document.getElementById('deployBtn');
    if(shown(dep)) focusEl(dep); else cueAt((typeof VW==='number'?VW:innerWidth)*.5,(typeof VH==='number'?VH:innerHeight)*.52,'TAP LANDING SITE');
  } else if(S.id==='commander'){
    focusEl(document.getElementById('heroBar'));
  } else if(S.id==='pickup'){
    if(MATCH.pickup&&crates.indexOf(MATCH.pickup)>=0)cueWorld(MATCH.pickup.x,MATCH.pickup.y,'◆ COLLECT CACHE');
    focusEl(document.getElementById('heroBar'));
  } else if(S.id==='mex') buildFocus('ECONOMY','Extractor','mex');
  else if(S.id==='power') buildFocus('ECONOMY','Reactor','pgen');
  else if(S.id==='fac') buildFocus('PRODUCTION','Factory','fac');
  else if(S.id==='territory'){
    focusEl(document.getElementById('buildBtn'));
    var H=playerBld('hq');
    if(H) cueWorld(H.x,H.y,'BLUE BUILD GRID');
  } else if(S.id==='queue'){
    focusEl(document.getElementById('unitRes'));
    var pm=document.getElementById('prodMenu');
    if(shown(pm)) focusEl(byText('prodGrid','.bcard','Striker')||pm.querySelector('.bcard'));
    else { var F=playerBld('fac'); if(F) cueWorld(F.x,F.y,'TAP FACTORY'); }
  } else if(S.id==='train'){
    if(hasCombatUnit()) focusEl(document.getElementById('armyBtn'));
    else { var F2=playerBld('fac'); if(F2) cueWorld(F2.x,F2.y,'UNIT BUILDING'); }
  } else if(S.id==='orders'){
    /* No button teaches this one — the cue has to sit on the ground the
       player is being asked to double-tap, offset clear of the units so the
       marker is not sitting under the very gesture it is asking for. */
    var ox=0,oy=0,on=0;
    if(typeof unitHigh==='number') for(var q=0;q<unitHigh;q++) if(isCombatUnit(q)&&usel[q]){ox+=ux[q];oy+=uy[q];on++;}
    if(on) cueWorld(ox/on-170,oy/on+130,'DOUBLE-TAP = RETREAT');
    else focusEl(document.getElementById('armyBtn'));
  } else if(S.id==='turret') buildFocus('DEFENCE','Sentinel','turret');
  else if(S.id==='platoon'){
    if(shown(document.getElementById('grpRow')))focusEl(document.getElementById('grpBtn1'));
    else focusEl(document.querySelector('.hudDeckBtn[data-deck="platoons"]'));
  } else if(S.id==='formation'){
    if(shown(document.getElementById('tacRow'))){
      focusEl(document.getElementById('formBtn'));
      if(orderPreview)cueWorld(orderPreview.x,orderPreview.y,'DRAG FORMATION');
    } else focusEl(document.querySelector('.hudDeckBtn[data-deck="orders"]'));
  } else if(S.id==='attack'){
    if(shown(document.getElementById('tacRow')))focusEl(document.getElementById('moveBtn'));
    else focusEl(document.querySelector('.hudDeckBtn[data-deck="orders"]'));
    var sx=0,sy=0,n=0;
    if(typeof unitHigh==='number') for(var j=0;j<unitHigh;j++) if(isCombatUnit(j)&&usel[j]){sx+=ux[j];sy+=uy[j];n++;}
    if(n) cueWorld(sx/n+150,sy/n-110,'SINGLE-TAP = A-MOVE');
    else focusEl(document.getElementById('armyBtn'));
  } else if(S.id==='fog'){
    focusEl(document.getElementById('minimapWrap'));
    if(MATCH.scoutIdx>=0&&ualive[MATCH.scoutIdx])cueWorld(ux[MATCH.scoutIdx]+190,uy[MATCH.scoutIdx]-150,'SCOUT THIS SECTOR');
  } else if(S.id==='tech') buildFocus('TECH','Research Complex','techlab');
else if(S.id==='ability'){
        focusEl(document.getElementById('heroBar'));
        if(typeof heroIdx==='number'&&heroIdx>=0&&ualive[heroIdx])cueWorld(ux[heroIdx]+105,uy[heroIdx]-70,'BLAST TARGET');
  } else if(S.id==='objective'||S.id==='cloud'){
    focusEl(next);
  }
}
/* Capped so a burst of state changes (several buildings finishing within the
   same poll, or a mid-match replay that silently back-fills a lot of
   already-true steps) can never queue up a minute of stale dialogue. Once
   the backlog is deep, older lines are dropped in favour of newer ones — the
   step the player is looking at right now matters more than a "done" bark
   for something they finished three actions ago. */
var MAX_QUEUE=3;
/* `id` is the AUTHORED voice key for this line (see keenLineId). It travels with
   the line through the queue instead of being reconstructed from the copy on the
   far side — reconstructing it is what let the gate and the player disagree. */
function speak(text,holdSec,kind,id){
  if(!text) return;
  queue.push({text:text,hold:holdSec||4.4,kind:kind||'bark',id:id||null});
  while(queue.length>MAX_QUEUE) queue.shift();
}
function pump(){
  var now=performance.now()/1000;
  if(now<holdUntil) return;
  if(queue.length){
    var m=queue.shift();
    renderBubble(m.text,restingTag);
    /* Hold time compresses while a backlog remains, so a burst of catch-up
       lines still reads in order without pinning the HUD for the better
       part of a minute. */
    holdUntil=now+(queue.length? Math.min(m.hold,2.4) : m.hold);
    showWrap(true);
    /* Pass the line's identity through, so a rendered take can be found for it
       instead of every line silently falling through to synthesis. */
    speakVoice(m.text,'keen',keenLineId(m.kind,m.id));
    return;
  }
  if(TUT.active && restingText){
    renderBubble(restingText,restingTag);
    showWrap(false);
  } else hideWrap();
}

/* ---------------------------------------------------------------------------
   VOICE — opt-in, best-effort, silent when unsupported. Never awaited, never
   on the hot path: a browser with no speechSynthesis (or one that throws)
   behaves exactly like voice is off.
   --------------------------------------------------------------------------- */
/* KEEN WAS MUTE FOR THREE REASONS AT ONCE.
   1. This gate required `'speechSynthesis' in window` — the very dependency the
      voice rework existed to remove. A device with a downloaded voice pack and
      no TTS engine (ordinary on Android WebView) reported voice as unavailable
      and never even looked at the pack.
   2. pump() called speakVoice(text) with no action, so the `voPlay` branch was
      unreachable and every line fell through to speech synthesis regardless.
   3. On the platforms that DO expose speechSynthesis, an Android WebView with
      no installed voice makes speak() a silent no-op, so the fallback failed
      quietly too — which is why this reads as "the voice doesn't work" rather
      than as an error.
   Voice is now on when EITHER path can carry it. */
function voiceOn(){
  try{
    if(!(typeof META!=='undefined' && META.settings && META.settings.tutorialVoice)) return false;
    /* voHas asks the BANK MANIFEST; voReady asks whether the buffer is decoded
       yet. Gating on voReady alone made the answer "no voice available" for the
       whole of a cold start, because nothing is decoded until something asks for
       it — and this gate is the thing that asks. */
    if(typeof voHas==='function' && voHas('keen','greeting')) return true;
    if(typeof voReady==='function' && voReady('keen','greeting')) return true;
    return 'speechSynthesis' in window;
  }catch(e){ return false; }
}
/* A stable id per scripted line, so a rendered take can be looked up for it.
   KEEN's script is FIXED — every step's say/done, the greeting, the graduation
   and the reactive barks are constants — which is precisely what makes them
   renderable offline the same way the command acks already are.

   THE ID IS AUTHORED AT THE CALL SITE. It must match an action key under
   `lines.keen` in data:application/json;base64,ewogIl9ub3RlIjogIkdFTkVSQVRFRCBieSB0b29scy9tYWtlLXZvaWNlcy5weSDigJQgZG8gbm90IGhhbmQtZWRpdC4gUmUtcnVuIHRoZSB0b29sOyBzZWUgZG9jcy9WT0lDRS1QSVBFTElORS5tZC4iLAogImdlbmVyYXRlZCI6ICIyMDI2LTA4LTA5VDAzOjA4OjEzWiIsCiAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogInZvaWNlcyI6IHsKICAiYXNjZW5kYW5jeSI6ICJibV9nZW9yZ2UiLAogICJob3JkZSI6ICJibV9mYWJsZSIsCiAgImtlZW4iOiAiYWZfaGVhcnQiLAogICJub3ZhIjogImFtX21pY2hhZWwiLAogICJzeW5kaWNhdGUiOiAiYWZfYmVsbGEiCiB9LAogImxpbmVzIjogewogICJhc2NlbmRhbmN5IjogewogICAiYWJpbGl0eSI6IFsKICAgICJhc2NlbmRhbmN5X2FiaWxpdHlfMCIsCiAgICAiYXNjZW5kYW5jeV9hYmlsaXR5XzEiLAogICAgImFzY2VuZGFuY3lfYWJpbGl0eV8yIgogICBdLAogICAiYXR0YWNrIjogWwogICAgImFzY2VuZGFuY3lfYXR0YWNrXzAiLAogICAgImFzY2VuZGFuY3lfYXR0YWNrXzEiLAogICAgImFzY2VuZGFuY3lfYXR0YWNrXzIiCiAgIF0sCiAgICJidWlsZCI6IFsKICAgICJhc2NlbmRhbmN5X2J1aWxkXzAiLAogICAgImFzY2VuZGFuY3lfYnVpbGRfMSIsCiAgICAiYXNjZW5kYW5jeV9idWlsZF8yIgogICBdLAogICAiZGVwbG95IjogWwogICAgImFzY2VuZGFuY3lfZGVwbG95XzAiLAogICAgImFzY2VuZGFuY3lfZGVwbG95XzEiLAogICAgImFzY2VuZGFuY3lfZGVwbG95XzIiCiAgIF0sCiAgICJob2xkIjogWwogICAgImFzY2VuZGFuY3lfaG9sZF8wIiwKICAgICJhc2NlbmRhbmN5X2hvbGRfMSIsCiAgICAiYXNjZW5kYW5jeV9ob2xkXzIiCiAgIF0sCiAgICJtb3ZlIjogWwogICAgImFzY2VuZGFuY3lfbW92ZV8wIiwKICAgICJhc2NlbmRhbmN5X21vdmVfMSIsCiAgICAiYXNjZW5kYW5jeV9tb3ZlXzIiCiAgIF0sCiAgICJwYXRyb2wiOiBbCiAgICAiYXNjZW5kYW5jeV9wYXRyb2xfMCIsCiAgICAiYXNjZW5kYW5jeV9wYXRyb2xfMSIsCiAgICAiYXNjZW5kYW5jeV9wYXRyb2xfMiIKICAgXSwKICAgInNlbGVjdCI6IFsKICAgICJhc2NlbmRhbmN5X3NlbGVjdF8wIiwKICAgICJhc2NlbmRhbmN5X3NlbGVjdF8xIiwKICAgICJhc2NlbmRhbmN5X3NlbGVjdF8yIgogICBdLAogICAic3RvcCI6IFsKICAgICJhc2NlbmRhbmN5X3N0b3BfMCIsCiAgICAiYXNjZW5kYW5jeV9zdG9wXzEiLAogICAgImFzY2VuZGFuY3lfc3RvcF8yIgogICBdCiAgfSwKICAiaG9yZGUiOiB7CiAgICJhYmlsaXR5IjogWwogICAgImhvcmRlX2FiaWxpdHlfMCIsCiAgICAiaG9yZGVfYWJpbGl0eV8xIiwKICAgICJob3JkZV9hYmlsaXR5XzIiCiAgIF0sCiAgICJhdHRhY2siOiBbCiAgICAiaG9yZGVfYXR0YWNrXzAiLAogICAgImhvcmRlX2F0dGFja18xIiwKICAgICJob3JkZV9hdHRhY2tfMiIKICAgXSwKICAgImJ1aWxkIjogWwogICAgImhvcmRlX2J1aWxkXzAiLAogICAgImhvcmRlX2J1aWxkXzEiLAogICAgImhvcmRlX2J1aWxkXzIiCiAgIF0sCiAgICJkZXBsb3kiOiBbCiAgICAiaG9yZGVfZGVwbG95XzAiLAogICAgImhvcmRlX2RlcGxveV8xIiwKICAgICJob3JkZV9kZXBsb3lfMiIKICAgXSwKICAgImhvbGQiOiBbCiAgICAiaG9yZGVfaG9sZF8wIiwKICAgICJob3JkZV9ob2xkXzEiLAogICAgImhvcmRlX2hvbGRfMiIKICAgXSwKICAgIm1vdmUiOiBbCiAgICAiaG9yZGVfbW92ZV8wIiwKICAgICJob3JkZV9tb3ZlXzEiLAogICAgImhvcmRlX21vdmVfMiIKICAgXSwKICAgInBhdHJvbCI6IFsKICAgICJob3JkZV9wYXRyb2xfMCIsCiAgICAiaG9yZGVfcGF0cm9sXzEiLAogICAgImhvcmRlX3BhdHJvbF8yIgogICBdLAogICAic2VsZWN0IjogWwogICAgImhvcmRlX3NlbGVjdF8wIiwKICAgICJob3JkZV9zZWxlY3RfMSIsCiAgICAiaG9yZGVfc2VsZWN0XzIiCiAgIF0sCiAgICJzdG9wIjogWwogICAgImhvcmRlX3N0b3BfMCIsCiAgICAiaG9yZGVfc3RvcF8xIiwKICAgICJob3JkZV9zdG9wXzIiCiAgIF0KICB9LAogICJrZWVuIjogewogICAiZG9uZV9hYmlsaXR5IjogWwogICAgImtlZW5fZG9uZV9hYmlsaXR5IgogICBdLAogICAiZG9uZV9hdHRhY2siOiBbCiAgICAia2Vlbl9kb25lX2F0dGFjayIKICAgXSwKICAgImRvbmVfY2FtZXJhIjogWwogICAgImtlZW5fZG9uZV9jYW1lcmEiCiAgIF0sCiAgICJkb25lX2Nsb3VkIjogWwogICAgImtlZW5fZG9uZV9jbG91ZCIKICAgXSwKICAgImRvbmVfY29tbWFuZGVyIjogWwogICAgImtlZW5fZG9uZV9jb21tYW5kZXIiCiAgIF0sCiAgICJkb25lX2RlcGxveSI6IFsKICAgICJrZWVuX2RvbmVfZGVwbG95IgogICBdLAogICAiZG9uZV9mYWMiOiBbCiAgICAia2Vlbl9kb25lX2ZhYyIKICAgXSwKICAgImRvbmVfZm9nIjogWwogICAgImtlZW5fZG9uZV9mb2ciCiAgIF0sCiAgICJkb25lX2Zvcm1hdGlvbiI6IFsKICAgICJrZWVuX2RvbmVfZm9ybWF0aW9uIgogICBdLAogICAiZG9uZV9pbnRlbCI6IFsKICAgICJrZWVuX2RvbmVfaW50ZWwiCiAgIF0sCiAgICJkb25lX21leCI6IFsKICAgICJrZWVuX2RvbmVfbWV4IgogICBdLAogICAiZG9uZV9vYmplY3RpdmUiOiBbCiAgICAia2Vlbl9kb25lX29iamVjdGl2ZSIKICAgXSwKICAgImRvbmVfcGlja3VwIjogWwogICAgImtlZW5fZG9uZV9waWNrdXAiCiAgIF0sCiAgICJkb25lX3BsYXRvb24iOiBbCiAgICAia2Vlbl9kb25lX3BsYXRvb24iCiAgIF0sCiAgICJkb25lX3Bvd2VyIjogWwogICAgImtlZW5fZG9uZV9wb3dlciIKICAgXSwKICAgImRvbmVfcXVldWUiOiBbCiAgICAia2Vlbl9kb25lX3F1ZXVlIgogICBdLAogICAiZG9uZV90ZWNoIjogWwogICAgImtlZW5fZG9uZV90ZWNoIgogICBdLAogICAiZG9uZV90ZXJyaXRvcnkiOiBbCiAgICAia2Vlbl9kb25lX3RlcnJpdG9yeSIKICAgXSwKICAgImRvbmVfdHJhaW4iOiBbCiAgICAia2Vlbl9kb25lX3RyYWluIgogICBdLAogICAiZG9uZV90dXJyZXQiOiBbCiAgICAia2Vlbl9kb25lX3R1cnJldCIKICAgXSwKICAgImdyYWR1YXRpb24iOiBbCiAgICAia2Vlbl9ncmFkdWF0aW9uIgogICBdLAogICAiZ3JlZXRpbmciOiBbCiAgICAia2Vlbl9ncmVldGluZyIKICAgXSwKICAgInJlYWN0X2Jhc2VfYXR0YWNrMCI6IFsKICAgICJrZWVuX3JlYWN0X2Jhc2VfYXR0YWNrMCIKICAgXSwKICAgInJlYWN0X2Jhc2VfYXR0YWNrMSI6IFsKICAgICJrZWVuX3JlYWN0X2Jhc2VfYXR0YWNrMSIKICAgXSwKICAgInJlYWN0X2hhemFyZF9jcmF0ZXIiOiBbCiAgICAia2Vlbl9yZWFjdF9oYXphcmRfY3JhdGVyIgogICBdLAogICAicmVhY3RfaGF6YXJkX2RlZmF1bHQiOiBbCiAgICAia2Vlbl9yZWFjdF9oYXphcmRfZGVmYXVsdCIKICAgXSwKICAgInJlYWN0X2hhemFyZF9oaWdobGFuZCI6IFsKICAgICJrZWVuX3JlYWN0X2hhemFyZF9oaWdobGFuZCIKICAgXSwKICAgInJlYWN0X2hhemFyZF9pc2xlcyI6IFsKICAgICJrZWVuX3JlYWN0X2hhemFyZF9pc2xlcyIKICAgXSwKICAgInJlYWN0X2hhemFyZF92YW5ndWFyZCI6IFsKICAgICJrZWVuX3JlYWN0X2hhemFyZF92YW5ndWFyZCIKICAgXSwKICAgInJlYWN0X2xvd19wb3dlciI6IFsKICAgICJrZWVuX3JlYWN0X2xvd19wb3dlciIKICAgXSwKICAgInJlYWN0X3VuaXRfbG9zdDAiOiBbCiAgICAia2Vlbl9yZWFjdF91bml0X2xvc3QwIgogICBdLAogICAicmVhY3RfdW5pdF9sb3N0MSI6IFsKICAgICJrZWVuX3JlYWN0X3VuaXRfbG9zdDEiCiAgIF0sCiAgICJyZWFjdF93YXZlIjogWwogICAgImtlZW5fcmVhY3Rfd2F2ZSIKICAgXSwKICAgInNraXAiOiBbCiAgICAia2Vlbl9za2lwIgogICBdLAogICAic3RlcF9hYmlsaXR5IjogWwogICAgImtlZW5fc3RlcF9hYmlsaXR5IgogICBdLAogICAic3RlcF9hdHRhY2siOiBbCiAgICAia2Vlbl9zdGVwX2F0dGFjayIKICAgXSwKICAgInN0ZXBfY2FtZXJhIjogWwogICAgImtlZW5fc3RlcF9jYW1lcmEiCiAgIF0sCiAgICJzdGVwX2Nsb3VkIjogWwogICAgImtlZW5fc3RlcF9jbG91ZCIKICAgXSwKICAgInN0ZXBfY29tbWFuZGVyIjogWwogICAgImtlZW5fc3RlcF9jb21tYW5kZXIiCiAgIF0sCiAgICJzdGVwX2RlcGxveSI6IFsKICAgICJrZWVuX3N0ZXBfZGVwbG95IgogICBdLAogICAic3RlcF9mYWMiOiBbCiAgICAia2Vlbl9zdGVwX2ZhYyIKICAgXSwKICAgInN0ZXBfZm9nIjogWwogICAgImtlZW5fc3RlcF9mb2ciCiAgIF0sCiAgICJzdGVwX2Zvcm1hdGlvbiI6IFsKICAgICJrZWVuX3N0ZXBfZm9ybWF0aW9uIgogICBdLAogICAic3RlcF9pbnRlbCI6IFsKICAgICJrZWVuX3N0ZXBfaW50ZWwiCiAgIF0sCiAgICJzdGVwX21leCI6IFsKICAgICJrZWVuX3N0ZXBfbWV4IgogICBdLAogICAic3RlcF9vYmplY3RpdmUiOiBbCiAgICAia2Vlbl9zdGVwX29iamVjdGl2ZSIKICAgXSwKICAgInN0ZXBfcGlja3VwIjogWwogICAgImtlZW5fc3RlcF9waWNrdXAiCiAgIF0sCiAgICJzdGVwX3BsYXRvb24iOiBbCiAgICAia2Vlbl9zdGVwX3BsYXRvb24iCiAgIF0sCiAgICJzdGVwX3Bvd2VyIjogWwogICAgImtlZW5fc3RlcF9wb3dlciIKICAgXSwKICAgInN0ZXBfcXVldWUiOiBbCiAgICAia2Vlbl9zdGVwX3F1ZXVlIgogICBdLAogICAic3RlcF90ZWNoIjogWwogICAgImtlZW5fc3RlcF90ZWNoIgogICBdLAogICAic3RlcF90ZXJyaXRvcnkiOiBbCiAgICAia2Vlbl9zdGVwX3RlcnJpdG9yeSIKICAgXSwKICAgInN0ZXBfdHJhaW4iOiBbCiAgICAia2Vlbl9zdGVwX3RyYWluIgogICBdLAogICAic3RlcF90dXJyZXQiOiBbCiAgICAia2Vlbl9zdGVwX3R1cnJldCIKICAgXQogIH0sCiAgIm5vdmEiOiB7CiAgICJhYmlsaXR5IjogWwogICAgIm5vdmFfYWJpbGl0eV8wIiwKICAgICJub3ZhX2FiaWxpdHlfMSIsCiAgICAibm92YV9hYmlsaXR5XzIiCiAgIF0sCiAgICJhdHRhY2siOiBbCiAgICAibm92YV9hdHRhY2tfMCIsCiAgICAibm92YV9hdHRhY2tfMSIsCiAgICAibm92YV9hdHRhY2tfMiIKICAgXSwKICAgImJ1aWxkIjogWwogICAgIm5vdmFfYnVpbGRfMCIsCiAgICAibm92YV9idWlsZF8xIiwKICAgICJub3ZhX2J1aWxkXzIiCiAgIF0sCiAgICJkZXBsb3kiOiBbCiAgICAibm92YV9kZXBsb3lfMCIsCiAgICAibm92YV9kZXBsb3lfMSIsCiAgICAibm92YV9kZXBsb3lfMiIKICAgXSwKICAgImhvbGQiOiBbCiAgICAibm92YV9ob2xkXzAiLAogICAgIm5vdmFfaG9sZF8xIiwKICAgICJub3ZhX2hvbGRfMiIKICAgXSwKICAgIm1vdmUiOiBbCiAgICAibm92YV9tb3ZlXzAiLAogICAgIm5vdmFfbW92ZV8xIiwKICAgICJub3ZhX21vdmVfMiIKICAgXSwKICAgInBhdHJvbCI6IFsKICAgICJub3ZhX3BhdHJvbF8wIiwKICAgICJub3ZhX3BhdHJvbF8xIiwKICAgICJub3ZhX3BhdHJvbF8yIgogICBdLAogICAic2VsZWN0IjogWwogICAgIm5vdmFfc2VsZWN0XzAiLAogICAgIm5vdmFfc2VsZWN0XzEiLAogICAgIm5vdmFfc2VsZWN0XzIiCiAgIF0sCiAgICJzdG9wIjogWwogICAgIm5vdmFfc3RvcF8wIiwKICAgICJub3ZhX3N0b3BfMSIsCiAgICAibm92YV9zdG9wXzIiCiAgIF0KICB9LAogICJzeW5kaWNhdGUiOiB7CiAgICJhYmlsaXR5IjogWwogICAgInN5bmRpY2F0ZV9hYmlsaXR5XzAiLAogICAgInN5bmRpY2F0ZV9hYmlsaXR5XzEiLAogICAgInN5bmRpY2F0ZV9hYmlsaXR5XzIiCiAgIF0sCiAgICJhdHRhY2siOiBbCiAgICAic3luZGljYXRlX2F0dGFja18wIiwKICAgICJzeW5kaWNhdGVfYXR0YWNrXzEiLAogICAgInN5bmRpY2F0ZV9hdHRhY2tfMiIKICAgXSwKICAgImJ1aWxkIjogWwogICAgInN5bmRpY2F0ZV9idWlsZF8wIiwKICAgICJzeW5kaWNhdGVfYnVpbGRfMSIsCiAgICAic3luZGljYXRlX2J1aWxkXzIiCiAgIF0sCiAgICJkZXBsb3kiOiBbCiAgICAic3luZGljYXRlX2RlcGxveV8wIiwKICAgICJzeW5kaWNhdGVfZGVwbG95XzEiLAogICAgInN5bmRpY2F0ZV9kZXBsb3lfMiIKICAgXSwKICAgImhvbGQiOiBbCiAgICAic3luZGljYXRlX2hvbGRfMCIsCiAgICAic3luZGljYXRlX2hvbGRfMSIsCiAgICAic3luZGljYXRlX2hvbGRfMiIKICAgXSwKICAgIm1vdmUiOiBbCiAgICAic3luZGljYXRlX21vdmVfMCIsCiAgICAic3luZGljYXRlX21vdmVfMSIsCiAgICAic3luZGljYXRlX21vdmVfMiIKICAgXSwKICAgInBhdHJvbCI6IFsKICAgICJzeW5kaWNhdGVfcGF0cm9sXzAiLAogICAgInN5bmRpY2F0ZV9wYXRyb2xfMSIsCiAgICAic3luZGljYXRlX3BhdHJvbF8yIgogICBdLAogICAic2VsZWN0IjogWwogICAgInN5bmRpY2F0ZV9zZWxlY3RfMCIsCiAgICAic3luZGljYXRlX3NlbGVjdF8xIiwKICAgICJzeW5kaWNhdGVfc2VsZWN0XzIiCiAgIF0sCiAgICJzdG9wIjogWwogICAgInN5bmRpY2F0ZV9zdG9wXzAiLAogICAgInN5bmRpY2F0ZV9zdG9wXzEiLAogICAgInN5bmRpY2F0ZV9zdG9wXzIiCiAgIF0KICB9CiB9LAogInRha2VzIjogewogICJhc2NlbmRhbmN5X2FiaWxpdHlfMCI6IHsKICAgInNoYSI6ICI2YjdiMDMzNjViZTFhYzFjIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi45MzUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NDMxLAogICAibTRhIjogMTYxMjQKICB9LAogICJhc2NlbmRhbmN5X2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICI3ZTIyNGEyYzJkMzc5YmRkIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wOTksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE2MTM1LAogICAibTRhIjogMTY5MzYKICB9LAogICJhc2NlbmRhbmN5X2FiaWxpdHlfMiI6IHsKICAgInNoYSI6ICI1MGUyOTk5YzEzMWUwZDYxIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wNTEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NzQzLAogICAibTRhIjogMTY3NTQKICB9LAogICJhc2NlbmRhbmN5X2F0dGFja18wIjogewogICAic2hhIjogImNhNjc4ZWU1YzJiMmZhNmIiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjAzNywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE0OTUsCiAgICJtNGEiOiAxMTUyOAogIH0sCiAgImFzY2VuZGFuY3lfYXR0YWNrXzEiOiB7CiAgICJzaGEiOiAiOGE5YjVlYTY1MjM4NTdiNSIsCiAgICJ2b2ljZSI6ICJibV9nZW9yZ2UiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMDIsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1MzgyLAogICAibTRhIjogMTY1MzkKICB9LAogICJhc2NlbmRhbmN5X2F0dGFja18yIjogewogICAic2hhIjogIjkyZTE4MDY5Y2Q3YTFjMTciLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjg1OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTUyNDEsCiAgICJtNGEiOiAxNTgyOQogIH0sCiAgImFzY2VuZGFuY3lfYnVpbGRfMCI6IHsKICAgInNoYSI6ICIzMzdmYjM1NzQyOGEwNGY4IiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4xOTMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE2MzA1LAogICAibTRhIjogMTc0OTUKICB9LAogICJhc2NlbmRhbmN5X2J1aWxkXzEiOiB7CiAgICJzaGEiOiAiY2NhNDUwMjhmY2M1YTAwMyIsCiAgICJ2b2ljZSI6ICJibV9nZW9yZ2UiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMzk5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNzU3MiwKICAgIm00YSI6IDE4NTIyCiAgfSwKICAiYXNjZW5kYW5jeV9idWlsZF8yIjogewogICAic2hhIjogImViZGExZjE4NjRkMWIzZTYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjY0MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ0MTgsCiAgICJtNGEiOiAxNDYzMAogIH0sCiAgImFzY2VuZGFuY3lfZGVwbG95XzAiOiB7CiAgICJzaGEiOiAiNGQwOTcyZGYzYTRhNTg0NyIsCiAgICJ2b2ljZSI6ICJibV9nZW9yZ2UiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMDIyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNTY0MywKICAgIm00YSI6IDE2NjEyCiAgfSwKICAiYXNjZW5kYW5jeV9kZXBsb3lfMSI6IHsKICAgInNoYSI6ICI1MTQzY2NkNmNjMjY2Yzc5IiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi45MjMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NjIzLAogICAibTRhIjogMTYwNzAKICB9LAogICJhc2NlbmRhbmN5X2RlcGxveV8yIjogewogICAic2hhIjogIjVmMTJlZTdiMzZhYzI0YTMiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjg4MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTUyNzksCiAgICJtNGEiOiAxNTg4MwogIH0sCiAgImFzY2VuZGFuY3lfaG9sZF8wIjogewogICAic2hhIjogIjQyNDg2YzAxNzhkNGRkZDciLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI2MywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI3MjQsCiAgICJtNGEiOiAxMjcwOAogIH0sCiAgImFzY2VuZGFuY3lfaG9sZF8xIjogewogICAic2hhIjogImMzODMyNDdiZTgzZDU2M2IiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjgwMywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ3NTIsCiAgICJtNGEiOiAxNTQyNQogIH0sCiAgImFzY2VuZGFuY3lfaG9sZF8yIjogewogICAic2hhIjogImY1MThiYjgzNTFmNGQwYjAiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjM5NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTMxODYsCiAgICJtNGEiOiAxMzQzMgogIH0sCiAgImFzY2VuZGFuY3lfbW92ZV8wIjogewogICAic2hhIjogIjllOGU3YmU2MzE5NzhiMWQiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjQ5NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM3MTAsCiAgICJtNGEiOiAxMzg2OAogIH0sCiAgImFzY2VuZGFuY3lfbW92ZV8xIjogewogICAic2hhIjogIjc0OTRiZWJhNTdjY2NmODkiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjc5OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ1ODksCiAgICJtNGEiOiAxNTM5MwogIH0sCiAgImFzY2VuZGFuY3lfbW92ZV8yIjogewogICAic2hhIjogIjFhNTMyOThjYWY1NTIzYmYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjYwNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAwNTUsCiAgICJtNGEiOiA5NDQ0CiAgfSwKICAiYXNjZW5kYW5jeV9wYXRyb2xfMCI6IHsKICAgInNoYSI6ICI3MzFmZDQ3NjZkMDU3ODc3IiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4zOTUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNjA5LAogICAibTRhIjogMTM0MTYKICB9LAogICJhc2NlbmRhbmN5X3BhdHJvbF8xIjogewogICAic2hhIjogImNjOTBmYWE2MmU0YjVjNDEiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjA2LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjAxNSwKICAgIm00YSI6IDExNjUyCiAgfSwKICAiYXNjZW5kYW5jeV9wYXRyb2xfMiI6IHsKICAgInNoYSI6ICJlMzVjNWVmNmQ2YTE4MTIwIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi42MzEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE0MDkyLAogICAibTRhIjogMTQ2NTgKICB9LAogICJhc2NlbmRhbmN5X3NlbGVjdF8wIjogewogICAic2hhIjogImNmZTJlZjVlYmYwNDljZWYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjk5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNTcwMCwKICAgIm00YSI6IDE2MzkyCiAgfSwKICAiYXNjZW5kYW5jeV9zZWxlY3RfMSI6IHsKICAgInNoYSI6ICIwYWQwZTBhZjVhMDljNTUyIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi42NjYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE0Mjg5LAogICAibTRhIjogMTQ3MjkKICB9LAogICJhc2NlbmRhbmN5X3NlbGVjdF8yIjogewogICAic2hhIjogIjA4YzVjMTE3MTI5YjdhNDMiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjYyOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM5NjIsCiAgICJtNGEiOiAxNDY2NQogIH0sCiAgImFzY2VuZGFuY3lfc3RvcF8wIjogewogICAic2hhIjogImE5ZTQ2MTE4OWI3NGIwMjYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjg1OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ5MjgsCiAgICJtNGEiOiAxNTg4NgogIH0sCiAgImFzY2VuZGFuY3lfc3RvcF8xIjogewogICAic2hhIjogImNmYWFmYzRiOGI3Y2MxZjciLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjIzNSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTIzMTQsCiAgICJtNGEiOiAxMjU1NAogIH0sCiAgImFzY2VuZGFuY3lfc3RvcF8yIjogewogICAic2hhIjogImRlMWI1MWZiZDk3YjdkMzgiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjk3OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE2NTQsCiAgICJtNGEiOiAxMTMxNgogIH0sCiAgImhvcmRlX2FiaWxpdHlfMCI6IHsKICAgInNoYSI6ICI5MDBiZmQyNjFjZGZhMWE3IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjgyNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTUwNjEsCiAgICJtNGEiOiAxNTU4MAogIH0sCiAgImhvcmRlX2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICJhNzZhZDI4OTdkMDAwMDE2IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAzLjE5NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTY3MzgsCiAgICJtNGEiOiAxNzQ3NQogIH0sCiAgImhvcmRlX2FiaWxpdHlfMiI6IHsKICAgInNoYSI6ICIyMjFlYjQ0MTU2MzY2NTIxIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjkwNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTU1MDYsCiAgICJtNGEiOiAxNjA3MQogIH0sCiAgImhvcmRlX2F0dGFja18wIjogewogICAic2hhIjogImQxM2U1ZWJiZmMwZTIwNDYiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzU0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDI4OCwKICAgIm00YSI6IDEwMjA0CiAgfSwKICAiaG9yZGVfYXR0YWNrXzEiOiB7CiAgICJzaGEiOiAiNjgyOGQwMmY1NmJiNTFlZCIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wNjQsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NjYwLAogICAibTRhIjogMTY4NjYKICB9LAogICJob3JkZV9hdHRhY2tfMiI6IHsKICAgInNoYSI6ICI1NWJlNTYxZTg3Y2UwYTllIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjY4OSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQzODMsCiAgICJtNGEiOiAxNDk2NQogIH0sCiAgImhvcmRlX2J1aWxkXzAiOiB7CiAgICJzaGEiOiAiODhmZjc1NjZlYzhkMjVkOSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi43ODMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE0Njg3LAogICAibTRhIjogMTU0NjMKICB9LAogICJob3JkZV9idWlsZF8xIjogewogICAic2hhIjogImJhMWRhN2Y0NDViN2VmNmMiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMjI4LAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiAxNjc0MywKICAgIm00YSI6IDE3NzYyCiAgfSwKICAiaG9yZGVfYnVpbGRfMiI6IHsKICAgInNoYSI6ICI3ZDM2MWQ0NzcyYzUxZGUzIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjEyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjQ2NCwKICAgIm00YSI6IDEyMDgzCiAgfSwKICAiaG9yZGVfZGVwbG95XzAiOiB7CiAgICJzaGEiOiAiMzc0ZmI4NDBkZjcxZmQwMiIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wMDUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NTc4LAogICAibTRhIjogMTY2MDYKICB9LAogICJob3JkZV9kZXBsb3lfMSI6IHsKICAgInNoYSI6ICIwMGQxOThkZGYwMjg3ODdiIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjk2MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTU2NzEsCiAgICJtNGEiOiAxNjM0OQogIH0sCiAgImhvcmRlX2RlcGxveV8yIjogewogICAic2hhIjogIjM0YmFjMWI1MDNiMjBlN2UiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMDE0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNTU1OSwKICAgIm00YSI6IDE2NTM1CiAgfSwKICAiaG9yZGVfaG9sZF8wIjogewogICAic2hhIjogIjk2YTYxNDU3Y2UyYjNjNDYiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuODUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExMDYzLAogICAibTRhIjogMTA2NjUKICB9LAogICJob3JkZV9ob2xkXzEiOiB7CiAgICJzaGEiOiAiOTkwODU1OGI2MWI4NDBjNyIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi42MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM5ODMsCiAgICJtNGEiOiAxNDY3NAogIH0sCiAgImhvcmRlX2hvbGRfMiI6IHsKICAgInNoYSI6ICJkMDkwMDU3NTkwZGU1M2QzIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjg4MywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTExNjQsCiAgICJtNGEiOiAxMDg2MAogIH0sCiAgImhvcmRlX21vdmVfMCI6IHsKICAgInNoYSI6ICJhNTdjNjhkOTkzMTQ1NDU3IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI3NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI5MTcsCiAgICJtNGEiOiAxMjgwMAogIH0sCiAgImhvcmRlX21vdmVfMSI6IHsKICAgInNoYSI6ICJkODI3YzFjOWY5ZTkyMDA4IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI4MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI1MDUsCiAgICJtNGEiOiAxMjg1OQogIH0sCiAgImhvcmRlX21vdmVfMiI6IHsKICAgInNoYSI6ICI1NzNhMWU1NWYwZDUyMzAzIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjMwOCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogOTAwOSwKICAgIm00YSI6IDc3MTgKICB9LAogICJob3JkZV9wYXRyb2xfMCI6IHsKICAgInNoYSI6ICJhZjYwODc5NDExZDRlMTRjIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjEzOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI1OTgsCiAgICJtNGEiOiAxMjE0NAogIH0sCiAgImhvcmRlX3BhdHJvbF8xIjogewogICAic2hhIjogImY4ZjliMDUzZWVhY2I3MmIiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzU3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDg0MCwKICAgIm00YSI6IDEwMTc5CiAgfSwKICAiaG9yZGVfcGF0cm9sXzIiOiB7CiAgICJzaGEiOiAiMmQ1YWI3M2M4MGE1ZjFjZiIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi40ODksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNjgxLAogICAibTRhIjogMTM4NzgKICB9LAogICJob3JkZV9zZWxlY3RfMCI6IHsKICAgInNoYSI6ICI0ZGRmMjFjMDc0YjRkZDRiIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjc2NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ3MDIsCiAgICJtNGEiOiAxNTM0MQogIH0sCiAgImhvcmRlX3NlbGVjdF8xIjogewogICAic2hhIjogImM2MDNlYTQzN2Y1ZDY2ZTIiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTgzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjQ5MCwKICAgIm00YSI6IDEyMzg0CiAgfSwKICAiaG9yZGVfc2VsZWN0XzIiOiB7CiAgICJzaGEiOiAiNzIxOTQ0YjAwNGQ2N2VhMSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi40NjksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzMTc0LAogICAibTRhIjogMTM3NTYKICB9LAogICJob3JkZV9zdG9wXzAiOiB7CiAgICJzaGEiOiAiZWZmNTAzMGIzNGQzM2MxZSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi41NzcsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNzcyLAogICAibTRhIjogMTQ0MjkKICB9LAogICJob3JkZV9zdG9wXzEiOiB7CiAgICJzaGEiOiAiYzI4MTFmMWYyNThjZGZhOSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS44MTMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEwODE0LAogICAibTRhIjogMTA0NzYKICB9LAogICJob3JkZV9zdG9wXzIiOiB7CiAgICJzaGEiOiAiNDMxMWM4ODc2NTQyMTBjMSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS44MTQsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEwOTg4LAogICAibTRhIjogMTA0MTgKICB9LAogICJrZWVuX2RvbmVfYWJpbGl0eSI6IHsKICAgInNoYSI6ICI5OGU5ZDdkMjc4MWY3NDI3IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1Ljk2NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjczNTMsCiAgICJtNGEiOiAzMDEzMwogIH0sCiAgImtlZW5fZG9uZV9hdHRhY2siOiB7CiAgICJzaGEiOiAiNmJmZmYyOGU3YjIyYzFjMiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS41MjksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI1MzgzLAogICAibTRhIjogMjgxNDMKICB9LAogICJrZWVuX2RvbmVfY2FtZXJhIjogewogICAic2hhIjogImRhNDc5OGQ4YmU3NGU4N2EiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDUuMzM1LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAyNDgwMCwKICAgIm00YSI6IDI3MzA1CiAgfSwKICAia2Vlbl9kb25lX2Nsb3VkIjogewogICAic2hhIjogIjQzODMwZTAyNzkwNmRiZjAiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDY3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA3NywKICAgIm00YSI6IDExNzU2CiAgfSwKICAia2Vlbl9kb25lX2NvbW1hbmRlciI6IHsKICAgInNoYSI6ICIzMTczMTgyM2UzYWUxMDljIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1Ljc5OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjYyNjcsCiAgICJtNGEiOiAyOTQ2NAogIH0sCiAgImtlZW5fZG9uZV9kZXBsb3kiOiB7CiAgICJzaGEiOiAiYTg1MDRjZWU3YWM1N2IzMSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy44NjIsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE5MTAxLAogICAibTRhIjogMjA2NzYKICB9LAogICJrZWVuX2RvbmVfZmFjIjogewogICAic2hhIjogImZmYmQ1MGIxMTkwOGU0ZDgiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuODkxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxOTE3MCwKICAgIm00YSI6IDIwODc2CiAgfSwKICAia2Vlbl9kb25lX2ZvZyI6IHsKICAgInNoYSI6ICIzZTkyZDI2NTQzNmYxYzFhIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA2Ljk2NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMzEzOTcsCiAgICJtNGEiOiAzNDg1NAogIH0sCiAgImtlZW5fZG9uZV9mb3JtYXRpb24iOiB7CiAgICJzaGEiOiAiYWE4ZjA4ZDBmMzYwNzlmMCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4yNTgsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI0Nzc3LAogICAibTRhIjogMjcyMjkKICB9LAogICJrZWVuX2RvbmVfaW50ZWwiOiB7CiAgICJzaGEiOiAiNGM4ODhkNmMzOWZkYTI5MiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTEuNDY4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA0ODE3MSwKICAgIm00YSI6IDU1OTAyCiAgfSwKICAia2Vlbl9kb25lX21leCI6IHsKICAgInNoYSI6ICJmNjgzZmZkNDNlNzlmZDAxIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAzLjU0NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTgxODIsCiAgICJtNGEiOiAxOTE1MwogIH0sCiAgImtlZW5fZG9uZV9vYmplY3RpdmUiOiB7CiAgICJzaGEiOiAiNDdmODZjMDY1Y2FmYTk1NCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNy4zNTgsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDMyODc3LAogICAibTRhIjogMzcwNjQKICB9LAogICJrZWVuX2RvbmVfcGlja3VwIjogewogICAic2hhIjogIjNmYjY0ZWU0ZWQwYmI2OGMiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDYuOTYyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzMDg4MywKICAgIm00YSI6IDM0ODUyCiAgfSwKICAia2Vlbl9kb25lX3BsYXRvb24iOiB7CiAgICJzaGEiOiAiZTVhNzQxMWQwOTBkNzExZCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4wMTIsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDIzNDI2LAogICAibTRhIjogMjU2OTEKICB9LAogICJrZWVuX2RvbmVfcG93ZXIiOiB7CiAgICJzaGEiOiAiYTVlNTk1MDQ4OTgxN2I0YyIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4wMjEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDIzNjk1LAogICAibTRhIjogMjYyMzMKICB9LAogICJrZWVuX2RvbmVfcXVldWUiOiB7CiAgICJzaGEiOiAiMDU0NTYxOWZkNmFiYzU0ZiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4wMDEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDIzNDIyLAogICAibTRhIjogMjU2MjMKICB9LAogICJrZWVuX2RvbmVfdGVjaCI6IHsKICAgInNoYSI6ICI5YzIwNTNkODA2YmYwMDYyIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1LjYyNSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjU4OTUsCiAgICJtNGEiOiAyODcwNgogIH0sCiAgImtlZW5fZG9uZV90ZXJyaXRvcnkiOiB7CiAgICJzaGEiOiAiN2FjOWM2ZmVjN2I1ODZlOCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi44NzEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1MzQ0LAogICAibTRhIjogMTU4MzEKICB9LAogICJrZWVuX2RvbmVfdHJhaW4iOiB7CiAgICJzaGEiOiAiYjFlNTAyNTI4ZDc2NTZiMSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNi42OSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjkyMTQsCiAgICJtNGEiOiAzMzQ5NwogIH0sCiAgImtlZW5fZG9uZV90dXJyZXQiOiB7CiAgICJzaGEiOiAiYmIyNWNiMTI0NmIzMzg3YiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTQuNTYyLAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiA1OTE0NSwKICAgIm00YSI6IDcxMTQ1CiAgfSwKICAia2Vlbl9ncmFkdWF0aW9uIjogewogICAic2hhIjogImU5ZDJkNGU5ZjY2MDFhMDAiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEyLjA5NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNTA5MTAsCiAgICJtNGEiOiA1OTAwOQogIH0sCiAgImtlZW5fZ3JlZXRpbmciOiB7CiAgICJzaGEiOiAiM2YyZGQ2M2JjMmExYjQ3NiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTIuMTIzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA1MDA5OSwKICAgIm00YSI6IDU4ODIwCiAgfSwKICAia2Vlbl9yZWFjdF9iYXNlX2F0dGFjazAiOiB7CiAgICJzaGEiOiAiNjdhY2M5NWI5MzliMWQxZSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS40MTUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI1NDAwLAogICAibTRhIjogMjc5OTUKICB9LAogICJrZWVuX3JlYWN0X2Jhc2VfYXR0YWNrMSI6IHsKICAgInNoYSI6ICI2MDk3YWVhZmUwNGM0MDdhIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjA0NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTk4OTIsCiAgICJtNGEiOiAyMTM3NQogIH0sCiAgImtlZW5fcmVhY3RfaGF6YXJkX2NyYXRlciI6IHsKICAgInNoYSI6ICIzOTE3ZDBhODlkZGExMzMwIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjgyMywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjM1NTcsCiAgICJtNGEiOiAyNTIwNwogIH0sCiAgImtlZW5fcmVhY3RfaGF6YXJkX2RlZmF1bHQiOiB7CiAgICJzaGEiOiAiNThhMDNmODJkYjQ5OTM5NSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS43NzUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI2MjM5LAogICAibTRhIjogMjkzNzMKICB9LAogICJrZWVuX3JlYWN0X2hhemFyZF9oaWdobGFuZCI6IHsKICAgInNoYSI6ICJiMTBmNTUxYjFmYmM2NjA1IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjM4NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjA4ODUsCiAgICJtNGEiOiAyMzA0NQogIH0sCiAgImtlZW5fcmVhY3RfaGF6YXJkX2lzbGVzIjogewogICAic2hhIjogImVlM2Q1ZGQ5ZGYxNDgzNjYiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDQuNjIzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAyMjM4NywKICAgIm00YSI6IDI0MDE1CiAgfSwKICAia2Vlbl9yZWFjdF9oYXphcmRfdmFuZ3VhcmQiOiB7CiAgICJzaGEiOiAiNzY1OGRkMTFiNmZkZDdmMyIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS41OTMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI2MDE2LAogICAibTRhIjogMjg3NjIKICB9LAogICJrZWVuX3JlYWN0X2xvd19wb3dlciI6IHsKICAgInNoYSI6ICJlZGE4M2E5ZDBhMmU3NTEzIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjEzOCwKICAgInBlYWsiOiAtMC42LAogICAib2dnIjogMjAyNDIsCiAgICJtNGEiOiAyMjAxOAogIH0sCiAgImtlZW5fcmVhY3RfdW5pdF9sb3N0MCI6IHsKICAgInNoYSI6ICIzMGU4NmQzODFhMzk5NzY3IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1LjI1MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjQ4NTIsCiAgICJtNGEiOiAyNzAyMAogIH0sCiAgImtlZW5fcmVhY3RfdW5pdF9sb3N0MSI6IHsKICAgInNoYSI6ICIxYmEzMzE2MjM4YTVlYWNjIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0Ljk2NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjMzMzksCiAgICJtNGEiOiAyNTg0NAogIH0sCiAgImtlZW5fcmVhY3Rfd2F2ZSI6IHsKICAgInNoYSI6ICIyNjQzMGVmMTU4YjA4M2ViIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA2LjI5NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjc3MjIsCiAgICJtNGEiOiAzMTk3MAogIH0sCiAgImtlZW5fc2tpcCI6IHsKICAgInNoYSI6ICIzNjMwOWJhN2EwNDk4MTc2IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1LjMxNSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjQ5NjgsCiAgICJtNGEiOiAyNzI4NwogIH0sCiAgImtlZW5fc3RlcF9hYmlsaXR5IjogewogICAic2hhIjogIjQ1Yzg1OTdmZjEwNWJkNDAiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDguNjg1LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzNzc2NywKICAgIm00YSI6IDQyODI4CiAgfSwKICAia2Vlbl9zdGVwX2F0dGFjayI6IHsKICAgInNoYSI6ICI4ZmNkYTA5YTViZGQwNDkwIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxNi43NTcsCiAgICJwZWFrIjogLTAuNiwKICAgIm9nZyI6IDY4Njc4LAogICAibTRhIjogODEzNzEKICB9LAogICJrZWVuX3N0ZXBfY2FtZXJhIjogewogICAic2hhIjogIjE5MGRkNTM1MWEzOWI5MTIiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDkuNDE2LAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiA0MDE2NSwKICAgIm00YSI6IDQ2NDk5CiAgfSwKICAia2Vlbl9zdGVwX2Nsb3VkIjogewogICAic2hhIjogIjVhM2ExMTYxNTcxYzAyZjUiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEyLjI0NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNTEzNjMsCiAgICJtNGEiOiA1OTg3OAogIH0sCiAgImtlZW5fc3RlcF9jb21tYW5kZXIiOiB7CiAgICJzaGEiOiAiNjQ2OGI2NTIwMzg3ZjRiMCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNy40NTUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDMzNDQ4LAogICAibTRhIjogMzcyMTcKICB9LAogICJrZWVuX3N0ZXBfZGVwbG95IjogewogICAic2hhIjogIjRlMmQ3MWNhN2I2NDJjNjIiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDYuODkxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzMDE2MiwKICAgIm00YSI6IDM0ODQ5CiAgfSwKICAia2Vlbl9zdGVwX2ZhYyI6IHsKICAgInNoYSI6ICIwNGNhMjMwMjY2ZDE2Y2UyIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA4LjQ4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzNzMzMiwKICAgIm00YSI6IDQyMDc2CiAgfSwKICAia2Vlbl9zdGVwX2ZvZyI6IHsKICAgInNoYSI6ICIxNjI3MzQyNzQ4Y2MyMmVkIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA5LjI0MywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMzk2NzgsCiAgICJtNGEiOiA0NTgwMAogIH0sCiAgImtlZW5fc3RlcF9mb3JtYXRpb24iOiB7CiAgICJzaGEiOiAiNzBlMjllMWJmZmYxMmIwNCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogOC4wODUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDM1MTgwLAogICAibTRhIjogNDAyMzQKICB9LAogICJrZWVuX3N0ZXBfaW50ZWwiOiB7CiAgICJzaGEiOiAiNjc0Mzk1M2U2ZTg4YmMyYyIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTcuNjUyLAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiA3MTMwOCwKICAgIm00YSI6IDg0ODIwCiAgfSwKICAia2Vlbl9zdGVwX21leCI6IHsKICAgInNoYSI6ICIyN2FlMDI1N2NmMTg2ZWJlIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA5Ljk4NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNDI4NzMsCiAgICJtNGEiOiA0OTU0MAogIH0sCiAgImtlZW5fc3RlcF9vYmplY3RpdmUiOiB7CiAgICJzaGEiOiAiZDg1YTY5MDg5N2JkYjM4ZSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTEuNjQ0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA0ODk0NiwKICAgIm00YSI6IDU3MDE1CiAgfSwKICAia2Vlbl9zdGVwX3BpY2t1cCI6IHsKICAgInNoYSI6ICJmMjI2ODY5MjBhNTkyNTU5IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA4LjU5MiwKICAgInBlYWsiOiAtMC42LAogICAib2dnIjogMzc4NjIsCiAgICJtNGEiOiA0MjU2NwogIH0sCiAgImtlZW5fc3RlcF9wbGF0b29uIjogewogICAic2hhIjogImE4NjdhMGU4ZTA3NDFhMTIiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDkuODExLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA0MTY2MSwKICAgIm00YSI6IDQ4NTg1CiAgfSwKICAia2Vlbl9zdGVwX3Bvd2VyIjogewogICAic2hhIjogIjY2NWY3YWVlZjNiNTMxY2MiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEwLjE2NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNDM3NjAsCiAgICJtNGEiOiA1MDI3OQogIH0sCiAgImtlZW5fc3RlcF9xdWV1ZSI6IHsKICAgInNoYSI6ICI4Zjg4MDE5MWRlYTE4YTk5IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA2Ljc1MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjk4MTQsCiAgICJtNGEiOiAzMzgzOQogIH0sCiAgImtlZW5fc3RlcF90ZWNoIjogewogICAic2hhIjogIjM3MWYzZDU5NDA4MzNhNGYiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEwLjA2NiwKICAgInBlYWsiOiAtMC42LAogICAib2dnIjogNDM3MzIsCiAgICJtNGEiOiA0OTY4OQogIH0sCiAgImtlZW5fc3RlcF90ZXJyaXRvcnkiOiB7CiAgICJzaGEiOiAiOWJmYjVmMzlhNjliMGQzMSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTIuMTMzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA1MDk0OCwKICAgIm00YSI6IDU5NDM5CiAgfSwKICAia2Vlbl9zdGVwX3RyYWluIjogewogICAic2hhIjogImJjMjg0MDgwNjc4NjBiY2UiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDcuMzc0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzMjkwMSwKICAgIm00YSI6IDM2ODcxCiAgfSwKICAia2Vlbl9zdGVwX3R1cnJldCI6IHsKICAgInNoYSI6ICIzYTNkZjk1ZDZjMzdkODM4IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA3Ljc4MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMzM5MjAsCiAgICJtNGEiOiAzODY5NQogIH0sCiAgIm5vdmFfYWJpbGl0eV8wIjogewogICAic2hhIjogIjUzNzcwZmZmYTUzZWM4NDgiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4xNzcsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEyNDM3LAogICAibTRhIjogMTIyMzgKICB9LAogICJub3ZhX2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICIxZTFkMjg4YzZmNWNjZTE0IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuNTc0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNDQ0NywKICAgIm00YSI6IDE0MjY1CiAgfSwKICAibm92YV9hYmlsaXR5XzIiOiB7CiAgICJzaGEiOiAiMWE3YmMwZThhYWJjOTVjYSIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjY4OSwKICAgIm00YSI6IDEyODI3CiAgfSwKICAibm92YV9hdHRhY2tfMCI6IHsKICAgInNoYSI6ICJhMzJmMmZmNTIxN2M3ZWFhIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNjM0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA5ODI0LAogICAibTRhIjogOTQ5MgogIH0sCiAgIm5vdmFfYXR0YWNrXzEiOiB7CiAgICJzaGEiOiAiMWUxYWM2NWQ4MzBiNjUxZCIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjMwOCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI5NTcsCiAgICJtNGEiOiAxMjk0MwogIH0sCiAgIm5vdmFfYXR0YWNrXzIiOiB7CiAgICJzaGEiOiAiYWU3MTQ0M2Q1YTM5MTZhNiIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjIzNiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI3OTAsCiAgICJtNGEiOiAxMjU5MAogIH0sCiAgIm5vdmFfYnVpbGRfMCI6IHsKICAgInNoYSI6ICI2NjQyZjg2MzNjOTdjYzQ3IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuNDYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNDU2LAogICAibTRhIjogMTM3MDIKICB9LAogICJub3ZhX2J1aWxkXzEiOiB7CiAgICJzaGEiOiAiMDQ2MTA5YTg4N2Y4ZjcxNyIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjQxOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM3NzEsCiAgICJtNGEiOiAxMzUwMwogIH0sCiAgIm5vdmFfYnVpbGRfMiI6IHsKICAgInNoYSI6ICJiODY5ZGJkYWI0M2JkNjkyIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTkxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTk5NywKICAgIm00YSI6IDExMzk5CiAgfSwKICAibm92YV9kZXBsb3lfMCI6IHsKICAgInNoYSI6ICI2NDliYjMyMjkyMTZmNDY0IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMjg0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjc0NCwKICAgIm00YSI6IDEyODM2CiAgfSwKICAibm92YV9kZXBsb3lfMSI6IHsKICAgInNoYSI6ICI2YWVhYWVjZGMwNzBjMGVkIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTczLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjQyNywKICAgIm00YSI6IDEyMjY5CiAgfSwKICAibm92YV9kZXBsb3lfMiI6IHsKICAgInNoYSI6ICI2NGRiODcwOTE1NzBlYWRiIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTQ5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjM0NywKICAgIm00YSI6IDEyMTQyCiAgfSwKICAibm92YV9ob2xkXzAiOiB7CiAgICJzaGEiOiAiNjcyMTJkYzY5NDU4ODkzNiIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjkxNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTEzOTcsCiAgICJtNGEiOiAxMDkxMQogIH0sCiAgIm5vdmFfaG9sZF8xIjogewogICAic2hhIjogIjhkMDQyYzE4NzkxZDlhNTIiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4xNDEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEyMDgxLAogICAibTRhIjogMTIwNTUKICB9LAogICJub3ZhX2hvbGRfMiI6IHsKICAgInNoYSI6ICJhYjdkMDA1NGQ4NWQ2NDJmIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuODc4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTEwMSwKICAgIm00YSI6IDEwODY4CiAgfSwKICAibm92YV9tb3ZlXzAiOiB7CiAgICJzaGEiOiAiNDNiMTNiYjVmMWEyY2MyYiIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjgxOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTEwNjEsCiAgICJtNGEiOiAxMDQyOAogIH0sCiAgIm5vdmFfbW92ZV8xIjogewogICAic2hhIjogIjNiZjJmYzU5MDgzYjAzYjQiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4wMzYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExODc1LAogICAibTRhIjogMTE1NzcKICB9LAogICJub3ZhX21vdmVfMiI6IHsKICAgInNoYSI6ICIxYzNhNGNlZWU0M2Y4MTJjIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuMzkyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA5MjAzLAogICAibTRhIjogODIwMQogIH0sCiAgIm5vdmFfcGF0cm9sXzAiOiB7CiAgICJzaGEiOiAiMGIxMzY1NmY5ZGU2YTRkYSIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjkzOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE1NDksCiAgICJtNGEiOiAxMTA3OQogIH0sCiAgIm5vdmFfcGF0cm9sXzEiOiB7CiAgICJzaGEiOiAiNDc0YzJjZDFhYzZjODQwMyIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjYzNiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAyNjksCiAgICJtNGEiOiA5NTEwCiAgfSwKICAibm92YV9wYXRyb2xfMiI6IHsKICAgInNoYSI6ICI4NGFmMWYyNWQwZTEwMWNmIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDk5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA3MSwKICAgIm00YSI6IDExOTM5CiAgfSwKICAibm92YV9zZWxlY3RfMCI6IHsKICAgInNoYSI6ICIzZTdmMWFkZmQ0NWJmZDk5IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDkzLAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiAxMjAyMiwKICAgIm00YSI6IDExODI4CiAgfSwKICAibm92YV9zZWxlY3RfMSI6IHsKICAgInNoYSI6ICI0NDFhNjJjOTE4NGIzYjhkIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDcyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjEyMCwKICAgIm00YSI6IDExODA5CiAgfSwKICAibm92YV9zZWxlY3RfMiI6IHsKICAgInNoYSI6ICJjZjU4YjJlM2E2OTA0NzNmIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDQzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTQ0MywKICAgIm00YSI6IDExNTQ4CiAgfSwKICAibm92YV9zdG9wXzAiOiB7CiAgICJzaGEiOiAiYmMwOTdhN2UyZmI5MjQ1YyIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjE4MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTIyMzAsCiAgICJtNGEiOiAxMjI4MQogIH0sCiAgIm5vdmFfc3RvcF8xIjogewogICAic2hhIjogIjJmYzIxMWVmMzUyYWVlNmYiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS42NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAxMjMsCiAgICJtNGEiOiA5NTk5CiAgfSwKICAibm92YV9zdG9wXzIiOiB7CiAgICJzaGEiOiAiYmI0MTNlOTJmNjA4YmQxZCIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjY2LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDIyMSwKICAgIm00YSI6IDk2NTgKICB9LAogICJzeW5kaWNhdGVfYWJpbGl0eV8wIjogewogICAic2hhIjogImNjMzE1OWJiMDdiNjQ5YzkiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDAxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTU5NSwKICAgIm00YSI6IDExNDAwCiAgfSwKICAic3luZGljYXRlX2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICIzMzJhZmEwMWQ5ZmU3MzU5IiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI5NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI5NDIsCiAgICJtNGEiOiAxMzA2OQogIH0sCiAgInN5bmRpY2F0ZV9hYmlsaXR5XzIiOiB7CiAgICJzaGEiOiAiZDJjZmZiZTYxM2E1MzhhOSIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4wMzUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExODc5LAogICAibTRhIjogMTE2MTUKICB9LAogICJzeW5kaWNhdGVfYXR0YWNrXzAiOiB7CiAgICJzaGEiOiAiMWJiMGYyOWJiZTA1MGRiZCIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS41MDUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDkzMDAsCiAgICJtNGEiOiA4Nzc5CiAgfSwKICAic3luZGljYXRlX2F0dGFja18xIjogewogICAic2hhIjogIjA1NDlmNzc2ZmFlZDQ2YTkiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTgzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjM5MCwKICAgIm00YSI6IDEyMzU3CiAgfSwKICAic3luZGljYXRlX2F0dGFja18yIjogewogICAic2hhIjogIjQzYTNhMjg0YTZkYjY4ZDIiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDYxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA4OCwKICAgIm00YSI6IDExNjU2CiAgfSwKICAic3luZGljYXRlX2J1aWxkXzAiOiB7CiAgICJzaGEiOiAiMGIyOWU2YmU1ZGRjZDQ3OSIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4wOTYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEyMDEwLAogICAibTRhIjogMTE4OTYKICB9LAogICJzeW5kaWNhdGVfYnVpbGRfMSI6IHsKICAgInNoYSI6ICI2YjNiMDBkZWQxMWEwODE5IiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjE4NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI1OTksCiAgICJtNGEiOiAxMjQwOAogIH0sCiAgInN5bmRpY2F0ZV9idWlsZF8yIjogewogICAic2hhIjogIjFjNDUzZTQyM2QyMWZiZTMiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzY2LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDgxNywKICAgIm00YSI6IDEwMjA0CiAgfSwKICAic3luZGljYXRlX2RlcGxveV8wIjogewogICAic2hhIjogIjBhNWFlMTczNGFlNmQ5MTgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTE3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA3NiwKICAgIm00YSI6IDEyMDQ1CiAgfSwKICAic3luZGljYXRlX2RlcGxveV8xIjogewogICAic2hhIjogIjM0Y2QxYTM4NTZhYmEwMjkiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTg0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTg0NSwKICAgIm00YSI6IDExMzM5CiAgfSwKICAic3luZGljYXRlX2RlcGxveV8yIjogewogICAic2hhIjogIjFhMWQ3Zjk0NDRiZTg5NjgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExNTc2LAogICAibTRhIjogMTEyMTMKICB9LAogICJzeW5kaWNhdGVfaG9sZF8wIjogewogICAic2hhIjogIjIyMDgzMGU5NTIxMzk5ODgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNjU3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDIxNiwKICAgIm00YSI6IDk2NTQKICB9LAogICJzeW5kaWNhdGVfaG9sZF8xIjogewogICAic2hhIjogIjFkZTBjMzgwNzhiYjJmN2EiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTUyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTQzMSwKICAgIm00YSI6IDExMTMyCiAgfSwKICAic3luZGljYXRlX2hvbGRfMiI6IHsKICAgInNoYSI6ICI5ZDE1NDk1NjFiN2JiZWY4IiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjcxMywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTA0MjIsCiAgICJtNGEiOiA5OTczCiAgfSwKICAic3luZGljYXRlX21vdmVfMCI6IHsKICAgInNoYSI6ICI4MmU1OTY0MWY1Zjk4ZWVmIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjY1MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAxNzgsCiAgICJtNGEiOiA5NzA1CiAgfSwKICAic3luZGljYXRlX21vdmVfMSI6IHsKICAgInNoYSI6ICI4MThmMjNiNzYzMjUxZGJkIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjg3OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTEwMjAsCiAgICJtNGEiOiAxMDg0MQogIH0sCiAgInN5bmRpY2F0ZV9tb3ZlXzIiOiB7CiAgICJzaGEiOiAiNDM3YWVmMmNlM2Q4YjhjZSIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS4zMjMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDg5MDAsCiAgICJtNGEiOiA4MDA2CiAgfSwKICAic3luZGljYXRlX3BhdHJvbF8wIjogewogICAic2hhIjogIjU1ZTJkMzg1YWY4ZTRmYzIiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzcsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEwNzU0LAogICAibTRhIjogMTAyMzAKICB9LAogICJzeW5kaWNhdGVfcGF0cm9sXzEiOiB7CiAgICJzaGEiOiAiNjI3MGI4OWNlNGUxMTU3MiIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS40MzgsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDkyODMsCiAgICJtNGEiOiA4NDg0CiAgfSwKICAic3luZGljYXRlX3BhdHJvbF8yIjogewogICAic2hhIjogIjJkM2Y0MGFjNzk1OGQzOGYiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuODgxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTAyMiwKICAgIm00YSI6IDEwODcwCiAgfSwKICAic3luZGljYXRlX3NlbGVjdF8wIjogewogICAic2hhIjogIjhjYmU4ODUyNmU4MGM1MTIiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTE1LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTM1MCwKICAgIm00YSI6IDEwOTM1CiAgfSwKICAic3luZGljYXRlX3NlbGVjdF8xIjogewogICAic2hhIjogImYxMTg4ZTRhYzg1NzJhODgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzQzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDU2MiwKICAgIm00YSI6IDEwMTAxCiAgfSwKICAic3luZGljYXRlX3NlbGVjdF8yIjogewogICAic2hhIjogIjhkMjg1OWY0NGE2ZjRkMTAiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzQ4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDM3MSwKICAgIm00YSI6IDEwMTQzCiAgfSwKICAic3luZGljYXRlX3N0b3BfMCI6IHsKICAgInNoYSI6ICJiNzcxYzUzZmZhYTgxOWIwIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjA2OSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE4MDQsCiAgICJtNGEiOiAxMTc4MgogIH0sCiAgInN5bmRpY2F0ZV9zdG9wXzEiOiB7CiAgICJzaGEiOiAiMDdhN2E4YzlkNmZlYzZmOCIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS40OTEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDk1NjEsCiAgICJtNGEiOiA4NzcxCiAgfSwKICAic3luZGljYXRlX3N0b3BfMiI6IHsKICAgInNoYSI6ICI4ZTdiYWE5YzY0YjA2NzEwIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjQ4MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogOTI5MiwKICAgIm00YSI6IDg3NzYKICB9CiB9Cn0K (step_camera, done_camera, greeting,
   skip, graduation, react_low_power, react_hazard_default, …), which is what
   verifykeen.mjs diffs. This used to hash the line's own TEXT, which meant the
   gate at voiceOn() probed vo_keen_greeting while playback asked for
   vo_keen_greeting_19hur50, no rendered take could ever match either, and
   correcting a typo silently orphaned a take.

   `kind` no longer contributes to the key — it survives only as the bubble's
   hold/emphasis class. That is deliberate: it is what lets a 'recall' replay
   resolve to the SAME take as the 'step' line it is repeating instead of
   demanding a second recording of identical copy. */
function keenLineId(kind,id){
  if(!id) return null;
  return String(id).toLowerCase().replace(/[^a-z0-9_]/g,'');
}
/* CHARACTER VOICES.

   This used to be window.speechSynthesis. That could not work on the platforms
   this game ships to: Android WebView often has no installed TTS voice at all
   (silent no-op), iOS WKWebView gates speech behind a gesture and drops queued
   utterances on backgrounding, the voice you get is whatever the host OS
   happens to have, and none of it passes through the game's mixer — no volume
   slider, no ducking, no priority culling.

   The lines are now pre-rendered by tools/make-voices.py with Piper (open
   source, one distinct voice per faction) through a comms-radio filter chain,
   and played as ordinary samples. speechSynthesis survives only as the
   last-resort fallback for a build whose voice pack has not downloaded yet. */
function speakVoice(text,faction,action,idx,wx,wy){
  if(!voiceOn()) return;
  var fac=faction||'nova';
  if(action&&typeof voPlay==='function'){
    /* A slot the player has not heard yet is not decoded yet, and the decode is
       asynchronous. Reporting "no take" at that instant is what made the FIRST
       airing of every line — which for KEEN is the only airing — fall through to
       speech synthesis. voPlay now owns the wait and calls back only if the take
       genuinely cannot be produced. */
    if(voPlay(fac,action,wx,wy,idx,function(){ speakVoiceFallback(text,fac); })) return;
  }
  speakVoiceFallback(text,fac);
}
/* Chrome returns an EMPTY voice list on the first getVoices() call and fills it
   asynchronously, so the very first line of the tutorial — the greeting, the
   one a new player is most likely to notice missing — picked no voice and, on
   some builds, did not speak at all. Warm the list once at load. */
try{
  if(window.speechSynthesis && window.speechSynthesis.getVoices &&
     !window.speechSynthesis.getVoices().length){
    window.speechSynthesis.addEventListener('voiceschanged',function once(){
      window.speechSynthesis.removeEventListener('voiceschanged',once);
    });
    window.speechSynthesis.getVoices();
  }
}catch(e){}
function speakVoiceFallback(text,faction){
  try{
    if(!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var u=new SpeechSynthesisUtterance(String(text).replace(/[\u2192\u25c6\u26cf\ud83c\udfd7\ud83c\udfed\ud83d\udca5\u26a0\u2715]/g,''));
    var v={keen:[1.06,.94],nova:[1.02,.82],ascendancy:[.92,.66],syndicate:[1.10,1.03],horde:[.78,.52]}[faction]||[1.02,.82];
    u.rate=v[0]; u.pitch=v[1];
    /* The last-resort OS voice cannot enter Web Audio, but it must still obey
       the same Voice Volume setting as the rendered commander/tutorial bank. */
    u.volume=0.85*(typeof audVoiceLevel==='function'?audVoiceLevel():1);
    var voices=window.speechSynthesis.getVoices?window.speechSynthesis.getVoices():[];
    if(voices.length&&faction){
      var prefer=faction==='ascendancy'?'male':(faction==='syndicate'||faction==='keen')?'female':faction==='horde'?'en':null;
      var chosen=voices.find(function(q){return prefer&&String(q.name).toLowerCase().indexOf(prefer)>=0;})||
                 voices.find(function(q){return /^en/i.test(q.lang);});
      if(chosen)u.voice=chosen;
    }
    window.speechSynthesis.speak(u);
  }catch(e){ /* degrade silently — the radio panel already carries the message */ }
}

/* ---------------------------------------------------------------------------
   MATCH-LEVEL SIGNAL TRACKING — runs every tick regardless of whether the
   tutorial is active, so replaying it mid-match can credit what the player
   already demonstrably did.
   --------------------------------------------------------------------------- */
function trackMatchSignals(){
  if(sawQueuedUnit()) MATCH.sawQueue=true;
  if(MATCH.cameraBase){
    var C=MATCH.cameraBase;
    if((typeof camUserT==='number'&&camUserT>0)||Math.abs(yawTarget-C.yaw)>.06||
       Math.abs(pitchTarget-C.pitch)>.035||Math.abs(orthoSpan-C.span)>24)MATCH.sawCamera=true;
  }
  if(typeof unitHigh==='number' && (!MATCH.sawSel||!MATCH.sawCombatSel)){
    for(var i=0;i<unitHigh;i++){
      if(!ualive[i]||uteam[i]!==0) continue;
      if(usel[i]) MATCH.sawSel=true;
      if(isCombatUnit(i)&&usel[i]) MATCH.sawCombatSel=true;
      if(MATCH.sawSel&&MATCH.sawCombatSel) break;
    }
  }
  if(typeof activePlatoon==='number'&&activePlatoon>=0&&ctrlGroups[activePlatoon]&&groupLive(ctrlGroups[activePlatoon]).length)
    MATCH.sawPlatoon=true;
  if(typeof orderConfirm!=='undefined'&&orderConfirm)MATCH.sawFormation=true;
  if(MATCH.scoutIdx>=0&&MATCH.scoutStart&&ualive[MATCH.scoutIdx]&&
     Math.hypot(ux[MATCH.scoutIdx]-MATCH.scoutStart.x,uy[MATCH.scoutIdx]-MATCH.scoutStart.y)>115)MATCH.sawScout=true;
  if(typeof abCool!=='undefined'){
    for(var k=0;k<abCool.length;k++){
      if(abCool[k]>(MATCH.lastAbCool[k]||0)+0.01) MATCH.usedAbility=true;
      MATCH.lastAbCool[k]=abCool[k];
    }
  }
}

/* ---------------------------------------------------------------------------
   TUTORIAL ENGINE
   --------------------------------------------------------------------------- */
function beginRun(){
  buildDOM();
  TUT.active=true;
  TUT.graduated=false;
  TUT.stepIdx=0;
  TUT.shownStepIdx=-1;
  TUT.doneFlags=STEPS.map(function(){ return false; });
  MATCH.sawSel=false;MATCH.sawCombatSel=false;MATCH.sawMove=false;MATCH.sawQueue=false;MATCH.sawCamera=false;
  MATCH.sawPickup=false;MATCH.sawPlatoon=false;MATCH.sawFormation=false;MATCH.sawAttackMove=false;MATCH.sawScout=false;MATCH.sawRetreat=false;
  MATCH.territoryAck=false;MATCH.objectiveAck=false;MATCH.cloudAck=false;MATCH.usedAbility=false;
  MATCH.startCombat=combatCount();MATCH.pickup=null;MATCH.scoutIdx=-1;MATCH.scoutStart=null;
  MATCH.cameraBase={yaw:yawTarget,pitch:pitchTarget,span:orthoSpan};
  MATCH.lastAbCool=(typeof abCool!=='undefined')?abCool.slice():[0,0,0,0];
  queue.length=0;
  speak(GREETING,5.5,'greeting','greeting');
}
function evalSteps(){
  if(!TUT.active) return;
  for(var i=0;i<STEPS.length;i++){
    if(TUT.doneFlags[i]) continue;
    var ok=false;
    try{ ok=!!STEPS[i].test(); }catch(e){ ok=false; }
    if(ok){
      TUT.doneFlags[i]=true;
      if(i===TUT.stepIdx) speak(STEPS[i].done,3.8,'done','done_'+STEPS[i].id);
    }
  }
  while(TUT.stepIdx<STEPS.length && TUT.doneFlags[TUT.stepIdx]) TUT.stepIdx++;
  var progressMeta=tutMeta();
  if(TUT.stepIdx>(progressMeta.progress|0)){
    progressMeta.progress=TUT.stepIdx;
    if(typeof metaSave==='function') metaSave();
  }
  if(TUT.stepIdx>=STEPS.length){
    if(!TUT.graduated){
      TUT.graduated=true; TUT.active=false;
      var M=tutMeta(); M.done=true; M.skipped=false; M.version=GUIDE_VERSION;
      M.progress=STEPS.length;
      restingText=''; restingTag=''; restingId='';
      speak(GRADUATION,6.5,'graduation','graduation');
      if(typeof sfx==='function'){ try{ sfx('level'); }catch(e){} }
      if(TUT.trainingMode&&!TUT.finishTimer) TUT.finishTimer=setTimeout(finishTrainingMission,1300);
      else if(typeof metaSave==='function') metaSave();
    }
    return;
  }
  var cur=STEPS[TUT.stepIdx];
  restingText=cur.say;
  restingId='step_'+cur.id;
  restingTag=(cur.icon||'◇')+'  STEP '+(TUT.stepIdx+1)+' / '+STEPS.length;
  if(TUT.shownStepIdx!==TUT.stepIdx){
    TUT.shownStepIdx=TUT.stepIdx;
    speak(cur.say,5.5,'step',restingId);
  }
}
/* SKIP ends GUIDANCE. In a training MATCH it also ends the match — and it
   used to do that on a single tap of a 9px transparent label sitting on the
   guidance bar for the whole session, with no confirmation and no undo. The
   deliberate way out (pause > ABANDON MATCH) has always asked first; the
   accidental way out did not. Same question, same wording, before anything is
   thrown away. Guidance-only skips stay instant: nothing is lost. */
function tutSkip(){
  if(!TUT.active) return;
  var liveTraining=TUT.trainingMode&&(typeof running!=='undefined'&&running)&&
                   !(typeof gameEnded!=='undefined'&&gameEnded);
  if(liveTraining&&!tutSkipConfirmed&&typeof accConfirm==='function'){
    accConfirm('Leave training and return to the menu? This operation grants no payout.',
      function(){ tutSkipConfirmed=true; tutSkip(); tutSkipConfirmed=false; });
    return;
  }
  TUT.active=false;
  var wasTraining=TUT.trainingMode;
  var M=tutMeta(); M.skipped=true; M.version=GUIDE_VERSION;
  queue.length=0;
  restingText=''; restingTag=''; restingId='';
  clearFocus();
  if(wasTraining){
    TUT.trainingMode=false; trainingLaunched=false; restoreTrainingConfig();
    if(typeof metaSave==='function') metaSave();
    if(typeof returnToMainMenu==='function') returnToMainMenu();
  } else if(typeof metaSave==='function') metaSave();
  speak(SKIP_LINE,4.0,'skip','skip');
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
}

/* ---------------------------------------------------------------------------
   REACTIVE NARRATION — beyond the tutorial. Sparse on purpose: each of these
   fires at most once per match. The mechanical coach in hud.js already tells
   the player WHAT to fix (low energy, low mass); these only ever react to
   what just happened, and never repeat that advice.
   --------------------------------------------------------------------------- */
function checkReactive(){
  /* KEEL is the Tutorial guide, not the selected battlefield commander.
     Standard/Campaign radio belongs to the chosen faction commander. */
  if(!TUT.trainingMode) return;
  if(typeof running==='undefined'||!running) return;
  if(typeof demoMode!=='undefined'&&demoMode) return;
  /* Nothing here is meaningful before the HQ is actually down — there is no
     base to attack, no grid to stall, no wave to mass against. Gating on
     matchLive (rather than just `running`) also means any state left over
     from the tail of a PREVIOUS match — a grid still reading "stalled" in
     the last instant before defeat — has already decayed by the time it
     could matter again, instead of firing a premature bark during the next
     drop before the player has even landed. */
  if(typeof matchLive==='undefined'||!matchLive) return;
  if(typeof alarmT!=='undefined' && alarmT>0 && alarmT!==REACT.lastAlarmT){
    REACT.lastAlarmT=alarmT;
    /* pick() throws the chosen index away, and the index is exactly what the
       voice key needs — the two variants are two separate recordings. Indexed
       inline rather than changing pick(), which has other callers. */
    if(!REACT.baseAttack){ REACT.baseAttack=true;
      var bi=(Math.random()*BASE_ATTACK_LINES.length)|0;
      speak(BASE_ATTACK_LINES[bi],5.0,'reactive','react_base_attack'+bi); }
  }
  if(typeof stallE!=='undefined'){
    var nowStall=stallE>0;
    if(nowStall && !REACT.lastStallE && !REACT.lowPower){ REACT.lowPower=true; speak(LOW_POWER_LINE,4.6,'reactive','react_low_power'); }
    REACT.lastStallE=nowStall;
  }
  if(typeof HAZ!=='undefined'){
    var nowWarn=HAZ.warn>0;
    if(nowWarn && !REACT.lastHazWarn && !REACT.hazard){
      REACT.hazard=true;
      var key=(typeof curMap!=='undefined')?curMap:'';
      /* HAZARD_LINES._default is keyed with a leading underscore so it cannot
         collide with a map id; the rendered take is plain `react_hazard_default`.
         Guard the underscore explicitly — a map literally named "_default" would
         otherwise ask for a take that was never rendered. */
      var hk=(key&&key.charAt(0)!=='_'&&HAZARD_LINES[key])?key:'default';
      speak(HAZARD_LINES[key]||HAZARD_LINES._default,5.2,'reactive','react_hazard_'+hk);
    }
    REACT.lastHazWarn=nowWarn;
  }
  if(typeof stats!=='undefined' && stats.kills && !REACT.unitLost && ((stats.kills[1]|0)+(stats.kills[2]|0))>0){
    REACT.unitLost=true;
    var ui=(Math.random()*UNIT_LOST_LINES.length)|0;
    speak(UNIT_LOST_LINES[ui],4.2,'reactive','react_unit_lost'+ui);
  }
  if(typeof AI!=='undefined'){
    if(AI.warned && !REACT.lastWarned && !REACT.wave){ REACT.wave=true; speak(WAVE_LINE,5.0,'reactive','react_wave'); }
    REACT.lastWarned=!!AI.warned;
  }
}

/* ---------------------------------------------------------------------------
   MATCH-START DETECTION — the carrier goes active/phase 0 exactly once per
   drop (see newSkirmish() in src/main.js), so that edge is what arms a fresh
   run and resets every once-per-match latch. Polled, not hooked: this file
   never touches newSkirmish itself. */
function onNewMatchBegin(){
  REACT.baseAttack=false; REACT.lowPower=false; REACT.hazard=false; REACT.unitLost=false; REACT.wave=false;
  REACT.lastAlarmT=(typeof alarmT!=='undefined')?alarmT:0;
  REACT.lastStallE=false; REACT.lastHazWarn=false; REACT.lastWarned=false;
  MATCH.sawSel=false;MATCH.sawCombatSel=false;MATCH.sawMove=false;MATCH.sawQueue=false;MATCH.sawCamera=false;
  MATCH.sawPickup=false;MATCH.sawPlatoon=false;MATCH.sawFormation=false;MATCH.sawAttackMove=false;MATCH.sawScout=false;MATCH.sawRetreat=false;
  MATCH.territoryAck=false;MATCH.objectiveAck=false;MATCH.cloudAck=false;MATCH.usedAbility=false;
  MATCH.startCombat=combatCount();MATCH.pickup=null;MATCH.scoutIdx=-1;MATCH.scoutStart=null;
  MATCH.cameraBase={yaw:yawTarget,pitch:pitchTarget,span:orthoSpan};
  MATCH.lastAbCool=(typeof abCool!=='undefined')?abCool.slice():[0,0,0,0];
  if(TUT.trainingMode&&!TUT.active){ TUT.forceNext=false; beginRun(); }
}
function detectMatchEdge(){
  var dropping=(typeof carrier!=='undefined')&&carrier.active&&carrier.phase===0;
  if(dropping&&!prevDropping) onNewMatchBegin();
  prevDropping=dropping;
}

function tutTick(){
  try{
    detectMatchEdge();
    trackMatchSignals();
    trainingSafety();
    if(TUT.active) evalSteps();
    checkReactive();
    pump();
    /* A carrier/menu transition can hide KEEL while its speech queue is still
       holding the current line. TUT.active is the authoritative mission state,
       so never leave an active training objective visually absent just because
       the voice pump is between messages. */
    if(TUT.active&&restingText) showWrap(false);
    syncFocus();
    updateTrainingEntry();
    /* A carrier transition, a modal, or opening an interface briefly changes
       `running` in some mobile builds. Treating that as an abort was the
       reason a tap in training could silently throw the player to the menu.
       Training now ends only through Skip, completion, or the explicit return
       to main-menu transaction below. */
  }catch(e){ if(window.console) console.error('tutorial tick',e); }
}

/* ---------------------------------------------------------------------------
   TRAINING OPERATION — an explicit, safe mission. Normal PLAY never inherits
   these rules: every changed session field is snapshotted before launch and
   restored on completion, skip, or an early return to the main menu.
   --------------------------------------------------------------------------- */
var TRAINING_REWARD=150;
function saveTrainingConfig(){
  trainingPrev={difficulty:difficulty,defenseFocus:defenseFocus,infestationOn:infestationOn,
    wcChoice:wcChoice,goalSel:goalSel,timeLimit:timeLimit,resPace:resPace,crateRate:crateRate,
    curMap:curMap,curTheme:curTheme,aiFactionSel:aiFactionSel,playerStartZone:playerStartZone,
    activeWarMode:typeof activeWarMode==='string'?activeWarMode:'standard',
    aiSlots:aiSlots.map(function(A){return {on:!!A.on,diff:A.diff|0,zone:A.zone,ally:!!A.ally,behavior:A.behavior||'balanced'};}),
    opmods:Object.assign({},META.opmods||{}),threatSel:META.threatSel};
}
function restoreTrainingConfig(){
  if(!trainingPrev) return;
  difficulty=trainingPrev.difficulty; defenseFocus=trainingPrev.defenseFocus;
  infestationOn=trainingPrev.infestationOn; wcChoice=trainingPrev.wcChoice;
  goalSel=trainingPrev.goalSel; timeLimit=trainingPrev.timeLimit;
  resPace=trainingPrev.resPace; crateRate=trainingPrev.crateRate;
  curMap=trainingPrev.curMap; curTheme=trainingPrev.curTheme;
  aiFactionSel=trainingPrev.aiFactionSel; playerStartZone=trainingPrev.playerStartZone;
  if(typeof activeWarMode!=='undefined') activeWarMode=trainingPrev.activeWarMode||'standard';
  for(var i=0;i<aiSlots.length;i++){
    var A=trainingPrev.aiSlots[i]; if(!A) continue;
    aiSlots[i].on=A.on; aiSlots[i].diff=A.diff; aiSlots[i].zone=A.zone;aiSlots[i].ally=!!A.ally;aiSlots[i].behavior=A.behavior||'balanced';
  }
  META.opmods=trainingPrev.opmods; META.threatSel=trainingPrev.threatSel;
  trainingPrev=null;
}
function cancelTrainingMission(){
  if(!TUT.trainingMode&&!trainingPrev) return;
  TUT.trainingMode=false; trainingLaunched=false; TUT.active=false; TUT.finishTimer=0;
  queue.length=0; restingText=''; restingTag=''; restingId=''; clearFocus(); hideWrap();
  document.body.classList.remove('trainingOperation');
  restoreTrainingConfig();
  /* Recover old OTA saves that retained trainingMode after losing the borrowed
     config snapshot; an invisible training mode must never reach Standard. */
  if(typeof activeWarMode!=='undefined'&&activeWarMode==='training') activeWarMode='standard';
  updateTrainingEntry();
}
function trainingStepId(){
  return TUT.active&&STEPS[TUT.stepIdx]?STEPS[TUT.stepIdx].id:'';
}
function ensureTrainingPickup(){
  if(MATCH.sawPickup||(MATCH.pickup&&crates.indexOf(MATCH.pickup)>=0))return;
  var H=playerBld('hq');if(!H||typeof spawnCrate!=='function')return;
  var C=spawnCrate(H.x+155,H.y-55,'supply');
  C.alt=0;C.seen=true;C.t=0;C.site=true;C.siteName='TRAINING CACHE';C.announced=true;
  MATCH.pickup=C;
  if(typeof mmPing==='function')mmPing(C.x,C.y);
}
function ensureTrainingScout(){
  if(MATCH.scoutIdx>=0&&ualive[MATCH.scoutIdx])return;
  var H=playerBld('hq'),ty=-1;if(!H)return;
  for(var i=0;i<TYPES.length;i++)if(TYPES[i]&&TYPES[i].scout){ty=i;break;}
  if(ty<0)return;
  var u=spawnUnit(ty,0,H.x+95,H.y+55);if(u<0)return;
  clearSel();usel[u]=1;MATCH.scoutIdx=u;MATCH.scoutStart={x:ux[u],y:uy[u]};
  updateSelInfo();cam.x=ux[u];cam.y=uy[u];clampCam();camUpdateMatrices();
  toast('⌾ TRAINING SCOUT DEPLOYED — move it into black fog');
}
function trainingSafety(){
  if(!TUT.trainingMode||typeof running==='undefined'||!running||typeof matchLive==='undefined'||!matchLive) return;
  /* No scripted ambush while the player is reading. The enemy still builds a
     visible base and army, but its attack clocks remain parked until training
     completes. A resource floor prevents one mistaken duplicate placement from
     making the required lesson unaffordable. */
  if(typeof AI!=='undefined'){
    AI.waveTimer=Math.max(AI.waveTimer||0,300); AI.harassTimer=Math.max(AI.harassTimer||0,300); AI.warned=false;
  }
  /* A FLOOR, not income - econFloorBanks says so in its name and keeps the
     Math.min(cap,Math.max(cur,floor)) arithmetic verbatim. */
  if(typeof econFloorBanks==='function') econFloorBanks(620,2200);

  if(typeof heroIdx==='number'&&heroIdx>=0&&ualive[heroIdx]) uhp[heroIdx]=Math.max(uhp[heroIdx],uhpm[heroIdx]*.72);
  var H=playerBld('hq'); if(H) H.hp=Math.max(H.hp,H.hpm*.75);
  var step=trainingStepId();
  if(step==='pickup')ensureTrainingPickup();
  if(step==='fog')ensureTrainingScout();
  if(step==='tech'&&typeof heroLvl==='number')heroLvl=Math.max(heroLvl,3);
}
function startTrainingMission(){
  if(typeof running!=='undefined'&&running){ toast('Leave the current battle before starting training'); return; }
  if(!trainingPrev) saveTrainingConfig();
  difficulty=0; defenseFocus=0; infestationOn=false; wcChoice=0;
  goalSel='annihilate'; timeLimit=0; resPace=1; crateRate=1;
  curMap='vanguard'; curTheme='verdant'; aiFactionSel='legion'; playerStartZone='sw';
  aiSlots[0].on=true; aiSlots[0].diff=0; aiSlots[0].zone='ne';aiSlots[0].ally=false;aiSlots[0].behavior='balanced';
  for(var i=1;i<aiSlots.length;i++){aiSlots[i].on=false;aiSlots[i].ally=false;aiSlots[i].behavior='balanced';}
  META.opmods={}; META.threatSel=1;
  var M=tutMeta(); M.skipped=false;
  TUT.trainingMode=true; TUT.forceNext=true; TUT.finishTimer=0; trainingLaunched=false;
  /* Training is a real dedicated mode, not a Standard match with tutorial
     chrome painted over it. The saved mode is restored by the same transaction
     as the fixed map/rules, so reward and menu state cannot misclassify it. */
  if(typeof activeWarMode!=='undefined') activeWarMode='training';
  buildDOM(); document.body.classList.add('trainingOperation');
  /* The menu diorama can also animate a phase-0 carrier. Reset the edge latch
     before newSkirmish so that decorative drop cannot consume the real
     Training Operation's start signal. */
  prevDropping=false;
  if(typeof initAudio==='function') initAudio();
  if(typeof hideFrontScreens==='function') hideFrontScreens();
  var load=document.getElementById('loadScr'); if(load) load.style.display='flex';
  requestAnimationFrame(function(){requestAnimationFrame(function(){
    applyTheme(); newSkirmish();fogOn=true;updateFog();trainingLaunched=true;
    /* The carrier edge is also observed by the normal polling path, but a
       loaded/fast device can advance the drop state between two 350ms polls.
       Training launch is the authoritative transaction, so arm guidance here
       and let the edge detector's !active guard avoid a second reset. */
    if(!TUT.active){TUT.forceNext=false;beginRun();}
    if(load) load.style.display='none';
    /* The loader counted as a front screen during the first layout. Recompute
       now so the dedicated Tutorial exposes KEEL and its deployment HUD. */
    if(typeof stopAttract==='function') stopAttract();
    if(typeof mfFlowLayout==='function') mfFlowLayout();
    toast('TRAINING OPERATION — war table skipped; threat paused while KEEL guides you');
  });});
}
function finishTrainingMission(){
  TUT.finishTimer=0;
  if(!TUT.trainingMode) return;
  var M=tutMeta(),reward=(M.rewardedVersion|0)<GUIDE_VERSION?TRAINING_REWARD:0;
  M.done=true; M.skipped=false; M.version=GUIDE_VERSION;
  M.progress=STEPS.length;
  if(reward){ metaGrantCores(reward,'training_reward','training:'+GUIDE_VERSION); M.rewardedVersion=GUIDE_VERSION; }
  TUT.trainingMode=false; trainingLaunched=false; TUT.active=false;
  document.body.classList.remove('trainingOperation');
  clearFocus(); restoreTrainingConfig();
  if(typeof metaSave==='function') metaSave();
  if(typeof renderMetaHead==='function') renderMetaHead();
  if(typeof gameEnded!=='undefined') gameEnded=true;
  if(typeof paused!=='undefined') paused=false;
  if(typeof running!=='undefined') running=false;
  var title=document.getElementById('goTitle'); if(title){title.textContent='TRAINING COMPLETE';title.style.color='#9fffc4';}
  var out=document.getElementById('goOutcome'); if(out) out.textContent='FIELD ORIENTATION · ALL '+STEPS.length+' OBJECTIVES COMPLETE';
  var gs=document.getElementById('goStats');
  if(gs) gs.innerHTML='<div class="goStatGrid"><div><b>'+STEPS.length+' / '+STEPS.length+'</b><span>OBJECTIVES</span></div>'
    +'<div><b>'+((stats&&stats.built&&stats.built[0])|0)+'</b><span>STRUCTURES BUILT</span></div>'
    +'<div><b>'+((stats&&stats.t)|0)+'s</b><span>TRAINING TIME</span></div>'
    +'<div><b>READY</b><span>FIELD STATUS</span></div></div>';
  var rw=document.getElementById('goRewards');
  if(rw) rw.innerHTML='<section class="goSection"><h3>TRAINING PAYOUT</h3><div class="goPayout">'
    +'<div><b>+'+reward+'</b><span>⬡ CORES</span></div><div><b>COMPLETE</b><span>KEEL ORIENTATION</span></div></div>'
    +'<div class="goNotice good">NORMAL SKIRMISHES ARE NOW READY · REPLAY ANY TIME FROM SETTINGS OR OPERATIONS</div></section>';
  if(typeof drawMatchChart==='function') drawMatchChart();
  var go=document.getElementById('gameOver'); if(go) go.style.display='flex';
  if(typeof sfx==='function'){ try{sfx('level');}catch(e){} }
  updateTrainingEntry();
}

function needsTraining(){
  var M=tutMeta(); return !M.skipped&&(!M.done||(M.version|0)<GUIDE_VERSION);
}
function trainingUiState(){
  var M=tutMeta(),done=!!M.done&&(M.version|0)>=GUIDE_VERSION,
      active=!!TUT.trainingMode&&!!TUT.active&&typeof running!=='undefined'&&!!running,
      progress=done?STEPS.length:(active?TUT.stepIdx:Math.min(STEPS.length-1,M.progress|0)),
      interrupted=!done&&!active&&(progress>0||!!M.skipped),rewarded=(M.rewardedVersion|0)>=GUIDE_VERSION;
  return {done:done,active:active,interrupted:interrupted,progress:progress,rewarded:rewarded,
    state:done?'COMPLETED · REPLAYABLE':active?'TRAINING PAUSED · RESUMABLE':interrupted?'INCOMPLETE · RESTARTABLE':'RECOMMENDED · SKIPS WAR TABLE',
    action:done?'↻ REPLAY TRAINING':active?'▶ RESUME TRAINING':interrupted?'↻ RESTART TRAINING':'▶ START TRAINING'};
}
function updateTrainingEntry(){
  var S=trainingUiState();
  /* The training card's label and state line come from trainingUiState(), the
     same source the Operations card reads, so the two can never disagree. The
     old 350 ms poll rebuilt `#warGrid` unconditionally; if that landed between
     a card's pointerdown and pointerup, mfBindTap's press record disappeared
     and the card silently did nothing. Refresh only when its rendered state
     changed, preserving the live control and its accessibility semantics
     through ordinary taps. */
  var wr=document.getElementById('warScr'),grid=document.getElementById('warGrid');
  var warSig=[S.done,S.active,S.interrupted,S.progress,S.rewarded,S.state,S.action].join(':');
  if(wr&&wr.style.display&&wr.style.display!=='none'&&typeof renderWarRoom==='function'
     &&(!grid||grid.dataset.mfTrainingSig!==warSig)) renderWarRoom();
  var op=document.getElementById('keelTrainingOp'),sig=[S.done,S.active,S.interrupted,S.progress,S.rewarded].join(':');
  if(op&&op.dataset.stateSig!==sig) appendTrainingOperation();
}
function openTrainingBrief(){
  if(typeof renderOps==='function') renderOps();
  if(typeof showFrontScreen==='function') showFrontScreen('opsScr');
  var ops=document.getElementById('opsScr');
  if(ops&&typeof mfSetTabs==='function') mfSetTabs(ops,'threat',false);
  var sc=ops&&ops.querySelector('.opsScroll'); if(sc) sc.scrollTop=0;
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
}
function resumeTrainingMission(){
  var S=trainingUiState();
  if(!S.active){ startTrainingMission(); return; }
  if(typeof hideFrontScreens==='function') hideFrontScreens();
  var po=document.getElementById('pauseOverlay'); if(po) po.style.display='none';
  if(typeof paused!=='undefined') paused=false;
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
}
function ensureTrainingEntry(){
  /* The old entry was an identity CARD inserted BEFORE #startBtn, so the first
     thing on the menu was a training advert and PLAY got pushed down the screen
     behind it. Training is one destination, not a banner: it is now a single
     dedicated button sitting directly UNDER PLAY, styled as a peer of it
     (.mbtn.alt) so the two read as one primary + one secondary action.
     openTrainingBrief() is still reachable from Operations and Settings. */
  /* Training is a WAR ROOM card now, not a menu button — the menu is back to a
     single primary control. Both of this function's older entries (the identity
     callout above PLAY, and the standalone #trainBtn below it) are torn down
     here so an OTA patch landing on either shell converges on the same menu. */
  var stale=document.getElementById('keelTrainingCallout'); if(stale) stale.remove();
  var oldBtn=document.getElementById('trainBtn'); if(oldBtn) oldBtn.remove();
  updateTrainingEntry();
}
function appendTrainingOperation(){
  var pane=document.getElementById('opsPane-threat'); if(!pane) return;
  var old=document.getElementById('keelTrainingOp'); if(old) old.remove();
  var S=trainingUiState(),nova=typeof facArt==='function'?facArt('nova'):null,
      commander=(nova&&nova.cdr)||'Captain Elara Kai',progressPct=Math.round(S.progress/STEPS.length*100),
      rewardText=S.rewarded?'FIRST-CLEAR REWARD CLAIMED':'FIRST CLEAR · +'+TRAINING_REWARD+' ⬡ CORES';
  var d=document.createElement('article'); d.id='keelTrainingOp';
  d.className='keelTrainingOp'+(S.done?' done':'')+(S.active?' active':'');
  d.dataset.stateSig=[S.done,S.active,S.interrupted,S.progress,S.rewarded].join(':');
  d.dataset.progress=String(S.progress);
  d.innerHTML='<header class="ktoHead"><span>'+S.state+'</span><b>'+rewardText+'</b></header>'
    +'<div class="ktoHero"><div class="ktoPortrait"><img src="./assets/factions/nova_192.jpg" alt="'+commander+', Nova commander">'
      +'<span>'+(typeof facIcon==='function'?facIcon('nova',38,'ktoCrestImg'):'✦')+'</span></div>'
      +'<div class="ktoIdentity"><small>TRAINING OPERATION 01</small><b>FIELD ORIENTATION</b>'
      +'<i>'+commander+' · KEEL tactical guidance</i>'
      +'<p>A protected live-fire drop. Skips the galaxy war table and lands on a fixed training map with no early enemy rush.</p></div></div>'
    +'<div class="ktoTeach" aria-label="Training topics"><span>◇ CAMERA</span><span>⬡ ECONOMY</span><span>▣ PRODUCTION</span>'
      +'<span>➤ ORDERS</span><span>n/500 POP</span><span>⛨ DEFENCE</span><span>Ⅳ PLATOONS</span><span>⌾ SCOUTING</span>'
      +'<span>⌬ TECH</span><span>✦ POWERS</span><span>☁ SAVES</span></div>'
    +'<div class="ktoProgress"><div><span>OBJECTIVE PROGRESS</span><b>'+S.progress+' / '+STEPS.length+'</b></div>'
      +'<div class="ktoProgressTrack"><i style="width:'+progressPct+'%"></i></div>'
      +'<small>'+(S.done?'Orientation certified · replay does not repeat the first-clear reward':
                   S.active?'Current lesson: '+(STEPS[Math.min(TUT.stepIdx,STEPS.length-1)].id||'field systems').toUpperCase():
                   S.interrupted?'Previous best retained · a new drop restarts at camera control':STEPS.length+' guided objectives · progress is saved to this profile')+'</small></div>'
    +'<div class="ktoFacts"><div><b>'+STEPS.length+'</b><span>OBJECTIVES</span></div><div><b>EASY</b><span>FIXED OPPONENT</span></div>'
      +'<div><b>SAFE</b><span>NO INFESTATION</span></div></div>'
    +'<button class="ktoAction" type="button">'+S.action+'</button>';
  pane.insertBefore(d,pane.firstChild);
  var b=d.querySelector('button');
  var act=S.active?resumeTrainingMission:startTrainingMission;
  if(typeof mfBindTap==='function') mfBindTap(b,act); else b.addEventListener('click',act);
}

/* ---------------------------------------------------------------------------
   SETTINGS — a "Tutorial" row and a voice toggle, appended to #setList after
   renderSettings() (src/game/meta.js) rebuilds it. That function replaces
   #setList's entire innerHTML on every call — including every time a player
   flips ANY setting — so appending once at boot would vanish on the first
   unrelated toggle. Wrapping the function, the same way commander.js wraps
   econTick() and meta.js wraps heroXP(), means our row survives every
   rebuild without ever editing meta.js. */
function tutSettingsAction(){
  if(trainingUiState().active){
    resumeTrainingMission();
    return;
  }
  var midMatch=typeof running!=='undefined'&&running;
  if(midMatch){
    toast('Training is a separate operation — return to the main menu to replay it');
  } else {
    startTrainingMission();
  }
  if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
  if(midMatch&&typeof renderSettings==='function') renderSettings();
}
function appendTutorialSettingsRow(){
  var list=document.getElementById('setList');
  if(!list) return;
  var M=tutMeta();
  var status=TUT.active? ('Training in progress — step '+(TUT.stepIdx+1)+' of '+STEPS.length)
             : M.done? 'Completed'
             : M.skipped? 'Skipped'
             : 'Not started yet';
  var label=trainingUiState().active?'▶ RESUME':(!M.done&&!M.skipped&&!TUT.active)? '▶ START' : '↺ REPLAY';
  var row=document.createElement('div');
  row.className='sItem setRow';
  row.id='keelSetRow';
  row.setAttribute('role','button');
  row.setAttribute('tabindex','0');
  row.innerHTML='<div class="sTx"><b>🎓 Training Operation</b><div class="sDs">'+status+' — skips the war table; protected mission with guided controls</div></div>'
    +'<div class="sBuy">'+label+'</div>';
  var act=function(ev){ if(ev){ ev.preventDefault(); } tutSettingsAction(); };
  row.addEventListener('pointerdown',act);
  row.addEventListener('keydown',function(ev){ if(ev.key==='Enter'||ev.key===' ') act(ev); });
  list.appendChild(row);

  var vOn=!!(typeof META!=='undefined'&&META.settings&&META.settings.tutorialVoice);
  var vrow=document.createElement('div');
  vrow.className='sItem setRow';
  vrow.setAttribute('role','button');
  vrow.setAttribute('tabindex','0');
  vrow.innerHTML='<div class="sTx"><b>🔊 KEEL Voice</b><div class="sDs">Speak tutorial lines aloud, if your device supports it</div></div>'
    +'<div class="sBuy togB'+(vOn?' onT':'')+'">'+(vOn?'ON':'OFF')+'</div>';
  var vact=function(ev){
    if(ev){ ev.preventDefault(); }
    if(typeof META==='undefined'||!META.settings) return;
    META.settings.tutorialVoice=!META.settings.tutorialVoice;
    if(typeof metaSave==='function') metaSave();
    if(typeof sfx==='function'){ try{ sfx('ui'); }catch(e){} }
    if(typeof renderSettings==='function') renderSettings();
  };
  vrow.addEventListener('pointerdown',vact);
  vrow.addEventListener('keydown',function(ev){ if(ev.key==='Enter'||ev.key===' ') vact(ev); });
  list.appendChild(vrow);
}
if(typeof renderSettings==='function'){
  var _keelRenderSettings=renderSettings;
  renderSettings=function(){
    _keelRenderSettings();
    appendTutorialSettingsRow();
  };
}

/* ---------------------------------------------------------------------------
   BOOT
   --------------------------------------------------------------------------- */
function initTutorial(){
  if(window.__keelInit) return;
  window.__keelInit=true;
  buildDOM();
  ensureTrainingEntry();
  if(typeof renderOps==='function'&&!window.__keelOpsWrapped){
    window.__keelOpsWrapped=true;
    var _keelRenderOps=renderOps;
    renderOps=function(){ _keelRenderOps(); appendTrainingOperation(); };
    appendTrainingOperation();
  }
  if(typeof orderMove==='function'&&!window.__keelMoveWrapped){
    window.__keelMoveWrapped=true;
    var _keelOrderMove=orderMove;
    orderMove=function(wx,wy,patrol,retreat){
      var combat=hasSelectedCombatUnit(),formationDone=MATCH.sawFormation,attackMode=typeof moveMode==='undefined'||!moveMode,
          ok=_keelOrderMove(wx,wy,patrol,retreat);
      /* Retreat is the one order the player cannot reach from a button, so
         it is credited from any live selection rather than a combat-only
         one — the Commander breaking off counts as having learned it. */
      if(ok&&retreat&&!patrol) MATCH.sawRetreat=true;
      if(ok&&combat&&!patrol){
        MATCH.sawMove=true;
        /* The formation release itself also calls orderMove. Requiring a
           formation observed on an earlier poll ensures the next deliberate
           map tap teaches attack-move instead of silently auto-completing. */
        if(formationDone&&attackMode&&!retreat)MATCH.sawAttackMove=true;
      }
      return ok;
    };
  }
  if(typeof applyCrate==='function'&&!window.__keelPickupWrapped){
    window.__keelPickupWrapped=true;
    var _keelApplyCrate=applyCrate;
    applyCrate=function(k,x,y){
      var out=_keelApplyCrate(k,x,y);
      if(TUT.trainingMode)MATCH.sawPickup=true;
      return out;
    };
  }
  setInterval(tutTick,350);
}
window.initTutorial=initTutorial;
/* Main-menu and War Room navigation own application-level entry/exit
   transactions. This file is intentionally scoped in an IIFE, so expose the
   small public bridge explicitly: otherwise meta.js' defensive typeof checks
   see no Training handlers at all and the card silently does nothing. */
window.cancelTrainingMission=cancelTrainingMission;
window.trainingMissionActive=function(){return !!(TUT.trainingMode||trainingPrev);};
window.trainingUiState=trainingUiState;
window.resumeTrainingMission=resumeTrainingMission;
/* Inspection hook for automated verification — read-only, harmless to leave
   wired for real players (no different from any other console-reachable
   global in this codebase). */
window.__tutDebug=function(){ return {TUT:TUT,MATCH:MATCH,REACT:REACT,STEPS:STEPS,
  needsTraining:needsTraining(),startTraining:startTrainingMission,
  /* The voice plumbing lives inside this IIFE, so verifykeen.mjs cannot reach
     speak()/keenLineId()/pump() any other way. Read-only handles, no state. */
  speak:speak,pump:pump,queue:queue,voiceOn:voiceOn,keenLineId:keenLineId,
  speakVoice:speakVoice,beginRun:beginRun,
  keenKey:function(kind,id){ return 'vo_keen_'+keenLineId(kind,id); }}; };

})();

