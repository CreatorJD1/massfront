#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  fixtures:'design/stage10-traversal-fixtures.v1.json',
  surface:'assets/data/battlefieldtopology-stage10.js',
  interior:'assets/data/interiortopology-stage10.js',
  orbital:'assets/data/orbitaltopology-stage10.js',
  theatre:'assets/data/theatreprofiles-stage10.js',
  surfaceBindings:'design/stage10-surface-topology-bindings.json',
  interiorBindings:'source-media/content-library/stage10-interior-layout-bindings.v1.json',
  orbitalBindings:'source-media/content-library/stage10-orbital-layout-bindings.v1.json',
  manifest:'assets/data/manifest.json',boot:'boot.js'
};
const TOPOLOGY_VERIFIERS=[
  'tools/verify-stage10-battlefield-topology.mjs',
  'tools/verify-stage10-interior-topology.mjs',
  'tools/verify-stage10-orbital-topology.mjs'
];
const TOP_KEYS=['assetClaims','authorities','captureProtocol','domainPolicies','evidence','fixtures','purpose',
  'registrationAuthorized','runtimeReady','schema','sourceHashPolicy','status','version'];
const FIXTURE_KEYS=['domain','fixtureId','runtimeReady','sourceId','status'];
const MODEL_LIKE=/\.(?:glb|gltf|blend1?|fbx|obj|dae|stl|ply|usd|usdz)(?:\b|$)/i;
const checks=[];

function stable(value){
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function same(a,b){return stable(a)===stable(b);}
function clone(value){return JSON.parse(JSON.stringify(value));}
function exactKeys(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&same(Object.keys(value).sort(),[...keys].sort());}
function digest(value){return crypto.createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex');}
function fail(code,details={}){return {ok:false,error:{code,details}};}
function record(id,ok,details={}){checks.push({id,status:ok?'PASS':'FAIL',...details});}
function extractConst(source,name){
  const declaration=new RegExp('const\\s+'+name+'\\s*=').exec(source);
  if(!declaration) throw new Error('Missing declaration '+name);
  const token=declaration[0],start=declaration.index;
  let depth=0,quote='',escaped=false,line=false,block=false;
  for(let i=start+token.length;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(line){if(c==='\n') line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote) quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='('||c==='['||c==='{') depth++;
    else if(c===')'||c===']'||c==='}') depth--;
    else if(c===';'&&depth===0) return source.slice(start,i+1);
  }
  throw new Error('Unterminated declaration '+name);
}
function catalogFrom(text,name){
  const context=vm.createContext({});
  vm.runInContext(text,context,{timeout:10000});
  return JSON.parse(vm.runInContext('JSON.stringify('+name+')',context,{timeout:10000}));
}
function validate(catalog,sources){
  if(!catalog||catalog.schema!=='MassfrontStage10TraversalFixturesV1'||catalog.version!==1)
    return fail('TRAVERSAL_SCHEMA_INVALID');
  if(!exactKeys(catalog,TOP_KEYS)) return fail('TRAVERSAL_UNKNOWN_FIELD');
  if(catalog.status!=='SOURCE_ONLY_PENDING_EXECUTION'||catalog.runtimeReady!==false||catalog.registrationAuthorized!==false)
    return fail('TRAVERSAL_RUNTIME_ENABLED');
  if(sources.manifest.includes('stage10-traversal-fixtures')||sources.boot.includes('stage10-traversal-fixtures'))
    return fail('TRAVERSAL_REGISTERED');
  if(MODEL_LIKE.test(JSON.stringify(catalog))) return fail('TRAVERSAL_MODEL_LIKE_STRING');
  if(!same(catalog.authorities,{
    surface:REL.surface,interior:REL.interior,orbital:REL.orbital,theatre:REL.theatre,
    surfaceBindings:REL.surfaceBindings,interiorBindings:REL.interiorBindings,orbitalBindings:REL.orbitalBindings
  })) return fail('TRAVERSAL_AUTHORITIES_INVALID');
  if(catalog.sourceHashPolicy?.mode!=='CURRENT_PREFLIGHT_SEMANTIC_HASH_RECORDED_IN_VERIFICATION_REPORT'||
    catalog.sourceHashPolicy.randomnessAllowed!==false||catalog.sourceHashPolicy.staleHashPassAllowed!==false)
    return fail('TRAVERSAL_HASH_POLICY_INVALID');
  const capture=catalog.captureProtocol;
  const expectedCapture={status:'REQUIRED_NOT_CAPTURED',seed:104729,simulationTick:0,
    viewports:[[412,900],[900,412]],graphicsPreset:'stage10-authoring-reference',
    cameraStates:['command','tactical'],hardwareGpuRequired:true,sameStateBeforeAfterRequired:true};
  if(!same(capture,expectedCapture))
    return fail('TRAVERSAL_CAPTURE_PROTOCOL_INVALID');
  const policies=catalog.domainPolicies;
  const expectedPolicies={
    surface:{
      allowedProbeClasses:['infantry','vehicle','heavy','artillery','air','naval'],
      requiredAssertions:['spawn-route-resolution','spawn-to-major-site','minimum-two-site-approaches','route-width-clearance','cross-domain-transition','support-mode-collision-navigation','objective-resource-access','destruction-recovery','buildability-sightline','deterministic-repeat'],
      maritimeModes:['fixed_caisson','floating_pontoon','semi_submersible','shoreline_quay'],
      maritimeProofs:['waterline-or-shore-datum','draft-or-seabed-support','stable-deck-navigation','naval-hull-clearance','land-or-gangway-access','deterministic-destruction-outcome']
    },
    interior:{
      allowedProbeClasses:['infantry','support_drone','small_vehicle','mech'],
      forbiddenProbeClasses:['heavy_vehicle','heavy_mech','artillery','air','naval','titan'],
      requiredAssertions:['insertion-objective-extraction','mixed-route-6.4m','personnel-route-3.2m','turning-pocket-9m','portal-state-navigation','four-state-destruction','cutaway-objective-preservation','deterministic-repeat'],
      portalStates:['closed','open','jammed','destroyed'],destructionStates:['intact','damaged','critical','destroyed']
    },
    orbital:{
      allowedEnvelopeRefs:['infantry_boarding','orbital_smallcraft'],
      requiredAssertions:['insertion-objective-extraction','route-or-deck-volume-clearance','hazard-boundary','dual-objective-access','destructible-state-machine','ordered-recovery','rollback-last-complete-state','deterministic-repeat'],
      recoveryStates:['intact','damaged','disabled','destroyed','recovering','restored']
    }
  };
  if(!same(policies,expectedPolicies))
    return fail('TRAVERSAL_DOMAIN_POLICY_INVALID');

  const ids={
    surface:Object.keys(sources.surface.plans).sort(),
    interior:Object.keys(sources.interior.templates).sort(),
    orbital:Object.keys(sources.orbital.plans).sort()
  };
  if(ids.surface.length!==16||ids.interior.length!==4||ids.orbital.length!==6)
    return fail('TRAVERSAL_SOURCE_COVERAGE_INVALID',{counts:Object.fromEntries(Object.entries(ids).map(([k,v])=>[k,v.length]))});
  const bindingIds={
    surface:sources.surfaceBindings.bindings.map(row=>row.mapId).sort(),
    interior:[...new Set(sources.interiorBindings.bindings.map(row=>row.templateId))].sort(),
    orbital:sources.orbitalBindings.bindings.map(row=>row.seedId).sort()
  };
  if(!same(bindingIds.surface,ids.surface)||!same(bindingIds.interior,ids.interior)||!same(bindingIds.orbital,ids.orbital)||
    sources.surfaceBindings.bindings.some(row=>row.topologyPlan?.planId!==row.mapId)||
    sources.orbitalBindings.bindings.some(row=>row.topologyPlanId!==row.seedId||row.topologyPlan?.planId!==row.seedId)||
    sources.interiorBindings.bindings.length!==24||new Set(sources.interiorBindings.bindings.map(row=>row.bindingId)).size!==24)
    return fail('TRAVERSAL_BINDING_AUTHORITY_INVALID',{bindingIds});
  if(sources.theatre.planetAuthority!=='EXPLORATION_MODULE_SHOWCASE_SYSTEMS'||sources.theatre.runtimeReady!==false||
    !same(sources.theatre.interiorTemplates.map(row=>row.id).sort(),ids.interior)||
    !same(sources.theatre.orbitalLocationSeeds.map(row=>row.id).sort(),ids.orbital))
    return fail('TRAVERSAL_THEATRE_AUTHORITY_INVALID');
  const expected=Object.entries(ids).flatMap(([domain,list])=>list.map(sourceId=>({
    fixtureId:`traversal.${domain}.${sourceId}`,domain,sourceId,status:'PENDING_EXECUTION',runtimeReady:false
  })));
  const actual=[...(catalog.fixtures||[])].sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId));
  const sortedExpected=[...expected].sort((a,b)=>a.fixtureId.localeCompare(b.fixtureId));
  if(actual.some(row=>!exactKeys(row,FIXTURE_KEYS))||!same(actual,sortedExpected)) return fail('TRAVERSAL_FIXTURE_COVERAGE_INVALID');

  for(const [id,plan] of Object.entries(sources.surface.plans)){
    if(plan.status!=='AUTHORING_CANDIDATE'||plan.activation?.runtime!==false||!Array.isArray(plan.spawnZones)||plan.spawnZones.length<2)
      return fail('TRAVERSAL_SURFACE_SOURCE_INVALID',{id});
    if(plan.sites.some(site=>site.major===true&&(!Array.isArray(site.approaches)||site.approaches.length<2)))
      return fail('TRAVERSAL_SURFACE_APPROACH_INVALID',{id});
    if(plan.sites.some(site=>!policies.surface.maritimeModes.includes(site.supportMode)&&site.supportMode!=='terrain'))
      return fail('TRAVERSAL_SURFACE_SUPPORT_MODE_INVALID',{id});
  }
  for(const [id,template] of Object.entries(sources.interior.templates)){
    if(template.status!=='AUTHORING_CANDIDATE'||template.runtimeReady!==false||
      !same(template.unitEnvelope.allowed,policies.interior.allowedProbeClasses)||
      !same(template.unitEnvelope.forbidden,policies.interior.forbiddenProbeClasses)||
      template.routes.filter(route=>route.kind==='mixed').some(route=>route.width!==6.4)||
      template.routes.filter(route=>route.kind==='infantry').some(route=>route.width!==3.2)||
      !template.objectives.length||!template.extractionNode||!template.portals.length||!template.destructibles.length)
      return fail('TRAVERSAL_INTERIOR_SOURCE_INVALID',{id});
  }
  for(const [id,plan] of Object.entries(sources.orbital.plans)){
    if(plan.status!=='AUTHORING_CANDIDATE'||plan.runtimeReady!==false||plan.activation?.runtime!==false||
      !policies.orbital.allowedEnvelopeRefs.includes(plan.envelope)||!plan.objectives.length||
      !plan.hazards.length||!plan.destructibles.length||!Array.isArray(plan.recovery?.repairOrder))
      return fail('TRAVERSAL_ORBITAL_SOURCE_INVALID',{id});
  }
  const evidence=catalog.evidence;
  if(!exactKeys(evidence,['capturePaths','passedFixtureIds','runtimeActivationAuthorized','sourceHashes','status'])||
    evidence.status!=='NOT_CAPTURED'||evidence.passedFixtureIds.length||evidence.capturePaths.length||
    Object.keys(evidence.sourceHashes).length||evidence.runtimeActivationAuthorized!==false)
    return fail('TRAVERSAL_EVIDENCE_FALSE_GREEN');
  if(!exactKeys(catalog.assetClaims,['collision','generatedGeometry','models','navigation'])||
    Object.values(catalog.assetClaims).some(value=>!Array.isArray(value)||value.length))
    return fail('TRAVERSAL_ASSET_CLAIMED');
  const hashes=Object.fromEntries(Object.entries(sources.authorityTexts).map(([key,value])=>['authority.'+key,digest(value)]));
  for(const [domain,collection] of [['surface',sources.surface.plans],['interior',sources.interior.templates],['orbital',sources.orbital.plans]])
    for(const [id,value] of Object.entries(collection)) hashes[`traversal.${domain}.${id}`]=digest(value);
  if(new Set(Object.values(hashes)).size!==Object.keys(hashes).length) return fail('TRAVERSAL_SOURCE_HASH_COLLISION');
  return {ok:true,summary:{fixtureCount:26,surface:16,interior:4,orbital:6,executed:0,runtimeReady:false},hashes};
}

let fatal=null,base=null;
try{
  const text=Object.fromEntries(Object.entries(REL).map(([key,rel])=>[key,fs.readFileSync(path.join(ROOT,rel),'utf8')]));
  const catalog=JSON.parse(text.fixtures);
  const sources={surface:catalogFrom(text.surface,'BattlefieldTopologyV2'),
    interior:catalogFrom(text.interior,'Stage10InteriorTopologyV1'),orbital:catalogFrom(text.orbital,'Stage10OrbitalTopologyV1'),
    theatre:catalogFrom(text.theatre,'Stage10TheatreCatalogV1'),
    surfaceBindings:JSON.parse(text.surfaceBindings),interiorBindings:JSON.parse(text.interiorBindings),
    orbitalBindings:JSON.parse(text.orbitalBindings),manifest:text.manifest,boot:text.boot,
    authorityTexts:{surface:text.surface,interior:text.interior,orbital:text.orbital,theatre:text.theatre,
      surfaceBindings:text.surfaceBindings,interiorBindings:text.interiorBindings,orbitalBindings:text.orbitalBindings}};
  base=validate(catalog,sources);
  record('catalog.exact-source-coverage',base.ok===true,{error:base?.error||null,summary:base?.summary||null});
  for(const verifier of TOPOLOGY_VERIFIERS){
    const run=spawnSync(process.execPath,[verifier],{cwd:ROOT,encoding:'utf8',windowsHide:true});
    record('source-gate.'+path.basename(verifier,'.mjs'),run.status===0,{exitCode:run.status,stderr:(run.stderr||'').trim()});
  }
  record('coverage.16-surface-4-interior-6-orbital',base?.ok&&base.summary.fixtureCount===26);
  record('execution.pending-zero-false-green',base?.ok&&base.summary.executed===0&&base.summary.runtimeReady===false);
  const faults=[
    ['unknown-field',value=>{value.unproven='x';},'TRAVERSAL_UNKNOWN_FIELD'],
    ['runtime',value=>{value.runtimeReady=true;},'TRAVERSAL_RUNTIME_ENABLED'],
    ['model-string',value=>{value.purpose='fake.glb';},'TRAVERSAL_MODEL_LIKE_STRING'],
    ['authority',value=>{value.authorities.surface='wrong.js';},'TRAVERSAL_AUTHORITIES_INVALID'],
    ['hash-policy',value=>{value.sourceHashPolicy.staleHashPassAllowed=true;},'TRAVERSAL_HASH_POLICY_INVALID'],
    ['capture-seed',value=>{value.captureProtocol.seed++;},'TRAVERSAL_CAPTURE_PROTOCOL_INVALID'],
    ['capture-preset',value=>{value.captureProtocol.graphicsPreset='invented';},'TRAVERSAL_CAPTURE_PROTOCOL_INVALID'],
    ['policy-assertion',value=>{value.domainPolicies.surface.requiredAssertions.pop();},'TRAVERSAL_DOMAIN_POLICY_INVALID'],
    ['policy-unknown',value=>{value.domainPolicies.orbital.unproven=true;},'TRAVERSAL_DOMAIN_POLICY_INVALID'],
    ['fixture-missing',value=>{value.fixtures.pop();},'TRAVERSAL_FIXTURE_COVERAGE_INVALID'],
    ['fixture-runtime',value=>{value.fixtures[0].runtimeReady=true;},'TRAVERSAL_FIXTURE_COVERAGE_INVALID'],
    ['fixture-unknown',value=>{value.fixtures[0].modelPath='fake';},'TRAVERSAL_FIXTURE_COVERAGE_INVALID'],
    ['support-drone-loss',value=>{value.domainPolicies.interior.allowedProbeClasses.splice(1,1);},'TRAVERSAL_DOMAIN_POLICY_INVALID'],
    ['portal-state-loss',value=>{value.domainPolicies.interior.portalStates.pop();},'TRAVERSAL_DOMAIN_POLICY_INVALID'],
    ['recovery-state-loss',value=>{value.domainPolicies.orbital.recoveryStates.pop();},'TRAVERSAL_DOMAIN_POLICY_INVALID'],
    ['evidence-pass',value=>{value.evidence.status='PASS';value.evidence.passedFixtureIds.push(value.fixtures[0].fixtureId);},'TRAVERSAL_EVIDENCE_FALSE_GREEN'],
    ['asset-claim',value=>{value.assetClaims.models.push('unproven');},'TRAVERSAL_ASSET_CLAIMED']
  ];
  for(const [id,mutate,expected] of faults){const candidate=clone(catalog);mutate(candidate);const result=validate(candidate,sources);
    record('fault.'+id,result.ok===false&&result.error?.code===expected,{expected,actual:result.error?.code});}
  const sourceFaults=[
    ['surface-approach',value=>{value.surface.plans.aelos_north_medium.sites[0].approaches=['primary_sw'];},'TRAVERSAL_SURFACE_APPROACH_INVALID'],
    ['interior-envelope',value=>{value.interior.templates.interior_xs_breach_40x40.unitEnvelope.allowed.pop();},'TRAVERSAL_INTERIOR_SOURCE_INVALID'],
    ['orbital-objective',value=>{value.orbital.plans.aelos_embassy_spindle.objectives=[];},'TRAVERSAL_ORBITAL_SOURCE_INVALID'],
    ['surface-binding',value=>{value.surfaceBindings.bindings[0].mapId='invented';},'TRAVERSAL_BINDING_AUTHORITY_INVALID'],
    ['theatre-seed',value=>{value.theatre.orbitalLocationSeeds.pop();},'TRAVERSAL_THEATRE_AUTHORITY_INVALID']
  ];
  for(const [id,mutate,expected] of sourceFaults){const candidate=clone(sources);mutate(candidate);const result=validate(catalog,candidate);
    record('fault.source.'+id,result.ok===false&&result.error?.code===expected,{expected,actual:result.error?.code});}
}catch(error){fatal=error?.stack||String(error);record('tool.fatal',false,{error:fatal});}

const failed=checks.filter(row=>row.status!=='PASS');
const report={schema:'MassfrontStage10TraversalFixtureVerificationV1',generatedAt:new Date().toISOString(),
  status:failed.length?'FAIL':'PASS',summary:base?.summary||null,sourceHashes:base?.hashes||{},checks};
const out=path.join(ROOT,'tmp','stage10-traversal-fixtures','report.json');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(`Stage 10 traversal fixtures: ${failed.length?'FAIL':'PASS'} ${checks.length-failed.length}/${checks.length}`);
console.log(`Report ${path.relative(ROOT,out)}`);
for(const row of failed) console.error(`FAIL ${row.id}: ${JSON.stringify(row)}`);
if(fatal) console.error(fatal);
if(failed.length) process.exitCode=1;
