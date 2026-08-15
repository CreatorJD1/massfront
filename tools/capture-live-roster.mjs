/* Capture the models that the battlefield renderer actually uses.
   This intentionally bypasses hud.js icon fallbacks: every card is a WebGL
   frame containing UNIT_MESH, FAC_MESH, BLD_MESH, FX.drop, or FX.city*.

   Usage:
     node tools/capture-live-roster.mjs [base URL]
*/
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {access, mkdir, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const reuse=process.argv.includes('--reuse');
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8920').replace(/\/$/,'');
const outDir=join(root,'.tmp','roster-live3d');
const releases=join(root,'releases');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
if(!reuse) await rm(outDir,{recursive:true,force:true});
await mkdir(outDir,{recursive:true});
await mkdir(releases,{recursive:true});

const safe=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const browser=await launchPwBrowser({
  headless:true,
  executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});

try{
  const context=await browser.newContext({
    viewport:{width:1000,height:1000},
    deviceScaleFactor:2,
    colorScheme:'dark'
  });
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(base+'/?rosterCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof TYPES!=='undefined'&&typeof UNIT_MESH!=='undefined'&&
    typeof BLD_MESH!=='undefined'&&typeof render==='function',{timeout:30000});
  await page.waitForTimeout(1200);

  const data=await page.evaluate(()=>({
    version:(typeof APP_VERSION!=='undefined'?APP_VERSION:'1.28.0'),
    units:TYPES.map((T,id)=>({id,name:T.name,size:T.size,cat:(UCAT[T.cat]||{}).nm||T.cat||'UNIT',
      hero:T.hero||'',air:!!T.air,naval:!!T.naval})),
    buildings:Object.keys(BT).map(key=>({key,name:BT[key].name,size:BT[key].size,cat:BT[key].bcat||'structure'}))
  }));

  await page.evaluate(()=>{
    stopAttract();
    resetWorld();
    attractOn=false; demoMode=true; matchLive=true; fogOn=false;
    running=true; paused=true; gameEnded=false; shake=0; dayT=0;
    carrier.active=false; carrier.phase=2;
    /* Freeze only the capture browser's camera interpolation. This lets small
       infantry fill a thumbnail without changing the 420-unit gameplay limit. */
    camTick=()=>camUpdateMatrices();
    document.body.className='';
    document.documentElement.style.background='#07111a';
    document.body.style.background='#07111a';
    for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block'; cv.style.filter='none';
    cv.style.position='fixed'; cv.style.inset='0'; cv.style.width='100vw'; cv.style.height='100vh';
    resize();

    const clearScene=()=>{
      ualive.fill(0); usel.fill(0); freeList=[]; unitHigh=0;
      teamCount[0]=teamCount[1]=teamCount[2]=0;
      rebuildGrid();
      blds.length=0; rebuildBGrid(true);
      for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      carrier.active=false; carrier.phase=2; carrier.alt=0; carrier.clearance=0;
      beams.length=0; palive.fill(0); pHigh=0; flife.fill(0); fCount=0; shake=0;
    };
    const factionColour=fac=>{
      const F=FACTIONS[fac]||FACTIONS.legion;
      AI.fac=fac;
      TEAMC[1][0]=F.col[0]; TEAMC[1][1]=F.col[1]; TEAMC[1][2]=F.col[2];
      TEAMB[1][0]=F.colB[0]; TEAMB[1][1]=F.colB[1]; TEAMB[1][2]=F.colB[2];
      if(fac==='horde'){
        TEAMC[2][0]=F.col[0]; TEAMC[2][1]=F.col[1]; TEAMC[2][2]=F.col[2];
      }else{
        TEAMC[2][0]=235; TEAMC[2][1]=235; TEAMC[2][2]=220;
      }
    };
    const setCamera=span=>{
      cam.x=MAP*.5; cam.y=MAP*.5; camFollow=-1;
      camYaw=yawTarget=.66; camPitch=pitchTarget=1.12;
      orthoSpan=distTarget=span;
      camUpdateMatrices();
    };
    window.__setRosterCapture=subject=>{
      clearScene();
      const cx=MAP*.5,cy=MAP*.5;
      if(subject.kind==='unit'||subject.kind==='faction'){
        const ty=+subject.id;
        let team=0,fac='legion';
        if(subject.kind==='faction'){team=1;fac=subject.fac;}
        else if(ty===12||ty===13) team=2;
        else if(ty>=28){team=1;fac=TYPES[ty].hero||'legion';}
        factionColour(fac);
        const i=spawnUnit(ty,team,cx,cy);
        ux[i]=utx[i]=cx; uy[i]=uty[i]=cy;
        uang[i]=Math.PI*.74; uturr[i]=Math.PI*.69;
        ustate[i]=0; umov[i]=0; uwalk[i]=1.1;
        rebuildGrid();
        setCamera(Math.max(145,TYPES[ty].size*4.25));
      }else if(subject.kind==='building'){
        const B=addBld(subject.key,subject.key==='nest'?2:0,cx,cy,true,Math.PI*.08);
        B.tang=Math.PI*.74; B.anim=1.3;
        setCamera(Math.max(175,BT[subject.key].size*3.75));
      }else if(subject.kind==='carrier'){
        carrier.active=true; carrier.phase=1; carrier.alt=0; carrier.clearance=CARRIER_CRUISE_ALT;
        carrier.x=cx; carrier.y=cy; carrier.tx=cx+230; carrier.ty=cy+25; carrier.ang=Math.PI*.72;
        setCamera(390);
      }else if(subject.kind==='city'){
        const dims=[[52,52],[72,42],[116,76],[42,42]][subject.id];
        const hp=[1150,780,1500,520][subject.id];
        relics.push({x:cx,y:cy,w:dims[0],h:dims[1],s:Math.max(...dims),a:Math.PI*.08,
          kind:+subject.id,zone:0,hp,hpm:hp,alive:true,salv:0,salvE:0,lean:0,burn:0,seed:1});
        setCamera(subject.id===2?340:subject.id===0?285:250);
      }
      document.documentElement.dataset.rosterReady=subject.kind+':'+(subject.key??subject.id??'carrier');
      return document.documentElement.dataset.rosterReady;
    };
  });

  const clip={x:150,y:95,width:700,height:700};
  const capture=async subject=>{
    if(reuse){
      try{await access(join(outDir,subject.file));process.stdout.write('reused '+subject.file+'\n');return;}
      catch{}
    }
    const token=await page.evaluate(s=>window.__setRosterCapture(s),subject);
    await page.waitForTimeout(180);
    const name=subject.file;
    await page.screenshot({path:join(outDir,name),clip});
    process.stdout.write('captured '+token+' -> '+name+'\n');
  };

  const unitCards=[];
  for(const U of data.units){
    const file=`unit-${String(U.id).padStart(2,'0')}-${safe(U.name)}.png`;
    await capture({kind:'unit',id:U.id,file});
    const faction=U.id===12||U.id===13?'INFESTATION':U.hero==='legion'?'RED ASCENDANCY':
      U.hero==='syndicate'?'SYNDICATE':U.hero==='horde'?'UMBRAL BROOD':'NOVA';
    unitCards.push({...U,file,meta:`TYPE ${String(U.id).padStart(2,'0')} · ${U.cat}`,faction});
  }

  const bcat={eco:'ECONOMY',prod:'PRODUCTION',def:'DEFENCE',tech:'TECHNOLOGY',sup:'SUPPORT',
    wall:'FORTIFICATION',sup2:'SUPERWEAPON'};
  const buildingCards=[];
  for(const B of data.buildings){
    const file=`building-${safe(B.key)}-${safe(B.name)}.png`;
    await capture({kind:'building',key:B.key,file});
    buildingCards.push({...B,file,meta:`${B.key.toUpperCase()} · ${bcat[B.cat]||String(B.cat).toUpperCase()}`,faction:B.key==='nest'?'INFESTATION':'NOVA'});
  }

  const variants=[
    {kind:'carrier',name:'Super Carrier',meta:'FLIGHT CONFIGURATION',faction:'NOVA'},
    {kind:'faction',fac:'syndicate',id:1,name:'Syndicate Rhino',meta:'ALT CHASSIS · TYPE 01',faction:'SYNDICATE'},
    {kind:'faction',fac:'syndicate',id:2,name:'Syndicate Goliath',meta:'ALT CHASSIS · TYPE 02',faction:'SYNDICATE'},
    {kind:'faction',fac:'syndicate',id:6,name:'Syndicate Longbow',meta:'ALT CHASSIS · TYPE 06',faction:'SYNDICATE'},
    {kind:'faction',fac:'horde',id:0,name:'Brood Striker',meta:'ALT CHASSIS · TYPE 00',faction:'UMBRAL BROOD'},
    {kind:'faction',fac:'horde',id:1,name:'Brood Rhino',meta:'ALT CHASSIS · TYPE 01',faction:'UMBRAL BROOD'},
    {kind:'faction',fac:'horde',id:2,name:'Brood Goliath',meta:'ALT CHASSIS · TYPE 02',faction:'UMBRAL BROOD'},
    {kind:'faction',fac:'horde',id:9,name:'Brood Pyro',meta:'ALT CHASSIS · TYPE 09',faction:'UMBRAL BROOD'},
    {kind:'city',id:0,name:'Tower Block',meta:'CITY · KIND 0',faction:'WORLD'},
    {kind:'city',id:1,name:'Civic Dome Block',meta:'CITY · KIND 1',faction:'WORLD'},
    {kind:'city',id:2,name:'Industrial Foundry',meta:'CITY · KIND 2',faction:'WORLD'},
    {kind:'city',id:3,name:'Tank Farm',meta:'CITY · KIND 3',faction:'WORLD'}
  ];
  const variantCards=[];
  for(let i=0;i<variants.length;i++){
    const V=variants[i],file=`variant-${String(i).padStart(2,'0')}-${safe(V.name)}.png`;
    await capture({...V,file});
    variantCards.push({...V,file});
  }

  const renderSheet=async({title,sub,cards,file})=>{
    const sheet=await context.newPage();
    await sheet.setViewportSize({width:1800,height:900});
    const cardsHtml=cards.map(C=>`<article class="card">
      <div class="frame"><img src="${base}/.tmp/roster-live3d/${C.file}" alt="${esc(C.name)}"></div>
      <div class="copy"><h2>${esc(C.name)}</h2><p>${esc(C.meta)}</p><span>${esc(C.faction)}</span></div>
    </article>`).join('');
    await sheet.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;background:#050a12;color:#e8f6ff;font-family:Arial,sans-serif}
      body{width:1800px;padding:58px 54px 70px;background:
        radial-gradient(circle at 50% -5%,rgba(35,130,192,.30),transparent 34%),
        linear-gradient(180deg,#091421 0,#050910 56%,#03070d 100%)}
      header{border:1px solid #365a72;background:linear-gradient(180deg,#14263a,#09131f);padding:32px 38px 28px;
        clip-path:polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px);
        box-shadow:0 18px 60px #000b;margin-bottom:34px}
      h1{margin:0;font-size:44px;letter-spacing:.14em;font-weight:900;color:#f6d57e;text-transform:uppercase}
      header p{margin:11px 0 0;color:#98c9e9;font-size:20px;letter-spacing:.08em}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
      .card{min-width:0;border:1px solid #314f65;background:linear-gradient(180deg,#102237,#08121f 72%);overflow:hidden;
        clip-path:polygon(13px 0,100% 0,100% calc(100% - 13px),calc(100% - 13px) 100%,0 100%,0 13px);
        box-shadow:0 10px 24px #0009}
      .frame{height:298px;background:#06101a;overflow:hidden;border-bottom:1px solid #29495e}
      .frame img{width:100%;height:100%;display:block;object-fit:cover}
      .copy{position:relative;min-height:112px;padding:19px 18px 17px}
      h2{margin:0 0 9px;font-size:25px;line-height:1.05;letter-spacing:.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .copy p{margin:0;padding-right:112px;color:#84b6d6;font-size:14px;font-weight:700;letter-spacing:.08em}
      .copy span{position:absolute;right:16px;bottom:17px;max-width:135px;padding:7px 10px;border:1px solid #52748c;
        border-radius:5px;background:#101c29;color:#d9efff;font-size:11px;font-weight:900;letter-spacing:.07em;text-align:center}
      footer{margin-top:31px;padding-top:18px;border-top:1px solid #27475d;color:#7297ae;font-size:16px;letter-spacing:.07em;text-align:center}
    </style></head><body><header><h1>${esc(title)}</h1><p>${esc(sub)}</p></header><main class="grid">${cardsHtml}</main>
      <footer>LIVE WEBGL CAPTURE · NO LEGACY MENU SPRITES · ${cards.length} VERIFIED SUBJECTS</footer></body></html>`,{waitUntil:'load'});
    await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),{timeout:30000});
    await sheet.screenshot({path:join(releases,file),fullPage:true});
    await sheet.close();
    process.stdout.write('sheet -> '+file+'\n');
  };

  const date='2 AUG 2026 · MASSFRONT v'+data.version;
  await renderSheet({title:'All Units · Live 3D',sub:date+' · current battlefield meshes and faction colours · normalized thumbnail framing',cards:unitCards,file:'MASSFRONT-v1.28.0-live3d-units-contact-sheet.png'});
  await renderSheet({title:'All Structures · Live 3D',sub:date+' · current battlefield structures and turret assemblies',cards:buildingCards,file:'MASSFRONT-v1.28.0-live3d-buildings-contact-sheet.png'});
  await renderSheet({title:'Faction & World Variants',sub:date+' · carrier, alternate faction chassis, and destructible city structures',cards:variantCards,file:'MASSFRONT-v1.28.0-live3d-world-variants-contact-sheet.png'});
  await renderSheet({title:'Complete Live 3D Catalogue',sub:date+' · units, structures, carrier, faction variants, and city models',cards:[...unitCards,...buildingCards,...variantCards],file:'MASSFRONT-v1.28.0-live3d-master-contact-sheet.png'});

  if(pageErrors.length) throw new Error('Page errors:\n'+pageErrors.join('\n'));
  process.stdout.write(`complete: ${unitCards.length} units, ${buildingCards.length} structures, ${variantCards.length} variants\n`);
}finally{
  await browser.close();
}
