#!/usr/bin/env node
/* Bounded, source-first Stage 8 accessibility acceptance. This deliberately
   serves the canonical checkout rather than www/, acquires the cooperative
   verification freeze, uses hardware WebGL, and binds every result to the
   repository fingerprint that produced it. */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {readRepositoryFingerprint} from './interface-audit/verify-interface-matrix.mjs';
import {installOfflineNetworkIsolation} from './offline-network-isolation.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','stage8-accessibility');
const guard=await acquireVerificationFreeze({
  root,label:'Stage 8 accessibility acceptance',quietMs:Number(process.env.MF_QUIET_PREFLIGHT_MS||15000),allowedPaths:[outDir]
});
const screenshotFiles=['settings-text-100.png','settings-text-200.png','deployed-hud-text-200.png','settings-forced-colors.png','muted-monochrome-alarms.png'];
const outputFiles=['report.json',...screenshotFiles];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const boundFiles=['index.html','src/game/meta.js','src/main.js','src/styles/ui.css','src/ui/hud.js'];
async function fileBindings(){
  const out={};for(const name of boundFiles){const bytes=await readFile(join(root,name));out[name]={sha256:hash(bytes),bytes:bytes.length};}return out;
}
let report;
try{
  await mkdir(outDir,{recursive:true});
  for(const name of outputFiles)await rm(join(outDir,name),{force:true});
  report={
    schema:'massfront-stage8-accessibility-v1',generatedAt:new Date().toISOString(),machineOutcome:'RUNNING',captureCompleted:false,
    served:'canonical-local-source',source:await readRepositoryFingerprint(root),sourceAtCompletion:null,
    boundFiles:await fileBindings(),boundFilesAtCompletion:null,screenshotBindingsAtCompletion:null,
    url:null,browser:null,gpu:null,networkIsolation:null,
    viewport:{width:412,height:900,dpr:1},checks:{},screenshots:[],errors:[],failures:[]
  };
}catch(error){
  try{await guard.release({assertStable:true,name:'Stage 8 accessibility setup failure release'});}
  catch(releaseError){throw new AggregateError([error,releaseError],'Accessibility probe setup and freeze release both failed');}
  throw error;
}
const check=(ok,message)=>{if(!ok)report.failures.push(message);return !!ok;};
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4',
  '.mp3':'audio/mpeg','.wav':'audio/wav','.glb':'model/gltf-binary','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let route=decodeURIComponent((req.url||'/').split('?')[0]);if(route==='/')route='/index.html';
    const file=resolve(join(root,route)),rootKey=root.toLowerCase();
    if(!(file.toLowerCase()===rootKey||file.toLowerCase().startsWith(rootKey+'\\'))||!existsSync(file)){
      res.writeHead(404);res.end('not found');return;
    }
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  }catch(error){res.writeHead(500);res.end(String(error&&error.message||error));}
});
let browser=null,page=null,offline=null,fatal=null,captureReady=false;
async function shot(name){
  const path=join(outDir,name),bytes=await page.screenshot({path,fullPage:false});
  report.screenshots.push({file:name,sha256:hash(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
}
async function boot(){
  await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof showFrontScreen==='function'&&typeof renderSettings==='function'&&
    typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady===true,null,{timeout:120000});
  await page.evaluate(()=>{
    try{if(typeof apClose==='function')apClose();}catch{}
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfBootCover','apOverlay','apConfirmOverlay','loadScr','mfIntroSkip','mfIntroReplay']){
      const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(el=>el.style.setProperty('display','none','important'));
    if(typeof stopAttract==='function')stopAttract();
    if(typeof renderMetaHead==='function')renderMetaHead();
    showFrontScreen('startScreen');
  });
  await page.waitForTimeout(100);
}
async function enterDeployedMatch(){
  const route=[];
  await page.locator('#startBtn').waitFor({state:'visible',timeout:30_000});
  await page.locator('#startBtn').click();await page.waitForTimeout(500);route.push('startBtn');
  const standard=page.locator('.warCard[data-mode="standard"]');
  await standard.waitFor({state:'visible',timeout:30_000});await standard.click();await page.waitForTimeout(500);route.push('standard');
  const advance=page.locator('#setupStart');await advance.waitFor({state:'visible',timeout:60_000});
  for(let step=0;step<4;step++){
    route.push(await advance.evaluate((el,n)=>({step:n,label:(el.textContent||'').trim(),galaxyStage:typeof mfGalaxyStage==='undefined'?null:mfGalaxyStage}),step));
    await advance.click();await page.waitForTimeout(500);
  }
  route.push({step:4,label:(await advance.textContent()||'').trim()});
  await advance.click();
  const deploy=page.locator('#deployBtn');await deploy.waitFor({state:'visible',timeout:180_000});await deploy.click();
  await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive&&running&&document.body.classList.contains('hudTacticalDock'),null,{timeout:180_000});
  await page.waitForTimeout(800);
  return {route,state:await page.evaluate(()=>({matchLive,running,paused,hudTacticalDock:document.body.classList.contains('hudTacticalDock')}))};
}
try{
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  report.url=`http://127.0.0.1:${server.address().port}/`;
  browser=await launchPwBrowser({
    ownershipMode:'isolated',headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
  });
  report.browser={name:'chromium',version:typeof browser.version==='function'?browser.version():'unknown',headless:true};
  page=await browser.newPage({viewport:{width:412,height:900},deviceScaleFactor:1,hasTouch:true,colorScheme:'dark',serviceWorkers:'block'});
  page.on('pageerror',error=>report.errors.push({kind:'pageerror',message:error.message}));
  page.on('console',message=>{if(message.type()==='error')report.errors.push({kind:'console',message:message.text()});});
  page.on('response',response=>{if(response.status()>=400&&response.url().startsWith(report.url))report.errors.push({kind:'http',status:response.status(),url:response.url()});});
  page.on('requestfailed',request=>report.errors.push({kind:'requestfailed',url:request.url(),message:request.failure()?.errorText||'request failed'}));
  offline=await installOfflineNetworkIsolation(page);
  await page.addInitScript(()=>{
    try{
      localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_offline','1');localStorage.setItem('massfront_offline','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
      localStorage.setItem('mf_auth_gate_v1','1');
    }catch{}
    addEventListener('webglcontextlost',()=>window.__mfA11yContextLosses=(window.__mfA11yContextLosses||0)+1,true);
  });
  await boot();
  report.gpu=await assertHardwareGpu(page);
  await guard.checkpoint('after accessibility boot');

  /* Four real computed-size samples plus two screenshots. System stays selected
     so the row being tested is actually visible, not merely present in DOM. */
  const scales=[];
  for(const pct of [100,125,150,200]){
    const metrics=await page.evaluate(value=>{
      META.settings.textScale=value;metaSave();applySettings();renderSettings();showFrontScreen('settingsScr');
      const list=document.getElementById('setList');if(typeof mfSetTabs==='function')mfSetTabs(list,'system',false);
      const row=list.querySelector('[data-set="textScale"]');if(row)row.scrollIntoView({block:'center'});
      const px=sel=>parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      const screen=document.getElementById('settingsScr');
      return {requested:value,root:document.documentElement.dataset.mfTextScale,
        primary:px('#setBack'),setting:px('[data-set="textScale"] .sTx b'),critical:px('#goalBar'),
        rowText:(row&&row.innerText||'').replace(/\s+/g,' ').trim(),
        horizontalOverflow:Math.max(0,screen.scrollWidth-screen.clientWidth),verticalScrollable:screen.scrollHeight>screen.clientHeight+1};
    },pct);
    await page.waitForTimeout(80);scales.push(metrics);
    if(pct===100||pct===200)await shot(`settings-text-${pct}.png`);
  }
  report.checks.textScale={samples:scales};
  for(const [i,pct] of [100,125,150,200].entries())check(scales[i].root===String(pct),`root text scale did not apply ${pct}%`);
  for(const key of ['primary','setting','critical']){
    check(scales[1][key]>=scales[0][key]*1.2,`${key} text did not reach 125%`);
    check(scales[2][key]>=scales[0][key]*1.45,`${key} text did not reach 150%`);
    check(scales[3][key]>=scales[0][key]*1.9,`${key} text did not reach 200%`);
  }
  check(scales.every(s=>s.horizontalOverflow<=1),'text scaling created whole-screen horizontal overflow');

  /* Persist 150%, reload the complete source runtime, then restore 100% for
     the routing and dense-HUD checks. */
  await page.evaluate(()=>{META.settings.textScale=150;metaSave();applySettings();});
  await boot();
  const persisted=await page.evaluate(()=>({stored:META.settings.textScale,root:document.documentElement.dataset.mfTextScale}));
  report.checks.textScale.persisted=persisted;
  check(persisted.stored===150&&persisted.root==='150','text scale did not survive a full reload');
  await page.evaluate(()=>{META.settings.textScale=100;metaSave();applySettings();showFrontScreen('startScreen');});
  await page.waitForTimeout(100);

  /* Keyboard path through actual wired controls, followed by the same Escape
     hierarchy Android Back uses. */
  const focus=[];
  const snap=async label=>focus.push(await page.evaluate(name=>{const a=document.activeElement;return {label:name,screen:document.body.dataset.frontScreen||'',
    active:a&&(a.id||(a.dataset&&a.dataset.mode?'mode:'+a.dataset.mode:a.tagName+':'+String(a.className||'').split(/\s+/)[0]))||'',
    pause:getComputedStyle(document.getElementById('pauseOverlay')).display,paused:!!paused};},label));
  await snap('home-entry');
  await page.keyboard.press('Enter');await page.waitForFunction(()=>document.body.dataset.frontScreen==='warScr');await page.waitForTimeout(80);await snap('war-entry');
  const standard=page.locator('.warCard[data-mode="standard"]');await standard.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.body.dataset.frontScreen==='setupScr');await page.waitForTimeout(80);await snap('setup-entry');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.body.dataset.frontScreen==='warScr');await page.waitForTimeout(80);await snap('setup-back');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.body.dataset.frontScreen==='startScreen');await page.waitForTimeout(80);await snap('war-back');
  await page.locator('#settingsBtn').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.body.dataset.frontScreen==='settingsScr');await page.waitForTimeout(80);await snap('settings-entry');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.body.dataset.frontScreen==='startScreen');await page.waitForTimeout(80);await snap('settings-back');
  report.checks.focusAndBack={states:focus};
  const active=label=>focus.find(s=>s.label===label)?.active;
  check(active('home-entry')==='startBtn','home entry did not focus WAR ROOM');
  check(/^H[12]:/.test(active('war-entry')),'War Room entry did not start at its heading');
  check(/^H[12]:/.test(active('setup-entry')),'Battle Setup entry did not start at its heading');
  check(active('setup-back')==='mode:standard','Setup Back did not restore the Standard card');
  check(active('war-back')==='startBtn','War Room Back did not restore WAR ROOM');
  check(/^H[12]:/.test(active('settings-entry')),'Settings entry did not start at its heading');
  check(active('settings-back')==='settingsBtn','Settings Back did not restore its trigger');

  const deployed=await enterDeployedMatch();report.checks.deployedRoute=deployed;
  check(deployed.state.matchLive&&deployed.state.running&&deployed.state.hudTacticalDock,'accessibility HUD proof did not use a real deployed match');
  const hud200=await page.evaluate(async()=>{
    META.settings.textScale=200;META.settings.sound=false;metaSave();applySettings();
    const goal=document.getElementById('goalBar'),inf=document.getElementById('infMeter');
    goal.innerHTML='ELIMINATE ENEMY HEADQUARTERS <span class="clk">42:00</span>';
    inf.textContent='HIVE THREAT · CRITICAL MASS 100%';
    goal.style.setProperty('display','flex','important');inf.style.setProperty('display','flex','important');
    showAlert(400,520,'attack');setWaveWarning(1200,520,400,520,24,3,12);
    document.getElementById('atkAlert').style.setProperty('display','block','important');
    document.getElementById('waveAlert').style.setProperty('display','block','important');
    if(typeof mfFlowLayout==='function')mfFlowLayout();
    await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
    const metric=id=>{const el=document.getElementById(id),s=getComputedStyle(el),r=el.getBoundingClientRect();return {
      id,display:s.display,fontSize:parseFloat(s.fontSize),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
      client:{width:el.clientWidth,height:el.clientHeight},scroll:{width:el.scrollWidth,height:el.scrollHeight},overflow:{x:s.overflowX,y:s.overflowY},
      clipped:el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1,
      contained:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};};
    return {root:document.documentElement.dataset.mfTextScale,matchLive,running,viewport:{width:innerWidth,height:innerHeight},
      plates:['goalBar','infMeter','atkAlert','waveAlert'].map(metric)};
  });
  report.checks.deployedHudText200=hud200;await shot('deployed-hud-text-200.png');
  check(hud200.root==='200'&&hud200.matchLive&&hud200.running,'200% HUD proof was not captured in a live match');
  for(const plate of hud200.plates){
    check(plate.display!=='none'&&plate.rect.width>0&&plate.rect.height>0,`${plate.id} was not visible at 200% in the deployed HUD`);
    check(!plate.clipped,`${plate.id} clipped its text at 200%`);
    check(plate.contained,`${plate.id} left the viewport at 200%`);
  }
  await page.evaluate(()=>{
    for(const id of ['goalBar','infMeter'])document.getElementById(id).style.removeProperty('display');
    for(const id of ['atkAlert','waveAlert'])document.getElementById(id).style.setProperty('display','none');
    clearTimeout(showAlert._t);alertPos=null;if(typeof clearWaveWarning==='function')clearWaveWarning();
    META.settings.textScale=100;metaSave();applySettings();
  });

  const pause=await page.evaluate(async()=>{
    const baselineInert=[...document.body.children].filter(el=>el.inert).map(el=>el.id||el.tagName);
    const menu=document.getElementById('menuBtn');menu.focus();mfOpenPause();await new Promise(requestAnimationFrame);
    return {active:document.activeElement&&document.activeElement.id,display:getComputedStyle(document.getElementById('pauseOverlay')).display,paused,
      baselineInert,inert:[...document.body.children].filter(el=>el.inert).map(el=>el.id||el.tagName)};
  });
  await page.keyboard.press('Shift+Tab');const pauseShiftWrap=await page.evaluate(()=>document.activeElement&&document.activeElement.id);
  await page.keyboard.press('Tab');const pauseForwardWrap=await page.evaluate(()=>document.activeElement&&document.activeElement.id);
  const pauseBlockedTactical=await page.evaluate(()=>{
    const before=gameSpeed,el=document.getElementById('spdBtn');
    const ev=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});const dispatched=el.dispatchEvent(ev);
    return {before,after:gameSpeed,defaultPrevented:ev.defaultPrevented,dispatched,active:document.activeElement&&document.activeElement.id};
  });
  await page.locator('#pauseSettings').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.body.dataset.frontScreen==='settingsScr');await page.waitForTimeout(80);
  const pauseSettingsOpen=await page.evaluate(()=>({active:document.activeElement&&document.activeElement.id,
    pause:getComputedStyle(document.getElementById('pauseOverlay')).display,inert:[...document.body.children].filter(el=>el.inert).map(el=>el.id||el.tagName)}));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>getComputedStyle(document.getElementById('pauseOverlay')).display!=='none');await page.waitForTimeout(80);
  const pauseSettingsBack=await page.evaluate(()=>({active:document.activeElement&&document.activeElement.id,
    inert:[...document.body.children].filter(el=>el.inert).map(el=>el.id||el.tagName)}));
  await page.keyboard.press('Escape');await page.waitForTimeout(80);
  const resumed=await page.evaluate(()=>({active:document.activeElement&&document.activeElement.id,display:getComputedStyle(document.getElementById('pauseOverlay')).display,paused,
    inert:[...document.body.children].filter(el=>el.inert).map(el=>el.id||el.tagName)}));
  report.checks.focusAndBack.pause={opened:pause,shiftWrap:pauseShiftWrap,forwardWrap:pauseForwardWrap,blockedTactical:pauseBlockedTactical,
    settingsOpen:pauseSettingsOpen,settingsBack:pauseSettingsBack,resumed};
  check(pause.active==='resumeBtn'&&pause.display!=='none'&&pause.paused&&pause.inert.length>pause.baselineInert.length,'Pause did not enter as a modal at Resume');
  check(pauseShiftWrap==='quitBtn'&&pauseForwardWrap==='resumeBtn','Tab or Shift+Tab escaped the Pause dialog');
  check(pauseBlockedTactical.before===pauseBlockedTactical.after&&pauseBlockedTactical.defaultPrevented&&!pauseBlockedTactical.dispatched,
    'Pause allowed an underlying tactical keyboard activation');
  check(pauseSettingsOpen.pause==='none'&&JSON.stringify(pauseSettingsOpen.inert)===JSON.stringify(pause.baselineInert),'Pause → Settings did not restore the prior inert state');
  check(pauseSettingsBack.active==='pauseSettings'&&pauseSettingsBack.inert.length>pause.baselineInert.length,'Settings → Pause did not restore trigger focus and modal ownership');
  check(resumed.active==='menuBtn'&&resumed.display==='none'&&!resumed.paused&&JSON.stringify(resumed.inert)===JSON.stringify(pause.baselineInert),
    'Resume did not restore the Pause trigger and prior inert state');

  const tactical={};
  await page.evaluate(()=>{running=true;paused=false;gameSpeed=1;document.getElementById('spdBtn').focus();});
  await page.keyboard.press('Enter');await page.waitForTimeout(40);tactical.enter=await page.evaluate(()=>gameSpeed);
  await page.keyboard.press('Space');await page.waitForTimeout(40);tactical.space=await page.evaluate(()=>gameSpeed);
  report.checks.keyboardTactical=tactical;
  check(tactical.enter===1.5,'Enter did not activate game speed exactly once');
  check(tactical.space===2,'Space did not activate game speed exactly once');

  await page.evaluate(()=>{
    window.__mfA11yAttackActivations=0;window.__mfA11yJumpToAlert=jumpToAlert;
    jumpToAlert=function(){window.__mfA11yAttackActivations++;return window.__mfA11yJumpToAlert();};
    showAlert(620,420,'attack');document.getElementById('atkAlert').focus();
  });
  await page.keyboard.press('Enter');await page.waitForTimeout(40);
  const keyboardAttack=await page.evaluate(()=>{
    const out={activations:window.__mfA11yAttackActivations,hidden:getComputedStyle(document.getElementById('atkAlert')).display==='none',
      native:document.getElementById('atkAlert').tagName==='BUTTON',alertCleared:alertPos===null};
    jumpToAlert=window.__mfA11yJumpToAlert;delete window.__mfA11yJumpToAlert;return out;
  });
  report.checks.keyboardAttackAlert=keyboardAttack;
  check(keyboardAttack.native&&keyboardAttack.activations===1&&keyboardAttack.hidden&&keyboardAttack.alertCleared,
    'Enter did not activate the base-under-attack native control exactly once');

  /* Conservative contrast over every content-gradient stop. Alpha is composed
     over the game's #03070e base, and the lowest stop ratio is the result. */
  await page.evaluate(()=>{running=false;paused=false;renderSettings();showFrontScreen('settingsScr');mfSetTabs(document.getElementById('setList'),'system',false);});
  const contrast=await page.evaluate(()=>{
    const parse=value=>{const m=String(value).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].replace(/\//g,' ').split(/[ ,]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],Number.isFinite(p[3])?p[3]:1];};
    const over=(c,b=[3,7,14])=>[0,1,2].map(i=>c[i]*c[3]+b[i]*(1-c[3]));
    const lum=c=>{const q=c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*q[0]+.7152*q[1]+.0722*q[2];};
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const plate=(name,textSel,bgSel)=>{
      const text=document.querySelector(textSel),bg=document.querySelector(bgSel),fg=parse(getComputedStyle(text).color);
      const hits=[...getComputedStyle(bg).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].slice(0,2).map(m=>parse(m[0]));
      if(!hits.length){const c=parse(getComputedStyle(bg).backgroundColor);if(c)hits.push(c);}
      const ratios=hits.map(c=>ratio(fg,over(c)));return {name,foreground:getComputedStyle(text).color,background:getComputedStyle(bg).backgroundImage||getComputedStyle(bg).backgroundColor,ratios:ratios.map(v=>+v.toFixed(2)),minimum:+Math.min(...ratios).toFixed(2)};
    };
    const attack=document.getElementById('atkAlert'),wave=document.getElementById('waveAlert');
    wave.innerHTML='<b>⚠ WAVE 3</b><span>EAST LANE · 24s</span>';
    return [plate('settings heading','#settingsScr .subMenuHead h2','#settingsScr .subMenuHead'),
      plate('settings row','[data-set="textScale"] .sTx b','[data-set="textScale"]'),
      plate('secondary button','#setBack','#setBack'),plate('objective plate','#goalBar','#goalBar'),
      plate('base attack alarm','#atkAlert','#atkAlert'),plate('wave alarm','#waveAlert b','#waveAlert')];
  });
  report.checks.contrast={method:'minimum foreground ratio over first content-gradient stops, alpha-composited on #03070e',plates:contrast};
  for(const plate of contrast)check(Number.isFinite(plate.minimum)&&plate.minimum>=4.5,`${plate.name} contrast is ${plate.minimum}:1`);

  await page.emulateMedia({forcedColors:'active'});await page.waitForTimeout(100);
  const forced=await page.evaluate(()=>({active:matchMedia('(forced-colors: active)').matches,controls:['#setBack','#setTab-system','[data-set="textScale"]'].map(sel=>{const el=document.querySelector(sel),s=getComputedStyle(el);return {selector:sel,color:s.color,background:s.backgroundColor,border:s.borderColor,visible:s.display!=='none'&&s.visibility!=='hidden'};})}));
  report.checks.contrast.forcedColors=forced;await shot('settings-forced-colors.png');
  check(forced.active,'browser forced-colors emulation did not activate');
  check(forced.controls.every(c=>c.visible&&c.color!==c.background),'representative controls disappeared or collapsed in forced colors');
  await page.emulateMedia({forcedColors:'none'});

  /* Mute every sound, remove hue as a signal, then use the production alert
     functions. Text, shape, persistent controls, minimap and world pings must
     all survive independently of audio and authored color. */
  const alarm=await page.evaluate(async()=>{
    META.settings.sound=false;META.settings.textScale=100;applySettings();
    if(typeof stopAttract==='function')stopAttract();hideFrontScreens();showHudDock(true);
    running=true;demoMode=false;paused=false;if(typeof mfFlowLayout==='function')mfFlowLayout();
    document.documentElement.style.filter='grayscale(1)';
    stats.t=Math.max(10,stats.t||0);const mm0=mmPings.length,world0=worldAlertPings.length;
    showAlert(400,520,'attack');setWaveWarning(1200,520,400,520,24,3,12);
    await new Promise(requestAnimationFrame);
    const attack=document.getElementById('atkAlert'),wave=document.getElementById('waveAlert');
    return {soundEnabled:!!sfxOn,filter:getComputedStyle(document.documentElement).filter,
      attack:{display:getComputedStyle(attack).display,text:attack.textContent.trim(),shape:{border:attack.style.borderRadius||getComputedStyle(attack).borderRadius,borderLeft:getComputedStyle(attack).borderLeftWidth}},
      wave:{display:getComputedStyle(wave).display,text:wave.textContent.replace(/\s+/g,' ').trim(),aria:wave.getAttribute('aria-label')},
      minimapPings:mmPings.length-mm0,worldPings:worldAlertPings.length-world0};
  });
  report.checks.mutedMonochromeAlarms=alarm;await shot('muted-monochrome-alarms.png');
  check(!alarm.soundEnabled,'alarm test did not actually mute sound');
  check(alarm.filter!=='none','alarm test did not actually remove hue');
  check(alarm.attack.display!=='none'&&/UNDER ATTACK/.test(alarm.attack.text),'base attack lacks persistent text in muted monochrome mode');
  check(alarm.wave.display!=='none'&&/WAVE 3/.test(alarm.wave.text)&&/LANE/.test(alarm.wave.text),'wave warning lacks non-color text and direction');
  check(alarm.minimapPings>=1&&alarm.worldPings>=1,'base alarm lacks minimap/world spatial signals');

  const contextLosses=await page.evaluate(()=>window.__mfA11yContextLosses||0);
  report.checks.contextLosses=contextLosses;check(contextLosses===0,'WebGL context was lost during accessibility probe');
  check(!report.errors.some(e=>['pageerror','console','http','requestfailed'].includes(e.kind)),'runtime emitted an unexpected browser error');
  report.networkIsolation=await offline.finalize('Stage 8 accessibility acceptance');offline=null;

  /* Re-read every declared image from disk before publication. A screenshot
     result held only in memory cannot prove that the bounded artifact a human
     will review is the same byte stream the probe measured. */
  check(report.screenshots.length===screenshotFiles.length&&
    screenshotFiles.every(name=>report.screenshots.filter(item=>item.file===name).length===1),
    'accessibility screenshot set is incomplete or duplicated');
  report.screenshotBindingsAtCompletion=[];
  for(const name of screenshotFiles){
    const bytes=await readFile(join(outDir,name));
    const binding={file:name,sha256:hash(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
    report.screenshotBindingsAtCompletion.push(binding);
    const captured=report.screenshots.find(item=>item.file===name);
    check(!!captured&&captured.sha256===binding.sha256&&captured.bytes===binding.bytes&&
      captured.width===binding.width&&captured.height===binding.height,`published screenshot changed after capture: ${name}`);
  }
  await guard.checkpoint('before accessibility completion fingerprint');
  report.sourceAtCompletion=await readRepositoryFingerprint(root);report.boundFilesAtCompletion=await fileBindings();
  check(report.source.head===report.sourceAtCompletion.head&&report.source.dirtyFingerprint===report.sourceAtCompletion.dirtyFingerprint,
    'repository fingerprint changed during accessibility evidence');
  check(JSON.stringify(report.boundFiles)===JSON.stringify(report.boundFilesAtCompletion),'served accessibility files changed during evidence');
  captureReady=report.failures.length===0&&report.errors.length===0;
  report.machineOutcome='PENDING_FINAL_RELEASE';
}catch(error){fatal=error;report.errors.push({kind:'fatal',message:String(error&&error.stack||error)});}
finally{
  if(offline){
    try{report.networkIsolation=await offline.finalize('Stage 8 accessibility failed-run cleanup');}
    catch(error){report.errors.push({kind:'offline-finalize',message:String(error&&error.stack||error)});fatal??=error;}
  }
  if(page&&!page.isClosed()){try{await page.close();}catch(error){report.errors.push({kind:'page-close',message:String(error)});fatal??=error;}}
  if(browser){try{await closePwBrowser(browser);}catch(error){report.errors.push({kind:'browser-close',message:String(error)});fatal??=error;}}
  if(server.listening){
    if(server.closeAllConnections)server.closeAllConnections();
    try{await new Promise((ok,bad)=>server.close(error=>error?bad(error):ok()));}
    catch(error){report.errors.push({kind:'server-close',message:String(error)});fatal??=error;}
  }
  if(!report.sourceAtCompletion){
    try{await guard.checkpoint('failed-run completion fingerprint');report.sourceAtCompletion=await readRepositoryFingerprint(root);report.boundFilesAtCompletion=await fileBindings();}
    catch(error){report.errors.push({kind:'completion-fingerprint',message:String(error)});fatal??=error;}
  }
  const reportPath=join(outDir,'report.json');
  report.captureCompleted=false;report.machineOutcome='PENDING_FINAL_RELEASE';
  try{await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');}
  catch(error){report.errors.push({kind:'provisional-report',message:String(error)});fatal??=error;captureReady=false;}
  let releaseSucceeded=false;
  try{await guard.release({assertStable:true,name:'Stage 8 accessibility final evidence release'});releaseSucceeded=true;}
  catch(error){report.errors.push({kind:'workspace-release',message:String(error&&error.stack||error)});fatal??=error;}
  report.captureCompleted=releaseSucceeded&&captureReady&&!fatal&&report.failures.length===0&&report.errors.length===0;
  report.machineOutcome=report.captureCompleted?'PASS':'FAIL';
  try{await writeFile(reportPath,JSON.stringify(report,null,2)+'\n','utf8');}
  catch(error){report.captureCompleted=false;report.machineOutcome='FAIL';report.errors.push({kind:'final-report',message:String(error)});fatal??=error;}
  console.log(JSON.stringify({captureCompleted:report.captureCompleted,gpu:report.gpu,failures:report.failures,errors:report.errors,report:reportPath},null,2));
}
if(fatal)throw fatal;
if(report.failures.length||!report.captureCompleted)process.exitCode=1;
