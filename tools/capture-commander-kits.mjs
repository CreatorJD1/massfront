/* Live WebGL 3×3 of playable commander kit meshes on chassis 4 / 28 / 29.
   Canonical Kai / Vex / Renn keep FAC_MESH; Holt Vale Korr Dravik Nyx Voss
   add silhouette extras keyed by commander id. Usage:
     node tools/capture-commander-kits.mjs */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { playwrightGpuLaunch, assertHardwareGpu } from './chrome-gpu.mjs';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','commander-kits-2026-08-14');
await mkdir(outDir,{recursive:true});

const MIME={
  '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.webp':'image/webp'
};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]);
    if(p==='/') p='/index.html';
    const file=resolve(join(root,p));
    if(!file.startsWith(root)||!existsSync(file)){ res.writeHead(404); res.end('nf'); return; }
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  }catch{ res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
console.log('serving '+base);

const browser=await launchPwBrowser(playwrightGpuLaunch());

const only1v3=process.argv.includes('--1v3');
const subjects=[
  ['nova','nova_kai',4,'canonical type 4'],
  ['nova','nova_holt',4,'crane backpack · welder heads'],
  ['nova','nova_vale',4,'spotter rails · scout dish'],
  ['legion','legion_vex',28,'canonical type 28'],
  ['legion','legion_korr',28,'crimson standards · cadence gun'],
  ['legion','legion_dravik',28,'bastion slabs · redoubt ring'],
  ['syndicate','syndicate_renn',29,'canonical type 29'],
  ['syndicate','syndicate_nyx',29,'needle lances past horns'],
  ['syndicate','syndicate_voss',29,'grid rings · deck cells']
];
const seats1v3=[
  ['legion_vex',28,'canonical hull · siege cannon'],
  ['legion_korr',28,'crimson standards · cadence gun'],
  ['legion_dravik',28,'bastion slabs · redoubt ring']
];

try{
  const context=await browser.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{ try{ localStorage.setItem('mf_auth_gate_v1','1'); }catch(e){} });
  await page.goto(base+'/?commanderKitCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof stopAttract==='function'&&typeof spawnUnit==='function'&&
    typeof FAC_MESH!=='undefined'&&FAC_MESH.nova&&typeof commanderKitMeshFor==='function'&&
    COMMANDER_KIT_MESH&&COMMANDER_KIT_MESH.nova_holt,{timeout:45000});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{
    stopAttract();resetWorld();attractOn=false;demoMode=true;matchLive=true;fogOn=false;
    running=true;paused=true;gameEnded=false;carrier.active=false;carrier.phase=2;
    camTick=()=>camUpdateMatrices();document.body.className='';
    if(typeof apGateSatisfied==='function') apGateSatisfied();
    if(typeof apClose==='function') apClose();
    const ap=document.getElementById('apOverlay'); if(ap) ap.style.display='none';
    for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
    cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
    cv.style.width='100vw';cv.style.height='100vh';resize();
    window.__kitSubject=(fac,id,type)=>{
      const ap=document.getElementById('apOverlay'); if(ap) ap.style.display='none';
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;aiDeployArrivals.length=0;carrier.active=false;carrier.phase=2;
      for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5;
      playerFaction=fac; playerCommanderId=id;
      const cols={nova:[120,205,255],legion:[255,120,90],syndicate:[150,235,95]};
      const colB={nova:[82,174,255],legion:[255,93,67],syndicate:[110,215,60]};
      const F=(typeof FACTIONS!=='undefined'&&FACTIONS[fac])||null;
      const c=(F&&F.col)||cols[fac], b=(F&&F.colB)||colB[fac];
      TEAMC[0][0]=c[0];TEAMC[0][1]=c[1];TEAMC[0][2]=c[2];
      TEAMB[0][0]=b[0];TEAMB[0][1]=b[1];TEAMB[0][2]=b[2];
      const i=spawnUnit(type,0,cx,cy);
      heroIdx=i;
      ux[i]=utx[i]=cx;uy[i]=uty[i]=cy;uang[i]=Math.PI*.73;uturr[i]=Math.PI*.67;ustate[i]=0;umov[i]=0;
      rebuildGrid();
      const portraitSpan={nova:120,legion:360,syndicate:120};
      orthoSpan=distTarget=portraitSpan[fac];
      cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.66;camPitch=pitchTarget=1.10;camUpdateMatrices();
      const C=(typeof commanderById==='function')?commanderById(id):null;
      const KM=(typeof commanderKitMeshFor==='function')?commanderKitMeshFor(id):null;
      if(typeof render==='function') render();
      return {nm:C&&C.nm||id, kit:!!KM, verts:KM&&KM.hull&&KM.hull.count||null};
    };
    window.__kitEnemySeat=(fac,id,type)=>{
      const ap=document.getElementById('apOverlay'); if(ap) ap.style.display='none';
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;aiDeployArrivals.length=0;carrier.active=false;carrier.phase=2;
      for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5;
      playerFaction='nova'; playerCommanderId='nova_kai'; heroIdx=-1;
      AI.fac=fac;
      const F=FACTIONS[fac];
      TEAMC[1][0]=F.col[0];TEAMC[1][1]=F.col[1];TEAMC[1][2]=F.col[2];
      TEAMB[1][0]=F.colB[0];TEAMB[1][1]=F.colB[1];TEAMB[1][2]=F.colB[2];
      const i=spawnUnit(type,1,cx,cy);
      ux[i]=utx[i]=cx;uy[i]=uty[i]=cy;uang[i]=Math.PI*.73;uturr[i]=Math.PI*.67;ustate[i]=0;umov[i]=0;
      enemyHeroIdxs=[i]; enemyHeroIdx=i;
      AI.bases=[{x:cx,y:cy,slot:0,commander:i,commanderId:id,commanderNm:(commanderById(id)||{}).nm,
                 commanderGen:ugen[i],fac}];
      AI.allies=[];
      if(typeof commanderStampAiSeats==='function') commanderStampAiSeats();
      rebuildGrid();
      const portraitSpan={nova:120,legion:360,syndicate:120};
      orthoSpan=distTarget=portraitSpan[fac];
      cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.66;camPitch=pitchTarget=1.10;camUpdateMatrices();
      const cid=typeof commanderIdForUnit==='function'?commanderIdForUnit(i):null;
      const KM=cid&&typeof commanderKitMeshFor==='function'?commanderKitMeshFor(cid):null;
      if(typeof render==='function') render();
      return {nm:(commanderById(id)||{}).nm||id, kit:!!KM, cid, seatWpn:AI.bases[0].primary&&AI.bases[0].primary.nm};
    };
    window.__kitEnemyLine=(fac,seats)=>{
      const ap=document.getElementById('apOverlay'); if(ap) ap.style.display='none';
      ualive.fill(0);usel.fill(0);freeList=[];unitHigh=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      blds.length=0;aiDeployArrivals.length=0;carrier.active=false;carrier.phase=2;
      for(const a of [rocks,trees,crystals,deposits,geysers,relief,wrecks,crates,relics,craters,rubbles,birds,tanks]) a.length=0;
      rebuildGrid();rebuildBGrid(true);beams.length=0;palive.fill(0);pHigh=0;flife.fill(0);fCount=0;
      const cx=MAP*.5,cy=MAP*.5, gap=92;
      playerFaction='nova'; playerCommanderId='nova_kai'; heroIdx=-1;
      AI.fac=fac;
      const F=FACTIONS[fac];
      TEAMC[1][0]=F.col[0];TEAMC[1][1]=F.col[1];TEAMC[1][2]=F.col[2];
      TEAMB[1][0]=F.colB[0];TEAMB[1][1]=F.colB[1];TEAMB[1][2]=F.colB[2];
      const idxs=[], bases=[];
      for(let s=0;s<seats.length;s++){
        const [id,type]=seats[s];
        const x=cx+(s-(seats.length-1)*.5)*gap, y=cy;
        const i=spawnUnit(type,1,x,y);
        ux[i]=utx[i]=x;uy[i]=uty[i]=y;uang[i]=Math.PI*.73;uturr[i]=Math.PI*.67;ustate[i]=0;umov[i]=0;
        idxs.push(i);
        const C=commanderById(id)||{};
        bases.push({x,y,slot:s,commander:i,commanderId:id,commanderNm:C.nm,commanderGen:ugen[i],fac});
      }
      enemyHeroIdxs=idxs.slice(); enemyHeroIdx=idxs[0];
      AI.bases=bases; AI.allies=[];
      if(typeof commanderStampAiSeats==='function') commanderStampAiSeats();
      rebuildGrid();
      orthoSpan=distTarget=520;
      cam.x=cx;cam.y=cy;camFollow=-1;camYaw=yawTarget=.55;camPitch=pitchTarget=1.05;camUpdateMatrices();
      const resolved=idxs.map(i=>{
        const cid=typeof commanderIdForUnit==='function'?commanderIdForUnit(i):null;
        const KM=cid&&typeof commanderKitMeshFor==='function'?commanderKitMeshFor(cid):null;
        return {i,cid,kit:!!KM,wpn:((AI.bases.find(b=>b.commander===i)||{}).primary||{}).nm};
      });
      if(typeof render==='function') render();
      return resolved;
    };
  });
  const cards=[], metrics={kits:{},errors:[],seats1v3:[]};
  const esc=s=>String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  if(!only1v3){
    for(let n=0;n<subjects.length;n++){
      const [fac,id,type,sub]=subjects[n], file=`${String(n).padStart(2,'0')}-${id}.png`;
      const info=await page.evaluate(([f,i,t])=>window.__kitSubject(f,i,t),[fac,id,type]);
      await page.waitForTimeout(280);
      await page.screenshot({path:join(outDir,file),clip:{x:130,y:105,width:740,height:710}});
      cards.push({fac,id,type,name:info.nm,sub,file,kit:info.kit});
      metrics.kits[id]={type,kit:info.kit,verts:info.verts,nm:info.nm};
    }
    const sheet=await context.newPage();
    await sheet.setViewportSize({width:1920,height:1280});
    const html=cards.map(c=>`<article class="${c.fac}"><div class="tag">${c.kit?'KIT MESH':'CANONICAL'} · TYPE ${c.type}</div><div class="frame"><img src="${base}/.tmp/commander-kits-2026-08-14/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
    await sheet.setContent(`<!doctype html><style>
      *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}
      body{width:1920px;padding:28px 36px 40px;background:radial-gradient(circle at 50% 0,#18344d,#06101a 38%,#02050a)}
      header{padding:18px 24px;border:1px solid #35617d;background:#0a1724;margin-bottom:16px}
      h1{margin:0;color:#f4d27c;font-size:32px;letter-spacing:.12em}
      header p{margin:6px 0 0;color:#8fc8eb;font-size:14px;letter-spacing:.04em}
      main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
      article{position:relative;border:1px solid #36536a;background:#081522;overflow:hidden}
      .nova{border-color:#397fa9}.legion{border-color:#8f4d42}.syndicate{border-color:#4f8846}
      .tag{position:absolute;z-index:2;top:10px;left:10px;padding:6px 8px;background:#02080ddd;border:1px solid #58758a;color:#cbeeff;font-size:10px;letter-spacing:.12em;text-transform:uppercase}
      .frame{height:340px;background:#050d15;border-bottom:1px solid #29475b}
      .frame img{width:100%;height:100%;object-fit:cover}
      h2{font-size:18px;margin:12px 14px 4px}
      .nova h2{color:#78d5ff}.legion h2{color:#ff8e7c}.syndicate h2{color:#9cec72}
      p{margin:0 14px 14px;color:#93b5cb;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
    </style><body><header><h1>PLAYABLE COMMANDER KITS</h1>
    <p>Nine live WebGL captures · chassis 4 / 28 / 29 · extras keyed by commander id · Kai / Vex / Renn canonical</p></header>
    <main>${html}</main></body>`,{waitUntil:'load'});
    await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
    const sheetPath=join(outDir,'03-playable-kits-3x3.png');
    await sheet.screenshot({path:sheetPath,fullPage:true});
    console.log('Commander kit contact -> '+sheetPath);
  }

  const seatCards=[];
  for(let n=0;n<seats1v3.length;n++){
    const [id,type,sub]=seats1v3[n], file=`1v3-${id}.png`;
    const info=await page.evaluate(([i,t])=>window.__kitEnemySeat('legion',i,t),[id,type]);
    await page.waitForTimeout(280);
    await page.screenshot({path:join(outDir,file),clip:{x:130,y:105,width:740,height:710}});
    seatCards.push({id,type,name:info.nm,sub,file,kit:info.kit,cid:info.cid,wpn:info.seatWpn});
    metrics.seats1v3.push(info);
  }
  const line=await page.evaluate(seats=>window.__kitEnemyLine('legion',seats),seats1v3.map(s=>[s[0],s[1]]));
  await page.waitForTimeout(320);
  const linePath=join(outDir,'04-large-1v3-legion-line.png');
  await page.screenshot({path:linePath,clip:{x:40,y:180,width:920,height:560}});
  metrics.line=line;

  const strip=await context.newPage();
  await strip.setViewportSize({width:1920,height:780});
  const html1=seatCards.map(c=>`<article><div class="tag">${c.kit?'KIT MESH':'CANONICAL'} · ${esc(c.cid||c.id)} · ${esc(c.wpn||'')}</div><div class="frame"><img src="${base}/.tmp/commander-kits-2026-08-14/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
  await strip.setContent(`<!doctype html><style>
    *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}
    body{width:1920px;padding:24px 32px 32px;background:radial-gradient(circle at 50% 0,#3a1c18,#120808 42%,#060303)}
    header{padding:16px 22px;border:1px solid #8f4d42;background:#1a0c0a;margin-bottom:14px}
    h1{margin:0;color:#ff8e7c;font-size:28px;letter-spacing:.12em}
    header p{margin:6px 0 0;color:#e0b3a8;font-size:13px}
    main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    article{position:relative;border:1px solid #8f4d42;background:#140908;overflow:hidden}
    .tag{position:absolute;z-index:2;top:10px;left:10px;padding:6px 8px;background:#120505dd;border:1px solid #8f4d42;color:#ffd4c8;font-size:10px;letter-spacing:.1em;text-transform:uppercase}
    .frame{height:420px;background:#0a0505;border-bottom:1px solid #5a2e28}
    .frame img{width:100%;height:100%;object-fit:cover}
    h2{font-size:20px;margin:12px 14px 4px;color:#ff8e7c}
    p{margin:0 14px 14px;color:#e0b3a8;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
  </style><body><header><h1>LARGE 1v3 · LEGION ENEMY SEATS</h1>
  <p>Three AI commanders, same faction chassis 28 · kit extras stamped from seat commanderId · Vex canonical / Korr banners / Dravik slabs</p></header>
  <main>${html1}</main></body>`,{waitUntil:'load'});
  await strip.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  const stripPath=join(outDir,'04-large-1v3-legion-seats.png');
  await strip.screenshot({path:stripPath,fullPage:true});

  if(errors.length){ metrics.errors=errors; console.warn('page errors:\n'+errors.join('\n')); }
  await writeFile(join(outDir,'metrics.json'),JSON.stringify(metrics,null,2));
  console.log('1v3 enemy seats -> '+stripPath);
  console.log('1v3 line -> '+linePath);
}finally{
  await browser.close();
  server.close();
}
