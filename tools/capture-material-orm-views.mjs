#!/usr/bin/env node
/* Capture the live building-material ORM channels on the authored Vespera
   refinery battlefield. This is a real newSkirmish path on an owned ANGLE
   D3D11 browser; MFVisualDebug only changes how the resulting frame is shown. */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {
  collectRuntimeFingerprint,
  collectSourceFingerprint
} from './evidence-foundation/fingerprints.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const tmpRoot=resolve(root,'.tmp');
const rawName=process.argv[2]||'material-orm-views';
if(process.argv.length>3||isAbsolute(rawName))throw new Error('Usage: node tools/capture-material-orm-views.mjs [.tmp/name]');
const outName=rawName.replace(/\\/g,'/').replace(/^\.tmp\//,'');
if(!outName||outName.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Output name must stay below .tmp');
const outDir=resolve(tmpRoot,outName), outRel=relative(tmpRoot,outDir);
if(!outRel||outRel.startsWith('..'+sep)||isAbsolute(outRel))throw new Error('Output name must stay below .tmp');

const files=['ordinary.png','gloss.png','metalness.png','emissive.png','report.json'];
await mkdir(outDir,{recursive:true});
const existing=await readdir(outDir,{withFileTypes:true});
const unexpected=existing.filter(entry=>!files.includes(entry.name)||!entry.isFile());
if(unexpected.length)throw new Error('Refusing to overwrite non-capture output: '+unexpected.map(entry=>entry.name).join(', '));
for(const name of files)await unlink(join(outDir,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});

const MIME={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4',
  '.mp3':'audio/mpeg','.wav':'audio/wav','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.webmanifest':'application/manifest+json','.wasm':'application/wasm','.ktx2':'image/ktx2'
};
const server=createServer(async(req,res)=>{
  try{
    let pathname=decodeURIComponent(new URL(req.url||'/','http://127.0.0.1').pathname);
    if(pathname==='/')pathname='/index.html';
    const file=resolve(root,pathname.replace(/^\/+/,'')), rel=relative(root,file);
    if(!rel||rel.startsWith('..'+sep)||isAbsolute(rel)||!existsSync(file)||(await stat(file)).isFile()===false){
      res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('not found');return;
    }
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  }catch{
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('not found');
  }
});

const sourceView=source=>({
  head:source.gitHead,dirty:source.gitDirty,dirtyFingerprint:source.dirtyFingerprint,
  changedPathCount:source.changedPaths.length
});
const runtimeView=runtime=>({fingerprint:runtime.runtimeFingerprint,fileCount:runtime.files.length});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const started=Date.now(), query='';
const [sourceBeforeRaw,runtimeBeforeRaw]=await Promise.all([
  collectSourceFingerprint(root),collectRuntimeFingerprint(root)
]);
const report={
  schema:'MassfrontMaterialOrmViewsV1',status:'UNKNOWN',startedAt:new Date(started).toISOString(),completedAt:null,captureTimeMs:null,
  outputDirectory:'.tmp/'+outName,url:null,query,
  server:{host:'127.0.0.1',port:null},
  browser:{name:'chromium',version:null,headless:true,ownershipMode:'isolated',graphicsApi:'ANGLE',backend:'D3D11'},
  gpu:null,
  viewport:{requested:{width:412,height:915,dpr:2,mobile:true,touch:true},actual:null},
  settings:{requested:{map:'vespera_refinery_large',mode:'standard',quality:'cinematic',fog:false,cameraSpan:700},runtime:null},
  fingerprints:{
    source:{before:sourceView(sourceBeforeRaw),after:null,stable:false},
    runtime:{before:runtimeView(runtimeBeforeRaw),after:null,stable:false}
  },
  captures:[],
  errors:{page:[],console:[],request:[],contextLoss:[],capture:[]},
  assertions:null
};

let browser=null,page=null,serverOpen=false;
try{
  await new Promise((accept,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.off('error',reject);accept();});
  });
  serverOpen=true;
  report.server.port=server.address().port;
  report.url=`http://127.0.0.1:${report.server.port}/${query}`;
  browser=await launchPwBrowser({
    ownershipMode:'isolated',headless:true,
    args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']
  });
  report.browser.version=typeof browser.version==='function'?browser.version():null;
  page=await browser.newPage({
    viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark',
    userAgent:'Mozilla/5.0 (Linux; Android 15; MASSFRONT ORM QA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Mobile Safari/537.36'
  });
  page.on('pageerror',error=>report.errors.page.push({message:error.message,stack:error.stack||null}));
  page.on('crash',()=>report.errors.page.push({message:'page crashed',stack:null}));
  page.on('console',message=>{
    if(message.type()==='error')report.errors.console.push({message:message.text(),location:message.location()});
  });
  page.on('requestfailed',request=>report.errors.request.push({
    kind:'requestfailed',url:request.url(),method:request.method(),error:request.failure()?.errorText||'failed'
  }));
  page.on('response',response=>{
    if(response.status()>=400)report.errors.request.push({kind:'http',url:response.url(),status:response.status(),error:`HTTP ${response.status()}`});
  });
  await page.addInitScript(()=>{
    globalThis.__mfOrmContextLoss=[];
    addEventListener('webglcontextlost',event=>{
      globalThis.__mfOrmContextLoss.push({type:'lost',time:Date.now(),status:event.statusMessage||''});
    },true);
    try{
      localStorage.clear();
      localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_offline','1');
      localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    }catch{}
  });
  await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:60000});
  report.gpu=await assertHardwareGpu(page);
  if(!/Direct3D11|D3D11/i.test(report.gpu.renderer))throw new Error('Expected ANGLE D3D11 renderer, got '+report.gpu.renderer);
  await page.addStyleTag({content:'#mfPreAlphaIntro,#mfBootCover,#apOverlay,#loadScr{display:none!important}'});
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof applyQualityPreset==='function'&&
    typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady===true&&typeof gl!=='undefined'&&!!gl,null,{timeout:120000});

  await page.evaluate(map=>{
    const def=MAPDEFS[map];if(!def)throw new Error('Missing MAPDEF for '+map);
    if(typeof apGateSatisfied==='function')apGateSatisfied();
    if(typeof matchSetupArmed!=='undefined')matchSetupArmed=false;
    META.settings.quality='cinematic';META.settings.fog=false;META.settings.gfxOver={};
    applyQualityPreset();
    activeWarMode='standard';curMap=map;curTheme=def.theme||def.th||'vespera';
    if(def.size&&typeof battlefieldPresetKey==='function')battlefieldPreset=battlefieldPresetKey(def.size);
    builtMap='';hideFrontScreens();newSkirmish();
  },report.settings.requested.map);
  await page.waitForFunction(map=>curMap===map&&typeof heightF!=='undefined'&&!!heightF&&
    typeof PASS!=='undefined'&&!!PASS&&typeof cityZones!=='undefined'&&cityZones.length>0&&
    typeof matTex!=='undefined'&&!!matTex&&typeof matNrmTex!=='undefined'&&!!matNrmTex&&
    typeof matOrmTex!=='undefined'&&!!matOrmTex,report.settings.requested.map,{timeout:120000});

  report.settings.runtime=await page.evaluate(()=>{
    stopAttract();hideFrontScreens();
    for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch','mfPreAlphaIntro','mfBootCover','apOverlay']){
      const element=document.getElementById(id);if(element)element.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.toast,.mfToast,#cmdNotice').forEach(element=>element.style.setProperty('display','none','important'));
    document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
    demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;
    carrier.active=false;carrier.phase=2;
    const zone=cityZones.find(candidate=>candidate&&candidate.ind)||cityZones[0];
    if(!zone)throw new Error('No generated city zone');
    cam.x=zone.x;cam.y=zone.y;camFollow=-1;
    camYaw=yawTarget=.69;camPitch=pitchTarget=1.13;orthoSpan=distTarget=700;
    clampCam();camUpdateMatrices();
    if(typeof showHudDock==='function')showHudDock(true,'view');
    if(typeof setHudDeck==='function')setHudDeck('view');
    window.MFVisualDebug=0;
    const canvas=document.getElementById('gl');
    return {
      map:curMap,theme:curTheme,mode:activeWarMode,quality:typeof qualityKey==='function'?qualityKey():META.settings.quality,
      fog:!!fogOn,running:!!running,paused:!!paused,matchLive:!!matchLive,
      city:{zones:cityZones.length,plots:typeof cityPlan!=='undefined'?cityPlan.length:null,streets:typeof cityStreets!=='undefined'?cityStreets.length:null,
        focus:{kind:zone.ind?'industrial':'city',name:zone.name||'',x:zone.x,y:zone.y,radius:zone.span||zone.r||null}},
      camera:{x:cam.x,y:cam.y,yaw:camYaw,pitch:camPitch,span:orthoSpan},
      canvas:{width:canvas&&canvas.width,height:canvas&&canvas.height},
      atlas:{albedo:!!matTex,normal:!!matNrmTex,orm:!!matOrmTex}
    };
  });
  report.viewport.actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));

  const modes=[
    {mode:0,label:'ordinary',file:'ordinary.png'},
    {mode:3,label:'gloss',file:'gloss.png'},
    {mode:4,label:'metalness',file:'metalness.png'},
    {mode:5,label:'emissive',file:'emissive.png'}
  ];
  for(const item of modes){
    const frame=await page.evaluate(mode=>new Promise(accept=>{
      window.MFVisualDebug=mode;
      requestAnimationFrame(()=>requestAnimationFrame(()=>accept({
        requested:mode,actual:typeof visualDebugMode==='function'?visualDebugMode():Number(window.MFVisualDebug||0),
        contextLost:!!(gl&&gl.isContextLost())
      })));
    }),item.mode);
    if(frame.contextLost)report.errors.contextLoss.push({type:'lost',time:Date.now(),status:'gl.isContextLost() before capture'});
    const bytes=await page.screenshot({path:join(outDir,item.file),fullPage:false});
    report.captures.push({
      label:item.label,mode:item.mode,actualMode:frame.actual,file:item.file,capturedAt:new Date().toISOString(),
      sha256:sha256(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)
    });
  }
  const finalState=await page.evaluate(()=>({
    contextLoss:Array.isArray(globalThis.__mfOrmContextLoss)?globalThis.__mfOrmContextLoss:[],
    contextLost:!!(gl&&gl.isContextLost()),glError:gl?gl.getError():null,map:curMap,
    debug:typeof visualDebugMode==='function'?visualDebugMode():Number(window.MFVisualDebug||0)
  }));
  report.errors.contextLoss.push(...finalState.contextLoss);
  if(finalState.contextLost&&!report.errors.contextLoss.length)report.errors.contextLoss.push({type:'lost',time:Date.now(),status:'gl.isContextLost() at completion'});
  if(finalState.glError)report.errors.capture.push({message:'WebGL error at completion: '+finalState.glError});
  if(finalState.map!==report.settings.requested.map)report.errors.capture.push({message:'Map changed during capture: '+finalState.map});
  await page.evaluate(()=>{window.MFVisualDebug=0;});
}catch(error){
  report.errors.capture.push({message:String(error&&error.stack||error)});
}finally{
  if(page)await page.close().catch(error=>report.errors.capture.push({message:'Page close failed: '+error.message}));
  if(browser)await closePwBrowser(browser).catch(error=>report.errors.capture.push({message:'Browser close failed: '+error.message}));
  if(serverOpen)await new Promise(accept=>server.close(accept));
}

const [sourceAfterRaw,runtimeAfterRaw]=await Promise.all([
  collectSourceFingerprint(root),collectRuntimeFingerprint(root)
]);
report.fingerprints.source.after=sourceView(sourceAfterRaw);
report.fingerprints.runtime.after=runtimeView(runtimeAfterRaw);
report.fingerprints.source.stable=sourceBeforeRaw.gitHead===sourceAfterRaw.gitHead&&
  sourceBeforeRaw.dirtyFingerprint===sourceAfterRaw.dirtyFingerprint;
report.fingerprints.runtime.stable=runtimeBeforeRaw.runtimeFingerprint===runtimeAfterRaw.runtimeFingerprint;
const physical=report.captures.every(capture=>capture.width===824&&capture.height===1830);
const errorCount=Object.values(report.errors).reduce((count,items)=>count+items.length,0);
report.assertions={
  sourceStable:report.fingerprints.source.stable,runtimeStable:report.fingerprints.runtime.stable,
  hardwareD3d11:!!(report.gpu&&/Direct3D11|D3D11/i.test(report.gpu.renderer)),
  exactViewport:!!(report.viewport.actual&&report.viewport.actual.width===412&&report.viewport.actual.height===915&&report.viewport.actual.dpr===2),
  exactCaptures:report.captures.length===4&&report.captures.every((capture,index)=>capture.actualMode===[0,3,4,5][index]),
  physicalPixels:report.captures.length===4&&physical,
  requestedMap:!!(report.settings.runtime&&report.settings.runtime.map===report.settings.requested.map),
  cityFocus:!!(report.settings.runtime&&report.settings.runtime.city&&report.settings.runtime.city.focus),
  noErrors:errorCount===0
};
report.status=Object.values(report.assertions).every(Boolean)?'PASS':'FAIL';
report.completedAt=new Date().toISOString();report.captureTimeMs=Date.now()-started;
await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({status:report.status,output:report.outputDirectory,gpu:report.gpu,captures:report.captures.length,errors:errorCount},null,2));
if(report.status!=='PASS')process.exitCode=1;
