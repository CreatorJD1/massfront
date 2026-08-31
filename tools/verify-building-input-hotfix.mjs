#!/usr/bin/env node
/* Real canvas-pointer regression for building selection beneath a strategic
   unit stack. The same scenario is captured before and after the hotfix. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8991/';
const tag=(process.argv.find(a=>a.startsWith('--tag='))||'--tag=current').slice(6);
const outDir=join(root,'.tmp','building-input-hotfix');
const shot=join(outDir,tag+'.png');
const placementShot=join(outDir,tag+'-placement.png');
const footprintShot=join(outDir,tag+'-footprint.png');
const warShot=join(outDir,tag+'-war-room.png');
const reportPath=join(outDir,tag+'.json');
const warFailurePath=join(outDir,tag+'-war-route-failure.json');
await mkdir(outDir,{recursive:true});

const strategicNotice=/STACK|SELECT/i;
const checks=[];
function check(name,pass,actual,expected){checks.push({name,pass,actual,expected});}
async function pointerClick(page,locator,label){
  await locator.waitFor({state:'visible',timeout:10000});
  await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();
  assert.ok(box&&box.width>0&&box.height>0,label+' has no pointer target');
  const at={x:box.x+box.width*.5,y:box.y+box.height*.5};
  await page.mouse.click(at.x,at.y);
  return at;
}

const browser=await launchPwBrowser();
try{
  const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:1,
    hasTouch:true,isMobile:false,colorScheme:'dark'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const freshUrl=url+(url.includes('?')?'&':'?')+'mfHotfixVerify='+Date.now();
  await page.goto(freshUrl,{waitUntil:'domcontentloaded',timeout:60000});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof addBld==='function'&&typeof spawnUnit==='function'&&
    typeof mfIconStackRebuild==='function'&&typeof w2s==='function'&&
    !document.querySelector('[data-mf-boot-input-shield]'),null,{timeout:90000});
  /* Boot readiness precedes the launch-title handoff that opens the first-run
     account gate. Sampling it after an arbitrary 550 ms raced that handoff:
     the test saw no modal, then the modal appeared over START before the next
     pointer click. Wait for either the real offline action or an already-seen
     gate, and never click through an account overlay that is still visible. */
  await page.waitForFunction(()=>{
    const offline=document.getElementById('apOfflineBtn');
    const visible=offline&&getComputedStyle(offline).display!=='none'&&offline.offsetParent!==null;
    let seen=false;
    try{ seen=localStorage.getItem('mf_auth_gate_v1')==='1'; }catch(_){ seen=true; }
    return !!visible||seen;
  },null,{timeout:20000});
  const offline=page.locator('#apOfflineBtn');
  if(await offline.isVisible()) await pointerClick(page,offline,'PLAY OFFLINE button');
  await page.waitForFunction(()=>{
    const overlay=document.getElementById('apOverlay');
    return !overlay||getComputedStyle(overlay).display==='none';
  },null,{timeout:10000});
  let warPhase='initializing',warEntryPointer=null,warRoom=null,warCardStability=null,trainingPointer=null,trainingLaunch=null;
  try{
  /* Regression observed in the field: a real pointer click reached the War
     Room but TRAINING appeared inert, with no page error. Exercise the public
     menu route before arranging the controlled in-match scene below. This is
     deliberately a pointer path rather than a direct resumeTrainingMission()
     call, so a silent missing/blocked handler cannot hide behind test setup. */
  warPhase='await-menu';
  await page.waitForFunction(()=>{
    const el=document.getElementById('startBtn');
    return !!el&&getComputedStyle(el).display!=='none';
  },null,{timeout:15000});
  warPhase='open-war-room';
  warEntryPointer=await pointerClick(page,page.locator('#startBtn'),'WAR ROOM button');
  await page.waitForFunction(()=>{
    const war=document.getElementById('warScr');
    return !!war&&getComputedStyle(war).display!=='none'&&!!war.querySelector('.warCard[data-mode="training"]');
  },null,{timeout:10000});
  warPhase='inspect-war-room';
  warRoom=await page.evaluate(()=>{
    const card=document.querySelector('.warCard[data-mode="training"]');
    const r=card&&card.getBoundingClientRect();
    return {display:getComputedStyle(document.getElementById('warScr')).display,
      cards:[...document.querySelectorAll('.warCard')].map(el=>el.dataset.mode),
      trainingRect:r&&{x:r.x,y:r.y,width:r.width,height:r.height},
      trainingHandler:typeof resumeTrainingMission};
  });
  warPhase='stability-window';
  const warCardMark='war-training-'+Date.now();
  await page.evaluate(mark=>{
    const card=document.querySelector('.warCard[data-mode="training"]');
    if(card) card.dataset.mfVerifierMark=mark;
  },warCardMark);
  /* Cross two tutorial ticks. Replacing `warGrid.innerHTML` here used to lose
     the card's pointerdown state in the middle of a normal human tap. */
  await page.waitForTimeout(760);
  warCardStability=await page.evaluate(mark=>{
    const card=document.querySelector('.warCard[data-mode="training"]'),grid=document.getElementById('warGrid');
    return {sameCard:!!card&&card.dataset.mfVerifierMark===mark,trainingSig:grid&&grid.dataset.mfTrainingSig||''};
  },warCardMark);
  await page.screenshot({path:warShot,fullPage:false,timeout:60000});
  warPhase='click-training';
  trainingPointer=await pointerClick(page,page.locator('.warCard[data-mode="training"]'),'TRAINING War Room card');
  warPhase='await-training-launch';
  await page.waitForFunction(()=>{
    const D=window.__tutDebug&&window.__tutDebug();
    return !!(typeof trainingMissionActive==='function'&&trainingMissionActive()&&D&&D.TUT&&D.TUT.active&&running);
  },null,{timeout:60000});
  warPhase='inspect-training-launch';
  trainingLaunch=await page.evaluate(()=>{
    const D=window.__tutDebug&&window.__tutDebug(),war=document.getElementById('warScr');
    return {mode:activeWarMode,running,training:!!(D&&D.TUT&&D.TUT.trainingMode),active:!!(D&&D.TUT&&D.TUT.active),
      warDisplay:getComputedStyle(war).display,loadDisplay:getComputedStyle(document.getElementById('loadScr')).display};
  });
  check('WAR ROOM opens through its real pointer control',warRoom.display!=='none'&&warRoom.cards.includes('training'),
    {display:warRoom.display,cards:warRoom.cards},{display:'visible',training:true});
  check('TRAINING War Room card has a touch-sized target',!!warRoom.trainingRect&&warRoom.trainingRect.width>=44&&warRoom.trainingRect.height>=44,
    warRoom.trainingRect,'at least 44 × 44 px');
  check('TRAINING card persists across tutorial state polls',warCardStability.sameCard,warCardStability,
    {sameCard:true});
  check('TRAINING card launches its dedicated operation through a real pointer path',
    trainingLaunch.mode==='training'&&trainingLaunch.running&&trainingLaunch.training&&trainingLaunch.active&&trainingLaunch.warDisplay==='none',
    trainingLaunch,{mode:'training',running:true,training:true,active:true,warDisplay:'none'});
  /* The remainder of this verifier constructs its own paused scene. End the
     borrowed Training transaction first so its asynchronous launch cannot
     mutate the controlled building-selection fixture. */
  await page.evaluate(()=>{
    if(typeof cancelTrainingMission==='function')cancelTrainingMission();
    if(typeof hideFrontScreens==='function')hideFrontScreens();
  });
  await page.waitForTimeout(100);
  }catch(error){
    let state=null;
    try{state=await page.evaluate(()=>{
      const card=document.querySelector('.warCard[data-mode="training"]'),grid=document.getElementById('warGrid');
      const D=window.__tutDebug&&window.__tutDebug();
      return {start:document.getElementById('startScreen')&&getComputedStyle(document.getElementById('startScreen')).display,
        war:document.getElementById('warScr')&&getComputedStyle(document.getElementById('warScr')).display,
        card:card&&{mark:card.dataset.mfVerifierMark||'',text:card.textContent.trim()},
        trainingSig:grid&&grid.dataset.mfTrainingSig||'',running:typeof running==='undefined'?null:running,
        mode:typeof activeWarMode==='undefined'?null:activeWarMode,tut:D&&D.TUT};
    });}catch(_){ }
    await writeFile(warFailurePath,JSON.stringify({url,freshUrl,tag,phase:warPhase,error:String(error&&error.stack||error),state,
      warEntryPointer,warRoom,warCardStability,trainingPointer,trainingLaunch,errors},null,2));
    throw error;
  }
  const arranged=await page.evaluate(()=>{
    localStorage.setItem('mf_auth_gate_v1','1');
    if(typeof apClose==='function')apClose();
    if(typeof stopAttract==='function')stopAttract();
    if(typeof hideFrontScreens==='function')hideFrontScreens();
    document.body.classList.remove('menuMode','mfMenuOpen');
    document.querySelectorAll('#startScreen,#warScr,#setupScr,#loadScr,.frontScreen').forEach(el=>el.style.display='none');
    running=true;matchLive=true;paused=true;fogOn=false;
    carrier.active=false;carrier.phase=2;
    closeMenus();clearSel();
    for(let i=0;i<unitHigh;i++)ualive[i]=0;
    unitHigh=0;freeList.length=0;blds.length=0;rebuildBGrid();
    const x=MAP*.5,y=MAP*.5,controlX=x+360,controlY=y;
    addBld('fac',0,x,y,true,0);
    const buildingUnits=[spawnUnit(0,0,x-4,y),spawnUnit(0,0,x+4,y)];
    const controlUnits=[spawnUnit(0,0,controlX-4,controlY),spawnUnit(0,0,controlX+4,controlY)];
    for(let n=0;n<buildingUnits.length;n++){
      const i=buildingUnits[n];ux[i]=x+(n?4:-4);uy[i]=y;utx[i]=ux[i];uty[i]=uy[i];
    }
    for(let n=0;n<controlUnits.length;n++){
      const i=controlUnits[n];ux[i]=controlX+(n?4:-4);uy[i]=controlY;utx[i]=ux[i];uty[i]=uy[i];
    }
    cam.x=x;cam.y=y;camFollow=-1;orthoSpan=900;distTarget=900;
    yawTarget=0;yaw=0;pitchTarget=0.88;pitch=0.88;clampCam();camUpdateMatrices();
    mfIconStackRebuild(()=>true,()=>false);
    const p=w2s(x,y,terrainH(x,y)+4);
    window.__mfBuildingInputNotices=[];
    const baseToast=toast;
    toast=function(msg){window.__mfBuildingInputNotices.push(String(msg));return baseToast.apply(this,arguments);};
    const hist=typeof mfNHistory==='undefined'?[]:mfNHistory;
    const ext=gl&&gl.getExtension('WEBGL_debug_renderer_info');
    return {x,y,controlX,controlY,sx:p[0],sy:p[1],building:0,buildingUnits,controlUnits,
      stackPick:mfIconStackPick(x,y,0),buildPick:pickBld(x,y),hit:document.elementFromPoint(p[0],p[1])?.id||'',
      noticeCount:Number(document.getElementById('noticeLogCount')?.textContent||0),
      strategicHistory:hist.filter(n=>/STACK|SELECT/i.test(String(n.label||''))).reduce((s,n)=>s+(n.n||1),0),
      gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl&&gl.getParameter(gl.RENDERER)};
  });
  await page.waitForTimeout(250);
  await page.mouse.click(arranged.sx,arranged.sy);
  await page.waitForTimeout(300);
  const buildingResult=await page.evaluate(()=>({
    openBld,
    prodDisplay:getComputedStyle(document.getElementById('prodMenu')).display,
    buildDisplay:getComputedStyle(document.getElementById('buildMenu')).display,
    selected:selCount(),
    selectedIds:Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&usel[i]),
    toast:document.getElementById('toast').textContent.trim(),
    noticeCount:Number(document.getElementById('noticeLogCount')?.textContent||0),
    notices:window.__mfBuildingInputNotices.slice(),
    strategicHistory:(typeof mfNHistory==='undefined'?[]:mfNHistory)
      .filter(n=>/STACK|SELECT/i.test(String(n.label||''))).reduce((s,n)=>s+(n.n||1),0),
    shield:!!document.querySelector('[data-mf-boot-input-shield]'),
  }));
  await page.screenshot({path:shot,fullPage:false,timeout:60000});

  check('factory target is the canvas',arranged.hit==='gl',arranged.hit,'gl');
  check('factory has a strategic stack',arranged.stackPick>=0,arranged.stackPick,'unit index >= 0');
  check('factory footprint is pickable',arranged.buildPick===arranged.building,arranged.buildPick,arranged.building);
  check('factory opens production',buildingResult.openBld===arranged.building&&buildingResult.prodDisplay==='block',
    {openBld:buildingResult.openBld,display:buildingResult.prodDisplay},{openBld:arranged.building,display:'block'});
  check('factory tap selects zero units',buildingResult.selected===0,buildingResult.selected,0);
  check('factory tap emits no STACK/SELECT notice',!buildingResult.notices.some(n=>strategicNotice.test(n)),
    buildingResult.notices.filter(n=>strategicNotice.test(n)),[]);
  check('factory tap adds no notice history',buildingResult.noticeCount===arranged.noticeCount,
    buildingResult.noticeCount,arranged.noticeCount);
  check('factory tap adds no strategic history',buildingResult.strategicHistory===arranged.strategicHistory,
    buildingResult.strategicHistory,arranged.strategicHistory);

  /* The old selector used `B.r + 10`, even though construction reserves an
     oriented footprint. Exercise a rotated Factory corner that is visibly on
     the building but outside that legacy circle, with a strategic stack parked
     on it. Then do the same from the projected roof: s2w() lands on terrain
     behind tall meshes, so only the input's screen-prism fallback can make that
     visible portion behave like a building instead of a stack/ground tap. */
  const footprint=await page.evaluate(({x,y})=>{
    closeMenus();clearSel();window.__mfBuildingInputNotices.length=0;
    const B=addBld('fac',0,x+190,y+180,true,Math.PI/2),building=blds.indexOf(B),f=bldFoot(B);
    let corner=null;
    for(const q of [[.47,.42],[.47,-.42],[-.47,.42],[-.47,-.42]]){
      const lx=f[0]*q[0],ly=f[1]*q[1],a=B.rot||0,c=Math.cos(a),s=Math.sin(a);
      const wx=B.x+lx*c-ly*s,wy=B.y+lx*s+ly*c,p=w2s(wx,wy,terrainH(wx,wy)+4);
      if(p[0]<60||p[0]>innerWidth-60||p[1]<120||p[1]>innerHeight-150)continue;
      if(document.elementFromPoint(p[0],p[1])!==cv)continue;
      corner={wx,wy,sx:p[0],sy:p[1],legacyMiss:dist2(wx,wy,B.x,B.y)>(B.r+10)*(B.r+10)};break;
    }
    const units=corner?[spawnUnit(0,0,corner.wx-3,corner.wy),spawnUnit(0,0,corner.wx+3,corner.wy)]:[];
    for(let n=0;n<units.length;n++){const i=units[n];ux[i]=corner.wx+(n?3:-3);uy[i]=corner.wy;utx[i]=ux[i];uty[i]=uy[i];}
    mfIconStackRebuild(()=>true,()=>false);
    if(corner){corner.stackPick=mfIconStackPick(corner.wx,corner.wy,0);corner.buildPick=pickBld(corner.wx,corner.wy);}
    const lift=((BT[B.type]||{}).size||B.r*2)*1.35,roofP=w2s(B.x,B.y,terrainH(B.x,B.y)+lift);
    const roofWorld=s2w(roofP[0],roofP[1]);
    const roof={sx:roofP[0],sy:roofP[1],wx:roofWorld[0],wy:roofWorld[1],
      hit:document.elementFromPoint(roofP[0],roofP[1])?.id||'',
      legacyMiss:dist2(roofWorld[0],roofWorld[1],B.x,B.y)>(B.r+10)*(B.r+10),
      worldPick:pickBld(roofWorld[0],roofWorld[1]),screenPick:pickBld(roofWorld[0],roofWorld[1],roofP[0],roofP[1])};
    return {building,corner,roof,units};
  },{x:arranged.x,y:arranged.y});
  assert.ok(footprint.corner,'visible rotated-footprint corner required');
  assert.equal(footprint.corner.legacyMiss,true,'rotated footprint point must be outside the legacy circle');
  await page.mouse.click(footprint.corner.sx,footprint.corner.sy);
  await page.waitForTimeout(220);
  const footprintResult=await page.evaluate(()=>(
    {openBld,prodDisplay:getComputedStyle(document.getElementById('prodMenu')).display,
      selected:selCount(),notices:window.__mfBuildingInputNotices.slice()}));
  check('rotated footprint remains a building target outside legacy circle',footprintResult.openBld===footprint.building&&footprintResult.prodDisplay==='block',
    {openBld:footprintResult.openBld,display:footprintResult.prodDisplay},{openBld:footprint.building,display:'block'});
  check('rotated footprint ignores its stacked units',footprintResult.selected===0,footprintResult.selected,0);
  check('rotated footprint emits no stack/select notice',!footprintResult.notices.some(n=>strategicNotice.test(n)),
    footprintResult.notices.filter(n=>strategicNotice.test(n)),[]);

  await page.evaluate(()=>{closeMenus();clearSel();window.__mfBuildingInputNotices.length=0;});
  assert.equal(footprint.roof.hit,'gl','visible roof target must be canvas');
  assert.equal(footprint.roof.legacyMiss,true,'projected roof must land outside the legacy ground circle');
  assert.equal(footprint.roof.worldPick,-1,'roof ray must require the screen-prism fallback');
  assert.equal(footprint.roof.screenPick,footprint.building,'screen-prism fallback must resolve the roof to its building');
  await page.mouse.click(footprint.roof.sx,footprint.roof.sy);
  await page.waitForTimeout(220);
  const roofResult=await page.evaluate(()=>(
    {openBld,prodDisplay:getComputedStyle(document.getElementById('prodMenu')).display,
      selected:selCount(),notices:window.__mfBuildingInputNotices.slice()}));
  await page.screenshot({path:footprintShot,fullPage:false,timeout:60000});
  check('visible roof opens production through the real canvas pointer path',roofResult.openBld===footprint.building&&roofResult.prodDisplay==='block',
    {openBld:roofResult.openBld,display:roofResult.prodDisplay},{openBld:footprint.building,display:'block'});
  check('visible roof tap selects zero units',roofResult.selected===0,roofResult.selected,0);
  check('visible roof tap emits no stack/select notice',!roofResult.notices.some(n=>strategicNotice.test(n)),
    roofResult.notices.filter(n=>strategicNotice.test(n)),[]);

  const control=await page.evaluate(({x,y})=>{
    closeMenus();clearSel();window.__mfBuildingInputNotices.length=0;
    cam.x=x;cam.y=y;camFollow=-1;clampCam();camUpdateMatrices();
    mfIconStackRebuild(()=>true,()=>false);
    const p=w2s(x,y,terrainH(x,y)+4),top=document.elementFromPoint(p[0],p[1]);
    return {sx:p[0],sy:p[1],hit:top?.id||'',stackPick:mfIconStackPick(x,y,0),buildPick:pickBld(x,y)};
  },{x:arranged.controlX,y:arranged.controlY});
  await page.mouse.click(control.sx,control.sy);
  await page.waitForTimeout(250);
  const controlResult=await page.evaluate(()=>({
    selected:selCount(),selectedIds:Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&usel[i]),
    openBld,prodDisplay:getComputedStyle(document.getElementById('prodMenu')).display,
    notices:window.__mfBuildingInputNotices.slice(),
  }));
  check('control stack target is the canvas',control.hit==='gl',control.hit,'gl');
  check('control stack is away from buildings',control.stackPick>=0&&control.buildPick<0,
    {stackPick:control.stackPick,buildPick:control.buildPick},{stackPick:'unit index >= 0',buildPick:-1});
  check('control stack tap selects both units',controlResult.selected===2&&
    arranged.controlUnits.every(i=>controlResult.selectedIds.includes(i)),controlResult.selectedIds,arranged.controlUnits);
  check('control stack tap emits its STACK notice',controlResult.notices.some(n=>/^STACK\b/i.test(n)),
    controlResult.notices,'STACK notice');

  const buildSetup=await page.evaluate(({x,y})=>{
    closeMenus();clearSel();cancelPlace();window.__mfBuildingInputNotices.length=0;
    const hx=x,hy=y+360,H=addBld('hq',0,hx,hy,true,0),hq=blds.indexOf(H);
    rebuildBGrid();if(typeof markBuildZone==='function')markBuildZone();
    resM[0]=10000;resE[0]=10000;heroLvl=Math.max(heroLvl,20);
    cam.x=hx;cam.y=hy;camFollow=-1;orthoSpan=900;distTarget=900;
    yawTarget=0;yaw=0;pitchTarget=.88;pitch=.88;clampCam();camUpdateMatrices();
    showHudDock(true,'orders');
    return {hq,hx,hy,blds:blds.length,buildVisible:getComputedStyle(document.getElementById('buildBtn')).display!=='none'};
  },{x:arranged.x,y:arranged.y});
  const buildPointer=await pointerClick(page,page.locator('#buildBtn'),'BUILD button');
  await page.waitForTimeout(100);
  const menuOpened=await page.evaluate(()=>getComputedStyle(document.getElementById('buildMenu')).display);
  const card=page.locator('#buildGrid .bcard').nth(1);
  const cardPointer=await pointerClick(page,card,'Reactor build card');
  await page.waitForTimeout(150);
  const candidate=await page.evaluate(({hq,hx,hy})=>{
    if(!placing)return {error:'card did not enter placement'};
    const initial={type:placing.type,x:placing.x,y:placing.y,rx:placing.rx,ry:placing.ry,rot:placing.rot};
    let found=null;
    outer:for(let radius=140;radius<=460;radius+=40){
      for(let n=0;n<24;n++){
        const a=n/24*TAU;
        placing.rx=hx+Math.cos(a)*radius;placing.ry=hy+Math.sin(a)*radius;snapPlace();
        if(!placementValid()||pickBld(placing.x,placing.y)>=0||dist2(placing.x,placing.y,initial.x,initial.y)<80*80)continue;
        const p=w2s(placing.x,placing.y,terrainH(placing.x,placing.y)+4);
        if(p[0]<60||p[0]>innerWidth-60||p[1]<120||p[1]>innerHeight-150)continue;
        if(document.elementFromPoint(p[0],p[1])!==cv)continue;
        found={x:placing.x,y:placing.y,sx:p[0],sy:p[1]};break outer;
      }
    }
    Object.assign(placing,initial);
    if(!found)return {error:'no visible valid Reactor site',initial,hq};
    const units=[spawnUnit(0,0,found.x-4,found.y),spawnUnit(0,0,found.x+4,found.y)];
    for(let n=0;n<units.length;n++){
      const i=units[n];ux[i]=found.x+(n?4:-4);uy[i]=found.y;utx[i]=ux[i];uty[i]=uy[i];
    }
    mfIconStackRebuild(()=>true,()=>false);
    const tapWorld=s2w(found.sx,found.sy);
    found.units=units;found.initial=initial;found.stackPick=mfIconStackPick(tapWorld[0],tapWorld[1],0);
    found.buildPick=pickBld(tapWorld[0],tapWorld[1]);found.hit=document.elementFromPoint(found.sx,found.sy)?.id||'';
    found.beforeBlds=blds.length;found.beforeBuilt=stats.built[0];
    window.__mfBuildingInputNotices.length=0;
    return found;
  },buildSetup);
  assert.ok(!candidate.error,candidate.error||'valid placement candidate required');
  await page.mouse.click(candidate.sx,candidate.sy);
  await page.waitForTimeout(200);
  const placementResult=await page.evaluate(()=>({
    placing:placing&&{type:placing.type,x:placing.x,y:placing.y,valid:placementValid()},
    selected:selCount(),selectedIds:Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&usel[i]),
    notices:window.__mfBuildingInputNotices.slice(),
  }));
  check('BUILD opens the structure catalogue',menuOpened==='block',menuOpened,'block');
  check('Reactor card enters placement',placementResult.placing?.type==='pgen',placementResult.placing?.type,'pgen');
  check('placement target is a canvas stack away from buildings',candidate.hit==='gl'&&candidate.stackPick>=0&&candidate.buildPick<0,
    {hit:candidate.hit,stackPick:candidate.stackPick,buildPick:candidate.buildPick},{hit:'gl',stackPick:'unit index >= 0',buildPick:-1});
  check('canvas tap moves a valid placement ghost',placementResult.placing?.valid===true&&
    Math.hypot(placementResult.placing.x-candidate.x,placementResult.placing.y-candidate.y)<=30,
    placementResult.placing,{x:candidate.x,y:candidate.y,valid:true});
  check('placement canvas tap selects zero units',placementResult.selected===0,placementResult.selectedIds,[]);
  check('placement canvas tap emits no STACK/SELECT notice',!placementResult.notices.some(n=>strategicNotice.test(n)),
    placementResult.notices.filter(n=>strategicNotice.test(n)),[]);

  const confirmPointer=await pointerClick(page,page.locator('#placeOk'),'placement confirm');
  await page.waitForTimeout(250);
  const confirmResult=await page.evaluate(before=>({
    added:blds.slice(before).map((B,i)=>({index:before+i,type:B.type,team:B.team,alive:B.alive,prog:B.prog})),
    built:stats.built[0],placing:placing&&placing.type,selected:selCount(),
    notices:window.__mfBuildingInputNotices.slice(),
  }),candidate.beforeBlds);
  await page.screenshot({path:placementShot,fullPage:false,timeout:60000});
  check('confirm begins exactly one structure',confirmResult.added.length===1,confirmResult.added.length,1);
  check('begun structure is an unfinished Reactor',confirmResult.added.length===1&&confirmResult.added[0].type==='pgen'&&
    confirmResult.added[0].team===0&&confirmResult.added[0].alive&&confirmResult.added[0].prog<1,
    confirmResult.added[0],{type:'pgen',team:0,alive:true,prog:'< 1'});
  check('confirm increments the player build count once',confirmResult.built===candidate.beforeBuilt+1,
    confirmResult.built,candidate.beforeBuilt+1);
  check('placement flow never selects the target stack',confirmResult.selected===0,confirmResult.selected,0);
  check('placement flow emits no STACK/SELECT notice',!confirmResult.notices.some(n=>strategicNotice.test(n)),
    confirmResult.notices.filter(n=>strategicNotice.test(n)),[]);
  check('no page errors',errors.length===0,errors,[]);

  const report={url,freshUrl,tag,capturedAt:new Date().toISOString(),viewport:{width:900,height:900,hasTouch:true},
    warTraining:{entryPointer:warEntryPointer,trainingPointer,warRoom,warCardStability,trainingLaunch},
    arranged,buildingResult,footprint,footprintResult,roofResult,control,controlResult,buildSetup,
    pointers:{build:buildPointer,card:cardPointer,placement:{x:candidate.sx,y:candidate.sy},confirm:confirmPointer},
    candidate,placementResult,confirmResult,checks,errors,screenshots:{warRoom:warShot,building:shot,footprint:footprintShot,placement:placementShot}};
  await writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:true,checks:checks.length,report:reportPath,screenshots:report.screenshots}));
  const failed=checks.filter(c=>!c.pass);
  assert.equal(failed.length,0,'building-input hotfix failures:\n'+failed.map(c=>
    '- '+c.name+': expected '+JSON.stringify(c.expected)+', got '+JSON.stringify(c.actual)).join('\n'));
}finally{
  await closePwBrowser(browser);
}
