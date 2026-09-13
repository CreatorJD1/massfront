#!/usr/bin/env node
/* Current-source utility-unit audit.
   Exercises the real support/miner/guard paths, while explicitly rejecting the
   local proximity behaviors as proof of a deterministic claimed job board. */
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
const output=join(root,'.tmp','utility-jobs','runs',startedUtc.replace(/[:.]/g,'-'));
const sourceFiles=['src/game/utilityjobs.js','src/game/sim.js','src/game/ai.js','src/ui/input.js','src/ui/hotslots.js',
  'boot.js','assets/data/manifest.json','tools/probe-utility-jobs.mjs'];
await mkdir(output,{recursive:true});
const sha256=value=>createHash('sha256').update(value).digest('hex');
async function git(args){return (await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})).stdout.trimEnd();}
async function snapshot(){
  const files=[];for(const path of sourceFiles){const bytes=await readFile(join(root,path));files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  const [head,status]=await Promise.all([git(['rev-parse','HEAD']),git(['status','--porcelain=v1','--untracked-files=all'])]);
  return {head,dirty:!!status,dirtyFingerprint:sha256(status),sourceSetSha256:sha256(files.map(f=>`${f.path}:${f.sha256}`).join('\n')),files};
}
function lineOf(text,pattern){const lines=text.split(/\r?\n/),i=lines.findIndex(line=>pattern.test(line));return i<0?null:i+1;}
const texts={};for(const path of sourceFiles.filter(path=>path.endsWith('.js')))texts[path]=await readFile(join(root,path),'utf8');
const utility=texts['src/game/utilityjobs.js'],sim=texts['src/game/sim.js'],ai=texts['src/game/ai.js'],
  consumers=sim+'\n'+ai+'\n'+texts['src/ui/input.js'];
const anchors={guardSteer:lineOf(sim,/^function guardSteer/),reclaimTick:lineOf(sim,/^function reclaimTick/),
  redirectProspector:lineOf(sim,/^function redirectProspector/),assist:lineOf(sim,/^function prospectorAssistTick/),
  survey:lineOf(sim,/^function prospectorSurveyTick/),miner:lineOf(sim,/^function minerUnitTick/),
  supportBlock:lineOf(sim,/SUPPORT UNITS: Warden field medic/),orderGuard:lineOf(texts['src/ui/input.js'],/^function orderGuard/)};
const staticAudit={
  jobBoardModule:/mfUtilityJobBoardCreate/.test(utility),
  stableClaimAuthority:/mfUtilityJobClaim/.test(utility)&&/mfUtilityJobRenew/.test(utility)&&/defaultLeaseTicks/.test(utility),
  jobBoardIntegrated:/mfUtilityJob(?:BoardCreate|Publish|Claim|Renew)/.test(consumers),
  genericReturnJob:/\bRETURN(?:_TO_BASE)?\b|\breturnJob\b/i.test(consumers),
  repairPath:/WARDEN — heals units/.test(sim)&&/CONSTRUCTOR — repairs structures/.test(sim),
  assistPath:/^function prospectorAssistTick/m.test(sim),surveyPath:/^function prospectorSurveyTick/m.test(sim),
  miningPath:/^function minerUnitTick/m.test(sim),salvageProximity:/dedicated engineer should be the obvious salvage tool/.test(sim),
  escortPath:/^function guardSteer/m.test(sim)&&/^function orderGuard/m.test(texts['src/ui/input.js']),
  aiUtilityPlanner:/^function aiUtilityJobsTick/m.test(ai)&&/mfUtilityPlannerTick/.test(ai),
};

const startSource=await snapshot(),runtimeErrors=[],consoleErrors=[];
const server=await startStaticServer();const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
let page,runtime=null,gpu=null;
try{
  page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1,colorScheme:'dark'});
  page.on('pageerror',error=>runtimeErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.addInitScript(()=>{try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch{}});
  await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:90000});gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof prospectorAssistTick==='function'
    &&typeof prospectorSurveyTick==='function'&&typeof minerUnitTick==='function'
    &&typeof reclaimTick==='function'&&typeof orderGuard==='function'
    &&typeof mfUtilityJobBoardCreate==='function',null,{timeout:120000});
  runtime=await page.evaluate(()=>{
    const DT=1/30,round=n=>+Number(n).toFixed(5);
    resetWorld();terrainTex=buildTerrain(curTheme);matchLive=true;running=false;paused=false;gameEnded=false;fogOn=false;srand(0x5554494c);
    const warden=spawnUnit(24,0,520,500,-1),patient=spawnUnit(0,0,535,500,-1);
    uhp[patient]=uhpm[patient]*.5;ustomp[warden]=0;const patientBefore=uhp[patient];unitTick(DT);
    const healing={before:round(patientBefore),after:round(uhp[patient]),worked:uhp[patient]>patientBefore};

    const structure=addBld('pgen',0,720,700,true);structure.hp=structure.hpm*.5;refreshBldLive();
    const engineer=spawnUnit(19,0,735,700,-1);ustomp[engineer]=0;const structureBefore=structure.hp;
    mfUtilityPlanAt=-1;tick+=MF_UTILITY_PLAN_PERIOD;unitTick(DT);
    const repair={before:round(structureBefore),after:round(structure.hp),worked:structure.hp>structureBefore};

    const factory=addBld('fac',0,950,850,true),assistant=spawnUnit(32,0,970,850,-1);
    umode[assistant]=6;const assistWorked=prospectorAssistTick(assistant,DT);
    const assist={worked:assistWorked,tractorT:round(factory.tractorT||0),tractorN:factory.tractorN||0};

    let surveyIndex=-1;for(let d=0;d<deposits.length;d++)if(depositTier(deposits[d])>0){surveyIndex=d;break;}
    let survey={worked:false,available:surveyIndex>=0};
    let mining={worked:false,available:surveyIndex>=0};
    if(surveyIndex>=0){
      const D=deposits[surveyIndex],surveyor=spawnUnit(32,0,D.x+45,D.y,-1);uMineNode[surveyor]=surveyIndex;umode[surveyor]=7;
      const prior=D.surveyed||0;const worked=prospectorSurveyTick(surveyor,DT);
      survey={worked:!!worked,before:prior,after:D.surveyed||0,node:surveyIndex};
      const miner=spawnUnit(32,0,D.x+10,D.y,-1);uMineNode[miner]=surveyIndex;umode[miner]=0;uMineT[miner]=0;
      const beforeAmount=D.remaining;const mineWorked=minerUnitTick(miner,DT);
      mining={worked:!!mineWorked&&D.remaining<beforeAmount,before:round(beforeAmount),after:round(D.remaining),node:surveyIndex};
    }

    const farEngineer=spawnUnit(19,0,1200,1200,-1);addWreck(1560,1200,40,10,0,1,'nova');
    const farWreck=wrecks[wrecks.length-1],farBefore=farWreck.mass,oldTarget=[utx[farEngineer],uty[farEngineer]];
    for(let n=0;n<90;n++){tick++;stats.t+=DT;unitTick(DT);reclaimTick(DT);}
    const autonomousSalvage={worked:farWreck.mass<farBefore||utx[farEngineer]!==oldTarget[0]||uty[farEngineer]!==oldTarget[1],
      massBefore:round(farBefore),massAfter:round(farWreck.mass),targetChanged:utx[farEngineer]!==oldTarget[0]||uty[farEngineer]!==oldTarget[1]};
    const nearEngineer=spawnUnit(19,0,farWreck.x+2,farWreck.y,-1),nearBefore=farWreck.mass;reclaimTick(1);
    const proximitySalvage={worked:farWreck.mass<nearBefore,before:round(nearBefore),after:round(farWreck.mass),engineer:nearEngineer};

    const anchor=spawnUnit(2,0,1900,1700,-1),escort=spawnUnit(0,0,1850,1700,-1);usel.fill(0);usel[escort]=1;
    const guardAccepted=orderGuard(anchor,true);unitTick(DT);
    const escorting={worked:guardAccepted&&ustate[escort]===7&&uGuard[escort]===anchor,state:ustate[escort],guard:uGuard[escort]};

    const deterministicRedirect=()=>{
      resetWorld();terrainTex=buildTerrain(curTheme);matchLive=true;running=false;fogOn=false;srand(0x13579);
      const h=addBld('hq',0,900,900,true),p=spawnUnit(32,0,1100,900,-1);
      for(const D of deposits){D.tier=0;D.remaining=0;D.depleted=true;}
      const ok=redirectProspector(p);return {ok,mode:umode[p],x:round(utx[p]),y:round(uty[p]),hq:[h.x,h.y]};
    };
    const redirectA=deterministicRedirect(),redirectB=deterministicRedirect();
    return {healing,repair,assist,survey,mining,autonomousSalvage,proximitySalvage,escorting,
      utilitySnapshot:mfUtilityRuntimeSnapshot(),
      fallbackReturn:{first:redirectA,second:redirectB,deterministic:JSON.stringify(redirectA)===JSON.stringify(redirectB)}};
  });
}finally{if(page)await page.close().catch(()=>{});await closePwBrowser().catch(()=>{});await server.close().catch(()=>{});}
const endSource=await snapshot();
const featureStatus={
  repairUnitsAndStructures:runtime?.healing?.worked&&runtime?.repair?.worked?'implemented':'partial',
  productionConstructionAssist:runtime?.assist?.worked?'implemented':'partial',
  salvage:runtime?.proximitySalvage?.worked&&runtime?.autonomousSalvage?.worked?'implemented':'partial',
  mining:runtime?.mining?.worked?'implemented':runtime?.mining?.available?'partial':'untestable',
  survey:runtime?.survey?.worked?'implemented':runtime?.survey?.available?'partial':'untestable',
  escort:runtime?.escorting?.worked?'implemented':'partial',
  returnToWorkOrBase:runtime?.fallbackReturn?.first?.ok&&runtime?.fallbackReturn?.deterministic?'implemented':'missing',
  deterministicClaimedJobBoard:staticAudit.jobBoardIntegrated?'implemented':
    staticAudit.jobBoardModule&&staticAudit.stableClaimAuthority?'authority-only':'missing',
  aiUtilityPlanner:staticAudit.aiUtilityPlanner&&runtime?.utilitySnapshot?.planner?.samples>0?'implemented':'missing',
};
const complete=Object.values(featureStatus).every(status=>status==='implemented');
const report={schema:'MassfrontUtilityJobsAuditV1',startedUtc,finishedUtc:new Date().toISOString(),result:complete?'IMPLEMENTED':'PARTIAL',
  featureStatus,staticAudit,runtime,anchors,gpu,runtimeErrors,consoleErrors,provenance:{start:startSource,end:endSource,
    headStable:startSource.head===endSource.head,sourceSetStable:startSource.sourceSetSha256===endSource.sourceSetSha256}};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(output,'report.md'),['# MASSFRONT utility jobs audit','',`- Readiness: **${report.result}**`,
  `- HEAD: \`${startSource.head}\``,`- Source set: \`${startSource.sourceSetSha256}\``,`- GPU: ${gpu?.renderer||'UNKNOWN'}`,'',
  '## Feature status','',...Object.entries(featureStatus).map(([name,status])=>`- ${status.toUpperCase()} — ${name}`),'',
  'Local repair, mining, survey, assist, proximity salvage and player-issued guard behavior do not constitute a claimed utility job board.',''
].join('\n'));
console.log(JSON.stringify({output,result:report.result,featureStatus,runtime,anchors},null,2));
process.exit(complete?0:2);
