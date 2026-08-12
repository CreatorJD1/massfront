/* Live in-engine comparison of the two strategic defense landmarks across all
   canonical factions. Usage: node tools/capture-faction-strategic-defense.mjs [base URL] */
import {chromium} from 'playwright';
import {mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const tmp=join(root,'.tmp','faction-strategic-defense');
const out=join(root,'releases','faction-strategic-defense-live3d.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?factionStrategicDefenseCapture=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof BLD_MDL_LEGION!=='undefined'&&typeof BLD_MDL_MACHINE!=='undefined'&&
    typeof BLD_MDL_INFESTATION!=='undefined'&&typeof addFactionStrategicBuildingVfx==='function'&&
    typeof stopAttract==='function'&&typeof resetWorld==='function'&&typeof render==='function',{timeout:30000});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{
    stopAttract();resetWorld();attractOn=false;demoMode=true;matchLive=true;fogOn=false;
    running=true;paused=true;gameEnded=false;carrier.active=false;carrier.phase=2;
    camTick=()=>camUpdateMatrices();document.body.className='';
    for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';resize();
    window.__strategicDefenseSubject=(fac,key)=>{
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5,team=fac==='nova'?0:fac==='horde'?2:1;
      if(fac!=='nova'){
        const F=FACTIONS[fac];AI.fac=fac;
        TEAMC[team][0]=F.col[0];TEAMC[team][1]=F.col[1];TEAMC[team][2]=F.col[2];
        TEAMB[team][0]=F.colB[0];TEAMB[team][1]=F.colB[1];TEAMB[team][2]=F.colB[2];
      }
      ensureBldFactionMeshes(fac);
      const B=addBld(key,team,cx,cy,true,Math.PI*.06);B.fac=fac;B.lvl=3;B.tier=3;B.cool=0;
      B.tang=Math.PI*.78;B.anim=1.25;B.hitT=0;
      cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.65;camPitch=pitchTarget=1.08;
      orthoSpan=distTarget=key==='nova'?225:205;camUpdateMatrices();
      document.documentElement.dataset.strategicReady=fac+':'+key;
    };
  });
  const subjects=[
    ['nova','rail','Nova Rail Battery','Precision accelerator · cyan capacitor lock'],
    ['legion','rail','Ascendancy Rail Battery','Twin penetrator rails · exposed recoil capacitors'],
    ['syndicate','rail','Syndicate Void Lance','Levitating coil weapon · green-violet field'],
    ['horde','rail','Brood Bone Driver','Grown penetrator throat · chitin recoil cage'],
    ['nova','nova','Nova Strategic Silo','Clean orbital targeting lattice'],
    ['legion','nova','Ascendancy NOVA Fortress','Heavy launch throats · command crown'],
    ['syndicate','nova','Syndicate Singularity Core','Contained collapse weapon'],
    ['horde','nova','Brood Acid Cataclysm','Strategic bile organ · living pressure sacs'],
  ],cards=[];
  for(let n=0;n<subjects.length;n++){
    const [fac,key,name,sub]=subjects[n],file=`${String(n).padStart(2,'0')}-${fac}-${key}.png`;
    await page.evaluate(([f,k])=>window.__strategicDefenseSubject(f,k),[fac,key]);
    await page.waitForTimeout(240);
    await page.screenshot({path:join(tmp,file),clip:{x:130,y:100,width:740,height:710}});
    cards.push({fac,key,name,sub,file});
  }
  const sheet=await context.newPage();await sheet.setViewportSize({width:1920,height:1060});
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html=cards.map(c=>`<article class="${c.fac}"><div class="role">${c.key==='rail'?'LONG-RANGE DEFENSE':'STRATEGIC SUPERWEAPON'}</div><div class="frame"><img src="${base}/.tmp/faction-strategic-defense/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
  await sheet.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}body{width:1920px;padding:30px 40px 44px;background:radial-gradient(circle at 50% 0,#18354e,#06101a 38%,#02050a)}
    header{padding:20px 27px;border:1px solid #35617d;background:#0a1724;margin-bottom:16px}h1{margin:0;color:#f4d27c;font-size:36px;letter-spacing:.12em}header p{margin:8px 0 0;color:#8fc8eb;font-size:15px;letter-spacing:.05em}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}article{position:relative;border:1px solid #36536a;background:#081522;overflow:hidden}.nova{border-color:#397fa9}.legion{border-color:#a14d40}.syndicate{border-color:#588e4d}.horde{border-color:#7d4ba4}
    .role{position:absolute;z-index:2;top:9px;left:9px;padding:6px 8px;background:#02080ddd;border:1px solid #58758a;color:#cbeeff;font-size:10px;letter-spacing:.13em}.frame{height:340px;background:#050d15;border-bottom:1px solid #29475b}.frame img{width:100%;height:100%;object-fit:cover}h2{font-size:19px;margin:12px 14px 5px}.nova h2{color:#78d5ff}.legion h2{color:#ff8e7c}.syndicate h2{color:#9cec72}.horde h2{color:#ca96ff}p{margin:0 14px 14px;color:#93b5cb;font-size:11px;letter-spacing:.05em;text-transform:uppercase}
  </style><body><header><h1>FACTION STRATEGIC DEFENSE IDENTITIES</h1><p>Eight live WebGL captures · Mk 3 production geometry · faction-coded charge signatures</p></header><main>${html}</main></body>`,{waitUntil:'load'});
  await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await sheet.screenshot({path:out,fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('Faction strategic-defense contact sheet -> '+out);
}finally{await browser.close();}
