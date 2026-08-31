#!/usr/bin/env node
/* Read-only real-GPU verification for bounded combat/environment presentation.
   This file deliberately drives public/live debug surfaces only. It does not
   patch runtime state beyond constructing deterministic scenes in the page.
   Output: .tmp/runtime-fx-contracts/
*/
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Other art agents can be capturing in parallel. The shared default CDP would
   let either harness close the other's page and previously left a 2.2 MB file
   containing only zero bytes. Use a dedicated project-helper port unless the
   caller deliberately supplies one before this module loads. */
process.env.PW_CDP_PORT ||= '9471';
const { launchPwBrowser,closePwBrowser } = await import('./pw-browser.mjs');

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','runtime-fx-contracts');
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg',
  '.wav':'audio/wav','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
  const f=resolve(join(root,p));if(!f.startsWith(root)||!existsSync(f)){res.writeHead(404);res.end('nf');return;}
  res.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(await readFile(f));
}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/?fxprobe=1`;

const checks=[];
function check(name,ok,evidence){checks.push({name,pass:!!ok,evidence});console.log(`${ok?'PASS':'FAIL'} ${name} [${evidence}]`);}
const captureValidation=[];
async function capturePng(page,name){
  const png=await page.screenshot({type:'png',animations:'disabled'});
  const signature=png.subarray(0,8).toString('hex');
  if(signature!=='89504e470d0a1a0a')throw new Error(`${name}: invalid PNG signature ${signature}`);
  const decoded=await page.evaluate(async encoded=>{
    const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let n=0,mean=0,m2=0,min=255,max=0;
    for(let i=0;i<pixels.length;i+=4){
      const value=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
      min=Math.min(min,value);max=Math.max(max,value);n++;
      const delta=value-mean;mean+=delta/n;m2+=delta*(value-mean);
    }
    return {width:image.naturalWidth,height:image.naturalHeight,variance:m2/Math.max(1,n-1),min,max};
  },png.toString('base64'));
  if(!(decoded.width>0&&decoded.height>0&&decoded.variance>4&&decoded.max-decoded.min>8))
    throw new Error(`${name}: decoded screenshot has no useful variance ${JSON.stringify(decoded)}`);
  const finalPath=join(outDir,name),partialPath=finalPath+`.partial-${process.pid}`;
  await writeFile(partialPath,png);
  try{await rename(partialPath,finalPath);}catch(error){
    await rm(finalPath,{force:true});await rename(partialPath,finalPath);
  }
  const row={name,signature,bytes:png.length,...decoded};captureValidation.push(row);return row;
}
const browser=await launchPwBrowser({
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});
let pageErrors=[];
try{
  const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  page.on('pageerror',e=>pageErrors.push(String(e.message||e)));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof render==='function'&&
    typeof mfEmitMacroFx==='function'&&typeof shieldFxTelemetry==='function'&&typeof orgfxDeath==='function',null,{timeout:120000});
  const gpu=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2');
    if(!g)return {renderer:'NO-WEBGL2'};const d=g.getExtension('WEBGL_debug_renderer_info');
    return {renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):String(g.getParameter(g.RENDERER))};});
  console.log('GPU '+gpu.renderer);
  check('hardware ANGLE D3D11',/ANGLE.*Direct3D11|ANGLE.*D3D11/i.test(gpu.renderer)&&!/swiftshader|software|llvmpipe/i.test(gpu.renderer),gpu.renderer);

  await page.evaluate(()=>{
    try{if(typeof apClose==='function')apClose();}catch{}
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay','pauseOverlay','gameOver','levelUp','dispatch','setupScr','startScreen']){
      const e=document.getElementById(id);if(e)e.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(e=>e.style.setProperty('display','none','important'));
    for(const el of [...document.body.children])if(el.id!=='gl')el.style.display='none';
    cv.style.display='block';cv.style.position='fixed';cv.style.inset='0';cv.style.width='100vw';cv.style.height='100vh';
    /* Keep the live RAF from ageing deterministic effects between scene setup
       and the screenshot. Every intended simulation step below is explicit. */
    attractOn=false;demoMode=false;matchLive=true;fogOn=false;running=true;paused=true;gameEnded=false;
    if(META&&META.settings){META.settings.fog=false;META.settings.dayNight=false;META.settings.quality='high';META.settings.cine=true;}
    if(typeof applySettings==='function')applySettings();
    perfScale=1;dayT=.08;if(typeof GFX!=='undefined'){GFX.particles=1;GFX.volSteps=24;GFX.ao=true;GFX.bloom=true;}
    resetWorld();const cx=MAP*.5,cy=MAP*.5;cam.x=cx;cam.y=cy;camFollow=-1;
    camYaw=yawTarget=.28;camPitch=pitchTarget=1.10;orthoSpan=distTarget=400;
    if(typeof resize==='function')resize();if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
  });
  await page.waitForFunction(()=>typeof mfTerrainMaterialsReady==='function'&&mfTerrainMaterialsReady(),null,{timeout:90000}).catch(()=>{});
  await page.evaluate(()=>{if(typeof macroFxBoot==='function')macroFxBoot();});
  await page.waitForFunction(()=>{const t=typeof macroFxTelemetry==='function'?macroFxTelemetry():null;
    return !!t&&t.blast==='ready'&&t.trail==='ready'&&t.airDeath==='ready'&&t.energy==='ready'&&t.ichor==='ready';},null,{timeout:90000}).catch(()=>{});
  const combatAtlases=await page.evaluate(()=>(typeof macroFxTelemetry==='function'?{...macroFxTelemetry()}:null));
  check('authored combat atlases decoded before visual probes',!!combatAtlases&&combatAtlases.blast==='ready'&&combatAtlases.trail==='ready'&&combatAtlases.airDeath==='ready'&&combatAtlases.energy==='ready'&&combatAtlases.ichor==='ready',JSON.stringify(combatAtlases));
  const terrain=await page.evaluate(()=>({
    ready:mfTerrainMaterialsReady(),setReady:terrTexSetReady,theme:terrTexThemeLoaded,
    surface:terrTexSurfaceLoaded,slot:terrTexSlotLoaded,program:typeof terrainProgOK==='undefined'?null:terrainProgOK,
    valid:[terrGroundTex,terrSoilTex,terrPaveTex,terrGrassTex,terrGroundNrm,terrSoilNrm,terrPaveNrm,terrGrassNrm].map(t=>!!t&&(!gl.isTexture||gl.isTexture(t))),
    selection:mfTerrainSurfaceSelection(),profile:mfTerrainLocationProfile()
  }));
  check('authored terrain material set atomically ready',terrain.ready&&terrain.setReady&&terrain.valid.every(Boolean),JSON.stringify(terrain));
  await page.evaluate(()=>render(1/60));
  await capturePng(page,'01-terrain-authored-ready.png');

  const macro=await page.evaluate(()=>{
    mfMacroFxResetTelemetry();if(typeof volFxClear==='function')volFxClear();
    const cx=cam.x,cy=cam.y,h=terrainH(cx,cy);orthoSpan=distTarget=500;
    if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    mfEmitMacroFx(MF_MACRO_FX_DIRECT,cx-170,cy-100,{size:18,shock:true,debrisCount:0});
    mfEmitMacroFx(MF_MACRO_FX_EXPLOSIVE,cx-72,cy+2,{size:34,debrisCount:2});
    mfEmitMacroFx(MF_MACRO_FX_STRATEGIC,cx+108,cy-38,{size:76,debrisCount:3});
    mfEmitMacroFx(MF_MACRO_FX_COLLAPSE,cx+32,cy+132,{size:42,debrisCount:3});
    mfEmitMacroFx(MF_MACRO_FX_BEAM,cx-150,cy+118,{size:9,shock:false,debrisCount:0});
    for(let i=0;i<7;i++)render(1/60);
    return {macro:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()},height:h};
  });
  const events=macro.macro.events.filter(e=>e.kind!=='forbidden-gpu');
  check('macro recipes stay at <=3 logical layers',events.length>=5&&events.every(e=>e.layers<=3),events.map(e=>`${e.kind}:${e.layers}`).join(','));
  check('macro recipes emit zero forbidden GPU sprays',macro.macro.forbiddenGpu===0&&!macro.macro.events.some(e=>e.forbiddenGpu),JSON.stringify(macro.macro));
  check('one strategic visual recipe',events.filter(e=>e.kind==='strategic').length===1,JSON.stringify(events.filter(e=>e.kind==='strategic')));
  const collapse=events.find(e=>e.kind==='collapse');
  const slab=collapse&&collapse.layerKinds.map(k=>/^debris-group:(\d+)$/.exec(k)).find(Boolean);
  check('collapse emits one bounded 1-3 slab group',!!slab&&+slab[1]>=1&&+slab[1]<=3,JSON.stringify(collapse));
  const cores=events.filter(e=>e.kind==='explosive'||e.kind==='strategic'||e.kind==='collapse');
  check('volume/flipbook fallback is atomic',cores.every(e=>e.layerKinds.filter(k=>/volume|flipbook/.test(k)).length===1&&/^(armed-flipbook|flipbook)$/.test(e.fallback)),JSON.stringify(cores));
  const directMacro=events.find(e=>e.kind==='direct');
  check('direct contact is a true raymarched impact on High',!!directMacro&&
    directMacro.layerKinds[0]==='impact-volume'&&directMacro.fallback==='armed-billboard'&&
    macro.volume.presentedImpact>=1,JSON.stringify({directMacro,volume:macro.volume}));
  const macroVisual=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;if(typeof volFxClear==='function')volFxClear();
    GFX.volSteps=24;
    let cx=MAP*.5,cy=MAP*.5,best=-1;
    for(let y=MAP*.18;y<=MAP*.82;y+=128)for(let x=MAP*.18;x<=MAP*.82;x+=128){
      const h=terrainH(x,y);if(typeof WATER_Y!=='undefined'&&h<WATER_Y+1.5)continue;
      let d=420;if(typeof blds!=='undefined')for(const B of blds)if(B&&B.alive)d=Math.min(d,Math.hypot(B.x-x,B.y-y));
      const edge=Math.min(x,y,MAP-x,MAP-y),score=Math.min(d,edge*.72);if(score>best){best=score;cx=x;cy=y;}
    }
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=280;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    mfMacroFxResetTelemetry();
    mfEmitMacroFx(MF_MACRO_FX_EXPLOSIVE,cx,cy,{size:46,coreRadius:42,coreLife:1.18,
      shockRadius:88,shockLife:.48,hot:[255,224,176],rim:[255,194,112],dust:[46,50,56],
      volumeTint:[88,78,70],debrisCount:2});
    /* Capture the readable turbulent body, not the intentionally tiny first
       ignition cell. Twenty-four 60 Hz frames place both the volume and its
       armed atlas clock near one-third life while keeping the shock alive. */
    for(let n=0;n<24;n++){if(typeof updParticles==='function')updParticles(1/60);render(1/60);}
    return {point:[cx,cy],clearance:best,recipe:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),
      volume:{...volFxTelemetry()},renderer:{...macroFxTelemetry()}};
  });
  check('High presents one 24-step textured volume and hides its armed v4 fallback',macroVisual.volume.drawn===1&&
    macroVisual.volume.steps===24&&macroVisual.volume.presentedBlast===1&&macroVisual.volume.fallbackQueries===1&&
    macroVisual.volume.fallbackHits===1&&macroVisual.renderer.lastDrawn===0&&macroVisual.recipe.events.length===1&&
    macroVisual.recipe.events[0].layers===3&&macroVisual.recipe.events[0].layerKinds[0]==='blast-volume'&&
    macroVisual.recipe.events[0].fallback==='armed-flipbook',JSON.stringify(macroVisual));
  await capturePng(page,'02-macro-volume-high.png');

  const impactVisual=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;volFxClear();GFX.volSteps=24;mfMacroFxResetTelemetry();
    const cx=cam.x,cy=cam.y;
    camFollow=-1;camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=230;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    mfEmitMacroFx(MF_MACRO_FX_DIRECT,cx,cy,{size:24,coreRadius:21,coreLife:.52,
      hot:[174,242,255],rim:[52,202,255],volumeTint:[40,108,142],shock:true,
      shockRadius:28,shockLife:.22,debrisCount:1,direction:[1,.35],dust:[46,52,58]});
    for(let n=0;n<9;n++){if(typeof updParticles==='function')updParticles(1/60);render(1/60);}
    return {recipe:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()},renderer:{...macroFxTelemetry()}};
  });
  check('High impact composites VOL_IMPACT and hides its armed card',impactVisual.volume.drawn===1&&
    impactVisual.volume.steps===24&&impactVisual.volume.presentedImpact===1&&
    impactVisual.volume.fallbackQueries===1&&impactVisual.volume.fallbackHits===1&&
    impactVisual.recipe.events.length===1&&impactVisual.recipe.events[0].layerKinds[0]==='impact-volume'&&
    impactVisual.recipe.events[0].fallback==='armed-billboard',JSON.stringify(impactVisual));
  await capturePng(page,'02a-direct-impact-volume-high.png');

  const macroFailure=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;volFxClear();GFX.volSteps=24;mfMacroFxResetTelemetry();
    const cx=cam.x,cy=cam.y;
    camFollow=-1;camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=280;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    mfEmitMacroFx(MF_MACRO_FX_EXPLOSIVE,cx,cy,{size:46,coreRadius:42,coreLife:1.18,
      shockRadius:88,shockLife:.48,hot:[255,224,176],rim:[255,194,112],dust:[46,50,56],
      volumeTint:[88,78,70],debrisCount:2});
    /* Model any shader/depth/RT early return after the recipe armed a volume:
       presentation bits stay clear, so the already-queued v4 core must draw. */
    GFX.volSteps=0;for(let n=0;n<24;n++){if(typeof updParticles==='function')updParticles(1/60);render(1/60);}
    const out={recipe:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()},renderer:{...macroFxTelemetry()}};
    GFX.volSteps=24;return out;
  });
  check('armed volume failure reveals exactly one v4 fallback',macroFailure.volume.drawn===0&&
    macroFailure.volume.presentedBlast===0&&macroFailure.volume.fallbackQueries===1&&macroFailure.volume.fallbackHits===0&&
    macroFailure.renderer.lastDrawn===1&&macroFailure.recipe.events.length===1&&
    macroFailure.recipe.events[0].layerKinds[0]==='blast-volume'&&macroFailure.recipe.events[0].fallback==='armed-flipbook',
    JSON.stringify(macroFailure));

  const macroLow=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;volFxClear();GFX.volSteps=0;mfMacroFxResetTelemetry();
    const cx=cam.x,cy=cam.y;
    camFollow=-1;camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=280;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    mfEmitMacroFx(MF_MACRO_FX_EXPLOSIVE,cx,cy,{size:46,coreRadius:42,coreLife:1.18,
      shockRadius:88,shockLife:.48,hot:[255,224,176],rim:[255,194,112],dust:[46,50,56],debrisCount:2});
    for(let n=0;n<24;n++){if(typeof updParticles==='function')updParticles(1/60);render(1/60);}
    return {recipe:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()},renderer:{...macroFxTelemetry()}};
  });
  check('Low/Medium present one v4 core without allocating a volume',macroLow.volume.drawn===0&&
    macroLow.volume.presentedBlast===0&&macroLow.volume.fallbackQueries===1&&macroLow.volume.fallbackHits===0&&
    macroLow.renderer.lastDrawn===1&&macroLow.recipe.events.length===1&&macroLow.recipe.events[0].layers===3&&
    macroLow.recipe.events[0].layerKinds[0]==='blast-flipbook'&&macroLow.recipe.events[0].fallback==='flipbook',JSON.stringify(macroLow));
  await capturePng(page,'02b-macro-v4-fallback.png');
  await page.evaluate(()=>{GFX.volSteps=24;});

  /* Real gameplay-owned Bombard impact. This is intentionally projImpact(),
     not a hand-authored macro call, so its crater, deformation, recipe class,
     rigid fragments and visual radii all come from the shipping weapon path. */
  const bombardEarly=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;volFxClear();GFX.volSteps=24;perfScale=1;
    mfMacroFxResetTelemetry();if(typeof mfPhysClear==='function')mfPhysClear();
    let cx=MAP*.5,cy=MAP*.5,best=-1;
    for(let y=MAP*.20;y<=MAP*.80;y+=128)for(let x=MAP*.20;x<=MAP*.80;x+=128){
      const h=terrainH(x,y);if(typeof WATER_Y!=='undefined'&&h<WATER_Y+1.5)continue;
      let d=420;if(typeof blds!=='undefined')for(const B of blds)if(B&&B.alive)d=Math.min(d,Math.hypot(B.x-x,B.y-y));
      if(d>best){best=d;cx=x;cy=y;}
    }
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=320;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    window.__mfBombardBase={burns:groundBurns.length};
    const p=fireProj(2,0,cx-180,cy,cx,cy,150,95,48,-1);
    if(p>=0){pwk[p]='e';pBarrage[p]=1;px[p]=cx;py[p]=cy;projImpact(p);}
    for(let n=0;n<6;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}
    const pieces=[];if(typeof MFPhys!=='undefined')MFPhys.forEach((id,v)=>pieces.push({
      id,x:v.x,y:v.y,z:v.z,vx:v.vx,vy:v.vy,vz:v.vz,
      speed:Math.hypot(v.vx,v.vy,v.vz),hx:v.hx,hy:v.hy,hz:v.hz,trail:v.trail
    }));
    return {slot:p,point:[cx,cy],clearance:best,
      burns:groundBurns.length-window.__mfBombardBase.burns,craters:craters.length,pieces,
      physics:typeof mfPhysProbe==='function'?mfPhysProbe(false):null,
      macro:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()}};
  });
  const bombardRecipe=bombardEarly.macro.events.find(e=>e.weaponClass==='bombardment');
  check('Bombard impact matches its crater and launches 1-3 readable velocity-trailed shards',!!bombardRecipe&&
    bombardRecipe.layers===3&&bombardRecipe.coreRadius>=bombardRecipe.craterRadius*.80&&
    bombardRecipe.shockRadius>bombardRecipe.craterRadius&&bombardEarly.craters===1&&
    bombardEarly.pieces.length>=1&&bombardEarly.pieces.length<=3&&
    bombardEarly.pieces.every(p=>p.trail&&p.speed>70&&
      Math.max(p.hx,p.hy,p.hz)/Math.max(.001,Math.min(p.hx,p.hy,p.hz))>=1.5)&&
    bombardEarly.physics&&bombardEarly.physics.velocityTrails>=bombardEarly.pieces.length*3,
    JSON.stringify(bombardEarly));
  await capturePng(page,'02f-bombard-impact-early.png');
  await page.evaluate(()=>{for(let n=0;n<22;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}});
  await capturePng(page,'02g-bombard-impact-fire-soot.png');
  await page.evaluate(()=>{for(let n=0;n<92;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}});
  await capturePng(page,'02h-bombard-crater-aftermath.png');
  const bombardAfter=await page.evaluate(()=>{
    const base=window.__mfBombardBase||{burns:0};
    const live=Array.from(ftype).filter((v,i)=>(v===11||v===12)&&flife[i]>0).length;
    const burns=groundBurns.slice(base.burns);
    return {macroLive:live,burns:burns.length,lastBurn:burns.length?{...burns[burns.length-1]}:null,
      volume:{...volFxTelemetry()}};
  });
  check('Bombard core clears to one persistent textured thermal ground burn',
    bombardAfter.macroLive===0&&bombardAfter.burns===1&&bombardAfter.lastBurn&&
    bombardAfter.lastBurn.kind===1&&bombardAfter.lastBurn.r>=bombardRecipe.craterRadius*.70,
    JSON.stringify(bombardAfter));

  /* Full gameplay-owned strategic sequence. Unlike the isolated macro probe
     above, this path must retain deformation/crater, one thermal ground-burn
     record, readable 1-3 rigid slabs, and the core's fire-to-smoke tail. */
  const strategicEarly=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;volFxClear();GFX.volSteps=24;mfMacroFxResetTelemetry();
    const cx=MAP*.5,cy=MAP*.5;cam.x=cx;cam.y=cy;camFollow=-1;
    camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=360;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    window.__mfStrategicBase={burns:groundBurns.length,craters:craters.length,rubble:rubbles.length};
    superDetonation(cx,cy,.25,0);
    for(let n=0;n<7;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}
    const pieces=[];
    if(typeof MFPhys!=='undefined')MFPhys.forEach((id,v)=>pieces.push({id,hx:v.hx,hy:v.hy,hz:v.hz,trail:v.trail}));
    return {burns:groundBurns.length-window.__mfStrategicBase.burns,
      craters:craters.length-window.__mfStrategicBase.craters,
      rubble:rubbles.length-window.__mfStrategicBase.rubble,
      debris:pieces.length,pieces,physics:typeof mfPhysProbe==='function'?mfPhysProbe(false):null,
      macro:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()}};
  });
  check('strategic gameplay path owns burn, crater, rubble, and 1-3 airborne slabs',
    strategicEarly.burns===1&&strategicEarly.craters===1&&strategicEarly.rubble>0&&
    strategicEarly.debris>=1&&strategicEarly.debris<=3&&strategicEarly.physics&&
    strategicEarly.physics.rigidPieces>=strategicEarly.debris&&strategicEarly.macro.events.length===1,
    JSON.stringify(strategicEarly));
  await capturePng(page,'02c-strategic-ignition-shock-debris.png');
  await page.evaluate(()=>{for(let n=0;n<125;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}});
  await capturePng(page,'02d-strategic-fire-soot-smoke.png');
  const strategicSmoke=await page.evaluate(()=>{
    for(let n=0;n<100;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}
    return {burns:groundBurns.length-window.__mfStrategicBase.burns,
      craters:craters.length-window.__mfStrategicBase.craters,
      rubble:rubbles.length-window.__mfStrategicBase.rubble,
      macroLive:Array.from(ftype).filter((v,i)=>(v===11||v===12)&&flife[i]>0).length};
  });
  check('strategic core continues as one smoke layer over char and crater',strategicSmoke.burns===1&&
    strategicSmoke.craters===1&&strategicSmoke.rubble>0&&strategicSmoke.macroLive===1,JSON.stringify(strategicSmoke));
  await capturePng(page,'02e-strategic-char-crater-aftermath.png');
  const strategicAfter=await page.evaluate(()=>{
    for(let n=0;n<80;n++){stats.t+=1/60;beamTick(1/60);updParticles(1/60);render(1/60);}
    return {burns:groundBurns.length-window.__mfStrategicBase.burns,
      craters:craters.length-window.__mfStrategicBase.craters,
      rubble:rubbles.length-window.__mfStrategicBase.rubble,
      macroLive:Array.from(ftype).filter((v,i)=>(v===11||v===12)&&flife[i]>0).length};
  });
  check('strategic aftermath persists after transient core expires',strategicAfter.burns===1&&
    strategicAfter.craters===1&&strategicAfter.rubble>0&&strategicAfter.macroLive===0,JSON.stringify(strategicAfter));

  const projectileBeam=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;const cx=MAP*.5,cy=MAP*.5;cam.x=cx;cam.y=cy;orthoSpan=distTarget=390;
    if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    const slots=[];
    for(let k=-2;k<=2;k++){
      const p=fireProj(7,0,cx-150,cy+k*28,cx+155,cy+k*20,150,40,28,-1);
      if(p>=0){pwk[p]='e';projectileFireFX(p,cx-150,cy+k*28,305,-k*8);slots.push(p);}
    }
    addBeam(cx-140,cy-62,cx+130,cy-62,2.8,65,205,255,1.5,'laser',0);
    addBeam(cx-140,cy,cx+130,cy,5.4,100,205,255,1.5,'lance',0);
    addBeam(cx-140,cy+64,cx+130,cy+64,3.4,255,116,48,1.5,'thermal',0);
    gpfxBurst(cx-125,cy,terrainH(cx-125,cy)+8,12,{speed:12,life:1.2,skipWater:1});
    for(let n=0;n<8;n++){tick++;projTick(.025);if(typeof updParticles==='function')updParticles(.025);render(0);}
    const before={gpfxLive,beams:beams.length,particles:fCount,combat:{...MFCombatVfxTelemetry}};
    paused=true;
    for(let n=0;n<12;n++)render(0);
    const after={gpfxLive,beams:beams.length,particles:fCount,combat:{...MFCombatVfxTelemetry}};
    let live=0,missiles=0;for(let i=0;i<pHigh;i++)if(palive[i]){live++;if(ptype[i]===7)missiles++;}
    return {before,after,live,missiles,slots:slots.length,particleCap:MAXPART};
  });
  check('guided missile trails have bounded live emitters',projectileBeam.missiles>0&&projectileBeam.missiles<=5&&projectileBeam.after.particles<projectileBeam.particleCap,JSON.stringify(projectileBeam));
  check('paused beam render keeps gpfxLive stable',projectileBeam.before.gpfxLive===projectileBeam.after.gpfxLive,`${projectileBeam.before.gpfxLive} -> ${projectileBeam.after.gpfxLive}`);
  check('energy beams and termini reach renderer',projectileBeam.after.combat.beams>=3&&projectileBeam.after.beams===3,JSON.stringify(projectileBeam.after));
  await capturePng(page,'03-missiles-beams-termini.png');

  const organic=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;const cx=MAP*.5,cy=MAP*.5;cam.x=cx;cam.y=cy;orthoSpan=distTarget=300;
    if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    const before=orgfxCount(),gpfxBefore=gpfxLive;
    for(let k=-2;k<=2;k++)orgfxHit(cx-60,cy+k*18,16,1,.2,k%3);
    orgfxDeath(cx+35,cy,34,2);
    for(let n=0;n<4;n++)render(1/60);
    let drops=0,splats=0,wisps=0;
    for(let i=0;i<ORGFX_CAP;i++)if(orgLife[i]>0){if(orgKind[i]===ORGFX_DROP)drops++;else if(orgKind[i]===ORGFX_SPLAT)splats++;else wisps++;}
    return {before,after:orgfxCount(),drops,splats,wisps,cap:ORGFX_CAP,gpfxBefore,gpfxAfter:gpfxLive};
  });
  check('organic hit/death burst is bounded and includes wet splats',organic.after>organic.before&&organic.after<=organic.cap&&organic.splats>0,JSON.stringify(organic));
  check('organic liquid avoids GPU spray',organic.gpfxAfter===organic.gpfxBefore,JSON.stringify(organic));
  await capturePng(page,'04-organic-ichor-hit-death.png');

  const air=await page.evaluate(()=>{
    resetWorld();paused=true;if(typeof orgfxReset==='function')orgfxReset();if(typeof volFxClear==='function')volFxClear();
    fogOn=false;let cx=MAP*.5,cy=MAP*.5,best=-1;
    for(let y=MAP*.22;y<=MAP*.78;y+=150)for(let x=MAP*.22;x<=MAP*.78;x+=150){let d=420;
      if(typeof blds!=='undefined')for(const B of blds)if(B&&B.alive)d=Math.min(d,Math.hypot(B.x-x,B.y-y));
      if(d>best&&terrainH(x,y)>(typeof WATER_Y!=='undefined'?WATER_Y+1:1)){best=d;cx=x;cy=y;}}
    cam.x=cx;cam.y=cy;orthoSpan=distTarget=300;
    if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    const raptor=TYPES.findIndex(T=>T&&T.name==='Raptor');
    const a=spawnUnit(raptor,0,cx-55,cy),b=spawnUnit(raptor,1,cx+65,cy+35);
    uhp[a]=uhpm[a]*.14;uhp[b]=0;umov[a]=umov[b]=1;uang[a]=Math.PI*.5;uang[b]=Math.PI*1.2;
    for(let n=0;n<8;n++){tick++;emitAirSmoke(a,TYPES[raptor],false);}
    const orgBefore=orgfxCount();beginAirCrash(b);
    for(let n=0;n<5;n++){tick++;airCrashTick(b,.06);render(1/60);}
    let airbornePuffs=0;for(let i=0;i<MAXPART;i++)if(flife[i]>0&&fzh[i]>0)airbornePuffs++;
    const mid={a,b,crashing:!!uCrash[b],alive:!!ualive[b],alt:ualt[b],airbornePuffs,fCount,gpfxLive,org:orgfxCount()};
    return {mid,orgBefore,raptor,particleCap:MAXPART,renderer:{...macroFxTelemetry()}};
  });
  check('damaged aircraft trail uses elevated bounded puffs',air.mid.airbornePuffs>0&&air.mid.airbornePuffs<80&&air.mid.fCount<air.particleCap,JSON.stringify(air.mid));
  /* Existing organic droplets may expire while the aircraft scene advances.
     The mechanical crash contract is no NEW ichor, so a decreasing count is
     valid and an increasing count is the only failure. */
  check('mechanical aircraft crash does not emit ichor',air.mid.org<=air.orgBefore,`${air.orgBefore} -> ${air.mid.org}`);
  check('air-vehicle destruction enters visible crash state',air.mid.alive&&air.mid.crashing&&air.mid.alt>0,JSON.stringify(air.mid));
  await capturePng(page,'05-damaged-aircraft-crash-trails.png');
  const impact=await page.evaluate(()=>{
    let b=-1;for(let i=0;i<unitHigh;i++)if(ualive[i]&&uCrash[i]){b=i;break;}
    let steps=0;while(b>=0&&ualive[b]&&steps++<160){tick++;airCrashTick(b,.04);render(1/60);}
    for(let n=0;n<5;n++){if(typeof updParticles==='function')updParticles(.025);render(.025);}
    const particleTypes={};
    for(let i=0;i<MAXPART;i++)if(flife[i]>0)particleTypes[ftype[i]]=(particleTypes[ftype[i]]||0)+1;
    const pieces=[];
    if(typeof MFPhys!=='undefined')MFPhys.forEach((id,v)=>pieces.push({
      id,x:v.x,y:v.y,z:v.z,vx:v.vx,vy:v.vy,vz:v.vz,
      speed:Math.hypot(v.vx,v.vy,v.vz),hx:v.hx,hy:v.hy,hz:v.hz,
      r:v.r,g:v.g,b:v.b,trail:v.trail
    }));
    const cx=b>=0?ux[b]:0,cy=b>=0?uy[b]:0;
    const nearbyWrecks=wrecks.filter(W=>dist2(W.x,W.y,cx,cy)<70*70).map(W=>({
      x:W.x,y:W.y,s:W.s,kind:W.kind,style:W.style||'',mass:W.mass,energy:W.en
    }));
    const nearbyRocks=rocks.filter(R=>dist2(R.x,R.y,cx,cy)<70*70).map(R=>({x:R.x,y:R.y,s:R.s}));
    return {slot:b,alive:b>=0?!!ualive[b]:false,steps,org:orgfxCount(),particleTypes,pieces,nearbyWrecks,nearbyRocks,
      macro:JSON.parse(JSON.stringify(mfMacroFxTelemetry()))};
  });
  check('air-vehicle crash resolves to impact destruction',impact.slot>=0&&!impact.alive&&impact.steps<160,JSON.stringify(impact));
  check('air crash uses only its macro core/ring and bounded dark ballistic debris',
    !(impact.particleTypes[4]||0)&&impact.pieces.length>=1&&impact.pieces.length<=3&&
    impact.pieces.every(p=>p.trail&&p.speed>45&&Math.max(p.hx,p.hy,p.hz)/Math.max(.001,Math.min(p.hx,p.hy,p.hz))>=1.5&&
      p.z>0&&Number.isFinite(p.vz))&&impact.macro.last&&impact.macro.last.weaponClass==='aircrash'&&
    impact.nearbyWrecks.every(W=>W.style==='aircrash'),
    JSON.stringify({particleTypes:impact.particleTypes,pieces:impact.pieces,nearbyWrecks:impact.nearbyWrecks,nearbyRocks:impact.nearbyRocks}));
  await capturePng(page,'06-aircraft-impact-destruction.png');
  /* Layer-isolation captures use the SAME live crash after its normal evidence
     frame. They are diagnostic only: no source, recipe, timing or frame state
     is altered before 06. Removing the public rigid group, then the public
     shockwave, lets art review identify a peripheral shape's real owner rather
     than attributing it to the volume by eye. The next test resets the world. */
  const airNoRigid=await page.evaluate(()=>{
    const before={volume:{...volFxTelemetry()},shock:{...MF_SW_TELEM},physics:MFPhys.stats()};
    MFPhys.enable(false);render(0);
    return {before,after:{volume:{...volFxTelemetry()},shock:{...MF_SW_TELEM},physics:MFPhys.stats()}};
  });
  await capturePng(page,'06a-aircraft-impact-no-rigid-debris.png');
  const airVolumeOnly=await page.evaluate(()=>{
    mfShockwaveReset();
    /* The normal mesh pass suppresses its armed legacy type-3 ring only after
       presenting the real annulus. Resetting that pass for this diagnostic
       intentionally exposes the fallback, which would make a supposed
       "volume only" image lie. Remove that one armed legacy ring as well;
       this happens only after normal 06 has already been captured. */
    let legacyRings=0;
    for(let i=0;i<MAXPART;i++)if(flife[i]>0&&ftype[i]===3){flife[i]=0;legacyRings++;}
    render(0);
    const out={volume:{...volFxTelemetry()},shock:{...MF_SW_TELEM},physics:MFPhys.stats(),legacyRings};
    MFPhys.enable(true);
    return out;
  });
  await capturePng(page,'06b-aircraft-impact-volume-only.png');

  const shield=await page.evaluate(()=>{
    shieldFxReset();fogOn=false;const cx=cam.x,cy=cam.y;
    const piercingBefore=shieldFxTelemetry();
    const piercingAccepted=mfShieldHit(cx,cy,0,26,1,0,'pierce',undefined,true);
    const piercingAfter=shieldFxTelemetry();
    const accepted=mfShieldHit(cx,cy,0,28,1,0,'visible',undefined,false);
    const state=()=>({vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),arr:gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      blend:gl.isEnabled(gl.BLEND),cull:gl.isEnabled(gl.CULL_FACE),depth:gl.isEnabled(gl.DEPTH_TEST),
      mask:gl.getParameter(gl.DEPTH_WRITEMASK),func:gl.getParameter(gl.DEPTH_FUNC),
      sr:gl.getParameter(gl.BLEND_SRC_RGB),dr:gl.getParameter(gl.BLEND_DST_RGB),sa:gl.getParameter(gl.BLEND_SRC_ALPHA),da:gl.getParameter(gl.BLEND_DST_ALPHA)});
    render(0);const pre=state();shieldFxDraw(0,0);const post=state(),visible=shieldFxTelemetry();
    const oldFog=window.fogPointVisible;window.fogPointVisible=()=>false;fogOn=true;
    mfShieldHit(cx+5,cy+5,1,24,1,0,'fogged',undefined,false);shieldFxDraw(0,0);const fogged=shieldFxTelemetry();
    window.fogPointVisible=oldFog;fogOn=false;shieldFxDraw(0,0);const restored=shieldFxTelemetry();
    const same=Object.keys(pre).every(k=>pre[k]===post[k]);
    return {piercingAccepted,piercingBefore,piercingAfter,accepted,pre,post,same,visible,fogged,restored};
  });
  check('shield piercing hit is suppressed',!shield.piercingAccepted&&shield.piercingAfter.acceptedHits===shield.piercingBefore.acceptedHits,JSON.stringify(shield));
  check('shield draw restores GL state',shield.same,JSON.stringify({pre:shield.pre,post:shield.post}));
  check('shield fog suppresses enemy contact and restoration recovers it',shield.visible.hits>=1&&shield.fogged.hits===shield.visible.hits&&shield.restored.hits===shield.visible.hits+1,JSON.stringify({visible:shield.visible,fogged:shield.fogged,restored:shield.restored}));
  const shieldVisual=await page.evaluate(()=>{
    resetWorld();paused=true;fogOn=false;shieldFxReset();if(typeof volFxClear==='function')volFxClear();if(typeof orgfxReset==='function')orgfxReset();
    let cx=MAP*.5,cy=MAP*.5,best=-1;
    for(let y=MAP*.22;y<=MAP*.78;y+=150)for(let x=MAP*.22;x<=MAP*.78;x+=150){let d=420;
      if(typeof blds!=='undefined')for(const B of blds)if(B&&B.alive)d=Math.min(d,Math.hypot(B.x-x,B.y-y));
      if(d>best&&terrainH(x,y)>(typeof WATER_Y!=='undefined'?WATER_Y+1:1)){best=d;cx=x;cy=y;}}
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.18;camPitch=pitchTarget=1.10;orthoSpan=distTarget=310;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    const bulwark=TYPES.findIndex(T=>T&&T.name==='Bulwark');
    const source=spawnUnit(bulwark,0,cx,cy);ushielded[source]=1;umov[source]=0;
    const radius=(typeof SHIELD_R==='number'?SHIELD_R:95)*.72;
    const height=terrainH(cx,cy)+radius*.58;
    const accepted=mfShieldHit(cx,cy,0,radius,1,0,'visual-shield',height,false);
    shieldFxTick(.17);render(0);
    return {source,bulwark,accepted,point:[cx,cy],clearance:best,telemetry:{...shieldFxTelemetry()}};
  });
  check('shield-only proof contains one source and one readable contact',shieldVisual.accepted&&shieldVisual.telemetry.domes===1&&shieldVisual.telemetry.hits===1,JSON.stringify(shieldVisual));
  await capturePng(page,'07-shield-restored-visible.png');

  /* Cover the two commander paths that previously emitted point sprays. The
     cluster recipe is exercised live behind a trap, while EMP is statically
     audited from the loaded runtime function because firing it requires a
     player-owned commander/module state unrelated to this renderer probe. */
  const commanderAudit=await page.evaluate(()=>{
    const oldFaction=playerFaction,oldSpray=typeof gpfxEnergyBlast==='function'?gpfxEnergyBlast:null;
    let forbiddenCalls=0;
    gpfxEnergyBlast=()=>{forbiddenCalls++;};
    playerFaction='nova';mfMacroFxResetTelemetry();
    fireBlast(cam.x,cam.y);
    const telemetry=JSON.parse(JSON.stringify(mfMacroFxTelemetry()));
    const empSource=String(tryAbility),clusterSource=String(fireBlast);
    playerFaction=oldFaction;if(oldSpray)gpfxEnergyBlast=oldSpray;
    return {forbiddenCalls,telemetry,
      staticForbidden:/gpfxEnergyBlast\s*\(/.test(empSource)||/gpfxEnergyBlast\s*\(/.test(clusterSource),
      empBounded:/if\s*\(k===4\)[\s\S]*mfEmitMacroFx\s*\(MF_MACRO_FX_SHIELD/.test(empSource),
      clusterBounded:/mfEmitMacroFx\s*\(MF_MACRO_FX_EXPLOSIVE/.test(clusterSource)};
  });
  const commanderEvents=commanderAudit.telemetry.events.filter(e=>e.kind!=='forbidden-gpu');
  check('commander EMP/cluster paths contain no GPU point spray',commanderAudit.forbiddenCalls===0&&!commanderAudit.staticForbidden,JSON.stringify(commanderAudit));
  check('commander EMP/cluster delegate to bounded macro recipes',commanderAudit.empBounded&&commanderAudit.clusterBounded&&commanderEvents.length===1&&commanderEvents[0].kind==='explosive'&&commanderEvents[0].layers<=3,JSON.stringify(commanderAudit));

  check('no page errors',pageErrors.length===0,pageErrors.join(' | ')||'none');
  /* Human-reviewed alongside the numeric gates. These observations are kept
     in the evidence report so a green emitter contract is never mistaken for
     an art-quality approval. */
  const visualAudit={
    terrain:{status:'fail-art',evidence:'01-terrain-authored-ready.png',finding:'Material set is technically ready, but the megacity view is a low-contrast repetitive grey grid; large square roof stamps and bright block borders read as placeholder tiles, with weak scale/material separation.'},
    missilesBeams:{status:'fail-art',evidence:'03-missiles-beams-termini.png',finding:'Five missiles plus three beams remain bounded, but additive sheaths/termini saturate to broad white-cyan columns and discs that erase terrain and projectile silhouettes.'},
    organic:{status:'needs-art',evidence:'04-organic-ichor-hit-death.png',finding:'Caste hues separate, but the splats read as soft luminous orbs; wet footprint, directional streak, and dark-edge/body breakup are too weak at tactical zoom.'},
    damagedAircraft:{status:'needs-art',evidence:'05-damaged-aircraft-crash-trails.png',finding:'Aircraft silhouettes remain strong and smoke is elevated, but the dark puffs expose square/low-resolution edges and the normal damaged trail is sparse/discontinuous.'},
    airDestruction:{status:'needs-art',evidence:'06-aircraft-impact-destruction.png',finding:'Impact timing is readable, but the smoke/fire body has obvious overlapping billboard lobes and blocky edges; debris slabs remain pale/placeholder-like.'},
    directImpact:{status:'review-fresh-capture',evidence:'02a-direct-impact-volume-high.png',finding:'High uses one dedicated depth-clipped VOL_IMPACT density field; inspect the capture for a compact world-space crown, terrain/hull intersection, and absence of the armed card.'},
    macroFx:{status:'review-fresh-capture',evidence:'02-macro-volume-high.png + 02b-macro-v4-fallback.png',finding:'High/Cinematic use one textured depth-aware raymarched core; Low/Medium and any failed high-tier pass reveal exactly one v4 hot-core/fire-soot/smoke fallback. Both retain one shock annulus and one bounded rigid-debris group.'},
    bombardment:{status:'review-fresh-capture',evidence:'02f-bombard-impact-early.png + 02g-bombard-impact-fire-soot.png + 02h-bombard-crater-aftermath.png',finding:'Real projImpact path; verify the core occupies most of the new crater, the annulus clears its rim, the 1-3 non-cubic velocity-trailed bodies clear the core, and the expired volume reveals dark no-grass clinker with sparse emissive coals.'},
    shield:{status:'contract-only',evidence:'07-shield-restored-visible.png',finding:'Fog, piercing, and GL restoration pass. This frame is contaminated by lingering crash fire, so it is not sufficient as a standalone shield art-quality approval.'}
  };
  check('all evidence PNGs decode with nonzero variance',captureValidation.length===17&&captureValidation.every(row=>row.signature==='89504e470d0a1a0a'&&row.variance>4),JSON.stringify(captureValidation));
  const report={generatedAt:new Date().toISOString(),gpu,checks,terrain,combatAtlases,macro,macroVisual,macroFailure,macroLow,bombardEarly,bombardAfter,strategicEarly,strategicSmoke,strategicAfter,projectileBeam,organic,air,impact,airNoRigid,airVolumeOnly,shield,shieldVisual,commanderAudit,visualAudit,captureValidation,
    screenshots:['01-terrain-authored-ready.png','02-macro-volume-high.png','02a-direct-impact-volume-high.png','02b-macro-v4-fallback.png',
      '02f-bombard-impact-early.png','02g-bombard-impact-fire-soot.png','02h-bombard-crater-aftermath.png',
      '02c-strategic-ignition-shock-debris.png','02d-strategic-fire-soot-smoke.png','02e-strategic-char-crater-aftermath.png','03-missiles-beams-termini.png',
      '04-organic-ichor-hit-death.png','05-damaged-aircraft-crash-trails.png','06-aircraft-impact-destruction.png',
      '06a-aircraft-impact-no-rigid-debris.png','06b-aircraft-impact-volume-only.png','07-shield-restored-visible.png'],pageErrors};
  await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2));
  if(checks.some(c=>!c.pass))process.exitCode=1;
}finally{
  /* The shared helper owns the exact Chrome PID. Bound CDP shutdown so a
     wedged browser cannot strand the evidence process or another GPU agent. */
  await Promise.race([closePwBrowser(),new Promise(resolve=>setTimeout(resolve,3000))]);
  await new Promise(resolve=>server.close(resolve));
}
console.log(`evidence ${outDir}`);
process.exit(process.exitCode||0);
