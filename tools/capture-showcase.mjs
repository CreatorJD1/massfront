#!/usr/bin/env node
/* Showcase capture — explosions, clouds/sky, terrain and world detail.
   Shot at the DEVICE'S perfScale (0.4125), on a real GPU, and deliberately
   from LOW GRAZING angles as well as top-down: a weak effect looks acceptable
   from directly above and falls apart from the side.

   Usage:  node tools/capture-showcase.mjs
   Output: .tmp/showcase/
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = join(root, '.tmp', 'showcase');
await mkdir(outDir, { recursive: true });

const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg',
  '.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.webmanifest':'application/manifest+json','.wasm':'application/wasm' };
const server = createServer(async (req,res)=>{
  try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]); if(p==='/')p='/index.html';
    const file=resolve(join(root,p));
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  }catch{res.writeHead(404);res.end('nf');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';

const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await launchPwBrowser({
  executablePath: existsSync(chrome)?chrome:undefined, headless:true,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});

const boot=()=>{
  try{ if(typeof apClose==='function') apClose(); }catch(e){}
  try{ if(typeof apGateSatisfied==='function') apGateSatisfied(); }catch(e){}
  try{ if(typeof stopAttract==='function') stopAttract(); }catch(e){}
  document.body.classList.add('mfIntroDone');
  for(const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay']){
    const el=document.getElementById(id); if(el) el.style.setProperty('display','none','important');
  }
  document.querySelectorAll('.mfTitleReveal').forEach(el=>el.style.setProperty('display','none','important'));
};

const log=[]; const say=m=>{log.push(m);console.log(m);};

try{
  const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1.5,colorScheme:'dark'});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message.slice(0,220)));
  await page.addInitScript(()=>{ try{
    localStorage.setItem('mf_ap_gate_closed','1'); localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1'); localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){} });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});

  const gpu=await page.evaluate(()=>{ const c=document.createElement('canvas'),g=c.getContext('webgl2');
    if(!g) return 'NO-WEBGL2'; const d=g.getExtension('WEBGL_debug_renderer_info');
    return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):String(g.getParameter(g.RENDERER)); });
  say('GPU: '+gpu);
  if(/swiftshader|llvmpipe|lavapipe/i.test(String(gpu))) say('*** SOFTWARE RASTERISER - shading not representative ***');

  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof render==='function'&&
    typeof resetWorld==='function'&&typeof spawnExplosion==='function',{timeout:120000});
  await page.waitForTimeout(500);
  await page.evaluate(boot);
  await page.waitForFunction(()=>typeof heightF!=='undefined'&&heightF&&typeof terrainTex!=='undefined'&&terrainTex,
    {timeout:90000}).catch(()=>{});

  const setup=await page.evaluate(()=>{
    try{ stopAttract(); }catch(e){}
    attractOn=false; demoMode=false; matchLive=true; fogOn=false;
    running=true; paused=false; gameEnded=false;
    if(typeof META!=='undefined'&&META.settings){
      META.settings.fog=false; META.settings.dayNight=false; META.settings.quality='medium';
    }
    if(typeof applySettings==='function') applySettings();
    dayT=0.30;
    resetWorld();
    playerFaction='nova';
    /* the device's value, pinned AFTER applySettings so nothing overwrites it */
    perfScale=0.4125;
    if(typeof GFX!=='undefined'){ GFX.particles=0.75; GFX.fxFloor=0.35; }
    const cv=document.getElementById('gl');
    for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch','apOverlay','setupScr','startScreen']){
      const e=document.getElementById(id); if(e) e.style.setProperty('display','none','important');
    }
    document.body.classList.remove('menuMode','mfMenuOpen');
    for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block'; cv.style.position='fixed'; cv.style.inset='0';
    cv.style.width='100vw'; cv.style.height='100vh';
    camFollow=-1;
    if(typeof resize==='function') resize();
    return { perfScale, dayT };
  });
  say('perfScale='+setup.perfScale+' (device value), dayT='+setup.dayT);

  const step=async n=>{ for(let k=0;k<n;k++) await page.evaluate(()=>{
    const dt=1/30;
    try{unitTick(dt);}catch(e){} try{projTick(dt);}catch(e){} try{beamTick(dt);}catch(e){}
    try{ if(typeof bldTick==='function') bldTick(dt); }catch(e){}
    try{ if(typeof updParticles==='function') updParticles(dt); }catch(e){}
    try{ if(typeof shardTick==='function') shardTick(dt); }catch(e){}
    try{ if(typeof weatherTick==='function') weatherTick(dt); }catch(e){}
    try{ if(typeof skyTick==='function') skyTick(dt); }catch(e){}
    render(dt);
  }); };

  const cam0=async(x,y,pitch,span,yaw)=>page.evaluate(a=>{
    cam.x=a.x; cam.y=a.y; camFollow=-1;
    camYaw=yawTarget=(a.yaw!=null?a.yaw:0.35);
    camPitch=pitchTarget=a.pitch;
    orthoSpan=distTarget=a.span;
    if(typeof clampCam==='function') clampCam();
    if(typeof camUpdateMatrices==='function') camUpdateMatrices();
    return {x:cam.x,y:cam.y};
  },{x,y,pitch,span,yaw});

  /* pick open, non-city ground once and reuse it */
  const ground=await page.evaluate(()=>{
    for(let r=200;r<MAP*0.45;r+=90){
      for(let a=0;a<12;a++){
        const x=MAP*0.5+Math.cos(a*0.523)*r, y=MAP*0.5+Math.sin(a*0.523)*r;
        if(x<300||y<300||x>MAP-300||y>MAP-300) continue;
        const civic=typeof cityGroundAt==='function'&&cityGroundAt(x,y)>=1;
        if(!civic&&isWalkable(x,y)) return [x,y];
      }
    }
    return [MAP*0.5,MAP*0.5];
  });
  say('open ground: '+Math.round(ground[0])+','+Math.round(ground[1]));
  const MAPW=await page.evaluate(()=>MAP);   // MAP is a PAGE global; using it
  say('MAP='+MAPW+' (fetched from the page - it is not a Node global)');

  await step(6);

  /* ---------- 1. EXPLOSIONS, low grazing angle ---------------------------- */
  await cam0(ground[0],ground[1],1.06,220,0.4);
  await page.evaluate(g=>{
    spawnExplosion(g[0]-55,g[1]+10,34,0);
    spawnExplosion(g[0]+50,g[1]-20,22,1);
    spawnExplosion(g[0]+5 ,g[1]+55, 9,1);
  },ground);
  await step(9);
  await page.screenshot({path:join(outDir,'1-explosions-low-angle.png')});
  say('shot 1: explosions, LOWEST allowed angle (PITCH_MIN 1.05) (sz 34 / 22 / 9)');

  /* ---------- 2. same blast, top-down, for comparison --------------------- */
  await cam0(ground[0],ground[1],1.45,220,0.4);
  await page.evaluate(g=>{ spawnExplosion(g[0]-55,g[1]+10,34,0); spawnExplosion(g[0]+50,g[1]-20,22,1); },ground);
  await step(9);
  await page.screenshot({path:join(outDir,'2-explosions-top-down.png')});
  say('shot 2: explosions, overhead (same blasts)');

  /* ---------- 3. SKY + CLOUDS, horizon ------------------------------------ */
  const sky=await page.evaluate(()=>{
    dayT=0.24;                                  // low sun, clouds catch light
    if(typeof applySettings==='function') applySettings();
    return { dayT, hasSky: typeof skyTick==='function', clouds: (typeof CLOUDS!=='undefined'&&CLOUDS)?CLOUDS.length:'n/a' };
  });
  say('sky: dayT='+sky.dayT+' skyTick='+sky.hasSky+' clouds='+sky.clouds);
  await cam0(ground[0],ground[1],1.05,520,0.9);   // very grazing: horizon in frame
  await step(14);
  await page.screenshot({path:join(outDir,'3-sky-clouds-horizon.png')});
  say('shot 3: sky and clouds at the horizon (grazing)');

  /* ---------- 4. TERRAIN VISTA -------------------------------------------- */
  await page.evaluate(()=>{ dayT=0.32; if(typeof applySettings==='function') applySettings(); });
  await cam0(MAPW*0.5,MAPW*0.5,1.24,900,0.55);
  await step(10);
  await page.screenshot({path:join(outDir,'4-terrain-vista.png')});
  say('shot 4: terrain vista (wide, low sun)');

  /* ---------- 5. TERRAIN CLOSE-UP, ground material ------------------------ */
  await cam0(ground[0],ground[1],1.10,70,0.3);
  await step(5);
  await page.screenshot({path:join(outDir,'5-ground-closeup.png')});
  say('shot 5: ground close-up (detail / material)');

  /* ---------- 6. WORLD DETAIL: city + infrastructure ---------------------- */
  const city=await page.evaluate(()=>{
    let best=null;
    for(let r=120;r<MAP*0.45&&!best;r+=70){
      for(let a=0;a<16;a++){
        const x=MAP*0.5+Math.cos(a*0.393)*r, y=MAP*0.5+Math.sin(a*0.393)*r;
        if(x<250||y<250||x>MAP-250||y>MAP-250) continue;
        if(typeof cityGroundAt==='function'&&cityGroundAt(x,y)>=1){ best=[x,y]; break; }
      }
    }
    return best||[MAP*0.5,MAP*0.5];
  });
  await cam0(city[0],city[1],1.08,260,0.6);
  await step(6);
  await page.screenshot({path:join(outDir,'6-world-city-infrastructure.png')});
  say('shot 6: city / infrastructure at '+Math.round(city[0])+','+Math.round(city[1]));

  /* ---------- 7. WATER + SHORELINE, low angle ----------------------------- */
  const water=await page.evaluate(()=>{
    const wet=(x,y)=>{ const ix=Math.max(0,Math.min(TS-1,(x/MAP*TS)|0)), iy=Math.max(0,Math.min(TS-1,(y/MAP*TS)|0));
      return heightF[iy*TS+ix]<WATER_H; };
    /* a SHORE point: wet with dry land within ~80 units */
    for(let y=200;y<MAP-200;y+=40) for(let x=200;x<MAP-200;x+=40){
      if(!wet(x,y)) continue;
      for(let a=0;a<8;a++){
        const px=x+Math.cos(a*0.785)*80, py=y+Math.sin(a*0.785)*80;
        if(!wet(px,py)) return [x,y];
      }
    }
    return null;
  });
  if(water){
    await cam0(water[0],water[1],1.05,300,0.7);
    await step(8);
    await page.screenshot({path:join(outDir,'7-water-shoreline-low.png')});
    say('shot 7: water + shoreline, LOW angle at '+Math.round(water[0])+','+Math.round(water[1]));
  } else say('shot 7 SKIPPED: no shoreline found on this map');

  say('');
  say('page errors: '+(errs.length?errs.slice(0,5).join(' | '):'none'));
  await writeFile(join(outDir,'log.txt'),log.join('\n'),'utf8');
  await page.close();
}catch(e){
  say('FATAL '+e.message);
  await writeFile(join(outDir,'log.txt'),log.join('\n'),'utf8');
}finally{
  await closePwBrowser();
  server.close();
}
console.log('output: '+outDir);
