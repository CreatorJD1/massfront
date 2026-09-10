#!/usr/bin/env node
/* Source-stable, hardware-GPU acceptance for stage one of a complete UGA
   session. Title and module loaders are separate surfaces, but only one may
   own readiness at a time and neither may cover a usable Campaign Hub. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,extname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),packed=join(root,'www');
const tag=process.argv[2];
if(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Unique evidence tag required');
const out=join(root,'.tmp','boot-screen',tag),viewport={width:412,height:900};
const EXPECTED_BOOT_ART_SHA256='5a226334b0a3d4693f2fcd4191dc212fd1bb96511fb567c353fdfed9021568ae';
const EXPECTED_MENU_ART_SHA256='2eeaf5fd53f3c5cd3ed04c17699c6e76ef9e9cf1b460539cbc1d54218eaf823a';
const EXPECTED_MODULE_ART_SHA256='e11a316658c34d30a9b4aced6f2bdfb7ae7a47f967f93389acb55d8db67fb279';
const MODULE_ART_PATH='assets/brand/massfront-title-command-conquer-overwhelm-v1.png';
const parityPaths=['index.html','boot.js','modules/space_exploration/index.html',
  'modules/space_exploration/src/space_module.js','modules/space_exploration/src/space_experience.js'];
const report={tag,at:new Date().toISOString(),viewport,cases:[],screenshots:[],errors:[],consoleErrors:[],httpErrors:[],requestFailures:[],expectedFailures:[]};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(base,target)=>{const rel=relative(resolve(base),resolve(target));return rel===''||(!rel.startsWith(`..${sep}`)&&rel!=='..');};

function extractInlineArt(html,selector,mime){
  const pattern=selector==='boot'?/<img class="mfBootBrand" src="data:([^;]+);base64,([^"]+)/
    :/<img id="menuBrand" src="data:([^;]+);base64,([^"]+)/;
  const match=html.match(pattern);assert(match,`${selector} canonical title art is missing`);
  assert.equal(match[1],mime,`${selector} canonical title art MIME changed`);return Buffer.from(match[2],'base64');
}
async function collectIdentity(){
  assert(existsSync(join(packed,'index.html')),'Packed www is missing; run node tools/pack-www.mjs');
  const sourceFiles=[],packedFiles=[];
  for(const path of parityPaths){
    const sourceBytes=await readFile(join(root,path)),packedBytes=await readFile(join(packed,path));
    const sourceRow={path,bytes:sourceBytes.length,sha256:sha(sourceBytes)},packedRow={path,bytes:packedBytes.length,sha256:sha(packedBytes)};
    sourceFiles.push(sourceRow);packedFiles.push(packedRow);assert.equal(packedRow.sha256,sourceRow.sha256,`Packed runtime is stale: ${path}`);
  }
  const sourceHtml=await readFile(join(root,'index.html'),'utf8'),packedHtml=await readFile(join(packed,'index.html'),'utf8');
  const sourceBoot=extractInlineArt(sourceHtml,'boot','image/webp'),sourceMenu=extractInlineArt(sourceHtml,'menu','image/png');
  const packedBoot=extractInlineArt(packedHtml,'boot','image/webp'),packedMenu=extractInlineArt(packedHtml,'menu','image/png');
  const sourceModule=await readFile(join(root,MODULE_ART_PATH)),packedModule=await readFile(join(packed,MODULE_ART_PATH));
  const art={expected:{bootSha256:EXPECTED_BOOT_ART_SHA256,menuSha256:EXPECTED_MENU_ART_SHA256,moduleSha256:EXPECTED_MODULE_ART_SHA256},
    source:{bootSha256:sha(sourceBoot),menuSha256:sha(sourceMenu),moduleSha256:sha(sourceModule)},
    packed:{bootSha256:sha(packedBoot),menuSha256:sha(packedMenu),moduleSha256:sha(packedModule)}};
  assert.deepEqual(art.source,art.expected,'Source title art is not the owner-approved canonical set');
  assert.deepEqual(art.packed,art.expected,'Packed title art is not the owner-approved canonical set');
  const [bootRaw,menuRaw]=await Promise.all([sharp(sourceBoot).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(sourceMenu).ensureAlpha().raw().toBuffer({resolveWithObject:true})]);
  assert.equal(bootRaw.info.width,1200);assert.equal(bootRaw.info.height,673);assert.equal(menuRaw.info.width,1200);assert.equal(menuRaw.info.height,673);
  let sum=0,squares=0;for(let i=0;i<bootRaw.data.length;i++){const delta=Math.abs(bootRaw.data[i]-menuRaw.data[i]);sum+=delta;squares+=delta*delta;}
  art.pixelComparison={meanAbsoluteError:sum/bootRaw.data.length,rmse:Math.sqrt(squares/bootRaw.data.length)};
  assert(art.pixelComparison.meanAbsoluteError<3,'Boot derivative no longer matches the canonical menu title pixels');
  return {source:{entry:'index.html',files:sourceFiles},packed:{entry:'www/index.html',files:packedFiles},art};
}

const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.webmanifest':'application/manifest+json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.wasm':'application/wasm','.ktx2':'image/ktx2','.woff2':'font/woff2'};
async function startServer(base,label){
  const server=createServer(async(req,res)=>{try{
    let requestPath=decodeURIComponent((req.url||'/').split('?')[0]);
    if(requestPath==='/__loader_origin.html'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><title>Loader origin</title>');return;}
    if(requestPath==='/')requestPath='/index.html';const file=resolve(base,requestPath.replace(/^[/\\]+/,''));
    if(!inside(base,file)||!existsSync(file)||(await stat(file)).isDirectory()){res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not Found');return;}
    const headers={'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'};
    if(req.method==='HEAD'){res.writeHead(200,headers);res.end();return;}res.writeHead(200,headers);res.end(await readFile(file));
  }catch(error){res.writeHead(500,{'Cache-Control':'no-store'});res.end(`Server Error: ${error.message}`);}});
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  return {label,url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(ok=>server.close(ok))};
}

const instrumentation=()=>{
  window.__MF_IMAGE_ERRORS__=[];window.__MF_LOADER_TIMELINE__=[];
  const visible=node=>{if(!node)return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0;};
  const sample=reason=>{const ids=['mfBootCover','loadScr','renderVeil'].filter(id=>visible(document.getElementById(id))),last=window.__MF_LOADER_TIMELINE__.at(-1);if(!last||last.visible.join('|')!==ids.join('|'))window.__MF_LOADER_TIMELINE__.push({at:performance.timeOrigin+performance.now(),reason,visible:ids});};
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)window.__MF_IMAGE_ERRORS__.push({src:event.target.currentSrc||event.target.src||'',id:event.target.id||'',className:event.target.className||''});},true);
  document.addEventListener('DOMContentLoaded',()=>{sample('domcontentloaded');new MutationObserver(()=>sample('mutation')).observe(document.documentElement,{attributes:true,childList:true,subtree:true,attributeFilter:['class','style','hidden']});setInterval(()=>sample('interval'),50);});
};
async function trackedPage(browser,label,{dpr=2,reducedMotion='no-preference',commissioningGuard=false}={}){
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr,hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion,serviceWorkers:'block'}),page=await context.newPage();
  const telemetry={label,pageErrors:[],consoleErrors:[],httpErrors:[],requestFailures:[],external:[]};
  await page.addInitScript(instrumentation);if(commissioningGuard)await page.addInitScript(()=>{window.__MF_COMMISSIONING_RETURN_ACTIVE__=true;});
  page.on('pageerror',error=>telemetry.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')telemetry.consoleErrors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)telemetry.httpErrors.push({url:response.url(),status:response.status()});});
  page.on('requestfailed',request=>telemetry.requestFailures.push({url:request.url(),error:request.failure()?.errorText||''}));return {context,page,telemetry};
}
function textInBounds(row){return row.x>=-1&&row.y>=-1&&row.x+row.width<=viewport.width+1&&row.y+row.height<=viewport.height+1&&row.scrollWidth<=row.clientWidth+1;}
function assertNoOverlap(timeline,label){assert(timeline.length,`${label} emitted no loader timeline`);assert(timeline.every(row=>row.visible.length<=1),`${label} showed overlapping loaders: ${JSON.stringify(timeline)}`);}
function publishTelemetry(row){report.errors.push(...row.pageErrors.map(message=>`${row.label}: ${message}`));report.consoleErrors.push(...row.consoleErrors.map(message=>`${row.label}: ${message}`));report.httpErrors.push(...row.httpErrors.map(item=>({label:row.label,...item})));report.requestFailures.push(...row.requestFailures.map(item=>({label:row.label,...item})));}

async function runBootCase(browser,server,kind,reducedMotion,forcedFallback=false){
  const label=`${kind}-boot-${forcedFallback?'fallback':reducedMotion}`,run=await trackedPage(browser,label,{reducedMotion}),{page,telemetry}=run;
  let releaseGate,markBlocked;const gate=new Promise(resolve=>{releaseGate=resolve;}),blocked=new Promise(resolve=>{markBlocked=resolve;});
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){telemetry.external.push(url.origin+url.pathname);return route.abort();}if(url.pathname.endsWith('/src/engine/mesh.js')){markBlocked();await gate;}return route.continue();});
  try{
    await page.goto(server.url,{waitUntil:'commit',timeout:60000});await page.locator('#mfBootCover').waitFor({state:'visible',timeout:30000});
    await Promise.race([blocked,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label}: mesh gate not reached`)),30000))]);
    await page.waitForFunction(()=>/^\d+\s*\/\s*\d+$/.test((document.getElementById('mfBootPct')?.textContent||'').trim()),null,{timeout:30000});
    await page.locator('.mfBootBrand').evaluate(image=>image.decode());await page.waitForTimeout(150);
    const readState=()=>page.evaluate(()=>{const cover=document.getElementById('mfBootCover'),title=cover.querySelector('.mfBootBrand'),fallback=cover.querySelector('.mfBootBrandFallback');
      const rows=['.mfBootTop','#mfBootWordmark','.mfBootStatus','#mfBootPhase','#mfBootPct','#mfBootDetail','.mfBootFooter'].map(selector=>{const node=cover.querySelector(selector),box=node.getBoundingClientRect();return {selector,text:node.innerText.trim(),x:box.x,y:box.y,width:box.width,height:box.height,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};});
      const wordmark=document.getElementById('mfBootWordmark'),wordmarkBox=wordmark.getBoundingClientRect(),top=document.elementFromPoint(wordmarkBox.left+wordmarkBox.width/2,wordmarkBox.top+wordmarkBox.height/2),bar=document.getElementById('mfBootBar'),box=cover.getBoundingClientRect();
      return {text:cover.innerText.replace(/\s+/g,' ').trim(),rows,wordmark:wordmark.getAttribute('aria-label'),wordmarkBox:{x:wordmarkBox.x,y:wordmarkBox.y,width:wordmarkBox.width,height:wordmarkBox.height},topElement:{tag:top?.tagName||'',className:top?.className||''},
        title:{display:getComputedStyle(title).display,complete:title.complete,naturalWidth:title.naturalWidth,naturalHeight:title.naturalHeight,currentSrc:title.currentSrc},fallback:{shown:(()=>{const style=getComputedStyle(fallback),rect=fallback.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;})(),text:fallback.textContent.trim()},
        progressMode:cover.getAttribute('data-progress'),busy:cover.getAttribute('aria-busy'),progress:{min:bar.getAttribute('aria-valuemin'),max:bar.getAttribute('aria-valuemax'),now:bar.getAttribute('aria-valuenow'),text:bar.getAttribute('aria-valuetext')},overflow:{document:document.documentElement.scrollWidth-innerWidth,coverWidth:box.width,coverHeight:box.height},
        animations:[...cover.querySelectorAll('*')].flatMap(node=>['',':before',':after'].map(pseudo=>getComputedStyle(node,pseudo||null).animationName)),imageErrors:window.__MF_IMAGE_ERRORS__,timeline:window.__MF_LOADER_TIMELINE__};});
    const loaded=await readState();assert.match(loaded.wordmark,/^MASSFRONT\b/);assert.equal(loaded.title.display,'block');assert.equal(loaded.title.complete,true);assert.equal(loaded.title.naturalWidth,1200);assert.equal(loaded.title.naturalHeight,673);assert.match(loaded.title.currentSrc,/^data:image\/webp;base64,/);assert.equal(loaded.fallback.text,'MASSFRONT');
    assert(!/Waiting for manifest|RUNTIME FILES|GAME SOURCE|ELAPSED/i.test(loaded.text));assert(loaded.rows.every(textInBounds),'Boot copy clips or overflows');assert(loaded.overflow.document<=0&&loaded.overflow.coverWidth===viewport.width&&loaded.overflow.coverHeight===viewport.height);assert.equal(loaded.busy,'true');assert.equal(loaded.progressMode,'determinate');assert(Number(loaded.progress.now)>0&&Number(loaded.progress.now)<Number(loaded.progress.max));assertNoOverlap(loaded.timeline,label);
    let state=loaded;if(forcedFallback){await page.evaluate(()=>{document.querySelector('.mfBootBrand').src='data:image/webp;base64,AA==';});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.mfBootBrand')).display==='none'&&window.__MF_IMAGE_ERRORS__.length===1);state=await readState();assert.equal(state.title.display,'none');assert.equal(state.fallback.shown,true);assert.deepEqual(state.wordmarkBox,loaded.wordmarkBox);assert.equal(state.imageErrors.length,1);}else assert.deepEqual(state.imageErrors,[]);
    if(reducedMotion==='reduce')assert(state.animations.every(name=>name==='none'),'Reduced-motion boot still animates');assert.deepEqual(telemetry.pageErrors,[]);assert.deepEqual(telemetry.consoleErrors,[]);assert.deepEqual(telemetry.httpErrors,[]);assert.deepEqual(telemetry.requestFailures,[]);assert.deepEqual(telemetry.external,[]);
    const shot=join(out,`${label}-412x900.png`);await page.screenshot({path:shot});report.screenshots.push(shot);report.cases.push({kind:'boot',runtime:kind,reducedMotion,forcedFallback,state,telemetry,status:'PASS'});
  }finally{releaseGate();publishTelemetry(telemetry);await run.context.close().catch(()=>{});}
}

async function prepareCareer(page,server){await page.goto(`${server.url}__loader_origin.html`,{waitUntil:'domcontentloaded',timeout:30000});await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('massfront_profiles_v1',JSON.stringify({active:'p1',seq:1,list:[{id:'p1',name:'Loader Probe',emblem:'🎖'}]}));localStorage.setItem('massfront_meta_p1',JSON.stringify({matches:1,standardMatches:1,firstPlayed:Date.now(),flags:{ugaSeen:true}}));localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');});}
async function runUgaHandoff(browser,server,kind,{failExterior=false,failLogo=false}={}){
  const suffix=failExterior?'-exterior-failure':failLogo?'-logo-fallback':'',label=`${kind}-boot-to-uga${suffix}`,run=await trackedPage(browser,label,{dpr:3,commissioningGuard:true}),{page,telemetry}=run;
  let releaseModule,markModule,releaseExterior;const moduleGate=new Promise(resolve=>{releaseModule=resolve;}),moduleReached=new Promise(resolve=>{markModule=resolve;}),exteriorGate=new Promise(resolve=>{releaseExterior=resolve;});
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),frameUrl=request.frame().url();if(!['127.0.0.1','localhost'].includes(url.hostname)){telemetry.external.push(url.origin+url.pathname);return route.fulfill({status:200,contentType:'application/json',body:'{}'});}if(request.resourceType()==='script'&&url.pathname.endsWith('/modules/space_exploration/src/space_module.js')&&/\/modules\/space_exploration\/index\.html(?:[?#]|$)/.test(frameUrl)){markModule();await moduleGate;return route.continue();}if(failLogo&&url.pathname.endsWith('/'+MODULE_ART_PATH))return route.fulfill({status:404,contentType:'text/plain',body:'Injected logo failure'});if(failExterior&&url.pathname.endsWith('/modules/space_exploration/assets/runtime/models/nexus-vii-civilization-ship.glb')){await exteriorGate;return route.fulfill({status:503,contentType:'text/plain',body:'Injected optional exterior failure'});}return route.continue();});
  try{
    await prepareCareer(page,server);const started=Date.now();await page.goto(server.url,{waitUntil:'commit',timeout:60000});await page.locator('#mfBootCover').waitFor({state:'visible',timeout:30000});await page.locator('#mfBootCover').waitFor({state:'hidden',timeout:90000});const titleReadyMs=Date.now()-started;
    await page.waitForFunction(()=>typeof showFrontScreen==='function'&&typeof mfExplorationMenuSync==='function',null,{timeout:30000});await page.evaluate(()=>{window.__MF_COMMISSIONING_RETURN_ACTIVE__=true;showFrontScreen('startScreen');mfExplorationMenuSync();});await page.locator('#ugaBtn').waitFor({state:'visible',timeout:10000});
    const baseReady=await page.evaluate(()=>({timeline:window.__MF_LOADER_TIMELINE__,loaders:['mfBootCover','loadScr','renderVeil'].filter(id=>{const node=document.getElementById(id),style=node&&getComputedStyle(node);return node&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01;}),imageErrors:window.__MF_IMAGE_ERRORS__}));assertNoOverlap(baseReady.timeline,`${label} base`);assert.deepEqual(baseReady.loaders,[]);assert.deepEqual(baseReady.imageErrors,[]);
    const menuShot=join(out,`${label}-01-ready-to-open.png`);await page.screenshot({path:menuShot});report.screenshots.push(menuShot);const clickStarted=Date.now();
    const immediate=await page.evaluate(()=>{window.__MF_COMMISSIONING_RETURN_ACTIVE__=false;const button=document.getElementById('ugaBtn'),box=button.getBoundingClientRect(),started=performance.now(),event=type=>new PointerEvent(type,{bubbles:true,cancelable:true,isPrimary:true,pointerId:91,pointerType:'touch',clientX:box.left+box.width/2,clientY:box.top+box.height/2});button.dispatchEvent(event('pointerdown'));button.dispatchEvent(event('pointerup'));return {feedbackMs:performance.now()-started,ariaBusy:button.getAttribute('aria-busy'),launching:button.classList.contains('is-launching'),toast:document.getElementById('toast')?.textContent?.trim()||''};});
    await Promise.race([moduleReached,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label}: UGA module script gate not reached`)),20000))]);const moduleUrl=page.url();assert(new URL(moduleUrl).pathname.endsWith('/modules/space_exploration/index.html'),`${label}: module script came from unexpected document ${moduleUrl}`);await page.locator('#renderVeil').waitFor({state:'visible',timeout:10000});await page.locator('.render-brand').waitFor({state:'visible',timeout:10000});
    if(!failLogo){await page.locator('.render-brand img').waitFor({state:'visible',timeout:10000});await page.locator('.render-brand img').evaluate(image=>image.decode());}else await page.waitForFunction(()=>getComputedStyle(document.querySelector('.render-brand img')).display==='none'&&window.__MF_IMAGE_ERRORS__.length===1);
    const moduleLoading=await page.evaluate(()=>{const visible=node=>{if(!node)return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0;},brand=document.querySelector('.render-brand'),image=brand.querySelector('img'),fallback=brand.querySelector('.render-brand-fallback'),box=brand.getBoundingClientRect(),top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return {timeline:window.__MF_LOADER_TIMELINE__,loaders:['mfBootCover','loadScr','renderVeil'].filter(id=>visible(document.getElementById(id))),brand:{label:brand.getAttribute('aria-label'),image:{display:getComputedStyle(image).display,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,currentSrc:image.currentSrc},fallback:{text:fallback.textContent.trim(),visible:visible(fallback)},top:{tag:top?.tagName||'',className:top?.className||''},box:{x:box.x,y:box.y,width:box.width,height:box.height}},imageErrors:window.__MF_IMAGE_ERRORS__};});
    assert.deepEqual(moduleLoading.loaders,['renderVeil']);assert.match(moduleLoading.brand.label,/^MASSFRONT\b/);assert.equal(moduleLoading.brand.fallback.text,'MASSFRONT');
    if(failLogo){assert.equal(moduleLoading.brand.image.display,'none');assert.equal(moduleLoading.brand.top.className,'render-brand-fallback');assert.equal(moduleLoading.imageErrors.length,1);}else{assert.equal(moduleLoading.brand.image.complete,true);assert.equal(moduleLoading.brand.image.naturalWidth,1280);assert.equal(moduleLoading.brand.image.naturalHeight,681);assert.match(moduleLoading.brand.image.currentSrc,/./);assert.equal(moduleLoading.brand.top.tag,'IMG');assert.deepEqual(moduleLoading.imageErrors,[]);}
    const loadShot=join(out,`${label}-02-module-readiness.png`);await page.screenshot({path:loadShot});report.screenshots.push(loadShot);releaseModule();
    await page.waitForFunction(()=>{const visible=node=>{if(!node)return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0;},shell=document.querySelector('.uga-command-shell');return window.__MASSFRONT_SPACE__?.scene==='uga'&&shell?.dataset.view==='campaign_hub'&&!visible(document.getElementById('renderVeil'))&&[...shell.querySelectorAll('button')].some(button=>{const box=button.getBoundingClientRect();return !button.disabled&&box.width>=44&&box.height>=44;});},null,{timeout:20000});
    const readySettled=await page.evaluate(()=>Promise.race([window.__MASSFRONT_SPACE__.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),5000))]));assert.equal(readySettled,true,'Campaign Hub readiness still waits for optional exterior art');const firstInteractiveMs=Date.now()-clickStarted;
    let failureState=null;if(failExterior){releaseExterior();await page.waitForFunction(()=>document.getElementById('moduleFrame')?.dataset.exteriorVisualState==='failed',null,{timeout:10000});await page.waitForTimeout(650);failureState=await page.evaluate(()=>{const visible=node=>{if(!node)return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0;},shell=document.querySelector('.uga-command-shell');return {visualState:document.getElementById('moduleFrame')?.dataset.exteriorVisualState,veilVisible:visible(document.getElementById('renderVeil')),view:shell?.dataset.view,interactive:[...shell.querySelectorAll('button')].filter(button=>{const box=button.getBoundingClientRect();return !button.disabled&&box.width>=44&&box.height>=44;}).length};});assert.equal(failureState.visualState,'failed');assert.equal(failureState.veilVisible,false);assert.equal(failureState.view,'campaign_hub');assert(failureState.interactive>0);}
    const finalState=await page.evaluate(()=>{const visible=node=>{if(!node)return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0;},shell=document.querySelector('.uga-command-shell'),depart=shell?.querySelector('.uga-campaign-depart'),box=depart?.getBoundingClientRect();return {scene:window.__MASSFRONT_SPACE__?.scene,view:shell?.dataset.view,veilVisible:visible(document.getElementById('renderVeil')),imageErrors:window.__MF_IMAGE_ERRORS__,timeline:window.__MF_LOADER_TIMELINE__,interactiveButtons:[...shell.querySelectorAll('button')].filter(button=>{const box=button.getBoundingClientRect();return !button.disabled&&box.width>=44&&box.height>=44;}).length,depart:depart?{visible:visible(depart),label:depart.textContent.trim().replace(/\s+/g,' '),box:{x:box.x,y:box.y,width:box.width,height:box.height}}:null};});
    assert.equal(finalState.scene,'uga');assert.equal(finalState.view,'campaign_hub');assert.equal(finalState.veilVisible,false);assert(finalState.interactiveButtons>0);assert.equal(finalState.depart?.visible,true);assert.match(finalState.depart.label,/DEPART \/ RETURN TO ORBIT/);assert(finalState.depart.box.width>=44&&finalState.depart.box.height>=44);assert(finalState.depart.box.x>=0&&finalState.depart.box.y>=0&&finalState.depart.box.x+finalState.depart.box.width<=viewport.width&&finalState.depart.box.y+finalState.depart.box.height<=viewport.height,'Campaign Hub departure action is clipped');assertNoOverlap(finalState.timeline,`${label} final`);if(failLogo)assert.equal(finalState.imageErrors.length,1);else assert.deepEqual(finalState.imageErrors,[]);
    assert.equal(immediate.ariaBusy,'true');assert.equal(immediate.launching,true);assert.match(immediate.toast,/Opening UGA Command/i);assert(immediate.feedbackMs<50);assert(firstInteractiveMs<5000,`Campaign Hub took ${firstInteractiveMs}ms after UGA tap`);assert.deepEqual(telemetry.pageErrors,[]);assert.deepEqual(telemetry.requestFailures,[]);assert.deepEqual(telemetry.external,[]);
    if(failExterior){assert.deepEqual(telemetry.httpErrors.map(item=>({status:item.status,path:new URL(item.url).pathname})),[{status:503,path:'/modules/space_exploration/assets/runtime/models/nexus-vii-civilization-ship.glb'}]);assert(telemetry.consoleErrors.length>=1&&telemetry.consoleErrors.every(message=>/NEXUS-VII|Failed to load resource.*503/i.test(message)));report.expectedFailures.push({label,kind:'optional-exterior',http:telemetry.httpErrors,console:telemetry.consoleErrors});}else if(failLogo){assert.deepEqual(telemetry.httpErrors.map(item=>({status:item.status,path:new URL(item.url).pathname})),[{status:404,path:'/'+MODULE_ART_PATH}]);assert(telemetry.consoleErrors.every(message=>/Failed to load resource.*404/i.test(message)));report.expectedFailures.push({label,kind:'module-logo',http:telemetry.httpErrors,console:telemetry.consoleErrors,imageErrors:finalState.imageErrors});}else{assert.deepEqual(telemetry.httpErrors,[]);assert.deepEqual(telemetry.consoleErrors,[]);}
    const finalShot=join(out,`${label}-03-campaign-hub.png`);await page.screenshot({path:finalShot});report.screenshots.push(finalShot);
    let departure=null;
    if(kind==='packed'&&!failExterior&&!failLogo){
      const departStarted=Date.now();
      const feedback=await page.evaluate(()=>{const button=document.querySelector('.uga-campaign-depart'),shell=document.querySelector('.uga-command-shell'),started=performance.now();button.click();const veil=document.getElementById('renderVeil'),style=getComputedStyle(veil),box=veil.getBoundingClientRect();return {feedbackMs:performance.now()-started,busy:shell.classList.contains('is-busy'),veilVisible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0,phase:document.getElementById('loadPhase')?.textContent?.trim()||'',detail:document.getElementById('loadStatus')?.textContent?.trim()||''};});
      assert(feedback.feedbackMs<50);assert.equal(feedback.busy,true);assert.equal(feedback.veilVisible,true);assert.match(feedback.phase,/STREAMING AELOS/);assert.match(feedback.detail,/DECODING AUTHORED PLANET/);
      const departShot=join(out,`${label}-04-depart-feedback.png`);await page.screenshot({path:departShot});report.screenshots.push(departShot);
      await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene==='system'&&window.__MASSFRONT_SPACE__?.engine?.currentSystem&&getComputedStyle(document.getElementById('renderVeil')).pointerEvents==='none',null,{timeout:90000});
      departure={feedback,firstOrbitInteractiveMs:Date.now()-departStarted,...await page.evaluate(()=>({scene:window.__MASSFRONT_SPACE__.scene,toastVisible:document.getElementById('toastBanner')?.classList.contains('show')||false,toastText:document.getElementById('toastBanner')?.textContent?.trim()||''}))};
      assert.equal(departure.scene,'system');assert.equal(departure.toastVisible,false);assert.doesNotMatch(departure.toastText,/UGA COMMAND ONLINE/);
      const returnStarted=Date.now();await page.locator('#btnUgaCommand').click();
      await page.waitForFunction(()=>{const shell=document.querySelector('.uga-command-shell');return window.__MASSFRONT_SPACE__?.scene==='uga'&&shell?.dataset.view==='campaign_hub'&&getComputedStyle(document.getElementById('renderVeil')).pointerEvents==='none'&&document.querySelector('.uga-campaign-depart');},null,{timeout:5000});
      departure.returnToHubMs=Date.now()-returnStarted;departure.returnView=await page.evaluate(()=>document.querySelector('.uga-command-shell')?.dataset.view);assert.equal(departure.returnView,'campaign_hub');assert(departure.returnToHubMs<5000);
      const returnShot=join(out,`${label}-05-returned-campaign-hub.png`);await page.screenshot({path:returnShot});report.screenshots.push(returnShot);
    }
    report.cases.push({kind:'coordinated-handoff',runtime:kind,failExterior,failLogo,titleReadyMs,immediate,firstInteractiveMs,readySettled,baseReady,moduleLoading,finalState,failureState,departure,telemetry,status:'PASS'});
  }finally{releaseModule();releaseExterior();publishTelemetry(telemetry);await run.context.close().catch(()=>{});}
}

async function runTacticalLoader(browser,server){
  const label='packed-tactical-loader',run=await trackedPage(browser,label,{dpr:3,commissioningGuard:true}),{page,telemetry}=run;
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(url.hostname)){telemetry.external.push(url.origin+url.pathname);return route.fulfill({status:200,contentType:'application/json',body:'{}'});}return route.continue();});
  try{
    await prepareCareer(page,server);await page.goto(server.url,{waitUntil:'commit',timeout:60000});await page.locator('#mfBootCover').waitFor({state:'hidden',timeout:90000});await page.waitForFunction(()=>typeof startTrainingMission==='function',null,{timeout:30000});
    await page.evaluate(()=>{const nativeRaf=window.requestAnimationFrame.bind(window),pending=[];window.requestAnimationFrame=callback=>{pending.push(callback);return pending.length;};window.__MF_RELEASE_TACTICAL_LOADER__=()=>{window.requestAnimationFrame=nativeRaf;for(const callback of pending)nativeRaf(callback);};startTrainingMission();});
    await page.locator('#loadScr').waitFor({state:'visible',timeout:5000});await page.locator('.mfLoadBrand img').evaluate(image=>image.decode());await page.waitForTimeout(100);
    const readState=()=>page.evaluate(()=>{const visible=node=>{if(!node)return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)>.01&&box.width>0&&box.height>0;},loader=document.getElementById('loadScr'),brand=loader.querySelector('.mfLoadBrand'),image=brand.querySelector('img'),fallback=brand.querySelector('.mfLoadBrandFallback'),box=brand.getBoundingClientRect(),top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return {loaders:['mfBootCover','loadScr','renderVeil'].filter(id=>visible(document.getElementById(id))),timeline:window.__MF_LOADER_TIMELINE__,label:brand.getAttribute('aria-label'),copy:{eyebrow:document.getElementById('loadEyebrow')?.textContent,title:document.getElementById('loadTitle')?.textContent,status:document.getElementById('loadSub')?.textContent},brand:{box:{x:box.x,y:box.y,width:box.width,height:box.height},image:{display:getComputedStyle(image).display,complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,currentSrc:image.currentSrc},fallback:{text:fallback.textContent.trim(),visible:visible(fallback)},top:{tag:top?.tagName||'',className:top?.className||''}},imageErrors:window.__MF_IMAGE_ERRORS__};});
    const loaded=await readState();assert.deepEqual(loaded.loaders,['loadScr']);assertNoOverlap(loaded.timeline,label);assert.match(loaded.label,/^MASSFRONT\b/);assert.equal(loaded.brand.image.complete,true);assert.equal(loaded.brand.image.naturalWidth,1280);assert.equal(loaded.brand.image.naturalHeight,681);assert.equal(loaded.brand.top.tag,'IMG');assert.equal(loaded.brand.fallback.text,'MASSFRONT');assert(loaded.brand.box.x>=0&&loaded.brand.box.x+loaded.brand.box.width<=viewport.width);assert.match(loaded.copy.status,/SURVEYING|MAPPING|PLACING|RAISING|SEEDING/);
    const loadedShot=join(out,'packed-tactical-loader-01-owner-art.png');await page.screenshot({path:loadedShot});report.screenshots.push(loadedShot);
    await page.evaluate(()=>{document.querySelector('.mfLoadBrand img').src='data:image/png;base64,AA==';});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.mfLoadBrand img')).display==='none'&&window.__MF_IMAGE_ERRORS__.length===1);
    const fallback=await readState();assert.deepEqual(fallback.loaders,['loadScr']);assert.equal(fallback.brand.image.display,'none');assert.equal(fallback.brand.top.className,'mfLoadBrandFallback');assert.equal(fallback.brand.fallback.visible,true);assert.deepEqual(fallback.brand.box,loaded.brand.box);assert.equal(fallback.imageErrors.length,1);
    const fallbackShot=join(out,'packed-tactical-loader-02-text-fallback.png');await page.screenshot({path:fallbackShot});report.screenshots.push(fallbackShot);
    assert.deepEqual(telemetry.pageErrors,[]);assert.deepEqual(telemetry.consoleErrors,[]);assert.deepEqual(telemetry.httpErrors,[]);assert.deepEqual(telemetry.requestFailures,[]);assert.deepEqual(telemetry.external,[]);
    report.expectedFailures.push({label,kind:'tactical-logo',imageErrors:fallback.imageErrors});report.cases.push({kind:'tactical-loader',runtime:'packed',entry:'startTrainingMission with next-frame gate',loaded,fallback,telemetry,status:'PASS'});
  }finally{publishTelemetry(telemetry);await run.context.close().catch(()=>{});}
}

let freeze,sourceServer,packedServer,browser;
try{
  freeze=await acquireVerificationFreeze({root,label:`Coordinated loading to UGA ${tag}`,quietMs:5000});await mkdir(out,{recursive:true});report.identity=await collectIdentity();sourceServer=await startServer(root,'source');packedServer=await startServer(packed,'packed');browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  const gpuPage=await browser.newPage();report.gpu=await assertHardwareGpu(gpuPage);await gpuPage.close();
  await runBootCase(browser,sourceServer,'source','no-preference');await runBootCase(browser,packedServer,'packed','no-preference');await runBootCase(browser,packedServer,'packed','reduce');await runBootCase(browser,packedServer,'packed','no-preference',true);
  await runUgaHandoff(browser,sourceServer,'source');await runUgaHandoff(browser,packedServer,'packed');await runUgaHandoff(browser,packedServer,'packed',{failLogo:true});await runUgaHandoff(browser,packedServer,'packed',{failExterior:true});await runTacticalLoader(browser,packedServer);
  await freeze.checkpoint('Source and packed loading to stable UGA captured');report.sourceStable=true;report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error.stack);}
finally{if(browser)await closePwBrowser(browser).catch(()=>{});if(sourceServer)await sourceServer.close().catch(()=>{});if(packedServer)await packedServer.close().catch(()=>{});if(freeze)await freeze.release({assertStable:true,name:'Coordinated loading to UGA acceptance complete'}).catch(error=>{report.sourceStable=false;report.freezeError=error.message;report.status='FAIL';process.exitCode=1;});await mkdir(out,{recursive:true});await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,out,sourceStable:report.sourceStable,cases:report.cases.length,screenshots:report.screenshots,failure:report.failure||null},null,2));}
