/* ============================================================
   UNIT-STACK HOTBAR — a compact type selector inside PLATOONS
   ============================================================ */
const MF_UNIT_STACK_SYNC_MS=220;
const mfUnitStackCardMap=new Map(),mfUnitStackPointers=new Set();
let mfUnitStackRail=null,mfUnitStackNextSync=0,mfUnitStackLastType=-1,mfUnitStackLastAt=-1e9;
let mfUnitStackFocusCount=0,mfUnitStackLastFocusType=-1,mfUnitStackLastAction=null;

function mfUnitStackNow(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function mfUnitStackName(value){return String(value||'UNIT').replace(/\s+/g,' ').trim();}
function mfUnitStackOwns(i){
  return typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0;
}
function mfUnitStackKit(){
  const raw=typeof playerKitKey==='function'?playerKitKey():'nova';
  return typeof mfIntelKit==='function'?mfIntelKit(raw):raw;
}
function mfUnitStackRows(){
  if(typeof running!=='boolean'||!running||typeof matchLive!=='boolean'||!matchLive)return [];
  const byType=new Map();
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||!mfUnitStackOwns(i))continue;
    const type=utype[i],T=TYPES[type];if(!T)continue;
    let row=byType.get(type);
    if(!row){row={type,name:mfUnitStackName(T.name||('UNIT '+type)),count:0,selected:0,ready:0,hp:0,x:0,y:0};byType.set(type,row);}
    row.count++;row.selected+=usel[i]?1:0;
    row.ready+=(typeof ustun==='undefined'||ustun[i]<=0)&&(ustate[i]===0||uhold[i])?1:0;
    row.hp+=Math.max(0,Math.min(1,uhp[i]/Math.max(1,uhpm[i])));row.x+=ux[i];row.y+=uy[i];
  }
  return [...byType.values()].map(row=>{row.health=Math.round(row.hp/row.count*100);return row;}).sort((a,b)=>{
    const A=TYPES[a.type],B=TYPES[b.type],ar=A&&A.cat==='hero'?-2:A&&A.builder?-1:(A&&A.tier||0),
      br=B&&B.cat==='hero'?-2:B&&B.builder?-1:(B&&B.tier||0);
    return ar-br||a.type-b.type;
  });
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
  view.ready.hidden=!ready;
  view.fill.style.width=row.health+'%';card.style.order=String(order);
  card.dataset.count=String(row.count);card.dataset.selected=String(row.selected);card.dataset.ready=String(row.ready);
  card.dataset.health=String(row.health);card.classList.toggle('selected',row.selected===row.count);
  card.classList.toggle('partial',row.selected>0&&row.selected<row.count);
  card.classList.toggle('ready',row.ready===row.count);card.setAttribute('aria-pressed',
    row.selected===row.count?'true':row.selected>0?'mixed':'false');
  const label='Select all '+row.count+' '+row.name+(row.count===1?'':' units')+'. '+row.ready+' ready. Average health '+row.health+
    ' percent. Activate twice to focus camera.';
  if(card.getAttribute('aria-label')!==label)card.setAttribute('aria-label',label);
  const title=row.name+' · '+row.count+' unit'+(row.count===1?'':'s')+' · '+row.health+'% health';
  if(card.title!==title)card.title=title;
}
function mfUnitStackSync(force){
  const rail=mfUnitStackShell();if(!rail)return;
  const now=mfUnitStackNow();if(!force&&now<mfUnitStackNextSync)return;mfUnitStackNextSync=now+MF_UNIT_STACK_SYNC_MS;
  const rows=mfUnitStackRows(),active=mfUnitStackPointers.size>0,kit=mfUnitStackKit(),seen=new Set();
  for(let order=0;order<rows.length;order++){
    const data=rows[order];seen.add(data.type);let card=mfUnitStackCardMap.get(data.type);
    if(!card&&!active){card=mfUnitStackCard(data.type,kit);rail.appendChild(card);}
    if(card)mfUnitStackPaint(card,data,kit,order);
  }
  if(!active)for(const [type,card] of mfUnitStackCardMap)if(!seen.has(type)){card.remove();mfUnitStackCardMap.delete(type);}
  if(!active){rail.style.display=rows.length?'flex':'none';rail.setAttribute('aria-hidden',rows.length?'false':'true');}
  const group=document.getElementById('grpRow');if(group)group.classList.toggle('mfUnitStackReady',rows.length>0);
}

const mfUnitStackBaseUpdateGroupBadges=typeof updateGroupBadges==='function'?updateGroupBadges:null;
if(mfUnitStackBaseUpdateGroupBadges)updateGroupBadges=function(){mfUnitStackBaseUpdateGroupBadges();mfUnitStackSync(false);};
addEventListener('resize',()=>mfUnitStackSync(true));
mfUnitStackShell();mfUnitStackSync(true);
window.MFUnitStackHotbar=Object.freeze({sync:()=>mfUnitStackSync(true),snapshot:()=>({
  railCount:document.querySelectorAll('#mfUnitStackRail').length,cardCount:mfUnitStackCardMap.size,
  cards:[...mfUnitStackCardMap.values()].map(card=>{const name=card.querySelector('.mfUnitStackName'),thumb=card.querySelector('.mfRuntimeThumb');return{
    type:+card.dataset.unitType,count:+card.dataset.count,selected:+card.dataset.selected,ready:+card.dataset.ready,
    health:+card.dataset.health,pressed:card.getAttribute('aria-pressed'),name:name&&name.textContent||'',
    labelClipped:!!(name&&name.clientWidth&&name.scrollWidth>name.clientWidth+1),modelKey:thumb&&thumb.dataset.mfModelKey||'',
    thumbnailStatus:thumb&&thumb.dataset.mfThumbStatus||'',thumbnailSource:thumb&&thumb.dataset.mfThumbSource||''};}),
  pointerCount:mfUnitStackPointers.size,focusCount:mfUnitStackFocusCount,lastFocusType:mfUnitStackLastFocusType,
  lastAction:mfUnitStackLastAction,platoonButtons:document.querySelectorAll('#grpRow>.grpBtn').length
})});
