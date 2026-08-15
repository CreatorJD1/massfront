/* Live WebGL contact sheet for the four canonical commanders and their first-
   contact deployment silhouettes. Usage: node tools/capture-faction-commanders-deployers.mjs [base URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const tmp=join(root,'.tmp','faction-command'),out=join(root,'releases','faction-commanders-deployers-live3d.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?factionCommandCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof DROP_MESH!=='undefined'&&Object.keys(DROP_MESH).length===4&&
    typeof UNIT_MESH!=='undefined'&&UNIT_MESH[30],{timeout:30000});
  await page.waitForTimeout(900);
  await page.evaluate(()=>{
    stopAttract();resetWorld();attractOn=false;demoMode=true;matchLive=true;fogOn=false;
    running=true;paused=true;gameEnded=false;camTick=()=>camUpdateMatrices();document.body.className='';
    for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';resize();
    window.__commandSubject=(kind,fac)=>{
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;aiDeployArrivals.length=0;carrier.active=false;carrier.phase=2;
      for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5,player=fac==='nova',F=player?{col:[120,205,255],colB:[82,174,255]}:FACTIONS[fac];
      if(!player){AI.fac=fac;TEAMC[1][0]=F.col[0];TEAMC[1][1]=F.col[1];TEAMC[1][2]=F.col[2];
        TEAMB[1][0]=F.colB[0];TEAMB[1][1]=F.colB[1];TEAMB[1][2]=F.colB[2];}
      if(kind==='deployer'){
        carrier.active=true;carrier.phase=1;carrier.alt=0;carrier.clearance=0;carrier.fac=fac;
        carrier.x=carrier.tx=cx;carrier.y=carrier.ty=cy;carrier.ang=Math.PI*.72;
        orthoSpan=distTarget=255;
      }else{
        const type=fac==='nova'?4:FACTIONS[fac].hero,i=spawnUnit(type,player?0:1,cx,cy);
        ux[i]=utx[i]=cx;uy[i]=uty[i]=cy;uang[i]=Math.PI*.73;uturr[i]=Math.PI*.67;ustate[i]=0;umov[i]=0;
        rebuildGrid();
        /* Hero scale is gameplay-authored (the Praetor really is far larger
           than a hover Archon), so portrait framing needs per-silhouette spans. */
        const portraitSpan={nova:120,legion:360,syndicate:120,horde:255};
        orthoSpan=distTarget=portraitSpan[fac];
      }
      cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.66;camPitch=pitchTarget=1.10;camUpdateMatrices();
    };
  });
  const subjects=[
    ['hero','nova','Captain Elara Kai','Nova advanced-energy commander'],
    ['hero','legion','Lord Darion Vex','Red Ascendancy siege commander'],
    ['hero','syndicate','Broker Lys Renn','Machine hover archon'],
    ['hero','horde','Brood Sovereign','Living swarm progenitor'],
    ['deployer','nova','Nova Orbital Carrier','Clean coils and blue energy'],
    ['deployer','legion','Ascendancy Assault Lander','Armored troop-cassette brick'],
    ['deployer','syndicate','Machine Hover Deployer','Thin autonomous lift-delta'],
    ['deployer','horde','Brood Drop-Organism','Chitin, membranes and tendrils'],
  ],cards=[];
  for(let n=0;n<subjects.length;n++){
    const [kind,fac,name,sub]=subjects[n],file=`${String(n).padStart(2,'0')}-${kind}-${fac}.png`;
    await page.evaluate(([k,f])=>window.__commandSubject(k,f),[kind,fac]);await page.waitForTimeout(220);
    await page.screenshot({path:join(tmp,file),clip:{x:130,y:105,width:740,height:710}});
    cards.push({kind,fac,name,sub,file});
  }
  const sheet=await context.newPage();await sheet.setViewportSize({width:1920,height:1060});
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html=cards.map(c=>`<article class="${c.fac}"><div class="kind">${c.kind}</div><div class="frame"><img src="${base}/.tmp/faction-command/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
  await sheet.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}body{width:1920px;padding:34px 42px 48px;background:radial-gradient(circle at 50% 0,#18344d,#06101a 37%,#02050a)}
    header{padding:22px 28px;border:1px solid #35617d;background:#0a1724;margin-bottom:18px}h1{margin:0;color:#f4d27c;font-size:38px;letter-spacing:.12em}header p{margin:8px 0 0;color:#8fc8eb;font-size:16px;letter-spacing:.05em}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}article{position:relative;border:1px solid #36536a;background:#081522;overflow:hidden}.nova{border-color:#397fa9}.legion{border-color:#8f4d42}.syndicate{border-color:#4f8846}.horde{border-color:#774c9c}
    .kind{position:absolute;z-index:2;top:10px;left:10px;padding:6px 9px;background:#02080dcc;border:1px solid #58758a;color:#cbeeff;font-size:11px;letter-spacing:.14em;text-transform:uppercase}.frame{height:348px;background:#050d15;border-bottom:1px solid #29475b}.frame img{width:100%;height:100%;object-fit:cover}h2{font-size:20px;margin:13px 14px 5px}.nova h2{color:#78d5ff}.legion h2{color:#ff8e7c}.syndicate h2{color:#9cec72}.horde h2{color:#ca96ff}p{margin:0 14px 15px;color:#93b5cb;font-size:12px;letter-spacing:.055em;text-transform:uppercase}
  </style><body><header><h1>CANONICAL COMMANDERS & DEPLOYERS</h1><p>Eight live WebGL captures · authored silhouettes · material-zoned mobile models</p></header><main>${html}</main></body>`,{waitUntil:'load'});
  await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await sheet.screenshot({path:out,fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('Faction command contact sheet -> '+out);
}finally{await browser.close();}
