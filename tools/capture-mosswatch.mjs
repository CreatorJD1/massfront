/* Capture the real P-01 battlefield and its first soul-plane breach.
   Usage: node tools/capture-mosswatch.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','campaign-prologue'),shot=join(out,'mosswatch-reality-fracture-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{
    localStorage.clear();localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof storyCampaignOpenMission==='function'&&heightF&&PASS,null,{timeout:60000});
  await page.evaluate(()=>{META.tutorial=META.tutorial||{};META.tutorial.done=true;storyCampaignOpenMission('mosswatch-breach');});
  await page.locator('#setupStart').tap();
  await page.waitForFunction(()=>carrier&&carrier.active&&curMap==='aelos_north_small',null,{timeout:60000});
  const deployed=await page.evaluate(()=>{
    carrier.phase=1;carrier.alt=0;carrier.clearance=0;
    let site=null;
    for(let ring=0;ring<22&&!site;ring++)for(let iy=-ring;iy<=ring&&!site;iy++)for(let ix=-ring;ix<=ring;ix++){
      if(ring&&Math.abs(ix)!==ring&&Math.abs(iy)!==ring)continue;
      const x=Math.round((carrier.x+ix*32)/SNAP_GRID)*SNAP_GRID,y=Math.round((carrier.y+iy*32)/SNAP_GRID)*SNAP_GRID;
      if(x>80&&x<MAP-80&&y>80&&y<MAP-80&&footOnLand('hq',x,y,0)&&!footBlocked('hq',x,y,0))site=[x,y];
    }
    if(!site)return false;
    carrier.x=carrier.tx=site[0];carrier.y=carrier.ty=site[1];deployCarrier();return matchLive;
  });
  if(!deployed)throw new Error('Mosswatch carrier could not find a valid deployment site');
  const scene=await page.evaluate(()=>{
    stats.t=75;storyCampaignTick();fogOn=false;updateFog();
    const r=storyCampaignRuntime&&storyCampaignRuntime.rifts&&storyCampaignRuntime.rifts[0];if(!r)return null;
    cam.x=r.x;cam.y=r.y;camFollow=-1;orthoSpan=distTarget=760;camPitch=pitchTarget=1.10;camYaw=yawTarget=.12;
    clampCam();camUpdateMatrices();return {x:r.x,y:r.y,brood:teamCount[2],beat:storyCampaignRuntime.beat};
  });
  if(!scene||scene.brood<12||scene.beat!==1)throw new Error('First authored breach failed: '+JSON.stringify(scene));
  await page.waitForTimeout(250);
  await page.screenshot({path:shot,fullPage:false});
  if(errors.length)throw new Error('page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,scene,screenshot:shot},null,2));
}finally{await browser.close();}
