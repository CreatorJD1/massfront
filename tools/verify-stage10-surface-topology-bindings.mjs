#!/usr/bin/env node
/* Cross-source verification for inert Stage 10 Standard surface bindings.
   The binding file records topology requirements, never model availability.
   This gate source-matches the processing manifest, BattlefieldTopologyV2,
   and LocationMapPlanV1, then injects failures at every promotion boundary. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  bindings:'design/stage10-surface-topology-bindings.json',
  processing:'docs/MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_MANIFEST_2026-08-29.json',
  topology:'assets/data/battlefieldtopology-stage10.js',
  location:'assets/data/locationplans.js',
  gl:'src/engine/gl.js',
  manifest:'assets/data/manifest.json',
  boot:'boot.js',
  tool:'tools/verify-stage10-surface-topology-bindings.mjs'
};
const EVIDENCE_GATES=[
  'processing_manifest_match','battlefield_topology_preflight','location_baseline_preservation',
  'site_support_and_placement','collision_navigation','maritime_support_datums',
  'asset_source_admission','deterministic_destruction_recovery',
  'hardware_gpu_visual_performance','packaging_registration','human_visual_approval'
];
const SUPPORT_MODES=['fixed_caisson','floating_pontoon','semi_submersible','shoreline_quay','terrain'];
const REQUIRED_FIELDS=['center','radius','major','approaches','siteClass','domain','supportMode'];
const CATALOG_KEYS=['activation','assetAssertions','authorities','bindings','coverage','placementContract','purpose',
  'registrationAuthorized','requiredEvidenceGates','runtimeReady','schema','sourceOnly','status','version'];
const BINDING_KEYS=['activation','assetBinding','evidence','locationBaseline','mapId','processingManifestRecord',
  'runtimeReady','sourceOnly','status','supportPlacementNeeds','topologyPlan'];
const checks=[];

function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function stable(value){
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function sameList(a,b){
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>value===b[index]);
}
function own(value,key){return !!value&&Object.prototype.hasOwnProperty.call(value,key);}
function exactKeys(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  sameList(Object.keys(value).sort(),[...keys].sort());}
function fail(code,details={}){return {ok:false,status:'REJECTED',error:{code,details}};}
function record(id,ok,details={}){checks.push({id,...details,status:ok?'PASS':'FAIL'});return ok;}
function extractConst(source,name){
  const token='const '+name+'=',start=source.indexOf(token);
  if(start<0) throw new Error('Missing pure catalog declaration: '+name);
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=start+token.length;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(lineComment){if(c==='\n') lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escaped){escaped=false;continue;}
      if(c==='\\'){escaped=true;continue;}
      if(c===quote) quote='';
      continue;
    }
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='('||c==='['||c==='{') depth++;
    else if(c===')'||c===']'||c==='}') depth--;
    else if(c===';'&&depth===0) return source.slice(start,i+1);
  }
  throw new Error('Unterminated pure catalog declaration: '+name);
}
function expectedSiteSupport(plan){
  return plan.sites.map(site=>({id:site.id,class:site.siteClass,domain:site.domain,support:site.supportMode}));
}
function expectedFloating(plan){
  return plan.sites.filter(site=>site.supportMode==='floating_pontoon'||site.supportMode==='semi_submersible').map(site=>({
    siteId:site.id,waterline:site.waterline,draft:site.draft,freeboard:site.freeboard,
    stabilization:site.stabilization,deckNav:site.deckNav,
    proofStatus:'TOPOLOGY_DECLARED_NOT_GEOMETRY_PROVEN'
  }));
}
function baselineRequests(plan){
  if(!plan) return {ids:[],instances:0,summary:[]};
  return {
    ids:plan.requests.map(row=>row.id),
    instances:plan.requests.reduce((sum,row)=>sum+row.count,0),
    summary:plan.requests.map(row=>({id:row.id,count:row.count,siteClass:row.siteClass,
      template:row.template,era:row.era,condition:row.condition}))
  };
}

function validate(catalog,sources){
  if(!catalog||catalog.schema!=='MassfrontStage10SurfaceTopologyBindingsV1'||catalog.version!==1)
    return fail('SURFACE_BINDING_SCHEMA_INVALID');
  if(!exactKeys(catalog,CATALOG_KEYS)||
    !exactKeys(catalog.authorities,['battlefieldTopology','locationPlans','processingManifest'])||
    Object.values(catalog.authorities).some(value=>!exactKeys(value,['path','schema','version']))||
    !exactKeys(catalog.coverage,['bindingCount','fullV1Count','pendingV0Count','processingWave','size'])||
    !exactKeys(catalog.assetAssertions,['generatedAssetPaths','generatedAssetsClaimed','modelExistenceClaimed','modelIds','status'])||
    !exactKeys(catalog.placementContract,['commonProofs','requiredSourceFields','status','supportModeProofs'])||
    !exactKeys(catalog.activation,['manifestRegistrationAuthorized','reason','registrationAuthorized','runtime']))
    return fail('SURFACE_BINDING_UNKNOWN_FIELD');
  if(catalog.status!=='SOURCE_ONLY'||catalog.sourceOnly!==true||catalog.runtimeReady!==false||
    catalog.registrationAuthorized!==false||catalog.activation?.runtime!==false||
    catalog.activation?.registrationAuthorized!==false||catalog.activation?.manifestRegistrationAuthorized!==false)
    return fail('SURFACE_BINDING_RUNTIME_ENABLED');
  const assets=catalog.assetAssertions;
  if(!assets||assets.status!=='NOT_ASSERTED'||assets.modelExistenceClaimed!==false||
    assets.generatedAssetsClaimed!==false||!Array.isArray(assets.modelIds)||assets.modelIds.length||
    !Array.isArray(assets.generatedAssetPaths)||assets.generatedAssetPaths.length)
    return fail('SURFACE_BINDING_ASSET_CLAIMED');
  const authorities=catalog.authorities;
  if(!authorities||authorities.processingManifest?.path!==REL.processing||
    authorities.processingManifest?.schema!=='MassfrontStage10RoleAwareProcessingManifestV2'||
    authorities.processingManifest?.version!==4||authorities.battlefieldTopology?.path!==REL.topology||
    authorities.battlefieldTopology?.schema!=='BattlefieldTopologyV2'||authorities.battlefieldTopology?.version!==2||
    authorities.locationPlans?.path!==REL.location||authorities.locationPlans?.schema!=='LocationMapPlanV1'||
    authorities.locationPlans?.version!==1)
    return fail('SURFACE_BINDING_AUTHORITIES_INVALID');
  if(!sameList(catalog.requiredEvidenceGates,EVIDENCE_GATES))
    return fail('SURFACE_BINDING_EVIDENCE_GATE_SCHEMA_INVALID');
  const placement=catalog.placementContract;
  if(!placement||placement.status!=='TOPOLOGY_REQUIREMENTS_NOT_GEOMETRY_PROOF'||
    !sameList(placement.requiredSourceFields,REQUIRED_FIELDS)||!Array.isArray(placement.commonProofs)||
    placement.commonProofs.length<4||!sameList(Object.keys(placement.supportModeProofs||{}).sort(),SUPPORT_MODES)||
    SUPPORT_MODES.some(mode=>!Array.isArray(placement.supportModeProofs[mode])||!placement.supportModeProofs[mode].length))
    return fail('SURFACE_BINDING_PLACEMENT_CONTRACT_INVALID');

  const manifest=sources.processing,topology=sources.topology,location=sources.location;
  if(manifest.schema!=='MassfrontStage10RoleAwareProcessingManifestV2'||manifest.version!==4||
    manifest.status!=='PREPARATION_ONLY_NO_RUNTIME_OR_ASSET_REGISTRATION'||
    manifest.scope?.processingWaveCounts?.['wave-1-standard']!==16||manifest.scope?.fullV1BaselineMaps!==6)
    return fail('SURFACE_BINDING_PROCESSING_SOURCE_INVALID');
  if(topology.schema!=='BattlefieldTopologyV2'||topology.version!==2||
    location.schema!=='LocationMapPlanV1'||location.version!==1)
    return fail('SURFACE_BINDING_SOURCE_SCHEMA_INVALID');

  const manifestMaps=manifest.maps.filter(row=>row.size==='standard'&&row.processingWave==='wave-1-standard')
    .sort((a,b)=>a.id.localeCompare(b.id));
  const manifestIds=manifestMaps.map(row=>row.id);
  const topologyIds=Object.keys(topology.plans).sort();
  const bindingIds=Array.isArray(catalog.bindings)?catalog.bindings.map(row=>row&&row.mapId):[];
  if(manifestIds.length!==16||!sameList(manifestIds,topologyIds)||!sameList(manifestIds,bindingIds)||
    new Set(bindingIds).size!==bindingIds.length)
    return fail('SURFACE_BINDING_COVERAGE_INVALID',{manifestIds,topologyIds,bindingIds});
  if(catalog.coverage?.processingWave!=='wave-1-standard'||catalog.coverage?.size!=='standard'||
    catalog.coverage?.bindingCount!==16||catalog.coverage?.fullV1Count!==6||catalog.coverage?.pendingV0Count!==10)
    return fail('SURFACE_BINDING_COVERAGE_DECLARATION_INVALID');

  const summaries=[];
  for(let index=0;index<catalog.bindings.length;index++){
    const binding=catalog.bindings[index],id=binding.mapId;
    const manifestMap=manifestMaps[index],plan=topology.plans[id],locationPlan=location.plans[id]||null;
    if(!manifestMap||!plan) return fail('SURFACE_BINDING_SOURCE_MAP_MISSING',{id});
    if(!exactKeys(binding,BINDING_KEYS)||
      !exactKeys(binding.locationBaseline,['declaredInstanceCount','planPresent','requestIds','status'])||
      !exactKeys(binding.supportPlacementNeeds,['floatingDatums','requiredSupportModes','siteSupport','status'])||
      !exactKeys(binding.assetBinding,['generatedAssetPaths','modelIds','status'])||
      !exactKeys(binding.evidence,['passedGateIds','status'])||
      !exactKeys(binding.activation,['registrationAuthorized','runtime']))
      return fail('SURFACE_BINDING_RECORD_UNKNOWN_FIELD',{id});
    if(binding.status!=='SOURCE_ONLY_CANDIDATE'||binding.sourceOnly!==true||binding.runtimeReady!==false||
      binding.activation?.runtime!==false||binding.activation?.registrationAuthorized!==false)
      return fail('SURFACE_BINDING_RECORD_RUNTIME_ENABLED',{id});
    if(plan.status!=='AUTHORING_CANDIDATE'||plan.activation?.runtime!==false)
      return fail('SURFACE_BINDING_SOURCE_TOPOLOGY_RUNTIME_ENABLED',{id});
    const preflight=sources.preflights[id];
    if(!preflight||preflight.ok!==true||preflight.status!=='AUTHORING_CANDIDATE'||
      preflight.summary?.runtimeActive!==false)
      return fail('SURFACE_BINDING_TOPOLOGY_PREFLIGHT_FAILED',{id,error:preflight&&preflight.error});

    const manifestRecord=binding.processingManifestRecord;
    const expectedManifest={
      name:manifestMap.name,planet:manifestMap.planet,faction:manifestMap.faction,region:manifestMap.region,
      size:manifestMap.size,theme:manifestMap.theme,adaptation:manifestMap.adaptation,hazard:manifestMap.hazard,
      poi:manifestMap.poi,waterMode:manifestMap.terrain.waterMode,navalEnabled:manifestMap.terrain.navalEnabled,
      processingWave:manifestMap.processingWave,processingPolicy:manifestMap.processingPolicy,
      candidateSiteClasses:manifestMap.candidateSiteClasses
    };
    if(stable(manifestRecord)!==stable(expectedManifest))
      return fail('SURFACE_BINDING_MANIFEST_RECORD_MISMATCH',{id});
    const topologyRecord=binding.topologyPlan;
    const expectedTopology={planId:id,region:plan.region,size:plan.size,layoutProfile:plan.layoutProfile,
      landmark:plan.landmark,extent:[plan.extent.width,plan.extent.height],waterMode:plan.water.mode};
    if(stable(topologyRecord)!==stable(expectedTopology)||plan.map!==id||plan.region!==manifestMap.region||
      plan.size!==manifestMap.size||plan.water.mode!==manifestMap.terrain.waterMode)
      return fail('SURFACE_BINDING_TOPOLOGY_RECORD_MISMATCH',{id});

    const full=!!locationPlan,expectedStatus=full?'FULL_V1':'PENDING_V0',manifestBaseline=manifestMap.fullV1Baseline;
    const baseline=binding.locationBaseline,requests=baselineRequests(locationPlan);
    if(plan.locationBaseline?.status!==expectedStatus||baseline?.status!==expectedStatus||
      baseline?.planPresent!==full||(full?!manifestBaseline:manifestBaseline!==null)||
      (full&&manifestBaseline.status!=='FULL_V1'))
      return fail('SURFACE_BINDING_BASELINE_MISMATCH',{id,expectedStatus});
    if(!sameList(baseline.requestIds,requests.ids)||baseline.declaredInstanceCount!==requests.instances)
      return fail('SURFACE_BINDING_BASELINE_REQUEST_MISMATCH',{id});
    if(full){
      const manifestRequests=manifestBaseline.requests.map(row=>({id:row.id,count:row.count,siteClass:row.siteClass,
        template:row.template,era:row.era,condition:row.condition}));
      if(manifestBaseline.siteCount!==requests.instances||stable(manifestRequests)!==stable(requests.summary)||
        manifestMap.processingPolicy!=='extend-without-breaking-full-v1-contract')
        return fail('SURFACE_BINDING_BASELINE_SOURCE_DRIFT',{id});
    }else if(manifestMap.processingPolicy!=='author-exact-plan-and-templates'){
      return fail('SURFACE_BINDING_PENDING_POLICY_INVALID',{id});
    }

    const support=binding.supportPlacementNeeds,expectedSites=expectedSiteSupport(plan);
    if(!support||support.status!=='REQUIRED_NOT_PROVEN'||stable(support.siteSupport)!==stable(expectedSites))
      return fail('SURFACE_BINDING_SUPPORT_SITE_MISMATCH',{id});
    const modes=[...new Set(plan.sites.map(site=>site.supportMode))];
    if(!sameList(support.requiredSupportModes,modes)||modes.some(mode=>!SUPPORT_MODES.includes(mode)))
      return fail('SURFACE_BINDING_SUPPORT_MODE_MISMATCH',{id,modes});
    if(stable(support.floatingDatums)!==stable(expectedFloating(plan)))
      return fail('SURFACE_BINDING_FLOATING_DATUM_MISMATCH',{id});
    for(const site of plan.sites){
      if(!Array.isArray(site.center)||site.center.length!==2||site.center.some(value=>!Number.isFinite(value))||
        !Number.isFinite(site.radius)||site.radius<=0||typeof site.major!=='boolean'||
        !Array.isArray(site.approaches)||site.approaches.length<2)
        return fail('SURFACE_BINDING_PLACEMENT_SOURCE_INVALID',{id,site:site.id});
      const maritime=site.supportMode!=='terrain';
      if((maritime&&(!manifestMap.terrain.navalEnabled||site.domain!=='maritime'))||
        (!maritime&&site.domain!=='land'))
        return fail('SURFACE_BINDING_SUPPORT_DOMAIN_INVALID',{id,site:site.id});
    }

    const asset=binding.assetBinding;
    if(!asset||asset.status!=='NOT_ASSERTED'||!Array.isArray(asset.modelIds)||asset.modelIds.length||
      !Array.isArray(asset.generatedAssetPaths)||asset.generatedAssetPaths.length)
      return fail('SURFACE_BINDING_RECORD_ASSET_CLAIMED',{id});
    if(binding.evidence?.status!=='PENDING_ALL_GATES'||!Array.isArray(binding.evidence?.passedGateIds)||
      binding.evidence.passedGateIds.length)
      return fail('SURFACE_BINDING_EVIDENCE_NOT_PENDING',{id});
    summaries.push({id,baseline:expectedStatus,supportModes:modes,siteCount:plan.sites.length,
      topologyHash:preflight.topologyHash,runtimeReady:false,assetsClaimed:false});
  }
  const fullV1=summaries.filter(row=>row.baseline==='FULL_V1');
  const supportCounts=Object.fromEntries(SUPPORT_MODES.map(mode=>[mode,0]));
  for(const plan of Object.values(topology.plans)) for(const site of plan.sites) supportCounts[site.supportMode]++;
  if(fullV1.length!==6||summaries.length-fullV1.length!==10)
    return fail('SURFACE_BINDING_BASELINE_COVERAGE_INVALID');
  if(supportCounts.terrain!==90||supportCounts.fixed_caisson!==1||supportCounts.floating_pontoon!==3||
    supportCounts.semi_submersible!==1||supportCounts.shoreline_quay!==1)
    return fail('SURFACE_BINDING_SUPPORT_COVERAGE_INVALID',{supportCounts});
  return {ok:true,status:catalog.status,bindingHash:digest(stable(catalog)),summary:{
    bindingCount:summaries.length,fullV1Count:fullV1.length,pendingV0Count:summaries.length-fullV1.length,
    supportCounts,runtimeActive:false,assetsClaimed:false,bindings:summaries
  }};
}

let fatal=null;
const sourceText={};
try{
  for(const [name,rel] of Object.entries(REL)) if(name!=='tool')
    sourceText[name]=fs.readFileSync(path.join(ROOT,rel),'utf8');
  const catalog=JSON.parse(sourceText.bindings),processing=JSON.parse(sourceText.processing);
  const catalogSource=['MAPDEFS','PLANETS'].map(name=>extractConst(sourceText.gl,name)).join('\n');
  const sandbox={console,__stage10SurfaceRandomCalls:0};
  sandbox.Math=Object.create(Math);
  sandbox.Math.random=()=>{sandbox.__stage10SurfaceRandomCalls++;return .5;};
  const context=vm.createContext(sandbox);
  vm.runInContext(catalogSource,context,{filename:REL.gl+'#catalog-slices',timeout:10000});
  vm.runInContext(sourceText.location,context,{filename:REL.location,timeout:10000});
  vm.runInContext(sourceText.topology,context,{filename:REL.topology,timeout:10000});
  const readVm=expression=>JSON.parse(vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000}));
  const topology=readVm('BattlefieldTopologyV2'),location=readVm('LocationMapPlanV1');
  const preflights=Object.fromEntries(Object.keys(topology.plans).sort().map(id=>
    [id,readVm('mfPreflightBattlefieldTopologyV2('+JSON.stringify(id)+')')]));
  const sources={processing,topology,location,preflights};
  const base=validate(catalog,sources);
  record('catalog.cross-source-valid',base.ok===true,{error:base.error||null,summary:base.summary||null});
  record('coverage.six-full-ten-pending',base.ok===true&&base.summary.fullV1Count===6&&
    base.summary.pendingV0Count===10,{fullV1:base.summary&&base.summary.fullV1Count,
      pendingV0:base.summary&&base.summary.pendingV0Count});
  record('coverage.support-modes-exact',base.ok===true&&stable(base.summary.supportCounts)===stable({
    fixed_caisson:1,floating_pontoon:3,semi_submersible:1,shoreline_quay:1,terrain:90
  }),{supportCounts:base.summary&&base.summary.supportCounts});
  record('topology.production-preflight-all-sixteen',Object.values(preflights).length===16&&
    Object.values(preflights).every(result=>result.ok===true&&result.status==='AUTHORING_CANDIDATE'&&
      result.summary.runtimeActive===false),{passed:Object.values(preflights).filter(result=>result.ok).length});
  record('activation.unregistered',!sourceText.manifest.includes('stage10-surface-topology-bindings')&&
    !sourceText.boot.includes('stage10-surface-topology-bindings'),{});
  const repeat=validate(clone(catalog),clone(sources));
  record('determinism.semantic-hash-stable',base.ok===true&&repeat.ok===true&&
    base.bindingHash===repeat.bindingHash&&sandbox.__stage10SurfaceRandomCalls===0,
  {first:base.bindingHash,second:repeat.bindingHash,randomCalls:sandbox.__stage10SurfaceRandomCalls});

  const candidateFaults=[
    ['catalog-unknown-field',value=>{value.unprovenModel='unproven.glb';},'SURFACE_BINDING_UNKNOWN_FIELD'],
    ['catalog-source-only',value=>{value.sourceOnly=false;},'SURFACE_BINDING_RUNTIME_ENABLED'],
    ['catalog-runtime',value=>{value.runtimeReady=true;},'SURFACE_BINDING_RUNTIME_ENABLED'],
    ['catalog-registration',value=>{value.registrationAuthorized=true;},'SURFACE_BINDING_RUNTIME_ENABLED'],
    ['catalog-model-id',value=>{value.assetAssertions.modelIds=['unproven_model'];},'SURFACE_BINDING_ASSET_CLAIMED'],
    ['catalog-generated-path',value=>{value.assetAssertions.generatedAssetPaths=['unproven/generated.glb'];},'SURFACE_BINDING_ASSET_CLAIMED'],
    ['evidence-gate',value=>{value.requiredEvidenceGates.pop();},'SURFACE_BINDING_EVIDENCE_GATE_SCHEMA_INVALID'],
    ['placement-proof',value=>{value.placementContract.supportModeProofs.fixed_caisson=[];},'SURFACE_BINDING_PLACEMENT_CONTRACT_INVALID'],
    ['missing-binding',value=>{value.bindings.pop();},'SURFACE_BINDING_COVERAGE_INVALID'],
    ['manifest-record',value=>{value.bindings[0].processingManifestRecord.name='Drifted name';},'SURFACE_BINDING_MANIFEST_RECORD_MISMATCH'],
    ['manifest-site-classes',value=>{value.bindings[0].processingManifestRecord.candidateSiteClasses.pop();},'SURFACE_BINDING_MANIFEST_RECORD_MISMATCH'],
    ['topology-plan',value=>{value.bindings[0].topologyPlan.planId='aelos_coast_medium';},'SURFACE_BINDING_TOPOLOGY_RECORD_MISMATCH'],
    ['topology-extent',value=>{value.bindings[0].topologyPlan.extent[0]=3200;},'SURFACE_BINDING_TOPOLOGY_RECORD_MISMATCH'],
    ['baseline-status',value=>{value.bindings[0].locationBaseline.status='PENDING_V0';},'SURFACE_BINDING_BASELINE_MISMATCH'],
    ['baseline-request',value=>{value.bindings[0].locationBaseline.requestIds.pop();},'SURFACE_BINDING_BASELINE_REQUEST_MISMATCH'],
    ['support-site',value=>{value.bindings[0].supportPlacementNeeds.siteSupport.pop();},'SURFACE_BINDING_SUPPORT_SITE_MISMATCH'],
    ['support-class',value=>{value.bindings[0].supportPlacementNeeds.siteSupport[0].class='base';},'SURFACE_BINDING_SUPPORT_SITE_MISMATCH'],
    ['support-mode-list',value=>{value.bindings[0].supportPlacementNeeds.requiredSupportModes.pop();},'SURFACE_BINDING_SUPPORT_MODE_MISMATCH'],
    ['floating-datum',value=>{value.bindings[1].supportPlacementNeeds.floatingDatums[0].draft=0;},'SURFACE_BINDING_FLOATING_DATUM_MISMATCH'],
    ['fixed-false-floating',value=>{value.bindings[4].supportPlacementNeeds.floatingDatums.push({siteId:'fake'});},'SURFACE_BINDING_FLOATING_DATUM_MISMATCH'],
    ['record-model-id',value=>{value.bindings[0].assetBinding.modelIds.push('unproven_model');},'SURFACE_BINDING_RECORD_ASSET_CLAIMED'],
    ['evidence-pass',value=>{value.bindings[0].evidence.status='PASS';value.bindings[0].evidence.passedGateIds=['source_contact_match'];},'SURFACE_BINDING_EVIDENCE_NOT_PENDING'],
    ['record-runtime',value=>{value.bindings[0].activation.runtime=true;},'SURFACE_BINDING_RECORD_RUNTIME_ENABLED'],
    ['record-unknown-field',value=>{value.bindings[0].unprovenModel='unproven.glb';},'SURFACE_BINDING_RECORD_UNKNOWN_FIELD']
  ];
  for(const [id,mutate,expected] of candidateFaults){
    const candidate=clone(catalog);mutate(candidate);
    const result=validate(candidate,sources);
    record('fault.binding.'+id,result.ok===false&&result.error?.code===expected,
      {expected,actual:result.error&&result.error.code});
  }
  const sourceFaults=[
    ['manifest-name',value=>{value.processing.maps.find(row=>row.id==='aelos_basin_medium').name='Drifted source name';},'SURFACE_BINDING_MANIFEST_RECORD_MISMATCH'],
    ['topology-support',value=>{value.topology.plans.aelos_basin_medium.sites[5].supportMode='terrain';},'SURFACE_BINDING_SUPPORT_SITE_MISMATCH'],
    ['location-baseline',value=>{delete value.location.plans.aelos_basin_medium;},'SURFACE_BINDING_BASELINE_MISMATCH'],
    ['topology-runtime',value=>{value.topology.plans.aelos_basin_medium.activation.runtime=true;},'SURFACE_BINDING_SOURCE_TOPOLOGY_RUNTIME_ENABLED'],
    ['manifest-map-missing',value=>{value.processing.maps=value.processing.maps.filter(row=>row.id!=='aelos_basin_medium');},'SURFACE_BINDING_COVERAGE_INVALID']
  ];
  for(const [id,mutate,expected] of sourceFaults){
    const candidateSources=clone(sources);mutate(candidateSources);
    const result=validate(catalog,candidateSources);
    record('fault.source.'+id,result.ok===false&&result.error?.code===expected,
      {expected,actual:result.error&&result.error.code});
  }
}catch(error){
  fatal=error&&error.stack?error.stack:String(error);
  record('tool.fatal',false,{error:fatal});
}

sourceText.tool=fs.readFileSync(path.join(ROOT,REL.tool),'utf8');
const failed=checks.filter(row=>row.status!=='PASS');
const hashes=Object.fromEntries(Object.entries(REL).map(([name,rel])=>[name,{path:rel,sha256:digest(sourceText[name])}]));
console.log(`Stage 10 surface topology bindings: ${failed.length?'FAIL':'PASS'} ${checks.length-failed.length}/${checks.length}`);
const deterministic=checks.find(row=>row.id==='determinism.semantic-hash-stable');
if(deterministic) console.log(`Binding semantic SHA-256 ${deterministic.first||'unavailable'}`);
console.log('Source SHA-256 '+JSON.stringify(hashes));
for(const row of failed) console.error(`FAIL ${row.id}: ${JSON.stringify(row)}`);
if(fatal) console.error(fatal);
if(failed.length) process.exitCode=1;
