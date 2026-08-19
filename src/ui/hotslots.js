;
;
/* ============================================================================
   SELECTION HOT-SLOTS — item 5a
   ----------------------------------------------------------------------------
   Owner: "Abilities bound to unit selection — hot-slots under the selected
   unit, not exposed globally."

   What was there: eight ability buttons in a POWERS deck tab, permanently
   available and permanently disconnected from whatever you had selected. Six of
   them are the Commander's and do nothing without the Commander. Two of them
   (class doctrine, artillery barrage) were already selection-aware and had to
   hide themselves by hand.

   Meanwhile the ONE thing in this game that is genuinely per-unit-type — the
   UNIT_MODES stance table, eight stances mapped per chassis — was surfaced as a
   single button that CYCLED, parked in the PLATOONS tab. Rooting an artillery
   line meant: find the tab, press the button an unknown number of times, read
   the label to learn where you landed.

   Now: tap units, and the ABILITIES command tab activates for units that can
   act. Artillery shows SIEGE. A Prospector shows MINE / ASSIST /
   SURVEY. The Commander shows its powers. Nothing shows for a selection that
   cannot act.

   DESIGN NOTE — the bar is a VIEW, not a second controller. Every ability slot
   forwards its tap to the existing #heroRow button and mirrors that button's
   own cooldown/lock state. There is deliberately no second copy of the ability
   rules here: cooldowns, energy costs, aim modes and unlock gates keep their
   one owner in commander.js, and this file cannot drift away from them.
   ============================================================================ */
/* id -> the #heroRow button that owns the behaviour. Order is the slot order. */
const HOT_CORE=[
  {src:'abPrimary',em:'⌁', nm:'PRIMARY'},
  {src:'abSecondary',em:'✹', nm:'SECONDARY'},
  {src:'abCommander',em:'✦', nm:'SIGNATURE'},
  {src:'abJump',  em:'↗',  nm:'JUMP'},
];
const HOT_UTILITIES=[
  {src:'abOver',  em:'💥', nm:'BLAST', ab:0},
  {src:'abHeal',  em:'🛠', nm:'REPAIR',ab:1},
  {src:'abRage',  em:'⚡', nm:'SURGE', ab:2},
  {src:'abLance', em:'🛰', nm:'LANCE', ab:3},
  {src:'abEmp',   em:'⚡', nm:'EMP',   ab:4},
];
let hotSig='', hotSlots=[], hotRow=null,hotUtilityPanel=null,hotUtilityItems=[];

function hotSlotRow(){
  if(hotRow&&hotRow.isConnected) return hotRow;
  hotRow=document.getElementById('hotSlots');
  if(!hotRow){
    hotRow=document.createElement('div');
    hotRow.id='hotSlots';
    hotRow.setAttribute('role','group');
    hotRow.setAttribute('aria-label','Actions for the selected units');
    const dock=document.getElementById('cmdbar');
    (dock||document.body).appendChild(hotRow);
  }
  return hotRow;
}
function hotSrc(id){ return document.getElementById(id); }
function hotSrcUsable(id){
  const b=hotSrc(id);
  return !!(b&&getComputedStyle(b).display!=='none');
}
function hotActivateSource(b){
  if(!b) return;
  /* Ability owners listen for pointerdown, not click. Calling `.click()` here
     only ran the browser's click default and silently skipped tryAbility(). */
  /* Use a plain Event: older Android WebViews expose pointer events to the DOM
     but do not expose the PointerEvent constructor to script. */
  b.dispatchEvent(new Event('pointerdown',{bubbles:true,cancelable:true}));
}
function hotUtilityShell(){
  if(hotUtilityPanel&&hotUtilityPanel.isConnected)return hotUtilityPanel;
  hotUtilityPanel=document.getElementById('hotUtilityPanel');
  if(!hotUtilityPanel){
    hotUtilityPanel=document.createElement('div');hotUtilityPanel.id='hotUtilityPanel';
    hotUtilityPanel.setAttribute('role','group');hotUtilityPanel.setAttribute('aria-label','Additional selected unit actions');
    document.body.appendChild(hotUtilityPanel);
  }
  return hotUtilityPanel;
}
function hotUtilityClose(){
  if(hotUtilityPanel)hotUtilityPanel.style.display='none';
  const more=hotSlots.find(s=>s.def.kind==='utility');if(more)more.el.classList.remove('on');
}
function hotUtilityToggle(items){
  const p=hotUtilityShell();if(p.style.display==='grid'){hotUtilityClose();return;}
  hotUtilityItems=items.slice();p.innerHTML='';
  for(const s of hotUtilityItems){
    const b=document.createElement('button');b.type='button';b.className='hotUtility';b.dataset.hotSrc=s.src||'';
    b.innerHTML='<span class="hEm"></span><span class="hNm"></span><span class="hCd"></span>';
    b.querySelector('.hEm').textContent=s.em||'✦';b.querySelector('.hNm').textContent=s.nm||'ACTION';
    b.setAttribute('aria-label',(s.nm||'Action')+(s.ds?' — '+s.ds:''));
    b.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();hotUtilityClose();
      if(s.kind==='mode')hotSetMode(s.mode);
      else if(s.kind==='local'&&s.fn)s.fn();
      else hotActivateSource(hotSrc(s.src));});
    p.appendChild(b);
  }
  p.style.display='grid';const more=hotSlots.find(s=>s.def.kind==='utility');if(more)more.el.classList.add('on');hotSlotPlace();
}

/* What is selected, reduced to the shape the bar depends on. Rebuilding the
   DOM every HUD tick would kill the press state under the player's thumb, so
   the row is only rebuilt when this string changes. */
function hotSelectionSig(){
  if(typeof unitHigh==='undefined'||typeof usel==='undefined') return '';
  const types={}; let n=0, hero=false;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    n++; types[utype[i]]=1;
    if(typeof heroIdx!=='undefined'&&i===heroIdx) hero=true;
  }
  if(!n) return '';
  const powers=hero&&typeof abUnlock!=='undefined'?abUnlock.map(v=>v?'1':'0').join(''):'';
  const contextual=(hotSrcUsable('abClass')?'C':'-')+
    (typeof artBarrageSelected==='function'&&artBarrageSelected().length?'B':'-');
  let lift='';
  if(typeof mfAirliftSelected==='function'){const s=mfAirliftSelected();if(s>=0){const H=mfAirliftHold(s,false);lift='A'+(H?H.used:0);}}
  if(typeof mfMassSelected==='function'){const s=mfMassSelected();if(s>=0){const H=mfMassHold(s,false);lift+='M'+(H?H.used:0)+(utype[s]===MF_UT_MASSFLESH_AIR?'F':'');}}
  return (hero?'H':'-')+':'+Object.keys(types).sort((a,b)=>a-b).join(',')+':'+powers+':'+contextual+':'+lift;
}

function hotTabState(available){
  const tab=document.querySelector('.hudDeckBtn[data-deck="abilities"]');if(!tab)return;
  tab.disabled=!available;tab.setAttribute('aria-disabled',available?'false':'true');
  tab.setAttribute('aria-label',available?'Open selected unit abilities':'Abilities unavailable for current selection');
  if(!available&&typeof hudDeck==='string'&&hudDeck==='abilities'&&typeof setHudDeck==='function')setHudDeck('orders',true);
}

/* The stances the SELECTION can actually take, as individual slots rather than
   a cycle. MOBILE is the default footing, so it only earns a slot once someone
   is standing in something else and needs a way back. */
function hotModeSlots(){
  if(typeof unitModes!=='function') return [];
  const offered=[]; const seen={}; let anyDeployed=false, curOf={};
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||!usel[i]) continue;
    const ty=utype[i], list=unitModes(ty);
    if(!list||list.length<2) continue;
    if(umode[i]!==0) anyDeployed=true;
    for(const m of list) if(!seen[m]){ seen[m]=1; offered.push({m,ty}); }
    (curOf[ty]=curOf[ty]||{})[umode[i]]=1;
  }
  return offered.filter(o=>o.m!==0||anyDeployed).map(o=>{
    const D=unitModeDef(o.ty,o.m);
    return {kind:'mode',mode:o.m,em:D.em,nm:D.nm,ds:D.ds};
  });
}

/* Set one stance on every selected unit whose chassis offers it. Units that
   cannot take it are left alone rather than silently ignored — a mixed
   selection must not scatter, which is the same rule cycleSelectedModes has. */
function hotSetMode(m){
  let changed=0, label='', em='';
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||!usel[i]) continue;
    const ty=utype[i], list=unitModes(ty);
    if(!list||list.indexOf(m)<0) continue;
    if(umode[i]===m) continue;
    if(setMode(i,m)){ changed++; const D=unitModeDef(ty,m); label=D.nm; em=D.em; }
  }
  if(changed){
    if(typeof toast==='function') toast(em+' '+changed+' units → '+label);
    if(typeof sfx==='function') sfx('ui');
  } else if(typeof toast==='function') toast('Those units are already in that stance');
  if(typeof updateSelInfo==='function') updateSelInfo();
  hotSlotSync(true);
}

function hotSelectedBuilders(){
  const out=[];
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i]&&TYPES[utype[i]].builder)out.push(i);
  return out;
}
function hotBuilderMove(i,x,y){
  if(typeof battlefieldClampPoint==='function'){
    const p=battlefieldClampPoint(x,y,18);x=p[0];y=p[1];
  }
  utgt[i]=-1;uhold[i]=0;uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
  utx[i]=x;uty[i]=y;ustate[i]=1;umarch[i]=1;
}
function hotBuilderRepair(){
  const E=hotSelectedBuilders();if(!E.length)return;
  let ordered=0,raising=0;
  for(const i of E){
    let best=null,bd=Infinity,raise=false;
    /* Walk `blds`, not `bldLive`. The live cache lags a second behind a
       newly poured foundation, which is exactly when REPAIR should send
       the Constructor to raise it. */
    for(const B of blds){
      if(!B.alive||B.team!==uteam[i])continue;
      const unfinished=B.prog<1, hurt=B.prog>=1&&B.hp<B.hpm*.995;
      if(!unfinished&&!hurt)continue;
      const d=dist2(ux[i],uy[i],B.x,B.y);if(d<bd){bd=d;best=B;raise=unfinished;}
    }
    if(!best)continue;
    const a=Math.atan2(uy[i]-best.y,ux[i]-best.x),stand=(best.r||20)+26;
    hotBuilderMove(i,best.x+Math.cos(a)*stand,best.y+Math.sin(a)*stand);ordered++;
    if(raise)raising++;
  }
  if(ordered){
    toast('🔧 '+ordered+' Constructor'+(ordered===1?'':'s')+' → '+(raising===ordered?'construction site':'nearest damaged structure'));
    if(typeof uiCommandAck==='function')uiCommandAck('move',ordered);
  }else{toast('No damaged structures or unfinished sites need a Constructor');sfx('reject');}
}
function hotBuilderSalvage(){
  const E=hotSelectedBuilders();if(!E.length)return;
  let ordered=0;
  for(const i of E){
    let best=null,bd=Infinity;
    for(const W of wrecks){
      if(W.mass<=.01&&W.en<=.01)continue;
      const d=dist2(ux[i],uy[i],W.x,W.y);if(d<bd){bd=d;best=W;}
    }
    if(!best)continue;
    hotBuilderMove(i,best.x,best.y);ordered++;
  }
  if(ordered){
    toast('♻ '+ordered+' Constructor'+(ordered===1?'':'s')+' → nearest salvage field');
    if(typeof uiCommandAck==='function')uiCommandAck('move',ordered);
  }else{toast('No salvage fields detected');sfx('reject');}
}

function hotBuild(){
  const row=hotSlotRow();
  hotUtilityClose();
  hotSlots=[];
  const sel=hotSelectionSig();
  if(!sel){ row.style.display='none'; row.innerHTML=''; hotTabState(false); hotSlotPlace(); return; }

  const want=[],utility=[];
  /* The Commander's powers belong to the Commander. Selecting it is what puts
     them under your thumb — which is the whole point of the request. */
  if(sel.charAt(0)==='H'){
    const C=typeof playerCommanderDef==='function'?playerCommanderDef():null;
    for(const p of HOT_CORE){
      if(!hotSrcUsable(p.src))continue;
      if(p.ab!==undefined&&(!abUnlock||!abUnlock[p.ab]))continue;
      if(p.src==='abPrimary'||p.src==='abSecondary'){
        const W=typeof commanderWeaponDef==='function'?commanderWeaponDef(p.src==='abSecondary'?1:0):null;
        if(W){want.push({kind:'ab',...p,em:W.em||p.em,nm:W.nm.toUpperCase()});continue;}
      }
      const owned=C&&p.ab===C.ability&&C.abilityNm?C.abilityNm.toUpperCase():p.nm;
      want.push({kind:'ab',...p,nm:owned});
    }
    for(const p of HOT_UTILITIES){
      if(!hotSrcUsable(p.src))continue;
      if(p.ab!==undefined&&(!abUnlock||!abUnlock[p.ab]))continue;
      const owned=C&&p.ab===C.ability&&C.abilityNm?C.abilityNm.toUpperCase():p.nm;
      utility.push({kind:'ab',...p,nm:owned});
    }
  }
  /* The starting Constructor's jobs used to exist only in simulation code.
     Surface them where a player expects unit actions: construction, routing to
     field repair, and routing to its faster salvage pass. */
  if(hotSelectedBuilders().length){
    want.push({kind:'ab',src:'buildBtn',em:'🏗',nm:'BUILD',ds:'Open the structure catalogue'});
    want.push({kind:'local',fn:hotBuilderRepair,em:'🔧',nm:'REPAIR',ds:'Move to the nearest damaged or unfinished friendly structure'});
    want.push({kind:'local',fn:hotBuilderSalvage,em:'♻',nm:'SALVAGE',ds:'Move to the nearest wreck and reclaim it at 2× rate'});
  }
  /* Repair-bay MEND is owned by src/repairbay.js. A one-line hook keeps this
     file from duplicating apron rules, and the function is absent until that
     module loads — hotBuild only runs after boot, so the check is live. */
  if(typeof mfBayCollectHot==='function') mfBayCollectHot(want);
  if(typeof mfAirliftSelected==='function'){
    const sky=mfAirliftSelected();
    if(sky>=0){
      const H=typeof mfAirliftHold==='function'?mfAirliftHold(sky,false):null;
      want.push({kind:'local',fn:()=>{if(typeof mfAirliftArmUnload==='function')mfAirliftArmUnload(sky);},
        em:'⇩',nm:H&&H.cargo.length?'UNLOAD '+H.cargo.length:'UNLOAD',
        ds:'Set a formation drop zone for Skycrane cargo'});
    }
  }
  if(typeof mfMassSelected==='function'){
    const mass=mfMassSelected();
    if(mass>=0){
      const air=utype[mass]===MF_UT_MASSFLESH_AIR;
      want.push({kind:'local',fn:()=>{if(typeof mfMassArmSelected==='function')mfMassArmSelected();},
        em:'♒',nm:air?'BIRTH':'TAKE FLIGHT',
        ds:air?'Mark a birth site behind the defensive line':'Ascend for a timed breakthrough flight'});
    }
  }
  /* Doctrine and barrage hide themselves when the selection cannot use them,
     so "is it displayed" already answers "does this selection have it". */
  if(hotSrcUsable('abClass')){
    const b=hotSrc('abClass');
    utility.push({kind:'ab',src:'abClass',
      em:(document.getElementById('classAbEm')||{}).textContent||'✦',
      nm:(document.getElementById('classAbNm')||{}).textContent||'DOCTRINE'});
  }
  /* #abBarrage is the exception: it never hides, it just covers itself with
     "ARTY" when nothing eligible is selected. Ask the same question its own
     state function asks instead of reading its display. */
  if(hotSrc('abBarrage')&&typeof artBarrageSelected==='function'&&artBarrageSelected().length)
    utility.push({kind:'ab',src:'abBarrage',em:'☄',nm:'BARRAGE'});
  for(const m of hotModeSlots()) utility.push(m);

  /* Five stable thumb targets replace the clipped horizontal rail. Commander
     fire stays direct; legacy powers, artillery and stances live one tap deep
     in a measured popover rather than leaking off both phone edges. */
  const use=want.slice(0,4);
  if(want.length>4)utility.unshift(...want.slice(4));
  if(utility.length)use.push({kind:'utility',em:'⋯',nm:'UTILITY',items:utility});
  row.innerHTML='';
  for(const s of use){
    const b=document.createElement('button');
    b.type='button'; b.className='hotSlot';
    b.innerHTML='<span class="hEm"></span><span class="hNm"></span><span class="hCd"></span>';
    b.querySelector('.hEm').textContent=s.em;
    b.querySelector('.hNm').textContent=s.nm;
    b.setAttribute('aria-label',s.nm+(s.ds?' — '+s.ds:''));
    b.addEventListener('pointerdown',ev=>{
      ev.preventDefault(); ev.stopPropagation();
      if(s.kind==='mode') hotSetMode(s.mode);
      else if(s.kind==='local'&&s.fn)s.fn();
      else if(s.kind==='utility')hotUtilityToggle(s.items||[]);
      else hotActivateSource(hotSrc(s.src));
    });
    row.appendChild(b);
    hotSlots.push({def:s,el:b});
  }
  hotTabState(!!use.length);
  row.style.display=use.length&&typeof hudDeck==='string'&&hudDeck==='abilities'?'flex':'none';
  hotSlotPlace();
}

/* Mirror, never recompute. `.cd` and the .cdring text are written by the
   existing per-frame ability state pass in hud.js and commander.js. */
function hotSlotSync(force){
  const sel=hotSelectionSig();
  if(force||sel!==hotSig){ hotSig=sel; hotBuild(); }
  if(!hotSlots.length) return;
  for(const S of hotSlots){
    const el=S.el, cd=el.querySelector('.hCd');
    if(S.def.kind==='utility'){
      el.classList.toggle('cd',!(S.def.items&&S.def.items.length));cd.textContent='';
    }else if(S.def.kind==='ab'){
      const src=hotSrc(S.def.src);
      if(!src){ el.classList.add('cd'); continue; }
      const ring=src.querySelector('.cdring');
      const busy=src.classList.contains('cd');
      el.classList.toggle('cd',busy);
      el.classList.toggle('on',src.classList.contains('on'));
      cd.textContent=busy&&ring?(ring.textContent||''):'';
      if(S.def.src==='abCommander'){
        const em=document.getElementById('cmdAbEm'),nm=document.getElementById('cmdAbNm');
        if(em)el.querySelector('.hEm').textContent=em.textContent||'✦';
        if(nm)el.querySelector('.hNm').textContent=nm.textContent||'SIGNATURE';
        el.setAttribute('aria-label',src.getAttribute('aria-label')||'Commander signature ability');
      }else if(S.def.src==='abPrimary'||S.def.src==='abSecondary'){
        const W=typeof commanderWeaponDef==='function'?commanderWeaponDef(S.def.src==='abSecondary'?1:0):null;
        if(W){el.querySelector('.hEm').textContent=W.em||'•';el.querySelector('.hNm').textContent=W.nm.toUpperCase();}
      }else if(S.def.src==='abClass'){
        const em=document.getElementById('classAbEm'), nm=document.getElementById('classAbNm');
        if(em) el.querySelector('.hEm').textContent=em.textContent||'✦';
        if(nm) el.querySelector('.hNm').textContent=nm.textContent||'DOCTRINE';
      }
    }else if(S.def.kind==='local'){
      el.classList.remove('cd');cd.textContent='';
    }else{
      /* A stance slot is lit when every selected unit that COULD take it has. */
      let able=0, standing=0;
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||!usel[i]) continue;
        const list=unitModes(utype[i]);
        if(!list||list.indexOf(S.def.mode)<0) continue;
        able++; if(umode[i]===S.def.mode) standing++;
      }
      el.classList.toggle('on',able>0&&standing===able);
      el.classList.toggle('cd',!able);
      cd.textContent=able&&standing&&standing<able?standing+'/'+able:'';
    }
  }
  if(hotUtilityPanel&&hotUtilityPanel.style.display==='grid'){
    hotUtilityPanel.querySelectorAll('[data-hot-src]').forEach(el=>{
      const src=hotSrc(el.dataset.hotSrc),ring=src&&src.querySelector('.cdring'),cd=el.querySelector('.hCd');
      const busy=!!(src&&src.classList.contains('cd'));el.classList.toggle('cd',busy);
      if(cd)cd.textContent=busy&&ring?(ring.textContent||''):'';
    });
  }
  hotSlotPlace();
}

/* Sits directly above the selection readout it belongs to, measured rather than
   guessed — portrait moves #selInfo off-centre and turns #cmdbar into a
   full-width dock, and a hard-coded bottom offset would land inside both. */
function hotSlotPlace(){
  const row=hotRow;
  if(!row||row.style.display==='none') return;
  if(document.body.classList.contains('mfMenuOpen')||document.body.classList.contains('menuMode')){
    return;
  }
  const h=row.getBoundingClientRect().height||44;
  let floor=window.innerHeight;
  for(const id of ['selInfo','cmdbar','buildMenu','prodMenu','bldMenu2']){
    const el=document.getElementById(id); if(!el) continue;
    const cs=getComputedStyle(el); if(cs.display==='none') continue;
    const r=el.getBoundingClientRect(); if(r.height<=2) continue;
    if(r.top<floor) floor=r.top;
  }
  const y=Math.max(8,Math.round(floor-h-8));
  if(row._hotTop!==y){ row._hotTop=y; row.style.top=y+'px'; }
  if(hotUtilityPanel&&hotUtilityPanel.style.display==='grid'){
    const rr=row.getBoundingClientRect(),ph=hotUtilityPanel.getBoundingClientRect().height||96;
    hotUtilityPanel.style.top=Math.max(8,Math.round(rr.top-ph-6))+'px';
  }
}

/* One extra pass on the existing HUD tick rather than a timer of its own: the
   mirrored state is only written every 10th frame anyway. */
let hotHudSynced=false;
if(typeof updateSelInfo==='function'){
  const hotBaseSelInfo=updateSelInfo;
  updateSelInfo=function(){ hotBaseSelInfo(); hotHudSynced=true; hotSlotSync(false); };
}
/* THE "EVERY 10th FRAME" ABOVE WAS NOT TRUE OF THIS HOOK.
   hud.js gates its own body on `(hudFrame++)%10`, and hudflow.js then wraps
   updateHUD with a second gate that RETURNS BEFORE calling the base. This file
   loads last, so it wrapped hudflow's wrapper: `hotBaseUpdateHUD(fps)` returned
   immediately on the nine skipped frames and `hotSlotSync(false)` ran anyway —
   sixty times a second, not six. Each of those runs calls hotSelectionSig(),
   which walks `unitHigh`, walks it again inside artBarrageSelected(), and calls
   getComputedStyle() on #abClass (a forced style recalc, on a HUD that dirties
   style constantly). main.js absorbs the cost by sliding simDt, so it never
   looks like a bug: the match just runs slow.
   `hudFrame` read BEFORE the base call predicts the painting frame under both
   gates (hud.js paints when the pre-increment value %10 is 0; hudflow only
   forwards on exactly those frames), so this now matches the comment. */
if(typeof updateHUD==='function'){
  const hotBaseUpdateHUD=updateHUD;
  updateHUD=function(fps){
    const paints=(typeof hudFrame!=='number')||(hudFrame%10===0);
    hotHudSynced=false;
    hotBaseUpdateHUD(fps);
    /* hud.js's painted body already calls the wrapped updateSelInfo above, so
       the row is in sync by the time we get here on a painting frame. Only run
       a second pass if that call did not happen. */
    if(paints&&!hotHudSynced) hotSlotSync(false);
  };
}
addEventListener('resize',()=>hotSlotPlace());
hotSlotRow();

