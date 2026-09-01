/* Literal 500-per-participant population contract.
   Usage: node tools/test-population-seats.mjs [URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const givenUrl=process.argv.find(a=>/^https?:\/\//.test(a));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.webmanifest':'application/manifest+json'};
let url=givenUrl,server=null;
if(!url){
  server=createServer(async(req,res)=>{try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
    const file=resolve(join(root,p)),rel=relative(root,file);
    if(!rel||rel==='..'||rel.startsWith(`..${sep}`)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
    const body=await readFile(file);res.writeHead(200,{'Cache-Control':'no-store','Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end('nf');}});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));url='http://127.0.0.1:'+server.address().port+'/';
}

const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const browser=await launchPwBrowser({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e?.stack||e)));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof populationCanSpawn==='function'
    &&typeof populationFactionLedger==='function'&&typeof populationUsedForCommander==='function'
    &&typeof hudPlayerPop==='function'&&typeof PASS!=='undefined'&&PASS&&PASS.length>0,null,{timeout:90000});

  const out=await page.evaluate(()=>{
    running=false;demoMode=false;matchLive=true;
    const land=()=>{for(let y=220;y<MAP-220;y+=31)for(let x=220;x<MAP-220;x+=31)if(isWalkable(x,y))return [x,y];throw Error('no land');};
    const wipe=()=>{for(let i=0;i<unitHigh;i++)ualive[i]=0;unitHigh=0;freeList.length=0;
      teamCount[0]=teamCount[1]=teamCount[2]=0;if(typeof populationResetLedgers==='function')populationResetLedgers();};
    const fill=(team,slot,max,P)=>{let got=0;for(let n=0;n<max;n++){if(spawnUnit(0,team,P[0],P[1],slot)<0)break;got++;}return got;};
    const hero=TYPES.findIndex(T=>T&&T.cat==='hero'),L=land();if(hero<0)throw Error('no hero');

    wipe();AI.allies=[];AI.bases=[0,1,2].map((slot,n)=>({slot,x:L[0]+n*180,y:L[1]+n*120}));AI.base=AI.bases[0];
    const heroes=AI.bases.map(B=>spawnUnit(hero,1,B.x,B.y,B.slot));
    const ordinary=AI.bases.map(B=>fill(1,B.slot,600,[B.x,B.y]));
    const aggregate={heroes,ordinary,used:populationUsedFor(1),cap:populationCapFor(1),ceiling:populationTeamCeiling(1),
      seats:[0,1,2].map(populationUsedForCommander),blocked:AI.bases.map(B=>spawnUnit(0,1,B.x,B.y,B.slot))};

    wipe();battlefieldPreset='large';for(let i=0;i<aiSlots.length;i++){aiSlots[i].on=true;aiSlots[i].ally=false;}
    normalizeAiSlotsForBattlefield();const topology=skirmishSpawnPoints(),distances=[];
    for(let i=0;i<topology.length;i++)for(let j=i+1;j<topology.length;j++)distances.push(Math.hypot(topology[i].x-topology[j].x,topology[i].y-topology[j].y));
    const P5=topology[0];AI.allies=[];AI.bases=topology.slice(1).map(S=>({slot:S.slot,x:S.x,y:S.y}));AI.base=AI.bases[0];
    const player5={hero:spawnUnit(hero,0,P5.x,P5.y,-1),ordinary:fill(0,-1,600,[P5.x,P5.y])};
    const enemies5=AI.bases.map(B=>({slot:B.slot,hero:spawnUnit(hero,1,B.x,B.y,B.slot),ordinary:fill(1,B.slot,600,[B.x,B.y])}));
    const oneVFour={topology:topology.map(S=>({slot:S.slot,zone:S.zone})),minDistance:Math.min(...distances),playerUsed:populationUsedForCommander(-1),
      enemySeats:[0,1,2,3].map(populationUsedForCommander),teamUsed:[populationUsedFor(0),populationUsedFor(1)],player5,enemies5};

    wipe();const P=[L[0],L[1]],E=[L[0]+500,L[1]+300];AI.allies=[];AI.bases=[{slot:0,x:E[0],y:E[1]}];AI.base=AI.bases[0];
    const pHero=spawnUnit(hero,0,P[0],P[1],-1),pOrdinary=fill(0,-1,600,P),player=populationFactionLedger(0),hud=hudPlayerPop();
    const eHero=spawnUnit(hero,1,E[0],E[1],0),eOrdinary=fill(1,0,600,E),enemy=populationFactionLedger(1);
    const independent={pHero,pOrdinary,player,hud,eHero,eOrdinary,enemy};

    wipe();AI.bases=[{slot:0,x:L[0],y:L[1]}];AI.base=AI.bases[0];
    const before=populationUsedForCommander(-1),invalid={index:popCmdIndex(99),resolved:populationResolveSlot(0,99,L[0],L[1]),
      allowed:populationCanSpawn(0,0,99,L[0],L[1]),spawned:spawnUnit(0,0,L[0],L[1],99)};
    invalid.after=populationUsedForCommander(-1);invalid.before=before;
    const capFallback={invalidCap:populationCapFor(99),invalidCeiling:populationTeamCeiling(99),neutralCap:populationCapFor(2)};
    return {constant:FACTION_POP_CAP,aggregate,oneVFour,independent,invalid,capFallback};
  });

  assert(out.constant===500,'FACTION_POP_CAP must be literal 500, got '+out.constant);
  assert(out.aggregate.heroes.length===3&&out.aggregate.heroes.every(i=>i>=0),'1v3 commanders must all be admitted');
  assert(out.aggregate.ordinary.every(n=>n===499)&&out.aggregate.used===1500,'same-team 1v3 must admit 500 per participant');
  assert(out.aggregate.cap===1500&&out.aggregate.ceiling===1500,'team diagnostics must expose the three-seat 1500 ceiling');
  assert(out.aggregate.blocked.every(i=>i<0),'every full participant seat must reject its 501st body');
  assert(out.aggregate.seats.every(n=>n===500),'participant ledgers must each stop at 500');
  assert(out.oneVFour.topology.length===5&&out.oneVFour.topology.some(S=>S.slot===3&&S.zone==='c'),'large 1v4 must expose the fourth AI at center');
  assert(out.oneVFour.minDistance>=1400,'large 1v4 spawn spacing fell below 1400 m: '+out.oneVFour.minDistance);
  assert(out.oneVFour.playerUsed===500&&out.oneVFour.enemySeats.every(n=>n===500)
    &&out.oneVFour.teamUsed[0]===500&&out.oneVFour.teamUsed[1]===2000,'1v4 must admit exactly 2500 bodies across five seats');
  assert(out.independent.pHero>=0&&out.independent.pOrdinary===499&&out.independent.player.used===500,'player faction did not independently reach 500');
  assert(out.independent.eHero>=0&&out.independent.eOrdinary===499&&out.independent.enemy.used===500,'opposing faction did not independently reach 500');
  assert(out.independent.hud.used===500&&out.independent.hud.cap===500,'HUD must read faction-wide 500');
  assert(out.invalid.index===-1&&out.invalid.resolved===-2&&!out.invalid.allowed&&out.invalid.spawned<0&&out.invalid.before===out.invalid.after,
    'invalid commander slot aliased a valid population bucket');
  assert(out.capFallback.invalidCap===0&&out.capFallback.invalidCeiling===0&&Number.isFinite(out.capFallback.neutralCap)&&out.capFallback.neutralCap>=0,
    'team-cap fallback must fail closed without recursion while preserving the neutral budget');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,contract:'500-per-participant',...out},null,2));
}finally{
  await browser.close().catch(()=>{});await closePwBrowser().catch(()=>{});
  if(server)await new Promise(ok=>server.close(ok));
}
