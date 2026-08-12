/* First Contact / domain-warfare mobile regression.
   Usage: node tools/test-first-contact-domains.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8948/';
const out=join(root,'releases','first-contact-domains');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof stopAttract==='function'&&typeof resetWorld==='function'&&typeof buildTerrain==='function'&&
    typeof commanderWeaponDef==='function'&&typeof battlefieldNavalEnabled==='function'&&typeof mfNoticeHistoryOpen==='function'&&typeof PASS!=='undefined',null,{timeout:60000});
  const result=await page.evaluate(()=>{
    if(typeof apGateSatisfied==='function')apGateSatisfied();
    const ap=document.getElementById('apOverlay');if(ap)ap.style.display='none';
    stopAttract();hideFrontScreens();
    for(const id of ['pauseOverlay','gameOver','levelUp','loadScr','dispatch']){const el=document.getElementById(id);if(el)el.style.display='none';}
    document.body.dataset.frontScreen='';document.body.classList.remove('menuMode','mfMenuOpen');
    demoMode=false;running=true;matchLive=true;paused=true;fogOn=false;carrier.active=false;carrier.phase=2;
    curMap='aelos_coast_medium';curTheme='verdant';buildTerrain(curTheme);
    /* buildTerrain authors a fresh district plan. The old harness left the
       attract-mode relic array in place, so screenshots showed empty paving
       stamps or buildings belonging to the previous map. Rebuild the matching
       live city exactly as a real match does. */
    setupRelics();
    let wetCityCorners=0;
    for(const P of cityPlan){
      const ca=Math.cos(P.a),sa=Math.sin(P.a),hw=P.w*.70+12,hh=P.h*.70+12;
      for(const q of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]]){
        const x=P.x+q[0]*ca-q[1]*sa,y=P.y+q[0]*sa+q[1]*ca;
        if(hAt(x,y)<WATER_H+.004)wetCityCorners++;
      }
    }
    let wi=-1,wd=Infinity;
    if(NAVCOMP)for(let i=0;i<NAVCOMP.length;i++)if(NAVCOMP[i]===NAV_MAIN){const x=(i%PGS+.5)/PGS*MAP,y=((i/PGS|0)+.5)/PGS*MAP,d=dist2(x,y,MAP*.5,MAP*.5);if(d<wd){wd=d;wi=i;}}
    const seedWater=wi>=0?[((wi%PGS)+.5)/PGS*MAP,(((wi/PGS)|0)+.5)/PGS*MAP]:[MAP*.5,MAP*.5];
    const water=findWater(seedWater[0],seedWater[1]),naval=battlefieldNavalEnabled(),mode=battlefieldWaterMode();
    if(!water)return {naval,mode,water:null,minH:heightF.reduce((a,b)=>Math.min(a,b),9),maxNav:Math.max(0,...NAV_SIZE)};
    const before=hAt(water[0],water[1]);
    const H=addBld('harbor',0,water[0],water[1],true),after=hAt(water[0],water[1]);
    const corv=spawnUnit(14,0,water[0]+20,water[1]+20),dread=spawnUnit(15,1,water[0]+180,water[1]+20);
    const f=requestField(ux[dread],uy[dread],true),dirs=fields[f].dirs;
    const commanderPairs={};
    for(const fk of ['nova','legion','syndicate'])commanderPairs[fk]=COMMANDER_ROSTERS[fk].map(C=>[C.primary&&C.primary.nm,C.secondary&&C.secondary.nm]);
    playerFaction='nova';playerCommanderId='nova_kai';applyCommanderChoice();
    const land=findLand(water[0]-180,water[1]),hq=addBld('hq',0,...land,true);
    const hero=spawnUnit(0,0,land[0]+34,land[1]),foe=spawnUnit(1,1,land[0]+116,land[1]);heroIdx=hero;rebuildGrid();
    const fired=fireCommanderWeapon(0,ux[foe],uy[foe]);let weaponTarget=-99;
    for(let p=0;p<pHigh;p++)if(palive[p]&&pteam[p]===0&&ptgt[p]===foe)weaponTarget=ptgt[p];
    cam.x=water[0];cam.y=water[1];camFollow=-1;camYaw=yawTarget=.35;camPitch=pitchTarget=1.06;orthoSpan=distTarget=720;
    clampCam();camUpdateMatrices();showHudDock(true,'view');setHudDeck('view');
    toast('FIRST CONTACT 2:00 — PREPARE COASTAL DEFENCES');
    radioNotice('NAVAL DOMAIN','Harbor online. Corvette and Dreadnought entering connected water.');
    return {naval,mode,water,before,after,harborY:BT[H.type].placement,corv,dread,
      fieldNaval:fields[f].naval,fieldReach:dirs[ffCell(ux[corv],uy[corv])]<8,
      grace:[0,1,2].map(deploymentGraceSeconds),packages:Object.keys(DEPLOYMENT_PACKAGES),commanderPairs,
      buttons:[!!document.getElementById('abPrimary'),!!document.getElementById('abSecondary')],
      history:mfNHistory.length,fired,weaponTarget,hero,foe,hqType:hq.type,
      cityPlots:cityPlan.length,cityRelics:relics.length,wetCityCorners};
  });
  assert(result.naval&&result.mode==='ocean'&&result.water,'authored ocean domain was not navigable: '+JSON.stringify(result));
  assert(Math.abs(result.before-result.after)<1e-7,'water building altered the seabed heightfield');
  assert(result.harborY==='water'&&result.corv>=0&&result.dread>=0,'naval structures/units failed');
  assert(result.fieldNaval&&result.fieldReach,'naval flow field did not connect the fleet');
  assert(result.grace.join(',')==='180,120,75','opening grace contract changed: '+result.grace);
  assert(result.packages.includes('prepared')&&result.packages.includes('expedition'),'deployment packages missing');
  assert(Object.values(result.commanderPairs).every(R=>R.length===3&&R.every(P=>P[0]&&P[1])),'commander weapon pair missing');
  assert(result.buttons.every(Boolean)&&result.history>=2,'mobile weapon controls or notice history missing');
  assert(result.fired&&result.weaponTarget===result.foe&&result.weaponTarget!==result.hero,'manual primary did not track the hostile');
  assert(result.cityPlots===result.cityRelics&&result.wetCityCorners===0,
    'district terrain/mesh mismatch or shoreline overlap: '+JSON.stringify(result));
  await page.waitForTimeout(900);await page.screenshot({path:join(out,'naval-domain-mobile.png')});
  await page.evaluate(()=>mfNoticeHistoryOpen());await page.waitForTimeout(250);
  await page.screenshot({path:join(out,'notification-log-mobile.png')});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshots:out},null,2));
}finally{await browser.close();}
