#!/usr/bin/env node
/* Focused fixed-step proof for the live utility-job integration. The board-only
   probe proves policy; this probe proves real Constructors, Wardens and
   Prospectors claim and execute jobs through sim.js on the hardware renderer. */
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
const output=join(root,'.tmp','utility-job-integration',startedUtc.replace(/[:.]/g,'-'));
const sourceFiles=['src/game/utilityjobs.js','src/game/sim.js','src/game/ai.js','src/session.js','tools/probe-live-utility-jobs.mjs'];
const sha256=value=>createHash('sha256').update(value).digest('hex');
await mkdir(output,{recursive:true});
async function git(args){return (await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})).stdout.trimEnd();}
async function fingerprint(){
  const files=[];for(const path of sourceFiles){const bytes=await readFile(join(root,path));files.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  const [head,status]=await Promise.all([git(['rev-parse','HEAD']),git(['status','--porcelain=v1','--untracked-files=all'])]);
  return {head,dirty:!!status,dirtyFingerprint:sha256(status),sourceSetSha256:sha256(files.map(f=>`${f.path}:${f.sha256}`).join('\n')),files};
}

const sourceStart=await fingerprint(),runtimeErrors=[],consoleErrors=[];
const sessionSource=await readFile(join(root,'src/session.js'),'utf8');
/* Session recovery deliberately round-trips ustate while the utility lease and
   board remain runtime-only. A restored state-6 Constructor must therefore be
   normalized and replanned by sim.js instead of requiring a schema bump. */
const sessionCompatibilityFixture=/out\.st\.push\(ustate\[i\]\)/.test(sessionSource)&&
  /ustate\[i\]=U\.st\[k\]/.test(sessionSource)&&
  !/uUtility(?:Job|Auto|Goal|Boards)/.test(sessionSource);
const server=await startStaticServer(),browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
let page,gpu,runtime;
try{
  page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1,colorScheme:'dark'});
  page.on('pageerror',error=>runtimeErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.addInitScript(()=>{try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch{}});
  await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:90000});gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof mfUtilityRuntimeSnapshot==='function'
    &&typeof mfUtilityPlannerTick==='function'&&typeof reclaimTick==='function'&&typeof unitTick==='function',null,{timeout:120000});
  runtime=await page.evaluate(()=>{
    const DT=1/30,round=n=>+Number(n).toFixed(5);
    function reset(seed){
      resetWorld();terrainTex=buildTerrain(curTheme);matchLive=true;running=false;paused=false;gameEnded=false;fogOn=false;srand(seed);
    }
    function step(count,{reclaim=false,build=false}={}){
      for(let n=0;n<count;n++){stats.t+=DT;unitTick(DT);if(build)bldTick(DT);if(reclaim)reclaimTick(DT);}
    }
    function board(team,role){return mfUtilityRuntimeSnapshot().boards.find(x=>x.team===team&&x.role===role).snapshot;}
    function kindClaims(team,role,kind){
      const B=board(team,role),ids=new Set(B.jobs.filter(j=>j.kind===kind).map(j=>j.id));
      return B.claims.filter(c=>ids.has(c.jobId));
    }
    function canonicalAssignment(i){
      const S=mfUtilityRuntimeSnapshot(),A=S.assignments.find(x=>x.i===i),jobs=[];
      for(const B of S.boards)for(const J of B.snapshot.jobs)jobs.push(J);
      const J=A&&jobs.find(j=>j.id===A.jobId);
      return {assigned:!!A,kind:J&&J.kind||null,state:(A&&A.state)??ustate[i],
        x:round(ux[i]),y:round(uy[i]),tx:round(utx[i]),ty:round(uty[i])};
    }

    reset(0x554a4f42);
    const salvageWorker=spawnUnit(UT_ENGINEER,0,1200,1200,-1);addWreck(1460,1200,40,10,WRECK_SCRAP,1,'nova');
    const salvageWreck=wrecks[wrecks.length-1],salvageBankBefore=resM[0],salvageMassBefore=salvageWreck.mass;
    step(1,{reclaim:true});const salvageFirst=canonicalAssignment(salvageWorker);
    step(719,{reclaim:true});
    const salvageMassAfter=wrecks.indexOf(salvageWreck)>=0?salvageWreck.mass:0;
    const salvage={worker:salvageWorker,massBefore:round(salvageMassBefore),massAfter:round(salvageMassAfter),
      bankBefore:round(salvageBankBefore),bankAfter:round(resM[0]),first:salvageFirst,
      worked:salvageMassAfter<salvageMassBefore&&resM[0]>salvageBankBefore};

    reset(0x52455052);
    const medic=spawnUnit(24,0,1120,1320,-1),patient=spawnUnit(0,0,1320,1320,-1);
    uhp[patient]=uhpm[patient]*.25;const hpBefore=uhp[patient];step(1);const repairClaim=canonicalAssignment(medic);step(599);
    const repair={before:round(hpBefore),after:round(uhp[patient]),medic:canonicalAssignment(medic),worked:uhp[patient]>hpBefore};
    repair.claim=repairClaim;repair.worked=repair.worked&&repairClaim.kind===MF_UTILITY_JOB_KIND.REPAIR_UNIT;

    reset(0x42524550);
    const damagedBuilding=addBld('pgen',0,1390,1280,true),buildingEngineer=spawnUnit(UT_ENGINEER,0,1130,1280,-1);
    damagedBuilding.hp=damagedBuilding.hpm*.25;const buildingHpBefore=damagedBuilding.hp;step(600);
    const structureRepair={before:round(buildingHpBefore),after:round(damagedBuilding.hp),
      engineer:canonicalAssignment(buildingEngineer),worked:damagedBuilding.hp>buildingHpBefore};

    reset(0x41535354);
    const site=addBld('pgen',0,1560,1460,false),siteIndex=blds.indexOf(site),constructors=[];
    for(let n=0;n<3;n++)constructors.push(spawnUnit(UT_ENGINEER,0,1485+n*15,1460,-1));
    step(1);const constructionClaims=kindClaims(0,MF_UTILITY_ENGINEER,MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST);
    const construction={claims:constructionClaims.length,capacity:2,tractorN:round(site.tractorN||0),
      expectedDiminished:round(mfUtilityJobAssistTotal(2,.5)),
      assigned:constructors.map(c=>canonicalAssignment(c))};
    const recycled=constructors[0],oldGeneration=ugen[recycled];killUnit(recycled,true);
    const replacement=spawnUnit(UT_ENGINEER,0,1485,1460,-1),afterRecycle=board(0,MF_UTILITY_ENGINEER);
    construction.recycled={sameSlot:replacement===recycled,oldGeneration,newGeneration:ugen[replacement],
      oldClaimSurvives:afterRecycle.claims.some(c=>c.workerIdentity==='unit|'+recycled&&c.workerGeneration===oldGeneration)};
    site.alive=false;step(16);const afterTarget=board(0,MF_UTILITY_ENGINEER);
    construction.targetInvalidated=!afterTarget.jobs.some(j=>j.targetKind==='building-construction'&&Number(j.targetId)===siteIndex)
      &&!afterTarget.claims.some(c=>constructionClaims.some(old=>old.jobId===c.jobId));

    reset(0x50524f44);
    const factory=addBld('fac',0,1500,1500,true);factory.queue.push(0);const miners=[];
    for(let n=0;n<3;n++){const i=spawnUnit(UT_MINER,0,1435+n*16,1500,-1);umode[i]=6;miners.push(i);}
    step(31);const productionClaims=kindClaims(0,MF_UTILITY_MINER,MF_UTILITY_JOB_KIND.PRODUCTION_ASSIST);
    const production={claims:productionClaims.length,capacity:2,tractorN:round(factory.tractorN||0),
      expectedDiminished:round(mfUtilityJobAssistTotal(2,.5)),assigned:miners.map(c=>canonicalAssignment(c))};

    reset(0x52415354);
    const remoteSite=addBld('pgen',0,1500,1400,false);
    const localAssist=spawnUnit(UT_ENGINEER,0,1460,1400,-1),remoteAssist=spawnUnit(UT_ENGINEER,0,650,1400,-1);
    step(1);const remoteClaims=kindClaims(0,MF_UTILITY_ENGINEER,MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST);
    const remoteBoard=mfUtilityBoards[0][MF_UTILITY_ENGINEER],remoteJob=remoteBoard.jobs.get(uUtilityJob[localAssist]);
    const remoteTarget=mfUtilityTarget(remoteJob),activeContributors=mfUtilityActiveContributors(remoteBoard,remoteJob,remoteTarget);
    ustun[localAssist]=1;const stunnedContributors=mfUtilityActiveContributors(remoteBoard,remoteJob,remoteTarget);ustun[localAssist]=0;
    ustate[localAssist]=1;utx[localAssist]+=200;const manualContributors=mfUtilityActiveContributors(remoteBoard,remoteJob,remoteTarget);
    const remoteAssistProof={claims:remoteClaims.length,tractorN:round(remoteSite.tractorN||0),
      activeContributors,stunnedContributors,manualContributors,
      local:canonicalAssignment(localAssist),remote:canonicalAssignment(remoteAssist),
      worked:remoteClaims.length===2&&Math.abs((remoteSite.tractorN||0)-1)<.01&&ustate[remoteAssist]===1&&
        activeContributors===1&&stunnedContributors===0&&manualContributors===0};

    reset(0x53415645);
    const restoredSite=addBld('pgen',0,1500,1400,false),restoredWorker=spawnUnit(UT_ENGINEER,0,1460,1400,-1);
    step(1);const beforeRestore=canonicalAssignment(restoredWorker);
    uUtilityJob[restoredWorker]='';uUtilityAuto[restoredWorker]=0;ustate[restoredWorker]=6;
    mfUtilityBoards=null;mfUtilityPlanAt=-1;step(1);const afterRestore=canonicalAssignment(restoredWorker);
    const restoredState={before:beforeRestore,after:afterRestore,
      worked:beforeRestore.assigned&&afterRestore.assigned&&afterRestore.kind===MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST&&
        ustate[restoredWorker]===6&&restoredSite.alive};

    reset(0x53454c45);
    const selectedWorker=spawnUnit(UT_ENGINEER,0,1200,1200,-1);addWreck(1460,1200,40,0,WRECK_SCRAP,1,'nova');
    step(1);const selectionBefore=canonicalAssignment(selectedWorker);usel[selectedWorker]=1;step(16);
    const selectionAfter=canonicalAssignment(selectedWorker);usel[selectedWorker]=0;
    const selectionOnly={before:selectionBefore,after:selectionAfter,
      worked:selectionBefore.assigned&&selectionAfter.assigned&&selectionBefore.kind===selectionAfter.kind};

    reset(0x46415221);
    const remoteWorker=spawnUnit(UT_ENGINEER,0,420,420,-1),farPoint=findLand(3400,3400);
    addWreck(farPoint[0],farPoint[1],40,0,WRECK_SCRAP,1,'nova');step(31);
    const unreachable={worker:canonicalAssignment(remoteWorker),distance:round(Math.sqrt(dist2(ux[remoteWorker],uy[remoteWorker],farPoint[0],farPoint[1])))};
    unreachable.worked=!unreachable.worker.assigned&&unreachable.distance>1500;

    reset(0x49534c45);
    const savedPass=PASS,split=new Uint8Array(PGS*PGS),cellWorld=MAP/PGS;
    for(let y=40;y<48;y++)for(let x=40;x<48;x++)split[y*PGS+x]=1;
    for(let y=40;y<48;y++)for(let x=56;x<64;x++)split[y*PGS+x]=1;
    PASS=split;mfUtilityRouteComponentReset();
    const islandWorker=spawnUnit(UT_ENGINEER,0,43*cellWorld,43*cellWorld,-1);
    addWreck(59*cellWorld,43*cellWorld,40,0,WRECK_SCRAP,1,'nova');step(31);
    const disconnected={worker:canonicalAssignment(islandWorker),distance:round(Math.sqrt(dist2(ux[islandWorker],uy[islandWorker],59*cellWorld,43*cellWorld)))};
    disconnected.worked=!disconnected.worker.assigned&&disconnected.distance<1500;
    PASS=savedPass;mfUtilityRouteComponentReset();

    reset(0x5354414c);const stalledWorker=spawnUnit(UT_ENGINEER,0,1200,1200,-1);
    addWreck(1470,1200,40,0,WRECK_SCRAP,1,'nova');mfUtilityPlannerTick();mfUtilityUnitTick(stalledWorker,DT);
    const stalledBefore=canonicalAssignment(stalledWorker);
    for(let n=0;n<13;n++){tick+=15;mfUtilityPlannerTick();}
    const stalledAfter=canonicalAssignment(stalledWorker);
    const noProgress={before:stalledBefore,after:stalledAfter,retryAt:uUtilityRetryAt[stalledWorker],tick,
      worked:stalledBefore.assigned&&!stalledAfter.assigned&&uUtilityRetryAt[stalledWorker]>tick};

    reset(0x4d494e45);
    const mineNode=deposits.findIndex(D=>depositTier(D)>0),mineDeposit=deposits[mineNode];
    const miningWorker=spawnUnit(UT_MINER,0,mineDeposit.x+40,mineDeposit.y,-1);umode[miningWorker]=0;
    let miningClaim=canonicalAssignment(miningWorker);
    for(let a=0;a<4&&!miningClaim.assigned;a++){mfUtilityPlannerTick();miningClaim=canonicalAssignment(miningWorker);if(!miningClaim.assigned)tick+=15;}
    const miningBoard=mfUtilityBoards[0][MF_UTILITY_MINER],miningJob=miningBoard.jobs.get(uUtilityJob[miningWorker]);
    const claimedMine=miningJob?deposits[Number(miningJob.targetId)]:mineDeposit,mineBefore=claimedMine.remaining;
    for(let n=0;n<60;n++)mfUtilityUnitTick(miningWorker,DT);
    const mining={before:round(mineBefore),after:round(claimedMine.remaining),claim:miningClaim,targetId:miningJob&&miningJob.targetId,
      worker:canonicalAssignment(miningWorker),worked:claimedMine.remaining<mineBefore&&miningClaim.kind===MF_UTILITY_JOB_KIND.MINING};

    reset(0x53555256);
    const surveyNode=deposits.findIndex(D=>depositTier(D)>0),surveyDeposit=deposits[surveyNode];surveyDeposit.surveyed=0;
    const surveyWorker=spawnUnit(UT_MINER,0,surveyDeposit.x+40,surveyDeposit.y,-1);umode[surveyWorker]=7;
    let surveyClaim=canonicalAssignment(surveyWorker);
    for(let a=0;a<4&&!surveyClaim.assigned;a++){mfUtilityPlannerTick();surveyClaim=canonicalAssignment(surveyWorker);if(!surveyClaim.assigned)tick+=15;}
    step(2);
    const survey={bits:surveyDeposit.surveyed||0,claim:surveyClaim,worker:canonicalAssignment(surveyWorker),
      worked:!!((surveyDeposit.surveyed||0)&1)&&surveyClaim.kind===MF_UTILITY_JOB_KIND.SURVEY};

    reset(0x45534354);
    const hero=spawnUnit(4,0,1390,1250,-1),escortWorker=spawnUnit(24,0,1120,1250,-1);
    const escortBefore=Math.sqrt(dist2(ux[escortWorker],uy[escortWorker],ux[hero],uy[hero]));step(60);
    const escortAfter=Math.sqrt(dist2(ux[escortWorker],uy[escortWorker],ux[hero],uy[hero]));
    const escort={before:round(escortBefore),after:round(escortAfter),worker:canonicalAssignment(escortWorker),
      worked:escortAfter<escortBefore-5};

    reset(0x5245544e);
    const returnBase=addBld('hq',0,1450,1450,true),returnWorker=spawnUnit(UT_ENGINEER,0,1120,1120,-1);
    const returnBefore=Math.sqrt(dist2(ux[returnWorker],uy[returnWorker],returnBase.x,returnBase.y));step(60);
    const returnAfter=Math.sqrt(dist2(ux[returnWorker],uy[returnWorker],returnBase.x,returnBase.y));
    const returnJob={before:round(returnBefore),after:round(returnAfter),worker:canonicalAssignment(returnWorker),
      worked:returnAfter<returnBefore-5};

    reset(0x4d414e55);
    const manualWorker=spawnUnit(UT_ENGINEER,0,1220,1220,-1);addWreck(1480,1220,40,0,WRECK_SCRAP,1,'nova');
    step(1);const autoBefore=canonicalAssignment(manualWorker),manualX=980,manualY=1060;
    usel[manualWorker]=1;ustate[manualWorker]=1;utx[manualWorker]=manualX;uty[manualWorker]=manualY;ufield[manualWorker]=requestField(manualX,manualY);
    step(1);const autoAfter=canonicalAssignment(manualWorker);
    const manual={before:autoBefore,after:autoAfter,released:!autoAfter.assigned,
      destinationPreserved:Math.abs(utx[manualWorker]-manualX)<.01&&Math.abs(uty[manualWorker]-manualY)<.01};

    reset(0x434f4e54);
    const contestA=spawnUnit(UT_ENGINEER,0,1438,1300,-1),contestB=spawnUnit(UT_ENGINEER,1,1462,1300,0);
    addWreck(1450,1300,40,0,WRECK_SCRAP,1,'nova');const contestedWreck=wrecks[wrecks.length-1];step(1);
    const chosenA=mfUtilityClaimedSalvager(contestedWreck),chosenRepeat=mfUtilityClaimedSalvager(contestedWreck);
    const savedChosen=chosenA>=0?uUtilityJob[chosenA]:'';if(chosenA>=0)uUtilityJob[chosenA]='';
    const staleFallback=mfUtilityClaimedSalvager(contestedWreck);if(chosenA>=0)uUtilityJob[chosenA]=savedChosen;
    const contestedBefore=contestedWreck.mass;reclaimTick(DT);const contestedAfter=contestedWreck.mass;
    const contested={a:contestA,b:contestB,chosen:chosenA,repeat:chosenRepeat,staleFallback,
      before:round(contestedBefore),after:round(contestedAfter),worked:chosenA>=0&&chosenA===chosenRepeat&&
        staleFallback>=0&&staleFallback!==chosenA&&contestedAfter<contestedBefore};

    reset(0x53454154);
    AI.allies=[{slot:0,mass:100,energy:500,mcap:1400,ecap:6200,x:1500,y:1500}];
    const seatSite=addBld('pgen',0,1500,1500,false),playerBuilder=spawnUnit(UT_ENGINEER,0,1460,1500,-1),
      allyBuilder=spawnUnit(UT_ENGINEER,0,1540,1500,0);step(1);
    const playerAssign=canonicalAssignment(playerBuilder),allyAssign=canonicalAssignment(allyBuilder);
    reset(0x53454155);AI.allies=[{slot:0,mass:100,energy:500,mcap:1400,ecap:6200,x:1500,y:1500}];
    const playerSalvager=spawnUnit(UT_ENGINEER,0,1460,1540,-1),allySalvager=spawnUnit(UT_ENGINEER,0,1490,1540,0);
    addWreck(1500,1540,40,0,WRECK_SCRAP,1,'nova');const seatWreck=wrecks[wrecks.length-1];step(1);
    const seatWinner=mfUtilityClaimedSalvager(seatWreck),humanBefore=resM[0],allyBefore=AI.allies[0].mass;
    reclaimTick(1);const humanAfter=resM[0],allyAfter=AI.allies[0].mass,winnerSeat=seatWinner>=0?uCmd[seatWinner]:null;
    const seatIsolation={player:playerAssign,ally:allyAssign,winner:seatWinner,winnerSeat,
      playerSalvager,allySalvager,
      humanBefore:round(humanBefore),humanAfter:round(humanAfter),allyBefore:round(allyBefore),allyAfter:round(allyAfter),
      worked:playerAssign.kind===MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST&&
        allyAssign.kind!==MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST&&seatWinner>=0&&
        (winnerSeat===-1?humanAfter>humanBefore&&allyAfter===allyBefore:allyAfter>allyBefore&&humanAfter===humanBefore)};

    function captureFixture(kind){
      reset(0x43415000+kind.length);let worker,target,before,after,claimed;
      if(kind==='unit'){
        worker=spawnUnit(24,0,1280,1280,-1);target=spawnUnit(0,0,1320,1280,-1);uhp[target]=10;
        for(let a=0;a<4;a++){mfUtilityPlannerTick();claimed=canonicalAssignment(worker);if(claimed.assigned)break;tick+=15;}
        before=uhp[target];uteam[target]=1;uCmd[target]=0;mfUtilityUnitTick(worker,DT);after=uhp[target];
      }else{
        const B=addBld(kind==='production'?'fac':'pgen',0,1320,1280,kind!=='construction');target=B;
        if(kind==='repair'){B.hp=B.hpm*.25;worker=spawnUnit(UT_ENGINEER,0,1280,1280,-1);}
        else if(kind==='construction'){worker=spawnUnit(UT_ENGINEER,0,1280,1280,-1);}
        else {B.queue.push(0);worker=spawnUnit(UT_MINER,0,1280,1280,-1);umode[worker]=6;}
        for(let a=0;a<4;a++){mfUtilityPlannerTick();claimed=canonicalAssignment(worker);if(claimed.assigned)break;tick+=15;}
        before=kind==='repair'?B.hp:(B.tractorN||0);
        B.team=1;B.aiBaseSlot=0;mfUtilityUnitTick(worker,DT);
        after=kind==='repair'?B.hp:(B.tractorN||0);
      }
      return {kind,claimed,before:round(before),after:round(after),released:!canonicalAssignment(worker).assigned,
        worked:claimed.assigned&&before===after&&!canonicalAssignment(worker).assigned};
    }
    const captureTransfer={unit:captureFixture('unit'),structure:captureFixture('repair'),
      construction:captureFixture('construction'),production:captureFixture('production')};
    captureTransfer.worked=Object.values(captureTransfer).filter(x=>x&&x.kind).every(x=>x.worked);

    reset(0x53455353);running=true;matchLive=true;
    const saveHero=spawnUnit(4,0,1100,1100,-1);heroIdx=saveHero;
    const saveMedic=spawnUnit(24,0,1270,1300,-1),savePatient=spawnUnit(0,0,1310,1300,-1);uhp[savePatient]=10;
    const saveEngineer=spawnUnit(UT_ENGINEER,0,1270,1360,-1),saveSite=addBld('pgen',0,1310,1360,false);
    const saveDep=deposits.findIndex(D=>depositTier(D)>0),saveMiner=spawnUnit(UT_MINER,0,deposits[saveDep].x+35,deposits[saveDep].y,-1);umode[saveMiner]=0;
    const manualEngineer=spawnUnit(UT_ENGINEER,0,1000,1000,-1);ustate[manualEngineer]=1;utx[manualEngineer]=900;uty[manualEngineer]=900;
    step(2);const snapOk=sessSnapshot('utility-fixture'),saved=sessLoad(),serialized=localStorage.getItem(SESS_KEY)||'';
    const restoreOk=sessRestoreInto(saved);mfUtilityRuntimeReset();step(31);
    const restoredAssignments=mfUtilityRuntimeSnapshot().assignments;
    const restoredKinds=restoredAssignments.map(A=>{for(const B of mfUtilityRuntimeSnapshot().boards){const J=B.snapshot.jobs.find(J=>J.id===A.jobId);if(J)return J.kind;}return null;});
    let manualPreserved=false;for(let i=0;i<unitHigh;i++)if(ualive[i]&&utype[i]===UT_ENGINEER&&ustate[i]===1&&
      Math.abs(utx[i]-900)<2&&Math.abs(uty[i]-900)<2&&!uUtilityJob[i])manualPreserved=true;
    const realSaveRestore={snapOk,restoreOk,serializedHasRuntime:/uUtility(?:Job|Auto|Boards)/.test(serialized),
      restoredKinds,manualPreserved,worked:snapOk&&restoreOk&&!/uUtility(?:Job|Auto|Boards)/.test(serialized)&&manualPreserved&&
        restoredKinds.includes(MF_UTILITY_JOB_KIND.REPAIR_UNIT)&&restoredKinds.includes(MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST)&&
        restoredKinds.includes(MF_UTILITY_JOB_KIND.MINING)};
    running=false;

    reset(0x50455246);mfUtilityBuildLandComponents();mfUtilityPlannerPerf.samples.length=0;
    mfUtilityPlannerPerf.lastMs=0;mfUtilityPlannerPerf.lastScan=0;mfUtilityPlannerPerf.maxScan=0;
    const perfTargetCount=220,perfWorkerCount=96;
    for(let n=0;n<perfTargetCount;n++){const p=spawnUnit(0,0,800+(n%22)*38,800+Math.floor(n/22)*38,-1);if(p>=0)uhp[p]=uhpm[p]*.5;}
    for(let n=0;n<perfWorkerCount;n++)spawnUnit(24,0,760+(n%16)*44,1240+Math.floor(n/16)*34,-1);
    step(150);const plannerPerf=mfUtilityRuntimeSnapshot().planner;

    reset(0x41495341);
    const aiWorker=spawnUnit(UT_ENGINEER,1,1240,1180,0);addWreck(1450,1180,30,0,WRECK_SCRAP,1,'legion');
    const aiWreck=wrecks[wrecks.length-1],aiBefore=aiWreck.mass;step(650,{reclaim:true});
    const aiAfter=wrecks.indexOf(aiWreck)>=0?aiWreck.mass:0;
    const aiSalvage={before:round(aiBefore),after:round(aiAfter),worked:aiAfter<aiBefore,worker:canonicalAssignment(aiWorker)};

    function repeatScenario(){
      reset(0x44455445);const i=spawnUnit(UT_ENGINEER,0,1200,1200,-1);addWreck(1460,1200,40,0,WRECK_SCRAP,1,'nova');
      step(90,{reclaim:true});const A=canonicalAssignment(i),S=mfUtilityRuntimeSnapshot();
      const eng=S.boards.find(x=>x.team===0&&x.role===MF_UTILITY_ENGINEER).snapshot;
      return {assignment:A,jobs:eng.jobs.map(j=>({id:j.id,kind:j.kind,targetKind:j.targetKind,targetId:j.targetId,
        priority:j.priority,capacity:j.capacity})),claims:eng.claims.map(c=>({jobId:c.jobId}))};
    }
    const repeatA=repeatScenario(),repeatB=repeatScenario();
    return {salvage,repair,structureRepair,construction,production,remoteAssistProof,restoredState,
      selectionOnly,unreachable,disconnected,noProgress,mining,survey,escort,returnJob,manual,contested,seatIsolation,
      captureTransfer,realSaveRestore,plannerPerf,aiSalvage,repeatA,repeatB};
  });
}finally{
  if(page)await page.close().catch(()=>{});await closePwBrowser().catch(()=>{});await server.close().catch(()=>{});
}

const repeatHashA=sha256(JSON.stringify(runtime.repeatA)),repeatHashB=sha256(JSON.stringify(runtime.repeatB));
const sourceEnd=await fingerprint();
const evidenceCompatible=(a,b)=>!!a&&!!b&&a.head===b.head&&a.sourceSetSha256===b.sourceSetSha256;
const sourceIdentityStable=evidenceCompatible(sourceStart,sourceEnd);
const evidenceMismatchFixture=!evidenceCompatible(sourceStart,{...sourceEnd,sourceSetSha256:'fixture-mismatch'});
const checks={
  autonomousSalvage:runtime.salvage.worked,
  unitRepairProgress:runtime.repair.worked,
  structureRepairProgress:runtime.structureRepair.worked,
  constructionCapacity:runtime.construction.claims===2&&
    Math.abs(runtime.construction.tractorN-runtime.construction.expectedDiminished)<.01,
  productionCapacity:runtime.production.claims===2&&Math.abs(runtime.production.tractorN-runtime.production.expectedDiminished)<.01,
  remoteClaimNoAssist:runtime.remoteAssistProof.worked,
  restoredStateReplans:runtime.restoredState.worked,
  sessionSchemaCompatibility:sessionCompatibilityFixture,
  selectionDoesNotCancel:runtime.selectionOnly.worked,
  unreachableRemoteRejected:runtime.unreachable.worked,
  disconnectedTopologyRejected:runtime.disconnected.worked,
  noProgressReleases:runtime.noProgress.worked,
  miningAuthority:runtime.mining.worked,
  surveyAuthority:runtime.survey.worked,
  escortAuthority:runtime.escort.worked,
  returnAuthority:runtime.returnJob.worked,
  recycledWorkerInvalidates:runtime.construction.recycled.sameSlot&&!runtime.construction.recycled.oldClaimSurvives,
  recycledTargetInvalidates:runtime.construction.targetInvalidated,
  manualOrderWins:runtime.manual.released&&runtime.manual.destinationPreserved,
  contestedSalvageExact:runtime.contested.worked,
  commanderSeatIsolation:runtime.seatIsolation.worked,
  captureTransferInvalidates:runtime.captureTransfer.worked,
  realSaveRestoreContinuation:runtime.realSaveRestore.worked,
  plannerSaturatedInstrumented:runtime.plannerPerf.samples>=5&&runtime.plannerPerf.maxScan>0&&runtime.plannerPerf.p95Ms>=0,
  enemyAiUsesAuthority:runtime.aiSalvage.worked,
  deterministicRepeat:repeatHashA===repeatHashB,
  sourceIdentityStable,
  evidenceMismatchFixture,
  runtimeClean:runtimeErrors.length===0&&consoleErrors.length===0
};
const failures=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
const report={schema:'MassfrontLiveUtilityJobsProbeV1',startedUtc,finishedUtc:new Date().toISOString(),
  result:failures.length?'FAIL':'PASS',checks,failures,
  measuredBefore:{status:'UNKNOWN',reason:'no-source-matched-before-evidence',
    rejectedEvidence:{path:'.tmp/utility-jobs/runs/2026-08-27T05-48-08-737Z/report.json',reason:'source-set-mismatch'}},
  measuredAfter:runtime,gpu,runtimeErrors,consoleErrors,repeatHash:repeatHashA,
  provenance:{start:sourceStart,end:sourceEnd,headStable:sourceStart.head===sourceEnd.head,
    sourceSetStable:sourceStart.sourceSetSha256===sourceEnd.sourceSetSha256}};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(output,'summary.md'),['# MASSFRONT live utility-job integration','',
  `- Result: **${report.result}**`,`- HEAD: \`${sourceStart.head}\``,`- Source set: \`${sourceStart.sourceSetSha256}\``,
  `- Renderer: ${gpu?.renderer||'UNKNOWN'}`,'',
  `- Autonomous salvage: ${runtime.salvage.massBefore} → ${runtime.salvage.massAfter} mass; bank ${runtime.salvage.bankBefore} → ${runtime.salvage.bankAfter}.`,
  `- Repair: ${runtime.repair.before} → ${runtime.repair.after} HP.`,
  `- Construction claims: ${runtime.construction.claims}/2; production claims: ${runtime.production.claims}/2.`,
  `- Remote assist: ${runtime.remoteAssistProof.tractorN} effective with ${runtime.remoteAssistProof.claims} claims.`,
  `- Contested salvage winner: ${runtime.contested.chosen}; stale fallback: ${runtime.contested.staleFallback}.`,
  `- Before evidence: UNKNOWN (no source-matched pre-change capture).`,
  `- Deterministic repeat: \`${repeatHashA}\`.`,'',
  ...(failures.length?['## Failures','',...failures.map(x=>`- ${x}`)]:[])
].join('\n')+'\n');
console.log(JSON.stringify({output,result:report.result,checks,failures,measuredBefore:report.measuredBefore,
  measuredAfter:{salvage:runtime.salvage,repair:runtime.repair,construction:runtime.construction,
    production:runtime.production,remoteAssistProof:runtime.remoteAssistProof,restoredState:runtime.restoredState,
    selectionOnly:runtime.selectionOnly,unreachable:runtime.unreachable,disconnected:runtime.disconnected,noProgress:runtime.noProgress,contested:runtime.contested,
    seatIsolation:runtime.seatIsolation,captureTransfer:runtime.captureTransfer,realSaveRestore:runtime.realSaveRestore,
    plannerPerf:runtime.plannerPerf,manual:runtime.manual,aiSalvage:runtime.aiSalvage},repeatHash:repeatHashA},null,2));
process.exit(failures.length?1:0);
