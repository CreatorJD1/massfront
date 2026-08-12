/* Focused live QA for the tower-defense tranche.
   Usage: node tools/test-tower-defense.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','tower-defense');
const shot=join(out,'tower-defense-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

/* The source assertion protects the fog contract: a warning may use direction
   and a friendly destination, but must never ping the hidden launch base. */
const aiSource=await readFile(join(root,'src','game','ai.js'),'utf8');
assert(!/mmPing\(warnBase\.x|mmPing\(AI\.base\.x/.test(aiSource),'wave warning leaks the hidden spawn through a minimap ping');

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof bldWeaponSnapshot==='function'&&typeof bldUpgradeDeltaText==='function'&&
    typeof setWaveWarning==='function'&&typeof TECH_GUARD!=='undefined'&&typeof render==='function'&&
    typeof stopAttract==='function'&&typeof resetWorld==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();resetWorld();running=true;paused=true;demoMode=false;matchLive=true;fogOn=false;
    META.settings.godMode=false;carrier.active=false;carrier.phase=2;
    const weapons=Object.keys(DEF_WEAPON_DATA),tiers={};
    for(const type of weapons){
      const B={type,team:2,lvl:1,boost:0,boostM:1,hpm:BT[type].hp,hp:BT[type].hp};
      tiers[type]=[1,2,3].map(lvl=>bldWeaponSnapshot(B,lvl));
    }
    const fullPaths=weapons.every(type=>BUP[type]&&BUP[type].length===2);
    const monotonic=weapons.every(type=>tiers[type][0].damage<tiers[type][1].damage&&
      tiers[type][1].damage<tiers[type][2].damage&&tiers[type][0].range<tiers[type][1].range&&
      tiers[type][1].range<tiers[type][2].range);

    blds.length=0;rebuildBGrid(true);stats.t=1;
    const L={type:'techlab',team:0,fac:'nova',x:MAP*.5,y:MAP*.5,hp:BT.techlab.hp,hpm:BT.techlab.hp,r:BT.techlab.r,
      alive:true,prog:1,shield:0,shieldMax:900,shieldT:0,dmgT:0,guardReady:true,guardT:0,guardCharge:0,
      queue:[],lvl:1,upT:0,res:-1,resT:0,rot:0,conduit:[]};
    blds.push(L);damageBld(0,999999,1);
    const protectedOnce=L.alive&&L.guardT>0&&L.hp>=L.hpm*TECH_GUARD.floor-.1;
    L.guardT=0;L.guardReady=false;damageBld(0,999999,1);
    const sustainedKills=!L.alive;
    researchCarry={};bankResearchProgress('bal1',17);bankResearchProgress('bal1',12);
    const recovery=researchResumeTime('bal1');

    stats.t=25;setWaveWarning(MAP*.82,MAP*.12,MAP*.52,MAP*.52,14,4,18);
    const warning={shown:waveAlert.style.display==='block',text:waveAlert.textContent,lane:waveThreat.lane,
      sourceKeys:['fromX','fromY','sourceX','sourceY'].filter(k=>k in waveThreat)};
    return {structures:Object.keys(BT).length,weapons,fullPaths,monotonic,protectedOnce,sustainedKills,recovery,warning};
  });

  assert(result.structures===27,'structure roster drifted: '+result.structures);
  assert(result.fullPaths,'one or more combat towers do not reach Mk3: '+JSON.stringify(result.weapons));
  assert(result.monotonic,'a Mk1→Mk3 damage/range path is not meaningful');
  assert(result.protectedOnce&&result.sustainedKills,'Research Complex containment did not create a bounded response window');
  assert(result.recovery===17,'research network did not retain the highest paid progress');
  assert(result.warning.shown&&/WAVE 4/.test(result.warning.text)&&/LANE/.test(result.warning.text),
    'pre-wave lane chip did not render: '+JSON.stringify(result.warning));
  assert(result.warning.sourceKeys.length===0,'wave threat retained exact hidden source coordinates');

  await page.evaluate(()=>{
    resetWorld();stopAttract();demoMode=false;matchLive=true;running=true;paused=true;fogOn=false;
    carrier.active=false;carrier.phase=2;document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');showHudDock(false);
    const P=findLand(MAP*.5,MAP*.5),cx=P[0],cy=P[1];
    const hq=addBld('hq',0,cx-170,cy+120,true);
    const lab=addBld('techlab',0,cx,cy+55,true);lab.hp=lab.hpm*.31;lab.shield=0;lab.guardReady=false;lab.guardT=5.5;
    const t1=addBld('turret',0,cx-155,cy-75,true);t1.tang=.2;
    const t2=addBld('turret',0,cx,cy-125,true);t2.lvl=2;t2.hpm*=1.15;t2.hp=t2.hpm;t2.tang=.55;
    const aa=addBld('aatower',0,cx+160,cy-55,true);aa.lvl=3;aa.hpm*=1.15*1.5;aa.hp=aa.hpm;
    const rail=addBld('rail',0,cx+135,cy+125,true);rail.lvl=3;rail.hpm*=1.15*1.5;rail.hp=rail.hpm;rail.tang=.75;
    addBld('wall',0,cx-80,cy+175,true);addBld('wall',0,cx-25,cy+175,true);addBld('wall',0,cx+30,cy+175,true);
    setWaveWarning(cx+900,cy-730,lab.x,lab.y,14,4,18);
    openBld=blds.indexOf(t2);renderBldPanel();bldMenu2.style.display='block';
    bldMenu2.style.bottom='calc(var(--sab) + 12px)';
    const keel=document.getElementById('keelWrap');if(keel) keel.style.display='none';
    const toastEl=document.getElementById('toast');if(toastEl) toastEl.style.opacity=0;
    const attackEl=document.getElementById('atkAlert');if(attackEl) attackEl.style.display='none';alertPos=null;
    updateWaveWarning();
    cam.x=cx;cam.y=cy+10;camFollow=-1;camYaw=yawTarget=.35;camPitch=pitchTarget=1.12;
    orthoSpan=distTarget=690;clampCam();camUpdateMatrices();renderMinimap();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshot:shot},null,2));
}finally{await browser.close();}
