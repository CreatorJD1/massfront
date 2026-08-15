/* Focused Atlas Skycrane boarding, cargo, drop and mobile UI regression.
   Usage: node tools/test-airlift-transport.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8901/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','airlift-transport');
const productionShot=join(out,'airfield-airlift-production-mobile.png');
const dropShot=join(out,'skycrane-drop-zone-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof MF_UT_AIRLIFT==='number'&&typeof mfAirliftIssueBoard==='function'&&
    typeof mfAirliftCommandUnload==='function'&&typeof stopAttract==='function',null,{timeout:60000});

  const result=await page.evaluate(()=>{
    stopAttract();resetWorld();running=true;paused=true;demoMode=true;fogOn=false;matchLive=false;
    const cx=MAP*.5,cy=MAP*.5,sky=spawnUnit(MF_UT_AIRLIFT,0,cx,cy);
    const inf=spawnUnit(0,0,cx-150,cy),builder=spawnUnit(19,0,cx-145,cy+12),light=spawnUnit(1,0,cx-140,cy-12);
    const heavy=spawnUnit(2,0,cx-130,cy+25),art=spawnUnit(3,0,cx-130,cy-25),air=spawnUnit(5,0,cx-120,cy+40);
    uhp[inf]=uhpm[inf]*.43;uvet[inf]=2;ukills[inf]=7;
    for(const i of [inf,builder,light,heavy,art,air])usel[i]=1;
    const issued=mfAirliftIssueBoard(sky),orders=mfAirliftBoardOrders.length;
    mfAirliftPreTick(.033);
    const pathing=[inf,builder,light].every(i=>ualive[i]&&ustate[i]===1&&Math.hypot(utx[i]-ux[sky],uty[i]-uy[sky])<50);
    for(const i of [inf,builder,light]){ux[i]=ux[sky]+2;uy[i]=uy[sky]+2;}
    mfAirliftPostTick(.033);
    const H=mfAirliftHold(sky,false),usedBefore=H.used,
      cargo=H.cargo.map(P=>({type:P.type,slots:P.slots,hp:P.hpRatio,vet:P.veteran,kills:P.kills}));
    const exclusions=[heavy,art,air].every(i=>ualive[i]);
    const dropX=cx+170,dropY=cy+90,commanded=mfAirliftCommandUnload(sky,dropX,dropY);
    ux[sky]=dropX;uy[sky]=dropY;mfAirliftPostTick(.20);
    const unloaded=[];
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0&&i!==sky&&[0,19,1].includes(utype[i]))
      unloaded.push({i,type:utype[i],x:ux[i],y:uy[i],hp:uhp[i]/uhpm[i],vet:uvet[i],kills:ukills[i]});
    const unique=new Set(unloaded.map(U=>Math.round(U.x)+'/'+Math.round(U.y))).size;

    resetWorld();const doomed=spawnUnit(MF_UT_AIRLIFT,0,cx,cy),passenger=spawnUnit(0,0,cx+2,cy+2);
    usel[passenger]=1;mfAirliftIssueBoard(doomed);ux[passenger]=ux[doomed];uy[passenger]=uy[doomed];mfAirliftPostTick(.033);
    const aboardBeforeDeath=mfAirliftHold(doomed,false).cargo.length;
    killUnit(doomed,false);
    const destruction={aboardBeforeDeath,lastLoss:mfAirliftLastLoss,hold:mfAirliftHolds[doomed]||null,
      passengerTypes:Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&utype[i]===0).length};

    resetWorld();const airfield=addBld('airfield',0,cx,cy,true);openBld=blds.indexOf(airfield);prodTab='transport';
    renderProdMenu();$('prodMenu').style.display='block';
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#buildMenu,#bldMenu2').forEach(e=>e.style.display='none');
    $('unitCard').style.display='none';
    document.body.classList.remove('menuMode');
    const tab=[...document.querySelectorAll('#prodTabs .tabBtn')].find(e=>/AIRLIFT/.test(e.textContent));
    const card=document.querySelector('.mfAirliftCard'),tr=tab&&tab.getBoundingClientRect(),cr=card&&card.getBoundingClientRect();
    const ui={tab:tab&&tab.textContent,card:card&&card.innerText,tabW:tr&&tr.width,tabH:tr&&tr.height,cardW:cr&&cr.width,cardH:cr&&cr.height,
      preview:!!document.querySelector('#prodMenu .menuRoleBrief canvas')};
    return {id:MF_UT_AIRLIFT,name:TYPES[MF_UT_AIRLIFT].name,issued,orders,pathing,cargo,used:usedBefore,capacity:H.capacity,
      exclusions,commanded,afterUnload:H.cargo.length,unloaded,unique,destruction,ui};
  });

  assert(result.name==='Atlas Skycrane'&&result.id>=33,'transport identity missing: '+JSON.stringify(result));
  assert(result.issued&&result.orders===3&&result.pathing,'board order/pathing failed: '+JSON.stringify(result));
  assert(result.cargo.length===3&&result.used===4&&result.capacity===12,'cargo manifest/capacity failed: '+JSON.stringify(result.cargo));
  assert(result.cargo.map(P=>P.type).sort((a,b)=>a-b).join(',')==='0,1,19'&&result.exclusions,'eligibility contract failed');
  const saved=result.cargo.find(P=>P.type===0);
  assert(saved&&Math.abs(saved.hp-.43)<.02&&saved.vet===2&&saved.kills===7,'passenger state not serialized: '+JSON.stringify(saved));
  assert(result.commanded&&result.afterUnload===0&&result.unloaded.length===3&&result.unique===3,'formation unload failed: '+JSON.stringify(result.unloaded));
  const restored=result.unloaded.find(P=>P.type===0);
  assert(restored&&Math.abs(restored.hp-.43)<.02&&restored.vet===2&&restored.kills===7,'passenger state not restored: '+JSON.stringify(restored));
  assert(result.destruction.aboardBeforeDeath===1&&result.destruction.lastLoss===1&&!result.destruction.hold&&result.destruction.passengerTypes===0,
    'carrier destruction did not deterministically destroy cargo: '+JSON.stringify(result.destruction));
  assert(/AIRLIFT/.test(result.ui.tab)&&/HEAVY/.test(result.ui.card)&&/12 SLOTS/.test(result.ui.card)&&
    result.ui.tabH>=44&&result.ui.cardH>=44&&result.ui.preview,'airfield transport UI missing/undersized: '+JSON.stringify(result.ui));

  await page.waitForTimeout(800);
  await page.screenshot({path:productionShot,fullPage:false});

  const field=await page.evaluate(()=>{
    $('prodMenu').style.display='none';resetWorld();const cx=MAP*.5,cy=MAP*.5;
    const sky=spawnUnit(MF_UT_AIRLIFT,0,cx,cy),a=spawnUnit(0,0,cx+2,cy),b=spawnUnit(19,0,cx+3,cy+2),c=spawnUnit(1,0,cx+2,cy-2);
    for(const i of [a,b,c])usel[i]=1;mfAirliftIssueBoard(sky);for(const i of [a,b,c]){ux[i]=cx;uy[i]=cy;}mfAirliftPostTick(.03);
    mfAirliftCommandUnload(sky,cx+150,cy+55);mfAirliftPostTick(.2);
    clearSel();usel[sky]=1;updateSelInfo();showHudDock(true,'orders');updateHUD(60);
    cam.x=cx+70;cam.y=cy+25;camFollow=-1;camYaw=yawTarget=.55;camPitch=pitchTarget=1.08;orthoSpan=distTarget=430;clampCam();camUpdateMatrices();
    const unload=$('mfUnloadBtn'),r=unload.getBoundingClientRect();
    return {w:r.width,h:r.height,display:getComputedStyle(unload).display,disabled:unload.disabled,label:unload.getAttribute('aria-label')};
  });
  assert(field.display==='flex'&&field.w>=44&&field.h>=44&&!field.disabled,
    'UNLOAD command target missing or undersized after drop command: '+JSON.stringify(field));
  await page.waitForTimeout(700);
  await page.screenshot({path:dropShot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,field,screenshots:[productionShot,dropShot]},null,2));
}finally{await browser.close();}
