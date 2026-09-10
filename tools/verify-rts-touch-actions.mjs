#!/usr/bin/env node
/* Real mobile-pointer regression for the Commander command loop.
   Proves that selection stays unobstructed and that a contextual hot-slot arms
   its authoritative ability before the next battlefield tap can become MOVE. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {startStaticServer,installTelemetryInit,enterRealBattle,collectSourceIdentity} from './perf-lab/perf-probe-runner.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tag=process.argv[2];
if(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Unique evidence tag required');
const sourceRuntime=process.env.MF_RTS_TOUCH_SOURCE==='1';
const out=join(root,'.tmp','rts-touch-actions',tag);
const report={tag,at:new Date().toISOString(),scope:'real offline deployment; physical touch coordinates at 412x915',
  runtime:sourceRuntime?'source':'packed',physicalDevice:false,productionAcceptance:false,errors:[],screenshots:[]};
const shown=async l=>l.isVisible().catch(()=>false);
async function touch(page,locator){
  const box=await locator.boundingBox();
  assert(box&&box.width>=44&&box.height>=44,'touch target missing or below 44px');
  await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5);
}
let freeze,server,browser,context,page,networkIsolation;
try{
  freeze=await acquireVerificationFreeze({root,label:'RTS touch actions '+tag});
  report.source=await collectSourceIdentity({sourceRuntime});server=await startStaticServer({sourceRuntime});report.url=server.url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  networkIsolation=await installTelemetryInit(page);await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});
  report.gpu=await assertHardwareGpu(page);report.deployment=await enterRealBattle(page);

  report.selectionSetup=await page.evaluate(()=>{
    paused=true;if(typeof closeMenus==='function')closeMenus();clearSel();
    const card=document.getElementById('unitCard');if(card){card.classList.remove('pinned');card.style.display='none';}
    if(heroIdx<0||!ualive[heroIdx])throw new Error('live Commander unavailable after deployment');
    /* Make the old first-chassis auto-card behavior observable even if match
       startup or a presentation service selected this Commander incidentally. */
    if(typeof intelSeenTypes==='object'&&intelSeenTypes)delete intelSeenTypes[utype[heroIdx]];
    camFollow=-1;cam.x=ux[heroIdx];cam.y=uy[heroIdx];
    orthoSpan=Math.max(360,Math.min(520,typeof zoomSpanMax==='function'?zoomSpanMax():520));distTarget=orthoSpan;
    clampCam();camUpdateMatrices();updateSelInfo();
    const p=w2s(ux[heroIdx],uy[heroIdx],terrainH(ux[heroIdx],uy[heroIdx])+TYPES[utype[heroIdx]].size*.55);
    return {hero:heroIdx,type:utype[heroIdx],point:p,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx],
      hit:document.elementFromPoint(p[0],p[1])?.id||document.elementFromPoint(p[0],p[1])?.tagName||''};
  });
  const p=report.selectionSetup.point;
  assert(p[0]>20&&p[0]<392&&p[1]>80&&p[1]<690,'Commander is outside the unobstructed phone battlefield');
  await page.touchscreen.tap(p[0],p[1]);await page.waitForTimeout(180);
  report.selection=await page.evaluate(()=>({selected:selCount(),heroSelected:!!usel[heroIdx],
    infoVisible:getComputedStyle(document.getElementById('unitCard')).display!=='none',
    target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx]}));
  assert.equal(report.selection.heroSelected,true,'touching the Commander did not select it');
  assert.equal(report.selection.selected,1,'Commander touch selected an unexpected group');
  assert.equal(report.selection.infoVisible,false,'Commander selection auto-opened the info card');
  const selectShot=join(out,'01-commander-selected.png');await mkdir(out,{recursive:true});
  await page.screenshot({path:selectShot});report.screenshots.push(selectShot);

  const abilities=page.locator('.hudDeckBtn[data-deck="abilities"]').first();
  assert.equal(await abilities.isDisabled(),false,'Abilities deck is disabled for the selected Commander');
  await touch(page,abilities);await page.locator('#hotSlots').waitFor({state:'visible',timeout:5000});
  await page.evaluate(()=>{resE[0]=Math.max(resE[0],99999);if(typeof commanderWeaponCool!=='undefined')commanderWeaponCool[1]=0;
    if(typeof commanderWeaponButtonState==='function')commanderWeaponButtonState();if(typeof hotSlotSync==='function')hotSlotSync(true);});
  const slot=page.locator('#hotSlots .hotSlot[data-hot-src="abSecondary"]').first();
  assert.equal(await shown(slot),true,'Commander secondary hot-slot is not visible');
  report.beforeAbility=await page.evaluate(()=>({aiming,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx],
    safety:typeof mfUiSafetyProbe==='function'?mfUiSafetyProbe():null}));
  await touch(page,slot);await page.waitForTimeout(180);
  report.armed=await page.evaluate(()=>({aiming,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx],
    selected:selCount(),hotOn:document.querySelector('#hotSlots .hotSlot[data-hot-src="abSecondary"]')?.classList.contains('on')||false,
    ownerOn:document.getElementById('abSecondary')?.classList.contains('on')||false,
    safety:typeof mfUiSafetyProbe==='function'?mfUiSafetyProbe():null}));
  assert.equal(report.armed.aiming,8,'secondary hot-slot did not arm its authoritative targeting mode');
  assert.deepEqual(report.armed.target,report.beforeAbility.target,'pressing the ability issued a move order');
  assert.equal(report.armed.selected,1,'pressing the ability changed selection');
  assert.equal(report.armed.hotOn,true,'secondary hot-slot did not paint its armed state immediately');
  assert.equal(report.armed.ownerOn,true,'authoritative secondary button did not paint its armed state immediately');
  const armedShot=join(out,'02-secondary-armed.png');await page.screenshot({path:armedShot});report.screenshots.push(armedShot);

  const target=await page.evaluate(()=>{
    const W=commanderWeaponDef(1),d=Math.max(40,Math.min(90,(W&&W.range||160)*.35));
    const q=w2s(ux[heroIdx]+d,uy[heroIdx],terrainH(ux[heroIdx]+d,uy[heroIdx])+3);
    return {screen:q,world:[ux[heroIdx]+d,uy[heroIdx]],range:W&&W.range||0};
  });
  assert(target.screen[0]>10&&target.screen[0]<402&&target.screen[1]>70&&target.screen[1]<700,
    'ability target is outside the unobstructed phone battlefield');
  await page.touchscreen.tap(target.screen[0],target.screen[1]);await page.waitForTimeout(220);
  report.fired=await page.evaluate(()=>({aiming,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx],
    cooldown:commanderWeaponCool[1],selected:selCount(),
    hotOn:document.querySelector('#hotSlots .hotSlot[data-hot-src="abSecondary"]')?.classList.contains('on')||false,
    ownerOn:document.getElementById('abSecondary')?.classList.contains('on')||false,
    cooldownLabel:document.querySelector('#hotSlots .hotSlot[data-hot-src="abSecondary"] .hCd')?.textContent||'',
    notice:document.getElementById('toast')?.innerText||''}));
  assert(report.fired.cooldown>0,'target tap did not fire the selected Commander ability');
  assert.deepEqual(report.fired.target,report.beforeAbility.target,'ability target tap leaked into a move order');
  assert.equal(report.fired.selected,1,'ability target tap changed selection');
  assert.equal(report.fired.hotOn,false,'secondary hot-slot stayed armed after firing');
  assert.equal(report.fired.ownerOn,false,'authoritative secondary button stayed armed after firing');
  assert.match(report.fired.cooldownLabel,/^\d+$/,'secondary hot-slot does not expose its cooldown');
  assert.match(report.fired.notice,/CLUSTER CANNON FIRED.*REARMING/i,'fire acknowledgement lost to an ambient notice');
  const firedShot=join(out,'03-secondary-fired.png');await page.screenshot({path:firedShot});report.screenshots.push(firedShot);

  assert.deepEqual(report.errors,[],'page errors: '+report.errors.join('\n'));
  await freeze.checkpoint('Commander selection and ability touch loop complete');report.sourceStable=true;report.status='PASS';
}catch(e){
  report.failure=e.stack;report.status='FAIL';process.exitCode=1;console.error(e.stack);
  if(page){
    report.failureState=await page.evaluate(()=>{
      const visible=element=>{if(!element)return false;const style=getComputedStyle(element),box=element.getBoundingClientRect();
        return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;};
      return {url:location.href,bodyClass:document.body.className,
        screens:[...document.querySelectorAll('.screen,.overlay,[id^="mfStage"]')].filter(visible).map(node=>node.id||node.className),
        setupText:document.getElementById('setupScr')?.innerText?.slice(0,1200)||'',
        loadText:visible(document.getElementById('loadScr'))?document.getElementById('loadScr').innerText.slice(0,600):'',
        deploy:{visible:visible(document.getElementById('deployBtn')),text:document.getElementById('deployBtn')?.innerText||''},
        runtime:{matchLive:typeof matchLive==='undefined'?null:matchLive,running:typeof running==='undefined'?null:running,
          setupStage:typeof setupStage==='undefined'?null:setupStage,carrier:typeof carrier==='undefined'?null:carrier}};
    }).catch(error=>({captureError:error.message}));
    await mkdir(out,{recursive:true});const failureShot=join(out,'failure.png');
    await page.screenshot({path:failureShot}).catch(()=>{});report.screenshots.push(failureShot);
  }
}
finally{
  if(networkIsolation){try{report.networkIsolation=await networkIsolation.finalize('RTS touch actions');}
    catch(e){report.networkIsolationError=e.message;report.status='FAIL';process.exitCode=1;}}
  if(context)await context.close().catch(()=>{});if(browser)await closePwBrowser(browser).catch(()=>{});
  if(server)await server.close().catch(()=>{});
  if(freeze)await freeze.release({assertStable:true}).catch(e=>{report.sourceStable=false;report.freezeError=e.message;report.status='FAIL';process.exitCode=1;});
  await mkdir(out,{recursive:true});await writeFile(join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,out,sourceStable:report.sourceStable,screenshots:report.screenshots,failure:report.failure||null},null,2));
}
