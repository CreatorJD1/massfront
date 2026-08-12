;
;
/* ============================================================================
   HUD TRAFFIC CONTROL — one owner for everything that pops up mid-battle
   ----------------------------------------------------------------------------
   THE PROBLEM (owner report): during a busy fight the screen fills with banners
   that were each positioned correctly in isolation and were never told about
   each other. Every transient element in this game hard-codes an absolute
   offset from the top of the screen:

       #goalBar      sat + 36      #coach        sat + 150
       #atkAlert     sat + 108     #mfMassAlert  sat + 158   (injected from JS)
       #waveAlert    sat + 108     #toast        sat + 182
       #unitCard     sat + 190     #keelWrap     sat + 204

   #atkAlert and #waveAlert literally share one anchor; the only thing keeping
   them apart is a `.withAttack` class that #waveAlert sets by *reading the
   inline display style of #atkAlert*. #mfMassAlert lands on top of that shifted
   position, wins on z-index, and has no media-query override at all. Portrait
   puts #heroBar and #wcRow on the same row on the same side. Each new banner
   added another hand-picked number to a stack nobody was measuring.

   THE FIX is two rules, applied by one owner:

     1. NOTHING OVERLAPS. Banners are laid out by MEASUREMENT, not by guesswork:
        walk the lane in priority order, place each visible element under the
        last one, using its real rendered height. New banners cost one line in
        MF_LANE and can never collide again, on any screen, in any orientation.

     2. NOTHING PILES UP. Non-overlapping is not the same as calm — five stacked
        banners is still five. The lane has a height budget. Over budget it
        tightens the low-priority entries, then squelches them, and a notice
        that gets squelched is pushed BACK ONTO THE QUEUE rather than lost.

   On top of the lane sits a notice director: one priority queue in front of
   toast() / radioNotice() / pickupToast(), which until now simply clobbered
   each other inside a single #toast element — a pickup could erase a warning
   0.2s after it appeared. Same line twice collapses to "x2" instead of
   replaying. Flavour chatter is dropped outright while the player is fighting.

   And the worst offender of all: showLevelUp() sets paused=true and takes the
   whole screen the instant the XP lands, which is by construction the middle of
   a firefight, because that is when XP lands. It now defers to a tappable chip
   and opens itself when the shooting stops.
   ============================================================================ */

/* Battle "heat", 0..1. Rises instantly, falls over ~6s, so the UI stays quiet
   through a lull inside a fight instead of flickering back to chatty. */
let mfFlowHeatV=0, mfFlowCalmT=0, mfFlowTickT=0, mfFlowLast=0, mfFlowRaf=0;

function mfFlowHeat(){ return mfFlowHeatV; }

function mfFlowVis(el){
  if(!el) return false;
  const cs=getComputedStyle(el);
  if(cs.display==='none'||cs.visibility==='hidden') return false;
  if(parseFloat(cs.opacity||'1')<0.04) return false;
  return el.getBoundingClientRect().height>2;
}
function mfFlowEl(id){ return document.getElementById(id); }

/* NO SESSION UI IN THE MENU, EVER.
   `body.menuMode` was the only thing suppressing battlefield chrome, and it is
   set by the attract/backdrop code — not by "a front screen is open". Any path
   that leaves a match running underneath an overlay (drop into Settings from
   pause, an alert that fires while the player is reading the Armory, a match
   restored under the start screen) leaked live HUD onto the menu: BASE UNDER
   ATTACK banners floating over the main menu, exactly as reported.
   FRONT_SCREEN_IDS is main.js's own list of what counts as "the menu", so this
   cannot drift away from the screens it is meant to cover. */
const MF_FRONT_FALLBACK=['startScreen','warScr','setupScr','devScr','opsScr','dailyScr',
  'dossierScr','inboxScr','updScr','profileScr','settingsScr','armory','loadScr'];
function mfFlowFrontOpen(){
  const ids=(typeof FRONT_SCREEN_IDS!=='undefined'&&FRONT_SCREEN_IDS.length)
    ? FRONT_SCREEN_IDS.concat('loadScr') : MF_FRONT_FALLBACK;
  for(const id of ids){
    const el=mfFlowEl(id);
    if(el&&getComputedStyle(el).display!=='none') return true;
  }
  return false;
}

/* Priority order IS the lane order. Lower number = closer to the top of the
   screen and last to be squelched when the lane runs out of room. */
const MF_LANE=[
  {id:'atkAlert',    pri:0},   /* a base is being destroyed right now          */
  {id:'waveAlert',   pri:1},   /* a wave is inbound, with a lane and a timer   */
  {id:'mfMassAlert', pri:2},   /* mass-airlift carrier inbound                 */
  {id:'keelWrap',    pri:3},   /* fixed commander/tutorial speech window       */
  {id:'mfChips',     pri:4},   /* deferred actions the player can take         */
  {id:'toast',       pri:5},   /* the command notice rail                      */
  {id:'coach',       pri:6},   /* economy coaching                             */
  {id:'unitCard',    pri:7},   /* intel card, tallest and least urgent         */
];
/* Which banners may be dropped when the lane runs out of room, and in which
   order. Note this is NOT the display order above: coaching goes first because
   it is advice, the notice rail goes second because its words return to the
   queue and get another turn, and everything else is either an emergency or
   something the player asked for by tapping. */
const MF_LANE_DROP={coach:1,toast:2};
/* The corner columns collide too: portrait moves #wcRow to the LEFT at
   sat+92 and leaves #heroBar at sat+92 on the same side. Same treatment. */
const MF_LANE_L=['wcRow','heroBar'];
const MF_LANE_R=['infMeter','godBadge'];

/* Place a box so its top edge lands at viewport Y, whatever its position mode
   or offset parent is. Measured, so it survives media queries and safe areas. */
function mfFlowPlace(el,y){
  const cs=getComputedStyle(el);
  const cur=parseFloat(cs.top);
  if(!isFinite(cur)){ el.style.position='fixed'; el.style.top=y+'px'; return; }
  const delta=el.getBoundingClientRect().top-cur;   /* offset-parent origin */
  const want=Math.round(y-delta);
  if(el._mfTop!==want){ el._mfTop=want; el.style.top=want+'px'; }
}
function mfFlowRelease(el){
  if(!el||el._mfTop===undefined) return;
  el._mfTop=undefined; el.style.removeProperty('top'); el.style.removeProperty('max-height');
  el.classList.remove('mfLaneTight');
}

function mfFlowLaneSide(ids,startY,gap){
  let y=startY;
  for(const id of ids){
    const el=mfFlowEl(id); if(!el) continue;
    /* An element that is merely invisible KEEPS its placement. Releasing it
       would drop it back to the stylesheet default for the one frame between
       "opacity goes to 1" and the next layout pass — a visible jump. */
    if(!mfFlowVis(el)) continue;
    mfFlowPlace(el,y);
    y+=el.getBoundingClientRect().height+gap;
  }
  return y;
}

/* The whole point: walk the lane and stack it. No element is ever asked where
   it thinks it should be. */
function mfFlowLayout(){
  mfFlowRaf=0;
  const body=document.body;
  /* One authoritative "the player is in the menu" state, whatever put them
     there. The class does the hiding (see ui.css); the early return hands every
     banner back to the stylesheet rather than pinning it to a lane origin
     measured from a top bar that is not on screen. Toggle only on change —
     writing the class unconditionally would retrigger our own body observer. */
  const menu=body.classList.contains('menuMode')||mfFlowFrontOpen();
  if(body.classList.contains('mfMenuOpen')!==menu) body.classList.toggle('mfMenuOpen',menu);
  if(menu){
    for(const s of MF_LANE) mfFlowRelease(mfFlowEl(s.id));
    for(const id of MF_LANE_L) mfFlowRelease(mfFlowEl(id));
    for(const id of MF_LANE_R) mfFlowRelease(mfFlowEl(id));
    return;
  }
  const vh=window.innerHeight||800;
  const tb=mfFlowEl('topbar');
  let head=tb&&mfFlowVis(tb)?tb.getBoundingClientRect().bottom:34;
  const gb=mfFlowEl('goalBar');
  if(gb&&mfFlowVis(gb)) head=Math.max(head,gb.getBoundingClientRect().bottom);

  /* Corner columns first — the centre lane must clear whichever is taller. */
  const lb=mfFlowLaneSide(MF_LANE_L,head+6,5);
  const rb=mfFlowLaneSide(MF_LANE_R,head+6,5);

  let y=Math.max(head,lb,rb)+8;
  const dock=mfFlowEl('cmdbar');
  const bottom=(dock&&mfFlowVis(dock)?dock.getBoundingClientRect().top:vh)-12;
  /* Two budgets, because they answer to different owners. Banners the GAME
     raised get the top ~38% and no more — that is the "overwhelmed" ceiling.
     The intel card the PLAYER tapped gets whatever is left down to the dock;
     squelching what someone just asked for is never the right answer. */
  const autoFloor=Math.min(y+vh*0.38,bottom);

  const live=[];
  for(const s of MF_LANE){
    const el=mfFlowEl(s.id);
    if(!el||!mfFlowVis(el)){ if(el) el.classList.remove('mfLaneTight'); continue; }
    live.push({s,el});
  }
  /* Three banners is the point at which a phone stops reading as a game and
     starts reading as an inbox. Past that, compress the soft ones. */
  const tight=live.length>2;
  for(const v of live) v.el.classList.toggle('mfLaneTight',tight&&v.s.pri>=4);

  let dropped=0;
  for(const v of live){
    if(v.s.id==='unitCard') continue;                 /* placed last, below */
    const h=v.el.getBoundingClientRect().height;
    if(y+h>autoFloor&&MF_LANE_DROP[v.s.id]){
      /* Out of room. Hide it the way its own owner would, so it genuinely is
         not on screen — a class that only zeroes opacity would still measure
         as present and the lane would oscillate between the two states. */
      dropped++;
      if(v.s.id==='toast'){ mfNoticeReturn(); mfNHold=true; }
      v.el.style.opacity=0;
      continue;
    }
    mfFlowPlace(v.el,y);
    y+=h+6;
  }
  /* The rail is allowed to speak again as soon as a banner-height gap exists. */
  if(mfNHold&&y+48<=autoFloor){ mfNHold=false; mfNoticeArm(); }

  const card=live.find(v=>v.s.id==='unitCard');
  if(card){
    card.el.style.maxHeight=Math.max(120,Math.round(bottom-y))+'px';
    mfFlowPlace(card.el,y);
    y+=card.el.getBoundingClientRect().height+6;
  }
  mfFlowOverflow(dropped,Math.min(y,bottom));
}
function mfFlowQueueLayout(){
  if(!mfFlowRaf) mfFlowRaf=requestAnimationFrame(mfFlowLayout);
}

/* A small honest marker, so a squelched banner is a decision the player can
   see rather than a message that silently never arrived. */
function mfFlowOverflow(n,y){
  let el=mfFlowEl('mfLaneMore');
  if(!n){ if(el) el.style.display='none'; return; }
  if(!el){
    el=document.createElement('div'); el.id='mfLaneMore';
    el.setAttribute('aria-live','polite');
    document.body.appendChild(el);
  }
  el.style.display='block';
  el.textContent='+'+n+' more';
  mfFlowPlace(el,y);
}

/* ---------------------------------------------------------------------------
   NOTICE DIRECTOR — one queue in front of the three functions that all write
   the same #toast element and used to overwrite each other mid-sentence.
   --------------------------------------------------------------------------- */
const MF_N_CRIT=0, MF_N_ORDER=1, MF_N_INFO=2, MF_N_CHAT=3;
const MF_N_MAXQ=4;
let mfNQ=[], mfNKey='', mfNPri=99, mfNUntil=0, mfNCount=1, mfNDrainT=0, mfNRender=null, mfNHold=false;
const MF_N_HISTORY_MAX=30;
let mfNHistory=[],mfNHistoryFilter='all';

/* FPS is diagnostic information, not a resource.  Older OTA shells still put
   it inside #topbar, where WebView flex layout reserves a full resource tile
   even when a newer stylesheet makes the counter visually tiny.  Reparenting
   keeps patched installs and fresh packages on the same layout. */
const mfFpsDiagnostic=mfFlowEl('fps');
if(mfFpsDiagnostic&&mfFpsDiagnostic.parentElement!==document.body){
  document.body.appendChild(mfFpsDiagnostic);
  mfFpsDiagnostic.setAttribute('aria-label','Optional frame-rate diagnostic');
}

function mfNoticeHistoryAdd(pri,key,label,channel){
  if(!label)return;
  const now=performance.now(),last=mfNHistory[0];
  if(last&&last.key===key&&now-last.t<5000){last.n++;last.t=now;}
  else mfNHistory.unshift({pri,key,label,channel:channel||'command',t:now,n:1});
  if(mfNHistory.length>MF_N_HISTORY_MAX)mfNHistory.length=MF_N_HISTORY_MAX;
  const count=mfFlowEl('noticeLogCount');if(count)count.textContent=Math.min(99,mfNHistory.length);
  const drawer=mfFlowEl('mfNoticeHistory');if(drawer&&drawer.style.display!=='none')mfNoticeHistoryRender();
}
function mfNoticeHistoryShell(){
  let el=mfFlowEl('mfNoticeHistory');if(el)return el;
  el=document.createElement('section');el.id='mfNoticeHistory';el.setAttribute('aria-label','Battle notification history');
  el.innerHTML='<header><div><small>BATTLEFIELD COMMS</small><b>EVENT FEED</b></div><button type="button" aria-label="Close event feed">×</button></header>'+ 
    '<nav><button data-f="all" class="on">ALL</button><button data-f="alert">ALERTS</button><button data-f="command">ORDERS</button><button data-f="radio">RADIO</button><button data-f="pickup">LOOT</button></nav><div class="mfNoticeList"></div>';
  document.body.appendChild(el);
  el.querySelector('header button').addEventListener('pointerdown',e=>{e.stopPropagation();mfNoticeHistoryClose();});
  el.querySelectorAll('nav button').forEach(b=>b.addEventListener('pointerdown',e=>{e.stopPropagation();mfNHistoryFilter=b.dataset.f;mfNoticeHistoryRender();}));
  return el;
}
function mfNoticeHistoryRender(){
  const el=mfNoticeHistoryShell(),list=el.querySelector('.mfNoticeList');list.innerHTML='';
  el.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.f===mfNHistoryFilter));
  const rows=mfNHistory.filter(n=>mfNHistoryFilter==='all'||n.channel===mfNHistoryFilter);
  if(!rows.length){const e=document.createElement('p');e.className='mfNoticeEmpty';e.textContent='No messages in this channel yet.';list.appendChild(e);return;}
  for(const N of rows){
    const row=document.createElement('div');row.className='mfNoticeItem p'+N.pri;
    const tag=document.createElement('i');tag.textContent=N.channel.toUpperCase();
    const msg=document.createElement('span');msg.textContent=N.label+(N.n>1?' ×'+N.n:'');
    row.append(tag,msg);list.appendChild(row);
  }
}
function mfNoticeHistoryOpen(){
  /* A battlefield feed is not a modal. Production, selection and camera input
     stay available around it while the player glances at recent events. */
  const el=mfNoticeHistoryShell();mfNoticeHistoryRender();el.style.display='flex';
  if(typeof sfx==='function')sfx('ui');
}
function mfNoticeHistoryClose(){const el=mfFlowEl('mfNoticeHistory');if(el)el.style.display='none';}

function mfNoticeBadge(){
  const el=mfFlowEl('toast'); if(!el) return;
  const old=el.querySelector('.mfNx'); if(old) old.remove();
  if(mfNCount<2) return;
  const b=document.createElement('i'); b.className='mfNx'; b.textContent='x'+mfNCount;
  el.appendChild(b);
}
function mfNoticeArm(){
  clearTimeout(mfNDrainT);
  mfNDrainT=setTimeout(mfNoticeDrain,Math.max(80,mfNUntil-performance.now()+70));
}
function mfNoticeShow(pri,key,dur,render,n){
  mfNKey=key; mfNPri=pri; mfNCount=n||1; mfNRender=render;
  mfNUntil=performance.now()+dur;
  render();
  mfNoticeBadge();
  mfFlowQueueLayout();
  mfNoticeArm();
}
function mfNoticeDrain(){
  mfNDrainT=0;
  if(mfNHold) return;                 /* the lane has no room; wait to be released */
  if(performance.now()<mfNUntil){ mfNoticeArm(); return; }
  mfNPri=99; mfNKey=''; mfNRender=null;
  const nxt=mfNQ.shift(); if(!nxt) return;
  /* A queued pleasantry that waited out a whole engagement is no longer news. */
  if(nxt.pri>=MF_N_INFO&&performance.now()-nxt.t>9000){ mfNoticeDrain(); return; }
  mfNoticeShow(nxt.pri,nxt.key,nxt.dur,nxt.render,nxt.n);
}
/* Called when the lane had no room for the rail: the message was never read,
   so it goes back to the front of the queue instead of evaporating. */
function mfNoticeReturn(){
  if(!mfNRender||mfNPri>=MF_N_CHAT) return;
  mfNQ.unshift({pri:mfNPri,key:mfNKey,dur:2000,render:mfNRender,t:performance.now(),n:mfNCount});
  if(mfNQ.length>MF_N_MAXQ) mfNQ.length=MF_N_MAXQ;
  mfNKey=''; mfNPri=99; mfNRender=null; mfNUntil=0;
  mfNoticeArm();
}
function mfNoticeSubmit(pri,key,dur,render,label,channel){
  mfNoticeHistoryAdd(pri,key,label,channel);
  const heat=mfFlowHeatV;
  if(pri>=MF_N_CHAT&&heat>0.55) return;    /* no loot flavour mid-firefight    */
  if(pri>=MF_N_INFO&&heat>0.85) return;    /* at full heat, only orders survive */
  if(heat>0.5) dur=Math.round(dur*0.72);   /* in a fight, say it faster         */
  const now=performance.now();
  if(key===mfNKey&&now<mfNUntil){          /* same line again — count it        */
    mfNCount++; mfNoticeBadge(); mfNUntil=now+dur; mfNoticeArm(); return;
  }
  if(!mfNHold&&(now>=mfNUntil||pri<mfNPri)){ mfNoticeShow(pri,key,dur,render,1); return; }
  const dup=mfNQ.find(q=>q.key===key);
  if(dup){ dup.n=(dup.n||1)+1; return; }
  mfNQ.push({pri,key,dur,render,t:now,n:1});
  mfNQ.sort((a,b)=>a.pri-b.pri||a.t-b.t);
  if(mfNQ.length>MF_N_MAXQ) mfNQ.length=MF_N_MAXQ;   /* drop the least urgent */
}

/* ---------------------------------------------------------------------------
   DEFERRED-ACTION CHIPS — a modal the player was not ready for becomes a pill
   they can tap when they are.
   --------------------------------------------------------------------------- */
const mfFlowChips={};
function mfFlowChipRail(){
  let r=mfFlowEl('mfChips');
  if(!r){ r=document.createElement('div'); r.id='mfChips'; document.body.appendChild(r); }
  return r;
}
function mfFlowChipSync(){
  const r=mfFlowChipRail(), ids=Object.keys(mfFlowChips);
  r.style.display=ids.length?'flex':'none';
  r.innerHTML='';
  for(const id of ids){
    const c=mfFlowChips[id];
    const b=document.createElement('button');
    b.type='button'; b.className='mfChip'; b.textContent=c.label;
    b.addEventListener('pointerdown',ev=>{ ev.preventDefault(); ev.stopPropagation();
      if(typeof sfx==='function') sfx('ui'); c.fn(); });
    r.appendChild(b);
  }
  mfFlowQueueLayout();
}
function mfFlowChip(id,label,fn){ mfFlowChips[id]={label,fn}; mfFlowChipSync(); }
function mfFlowChipClear(id){ if(mfFlowChips[id]){ delete mfFlowChips[id]; mfFlowChipSync(); } }

/* Is this a moment where taking the whole screen would be rude? */
function mfFlowModalBusy(){
  const body=document.body;
  if(body.classList.contains('menuMode')) return true;
  if(typeof running!=='undefined'&&!running) return true;
  for(const id of ['levelUp','gameOver','pauseOverlay','loadScr','dispatch','accDlg']){
    const el=mfFlowEl(id); if(el&&mfFlowVis(el)) return true;
  }
  if(typeof mfUiPanelOpen==='function'&&mfUiPanelOpen()) return true;
  if(typeof placing!=='undefined'&&placing) return true;
  if(typeof patrolDraft!=='undefined'&&patrolDraft) return true;
  return mfFlowHeatV>0.45;
}

/* ---------------------------------------------------------------------------
   TICK — heat, deferred modals, and a layout pass. 220ms: banners are not
   animation, and this must not cost anything on the render thread.
   --------------------------------------------------------------------------- */
function mfFlowTick(){
  const now=performance.now(), dt=Math.min(1,(now-(mfFlowLast||now))/1000);
  mfFlowLast=now;
  let target=0;
  if(mfFlowVis(mfFlowEl('atkAlert'))) target=Math.max(target,0.75);
  if(mfFlowVis(mfFlowEl('waveAlert'))) target=Math.max(target,0.5);
  if(typeof unitHigh!=='undefined'&&typeof utgt!=='undefined'&&typeof running!=='undefined'&&running){
    let eng=0;
    for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===0&&utgt[i]>=0) eng++;
    target=Math.max(target,Math.min(1,eng/9));
  }
  /* Snap up, bleed down: a two-second gap in the shooting is not peace. */
  mfFlowHeatV = target>mfFlowHeatV ? target : Math.max(target,mfFlowHeatV-dt/6);
  /* CSS gets one stable combat-pressure signal. It can collapse narration and
     the transient rail without each notification subsystem trying to infer a
     firefight from unrelated DOM state. Toggle only on change so the observer
     does not relayout the lane every 220 ms. */
  const hot=mfFlowHeatV>0.45;
  if(document.body.classList.contains('mfCombatHot')!==hot)
    document.body.classList.toggle('mfCombatHot',hot);

  if(mfFlowChips.levelUp){
    mfFlowCalmT = mfFlowModalBusy() ? 0 : mfFlowCalmT+dt;
    if(mfFlowCalmT>1.4){ const c=mfFlowChips.levelUp; mfFlowCalmT=0; c.fn(); }
  } else mfFlowCalmT=0;

  mfFlowLayout();
}

/* ---------------------------------------------------------------------------
   LATE TAKEOVER. Loaded last, so every base function below is already final.
   --------------------------------------------------------------------------- */
const mfFlowBaseToast=toast;
toast=function(msg){ mfNoticeSubmit(MF_N_ORDER,'t:'+msg,2600,()=>mfFlowBaseToast(msg),msg,'command'); };

const mfFlowBaseRadio=radioNotice;
radioNotice=function(title,msg){ mfNoticeSubmit(MF_N_INFO,'r:'+title+'|'+msg,2350,()=>mfFlowBaseRadio(title,msg),title+' — '+msg,'radio'); };

const mfFlowBasePickup=pickupToast;
pickupToast=function(kind,reward){
  const label=(kind&&kind.nm?kind.nm:'FIELD CACHE')+(reward?' — '+reward:'');
  mfNoticeSubmit(MF_N_CHAT,'p:'+(kind&&kind.nm)+'|'+reward,3200,()=>mfFlowBasePickup(kind,reward),label,'pickup');
};

const mfFlowBaseShowCoach=showCoach;
showCoach=function(msg){
  /* Economy coaching used to own a large amber card in the centre lane. On a
     phone that read like an emergency modal and could hide the very silo or
     factory the message referred to. Advice now uses the same compact,
     deduplicated event rail as orders and remains available in EVENT FEED. */
  const old=mfFlowEl('coach');if(old)old.style.opacity=0;
  if(mfFlowHeatV>0.6)return;
  mfNoticeSubmit(MF_N_INFO,'coach:'+String(msg).replace(/\s+/g,' ').trim(),3000,
    ()=>mfFlowBaseToast(msg),msg,'command');
};

/* The big one. XP lands during fights because fighting is what earns XP, and
   the chooser paused the game and covered the battlefield the same frame. */
const mfFlowBaseLevelUp=showLevelUp;
showLevelUp=function(){
  if(typeof pendingLevels!=='undefined'&&pendingLevels<=0){ mfFlowChipClear('levelUp'); return; }
  if(mfFlowModalBusy()){
    mfFlowChip('levelUp','★ LEVEL UP · choose upgrade',()=>{
      mfFlowChipClear('levelUp'); mfFlowBaseLevelUp();
    });
    return;
  }
  mfFlowChipClear('levelUp');
  mfFlowBaseLevelUp();
};

const mfFlowBaseShowAlert=showAlert;
showAlert=function(x,y,type){mfNoticeHistoryAdd(MF_N_CRIT,'base:'+Math.round(x/80)+','+Math.round(y/80),'BASE UNDER ATTACK','alert');mfFlowBaseShowAlert(x,y,type);mfFlowHeatV=Math.max(mfFlowHeatV,0.8);mfFlowQueueLayout();};

/* #waveAlert used to position itself by reading #atkAlert's inline display.
   The lane owns both now, so retire the hand-off and stop the class fighting
   the measured top. */
if(typeof updateWaveWarning==='function'){
  const mfFlowBaseWave=updateWaveWarning;
  updateWaveWarning=function(){
    mfFlowBaseWave();
    const el=mfFlowEl('waveAlert'); if(el) el.classList.remove('withAttack');
    mfFlowQueueLayout();
  };
}

/* Instant, not "within one 220ms tick": a banner visible for a fifth of a
   second on top of the main menu is still a banner on top of the main menu. */
if(typeof showFrontScreen==='function'){
  const mfFlowBaseShowFront=showFrontScreen;
  showFrontScreen=function(id){ mfFlowBaseShowFront(id); mfFlowLayout(); };
}
if(typeof hideFrontScreens==='function'){
  const mfFlowBaseHideFront=hideFrontScreens;
  hideFrontScreens=function(except){ mfFlowBaseHideFront(except); mfFlowLayout(); };
}

mfFlowTickT=setInterval(mfFlowTick,220);
const mfNoticeLogBtn=mfFlowEl('noticeLogBtn');if(mfNoticeLogBtn)mfNoticeLogBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const n=mfFlowEl('mfNoticeHistory');if(n&&n.style.display!=='none')mfNoticeHistoryClose();else mfNoticeHistoryOpen();});
const mfFlowWatch=new MutationObserver(mfFlowQueueLayout);
for(const id of ['atkAlert','waveAlert','keelWrap','toast','coach','unitCard','goalBar','wcRow','infMeter','heroBar','topbar'] ){
  const el=mfFlowEl(id); if(el) mfFlowWatch.observe(el,{attributes:true,attributeFilter:['style','class']});
}
document.body&&mfFlowWatch.observe(document.body,{attributes:true,attributeFilter:['class']});
addEventListener('resize',mfFlowQueueLayout);
addEventListener('orientationchange',mfFlowQueueLayout);
mfFlowQueueLayout();

