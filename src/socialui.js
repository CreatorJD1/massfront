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
  const S={tab:'friends',busy:false,epoch:0,threadEpoch:0,session:'',connection:'idle',caps:null,reason:'',gate:'',friends:[],incoming:[],
    presence:{},selected:'',messages:[],messageDraft:'',messageBusy:false,presenceSelf:'online',
    worldMessages:[],worldDraft:'',worldBusy:false,worldProfile:'',
    handleBusy:false,handleError:'',
    onlinePlayers:null,onlineUpdatedAt:0,onlineBusy:false,
    lobby:null,lobbyInvites:[],lobbyBusy:false,lobbyDraft:{mode:'coop',slots:4},
    lobbyCompatibility:null,preparedMatch:null,launchReceipt:null};
  let lobbyPollBusy=false,lobbyPollTimer=null,onlinePollTimer=null,worldPollTimer=null;
  const q=id=>document.getElementById(id);
  const signedIn=()=>!!(window.MFSocial&&typeof MFSocial.signedIn==='function'&&MFSocial.signedIn());
  const identity=()=>{
    try{
      const v=window.MFSocial&&typeof MFSocial.identity==='function'?MFSocial.identity():null;
      const username=String(v&&v.username||'').trim();
      return {username:/^[a-z0-9_]{3,16}$/i.test(username)?username:'',hasUsername:/^[a-z0-9_]{3,16}$/i.test(username)};
    }catch(e){return {username:'',hasUsername:false};}
  };
  const caps=()=>window.MFSocial&&typeof MFSocial.capabilities==='function'
    ?MFSocial.capabilities():{handshake:false,friends:false,chat:false,worldChat:false,presence:false,onlineCount:false,lobbies:false,invites:false,matchLaunch:false,realtimeMatch:false,multiplayer:false};
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

  /* Realtime transport owns only protocol validation and deterministic command
     delivery. The existing input order functions are selection-bound and
     hard-code team 0, so they are not a safe remote-seat dispatcher. A match
     stays locked until a simulation module registers one typed applyTick seam. */
  const MR_PROTOCOL='massfront-match',MR_VERSION=1,MR_SUBPROTOCOL='massfront.v1';
  const MR_HASH_RE=/^[a-f0-9]{64}$/,MR_ID_RE=/^[a-f0-9]{32}$/,MR_CODE_RE=/^[a-z][a-z0-9_]{0,47}$/;
  function mrInt(v,min,max){const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;}
  function mrKeys(v,keys){return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));}
  function mrFreeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const k of Object.keys(v))mrFreeze(v[k]);}return v;}
  function mrCopy(v){return JSON.parse(JSON.stringify(v));}
  function mrBytes(v){try{return new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v)).byteLength;}catch(e){return Infinity;}}
  function mrCommandSafe(command){
    if(!command||typeof command!=='object'||Array.isArray(command)||!MR_CODE_RE.test(String(command.type||''))||
       /^(?:chat|message|text|voice)$/.test(String(command.type))||mrBytes(command)>2048)return false;
    const visit=(v,depth,key)=>{
      if(depth>4||/^(?:chat|message|text|body)$/i.test(String(key||'')))return false;
      if(v==null||typeof v==='boolean')return true;
      if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1e9;
      if(typeof v==='string')return v.length<=128&&!/[\u0000-\u001f\u007f]/.test(v);
      if(Array.isArray(v))return v.length<=64&&v.every(x=>visit(x,depth+1,''));
      if(typeof v==='object'){const keys=Object.keys(v);return keys.length<=32&&keys.every(k=>k.length<=48&&visit(v[k],depth+1,k));}
      return false;
    };
    return visit(command,0,'');
  }
  function mrBatch(raw){
    if(!Array.isArray(raw)||raw.length>32)return null;
    let priorSeat=0,priorSeq=0,total=0;const out=[];
    for(const row of raw){
      if(!mrKeys(row,['seat','seq','commands']))return null;
      const seat=mrInt(row.seat,1,4),seq=mrInt(row.seq,1,2147483647),commands=row.commands;
      if(seat==null||seq==null||!Array.isArray(commands)||!commands.length||commands.length>8||!commands.every(mrCommandSafe))return null;
      if(seat<priorSeat||(seat===priorSeat&&seq<=priorSeq)||(total+=commands.length)>64)return null;
      priorSeat=seat;priorSeq=seq;out.push({seat,seq,commands:mrCopy(commands)});
    }
    return out;
  }
  function createMatchRuntime(){
    let consumer=null,socket=null,socketSerial=0,state='idle',expected=null,account='',tick=0,seq=0;
    let started=false,ended=false,intentional=false,welcomeSeen=false,lastGeneration=0,resumeToken='';
    let graceMs=10000,graceDeadline=0,reconnectAttempt=0,reconnectTimer=null,welcomeTimer=null,inbound=Promise.resolve();
    let connectResolve=null,connectReject=null,pending=new Map(),hashTicks=new Set();
    const reconnectBackoff=[120,250,500,900,1400,2000];
    function snapshot(){return mrFreeze({state,matchId:expected&&expected.matchId||'',seat:expected&&expected.seat||0,
      tick,generation:lastGeneration,started,ended,pending:pending.size,consumer:!!consumer,reconnecting:state==='reconnecting'});}
    function emit(type,detail){
      const clean=mrFreeze(mrCopy(Object.assign({type},detail||{})));
      try{window.dispatchEvent(new CustomEvent('massfront-match:'+type,{detail:clean}));}catch(e){}
      return clean;
    }
    function setState(next,detail){state=next;emit('status',Object.assign({},snapshot(),detail||{}));try{render();}catch(e){}}
    function clearTimers(){if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}if(welcomeTimer){clearTimeout(welcomeTimer);welcomeTimer=null;}}
    function rejectConnect(code){if(connectReject){const fn=connectReject;connectResolve=connectReject=null;fn(Object.assign(new Error('Match runtime rejected the connection.'),{code}));}}
    function resolveConnect(){if(connectResolve){const fn=connectResolve;connectResolve=connectReject=null;fn(snapshot());}}
    function closeSocket(code,reason){const s=socket;socket=null;if(s)try{s.close(code,reason);}catch(e){}}
    function fatal(code,closeCode){
      if(ended&&state==='ended')return;
      intentional=true;ended=true;resumeToken='';clearTimers();setState('error',{code});emit('protocolError',{code});
      rejectConnect(code);closeSocket(closeCode||1002,closeCode===1011?'runtime unavailable':'protocol error');
    }
    function socketReady(){return !!socket&&socket.readyState===1;}
    function send(frame){
      if(!socketReady()||mrBytes(frame)>16384)return false;
      try{socket.send(JSON.stringify(frame));return true;}catch(e){return false;}
    }
    async function runtimeTuple(){
      if(typeof mfRuntimeCompatibility!=='function')return null;
      try{
        const v=await mfRuntimeCompatibility();
        return v&&typeof v.buildVersion==='string'&&MR_HASH_RE.test(v.manifestHash)&&MR_HASH_RE.test(v.balanceHash)
          ?{buildVersion:v.buildVersion,manifestHash:v.manifestHash,balanceHash:v.balanceHash}:null;
      }catch(e){return null;}
    }
    function baseFrame(v){return mrKeys(v,Object.keys(v))&&v.protocol===MR_PROTOCOL&&v.v===MR_VERSION&&typeof v.type==='string';}
    function sameAccount(){return account&&account===sessionStamp();}
    async function welcome(body,kind,serial){
      if(welcomeSeen||!mrKeys(body,['protocol','v','type','matchId','seat','tick','tickRate','inputDelay','reconnectGraceMs','resumed','resumeToken','generation','compatibility']))return fatal('invalid_welcome');
      const input=body.inputDelay,compat=body.compatibility,generation=mrInt(body.generation,1,2147483647),nextTick=mrInt(body.tick,0,2147483647);
      if(body.matchId!==expected.matchId||body.seat!==expected.seat||nextTick==null||body.tickRate!==30||
         !mrKeys(input,['min','max'])||input.min!==2||input.max!==3||body.reconnectGraceMs!==10000||
         body.resumed!==(kind==='resume')||!MR_HASH_RE.test(String(body.resumeToken||''))||generation==null||generation<=lastGeneration||
         !mrKeys(compat,['buildVersion','manifestHash','balanceHash','rulesHash'])||compat.buildVersion!==expected.buildVersion||
         compat.manifestHash!==expected.manifestHash||compat.balanceHash!==expected.balanceHash||compat.rulesHash!==expected.rulesHash)return fatal('welcome_mismatch');
      const current=await runtimeTuple();
      if(serial!==socketSerial)return;
      if(!sameAccount()||!current||current.buildVersion!==expected.buildVersion||current.manifestHash!==expected.manifestHash||
         current.balanceHash!==expected.balanceHash)return fatal('runtime_changed',1008);
      resumeToken=body.resumeToken;body.resumeToken='';lastGeneration=generation;tick=nextTick;graceMs=10000;
      graceDeadline=0;reconnectAttempt=0;welcomeSeen=true;if(welcomeTimer){clearTimeout(welcomeTimer);welcomeTimer=null;}
      setState(started?'running':'welcomed',{resumed:kind==='resume'});emit('welcome',{matchId:expected.matchId,seat:expected.seat,tick,
        tickRate:30,inputDelay:{min:2,max:3},reconnectGraceMs:graceMs,resumed:kind==='resume',generation,compatibility:mrCopy(compat)});
      resolveConnect();
    }
    async function sendStateHash(hashTick){
      if(typeof mfGameplayStateHash!=='function')return fatal('state_hash_unavailable',1011);
      let hash='';try{hash=String(await mfGameplayStateHash()||'');}catch(e){return fatal('state_hash_unavailable',1011);}
      if(!MR_HASH_RE.test(hash))return fatal('state_hash_invalid',1011);
      if(!send({protocol:MR_PROTOCOL,v:MR_VERSION,type:'stateHash',tick:hashTick,hash}))return fatal('state_hash_send_failed',1011);
      hashTicks.add(hashTick);for(const old of [...hashTicks])if(old<hashTick-60)hashTicks.delete(old);
    }
    function lifecycle(body){
      const seat=mrInt(body.seat,1,4),at=mrInt(body.tick,0,2147483647);if(seat==null||at==null)return false;
      if(body.type==='disconnected')return mrKeys(body,['protocol','v','type','seat','tick','graceMs'])&&body.graceMs===10000;
      if(body.type==='reconnected')return mrKeys(body,['protocol','v','type','seat','tick']);
      if(body.type==='forfeit')return mrKeys(body,['protocol','v','type','seat','tick','reason'])&&body.reason==='reconnect_timeout';
      return false;
    }
    async function handle(raw,kind,serial){
      if(serial!==socketSerial||typeof raw!=='string'||mrBytes(raw)>262144)return fatal('invalid_frame_size',1009);
      let body;try{body=JSON.parse(raw);}catch(e){return fatal('invalid_json');}
      if(!baseFrame(body))return fatal('protocol_mismatch');
      if(!welcomeSeen){if(body.type!=='welcome')return fatal('welcome_required');return welcome(body,kind,serial);}
      if(!sameAccount())return fatal('account_changed',1008);
      if(body.type==='welcome')return fatal('duplicate_welcome');
      if(body.type==='start'){
        const seats=body.seats;if(!mrKeys(body,['protocol','v','type','tick','seats'])||body.tick!==0||!Array.isArray(seats)||seats.length<2||seats.length>4||
           !seats.every((v,i)=>mrInt(v,1,4)!=null&&(i===0||v>seats[i-1]))||!seats.includes(expected.seat))return fatal('invalid_start');
        started=true;setState('running');emit('start',{tick:0,seats:seats.slice()});return;
      }
      if(body.type==='tick'){
        if(!started||!mrKeys(body,['protocol','v','type','tick','commands'])||mrInt(body.tick,1,2147483647)!==tick+1)return fatal('tick_order');
        const commands=mrBatch(body.commands);if(!commands)return fatal('invalid_tick_commands');
        if(!consumer||typeof consumer.applyTick!=='function')return fatal('consumer_unavailable',1011);
        const packet=mrFreeze({tick:body.tick,commands});
        try{const accepted=await consumer.applyTick(packet);if(accepted===false)return fatal('consumer_rejected_tick',1011);}catch(e){return fatal('consumer_failed',1011);}
        tick=body.tick;emit('tick',packet);if(tick%30===0)await sendStateHash(tick);return;
      }
      if(body.type==='ack'){
        const n=mrInt(body.seq,1,2147483647),target=mrInt(body.targetTick,1,2147483647),count=mrInt(body.count,1,8),p=n&&pending.get(n);
        if(!mrKeys(body,['protocol','v','type','seq','targetTick','count'])||!p||target!==p.targetTick||count!==p.count)return fatal('invalid_ack');
        pending.delete(n);emit('ack',{seq:n,targetTick:target,count});return;
      }
      if(body.type==='reject'){
        const n=body.seq==null?null:mrInt(body.seq,1,2147483647),code=String(body.code||'');
        if(!mrKeys(body,['protocol','v','type','code','seq','strikes','lastAccepted','tick'])||!MR_CODE_RE.test(code)||body.seq!=null&&n==null)return fatal('invalid_reject');
        if(n!=null)pending.delete(n);emit('reject',{code,seq:n});return;
      }
      if(body.type==='hashAck'){
        const at=mrInt(body.tick,30,2147483647);if(!mrKeys(body,['protocol','v','type','tick'])||at==null||at%30||!hashTicks.has(at))return fatal('invalid_hash_ack');
        emit('hashAck',{tick:at});return;
      }
      if(body.type==='hashAgreement'){
        const at=mrInt(body.tick,30,2147483647);if(!mrKeys(body,['protocol','v','type','tick','hash'])||at==null||at%30||!MR_HASH_RE.test(String(body.hash||'')))return fatal('invalid_hash_agreement');
        emit('hashAgreement',{tick:at,hash:body.hash});return;
      }
      if(body.type==='divergence'){
        const at=mrInt(body.tick,30,2147483647),rows=body.seats;
        if(!mrKeys(body,['protocol','v','type','tick','seats'])||at==null||at%30||!Array.isArray(rows)||rows.length<2||rows.length>4||
           !rows.every((r,i)=>mrKeys(r,['seat','hash'])&&mrInt(r.seat,1,4)!=null&&MR_HASH_RE.test(String(r.hash||''))&&(i===0||r.seat>rows[i-1].seat)))return fatal('invalid_divergence');
        emit('divergence',{tick:at,seats:mrCopy(rows)});return fatal('state_divergence',1008);
      }
      if(body.type==='disconnected'||body.type==='reconnected'||body.type==='forfeit'){
        if(!lifecycle(body))return fatal('invalid_lifecycle');emit(body.type,{seat:body.seat,tick:body.tick,graceMs:body.graceMs,reason:body.reason});return;
      }
      if(body.type==='matchEnd'){
        const at=mrInt(body.tick,0,2147483647),winner=body.winnerSeat==null?null:mrInt(body.winnerSeat,1,4),reason=String(body.reason||'');
        if(!mrKeys(body,['protocol','v','type','tick','reason','winnerSeat'])||at==null||winner!==body.winnerSeat||!MR_CODE_RE.test(reason))return fatal('invalid_match_end');
        ended=true;intentional=true;resumeToken='';setState('ended',{reason});emit('matchEnd',{tick:at,reason,winnerSeat:winner});closeSocket(1000,'match ended');return;
      }
      fatal('unknown_frame_type');
    }
    function scheduleReconnect(){
      if(intentional||ended||!resumeToken||Date.now()>=graceDeadline)return fatal('reconnect_expired',1008);
      const delay=reconnectBackoff[Math.min(reconnectAttempt++,reconnectBackoff.length-1)];
      if(Date.now()+delay>=graceDeadline)return fatal('reconnect_expired',1008);
      setState('reconnecting',{attempt:reconnectAttempt});reconnectTimer=setTimeout(()=>{reconnectTimer=null;connectSocket('resume',resumeToken).catch(()=>{});},delay);
    }
    function connectSocket(kind,token){
      return new Promise((resolve,reject)=>{
        if(typeof WebSocket!=='function'||!expected||!MR_HASH_RE.test(String(token||''))){token='';return reject(Object.assign(new Error('Match transport unavailable.'),{code:'transport_unavailable'}));}
        const url=window.MFSocial&&typeof MFSocial.matchSocketUrl==='function'?MFSocial.matchSocketUrl(expected.matchId):'';
        if(!/^wss?:\/\//.test(url)){token='';return reject(Object.assign(new Error('Match transport unavailable.'),{code:'socket_url_unavailable'}));}
        const serial=++socketSerial;welcomeSeen=false;let credentialProtocol=`mf-${kind}.${expected.seat}.${token}`;
        let protocols=[MR_SUBPROTOCOL,credentialProtocol],opened=false,ws;
        try{ws=new WebSocket(url,protocols);}catch(e){credentialProtocol='';protocols[1]='';token='';return reject(Object.assign(new Error('Match transport unavailable.'),{code:'socket_create_failed'}));}
        socket=ws;credentialProtocol='';protocols[1]='';if(kind==='seat')token='';
        ws.binaryType='arraybuffer';setState(kind==='resume'?'reconnecting':'connecting');
        ws.addEventListener('open',()=>{
          if(serial!==socketSerial)return;opened=true;if(kind==='resume')token='';
          if(ws.protocol!==MR_SUBPROTOCOL)return fatal('subprotocol_mismatch');
          welcomeTimer=setTimeout(()=>{if(serial===socketSerial&&!welcomeSeen)fatal('welcome_timeout',1008);},5000);
        });
        ws.addEventListener('message',event=>{const value=event.data;inbound=inbound.then(()=>handle(value,kind,serial)).catch(()=>fatal('frame_handler_failed',1011));});
        ws.addEventListener('error',()=>{});
        ws.addEventListener('close',()=>{
          if(serial!==socketSerial)return;if(welcomeTimer){clearTimeout(welcomeTimer);welcomeTimer=null;}socket=null;
          if(intentional||ended)return;
          if(!opened||!welcomeSeen){if(kind==='seat'){rejectConnect('launch_socket_closed');fatal('launch_socket_closed',1008);return;}scheduleReconnect();return;}
          graceDeadline=Date.now()+graceMs;scheduleReconnect();
        });
        const priorResolve=connectResolve,priorReject=connectReject;
        connectResolve=value=>{resolve(value);if(priorResolve)priorResolve(value);};
        connectReject=error=>{reject(error);if(priorReject)priorReject(error);};
      });
    }
    async function acceptCredential(credential){
      if(!credential||typeof credential!=='object'||typeof credential.token!=='string'||!MR_HASH_RE.test(credential.token))throw Object.assign(new Error('Invalid match credential.'),{code:'invalid_credential'});
      let token=credential.token;credential.token='';
      if(!consumer||typeof consumer.applyTick!=='function'||caps().realtimeMatch!==true){token='';throw Object.assign(new Error('Match consumer unavailable.'),{code:'consumer_unavailable'});}
      if(state!=='idle'&&state!=='closed'&&state!=='error'){token='';throw Object.assign(new Error('Match runtime is already active.'),{code:'runtime_busy'});}
      const value={matchId:String(credential.matchId||''),lobbyId:String(credential.lobbyId||''),seat:mrInt(credential.seat,1,4),
        userId:mrInt(credential.userId,1,Number.MAX_SAFE_INTEGER),buildVersion:String(credential.buildVersion||''),
        manifestHash:String(credential.manifestHash||''),balanceHash:String(credential.balanceHash||''),rulesHash:String(credential.rulesHash||''),expiresAt:Number(credential.expiresAt)||0};
      const current=await runtimeTuple(),rules=S.lobby&&S.lobby.rules;
      let rulesHash='';try{rulesHash=window.MFSocial&&typeof MFSocial.rulesHash==='function'?await MFSocial.rulesHash(rules):'';}catch(e){}
      if(!MR_ID_RE.test(value.matchId)||!MR_ID_RE.test(value.lobbyId)||value.seat==null||value.userId==null||
         !current||current.buildVersion!==value.buildVersion||current.manifestHash!==value.manifestHash||current.balanceHash!==value.balanceHash||
         !MR_HASH_RE.test(value.rulesHash)||rulesHash!==value.rulesHash||value.expiresAt<=Date.now()){
        token='';throw Object.assign(new Error('Match compatibility rejected.'),{code:'compatibility_mismatch'});
      }
      clearTimers();intentional=false;ended=false;started=false;tick=0;seq=0;pending.clear();hashTicks.clear();resumeToken='';
      lastGeneration=0;expected=value;account=sessionStamp();
      return connectSocket('seat',token).finally(()=>{token='';});
    }
    function submitCommands(commands,delay){
      const d=delay==null?2:mrInt(delay,2,3);
      if(state!=='running'||!socketReady()||d==null||!Array.isArray(commands)||!commands.length||commands.length>8||
         !commands.every(mrCommandSafe)||pending.size>=128||seq>=2147483647)return null;
      const clean=mrCopy(commands),next=++seq,targetTick=tick+d,frame={protocol:MR_PROTOCOL,v:MR_VERSION,type:'commands',seq:next,targetTick,commands:clean};
      if(mrBytes(frame)>16384||!send(frame)){seq--;return null;}
      pending.set(next,{targetTick,count:clean.length});return mrFreeze({seq:next,targetTick,count:clean.length});
    }
    function registerConsumer(value){
      if(!value||typeof value!=='object'||typeof value.applyTick!=='function'||consumer&&consumer!==value)return false;
      consumer=value;emit('consumer',{registered:true});try{render();}catch(e){}return true;
    }
    function unregisterConsumer(value){
      if(!consumer||value&&value!==consumer)return false;
      if(state!=='idle'&&state!=='closed'&&state!=='ended')fatal('consumer_unregistered',1011);
      consumer=null;emit('consumer',{registered:false});try{render();}catch(e){}return true;
    }
    function close(){intentional=true;ended=true;resumeToken='';clearTimers();closeSocket(1000,'client closed');setState('closed');}
    const api={registerConsumer,unregisterConsumer,ready:()=>!!consumer&&typeof WebSocket==='function'&&!!(window.MFSocial&&MFSocial.matchSocketUrl),
      submitCommands,status:snapshot,close};
    Object.freeze(api);
    return {api,acceptCredential};
  }
  const MATCH_RUNTIME=createMatchRuntime();
  try{Object.defineProperty(window,'MFMatchRuntime',{value:MATCH_RUNTIME.api,writable:false,configurable:false});}catch(e){window.MFMatchRuntime=MATCH_RUNTIME.api;}
  try{Object.defineProperty(window,'mfMatchCredentialHandoff',{value:credential=>MATCH_RUNTIME.acceptCredential(credential),writable:false,configurable:false});}catch(e){window.mfMatchCredentialHandoff=credential=>MATCH_RUNTIME.acceptCredential(credential);}
  function syncSession(){
    const stamp=sessionStamp();
    if(stamp===S.session)return false;
    S.session=stamp;S.epoch++;S.threadEpoch++;S.busy=false;S.messageBusy=false;S.worldBusy=false;S.lobbyBusy=false;S.handleBusy=false;S.handleError='';
    S.caps=null;S.reason='';S.gate='';S.connection=stamp==='signed-out'?'signed-out':'idle';
    S.friends=[];S.incoming=[];S.presence={};S.onlinePlayers=null;S.onlineUpdatedAt=0;S.onlineBusy=false;S.selected='';S.messages=[];S.messageDraft='';S.worldMessages=[];S.worldDraft='';S.worldProfile='';S.lobby=null;S.lobbyInvites=[];
    S.lobbyCompatibility=null;S.preparedMatch=null;S.launchReceipt=null;
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
  function avatar(name,state,small){
    const value=safeName(name),a=document.createElement('span');a.className='socialAvatar'+(small?' sm':'');
    let hue=0,letters='';for(let i=0;i<value.length;i++){hue=(hue*31+value.charCodeAt(i))%360;if(/[a-z0-9]/i.test(value[i])&&letters.length<2)letters+=value[i].toUpperCase();}
    a.style.setProperty('--avatarHue',String(hue));a.textContent=letters||'MF';a.setAttribute('aria-hidden','true');
    if(state){const dot=document.createElement('span');dot.className='socialPresence '+state;dot.setAttribute('aria-label',state);a.appendChild(dot);}
    return a;
  }
  function accountHero(){
    const id=identity(),hero=document.createElement('section');hero.className='socialVisualHero';
    hero.appendChild(avatar(id.username,S.presenceSelf));
    const text=document.createElement('div');text.className='socialHeroText';const label=document.createElement('small');label.textContent='YOUR CLOUD COMMANDER ID';text.appendChild(label);
    const name=document.createElement('b');name.className='socialUsernameChip';name.textContent=id.username;text.appendChild(name);
    const p=document.createElement('p');p.textContent='Saved to this MASSFRONT account. Friends, World Chat and multiplayer use this same username.';text.appendChild(p);hero.appendChild(text);
    hero.appendChild(button('ACCOUNT',()=>{if(typeof apOpen==='function')apOpen(q('socialBtn'));},'socialAction alt'));
    return hero;
  }
  function channelHero(){
    const card=document.createElement('div');card.className='socialChannelHero';const orb=document.createElement('span');orb.className='socialChannelOrb';orb.textContent='LIVE';orb.setAttribute('aria-hidden','true');card.appendChild(orb);
    const copy=document.createElement('div');const b=document.createElement('b');b.textContent='WORLD COMMAND NET';copy.appendChild(b);const s=document.createElement('span');s.textContent='Public commander channel. Tap a username for profile actions; never share contact details.';copy.appendChild(s);card.appendChild(copy);return card;
  }
  async function claimHandle(input){
    if(S.handleBusy||offline()||!signedIn())return;
    const value=String(input&&input.value||'').trim();
    if(!/^[a-z0-9_]{3,16}$/i.test(value)){S.handleError='Use 3–16 letters, numbers or underscore.';render();return;}
    S.handleBusy=true;S.handleError='';render();const r=await socialCall('claimUsername',value);S.handleBusy=false;
    if(!r||!r.ok){S.handleError=(r&&r.message)||'That username could not be saved.';render();return;}
    S.handleError='';say('Commander username saved · '+safeName(r.username||value));await refresh(true);
  }
  function handleChooser(host){
    const card=document.createElement('section');card.className='socialVisualHero socialHandleGate';card.appendChild(avatar('MF','',false));
    const text=document.createElement('div');text.className='socialHeroText';const label=document.createElement('small');label.textContent='ONE-TIME ACCOUNT SETUP';text.appendChild(label);const title=document.createElement('b');title.className='socialUsernameChip';title.textContent='CHOOSE COMMANDER ID';text.appendChild(title);
    const p=document.createElement('p');p.textContent='This unique username stays with your cloud account. You will not be asked to name yourself each time you sign in.';text.appendChild(p);card.appendChild(text);
    const form=document.createElement('div');form.className='socialHandleForm';const input=document.createElement('input');input.maxLength=16;input.autocomplete='username';input.autocapitalize='off';input.spellcheck=false;input.placeholder='Commander_1';input.setAttribute('aria-label','Choose commander username');input.disabled=S.handleBusy||offline();input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();claimHandle(input);}});form.appendChild(input);
    form.appendChild(button(S.handleBusy?'SAVING…':'SAVE COMMANDER ID',()=>claimHandle(input),'socialAction',S.handleBusy||offline(),offline()?SOCIAL_OFFLINE:''));const error=document.createElement('div');error.className='socialHandleError';error.setAttribute('role','alert');error.textContent=S.handleError;form.appendChild(error);card.appendChild(form);host.appendChild(card);
  }
  function namedOnlineCommanders(){
    const found=new Map(),put=(username,state,source,friend)=>{const name=safeName(username),key=name.toLowerCase();if(!key||key==='commander'||key===identity().username.toLowerCase())return;const prior=found.get(key);if(!prior||prior.source!=='LOBBY')found.set(key,{username:name,state,source,friend:!!friend});};
    for(const f of S.friends){const state=String(S.presence[String(f.username||'').toLowerCase()]||'offline');if(state==='online'||state==='away')put(f.username,state,'FRIEND',true);}
    for(const m of Array.isArray(S.lobby&&S.lobby.members)?S.lobby.members:[]){if(!m.self)put(m.username,'online','LOBBY',S.friends.some(f=>String(f.username||'').toLowerCase()===String(m.username||'').toLowerCase()));}
    return [...found.values()].sort((a,b)=>a.username.localeCompare(b.username));
  }
  function recentWorldCommanders(){
    const found=new Map(),now=Date.now();
    for(const row of S.worldMessages){if(row.self)continue;const at=Number(row.at)||0;if(at&&now-at>15*60*1000)continue;const name=safeName(row.username),key=name.toLowerCase();if(!found.has(key))found.set(key,{username:name,state:'recent',source:'RECENT WORLD CHAT',friend:worldIsFriend(row)});}
    return [...found.values()].slice(0,8);
  }
  function namedCard(row){
    const card=document.createElement('article');card.className='socialPlayerCard';card.appendChild(avatar(row.username,row.state==='recent'?'':row.state,true));
    const who=document.createElement('div');who.className='socialWho';const name=document.createElement('b');name.textContent=safeName(row.username);who.appendChild(name);const tag=document.createElement('span');tag.className='socialSourcePill '+(row.state==='online'?'online':row.state==='away'?'away':'');tag.textContent=row.source+(row.state==='away'?' · AWAY':row.state==='online'?' · ONLINE':'');who.appendChild(tag);card.appendChild(who);
    const acts=document.createElement('div');acts.className='socialActs';acts.appendChild(button('VIEW',()=>{S.worldProfile=safeName(row.username);setTab('world');},'socialAction alt'));
    const chatWhy=!row.friend?'Private messages require an accepted friendship.':capabilityReason('chat')||transportReason();acts.appendChild(button('MESSAGE',()=>selectFriend(row.username),'socialAction',!!chatWhy,chatWhy));
    const inviteWhy=!row.friend?'Lobby invites require an accepted friendship.':!S.lobby?'Create or join a lobby first.':capabilityReason('invites')||transportReason();acts.appendChild(button('INVITE',()=>inviteFriend(row.username),'socialAction alt',!!inviteWhy,inviteWhy));card.appendChild(acts);return card;
  }
  function lobbyMemberCard(member,build,verified){
    const card=document.createElement('article');card.className='socialPlayerCard';card.appendChild(avatar(member.username,member.ready?'online':'away',true));
    const who=document.createElement('div');who.className='socialWho';const name=document.createElement('b');name.textContent=(member.host?'★ ':'')+safeName(member.username)+(member.self?' · YOU':'');who.appendChild(name);
    const tag=document.createElement('span');tag.className='socialSourcePill '+(member.ready?'online':'away');tag.textContent=(member.ready?'READY':'NOT READY')+' · '+build;who.appendChild(tag);card.appendChild(who);card.classList.toggle('good',!!verified);return card;
  }
  function injectStyle(){
    if(q('mfSocialStyle'))return;
    const st=document.createElement('style');st.id='mfSocialStyle';st.textContent=`
#socialScr{background:linear-gradient(180deg,#08111ee8,#03070df8);z-index:105;align-items:center;justify-content:flex-start!important;padding:0!important;overflow:hidden}
#socialScr .socialBody{flex:1 1 auto;min-height:0;width:min(100%,920px);max-width:100%;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;padding:10px calc(var(--sar) + 12px) 24px calc(var(--sal) + 12px)}
#socialScr .screenTabs{width:min(calc(100% - var(--sal) - var(--sar) - 20px),720px)}
#socialScr .socialPane{display:none;width:100%;min-width:0}#socialScr .socialPane.on{display:block}.socialStack{display:grid;gap:10px;min-width:0}
.socialVisualHero{position:relative;isolation:isolate;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:center;min-height:92px;overflow:hidden;border:1px solid #367b96;background:radial-gradient(circle at 12% 18%,#34c5e42c,transparent 34%),linear-gradient(120deg,#102c3e,#091622 64%,#0b2530);box-shadow:inset 0 1px #d7f8ff1a,0 8px 24px #0007;padding:14px}.socialVisualHero:after{content:"";position:absolute;z-index:-1;inset:auto -18px -42px auto;width:150px;height:150px;border:18px solid #67dbf018;border-radius:50%;box-shadow:0 0 0 9px #67dbf00c}.socialHeroText{min-width:0}.socialHeroText small{display:block;color:#6fa1b7;font:800 9px var(--fT);letter-spacing:.16em}.socialHeroText p{margin:7px 0 0;color:#8bafc1;font-size:10px;line-height:1.4}.socialUsernameChip{display:inline-flex;max-width:100%;align-items:center;gap:6px;margin-top:5px;padding:5px 9px;border:1px solid #58bad0;background:#0a2431;color:#e7fbff;font:900 13px var(--fT);letter-spacing:.07em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 0 14px #4acbe321}.socialUsernameChip:before{content:"◆";color:#63e0ef;font-size:8px}.socialAvatar{position:relative;display:grid;place-items:center;flex:0 0 auto;width:52px;height:52px;border:1px solid hsl(var(--avatarHue,190) 75% 65%);clip-path:polygon(18% 0,82% 0,100% 18%,100% 82%,82% 100%,18% 100%,0 82%,0 18%);background:radial-gradient(circle at 34% 28%,#ffffff3d,transparent 23%),linear-gradient(145deg,hsl(var(--avatarHue,190) 65% 42%),hsl(var(--avatarHue,190) 70% 15%));color:#f3fdff;text-shadow:0 1px 3px #000;font:900 16px var(--fT);box-shadow:inset 0 0 0 3px #06101a99,0 0 15px hsl(var(--avatarHue,190) 70% 46% / .28)}.socialAvatar.sm{width:42px;height:42px;font-size:13px}.socialAvatar .socialPresence{position:absolute;right:1px;bottom:2px;border:2px solid #071019;width:10px;height:10px}.socialHandleGate{grid-template-columns:auto minmax(0,1fr)}.socialHandleForm{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;width:100%}.socialHandleForm input{min-height:48px;min-width:0;box-sizing:border-box;border:1px solid #4b8ea7;background:#06121c;color:#effcff;padding:10px 12px;font:800 13px system-ui,sans-serif;outline:none}.socialHandleForm input:focus{border-color:#72e4f4;box-shadow:0 0 0 2px #72e4f428}.socialHandleError{grid-column:1/-1;color:#f2a7ad;font-size:10px;min-height:14px}
.socialNamedGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px}.socialPlayerCard{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;border:1px solid #264a5f;background:linear-gradient(135deg,#0b1c29,#07121c);padding:9px;min-width:0}.socialPlayerCard .socialWho b{display:inline-flex;padding:4px 7px;border:1px solid #396b81;background:#0a2230;color:#dff8ff}.socialPlayerCard .socialActs{grid-column:1/-1;justify-content:stretch}.socialPlayerCard .socialActs .socialAction{flex:1}.socialSourcePill{display:inline-flex;margin-top:5px;padding:3px 6px;border-radius:10px;background:#163344;color:#85bfd4;font:800 8px var(--fT);letter-spacing:.09em}.socialSourcePill.online{background:#123a2c;color:#83e2ae}.socialSourcePill.away{background:#3b3015;color:#e9ca75}.socialChannelHero{position:relative;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;border:1px solid #356b83;background:radial-gradient(circle at 10% 50%,#52d8ed2b,transparent 28%),linear-gradient(120deg,#0b2938,#08141f);padding:13px}.socialChannelOrb{display:grid;place-items:center;width:54px;height:54px;border:1px solid #63d8ed;border-radius:50%;background:radial-gradient(circle,#5de0ee55 0 16%,#0f5c7388 17% 31%,#06131e 33%);color:#c9f9ff;font:900 11px var(--fT);box-shadow:0 0 18px #40d9ef45}.socialChannelHero b{display:block;color:#e4faff;font:900 12px var(--fT);letter-spacing:.12em}.socialChannelHero span{display:block;margin-top:5px;color:#83aabd;font-size:10px;line-height:1.4}
.socialNotice,.socialCard{border:1px solid #24445a;background:linear-gradient(145deg,#0d1b29,#08121d);box-shadow:inset 0 1px #ffffff0a;padding:13px;border-radius:4px;color:#8ba8bb}
.socialNotice{display:flex;min-width:0;flex-direction:column;gap:4px;line-height:1.4;text-align:left}.socialNotice b,.socialCard h3{margin:0;color:#d7edfa;font:800 11px var(--fT);letter-spacing:.12em}.socialNotice span{font-size:11px;overflow-wrap:anywhere}.socialNotice.good{border-color:#255d4b}.socialNotice.warn{border-color:#72552b}.socialNotice.bad{border-color:#6c3036}
.socialToolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.socialToolbar input,.socialToolbar select,.socialComposer textarea,.socialJoin input{min-height:44px;box-sizing:border-box;border:1px solid #31566d;background:#07101a;color:#e8f6ff;border-radius:3px;padding:9px 11px;font:700 12px system-ui,sans-serif;outline:none}.socialToolbar input:focus,.socialToolbar select:focus,.socialComposer textarea:focus{border-color:#63cce8;box-shadow:0 0 0 2px #63cce82a}.socialToolbar input{flex:1 1 180px;min-width:0}.socialToolbar select{flex:1 1 130px}
.socialAction{min-height:44px;min-width:44px;border:1px solid #4082a2;background:linear-gradient(#15334a,#0b2133);color:#dff7ff;border-radius:3px;padding:0 13px;font:900 10px var(--fT);letter-spacing:.08em}.socialAction.alt{border-color:#405565;background:#101b25;color:#a9c1d0}.socialAction.danger{border-color:#713842;color:#e8a7ae}.socialAction:disabled{filter:saturate(.35);opacity:.52;color:#80919c;cursor:not-allowed}.socialAction:not(:disabled):active{transform:scale(.97)}
.socialSectionTitle{display:flex;align-items:center;justify-content:space-between;margin:14px 2px 7px;color:#78cce4;font:900 10px var(--fT);letter-spacing:.16em}.socialCount{display:inline-grid;place-items:center;min-width:21px;height:21px;border-radius:11px;background:#183448;color:#bceeff;font-size:9px}
.socialOnlineCard{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;border:1px solid #23634f;background:linear-gradient(105deg,#09241e,#0a1822);padding:12px 14px;min-height:58px}.socialOnlinePulse{width:12px;height:12px;border-radius:50%;background:#5be69f;box-shadow:0 0 0 4px #5be69f1f,0 0 12px #5be69faa}.socialOnlineValue{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.socialOnlineValue strong{color:#e7fff3;font:900 24px var(--fT);line-height:1}.socialOnlineValue b{color:#8ed9b8;font:900 10px var(--fT);letter-spacing:.15em}.socialOnlineValue small{display:block;width:100%;color:#638f80;font-size:9px;margin-top:3px}.socialOnlineCard.unknown{border-color:#405565;background:#0a151e}.socialOnlineCard.unknown .socialOnlinePulse{background:#64737c;box-shadow:none}
.socialPerson{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;min-height:64px;border:1px solid #1c3547;background:linear-gradient(135deg,#091722,#07111a);padding:8px;margin-bottom:6px}.socialPresence{width:9px;height:9px;border-radius:50%;background:#53616a;box-shadow:0 0 0 2px #071019}.socialPresence.online{background:#5be69f;box-shadow:0 0 8px #5be69f88}.socialPresence.away{background:#e2bd58;box-shadow:0 0 8px #e2bd5888}.socialWho{min-width:0}.socialWho b{display:block;color:#e4f5ff;font:800 12px var(--fT);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.socialWho span{display:block;color:#7795a8;font-size:10px;margin-top:3px}.socialActs{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.socialActs .socialAction{min-height:44px;padding:0 9px;font-size:9px}
.socialThreadHead{display:flex;align-items:center;gap:8px;margin-bottom:9px}.socialThreadHead b{flex:1;color:#dff6ff;font:900 12px var(--fT);letter-spacing:.08em}.socialMessages{display:flex;flex-direction:column;gap:7px;min-height:150px;max-height:45vh;overflow-y:auto;padding:9px;border:1px solid #1d3749;background:#040b12}.socialBubble{align-self:flex-start;max-width:84%;border:1px solid #2b495d;background:#0d1a25;color:#d7e9f2;border-radius:4px;padding:8px 10px;font-size:12px;line-height:1.4;overflow-wrap:anywhere}.socialBubble.mine{align-self:flex-end;border-color:#27634f;background:#0d261f}.socialBubble small{display:block;margin-top:4px;color:#66889e;font-size:9px}.socialComposer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:8px}.socialComposer textarea{min-height:62px;resize:vertical}.socialComposer .socialAction{height:100%}
.socialWorldFeed{display:flex;flex-direction:column;gap:8px;min-height:180px;max-height:52vh;overflow-y:auto;padding:8px;border:1px solid #1d3749;background:#040b12}.socialWorldMessage{border:1px solid #1c3547;background:linear-gradient(135deg,#091824,#07111a);padding:10px}.socialWorldMessage.mine{border-color:#27634f;background:#0b201b}.socialWorldHead{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;margin-bottom:8px}.socialWorldHead b{justify-self:start;max-width:100%;padding:5px 8px;border:1px solid #315f74;background:#0a2230;color:#c8f2ff;font:900 11px var(--fT);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.socialWorldHead small{color:#587b90;font-size:9px}.socialWorldText{margin-left:51px;color:#d7e9f2;font-size:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.socialWorldMessage .socialActs{margin:9px 0 0 51px;justify-content:flex-start}.socialWorldProfile{border-color:#36708a;background:linear-gradient(135deg,#0c2635,#0a1822)}
.socialLobbyGrid{display:grid;grid-template-columns:1fr;gap:10px;min-width:0}.socialLobbyGrid>.socialNotice{grid-column:1/-1}.socialCard{min-width:0;text-align:left}.socialContract{margin:10px 0 0;padding-left:18px;color:#88a6b9;font-size:11px;line-height:1.55}.socialJoin{display:flex;gap:8px;margin-top:10px}.socialJoin input{flex:1;min-width:0}.socialCreate{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;margin-top:10px}.socialCreate select{width:100%;min-height:44px;border:1px solid #31566d;background:#07101a;color:#e8f6ff;border-radius:3px;padding:9px 11px;font:700 11px system-ui,sans-serif}
.socialInvite{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid #1c3547;background:#08131e;padding:8px;margin-top:7px}.socialInvite .socialNotice{padding:8px}.socialInvite .socialActs{justify-content:flex-end}
.socialLaunch{margin-top:10px;padding-top:10px;border-top:1px solid #1d3749}.socialLaunch .socialToolbar{margin:8px 0 0}.socialLaunchCode{font:700 10px ui-monospace,monospace;color:#81b9cf;overflow-wrap:anywhere}
#socialStatusDot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#53616a;margin-left:4px;vertical-align:middle}.socialReady #socialStatusDot{background:#5be69f;box-shadow:0 0 7px #5be69f99}.socialLimited #socialStatusDot{background:#e2bd58}.socialOffline #socialStatusDot{background:#d77a4a;box-shadow:0 0 7px #d77a4a88}
@media(min-width:760px){.socialLobbyGrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.socialPane{padding:0 8px}}
@media(max-width:520px){.socialVisualHero{grid-template-columns:auto minmax(0,1fr)}.socialVisualHero>.socialAction{grid-column:1/-1;width:100%}.socialInvite{grid-template-columns:1fr}.socialInvite .socialActs{justify-content:stretch}.socialInvite .socialAction{flex:1}.socialCreate{grid-template-columns:1fr 1fr}.socialCreate .socialAction{grid-column:1/-1}.socialWorldMessage .socialActs{display:grid;grid-template-columns:1fr 1fr}}
@media(max-width:410px){.socialHandleForm{grid-template-columns:1fr}.socialHandleForm .socialAction{width:100%}.socialActs{grid-column:1/-1;justify-content:stretch}.socialActs .socialAction{flex:1}.socialPerson{grid-template-columns:auto minmax(0,1fr)}.socialWho{grid-column:2}.socialComposer{grid-template-columns:1fr}.socialComposer .socialAction{min-height:48px}.socialAction{padding-left:10px;padding-right:10px}.socialJoin{display:grid;grid-template-columns:1fr}.socialJoin .socialAction{width:100%}.socialWorldHead{grid-template-columns:auto minmax(0,1fr)}.socialWorldHead small{grid-column:2}.socialWorldText,.socialWorldMessage .socialActs{margin-left:0}}
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
        '<button id="socialTabWorld" class="screenTabBtn" type="button" role="tab" data-social-tab="world" aria-selected="false" aria-controls="socialPaneWorld" tabindex="-1"><span class="tabGlyph">◎</span><span>WORLD</span></button>'+
        '<button id="socialTabChat" class="screenTabBtn" type="button" role="tab" data-social-tab="chat" aria-selected="false" aria-controls="socialPaneChat" tabindex="-1"><span class="tabGlyph">✉</span><span>CHAT</span></button>'+
        '<button id="socialTabLobby" class="screenTabBtn" type="button" role="tab" data-social-tab="lobby" aria-selected="false" aria-controls="socialPaneLobby" tabindex="-1"><span class="tabGlyph">⌂</span><span>LOBBY</span></button></div>'+
        '<div class="socialBody"><section class="socialPane on" id="socialPaneFriends" role="tabpanel" aria-labelledby="socialTabFriends"></section><section class="socialPane" id="socialPaneWorld" role="tabpanel" aria-labelledby="socialTabWorld" hidden></section><section class="socialPane" id="socialPaneChat" role="tabpanel" aria-labelledby="socialTabChat" hidden></section><section class="socialPane" id="socialPaneLobby" role="tabpanel" aria-labelledby="socialTabLobby" hidden></section></div>'+
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
    S.tab=tab==='world'||tab==='chat'||tab==='lobby'?tab:'friends';
    const scr=ensureShell();
    scr.querySelectorAll('[data-social-tab]').forEach(b=>{
      const on=b.dataset.socialTab===S.tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1;
    });
    for(const t of ['friends','world','chat','lobby']){
      const p=q('socialPane'+t.charAt(0).toUpperCase()+t.slice(1));if(p){const on=t===S.tab;p.classList.toggle('on',on);p.hidden=!on;}
    }
    render();
    if(S.tab==='world'&&S.caps&&S.caps.worldChat===true&&!S.worldMessages.length)loadWorldMessages();
    if(S.tab==='chat'&&S.selected&&S.caps&&S.caps.chat===true&&!S.messages.length)loadMessages();
  }
  function open(tab){
    syncSession();
    if(tab==='friends'||tab==='world'||tab==='chat'||tab==='lobby')S.tab=tab;
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
    if(S.caps[kind]!==true)return kind==='chat'?'Friend chat is not enabled on this server.':kind==='worldChat'?'World Chat is not enabled on this server.':kind==='presence'?'Friend presence is not enabled on this server.':'This server did not enable '+kind+'.';
    return '';
  }
  function connectionNotice(host){
    if(!host||!S.reason||!S.caps||S.caps.handshake!==true)return;
    host.appendChild(line(S.connection==='offline'?'OFFLINE · CACHED STATUS':'CONNECTION LIMITED',S.reason,'warn'));
  }
  function render(){
    syncSession();const scr=ensureShell(),body=scr.querySelector('.socialBody');
    if(body)body.setAttribute('aria-busy',(S.busy||S.messageBusy||S.worldBusy||S.lobbyBusy)?'true':'false');
    renderFriends();renderWorld();renderChat();renderLobby();renderInboxBridge();statusDot();
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
    if(!identity().hasUsername){handleChooser(stack);return;}
    stack.appendChild(accountHero());
    if(S.busy&&!S.caps){stack.appendChild(line('CHECKING SOCIAL LINK','Confirming account access and server capabilities…'));return;}
    const friendReason=capabilityReason('friends');
    if(friendReason){stack.appendChild(line('FRIENDS UNAVAILABLE',friendReason,'warn'));stack.appendChild(button('RETRY',()=>refresh(true),'socialAction alt',S.busy));return;}
    connectionNotice(stack);const netOff=transportReason(),writeOff=S.busy||!!netOff;
    const online=document.createElement('div');online.className='socialOnlineCard'+(Number.isSafeInteger(S.onlinePlayers)?'':' unknown');
    const pulse=document.createElement('span');pulse.className='socialOnlinePulse';pulse.setAttribute('aria-hidden','true');online.appendChild(pulse);
    const value=document.createElement('div');value.className='socialOnlineValue';const n=document.createElement('strong');n.id='socialOnlineCount';n.textContent=Number.isSafeInteger(S.onlinePlayers)?String(S.onlinePlayers):'—';value.appendChild(n);
    const label=document.createElement('b');label.textContent=S.caps.onlineCount===true?'PLAYERS ONLINE':'ONLINE COUNT UNAVAILABLE';value.appendChild(label);
    const privacy=document.createElement('small');privacy.textContent='Global total · named cards use only friends, your lobby and recent World Chat';value.appendChild(privacy);online.appendChild(value);stack.appendChild(online);
    const named=namedOnlineCommanders();sectionTitle(stack,'ONLINE COMMANDERS',named.length);
    if(!named.length)stack.appendChild(line('NO NAMED CONTACTS ONLINE','The global total stays visible. Names appear here only for online friends or commanders currently in your lobby.'));
    else{const grid=document.createElement('div');grid.className='socialNamedGrid';for(const row of named)grid.appendChild(namedCard(row));stack.appendChild(grid);}
    const recent=recentWorldCommanders();
    if(recent.length){sectionTitle(stack,'RECENT WORLD COMMANDERS',recent.length);const grid=document.createElement('div');grid.className='socialNamedGrid';for(const row of recent)grid.appendChild(namedCard(row));stack.appendChild(grid);}
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
    d.appendChild(avatar(row.username,state,true));
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
  function worldIsFriend(row){
    const key=String(row&&row.username||'').toLowerCase();
    return row&&row.friend===true||S.friends.some(f=>String(f.username||'').toLowerCase()===key);
  }
  function renderWorld(){
    const host=q('socialPaneWorld');if(!host)return;host.textContent='';const stack=document.createElement('div');stack.className='socialStack';host.appendChild(stack);
    if(!signedIn()){signedOut(stack);return;}
    if(!identity().hasUsername){handleChooser(stack);return;}
    const why=capabilityReason('worldChat');
    if(why){stack.appendChild(line('WORLD CHAT UNAVAILABLE',why,'warn'));stack.appendChild(button('RECHECK CAPABILITIES',()=>refresh(true),'socialAction alt',S.busy));return;}
    connectionNotice(stack);const netOff=transportReason();
    stack.appendChild(channelHero());
    if(S.worldProfile){
      const friend=S.friends.some(f=>String(f.username||'').toLowerCase()===S.worldProfile.toLowerCase()),p=document.createElement('section');p.className='socialVisualHero socialWorldProfile';p.appendChild(avatar(S.worldProfile,friend?String(S.presence[S.worldProfile.toLowerCase()]||'offline'):''));
      const copy=document.createElement('div');copy.className='socialHeroText';const label=document.createElement('small');label.textContent='PLAYER PROFILE · '+safeName(S.worldProfile);copy.appendChild(label);const chip=document.createElement('b');chip.className='socialUsernameChip';chip.textContent=safeName(S.worldProfile);copy.appendChild(chip);const detail=document.createElement('p');detail.textContent=(friend?'Accepted friend · messaging and lobby actions available.':'Public commander · not currently an accepted friend.')+' Private account details and last-seen are never shown.';copy.appendChild(detail);p.appendChild(copy);p.appendChild(button('CLOSE PROFILE',()=>{S.worldProfile='';renderWorld();},'socialAction alt'));stack.appendChild(p);
    }
    const feed=document.createElement('div');feed.id='socialWorldFeed';feed.className='socialWorldFeed';feed.setAttribute('role','log');feed.setAttribute('aria-live','polite');
    if(S.worldBusy&&!S.worldMessages.length)feed.appendChild(line('LOADING WORLD CHAT','Fetching the latest public messages…'));
    else if(!S.worldMessages.length)feed.appendChild(line('NO WORLD MESSAGES','Be the first commander to open the channel.'));
    for(const row of S.worldMessages.slice().reverse()){
      const card=document.createElement('article');card.className='socialWorldMessage'+(row.self?' mine':'');
      const head=document.createElement('div');head.className='socialWorldHead';head.appendChild(avatar(row.username,row.friend?'online':'',true));const name=document.createElement('b');name.textContent=safeName(row.username)+(row.self?' · YOU':'');head.appendChild(name);
      const at=document.createElement('small');const dt=new Date(Number(row.at)||0);at.textContent=Number(row.at)?dt.toLocaleString():'';head.appendChild(at);card.appendChild(head);
      const body=document.createElement('div');body.className='socialWorldText';body.textContent=String(row.body||'').slice(0,2000);card.appendChild(body);
      const acts=document.createElement('div');acts.className='socialActs';const friend=worldIsFriend(row),self=row.self===true;
      acts.appendChild(button('VIEW',()=>{S.worldProfile=safeName(row.username);renderWorld();},'socialAction alt',false));
      const addWhy=self?'This is your profile.':friend?'Already an accepted friend.':netOff;
      acts.appendChild(button('ADD FRIEND',()=>requestFriend(row.username),'socialAction',S.busy||!!addWhy,addWhy));
      const pmWhy=self?'This is your profile.':!friend?'Private messages require an accepted friendship.':capabilityReason('chat')||netOff;
      acts.appendChild(button('PRIVATE MESSAGE',()=>selectFriend(row.username),'socialAction',!!pmWhy,pmWhy));
      let inviteWhy='';if(self)inviteWhy='This is your profile.';else if(!friend)inviteWhy='Lobby invites require an accepted friendship.';else if(!S.lobby)inviteWhy='Create or join a Co-op or Versus lobby first.';else if(!S.caps||S.caps.invites!==true)inviteWhy='Lobby invitations are not enabled on this server.';else inviteWhy=netOff;
      acts.appendChild(button('INVITE',()=>inviteFriend(row.username),'socialAction alt',!!inviteWhy,inviteWhy));
      const blockWhy=self?'You cannot block yourself.':capabilityReason('blocking')||netOff;
      acts.appendChild(button('BLOCK',()=>blockFriend(row.username),'socialAction danger',S.busy||!!blockWhy,blockWhy));
      const reportWhy=self?'You cannot report your own message.':capabilityReason('reporting')||netOff;
      acts.appendChild(button('REPORT',()=>reportWorld(row),'socialAction danger',S.worldBusy||!!reportWhy,reportWhy));
      card.appendChild(acts);feed.appendChild(card);
    }
    stack.appendChild(feed);
    const form=document.createElement('div');form.className='socialComposer';const ta=document.createElement('textarea');ta.id='socialWorldBody';ta.maxLength=500;ta.placeholder='Message World Chat';ta.setAttribute('aria-label','World Chat message');ta.value=S.worldDraft;ta.disabled=!!netOff;ta.addEventListener('input',()=>{S.worldDraft=ta.value;});form.appendChild(ta);form.appendChild(button('SEND',()=>sendWorldMessage(ta),'socialAction',S.worldBusy||!!netOff,netOff));stack.appendChild(form);
    stack.appendChild(button(S.worldBusy?'REFRESHING…':'REFRESH WORLD CHAT',()=>loadWorldMessages(),'socialAction alt',S.worldBusy||!!netOff,netOff));
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{const log=q('socialWorldFeed');if(log)log.scrollTop=log.scrollHeight;});
  }
  function renderChat(){
    const host=q('socialPaneChat');if(!host)return;host.textContent='';const stack=document.createElement('div');stack.className='socialStack';host.appendChild(stack);
    if(!signedIn()){signedOut(stack);return;}
    if(!identity().hasUsername){handleChooser(stack);return;}
    const why=capabilityReason('chat');
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
    if(!identity().hasUsername){handleChooser(grid);return;}
    if(!S.caps||S.caps.lobbies!==true){grid.appendChild(line('PLAYER LOBBIES UNAVAILABLE',capabilityReason('lobbies'),'warn'));grid.appendChild(button('RECHECK CAPABILITIES',()=>refresh(true),'socialAction alt',S.busy));return;}
    connectionNotice(grid);const netOff=transportReason(),locked=S.lobbyBusy||!!netOff||!!S.launchReceipt;
    const status=document.createElement('div');status.className='socialCard';const h=document.createElement('h3');h.textContent=S.lobby?'STAGING LOBBY · '+S.lobby.code:'PLAYER LOBBY';status.appendChild(h);
    if(!S.lobby){
      status.appendChild(line('NO ACTIVE LOBBY','Create a private staging room or enter a friend’s eight-character code.'));
      const create=document.createElement('div');create.className='socialCreate';
      const mode=document.createElement('select');mode.setAttribute('aria-label','Lobby mode');
      for(const x of [['coop','CO-OP VS AI'],['skirmish','SKIRMISH · 2P']]){const o=document.createElement('option');o.value=x[0];o.textContent=x[1];o.selected=S.lobbyDraft.mode===x[0];mode.appendChild(o);}mode.disabled=locked;mode.addEventListener('change',()=>{S.lobbyDraft.mode=mode.value==='skirmish'?'skirmish':'coop';if(S.lobbyDraft.mode==='skirmish')S.lobbyDraft.slots=2;renderLobby();});create.appendChild(mode);
      const slots=document.createElement('select');slots.setAttribute('aria-label','Lobby player slots');
      const allowedSlots=S.lobbyDraft.mode==='skirmish'?[2]:[2,3,4];if(!allowedSlots.includes(S.lobbyDraft.slots))S.lobbyDraft.slots=allowedSlots[0];
      for(const n of allowedSlots){const o=document.createElement('option');o.value=String(n);o.textContent=n+' PLAYERS';o.selected=S.lobbyDraft.slots===n;slots.appendChild(o);}slots.disabled=locked;slots.addEventListener('change',()=>{const n=Number(slots.value);S.lobbyDraft.slots=allowedSlots.includes(n)?n:allowedSlots[0];});create.appendChild(slots);
      create.appendChild(button(S.lobbyBusy?'CREATING…':'CREATE LOBBY',createLobby,'socialAction',locked,netOff));status.appendChild(create);
      const join=document.createElement('div');join.className='socialJoin';const input=document.createElement('input');input.maxLength=8;input.placeholder='Eight-character code';input.autocapitalize='characters';input.autocomplete='off';input.spellcheck=false;input.pattern='[A-Fa-f0-9]{8}';input.setAttribute('aria-label','Lobby code');input.disabled=locked;input.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,8);});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!locked){e.preventDefault();joinLobby(input.value);}});join.appendChild(input);join.appendChild(button('JOIN',()=>joinLobby(input.value),'socialAction',locked,netOff));status.appendChild(join);
    }else{
      const rule=S.lobby.rules||{},members=Array.isArray(S.lobby.members)?S.lobby.members:[];status.appendChild(line('RULES',String(rule.mode||'skirmish').toUpperCase()+' · '+String(rule.map||'auto').toUpperCase()+' · '+Number(rule.slots||2)+' SLOTS','good'));
      sectionTitle(status,'ROSTER',members.length);
      const submitted=S.lobbyCompatibility&&S.lobbyCompatibility.lobbyId===S.lobby.id&&S.lobbyCompatibility.revision===S.lobby.revision;
      const roster=document.createElement('div');roster.className='socialNamedGrid';
      for(const m of members){
        const verified=m.compatible===true&&m.compatibilityRevision===S.lobby.revision;
        const build=verified?'BUILD VERIFIED':(m.self&&submitted?'BUILD SUBMITTED · SERVER ROSTER PENDING':'BUILD VERIFICATION PENDING');
        roster.appendChild(lobbyMemberCard(m,build,verified));
      }
      status.appendChild(roster);
      const me=members.find(m=>m.self),acts=document.createElement('div');acts.className='socialToolbar';
      acts.appendChild(button(me&&me.ready?'NOT READY':'READY',()=>setLobbyReady(!(me&&me.ready)),'socialAction',locked,netOff));
      acts.appendChild(button('REFRESH',refreshLobby,'socialAction alt',locked,netOff));acts.appendChild(button('LEAVE',leaveLobby,'socialAction danger',locked,netOff));status.appendChild(acts);
      const launch=document.createElement('div');launch.className='socialLaunch';
      const runtime=window.MFMatchRuntime,runtimeReady=!!(runtime&&typeof runtime.ready==='function'&&runtime.ready());
      const realtime=S.caps.realtimeMatch===true;
      if(S.launchReceipt){
        const rs=runtime&&typeof runtime.status==='function'?runtime.status():{state:'unavailable'};
        launch.appendChild(line('CREDENTIAL HANDED TO MATCH RUNTIME','Seat '+S.launchReceipt.seat+' · '+String(rs.state||'connecting').toUpperCase()+'. The credential is not stored or displayed.','good'));
      }else if(S.caps.matchLaunch!==true){
        launch.appendChild(line('VERIFIED MATCH PREPARATION OFF','The server has not enabled immutable build verification and launch credentials.','warn'));
      }else{
        launch.appendChild(line(submitted?'THIS BUILD SUBMITTED':'VERIFY EXECUTING BUILD',submitted
          ?'Compatibility is bound to lobby revision '+S.lobby.revision+'. Any roster or ready change requires another verification.'
          :'Hash the executing packaged or OTA game, then submit it for this exact lobby revision.',submitted?'good':'warn'));
        const launchActions=document.createElement('div');launchActions.className='socialToolbar';
        launchActions.appendChild(button(S.lobbyBusy?'VERIFYING…':(submitted?'VERIFY AGAIN':'VERIFY THIS BUILD'),verifyLobbyBuild,'socialAction alt',locked,netOff));
        const full=members.length===Number(rule.slots),allReady=full&&members.every(m=>m.ready===true);
        const allVerified=allReady&&members.every(m=>m.compatible===true&&m.compatibilityRevision===S.lobby.revision);
        const handoff=realtime&&runtimeReady&&typeof window.mfMatchCredentialHandoff==='function';
        if(me&&me.host){
          let why='';if(!full)why='Every configured seat must be occupied.';else if(!allReady)why='Every player must be ready.';
          else if(!allVerified)why='Every current seat must have server-confirmed build verification.';
          else if(!realtime)why='The server has not enabled realtime match rooms.';
          else if(!runtimeReady)why='A deterministic match command consumer is not registered.';
          else if(!handoff)why='The trusted match runtime handoff is not connected.';
          launchActions.appendChild(button(S.lobbyBusy?'PREPARING…':'PREPARE MATCH',prepareMatch,'socialAction',locked||!!why,netOff||why));
        }else launch.appendChild(line('HOST PREPARATION','Only the lobby host can prepare the immutable match roster.'));
        if(S.preparedMatch){
          launch.appendChild(line('MATCH PREPARED','The server closed the roster. A credential can be handed only to the trusted runtime.','good'));
          launchActions.appendChild(button('RETRY RUNTIME HANDOFF',handoffPreparedMatch,'socialAction',locked||!handoff,netOff||(!handoff?'The trusted match runtime handoff is not connected.':'')));
        }
        launch.appendChild(launchActions);
      }
      if(!realtime){
        launch.appendChild(line('MATCH RELAY NOT CONNECTED','The server has not advertised realtimeMatch for this account and build.','warn'));
        launch.appendChild(line('REALTIME GAMEPLAY LOCKED','Roster verification remains available, but live commands cannot start.','warn'));
      }else if(!runtimeReady){
        launch.appendChild(line('MATCH DISPATCHER NOT CONNECTED','The relay is available, but no deterministic simulation consumer is registered.','warn'));
        launch.appendChild(line('REALTIME GAMEPLAY LOCKED','No remote command will be applied through selection-bound local input functions.','warn'));
      }else launch.appendChild(line('REALTIME MATCH RUNTIME READY','Versioned relay, strict command consumer and credential handoff are connected.','good'));
      status.appendChild(launch);
    }grid.appendChild(status);
    const invites=document.createElement('div');invites.className='socialCard';const ih=document.createElement('h3');ih.textContent='LOBBY INVITATIONS';invites.appendChild(ih);
    if(!S.caps.invites)invites.appendChild(line('INVITATIONS OFF',capabilityReason('invites'),'warn'));
    else if(!S.lobbyInvites.length)invites.appendChild(line('NO PENDING INVITES','Invitations from accepted friends will appear here.'));
    else for(const i of S.lobbyInvites){const row=document.createElement('div');row.className='socialInvite';row.appendChild(line('FROM '+safeName(i.from),'LOBBY '+i.code));const a=document.createElement('div');a.className='socialActs';a.appendChild(button('ACCEPT',()=>respondLobbyInvite(i,true),'socialAction',locked,netOff));a.appendChild(button('DECLINE',()=>respondLobbyInvite(i,false),'socialAction alt',locked,netOff));row.appendChild(a);invites.appendChild(row);}grid.appendChild(invites);
  }
  async function refresh(force){
    syncSession();const stamp=S.session,epoch=++S.epoch,priorCaps=S.caps;
    S.busy=true;S.reason='';S.gate='';S.connection=offline()?'offline':'checking';
    if(!signedIn()){S.caps=null;S.friends=[];S.incoming=[];S.busy=false;S.connection='signed-out';render();return;}
    if(!identity().hasUsername){S.caps=null;S.friends=[];S.incoming=[];S.busy=false;S.connection='identity-required';S.gate='username';render();return;}
    render();const h=await socialCall('handshake',!!force);
    if(epoch!==S.epoch||stamp!==sessionStamp()){syncSession();render();return;}
    if(!h||!h.ok){
      const cached=priorCaps&&priorCaps.handshake===true&&(h&&h.code==='offline'||h&&h.code==='network'||h&&h.code==='timeout');
      S.caps=cached?priorCaps:null;S.reason=(h&&h.message)||'The server did not confirm social capabilities.';
      S.gate=(typeof mfSocialGate==='function')?mfSocialGate(h):'';
      S.connection=h&&(h.code==='offline'||h.code==='network')?'offline':'limited';S.busy=false;render();return;
    }
    S.gate='ok';
    S.caps=h.capabilities||caps();
    if(S.caps.friends!==true){S.friends=[];S.incoming=[];}
    if(S.caps.presence!==true)S.presence={};
    if(S.caps.onlineCount!==true){S.onlinePlayers=null;S.onlineUpdatedAt=0;}
    if(S.caps.chat!==true){S.threadEpoch++;S.messageBusy=false;S.selected='';S.messages=[];S.messageDraft='';}
    if(S.caps.worldChat!==true){S.worldBusy=false;S.worldMessages=[];S.worldDraft='';S.worldProfile='';}
    if(S.caps.invites!==true)S.lobbyInvites=[];
    if(S.caps.lobbies!==true)S.lobby=null;
    const jobs=[];
    if(S.caps.friends===true)jobs.push(socialCall('friends').then(r=>({kind:'friends',r})));
    if(S.caps.worldChat===true)jobs.push(socialCall('worldMessages',null,30).then(r=>({kind:'world',r})));
    if(S.caps.onlineCount===true)jobs.push(socialCall('onlineHeartbeat').then(r=>({kind:'online',r})));
    if(S.caps.presence===true)jobs.push(socialCall('presence').then(r=>({kind:'presence',r})));
    if(S.caps.invites===true)jobs.push(socialCall('lobbyInvites').then(r=>({kind:'lobbyInvites',r})));
    if(S.caps.lobbies===true&&S.lobby)jobs.push(socialCall('getLobby',S.lobby.id).then(r=>({kind:'lobby',r})));
    const rows=await Promise.all(jobs);if(epoch!==S.epoch||stamp!==sessionStamp()){syncSession();render();return;}
    let sawOffline=false,launchedMatch=null;
    for(const x of rows){
      if(x.kind==='friends'&&x.r&&x.r.ok){S.friends=x.r.friends||[];S.incoming=x.r.incoming||[];}
      else if(x.kind==='world'&&x.r&&x.r.ok)S.worldMessages=x.r.messages||[];
      else if(x.kind==='online'&&x.r&&x.r.ok){S.onlinePlayers=x.r.count;S.onlineUpdatedAt=Date.now();}
      else if(x.kind==='presence'&&x.r&&x.r.ok){S.presence={};for(const p of x.r.friends||[])S.presence[String(p.username).toLowerCase()]=p.state;}
      else if(x.kind==='lobbyInvites'&&x.r&&x.r.ok)S.lobbyInvites=x.r.invites||[];
      else if(x.kind==='lobby'&&x.r&&x.r.ok&&x.r.lobby)adoptLobby(x.r.lobby);
      else if(x.kind==='lobby'&&x.r&&x.r.ok&&x.r.match)launchedMatch=x.r.match;
      else if(x.r&&!x.r.ok){if(x.kind==='online')S.onlinePlayers=null;if(!S.reason)S.reason=x.r.message||'';if(x.r.code==='offline'||x.r.code==='network')sawOffline=true;}
    }
    S.connection=S.reason?(sawOffline?'offline':'limited'):'ready';S.busy=false;render();
    if(launchedMatch)await acceptLaunchedMatch(launchedMatch,false);
  }
  function socialScreenVisible(){
    const scr=q('socialScr');return !!(scr&&scr.style.display!=='none'&&
      (typeof document==='undefined'||document.visibilityState!=='hidden'));
  }
  async function refreshOnlineAggregate(){
    syncSession();
    if(S.onlineBusy||!socialScreenVisible()||offline()||!signedIn()||!identity().hasUsername||!S.caps||S.caps.onlineCount!==true)return;
    S.onlineBusy=true;const stamp=S.session,r=await socialCall('onlineHeartbeat');S.onlineBusy=false;
    if(stamp!==sessionStamp())return;
    if(r&&r.ok){S.onlinePlayers=r.count;S.onlineUpdatedAt=Date.now();}
    else{S.onlinePlayers=null;noteTransportFailure(r);}
    renderFriends();statusDot();
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
  async function loadWorldMessages(silent){
    if(S.worldBusy||transportReason()||!signedIn()||!S.caps||S.caps.worldChat!==true)return;
    const stamp=S.session;S.worldBusy=true;if(!silent)renderWorld();const r=await socialCall('worldMessages',null,30);
    if(stamp!==sessionStamp())return;S.worldBusy=false;noteTransportFailure(r);
    if(r&&r.ok)S.worldMessages=r.messages||[];else if(!silent)say((r&&r.message)||'Could not load World Chat.');
    renderWorld();
  }
  async function sendWorldMessage(input){
    if(S.worldBusy||transportReason()||!S.caps||S.caps.worldChat!==true)return;
    const body=String(input&&input.value||S.worldDraft);S.worldDraft=body;S.worldBusy=true;renderWorld();const r=await socialCall('sendWorldMessage',body);S.worldBusy=false;noteTransportFailure(r);
    if(r&&r.ok){S.worldDraft='';say('World Chat message posted.');await loadWorldMessages(true);return;}
    say((r&&r.message)||'Could not post to World Chat.');renderWorld();
  }
  async function reportWorld(row){
    if(S.worldBusy||transportReason()||!row||row.self||!S.caps||S.caps.reporting!==true)return;
    let reason='';if(typeof window.prompt==='function')reason=window.prompt('Why are you reporting this World Chat message?','Spam or harassment')||'';
    else reason='World Chat safety report';
    reason=String(reason).trim();if(!reason)return;
    S.worldBusy=true;renderWorld();const r=await socialCall('reportWorldMessage',row.id,reason);S.worldBusy=false;noteTransportFailure(r);
    say(r&&r.ok?'World Chat message reported for review.':(r&&r.message)||'Could not submit report.');renderWorld();
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
    if(S.lobbyBusy||transportReason())return;const mode=S.lobbyDraft.mode==='skirmish'?'skirmish':'coop',n=Number(S.lobbyDraft.slots),slots=mode==='skirmish'?2:([2,3,4].includes(n)?n:2);S.lobbyDraft.mode=mode;S.lobbyDraft.slots=slots;S.lobbyBusy=true;render();const rules={mode,slots,map:'auto'},r=await socialCall('createLobby',rules);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby){adoptLobby(r.lobby);say('Lobby created · '+S.lobby.code);}else say((r&&r.message)||'Could not create lobby.');render();
  }
  async function joinLobby(code){
    if(S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('joinLobby',code);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby){adoptLobby(r.lobby);say('Joined lobby '+S.lobby.code+'.');}else say((r&&r.message)||'Could not join lobby.');render();
  }
  async function refreshLobby(){
    if(!S.lobby||S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('getLobby',S.lobby.id);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby)adoptLobby(r.lobby);
    else if(r&&r.ok&&r.match){await acceptLaunchedMatch(r.match,false);return;}
    else say((r&&r.message)||'Lobby is unavailable.');render();
  }
  async function setLobbyReady(ready){
    if(!S.lobby||S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('readyLobby',S.lobby.id,S.lobby.revision,ready);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.lobby)adoptLobby(r.lobby);else say((r&&r.message)||'Could not update ready state.');render();
  }
  async function leaveLobby(){
    if(!S.lobby||S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('leaveLobby',S.lobby.id,S.lobby.revision);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok){adoptLobby(null);say('Left lobby.');}else say((r&&r.message)||'Could not leave lobby.');render();
  }
  async function inviteFriend(name){
    if(!S.lobby||S.lobbyBusy||transportReason()||!S.caps||S.caps.invites!==true)return;S.lobbyBusy=true;render();const r=await socialCall('inviteLobby',S.lobby.id,name);S.lobbyBusy=false;noteTransportFailure(r);
    say(r&&r.ok?'Lobby invitation sent to '+safeName(name)+'.':(r&&r.message)||'Could not send invitation.');render();
  }
  async function respondLobbyInvite(invite,accept){
    if(S.lobbyBusy||transportReason())return;S.lobbyBusy=true;render();const r=await socialCall('respondLobbyInvite',invite.id,accept);S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok){if(accept&&r.lobby)adoptLobby(r.lobby);S.lobbyInvites=S.lobbyInvites.filter(i=>i.id!==invite.id);}
    say(r&&r.ok?(accept?'Lobby joined.':'Invitation declined.'):(r&&r.message)||'Could not answer invitation.');render();
  }
  function adoptLobby(next){
    const old=S.lobby,changed=!old||!next||old.id!==next.id||old.revision!==next.revision;
    S.lobby=next||null;
    if(changed){S.lobbyCompatibility=null;S.preparedMatch=null;S.launchReceipt=null;}
  }
  async function acceptLaunchedMatch(match,quiet){
    if(!match||!S.lobby||match.lobbyId!==S.lobby.id||S.launchReceipt)return false;
    S.preparedMatch=match;
    if(!quiet)say('Match launched · claiming your assigned seat.');
    render();
    if(S.caps&&S.caps.realtimeMatch===true&&window.MFMatchRuntime&&MFMatchRuntime.ready()&&
       typeof window.mfMatchCredentialHandoff==='function')await handoffPreparedMatch();
    return true;
  }
  async function pollLobbyLaunch(){
    if(lobbyPollBusy||S.lobbyBusy||S.busy||!S.lobby||S.launchReceipt||S.preparedMatch||transportReason()||
       !signedIn()||!S.caps||S.caps.matchLaunch!==true||S.caps.realtimeMatch!==true||
       typeof document!=='undefined'&&document.visibilityState==='hidden')return;
    const members=Array.isArray(S.lobby.members)?S.lobby.members:[],slots=Number(S.lobby.rules&&S.lobby.rules.slots)||2;
    if(members.length!==slots||!members.every(m=>m.ready===true&&m.compatible===true&&m.compatibilityRevision===S.lobby.revision))return;
    const id=S.lobby.id,revision=S.lobby.revision;lobbyPollBusy=true;
    const r=await socialCall('getLobby',id);lobbyPollBusy=false;
    if(!S.lobby||S.lobby.id!==id||S.lobby.revision!==revision)return;
    if(r&&r.ok&&r.match){await acceptLaunchedMatch(r.match,true);return;}
    if(r&&r.ok&&r.lobby)adoptLobby(r.lobby);
  }
  async function verifyLobbyBuild(){
    if(!S.lobby||S.lobbyBusy||transportReason()||!S.caps||S.caps.matchLaunch!==true)return;
    const id=S.lobby.id,revision=S.lobby.revision,rules=S.lobby.rules,epoch=S.epoch;
    S.lobbyBusy=true;render();const r=await socialCall('verifyLobbyCompatibility',id,revision,rules);
    if(epoch!==S.epoch||!S.lobby||S.lobby.id!==id||S.lobby.revision!==revision){S.lobbyBusy=false;render();return;}
    S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.compatibility){S.lobbyCompatibility=r.compatibility;say('This build was submitted for lobby revision '+revision+'.');}
    else say((r&&r.message)||'Could not verify this executing build.');render();
  }
  async function prepareMatch(){
    if(!S.lobby||S.lobbyBusy||transportReason()||!S.caps||S.caps.matchLaunch!==true||S.caps.realtimeMatch!==true||
       !window.MFMatchRuntime||!MFMatchRuntime.ready()||typeof window.mfMatchCredentialHandoff!=='function')return;
    const members=Array.isArray(S.lobby.members)?S.lobby.members:[],slots=Number(S.lobby.rules&&S.lobby.rules.slots)||2;
    if(members.length!==slots||!members.every(m=>m.ready===true&&m.compatible===true&&m.compatibilityRevision===S.lobby.revision))return;
    const me=members.find(m=>m.self);if(!me||!me.host)return;
    const id=S.lobby.id,revision=S.lobby.revision,epoch=S.epoch;S.lobbyBusy=true;render();
    const r=await socialCall('launchLobby',id,revision,S.lobby.rules);
    if(epoch!==S.epoch||!S.lobby||S.lobby.id!==id||S.lobby.revision!==revision){S.lobbyBusy=false;render();return;}
    S.lobbyBusy=false;noteTransportFailure(r);
    if(!r||!r.ok||!r.match){say((r&&r.message)||'Could not prepare this match.');render();return;}
    S.preparedMatch=r.match;render();await handoffPreparedMatch();
  }
  async function handoffPreparedMatch(){
    if(!S.preparedMatch||S.lobbyBusy||!S.caps||S.caps.realtimeMatch!==true||!window.MFMatchRuntime||
       !MFMatchRuntime.ready()||typeof window.mfMatchCredentialHandoff!=='function')return;
    const match=S.preparedMatch,epoch=S.epoch;S.lobbyBusy=true;render();
    const r=await socialCall('claimMatchCredential',match,S.lobby&&S.lobby.rules,window.mfMatchCredentialHandoff);
    if(epoch!==S.epoch){S.lobbyBusy=false;render();return;}
    S.lobbyBusy=false;noteTransportFailure(r);
    if(r&&r.ok&&r.receipt){S.launchReceipt=r.receipt;S.preparedMatch=null;say('Match credential handed to the runtime.');}
    else say((r&&r.message)||'The match runtime handoff did not complete.');render();
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
  window.MFSocialUI={init:initSocialUIImpl,open,refresh,refreshOnline:refreshOnlineAggregate,refreshWorld:loadWorldMessages,setTab,renderInboxMessages:renderInboxBridge,state:S};
  function initSocialUIImpl(){
    ensureShell();syncSession();
    if(typeof window!=='undefined'&&!window.__mfSocialNetworkBound){
      window.__mfSocialNetworkBound=true;
      window.addEventListener('offline',()=>{S.connection='offline';S.reason=SOCIAL_OFFLINE;render();});
      window.addEventListener('online',()=>{
        if(S.connection==='offline'){S.connection='limited';S.reason='Connection restored — refresh Social Command to sync current status.';render();refreshOnlineAggregate();}
      });
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshOnlineAggregate();});
    }
    if(!lobbyPollTimer&&typeof setInterval==='function')lobbyPollTimer=setInterval(pollLobbyLaunch,1500);
    if(!onlinePollTimer&&typeof setInterval==='function')onlinePollTimer=setInterval(refreshOnlineAggregate,45000);
    if(!worldPollTimer&&typeof setInterval==='function')worldPollTimer=setInterval(()=>{if(S.tab==='world'&&socialScreenVisible())loadWorldMessages(true);},8000);
    render();
  }
})();

function initSocialUI(){ if(window.MFSocialUI)window.MFSocialUI.init(); }
function mfSocialRenderInboxMessages(){ if(window.MFSocialUI)window.MFSocialUI.renderInboxMessages(); }
