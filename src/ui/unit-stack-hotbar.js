/* ============================================================
   UNIT-STACK HOTBAR — a compact type selector inside PLATOONS
   ============================================================ */
const MF_UNIT_STACK_STATUS_MS=500,MF_UNIT_STACK_AUDIT_MS=2000;
const mfUnitStackCardMap=new Map(),mfUnitStackPointers=new Set();
const mfUnitStackRowsByType=new Map(),mfUnitStackMembersByType=new Map();
let mfUnitStackRail=null,mfUnitStackNextStatus=0,mfUnitStackNextAudit=0,mfUnitStackDirty=true,mfUnitStackPaintNeeded=true,mfUnitStackPaintFrame=0,
  mfUnitStackLastType=-1,mfUnitStackLastAt=-1e9;
let mfUnitStackFocusCount=0,mfUnitStackLastFocusType=-1,mfUnitStackLastAction=null;
let mfUnitStackTopologyScans=0,mfUnitStackStatusScans=0,mfUnitStackSelectionEpoch=0,mfUnitStackSelectionSig='';

function mfUnitStackNow(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function mfUnitStackName(value){return String(value||'UNIT').replace(/\s+/g,' ').trim();}
function mfUnitStackToggle(el,name,on){if(el&&el.classList.contains(name)!==!!on)el.classList.toggle(name,!!on);}
function mfUnitStackOwns(i){
  return typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0;
}
function mfUnitStackKit(){
  const raw=typeof playerKitKey==='function'?playerKitKey():'nova';
  return typeof mfIntelKit==='function'?mfIntelKit(raw):raw;
}
function mfUnitStackRows(force){
  const now=mfUnitStackNow();
  if(typeof running!=='boolean'||!running||typeof matchLive!=='boolean'||!matchLive){
    mfUnitStackRowsByType.clear();mfUnitStackMembersByType.clear();mfUnitStackDirty=true;return [];
  }
  /* Spawns/deaths mark topology dirty. A deliberately slow audit catches old
     shells or unusual restore paths that mutate the packed arrays directly,
     without returning to the former 4.5 full-unit scans per second. */
  if(mfUnitStackDirty||now>=mfUnitStackNextAudit){
    mfUnitStackTopologyScans++;
    mfUnitStackRowsByType.clear();mfUnitStackMembersByType.clear();
    const byType=new Map();
    for(let i=0;i<unitHigh;i++){
      if(!ualive[i]||!mfUnitStackOwns(i))continue;
      const type=utype[i],T=TYPES[type];if(!T)continue;
      let row=byType.get(type),members=mfUnitStackMembersByType.get(type);
      if(!row){row={type,name:mfUnitStackName(T.name||('UNIT '+type)),count:0,selected:0,ready:0,hp:0,x:0,y:0,health:100};byType.set(type,row);mfUnitStackRowsByType.set(type,row);}
      if(!members){members=[];mfUnitStackMembersByType.set(type,members);}members.push(i);row.count++;
    }
    mfUnitStackDirty=false;mfUnitStackNextAudit=now+MF_UNIT_STACK_AUDIT_MS;mfUnitStackNextStatus=0;
  }
  if(force||now>=mfUnitStackNextStatus){
    mfUnitStackStatusScans++;
    for(const row of mfUnitStackRowsByType.values())row.selected=row.ready=row.hp=row.x=row.y=0;
    for(const [type,members] of mfUnitStackMembersByType){
      const row=mfUnitStackRowsByType.get(type);if(!row)continue;
      for(const i of members){
        if(!ualive[i]||utype[i]!==type||!mfUnitStackOwns(i)){mfUnitStackDirty=true;continue;}
        row.selected+=usel[i]?1:0;
        row.ready+=(typeof ustun==='undefined'||ustun[i]<=0)&&(ustate[i]===0||uhold[i])?1:0;
        row.hp+=Math.max(0,Math.min(1,uhp[i]/Math.max(1,uhpm[i])));row.x+=ux[i];row.y+=uy[i];
      }
      row.health=Math.round(row.hp/Math.max(1,row.count)*100);
    }
    mfUnitStackNextStatus=now+MF_UNIT_STACK_STATUS_MS;
  }
  return [...mfUnitStackRowsByType.values()].sort((a,b)=>{
    const A=TYPES[a.type],B=TYPES[b.type],ar=A&&A.cat==='hero'?-2:A&&A.builder?-1:(A&&A.tier||0),
      br=B&&B.cat==='hero'?-2:B&&B.builder?-1:(B&&B.tier||0);
    return ar-br||a.type-b.type;
  });
}
function mfUnitStackInvalidate(){
  mfUnitStackDirty=true;
  /* Coalesce a factory completion or mass-casualty burst. A per-spawn rAF can
     become a full-census scan every frame while several factories finish. */
  if(!mfUnitStackPaintFrame)mfUnitStackPaintFrame=setTimeout(()=>{mfUnitStackPaintFrame=0;mfUnitStackSync(false);},240);
}
function mfUnitStackOverflow(){
  const rail=mfUnitStackRail;if(!rail)return;
  const overflow=rail.scrollWidth>rail.clientWidth+2;
  const state=!overflow?'none':rail.scrollLeft<=2?'start':rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2?'end':'middle';
  if(rail.dataset.mfOverflow!==state)rail.dataset.mfOverflow=state;
  const role=overflow?'scrolling unit stack selector':'unit stack selector';
  if(rail.getAttribute('aria-roledescription')!==role)rail.setAttribute('aria-roledescription',role);
}
function mfUnitStackReleasePointer(ev){
  if(!mfUnitStackPointers.delete(ev.pointerId)||mfUnitStackPointers.size)return;
  mfUnitStackSync(true);
}
function mfUnitStackShell(){
  if(mfUnitStackRail&&mfUnitStackRail.isConnected)return mfUnitStackRail;
  const row=document.getElementById('grpRow');if(!row)return null;
  mfUnitStackRail=document.getElementById('mfUnitStackRail');
  if(!mfUnitStackRail){
    mfUnitStackRail=document.createElement('div');mfUnitStackRail.id='mfUnitStackRail';
    mfUnitStackRail.setAttribute('role','group');mfUnitStackRail.setAttribute('aria-label','Unit stacks by type');
    mfUnitStackRail.setAttribute('data-mf-hud-role','unit-stack-hotbar');mfUnitStackRail.dataset.mfScrollRail='horizontal';
    row.appendChild(mfUnitStackRail);
  }
  if(mfUnitStackRail.dataset.mfStackBound!=='1'){
    mfUnitStackRail.dataset.mfStackBound='1';
    mfUnitStackRail.addEventListener('pointerdown',ev=>{if(ev.isPrimary!==false)mfUnitStackPointers.add(ev.pointerId);},{passive:true});
    /* A card activation stops propagation so its command cannot leak into the
       battlefield. Capture owns pointer release before that intentional stop,
       otherwise the topology guard can remain latched after a normal tap. */
    addEventListener('pointerup',mfUnitStackReleasePointer,{passive:true,capture:true});
    addEventListener('pointercancel',mfUnitStackReleasePointer,{passive:true,capture:true});
    mfUnitStackRail.addEventListener('wheel',ev=>{
      if(Math.abs(ev.deltaY)<=Math.abs(ev.deltaX))return;
      mfUnitStackRail.scrollLeft+=ev.deltaY;ev.preventDefault();
    },{passive:false});
    mfUnitStackRail.addEventListener('scroll',mfUnitStackOverflow,{passive:true});
    if(typeof ResizeObserver==='function')new ResizeObserver(mfUnitStackOverflow).observe(mfUnitStackRail);
  }
  return mfUnitStackRail;
}
function mfUnitStackMountIcon(host,type,kit){
  host.replaceChildren();let art=null;
  try{if(typeof unitIconEl==='function')art=unitIconEl(type,34,kit);}catch(e){art=null;}
  if(art){art.classList.add('mfUnitStackArt');host.appendChild(art);return;}
  const fallback=document.createElement('span');fallback.className='mfUnitStackFallback';
  fallback.textContent=typeof UNIT_EM==='object'&&UNIT_EM[type]||'◇';host.appendChild(fallback);
}
function mfUnitStackRefreshSelection(type){
  /* updateSelInfo's first-seen lesson opens Unit Intel for a lone chassis. A
     stack tap must keep PLATOONS present for its documented second activation.
     The authored icon, name and status card is already that chassis' lesson;
     its persistent info action remains the route to full Unit Intel. */
  if(typeof intelSeenTypes==='object'&&intelSeenTypes)intelSeenTypes[type]=1;
  if(typeof updateSelInfo==='function')updateSelInfo();
}
function mfUnitStackSelect(type,focus){
  const members=[];let cx=0,cy=0;
  for(let i=0;i<unitHigh;i++)if(ualive[i]&&utype[i]===type&&mfUnitStackOwns(i)){members.push(i);cx+=ux[i];cy+=uy[i];}
  if(!members.length){mfUnitStackSync(true);return false;}
  clearSel();for(const i of members)usel[i]=1;
  cx/=members.length;cy/=members.length;
  if(focus){
    if(typeof camFollow!=='undefined')camFollow=-1;
    cam.x=cx;cam.y=cy;if(typeof camUser==='function')camUser();clampCam();camUpdateMatrices();
    mfUnitStackFocusCount++;mfUnitStackLastFocusType=type;
  }
  mfUnitStackRefreshSelection(type);
  const name=TYPES[type]&&TYPES[type].name||('UNIT '+type);
  toast(members.length+'× '+name+' selected'+(focus?' · camera focused':''));
  if(typeof uiCommandAck==='function')uiCommandAck('select',members.length,cx,cy);else sfx('ui');
  mfUnitStackLastAction={type,count:members.length,focus:!!focus,x:cx,y:cy,at:mfUnitStackNow()};
  mfUnitStackSync(true);return true;
}
function mfUnitStackActivate(type){
  const now=mfUnitStackNow(),focus=mfUnitStackLastType===type&&now-mfUnitStackLastAt<=700;
  mfUnitStackLastType=type;mfUnitStackLastAt=now;mfUnitStackSelect(type,focus);
}
function mfUnitStackCard(type,kit){
  const card=document.createElement('button');card.type='button';card.className='mfUnitStackCard';
  card.dataset.unitStackKey=String(type);card.dataset.unitType=String(type);card.setAttribute('data-mf-hud-role','unit-stack-command');
  const icon=document.createElement('span');icon.className='mfUnitStackIcon';icon.setAttribute('aria-hidden','true');
  const copy=document.createElement('span');copy.className='mfUnitStackCopy';
  const name=document.createElement('b');name.className='mfUnitStackName';
  const meta=document.createElement('span');meta.className='mfUnitStackMeta';
  const count=document.createElement('strong');count.className='mfUnitStackCount';
  const ready=document.createElement('small');ready.className='mfUnitStackReady';
  const health=document.createElement('i');health.className='mfUnitStackHealth';health.setAttribute('aria-hidden','true');
  const fill=document.createElement('i');fill.className='mfUnitStackHealthFill';health.appendChild(fill);
  meta.append(count,ready);copy.append(name,meta,health);card.append(icon,copy);
  card._mfUnitStack={icon,name,count,ready,fill,kit};mfUnitStackMountIcon(icon,type,kit);
  mfBindTap(card,ev=>{ev.preventDefault();ev.stopPropagation();mfUnitStackActivate(type);});
  mfUnitStackCardMap.set(type,card);return card;
}
function mfUnitStackPaint(card,row,kit,order){
  const view=card._mfUnitStack;if(!view)return;
  if(view.kit!==kit&&!mfUnitStackPointers.size){view.kit=kit;mfUnitStackMountIcon(view.icon,row.type,kit);}
  if(view.name.textContent!==row.name)view.name.textContent=row.name;
  if(view.name.title!==row.name)view.name.title=row.name;
  const count='×'+row.count,ready=row.ready===row.count?'':row.ready+' RDY';
  if(view.count.textContent!==count)view.count.textContent=count;
  if(view.ready.textContent!==ready)view.ready.textContent=ready;
  if(view.ready.hidden===!!ready)view.ready.hidden=!ready;
  const healthWidth=row.health+'%';if(view.fill.style.width!==healthWidth)view.fill.style.width=healthWidth;
  if(card.style.order!==String(order))card.style.order=String(order);
  card.dataset.count=String(row.count);card.dataset.selected=String(row.selected);card.dataset.ready=String(row.ready);
  card.dataset.health=String(row.health);
  const allSelected=row.selected===row.count,partial=row.selected>0&&row.selected<row.count,allReady=row.ready===row.count;
  mfUnitStackToggle(card,'selected',allSelected);mfUnitStackToggle(card,'partial',partial);mfUnitStackToggle(card,'ready',allReady);
  const pressed=row.selected===row.count?'true':row.selected>0?'mixed':'false';
  if(card.getAttribute('aria-pressed')!==pressed)card.setAttribute('aria-pressed',pressed);
  const label='Select all '+row.count+' '+row.name+(row.count===1?'':' units')+'. '+row.ready+' ready. Average health '+row.health+
    ' percent. Activate twice to focus camera.';
  if(card.getAttribute('aria-label')!==label)card.setAttribute('aria-label',label);
  const title=row.name+' · '+row.count+' unit'+(row.count===1?'':'s')+' · '+row.health+'% health';
  if(card.title!==title)card.title=title;
}
function mfUnitStackSync(force){
  const rail=mfUnitStackShell();if(!rail)return;
  const now=mfUnitStackNow();if(!force&&!mfUnitStackDirty&&!mfUnitStackPaintNeeded&&now<mfUnitStackNextStatus&&now<mfUnitStackNextAudit)return;
  const rows=mfUnitStackRows(force),active=mfUnitStackPointers.size>0,kit=mfUnitStackKit(),seen=new Set();
  for(let order=0;order<rows.length;order++){
    const data=rows[order];seen.add(data.type);let card=mfUnitStackCardMap.get(data.type);
    if(!card&&!active){card=mfUnitStackCard(data.type,kit);rail.appendChild(card);}
    if(card)mfUnitStackPaint(card,data,kit,order);
  }
  if(!active)for(const [type,card] of mfUnitStackCardMap)if(!seen.has(type)){card.remove();mfUnitStackCardMap.delete(type);}
  if(!active){
    rail.style.display=rows.length?'flex':'none';
    const hidden=rows.length?'false':'true';if(rail.getAttribute('aria-hidden')!==hidden)rail.setAttribute('aria-hidden',hidden);
  }
  const group=document.getElementById('grpRow');if(group){
    const saved=!!group.querySelector('.grpBtn.saved'),hasSelection=rows.some(row=>row.selected>0),empty=!rows.length&&!saved;
    mfUnitStackToggle(group,'mfUnitStackReady',rows.length>0);mfUnitStackToggle(group,'mfUnitStackHasSelection',hasSelection);
    mfUnitStackToggle(group,'mfUnitStackEmpty',empty);
    const state=empty?'empty':hasSelection?'selected':'browse';if(group.dataset.mfStackState!==state)group.dataset.mfStackState=state;
  }
  mfUnitStackPaintNeeded=false;
  requestAnimationFrame(mfUnitStackOverflow);
}

const mfUnitStackBaseUpdateGroupBadges=typeof updateGroupBadges==='function'?updateGroupBadges:null;
if(mfUnitStackBaseUpdateGroupBadges)updateGroupBadges=function(){mfUnitStackBaseUpdateGroupBadges();mfUnitStackSync(false);};
/* The simulation owns lifecycle truth. These late takeovers only invalidate the
   cached census; they never alter spawn/kill results or unit ownership. */
if(typeof spawnUnit==='function'){
  const mfUnitStackBaseSpawn=spawnUnit;spawnUnit=function(){const out=mfUnitStackBaseSpawn.apply(this,arguments);mfUnitStackInvalidate();return out;};
}
if(typeof killUnit==='function'){
  const mfUnitStackBaseKill=killUnit;killUnit=function(){const out=mfUnitStackBaseKill.apply(this,arguments);mfUnitStackInvalidate();return out;};
}
addEventListener('resize',()=>mfUnitStackSync(true));
mfUnitStackShell();mfUnitStackSync(true);
window.MFUnitStackHotbar=Object.freeze({
  sync:()=>mfUnitStackSync(true),
  selection:selectedByType=>{
    const sig=Object.keys(selectedByType||{}).sort((a,b)=>a-b).map(type=>type+':'+selectedByType[type]).join('|');
    if(sig===mfUnitStackSelectionSig)return;
    mfUnitStackSelectionSig=sig;mfUnitStackPaintNeeded=true;
    mfUnitStackSelectionEpoch++;
    for(const row of mfUnitStackRowsByType.values())row.selected=+(selectedByType&&selectedByType[row.type]||0);
    /* updateSelInfo already walked unitHigh. Reuse its selection result and
       leave HP/readiness on their slower status cadence. */
    mfUnitStackNextStatus=Math.max(mfUnitStackNextStatus,mfUnitStackNow()+80);
  },
  snapshot:()=>({
  railCount:document.querySelectorAll('#mfUnitStackRail').length,cardCount:mfUnitStackCardMap.size,
  cards:[...mfUnitStackCardMap.values()].map(card=>{const name=card.querySelector('.mfUnitStackName'),thumb=card.querySelector('.mfRuntimeThumb');return{
    type:+card.dataset.unitType,count:+card.dataset.count,selected:+card.dataset.selected,ready:+card.dataset.ready,
    health:+card.dataset.health,pressed:card.getAttribute('aria-pressed'),name:name&&name.textContent||'',
    labelClipped:!!(name&&name.clientWidth&&name.scrollWidth>name.clientWidth+1),modelKey:thumb&&thumb.dataset.mfModelKey||'',
    thumbnailStatus:thumb&&thumb.dataset.mfThumbStatus||'',thumbnailSource:thumb&&thumb.dataset.mfThumbSource||''};}),
  pointerCount:mfUnitStackPointers.size,focusCount:mfUnitStackFocusCount,lastFocusType:mfUnitStackLastFocusType,
  lastAction:mfUnitStackLastAction,platoonButtons:document.querySelectorAll('#grpRow>.grpBtn').length,
  topologyScans:mfUnitStackTopologyScans,statusScans:mfUnitStackStatusScans,selectionEpoch:mfUnitStackSelectionEpoch,
  overflow:mfUnitStackRail&&mfUnitStackRail.dataset.mfOverflow||'none',stackState:document.getElementById('grpRow')&&document.getElementById('grpRow').dataset.mfStackState||''
  })
});
