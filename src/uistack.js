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

function mfUiDismissIntel(){
  const intel=document.getElementById('unitCard');
  if(intel){ clearTimeout(intel._t); intel.style.display='none'; }
}
function mfUiClosePrimary(){
  mfUiDismissIntel();
  if(typeof closeMenus==='function') closeMenus();
  mfUiQueueSync();
}
function mfUiEnsurePanelChrome(id,label){
  const el=document.getElementById(id); if(!el) return;
  let bar=el.querySelector(':scope > .mfPanelChrome');
  if(!bar){
    bar=document.createElement('header');bar.className='mfPanelChrome';
    bar.innerHTML='<span></span><button type="button" aria-label="Close '+label+'">\u00d7</button>';
    const close=bar.querySelector('button'),activate=ev=>{
      ev.preventDefault();ev.stopPropagation();mfUiClosePrimary();if(typeof sfx==='function')sfx('ui');
    };
    if(typeof mfBindNativePress==='function')mfBindNativePress(close,activate);
    else close.addEventListener('pointerdown',activate);
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
  /* PLATOONS owns the per-type unit-stack rail, and that deck is the only way
     to select a whole stack by type. A cinematic rule hid #grpRow on
     .uiPrimaryOpen, which is (panel || intel) -- and "intel" is only "#unitCard
     is visible", which is what selecting a unit opens. So selecting a unit
     collapsed the deck the player had deliberately opened, rail included, to
     0x0: measured 0x0 with a unit selected against 149x44 without.
     The stylesheet is fixed too, but CSS ships only in the APK and the Space,
     never over the air, so this enforcement is what actually reaches installed
     players. Inline important beats the stylesheet's important; a real
     production/service panel still hides the row, because that is the focus
     this was written to protect. */
  const grp=document.getElementById('grpRow');
  if(grp&&typeof hudDeck!=='undefined'&&hudDeck==='platoons'){
    if(panel) grp.style.removeProperty('display');
    else if(grp.style.getPropertyPriority('display')!=='important'||grp.style.display!=='flex')
      grp.style.setProperty('display','flex','important');
  }else if(grp&&grp.style.getPropertyPriority('display')==='important'){
    grp.style.removeProperty('display');
  }
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
openBldMenu=function(b){mfUiDismissIntel();mfUiBaseOpenBldMenu(b);mfUiQueueSync();};
const mfUiBaseRenderBuildMenu=renderBuildMenu;
renderBuildMenu=function(){mfUiDismissIntel();mfUiBaseRenderBuildMenu();mfUiEnsurePanelChrome('buildMenu','STRUCTURES');mfUiQueueSync();};
const mfUiBaseRenderProdMenu=renderProdMenu;
renderProdMenu=function(){mfUiDismissIntel();mfUiBaseRenderProdMenu();mfUiEnsurePanelChrome('prodMenu','PRODUCTION');mfUiQueueSync();};
const mfUiBaseRenderBldPanel=renderBldPanel;
renderBldPanel=function(){mfUiDismissIntel();mfUiBaseRenderBldPanel();mfUiEnsurePanelChrome('bldMenu2','STRUCTURE CONTROL');mfUiQueueSync();};

const mfUiWatch=new MutationObserver(mfUiQueueSync);
for(const id of ['buildMenu','prodMenu','bldMenu2','unitCard','atkAlert','waveAlert']){
  const el=document.getElementById(id);if(el)mfUiWatch.observe(el,{attributes:true,attributeFilter:['style','class']});
}
mfUiInstallChrome();mfUiSync();
