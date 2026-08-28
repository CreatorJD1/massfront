#!/usr/bin/env node
/* Source-bound faction population admission probe. */
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const execFile = promisify(execFileCallback);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const startedUtc = new Date().toISOString();
const output = join(root, '.tmp', 'population-cap', 'runs', startedUtc.replace(/[:.]/g, '-'));
const sourceFiles = ['src/game/sim.js','src/game/ai.js','src/ui/hud.js','src/airlift.js','src/main.js',
  'src/warprimer.js','boot.js','assets/data/manifest.json','index.html','tools/probe-population-cap.mjs'];
const MIME={'.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.html':'text/html; charset=utf-8',
  '.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.m4a':'audio/mp4','.mjs':'text/javascript; charset=utf-8','.ogg':'audio/ogg','.png':'image/png',
  '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.webp':'image/webp'};
await mkdir(output,{recursive:true});
const sha256=value=>createHash('sha256').update(value).digest('hex');
async function git(args){const {stdout}=await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});return stdout.trimEnd();}
async function provenance(){
  const files=[];for(const path of sourceFiles){const bytes=await readFile(join(root,path));files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  const [head,status]=await Promise.all([git(['rev-parse','HEAD']),git(['status','--porcelain=v1','--untracked-files=all'])]);
  const entries=status?status.split(/\r?\n/).filter(Boolean):[];
  return {head,dirty:!!entries.length,dirtyEntries:entries.length,dirtyFingerprint:sha256(status),
    sourceSetSha256:sha256(files.map(f=>`${f.path}:${f.sha256}`).join('\n')),files};
}
async function sourceLine(path,re){const lines=(await readFile(join(root,path),'utf8')).split(/\r?\n/);const i=lines.findIndex(x=>re.test(x));return i<0?null:i+1;}
async function startServer(){
  const server=createServer(async(req,res)=>{try{
    const pathname=decodeURIComponent(new URL(req.url||'/','http://127.0.0.1').pathname);
    const file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`),rel=relative(root,file);
    if(!rel||rel.startsWith(`..${sep}`)||rel==='..'||resolve(root,rel)!==file||!existsSync(file))throw Error('missing');
    const bytes=await readFile(file);res.writeHead(200,{'Cache-Control':'no-store','Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');}});
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const address=server.address();return {url:`http://127.0.0.1:${address.port}/`,port:address.port,
    close:()=>new Promise(done=>{server.close(done);if(server.closeAllConnections)server.closeAllConnections();})};
}
async function servedHashes(url){const out=[];for(const path of sourceFiles.filter(p=>!p.startsWith('tools/'))){
  const response=await fetch(new URL(path,url),{cache:'no-store',signal:AbortSignal.timeout(30000)}),bytes=Buffer.from(await response.arrayBuffer());
  out.push({path,status:response.status,bytes:bytes.length,sha256:sha256(bytes)});}return out;}
async function boundedClose(promise){await Promise.race([promise,new Promise(ok=>setTimeout(ok,5000))]);}

const startSource=await provenance();
const lines={constant:await sourceLine('src/game/sim.js',/^const FACTION_POP_CAP=/),
  slotIndex:await sourceLine('src/game/sim.js',/^function popCmdIndex\(/),
  ceiling:await sourceLine('src/game/sim.js',/^function populationTeamCeiling\(/),
  reservations:await sourceLine('src/game/sim.js',/^function populationMissingCommanderReservations\(/),
  admission:await sourceLine('src/game/sim.js',/^function populationCanSpawn\(/),
  recount:await sourceLine('src/game/sim.js',/^function populationRecountLedgers\(/),
  spawn:await sourceLine('src/game/sim.js',/^function spawnUnit\(/),
  factory:await sourceLine('src/game/sim.js',/if\(!populationCanSpawn\(t,B\.team,cmdSlot\)\)/),
  hud:await sourceLine('src/ui/hud.js',/^function hudPlayerPop\(/)};
const localByPath=Object.fromEntries(startSource.files.map(f=>[f.path,f]));
const server=await startServer(),browser=await launchPwBrowser({headless:true});
let page;const runtimeErrors=[],consoleErrors=[],blockedExternal=[];
try{
  page=await browser.newPage({viewport:{width:900,height:700},deviceScaleFactor:1,colorScheme:'dark'});
  page.on('pageerror',e=>runtimeErrors.push(String(e?.stack||e)));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))await route.continue();else{blockedExternal.push(u.href);await route.abort('blockedbyclient');}});
  await page.addInitScript(()=>{let s=1;window.__mfProbeSetRandomSeed=x=>{s=(x>>>0)||1;};Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
    try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_offline','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');localStorage.setItem('mf_auth_gate_v1','1');}catch{}});
  const gpu=await assertHardwareGpu(page);await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof populationCanSpawn==='function'
    &&typeof populationFactionLedger==='function'&&typeof populationRecountLedgers==='function'
    &&typeof mfAirliftPopHold==='function'&&typeof bldTick==='function'&&typeof hudPlayerPop==='function'
    &&typeof resetWorld==='function',null,{timeout:120000});
  const repetitions=await page.evaluate(()=>{
    const SEED=0x504f5055,ordinary=0,hero=TYPES.findIndex(T=>T&&T.cat==='hero');if(hero<0)throw Error('no hero');
    curMap='sombrero_medium';curTheme='verdant';terrainTex=buildTerrain(curTheme);builtTheme=curTheme;builtMap=curMap;
    const reset=()=>{window.__mfProbeSetRandomSeed(SEED);srand(SEED|0);try{if(typeof stopAttract==='function')stopAttract();}catch{}
      resetWorld();tick=0;perfScale=.4125;attractOn=false;demoMode=false;matchLive=true;running=false;paused=false;gameEnded=false;fogOn=false;
      AI.diff=2;AI.t=3600;AI.fac='legion';AI.allies=[];stats.t=3600;};
    const point=(x,y)=>findLand(MAP*x,MAP*y);
    const bases=slots=>slots.map((slot,n)=>{const P=point(.24+n*.22,.28+n*.19);return {slot,x:P[0],y:P[1],mass:999999,energy:999999};});
    const fill=(team,slot,max,P,type=ordinary)=>{const ids=[];for(let n=0;n<max;n++){const id=spawnUnit(type,team,P[0]??P.x,P[1]??P.y,slot);if(id<0)break;ids.push(id);}return ids;};
    const run=repetition=>{
      reset();AI.bases=bases([0,1,2]);AI.base=AI.bases[0];
      const heroes=AI.bases.map(B=>spawnUnit(hero,1,B.x,B.y,B.slot)),ordinaryIds=[];
      for(let n=0;n<600;n++){const B=AI.bases[n%3],id=spawnUnit(ordinary,1,B.x,B.y,B.slot);if(id<0)break;ordinaryIds.push(id);}
      const fullTypes=TYPES.map((T,type)=>T?{type,allowed:populationCanSpawn(type,1,type%3,AI.bases[type%3].x,AI.bases[type%3].y),spawned:spawnUnit(type,1,AI.bases[type%3].x,AI.bases[type%3].y,type%3)}:null).filter(Boolean);
      const sameFaction1v3={heroes,ordinaryAccepted:ordinaryIds.length,used:populationUsedFor(1),cap:populationCapFor(1),ceiling:populationTeamCeiling(1),seatUsed:[0,1,2].map(populationUsedForCommander),furtherBySeat:AI.bases.map(B=>populationCanSpawn(ordinary,1,B.slot,B.x,B.y)),fullTypes};
      const fac=addBld('fac',1,AI.bases[0].x,AI.bases[0].y,true,0);fac.aiBaseSlot=0;fac.queue=[ordinary];fac.prodT=TYPES[ordinary].bt-.001;
      const factoryBefore={used:populationUsedFor(1),mass:AI.bases[0].mass,energy:AI.bases[0].energy,prodT:fac.prodT};bldTick(1/30);
      const factory={before:factoryBefore,after:{used:populationUsedFor(1),mass:AI.bases[0].mass,energy:AI.bases[0].energy,prodT:fac.prodT},queueRetained:fac.queue.length===1&&fac.queue[0]===ordinary};

      reset();const PP=point(.25,.35),EP=point(.72,.66);AI.bases=[{slot:0,x:EP[0],y:EP[1],mass:999999,energy:999999}];AI.base=AI.bases[0];
      const playerHero=spawnUnit(hero,0,PP[0],PP[1],-1),playerOrdinary=fill(0,-1,600,PP);
      const enemyHero=spawnUnit(hero,1,EP[0],EP[1],0),enemyOrdinary=fill(1,0,600,EP);
      const independentFactions={playerHero,playerOrdinary:playerOrdinary.length,player:populationFactionLedger(0),hud:hudPlayerPop(),enemyHero,enemyOrdinary:enemyOrdinary.length,enemy:populationFactionLedger(1)};

      reset();const IP=point(.4,.4);AI.bases=[{slot:0,x:IP[0],y:IP[1],mass:100,energy:100}];AI.base=AI.bases[0];
      const invalidSlots={before:{player:populationUsedForCommander(-1),team:populationUsedFor(0)},index99:popCmdIndex(99),resolved99:populationResolveSlot(0,99,IP[0],IP[1]),allowed99:populationCanSpawn(ordinary,0,99,IP[0],IP[1]),spawned99:spawnUnit(ordinary,0,IP[0],IP[1],99)};
      invalidSlots.after={player:populationUsedForCommander(-1),team:populationUsedFor(0)};
      reset();AI.bases=bases([3]);AI.base=AI.bases[0];const S3=AI.bases[0];
      const slot3={index:popCmdIndex(3),hero:spawnUnit(hero,1,S3.x,S3.y,3)};slot3.ordinary=spawnUnit(ordinary,1,S3.x,S3.y,3);slot3.used=populationUsedForCommander(3);slot3.teamUsed=populationUsedFor(1);

      reset();AI.bases=bases([0,1,2]);AI.base=AI.bases[0];const RP=AI.bases[0],beforeHeroes=fill(1,0,600,RP),blockedOrdinary=populationCanSpawn(ordinary,1,0,RP.x,RP.y);
      const restoredHeroes=AI.bases.map(B=>spawnUnit(hero,1,B.x,B.y,B.slot)),usedAfterHeroes=populationUsedFor(1);killUnit(restoredHeroes[1],true);
      const afterDeath={used:populationUsedFor(1),ordinaryAllowed:populationCanSpawn(ordinary,1,1,RP.x,RP.y),heroAllowed:populationCanSpawn(hero,1,1,RP.x,RP.y)};
      afterDeath.heroRespawn=spawnUnit(hero,1,RP.x,RP.y,1);afterDeath.usedAfterRespawn=populationUsedFor(1);
      const reservations={ordinaryBeforeHeroes:beforeHeroes.length,blockedOrdinary,restoredHeroes,usedAfterHeroes,afterDeath};

      reset();const CP=point(.34,.54);AI.bases=[{slot:0,x:MAP*.7,y:MAP*.7,mass:100,energy:100}];AI.base=AI.bases[0];
      const cargoHero=spawnUnit(hero,0,CP[0],CP[1],-1),passenger={team:0,cmd:-1,type:ordinary},holdIndex=unitHigh+1;
      mfAirliftHolds[holdIndex]={cargo:[passenger]};mfAirliftPopHold(passenger,true);
      const cargoBeforeRecount={faction:populationUsedFor(0),seat:populationUsedForCommander(-1)};populationRecountLedgers();
      const cargoAfterRecount={faction:populationUsedFor(0),seat:populationUsedForCommander(-1)};mfAirliftHolds[holdIndex]=null;mfAirliftPopHold(passenger,false);
      const cargoAfterRelease={faction:populationUsedFor(0),seat:populationUsedForCommander(-1)};
      return {repetition,seed:SEED,constant:FACTION_POP_CAP,sameFaction1v3,factory,independentFactions,invalidSlots,slot3,reservations,cargoRecount:{cargoHero,cargoBeforeRecount,cargoAfterRecount,cargoAfterRelease}};
    };return [run(1),run(2)];
  });
  for(const row of repetitions){const {repetition:ignored,...payload}=row;void ignored;row.repeatSha256=sha256(JSON.stringify(payload));}
  const first=repetitions[0],second=repetitions[1];
  const checks={
    constantIs500:first.constant===500,
    sameFaction1v3StopsAt500:first.sameFaction1v3.heroes.every(id=>id>=0)&&first.sameFaction1v3.ordinaryAccepted===497&&first.sameFaction1v3.used===500&&first.sameFaction1v3.cap===500&&first.sameFaction1v3.ceiling===500&&first.sameFaction1v3.furtherBySeat.every(v=>!v),
    everyTypeRejectedAtFactionCap:first.sameFaction1v3.fullTypes.length>0&&first.sameFaction1v3.fullTypes.every(r=>!r.allowed&&r.spawned<0),
    opposingFactionsIndependent:first.independentFactions.player.used===500&&first.independentFactions.enemy.used===500&&first.independentFactions.player.cap===500&&first.independentFactions.enemy.cap===500&&first.independentFactions.playerOrdinary===499&&first.independentFactions.enemyOrdinary===499,
    hudReadsFactionWide500:first.independentFactions.hud.used===500&&first.independentFactions.hud.cap===500,
    invalidSlotRejectedWithoutAlias:first.invalidSlots.index99===-1&&first.invalidSlots.resolved99===-2&&!first.invalidSlots.allowed99&&first.invalidSlots.spawned99<0&&first.invalidSlots.before.player===first.invalidSlots.after.player&&first.invalidSlots.before.team===first.invalidSlots.after.team,
    futureAiSlot3Works:first.slot3.index===4&&first.slot3.hero>=0&&first.slot3.ordinary>=0&&first.slot3.used===2&&first.slot3.teamUsed===2,
    allCommanderRespawnsReserved:first.reservations.ordinaryBeforeHeroes===497&&!first.reservations.blockedOrdinary&&first.reservations.restoredHeroes.every(id=>id>=0)&&first.reservations.usedAfterHeroes===500&&first.reservations.afterDeath.used===499&&!first.reservations.afterDeath.ordinaryAllowed&&first.reservations.afterDeath.heroAllowed&&first.reservations.afterDeath.heroRespawn>=0&&first.reservations.afterDeath.usedAfterRespawn===500,
    cargoCountsAcrossRecount:first.cargoRecount.cargoBeforeRecount.faction===2&&first.cargoRecount.cargoBeforeRecount.seat===2&&first.cargoRecount.cargoAfterRecount.faction===2&&first.cargoRecount.cargoAfterRecount.seat===2&&first.cargoRecount.cargoAfterRelease.faction===1&&first.cargoRecount.cargoAfterRelease.seat===1,
    factoryPausesBeforePayment:first.factory.before.used===500&&first.factory.after.used===500&&first.factory.queueRetained&&first.factory.before.mass===first.factory.after.mass&&first.factory.before.energy===first.factory.after.energy&&first.factory.after.prodT<=first.factory.before.prodT,
    deterministicRepeat:first.repeatSha256===second.repeatSha256};
  const endSource=await provenance(),served=await servedHashes(server.url),servedMismatch=served.filter(f=>!localByPath[f.path]||localByPath[f.path].sha256!==f.sha256||f.status!==200);
  Object.assign(checks,{headStable:startSource.head===endSource.head,sourceSetStable:startSource.sourceSetSha256===endSource.sourceSetSha256,servedSourcesMatchLocal:!servedMismatch.length,noRuntimeErrors:!runtimeErrors.length});
  const pass=Object.values(checks).every(Boolean),report={schema:'MassfrontFactionPopulationProbeV4',startedUtc,finishedUtc:new Date().toISOString(),result:pass?'PASS':'FAIL',provenance:{start:startSource,end:endSource,sourceLines:lines},runtime:{url:server.url,port:server.port,gpu,blockedExternalCount:blockedExternal.length},servedSources:served,servedMismatch,runtimeErrors,consoleErrors,repetitions,checks,interpretation:{scope:'500 per combat-side faction, shared across commander seats',reservation:'One slot per absent expected commander',saveCompatibility:'No serialized field changed; transient ledgers recount existing unit/team/commander data.'}};
  await writeFile(join(output,'report.json'),`${JSON.stringify(report,null,2)}\n`);
  const md=['# MASSFRONT faction population admission probe','',`- Result: **${report.result}**`,`- HEAD: \`${startSource.head}\``,`- Source-set SHA-256: \`${startSource.sourceSetSha256}\``,`- GPU: ${gpu.renderer} (${gpu.vendor})`,'','## Measured','',`- Same-faction 1v3: heroes=${first.sameFaction1v3.heroes.length}, ordinary=${first.sameFaction1v3.ordinaryAccepted}, total=${first.sameFaction1v3.used}/${first.sameFaction1v3.cap}, seats=${first.sameFaction1v3.seatUsed.join('/')}`,`- Independent factions: player=${first.independentFactions.player.used}/500, enemy=${first.independentFactions.enemy.used}/500`,`- Missing commanders: ordinary=${first.reservations.ordinaryBeforeHeroes}, restored heroes=${first.reservations.restoredHeroes.length}, total=${first.reservations.usedAfterHeroes}`,`- Invalid slot 99: index=${first.invalidSlots.index99}, resolved=${first.invalidSlots.resolved99}, spawned=${first.invalidSlots.spawned99}`,`- Future slot 3: index=${first.slot3.index}, used=${first.slot3.used}`,`- Cargo faction count before/recount/release: ${first.cargoRecount.cargoBeforeRecount.faction}/${first.cargoRecount.cargoAfterRecount.faction}/${first.cargoRecount.cargoAfterRelease.faction}`,`- Factory mass before/after: ${first.factory.before.mass}/${first.factory.after.mass}; queue retained=${first.factory.queueRetained}`,`- Repeat hashes: \`${first.repeatSha256}\` / \`${second.repeatSha256}\``,'','## Checks','',...Object.entries(checks).map(([n,v])=>`- ${v?'PASS':'FAIL'} — ${n}`),'','## Source anchors','',...Object.entries(lines).map(([n,v])=>`- ${n}: ${v}`)].join('\n');
  await writeFile(join(output,'report.md'),`${md}\n`);
  console.log(JSON.stringify({output,result:report.result,measured:{sameFaction1v3:first.sameFaction1v3,independentFactions:first.independentFactions,invalidSlots:first.invalidSlots,slot3:first.slot3,reservations:first.reservations,cargoRecount:first.cargoRecount,factory:first.factory},checks},null,2));
  if(!pass)process.exitCode=1;
}finally{if(page)await boundedClose(page.close().catch(()=>{}));await boundedClose(server.close().catch(()=>{}));await boundedClose(closePwBrowser().catch(()=>{}));}
setTimeout(()=>process.exit(process.exitCode||0),25).unref();
