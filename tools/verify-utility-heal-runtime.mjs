import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {startStaticServer,installTelemetryInit,enterRealBattle,collectSourceIdentity} from './perf-lab/perf-probe-runner.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),tag=process.argv[2];
if(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Unique evidence tag required');
const out=join(root,'.tmp','utility-heal',tag);
await mkdir(out,{recursive:true});
const report={tag,at:new Date().toISOString(),scope:'real offline deployment; live Warden planner, heal and selected-unit status',
  physicalDevice:false,productionAcceptance:false,errors:[],actions:[]};
let freeze,server,browser,context,page,networkIsolation;
try{
  freeze=await acquireVerificationFreeze({root,label:'utility-heal-'+tag});
  report.source=await collectSourceIdentity();server=await startStaticServer();report.url=server.url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  networkIsolation=await installTelemetryInit(page);await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});
  report.gpu=await assertHardwareGpu(page);report.deployment=await enterRealBattle(page);
  report.fixture=await page.evaluate(()=>{
    paused=true;playerFaction='nova';ensureBldFactionMeshes('nova');
    const anchor=blds.find(B=>B.alive&&B.team===0&&B.prog>=1&&(B.type==='hq'||B.type==='fac'));
    if(!anchor)throw new Error('No completed owned anchor for clear-land search');
    const outsideBuildings=(x,y)=>{
      for(const B of blds){
        if(!B||!B.alive)continue;
        const f=bldFoot(B);
        /* Reserve an 80 m square for two support bodies, with a further 8 m
           apron. This rejects the exact factory-overlap that invalidated the
           combined building verifier without changing runtime pathing. */
        if(obbHit(x,y,80,80,0,B.x,B.y,f[0],f[1],B.rot||0,8))return false;
      }
      return true;
    };
    const awayFromUnits=(x,y)=>{
      for(let i=0;i<unitHigh;i++)if(ualive[i]&&dist2(x,y,ux[i],uy[i])<90*90)return false;
      return true;
    };
    let center=null;
    for(let r=180;r<=900&&!center;r+=36)for(let n=0;n<32&&!center;n++){
      const a=n/32*TAU,x=clamp(anchor.x+Math.cos(a)*r,70,MAP-70),y=clamp(anchor.y+Math.sin(a)*r,70,MAP-70);
      if(isWalkable(x-12,y)&&isWalkable(x+12,y)&&outsideBuildings(x,y)&&awayFromUnits(x,y))center=[x,y];
    }
    if(!center)throw new Error('No clear walkable Warden fixture site');
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0)uhp[i]=uhpm[i];
    const warden=spawnUnit(24,0,center[0]-12,center[1]),wounded=spawnUnit(0,0,center[0]+12,center[1]);
    if(warden<0||wounded<0)throw new Error('Warden fixture admission failed');
    uhold[wounded]=1;ustate[wounded]=0;utx[wounded]=ux[wounded];uty[wounded]=uy[wounded];
    uhp[wounded]=uhpm[wounded]*.35;
    const before=uhp[wounded],positions={warden:[ux[warden],uy[warden]],target:[ux[wounded],uy[wounded]],anchor:[anchor.x,anchor.y]};
    if(!mfUtilityRuntimeReset())throw new Error('Utility runtime did not initialize');
    /* unitTick owns the authoritative tick increment. Pre-incrementing here
       advances by two and can alias an idle unit's four-phase LOD gate forever:
       the planner still assigns a lease before that gate, but its worker never
       reaches mfUtilityUnitTick. Track the visited phases so this fixture proves
       it exercised a real worker phase rather than merely observing a claim. */
    const startTick=tick,lodPhases=[0,0,0,0],startWarden=[ux[warden],uy[warden]];
    let steps=0;
    while(steps<300&&uhp[wounded]<=before){lodPhases[(warden+tick)&3]++;stats.t+=MF_SIM_DT;unitTick(MF_SIM_DT);steps++;}
    const board=mfUtilityBoardForWorker(warden),jobId=uUtilityJob[warden],
      job=board&&jobId?mfUtilityJobGet(board,jobId):null,
      claim=board?mfUtilityJobClaimForWorker(board,mfUtilityWorkerRef(warden)):null;
    usel.fill(0);usel[warden]=1;updateSelInfo();
    let nearestBuilding=Infinity;
    for(const B of blds)if(B&&B.alive)nearestBuilding=Math.min(nearestBuilding,Math.hypot(center[0]-B.x,center[1]-B.y));
    return {warden,wounded,before,after:uhp[wounded],maxHp:uhpm[wounded],steps,positions,
      tickStart:startTick,tickEnd:tick,tickDelta:tick-startTick,lodPhases,lodWorkerOpportunities:lodPhases[0],
      wardenTravel:Math.hypot(ux[warden]-startWarden[0],uy[warden]-startWarden[1]),
      walkable:[!!isWalkable(ux[warden],uy[warden]),!!isWalkable(ux[wounded],uy[wounded])],
      outsideBuildingFootprints:outsideBuildings(center[0],center[1]),nearestBuilding,
      held:!!uhold[wounded],jobId,jobKind:job&&job.kind,targetId:job&&Number(job.targetId),
      auto:!!uUtilityAuto[warden],claimJobId:claim&&claim.jobId,
      hudBeforeCard:$('selInfo').textContent.replace(/\s+/g,' ').trim()};
  });
  const F=report.fixture;
  assert.deepEqual(F.walkable,[true,true],'fixture units are not both on walkable land');
  assert.equal(F.outsideBuildingFootprints,true,'fixture overlaps a building footprint');
  assert.equal(F.held,true,'wounded target is not held stationary');
  assert.equal(F.tickDelta,F.steps,'synthetic fixture did not advance exactly one authority tick per step');
  assert(F.lodWorkerOpportunities>0,'fixture never exercised the Warden worker phase');
  assert(F.steps>0&&F.steps<=300,'heal did not occur inside the bounded fixed-tick window');
  assert(F.after>F.before,'actual Warden planner produced no HP improvement');
  assert(F.after<F.maxHp*.995,'fixture healed to completion before status capture');
  assert.equal(F.jobKind,'repair-unit','Warden did not retain a repair-unit job');
  assert.equal(F.targetId,F.wounded,'Warden claimed a different target');
  assert.equal(F.auto,true,'Warden repair was not automatically planned');
  assert.equal(F.claimJobId,F.jobId,'Warden job has no current board claim');
  assert.match(F.hudBeforeCard,/\bHEAL\b/,'selected Warden does not report HEAL');
  assert.doesNotMatch(F.hudBeforeCard,/\bREADY\b/,'working Warden reports generic READY');

  /* First-selection teaching may have opened the same card automatically. Close
     it, then exercise the visible info affordance and its native close control. */
  const initialClose=page.locator('#unitCard .ucClose');
  if(await initialClose.isVisible())await initialClose.click();
  await page.locator('#selInfo .selIntelBtn').click();
  await page.locator('#unitCard').waitFor({state:'visible',timeout:2500});
  report.card=await page.evaluate(()=>({visible:getComputedStyle($('unitCard')).display!=='none',
    title:($('unitCard').querySelector('.ucHead b')||{}).textContent||''}));
  await page.locator('#unitCard .ucClose').click();
  await page.locator('#unitCard').waitFor({state:'hidden',timeout:2500});
  report.hud=await page.evaluate(()=>{
    updateSelInfo();const el=$('selInfo'),r=el.getBoundingClientRect();
    return {text:el.textContent.replace(/\s+/g,' ').trim(),display:getComputedStyle(el).display,
      visible:r.width>0&&r.height>0,cardDisplay:getComputedStyle($('unitCard')).display};
  });
  assert.equal(report.card.visible,true,'native selected-unit info control did not open the card');
  assert.match(report.card.title,/Warden/i,'selected-unit info opened the wrong card');
  assert.equal(report.hud.cardDisplay,'none','native unit-card close did not dismiss the card');
  assert.equal(report.hud.visible,true,'selected-unit HUD is not visible after card close');
  assert.match(report.hud.text,/\bHEAL\b/,'HEAL status disappeared after native card close');
  assert.doesNotMatch(report.hud.text,/\bREADY\b/,'HUD regressed to READY after native card close');
  report.actions.push({name:'live Warden planner repaired held friendly',pass:true,steps:F.steps,before:F.before,after:F.after});
  report.actions.push({name:'selected-unit info open/close retained HEAL status',pass:true});
  await page.screenshot({path:join(out,'utility-heal.png')});
  await freeze.checkpoint('utility heal complete');report.sourceStable=true;
  assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){
  report.failure=e.stack;report.status='FAIL';process.exitCode=1;
  if(/SOURCE_WRITE_DURING_VERIFICATION/.test(e.message))report.sourceStable=false;
  console.error(e.stack);
}finally{
  if(networkIsolation){
    try{report.networkIsolation=await networkIsolation.finalize('utility heal verifier');}
    catch(e){report.networkIsolation=networkIsolation.snapshot();report.networkIsolationError=e.message;
      report.status='FAIL';process.exitCode=1;}
  }else report.networkIsolation={installed:false,finalized:false,pageClosed:!!(page&&page.isClosed&&page.isClosed())};
  if(context)await context.close().catch(e=>{report.contextCleanupError=e.message;report.status='FAIL';process.exitCode=1;});
  if(browser)await closePwBrowser(browser).catch(e=>{report.cleanupError=e.message;report.status='FAIL';process.exitCode=1;});
  if(server)await server.close().catch(e=>{report.serverCleanupError=e.message;report.status='FAIL';process.exitCode=1;});
  if(freeze)await freeze.release({assertStable:true}).then(()=>{if(report.sourceStable!==false)report.sourceStable=true;})
    .catch(e=>{report.sourceStable=false;report.freezeError=e.message;report.status='FAIL';process.exitCode=1;});
  await writeFile(join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,out,errors:report.errors,sourceStable:report.sourceStable,steps:report.fixture&&report.fixture.steps}));
}
