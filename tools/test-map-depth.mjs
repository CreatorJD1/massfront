/* Battlefield-scale, hazard and resource-site regression.
   Usage: node tools/test-map-depth.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','map-depth');
const shot=join(out,'map-depth-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof battlefieldPresetDef==='function'&&typeof hazVisionMult==='function'&&
    typeof spawnResourceSiteCrate==='function'&&typeof setupDeposits==='function'&&typeof render==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract(); demoMode=false; running=true; paused=true; fogOn=true; carrier.active=false;
    playerStartZone='sw';aiSlots=[{on:true,diff:1,zone:'ne'},{on:false,diff:1,zone:'nw'},{on:false,diff:1,zone:'se'}];
    const spans={};
    for(const key of ['compact','standard','large']){
      battlefieldPreset=key;
      const S=skirmishSpawnPoints();spans[key]=Math.round(Math.sqrt(dist2(S[0].x,S[0].y,S[1].x,S[1].y)));
    }
    battlefieldPreset='compact';
    aiSlots=[{on:true,diff:1,zone:'w'},{on:true,diff:1,zone:'nw'},{on:true,diff:1,zone:'n'}];
    setupDeposits();
    const compactEconomy=skirmishSpawnPoints().map(S=>({zone:S.zone,
      m:deposits.filter(D=>D.starter===S.zone).length,e:geysers.filter(G=>G.starter===S.zone).length}));
    aiSlots=[{on:true,diff:1,zone:'ne'},{on:false,diff:1,zone:'nw'},{on:false,diff:1,zone:'se'}];
    battlefieldPreset='standard';curMap='highland';setupDeposits();
    const starts=skirmishSpawnPoints();
    const economy=starts.map(S=>({zone:S.zone,m:deposits.filter(D=>D.starter===S.zone).length,
      e:geysers.filter(G=>G.starter===S.zone).length}));

    ualive.fill(0);unitHigh=0;blds.length=0;rebuildGrid();fogCov.fill(0);fogSeen.fill(0);
    const cx=MAP*.5,cy=MAP*.5;
    spawnUnit(1,0,cx,cy);addBld('hq',0,cx+85,cy,true);updateFog();
    const clear=fogCov.reduce((n,v)=>n+(v?1:0),0);
    HAZ.front={cx,cy,dx:1,dy:0,w:420,p:0,sp:0};updateFog();
    const storm=fogCov.reduce((n,v)=>n+(v?1:0),0);
    HAZ.front=null;

    hazReset();
    if(!HAZ.faults.length) HAZ.faults.push({x:cx,y:cy,r:115,state:0,at:0});
    const F=HAZ.faults[0],c=[F.x,F.y,F.r,[220,176,98]];c.fault=F;F.state=1;
    HAZ.cells=[c];HAZ.phase=1;HAZ.warn=0;const dq=deformQ.length;hazStrike();
    const collapse={state:F.state,queued:deformQ.length-dq};
    const C=spawnResourceSiteCrate();
    const site=C&&{site:C.site,alt:C.alt,kind:C.kind.id,far:farFromStartZones(C.x,C.y,350)};
    return {spans,compactEconomy,economy,clear,storm,collapse,site};
  });

  assert(result.spans.compact<result.spans.standard&&result.spans.standard<result.spans.large,
    'engagement presets did not produce ordered start separation: '+JSON.stringify(result.spans));
  assert(result.economy.every(E=>E.m===3&&E.e===1),'starter economy is not equal: '+JSON.stringify(result.economy));
  assert(result.compactEconomy.every(E=>E.m===3&&E.e===1),'clustered four-player Compact economy is not equal: '+JSON.stringify(result.compactEconomy));
  assert(result.storm<result.clear,'storm did not reduce live fog coverage: '+JSON.stringify({clear:result.clear,storm:result.storm}));
  assert(result.collapse.state===2&&result.collapse.queued===1,'fault collapse did not queue real terrain deformation');
  assert(result.site&&result.site.site&&result.site.alt===0&&result.site.far,'resource-site pickup was not valid: '+JSON.stringify(result.site));

  await page.evaluate(()=>{
    resetWorld();stopAttract();demoMode=true;matchLive=true;running=true;paused=true;fogOn=false;
    carrier.active=false;carrier.phase=2;document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');
    const L=findLand(MAP*.5,MAP*.5),cx=L[0],cy=L[1];
    addBld('hq',0,cx-125,cy+80,true);
    for(let n=0;n<8;n++) spawnUnit([1,0,9,11][n%4],0,cx-150+(n%4)*42,cy+145+((n/4)|0)*38);
    const C=spawnCrate(cx+145,cy+35,'supply');C.alt=0;C.seen=true;C.site=true;C.siteName='MASS SITE';
    const F={x:cx+45,y:cy-130,r:112,state:1,at:stats.t};
    HAZ.mode='highland';HAZ.faults=[F];const cell=[F.x,F.y,F.r,[220,176,98]];cell.fault=F;
    HAZ.cells=[cell];HAZ.warn=4.2;HAZ.phase=1;
    cam.x=cx;cam.y=cy-15;camFollow=-1;camYaw=yawTarget=.30;camPitch=pitchTarget=1.12;
    orthoSpan=distTarget=760;clampCam();camUpdateMatrices();showHudDock(true,'orders');
    toast('⛰ FAULT COLLAPSE — EVACUATE THE MARKED SHELF');renderMinimap();
  });
  await page.waitForTimeout(900);
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshot:shot},null,2));
}finally{await browser.close();}
