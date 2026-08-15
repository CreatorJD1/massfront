/* Four-faction live WebGL comparison for the core medium battle unit.
   Usage: node tools/capture-faction-rhinos-live3d.mjs [base URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const tmp=join(root,'.tmp','faction-rhinos');
const out=join(root,'releases','faction-rhinos-live3d.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?factionRhinoCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof FAC_MESH!=='undefined'&&FAC_MESH.nova&&FAC_MESH.legion&&
    FAC_MESH.syndicate&&FAC_MESH.horde&&typeof stopAttract==='function'&&typeof render==='function',{timeout:30000});
  await page.waitForTimeout(750);
  await page.evaluate(()=>{
    stopAttract();resetWorld();attractOn=false;demoMode=true;matchLive=true;fogOn=false;
    running=true;paused=true;gameEnded=false;carrier.active=false;carrier.phase=2;camTick=()=>camUpdateMatrices();
    document.body.className='';for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';resize();
    window.__rhinoSubject=fac=>{
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5,team=fac==='nova'?0:1;
      if(team===1){const F=FACTIONS[fac];AI.fac=fac;TEAMC[1][0]=F.col[0];TEAMC[1][1]=F.col[1];TEAMC[1][2]=F.col[2];
        TEAMB[1][0]=F.colB[0];TEAMB[1][1]=F.colB[1];TEAMB[1][2]=F.colB[2];}
      const i=spawnUnit(1,team,cx,cy);ux[i]=utx[i]=cx;uy[i]=uty[i]=cy;
      uang[i]=Math.PI*.73;uturr[i]=Math.PI*.66;ustate[i]=0;umov[i]=fac==='horde'?1:0;uwalk[i]=1.45;
      rebuildGrid();cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.64;camPitch=pitchTarget=1.06;
      orthoSpan=distTarget=fac==='legion'?165:150;camUpdateMatrices();
    };
  });
  const subjects=[
    ['nova','Nova Federation Rhino','Electromagnetic runner pods','Capacitor-fed precision accelerator'],
    ['legion','Red Ascendancy Rhino','Broad full-track assault block','Long recoil cannon · exposed heat banks'],
    ['syndicate','Syndicate Coalition Rhino','Three-bank hover plenum','Forked twin-coil energy weapon'],
    ['horde','Umbral Brood Spitter','Six-limbed grown locomotion','Telescoping acid throat · no manufactured parts'],
  ],cards=[];
  for(let n=0;n<subjects.length;n++){
    const [fac,name,movement,weapon]=subjects[n],file=`${n}-${fac}-rhino.png`;
    await page.evaluate(f=>window.__rhinoSubject(f),fac);await page.waitForTimeout(230);
    await page.screenshot({path:join(tmp,file),clip:{x:125,y:95,width:750,height:720}});
    cards.push({fac,name,movement,weapon,file});
  }
  const sheet=await context.newPage();await sheet.setViewportSize({width:1920,height:760});
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html=cards.map(c=>`<article class="${c.fac}"><div class="tag">CORE VEHICLE · TYPE 01</div><div class="frame"><img src="${base}/.tmp/faction-rhinos/${c.file}"></div><h2>${esc(c.name)}</h2><p><b>MOVEMENT</b>${esc(c.movement)}</p><p><b>WEAPON</b>${esc(c.weapon)}</p></article>`).join('');
  await sheet.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}body{width:1920px;padding:30px 40px 42px;background:radial-gradient(circle at 50% 0,#18354e,#06101a 40%,#02050a)}header{padding:20px 27px;border:1px solid #35617d;background:#0a1724;margin-bottom:16px}h1{margin:0;color:#f4d27c;font-size:36px;letter-spacing:.12em}header>p{margin:8px 0 0;color:#8fc8eb;font-size:15px;letter-spacing:.05em}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{position:relative;border:1px solid #36536a;background:#081522;overflow:hidden}.nova{border-color:#397fa9}.legion{border-color:#a14d40}.syndicate{border-color:#588e4d}.horde{border-color:#7d4ba4}.tag{position:absolute;z-index:2;top:9px;left:9px;padding:6px 8px;background:#02080ddd;border:1px solid #58758a;color:#cbeeff;font-size:10px;letter-spacing:.13em}.frame{height:420px;background:#050d15;border-bottom:1px solid #29475b}.frame img{width:100%;height:100%;object-fit:cover}h2{font-size:20px;margin:13px 14px 8px}.nova h2{color:#78d5ff}.legion h2{color:#ff8e7c}.syndicate h2{color:#9cec72}.horde h2{color:#ca96ff}article p{margin:0 14px 8px;color:#9bbbd0;font-size:11px;letter-spacing:.045em;text-transform:uppercase}article p b{display:inline-block;width:82px;color:#e7f5ff}
  </style><body><header><h1>CORE VEHICLE FACTION IDENTITIES</h1><p>Intermediate mobile-PBR pass · live WebGL battlefield renderer · shared Rhino stats, four authored silhouettes</p></header><main>${html}</main></body>`,{waitUntil:'load'});
  await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await sheet.screenshot({path:out,fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('Faction Rhino contact sheet -> '+out);
}finally{await browser.close();}
