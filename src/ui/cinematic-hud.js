;(function(){
  /* Every write below used to be unconditional. Re-adding a class an element
     already carries, or re-setting an attribute to the value it already holds,
     still emits a MutationObserver record — and mfCinematicWatch reacts to
     those by queueing another sync, which performs the same writes again. With
     ~20 surfaces decorated per pass that self-sustaining loop measured 2140
     HUD mutations/sec, which players see as text and icons changing at random.
     Guarding at the point of write breaks the cycle at its source; note that
     el.style.x = same is skipped by the browser for free, but class and
     attribute writes are not. */
  function mfCinSetClass(el,name){ if(el&&name&&!el.classList.contains(name)) el.classList.add(name); }
  function mfCinSetClasses(el){ for(var i=1;i<arguments.length;i++) mfCinSetClass(el,arguments[i]); }
  function mfCinToggleClass(el,name,on){ if(el&&el.classList.contains(name)!==!!on)el.classList.toggle(name,!!on); }
  function mfCinSetAttr(el,key,value){
    if(!el) return; var next=String(value);
    if(el.getAttribute(key)!==next) el.setAttribute(key,next);
  }
  /* OTA shells can re-evaluate the takeover without reloading the document.
     Retire the previous observer first so one HUD owns one synchronization
     loop for the lifetime of the page. */
  if(window.MFCinematicHud&&typeof window.MFCinematicHud.destroy==='function'){
    try{window.MFCinematicHud.destroy();}catch(e){}
  }
  /* The cinematic HUD is presentation-only. Moving the existing nodes keeps
     their listeners, IDs and simulation authority intact; copying markup here
     would create a second recycle button and bypass its confirmation guard. */
  function mfCinematicSetRole(el,role){
    if(el)mfCinSetAttr(el,'data-mf-hud-role',role);
    return el;
  }
  function mfCinematicWrap(id,before,nodes,role,label){
    var wrap=document.getElementById(id),anchor=document.getElementById(before);
    if(!wrap){
      wrap=document.createElement('div');wrap.id=id;
      if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(wrap,anchor);
      else document.body.appendChild(wrap);
    }
    mfCinematicSetRole(wrap,role);
    if(label&&!wrap.getAttribute('aria-label'))mfCinSetAttr(wrap,'aria-label',label);
    for(var i=0;i<nodes.length;i++){
      var node=document.getElementById(nodes[i]);
      if(node&&node.parentNode!==wrap)wrap.appendChild(node);
    }
    return wrap;
  }
  function mfCinematicLabelPanel(panel,label,surface){
    if(!panel)return;
    mfCinSetClass(panel,'mfCinematicSurface');
    mfCinSetAttr(panel,'data-mf-hud-role','context-surface');
    mfCinSetAttr(panel,'data-mf-surface',surface);
    if(!panel.getAttribute('role'))mfCinSetAttr(panel,'role','region');
    var title=panel.querySelector('.mfPanelChrome > span');
    if(title){
      if(!title.id)title.id='mfCinematic'+surface.charAt(0).toUpperCase()+surface.slice(1)+'Title';
      mfCinSetAttr(panel,'aria-labelledby',title.id);
    }else if(!panel.getAttribute('aria-label'))mfCinSetAttr(panel,'aria-label',label);
  }
  function mfCinematicMarkIcon(el,icon){
    if(!el)return;
    var direct=el.matches&&el.matches('[data-mf-hud-role="service-repair"],[data-mf-hud-role="service-recycle"]');
    var mark=el.classList.contains('em')?el:el.querySelector&&el.querySelector('.em');
    if(!mark&&!direct){
      if(el.tagName==='SPAN')mark=el;
      else{
        mark=document.createElement('span');mark.className='em mfCinematicInjectedIcon';mfCinSetAttr(mark,'aria-hidden','true');
        el.insertBefore(mark,el.firstChild);
        for(var n=mark.nextSibling;n;n=n.nextSibling){
          if(n.nodeType===3)n.nodeValue=n.nodeValue.replace(/^\s*[⟲⟳✓✗⚑⇩▸]\s*/,'');
        }
      }
    }
    if(mark){
      if(mark.hasAttribute('data-mf-vector-icon')){
        var fallback=mark.getAttribute('data-mf-icon-fallback')||'';
        mark.removeAttribute('data-mf-vector-icon');mark.classList.remove('mfCinematicVectorIcon');
        mark.textContent=fallback;
      }
      mfCinSetClass(mark,'em');mfCinSetAttr(mark,'data-icon',icon);
    }
    else mfCinSetAttr(el,'data-icon',icon);
    if(typeof cmdIconsRefresh==='function')cmdIconsRefresh(mark||el);
  }
  /* The shipped command atlas intentionally stops at its authored cells. These
     small monochrome vectors complete the cinematic shell without pretending a
     blank atlas reservation is finished art. They inherit button colour, stay
     sharp at every DPR/text scale, and never replace a button's listener. */
  var MF_CINEMATIC_VECTOR={
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    tilt:'<path d="M3 18 8 9l4 5 4-7 5 11"/><path d="M4 21h16M7 4h10"/>',
    feed:'<circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/><path d="M9 7h11M9 12h11M9 17h8"/>',
    confirm:'<path d="m5 12 4 4L19 6"/><path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6z"/>',
    build:'<path d="M4 20V9h9v11M13 12h7v8M7 12h3M7 15h3M7 18h3M16 15h2M16 18h2"/>',
    buildings:'<path d="M3 20V10h6v10M9 20V5h7v15M16 20v-8h5v8M5 13h2M11 8h2M11 12h2M11 16h2M18 15h1"/>',
    upgrade:'<path d="M12 3 6 9h4v7h4V9h4zM5 20h14"/>',
    repeat:'<path d="M18 8a7 7 0 0 0-12-2L3 9M6 16a7 7 0 0 0 12 2l3-3"/><path d="M3 4v5h5M21 20v-5h-5"/>',
    prev:'<path d="m15 5-7 7 7 7"/>',next:'<path d="m9 5 7 7-7 7"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    warning:'<path d="M12 3 2.8 20h18.4zM12 9v5M12 17h.01"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    fire:'<path d="M13 2c1 5-3 6-1 10 1-2 3-3 4-5 3 3 4 6 3 9a7 7 0 0 1-14 0c0-4 2-7 5-10 0 3 1 4 3 5"/>',
    recharge:'<path d="M13 2 6 13h6l-1 9 7-12h-6z"/><circle cx="12" cy="12" r="10"/>',
    flight:'<path d="m2 13 8-3 3-7 2 1-1 7 7 3v2l-8-1-4 5-2-1 2-5-7 1z"/>',
    birth:'<path d="M12 21V10M12 14c-5 0-7-3-7-7 5 0 7 2 7 7ZM12 11c4 0 6-2 6-6-4 0-6 2-6 6Z"/>',
    economy:'<path d="m12 3 7 5-3 10H8L5 8zM8 8h8M9 12h6"/>',
    factory:'<path d="M3 21V10l6 3v-3l6 3V6h4v15zM6 17h2M11 17h2M16 17h2"/>',
    naval:'<path d="m4 14 3-5h10l3 5-8 4zM3 20c2 1 4 1 6 0 2 1 4 1 6 0 2 1 4 1 6 0"/>',
    shield:'<path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6zM8 12h8"/>',
    wall:'<path d="M3 7h5v4h4V7h5v4h4v10H3zM8 21v-5h8v5"/>',
    tech:'<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="9" transform="rotate(45 12 12)"/>',
    support:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
    infantry:'<path d="M8 9a4 4 0 1 1 8 0M7 21v-5a5 5 0 0 1 10 0v5M5 21h14"/>',
    vehicle:'<path d="M3 15h18v4H3zM6 15l2-6h8l3 6M8 19v2M16 19v2"/>',
    antitank:'<path d="m4 17 11-11 3 3L7 20H4zM14 5l2-2 5 5-2 2"/>',
    explosion:'<path d="m12 2 2 6 5-3-2 6 5 1-6 3 3 5-6-2-1 4-2-5-6 2 3-5-5-2 6-2-3-5 5 2z"/>',
    artillery:'<path d="M4 17h10l5-5-2-2-6 4H4zM6 17v3M12 17v3M4 20h10"/>',
    antiair:'<path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/><circle cx="12" cy="12" r="7"/>',
    air:'<path d="m2 13 8-3 2-7 2 1v7l8 3v2l-8-1-3 5-2-1 1-5-8 1z"/>',
    experimental:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
    ability:'<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
    more:'<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    salvage:'<path d="m8 4 4-2 4 2M5 8l-3 4 3 4M19 8l3 4-3 4M8 20l4 2 4-2"/><path d="M8 4h8l3 4M5 8l3 12h8l3-4"/>',
    stealth:'<path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"/><path d="m4 4 16 16M10 10a3 3 0 0 0 4 4"/>',
    deploy:'<path d="M12 3v11M8 10l4 4 4-4M4 18h16v3H4z"/>',
    invalid:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    rank:'<path d="m5 15 7-9 7 9-7 5zM8 15l4-5 4 5"/>',
    domination:'<path d="M5 21V4M6 5h11l-2 4 2 4H6"/>',
    annihilation:'<path d="M8 18v3M16 18v3M7 14a5 5 0 1 1 10 0v4H7zM9 13h.01M15 13h.01M11 17h2"/>',
    purge:'<path d="M12 5v14M6 8l6 4 6-4M6 16l6-4 6 4M5 5l3 3M19 5l-3 3M5 19l3-3M19 19l-3-3"/>',
    dust:'<path d="M3 8h12c3 0 3-4 0-4M3 12h17c3 0 3 4 0 4M3 16h8"/>',
    storm:'<path d="M4 15a5 5 0 0 1 5-5 6 6 0 0 1 11 2 4 4 0 0 1-1 7H6a4 4 0 0 1-2-4Z"/><path d="m12 14-2 5h3l-2 4"/>',
    calm:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    spores:'<circle cx="8" cy="9" r="3"/><circle cx="15" cy="7" r="2"/><circle cx="16" cy="15" r="4"/><circle cx="7" cy="17" r="1.5"/>',
    heat:'<path d="M8 19c-3-3 1-5 0-8 3 1 3 3 4 4 1-4-1-7 3-11 0 5 4 6 3 11-1 4-4 6-7 6"/>',
    collapse:'<path d="M3 19 8 5h8l5 14M8 5l4 6 4-6M3 19h18M9 19l3-5 3 5"/>',
    eruption:'<path d="m5 20 4-9h6l4 9M8 14h8M12 9V3M8 8 6 5M16 8l2-3"/>',
    meteor:'<path d="m4 4 8 8M8 2l7 7M2 8l7 7"/><circle cx="16" cy="16" r="5"/>',
    squall:'<path d="M3 7h13c4 0 4-5 0-5M3 12h17M3 17h11c4 0 4 5 0 5"/>',
    whiteout:'<path d="M12 2v20M3 7l18 10M3 17 21 7M7 3l10 18M17 3 7 21"/>',
    flood:'<path d="M3 8c3 2 6 2 9 0 3 2 6 2 9 0M3 13c3 2 6 2 9 0 3 2 6 2 9 0M3 18c3 2 6 2 9 0 3 2 6 2 9 0"/>',
    solar:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/><path d="m9 13 3-5v4h3l-4 5v-4z"/>',
    relic:'<path d="m12 2 7 5-2 12H7L5 7zM9 8h6M10 12h4M11 16h2"/>'
  };
  /* Unit Intel owns authoritative text labels while hud.js intentionally keeps
     portable glyph fallbacks. Resolve art from those stable labels, never from
     a platform-dependent emoji rendering, so Android, Safari and desktop show
     the same semantic vector without weakening the no-art fallback. */
  var MF_CINEMATIC_INTEL_CHIP_VECTOR={
    'RESOURCE FORECAST':'economy',ECONOMY:'economy',PRODUCTION:'factory',NAVAL:'naval',DEFENCE:'shield',
    FORTIFICATION:'wall',TECH:'tech',SUPPORT:'support',SUPERWEAPON:'target',INFANTRY:'infantry',ARMOUR:'vehicle',
    'ANTI-TANK':'antitank','CROWD CONTROL':'explosion',ARTILLERY:'artillery','ANTI-AIR':'antiair',AIRCRAFT:'air',
    EXPERIMENTAL:'experimental','AIR + GROUND':'target',GROUND:'target',AIR:'air',KINETIC:'target',BEAM:'recharge',
    CLAWS:'warning',EXPLOSIVE:'explosion',GAUSS:'antitank',INCENDIARY:'fire',SONIC:'ability',ION:'recharge','—':'invalid',
    EXTREME:'target',LONG:'target',MEDIUM:'target',CLOSE:'target','LIGHT ARMOR':'shield','MEDIUM ARMOR':'shield',
    'HEAVY ARMOR':'shield',RECON:'target',GHOST:'stealth',RADAR:'target',DETECT:'target'
  };
  var MF_CINEMATIC_INTEL_MATCH_VECTOR={
    LIGHT:'infantry',MEDIUM:'vehicle',HEAVY:'experimental',KINETIC:'target',BEAM:'recharge',CLAWS:'warning',
    EXPLOSIVE:'explosion',GAUSS:'antitank',INCENDIARY:'fire',SONIC:'ability',ION:'recharge'
  };
  function mfCinematicMarkVector(el,icon){
    if(!el||!MF_CINEMATIC_VECTOR[icon])return;
    /* The rank badge is rewritten by hudTxt when account rank changes. Own the
       existing badge directly so that write destroys only this vector and the
       observer can restore it; injecting a child left the new medal beside it. */
    var direct=el.id==='heroRankEm';
    var mark=direct?el:(el.classList&&el.classList.contains('em')?el:el.querySelector&&el.querySelector('.em'));
    if(!mark){
      if(el.tagName==='SPAN')mark=el;
      else{
        mark=document.createElement('span');mark.className='em mfCinematicInjectedIcon';mfCinSetAttr(mark,'aria-hidden','true');
        el.insertBefore(mark,el.firstChild);
        for(var n=mark.nextSibling;n;n=n.nextSibling){
          /* Assigning nodeValue fires a characterData mutation even when the
             string is unchanged, and these nodes sit inside the watched command
             dock, so stripping a glyph that was never there still woke the HUD
             observers on every pass. Only write a real change. */
          if(n.nodeType===3){
            var strippedLead=n.nodeValue.replace(/^\s*(?:✉|⏸|⛰|☷|✓|⬆|‹|›|×|⚠|ⓘ|🔒|🐛|◈|☠|☄|⚡|♒)\s*/u,'');
            if(strippedLead!==n.nodeValue) n.nodeValue=strippedLead;
          }
        }
      }
    }
    if(mark.getAttribute('data-mf-vector-icon')===icon&&mark.firstElementChild){
      mark.removeAttribute('data-icon');mark.removeAttribute('data-icon-ready');return;
    }
    if(!mark.hasAttribute('data-mf-icon-fallback'))mfCinSetAttr(mark,'data-mf-icon-fallback',(mark.textContent||'').trim());
    mfCinSetClasses(mark,'em','mfCinematicVectorIcon');mfCinSetAttr(mark,'data-mf-vector-icon',icon);
    mark.removeAttribute('data-icon');mark.removeAttribute('data-icon-ready');mfCinSetAttr(mark,'aria-hidden','true');
    mark.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">'+MF_CINEMATIC_VECTOR[icon]+'</svg>';
  }
  function mfCinematicStripLeadingGlyph(el,re){
    if(!el)return;
    for(var i=0;i<el.childNodes.length;i++){
      var node=el.childNodes[i];
      if(node.nodeType!==3) continue;
      /* Same reason as above: assign only when the text actually changes. */
      var stripped=node.nodeValue.replace(re,'');
      if(stripped!==node.nodeValue) node.nodeValue=stripped;
    }
  }
  function mfCinematicIntelOwnText(el){
    var text='';if(!el)return text;
    for(var i=0;i<el.childNodes.length;i++)if(el.childNodes[i].nodeType===3)text+=el.childNodes[i].nodeValue;
    return text.trim().toUpperCase();
  }
  function mfCinematicIntelLead(el){
    if(!el)return null;
    var mark=el.querySelector('.mfCinematicIntelLead');if(mark)return mark;
    var fallback='';
    for(var i=0;i<el.childNodes.length;i++){
      var node=el.childNodes[i];if(node.nodeType!==3)continue;
      var found=node.nodeValue.match(/^\s*([✦⛭⌾◆⚔▰◇ϟ⟲☄⚠🔒✓⌁])\s*/u);
      if(found){fallback=found[1];node.nodeValue=node.nodeValue.slice(found[0].length);break;}
    }
    mark=document.createElement('span');mark.className='em mfCinematicIntelLead';mfCinSetAttr(mark,'aria-hidden','true');
    mark.textContent=fallback;el.insertBefore(mark,el.firstChild);return mark;
  }
  function mfCinematicDecorateUnitIntel(){
    var card=document.getElementById('unitCard');if(!card)return;
    var firstChip=card.querySelector('.ucChips .ucChip'),role=card.querySelector('.ucRoleIcon');
    if(role){
      var roleLabel=mfCinematicIntelOwnText(firstChip)||((card.querySelector('.ucHead b')||{}).textContent||'').trim().toUpperCase();
      var roleVector=MF_CINEMATIC_INTEL_CHIP_VECTOR[roleLabel]||'info';
      mfCinematicMarkVector(role,roleVector);
    }
    card.querySelectorAll('.ucChips .ucChip').forEach(function(chip){
      var mark=chip.querySelector('i'),label=mfCinematicIntelOwnText(chip);if(!mark||!label)return;
      var chipVector=MF_CINEMATIC_INTEL_CHIP_VECTOR[label]||(/\bHP$/.test(label)?'shield':'info');
      mfCinSetClass(mark,'em');mfCinematicMarkVector(mark,chipVector);
    });
    card.querySelectorAll('.ucMatchChip').forEach(function(chip){
      var mark=chip.querySelector('i'),label=((chip.querySelector('b')||{}).textContent||'').trim().toUpperCase();
      if(!mark||!label)return;
      var matchVector=MF_CINEMATIC_INTEL_MATCH_VECTOR[label]||'target';
      mfCinSetClass(mark,'em');mfCinematicMarkVector(mark,matchVector);
    });
    card.querySelectorAll('.ucCounter.caution,.ucCounter .caution').forEach(function(line){
      var label=(line.textContent||'').trim().toUpperCase();
      var cautionVector=/LOCK|RESEARCH/.test(label)?'lock':/BARRAGE/.test(label)?'artillery':
        /DEPENDENC/.test(label)?'tech':/ACTIVE/.test(label)?'ability':'warning';
      mfCinematicMarkVector(mfCinematicIntelLead(line),cautionVector);
    });
    card.querySelectorAll('.ucCounter>span:not(.caution)').forEach(function(line){
      if(/PURPOSE/.test(line.textContent||''))mfCinematicMarkVector(mfCinematicIntelLead(line),'confirm');
    });
  }
  function mfCinematicRestoreLegacyGoalCopy(){
    var goal=document.getElementById('goalBar');if(!goal)return;
    var legacy=goal.querySelectorAll('.hudIntelChip[data-mf-vector-icon]');
    if(!legacy.length)return;
    legacy.forEach(function(chip){
      var fallback=chip.getAttribute('data-mf-icon-fallback')||'';
      chip.removeAttribute('data-mf-vector-icon');chip.removeAttribute('data-mf-icon-fallback');
      chip.removeAttribute('data-icon');chip.removeAttribute('data-icon-ready');chip.removeAttribute('aria-hidden');
      chip.classList.remove('em','mfCinematicVectorIcon');
      if(fallback)chip.textContent=fallback;
    });
    /* An OTA takeover may replace this script without reloading the match.
       The former whole-chip vector destroyed rich FIRST CONTACT/clock markup;
       invalidate hud.js' HTML cache so its next normal HUD pass restores the
       authoritative copy before this decorator adds child-only icons. */
    goal._mfH=null;
  }
  function mfCinematicGoalIcon(chip){
    if(!chip)return null;
    var mark=chip.querySelector('.mfCinematicGoalIcon');
    if(!mark){
      /* hud.js still provides glyph fallbacks. Remove only that leading text
         node; mission, enemy and clock copy must remain in the status chip. */
      mfCinematicStripLeadingGlyph(chip,/^\s*[◈☠🐛]\s*/u);
      mark=document.createElement('span');mark.className='em mfCinematicGoalIcon';
      mfCinSetAttr(mark,'aria-hidden','true');chip.insertBefore(mark,chip.firstChild);
    }
    return mark;
  }
  function mfCinematicDecorateVectorIcons(){
    var controls={inboxHudBtn:'mail',menuBtn:'pause',tiltBtn:'tilt',noticeLogBtn:'feed',placeOk:'confirm',
      buildBtn:'build',upBtn:'upgrade',repeatBtn:'repeat',prodPrev:'prev',prodNext:'next',heroRankEm:'rank'};
    for(var id in controls)mfCinematicMarkVector(document.getElementById(id),controls[id]);
    mfCinematicMarkVector(document.querySelector('#hudDeckTabs [data-deck="buildings"] span'),'buildings');
    mfCinematicMarkVector(document.querySelector('#hudDeckTabs [data-deck="abilities"] span'),'ability');
    document.querySelectorAll('#mfCinematicContext .mfPanelChrome button,#mfNoticeHistory header button').forEach(function(el){mfCinematicMarkVector(el,'close');});
    var category={ECONOMY:'economy',PRODUCTION:'factory',NAVAL:'naval',DEFENCE:'shield',FORTIFICATION:'wall',TECH:'tech',SUPPORT:'support',SUPERWEAPON:'target',
      INFANTRY:'infantry',ARMOUR:'vehicle','ANTI-TANK':'antitank','CROWD CONTROL':'explosion',ARTILLERY:'artillery','ANTI-AIR':'antiair',AIRCRAFT:'air',
      EXPERIMENTAL:'experimental',HERO:'experimental',AIRLIFT:'flight',MASSFLESH:'birth'};
    document.querySelectorAll('#buildTabs button,#prodTabs button').forEach(function(btn){
      var label='';for(var i=0;i<btn.childNodes.length;i++)if(btn.childNodes[i].nodeType===3)label+=btn.childNodes[i].nodeValue;
      label=label.trim().toUpperCase();var icon=category[label];
      if(icon)mfCinematicMarkVector(btn.querySelector('.tEm')||btn,icon);
    });
  }
  function mfCinematicSyncModeIcon(){
    var mark=document.getElementById('modeEm'),label=document.getElementById('modeNm');if(!mark)return;
    var modes={MOBILE:'move',MOVE:'move',GUARD:'guard',SURVEY:'ping',MINE:'resource',HOLD:'hold',PATROL:'patrol'};
    var icon=modes[((label&&label.textContent)||'').trim().toUpperCase()];
    if(icon)mfCinematicMarkIcon(mark,icon);
    else{
      mark.removeAttribute('data-icon');mark.removeAttribute('data-icon-ready');
      if(typeof cmdIconsRefresh==='function')cmdIconsRefresh(mark);
    }
  }
  function mfCinematicDecorateHotSlots(){
    document.querySelectorAll('#hotSlots .hotSlot,#hotUtilityPanel .hotUtility').forEach(function(btn){
      var label=((btn.querySelector('.hNm')||{}).textContent||'').trim().toUpperCase();
      var mark=btn.querySelector('.hEm');if(!mark||!label)return;
      var atlas=label.indexOf('REPAIR')>=0||label.indexOf('MEND')>=0?'repair':
        label.indexOf('UNLOAD')>=0?'unload':label==='GUARD'?'guard':
        (label==='MOBILE'||label==='MOVE')?'move':label==='HOLD'?'hold':label==='PATROL'?'patrol':
        label==='MINE'?'resource':label==='SURVEY'?'ping':'';
      if(atlas){mfCinematicMarkIcon(mark,atlas);return;}
      var vector=label==='BUILD'?'build':label.indexOf('SALVAGE')>=0?'salvage':label.indexOf('TAKE FLIGHT')>=0?'flight':
        label.indexOf('BIRTH')>=0?'birth':label==='UTILITY'?'more':label.indexOf('BLAST')>=0?'explosion':
        (label.indexOf('SURGE')>=0||label==='EMP')?'recharge':label.indexOf('LANCE')>=0?'target':
        label.indexOf('BARRAGE')>=0||label==='SIEGE'?'artillery':label==='ASSIST'?'support':
        label==='GHOST'?'stealth':label.indexOf('SUPPRESS')>=0?'target':label==='PRIMARY'?'target':
        label==='SECONDARY'?'fire':label.indexOf('SIGNATURE')>=0?'ability':label==='JUMP'?'flight':
        label.indexOf('DOCTRINE')>=0?'tech':'';
      if(vector)mfCinematicMarkVector(mark,vector);
    });
  }
  function mfCinematicDecorateStateIcons(){
    ['atkAlert','waveAlert','mfMassAlert'].forEach(function(id){mfCinematicMarkVector(document.getElementById(id),'warning');});
    document.querySelectorAll('.selIntelBtn,.cardIntel').forEach(function(el){mfCinematicMarkVector(el,'info');});
    document.querySelectorAll('#unitCard .ucClose').forEach(function(el){mfCinematicMarkVector(el,'close');});
    mfCinematicDecorateUnitIntel();
    var priority=document.getElementById('bp_prio');if(priority)mfCinematicMarkVector(priority,'target');
    ['upBtn','bp_up'].forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      mfCinematicMarkVector(el,/LOCK|TECH|🔒/.test(el.textContent||'')?'lock':'upgrade');
    });
    var fire=document.getElementById('bp_fire');if(fire)mfCinematicMarkVector(fire,/CHARG|NEEDS|ENERGY/.test(fire.textContent||'')?'recharge':'fire');
    var mass=document.getElementById('mfMassActionBtn');if(mass)mfCinematicMarkVector(mass,/BIRTH/.test(mass.textContent||'')?'birth':'flight');
    var deploy=document.getElementById('deployBtn');if(deploy){
      /* Old HTML and state writers prefix this authoritative button with an
         anchor. Strip that fallback on every pass before choosing the vector;
         otherwise a later label write can render ⚓ beside the valid icon. */
      mfCinematicStripLeadingGlyph(deploy,/^\s*[⚓⛔]\s*(?:\u00a0\s*)*/u);
      mfCinematicMarkVector(deploy,/INVALID|BLOCK|NO |⛔/.test(deploy.textContent||'')?'invalid':'deploy');
    }
    var meter=document.getElementById('infMeter');if(meter)mfCinematicMarkVector(meter,'purge');
    var goal=document.getElementById('goalBar');if(goal){
      goal.querySelectorAll('.hudIntelChip').forEach(function(chip){
        if(chip.classList.contains('contact'))mfCinematicMarkVector(mfCinematicGoalIcon(chip),'target');
        else if(chip.classList.contains('time'))mfCinematicMarkVector(mfCinematicGoalIcon(chip),'clock');
        else{
          var t=(chip.textContent||'').toUpperCase(),key=/HIVE|BUG|PURGE/.test(t)?'purge':/HOLD|NODE|TERRITORY/.test(t)?'domination':/SURVIV/.test(t)?'shield':'annihilation';
          mfCinematicMarkVector(mfCinematicGoalIcon(chip),key);
        }
      });
    }
    var haz=document.getElementById('hazChip'),hazName=haz&&haz.querySelector('.hazNm'),hazMark=haz&&haz.querySelector('.hazEm');
    if(hazName&&hazMark){
      var h=(hazName.textContent||'').toUpperCase(),hazards=/DUST|SAND/.test(h)?'dust':/THUNDER|STORM/.test(h)?'storm':/CALM|CLEAR/.test(h)?'calm':
        /SPORE/.test(h)?'spores':/HEAT|FIRE/.test(h)?'heat':/COLLAPSE|QUAKE/.test(h)?'collapse':/ERUPT|VOLCAN/.test(h)?'eruption':
        /METEOR/.test(h)?'meteor':/SQUALL|WIND/.test(h)?'squall':/WHITE|BLIZZARD|SNOW/.test(h)?'whiteout':/FLOOD|RAIN/.test(h)?'flood':
        /SOLAR|SUN/.test(h)?'solar':/RELIC/.test(h)?'relic':'warning';
      mfCinematicMarkVector(hazMark,hazards);
    }
    mfCinematicDecorateHotSlots();
  }
  function mfCinematicDecorateCommandIcons(){
    var deck={orders:'attack',platoons:'group',view:'minimap'};
    for(var key in deck)mfCinematicMarkIcon(document.querySelector('#hudDeckTabs [data-deck="'+key+'"] span'),deck[key]);
    var controls={armyBtn:'group',idleBuilderBtn:'repair',boxBtn:'selectall',stopBtn:'stop',
      rotL:'patrol',rotR:'patrol',zoomIn:'zoomin',zoomOut:'zoomout',queueBtn:'waypoint',mfUnloadBtn:'unload',
      rallyBtn:'rally',placeRotL:'patrol',placeRotR:'patrol',placeNo:'stop',
      bp_repair:'repair',bp_sell:'delete'};
    for(var id in controls)mfCinematicMarkIcon(document.getElementById(id),controls[id]);
  }
  function mfCinematicEnsureStructure(){
    var body=document.body;
    mfCinSetClass(body,'mf-cinematic-hud');
    mfCinSetAttr(body,'data-mf-hud','cinematic-v1');
    var top=mfCinematicWrap('mfCinematicTopRail','topbar',['heroBar','topbar'],'top-rail','Commander and battle resources');
    var hero=mfCinematicSetRole(document.getElementById('heroBar'),'commander-profile');
    var resources=mfCinematicSetRole(document.getElementById('topbar'),'resource-rail');
    if(top)mfCinSetClass(top,'mfCinematicRail');
    if(resources){
      if(!resources.getAttribute('role'))mfCinSetAttr(resources,'role','region');
      if(!resources.getAttribute('aria-label'))mfCinSetAttr(resources,'aria-label','Battle resources and controls');
      var tiles=[
        {el:document.getElementById('massV'),label:'MASS'},
        {el:document.getElementById('enV'),label:'ENERGY'},
        {el:document.getElementById('unitRes'),label:'COMMAND'}
      ];
      for(var i=0;i<tiles.length;i++){
        var tile=tiles[i].el;
        if(tile&&tile.id!=='unitRes')tile=tile.parentElement;
        if(!tile)continue;
        mfCinSetClass(tile,'mfCinematicResource');mfCinSetAttr(tile,'data-label',tiles[i].label);
        mfCinSetAttr(tile,'data-mf-resource',tiles[i].label.toLowerCase());
        if(!tile.getAttribute('role'))mfCinSetAttr(tile,'role','group');
        if(!tile.getAttribute('aria-label'))mfCinSetAttr(tile,'aria-label',tiles[i].label+' resource');
      }
    }
    if(hero&&!hero.classList.contains('mfCinematicCommander'))mfCinSetClass(hero,'mfCinematicCommander');

    var context=mfCinematicWrap('mfCinematicContext','buildMenu',['buildMenu','prodMenu','bldMenu2'],'context','Context controls');
    if(context)mfCinSetClass(context,'mfCinematicContext');
    mfCinematicLabelPanel(document.getElementById('buildMenu'),'Structures','build');
    mfCinematicLabelPanel(document.getElementById('prodMenu'),'Production','production');
    mfCinematicLabelPanel(document.getElementById('bldMenu2'),'Structure control','structure');

    var cmd=mfCinematicSetRole(document.getElementById('cmdbar'),'command-dock');
    if(cmd){
      if(!cmd.classList.contains('mfCinematicCommandDock'))mfCinSetClass(cmd,'mfCinematicCommandDock');
      if(!cmd.getAttribute('role'))mfCinSetAttr(cmd,'role','region');
      if(!cmd.getAttribute('aria-label'))mfCinSetAttr(cmd,'aria-label','Tactical command dock');
    }
    var minimapWrap=mfCinematicSetRole(document.getElementById('minimapWrap'),'minimap-receiver');
    if(minimapWrap){
      if(!minimapWrap.getAttribute('role'))mfCinSetAttr(minimapWrap,'role','region');
      if(!minimapWrap.getAttribute('aria-label'))mfCinSetAttr(minimapWrap,'aria-label','Tactical minimap and command transmissions');
    }
    var minimap=mfCinematicSetRole(document.getElementById('minimap'),'minimap-command');
    if(minimap&&!minimap.getAttribute('aria-label'))mfCinSetAttr(minimap,'aria-label','Tactical minimap');
    mfCinematicSetRole(document.getElementById('cmdrTx'),'command-transmission');
    mfCinematicSetRole(document.getElementById('hudDeckTabs'),'deck-tabs');
    mfCinematicSetRole(document.getElementById('goalBar'),'mission-status');
    mfCinematicSetRole(document.getElementById('goalDetailBtn'),'mission-command');
    mfCinematicSetRole(document.getElementById('camRow'),'view-deck');
    mfCinematicSetRole(document.getElementById('tacRow'),'orders-deck');
    mfCinematicSetRole(document.getElementById('hotSlots'),'abilities-deck');
    mfCinematicSetRole(document.getElementById('primaryRow'),'primary-orders');
    document.querySelectorAll('#hudDeckTabs .hudDeckBtn').forEach(function(tab){mfCinematicSetRole(tab,'deck-command');});
    var authorityRoles={
      inboxHudBtn:'inbox-command',spdBtn:'speed-command',menuBtn:'pause-command',
      armyBtn:'select-army-command',idleBuilderBtn:'select-idle-builders-command',boxBtn:'box-select-command',
      stopBtn:'stop-command',buildBtn:'build-command',patrolBtn:'patrol-command',holdBtn:'hold-command',
      formBtn:'formation-command',moveBtn:'attack-move-command',clearBtn:'clear-selection-command',
      rotL:'rotate-left-command',zoomIn:'zoom-in-command',tiltBtn:'tilt-command',zoomOut:'zoom-out-command',rotR:'rotate-right-command',
      queueBtn:'waypoint-command',rallyBtn:'rally-command',repeatBtn:'repeat-command',
      upBtn:'production-upgrade',bp_up:'structure-upgrade',noticeLogBtn:'event-feed-control',
      mfNoticeDock:'event-feed-dock',mfNoticeHistory:'event-feed',hotUtilityPanel:'utility-drawer'};
    for(var authorityId in authorityRoles)mfCinematicSetRole(document.getElementById(authorityId),authorityRoles[authorityId]);
    var heroRow=mfCinematicSetRole(document.getElementById('heroRow'),'ability-authority');
    if(heroRow)mfCinSetClass(heroRow,'mfCinematicAuthoritySource');

    var groups=mfCinematicWrap('mfCinematicGroupPalette','grpRow',['grpRow'],'group-palette','Match command groups');
    var grpRow=mfCinematicSetRole(document.getElementById('grpRow'),'match-command-palette');
    if(groups)mfCinSetClass(groups,'mfCinematicGroupPalette');
    if(grpRow){
      mfCinSetAttr(grpRow,'data-mf-persistence','match-memory');
      for(var g=1;g<=4;g++){
        var btn=document.getElementById('grpBtn'+g);
        if(btn){mfCinSetClass(btn,'mfCinematicGroupSlot');mfCinSetAttr(btn,'data-mf-group-slot',String(g));}
      }
    }
  }
  function mfCinematicSyncContext(){
    var context=document.getElementById('mfCinematicContext'),body=document.body;
    var surfaces=[['buildMenu','build'],['prodMenu','production'],['bldMenu2','structure']],active='none';
    for(var i=0;i<surfaces.length;i++){
      var panel=document.getElementById(surfaces[i][0]);
      var on=!!(panel&&!panel.hidden&&panel.style.display==='block');
      if(on&&active==='none')active=surfaces[i][1];
      if(panel){
        mfCinToggleClass(panel,'mfCinematicSurfaceActive',on);
        mfCinSetAttr(panel,'data-mf-active',on?'true':'false');
      }
    }
    if(context)mfCinSetAttr(context,'data-active-surface',active);
    mfCinSetAttr(body,'data-mf-hud-surface',active);
    mfCinToggleClass(body,'mfCinematicContextOpen',active!=='none');
  }
  function mfCinematicSyncDeck(){
    var tabs=document.getElementById('hudDeckTabs');if(!tabs)return;
    var buttons=tabs.querySelectorAll('[data-deck]'),active='orders';
    for(var i=0;i<buttons.length;i++){
      var on=buttons[i].getAttribute('aria-selected')==='true'||buttons[i].classList.contains('on');
      mfCinToggleClass(buttons[i],'mfCinematicDeckActive',on);
      mfCinSetAttr(buttons[i],'data-mf-active',on?'true':'false');
      if(on)active=buttons[i].getAttribute('data-deck')||active;
    }
    mfCinSetAttr(tabs,'data-active-deck',active);
    mfCinSetAttr(document.body,'data-mf-hud-deck',active);
  }
  function mfCinematicSyncService(){
    var row=document.getElementById('mfBldServiceActions'),repair=document.getElementById('bp_repair');
    var recycle=document.getElementById('bp_sell'),panels=[document.getElementById('prodMenu'),document.getElementById('bldMenu2')];
    if(row){
      mfCinSetClass(row,'mfCinematicServiceStrip');
      mfCinSetAttr(row,'data-mf-hud-role','service-controls');
      mfCinSetAttr(row,'data-mf-service-state',repair&&repair.getAttribute('data-state')||'unavailable');
      mfCinSetAttr(row,'data-mf-recycle-armed',recycle&&recycle.getAttribute('data-armed')||'false');
    }
    if(repair){mfCinSetClass(repair,'mfCinematicServiceRepair');mfCinSetAttr(repair,'data-mf-hud-role','service-repair');}
    if(recycle){mfCinSetClass(recycle,'mfCinematicServiceRecycle');mfCinSetAttr(recycle,'data-mf-hud-role','service-recycle');}
    for(var i=0;i<panels.length;i++){
      if(!panels[i])continue;
      panels[i].removeAttribute('data-mf-service-state');
      if(row&&row.parentElement===panels[i])mfCinSetAttr(panels[i],'data-mf-service-state',row.getAttribute('data-mf-service-state'));
    }
  }
  function mfCinematicSyncTransmission(){
    var tx=document.getElementById('cmdrTx'),who=document.getElementById('cmdrTxWho');if(!tx)return;
    /* Commander portraits belong to their own faction. Only the neutral UGA
       guide may put UGA in the shared receiver chrome. */
    var link=who&&String(who.textContent||'').trim().toUpperCase()==='KEEL'?'uga-keel':'command';
    if(tx.getAttribute('data-mf-link')!==link)mfCinSetAttr(tx,'data-mf-link',link);
  }
  function mfCinematicInlineVisible(id){
    var el=document.getElementById(id);return !!(el&&!el.hidden&&el.style.display!=='none');
  }
  function mfCinematicSyncVisibility(){
    var body=document.body,secondary='none',rows=['tacRow','grpRow','hotSlots','camRow'];
    for(var i=0;i<rows.length;i++)if(mfCinematicInlineVisible(rows[i])){secondary=rows[i];break;}
    var tx=document.getElementById('minimapWrap'),transmitting=!!(tx&&tx.dataset.transmission);
    var consumables=mfCinematicInlineVisible('consHud'),mode=mfCinematicInlineVisible('modeBtn');
    mfCinSetAttr(body,'data-mf-hud-secondary',secondary);
    mfCinToggleClass(body,'mfHudSecondaryOpen',secondary!=='none');
    mfCinToggleClass(body,'mfHudPlatoonsOpen',secondary==='grpRow');
    mfCinToggleClass(body,'mfHudConsumablesOpen',consumables);
    mfCinToggleClass(body,'mfHudModeOpen',mode);
    mfCinToggleClass(body,'mfHudTransmissionOpen',transmitting);
  }
  function mfCinematicDecorateBaseFinder(){
    var panel=document.getElementById('baseFinder');if(!panel)return;
    mfCinSetClass(panel,'mfCinematicDecorated');mfCinSetAttr(panel,'data-mf-hud-role','base-finder');
    var tabs=panel.querySelector('.baseFindTabs');if(tabs)mfCinSetAttr(tabs,'data-mf-hud-role','base-finder-tabs');
    mfCinematicMarkVector(panel.querySelector('.baseFindBack'),'prev');
    var finderIcons={all:'buildings',economy:'economy',production:'factory',defence:'shield',support:'support'};
    panel.querySelectorAll('.baseFindTabs [data-f]').forEach(function(btn){
      mfCinematicMarkVector(btn.querySelector('span')||btn,finderIcons[btn.getAttribute('data-f')]||'buildings');
    });
    var cards=panel.querySelectorAll('.baseFindCard:not(.mfCinematicDecorated)');
    for(var i=0;i<cards.length;i++){
      var card=cards[i],type=card.getAttribute('data-btype'),art=card.querySelector('.baseFindIcon'),copy=card.querySelector('.baseFindCopy');
      mfCinSetClass(card,'mfCinematicDecorated');mfCinSetAttr(card,'data-mf-hud-role','base-building-card');
      if(copy)mfCinSetClass(copy,'mfBaseFinderCopy');
      if(!art)continue;
      mfCinSetClass(art,'mfBaseFinderArt');mfCinSetAttr(art,'aria-hidden','true');
      if(typeof bldIconEl!=='function'||!type)continue;
      try{
        var icon=bldIconEl(type,52,typeof playerKitKey==='function'?playerKitKey():undefined);
        if(icon){mfCinSetClass(icon,'mfBaseFinderModel');art.replaceChildren(icon);}
      }catch(e){/* Keep the authored emoji when runtime art is unavailable. */}
    }
  }
  var mfCinematicSyncFrame=0,mfCinematicWatch=null,mfCinematicFinderSeen=new WeakSet(),mfCinematicIconSeen=new WeakSet(),
    mfCinematicCategoryRows=[];
  function mfCinematicUpdateCategoryOverflow(row){
    if(!row)return;
    var overflow=row.clientWidth>0&&row.scrollWidth>row.clientWidth+2,state='none';
    if(overflow){
      var atStart=row.scrollLeft<=2,atEnd=row.scrollLeft+row.clientWidth>=row.scrollWidth-2;
      state=atStart?'start':atEnd?'end':'middle';
    }
    mfCinSetAttr(row,'data-mf-overflow',state);
    if(!row.getAttribute('aria-label'))mfCinSetAttr(row,'aria-label',row.id==='prodTabs'?'Production categories':'Structure categories');
  }
  function mfCinematicSyncCategoryOverflow(){
    ['buildTabs','prodTabs'].forEach(function(id){
      var row=document.getElementById(id);if(!row)return;
      if(!row._mfCinematicOverflowHandler){
        row._mfCinematicOverflowHandler=function(){mfCinematicUpdateCategoryOverflow(row);};
        row.addEventListener('scroll',row._mfCinematicOverflowHandler,{passive:true});
        mfCinematicCategoryRows.push(row);
      }
      mfCinematicUpdateCategoryOverflow(row);
    });
  }
  function mfCinematicObserveDynamic(){
    var finder=document.getElementById('baseFinder');
    if(!mfCinematicWatch||!finder||mfCinematicFinderSeen.has(finder))return;
    mfCinematicFinderSeen.add(finder);
    mfCinematicWatch.observe(finder,{subtree:true,childList:true});
  }
  function mfCinematicObserveIconHosts(){
    if(!mfCinematicWatch)return;
    ['cmdbar','unitCard','selInfo','infMeter','goalBar','hazChip','atkAlert','waveAlert','mfMassAlert','deployBtn','consHud','heroRankEm','cmdrTx'].forEach(function(id){
      var el=document.getElementById(id);if(!el||mfCinematicIconSeen.has(el))return;
      mfCinematicIconSeen.add(el);mfCinematicWatch.observe(el,{subtree:true,childList:true,characterData:true});
    });
  }
  function mfCinematicSync(){
    mfCinematicSyncFrame=0;
    mfCinematicEnsureStructure();mfCinematicSyncContext();mfCinematicSyncDeck();
    mfCinematicSyncService();mfCinematicSyncTransmission();mfCinematicSyncVisibility();mfCinematicDecorateCommandIcons();mfCinematicDecorateVectorIcons();
    mfCinematicSyncModeIcon();mfCinematicDecorateBaseFinder();mfCinematicDecorateStateIcons();mfCinematicSyncCategoryOverflow();
    mfCinematicObserveDynamic();mfCinematicObserveIconHosts();
  }
  function mfCinematicQueueSync(){
    if(!mfCinematicSyncFrame)mfCinematicSyncFrame=requestAnimationFrame(mfCinematicSync);
  }
  mfCinematicRestoreLegacyGoalCopy();mfCinematicEnsureStructure();mfCinematicSync();
  mfCinematicWatch=new MutationObserver(mfCinematicQueueSync);
  /* Body-wide subtree observation turns changing resource numerals into a
     synthetic 60 Hz layout loop. Direct children catch the lazily appended
     Base Finder; only the two small authority surfaces need deep observation. */
  mfCinematicWatch.observe(document.body,{childList:true});
  var mfCinematicContext=document.getElementById('mfCinematicContext');
  if(mfCinematicContext)mfCinematicWatch.observe(mfCinematicContext,{subtree:true,childList:true,attributes:true,
    attributeFilter:['style','class','hidden','data-state','data-armed']});
  var mfCinematicDeckTabs=document.getElementById('hudDeckTabs');
  if(mfCinematicDeckTabs)mfCinematicWatch.observe(mfCinematicDeckTabs,{subtree:true,attributes:true,
    attributeFilter:['class','aria-selected','disabled']});
  var mfCinematicModeBtn=document.getElementById('modeBtn');
  if(mfCinematicModeBtn)mfCinematicWatch.observe(mfCinematicModeBtn,{subtree:true,childList:true,characterData:true});
  mfCinematicObserveDynamic();
  mfCinematicObserveIconHosts();
  /* Observe this target last. observe() updates an existing registration, so
     the generic icon-host pass above must not erase the style/state filter. */
  var mfCinematicCommandDock=document.getElementById('cmdbar');
  if(mfCinematicCommandDock)mfCinematicWatch.observe(mfCinematicCommandDock,{subtree:true,childList:true,characterData:true,attributes:true,
    attributeFilter:['style','class','hidden','aria-expanded','aria-selected','disabled','data-transmission','data-state']});
  function mfCinematicAuthoritySnapshot(selector,role,optional){
    var nodes=document.querySelectorAll(selector),node=nodes.length===1?nodes[0]:null;
    var actual=node&&node.getAttribute('data-mf-hud-role')||'';
    var one=nodes.length===1,roleOk=one&&actual===role;
    return {selector:selector,count:nodes.length,duplicateCount:Math.max(0,nodes.length-1),one:one,
      ownerId:node&&node.id||'',tag:node&&node.tagName||'',role:actual,roleOk:roleOk,optional:!!optional,
      ok:optional&&nodes.length===0||one&&roleOk};
  }
  window.MFCinematicHud=Object.freeze({
    sync:mfCinematicSync,
    destroy:function(){
      if(mfCinematicSyncFrame)cancelAnimationFrame(mfCinematicSyncFrame);
      mfCinematicSyncFrame=0;
      if(mfCinematicWatch)mfCinematicWatch.disconnect();
      mfCinematicWatch=null;
      for(var i=0;i<mfCinematicCategoryRows.length;i++){
        var row=mfCinematicCategoryRows[i],handler=row&&row._mfCinematicOverflowHandler;
        if(row&&handler){row.removeEventListener('scroll',handler);delete row._mfCinematicOverflowHandler;}
      }
      mfCinematicCategoryRows=[];
    },
    snapshot:function(){
      var context=document.getElementById('mfCinematicContext'),tabs=document.getElementById('hudDeckTabs');
      var authority={
        inbox:mfCinematicAuthoritySnapshot('#inboxHudBtn','inbox-command',false),
        speed:mfCinematicAuthoritySnapshot('#spdBtn','speed-command',false),
        pause:mfCinematicAuthoritySnapshot('#menuBtn','pause-command',false),
        minimap:mfCinematicAuthoritySnapshot('#minimap','minimap-command',false),
        missionStatus:mfCinematicAuthoritySnapshot('#goalBar','mission-status',false),
        missionAction:mfCinematicAuthoritySnapshot('#goalDetailBtn','mission-command',false),
        deckTabs:mfCinematicAuthoritySnapshot('#hudDeckTabs','deck-tabs',false),
        ordersTab:mfCinematicAuthoritySnapshot('#hudDeckTabs .hudDeckBtn[data-deck="orders"]','deck-command',false),
        platoonsTab:mfCinematicAuthoritySnapshot('#hudDeckTabs .hudDeckBtn[data-deck="platoons"]','deck-command',false),
        buildingsTab:mfCinematicAuthoritySnapshot('#hudDeckTabs .hudDeckBtn[data-deck="buildings"]','deck-command',false),
        abilitiesTab:mfCinematicAuthoritySnapshot('#hudDeckTabs .hudDeckBtn[data-deck="abilities"]','deck-command',false),
        viewTab:mfCinematicAuthoritySnapshot('#hudDeckTabs .hudDeckBtn[data-deck="view"]','deck-command',false),
        army:mfCinematicAuthoritySnapshot('#armyBtn','select-army-command',false),
        idleBuilders:mfCinematicAuthoritySnapshot('#idleBuilderBtn','select-idle-builders-command',false),
        boxSelect:mfCinematicAuthoritySnapshot('#boxBtn','box-select-command',false),
        stop:mfCinematicAuthoritySnapshot('#stopBtn','stop-command',false),
        repair:mfCinematicAuthoritySnapshot('#bp_repair','service-repair',true),
        recycle:mfCinematicAuthoritySnapshot('#bp_sell','service-recycle',false),
        build:mfCinematicAuthoritySnapshot('#buildBtn','build-command',false),
        patrol:mfCinematicAuthoritySnapshot('#patrolBtn','patrol-command',false),
        hold:mfCinematicAuthoritySnapshot('#holdBtn','hold-command',false),
        formation:mfCinematicAuthoritySnapshot('#formBtn','formation-command',false),
        attackMove:mfCinematicAuthoritySnapshot('#moveBtn','attack-move-command',false),
        clearSelection:mfCinematicAuthoritySnapshot('#clearBtn','clear-selection-command',false),
        rotateLeft:mfCinematicAuthoritySnapshot('#rotL','rotate-left-command',false),
        zoomIn:mfCinematicAuthoritySnapshot('#zoomIn','zoom-in-command',false),
        tilt:mfCinematicAuthoritySnapshot('#tiltBtn','tilt-command',false),
        zoomOut:mfCinematicAuthoritySnapshot('#zoomOut','zoom-out-command',false),
        rotateRight:mfCinematicAuthoritySnapshot('#rotR','rotate-right-command',false),
        waypoint:mfCinematicAuthoritySnapshot('#queueBtn','waypoint-command',true),
        rally:mfCinematicAuthoritySnapshot('#rallyBtn','rally-command',false),
        repeat:mfCinematicAuthoritySnapshot('#repeatBtn','repeat-command',false),
        upgrade:mfCinematicAuthoritySnapshot('#upBtn','production-upgrade',false),
        hero:mfCinematicAuthoritySnapshot('#heroBar','commander-profile',false),
        groups:mfCinematicAuthoritySnapshot('#mfCinematicGroupPalette','group-palette',false),
        feed:mfCinematicAuthoritySnapshot('#noticeLogBtn','event-feed-control',false),
        transmission:mfCinematicAuthoritySnapshot('#cmdrTx','command-transmission',false),
        hotslots:mfCinematicAuthoritySnapshot('#hotSlots','abilities-deck',false),
        utility:mfCinematicAuthoritySnapshot('#hotUtilityPanel','utility-drawer',true),
        baseFinder:mfCinematicAuthoritySnapshot('#baseFinder','base-finder',true)
      };
      var authorityOk=true,authorityDuplicateCount=0,authorityFailures=[];
      for(var key in authority){
        authorityDuplicateCount+=authority[key].duplicateCount;
        if(!authority[key].ok){authorityOk=false;authorityFailures.push(key);}
      }
      return {ready:document.body.classList.contains('mf-cinematic-hud'),
        surface:context&&context.getAttribute('data-active-surface')||'none',
        deck:tabs&&tabs.getAttribute('data-active-deck')||'orders',
        secondary:document.body.getAttribute('data-mf-hud-secondary')||'none',
        repairCount:authority.repair.count,recycleCount:authority.recycle.count,
        buildCount:authority.build.count,rallyCount:authority.rally.count,repeatCount:authority.repeat.count,
        upgradeCount:authority.upgrade.count,heroCount:authority.hero.count,groupsCount:authority.groups.count,
        feedCount:authority.feed.count,hotslotsCount:authority.hotslots.count,baseFinderCount:authority.baseFinder.count,
        authorityOk:authorityOk,authorityDuplicateCount:authorityDuplicateCount,authorityFailures:authorityFailures,authority:authority,
        heroAuthorityHidden:!!(document.getElementById('heroRow')&&document.getElementById('heroRow').style.visibility==='hidden')};
    }
  });
  window.dispatchEvent(new CustomEvent('massfront-cinematic-hud-ready'));
})();
