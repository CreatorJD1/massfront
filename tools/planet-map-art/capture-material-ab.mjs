#!/usr/bin/env node
/* Source-matched ANGLE/D3D11 proof for the planet-map-v2 candidate sheets.

   This does not mutate source or save data. It stages the same deterministic
   map/camera twice, then replaces the live grass or soil texture contents in
   the QA page only. A before/after pair therefore proves renderer behavior
   without silently promoting an unapproved material into gameplay. */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PW_CDP_PORT ||= '9491';
const { launchPwBrowser, closePwBrowser } = await import('../pw-browser.mjs');
const { assertHardwareGpu } = await import('../chrome-gpu.mjs');

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outDir = join(root, 'tools', 'planet-map-art', 'evidence');
await mkdir(outDir, { recursive: true });
const MIME = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg',
  '.wav':'audio/wav','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.webmanifest':'application/manifest+json'};
const server = createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent((req.url||'/').split('?')[0]);if(pathname==='/')pathname='/index.html';
  const file=resolve(join(root,pathname));
  if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(await readFile(file));
}catch(e){res.writeHead(404);res.end('not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/?planetMapArtAB=1`;

const CASES=[
  {slug:'verdant-highland',map:'aelos_basin_small',slot:'grass',promoted:false,
    albedo:'/assets/textures/terrain/planet-map-v2/verdant-highland-albedo-v2.webp',
    normal:'/assets/textures/terrain/planet-map-v2/verdant-highland-normal-rough-v2.webp',
    legacyAlbedo:'/assets/terrain/grass-albedo.webp',
    legacyNormal:'/assets/terrain/grass-normal-rough.webp'},
  {slug:'ashland-basalt',map:'pyraeth_crater_large',slot:'soil',promoted:true,
    albedo:'/assets/textures/terrain/planet-map-v2/ashland-basalt-albedo-v2.webp',
    normal:'/assets/textures/terrain/planet-map-v2/ashland-basalt-normal-rough-v2.webp',
    legacyAlbedo:'/assets/terrain/locations/ashland-basalt-albedo-v1.webp',
    legacyNormal:'/assets/terrain/locations/ashland-basalt-normal-rough-v1.webp'}
];
const digest=b=>createHash('sha256').update(b).digest('hex');
const report={schema:'massfront-planet-map-art-ab-v1',url,viewport:{width:412,height:915,deviceScaleFactor:2},cases:[],pageErrors:[]};
report.candidateAssets={};
for(const spec of CASES){
  report.candidateAssets[spec.slug]={};
  for(const key of ['albedo','normal']){
    const path=join(root,spec[key].replace(/^\//,'')), bytes=await readFile(path);
    report.candidateAssets[spec.slug][key]={path,bytes:bytes.length,sha256:digest(bytes)};
  }
}
async function injectPair(page,spec,albedoUrl,normalUrl){
  return page.evaluate(async ({slot,albedoUrl,normalUrl})=>{
    const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('decode failed: '+src));im.src=src;});
    const [albedo,normal]=await Promise.all([load(albedoUrl),load(normalUrl)]);
    const target=slot==='grass'?terrGrassTex:terrSoilTex;
    const targetN=slot==='grass'?terrGrassNrm:terrSoilNrm;
    const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);
    const upload=(tex,im)=>{gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,im);
      gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);if(typeof mfTerrainAniso==='function')mfTerrainAniso();};
    upload(target,albedo);upload(targetN,normal);gl.bindTexture(gl.TEXTURE_2D,bound);gl.activeTexture(active);
    if(typeof render==='function')render(0);
    return {albedo:[albedo.naturalWidth,albedo.naturalHeight],normal:[normal.naturalWidth,normal.naturalHeight],
      texture:__mfTexSize(target),normalTexture:__mfTexSize(targetN),glError:gl.getError()};
  },{slot:spec.slot,albedoUrl,normalUrl});
}

const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu',
    '--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,
    colorScheme:'dark',userAgent:'Mozilla/5.0 (Linux; Android 15; MASSFRONT terrain QA) AppleWebKit/537.36 Chrome/136 Mobile Safari/537.36'});
  page.on('pageerror',e=>report.pageErrors.push(e.stack||e.message));
  await page.addInitScript(()=>{
    const dims=new WeakMap();globalThis.__mfTexSize=tex=>dims.get(tex)||null;
    for(const C of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext]){
      if(!C||C.prototype.texImage2D.__mfPlanetWrapped)continue;
      const original=C.prototype.texImage2D;
      const wrapped=function(...args){const result=original.apply(this,args),tex=this.getParameter(this.TEXTURE_BINDING_2D);let w=0,h=0;
        if(args.length>=9){w=+args[3]||0;h=+args[4]||0;}else{const src=args[5];w=src&&(src.videoWidth||src.naturalWidth||src.width)||0;h=src&&(src.videoHeight||src.naturalHeight||src.height)||0;}
        if(tex&&w>0&&h>0)dims.set(tex,[w,h]);return result;};
      wrapped.__mfPlanetWrapped=true;C.prototype.texImage2D=wrapped;
    }
    try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_offline','1');}catch(e){}
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  const gpu=await assertHardwareGpu(page);report.gpu=gpu;
  await page.addStyleTag({content:'body.mfPlanetEvidence > *:not(#gl):not(script):not(style){display:none!important} #mfPreAlphaIntro,#mfBootCover,#apOverlay{display:none!important}'});
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof applyTheme==='function'&&typeof gl!=='undefined'&&gl,null,{timeout:90000});

  for(const spec of CASES){
    await page.evaluate(map=>{
      const skip=document.getElementById('mfIntroSkip');if(skip)skip.click();
      document.body.classList.add('mfIntroDone','mfPlanetEvidence');
      if(typeof apGateSatisfied==='function')try{apGateSatisfied();}catch(e){}
      META.settings.quality='cinematic';META.settings.gfxOver={};applyQualityPreset();
      if(typeof matchSetupArmed!=='undefined')matchSetupArmed=false;
      activeWarMode='qa';const def=MAPDEFS[map];curMap=map;curRegionId=def.region||map;curTheme=def.theme||'verdant';
      if(def.size&&typeof battlefieldPresetKey==='function')battlefieldPreset=battlefieldPresetKey(def.size);
      builtMap='';hideFrontScreens();applyTheme();newSkirmish();activeWarMode='qa';
    },spec.map);
    await page.waitForFunction(map=>curMap===map&&heightF&&PASS&&terrainTex&&typeof mfTerrainMaterialsReady==='function'&&
      mfTerrainMaterialsReady()&&terrTexThemePending===null,spec.map,{timeout:120000});
    const staged=await page.evaluate(({map,slot})=>{
      try{stopAttract();hideFrontScreens();}catch(e){}
      document.body.classList.remove('menuMode','mfMenuOpen');document.body.classList.add('mfPlanetEvidence');
      for(const id of ['mfPreAlphaIntro','mfBootCover','apOverlay','pauseOverlay','gameOver','levelUp','loadScr','dispatch','setupScr','startScreen','toast','coach']){
        const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
      }
      demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;gameEnded=false;
      if(carrier){carrier.active=false;carrier.phase=2;}
      /* Pick evidence from the material actually under test. A city-distance
         heuristic alone is insufficient because authored yards and roads can
         extend far beyond a city's origin. The R8 ground mask is the same
         hardscape authority used by the terrain shader, while macro green is
         the shader's grass semantic. Read each canvas once so the search does
         not turn into thousands of synchronous getImageData calls. */
      const maskW=groundMaskCanvas.width, macroW=terrainCanvas.width;
      const maskPx=groundMaskCanvas.getContext('2d',{willReadFrequently:true})
        .getImageData(0,0,maskW,maskW).data;
      const macroPx=terrainCanvas.getContext('2d',{willReadFrequently:true})
        .getImageData(0,0,macroW,macroW).data;
      const sample=(buf,w,x,y)=>{const px=Math.max(0,Math.min(w-1,Math.floor(x/MAP*w)));
        const py=Math.max(0,Math.min(w-1,Math.floor(y/MAP*w)));return buf[(py*w+px)*4];};
      const sampleRgb=(buf,w,x,y)=>{const px=Math.max(0,Math.min(w-1,Math.floor(x/MAP*w)));
        const py=Math.max(0,Math.min(w-1,Math.floor(y/MAP*w))),i=(py*w+px)*4;
        return [buf[i],buf[i+1],buf[i+2]];};
      let best=null, eligible=0;
      for(let y=520;y<MAP-520;y+=150)for(let x=520;x<MAP-520;x+=150){
        const h=terrainH(x,y);if(h<7)continue;
        const hardMask=sample(maskPx,maskW,x,y);if(hardMask>5)continue;
        const rgb=sampleRgb(macroPx,macroW,x,y), green=rgb[1]-Math.max(rgb[0],rgb[2]);
        if(slot==='grass'&&green<10)continue;
        if(slot==='soil'&&green>3)continue;
        let city=99999;for(const z of cityZones||[])city=Math.min(city,Math.hypot(x-z.x,y-z.y));if(city<420)continue;
        eligible++;
        const d=22,rough=Math.abs(terrainH(x-d,y)-terrainH(x+d,y))+Math.abs(terrainH(x,y-d)-terrainH(x,y+d));
        const score=rough+Math.abs(h-20)*0.08+(Math.abs(x-MAP*.5)+Math.abs(y-MAP*.5))*.0002;
        if(!best||score<best.score)best={x,y,h,score,hardMask,macroRgb:rgb,greenSemantic:green};
      }
      if(!best)throw new Error('No natural '+slot+' evidence site found for '+map);
      best.eligibleSites=eligible;
      cam.x=best.x;cam.y=best.y;camFollow=-1;camYaw=yawTarget=.66;camPitch=pitchTarget=1.12;orthoSpan=distTarget=420;
      clampCam();camUpdateMatrices();if(typeof resize==='function')resize();
      const target=slot==='grass'?terrGrassTex:terrSoilTex;
      const normal=slot==='grass'?terrGrassNrm:terrSoilNrm;
      const surface=mfTerrainSurfaceSelection();
      const activePaths=slot==='grass'?{albedo:TERRAIN_ART_PATHS.grass,normal:TERRAIN_ART_PATHS.grassN}:
        {albedo:surface.albedo,normal:surface.normal};
      if(typeof render==='function')render(0);
      const dbg=gl.getExtension('WEBGL_debug_renderer_info');
      return {map:curMap,theme:curTheme,surface,activePaths,camera:{x:cam.x,y:cam.y,yaw:camYaw,pitch:camPitch,span:orthoSpan},
        site:best,slot,beforeTexture:__mfTexSize(target),beforeNormal:__mfTexSize(normal),
        renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),glError:gl.getError()};
    },spec);
    await page.waitForTimeout(900);
    const livePath=join(outDir,`${spec.slug}-live-mobile-412x915.png`);
    const live=await page.screenshot({type:'png',animations:'disabled'});await writeFile(livePath,live);

    const legacy=await injectPair(page,spec,spec.legacyAlbedo,spec.legacyNormal);
    await page.waitForTimeout(900);
    const beforePath=join(outDir,`${spec.slug}-before-mobile-412x915.png`);
    const before=await page.screenshot({type:'png',animations:'disabled'});await writeFile(beforePath,before);

    const injected=await injectPair(page,spec,spec.albedo,spec.normal);
    await page.waitForTimeout(900);
    const afterPath=join(outDir,`${spec.slug}-after-mobile-412x915.png`);
    const after=await page.screenshot({type:'png',animations:'disabled'});await writeFile(afterPath,after);
    report.cases.push({slug:spec.slug,promoted:spec.promoted,staged,legacy,injected,
      live:{path:livePath,bytes:live.length,sha256:digest(live)},
      before:{path:beforePath,bytes:before.length,sha256:digest(before)},after:{path:afterPath,bytes:after.length,sha256:digest(after)}});
  }
  report.pass=report.pageErrors.length===0&&report.cases.length===CASES.length&&report.cases.every(c=>
    c.staged.glError===0&&c.legacy.glError===0&&c.injected.glError===0&&
    c.staged.activePaths.albedo.replace(/^\./,'')===(CASES.find(s=>s.slug===c.slug)[CASES.find(s=>s.slug===c.slug).promoted?'albedo':'legacyAlbedo'])&&
    c.staged.activePaths.normal.replace(/^\./,'')===(CASES.find(s=>s.slug===c.slug)[CASES.find(s=>s.slug===c.slug).promoted?'normal':'legacyNormal'])&&
    c.staged.beforeTexture?.[0]===1024&&c.staged.beforeNormal?.[0]===1024&&
    c.injected.texture?.[0]===1024&&c.injected.normalTexture?.[0]===1024&&c.before.sha256!==c.after.sha256);
  await writeFile(join(outDir,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,report:join(outDir,'capture-report.json'),cases:report.cases.map(c=>({slug:c.slug,before:c.before.path,live:c.live.path,after:c.after.path}))},null,2));
  if(!report.pass)process.exitCode=1;
}finally{
  await closePwBrowser(browser);server.close();
}
