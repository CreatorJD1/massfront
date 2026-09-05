;
;
/* ============================================================================
   HUD TRAFFIC CONTROL — one owner for everything that pops up mid-battle
   ----------------------------------------------------------------------------
   THE PROBLEM (owner report): during a busy fight the screen fills with banners
   that were each positioned correctly in isolation and were never told about
   each other. Every transient element in this game hard-codes an absolute
   offset from the top of the screen:

       #goalBar      inside #topbar #coach        sat + 150
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
let mfFlowMute=0, mfHeatCursor=0;
const mfFlowEls={};

function mfFlowHeat(){ return mfFlowHeatV; }

function mfFlowVis(el){
  if(!el) return false;
  const st=el.style;
  if(st.display==='none'||st.visibility==='hidden') return false;
  if(st.opacity==='0') return false;
  /* Cached height: offsetHeight forced layout on every banner during a
     queued pass. Re-measure only after the observer saw a mutation. */
  if(el._mfVisH!=null) return el._mfVisH>2;
  const h=el.offsetHeight;
  el._mfVisH=h;
  return h>2;
}
function mfFlowEl(id){
  let el=mfFlowEls[id];
  if(el&&el.isConnected) return el;
  el=document.getElementById(id);
  if(el) mfFlowEls[id]=el;
  return el;
}

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
    if(el&&el.style.display&&el.style.display!=='none') return true;
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
const MF_LANE_R=['infMeter','hazChip','godBadge'];

/* Place a box so its top edge lands at viewport Y, whatever its position mode
   or offset parent is. Measured, so it survives media queries and safe areas. */
function mfFlowPlace(el,y){
  let delta=el._mfDelta;
  if(delta==null){
    const cs=getComputedStyle(el);
    const cur=parseFloat(cs.top);
    if(!isFinite(cur)){ el.style.position='fixed'; el.style.top=y+'px'; return; }
    delta=el.getBoundingClientRect().top-cur;
    el._mfDelta=delta;
  }
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
    y+=el.offsetHeight+gap;
  }
  return y;
}

/* The whole point: walk the lane and stack it. No element is ever asked where
   it thinks it should be. */
function mfFlowLayout(){
  mfFlowRaf=0;
  mfFlowMute++;
  try{ mfFlowLayoutGo(); }
  finally{
    /* mfFlowMute alone cannot work as written. A MutationObserver delivers
       its callback asynchronously, at the microtask checkpoint after this task
       ends, by which point this finally block has already returned the counter
       to 0 — verified directly in a browser. So the observer always read
       !mfFlowMute as true and could re-queue a layout in response to this
       pass's own writes. Draining the records here empties the queue
       synchronously, so our writes never reach the callback while any later
       foreign mutation is still observed normally.
       This was NOT the cause of the whole-HUD flicker: measured with
       tools/probe-hud-flicker.mjs, removing this drain changes nothing
       (3/s either way). That was mfCinematicEnsureStructure() re-adding a
       class it already had. Kept because the guard should do what it says. */
    if(typeof mfFlowWatch!=='undefined'&&mfFlowWatch&&
       typeof mfFlowWatch.takeRecords==='function') mfFlowWatch.takeRecords();
    mfFlowMute--;
  }
}
function mfFlowLayoutGo(){
  for(const id in mfFlowEls){ const el=mfFlowEls[id]; if(el) el._mfVisH=undefined; }
  const body=document.body;
  /* One authoritative "the player is in the menu" state, whatever put them
     there. The class does the hiding (see ui.css); the early return hands every
     banner back to the stylesheet rather than pinning it to a lane origin
     measured from a top bar that is not on screen. Toggle only on change —
     writing the class unconditionally would retrigger our own body observer. */
  const menu=body.classList.contains('menuMode')||mfFlowFrontOpen();
  if(body.classList.contains('mfMenuOpen')!==menu) body.classList.toggle('mfMenuOpen',menu);
  if(menu){
    const feed=mfFlowEl('mfNoticeHistory');
    if(feed&&feed.style.display!=='none')mfNoticeHistoryClose(true);
    for(const s of MF_LANE) mfFlowRelease(mfFlowEl(s.id));
    for(const id of MF_LANE_L) mfFlowRelease(mfFlowEl(id));
    for(const id of MF_LANE_R) mfFlowRelease(mfFlowEl(id));
    mfFlowDockSelInfo(true);
    return;
  }
  const vh=window.innerHeight||800;
  const tb=mfFlowEl('topbar');
  let head=tb&&mfFlowVis(tb)?tb.getBoundingClientRect().bottom:34;
  const gb=mfFlowEl('goalBar');
  if(gb&&mfFlowVis(gb)) head=Math.max(head,gb.getBoundingClientRect().bottom);

  /* Corner columns first — the centre lane must clear whichever is taller. */
  /* The cinematic HUD physically joins #heroBar to #topbar. The legacy traffic
     lane used to write an inline top below the header, which won over the late
     CSS and recreated the large empty corner the joined rail was designed to
     remove. Hand the portrait back to its rail owner; only transient world
     condition badges continue down the left lane. */
  const cinematic=body.classList.contains('mf-cinematic-hud');
  if(cinematic)mfFlowRelease(mfFlowEl('heroBar'));
  const lb=mfFlowLaneSide(cinematic?MF_LANE_L.filter(id=>id!=='heroBar'):MF_LANE_L,head+6,5);
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
    const h=v.el.offsetHeight;
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
  /* Selection readout, build/prod/structure sheets, place UI, constructor
     HUD and the notice log all used hardcoded portrait bottoms (70–200px)
     that sat inside the modern command dock once a second row appeared.
     Measure the dock instead of guessing. */
  mfFlowDockSelInfo(false);
}
/* Anything that must clear the live command dock. Same owner as the
   top lane — one measurement, many panels — so a new sheet cannot land
   on a guessed 160px that is already occupied. */
const MF_DOCK_LIFT=['selInfo','buildMenu','prodMenu','bldMenu2','placeUI','consHud','mfNoticeDock','mfNoticeHistory'];
function mfFlowDockRelease(el){
  if(!el||!el._mfDocked) return;
  el.style.removeProperty('bottom');
  el.style.removeProperty('top');
  el._mfDocked=false; el._mfDockBottom=undefined;
}
function mfFlowDockSelInfo(release){
  const dock=mfFlowEl('cmdbar');
  const vh=window.innerHeight||800;
  const can=!release&&dock&&mfFlowVis(dock);
  const want=can?Math.max(8,Math.round(vh-dock.getBoundingClientRect().top+6)):0;
  for(const id of MF_DOCK_LIFT){
    const el=mfFlowEl(id);
    if(!el) continue;
    if(!can||!mfFlowVis(el)){ mfFlowDockRelease(el); continue; }
    /* The legacy skin keeps its 44px FEED launcher below the drawer. The
       cinematic skin hides that duplicate launcher while open and puts a full
       close target in the drawer header, so reserving another 52px needlessly
       pushed the feed into the centre of the battlefield. */
    const feedGap=id==='mfNoticeHistory'&&!document.body.classList.contains('mf-cinematic-hud')?52:0;
    let dockWant=want+feedGap;
    /* Tablet/desktop cinematic layouts deliberately move the feed to the
       minimap side so the right command dock stays live. Dock height alone is
       not enough there: the map can be taller than the dock by a few pixels.
       Measure horizontal ownership and clear the map only when the two lanes
       actually intersect; portrait feeds on the opposite side keep their
       shallower, glanceable position. */
    if(id==='mfNoticeHistory'&&document.body.classList.contains('mf-cinematic-hud')){
      const map=mfFlowEl('minimapWrap');
      if(map&&mfFlowVis(map)){
        const er=el.getBoundingClientRect(),mr=map.getBoundingClientRect();
        const overlapX=Math.min(er.right,mr.right)-Math.max(er.left,mr.left);
        if(overlapX>1)dockWant=Math.max(dockWant,Math.round(vh-mr.top+6));
      }
    }
    if(el._mfDockBottom!==dockWant){
      el._mfDockBottom=dockWant;
      el.style.top='auto';
      el.style.bottom=dockWant+'px';
    }
    el._mfDocked=true;
  }
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
const MF_N_MAXQ=3, MF_N_LIVE_WINDOW=4500, MF_N_LIVE_MAX=2;
let mfNQ=[], mfNKey='', mfNPri=99, mfNUntil=0, mfNCount=1, mfNDrainT=0, mfNRender=null, mfNHold=false, mfNUrgent=false;
let mfNLiveTimes=[];
const MF_N_HISTORY_MAX=80;
let mfNHistory=[],mfNHistoryFilter='all',mfNUnread=0;
const MF_N_URGENT=/[⚠⛔✖]|UNDER ATTACK|INCOMING|REJECTED|FAILED|FAILURE|CANNOT|CAN'T|\bDOWN\b|NEEDS RESOURCES|EXPIRED|BROKEN|CRITICAL/i;

/* FPS is diagnostic information, not a resource.  Older OTA shells still put
   it inside #topbar, where WebView flex layout reserves a full resource tile
   even when a newer stylesheet makes the counter visually tiny.  Reparenting
   keeps patched installs and fresh packages on the same layout. */
const mfFpsDiagnostic=mfFlowEl('fps');
if(mfFpsDiagnostic&&mfFpsDiagnostic.parentElement!==document.body){
  document.body.appendChild(mfFpsDiagnostic);
  mfFpsDiagnostic.setAttribute('aria-label','Optional frame-rate diagnostic');
}

function mfNoticeHistoryShown(){
  const el=mfFlowEl('mfNoticeHistory');
  return !!(el&&el.style.display!=='none'&&getComputedStyle(el).display!=='none');
}
function mfNoticeBadgeSync(){
  const btn=mfFlowEl('noticeLogBtn');if(!btn)return;
  let count=mfFlowEl('noticeLogCount');
  if(!count){count=document.createElement('i');count.id='noticeLogCount';btn.appendChild(count);}
  count.textContent=mfNUnread?String(Math.min(99,mfNUnread))+(mfNUnread>99?'+':''):'';
  btn.classList.toggle('hasUnread',mfNUnread>0);
  const newest=mfNHistory[0];
  btn.dataset.severity=mfNUnread&&newest?mfNoticeSeverity(newest):'quiet';
  btn.setAttribute('aria-label',mfNUnread?'Open event feed, '+mfNUnread+' unread':'Open event feed');
}
function mfNoticeSeverity(N){
  if(!N)return 'info';
  if(N.pri<=MF_N_CRIT||MF_N_URGENT.test(String(N.label||'')))return 'critical';
  if(N.channel==='pickup')return 'reward';
  if(N.channel==='radio'||N.pri>=MF_N_CHAT)return 'comms';
  if(N.channel==='command'||N.pri===MF_N_ORDER)return 'order';
  return 'info';
}
function mfNoticeIcon(channel){
  return channel==='alert'?{name:'attack',fallback:'!'}:
    channel==='command'?{name:'waypoint',fallback:'⌖'}:
    channel==='radio'?{name:'ping',fallback:'◉'}:
    channel==='pickup'?{name:'resource',fallback:'◆'}:{name:'minimap',fallback:'·'};
}
function mfNoticeHistoryAdd(pri,key,label,channel){
  if(!label)return;
  const now=performance.now(),at=Date.now(),ch=channel||'command';
  /* A burst can interleave two event types (damage / income / damage). Search
     the recent bounded feed rather than deduplicating only adjacent rows. */
  const hit=mfNHistory.findIndex(n=>n.key===key&&n.channel===ch&&now-n.t<8000);
  if(hit>=0){
    const row=mfNHistory.splice(hit,1)[0];row.n++;row.t=now;row.at=at;mfNHistory.unshift(row);
  }else mfNHistory.unshift({pri,key,label,channel:ch,t:now,at,n:1});
  if(mfNHistory.length>MF_N_HISTORY_MAX)mfNHistory.length=MF_N_HISTORY_MAX;
  if(!mfNoticeHistoryShown())mfNUnread++;
  mfNoticeBadgeSync();
  if(mfNoticeHistoryShown())mfNoticeHistoryRender();
}
function mfNoticeLogShell(){
  let dock=mfFlowEl('mfNoticeDock');
  if(!dock){
    dock=document.createElement('div');dock.id='mfNoticeDock';document.body.appendChild(dock);mfFlowEls.mfNoticeDock=dock;
  }
  let btn=mfFlowEl('noticeLogBtn');
  if(!btn){
    btn=document.createElement('button');btn.id='noticeLogBtn';btn.className='cbtn';btn.type='button';
    btn.innerHTML='<span class="em" aria-hidden="true">☷</span><span>FEED</span><i id="noticeLogCount"></i>';
  }else{
    const label=btn.querySelector('span:last-of-type');if(label)label.textContent='FEED';
  }
  if(btn.parentElement!==dock)dock.appendChild(btn);
  btn.setAttribute('aria-controls','mfNoticeHistory');btn.setAttribute('aria-expanded','false');
  if(!btn._mfNoticeBound){
    btn._mfNoticeBound=true;
    mfBindNativePress(btn,e=>{e.preventDefault();e.stopPropagation();if(mfNoticeHistoryShown())mfNoticeHistoryClose();else mfNoticeHistoryOpen();});
  }
  mfFlowEls.noticeLogBtn=btn;
  mfNoticeBadgeSync();
  return btn;
}
function mfNoticeHistoryShell(){
  let el=mfFlowEl('mfNoticeHistory');if(el)return el;
  el=document.createElement('section');el.id='mfNoticeHistory';el.setAttribute('role','complementary');el.setAttribute('aria-label','Battle event feed');el.setAttribute('aria-modal','false');
  el.innerHTML='<header><div><small>TACTICAL NETWORK</small><b>EVENT FEED</b><span id="mfNoticeFeedState"></span></div><button type="button" aria-label="Close event feed">×</button></header>'+
    '<nav role="tablist" aria-label="Event filters">'+
      '<button role="tab" data-f="all" class="on" aria-label="All events"><span class="em mfNoticeTabIcon" data-icon="minimap" aria-hidden="true">◎</span><span class="mfNoticeTabLabel">ALL</span></button>'+
      '<button role="tab" data-f="alert" aria-label="Alerts"><span class="em mfNoticeTabIcon" data-icon="attack" aria-hidden="true">!</span><span class="mfNoticeTabLabel">ALERT</span></button>'+
      '<button role="tab" data-f="command" aria-label="Orders"><span class="em mfNoticeTabIcon" data-icon="waypoint" aria-hidden="true">⌖</span><span class="mfNoticeTabLabel">ORDER</span></button>'+
      '<button role="tab" data-f="radio" aria-label="Communications"><span class="em mfNoticeTabIcon" data-icon="ping" aria-hidden="true">◉</span><span class="mfNoticeTabLabel">COMMS</span></button>'+
      '<button role="tab" data-f="pickup" aria-label="Loot and rewards"><span class="em mfNoticeTabIcon" data-icon="resource" aria-hidden="true">◆</span><span class="mfNoticeTabLabel">LOOT</span></button>'+
    '</nav><div class="mfNoticeList" role="log" aria-live="off" aria-label="Recent battle events"></div>';
  document.body.appendChild(el);
  mfBindNativePress(el.querySelector('header button'),e=>{e.stopPropagation();mfNoticeHistoryClose();});
  el.querySelectorAll('nav button').forEach(b=>mfBindNativePress(b,e=>{e.stopPropagation();mfNHistoryFilter=b.dataset.f;mfNoticeHistoryRender();}));
  if(typeof cmdIconsRefresh==='function')cmdIconsRefresh(el);
  mfFlowEls.mfNoticeHistory=el;
  return el;
}
function mfNoticeClock(at){
  const d=new Date(at||Date.now());return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function mfNoticeHistoryRender(){
  const el=mfNoticeHistoryShell(),list=el.querySelector('.mfNoticeList');list.innerHTML='';
  el.querySelectorAll('nav button').forEach(b=>{const on=b.dataset.f===mfNHistoryFilter;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');});
  const rows=mfNHistory.filter(n=>mfNHistoryFilter==='all'||n.channel===mfNHistoryFilter);
  const state=el.querySelector('#mfNoticeFeedState');if(state)state.textContent=rows.length+' RECENT';
  if(!rows.length){const e=document.createElement('p');e.className='mfNoticeEmpty';e.textContent='No messages in this channel yet.';list.appendChild(e);return;}
  const channelLabel={command:'ORDER',alert:'ALERT',radio:'COMMS',pickup:'LOOT'};
  for(const N of rows){
    const severity=mfNoticeSeverity(N),icon=mfNoticeIcon(N.channel);
    const row=document.createElement('div');row.className='mfNoticeItem p'+N.pri+' ch-'+N.channel;row.dataset.severity=severity;row.setAttribute('role','listitem');
    row.setAttribute('aria-label',(channelLabel[N.channel]||N.channel)+', '+mfNoticeClock(N.at)+', '+N.label+(N.n>1?', repeated '+N.n+' times':''));
    const glyph=document.createElement('span');glyph.className='em mfNoticeGlyph';glyph.dataset.icon=icon.name;glyph.setAttribute('aria-hidden','true');glyph.textContent=icon.fallback;
    const tm=document.createElement('time');tm.dateTime=new Date(N.at||Date.now()).toISOString();tm.textContent=mfNoticeClock(N.at);
    const tag=document.createElement('i');tag.textContent=channelLabel[N.channel]||N.channel.toUpperCase();
    tag.setAttribute('aria-hidden','true');
    const msg=document.createElement('span');msg.textContent=N.label;msg.title=N.label;
    const copy=document.createElement('span');copy.className='mfNoticeCopy';copy.append(tag,msg);
    row.append(glyph,copy,tm);
    if(N.n>1){const repeat=document.createElement('b');repeat.className='mfNoticeRepeat';repeat.textContent='×'+N.n;copy.appendChild(repeat);}
    list.appendChild(row);
    if(typeof cmdIconsRefresh==='function')cmdIconsRefresh(row);
  }
}
function mfNoticeHistoryOpen(){
  /* A battlefield feed is not a modal. Production, selection and camera input
     stay available around it while the player glances at recent events. */
  const el=mfNoticeHistoryShell();mfNUnread=0;mfNoticeBadgeSync();mfNoticeHistoryRender();el.style.display='flex';
  document.body.classList.add('mfNoticeFeedOpen');
  const btn=mfNoticeLogShell();btn.setAttribute('aria-expanded','true');
  mfFlowQueueLayout();
  if(typeof sfx==='function')sfx('ui');
}
function mfNoticeHistoryClose(quiet){
  const el=mfFlowEl('mfNoticeHistory');if(el)el.style.display='none';
  document.body.classList.remove('mfNoticeFeedOpen');
  const btn=mfFlowEl('noticeLogBtn');if(btn)btn.setAttribute('aria-expanded','false');
  mfFlowQueueLayout();if(!quiet&&typeof sfx==='function')sfx('ui');
}

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
function mfNoticeShow(pri,key,dur,render,n,urgent){
  mfNKey=key; mfNPri=pri; mfNCount=n||1; mfNRender=render;mfNUrgent=!!urgent;
  mfNUntil=performance.now()+dur;
  render();
  const el=mfFlowEl('toast');if(el)el.classList.toggle('noticeUrgent',mfNUrgent);
  mfNoticeBadge();
  mfFlowQueueLayout();
  mfNoticeArm();
}
function mfNoticeDrain(){
  mfNDrainT=0;
  if(mfNHold) return;                 /* the lane has no room; wait to be released */
  if(performance.now()<mfNUntil){ mfNoticeArm(); return; }
  mfNPri=99; mfNKey=''; mfNRender=null;mfNUrgent=false;
  const nxt=mfNQ.shift(); if(!nxt) return;
  /* History keeps every event. A stale routine acknowledgement does not need
     to cover the map several seconds after the action that caused it. */
  if(!nxt.urgent&&performance.now()-nxt.t>6500){ mfNoticeDrain(); return; }
  mfNoticeShow(nxt.pri,nxt.key,nxt.dur,nxt.render,nxt.n,nxt.urgent);
}
/* Called when the lane had no room for the rail: the message was never read,
   so it goes back to the front of the queue instead of evaporating. */
function mfNoticeReturn(){
  if(!mfNRender||mfNPri>=MF_N_CHAT) return;
  mfNQ.unshift({pri:mfNPri,key:mfNKey,dur:2000,render:mfNRender,t:performance.now(),n:mfNCount,urgent:mfNUrgent});
  if(mfNQ.length>MF_N_MAXQ) mfNQ.length=MF_N_MAXQ;
  mfNKey=''; mfNPri=99; mfNRender=null; mfNUrgent=false; mfNUntil=0;
  mfNoticeArm();
}
function mfNoticeLiveAllowed(pri,urgent,now){
  /* Info, commander chatter and loot always reach the feed and badge, but do
     not repeatedly occupy the battlefield. Only alerts and direct command
     acknowledgements use the one-line live rail. */
  if(pri>=MF_N_INFO)return false;
  if(pri<=MF_N_CRIT||urgent)return true;
  mfNLiveTimes=mfNLiveTimes.filter(t=>now-t<MF_N_LIVE_WINDOW);
  if(mfNLiveTimes.length>=MF_N_LIVE_MAX)return false;
  mfNLiveTimes.push(now);return true;
}
function mfNoticeSubmit(pri,key,dur,render,label,channel,forceUrgent){
  mfNoticeHistoryAdd(pri,key,label,channel);
  const now=performance.now();
  const urgent=!!forceUrgent||pri<=MF_N_CRIT||MF_N_URGENT.test(String(label||''));
  if(key===mfNKey&&now<mfNUntil){          /* same line again — count it        */
    mfNCount++; mfNoticeBadge();
    /* Repeated feedback counts up without pinning a banner on screen forever. */
    mfNUntil=Math.min(mfNUntil+450,now+(urgent?2100:1450));mfNoticeArm();return;
  }
  if(!mfNoticeLiveAllowed(pri,urgent,now))return;
  const heat=mfFlowHeatV;
  if(heat>0.5&&!urgent)dur=Math.round(dur*0.68);
  /* Equal-priority routine notices queue instead of replacing one another.
     Only a genuinely urgent command may interrupt an ordinary command line. */
  if(!mfNHold&&(now>=mfNUntil||pri<mfNPri||(urgent&&!mfNUrgent&&pri===mfNPri))){
    mfNoticeShow(pri,key,dur,render,1,urgent); return;
  }
  const dup=mfNQ.find(q=>q.key===key);
  if(dup){dup.n=(dup.n||1)+1;dup.urgent=dup.urgent||urgent;return;}
  mfNQ.push({pri,key,dur,render,t:now,n:1,urgent});
  mfNQ.sort((a,b)=>a.pri-b.pri||Number(b.urgent)-Number(a.urgent)||a.t-b.t);
  /* The live queue is bounded; the full event remains in the 80-row feed. */
  if(mfNQ.length>MF_N_MAXQ)mfNQ.length=MF_N_MAXQ;
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
    mfBindNativePress(b,ev=>{ ev.preventDefault(); ev.stopPropagation();
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
  if(typeof unitHigh!=='undefined'&&typeof utgt!=='undefined'&&typeof running!=='undefined'&&running&&unitHigh){
    let eng=0, seen=0, i=mfHeatCursor, guard=0;
    while(seen<32&&guard++<unitHigh){
      if(i>=unitHigh) i=0;
      if(ualive[i]&&uteam[i]===0){ seen++; if(utgt[i]>=0) eng++; }
      i++;
    }
    mfHeatCursor=i;
    if(seen) target=Math.max(target,Math.min(1,eng/9));
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
  /* Layout is queued by banner mutations. Forcing it every 220ms was HUD thrash
     at 1000 pop (CDP 33 layouts / 3.5s) and fought the observer. */
}

/* ---------------------------------------------------------------------------
   LATE TAKEOVER. Loaded last, so every base function below is already final.
   --------------------------------------------------------------------------- */
const mfFlowBaseToast=toast;
toast=function(msg){
  const label=String(msg||'');
  mfNoticeSubmit(MF_N_ORDER,'t:'+label,2200,()=>mfFlowBaseToast(label),label,'command',MF_N_URGENT.test(label));
};

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
    const el=mfFlowEl('waveAlert');
    const before=el&&el.style.display;
    mfFlowBaseWave();
    if(el) el.classList.remove('withAttack');
    if(el&&el.style.display!==before) mfFlowQueueLayout();
  };
}

/* Instant, not "within one 220ms tick": a banner visible for a fifth of a
   second on top of the main menu is still a banner on top of the main menu. */
if(typeof showFrontScreen==='function'){
  const mfFlowBaseShowFront=showFrontScreen;
  showFrontScreen=function(id){
    const opened=mfFlowBaseShowFront(id);
    mfFlowLayout();
    return opened;
  };
}
if(typeof hideFrontScreens==='function'){
  const mfFlowBaseHideFront=hideFrontScreens;
  hideFrontScreens=function(except){
    const hidden=mfFlowBaseHideFront(except);
    mfFlowLayout();
    return hidden;
  };
}

/* Stop / Hold readout lives in input.js (ustopDisp next to the orders).
   hud.js reads it. A `let` bit declared here loaded AFTER hud.js on packed
   boot, so updateSelInfo never saw STOP. Keep the wrap only to refresh the
   line if an older input.js skipped updateSelInfo. */
if(typeof stopSelected==='function'){
  const mfFlowBaseStop=stopSelected;
  stopSelected=function(){
    mfFlowBaseStop();
    if(typeof updateSelInfo==='function') updateSelInfo();
  };
}
if(typeof orderHold==='function'){
  const mfFlowBaseHold=orderHold;
  orderHold=function(){
    const n=mfFlowBaseHold();
    if(typeof updateSelInfo==='function') updateSelInfo();
    return n;
  };
}

mfFlowTickT=setInterval(mfFlowTick,220);
/* Reparent the existing VIEW/LOG button into a permanent gameplay corner. The
   creation path keeps OTA source compatible with older packaged HTML shells. */
const mfNoticeLogBtn=mfNoticeLogShell();
const mfFlowWatch=new MutationObserver(()=>{
  for(const id in mfFlowEls){ const el=mfFlowEls[id]; if(el) el._mfVisH=undefined; }
  if(!mfFlowMute) mfFlowQueueLayout();
});
/* mfFlowFrontOpen() owns the authoritative menu predicate, so the same front
   screens must trigger its observer. Settings-from-pause changes only the
   screen's inline display; without this list mfMenuOpen stayed latched after
   Resume and hid the complete tactical HUD until an unrelated mutation. */
const mfFlowWatchIds=['atkAlert','waveAlert','keelWrap','toast','coach','unitCard','goalBar','wcRow','infMeter','hazChip','heroBar','topbar','selInfo','cmdbar','tacRow','grpRow','hotSlots','primaryRow','hudDeckTabs','buildMenu','prodMenu','bldMenu2','placeUI','consHud','mfNoticeDock','mfNoticeHistory',
  ...((typeof FRONT_SCREEN_IDS!=='undefined'&&FRONT_SCREEN_IDS.length)?FRONT_SCREEN_IDS.concat('loadScr'):MF_FRONT_FALLBACK)];
for(const id of new Set(mfFlowWatchIds)){
  const el=mfFlowEl(id); if(el) mfFlowWatch.observe(el,{attributes:true,attributeFilter:['style','class']});
}
document.body&&mfFlowWatch.observe(document.body,{attributes:true,attributeFilter:['class']});
addEventListener('resize',()=>{
  for(const id in mfFlowEls){ const el=mfFlowEls[id]; if(el){ el._mfDelta=undefined; el._mfVisH=undefined; } }
  mfFlowQueueLayout();
});
addEventListener('orientationchange',()=>{
  for(const id in mfFlowEls){ const el=mfFlowEls[id]; if(el){ el._mfDelta=undefined; el._mfVisH=undefined; } }
  mfFlowQueueLayout();
});
mfFlowQueueLayout();
if(typeof updateHUD==='function'){
  const mfFlowBaseHUD=updateHUD;
  updateHUD=function(fps){
    if(typeof hudFrame==='number'&&hudFrame%10){
      /* Keep the receiver state machine smooth without repainting every HUD
         surface. It owns only guarded attribute writes and no layout scan on
         its idle path; the full HUD remains on the shared 1-in-10 cadence. */
      if(typeof cmdrTxTick==='function')cmdrTxTick();
      hudFrame++;return;
    }
    mfFlowBaseHUD(fps);
  };
}


/* ============================================================================
   COMMAND ICON SHEET
   ----------------------------------------------------------------------------
   HUD buttons ship an emoji AND a data-icon. The emoji is what renders until
   assets/textures/ui/cmdicons.png actually decodes; only then does .cmdIcons
   go on <html> and the CSS swap the glyph for a sprite cell. A missing sheet is
   therefore not an error state and not a blank button — the same contract the
   tactical icon atlas uses, and the reason this can ship before the art does.

   Sheet contract: 8x8 grid of 128px cells on a 1024 square, white glyph on
   transparency, cell order per docs/CMD_ICON_ART_SPEC.md.
   ============================================================================ */
const CMD_ICON_SHEET='assets/textures/ui/cmdicons.png';
const CMD_ICON_INDEX='assets/textures/ui/icon-index.json';
let mfCmdIconNames=null,mfCmdIconObserver=null;
function cmdIconsRefresh(root){
  if(!mfCmdIconNames)return;
  const scope=root&&root.querySelectorAll?root:document;
  const list=[];
  if(scope.nodeType===1&&scope.matches('[data-icon]'))list.push(scope);
  scope.querySelectorAll('[data-icon]').forEach(el=>list.push(el));
  for(const el of list){
    const ready=mfCmdIconNames.has(el.getAttribute('data-icon')||'');
    el.setAttribute('data-icon-ready',ready?'true':'false');
  }
}
function cmdIconsBind(){
  try{
    const rel=(typeof mf2AssetURL==='function')?mf2AssetURL(CMD_ICON_SHEET):('./'+CMD_ICON_SHEET);
    const indexRel=(typeof mf2AssetURL==='function')?mf2AssetURL(CMD_ICON_INDEX):('./'+CMD_ICON_INDEX);
    /* MUST be absolute. A relative url() inside a custom property is resolved
       against the stylesheet that uses it, not the document — so the plain
       relative form loaded fine for this Image() probe (document-based) and
       then 404'd as /src/styles/assets/... once CSS substituted it, leaving
       every tagged button blank: .cmdIcons had already hidden the emoji. */
    const url=new URL(rel,document.baseURI).href;
    const img=new Image();
    const imageReady=new Promise(resolve=>{
      img.onload=()=>resolve(img.naturalWidth===1024&&img.naturalHeight===1024);
      img.onerror=()=>resolve(false);
    });
    const indexReady=fetch(new URL(indexRel,document.baseURI).href,{cache:'force-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
    Promise.all([imageReady,indexReady]).then(([imageOk,index])=>{
      const common=index&&index.common_neutral;
      if(!imageOk||!common||common.sheet!=='cmdicons.png'||!common.cells)return;
      const entries=Object.entries(common.cells);
      if(!entries.length||entries.some(([,cell])=>!Number.isInteger(cell)||cell<0||cell>=64))return;
      mfCmdIconNames=new Set(entries.map(([name])=>name));
      /* Hand the resolved URL to CSS rather than repeating it there, so the OTA
         asset resolver stays the single source of truth for asset paths. */
      document.documentElement.style.setProperty('--cmdSheet','url("'+url+'")');
      document.documentElement.classList.add('cmdIcons');
      cmdIconsRefresh(document);
      if(!mfCmdIconObserver){
        mfCmdIconObserver=new MutationObserver(records=>{
          for(const record of records){
            if(record.type==='attributes')cmdIconsRefresh(record.target);
            else record.addedNodes.forEach(node=>{if(node.nodeType===1)cmdIconsRefresh(node);});
          }
        });
        mfCmdIconObserver.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-icon']});
      }
    });
    img.src=url;
  }catch(e){}
}
cmdIconsBind();

/* ============================================================================
   PROFILE MASTERY + OPS TAB TAKEOVER
   ----------------------------------------------------------------------------
   #masteryGrid lives on Profile (career record). renderOps() is the only
   writer, so opening Career before Operations left 192 empty boxes. Filling
   from a renderProfile wrap avoids editing meta.js (settings sibling).

   renderOps still calls mfBindTabs(opsScr,'threat') for a tab that moved to
   Battle Setup. mfSetTabs already falls back, but a stale MF_TAB_STATE.threat
   should use opsTab()'s weekly remap. Wrap here — endgame.js is not ours.
   ============================================================================ */
function mfFillMasteryGrid(){
  const mg=document.getElementById('masteryGrid');
  if(!mg||typeof masteryGet!=='function') return;
  const facs=(typeof endgameEnemyFactions==='function')
    ?endgameEnemyFactions()
    :(typeof enemyFactions==='function'?enemyFactions():['nova','legion','syndicate','horde']);
  let h='<div class="mRow mHdr"><div></div>'+facs.map(f=>'<div>'+((FACTIONS[f]&&FACTIONS[f].em)||'◆')+'</div>').join('')+'</div>';
  const maps=(typeof homeworldMapIds==='function'?homeworldMapIds():Object.keys(MAPDEFS||{}));
  for(const m of maps){
    h+='<div class="mRow"><div class="mNm">'+((MAPDEFS[m]&&MAPDEFS[m].nm)||m)+'</div>';
    for(const f of facs){
      const t=masteryGet(m,f);
      h+='<div class="mCell'+(t?' got':'')+'">'+(t?'T'+t:'—')+'</div>';
    }
    h+='</div>';
  }
  const tot=(typeof masteryTotal==='function')?masteryTotal():{done:0,total:maps.length*facs.length};
  mg.innerHTML=h+'<div class="mFoot">'+tot.done+' / '+tot.total+' · 48 homeworld sites · '+facs.length+' enemy banners</div>';
}
if(typeof renderProfile==='function'&&!renderProfile.__mfMasteryFill){
  const _mfProf=renderProfile;
  renderProfile=function(){
    _mfProf.apply(this,arguments);
    mfFillMasteryGrid();
  };
  renderProfile.__mfMasteryFill=1;
}
if(typeof renderOps==='function'&&!renderOps.__mfThreatTabFix){
  const _mfOps=renderOps;
  renderOps=function(){
    _mfOps.apply(this,arguments);
    const el=document.getElementById('opsScr');
    if(el&&typeof mfBindTabs==='function'){
      const key=(typeof opsTab==='function')?opsTab():'weekly';
      if(typeof MF_TAB_STATE!=='undefined'&&(MF_TAB_STATE.opsScr==='threat'||MF_TAB_STATE.opsScr==='mastery'))
        MF_TAB_STATE.opsScr=key;
      mfBindTabs(el,key);
    }
  };
  renderOps.__mfThreatTabFix=1;
}

/* ============================================================================
   MENU / SETTINGS CHROME
   ----------------------------------------------------------------------------
   galaxyui.js#mfRenameFrontNav relabels #startBtn to DEPLOY and claims it
   opens the war table. START always opens the installed War Room. Galactic
   Campaign is Settings-only while it stays an experimental side module.
   trainingUiState()
   lives inside tutorial.js's IIFE, so meta.js's War Room card never receives
   SKIPS WAR TABLE. Settings copy in meta.js names engine internals (#grade,
   film-grain). Audio now exposes the four independent Stage 8 buses named by
   the settings copy.
   ============================================================================ */
function mfPatchHomeChrome(){
  const start=document.getElementById('startBtn');
  if(start){
    start.innerHTML='▶&nbsp;START MASSFRONT';
    start.setAttribute('aria-label','Start MASSFRONT');
  }
  const sub=document.querySelector('#settingsScr .subMenuHead span');
  if(sub) sub.textContent='Audio · Gameplay · Display · Command · System';
}
function mfPolishSettingsCopy(){
  const setDs=(sel,tx)=>{ const el=document.querySelector(sel); if(el) el.textContent=tx; };
  setDs('#setGroup-audio .setGroupDs','Effects, ambience, music, and voice are independent. Tap a volume row to cycle 25–100%.');
  setDs('[data-set="sfxVol"] .sDs','Tap to cycle 0%, 25%, 50%, 75%, or 100%.');
  setDs('[data-set="ambVol"] .sDs','Tap to cycle 0%, 25%, 50%, 75%, or 100%.');
  setDs('[data-set="musicVol"] .sDs','Tap to cycle 0%, 25%, 50%, 75%, or 100%.');
  setDs('[data-set="voiceVol"] .sDs','Tap to cycle 0%, 25%, 50%, 75%, or 100%.');
  setDs('[data-set="cine"] .sDs','Warm sun wash and the color overlay. Not bloom — that is Advanced. Not the Screen Grade filter.');
  setDs('[data-set="screenGrade"] .sDs','No screen filter. Shows lighting, bloom, and vignette as authored.');
  setDs('[data-set="gfxAdvOpen"] .sDs','Independent overrides. Changing Graphics Quality resets these to that preset. Screen Grade stays on the row above.');
  setDs('[data-set="gfxBloom"] .sDs','Bright-pass glow. On uses this preset\'s bloom; off skips the pass.');
  const diag=document.getElementById('gfxDiagRow');
  if(diag){
    diag.classList.add('setRowStatic');
    diag.removeAttribute('data-set');
  }
}
function mfPolishWarRoomCopy(){
  const train=document.querySelector('.warCard[data-mode="training"]');
  if(train){
    const body=train.querySelector('.warBody');
    const desc=train.querySelector('.warDs');
    if(desc){
      const raw=desc.textContent.trim().replace(/^UGA\s*·\s*KEEL SHIP LIAISON\s*·\s*/i,'');
      desc.textContent='UGA · KEEL SHIP LIAISON · '+raw;
      train.dataset.affiliation='uga';
      train.setAttribute('aria-label','Training — UGA KEEL ship liaison. '+raw);
    }
    let foot=train.querySelector('.warFootTx');
    if(body&&(!foot||!foot.textContent.trim())){
      if(!foot){ foot=document.createElement('span'); foot.className='warFootTx'; body.appendChild(foot); }
      foot.textContent='RECOMMENDED · SKIPS WAR TABLE';
    }
  }
  document.querySelectorAll('.warReward').forEach(el=>{
    const b=el.querySelector('b');
    if(b&&/^\+0%\s*XP$/i.test(b.textContent.trim())&&!el.querySelector('small'))
      el.classList.add('zeroXp');
  });
}
if(typeof mfRenameFrontNav==='function'&&!mfRenameFrontNav.__mfWarRoomLabel){
  const _rn=mfRenameFrontNav;
  mfRenameFrontNav=function(){ _rn.apply(this,arguments); mfPatchHomeChrome(); };
  mfRenameFrontNav.__mfWarRoomLabel=1;
}
if(typeof showFrontScreen==='function'&&!showFrontScreen.__mfHomeChrome){
  const _show=showFrontScreen;
  showFrontScreen=function(id){
    const opened=_show.apply(this,arguments);
    mfPatchHomeChrome();
    if(typeof audMusicEnterScreen==='function') audMusicEnterScreen(id);
    return opened;
  };
  showFrontScreen.__mfHomeChrome=1;
}
if(typeof renderWarRoom==='function'&&!renderWarRoom.__mfTrainCopy){
  const _wr=renderWarRoom;
  renderWarRoom=function(){ _wr.apply(this,arguments); mfPolishWarRoomCopy(); };
  renderWarRoom.__mfTrainCopy=1;
}
if(typeof renderSettings==='function'&&!renderSettings.__mfChrome){
  const _rs=renderSettings;
  renderSettings=function(){
    _rs.apply(this,arguments);
    mfPatchHomeChrome();
    mfPolishSettingsCopy();
    Promise.resolve().then(mfPolishSettingsCopy);
  };
  renderSettings.__mfChrome=1;
}
mfPatchHomeChrome();
if(document.getElementById('warGrid')&&document.getElementById('warGrid').children.length)
  mfPolishWarRoomCopy();
