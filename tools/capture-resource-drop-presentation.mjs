#!/usr/bin/env node
/*
 * Focused, read-only real-GPU proof for landed resource-cache presentation.
 *
 * It deliberately creates one ordinary site cache through spawnCrate(), then
 * validates the exact render queues at a normal tactical camera.  The source
 * server and Chromium both use private ephemeral/project ports: never point it
 * at a player's live local server or add ?volfxprobe=1.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PW_CDP_PORT ||= '9483';
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const outDir=join(root,'.tmp','resource-drop-presentation',runId);
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{
  let request=decodeURIComponent((req.url||'/').split('?')[0]);if(request==='/')request='/index.html';
  const file=resolve(join(root,request));
  if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(await readFile(file));
}catch{res.writeHead(404);res.end('not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const port=server.address().port;
const url=`http://127.0.0.1:${port}/`;
let browser=null,page=null;
const errors=[];
const report={runId,url,checks:[],errors,output:outDir};
function check(name,pass,evidence){report.checks.push({name,pass:!!pass,evidence});console.log(`${pass?'PASS':'FAIL'} ${name} — ${evidence}`);}

try{
  browser=await launchPwBrowser({headless:true});
  page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  page.on('pageerror',error=>errors.push(String(error&&error.message||error)));
  page.on('console',message=>{if(message.type()==='error')errors.push('console '+message.text());});
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof render==='function'&&typeof spawnCrate==='function'&&typeof FX!=='undefined',null,{timeout:120000});
  await page.waitForFunction(()=>typeof mfTerrainMaterialsReady!=='function'||mfTerrainMaterialsReady(),null,{timeout:90000}).catch(()=>{});
  report.gpu=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'),context=canvas.getContext('webgl2');
    if(!context)return 'NO WEBGL2';
    const ext=context.getExtension('WEBGL_debug_renderer_info');
    return ext?context.getParameter(ext.UNMASKED_RENDERER_WEBGL):String(context.getParameter(context.RENDERER));
  });
  check('hardware WebGL',/ANGLE.*(?:Direct3D11|D3D11)/i.test(report.gpu)&&!/swiftshader|software|llvmpipe/i.test(report.gpu),report.gpu);
  const proof=await page.evaluate(()=>{
    try{if(typeof apClose==='function')apClose();}catch{}
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    for(const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay','pauseOverlay','gameOver','levelUp','dispatch','setupScr','startScreen']){
      const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
    }
    for(const el of [...document.body.children])if(el.id!=='gl')el.style.display='none';
    cv.style.display='block';cv.style.position='fixed';cv.style.inset='0';cv.style.width='100vw';cv.style.height='100vh';
    attractOn=false;demoMode=false;matchLive=true;paused=true;running=true;gameEnded=false;fogOn=false;
    if(META&&META.settings){META.settings.quality='high';META.settings.cine=false;META.settings.fog=false;META.settings.dayNight=false;}
    if(typeof applySettings==='function')applySettings();
    if(typeof GFX!=='undefined')GFX.volSteps=24;
    resetWorld();
    /* Find quiet dry tactical ground with no structure overlap. */
    let best=-Infinity,cx=MAP*.5,cy=MAP*.5;
    for(let y=MAP*.18;y<=MAP*.82;y+=96)for(let x=MAP*.18;x<=MAP*.82;x+=96){
      if(typeof WATER_Y!=='undefined'&&terrainH(x,y)<=WATER_Y+2)continue;
      let clear=Math.min(x,y,MAP-x,MAP-y);
      for(const B of blds)if(B&&B.alive)clear=Math.min(clear,Math.hypot(B.x-x,B.y-y)-((B.r||0)+120));
      if(clear>best){best=clear;cx=x;cy=y;}
    }
    crates.length=0;groundBurns.length=0;craters.length=0;
    const cache=spawnCrate(cx,cy,'supply');
    cache.alt=0;cache.site=true;cache.siteName='CAPTURE CACHE';cache.seen=true;cache.t=0;
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.27;camPitch=pitchTarget=1.10;orthoSpan=distTarget=340;
    if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    render(0); /* Establish the batches before queue instrumentation. */
    const counts={crateMesh:0,badge:0,groundRings:0,coolCompactRings:0,impactLikeRings:0,largeGroundGlows:0,allPickupBillboards:0};
    const ringAdd=FX.ring.add,crateAdd=FX.crate.add,billboardAdd=bbAdd.add;
    FX.ring.add=function(...args){
      if(Math.hypot(args[0]-cache.x,args[1]-cache.y)<.25){
        counts.groundRings++;
        const [, , ,radius,yaw,r,g,b,a]=args;
        if(radius<=16&&yaw===0&&r<=120&&g>=200&&b>=220&&a<=140)counts.coolCompactRings++;
        else counts.impactLikeRings++;
      }
      return ringAdd.apply(this,args);
    };
    FX.crate.add=function(...args){if(Math.hypot(args[0]-cache.x,args[1]-cache.y)<.25)counts.crateMesh++;return crateAdd.apply(this,args);};
    bbAdd.add=function(uv,x,y,h,size,...tail){
      if(Math.hypot(x-cache.x,y-cache.y)<.25){
        counts.allPickupBillboards++;
        if(uv===sprites.glow&&size>=20)counts.largeGroundGlows++;
        if(uv===sprites.crate||uv===sprites.crystal)counts.badge++;
      }
      return billboardAdd.call(this,uv,x,y,h,size,...tail);
    };
    try{render(1/60);}finally{FX.ring.add=ringAdd;FX.crate.add=crateAdd;bbAdd.add=billboardAdd;}
    return {cache:{x:cache.x,y:cache.y,alt:cache.alt,site:cache.site,kind:cache.kind.id,seen:cache.seen},counts,
      aftermath:{groundBurns:groundBurns.length,craters:craters.length},camera:{span:orthoSpan,pitch:camPitch,yaw:camYaw}};
  });
  report.proof=proof;
  check('one live landed site cache',proof.cache.alt===0&&proof.cache.site&&proof.cache.kind==='supply'&&proof.cache.seen,JSON.stringify(proof.cache));
  check('physical collectible crate stays rendered',proof.counts.crateMesh===1,JSON.stringify(proof.counts));
  check('exactly one elevated identity badge stays rendered',proof.counts.badge===1&&proof.counts.allPickupBillboards===1,JSON.stringify(proof.counts));
  check('cache queues exactly one compact cool locator—not an impact ring or large glow',
    proof.counts.groundRings===1&&proof.counts.coolCompactRings===1&&proof.counts.impactLikeRings===0&&proof.counts.largeGroundGlows===0,
    JSON.stringify(proof.counts));
  check('cache creates no crater or burn record',proof.aftermath.groundBurns===0&&proof.aftermath.craters===0,JSON.stringify(proof.aftermath));
  const png=await page.screenshot({type:'png',animations:'disabled'});
  await writeFile(join(outDir,'landed-site-cache.png'),png);
  const signature=png.subarray(0,8).toString('hex');
  check('capture is a valid PNG',signature==='89504e470d0a1a0a',`${png.length} bytes`);
}catch(error){
  errors.push(String(error&&error.stack||error));
}finally{
  await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2));
  await page?.close().catch(()=>{});
  await closePwBrowser().catch(()=>{});
  /* A page that was just handed a screenshot can retain a keep-alive request
     for a short time.  Closing it first and force-closing only this ephemeral
     server's sockets prevents a finished proof from stranding a Node process. */
  if(typeof server.closeAllConnections==='function')server.closeAllConnections();
  await new Promise(resolve=>{
    let done=false,finish=()=>{if(!done){done=true;resolve();}};
    server.close(finish);setTimeout(finish,1200);
  });
}
if(errors.length||report.checks.some(row=>!row.pass)){
  console.error('resource-drop capture: FAIL');process.exitCode=1;
}else console.log(`resource-drop capture: PASS — ${outDir}`);
