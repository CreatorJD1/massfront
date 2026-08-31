#!/usr/bin/env node
/* MASSFRONT Stage 5 aircraft-propulsion contract probe.

   This is deliberately a source-aware render-path probe, not a visual-quality
   claim. It rejects aircraft exhaust energy welded into opaque unit geometry,
   verifies the queueAirPropulsionFx integration seam uses bounded transparent
   additive layers behind real visibility gates, and verifies critical aircraft
   emit both smoke and flame from fixed-step simulation. Missing evidence is a
   failure; comments alone cannot satisfy a contract. */
import {createHash} from 'node:crypto';
import {execFile as execFileCallback} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFile=promisify(execFileCallback);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const startedUtc=new Date().toISOString();
const runId=startedUtc.replace(/[:.]/g,'-');
const output=join(root,'.tmp','air-propulsion','runs',runId);
const TOOL_PATH='tools/probe-air-propulsion.mjs';
const CORE_FILES=['src/ui/render3d.js','src/game/sim.js','src/game/airwarfare.js',
  'src/engine/ordnancetrails.js','boot.js','assets/data/manifest.json'];

const sha256=value=>createHash('sha256').update(value).digest('hex');
async function git(args){
  return (await execFile('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})).stdout.trimEnd();
}
async function fileIdentity(path){
  const abs=join(root,path);if(!existsSync(abs))return null;
  const bytes=await readFile(abs);return {path,bytes:bytes.length,sha256:sha256(bytes)};
}
async function listModelFiles(){
  const out=await git(['ls-files','--cached','--others','--exclude-standard','src/engine/models*.js','src/airlift*.js']);
  return out.split(/\r?\n/).filter(Boolean).sort();
}
async function provenance(paths){
  const files=[];
  for(const path of paths){const row=await fileIdentity(path);if(row)files.push(row);}
  const [head,status]=await Promise.all([git(['rev-parse','HEAD']),git(['status','--porcelain=v1','--untracked-files=all'])]);
  const dirtyEntries=status?status.split(/\r?\n/).filter(Boolean):[];
  return {head,dirty:dirtyEntries.length>0,dirtyEntries:dirtyEntries.length,
    dirtyFingerprint:sha256(status),sourceSetSha256:sha256(files.map(f=>`${f.path}:${f.sha256}`).join('\n')),files};
}
function stripComments(source){
  /* Preserve newlines so evidence line numbers remain source line numbers. */
  return source.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' ')).replace(/\/\/[^\r\n]*/g,'');
}
function extractFunction(source,name){
  const re=new RegExp(`function\\s+${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*\\(`);
  const start=source.search(re);if(start<0)return null;
  let depth=0,seen=false,quote='',escape=false;
  for(let i=start;i<source.length;i++){
    const ch=source[i];
    if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{'){depth++;seen=true;}else if(ch==='}'&&seen&&--depth===0)return source.slice(start,i+1);
  }
  return null;
}
function lineOf(source,re){
  const lines=source.split(/\r?\n/);for(let i=0;i<lines.length;i++)if(re.test(lines[i]))return i+1;return null;
}
function refsFor(source,file,res){
  return res.map(re=>({file,line:lineOf(source,re),pattern:String(re)})).filter(x=>x.line!=null);
}
function findSolidEmissionOffenders(file,source){
  const code=stripComments(source),offenders=[];
  const fnRe=/function\s+([A-Za-z_$][\w$]*)\s*\(/g;let m;
  while((m=fnRe.exec(code))){
    const name=m[1];
    if(!/(?:plume|thruster(?:jet|energy|core|efflux)|exhaust(?:jet|energy|core|efflux)|propulsion(?:jet|energy|core|efflux))/i.test(name))continue;
    /* Nozzle/bell/housing hardware is allowed; emitted energy geometry is not. */
    if(/(?:bell|nozzle|housing|socket|hardpoint)$/i.test(name))continue;
    const body=extractFunction(code,name);if(!body)continue;
    const primitive=/(?:\b(?:cylX|tubeX|ringX|gunX)\s*\(|\b[a-zA-Z_$][\w$]*\.(?:box|cyl|tube|ring|wedge|extrude|bevelBox)\s*\()/;
    if(primitive.test(body))offenders.push({file,name,line:lineOf(source,new RegExp(`function\\s+${name}\\s*\\(`)),reason:'emitted-energy helper builds solid mesh primitives'});
  }
  /* Catch an inline or renamed aircraft decorator that bypasses a named plume
     helper but still builds material-labelled exhaust energy out of solids. */
  const lines=code.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    if(!/(?:cylX|tubeX|ringX|\.box|\.cyl|\.tube|\.ring|\.wedge|\.extrude)\s*\(/.test(lines[i]))continue;
    const window=lines.slice(Math.max(0,i-4),Math.min(lines.length,i+5)).join(' ');
    if(/(?:PLUME|THRUSTER_(?:ENERGY|JET|CORE)|EXHAUST_(?:ENERGY|JET|CORE)|PROPULSION_(?:ENERGY|JET|CORE))/i.test(window))
      offenders.push({file,name:'inline-solid-emission',line:i+1,reason:'solid primitive is coupled to an emitted-energy/plume material identifier'});
  }
  return offenders.filter((o,i,a)=>a.findIndex(x=>x.file===o.file&&x.line===o.line&&x.name===o.name)===i);
}
function segmentDirectionContract(nozzle,tail,velocity){
  const dx=tail.x-nozzle.x,dy=tail.y-nozzle.y,dz=(tail.h||0)-(nozzle.h||0);
  const planar=Math.hypot(dx,dy),speed=Math.hypot(velocity.x,velocity.y);
  if(planar<1e-4)return {ok:false,reason:'vertical-line-collapse',planar,dz,alignment:null};
  if(speed<1e-4)return {ok:false,reason:'missing-simulation-velocity',planar,dz,alignment:null};
  const alignment=(dx/planar)*(-velocity.x/speed)+(dy/planar)*(-velocity.y/speed);
  return {ok:alignment>=Math.cos(Math.PI/9),reason:alignment>=Math.cos(Math.PI/9)?null:'exhaust-not-opposite-velocity',planar,dz,alignment};
}
function nozzleWidthContract(queueSource){
  /* mfOrd's width attribute is a half-width: side=-1/+1 expands to two times
     the supplied value. AIR_PROPULSION_PROFILE.w is the modeled bore diameter,
     so an apparent diameter ratio must include that factor of two. */
  let m=queueSource&&queueSource.match(/mfOrdnanceTrailQueuePath\s*\(\s*path\s*,\s*n\s*,\s*nozzlePx\s*\*\s*([0-9.]+)\s*,\s*nozzlePx\s*\*\s*([0-9.]+)/s);
  if(!m&&queueSource){
    const outer=queueSource.match(/const\s+outerHalf\s*=\s*Math\.max\s*\([^;]*?boreDpx\s*\*\s*([0-9.]+)\s*\)/s);
    const inner=queueSource.match(/const\s+innerHalf\s*=\s*Math\.max\s*\([^;]*?boreDpx\s*\*\s*([0-9.]+)\s*\)/s);
    const namedCall=/mfOrdnanceTrailQueuePath\s*\(\s*path\s*,\s*n\s*,\s*outerHalf\s*,\s*innerHalf\b/.test(queueSource);
    if(outer&&inner&&namedCall)m=[null,outer[1],inner[1]];
  }
  if(!m)return {ok:false,reason:'unmeasurable-width-formula',outerMultiplier:null,innerMultiplier:null,outerDiameterRatio:null,innerDiameterRatio:null};
  const outerMultiplier=Number(m[1]),innerMultiplier=Number(m[2]);
  const outerDiameterRatio=outerMultiplier*2,innerDiameterRatio=innerMultiplier*2;
  const ok=Math.abs(outerDiameterRatio-1.16)<=.08&&Math.abs(innerDiameterRatio-.46)<=.06;
  return {ok,reason:ok?null:'ribbon-mouth-does-not-match-modeled-bore',outerMultiplier,innerMultiplier,outerDiameterRatio,innerDiameterRatio};
}
function airProfileBoreDiameters(source){
  const out={};
  for(const name of ['Wasp','Raptor','Kestrel']){
    const m=source.match(new RegExp(`${name}\\s*:\\s*\\{[^}]*\\bw\\s*:\\s*([0-9.]+)`));
    out[name]=m?Number(m[1]):null;
  }
  return out;
}
const AIR_PROPULSION_TOPOLOGY=Object.freeze({
  nova:Object.freeze({
    Wasp:{mode:'rear-trail',rear:{count:2,diameter:.86}},
    Raptor:{mode:'rear-trail',rear:{count:2,diameter:1.10}},
    Kestrel:{mode:'rear-trail',rear:{count:2,diameter:.54}},
    'Atlas Skycrane':{mode:'lift-down',lift:{count:4,diameter:3.20}}
  }),
  legion:Object.freeze({
    Wasp:{mode:'rear-trail',rear:{count:2,diameter:.84}},
    Raptor:{mode:'rear-trail',rear:{count:2,diameter:1.08}},
    Kestrel:{mode:'rear-trail',rear:{count:2,diameter:.84}},
    'Atlas Skycrane':{mode:'lift-down',lift:{count:4,diameter:2.90}}
  }),
  syndicate:Object.freeze({
    Wasp:{mode:'field',rear:{count:1,diameter:1.36},lift:{count:2,diameter:1.00}},
    Raptor:{mode:'field',rear:{count:2,diameter:1.44},lift:{count:2,diameter:1.32}},
    Kestrel:{mode:'field',rear:{count:1,diameter:1.20},lift:{count:2,diameter:.76}},
    'Atlas Skycrane':{mode:'field-lift',lift:{count:6,diameter:2.10}}
  })
});
function near(a,b,tolerance=1e-6){return Number.isFinite(a)&&Math.abs(a-b)<=tolerance;}
function axisMatches(axis,want){
  return Array.isArray(axis)&&axis.length===3&&axis.every((v,i)=>near(Number(v),want[i]));
}
function validateModelPropulsionTopology(snapshot){
  const rows=[],failures=[];
  for(const [faction,models] of Object.entries(AIR_PROPULSION_TOPOLOGY)){
    for(const [typeName,want] of Object.entries(models)){
      const got=snapshot?.models?.[faction]?.[typeName]||null;
      const sockets=Array.isArray(got?.sockets)?got.sockets:[];
      const rear=sockets.filter(s=>s?.effect==='trail'),lift=sockets.filter(s=>s?.effect==='lift');
      const checks={present:!!got,mode:got?.mode===want.mode,
        rearCount:rear.length===(want.rear?.count||0),liftCount:lift.length===(want.lift?.count||0),
        rearAxis:rear.every(s=>axisMatches(s.axis,[-1,0,0])),liftAxis:lift.every(s=>axisMatches(s.axis,[0,-1,0])),
        rearDiameter:rear.every(s=>near(Number(s.diameter),want.rear?.diameter)),
        liftDiameter:lift.every(s=>near(Number(s.diameter),want.lift?.diameter)),
        positions:sockets.every(s=>Array.isArray(s?.p)&&s.p.length===3&&s.p.every(Number.isFinite))};
      const ok=Object.values(checks).every(Boolean);
      const row={faction,typeName,want,got,checks,ok};rows.push(row);if(!ok)failures.push(row);
    }
  }
  const brood=Array.isArray(snapshot?.brood)?snapshot.brood:[];
  const broodExplicit=brood.length>0&&brood.every(row=>row?.mode==='organic-none'&&Array.isArray(row.sockets)&&row.sockets.length===0);
  if(!broodExplicit)failures.push({faction:'horde',typeName:'all resolved Brood aircraft',want:{mode:'organic-none',socketCount:0},got:brood});
  return {ok:failures.length===0,rows,brood,broodExplicit,failures};
}
function pass(id,evidence){return {id,status:'PASS',supported:true,reason:null,evidence};}
function fail(id,reason,evidence){return {id,status:'FAIL',supported:false,reason,evidence:evidence??null};}

await mkdir(output,{recursive:true});
const modelFiles=await listModelFiles();
const sourceFiles=[...new Set([...CORE_FILES,...modelFiles,TOOL_PATH])];
const startSource=await provenance(sourceFiles);
const source={};
for(const path of sourceFiles)if(existsSync(join(root,path)))source[path]=await readFile(join(root,path),'utf8');
const renderText=source['src/ui/render3d.js']||'',simText=source['src/game/sim.js']||'',
      airText=source['src/game/airwarfare.js']||'',trailText=source['src/engine/ordnancetrails.js']||'';
const renderCode=stripComments(renderText),simCode=stripComments(simText),
      airCode=stripComments(airText),trailCode=stripComments(trailText);
const propulsionFn=extractFunction(renderCode,'queueAirPropulsionFx');
const historyReadFn=extractFunction(airCode,'mfAirPropulsionHistoryRead');
const trailPathFn=extractFunction(trailCode,'mfOrdnanceTrailQueuePath');
const unitTickFn=extractFunction(simCode,'unitTick')||'';
const solidOffenders=[];
for(const file of modelFiles)solidOffenders.push(...findSolidEmissionOffenders(file,source[file]||''));

const selfTestBad=`function fakeThrusterEnergy(m){ cylX(m,-8,1,0,6,.1,.8,8,PLUME_CORE,false); }`;
const selfTestGood=`function queueAirPropulsionFx(i,T){ if(!fogFxVisible(ux[i],uy[i],uteam[i]))return 0; for(let layer=0;layer<2;layer++)bbAdd.add(sprite,0,0,0,1,0,90,220,255,120); }`;
const alignedFixture=segmentDirectionContract({x:4,y:3,h:20},{x:-3,y:3,h:20},{x:18,y:0});
const yaw90Fixture=segmentDirectionContract({x:4,y:3,h:20},{x:4,y:-4,h:20},{x:18,y:0});
const verticalFixture=segmentDirectionContract({x:4,y:3,h:20},{x:4,y:3,h:7},{x:18,y:0});
const matchedWidthFixture=nozzleWidthContract('mfOrdnanceTrailQueuePath(path,n,nozzlePx*.58,nozzlePx*.23,col,.2)');
const oversizedWidthFixture=nozzleWidthContract('mfOrdnanceTrailQueuePath(path,n,nozzlePx*1.34,nozzlePx*.48,col,.2)');
const selfTests={
  rejectsSolidFixture:findSolidEmissionOffenders('bad-fixture.js',selfTestBad).length>=1,
  acceptsTransparentFixture:findSolidEmissionOffenders('good-fixture.js',selfTestGood).length===0,
  extractsTransparentFixture:!!extractFunction(selfTestGood,'queueAirPropulsionFx'),
  acceptsOppositeVelocityFixture:alignedFixture.ok,
  rejectsNinetyDegreeYawFixture:!yaw90Fixture.ok&&yaw90Fixture.reason==='exhaust-not-opposite-velocity',
  rejectsVerticalCollapseFixture:!verticalFixture.ok&&verticalFixture.reason==='vertical-line-collapse',
  acceptsSocketMatchedWidthFixture:matchedWidthFixture.ok,
  rejectsOversizedSolidLookingWidthFixture:!oversizedWidthFixture.ok
};

const refs={
  queue:refsFor(renderText,'src/ui/render3d.js',[/function\s+queueAirPropulsionFx\s*\(/]),
  queueCall:refsFor(renderText,'src/ui/render3d.js',[/queueAirPropulsionFx\s*\(/]),
  additive:refsFor(renderText,'src/ui/render3d.js',[/blendFunc\s*\(\s*gl\.SRC_ALPHA\s*,\s*gl\.ONE\s*\)/]),
  depth:refsFor(renderText,'src/ui/render3d.js',[/gl\.enable\s*\(\s*gl\.DEPTH_TEST\s*\)/,/gl\.depthMask\s*\(\s*false\s*\)/]),
  critical:refsFor(simText,'src/game/sim.js',[/T\.air.*hpFrac.*emitAirSmoke/,/addFirePuff\s*\(/])
};

const assertions=[];
assertions.push(solidOffenders.length===0
  ?pass('no-solid-aircraft-energy-geometry',{modelFiles:modelFiles.length,offenders:[]})
  :fail('no-solid-aircraft-energy-geometry','aircraft propulsion energy is still welded from opaque/solid model primitives',{modelFiles:modelFiles.length,offenders:solidOffenders}));
assertions.push(propulsionFn
  ?pass('transparent-propulsion-queue-present',{refs:refs.queue})
  :fail('transparent-propulsion-queue-present','queueAirPropulsionFx is missing from the live renderer',{refs:refs.queue}));

const queueNoMesh=!!propulsionFn&&!/(?:\bMB\s*\(|MeshBuilder|UNIT_MDL|\.hull\.add|\.tur\.add|\.(?:box|cyl|tube|ring|wedge|extrude|bevelBox)\s*\(|\b(?:cylX|tubeX|ringX)\s*\()/.test(propulsionFn);
assertions.push(queueNoMesh
  ?pass('queue-has-no-solid-or-opaque-mesh-path',{primitiveScan:'clear'})
  :fail('queue-has-no-solid-or-opaque-mesh-path','propulsion queue is missing or contains a unit/mesh primitive path',null));

const continuousPath=!!propulsionFn&&!!trailPathFn&&/mfAirPropulsionHistoryRead\s*\(/.test(propulsionFn)&&/mfOrdnanceTrailQueuePath\s*\(/.test(propulsionFn);
const pathEmitCount=trailPathFn?(trailPathFn.match(/mfOrdEmitSegment\s*\(/g)||[]).length:0;
const alphaLayer=(!!propulsionFn&&/(?:bbAdd\.add|addBeam3D|(?:alpha|opacity|a)\s*[:=])/.test(propulsionFn))||
  (continuousPath&&/\balpha\b/.test(trailPathFn)&&pathEmitCount===2);
const additiveState=/blendFunc\s*\(\s*gl\.SRC_ALPHA\s*,\s*gl\.ONE\s*\)/.test(renderCode+'\n'+trailCode);
const noBillboardPath=!!propulsionFn&&!/(?:bbAdd\.add|bbAlpha\.add|addBeamRibbon|addBeam3D)\s*\(/.test(propulsionFn)&&
  !!trailPathFn&&!/(?:bbAdd\.add|bbAlpha\.add|addBeamRibbon|addBeam3D)\s*\(/.test(trailPathFn);
assertions.push(alphaLayer&&additiveState&&noBillboardPath
  ?pass('alpha-additive-ribbon-layers',{queueAlpha:true,additiveBlend:true,continuousPath,pathEmitCount,noBillboardPath})
  :fail('alpha-additive-ribbon-layers','render path must submit two alpha layers into a SRC_ALPHA/ONE continuous strip pass, without billboard fallback',{queueAlpha:alphaLayer,additiveBlend:additiveState,continuousPath,pathEmitCount,noBillboardPath}));

/* The normal-unit caller inherits renderBand + fogEntityVisible immediately
   above its unit loop. The queue repeats fogFxVisible defensively. Dropcraft
   callers are separately bounded by active/deploy lifetime and arrival vis. */
const unitLoopStart=renderText.indexOf('// ---------------- units ----------------');
const unitCallMatch=unitLoopStart>=0
  ?/queueAirPropulsionFx\s*\(\s*i\s*,/.exec(renderText.slice(unitLoopStart)):null;
const unitCallEnd=unitCallMatch?unitLoopStart+unitCallMatch.index+unitCallMatch[0].length+180:-1;
const unitCallerWindow=unitLoopStart>=0&&unitCallEnd>unitLoopStart
  ?renderText.slice(Math.max(0,unitLoopStart-200),unitCallEnd):'';
const inheritedVisibility=/renderBand\s*\(/.test(unitCallerWindow)&&/fogEntityVisible\s*\(/.test(unitCallerWindow)&&/queueAirPropulsionFx\s*\(/.test(unitCallerWindow);
const directFog=!!propulsionFn&&/(?:fogFxVisible|fogPointVisible)\s*\(/.test(propulsionFn);
const directCamera=!!propulsionFn&&/(?:\bvis\s*\(|camBounds\s*\(|renderBand\s*\(|cameraVisible)/.test(propulsionFn);
const visibilityGate=directFog&&(directCamera||inheritedVisibility);
assertions.push(visibilityGate
  ?pass('fog-and-camera-gated',{directFog,directCamera,inheritedVisibility,refs:refs.queue})
  :fail('fog-and-camera-gated','propulsion needs a direct fog gate and either a direct or inherited camera/visibility gate',{directFog,directCamera,inheritedVisibility}));

const depthContract=/gl\.enable\s*\(\s*gl\.DEPTH_TEST\s*\)/.test(renderCode+'\n'+trailCode)&&/gl\.depthMask\s*\(\s*false\s*\)/.test(renderCode+'\n'+trailCode);
assertions.push(depthContract
  ?pass('depth-tested-non-writing-pass',{depthTest:true,depthWrite:false,refs:refs.depth})
  :fail('depth-tested-non-writing-pass','transparent propulsion must retain depth testing while disabling depth writes',null));

/* Accept either an explicit two-iteration loop or two authored additive calls.
   More than two layers per hardpoint is rejected; a single layer is incomplete. */
const explicitTwo=!!propulsionFn&&/(?:layer|l)\s*(?:<|<=)\s*(?:2|1)\b/.test(propulsionFn);
const ribbonCalls=propulsionFn?(propulsionFn.match(/(?:addBeamRibbon|addBeam3D)\s*\(/g)||[]).length:0;
const glowCards=propulsionFn?(propulsionFn.match(/bbAdd\.add\s*\(/g)||[]).length:0;
const boundedCap=!!propulsionFn&&/(?:Math\.min\s*\(\s*2\b|(?:MAX|CAP|LAYERS)[A-Z0-9_]*\s*=\s*2\b|(?:layers?|layerCount)\s*[:=]\s*2\b)/i.test(propulsionFn);
/* An anchored nozzle glow card is not an emitted trail layer. Exactly two
   transparent ribbons are allowed in addition to that stationary cue. */
const continuousTwo=continuousPath&&pathEmitCount===2;
const boundedTwo=explicitTwo||boundedCap||ribbonCalls===2||continuousTwo;
assertions.push(boundedTwo
  ?pass('bounded-two-layer-exhaust',{explicitTwo,boundedCap,ribbonCalls,continuousTwo,pathEmitCount,anchoredGlowCards:glowCards})
  :fail('bounded-two-layer-exhaust','each hardpoint must emit exactly two bounded transparent ribbon/strip layers',{explicitTwo,boundedCap,ribbonCalls,continuousTwo,pathEmitCount,anchoredGlowCards:glowCards}));

const boreDiameterSemantic=/\bw\s+is\s+the\s+modeled\s+exhaust-bore\s+DIAMETER\b/i.test(renderText);
const profileBores=airProfileBoreDiameters(renderCode);
const profileBoresMeasured=Math.abs(profileBores.Wasp-.86)<1e-6&&Math.abs(profileBores.Raptor-1.10)<1e-6&&
  Math.abs(profileBores.Kestrel-.54)<1e-6&&new Set(Object.values(profileBores)).size===3;
/* Sub-pixel exhaust is allowed a visibility floor, but only as an explicit
   Math.max branch around the projected modeled diameter. The ratio applies to
   all normally resolved mouths before that LOD exception. */
const minPixelLodException=!!propulsionFn&&
  /const\s+outerHalf\s*=\s*Math\.max\s*\(\s*far\s*\?\s*[0-9.]+\s*:\s*[0-9.]+\s*,\s*boreDpx\s*\*\s*[0-9.]+\s*\)/.test(propulsionFn)&&
  /const\s+innerHalf\s*=\s*Math\.max\s*\(\s*far\s*\?\s*[0-9.]+\s*:\s*[0-9.]+\s*,\s*boreDpx\s*\*\s*[0-9.]+\s*\)/.test(propulsionFn);
const nozzleWidth=nozzleWidthContract(propulsionFn);
const modelSocketDiameterSemantic=!!propulsionFn&&/\.diameter\b/.test(propulsionFn)&&
  modelFiles.some(file=>/propulsion\s*:\s*\{[\s\S]*?\bsockets\s*:\s*\[[\s\S]*?\bdiameter\s*:/s.test(source[file]||''));
const measuredBoresAvailable=profileBoresMeasured||modelSocketDiameterSemantic;
assertions.push((boreDiameterSemantic||modelSocketDiameterSemantic)&&measuredBoresAvailable&&minPixelLodException&&nozzleWidth.ok
  ?pass('projected-nozzle-width-contract',{semantic:modelSocketDiameterSemantic?'model socket diameter; strip width is half-width':'profile w is bore diameter; strip width is half-width',profileBores,profileBoresMeasured,modelSocketDiameterSemantic,minPixelLodException,...nozzleWidth})
  :fail('projected-nozzle-width-contract','model-resolved socket diameters must drive ribbon width; before taper the transparent mouth must be approximately 1.16x bore and its inner filament 0.46x, with only an explicit sub-pixel LOD floor allowed',{boreDiameterSemantic,modelSocketDiameterSemantic,profileBores,profileBoresMeasured,minPixelLodException,...nozzleWidth,recommended:{outerMultiplier:.58,innerMultiplier:.23,outerDiameterRatio:1.16,innerDiameterRatio:.46}}));

const modelProfilesPropagated=/propulsion\s*:\s*g\.propulsion/.test(renderCode+'\n'+Object.values(source).join('\n'));
const queueUsesModelProfile=!!propulsionFn&&/\.sockets\b/.test(propulsionFn)&&/\.diameter\b/.test(propulsionFn)&&
  /\.axis\b/.test(propulsionFn)&&/\.effect\b/.test(propulsionFn);
const callerPassesResolvedMesh=/(?:queueAirPropulsionFx\s*\(|queueAirPropulsionFx\s*\n?\s*\()[\s\S]{0,420}\bM\.propulsion\b/.test(renderCode);
const noGenericAircraftFallback=!/override\s*\|\|\s*AIR_PROPULSION_PROFILE\s*\[\s*typeName\s*\]/.test(propulsionFn||'');
const explicitOrganicNone=/k\s*===\s*['"]horde['"][\s\S]{0,120}\{\s*mode\s*:\s*['"]organic-none['"]\s*,\s*sockets\s*:\s*\[\s*\]/.test(renderCode+'\n'+Object.values(source).join('\n'));
assertions.push(modelProfilesPropagated&&queueUsesModelProfile&&callerPassesResolvedMesh&&noGenericAircraftFallback&&explicitOrganicNone
  ?pass('model-owned-faction-propulsion-binding',{modelProfilesPropagated,queueUsesModelProfile,callerPassesResolvedMesh,noGenericAircraftFallback,explicitOrganicNone})
  :fail('model-owned-faction-propulsion-binding','live rendering must pass the resolved faction mesh propulsion contract into the queue; sockets, axes, diameters and effects cannot fall back to a generic type-name profile',{modelProfilesPropagated,queueUsesModelProfile,callerPassesResolvedMesh,noGenericAircraftFallback,explicitOrganicNone}));

const queueIntegrated=!!propulsionFn&&((renderCode.match(/queueAirPropulsionFx\s*\(/g)||[]).length>=2);
assertions.push(queueIntegrated
  ?pass('live-render-call-site',{definitionsAndCalls:(renderCode.match(/queueAirPropulsionFx\s*\(/g)||[]).length,refs:refs.queueCall})
  :fail('live-render-call-site','the renderer defines the queue but does not call it from live aircraft iteration',{refs:refs.queueCall}));

const authoredNozzleOrigin=!!propulsionFn&&!!historyReadFn&&
  (/mfAirPropulsionHistoryRead\s*\(\s*unitIndex\s*,\s*P\.x\s*,\s*P\.y[^,]*,\s*lz/.test(propulsionFn)||
   (/\.sockets\b/.test(propulsionFn)&&/\.p\b/.test(propulsionFn)&&/\.axis\b/.test(propulsionFn)&&
    /mfAirPropulsionHistoryRead\s*\(/.test(propulsionFn)))&&
  /localX/.test(historyReadFn)&&/localZ/.test(historyReadFn)&&
  /(?:Math\.cos\s*\(\s*yaw\s*\)|\bca\b)/.test(historyReadFn)&&/(?:Math\.sin\s*\(\s*yaw\s*\)|\bsa\b)/.test(historyReadFn);
assertions.push(authoredNozzleOrigin
  ?pass('authored-nozzle-origin',{profile:queueUsesModelProfile?'resolved mesh propulsion sockets':'AIR_PROPULSION_PROFILE',localX:true,lateralHardpoints:true,orientationTransform:true})
  :fail('authored-nozzle-origin','every propulsion segment must begin at an authored nozzle hardpoint transformed by aircraft orientation',null));

/* A hull yaw can lag, bank or be wrong by a model-axis quarter turn. The
   emitted path therefore needs an actual fixed-step velocity/history tangent;
   yaw may orient the local nozzle only, never own tail direction by itself. */
const queueHasMotionInput=!!propulsionFn&&/(?:\b(?:vx|vy|velX|velY|motionX|motionY)\b|velocity|propulsionHistory|historyTangent)/i.test(propulsionFn);
const callerSuppliesMotion=/(?:queueAirPropulsionFx\s*\([^;]{0,420}(?:uAirVx|uAirVy|mvx|mvy|propulsionHistory|historyTangent)|mfAirPropulsionHistory(?:Get|Read)\s*\()/s.test(renderCode);
const directionNotYawOnly=!!propulsionFn&&!/(?:const|let)\s+ex\s*=\s*nx\s*-\s*ca\s*\*\s*len\s*,\s*ey\s*=\s*ny\s*-\s*sa\s*\*\s*len/.test(propulsionFn);
const historyMotionPath=!!propulsionFn&&!!historyReadFn&&/mfAirPropulsionHistoryRead\s*\(/.test(propulsionFn)&&
  /oldest/.test(historyReadFn)&&/uAirPropulsionHistoryData/.test(historyReadFn);
const oppositeMotionMath=(!!propulsionFn&&/(?:-\s*(?:vx|velX|motionX)|opposite|reverseTangent|backX|tailDirX|historyTangent)/i.test(propulsionFn))||historyMotionPath;
const velocityAligned=queueHasMotionInput&&callerSuppliesMotion&&directionNotYawOnly&&oppositeMotionMath;
assertions.push(velocityAligned
  ?pass('opposite-simulation-velocity-direction',{queueHasMotionInput,callerSuppliesMotion,directionNotYawOnly,oppositeMotionMath,historyMotionPath})
  :fail('opposite-simulation-velocity-direction','tail direction must use the negative fixed-step velocity/history tangent; hull yaw may transform nozzle origin but cannot define exhaust direction alone',{queueHasMotionInput,callerSuppliesMotion,directionNotYawOnly,oppositeMotionMath,
    currentYawOnly:!!propulsionFn&&/ex\s*=\s*nx\s*-\s*ca\s*\*\s*len/.test(propulsionFn)}));

const authorityCode=simCode+'\n'+airCode+'\n'+trailCode;
const historyWriter=/function\s+mfAirPropulsion(?:History)?(?:Sample|Push|Tick)\s*\(/.test(authorityCode);
const fixedStepCall=/(?:unitTick|mfAirAfterMove|mfAirAuthorityTick)[\s\S]{0,18000}mfAirPropulsion(?:History)?(?:Sample|Push|Tick)\s*\(/.test(authorityCode);
const historyIdentity=/(?:ugen\s*\[|generation|gen\b)/.test(authorityCode.match(/function\s+mfAirPropulsion(?:History)?(?:Sample|Push|Tick)\s*\([\s\S]{0,2400}/)?.[0]||'');
const boundedHistory=/(?:MF_AIR_PROPULSION_(?:HISTORY_)?(?:CAP|MAX|SAMPLES)|AIR_PROPULSION_(?:HISTORY_)?(?:CAP|MAX|SAMPLES))\s*=\s*\d+/.test(authorityCode)&&
  /(?:Float32Array|Map|Array)\s*\(/.test(authorityCode);
const renderConsumesHistory=/(?:mfAirPropulsionHistory(?:Get|Read|Points|Tangent)|propulsionHistory|historyTangent)/.test(renderCode);
const noRenderHistoryMutation=!/function\s+render\s*\([^)]*\)[\s\S]{0,120000}mfAirPropulsion(?:History)?(?:Sample|Push|Tick)\s*\(/.test(renderCode);
const persistentHistory=historyWriter&&fixedStepCall&&historyIdentity&&boundedHistory&&renderConsumesHistory&&noRenderHistoryMutation;
assertions.push(persistentHistory
  ?pass('persistent-fixed-step-propulsion-history',{historyWriter,fixedStepCall,historyIdentity,boundedHistory,renderConsumesHistory,noRenderHistoryMutation})
  :fail('persistent-fixed-step-propulsion-history','propulsion needs a bounded generation-safe path history written only by fixed-step simulation and consumed read-only by rendering; the existing smoke/contrail history does not count as engine-energy history',{historyWriter,fixedStepCall,historyIdentity,boundedHistory,renderConsumesHistory,noRenderHistoryMutation}));

const historyCarriesPlanarPoints=historyWriter&&!!historyReadFn&&
  /uAirPropulsionHistoryData\[o\]\s*=\s*ux\[i\]/.test(airCode)&&/uAirPropulsionHistoryData\[o\+1\]\s*=\s*uy\[i\]/.test(airCode)&&
  /out\[q\]\s*=/.test(historyReadFn)&&/out\[q\+2\]\s*=/.test(historyReadFn);
const historyDrawUsesPlanarEndpoints=renderConsumesHistory&&continuousPath&&!!trailPathFn&&
  /_mfOrdA\[0\]\s*=\s*points\[a\]/.test(trailPathFn)&&/_mfOrdA\[2\]\s*=\s*points\[a\+2\]/.test(trailPathFn)&&
  /_mfOrdB\[0\]\s*=\s*points\[b\]/.test(trailPathFn)&&/_mfOrdB\[2\]\s*=\s*points\[b\+2\]/.test(trailPathFn)&&
  /Math\.hypot\s*\(\s*_mfOrdB\[0\]-_mfOrdA\[0\][\s\S]{0,180}_mfOrdB\[2\]-_mfOrdA\[2\]/.test(trailPathFn);
assertions.push(historyCarriesPlanarPoints&&historyDrawUsesPlanarEndpoints
  ?pass('history-cannot-collapse-to-vertical-line',{historyCarriesPlanarPoints,historyDrawUsesPlanarEndpoints})
  :fail('history-cannot-collapse-to-vertical-line','persistent ribbon endpoints must carry distinct world X/Y samples; height-only endpoints collapse into a vertical screen line',{historyCarriesPlanarPoints,historyDrawUsesPlanarEndpoints,negativeFixture:verticalFixture}));

const smokeCall=/T\.air\s*&&\s*hpFrac\s*<\s*0?\.35[\s\S]{0,180}emitAirSmoke\s*\(/.test(unitTickFn);
const flameCall=/T\.air[\s\S]{0,180}hpFrac\s*<\s*0?\.18[\s\S]{0,1200}addFirePuff\s*\(/.test(unitTickFn);
const flameAltitude=/addFirePuff\s*\([^;]{0,260}(?:unitAirAlt|mfAirAltitude)\s*\(/.test(unitTickFn);
const deterministicCadence=/(?:tick\s*\+\s*i|i\s*\+\s*tick|tick\s*&|tick\s*%)[\s\S]{0,1200}addFirePuff\s*\(/.test(unitTickFn)||
  /addFirePuff\s*\([^;]{0,420}(?:tick\s*\+\s*i|i\s*\+\s*tick|mfAirCrashValue)/.test(unitTickFn);
const noRenderEmission=!/addFirePuff\s*\(/.test(renderCode);
assertions.push(smokeCall&&flameCall&&flameAltitude&&deterministicCadence&&noRenderEmission
  ?pass('critical-air-smoke-plus-flame-fixed-step',{smokeCall,flameCall,flameAltitude,deterministicCadence,noRenderEmission,refs:refs.critical})
  :fail('critical-air-smoke-plus-flame-fixed-step','critical aircraft must emit height-aware smoke and flame together from deterministic sim, never render-loop emission',{smokeCall,flameCall,flameAltitude,deterministicCadence,noRenderEmission,refs:refs.critical}));

assertions.push(Object.values(selfTests).every(Boolean)
  ?pass('scanner-negative-fixture',{...selfTests})
  :fail('scanner-negative-fixture','the probe scanner did not reject its solid-plume fixture or accept its transparent fixture',selfTests));

let runtime={attempted:false,booted:false,hooks:null,topology:null,pageErrors:[],consoleErrors:[],reason:null};
try{
  const [{launchPwBrowser,closePwBrowser},{startStaticServer}]=await Promise.all([
    import('./pw-browser.mjs'),import('./perf-lab/perf-probe-runner.mjs')
  ]);
  let server=null,browser=null;
  try{
    runtime.attempted=true;server=await startStaticServer();browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
    const page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1,colorScheme:'dark'});
    page.on('pageerror',e=>runtime.pageErrors.push(String(e?.stack||e)));
    page.on('console',m=>{if(m.type()==='error')runtime.consoleErrors.push(m.text());});
    await page.addInitScript(()=>{try{localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_ap_gate_closed','1');}catch{}});
    await page.goto(`${server.url}?airpropulsionprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>typeof render==='function'&&typeof spawnUnit==='function',null,{timeout:90000});
    await page.waitForFunction(()=>typeof FAC_MESH!=='undefined'&&FAC_MESH.nova&&Object.keys(FAC_MESH.nova).length>0,null,{timeout:90000});
    const browserEvidence=await page.evaluate(()=>{
      const hooks={queueAirPropulsionFx:typeof queueAirPropulsionFx,render:typeof render,spawnUnit:typeof spawnUnit,
        mfAirPropulsionHistorySample:typeof mfAirPropulsionHistorySample,mfAirPropulsionHistoryRead:typeof mfAirPropulsionHistoryRead,
        mfOrdnanceTrailQueuePath:typeof mfOrdnanceTrailQueuePath,addFirePuff:typeof addFirePuff,emitAirSmoke:typeof emitAirSmoke};
      const copyProfile=P=>P?{mode:String(P.mode||''),sockets:Array.isArray(P.sockets)?P.sockets.map(S=>({
        p:Array.isArray(S.p)?S.p.map(Number):null,axis:Array.isArray(S.axis)?S.axis.map(Number):null,
        diameter:Number(S.diameter),effect:String(S.effect||'')})):null}:null;
      const names=['Wasp','Raptor','Kestrel','Atlas Skycrane'],kits=['nova','legion','syndicate'];
      const models={};
      if(typeof TYPES!=='undefined'&&typeof FAC_MESH!=='undefined')for(const kit of kits){
        models[kit]={};
        for(const name of names){
          const ty=TYPES.findIndex(T=>T&&T.name===name),M=ty>=0&&FAC_MESH[kit]?FAC_MESH[kit][ty]:null;
          models[kit][name]=copyProfile(M&&M.propulsion);
        }
      }
      const brood=[];
      if(typeof TYPES!=='undefined'&&typeof FAC_MESH!=='undefined'&&FAC_MESH.horde){
        for(let ty=0;ty<TYPES.length;ty++)if(TYPES[ty]&&TYPES[ty].air&&FAC_MESH.horde[ty])
          brood.push({typeName:TYPES[ty].name,...copyProfile(FAC_MESH.horde[ty].propulsion)});
      }
      return {hooks,topology:{models,brood}};
    });
    runtime.hooks=browserEvidence.hooks;runtime.topology=browserEvidence.topology;
    runtime.booted=true;
  }finally{
    if(browser)await closePwBrowser(browser).catch(()=>{});
    if(server)await server.close().catch(()=>{});
  }
}catch(error){runtime.reason=String(error?.stack||error);}
const topologyContract=validateModelPropulsionTopology(runtime.topology);
assertions.push(topologyContract.ok
  ?pass('faction-model-emitter-topology',{models:topologyContract.rows,brood:topologyContract.brood,broodExplicit:topologyContract.broodExplicit})
  :fail('faction-model-emitter-topology','resolved faction meshes must preserve their authored rear/lift socket counts, axes and bore diameters; Brood aircraft must explicitly resolve zero propulsion sockets',{failures:topologyContract.failures,brood:topologyContract.brood}));
const runtimeClean=runtime.booted&&runtime.hooks?.queueAirPropulsionFx==='function'&&runtime.hooks?.render==='function'&&
  runtime.hooks?.mfAirPropulsionHistorySample==='function'&&runtime.hooks?.mfAirPropulsionHistoryRead==='function'&&
  runtime.hooks?.mfOrdnanceTrailQueuePath==='function'&&runtime.hooks?.addFirePuff==='function'&&
  runtime.hooks?.emitAirSmoke==='function'&&runtime.pageErrors.length===0&&runtime.consoleErrors.length===0;
assertions.push(runtimeClean
  ?pass('source-runtime-boots-clean',{hooks:runtime.hooks,pageErrors:0,consoleErrors:0})
  :fail('source-runtime-boots-clean','current source did not boot the propulsion hooks cleanly in an isolated browser',runtime));

const endSource=await provenance(sourceFiles);
const sourceStable=startSource.sourceSetSha256===endSource.sourceSetSha256&&startSource.dirtyFingerprint===endSource.dirtyFingerprint;
assertions.push(sourceStable
  ?pass('source-stable-during-probe',{sourceSetSha256:endSource.sourceSetSha256,dirtyFingerprint:endSource.dirtyFingerprint})
  :fail('source-stable-during-probe','source or dirty-tree identity changed while evidence was being collected',{start:startSource,end:endSource}));

const failures=assertions.filter(a=>a.status!=='PASS');
const report={schema:'massfront-air-propulsion-probe-v1',startedUtc,completedUtc:new Date().toISOString(),
  status:failures.length?'FAIL':'PASS',summary:{passed:assertions.length-failures.length,failed:failures.length,total:assertions.length},
  provenance:{start:startSource,end:endSource},runtime,selfTests,assertions};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(output,'report.md'),`# MASSFRONT air propulsion probe\n\n- Status: **${report.status}**\n- Source set: \`${startSource.sourceSetSha256}\`\n- Dirty fingerprint: \`${startSource.dirtyFingerprint}\`\n- Assertions: ${report.summary.passed} PASS / ${report.summary.failed} FAIL\n\n${assertions.map(a=>`- ${a.status==='PASS'?'PASS':'FAIL'} \`${a.id}\`${a.reason?`: ${a.reason}`:''}`).join('\n')}\n`);
console.log(`[air-propulsion] ${report.status} ${report.summary.passed}/${report.summary.total}`);
for(const a of failures)console.error(`FAIL ${a.id}: ${a.reason}`);
console.log(`report: ${join(output,'report.json')}`);
process.exit(failures.length?1:0);
