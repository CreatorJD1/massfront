#!/usr/bin/env node
/* Real-runtime interface matrix. Boots the complete game on hardware WebGL2,
   visits every front-end route at four representative form factors, exercises
   each visible tab, and records overflow/touch/visibility evidence. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVIDENCE_SCHEMA,
  VIEWPORT_PROFILES,
  computeDeviceIdentityId,
  readRepositoryFingerprint,
  readRuntimeFingerprint,
  sha256,
  summarizeEvidenceData,
  verifyInterfaceEvidence
} from './interface-audit/verify-interface-matrix.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp',process.argv[2]||'interface-matrix');
await mkdir(outDir,{recursive:true});
const workspaceGuard=await acquireVerificationFreeze({
  root,label:`interface matrix ${process.argv[2]||'interface-matrix'}`,
  quietMs:Number(process.env.MF_QUIET_PREFLIGHT_MS||15000),allowedPaths:[outDir]
});

let finalOutput=null,lateFailure=null,report=null,reportPath=null,activeViewport='setup';
try{

const MIME={
  '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg',
  '.wav':'audio/wav','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.webmanifest':'application/manifest+json','.wasm':'application/wasm'
};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
    const file=resolve(join(root,p));
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('nf');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;

const PHONE_UA='Mozilla/5.0 (Linux; Android 15; SM-S938U Build/AP3A.240905.015.A2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.260 Mobile Safari/537.36';
const TABLET_UA='Mozilla/5.0 (Linux; Android 15; Pixel Tablet Build/AP3A.240905.015.A2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.260 Safari/537.36';
const viewports=Object.entries(VIEWPORT_PROFILES).map(([key,profile])=>({
  key,width:profile.width,height:profile.height,scale:profile.dpr,
  mobile:profile.mobile,touch:profile.touch,
  userAgent:profile.mobile?(profile.formFactor==='tablet'?TABLET_UA:PHONE_UA):undefined
}));
const routes=[
  {key:'home',id:'startScreen',headerRequired:false},
  {key:'war-room',id:'warScr',render:'renderWarRoom'},
  {key:'operations',id:'opsScr',render:'renderOps'},
  {key:'research',id:'devScr',render:'renderDevelop'},
  {key:'orders',id:'dailyScr',render:'renderDaily'},
  {key:'intel',id:'dossierScr',render:'renderCodex'},
  {key:'arsenal',id:'armory',render:'renderArmory'},
  {key:'career',id:'profileScr',render:'renderProfile'},
  {key:'settings',id:'settingsScr',render:'renderSettings'},
  {key:'inbox',id:'inboxScr',render:'renderInbox'},
  {key:'updates',id:'updScr',render:'renderUpdatePanel'},
  {key:'social',id:'socialScr',social:true}
];

function slug(s){return String(s||'tab').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||'tab';}

/* The companion verifier fails closed when a report cannot prove which dirty
   worktree and runtime produced it. A later edit intentionally makes this
   evidence stale rather than green. */
const source=await readRepositoryFingerprint(root);
const runtime=await readRuntimeFingerprint(root);
report={
  evidenceSchema:EVIDENCE_SCHEMA,
  url,
  generatedAt:new Date().toISOString(),
  source,
  sourceAtCompletion:null,
  runtime,
  runtimeAtCompletion:null,
  captureCompleted:false,
  captureKind:'playwright-emulated-interface-matrix',
  browser:null,
  devices:{},
  gpu:null,
  webglContextLost:false,
  errors:{page:[],console:[],requests:[],capture:[],contextLossEvents:0},
  captures:[]
};
let browser=null;
try{
  browser=await launchPwBrowser({
    ownershipMode:'isolated',
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
  });
  report.browser={name:'chromium',version:typeof browser.version==='function'?browser.version():'UNKNOWN',headless:true};
  for(const vp of viewports){
    await workspaceGuard.checkpoint(`before viewport ${vp.key}`);
    activeViewport=vp.key;
    const pageOptions={viewport:{width:vp.width,height:vp.height},deviceScaleFactor:vp.scale,hasTouch:vp.touch,isMobile:!!vp.mobile,colorScheme:'dark'};
    if(vp.userAgent)pageOptions.userAgent=vp.userAgent;
    const page=await browser.newPage(pageOptions);
    page.on('pageerror',e=>report.errors.page.push({viewport:vp.key,message:e.message}));
    /* A blocked or failed network request is runtime evidence, even if it is
       external. Silently filtering it made an incomplete capture look clean. */
    page.on('console',m=>{if(m.type()==='error')report.errors.console.push({viewport:vp.key,message:m.text()});});
    page.on('requestfailed',r=>{const u=r.url();report.errors.requests.push({viewport:vp.key,url:u,error:r.failure()?.errorText||'failed'});});
    page.on('response',response=>{if(response.status()>=400)report.errors.requests.push({viewport:vp.key,url:response.url(),status:response.status(),error:`HTTP ${response.status()}`});});
    await page.addInitScript(()=>{
      addEventListener('webglcontextlost',()=>{
        window.__mfInterfaceContextLosses=(window.__mfInterfaceContextLosses||0)+1;
      },true);
    });
    await page.addInitScript(()=>{
      try{
        localStorage.clear();
        localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
        localStorage.setItem('mf_offline','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
        localStorage.setItem('mf_auth_gate_v1','1');
      }catch{}
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>typeof showFrontScreen==='function'&&typeof renderMetaHead==='function'&&
      typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady===true&&typeof MFSocialUI!=='undefined',null,{timeout:120000});
    await workspaceGuard.checkpoint(`after boot ${vp.key}`);
    await page.evaluate(()=>{
      try{if(typeof apClose==='function')apClose();}catch{}
      try{if(typeof apGateSatisfied==='function')apGateSatisfied();}catch{}
      try{if(typeof stopAttract==='function')stopAttract();}catch{}
      document.body.classList.add('mfIntroDone');
      for(const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay']){
        const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
      }
      document.querySelectorAll('.mfTitleReveal').forEach(el=>el.style.setProperty('display','none','important'));
      renderMetaHead();showFrontScreen('startScreen');
    });
    const gpu=await page.evaluate(()=>{
      const c=document.createElement('canvas'),g=c.getContext('webgl2');if(!g)return {renderer:'NO-WEBGL2'};
      const d=g.getExtension('WEBGL_debug_renderer_info');return {renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):String(g.getParameter(g.RENDERER))};
    });
    report.gpu??=gpu;
    if(/swiftshader|software|llvmpipe|no-webgl2/i.test(gpu.renderer))throw new Error('REFUSING software renderer: '+gpu.renderer);
    const measuredDevice=await page.evaluate(()=>({
      userAgent:navigator.userAgent,
      platform:navigator.platform,
      maxTouchPoints:navigator.maxTouchPoints,
      width:innerWidth,
      height:innerHeight,
      dpr:devicePixelRatio
    }));
    const device={
      profileKey:vp.key,
      captureKind:'playwright-emulated-viewport',
      browserName:'chromium',
      browserVersion:report.browser.version,
      userAgent:measuredDevice.userAgent,
      platform:measuredDevice.platform,
      maxTouchPoints:measuredDevice.maxTouchPoints,
      renderer:gpu.renderer,
      requested:{width:vp.width,height:vp.height,dpr:vp.scale,mobile:!!vp.mobile,touch:!!vp.touch},
      actual:{width:measuredDevice.width,height:measuredDevice.height,dpr:measuredDevice.dpr}
    };
    device.id=computeDeviceIdentityId(device);
    report.devices[vp.key]=device;

    for(const route of routes){
      await workspaceGuard.checkpoint(`before ${vp.key}/${route.key}`);
      const opened=await page.evaluate(R=>{
        try{
          if(R.social){if(typeof MFSocialUI==='undefined'||typeof MFSocialUI.open!=='function')return {ok:false,reason:'MFSocialUI missing'};MFSocialUI.open();return {ok:true};}
          if(R.render&&typeof window[R.render]==='function')window[R.render]();
          const opened=showFrontScreen(R.id),el=document.getElementById(R.id);
          return {ok:opened!==false&&!!el&&getComputedStyle(el).display!=='none'};
        }catch(e){return {ok:false,reason:String(e&&e.stack||e)};}
      },route);
      /* Store and menu children have intentionally staggered entrance motion.
         Capture their settled state so animation delay cannot masquerade as
         an empty panel. */
      await page.waitForTimeout(750);
      if(!opened.ok){report.captures.push({viewportKey:vp.key,viewport:{w:vp.width,h:vp.height},route:route.key,openError:opened.reason||'route rejected'});continue;}

      const tabSelector=`#${route.id} [role="tab"],#${route.id} .tabRow>.tabBtn`;
      const tabs=await page.locator(tabSelector).evaluateAll(nodes=>nodes.filter(n=>{
        const c=getComputedStyle(n),r=n.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&r.width>0&&r.height>0;
      }).map((n,i)=>({index:i,label:(n.textContent||'').replace(/\s+/g,' ').trim(),id:n.id})));
      const states=tabs.length?tabs:[{index:-1,label:'default',id:''}];
      for(const state of states){
        if(state.index>=0){
          const tab=page.locator(tabSelector).nth(state.index);
          if(await tab.isEnabled())await tab.click({timeout:5000});
          await page.waitForTimeout(route.key==='arsenal'?500:100);
        }
        const metrics=await page.evaluate(({id,routeKey,tabLabel,headerRequired})=>{
          const root=document.getElementById(id);if(!root)return {missing:true};
          const rr=root.getBoundingClientRect(),visible=el=>{
            const c=getComputedStyle(el),r=el.getBoundingClientRect();
            return c.display!=='none'&&c.visibility!=='hidden'&&Number(c.opacity)!==0&&r.width>0&&r.height>0;
          };
          const controls=[...root.querySelectorAll('button,input,select,textarea,[role="button"],[role="tab"]')].filter(visible);
          const rects=controls.map(el=>{
            const r=el.getBoundingClientRect();let p=el.parentElement,scrollX=false;
            while(p&&p!==root){
              const c=getComputedStyle(p);
              if(/(auto|scroll)/.test(c.overflowX)&&p.scrollWidth>p.clientWidth+2){scrollX=true;break;}
              p=p.parentElement;
            }
            return {id:el.id||'',cls:String(el.className||'').slice(0,80),label:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('placeholder')||el.tagName).replace(/\s+/g,' ').trim().slice(0,80),x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),outside:r.right<-1||r.left>innerWidth+1||r.bottom<-1||r.top>innerHeight+1,clippedX:!scrollX&&(r.left<-1||r.right>innerWidth+1)};
          });
          const onScreen=rects.filter(r=>!r.outside);
          /* Size is a property of every rendered control, including controls
             currently below a scroll fold. Restricting this check to the
             viewport hid undersized targets in long settings/store panels. */
          const under44=rects.filter(r=>r.w<44||r.h<44);
          const scrollHosts=[root,...root.querySelectorAll('*')].filter(el=>{const c=getComputedStyle(el);return /(auto|scroll)/.test(c.overflowY)&&el.scrollHeight>el.clientHeight+2;}).map(el=>({id:el.id||'',cls:String(el.className||'').slice(0,80),client:el.clientHeight,scroll:el.scrollHeight}));
          const text=(root.innerText||'').replace(/\s+/g,' ').trim();
          const head=root.querySelector('.subMenuHead,.setupHead,h1,h2,[role="heading"]');
          const foot=root.querySelector('.setupFoot,.warFoot,.goResultFoot');
          const hr=head&&head.getBoundingClientRect(),fr=foot&&foot.getBoundingClientRect();
          /* A vertically scrollable route can reserve a physical scrollbar.
             scrollWidth - clientWidth then equals only that gutter (6px on the
             phone capture), not a horizontally clipped UI. Subtract the
             reserved gutter, while retaining genuine horizontal overflow. */
          const routeScrollbar=Math.max(0,root.offsetWidth-root.clientWidth);
          /* Overlay scrollbars may not change offsetWidth, while CSS reserves
             a small stable gutter in clientWidth. Allow one scrollbar-width
             only when this route actually scrolls vertically. */
          const stableGutter=root.scrollHeight>root.clientHeight+1?24:0;
          const routeOverflow=Math.max(0,root.scrollWidth-root.clientWidth-routeScrollbar-stableGutter);
          return {
            route:routeKey,tab:tabLabel,viewport:{w:innerWidth,h:innerHeight},display:getComputedStyle(root).display,
            root:{x:+rr.x.toFixed(1),y:+rr.y.toFixed(1),w:+rr.width.toFixed(1),h:+rr.height.toFixed(1)},
            documentOverflowX:document.documentElement.scrollWidth-innerWidth,
            routeOverflowX:routeOverflow,
            routeOverflowActionable:root.scrollWidth>root.clientWidth+1&&!/(hidden|clip|auto|scroll)/.test(getComputedStyle(root).overflowX),
            textLength:text.length,controlCount:rects.length,onScreenControls:onScreen.length,
            under44,clippedControls:rects.filter(r=>r.clippedX),scrollHosts,
            headerRequired:!!headerRequired,headerPresent:!!head,
            headerVisible:!!(head&&hr&&hr.bottom>0&&hr.top<innerHeight),
            footerRequired:!!foot,footerPresent:!!foot,
            footerVisible:!!(foot&&fr&&fr.top>=-1&&fr.bottom<=innerHeight+1)
          };
        },{id:route.id,routeKey:route.key,tabLabel:state.label,headerRequired:route.headerRequired!==false});
        const stateKey=state.index>=0?String(state.index):'default';
        const file=`${vp.key}-${route.key}-${stateKey}-${slug(state.label)}.png`;
        const screenshotBytes=await page.screenshot({path:join(outDir,file),fullPage:false});
        const screenshot={
          sha256:sha256(screenshotBytes),bytes:screenshotBytes.length,
          width:screenshotBytes.readUInt32BE(16),height:screenshotBytes.readUInt32BE(20),mime:'image/png'
        };
        report.captures.push({
          ...metrics,
          viewportKey:vp.key,
          deviceScaleFactor:measuredDevice.dpr,
          deviceId:device.id,
          binding:{
            sourceHead:source.head,
            sourceDirtyFingerprint:source.dirtyFingerprint,
            runtimeFingerprint:runtime.fingerprint,
            deviceId:device.id,
            viewportKey:vp.key
          },
          file,screenshot
        });
      }
    }
    const contextLosses=await page.evaluate(()=>window.__mfInterfaceContextLosses||0);
    if(contextLosses>0){report.webglContextLost=true;report.errors.contextLossEvents+=contextLosses;}
    await page.close();
  }
  report.captureCompleted=true;
}catch(error){
  report.captureCompleted=false;
  report.errors.capture.push({viewport:activeViewport,message:String(error&&error.stack||error)});
}finally{
  if(browser){
    try{await closePwBrowser(browser);}catch(error){report.captureCompleted=false;report.errors.capture.push({viewport:activeViewport,message:`Browser close failed: ${error.message||error}`});}
  }
  await new Promise(resolveClose=>server.close(resolveClose));
}

try{await workspaceGuard.checkpoint('capture completion');}catch(error){
  report.captureCompleted=false;
  report.errors.capture.push({viewport:activeViewport,message:String(error&&error.stack||error)});
}

report.sourceAtCompletion=await readRepositoryFingerprint(root);
report.runtimeAtCompletion=await readRuntimeFingerprint(root);
try{await workspaceGuard.checkpoint('after completion fingerprints');}catch(error){
  report.captureCompleted=false;
  report.errors.capture.push({viewport:activeViewport,message:String(error&&error.stack||error)});
}
report.summary=summarizeEvidenceData(report);
reportPath=join(outDir,'report.json');
await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,'utf8');

/* The producer delegates its final exit decision to the same fail-closed
   verifier used in CI. New defect classes cannot accidentally be collected
   in the report while being omitted from the process exit condition. */
const audit=await verifyInterfaceEvidence(reportPath,{root});
await workspaceGuard.checkpoint('after evidence audit');
const finalRuntime=await readRuntimeFingerprint(root);
/* Read repository identity last. In particular, this closes the only
   index-only window: GIT_OPTIONAL_LOCKS=0 prevents our read from refreshing
   .git/index, while a concurrent git add/update-index changes this value. */
const finalSource=await readRepositoryFingerprint(root);
if(finalSource.head!==report.sourceAtCompletion.head||
   finalSource.dirtyFingerprint!==report.sourceAtCompletion.dirtyFingerprint){
  throw new Error('SOURCE_CHANGED_AFTER_EVIDENCE_AUDIT: active repository identity no longer matches the completion fingerprint');
}
if(finalRuntime.fingerprint!==report.runtimeAtCompletion.fingerprint){
  throw new Error('RUNTIME_CHANGED_AFTER_EVIDENCE_AUDIT: active runtime no longer matches the completion fingerprint');
}
finalOutput=JSON.stringify({gpu:report.gpu,summary:report.summary,outcome:audit.outcome,blockers:audit.blockerSummary.byCode},null,2);
process.exitCode=audit.exitCode;
}catch(error){
  lateFailure=error;
}finally{
  try{await workspaceGuard.release({assertStable:true,name:'final evidence release'});}catch(error){lateFailure??=error;}
  if(lateFailure&&report&&reportPath){
    report.captureCompleted=false;
    report.errors.capture.push({viewport:activeViewport,message:`Late verification failure: ${String(lateFailure&&lateFailure.stack||lateFailure)}`});
    report.summary=summarizeEvidenceData(report);
    await writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`,'utf8');
  }
}
if(lateFailure)throw lateFailure;
if(finalOutput)console.log(finalOutput);
