/* Live WebGL comparison for the faction unit doctrine path.
   Usage: node tools/capture-faction-unit-doctrine.mjs [base URL] */
import {chromium} from 'playwright';
import {mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const tmp=join(root,'.tmp','faction-doctrine'), out=join(root,'releases','faction-unit-doctrine-live3d.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await rm(tmp,{recursive:true,force:true}); await mkdir(tmp,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?factionDoctrineCapture=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof UNIT_MESH!=='undefined'&&typeof FAC_DOCTRINE_MESH!=='undefined'&&
    typeof render==='function'&&Object.keys(FAC_DOCTRINE_MESH).length===3,{timeout:30000});
  await page.waitForTimeout(900);
  await page.evaluate(()=>{
    stopAttract(); resetWorld(); attractOn=false; demoMode=true; matchLive=true; fogOn=false;
    running=true; paused=true; gameEnded=false; carrier.active=false; carrier.phase=2;
    camTick=()=>camUpdateMatrices(); document.body.className='';
    for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';resize();
    window.__doctrineSubject=(fac,ty)=>{
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const player=fac==='nova',F=player?{col:[120,205,255],colB:[82,174,255]}:FACTIONS[fac];
      if(!player){AI.fac=fac;TEAMC[1][0]=F.col[0];TEAMC[1][1]=F.col[1];TEAMC[1][2]=F.col[2];
        TEAMB[1][0]=F.colB[0];TEAMB[1][1]=F.colB[1];TEAMB[1][2]=F.colB[2];}
      const cx=MAP*.5,cy=MAP*.5,i=spawnUnit(ty,player?0:1,cx,cy);
      ux[i]=utx[i]=cx;uy[i]=uty[i]=cy;uang[i]=Math.PI*.74;uturr[i]=Math.PI*.69;ustate[i]=0;umov[i]=0;
      rebuildGrid();cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.66;camPitch=pitchTarget=1.12;
      orthoSpan=distTarget=Math.max(150,TYPES[ty].size*4.5);camUpdateMatrices();
    };
  });
  const subjects=[
    ['nova',1,'Nova Rhino','Capacitor-rail armor doctrine'],
    ['nova',16,'Nova Bombard','Clean-energy siege doctrine'],
    ['nova',5,'Nova Wasp','Emitter-wing air doctrine'],
    ['legion',1,'Ascendancy Rhino','Heavy armor doctrine'],
    ['legion',16,'Ascendancy Bombard','Siege chassis doctrine'],
    ['legion',5,'Ascendancy Wasp','Armored air doctrine'],
    ['syndicate',1,'Coalition Rhino','Bespoke hover chassis'],
    ['syndicate',3,'Coalition Thumper','Hover-coil doctrine'],
    ['syndicate',5,'Coalition Wasp','Raked air doctrine'],
    ['horde',0,'Brood Striker','Bespoke grown chassis'],
    ['horde',21,'Brood Cinder','Carapace doctrine'],
    ['horde',5,'Brood Wasp','Spined air doctrine'],
  ];
  const cards=[];
  for(let n=0;n<subjects.length;n++){
    const [fac,ty,name,sub]=subjects[n],file=`${String(n).padStart(2,'0')}-${fac}-${ty}.png`;
    await page.evaluate(([f,t])=>window.__doctrineSubject(f,t),[fac,ty]); await page.waitForTimeout(180);
    await page.screenshot({path:join(tmp,file),clip:{x:150,y:95,width:700,height:700}});
    cards.push({fac,name,sub,file});
  }
  const sheet=await context.newPage();await sheet.setViewportSize({width:1920,height:980});
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html=cards.map(c=>`<article class="${c.fac}"><div class="frame"><img src="${base}/.tmp/faction-doctrine/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
  await sheet.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#03070d;color:#eaf6ff;font-family:Arial,sans-serif}body{width:1920px;padding:34px 42px 46px;background:radial-gradient(circle at 50% 0,#17314b,#050a12 38%,#02050a)}
    header{padding:22px 27px;border:1px solid #3a647e;background:#0b1826;margin-bottom:19px}h1{margin:0;color:#f3d17b;font-size:38px;letter-spacing:.12em}header p{margin:8px 0 0;color:#8fc6e9;font-size:16px;letter-spacing:.05em}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{border:1px solid #38536a;background:#091522;overflow:hidden}article.nova{border-color:#397fa9}article.legion{border-color:#8c4a42}article.syndicate{border-color:#4f8545}article.horde{border-color:#744a96}
    .frame{height:242px;background:#06101a;border-bottom:1px solid #2a465a}.frame img{width:100%;height:100%;object-fit:cover}h2{font-size:20px;margin:12px 14px 4px;letter-spacing:.025em}article.nova h2{color:#78d5ff}article.legion h2{color:#ff8c7a}article.syndicate h2{color:#9aec70}article.horde h2{color:#c894ff}article p{margin:0 14px 13px;color:#94b7cd;font-size:12px;letter-spacing:.055em;text-transform:uppercase}
  </style><body><header><h1>LIVE FACTION UNIT DOCTRINES</h1><p>Role chassis preserved · faction silhouettes applied in the battlefield renderer · PBR WebGL capture</p></header><main>${html}</main></body>`,{waitUntil:'load'});
  await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await sheet.screenshot({path:out,fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('Faction doctrine contact sheet -> '+out);
}finally{await browser.close();}
