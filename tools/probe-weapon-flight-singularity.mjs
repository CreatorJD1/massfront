#!/usr/bin/env node
/* Current-source deterministic probe for projectile classification and the
 * Syndicate singularity's rigid/world-force contract. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'tmp','weapon-flight-singularity');
await mkdir(outDir,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.glb':'model/gltf-binary','.ogg':'audio/ogg','.m4a':'audio/mp4'};
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=['src/game/sim.js','src/engine/physics.js','assets/data/manifest.json','boot.js'];
const source={};
for(const rel of sourceFiles){const b=await readFile(join(root,rel));source[rel]={bytes:b.length,sha256:sha(b)};}

const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';
    const file=resolve(join(root,path));
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error?.stack||error));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const cdp=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});
if(!process.env.PW_CDP&&!process.env.PW_CDP_PORT)process.env.PW_CDP_PORT=String(cdp);
const {launchPwBrowser,closePwBrowser,killProjectChromium}=await import('./pw-browser.mjs');

const pageErrors=[];
let result=null;
try{
  const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.addInitScript(()=>{try{localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_ap_gate_closed','1');}catch{}});
  await page.goto(`http://127.0.0.1:${port}/?weaponflightprobe=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof spawnUnit==='function'&&typeof fireProj==='function'&&
    typeof projTick==='function'&&typeof MFPhys==='object'&&typeof MFPhys.attract==='function'&&typeof superDetonation==='function',null,{timeout:120000});

  result=await page.evaluate(()=>{
    const dt=1/30;
    const angle=(x,y)=>Math.atan2(y,x);
    const diff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;};
    resetWorld();running=false;paused=false;matchLive=true;fogOn=false;
    const light=TYPES.findIndex((T,i)=>ARM[i]===0&&!T.air&&T.r>0);
    const heavy=TYPES.findIndex((T,i)=>ARM[i]===2&&!T.air&&T.r>0);
    const target=spawnUnit(light>=0?light:0,1,MAP*.5+300,MAP*.5);
    const launch=(type,y)=>{
      const p=fireProj(type,0,MAP*.5,MAP*.5+y,MAP*.5+300,MAP*.5+y,180,1,0,target);
      const before=angle(pvx[p],pvy[p]);
      uy[target]+=120;
      projTick(dt);
      const after=angle(pvx[p],pvy[p]);
      const turn=Math.abs(diff(after,before));
      if(palive[p])killProj(p);
      uy[target]-=120;
      return {turn,before,after};
    };
    const guided=launch(7,-80),rocket=launch(4,0),bullet=launch(1,80);

    MFPhys.clear();MFPhys.seed(0x5a17c0de);
    const ground=typeof terrainH==='function'?terrainH(MAP*.5+120,MAP*.5):0;
    const body=MFPhys.spawn(MAP*.5+120,MAP*.5,ground+18,{vx:0,vy:0,vz:0,hx:3,hy:2,hz:1,mass:18,ttl:20,chunks:1});
    let rigidBefore=null,rigidAfter=null;
    MFPhys.forEach((id,v)=>{if(id===body)rigidBefore={x:v.x,y:v.y,z:v.z,vx:v.vx,vy:v.vy,vz:v.vz};});
    const rigidHits=MFPhys.attract(MAP*.5,MAP*.5,16,240,360,dt,.25,8);
    MFPhys.forEach((id,v)=>{if(id===body)rigidAfter={x:v.x,y:v.y,z:v.z,vx:v.vx,vy:v.vy,vz:v.vz};});
    const rigidProbe=MFPhys.probe();

    const li=spawnUnit(light>=0?light:0,1,MAP*.5+100,MAP*.5+20);
    const hi=spawnUnit(heavy>=0?heavy:0,1,MAP*.5+100,MAP*.5-20);
    const massResponse={light:mfSingularityMassResponse(li),heavy:mfSingularityMassResponse(hi)};

    const singularBefore=singularities.length;
    playerFaction='syndicate';superDetonation(MAP*.5,MAP*.5,.25,0,{visual:false,ground:false});
    const syndicateSpawned=singularities.length-singularBefore;
    singularities.length=0;
    playerFaction='legion';superDetonation(MAP*.5,MAP*.5,.04,0,{visual:false,ground:false});
    const legionSpawned=singularities.length;

    return {dt,guided,rocket,bullet,rigidHits,rigidBefore,rigidAfter,rigidProbe,massResponse,
      factionOwnership:{syndicateSpawned,legionSpawned}};
  });
  await closePwBrowser();
}finally{
  server.close();
  await killProjectChromium().catch(()=>{});
}

const checks={
  noPageErrors:pageErrors.length===0,
  guidedTurns:!!result&&result.guided.turn>1e-4,
  guidedTurnCapped:!!result&&result.guided.turn<=4.6*result.dt+1e-5,
  rocketUnguided:!!result&&result.rocket.turn<1e-6,
  bulletUnguided:!!result&&result.bullet.turn<1e-6,
  rigidAttracted:!!result&&result.rigidHits===1&&result.rigidAfter&&result.rigidAfter.vx<0,
  rigidFinite:!!result&&result.rigidProbe.finite,
  heavyResistsMore:!!result&&result.massResponse.light>result.massResponse.heavy,
  syndicateOwnsSingularity:!!result&&result.factionOwnership.syndicateSpawned===1,
  legionDoesNotOwnSingularity:!!result&&result.factionOwnership.legionSpawned===0
};
const report={schemaVersion:1,createdAt:new Date().toISOString(),source,pageErrors,result,checks,pass:Object.values(checks).every(Boolean)};
const reportPath=join(outDir,'latest.json');
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log(`report: ${reportPath}`);
if(!report.pass)process.exitCode=1;
