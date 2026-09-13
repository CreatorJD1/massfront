#!/usr/bin/env node
/* Focused, source-matched hardware-GPU proof for the reference VFX pass.
   Captures phone-portrait void impacts, deterministic held/pulsed beams and the
   current cloud baseline. This tool never changes gameplay state on disk. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync,readFileSync} from 'node:fs';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

process.env.PW_CDP_PORT||='9476';
const {launchPwBrowser,closePwBrowser}=await import('./pw-browser.mjs');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'releases','vfx-reference-pass');
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.glb':'model/gltf-binary','.ktx2':'image/ktx2','.ogg':'audio/ogg','.m4a':'audio/mp4'};
const server=createServer(async(req,res)=>{try{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
  const f=resolve(join(root,p));if(!f.startsWith(root)||!existsSync(f)){res.writeHead(404);res.end('nf');return;}
  res.writeHead(200,{'Content-Type':MIME[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(await readFile(f));
}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}/?fxprobe=1&referencepass=1`;
const checks=[];const check=(name,pass,evidence='')=>{checks.push({name,pass:!!pass,evidence});console.log(`${pass?'PASS':'FAIL'} ${name}${evidence?' ['+evidence+']':''}`);};
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const identity={head:execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sources:['src/engine/vfxlayers.js','src/engine/volfx.js','src/game/sim.js','src/ui/render3d.js','src/engine/cloudfx.js'].map(f=>({file:f,sha256:sha(join(root,f))}))};

const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
const pageErrors=[];
try{
  const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  page.on('pageerror',e=>pageErrors.push(String(e.message||e)));
  await page.addInitScript(()=>{for(const [k,v] of [['mf_ap_gate_closed','1'],['mf_ap_dismissed','1'],['mf_offline','1'],['mf_auth_gate_v1','1'],['mf_prealpha_cinematic_v2','test-seen']])localStorage.setItem(k,v);});
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof mfEmitMacroFx==='function'&&
    typeof mfBeamUpsert==='function'&&typeof mfCloudFxSample==='function',null,{timeout:120000});
  const gpu=await page.evaluate(()=>{const c=document.createElement('canvas'),g=c.getContext('webgl2');if(!g)return 'NO-WEBGL2';const d=g.getExtension('WEBGL_debug_renderer_info');return d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER);});
  check('hardware ANGLE D3D11',/ANGLE.*Direct3D11|ANGLE.*D3D11/i.test(gpu)&&!/swiftshader|software|llvmpipe/i.test(gpu),gpu);
  await page.evaluate(()=>{
    try{if(typeof apClose==='function')apClose();}catch{}try{if(typeof stopAttract==='function')stopAttract();}catch{}
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfBootCover','apOverlay','loadScr','mfIntroSkip','mfIntroReplay','pauseOverlay','gameOver','levelUp','dispatch','setupScr','startScreen']){const e=document.getElementById(id);if(e)e.style.setProperty('display','none','important');}
    document.querySelectorAll('.mfTitleReveal').forEach(e=>e.style.setProperty('display','none','important'));
    for(const el of [...document.body.children])if(el.id!=='gl')el.style.display='none';
    cv.style.display='block';cv.style.position='fixed';cv.style.inset='0';cv.style.width='100vw';cv.style.height='100vh';
    attractOn=false;demoMode=false;matchLive=true;fogOn=false;running=true;paused=true;gameEnded=false;
    if(META&&META.settings){META.settings.fog=false;META.settings.dayNight=false;META.settings.quality='high';META.settings.cine=true;}
    if(typeof applySettings==='function')applySettings();perfScale=1;dayT=.08;
    if(typeof GFX!=='undefined'){GFX.particles=1;GFX.volSteps=24;GFX.ao=true;GFX.bloom=true;}
    resetWorld();let cx=MAP*.5,cy=MAP*.5,best=-1;
    for(let y=MAP*.18;y<=MAP*.82;y+=128)for(let x=MAP*.18;x<=MAP*.82;x+=128){const h=terrainH(x,y);if(typeof WATER_Y!=='undefined'&&h<WATER_Y+1.5)continue;let d=420;if(typeof blds!=='undefined')for(const B of blds)if(B&&B.alive)d=Math.min(d,Math.hypot(B.x-x,B.y-y));if(d>best){best=d;cx=x;cy=y;}}
    window.__refPoint=[cx,cy];cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.24;camPitch=pitchTarget=1.12;orthoSpan=distTarget=255;
    if(typeof resize==='function')resize();if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
  });
  await page.evaluate(()=>{if(typeof macroFxBoot==='function')macroFxBoot();});
  await page.waitForFunction(()=>{const t=typeof macroFxTelemetry==='function'?macroFxTelemetry():null;return !!t&&t.energy==='ready'&&t.blast==='ready';},null,{timeout:90000});
  await page.waitForTimeout(1500);
  const shot=async name=>{const p=join(outDir,name);await page.screenshot({path:p,type:'png',animations:'disabled'});return {path:p,sha256:sha(p)};};

  async function impact(kind,name,frames){
    const result=await page.evaluate(({kind,frames})=>{
      resetWorld();beams.length=0;paused=true;fogOn=false;volFxClear();GFX.volSteps=24;mfMacroFxResetTelemetry();
      const [cx,cy]=window.__refPoint;cam.x=cx;cam.y=cy;orthoSpan=distTarget=255;if(typeof camUpdateMatrices==='function')camUpdateMatrices();
      mfEmitMacroFx(MF_MACRO_FX_DIRECT,cx,cy,{size:26,coreRadius:23,coreLife:.44,weaponClass:kind,
        faction:'syndicate',direction:[1,.28],seed:11.75,debrisCount:0,shock:false});
      for(let n=0;n<frames;n++){stats.t+=1/60;updParticles(1/60);render(1/60);}
      return {recipe:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()}};
    },{kind,frames});
    return {result,capture:await shot(name)};
  }
  const generic=await impact('ion','01-generic-ion-impact-phone.png',8);
  const void3=await impact('void','02-void-impact-ignition-phone.png',3);
  const void8=await impact('void','03-void-impact-crescent-phone.png',8);
  const void14=await impact('void','04-void-impact-collapse-phone.png',14);
  const ve=void8.result.recipe.events[0];
  check('void direct impact is one authoritative raymarched layer',void8.result.recipe.events.length===1&&ve.weaponClass==='void'&&ve.layers===1&&ve.layerKinds[0]==='impact-volume'&&void8.result.recipe.forbiddenGpu===0,JSON.stringify(ve));
  check('void volume uses High 24-step composite',void8.result.volume.presentedImpact===1&&void8.result.volume.steps===24&&void8.result.volume.drawn===1,JSON.stringify(void8.result.volume));

  const fallback=await page.evaluate(()=>{
    resetWorld();volFxClear();GFX.volSteps=24;mfMacroFxResetTelemetry();const [cx,cy]=window.__refPoint;
    mfEmitMacroFx(MF_MACRO_FX_DIRECT,cx,cy,{size:26,coreRadius:23,weaponClass:'void',faction:'syndicate',direction:[1,.28],seed:11.75});
    GFX.volSteps=0;for(let n=0;n<8;n++){stats.t+=1/60;updParticles(1/60);render(1/60);}
    let impactCards=0;for(let i=0;i<fCount;i++)if(ftype[i]===19&&flife[i]>0)impactCards++;
    const out={macro:JSON.parse(JSON.stringify(mfMacroFxTelemetry())),volume:{...volFxTelemetry()},impactCards};GFX.volSteps=24;return out;
  });
  check('void volume failure atomically reveals one fallback',fallback.volume.drawn===0&&fallback.volume.fallbackHits===0&&fallback.impactCards===1&&fallback.macro.events.length===1,JSON.stringify(fallback));

  const beam=await page.evaluate(()=>{
    resetWorld();beams.length=0;paused=true;fogOn=false;
    /* This frame proves shaft continuity, not structure occlusion. Remove the
       generated city only inside the synthetic capture so a correctly
       depth-tested beam is not mistaken for a segmented/broken ribbon. */
    blds.length=0;if(typeof rebuildBGrid==='function')rebuildBGrid(true);
    const [cx,cy]=window.__refPoint;cam.x=cx;cam.y=cy;camYaw=yawTarget=.08;camPitch=pitchTarget=1.12;
    orthoSpan=distTarget=235;if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    /* Put real turret-height endpoints under both channels. This keeps the
       shaft above the terrain for the whole path and makes any remaining gap
       a ribbon defect rather than legitimate scene-depth occlusion. */
    if(typeof addBld==='function'){
      addBld('turret',0,cx-105,cy-32,true);addBld('turret',1,cx+105,cy-32,true);
      addBld('turret',0,cx-105,cy+38,true);addBld('turret',1,cx+105,cy+38,true);
      if(typeof rebuildBGrid==='function')rebuildBGrid(true);
    }
    for(let n=0;n<600;n++)mfBeamUpsert('probe:pulse',cx-105,cy-32,cx+105,cy-32,7.2,172,92,255,'pulse',1,{lease:8,immediate:true,pulseHz:1.5,pulseDuty:.68,fadeOut:.15,endCap:'hit'});
    mfBeamUpsert('probe:steady',cx-105,cy+38,cx+105,cy+38,5.6,72,192,255,'lance',0,{lease:8,immediate:true,endCap:'hit'});
    for(let n=0;n<10;n++)beamTick(1/60);render(1/60);
    const snap=()=>beams.map(b=>({key:b.key,held:b.held,age:b.age,phase:b.phase,level:b.level,x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,seed:b.seed}));
    const before={state:snap(),gpfxLive,fCount,macro:mfMacroFxTelemetry().total};
    for(let n=0;n<120;n++)render(0);
    const after={state:snap(),gpfxLive,fCount,macro:mfMacroFxTelemetry().total};
    return {before,after,count:beams.length};
  });
  const beamCapture=await shot('05-keyed-steady-pulsed-beams-phone.png');
  check('600 keyed refreshes allocate one pulse plus one steady record',beam.count===2,JSON.stringify(beam.before.state));
  check('paused redraw cannot advance or emit beam state',JSON.stringify(beam.before)===JSON.stringify(beam.after),JSON.stringify({before:beam.before,after:beam.after}));
  const stopped=await page.evaluate(()=>{mfBeamStop('probe:pulse',.15);let n=0;while(beams.some(b=>b.key==='probe:pulse')&&n<60){beamTick(1/60);n++;}return {ticks:n,left:beams.filter(b=>b.key==='probe:pulse').length,total:beams.length};});
  check('keyed beam stop fades and retires deterministically',stopped.left===0&&stopped.ticks===9,JSON.stringify(stopped));

  const cloudCaptures=[];
  for(const [span,name] of [[900,'06-cloud-billboard-baseline-tactical-phone.png'],[2200,'07-cloud-billboard-baseline-high-altitude-phone.png'],[3800,'08-cloud-billboard-baseline-orbital-phone.png']]){
    await page.evaluate(span=>{
      resetWorld();beams.length=0;paused=true;fogOn=false;stats.t=37.25;
      const sample=mfCloudFxSample({time:stats.t,quality:'high',perfScale:1,mapSize:MAP,mapId:curMap,seed:MAPDEFS[curMap]&&MAPDEFS[curMap].seed,daylight:1,ground:terrainH});
      const body=sample.find(L=>L.kind==='body')||sample[0];if(body){cam.x=body.x;cam.y=body.y;}orthoSpan=distTarget=span;
      if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();render(1/60);
    },span);
    cloudCaptures.push(await shot(name));
  }
  check('no page errors',pageErrors.length===0,pageErrors.join(' | ')||'none');
  const report={when:new Date().toISOString(),identity,gpu,viewport:{css:[430,932],dpr:2},checks,
    captures:[generic.capture,void3.capture,void8.capture,void14.capture,beamCapture,...cloudCaptures],
    note:'Cloud images are a validated billboard baseline; post-effect implementation remains pending.'};
  await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2));
  if(checks.some(c=>!c.pass))process.exitCode=1;
}finally{
  await closePwBrowser(browser).catch(()=>{});await new Promise(r=>server.close(r));
}
