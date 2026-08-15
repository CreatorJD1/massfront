/* Focused Brood Massflesh boarding, timed flight, counter-state and mobile UI
   regression. Usage: node tools/test-massflesh-transport.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8901/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','massflesh-transport');
const productionShot=join(out,'brood-massflesh-production-mobile.png');
const inboundShot=join(out,'massflesh-inbound-breakthrough-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof MF_UT_MASSFLESH==='number'&&typeof mfMassQueueBoard==='function'&&
    typeof mfMassBeginFlight==='function'&&typeof stopAttract==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();resetWorld();AI.fac='horde';running=true;paused=true;demoMode=true;fogOn=false;matchLive=false;
    const cx=MAP*.5,cy=MAP*.5,mass=spawnUnit(MF_UT_MASSFLESH,1,cx,cy);
    const light=spawnUnit(0,1,cx-120,cy),medium=spawnUnit(1,1,cx-115,cy+12),ravager=spawnUnit(12,1,cx-110,cy-12);
    const heavy=spawnUnit(2,1,cx-105,cy+28),art=spawnUnit(3,1,cx-105,cy-28),air=spawnUnit(5,1,cx-100,cy+45);
    uhp[light]=uhpm[light]*.37;uvet[light]=2;ukills[light]=9;
    const issued=mfMassQueueBoard(mass,[light,medium,ravager,heavy,art,air],false),orders=mfMassBoardOrders.length;
    mfMassPreTick(.033);
    const pathing=[light,medium,ravager].every(i=>ualive[i]&&ustate[i]===1&&Math.hypot(utx[i]-ux[mass],uty[i]-uy[mass])<60);
    for(const i of [light,medium,ravager]){ux[i]=ux[mass]+2;uy[i]=uy[mass]+2;}
    mfMassPostTick(.033);
    const H=mfMassHold(mass,false),cargo=H.cargo.map(P=>({type:P.type,slots:P.slots,hp:P.hpRatio,vet:P.veteran,kills:P.kills})),
      usedBefore=H.used,capacity=H.capacity;
    const exclusions=[heavy,art,air].every(i=>ualive[i]);
    const ascended=mfMassBeginFlight(mass),airState={type:utype[mass],air:TYPES[utype[mass]].air,flight:H.flight};
    const target={x:cx+170,y:cy+80},commanded=mfMassCommandBirth(mass,target.x,target.y);
    ux[mass]=target.x;uy[mass]=target.y;mfMassPostTick(.05);
    const born=[];
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===1&&i!==mass&&[0,1,12].includes(utype[i]))
      born.push({i,type:utype[i],x:ux[i],y:uy[i],hp:uhp[i]/uhpm[i],vet:uvet[i],kills:ukills[i]});
    const restored=born.find(P=>P.type===0),unique=new Set(born.map(U=>Math.round(U.x)+'/'+Math.round(U.y))).size;

    /* The membrane must rupture on time even while an unreachable birth order
       remains active; otherwise the unit becomes permanent air power. */
    resetWorld();AI.fac='horde';const timed=spawnUnit(MF_UT_MASSFLESH,1,cx,cy),p=spawnUnit(12,1,cx+1,cy+1);
    mfMassQueueBoard(timed,[p],false);mfMassPostTick(.02);const TH=mfMassHold(timed,false);mfMassBeginFlight(timed);
    mfMassCommandBirth(timed,cx+900,cy+900);TH.flight=.01;mfMassPostTick(.03);
    const timedBirth={type:utype[timed],air:TYPES[utype[timed]].air,cargo:TH.cargo.length,flight:TH.flight};

    function attackCase(kind){
      resetWorld();AI.fac='horde';const a=spawnUnit(MF_UT_MASSFLESH_AIR,1,cx,cy),AH=mfMassHold(a,true);let before,after,res;
      if(kind==='building'){
        const B=addBld('turret',0,cx+50,cy,true);before=B.hp;rebuildBGrid();AH.attack=0;res=mfMassTentacleAttack(a,AH);after=B.hp;
      }else{
        const t=spawnUnit(kind==='light'?0:2,0,cx+50,cy);before=uhp[t];rebuildGrid();AH.attack=0;res=mfMassTentacleAttack(a,AH);after=uhp[t];
      }
      return {kind:res&&res.kind,dmg:before-after,reported:res&&res.dmg};
    }
    const attacks={light:attackCase('light'),heavy:attackCase('heavy'),building:attackCase('building')};

    resetWorld();AI.fac='horde';showUnitTypeCard(MF_UT_MASSFLESH,true);
    const groundPreview={chips:$('unitCard').querySelector('.ucChips').innerText,ammo:($('unitCard').querySelector('.ucAmmo')||{}).textContent||''};
    showUnitTypeCard(MF_UT_MASSFLESH_AIR,true);
    const flightPreview={chips:$('unitCard').querySelector('.ucChips').innerText,ammo:($('unitCard').querySelector('.ucAmmo')||{}).textContent||''};
    $('unitCard').style.display='none';

    const nova=addBld('fac',0,cx,cy,true);openBld=blds.indexOf(nova);prodTab='biomass';renderProdMenu();
    const novaExposed=!!document.querySelector('.mfMassCard')||[...document.querySelectorAll('#prodTabs .tabBtn')].some(e=>/MASSFLESH/.test(e.textContent));
    resetWorld();AI.fac='horde';const brood=addBld('fac',2,cx,cy,true);openBld=blds.indexOf(brood);prodTab='biomass';renderProdMenu();
    $('prodMenu').style.display='block';document.body.classList.remove('menuMode');
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#buildMenu,#bldMenu2,#atkAlert').forEach(e=>e.style.display='none');
    const tab=[...document.querySelectorAll('#prodTabs .tabBtn')].find(e=>/MASSFLESH/.test(e.textContent));
    const card=document.querySelector('.mfMassCard'),tr=tab&&tab.getBoundingClientRect(),cr=card&&card.getBoundingClientRect();
    const production={novaExposed,tab:tab&&tab.textContent,card:card&&card.innerText,tabW:tr&&tr.width,tabH:tr&&tr.height,
      cardW:cr&&cr.width,cardH:cr&&cr.height,preview:!!document.querySelector('#prodMenu .menuRoleBrief canvas')};
    return {ids:[MF_UT_MASSFLESH,MF_UT_MASSFLESH_AIR],names:[TYPES[MF_UT_MASSFLESH].name,TYPES[MF_UT_MASSFLESH_AIR].name],
      issued,orders,pathing,cargo,used:usedBefore,capacity,exclusions,ascended,airState,commanded,born,restored,unique,
      timedBirth,attacks,groundPreview,flightPreview,production};
  });

  assert(result.names.join('/')==='Massflesh Carrier/Massflesh Ascendant','Massflesh identities missing: '+JSON.stringify(result.names));
  assert(result.issued===3&&result.orders===3&&result.pathing,'biomass merge order/pathing failed: '+JSON.stringify(result));
  assert(result.cargo.length===3&&result.used===3&&result.capacity===18&&result.exclusions,'biomass eligibility/capacity failed: '+JSON.stringify(result.cargo));
  assert(result.cargo.map(P=>P.type).sort((a,b)=>a-b).join(',')==='0,1,12','wrong organisms merged: '+JSON.stringify(result.cargo));
  assert(result.ascended&&result.airState.air===1&&result.airState.flight===26,'temporary airborne state failed: '+JSON.stringify(result.airState));
  assert(result.commanded&&result.born.length===3&&result.unique===3,'birth formation failed: '+JSON.stringify(result.born));
  assert(result.restored&&Math.abs(result.restored.hp-.37)<.02&&result.restored.vet===2&&result.restored.kills===9,
    'biomass passenger state not restored: '+JSON.stringify(result.restored));
  assert(result.timedBirth.air===0&&result.timedBirth.cargo===0&&result.timedBirth.flight===0,
    'timed flight did not force birth: '+JSON.stringify(result.timedBirth));
  assert(result.attacks.light.kind==='unit'&&result.attacks.heavy.kind==='unit'&&result.attacks.building.kind==='building'&&
    result.attacks.light.dmg>result.attacks.heavy.dmg&&result.attacks.building.dmg>result.attacks.light.dmg,
    'tentacle target multipliers failed: '+JSON.stringify(result.attacks));
  assert(/GROUND HEAVY/.test(result.groundPreview.chips)&&/ANTI-TANK/.test(result.groundPreview.chips),
    'land counter preview missing: '+JSON.stringify(result.groundPreview));
  assert(/AIRBORNE/.test(result.flightPreview.chips)&&/ANTI-AIR/.test(result.flightPreview.chips)&&/STRUCTURES/.test(result.flightPreview.ammo),
    'air counter preview missing: '+JSON.stringify(result.flightPreview));
  assert(!result.production.novaExposed&&/MASSFLESH/.test(result.production.tab)&&/GROUND HEAVY/.test(result.production.card)&&
    result.production.tabH>=44&&result.production.cardW>=140&&result.production.cardH>=44&&result.production.preview,
    'Brood-only production gate/UI failed: '+JSON.stringify(result.production));

  await page.waitForTimeout(650);await page.screenshot({path:productionShot,fullPage:false});

  const field=await page.evaluate(()=>{
    $('prodMenu').style.display='none';$('unitCard').style.display='none';resetWorld();AI.fac='horde';const cx=MAP*.48,cy=MAP*.5;
    addBld('hq',0,cx-105,cy,true);addBld('wall',0,cx-10,cy-72,true);addBld('wall',0,cx-10,cy-25,true);
    addBld('wall',0,cx-10,cy+25,true);addBld('wall',0,cx-10,cy+72,true);addBld('turret',0,cx-40,cy-100,true);addBld('turret',0,cx-40,cy+100,true);
    const mass=spawnUnit(MF_UT_MASSFLESH,1,cx+95,cy),a=spawnUnit(12,1,cx+97,cy+2),b=spawnUnit(0,1,cx+98,cy-3),c=spawnUnit(1,1,cx+96,cy+4);
    mfMassQueueBoard(mass,[a,b,c],false);mfMassPostTick(.03);mfMassBeginFlight(mass);mfMassCommandBirth(mass,cx-190,cy);
    ux[mass]=cx+70;uy[mass]=cy;mfMassRefreshAlert();clearSel();showHudDock(true,'orders');updateHUD(60);
    document.body.classList.remove('menuMode');document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#buildMenu,#bldMenu2').forEach(e=>e.style.display='none');
    cam.x=cx+18;cam.y=cy;camFollow=-1;camYaw=yawTarget=.25;camPitch=pitchTarget=.78;orthoSpan=distTarget=470;clampCam();camUpdateMatrices();
    const alert=$('mfMassAlert'),r=alert.getBoundingClientRect();return {alert:alert.innerText,display:getComputedStyle(alert).display,w:r.width,h:r.height,air:TYPES[utype[mass]].air};
  });
  assert(field.air===1&&field.display==='block'&&field.w>=44&&field.h>=44&&/MASSFLESH/.test(field.alert)&&/TRACK/.test(field.alert),
    'persistent inbound alert missing: '+JSON.stringify(field));
  await page.waitForTimeout(700);await page.screenshot({path:inboundShot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,field,screenshots:[productionShot,inboundShot]},null,2));
}finally{await browser.close();}
