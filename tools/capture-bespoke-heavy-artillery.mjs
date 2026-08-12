/* Self-contained capture with its own server. Based on the proven
   capture-faction-strategic-defense.mjs pattern. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const wwwDir=path.join(root,'www');
const tmpDir=path.join(root,'.tmp','bespoke-heavy');
const outDir=path.join(root,'releases');
await mkdir(tmpDir,{recursive:true});
await mkdir(outDir,{recursive:true});

const PORT=8100;
const server=http.createServer((req,res)=>{
  let reqUrl=req.url.split('?')[0];
  if(reqUrl==='/') reqUrl='/index.html';
  let fp;
  if(reqUrl.startsWith('/.tmp/')) fp=path.join(root,reqUrl);
  else fp=path.join(wwwDir,reqUrl);
  if(!fs.existsSync(fp)){res.writeHead(404);res.end('Not found');return;}
  fs.readFile(fp,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    const ext=path.extname(fp).toLowerCase();
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.m4a':'audio/mp4','.ogg':'audio/ogg'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});
    res.end(data);
  });
});

server.listen(PORT,async()=>{
  console.log('Serving on http://127.0.0.1:'+PORT);
  const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
  const browser=await chromium.launch({headless:true,executablePath:chrome,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
  try{
    const ctx=await browser.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:2,colorScheme:'dark'});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+PORT+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof render==='function'&&typeof stopAttract==='function'&&
      typeof BLD_MDL_LEGION!=='undefined'&&typeof ensureBldFactionMeshes==='function',{timeout:60000});
    await page.waitForTimeout(800);
    await page.evaluate(()=>{
      stopAttract();resetWorld();attractOn=false;demoMode=true;matchLive=true;fogOn=false;
      running=true;paused=true;gameEnded=false;carrier.active=false;carrier.phase=2;
      camTick=()=>camUpdateMatrices();document.body.className='';
      for(const el of [...document.body.children]) if(el.id!=='gl') el.style.display='none';
      cv.style.display='block';cv.style.filter='none';cv.style.position='fixed';cv.style.inset='0';
      cv.style.width='100vw';cv.style.height='100vh';resize();
      window.__bespokeSubject=(fac,key)=>{
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
      };
    });
    const subjects=[
      ['nova','hellfire_cannon','Nova Hellfire Cannon','Quad-barrel siege battery · cyan conduits · industrial steel'],
      ['legion','sovereign_howitzer','Dominion Iron Sovereign','Thermobaric fortress cradle · red command livery · heat stacks'],
      ['syndicate','singularity_disruptor','Syndicate Singularity Disruptor','Levitating coil weapon · green conduit glow · gold nano-armor'],
      ['horde','spore_catalyst','Brood Spore Catalyst','Organic bio-acid lobes · chitin shells · bioluminescent nodes'],
    ];
    const files=[];
    for(let n=0;n<subjects.length;n++){
      const [fac,key,name,sub]=subjects[n],file=`${String(n).padStart(2,'0')}-${fac}-${key}.png`;
      await page.evaluate(([f,k])=>window.__bespokeSubject(f,k),[fac,key]);
      await page.waitForTimeout(100);
      await page.evaluate(()=>render(1/60));
      await page.waitForTimeout(100);
      await page.screenshot({path:path.join(tmpDir,file),clip:{x:130,y:100,width:740,height:710}});
      files.push({name,sub,fac,file});
      console.log('  captured',fac,key);
    }
    const sheet=await ctx.newPage();await sheet.setViewportSize({width:1920,height:560});
    const esc=t=>t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const html=files.map(c=>`<article class="${c.fac}"><div class="frame"><img src="http://127.0.0.1:${PORT}/.tmp/bespoke-heavy/${c.file}"></div><h2>${esc(c.name)}</h2><p>${esc(c.sub)}</p></article>`).join('');
    await sheet.setContent(`<!doctype html><style>
      *{box-sizing:border-box}html,body{margin:0;background:#02060b;color:#edf8ff;font-family:Arial,sans-serif}body{width:1920px;padding:30px 40px}
      header{padding:16px 24px;border:1px solid #35617d;background:#0a1724;margin-bottom:14px}h1{margin:0;color:#f4d27c;font-size:30px;letter-spacing:.12em}header p{margin:6px 0 0;color:#8fc8eb;font-size:13px;letter-spacing:.05em}
      main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}article{border:1px solid #36536a;background:#081522;overflow:hidden}.nova{border-color:#397fa9}.legion{border-color:#a14d40}.syndicate{border-color:#588e4d}.horde{border-color:#7d4ba4}
      .frame{height:340px;background:#050d15;border-bottom:1px solid #29475b}.frame img{width:100%;height:100%;object-fit:cover}h2{font-size:18px;margin:10px 12px 4px}.nova h2{color:#78d5ff}.legion h2{color:#ff8e7c}.syndicate h2{color:#9cec72}.horde h2{color:#ca96ff}p{margin:0 12px 12px;color:#93b5cb;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    </style><body><header><h1>BESPOKE HEAVY ARTILLERY — FACTION IDENTITY</h1><p>Four live WebGL captures · Mk 3 production geometry · per-faction bespoke model kits</p></header><main>${html}</main></body>`,{waitUntil:'load'});
    await sheet.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
    const out=path.join(outDir,'bespoke-heavy-artillery-live3d.png');
    await sheet.screenshot({path:out,fullPage:true});
    console.log('Contact sheet -> '+out);
    if(errors.length) console.error('Page errors:',errors);
  }catch(e){console.error('Capture failed:',e);}
  finally{await browser.close();server.close();}
});
