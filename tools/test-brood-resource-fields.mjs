/* Focused <=2-minute regression for Brood critical mass and finite crystal economy. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const supplied=process.argv.find(a=>/^https?:\/\//.test(a));
const url=supplied||'http://127.0.0.1:8143/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','brood-resource-pass');
const shot=join(out,'phase-field-and-prospector-mobile.png');
const assert=(v,m)=>{if(!v)throw new Error(m);};
let server=null;await mkdir(out,{recursive:true});
if(!supplied){
  server=spawn('python',['-m','http.server','8143','--directory',root],{stdio:'ignore',windowsHide:true});
  for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
}
const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof broodCriticalMassTick==='function'&&typeof depositTier==='function'&&
    typeof deployExtractorMiner==='function'&&typeof stopAttract==='function',null,{timeout:60000});
  const result=await page.evaluate(()=>{
    stopAttract();running=false;paused=true;demoMode=true;fogOn=false;matchLive=false;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#mfPreAlphaIntro,#tutorialCoach,#tutorialBrief').forEach(e=>e.style.display='none');
    document.body.classList.remove('menuMode');
    for(let i=0;i<unitHigh;i++)ualive[i]=0;unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
    blds.length=0;rebuildBGrid(true);beams.length=0;resM[0]=0;resE[0]=3000;heroLvl=1;researched={};
    setupDeposits();setupDoodads();
    const tiers=[...new Set(deposits.map(depositTier))].sort();
    const counts=tiers.map(t=>({tier:t,n:crystals.filter(c=>deposits[c.dep].initialTier===t).length}));
    const D=deposits.find(d=>d.initialTier===3)||deposits[0],di=deposits.indexOf(D);
    D.taken=true;const mex=addBld('mex',0,D.x,D.y,true),miner=[...Array(unitHigh).keys()].find(i=>ualive[i]&&utype[i]===UT_MINER);
    const freeMiner={idx:miner,dep:miner>=0?uMineNode[miner]:-1,cap:supportUnitCap(0),count:supportUnitCount(0,false)};
    if(miner>=0){ux[miner]=D.x+52;uy[miner]=D.y;utx[miner]=ux[miner];uty[miner]=uy[miner];uMineNode[miner]=di;minerUnitTick(miner,.7);}
    const mine={beams:beams.length,mass:resM[0],remaining:D.remaining,mode:miner>=0?MODES[umode[miner]].nm:''};
    const beforeTier=D.tier;drainDeposit(D,DEPOSIT_BAND+20);const tierAfter=depositTier(D);

    // Isolated biological mass: 28 bodies should grow one visible leader.
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===2)killUnit(i,true);
    const bx=D.x+310,by=D.y;
    for(let n=0;n<BROOD_MASS;n++){const a=n/BROOD_MASS*TAU,r=25+(n%5)*13;spawnUnit(12,2,bx+Math.cos(a)*r,by+Math.sin(a)*r);}
    rebuildGrid();broodMassT=0;broodCriticalMassTick(2);
    const caster=[...Array(unitHigh).keys()].find(i=>ualive[i]&&utype[i]===UT_BROOD_CASTER);
    if(caster>=0){ubroodLed[caster]=3;broodMassT=0;broodCriticalMassTick(2);}
    const led=[...Array(unitHigh).keys()].filter(i=>ualive[i]&&uteam[i]===2&&ubroodLed[i]>0).length;
    const brood={caster,led,ravHp:TYPES[12].hp,vsLight:WKM.m[0],vsStructure:TYPES[12].bldMul,utility:caster>=0?TYPES[utype[caster]].caster:0};

    // Stable screenshot composition.
    D.remaining=D.capacity;depositTier(D);cam.x=D.x+120;cam.y=D.y;camFollow=-1;camYaw=yawTarget=.6;camPitch=pitchTarget=1.19;orthoSpan=distTarget=570;
    running=true;paused=true;document.getElementById('startScreen').style.display='none';showHudDock(true,'orders');clampCam();camUpdateMatrices();
    return {tiers,counts,crystals:crystals.length,freeMiner,mine,beforeTier,tierAfter,brood,modeNames:unitModes(UT_MINER).map(m=>unitModeDef(UT_MINER,m).nm)};
  });
  assert(result.tiers.join(',')==='1,2,3','all three resource tiers were not generated: '+JSON.stringify(result.tiers));
  assert(result.counts.every(x=>x.n>=7),'tiered crystallization models are missing: '+JSON.stringify(result.counts));
  assert(result.freeMiner.idx>=0&&result.freeMiner.dep>=0,'Extractor did not deploy its free Prospector: '+JSON.stringify(result.freeMiner));
  assert(result.freeMiner.cap===3&&result.mine.beams>0&&result.mine.mass>0,'mining laser/cap contract failed: '+JSON.stringify({freeMiner:result.freeMiner,mine:result.mine}));
  assert(result.modeNames.join(',')==='MINE,ASSIST,SURVEY','Prospector order list missing: '+JSON.stringify(result.modeNames));
  assert(result.tierAfter===result.beforeTier-1,'finite field did not deplete a tier: '+JSON.stringify(result));
  assert(result.brood.caster>=0&&result.brood.led>=20&&result.brood.ravHp<150&&result.brood.vsLight>=1.5&&result.brood.vsStructure>=1.5,
    'Brood critical-mass contract failed: '+JSON.stringify(result.brood));
  await page.waitForTimeout(1100);await page.screenshot({path:shot});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshot:shot},null,2));
}finally{await browser.close();if(server)server.kill();}
