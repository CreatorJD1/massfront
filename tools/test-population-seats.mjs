/* Per-seat 1000 population ledgers. Usage: node tools/test-population-seats.mjs [URL] */
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
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof populationCanSpawn==='function'
    &&typeof populationUsedForCommander==='function'&&typeof PASS!=='undefined'&&PASS&&PASS.length>0,null,{timeout:90000});

  const out=await page.evaluate(()=>{
    running=false;demoMode=false;
    const land=()=>{
      for(let y=220;y<MAP-220;y+=31)for(let x=220;x<MAP-220;x+=31)
        if(isWalkable(x,y))return [x,y];
      throw new Error('no land');
    };
    const wipe=()=>{
      for(let i=0;i<unitHigh;i++)ualive[i]=0;
      unitHigh=0;freeList.length=0;teamCount[0]=teamCount[1]=teamCount[2]=0;
      if(typeof populationResetLedgers==='function')populationResetLedgers();
    };
    const L=land();
    const fill=(n,team,slot,x,y)=>{
      let got=0;
      for(let k=0;k<n;k++){
        const i=spawnUnit(0,team,x,y,slot);
        if(i<0) break;
        ux[i]=x;uy[i]=y;got++;
      }
      return got;
    };

    const capConst=FACTION_POP_CAP;
    const ledgerDeclared=typeof populationLedgerPlayer==='function';
    const hudPop=typeof hudPlayerPop==='function'?hudPlayerPop():null;

    wipe();
    AI.allies=[];AI.bases=[{slot:0,x:L[0],y:L[1]}];
    const p1=fill(3,0,-1,L[0],L[1]);
    const playerUsed=populationUsedForCommander(-1);
    const team0Cap=populationCapFor(0);

    wipe();
    AI.allies=[{slot:0}];AI.bases=[{slot:1,x:L[0]+400,y:L[1]}];
    const player=fill(4,0,-1,L[0],L[1]);
    const ally=fill(5,0,0,L[0]+80,L[1]);
    const split={player:populationUsedForCommander(-1),ally:populationUsedForCommander(0),
      team:populationUsedFor(0),ceiling:populationTeamCeiling(0),n:nCommandersOnTeam(0)};

    wipe();
    AI.allies=[];AI.bases=[{slot:0,x:L[0],y:L[1]},{slot:1,x:L[0]+500,y:L[1]}];
    const e0=fill(6,1,0,L[0],L[1]);
    const e1=fill(7,1,1,L[0]+500,L[1]);
    const seats={e0:populationUsedForCommander(0),e1:populationUsedForCommander(1),
      team:populationUsedFor(1),ceiling:populationTeamCeiling(1),n:nCommandersOnTeam(1),
      capFor1:populationCapFor(1)};

    wipe();
    AI.allies=[];AI.bases=[{slot:0,x:L[0],y:L[1]},{slot:1,x:L[0]+500,y:L[1]}];
    const packed=fill(1000,1,0,L[0],L[1]);
    const blocked=spawnUnit(0,1,L[0],L[1],0);
    const otherSeat=spawnUnit(0,1,L[0]+500,L[1],1);
    const oneSeatCannotEat={packed,blocked,otherSeat,used0:populationUsedForCommander(0),
      used1:populationUsedForCommander(1)};

    wipe();
    const prevFac=AI.fac; AI.fac='horde';
    AI.allies=[];AI.bases=[{slot:0,x:L[0],y:L[1]},{slot:1,x:L[0]+500,y:L[1]}];
    const sovType=TYPES.findIndex(t=>t&&t.hero==='horde');
    const sov=spawnUnit(sovType,1,L[0],L[1],0);
    const packedAroundSov=fill(999,1,0,L[0],L[1]);
    const usedFull=populationUsedForCommander(0);
    const canOnFull=populationCanSpawn(12,1,uCmd[sov],L[0],L[1]);
    const ravOnFull=spawnUnit(12,1,L[0],L[1],uCmd[sov]);
    ustomp[sov]=0; ustun[sov]=0;
    if(typeof unitTick==='function') unitTick(0.016);
    const usedAfterTick=populationUsedForCommander(0);
    const ravOnOther=spawnUnit(12,1,L[0]+500,L[1],1);
    AI.fac=prevFac;
    const sovereign={sov,packedAroundSov,usedFull,canOnFull,ravOnFull,usedAfterTick,
      ravOnOther,used1:populationUsedForCommander(1),seat:sov>=0?uCmd[sov]:null};

    return {capConst,ledgerDeclared,hudPop,p1,playerUsed,team0Cap,split,seats,oneSeatCannotEat,sovereign};
  });

  assert(out.capConst===1000,'FACTION_POP_CAP must stay 1000, got '+out.capConst);
  assert(out.team0Cap===1000,'populationCapFor(0) must stay 1000');
  assert(out.seats.capFor1===1000,'populationCapFor(1) must stay 1000, not a team blob');
  assert(!out.ledgerDeclared,'sim.js must not declare populationLedgerPlayer — HUD owns hudPlayerPop');
  assert(out.hudPop&&out.hudPop.cap===1000,'hudPlayerPop cap must be the player seat 1000');
  assert(out.playerUsed===3&&out.p1===3,'player ledger did not count spawns');
  assert(out.split.n===2&&out.split.ceiling===2000,'team 0 2v2 ceiling should be 2000');
  assert(out.split.player===4&&out.split.ally===5,'ally must not eat the player ledger');
  assert(out.seats.n===2&&out.seats.ceiling===2000,'team 1 two seats → ceiling 2000');
  assert(out.seats.e0===6&&out.seats.e1===7,'team 1 seats must be independent ledgers');
  assert(out.oneSeatCannotEat.packed===1000&&out.oneSeatCannotEat.blocked<0,
    'seat 0 must hard-cap at 1000');
  assert(out.oneSeatCannotEat.otherSeat>=0&&out.oneSeatCannotEat.used1===1,
    'a full seat must not block another seat');
  assert(out.sovereign.sov>=0&&out.sovereign.seat===0,'Sovereign must occupy enemy seat 0');
  assert(out.sovereign.usedFull===1000&&out.sovereign.canOnFull===false&&out.sovereign.ravOnFull<0,
    'Sovereign Ravagers must not exceed that seat\'s 1000');
  assert(out.sovereign.usedAfterTick===1000,'Sovereign birth must not drip past the seat cap');
  assert(out.sovereign.ravOnOther>=0&&out.sovereign.used1===1,
    'a full Sovereign seat must not block another commander seat');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...out},null,2));
}finally{
  await browser.close();
  if(server) server.close();
}
