/* Fresh hosted-byte + signed-out launcher acceptance, not PWA/performance QA.
   Run only after the authorized Space upload:
   node tools/verify-live-space-release.mjs --expected-commit <40hex> --tag <unique>
   The old README is pinned to the observed pre-upload commit and preserved. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync,statSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {collectEvidenceIdentity} from './evidence-foundation/fingerprints.mjs';

const root=resolve(import.meta.dirname,'..'),www=resolve(root,'www'),args=process.argv.slice(2);
const option=name=>{const at=args.indexOf('--'+name);return at<0?null:args[at+1];};
const repo='CREATORJD/massfront-playtest',origin='https://creatorjd-massfront-playtest.static.hf.space';
const previousCommit='6239214139a7205e43edd0445e0210e1a746a384',expectedCommit=option('expected-commit');
const expected={buildVersion:'1.33.74',manifestHash:'ad9c15db798d9ca4733e0104cc500d8ecb7f8cd3b52302aaa7ac16b150570274',
  balanceHash:'589728025661bfca37b7c2460dac69bde7fd0833b340b168e66de8d8b3d8418a'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const cdnOrigin='https://us.aws.cdn.hf.co',cdnPrefix='/xet-bridge-us/6a70822c94857d39c712010a/';
function spaceLocalPath(value){
  try{const url=new URL(value);if(url.origin!==origin||url.username||url.password)return null;
    const path=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),file=resolve(www,path),rel=relative(www,file);
    return rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&existsSync(file)&&statSync(file).isFile()?path:null;
  }catch{return null;}
}
function observedCdn(value){
  try{const url=new URL(value);return url.origin===cdnOrigin&&!url.username&&!url.password&&
    url.pathname.startsWith(cdnPrefix)&&/^[a-f0-9]{64}$/.test(url.pathname.slice(cdnPrefix.length));}catch{return false;}
}
function allowedRedirect(rootUrl,from,to){
  return !!spaceLocalPath(rootUrl)&&(!!spaceLocalPath(from)||observedCdn(from))&&
    (!!spaceLocalPath(to)||observedCdn(to));
}
function requestRoot(request){let rootRequest=request;while(rootRequest.redirectedFrom())rootRequest=rootRequest.redirectedFrom();return rootRequest.url();}
// This exact 101-byte insertion was observed after the byte-identical pinned
// upload. Do not strip arbitrary HTML/scripts: only this host decoration is legal.
const hfInsertion=Buffer.from('<script>window.huggingface={variables:{"SPACE_CREATOR_USER_ID":"695ee9e7f9aacca454c2817e"}};</script>');
const hfInsertionOffset=39;
function expectedHostedIndex(local){
  assert.equal(local.indexOf(Buffer.from('<head>'))+6,hfInsertionOffset,'Unexpected local HTML insertion offset');
  return Buffer.concat([local.subarray(0,hfInsertionOffset),hfInsertion,local.subarray(hfInsertionOffset)]);
}
function hostedIndexEvidence(local,hosted){
  assert(hosted.equals(expectedHostedIndex(local)),'Hosted index differs beyond the exact observed HF insertion');
  return {rawSha256:sha(hosted),normalizedSha256:sha(local),insertion:{offset:hfInsertionOffset,size:hfInsertion.length,
    sha256:sha(hfInsertion),provenance:'Observed static host decoration after pinned commit '+expectedCommit,
    contract:'https://huggingface.co/docs/hub/spaces-sdks-static#space-variables'}};
}
if(args.includes('--self-test')){
  const local=await readFile(resolve(www,'index.html')),hosted=expectedHostedIndex(local);
  assert.equal(hfInsertion.length,101);assert.equal(hostedIndexEvidence(local,hosted).normalizedSha256,sha(local));
  const changedGameByte=Buffer.from(hosted);changedGameByte[changedGameByte.length-1]^=1;
  const differentInsertion=Buffer.from(hosted);differentInsertion[hfInsertionOffset+20]^=1;
  for(const [label,invalid] of [['changed game byte',changedGameByte],['missing insertion',local],
    ['extra bytes',Buffer.concat([hosted,Buffer.from(' ')])],['different insertion',differentInsertion],
    ['different offset',Buffer.concat([local.subarray(0,38),hfInsertion,local.subarray(38)])]])
    assert.throws(()=>hostedIndexEvidence(local,invalid),undefined,label+' must be rejected');
  console.log('PASS hosted-index contract: exact positive; changed game byte, missing/extra/different insertion and wrong offset rejected');
  const source=origin+'/boot.js',cdn=cdnOrigin+cdnPrefix+'a'.repeat(64);
  assert(allowedRedirect(source,source,cdn));assert(allowedRedirect(origin+'/',origin+'/',origin+'/index.html'));
  for(const [label,rootUrl,from,to] of [
    ['wrong host',source,source,cdn.replace('us.aws.cdn.hf.co','example.com')],
    ['HTTP CDN',source,source,cdn.replace('https:','http:')],
    ['wrong repo prefix',source,source,cdn.replace('6a70822c94857d39c712010a','000000000000000000000000')],
    ['unknown local source',origin+'/not-in-www.js',origin+'/not-in-www.js',cdn],
    ['CDN without Space provenance',cdn,cdn,cdn],
    ['unrelated intermediate',source,'https://example.com/boot.js',cdn],
    ['unknown destination file',source,source,origin+'/not-in-www.js']])
    assert.equal(allowedRedirect(rootUrl,from,to),false,label+' must be rejected');
  console.log('PASS redirect contract: known Space→same host/observed CDN; wrong host/protocol/repo/path/provenance/intermediate rejected');
  process.exit(0);
}
const tag=option('tag')||new Date().toISOString().replace(/[:.]/g,'-');
assert(/^[a-f0-9]{40}$/.test(expectedCommit||''),'--expected-commit must name the uploaded Space commit');
assert(/^[a-zA-Z0-9_-]+$/.test(tag),'Invalid evidence tag');
const out=resolve(root,'.tmp','live-space-release',tag);
const critical=['index.html','boot.js','sw.js','assets/data/runtime-compatibility.json','assets/data/manifest.json',
  'assets/update-config.json','assets/app.webmanifest','src/updater.js','src/socialui.js',
  'src/game/matchconsumer.js','src/game/sim.js','src/styles/ui.css'];
const report={status:'FAIL',startedAt:new Date().toISOString(),origin,repo,previousCommit,expectedCommit,expected,
  scope:'Fresh hardware Chromium hosted-byte and signed-out/offline-launcher-to-menu proof only; no gameplay/performance/PWA/Apple certification',
  criticalBytes:[],browserBytes:[],pageErrors:[],requestFailures:[],httpFailures:[],redirects:[],actions:[],screenshots:[],
  network:{serviceWorkers:'block',blockedRequests:[],blockedSockets:[],redirectRequests:[],guardErrors:[]}};
const clean=value=>{try{const url=new URL(value);return url.origin+url.pathname;}catch{return String(value).slice(0,200);}};
const redact=value=>String(value).replace(/(?:https?|wss?):\/\/[^\s"'<>]+/g,clean).slice(0,1800);
const tuple=value=>({buildVersion:value.buildVersion,manifestHash:value.manifestHash,balanceHash:value.balanceHash});
let freeze,initialIdentity,browser,context,page,localIndex,cdp;
const expectedHashes=new Map(),pendingResponses=[];
async function getBytes(url){
  const response=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,'Public GET failed: '+clean(url)+' HTTP '+response.status);
  return Buffer.from(await response.arrayBuffer());
}
async function metadata(){
  const data=JSON.parse((await getBytes('https://huggingface.co/api/spaces/'+repo+'?mf_verify='+Date.now())).toString());
  const observed={id:data.id,sha:data.sha,sdk:data.sdk,host:data.host,private:data.private,stage:data.runtime?.stage};
  assert.equal(observed.id,repo);assert.equal(observed.sha,expectedCommit,'Space commit changed or upload is not live');
  assert.equal(observed.sdk,'static');assert.equal(observed.host,origin);assert.equal(observed.private,false);
  assert.equal(observed.stage,'RUNNING');return observed;
}
async function screenshot(label){
  const path=resolve(out,label+'.png');await page.screenshot({path,fullPage:false});report.screenshots.push(path);
}
async function gateState(){
  return page.evaluate(()=>{
    const shown=id=>{const el=document.getElementById(id);if(!el)return false;const style=getComputedStyle(el);
      return style.display!=='none'&&style.visibility!=='hidden'&&!el.hidden&&el.getAttribute('aria-hidden')!=='true'&&el.getClientRects().length>0;};
    const snap=typeof window.mfLauncherSnapshot==='function'?window.mfLauncherSnapshot():null;
    return {skip:shown('mfIntroSkip'),intro:shown('mfIntroStart')&&shown('mfPreAlphaIntro'),account:shown('apOfflineBtn'),
      onboarding:shown('mfOnboardingSkip'),primary:shown('mfLaunchPlay')&&!document.getElementById('mfLaunchPlay').disabled,
      offline:shown('mfLaunchOffline')&&!document.getElementById('mfLaunchOffline').disabled,
      start:shown('startScreen'),passed:!!snap?.passed};
  });
}

// Exclusive evidence-directory creation preserves previous successful and failed runs.
await mkdir(resolve(out,'..'),{recursive:true});await mkdir(out);
try{
  freeze=await acquireVerificationFreeze({root,label:'live-space-'+tag});
  initialIdentity=await collectEvidenceIdentity({root,packageRoot:www});report.identity=initialIdentity;
  const local=JSON.parse(await readFile(resolve(www,'assets/data/runtime-compatibility.json'),'utf8'));
  assert.deepEqual(tuple(local),expected,'Local www is not the final authorized candidate');
  report.remoteBefore=await metadata();
  const readmeUrl=revision=>'https://huggingface.co/spaces/'+repo+'/raw/'+revision+'/README.md';
  const [previousReadme,currentReadme]=await Promise.all([getBytes(readmeUrl(previousCommit)),getBytes(readmeUrl(expectedCommit))]);
  report.readme={previousSha256:sha(previousReadme),currentSha256:sha(currentReadme),preserved:previousReadme.equals(currentReadme)};
  assert(report.readme.preserved,'Space README/config changed');
  assert(/^sdk:\s*static\s*$/m.test(currentReadme.toString()),'Space README is not static');
  for(const path of critical){
    const [localBytes,remoteBytes]=await Promise.all([readFile(resolve(www,path)),getBytes(origin+'/'+path+'?mf_verify='+Date.now())]);
    const localSha256=sha(localBytes),remoteSha256=sha(remoteBytes);expectedHashes.set(path,localSha256);
    const result={path,size:remoteBytes.length,localSha256,remoteSha256,match:localSha256===remoteSha256};report.criticalBytes.push(result);
    if(path==='index.html'){
      localIndex=localBytes;
      const pinned=await getBytes('https://huggingface.co/spaces/'+repo+'/raw/'+expectedCommit+'/index.html');
      result.pinnedSha256=sha(pinned);assert(pinned.equals(localBytes),'Pinned uploaded index differs from www');
      result.hostedIndex=hostedIndexEvidence(localBytes,remoteBytes);result.match=result.hostedIndex.normalizedSha256===localSha256;
    }
    assert(result.match,'Hosted critical bytes differ from www: '+path);
  }
  const runtimePaths=JSON.parse(await readFile(resolve(www,'assets/data/manifest.json'),'utf8')).order;
  for(const path of runtimePaths)expectedHashes.set(path,sha(await readFile(resolve(www,path))));
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  // This is a fresh deployed-source check; offline SW acceptance has its own
  // verifier. No worker or prior IDB patch may replace the bytes being tested.
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,
    colorScheme:'dark',serviceWorkers:'block'});
  const fresh=await context.storageState();assert.equal(fresh.cookies.length,0);assert.equal(fresh.origins.length,0);
  report.freshContext=true;
  assert.equal(typeof context.routeWebSocket,'function','WebSocket blocking unavailable');
  await context.routeWebSocket('**/*',socket=>{
    report.network.blockedSockets.push(clean(socket.url()));socket.close({code:1008,reason:'Read-only release verification'});
  });
  page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(redact(error.message)));
  // Playwright routes run only on the initial request, not every redirect.
  // Chromium Fetch request-stage interception admits each real hop before send.
  const blockedUrls=new Set(),requestOrigins=new Map();cdp=await context.newCDPSession(page);
  cdp.on('Fetch.requestPaused',event=>{void(async()=>{
    const {requestId,request,redirectedRequestId}=event,url=new URL(request.url),previous=requestOrigins.get(redirectedRequestId);
    const rootUrl=previous?.rootUrl||request.url,readOnly=['GET','HEAD'].includes(request.method),
      updaterManifest=/(?:^|\/)update(?:-preview)?\.json$/.test(url.pathname),
      allowed=readOnly&&!updaterManifest&&(redirectedRequestId?!!previous&&allowedRedirect(rootUrl,previous.url,request.url):url.origin===origin);
    if(redirectedRequestId)report.network.redirectRequests.push({from:previous?clean(previous.url):null,to:clean(url),originPath:spaceLocalPath(rootUrl),allowed});
    if(allowed){requestOrigins.set(requestId,{rootUrl,url:request.url});await cdp.send('Fetch.continueRequest',{requestId});}
    else{blockedUrls.add(request.url);report.network.blockedRequests.push({url:clean(url),method:request.method});await cdp.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}
  })().catch(async error=>{report.network.guardErrors.push(redact(error.message));try{await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});}catch{}});});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  page.on('requestfailed',request=>{
    if(blockedUrls.has(request.url()))return;
    const error=request.failure()?.errorText||'failed',url=new URL(request.url());
    if(request.method()==='HEAD'&&url.pathname==='/modules/space_exploration/index.html'&&error==='net::ERR_ABORTED')return;
    report.requestFailures.push({url:clean(url),error});
  });
  page.on('response',response=>{
    const url=new URL(response.url()),rootUrl=requestRoot(response.request()),path=spaceLocalPath(rootUrl);
    if(url.origin!==origin&&!observedCdn(url))return;
    const headers=response.headers(),status=response.status();
    if(status>=300&&status<400){
      const location=headers.location||'',destination=location?new URL(location,url):null,allowed=!!destination&&allowedRedirect(rootUrl,url,destination);
      report.redirects.push({url:clean(url),status,location:destination?clean(destination):null,originPath:path,allowed});
      if(!allowed)report.httpFailures.push({url:clean(url),status,error:'Redirect is outside the observed Space delivery chain'});
      return; // Redirects have no response body; the destination's 200 must match.
    }
    if(response.status()>=400&&!(response.request().method()==='HEAD'&&url.pathname==='/modules/space_exploration/index.html'))
      report.httpFailures.push({url:clean(url),status,at:new Date().toISOString(),headers:Object.fromEntries(
        ['date','retry-after','ratelimit','ratelimit-policy','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset'].map(name=>[name,headers[name]||null]))});
    if(!expectedHashes.has(path)||response.request().method()!=='GET')return;
    pendingResponses.push((async()=>{
      try{const bytes=await response.body(),actualSha256=sha(bytes),hostedIndex=path==='index.html'?hostedIndexEvidence(localIndex,bytes):null;
        report.browserBytes.push({path,url:clean(url),redirected:!!response.request().redirectedFrom(),status:response.status(),sha256:actualSha256,hostedIndex,
          match:status===200&&(hostedIndex?.normalizedSha256||actualSha256)===expectedHashes.get(path)});}
      catch(error){report.browserBytes.push({path,match:false,error:redact(error.message)});}
    })());
  });
  await page.goto(origin+'/?mf_release_verify='+tag,{waitUntil:'domcontentloaded',timeout:90000});
  report.gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&typeof render==='function'&&typeof TYPES!=='undefined'&&typeof BT!=='undefined',null,{timeout:90000});
  await screenshot('fresh-boot');
  const deadline=Date.now()+120000;let gate;
  while(Date.now()<deadline){
    gate=await gateState();
    report.gate=gate;
    if(gate.start&&gate.passed&&!gate.onboarding&&!gate.account&&!gate.skip&&!gate.intro)break;
    const action=gate.skip?'#mfIntroSkip':gate.onboarding?'#mfOnboardingSkip':gate.account?'#apOfflineBtn':gate.intro?'#mfIntroStart':
      gate.offline?'#mfLaunchOffline':gate.primary?'#mfLaunchPlay':null;
    if(action){
      const attempt={at:new Date().toISOString(),action};report.actions.push(attempt);
      try{await page.locator(action).click({timeout:30000});attempt.result='clicked';}
      catch(error){
        if(error.name==='TimeoutError'&&!await page.locator(action).isVisible()){
          const next=await gateState();attempt.next=next;
          if(next.onboarding||next.account||next.primary||next.offline||next.start&&next.passed){attempt.result='control transitioned to observed next state';continue;}
        }
        attempt.result='failed';attempt.error=redact(error.message);throw error;
      }
    }
    await page.waitForTimeout(300);
  }
  report.gate=gate;assert(gate?.start&&gate.passed&&!gate.onboarding&&!gate.account,'Real launcher did not reach the unobstructed main menu');
  report.runtime=await page.evaluate(async()=>({version:String(APP_VERSION),compatibility:await window.mfRuntimeCompatibility(),
    patched:window.__MASSFRONT_PATCHED||null,webgl2:!!document.querySelector('#gl')?.getContext('webgl2'),units:TYPES.length,
    buildings:Object.keys(BT).length,homeVisible:getComputedStyle(document.querySelector('#startScreen')).display!=='none',
    horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),serviceWorkerControlled:!!navigator.serviceWorker?.controller}));
  await screenshot('main-menu');await Promise.all(pendingResponses);
  assert.equal(report.runtime.version,expected.buildVersion);assert.deepEqual(report.runtime.compatibility,expected);
  assert.equal(report.runtime.patched,null,'An OTA replaced the packaged Space boot');
  assert.equal(report.runtime.serviceWorkerControlled,false);assert(report.runtime.webgl2&&report.runtime.homeVisible);
  assert.equal(report.runtime.horizontalOverflow,0);assert.equal(report.pageErrors.length,0);
  assert.equal(report.requestFailures.length,0);assert.equal(report.httpFailures.length,0);
  assert.equal(report.network.guardErrors.length,0);assert(report.network.redirectRequests.every(hop=>hop.allowed));
  assert(report.browserBytes.every(item=>item.match),'Browser-loaded critical bytes differ from www');
  for(const path of ['index.html','boot.js','src/styles/ui.css','assets/data/runtime-compatibility.json',...runtimePaths])
    assert(report.browserBytes.some(item=>item.path===path&&item.match),'Browser did not load critical file: '+path);
  report.remoteAfter=await metadata();await freeze.checkpoint('Space boot and menu verified');report.status='PASS';
}catch(error){report.failure=redact(error.message);process.exitCode=1;
}finally{
  if(page&&!page.isClosed()&&report.status!=='PASS')await screenshot('failure').catch(()=>{});
  await context?.close().catch(()=>{});
  if(browser)await closePwBrowser(browser).catch(error=>{report.status='FAIL';report.closeError=redact(error.message);process.exitCode=1;});
  report.pageClosed=!!page?.isClosed();
  if(freeze){
    try{report.finalIdentity=await collectEvidenceIdentity({root,packageRoot:www});
      report.sourceStable=['worktreeFingerprint','runtimeFingerprint','packageFingerprint'].every(key=>initialIdentity?.[key]===report.finalIdentity[key]);
      assert(report.sourceStable,'Source or www changed during verification');
    }catch(error){report.status='FAIL';report.identityError=redact(error.message);process.exitCode=1;}
    await freeze.release({assertStable:true}).catch(error=>{report.status='FAIL';report.freezeError=redact(error.message);process.exitCode=1;});
  }
  report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,evidence:resolve(out,'evidence.json'),failure:report.failure,sourceStable:report.sourceStable,pageErrors:report.pageErrors.length,pageClosed:report.pageClosed},null,2));
}
