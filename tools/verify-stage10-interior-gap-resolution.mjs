#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  contract:'source-media/content-library/stage10-interior-gap-resolution.v1.json',
  packs:'source-media/content-library/interior-tactical-model-packs.v1.json',
  bindings:'source-media/content-library/stage10-interior-layout-bindings.v1.json',
  theatre:'assets/data/theatreprofiles-stage10.js',
  showcase:'modules/space_exploration/src/systems/showcase_systems.js',
  nexus:'modules/space_exploration/src/domain/catalog.js',
  manifest:'assets/data/manifest.json',
  boot:'boot.js'
};
const SOURCE_REFS=[
  ['pack-catalog',REL.packs,'PACK_DECLARATION_AUTHORITY'],
  ['binding-catalog',REL.bindings,'BINDING_BLOCKER_AUTHORITY'],
  ['theatre-catalog',REL.theatre,'STAGE10_TYPED_SCOPE_AUTHORITY'],
  ['showcase-authority',REL.showcase,'EXACT_EXPLORATION_SYSTEM_AND_PLANET_AUTHORITY'],
  ['nexus-district-authority',REL.nexus,'EXACT_SHIP_DISTRICT_AUTHORITY']
];
const PACK_IDS=[
  'interior_uga_nexus_vii_strike_logistics_v1',
  'interior_nova_aelos_caldris_customs_v1',
  'interior_dominion_pyraeth_mech_foundry_v1',
  'interior_syndicate_nordhall_reactor_vault_v1',
  'interior_neutral_veyra_orison_derelict_v1',
  'interior_brood_karak_meridian_breach_v1'
];
const TEMPLATE_IDS=[
  'interior_xs_breach_40x40',
  'interior_xs_linear_48x32',
  'interior_small_loop_64x64',
  'interior_small_multilevel_80x64'
];
const NEXUS_PACK=PACK_IDS[0];
const NEXUS_LOCATIONS=[
  ['ship_strike_expedition_bay','hangar'],
  ['ship_logistics_cargo','logistics'],
  ['ship_mission_operations','mission_ops']
];
const MIXED_DECLARATIONS=[
  [PACK_IDS[1],'aelos','BOUND_AS_SURFACE_HOMEWORLD_NOT_EXPLORATION_PLANET'],
  [PACK_IDS[4],'veyra','UNBOUND_PENDING_CANONICAL_MAPPING'],
  [PACK_IDS[5],'karak','UNBOUND_PENDING_CANONICAL_MAPPING']
];

const SHAPE={
  schemaVersion:'number',catalogId:'string',status:'string',sourceOnly:'boolean',runtimeReady:'boolean',
  sourceRefs:[{sourceId:'string',path:'string',sha256:'string',role:'string'}],
  policy:{
    failClosed:'boolean',aliasInferenceAllowed:'boolean',humanApprovalRequiredForProposals:'boolean',
    humanApprovalAloneActivatesMapping:'boolean',canonicalSourceUpdateRequired:'boolean',
    explorationPlanetPromotionAllowed:'boolean',sourceGapFallbackAllowed:'boolean',criticalFallbackAllowed:'boolean',
    synthesizedCriticalAllowed:'boolean',generatedMediaReferencesAllowed:'boolean'
  },
  coverage:{
    packCount:'number',nexusParentDeclarationCount:'number',nexusLocationProposalCount:'number',
    mixedNamespaceDeclarationCount:'number',sourceDeclarationGapCount:'number',
    criticalVariantRequestCount:'number',affectedBindingCount:'number'
  },
  nexusLocationProposals:{
    sourcePackId:'string',declaredParentId:'string',parentResolutionStatus:'string',districtAuthority:'string',
    requiredDistrictIds:['string'],mappings:[{
      sourceLocationId:'string',sourceResolutionStatus:'string',proposedDistrictId:'string',proposalStatus:'string',
      humanApprovalRequired:'boolean',humanApprovalStatus:'string',humanApprovalRecordId:'string|null',
      aliasActive:'boolean',runtimeBindingAllowed:'boolean',sourceCatalogUpdateRequired:'boolean'
    }]
  },
  typedPlanetDeclarations:[{
    packId:'string',sourceField:'string',declaredId:'string',typedNamespaceMatches:['string'],
    exactExplorationPlanetMatch:'boolean',bindingDeclarationStatus:'string',resolutionStatus:'string',
    promotedExplorationPlanetId:'string|null',explorationPlanetPromotionAllowed:'boolean',runtimeBindingAllowed:'boolean'
  }],
  sourceDeclarationGaps:[{
    gapId:'string',packId:'string',templateId:'string',bindingId:'string',bindingSourceDeclaration:'string',
    bindingStatus:'string',resolutionStatus:'string',sourceAuthoringRequired:'boolean',fallbackAllowed:'boolean',
    synthesisAllowed:'boolean',runtimeBindingAllowed:'boolean'
  }],
  criticalVariantRequests:[{
    requestId:'string',packId:'string',affectedBindingCount:'number',sourceArchetypeStates:['string'],
    requiredState:'string',sourceVariantId:'string|null',bindingCriticalStatus:'string',resolutionStatus:'string',
    sourceAuthoringRequired:'boolean',fallbackAllowed:'boolean',synthesizedVariantAllowed:'boolean',runtimeBindingAllowed:'boolean'
  }],
  acceptance:{
    overallStatus:'string',blockingConditionsRemain:'boolean',humanApprovalRequired:'boolean',
    sourceCatalogUpdatesRequired:'boolean',authoredCriticalVariantsRequired:'boolean',activationAllowed:'boolean'
  },
  runtimeRegistration:{manifest:'boolean',boot:'boolean',loader:'boolean',runtimeActivationAllowed:'boolean'}
};

const clone=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const reject=(code,details)=>({ok:false,status:'REJECTED',error:{code,details:details||{}}});
const sha256=buffer=>'sha256-'+crypto.createHash('sha256').update(buffer).digest('hex');

function shapeError(value,shape,at='$'){
  if(typeof shape==='string'){
    const allowed=shape.split('|');
    const kind=value===null?'null':Array.isArray(value)?'array':typeof value;
    return allowed.includes(kind)?null:{at,expected:shape,actual:kind};
  }
  if(Array.isArray(shape)){
    if(!Array.isArray(value)) return {at,expected:'array',actual:value===null?'null':typeof value};
    for(let i=0;i<value.length;i++){
      const fault=shapeError(value[i],shape[0],`${at}[${i}]`);
      if(fault) return fault;
    }
    return null;
  }
  if(!value||typeof value!=='object'||Array.isArray(value)) return {at,expected:'object',actual:value===null?'null':typeof value};
  const actual=Object.keys(value).sort(),expected=Object.keys(shape).sort();
  if(!same(actual,expected)) return {at,expectedFields:expected,actualFields:actual};
  for(const key of expected){
    const fault=shapeError(value[key],shape[key],`${at}.${key}`);
    if(fault) return fault;
  }
  return null;
}

function forbiddenMediaString(value,at='$'){
  if(typeof value==='string'){
    if(/(?:^|[\\/])models?(?:[\\/]|$)|\.(?:glb|gltf|fbx|obj|blend|blend1|png|jpe?g|webp|ktx2)(?:$|[?#])/i.test(value)) return {at,value};
    return null;
  }
  if(Array.isArray(value)){
    for(let i=0;i<value.length;i++){
      const fault=forbiddenMediaString(value[i],`${at}[${i}]`);
      if(fault) return fault;
    }
    return null;
  }
  if(value&&typeof value==='object') for(const [key,item] of Object.entries(value)){
    const fault=forbiddenMediaString(item,`${at}.${key}`);
    if(fault) return fault;
  }
  return null;
}

function readJson(rel){
  return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
}

async function loadSources(){
  const theatreContext=vm.createContext(Object.create(null));
  vm.runInContext(fs.readFileSync(path.join(ROOT,REL.theatre),'utf8'),theatreContext,{filename:REL.theatre});
  const theatre=JSON.parse(vm.runInContext('JSON.stringify(Stage10TheatreCatalogV1)',theatreContext));
  const showcaseModule=await import(pathToFileURL(path.join(ROOT,REL.showcase)).href+'?stage10-gap='+Date.now());
  const nexusModule=await import(pathToFileURL(path.join(ROOT,REL.nexus)).href+'?stage10-gap='+Date.now());
  return {
    packs:readJson(REL.packs),
    bindings:readJson(REL.bindings),
    theatre,
    showcase:JSON.parse(JSON.stringify(showcaseModule.SHOWCASE_SYSTEMS)),
    nexus:{
      shipDistrictIds:[...nexusModule.SHIP_DISTRICT_IDS],
      districtCatalogIds:Object.keys(nexusModule.DISTRICT_CATALOG),
      domainSystemIds:Object.keys(nexusModule.SYSTEM_CATALOG)
    },
    manifest:fs.readFileSync(path.join(ROOT,REL.manifest),'utf8'),
    boot:fs.readFileSync(path.join(ROOT,REL.boot),'utf8')
  };
}

function sourceHashes(){
  return Object.fromEntries(SOURCE_REFS.map(([sourceId,rel])=>[sourceId,sha256(fs.readFileSync(path.join(ROOT,rel)))]));
}

function expectedNexus(source){
  const pack=source.packs.packs.find(item=>item.packId===NEXUS_PACK);
  const inventory=source.bindings.packInventories.find(item=>item.packId===NEXUS_PACK);
  if(!pack||!inventory) return null;
  const declarations=inventory.authorityResolution?.locationDeclarations||[];
  return {
    sourcePackId:NEXUS_PACK,
    declaredParentId:'nexus_vii',
    parentResolutionStatus:inventory.authorityResolution?.planetDeclarations?.[0]?.status,
    districtAuthority:'SHIP_DISTRICT_IDS',
    requiredDistrictIds:NEXUS_LOCATIONS.map(([,districtId])=>districtId),
    mappings:NEXUS_LOCATIONS.map(([sourceLocationId,proposedDistrictId])=>({
      sourceLocationId,
      sourceResolutionStatus:declarations.find(item=>item.sourceId===sourceLocationId)?.status,
      proposedDistrictId,
      proposalStatus:'PROPOSED_NOT_CANON',
      humanApprovalRequired:true,
      humanApprovalStatus:'PENDING',
      humanApprovalRecordId:null,
      aliasActive:false,
      runtimeBindingAllowed:false,
      sourceCatalogUpdateRequired:true
    }))
  };
}

function expectedTypedDeclarations(source,showcasePlanetIds){
  const surfaceIds=source.theatre.sourceInventories.surfaceHomeworlds.ids;
  const showcaseSystemIds=Object.keys(source.showcase);
  return MIXED_DECLARATIONS.map(([packId,declaredId,resolutionStatus])=>{
    const inventory=source.bindings.packInventories.find(item=>item.packId===packId);
    const declaration=inventory?.authorityResolution?.planetDeclarations?.find(item=>item.sourceId===declaredId);
    const typedNamespaceMatches=[];
    if(surfaceIds.includes(declaredId)) typedNamespaceMatches.push('SURFACE_HOMEWORLD');
    if(showcaseSystemIds.includes(declaredId)) typedNamespaceMatches.push('SHOWCASE_SYSTEM');
    if(source.nexus.domainSystemIds.includes(declaredId)) typedNamespaceMatches.push('DOMAIN_SYSTEM');
    return {
      packId,sourceField:'planetIds[0]',declaredId,typedNamespaceMatches,
      exactExplorationPlanetMatch:showcasePlanetIds.includes(declaredId),
      bindingDeclarationStatus:declaration?.status,
      resolutionStatus,promotedExplorationPlanetId:null,explorationPlanetPromotionAllowed:false,runtimeBindingAllowed:false
    };
  });
}

function expectedSourceGaps(source){
  const result=[];
  for(const pack of source.packs.packs) for(const templateId of TEMPLATE_IDS) if(!pack.mapTemplateIds.includes(templateId)){
    const binding=source.bindings.bindings.find(item=>item.packId===pack.packId&&item.templateId===templateId);
    const isNova=pack.packId===PACK_IDS[1]&&templateId==='interior_small_multilevel_80x64';
    const isDominion=pack.packId===PACK_IDS[2]&&templateId==='interior_xs_breach_40x40';
    result.push({
      gapId:isNova?'nova-multilevel-source-declaration':isDominion?'dominion-breach-source-declaration':'UNEXPECTED_SOURCE_GAP',
      packId:pack.packId,templateId,bindingId:binding?.bindingId,
      bindingSourceDeclaration:binding?.sourceTemplateDeclaration,bindingStatus:binding?.status,
      resolutionStatus:'SOURCE_DECLARATION_REQUIRED',sourceAuthoringRequired:true,fallbackAllowed:false,
      synthesisAllowed:false,runtimeBindingAllowed:false
    });
  }
  return result;
}

function expectedCriticalRequests(source){
  return PACK_IDS.map(packId=>{
    const bindings=source.bindings.bindings.filter(item=>item.packId===packId);
    const states=[...new Set(bindings.flatMap(item=>item.destruction?.sourceArchetypeStates||[]))];
    return {
      requestId:`critical-authoring__${packId}`,packId,affectedBindingCount:bindings.length,sourceArchetypeStates:states,
      requiredState:'critical',sourceVariantId:null,bindingCriticalStatus:'BLOCKED_MISSING_AUTHORED_VARIANT',
      resolutionStatus:'SOURCE_AUTHORING_REQUIRED',sourceAuthoringRequired:true,fallbackAllowed:false,
      synthesizedVariantAllowed:false,runtimeBindingAllowed:false
    };
  });
}

function preflight(candidate,source,hashes){
  const schemaFault=shapeError(candidate,SHAPE);
  if(schemaFault) return reject('GAP_SCHEMA_UNKNOWN_OR_INVALID_FIELD',schemaFault);
  const mediaFault=forbiddenMediaString(candidate);
  if(mediaFault) return reject('GAP_FORBIDDEN_MODEL_STRING',mediaFault);
  if(candidate.schemaVersion!==1||candidate.catalogId!=='massfront-stage10-interior-gap-resolution-v1'||
    candidate.status!=='RESOLUTION_CONTRACT_ONLY'||candidate.sourceOnly!==true)
    return reject('GAP_CONTRACT_IDENTITY_INVALID');
  if(candidate.runtimeReady!==false||candidate.runtimeRegistration.manifest!==false||candidate.runtimeRegistration.boot!==false||
    candidate.runtimeRegistration.loader!==false||candidate.runtimeRegistration.runtimeActivationAllowed!==false||
    candidate.acceptance.activationAllowed!==false)
    return reject('GAP_RUNTIME_ENABLED');
  if(source.manifest.includes('stage10-interior-gap-resolution')||source.boot.includes('stage10-interior-gap-resolution'))
    return reject('GAP_RUNTIME_REGISTRATION_DRIFT');
  const expectedPolicy={
    failClosed:true,aliasInferenceAllowed:false,humanApprovalRequiredForProposals:true,
    humanApprovalAloneActivatesMapping:false,canonicalSourceUpdateRequired:true,
    explorationPlanetPromotionAllowed:false,sourceGapFallbackAllowed:false,criticalFallbackAllowed:false,
    synthesizedCriticalAllowed:false,generatedMediaReferencesAllowed:false
  };
  if(!same(candidate.policy,expectedPolicy)) return reject('GAP_POLICY_INVALID');
  if(candidate.sourceRefs.length!==SOURCE_REFS.length) return reject('GAP_SOURCE_REFERENCE_INVALID');
  for(let i=0;i<SOURCE_REFS.length;i++){
    const [sourceId,sourcePath,role]=SOURCE_REFS[i],ref=candidate.sourceRefs[i];
    if(ref.sourceId!==sourceId||ref.path!==sourcePath||ref.role!==role) return reject('GAP_SOURCE_REFERENCE_INVALID',{sourceId});
    if(ref.sha256!==hashes[sourceId]) return reject('GAP_SOURCE_HASH_DRIFT',{sourceId,expected:ref.sha256,actual:hashes[sourceId]});
  }

  const packIds=source.packs.packs.map(item=>item.packId);
  const inventoryIds=source.bindings.packInventories.map(item=>item.packId);
  const theatrePackIds=source.theatre.interiorLocationPacks.map(item=>item.id);
  if(!same(packIds,PACK_IDS)||!same(inventoryIds,PACK_IDS)||!same(theatrePackIds,PACK_IDS))
    return reject('GAP_PACK_SOURCE_DRIFT',{packIds,inventoryIds,theatrePackIds});
  for(const pack of source.packs.packs){
    const inventory=source.bindings.packInventories.find(item=>item.packId===pack.packId);
    const theatrePack=source.theatre.interiorLocationPacks.find(item=>item.id===pack.packId);
    if(!inventory||!theatrePack||!same(pack.planetIds,inventory.planetIds)||!same(pack.locationIds,inventory.locationIds)||
      !same(pack.mapTemplateIds,inventory.sourceTemplateIds)||pack.members.length!==15||inventory.memberCount!==15||theatrePack.memberCount!==15)
      return reject('GAP_PACK_BINDING_SOURCE_DRIFT',{packId:pack.packId});
  }
  const expectedMatrix=PACK_IDS.flatMap(packId=>TEMPLATE_IDS.map(templateId=>`${packId}\0${templateId}`)).sort();
  const bindingMatrix=source.bindings.bindings.map(item=>`${item.packId}\0${item.templateId}`).sort();
  if(source.bindings.bindings.length!==expectedMatrix.length||new Set(bindingMatrix).size!==expectedMatrix.length||
    !same(bindingMatrix,expectedMatrix)||source.bindings.bindings.some(item=>
      item.bindingId!==`layout-binding__${item.packId}__${item.templateId}`))
    return reject('GAP_BINDING_MATRIX_INVALID',{expected:expectedMatrix,actual:bindingMatrix});
  const showcasePlanetIds=[];
  for(const system of Object.values(source.showcase)) for(const planet of system.planets) showcasePlanetIds.push(planet.id);
  if(source.theatre.planetAuthority!=='EXPLORATION_MODULE_SHOWCASE_SYSTEMS'||
    !same(showcasePlanetIds,source.theatre.sourceInventories.authoredExplorationPlanets.ids))
    return reject('GAP_SHOWCASE_AUTHORITY_DRIFT');

  const nexusExpected=expectedNexus(source),nexusPack=source.packs.packs.find(item=>item.packId===NEXUS_PACK);
  if(!nexusExpected||!same(nexusPack.planetIds,['nexus_vii'])||!same(nexusPack.locationIds,NEXUS_LOCATIONS.map(([id])=>id))||
    !source.nexus.shipDistrictIds.every(id=>source.nexus.districtCatalogIds.includes(id))||
    !NEXUS_LOCATIONS.every(([,id])=>source.nexus.shipDistrictIds.includes(id)))
    return reject('GAP_NEXUS_SOURCE_DRIFT');
  if(candidate.nexusLocationProposals.mappings.some(item=>item.proposalStatus!=='PROPOSED_NOT_CANON'||
    item.humanApprovalRequired!==true||item.humanApprovalStatus!=='PENDING'||item.humanApprovalRecordId!==null||
    item.aliasActive!==false||item.runtimeBindingAllowed!==false||item.sourceCatalogUpdateRequired!==true))
    return reject('GAP_NEXUS_PROPOSAL_POLICY_INVALID');
  if(!same(candidate.nexusLocationProposals,nexusExpected)) return reject('GAP_NEXUS_PROPOSAL_SOURCE_DRIFT');

  if(candidate.typedPlanetDeclarations.some(item=>item.exactExplorationPlanetMatch!==false||
    item.promotedExplorationPlanetId!==null||item.explorationPlanetPromotionAllowed!==false||item.runtimeBindingAllowed!==false))
    return reject('GAP_NAMESPACE_PROMOTION_FORBIDDEN');
  const typedExpected=expectedTypedDeclarations(source,showcasePlanetIds);
  if(typedExpected.some(item=>item.typedNamespaceMatches.length<2)||!same(candidate.typedPlanetDeclarations,typedExpected))
    return reject('GAP_TYPED_NAMESPACE_SOURCE_DRIFT',{expected:typedExpected});

  if(candidate.sourceDeclarationGaps.some(item=>item.bindingSourceDeclaration!=='MISSING_FROM_PACK_SOURCE'||
    item.bindingStatus!=='BLOCKED_SOURCE_DECLARATION'||item.resolutionStatus!=='SOURCE_DECLARATION_REQUIRED'||
    item.sourceAuthoringRequired!==true||item.fallbackAllowed!==false||item.synthesisAllowed!==false||item.runtimeBindingAllowed!==false))
    return reject('GAP_SOURCE_DECLARATION_POLICY_INVALID');
  const gapExpected=expectedSourceGaps(source);
  if(!same(candidate.sourceDeclarationGaps,gapExpected)) return reject('GAP_SOURCE_DECLARATION_DRIFT',{expected:gapExpected});

  if(candidate.criticalVariantRequests.some(item=>item.requiredState!=='critical'||item.sourceVariantId!==null||
    item.bindingCriticalStatus!=='BLOCKED_MISSING_AUTHORED_VARIANT'||item.resolutionStatus!=='SOURCE_AUTHORING_REQUIRED'||
    item.sourceAuthoringRequired!==true||item.fallbackAllowed!==false||item.synthesizedVariantAllowed!==false||
    item.runtimeBindingAllowed!==false))
    return reject('GAP_CRITICAL_VARIANT_POLICY_INVALID');
  if(Object.values(source.packs.assetArchetypes).some(archetype=>(archetype.damageStates||[]).includes('critical'))||
    source.bindings.bindings.some(item=>item.destruction?.criticalStateBinding?.sourceState!==null||
      item.destruction?.criticalStateBinding?.status!=='BLOCKED_MISSING_AUTHORED_VARIANT'||
      item.destruction?.criticalStateBinding?.runtimeFallbackAllowed!==false))
    return reject('GAP_CRITICAL_SOURCE_DRIFT');
  const criticalExpected=expectedCriticalRequests(source);
  if(!same(candidate.criticalVariantRequests,criticalExpected)) return reject('GAP_CRITICAL_REQUEST_SOURCE_DRIFT',{expected:criticalExpected});

  const expectedCoverage={
    packCount:6,nexusParentDeclarationCount:1,nexusLocationProposalCount:3,mixedNamespaceDeclarationCount:3,
    sourceDeclarationGapCount:2,criticalVariantRequestCount:6,affectedBindingCount:24
  };
  const expectedAcceptance={
    overallStatus:'BLOCKED_PENDING_SOURCE_AND_HUMAN_RESOLUTION',blockingConditionsRemain:true,humanApprovalRequired:true,
    sourceCatalogUpdatesRequired:true,authoredCriticalVariantsRequired:true,activationAllowed:false
  };
  if(!same(candidate.coverage,expectedCoverage)||!same(candidate.acceptance,expectedAcceptance)) return reject('GAP_COVERAGE_INVALID');
  return {ok:true,status:candidate.status,summary:{
    packs:PACK_IDS.length,nexusProposals:NEXUS_LOCATIONS.length,typedNonPromotions:MIXED_DECLARATIONS.length,
    sourceDeclarationGaps:gapExpected.length,criticalAuthoringRequests:criticalExpected.length,
    affectedBindings:source.bindings.bindings.length,runtimeReady:false
  }};
}

const contract=readJson(REL.contract);
const sources=await loadSources();
const hashes=sourceHashes();
const baseline=preflight(contract,sources,hashes);
assert.equal(baseline.ok,true,JSON.stringify(baseline));

function runFault(name,mutate,expectedCode){
  const candidate=clone(contract),faultSources=clone(sources),faultHashes=clone(hashes);
  mutate(candidate,faultSources,faultHashes);
  const result=preflight(candidate,faultSources,faultHashes);
  assert.equal(result.ok,false,`${name} unexpectedly passed`);
  assert.equal(result.error.code,expectedCode,`${name} rejected with ${result.error.code}`);
  return {name,rejectedAs:result.error.code};
}

const faults=[
  runFault('alias-approval',candidate=>{ candidate.nexusLocationProposals.mappings[0].humanApprovalStatus='APPROVED'; },'GAP_NEXUS_PROPOSAL_POLICY_INVALID'),
  runFault('namespace-promotion',candidate=>{ candidate.typedPlanetDeclarations[0].promotedExplorationPlanetId='aelos_caldris'; },'GAP_NAMESPACE_PROMOTION_FORBIDDEN'),
  runFault('source-gap-erasure',candidate=>{ candidate.sourceDeclarationGaps[0].resolutionStatus='RESOLVED'; },'GAP_SOURCE_DECLARATION_POLICY_INVALID'),
  runFault('critical-fallback',candidate=>{ candidate.criticalVariantRequests[0].fallbackAllowed=true; },'GAP_CRITICAL_VARIANT_POLICY_INVALID'),
  runFault('runtime-enablement',candidate=>{ candidate.runtimeReady=true; },'GAP_RUNTIME_ENABLED'),
  runFault('runtime-registration',(candidate,faultSources)=>{ faultSources.manifest+=' stage10-interior-gap-resolution '; },'GAP_RUNTIME_REGISTRATION_DRIFT'),
  runFault('unknown-field',candidate=>{ candidate.nexusLocationProposals.mappings[0].invented=true; },'GAP_SCHEMA_UNKNOWN_OR_INVALID_FIELD'),
  runFault('model-string',candidate=>{ candidate.criticalVariantRequests[0].sourceVariantId='models/fabricated-critical.glb'; },'GAP_FORBIDDEN_MODEL_STRING'),
  runFault('pack-source-drift',(candidate,faultSources)=>{
    faultSources.packs.packs.find(item=>item.packId===PACK_IDS[1]).mapTemplateIds.push('interior_small_multilevel_80x64');
  },'GAP_PACK_BINDING_SOURCE_DRIFT'),
  runFault('binding-matrix-duplicate',(candidate,faultSources)=>{
    faultSources.bindings.bindings[23]=clone(faultSources.bindings.bindings[0]);
  },'GAP_BINDING_MATRIX_INVALID'),
  runFault('showcase-source-drift',(candidate,faultSources)=>{ faultSources.showcase.aelos.planets[0].id='aelos_caldris_drift'; },'GAP_SHOWCASE_AUTHORITY_DRIFT')
];

console.log(JSON.stringify({status:'PASS',contract:REL.contract,baseline:baseline.summary,injectedFaults:{passed:faults.length,total:faults.length,results:faults},sourceHashes:hashes},null,2));
