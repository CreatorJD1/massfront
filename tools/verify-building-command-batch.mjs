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
const out=join(root,'.tmp','building-command',tag);
await mkdir(out,{recursive:true});
const report={tag,at:new Date().toISOString(),scope:'real offline deployment; fixture-backed building UI actions and layout',
  physicalDevice:false,productionAcceptance:false,errors:[],views:[],actions:[],layoutFailures:[]};
const layoutCheck=(ok,message)=>{if(!ok)report.layoutFailures.push(message);};
let freeze,server,browser,context,page,networkIsolation;
try{
  freeze=await acquireVerificationFreeze({root,label:'building-command-'+tag});
  report.source=await collectSourceIdentity();server=await startStaticServer();report.url=server.url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  networkIsolation=await installTelemetryInit(page);await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});
  report.gpu=await assertHardwareGpu(page);report.deployment=await enterRealBattle(page);
  report.fixture=await page.evaluate(()=>{
    paused=true;heroLvl=6;resM[0]=20000;resE[0]=40000;
    const original=blds.findIndex(B=>B.alive&&B.team===0&&B.allyAI==null&&B.type==='pgen');
    if(original<0)throw new Error('Missing deployed generator');
    const B=blds[original],at=(type,dx,dy,extra)=>{
      const P=addBld(type,0,B.x+dx,B.y+dy,true);Object.assign(P,extra);return blds.indexOf(P);
    };
    const peer=at('pgen',110,0,{lvl:2}),ally=at('pgen',-110,0,{allyAI:2}),
      unfinished=at('pgen',0,100,{prog:.25,buildPaidM:10,buildPaidE:0}),
      factory=blds.findIndex(P=>P.alive&&P.team===0&&P.allyAI==null&&P.type==='fac');
    intelSeenBlds.pgen=1;intelSeenBlds.fac=1;openBldMenu(original);
    return {original,peer,ally,unfinished,factory,map:curMap,seed:MAPDEFS[curMap].seed,time:stats.t};
  });
  const matrix=[[360,740,100],[412,915,100],[412,915,200],[915,412,100],[915,412,200],[800,1280,125],[1280,800,100],[1440,900,150]];
  for(const [width,height,scale] of matrix){
    await page.setViewportSize({width,height});
    await page.evaluate(scale=>{mfApplyTextScale(scale);renderBldPanel();},scale);
    await page.waitForTimeout(450);
    const view=await page.evaluate(()=>{
      const panel=$('bldMenu2'),ids=['bp_up','bp_up_all'],box=el=>{
        const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,sw:el.scrollWidth,cw:el.clientWidth};
      };
      const buttons=ids.map(id=>({id,...box($(id)),disabled:$(id).disabled,text:$(id).textContent}));
      const timer=$('goalBar').querySelector('.clk'),time=timer?{box:box(timer),parent:box(timer.closest('.hudIntelChip')),goal:box($('goalBar'))}:null;
      const weather=document.getElementById('hazChip');
      return {panel:box(panel),buttons,time,weather:weather?box(weather):null,
        info:mfBuildingUpgradeBatchInfo(openBld),scrollable:panel.scrollHeight>panel.clientHeight};
    });
    layoutCheck(view.panel.x>=-1&&view.panel.y>=-1&&view.panel.x+view.panel.w<=width+1&&view.panel.y+view.panel.h<=height+1,'panel viewport containment '+width+'x'+height+'/'+scale);
    for(const b of view.buttons){layoutCheck(b.w>=44&&b.h>=44,'touch target '+b.id);layoutCheck(b.sw<=b.cw+1,'text overflow '+b.id);}
    if(view.time){
      const {box:r,parent:p,goal:g}=view.time;
      layoutCheck(r.x>=g.x-1&&r.x+r.w<=g.x+g.w+1&&r.y+r.h<=g.y+g.h+1,'goal clock clipped at '+width+'x'+height+'/'+scale);
      layoutCheck(r.x>=p.x-1&&r.x+r.w<=p.x+p.w+1,'goal clock chip clipped at '+width+'x'+height+'/'+scale);
      if(view.weather&&view.weather.w>0&&view.weather.x<g.x+g.w&&view.weather.x+view.weather.w>g.x)
        layoutCheck(view.weather.y>=g.y+g.h-1,'weather overlaps status bar at '+width+'x'+height+'/'+scale);
    }
    const screenshot=`panel-${width}x${height}-${scale}.png`;await page.screenshot({path:join(out,screenshot)});
    const hits=[];
    for(const id of ['bp_up','bp_up_all']){
      await page.locator('#'+id).scrollIntoViewIfNeeded();await page.waitForTimeout(100);
      const hit=await page.evaluate(id=>{
        const B=$(id),r=B.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,
          target=document.elementFromPoint(x,y);
        return {id,x,y,reachable:!!(target&&B.contains(target)),target:target&&target.id};
      },id);
      layoutCheck(hit.reachable,'obscured action at '+width+'x'+height+'/'+scale+': '+JSON.stringify(hit));hits.push(hit);
    }
    await page.screenshot({path:join(out,`actions-${width}x${height}-${scale}.png`)});
    report.views.push({width,height,scale,...view,screenshot,hits});
  }
  await page.setViewportSize({width:915,height:412});
  await page.evaluate(()=>{mfApplyTextScale(200);toast('Factory queue paused — additional energy is required.');});
  await page.waitForTimeout(400);
  report.notice=await page.evaluate(()=>{
    const T=$('toast'),title=getComputedStyle(T,'::before'),body=getComputedStyle(T);
    return {position:title.position,paddingTop:parseFloat(body.paddingTop),titleTop:parseFloat(title.top)||0,
      titleHeight:parseFloat(title.lineHeight)||parseFloat(title.fontSize)*1.2};
  });
  layoutCheck(report.notice.position==='static'||report.notice.position==='relative'||
    report.notice.paddingTop>=report.notice.titleTop+report.notice.titleHeight,'notice heading overlaps content');
  await page.screenshot({path:join(out,'notice-large-text.png')});
  await page.setViewportSize({width:412,height:915});await page.evaluate(()=>{mfApplyTextScale(100);renderBldPanel();});
  await page.locator('#bp_up_all').click();
  const batch=await page.evaluate(F=>({time:blds[F.original].upT,peer:blds[F.peer].upT,ally:blds[F.ally].upT,
    construction:blds[F.unfinished].upT,mass:resM[0],info:mfBuildingUpgradeBatchInfo(F.original)}),report.fixture);
  assert.equal(batch.time,10);assert.equal(batch.peer,14);assert.equal(batch.ally,0);assert.equal(batch.construction,0);
  assert.equal(batch.mass,19760);report.actions.push({name:'actual upgrade-all button',...batch});
  await page.screenshot({path:join(out,'upgrading-panel.png')});
  await page.evaluate(F=>{
    for(const id of [F.original,F.peer]){finishUpgrade(blds[id]);blds[id].upT=0;}
    openBldMenu(F.original);
  },report.fixture);
  await page.waitForTimeout(220);await page.locator('#bp_up').click();
  const single=await page.evaluate(F=>({selected:blds[F.original].upT,peer:blds[F.peer].upT,mass:resM[0]}),report.fixture);
  assert.equal(single.selected,14);assert.equal(single.peer,0);assert.equal(single.mass,19600);report.actions.push({name:'actual upgrade-this button',...single});
  await page.evaluate(F=>{openBldMenu(F.factory);},report.fixture);
  await page.locator('#upAllBtn').waitFor({state:'visible',timeout:2500});
  await page.screenshot({path:join(out,'factory-upgrade-panel.png')});
  await page.evaluate(F=>{openBldMenu(F.original);openBldMenu(F.factory);openBldMenu(F.original);},report.fixture);
  report.actions.push({name:'factory/general panel round trip',pass:true});
  await page.evaluate(F=>{openBldMenu(F.factory);},report.fixture);
  const buildCard=page.locator('#prodGrid .bcard[data-preview-kind="unit"][data-authored-lock="0"]').first();
  const builtType=Number(await buildCard.getAttribute('data-preview-id'));
  await buildCard.locator('.nm').click();
  report.production=await page.evaluate(({F,builtType})=>{
    const B=blds[F.factory],T=TYPES[builtType];
    if(B.queue.length!==1||B.queue[0]!==builtType)throw new Error('Production card did not enqueue exactly one unit');
    let steps=0;while(B.prodT<T.bt*.42&&steps<3000){bldTick(1/30);steps++;}
    if(!B.queue.length||steps===3000)throw new Error('Production did not advance to partial work');
    return {builtType,name:T.name,steps,simSeconds:steps/30,activity:mfBuildingActivity(B)};
  },{F:report.fixture,builtType});
  report.actions.push({name:'actual production-card enqueue and fixed simulation steps',pass:true});
  await page.evaluate(F=>{
    closeMenus();const B=blds[F.factory];
    META.settings.healthBars='off';cam.x=B.x;cam.y=B.y;orthoSpan=distTarget=650;camPitch=pitchTarget=1.3;render(0);
  },report.fixture);
  await page.screenshot({path:join(out,'world-active-buildings.png')});
  report.activity=await page.evaluate(F=>({factory:mfBuildingActivity(blds[F.factory]),
    construction:mfBuildingActivity(blds[F.unfinished]),upgrade:mfBuildingActivity(blds[F.original]),
    telemetry:window.MFBuildingActivityTelemetry||null}),report.fixture);
  assert.equal(report.activity.factory.kind,'producing');assert.equal(report.activity.construction.kind,'constructing');
  report.workRailDraws=await page.evaluate(()=>{
    const draws=[],base=bbAlpha.addRect,colors=['54,204,239','241,183,58','177,111,238'];
    bbAlpha.addRect=function(...args){
      const color=args.slice(6,9).join(',');
      if(colors.includes(color))draws.push({color,width:args[4],height:args[5],alpha:args[9]});
      return base.apply(this,args);
    };
    try{render(0);}finally{bbAlpha.addRect=base;}
    return draws;
  });
  assert(report.workRailDraws.some(x=>x.color==='54,204,239'),'factory work rail never submitted to real renderer');
  const pausedBefore=await page.evaluate(()=>({t:stats.t,work:blds.map(B=>[B.prog,B.prodT,B.upT])}));
  await page.evaluate(()=>{for(let i=0;i<12;i++)render(0);});
  assert.deepEqual(await page.evaluate(()=>({t:stats.t,work:blds.map(B=>[B.prog,B.prodT,B.upT])})),pausedBefore);
  report.actions.push({name:'paused render never advances building work',pass:true});
  report.production.completion=await page.evaluate(F=>{
    const B=blds[F.factory];let steps=0;while(B.queue.length&&steps<6000){bldTick(1/30);steps++;}
    if(B.queue.length)throw new Error('Factory failed to complete queued unit');
    return {steps,simSeconds:steps/30,activity:mfBuildingActivity(B)};
  },report.fixture);
  /* Faction variants use real deployed-world bldTick, not a call to the FX
     renderer. This is a deterministic fixture, not a physical-device trial. */
  report.workFactions=[];
  for(const faction of ['nova','legion','syndicate','horde']){
    const sample=await page.evaluate(({F,faction,builtType})=>{
      const chosen=faction==='nova'?'nova':Object.keys(FACTIONS).find(k=>FACTIONS[k].kit===faction);
      if(!chosen)throw new Error('No playable faction for '+faction);
      playerFaction=chosen;ensureBldFactionMeshes(faction);
      const B=blds[F.factory],C=blds[F.unfinished],U=blds[F.original];
      B.queue=[builtType];B.prodT=TYPES[builtType].bt*.2;B.prodStalled='';B.upT=0;
      C.prog=.25;C.buildStalled=false;U.upT=10;U.upMax=14;
      resM[0]=20000;resE[0]=40000;perfScale=1;
      const calls=[],base=mfBuildingWorkFx,oldPaused=paused;
      mfBuildingWorkFx=function(...args){
        const before=fHead,ok=base(...args);
        if(ok)calls.push({kind:args[2],tick,slot:before,type:ftype[before],color:[fcr[before],fcg[before],fcb[before]],height:fzh[before]});
        return ok;
      };
      try{
        paused=false;
        for(let n=0;n<45;n++){tick++;stats.t+=1/30;bldTick(1/30);updParticles(1/30);}
      }finally{paused=oldPaused;mfBuildingWorkFx=base;}
      cam.x=B.x;cam.y=B.y;orthoSpan=distTarget=650;
      const draws=[],original=bbAdd.add,P=mfBuildingWorkProfile(B);
      bbAdd.add=function(...args){
        if([P.color.join(','),P.accent.join(',')].includes(args.slice(6,9).join(',')))draws.push(args.slice(1));
        return original.apply(this,args);
      };
      try{render(0);}finally{bbAdd.add=original;}
      return {faction,chosen,calls,draws,profile:P,quality:mfGfxKey(),activity:mfBuildingActivity(B)};
    },{F:report.fixture,faction,builtType});
    assert(sample.calls.some(x=>x.kind==='constructing'),'no real construction emission '+faction);
    assert(sample.calls.some(x=>x.kind==='producing'),'no real factory emission '+faction);
    assert(sample.draws.length>0,'no actual faction work draw '+faction);
    await page.screenshot({path:join(out,'work-'+faction+'-tactical.png')});
    await page.evaluate(()=>{orthoSpan=distTarget=420;render(0);});
    await page.screenshot({path:join(out,'work-'+faction+'-close.png')});
    const noAdvance=await page.evaluate(()=>{
      const before={tick,t:stats.t,head:fHead,count:fCount,life:Array.from(flife)};
      for(let n=0;n<8;n++)render(0);
      return JSON.stringify(before)===JSON.stringify({tick,t:stats.t,head:fHead,count:fCount,life:Array.from(flife)});
    });
    assert(noAdvance,'paused render ages or emits particles '+faction);
    sample.pausedPoolStable=noAdvance;report.workFactions.push(sample);
  }
  report.utilityHeal=await page.evaluate(F=>{
    /* Exercise the deployed simulation, not a fabricated lease. Keep one
       wounded friendly beside a known completed player facility so the board's
       target, travel and ownership conditions are all unambiguous. */
    playerFaction='nova';ensureBldFactionMeshes('nova');
    const completedB=blds[F.factory];
    if(!completedB||!completedB.alive||completedB.team!==0||completedB.prog<1)
      throw new Error('Missing completed owned facility for Warden fixture');
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0)uhp[i]=uhpm[i];
    const warden=spawnUnit(24,0,completedB.x+20,completedB.y),
      wounded=spawnUnit(0,0,completedB.x+38,completedB.y);
    if(warden<0||wounded<0)throw new Error('Warden fixture admission failed');
    uhp[wounded]=uhpm[wounded]*.5;
    const before=uhp[wounded];
    if(!mfUtilityRuntimeReset())throw new Error('Utility runtime did not initialize');
    const tickStart=tick;
    /* unitTick advances the authority tick itself. A verifier-side increment
       changes the cadence to +2 and can permanently alias this Warden out of
       the four-phase idle LOD gate while its planner lease remains visible. */
    for(let n=0;n<45;n++){stats.t+=MF_SIM_DT;unitTick(MF_SIM_DT);}
    const board=mfUtilityBoardForWorker(warden),id=uUtilityJob[warden],
      job=board&&id?mfUtilityJobGet(board,id):null,
      claim=board?mfUtilityJobClaimForWorker(board,mfUtilityWorkerRef(warden)):null;
    usel.fill(0);usel[warden]=1;updateSelInfo();
    return {warden,wounded,before,after:uhp[wounded],tickStart,tickEnd:tick,tickDelta:tick-tickStart,
      jobId:id,jobKind:job&&job.kind,
      targetId:job&&Number(job.targetId),auto:!!uUtilityAuto[warden],
      claimJobId:claim&&claim.jobId,hud:$('selInfo').textContent.replace(/\s+/g,' ').trim()};
  },report.fixture);
  assert.equal(report.utilityHeal.jobKind,'repair-unit','Warden did not claim an actual repair-unit job');
  assert.equal(report.utilityHeal.targetId,report.utilityHeal.wounded,'Warden claimed the wrong repair target');
  assert.equal(report.utilityHeal.auto,true,'Warden repair was not automatic');
  assert.equal(report.utilityHeal.claimJobId,report.utilityHeal.jobId,'Warden has no live board claim');
  assert.equal(report.utilityHeal.tickDelta,45,'utility fixture did not advance one authority tick per step');
  assert(report.utilityHeal.after>report.utilityHeal.before,'Warden did not improve target HP');
  assert.match(report.utilityHeal.hud,/\bHEAL\b/,'selected Warden HUD does not expose its heal job');
  assert.doesNotMatch(report.utilityHeal.hud,/\bREADY\b/,'selected working Warden still reads as generic READY');
  report.actions.push({name:'actual Warden auto-planner repair and selected-unit HEAL status',pass:true,
    before:report.utilityHeal.before,after:report.utilityHeal.after,jobId:report.utilityHeal.jobId});
  const intelClose=page.locator('#unitCard .ucClose');
  if(await intelClose.isVisible())await intelClose.click();
  await page.evaluate(()=>{render(0);});
  report.utilityHeal.statusVisible=await page.locator('#selInfo').isVisible();
  assert(report.utilityHeal.statusVisible,'utility status is present but hidden');
  await page.screenshot({path:join(out,'utility-heal.png')});
  await freeze.checkpoint('building controls complete');report.sourceStable=true;
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.layoutFailures,[]);report.status='PASS';
}catch(e){
  report.failure=e.stack;report.status='FAIL';process.exitCode=1;
  if(/SOURCE_WRITE_DURING_VERIFICATION/.test(e.message))report.sourceStable=false;
  console.error(e.stack);
}
finally{
  if(networkIsolation){
    try{report.networkIsolation=await networkIsolation.finalize('building command verifier');}
    catch(e){report.networkIsolation=networkIsolation.snapshot();report.networkIsolationError=e.message;
      report.status='FAIL';process.exitCode=1;}
  }else report.networkIsolation={installed:false,finalized:false,pageClosed:!!(page&&page.isClosed&&page.isClosed())};
  if(context)await context.close().catch(e=>{report.contextCleanupError=e.message;report.status='FAIL';process.exitCode=1;});
  if(browser)await closePwBrowser(browser).catch(e=>{report.cleanupError=e.message;report.status='FAIL';process.exitCode=1;});
  if(server)await server.close().catch(e=>{report.serverCleanupError=e.message;report.status='FAIL';process.exitCode=1;});
  if(freeze)await freeze.release({assertStable:true}).then(()=>{if(report.sourceStable!==false)report.sourceStable=true;}).catch(e=>{
    report.sourceStable=false;report.freezeError=e.message;report.status='FAIL';process.exitCode=1;});
  await writeFile(join(out,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,out,errors:report.errors,sourceStable:report.sourceStable,views:report.views.length}));
}
