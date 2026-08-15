/* Incremental spatial hash: same neighbor queries as rebuildGrid.
   Usage: node tools/test-spatial-hash.mjs [URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const givenUrl=process.argv.find(a=>/^https?:\/\//.test(a));
const MIME={
  '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.webmanifest':'application/manifest+json'
};
let url=givenUrl,server=null;
if(!url){
  server=createServer(async(req,res)=>{
    try{
      let p=decodeURIComponent((req.url||'/').split('?')[0]);
      if(p==='/') p='/index.html';
      const file=resolve(join(root,p));
      if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});
      res.end(body);
    }catch{res.writeHead(404);res.end('nf');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url='http://127.0.0.1:'+server.address().port+'/';
}

const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof gridQueryProof==='function'
    &&typeof PASS!=='undefined'&&PASS&&PASS.length>0,null,{timeout:90000});

  const out=await page.evaluate(()=>{
    running=false;demoMode=false;
    const land=()=>{
      for(let y=220;y<MAP-220;y+=31)for(let x=220;x<MAP-220;x+=31)
        if(isWalkable(x,y))return [x,y];
      throw new Error('no land');
    };
    const wipe=()=>{
      for(let i=0;i<unitHigh;i++)if(ualive[i])killUnit(i,true);
      unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      if(typeof populationResetLedgers==='function')populationResetLedgers();
      rebuildGrid();
    };
    const L=land();
    wipe();
    const a=spawnUnit(0,0,L[0],L[1],-1);
    const b=spawnUnit(0,1,L[0]+40,L[1],0);
    ux[a]=L[0];uy[a]=L[1];ux[b]=L[0]+40;uy[b]=L[1];
    gridRelink(a);gridRelink(b);
    const incFe=findEnemy(ux[a],uy[a],0,120,0);
    unitSeparation(a,TYPES[0],false,false,2);
    const incSep={hits:sepHits,vx:sepVX,vy:sepVY};
    const proof=gridQueryProof();
    const afterFe=findEnemy(ux[a],uy[a],0,120,0);

    /* Teleport across a bucket without going through unitTick. */
    const oldCell=uGridCell[b];
    ux[b]=L[0]+CS+12;uy[b]=L[1];
    gridRelink(b);
    const teleported=uGridCell[b]!==oldCell && uGridCell[b]===gCell(ux[b],uy[b]);
    const feAfterTeleport=findEnemy(ux[b],uy[b],1,200,0);
    rebuildGrid();
    const feAfterRebuild=findEnemy(ux[b],uy[b],1,200,0);

    /* killUnit must drop the corpse from neighbor walks. */
    const corpse=b;
    killUnit(corpse,true);
    const feDead=findEnemy(ux[a],uy[a],0,800,0);

    /* Wipe-without-rebuild then spawn must not cycle (gridLink unlinks first). */
    for(let i=0;i<unitHigh;i++)ualive[i]=0;
    unitHigh=0;freeList.length=0;
    const c=spawnUnit(0,0,L[0],L[1],-1);
    const d=spawnUnit(0,1,L[0]+36,L[1],0);
    ux[c]=L[0];uy[c]=L[1];ux[d]=L[0]+36;uy[d]=L[1];
    gridRelink(c);gridRelink(d);
    const cycled=findEnemy(ux[c],uy[c],0,120,0);

    const civicLine=String(spawnExplosion).includes('civic?Math.min(size,13):size');
    return {incFe,incSep,proof,afterFe,teleported,feAfterTeleport,feAfterRebuild,
      feDead,cycled,cap:FACTION_POP_CAP,civicLine};
  });

  assert(out.cap===1000,'FACTION_POP_CAP must stay 1000');
  assert(out.civicLine,'civic explosion cap must stay size 13');
  assert(out.incFe>=0,'incremental findEnemy missed a nearby foe');
  assert(out.proof.ok&&out.proof.feBad===0&&out.proof.sepMiss===0,
    'incremental hash disagreed with rebuildGrid: '+JSON.stringify(out.proof));
  assert(out.afterFe===out.incFe,'rebuildGrid changed closest-enemy identity');
  assert(out.teleported,'gridRelink did not follow a cell-boundary teleport');
  assert(out.feAfterTeleport===out.feAfterRebuild,'teleport relink missed a neighbor rebuild still sees');
  assert(out.feDead<0,'killUnit left a corpse in the hash');
  assert(out.cycled>=0,'wipe-then-spawn livelocked or missed the foe');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...out},null,2));
}finally{
  await browser.close();
  if(server) server.close();
}
