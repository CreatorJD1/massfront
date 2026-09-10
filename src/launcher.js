;
/* ============================================================================
   MASSFRONT VISUAL LAUNCHER
   ----------------------------------------------------------------------------
   This controller sequences identity -> updater -> ready around the existing
   #updScr surface. Auth and updater remain the authorities; this file consumes
   their explicit snapshots/events and never scrapes English labels from the UI.
   ============================================================================ */
(function(){
  'use strict';

  var MF_LAUNCHER_CATALOG=[
    {version:'1.33.60',channel:'stable',kind:'full',category:'overhaul',
      title:'COMMAND EXPERIENCE OVERHAUL',
      summary:'A visual game gateway, clearer mobile command controls, persistent Social identity and measured performance diagnostics.',
      features:['The visual launcher now presents update readiness, evidence-backed release history, optional downloads and offline or connected entry before the main menu.',
        'Social restores the account username automatically and adds visual player cards, online count, World Chat actions and supported lobby controls.',
        'A top-left commander profile locates the local commander; Buildings has its own filtered command tab.',
        'Graphics includes an opt-in live bottleneck dashboard with real CPU, GPU, frame, scene and memory measurements.',
        'A dedicated battle event feed collects routine notices, comms and loot with timestamps, filters and true unread state.'],
      fixes:['Connected-play state hashing no longer creates the prior once-per-second allocation hitch.',
        'Building filters, Back navigation and multiplayer-seat commander identity now follow the actual local player.',
        'E-mail verification is permanently removed as a Social or multiplayer access blocker while age, username, moderation and ban controls remain.',
        'Offline update actions, expired-session recovery and optional-content repair keep their verified launcher behavior.'],
      upcoming:['Streamline unnecessary War Table steps while preserving Classic, Campaign, Training and Co-op authority.',
        'Replace text-heavy mobile HUD and submenu surfaces with original MASSFRONT imagery, icons, motion and progressive disclosure.',
        'Resume the audited Galactic Command and tutorial plan in later stage-batched releases.']},
    {version:'1.33.58',channel:'stable',kind:'patch',category:'system',
      title:'LARGE UPDATE RELIABILITY',
      summary:'Resumable game updates, safer recovery and sectioned optional-content delivery.',
      features:['Large source updates resume verified 4 MiB ranges after interruption.',
        'Optional content packs can install, verify, repair and remove independently.',
        'New packaged clients can boot content-addressed source records without one giant in-memory bundle.'],
      fixes:['Retrying the exact staged update returns to Apply instead of downloading it again.',
        'Storage is checked before transfer and rollback data is protected from cleanup.',
        'Update category is independent from download size, so a large hotfix stays a HOTFIX.'],
      upcoming:['Visual launch control before the main menu.',
        'Evidence-backed release cards and separate device history.']},
    {version:'1.33.57',channel:'stable',kind:'patch',category:'hotfix',
      title:'OTA RECOVERY HOTFIX',
      summary:'Restored safe Download, Stage, Apply and restart from the verified v1.33.56 recovery installer.',
      features:['Installed through the in-game updater without requiring another APK.'],
      fixes:['Removed the accepted-client already-staged failure loop.',
        'Preserved rollback after the patched runtime passed probation.'],
      upcoming:['Large-update resume and clearer update categories.']}
  ];
  var L={inited:false,gate:true,passed:false,bypass:false,phase:'updater',entering:false,identity:null,update:null,
    notesTab:'features',historyTab:'published',release:null,releaseKey:'',primary:'wait',
    packBusy:false,packTicket:0,packTimer:0,packAudioReady:false,packAudioIds:[],
    galacticBusy:false,galacticTicket:0,galacticReady:false,galacticCached:false};

  function byId(id){return document.getElementById(id);}
  function text(id,value){var el=byId(id);if(el)el.textContent=value==null?'':String(value);return el;}
  function safeArray(value){return Array.isArray(value)?value.filter(function(v){return typeof v==='string'&&v.trim();}).slice(0,8):[];}
  /* fmtBytes renders 0 as an em-dash, which is right for "unknown" and wrong
     for "an active transfer that has not completed its first chunk yet".
     Progress is reported per completed chunk, and a full payload opens with a
     24 MB file, so a healthy download genuinely reads 0 bytes for the first
     10-15 seconds. Rendering that as "- / 91 MB" with speed "-" made a
     working transfer look identical to a dead one, and players cancelled it.
     During a transfer, show a real zero so the number is visibly a counter. */
  function fmtBytesLive(n){ n=Math.max(0,Number(n)||0); return n?fmtBytes(n):'0 B'; }
  function fmtBytes(n){
    n=Math.max(0,Number(n)||0);if(!n)return '—';
    if(n<1024)return Math.round(n)+' B';if(n<1048576)return (n/1024).toFixed(n<10240?1:0)+' KB';
    if(n<1073741824)return (n/1048576).toFixed(n<10485760?1:0)+' MB';
    return (n/1073741824).toFixed(1)+' GB';
  }
  function onlineAllowed(){
    try{
      if(typeof navigator!=='undefined'&&navigator.onLine===false)return false;
      if(typeof netAllowed==='function'&&!netAllowed())return false;
    }catch(e){}
    return true;
  }
  function isGalacticReturn(){
    try{
      if(/^\?(?:(?:galacticRoute|groundOperation)=[A-Za-z0-9_-]{16,128}|galacticFallback=classic)$/.test(String(location.search||'')))return true;
      /* galactic-operations consumes the visible fallback query as soon as it owns
         the route. The launcher initializes later in boot, so the one-session
         latch must carry the same bypass or it immediately auto-enters the
         failed module again and destroys the recovered War Room. */
      return typeof sessionStorage!=='undefined'
        &&sessionStorage.getItem('massfront.galactic.classic-fallback.v1')==='1';
    }
    catch(e){return false;}
  }
  function identitySnapshot(){
    try{if(typeof mfIdentitySnapshot==='function')return mfIdentitySnapshot();}catch(e){}
    return {state:'pending',signedIn:false,verified:false,source:'launcher-wait',revision:0};
  }
  function updaterSnapshot(){
    try{if(typeof mfUpdaterSnapshot==='function')return mfUpdaterSnapshot();}catch(e){}
    return {state:'idle',status:'Preparing game',installedVersion:typeof APP_VERSION!=='undefined'?APP_VERSION:'',
      serverVersion:'',channel:'stable',category:'',title:'',summary:'',features:[],fixes:[],upcoming:[],
      progress:{bytes:0,total:0,ratio:0,percent:0,speedBps:0},readiness:{online:onlineAllowed(),busy:false,current:false},
      action:{id:'wait',label:'PLEASE WAIT',enabled:false},history:{published:[],device:[]}};
  }
  function compareVersion(a,b){
    var aa=String(a||'').split('.').map(Number),bb=String(b||'').split('.').map(Number);
    for(var i=0;i<Math.max(aa.length,bb.length);i++){var d=(bb[i]||0)-(aa[i]||0);if(d)return d;}
    return 0;
  }
  function copyRelease(input){
    input=input&&typeof input==='object'?input:{};
    return {version:String(input.version||''),channel:String(input.channel||'stable'),kind:String(input.kind||''),
      category:String(input.category||''),title:String(input.title||''),summary:String(input.summary||input.legacyNotes||''),
      features:safeArray(input.features),fixes:safeArray(input.fixes),upcoming:safeArray(input.upcoming),
      publishedAt:String(input.publishedAt||''),at:Number(input.at)||0,packaged:input.packaged===true,
      installed:input.installed===true,rolledBack:input.rolledBack===true};
  }
  function currentRelease(){
    var s=L.update||updaterSnapshot();
    /* `stale` means this installed build is newer than Stable. Describing the
       older server release as the running build reverses the update direction
       in the one state where the distinction matters most. */
    var localAhead=s.state==='stale',releaseVersion=localAhead?s.installedVersion:(s.serverVersion||s.installedVersion);
    var deviceRows=s.history&&Array.isArray(s.history.device)?s.history.device:[];
    var localRecord=localAhead&&deviceRows.find(function(row){return String(row&&row.version||'')===String(releaseVersion||'');});
    /* A stale server manifest describes the older Stable release. Never copy
       its title or bullets under the newer installed version: use this
       device's matching record, an exact local catalog entry below, or neutral
       local-ahead copy when neither exists. */
    var source=localAhead?(localRecord||{version:releaseVersion,channel:s.channel,kind:'local',category:'local',
      title:'LOCAL BUILD AHEAD',summary:'This installed build is newer than the current Stable channel.',
      features:[],fixes:[],upcoming:[]}):
      {version:releaseVersion,channel:s.channel,kind:s.kind,category:s.category,title:s.title,summary:s.summary,
        features:s.features,fixes:s.fixes,upcoming:s.upcoming};
    var r=copyRelease(source);
    if(!r.version&&typeof APP_VERSION!=='undefined')r.version=String(APP_VERSION||'');
    var exact=MF_LAUNCHER_CATALOG.find(function(e){return e.version===r.version;});
    /* Catalog copy may fill only the release it actually documents. Falling
       back to the newest record for an unknown future build would put old
       fixes under a new version number and turn a harmless metadata gap into
       false release notes. */
    if(exact){
      if(!r.category)r.category=exact.category;
      if(!r.title||/^(system|hotfix|content|overhaul)\s*[·-]/i.test(r.title))r.title=exact.title;
      /* These two accepted releases have locally audited copy. Prefer it over
         legacy one-line `notes` values such as "adds ...", which read like a
         developer comment rather than a player-facing release briefing. */
      r.summary=exact.summary;
      if(!r.features.length)r.features=exact.features.slice();if(!r.fixes.length)r.fixes=exact.fixes.slice();
      if(!r.upcoming.length)r.upcoming=exact.upcoming.slice();
    }else{
      if(!r.category)r.category='update';if(!r.title)r.title='MASSFRONT UPDATE';
      if(!r.summary)r.summary='Verified release information is not attached to this build.';
    }
    return r;
  }
  function seedPublishedHistory(){
    if(typeof mfUpdaterIngestRelease!=='function')return;
    for(var i=MF_LAUNCHER_CATALOG.length-1;i>=0;i--){try{mfUpdaterIngestRelease(MF_LAUNCHER_CATALOG[i]);}catch(e){}}
  }
  function allHistory(){
    var raw={published:[],device:[]};
    try{if(typeof mfUpdaterHistory==='function')raw=mfUpdaterHistory()||raw;}
    catch(e){if(L.update&&L.update.history)raw=L.update.history;}
    var published=[],seen={};
    (Array.isArray(raw.published)?raw.published:[]).concat(MF_LAUNCHER_CATALOG).forEach(function(value){
      var row=copyRelease(value),known=MF_LAUNCHER_CATALOG.find(function(e){return e.version===row.version;});
      var key=row.version+'|'+row.channel;if(!row.version||seen[key])return;seen[key]=true;
      if(known){
        if(!row.category)row.category=known.category;
        if(!row.summary||/^features\s*-/i.test(row.summary)||row.summary.length>220)row.summary=known.summary;
      }
      published.push(row);
    });
    published.sort(function(a,b){return compareVersion(a.version,b.version);});
    return {published:published.slice(0,24),device:(Array.isArray(raw.device)?raw.device:[]).map(copyRelease).slice(0,24)};
  }
  function setTab(group,name){
    document.querySelectorAll('[data-launch-'+group+']').forEach(function(btn){
      var on=btn.getAttribute('data-launch-'+group)===name;btn.classList.toggle('on',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
  }
  function renderNotes(){
    var list=byId('mfLaunchNoteList'),release=L.release||currentRelease();if(!list)return;
    var values=safeArray(release[L.notesTab]);
    if(!values.length)values=[L.notesTab==='upcoming'?'No upcoming items are attached to this release.':'No additional items were published in this section.'];
    list.classList.toggle('upcoming',L.notesTab==='upcoming');list.textContent='';
    values.forEach(function(value){var li=document.createElement('li');li.textContent=value;list.appendChild(li);});
    setTab('notes',L.notesTab);
  }
  function renderHistory(){
    var list=byId('mfLaunchHistoryList');if(!list)return;var history=allHistory(),rows=history[L.historyTab]||[];
    list.textContent='';
    if(!rows.length){
      var empty=document.createElement('li');empty.className='gap';
      var eb=document.createElement('b');eb.textContent=L.historyTab==='device'?'NO UPDATE EVENTS ON THIS INSTALL':'CATALOG UNAVAILABLE';
      var es=document.createElement('span');es.textContent=L.historyTab==='device'?'Installed and rolled-back versions will appear here.':'Reconnect to refresh verified release records.';
      empty.appendChild(eb);empty.appendChild(es);list.appendChild(empty);
    }else rows.forEach(function(row){
      var li=document.createElement('li'),b=document.createElement('b'),em=document.createElement('em'),desc=document.createElement('span');
      b.textContent='v'+row.version;em.textContent=String(row.category||'update').toUpperCase();b.appendChild(em);
      var flags=[];if(row.packaged)flags.push('Packaged');if(row.rolledBack)flags.push('Reverted');
      desc.textContent=(row.summary||row.title||'Published MASSFRONT release')+(flags.length?' · '+flags.join(' · '):'');
      li.appendChild(b);li.appendChild(desc);list.appendChild(li);
    });
    if(L.historyTab==='published'){
      var gap=document.createElement('li');gap.className='gap';
      var gb=document.createElement('b');gb.textContent='EARLIER RELEASE RECORDS';
      var gs=document.createElement('span');gs.textContent='Catalog reconstruction is still in progress; unverified gaps are not invented.';
      gap.appendChild(gb);gap.appendChild(gs);list.appendChild(gap);
    }
    setTab('history',L.historyTab);
  }
  function renderRelease(){
    var release=L.release=currentRelease(),cat=String(release.category||'system').toLowerCase();
    var history=L.update&&L.update.history||{},published=history.published||[],device=history.device||[];
    var key=[release.version,cat,release.title,release.summary,release.features.join('|'),release.fixes.join('|'),
      release.upcoming.join('|'),published.length,device.length,published[0]&&published[0].at,device[0]&&device[0].at].join('\u001f');
    if(key===L.releaseKey)return;L.releaseKey=key;
    var root=byId('updScr');if(root)root.dataset.category=cat;
    text('mfLaunchReleaseVersion','v'+(release.version||'—'));text('mfLaunchReleaseKind',cat.toUpperCase());
    text('mfLaunchReleaseName',release.title||'MASSFRONT UPDATE');text('mfLaunchReleaseSummary',release.summary||'Verified release information.');
    text('mfLaunchCategory',cat.toUpperCase());text('mfLaunchHeroSummary',release.summary||'The battlefield is ready for command.');
    renderNotes();renderHistory();
  }
  function renderIdentity(){
    var snap=L.identity||identitySnapshot(),host=byId('mfLaunchIdentity');if(host)host.dataset.state=snap.state||'pending';
    text('mfLaunchIdentityText',snap.state==='connected'?'COMMANDER VERIFIED':snap.state==='offline'?'OFFLINE COMMAND':'VERIFYING IDENTITY');
  }
  function progressIntegrity(state){
    if(state==='downloading')return 'STREAMING';if(state==='staging'||state==='applying')return 'VERIFYING';
    if(['ready','installed','current','stale'].indexOf(state)>=0)return 'VERIFIED';if(state==='error'||state==='applyError')return 'ATTENTION';return 'LOCAL';
  }
  function updatePrimary(){
    var s=L.update||updaterSnapshot(),id=L.identity||identitySnapshot(),state=String(s.state||'idle');
    var action=s.action&&typeof s.action==='object'?s.action:{id:'wait',label:'PLEASE WAIT',enabled:false};
    var online=onlineAllowed(),connected=id.state==='connected'&&id.verified===true&&online;
    var busy=['channeling','checking','downloading','staging','applying','rollingBack'].indexOf(state)>=0;
    var primary=byId('mfLaunchPlay'),offline=byId('mfLaunchOffline');if(!primary||!offline)return;
    offline.style.display='none';offline.disabled=true;
    if(id.state==='pending'&&L.phase!=='updater'){
      /* Identity can stay pending for reasons the player cannot influence: a
         cleared 401 session that never reopened the gate, a missing gate
         overlay, or a verification request that never returned. Hiding the
         offline route here left the launcher with no enabled control at all
         and locked the player out of a game they can legally play offline.
         The wait message stays on the primary, but the escape stays live. */
      L.primary='wait';primary.textContent='VERIFYING IDENTITY…';primary.disabled=true;
      if(!busy){offline.style.display='block';offline.disabled=false;}
      return;
    }
    if(action.id==='download'||action.id==='apply'||action.id==='cancel'){
      L.primary='update:'+action.id;primary.textContent=action.label||'UPDATE GAME';primary.disabled=!action.enabled;
      if(action.id==='download'&&!online){primary.textContent='UPDATE REQUIRES INTERNET';primary.disabled=true;}
      if(!busy){offline.style.display='block';offline.disabled=false;}return;
    }
    if(state==='error'&&action.id==='check'){
      L.primary='update:check';primary.textContent=online?'RETRY UPDATE SERVICE':'CHECK REQUIRES INTERNET';primary.disabled=!online;
      offline.style.display='block';offline.disabled=false;return;
    }
    if(busy){L.primary='wait';primary.textContent=String(action.label||'PLEASE WAIT');primary.disabled=true;return;}
    if(L.phase==='updater'){
      L.primary='play-offline';primary.textContent='CONTINUE TO INTRO';primary.disabled=false;return;
    }
    if(id.state==='offline'||!connected||state==='unset'||state==='offline'){
      /* This is the only enabled control at the gate when identity cannot be
         confirmed, so its label has to be honest about what it does. It no
         longer switches the device to Offline Mode, so calling it PLAY OFFLINE
         told the player they were choosing a mode they were not choosing.
         Reserve that wording for someone who actually turned Offline Mode on;
         otherwise this is simply how you continue into the game. */
      var deliberateOffline=(typeof netForcedOffline==='function')&&netForcedOffline();
      L.primary='play-offline';
      primary.textContent=deliberateOffline?'PLAY OFFLINE':'CONTINUE';
      primary.disabled=false;return;
    }
    if(state==='idle'){
      L.primary='wait';primary.textContent='CHECKING GAME…';primary.disabled=true;return;
    }
    L.primary='play-connected';primary.textContent='PLAY CONNECTED';primary.disabled=false;
  }
  function renderUpdate(snapshot){
    L.update=snapshot&&typeof snapshot==='object'?snapshot:updaterSnapshot();var s=L.update,p=s.progress||{};
    var installed=s.installedVersion||s.appVersion||'';text('mfLaunchVersion','v'+(installed||'—'));
    text('mfLaunchPhase',String(s.status||s.state||'READY').toUpperCase());
    var transferring=['downloading','staging','applying'].indexOf(String(s.state||''))>=0;
    text('mfLaunchTransfer',p.total?((transferring?fmtBytesLive(p.bytes):fmtBytes(p.bytes))+' / '+fmtBytes(p.total)):(s.offerBytes?fmtBytes(s.offerBytes):'—'));
    text('mfLaunchSpeed',p.speedBps?fmtBytes(p.speedBps)+'/s':(transferring?'0 B/s':'—'));text('mfLaunchIntegrity',progressIntegrity(s.state));
    text('mfLaunchTechInstalled','v'+(installed||'—'));text('mfLaunchTechChannel',String(s.channel||'stable').toUpperCase());
    var online=onlineAllowed(),linked=online&&L.identity&&L.identity.state==='connected';
    var root=byId('updScr');if(root)root.dataset.online=linked?'true':'false';
    text('mfLaunchNetwork',linked?'NETWORK READY':online?'OFFLINE COMMAND':'NO NETWORK');
    text('mfLaunchTechNetwork',linked?'CONNECTED':online?'OFFLINE MODE':'NO NETWORK');
    var bar=byId('updBarO'),pct=Math.max(0,Math.min(100,Number(p.percent)||0));if(bar)bar.setAttribute('aria-valuenow',String(Math.round(pct)));
    var panelAction=s.action&&s.action.id||'',panelButton=byId('updBtn');
    if(panelButton){
      var remoteAction=panelAction!=='apply'&&panelAction!=='cancel';
      var panelBusy=!!(s.readiness&&s.readiness.busy)||['channeling','checking'].indexOf(String(s.state||''))>=0;
      if(remoteAction){
        /* Only the player's own Offline Mode may disable the retry control.
           This used to read !online, which folds in navigator.onLine, so a
           WebView false negative greyed out RETRY on a connected device and
           left no way to reach the update service at all. The check itself is
           timeout-bounded and reports a real error, so letting the tap through
           is strictly better than a dead button with no explanation. */
        var forcedOffline=(typeof netForcedOffline==='function')&&netForcedOffline();
        panelButton.disabled=forcedOffline||panelBusy;panelButton.setAttribute('aria-disabled',panelButton.disabled?'true':'false');
        if(forcedOffline)panelButton.title='Offline mode is on — turn it off in Settings';
        else panelButton.removeAttribute('title');
      }
    }
    renderRelease();updatePrimary();
  }
  function renderAll(){renderIdentity();renderUpdate(L.update||updaterSnapshot());}
  function enterGateway(){
    if(L.bypass||L.passed)return;L.gate=true;document.body.classList.add('mfLauncherGate');
    try{if(typeof stopAttract==='function')stopAttract();}catch(e){}
    if(typeof updOpen!=='undefined')updOpen=true;
    if(typeof renderUpdatePanel==='function')try{renderUpdatePanel();}catch(e){}
    if(typeof showFrontScreen==='function')showFrontScreen('updScr');
    var sc=byId('mfLauncherScroll');if(sc)sc.scrollTop=0;renderAll();
  }
  function enterLegacyDashboard(){
    if(typeof showFrontScreen==='function')showFrontScreen('startScreen');
    if(typeof renderMetaHead==='function')try{renderMetaHead();}catch(e){}
    if(typeof setupAttract==='function')try{setupAttract();}catch(e){}
    var play=byId('startBtn');if(play)setTimeout(function(){try{play.focus({preventScroll:true});}catch(e){play.focus();}},60);
  }
  function enterGame(forceOffline){
    if(L.phase==='updater'){
      L.phase='intro';L.gate=false;document.body.classList.remove('mfLauncherGate');
      if(typeof window.showPreAlphaIntro==='function')window.showPreAlphaIntro();
      else {L.phase='login';if(typeof mfAuthGate==='function')mfAuthGate();}
      return;
    }
    /* PLAY OFFLINE means "start now without waiting for the network", not
       "disable networking on this device from now on". It used to latch
       netSetOffline(true), which persists to localStorage, and since the
       updater treats that switch as the one authoritative offline gate the
       player silently lost update checks forever with no sign a setting had
       changed. That is a trap: when identity stalls, PLAY OFFLINE is the only
       enabled control, so the single reachable action disabled the very path
       that would deliver the fix. Entering offline changes nothing persistent;
       real connectivity still decides what the updater can do, and Settings
       still owns the deliberate Offline Mode toggle.
       Choosing connected play still clears the switch, because that is an
       explicit request to be online. */
    if(!forceOffline){try{if(typeof netSetOffline==='function')netSetOffline(false);}catch(e){}}
    L.gate=false;L.passed=true;document.body.classList.remove('mfLauncherGate');
    try{window.dispatchEvent(new CustomEvent('massfront:launcher-exit',{detail:{mode:forceOffline?'offline':'connected'}}));}catch(e){}
    /* A normal career launch owns one destination: the interactive UGA home.
       Showing the retired dashboard first used its Galactic interception as an
       accidental second launcher and raced a second `system` entry behind it.
       Travel now begins only from the visible Depart / Return to Orbit action;
       the legacy dashboard remains the honest fallback for slim or failed
       Galactic installations. */
    if(!L.bypass&&!L.entering&&typeof mfOpenExploration==='function'
      &&(window.__MF_BUILD_HAS_GALACTIC_EXPLORATION===true||window.__MF_OTA_HAS_GALACTIC_DELIVERY===true)){
      L.entering=true;L.phase='career';
      Promise.resolve(mfOpenExploration('campaign_hub')).then(function(opened){
        if(opened)return;
        L.phase='dashboard';enterLegacyDashboard();
      }).catch(function(){
        if(typeof toast==='function')toast('Ship entry needs attention. Use START to retry.');
        L.phase='dashboard';enterLegacyDashboard();
      }).finally(function(){L.entering=false;});
      return;
    }
    L.phase='dashboard';enterLegacyDashboard();
  }
  function primaryAction(){
    if(L.primary==='play-connected'){enterGame(false);return;}
    if(L.primary==='play-offline'){enterGame(true);return;}
    if(L.primary.indexOf('update:')===0){
      var action=L.primary.slice(7);if(typeof mfUpdaterAction==='function')mfUpdaterAction(action);
      else if(typeof updButton==='function')updButton();
    }
  }
  function relocatePackPanel(){
    var panel=byId('packPanel'),host=byId('mfLaunchPackProgress');if(panel&&host&&panel.parentNode!==host)host.appendChild(panel);
  }
  async function renderPacks(){
    var ticket=++L.packTicket,button=byId('mfLaunchPackAudio'),state=byId('mfLaunchPackAudioState');if(!button||!state)return;
    relocatePackPanel();
    /* The current voice bank and available score are package invariants, not
       optional network packs. Future audio expansions use the generic startup
       delivery lane and its shared progress panel instead of duplicating these
       base files in IndexedDB. */
    if(ticket!==L.packTicket)return;
    L.packAudioReady=true;L.packAudioIds=[];
    state.textContent='INCLUDED IN THIS BUILD';button.textContent='READY';button.disabled=true;
    button.setAttribute('aria-disabled','true');
  }
  function schedulePackRender(delay){
    clearTimeout(L.packTimer);L.packTimer=setTimeout(function(){L.packTimer=0;renderPacks();},Math.max(0,delay||0));
  }
  async function downloadAudio(){
    if(L.packBusy)return;var verifyOnly=L.packAudioReady,online=onlineAllowed(),api=window.MASSFRONT_ASSET_PACKS;
    if(!verifyOnly&&!online)return;L.packBusy=true;var button=byId('mfLaunchPackAudio');if(button){button.disabled=true;button.textContent=verifyOnly?'VERIFYING…':'PREPARING…';}
    try{
      if(verifyOnly&&api&&typeof api.status==='function'){
        var checked=await Promise.all(L.packAudioIds.map(function(id){return api.status(id,{verify:true});}));
        var damaged=checked.filter(function(row){return !row||row.ok===false||!row.installed||row.updateAvailable;});
        if(!damaged.length){if(typeof toast==='function')toast('Audio pack verified');return;}
        L.packAudioReady=false;if(!online)throw new Error('offline-repair');
        for(var i=0;i<damaged.length;i++)if(damaged[i]&&damaged[i].pack)await api.repair(damaged[i].pack);
        if(typeof audAttachPack==='function')audAttachPack();
      }else if(typeof packStart==='function')await packStart(true);
      else if(api){
        await api.install('voice');await api.install('music');if(typeof audAttachPack==='function')audAttachPack();
      }
    }catch(e){if(typeof toast==='function')toast(online?'Audio download needs attention — retry when connected':'Audio repair requires an Internet connection');}
    finally{L.packBusy=false;relocatePackPanel();renderPacks();}
  }
  /* Cached download bytes and a launchable resource tree are different states.
     Older native installs must finish verified staging before this card says
     READY; the content generation is pinned by their new OTA descriptor. */
  var GALACTIC_PACK_ID='galactic-exploration';
  async function renderGalactic(){
    var state=byId('mfLaunchPackGalacticState'),button=byId('mfLaunchPackGalactic');if(!state||!button)return;
    var card=button.closest?button.closest('[data-launch-pack="galactic"]'):null;
    /* Bundled in the package: nothing to download, and the card must not offer
       a network action that would duplicate what is already on disk. */
    if(window.__MF_BUILD_HAS_GALACTIC_EXPLORATION===true){
      if(card)card.classList.remove('onlineOnly');
      state.textContent='INCLUDED IN THIS BUILD';button.textContent='READY';
      button.disabled=true;button.setAttribute('aria-disabled','true');return;
    }
    var ticket=++L.galacticTicket,online=onlineAllowed(),api=window.MASSFRONT_ASSET_PACKS;
    var status=null;
    try{ if(api&&typeof api.status==='function') status=await api.status(GALACTIC_PACK_ID); }catch(e){}
    if(ticket!==L.galacticTicket)return;
    var installed=!!(status&&status.ok!==false&&status.installed&&!status.updateAvailable);
    var partial=!!(status&&(status.partial||(status.installed&&status.updateAvailable)));
    var mount=null;try{mount=window.MFNativeExplorationContent&&window.MFNativeExplorationContent.snapshot();}catch(e){}
    var needsMount=window.__MF_OTA_HAS_GALACTIC_DELIVERY===true;
    var mounted=!!(mount&&[mount.good,mount.prepared].some(function(candidate){
      return candidate&&typeof APP_VERSION==='string'&&candidate.version===APP_VERSION&&candidate.generation!==mount.failed;
    }));
    L.galacticCached=installed;
    L.galacticReady=installed&&(!needsMount||mounted);
    if(installed&&needsMount&&!mounted){
      if(card)card.classList.remove('onlineOnly');
      state.textContent=mount&&mount.failed?'STARTUP NEEDS RETRY':'DOWNLOADED · STAGING REQUIRED';
      button.textContent=mount&&mount.failed?'RETRY':'STAGE';button.disabled=L.galacticBusy;
    }else if(installed){
      if(card)card.classList.remove('onlineOnly');
      state.textContent='INSTALLED'+(status&&status.bytes?' · '+fmtBytes(status.bytes):'');
      button.textContent='VERIFY';button.disabled=L.galacticBusy;
    }else if(!online){
      if(card)card.classList.add('onlineOnly');
      state.textContent='REQUIRES INTERNET';button.textContent='OFFLINE';button.disabled=true;
    }else{
      if(card)card.classList.remove('onlineOnly');
      state.textContent=(partial?'RESUME · ':'CONTENT · ')+(status&&status.bytes?fmtBytes(status.bytes):'GALACTIC EXPLORATION');
      button.textContent=partial?'RESUME':'INSTALL';button.disabled=L.galacticBusy;
    }
    button.setAttribute('aria-disabled',button.disabled?'true':'false');
  }
  async function downloadGalactic(){
    if(L.galacticBusy)return;
    if(window.__MF_BUILD_HAS_GALACTIC_EXPLORATION===true)return;
    var verifyOnly=L.galacticReady,online=onlineAllowed(),api=window.MASSFRONT_ASSET_PACKS;
    /* A bound OTA can stage verified cached bytes without a network. The
       installer still rejects missing/damaged bytes offline; this flag only
       permits reaching its existing local verification/copy path. */
    var localStage=window.__MF_OTA_HAS_GALACTIC_DELIVERY===true&&L.galacticCached;
    if(!verifyOnly&&!online&&!localStage)return;
    try{
      var mountApi=window.MFNativeExplorationContent,mountState=mountApi&&mountApi.snapshot();
      if(mountState&&mountState.failed){mountApi.retry();L.galacticReady=false;verifyOnly=false;}
    }catch(e){}
    L.galacticBusy=true;
    var button=byId('mfLaunchPackGalactic');
    if(button){button.disabled=true;button.textContent=verifyOnly?'VERIFYING…':'PREPARING…';}
    try{
      if(verifyOnly&&api&&typeof api.status==='function'){
        var checked=await api.status(GALACTIC_PACK_ID,{verify:true});
        if(checked&&checked.ok!==false&&checked.installed&&!checked.updateAvailable){
          if(typeof toast==='function')toast('Galactic pack verified');return;
        }
        L.galacticReady=false;
        if(!online){if(typeof toast==='function')toast('Galactic repair requires an Internet connection');return;}
        if(api&&typeof api.repair==='function')await api.repair(GALACTIC_PACK_ID);
        return;
      }
      if(typeof mfInstallExplorationPack!=='function'){
        if(typeof toast==='function')toast('Galactic pack installer is unavailable in this build');return;
      }
      /* mfInstallExplorationPack owns manifest validation, per-file hashing,
         the storage preflight and resume. Report its refusal reason rather
         than a generic failure, because "not enough storage" and "offline"
         need different actions from the player. */
      var result=await mfInstallExplorationPack();
      if(result&&result.ok){ if(typeof toast==='function')toast('Galactic Exploration installed'); }
      else if(typeof toast==='function'){
        var why=result&&result.reason;
        toast(why==='storage'?'Not enough free storage for the Galactic pack'
          :why==='offline'?'Galactic download requires an Internet connection'
          :why==='busy'?'A pack transfer is already running'
          :why==='no-endpoint'||why==='manifest'?'Galactic pack is unavailable right now — try again later'
          :'Galactic download needs attention — retry when connected');
      }
    }catch(e){
      if(typeof toast==='function')toast('Galactic download needs attention — retry when connected');
    }finally{ L.galacticBusy=false;relocatePackPanel();renderGalactic(); }
  }
  function updateStorage(){
    if(!navigator.storage||typeof navigator.storage.estimate!=='function')return;
    navigator.storage.estimate().then(function(value){
      var free=Math.max(0,(Number(value.quota)||0)-(Number(value.usage)||0));text('mfLaunchTechStorage',free?fmtBytes(free)+' FREE':'—');
    }).catch(function(){});
  }
  function bind(){
    var play=byId('mfLaunchPlay'),offline=byId('mfLaunchOffline'),audio=byId('mfLaunchPackAudio');
    if(play)play.addEventListener('click',primaryAction);if(offline)offline.addEventListener('click',function(){enterGame(true);});
    if(audio)audio.addEventListener('click',downloadAudio);
    var galactic=byId('mfLaunchPackGalactic');
    if(galactic)galactic.addEventListener('click',downloadGalactic);
    document.querySelectorAll('[data-launch-notes]').forEach(function(btn){btn.addEventListener('click',function(){L.notesTab=btn.dataset.launchNotes;renderNotes();});});
    document.querySelectorAll('[data-launch-history]').forEach(function(btn){btn.addEventListener('click',function(){L.historyTab=btn.dataset.launchHistory;renderHistory();});});
    window.addEventListener('massfront:identity-state',function(event){
      L.identity=event&&event.detail||identitySnapshot();
      try{
        var explicitOffline=['offline-choice','remembered-offline','gate-dismissed'].indexOf(L.identity.source)>=0;
        if(typeof netSetOffline==='function'&&L.identity.state==='offline'&&explicitOffline)netSetOffline(true);
        else if(typeof netSetOffline==='function'&&L.identity.state==='connected')netSetOffline(false);
      }catch(e){}
      renderAll();
      /* A cached token can expire after the title closes. Re-open the auth
         choice when /me rejects it instead of leaving PLAY disabled forever. */
      if(L.phase==='login'&&L.identity.state==='pending'&&L.identity.source==='signed-out'&&typeof mfAuthGate==='function')
        setTimeout(function(){try{mfAuthGate();}catch(e){}},0);
      if(!L.bypass&&L.phase==='login'&&(L.identity.state==='connected'||L.identity.state==='offline'))enterGame(L.identity.state==='offline');
    });
    window.addEventListener('massfront:intro-complete',function(){if(!L.bypass){L.phase='login';renderAll();}});
    window.addEventListener('massfront:update-state',function(event){
      var before=L.update&&L.update.state,next=event&&event.detail||updaterSnapshot();renderUpdate(next);
      /* Byte progress is deliberately frequent. Pack manifests are unrelated
         to those ticks and can touch IndexedDB, so refresh them only when the
         updater crosses a material state boundary. */
      if(before!==next.state)schedulePackRender(160);
    });
    window.addEventListener('massfront:assetpack-state',function(){relocatePackPanel();});
    window.addEventListener('online',function(){
      if(L.identity&&L.identity.source==='session-unverified'&&typeof apVerifySession==='function')
        try{apVerifySession();}catch(e){}
      renderAll();schedulePackRender(80);
    });window.addEventListener('offline',function(){renderAll();schedulePackRender(80);});
    if(typeof MutationObserver!=='undefined')new MutationObserver(function(){renderAll();renderPacks();})
      .observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  function initLauncherGateway(){
    if(L.inited)return;L.inited=true;L.bypass=isGalacticReturn();if(L.bypass){L.gate=false;L.passed=true;return;}
    bind();seedPublishedHistory();L.identity=identitySnapshot();L.update=updaterSnapshot();
    if(typeof updOpen!=='undefined')updOpen=true;relocatePackPanel();renderAll();renderPacks();renderGalactic();updateStorage();
    /* Prime the launcher behind the title/auth layers. When those close there is
       no one-frame flash of the main menu, even while a cached session verifies. */
    enterGateway();
  }
  function mfLauncherOpenDetails(){
    L.gate=false;document.body.classList.remove('mfLauncherGate');if(typeof updOpen!=='undefined')updOpen=true;
    if(typeof renderUpdatePanel==='function')renderUpdatePanel();if(typeof showFrontScreen==='function')showFrontScreen('updScr');
    L.update=updaterSnapshot();renderAll();renderPacks();
  }
  function mfLauncherHandleBack(){
    if(L.gate)return true;document.body.classList.remove('mfLauncherGate');
    if(typeof showFrontScreen==='function')showFrontScreen('startScreen');if(typeof setupAttract==='function')setupAttract();return true;
  }
  function mfLauncherShouldDeferAttract(){return !L.bypass&&!L.passed;}
  function mfLauncherSnapshot(){
    return {gate:L.gate,passed:L.passed,bypass:L.bypass,phase:L.phase,primary:L.primary,
      identity:L.identity?Object.assign({},L.identity):null,update:L.update?{state:L.update.state,status:L.update.status}:null,
      notesTab:L.notesTab,historyTab:L.historyTab};
  }

  window.initLauncherGateway=initLauncherGateway;
  window.mfLauncherAwaitingUpdateIntro=function(){return !isGalacticReturn()&&L.phase==='updater';};
  window.mfLauncherOpenDetails=mfLauncherOpenDetails;
  window.mfLauncherHandleBack=mfLauncherHandleBack;
  window.mfLauncherShouldDeferAttract=mfLauncherShouldDeferAttract;
  window.mfLauncherSnapshot=mfLauncherSnapshot;
})();
