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
    './assets/data/theatreprofiles-stage10.js',
    './assets/data/interiortopology-stage10.js','./assets/data/orbitaltopology-stage10.js',
    './src/game/determinism.js',
    './assets/data/unitrows.js','./assets/data/unitsheet.js','./assets/data/itemart.js','./assets/data/planetart.js','./src/engine/gl.js','./src/engine/planetpreview.js','./src/engine/perf.js','./src/engine/noisegen.js','./src/engine/factionenergy.js','./src/engine/ordnancetrails.js','./src/engine/terragen.js','./src/terralab.js','./src/engine/mesh.js','./src/engine/billboard.js','./src/engine/macrofx.js','./src/engine/shieldfx.js','./src/engine/tacticons.js','./src/engine/gpufx.js','./src/engine/volfx.js','./src/engine/shockwave.js','./src/engine/vfxlayers.js','./src/engine/organicfx.js','./assets/basis/basis_transcoder.js','./src/engine/materials.js','./src/engine/materials-v2.js','./src/engine/terrain.js','./src/engine/models-world-data.js','./src/engine/models-world-loader.js','./src/engine/models.js','./assets/data/worldkit.js','./assets/data/locationgrammar.js','./assets/data/sitetemplates.js','./assets/data/sitetemplates-stage9.js','./assets/data/locationplans.js','./assets/data/battlefieldtopology-stage10.js','./src/engine/worldsites.js','./assets/data/meshes.js','./src/engine/models-legion.js','./src/engine/models-machine.js','./src/engine/models-infestation.js','./src/engine/models-civic.js','./src/engine/models-skyline.js','./src/engine/materials-world-v2.js','./src/engine/models-units-nova.js','./src/engine/models-units-legion.js','./src/engine/models-units-syndicate.js','./src/engine/models-units-brood.js','./src/engine/modkit.js','./src/engine/physics.js','./src/engine/cloudfx.js','./src/engine/cloudpostfx.js','./src/game/utilityjobs.js','./src/game/sim.js','./src/game/airwarfare.js','./src/game/economy.js','./src/game/commander.js','./src/game/meta.js','./src/game/ai.js','./src/ui/input.js','./src/ui/facticons.js','./src/ui/hud.js','./src/ui/render3d.js','./src/ui/orderfx.js','./src/airlift.js','./src/airlift-factions.js','./src/rumble.js','./src/factions.js','./src/factext.js','./src/offline.js','./src/audio.js','./src/assetpack.js','./src/hazards.js','./src/game/statehash.js','./src/authportal.js','./src/tutorial.js','./src/adboards.js','./src/storeui.js','./src/restree3d.js','./src/develop.js','./src/factiondoctrine.js','./src/endgame.js','./src/story.js','./src/socialui.js','./src/game/matchconsumer.js','./src/daily.js','./src/account.js','./src/economy-net.js','./src/updater.js','./src/intro.js','./src/session.js','./src/faction-id.js','./src/glrecover.js','./src/main.js','./src/intel.js','./src/repairbay.js','./src/galaxyui.js','./src/departure.js','./src/warprimer.js','./src/uistack.js','./src/ui/hudflow.js','./src/ui/hotslots.js','./src/galactic-operations.js','./src/onboarding.js','./src/career-faction-gate.js'
  ];
  /* Packaged scripts need a release key. WebViews and development browsers can
     otherwise reuse a stale source even after the installer or local preview
     has changed, which made new settings appear to be missing until cache was
     cleared manually. Patch bundles keep their content-addressed Blob URLs. */
  var PACKAGED_REV='1.33.51';
  /* Source-cache revision is deliberately independent from the user-facing
     release number. Local/hotfix rebuilds of the same release must not reuse
     an older gl.js merely because its ?v= version string is unchanged. */
  var PACKAGED_SRC_REV=PACKAGED_REV+'-boot6';
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
  function patchChannel(rec){ return String(rec&&rec.channel||'stable'); }
  function bundleMeta(rec){
    if(!rec) return null;
    return {version:rec.version,channel:rec.channel||'stable',at:rec.at,
      notes:rec.notes||'',severity:rec.severity||'recommended',
      kind:rec.kind||'full',patchedFrom:rec.patchedFrom||''};
  }
  function sameBundle(a,b){
    if(!a||!b||String(a.version)!==String(b.version)||
       patchChannel(a)!==patchChannel(b)) return false;
    if(a.at!=null||b.at!=null) return String(a.at||'')===String(b.at||'');
    return true;
  }
  function sameBundleExact(a,b){
    /* Mirrors updater's persisted identity contract: a legacy pair whose two
       timestamps are both absent still matches, while one absent/one present
       or any differing value does not. */
    return !!(a&&b&&sameBundle(a,b));
  }
  function previousSlot(key){
    key=String(key||'');
    return key==='previousA'||key==='previousB'?key:null;
  }
  function previousSelection(records){
    var ref=records.previousRef,key=previousSlot(ref&&ref.key);
    var meta=key&&records[key+'Meta'];
    return key&&sameBundleExact(ref,meta)
      ?{key:key,meta:meta,ref:ref,slotted:true}
      :{key:'previous',meta:records.previousMeta,ref:null,slotted:false};
  }
  function clearPreviousRecords(store){
    store.delete('previousRef');
    store.delete('previousA'); store.delete('previousAMeta');
    store.delete('previousB'); store.delete('previousBMeta');
    store.delete('previous'); store.delete('previousMeta');
  }
  function liveApplyOperation(op){
    var age=op&&typeof op.at==='number'?Date.now()-op.at:-1;
    return !!(op&&op.kind==='apply'&&op.token&&age>=0&&age<5*60*1000);
  }
  function probationMatchesBundle(prob,bundle){
    if(!prob||!bundle||String(prob.version)!==String(bundle.version)||
       patchChannel(prob)!==patchChannel(bundle)) return false;
    return prob.pendingAt==null||String(prob.pendingAt)===String(bundle.at||'');
  }
  function probationOwnsMetaExact(prob,meta){
    return !!(prob&&meta&&prob.pendingAt!=null&&meta.at!=null&&
      String(prob.version)===String(meta.version)&&
      patchChannel(prob)===patchChannel(meta)&&
      String(prob.pendingAt)===String(meta.at));
  }
  function pendingMatchesFailure(pending,prob,bundle,version){
    if(!pending||String(pending.version)!==String(version)) return false;
    var owner=prob||bundle;
    if(owner&&patchChannel(pending)!==patchChannel(owner)) return false;
    var token=prob&&prob.pendingAt!=null?prob.pendingAt:
      (bundle&&bundle.at!=null?bundle.at:null);
    /* Old records without an attempt token cannot be distinguished from a
       freshly downloaded rebuild carrying the same version. Retaining one
       ambiguous payload is safer than deleting new verified bytes. */
    return token!=null&&String(pending.at||'')===String(token);
  }
  /* Confirm exactly the patch represented by probation in one transaction.
     The old three independent deletes left a cross-window gap: a newly staged
     pending payload could land after probation was cleared and then be erased
     by the final unconditional delete. Serialized conditional cleanup means a
     concurrent stage either sees probation and stops, or commits after this
     transaction and survives for its own install. */
  function confirmPatch(db,identity){
    return new Promise(function(res){
      try{
        var tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
        var probation=store.get('probation'),pending=store.get('pendingMeta');
        var failure=store.get('applyFailure'),active=store.get('activeMeta');
        var operation=store.get('operation'),ready=0;
        function inspect(){
          if(++ready<5) return;
          var prob=probation.result,pend=pending.result,fail=failure.result;
          var running=active.result,op=operation.result;
          if(!sameBundle(running,identity)||!probationMatchesBundle(prob,running)) return;
          store.delete('probation');
          if(fail&&String(fail.version)===String(running.version)) store.delete('applyFailure');
          if(pendingMatchesFailure(pend,prob,running,running.version)){
            store.delete('pending'); store.delete('pendingMeta');
          }
          /* A killed Apply document can leave its lease after the atomic
             active/probation commit. Only the first proven frame of that exact
             target owns the orphan; an unrelated or still-uncommitted Apply
             remains visible to updater recovery. */
          if(op&&op.kind==='apply'&&sameBundle(op.target,running))
            store.delete('operation');
        }
        probation.onsuccess=inspect; pending.onsuccess=inspect;
        failure.onsuccess=inspect; active.onsuccess=inspect;
        operation.onsuccess=inspect;
        tx.oncomplete=function(){ res(); };
        tx.onerror=function(){ res(); }; tx.onabort=function(){ res(); };
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
  function validBundle(b){
    if(!b||!b.files||!verNewer(b.version,PACKAGED_REV)) return false;
    var order=b.order&&b.order.length?b.order:MANIFEST;
    for(var i=0;i<order.length;i++) if(typeof b.files[order[i]]!=='string') return false;
    return true;
  }
  function evictSuperseded(db){
    var keys=['activeMeta','pendingMeta','probation','previousRef',
              'previousAMeta','previousBMeta','previousMeta','operation'];
    return new Promise(function(res,rej){
      try{
        var tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
        var requests=[],records={},ready=0,evicted=[];
        function discard(metaKey,payload,label,rec){
          store.delete(payload);
          if(metaKey!==payload) store.delete(metaKey);
          evicted.push({key:label,version:rec.version||'?'});
        }
        function inspect(){
          if(++ready<keys.length) return;
          for(var i=0;i<keys.length;i++) records[keys[i]]=requests[i].result;
          var simple=[
            {meta:'activeMeta',payload:'active',label:'active'},
            {meta:'pendingMeta',payload:'pending',label:'pending'},
            {meta:'probation',payload:'probation',label:'probation'},
            {meta:'previousMeta',payload:'previous',label:'previous'}
          ];
          for(var j=0;j<simple.length;j++){
            var entry=simple[j],rec=records[entry.meta];
            if(rec&&!verNewer(rec.version,PACKAGED_REV))
              discard(entry.meta,entry.payload,entry.label,rec);
          }

          var ref=records.previousRef,refKey=previousSlot(ref&&ref.key);
          var refMeta=refKey&&records[refKey+'Meta'];
          var refValid=refKey&&sameBundleExact(ref,refMeta);
          if(ref&&!refValid) store.delete('previousRef');

          /* Apply prepares the opposite slot before atomically swinging the
             pointer. A concurrent boot may discard an obsolete referenced
             rollback, but must not erase that exact inactive copy from under
             the still-live Apply transaction. Superseded spare slots without
             that current owner are safe to retire. */
          var inactive=refKey==='previousA'?'previousB':'previousA';
          var inactiveMeta=records[inactive+'Meta'];
          var protectedSlot=liveApplyOperation(records.operation)&&
            sameBundleExact(inactiveMeta,records.activeMeta)?inactive:null;
          var referencedSlot=refValid?refKey:null;
          var slots=['previousA','previousB'];
          for(var k=0;k<slots.length;k++){
            var slot=slots[k],slotMeta=records[slot+'Meta'];
            if(slot===protectedSlot) continue;
            /* The pointer is the sole durable owner. Any other slot is either
               a completed preparation whose pointer swing never committed or
               debris from an older owner, so reclaim it even when its version
               is newer than the packaged shell. Slot writers are protected
               above only while their exact Apply lease remains live. */
            if(slot!==referencedSlot){
              store.delete(slot); store.delete(slot+'Meta');
              if(slotMeta) evicted.push({key:slot,version:slotMeta.version||'?',orphan:true});
              continue;
            }
            if(slotMeta&&!verNewer(slotMeta.version,PACKAGED_REV)){
              discard(slot+'Meta',slot,slot,slotMeta);
              store.delete('previousRef');
            }
          }
        }
        for(var i=0;i<keys.length;i++){
          requests[i]=store.get(keys[i]);
          requests[i].onsuccess=inspect;
        }
        tx.oncomplete=function(){
          for(var j=0;j<evicted.length;j++){
            var item=evicted[j];
            console.info(item.orphan
              ?'boot: discarding unreferenced '+item.key+' rollback patch '+item.version
              :'boot: discarding '+item.key+' patch '+item.version+
               '; packaged build is '+PACKAGED_REV);
          }
          res();
        };
        tx.onerror=function(){ rej(tx.error||new Error('boot supersession failed')); };
        tx.onabort=function(){ rej(tx.error||new Error('boot supersession aborted')); };
      }catch(e){ rej(e); }
    });
  }

  /* Select, claim, reject and recover in one readwrite transaction. IndexedDB
     serializes this scope against updater Apply/Rollback transactions, so the
     decision can never combine probation from one payload with active bytes
     from another. The caller starts scripts only after tx.oncomplete. */
  function prepareBoot(db){
    var keys=['probation','activeMeta','pendingMeta','previousRef',
              'previousAMeta','previousBMeta','previousMeta',
              'applyFailure','operation'];
    return new Promise(function(res,rej){
      try{
        var tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
        var requests=[],records={},ready=0,decision={kind:'packaged'};
        function clearFinishedRollback(nextActive){
          var op=records.operation;
          /* Rollback's target is the active identity it set out to remove. If
             durable active has moved (including to packaged), its commit won
             and only the releasing document was lost. A rollback which has not
             committed still sees its target and keeps exclusive ownership. */
          if(op&&op.kind==='rollback'&&op.target&&!sameBundle(op.target,nextActive))
            store.delete('operation');
        }
        function fail(version,reason,prob,bundle){
          version=version||'?';
          var prior=records.applyFailure;
          var count=prior&&String(prior.version)===String(version)?(prior.count|0)+1:1;
          var failure={version:version,at:Date.now(),reason:reason,count:count,
                       quarantined:count>=2};
          store.put(failure,'applyFailure');
          store.delete('probation');
          /* Recovered builds deliberately skip __bootOk confirmation. Retire
             the Apply lease here only when probation, failed active identity,
             and lease target all name the same exact committed payload. */
          var op=records.operation;
          if(op&&op.kind==='apply'&&probationOwnsMetaExact(prob,bundle)&&
             sameBundleExact(op.target,bundle)) store.delete('operation');
          if(failure.quarantined&&
             pendingMatchesFailure(records.pendingMeta,prob,bundle,version)){
            store.delete('pending'); store.delete('pendingMeta');
          }
          /* Rollback payloads are about 85 MB. Resolve the small atomic pointer
             first and queue exactly one payload read only after failure is
             certain. A torn/mismatched slot pointer falls back to the legacy
             key without ever deserialising the unowned slot. */
          var selected=previousSelection(records);
          var previous=store.get(selected.key);
          previous.onsuccess=function(){
            var value=previous.result,meta=selected.meta;
            var good=validBundle(value)&&String(value.version)!==String(version)&&
              (selected.slotted
                ?sameBundleExact(meta,value)&&sameBundleExact(selected.ref,value)
                :(!meta||sameBundle(meta,value)));
            if(good){
              store.put(value,'active'); store.put(bundleMeta(value),'activeMeta');
              clearPreviousRecords(store);
              clearFinishedRollback(value);
              decision={kind:'recovered',bundle:value,failedVersion:version,
                        failure:failure};
            }else{
              store.delete('active'); store.delete('activeMeta');
              clearPreviousRecords(store);
              clearFinishedRollback(null);
              decision={kind:'packaged',failedVersion:version,failure:failure};
            }
          };
        }
        function inspectActive(bundle){
          var prob=records.probation,meta=records.activeMeta;
          /* Metadata-backed supersession was already handled without touching
             payloads. This is the one compatibility read required for a
             pre-metadata active record. */
          if(bundle&&!verNewer(bundle.version,PACKAGED_REV)){
            store.delete('active'); store.delete('activeMeta');
            if(prob&&probationMatchesBundle(prob,bundle)) store.delete('probation');
            clearFinishedRollback(null);
            decision={kind:'packaged'};
            return;
          }
          if(bundle&&!validBundle(bundle)){
            fail(bundle.version,'The downloaded update was incomplete at restart.',prob,bundle);
            return;
          }
          if(bundle&&meta&&!sameBundle(meta,bundle)){
            fail(bundle.version,'The installed update metadata did not match its payload.',prob,bundle);
            return;
          }
          if(!bundle&&meta){
            fail(meta.version,'The downloaded update was not available at restart.',prob,meta);
            return;
          }
          if(prob&&!bundle){
            fail(prob.version,'The downloaded update was not available at restart.',prob,null);
            return;
          }
          if(bundle&&!meta){
            /* One-time migration for installs written before lightweight
               metadata existed. Confirmation can now stay off the payload. */
            store.put(bundleMeta(bundle),'activeMeta');
          }
          if(bundle&&prob&&probationMatchesBundle(prob,bundle)){
            if((prob.tries|0)>=1){
              fail(prob.version,'The downloaded update did not finish starting.',prob,bundle);
              return;
            }
            var claimed={version:bundle.version,channel:bundle.channel||prob.channel,
              pendingAt:bundle.at!=null?bundle.at:prob.pendingAt,
              at:prob.at||Date.now(),tries:(prob.tries|0)+1};
            store.put(claimed,'probation');
            clearFinishedRollback(bundle);
            decision={kind:'run',bundle:bundle,claimed:true};
            return;
          }
          if(bundle&&prob){
            /* A mismatched legacy/torn guard must never be used to validate a
               different active record. Replace it with an exact first claim. */
            store.put({version:bundle.version,channel:bundle.channel||'stable',
              pendingAt:bundle.at,at:Date.now(),tries:1},'probation');
            clearFinishedRollback(bundle);
            decision={kind:'run',bundle:bundle,claimed:true,repaired:true};
            return;
          }
          if(bundle){
            clearFinishedRollback(bundle);
            decision={kind:'run',bundle:bundle,claimed:false};
          }else clearFinishedRollback(null);
        }
        function inspect(){
          if(++ready<keys.length) return;
          for(var i=0;i<keys.length;i++) records[keys[i]]=requests[i].result;
          var prob=records.probation,meta=records.activeMeta;
          /* Once a current probation attempt and active metadata name the same
             exact bytes, tries>=1 already proves those bytes started and never
             confirmed. Reject them without deserialising the failed 85 MiB
             active payload; recovery needs only the one previous payload. */
          if(prob&&(prob.tries|0)>=1&&probationOwnsMetaExact(prob,meta)){
            fail(prob.version,'The downloaded update did not finish starting.',prob,meta);
            return;
          }
          var active=store.get('active');
          active.onsuccess=function(){ records.active=active.result; inspectActive(active.result); };
        }
        for(var i=0;i<keys.length;i++){
          requests[i]=store.get(keys[i]);
          requests[i].onsuccess=inspect;
        }
        tx.oncomplete=function(){ res(decision); };
        tx.onerror=function(){ rej(tx.error||new Error('boot selection failed')); };
        tx.onabort=function(){ rej(tx.error||new Error('boot selection aborted')); };
      }catch(e){ rej(e); }
    });
  }

  function bootProgress(done,total){
    var el=document.getElementById('mfBootPct');
    if(el) el.textContent=total?('LOADING  '+done+' / '+total):'LOADING';
  }
  function rendererGateIndex(order){
    for(var i=0;i<order.length;i++)
      if(String(order[i]||'').replace(/^\.\//,'')==='src/engine/gl.js') return i;
    /* A malformed legacy payload still gets a bounded first phase instead of
       appending nothing. Completeness validation will reject it separately. */
    return Math.min(3,Math.max(0,order.length-1));
  }
  function injectScripts(makeSrc,total,gate){
    /* WebGL is the one hard boot dependency. Load through gl.js as a small
       first phase, then append the remaining tags in parallel. If the browser
       cannot allocate WebGL2, gl.js raises __MF_GL_BOOT_FAILED and owns a
       usable retry panel; stopping here prevents 79 misleading missing-global
       errors from obscuring the real graphics-session failure. The happy path
       still requests the large remainder together and preserves classic-script
       execution order through async=false. */
    var left=total;
    gate=Math.max(0,Math.min(total-1,gate|0));
    var gateFailed=false, restStarted=false;
    function tick(i,src){
      left--;
      bootProgress(total-left,total);
      if(src) console.error('boot: failed',src);
      if(i===gate){
        gateFailed=!!src||window.__MF_GL_BOOT_FAILED===true;
        if(gateFailed){
          console.warn('boot: renderer phase stopped after WebGL2 initialization failed');
          clearBootShield();
          /* OTA payloads add their own temporary input guard. Leave the real
             WebGL retry control clickable immediately instead of waiting for
             that guard's watchdog after the renderer has already failed. */
          try{if(typeof window.__MASSFRONT_CLEAR_INPUT_GUARD==='function')
            window.__MASSFRONT_CLEAR_INPUT_GUARD();}catch(e){}
        }else if(!restStarted){
          restStarted=true;
          appendRange(gate+1,total);
        }
      }
    }
    function appendOne(i){
      var s=document.createElement('script');
      s.async=false;
      makeSrc(s,i);
      s.onload=(function(n){ return function(){ tick(n); }; })(i);
      s.onerror=(function(n,src){ return function(){ tick(n,src); }; })(i,s.src||s.getAttribute('data-src')||'?');
      document.body.appendChild(s);
    }
    function appendRange(a,b){ for(var i=a;i<b;i++) appendOne(i); }
    bootProgress(0,total);
    appendRange(0,Math.min(total,gate+1));
  }
  function runPackaged(){
    injectScripts(function(s,i){ s.src=MANIFEST[i]+'?v='+PACKAGED_SRC_REV; },
                  MANIFEST.length,rendererGateIndex(MANIFEST));
  }
  function runBundle(b){
    /* Blob URLs rather than inline text: the browser keeps a real filename for
       each source, so a stack trace from a patched build is still readable. */
    var order=b.order&&b.order.length? b.order : MANIFEST;
    injectScripts(function(s,i){
      var path=order[i], src=b.files[path];
      if(src==null) s.src=path;
      else s.src=URL.createObjectURL(new Blob([src+'\n//# sourceURL='+path],{type:'text/javascript'}));
    }, order.length,rendererGateIndex(order));
  }

  idb().then(function(db){
    /* Native app upgrades preserve WebView IndexedDB. Never let an old OTA
       remain above a newer packaged APK merely because it was active before
       the installer ran. Pending and probation records follow the same rule. */
    return evictSuperseded(db).then(function(){
      return prepareBoot(db);
    }).then(function(decision){
      if(decision.failure&&decision.failure.quarantined)
        console.warn('boot: patch '+decision.failedVersion+' failed twice and was quarantined');
      if(decision.kind==='recovered'){
        window.__MASSFRONT_PATCHED=decision.bundle.version||'?';
        window.__MASSFRONT_PATCH_AT=decision.bundle.at;
        window.__MASSFRONT_PATCH_CHANNEL=decision.bundle.channel||'stable';
        window.__MASSFRONT_RECOVERED_PATCH=decision.failedVersion||'?';
        console.warn('boot: restored validated patch '+decision.bundle.version+
                     ' after '+decision.failedVersion+' failed');
        runBundle(decision.bundle);
        return;
      }
      if(decision.kind==='run'){
        window.__MASSFRONT_PATCHED=decision.bundle.version||'?';
        window.__MASSFRONT_PATCH_AT=decision.bundle.at;
        window.__MASSFRONT_PATCH_CHANNEL=decision.bundle.channel||'stable';
        runBundle(decision.bundle);
        return;
      }
      if(decision.failedVersion)
        console.warn('boot: patch '+decision.failedVersion+' rejected, using packaged build');
      runPackaged();
    });
  }).catch(runPackaged);

  /* Called by the game once it is genuinely running. Clearing probation is what
     marks a patch as good. Only now may the retryable download be deleted. */
  window.__bootOk=function(){
    releaseBootShield();
    /* A packaged fallback can reach a frame after IndexedDB or the loader
       failed before it selected `active`. It has NOT proved the stored patch
       good, so it must not erase that patch's probation record. Leaving it in
       place means the next healthy launch retries under the normal rollback
       guard instead of running an unguarded payload. A recovered previous
       patch is similarly only a fallback for a different failed version. */
    if(!window.__MASSFRONT_PATCHED||window.__MASSFRONT_RECOVERED_PATCH) return;
    idb().then(function(db){
      return confirmPatch(db,{version:window.__MASSFRONT_PATCHED,
        channel:window.__MASSFRONT_PATCH_CHANNEL||'stable',
        at:window.__MASSFRONT_PATCH_AT});
    }).catch(function(){});
  };
})();

/* PWA delivery is independent from OTA bundle selection. The worker is
   network-first and explicitly bypasses updater manifests/configuration, so it
   cannot pin an old release channel or interfere with IndexedDB probation. */
(function(){
  /* boot.js is also executed by the updater's deterministic VM harness. Keep
     PWA delivery inert in non-browser runtimes instead of making OTA tests
     provide a fake navigator solely for this optional integration. */
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator)) return;
  var secure=location.protocol==='https:'||location.hostname==='127.0.0.1'||location.hostname==='localhost';
  if(!secure) return;
  window.__mfPwaDiag={supported:true,registered:false,controlled:!!navigator.serviceWorker.controller,error:null};
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('./sw.js?v=1.33.51-shell1',{scope:'./',updateViaCache:'none'})
      .then(function(reg){
        window.__mfPwaDiag.registered=true;
        window.__mfPwaDiag.scope=reg.scope;
        window.__mfPwaDiag.controlled=!!navigator.serviceWorker.controller;
        try{reg.update();}catch(e){}
        if(navigator.storage&&typeof navigator.storage.persist==='function')
          navigator.storage.persist().then(function(ok){window.__mfPwaDiag.storagePersisted=!!ok;}).catch(function(){});
      }).catch(function(err){window.__mfPwaDiag.error=String(err&&err.message||err);});
  },{once:true});
  window.addEventListener('beforeinstallprompt',function(event){
    event.preventDefault();
    window.__mfPwaInstallEvent=event;
    window.dispatchEvent(new CustomEvent('massfront-pwa-install-ready'));
  });
  window.mfRequestPwaInstall=function(){
    var event=window.__mfPwaInstallEvent;
    if(!event) return Promise.resolve({available:false});
    window.__mfPwaInstallEvent=null;
    return event.prompt().then(function(){return event.userChoice;});
  };
})();
