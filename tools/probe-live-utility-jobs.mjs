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
const sourceFiles=['src/engine/gl.js','src/engine/worldsites.js','src/game/utilityjobs.js','src/game/sim.js','src/game/ai.js','src/main.js','src/session.js','tools/probe-live-utility-jobs.mjs'];
const recoveryReloadE2E={status:'DELEGATED',reason:'The true reload -> sessResume -> newSkirmish -> deployCarrier -> sessRestoreInto gate runs in the unfiltered MF_STAGE9_V1_ONLY exact-runtime probe; this focused utility probe owns direct recovery and utility replanning.'};
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
    const DT=1/30,round=n=>+Number(n).toFixed(5),copy=value=>JSON.parse(JSON.stringify(value));
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
    function recoveryStateSignature(){
      return JSON.stringify({
        units:Array.from({length:unitHigh},(_,i)=>ualive[i]?
          [i,utype[i],uteam[i],ux[i],uy[i],uhp[i],uhpm[i],ustate[i],utx[i],uty[i]]:null).filter(Boolean),
        blds:blds.map((B,i)=>B&&B.alive?
          [i,B.type,B.team,B.x,B.y,B.hp,B.prog,B.dep??null,B.geo??null,B.freeMiner??null]:null).filter(Boolean),
        resources:{mass:deposits.map(D=>[D.remaining,D.surveyed|0,!!D.taken]),
          energy:geysers.map(G=>[G.remaining,G.surveyed|0,!!G.taken])},
        location:sessCaptureLocation(),hero:sessCaptureHeroState(),wrecks:sessCaptureWrecks()
      });
    }
    function sessionRosterFixture(base,specs){
      const s=copy(base),U={t:[],tm:[],x:[],y:[],hp:[],ang:[],st:[],tx:[],ty:[],hold:[],mode:[],
        vt:[],kl:[],oi:[],cmd:[],tg:[],mh:[],pr:[],pst:[],psl:[],gh:[],gg:[],qk:[],q:[]};
      for(let n=0;n<specs.length;n++){
        const R=specs[n],x=1000+(n%31)*3,y=1000+(((n/31)|0)%31)*3,T=TYPES[R.type];
        U.t.push(R.type);U.tm.push(R.team);U.x.push(x);U.y.push(y);U.hp.push(Math.max(1,Math.round(T.hp||1)));
        U.ang.push(0);U.st.push(0);U.tx.push(x);U.ty.push(y);U.hold.push(0);U.mode.push(0);
        U.vt.push(0);U.kl.push(0);U.oi.push(n);U.cmd.push(R.cmd);U.tg.push(-1);U.mh.push(0);
        U.pr.push(-1);U.pst.push(0);U.psl.push(0);U.gh.push(-1);U.gg.push(-1);U.qk.push(0);U.q.push(null);
      }
      s.units=U;s.patrols=[];return s;
    }
    function sessionFreshDeploymentState(){
      let playerSeatUnits=0,playerBuildings=0;
      for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0&&uCmd[i]===POP_PLAYER_SLOT)playerSeatUnits++;
      for(const B of blds)if(B&&B.alive&&B.team===0&&B.allyAI==null)playerBuildings++;
      return {running,matchLive,heroIdx,playerSeatUnits,playerBuildings,pending:!!sessPending,
        carrier:{active:!!carrier.active,phase:carrier.phase|0,alt:+carrier.alt},
        sessionStored:localStorage.getItem(SESS_KEY)!==null,
        fallback:window.__mfSessionFallback?copy(window.__mfSessionFallback):null};
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
    /* FULL_V1 resource relocation makes scan order intentionally independent
       of geometric proximity. This is the mining-authority fixture, not another
       pathing fixture, so exercise the node the board actually leased. */
    ux[miningWorker]=claimedMine.x+40;uy[miningWorker]=claimedMine.y;
    utx[miningWorker]=ux[miningWorker];uty[miningWorker]=uy[miningWorker];ustate[miningWorker]=0;
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

    const sessionMapBefore=curMap,sessionThemeBefore=curTheme,sessionSetupBefore=META.setup,
      sessionAiFacBefore=AI.fac,sessionAiSelBefore=aiFactionSel,sessionPlayerFacBefore=playerFaction,
      sessionCommanderBefore=playerCommanderId,sessionAiSlotsBefore=aiSlots.map(A=>({...A})),
      sessionAbilityCdBefore=AB_CD.slice(),
      sessionIncomeBefore=[bonusMass,bonusEnergy];
    curMap='aelos_north_medium';curTheme=MAPDEFS[curMap].theme;
    AI.fac='legion';aiFactionSel='legion';playerFaction='nova';playerCommanderId='nova_kai';
    META.setup={d:difficulty|0,t:curTheme,m:curMap,f:AI.fac,pf:playerFaction,pc:playerCommanderId,
      bs:'standard',pkg:DEPLOYMENT_PACKAGES[deploymentPackage]?deploymentPackage:'prepared',
      g:GOALS.some(G=>G.id===goalSel)?goalSel:GOALS[0].id,tl:timeLimit,rp:resPace,cr:crateRate,
      ps:START_ZONES.some(Z=>Z.id===playerStartZone)?playerStartZone:START_ZONES[0].id,
      ais:aiSlots.map(A=>({on:!!A.on,diff:A.diff|0,zone:START_ZONES.some(Z=>Z.id===A.zone)?A.zone:START_ZONES[0].id,
        ally:!!A.ally,behavior:aiBehaviorKey(A.behavior)})),df:defenseFocus,inf:infestationOn?1:0};
    const sessionPlan=mfPreflightLocationPlanV1(curMap);
    reset(0x53455353);
    /* resetWorld deliberately leaves the AI seat arrays alone because normal
       deployment immediately replaces them. Run that production replacement
       here as well, otherwise an attract-scene wallet can make a valid v2
       recovery fixture look unrealizable for reasons unrelated to recovery. */
    newSkirmish();running=true;matchLive=true;
    const saveHero=spawnUnit(4,0,1100,1100,-1);heroIdx=saveHero;
    uhpm[saveHero]=uhpm[saveHero]*1.2;uhp[saveHero]=Math.min(uhp[saveHero],uhpm[saveHero]);
    const fixtureMaxHp=+uhpm[saveHero],fixtureAbilityCd=[20.8,16,24,70,45],fixtureIncome=[2.5,8];
    for(let i=0;i<AB_CD.length;i++)AB_CD[i]=fixtureAbilityCd[i];
    bonusMass=fixtureIncome[0];bonusEnergy=fixtureIncome[1];
    const saveMedic=spawnUnit(24,0,1270,1300,-1),savePatient=spawnUnit(0,0,1310,1300,-1);uhp[savePatient]=10;
    const saveEngineer=spawnUnit(UT_ENGINEER,0,1270,1360,-1),saveSite=addBld('pgen',0,1310,1360,false);
    const saveDeps=[];for(let i=0;i<deposits.length&&saveDeps.length<3;i++)if(depositTier(deposits[i])>0&&!deposits[i].taken)saveDeps.push(i);
    if(saveDeps.length!==3)throw new Error('session fixture requires three finite mass nodes');
    const packageMiners=[];
    for(const dep of saveDeps.slice(0,2)){
      const before=new Set();for(let i=0;i<unitHigh;i++)if(ualive[i]&&utype[i]===UT_MINER)before.add(i);
      addBld('mex',0,deposits[dep].x,deposits[dep].y,true);
      let miner=-1;for(let i=0;i<unitHigh;i++)if(ualive[i]&&utype[i]===UT_MINER&&!before.has(i)){miner=i;break;}
      if(miner<0)throw new Error('Extractor did not deploy its package Prospector');
      packageMiners.push(miner);
    }
    const saveMiner=packageMiners[0];umode[saveMiner]=0;
    killUnit(packageMiners[1],true);                 // a spent grant must not resurrect on restore
    const unfinishedMex=addBld('mex',0,deposits[saveDeps[2]].x,deposits[saveDeps[2]].y,false);
    const unfinishedOldBi=blds.indexOf(unfinishedMex);
    const savedMinerCount=Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&uteam[i]===0&&utype[i]===UT_MINER).length;
    const manualEngineer=spawnUnit(UT_ENGINEER,0,1000,1000,-1);ustate[manualEngineer]=1;utx[manualEngineer]=900;uty[manualEngineer]=900;
    step(2);
    unfinishedMex.prog=.9996;unfinishedMex.hp=unfinishedMex.hpm*(.1+.9*unfinishedMex.prog);
    unfinishedMex.buildPaidM=BT.mex.cm*unfinishedMex.prog;unfinishedMex.buildPaidE=BT.mex.ce*unfinishedMex.prog;
    const pendingMassIndex=saveDeps[0],pendingEnergyIndex=geysers.findIndex(G=>geyserTier(G)>0&&!G.taken);
    if(pendingEnergyIndex<0)throw new Error('session fixture requires an unused finite energy node');
    const pendingMass=deposits[pendingMassIndex],pendingEnergy=geysers[pendingEnergyIndex];
    pendingMass.remaining=+(pendingMass.capacity*.371).toFixed(3);pendingMass.surveyed=3;
    pendingEnergy.remaining=+(pendingEnergy.capacity*.429).toFixed(3);pendingEnergy.surveyed=5;
    const snapOk=sessSnapshot('utility-fixture'),emitted=sessLoad();
    const emittedV2=!!(emitted&&emitted.v===2&&emitted.location),emittedMassRow=emittedV2&&
      emitted.location.resources&&emitted.location.resources.mass&&emitted.location.resources.mass[pendingMassIndex],
      emittedEnergyRow=emittedV2&&emitted.location.resources&&emitted.location.resources.energy&&
        emitted.location.resources.energy[pendingEnergyIndex];
    const pendingV2ResourcesCaptured=!!emittedMassRow&&!!emittedEnergyRow&&
      emitted.location.planner.status==='PENDING_V0'&&emittedMassRow[5]===pendingMass.remaining&&emittedMassRow[6]===3&&
      emittedEnergyRow[5]===pendingEnergy.remaining&&emittedEnergyRow[6]===5;
    let campaignSnapshotBlocked=false;
    if(typeof storyCampaignActiveId!=='undefined'){
      const campaignBefore=storyCampaignActiveId;storyCampaignActiveId='stage9-recovery-probe';
      campaignSnapshotBlocked=!sessCanSnapshot();storyCampaignActiveId=campaignBefore;
    }
    const coreStable=recoveryStateSignature(),malformedCoreUnits=emitted?copy(emitted):null;
    let coreUnitsLoaded=null,coreUnitsLoadCode='',coreUnitsLoadUnchanged=false,
      coreUnitsRestore=false,coreUnitsRestoreCode='',coreUnitsRestoreUnchanged=false;
    if(malformedCoreUnits){malformedCoreUnits.units.hp.pop();window.__mfSessionReject='';
      localStorage.setItem(SESS_KEY,JSON.stringify(malformedCoreUnits));coreUnitsLoaded=sessLoad();
      coreUnitsLoadCode=window.__mfSessionReject||'';coreUnitsLoadUnchanged=recoveryStateSignature()===coreStable;
      window.__mfSessionReject='';coreUnitsRestore=sessRestoreInto(malformedCoreUnits);
      coreUnitsRestoreCode=window.__mfSessionReject||'';coreUnitsRestoreUnchanged=recoveryStateSignature()===coreStable;}
    const malformedCoreBuilding=emitted?copy(emitted):null;
    let coreBuildingRestore=false,coreBuildingRestoreCode='',coreBuildingRestoreUnchanged=false;
    if(malformedCoreBuilding){if(!malformedCoreBuilding.blds.length)throw new Error('session fixture requires one building row');
      malformedCoreBuilding.blds[0]=malformedCoreBuilding.blds[0].slice(0,13);window.__mfSessionReject='';
      coreBuildingRestore=sessRestoreInto(malformedCoreBuilding);coreBuildingRestoreCode=window.__mfSessionReject||'';
      coreBuildingRestoreUnchanged=recoveryStateSignature()===coreStable;}
    const coreStateFailClosed=!!malformedCoreUnits&&!coreUnitsLoaded&&
      coreUnitsLoadCode==='SESSION_CORE_STATE_INVALID'&&coreUnitsLoadUnchanged&&!coreUnitsRestore&&
      coreUnitsRestoreCode==='SESSION_CORE_STATE_INVALID'&&coreUnitsRestoreUnchanged&&!!malformedCoreBuilding&&
      !coreBuildingRestore&&coreBuildingRestoreCode==='SESSION_CORE_STATE_INVALID'&&coreBuildingRestoreUnchanged;
    const malformedV2=emitted?copy(emitted):null;
    if(malformedV2){
      delete malformedV2.location;window.__mfSessionReject='';
      localStorage.setItem(SESS_KEY,JSON.stringify(malformedV2));
    }
    const malformedV2Loaded=malformedV2?sessLoad():null;
    const malformedV2Code=window.__mfSessionReject||'';
    /* A fresh regeneration refills finite reserves and forgets surveys. Prove
       the PENDING_V0 v2 payload is authoritative before adding a fresh-only
       geothermal reservation that must also disappear on restore. */
    pendingMass.remaining=pendingMass.capacity;pendingMass.surveyed=0;
    pendingEnergy.remaining=pendingEnergy.capacity;pendingEnergy.surveyed=0;
    for(let i=0;i<AB_CD.length;i++)AB_CD[i]=[26,20,30,70,45][i];
    bonusMass=0;bonusEnergy=0;
    const freshGeoIndex=pendingEnergyIndex;
    const freshGeo=addBld('geo',0,geysers[freshGeoIndex].x,geysers[freshGeoIndex].y,true);
    if(!freshGeo)throw new Error('session fixture could not add a fresh-only geothermal plant');
    const v2RestoreOk=emittedV2&&sessRestoreInto(emitted);
    const pendingV2ResourcesExact=pendingV2ResourcesCaptured&&v2RestoreOk&&
      Math.abs(deposits[pendingMassIndex].remaining-emittedMassRow[5])<.001&&
      deposits[pendingMassIndex].surveyed===emittedMassRow[6]&&
      Math.abs(geysers[pendingEnergyIndex].remaining-emittedEnergyRow[5])<.001&&
      geysers[pendingEnergyIndex].surveyed===emittedEnergyRow[6];
    const heroProgressionExact=v2RestoreOk&&heroIdx>=0&&ualive[heroIdx]&&
      Math.abs(uhpm[heroIdx]-emitted.hero.maxHp)<.001&&emitted.hero.maxHp===fixtureMaxHp&&
      JSON.stringify(AB_CD)===JSON.stringify(emitted.hero.abilityCd)&&
      JSON.stringify(emitted.hero.abilityCd)===JSON.stringify(fixtureAbilityCd)&&
      bonusMass===emitted.hero.income[0]&&bonusEnergy===emitted.hero.income[1]&&
      JSON.stringify(emitted.hero.income)===JSON.stringify(fixtureIncome);
    const v2Mexes=blds.filter(B=>B&&B.alive&&B.type==='mex'&&saveDeps.includes(B.dep));
    const v2Unfinished=v2Mexes.find(B=>B.dep===saveDeps[2]);
    const v2MinerCount=Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&uteam[i]===0&&utype[i]===UT_MINER).length;
    const v2BeforeCompletion=v2RestoreOk&&v2MinerCount===savedMinerCount&&v2Mexes.length===3&&
      new Set(v2Mexes.map(B=>B.dep)).size===3&&saveDeps.every(dep=>v2Mexes.some(B=>B.dep===dep))&&
      !!v2Unfinished&&v2Unfinished.prog<1&&!v2Unfinished.freeMiner&&
      !geysers[freshGeoIndex].taken&&!blds.some(B=>B&&B.alive&&B.type==='geo'&&B.geo===freshGeoIndex);
    mfUtilityRuntimeReset();step(31,{build:true});
    const v2MinerCountAfter=Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&uteam[i]===0&&utype[i]===UT_MINER).length;
    const v2CompletionGrant=v2BeforeCompletion&&v2MinerCountAfter===savedMinerCount+1&&
      v2Mexes.every(B=>B.prog>=1&&B.freeMiner===true);
    /* Production snapshots are v2 now. Explicitly turn that valid snapshot
       into the old hashless v1 shape on this known PENDING_V0 map so the
       utility-state restore proof continues to cover backward compatibility;
       FULL_V1 maps intentionally reject this downgrade. */
    const legacy=emitted?copy(emitted):null;
    if(legacy){legacy.v=1;delete legacy.location;delete legacy.hero;delete legacy.wrecks;delete legacy.extraStats;
      for(const B of legacy.blds){B[5]=+Number(B[5]||0).toFixed(3);B.length=14;}
      localStorage.setItem(SESS_KEY,JSON.stringify(legacy));}
    const legacyUnfinished=legacy&&legacy.blds.find(B=>B[9]===unfinishedOldBi),
      legacyRowsAuthentic=!!legacy&&legacy.blds.every(B=>B.length===14)&&!!legacyUnfinished&&legacyUnfinished[5]===1;
    const saved=sessLoad(),serialized=localStorage.getItem(SESS_KEY)||'';
    const legacyLoadOk=!!(saved&&saved.v===1&&!saved.location);
    const v2LocationRequired=!!malformedV2&&!malformedV2Loaded&&malformedV2Code==='SESSION_LOCATION_LEGACY_CONTRACT_MISMATCH';
    for(let i=0;i<AB_CD.length;i++)AB_CD[i]=[26,20,30,70,45][i];bonusMass=0;bonusEnergy=0;
    const restoreOk=!!saved&&sessRestoreInto(saved);mfUtilityRuntimeReset();step(31,{build:true});
    const restoredAssignments=mfUtilityRuntimeSnapshot().assignments;
    const restoredKinds=restoredAssignments.map(A=>{for(const B of mfUtilityRuntimeSnapshot().boards){const J=B.snapshot.jobs.find(J=>J.id===A.jobId);if(J)return J.kind;}return null;});
    let manualPreserved=false;for(let i=0;i<unitHigh;i++)if(ualive[i]&&utype[i]===UT_ENGINEER&&ustate[i]===1&&
      Math.abs(utx[i]-900)<2&&Math.abs(uty[i]-900)<2&&!uUtilityJob[i])manualPreserved=true;
    const restoredMinerCount=Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&uteam[i]===0&&utype[i]===UT_MINER).length;
    const restoredMexes=blds.filter(B=>B&&B.alive&&B.type==='mex'&&saveDeps.includes(B.dep));
    const extractorRestoreExact=v2CompletionGrant&&savedMinerCount===1;
    const historicalV1BestEffort=legacyLoadOk&&legacyRowsAuthentic&&restoreOk&&restoredMinerCount===savedMinerCount&&
      restoredMexes.length===3&&new Set(restoredMexes.map(B=>B.dep)).size===3&&
      saveDeps.every(dep=>restoredMexes.some(B=>B.dep===dep));
    const knownPendingMap=!!(sessionPlan&&sessionPlan.ok&&sessionPlan.status==='PENDING_V0');
    const realSaveRestore={map:curMap,planStatus:sessionPlan&&sessionPlan.status,snapOk,emittedV2,legacyLoadOk,
      campaignSnapshotBlocked,v2LocationRequired,malformedV2Code,v2RestoreOk,v2BeforeCompletion,v2CompletionGrant,restoreOk,
      pendingV2ResourcesCaptured,pendingV2ResourcesExact,heroProgressionExact,coreStateFailClosed,
      coreUnits:{loaded:!!coreUnitsLoaded,loadCode:coreUnitsLoadCode,loadUnchanged:coreUnitsLoadUnchanged,
        restore:!!coreUnitsRestore,restoreCode:coreUnitsRestoreCode,restoreUnchanged:coreUnitsRestoreUnchanged},
      coreBuilding:{restore:!!coreBuildingRestore,code:coreBuildingRestoreCode,unchanged:coreBuildingRestoreUnchanged},
      legacyRowsAuthentic,historicalV1BestEffort,savedMinerCount,v2MinerCount,v2MinerCountAfter,restoredMinerCount,extractorRestoreExact,
      serializedHasRuntime:/uUtility(?:Job|Auto|Boards)/.test(serialized),
      restoredKinds,manualPreserved,worked:knownPendingMap&&snapOk&&emittedV2&&legacyLoadOk&&
        campaignSnapshotBlocked&&v2LocationRequired&&extractorRestoreExact&&pendingV2ResourcesExact&&
        heroProgressionExact&&coreStateFailClosed&&historicalV1BestEffort&&restoreOk&&
        !/uUtility(?:Job|Auto|Boards)/.test(serialized)&&manualPreserved&&
        restoredKinds.includes(MF_UTILITY_JOB_KIND.REPAIR_UNIT)&&restoredKinds.includes(MF_UTILITY_JOB_KIND.CONSTRUCTION_ASSIST)&&
        restoredKinds.includes(MF_UTILITY_JOB_KIND.MINING)};

    /* Structurally valid bytes are not necessarily replayable. Exercise the
       production admission math before the wipe, the exact cap with every
       Commander deliberately ordered last, and the deployCarrier fallback
       after an injected mid-replay exception. */
    const recoveryAtomicity={worked:false};
    try{
      if(!emittedV2)throw new Error('atomic recovery fixture requires the emitted v2 snapshot');
      const expected0=[...populationExpectedSlots(0)],expected1=[...populationExpectedSlots(1)],
        cap0=populationCapFor(0),cap1=populationCapFor(1),neutralCap=populationCapFor(2);
      if(!expected0.includes(POP_PLAYER_SLOT)||!expected1.length)throw new Error('atomic recovery fixture requires player and enemy seats');
      const overRows=expected0.map(cmd=>({type:4,team:0,cmd}));
      while(overRows.length<=cap0)overRows.push({type:0,team:0,cmd:POP_PLAYER_SLOT});
      const overCap=sessionRosterFixture(emitted,overRows),overStable=recoveryStateSignature();
      const overCheck=sessCheckRosterRealizable(overCap);window.__mfSessionReject='';
      const overRestored=sessRestoreInto(overCap),overCode=window.__mfSessionReject||'';
      recoveryAtomicity.combatOverCap={cap:cap0,rows:overRows.length,check:copy(overCheck),restored:overRestored,
        code:overCode,unchanged:recoveryStateSignature()===overStable};
      recoveryAtomicity.combatOverCap.worked=!overCheck.ok&&!overRestored&&overCode==='SESSION_ROSTER_UNREALIZABLE'&&
        recoveryAtomicity.combatOverCap.unchanged;

      const neutralRows=[{type:4,team:0,cmd:POP_PLAYER_SLOT}];
      for(let n=0;n<=neutralCap;n++)neutralRows.push({type:11,team:2,cmd:POP_PLAYER_SLOT});
      const neutral=sessionRosterFixture(emitted,neutralRows),neutralStable=recoveryStateSignature();
      const neutralCheck=sessCheckRosterRealizable(neutral);window.__mfSessionReject='';
      const neutralRestored=sessRestoreInto(neutral),neutralCode=window.__mfSessionReject||'';
      recoveryAtomicity.neutralOverCap={cap:neutralCap,neutralRows:neutralRows.length-1,check:copy(neutralCheck),
        restored:neutralRestored,code:neutralCode,unchanged:recoveryStateSignature()===neutralStable};
      recoveryAtomicity.neutralOverCap.worked=!neutralCheck.ok&&!neutralRestored&&neutralCode==='SESSION_ROSTER_UNREALIZABLE'&&
        recoveryAtomicity.neutralOverCap.unchanged;

      const hostileFacBefore=AI.fac,hostileSelBefore=aiFactionSel,enemySlot=expected1[0],
        hostileRows=[{type:4,team:0,cmd:POP_PLAYER_SLOT}],hostileMissing=expected1.length;
      for(let n=0;n<cap1-hostileMissing+1;n++)hostileRows.push({type:11,team:2,cmd:enemySlot});
      const hostile=sessionRosterFixture(emitted,hostileRows);hostile.aiFac='horde';hostile.setup.f='horde';
      const hostileStable=recoveryStateSignature();AI.fac='horde';aiFactionSel='horde';
      const hostileCheck=sessCheckRosterRealizable(hostile);window.__mfSessionReject='';
      const hostileRestored=sessRestoreInto(hostile),hostileCode=window.__mfSessionReject||'';
      AI.fac=hostileFacBefore;aiFactionSel=hostileSelBefore;
      recoveryAtomicity.hostileBroodOverCap={cap:cap1,hostileRows:hostileRows.length-1,missing:hostileMissing,
        check:copy(hostileCheck),restored:hostileRestored,code:hostileCode,
        unchanged:recoveryStateSignature()===hostileStable};
      recoveryAtomicity.hostileBroodOverCap.worked=!hostileCheck.ok&&!hostileRestored&&
        hostileCode==='SESSION_ROSTER_UNREALIZABLE'&&recoveryAtomicity.hostileBroodOverCap.unchanged;

      const boundaryRows=[];
      for(let n=0;n<cap0-expected0.length;n++)boundaryRows.push({type:0,team:0,cmd:POP_PLAYER_SLOT});
      const heroOrder=expected0.filter(slot=>slot!==POP_PLAYER_SLOT).concat(POP_PLAYER_SLOT);
      for(const cmd of heroOrder)boundaryRows.push({type:4,team:0,cmd});
      const boundary=sessionRosterFixture(emitted,boundaryRows),boundaryCheck=sessCheckRosterRealizable(boundary);
      window.__mfSessionReject='';const boundaryRestored=sessRestoreInto(boundary),liveTeam0=teamCount[0]|0;
      const liveHeroSeats=new Set();for(let i=0;i<unitHigh;i++)if(ualive[i]&&uteam[i]===0&&TYPES[utype[i]].cat==='hero')liveHeroSeats.add(uCmd[i]);
      recoveryAtomicity.exactBoundary={cap:cap0,rows:boundaryRows.length,heroOrder,boundaryCheck:copy(boundaryCheck),
        restored:boundaryRestored,liveTeam0,heroIdx,playerHeroLast:boundary.units.t[boundary.units.t.length-1]===4&&
          boundary.units.cmd[boundary.units.cmd.length-1]===POP_PLAYER_SLOT,
        liveHeroSeats:[...liveHeroSeats]};
      recoveryAtomicity.exactBoundary.worked=boundaryCheck.ok&&boundaryRestored&&liveTeam0===cap0&&heroIdx>=0&&
        uCmd[heroIdx]===POP_PLAYER_SLOT&&expected0.every(slot=>liveHeroSeats.has(slot));

      AI.fac=emitted.aiFac;aiFactionSel=emitted.aiFac;playerFaction=emitted.playerFac;
      playerCommanderId=emitted.playerCommander;META.setup=copy(emitted.setup);newSkirmish();paused=true;
      const fallbackSnapshot=copy(emitted),fallbackChecks={core:sessCheckCoreState(fallbackSnapshot),
        setup:sessCheckSetupEnvelope(fallbackSnapshot),roster:sessCheckRosterRealizable(fallbackSnapshot),
        location:sessLocationCurrentCheck(fallbackSnapshot)};
      carrier.phase=1;carrier.alt=0;carrier.clearance=0;
      let landingReady=carrierCanDeploy();
      if(!landingReady){
        const ox=carrier.x,oy=carrier.y;
        findLanding:for(let ring=1;ring<=12;ring++)for(let side=0;side<8;side++){
          const a=side*TAU/8;carrier.x=clamp(ox+Math.cos(a)*ring*SNAP_GRID,160,MAP-160);
          carrier.y=clamp(oy+Math.sin(a)*ring*SNAP_GRID,160,MAP-160);carrier.tx=carrier.x;carrier.ty=carrier.y;
          if(carrierCanDeploy()){landingReady=true;break findLanding;}
        }
      }
      if(!Object.values(fallbackChecks).every(C=>C&&C.ok)||!landingReady)
        throw new Error('production fallback fixture did not pass its fresh-world preflight');
      const injectIndex=0,inject={type:fallbackSnapshot.units.t[injectIndex],team:fallbackSnapshot.units.tm[injectIndex],
        x:fallbackSnapshot.units.x[injectIndex],y:fallbackSnapshot.units.y[injectIndex]},spawnBase=spawnUnit;
      let injected=false,deployError='';sessPending=fallbackSnapshot;window.__mfSessionReject='';window.__mfSessionFallback=null;
      localStorage.setItem(SESS_KEY,JSON.stringify(fallbackSnapshot));
      spawnUnit=function(type,team,x,y,cmd){
        if(!injected&&sessPending===null&&type===inject.type&&team===inject.team&&x===inject.x&&y===inject.y){
          injected=true;throw new Error('TEST_SESSION_REPLAY_FAILURE');
        }
        return spawnBase.call(this,type,team,x,y,cmd);
      };
      try{deployCarrier();}catch(error){deployError=String(error&&error.stack||error);}finally{spawnUnit=spawnBase;}
      const fresh=sessionFreshDeploymentState();
      recoveryAtomicity.replayFallback={preflight:fallbackChecks,landingReady,inject,injected,deployError,fresh};
      recoveryAtomicity.replayFallback.worked=injected&&!deployError&&fresh.fallback&&
        fresh.fallback.code==='SESSION_RESTORE_REPLAY_FAILED'&&fresh.fallback.fresh===true&&fresh.running&&!fresh.matchLive&&
        fresh.carrier.active&&fresh.carrier.phase===0&&fresh.heroIdx<0&&fresh.playerSeatUnits===0&&
        fresh.playerBuildings===0&&!fresh.pending&&!fresh.sessionStored;
      recoveryAtomicity.worked=recoveryAtomicity.combatOverCap.worked&&recoveryAtomicity.neutralOverCap.worked&&
        recoveryAtomicity.hostileBroodOverCap.worked&&recoveryAtomicity.exactBoundary.worked&&
        recoveryAtomicity.replayFallback.worked;
    }catch(error){recoveryAtomicity.error=String(error&&error.stack||error);}
    for(let i=0;i<AB_CD.length;i++)AB_CD[i]=sessionAbilityCdBefore[i];
    bonusMass=sessionIncomeBefore[0];bonusEnergy=sessionIncomeBefore[1];
    running=false;curMap=sessionMapBefore;curTheme=sessionThemeBefore;META.setup=sessionSetupBefore;
    AI.fac=sessionAiFacBefore;aiFactionSel=sessionAiSelBefore;playerFaction=sessionPlayerFacBefore;
    for(let i=0;i<aiSlots.length;i++)Object.assign(aiSlots[i],sessionAiSlotsBefore[i]);
    playerCommanderId=sessionCommanderBefore;

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
      captureTransfer,realSaveRestore,recoveryAtomicity,plannerPerf,aiSalvage,repeatA,repeatB};
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
  pendingV2ResourcesExact:runtime.realSaveRestore.pendingV2ResourcesExact,
  recoveryCoreStateFailClosed:runtime.realSaveRestore.coreStateFailClosed,
  recoveryCombatCapFailClosed:runtime.recoveryAtomicity.combatOverCap?.worked,
  recoveryNeutralCapFailClosed:runtime.recoveryAtomicity.neutralOverCap?.worked,
  recoveryHostileBroodCapFailClosed:runtime.recoveryAtomicity.hostileBroodOverCap?.worked,
  recoveryExactBoundaryOrder:runtime.recoveryAtomicity.exactBoundary?.worked,
  recoveryReplayFallbackFresh:runtime.recoveryAtomicity.replayFallback?.worked,
  historicalV1BestEffort:runtime.realSaveRestore.historicalV1BestEffort,
  heroProgressionExact:runtime.realSaveRestore.heroProgressionExact,
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
  result:failures.length?'FAIL':'PASS',checks,failures,recoveryReloadE2E,
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
  `- Reload recovery E2E: ${recoveryReloadE2E.status} — ${recoveryReloadE2E.reason}`,
  `- Restore atomicity: combat cap ${runtime.recoveryAtomicity.combatOverCap?.worked?'PASS':'FAIL'}; neutral cap ${runtime.recoveryAtomicity.neutralOverCap?.worked?'PASS':'FAIL'}; hostile Brood cap ${runtime.recoveryAtomicity.hostileBroodOverCap?.worked?'PASS':'FAIL'}; exact boundary/order ${runtime.recoveryAtomicity.exactBoundary?.worked?'PASS':'FAIL'}; replay fallback ${runtime.recoveryAtomicity.replayFallback?.worked?'PASS':'FAIL'}.`,
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
    recoveryAtomicity:runtime.recoveryAtomicity,
    plannerPerf:runtime.plannerPerf,manual:runtime.manual,aiSalvage:runtime.aiSalvage},repeatHash:repeatHashA},null,2));
process.exit(failures.length?1:0);
