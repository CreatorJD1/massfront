/* Experimental true-volume artillery-trail capture. This never enables the
   gameplay path; it exercises VOL_TRAIL_* through the real High/Cinematic
   half-resolution depth-aware renderer for visual approval first.
   Usage: node tools/test-raymarched-artillery-trails.mjs [local URL] */
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const suppliedUrl=process.argv.find(a=>/^https?:\/\//.test(a));
let server=null,url=suppliedUrl||'';
if(!url){
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
    '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
    '.glb':'model/gltf-binary','.ktx2':'image/ktx2','.ogg':'audio/ogg','.m4a':'audio/mp4'};
  server=createServer(async(req,res)=>{try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
    const f=resolve(join(root,p));
    if(!f.startsWith(root)||!existsSync(f)){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':mime[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(f));
  }catch{res.writeHead(404);res.end('nf');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url=`http://127.0.0.1:${server.address().port}/`;
}
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir=join(root,'releases','raymarched-artillery-trails');
const energyShot=join(outDir,'raymarched-energy-trail-mobile.png');
const shellShot=join(outDir,'raymarched-shell-trail-mobile.png');
const tacticalShot=join(outDir,'raymarched-trails-tactical-mobile.png');
const commandShot=join(outDir,'raymarched-trails-command-mobile.png');
const baselineEnergy=join(outDir,'baseline-raymarched-energy-trail-mobile.png');
const baselineShell=join(outDir,'baseline-raymarched-shell-trail-mobile.png');
const frameDir=join(outDir,'contact-frames');
const energyContact=join(outDir,'raymarched-energy-contact-sheet.png');
const shellContact=join(outDir,'raymarched-shell-contact-sheet.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
await mkdir(outDir,{recursive:true});
await mkdir(frameDir,{recursive:true});

/* Decode captured PNGs through the pinned local ffmpeg binary. Coverage is an
   exact screenshot-space comparison against the same paused scene without a
   trail. `visiblePx` uses an explicit >=8/255 RGB delta; `strongPx` uses 24.
   Keeping both avoids calling sub-threshold compression noise presentation. */
const decoded=new Map();
function rgba(path){
  if(!decoded.has(path))decoded.set(path,execFileSync('ffmpeg',[
    '-loglevel','error','-i',path,'-f','rawvideo','-pix_fmt','rgba','pipe:1'
  ],{maxBuffer:64*1024*1024}));
  return decoded.get(path);
}
function pixelCoverage(background,frame,width,height){
  const a=rgba(background),b=rgba(frame),expected=width*height*4;
  assert(a.length===expected&&b.length===expected,
    `coverage decode mismatch: ${a.length}/${b.length}, expected ${expected}`);
  let changedPx=0,visiblePx=0,strongPx=0,sum=0,maxDelta=0,minX=width,minY=height,maxX=-1,maxY=-1;
  for(let p=0,i=0;p<width*height;p++,i+=4){
    const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
    if(d>=2)changedPx++;
    if(d>=8){visiblePx++;sum+=d;const x=p%width,y=(p/width)|0;
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
    if(d>=24)strongPx++;if(d>maxDelta)maxDelta=d;
  }
  return {threshold:8,strongThreshold:24,changedPx,visiblePx,strongPx,
    cssEquivalentPx:visiblePx/4,coveragePct:+(visiblePx/(width*height)*100).toFixed(4),
    meanVisibleDelta:visiblePx?+(sum/visiblePx).toFixed(2):0,maxDelta,
    bounds:visiblePx?[minX,minY,maxX,maxY]:null};
}
function makeContactSheet(frames,labels,path){
  const args=['-loglevel','error','-y'];for(const f of frames)args.push('-i',f);
  const filters=frames.map((_,i)=>`[${i}:v]scale=393:852:flags=lanczos,`+
    `drawbox=x=0:y=0:w=iw:h=42:color=black@0.72:t=fill,`+
    `drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${labels[i]}':fontcolor=white:fontsize=18:x=14:y=11[v${i}]`);
  filters.push('[v0][v1][v2]hstack=inputs=3[row0]',
    '[v3][v4][v5]hstack=inputs=3[row1]','[row0][row1]vstack=inputs=2[out]');
  args.push('-filter_complex',filters.join(';'),'-map','[out]','-frames:v','1',path);
  execFileSync('ffmpeg',args,{stdio:'pipe',maxBuffer:32*1024*1024});
}

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof volFxDebugTrail==='function'&&typeof volFxClear==='function'&&
    typeof mfOrdInit==='function'&&typeof render==='function'&&typeof findLand==='function'&&typeof stopAttract==='function',null,{timeout:60000});
  await page.waitForFunction(()=>typeof FX==='object'&&FX.dep&&FX.geyser&&FX.berm&&FX.wreck&&FX.crate&&FX.cityT&&
    typeof aoReady!=='undefined'&&aoReady,null,{timeout:60000});
  await page.evaluate(()=>mfOrdInit());
  await page.waitForFunction(()=>window.MF_ORD_TRAIL_TELEM&&MF_ORD_TRAIL_TELEM.driverReady,{timeout:15000});

  const setup=await page.evaluate(()=>{
    stopAttract();running=true;paused=true;demoMode=false;matchLive=false;fogOn=false;
    /* Select the real renderer preset. `GFX.preset` is not an interface: the
       live key is META.settings.quality and GFX is rebuilt from that preset.
       Writing the dead property left the old LOW/MEDIUM DPR and AO division
       active while claiming Cinematic in the proof. */
    META.settings.quality='cinematic';META.settings.gfxOver={};
    if(typeof applyQualityPreset==='function')applyQualityPreset();
    /* The page initially sizes its drawing buffer from the persisted preset.
       Re-size after selecting Cinematic or this proof silently raymarches a
       LOW/MEDIUM buffer and lets the browser enlarge it into a blurry phone
       screenshot—the previous 122x266 evidence was exactly that mistake. */
    if(typeof resize==='function')resize();
    volFxInit();
    /* Terrain, water and window materials read performance.now() directly.
       Freeze that independent presentation clock so screenshot diffs measure
       the trail rather than elapsed wall time between the blank and candidate. */
    window.__mfTrailEvidenceNow=12500;
    try{Object.defineProperty(performance,'now',{configurable:true,
      value:()=>window.__mfTrailEvidenceNow});}catch{}
    const freezeStyle=document.createElement('style');freezeStyle.textContent=
      '*{animation:none!important;transition:none!important;caret-color:transparent!important}';
    document.head.appendChild(freezeStyle);
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#bldMenu,#bldMenu2,#buildMenu,#prodMenu,#authGate,.notice,.toast').forEach(e=>{e.style.display='none';e.style.opacity=0;});
    document.body.classList.remove('menuMode');showHudDock(true,'powers');
    for(let i=0;i<unitHigh;i++)ualive[i]=0;unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;usel.fill(0);
    blds.length=0;rebuildBGrid(true);
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1];
    addBld('wall',1,cx-35,cy-10,true);addBld('turret',1,cx+48,cy-45,true);
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.26;camPitch=pitchTarget=1.10;
    orthoSpan=distTarget=500;clampCam();camUpdateMatrices();renderMinimap();
    return {cx,cy,quality:qualityKey(),dpr:DPR,canvas:[cv.width,cv.height],ao:[aoW,aoH],
      gfx:{volSteps:GFX.volSteps,dprCap:GFX.dprCap,ao:GFX.ao,bloom:GFX.bloom},
      renderer:(gl.getExtension('WEBGL_debug_renderer_info')&&gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL))||gl.getParameter(gl.RENDERER)};
  });

  const stages=[
    {key:'launch',start:.05,end:.34,time:.00},
    {key:'mid',start:.25,end:.66,time:.12},
    {key:'late',start:.50,end:.92,time:.24}
  ];
  const profiles={energy:{kind:7,tint:[206,132,255],seed:11.5},
    shell:{kind:8,tint:[255,118,38],seed:29.25}};

  const runtimePath=await page.evaluate(()=>{
    const families=[];
    for(const spec of [
      {name:'artillery',type:2,speed:115,expect:'shell'},
      {name:'cluster-shell',type:9,speed:115,expect:'shell'},
      {name:'unguided-missile',type:4,speed:88,expect:'shell'},
      {name:'guided-missile',type:7,speed:88,expect:'shell'},
      {name:'plasma',type:6,speed:82,expect:'energy'}]){
      volFxClear();mfOrdnanceTrailSimReset();
      const i=fireProj(spec.type,0,cam.x-170,cam.y+70,cam.x+170,cam.y-65,spec.speed,155,48,-1);
      if(i<0)throw new Error(`runtime ${spec.name} projectile admission failed`);
      pArtTrail[i]=spec.expect==='energy'?MF_ORD_TRAIL_ENERGY:MF_ORD_TRAIL_SHELL;pBio[i]=0;pArc[i]=130;
      for(let n=0;n<9&&palive[i];n++){tick++;stats.t+=1/30;projTick(1/30);}
      const during={active:mfOrdnanceTrailVolActive(i),history:volFxTrailHistoryTelemetry(),
        height:pz[i],position:[px[i],py[i]]};
      killProj(i);
      const after={active:mfOrdnanceTrailVolActive(i),history:volFxTrailHistoryTelemetry()};
      families.push({name:spec.name,type:spec.type,expect:spec.expect,slot:i,during,after});
    }
    volFxClear();mfOrdnanceTrailSimReset();
    const airType=TYPES.findIndex(T=>T&&T.air),u=spawnUnit(airType,0,cam.x-110,cam.y+25,0);
    if(u<0)throw new Error('runtime damaged-air admission failed');
    uhp[u]=uhpm[u]*.12;
    for(let n=0;n<9;n++){tick++;stats.t+=1/30;ux[u]+=2.8;uy[u]-=.7;emitAirSmoke(u,TYPES[airType],false);}
    const airDuring={active:mfOrdnanceTrailVolActive('air:'+u),history:volFxTrailHistoryTelemetry()};
    mfOrdnanceTrailSimStop('air:'+u,.2);
    const airAfter={active:mfOrdnanceTrailVolActive('air:'+u),history:volFxTrailHistoryTelemetry()};
    ualive[u]=0;teamCount[0]=Math.max(0,teamCount[0]-1);
    mfOrdnanceTrailSimReset();volFxClear();
    return {families,air:{type:airType,slot:u,during:airDuring,after:airAfter}};
  });
  assert(runtimePath.families.every(x=>x.during.active&&x.during.history.points>=2&&
    Number.isFinite(x.during.height)&&!x.after.active)&&runtimePath.air.during.active&&
    runtimePath.air.during.history.points>=2&&!runtimePath.air.after.active,
    'simulation-owned trail-family lifecycle failed: '+JSON.stringify(runtimePath));

  async function captureBlank(span,path){
    await page.evaluate(({span})=>{
      orthoSpan=distTarget=span;clampCam();camUpdateMatrices();
      volFxClear();volFxTrailHistoryReset();volTime=0;render(0);render(0);render(0);
    },{span});
    await page.screenshot({path,fullPage:false});return {path,sha256:sha(path)};
  }

  async function captureFrame(profileName,span,stage,path,background){
    const profile=profiles[profileName];
    const spawned=await page.evaluate(({profile,span,stage})=>{
      orthoSpan=distTarget=span;clampCam();camUpdateMatrices();
      volFxClear();volFxTrailHistoryReset();
      const cx=cam.x,cy=cam.y,x0=cx-190,z0=cy+92,y0=terrainH(x0,z0)+28;
      const x1=cx+176,z1=cy-82,y1=terrainH(x1,z1)+25,arc=116;
      const row=volFxTrailHistoryBegin(profile.kind,{tint:profile.tint,seed:profile.seed});
      /* A moving 12-sample fixed-step window. Launch/mid/late therefore prove
         projectile travel and tail continuity; they are not three colour-clock
         snapshots of one stationary lucky frame. */
      for(let j=0;j<12;j++){
        const u=j/11,q=stage.start+(stage.end-stage.start)*u;
        const x=x0+(x1-x0)*q,z=z0+(z1-z0)*q,y=y0+(y1-y0)*q+Math.sin(q*Math.PI)*arc;
        if(!volFxTrailHistoryPush(row,x,z,y,stage.time+j/60))throw new Error('contact history push failed');
      }
      volTime=stage.time;
      const slot=volFxTrailHistoryEmit(row,{life:10,age:.20});
      const before=volFxTrailHistoryTelemetry();render(0);render(0);render(0);
      const after=volFxTrailHistoryTelemetry();
      return {slot,row,kind:profile.kind,span,stage:stage.key,before,after,
        pausedStable:before.points===after.points&&before.pushes===after.pushes&&before.emits===after.emits};
    },{profile,span,stage});
    const telem=await page.evaluate(()=>({...VOLFX_TELEMETRY}));
    assert(spawned.slot>=0&&spawned.before.rows===1&&spawned.before.points===12&&
      spawned.before.pushes===12&&spawned.before.emits===1&&spawned.pausedStable,
      'fixed-step contact contract failed: '+JSON.stringify(spawned));
    assert(telem.progOK&&telem.drawn===1&&telem.steps===32&&telem.marchedPx>0&&telem.compositePx>0,
      'raymarched contact did not composite: '+JSON.stringify(telem));
    assert(telem.glErr===0&&!telem.lastError&&telem.trailDriverReady&&telem.trailHistoryReady,
      'raymarched contact GL/driver failure: '+JSON.stringify(telem));
    if(profile.kind===7)assert(telem.presentedTrailEnergy===1&&telem.presentedTrailShell===0,
      'energy contact telemetry mismatch');
    else assert(telem.presentedTrailShell===1&&telem.presentedTrailEnergy===0,
      'shell contact telemetry mismatch');
    await page.screenshot({path,fullPage:false});
    const coverage=pixelCoverage(background,path,setup.canvas[0],setup.canvas[1]);
    assert(coverage.visiblePx>0&&coverage.strongPx>0,
      `no measured ${profileName} coverage at ${span}/${stage.key}: ${JSON.stringify(coverage)}`);
    return {span,stage:stage.key,volume:telem,history:spawned.after,
      pausedStable:spawned.pausedStable,coverage,capture:{path,sha256:sha(path)}};
  }

  /* Preserve the familiar matched mid-frame captures while extending proof to
     a full temporal/distance matrix below. */
  const matchedBlank=await captureBlank(500,join(frameDir,'baseline-matched.png'));
  const energy=await captureFrame('energy',500,stages[1],energyShot,matchedBlank.path);
  const shell=await captureFrame('shell',500,stages[1],shellShot,matchedBlank.path);

  const spans=[{key:'tactical',value:420},{key:'command',value:1350}];
  const backgrounds={};for(const s of spans)
    backgrounds[s.key]=await captureBlank(s.value,join(frameDir,`baseline-${s.key}.png`));
  async function captureRuntimeFamily(spec){
    const path=join(frameDir,`runtime-${spec.name}.png`);
    const state=await page.evaluate(({spec})=>{
      volFxClear();mfOrdnanceTrailSimReset();orthoSpan=distTarget=420;clampCam();camUpdateMatrices();
      if(spec.air){
        const airType=TYPES.findIndex(T=>T&&T.air),u=spawnUnit(airType,0,cam.x-145,cam.y+48,0);
        if(u<0)throw new Error('runtime air capture admission failed');
        uhp[u]=uhpm[u]*.12;
        for(let n=0;n<12;n++){tick++;stats.t+=1/30;ux[u]+=7.4;uy[u]-=1.8;emitAirSmoke(u,TYPES[airType],false);}
        render(0);render(0);render(0);
        return {key:'air:'+u,slot:u,active:mfOrdnanceTrailVolActive('air:'+u),
          history:volFxTrailHistoryTelemetry(),volume:{...VOLFX_TELEMETRY}};
      }
      const i=fireProj(spec.type,0,cam.x-155,cam.y+58,cam.x+175,cam.y-48,spec.speed,150,46,-1);
      if(i<0)throw new Error(`runtime ${spec.name} capture admission failed`);
      pArtTrail[i]=spec.expect==='energy'?MF_ORD_TRAIL_ENERGY:MF_ORD_TRAIL_SHELL;pBio[i]=0;pArc[i]=120;
      for(let n=0;n<12&&palive[i];n++){tick++;stats.t+=1/30;projTick(1/30);}
      render(0);render(0);render(0);
      return {key:i,slot:i,active:mfOrdnanceTrailVolActive(i),history:volFxTrailHistoryTelemetry(),
        volume:{...VOLFX_TELEMETRY},worldHeight:pz[i]};
    },{spec});
    assert(state.active&&state.history.points>=2&&state.volume.drawn===1&&state.volume.glErr===0,
      `runtime ${spec.name} did not present one volume: ${JSON.stringify(state)}`);
    if(spec.expect==='energy')assert(state.volume.presentedTrailEnergy===1,
      `runtime ${spec.name} energy telemetry mismatch: ${JSON.stringify(state)}`);
    else assert(state.volume.presentedTrailShell===1,
      `runtime ${spec.name} shell telemetry mismatch: ${JSON.stringify(state)}`);
    await page.screenshot({path,fullPage:false});
    const coverage=pixelCoverage(backgrounds.tactical.path,path,setup.canvas[0],setup.canvas[1]);
    assert(coverage.visiblePx>0&&coverage.strongPx>0,
      `runtime ${spec.name} has no measured coverage: ${JSON.stringify(coverage)}`);
    await page.evaluate(({key,slot})=>{
      mfOrdnanceTrailSimStop(key,.05);
      if(typeof key==='string'){if(ualive[slot]){ualive[slot]=0;teamCount[0]=Math.max(0,teamCount[0]-1);}}
      else if(palive[slot])killProj(slot);
      mfOrdnanceTrailSimReset();volFxClear();
    },{key:state.key,slot:state.slot});
    return {name:spec.name,type:spec.type??'damaged-air',expect:spec.expect,state,coverage,
      capture:{path,sha256:sha(path)}};
  }
  const runtimeCaptures=[];
  for(const spec of [
    {name:'unguided-missile',type:4,speed:205,expect:'shell'},
    {name:'guided-missile',type:7,speed:205,expect:'shell'},
    {name:'plasma',type:6,speed:185,expect:'energy'},
    {name:'cluster-shell',type:9,speed:150,expect:'shell'},
    {name:'damaged-air',air:true,expect:'shell'}])runtimeCaptures.push(await captureRuntimeFamily(spec));
  const contact={energy:{tactical:[],command:[]},shell:{tactical:[],command:[]}};
  for(const profileName of ['energy','shell'])for(const s of spans)for(const stage of stages){
    const path=join(frameDir,`${profileName}-${s.key}-${stage.key}.png`);
    contact[profileName][s.key].push(await captureFrame(profileName,s.value,stage,path,backgrounds[s.key].path));
  }
  makeContactSheet([...contact.energy.tactical,...contact.energy.command].map(x=>x.capture.path),
    ['TACTICAL  LAUNCH','TACTICAL  MID','TACTICAL  LATE','COMMAND  LAUNCH','COMMAND  MID','COMMAND  LATE'],energyContact);
  makeContactSheet([...contact.shell.tactical,...contact.shell.command].map(x=>x.capture.path),
    ['TACTICAL  LAUNCH','TACTICAL  MID','TACTICAL  LATE','COMMAND  LAUNCH','COMMAND  MID','COMMAND  LATE'],shellContact);

  /* Retain the prior filenames as the tactical mid-frame quick comparison. */
  execFileSync('ffmpeg',['-loglevel','error','-y','-i',contact.energy.tactical[1].capture.path,
    '-frames:v','1',tacticalShot]);
  execFileSync('ffmpeg',['-loglevel','error','-y','-i',contact.energy.command[1].capture.path,
    '-frames:v','1',commandShot]);
  const distance={tactical:contact.energy.tactical[1],command:contact.energy.command[1]};
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  const report={ok:true,when:new Date().toISOString(),label:'simulation-owned-and-synthetic-trails-in-real-renderer',
    baseline:{energy:{path:baselineEnergy,sha256:sha(baselineEnergy)},shell:{path:baselineShell,sha256:sha(baselineShell)}},
    runtimePath,field:{interpolation:'catmull-rom-c1',coverage:'analytic-ray-interval',instancesPerEvent:1,historyPoints:12},
    identity:{head:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
      sources:['src/engine/volfx.js','src/engine/ordnancetrails.js','src/ui/render3d.js','src/game/sim.js']
        .map(file=>({file,sha256:sha(join(root,file))}))},setup,energy,shell,distance,
    runtimeCaptures,contactSheets:{energy:{path:energyContact,sha256:sha(energyContact),layout:'rows tactical/command; columns launch/mid/late'},
      shell:{path:shellContact,sha256:sha(shellContact),layout:'rows tactical/command; columns launch/mid/late'}},
    contact,backgrounds,pageErrors:errors};
  await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{
  await closePwBrowser(browser);
  if(server)await new Promise(r=>server.close(r));
}
