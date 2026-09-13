#!/usr/bin/env node
/* MASSFRONT turret articulation acceptance probe.

   This probe closes a false-green left by the Stage 3 turret/charge probe:
   simulation yaw can be correct while the resolved faction mesh has no moving
   upper assembly, or while a decorative split mesh consumes turret state that
   the weapon authority does not. It therefore inventories the live
   faction/type matrix before exercising every authoritative mobile turret.

   True barrel-only pitch is deliberately fail-closed. The current two-stream
   {hull,tur} registry pitches the complete turret mesh. A source regex for
   ugunPitch is not evidence of a separately articulated barrel. */
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','turret-articulation');
await mkdir(outDir,{recursive:true});

const sourceFiles=[
  'src/game/sim.js','src/ui/render3d.js','src/engine/mesh.js','src/engine/models.js',
  'src/engine/models-units-nova.js','src/engine/models-units-legion.js',
  'src/engine/models-units-syndicate.js','src/engine/models-units-brood.js',
  'assets/data/manifest.json','boot.js'
];
const sourceText={};
for(const rel of sourceFiles)sourceText[rel]=await readFile(join(root,rel),'utf8');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const lineOf=(rel,re)=>{
  const lines=sourceText[rel].split(/\r?\n/);
  for(let i=0;i<lines.length;i++)if(re.test(lines[i]))return i+1;
  return null;
};
let dirtyDiff='';
try{
  dirtyDiff=execFileSync('git',['diff','--binary','--',...sourceFiles],
    {cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
}catch{}
const identity={
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceHash:sha256(sourceFiles.map(rel=>`${rel}\0${sourceText[rel]}`).join('\0')),
  dirtyDiffHash:sha256(dirtyDiff),
  files:Object.fromEntries(sourceFiles.map(rel=>[rel,{
    sha256:sha256(sourceText[rel]),bytes:Buffer.byteLength(sourceText[rel])
  }]))
};
const refs={
  typeTurretFlags:{file:'src/game/sim.js',lines:[
    lineOf('src/game/sim.js',/name:'Rhino'.*tur:'tankT'/),
    lineOf('src/game/sim.js',/name:'Goliath'.*tur:'heavyT'/),
    lineOf('src/game/sim.js',/name:'Thumper'.*tur:'artyT'/),
    lineOf('src/game/sim.js',/name:'Bombard'.*tur:'bombT'/),
    lineOf('src/game/sim.js',/name:'Basilisk'.*tur:'basilT'/)
  ]},
  turretTrack:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/uturr\[i\]\+=turretTurn/)},
  pitchTrack:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/ugunPitch\[i\]\+=clamp/)},
  fireGate:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/turretAimError<\.14&&unitPitchErr<\.12/)},
  muzzleAuthority:{file:'src/game/sim.js',line:lineOf('src/game/sim.js',/const ma=\(T\.tur\?uturr\[i\]:uang\[i\]\)/)},
  registry:{file:'src/engine/models.js',line:lineOf('src/engine/models.js',/cache\[fn\.name\]=\{hull:new InstMesh/)},
  renderTurret:{file:'src/ui/render3d.js',line:lineOf('src/ui/render3d.js',/if\(M\.tur\) M\.tur\.add/)},
  instancePitch:{file:'src/engine/mesh.js',line:lineOf('src/engine/mesh.js',/d\[o\+12\]=Number\.isFinite\(pitch\)/)},
  broodFusedContract:{file:'src/engine/models-units-brood.js',line:lineOf('src/engine/models-units-brood.js',/every builder returns tur:null/)}
};

function classifyMatrix(rows){
  const missingAuthoritative=[],splitNonAuthoritative=[],barrelUnsupported=[],coherent=[];
  for(const row of rows){
    if(row.authoritative&&!row.hasTurret)missingAuthoritative.push(row);
    else if(!row.authoritative&&row.hasTurret)splitNonAuthoritative.push(row);
    else coherent.push(row);
    if(row.authoritative&&row.hasTurret&&!row.hasBarrel)barrelUnsupported.push(row);
  }
  return {missingAuthoritative,splitNonAuthoritative,barrelUnsupported,coherent};
}

function runFixtureSelfTests(){
  const clean=classifyMatrix([
    {faction:'clean',type:1,authoritative:true,hasTurret:true,hasBarrel:true},
    {faction:'clean',type:0,authoritative:false,hasTurret:false,hasBarrel:false}
  ]);
  const missing=classifyMatrix([
    {faction:'missing',type:1,authoritative:true,hasTurret:false,hasBarrel:false}
  ]);
  const split=classifyMatrix([
    {faction:'split',type:7,authoritative:false,hasTurret:true,hasBarrel:false}
  ]);
  const noBarrel=classifyMatrix([
    {faction:'legacy',type:1,authoritative:true,hasTurret:true,hasBarrel:false}
  ]);
  const checks={
    cleanPasses:clean.missingAuthoritative.length===0&&clean.barrelUnsupported.length===0,
    missingFails:missing.missingAuthoritative.length===1,
    splitClassified:split.splitNonAuthoritative.length===1&&split.missingAuthoritative.length===0,
    barrelUnsupported:noBarrel.barrelUnsupported.length===1
  };
  return {checks,pass:Object.values(checks).every(Boolean)};
}
const fixtures=runFixtureSelfTests();
if(!fixtures.pass)throw new Error(`turret articulation fixture self-test failed: ${JSON.stringify(fixtures)}`);

const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ktx2':'image/ktx2','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{
  let pathname=decodeURIComponent((req.url||'/').split('?')[0]);if(pathname==='/')pathname='/index.html';
  const file=resolve(root,'.'+pathname);
  if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
  const body=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(body);
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
    page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
    await page.addInitScript(()=>{try{
      localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
      localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
      localStorage.setItem('mf_gfx','high');
    }catch{}});
    const url=`http://127.0.0.1:${server.address().port}/?turretarticulation=1`;
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    gpu=await assertHardwareGpu(page);
    await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof unitTick==='function'&&
      typeof spawnUnit==='function'&&typeof render==='function'&&typeof factionUnitMeshFor==='function'&&
      typeof FAC_MESH==='object'&&FAC_MESH.nova&&FAC_MESH.legion&&FAC_MESH.syndicate&&FAC_MESH.horde,
      null,{timeout:120000});
    runtime=await page.evaluate(()=>{
      const DT=1/30,TAU2=Math.PI*2,snap=(v,n=9)=>Number(Number(v).toFixed(n));
      const angleDiff=(a,b)=>{let d=a-b;while(d>Math.PI)d-=TAU2;while(d<-Math.PI)d+=TAU2;return d;};
      const kits=['nova','legion','syndicate','horde'];
      const matrix=[];
      for(const faction of kits){
        for(let type=0;type<TYPES.length;type++){
          if(!factionUnitModelAllowed(type,faction))continue;
          const M=factionUnitMeshFor(type,faction),T=TYPES[type];
          matrix.push({
            faction,type,name:T.name,builder:FAC_KIT[faction]&&FAC_KIT[faction][type]?FAC_KIT[faction][type].name:null,
            authoritative:!!T.tur,hasTurret:!!(M&&M.tur),hasBarrel:!!(M&&(M.gun||M.barrel)),
            turH:M&&M.turH||0,muzzle:M&&M.muzzle||0
          });
        }
      }
      function reset(){
        resetWorld();running=false;paused=true;matchLive=true;fogOn=false;perfScale=0;tick=0;
        if(typeof resM!=='undefined'){resM[0]=1e9;resM[1]=1e9;}
        if(typeof resE!=='undefined'){resE[0]=1e9;resE[1]=1e9;}
        if(typeof AI!=='undefined'&&AI)AI.fac='legion';
      }
      function desired(shooter,target){
        const T=TYPES[utype[shooter]],dx=ux[target]-ux[shooter],dy=uy[target]-uy[shooter];
        const planar=Math.hypot(dx,dy),sh=(typeof terrainH==='function'?terrainH(ux[shooter],uy[shooter]):0)+Math.max(4,T.r*.45);
        const th=mfUnitAimHeight(target),er=T.air||TYPES[utype[target]].air?Math.hypot(planar,th-sh):planar;
        return {yaw:Math.atan2(dy,dx)+Math.PI/2,pitch:clamp(Math.atan2(th-sh,Math.max(1,er)),-.16,1.18)};
      }
      function runType(type){
        reset();
        const distances={1:70,2:82,3:135,16:155,26:125};
        const x=MAP*.42,y=MAP*.52,d=distances[type]||90;
        const shooter=spawnUnit(type,0,x,y),target=spawnUnit(8,1,x+d,y);
        if(shooter<0||target<0)return {type,error:'spawn-refused'};
        uhp[target]=uhpm[target]=1e8;ucool[target]=1e6;uhold[target]=1;ustate[target]=0;
        uhold[shooter]=1;ustate[shooter]=2;umarch[shooter]=0;umov[shooter]=0;
        utx[shooter]=ux[shooter];uty[shooter]=uy[shooter];
        utgt[shooter]=target;utgtg[shooter]=ugen[target];ucool[shooter]=0;
        uang[shooter]=-Math.PI/2;uturr[shooter]=-Math.PI/2;ugunPitch[shooter]=-.16;
        const samples=[];let fireTick=0,fireYawError=null,firePitchError=null,maxYawStep=0,maxPitchStep=0;
        let prevYaw=uturr[shooter],prevPitch=ugunPitch[shooter];
        for(let step=1;step<=240;step++){
          const beforeCool=ucool[shooter];unitTick(DT);tick++;
          const aim=desired(shooter,target),yawStep=Math.abs(angleDiff(uturr[shooter],prevYaw)),pitchStep=Math.abs(ugunPitch[shooter]-prevPitch);
          maxYawStep=Math.max(maxYawStep,yawStep);maxPitchStep=Math.max(maxPitchStep,pitchStep);
          prevYaw=uturr[shooter];prevPitch=ugunPitch[shooter];
          if(step<=18||step%15===0)samples.push({step,yaw:snap(uturr[shooter]),pitch:snap(ugunPitch[shooter]),
            yawError:snap(Math.abs(angleDiff(aim.yaw,uturr[shooter]))),pitchError:snap(Math.abs(aim.pitch-ugunPitch[shooter])),cool:snap(ucool[shooter])});
          if(!fireTick&&beforeCool<=0&&ucool[shooter]>0){
            fireTick=step;fireYawError=Math.abs(angleDiff(aim.yaw,uturr[shooter]));firePitchError=Math.abs(aim.pitch-ugunPitch[shooter]);break;
          }
        }
        const aim=desired(shooter,target);
        return {type,name:TYPES[type].name,fireTick,fireYawError:snap(fireYawError??-1),firePitchError:snap(firePitchError??-1),
          maxYawStep:snap(maxYawStep),maxPitchStep:snap(maxPitchStep),yawCap:snap(8*DT),pitchCap:snap(2.4*DT),
          finalYaw:snap(uturr[shooter]),finalPitch:snap(ugunPitch[shooter]),wantedYaw:snap(aim.yaw),wantedPitch:snap(aim.pitch),samples};
      }
      const authoritativeTypes=TYPES.map((T,i)=>T&&T.tur?i:-1).filter(i=>i>=0);
      const simA=authoritativeTypes.map(runType),simB=authoritativeTypes.map(runType);

      reset();
      const shooter=spawnUnit(1,0,MAP*.45,MAP*.5),target=spawnUnit(8,1,MAP*.45+70,MAP*.5);
      uhp[target]=uhpm[target]=1e8;ucool[target]=1e6;uhold[target]=1;
      uhold[shooter]=1;ustate[shooter]=2;utgt[shooter]=target;utgtg[shooter]=ugen[target];
      utx[shooter]=ux[shooter];uty[shooter]=uy[shooter];ucool[shooter]=0;
      for(let n=0;n<8;n++){unitTick(DT);tick++;}
      const simSnapshot=()=>{
        const units=[];for(let i=0;i<unitHigh;i++)if(ualive[i])units.push([
          i,ugen[i],utype[i],uteam[i],ux[i],uy[i],uang[i],uturr[i],ugunPitch[i],ucool[i],uhp[i],utgt[i],utgtg[i]
        ]);
        let projectiles=0;for(let i=0;i<pHigh;i++)if(palive[i])projectiles++;
        return {tick,statsTime:stats.t,unitHigh,units,pHigh,projectiles};
      };
      const pauseBefore=simSnapshot();
      for(let n=0;n<120;n++)render(0);
      const pauseAfter=simSnapshot();
      return {matrix,authoritativeTypes,simA,simB,pauseBefore,pauseAfter,url:location.href};
    });
  }finally{await closePwBrowser(browser);}
}catch(error){pageErrors.push(String(error?.stack||error));}
finally{await new Promise(ok=>server.close(ok));}

const classification=classifyMatrix(runtime?.matrix||[]);
const canonical=value=>JSON.stringify(value);
const deterministicPairs=(runtime?.simA||[]).map((a,index)=>({
  type:a.type,name:a.name,aHash:sha256(canonical(a)),bHash:sha256(canonical(runtime.simB[index])),same:canonical(a)===canonical(runtime.simB[index])
}));
const simPass=!!runtime&&runtime.simA.length===runtime.authoritativeTypes.length&&runtime.simA.every((row,index)=>
  canonical(row)===canonical(runtime.simB[index])&&!row.error&&row.fireTick>1&&row.fireYawError>=0&&row.fireYawError<.14&&
  /* uturr is Float32 while the authored cap is a Number. The ~2.2e-7 lane
     quantization at 8/30 rad is not an authority overshoot. */
  row.firePitchError>=0&&row.firePitchError<.12&&row.maxYawStep<=row.yawCap+1e-6&&row.maxPitchStep<=row.pitchCap+1e-6);
const pausedSame=!!runtime&&canonical(runtime.pauseBefore)===canonical(runtime.pauseAfter);
const requirement=(status,summary,evidence)=>({status,summary,evidence});
const requirements={
  fixtureSelfTests:requirement(fixtures.pass?'PASS':'FAIL','Failure fixtures reject missing turret/barrel coverage and classify split decorative uppers.',fixtures),
  factionTypeMatrix:requirement(runtime&&runtime.matrix.length?'PASS':'FAIL','The live resolved faction/type mesh matrix was inventoried, not inferred from builder names.',
    {rows:runtime?.matrix.length||0,factions:[...new Set((runtime?.matrix||[]).map(row=>row.faction))]}),
  authoritativeMeshCoverage:requirement(classification.missingAuthoritative.length===0?'PASS':'FAIL',
    'Every T.tur role must resolve a visual turret/head assembly in every faction that owns the type.',classification.missingAuthoritative),
  splitNonAuthoritativeClassification:requirement(runtime?'PASS':'FAIL',
    'Every M.tur && !T.tur split is explicitly classified; this is inventory evidence, not acceptance of mismatched authority.',classification.splitNonAuthoritative),
  authoritativeSimulation:requirement(simPass?'PASS':'FAIL',
    'All authoritative mobile turret types traverse and elevate deterministically, obey rate caps, and cannot release before yaw/pitch convergence.',
    {types:runtime?.authoritativeTypes||[],runs:runtime?.simA||[],repeatHashes:deterministicPairs}),
  pausedRenderImmutability:requirement(pausedSame?'PASS':'FAIL',
    'Rendering the same paused state 120 times cannot mutate turret, projectile, cooldown, target, health, or simulation-clock state.',
    {same:pausedSame,before:runtime?.pauseBefore||null,after:runtime?.pauseAfter||null}),
  trueBarrelOnlyPitch:requirement(classification.barrelUnsupported.length===0&&runtime?'PASS':'UNSUPPORTED',
    'True pitch requires a barrel/gun stream separate from the yawing turret base; pitching the complete M.tur mesh does not satisfy this contract.',
    {unsupported:classification.barrelUnsupported,registry:refs.registry,renderer:refs.renderTurret,instancePitch:refs.instancePitch}),
  pageRuntime:requirement(pageErrors.length===0&&!!gpu?'PASS':'FAIL','Probe boots current source on hardware WebGL2 with zero page/runtime errors.',{gpu,pageErrors})
};
const counts={PASS:0,FAIL:0,UNSUPPORTED:0};
for(const row of Object.values(requirements))counts[row.status]=(counts[row.status]||0)+1;
const preciseRuntimeFixes=[
  'For resolved M.tur && !T.tur, render the upper mesh at hull yaw with zero pitch unless an explicit articulation profile promotes that weapon to simulation authority.',
  'Give Brood/Horde types 1, 2, 3, 16 and 26 a separately transformable aiming head/weapon-organ mesh with authored turH and muzzle metadata, preserving current deterministic T.tur gameplay.',
  'Extend the model/InstMesh registry compatibly with an optional gun/barrel stream and pivot metadata. Render hull at uang, turret base at uturr with zero pitch, and gun/barrel at uturr plus ugunPitch.',
  'Keep mfUnitMuzzle orientation, the visual barrel direction, and the yaw/pitch fire gate on the same articulation profile; do not select authority from mesh presence alone.',
  'Extend this probe rather than weakening it: the faction/type matrix, repeat hashes, and paused-render immutability must remain required evidence.'
];
const report={schemaVersion:1,generatedAt:new Date().toISOString(),identity,gpu,refs,fixtures,runtime,
  classification:{
    missingAuthoritative:classification.missingAuthoritative,
    splitNonAuthoritative:classification.splitNonAuthoritative,
    barrelUnsupported:classification.barrelUnsupported
  },requirements,counts,preciseRuntimeFixes,pass:counts.FAIL===0&&counts.UNSUPPORTED===0};
const jsonPath=join(outDir,'report.json'),mdPath=join(outDir,'report.md');
await writeFile(jsonPath,JSON.stringify(report,null,2));
const md=[
  '# MASSFRONT turret articulation probe','',
  `- HEAD: \`${identity.head}\``,`- Source hash: \`${identity.sourceHash}\``,`- Dirty diff hash: \`${identity.dirtyDiffHash}\``,
  `- GPU: \`${gpu?.renderer||'UNKNOWN'}\``,`- Result: **${report.pass?'PASS':'FAIL'}** (${counts.PASS} pass / ${counts.FAIL} fail / ${counts.UNSUPPORTED} unsupported)`,'',
  '## Requirements','',
  ...Object.entries(requirements).map(([key,value])=>`- **${value.status}** \`${key}\` — ${value.summary}`),'',
  '## Missing authoritative turret meshes','',
  ...(classification.missingAuthoritative.length?classification.missingAuthoritative.map(row=>`- ${row.faction} type ${row.type} ${row.name} (${row.builder||'unknown builder'})`):['- None']),'',
  '## Split meshes without simulation turret authority','',
  ...(classification.splitNonAuthoritative.length?classification.splitNonAuthoritative.map(row=>`- ${row.faction} type ${row.type} ${row.name} (${row.builder||'unknown builder'})`):['- None']),'',
  '## True barrel-only pitch','',
  classification.barrelUnsupported.length
    ?`**UNSUPPORTED:** ${classification.barrelUnsupported.length} authoritative faction/type models have a yawing turret mesh but no separate gun/barrel stream.`
    :'Supported for every authoritative model.','',
  '## Required runtime fixes','',...preciseRuntimeFixes.map((text,index)=>`${index+1}. ${text}`),'',
  '## Exact source references','',
  ...Object.entries(refs).map(([key,value])=>`- \`${key}\`: \`${value.file}:${value.line??value.lines?.join(',')??'MISSING'}\``),'',
  `JSON evidence: \`${jsonPath}\``
].join('\n');
await writeFile(mdPath,md);
console.log(JSON.stringify({pass:report.pass,counts,jsonPath,mdPath,
  missingAuthoritative:classification.missingAuthoritative.map(row=>`${row.faction}/${row.type}`),
  splitNonAuthoritative:classification.splitNonAuthoritative.map(row=>`${row.faction}/${row.type}`),
  barrelUnsupported:classification.barrelUnsupported.map(row=>`${row.faction}/${row.type}`)},null,2));
process.exitCode=report.pass?0:1;
