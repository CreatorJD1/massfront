/* Fog-of-war and battlefield-recovery regression.
   Usage: node tools/test-fog-pickups.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','fog-pickups');
const shot=join(out,'fog-pickups-mobile.png');
const fogShot=join(out,'fog-scouting-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof updateFog==='function'&&typeof fogEntityVisible==='function'&&
    typeof spawnCrate==='function'&&typeof render==='function'&&typeof pickUnit==='function'&&
    typeof resetWorld==='function'&&typeof stopAttract==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();resetWorld();demoMode=false;matchLive=true;running=true;paused=true;fogOn=true;
    carrier.active=false;carrier.phase=2;document.querySelectorAll('.overlay').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');
    const px0=MAP*.22,py0=MAP*.78,ex=MAP*.78,ey=MAP*.22;
    const p=spawnUnit(1,0,px0,py0),e=spawnUnit(1,1,ex,ey);
    const ph=addBld('hq',0,px0+70,py0,true),eh=addBld('hq',1,ex,ey,true);
    rebuildGrid();updateFog();
    const spawnState={enemyCov:covAt(ex,ey),enemySeen:eh.seen,entityVisible:fogEntityVisible(1,ex,ey),
      pickUnit:pickUnit(ex,ey).enemy,pickBld:pickBld(ex,ey),seenCells:fogSeen.reduce((n,v)=>n+(v?1:0),0),
      liveCells:fogCov.reduce((n,v)=>n+(v?1:0),0)};
    /* Even a stale remembered flag may not restore a live model or target. */
    eh.seen=true;
    spawnState.rememberedVisible=fogEntityVisible(1,ex,ey);
    spawnState.rememberedPick=pickBld(ex,ey);
    const gates={render:render.toString().includes('fogFxVisible'),legacy:renderLegacySprites.toString().includes('fogFxVisible'),
      minimap:renderMinimap.toString().includes('fogEntityVisible'),shadow:drawShadows.toString().includes('fogEntityVisible'),
      aiPing:aiTick.toString().includes('setWaveWarning')&&!aiTick.toString().includes('mmPing(AI.base.x')&&
        !setWaveWarning.toString().includes('fromX:')&&!setWaveWarning.toString().includes('fromY:')};

    /* Touch-collection must apply the reward, announce its rarity and start a
       temporary local scan without revealing the enemy spawn. */
    const scan=spawnCrate(px0,py0,'scan');scan.alt=0;scan.seen=true;
    const before=crates.length;crateTick(.05);
    const pickup={before,after:crates.length,scanCount:fogScans.length,
      notice:document.getElementById('toast').textContent,
      rarityCount:new Set(CRATE_RARITY.map(r=>r.id)).size,kindCount:CRATE_KINDS.length};
    return {spawnState,gates,pickup};
  });

  assert(result.spawnState.enemyCov===0,'enemy spawn begins inside player vision');
  assert(!result.spawnState.enemySeen&&!result.spawnState.entityVisible,'enemy HQ was visible before scouting');
  assert(result.spawnState.pickUnit===-1&&result.spawnState.pickBld===-1,'hidden enemy remained pointer-targetable');
  assert(!result.spawnState.rememberedVisible&&result.spawnState.rememberedPick===-1,'stale building memory leaked a live target');
  assert(result.spawnState.seenCells>0&&result.spawnState.liveCells>0,'player vision failed to uncover its own start');
  assert(Object.values(result.gates).every(Boolean),'one or more fog render/minimap/AI gates are missing: '+JSON.stringify(result.gates));
  assert(result.pickup.after===result.pickup.before-1&&result.pickup.scanCount===1,'scan pickup was not collected/applied');
  assert(result.pickup.notice.includes('RARE RECOVERED')&&result.pickup.notice.includes('Survey Beacon'),
    'pickup did not present a readable rarity/reward notice: '+result.pickup.notice);
  assert(result.pickup.rarityCount===5&&result.pickup.kindCount>=8,'pickup variety/rarity roster regressed');

  await page.evaluate(()=>{
    resetWorld();stopAttract();demoMode=false;matchLive=true;running=true;paused=true;fogOn=true;
    carrier.active=false;carrier.phase=2;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1];
    window.__fogQaCenter=[cx,cy];
    addBld('hq',0,cx,cy,true);
    for(let n=0;n<5;n++)spawnUnit([1,0,9,11,19][n],0,cx-75+n*36,cy+95);
    const picks=[['mass',-190,-70],['power',-95,-145],['supply',0,-175],['scan',100,-145],['vet',190,-70],['xp',145,75]];
    for(const [id,dx,dy] of picks){const C=spawnCrate(cx+dx,cy+dy,id);C.alt=0;C.seen=true;}
    updateFog();
    /* Leave a dim explored ring outside current sensors, making all three fog
       states visible in one QA frame. */
    markCov(cx,cy,18);for(let i=0;i<FN*FN;i++)if(fogCov[i])fogSeen[i]=1;updateFog();
    cam.x=cx;cam.y=cy-25;camFollow=-1;camYaw=yawTarget=.22;camPitch=pitchTarget=1.12;
    orthoSpan=distTarget=760;clampCam();camUpdateMatrices();
    showHudDock(true,'orders');pickupToast(CRATE_KINDS.find(k=>k.id==='scan'),'LOCAL SENSOR WINDOW · 24 SECONDS');
    updateSelInfo();renderMinimap();
  });
  await page.waitForTimeout(900);
  await page.screenshot({path:shot,fullPage:false});
  await page.evaluate(()=>{
    const [cx,cy]=window.__fogQaCenter;
    cam.x=cx;cam.y=cy-610;orthoSpan=distTarget=2050;clampCam();camUpdateMatrices();
    document.getElementById('toast').style.opacity=0;
  });
  await page.waitForTimeout(500);
  await page.screenshot({path:fogShot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshots:[shot,fogShot]},null,2));
}finally{await browser.close();}
