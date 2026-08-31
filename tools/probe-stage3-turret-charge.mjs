#!/usr/bin/env node
/* Stage 3 acceptance probe: turret articulation and weapon charge authority.

   This intentionally distinguishes the current deterministic yaw interpolation
   from the full contract. A turn-rate cap is not an authored traverse envelope,
   and a cooldown inferred as "charging" is not an explicit interruptible charge
   state machine. Missing pieces are FAIL, never silently treated as zero/pass. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'tmp','stage3-turret-charge');
await mkdir(outDir,{recursive:true});
const sourceFiles=['src/game/sim.js','src/ui/render3d.js','src/engine/models.js'];
const sourceText={};
for(const rel of sourceFiles) sourceText[rel]=await readFile(join(root,rel),'utf8');
const sha256=v=>createHash('sha256').update(v).digest('hex');
const lineOf=(rel,re)=>{
  const lines=sourceText[rel].split(/\r?\n/);
  for(let i=0;i<lines.length;i++) if(re.test(lines[i])) return i+1;
  return null;
};
const lineOfAfter=(rel,afterRe,re)=>{
  const lines=sourceText[rel].split(/\r?\n/);let armed=false;
  for(let i=0;i<lines.length;i++){
    if(!armed&&afterRe.test(lines[i])){armed=true;continue;}
    if(armed&&re.test(lines[i]))return i+1;
  }
  return null;
};
const has=(rel,re)=>re.test(sourceText[rel]);
const sourceHash=sha256(sourceFiles.map(f=>`${f}\0${sourceText[f]}`).join('\0'));
let dirtyDiff='';
try{dirtyDiff=execFileSync('git',['diff','--binary','--',...sourceFiles],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});}catch{}
const identity={
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceHash,
  dirtyDiffHash:sha256(dirtyDiff),
  files:Object.fromEntries(sourceFiles.map(f=>[f,{sha256:sha256(sourceText[f]),bytes:Buffer.byteLength(sourceText[f])}]))
};

const refs={
  buildingTurnRates:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/const MF_BLD_TURN_RATE=/)},
  buildingTraverseAim:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/function mfBldTraverseAim\(/)},
  sentinelFireGate:{file:'src/game/sim.js',line:lineOfAfter('src/game/sim.js',/else if\(B\.type==='turret'\)/,/if\(B\.cool<=0&&aimErr<\.14\)/)},
  unitTurretYaw:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/uturr\[i\]\+=clamp\(da,-8\*dt,8\*dt\)/)},
  unitFireGate:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/if\(inRange && ucool\[i\]<=0/)},
  plasmaInstantAim:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/B\.tang=Math\.atan2\(uy\[e\]-B\.y/)},
  stormStatesComment:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/Three readable states, all simulation time/)},
  stormInit:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/if\(B\.stormInit==null\)/)},
  stormCharging:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/else if\(B\.cool>0\).*CHARGING/)},
  buildingBaseRender:{file:'src/ui/render3d.js',line:lineOf('src/ui/render3d.js',/V\.base\.add\(Bd\.x/)},
  buildingTurretRender:{file:'src/ui/render3d.js',line:lineOf('src/ui/render3d.js',/V\.tur\.add\(Bd\.x/)},
  unitTurretRender:{file:'src/ui/render3d.js',line:lineOf('src/ui/render3d.js',/M\.tur\.add\(X,Y,H\+M\.turH/)},
  buildingTurretHeight:{file:'src/engine/models.js',line:lineOf('src/engine/models.js',/const BLD_TUR_H=/)}
};
const integrationRequirements=[
  'Define one immutable articulation profile per weapon family with yaw rate, authored traverse arc, pitch rate, elevation limits, and fire tolerances.',
  'Keep structure base rotation (rot), turret yaw, and barrel pitch as separate deterministic simulation values; render all three independently.',
  'Gate both mobile-unit and building fire on yaw and pitch convergence. Replace direct B.tang assignments in articulated combat paths with the same authority.',
  'Define one authoritative WeaponChargeProfile and explicit idle/acquire/charging/committed/firing/cooldown/interrupted states for weapons that actually charge.',
  'Advance charge only in fixed-step simulation. Route damage, movement, target invalidation, power loss, destruction, and manual cancel through one deterministic interrupt function.',
  'Leave ordinary aligned rapid-fire weapons immediate; do not route them through strategic charge latency.',
  'Add save/replay compatibility defaults for newly introduced articulation and charge fields; do not add Math.random to charge or articulation authority.',
  'Expose charge phase/progress and pitch/yaw values to VFX/rendering without allowing rendering or paused frames to advance simulation state.'
];

/* Names are deliberately broad enough to accept a well-factored equivalent,
   but strict enough that comments or decorative model geometry cannot pass. */
const sourceContract={
  authoritativeChargeProfile:
    has('src/game/sim.js',/(?:const|let|var|function)\s+(?:WeaponChargeProfile|MF_WEAPON_CHARGE_PROFILE|mfWeaponChargeProfile)\b/),
  explicitChargeStates:
    has('src/game/sim.js',/(?:IDLE|idle).*(?:ACQUIRE|acquire).*(?:CHARGING|charging).*(?:COMMITTED|committed).*(?:FIRING|firing).*(?:COOLDOWN|cooldown).*(?:INTERRUPTED|interrupted)/s),
  chargeTickAuthority:
    has('src/game/sim.js',/function\s+(?:mfWeaponChargeTick|weaponChargeTick)\s*\(/),
  chargeInterruptAuthority:
    has('src/game/sim.js',/function\s+(?:mfWeaponChargeInterrupt|weaponChargeInterrupt)\s*\(/),
  authoredTraverseLimits:
    has('src/game/sim.js',/(?:MF_BLD_TRAVERSE_LIMITS|traverseMin|traverseMax|minTraverse|maxTraverse)/),
  noInstantBuildingAim:
    !has('src/game/sim.js',/else if\(B\.type==='plasma'\)[\s\S]{0,300}B\.tang=Math\.atan2/),
  authoredElevationLimits:
    has('src/game/sim.js',/(?:MF_BLD_ELEVATION_LIMITS|minPitch|maxPitch|minElevation|maxElevation)/),
  separateTurretYawState:
    ((has('src/game/sim.js',/(?:\.turretYaw|\.turYaw|\bbturYaw\b)/)&&
      has('src/ui/render3d.js',/(?:\.turretYaw|\.turYaw|\bbturYaw\b)/))||
     (has('src/game/sim.js',/\btang:team\?Math\.PI:0/)&&has('src/game/sim.js',/\brot:rot\|\|0/)&&
      has('src/ui/render3d.js',/V\.base\.add\([\s\S]{0,220}Bd\.rot/)&&
      has('src/ui/render3d.js',/V\.tur\.add\([\s\S]{0,220}Bd\.tang/))),
  separateBarrelPitchState:
    has('src/game/sim.js',/(?:\.barrelPitch|\.gunPitch|\bbpitch\b)/)&&
    has('src/ui/render3d.js',/(?:\.barrelPitch|\.gunPitch|\bbpitch\b)/),
  firingUsesElevationGate:
    has('src/game/sim.js',/(?:elevErr|pitchErr|elevationError).{0,120}(?:cool|fire|damage|fireProj)/s)
};

const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ktx2':'image/ktx2','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
  const f=resolve(root,'.'+p);
  if(!f.startsWith(root)||!existsSync(f)){res.writeHead(404);res.end('not found');return;}
  const body=await readFile(f);res.writeHead(200,{'Content-Type':mime[extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch(error){res.writeHead(500);res.end(String(error?.stack||error));}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));

let runtime=null,gpu=null;
const pageErrors=[];
try{
  const {launchPwBrowser,closePwBrowser}=await import('./pw-browser.mjs');
  const {assertHardwareGpu}=await import('./chrome-gpu.mjs');
  const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
    page.on('pageerror',e=>pageErrors.push(String(e?.stack||e)));
    await page.addInitScript(()=>{try{
      localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    }catch{}});
    await page.goto(`http://127.0.0.1:${server.address().port}/?stage3turretcharge=1`,{waitUntil:'domcontentloaded',timeout:60000});
    gpu=await assertHardwareGpu(page);
    await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof addBld==='function'&&
      typeof bldTick==='function'&&typeof unitTick==='function'&&typeof spawnUnit==='function'&&typeof mfBldTraverseAim==='function',null,{timeout:120000});
    runtime=await page.evaluate(()=>{
      const dt=1/30,TAU2=Math.PI*2,snap=(v,n=9)=>Number(Number(v).toFixed(n));
      const angleDiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU2;while(d<-Math.PI)d+=TAU2;return d;};
      function reset(){
        resetWorld();if(typeof stopAttract==='function')stopAttract();
        running=false;paused=true;matchLive=true;fogOn=false;perfScale=0;tick=0;
        resM[0]=1e9;resE[0]=1e9;
      }
      const groundType=()=>Math.max(0,TYPES.findIndex(T=>T&&!T.air&&!T.naval&&T.r>0&&T.spd>0&&T.cat!=='hero'));
      const airType=()=>Math.max(0,TYPES.findIndex(T=>T&&T.air&&T.r>0&&T.spd>0));

      function yawGateRun(){
        reset();const x=MAP*.5,y=MAP*.5,B=addBld('turret',0,x,y,true);
        B.tang=-Math.PI/2;B.cool=0;
        const u=spawnUnit(groundType(),1,x+120,y);uhp[u]=uhpm[u]=1e7;
        const wanted=Math.atan2(uy[u]-B.y,ux[u]-B.x)+Math.PI/2;
        let prev=B.tang,maxStep=0,fireTick=0,fireErr=null;
        const hp0=uhp[u],angles=[];
        for(let n=1;n<=90;n++){
          const before=uhp[u];bldTick(dt);
          maxStep=Math.max(maxStep,Math.abs(angleDiff(B.tang,prev)));prev=B.tang;
          angles.push(snap(B.tang,12));
          if(!fireTick&&uhp[u]<before){fireTick=n;fireErr=Math.abs(angleDiff(wanted,B.tang));break;}
        }
        return {fireTick,fireErr:snap(fireErr??-1,12),damage:snap(hp0-uhp[u]),maxStep:snap(maxStep,12),
          cap:snap(MF_BLD_TURN_RATE.turret*dt,12),distinctAngles:new Set(angles).size};
      }
      function rapidRun(){
        reset();const x=MAP*.5,y=MAP*.5,B=addBld('turret',0,x,y,true);
        const u=spawnUnit(groundType(),1,x+120,y);uhp[u]=uhpm[u]=1e7;
        B.tang=Math.atan2(uy[u]-B.y,ux[u]-B.x)+Math.PI/2;B.cool=0;
        const hp0=uhp[u];bldTick(dt);
        return {damage:snap(hp0-uhp[u]),cool:snap(B.cool),
          hasChargeState:Object.prototype.hasOwnProperty.call(B,'chargeState'),chargeState:B.chargeState??null};
      }
      function unitYawGateRun(){
        reset();const x=MAP*.5,y=MAP*.5;
        const shooter=spawnUnit(1,0,x,y),target=spawnUnit(groundType(),1,x+70,y);
        uhp[target]=uhpm[target]=1e7;ucool[shooter]=0;ucool[target]=999;
        utgt[shooter]=target;utgtg[shooter]=ugen[target];ustate[shooter]=2;uhold[shooter]=1;
        utx[shooter]=ux[target];uty[shooter]=uy[target];uturr[shooter]=-Math.PI/2;
        const wanted=Math.atan2(uy[target]-uy[shooter],ux[target]-ux[shooter])+Math.PI/2;
        let fireTick=0,fireError=null,maxStep=0,previous=uturr[shooter];
        for(let n=1;n<=90;n++){
          const before=ucool[shooter];unitTick(dt);
          const moved=Math.abs(angleDiff(uturr[shooter],previous));maxStep=Math.max(maxStep,moved);previous=uturr[shooter];
          if(!fireTick&&before<=0&&ucool[shooter]>0){fireTick=n;fireError=Math.abs(angleDiff(wanted,uturr[shooter]));break;}
          /* Isolate one fixed step at a time from cooldown decay. */
          tick++;
        }
        return {fireTick,fireError:snap(fireError??-1,12),maxStep:snap(maxStep,12),cap:snap(8*dt,12)};
      }
      function elevationRun(){
        reset();const x=MAP*.5,y=MAP*.5,B=addBld('aatower',0,x,y,true);
        const u=spawnUnit(airType(),1,x+120,y);uhp[u]=uhpm[u]=1e7;B.cool=0;
        bldTick(dt);
        const names=['barrelPitch','gunPitch','bpitch','elevation'];
        const present=names.filter(k=>Number.isFinite(B[k]));
        return {targetAir:!!TYPES[utype[u]].air,present,pitchValues:Object.fromEntries(present.map(k=>[k,snap(B[k])])),
          hasElevationLimits:typeof MF_BLD_ELEVATION_LIMITS!=='undefined'};
      }
      function chargeRun(interrupt){
        reset();const x=MAP*.5,y=MAP*.5,B=addBld('stormcaller',0,x,y,true);
        const explicit=[],inferred=[];
        const record=()=>{
          const ex=B.chargeState??null,inf=B.sq&&B.sq.length?'firing':B.cool>0?'charging':'charged';
          if(explicit.at(-1)!==ex)explicit.push(ex);
          if(inferred.at(-1)!==inf)inferred.push(inf);
        };
        bldTick(dt);record();
        const firstCool=B.cool;
        if(interrupt){
          /* Damage is a required interruption source for charged strategic
             weapons. The probe does not invent a handler; it observes whether
             runtime authority records the interruption. */
          const idx=blds.indexOf(B);
          if(idx>=0&&typeof damageBld==='function')damageBld(idx,Math.max(1,B.hpm*.12),1);
          bldTick(dt);record();
          return {firstCool:snap(firstCool),explicit,inferred,alive:B.alive,
            state:B.chargeState??null,interrupted:B.chargeState==='interrupted'};
        }
        let steps=1;
        while(B.cool>0&&steps<2000){bldTick(dt);steps++;record();}
        record();
        const enemy=[];
        for(let n=0;n<Math.max(4,STORM.trigger);n++){
          const u=spawnUnit(groundType(),1,x+(n-1.5)*16,y-250-n*4);uhp[u]=uhpm[u]=1e7;enemy.push(u);
        }
        for(let n=0;n<9;n++){bldTick(dt);steps++;record();if(B.sq&&B.sq.length)break;}
        record();
        while(B.chargeState!=='cooldown'&&steps<2200){bldTick(dt);steps++;record();}
        return {steps,explicit,inferred,queue:B.sq?B.sq.length:0,firstCool:snap(firstCool),
          finalCool:snap(B.cool),hasProfile:typeof WeaponChargeProfile!=='undefined'||typeof MF_WEAPON_CHARGE_PROFILE!=='undefined'};
      }
      const yawA=yawGateRun(),yawB=yawGateRun();
      const unitYawA=unitYawGateRun(),unitYawB=unitYawGateRun();
      const rapidA=rapidRun(),rapidB=rapidRun();
      const elevationA=elevationRun(),elevationB=elevationRun();
      const chargeA=chargeRun(false),chargeB=chargeRun(false);
      const interruptA=chargeRun(true),interruptB=chargeRun(true);
      return {dt,yawA,yawB,unitYawA,unitYawB,rapidA,rapidB,elevationA,elevationB,chargeA,chargeB,interruptA,interruptB};
    });
  }finally{await closePwBrowser(browser);}
}catch(error){pageErrors.push(String(error?.stack||error));}
finally{await new Promise(ok=>server.close(ok));}

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(status,evidence,requirement)=>({status:status?'PASS':'FAIL',requirement,evidence});
const R=runtime;
const requirements={
  deterministicYawRate:check(!!R&&same(R.yawA,R.yawB)&&R.yawA.maxStep<=R.yawA.cap+1e-8&&R.yawA.distinctAngles>4,
    R&&{a:R.yawA,b:R.yawB},'Building turret yaw advances deterministically within its fixed-step turn-rate cap.'),
  yawMustConvergeBeforeFire:check(!!R&&R.yawA.fireTick>1&&R.yawA.fireErr>=0&&R.yawA.fireErr<.14&&R.yawA.damage>0,
    R?.yawA,'A misaligned turret cannot fire until its yaw converges inside the authored aim tolerance.'),
  unitYawMustConvergeBeforeFire:check(!!R&&same(R.unitYawA,R.unitYawB)&&R.unitYawA.fireTick>1&&
      R.unitYawA.fireError>=0&&R.unitYawA.fireError<.14&&R.unitYawA.maxStep<=R.unitYawA.cap+1e-6,
    R&&{a:R.unitYawA,b:R.unitYawB,reference:refs.unitFireGate},'A misaligned mobile turret cannot discharge sideways while its visual turret is still traversing.'),
  authoredTraverseEnvelope:check(sourceContract.authoredTraverseLimits&&sourceContract.noInstantBuildingAim,
    {source:{authoredTraverseLimits:sourceContract.authoredTraverseLimits,noInstantBuildingAim:sourceContract.noInstantBuildingAim},
      traverse:refs.buildingTraverseAim,bypass:refs.plasmaInstantAim},'Each articulated weapon enforces authored minimum/maximum traverse, not only turn speed, with no instant-aim bypass.'),
  separateTurretBaseAndYaw:check(sourceContract.separateTurretYawState,
    {source:sourceContract.separateTurretYawState,render:refs.buildingTurretRender},'Static base rotation and independent turret yaw are separate runtime/render inputs.'),
  elevationStateAndLimits:check(sourceContract.separateBarrelPitchState&&sourceContract.authoredElevationLimits&&
      sourceContract.firingUsesElevationGate&&!!R&&R.elevationA.present.length>0&&R.elevationA.hasElevationLimits,
    {source:{separateBarrelPitchState:sourceContract.separateBarrelPitchState,authoredElevationLimits:sourceContract.authoredElevationLimits,
      firingUsesElevationGate:sourceContract.firingUsesElevationGate},runtime:R?.elevationA,render:refs.buildingTurretRender},
    'Barrel pitch is simulated, rendered, clamped to authored elevation limits, and gates firing.'),
  authoritativeChargeProfile:check(sourceContract.authoritativeChargeProfile&&sourceContract.explicitChargeStates&&sourceContract.chargeTickAuthority,
    {source:sourceContract,reference:refs.stormStatesComment},'One authoritative WeaponChargeProfile owns idle/acquire/charging/committed/firing/cooldown/interrupted.'),
  explicitChargeTransitions:check(!!R&&R.chargeA.explicit.filter(Boolean).length>=4&&
      ['charging','committed','firing','cooldown'].every(s=>R.chargeA.explicit.includes(s)),
    R?.chargeA,'A charged strategic weapon exposes deterministic explicit phase transitions rather than inferring them from cooldown/queue fields.'),
  chargeInterruption:check(sourceContract.chargeInterruptAuthority&&!!R&&R.interruptA.interrupted&&same(R.interruptA,R.interruptB),
    {source:sourceContract.chargeInterruptAuthority,a:R?.interruptA,b:R?.interruptB},'Damage/invalidated commitment invokes deterministic interruption and records interrupted state.'),
  ordinaryRapidFireImmediate:check(!!R&&same(R.rapidA,R.rapidB)&&R.rapidA.damage>0&&!R.rapidA.hasChargeState,
    R&&{a:R.rapidA,b:R.rapidB},'Ordinary aligned rapid-fire defenses remain immediate and do not inherit strategic charge latency.'),
  deterministicRuntime:check(!!R&&same(R.yawA,R.yawB)&&same(R.unitYawA,R.unitYawB)&&same(R.rapidA,R.rapidB)&&same(R.elevationA,R.elevationB)&&
      same(R.chargeA,R.chargeB)&&same(R.interruptA,R.interruptB),R,'Repeated fixed-step scenarios produce identical state and damage.'),
  pageRuntime:check(pageErrors.length===0,{pageErrors,gpu},'Probe runs on hardware WebGL2 with zero page/runtime errors.')
};
const counts={PASS:0,FAIL:0};
for(const item of Object.values(requirements))counts[item.status]++;
const report={schemaVersion:1,generatedAt:new Date().toISOString(),identity,gpu,refs,sourceContract,runtime,requirements,
  integrationRequirements,counts,pass:counts.FAIL===0};
const jsonPath=join(outDir,'report.json'),mdPath=join(outDir,'report.md');
await writeFile(jsonPath,JSON.stringify(report,null,2));
const md=[
  '# MASSFRONT Stage 3 turret/charge probe','',
  `- HEAD: \`${identity.head}\``,`- Source hash: \`${identity.sourceHash}\``,`- Dirty diff hash: \`${identity.dirtyDiffHash}\``,
  `- GPU: \`${gpu?.renderer||'UNKNOWN'}\``,`- Result: **${report.pass?'PASS':'FAIL'}** (${counts.PASS} pass / ${counts.FAIL} fail)`,'',
  '## Requirements','',
  ...Object.entries(requirements).map(([k,v])=>`- **${v.status}** \`${k}\` — ${v.requirement}`),'',
  '## Exact source references','',
  ...Object.entries(refs).map(([k,v])=>`- \`${k}\`: \`${v.file}:${v.line??'MISSING'}\``),'',
  '## Integration requirements','',
  ...integrationRequirements.map((v,i)=>`${i+1}. ${v}`),'',
  '## Interpretation','',
  'A passing yaw-rate check proves deterministic interpolation and an aim gate only. It does not satisfy authored traverse limits, barrel elevation, or an explicit charge-state contract.',
  'The complete machine-readable evidence is `report.json`.',''
].join('\n');
await writeFile(mdPath,md);
console.log(JSON.stringify({report:jsonPath,summary:mdPath,counts,pass:report.pass,requirements},null,2));
if(!report.pass)process.exitCode=1;
