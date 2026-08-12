/* ============================================================================
   BOOT LOADER
   ----------------------------------------------------------------------------
   Decides which copy of the game to run: the one packaged in this build, or a
   patch the updater has downloaded since.

   It has to be tiny and it has to be safe, because it is the one piece of code
   that cannot itself be patched. Two rules keep it safe:

     1. A patched bundle is only used if it is COMPLETE — every file named in
        its own load order is present. A partial bundle is discarded on sight.
     2. Before running a patch it writes a probation record, and the game clears
        that record once it has actually reached its first frame. If the record
        is still there on the next launch, the patch failed to boot and is
        thrown away automatically. The packaged build never leaves the device,
        so falling back costs nothing.

   Scripts are appended in manifest order and run as classic scripts sharing one
   scope, exactly as the static tags did — the load order is the contract, and
   it does not change just because the source came from storage.
   ============================================================================ */
(function(){
  var MANIFEST=[
    './assets/data/unitsheet.js','./assets/data/itemart.js','./src/engine/gl.js','./src/engine/terragen.js','./src/terralab.js','./src/engine/mesh.js','./src/engine/billboard.js','./src/engine/tacticons.js','./src/engine/gpufx.js','./src/engine/materials.js','./src/engine/materials-v2.js','./src/engine/terrain.js','./src/engine/models-world-data.js','./src/engine/models-world-loader.js','./src/engine/models.js','./assets/data/worldkit.js','./src/engine/worldsites.js','./assets/data/meshes.js','./src/engine/models-legion.js','./src/engine/models-machine.js','./src/engine/models-infestation.js','./src/engine/models-civic.js','./src/engine/models-skyline.js','./src/engine/materials-world-v2.js','./src/engine/models-units-nova.js','./src/engine/models-units-legion.js','./src/engine/models-units-syndicate.js','./src/engine/models-units-brood.js','./src/engine/modkit.js','./src/game/sim.js','./src/game/economy.js','./src/game/commander.js','./src/game/meta.js','./src/game/ai.js','./src/ui/input.js','./src/ui/hud.js','./src/ui/render3d.js','./src/ui/orderfx.js','./src/airlift.js','./src/airlift-factions.js','./src/factions.js','./src/factext.js','./src/offline.js','./src/audio.js','./src/assetpack.js','./src/hazards.js','./src/authportal.js','./src/tutorial.js','./src/adboards.js','./src/storeui.js','./src/restree3d.js','./src/develop.js','./src/factiondoctrine.js','./src/endgame.js','./src/story.js','./src/daily.js','./src/account.js','./src/economy-net.js','./src/updater.js','./src/intro.js','./src/session.js','./src/faction-id.js','./src/glrecover.js','./src/main.js','./src/galaxyui.js','./src/uistack.js','./src/ui/hudflow.js','./src/ui/hotslots.js'
  ];
  /* Packaged scripts need a release key. WebViews and development browsers can
     otherwise reuse a stale source even after the installer or local preview
     has changed, which made new settings appear to be missing until cache was
     cleared manually. Patch bundles keep their content-addressed Blob URLs. */
   var PACKAGED_REV='1.33.31';
  var DB='massfront-updates', STORE='bundles';
  var bootShield=null, bootShieldTimer=0, bootShieldWatchdog=0;
  var bootShieldEvents=['pointerdown','pointerup','touchstart','touchend','click'];
  /* Absolute ceiling on how long the shield/guard may live. The guard is only
     ever lowered by __bootOk()->releaseBootShield() on the first frame; if that
     never runs (a WebGL failure, a throw before the render loop, or an OTA
     shell whose release hook is absent) an unbounded sentinel would strand
     every guard-reading control forever — a real Android device saw exactly
     that on the Account button. Cap it and back it with a watchdog so it can
     never persist; the install gesture cannot still be in flight seconds on. */
  var BOOT_SHIELD_MAX_MS=6000;

  /* The install gesture began in the previous document. Block every pointer
     until this document has rendered a real frame, plus the short interval in
     which Android can synthesize a click from that old gesture. This lives in
     the immutable boot loader rather than an OTA bundle, so an old or broken
     patch cannot omit the protection it needs in order to restart safely. */
  function blockBootInput(e){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function installBootShield(){
    /* Bounded deadline, never Number.MAX_SAFE_INTEGER: apBindTap-style controls
       suppress taps while Date.now() is below this, so an infinite sentinel the
       release path failed to lower would kill them permanently. */
    window.__MASSFRONT_INPUT_GUARD_UNTIL=Date.now()+BOOT_SHIELD_MAX_MS;
    bootShield=document.createElement('div');
    bootShield.setAttribute('aria-hidden','true');
    bootShield.setAttribute('data-mf-boot-input-shield','');
    bootShield.style.cssText='position:fixed;inset:0;z-index:2147483647;background:transparent;pointer-events:auto;touch-action:none';
    /* The OTA shell replaces body.innerHTML. A child of <html> survives that
       replacement and continues intercepting the release of the install tap. */
    document.documentElement.appendChild(bootShield);
    for(var i=0;i<bootShieldEvents.length;i++)
      document.addEventListener(bootShieldEvents[i],blockBootInput,true);
    /* Watchdog backstop: drop the shield even if a frame is never confirmed, so
       a failed boot degrades to a usable menu rather than a permanently dead
       screen. releaseBootShield()/clearBootShield() cancel it on the happy path. */
    bootShieldWatchdog=setTimeout(clearBootShield,BOOT_SHIELD_MAX_MS);
  }
  function clearBootShield(){
    if(bootShieldWatchdog){ clearTimeout(bootShieldWatchdog); bootShieldWatchdog=0; }
    if(bootShieldTimer){ clearTimeout(bootShieldTimer); bootShieldTimer=0; }
    for(var i=0;i<bootShieldEvents.length;i++)
      document.removeEventListener(bootShieldEvents[i],blockBootInput,true);
    if(bootShield&&bootShield.parentNode) bootShield.parentNode.removeChild(bootShield);
    bootShield=null;
    window.__MASSFRONT_INPUT_GUARD_UNTIL=0;
  }
  function releaseBootShield(){
    if(bootShieldTimer) return;
    window.__MASSFRONT_INPUT_GUARD_UNTIL=Date.now()+450;
    bootShieldTimer=setTimeout(clearBootShield,450);
  }
  installBootShield();

  function idb(){
    return new Promise(function(res,rej){
      var r=indexedDB.open(DB,1);
      r.onupgradeneeded=function(){ var d=r.result;
        if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
      r.onsuccess=function(){ res(r.result); };
      r.onerror=function(){ rej(r.error); };
    });
  }
  function get(db,key){
    return new Promise(function(res){
      try{
        var tx=db.transaction(STORE,'readonly'), q=tx.objectStore(STORE).get(key);
        q.onsuccess=function(){ res(q.result); }; q.onerror=function(){ res(null); };
      }catch(e){ res(null); }
    });
  }
  function del(db,key){
    return new Promise(function(res){
      try{
        var tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); };
      }catch(e){ res(); }
    });
  }
  function put(db,key,val){
    return new Promise(function(res){
      try{
        var tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(val,key);
        tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); };
      }catch(e){ res(); }
    });
  }
  function verNewer(a,b){
    var pa=String(a||'').split('.').map(Number);
    var pb=String(b||'').split('.').map(Number);
    for(var i=0;i<Math.max(pa.length,pb.length);i++){
      var x=pa[i]||0, y=pb[i]||0;
      if(x!==y) return x>y;
    }
    return false;
  }
  function failed(db,version,reason){
    version=version||'?';
    return get(db,'applyFailure').then(function(prev){
      var count=prev&&prev.version===version?(prev.count|0)+1:1;
      var rec={version:version,at:Date.now(),reason:reason,count:count,
               quarantined:count>=2};
      return put(db,'applyFailure',rec).then(function(){ return rec; });
    });
  }
  function dropPendingVersion(db,version){
    return get(db,'pending').then(function(p){
      return p&&p.version===version?del(db,'pending'):null;
    });
  }
  function validBundle(b){
    if(!b||!b.files||!verNewer(b.version,PACKAGED_REV)) return false;
    var order=b.order&&b.order.length?b.order:MANIFEST;
    for(var i=0;i<order.length;i++) if(typeof b.files[order[i]]!=='string') return false;
    return true;
  }
  function restorePreviousOrPackaged(db,failedVersion){
    return get(db,'previous').then(function(prev){
      if(!validBundle(prev)||String(prev.version)===String(failedVersion)){
        return del(db,'previous').then(function(){ runPackaged(); });
      }
      /* This record was captured only while its exact version was running after
         probation. Consume it once: a broken update must never bounce between
         two patches. Keep the failed pending payload so the Update screen can
         offer one controlled retry and explain what happened. */
      return put(db,'active',prev).then(function(){ return del(db,'previous'); })
        .then(function(){
          window.__MASSFRONT_PATCHED=prev.version||'?';
          window.__MASSFRONT_RECOVERED_PATCH=failedVersion||'?';
          console.warn('boot: restored validated patch '+prev.version+
                       ' after '+failedVersion+' failed');
          runBundle(prev);
        });
    });
  }
  function rejectPatch(db,version,reason){
    return failed(db,version,reason).then(function(rec){
      if(rec.quarantined)
        console.warn('boot: patch '+version+' failed twice and was quarantined');
      return del(db,'active')
        .then(function(){ return del(db,'probation'); })
        .then(function(){ return rec.quarantined?dropPendingVersion(db,version):null; })
        .then(function(){ return restorePreviousOrPackaged(db,version); });
    });
  }
  function evictSuperseded(db){
    var keys=['active','pending','probation','previous'];
    return Promise.all(keys.map(function(key){ return get(db,key); }))
      .then(function(records){
        var work=[];
        for(var i=0;i<keys.length;i++){
          var rec=records[i];
          if(rec&&!verNewer(rec.version,PACKAGED_REV)){
            console.info('boot: discarding '+keys[i]+' patch '+(rec.version||'?')+
                         '; packaged build is '+PACKAGED_REV);
            work.push(del(db,keys[i]));
          }
        }
        return Promise.all(work);
      });
  }

  function runPackaged(){
    var i=0;
    (function next(){
      if(i>=MANIFEST.length) return;
      var s=document.createElement('script');
      s.src=MANIFEST[i++]+'?v='+PACKAGED_REV; s.async=false;
      s.onload=next;
      s.onerror=function(){ console.error('boot: failed',s.src); next(); };
      document.body.appendChild(s);
    })();
  }
  function runBundle(b){
    /* Blob URLs rather than inline text: the browser keeps a real filename for
       each source, so a stack trace from a patched build is still readable. */
    var order=b.order&&b.order.length? b.order : MANIFEST;
    var i=0;
    (function next(){
      if(i>=order.length) return;
      var path=order[i++], src=b.files[path];
      var s=document.createElement('script');
      s.async=false;
      if(src==null){ s.src=path; }
      else s.src=URL.createObjectURL(new Blob([src+'\n//# sourceURL='+path],{type:'text/javascript'}));
      s.onload=next;
      s.onerror=function(){ console.error('boot: failed',path); next(); };
      document.body.appendChild(s);
    })();
  }

  idb().then(function(db){
    /* Native app upgrades preserve WebView IndexedDB. Never let an old OTA
       remain above a newer packaged APK merely because it was active before
       the installer ran. Pending and probation records follow the same rule. */
    return evictSuperseded(db).then(function(){
      return get(db,'probation').then(function(prob){
      /* Probation counts ATTEMPTS, not intent. The updater writes it at zero
         before reloading; this loader claims it by incrementing. Seeing a
         record that has already been claimed means the previous launch ran the
         patch and never reached a frame — so it is bad, and out it goes.
         Counting rather than merely existing is the difference between "we are
         about to try" and "we tried and it died". */
      if(prob && (prob.tries|0)>=1){
        console.warn('boot: rolling back a patch that failed to start');
        return rejectPatch(db,prob.version,'The downloaded update did not finish starting.');
      }
      return get(db,'active').then(function(b){
        if(!b||!b.files){
          if(!prob) return runPackaged();
          return rejectPatch(db,prob.version,'The downloaded update was not available at restart.');
        }
        if(!validBundle(b)){
          console.warn('boot: patched bundle incomplete or superseded, using a validated fallback');
          return rejectPatch(db,b.version,'The downloaded update was incomplete at restart.');
        }
        window.__MASSFRONT_PATCHED=b.version||'?';
        if(prob){
          var tx=db.transaction(STORE,'readwrite');
          tx.objectStore(STORE).put({version:prob.version,at:prob.at,tries:(prob.tries|0)+1},'probation');
        }
        runBundle(b);
      });
      });
    });
  }).catch(runPackaged);

  /* Called by the game once it is genuinely running. Clearing probation is what
     marks a patch as good. Only now may the retryable download be deleted. */
  window.__bootOk=function(){
    releaseBootShield();
    idb().then(function(db){
      return del(db,'probation')
        /* A packaged fallback also reaches a frame. It must not erase the
           failure that explains why the patch did not start; only a confirmed
           patched frame has earned the right to clear recovery state. */
        .then(function(){ return window.__MASSFRONT_PATCHED&&!window.__MASSFRONT_RECOVERED_PATCH?del(db,'applyFailure'):null; })
        .then(function(){ return window.__MASSFRONT_PATCHED&&!window.__MASSFRONT_RECOVERED_PATCH?del(db,'pending'):null; });
    }).catch(function(){});
  };
})();
