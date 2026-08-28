;
;
/* ============================================================
   INPUT — touch camera, selection, orders (mobile-first)
   ============================================================ */
const ptrs=new Map();
let boxMode=false, boxStart=null, boxAdd=false, pinchD=0, pinchZ=1, tapT=0, pinchA=0, pinchYaw=0;
/* True from the moment a gesture has two fingers down until every finger has
   lifted. Pointer events are delivered one at a time, so when the second
   finger of a pinch is released ptrs.size is back to 0 and that release is
   indistinguishable from a deliberate one-finger tap. Two bugs came out of
   that: a two-finger tap issued a ground move order at the second finger's
   position, and a pinch begun during box-select committed a selection
   rectangle stretching to wherever the zoom happened to end. */
let multiTouch=false;
let pinchMY=0, pinchPitch=0.92;
let openBld=-1;             // building whose menu is open
let shake=0;

/* --------------------------------------------------------------------------
   UI ACTION SAFETY
   Benign navigation remains one tap. Disruptive gameplay actions wait for a
   completed, non-drag gesture; irreversible actions retain their existing
   confirmation and updater rollback gains one here. Capture phase is required:
   the legacy owners live in main.js and listen on both pointerdown and pointerup.
   -------------------------------------------------------------------------- */
const MF_UI_DESTRUCTIVE_IDS=new Set(['bp_sell','profReset','profDel','quitBtn','updRoll','saveFilePut']);
const MF_UI_DISRUPTIVE_IDS=new Set([
  'setupStart','weeklyGo','goContinueBtn','deployBtn','placeOk','upBtn','bp_up','bp_fire',
  'rallyBtn','queueBtn','patrolBtn','holdBtn','formBtn','moveBtn','stopBtn','modeBtn',
  'abOver','abHeal','abRage','abLance','abEmp','abJump','abClass','abBarrage'
]);
const MF_UI_EXISTING_CONFIRM=new Set(['bp_sell','profReset','profDel','quitBtn','saveFilePut']);
const MF_UI_CONFIRM_COPY={updRoll:'Revert to the packaged build? The installed update will be removed and the game will restart.'};
let mfUiReplay=false,mfUiLastTarget=null,mfUiLastAt=-1e9,mfUiPanelDismissedAt=-1e9;
const mfUiGestures=new Map(),mfUiBlockedPointers=new Set(),mfUiDownTargets=new Map();
const mfUiSafetyAudit={downs:0,guarded:0,bounceBlocks:0,panelBlocks:0,releases:0,replays:0};
function mfUiControlTarget(node){return node&&node.closest?node.closest('button,[role="button"],input,select,textarea,.bcard'):null;}
/* Only bypass the global release guard when the card proves that its own
   caller already commits on release. Standard production/build cards expose
   previewKind; extension cards opt in after binding mfBindTap. A bare bcard is
   deliberately unsafe — Field Study cards are legacy pointerdown callers. */
function mfUiLocallyReleaseGuarded(el){
  return !!(el&&el.matches('.bcard')&&(
    el.dataset.mfReleaseSafe==='1'||el.dataset.previewKind==='unit'||el.dataset.previewKind==='building'));
}
function mfUiRisk(el){
  if(!el)return 'benign';
  if(MF_UI_DESTRUCTIVE_IDS.has(el.id))return 'destructive';
  if(MF_UI_DISRUPTIVE_IDS.has(el.id)||el.matches('.abtn,.hotSlot,.hotUtility'))return 'disruptive';
  if(el.matches('.bcard')&&(el.closest('#prodGrid')||el.closest('#buildGrid')))return 'disruptive';
  return 'benign';
}
function mfUiMarkPanelDismiss(){mfUiPanelDismissedAt=performance.now();}
function mfUiReplayGesture(el,ev){
  if(!el||!el.isConnected)return;
  mfUiReplay=true;
  try{
    /* mfBindTap rejects explicitly non-primary contacts. Synthetic
       PointerEvents default isPrimary to false, so guarded controls bound via
       mfBindTap became inert when this replay omitted the real contact state. */
    const init={bubbles:true,cancelable:true,isPrimary:ev.isPrimary!==false,pointerId:ev.pointerId||1,pointerType:ev.pointerType||'touch',clientX:ev.clientX||0,clientY:ev.clientY||0,button:0,buttons:1};
    const PE=typeof PointerEvent==='function'?PointerEvent:Event;
    el.dispatchEvent(PE===Event?new Event('pointerdown',{bubbles:true,cancelable:true}):new PE('pointerdown',init));
    init.buttons=0;
    el.dispatchEvent(PE===Event?new Event('pointerup',{bubbles:true,cancelable:true}):new PE('pointerup',init));
  }finally{mfUiReplay=false;}
  mfUiLastTarget=el;mfUiLastAt=performance.now();
  mfUiSafetyAudit.replays++;
}
function mfUiControlInventory(root){
  root=root||document;
  const out={benign:[],disruptive:[],destructive:[]};
  root.querySelectorAll('button,[role="button"],input,select,textarea,.bcard').forEach(el=>{
    const risk=mfUiRisk(el),r=el.getBoundingClientRect(),localRelease=mfUiLocallyReleaseGuarded(el);
    el.dataset.mfRisk=risk;
    out[risk].push({id:el.id||'',className:String(el.className||''),label:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('placeholder')||el.tagName).replace(/\s+/g,' ').trim().slice(0,100),visible:getComputedStyle(el).display!=='none'&&r.width>0&&r.height>0,protection:risk==='destructive'?(MF_UI_EXISTING_CONFIRM.has(el.id)?'existing-confirmation':'confirmation'):(risk==='disruptive'?(localRelease?'local-release-after-drag-threshold':'global-release-after-drag-threshold'):'one-tap')});
  });
  return out;
}
if(typeof window!=='undefined'){
  window.mfUiControlInventory=mfUiControlInventory;
  window.mfUiSafetyProbe=()=>({replay:mfUiReplay,lastTarget:mfUiLastTarget&&mfUiLastTarget.id||'',sinceLast:performance.now()-mfUiLastAt,sincePanelDismiss:performance.now()-mfUiPanelDismissedAt,pending:mfUiGestures.size,blocked:mfUiBlockedPointers.size,audit:{...mfUiSafetyAudit}});
}

/* Window capture is intentional. Several legacy panels own document-capture
   listeners and may stop propagation; a global cross-control/tap-through guard
   must observe the contact before any one panel can consume it. */
const mfUiEventRoot=typeof window!=='undefined'?window:document;
mfUiEventRoot.addEventListener('pointerdown',ev=>{
  if(mfUiReplay)return;
  mfUiSafetyAudit.downs++;
  const el=mfUiControlTarget(ev.target),now=performance.now(),pid=ev.pointerId||1;
  mfUiDownTargets.set(pid,el);
  if(!el)return;
  const risk=mfUiRisk(el);
  /* Destructive two-step actions still need two COMPLETED taps. A second
     pointerdown inside the hardware-bounce window is never confirmation, even
     on the same control; the normal 2.6-3s confirmation window remains intact. */
  if(mfUiLastTarget&&now-mfUiLastAt<180&&(el!==mfUiLastTarget||risk==='destructive')){
    mfUiBlockedPointers.add(pid);mfUiSafetyAudit.bounceBlocks++;ev.preventDefault();ev.stopImmediatePropagation();return;
  }
  /* Production/build cards own a release/drag contract in hud.js (build cards
     through mfBindTap, production cards through their batch-aware handler). */
  const locallyGuarded=mfUiLocallyReleaseGuarded(el)&&(el.closest('#prodGrid')||el.closest('#buildGrid'));
  if(risk==='benign'||locallyGuarded||(risk==='destructive'&&MF_UI_EXISTING_CONFIRM.has(el.id))){
    mfUiLastTarget=el;mfUiLastAt=now;return;
  }
  if(risk==='disruptive'&&now-mfUiPanelDismissedAt<220){
    mfUiBlockedPointers.add(pid);mfUiSafetyAudit.panelBlocks++;ev.preventDefault();ev.stopImmediatePropagation();
    if(typeof toast==='function')toast('Panel closed — tap the action again to confirm');
    return;
  }
  mfUiGestures.set(pid,{el,x:ev.clientX,y:ev.clientY,t:now,moved:false,risk});
  mfUiSafetyAudit.guarded++;
  ev.preventDefault();ev.stopImmediatePropagation();
},true);
mfUiEventRoot.addEventListener('pointermove',ev=>{
  const g=mfUiGestures.get(ev.pointerId||1);if(!g)return;
  if(Math.hypot(ev.clientX-g.x,ev.clientY-g.y)>10)g.moved=true;
},true);
mfUiEventRoot.addEventListener('pointerup',ev=>{
  if(mfUiReplay)return;
  mfUiSafetyAudit.releases++;
  const pid=ev.pointerId||1,down=mfUiDownTargets.get(pid),up=mfUiControlTarget(ev.target);
  mfUiDownTargets.delete(pid);
  if(mfUiBlockedPointers.has(pid)){mfUiBlockedPointers.delete(pid);mfUiGestures.delete(pid);ev.preventDefault();ev.stopImmediatePropagation();return;}
  /* A panel disappearing under the finger must not turn that release into an
     ability activation on the newly exposed command bar. */
  if(up&&up!==down&&mfUiRisk(up)==='disruptive'){
    mfUiGestures.delete(pid);ev.preventDefault();ev.stopImmediatePropagation();return;
  }
  const g=mfUiGestures.get(pid);if(!g)return;
  mfUiGestures.delete(pid);ev.preventDefault();ev.stopImmediatePropagation();
  if(g.moved||performance.now()-g.t>900||!g.el.isConnected)return;
  const copy=MF_UI_CONFIRM_COPY[g.el.id];
  if(g.risk==='destructive'&&copy){
    const go=()=>mfUiReplayGesture(g.el,ev);
    if(typeof accConfirm==='function')accConfirm(copy,go);
    else if(window.confirm(copy))go();
    return;
  }
  mfUiReplayGesture(g.el,ev);
},true);
mfUiEventRoot.addEventListener('pointercancel',ev=>{
  const pid=ev.pointerId||1;mfUiGestures.delete(pid);mfUiBlockedPointers.delete(pid);mfUiDownTargets.delete(pid);
},true);

/* CAMERA AUTHORITY.
   Anything that moves the camera automatically has to yield to the player the
   moment they touch it. Without that, panning away to scout a landing site or
   to look at a fight fought the auto-follow every frame and the view was
   dragged straight back — which reads as the camera, the ship or the units
   snapping back. `camUser()` is called from every manual camera input and
   suspends automatic movement for a few seconds afterwards. */
let camUserT=0;
function camUser(){ camUserT=4.0; }
function zoomSpanMax(){ return typeof spanMaxNow==='function'?spanMaxNow():SPAN_MAX; }
function zoomSpanMin(){ return typeof spanMinNow==='function'?spanMinNow():200; }
function camAutoAllowed(){ return camUserT<=0; }
function camAuthTick(dt){ if(camUserT>0) camUserT-=dt; }
/* Tapping the ground while the dropship is still airborne orders it there and
   keeps the camera with it, so flying the ship never means losing sight of it —
   but only while the player is not driving the camera themselves. */
function carrierFollow(){
  if(!camAutoAllowed()) return;
  if(carrier.active&&carrier.phase<2){
    cam.x+=(carrier.x-cam.x)*0.22; cam.y+=(carrier.y-cam.y)*0.22;   // glide, never teleport
    clampCam(); camUpdateMatrices();
  }
}
function selCount(){ let n=0; for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]) n++; return n; }
function uiCommandAck(action,count,wx,wy){
  if(typeof radioAck==='function') return radioAck(action,count,wx,wy);
  sfx('radio',wx,wy,0.9); return true;
}
function clearSel(){
  usel.fill(0);activePlatoon=-1;armFormation=false;orderPreview=null;orderConfirm=null;
  /* STOP vs HOLD is HUD-only (both write uhold=1). Leaving the bits set meant
     a later select of a recycled slot, or a unit that had since been given a
     new order off-selection, still read STOP. */
  if(ustopDisp) ustopDisp.fill(0);
  if(armPatrol)cancelPatrolDraft(true);
  if(armQueue)cancelQueueDraft(true);
  const fb=document.getElementById('formBtn');if(fb)fb.classList.remove('on');
  updateGroupBadges();updateSelInfo();
}
function selectArmy(){
  clearSel(); let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===0&&i!==heroIdx){ usel[i]=1; n++; }
  toast(n?('⚔ Army selected — '+n+' units'):'No army yet — build a Factory');
  updateSelInfo(); if(n)uiCommandAck('select',n);else sfx('ui');
}
/* The most frequent RTS question after a base expands is "where is my builder?"
   This selects idle Constructors only, recentres once, and does not steal a
   working engineer off a repair or construction order. */
function selectIdleBuilders(){
  clearSel(); let n=0,fx=0,fy=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&uteam[i]===0&&TYPES[utype[i]].builder&&ustate[i]===0){
    usel[i]=1; n++; fx+=ux[i]; fy+=uy[i];
  }
  if(!n){ toast('No idle Constructors — build one or finish current orders'); sfx('reject'); return; }
  cam.x=fx/n; cam.y=fy/n; clampCam(); camUpdateMatrices();
  updateSelInfo(); toast('🔧 '+n+' idle Constructor'+(n===1?'':'s')+' selected'); uiCommandAck('select',n,cam.x,cam.y);
}
function selectHero(){
  if(heroIdx<0){ toast('Commander is down'); return; }
  clearSel(); usel[heroIdx]=1;
  cam.x=ux[heroIdx]; cam.y=uy[heroIdx]; clampCam();
  updateSelInfo(); uiCommandAck('select',1,ux[heroIdx],uy[heroIdx]);
}
/* HUD-only: Stop and Hold both write uhold=1 (idle must not chase). The
   selection line still has to say STOP vs HOLD. Lives here — next to the
   orders — because a `let` bit in hudflow.js is declared AFTER hud.js, so
   updateSelInfo's lookup never saw it on packed boot (separate classic
   scripts). */
var ustopDisp=null;
function markStopDisp(on){
  if(!ustopDisp&&typeof MAXU==='number') ustopDisp=new Uint8Array(MAXU);
  if(!ustopDisp) return;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]) ustopDisp[i]=on?1:0;
}
function stopSelected(){
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    /* Stop is a freeze, not idle. Idle acquisition uses aggro range and then
       walks (the chase that made Stop feel like a delayed Attack). Hold already
       acquires at weapon range and refuses wantMove — Stop writes that stance
       so a new lock can still be shot if it is already in range. */
    ustate[i]=0;utgt[i]=-1;utgtg[i]=-1;uhold[i]=1;umarch[i]=0;
    utx[i]=ux[i];uty[i]=uy[i];uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
    /* Stop means stop. A surviving waypoint chain or escort anchor would walk
       the unit off again on the next tick, which is exactly the "Stop did
       nothing" complaint this function already exists to answer. */
    queueClear(i);uGuard[i]=-1;
    n++;
  }
  markStopDisp(true);
  if(n){ uiCommandAck('stop',n); updateSelInfo(); }
  else sfx('reject');
}
/* ---------- formations ---------- */
const FORMS=[
 {id:'spread', em:'⋯', nm:'Spread'},
 {id:'line',   em:'☰', nm:'Battle Line'},
 {id:'wedge',  em:'⌃', nm:'Wedge'},
 {id:'box',    em:'▦', nm:'Box'},
 {id:'column', em:'⋮', nm:'Column'},
 {id:'arc',    em:'⌒', nm:'Arc'},
];
let selFormation=0, armFormation=false, orderPreview=null, orderConfirm=null;
let patrolDraft=null;
function formationMembers(){
  const out=[];
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]) out.push(i);
  /* Put tough short-range chassis in front and support/air frames in depth.
     Stable slot order keeps a platoon from shuffling after every command. */
  out.sort((a,b)=>{
    const A=TYPES[utype[a]],B=TYPES[utype[b]];
    const ar=(A.air?900:0)+(A.naval?500:0)+(utype[a]===19?700:0)+(A.rng||0)-A.size*3;
    const br=(B.air?900:0)+(B.naval?500:0)+(utype[b]===19?700:0)+(B.rng||0)-B.size*3;
    return ar-br||a-b;
  });
  return out;
}
/* FORMATION TIGHTENING. Spacing is decided per order; if the platoon forms up
   with the enemy already inside `FORM_TIGHT_R`, the spread shrinks so the whole
   line reaches the fight at once instead of trickling in single-file. It is a
   cluster, not a stack: unitSeparation in sim.js still enforces physical
   separation, so the tighter goals just make the wall denser on contact. */
const FORM_TIGHT_R=170, FORM_TIGHT_MUL=0.72;
function formationSpacing(sel){
  let sp=31,cx2=0,cy2=0;
  for(const i of sel){
    const T=TYPES[utype[i]];
    /* The baked 3D card is rendered at 2.05x logical `size`. Collision radii
       alone therefore produce legal but visibly interpenetrating formations.
       This clearance tracks the opaque silhouette while retaining a bounded
       footprint for mixed or Titan platoons. */
    sp=Math.max(sp,Math.max(T.r*2+7,T.size*1.8+8));
    cx2+=ux[i];cy2+=uy[i];
  }
  if(sel.length){ cx2/=sel.length; cy2/=sel.length; }
  let near=false;
  forUnitsIn(cx2,cy2,FORM_TIGHT_R,j=>{ if(!near&&ualive[j]&&uteam[j]!==0) near=true; });
  if(near) sp*=FORM_TIGHT_MUL;
  return clamp(sp,near?24:31,92);
}
function formationOffsets(n,form,spacing){
  const out=[];
  const sp=spacing||31;
  if(form==='line'){
    const perRow=Math.max(2,Math.min(18,Math.ceil(n/2)));
    for(let k=0;k<n;k++){
      const r2=(k/perRow)|0, f=k%perRow;
      out.push([(f-(Math.min(perRow,n-r2*perRow)-1)/2)*sp, r2*sp*1.10]);
    }
  } else if(form==='wedge'){
    let k=0,r2=0;
    while(k<n){
      const inRow=r2+1;
      for(let f=0;f<inRow&&k<n;f++,k++) out.push([(f-r2/2)*sp, r2*sp*.94]);
      r2++;
    }
  } else if(form==='box'){
    const perRow=Math.max(2,Math.ceil(Math.sqrt(n)));
    for(let k=0;k<n;k++){
      const r2=(k/perRow)|0, f=k%perRow;
      out.push([(f-(perRow-1)/2)*sp, r2*sp]);
    }
  } else if(form==='column'){
    const perRow=Math.min(3,Math.max(1,n));
    for(let k=0;k<n;k++){
      const r2=(k/perRow)|0, f=k%perRow, here=Math.min(perRow,n-r2*perRow);
      out.push([(f-(here-1)/2)*sp,r2*sp*1.12]);
    }
  } else if(form==='arc'){
    const perRow=Math.max(3,Math.ceil(n/2));
    for(let k=0;k<n;k++){
      const r2=(k/perRow)|0, f=k%perRow, here=Math.min(perRow,n-r2*perRow);
      const q=here<=1?0:(f/(here-1)-0.5)*2, rad=sp*2+here*sp*.16+r2*sp*1.12;
      out.push([Math.sin(q*.92)*rad,(1-Math.cos(q*.92))*rad+r2*sp*1.08]);
    }
  } else {
    const spread=Math.max(sp*.66,Math.sqrt(n)*sp*.42);
    for(let k=0;k<n;k++){
      const a=k*2.399963, d=spread*Math.sqrt((k+.5)/Math.max(1,n));
      out.push([Math.cos(a)*d,Math.sin(a)*d]);
    }
  }
  return out;
}
/* THE PREVIEW IS DRAWN EVERY FRAME; THE ASSIGNMENT IS NOT.
   render3d.js called formationTargets() straight from the draw for as long as
   the formation preview was on screen — a full offset build, sort and map per
   frame for the whole selection. That kind of cost never LOOKS wrong: main.js
   absorbs it by sliding simDt, so the match just runs slow and nothing on
   screen admits why. The solve belongs to the pointer event that moved the
   target, so memoise it on the preview object and let the draw read the answer.
   It lives here, beside the solver it caches, so the renderer holds no path to
   the expensive call at all. */
function formationPreviewSlots(o,members,form){
  if(!o||!members||!members.length) return [];
  /* Ghosts only. orderMove still solves the full selection. Patrol already
     keeps 36 route stands; 1000 hologram rings is the same fillrate trap as
     per-unit selection rings. Sample members so this never walks the army. */
  const n=members.length, stride=Math.max(1,Math.ceil(n/36));
  const key=Math.round(o.x)+','+Math.round(o.y)+','+form+','+n+','+stride
    +','+(members[0]|0)+','+(members[n-1]|0);
  if(o._slotKey===key) return o._slots||[];
  o._slotKey=key;
  let sampled=members;
  if(stride>1){
    sampled=[];
    for(let k=0;k<n;k+=stride) sampled.push(members[k]);
    if(sampled[sampled.length-1]!==members[n-1]) sampled.push(members[n-1]);
  }
  o._slots=formationTargets(sampled,o.x,o.y,form);
  return o._slots;
}
function formationTargets(sel,wx,wy,form,angle){
  if(!sel.length) return [];
  if(angle==null){
    let cx2=0,cy2=0; for(const i of sel){cx2+=ux[i];cy2+=uy[i];}
    angle=Math.atan2(wy-cy2/sel.length,wx-cx2/sel.length);
  }
  const ct=Math.cos(angle),st=Math.sin(angle),offs=formationOffsets(sel.length,form,formationSpacing(sel));
  return offs.map(o=>{
    let x=clamp(wx-o[1]*ct-o[0]*st,15,MAP-15),y=clamp(wy-o[1]*st+o[0]*ct,15,MAP-15);
    if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(x,y,15);x=p[0];y=p[1];}
    return {x,y};
  });
}
function setFormation(n,quiet){
  selFormation=((n%FORMS.length)+FORMS.length)%FORMS.length;
  const F=FORMS[selFormation], b=document.getElementById('formBtn');
  if(b){b.querySelector('.em').textContent=F.em;b.querySelector('span:nth-child(2)').textContent=F.nm;}
  if(!quiet) toast(F.em+' '+F.nm+' armed — drag the hologram and release to place '+selCount()+' units');
}
/* ARMING ANY MAP-TAP MODE DISARMS THE RALLY FLAG.
   onTap tests `armRally>=0` before selection, before the queue planner and
   before patrol, so an armed rally silently EATS the next map tap no matter
   what the player armed after it. Sequence that reproduces it: open a Factory,
   tap SET RALLY, change your mind and tap PATROL (or QUEUE, or FORM) — the
   planner toasts "tap waypoints", the first tap plants a rally flag there
   instead and the planner is still sitting at zero waypoints. Nothing else
   cancels a rally arm: closeMenus() does not, and resetInputState() — whose
   own comment promises "input starts from a genuinely idle state" — did not
   list it either. Last instruction wins. */
function disarmRally(){ armRally=-1; }
function armFormationOrder(){
  if(!selCount()){toast('Select units first');return;}
  disarmRally();
  setFormation(selFormation+1,false);armFormation=true;
  const b=document.getElementById('formBtn');if(b)b.classList.add('on');
  sfx('ui');
}
/* ATTACK-MOVE vs MOVE.
   Every order used to be attack-move: `ustate=2`, acquire anything on the way.
   The simulation has always supported a plain reposition state (`ustate===1`,
   which suppresses acquisition and drops back to idle on arrival) — it was
   simply never written by anything. Without it there is no retreat, no
   repositioning under fire and no walking past a fight, which is the highest
   frequency tactical decision in the genre. `moveMode` is the player's toggle;
   double-tap/click on empty ground forces a one-shot retreat without flipping
   it. `orderMove` honours both. */
let moveMode=0;                                  // 0 = attack-move, 1 = move only
function toggleMoveMode(){
  moveMode=moveMode?0:1;
  const b=document.getElementById('moveBtn');
  if(b){ b.classList.toggle('on',!!moveMode);
         const l=b.querySelector('.lbl'); if(l) l.textContent=moveMode?'MOVE':'A-MOVE'; }
  toast(moveMode?'➤ MOVE — units reposition without stopping to fight'
                :'⚔ ATTACK-MOVE — units engage what they meet');
  sfx('ui');
}
function orderMove(wx,wy,patrol,retreat){
  const sel=formationMembers();
  if(!sel.length) return false;
  if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(wx,wy,24);wx=p[0];wy=p[1];}
  const form=FORMS[selFormation].id;
  const targets=formationTargets(sel,wx,wy,form);
  const cohort=patrol?-1:allocMoveCohort(sel,targets,selFormation);
  /* Retreat/move-only is ustate 1: sim skips acquisition and will not chase a
     leftover lock. Attack-move stays ustate 2. Double-tap ground passes
     `retreat` so the A-MOVE toggle is not required to break contact. */
  const moveOnly=!patrol&&(retreat||moveMode);let routeField=-1;
  for(let k=0;k<sel.length;k++){
    const i=sel[k],T=TYPES[utype[i]],rawx=targets[k].x,rawy=targets[k].y;
    const legal=T.naval?(findWater(rawx,rawy)||[ux[i],uy[i]]):T.air?[rawx,rawy]:findLand(rawx,rawy);
    const tx=legal[0],ty=legal[1];
    ustate[i]=patrol?5:(moveOnly?1:2);
    utgt[i]=-1; utgtg[i]=-1;
    /* A-MOVE/patrol keep the click as hull goal while shooting. Retreat/MOVE
       must not: umarch is fire-on-the-move, the opposite of breaking contact. */
    umarch[i]=moveOnly?0:1;
    ufield[i]=T.air?-1:requestField(tx,ty,!!T.naval,mfNavUnitClearance(T)); uhold[i]=0;
    if(routeField<0&&ufield[i]>=0)routeField=ufield[i];
    uPatrolRoute[i]=-1;uPatrolStep[i]=0;
    /* A direct order replaces the plan, it does not append to it. Appending is
       the queue planner's job and it has its own commit. */
    queueClear(i);uGuard[i]=-1;
    uMoveCohort[i]=cohort;
    if(patrol){ upx1[i]=ux[i]; upy1[i]=uy[i]; upx2[i]=clamp(tx,15,MAP-15); upy2[i]=clamp(ty,15,MAP-15); }
    utx[i]=clamp(tx,15,MAP-15);
    uty[i]=clamp(ty,15,MAP-15);
    if(T.air&&typeof mfAirIssueMission==='function'){
      /* Air attack-move/patrol is CAP over the ordered area; MOVE is a direct
         relocation. Both enter the fixed-step air authority immediately so
         the generic state cannot be overwritten by its previous orbit. */
      mfAirIssueMission(i,(patrol||!moveOnly)?'cap':'none',{x:utx[i],y:uty[i]});
    }
  }
  addParticle(3,wx,wy,0,0,.5,26, patrol?120:65, patrol?255:200, patrol?170:255);
  if(!patrol){
    /* The route the field will actually walk, drawn at the moment of the
       order (src/ui/orderfx.js) - amber for attack-move, cyan for move. */
    if(typeof moveFxOrder==='function') moveFxOrder(sel,wx,wy,routeField,moveOnly?1:0);
    /* And the formation footprint. This reuses the confirm hologram that
       formation drags always had, so a plain tap now shows where each unit
       will STAND, not just where the tap landed. `noLine` suppresses the
       straight centroid->destination beam - the traced route above replaces
       it, and drawing both would show two contradictory paths whenever the
       field bends around water. */
    orderConfirm={x:wx,y:wy,members:sel.slice(),form:selFormation,
                  until:performance.now()+950,noLine:1};
  }
  markStopDisp(false);
  if(retreat) toast('➤ RETREAT — dropping combat');
  uiCommandAck(patrol?'patrol':(retreat?'retreat':'move'),sel.length,wx,wy);
  updateSelInfo();
  return true;
}
function patrolButtonState(){
  const b=document.getElementById('patrolBtn');if(!b)return;
  b.classList.toggle('on',!!armPatrol);
  const l=b.querySelector('span:nth-child(2)');
  if(l)l.textContent=armPatrol&&patrolDraft&&patrolDraft.pts.length>1?'START':'PATROL';
}
function beginPatrolDraft(){
  const sel=formationMembers();
  if(!sel.length){toast('Select units first');return false;}
  let x=0,y=0;for(const i of sel){x+=ux[i];y+=uy[i];}
  patrolDraft={members:sel.map(i=>[i,ugen[i]]),pts:[{x:x/sel.length,y:y/sel.length}],form:selFormation};
  disarmRally();
  armPatrol=true;armFormation=false;orderPreview=null;orderConfirm=null;patrolButtonState();
  toast('PATROL PLAN — tap up to 5 waypoints, then tap START');sfx('ui');return true;
}
function addPatrolWaypoint(wx,wy){
  if(!patrolDraft)return;
  let px=clamp(wx,20,MAP-20),py=clamp(wy,20,MAP-20);
  if(typeof battlefieldClampPoint==='function'){const q=battlefieldClampPoint(px,py,24);px=q[0];py=q[1];}
  const p={x:px,y:py};
  const last=patrolDraft.pts[patrolDraft.pts.length-1];
  if(Math.hypot(p.x-last.x,p.y-last.y)<35){toast('Place the next waypoint farther along the route');return;}
  if(patrolDraft.pts.length>=6){toast('Route has 5 waypoints — tap START');return;}
  patrolDraft.pts.push(p);patrolButtonState();
  addParticle(3,p.x,p.y,0,0,.55,28,120,255,190);
  toast('Waypoint '+(patrolDraft.pts.length-1)+' placed — add another or tap START');sfx('confirm');
}
function cancelPatrolDraft(quiet){
  armPatrol=false;patrolDraft=null;patrolButtonState();
  if(!quiet){toast('Patrol plan cancelled');sfx('reject');}
}
function patrolTargetRows(sel,pts,formId){
  const form=FORMS[formId].id,targets=[];
  for(let j=0;j<pts.length;j++){
    const prev=pts[(j-1+pts.length)%pts.length],next=pts[(j+1)%pts.length];
    targets.push(formationTargets(sel,pts[j].x,pts[j].y,form,Math.atan2(next.y-prev.y,next.x-prev.x)));
  }
  return targets;
}
function domainOrderPoint(i,P){
  const T=TYPES[utype[i]];
  if(T.air)return {x:P.x,y:P.y,field:-1};
  const L=T.naval?(findWater(P.x,P.y)||[ux[i],uy[i]]):findLand(P.x,P.y);
  return {x:L[0],y:L[1],field:requestField(L[0],L[1],!!T.naval,mfNavUnitClearance(T))};
}
/* Prune generation-stale handles and compact the remaining slots. Leaving a
   dead unit's hole in every waypoint gradually turns a damaged platoon into a
   sparse, lopsided route; adopting a recycled slot is worse. */
function refreshPatrolRoute(ri,force){
  const R=patrolRoutes[ri];if(!R)return false;
  const live=(R.members||[]).filter(e=>ualive[e[0]]&&ugen[e[0]]===e[1]&&uteam[e[0]]===0&&uPatrolRoute[e[0]]===ri);
  if(!live.length){patrolRoutes[ri]=null;return false;}
  if(force||live.length!==R.members.length){
    const sel=live.map(e=>e[0]);R.members=live;R.targets=patrolTargetRows(sel,R.pts,R.form);
    const step=R.step==null?1:R.step;
    for(let k=0;k<sel.length;k++){
      const i=sel[k],P=domainOrderPoint(i,R.targets[step][k]);uPatrolSlot[i]=k;uPatrolStep[i]=step;
      utx[i]=P.x;uty[i]=P.y;ufield[i]=P.field;
    }
  }
  return true;
}
/* A patrol corner is a platoon decision, not a per-unit trigger. The previous
   implementation let the first fast vehicle turn alone, while every slower
   hull remained on the old leg. A shared step waits for the formation, with a
   bounded quorum escape for a genuinely blocked straggler. */
function tickPatrolRoutes(dt){
  /* sim.js already calls this once per simulation tick; the queue planner and
     guard read-out ride it rather than adding a second clock. */
  tickOrderPlanning(dt);
  for(let ri=0;ri<patrolRoutes.length;ri++){
    const R=patrolRoutes[ri];if(!R)continue;
    R.gcT=(R.gcT||0)-dt;
    if(R.gcT<=0){R.gcT=.45;if(!refreshPatrolRoute(ri,false))continue;}
    const step=R.step==null?1:R.step,row=R.targets&&R.targets[step];if(!row)continue;
    let live=0,arrived=0,far=0;
    for(const e of R.members){
      const i=e[0];if(!ualive[i]||ugen[i]!==e[1]||uPatrolRoute[i]!==ri)continue;
      const P=row[uPatrolSlot[i]];if(!P)continue;
      const d=Math.hypot(ux[i]-P.x,uy[i]-P.y);far=Math.max(far,d);live++;
      if(d<=Math.max(15,TYPES[utype[i]].size*.58))arrived++;
    }
    if(!live)continue;
    for(const e of R.members){
      const i=e[0];if(!ualive[i]||ugen[i]!==e[1]||uPatrolRoute[i]!==ri)continue;
      const P=row[uPatrolSlot[i]],d=Math.hypot(ux[i]-P.x,uy[i]-P.y),lead=far-d;
      uCohesion[i]=d<=15&&far>38?.16:lead>150?.50:lead>78?.74:1;
    }
    R.legT=(R.legT||0)+dt;
    const need=live<=6?live:Math.ceil(live*.84);
    R.waitT=arrived>=need?(R.waitT||0)+dt:0;
    if(arrived===live||R.waitT>=1.1||(R.legT>22&&arrived>=Math.ceil(live*.6))){
      R.step=(step+1)%R.targets.length;R.legT=0;R.waitT=0;
      const next=R.targets[R.step];
      for(const e of R.members){
        const i=e[0];if(!ualive[i]||ugen[i]!==e[1]||uPatrolRoute[i]!==ri)continue;
        const raw=next[uPatrolSlot[i]];if(!raw)continue;
        const P=domainOrderPoint(i,raw);
        uPatrolStep[i]=R.step;utx[i]=P.x;uty[i]=P.y;ufield[i]=P.field;
      }
      R.pulse=performance.now()+1100;
    }
  }
}
function commitPatrolDraft(){
  if(!patrolDraft||patrolDraft.pts.length<2){cancelPatrolDraft(false);return false;}
  const sel=[],refs=[];
  for(const e of patrolDraft.members){
    if(ualive[e[0]]&&ugen[e[0]]===e[1]&&uteam[e[0]]===0){sel.push(e[0]);refs.push(e);}
  }
  if(!sel.length){cancelPatrolDraft(false);return false;}
  const pts=patrolDraft.pts.slice(),targets=patrolTargetRows(sel,pts,patrolDraft.form);
  const ri=patrolRoutes.length;
  patrolRoutes.push({pts,targets,form:patrolDraft.form,members:refs,step:1,legT:0,waitT:0,gcT:.45,created:performance.now()});
  for(let k=0;k<sel.length;k++){
    const i=sel[k],P=domainOrderPoint(i,targets[1][k]);
    uPatrolRoute[i]=ri;uPatrolStep[i]=1;uPatrolSlot[i]=k;uMoveCohort[i]=-1;
    queueClear(i);uGuard[i]=-1;
    ustate[i]=5;utgt[i]=-1;utgtg[i]=-1;uhold[i]=0;umarch[i]=1;ufield[i]=P.field;utx[i]=P.x;uty[i]=P.y;
    upx1[i]=targets[0][k].x;upy1[i]=targets[0][k].y;upx2[i]=P.x;upy2[i]=P.y;
  }
  const count=sel.length,nodes=pts.length-1;
  cancelPatrolDraft(true);uiCommandAck('patrol',count,pts[1].x,pts[1].y);
  toast('⟳ '+count+' units patrolling a '+nodes+'-waypoint formation loop');
  return true;
}
function togglePatrolPlanner(){
  if(!armPatrol){beginPatrolDraft();return;}
  if(patrolDraft&&patrolDraft.pts.length>1)commitPatrolDraft();else cancelPatrolDraft(false);
}
/* ---------- control groups (save with long-press, recall with tap) ---------- */
/* Groups store the slot AND its generation. Storing the bare index meant that
   when a member died and its slot was refilled, the group silently adopted the
   stranger that replaced it. */
const ctrlGroups=[[],[],[],[]],groupForms=[0,0,0,0];
let activePlatoon=-1;
const groupLive=g=>g.filter(e=>ualive[e[0]]&&ugen[e[0]]===e[1]&&uteam[e[0]]===0);
function saveGroup(n){
  const g=[];
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]) g.push([i,ugen[i]]);
    if(!g.length){toast('Select units first, then tap P'+(n+1)+' to assign'); return;}
  ctrlGroups[n]=g;groupForms[n]=selFormation;activePlatoon=n;
  updateGroupBadges();
  toast('PLATOON P'+(n+1)+' saved — '+g.length+' units · '+FORMS[selFormation].nm);sfx('level');
}
function recallGroup(n,focus){
  const g=groupLive(ctrlGroups[n]);
  ctrlGroups[n]=g;
  updateGroupBadges();
  if(!g.length){
    if(selCount()){ saveGroup(n); return; }
    toast('P'+(n+1)+' is empty — select units, then tap P'+(n+1)+' to assign');
    return;
  }
  clearSel();
  let cx2=0,cy2=0;
  for(const [i] of g){ usel[i]=1; cx2+=ux[i]; cy2+=uy[i]; }
  activePlatoon=n;setFormation(groupForms[n]||0,true);
  if(focus){cam.x=cx2/g.length;cam.y=cy2/g.length;clampCam();camUpdateMatrices();}
  toast('P'+(n+1)+' selected — '+g.length+' units · '+FORMS[selFormation].nm+(focus?' · camera focused':''));
  updateSelInfo(); uiCommandAck('select',g.length,cx2/g.length,cy2/g.length);
}
function updateGroupBadges(){
  for(let n=0;n<4;n++){
    const live=groupLive(ctrlGroups[n]);ctrlGroups[n]=live;
    const b=document.getElementById('grp'+(n+1)+'N');
    if(b)b.textContent=live.length||'—';
    const btn=document.getElementById('grpBtn'+(n+1));
    if(btn){btn.classList.toggle('saved',!!live.length);btn.classList.toggle('active',activePlatoon===n&&!!live.length);}
  }
}
function orderHold(){
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    uhold[i]=1;ustate[i]=0;utgt[i]=-1;utgtg[i]=-1;umarch[i]=0;
    utx[i]=ux[i];uty[i]=uy[i];uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
    queueClear(i);uGuard[i]=-1;n++;
    if(TYPES[utype[i]].air&&typeof mfAirIssueMission==='function')
      mfAirIssueMission(i,'none',{x:ux[i],y:uy[i]});
  }
  markStopDisp(false);
  if(n){ toast('⛊ '+n+' units holding position — they fire but never chase'); uiCommandAck('hold',n); updateSelInfo(); }
  return n;
}
function orderAttack(target){   // target: unit idx or -2-b
  let any=false;
  let ex,ey;
  if(target>=0){ ex=ux[target]; ey=uy[target]; }
  else { const B=blds[-2-target]; ex=B.x; ey=B.y; }
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    ustate[i]=2; utgt[i]=target; utgtg[i]=target>=0?ugen[target]:-1;
    /* Explicit attack is chase, not attack-move. A leftover march flag would
       keep walking the old ground click while the order said "that unit". */
    utx[i]=ex;uty[i]=ey;uhold[i]=0;umarch[i]=0;uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
    queueClear(i);uGuard[i]=-1;any=true;
    if(TYPES[utype[i]].air&&typeof mfAirIssueMission==='function')
      mfAirIssueMission(i,(target>=0&&TYPES[utype[target]].air)?'intercept':'strike',
        {x:ex,y:ey,target,generation:target>=0?ugen[target]:-1});
  }
  if(any){
    markStopDisp(false);
    addParticle(3,ex,ey,0,0,.5,30, 255,90,70); uiCommandAck('attack',selCount(),ex,ey);
    updateSelInfo();
  }
  return any;
}
/* ============================================================================
   GUARD (escort) + QUEUED WAYPOINTS — both touch-first.
   ----------------------------------------------------------------------------
   Neither order gets a desktop-only affordance. Shift-click exists here only as
   an accelerator on top of the touch path, never as the way in.

   WHY THE ORDERS DECK ONLY GAINS ONE BUTTON. #tacRow is five controls wide and
   #primaryRow already proves six is the ceiling inside the phone dock's
   minimap-bay padding at 412px (6*46 + 5*3 = 291px of 292px available). A
   seventh control would push PATROL under the minimap. So the queue planner —
   which genuinely needs a persistent, stateful control, because it is a mode
   with a commit — takes the one remaining slot, and GUARD rides the long press,
   the only touch gesture that can name a FRIENDLY target without also
   re-selecting it.

   WHY THE BUTTON IS BUILT HERE AND NOT IN index.html / ui.css. The in-match HUD
   markup and stylesheet have another owner mid-pass. Creating the control at
   load and appending it to #tacRow is the same trick main.js's ensureCamControl
   already uses for OTA shells that predate a button: it inherits the row's
   deck visibility, safe-area padding and .cbtn styling for free, and the HUD
   owner can move or restyle it later without touching orders code.
   ============================================================================ */
function guardLabel(h){
  if(h>=0) return TYPES[utype[h]].name;
  const B=blds[-2-h];
  return (B&&BT[B.type]&&BT[B.type].name)||'structure';
}
function orderGuard(h,quiet){
  if(!guardEntityLive(h,h>=0?ugen[h]:-1)) return false;
  const P=guardEntityPos(h);let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]&&i!==h){
    queueClear(i);
    ustate[i]=7; uGuard[i]=h; uGuardG[i]=h>=0?ugen[h]:-1;
    utgt[i]=-1; utgtg[i]=-1; uhold[i]=0; umarch[i]=0;
    uPatrolRoute[i]=-1; uMoveCohort[i]=-1; ufield[i]=-1;
    if(TYPES[utype[i]].air&&typeof mfAirIssueMission==='function')
      mfAirIssueMission(i,'escort',{x:P[0],y:P[1],escort:h,escortGeneration:h>=0?ugen[h]:-1});
    n++;
  }
  if(!n) return false;
  addParticle(3,P[0],P[1],0,0,.6,Math.max(34,P[2]*2.4), 120,255,190);
  if(!quiet) toast('⛨ GUARD — '+n+' unit'+(n===1?'':'s')+' escorting '+guardLabel(h));
  markStopDisp(false);
  uiCommandAck('guard',n,P[0],P[1]);
  updateSelInfo();
  return true;
}

let armQueue=false, queueDraft=null, guardFxT=0;
function queueButtonState(){
  const b=ensureQueueBtn(); if(!b) return;
  const n=queueDraft?queueDraft.steps.length:0;
  b.classList.toggle('on',!!armQueue);
  const l=b.querySelector('.lbl');
  if(l) l.textContent=armQueue?(n?'GO '+n:'TAP…'):'QUEUE';
}
function ensureQueueBtn(){
  let b=document.getElementById('queueBtn');
  if(b) return b;
  const row=document.getElementById('tacRow');
  if(!row) return null;
  b=document.createElement('button');
  b.type='button'; b.id='queueBtn'; b.className='cbtn';
  b.setAttribute('aria-label','Chain waypoints for the selected units');
  b.innerHTML='<span class="em">⇢</span><span class="lbl">QUEUE</span>';
  /* Before CLEAR so cancelling the selection stays the last thing in the row. */
  row.insertBefore(b,document.getElementById('clearBtn')||null);
  b.addEventListener('pointerdown',ev=>{ ev.preventDefault(); toggleQueuePlanner(); });
  return b;
}
function beginQueueDraft(){
  const sel=formationMembers();
  if(!sel.length){ toast('Select units first'); sfx('reject'); return false; }
  if(armPatrol) cancelPatrolDraft(true);
  disarmRally();
  armFormation=false; orderPreview=null; orderConfirm=null;
  const fb=document.getElementById('formBtn'); if(fb) fb.classList.remove('on');
  queueDraft={members:sel.map(i=>[i,ugen[i]]),steps:[],form:selFormation,fx:null,fxT:0};
  armQueue=true; queueButtonState();
  toast('⇢ ORDER QUEUE — tap ground, an enemy, or one of your own, or drag a path, up to '
        +QUEUE_MAX+' orders, then tap GO');
  sfx('ui'); return true;
}
function cancelQueueDraft(quiet){
  if(queueDraft) queueFxDrop(queueDraft);
  armQueue=false; queueDraft=null; queueButtonState();
  if(!quiet){ toast('Order queue cancelled'); sfx('reject'); }
}
/* A queued chain has to stay on the ground BETWEEN taps, and both route
   renderers only know how to draw `patrolDraft`. Rather than reach into files
   the HUD and graphics owners hold, the chain is published as an order-FX
   polyline — src/ui/orderfx.js already draws those as marching chevrons — with
   a lifetime the planner keeps refreshing. Straight legs are honest here: the
   player placed the nodes, and each leg's real flow route is only solved when
   that node becomes the live order. */
function queueFxPush(sx,sy,steps,until){
  if(typeof moveFxList==='undefined'||!steps.length) return null;
  const pts=[{x:sx,y:sy}];
  for(const s of steps) pts.push({x:s.x,y:s.y});
  let len=0; const arc=[0];
  for(let k=1;k<pts.length;k++){
    len+=Math.hypot(pts[k].x-pts[k-1].x,pts[k].y-pts[k-1].y); arc.push(len);
  }
  if(len<24) return null;
  const fx={pts,arc,len,kind:0,born:performance.now(),until};
  moveFxList.push(fx);
  while(moveFxList.length>MOVE_FX_MAX) moveFxList.shift();
  return fx;
}
function queueFxDrop(D){
  if(!D||!D.fx||typeof moveFxList==='undefined') return;
  const k=moveFxList.indexOf(D.fx); if(k>=0) moveFxList.splice(k,1);
  D.fx=null;
}
function queueAddStep(wx,wy,pk,quiet){
  const D=queueDraft; if(!D) return;
  const last=D.steps[D.steps.length-1];
  if(last&&last.t===2){ if(!quiet){ toast('GUARD ends the chain — tap GO'); sfx('reject'); } return; }
  if(D.steps.length>=QUEUE_MAX){ if(!quiet){ toast('Queue is full — tap GO to execute'); sfx('reject'); } return; }
  let px=clamp(wx,20,MAP-20),py=clamp(wy,20,MAP-20);
  if(typeof battlefieldClampPoint==='function'){ const q=battlefieldClampPoint(px,py,24); px=q[0]; py=q[1]; }
  let step,what;
  const inDraft=h=>{ for(const e of D.members) if(e[0]===h) return true; return false; };
  const b=pickBld(wx,wy);
  if(pk&&pk.enemy>=0){
    step={t:1,x:ux[pk.enemy],y:uy[pk.enemy],h:pk.enemy,g:ugen[pk.enemy],mv:0};
    what='ATTACK '+TYPES[utype[pk.enemy]].name;
  } else if(pk&&pk.own>=0&&!inDraft(pk.own)){
    step={t:2,x:ux[pk.own],y:uy[pk.own],h:pk.own,g:ugen[pk.own],mv:0};
    what='GUARD '+TYPES[utype[pk.own]].name;
  } else if(b>=0&&blds[b].team!==0){
    const B=blds[b]; step={t:1,x:B.x,y:B.y,h:-2-b,g:-1,mv:0};
    what='ATTACK '+guardLabel(-2-b);
  } else if(b>=0&&!quiet){
    /* Drag-path samples skip friendly structures: a stroke across your own
       yard must not turn into a GUARD of the HQ. A deliberate TAP still can. */
    const B=blds[b]; step={t:2,x:B.x,y:B.y,h:-2-b,g:-1,mv:0};
    what='GUARD '+guardLabel(-2-b);
  } else {
    step={t:0,x:px,y:py,h:-1,g:-1,mv:moveMode?1:0};
    what=moveMode?'MOVE':'ATTACK-MOVE';
  }
  D.steps.push(step);
  queueFxDrop(D); D.fxT=0;                        // polyline changed: rebuild next tick
  addParticle(3,step.x,step.y,0,0,.55,30, 150,220,255);
  queueButtonState();
  if(quiet) return;
  toast('⇢ '+D.steps.length+'. '+what+(step.t===2?' — final step':'')+' · add more or tap GO');
  sfx('confirm');
}
function commitQueueDraft(){
  const D=queueDraft;
  if(!D||!D.steps.length){ cancelQueueDraft(false); return false; }
  const sel=[];
  for(const e of D.members) if(ualive[e[0]]&&ugen[e[0]]===e[1]&&uteam[e[0]]===0) sel.push(e[0]);
  if(!sel.length){ cancelQueueDraft(false); return false; }
  let cx=0,cy=0;
  for(const i of sel){ cx+=ux[i]; cy+=uy[i]; }
  cx/=sel.length; cy/=sel.length;
  /* One formation row per ground node, headed along the leg — the same solve
     patrol legs use — so a queued route arrives in formation at every waypoint
     instead of piling the whole force onto the pixel that was tapped. */
  const form=FORMS[D.form].id, rows=[];
  let px=cx,py=cy;
  for(const s of D.steps){
    rows.push(s.t===0?formationTargets(sel,s.x,s.y,form,Math.atan2(s.y-py,s.x-px)):null);
    px=s.x; py=s.y;
  }
  for(let k=0;k<sel.length;k++){
    const i=sel[k];
    uQueue[i]=D.steps.map((s,q)=>rows[q]
      ?{t:0,x:rows[q][k].x,y:rows[q][k].y,h:-1,g:-1,mv:s.mv}
      :{t:s.t,x:s.x,y:s.y,h:s.h,g:s.g,mv:s.mv});
    uhold[i]=0; uPatrolRoute[i]=-1; uMoveCohort[i]=-1; utgt[i]=-1; utgtg[i]=-1;
    /* Start node one immediately. queueTick would otherwise wait for the unit
       to "arrive" at whatever its previous order was still pointing at. */
    queueNext(i);
  }
  const n=sel.length, nodes=D.steps.length, fx0=D.steps[0];
  queueFxDrop(D);
  queueFxPush(cx,cy,D.steps,performance.now()+MOVE_FX_LIFE*1.8);
  armQueue=false; queueDraft=null; queueButtonState();
  toast('⇢ '+n+' unit'+(n===1?'':'s')+' executing a '+nodes+'-step order queue');
  uiCommandAck('patrol',n,fx0.x,fx0.y);           // "Route uploaded"
  return true;
}
function toggleQueuePlanner(){
  if(!armQueue){ beginQueueDraft(); return; }
  if(queueDraft&&queueDraft.steps.length) commitQueueDraft(); else cancelQueueDraft(false);
}
/* Draft upkeep and the guard read-out. Rides tickPatrolRoutes (below) because
   sim.js already calls that once per simulation tick and neither of these
   deserves a second timer. */
function tickOrderPlanning(dt){
  if(armQueue&&queueDraft){
    const D=queueDraft;
    let cx=0,cy=0,n=0;
    for(const e of D.members) if(ualive[e[0]]&&ugen[e[0]]===e[1]){ cx+=ux[e[0]]; cy+=uy[e[0]]; n++; }
    /* Every drafted unit is gone — including the resetWorld case, where the
       whole army dies at once. Cancelling here is why the planner needs no
       hook in main.js's reset. */
    if(!n) cancelQueueDraft(true);
    else {
      D.fxT-=dt;
      if(D.fxT<=0){
        D.fxT=.5;
        if(D.fx&&moveFxList.indexOf(D.fx)<0) D.fx=null;   // newer orders shifted it out
        if(!D.fx) D.fx=queueFxPush(cx/n,cy/n,D.steps,performance.now()+6e5);
        else D.fx.until=performance.now()+6e5;
        for(const s of D.steps) addParticle(3,s.x,s.y,0,0,.5,26, 150,220,255);
      }
    }
  }
  guardFxT-=dt;
  if(guardFxT>0) return;
  guardFxT=1.4;
  /* One soft ring per guarded thing, so an escort order stays legible on the
     ground after its confirmation particle has gone. Deliberately slow and
     capped: this is a read-out, not a per-unit effect. */
  const seen=[];
  for(let i=0;i<unitHigh&&seen.length<6;i++){
    if(!ualive[i]||uteam[i]!==0||ustate[i]!==7) continue;
    const h=uGuard[i];
    if(h===-1||seen.indexOf(h)>=0||!guardEntityLive(h,uGuardG[i])) continue;
    seen.push(h);
    const P=guardEntityPos(h);
    addParticle(3,P[0],P[1],0,0,.75,Math.max(30,P[2]*2.2), 110,235,190);
  }
}
function pickUnit(wx,wy){
  const pickR=Math.max(16,orthoSpan*0.012,
    (typeof mfIconStackOn==='function'&&mfIconStackOn()&&typeof mfIconStackCell==='function')
      ?mfIconStackCell()*0.55:0);
  let best=-1,bd=pickR*pickR, bestEnemy=-1,bde=pickR*pickR;
  forUnitsIn(wx,wy,pickR,j=>{
    const d=dist2(wx,wy,ux[j],uy[j]);
    if(uteam[j]===0){ if(d<bd){bd=d;best=j;} }
    else if(fogEntityVisible(uteam[j],ux[j],uy[j])){ if(d<bde){bde=d;bestEnemy=j;} }
  });
  if(typeof mfIconStackPick==='function'){
    const ownSt=mfIconStackPick(wx,wy,0);
    if(ownSt>=0) best=ownSt;
    const enSt=mfIconStackPick(wx,wy,1);
    if(enSt>=0&&bestEnemy<0) bestEnemy=enSt;
  }
  return {own:best, enemy:bestEnemy};
}
/* Pointer selection is a screen-space question. The world-radius picker above
   remains the right API for scripts/orders that already have a world point,
   but at command zoom its expanding radius could select a unit whose drawn
   hull did not overlap the finger at all. Keep forUnitsIn as the broad phase,
   then require the pointer to touch a projected, facing-aware hull (or the
   tactical icon that replaced it). The only forgiveness is a bounded CSS-px
   allowance: precise mouse, slightly wider pen, full fingertip for touch. */
function mfPointerPickAllowance(pointerType){
  return pointerType==='mouse'?6:pointerType==='pen'?8:10;
}
function mfPointerSegDist2(px,py,ax,ay,bx,by){
  const dx=bx-ax,dy=by-ay,dd=dx*dx+dy*dy;
  const t=dd>1e-8?clamp(((px-ax)*dx+(py-ay)*dy)/dd,0,1):0;
  const x=ax+dx*t,y=ay+dy*t;
  return dist2(px,py,x,y);
}
function mfPointerHull(points){
  if(points.length<=2) return points.slice();
  const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const lo=[],hi=[];
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const q of p){ while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop(); lo.push(q); }
  for(let k=p.length-1;k>=0;k--){ const q=p[k]; while(hi.length>1&&cross(hi[hi.length-2],hi[hi.length-1],q)<=0)hi.pop(); hi.push(q); }
  lo.pop();hi.pop();return lo.concat(hi);
}
function mfPointerHullHit(sx,sy,hull,allow){
  if(!hull.length) return false;
  let inside=false;
  for(let i=0,j=hull.length-1;i<hull.length;j=i++){
    const a=hull[i],b=hull[j];
    if(((a[1]>sy)!==(b[1]>sy))&&sx<(b[0]-a[0])*(sy-a[1])/((b[1]-a[1])||1e-9)+a[0]) inside=!inside;
    if(mfPointerSegDist2(sx,sy,a[0],a[1],b[0],b[1])<=allow*allow) return true;
  }
  return inside;
}
function mfPointerUnitGround(T,i){
  if(typeof unitGroundY==='function') return unitGroundY(T,ux[i],uy[i],i);
  if(T.air) return terrainH(ux[i],uy[i])+(typeof unitAirAlt==='function'?unitAirAlt(i):58);
  if(T.naval) return (typeof waterSurfaceY==='function'?waterSurfaceY(ux[i],uy[i]):0)+.95;
  return terrainH(ux[i],uy[i]);
}
function mfPointerUnitMetric(i,sx,sy,allow){
  const T=TYPES[utype[i]]; if(!T) return Infinity;
  const vs=Math.max(4,T.size*(T.vscale||1)),ang=(uang[i]||0)-Math.PI*.5;
  const ca=Math.cos(ang),sa=Math.sin(ang),rx=-sa,ry=ca;
  const hf=vs*(T.naval?1.72:T.air?1.42:T.legs ? .92:1.28);
  const hw=vs*(T.naval ? .62:T.air ? .78:T.legs ? .66:.82);
  const ht=vs*(T.air ? .92:T.naval ? .72:T.legs?1.62:1.12);
  const h0=mfPointerUnitGround(T,i),pts=[];
  for(const z of [0,ht]) for(const f of [-hf,hf]) for(const w of [-hw,hw])
    pts.push(w2s(ux[i]+ca*f+rx*w,uy[i]+sa*f+ry*w,h0+z));
  const hull=mfPointerHull(pts),bodyHit=mfPointerHullHit(sx,sy,hull,allow);
  const mid=w2s(ux[i],uy[i],h0+ht*.5),wp=Math.max(.01,orthoSpan/Math.max(1,VH));
  let metric=bodyHit?dist2(sx,sy,mid[0],mid[1])/Math.max(16,(vs/wp)*(vs/wp)):Infinity;
  /* A tactical icon is presentation, not decoration: once it fades over or
     replaces a mesh, its visible plate is the selectable silhouette. */
  const iconQ=Math.max(
    typeof mfIconQ==='function'&&typeof mfUnitSpan==='function'?mfIconQ(mfUnitSpan(T)):0,
    typeof mfCmdIconQ==='function'?mfCmdIconQ(T):0);
  if(iconQ>0){
    const c=w2s(ux[i],uy[i],h0+2),d=typeof mfIconDpx==='function'?mfIconDpx(T):clamp(18+vs*.36,22,40)*wp;
    const r=d/wp*.5+allow,dm=dist2(sx,sy,c[0],c[1]);
    if(dm<=r*r) metric=Math.min(metric,dm/Math.max(16,r*r));
  }
  return metric;
}
function mfPointerStackMetric(lead,sx,sy,allow){
  if(lead<0||!ualive[lead]||!fogEntityVisible(uteam[lead],ux[lead],uy[lead])) return Infinity;
  const T=TYPES[utype[lead]],C=typeof mfIconStackCentroid==='function'?mfIconStackCentroid(lead):[ux[lead],uy[lead],1];
  const x=C[0],y=C[1],n=C[2]||1,wp=Math.max(.01,orthoSpan/Math.max(1,VH));
  const h=T.naval?1.5:mfPointerUnitGround(T,lead)+2,c=w2s(x,y,h);
  const d=(typeof mfIconDpx==='function'?mfIconDpx(T):clamp(18+T.size*.36,22,40)*wp)
    *(1+Math.min(.35,Math.log(n)*.12));
  const r=d/wp*.5+allow,dm=dist2(sx,sy,c[0],c[1]);
  return dm<=r*r?dm/Math.max(16,r*r):Infinity;
}
function pickUnitPointer(wx,wy,sx,sy,pointerType){
  const allow=mfPointerPickAllowance(pointerType),wp=Math.max(.01,orthoSpan/Math.max(1,VH));
  let maxSpan=48;
  for(let k=0;k<TYPES.length;k++) if(TYPES[k]) maxSpan=Math.max(maxSpan,TYPES[k].size*(TYPES[k].vscale||1)*3.4);
  /* Broad only: the result cannot be accepted until its projected hull hits. */
  const broad=maxSpan+allow*wp+48;
  let own=-1,enemy=-1,om=Infinity,em=Infinity;
  const stackTeams=new Set([0]);
  const take=(j,m)=>{
    if(!isFinite(m)) return;
    if(uteam[j]===0){ if(m<om-1e-9||(Math.abs(m-om)<=1e-9&&(own<0||j<own))){om=m;own=j;} }
    else if(fogEntityVisible(uteam[j],ux[j],uy[j])&&(m<em-1e-9||(Math.abs(m-em)<=1e-9&&(enemy<0||j<enemy)))){em=m;enemy=j;}
  };
  forUnitsIn(wx,wy,broad,j=>{
    stackTeams.add(uteam[j]);
    if(uteam[j]!==0&&!fogEntityVisible(uteam[j],ux[j],uy[j])) return;
    if(typeof mfIconStackSkip==='function'&&mfIconStackSkip(j)) return;
    take(j,mfPointerUnitMetric(j,sx,sy,allow));
  });
  if(typeof mfIconStackPick==='function'){
    for(const team of stackTeams){
      const lead=mfIconStackPick(wx,wy,team);
      if(lead>=0) take(lead,mfPointerStackMetric(lead,sx,sy,allow));
    }
  }
  return {own:own,enemy:enemy};
}
/* One pointer read owns unit + structure arbitration. Friendly structures keep
   their established precedence over parked friendly units; a visible enemy
   unit remains attackable over a structure when a force is selected. */
function pickPointerEntities(wx,wy,sx,sy,pointerType){
  const pk=pickUnitPointer(wx,wy,sx,sy,pointerType),b=pickBld(wx,wy,sx,sy);
  if(b>=0&&blds[b]&&blds[b].team===0) pk.own=-1;
  pk.bld=b;
  return pk;
}
/* Structure placement is rectangle/rotation aware, but selection used the
   legacy circular `B.r` radius. A Factory corner or the upper, projected half
   of a tall structure could therefore ray-pick as empty ground; if workers
   were parked there, their strategic stack consumed the tap and produced a
   notice instead of opening production. Keep the forgiving touch pad, but
   test the real reserved footprint first. */
function bldPickFoot(B){
  if(!B||typeof bldFoot!=='function') return null;
  try{
    const f=bldFoot(B);
    return f&&isFinite(f[0])&&isFinite(f[1])?[Math.max(1,f[0]),Math.max(1,f[1])]:null;
  }catch(_){ return null; }
}
function bldWorldPick(B,wx,wy,pad){
  const f=bldPickFoot(B);
  if(f){
    const a=B.rot||0,dx=wx-B.x,dy=wy-B.y,c=Math.cos(a),s=Math.sin(a);
    const lx=dx*c+dy*s,ly=-dx*s+dy*c;
    return Math.abs(lx)<=f[0]*.5+pad&&Math.abs(ly)<=f[1]*.5+pad;
  }
  const r=(B.r||12)+pad;
  return dist2(wx,wy,B.x,B.y)<=r*r;
}
function screenQuadHit(sx,sy,q){
  let sign=0;
  for(let i=0;i<4;i++){
    const a=q[i],b=q[(i+1)&3],cross=(sx-a[0])*(b[1]-a[1])-(sy-a[1])*(b[0]-a[0]);
    if(Math.abs(cross)<.5) continue;
    if(sign&&cross*sign<0) return false;
    sign=cross;
  }
  return !!sign;
}
/* `s2w()` deliberately hits terrain, not a model mesh. For a tall structure
   this means a tap on the roof maps to ground behind its footprint. Test the
   projected rectangular prism only as a fallback after an exact ground-foot
   hit; that makes the visible model tappable without letting it steal a closer
   ground target. */
function bldScreenPick(B,sx,sy){
  const f=bldPickFoot(B);
  if(!f||typeof w2s!=='function'||!isFinite(sx)||!isFinite(sy)) return false;
  const a=B.rot||0,c=Math.cos(a),s=Math.sin(a),hx=f[0]*.5,hy=f[1]*.5;
  const T=typeof BT!=='undefined'&&BT[B.type],lift=Math.max(8,Math.min(130,((T&&T.size)||B.r*2||24)*1.35));
  const base=[],top=[];
  for(const p of [[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]]){
    const x=B.x+p[0]*c-p[1]*s,y=B.y+p[0]*s+p[1]*c;
    const h=typeof terrainH==='function'?terrainH(x,y):0;
    base.push(w2s(x,y,h)); top.push(w2s(x,y,h+lift));
  }
  if(screenQuadHit(sx,sy,base)||screenQuadHit(sx,sy,top)) return true;
  for(let i=0;i<4;i++) if(screenQuadHit(sx,sy,[base[i],base[(i+1)&3],top[(i+1)&3],top[i]])) return true;
  return false;
}
function pickBld(wx,wy,sx,sy){
  const pad=clamp((orthoSpan||800)*.01,10,22);
  let world=-1,worldD=Infinity,screen=-1,screenD=Infinity;
  for(let b=0;b<blds.length;b++){
    const B=blds[b];
    if(!B||!B.alive||!fogEntityVisible(B.team,B.x,B.y)) continue;
    const d=dist2(wx,wy,B.x,B.y);
    if(bldWorldPick(B,wx,wy,pad)){
      if(d<worldD){ world=b; worldD=d; }
      continue;
    }
    if(sx!=null&&sy!=null&&bldScreenPick(B,sx,sy)){
      const P=w2s(B.x,B.y,(typeof terrainH==='function'?terrainH(B.x,B.y):0)+((BT[B.type]||{}).size||B.r*2||24)*.68);
      const sd=dist2(sx,sy,P[0],P[1]);
      if(sd<screenD){ screen=b; screenD=sd; }
    }
  }
  return world>=0?world:screen;
}

let armRally=-1, armPatrol=false, lastSelT=0, lastSelType=-1, lastTapShift=false;
let lastGroundT=0, lastGroundX=0, lastGroundY=0;
/* 500ms / 80px is the C&C3 / SupCom2 double-tap window, in SCREEN pixels so
   a command-camera pan between contacts does not break it. lastGroundT>0
   rejects the page-load false positive (tnow-0<500 during the first half
   second of a reload). */
const GROUND_DBL_MS=500, GROUND_DBL_PX=80;
function groundDoubleTap(sx,sy){
  return lastGroundT>0 && performance.now()-lastGroundT<GROUND_DBL_MS
    && Math.hypot(sx-lastGroundX,sy-lastGroundY)<GROUND_DBL_PX;
}
function stampGroundTap(sx,sy,consumed){
  lastGroundT=consumed?0:performance.now();
  lastGroundX=sx; lastGroundY=sy;
}
let novaSrc=-1;
function onTap(sx,sy,pointerType){
  const [wx,wy]=s2w(sx,sy);
  if(aiming===5){
    const picked=pickUnitPointer(wx,wy,sx,sy,pointerType||'touch'),target=picked.enemy;
    beginArtilleryBarrage(wx,wy,target>=0?target:undefined,target>=0?ugen[target]:undefined);
    return;
  }
  if(aiming===6){ fireCommanderActive(wx,wy); return; }
  if(aiming===7){ fireCommanderWeapon(0,wx,wy); return; }
  if(aiming===8){ fireCommanderWeapon(1,wx,wy); return; }
  if(aiming===4){ fireCommanderJump(wx,wy); return; }
  if(aiming===0){ fireBlast(wx,wy); return; }
  if(aiming===3){ fireLance(wx,wy); return; }
  /* WHY: Skycrane UNLOAD and Massflesh BIRTH are map-aim modes. Dispatch them
     here (not only via airlift.js's onTap wrap) so a later input rewrite cannot
     leave those orders as toasts with no confirm. */
  if(aiming===9&&typeof mfAirliftConfirmAim==='function'){ mfAirliftConfirmAim(wx,wy); return; }
  if(aiming===10&&typeof mfMassConfirmAim==='function'){ mfMassConfirmAim(wx,wy); return; }
  if(aiming===2){                               // NOVA strike targeting
    aiming=-1;
    const b3=novaSrc; novaSrc=-1;
    if(!novaFire(b3,wx,wy)) toast('NOVA is not ready');
    return;
  }
  // rally flag placement (armed from a factory menu; armRally = building index)
  if(armRally>=0){
    const bi2=armRally; armRally=-1;
    if(blds[bi2]&&blds[bi2].alive){
      let rx=clamp(wx,20,MAP-20),ry=clamp(wy,20,MAP-20);
      if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(rx,ry,24);rx=p[0];ry=p[1];}
      blds[bi2].rally={x:rx,y:ry};
      addParticle(3,wx,wy,0,0,.5,30, 120,255,170);
      toast('⚑ Rally point set — new units will gather there');
      sfx('ui');
    }
    return;
  }
  // pre-deployment: taps steer the carrier to your chosen landing ground
  if(carrier.active&&carrier.phase===1){
    let cx=clamp(wx,60,MAP-60),cy=clamp(wy,60,MAP-60);
    if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(cx,cy,80);cx=p[0];cy=p[1];}
    carrier.tx=cx; carrier.ty=cy;
    addParticle(3,carrier.tx,carrier.ty,0,0,.5,32, 120,220,255);
    uiCommandAck('deploy',1,carrier.tx,carrier.ty);
    return;
  }
  if(carrier.active) return;                    // still falling — ignore taps
  /* Only real pointer gestures take the silhouette path. A legacy/programmatic
     onTap call with no pointer type retains the historical world picker. */
  const pp=pointerType?pickPointerEntities(wx,wy,sx,sy,pointerType):null;
  const pk=pp||pickUnit(wx,wy);
  const b=pp?pp.bld:pickBld(wx,wy,sx,sy);
  const haveSel=selCount()>0;
  /* Queue planning owns every map tap while it is armed — including taps on
     units and structures, which is what makes "chain an attack then an escort"
     reachable with one thumb. It is checked before selection so a tap on a
     friendly appends a GUARD step instead of throwing the draft's roster away. */
  if(armQueue && queueDraft){ queueAddStep(wx,wy,pk); return; }
  /* DESKTOP ACCELERATOR, NOT THE WAY IN. Shift-click arms the same planner and
     appends to it, and releasing Shift commits (see the keyup below). It is a
     shortcut onto the touch machinery — there is deliberately no order here
     that a phone cannot reach. */
  if(lastTapShift && haveSel && !armPatrol && !placing && beginQueueDraft()){
    queueDraft.viaShift=true;
    queueAddStep(wx,wy,pk);
    return;
  }
  // patrol order (armed from the tactics bar)
  if(armPatrol && haveSel){
    addPatrolWaypoint(wx,wy);
    return;
  }
  if(armPatrol)cancelPatrolDraft(true);
  // A visible enemy still owns the tap, even when standing over one of our
  // structure footprints. This preserves the direct attack gesture while the
  // building-first rule below only resolves friendly stack/building overlap.
  if(pk.enemy>=0 && haveSel){ lastGroundT=0; orderAttack(pk.enemy); return; }
  /* A structure footprint is a more precise target than the strategic unit
     stack plate drawn above it. Resolving the plate first made constructors
     parked at a factory select as a STACK, close every sheet and emit notices;
     the production building directly under the finger was unreachable. Armed
     queue/patrol modes still own the tap above, while an ordinary direct hit on
     one of our structures now opens its real menu. */
  if(b>=0&&blds[b].team===0){
    lastGroundT=0;
    clearSel();openBldMenu(b);return;
  }
  /* WHY: pickUnit's radius at command camera is often larger than the empty
     ground between selected hulls. A double-tap meant as retreat hit an own
     unit, reset lastGroundT, and became select-all. If the first tap was a
     ground order, the second contact at the same screen point is retreat —
     even when a friendly silhouette is inside the pick disc. Enemy / building
     taps still win so this cannot steal attack or a factory menu. */
  if(haveSel && groundDoubleTap(sx,sy) && pk.enemy<0 && b<0){
    stampGroundTap(sx,sy,true);
    orderMove(wx,wy,false,true);
    return;
  }
  // own unit tapped → select (double-tap = select all of that type on screen)
  if(pk.own>=0){
    lastGroundT=0;
    const tnow=performance.now();
    if(tnow-lastSelT<430 && utype[pk.own]===lastSelType){
      const b2=camBounds(); let n2=0;
      clearSel();
      for(let i=0;i<unitHigh;i++)
        if(ualive[i]&&uteam[i]===0&&utype[i]===lastSelType
           &&ux[i]>=b2.x0&&ux[i]<=b2.x1&&uy[i]>=b2.y0&&uy[i]<=b2.y1){ usel[i]=1; n2++; }
      toast('⚔ '+n2+'× '+TYPES[lastSelType].name+' selected — camera locked on');
      lastSelT=0;
      camFollow=pk.own; camFollowT=2.4;            // glide in and track it
      distTarget=clamp(Math.max(orthoSpan*0.5,zoomSpanMin()),zoomSpanMin(),zoomSpanMax());   // close on the unit, into tactical mesh
      updateSelInfo(); uiCommandAck('select',n2,ux[pk.own],uy[pk.own]); closeMenus(); return;
    }
    lastSelT=tnow; lastSelType=utype[pk.own];
    if(typeof mfIconStackSkip==='function'&&mfIconStackSkip(pk.own)
       &&typeof mfIconStackSelect==='function'&&mfIconStackSelect(pk.own)){
      uiCommandAck('select',selCount(),ux[pk.own],uy[pk.own]); closeMenus(); return;
    }
    clearSel(); usel[pk.own]=1; updateSelInfo(); uiCommandAck('select',1,ux[pk.own],uy[pk.own]);
    closeMenus(); return;
  }
  // building tapped
  if(b>=0){
    lastGroundT=0;
    const B=blds[b];
    if(B.team===0){ clearSel(); openBldMenu(b); return; }
    else if(haveSel){ orderAttack(-2-b); return; }
  }
  // ground → move/attack-move; double-tap empty ground = retreat (C&C3 / SupCom2)
  if(haveSel){
    const retreat=groundDoubleTap(sx,sy);
    stampGroundTap(sx,sy,retreat);
    orderMove(wx,wy,false,retreat);
    return;
  }
  closeMenus();
}

let dragGhost=false, holdTimer=0;
/* One threshold for tap vs intel-card hold. A press that lasted 400–520 ms
   used to do nothing: onTap required <400 while the card armed at 520, so a
   careful aim in a crowd produced no order and no card. Shorter than this
   is a tap; reaching it is the hold. Keep 520 so expert long-press feel is
   unchanged — only the dead zone closes. */
const HOLD_MS=520;
/* Thumb contact jitter. 9px `moved` is below a real finger; 220ms is a tap. */
const TAP_JITTER_MS=220, TAP_JITTER_PX=28;
cv.addEventListener('pointerdown',e=>{
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  const rec={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false,held:false,
             shift:!!e.shiftKey,pointerType:e.pointerType||'touch',t:performance.now()};
  ptrs.set(e.pointerId,rec);
  if(aiming===5&&ptrs.size===1){
    const [bwx,bwy]=s2w(e.clientX,e.clientY);setArtBarragePreview(bwx,bwy);
    clearTimeout(holdTimer);return;
  }
  /* Double-tap retreat is decided on pointerdown, not pointerup.
     WHY the previous path never fired on packed 8901:
     1. Formation preview stole the second contact and called orderMove
        without `retreat`, and never wrote lastGroundT.
     2. pickUnit at command camera treated "empty" ground next to the army
        as a unit tap and reset lastGroundT (select-all, not retreat).
     3. A 9px jitter marked the first contact `moved`, so onTap never ran
        and lastGroundT was never written — the second tap was a single
        attack-move.
     The 260ms radio gate is audio-only (audio.js already exempts retreat)
     and was not the order failure. War Table leftovers are display:none
     during a match and do not receive canvas pointers.
     Queue / patrol keep the tap: those modes own the map. */
  if(ptrs.size===1 && !placing && !boxMode && running && selCount()
     && !armQueue && !armPatrol && aiming<0 && groundDoubleTap(e.clientX,e.clientY)){
    const [wx,wy]=s2w(e.clientX,e.clientY);
    const pp=pickPointerEntities(wx,wy,e.clientX,e.clientY,e.pointerType||'touch');
    if(pp.enemy<0 && pp.bld<0){
      rec.held=true; rec.retreat=1;
      armFormation=false; orderPreview=null;
      const fb=document.getElementById('formBtn'); if(fb) fb.classList.remove('on');
      stampGroundTap(e.clientX,e.clientY,true);
      orderMove(wx,wy,false,true);
      clearTimeout(holdTimer);
      return;
    }
  }
  if(ptrs.size===1&&armFormation&&!placing&&!boxMode&&running&&selCount()){
    const [wx,wy]=s2w(e.clientX,e.clientY);
    const pp=typeof battlefieldClampPoint==='function'?battlefieldClampPoint(wx,wy,24):[clamp(wx,15,MAP-15),clamp(wy,15,MAP-15)];
    orderConfirm=null;
    orderPreview={pid:e.pointerId,x:pp[0],y:pp[1],
                  members:formationMembers(),form:selFormation};
    clearTimeout(holdTimer);return;
  }
  // long-press on a unit/building → intel card
  clearTimeout(holdTimer);
  if(ptrs.size===1 && !placing && !boxMode && running){
    const [hwx,hwy]=s2w(e.clientX,e.clientY);
    holdTimer=setTimeout(()=>{
      const p=ptrs.get(e.pointerId);
      if(!p||p.moved||p.held||ptrs.size!==1) return;
      const pp2=pickPointerEntities(hwx,hwy,e.clientX,e.clientY,e.pointerType||'touch');
      const pk2=pp2;
      const ui2=pk2.own>=0?pk2.own:pk2.enemy;
      const bi2=ui2<0?pp2.bld:-1;
      /* GUARD rides the long press (see the orders block above for why it gets
         no dock button). It only fires on a FRIENDLY that is not already part
         of the selection, so the intel card keeps every other long press:
         nothing selected, an enemy, neutral ground, or a unit you already hold.
         "Press something of mine while holding a force" has no other meaning. */
      const ownBld=bi2>=0&&blds[bi2]&&blds[bi2].team===0;
      const ownUnit=pk2.own>=0&&!usel[pk2.own];
      if(selCount()&&(ownUnit||ownBld)&&!armQueue&&!armPatrol&&!placing){
        p.held=true;
        if(orderGuard(ownUnit?pk2.own:-2-bi2)){ if(typeof buzz==='function') buzz(12); return; }
      }
      if(ui2>=0||bi2>=0){ p.held=true; showUnitCard(ui2,bi2); sfx('ui'); }
    },HOLD_MS);
  }
  if(placing&&ptrs.size===1){
    // drag near the ghost moves it; anywhere else pans the camera
    const [gx2,gy2]=w2s(placing.x,placing.y);
    dragGhost=Math.hypot(e.clientX-gx2,e.clientY-gy2)<90;
  }
  if(ptrs.size>=2) multiTouch=true;
  if(ptrs.size===2){
    const a=[...ptrs.values()];
    pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y); pinchZ=orthoSpan;
    pinchMY=(a[0].y+a[1].y)/2; pinchPitch=pitchTarget;
    pinchA=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x); pinchYaw=yawTarget;
    /* A second finger turns this into a camera gesture. Abandon any box in
       progress and hide it, or the release below would select everything
       between the box origin and wherever the pinch ended. */
    if(boxStart){
      boxStart=null; boxAdd=false;
      const bx=document.getElementById('selbox'); if(bx) bx.style.display='none';
      if(boxMode){ boxMode=false; const bb=document.getElementById('boxBtn'); if(bb) bb.classList.remove('on'); }
    }
  }
  /* Box select used to require arming #boxBtn first, so on desktop the
     universal RTS gesture — shift+drag — did nothing and a bare drag panned.
     Touch keeps the button (a bare one-finger drag MUST stay camera pan on a
     phone; there is no spare gesture), but a mouse gets shift+drag directly.
     Shift also makes the box ADDITIVE instead of replacing the selection,
     which is what shift means everywhere else in the genre. */
  if(ptrs.size===1 && !placing && (boxMode || (e.pointerType==='mouse' && e.shiftKey))){
    boxStart=[e.clientX,e.clientY];
    boxAdd=!!e.shiftKey;
  }
});
cv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId); if(!p) return;
  if(p.retreat) return;
  const dx=e.clientX-p.x, dy=e.clientY-p.y;
  p.x=e.clientX; p.y=e.clientY;
  if(Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>9) p.moved=true;
  if(aiming===5&&ptrs.size===1){
    const [bwx,bwy]=s2w(e.clientX,e.clientY);setArtBarragePreview(bwx,bwy);return;
  }
  if(orderPreview&&orderPreview.pid===e.pointerId){
    const [wx,wy]=s2w(e.clientX,e.clientY);
    const pp=typeof battlefieldClampPoint==='function'?battlefieldClampPoint(wx,wy,24):[clamp(wx,15,MAP-15),clamp(wy,15,MAP-15)];
    orderPreview.x=pp[0];orderPreview.y=pp[1];return;
  }
  if(armQueue&&queueDraft&&ptrs.size===1&&!placing&&!boxStart){
    /* Drag-path while QUEUE is armed. Camera pan is the default one-finger
       stroke; stealing it here is the point — a queued route that still
       panned the map could not be drawn with a thumb. Sub-28px motion is
       still a tap (onTap needs !moved), so a careful waypoint does not
       become a pan. Samples are ground waypoints only. */
    if(Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>28) p.qDrag=true;
    if(!p.qDrag){ p.moved=false; return; }
    p.moved=true;
    const [wx,wy]=s2w(e.clientX,e.clientY);
    const last=queueDraft.steps[queueDraft.steps.length-1];
    if(!last||dist2(wx,wy,last.x,last.y)>=110*110) queueAddStep(wx,wy,null,true);
    return;
  }
  if(ptrs.size===1){
    if(placing&&dragGhost){
      /* Drag the ghost by ray-picking the ground under the finger, so it
         tracks the pointer exactly regardless of camera angle or tilt. */
      const [gwx,gwy]=s2w(e.clientX,e.clientY);
      placing.rx=clamp(gwx,40,MAP-40); placing.ry=clamp(gwy,40,MAP-40);
      snapPlace();
    } else if(placing){
      const [pw0,ph0]=s2w(e.clientX-dx,e.clientY-dy), [pw1,ph1]=s2w(e.clientX,e.clientY);
      cam.x-=pw1-pw0; cam.y-=ph1-ph0; clampCam(); camUpdateMatrices();
    } else if(boxStart){
      const bx=document.getElementById('selbox');
      const x0=Math.min(boxStart[0],e.clientX), y0=Math.min(boxStart[1],e.clientY);
      bx.style.display='block';
      bx.style.left=x0+'px'; bx.style.top=y0+'px';
      bx.style.width=Math.abs(e.clientX-boxStart[0])+'px';
      bx.style.height=Math.abs(e.clientY-boxStart[1])+'px';
    } else {
      /* Ground-anchored pan: the world point under your finger stays under
         your finger. With a perspective camera a fixed pixels-per-unit pan
         drifts badly when the ground is far away or steeply tilted. */
      const [pw0,ph0]=s2w(e.clientX-dx,e.clientY-dy), [pw1,ph1]=s2w(e.clientX,e.clientY);
      cam.x-=pw1-pw0; cam.y-=ph1-ph0;
      camFollow=-1; camUser(); clampCam(); camUpdateMatrices();
    }
  } else if(ptrs.size===2){
    const a=[...ptrs.values()];
    const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
    if(pinchD>0){
      const mx=(a[0].x+a[1].x)/2, my=(a[0].y+a[1].y)/2;
      const [wx0,wy0]=s2w(mx,my);
      // pinch = dolly the eye in and out along its own view ray
      camFollow=-1; camUser();
      orthoSpan=clamp(pinchZ*pinchD/Math.max(1,d),zoomSpanMin(),zoomSpanMax()); distTarget=orthoSpan;
      // twist the same two fingers to orbit — 0.12 rad so a zoom pinch does not spin
      const ang=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x);
      let da=ang-pinchA;
      while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
      if(Math.abs(da)>0.12){ yawTarget=pinchYaw-da; camYaw=yawTarget; }
      // slide both fingers up/down together to raise or drop the eye
      const dyc=my-pinchMY;
      if(Math.abs(dyc)>14){ pitchTarget=clamp(pinchPitch+dyc*0.0022,PITCH_MIN,PITCH_MAX); camPitch=pitchTarget; }
      clampCam(); camUpdateMatrices();
      const [wx1,wy1]=s2w(mx,my);
      cam.x+=wx0-wx1; cam.y+=wy0-wy1; clampCam(); camUpdateMatrices();
    }
  }
});
function endPtr(e){
  clearTimeout(holdTimer);
  const p=ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  /* Read before the early returns below, clear as soon as the last finger is
     off the glass. wasMulti gates the tap commit further down. */
  const wasMulti=multiTouch;
  if(ptrs.size===0) multiTouch=false;
  if(!p) return;
  if(aiming===5&&ptrs.size===0){
    /* Zooming to line up the shot ended it. The release that finishes a pinch
       reached onTap and fired the barrage wherever the second finger happened
       to be. Swallow it and leave the aim ARMED rather than cancelling, so
       framing the target costs the player nothing. */
    if(wasMulti) return;
    if(e.type==='pointercancel')cancelArtilleryBarrageAim(true);else onTap(p.x,p.y,p.pointerType);
    return;
  }
  if(orderPreview&&orderPreview.pid===e.pointerId){
    /* THE PINCH CASE THE FORMATION PREVIEW NEVER GOT.
       multiTouch already stops the last finger of a pinch from becoming a
       phantom ground tap (endPtr's tap gate) and from firing an armed
       artillery barrage (the aiming===5 branch above). This branch had
       neither test, and it runs BEFORE both — so with FORM armed the very
       first contact of ANY two-finger gesture builds an orderPreview, and
       releasing that finger committed a full formation move order to
       wherever it happened to be. Net effect: while FORM is lit the player
       cannot pinch to frame the destination without ordering the platoon to
       a spot they never chose. Swallow the release and leave FORM armed —
       the same contract the barrage aim uses, so re-framing costs nothing. */
    if(multiTouch||wasMulti){ orderPreview=null; return; }
    const P=orderPreview;orderPreview=null;armFormation=false;
    const fb=document.getElementById('formBtn');if(fb)fb.classList.remove('on');
    if(e.type!=='pointercancel'){
      orderMove(P.x,P.y,false);
      /* Stamp the release as a ground tap so a quick second tap still
         retreats. Formation preview never went through onTap, which is
         how an armed FORM button swallowed double-tap retreat. */
      stampGroundTap(p.x,p.y,false);
      /* Keep the exact count-based placement visible briefly after release.
         On touch screens the finger otherwise covered the only preview frame,
         making a valid formation order appear to have no visual response. */
      orderConfirm={x:P.x,y:P.y,members:P.members.slice(),form:P.form,until:performance.now()+950};
    }
    return;
  }
  if(boxStart && ptrs.size===0){
    // finish box select
    const bx=document.getElementById('selbox'); bx.style.display='none';
    const boxStartX=boxStart[0], boxStartY=boxStart[1];
    boxStart=null;
    /* One-shot only for the button — its toast promises a single drag, and a
       sticky box mode would strand a phone player with no way to pan. A
       shift-drag never armed the button, so it must not clear it either. */
    if(boxMode){ boxMode=false; const bb=document.getElementById('boxBtn'); if(bb) bb.classList.remove('on'); }
    /* pointercancel is teardown, never a command. WebView can cancel a contact
       for an app interruption or lost capture; treating that coordinate as the
       corner of a completed box selected units the player never released on. */
    if(e.type==='pointercancel'){ boxAdd=false; return; }
    const sx0=Math.min(boxStartX,p.x), sx1=Math.max(boxStartX,p.x);
    const sy0=Math.min(boxStartY,p.y), sy1=Math.max(boxStartY,p.y);
    if(sx1-sx0>10||sy1-sy0>10){
      const additive=boxAdd; boxAdd=false;
      if(!additive) clearSel();
      let n=0;
      /* Stage 0: walk every live slot and project to screen. At cap this is
         the army-select cost. Stage 1 should query a spatial hash for the
         world AABB of the box instead of testing unitHigh. */
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||uteam[i]!==0) continue;
        const sp=w2s(ux[i],uy[i],terrainH(ux[i],uy[i])+TYPES[utype[i]].size*0.5);
        if(sp[0]>=sx0&&sp[0]<=sx1&&sp[1]>=sy0&&sp[1]<=sy1){ if(!usel[i]) n++; usel[i]=1; }
      }
      if(n) uiCommandAck('select',n);
      updateSelInfo();
      return;
    }
  }
  /* WHY: 9px `moved` is below thumb jitter. The first contact of a double-tap
     was classified as a pan, lastGroundT was never written, and the second
     tap could only ever be a single attack-move. A short press that drifted
     less than a fingertip is still a tap. Real pans are longer strokes.
     `performance.now()-p.t<HOLD_MS` stays the tap/hold gate (tools/test-input-hold-ms.mjs). */
  const dt=performance.now()-p.t;
  const withinHold=performance.now()-p.t<HOLD_MS;
  const slop=Math.hypot(p.x-p.sx,p.y-p.sy);
  if(e.type!=='pointercancel' && !wasMulti && !p.held && withinHold && ptrs.size===0 && (!p.moved || (dt<TAP_JITTER_MS && slop<TAP_JITTER_PX))){
    if(placing){
      // tap anywhere to move the ghost there (then confirm with ✓)
      const [wx,wy]=s2w(p.x,p.y);
      placing.rx=clamp(wx,40,MAP-40); placing.ry=clamp(wy,40,MAP-40);
      snapPlace();
    } else { lastTapShift=!!p.shift; onTap(p.x,p.y,p.pointerType); lastTapShift=false; }
  }
}
cv.addEventListener('pointerup',endPtr);
cv.addEventListener('pointercancel',endPtr);
/* Desktop accelerator. Touch already retreated on the second pointerdown.
   dblclick only fires if lastGroundT is still live — i.e. the second
   pointerup never reached onTap (swallowed as a pan). */
cv.addEventListener('dblclick',e=>{
  if(!running||placing||boxMode||!selCount()||armQueue||armPatrol||aiming>=0) return;
  e.preventDefault();
  if(!groundDoubleTap(e.clientX,e.clientY)) return;
  const [wx,wy]=s2w(e.clientX,e.clientY);
  const pp=pickPointerEntities(wx,wy,e.clientX,e.clientY,'mouse');
  if(pp.enemy>=0||pp.bld>=0) return;
  stampGroundTap(e.clientX,e.clientY,true);
  orderMove(wx,wy,false,true);
});
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  const [wx0,wy0]=s2w(e.clientX,e.clientY);
  camFollow=-1; camUser();
  orthoSpan=clamp(orthoSpan*(e.deltaY<0?0.87:1.15),zoomSpanMin(),zoomSpanMax()); distTarget=orthoSpan;
  clampCam(); camUpdateMatrices();
  const [wx1,wy1]=s2w(e.clientX,e.clientY);
  cam.x+=wx0-wx1; cam.y+=wy0-wy1; clampCam(); camUpdateMatrices();
},{passive:false});

/* Browser page-zoom (Ctrl+wheel, pinch on HUD, Ctrl+/-) scales the DOM
   instead of the ortho camera. The canvas handler above only covers #gl;
   overlays used to let pinch through. Kill page-zoom; game zoom stays on #gl. */
addEventListener('wheel',e=>{ if(e.ctrlKey||e.metaKey) e.preventDefault(); },{passive:false,capture:true});
addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)) return;
  const k=e.key, c=e.code;
  if(k==='+'||k==='-'||k==='='||k==='0'||c==='NumpadAdd'||c==='NumpadSubtract') e.preventDefault();
},true);

/* A match can end while a finger is still captured by the battlefield canvas.
   Android then keeps that pointer sequence alive across the menu transition;
   the next apparent tap completes the old gesture instead of activating a menu
   button. Every route back to the front end calls this before rebuilding the
   attract scene, so input starts from a genuinely idle state. */
function resetInputState(){
  boxAdd=false;
  clearTimeout(holdTimer);
  for(const id of ptrs.keys()){
    try{ if(cv.hasPointerCapture(id)) cv.releasePointerCapture(id); }catch(e){}
  }
  ptrs.clear();
  boxMode=false; boxStart=null; pinchD=0; dragGhost=false; multiTouch=false;
  armFormation=false; orderPreview=null; orderConfirm=null;
  if(typeof aiming!=='undefined'&&aiming>=0){
    if(aiming===5&&typeof cancelArtilleryBarrageAim==='function')cancelArtilleryBarrageAim(true);
    else aiming=-1;
  }
  if(armPatrol) cancelPatrolDraft(true);
  if(armQueue) cancelQueueDraft(true);
  /* An armed rally survived every route back to the front end. It is cleared
     by resetWorld at the START of the next match, so the leak only shows on
     paths that re-enter a live match without a world reset — but this function
     is the one that claims a genuinely idle input state, so it owns the bit. */
  disarmRally();
  lastGroundT=0;
  const sb=document.getElementById('selbox'); if(sb) sb.style.display='none';
  const bb=document.getElementById('boxBtn'); if(bb) bb.classList.remove('on');
  const fb=document.getElementById('formBtn'); if(fb) fb.classList.remove('on');
}

addEventListener('keydown',e=>{
  if(e.key!=='Tab'||!running||typeof recallGroup!=='function') return;
  const t=e.target, tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||(t&&t.isContentEditable)) return;
  e.preventDefault();
  let start=activePlatoon<0?0:activePlatoon+1;
  for(let k=0;k<4;k++){
    const n=(start+k)%4;
    if(groupLive(ctrlGroups[n]).length){ recallGroup(n,!!e.shiftKey); return; }
  }
});

/* Releasing Shift executes a chain that Shift started, which is the behaviour a
   desktop RTS player already has in their hands. A chain armed from the QUEUE
   button is untouched: it waits for GO, because a touch player has no Shift to
   release. */
addEventListener('keyup',e=>{
  if(e.key!=='Shift'||!armQueue||!queueDraft||!queueDraft.viaShift) return;
  if(queueDraft.steps.length) commitQueueDraft(); else cancelQueueDraft(true);
});

/* Build the control now rather than on first use: the orders row is hidden until
   something is selected, and a button that only appears after its first press
   cannot be discovered. */
ensureQueueBtn(); queueButtonState();

// ---------- minimap ----------
const mmc=document.getElementById('minimap');
function mmNav(e){
  const r=mmc.getBoundingClientRect();
  cam.x=(e.clientX-r.left)/r.width*MAP;
  cam.y=(e.clientY-r.top)/r.height*MAP;
  camFollow=-1; camUser(); clampCam(); camUpdateMatrices();
}
mmc.addEventListener('pointerdown',e=>{ e.stopPropagation(); mmNav(e); mmc.setPointerCapture(e.pointerId); });
mmc.addEventListener('pointermove',e=>{ if(e.buttons) mmNav(e); });

