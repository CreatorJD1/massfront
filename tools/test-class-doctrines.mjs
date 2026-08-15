/* Focused contextual class doctrines and visual category briefing test.
   Usage: node tools/test-class-doctrines.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir=join(root,'releases','class-doctrines');
const shot=join(outDir,'class-doctrine-build-menu-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof tryClassAbility==='function'&&typeof classAbilityChoice==='function'&&
    typeof renderMenuRoleBrief==='function'&&typeof stopAttract==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();running=false;paused=true;demoMode=false;fogOn=false;
    const clear=()=>{
      for(let i=0;i<unitHigh;i++)ualive[i]=0;
      unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;usel.fill(0);
      blds.length=0;rebuildBGrid(true);classAbilityReset();resE[0]=3000;resM[0]=3000;META.res={};
    };
    const make=(t,x,y,sel=true)=>{const i=spawnUnit(t,0,x,y);ux[i]=utx[i]=x;uy[i]=uty[i]=y;usel[i]=sel?1:0;return i;};
    const cx=MAP*.5,cy=MAP*.5;
    const nodes=['breakthrough','intercept','fieldservice'].map(id=>DEVTREE.find(n=>n.id===id));

    clear();const rhino=make(1,cx,cy);const e0=resE[0];tryClassAbility();
    const locked={energy:resE[0],buff:uclassBuff[rhino],cool:classAbCool.assault};
    META.res.breakthrough=1;tryClassAbility();
    const assault={energy:e0-resE[0],buff:uclassBuff[rhino],time:uclassBuffT[rhino],cool:classAbCool.assault,
      dmg:classDmgMul(rhino),rate:classCoolMul(rhino),speed:classSpdMul(rhino),taken:classTakenMul(rhino)};

    clear();META.res.intercept=1;const kestrel=make(25,cx,cy);const e1=resE[0];tryClassAbility();
    const intercept={energy:e1-resE[0],buff:uclassBuff[kestrel],time:uclassBuffT[kestrel],cool:classAbCool.intercept,
      range:classRngMul(kestrel),rate:classCoolMul(kestrel),speed:classSpdMul(kestrel),taken:classTakenMul(kestrel)};

    clear();META.res.fieldservice=1;const warden=make(24,cx,cy),ally=make(1,cx+45,cy,false);
    uhp[ally]=uhpm[ally]*.25;const before=uhp[ally];const B=addBld('turret',0,cx-50,cy,true);B.hp=B.hpm*.3;const bb=B.hp,e2=resE[0];
    // forUnitsIn reads the simulation spatial hash, which is normally rebuilt
    // by unitTick. This focused harness creates units without advancing a tick.
    rebuildGrid();
    tryClassAbility();
    const service={energy:e2-resE[0],supportBuff:uclassBuff[warden],allyBuff:uclassBuff[ally],time:uclassBuffT[ally],
      heal:uhp[ally]-before,bldHeal:B.hp-bb,cool:classAbCool.service,taken:classTakenMul(ally)};

    // Stable mobile presentation for the adaptive ability and role briefing.
    clear();META.res.breakthrough=1;const uiUnit=make(1,cx,cy);running=true;paused=true;demoMode=true;matchLive=false;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#bldMenu2,#buildMenu,#prodMenu').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');showHudDock(true,'powers');updateSelInfo();updateHUD(60);
    const btn=document.getElementById('abClass'),br=btn.getBoundingClientRect();
    const button={display:getComputedStyle(btn).display,w:br.width,h:br.height,label:btn.getAttribute('aria-label'),name:document.getElementById('classAbNm').textContent};
    renderBuildMenu();document.getElementById('buildMenu').style.display='block';
    // Selection detail is tested above; keep it from covering the build-role
    // panel that this screenshot exists to verify.
    document.getElementById('unitCard').style.display='none';
    const role=document.querySelector('#buildMenu .menuRoleBrief');
    const roleBox=role.getBoundingClientRect();
    const brief={text:role.innerText,canvas:!!role.querySelector('canvas'),w:roleBox.width,h:roleBox.height,
      tabs:document.querySelectorAll('#buildTabs .tabBtn').length};
    cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.6;camPitch=pitchTarget=1.19;orthoSpan=distTarget=900;clampCam();camUpdateMatrices();
    return {nodes:nodes.map(n=>n&&n.id),locked,assault,intercept,service,button,brief};
  });

  assert(result.nodes.join(',')==='breakthrough,intercept,fieldservice','doctrine nodes missing: '+JSON.stringify(result.nodes));
  assert(result.locked.energy===3000&&result.locked.buff===0&&result.locked.cool===0,'locked ability mutated state: '+JSON.stringify(result.locked));
  assert(result.assault.energy===130&&result.assault.buff===1&&result.assault.time===9&&result.assault.cool===44&&
    result.assault.dmg>1.25&&result.assault.rate<.8&&result.assault.speed>1.2&&result.assault.taken>1.1,
    'breakthrough trade contract failed: '+JSON.stringify(result.assault));
  assert(result.intercept.energy===95&&result.intercept.buff===2&&result.intercept.time===8&&result.intercept.cool===38&&
    result.intercept.range>1.2&&result.intercept.rate<.7&&result.intercept.speed>1.5&&result.intercept.taken<.9,
    'intercept contract failed: '+JSON.stringify(result.intercept));
  assert(result.service.energy===115&&result.service.supportBuff===3&&result.service.allyBuff===3&&result.service.time===7&&
    result.service.heal>90&&result.service.bldHeal>100&&result.service.cool===34&&result.service.taken<.75,
    'field service contract failed: '+JSON.stringify(result.service));
  assert(result.button.display==='flex'&&result.button.w>=48&&result.button.h>=48&&result.button.name==='BREAK'&&/energy/.test(result.button.label),
    'context button missing or undersized: '+JSON.stringify(result.button));
  assert(result.brief.canvas&&result.brief.w>250&&result.brief.h>=110&&result.brief.tabs>=6&&/RESOURCE GRID/.test(result.brief.text)&&/BUILD CHAIN/.test(result.brief.text),
    'visual structure category brief missing: '+JSON.stringify(result.brief));
  await page.waitForTimeout(700);
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshot:shot},null,2));
}finally{await browser.close();}
