;
;
/* ============================================================
   INPUT — touch camera, selection, orders (mobile-first)
   ============================================================ */
const ptrs=new Map();
let boxMode=false, boxStart=null, pinchD=0, pinchZ=1, tapT=0, pinchA=0, pinchYaw=0;
let pinchMY=0, pinchPitch=0.92;
let openBld=-1;             // building whose menu is open
let shake=0;

/* CAMERA AUTHORITY.
   Anything that moves the camera automatically has to yield to the player the
   moment they touch it. Without that, panning away to scout a landing site or
   to look at a fight fought the auto-follow every frame and the view was
   dragged straight back — which reads as the camera, the ship or the units
   snapping back. `camUser()` is called from every manual camera input and
   suspends automatic movement for a few seconds afterwards. */
let camUserT=0;
function camUser(){ camUserT=4.0; }
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
  if(armPatrol)cancelPatrolDraft(true);
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
function stopSelected(){
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    ustate[i]=0;utgt[i]=-1;uhold[i]=0;utx[i]=ux[i];uty[i]=uy[i];uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
    n++;
  }
  /* Nothing was selected, so nothing happened. `ui` said otherwise. */
  if(n)uiCommandAck('stop',n);else sfx('reject');
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
  const key=Math.round(o.x)+','+Math.round(o.y)+','+form+','+members.length
    +','+(members[0]|0)+','+(members[members.length-1]|0);
  if(o._slotKey!==key){ o._slotKey=key; o._slots=formationTargets(members,o.x,o.y,form); }
  return o._slots||[];
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
function armFormationOrder(){
  if(!selCount()){toast('Select units first');return;}
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
   `orderMove` now honours it. */
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
function orderMove(wx,wy,patrol){
  const sel=formationMembers();
  if(!sel.length) return false;
  if(typeof battlefieldClampPoint==='function'){const p=battlefieldClampPoint(wx,wy,24);wx=p[0];wy=p[1];}
  const landGoal=findLand(wx,wy),waterGoal=findWater(wx,wy);
  const fld=requestField(landGoal[0],landGoal[1],false);
  const navalFld=waterGoal?requestField(waterGoal[0],waterGoal[1],true):-1;
  const form=FORMS[selFormation].id;
  const targets=formationTargets(sel,wx,wy,form);
  const cohort=patrol?-1:allocMoveCohort(sel,targets,selFormation);
  for(let k=0;k<sel.length;k++){
    const i=sel[k],T=TYPES[utype[i]],rawx=targets[k].x,rawy=targets[k].y;
    const legal=T.naval?(findWater(rawx,rawy)||[ux[i],uy[i]]):T.air?[rawx,rawy]:findLand(rawx,rawy);
    const tx=legal[0],ty=legal[1];
    ustate[i]=patrol?5:(moveMode?1:2); utgt[i]=-1; ufield[i]=T.air?-1:(T.naval?navalFld:fld); uhold[i]=0;
    uPatrolRoute[i]=-1;uPatrolStep[i]=0;
    uMoveCohort[i]=cohort;
    if(patrol){ upx1[i]=ux[i]; upy1[i]=uy[i]; upx2[i]=clamp(tx,15,MAP-15); upy2[i]=clamp(ty,15,MAP-15); }
    utx[i]=clamp(tx,15,MAP-15);
    uty[i]=clamp(ty,15,MAP-15);
  }
  addParticle(3,wx,wy,0,0,.5,26, patrol?120:65, patrol?255:200, patrol?170:255);
  if(!patrol){
    /* The route the field will actually walk, drawn at the moment of the
       order (src/ui/orderfx.js) - amber for attack-move, cyan for move. */
    if(typeof moveFxOrder==='function') moveFxOrder(sel,wx,wy,fld,moveMode?1:0);
    /* And the formation footprint. This reuses the confirm hologram that
       formation drags always had, so a plain tap now shows where each unit
       will STAND, not just where the tap landed. `noLine` suppresses the
       straight centroid->destination beam - the traced route above replaces
       it, and drawing both would show two contradictory paths whenever the
       field bends around water. */
    orderConfirm={x:wx,y:wy,members:sel.slice(),form:selFormation,
                  until:performance.now()+950,noLine:1};
  }
  uiCommandAck(patrol?'patrol':'move',sel.length,wx,wy);
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
  return {x:L[0],y:L[1],field:requestField(L[0],L[1],!!T.naval)};
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
    ustate[i]=5;utgt[i]=-1;uhold[i]=0;ufield[i]=P.field;utx[i]=P.x;uty[i]=P.y;
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
  if(!g.length){ toast('Select units first, then hold P'+(n+1)+' to assign'); return; }
  ctrlGroups[n]=g;groupForms[n]=selFormation;activePlatoon=n;
  updateGroupBadges();
  toast('PLATOON P'+(n+1)+' saved — '+g.length+' units · '+FORMS[selFormation].nm);sfx('level');
}
function recallGroup(n,focus){
  const g=groupLive(ctrlGroups[n]);
  ctrlGroups[n]=g;
  updateGroupBadges();
  if(!g.length){toast('P'+(n+1)+' is empty — select units and HOLD to assign');return;}
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
    const f=document.getElementById('grp'+(n+1)+'F');if(f)f.textContent=FORMS[groupForms[n]||0].em;
    const btn=document.getElementById('grpBtn'+(n+1));
    if(btn){btn.classList.toggle('saved',!!live.length);btn.classList.toggle('active',activePlatoon===n&&!!live.length);}
  }
}
function orderHold(){
  let n=0;
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    uhold[i]=1;ustate[i]=0;utgt[i]=-1;utx[i]=ux[i];uty[i]=uy[i];uPatrolRoute[i]=-1;uMoveCohort[i]=-1;n++;
  }
  if(n){ toast('⛊ '+n+' units holding position — they fire but never chase'); uiCommandAck('hold',n); }
  return n;
}
function orderAttack(target){   // target: unit idx or -2-b
  let any=false;
  let ex,ey;
  if(target>=0){ ex=ux[target]; ey=uy[target]; }
  else { const B=blds[-2-target]; ex=B.x; ey=B.y; }
  for(let i=0;i<unitHigh;i++) if(ualive[i]&&usel[i]){
    ustate[i]=2; utgt[i]=target; utgtg[i]=target>=0?ugen[target]:-1;
    utx[i]=ex;uty[i]=ey;uhold[i]=0;uPatrolRoute[i]=-1;uMoveCohort[i]=-1;any=true;
  }
  if(any){ addParticle(3,ex,ey,0,0,.5,30, 255,90,70); uiCommandAck('attack',selCount(),ex,ey); }
  return any;
}
function pickUnit(wx,wy){
  const pickR=Math.max(16,orthoSpan*0.012);
  let best=-1,bd=pickR*pickR, bestEnemy=-1,bde=pickR*pickR;
  forUnitsIn(wx,wy,pickR,j=>{
    const d=dist2(wx,wy,ux[j],uy[j]);
    if(uteam[j]===0){ if(d<bd){bd=d;best=j;} }
    else if(fogEntityVisible(uteam[j],ux[j],uy[j])){ if(d<bde){bde=d;bestEnemy=j;} }
  });
  return {own:best, enemy:bestEnemy};
}
function pickBld(wx,wy){
  for(let b=0;b<blds.length;b++){
    const B=blds[b];
    if(B.alive&&fogEntityVisible(B.team,B.x,B.y)&&dist2(wx,wy,B.x,B.y)<(B.r+10)*(B.r+10)) return b;
  }
  return -1;
}

let armRally=-1, armPatrol=false, lastSelT=0, lastSelType=-1;
let novaSrc=-1;
function onTap(sx,sy){
  const [wx,wy]=s2w(sx,sy);
  if(aiming===5){ beginArtilleryBarrage(wx,wy); return; }
  if(aiming===6){ fireCommanderActive(wx,wy); return; }
  if(aiming===7){ fireCommanderWeapon(0,wx,wy); return; }
  if(aiming===8){ fireCommanderWeapon(1,wx,wy); return; }
  if(aiming===4){ fireCommanderJump(wx,wy); return; }
  if(aiming===0){ fireBlast(wx,wy); return; }
  if(aiming===3){ fireLance(wx,wy); return; }
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
  const pk=pickUnit(wx,wy);
  const haveSel=selCount()>0;
  // patrol order (armed from the tactics bar)
  if(armPatrol && haveSel){
    addPatrolWaypoint(wx,wy);
    return;
  }
  if(armPatrol)cancelPatrolDraft(true);
  // enemy tapped → attack order
  if(pk.enemy>=0 && haveSel){ orderAttack(pk.enemy); return; }
  // own unit tapped → select (double-tap = select all of that type on screen)
  if(pk.own>=0){
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
      distTarget=clamp(Math.max(orthoSpan*0.5,SPAN_MIN),SPAN_MIN,SPAN_MAX);   // close on the unit, but not past the command view
      updateSelInfo(); uiCommandAck('select',n2,ux[pk.own],uy[pk.own]); closeMenus(); return;
    }
    lastSelT=tnow; lastSelType=utype[pk.own];
    clearSel(); usel[pk.own]=1; updateSelInfo(); uiCommandAck('select',1,ux[pk.own],uy[pk.own]);
    closeMenus(); return;
  }
  // building tapped
  const b=pickBld(wx,wy);
  if(b>=0){
    const B=blds[b];
    if(B.team===0){ clearSel(); openBldMenu(b); return; }
    else if(haveSel){ orderAttack(-2-b); return; }
  }
  // ground → move/attack-move
  if(haveSel){ orderMove(wx,wy); return; }
  closeMenus();
}

let dragGhost=false, holdTimer=0;
cv.addEventListener('pointerdown',e=>{
  try{ cv.setPointerCapture(e.pointerId); }catch(_){}
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false,t:performance.now()});
  if(aiming===5&&ptrs.size===1){
    const [bwx,bwy]=s2w(e.clientX,e.clientY);setArtBarragePreview(bwx,bwy);
    clearTimeout(holdTimer);return;
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
      if(!p||p.moved||ptrs.size!==1) return;
      const pk2=pickUnit(hwx,hwy);
      const ui2=pk2.own>=0?pk2.own:pk2.enemy;
      const bi2=ui2<0?pickBld(hwx,hwy):-1;
      if(ui2>=0||bi2>=0){ showUnitCard(ui2,bi2); sfx('ui'); }
    },520);
  }
  if(placing&&ptrs.size===1){
    // drag near the ghost moves it; anywhere else pans the camera
    const [gx2,gy2]=w2s(placing.x,placing.y);
    dragGhost=Math.hypot(e.clientX-gx2,e.clientY-gy2)<90;
  }
  if(ptrs.size===2){
    const a=[...ptrs.values()];
    pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y); pinchZ=orthoSpan;
    pinchMY=(a[0].y+a[1].y)/2; pinchPitch=pitchTarget;
    pinchA=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x); pinchYaw=yawTarget;
  }
  if(ptrs.size===1 && boxMode && !placing){
    boxStart=[e.clientX,e.clientY];
  }
});
cv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId); if(!p) return;
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
      orthoSpan=clamp(pinchZ*pinchD/Math.max(1,d),SPAN_MIN,SPAN_MAX); distTarget=orthoSpan;
      camUser();
      // twist the same two fingers to orbit
      const ang=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x);
      let da=ang-pinchA;
      while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
      if(Math.abs(da)>0.05){ yawTarget=pinchYaw-da; camYaw=yawTarget; }
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
  if(!p) return;
  if(aiming===5&&ptrs.size===0){
    if(e.type==='pointercancel')cancelArtilleryBarrageAim(true);else onTap(p.x,p.y);
    return;
  }
  if(orderPreview&&orderPreview.pid===e.pointerId){
    const P=orderPreview;orderPreview=null;armFormation=false;
    const fb=document.getElementById('formBtn');if(fb)fb.classList.remove('on');
    if(e.type!=='pointercancel'){
      orderMove(P.x,P.y,false);
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
    boxStart=null; boxMode=false; document.getElementById('boxBtn').classList.remove('on');
    const sx0=Math.min(boxStartX,p.x), sx1=Math.max(boxStartX,p.x);
    const sy0=Math.min(boxStartY,p.y), sy1=Math.max(boxStartY,p.y);
    if(sx1-sx0>10||sy1-sy0>10){
      clearSel(); let n=0;
      for(let i=0;i<unitHigh;i++){
        if(!ualive[i]||uteam[i]!==0) continue;
        const sp=w2s(ux[i],uy[i],terrainH(ux[i],uy[i])+TYPES[utype[i]].size*0.5);
        if(sp[0]>=sx0&&sp[0]<=sx1&&sp[1]>=sy0&&sp[1]<=sy1){ usel[i]=1; n++; }
      }
      if(n) uiCommandAck('select',n);
      updateSelInfo();
      return;
    }
  }
  if(!p.moved && performance.now()-p.t<400 && ptrs.size===0){
    if(placing){
      // tap anywhere to move the ghost there (then confirm with ✓)
      const [wx,wy]=s2w(p.x,p.y);
      placing.rx=clamp(wx,40,MAP-40); placing.ry=clamp(wy,40,MAP-40);
      snapPlace();
    } else onTap(p.x,p.y);
  }
}
cv.addEventListener('pointerup',endPtr);
cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{
  e.preventDefault();
  const [wx0,wy0]=s2w(e.clientX,e.clientY);
  orthoSpan=clamp(orthoSpan*(e.deltaY<0?0.87:1.15),SPAN_MIN,SPAN_MAX); distTarget=orthoSpan;
  clampCam(); camUpdateMatrices();
  const [wx1,wy1]=s2w(e.clientX,e.clientY);
  cam.x+=wx0-wx1; cam.y+=wy0-wy1; clampCam(); camUpdateMatrices();
},{passive:false});

/* A match can end while a finger is still captured by the battlefield canvas.
   Android then keeps that pointer sequence alive across the menu transition;
   the next apparent tap completes the old gesture instead of activating a menu
   button. Every route back to the front end calls this before rebuilding the
   attract scene, so input starts from a genuinely idle state. */
function resetInputState(){
  clearTimeout(holdTimer);
  for(const id of ptrs.keys()){
    try{ if(cv.hasPointerCapture(id)) cv.releasePointerCapture(id); }catch(e){}
  }
  ptrs.clear();
  boxMode=false; boxStart=null; pinchD=0; dragGhost=false;
  armFormation=false; orderPreview=null; orderConfirm=null;
  if(typeof aiming!=='undefined'&&aiming>=0){
    if(aiming===5&&typeof cancelArtilleryBarrageAim==='function')cancelArtilleryBarrageAim(true);
    else aiming=-1;
  }
  if(armPatrol) cancelPatrolDraft(true);
  const sb=document.getElementById('selbox'); if(sb) sb.style.display='none';
  const bb=document.getElementById('boxBtn'); if(bb) bb.classList.remove('on');
  const fb=document.getElementById('formBtn'); if(fb) fb.classList.remove('on');
}

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

