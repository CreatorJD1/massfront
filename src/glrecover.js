;
;
/* ============================================================================
   GRAPHICS RECOVERY — wait, rebuild, step down. Do not throw the match away.
   ----------------------------------------------------------------------------
   What used to happen when Android reclaimed the GPU: the game stopped, showed
   an overlay, and reloaded the whole page 1.7 seconds later. Two things were
   wrong with that, and the second is the worse one.

   1.7 SECONDS IS NOT LONG ENOUGH TO ASK. A lost WebGL context is very often
   given back — the browser fires `webglcontextrestored` once the driver has
   room again, and on a phone that routinely takes several seconds. Reloading
   after 1.7 s guaranteed we never found out.

   AND THE RESTORE PATH ALSO RELOADED. Even when the browser DID hand the
   context back, the handler called location.replace(). So the one event that
   means "you can carry on" was treated identically to the failure, and the
   player lost their match either way.

   The sim does not live on the GPU. Units, structures, resources and the clock
   are plain JavaScript arrays and are completely untouched by a context loss.
   Only GL OBJECTS die — programs, textures, buffers, vertex arrays — and every
   one of those is created by a short, known sequence at boot. So the honest
   response is to pause, wait properly, re-run that sequence, and carry on in
   place. No reload, no lost match.

   And because a context loss means the device ran out of graphics memory, the
   quality preset steps DOWN one notch on recovery and stays there. Restoring at
   exactly the settings that just exhausted the GPU invites the same crash
   ninety seconds later, and a player who has to find the graphics menu to stop
   a crash loop will just stop playing.
   ============================================================================ */

/* How long to wait before conceding. Generous on purpose: the alternative to
   waiting is losing the match, so a player would rather look at a "recovering"
   card for twenty seconds than be thrown back to the menu in two. */
/* Eight seconds is long enough for Android to return a backgrounded context,
   but short enough that a genuinely dead driver does not strand the player on
   a countdown. The session snapshot makes the automatic reload recoverable. */
const GLR_WAIT_MS = 8000;
let glrLost = false, glrDeadline = 0, glrTick = 0, glrWasRunning = false;
let glrWasPaused = false, glrPauseOwned = false;
/* `webglcontextrestored` is normally delivered once, but GPU/process recovery
   can fan it out across listeners while a previous rebuild is still running.
   Rebuilding resources twice races live texture/program handles. Give-up can
   likewise be reached by the timer, the button, and a failed rebuild, so both
   paths have explicit one-shot latches. */
let glrRebuilding = false, glrGiveupQueued = false;

function glrQualityDown(){
  try{
    const order=['cinematic','high','medium','low'];
    const cur=(typeof qualityKey==='function')?qualityKey():'high';
    const i=order.indexOf(cur);
    if(i<0||i>=order.length-1) return null;          // already at the floor
    META.settings.quality=order[i+1];
    if(typeof applySettings==='function') applySettings();
    if(typeof metaSave==='function') metaSave();     // survive the next launch too
    return META.settings.quality;
  }catch(e){ return null; }
}

/* Re-run ONLY the GL-object creators from the boot sequence in main.js.
   Deliberately NOT setupDeposits/setupDoodads/camera — those mutate world
   state, and re-running them would regenerate the map underneath a live match
   or stack a second set of deposits on top of the first. */
function glrRebuildResources(){
  const step=(name,fn)=>{ try{ fn(); }catch(e){ console.warn('glrecover: '+name+' failed',e); throw e; } };
  /* FORGET THE DEAD HANDLES FIRST. Builders that cache their VAO/texture in a
     module variable branch on if(!handle) - after a loss the handle is truthy
     but dead, so without this the terrain rebuild poured vertices into dead
     buffers and the ground stayed a fog-coloured void for the rest of the
     match (seen on device at 11:37: units and structures back, terrain gone). */
  /* Timer-query objects are context-owned too. A restored WebGL context keeps
     the same JavaScript `gl` identity in browsers, so perf telemetry cannot
     infer restoration from `g===mfPerfGL`; explicitly discard its dead query
     ring before any rebuilt pass can submit fresh work. */
  step('mfPerfGLReset', ()=>{ if(typeof mfPerfGLReset==='function') mfPerfGLReset(); });
  step('terrainGLReset',()=>{ if(typeof terrainGLReset==='function') terrainGLReset(); });
  step('terrainTextureGLReset',()=>{ if(typeof terrainTextureGLReset==='function') terrainTextureGLReset(); });
  step('worldKitGLReset',()=>{ if(typeof worldKitGLReset==='function') worldKitGLReset(); });
  step('fogGLReset',    ()=>{ if(typeof fogGLReset==='function') fogGLReset(); });
  /* GPU particles. gpfxGLReset() shipped with NO caller anywhere in the tree,
     so the transform-feedback program, its two buffers, both VAOs and the
     transform-feedback object all stayed truthy-but-dead after a restore.
     gpfxInit()'s guard is `if(gpfxProgU) return`, so it never rebuilt: sparks,
     embers, impact spray and superweapon fragments were gone for the rest of
     the session, after several seconds of per-frame GL errors from drawing
     through the dead VAOs. gpufx.js now also self-heals on the epoch, but this
     resets it on the same ordered pass as every other subsystem. */
  step('gpfxGLReset',   ()=>{ if(typeof gpfxGLReset==='function') gpfxGLReset(); });
  step('mfOrdnanceTrailGLReset',()=>{ if(typeof mfOrdnanceTrailGLReset==='function') mfOrdnanceTrailGLReset(); });
  step('macroFxGLReset',()=>{ if(typeof macroFxGLReset==='function') macroFxGLReset(); });
  step('shieldFxGLReset',()=>{ if(typeof shieldFxGLReset==='function') shieldFxGLReset(); });
  step('mfNoiseGLReset',()=>{ if(typeof mfNoiseGLReset==='function') mfNoiseGLReset(); });
  step('mfShockwaveGLReset',()=>{ if(typeof mfShockwaveGLReset==='function') mfShockwaveGLReset(); });
  /* War Table planet maps rebuild lazily after the base renderer is healthy;
     this reset only discards truthy handles from the dead context. */
  step('mfPlanetPreviewGLReset',()=>{ if(typeof mfPlanetPreviewGLReset==='function') mfPlanetPreviewGLReset(); });
  step('initGL3D',      ()=>initGL3D());
  step('shieldFxBoot',  ()=>{ if(typeof shieldFxBoot==='function') shieldFxBoot(); });
  step('materialGLReset',()=>{ if(typeof materialGLReset==='function') materialGLReset(); });
  step('buildMatAtlas', ()=>buildMatAtlas());
  step('initMaterialV2',()=>{ if(typeof initMaterialV2==='function') initMaterialV2(); });
  step('initBillboards',()=>{ if(typeof initBillboards==='function') initBillboards(); });
  step('macroFxBoot',   ()=>{ if(typeof macroFxBoot==='function') macroFxBoot(); });
  step('modAttachGLReset',()=>{ if(typeof modAttachGLReset==='function') modAttachGLReset(); });
  step('initModels',    ()=>initModels());
  step('adGLReset',     ()=>{ if(typeof adGLReset==='function') adGLReset(); });
  step('buildAtlas',    ()=>{ if(typeof buildAtlas==='function') atlasTex=buildAtlas(); });
  step('mfIconInitGL',  ()=>{ if(typeof mfIconInitGL==='function') mfIconInitGL(); });
  /* unitTex belongs to the lost context; without this, shatter silently stops
     working for the rest of the session after a context restore. */
  step('loadUnitSheet', ()=>{ if(typeof loadUnitSheet==='function') loadUnitSheet(); });
  step('buildDetailTex',()=>{ if(typeof buildDetailTex==='function') buildDetailTex(); });
  step('terrainTextures',()=>{ if(typeof loadTerrainTextures==='function') loadTerrainTextures(); });
  step('initFloatText', ()=>{ if(typeof initFloatText==='function') initFloatText(); });
  /* heightF, the painted canvas, paving mask and hydrology are live match
     state. Re-upload them; never regenerate the world beneath surviving units. */
  step('terrainGLRebuild',()=>{ if(typeof terrainGLRebuild!=='function'||!terrainGLRebuild())
    throw new Error('terrain GPU rebuild failed'); });
  step('resize',        ()=>resize());
  /* The fog texture is GPU-side and would otherwise come back blank, hiding
     everything the player had already explored. */
  try{ if(typeof updateFog==='function'&&typeof fogOn!=='undefined'&&fogOn) updateFog(); }catch(e){}
  return true;
}

function glrCard(title,body,action){
  let o=document.getElementById('glrCard');
  if(!o){
    o=document.createElement('div'); o.id='glrCard';
    o.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;'
      +'align-items:center;justify-content:center;gap:14px;background:rgba(2,6,12,.94);color:#cfe6ff;'
      +'text-align:center;padding:26px;font-family:var(--fT,system-ui,sans-serif)';
    (document.body||document.documentElement).appendChild(o);
  }
  o.innerHTML='<div style="font:900 14px/1.4 var(--fT,sans-serif);letter-spacing:.1em;color:#8fd0ff">'+title+'</div>'
    +'<div id="glrBody" style="font-size:12px;max-width:300px;line-height:1.55;color:#9fb8cc">'+body+'</div>'
    +(action?'<button id="glrAct" type="button" style="margin-top:6px;padding:13px 30px;border-radius:12px;'
      +'border:1px solid #48cfff;background:linear-gradient(180deg,#2a6f96,#0d2a42);color:#eaf7ff;'
      +'font:900 12px var(--fT,sans-serif);letter-spacing:.12em">'+action.label+'</button>':'');
  if(action){
    const b=document.getElementById('glrAct');
    if(b){ if(typeof mfBindTap==='function') mfBindTap(b,action.fn); else b.addEventListener('click',action.fn); }
  }
  return o;
}
function glrCardBody(html){ const b=document.getElementById('glrBody'); if(b) b.innerHTML=html; }
function glrHide(){ const o=document.getElementById('glrCard'); if(o) o.remove(); }

function glrOnLost(e){
  if(e&&e.preventDefault) e.preventDefault();   // required, or the context is never restorable
  if(glrLost) return;
  glrLost=true;
  glrGiveupQueued=false;
  glrWasRunning=(typeof running!=='undefined')&&running&&!(typeof gameEnded!=='undefined'&&gameEnded);
  glrWasPaused=(typeof paused!=='undefined')&&!!paused;
  glrPauseOwned=!!(glrWasRunning&&!glrWasPaused);
  /* PAUSE, do not stop. `running=false` tears down the match; the sim state is
     fine and we intend to carry on with it. Only claim the pause when an
     active, previously-unpaused match needs one: menus and modal-paused games
     keep their intentional state across restoration. */
  try{ if(glrPauseOwned&&typeof paused!=='undefined') paused=true; }catch(_){}
  /* Stop telemetry touching timer queries while the context is lost. The
     restore rebuild resets it again because animation frames can run between
     these two events and browsers retain the same `gl` wrapper. */
  try{ if(typeof mfPerfGLReset==='function') mfPerfGLReset(); }catch(_){}
  /* Belt and braces: if recovery fails and we do end up reloading, the match is
     already on disk. */
  try{ if(typeof sessSnapshot==='function') sessSnapshot('contextlost'); }catch(_){}

  glrDeadline=Date.now()+GLR_WAIT_MS;
  glrCard('GRAPHICS PAUSED',
    'The device reclaimed graphics memory. Waiting for it to come back — your match is paused, not lost.',
    {label:'RELOAD NOW', fn:glrGiveUp});
  clearInterval(glrTick);
  glrTick=setInterval(function(){
    const left=Math.max(0,Math.ceil((glrDeadline-Date.now())/1000));
    glrCardBody('The device reclaimed graphics memory. Waiting for it to come back — '
      +'your match is paused, not lost.<br><span style="color:#7f9db4">'+left+'s</span>');
    if(left<=0) glrGiveUp();
  },500);
}

function glrOnRestored(){
  if(!glrLost||glrRebuilding||glrGiveupQueued) return;
  clearInterval(glrTick);
  glrCardBody('Graphics restored. Rebuilding…');
  let ok=false;
  glrRebuilding=true;
  try{ ok=glrRebuildResources(); }catch(e){ ok=false; }
  finally{ glrRebuilding=false; }
  if(!ok){ glrGiveUp(); return; }
  /* Step down so the same fight does not exhaust the same GPU again in ninety
     seconds. Told plainly, because a silent quality drop reads as the game
     getting worse for no reason. */
  const now=glrQualityDown();
  glrLost=false; glrHide();
  try{
    const stillRunning=(typeof running!=='undefined')&&running&&
      !(typeof gameEnded!=='undefined'&&gameEnded);
    /* Undo only the pause this recovery cycle introduced. An already-paused
       match/modal stays paused, and a match that ended during recovery is not
       revived or otherwise rewritten here. */
    if(glrPauseOwned&&glrWasRunning&&stillRunning&&typeof paused!=='undefined') paused=glrWasPaused;
  }catch(_){}
  glrWasRunning=false;glrWasPaused=false;glrPauseOwned=false;
  try{
    if(typeof toast==='function')
      toast(now ? '◈ GRAPHICS RESTORED — quality lowered to '+String(now).toUpperCase()+' to keep it stable'
                : '◈ GRAPHICS RESTORED');
  }catch(_){}
}

/* Last resort only. The session was snapshotted at the moment of loss, and
   sessRenderResume() offers it the moment the menu comes back. */
function glrGiveUp(){
  if(glrGiveupQueued) return;
  glrGiveupQueued=true;
  clearInterval(glrTick);
  glrQualityDown();
  try{ if(typeof sessSnapshot==='function') sessSnapshot('contextlost'); }catch(_){}
  const probe=glrProbeURL();
  glrCardBody(probe
    ?'Graphics did not come back. Releasing the FX probe and reloading normal graphics — your match is saved.'
    :'Graphics did not come back. Reloading — your match is saved, and RESUME DROPPED SESSION will pick it up.');
  setTimeout(function(){
    try{ location.replace(glrRecoveryURL()); }
    catch(e){ location.reload(); }
  },900);
}

/* A failed diagnostic probe must not repeatedly reload into the same optional
   diagnostic workload. Remove only probe-only flags; all ordinary game route
   state survives the recovery URL exactly as before. */
function glrProbeURL(){
  try{
    const q=new URL(location.href).searchParams;
    return q.has('volfxprobe')||q.has('fxprobe')||q.has('macrofxprobe')||q.has('orgfxprobe');
  }catch(e){ return false; }
}
function glrRecoveryURL(){
  const u=new URL(location.href);
  if(glrProbeURL()){
    ['volfxprobe','fxprobe','macrofxprobe','orgfxprobe','allowsoftware'].forEach(k=>u.searchParams.delete(k));
    try{ if(typeof mfProbeLeaseRelease==='function') mfProbeLeaseRelease(); }catch(e){}
  }
  u.searchParams.set('mf_glreset',Date.now().toString(36));
  return u.href;
}

(function glrInstall(){
  try{
    const c=document.getElementById('gl');
    if(!c) return;
    /* Capture phase, so this runs before the legacy handler in gl.js and can
       stop it reloading out from under a recovery that is already working. */
    c.addEventListener('webglcontextlost', glrOnLost, true);
    c.addEventListener('webglcontextrestored', glrOnRestored, true);
  }catch(e){}
})();

