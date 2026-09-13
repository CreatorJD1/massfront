#!/usr/bin/env node
/* Current-source intelligence/artillery audit.
   This is intentionally a readiness probe, not a renderer demo: it exercises
   the live radar stamp and player barrage entry point, then reports missing
   contact semantics as missing instead of manufacturing a passing mock. */
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { startStaticServer } from './perf-lab/perf-probe-runner.mjs';

const execFile=promisify(execFileCallback);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const startedUtc=new Date().toISOString();
const output=join(root,'.tmp','intel-artillery','runs',startedUtc.replace(/[:.]/g,'-'));
const sourceFiles=['src/intel.js','src/game/commander.js','src/game/sim.js','src/ui/hud.js','src/ui/input.js',
  'boot.js','assets/data/manifest.json','tools/probe-intel-artillery.mjs'];
await mkdir(output,{recursive:true});

const sha256=value=>createHash('sha256').update(value).digest('hex');
async function git(args){return (await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})).stdout.trimEnd();}
async function sourceSnapshot(){
  const files=[];
  for(const path of sourceFiles){const bytes=await readFile(join(root,path));files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  const [head,status]=await Promise.all([git(['rev-parse','HEAD']),git(['status','--porcelain=v1','--untracked-files=all'])]);
  return {head,dirty:!!status,dirtyFingerprint:sha256(status),sourceSetSha256:sha256(files.map(f=>`${f.path}:${f.sha256}`).join('\n')),files};
}
function lineOf(text,pattern){const lines=text.split(/\r?\n/),i=lines.findIndex(line=>pattern.test(line));return i<0?null:i+1;}

const texts={};for(const path of sourceFiles.filter(path=>path.endsWith('.js')))texts[path]=await readFile(join(root,path),'utf8');
const combined=Object.values(texts).join('\n');
const anchors={
  radarGrid:lineOf(texts['src/intel.js'],/^const fogRadar=/),
  radarContact:lineOf(texts['src/intel.js'],/^function intelRadarContact/),
  radarStamp:lineOf(texts['src/intel.js'],/^function intelStampSensors/),
  barragePattern:lineOf(texts['src/game/commander.js'],/^function artBarragePattern/),
  barrageEntry:lineOf(texts['src/game/commander.js'],/^function beginArtilleryBarrage/),
  barrageLaunch:lineOf(texts['src/game/commander.js'],/^function artBarrageLaunch/),
};
const staticAudit={
  persistentContactSchema:/\bIntelContact\b|\bintelContacts\b/.test(combined),
  lastKnownRecord:/return \{team:C\.team,target:C\.target,generation:C\.generation,x:C\.x,y:C\.y/.test(texts['src/intel.js'])&&
    /age:C\.age,timestamp:C\.timestamp/.test(texts['src/intel.js']),
  confidenceField:/\bcontactConfidence\b|\bconfidence\s*[:=]/i.test(texts['src/intel.js']+'\n'+texts['src/game/commander.js']),
  artilleryAuthority:/^function intelArtillerySolution/m.test(texts['src/intel.js'])&&
    /^function intelArtilleryScatterPoint/m.test(texts['src/intel.js']),
  radarResolverInBarrage:/beginArtilleryBarrageContact/.test(texts['src/game/commander.js'])&&/radar/i.test(texts['src/game/commander.js'].slice(
    texts['src/game/commander.js'].indexOf('function beginArtilleryBarrage'),texts['src/game/commander.js'].indexOf('function artBarrageReset'))),
  visibilityResolverInBarrage:/covAt|fogEntityVisible|fogGameplayActive|fogRadar/i.test(texts['src/game/commander.js'].slice(
    texts['src/game/commander.js'].indexOf('function beginArtilleryBarrage'),texts['src/game/commander.js'].indexOf('function artBarrageReset'))),
  fixedAuthoredScatter:/ART_BARRAGE_OFF/.test(texts['src/game/commander.js']),
};

const startSource=await sourceSnapshot();
const runtimeErrors=[],consoleErrors=[];
const server=await startStaticServer();
const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
let page,runtime=null,gpu=null;
try{
  page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1,colorScheme:'dark'});
  page.on('pageerror',error=>runtimeErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:90000});
  gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof intelStampSensors==='function'
    &&typeof intelRadarContact==='function'&&typeof beginArtilleryBarrage==='function'
    &&typeof artBarrageTick==='function'&&typeof spawnUnit==='function',null,{timeout:120000});
  runtime=await page.evaluate(()=>{
    const round=n=>+Number(n).toFixed(5), DT=1/30;
    resetWorld();matchLive=true;running=false;paused=false;gameEnded=false;fogOn=true;
    fogCov.fill(0);fogSeen.fill(0);fogRadar.fill(0);fogDetect.fill(0);
    const rx=MAP*.20,ry=MAP*.20;
    addBld('uplink',0,rx,ry,true);
    const groundType=Math.max(0,TYPES.findIndex(T=>T&&!T.air&&!T.naval&&T.spd>0));
    const radarPoint=findLand(rx+MAP/FN*16,ry);
    const radarTarget=spawnUnit(groundType,1,radarPoint[0],radarPoint[1],0);
    fogCov.fill(0);intelStampSensors();
    const radar={atSource:intelRadarContact(rx,ry),farAway:intelRadarContact(MAP*.82,MAP*.82),
      sourceCell:fogRadar[intelCell(rx,ry)],farCell:fogRadar[intelCell(MAP*.82,MAP*.82)],
      contact:intelContactGet(0,radarTarget,ugen[radarTarget])};

    const hasAuthority=typeof intelArtillerySolution==='function'&&typeof intelArtilleryScatterRadius==='function'&&
      typeof intelArtilleryScatterPoint==='function';
    let authority=null;
    if(hasAuthority){
      const radarSolution=intelArtillerySolution(0,{target:radarTarget,generation:ugen[radarTarget]},0);
      intelContactUpdate(0,radarTarget,'visual',1,10,ux[radarTarget],uy[radarTarget],ugen[radarTarget],0);
      const visibleSolution=intelArtillerySolution(0,{target:radarTarget,generation:ugen[radarTarget]},0);
      stats.t=4;intelContactTick(4);
      const staleSolution=intelArtillerySolution(0,{target:radarTarget,generation:ugen[radarTarget]},4);
      const playerSolution=intelArtillerySolution(0,{source:'player',x:rx+120,y:ry+80},4);
      const missing=intelArtillerySolution(0,{target:MAXU-1,generation:77},4);
      const visibleScatter=intelArtilleryScatterRadius(visibleSolution,104);
      const staleScatter=intelArtilleryScatterRadius(staleSolution,104);
      const radarScatter=intelArtilleryScatterRadius(radarSolution,104);
      const pointA=intelArtilleryScatterPoint(staleSolution,104,3,0x1234);
      const pointB=intelArtilleryScatterPoint(staleSolution,104,3,0x1234);
      authority={radarSolution,visibleSolution,staleSolution,playerSolution,missing,
        scatter:{visible:round(visibleScatter),radar:round(radarScatter),stale:round(staleScatter),
          pointA:{x:round(pointA.x),y:round(pointA.y)},pointB:{x:round(pointB.x),y:round(pointB.y)},
          deterministic:pointA.x===pointB.x&&pointA.y===pointB.y}};
    }

    const sx=MAP*.34,sy=MAP*.42,tx=sx+500,ty=sy;
    const artillery=spawnUnit(3,0,sx,sy,-1);
    if(artillery<0)throw new Error('artillery spawn refused');
    usel[artillery]=1;META.res=META.res||{};META.res.firemission=true;
    resE[0]=Math.max(resE[0],ART_BARRAGE.energy+100);
    updateFog();
    const targetVisibleBefore=covAt(tx,ty)>0;
    const p1=artBarragePattern(tx,ty),p2=artBarragePattern(tx,ty);
    const accepted=beginArtilleryBarrageContact(radarTarget,ugen[radarTarget]);
    const chargeTarget=artBarrageCharge?{x:round(artBarrageCharge.x),y:round(artBarrageCharge.y),
      intelSource:artBarrageCharge.intelSource,intelConfidence:round(artBarrageCharge.intelConfidence)}:null;
    const observedShells={};
    for(let step=0;step<220;step++){
      tick++;stats.t+=DT;artBarrageTick(DT);
      for(let i=0;i<pHigh;i++)if(palive[i]&&pBarrage[i]&&!observedShells[i]){
        observedShells[i]={slot:i,x:round(px[i]),y:round(py[i]),endX:round(pex[i]),endY:round(pey[i]),arc:round(pArc[i])};
      }
    }
    const shells=Object.values(observedShells);
    return {radar,authority,artillery:{accepted,targetVisibleBefore,chargeTarget,patternStable:JSON.stringify(p1)===JSON.stringify(p2),
      pattern:p1.map(P=>({x:round(P.x),y:round(P.y)})),shellCount:shells.length,shells},
      capabilities:{intelRadarContact:typeof intelRadarContact==='function',intelStampSensors:typeof intelStampSensors==='function',
        artBarragePattern:typeof artBarragePattern==='function',beginArtilleryBarrage:typeof beginArtilleryBarrage==='function',
        intelArtilleryAuthority:hasAuthority}};
  });
}finally{
  if(page)await page.close().catch(()=>{});
  await closePwBrowser().catch(()=>{});await server.close().catch(()=>{});
}
const endSource=await sourceSnapshot();
const featureStatus={
  persistentIntelContacts:staticAudit.persistentContactSchema?'implemented':'missing',
  lastKnownPositions:staticAudit.lastKnownRecord?'implemented':'missing',
  liveRadarMinimap:runtime?.radar?.atSource&&!runtime?.radar?.farAway?'implemented':'partial',
  playerDesignatedGroundBarrage:runtime?.authority?.playerSolution?.eligible&&runtime?.capabilities?.beginArtilleryBarrage?'implemented':'missing',
  visibleContactEligibility:runtime?.authority?.visibleSolution?.eligible&&staticAudit.radarResolverInBarrage?'implemented':'missing',
  radarContactEligibility:runtime?.authority?.radarSolution?.eligible&&runtime?.authority?.radarSolution?.source==='radar'&&staticAudit.radarResolverInBarrage?'implemented':'missing',
  staleContactEligibility:runtime?.authority?.staleSolution?.eligible&&runtime?.authority?.staleSolution?.age>0&&staticAudit.radarResolverInBarrage?'implemented':'missing',
  playerDesignationEligibility:runtime?.authority?.playerSolution?.eligible&&runtime?.authority?.playerSolution?.source==='player'?'implemented':'missing',
  radarDesignatedBarrage:runtime?.artillery?.accepted&&runtime?.artillery?.chargeTarget?.intelSource==='radar'?'implemented':'missing',
  confidenceBasedScatter:runtime?.authority?.scatter?.deterministic&&
    runtime.authority.scatter.stale>runtime.authority.scatter.visible?'implemented':staticAudit.confidenceField?'partial':'missing',
  deterministicAuthoredPattern:runtime?.artillery?.patternStable?'implemented':'untestable',
};
const complete=Object.values(featureStatus).every(status=>status==='implemented');
const report={schema:'MassfrontIntelArtilleryAuditV1',startedUtc,finishedUtc:new Date().toISOString(),
  result:complete?'IMPLEMENTED':'PARTIAL',featureStatus,staticAudit,runtime,anchors,gpu,runtimeErrors,consoleErrors,
  provenance:{start:startSource,end:endSource,headStable:startSource.head===endSource.head,
    sourceSetStable:startSource.sourceSetSha256===endSource.sourceSetSha256}};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(output,'report.md'),[
  '# MASSFRONT intelligence and artillery audit','',`- Readiness: **${report.result}**`,`- HEAD: \`${startSource.head}\``,
  `- Source set: \`${startSource.sourceSetSha256}\``,`- GPU: ${gpu?.renderer||'UNKNOWN'}`,'','## Feature status','',
  ...Object.entries(featureStatus).map(([name,status])=>`- ${status.toUpperCase()} — ${name}`),'','## Runtime','',
  `- Radar source/far: ${runtime?.radar?.atSource} / ${runtime?.radar?.farAway}`,
  `- Unseen ground barrage accepted: ${runtime?.artillery?.accepted&&!runtime?.artillery?.targetVisibleBefore}`,
  `- Authored pattern stable: ${runtime?.artillery?.patternStable}; launched shells: ${runtime?.artillery?.shellCount}`,'',
  'Missing contact records, last-known positions, radar designation, and confidence scatter are readiness failures, not skipped passes.',''
].join('\n'));
console.log(JSON.stringify({output,result:report.result,featureStatus,runtime,anchors},null,2));
process.exit(complete?0:2);
