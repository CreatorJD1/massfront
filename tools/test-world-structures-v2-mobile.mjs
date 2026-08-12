/* Live phone-frame verification for the five map-generated Material V2 assets.
   Usage: node tools/test-world-structures-v2-mobile.mjs [local URL]

   The scene is staged through the real simulation and renderGame path rather
   than a second showcase renderer, so this catches atlas, authored-UV, depth,
   fog and HUD integration regressions that a model laboratory cannot. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8982/';
const expectV2=!/[?&]worldv2=0(?:&|$)/.test(url);
const out=resolve('releases','art-v2');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{
    localStorage.clear();localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>typeof newSkirmish==='function'&&typeof MFWorldStructuresV2==='object',null,{timeout:45000});
  /* The current war table is a four-step galaxy flow: tapping its footer once
     advances one stage and intentionally does not launch. QA enters the same
     newSkirmish core directly so menu animation changes cannot invalidate an
     art/render regression test. */
  await page.evaluate(()=>{META.settings.quality='cinematic';applyQualityPreset();activeWarMode='standard';curTheme='verdant';curMap='vanguard';builtMap='';hideFrontScreens();mmDirty=true;applyTheme();newSkirmish();});
  await page.waitForFunction(()=>carrier&&carrier.active&&heightF&&PASS,null,{timeout:60000});
  if(expectV2)await page.waitForFunction(()=>MFWorldStructuresV2.status().ready,null,{timeout:30000});
  const state=await page.evaluate(()=>{
    carrier.active=false;carrier.phase=2;matchLive=false;running=true;fogOn=false;labNight=.28;
    const L=findLand(MAP*.5,MAP*.5),x=L[0],y=L[1];
    window.__stageWorldV2=(military)=>{
      relics.length=0;
      const add=(kind,dx,dy,w,h,hp=1000,health=1)=>relics.push({x:x+dx,y:y+dy,w,h,s:Math.max(w,h),a:.10,kind,zone:0,
        hp:hp*health,hpm:hp,alive:true,salv:0,salvE:0,lean:0,burn:health<.5?.45:0,seed:kind*997+31});
      if(military){add(2,-92,-12,100,84);add(3,105,28,62,58,1000,.38);}
      else {add(0,-105,-65,52,52);add(1,78,-72,62,58);add(4,38,105,62,58);}
      cam.x=x;cam.y=y;camFollow=-1;orthoSpan=distTarget=military?430:470;camPitch=pitchTarget=1.0;camYaw=yawTarget=.56;
      clampCam();camUpdateMatrices();updateFog();
    };
    window.__stageWorldV2(false);while(gl.getError()){};
    return {x,y,status:MFWorldStructuresV2.status()};
  });
  await page.waitForTimeout(700);
  const civilShot=resolve(out,'world-structures-v2-civilian-mobile.png');await page.screenshot({path:civilShot,fullPage:false});
  await page.evaluate(()=>window.__stageWorldV2(true));await page.waitForTimeout(700);
  const militaryShot=resolve(out,'world-structures-v2-military-mobile.png');await page.screenshot({path:militaryShot,fullPage:false});
  const glState=await page.evaluate(()=>({status:MFWorldStructuresV2.status(),drawCalls,triCount,glError:gl.getError(),quality:qualityKey()}));
  /* SwiftShader's existing post chain reports INVALID_OPERATION (1282) on
     both legacy and V2 paths. Keep it visible in the result, but only fail on
     a new error code or a page exception. */
  if((expectV2&&!glState.status.enabled)||(glState.glError!==0&&glState.glError!==1282)||errors.length)
    throw new Error(JSON.stringify({glState,errors}));
  console.log(JSON.stringify({ok:true,state,glState,knownBaselineGlError:glState.glError===1282,
    screenshots:[civilShot,militaryShot]},null,2));
}finally{await browser.close();}
