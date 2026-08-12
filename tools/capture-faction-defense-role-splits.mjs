/* Live WebGL proof that formerly aliased defensive roles now have independent
   silhouettes. Usage: node tools/capture-faction-defense-role-splits.mjs [base URL] */
import {chromium} from 'playwright';
import {mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const tmp=join(root,'.tmp','faction-defense-splits');
const out=join(root,'releases','faction-defense-role-splits-live3d.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:920,height:920},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?factionDefenseSplitCapture=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof BLD_MDL_MACHINE!=='undefined'&&typeof BLD_MDL_INFESTATION!=='undefined'&&
    typeof mdlMacAATur==='function'&&typeof stopAttract==='function'&&typeof render==='function',{timeout:30000});
  await page.waitForTimeout(700);
  await page.evaluate(()=>{
    stopAttract();resetWorld();attractOn=false;demoMode=true;matchLive=true;fogOn=false;
    running=true;paused=true;gameEnded=false;carrier.active=false;carrier.phase=2;camTick=()=>camUpdateMatrices();
    document.body.className='';for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';resize();
    window.__defenseSplitSubject=(fac,key,span)=>{
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5,team=fac==='horde'?2:1,F=FACTIONS[fac];AI.fac=fac;
      TEAMC[team][0]=F.col[0];TEAMC[team][1]=F.col[1];TEAMC[team][2]=F.col[2];
      TEAMB[team][0]=F.colB[0];TEAMB[team][1]=F.colB[1];TEAMB[team][2]=F.colB[2];
      ensureBldFactionMeshes(fac);
      const B=addBld(key,team,cx,cy,true,Math.PI*.05);B.fac=fac;B.lvl=3;B.tier=3;B.cool=0;
      B.tang=Math.PI*.76;B.anim=1.1;cam.x=cx;cam.y=cy;camFollow=-1;
      camYaw=yawTarget=.64;camPitch=pitchTarget=1.08;orthoSpan=distTarget=span;camUpdateMatrices();
    };
  });
  const subjects=[
    ['syndicate','turret',195,'Syndicate Sentinel','Phase-disruption triple emitter'],
    ['syndicate','plasma',195,'Plasma Charger','Paired capacitors around a suspended core'],
    ['syndicate','bunker',205,'Syndicate Bulwark','Broad pulse fan for close defense'],
    ['syndicate','aatower',205,'Syndicate Skyguard','Sensor diamond with four interceptor barrels'],
    ['syndicate','hellstorm',230,'Spin Beam','Heavy sweeping anti-unit emitter'],
    ['syndicate','minelaser',230,'Mining Laser','Single calibrated industrial lens throat'],
    ['horde','turret',205,'Brood Sentinel','Fast direct-fire spine organ'],
    ['horde','bastion',215,'Brood Concussion Mortar','Pressure sacs and raised lobbed-fire throat'],
    ['horde','aatower',205,'Brood Skyguard','Divergent anti-air spore mouths'],
    ['horde','missilebastion',210,'Brood Missile Bastion','Egg-fed strategic launch cluster'],
  ],cards=[];
  for(let n=0;n<subjects.length;n++){
    const [fac,key,span,name,sub]=subjects[n],file=`${String(n).padStart(2,'0')}-${fac}-${key}.png`;
    await page.evaluate(([f,k,s])=>window.__defenseSplitSubject(f,k,s),[fac,key,span]);await page.waitForTimeout(210);
    await page.screenshot({path:join(tmp,file),clip:{x:105,y:90,width:710,height:665}});
    cards.push({fac,key,name,sub,file});
  }
  const sheet=await context.newPage();await sheet.setViewportSize({width:1920,height:1060});
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html=cards.map(c=>`<article class="${c.fac}"><div class="tag">${c.key.toUpperCase()}</div><div class="frame"><img src="${base}/.tmp/faction-defense-splits/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
  await sheet.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}body{width:1920px;padding:28px 38px 42px;background:radial-gradient(circle at 50% 0,#18354e,#06101a 38%,#02050a)}
    header{padding:19px 25px;border:1px solid #35617d;background:#0a1724;margin-bottom:15px}h1{margin:0;color:#f4d27c;font-size:34px;letter-spacing:.11em}header p{margin:7px 0 0;color:#8fc8eb;font-size:14px;letter-spacing:.05em}
    main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}article{position:relative;border:1px solid #36536a;background:#081522;overflow:hidden}.syndicate{border-color:#568c4a}.horde{border-color:#7c4ca0}.tag{position:absolute;z-index:2;top:8px;left:8px;padding:5px 7px;background:#02080ddd;border:1px solid #58758a;color:#cbeeff;font-size:9px;letter-spacing:.12em}.frame{height:329px;background:#050d15;border-bottom:1px solid #29475b}.frame img{width:100%;height:100%;object-fit:cover}h2{font-size:17px;margin:11px 12px 4px}.syndicate h2{color:#9cec72}.horde h2{color:#ca96ff}p{margin:0 12px 13px;color:#93b5cb;font-size:10px;line-height:1.35;letter-spacing:.045em;text-transform:uppercase}
  </style><body><header><h1>DEFENSIVE ROLE SILHOUETTE SPLITS</h1><p>Ten live WebGL captures · exact Mk 3 runtime geometry · no shared base-and-weapon buffers remain</p></header><main>${html}</main></body>`,{waitUntil:'load'});
  await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  await sheet.screenshot({path:out,fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('Faction defense role-split contact sheet -> '+out);
}finally{await browser.close();}
