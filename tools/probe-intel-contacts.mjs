#!/usr/bin/env node
/* Source-backed IntelContact probe. It boots the manifest-ordered classic
   runtime in Chromium, exercises the real fog/radar sensor paths, and calls
   the contact API that later artillery integration will consume. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {startStaticServer} from './perf-lab/perf-probe-runner.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sha256=value=>createHash('sha256').update(value).digest('hex');
const sourcePaths=['src/intel.js','boot.js','assets/data/manifest.json'];
async function sourceIdentity(){
  const files=[];
  for(const path of sourcePaths){
    const bytes=await readFile(join(root,path));
    files.push({path,bytes:bytes.length,sha256:sha256(bytes)});
  }
  return {files,setSha256:sha256(files.map(F=>`${F.path}:${F.sha256}`).join('\n'))};
}

const startSource=await sourceIdentity();
const manifest=JSON.parse(await readFile(join(root,'assets/data/manifest.json'),'utf8'));
const manifestLoadsIntel=Array.isArray(manifest.order)&&manifest.order.includes('src/intel.js');
const server=await startStaticServer();
const pageErrors=[];
let runtime=null;
try{
  const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1,colorScheme:'dark'});
    page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
    await page.addInitScript(()=>{try{
      localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    }catch{}});
    await page.goto(`${server.url}?intelcontactsprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof updateFog==='function'&&
      typeof intelStampSensors==='function'&&typeof intelContactUpdate==='function'&&
      typeof intelContactGet==='function'&&typeof intelContactList==='function'&&
      typeof intelContactTick==='function'&&typeof spawnUnit==='function'&&typeof addBld==='function',null,
      {timeout:120000});

    runtime=await page.evaluate(()=>{
      const snap=n=>+Number(n).toFixed(6);
      function baseReset(){
        resetWorld();if(typeof stopAttract==='function')stopAttract();
        running=false;paused=true;matchLive=true;gameEnded=false;fogOn=true;stats.t=0;tick=0;
        if(typeof carrier!=='undefined'&&carrier) carrier.active=false;
        fogCov.fill(0);fogSeen.fill(0);fogRadar.fill(0);fogDetect.fill(0);
        intelContactReset();
      }
      const groundType=Math.max(0,TYPES.findIndex(T=>T&&!T.air&&!T.naval&&T.spd>0&&T.r>0));

      /* Player visual coverage is the existing authoritative fogCov path. */
      baseReset();
      const center=findLand(MAP*.42,MAP*.42);
      const observer=spawnUnit(groundType,0,center[0],center[1],-1);
      const near=findLand(ux[observer]+80,uy[observer]);
      const visibleTarget=spawnUnit(groundType,1,near[0],near[1],-1);
      updateFog();
      const visual=intelContactGet(0,visibleTarget,ugen[visibleTarget]);
      const visualCoverage=!!fogCov[intelCell(ux[visibleTarget],uy[visibleTarget])];
      const lastKnown=visual?{x:visual.x,y:visual.y}:null;

      /* Move the real unit outside the sensor bubble. The record must retain
         its sampled coordinates while confidence ages on fixed simulation time. */
      const corners=[[MAP*.86,MAP*.86],[MAP*.14,MAP*.86],[MAP*.86,MAP*.14]];
      let far=findLand(corners[0][0],corners[0][1]),farD=-1;
      for(const P0 of corners){const P=findLand(P0[0],P0[1]),d=(P[0]-ux[observer])**2+(P[1]-uy[observer])**2;if(d>farD){far=P;farD=d;}}
      ux[visibleTarget]=utx[visibleTarget]=far[0];uy[visibleTarget]=uty[visibleTarget]=far[1];
      stats.t=2;updateFog();
      const persisted=intelContactGet(0,visibleTarget,ugen[visibleTarget]);
      const hiddenCoverage=!!fogCov[intelCell(ux[visibleTarget],uy[visibleTarget])];
      stats.t=1;intelContactTick(1);
      const rewind=intelContactGet(0,visibleTarget,ugen[visibleTarget]);
      stats.t=INTEL_CONTACT_TTL.visual+1;intelContactTick();
      const expired=intelContactGet(0,visibleTarget,ugen[visibleTarget]);

      /* The existing uplink stamps the existing radar layer. Calling the real
         sensor pass with a clear visual grid isolates radar-only creation. */
      baseReset();
      const radarOrigin=findLand(MAP*.30,MAP*.30);
      const uplink=addBld('uplink',0,radarOrigin[0],radarOrigin[1],true);
      let radarPoint=findLand(radarOrigin[0]+MAP/FN*16,radarOrigin[1]);
      const choices=[];
      for(let k=0;k<16;k++){
        const a=k*Math.PI/8,P=findLand(radarOrigin[0]+Math.cos(a)*MAP/FN*16,
          radarOrigin[1]+Math.sin(a)*MAP/FN*16);
        const dx=(P[0]-radarOrigin[0])/(MAP/FN),dy=(P[1]-radarOrigin[1])/(MAP/FN),d=Math.hypot(dx,dy);
        if(d>11&&d<21)choices.push({P,d});
      }
      if(choices.length) radarPoint=choices.sort((A,B)=>Math.abs(A.d-16)-Math.abs(B.d-16))[0].P;
      const radarTarget=spawnUnit(groundType,1,radarPoint[0],radarPoint[1],-1);
      fogCov.fill(0);intelStampSensors();
      const radar=intelContactGet(0,radarTarget,ugen[radarTarget]);
      const radarCell=intelCell(ux[radarTarget],uy[radarTarget]);
      const radarEvidence={contact:radar,radarBit:!!(fogRadar[radarCell]&1),visualBit:!!fogCov[radarCell],
        distanceCells:snap(Math.hypot(ux[radarTarget]-uplink.x,uy[radarTarget]-uplink.y)/(MAP/FN))};

      const oldGeneration=ugen[radarTarget];
      ugen[radarTarget]=(oldGeneration+1)|0;
      const generationMismatch=intelContactGet(0,radarTarget,oldGeneration);

      /* Pressure and repeatability use the actual global API with explicit
         dead-slot observations so spawning randomness cannot contaminate the
         deterministic contact contract. */
      function fillLedger(){
        baseReset();
        const total=INTEL_CONTACT_CAP+44;
        for(let i=0;i<total;i++) intelContactUpdate(0,i,'manual',.5,20,i*3,i*5,7,0);
        return intelContactList(0).map(C=>({team:C.team,target:C.target,generation:C.generation,
          x:C.x,y:C.y,source:C.source,confidence:snap(C.confidence),age:snap(C.age),
          timestamp:snap(C.timestamp),expiresAt:snap(C.expiresAt)}));
      }
      const boundedA=fillLedger(),boundedB=fillLedger();
      return {groundType,capacity:INTEL_CONTACT_CAP,visualCoverage,visual,
        persistence:{lastKnown,persisted,rewind,hiddenCoverage,expired},radar:radarEvidence,
        generation:{oldGeneration,current:ugen[radarTarget],oldRecord:generationMismatch},
        bounded:{attempted:INTEL_CONTACT_CAP+44,countA:boundedA.length,countB:boundedB.length,
          firstTarget:boundedA[0]?.target??null,lastTarget:boundedA.at(-1)?.target??null,
          jsonA:JSON.stringify(boundedA),jsonB:JSON.stringify(boundedB)}};
    });
    await page.close();
  }finally{await closePwBrowser().catch(()=>{});}
}finally{await server.close().catch(()=>{});}

const endSource=await sourceIdentity();
const hashA=runtime?sha256(runtime.bounded.jsonA):null,hashB=runtime?sha256(runtime.bounded.jsonB):null;
const visual=runtime?.visual,persisted=runtime?.persistence?.persisted,radar=runtime?.radar?.contact;
const requirements={
  manifestRuntime:{status:manifestLoadsIntel?'PASS':'FAIL',evidence:{manifestLoadsIntel}},
  visibleCreation:{status:runtime?.visualCoverage&&visual?.source==='visual'&&visual?.confidence===1&&
    visual.target>=0&&visual.generation>0?'PASS':'FAIL',evidence:{coverage:runtime?.visualCoverage,contact:visual}},
  radarCreation:{status:runtime?.radar?.radarBit&&!runtime?.radar?.visualBit&&radar?.source==='radar'&&
    radar?.confidence>0&&radar?.confidence<1?'PASS':'FAIL',evidence:runtime?.radar},
  lastKnownPersistence:{status:persisted&&!runtime?.persistence?.hiddenCoverage&&
    persisted.x===runtime?.persistence?.lastKnown?.x&&persisted.y===runtime?.persistence?.lastKnown?.y&&
    persisted.age===2?'PASS':'FAIL',evidence:runtime?.persistence},
  confidenceDecay:{status:persisted&&persisted.confidence>0&&persisted.confidence<visual.confidence?'PASS':'FAIL',
    evidence:{before:visual?.confidence,after:persisted?.confidence,age:persisted?.age}},
  monotonicAge:{status:persisted&&runtime?.persistence?.rewind&&
    runtime.persistence.rewind.age>=persisted.age&&runtime.persistence.rewind.confidence<=persisted.confidence?'PASS':'FAIL',
    evidence:{before:persisted,afterOlderTick:runtime?.persistence?.rewind}},
  expiry:{status:runtime?.persistence?.expired===null?'PASS':'FAIL',evidence:runtime?.persistence?.expired},
  generationMismatch:{status:runtime?.generation?.current!==runtime?.generation?.oldGeneration&&
    runtime?.generation?.oldRecord===null?'PASS':'FAIL',evidence:runtime?.generation},
  boundedCapacity:{status:runtime?.bounded?.countA===runtime?.capacity&&runtime?.bounded?.countB===runtime?.capacity&&
    runtime?.bounded?.attempted>runtime?.capacity?'PASS':'FAIL',evidence:{...runtime?.bounded,jsonA:undefined,jsonB:undefined}},
  deterministicRepeat:{status:hashA!==null&&hashA===hashB?'PASS':'FAIL',evidence:{hashA,hashB}},
  sourceStable:{status:startSource.setSha256===endSource.setSha256?'PASS':'FAIL',
    evidence:{start:startSource.setSha256,end:endSource.setSha256}},
  pageRuntime:{status:pageErrors.length===0?'PASS':'FAIL',evidence:pageErrors}
};
const report={schema:'MassfrontIntelContactsProbeV1',source:startSource,requirements,
  integration:{artilleryContactConsumer:{status:'UNSUPPORTED_NOT_WIRED',reason:'This lane intentionally exposes contact APIs but does not modify artillery callers.'}},
  runtime:{...runtime,bounded:runtime?{...runtime.bounded,jsonA:undefined,jsonB:undefined}:null,
    deterministicHashes:{a:hashA,b:hashB}},pass:Object.values(requirements).every(R=>R.status==='PASS')};
console.log(JSON.stringify(report,null,2));
if(!report.pass)process.exitCode=1;
