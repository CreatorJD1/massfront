#!/usr/bin/env node
/* Stage 8 tactical-team-identification evidence.

   This is deliberately a capture producer, not a visual verdict. It reaches a
   real deployed match through the player UI, adds a paused fixture through the
   production spawn/build/damage seams, and captures the shipped HUD at its
   actual CSS scale. Human inspection of the PNGs remains required.

   Usage:
     node tools/capture-stage8-team-identification.mjs [run-id]

   Output:
     .tmp/<run-id>/report.json
     .tmp/<run-id>/*.png
*/
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';
import {
  readRepositoryFingerprint,
  readRuntimeFingerprint
} from './interface-audit/verify-interface-matrix.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2);
if(args.includes('--help')||args.includes('-h')){
  console.log('Usage: node tools/capture-stage8-team-identification.mjs [run-id]');
  process.exit(0);
}
if(args.length>1)throw new Error('Expected at most one run-id argument');
/* Keep the ordinary verification path bounded. An explicit run id is reserved
   for a deliberately retained evidence snapshot, not generated on every run. */
const DEFAULT_RUN_ID='stage8-team-identification';
const explicitRunId=args.length===1;
const runId=args[0]||DEFAULT_RUN_ID;
if(!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(runId))throw new Error('Invalid run-id');
const tmpRoot=resolve(root,'.tmp');
const outDir=join(root,'.tmp',runId);
const outputLockPath=join(tmpRoot,'.stage8-team-identification.lock');
/* Codex stores user-provided reference images here while a task is live. Git
   ignores this cache and the runtime manifest never loads it, so its delivery
   must not invalidate otherwise stable gameplay evidence. */
const remoteAttachmentDir=resolve(root,'modules','space_exploration','.codex-remote-attachments');

const PHONE_UA='Mozilla/5.0 (Linux; Android 15; SM-S938U Build/AP3A.240905.015.A2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.260 Mobile Safari/537.36';
const VIEWPORTS=[
  {key:'foldable',width:344,height:882,dpr:2,expectedMinimapCss:56},
  {key:'phone-p',width:412,height:915,dpr:2,expectedMinimapCss:84},
  {key:'phone-l',width:915,height:412,dpr:2,expectedMinimapCss:256}
];
const NORMAL_STATES=[
  {key:'a-native-close',teamId:false,focus:'cluster',span:520},
  {key:'b-accessible-close',teamId:true,focus:'cluster',span:520},
  {key:'c-accessible-strategic',teamId:true,focus:'cluster',span:2300},
  {key:'d-accessible-radar-only',teamId:true,focus:'radar',span:520},
  {key:'e-accessible-hidden',teamId:true,focus:'hidden',span:520},
  {key:'f-native-restored',teamId:false,focus:'cluster',span:520}
];
const BROOD_STATES=[
  {key:'g-brood-accessible',teamId:true,focus:'cluster',span:520},
  {key:'h-brood-native-restored',teamId:false,focus:'cluster',span:520}
];
const EXPECTED_STATE_KEYS=[
  ...VIEWPORTS.flatMap(profile=>NORMAL_STATES.map(state=>profile.key+'/normal/'+state.key)),
  ...BROOD_STATES.map(state=>'phone-p/brood/'+state.key)
].sort();
const MIME={
  '.basis':'application/octet-stream','.bin':'application/octet-stream',
  '.css':'text/css; charset=utf-8','.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json','.html':'text/html; charset=utf-8',
  '.jpeg':'image/jpeg','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.ktx2':'image/ktx2',
  '.m4a':'audio/mp4','.mjs':'text/javascript; charset=utf-8',
  '.mp3':'audio/mpeg','.ogg':'audio/ogg','.png':'image/png',
  '.svg':'image/svg+xml','.wasm':'application/wasm',
  '.webmanifest':'application/manifest+json','.webp':'image/webp',
  '.woff2':'font/woff2'
};

function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function pngInfo(bytes){
  const signature='89504e470d0a1a0a';
  if(bytes.length<24||bytes.subarray(0,8).toString('hex')!==signature)
    throw new Error('Screenshot is not a PNG');
  return {sha256:sha256(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),
    height:bytes.readUInt32BE(20),mime:'image/png'};
}
function inside(base,target){
  const rel=relative(base,target);
  return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));
}
const SHA40_OR_64=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const SHA256=/^[0-9a-f]{64}$/i;
function requireSourceIdentity(value,label){
  if(!value||!SHA40_OR_64.test(value.head||'')||!SHA256.test(value.dirtyFingerprint||'')
    ||value.dirtyFingerprint==='UNKNOWN')
    throw new Error('INVALID_'+label.toUpperCase()+'_SOURCE_IDENTITY: '+JSON.stringify(value));
}
function requireRuntimeIdentity(value,label){
  if(!value||!SHA256.test(value.fingerprint||'')||!Array.isArray(value.missingFiles)
    ||value.missingFiles.length)
    throw new Error('INVALID_'+label.toUpperCase()+'_RUNTIME_IDENTITY: '+JSON.stringify(value));
}
function sameSource(a,b){
  return !!a&&!!b&&a.head===b.head&&a.dirtyFingerprint===b.dirtyFingerprint;
}
function sameRuntime(a,b){
  return !!a&&!!b&&a.fingerprint===b.fingerprint;
}
function assertion(report,scope,name,ok,detail){
  report.assertions.push({scope,name,ok:!!ok,detail:detail==null?'':detail});
  if(!ok)throw new Error('ASSERTION_FAILED ['+scope+'] '+name+': '+JSON.stringify(detail));
}

async function prepareOutput(){
  if(!inside(tmpRoot,outDir)||relative(tmpRoot,outDir).split(sep).length!==1)
    throw new Error('Refused output outside direct .tmp child: '+outDir);
  const entries=existsSync(outDir)?await readdir(outDir):[];
  if(entries.length){
    if(explicitRunId)throw new Error('Explicit output directory is not empty: '+outDir);
    if(resolve(outDir).toLowerCase()!==resolve(tmpRoot,DEFAULT_RUN_ID).toLowerCase())
      throw new Error('Refused replacement of non-default output: '+outDir);
    await rm(outDir,{recursive:true,force:true});
  }
  await mkdir(outDir,{recursive:true});
  return {replaced:entries.length>0,mode:explicitRunId?'retained-explicit':'bounded-default'};
}

function processAlive(pid){
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}
  catch(error){return error?.code==='EPERM';}
}
async function acquireOutputLease(){
  await mkdir(tmpRoot,{recursive:true});
  const token=randomUUID(),host=hostname();
  for(let attempt=0;attempt<2;attempt++){
    let handle=null,created=false;
    try{
      handle=await open(outputLockPath,'wx');
      created=true;
      await handle.writeFile(JSON.stringify({schema:1,token,pid:process.pid,host,
        runId,startedAt:new Date().toISOString()},null,2)+'\n','utf8');
      await handle.close();handle=null;
      const checkpoint=async()=>{
        let held;
        try{held=JSON.parse(await readFile(outputLockPath,'utf8'));}
        catch(error){throw new Error('OUTPUT_LEASE_LOST: '+outputLockPath+' '+String(error?.message||error));}
        if(held.token!==token)throw new Error('OUTPUT_LEASE_LOST: '+outputLockPath);
        return held;
      };
      return {checkpoint,async release(){await checkpoint();await unlink(outputLockPath);}};
    }catch(error){
      if(handle)await handle.close().catch(()=>{});
      if(created){
        try{await unlink(outputLockPath);}
        catch(cleanupError){if(cleanupError?.code!=='ENOENT')
          throw new Error('OUTPUT_LEASE_INIT_CLEANUP_FAILED: '+String(cleanupError?.message||cleanupError));}
        throw error;
      }
      if(error?.code!=='EEXIST')throw error;
      let raw,held;
      try{raw=await readFile(outputLockPath,'utf8');held=JSON.parse(raw);}catch{
        throw new Error('OUTPUT_LEASE_HELD: unreadable '+outputLockPath);
      }
      if(held.host!==host||processAlive(Number(held.pid)))
        throw new Error('OUTPUT_LEASE_HELD: '+outputLockPath+' by '+held.host+' pid '+held.pid);
      const current=await readFile(outputLockPath,'utf8');
      if(current!==raw)throw new Error('OUTPUT_LEASE_REPLACED: '+outputLockPath);
      await unlink(outputLockPath);
    }
  }
  throw new Error('OUTPUT_LEASE_ACQUIRE_FAILED: '+outputLockPath);
}

async function startServer(){
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url||'/','http://127.0.0.1').pathname);
      const requested=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');
      const file=resolve(root,requested);
      if(!inside(root,file)||!existsSync(file))throw new Error('not found');
      const bytes=await readFile(file);
      res.writeHead(200,{'Cache-Control':'no-store',
        'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});
      if(req.method==='HEAD')res.end();else res.end(bytes);
    }catch{
      res.writeHead(404,{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'});
      res.end('Not found');
    }
  });
  await new Promise((accept,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',accept);
  });
  return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}

function shownInPage(){
  const visible=el=>{
    if(!el)return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
  };
  return {
    intro:visible(document.getElementById('mfIntroStart')),
    start:visible(document.getElementById('startBtn')),
    accountClose:visible(document.getElementById('apCloseBtn'))
  };
}

async function tapControl(page,locator,options={}){
  await locator.tap(options);
  await page.waitForTimeout(700);
}

async function enterProductionMatch(page,enemyFaction){
  const route=[];
  await page.goto(page.__mfUrl,{waitUntil:'domcontentloaded',timeout:60_000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof spawnUnit==='function'
    &&typeof addBld==='function'&&typeof renderMinimap==='function'
    &&document.getElementById('startBtn'),null,{timeout:180_000});
  await page.waitForFunction(()=>{
    const visible=el=>{
      if(!el)return false;
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0
        &&r.width>0&&r.height>0;
    };
    return visible(document.getElementById('mfIntroStart'))
      ||visible(document.getElementById('startBtn'))
      ||visible(document.getElementById('apCloseBtn'));
  },null,{timeout:90_000});
  let first=await page.evaluate(shownInPage);
  if(first.intro){
    let result='clicked';
    try{await page.locator('#mfIntroStart').tap({timeout:4_000});}
    catch(error){
      const current=await page.evaluate(shownInPage);
      if(current.intro)throw error;
      result='advanced-before-click';
    }
    await page.waitForFunction(()=>{
      const visible=el=>{
        if(!el)return false;
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0
          &&r.width>0&&r.height>0;
      };
      return document.body.classList.contains('mfIntroDone')
        ||visible(document.getElementById('startBtn'))||visible(document.getElementById('apCloseBtn'));
    },null,{timeout:90_000});
    route.push({action:'intro',result});
  }
  await page.waitForTimeout(700);
  first=await page.evaluate(shownInPage);
  if(first.accountClose){
    await page.locator('#apCloseBtn').tap({timeout:10_000});
    await page.waitForTimeout(700);
  }
  await page.locator('#startBtn').waitFor({state:'visible',timeout:30_000});
  await page.locator('#startBtn').tap();
  await page.waitForTimeout(700);
  route.push({action:'startBtn'});
  const card=page.locator('.warCard[data-mode="standard"]');
  await card.waitFor({state:'visible',timeout:30_000});
  await card.tap();
  await page.waitForTimeout(700);
  route.push({action:'warCard',mode:'standard'});
  await page.locator('#setupStart').waitFor({state:'visible',timeout:60_000});
  for(let step=0;step<4;step++){
    route.push(await page.evaluate(n=>({
      action:'setupStart',step:n,
      label:(document.getElementById('setupStart')?.textContent||'').trim(),
      galaxyStage:typeof mfGalaxyStage==='undefined'?null:mfGalaxyStage
    }),step));
    await page.locator('#setupStart').tap();
    await page.waitForTimeout(700);
  }
  const advanced=page.locator('#mfAdvanced');
  await advanced.waitFor({state:'visible',timeout:30_000});
  const open=await advanced.evaluate(el=>el.open);
  if(!open){await page.locator('#mfAdvanced > summary').tap();await page.waitForTimeout(700);}
  const faction=page.locator('#facRow .fbtn[data-f="'+enemyFaction+'"]');
  await faction.waitFor({state:'visible',timeout:15_000});
  await faction.tap();
  await page.waitForTimeout(700);
  const infestOff=page.locator('#infestRow .ifbtn[data-i="0"]');
  if(await infestOff.isVisible()){await infestOff.tap();await page.waitForTimeout(700);}
  const noLimit=page.locator('#timeRow .tmbtn[data-t="0"]');
  if(await noLimit.isVisible()){await noLimit.tap();await page.waitForTimeout(700);}
  await page.waitForFunction(f=>typeof aiFactionSel!=='undefined'&&aiFactionSel===f
    &&typeof infestationOn==='boolean'&&!infestationOn&&typeof timeLimit!=='undefined'&&timeLimit===0
    &&document.querySelector('#facRow .fbtn[data-f="'+f+'"]')?.classList.contains('on')
    &&document.querySelector('#infestRow .ifbtn[data-i="0"]')?.classList.contains('on')
    &&document.querySelector('#timeRow .tmbtn[data-t="0"]')?.classList.contains('on'),
    enemyFaction,{timeout:10_000});
  const advancedState=await page.evaluate(()=>({enemyFaction:aiFactionSel,infestation:infestationOn,
    timeLimit,factionSelected:document.querySelector('#facRow .fbtn.on')?.dataset.f||null,
    infestationSelected:document.querySelector('#infestRow .ifbtn.on')?.dataset.i||null,
    timeSelected:document.querySelector('#timeRow .tmbtn.on')?.dataset.t||null}));
  route.push({action:'advanced',...advancedState});
  await page.locator('#setupStart').tap();
  route.push({action:'setupStart',step:4,label:'launch battle'});
  await page.locator('#deployBtn').waitFor({state:'visible',timeout:180_000});
  await page.locator('#deployBtn').tap();
  route.push({action:'deployBtn'});
  await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive&&running
    &&document.body.classList.contains('hudTacticalDock'),null,{timeout:180_000});
  await page.waitForTimeout(1200);
  const state=await page.evaluate(()=>({
    matchLive,running,paused,playerFaction,infestationOn,timeLimit,
    enemyFaction:AI&&AI.fac,broodEnemy:typeof broodIsEnemy==='function'&&broodIsEnemy(),
    hudTacticalDock:document.body.classList.contains('hudTacticalDock')
  }));
  if(!state.matchLive||!state.running||!state.hudTacticalDock||state.enemyFaction!==enemyFaction
    ||state.infestationOn||state.timeLimit!==0)
    throw new Error('DEPLOYED_MATCH_CONFIGURATION_MISMATCH: '+JSON.stringify(state));
  return {steps:route,state};
}

async function setPresentation(page,teamIdMode){
  await tapControl(page,page.locator('#menuBtn'));
  await page.locator('#pauseOverlay').waitFor({state:'visible',timeout:10_000});
  await tapControl(page,page.locator('#pauseSettings'));
  await page.locator('#settingsScr').waitFor({state:'visible',timeout:10_000});
  await tapControl(page,page.locator('#setTab-battle'));
  if(!(await page.evaluate(()=>!!META.settings.fog)))
    await tapControl(page,page.locator('.setRow[data-set="fog"]'));
  for(let n=0;n<3&&(await page.evaluate(()=>META.settings.healthBars||'select'))!=='always';n++){
    await tapControl(page,page.locator('#setTab-battle'));
    await tapControl(page,page.locator('.setRow[data-set="healthBars"]'));
  }
  await tapControl(page,page.locator('#setTab-display'));
  for(let n=0;n<4&&(await page.evaluate(()=>qualityKey()))!=='medium';n++){
    await tapControl(page,page.locator('#setTab-display'));
    await tapControl(page,page.locator('.setRow[data-set="quality"]'));
  }
  const current=await page.evaluate(()=>!!META.settings.teamIdMode);
  if(current!==teamIdMode){
    await tapControl(page,page.locator('#setTab-display'));
    await tapControl(page,page.locator('.setRow[data-set="teamIdMode"]'));
  }
  await tapControl(page,page.locator('#setBack'));
  await page.locator('#pauseOverlay').waitFor({state:'visible',timeout:10_000});
  await tapControl(page,page.locator('#resumeBtn'));
  await page.evaluate(()=>{paused=true;});
  await page.waitForTimeout(500);
  const state=await page.evaluate(()=>({
    fog:!!META.settings.fog,fogOn,healthBars:META.settings.healthBars,
    teamIdMode:!!META.settings.teamIdMode,quality:qualityKey(),paused,
    settingsVisible:getComputedStyle(document.getElementById('settingsScr')).display!=='none',
    pauseVisible:getComputedStyle(document.getElementById('pauseOverlay')).display!=='none'
  }));
  if(!state.fog||!state.fogOn||state.healthBars!=='always'||state.teamIdMode!==teamIdMode
    ||state.quality!=='medium'||!state.paused||state.settingsVisible||state.pauseVisible)
    throw new Error('SETTINGS_ROUTE_DID_NOT_SETTLE: '+JSON.stringify(state));
  return state;
}

async function createFixture(page){
  return page.evaluate(()=>{
    if(!matchLive||!running)throw new Error('Fixture requires a live deployed match');
    paused=true;
    updateFog();
    const cell=MAP/FN;
    const visualCells=Math.max(4,Math.round(intelVisionScale(INTEL_VIS_BLD)));
    const radarCells=Math.max(6,Math.round(intelVisionScale(INTEL_RADAR_UPLINK)));
    const visualWorld=visualCells*cell,radarWorld=radarCells*cell;
    if(radarWorld-visualWorld<cell*4)throw new Error('Radar/visual annulus is too narrow');
    const radarDistance=visualWorld+(radarWorld-visualWorld)*.62;
    const hiddenDistance=radarWorld+cell*7;
    const occupied=[];
    for(let i=0;i<unitHigh;i++)if(ualive[i])occupied.push([ux[i],uy[i]]);
    for(const B of blds)if(B.alive)occupied.push([B.x,B.y]);
    let best=null;
    for(let cy=500;cy<=MAP-500;cy+=260)for(let cx=500;cx<=MAP-500;cx+=260){
      for(let a=0;a<TAU;a+=Math.PI/8){
        const dx=Math.cos(a),dy=Math.sin(a),px=-dy,py=dx;
        const raw={
          center:[cx,cy],friendly:[cx+px*92,cy+py*92],
          hostile:[cx-px*92,cy-py*92],neutral:[cx-dx*72,cy-dy*72],
          radar:[cx+dx*radarDistance,cy+dy*radarDistance],
          hidden:[cx+dx*hiddenDistance,cy+dy*hiddenDistance]
        };
        const P={};
        let legal=true;
        for(const [key,value] of Object.entries(raw)){
          const q=findLand(value[0],value[1]);
          P[key]=q;
          if(q[0]<24||q[1]<24||q[0]>MAP-24||q[1]>MAP-24)legal=false;
        }
        const sensorMult=typeof hazVisionMult==='function'?hazVisionMult(P.center[0],P.center[1],-1):1;
        if(!legal||fogPointVisible(P.center[0],P.center[1])
          ||fogPointVisible(P.radar[0],P.radar[1])
          ||fogPointVisible(P.hidden[0],P.hidden[1])||sensorMult<.98)continue;
        if(['friendly','hostile','neutral'].some(key=>
          Math.hypot(P[key][0]-P.center[0],P[key][1]-P.center[1])>=visualWorld-cell*2))continue;
        const rd=Math.hypot(P.radar[0]-P.center[0],P.radar[1]-P.center[1]);
        const hd=Math.hypot(P.hidden[0]-P.center[0],P.hidden[1]-P.center[1]);
        if(rd<=visualWorld+cell*2||rd>=radarWorld-cell*2||hd<=radarWorld+cell*2)continue;
        let clearance=1e9;
        for(const q of occupied)for(const p of Object.values(P))
          clearance=Math.min(clearance,Math.hypot(q[0]-p[0],q[1]-p[1]));
        if(clearance<180)continue;
        if(!best||clearance>best.clearance)best={P,clearance,rd,hd};
      }
    }
    if(!best)throw new Error('CONTROLLED_FIXTURE_SITE_UNAVAILABLE');
    const P=best.P;
    const uplink=addBld('uplink',0,P.center[0],P.center[1],true,0);
    const ids={
      friendly:spawnUnit(1,0,P.friendly[0],P.friendly[1]),
      hostile:spawnUnit(1,1,P.hostile[0],P.hostile[1]),
      neutral:spawnUnit(12,2,P.neutral[0],P.neutral[1]),
      radar:spawnUnit(1,1,P.radar[0],P.radar[1]),
      hidden:spawnUnit(1,1,P.hidden[0],P.hidden[1])
    };
    for(const [key,id] of Object.entries(ids))if(id<0)
      throw new Error('FIXTURE_SPAWN_FAILED: '+key);
    const oldPerf=perfScale;perfScale=0;
    try{
      dealDamage(ids.friendly,uhpm[ids.friendly]*.28,1,-1,1);
      dealDamage(ids.hostile,uhpm[ids.hostile]*.52,0,-1,1);
      dealDamage(ids.neutral,uhpm[ids.neutral]*.72,0,-1,1);
    }finally{perfScale=oldPerf;}
    for(const id of Object.values(ids)){
      utx[id]=ux[id];uty[id]=uy[id];ustate[id]=0;utgt[id]=-1;utgtg[id]=-1;
      uhold[id]=1;usel[id]=0;
    }
    updateFog();mmFrame=0;renderMinimap();
    const actual={};
    for(const [key,id] of Object.entries(ids))actual[key]=[ux[id],uy[id]];
    window.__mfTeamIdFixture={
      ids,positions:{...actual,center:[uplink.x,uplink.y]},uplinkIndex:blds.indexOf(uplink),
      visualWorld,radarWorld,radarDistance:best.rd,hiddenDistance:best.hd,
      clearance:best.clearance,createdAt:stats.t
    };
    return window.__mfTeamIdFixture;
  });
}

async function pointCamera(page,focus,span){
  return page.evaluate(({focus,span})=>{
    const F=window.__mfTeamIdFixture;
    if(!F)throw new Error('Missing team-identification fixture');
    const p=F.positions[focus]||F.positions.center;
    camFollow=-1;cam.x=p[0];cam.y=p[1];
    orthoSpan=distTarget=span;camYaw=yawTarget=.18;camPitch=pitchTarget=1.08;
    clampCam();camUpdateMatrices();
    mmFrame=0;renderMinimap();
    if(typeof render==='function')render();
    return {x:cam.x,y:cam.y,orthoSpan,focus};
  },{focus,span});
}

async function settleTacticalHud(page){
  await page.evaluate(()=>{
    if(typeof mfUiClosePrimary==='function')mfUiClosePrimary();
  });
  try{
    await page.waitForFunction(()=>{
      const canvas=document.getElementById('minimap');
      return !!canvas&&canvas.clientWidth>0&&canvas.clientHeight>0
        &&!document.body.classList.contains('menuMode')
        &&!document.body.classList.contains('mfMenuOpen')
        &&!document.body.classList.contains('uiPrimaryOpen');
    },null,{timeout:10_000});
  }catch(error){
    const state=await page.evaluate(()=>({bodyClasses:[...document.body.classList],
      minimap:{clientWidth:document.getElementById('minimap')?.clientWidth||0,
        clientHeight:document.getElementById('minimap')?.clientHeight||0,
        display:getComputedStyle(document.getElementById('minimap')).display,
        wrapDisplay:getComputedStyle(document.getElementById('minimapWrap')).display},
      panels:['buildMenu','prodMenu','bldMenu2','unitCard'].map(id=>({id,
        display:document.getElementById(id)?.style.display||''})),
      fronts:(typeof FRONT_SCREEN_IDS!=='undefined'?FRONT_SCREEN_IDS:[]).filter(id=>{
        const el=document.getElementById(id);return el&&el.style.display&&el.style.display!=='none';
      })}));
    throw new Error('TACTICAL_HUD_DID_NOT_SETTLE: '+JSON.stringify(state)+'\n'+String(error&&error.stack||error));
  }
}

async function telemetry(page){
  return page.evaluate(()=>{
    const F=window.__mfTeamIdFixture;
    const unit=id=>{
      const visible=fogEntityVisible(uteam[id],ux[id],uy[id]);
      return {id,team:uteam[id],type:utype[id],name:TYPES[utype[id]]?.name||'',
        x:ux[id],y:uy[id],hp:uhp[id],maxHp:uhpm[id],
        hpRatio:uhpm[id]>0?uhp[id]/uhpm[id]:null,
        visible,radar:!visible&&uteam[id]!==0&&intelRadarContact(ux[id],uy[id]),
        allegiance:mfTeamIdAllegiance(uteam[id])};
    };
    const canvas=document.getElementById('minimap'),rect=canvas.getBoundingClientRect();
    const scale=mmTeamIdCanvasScale();
    const marker={
      scale,visibleBacking:mmTeamIdMarkerSize(4,false,scale),
      radarBacking:mmTeamIdMarkerSize(3,true,scale),
      visibleCss:mmTeamIdMarkerSize(4,false,scale)/scale,
      radarCss:mmTeamIdMarkerSize(3,true,scale)/scale,
      visibleStrokeCss:mmTeamIdStrokeWidth(false,scale)/scale,
      radarStrokeCss:mmTeamIdStrokeWidth(true,scale)/scale
    };
    const entities={};
    for(const [key,id] of Object.entries(F.ids))entities[key]=unit(id);
    return {
      match:{matchLive,running,paused,statsTime:stats.t,playerFaction,
        enemyFaction:AI&&AI.fac,broodEnemy:broodIsEnemy()},
      settings:{teamIdMode:mfTeamIdEnabled(),healthBars:META.settings.healthBars,
        fog:!!META.settings.fog,fogOn,quality:qualityKey()},
      palette:{teamC:TEAMC.map(c=>c.slice()),teamB:TEAMB.map(c=>c.slice()),
        expected:MF_TEAM_ID_PALETTE.map(p=>({c:p.c.slice(),b:p.b.slice()}))},
      camera:{x:cam.x,y:cam.y,orthoSpan,yaw:camYaw,pitch:camPitch,
        strategicStacks:typeof mfIconStackOn==='function'?mfIconStackOn():null},
      minimap:{backingWidth:canvas.width,backingHeight:canvas.height,
        clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight,
        rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},marker},
      fixture:F,entities,contextLosses:window.__mfStage8ContextLosses||0,
      hud:{tacticalDock:document.body.classList.contains('hudTacticalDock'),
        menuOpen:document.body.classList.contains('mfMenuOpen'),
        primaryOpen:document.body.classList.contains('uiPrimaryOpen'),
        bodyClasses:[...document.body.classList],
        minimapWrapDisplay:getComputedStyle(document.getElementById('minimapWrap')).display}
    };
  });
}

async function captureState(page,report,profile,scenario,state,nativePalette){
  await pointCamera(page,state.focus,state.span);
  await settleTacticalHud(page);
  await page.waitForTimeout(700);
  const data=await telemetry(page);
  const scope=profile.key+'/'+scenario+'/'+state.key;
  assertion(report,scope,'team-identification setting',data.settings.teamIdMode===state.teamId,
    data.settings);
  assertion(report,scope,'health bars always',data.settings.healthBars==='always',data.settings);
  assertion(report,scope,'fog active',data.settings.fog&&data.settings.fogOn,data.settings);
  assertion(report,scope,'hardware-scale marker floors',
    data.minimap.marker.visibleCss>=4.99&&data.minimap.marker.radarCss>=3.99,
    data.minimap.marker);
  assertion(report,scope,'computed minimap width',
    Math.abs(data.minimap.clientWidth-profile.expectedMinimapCss)<=1.5,
    {expected:profile.expectedMinimapCss,actual:data.minimap.clientWidth});
  if(state.teamId){
    const classes=[0,1,scenario==='brood'?1:2];
    const expectedC=classes.map(index=>data.palette.expected[index].c);
    const expectedB=classes.map(index=>data.palette.expected[index].b);
    assertion(report,scope,'accessible allegiance palette applied',
      JSON.stringify(data.palette.teamC.slice(0,3))===JSON.stringify(expectedC)
        &&JSON.stringify(data.palette.teamB.slice(0,3))===JSON.stringify(expectedB),
      {expected:{teamC:expectedC,teamB:expectedB},actual:data.palette});
  }
  if(state.key.includes('radar-only'))assertion(report,scope,'radar-only disclosure',
    !data.entities.radar.visible&&data.entities.radar.radar,data.entities.radar);
  if(state.key.includes('hidden'))assertion(report,scope,'fully hidden disclosure',
    !data.entities.hidden.visible&&!data.entities.hidden.radar,data.entities.hidden);
  if(state.focus==='cluster')assertion(report,scope,'visible allegiance fixture',
    data.entities.friendly.visible&&data.entities.hostile.visible&&data.entities.neutral.visible,
    data.entities);
  if(state.key.includes('restored'))assertion(report,scope,'native palette restored',
    JSON.stringify(data.palette.teamC)===JSON.stringify(nativePalette.teamC)
      &&JSON.stringify(data.palette.teamB)===JSON.stringify(nativePalette.teamB),
    {before:nativePalette,after:data.palette});
  const base=profile.key+'-'+scenario+'-'+state.key;
  const fullFile=base+'-full.png',miniFile=base+'-minimap.png';
  const fullBytes=await page.screenshot({path:join(outDir,fullFile),fullPage:false});
  const miniBytes=await page.locator('#minimap').screenshot({path:join(outDir,miniFile)});
  const item={viewportKey:profile.key,scenario,state:state.key,focus:state.focus,
    expected:{teamIdMode:state.teamId,span:state.span,minimapCss:profile.expectedMinimapCss},
    telemetry:data,artifacts:{
      full:{file:fullFile,...pngInfo(fullBytes)},
      minimap:{file:miniFile,...pngInfo(miniBytes)}
    },visualVerdict:'PENDING_HUMAN_REVIEW'};
  report.captures.push(item);
  return item;
}

async function runScenario(browser,report,url,profile,scenario,enemyFaction){
  await report.workspaceGuard.checkpoint('before '+profile.key+'/'+scenario);
  await assertPwBrowserOwnership(browser);
  const page=await browser.newPage({
    viewport:{width:profile.width,height:profile.height},
    deviceScaleFactor:profile.dpr,hasTouch:true,isMobile:true,
    userAgent:PHONE_UA,colorScheme:'dark',serviceWorkers:'block'
  });
  page.__mfUrl=url;
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push({type:'pageerror',message:e.message}));
  page.on('console',m=>{if(m.type()==='error')pageErrors.push({type:'console',message:m.text()});});
  page.on('requestfailed',r=>pageErrors.push({type:'requestfailed',url:r.url(),
    message:r.failure()?.errorText||'failed'}));
  page.on('response',r=>{if(r.status()>=400)pageErrors.push({type:'http',url:r.url(),
    message:'HTTP '+r.status()});});
  await page.addInitScript(()=>{
    try{localStorage.clear();sessionStorage.clear();}catch{}
    window.__mfStage8ContextLosses=0;
    addEventListener('webglcontextlost',()=>{window.__mfStage8ContextLosses++;},true);
  });
  let offline=null,thrown=null;
  try{
    offline=await installOfflineNetworkIsolation(page);
    const route=await enterProductionMatch(page,enemyFaction);
    report.routes.push({viewportKey:profile.key,scenario,...route});
    assertion(report,profile.key+'/'+scenario,'deployed match configuration',
      route.state.enemyFaction===enemyFaction&&!route.state.infestationOn&&route.state.timeLimit===0
        &&route.state.matchLive&&route.state.running&&route.state.hudTacticalDock,route.state);
    const gpu=await assertHardwareGpu(page);
    if(!report.gpu){report.gpu=gpu;recordPwBrowserGpu(browser,gpu);}
    const device=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
      userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints}));
    report.devices[profile.key]??={requested:profile,actual:device};
    assertion(report,profile.key+'/'+scenario,'viewport and touch identity',
      device.width===profile.width&&device.height===profile.height
        &&Math.abs(device.dpr-profile.dpr)<.01&&device.maxTouchPoints>0,
      {expected:profile,actual:device});
    await setPresentation(page,false);
    const fixture=await createFixture(page);
    const nativePalette=(await telemetry(page)).palette;
    report.fixtures.push({viewportKey:profile.key,scenario,...fixture});
    if(scenario==='normal'){
      for(const state of NORMAL_STATES){
        const current=await page.evaluate(()=>mfTeamIdEnabled());
        if(current!==state.teamId)await setPresentation(page,state.teamId);
        await captureState(page,report,profile,scenario,state,nativePalette);
      }
    }else{
      await setPresentation(page,true);
      const on=await captureState(page,report,profile,scenario,BROOD_STATES[0],nativePalette);
      assertion(report,profile.key+'/'+scenario,'Brood team 2 is hostile',
        on.telemetry.entities.neutral.allegiance===1&&on.telemetry.match.broodEnemy,
        on.telemetry.entities.neutral);
      await setPresentation(page,false);
      await captureState(page,report,profile,scenario,BROOD_STATES[1],nativePalette);
    }
    const final=await telemetry(page);
    assertion(report,profile.key+'/'+scenario,'no WebGL context loss',
      final.contextLosses===0,final.contextLosses);
  }catch(error){thrown=error;}
  finally{
    if(offline){
      try{report.offline.push({viewportKey:profile.key,scenario,
        evidence:await offline.finalize(profile.key+'/'+scenario)});}
      catch(error){
        report.errors.capture.push({viewportKey:profile.key,scenario,
          message:String(error&&error.stack||error)});
        if(!thrown)thrown=error;
      }
    }else if(!page.isClosed())await page.close().catch(()=>{});
    report.errors.runtime.push(...pageErrors.map(item=>({viewportKey:profile.key,scenario,...item})));
  }
  await assertPwBrowserOwnership(browser);
  await report.workspaceGuard.checkpoint('after '+profile.key+'/'+scenario);
  if(thrown)throw thrown;
}

async function main(){
  const reportPath=join(outDir,'report.json');
  let outputLease=null,workspaceGuard=null,report=null,server=null,browser=null,failure=null;
  try{
    outputLease=await acquireOutputLease();
    workspaceGuard=await acquireVerificationFreeze({
      root,label:'Stage 8 team-identification capture '+runId,
      quietMs:Number(process.env.MF_QUIET_PREFLIGHT_MS||15000),
      allowedPaths:[outDir,remoteAttachmentDir]
    });
    const outputPreparation=await prepareOutput();
    const source=await readRepositoryFingerprint(root),runtime=await readRuntimeFingerprint(root);
    requireSourceIdentity(source,'start');requireRuntimeIdentity(runtime,'start');
    report={
      schema:'massfront.stage8-team-identification/v1',runId,
      generatedAt:new Date().toISOString(),root,captureKind:'real-player-route-hardware-webgl2',
      outputPreparation,expectedStateCount:EXPECTED_STATE_KEYS.length,
      expectedPngCount:EXPECTED_STATE_KEYS.length*2,captureCompleted:false,
      acceptanceOutcome:'UNKNOWN_PENDING_HUMAN_VISUAL_REVIEW',
      visualReviewRequired:true,
      visualChecklist:[
        'Friendly circles, hostile triangles, and unaligned crosses remain distinct at displayed size.',
        'Accessible palette and unequal health-bar lengths remain readable in the 3D view.',
        'Radar-only contacts are faint outlined minimap shapes with no world model or health bar.',
        'Fully hidden contacts disclose neither world model nor minimap marker.',
        'Turning the mode off restores authored faction livery and square minimap markers.',
        'Brood team 2 is hostile while a Brood opponent is active.'
      ],
      source,runtime,sourceAtCompletion:null,runtimeAtCompletion:null,
      sourceStable:false,runtimeStable:false,browser:null,browserAtCompletion:null,
      gpu:null,devices:{},routes:[],fixtures:[],captures:[],offline:[],assertions:[],
      errors:{runtime:[],capture:[]}
    };
    Object.defineProperty(report,'workspaceGuard',{value:workspaceGuard,enumerable:false});
    try{
      const local=await startServer();server=local.server;
      report.url=local.url;
      browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
      report.browser=await assertPwBrowserOwnership(browser);
      for(const profile of VIEWPORTS)
        await runScenario(browser,report,local.url,profile,'normal','legion');
      await runScenario(browser,report,local.url,VIEWPORTS[1],'brood','horde');
      const stateKeys=report.captures.map(item=>item.viewportKey+'/'+item.scenario+'/'+item.state).sort();
      assertion(report,'matrix','exact unique state matrix',
        JSON.stringify(stateKeys)===JSON.stringify(EXPECTED_STATE_KEYS),
        {expected:EXPECTED_STATE_KEYS,actual:stateKeys});
      const pngFiles=report.captures.flatMap(item=>[item.artifacts.full.file,item.artifacts.minimap.file]);
      assertion(report,'matrix','exact unique PNG matrix',
        pngFiles.length===report.expectedPngCount&&new Set(pngFiles).size===report.expectedPngCount,
        {expected:report.expectedPngCount,actual:pngFiles.length,unique:new Set(pngFiles).size});
      for(const item of report.captures)for(const key of ['full','minimap']){
        const recorded=item.artifacts[key],bytes=await readFile(join(outDir,recorded.file)),current=pngInfo(bytes);
        assertion(report,item.viewportKey+'/'+item.scenario+'/'+item.state,
          key+' PNG exists and matches recorded hash',
          current.sha256===recorded.sha256&&current.bytes===recorded.bytes,current);
      }
      assertion(report,'runtime','no page, console, request, or HTTP errors',
        report.errors.runtime.length===0,report.errors.runtime);
      report.captureCompleted=true;
    }catch(error){
      failure=error;report.captureCompleted=false;
      report.errors.capture.push({message:String(error&&error.stack||error)});
    }finally{
      if(browser){
        try{
          report.browserBeforeClose=pwBrowserEvidence(browser);
          report.browserAtCompletion=await closePwBrowser(browser);
        }catch(error){
          failure??=error;report.captureCompleted=false;
          report.errors.capture.push({message:'Browser cleanup: '+String(error&&error.stack||error)});
        }
      }
      if(server)try{await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));}
      catch(error){
        failure??=error;report.captureCompleted=false;
        report.errors.capture.push({message:'Server cleanup: '+String(error&&error.stack||error)});
      }
      try{
        await workspaceGuard.checkpoint('before completion fingerprints');
        report.sourceAtCompletion=await readRepositoryFingerprint(root);
        report.runtimeAtCompletion=await readRuntimeFingerprint(root);
        requireSourceIdentity(report.sourceAtCompletion,'completion');
        requireRuntimeIdentity(report.runtimeAtCompletion,'completion');
        report.sourceStable=sameSource(report.source,report.sourceAtCompletion);
        report.runtimeStable=sameRuntime(report.runtime,report.runtimeAtCompletion);
        if(!report.sourceStable||!report.runtimeStable)
          throw new Error('SOURCE_OR_RUNTIME_CHANGED_DURING_CAPTURE');
      }catch(error){
        failure??=error;report.captureCompleted=false;
        report.errors.capture.push({message:String(error&&error.stack||error)});
      }
      report.machineOutcome='PENDING_FINAL_RELEASE';
      report.completedAt=new Date().toISOString();
    }
  }catch(error){
    failure??=error;
    if(report){
      report.captureCompleted=false;report.machineOutcome='FAIL';
      report.errors.capture.push({message:String(error&&error.stack||error)});
    }
  }finally{
    let releaseSucceeded=false;
    if(workspaceGuard){
      if(report)try{
        report.machineOutcome='PENDING_FINAL_RELEASE';
        await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');
      }catch(error){
        failure??=error;report.captureCompleted=false;
        report.errors.capture.push({message:'Provisional report write: '+String(error&&error.stack||error)});
      }
      try{
        await workspaceGuard.release({assertStable:true,
          name:'Stage 8 team-identification final release'});
        workspaceGuard=null;releaseSucceeded=true;
      }catch(error){
        failure??=error;
        if(report){
          report.captureCompleted=false;
          report.errors.capture.push({message:'Workspace freeze release: '+String(error&&error.stack||error)});
        }
      }
      if(report){
        report.machineOutcome=releaseSucceeded&&report.captureCompleted&&!failure?'PASS':'FAIL';
        report.completedAt=new Date().toISOString();
        let outputOwned=true;
        try{await outputLease.checkpoint();}
        catch(error){
          outputOwned=false;failure??=error;report.captureCompleted=false;report.machineOutcome='FAIL';
          report.errors.capture.push({message:'Final output lease checkpoint: '+String(error&&error.stack||error)});
        }
        if(outputOwned)try{await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');}
        catch(error){
          failure??=error;report.captureCompleted=false;report.machineOutcome='FAIL';
          report.errors.capture.push({message:'Final report write: '+String(error&&error.stack||error)});
        }
      }
    }
    if(outputLease)try{await outputLease.release();}
    catch(error){
      /* The final report was already written after an owned-lease checkpoint.
         Cleanup failure cannot make that evidence stale; the next run safely
         reclaims a same-host lease after this PID exits. */
      console.warn('Output lease cleanup deferred: '+String(error&&error.stack||error));
    }
  }
  if(report)console.log(JSON.stringify({
    runId,report:reportPath,machineOutcome:report.machineOutcome,
    acceptanceOutcome:report.acceptanceOutcome,states:report.captures.length,
    pngs:report.captures.length*2,gpu:report.gpu,errors:report.errors
  },null,2));
  if(failure)throw failure;
}

main().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
