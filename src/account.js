;
;
/* ============================================================================
   ACCOUNTS
   ----------------------------------------------------------------------------
   Three things live here, and they are deliberately independent:

     IDENTITY   who you are — a device profile, or a Google / Facebook account
     LINKING    attaching one of those accounts to a local profile you already
                have, so signing in never costs you your progress
     TRANSFER   getting a save from one device to another

   They are separate because only the first two need a sign-in provider and only
   the third needs to work when there is no server at all. Portable .mfsave
   files therefore do the whole job offline: save one to Files or Drive, then
   load that actual game-save file on another device.

   SOCIAL SIGN-IN WAS REMOVED. Google and Facebook need OAuth app IDs a shipped
   build cannot invent, so the buttons were permanently inert — and worse, the
   "not configured" message rendered behind the profile overlay, so they looked
   broken rather than unavailable. Save files cover the actual need (moving a
   career between devices) with no server, no login, and nothing that can go
   down. The sign-in machinery below is kept but unreferenced by the UI, so a
   future build with real credentials can switch it back on by restoring the
   provider buttons in renderAccount().

   `assets/auth.json` is still read at boot for `syncUrl`, and an account that
   was linked by an older build still loads and still syncs.
   ============================================================================ */

let AUTH_CFG={googleClientId:'',facebookAppId:'',syncUrl:''};
let ACCOUNT=null;                       // {provider,id,name,email,picture,at}
let SYNC={state:'off', last:0, err:''};
const ACC_KEY='massfront_account_v1';

function accSave(){
  try{ localStorage.setItem(ACC_KEY,JSON.stringify(ACCOUNT)); }catch(e){}
}
function accLoad(){
  try{ const s=localStorage.getItem(ACC_KEY); if(s) ACCOUNT=JSON.parse(s); }catch(e){ ACCOUNT=null; }
}
function accProviderReady(p){
  return p==='google' ? !!AUTH_CFG.googleClientId
       : p==='facebook' ? !!AUTH_CFG.facebookAppId : true;
}
function loadScript(src,id){
  return new Promise((res,rej)=>{
    if(document.getElementById(id)) return res();
    const s=document.createElement('script');
    s.src=src; s.id=id; s.async=true; s.defer=true;
    s.onload=()=>res(); s.onerror=()=>rej(new Error('blocked'));
    document.head.appendChild(s);
  });
}
/* An ID token is a JWT. The payload is readable without the signature, which is
   all the client needs to show a name and a picture — but it is NOT proof of
   anything. Only the server may treat this token as an identity, and only after
   verifying the signature against the provider's keys. */
function jwtPayload(t){
  try{
    const p=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  }catch(e){ return null; }
}

/* ---- SIGN IN --------------------------------------------------------------- */
/* ---- ON-DEVICE PROVIDER SETUP --------------------------------------------
   Google and Facebook sign-in need an OAuth client ID, and a packaged build has
   no way to learn one — so the buttons could only ever say "not configured" and
   stop. Worse, they said it through a toast that was rendering behind the
   profile screen, so they read as broken rather than unconfigured.

   Credentials can now be supplied on the device, the same way the update server
   can. These are PUBLIC identifiers, not secrets: a Google Client ID and a
   Facebook App ID are compiled into every web and mobile client that uses them
   and are safe to hold in localStorage. The OAuth flow still authenticates
   against the provider, so a wrong ID fails at Google's end, not ours.        */
const AUTH_KEYS={google:'massfront_auth_google', facebook:'massfront_auth_fb', sync:'massfront_sync_url'};
function authSet(kind,val){
  try{
    if(val&&val.trim()) localStorage.setItem(AUTH_KEYS[kind],val.trim());
    else localStorage.removeItem(AUTH_KEYS[kind]);
  }catch(e){}
  if(kind==='google') AUTH_CFG.googleClientId=(val||'').trim();
  else if(kind==='facebook') AUTH_CFG.facebookAppId=(val||'').trim();
  else AUTH_CFG.syncUrl=(val||'').trim();
  renderAccount();
}
function authLoadDevice(){
  try{
    const g=localStorage.getItem(AUTH_KEYS.google); if(g) AUTH_CFG.googleClientId=g;
    const f=localStorage.getItem(AUTH_KEYS.facebook); if(f) AUTH_CFG.facebookAppId=f;
    const s=localStorage.getItem(AUTH_KEYS.sync); if(s) AUTH_CFG.syncUrl=s;
  }catch(e){}
}
function authPrompt(kind){
  const cur = kind==='google'?AUTH_CFG.googleClientId
            : kind==='facebook'?AUTH_CFG.facebookAppId : AUTH_CFG.syncUrl;
  const msg = kind==='google'
      ? 'Google Client ID\n\nFrom Google Cloud Console → Credentials → OAuth 2.0 Client IDs (Web application).\nLooks like 1234-abc.apps.googleusercontent.com\n\nLeave blank to clear.'
      : kind==='facebook'
      ? 'Facebook App ID\n\nFrom developers.facebook.com → your app → Settings → Basic.\nA numeric ID.\n\nLeave blank to clear.'
      : 'Cloud save server URL\n\nThe https:// base address of your save endpoint.\n\nLeave blank to clear.';
  let v=null;
  try{ v=prompt(msg,cur||''); }catch(e){}
  if(v===null) return;
  authSet(kind,v);
  accToast(v.trim()?'Saved — try signing in now':'Cleared');
}

async function signInGoogle(){
  if(!AUTH_CFG.googleClientId){ authPrompt('google'); return; }
  accBusy(true);
  try{
    await loadScript('https://accounts.google.com/gsi/client','gsiSdk');
    await new Promise((res,rej)=>{
      google.accounts.id.initialize({
        client_id:AUTH_CFG.googleClientId,
        callback:r=>{
          const p=jwtPayload(r.credential);
          if(!p){ rej(new Error('bad token')); return; }
          linkAccount({provider:'google', id:p.sub, name:p.name||p.email||'Commander',
                       email:p.email||'', picture:p.picture||'', token:r.credential});
          res();
        }
      });
      /* One Tap first; if the browser suppresses it, fall back to the button
         flow rather than leaving the player staring at nothing. */
      google.accounts.id.prompt(n=>{
        if(n.isNotDisplayed&&n.isNotDisplayed()||n.isSkippedMoment&&n.isSkippedMoment()){
          const host=document.getElementById('gsiBtn');
          if(host){ host.innerHTML=''; host.style.display='block';
            google.accounts.id.renderButton(host,{theme:'filled_black',size:'large',width:260}); }
        }
      });
    });
  }catch(e){
    accToast('Could not reach Google sign-in');
  }
  accBusy(false);
}
async function signInFacebook(){
  if(!AUTH_CFG.facebookAppId){ authPrompt('facebook'); return; }
  accBusy(true);
  try{
    await loadScript('https://connect.facebook.net/en_US/sdk.js','fbSdk');
    FB.init({appId:AUTH_CFG.facebookAppId, version:'v19.0', xfbml:false, cookie:true});
    const r=await new Promise(res=>FB.login(res,{scope:'public_profile,email'}));
    if(!r||!r.authResponse) throw new Error('cancelled');
    const me=await new Promise(res=>FB.api('/me',{fields:'id,name,email,picture.width(128)'},res));
    linkAccount({provider:'facebook', id:me.id, name:me.name||'Commander',
                 email:me.email||'', picture:(me.picture&&me.picture.data&&me.picture.data.url)||'',
                 token:r.authResponse.accessToken});
  }catch(e){
    accToast('Facebook sign-in did not complete');
  }
  accBusy(false);
}
function signOut(){
  ACCOUNT=null; accSave();
  SYNC={state:'off',last:0,err:''};
  renderAccount(); toast('Signed out — your progress stays on this device');
}

/* ---- LINKING ---------------------------------------------------------------
   Signing in attaches the account to the profile you are ALREADY playing. That
   is the whole point: a player with forty matches of progress must never be
   handed an empty career because they pressed a sign-in button. If the server
   turns out to hold a save for this account too, the pull step below decides
   between them — it never silently overwrites. */
function linkAccount(a){
  a.at=Date.now();
  ACCOUNT=a; accSave();
  const p=activeProf();
  if(p){ p.link={provider:a.provider,id:a.id,name:a.name}; profSave(); }
  renderAccount(); renderProfile();
  toast('✓ Signed in as '+a.name+' — this profile is now linked');
  syncPush();
}

/* ---- CLOUD SYNC ------------------------------------------------------------
   The contract is deliberately tiny, so any backend can serve it:

     POST  {syncUrl}/save   {provider,id,token,payload}     -> {ok:true,at}
     POST  {syncUrl}/load   {provider,id,token}             -> {ok:true,at,payload}

   The server MUST verify `token` against the provider before trusting `id`.
   Everything below degrades quietly when `syncUrl` is unset: the game keeps
   playing, saves keep working, and the panel says sync is off. */
function accFetch(url, opts){
  /* Local installer files (auth.json) are not a server. Everything else in
     this file is an account/cloud call and must honour the offline gate —
     a hanging Google/Facebook/cloud fetch used to ignore netAllowed() and
     spin until timeout while the rest of the game already knew it was offline. */
  if(typeof netAllowed==='function' && !netAllowed()) throw new Error('offline');
  if(typeof netFetch==='function') return netFetch(url, opts);
  return fetch(url, opts);
}
function syncPayload(){
  return {v:1, at:Date.now(), profile:activeProf(), meta:META};
}
async function syncPush(){
  if(!AUTH_CFG.syncUrl||!ACCOUNT) return;
  SYNC.state='syncing'; renderAccount();
  try{
    const r=await accFetch(AUTH_CFG.syncUrl.replace(/\/$/,'')+'/save',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({provider:ACCOUNT.provider,id:ACCOUNT.id,token:ACCOUNT.token,
                           payload:syncPayload()})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    SYNC.state='ok'; SYNC.last=Date.now(); SYNC.err='';
  }catch(e){
    /* A failed push is not an error the player needs to act on — it retries on
       the next save. Only a failed PULL is worth interrupting them for. */
    SYNC.state='pending'; SYNC.err='';
  }
  renderAccount();
}
async function syncPull(){
  if(!AUTH_CFG.syncUrl||!ACCOUNT){ accToast('Cloud saves are not configured for this build'); return; }
  SYNC.state='syncing'; renderAccount();
  try{
    const r=await accFetch(AUTH_CFG.syncUrl.replace(/\/$/,'')+'/load',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({provider:ACCOUNT.provider,id:ACCOUNT.id,token:ACCOUNT.token})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    if(!j||!j.payload){ SYNC.state='ok'; SYNC.last=Date.now(); renderAccount();
      toast('No cloud save yet — this device is now the master copy'); syncPush(); return; }
    applyIncoming(j.payload,'cloud');
  }catch(e){
    SYNC.state='error'; SYNC.err='Could not reach the save server'; renderAccount();
  }
}
/* Never overwrite silently. Progress is compared on the one axis a player would
   compare it on themselves — how far the career has actually got — and the
   choice is theirs whenever both sides have something worth keeping. */
/* Cores are deliberately NOT weighed. They are the one term in this sum an
   imported .mfsave can set to anything, and at x3 a forged balance outweighs
   every honest axis combined — so the file that lies the hardest wins the merge
   and overwrites the real career. XP, research and matches all cost time to
   accumulate; a spendable currency is not evidence of progress. */
function careerWeight(m){ return (m?(m.xp||0):0)+(m?(m.researchData||0):0)*8+(m?(m.matches||0):0)*40; }
/* Put a loaded career into the LIVE game, not only into localStorage.
   File/cloud restore used to write META then skip applySettings/applyColor
   and drop commander identity (char/title/frame), so the Profile and Settings
   screens showed the restored numbers while audio, lighting, livery and the
   worn commander stayed on the previous device's values until a reboot. */
function accApplySetupLive(){
  try{
    if(typeof wcChoice!=='undefined'){
      wcChoice=typeof clamp==='function'?clamp(META.wcPref|0,0,3):(META.wcPref|0);
      if(typeof document!=='undefined')
        document.querySelectorAll('.wbtn').forEach(b=>b.classList.toggle('on',+b.dataset.w===wcChoice));
    }
    const su=META.setup;
    if(su&&typeof su==='object'){
      if(su.pf&&typeof playerFaction!=='undefined'&&
         (typeof playableFactions!=='function'||playableFactions().includes(su.pf)))
        playerFaction=su.pf;
      if(su.pc&&typeof playerCommanderId!=='undefined'&&typeof commanderById==='function'){
        const facKey=typeof commanderFactionKey==='function'?commanderFactionKey(playerFaction):playerFaction;
        const C=commanderById(su.pc);
        const R=typeof COMMANDER_ROSTERS!=='undefined'?COMMANDER_ROSTERS[facKey]||[]:[];
        if(C&&!C.aiOnly&&R.indexOf(C)>=0) playerCommanderId=su.pc;
      }
    }
    if(typeof renderCommanderRow==='function') renderCommanderRow();
    if(typeof renderFacRow==='function') renderFacRow();
  }catch(e){}
}
function applyCareerPayload(p,src,opts){
  opts=opts||{};
  if(!p||!p.meta||typeof p.meta!=='object') return false;
  META=Object.assign({},META,p.meta);
  if(typeof metaHarden==='function') metaHarden();
  else {
    if(!META.owned||typeof META.owned!=='object') META.owned={};
    if(!META.facWins||typeof META.facWins!=='object') META.facWins={};
    if(!META.mapWins||typeof META.mapWins!=='object') META.mapWins={};
    if(!META.campaign||typeof META.campaign!=='object') META.campaign={missions:{}};
    if(!META.campaign.missions||typeof META.campaign.missions!=='object') META.campaign.missions={};
    if(typeof DEF_SETTINGS!=='undefined') META.settings=Object.assign({},DEF_SETTINGS,META.settings||{});
    if(typeof invBag==='function') invBag();
  }
  if(p.profile){
    const a=typeof activeProf==='function'?activeProf():null;
    if(a){
      if(p.profile.name) a.name=p.profile.name;
      if(p.profile.emblem) a.emblem=p.profile.emblem;
      if('char' in p.profile) a.char=p.profile.char;
      if('title' in p.profile) a.title=p.profile.title;
      if('frame' in p.profile) a.frame=p.profile.frame;
      if('link' in p.profile) a.link=p.profile.link;
      if(typeof profSave==='function') profSave();
    }
  }
  if(typeof metaSave==='function') metaSave();
  if(typeof applyColor==='function') try{ applyColor(); }catch(e){}
  if(typeof applySettings==='function') try{ applySettings(); }catch(e){}
  accApplySetupLive();
  /* UI refresh is best-effort. A restore that runs before boot finishes, or
     with a profile pane not in the DOM, must not abort after META is already
     written — that was persist-but-not-reload for the live game. */
  const accUi=fn=>{ try{ if(typeof fn==='function') fn(); }catch(e){} };
  accUi(renderMetaHead); accUi(renderProfile); accUi(renderAccount);
  accUi(renderSettings); accUi(renderBoosts); accUi(storyRefreshBadge);
  SYNC.state='ok'; SYNC.last=Date.now();
  if(!opts.quiet && typeof toast==='function') toast('✓ Restored from '+(src||'save'));
  return true;
}
function applyIncoming(p,src,force){
  const use=()=>{
    applyCareerPayload(p,src);
    /* An explicit file load is this device's new master copy. Mark pulled so
       a later auto-push cannot cloudPull and undo the file we just applied. */
    if(force) cloudMarkPulled();
  };
  if(force){ use(); return; }
  const mine=careerWeight(META), theirs=careerWeight(p&&p.meta);
  if(theirs>mine*1.02) use();
  else if(mine>theirs*1.02){
    accConfirm('This device is further along than the '+src+' save ('+
      Math.round(mine/1000)+'k vs '+Math.round(theirs/1000)+'k career score). Keep this device?',
      ()=>{ SYNC.state='ok'; syncPush(); }, use);
  } else use();
}

/* ---- CLOUD PAYLOAD CODEC ---------------------------------------------------
   Older cloud records use this compact tagged representation. Deflate when the
   platform has it, plain base64 when it does not; the reader detects which it
   was given. The local player-facing path is the binary file below. */
async function encodeSave(){
  const json=JSON.stringify(syncPayload());
  const bytes=new TextEncoder().encode(json);
  let out=bytes, tag='M1';
  if(typeof CompressionStream!=='undefined'){
    try{
      const cs=new CompressionStream('deflate-raw');
      const w=cs.writable.getWriter(); w.write(bytes); w.close();
      out=new Uint8Array(await new Response(cs.readable).arrayBuffer()); tag='M2';
    }catch(e){}
  }
  let s=''; for(let i=0;i<out.length;i++) s+=String.fromCharCode(out[i]);
  return tag+btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function decodeSave(code){
  code=String(code||'').trim().replace(/\s+/g,'');
  const tag=code.slice(0,2); let b=code.slice(2);
  if(tag!=='M1'&&tag!=='M2') throw new Error('not a MASSFRONT save code');
  b=b.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b);
  let bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  if(tag==='M2'){
    const ds=new DecompressionStream('deflate-raw');
    const w=ds.writable.getWriter(); w.write(bytes); w.close();
    bytes=new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---- PORTABLE GAME-SAVE FILE ----------------------------------------------
   Layout (little-endian):
     8 bytes  "MFRTSAVE" magic
     2 bytes  file schema
     4 bytes  JSON payload length
     N bytes  UTF-8 save envelope
     32 bytes SHA-256 of the JSON payload

   This is a real binary file rather than a renamed save code. The header
   rejects unrelated files, the schema leaves room for migrations, and the
   digest catches truncation or corruption before any career is touched. */
const MF_SAVE_MAGIC=new Uint8Array([77,70,82,84,83,65,86,69]);
const MF_SAVE_SCHEMA=1, MF_SAVE_HEAD=14, MF_SAVE_HASH=32, MF_SAVE_MAX=5*1024*1024;
function mfSaveVersion(){
  return typeof APP_VERSION!=='undefined' ? APP_VERSION : 'unknown';
}
function mfSaveEnvelope(){
  return {kind:'MASSFRONT_SAVE',schema:MF_SAVE_SCHEMA,gameVersion:mfSaveVersion(),
          exportedAt:Date.now(),payload:syncPayload()};
}
async function mfSaveDigest(bytes){
  if(typeof crypto==='undefined'||!crypto.subtle) throw new Error('save integrity checks unavailable');
  return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
}
async function mfSaveBytes(){
  const body=new TextEncoder().encode(JSON.stringify(mfSaveEnvelope()));
  const hash=await mfSaveDigest(body);
  const out=new Uint8Array(MF_SAVE_HEAD+body.length+MF_SAVE_HASH);
  out.set(MF_SAVE_MAGIC,0);
  const view=new DataView(out.buffer);
  view.setUint16(8,MF_SAVE_SCHEMA,true);
  view.setUint32(10,body.length,true);
  out.set(body,MF_SAVE_HEAD);
  out.set(hash,MF_SAVE_HEAD+body.length);
  return out;
}
function mfSaveName(){
  const p=activeProf();
  const who=String(p&&p.name||'Commander').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'Commander';
  const d=new Date(), pad=n=>String(n).padStart(2,'0');
  const stamp=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes());
  return 'MASSFRONT-'+who+'-'+stamp+'.mfsave';
}
function mfSaveEqual(a,b){
  if(a.length!==b.length) return false;
  let diff=0; for(let i=0;i<a.length;i++) diff|=a[i]^b[i];
  return diff===0;
}
function mfNativePlugin(name){
  const c=typeof window!=='undefined'&&window.Capacitor;
  return c&&c.Plugins&&c.Plugins[name]||null;
}
function mfBase64(bytes){
  let out='';
  /* Avoid apply/spread: a large career can exceed the JavaScript argument
     limit long before it reaches the save format's 5 MB safety ceiling. */
  for(let p=0;p<bytes.length;p+=0x8000){
    const end=Math.min(bytes.length,p+0x8000);
    for(let i=p;i<end;i++)out+=String.fromCharCode(bytes[i]);
  }
  return btoa(out);
}
async function mfWriteNative(bytes,name){
  const fs=mfNativePlugin('Filesystem');
  if(!fs||typeof fs.writeFile!=='function')return false;
  const data=mfBase64(bytes), path='MASSFRONT/Saves/'+name;
  let result=null,persistent=false;
  try{
    /* DOCUMENTS produces an actual user file on Android and an exportable
       document on iOS. If an older Android build denies shared storage, the
       cache copy below still reaches Files/Drive through the native share UI. */
    result=await fs.writeFile({path,data,directory:'DOCUMENTS',recursive:true});
    persistent=true;
  }catch(docErr){
    result=await fs.writeFile({path:'MASSFRONT/'+name,data,directory:'CACHE',recursive:true});
  }
  const share=mfNativePlugin('Share');
  if(share&&typeof share.share==='function'){
    await share.share({title:'MASSFRONT game save',text:'Portable MASSFRONT career save',
      files:[result.uri],dialogTitle:'Save MASSFRONT career file'});
  }else if(!persistent){
    throw new Error('native file sharing unavailable');
  }
  toast(persistent?'Saved in Documents/MASSFRONT/Saves':'Game save ready — choose Files or Drive');
  return true;
}
async function mfReadFile(file){
  if(!file||file.size<MF_SAVE_HEAD+MF_SAVE_HASH||file.size>MF_SAVE_MAX)
    throw new Error('invalid save file size');
  const all=new Uint8Array(await file.arrayBuffer());
  if(!MF_SAVE_MAGIC.every((v,i)=>all[i]===v)) throw new Error('not a MASSFRONT save file');
  const view=new DataView(all.buffer,all.byteOffset,all.byteLength);
  const schema=view.getUint16(8,true), n=view.getUint32(10,true);
  if(schema!==MF_SAVE_SCHEMA) throw new Error('unsupported save version');
  if(n<2||MF_SAVE_HEAD+n+MF_SAVE_HASH!==all.length) throw new Error('damaged save file');
  const body=all.slice(MF_SAVE_HEAD,MF_SAVE_HEAD+n);
  const want=all.slice(MF_SAVE_HEAD+n);
  if(!mfSaveEqual(await mfSaveDigest(body),want)) throw new Error('save file integrity check failed');
  const env=JSON.parse(new TextDecoder().decode(body));
  if(!env||env.kind!=='MASSFRONT_SAVE'||env.schema!==schema||!env.payload||
     !env.payload.meta||typeof env.payload.meta!=='object') throw new Error('invalid save contents');
  return env;
}
async function mfWriteFile(){
  const bytes=await mfSaveBytes(), name=mfSaveName();
  if(await mfWriteNative(bytes,name))return;
  const file=new File([bytes],name,{type:'application/octet-stream',lastModified:Date.now()});
  if(typeof showSaveFilePicker==='function'){
    try{
      const h=await showSaveFilePicker({suggestedName:name,types:[{description:'MASSFRONT save file',
        accept:{'application/octet-stream':['.mfsave']}}]});
      const w=await h.createWritable(); await w.write(file); await w.close();
      toast('Game save file created'); return;
    }catch(e){ if(e&&e.name==='AbortError') return; }
  }
  if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
    try{
      await navigator.share({title:'MASSFRONT game save',text:'Portable MASSFRONT career save',files:[file]});
      toast('Game save file shared'); return;
    }catch(e){ if(e&&e.name==='AbortError') return; }
  }
  const url=URL.createObjectURL(file), a=document.createElement('a');
  a.href=url; a.download=name; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast('Game save file downloaded');
}
function renderSaveFile(){
  const el=document.getElementById('saveFileState'); if(!el) return;
  const p=activeProf();
  el.textContent=(p&&p.name||'Commander')+' · '+(META.xp||0).toLocaleString()+' XP · '+(META.matches||0)+' matches';
}

/* ---- UI -------------------------------------------------------------------- */
function accToast(m){ if(typeof toast==='function') toast(m); }
function accBusy(b){
  const el=document.getElementById('accPanel');
  if(el) el.classList.toggle('busy',!!b);
}
function accConfirm(msg,yes,no){
  const d=document.getElementById('accDlg');
  document.getElementById('accDlgTxt').textContent=msg;
  d.style.display='flex';
  const y=document.getElementById('accDlgY'), n=document.getElementById('accDlgN');
  const close=()=>{ d.style.display='none'; y.onclick=null; n.onclick=null; };
  y.onclick=()=>{ close(); yes&&yes(); };
  n.onclick=()=>{ close(); no&&no(); };
}
function renderAccount(){
  const el=document.getElementById('accPanel'); if(!el) return;
  const who=document.getElementById('accWho');
  const sub=document.getElementById('accSub');
  const av =document.getElementById('accAv');
  const row=document.getElementById('accBtns');
  const syncRow=document.getElementById('accSync');
  /* Email/password login lives in authportal.js; the old social-account state
     below is retained only for profiles linked by older builds. Profile used
     to read only that legacy state, so a valid cached MASSFRONT session was
     incorrectly labelled "Not signed in" on this screen. */
  const portal=typeof AP_SESSION!=='undefined'&&AP_SESSION&&AP_SESSION.token?AP_SESSION:null;
  if(portal){
    who.textContent=portal.email||'MASSFRONT Commander';
    sub.textContent=portal.offline?'MASSFRONT account · offline — session kept':'MASSFRONT account · signed in';
    av.style.backgroundImage='';av.textContent='@';
    row.innerHTML='';
    const manage=document.createElement('button');manage.className='accBtn';
    manage.textContent='ACCOUNT & CLOUD SAVE';
    manage.onclick=()=>{if(typeof apOpen==='function')apOpen(document.getElementById('acctBtn'));};
    row.appendChild(manage);
    syncRow.style.display='block';
    syncRow.textContent=portal.offline || (typeof netAllowed==='function' && !netAllowed())
      ? 'Your account is cached safely. Cloud actions resume when the server is reachable.'
      : CLOUD.state==='ok' ? '✓ Account session active · cloud backup '+
          (CLOUD.last?new Date(CLOUD.last).toLocaleTimeString():'ready')+'.'
      : CLOUD.state==='syncing' ? '☁ Syncing career to your account…'
      : CLOUD.state==='pending' ? '☁ Cloud backup waiting — will retry when online.'
      : '✓ Account session active · local autosave remains available offline.';
  } else if(ACCOUNT){
    who.textContent=ACCOUNT.name;
    sub.textContent=(ACCOUNT.provider==='google'?'Google':'Facebook')+
      (ACCOUNT.email?' · '+ACCOUNT.email:'');
    av.style.backgroundImage=ACCOUNT.picture?'url('+ACCOUNT.picture+')':'';
    av.textContent=ACCOUNT.picture?'':(ACCOUNT.provider==='google'?'G':'f');
    row.innerHTML='';
    const out=document.createElement('button'); out.className='accBtn ghost';
    out.textContent='SIGN OUT'; out.onclick=signOut; row.appendChild(out);
    const pull=document.createElement('button'); pull.className='accBtn';
    pull.textContent='RESTORE FROM CLOUD'; pull.onclick=syncPull; row.appendChild(pull);
    syncRow.style.display='block';
    syncRow.textContent =
      !AUTH_CFG.syncUrl ? 'Cloud saves are not configured for this build — use a save file below'
      : SYNC.state==='ok'      ? '☁ Synced'+(SYNC.last?' · '+new Date(SYNC.last).toLocaleTimeString():'')
      : SYNC.state==='syncing' ? '☁ Syncing…'
      : SYNC.state==='error'   ? '⚠ '+SYNC.err
      : '☁ Waiting to sync';
  } else {
    who.textContent='Not signed in';
    sub.textContent='Progress is saved on this device only';
    av.style.backgroundImage=''; av.textContent='👤';
    row.innerHTML='';
    /* SOCIAL SIGN-IN IS GONE, on purpose.
       Google and Facebook buttons cannot work without OAuth app IDs that a
       shipped build has no way to obtain, so they could only ever be two
       permanently greyed buttons apologising for themselves — and the apology
       was invisible behind the overlay, which is why they read as broken.
       Save files already do the job the accounts were there for: they move a
       whole career between devices without a server, login, pasted code, or
       any way for an outage to lock anyone out of their own progress.
       Two dead buttons removed beats two dead buttons explained. */
    /* ...but removing the social buttons left this branch with NO control at
       all, and apInjectMenuButton() had already dropped the menu-strip account
       button on the premise that "the tab is now the only route". The only
       apOpen() call left in this pane sits in the `portal` branch above, which
       requires an existing session — so a signed-out player could reach the
       account screen and find no way to sign in or register from it. The boot
       gate does not save them either: it latches on mf_auth_gate_v1 the first
       time PLAY OFFLINE is tapped and never re-arms. This button is the route
       the portal's own footer already promises ("sign in any time from
       Profile ▸ Account"). */
    const join=document.createElement('button'); join.className='accBtn';
    join.textContent='SIGN IN OR REGISTER';
    join.onclick=()=>{ if(typeof apOpen==='function') apOpen(join); };
    row.appendChild(join);
    syncRow.style.display='block';
    syncRow.innerHTML='Sign in to keep your career in the cloud, or play on without '
      +'an account — progress is saved on this device either way, and the .mfsave '
      +'file below moves it to another phone.';
  }
  renderSaveFile();
}
/* ============================================================================
   AUTOMATIC ACCOUNT SAVE — added so a signed-in player never loses progress.
   The account server (cloudflare/massfront-auth) keeps ONE save slot per
   account: PUT /save {payload} and GET /save -> {payload}. This wires that to
   the EMAIL session (AP_SESSION, authportal.js): the whole profile is pushed a
   few seconds after each change and pulled+merged on sign-in and on launch.
   The further-along career always wins (careerWeight), so signing in on a new
   phone RESTORES progress and can never overwrite a better save with an empty
   one. Non-blocking and offline-safe (netAllowed), the same contract
   economy-net.js/offline.js use. Signed-out play is untouched — the local save
   in game/meta.js stays the source of truth. */
const CLOUD={ state:'off', last:0, busy:false, dirty:false, timer:0, pulledFor:'', announced:false, diffToldFor:null };
function cloudBase(){ return ((typeof apEndpoint==='function'&&apEndpoint())||AUTH_CFG.syncUrl||'').replace(/\/+$/,''); }
function cloudSession(){ return (typeof AP_SESSION!=='undefined'&&AP_SESSION&&AP_SESSION.token)?AP_SESSION:null; }
function cloudOnline(){ return typeof netAllowed!=='function'||netAllowed(); }
function cloudMarkPulled(){
  const sess=cloudSession();
  if(sess) CLOUD.pulledFor=sess.token;
}
async function cloudPush(){
  const sess=cloudSession();
  if(!cloudBase()||!sess) return;
  if(!cloudOnline()){ CLOUD.dirty=true; return; }
  /* Never blind-overwrite the account before this session has merged it in —
     that is exactly how a fresh phone would wipe a good cloud save. */
  if(CLOUD.pulledFor!==sess.token){ cloudPull(); return; }
  if(CLOUD.busy){ CLOUD.dirty=true; return; }
  CLOUD.busy=true; CLOUD.dirty=false; CLOUD.state='syncing';
  try{
    const payload=await encodeSave();
    const r=await accFetch(cloudBase()+'/save',{ method:'PUT',
      headers:{'content-type':'application/json','authorization':'Bearer '+sess.token},
      cache:'no-store', body:JSON.stringify({payload}) });
    if(!r.ok) throw new Error('HTTP '+r.status);
    CLOUD.state='ok'; CLOUD.last=Date.now();
    if(!CLOUD.announced){ CLOUD.announced=true; if(typeof toast==='function') toast('☁ Progress is now saving to your account'); }
  }catch(e){ CLOUD.state='pending'; CLOUD.dirty=true; }
  finally{ CLOUD.busy=false; if(typeof renderAccount==='function') renderAccount(); }
}
/* Debounced: a match payout fires several metaSave()s in a row — batch them
   into one upload instead of hammering the worker. */
function cloudAutoSave(){
  if(!cloudSession()) return;                 // signed out: local save only
  CLOUD.dirty=true;
  if(CLOUD.timer) return;
  CLOUD.timer=setTimeout(()=>{ CLOUD.timer=0; if(CLOUD.dirty) cloudPush(); }, 4000);
}
/* Take the objectively-further career (careerWeight) — never lose progress. */
function cloudMerge(incoming){
  try{
    if(!incoming||!incoming.meta){ cloudMarkPulled(); cloudAutoSave(); return; }
    const mine=careerWeight(META), theirs=careerWeight(incoming.meta);
    if(theirs>mine*1.02){
      applyCareerPayload(incoming,'your account');
      cloudMarkPulled();
      return;
    }
    if(mine>theirs*1.02){
      cloudMarkPulled();
      cloudAutoSave();
      return;
    }
    const local=typeof syncPayload==='function'?syncPayload():{profile:null,meta:META};
    /* COMPARE IN ONE ENCODING.
       src/faction-id.js maintains a canonical<->runtime seam in which two of the
       four factions rename: dominion<->legion and brood<->horde. It then wraps
       BOTH sides of this comparison, in OPPOSITE directions - syncPayload gets
       persistMeta (canonical) at faction-id.js:49, and this function's argument
       gets restoreMeta (runtime) at faction-id.js:51. So for any career that has
       ever selected, favoured or won with Crimson Dominion or Brood Swarm, the
       two operands could NEVER be equal, no matter how perfectly the saves
       matched - and the player was told their cloud save differs, forever, on a
       ~30 second floor. (Nova/Syndicate-only careers escape, because their keys
       are identical across the seam. That is why this went unnoticed.)
       Normalise the incoming side back to canonical so both are in the same
       encoding. The comparator is correct; it was being fed mismatched inputs. */
    const incomingCanon=(typeof facPersistMeta==='function'&&incoming&&incoming.meta)
      ? Object.assign({},incoming,{meta:facPersistMeta(incoming.meta)})
      : incoming;
    if(typeof apSavesEquivalent==='function' && apSavesEquivalent(local, incomingCanon)){
      cloudMarkPulled();
      CLOUD.state='ok'; CLOUD.last=Date.now();
      return;
    }
    /* Similar career score, different contents (settings, identity, gear).
       Do not auto-write either side — that is how a settings-only cloud copy
       used to vanish. Manual Pull/Push in the account panel decides. */
    CLOUD.state='ok';
    /* SAY IT ONCE PER SESSION, NOT EVERY 30 SECONDS.
       toast() has no dedupe or rate limit and CSS stamps every toast with the
       COMMAND NOTICE header, so this shared the in-match rail with wave
       warnings and fired on each autosave debounce (~4 s during play) and on an
       unconditional 30 s retry. Repeating it adds no information: the state is
       identical each time and the remedy is a manual action in another screen. */
    const _sess=cloudSession(), _tok=_sess?_sess.token:'';
    if(CLOUD.diffToldFor!==_tok){
      CLOUD.diffToldFor=_tok;
      if(typeof toast==='function')
        toast('☁ Cloud save differs — restore or backup from Profile ▸ Account');
    }
  }catch(e){}
}
async function cloudPull(){
  const sess=cloudSession();
  if(!cloudBase()||!sess||!cloudOnline()||CLOUD.busy) return;
  CLOUD.busy=true; CLOUD.state='syncing'; if(typeof renderAccount==='function') renderAccount();
  let incoming=null, reached=false;
  try{
    const r=await accFetch(cloudBase()+'/save',{ method:'GET',
      headers:{'authorization':'Bearer '+sess.token}, cache:'no-store' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    reached=true; CLOUD.state='ok'; CLOUD.last=Date.now();
    if(j&&j.payload){ try{ incoming=await decodeSave(j.payload); }catch(e){ incoming=null; } }
  }catch(e){ CLOUD.state='pending'; }
  CLOUD.busy=false;
  if(incoming&&incoming.meta) cloudMerge(incoming);
  else if(reached){ cloudMarkPulled(); cloudAutoSave(); }
  if(typeof renderAccount==='function') renderAccount();
}
function initCloudSave(){
  /* every local save also schedules an account push, when signed in. Wrap,
     don't edit game/meta.js (the takeover pattern this codebase uses). */
  if(typeof metaSave==='function' && !metaSave.__mfCloud){
    const _ms=metaSave;
    metaSave=function(){ const r=_ms.apply(this,arguments); try{ cloudAutoSave(); }catch(e){} return r; };
    metaSave.__mfCloud=true;
  }
  /* Identity lives on the profile record (profSave), not META. Without this
     wrap, renaming a commander or picking a title never reached the account. */
  if(typeof profSave==='function' && !profSave.__mfCloud){
    const _ps=profSave;
    profSave=function(){ const r=_ps.apply(this,arguments); try{ cloudAutoSave(); }catch(e){} return r; };
    profSave.__mfCloud=true;
  }
  /* Sign-in comparison belongs to apOfferSyncAfterSignIn. Auto-pull here raced
     that dialog and could apply a cloud career before the player chose. */
  if(typeof apSetSessionFrom==='function' && !apSetSessionFrom.__mfCloud){
    const _set=apSetSessionFrom;
    apSetSessionFrom=function(){
      const r=_set.apply(this,arguments);
      CLOUD.pulledFor=''; CLOUD.announced=false; CLOUD.dirty=false;
      return r;
    };
    apSetSessionFrom.__mfCloud=true;
  }
  if(typeof apCommitIncoming==='function' && !apCommitIncoming.__mfCloud){
    apCommitIncoming=function(data){
      applyCareerPayload(data,'cloud',{quiet:true});
      cloudMarkPulled();
      if(typeof AP_LAST_PULL!=='undefined') AP_LAST_PULL=Date.now();
      if(typeof apSyncSet==='function')
        apSyncSet('success','SYNCED: Cloud save restored to this device - '+
          (typeof apSaveStats==='function'?apSaveStats(data):''), false);
      if(typeof apToast==='function') apToast('✓ Cloud save restored');
    };
    apCommitIncoming.__mfCloud=true;
  }
  if(typeof apWriteCloudSave==='function' && !apWriteCloudSave.__mfCloud){
    const _wr=apWriteCloudSave;
    apWriteCloudSave=function(){
      const r=_wr.apply(this,arguments);
      Promise.resolve(r).then(function(res){ if(res!=null) cloudMarkPulled(); }).catch(function(){});
      return r;
    };
    apWriteCloudSave.__mfCloud=true;
  }
  /* on sign-out, push the final state while the token is still valid, then reset */
  if(typeof apClearSession==='function' && !apClearSession.__mfCloud){
    const _clr=apClearSession;
    apClearSession=function(){ try{ if(cloudSession()&&CLOUD.dirty&&CLOUD.pulledFor) cloudPush(); }catch(e){} const r=_clr.apply(this,arguments); CLOUD.state='off'; CLOUD.pulledFor=''; CLOUD.announced=false; return r; };
    apClearSession.__mfCloud=true;
  }
  /* already signed in at launch -> restore/merge once (not on a fresh sign-in) */
  if(cloudSession()) cloudPull();
  /* retry a pending push when connectivity returns, when the app is backgrounded
     (the mobile "close"), and on a light periodic timer */
  if(typeof window!=='undefined') window.addEventListener('online',()=>{ if(CLOUD.dirty) cloudPush(); });
  if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'&&CLOUD.dirty) cloudPush(); });
  setInterval(()=>{ if(CLOUD.dirty && cloudSession() && cloudBase() && cloudOnline()) cloudPush(); }, 30000);
}
async function initAccounts(){
  try{
    const r=await fetch('./assets/auth.json',{cache:'no-store'});
    if(r.ok) AUTH_CFG=Object.assign(AUTH_CFG,await r.json());
  }catch(e){}
  if(typeof window!=='undefined'&&window.MASSFRONT_AUTH) Object.assign(AUTH_CFG,window.MASSFRONT_AUTH);
  authLoadDevice();      // device-supplied IDs win over the shipped defaults
  accLoad();
  renderAccount();
  const $$=id=>document.getElementById(id);
  const get=$$('saveFileGet'), put=$$('saveFilePut'), input=$$('saveFileInput');
  /* Android WebView drops the compatibility click when the finger drifts a few
     pixels inside the scrollable Transfer panel this button sits in, so a plain
     click binding read as a dead button on real phones: no file, no share
     sheet, no toast, because the handler never ran. Bind through mfBindTap
     (pointer-up + slop — the same fix the tab rows already use) and keep click
     as the fallback so keyboard/AT activation still works. */
  const doSaveFile=async e=>{
    if(e&&e.stopPropagation) e.stopPropagation();
    const label=get.textContent; get.disabled=true; get.textContent='PREPARING…';
    try{ await mfWriteFile(); }
    catch(err){ console.warn('save export failed',err); toast('Could not create the game save file'); }
    finally{ get.disabled=false; get.textContent=label; }
  };
  if(get){
    if(typeof mfBindTap==='function') mfBindTap(get,doSaveFile);
    else get.addEventListener('click',doSaveFile);
  }
  if(put&&input) put.addEventListener('click',e=>{
    e.stopPropagation(); input.value=''; input.click();
  });
  if(input) input.addEventListener('change',async()=>{
    const file=input.files&&input.files[0]; if(!file) return;
    const state=$$('saveFileState'); if(state) state.textContent='Checking '+file.name+'…';
    try{
      const env=await mfReadFile(file), p=env.payload;
      const when=env.exportedAt ? new Date(env.exportedAt).toLocaleString() : 'an earlier build';
      accConfirm('Load '+file.name+'? This '+env.gameVersion+' save was created '+when+
        '. Your current career on this device will be replaced.',
        ()=>{ applyIncoming(p,'game save file',true); }, null);
    }catch(err){
      console.warn('save import failed',err); toast('Could not load file: '+((err&&err.message)||'invalid save'));
    }finally{ input.value=''; renderSaveFile(); }
  });
  /* Turn on the automatic account backup (pull/merge on launch if already
     signed in, auto-push after every change). Safe to call once here — it
     guards its own wrapping so a re-init cannot double-wrap. */
  initCloudSave();
}

