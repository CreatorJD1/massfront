#!/usr/bin/env node
/* Stage 9 exact-location visual evidence.

   Captures tactical and close hardware-GPU views of representative authored
   geometry on every FULL_V1 map. This is a visual review producer, not an
   approval shortcut: the machine gate proves the exact planner/runtime path,
   screenshot integrity and error-free WebGL execution; a human still judges
   the images.

     node tools/capture-stage9-location-visuals.mjs

   Output:
     tmp/stage9-location-visuals/report.json
     tmp/stage9-location-visuals/*.png
*/
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPwBrowserOwnership,
  closePwBrowser,
  launchPwBrowser,
  pwBrowserEvidence,
  recordPwBrowserGpu
} from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { installOfflineNetworkIsolation } from './offline-network-isolation.mjs';
import { inspectNonblankPng } from './perf-lab/png-capture-verifier.mjs';
import { collectSourceIdentity, startStaticServer } from './perf-lab/perf-probe-runner.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const OUT=join(ROOT,'tmp','stage9-location-visuals');
const REPORT_PATH=join(OUT,'report.json');
const VIEWPORT={width:1440,height:900,dpr:1};
const PRESET='high';
const QUERY='?stage9locationvisuals=1';
const SCOPED_PATHS=[
  'index.html','boot.js','assets/data/manifest.json',
  'assets/data/sitetemplates.js','assets/data/locationgrammar.js',
  'assets/data/sitetemplates-stage9.js','assets/data/locationplans.js',
  'src/engine/gl.js','src/engine/worldsites.js','src/game/sim.js','src/main.js','src/session.js',
  'tools/capture-stage9-location-visuals.mjs','tools/pw-browser.mjs','tools/chrome-gpu.mjs',
  'tools/offline-network-isolation.mjs','tools/perf-lab/perf-probe-runner.mjs',
  'tools/perf-lab/png-capture-verifier.mjs','tools/evidence-foundation/png-evidence.mjs'
].sort();
const CASES=[
  {map:'pyraeth_caldera_medium',preferred:'city_pyraeth_caldera_crucible_v1',
    expected:{city:2},templates:['city_pyraeth_caldera_crucible_v1','city_pyraeth_caldera_crucible_v1']},
  {map:'nordhall_frost_medium',preferred:'outpost_nordhall_frost_fault_gate_v1',
    expected:{outpost:1,relic:1},templates:['outpost_nordhall_frost_fault_gate_v1','relic_nordhall_frost_thermal_well_v1']},
  {map:'pyraeth_flats_medium',preferred:'spaceport_pyraeth_flats_blackwind_v1',
    expected:{spaceport:2,derelict:1},templates:['spaceport_pyraeth_flats_blackwind_v1','spaceport_pyraeth_flats_blackwind_v1','derelict_pyraeth_flats_buried_logistics_v1']},
  {map:'aelos_basin_medium',preferred:'colony_aelos_basin_canal_v1',
    expected:{colony:2,refinery:2},templates:['colony_aelos_basin_canal_v1','colony_aelos_basin_canal_v1','refinery_aelos_basin_quay_v1','refinery_aelos_basin_quay_v1']},
  {map:'aelos_coast_medium',preferred:'base_aelos_coast_admiralty_v1',
    expected:{base:2},templates:['base_aelos_coast_admiralty_v1','base_aelos_coast_admiralty_v1']},
  {map:'vespera_refinery_medium',preferred:'brood_vespera_refinery_matrix_core_v1',
    expected:{ruin:1,brood:2},templates:['ruin_vespera_refinery_megaforge_v1','brood_vespera_refinery_matrix_core_v1','brood_vespera_refinery_matrix_core_v1']}
];
const VIEWS=[
  {id:'tactical',span:r=>Math.max(680,Math.min(1120,r*3.15))},
  {id:'close',span:r=>Math.max(340,Math.min(620,r*1.7))}
];

if(process.argv.includes('--help')||process.argv.includes('-h')){
  console.log('Usage: node tools/capture-stage9-location-visuals.mjs');
  process.exit(0);
}
if(process.argv.length>2)throw new Error('This capture takes no arguments');

async function collectScopedIdentity(){
  const aggregate=createHash('sha256'),files=[];
  for(const path of SCOPED_PATHS){
    const bytes=await readFile(join(ROOT,path)),sha256=createHash('sha256').update(bytes).digest('hex');
    files.push({path,bytes:bytes.length,sha256});
    aggregate.update(`path\0${path}\0`);aggregate.update(bytes);aggregate.update('\0');
  }
  return {algorithm:'sha256',fingerprint:aggregate.digest('hex'),files};
}
function sameIdentity(a,b,scopedA,scopedB){
  return !!a&&!!b&&!!scopedA&&!!scopedB&&a.gitHead===b.gitHead&&
    a.runtimeFingerprint===b.runtimeFingerprint&&a.testedEntrySha256===b.testedEntrySha256&&
    a.testedPackageSha256===b.testedPackageSha256&&scopedA.fingerprint===scopedB.fingerprint;
}
function safeName(value){return String(value).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();}
function compactError(error){return String(error&&error.stack||error);}
function readinessError(label,value){return new Error(label+': '+JSON.stringify(value));}

async function waitForMapReadiness(page,expected){
  await page.waitForFunction(E=>{
    const visible=id=>{
      const el=document.getElementById(id);if(!el)return false;
      const css=getComputedStyle(el),r=el.getBoundingClientRect();
      return css.display!=='none'&&css.visibility!=='hidden'&&+css.opacity!==0&&r.width>0&&r.height>0;
    };
    const frontIds=[...(typeof FRONT_SCREEN_IDS!=='undefined'?FRONT_SCREEN_IDS:[]),
      'mfPreAlphaIntro','mfBootCover','apOverlay','loadScr','pauseOverlay','gameOver','levelUp','dispatch'];
    const frontsHidden=frontIds.every(id=>{
      const el=document.getElementById(id);return !el||el.getClientRects().length===0||
        getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden';
    });
    const surface=mfTerrainSurfaceSelection(),slot=mfTerrainLocationProfile().metal?'metal':'pave';
    return bootConfirmed===true&&typeof mfFlowLayout==='function'&&
      typeof window.__MF_GALACTIC_BRIDGE==='object'&&curMap===E.map&&builtMap===E.map&&
      curTheme===E.theme&&builtTheme===E.theme&&mfWorldTopologyKey()===E.topology&&builtTopology===E.topology&&
      running===true&&paused===true&&matchLive===true&&attractOn===false&&
      !document.body.classList.contains('menuMode')&&!document.body.classList.contains('mfMenuOpen')&&
      !document.body.dataset.frontScreen&&frontsHidden&&
      visible('topbar')&&visible('goalBar')&&visible('minimapWrap')&&
      terrTexThemePending===null&&terrTexSlotPending===null&&terrTexThemeLoaded===surface.key&&
      terrTexSlotLoaded===slot&&mfTerrainMaterialsReady();
  },expected,{timeout:180000});
  return page.evaluate(E=>{
    const visible=id=>{
      const el=document.getElementById(id);if(!el)return false;
      const css=getComputedStyle(el),r=el.getBoundingClientRect();
      return css.display!=='none'&&css.visibility!=='hidden'&&+css.opacity!==0&&r.width>0&&r.height>0;
    };
    const frontIds=[...(typeof FRONT_SCREEN_IDS!=='undefined'?FRONT_SCREEN_IDS:[]),
      'mfPreAlphaIntro','mfBootCover','apOverlay','loadScr','pauseOverlay','gameOver','levelUp','dispatch'];
    const visibleFronts=frontIds.filter(id=>{
      const el=document.getElementById(id);return el&&el.getClientRects().length>0&&
        getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
    });
    const surface=mfTerrainSurfaceSelection(),slot=mfTerrainLocationProfile().metal?'metal':'pave';
    return {passed:true,lastT,map:curMap,builtMap,theme:curTheme,builtTheme,
      topology:mfWorldTopologyKey(),builtTopology,
      runtime:{running,paused,matchLive,attractOn,bootConfirmed},
      material:{ready:mfTerrainMaterialsReady(),pendingTheme:terrTexThemePending,pendingSlot:terrTexSlotPending,
        loadedTheme:terrTexThemeLoaded,loadedSlot:terrTexSlotLoaded,wantedTheme:surface.key,wantedSlot:slot},
      ui:{menuMode:document.body.classList.contains('menuMode'),menuOpen:document.body.classList.contains('mfMenuOpen'),
        frontScreen:document.body.dataset.frontScreen||'',visibleFronts,
        visibleHud:['topbar','goalBar','minimapWrap'].filter(visible)},expected:E};
  },expected);
}

async function settleCaptureView(page,expected){
  const evidence=await page.evaluate(async E=>{
    const near=(a,b)=>Math.abs(a-b)<=0.05;
    const visible=id=>{
      const el=document.getElementById(id);if(!el)return false;
      const css=getComputedStyle(el),r=el.getBoundingClientRect();
      return css.display!=='none'&&css.visibility!=='hidden'&&+css.opacity!==0&&r.width>0&&r.height>0;
    };
    const frontIds=[...(typeof FRONT_SCREEN_IDS!=='undefined'?FRONT_SCREEN_IDS:[]),
      'mfPreAlphaIntro','mfBootCover','apOverlay','loadScr','pauseOverlay','gameOver','levelUp','dispatch'];
    const sample=()=>{
      const surface=mfTerrainSurfaceSelection(),slot=mfTerrainLocationProfile().metal?'metal':'pave';
      const visibleFronts=frontIds.filter(id=>{
        const el=document.getElementById(id);return el&&el.getClientRects().length>0&&
          getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
      });
      return {lastT,map:curMap,builtMap,theme:curTheme,builtTheme,
        topology:mfWorldTopologyKey(),builtTopology,running,paused,matchLive,attractOn,
        camera:{x:cam.x,y:cam.y,yaw:camYaw,pitch:camPitch,span:orthoSpan,
          yawTarget,pitchTarget,spanTarget:distTarget,follow:camFollow},
        material:{ready:mfTerrainMaterialsReady(),pendingTheme:terrTexThemePending,pendingSlot:terrTexSlotPending,
          loadedTheme:terrTexThemeLoaded,loadedSlot:terrTexSlotLoaded,wantedTheme:surface.key,wantedSlot:slot},
        ui:{menuMode:document.body.classList.contains('menuMode'),menuOpen:document.body.classList.contains('mfMenuOpen'),
          frontScreen:document.body.dataset.frontScreen||'',visibleFronts,
          visibleHud:['topbar','goalBar','minimapWrap'].filter(visible)}};
    };
    const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const before=sample();await nextFrame();const first=sample();await nextFrame();const second=sample();
    const cameraReady=S=>near(S.camera.x,E.frame.x)&&near(S.camera.y,E.frame.y)&&
      near(S.camera.yaw,E.frame.yaw)&&near(S.camera.pitch,E.frame.pitch)&&near(S.camera.span,E.frame.span)&&
      near(S.camera.yawTarget,E.frame.yaw)&&near(S.camera.pitchTarget,E.frame.pitch)&&
      near(S.camera.spanTarget,E.frame.span)&&S.camera.follow===-1;
    const runtimeReady=S=>S.map===E.map&&S.builtMap===E.map&&S.theme===E.theme&&S.builtTheme===E.theme&&
      S.topology===E.topology&&S.builtTopology===E.topology&&S.running&&S.paused&&S.matchLive&&!S.attractOn;
    const materialReady=S=>S.material.ready&&S.material.pendingTheme===null&&S.material.pendingSlot===null&&
      S.material.loadedTheme===S.material.wantedTheme&&S.material.loadedSlot===S.material.wantedSlot;
    const uiReady=S=>!S.ui.menuMode&&!S.ui.menuOpen&&!S.ui.frontScreen&&!S.ui.visibleFronts.length&&
      S.ui.visibleHud.length===3;
    const checks={framesAdvanced:first.lastT>before.lastT&&second.lastT>first.lastT,
      firstRuntime:runtimeReady(first),secondRuntime:runtimeReady(second),
      firstCamera:cameraReady(first),secondCamera:cameraReady(second),
      firstMaterial:materialReady(first),secondMaterial:materialReady(second),
      firstUi:uiReady(first),secondUi:uiReady(second)};
    if(!Object.values(checks).every(Boolean))return {passed:false,checks,before,first,second,expected:E,glErrors:[]};
    gl.finish();
    const glErrors=[];for(let i=0;i<16;i++){const code=gl.getError();if(!code)break;glErrors.push(code);}
    return {passed:glErrors.length===0,checks,before,first,second,expected:E,glErrors};
  },expected);
  if(!evidence.passed)throw readinessError('Stage 9 capture readiness failed',evidence);
  return evidence;
}

await mkdir(OUT,{recursive:true});
const startedAt=new Date().toISOString();
const sourceBefore=await collectSourceIdentity();
const scopedBefore=await collectScopedIdentity();
const report={
  schema:'MassfrontStage9LocationVisualsV1',startedAt,finishedAt:null,
  machineStatus:'RUNNING',visualReview:'PENDING_HUMAN_REVIEW',
  outputDirectory:OUT,reportPath:REPORT_PATH,
  viewport:VIEWPORT,graphicsPreset:PRESET,queryFlags:QUERY,
  /* sourceBefore/sourceAfter retain the whole-checkout worktree fingerprint
     for provenance. Parallel Blender art dirt is outside the stability gate;
     the explicit scope below protects every runtime/tool input this capture
     actually executes. */
  sourceBefore,sourceAfter:null,scopedBefore,scopedAfter:null,sourceStable:false,
  server:null,gpu:null,browser:null,browserCleanup:null,offline:null,boot:null,
  maps:[],captures:[],errors:{fatal:null,page:[],console:[],requests:[],responses:[]},
  assertions:{sixMaps:false,twelveCaptures:false,allFullV1:false,allStampOk:false,
    allGeometryFramed:false,allRuntimeReady:false,allImagesValid:false,noRuntimeErrors:false,sourceStable:false}
};
let server=null,browser=null,page=null,offlineGuard=null,activeMap='boot',failure=null;
try{
  server=await startStaticServer();
  report.server={url:server.url,entry:new URL(QUERY,server.url).href,port:Number(new URL(server.url).port)};
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,args:['--mute-audio']});
  await assertPwBrowserOwnership(browser);
  page=await browser.newPage({
    viewport:{width:VIEWPORT.width,height:VIEWPORT.height},deviceScaleFactor:VIEWPORT.dpr,
    colorScheme:'dark'
  });
  page.setDefaultTimeout(180000);
  page.on('pageerror',error=>report.errors.page.push({map:activeMap,error:compactError(error)}));
  page.on('console',message=>{
    if(message.type()==='error')report.errors.console.push({map:activeMap,text:message.text(),location:message.location()});
  });
  page.on('requestfailed',request=>report.errors.requests.push({map:activeMap,url:request.url(),failure:request.failure()}));
  page.on('response',response=>{
    if(response.status()>=400)report.errors.responses.push({map:activeMap,url:response.url(),status:response.status()});
  });
  offlineGuard=await installOfflineNetworkIsolation(page);
  await page.addInitScript(()=>{
    try{
      localStorage.setItem('mf_offline','1');
      localStorage.setItem('massfront_offline','1');
      localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_ap_gate_closed','1');
      localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_prealpha_cinematic_v2','stage9-visual-seen');
      localStorage.removeItem('mf_dropped_session_v1');
    }catch{}
  });
  await page.goto(report.server.entry,{waitUntil:'domcontentloaded',timeout:120000});
  await page.addStyleTag({content:'#mfPreAlphaIntro,#mfBootCover,#apOverlay,#loadScr,#pauseOverlay,#gameOver,#levelUp,#dispatch{display:none!important}'});
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof applyTheme==='function'&&
    typeof syncBattlefieldFromMap==='function'&&typeof SITE_STAMP==='object'&&
    typeof mfWorldTopologyKey==='function'&&typeof gl!=='undefined'&&!!gl,null,{timeout:120000});
  /* Exported functions exist while async boot is still waiting on atlas decode.
     Mutating the first map in that window lets boot's later setupAttract replace
     it. The first real frame plus a sentinel from the final manifest script
     prove both halves of startup have finished before this harness takes over. */
  await page.waitForFunction(()=>typeof bootConfirmed!=='undefined'&&bootConfirmed===true&&
    typeof mfFlowLayout==='function'&&typeof window.__MF_GALACTIC_BRIDGE==='object',null,{timeout:180000});
  report.gpu=await assertHardwareGpu(page);
  recordPwBrowserGpu(browser,report.gpu);

  const boot=await page.evaluate(()=>{
    if(typeof siteStampInstall==='function')siteStampInstall();
    const errors=[];for(let i=0;i<16;i++){const code=gl.getError();if(!code)break;errors.push(code);}
    return {confirmed:bootConfirmed===true,flowReady:typeof mfFlowLayout==='function',
      lateSentinel:typeof window.__MF_GALACTIC_BRIDGE==='object',stampVersion:SITE_STAMP.ver|0,
      stampWrapped:!!(planDistricts&&planDistricts.__mfSiteStampWrap),glErrors:errors};
  });
  report.boot=boot;
  if(!boot.confirmed||!boot.flowReady||!boot.lateSentinel||boot.stampVersion!==4||!boot.stampWrapped||boot.glErrors.length)
    throw new Error('Stage 9 boot gate failed: '+JSON.stringify(boot));

  for(let index=0;index<CASES.length;index++){
    const C=CASES[index];activeMap=C.map;
    const errorStart={page:report.errors.page.length,console:report.errors.console.length,
      requests:report.errors.requests.length,responses:report.errors.responses.length};
    const state=await page.evaluate(({map,preferred,preset})=>{
      SITE_TPL_FORCE=null;if(typeof SITE_TPL_QUERY==='object')SITE_TPL_QUERY.force=null;
      META.settings.quality=preset;META.settings.fog=false;
      if(typeof applyQualityPreset==='function')applyQualityPreset();
      const synced=syncBattlefieldFromMap(map);
      if(!synced){
        const D=MAPDEFS[map];if(!D)throw new Error('Unknown Stage 9 map '+map);
        curMap=map;if(D.theme)curTheme=D.theme;if(D.region)curRegionId=D.region;
        if(D.size&&typeof battlefieldPresetKey==='function')battlefieldPreset=battlefieldPresetKey(D.size);
      }
      builtMap='';builtTheme='';builtTopology='';mmDirty=true;
      difficulty=0;wcChoice=0;infestationOn=false;
      try{hideFrontScreens();}catch{}
      for(const id of ['mfPreAlphaIntro','mfBootCover','apOverlay','loadScr','pauseOverlay','gameOver','levelUp','dispatch']){
        const element=document.getElementById(id);if(element)element.style.setProperty('display','none','important');
      }
      applyTheme();newSkirmish();
      demoMode=false;running=true;matchLive=true;paused=true;gameEnded=false;fogOn=false;
      if(typeof carrier==='object'&&carrier){carrier.active=false;carrier.phase=2;}
      if(typeof camFollow!=='undefined')camFollow=-1;
      /* Sites are intentionally captured without fog concealment. Fog behavior
         has its own gate; this artifact is for judging authored geometry. */
      window.fogPointVisible=()=>true;
      document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
      if(typeof mfFlowLayout==='function')mfFlowLayout();
      const stamp=JSON.parse(JSON.stringify(SITE_STAMP));
      const stampZone=(stamp.zones||[]).find(Z=>Z.template===preferred)||(stamp.zones||[])[0];
      if(!stampZone)throw new Error('No realized Stage 9 site on '+map);
      const zone=cityZones.find(Z=>Z.siteId===stampZone.siteId)||cityZones[stampZone.i];
      if(!zone)throw new Error('Representative site has no live zone on '+map);
      const plannedIds=(stampZone.plots||[]).map(P=>P.id).filter(Boolean);
      const liveIds=relics.filter(R=>R&&R.zone===stampZone.i).map(R=>R.id).filter(Boolean);
      const propIds=[];
      for(const list of [tanks,crates,rocks,trees])for(const item of list)if(item&&item.id&&item.id.startsWith(stampZone.siteId+'/'))propIds.push(item.id);
      const glErrors=[];for(let i=0;i<16;i++){const code=gl.getError();if(!code)break;glErrors.push(code);}
      return {
        synced,map:curMap,theme:curTheme,quality:META.settings.quality,topologyKey:mfWorldTopologyKey(),
        stamp,representative:{index:stampZone.i,siteId:stampZone.siteId,siteClass:stampZone.site,
          template:stampZone.template,name:stampZone.name,x:zone.x,y:zone.y,r:zone.r,
          plannedPlotIds:plannedIds,livePlotIds:liveIds,propIds},glErrors
      };
    },{map:C.map,preferred:C.preferred,preset:PRESET});
    const setupReadiness=await waitForMapReadiness(page,{map:C.map,theme:state.theme,topology:state.topologyKey});
    /* newSkirmish announces the carrier drop for players. This producer is
       specifically for judging site geometry, so wait for the real notice
       lifetime instead of hiding it with capture-only CSS. */
    await page.waitForFunction(()=>{
      const element=document.getElementById('toast');
      return !element||Number(getComputedStyle(element).opacity)<=0.01;
    },null,{timeout:10_000});
    const realized=state.stamp.realized||{},requested=state.stamp.requested||{};
    const classKeys=['city','colony','outpost','base','refinery','relic','ruin','spaceport','derelict','brood'];
    const expectedCounts=classKeys.every(key=>(requested[key]|0)===(C.expected[key]||0)&&(realized[key]|0)===(C.expected[key]||0));
    const templates=(state.stamp.zones||[]).map(Z=>Z.template);
    const planned=state.representative.plannedPlotIds.slice().sort();
    const live=state.representative.livePlotIds.slice().sort();
    const row={
      map:C.map,theme:state.theme,quality:state.quality,topologyKey:state.topologyKey,
      planHash:state.stamp.plan&&state.stamp.plan.planHash||'',realizationHash:state.stamp.realizationHash||'',
      requested,realized,templates,representative:state.representative,readiness:{setup:setupReadiness,views:[]},
      views:[],glErrors:state.glErrors,
      runtimeErrors:null,assertions:{
        exactMap:state.map===C.map,stampOk:state.stamp.ok===true&&(state.stamp.fails||[]).length===0,
        fullV1:state.stamp.plan&&state.stamp.plan.status==='FULL_V1',
        expectedCounts,templateOrder:JSON.stringify(templates)===JSON.stringify(C.templates),
        representativeTemplate:state.representative.template===C.preferred,
        stableSiteId:typeof state.representative.siteId==='string'&&!!state.representative.siteId,
        liveGeometry:planned.length>0&&JSON.stringify(planned)===JSON.stringify(live),setupReady:setupReadiness.passed===true,
        supportingProps:state.representative.propIds.length>0,noSetupGlErrors:state.glErrors.length===0
      }
    };
    for(const view of VIEWS){
      const span=+view.span(state.representative.r||200).toFixed(2);
      const frame=await page.evaluate(({x,y,span})=>{
        camFollow=-1;cam.x=x;cam.y=y;camYaw=yawTarget=.69;camPitch=pitchTarget=1.13;
        orthoSpan=distTarget=span;if(typeof clampCam==='function')clampCam();
        if(typeof camUpdateMatrices==='function')camUpdateMatrices();
        return {x:cam.x,y:cam.y,yaw:camYaw,pitch:camPitch,span:orthoSpan};
      },{x:state.representative.x,y:state.representative.y,span});
      const readiness=await settleCaptureView(page,{map:C.map,theme:state.theme,topology:state.topologyKey,frame});
      const file=`${String(index+1).padStart(2,'0')}-${safeName(C.map)}-${view.id}.png`;
      const path=join(OUT,file);
      await page.screenshot({path,fullPage:false});
      const image=await inspectNonblankPng(path);
      const capture={map:C.map,view:view.id,file,path,frame,readiness,image,
        valid:image.width===VIEWPORT.width*VIEWPORT.dpr&&image.height===VIEWPORT.height*VIEWPORT.dpr&&image.nonblank};
      row.views.push(capture);row.readiness.views.push(readiness);report.captures.push(capture);
    }
    const renderGlErrors=await page.evaluate(()=>{
      const errors=[];for(let i=0;i<16;i++){const code=gl.getError();if(!code)break;errors.push(code);}return errors;
    });
    row.renderGlErrors=renderGlErrors;
    row.assertions.noRenderGlErrors=renderGlErrors.length===0;
    row.assertions.captureReadiness=row.readiness.views.length===VIEWS.length&&row.readiness.views.every(V=>V.passed);
    row.assertions.imagesValid=row.views.length===2&&row.views.every(V=>V.valid);
    row.runtimeErrors={
      page:report.errors.page.slice(errorStart.page),console:report.errors.console.slice(errorStart.console),
      requests:report.errors.requests.slice(errorStart.requests),responses:report.errors.responses.slice(errorStart.responses)
    };
    row.assertions.noRuntimeErrors=Object.values(row.runtimeErrors).every(list=>list.length===0);
    report.maps.push(row);
  }
  activeMap='finalize';
  report.sourceAfter=await collectSourceIdentity();
  report.scopedAfter=await collectScopedIdentity();
  report.sourceStable=sameIdentity(sourceBefore,report.sourceAfter,scopedBefore,report.scopedAfter);
  await assertPwBrowserOwnership(browser);
  report.browser=pwBrowserEvidence(browser);
  report.assertions.sixMaps=report.maps.length===CASES.length;
  report.assertions.twelveCaptures=report.captures.length===CASES.length*VIEWS.length;
  report.assertions.allFullV1=report.maps.every(M=>M.assertions.fullV1&&M.assertions.expectedCounts&&M.assertions.templateOrder);
  report.assertions.allStampOk=report.maps.every(M=>M.assertions.exactMap&&M.assertions.stampOk);
  report.assertions.allGeometryFramed=report.maps.every(M=>M.assertions.representativeTemplate&&M.assertions.stableSiteId&&
    M.assertions.liveGeometry&&M.assertions.supportingProps);
  report.assertions.allRuntimeReady=report.maps.every(M=>M.assertions.setupReady&&M.assertions.captureReadiness);
  report.assertions.allImagesValid=report.maps.every(M=>M.assertions.imagesValid);
  report.assertions.noRuntimeErrors=report.maps.every(M=>M.assertions.noSetupGlErrors&&M.assertions.noRenderGlErrors&&M.assertions.noRuntimeErrors)&&
    !report.errors.page.length&&!report.errors.console.length&&!report.errors.requests.length&&!report.errors.responses.length;
  report.assertions.sourceStable=report.sourceStable;
  if(!Object.values(report.assertions).every(Boolean))throw new Error('Stage 9 location visual machine gate failed');
}catch(error){
  failure=error;report.errors.fatal=compactError(error);
}finally{
  if(offlineGuard){
    try{report.offline=await offlineGuard.finalize('Stage 9 exact-location visual capture');}
    catch(error){if(!failure)failure=error;report.errors.fatal=report.errors.fatal||compactError(error);report.offline=offlineGuard.snapshot();}
  }else if(page&&!page.isClosed()){
    try{await page.close();}catch{}
  }
  if(browser){
    try{report.browserCleanup=await closePwBrowser(browser);}
    catch(error){if(!failure)failure=error;report.errors.fatal=report.errors.fatal||compactError(error);}
  }
  if(server)try{await server.close();}catch(error){if(!failure)failure=error;report.errors.fatal=report.errors.fatal||compactError(error);}
  report.finishedAt=new Date().toISOString();
  report.machineStatus=failure?'FAIL':'PASS';
  await writeFile(REPORT_PATH,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({machineStatus:report.machineStatus,visualReview:report.visualReview,
    report:REPORT_PATH,captures:report.captures.length,gpu:report.gpu,assertions:report.assertions,
    fatal:report.errors.fatal},null,2));
}
if(failure){console.error(compactError(failure));process.exitCode=1;}
