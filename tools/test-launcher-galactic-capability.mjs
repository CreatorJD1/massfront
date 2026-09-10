/* Galactic Exploration is base content in normal packages. Older native shells
 * can receive its bound delivery descriptor through OTA; a completed download
 * still requires a compatible, verified resource mount before launch readiness.
 * The contract uses the real launcher seam and controlled status/mount/installer
 * doubles, not a browser or native installation. It records whether the action
 * reaches the installer; native copying/integrity has a separate actual-source
 * contract in test-native-content-mount.mjs.
 *
 * Readiness rendering must not probe the network (a HEAD against a diagnostic
 * slim package produces a visible 404 on every launch). Normal player packages
 * now include the signed runtime; slim packaging is an explicit diagnostic. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const launcher=readFileSync(resolve(root,'src/launcher.js'),'utf8');
const boot=readFileSync(resolve(root,'boot.js'),'utf8');
const packer=readFileSync(resolve(root,'tools/pack-www.mjs'),'utf8');
const assetpack=readFileSync(resolve(root,'src/assetpack.js'),'utf8');

const begin=launcher.indexOf('var GALACTIC_PACK_ID');
const end=launcher.indexOf('function updateStorage',begin);
assert(begin>=0&&end>begin,'Galactic capability seam is missing');
const seam=launcher.slice(begin,end);

/* Runs the seam with a stubbed launcher environment and returns what the card
   ended up showing, plus anything it tried to reach. */
async function run({included,delivery=false,online=true,status=null,mount=null,installer=null}={}){
  const requests=[],installs=[],statusCalls=[],repairs=[],mountRetries=[],classes=new Set(['onlineOnly']),toasts=[];
  const card={classList:{add:(n)=>classes.add(n),remove:(n)=>classes.delete(n)}};
  const state={textContent:''};
  const button={disabled:false,textContent:'',closest:()=>card,
    setAttribute(){},getAttribute(){return null;}};
  const elements={mfLaunchPackGalacticState:state,mfLaunchPackGalactic:button};
  const win={MASSFRONT_ASSET_PACKS:{status:async(...args)=>{statusCalls.push(args);return status;},repair:async(id)=>{repairs.push(id);return {ok:true};}},
    __MF_OTA_HAS_GALACTIC_DELIVERY:delivery,
    MFNativeExplorationContent:{snapshot:()=>mount,retry(){mountRetries.push('retry');mount={...mount,failed:null};}}};
  if(included!==undefined) win.__MF_BUILD_HAS_GALACTIC_EXPLORATION=included;
  const context={
    window:win,APP_VERSION:'1.33.76',
    L:{galacticBusy:false,galacticTicket:0,galacticReady:false,galacticCached:false},
    byId:(id)=>elements[id]||null,
    fmtBytes:(n)=>String(n)+'B',
    onlineAllowed:()=>online,
    relocatePackPanel(){},
    toast:(m)=>toasts.push(String(m)),
    fetch:(url)=>{requests.push(String(url));throw new Error('network forbidden');},
    mfInstallExplorationPack:async()=>{installs.push('called');return installer?installer():{ok:true};},
    setTimeout,clearTimeout,console
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(seam+'\nglobalThis.__render=renderGalactic;globalThis.__download=downloadGalactic;',context);
  await context.__render();
  return {requests,installs,statusCalls,repairs,mountRetries,toasts,classes,
    get state(){return state.textContent;},get button(){return button.textContent;},get disabled(){return button.disabled;},get ready(){return context.L.galacticReady;},
    download:context.__download};
}

/* ---- bundled in the package: nothing to download ---- */
{
  const r=await run({included:true});
  assert.equal(r.state,'INCLUDED IN THIS BUILD');
  assert.equal(r.button,'READY');
  assert.equal(r.disabled,true,'a bundled pack must not offer a redundant network action');
  assert.ok(!r.classes.has('onlineOnly'));
  assert.deepEqual(r.requests,[],'included capability probed the network');
}

/* ---- slim build, online, not installed: the whole point of this change ---- */
for(const included of [undefined,false,null,1,'true']){
  const r=await run({included,online:true,status:{installed:false}});
  assert.equal(r.state,'CONTENT · GALACTIC EXPLORATION',`slim build (${String(included)}) did not offer the base content download`);
  assert.equal(r.button,'INSTALL',
    'a slim build must offer to install the published pack, not report INSTALLER REQUIRED');
  assert.equal(r.disabled,false,'the install control must be usable');
  assert.ok(!r.classes.has('onlineOnly'),'an installable pack must not read as internet-locked');
  assert.deepEqual(r.requests,[],'readiness rendering probed the network');
}

/* ---- slim build, offline: honest, and not a dead INSTALL button ---- */
{
  const r=await run({included:false,online:false,status:{installed:false}});
  assert.equal(r.state,'REQUIRES INTERNET');
  assert.equal(r.button,'OFFLINE');
  assert.equal(r.disabled,true);
  assert.ok(r.classes.has('onlineOnly'));
}

/* ---- already installed legacy bytes: verify rather than re-download ---- */
{
  const r=await run({included:false,online:true,status:{installed:true,ok:true,bytes:568156643}});
  assert.match(r.state,/INSTALLED/);
  assert.equal(r.button,'VERIFY');
  assert.equal(r.disabled,false);
}

const cached={installed:true,ok:true,bytes:568156643};
const candidate=(generation='a',version='1.33.76')=>({generation:generation.repeat(64),version,
  moduleUrl:'https://localhost/_capacitor_file_/data/user/0/com.creatorjd.massfront/files/massfront-content/galactic-exploration/'+generation.repeat(64)+'/modules/space_exploration/index.html'});

/* ---- current OTA resource mounts are launchable, unlike cached bytes alone ---- */
for(const mount of [{prepared:candidate(),good:null,failed:null},{prepared:null,good:candidate(),failed:null}]){
  const r=await run({included:false,delivery:true,status:cached,mount});
  assert.equal(r.ready,true);assert.equal(r.button,'VERIFY');assert.equal(r.disabled,false);
  await r.download();
  assert.equal(r.installs.length,0,'verification must not invoke the downloader');
  assert.ok(r.statusCalls.some(([id,options])=>id==='galactic-exploration'&&options?.verify===true));
  assert.ok(r.toasts.includes('Galactic pack verified'));assert.deepEqual(r.requests,[]);
}
for(const mount of [null,{prepared:null,good:null,failed:null}]){
  const r=await run({included:false,delivery:true,status:cached,mount});
  assert.equal(r.ready,false);assert.equal(r.state,'DOWNLOADED · STAGING REQUIRED');assert.equal(r.button,'STAGE');
  assert.equal(r.disabled,false);await r.download();assert.deepEqual(r.installs,['called']);
}
{
  const r=await run({included:false,delivery:true,status:cached,mount:{prepared:candidate(),good:null,failed:'a'.repeat(64)}});
  assert.equal(r.ready,false);assert.equal(r.state,'STARTUP NEEDS RETRY');assert.equal(r.button,'RETRY');
  assert.equal(r.disabled,false);await r.download();assert.deepEqual(r.mountRetries,['retry']);assert.deepEqual(r.installs,['called']);
}

/* Collect every new boundary failure so an older-version false-ready state does
   not hide the independently broken offline staging action. */
const boundaryResults=[];
async function boundary(name,check){
  try{await check();boundaryResults.push({name,pass:true});}
  catch(error){boundaryResults.push({name,pass:false,error:error.message});}
}
for(const field of ['good','prepared'])await boundary('incompatible '+field+' is not launchable',async()=>{
  const mount={prepared:null,good:null,failed:null,[field]:candidate('a','1.33.75')};
  const r=await run({included:false,delivery:true,status:cached,mount});
  assert.equal(r.ready,false,'an older base generation cannot be marked launchable');
  assert.equal(r.state,'DOWNLOADED · STAGING REQUIRED');assert.equal(r.button,'STAGE');
  await r.download();assert.deepEqual(r.installs,['called']);
});
for(const failed of [false,true])await boundary('offline cached '+(failed?'retry':'stage')+' reaches local installer',async()=>{
  const mount=failed?{prepared:candidate(),good:null,failed:'a'.repeat(64)}:null;
  const r=await run({included:false,delivery:true,online:false,status:cached,mount});
  assert.equal(r.ready,false);assert.equal(r.button,failed?'RETRY':'STAGE');assert.equal(r.disabled,false);
  await r.download();assert.deepEqual(r.installs,['called'],'the enabled local staging action must not silently return offline');
  assert.deepEqual(r.mountRetries,failed?['retry']:[]);assert.deepEqual(r.requests,[]);
});
await boundary('failed local cached staging reports refusal instead of pretending readiness',async()=>{
  const r=await run({included:false,delivery:true,online:false,status:cached,installer:async()=>({ok:false,reason:'offline'})});
  await r.download();assert.deepEqual(r.installs,['called']);assert.equal(r.ready,false);
  assert.ok(r.toasts.some(t=>/Internet/i.test(t)),'missing local content must report that the repair needs Internet');
});
await boundary('offline compatible mounted content can still verify locally',async()=>{
  const r=await run({included:false,delivery:true,online:false,status:cached,mount:{good:candidate(),prepared:null,failed:null}});
  assert.equal(r.ready,true);assert.equal(r.button,'VERIFY');assert.equal(r.disabled,false);
  await r.download();assert.equal(r.installs.length,0);assert.ok(r.toasts.includes('Galactic pack verified'));
});
await boundary('failed good generation is not treated as launchable',async()=>{
  const r=await run({included:false,delivery:true,status:cached,mount:{good:candidate(),prepared:null,failed:'a'.repeat(64)}});
  assert.equal(r.ready,false);assert.equal(r.button,'RETRY');await r.download();assert.deepEqual(r.installs,['called']);
});
for(const status of [{installed:false},{installed:true,ok:false},{installed:true,updateAvailable:true}])await boundary('uncached or invalid offline content remains blocked: '+JSON.stringify(status),async()=>{
  const r=await run({included:false,delivery:true,online:false,status,mount:{good:null,prepared:candidate(),failed:'a'.repeat(64)}});
  assert.equal(r.ready,false);assert.equal(r.button,'OFFLINE');assert.equal(r.disabled,true);
  await r.download();assert.deepEqual(r.installs,[]);assert.deepEqual(r.mountRetries,[],'a rejected action must retain failed probation');
});

/* ---- a partial transfer resumes instead of restarting ---- */
{
  const r=await run({included:false,online:true,status:{installed:false,partial:true}});
  assert.match(r.state,/RESUME/);
  assert.equal(r.button,'RESUME');
}

/* ---- the action actually reaches the installer ---- */
{
  const r=await run({included:false,online:true,status:{installed:false}});
  await r.download();
  assert.deepEqual(r.installs,['called'],
    'the install control must call mfInstallExplorationPack');
}

/* ---- refusal reasons are reported distinctly: "no storage" and "offline"
       need different actions from the player ---- */
{
  const r=await run({included:false,online:true,status:{installed:false},
    installer:async()=>({ok:false,reason:'storage'})});
  await r.download();
  assert.ok(r.toasts.some((t)=>/storage/i.test(t)),
    `a storage refusal must say so, got ${JSON.stringify(r.toasts)}`);
}

/* ---- structural guarantees carried over from the previous contract ---- */
assert.doesNotMatch(seam,/\bfetch\s*\(/,'Galactic readiness must not probe the network');
assert.match(launcher,/galactic\.addEventListener\('click',downloadGalactic\)/,
  'the Galactic install control must be bound; it previously had no handler at all');
assert.match(assetpack,/async function mfInstallExplorationPack\(options=\{\}\)/,
  'the exploration installer must support both launcher actions and automatic startup delivery');
assert.match(boot,/window\.__MF_BUILD_HAS_GALACTIC_EXPLORATION=true;/,
  'source/default boot must advertise its included signed Galactic runtime');
assert.match(packer,/__MF_BUILD_HAS_GALACTIC_EXPLORATION='\+\(includeExploration\?'true':'false'\)/,
  'pack-www must stamp included and slim boot capability states');
assert.match(packer,/process\.env\.MASSFRONT_DIAGNOSTIC_SLIM\s*===\s*['"]1['"]/,
  'the only Galactic omission mode must be an explicit diagnostic slim build');
assert.match(packer,/includeExploration\s*=\s*!diagnosticSlim/,
  'normal browser/PWA and Android packs must include Galactic content by default');
assert.doesNotMatch(packer,/MASSFRONT_INCLUDE_EXPLORATION/,
  'the retired opt-in environment variable must not make normal packages incomplete');

console.log(JSON.stringify({boundaryResults},null,2));
assert.ok(boundaryResults.every(row=>row.pass),'Launcher mount readiness/offline staging boundaries failed; see individual results above');
console.log('PASS launcher Galactic capability: packaged base content, diagnostic downloads, OTA-compatible mount readiness, '+
  'retry and offline cached staging route through real launcher handlers; no readiness network probe');
