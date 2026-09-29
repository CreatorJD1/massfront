#!/usr/bin/env node
/* Bounded packed-runtime capture of natural unitTick rifle fire. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {extname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const packed=join(root,'www'),out=join(root,'.tmp','weapon-fire-packed-20260923');
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sourceFiles=['src/ui/render3d.js','src/game/sim.js','src/engine/billboard.js','src/engine/tacticons.js'];
const parity=sourceFiles.map(file=>({file,sourceSha256:sha(join(root,file)),packedSha256:sha(join(packed,file))}));
if(parity.some(p=>p.sourceSha256!==p.packedSha256))throw new Error('packed weapon-fire source parity failed');
await mkdir(out,{recursive:true});
const guard=await acquireVerificationFreeze({root,label:'packed natural weapon-fire visual',quietMs:5000});
let browser,server,stable=false;
const errors=[];
try{
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
    '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
    '.svg':'image/svg+xml','.glb':'model/gltf-binary','.ktx2':'image/ktx2','.ogg':'audio/ogg','.m4a':'audio/mp4'};
  server=createServer(async(req,res)=>{try{
    const pathname=decodeURIComponent(new URL(req.url||'/', 'http://127.0.0.1').pathname);
    const file=resolve(packed,`.${pathname==='/'?'/index.html':pathname}`),rel=relative(packed,file);
    if(rel.startsWith(`..${sep}`)||rel==='..'||!existsSync(file))throw new Error('not found');
    res.writeHead(200,{'Cache-Control':'no-store','Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('not found');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  const page=await browser.newPage({viewport:{width:412,height:900},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  page.on('pageerror',e=>errors.push({at:new Date().toISOString(),message:String(e.message||e)}));
  await page.route('**/*',route=>{
    if(route.request().url().startsWith(origin+'/'))return route.continue();
    return route.abort();
  });
  await page.addInitScript(()=>{for(const [k,v] of Object.entries({mf_ap_gate_closed:'1',
    mf_ap_dismissed:'1',mf_offline:'1',mf_prealpha_cinematic_v2:'test-seen',mf_auth_gate_v1:'1'}))
    try{localStorage.setItem(k,v);}catch{}});
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:120000});
  const gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof unitTick==='function'&&
    typeof render==='function'&&typeof resetWorld==='function'&&typeof mfProjectileVisualAdmission==='function'&&
    typeof FX==='object'&&!!FX.crystal&&!!FX.ring&&!!FX.beam&&
    typeof terrainTex!=='undefined'&&!!terrainTex&&typeof atlasTex!=='undefined'&&!!atlasTex&&
    typeof bbAdd!=='undefined'&&!!bbAdd,
    null,{timeout:180000,polling:250});
  const readiness=await page.evaluate(()=>({crystal:!!FX.crystal,ring:!!FX.ring,
    beam:!!FX.beam,terrain:!!terrainTex,atlas:!!atlasTex,billboard:!!bbAdd,
    bootCover:!!document.getElementById('mfBootCover')}));
  const setup=await page.evaluate(()=>{
    try{if(typeof stopAttract==='function')stopAttract();}catch{}
    try{if(typeof apClose==='function')apClose();}catch{}
    document.body.classList.add('mfIntroDone');
    for(const el of [...document.body.children])if(el.id!=='gl')el.style.display='none';
    cv.style.display='block';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';
    attractOn=false;demoMode=false;matchLive=true;running=true;paused=true;gameEnded=false;fogOn=false;
    META.settings.quality='low';META.settings.fog=false;META.settings.dayNight=false;
    if(typeof applySettings==='function')applySettings();perfScale=.28;dayT=.08;
    resetWorld();playerFaction='nova';AI.fac='legion';
    const ty=TYPES.findIndex(T=>T.name==='Rhino');if(ty<0)throw new Error('Rhino missing');
    const cx=MAP*.5,cy=MAP*.5,left=[],right=[];
    for(let k=0;k<4;k++){
      const y=cy-30+k*20,a=spawnUnit(ty,0,cx-35,y),b=spawnUnit(ty,1,cx+35,y);
      if(a<0||b<0)throw new Error('unit spawn failed');left.push(a);right.push(b);
    }
    for(let k=0;k<4;k++)for(const [a,b] of [[left[k],right[k]],[right[k],left[k]]]){
      const angle=Math.atan2(uy[b]-uy[a],ux[b]-ux[a])+Math.PI/2;
      uang[a]=uturr[a]=angle;utgt[a]=b;utgtg[a]=ugen[b];ucool[a]=0;ustate[a]=0;umarch[a]=0;
    }
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.25;camPitch=pitchTarget=1.16;
    orthoSpan=distTarget=2700;
    if(typeof resize==='function')resize();if(typeof clampCam==='function')clampCam();
    if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    let steps=0,releases=0;
    for(;steps<120;steps++){
      tick++;stats.t+=1/30;unitTick(1/30);projTick(1/30);beamTick(1/30);updParticles(1/30);
      releases=0;for(let p=0;p<pHigh;p++)if(palive[p]&&pSrcUnit[p]>=0)releases++;
      if(releases>=4)break;
    }
    if(!bbIcon&&typeof mfIconEnsure==='function')mfIconEnsure();
    let iconFireCues=0;
    const oldIconAdd=bbIcon.add;
    bbIcon.add=function(uv,...args){
      if(uv===MF_ICO.fire_cue)iconFireCues++;
      return oldIconAdd.call(this,uv,...args);
    };
    try{render(1/30);}finally{bbIcon.add=oldIconAdd;}
    const live=[];for(let p=0;p<pHigh;p++)if(palive[p]&&pSrcUnit[p]>=0)
      live.push({slot:p,source:pSrcUnit[p],type:ptype[p],class:pwk[p],x:px[p],y:py[p],life:plife[p]});
    const firingStacks=new Set(live.map(p=>_stkOn&&_stkLead[p.source]>=0?_stkLead[p.source]:p.source)).size;
    let flashes=0;for(let p=0;p<MAXPART;p++)if(flife[p]>0&&ftype[p]===0)flashes++;
    return {steps,units:left.length+right.length,live,flashes,iconFireCues,firingStacks,span:orthoSpan,
      vfx:{...MF_COMBAT_VFX_TELEMETRY},canvas:{width:cv.width,height:cv.height,lost:gl.isContextLost()}};
  });
  if(setup.live.length<4||setup.vfx.projectiles<4||setup.iconFireCues!==setup.firingStacks||setup.canvas.lost)
    throw new Error(`natural fire did not reach visible packed renderer: ${JSON.stringify(setup)}`);
  const overview=join(out,'01-low-overview-natural-fire.png');
  await page.screenshot({path:overview});
  const tactical=await page.evaluate(()=>{
    orthoSpan=distTarget=520;if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    const before={pAge:Array.from(pAge.slice(0,pHigh)),life:Array.from(flife.slice(0,32))};
    for(let i=0;i<8;i++)render(0);
    const after={pAge:Array.from(pAge.slice(0,pHigh)),life:Array.from(flife.slice(0,32))};
    return {before,after,vfx:{...MF_COMBAT_VFX_TELEMETRY},span:orthoSpan};
  });
  if(JSON.stringify(tactical.before)!==JSON.stringify(tactical.after))throw new Error('paused renders aged sim-owned fire state');
  const close=join(out,'02-low-tactical-natural-fire.png');
  await page.screenshot({path:close});
  await guard.checkpoint('weapon-fire packed capture');
  stable=true;
  const report={status:'PASS_CAPTURE',origin,head:guard.head,gpu,parity,readiness,quality:'low',perfScale:.28,
    viewport:{width:412,height:900},setup,tactical:{vfx:tactical.vfx,span:tactical.span,simStateStable:true},
    screenshots:[overview,close],pageErrors:errors};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{
  if(browser)await closePwBrowser(browser).catch(()=>{});
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r));}
  await guard.release({assertStable:stable,name:'weapon-fire final release'});
}
