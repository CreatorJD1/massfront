#!/usr/bin/env node
/* Live-source projectile and artillery-flight probe. This serves the current
   dirty checkout and executes MASSFRONT's actual fireProj/projTick arrays in a
   browser; it does not reproduce guidance or trajectory formulas in Node. */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const simBytes=await readFile(resolve(root,'src/game/sim.js'));
const source={path:'src/game/sim.js',bytes:simBytes.length,sha256:createHash('sha256').update(simBytes).digest('hex')};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error?.stack||error));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const cdp=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?bad(e):ok(p));});});
if(!process.env.PW_CDP&&!process.env.PW_CDP_PORT)process.env.PW_CDP_PORT=String(cdp);
const {launchPwBrowser,closePwBrowser,killProjectChromium}=await import('./pw-browser.mjs');

let result=null;const pageErrors=[];
try{
  const browser=await launchPwBrowser({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
  const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
  }catch{}});
  await page.goto(`http://127.0.0.1:${port}/?weaponflightprobe=1`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof fireProj==='function'&&typeof projTick==='function'&&
    typeof mfGuideMissile==='function'&&typeof spawnUnit==='function'&&typeof terrainH==='function',null,{timeout:120000});

  result=await page.evaluate(()=>{
    const dt=1/30,TAU2=Math.PI*2;
    const heading=(x,y)=>Math.atan2(y,x);
    const angleDiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU2;while(d<-Math.PI)d+=TAU2;return d;};
    const snap=(v,n=9)=>Number(v.toFixed(n));
    resetWorld();if(typeof stopAttract==='function')stopAttract();
    running=false;paused=true;matchLive=true;fogOn=false;perfScale=0;tick=0;
    const targetType=TYPES.findIndex(T=>T&&!T.air&&!T.naval&&T.spd>0&&T.r>0);
    const cx=MAP*.5,cy=MAP*.5,target=spawnUnit(targetType>=0?targetType:0,1,cx+520,cy);
    uhp[target]=uhpm[target]=1e7;

    function resetTarget(){ux[target]=utx[target]=cx+520;uy[target]=uty[target]=cy;}
    function unguided(type,label){
      resetTarget();
      const p=fireProj(type,0,cx,cy,cx+520,cy,180,0,0,target);
      const before=heading(pvx[p],pvy[p]),endpoint=[pex[p],pey[p]];
      uy[target]+=190;projTick(dt);
      const after=heading(pvx[p],pvy[p]),turn=Math.abs(angleDiff(after,before));
      const out={label,type,slot:p,turn:snap(turn,12),velocity:[snap(pvx[p]),snap(pvy[p])],
        endpointBefore:endpoint,endpointAfter:[pex[p],pey[p]],alive:!!palive[p]};
      if(palive[p])killProj(p);return out;
    }
    const unguidedCases=[unguided(4,'rocket'),unguided(0,'caseless-bullet'),
      unguided(1,'ap-cannon'),unguided(3,'commander-shell')];

    function guidedRun(){
      resetTarget();
      const p=fireProj(7,0,cx,cy,cx+520,cy,180,0,0,target),turns=[],headings=[];
      let prev=heading(pvx[p],pvy[p]);
      for(let n=0;n<12&&palive[p];n++){
        uy[target]+=3;projTick(dt);
        const now=heading(pvx[p],pvy[p]);turns.push(snap(Math.abs(angleDiff(now,prev)),12));
        headings.push(snap(now,12));prev=now;
      }
      const out={turns,headings,maxTurn:Math.max(...turns),totalTurn:Math.abs(angleDiff(headings.at(-1)||0,0)),
        cap:4.6*dt,alive:!!palive[p]};
      if(palive[p])killProj(p);return out;
    }
    const guidedA=guidedRun(),guidedB=guidedRun();

    /* Two actual type-2 rounds share endpoints/arc but occupy different slots.
       Their world trajectories must remain identical at every fixed step. */
    resetTarget();
    const ax=cx-360,ay=cy-120,bx=cx+360,by=cy+80;
    const a=fireProj(2,0,ax,ay,bx,by,150,0,0,-1),b=fireProj(2,0,ax,ay,bx,by,150,0,0,-1);
    pArc[a]=pArc[b]=620;
    const arcSamples=[];
    for(let n=0;n<16;n++){
      projTick(dt);
      arcSamples.push({step:n+1,a:[snap(pt[a]),snap(px[a]),snap(py[a]),snap(pz[a])],
        b:[snap(pt[b]),snap(px[b]),snap(py[b]),snap(pz[b])]});
    }
    const arcIdentical=arcSamples.every(S=>JSON.stringify(S.a)===JSON.stringify(S.b));

    /* Instrument the real terrain sampler after launch. Current artillery only
       samples both endpoints inside fireProj; a supported obstruction path
       would query or otherwise expose a mid-flight clearance result. */
    let terrainSamples=0,terrainHooked=false;
    const oldTerrainH=terrainH;
    try{
      terrainH=function(x,y){terrainSamples++;return oldTerrainH(x,y);};terrainHooked=true;
      projTick(dt);
    }finally{terrainH=oldTerrainH;}
    const fixedEndpoint=pex[a]===bx&&pey[a]===by;
    const boundedClearanceSamples=(typeof pObsTerrainN!=='undefined')?pObsTerrainN[a]+pObsTerrainN[b]:0;
    if(palive[a])killProj(a);if(palive[b])killProj(b);
    const cluster=fireProj(9,0,ax,ay,bx,by,150,0,0,-1),clusterPt0=pt[cluster];
    projTick(dt);
    const clusterArc={profile:WeaponFlightProfile(9).trajectory,pt0:snap(clusterPt0),pt1:snap(pt[cluster]),
      z:snap(pz[cluster]),arc:snap(pArc[cluster]),alive:!!palive[cluster]};
    if(palive[cluster])killProj(cluster);
    const airType=TYPES.findIndex(T=>T&&T.air&&T.r>0),air=spawnUnit(airType>=0?airType:targetType,1,cx+120,cy);
    ux[air]=utx[air]=cx+120;uy[air]=uty[air]=cy;uhp[air]=uhpm[air]=1e7;
    const flak=fireProj(8,0,cx,cy,cx+240,cy,1800,0,0,air);
    projTick(dt);projTick(dt);
    const sweptFlak={airType,armedAge:snap(pAge[flak]),alive:!!palive[flak],x:snap(px[flak]),targetX:snap(ux[air])};
    if(palive[flak])killProj(flak);
    return {dt,targetType,unguidedCases,guidedA,guidedB,
      profileContract:typeof WeaponFlightProfile==='function'&&WeaponFlightProfile(7).guidance==='predictive'&&
        WeaponFlightProfile(4).guidance==='none'&&WeaponFlightProfile(9).trajectory==='arc',
      clusterArc,sweptFlak,artillery:{arcSamples,arcIdentical,fixedEndpoint,terrainHooked,midflightTerrainSamples:terrainSamples,
        boundedClearanceSamples,obstructionApi:typeof mfProjectileObstructionSweep}};
  });
  await closePwBrowser();
}finally{
  server.close();await killProjectChromium().catch(()=>{});
}

const req={
  unguidedRocket:{status:result&&result.unguidedCases[0].turn<1e-9?'PASS':'FAIL',evidence:result?.unguidedCases[0]},
  unguidedBullet:{status:result&&result.unguidedCases[1].turn<1e-9?'PASS':'FAIL',evidence:result?.unguidedCases[1]},
  unguidedCannon:{status:result&&result.unguidedCases.slice(2).every(x=>x.turn<1e-9)?'PASS':'FAIL',evidence:result?.unguidedCases.slice(2)},
  guidedTurns:{status:result&&result.guidedA.totalTurn>1e-4?'PASS':'FAIL',evidence:result?.guidedA},
  guidedTurnCap:{status:result&&result.guidedA.turns.every(x=>x<=result.guidedA.cap+1e-8)?'PASS':'FAIL',
    evidence:{observed:result?.guidedA.maxTurn,cap:result?.guidedA.cap}},
  guidedDeterminism:{status:result&&JSON.stringify(result.guidedA)===JSON.stringify(result.guidedB)?'PASS':'FAIL',
    evidence:{a:result?.guidedA,b:result?.guidedB}},
  authoritativeProfile:{status:result?.profileContract?'PASS':'FAIL',evidence:result?.profileContract},
  clusterUsesArc:{status:result?.clusterArc.profile==='arc'&&result?.clusterArc.pt1>result?.clusterArc.pt0&&result?.clusterArc.z>0&&result?.clusterArc.arc>=92?'PASS':'FAIL',evidence:result?.clusterArc},
  sweptProximityFuse:{status:result?.sweptFlak.airType>=0&&!result?.sweptFlak.alive?'PASS':'FAIL',evidence:result?.sweptFlak},
  deterministicArtilleryArc:{status:result?.artillery.arcIdentical&&result?.artillery.fixedEndpoint?'PASS':'FAIL',evidence:result?.artillery},
  artilleryObstruction:{status:result?.artillery.obstructionApi==='function'&&result?.artillery.boundedClearanceSamples>0?'PASS':'FAIL',
    evidence:{supported:result?.artillery.obstructionApi==='function',boundedClearanceSamples:result?.artillery.boundedClearanceSamples,
      obstructionApi:result?.artillery.obstructionApi,
      reason:'The real fixed-step arc spends bounded terrain/large-blocker clearance gates during flight.'}},
  pageRuntime:{status:pageErrors.length===0?'PASS':'FAIL',evidence:pageErrors}
};
const report={schemaVersion:1,source,result,requirements:req,pass:Object.values(req).every(x=>x.status==='PASS')};
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
