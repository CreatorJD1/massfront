#!/usr/bin/env node
/* Hardware-browser Stage 8 music-state probe.
   Boots the real source offline, blocks every non-loopback request, unlocks
   WebAudio with a pointer gesture, captures Settings > Audio in menu/deploy/
   battle/result states, and drives the real wrapped endGame() for both result
   outcomes. Evidence is written only beneath .tmp/. */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {readRepositoryFingerprint,readRuntimeFingerprint} from './interface-audit/verify-interface-matrix.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const label=process.argv[2]||'stage8-music-states';
const out=join(root,'.tmp',label);
await mkdir(out,{recursive:true});
const guard=await acquireVerificationFreeze({root,label:`Stage 8 music probe ${label}`,allowedPaths:[out]});
const source=await readRepositoryFingerprint(root),runtime=await readRuntimeFingerprint(root);
const sha256=value=>createHash('sha256').update(value).digest('hex');
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.glb':'model/gltf-binary','.wasm':'application/wasm',
  '.webmanifest':'application/manifest+json','.basis':'application/octet-stream'};
let server,browser,page,report={schema:1,label,generatedAt:new Date().toISOString(),source,runtime,
  gpu:null,events:[],screenshots:[],errors:{page:[],console:[],requests:[],externalAttempts:[]},checks:[]};
const check=(name,ok,detail='')=>{report.checks.push({name,ok:!!ok,detail});if(!ok)throw new Error(name+(detail?': '+detail:''));};

async function capture(name,selector){
  const path=join(out,name+'.png');
  const bytes=await page.screenshot({path});
  const metric=await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect(),c=getComputedStyle(el);
    return {display:c.display,visible:c.visibility!=='hidden'&&Number(c.opacity)!==0&&r.width>0&&r.height>0,
      rect:{x:r.x,y:r.y,w:r.width,h:r.height},viewport:{w:innerWidth,h:innerHeight},
      text:(el.textContent||'').replace(/\s+/g,' ').trim(),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
  });
  check(name+' visible',metric.visible,JSON.stringify(metric));
  check(name+' in viewport',metric.rect.x>=-1&&metric.rect.y>=-1&&
    metric.rect.x+metric.rect.w<=metric.viewport.w+1&&metric.rect.y+metric.rect.h<=metric.viewport.h+1,
    JSON.stringify(metric.rect));
  check(name+' no horizontal overflow',metric.scrollWidth<=metric.clientWidth+1,
    `${metric.scrollWidth}/${metric.clientWidth}`);
  report.screenshots.push({name,file:name+'.png',bytes:bytes.length,sha256:sha256(bytes),metric});
}
async function showAudioState(scene){
  return page.evaluate(scene=>{
    hideFrontScreens('settingsScr');
    const settings=document.getElementById('settingsScr');if(settings)settings.style.display='flex';
    if(scene==='menu') audMusicEnterScreen('settingsScr');
    else if(scene==='wartable') audMusicEnterScreen('setupScr');
    else if(scene==='action'){
      PLAY.lockedScene=false;PLAY.expectMatch=false;PLAY.wasLive=true;PLAY.scene='action';PLAY.state='combat';
      if(typeof musicInt!=='undefined')musicInt=1;
      if(!audPlaylistTick())audMusicTick(0);
    }
    if(scene==='menu'||scene==='wartable'){
      if(!audPlaylistTick())audMusicTick(0);
    }
    /* The action state normally follows seconds of combat hysteresis, during
       which audMusSwap counts down. Advance that same public tick to capture
       the settled state rather than a deliberately crossfading predecessor. */
    if(scene==='action'&&audMusicDebug().bed!=='mus_combat')audMusicTick(9);
    renderSettings();audRenderNowPlaying();
    return audMusicDebug();
  },scene);
}
async function runResult(win){
  await page.evaluate(win=>{
    const settings=document.getElementById('settingsScr');if(settings)settings.style.display='none';
    const go=document.getElementById('gameOver');if(go)go.style.display='none';
    if(typeof syncPush==='function')syncPush=()=>Promise.resolve();
    try{if(typeof stopAttract==='function')stopAttract();}catch(e){}
    demoMode=true;matchLive=true;running=true;paused=true;gameEnded=false;
    stats.t=190;stats.kills=[win?22:7,win?5:18,0];stats.built=[6,2];stats.nests=0;stats.reclaimed=0;
    if(typeof resDone!=='undefined')resDone=0;
    endGame(!!win,win?'Enemy commanders destroyed':'Your Commander was destroyed');
  },win);
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('gameOver')).display==='flex',null,{timeout:8000});
  await page.evaluate(()=>{try{audMusicTick(0);}catch(e){}});
  const wanted=win?'mus_ambient':'mus_tension';
  await page.waitForFunction(w=>audMusicDebug().bed===w||audMusicDebug().status.cue===w,wanted,{timeout:8000});
  const state=await page.evaluate(()=>audMusicDebug());
  check((win?'victory':'defeat')+' explicit scene',state.scene===(win?'result-victory':'result-defeat'),JSON.stringify(state));
  check((win?'victory':'defeat')+' fallback cue',state.status.cue===wanted,JSON.stringify(state.status));
  report.events.push({step:win?'result-victory':'result-defeat',...state});
  await capture(win?'result-victory':'result-defeat','#gameOver');
  await page.evaluate(()=>{
    const go=document.getElementById('gameOver');if(go)go.style.display='none';
    hideFrontScreens('settingsScr');const settings=document.getElementById('settingsScr');if(settings)settings.style.display='flex';
    renderSettings();audRenderNowPlaying();
  });
  await capture(win?'audio-victory':'audio-defeat','#audNowPlaying');
}

try{
  server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url||'/','http://127.0.0.1').pathname);
      const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      const rel=relative(root,file);
      if(!rel||rel.startsWith('..'+sep)||resolve(root,rel)!==file||!existsSync(file))throw new Error('not found');
      const bytes=await readFile(file);res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
    }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('not found');}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url=`http://127.0.0.1:${server.address().port}/`,origin=new URL(url).origin;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
  page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true,isMobile:true,colorScheme:'dark'});
  page.on('pageerror',e=>report.errors.page.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.console.push(m.text());});
  page.on('requestfailed',r=>report.errors.requests.push({url:r.url(),error:r.failure()?.errorText||'failed'}));
  await page.route('**/*',route=>{
    const request=route.request(),u=request.url();
    try{
      const parsed=new URL(u);
      if(parsed.origin===origin||parsed.protocol==='data:'||parsed.protocol==='blob:')return route.continue();
    }catch(e){}
    report.errors.externalAttempts.push(u);return route.abort('blockedbyclient');
  });
  await page.addInitScript(()=>{try{
    localStorage.clear();
    localStorage.setItem('mf_offline','1');localStorage.setItem('massfront_offline','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','music-probe-seen');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
  }catch(e){}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  report.gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof audMusicDebug==='function'&&typeof audMusicEnterResult==='function'&&
    typeof renderSettings==='function'&&typeof endGame==='function'&&endGame.__mfVoice&&
    typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady===true,null,{timeout:120000});
  await page.evaluate(()=>{
    try{if(typeof apGateSatisfied==='function')apGateSatisfied();}catch(e){}
    try{if(typeof apClose==='function')apClose();}catch(e){}
    try{if(typeof stopAttract==='function')stopAttract();}catch(e){}
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfBootCover','apOverlay','apConfirmOverlay','loadScr','mfIntroSkip','mfIntroReplay']){
      const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
    }
  });
  await page.mouse.click(24,24); // real pointer gesture unlocks the shared AudioContext path
  await page.waitForTimeout(2500);

  for(const [step,scene,file,cue] of [['menu','menu','audio-menu','mus_ambient'],
    ['deployment','wartable','audio-deployment','mus_tension'],['battle','action','audio-battle','mus_combat']]){
    const state=await showAudioState(scene);report.events.push({step,...state});
    check(step+' scene',state.scene===scene,JSON.stringify(state));
    check(step+' settled cue',state.status.cue===cue,JSON.stringify(state.status));
    await capture(file,'#audNowPlaying');
  }
  await runResult(true);
  await runResult(false);

  check('no page errors',report.errors.page.length===0,report.errors.page.join(' | '));
  check('no console errors',report.errors.console.length===0,report.errors.console.join(' | '));
  check('no failed local requests',report.errors.requests.length===0,JSON.stringify(report.errors.requests));
  check('no non-loopback attempts',report.errors.externalAttempts.length===0,JSON.stringify(report.errors.externalAttempts));
  await guard.checkpoint('after browser states');
  const sourceAfter=await readRepositoryFingerprint(root),runtimeAfter=await readRuntimeFingerprint(root);
  check('source stable',sourceAfter.head===source.head&&sourceAfter.dirtyFingerprint===source.dirtyFingerprint);
  check('runtime stable',runtimeAfter.fingerprint===runtime.fingerprint);
  report.sourceAtCompletion=sourceAfter;report.runtimeAtCompletion=runtimeAfter;report.outcome='PASS';
}catch(error){
  report.outcome='FAIL';report.failure=String(error&&error.stack||error);process.exitCode=1;
}finally{
  if(page)try{await page.close();}catch(e){}
  if(browser)try{await closePwBrowser(browser);}catch(e){}
  if(server)await new Promise(ok=>server.close(ok));
  try{await guard.release({assertStable:true,name:'Stage 8 music probe release'});}catch(error){report.outcome='FAIL';report.failure=(report.failure?report.failure+'\n':'')+String(error&&error.stack||error);process.exitCode=1;}
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log(JSON.stringify({outcome:report.outcome,gpu:report.gpu,events:report.events.map(e=>({step:e.step,scene:e.scene,bed:e.bed,title:e.status&&e.status.title,cue:e.status&&e.status.cue})),screenshots:report.screenshots.map(s=>s.file),errors:report.errors},null,2));
}
