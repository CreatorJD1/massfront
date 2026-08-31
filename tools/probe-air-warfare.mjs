#!/usr/bin/env node
/* Stage 5 air-warfare probe. Boots the live classic runtime and exercises
   the documented air authority seams. Missing hooks fail nonzero. This file
   never edits src/** and does not invent passing telemetry. */
import {createHash} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {launchPwBrowser, closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {startStaticServer} from './perf-lab/perf-probe-runner.mjs';

const execFile=promisify(execFileCallback);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const startedUtc=new Date().toISOString();
const runId=startedUtc.replace(/[:.]/g,'-');
const output=join(root,'.tmp','air-warfare','runs',runId);
const SEED=0x41315235;
const REQUIRED_HOOKS=['mfAirIssueMission','mfAirMissionSnapshot','mfAirReset'];
const SNAP_FIELDS={
  mission:['mission','kind','missionKind'],
  phase:['phase'],
  band:['band','altitudeBand','altBand'],
  height:['height','altitude','alt'],
  targetGeneration:['targetGeneration','targetGen','generation'],
  course:['course','heading','yaw'],
  yawRate:['yawRate','turnRate'],
  bank:['bank','roll'],
  pitch:['pitch'],
  passNumber:['passNumber','pass','passCount'],
  releaseCount:['releaseCount','releases'],
  reacquireCount:['reacquireCount','reacquires']
};
const CORE_SOURCE=[
  'src/game/sim.js','src/game/ai.js','src/intel.js','src/ui/render3d.js',
  'src/ui/input.js',
  'boot.js','assets/data/manifest.json'
];
const OPTIONAL_AIR_MODULES=[
  'src/game/air.js','src/air.js','src/game/airwarfare.js','src/game/air-warfare.js'
];

function sha256(value){return createHash('sha256').update(value).digest('hex');}
async function git(args){
  return (await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})).stdout.trimEnd();
}
async function fileIdentity(path){
  const abs=join(root,path);
  if(!existsSync(abs)) return null;
  const bytes=await readFile(abs);
  return {path,bytes:bytes.length,sha256:sha256(bytes),present:true};
}
async function provenance(){
  const files=[];
  for(const path of CORE_SOURCE){
    const row=await fileIdentity(path);
    if(row) files.push(row);
  }
  for(const path of OPTIONAL_AIR_MODULES){
    const row=await fileIdentity(path);
    if(row) files.push(row);
  }
  const probe=await fileIdentity('tools/probe-air-warfare.mjs');
  if(probe) files.push(probe);
  const [head,status]=await Promise.all([
    git(['rev-parse','HEAD']),
    git(['status','--porcelain=v1','--untracked-files=all'])
  ]);
  const entries=status?status.split(/\r?\n/).filter(Boolean):[];
  return {
    head,dirty:entries.length>0,dirtyEntries:entries.length,
    dirtyFingerprint:sha256(status),
    sourceSetSha256:sha256(files.map(F=>`${F.path}:${F.sha256}`).join('\n')),
    files
  };
}
function lineOf(text,re){
  const i=text.split(/\r?\n/).findIndex(line=>re.test(line));
  return i<0?null:i+1;
}
function extractFn(text,name){
  const start=text.search(new RegExp('function\\s+'+name+'\\s*\\('));
  if(start<0) return null;
  let depth=0,seen=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(ch==='{'){depth++;seen=true;}
    else if(ch==='}'){depth--;if(seen&&depth===0) return text.slice(start,i+1);}
  }
  return text.slice(start,start+1800);
}

await mkdir(output,{recursive:true});
const startSource=await provenance();
const simText=existsSync(join(root,'src/game/sim.js'))?await readFile(join(root,'src/game/sim.js'),'utf8'):'';
const aiText=existsSync(join(root,'src/game/ai.js'))?await readFile(join(root,'src/game/ai.js'),'utf8'):'';
const intelText=existsSync(join(root,'src/intel.js'))?await readFile(join(root,'src/intel.js'),'utf8'):'';
const inputText=existsSync(join(root,'src/ui/input.js'))?await readFile(join(root,'src/ui/input.js'),'utf8'):'';
const airModulePath=OPTIONAL_AIR_MODULES.find(path=>existsSync(join(root,path)));
const airText=airModulePath?await readFile(join(root,airModulePath),'utf8'):'';
const crashFn=extractFn(simText,'beginAirCrash')||'';
const staticScan={
  hooks:{
    mfAirIssueMission:lineOf(simText+'\n'+aiText,/function\s+mfAirIssueMission\s*\(/),
    mfAirMissionSnapshot:lineOf(simText+'\n'+aiText,/function\s+mfAirMissionSnapshot\s*\(/),
    mfAirReset:lineOf(simText+'\n'+aiText,/function\s+mfAirReset\s*\(/)
  },
  crashUsesMathRandom:/Math\.random\s*\(/.test(crashFn),
  airFacingProjection:/if\s*\(\s*!T\.air/.test(extractFn(simText,'unitTick')||simText),
  lodUsesCamera:/camBounds\s*\(/.test(extractFn(simText,'unitTick')||'') && /unitTickLod/.test(simText),
  intelContactGet:lineOf(intelText,/^function intelContactGet\(/),
  intelContactRefreshSensors:lineOf(intelText,/^function intelContactRefreshSensors\(/),
  playerMissionWiring:lineOf(inputText,/mfAirIssueMission\s*\(/),
  aiAllocatorWiring:lineOf(aiText+'\n'+airText,/mfAirAiMissionTick\s*\(/)
};

const fail=(id,reason,evidence)=>({id,status:'FAIL',reason,supported:false,evidence:evidence??null});
const pass=(id,evidence)=>({id,status:'PASS',reason:null,supported:true,evidence});

const pageErrors=[];
const consoleErrors=[];
let gpu=null,runtime=null,boot={ok:false,reason:'not-started'},server=null,browser=null,page=null;

try{
  server=await startStaticServer();
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1,colorScheme:'dark'});
  page.setDefaultTimeout(120000);
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error') consoleErrors.push(message.text());});
  await page.addInitScript(seed=>{
    let s=(seed>>>0)||1;
    window.__mfProbeSetRandomSeed=x=>{s=(x>>>0)||1;};
    Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
    try{
      localStorage.setItem('mf_offline','1');
      localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_ap_gate_closed','1');
      localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    }catch{}
  },SEED);
  gpu=await assertHardwareGpu(page);
  await page.goto(`${server.url}?airwarfareprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof spawnUnit==='function'
    &&typeof unitTick==='function'&&typeof TYPES==='object'&&Array.isArray(TYPES),null,{timeout:90000});
  boot={ok:true,reason:null};

  runtime=await page.evaluate(({SEED,REQUIRED_HOOKS,SNAP_FIELDS})=>{
    const DT=1/30,TAU=Math.PI*2;
    const snapN=(v,n=5)=>v==null?null:+Number(v).toFixed(n);
    const angDiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;return d;};
    const typeBy=name=>TYPES.findIndex(T=>T&&T.name===name);
    const wasp=typeBy('Wasp'),raptor=typeBy('Raptor'),kestrel=typeBy('Kestrel');
    const ground=TYPES.findIndex(T=>T&&!T.air&&!T.naval&&T.spd>0&&T.dmg>0&&T.cat!=='hero');
    const hooks={};
    for(const name of REQUIRED_HOOKS) hooks[name]=typeof globalThis[name];
    const optional={
      mfAirLeadPoint:typeof mfAirLeadPoint,
      mfAirLeadPursuit:typeof mfAirLeadPursuit,
      mfAirFireAllowed:typeof mfAirFireAllowed,
      mfAirCanFire:typeof mfAirCanFire,
      mfAirBand:typeof mfAirBand,
      MF_AIR_BAND:typeof MF_AIR_BAND,
      intelContactGet:typeof intelContactGet,
      intelContactRefreshSensors:typeof intelContactRefreshSensors,
      intelStampSensors:typeof intelStampSensors,
      beginAirCrash:typeof beginAirCrash,
      airCrashTick:typeof airCrashTick,
      unitAirAlt:typeof unitAirAlt,
      aiTacticsTick:typeof aiTacticsTick,
      mfAirAiMissionTick:typeof mfAirAiMissionTick,
      intelArtillerySolution:typeof intelArtillerySolution
    };

    function readSnap(i){
      if(typeof mfAirMissionSnapshot!=='function') return {supported:false,missing:Object.keys(SNAP_FIELDS),values:null,raw:null};
      let raw=null;
      try{raw=mfAirMissionSnapshot(i);}catch(error){return {supported:false,missing:Object.keys(SNAP_FIELDS),values:null,raw:null,error:String(error?.message||error)};}
      if(!raw||typeof raw!=='object') return {supported:false,missing:Object.keys(SNAP_FIELDS),values:null,raw};
      const values={},missing=[];
      for(const [canonical,aliases] of Object.entries(SNAP_FIELDS)){
        let found=false,value=null;
        for(const key of aliases){
          if(Object.prototype.hasOwnProperty.call(raw,key)){found=true;value=raw[key];break;}
        }
        if(!found) missing.push(canonical);
        else values[canonical]=value;
      }
      return {supported:missing.length===0,missing,values,raw,rawKeys:Object.keys(raw)};
    }
    function issue(i,kind,payload){
      if(typeof mfAirIssueMission!=='function') return {ok:false,reason:'missing-hook'};
      try{
        const result=mfAirIssueMission(i,kind,payload||{});
        return {ok:result!==false,result};
      }catch(error){return {ok:false,reason:String(error?.message||error)};}
    }
    function hashObj(value){
      return JSON.stringify(value,(k,v)=>typeof v==='number'?snapN(v,6):v);
    }
    function shaish(s){
      let h=0x811c9dc5;
      for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}
      return (h>>>0).toString(16).padStart(8,'0');
    }
    function authHash(i){
      const S=readSnap(i);
      return hashObj({
        x:ux[i],y:uy[i],ang:uang[i],hp:uhp[i],crash:uCrash[i],
        alt:typeof unitAirAlt==='function'?unitAirAlt(i):null,
        tgt:utgt[i],gen:ugen[i],state:ustate[i],
        snap:S.supported?S.values:null
      });
    }
    function step(n){
      for(let k=0;k<n;k++){
        tick++;stats.t+=DT;
        unitTick(DT);
        if(typeof projTick==='function') projTick(DT);
      }
    }
    function stepFog(n,interval=12){
      for(let k=0;k<n;k++){
        step(1);
        if((k%interval)===0){
          if(typeof updateFog==='function') updateFog();
          else if(typeof intelContactRefreshSensors==='function') intelContactRefreshSensors();
        }
      }
    }
    function setCam(x,y,span){
      if(typeof cam!=='undefined'&&cam){cam.x=x;cam.y=y;}
      if(typeof orthoSpan!=='undefined') orthoSpan=span;
      if(typeof distTarget!=='undefined') distTarget=span;
    }
    function baseReset(){
      if(typeof window.__mfProbeSetRandomSeed==='function') window.__mfProbeSetRandomSeed(SEED);
      if(typeof srand==='function') srand(SEED);
      resetWorld();
      if(typeof stopAttract==='function') stopAttract();
      running=false;paused=true;matchLive=true;gameEnded=false;fogOn=false;
      attractOn=false;demoMode=false;perfScale=1;stats.t=0;tick=0;
      if(typeof carrier!=='undefined'&&carrier) carrier.active=false;
      if(typeof mfAirReset==='function') mfAirReset(SEED);
    }
    function spawnAir(type,team,x,y,heading){
      const i=spawnUnit(type,team,x,y,team===0?-1:0);
      if(i<0) return i;
      ux[i]=utx[i]=x;uy[i]=uty[i]=y;
      if(heading!=null) uang[i]=heading;
      usel[i]=0;ucool[i]=0;uhp[i]=uhpm[i];
      return i;
    }
    function nose(i){return uang[i]-Math.PI/2;}
    function wrapFire(shooter,fn){
      const orig=fireProj,log=[];
      fireProj=function(type,team,x,y,tx,ty,speed,dmg,aoe,tgt){
        const slot=orig(type,team,x,y,tx,ty,speed,dmg,aoe,tgt);
        if(team!==uteam[shooter]||Math.hypot(x-ux[shooter],y-uy[shooter])>22) return slot;
        const bearing=Math.atan2(ty-y,tx-x);
        const S=readSnap(shooter);
        log.push({slot,type,team,tgt,t:stats.t,err:Math.abs(angDiff(bearing,nose(shooter))),nose:nose(shooter),
          alt:typeof unitAirAlt==='function'?unitAirAlt(shooter):null,
          band:bandNorm(S.values?.band),phase:phaseNorm(S.values?.phase),mission:phaseNorm(S.values?.mission)});
        return slot;
      };
      try{return fn(log);}finally{fireProj=orig;}
    }
    function phaseNorm(p){
      const s=String(p==null?'':p).toLowerCase().replace(/[_ ]+/g,'-');
      if(s==='pullup'||s==='pull-up') return 'pull-up';
      if(s==='reformation'||s==='reform') return 'reform';
      if(s==='firing-pass'||s==='firingpass'||s==='pass') return 'firing';
      if(s==='acquire'||s==='acquiring') return 'acquire';
      return s;
    }
    function bandNorm(b){
      if(b==null) return null;
      if(typeof b==='number') return ['landing','low','tactical','high','crashing'][b]||String(b);
      const s=String(b).toLowerCase();
      if(s==='land'||s==='landed'||s==='ground') return 'landing';
      if(s==='cruise'||s==='tac'||s==='mid') return 'tactical';
      if(s==='crash'||s==='falling') return 'crashing';
      return phaseNorm(s);
    }
    function hasSubseq(seen,need){
      let j=0;
      for(const item of seen){if(item===need[j]) j++;if(j>=need.length) return true;}
      return false;
    }

    const missingHooks=REQUIRED_HOOKS.filter(name=>typeof globalThis[name]!=='function');
    const scenarios={};

    /* ---- altitude bands ---- */
    (function altitudeBands(){
      if(missingHooks.length){scenarios.altitude= {ok:false,reason:'missing-hook',missingHooks};return;}
      baseReset();
      const cx=MAP*.45,cy=MAP*.45;
      const i=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      if(i<0){scenarios.altitude={ok:false,reason:'spawn-failed'};return;}
      setCam(cx,cy,700);
      const bands=['landing','low','tactical','high'];
      const targets={landing:8,low:27,tactical:58,high:94};
      const samples=[];
      let teleport=false,nonMonotone=false;
      for(const band of bands){
        const startHeight=typeof unitAirAlt==='function'?unitAirAlt(i):null;
        const issued=issue(i,band,{band});
        const heights=[];
        for(let n=0;n<90;n++){
          const before=typeof unitAirAlt==='function'?unitAirAlt(i):null;
          step(1);
          const S=readSnap(i);
          const h=typeof unitAirAlt==='function'?unitAirAlt(i):(S.values&&S.values.height);
          heights.push(snapN(h,4));
          if(before!=null&&h!=null&&Math.abs(h-before)>18) teleport=true;
        }
        const S=readSnap(i);
        samples.push({band,issued:issued.ok,snap:S,heightEnd:heights.at(-1),heights:heights.filter((_,n)=>n%15===0)});
        for(let n=1;n<heights.length;n++){
          if(heights[n]==null||heights[n-1]==null) continue;
          /* Climb/descent may reverse only at the destination, not jitter. */
          if(Math.abs(heights[n]-heights[n-1])>18) teleport=true;
          const direction=Math.sign(targets[band]-startHeight);
          const delta=heights[n]-heights[n-1];
          if(direction&&Math.abs(heights[n-1]-targets[band])>.35&&delta*direction<-.02) nonMonotone=true;
        }
      }
      uhp[i]=0;
      step(4);
      const crashSnap=readSnap(i);
      const crashAlt=typeof unitAirAlt==='function'?unitAirAlt(i):null;
      const observed=new Set(samples.map(S=>{
        const b=S.snap?.values?.band;return bandNorm(b);
      }).filter(Boolean));
      if(uCrash[i]||bandNorm(crashSnap.values?.band)==='crashing') observed.add('crashing');
      scenarios.altitude={
        ok:true,samples,teleport,nonMonotone,crash:{snap:crashSnap,alt:crashAlt,crashing:!!uCrash[i]},
        observed:[...observed],snapshotSupported:samples.every(S=>S.snap.supported),
        heightEnvelope:samples.every(S=>{
          const h=S.heightEnd;
          return S.band==='landing'?h>=5&&h<=12:S.band==='low'?h>=18&&h<=36:
            S.band==='tactical'?h>=45&&h<=72:h>=80&&h<=110;
        })
      };
    })();

    /* ---- altitude is gameplay authority: layers separate and firing obeys envelope ---- */
    (function altitudeAuthority(){
      if(missingHooks.length){scenarios.altitudeAuthority={ok:false,reason:'missing-hook',missingHooks};return;}
      baseReset();
      const cx=MAP*.46,cy=MAP*.46;
      const low=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      const high=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      if(low<0||high<0){scenarios.altitudeAuthority={ok:false,reason:'spawn-failed'};return;}
      issue(low,'low',{band:'low'});issue(high,'high',{band:'high'});
      step(100);
      ux[low]=utx[low]=ux[high]=utx[high]=cx;uy[low]=uty[low]=uy[high]=uty[high]=cy;
      step(12);
      const crossBandDistance=Math.hypot(ux[low]-ux[high],uy[low]-uy[high]);
      const crossBands=[bandNorm(readSnap(low).values?.band),bandNorm(readSnap(high).values?.band)];

      baseReset();
      const sameA=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      const sameB=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      issue(sameA,'low',{band:'low'});issue(sameB,'low',{band:'low'});
      step(100);
      ux[sameA]=utx[sameA]=ux[sameB]=utx[sameB]=cx;uy[sameA]=uty[sameA]=uy[sameB]=uty[sameB]=cy;
      step(12);
      const sameBandDistance=Math.hypot(ux[sameA]-ux[sameB],uy[sameA]-uy[sameB]);

      baseReset();
      const sx=MAP*.38,sy=MAP*.52,tx=sx+270,ty=sy;
      const bomber=spawnAir(raptor>=0?raptor:wasp,0,sx,sy,Math.PI/2);
      const tgt=spawnUnit(ground>=0?ground:0,1,tx,ty,0);
      if(bomber<0||tgt<0){scenarios.altitudeAuthority={ok:false,reason:'fire-spawn-failed'};return;}
      uhp[tgt]=uhpm[tgt]=100000;
      const issued=issue(bomber,'strike',{target:tgt,generation:ugen[tgt],x:tx,y:ty});
      const shots=wrapFire(bomber,log=>{step(240);return log.slice();});
      scenarios.altitudeAuthority={
        ok:true,issued:issued.ok,crossBands,crossBandDistance:snapN(crossBandDistance,4),
        sameBandDistance:snapN(sameBandDistance,4),shots,
        separatedLayers:crossBands[0]==='low'&&crossBands[1]==='high'&&crossBandDistance<=1,
        sameLayerSeparates:sameBandDistance>=2,
        fireEnvelope:shots.length>0&&shots.every(S=>S.band==='low'&&S.alt>=16&&S.alt<=38)
      };
    })();

    /* ---- stationary ground targets must not acquire invented velocity ---- */
    (function stationaryGroundLead(){
      if(missingHooks.length){scenarios.groundLead={ok:false,reason:'missing-hook',missingHooks};return;}
      baseReset();
      const sx=MAP*.39,sy=MAP*.54,tx=sx+310,ty=sy;
      const bomber=spawnAir(raptor>=0?raptor:wasp,0,sx,sy,Math.PI/2);
      const tgt=spawnUnit(ground>=0?ground:0,1,tx,ty,0);
      if(bomber<0||tgt<0){scenarios.groundLead={ok:false,reason:'spawn-failed'};return;}
      uhold[tgt]=1;ustate[tgt]=0;utx[tgt]=ux[tgt];uty[tgt]=uy[tgt];
      uhp[tgt]=uhpm[tgt]=100000;
      const start=[ux[tgt],uy[tgt]],issued=issue(bomber,'strike',{target:tgt,generation:ugen[tgt],x:tx,y:ty});
      const rows=[];
      for(let n=0;n<30;n++){
        step(1);
        const raw=readSnap(bomber).raw,aim=raw?.aim;
        if(Array.isArray(aim)) rows.push({n,aim:[snapN(aim[0],3),snapN(aim[1],3)],
          target:[snapN(ux[tgt],3),snapN(uy[tgt],3)],error:snapN(Math.hypot(aim[0]-ux[tgt],aim[1]-uy[tgt]),4)});
      }
      const targetTravel=Math.hypot(ux[tgt]-start[0],uy[tgt]-start[1]);
      const errors=rows.map(R=>R.error);
      scenarios.groundLead={ok:true,issued:issued.ok,rows:rows.slice(0,12),samples:rows.length,
        targetTravel:snapN(targetTravel,5),maxAimError:errors.length?Math.max(...errors):null};
    })();

    /* ---- movement follows facing ---- */
    (function facing(){
      baseReset();
      const cx=MAP*.5,cy=MAP*.5;
      const i=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      if(i<0){scenarios.facing={ok:false,reason:'spawn-failed'};return;}
      setCam(cx,cy,800);
      if(typeof mfAirIssueMission==='function') issue(i,'intercept',{x:cx,y:cy+420});
      else {ustate[i]=2;utx[i]=cx;uty[i]=cy+420;umarch[i]=1;ufield[i]=-1;}
      const rows=[];
      let prevX=ux[i],prevY=uy[i];
      for(let n=0;n<90;n++){
        step(1);
        const dx=ux[i]-prevX,dy=uy[i]-prevY,spd=Math.hypot(dx,dy);
        const move=spd>0.04?Math.atan2(dy,dx):null;
        const face=nose(i);
        const err=move==null?null:Math.abs(angDiff(move,face));
        if(spd>0.08) rows.push({n,spd:snapN(spd,4),err:snapN(err,4),face:snapN(face,4)});
        prevX=ux[i];prevY=uy[i];
      }
      const errs=rows.map(R=>R.err).filter(v=>v!=null);
      scenarios.facing={
        ok:true,samples:rows.length,maxErr:errs.length?Math.max(...errs):null,
        meanErr:errs.length?errs.reduce((a,b)=>a+b,0)/errs.length:null,rows:rows.slice(0,12)
      };
    })();

    /* ---- firing cone rejects rear/side ---- */
    (function cone(){
      function lock(shooter,tgt){
        if(typeof mfAirIssueMission==='function') issue(shooter,'intercept',{target:tgt,generation:ugen[tgt]});
        ustate[shooter]=2;utgt[shooter]=tgt;ucool[shooter]=0;umarch[shooter]=0;ufield[shooter]=-1;
      }
      baseReset();
      const cx=MAP*.5,cy=MAP*.5;
      const shooter=spawnAir(wasp>=0?wasp:kestrel,0,cx,cy,Math.PI/2);
      const rear=spawnAir(wasp>=0?wasp:kestrel,1,cx-40,cy,Math.PI/2);
      const side=spawnAir(wasp>=0?wasp:kestrel,1,cx,cy+40,0);
      const front=spawnAir(wasp>=0?wasp:kestrel,1,cx+70,cy,Math.PI/2);
      if(shooter<0||rear<0||side<0||front<0){scenarios.cone={ok:false,reason:'spawn-failed'};return;}
      setCam(cx,cy,800);
      uang[shooter]=Math.PI/2;
      const rearAll=wrapFire(shooter,log=>{lock(shooter,rear);step(12);return log.slice();});
      const rearShots=rearAll.filter(S=>S.err>1.05);
      const sideAll=wrapFire(shooter,log=>{lock(shooter,side);ucool[shooter]=0;uang[shooter]=Math.PI/2;step(12);return log.slice();});
      const sideShots=sideAll.filter(S=>S.err>0.70&&S.err<1.40);
      const frontAll=wrapFire(shooter,log=>{lock(shooter,front);ucool[shooter]=0;uang[shooter]=Math.PI/2;step(18);return log.slice();});
      const frontShots=frontAll;
      const api=typeof mfAirFireAllowed==='function'?mfAirFireAllowed:(typeof mfAirCanFire==='function'?mfAirCanFire:null);
      let apiProbe=null;
      if(api){
        /* Probe absolute bearings from a known east-facing attitude; the live
           firing samples above already validate the turning aircraft. */
        uang[shooter]=Math.PI/2;
        apiProbe={
          rear:!!api(shooter,Math.PI),
          side:!!api(shooter,Math.PI/2),
          front:!!api(shooter,0)
        };
      }
      scenarios.cone={
        ok:true,rearShots:rearShots.length,sideShots:sideShots.length,
        frontShots:frontShots.length,apiProbe,frontSample:frontShots.slice(0,4),
        rearSample:rearAll.slice(0,4),sideSample:sideAll.slice(0,4)
      };
    })();

    /* ---- deterministic lead pursuit ---- */
    (function lead(){
      baseReset();
      const cx=MAP*.42,cy=MAP*.50;
      const hunter=spawnAir(kestrel>=0?kestrel:wasp,0,cx,cy,0);
      const prey=spawnAir(wasp>=0?wasp:kestrel,1,cx+180,cy-40,0);
      if(hunter<0||prey<0){scenarios.lead={ok:false,reason:'spawn-failed'};return;}
      setCam(cx+80,cy,900);
      uang[prey]=0; /* nose +x */
      utx[prey]=ux[prey]+700;uty[prey]=uy[prey];
      if(typeof mfAirIssueMission==='function') issue(hunter,'intercept',{target:prey,generation:ugen[prey]});
      else {ustate[hunter]=2;utgt[hunter]=prey;utx[hunter]=ux[prey];uty[hunter]=uy[prey];}
      const leadFn=typeof mfAirLeadPoint==='function'?mfAirLeadPoint:(typeof mfAirLeadPursuit==='function'?mfAirLeadPursuit:null);
      const leads=[];
      const hashes=[];
      let prevPX=ux[prey],prevPY=uy[prey];
      for(let n=0;n<48;n++){
        uy[prey]+=1.8;
        step(1);
        let point=null,info=null;
        if(typeof mfAirTargetInfo==='function') info=mfAirTargetInfo(prey);
        if(typeof mfAirLeadPoint==='function'&&info){
          try{point=mfAirLeadPoint(hunter,TYPES[utype[hunter]],info);}catch(error){point={error:String(error?.message||error)};}
        }else if(leadFn){
          try{point=leadFn(hunter,prey);}catch(error){point={error:String(error?.message||error)};}
        }else{
          const S=readSnap(hunter);
          point=S.values&&S.values.rawLead?S.values.rawLead:null;
        }
        const px=point&&(point.x??point[0]),py=point&&(point.y??point[1]);
        if(px!=null&&py!=null){
          const vx=info?.vx??(ux[prey]-prevPX),vy=info?.vy??(uy[prey]-prevPY);
          const ahead=(px-ux[prey])*vx+(py-uy[prey])*vy;
          leads.push({n,ahead:snapN(ahead,4),x:snapN(px,3),y:snapN(py,3),tx:snapN(ux[prey],3),ty:snapN(uy[prey],3)});
        }
        prevPX=ux[prey];prevPY=uy[prey];
        hashes.push(authHash(hunter)+'|'+authHash(prey));
      }
      baseReset();
      const hunterB=spawnAir(kestrel>=0?kestrel:wasp,0,cx,cy,0);
      const preyB=spawnAir(wasp>=0?wasp:kestrel,1,cx+180,cy-40,0);
      uang[preyB]=0;utx[preyB]=ux[preyB]+700;uty[preyB]=uy[preyB];
      if(typeof mfAirIssueMission==='function') issue(hunterB,'intercept',{target:preyB,generation:ugen[preyB]});
      else {ustate[hunterB]=2;utgt[hunterB]=preyB;utx[hunterB]=ux[preyB];uty[hunterB]=uy[preyB];}
      const hashesB=[];
      for(let n=0;n<48;n++){
        uy[preyB]+=1.8;step(1);
        if(typeof mfAirTargetInfo==='function'){
          const info=mfAirTargetInfo(preyB);
          if(typeof mfAirLeadPoint==='function')mfAirLeadPoint(hunterB,TYPES[utype[hunterB]],info);
          else if(leadFn)leadFn(hunterB,preyB);
        }else if(leadFn)leadFn(hunterB,preyB);
        hashesB.push(authHash(hunterB)+'|'+authHash(preyB));
      }
      const aheadCount=leads.filter(L=>L.ahead>0).length;
      const steady=leads.filter(L=>L.n>=12),steadyAhead=steady.filter(L=>L.ahead>0).length;
      scenarios.lead={
        ok:true,leadApi:!!leadFn,samples:leads.length,aheadCount,steadySamples:steady.length,steadyAhead,
        firstLeads:leads.slice(0,6),
        deterministic:hashes.join('\n')===hashesB.join('\n'),
        hashA:hashes.length?shaish(hashes.join('\n')):null,
        hashB:hashesB.length?shaish(hashesB.join('\n')):null
      };
    })();

    /* ---- CAP intercept / return ---- */
    (function cap(){
      if(missingHooks.length){scenarios.cap={ok:false,reason:'missing-hook',missingHooks};return;}
      baseReset();
      const ax=MAP*.48,ay=MAP*.48;
      const capU=spawnAir(wasp>=0?wasp:kestrel,0,ax,ay,Math.PI/2);
      if(capU<0){scenarios.cap={ok:false,reason:'spawn-failed'};return;}
      setCam(ax,ay,900);
      const issued=issue(capU,'cap',{x:ax,y:ay,radius:220});
      const before=[];
      for(let n=0;n<40;n++){step(1);before.push(phaseNorm(readSnap(capU).values?.phase||readSnap(capU).values?.mission));}
      const hostile=spawnAir(wasp>=0?wasp:kestrel,1,ax+90,ay+20,Math.PI);
      const mid=[];
      const midDebug=[];
      for(let n=0;n<90;n++){
        step(1);const S=readSnap(capU).values||{};
        mid.push(phaseNorm(S.phase||S.mission));
        if((n%15)===0)midDebug.push({
          n,mission:S.mission,phase:S.phase,target:S.target,state:ustate[capU],
          candidate:typeof mfAirAcquire==='function'?mfAirAcquire(capU,TYPES[utype[capU]]):null,
          hostileAlive:hostile>=0?!!ualive[hostile]:false,
          hostileTargetable:hostile>=0?!!intelCanTarget(hostile,uteam[capU]):false,
          distance:hostile>=0?+Math.hypot(ux[hostile]-ux[capU],uy[hostile]-uy[capU]).toFixed(3):null
        });
      }
      if(hostile>=0) killUnit(hostile,true);
      const after=[];
      for(let n=0;n<90;n++){step(1);after.push(phaseNorm(readSnap(capU).values?.phase||readSnap(capU).values?.mission));}
      const missions=s=>[...new Set(s.filter(Boolean))];
      scenarios.cap={
        ok:true,issued:issued.ok,
        before:missions(before),mid:missions(mid),after:missions(after),
        midDebug,
        interceptSeen:mid.some(p=>/intercept|engage|firing|ingress|acquire/.test(p||'')),
        returned:after.some(p=>/cap|patrol|orbit|hold/.test(p||''))
      };
    })();

    /* ---- escort holds formation, intercepts a threat, then returns ---- */
    (function escort(){
      if(missingHooks.length){scenarios.escort={ok:false,reason:'missing-hook',missingHooks};return;}
      baseReset();
      const ax=MAP*.43,ay=MAP*.44;
      const anchor=spawnAir(raptor>=0?raptor:wasp,0,ax,ay,Math.PI/2);
      const escortU=spawnAir(wasp>=0?wasp:kestrel,0,ax-80,ay,Math.PI/2);
      if(anchor<0||escortU<0){scenarios.escort={ok:false,reason:'spawn-failed'};return;}
      ustate[anchor]=1;utx[anchor]=ax+240;uty[anchor]=ay;umarch[anchor]=1;ufield[anchor]=-1;
      const issued=issue(escortU,'escort',{x:ax,y:ay,escort:anchor,escortGeneration:ugen[anchor]});
      step(80);
      const formationDistance=Math.hypot(ux[escortU]-ux[anchor],uy[escortU]-uy[anchor]);
      const hostile=spawnAir(wasp>=0?wasp:kestrel,1,ux[anchor]+90,uy[anchor]+12,Math.PI);
      const combat=[];
      for(let n=0;n<100;n++){
        step(1);const S=readSnap(escortU).values||{};
        combat.push({mission:phaseNorm(S.mission),phase:phaseNorm(S.phase),target:readSnap(escortU).raw?.target});
      }
      if(hostile>=0&&ualive[hostile]) killUnit(hostile,true);
      let returnedAt=null;
      for(let n=0;n<450;n++){
        step(1);const E=readSnap(escortU),d=Math.hypot(ux[escortU]-ux[anchor],uy[escortU]-uy[anchor]);
        if(phaseNorm(E.values?.mission)==='escort'&&d<=130){returnedAt=n;break;}
      }
      const end=readSnap(escortU),returnDistance=Math.hypot(ux[escortU]-ux[anchor],uy[escortU]-uy[anchor]);
      scenarios.escort={ok:true,issued:issued.ok,formationDistance:snapN(formationDistance,3),
        interceptSeen:combat.some(R=>R.mission==='intercept'&&R.target===hostile),
        returnedMission:phaseNorm(end.values?.mission),returnedAt,returnDistance:snapN(returnDistance,3),end};
    })();

    /* ---- exercise the real AI tactics allocator, not the authority helper alone ---- */
    (function aiAllocator(){
      if(typeof aiTacticsTick!=='function'){scenarios.aiAllocator={ok:false,reason:'missing-aiTacticsTick'};return;}
      baseReset();
      const ax=MAP*.55,ay=MAP*.55;
      if(typeof AI!=='undefined'&&AI) AI.base={x:ax,y:ay};
      const fighter=spawnAir(wasp>=0?wasp:kestrel,1,ax,ay,Math.PI);
      const bomber=spawnAir(raptor>=0?raptor:wasp,1,ax+18,ay,Math.PI);
      const scout=spawnAir(kestrel>=0?kestrel:wasp,1,ax-18,ay,Math.PI);
      const enemyAir=spawnAir(wasp>=0?wasp:kestrel,0,ax-170,ay,0);
      const enemyGround=spawnUnit(ground>=0?ground:0,0,ax+170,ay,0);
      if([fighter,bomber,scout,enemyAir,enemyGround].some(i=>i<0)){
        scenarios.aiAllocator={ok:false,reason:'spawn-failed'};return;
      }
      aiTacticsTick(.8);
      const rows={fighter:readSnap(fighter),bomber:readSnap(bomber),scout:readSnap(scout)};
      scenarios.aiAllocator={ok:true,rows,expected:{fighter:'intercept',bomber:'strike',scout:'recon'},
        targets:{enemyAir,enemyGround}};
    })();

    /* ---- ground strike ingress-release-pull-up-egress-reform ---- */
    (function strike(){
      if(missingHooks.length){scenarios.strike={ok:false,reason:'missing-hook',missingHooks};return;}
      baseReset();
      const sx=MAP*.40,sy=MAP*.52,tx=sx+260,ty=sy;
      const bomber=spawnAir(raptor>=0?raptor:wasp,0,sx,sy,Math.PI/2);
      const tgt=spawnUnit(ground>=0?ground:0,1,tx,ty,0);
      if(bomber<0||tgt<0){scenarios.strike={ok:false,reason:'spawn-failed'};return;}
      setCam((sx+tx)*.5,sy,900);
      const issued=issue(bomber,'strike',{target:tgt,generation:ugen[tgt],x:tx,y:ty});
      const phases=[],releases=[];
      let lastRelease=null;
      uhp[tgt]=uhpm[tgt]=100000;
      const shots=wrapFire(bomber,log=>{
        for(let n=0;n<420;n++){
          step(1);
          const S=readSnap(bomber);
          const phase=phaseNorm(S.values?.phase);
          if(phase&&phases[phases.length-1]!==phase) phases.push(phase);
          const rel=S.values?S.values.releaseCount:null;
          if(rel!=null){
            releases.push(rel);
            lastRelease=rel;
          }
        }
        return log.slice();
      });
      const need=['ingress','alignment','release','pull-up','egress','reform'];
      scenarios.strike={
        ok:true,issued:issued.ok,phases,need,
        sequence:hasSubseq(phases,need),
        releaseCount:lastRelease,actualShots:shots.length,shots:shots.slice(0,8),
        snapshotSupported:readSnap(bomber).supported
      };
    })();

    /* ---- pass phases must complete by reaching maneuver geometry, not timers ---- */
    (function geometryPass(){
      function run(kind){
        baseReset();
        const sx=MAP*.41,sy=MAP*.47;
        const aircraft=spawnAir(kind==='strike'?(raptor>=0?raptor:wasp):(wasp>=0?wasp:kestrel),0,sx,sy,Math.PI/2);
        const target=kind==='strike'?spawnUnit(ground>=0?ground:0,1,sx+240,sy,0):spawnAir(wasp>=0?wasp:kestrel,1,sx+150,sy,Math.PI);
        if(aircraft<0||target<0)return {ok:false,reason:'spawn-failed'};
        uhp[target]=uhpm[target]=100000;
        issue(aircraft,kind,{target,generation:ugen[target],x:ux[target],y:uy[target]});
        let released=false;
        for(let n=0;n<240;n++){
          step(1);const p=phaseNorm(readSnap(aircraft).values?.phase);
          if(p==='release'||p==='pull-up'){released=true;break;}
        }
        if(!released)return {ok:false,reason:'no-release-phase'};
        const fixed=[ux[aircraft],uy[aircraft]],before=readSnap(aircraft),phases=[];
        /* Hold shorter than the documented recovery timeout. A geometry gate
           must not advance merely because ordinary phase time elapsed; the
           longer timeout remains a valid anti-stall escape hatch. */
        for(let n=0;n<45;n++){
          step(1);ux[aircraft]=utx[aircraft]=fixed[0];uy[aircraft]=uty[aircraft]=fixed[1];
          const p=phaseNorm(readSnap(aircraft).values?.phase);if(p&&phases.at(-1)!==p)phases.push(p);
        }
        const after=readSnap(aircraft),travel=Math.hypot(ux[aircraft]-fixed[0],uy[aircraft]-fixed[1]);
        const progressed=kind==='strike'?phases.some(p=>p==='egress'||p==='reform'||p==='ingress'):
          phases.some(p=>p==='extend'||p==='reacquire'||p==='ingress');
        return {ok:true,before,after,phases,travel:snapN(travel,5),progressedWhilePinned:progressed};
      }
      const intercept=run('intercept'),strike=run('strike');
      scenarios.geometryPass={ok:intercept.ok&&strike.ok,intercept,strike};
    })();

    /* ---- recon uses IntelContact ---- */
    (function recon(){
      if(missingHooks.length){scenarios.recon={ok:false,reason:'missing-hook',missingHooks};return;}
      if(typeof intelContactGet!=='function'||typeof intelArtillerySolution!=='function'){
        scenarios.recon={ok:false,reason:'missing-intel-path'};return;
      }
      baseReset();
      fogOn=true;
      if(typeof intelContactReset==='function') intelContactReset();
      const ox=MAP*.32,oy=MAP*.32;
      const scout=spawnAir(kestrel>=0?kestrel:wasp,0,ox,oy,Math.PI/2);
      const hid=spawnUnit(ground>=0?ground:0,1,ox+620,oy,0);
      if(scout<0||hid<0){scenarios.recon={ok:false,reason:'spawn-failed'};return;}
      setCam(ox,oy,800);
      uhold[hid]=1;ustate[hid]=0;utx[hid]=ux[hid];uty[hid]=uy[hid];
      const issued=issue(scout,'recon',{x:ux[hid],y:uy[hid]});
      let contact=null,atTick=null,missionAtContact=null;
      for(let n=0;n<420;n++){
        /* The contact must first be authored by mfAirReconSweep through the
           fixed-step air mission. Fog refresh may later supersede it with a
           stronger visual observation, which is valid sensor fusion. */
        step(1);
        contact=intelContactGet(0,hid,ugen[hid]);
        if(contact){atTick=n;missionAtContact=phaseNorm(readSnap(scout).values?.mission);break;}
      }
      const sampled={x:contact?contact.x:null,y:contact?contact.y:null,source:contact?contact.source:null};
      const solution=contact?intelArtillerySolution(0,{target:hid,generation:ugen[hid]},stats.t):null;
      issue(scout,'rtb',{x:ox,y:oy});
      stepFog(18,3);
      const persisted=intelContactGet(0,hid,ugen[hid]);
      scenarios.recon={
        ok:true,issued:issued.ok,contact,sampled,atTick,missionAtContact,solution,persisted,
        scoutTravel:snapN(Math.hypot(ux[scout]-ox,uy[scout]-oy),3),usedIntelGet:true,
        lastKnownHeld:!!(persisted&&sampled.x!=null&&persisted.x===sampled.x&&persisted.y===sampled.y),
        semanticRecon:missionAtContact==='recon'&&contact?.source==='aerial',
        artilleryHandoff:!!(solution?.eligible&&solution.target===hid&&solution.generation===ugen[hid]&&
          solution.x===sampled.x&&solution.y===sampled.y)
      };
    })();

    /* ---- crash repeatability vs ambient RNG ---- */
    (function crash(){
      function runCrash(extraRandom){
        if(typeof window.__mfProbeSetRandomSeed==='function') window.__mfProbeSetRandomSeed(SEED);
        if(typeof srand==='function') srand(SEED);
        resetWorld();if(typeof stopAttract==='function') stopAttract();
        running=false;paused=true;matchLive=true;fogOn=false;perfScale=1;stats.t=0;tick=0;
        if(typeof mfAirReset==='function') mfAirReset(SEED);
        const i=spawnAir(wasp>=0?wasp:kestrel,0,MAP*.5,MAP*.5,Math.PI/2);
        if(i<0) return {ok:false,reason:'spawn-failed'};
        uang[i]=Math.PI/2;ux[i]=utx[i]=MAP*.5;uy[i]=uty[i]=MAP*.5;
        setCam(MAP*.5,MAP*.5,700);
        step(6);
        if(extraRandom) for(let n=0;n<64;n++) Math.random();
        if(typeof beginAirCrash!=='function') return {ok:false,reason:'missing-beginAirCrash'};
        beginAirCrash(i);
        const traj=[];
        for(let n=0;n<180 && uCrash[i];n++){
          airCrashTick(i,DT);
          traj.push([snapN(ux[i],4),snapN(uy[i],4),snapN(ualt[i],4),
            snapN(uCvx[i],4),snapN(uCvy[i],4),snapN(uCvz[i],4),
            snapN(uCpitch[i],4),snapN(uCroll[i],4),snapN(uCspin[i],4)]);
        }
        return {ok:true,alive:!!ualive[i],crash:!!uCrash[i],steps:traj.length,json:JSON.stringify(traj)};
      }
      const a=runCrash(false),b=runCrash(false),c=runCrash(true);
      scenarios.crash={
        ok:a.ok&&b.ok,a,b,c,
        repeatable:a.ok&&b.ok&&a.json===b.json,
        ambientCoupled:a.ok&&c.ok&&a.json!==c.json
      };
    })();

    /* ---- camera invariance ---- */
    (function camera(){
      function runAt(camX,camY,span){
        if(typeof window.__mfProbeSetRandomSeed==='function') window.__mfProbeSetRandomSeed(SEED);
        if(typeof srand==='function') srand(SEED);
        resetWorld();if(typeof stopAttract==='function') stopAttract();
        running=false;paused=true;matchLive=true;fogOn=false;perfScale=1;stats.t=0;tick=0;
        if(typeof mfAirReset==='function') mfAirReset(SEED);
        const hx=MAP*.46,hy=MAP*.50;
        const hunter=spawnAir(kestrel>=0?kestrel:wasp,0,hx,hy,Math.PI/2);
        const prey=spawnAir(wasp>=0?wasp:kestrel,1,hx+160,hy-30,0);
        if(hunter<0||prey<0) return {ok:false,reason:'spawn-failed'};
        usel[hunter]=0;usel[prey]=0;
        setCam(camX,camY,span);
        if(typeof mfAirIssueMission==='function') issue(hunter,'intercept',{target:prey,generation:ugen[prey]});
        else {ustate[hunter]=2;utgt[hunter]=prey;utx[hunter]=ux[prey];uty[hunter]=uy[prey];umarch[hunter]=1;ufield[hunter]=-1;}
        const frames=[];
        for(let n=0;n<72;n++){
          uy[prey]+=1.4;
          step(1);
          frames.push(authHash(hunter)+'#'+authHash(prey)+'#'+pHigh);
        }
        return {ok:true,json:JSON.stringify(frames),onScreen:typeof unitOnCam==='function'&&typeof camBounds==='function'?unitOnCam(ux[hunter],uy[hunter],camBounds()):null};
      }
      const near=runAt(MAP*.46,MAP*.50,520);
      const far=runAt(80,80,280);
      scenarios.camera={
        ok:near.ok&&far.ok,nearOk:near.ok,farOk:far.ok,
        identical:near.ok&&far.ok&&near.json===far.json,
        nearOnScreen:near.onScreen,farOnScreen:far.onScreen
      };
    })();

    /* ---- every reported behavior gets an independent fixed-seed repeat hash ---- */
    (function deterministicRepeats(){
      function digest(ids,extra){
        return shaish(hashObj({units:ids.filter(i=>i>=0).map(i=>authHash(i)),pHigh,
          contacts:typeof intelContactList==='function'?intelContactList(0,0):null,extra}));
      }
      function run(name){
        baseReset();
        const x=MAP*.45,y=MAP*.46,ids=[];let extra=null;
        if(name==='altitude'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,0);ids.push(a);
          for(const band of ['landing','low','tactical','high']){issue(a,band,{band});step(45);}
        }else if(name==='altitudeAuthority'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,0),b=spawnAir(wasp>=0?wasp:kestrel,0,x,y,0);ids.push(a,b);
          issue(a,'low',{band:'low'});issue(b,'high',{band:'high'});step(100);
        }else if(name==='groundLead'||name==='strike'||name==='geometryPass'){
          const a=spawnAir(raptor>=0?raptor:wasp,0,x,y,Math.PI/2),t=spawnUnit(ground>=0?ground:0,1,x+250,y,0);ids.push(a,t);
          uhold[t]=1;ustate[t]=0;uhp[t]=uhpm[t]=100000;issue(a,'strike',{target:t,generation:ugen[t],x:ux[t],y:uy[t]});
          const shots=wrapFire(a,log=>{step(name==='groundLead'?35:210);return log.length;});extra={shots};
        }else if(name==='facing'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,Math.PI/2);ids.push(a);issue(a,'intercept',{x:x,y:y+360});step(90);
        }else if(name==='cone'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,Math.PI/2),t=spawnAir(wasp>=0?wasp:kestrel,1,x+70,y,Math.PI);ids.push(a,t);
          issue(a,'intercept',{target:t,generation:ugen[t]});ustate[a]=2;utgt[a]=t;ucool[a]=0;
          const shots=wrapFire(a,log=>{step(32);return log.length;});extra={shots};
        }else if(name==='lead'){
          const a=spawnAir(kestrel>=0?kestrel:wasp,0,x,y,0),t=spawnAir(wasp>=0?wasp:kestrel,1,x+180,y,0);ids.push(a,t);
          issue(a,'intercept',{target:t,generation:ugen[t]});for(let n=0;n<60;n++){uy[t]+=1.2;step(1);}
        }else if(name==='cap'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,0),t=spawnAir(wasp>=0?wasp:kestrel,1,x+100,y,Math.PI);ids.push(a,t);
          issue(a,'cap',{x,y,radius:220});step(120);
        }else if(name==='escort'){
          const anchor=spawnAir(raptor>=0?raptor:wasp,0,x,y,0),a=spawnAir(wasp>=0?wasp:kestrel,0,x-70,y,0),t=spawnAir(wasp>=0?wasp:kestrel,1,x+100,y,Math.PI);ids.push(anchor,a,t);
          issue(a,'escort',{escort:anchor,escortGeneration:ugen[anchor],x,y});step(140);
        }else if(name==='aiAllocator'){
          if(typeof AI!=='undefined'&&AI)AI.base={x,y};
          const f=spawnAir(wasp>=0?wasp:kestrel,1,x,y,0),b=spawnAir(raptor>=0?raptor:wasp,1,x+15,y,0),s=spawnAir(kestrel>=0?kestrel:wasp,1,x-15,y,0),
            ea=spawnAir(wasp>=0?wasp:kestrel,0,x-160,y,Math.PI),eg=spawnUnit(ground>=0?ground:0,0,x+160,y,0);ids.push(f,b,s,ea,eg);
          if(typeof aiTacticsTick==='function')aiTacticsTick(.8);step(10);
        }else if(name==='recon'){
          fogOn=true;if(typeof intelContactReset==='function')intelContactReset();
          const a=spawnAir(kestrel>=0?kestrel:wasp,0,x,y,0),t=spawnUnit(ground>=0?ground:0,1,x+520,y,0);ids.push(a,t);
          issue(a,'recon',{x:ux[t],y:uy[t]});stepFog(300,6);
        }else if(name==='crash'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,0);ids.push(a);uhp[a]=0;step(90);
        }else if(name==='camera'){
          const a=spawnAir(wasp>=0?wasp:kestrel,0,x,y,0);ids.push(a);setCam(60,60,260);issue(a,'intercept',{x:x+300,y});step(90);
        }
        return digest(ids,extra);
      }
      const names=['altitude','altitudeAuthority','groundLead','facing','cone','lead','cap','escort','aiAllocator','strike','geometryPass','recon','crash','camera'];
      const rows={};
      for(const name of names){const a=run(name),b=run(name);rows[name]={hashA:a,hashB:b,identical:a===b};}
      scenarios.determinism={ok:true,rows,allIdentical:Object.values(rows).every(R=>R.identical)};
    })();

    return {
      types:{wasp,raptor,kestrel,ground},
      hooks,optional,missingHooks,
      snapshotProbe:(()=>{
        baseReset();
        const i=spawnAir(wasp>=0?wasp:0,0,MAP*.5,MAP*.5,0);
        return i>=0?readSnap(i):{supported:false,missing:Object.keys(SNAP_FIELDS),values:null};
      })(),
      scenarios
    };
  },{SEED,REQUIRED_HOOKS,SNAP_FIELDS});
}catch(error){
  if(!boot.ok) boot={ok:false,reason:String(error?.stack||error)};
  else boot={ok:true,reason:'evaluate-failed:'+String(error?.stack||error)};
}finally{
  if(page) await page.close().catch(()=>{});
  if(browser) await closePwBrowser(browser).catch(()=>{});
  else await closePwBrowser().catch(()=>{});
  if(server) await server.close().catch(()=>{});
}

const endSource=await provenance();
const S=runtime?.scenarios||{};
function check(id,ok,reason,evidence,supported=true){
  if(!boot.ok) return fail(id,'boot-failed',{boot});
  if(ok) return pass(id,evidence);
  return {id,status:'FAIL',reason:reason||'assertion-failed',supported,evidence:evidence??null};
}
const missing=runtime?.missingHooks||REQUIRED_HOOKS;
const hookFail=missing.length>0;
const checks=[
  check('required-hooks',!hookFail&&REQUIRED_HOOKS.every(n=>runtime?.hooks?.[n]==='function'),
    hookFail?'missing-hook':'hook-type',
    {hooks:runtime?.hooks,missing,staticScan:staticScan.hooks},!hookFail),
  check('snapshot-contract',!!runtime?.snapshotProbe?.supported,
    runtime?.snapshotProbe?'missing-snapshot-fields':'missing-hook',
    runtime?.snapshotProbe,!!runtime?.snapshotProbe?.supported),
  check('altitude-bands',(()=>{
    const A=S.altitude;if(!A||!A.ok) return false;
    const need=['landing','low','tactical','high','crashing'];
    return A.snapshotSupported&&!A.teleport&&!A.nonMonotone&&A.heightEnvelope&&need.every(b=>A.observed.includes(b));
  })(),S.altitude?.reason||'bands-incomplete-nonmonotone-or-out-of-envelope',S.altitude,!!S.altitude?.ok),
  check('altitude-layer-separation',(()=>{
    const A=S.altitudeAuthority;return !!(A?.ok&&A.separatedLayers&&A.sameLayerSeparates);
  })(),S.altitudeAuthority?.reason||'altitude-bands-do-not-control-separation',S.altitudeAuthority,!!S.altitudeAuthority?.ok),
  check('altitude-fire-envelope',(()=>{
    const A=S.altitudeAuthority;return !!(A?.ok&&A.issued&&A.fireEnvelope);
  })(),S.altitudeAuthority?.reason||'real-projectile-release-outside-low-band-envelope',S.altitudeAuthority,!!S.altitudeAuthority?.ok),
  check('stationary-ground-target-lead',(()=>{
    const G=S.groundLead;return !!(G?.ok&&G.issued&&G.samples>=5&&G.targetTravel<=.1&&G.maxAimError<=1.5);
  })(),S.groundLead?.reason||'stationary-ground-target-has-invented-velocity',S.groundLead,!!S.groundLead?.ok),
  check('movement-follows-facing',(()=>{
    const F=S.facing;if(!F||!F.ok||F.maxErr==null) return false;
    return F.samples>=8&&F.maxErr<=0.45;
  })(),S.facing?.reason||'heading-velocity-mismatch',S.facing,!!S.facing?.ok),
  check('firing-cone-rejects-rear-side',(()=>{
    const C=S.cone;if(!C||!C.ok) return false;
    return C.rearShots===0&&C.sideShots===0&&C.frontShots>0&&
      (!C.apiProbe||(C.apiProbe.rear===false&&C.apiProbe.side===false&&C.apiProbe.front===true));
  })(),S.cone?.reason||(!(S.cone&&(S.cone.frontShots||S.cone.rearShots||S.cone.sideShots))?'no-shot-evidence':'rear-or-side-shot'),S.cone,!!S.cone?.ok),
  check('deterministic-lead-pursuit',(()=>{
    const L=S.lead;if(!L||!L.ok) return false;
    return L.deterministic&&L.steadySamples>=12&&L.steadyAhead>=Math.max(1,Math.floor(L.steadySamples*0.5));
  })(),S.lead?.reason||'lead-missing-or-nondeterministic',S.lead,!!S.lead?.ok),
  check('cap-intercept-return',(()=>{
    const C=S.cap;if(!C||!C.ok) return false;
    return C.issued&&C.interceptSeen&&C.returned;
  })(),S.cap?.reason||'cap-did-not-intercept-or-return',S.cap,!!S.cap?.ok),
  check('escort-intercept-return',(()=>{
    const E=S.escort;if(!E||!E.ok) return false;
    return E.issued&&E.formationDistance<=130&&E.interceptSeen&&E.returnedMission==='escort'&&E.returnDistance<=130;
  })(),S.escort?.reason||'escort-did-not-hold-intercept-and-return',S.escort,!!S.escort?.ok),
  check('ai-mission-allocation',(()=>{
    const A=S.aiAllocator;if(!A||!A.ok) return false;
    return phaseNormNode(A.rows?.fighter?.values?.mission)==='intercept'&&
      phaseNormNode(A.rows?.bomber?.values?.mission)==='strike'&&
      phaseNormNode(A.rows?.scout?.values?.mission)==='recon';
  })(),S.aiAllocator?.reason||'aiTacticsTick-did-not-allocate-air-missions',S.aiAllocator,!!S.aiAllocator?.ok),
  check('ground-strike-phase-cycle',(()=>{
    const G=S.strike;if(!G||!G.ok) return false;
    return G.issued&&G.sequence&&G.releaseCount>=1&&G.actualShots>0;
  })(),S.strike?.reason||'strike-phases-incomplete',S.strike,!!S.strike?.ok),
  check('geometry-gated-pass-completion',(()=>{
    const G=S.geometryPass;if(!G||!G.ok) return false;
    return !G.intercept.progressedWhilePinned&&!G.strike.progressedWhilePinned;
  })(),S.geometryPass?.reason||'pass-phases-progressed-without-reaching-maneuver-geometry',S.geometryPass,!!S.geometryPass?.ok),
  check('recon-intel-contact-path',(()=>{
    const R=S.recon;if(!R||!R.ok) return false;
    return R.usedIntelGet&&R.contact&&R.lastKnownHeld&&R.semanticRecon&&R.artilleryHandoff;
  })(),S.recon?.reason||'recon-did-not-use-IntelContact',S.recon,!!S.recon?.ok),
  check('player-air-mission-wiring',staticScan.playerMissionWiring!=null,
    'input-path-never-calls-mfAirIssueMission',{line:staticScan.playerMissionWiring},staticScan.playerMissionWiring!=null),
  check('deterministic-repeat-hashes',!!S.determinism?.ok&&!!S.determinism?.allIdentical,
    'one-or-more-scenarios-diverged-on-fixed-seed-repeat',S.determinism,!!S.determinism?.ok),
  check('crash-repeatability',(()=>{
    const C=S.crash;if(!C||!C.ok) return false;
    return C.repeatable&&C.a.steps>4&&!C.ambientCoupled;
  })(),S.crash?.reason||(S.crash?.ambientCoupled?'crash-coupled-to-Math.random':'crash-hash-mismatch'),
    {...(S.crash||{}),staticCrashUsesMathRandom:staticScan.crashUsesMathRandom},!!S.crash?.ok),
  check('camera-invariant-authority',(()=>{
    const C=S.camera;if(!C||!C.ok) return false;
    return C.identical;
  })(),S.camera?.reason||'camera-moved-air-authority',S.camera,!!S.camera?.ok),
  check('source-stable',startSource.sourceSetSha256===endSource.sourceSetSha256,
    'source-drifted-during-run',{start:startSource.sourceSetSha256,end:endSource.sourceSetSha256}),
  check('page-runtime',pageErrors.length===0,'pageerror',pageErrors),
  check('console-runtime',consoleErrors.length===0,'console-error',consoleErrors)
];

function phaseNormNode(value){
  return String(value==null?'':value).toLowerCase().replace(/[_ ]+/g,'-');
}

const accepted=checks.every(C=>C.status==='PASS');
const report={
  schema:'MassfrontAirWarfareProbeV1',
  startedUtc,finishedUtc:new Date().toISOString(),
  result:accepted?'PASS':'FAIL',accepted,
  seed:SEED,gpu,boot,pageErrors,consoleErrors,
  provenance:{start:startSource,end:endSource,
    headStable:startSource.head===endSource.head,
    sourceSetStable:startSource.sourceSetSha256===endSource.sourceSetSha256},
  staticScan,runtime,checks,
  runtimeUrl:server?`${server.url}?airwarfareprobe=1`:null
};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const md=[
  '# MASSFRONT Stage 5 air-warfare probe',
  '',
  `- Result: **${report.result}**`,
  `- HEAD: \`${startSource.head}\``,
  `- Source set: \`${startSource.sourceSetSha256}\``,
  `- Seed: \`${SEED.toString(16)}\``,
  `- GPU: ${gpu?.renderer||'UNKNOWN'}`,
  `- Boot: ${boot.ok?'ok':boot.reason}`,
  `- Evidence: \`${output.replace(/\\/g,'/')}/report.json\``,
  '',
  '## Checks',
  '',
  ...checks.map(C=>`- ${C.status} — ${C.id}${C.reason?' — '+C.reason:''}`),
  '',
  'Missing hooks never count as pass. Snapshot fields that are absent are `supported:false`, never coerced to 0.',
  ''
].join('\n');
await writeFile(join(output,'report.md'),md+'\n');
console.log(JSON.stringify({
  output,result:report.result,accepted,boot,missingHooks:runtime?.missingHooks||REQUIRED_HOOKS,
  checks:Object.fromEntries(checks.map(C=>[C.id,C.status+(C.reason?':'+C.reason:'')])),
  gpu:gpu?.renderer||null,head:startSource.head,sourceSet:startSource.sourceSetSha256
},null,2));
process.exit(accepted?0:1);
