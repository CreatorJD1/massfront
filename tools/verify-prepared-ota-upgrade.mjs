#!/usr/bin/env node
/* Actual shipped .73 public package -> prepared .74 OTA. No source/version
 * rewriting, live-channel activation, account mutation or payload substitution.
 * Run only after all writers stop; this verifier owns the workspace freeze. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join,relative,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser,pwBrowserEvidence,recordPwBrowserGpu} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {assertNoVerificationFreeze,acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {assertMirroredRelease} from './release-activation-contract.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const after=flag=>{const i=process.argv.indexOf(flag);return i<0?'':String(process.argv[i+1]||'');};
const tag=after('--tag'),manifestPath=resolve(root,after('--manifest'));
if(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag)||!after('--manifest'))
  throw new Error('Usage: node tools/verify-prepared-ota-upgrade.mjs --tag UNIQUE --manifest PREPARED_MIRROR_JSON [--skip-interruption]');
const apk=join(root,'releases','MASSFRONT-v1.33.73-mobile-install.apk');
const APK_SHA='4341372131bdf5a4e9619ac6c6fb028da4d440aa8d87594dc53a6158b9c21371';
const APK_SIZE=138091701,FROM='1.33.73',EXPECT='1.33.74';
const out=join(root,'.tmp','prepared-ota-upgrade',tag),packageRoot=join(out,'package');
if(existsSync(out))throw new Error('Evidence tag already exists; preserve it and choose a new tag');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fileHash=async path=>{const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');};
const exec=promisify(execFile),delay=ms=>new Promise(done=>setTimeout(done,ms));
const report={schema:1,tag,startedAt:new Date().toISOString(),status:'RUNNING',steps:[],errors:[],
  scope:'Actual APK public payload in desktop hardware Chromium; prepared OTA delivery, persistence, two offline restarts and rollback',
  physicalDevice:false,nativeBridgeTested:false,safariPwaTested:false,versionRewritten:false,sourceStable:null,
  network:{manifestSubstitutions:[],payloadRequests:[],blocked:[],blockedWebSockets:[],offlinePayloadAttempts:[],finalized:false},
  missingPackageFiles:[],screenshots:[]};
let freeze,browser,context,page,server,manifest,manifestBytes,delivery;
let phase='boot',offline=false,interruptArmed=!process.argv.includes('--skip-interruption'),heldRoute=null;
const step=(name,detail)=>{report.steps.push({name,status:'PASS',detail,at:new Date().toISOString()});console.log(`PASS ${name}`);};
const safeUrl=value=>{const u=new URL(value);return u.origin+u.pathname;};
const snapshot=async()=>page.evaluate(()=>({state:UPD.state,err:UPD.err||'',version:UPD.manifest?.version||'',
  manifestRoot:UPD.manifest?.manifestRoot||'',got:Number(UPD.got)||0,total:Number(UPD.total)||0,
  appVersion:typeof APP_VERSION==='string'?APP_VERSION:'',patched:window.__MASSFRONT_PATCHED||'',
  patchedRoot:window.__MASSFRONT_PATCH_MANIFEST_ROOT||'',runtimeRoot:window.__MASSFRONT_PATCH_RUNTIME_ROOT||'',
  artifactExpected:window.__MF_OTA_EXPECT||0,artifactRan:window.__MF_OTA_RAN||0,
  bootConfirmed:typeof bootConfirmed==='boolean'&&bootConfirmed}));

async function extractPackage(){
  assert.equal((await stat(apk)).size,APK_SIZE,'Old APK size changed');
  assert.equal(await fileHash(apk),APK_SHA,'Old APK hash changed');
  // Only assets/public entries are extracted. Each destination is resolved and
  // checked below the exact evidence child before a stream can create it.
  const ps=`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$otaDestination=[IO.Path]::GetFullPath($env:MF_OTA_VERIFY_EXTRACT)
$otaPrefix=$otaDestination.TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
[IO.Directory]::CreateDirectory($otaDestination)|Out-Null
$otaZip=[IO.Compression.ZipFile]::OpenRead($env:MF_OTA_VERIFY_APK)
$otaCount=0; $otaBytes=0L
try {
  foreach($otaEntry in $otaZip.Entries) {
    if(-not $otaEntry.FullName.StartsWith('assets/public/',[StringComparison]::Ordinal)){continue}
    $otaRelative=$otaEntry.FullName.Substring(14)
    if(-not $otaRelative -or $otaEntry.FullName.EndsWith('/')){continue}
    $otaFile=[IO.Path]::GetFullPath([IO.Path]::Combine($otaDestination,$otaRelative))
    if(-not $otaFile.StartsWith($otaPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'APK extraction escaped evidence directory'}
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($otaFile))|Out-Null
    $otaInput=$otaEntry.Open(); $otaOutput=[IO.File]::Open($otaFile,[IO.FileMode]::CreateNew)
    try {$otaInput.CopyTo($otaOutput)} finally {$otaInput.Dispose();$otaOutput.Dispose()}
    $otaCount++;$otaBytes+=$otaEntry.Length
  }
} finally {$otaZip.Dispose()}
@{files=$otaCount;bytes=$otaBytes}|ConvertTo-Json -Compress`;
  const {stdout}=await exec('powershell',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{
    windowsHide:true,env:{...process.env,MF_OTA_VERIFY_APK:apk,MF_OTA_VERIFY_EXTRACT:packageRoot},maxBuffer:1<<20});
  const boot=await readFile(join(packageRoot,'boot.js'),'utf8'),updater=await readFile(join(packageRoot,'src','updater.js'),'utf8');
  assert.match(boot,/var PACKAGED_REV='1\.33\.73'/);assert.match(updater,/const APP_VERSION\s*=\s*'1\.33\.73'/);
  const order=JSON.parse(await readFile(join(packageRoot,'assets','data','manifest.json'),'utf8')).order;
  const records=[];
  for(const path of [...new Set(['boot.js','index.html','src/styles/ui.css','assets/update-config.json',...order])]){
    const file=join(packageRoot,...path.split('/'));records.push({path,size:(await stat(file)).size,sha256:await fileHash(file)});
  }
  report.package={path:apk,size:APK_SIZE,sha256:APK_SHA,extracted:JSON.parse(stdout.trim()),root:packageRoot,
    sourceRevision:(boot.match(/PACKAGED_SRC_REV\s*=\s*([^;]+)/)||[])[1]||'',inputRoot:sha(JSON.stringify(records)),inputs:records};
  step('exact .73 APK extracted without source rewriting',{files:records.length,boot:records.find(r=>r.path==='boot.js')});
}

async function startPackageServer(){
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
    '.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.m4a':'audio/mp4',
    '.ogg':'audio/ogg','.wasm':'application/wasm','.woff2':'font/woff2','.glb':'model/gltf-binary'};
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
      const file=resolve(packageRoot,'.'+(pathname==='/'?'/index.html':pathname)),rel=relative(packageRoot,file);
      if(!rel||rel.startsWith('..'+sep)||rel==='..'||resolve(packageRoot,rel)!==file)throw new Error('outside package');
      const info=await stat(file);if(!info.isFile())throw new Error('not a file');
      res.writeHead(200,{'Cache-Control':'no-store','Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':info.size});
      if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
    }catch{
      report.missingPackageFiles.push(new URL(req.url,'http://127.0.0.1').pathname);
      res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found in the shipped APK');
    }
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  report.url=`http://127.0.0.1:${server.address().port}/`;
}

async function installNetworkBoundary(){
  const payloads=new Map(delivery.entries.map(entry=>[safeUrl(entry.url),entry]));
  const isManifest=u=>u.hostname==='massfront-update.jasondixon1994.workers.dev'&&u.pathname==='/update.json'||
    u.hostname==='huggingface.co'&&/^\/datasets\/CREATORJD\/massfront-releases\/(?:resolve|raw)\/[^/]+\/(?:MASSFRONT-update|update(?:-v[\d.]+)?)\.json$/.test(u.pathname);
  await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url()),key=safeUrl(request.url());
    if(u.origin===new URL(report.url).origin||['data:','blob:','about:'].includes(u.protocol))return route.continue();
    if(offline){
      if(payloads.has(key))report.network.offlinePayloadAttempts.push({phase,path:payloads.get(key).path});
      report.network.blocked.push({phase,url:key,offline:true});return route.abort('internetdisconnected');
    }
    if(isManifest(u)){
      report.network.manifestSubstitutions.push({phase,url:key,manifestRoot:manifest.manifestRoot});
      return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','cache-control':'no-store'},body:manifestBytes});
    }
    const entry=payloads.get(key);
    if(entry&&['GET','HEAD','OPTIONS'].includes(request.method())){
      const range=request.headers().range||'';
      report.network.payloadRequests.push({phase,path:entry.path,range,method:request.method()});
      if(interruptArmed&&entry.path===delivery.entries[0].path&&/^bytes=[1-9]\d*-/.test(range)){
        interruptArmed=false;heldRoute=route;return;
      }
      return route.continue();
    }
    // Real read-only Hub head lookup remains unmodified; every manifest it
    // subsequently resolves is intercepted above. No other service is in scope.
    if(u.hostname==='huggingface.co'&&u.pathname==='/api/datasets/CREATORJD/massfront-releases'&&request.method()==='GET')return route.continue();
    report.network.blocked.push({phase,url:key,offline:false});return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',socket=>{report.network.blockedWebSockets.push(safeUrl(socket.url()));socket.close({code:1000,reason:'outside OTA verification scope'});});
}

async function waitBoot(wanted,patched=false){
  await page.waitForFunction(({wanted,patched})=>typeof UPD==='object'&&typeof updDownload==='function'&&
    typeof APP_VERSION==='string'&&APP_VERSION===wanted&&typeof bootConfirmed==='boolean'&&bootConfirmed&&
    (!patched||window.__MASSFRONT_PATCHED===wanted),{wanted,patched},{timeout:180000});
  const gpu=await assertHardwareGpu(page);recordPwBrowserGpu(browser,gpu);report.gpu=gpu;
  if(patched){
    await page.waitForFunction(async()=>!await updGet('probation'),null,{timeout:45000});
    const state=await snapshot();
    assert.equal(state.patchedRoot,manifest.manifestRoot);assert.equal(state.runtimeRoot,manifest.runtimeRoot);
    assert.equal(state.artifactRan,delivery.inventory.full.length);assert.equal(state.artifactExpected,state.artifactRan);
    state.compatibility=await page.evaluate(async()=>({state:mfRuntimeCompatibilityState(),tuple:await mfRuntimeCompatibility()}));
    assert.equal(state.compatibility.state.kind,'ota','Healthy target APP_VERSION was misclassified as invalid/packaged');
    assert.equal(state.compatibility.state.version,wanted);
    assert.deepEqual(state.compatibility.tuple,report.canonicalCompatibility.tuple,
      'Executing OTA matchmaking identity differs from the canonical packed channel');
    return state;
  }
  return snapshot();
}
async function dismissOverlays(){
  for(const id of ['mfIntroStart','apCloseBtn']){
    const button=page.locator('#'+id);if(await button.isVisible().catch(()=>false))await button.click({timeout:15000});
  }
}
async function updaterAction(action){
  await page.evaluate(action=>{
    if(typeof mfUpdaterAction==='function')mfUpdaterAction(action);
    else if(action==='check')void updCheck(true);
    else if(action==='download')void updDownload();
    else if(action==='cancel')updCancel();
    else if(action==='apply')void updApply();
    else if(action==='rollback')void updRollback();
  },action);
}
async function checkOffer(){
  await page.waitForFunction(()=>!updOperationBusy(),null,{timeout:60000});
  await updaterAction('check');
  await page.waitForFunction(()=>UPD.state!=='checking',null,{timeout:90000});
  const state=await snapshot();assert.equal(state.state,'available',JSON.stringify(state));
  assert.equal(state.version,EXPECT);assert.equal(state.manifestRoot,manifest.manifestRoot);return state;
}
async function transferRecords(){
  return page.evaluate(async()=>{
    const db=await updIdb();return new Promise((done,fail)=>{
      const req=db.transaction('bundles','readonly').objectStore('bundles').openCursor(),rows=[];
      req.onerror=()=>fail(req.error);
      req.onsuccess=()=>{const cursor=req.result;if(!cursor)return done(rows);
        if(String(cursor.key).startsWith('transfer-v1:')&&String(cursor.key).includes(':chunk:'))
          rows.push({key:cursor.key,size:cursor.value.size,sha256:cursor.value.sha256});cursor.continue();};
    });
  });
}
async function screenshot(name){
  const file=join(out,name+'.png');await page.screenshot({path:file,timeout:30000});report.screenshots.push(file);
}
async function verifyStored(slot){
  return page.evaluate(async({slot,inventory,root})=>{
    const record=await updGet(slot);if(!record)throw new Error('No '+slot+' record');
    if(record.manifestRoot!==root)throw new Error('Stored manifest root differs');
    if(record.order.join('|')!==inventory.map(f=>f.path).join('|'))throw new Error('Stored executable order differs');
    let bytes=0;
    for(const entry of inventory){
      const ref=record.files[entry.path];
      const text=typeof ref==='string'?ref:(await updGet(ref.key))?.text;
      if(typeof text!=='string')throw new Error('Stored artifact missing: '+entry.path);
      const encoded=new TextEncoder().encode(text);
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(encoded.length!==entry.size||hash!==entry.sha256)throw new Error('Stored artifact differs: '+entry.path);bytes+=encoded.length;
    }
    return {version:record.version,manifestRoot:record.manifestRoot,runtimeRoot:record.runtimeRoot,storage:record.storage,files:inventory.length,bytes};
  },{slot,inventory:delivery.inventory.full,root:manifest.manifestRoot});
}
async function verifyBroodAssets(){
  const expected=[
    {key:'albedo',path:'assets/terrain/locations/brood-infested-soil-albedo-v1.webp',sha256:'1fa6411ec3a6ca4e8ee0319ec5f39d52a77dec56e594fff2144874a9f964c3b6'},
    {key:'normal',path:'assets/terrain/locations/brood-infested-soil-normal-rough-v1.webp',sha256:'791840730c7149010d98dab9b7a7edc8d20e1b67b21a46cf4e5ba4582d970f37'}];
  for(const entry of expected)assert.equal(existsSync(join(packageRoot,...entry.path.split('/'))),false,'Asset unexpectedly came from the old package');
  const observed=await page.evaluate(async expected=>{
    if(typeof TERRAIN_LOCATION_SHEETS!=='object'||!TERRAIN_LOCATION_SHEETS.brood)throw new Error('Patched renderer has no Brood surface');
    const out=[];
    for(const entry of expected){
      const url=TERRAIN_LOCATION_SHEETS.brood[entry.key];
      if(!url.startsWith('data:image/webp;base64,'))throw new Error('Brood asset is not delivered inside the OTA');
      const bytes=new Uint8Array(await(await fetch(url)).arrayBuffer());
      const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==entry.sha256)throw new Error('Brood asset hash mismatch');
      const img=new Image();img.src=url;await img.decode();
      if(!img.naturalWidth||!img.naturalHeight)throw new Error('Brood texture failed decode');
      out.push({path:entry.path,sha256:hash,bytes:bytes.length,width:img.naturalWidth,height:img.naturalHeight});
    }
    return out;
  },expected);
  return observed;
}

try{
  await assertNoVerificationFreeze(root);await mkdir(out,{recursive:true});
  freeze=await acquireVerificationFreeze({root,label:'prepared-ota-'+tag});
  manifestBytes=await readFile(manifestPath);manifest=JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/,''));
  delivery=assertMirroredRelease(manifest);assert.equal(manifest.version,EXPECT);
  report.candidate={path:manifestPath,sha256:sha(manifestBytes),version:manifest.version,manifestRoot:manifest.manifestRoot,
    runtimeRoot:manifest.runtimeRoot,files:delivery.inventory.full.length,totalBytes:delivery.entries.reduce((n,e)=>n+e.size,0)};
  const compatibilityPath=join(root,'www','assets','data','runtime-compatibility.json');
  const compatibilityBytes=await readFile(compatibilityPath),compatibility=JSON.parse(compatibilityBytes.toString('utf8'));
  assert.equal(compatibility.buildVersion,EXPECT,'Canonical packed descriptor is not the target version');
  report.canonicalCompatibility={path:compatibilityPath,sha256:sha(compatibilityBytes),
    tuple:{buildVersion:compatibility.buildVersion,manifestHash:compatibility.manifestHash,balanceHash:compatibility.balanceHash}};
  await extractPackage();await startPackageServer();
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:!process.argv.includes('--headed')});
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  await installNetworkBoundary();page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({phase,message:e.message}));
  await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:120000});
  step('actual packaged .73 booted',await waitBoot(FROM));await dismissOverlays();await screenshot('01-packaged-73');
  step('prepared .74 offer passed real old-client root validation',await checkOffer());
  if(interruptArmed){
    phase='interrupted-download';await updaterAction('download');
    const deadline=Date.now()+300000;
    while(!heldRoute&&Date.now()<deadline){
      const state=await snapshot();if(state.state==='error')throw new Error('Download before interruption: '+state.err);
      await delay(250);
    }
    assert.ok(heldRoute,'No second chunk reached the interruption boundary');
    const before=await transferRecords();assert.ok(before.length>0,'First chunk was not durable before the next request');
    await updaterAction('cancel');const held=heldRoute;heldRoute=null;await held.abort('aborted').catch(()=>{});
    await page.waitForFunction(()=>UPD.state==='available',null,{timeout:30000});
    phase='restart-after-interruption';await page.reload({waitUntil:'domcontentloaded',timeout:120000});await waitBoot(FROM);
    const after=await transferRecords();assert.deepEqual(after,before,'Restart did not preserve verified partial chunks');
    report.interruption={persistedChunks:before,reloadedChunks:after};
    step('cancel/restart preserved verified partial chunks',report.interruption);await checkOffer();
  }else report.interruption={status:'SKIPPED',reason:'--skip-interruption supplied'};
  phase='resumed-download';const transferStart=Date.now();await updaterAction('download');
  let lastProgress=0;
  while(true){
    const state=await snapshot();
    if(state.state==='ready'){report.download={...state,elapsedMs:Date.now()-transferStart};break;}
    if(['error','applyError','available'].includes(state.state))throw new Error('Download/staging failed: '+JSON.stringify(state));
    if(Date.now()-transferStart>15*60*1000)throw new Error('OTA download exceeded 15 minutes');
    if(Date.now()-lastProgress>15000){console.log(`DOWNLOAD ${state.got}/${state.total} ${state.state}`);lastProgress=Date.now();}
    await delay(500);
  }
  if(report.interruption.persistedChunks){
    const first=delivery.entries[0],firstRange=`bytes=0-${first.chunks[0].size-1}`;
    assert.equal(report.network.payloadRequests.filter(r=>r.phase==='resumed-download'&&r.path===first.path&&r.range===firstRange).length,0,
      'Resume redownloaded the already persisted first chunk');
  }
  report.pending=await verifyStored('pending');step('real transfer staged every exact candidate artifact',report.pending);
  await page.evaluate(()=>{updOpen=true;renderUpdatePanel();});await screenshot('02-ready-to-install');
  phase='apply';await updaterAction('apply');
  await page.waitForURL(url=>url.searchParams.has('mf_restart'),{timeout:60000,waitUntil:'domcontentloaded'});
  report.firstBoot=await waitBoot(EXPECT,true);step('old boot accepted and confirmed .74 OTA',report.firstBoot);
  report.active=await verifyStored('active');await screenshot('03-installed-74');
  offline=true;report.offlineRestarts=[];
  for(let attempt=1;attempt<=2;attempt++){
    phase='offline-restart-'+attempt;await page.reload({waitUntil:'domcontentloaded',timeout:120000});
    const state=await waitBoot(EXPECT,true);report.offlineRestarts.push(state);step(phase,state);
  }
  report.broodAssets=await verifyBroodAssets();step('both absent-from-APK Brood textures persisted, matched hashes and decoded offline',report.broodAssets);
  assert.deepEqual(report.network.offlinePayloadAttempts,[],'Offline boot attempted remote executable artifacts');
  await screenshot('04-offline-second-restart');
  phase='rollback';await page.waitForFunction(()=>!updOperationBusy(),null,{timeout:60000});
  const beforeRollback=page.url();await updaterAction('rollback');
  await page.waitForURL(url=>url.href!==beforeRollback,{timeout:60000,waitUntil:'domcontentloaded'});
  report.rollback=await waitBoot(FROM);assert.equal(report.rollback.patched,'');
  const rollbackStorage=await page.evaluate(async()=>({active:await updGetBundleMeta('active'),probation:await updGet('probation')}));
  assert.ok(!rollbackStorage.active||rollbackStorage.active.version===FROM);assert.ok(!rollbackStorage.probation);
  report.rollback.storage=rollbackStorage;step('real rollback returned to unchanged packaged .73 offline',report.rollback);
  await screenshot('05-rollback-packaged-73');
  assert.deepEqual(report.errors,[],'Page errors occurred during upgrade/restarts');
  assert.equal(sha(await readFile(manifestPath)),report.candidate.sha256,'Prepared manifest changed during verification');
  assert.equal(sha(await readFile(report.canonicalCompatibility.path)),report.canonicalCompatibility.sha256,'Canonical compatibility descriptor changed');
  assert.equal(await fileHash(apk),APK_SHA,'Source APK changed during verification');
  const missingScripts=report.missingPackageFiles.filter(p=>/\.(?:js|css)$/.test(p));assert.deepEqual(missingScripts,[]);
  await freeze.checkpoint('prepared OTA acceptance complete');report.sourceStable=true;report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error.stack);
  if(page&&!page.isClosed())await screenshot('failure').catch(()=>{});
}finally{
  if(heldRoute)await heldRoute.abort('aborted').catch(()=>{});
  if(context)await context.close().catch(error=>{report.contextCleanupError=error.message;report.status='FAIL';process.exitCode=1;});
  report.network.finalized=Boolean(!page||page.isClosed());report.network.pageClosed=Boolean(page?.isClosed());
  if(browser){
    await closePwBrowser(browser).catch(error=>{report.browserCleanupError=error.message;report.status='FAIL';process.exitCode=1;});
    report.browser=pwBrowserEvidence(browser);
  }
  if(server)await new Promise(done=>{server.close(done);server.closeAllConnections();});
  if(freeze)await freeze.release({assertStable:true}).then(()=>{report.sourceStable=true;}).catch(error=>{
    report.sourceStable=false;report.freezeError=error.message;report.status='FAIL';process.exitCode=1;});
  report.finishedAt=new Date().toISOString();
  if(existsSync(out))await writeFile(join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,out,sourceStable:report.sourceStable,steps:report.steps.length,
    failure:report.failure||null,physicalDevice:false}));
}
