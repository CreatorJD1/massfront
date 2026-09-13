#!/usr/bin/env node
/* Stage 7 production / construction / economy evidence probe.
   Serves the current source tree (never www), enters a live match state, and
   verifies the actual responsive HUD at the primary portrait and narrow phone
   viewports. Missing semantic fields, stale/mixed identity, undersized targets,
   overflow, page/WebGL errors, or missing screenshots are hard failures. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership,
  closePwBrowser,
  launchPwBrowser,
  pwBrowserEvidence,
  recordPwBrowserGpu,
} from './pw-browser.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'..');
const OUT=join(ROOT,'tmp','stage7-production-ui');
const REPORT=join(OUT,'report.json');
const SOURCE_FILES=['index.html','src/ui/hud.js','src/ui/render3d.js','src/styles/ui.css','assets/ui.css','src/game/sim.js','src/game/economy.js','src/game/meta.js','src/uistack.js'];
const PROFILES=[
  {id:'phone-portrait',width:412,height:915},
  {id:'narrow-phone',width:344,height:882},
];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const SHA=value=>createHash('sha256').update(value).digest('hex');
const hashFile=async path=>SHA(await readFile(path));
const iso=()=>new Date().toISOString();

function git(args){return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim();}
function sourceState(){
  const head=git(['rev-parse','HEAD']);
  /* Evidence output is not source. Exclude this probe's own directory so the
     first production-full/economy-full screenshots cannot invalidate the
     before/after identity they are being written to prove. */
  const status=execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=all','--','.',':(exclude)tmp/stage7-production-ui/**'],{cwd:ROOT,encoding:null,windowsHide:true});
  /* Status names alone do not change while another agent edits an already
     dirty file. Fold the complete tracked patch into the fingerprint so a
     concurrent write invalidates the evidence instead of going unnoticed. */
  const trackedPatch=execFileSync('git',['diff','--binary','HEAD','--'],{cwd:ROOT,encoding:null,windowsHide:true,maxBuffer:512*1024*1024});
  const dirtyFingerprint=SHA(Buffer.concat([status,Buffer.from('\0TRACKED-PATCH\0'),trackedPatch]));
  return {head,dirty:status.length>0,dirtyFingerprint,dirtyBytes:status.length,trackedPatchBytes:trackedPatch.length};
}
function pngDimensions(buffer){
  if(buffer.length<24||buffer.toString('ascii',1,4)!=='PNG')return null;
  return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
}
async function identitySnapshot(){
  const files={};
  for(const rel of SOURCE_FILES)files[rel]=await hashFile(join(ROOT,rel));
  return {...sourceState(),files};
}

async function main(){
  await mkdir(OUT,{recursive:true});
  const startedAt=iso();
  const identityBefore=await identitySnapshot();
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
      const candidate=resolve(ROOT,pathname==='/'?'index.html':pathname.replace(/^\/+/,''));
      const rootPrefix=resolve(ROOT)+sep;
      if(candidate!==resolve(ROOT,'index.html')&&!candidate.startsWith(rootPrefix)){res.writeHead(403);res.end('forbidden');return;}
      const body=await readFile(candidate);
      res.writeHead(200,{'Content-Type':MIME[extname(candidate).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Massfront-Evidence-Root':'source'});
      res.end(body);
    }catch{res.writeHead(404);res.end('not found');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const url=`http://127.0.0.1:${server.address().port}/?stage7Probe=1`;
  const blockers=[];
  const profiles=[];
  let browser=null;
  let browserIdentity=null;
  try{
    const servedFiles={};
    for(const rel of SOURCE_FILES){
      const response=await fetch(new URL(rel,url));
      const body=Buffer.from(await response.arrayBuffer());
      servedFiles[rel]={status:response.status,sourceHeader:response.headers.get('x-massfront-evidence-root'),sha256:SHA(body),localSha256:identityBefore.files[rel],match:response.ok&&response.headers.get('x-massfront-evidence-root')==='source'&&SHA(body)===identityBefore.files[rel]};
      if(!servedFiles[rel].match)blockers.push(`served-source mismatch: ${rel}`);
    }
    browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
    browserIdentity=await assertPwBrowserOwnership(browser);
    for(const profile of PROFILES){
      const pageErrors=[],consoleErrors=[],requestFailures=[];
      const context=await browser.newContext({
        viewport:{width:profile.width,height:profile.height},deviceScaleFactor:1,hasTouch:true,isMobile:true,
        userAgent:'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 MASSFRONT-Stage7-QA',
        colorScheme:'dark',reducedMotion:'reduce',
      });
      const page=await context.newPage();
      page.on('pageerror',error=>pageErrors.push(String(error?.message||error)));
      page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
      page.on('requestfailed',request=>requestFailures.push({url:request.url(),error:request.failure()?.errorText||'unknown'}));
      await page.addInitScript(()=>{
        window.__mfStage7Gl={contextLosses:0};
        addEventListener('webglcontextlost',()=>{window.__mfStage7Gl.contextLosses++;},true);
        try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_offline','1');}catch{}
      });
      const rec={profile,scenarios:{},pageErrors,consoleErrors,requestFailures,status:'UNKNOWN'};
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof addBld==='function'&&typeof renderBuildMenu==='function'&&typeof renderProdMenu==='function'&&typeof updateHUD==='function',{timeout:45000});
        /* Boot continues after the classic scripts become callable. Let its
           delayed intro/account work settle before installing a synthetic live
           match, or those timers can reset openBld underneath the evidence. */
        await page.waitForTimeout(11000);
        const intro=page.locator('#mfIntroStart');if(await intro.isVisible()){await intro.click();await page.waitForTimeout(500);}
        const accountGate=page.locator('#apCloseBtn');if(await accountGate.isVisible())await accountGate.click();
        await page.waitForFunction(()=>{const el=document.getElementById('apOverlay');return !el||getComputedStyle(el).display==='none';},{timeout:3000});
        await page.waitForTimeout(150);
        const runtime=await page.evaluate(()=>{
          try{if(typeof stopAttract==='function')stopAttract();}catch{}
          resetWorld();attractOn=false;demoMode=false;matchLive=true;running=true;paused=true;gameEnded=false;fogOn=false;heroLvl=99;
          document.body.classList.remove('menuMode','mfMenuOpen','uiIntelOpen');document.body.classList.add('mfIntroDone','uiPrimaryOpen');
          const boot=document.getElementById('mfBootCover');if(boot)boot.remove();
          for(const overlay of document.querySelectorAll('.overlay'))overlay.style.display='none';
          blds.length=0;
          const cx=MAP*.5,cy=MAP*.5;
          addBld('techlab',0,cx-100,cy,true,0);
          const factory=addBld('fac',0,cx,cy,true,0);factory.tier=1;factory.queue=[0,1];factory.prodT=.7;
          openBld=blds.indexOf(factory);
          resM[0]=Math.min(RES_MCAP[0]-250,4250);resE[0]=Math.min(RES_ECAP[0]-400,6800);
          mRate=42.5;eRate=176;mSpend=17.5;eSpend=89;
          for(let i=0;i<12;i++)updateHUD(60);
          const primary=document.getElementById('primaryRow');if(primary)primary.style.display='flex';
          document.body.classList.add('hudTacticalDock');
          const fpQuote=typeof mfStructureBuildQuote==='function'?mfStructureBuildQuote('rail'):null;
          const fpKit=typeof playerKitKey==='function'?playerKitKey():'nova';
          const fpReserved=typeof bldFoot==='function'?bldFoot('rail',fpKit):null;
          const fpPlacement=typeof mfReservedPlacementFoot==='function'?mfReservedPlacementFoot('rail'):null;
          const footprintContract=!!(fpQuote&&fpReserved&&fpPlacement&&fpQuote.footprint[0]===fpReserved[0]&&fpQuote.footprint[1]===fpReserved[1]&&fpPlacement[0]===fpReserved[0]&&fpPlacement[1]===fpReserved[1]);
          const canvas=document.createElement('canvas'),gl2=canvas.getContext('webgl2');
          const dbg=gl2&&gl2.getExtension('WEBGL_debug_renderer_info');
          return {webgl2:!!gl2,renderer:dbg?gl2.getParameter(dbg.UNMASKED_RENDERER_WEBGL):(gl2?'webgl2-no-debug-info':null),vendor:dbg?gl2.getParameter(dbg.UNMASKED_VENDOR_WEBGL):(gl2?'webgl2-no-debug-info':null),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},matchLive,sourceMarker:document.querySelector('script[src*="src/"]')?.src||null,footprintContract,footprintQuote:fpQuote?.footprint||null,footprintReserved:fpReserved,footprintPlacement:fpPlacement};
        });
        rec.runtime=runtime;
        if(!runtime.webgl2)rec.pageErrors.push('WebGL2 unavailable');
        if(!browserIdentity?.gpu&&runtime.renderer&&runtime.vendor){try{recordPwBrowserGpu(browser,{renderer:runtime.renderer,vendor:runtime.vendor});}catch{}}

        const capture=async(name)=>{
          const path=join(OUT,`${profile.id}-${name}.png`);
          const buffer=await page.screenshot({path,fullPage:false});
          const dimensions=pngDimensions(buffer);
          const evidence={path,relativePath:relative(ROOT,path).replace(/\\/g,'/'),sha256:SHA(buffer),bytes:buffer.length,dimensions,expected:{width:profile.width,height:profile.height},valid:!!dimensions&&dimensions.width===profile.width&&dimensions.height===profile.height};
          if(!evidence.valid)blockers.push(`${profile.id}/${name}: invalid screenshot dimensions`);
          return evidence;
        };
        const inspectPanel=async(selector,kind)=>page.evaluate(({selector,kind})=>{
          const panel=document.querySelector(selector);
          const visible=element=>{if(!element)return false;const r=element.getBoundingClientRect(),s=getComputedStyle(element);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
          const rect=panel?.getBoundingClientRect();
          const targets=panel?[...panel.querySelectorAll('button,[role="button"],[tabindex="0"]')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id||null,className:String(el.className||''),label:el.getAttribute('aria-label')||el.textContent.trim().slice(0,80),width:+r.width.toFixed(2),height:+r.height.toFixed(2),status:r.width>=44&&r.height>=44?'PASS':'FAIL'};}):[];
          const cards=panel?[...panel.querySelectorAll('.bcard')].filter(visible).map(card=>{
            const clean=el=>el?.textContent.replace(/\s+/g,' ').trim()||'';
            const metaNodes=[...card.querySelectorAll('.cardMeta')],meta=metaNodes[0],dependency=card.querySelector('.cardDependency');
            const locks=[...card.querySelectorAll('.cardLocks')].filter(el=>!el.hidden&&visible(el)).map(clean).join(' · ');
            const id=card.dataset.previewId||'';
            const expected=card.dataset.previewKind==='building'&&typeof bldFoot==='function'?bldFoot(id,typeof playerKitKey==='function'?playerKitKey():'nova'):null;
            const expectedText=expected?Math.round(expected[0])+'x'+Math.round(expected[1]):null;
            const metaText=metaNodes.map(el=>{const parts=[...el.children].map(clean).filter(Boolean);return parts.length?parts.join(' · '):clean(el);}).filter(Boolean).join(' · ');
            return {text:clean(card),locked:card.classList.contains('locked'),ariaDisabled:card.getAttribute('aria-disabled'),cost:clean(card.querySelector('.cost')),meta:metaText,dependency:clean(dependency),locks,effect:clean(card.querySelector('.cardEffect')),queueLock:clean(card.querySelector('.cardQueueLock:not([hidden])')),queueFull:card.classList.contains('queueFull'),footprint:card.dataset.footprint||null,footprintPolicy:card.dataset.footprintPolicy||null,expectedFootprint:expectedText,footprintMatches:expectedText==null||card.dataset.footprint===expectedText,metaFont:metaNodes.length?Math.min(...metaNodes.map(el=>parseFloat(getComputedStyle(el).fontSize))):null,dependencyFont:dependency?parseFloat(getComputedStyle(dependency).fontSize):null};
          }):[];
          const text=panel?.textContent.replace(/\s+/g,' ').trim()||'';
          const obstructionSelectors=['#apOverlay','#apConfirmOverlay','#mfPreAlphaIntro','#mfBootCover'];
          const obstructions=obstructionSelectors.filter(s=>visible(document.querySelector(s)));
          const viewportOverflow=document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1;
          const panelOverflow=!!panel&&(panel.scrollWidth>panel.clientWidth+1||(rect&&(rect.left<-1||rect.right>innerWidth+1)));
          const targetFailures=targets.filter(t=>t.status!=='PASS');
          const every=fn=>cards.length>0&&cards.every(fn);
          const production=kind.startsWith('production'),construction=kind==='construction',economy=kind.startsWith('economy');
          const required=production?{
            cost:every(c=>/\d+(?:\.\d+)?\s*m\b/i.test(c.cost)&&/\d+(?:\.\d+)?\s*e\b/i.test(c.cost)),
            effectiveTime:every(c=>/\d+(?:\.\d+)?\s*s\b/i.test(c.meta)),
            size:every(c=>/(?:LIGHT|MEDIUM|HEAVY|SUPERHEAVY|Ø\d+)/i.test(c.meta)),
            population:every(c=>/\bPOP\s*\+?\d/i.test(c.meta)),
            queue:every(c=>/\bQUEUE\s+(?:\d+\/\d+|FULL)/i.test(c.meta)),
            dependencies:every(c=>c.dependency.length>0),
            readableMetadata:every(c=>c.metaFont>=9.5&&c.dependencyFont>=9.5),
            ...(kind==='production-full'?{queueFullLock:every(c=>c.queueFull&&c.ariaDisabled==='true'&&/QUEUE FULL/i.test(c.queueLock))}:{}),
          }:kind==='construction'?{
            cost:every(c=>/\d+(?:\.\d+)?\s*m\b/i.test(c.cost)&&/\d+(?:\.\d+)?\s*e\b/i.test(c.cost)),
            effectiveTime:every(c=>/\d+(?:\.\d+)?\s*s\b/i.test(c.meta)),
            footprint:every(c=>/\bFOOT\s+\d+\s*[×x]\s*\d+/i.test(c.meta)),
            reservedFootprint:every(c=>c.footprintPolicy==='reserved-max-tier'&&c.footprintMatches),
            dependencies:every(c=>c.dependency.length>0),
            effect:every(c=>c.effect.length>0),
            readableMetadata:every(c=>c.metaFont>=9.5&&c.dependencyFont>=9.5),
          }:{
            /* Grid/flex children are visually separated but textContent joins
               adjacent tags (for example MASSSTORED and 1200GROSS). These
               labels are unique inside the forecast panel, so test the label
               tokens without inventing whitespace the DOM does not contain. */
            stored:/STORED/i.test(text),gross:/GROSS/i.test(text),spend:/SPEND/i.test(text),net:/NET/i.test(text),forecast:/FORECAST/i.test(text),bottleneck:/BOTTLENECK/i.test(text),
            ...(kind==='economy-full'?{energyFull:/ENERGY STORAGE FULL/i.test(text),wasteForecast:/FULL\s*[·-]\s*INCOME WASTED/i.test(text)}:{}),
          };
          const missing=Object.entries(required).filter(([,ok])=>!ok).map(([field])=>field);
          return {selector,kind,present:!!panel,visible:visible(panel),rect:rect?{left:+rect.left.toFixed(2),top:+rect.top.toFixed(2),right:+rect.right.toFixed(2),bottom:+rect.bottom.toFixed(2),width:+rect.width.toFixed(2),height:+rect.height.toFixed(2)}:null,text,cards,targets,targetFailures,required,missing,obstructions,viewportOverflow,panelOverflow,status:!!panel&&visible(panel)&&cards.length+(economy?1:0)>0&&!missing.length&&!targetFailures.length&&!obstructions.length&&!viewportOverflow&&!panelOverflow?'PASS':'FAIL'};
        },{selector,kind});
        const inspectGlobalControls=async()=>page.evaluate(()=>{
          const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
          const selectors=['#topbar .res[data-econ]','#primaryRow .cbtn'];
          const targets=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(visible).map(el=>{const r=el.getBoundingClientRect();return {selector,id:el.id||null,width:+r.width.toFixed(2),height:+r.height.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2),status:r.width>=44&&r.height>=44&&r.left>=-1&&r.right<=innerWidth+1?'PASS':'FAIL'};}));
          const row=document.getElementById('primaryRow'),rr=row?.getBoundingClientRect();
          const rowOverflow=!!row&&(row.scrollWidth>row.clientWidth+1||(rr&&(rr.left<-1||rr.right>innerWidth+1)));
          const failures=targets.filter(t=>t.status!=='PASS');
          return {targets,failures,rowOverflow,viewport:{width:innerWidth,height:innerHeight},status:targets.length===8&&!failures.length&&!rowOverflow?'PASS':'FAIL'};
        });

        await page.evaluate(()=>{
          document.body.classList.remove('uiIntelOpen');document.body.classList.add('uiPrimaryOpen');
          const build=document.getElementById('buildMenu'),prod=document.getElementById('prodMenu'),card=document.getElementById('unitCard');
          if(build)build.style.display='none';if(card)card.style.display='none';if(prod)prod.style.display='block';
          prodTab='veh';renderProdMenu();renderQueue();
        });
        await page.waitForTimeout(100);
        rec.scenarios.production=await inspectPanel('#prodMenu','production');
        rec.scenarios.production.screenshot=await capture('production');
        rec.globalControls=await inspectGlobalControls();
        const productionQueueBefore=await page.evaluate(()=>blds[openBld]?.queue?.length??null);
        const unitInfo=page.locator('#prodGrid .bcard:not(.locked) .cardIntel').first();
        await unitInfo.focus();await page.keyboard.press('Enter');await page.waitForTimeout(60);
        const productionInfoAfter=await page.evaluate(()=>{const card=document.getElementById('unitCard'),close=card?.querySelector('.ucClose');return {queue:blds[openBld]?.queue?.length??null,intelVisible:!!card&&getComputedStyle(card).display!=='none',hasClose:!!close,activeClass:String(document.activeElement?.className||''),activeLabel:document.activeElement?.getAttribute?.('aria-label')||''};});
        const unitClose=page.locator('#unitCard .ucClose');if(productionInfoAfter.hasClose){await unitClose.focus();await page.keyboard.press('Enter');await page.waitForTimeout(40);}
        const unitClosed=await page.evaluate(()=>getComputedStyle(document.getElementById('unitCard')).display==='none');
        rec.productionKeyboard={queueBefore:productionQueueBefore,...productionInfoAfter,unitClosed,status:productionQueueBefore===productionInfoAfter.queue&&productionInfoAfter.intelVisible&&unitClosed?'PASS':'FAIL'};

        await page.evaluate(()=>{
          const B=blds[openBld];B.queue=Array.from({length:MF_PRODUCTION_QUEUE_CAP},()=>0);B.prodT=0;
          renderProdMenu();renderQueue();
        });
        await page.waitForTimeout(80);
        rec.scenarios.productionFull=await inspectPanel('#prodMenu','production-full');
        rec.scenarios.productionFull.screenshot=await capture('production-full');
        await page.evaluate(()=>{const B=blds[openBld];B.queue=[0,1];B.prodT=.7;renderProdMenu();renderQueue();});

        await page.evaluate(()=>{
          document.body.classList.remove('uiIntelOpen');document.body.classList.add('uiPrimaryOpen');
          const build=document.getElementById('buildMenu'),prod=document.getElementById('prodMenu'),card=document.getElementById('unitCard');
          if(prod)prod.style.display='none';if(card)card.style.display='none';if(build)build.style.display='block';
          bldTab='eco';renderBuildMenu();
        });
        await page.waitForTimeout(100);
        rec.scenarios.construction=await inspectPanel('#buildMenu','construction');
        rec.scenarios.construction.screenshot=await capture('construction');
        const placingBefore=await page.evaluate(()=>!!placing);
        const buildingInfo=page.locator('#buildGrid .bcard:not(.locked) .cardIntel').first();
        await buildingInfo.focus();await page.keyboard.press('Enter');await page.waitForTimeout(60);
        const buildingInfoAfter=await page.evaluate(()=>{const card=document.getElementById('unitCard'),close=card?.querySelector('.ucClose');return {placing:!!placing,intelVisible:!!card&&getComputedStyle(card).display!=='none',hasClose:!!close,activeClass:String(document.activeElement?.className||''),activeLabel:document.activeElement?.getAttribute?.('aria-label')||''};});
        const buildingClose=page.locator('#unitCard .ucClose');if(buildingInfoAfter.hasClose){await buildingClose.focus();await page.keyboard.press('Enter');await page.waitForTimeout(40);}
        const buildingClosed=await page.evaluate(()=>getComputedStyle(document.getElementById('unitCard')).display==='none');
        rec.constructionKeyboard={placingBefore,...buildingInfoAfter,buildingClosed,status:!placingBefore&&!buildingInfoAfter.placing&&buildingInfoAfter.intelVisible&&buildingClosed?'PASS':'FAIL'};

        const economyOpened=await page.evaluate(()=>{
          const build=document.getElementById('buildMenu'),prod=document.getElementById('prodMenu');if(build)build.style.display='none';if(prod)prod.style.display='none';
          document.body.classList.remove('uiPrimaryOpen');document.body.classList.add('uiIntelOpen');
          if(typeof showEconomyIntel==='function'){showEconomyIntel();return 'showEconomyIntel';}
          if(typeof openEconomyIntel==='function'){openEconomyIntel();return 'openEconomyIntel';}
          const trigger=document.getElementById('massRes')||document.querySelector('#topbar .res');
          if(trigger){trigger.click();return trigger.id||'topbar-resource';}
          return null;
        });
        rec.economyOpenedBy=economyOpened;
        await page.waitForTimeout(150);
        rec.scenarios.economy=await inspectPanel('#economyIntel','economy');
        rec.scenarios.economy.screenshot=await capture('economy');

        await page.evaluate(()=>{
          resE[0]=RES_ECAP[0];eRate=200;eSpend=20;stallM=0;stallE=0;showEconomyIntel();
        });
        await page.waitForTimeout(60);
        rec.scenarios.economyFull=await inspectPanel('#economyIntel','economy-full');
        rec.scenarios.economyFull.screenshot=await capture('economy-full');

        rec.webgl=await page.evaluate(()=>({contextLosses:window.__mfStage7Gl?.contextLosses??null,mainContextLost:typeof gl!=='undefined'&&gl?.isContextLost?gl.isContextLost():null,mainError:typeof gl!=='undefined'&&gl?.getError?gl.getError():null}));
        const scenarioFailures=Object.entries(rec.scenarios).filter(([,value])=>value.status!=='PASS'||!value.screenshot?.valid).map(([name,value])=>`${name}: ${value.missing?.join(',')||value.status}`);
        if(!runtime.footprintContract)scenarioFailures.push(`footprint contract mismatch: quote=${JSON.stringify(runtime.footprintQuote)} reserved=${JSON.stringify(runtime.footprintReserved)} placement=${JSON.stringify(runtime.footprintPlacement)}`);
        if(rec.globalControls.status!=='PASS')scenarioFailures.push(`global controls: ${JSON.stringify(rec.globalControls)}`);
        if(rec.productionKeyboard.status!=='PASS')scenarioFailures.push(`production keyboard isolation: ${JSON.stringify(rec.productionKeyboard)}`);
        if(rec.constructionKeyboard.status!=='PASS')scenarioFailures.push(`construction keyboard isolation: ${JSON.stringify(rec.constructionKeyboard)}`);
        if(rec.webgl.contextLosses!==0||rec.webgl.mainContextLost===true||![null,0].includes(rec.webgl.mainError))scenarioFailures.push(`WebGL: ${JSON.stringify(rec.webgl)}`);
        if(pageErrors.length)scenarioFailures.push(`page errors: ${pageErrors.join(' | ')}`);
        if(consoleErrors.length)scenarioFailures.push(`console errors: ${consoleErrors.join(' | ')}`);
        if(requestFailures.length)scenarioFailures.push(`request failures: ${JSON.stringify(requestFailures)}`);
        rec.failures=scenarioFailures;
        rec.status=scenarioFailures.length?'FAIL':'PASS';
      }catch(error){rec.failures=[String(error?.stack||error)];rec.status='FAIL';}
      if(rec.status!=='PASS')blockers.push(...rec.failures.map(f=>`${profile.id}: ${f}`));
      profiles.push(rec);
      await context.close();
    }
    await assertPwBrowserOwnership(browser);
  }catch(error){blockers.push(String(error?.stack||error));}
  finally{
    if(browser){try{await closePwBrowser(browser);}catch(error){blockers.push(`browser cleanup: ${error.message||error}`);}}
    await new Promise(resolveClose=>server.close(resolveClose));
  }
  const identityAfter=await identitySnapshot();
  const identityStable=identityBefore.head===identityAfter.head&&identityBefore.dirtyFingerprint===identityAfter.dirtyFingerprint&&SOURCE_FILES.every(rel=>identityBefore.files[rel]===identityAfter.files[rel]);
  if(!identityStable)blockers.push('source identity changed during capture; evidence rejected');
  const accepted=profiles.filter(p=>p.status==='PASS').length;
  const report={
    schema:'MassfrontStage7ProductionUiEvidenceV1',generatedAt:iso(),startedAt,sourceMode:'current-source',url,
    identity:{before:identityBefore,after:identityAfter,stable:identityStable},browser:browserIdentity?{...browserIdentity,gpu:pwBrowserEvidence(browser)?.gpu||browserIdentity.gpu||null}:null,
    profiles,summary:{requested:PROFILES.length,accepted,rejected:PROFILES.length-accepted,blockerCount:blockers.length},blockers,
    status:identityStable&&accepted===PROFILES.length&&!blockers.length?'PASS':'FAIL',
  };
  await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,summary:report.summary,head:identityBefore.head,dirtyFingerprint:identityBefore.dirtyFingerprint,report:REPORT,screenshots:profiles.flatMap(p=>Object.values(p.scenarios).map(s=>s.screenshot?.path).filter(Boolean)),blockers},null,2));
  if(report.status!=='PASS')process.exitCode=2;
}

main().catch(async error=>{
  const failure={schema:'MassfrontStage7ProductionUiEvidenceV1',generatedAt:iso(),status:'FAIL',summary:{requested:PROFILES.length,accepted:0,rejected:PROFILES.length,blockerCount:1},blockers:[String(error?.stack||error)]};
  try{await mkdir(OUT,{recursive:true});await writeFile(REPORT,JSON.stringify(failure,null,2)+'\n');}catch{}
  console.error('STAGE7_PRODUCTION_UI_PROBE_FAILED: '+(error?.stack||error));process.exit(1);
});
