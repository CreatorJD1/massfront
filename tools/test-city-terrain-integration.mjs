/* City/terrain integration gate — deterministic 412x915 tactical capture.
   Usage: node tools/test-city-terrain-integration.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8982/';
const nightCapture=process.argv.includes('--night');
const debugMode=Number((process.argv.find(a=>a.startsWith('--debug='))||'').slice(8))||0;
const out=join(root,'releases','terrain-city-v2');
await mkdir(out,{recursive:true});
const shot=join(out,nightCapture?'city-terrain-night-mobile.png':'city-terrain-mobile.png');
const assert=(v,m)=>{if(!v)throw new Error(m);};

const browser=await launchPwBrowser({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof setupRelics==='function'&&typeof cityGroundAt==='function'&&typeof TGRID!=='undefined'&&typeof MFWorldStructuresV2==='object',null,{timeout:60000});
  await page.waitForFunction(()=>typeof gl!=='undefined'&&gl&&heightF&&terrainTex,null,{timeout:60000});
  await page.evaluate(()=>{META.settings.quality='cinematic';applyQualityPreset();activeWarMode='standard';curMap='vespera_refinery_large';curTheme='vespera';builtMap='';hideFrontScreens();newSkirmish();});
  await page.waitForFunction(()=>carrier&&carrier.active&&heightF&&PASS,null,{timeout:60000});
  await page.waitForFunction(()=>MFWorldStructuresV2.status().ready,null,{timeout:30000});
  const state=await page.evaluate(({nightCapture,debugMode})=>{
    if(typeof apGateSatisfied==='function')apGateSatisfied();
    const ap=document.getElementById('apOverlay');if(ap)ap.style.display='none';
    stopAttract();hideFrontScreens();
    for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch']){const e=document.getElementById(id);if(e)e.style.display='none';}
    document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
    curMap='vespera_refinery_large';curTheme='vespera';demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;
    window.MFVisualDebug=debugMode;
    if(nightCapture)dayT=.5;
    carrier.active=false;carrier.phase=2;
    const Z=cityZones.find(z=>z.ind)||cityZones[0];
    cam.x=Z.x;cam.y=Z.y;camFollow=-1;camYaw=yawTarget=.69;camPitch=pitchTarget=1.13;orthoSpan=distTarget=700;
    clampCam();camUpdateMatrices();showHudDock(true,'view');setHudDeck('view');
    let cityCells=0,plotCells=0,roadCells=0;
    for(const v of CITYG){if(v)cityCells++;if(v===2)roadCells++;if(v===3)plotCells++;}
    const propsInCity=[...rocks,...trees,...crystals].filter(o=>cityGroundAt(o.x,o.y)).length;
    const segDist=(x,y,S)=>{const dx=S[2]-S[0],dy=S[3]-S[1],L2=dx*dx+dy*dy||1;
      const t=Math.max(0,Math.min(1,((x-S[0])*dx+(y-S[1])*dy)/L2));return Math.hypot(x-(S[0]+dx*t),y-(S[1]+dy*t));};
    let roadPlotOverlaps=0,frontageMissing=0;const overlapDetails=[];
    for(const P of cityPlan){
      if(P.street==null||P.roadX==null||P.frontX==null){frontageMissing++;continue;}
      const ca=Math.cos(P.a),sa=Math.sin(P.a);
      /* Sample the complete 1.18x foundation apron rather than only the model
         centre. A road crossing even one sample means the visual hierarchy is
         broken despite the building itself technically remaining on land. */
      let hit=false;
      for(let iy=-3;iy<=3&&!hit;iy++)for(let ix=-3;ix<=3&&!hit;ix++){
        const lx=P.w*.59*ix/3,ly=P.h*.59*iy/3,x=P.x+lx*ca-ly*sa,y=P.y+lx*sa+ly*ca;
        for(const S of cityStreets)if(S[5]===P.zone&&segDist(x,y,S)<S[4]*.5+1){hit=true;break;}
      }
      if(hit){roadPlotOverlaps++;if(overlapDetails.length<12)overlapDetails.push({x:P.x|0,y:P.y|0,w:P.w|0,h:P.h|0,zone:P.zone,street:P.street});}
    }
    const sampleStreet=cityStreets[0],plot=cityPlan[0];
    const roadRejected=sampleStreet? (cityGroundAt((sampleStreet[0]+sampleStreet[2])*.5,(sampleStreet[1]+sampleStreet[3])*.5)===2) : false;
    const plotAllowed=plot? (cityGroundAt(plot.x,plot.y)===3) : false;
    /* City streets were already tested above. Macro highways use a separate
       generation list, so keep a direct regression gate for the exact bug
       reported on device: a foundation must reject a world-road deck too. */
    const macro=(worldRoadSegments||[])[0];
    const macroRoadRejected=macro? (cityGroundAt((macro.x0+macro.x1)*.5,(macro.y0+macro.y1)*.5)>=1) : true;
    /* A tactical road must terminate at a junction core, never pass beneath
       it. This is a geometry test, separate from the older road-vs-lot test. */
    let moduleJunctionOverlaps=0;
    for(const M of cityRoadModules)for(const J of cityRoadJunctions){
      if(M.zone!==J.zone)continue;
      if(segDist(J.x,J.y,[M.x0,M.y0,M.x1,M.y1])<J.w*.52){moduleJunctionOverlaps++;break;}
    }
    let highwayCityIntrusions=0;
    for(const R of worldRoadSegments||[])for(const Z of cityZones){
      if(segDist(Z.x,Z.y,[R.x0,R.y0,R.x1,R.y1])<Z.r+R.w*.70){highwayCityIntrusions++;break;}
    }
    let highwayPadIntrusions=0;
    for(const R of worldRoadSegments||[])for(const P of cityBuildPads){
      const ca=Math.cos(P.a),sa=Math.sin(P.a),len=Math.hypot(R.x1-R.x0,R.y1-R.y0)||1,n=Math.max(2,Math.ceil(len/5));
      let hit=false;
      for(let s=0;s<=n&&!hit;s++){
        const t=s/n,x=R.x0+(R.x1-R.x0)*t,y=R.y0+(R.y1-R.y0)*t,dx=x-P.x,dy=y-P.y;
        const lx=dx*ca+dy*sa,ly=-dx*sa+dy*ca,margin=R.w*.5+7;
        if(Math.abs(lx)<=P.w*.5+margin&&Math.abs(ly)<=P.h*.5+margin)hit=true;
      }
      if(hit){highwayPadIntrusions++;break;}
    }
    const cityBoards=(typeof adBoards==='undefined'?[]:adBoards.filter(B=>String(B.id).startsWith('cz')));
    let detachedCityBoards=0;
    for(const B of cityBoards){
      let near=false;
      for(const D of cityDriveways)if(Math.min(Math.hypot(B.x-D.frontX,B.y-D.frontY),Math.hypot(B.x-D.roadX,B.y-D.roadY))<30){near=true;break;}
      if(!near)detachedCityBoards++;
    }
    return {grid:TGRID,triangles:TGRID*TGRID*2,zones:cityZones.length,plots:cityPlan.length,roadLights:cityRoadLights.length,
      streetSegments:cityStreets.length,roadEdges:cityRoadEdges.length,roadModules:cityRoadModules.length,roadJunctions:cityRoadJunctions.length,
      hardstands:cityBuildPads.length,driveways:cityDriveways.length,
      roadSample:cityRoadModules.slice(0,3).map(R=>({w:R.w,len:R.len,a:R.a,x:R.x,y:R.y})),
      relics:relics.length,cityCells,roadCells,plotCells,propsInCity,roadPlotOverlaps,frontageMissing,moduleJunctionOverlaps,highwayCityIntrusions,highwayPadIntrusions,cityBoards:cityBoards.length,detachedCityBoards,overlapDetails,roadRejected,plotAllowed,
      macroRoadRejected,
      worldV2:typeof MFWorldStructuresV2!=='undefined'?MFWorldStructuresV2.status():null,focus:[Z.x,Z.y]};
  },{nightCapture,debugMode});
  await page.waitForTimeout(1200);await page.screenshot({path:shot,fullPage:false});
  const terrainData=await page.evaluate(()=>terrainCanvas.toDataURL('image/png').split(',')[1]);
  await writeFile(join(out,'city-terrain-ground.png'),Buffer.from(terrainData,'base64'));
  console.log(JSON.stringify(state,null,2));
  assert(state.grid>=256,'terrain geometry resolution did not increase');
  assert(state.plots>0&&state.plots===state.relics,'city planner/relic mismatch');
  assert(state.roadLights>0,'street planner did not produce curb-connected road lights');
  assert(state.streetSegments>0,'city street blueprint did not resolve street segments');
  assert(state.roadModules>=state.roadEdges,'tactical road panel modules did not resolve');
  assert(state.hardstands===state.plots&&state.driveways>0,'city building ground-contact blueprint did not resolve');
  assert(state.roadRejected&&state.plotAllowed,'high-resolution city road/lot placement detection failed');
  assert(state.macroRoadRejected,'macro highway was not protected by player placement validation');
  assert(state.cityCells>0&&state.plotCells>0&&state.roadCells>0,'city occupancy classes missing');
  assert(state.propsInCity===0,'wilderness props overlap city occupancy: '+state.propsInCity);
  assert(state.frontageMissing===0,'city plots missing street frontage: '+state.frontageMissing);
  assert(state.roadPlotOverlaps===0,'road corridors overlap building aprons: '+state.roadPlotOverlaps);
  assert(state.moduleJunctionOverlaps===0,'road modules overlap junction cores: '+state.moduleJunctionOverlaps);
  assert(state.highwayCityIntrusions===0,'world highway passes through a city district: '+state.highwayCityIntrusions);
  assert(state.highwayPadIntrusions===0,'world highway overlaps a real city hardstand: '+state.highwayPadIntrusions);
  assert(state.cityBoards>0,'city frontage did not receive a road-connected display');
  assert(state.detachedCityBoards===0,'city ad display is not attached to a driveway frontage: '+state.detachedCityBoards);
  assert(state.worldV2&&state.worldV2.enabled,'Material V2 did not render the integrated city capture');
  /* Texture decode readiness alone is not visual evidence. The test capture
     must contain actual V2 mesh resources for every five map structure kinds;
     otherwise the render loop can suppress the legacy stream and leave an
     apparently valid but empty city. */
  assert(await page.evaluate(()=>MFWORLD2_DEFS.every(D=>mfWorld2Meshes[D.kind]&&mfWorld2Meshes[D.kind].count>0)),
    'World V2 reported ready but one or more city structure meshes are unavailable');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...state,screenshot:shot},null,2));
}finally{await browser.close();}
