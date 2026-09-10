/* Native content uses Capacitor's existing SAME-ORIGIN file route, never a
   replacement WebView root. A failed module therefore cannot replace the
   packaged launcher/updater. IDB owns resumable transfer; immutable DATA
   directories own executable resources. Nothing here edits player saves. */
const MF_CONTENT_MOUNT_STATE='massfront.exploration.mount.state.v1';
const MF_CONTENT_MOUNT_SESSION='massfront.exploration.mount.v1';
const MF_CONTENT_MOUNT_READY='massfront.exploration.mount.ready.v1';
const MF_CONTENT_MOUNT_PREFIX='massfront-content/galactic-exploration/';
const MF_CONTENT_MOUNT_ENTRY='/modules/space_exploration/index.html';
const MF_CONTENT_NATIVE_CHUNK=256*1024;
let mfContentMountBusy=false,mfContentStartupTimer=0,mfContentStartupAttempts=0,mfContentStartupPaused=false;

function mfContentNativeFs(){
  const cap=typeof window!=='undefined'&&window.Capacitor;
  if(!cap||typeof cap.getPlatform!=='function'||cap.getPlatform()!=='android'
    ||typeof cap.convertFileSrc!=='function'||!/^https?:$/.test(location.protocol))return null;
  const fs=cap.Plugins&&cap.Plugins.Filesystem;
  return fs&&['getUri','writeFile','appendFile'].every(name=>typeof fs[name]==='function')?fs:null;
}
function mfContentMountCandidate(value){
  if(!value||!/^([a-f0-9]{64})$/.test(value.generation||'')||!/^\d+\.\d+\.\d+$/.test(value.version||''))return null;
  try{
    const u=new URL(value.moduleUrl),suffix='/'+MF_CONTENT_MOUNT_PREFIX+value.generation+MF_CONTENT_MOUNT_ENTRY;
    if(u.origin!==location.origin||u.search||u.hash||u.username||u.password
      ||!u.pathname.startsWith('/_capacitor_file_/')||!u.pathname.endsWith(suffix))return null;
    return {generation:value.generation,moduleUrl:u.href,version:value.version};
  }catch(e){return null;}
}
function mfContentRunningVersion(){try{return typeof APP_VERSION==='string'?APP_VERSION:null;}catch(e){return null;}}
function mfContentCompatible(manifest){
  const version=mfContentRunningVersion();
  return !!version&&manifest.contentVersion===version&&manifest.compatibleGameRange==='='+version;
}
function mfContentMountState(){
  let value;try{value=JSON.parse(localStorage.getItem(MF_CONTENT_MOUNT_STATE)||'null');}catch(e){}
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1)value=null;
  const pending=value&&value.pending;
  const validPending=mfContentMountCandidate(pending)&&/^[a-f0-9]{32}$/.test(pending.token||'')
    &&Number.isSafeInteger(pending.issuedAt)&&pending.issuedAt>=0&&pending.issuedAt<=Date.now()+1000;
  return {schema:1,prepared:mfContentMountCandidate(value&&value.prepared),good:mfContentMountCandidate(value&&value.good),
    pending:validPending?pending:null,failed:typeof(value&&value.failed)==='string'?value.failed:null};
}
function mfContentMountSave(value){
  const text=JSON.stringify(value);localStorage.setItem(MF_CONTENT_MOUNT_STATE,text);
  if(localStorage.getItem(MF_CONTENT_MOUNT_STATE)!==text)throw new Error('content-pointer-storage');
}
function mfContentMountRecover(){
  const state=mfContentMountState();
  if(!state.pending)return state;
  let ready;try{ready=JSON.parse(localStorage.getItem(MF_CONTENT_MOUNT_READY)||'null');}catch(e){}
  const pending=state.pending,candidate=mfContentMountCandidate(pending);
  if(candidate&&ready&&ready.schema===1&&ready.generation===candidate.generation
    &&ready.moduleUrl===candidate.moduleUrl&&ready.token===pending.token
    &&/^[a-f0-9]{32}$/.test(pending.token||'')&&Number.isFinite(ready.readyAt)
    &&ready.readyAt>=pending.issuedAt&&ready.readyAt<=Date.now()+1000){
    state.good=candidate;state.failed=null;
  }else if(candidate){
    // No readiness acknowledgement means probation failed or was interrupted.
    // Preserve the last good directory and require a deliberate retry.
    state.failed=candidate.generation;
  }
  state.pending=null;mfContentMountSave(state);return state;
}
async function mfContentNativeUrl(fs,path){
  const result=await fs.getUri({directory:'DATA',path});
  if(!result||!String(result.uri).startsWith('file:///'))throw new Error('content-native-uri');
  const url=new URL(window.Capacitor.convertFileSrc(result.uri));
  if(url.origin!==location.origin||!url.pathname.startsWith('/_capacitor_file_/')
    ||!url.pathname.endsWith('/'+path)||url.search||url.hash)throw new Error('content-native-origin');
  return url.href;
}
async function mfContentNativeMatches(url,file){
  try{
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)return false;
    const hash=new PackSha256State();let size=0;
    if(response.body&&response.body.getReader){
      const reader=response.body.getReader();
      try{for(;;){const row=await reader.read();if(row.done)break;
        size+=row.value.length;if(size>file.size){await reader.cancel();return false;}hash.update(row.value);
      }}finally{reader.releaseLock();}
    }else{const bytes=new Uint8Array(await response.arrayBuffer());size=bytes.length;hash.update(bytes);}
    return size===file.size&&hash.hex()===file.sha256;
  }catch(e){return false;}
}
function mfContentBase64(bytes){
  let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
}
async function mfContentWriteFile(fs,path,blob){
  for(let offset=0;offset<blob.size;offset+=MF_CONTENT_NATIVE_CHUNK){
    const data=mfContentBase64(new Uint8Array(await blob.slice(offset,offset+MF_CONTENT_NATIVE_CHUNK).arrayBuffer()));
    const options={directory:'DATA',path,data};
    if(offset===0)await fs.writeFile({...options,recursive:true});else await fs.appendFile(options);
  }
}
async function mfContentVerifyLastGood(candidate){
  try{
    const text=await packStoreGet(PACK_META_STORE,'exploration:manifest:'+candidate.generation);
    if(typeof text!=='string'||await packHashBlob(new Blob([text]))!==candidate.generation)return false;
    const manifest=JSON.parse(text);
    if(manifest.kind!=='ExplorationContentManifestV1'||manifest.schemaVersion!==2||!mfContentCompatible(manifest)
      ||candidate.version!==mfContentRunningVersion())return false;
    const pack=packNormalizeIndex({packs:{[EXP_PACK_ID]:{format:2,bytes:manifest.totalBytes,files:manifest.files.map(file=>({
      name:file.path,size:file.bytes,sha256:file.hash&&file.hash.replace(/^sha256-/,''),chunks:file.chunks
    }))}}})[EXP_PACK_ID];
    const base=new URL('./',candidate.moduleUrl);
    if(!pack.files.some(file=>file.name==='index.html'))return false;
    for(const file of pack.files)if(!(await mfContentNativeMatches(new URL(file.name,base).href,file)))return false;
    return true;
  }catch(e){return false;}
}
async function mfPrepareExplorationMount(spec){
  const fs=mfContentNativeFs();
  if(!fs)return {ok:false,reason:'native-content-unavailable'};
  if(mfContentMountBusy)return {ok:false,reason:'busy'};
  const generation=spec&&spec.manifestSha256;
  if(!spec||spec.schema!=='MassfrontExplorationPackRemoteV2'||!/^[a-f0-9]{64}$/.test(generation||''))
    return {ok:false,reason:'unbound-content-manifest'};
  if(spec.version!==mfContentRunningVersion())return {ok:false,reason:'content-base-version'};
  mfContentMountBusy=true;
  let statusOwned=false;
  try{return await packWithWriter(async()=>{
    const text=await packStoreGet(PACK_META_STORE,'exploration:manifest:'+generation);
    if(typeof text!=='string'||new TextEncoder().encode(text).length!==spec.manifestBytes
      ||await packHashBlob(new Blob([text]))!==generation)throw new Error('content-manifest-integrity');
    const manifest=JSON.parse(text);
    if(manifest.kind!=='ExplorationContentManifestV1'||manifest.schemaVersion!==2)throw new Error('content-manifest-schema');
    if(!mfContentCompatible(manifest))throw new Error('content-base-version');
    const raw={format:2,bytes:manifest.totalBytes,files:manifest.files.map(file=>({
      name:file.path,size:file.bytes,sha256:file.hash&&file.hash.replace(/^sha256-/,''),chunks:file.chunks
    }))};
    const verified=packNormalizeIndex({packs:{[EXP_PACK_ID]:raw}})[EXP_PACK_ID];
    if(!verified.files.some(file=>file.name==='index.html'))throw new Error('content-entry-missing');
    const state=mfContentMountRecover(),root=MF_CONTENT_MOUNT_PREFIX+generation+'/modules/space_exploration/';
    statusOwned=true;PACK.busy=true;PACK.err='';PACK.state='installing';PACK.currentPack=EXP_PACK_ID;PACK.total=verified.bytes;PACK.got=0;packEmitState();
    for(const file of verified.files){
      const path=root+file.name,url=await mfContentNativeUrl(fs,path);
      PACK.currentFile=file.name;packEmitState();
      // Re-hash native bytes even when a completion marker survived a crash.
      if(!(await mfContentNativeMatches(url,file))){
        const {blob}=await packStoredFinal(EXP_PACK_ID,file);
        if(!blob||blob.size!==file.size||await packHashBlob(blob)!==file.sha256)throw new Error('content-cache-integrity');
        await mfContentWriteFile(fs,path,blob);
        if(!(await mfContentNativeMatches(url,file)))throw new Error('content-native-readback');
      }
      PACK.got+=file.size;packEmitState();
    }
    const prepared={generation,moduleUrl:await mfContentNativeUrl(fs,root+'index.html'),version:spec.version};
    if(!mfContentMountCandidate(prepared))throw new Error('content-entry-origin');
    state.prepared=prepared;mfContentMountSave(state);
    PACK.state='ready';PACK.currentPack='';PACK.currentFile='';packEmitState();
    const chosen=state.failed===generation?state.good:prepared;
    if(chosen&&chosen!==prepared&&!(await mfContentVerifyLastGood(chosen)))throw new Error('content-rollback-integrity');
    return chosen?{ok:true,openUrl:chosen.moduleUrl,generation:chosen.generation,rollback:chosen!==prepared}
      :{ok:false,reason:'content-probation-failed'};
  },true);}catch(error){
    PACK.state='error';PACK.err='Content staging needs attention — the installed game is unchanged';packEmitState();
    return {ok:false,reason:String(error&&error.message||error)};
  }finally{mfContentMountBusy=false;if(statusOwned){PACK.busy=false;packEmitState();}}
}
async function mfBeginExplorationMountLaunch(url){
  let target;try{target=new URL(url,location.href);}catch(e){return false;}
  if(!target.pathname.startsWith('/_capacitor_file_/')){
    if(target.origin!==location.origin)return false;
    try{sessionStorage.removeItem(MF_CONTENT_MOUNT_SESSION);}catch(e){}
    return true;
  }
  if(!mfContentNativeFs())return false;
  try{
    const state=mfContentMountRecover();
    const candidate=[state.prepared,state.good].find(row=>row&&row.moduleUrl===target.href);
    if(!candidate||candidate.generation===state.failed||candidate.version!==mfContentRunningVersion())return false;
    const token=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    const base=new URL(location.href);base.search='';base.hash='';
    if(!base.pathname.endsWith('/index.html'))base.pathname=base.pathname.replace(/[^/]*$/,'index.html');
    const issuedAt=Date.now();
    const context={schema:1,kind:'MassfrontNativeExplorationMountV1',generation:candidate.generation,moduleUrl:candidate.moduleUrl,token,baseUrl:base.href,issuedAt};
    const text=JSON.stringify(context);sessionStorage.setItem(MF_CONTENT_MOUNT_SESSION,text);
    if(sessionStorage.getItem(MF_CONTENT_MOUNT_SESSION)!==text)return false;
    state.pending={...candidate,token,issuedAt};mfContentMountSave(state);
    return true;
  }catch(e){return false;}
}
function mfContentExplorationReturnUrl(fallback){
  let record;
  try{record=JSON.parse(sessionStorage.getItem(MF_CONTENT_MOUNT_SESSION)||'null');}catch(e){return null;}
  if(!record)return fallback;
  try{
    const candidate=mfContentMountCandidate({...record,version:mfContentRunningVersion()}),state=mfContentMountRecover();
    const base=new URL(record.baseUrl),target=new URL(fallback,location.href);
    if(!candidate||record.schema!==1||record.kind!=='MassfrontNativeExplorationMountV1'
      ||!Number.isSafeInteger(record.issuedAt)||record.issuedAt<0||record.issuedAt>Date.now()
      ||!/^[a-f0-9]{32}$/.test(record.token||'')||base.origin!==location.origin
      ||base.pathname.startsWith('/_capacitor_file_/')||!base.pathname.endsWith('/index.html')
      ||target.origin!==location.origin||!target.pathname.endsWith(MF_CONTENT_MOUNT_ENTRY)
      ||![state.good,state.prepared].some(value=>value&&value.version===mfContentRunningVersion()&&value.generation===candidate.generation&&value.moduleUrl===candidate.moduleUrl)
      ||state.failed===candidate.generation)return null;
    const mounted=new URL(candidate.moduleUrl);mounted.search=target.search;mounted.hash=target.hash;return mounted.href;
  }catch(e){return null;}
}
function mfContentScheduleStartup(delay=5000,automatic=true){
  clearTimeout(mfContentStartupTimer);
  if(mfContentStartupPaused||!packNetworkAllowed()||!mfContentNativeFs()
    ||window.__MF_OTA_HAS_GALACTIC_DELIVERY!==true)return;
  mfContentStartupTimer=setTimeout(async()=>{
    if(mfContentStartupPaused||!packNetworkAllowed())return;
    if(PACK.busy||expPackBusy){mfContentScheduleStartup(3000,automatic);return;}
    const result=await mfInstallExplorationPack({automatic});
    if(!result.ok&&!['save-data','metered-network','slow-network'].includes(result.reason)
      &&mfContentStartupAttempts++<5)mfContentScheduleStartup(Math.min(30000,1000*2**mfContentStartupAttempts),automatic);
  },delay);
}
if(typeof window!=='undefined'){
  window.MFNativeExplorationContent=Object.freeze({prepare:mfPrepareExplorationMount,recover:mfContentMountRecover,snapshot:mfContentMountState,
    beginLaunch:mfBeginExplorationMountLaunch,retry:()=>{
      const state=mfContentMountRecover();state.failed=null;mfContentMountSave(state);
      mfContentStartupAttempts=0;mfContentScheduleStartup(0,false);
    }});
  window.addEventListener('pagehide',()=>{mfContentStartupPaused=true;clearTimeout(mfContentStartupTimer);});
  window.addEventListener('pageshow',()=>{mfContentStartupPaused=false;mfContentScheduleStartup(250);});
  window.addEventListener('online',()=>{mfContentStartupAttempts=0;mfContentScheduleStartup(250);});
  window.addEventListener('offline',()=>clearTimeout(mfContentStartupTimer));
  window.addEventListener('storage',event=>{if(event.key==='massfront_offline')mfContentScheduleStartup(250);});
  const connection=typeof navigator!=='undefined'&&
    (navigator.connection||navigator.mozConnection||navigator.webkitConnection);
  if(connection&&typeof connection.addEventListener==='function')
    connection.addEventListener('change',()=>mfContentScheduleStartup(250));
  mfContentScheduleStartup();
}
