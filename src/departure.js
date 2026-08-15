;
;
/* ============================================================================
   THEATRE DEPARTURE — faction ship leaves the system
   ----------------------------------------------------------------------------
   Plays after the last conquest site is secured. Reuses the existing drop
   carrier (faction hull + flyby SFX) instead of a video pipeline. Title card
   + scripted camera is the whole beat; radioAck is a VO hook only.
   ============================================================================ */
const MF_DEPART_COPY={
  nova:{title:'NOVA RECALL',sub:'THEATRE COMPLETE',line:'Flagship climbing. The well is behind us.'},
  legion:{title:'LEGION WITHDRAWAL',sub:'THEATRE COMPLETE',line:'Siege barge lifts. The line is closed.'},
  syndicate:{title:'SYNDICATE EXTRACT',sub:'THEATRE COMPLETE',line:'The yacht cuts orbit. Accounts settled.'},
  horde:{title:'BROOD LIFT',sub:'THEATRE COMPLETE',line:'Hive-ship uncoils. The swarm moves on.'}
};
const mfDepart={on:false,t:0,last:0,fac:'nova',after:null,fromVictory:false};

function mfDepartureTheatreDone(){
  if(typeof demoMode!=='undefined'&&demoMode) return false;
  if(typeof weeklyMode!=='undefined'&&weeklyMode) return false;
  if(typeof storyCampaignActiveId!=='undefined'&&storyCampaignActiveId) return false;
  if(typeof trainingMissionActive==='function'&&trainingMissionActive()) return false;
  if(typeof mfConquestGateActive==='function'&&!mfConquestGateActive()) return false;
  return typeof mfConquestTotalMaps==='function'
    &&mfConquestTotalMaps()>0
    &&mfConquestTotalWins()>=mfConquestTotalMaps();
}
function mfConquestHasNextMap(){
  if(typeof PLANETS==='undefined'||typeof mfConquestMapOpen!=='function') return false;
  for(const key of Object.keys(PLANETS))for(const R of PLANETS[key].regions)for(const map of R.maps)
    if(mfConquestMapOpen(map)&&!mfConquestWon(map)) return true;
  return false;
}
function mfVictoryHasNext(){
  if(typeof demoMode!=='undefined'&&demoMode) return false;
  if(typeof weeklyMode!=='undefined'&&weeklyMode) return false;
  if(typeof storyCampaignActiveId!=='undefined'&&storyCampaignActiveId) return false;
  if(typeof trainingMissionActive==='function'&&trainingMissionActive()) return false;
  if(typeof mfConquestGateActive==='function'&&!mfConquestGateActive()) return false;
  return mfConquestHasNextMap();
}
function mfDepartureEnsureCard(copy){
  let el=document.getElementById('mfDepart');
  if(!el){
    el=document.createElement('div');
    el.id='mfDepart';
    el.className='overlay';
    el.innerHTML='<div class="mfDepartCard"><small id="mfDepartSub"></small><b id="mfDepartTitle"></b><p id="mfDepartLine"></p>'
      +'<button type="button" id="mfDepartSkip" class="mbtn alt">SKIP</button></div>';
    document.body.appendChild(el);
    const skip=el.querySelector('#mfDepartSkip');
    if(skip) skip.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); mfDepartureFinish(); });
  }
  const sub=document.getElementById('mfDepartSub');
  const title=document.getElementById('mfDepartTitle');
  const line=document.getElementById('mfDepartLine');
  if(sub) sub.textContent=copy.sub;
  if(title) title.textContent=copy.title;
  if(line) line.textContent=copy.line;
  el.style.display='flex';
  el.style.opacity='0';
  return el;
}
function mfDeparturePlay(fac,after){
  if(mfDepart.on) return;
  const raw=fac||((typeof playerKitKey==='function')?playerKitKey():((typeof playerFaction!=='undefined'&&playerFaction)||'nova'));
  const key=typeof dropFactionKey==='function'?dropFactionKey(raw):String(raw||'nova');
  const copy=MF_DEPART_COPY[key]||MF_DEPART_COPY.nova;
  mfDepart.on=true; mfDepart.t=0; mfDepart.last=0; mfDepart.fac=key;
  mfDepart.after=after||null; mfDepart.fromVictory=false;
  const go=document.getElementById('gameOver'); if(go) go.style.display='none';
  if(typeof stopAttract==='function') stopAttract();
  if((typeof terrVerts==='undefined'||!terrVerts||!blds.some(B=>B&&B.alive))&&typeof setupAttract==='function'){
    setupAttract();
    if(typeof stopAttract==='function') stopAttract();
  }
  running=false; paused=false; attractOn=false; attractVisible=false;
  document.body.classList.add('mfDeparting','menuMode');
  const hq=blds.find(B=>B.alive&&B.team===0&&B.type==='hq')||blds.find(B=>B.alive&&B.team===0);
  const x=hq?hq.x:(typeof MAP==='number'?MAP*0.28:400);
  const y=hq?hq.y:(typeof MAP==='number'?MAP*0.72:400);
  carrier.active=true; carrier.phase=1; carrier.fac=key;
  carrier.x=x; carrier.y=y; carrier.tx=x+980; carrier.ty=y-560;
  carrier.clearance=38; carrier.alt=0; carrier.dust=0;
  carrier.ang=Math.atan2(carrier.ty-carrier.y,carrier.tx-carrier.x);
  cam.x=x; cam.y=y; camFollow=-1;
  orthoSpan=distTarget=520; camPitch=pitchTarget=1.02; camYaw=yawTarget=0.22;
  if(typeof clampCam==='function') clampCam();
  if(typeof camUpdateMatrices==='function') camUpdateMatrices();
  mfDepartureEnsureCard(copy);
  if(typeof sfx==='function') sfx('flyby',carrier.x,carrier.y,0.82);
  /* Voice packs already fire victory on endGame. ability is the leftover
     hook that sounds like a command departure without editing audio.js. */
  try{ if(typeof radioAck==='function') radioAck('ability',1); }catch(e){}
  if(typeof toast==='function') toast(copy.title);
}
function mfDepartureFinish(cb){
  const after=cb||mfDepart.after;
  mfDepart.on=false; mfDepart.after=null; mfDepart.fromVictory=false; mfDepart.last=0;
  const el=document.getElementById('mfDepart'); if(el) el.style.display='none';
  document.body.classList.remove('mfDeparting');
  if(typeof carrier!=='undefined'){ carrier.active=false; carrier.phase=2; }
  if(typeof after==='function') after();
  else if(typeof mfDepartReturn==='function') mfDepartReturn();
}
function mfDepartureTick(ts){
  if(!mfDepart.last) mfDepart.last=ts;
  let dt=(ts-mfDepart.last)/1000; mfDepart.last=ts;
  if(dt>0.25) dt=0.25;
  mfDepart.t+=dt;
  const C=carrier, T=mfDepart.t;
  C.active=true; C.phase=1;
  C.clearance=28+T*T*28;
  const spd=54+T*18;
  const dx=C.tx-C.x, dy=C.ty-C.y, d=Math.hypot(dx,dy)||1;
  C.x+=dx/d*spd*dt; C.y+=dy/d*spd*dt;
  const ta=Math.atan2(dy,dx);
  let da=ta-C.ang; while(da>Math.PI) da-=TAU; while(da<-Math.PI) da+=TAU;
  C.ang+=clamp(da,-2.4*dt,2.4*dt);
  cam.x+=(C.x-cam.x)*Math.min(1,dt*1.55);
  cam.y+=(C.y-cam.y)*Math.min(1,dt*1.55);
  orthoSpan=distTarget=520+T*36;
  camPitch=pitchTarget=1.06+Math.min(0.24,T*0.035);
  camYaw=yawTarget=0.32+T*0.09;
  if(typeof clampCam==='function') clampCam();
  if(typeof camUpdateMatrices==='function') camUpdateMatrices();
  if(typeof updParticles==='function') updParticles(dt);
  if(typeof processDeforms==='function') processDeforms();
  if(typeof render==='function') render(dt);
  const card=document.getElementById('mfDepart');
  if(card){
    const fade=T<0.45?T/0.45:T>6.5?clamp(1-(T-6.5)/1.2,0,1):1;
    card.style.opacity=String(fade);
  }
  if(T>=7.8) mfDepartureFinish();
}

function mfVictoryEnsureBtns(){
  const foot=document.querySelector('#gameOver .goResultFoot');
  if(!foot) return null;
  let cont=document.getElementById('goContinueBtn');
  if(!cont){
    cont=document.createElement('button');
    cont.className='mbtn'; cont.id='goContinueBtn';
    cont.textContent='▶  CONTINUE';
    foot.appendChild(cont);
    if(cont.dataset.bound!=='1'){
      cont.dataset.bound='1';
      if(typeof mfBindTap==='function') mfBindTap(cont,mfVictoryContinue);
      else cont.addEventListener('pointerup',mfVictoryContinue);
    }
  }
  const menu=document.getElementById('restartBtn');
  if(menu) menu.textContent='←  RETURN TO MENU';
  return {foot,cont,menu};
}
function mfVictoryPaintButtons(win){
  const B=mfVictoryEnsureBtns(); if(!B) return;
  const next=!!(win&&mfVictoryHasNext());
  B.cont.style.display=next?'':'none';
  B.cont.disabled=!next;
  B.cont.textContent=next?'▶  CONTINUE':'▶  CONTINUE';
  if(B.menu) B.menu.textContent='←  RETURN TO MENU';
  if(win&&mfDepart.fromVictory){
    const rw=document.getElementById('goRewards');
    if(rw&&!rw.querySelector('.mfDepartNotice')){
      const n=document.createElement('div');
      n.className='goNotice good mfDepartNotice';
      n.textContent='◈ FOUR-SYSTEM THEATRE COMPLETE — departure armed on return';
      rw.appendChild(n);
    }
  }
}
function mfVictoryContinue(){
  if(typeof sfx==='function') sfx('ui');
  mfDepart.fromVictory=false;
  if(typeof continueToNextMap==='function') continueToNextMap();
}

const mfDepartReturn=returnToMainMenu;
returnToMainMenu=function(){
  if(mfDepart.on){ mfDepartureFinish(mfDepartReturn); return; }
  if(mfDepart.fromVictory){
    mfDepart.fromVictory=false;
    mfDeparturePlay(null,mfDepartReturn);
    return;
  }
  mfDepartReturn();
};

const mfDepartEnd=endGame;
endGame=function(win,reason){
  mfDepart.fromVictory=false;
  mfDepartEnd(win,reason);
  setTimeout(()=>{
    mfDepart.fromVictory=!!(win&&mfDepartureTheatreDone());
    mfVictoryPaintButtons(!!win);
  },1480);
};

const mfDepartFrame=frame;
frame=function(ts){
  if(mfDepart.on){
    requestAnimationFrame(frame);
    if(!bootConfirmed&&typeof confirmBoot==='function') confirmBoot();
    mfDepartureTick(ts);
    return;
  }
  mfDepartFrame(ts);
};

(function(){
  const m=location.search.match(/[?&]departqa=([a-z0-9]+)/i);
  if(!m) return;
  const fac=m[1]==='1'||m[1]==='true'?'nova':m[1];
  const kick=()=>{
    if(typeof render!=='function'||typeof carrier==='undefined'||typeof terrVerts==='undefined'||!terrVerts){
      setTimeout(kick,280); return;
    }
    const intro=document.getElementById('mfIntro'); if(intro) intro.style.display='none';
    const ap=document.getElementById('apOverlay'); if(ap) ap.style.display='none';
    if(typeof apGateSatisfied==='function') try{ apGateSatisfied(); }catch(e){}
    mfDeparturePlay(fac);
  };
  setTimeout(kick,1800);
})();
