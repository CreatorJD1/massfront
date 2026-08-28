/* ============================================================================
   SOCIAL COMMAND — visible friends, requests, direct chat and presence

   The authenticated transport lives in authportal.js. This module is only a
   renderer/controller over MFSocial and never calls the Worker directly. In
   particular, no control becomes live until the server capability handshake
   returns a literal true for that feature. Staging lobbies and invitations are
   useful independently; realtime battle relay remains a separate capability.
   ============================================================================ */
(function(){
  'use strict';
  const SOCIAL_OFFLINE="You're offline — Social Command is read-only until your connection returns.";
  const S={tab:'friends',busy:false,epoch:0,threadEpoch:0,session:'',connection:'idle',caps:null,reason:'',friends:[],incoming:[],
    presence:{},selected:'',messages:[],messageDraft:'',messageBusy:false,presenceSelf:'online',
    lobby:null,lobbyInvites:[],lobbyBusy:false,lobbyDraft:{mode:'coop',slots:4}};
  const q=id=>document.getElementById(id);
  const signedIn=()=>!!(window.MFSocial&&typeof MFSocial.signedIn==='function'&&MFSocial.signedIn());
  const caps=()=>window.MFSocial&&typeof MFSocial.capabilities==='function'
    ?MFSocial.capabilities():{handshake:false,friends:false,chat:false,presence:false,lobbies:false,invites:false,realtimeMatch:false,multiplayer:false};
  const offline=()=>typeof navigator!=='undefined'&&navigator.onLine===false;
  const say=m=>{ if(typeof toast==='function') try{ toast(String(m||'')); }catch(e){} };
  const safeName=v=>{
    let s=String(v==null?'':v),out='';
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      if(c<32||c===127||(c>=0x202a&&c<=0x202e)||(c>=0x2066&&c<=0x2069))continue;
      out+=s.charAt(i);
    }
    return (out.trim().slice(0,32)||'Commander');
  };
  function sessionStamp(){
    if(!signedIn())return 'signed-out';
    try{
      const p=typeof MFSocial.probe==='function'?MFSocial.probe():null;
      if(p&&Number.isFinite(Number(p.sessionEpoch)))return 'session:'+Number(p.sessionEpoch);
    }catch(e){}
    return 'signed-in';
  }
  function syncSession(){
    const stamp=sessionStamp();
    if(stamp===S.session)return false;
    S.session=stamp;S.epoch++;S.threadEpoch++;S.busy=false;S.messageBusy=false;S.lobbyBusy=false;
    S.caps=null;S.reason='';S.connection=stamp==='signed-out'?'signed-out':'idle';
    S.friends=[];S.incoming=[];S.presence={};S.selected='';S.messages=[];S.messageDraft='';S.lobby=null;S.lobbyInvites=[];
    return true;
  }
  function socialFailure(e){
    const raw=String(e&&e.message||e||'').trim();
    if(offline()||/offline|network|failed to fetch|abort/i.test(raw))
      return {ok:false,code:'offline',message:SOCIAL_OFFLINE};
    return {ok:false,code:'client',message:'Social Command could not complete that request. Your game is unaffected.'};
  }
  async function socialCall(method,...args){
    const api=window.MFSocial,fn=api&&api[method];
    if(typeof fn!=='function')return {ok:false,code:'unavailable',message:'This build has no compatible social client.'};
    if(offline())return {ok:false,code:'offline',message:SOCIAL_OFFLINE};
    try{
      const out=await fn.apply(api,args);
      return out&&typeof out==='object'?out:{ok:false,code:'bad_response',message:'The social service returned an invalid response.'};
    }catch(e){return socialFailure(e);}
  }
  function transportReason(){
    return offline()||S.connection==='offline'?(S.reason||SOCIAL_OFFLINE):'';
  }
  function noteTransportFailure(r){
    if(!r||r.ok)return;
    const code=String(r.code||'');
    if(code!=='offline'&&code!=='network'&&code!=='timeout'&&code!=='unavailable'&&code!=='client')return;
    S.reason=r.message||SOCIAL_OFFLINE;
    S.connection=code==='offline'||code==='network'?'offline':'limited';
  }
  function bind(el,fn){
    if(!el||el.dataset.mfSocialBound==='1')return;
    el.dataset.mfSocialBound='1';
    if(typeof mfBindTap==='function')mfBindTap(el,fn);else el.addEventListener('click',fn);
  }
  function button(label,fn,cls,disabled,reason){
    const b=document.createElement('button');b.type='button';b.className=cls||'socialAction';
    b.textContent=label;b.disabled=!!disabled;b.setAttribute('aria-disabled',disabled?'true':'false');
    if(reason){b.title=reason;b.setAttribute('aria-label',label+' — '+reason);}
    if(!disabled)bind(b,fn);return b;
  }
  function line(title,body,tone){
    const d=document.createElement('div');d.className='socialNotice'+(tone?' '+tone:'');
    const b=document.createElement('b');b.textContent=title;d.appendChild(b);
    const s=document.createElement('span');s.textContent=body;d.appendChild(s);return d;
  }
  function injectStyle(){
    if(q('mfSocialStyle'))return;
    const st=document.createElement('style');st.id='mfSocialStyle';st.textContent=`
#socialScr{background:linear-gradient(180deg,#08111ee8,#03070df8);z-index:105;align-items:center;justify-content:flex-start!important;padding:0!important;overflow:hidden}
#socialScr .socialBody{flex:1 1 auto;min-height:0;width:min(100%,920px);max-width:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:10px calc(var(--sar) + 12px) 24px calc(var(--sal) + 12px)}
#socialScr .screenTabs{width:min(calc(100% - var(--sal) - var(--sar) - 20px),720px)}
#socialScr .socialPane{display:none;width:100%;min-width:0}#socialScr .socialPane.on{display:block}.socialStack{display:grid;gap:10px;min-width:0}
.socialNotice,.socialCard{border:1px solid #24445a;background:linear-gradient(145deg,#0d1b29,#08121d);box-shadow:inset 0 1px #ffffff0a;padding:13px;border-radius:4px;color:#8ba8bb}
.socialNotice{display:flex;min-width:0;flex-direction:column;gap:4px;line-height:1.4;text-align:left}.socialNotice b,.socialCard h3{margin:0;color:#d7edfa;font:800 11px var(--fT);letter-spacing:.12em}.socialNotice span{font-size:11px;overflow-wrap:anywhere}.socialNotice.good{border-color:#255d4b}.socialNotice.warn{border-color:#72552b}.socialNotice.bad{border-color:#6c3036}
.socialToolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.socialToolbar input,.socialToolbar select,.socialComposer textarea,.socialJoin input{min-height:44px;box-sizing:border-box;border:1px solid #31566d;background:#07101a;color:#e8f6ff;border-radius:3px;padding:9px 11px;font:700 12px system-ui,sans-serif;outline:none}.socialToolbar input:focus,.socialToolbar select:focus,.socialComposer textarea:focus{border-color:#63cce8;box-shadow:0 0 0 2px #63cce82a}.socialToolbar input{flex:1 1 180px;min-width:0}.socialToolbar select{flex:1 1 130px}
.socialAction{min-height:44px;min-width:44px;border:1px solid #4082a2;background:linear-gradient(#15334a,#0b2133);color:#dff7ff;border-radius:3px;padding:0 13px;font:900 10px var(--fT);letter-spacing:.08em}.socialAction.alt{border-color:#405565;background:#101b25;color:#a9c1d0}.socialAction.danger{border-color:#713842;color:#e8a7ae}.socialAction:disabled{filter:saturate(.35);opacity:.52;color:#80919c;cursor:not-allowed}.socialAction:not(:disabled):active{transform:scale(.97)}
.socialSectionTitle{display:flex;align-items:center;justify-content:space-between;margin:14px 2px 7px;color:#78cce4;font:900 10px var(--fT);letter-spacing:.16em}.socialCount{display:inline-grid;place-items:center;min-width:21px;height:21px;border-radius:11px;background:#183448;color:#bceeff;font-size:9px}
.socialPerson{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:9px;align-items:center;min-height:58px;border:1px solid #1c3547;background:#08131e;padding:7px 8px;margin-bottom:6px}.socialPresence{width:9px;height:9px;border-radius:50%;background:#53616a;box-shadow:0 0 0 2px #071019}.socialPresence.online{background:#5be69f;box-shadow:0 0 8px #5be69f88}.socialPresence.away{background:#e2bd58;box-shadow:0 0 8px #e2bd5888}.socialWho{min-width:0}.socialWho b{display:block;color:#e4f5ff;font:800 12px var(--fT);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.socialWho span{display:block;color:#7795a8;font-size:10px;margin-top:3px}.socialActs{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.socialActs .socialAction{min-height:44px;padding:0 9px;font-size:9px}
.socialThreadHead{display:flex;align-items:center;gap:8px;margin-bottom:9px}.socialThreadHead b{flex:1;color:#dff6ff;font:900 12px var(--fT);letter-spacing:.08em}.socialMessages{display:flex;flex-direction:column;gap:7px;min-height:150px;max-height:45vh;overflow-y:auto;padding:9px;border:1px solid #1d3749;background:#040b12}.socialBubble{align-self:flex-start;max-width:84%;border:1px solid #2b495d;background:#0d1a25;color:#d7e9f2;border-radius:4px;padding:8px 10px;font-size:12px;line-height:1.4;overflow-wrap:anywhere}.socialBubble.mine{align-self:flex-end;border-color:#27634f;background:#0d261f}.socialBubble small{display:block;margin-top:4px;color:#66889e;font-size:9px}.socialComposer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:8px}.socialComposer textarea{min-height:62px;resize:vertical}.socialComposer .socialAction{height:100%}
.socialLobbyGrid{display:grid;grid-template-columns:1fr;gap:10px;min-width:0}.socialLobbyGrid>.socialNotice{grid-column:1/-1}.socialCard{min-width:0;text-align:left}.socialContract{margin:10px 0 0;padding-left:18px;color:#88a6b9;font-size:11px;line-height:1.55}.socialJoin{display:flex;gap:8px;margin-top:10px}.socialJoin input{flex:1;min-width:0}.socialCreate{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;margin-top:10px}.socialCreate select{width:100%;min-height:44px;border:1px solid #31566d;background:#07101a;color:#e8f6ff;border-radius:3px;padding:9px 11px;font:700 11px system-ui,sans-serif}
.socialInvite{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid #1c3547;background:#08131e;padding:8px;margin-top:7px}.socialInvite .socialNotice{padding:8px}.socialInvite .socialActs{justify-content:flex-end}
#socialStatusDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#53616a;margin-left:4px;vertical-align:middle}.socialReady #socialStatusDot{background:#5be69f;box-shadow:0 0 7px #5be69f99}.socialLimited #socialStatusDot{background:#e2bd58}.socialOffline #socialStatusDot{background:#d77a4a;box-shadow:0 0 7px #d77a4a88}
@media(min-width:760px){.socialLobbyGrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.socialPane{padding:0 8px}}
@media(max-width:520px){.socialInvite{grid-template-columns:1fr}.socialInvite .socialActs{justify-content:stretch}.socialInvite .socialAction{flex:1}.socialCreate{grid-template-columns:1fr 1fr}.socialCreate .socialAction{grid-column:1/-1}}
@media(max-width:410px){.socialActs{grid-column:1/-1;justify-content:stretch}.socialActs .socialAction{flex:1}.socialPerson{grid-template-columns:12px minmax(0,1fr)}.socialPresence{grid-row:1}.socialWho{grid-column:2}.socialComposer{grid-template-columns:1fr}.socialComposer .socialAction{min-height:48px}.socialAction{padding-left:10px;padding-right:10px}.socialJoin{display:grid;grid-template-columns:1fr}.socialJoin .socialAction{width:100%}}
@media(orientation:landscape) and (max-height:560px){#socialScr .socialBody{padding-top:5px;padding-bottom:8px}.socialMessages{max-height:32vh}}
`;
    document.head.appendChild(st);
  }
  function ensureShell(){
    injectStyle();
    let menu=q('socialBtn');
    if(!menu){
      const strip=document.querySelector('#startScreen .menuStrip');
      if(strip){menu=document.createElement('button');menu.type='button';menu.className='sbtn';menu.id='socialBtn';
        menu.innerHTML='<span class="sEmj">◉</span><span>Social <i id="socialStatusDot" aria-hidden="true"></i></span>';
        menu.setAttribute('aria-label','Friends, chat and multiplayer lobby');strip.appendChild(menu);}
    }
    let scr=q('socialScr');
    if(!scr){
      scr=document.createElement('div');scr.className='overlay';scr.id='socialScr';scr.style.display='none';
      scr.innerHTML='<div class="subMenuHead"><h2>◉ SOCIAL COMMAND</h2><span>Friends · direct comms · player lobby</span></div>'+
        '<div class="screenTabs" role="tablist" aria-label="Social categories">'+
        '<button id="socialTabFriends" class="screenTabBtn on" type="button" role="tab" data-social-tab="friends" aria-selected="true" aria-controls="socialPaneFriends"><span class="tabGlyph">♟</span><span>FRIENDS</span></button>'+
        '<button id="socialTabChat" class="screenTabBtn" type="button" role="tab" data-social-tab="chat" aria-selected="false" aria-controls="socialPaneChat" tabindex="-1"><span class="tabGlyph">✉</span><span>CHAT</span></button>'+
        '<button id="socialTabLobby" class="screenTabBtn" type="button" role="tab" data-social-tab="lobby" aria-selected="false" aria-controls="socialPaneLobby" tabindex="-1"><span class="tabGlyph">⌂</span><span>LOBBY</span></button></div>'+
        '<div class="socialBody"><section class="socialPane on" id="socialPaneFriends" role="tabpanel" aria-labelledby="socialTabFriends"></section><section class="socialPane" id="socialPaneChat" role="tabpanel" aria-labelledby="socialTabChat" hidden></section><section class="socialPane" id="socialPaneLobby" role="tabpanel" aria-labelledby="socialTabLobby" hidden></section></div>'+
        '<div class="warFoot"><button class="mbtn alt" id="socialBack">◀ &nbsp;BACK</button></div>';
      document.body.appendChild(scr);
    }
    bind(menu,open);
    bind(q('socialBack'),()=>{if(typeof sfx==='function')sfx('ui');if(typeof showFrontScreen==='function')showFrontScreen('startScreen');});
    scr.querySelectorAll('[data-social-tab]').forEach(b=>bind(b,()=>setTab(b.dataset.socialTab)));
    const tabs=scr.querySelector('.screenTabs');
    if(tabs&&tabs.dataset.mfSocialKeys!=='1'){
      tabs.dataset.mfSocialKeys='1';
      tabs.addEventListener('keydown',e=>{
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;
        const list=[...tabs.querySelectorAll('[data-social-tab]')],at=Math.max(0,list.indexOf(document.activeElement));
        const next=e.key==='Home'?0:e.key==='End'?list.length-1:
          (at+(e.key==='ArrowRight'?1:list.length-1))%list.length;
        e.preventDefault();setTab(list[next].dataset.socialTab);list[next].focus();
      });
    }
    return scr;
  }
  function setTab(tab){
    S.tab=tab==='chat'||tab==='lobby'?tab:'friends';
    const scr=ensureShell();
    scr.querySelectorAll('[data-social-tab]').forEach(b=>{
      const on=b.dataset.socialTab===S.tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1;
    });
    for(const t of ['friends','chat','lobby']){
      const p=q('socialPane'+t.charAt(0).toUpperCase()+t.slice(1));if(p){const on=t===S.tab;p.classList.toggle('on',on);p.hidden=!on;}
    }
    render();
    if(S.tab==='chat'&&S.selected&&S.caps&&S.caps.chat===true&&!S.messages.length)loadMessages();
  }
  function open(tab){
    syncSession();
    if(tab==='friends'||tab==='chat'||tab==='lobby')S.tab=tab;
    ensureShell();if(typeof initAudio==='function')initAudio();if(typeof sfx==='function')sfx('ui');
    setTab(S.tab);
    if(typeof showFrontScreen==='function')showFrontScreen('socialScr');refresh(false);
  }
  function signedOut(host){
    host.appendChild(line('SIGN IN REQUIRED','Friends and direct messages use your MASSFRONT account. Solo play remains available without one.','warn'));
    host.appendChild(button('OPEN ACCOUNT',()=>{if(typeof apOpen==='function')apOpen(q('socialBtn'));else if(typeof showFrontScreen==='function')showFrontScreen('profileScr');}));
  }
  function capabilityReason(kind){
    if(!signedIn())return 'Sign in to use '+kind+'.';
    if(!S.caps||S.caps.handshake!==true)return S.reason||'The server has not confirmed social capabilities.';
    if(S.caps[kind]!==true)return kind==='chat'?'Friend chat is not enabled on this server.':kind==='presence'?'Friend presence is not enabled on this server.':'This server did not enable '+kind+'.';
    return '';
  }
  function connectionNotice(host){
    if(!host||!S.reason||!S.caps||S.caps.handshake!==true)return;
    host.appendChild(line(S.connection==='offline'?'OFFLINE · CACHED STATUS':'CONNECTION LIMITED',S.reason,'warn'));
  }
  function render(){
    syncSession();const scr=ensureShell(),body=scr.querySelector('.socialBody');
    if(body)body.setAttribute('aria-busy',(S.busy||S.messageBusy||S.lobbyBusy)?'true':'false');
    renderFriends();renderChat();renderLobby();renderInboxBridge();statusDot();
  }
  function statusDot(){
    const b=q('socialBtn');if(!b)return;b.classList.remove('socialReady','socialLimited','socialOffline');
    let state='Social status not checked';
    if(!signedIn())state='Sign in for friends, chat and lobbies';
    else if(S.connection==='offline'){b.classList.add('socialOffline');state='Offline · cached social status only';}
    else if(S.caps&&S.caps.handshake&&S.caps.friends){b.classList.add(S.caps.chat||S.caps.presence?'socialReady':'socialLimited');state=S.caps.chat?'Friends and chat ready':'Friends available · communication limited';}
    else if(S.reason){b.classList.add('socialLimited');state=S.reason;}
    b.title=state;b.setAttribute('aria-label','Friends, chat and player lobby — '+state);
  }
  function renderFriends(){
    const host=q('socialPaneFriends');if(!host)return;host.textContent='';const stack=document.createElement('div');stack.className='socialStack';host.appendChild(stack);
    if(!signedIn()){signedOut(stack);return;}
    if(S.busy&&!S.caps){stack.appendChild(line('CHECKING SOCIAL LINK','Confirming account access and server capabilities…'));return;}
    const friendReason=capabilityReason('friends');
    if(friendReason){stack.appendChild(line('FRIENDS UNAVAILABLE',friendReason,'warn'));stack.appendChild(button('RETRY',()=>refresh(true),'socialAction alt',S.busy));return;}
    connectionNotice(stack);const netOff=transportReason(),writeOff=S.busy||!!netOff;
    const bar=document.createElement('div');bar.className='socialToolbar';
    const input=document.createElement('input');input.id='socialAddName';input.type='text';input.inputMode='text';input.autocomplete='off';input.maxLength=16;input.placeholder='Exact username';input.setAttribute('aria-label','Exact friend username');bar.appendChild(input);
    input.disabled=writeOff;if(netOff)input.title=netOff;
    input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!writeOff){e.preventDefault();requestFriend(input.value);}});
    bar.appendChild(button('ADD FRIEND',()=>requestFriend(input.value),'socialAction',writeOff,netOff));stack.appendChild(bar);
    if(S.caps.presence===true){
      const pbar=document.createElement('div');pbar.className='socialToolbar';const sel=document.createElement('select');sel.id='socialPresenceSelect';sel.setAttribute('aria-label','Your presence');
      for(const x of [['online','ONLINE'],['away','AWAY'],['offline','OFFLINE']]){const o=document.createElement('option');o.value=x[0];o.textContent=x[1];o.selected=x[0]===S.presenceSelf;sel.appendChild(o);}pbar.appendChild(sel);
      sel.disabled=writeOff;pbar.appendChild(button('SET PRESENCE',()=>setPresence(sel.value),'socialAction alt',writeOff,netOff));stack.appendChild(pbar);
    }else stack.appendChild(line('PRESENCE OFF',capabilityReason('presence'),'warn'));
    sectionTitle(stack,'FRIEND REQUESTS',S.incoming.length);
    if(!S.incoming.length)stack.appendChild(line('NO PENDING REQUESTS','Add a commander by their exact username, or check again later.'));
    for(const r of S.incoming)stack.appendChild(person(r,'wants to join your friends list',true));
    sectionTitle(stack,'FRIENDS',S.friends.length);
    if(!S.friends.length)stack.appendChild(line('NO FRIENDS YET','Your accepted friends will appear here with chat and presence controls.'));
    for(const f of S.friends)stack.appendChild(person(f,presenceLabel(f.username),false));
    stack.appendChild(button(S.busy?'REFRESHING…':'REFRESH',()=>refresh(true),'socialAction alt',S.busy||!!netOff,netOff));
  }
  function sectionTitle(host,label,count){const h=document.createElement('div');h.className='socialSectionTitle';const s=document.createElement('span');s.textContent=label;h.appendChild(s);const c=document.createElement('span');c.className='socialCount';c.textContent=String(count);h.appendChild(c);host.appendChild(h);}
  function presenceLabel(name){const p=S.presence[String(name).toLowerCase()];return p?p.toUpperCase():'OFFLINE';}
  function person(row,sub,request){
    const d=document.createElement('div');d.className='socialPerson';const state=request?'offline':String(S.presence[String(row.username).toLowerCase()]||'offline');
    const dot=document.createElement('span');dot.className='socialPresence '+state;dot.setAttribute('aria-label',state);d.appendChild(dot);
    const who=document.createElement('div');who.className='socialWho';const b=document.createElement('b');b.textContent=safeName(row.username);who.appendChild(b);const s=document.createElement('span');s.textContent=sub;who.appendChild(s);d.appendChild(who);
    const acts=document.createElement('div');acts.className='socialActs';const netOff=transportReason();
    if(request){const off=S.busy||!!netOff;acts.appendChild(button('ACCEPT',()=>respond(row,true),'socialAction',off,netOff));acts.appendChild(button('DECLINE',()=>respond(row,false),'socialAction alt',off,netOff));}
    else{
      const chatOff=capabilityReason('chat')||netOff;acts.appendChild(button('CHAT',()=>selectFriend(row.username),'socialAction',!!chatOff,chatOff));
      const inviteOff=!S.lobby||!S.caps||S.caps.invites!==true||!!netOff;
      const inviteReason=netOff||(!S.lobby?'Create or join a lobby first.':'Lobby invitations are not enabled on this server.');
      acts.appendChild(button('INVITE',()=>inviteFriend(row.username),'socialAction alt',inviteOff,inviteOff?inviteReason:''));
      const blockOff=capabilityReason('blocking')||netOff;
      acts.appendChild(button('BLOCK',()=>blockFriend(row.username),'socialAction danger',S.busy||!!blockOff,blockOff));
    }
    d.appendChild(acts);return d;
  }
  function renderChat(){
    const host=q('socialPaneChat');if(!host)return;host.textContent='';const stack=document.createElement('div');stack.className='socialStack';host.appendChild(stack);
    if(!signedIn()){signedOut(stack);return;}const why=capabilityReason('chat');
    if(why){stack.appendChild(line('DIRECT CHAT UNAVAILABLE',why,'warn'));stack.appendChild(button('RECHECK CAPABILITIES',()=>refresh(true),'socialAction alt',S.busy));return;}
    connectionNotice(stack);const netOff=transportReason();
    if(!S.selected){stack.appendChild(line('CHOOSE A FRIEND','Direct chat is available only between accepted friends.'));
      for(const f of S.friends)stack.appendChild(person(f,presenceLabel(f.username),false));return;}
    const head=document.createElement('div');head.className='socialThreadHead';head.appendChild(button('‹ FRIENDS',()=>{S.threadEpoch++;S.messageBusy=false;S.selected='';S.messages=[];S.messageDraft='';renderChat();},'socialAction alt'));
    const who=document.createElement('b');who.textContent='DIRECT COMMS · '+safeName(S.selected);head.appendChild(who);head.appendChild(button('REFRESH',loadMessages,'socialAction alt',S.messageBusy||!!netOff,netOff));stack.appendChild(head);
    const box=document.createElement('div');box.id='socialMessageLog';box.className='socialMessages';box.setAttribute('role','log');box.setAttribute('aria-live','polite');
    if(S.messageBusy&&!S.messages.length)box.appendChild(line('LOADING THREAD','Fetching messages…'));
    else if(!S.messages.length)box.appendChild(line('NO MESSAGES','Start a private conversation with '+safeName(S.selected)+'.'));
    for(const m of S.messages){const bubble=document.createElement('div');bubble.className='socialBubble'+(m.mine?' mine':'');bubble.textContent=String(m.body||'').slice(0,2000);const at=document.createElement('small');const dt=new Date(Number(m.at)||0);at.textContent=(m.mine?'YOU':'FROM '+safeName(m.from))+(Number(m.at)?' · '+dt.toLocaleString():'');bubble.appendChild(at);box.appendChild(bubble);}stack.appendChild(box);
    const form=document.createElement('div');form.className='socialComposer';const ta=document.createElement('textarea');ta.id='socialMessageBody';ta.maxLength=500;ta.placeholder='Message '+safeName(S.selected);ta.setAttribute('aria-label','Direct message');ta.value=S.messageDraft;ta.disabled=!!netOff;if(netOff)ta.title=netOff;ta.addEventListener('input',()=>{S.messageDraft=ta.value;});form.appendChild(ta);form.appendChild(button('SEND',()=>sendMessage(ta),'socialAction',S.messageBusy||!!netOff,netOff));stack.appendChild(form);
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{const log=q('socialMessageLog');if(log)log.scrollTop=log.scrollHeight;});
  }
  function renderLobby(){
    const host=q('socialPaneLobby');if(!host)return;host.textContent='';const grid=document.createElement('div');grid.className='socialLobbyGrid';host.appendChild(grid);
    if(!signedIn()){signedOut(grid);return;}
    if(!S.caps||S.caps.lobbies!==true){grid.appendChild(line('PLAYER LOBBIES UNAVAILABLE',capabilityReason('lobbies'),'warn'));grid.appendChild(button('RECHECK CAPABILITIES',()=>refresh(true),'socialAction alt',S.busy));return;}
    connectionNotice(grid);const netOff=transportReason(),locked=S.lobbyBusy||!!netOff;
    const status=document.createElement('div');status.className='socialCard';const h=document.createElement('h3');h.textContent=S.lobby?'STAGING LOBBY · '+S.lobby.code:'PLAYER LOBBY';status.appendChild(h);
    if(!S.lobby){
      status.appendChild(line('NO ACTIVE LOBBY','Create a private staging room or enter a friend’s eight-character code.'));
      const create=document.createElement('div');create.className='socialCreate';
      const mode=document.createElement('select');mode.setAttribute('aria-label','Lobby mode');
      for(const x of [['coop','CO-OP'],['skirmish','SKIRMISH']]){const o=document.createElement('option');o.value=x[0];o.textContent=x[1];o.selected=S.lobbyDraft.mode===x[0];mode.appendChild(o);}mode.disabled=locked;mode.addEventListener('change',()=>{S.lobbyDraft.mode=mode.value==='skirmish'?'skirmish':'coop';});create.appendChild(mode);
      const slots=document.createElement('select');slots.setAttribute('aria-label','Lobby player slots');
      for(const n of [2,3,4]){const o=document.createElement('option');o.value=String(n);o.textContent=n+' PLAYERS';o.selected=S.lobbyDraft.slots===n;slots.appendChild(o);}slots.disabled=locked;slots.addEventListener('change',()=>{S.lobbyDraft.slots=Math.max(2,Math.min(4,Number(slots.value)||4));});create.appendChild(slots);
      create.appendChild(button(S.lobbyBusy?'CREATING…':'CREATE LOBBY',createLobby,'socialAction',locked,netOff));status.appendChild(create);
      const join=document.createElement('div');join.className='socialJoin';const input=document.createElement('input');input.maxLength=8;input.placeholder='Eight-character code';input.autocapitalize='characters';input.autocomplete='off';input.spellcheck=false;input.pattern='[A-Fa-f0-9]{8}';input.setAttribute('aria-label','Lobby code');input.disabled=locked;input.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,8);});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!locked){e.preventDefault();joinLobby(input.value);}});join.appendChild(input);join.appendChild(button('JOIN',()=>joinLobby(input.value),'socialAction',locked,netOff));status.appendChild(join);
    }else{
      const rule=S.lobby.rules||{},members=Array.isArray(S.lobby.members)?S.lobby.members:[];status.appendChild(line('RULES',String(rule.mode||'skirmish').toUpperCase()+' · '+String(rule.map||'auto').toUpperCase()+' · '+Number(rule.slots||2)+' SLOTS','good'));
      sectionTitle(status,'ROSTER',members.length);
      for(const m of members)status.appendChild(line((m.host?'★ ':'')+safeName(m.username)+(m.self?' · YOU':''),m.ready?'READY':'NOT READY',m.ready?'good':'warn'));
      const me=members.find(m=>m.self),acts=document.createElement('div');acts.className='socialToolbar';
      acts.appendChild(button(me&&me.ready?'NOT READY':'READY',()=>setLobbyReady(!(me&&me.ready)),'socialAction',locked,netOff));
      acts.appendChild(button('REFRESH',refreshLobby,'socialAction alt',locked,netOff));acts.appendChild(button('LEAVE',leaveLobby,'socialAction danger',locked,netOff));status.appendChild(acts);
      status.appendChild(S.caps.realtimeMatch===true
        ?line('REALTIME CAPABILITY CONFIRMED','This panel owns roster, invitations and ready state. Deployment remains in the existing battle flow.','good')
        :line('MATCH RELAY NOT CONNECTED','Roster and invitations are authoritative. Launch remains locked until the server advertises realtimeMatch.','warn'));
    }grid.appendChild(status);
    const invites=document.createElement('div');invites.className='socialCard';const ih=document.createElement('h3');ih.textContent='LOBBY INVITATIONS';invites.appendChild(ih);
    if(!S.caps.invites)invites.appendChild(line('INVITATIONS OFF',capabilityReason('invites'),'warn'));
    else if(!S.lobbyInvites.length)invites.appendChild(line('NO PENDING INVITES','Invitations from accepted friends will appear here.'));
    else for(const i of S.lobbyInvites){const row=document.createElement('div');row.className='socialInvite';row.appendChild(line('FROM '+safeName(i.from),'LOBBY '+i.code));const a=document.createElement('div');a.className='socialActs';a.appendChild(button('ACCEPT',()=>respondLobbyInvite(i,true),'socialAction',locked,netOff));a.appendChild(button('DECLINE',()=>respondLobbyInvite(i,false),'socialAction alt',locked,netOff));row.appendChild(a);invites.appendChild(row);}grid.appendChild(invites);
  }
  async function refresh(force){
    syncSession();const stamp=S.session,epoch=++S.epoch,priorCaps=S.caps;
    S.busy=true;S.reason='';S.connection=offline()?'offline':'checking';
    if(!signedIn()){S.caps=null;S.friends=[];S.incoming=[];S.busy=false;S.connection='signed-out';render();return;}
    render();const h=await socialCall('handshake',!!force);
    if(epoch!==S.epoch||stamp!==sessionStamp()){syncSession();render();return;}
    if(!h||!h.ok){
      const cached=priorCaps&&priorCaps.handshake===true&&(h&&h.code==='offline'||h&&h.code==='network'||h&&h.code==='timeout');
      S.caps=cached?priorCaps:null;S.reason=(h&&h.message)||'The server did not confirm social capabilities.';
      S.connection=h&&(h.code==='offline'||h.code==='network')?'offline':'limited';S.busy=false;render();return;
    }
    S.caps=h.capabilities||caps();
    if(S.caps.friends!==true){S.friends=[];S.incoming=[];}
    if(S.caps.presence!==true)S.presence={};
    if(S.caps.chat!==true){S.threadEpoch++;S.messageBusy=false;S.selected='';S.messages=[];S.messageDraft='';}
    if(S.caps.invites!==true)S.lobbyInvites=[];
    if(S.caps.lobbies!==true)S.lobby=null;
    const jobs=[];
    if(S.caps.friends===true)jobs.push(socialCall('friends').then(r=>({kind:'friends',r})));
    if(S.caps.presence===true)jobs.push(socialCall('presence').then(r=>({kind:'presence',r})));
    if(S.caps.invites===true)jobs.push(socialCall('lobbyInvites').then(r=>({kind:'lobbyInvites',r})));
    if(S.caps.lobbies===true&&S.lobby)jobs.push(socialCall('getLobby',S.lobby.id).then(r=>({kind:'lobby',r})));
    const rows=await Promise.all(jobs);if(epoch!==S.epoch||stamp!==sessionStamp()){syncSession();render();return;}
    let sawOffline=false;
    for(const x of rows){
      if(x.kind==='friends'&&x.r&&x.r.ok){S.friends=x.r.friends||[];S.incoming=x.r.incoming||[];}
      else if(x.kind==='presence'&&x.r&&x.r.ok){S.presence={};for(const p of x.r.friends||[])S.presence[String(p.username).toLowerCase()]=p.state;}
      else if(x.kind==='lobbyInvites'&&x.r&&x.r.ok)S.lobbyInvites=x.r.invites||[];
      else if(x.kind==='lobby'&&x.r&&x.r.ok)S.lobby=x.r.lobby;
      else if(x.r&&!x.r.ok){if(!S.reason)S.reason=x.r.message||'';if(x.r.code==='offline'||x.r.code==='network')sawOffline=true;}
    }
    S.connection=S.reason?(sawOffline?'offline':'limited'):'ready';S.busy=false;render();
  }
  async function requestFriend(name){
    if(S.busy||transportReason()||!S.caps||S.caps.friends!==true)return;
    S.busy=true;render();const r=await socialCall('request',name);S.busy=false;noteTransportFailure(r);
    say(r&&r.ok?'Friend request sent.':(r&&r.message)||'Could not send friend request.');if(r&&r.ok)refresh(true);else render();
  }
  async function respond(row,accept){
    if(S.busy||transportReason())return;S.busy=true;render();const r=await socialCall('respond',row.id,accept);S.busy=false;noteTransportFailure(r);
    say(r&&r.ok?(accept?'Friend request accepted.':'Friend request declined.'):(r&&r.message)||'Could not answer request.');if(r&&r.ok)refresh(true);else render();
  }
  async function blockFriend(name){
    if(S.busy||transportReason()||!S.caps||S.caps.blocking!==true)return;
    const go=async()=>{S.busy=true;render();const r=await socialCall('block',name);S.busy=false;noteTransportFailure(r);say(r&&r.ok?safeName(name)+' blocked.':(r&&r.message)||'Could not block player.');if(r&&r.ok)refresh(true);else render();};
    if(typeof accConfirm==='function')accConfirm('Block '+safeName(name)+'? This removes the friendship and pending requests.',go);else if(window.confirm('Block '+safeName(name)+'?'))go();
  }
  async function setPresence(value){
    if(S.busy||transportReason()||!S.caps||S.caps.presence!==true)return;S.busy=true;render();const r=await socialCall('setPresence',value);S.busy=false;noteTransportFailure(r);
    if(r&&r.ok){S.presenceSelf=r.state||value;say('Presence set to '+S.presenceSelf+'.');}else say((r&&r.message)||'Could not update presence.');render();
  }
  function selectFriend(name){S.threadEpoch++;S.messageBusy=false;S.selected=safeName(name);S.messages=[];S.messageDraft='';setTab('chat');}
  async function loadMessages(){
    if(S.messageBusy||transportReason()||!S.selected||!S.caps||S.caps.chat!==true)return;
    const target=S.selected,thread=++S.threadEpoch;S.messageBusy=true;renderChat();const r=await socialCall('messages',target,null,30);
    if(thread!==S.threadEpoch||target!==S.selected)return;S.messageBusy=false;noteTransportFailure(r);
    if(r&&r.ok)S.messages=r.messages||[];else say((r&&r.message)||'Could not load messages.');renderChat();renderInboxBridge();
  }
  async function sendMessage(input){
    if(S.messageBusy||transportReason()||!S.selected||!S.caps||S.caps.chat!==true)return;
    const target=S.selected,thread=S.threadEpoch,body=String(input&&input.value||S.messageDraft);S.messageDraft=body;S.messageBusy=true;renderChat();const r=await socialCall('sendMessage',target,body);
    if(thread!==S.threadEpoch||target!==S.selected)return;S.messageBusy=false;noteTransportFailure(r);
    if(r&&r.ok){S.messageDraft='';if(r.message)S.messages.push(r.message);say('Message sent.');}else say((r&&r.message)||'Could not send message.');renderChat();renderInboxBridge();
  }
  async function createLobby(){
    if(S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const rules={mode:S.lobbyDraft.mode,slots:S.lobbyDraft.slots,map:'auto'},r=await socialCall('createLobby',rules);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby){S.lobby=r.lobby;say('Lobby created · '+S.lobby.code);}else say((r&&r.message)||'Could not create lobby.');render();
  }
  async function joinLobby(code){
    if(S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('joinLobby',code);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby){S.lobby=r.lobby;say('Joined lobby '+S.lobby.code+'.');}else say((r&&r.message)||'Could not join lobby.');render();
  }
  async function refreshLobby(){
    if(!S.lobby||S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('getLobby',S.lobby.id);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby)S.lobby=r.lobby;else say((r&&r.message)||'Lobby is unavailable.');render();
  }
  async function setLobbyReady(ready){
    if(!S.lobby||S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('readyLobby',S.lobby.id,S.lobby.revision,ready);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby)S.lobby=r.lobby;else say((r&&r.message)||'Could not update ready state.');render();
  }
  async function leaveLobby(){
    if(!S.lobby||S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('leaveLobby',S.lobby.id,S.lobby.revision);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok){S.lobby=null;say('Left lobby.');}else say((r&&r.message)||'Could not leave lobby.');render();
  }
  async function inviteFriend(name){
    if(!S.lobby||S.lobbyBusy||transportReason()||!S.caps||S.caps.invites!==true)return;S.lobbyBusy=true;render();const r=await socialCall('inviteLobby',S.lobby.id,name);S.lobbyBusy=false;noteTransportFailure(r);
    say(r&&r.ok?'Lobby invitation sent to '+safeName(name)+'.':(r&&r.message)||'Could not send invitation.');render();
  }
  async function respondLobbyInvite(invite,accept){
    if(S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('respondLobbyInvite',invite.id,accept);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok){if(accept&&r.lobby)S.lobby=r.lobby;S.lobbyInvites=S.lobbyInvites.filter(i=>i.id!==invite.id);}
    say(r&&r.ok?(accept?'Lobby joined.':'Invitation declined.'):(r&&r.message)||'Could not answer invitation.');render();
  }
  function renderInboxBridge(){
    const host=q('inboxMessages');if(!host)return;host.textContent='';
    let title='DIRECT CHAT',body='Open Social Command to check friend chat availability.',tone='';
    if(!signedIn()){title='SIGN IN FOR DIRECT CHAT';body='Messages are available between accepted friends after you sign in.';tone='warn';}
    else if(S.connection==='offline'||offline()){title='DIRECT CHAT OFFLINE';body=S.reason||SOCIAL_OFFLINE;tone='warn';}
    else if(S.caps&&S.caps.handshake&&S.caps.chat===true){title='FRIEND CHAT READY';body=S.selected?(S.messages.length+' messages loaded with '+safeName(S.selected)+'.'):'Choose an accepted friend in Social Command.';tone='good';}
    else if(S.caps&&S.caps.handshake){title='CHAT NOT ENABLED';body=capabilityReason('chat');tone='warn';}
    else if(S.reason){title='CHAT STATUS UNCONFIRMED';body=S.reason;tone='warn';}
    host.appendChild(line(title,body,tone));host.appendChild(button('OPEN SOCIAL',()=>open('chat'),'socialAction alt'));
  }
  window.MFSocialUI={init:initSocialUIImpl,open,refresh,setTab,renderInboxMessages:renderInboxBridge,state:S};
  function initSocialUIImpl(){
    ensureShell();syncSession();
    if(typeof window!=='undefined'&&!window.__mfSocialNetworkBound){
      window.__mfSocialNetworkBound=true;
      window.addEventListener('offline',()=>{S.connection='offline';S.reason=SOCIAL_OFFLINE;render();});
      window.addEventListener('online',()=>{
        if(S.connection==='offline'){S.connection='limited';S.reason='Connection restored — refresh Social Command to sync current status.';render();}
      });
    }
    render();
  }
})();

function initSocialUI(){ if(window.MFSocialUI)window.MFSocialUI.init(); }
function mfSocialRenderInboxMessages(){ if(window.MFSocialUI)window.MFSocialUI.renderInboxMessages(); }
