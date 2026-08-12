;
;
/* ============================================================================
   MOBILE HUD STACK POLICY
   ----------------------------------------------------------------------------
   Combat alerts, economy coaching, intel, production and the command dock were
   all individually correct but had no shared owner. On a phone they could fill
   the entire screen at once. This late takeover gives those existing systems a
   priority order without coupling their simulation code:

     critical alert > direct tap feedback > one primary panel > coach banner

   The permanent Army / Select / Stop / Build row stays reachable. Everything
   else collapses while a primary panel is open and returns when it closes.
   ============================================================================ */
let mfUiCoachPending='',mfUiCoachFlushT=0,mfUiSyncFrame=0;

function mfUiInlineOpen(id){
  const el=document.getElementById(id);
  return !!(el&&el.style.display==='block');
}
function mfUiPanelOpen(){
  return mfUiInlineOpen('buildMenu')||mfUiInlineOpen('prodMenu')||mfUiInlineOpen('bldMenu2');
}
function mfUiIntelOpen(){ return mfUiInlineOpen('unitCard'); }
function mfUiCriticalOpen(){ return mfUiInlineOpen('atkAlert')||mfUiInlineOpen('waveAlert'); }
function mfUiBusy(){ return mfUiPanelOpen()||mfUiIntelOpen()||mfUiCriticalOpen(); }

function mfUiClosePrimary(){
  const intel=document.getElementById('unitCard');
  if(intel){ clearTimeout(intel._t); intel.style.display='none'; }
  if(typeof closeMenus==='function') closeMenus();
  mfUiQueueSync();
}
function mfUiEnsurePanelChrome(id,label){
  const el=document.getElementById(id); if(!el) return;
  let bar=el.querySelector(':scope > .mfPanelChrome');
  if(!bar){
    bar=document.createElement('header');bar.className='mfPanelChrome';
    bar.innerHTML='<span></span><button type="button" aria-label="Close '+label+'">\u00d7</button>';
    bar.querySelector('button').addEventListener('pointerdown',ev=>{
      ev.preventDefault();ev.stopPropagation();mfUiClosePrimary();if(typeof sfx==='function')sfx('ui');
    });
    el.insertAdjacentElement('afterbegin',bar);
  }
  bar.querySelector('span').textContent=label;
}
function mfUiInstallChrome(){
  mfUiEnsurePanelChrome('buildMenu','STRUCTURES');
  mfUiEnsurePanelChrome('prodMenu','PRODUCTION');
  mfUiEnsurePanelChrome('bldMenu2','STRUCTURE CONTROL');
}

function mfUiFlushCoach(){
  clearTimeout(mfUiCoachFlushT);
  if(!mfUiCoachPending||mfUiBusy()) return;
  const msg=mfUiCoachPending;mfUiCoachPending='';
  mfUiCoachFlushT=setTimeout(()=>{
    if(mfUiBusy()){mfUiCoachPending=msg;return;}
    if(typeof mfUiBaseShowCoach==='function')mfUiBaseShowCoach(msg);
  },420);
}
function mfUiSync(){
  mfUiSyncFrame=0;mfUiInstallChrome();
  const body=document.body,panel=mfUiPanelOpen(),intel=mfUiIntelOpen();
  const wave=mfUiInlineOpen('waveAlert'),attack=mfUiInlineOpen('atkAlert');
  body.classList.toggle('uiPanelOpen',panel);
  body.classList.toggle('uiIntelOpen',intel);
  body.classList.toggle('uiPrimaryOpen',panel||intel);
  body.classList.toggle('uiWaveOpen',wave);
  body.classList.toggle('uiAttackOpen',attack);
  for(const id of ['buildMenu','prodMenu','bldMenu2']){
    const el=document.getElementById(id);if(el)el.setAttribute('aria-hidden',intel?'true':'false');
  }
  const coach=document.getElementById('coach');
  if((panel||intel||wave||attack)&&coach&&Number(getComputedStyle(coach).opacity)>.05){
    mfUiCoachPending=coach.textContent||mfUiCoachPending;
    clearTimeout(coachHideT);coach.style.opacity=0;
  }
  if(!(panel||intel||wave||attack))mfUiFlushCoach();
}
function mfUiQueueSync(){
  if(!mfUiSyncFrame)mfUiSyncFrame=requestAnimationFrame(mfUiSync);
}

/* Coach messages explain slow economy problems; they are never more urgent
   than the panel the player deliberately opened or an incoming enemy wave. */
const mfUiBaseShowCoach=showCoach;
showCoach=function(msg){
  if(mfUiBusy()){
    mfUiCoachPending=msg;
    const el=document.getElementById('coach');if(el)el.style.opacity=0;
    return;
  }
  mfUiCoachPending='';mfUiBaseShowCoach(msg);
};

/* Automatic first-seen cards must not become a second primary panel. Explicit
   info-button inspections remain available and temporarily replace the menu. */
const mfUiBaseShowIntelMarkup=showIntelMarkup;
showIntelMarkup=function(markup,pinned){
  if(!pinned&&mfUiPanelOpen()) return;
  mfUiBaseShowIntelMarkup(markup,pinned);mfUiQueueSync();
};

const mfUiBaseCloseMenus=closeMenus;
closeMenus=function(){mfUiBaseCloseMenus();mfUiQueueSync();};
const mfUiBaseOpenBldMenu=openBldMenu;
openBldMenu=function(b){mfUiBaseOpenBldMenu(b);mfUiQueueSync();};
const mfUiBaseRenderBuildMenu=renderBuildMenu;
renderBuildMenu=function(){mfUiBaseRenderBuildMenu();mfUiEnsurePanelChrome('buildMenu','STRUCTURES');mfUiQueueSync();};
const mfUiBaseRenderProdMenu=renderProdMenu;
renderProdMenu=function(){mfUiBaseRenderProdMenu();mfUiEnsurePanelChrome('prodMenu','PRODUCTION');mfUiQueueSync();};
const mfUiBaseRenderBldPanel=renderBldPanel;
renderBldPanel=function(){mfUiBaseRenderBldPanel();mfUiEnsurePanelChrome('bldMenu2','STRUCTURE CONTROL');mfUiQueueSync();};

const mfUiWatch=new MutationObserver(mfUiQueueSync);
for(const id of ['buildMenu','prodMenu','bldMenu2','unitCard','atkAlert','waveAlert']){
  const el=document.getElementById(id);if(el)mfUiWatch.observe(el,{attributes:true,attributeFilter:['style','class']});
}
mfUiInstallChrome();mfUiSync();

