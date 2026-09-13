#!/usr/bin/env node
/* Verifies the source-only Stage 10 orbital geometry/proxy binding contract.
   The catalog may describe required geometry and measurable targets, but this
   gate rejects model-existence claims, passed evidence, or runtime activation.
   Injected faults prove each promotion boundary fails closed. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  bindings:'source-media/content-library/stage10-orbital-layout-bindings.v1.json',
  theatre:'assets/data/theatreprofiles-stage10.js',
  topology:'assets/data/orbitaltopology-stage10.js',
  showcase:'modules/space_exploration/src/systems/showcase_systems.js',
  manifest:'assets/data/manifest.json',
  boot:'boot.js',
  tool:'tools/verify-stage10-orbital-layout-bindings.mjs'
};
const SOURCE_PATH=REL.showcase;
const TOPOLOGY_PATH=REL.topology;
const REQUIRED_GATES=[
  'source_contact_match','topology_plan_preflight','geometry_source_admission',
  'collision_navigation','route_traversal','hazard_objective',
  'destruction_recovery','lod_generation','hardware_gpu_performance',
  'context_loss_recovery','packaging_registration','human_visual_approval'
];
const REQUIRED_MEASUREMENTS=[
  'hardware_gpu_frame_time','draw_calls','triangles','gpu_memory','context_recovery'
];
const PROFILE_IDS=[
  'infantry_boarding_small_v1','infantry_boarding_xs_v1','orbital_smallcraft_small_v1'
];
const MODEL_EXTENSIONS=['glb','gltf','blend','blend1','fbx','obj','dae','stl','ply','usd','usdz'];
const MODEL_LIKE=new RegExp('\\.(?:'+MODEL_EXTENSIONS.join('|')+')(?:$|[^a-z0-9])','i');
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
function fail(code,details={}){return {ok:false,status:'REJECTED',error:{code,details}};}
function record(id,ok,details={}){
  checks.push({id,...details,status:ok?'PASS':'FAIL'});
  return ok;
}
function values(plan,key){return Array.isArray(plan[key])?plan[key].map(row=>row.id):[];}
function expectedProfile(plan){
  if(plan.topologyKind==='route_volumes_3d') return 'orbital_smallcraft_small_v1';
  return plan.size==='XS'?'infantry_boarding_xs_v1':'infantry_boarding_small_v1';
}
function shape(value,pathName,required,optional=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))
    return fail('BINDING_SCHEMA_TYPE_INVALID',{path:pathName,expected:'object'});
  const allowed=new Set([...required,...optional]);
  for(const key of Object.keys(value)) if(!allowed.has(key))
    return fail('BINDING_SCHEMA_UNKNOWN_FIELD',{path:pathName,key});
  for(const key of required) if(!own(value,key))
    return fail('BINDING_SCHEMA_MISSING_FIELD',{path:pathName,key});
  return null;
}
function findModelLike(value,pathName='$'){
  if(typeof value==='string') return MODEL_LIKE.test(value)?{path:pathName,value}:null;
  if(Array.isArray(value)){
    for(let i=0;i<value.length;i++){
      const hit=findModelLike(value[i],pathName+'['+i+']');
      if(hit) return hit;
    }
  }else if(value&&typeof value==='object'){
    for(const [key,row] of Object.entries(value)){
      const hit=findModelLike(row,pathName+'.'+key);
      if(hit) return hit;
    }
  }
  return null;
}
function sourceIdentity(value){
  const identity={systemId:value&&value.systemId,contactKind:value&&value.contactKind,
    interaction:value&&value.interaction};
  if(own(value,'siteId')) identity.siteId=value.siteId;
  if(own(value,'jumpTo')) identity.jumpTo=value.jumpTo;
  return identity;
}
function contactIdentity(contact){
  const identity={systemId:contact&&contact.systemId,contactKind:contact&&contact.kind,
    interaction:contact&&contact.interaction};
  if(own(contact,'siteId')) identity.siteId=contact.siteId;
  if(own(contact,'jumpTo')) identity.jumpTo=contact.jumpTo;
  return identity;
}
function cloneSources(sources){
  return {theatre:clone(sources.theatre),topology:clone(sources.topology),
    contacts:new Map([...sources.contacts].map(([id,contact])=>[id,clone(contact)]))};
}

function strictSchema(catalog){
  let error=shape(catalog,'$',[
    'schema','version','bindingSetId','status','runtimeReady','modelsClaimedToExist','purpose',
    'authorities','sourcePolicy','schemaPolicy','destructionStateMachine','performanceTargetProfiles',
    'requiredEvidenceGates','bindings','activation'
  ]);
  if(error) return error;
  error=shape(catalog.authorities,'$.authorities',['showcaseContacts','theatreSeeds','topologyPlans']);
  if(error) return error;
  error=shape(catalog.authorities.showcaseContacts,'$.authorities.showcaseContacts',['path','export']);
  if(error) return error;
  error=shape(catalog.authorities.theatreSeeds,'$.authorities.theatreSeeds',['path','schema']);
  if(error) return error;
  error=shape(catalog.authorities.topologyPlans,'$.authorities.topologyPlans',['path','schema']);
  if(error) return error;
  error=shape(catalog.sourcePolicy,'$.sourcePolicy',[
    'geometryStatus','proxyStatus','measurementStatus','modelPathsMayBeInferred','directRuntimeUseAuthorized'
  ]);
  if(error) return error;
  error=shape(catalog.schemaPolicy,'$.schemaPolicy',['unknownFields','modelLikeStrings','modelLikeExtensions']);
  if(error) return error;
  error=shape(catalog.destructionStateMachine,'$.destructionStateMachine',
    ['id','states','transitions','failureContract']);
  if(error) return error;
  error=shape(catalog.performanceTargetProfiles,'$.performanceTargetProfiles',PROFILE_IDS);
  if(error) return error;
  for(const id of PROFILE_IDS){
    const profile=catalog.performanceTargetProfiles[id];
    error=shape(profile,'$.performanceTargetProfiles.'+id,[
      'status','requiredLods','maximumActiveDrawCalls','maximumCollisionProxyShapes',
      'maximumNavigationProxyElements','requiredMeasurements'
    ]);
    if(error) return error;
    if(!Array.isArray(profile.requiredLods))
      return fail('BINDING_SCHEMA_TYPE_INVALID',{path:'$.performanceTargetProfiles.'+id+'.requiredLods',expected:'array'});
    for(let i=0;i<profile.requiredLods.length;i++){
      error=shape(profile.requiredLods[i],'$.performanceTargetProfiles.'+id+'.requiredLods['+i+']',
        ['id','maximumTriangles']);
      if(error) return error;
    }
  }
  if(!Array.isArray(catalog.requiredEvidenceGates))
    return fail('BINDING_SCHEMA_TYPE_INVALID',{path:'$.requiredEvidenceGates',expected:'array'});
  for(let i=0;i<catalog.requiredEvidenceGates.length;i++){
    error=shape(catalog.requiredEvidenceGates[i],'$.requiredEvidenceGates['+i+']',['id','requires']);
    if(error) return error;
  }
  if(!Array.isArray(catalog.bindings))
    return fail('BINDING_SCHEMA_TYPE_INVALID',{path:'$.bindings',expected:'array'});
  for(let i=0;i<catalog.bindings.length;i++){
    const binding=catalog.bindings[i],base='$.bindings['+i+']';
    error=shape(binding,base,[
      'bindingId','seedId','topologyPlanId','status','runtimeReady','modelExistsClaimed',
      'geometryStatus','sourceContact','topologyPlan','envelope','sizeBounds','requiredGeometryFamilies',
      'proxyBinding','hazardsObjectives','destructionRecovery','lodPerformance','evidence','activation'
    ]);
    if(error) return error;
    error=shape(binding.sourceContact,base+'.sourceContact',
      ['sourcePath','systemId','contactId','name','kind','interaction'],['siteId','jumpTo']);
    if(error) return error;
    error=shape(binding.topologyPlan,base+'.topologyPlan',
      ['sourcePath','schema','planId','topologyKind','coordinateSpace','sourceIdentity']);
    if(error) return error;
    error=shape(binding.topologyPlan.sourceIdentity,base+'.topologyPlan.sourceIdentity',
      ['systemId','contactKind','interaction'],['siteId','jumpTo']);
    if(error) return error;
    error=shape(binding.envelope,base+'.envelope',['topology','theatre']);
    if(error) return error;
    error=shape(binding.sizeBounds,base+'.sizeBounds',['sizeClass','units','width','height','depth']);
    if(error) return error;
    if(!Array.isArray(binding.requiredGeometryFamilies))
      return fail('BINDING_SCHEMA_TYPE_INVALID',{path:base+'.requiredGeometryFamilies',expected:'array'});
    for(let f=0;f<binding.requiredGeometryFamilies.length;f++){
      error=shape(binding.requiredGeometryFamilies[f],base+'.requiredGeometryFamilies['+f+']',
        ['familyId','role','availability']);
      if(error) return error;
    }
    const proxy=binding.proxyBinding,route=proxy&&proxy.topologyKind==='route_volumes_3d';
    error=shape(proxy,base+'.proxyBinding',route
      ?['status','topologyKind','routeVolumeIds','spawnZoneIds','insertionZoneIds','extractionZoneIds','collision','navigation']
      :['status','topologyKind','deckNodeIds','deckEdgeIds','spawnZoneIds','insertionZoneIds','extractionZoneIds','collision','navigation']);
    if(error) return error;
    error=shape(proxy.collision,base+'.proxyBinding.collision',['status','proxyType','requirements']);
    if(error) return error;
    error=shape(proxy.navigation,base+'.proxyBinding.navigation',['status','proxyType','binds']);
    if(error) return error;
    error=shape(binding.hazardsObjectives,base+'.hazardsObjectives',['status','hazardIds','objectiveIds']);
    if(error) return error;
    error=shape(binding.destructionRecovery,base+'.destructionRecovery',
      ['status','stateMachineId','destructibleIds','mode','repairOrder','checkpoint','onFailure']);
    if(error) return error;
    error=shape(binding.lodPerformance,base+'.lodPerformance',
      ['profileId','status','requiredLodIds','measurements']);
    if(error) return error;
    error=shape(binding.evidence,base+'.evidence',['status','passedGateIds','pendingGateIds']);
    if(error) return error;
    error=shape(binding.activation,base+'.activation',['runtime','registrationAuthorized','reason']);
    if(error) return error;
  }
  error=shape(catalog.activation,'$.activation',
    ['runtime','registrationAuthorized','manifestRegistrationAuthorized','reason']);
  if(error) return error;
  const modelLike=findModelLike(catalog);
  if(modelLike) return fail('BINDING_MODEL_LIKE_STRING',{path:modelLike.path,value:modelLike.value});
  return {ok:true};
}

function validate(catalog,sources){
  const schemaResult=strictSchema(catalog);
  if(!schemaResult.ok) return schemaResult;
  if(!catalog||catalog.schema!=='MassfrontStage10OrbitalLayoutBindingsV1'||catalog.version!==1)
    return fail('BINDING_CATALOG_SCHEMA_INVALID');
  if(catalog.status!=='SOURCE_ONLY_BINDING_CANDIDATE'||catalog.runtimeReady!==false||
    !catalog.activation||catalog.activation.runtime!==false||catalog.activation.registrationAuthorized!==false||
    catalog.activation.manifestRegistrationAuthorized!==false)
    return fail('BINDING_CATALOG_RUNTIME_ENABLED');
  if(catalog.modelsClaimedToExist!==false) return fail('BINDING_MODEL_EXISTENCE_CLAIMED');
  const policy=catalog.sourcePolicy;
  if(!policy||policy.geometryStatus!=='REQUIRED_NOT_AUTHORED_OR_VERIFIED'||
    policy.proxyStatus!=='SOURCE_ONLY_PROXY_SPEC'||policy.measurementStatus!=='UNMEASURED_TARGET'||
    policy.modelPathsMayBeInferred!==false||policy.directRuntimeUseAuthorized!==false)
    return fail('BINDING_SOURCE_POLICY_INVALID');
  if(catalog.schemaPolicy.unknownFields!=='REJECT'||catalog.schemaPolicy.modelLikeStrings!=='REJECT'||
    !sameList(catalog.schemaPolicy.modelLikeExtensions,MODEL_EXTENSIONS))
    return fail('BINDING_SCHEMA_POLICY_INVALID');
  const authorities=catalog.authorities;
  if(!authorities||authorities.showcaseContacts?.path!==REL.showcase||authorities.showcaseContacts?.export!=='SHOWCASE_SYSTEMS'||
    authorities.theatreSeeds?.path!==REL.theatre||authorities.theatreSeeds?.schema!=='Stage10TheatreCatalogV1'||
    authorities.topologyPlans?.path!==REL.topology||authorities.topologyPlans?.schema!=='Stage10OrbitalTopologyV1')
    return fail('BINDING_AUTHORITIES_INVALID');

  const machine=catalog.destructionStateMachine;
  if(!machine||machine.id!==sources.topology.destructionStateMachine.id||
    stable(machine.states)!==stable(sources.topology.destructionStateMachine.states)||
    stable(machine.transitions)!==stable(sources.topology.destructionStateMachine.transitions)||
    machine.failureContract!=='ROLL_BACK_TO_LAST_COMPLETE_STATE')
    return fail('BINDING_DESTRUCTION_STATE_MACHINE_MISMATCH');

  const profileIds=Object.keys(catalog.performanceTargetProfiles||{}).sort();
  if(!sameList(profileIds,PROFILE_IDS)) return fail('BINDING_PERFORMANCE_PROFILE_INVALID',{profileIds});
  for(const id of profileIds){
    const profile=catalog.performanceTargetProfiles[id],lods=profile&&profile.requiredLods;
    if(!profile||profile.status!=='UNMEASURED_TARGET'||!Array.isArray(lods)||lods.length!==3||
      !sameList(lods.map(row=>row.id),['LOD0','LOD1','LOD2'])||
      lods.some(row=>!Number.isInteger(row.maximumTriangles)||row.maximumTriangles<=0||row.maximumTriangles>500000)||
      !(lods[0].maximumTriangles>lods[1].maximumTriangles&&lods[1].maximumTriangles>lods[2].maximumTriangles)||
      !Number.isInteger(profile.maximumActiveDrawCalls)||profile.maximumActiveDrawCalls<=0||profile.maximumActiveDrawCalls>300||
      !Number.isInteger(profile.maximumCollisionProxyShapes)||profile.maximumCollisionProxyShapes<=0||profile.maximumCollisionProxyShapes>300||
      !Number.isInteger(profile.maximumNavigationProxyElements)||profile.maximumNavigationProxyElements<=0||profile.maximumNavigationProxyElements>200||
      !sameList(profile.requiredMeasurements,REQUIRED_MEASUREMENTS))
      return fail('BINDING_PERFORMANCE_PROFILE_INVALID',{profileId:id});
  }

  const gates=catalog.requiredEvidenceGates;
  if(!Array.isArray(gates)||!sameList(gates.map(row=>row&&row.id),REQUIRED_GATES)||
    gates.some(row=>typeof row.requires!=='string'||!row.requires.trim()))
    return fail('BINDING_EVIDENCE_GATE_SCHEMA_INVALID');

  const theatreIds=sources.theatre.orbitalLocationSeeds.map(row=>row.id).sort();
  const topologyIds=Object.keys(sources.topology.plans).sort();
  const bindingIds=Array.isArray(catalog.bindings)?catalog.bindings.map(row=>row&&row.seedId).sort():[];
  if(theatreIds.length!==6||!sameList(theatreIds,topologyIds)||!sameList(theatreIds,bindingIds)||
    new Set(bindingIds).size!==bindingIds.length)
    return fail('BINDING_COVERAGE_INVALID',{theatreIds,topologyIds,bindingIds});

  const summaries=[];
  for(let index=0;index<catalog.bindings.length;index++){
    const binding=catalog.bindings[index],id=binding&&binding.seedId;
    const plan=sources.topology.plans[id];
    const seed=sources.theatre.orbitalLocationSeeds.find(row=>row.id===id);
    const contact=sources.contacts.get(id);
    if(!binding||!plan||!seed||!contact) return fail('BINDING_SOURCE_MISSING',{index,id});
    if(binding.bindingId!==id+'_layout_binding_v1'||binding.topologyPlanId!==id)
      return fail('BINDING_TOPOLOGY_PLAN_MISMATCH',{id});
    if(binding.status!=='SOURCE_ONLY_CANDIDATE'||binding.runtimeReady!==false||
      binding.activation?.runtime!==false||binding.activation?.registrationAuthorized!==false)
      return fail('BINDING_RUNTIME_ENABLED',{id});
    if(binding.modelExistsClaimed!==false) return fail('BINDING_MODEL_EXISTENCE_CLAIMED',{id});
    if(binding.geometryStatus!=='REQUIRED_NOT_AUTHORED_OR_VERIFIED')
      return fail('BINDING_GEOMETRY_CLAIMED',{id});

    const source=binding.sourceContact;
    const expectedContact={sourcePath:SOURCE_PATH,systemId:contact.systemId,contactId:contact.id,
      name:contact.name,kind:contact.kind,interaction:contact.interaction};
    if(own(contact,'siteId')) expectedContact.siteId=contact.siteId;
    if(own(contact,'jumpTo')) expectedContact.jumpTo=contact.jumpTo;
    if(stable(source)!==stable(expectedContact))
      return fail('BINDING_SOURCE_CONTACT_MISMATCH',{id});
    const topology=binding.topologyPlan;
    if(!topology||topology.sourcePath!==TOPOLOGY_PATH||topology.schema!=='Stage10OrbitalTopologyV1'||
      topology.planId!==id||topology.topologyKind!==plan.topologyKind||topology.coordinateSpace!==plan.coordinateSpace)
      return fail('BINDING_TOPOLOGY_PLAN_MISMATCH',{id});
    const expectedIdentity=contactIdentity(contact),actualIdentity=sourceIdentity(plan.source);
    if(stable(actualIdentity)!==stable(expectedIdentity)||stable(topology.sourceIdentity)!==stable(expectedIdentity))
      return fail('BINDING_TOPOLOGY_SOURCE_IDENTITY_MISMATCH',
        {id,expected:expectedIdentity,topologySource:actualIdentity,bindingSource:topology.sourceIdentity});
    if(binding.envelope?.topology!==plan.envelope||binding.envelope?.theatre!==plan.source.theatreEnvelope||
      seed.envelope!==plan.source.theatreEnvelope)
      return fail('BINDING_ENVELOPE_MISMATCH',{id});
    if(binding.sizeBounds?.sizeClass!==plan.size||binding.sizeBounds?.units!=='meters'||
      binding.sizeBounds?.width!==plan.bounds.width||binding.sizeBounds?.height!==plan.bounds.height||
      binding.sizeBounds?.depth!==plan.bounds.depth)
      return fail('BINDING_BOUNDS_MISMATCH',{id});

    const families=binding.requiredGeometryFamilies;
    if(!Array.isArray(families)||families.length<4||new Set(families.map(row=>row&&row.familyId)).size!==families.length||
      families.some(row=>!row||typeof row.familyId!=='string'||!row.familyId||typeof row.role!=='string'||!row.role||
        row.availability!=='REQUIRED_NOT_PROVEN'||own(row,'sourcePath')||own(row,'modelPath')||
        own(row,'assetPath')||own(row,'sha256')))
      return fail('BINDING_GEOMETRY_CLAIMED',{id});

    const proxy=binding.proxyBinding;
    if(!proxy||proxy.status!=='SOURCE_ONLY_PROXY_SPEC'||proxy.topologyKind!==plan.topologyKind)
      return fail('BINDING_PROXY_SCHEMA_INVALID',{id});
    const routeIds=values(plan,'routeVolumes');
    const nodeIds=plan.deckGraph?values(plan.deckGraph,'nodes'):[];
    const edgeIds=plan.deckGraph?values(plan.deckGraph,'edges'):[];
    if(plan.topologyKind==='route_volumes_3d'){
      if(!sameList(proxy.routeVolumeIds,routeIds)||own(proxy,'deckNodeIds')||own(proxy,'deckEdgeIds'))
        return fail('BINDING_ROUTE_PROXY_MISMATCH',{id});
    }else if(!sameList(proxy.deckNodeIds,nodeIds)||!sameList(proxy.deckEdgeIds,edgeIds)||own(proxy,'routeVolumeIds')){
      return fail('BINDING_DECK_PROXY_MISMATCH',{id});
    }
    if(!sameList(proxy.spawnZoneIds,values(plan,'spawnZones'))||
      !sameList(proxy.insertionZoneIds,values(plan,'insertionZones'))||
      !sameList(proxy.extractionZoneIds,values(plan,'extractionZones')))
      return fail('BINDING_DEPLOYMENT_PROXY_MISMATCH',{id});
    const collision=proxy.collision,expectedCollision=plan.topologyKind==='route_volumes_3d'
      ?'closed_obstacle_shells_and_exclusion_volumes':'deck_walkable_shells_and_bulkhead_blockers';
    if(!collision||collision.status!=='PENDING_AUTHORING_AND_VERIFICATION'||collision.proxyType!==expectedCollision||
      !Array.isArray(collision.requirements)||collision.requirements.length<3||
      collision.requirements.some(row=>typeof row!=='string'||!row))
      return fail('BINDING_COLLISION_PROXY_INVALID',{id});
    const navigation=proxy.navigation,expectedNavigation=plan.topologyKind==='route_volumes_3d'
      ?'zero_g_route_volume_graph':'boarding_deck_graph';
    if(!navigation||navigation.status!=='PENDING_AUTHORING_AND_VERIFICATION'||
      navigation.proxyType!==expectedNavigation||!sameList(navigation.binds,routeIds.length?routeIds:nodeIds))
      return fail('BINDING_NAVIGATION_PROXY_INVALID',{id});

    const encounter=binding.hazardsObjectives;
    if(!encounter||encounter.status!=='PENDING_AUTHORING_AND_VERIFICATION'||
      !sameList(encounter.hazardIds,values(plan,'hazards'))||
      !sameList(encounter.objectiveIds,values(plan,'objectives')))
      return fail('BINDING_HAZARD_OBJECTIVE_MISMATCH',{id});
    const recovery=binding.destructionRecovery;
    if(!recovery||recovery.status!=='PENDING_AUTHORING_AND_VERIFICATION'||
      recovery.stateMachineId!==sources.topology.destructionStateMachine.id||
      !sameList(recovery.destructibleIds,values(plan,'destructibles'))||
      recovery.mode!==plan.recovery.mode||!sameList(recovery.repairOrder,plan.recovery.repairOrder)||
      recovery.checkpoint!==plan.recovery.checkpoint||recovery.onFailure!==plan.recovery.onFailure)
      return fail('BINDING_DESTRUCTION_RECOVERY_MISMATCH',{id});

    const lod=binding.lodPerformance,profileId=expectedProfile(plan);
    if(!lod||lod.profileId!==profileId||lod.status!=='UNMEASURED_TARGET'||
      !sameList(lod.requiredLodIds,['LOD0','LOD1','LOD2'])||lod.measurements!==null||
      !own(catalog.performanceTargetProfiles,profileId))
      return fail('BINDING_LOD_PERFORMANCE_INVALID',{id});
    const evidence=binding.evidence;
    if(!evidence||evidence.status!=='PENDING'||!Array.isArray(evidence.passedGateIds)||
      evidence.passedGateIds.length!==0||!sameList(evidence.pendingGateIds,REQUIRED_GATES))
      return fail('BINDING_EVIDENCE_NOT_PENDING',{id});

    summaries.push({id,size:plan.size,envelope:plan.envelope,topologyKind:plan.topologyKind,
      geometryFamilyCount:families.length,routeCount:routeIds.length,nodeCount:nodeIds.length,
      edgeCount:edgeIds.length,hazardCount:encounter.hazardIds.length,
      objectiveCount:encounter.objectiveIds.length,destructibleCount:recovery.destructibleIds.length,
      runtimeReady:false,modelsClaimed:false,evidenceStatus:evidence.status});
  }
  return {ok:true,status:catalog.status,bindingHash:digest(stable(catalog)),summary:{
    bindingCount:summaries.length,smallcraftCount:summaries.filter(row=>row.envelope==='orbital_smallcraft').length,
    boardingCount:summaries.filter(row=>row.envelope==='infantry_boarding').length,
    runtimeActive:false,modelsClaimed:false,bindings:summaries
  }};
}

let fatal=null;
const sourceText={};
try{
  for(const [name,rel] of Object.entries(REL)){
    if(name!=='tool') sourceText[name]=fs.readFileSync(path.join(ROOT,rel),'utf8');
  }
  const catalog=JSON.parse(sourceText.bindings);
  const sandbox={console,__bindingRandomCalls:0};
  sandbox.Math=Object.create(Math);
  sandbox.Math.random=()=>{sandbox.__bindingRandomCalls++;return .5;};
  const context=vm.createContext(sandbox);
  vm.runInContext(sourceText.theatre,context,{filename:REL.theatre,timeout:10000});
  vm.runInContext(sourceText.topology,context,{filename:REL.topology,timeout:10000});
  const readVm=expression=>JSON.parse(vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000}));
  const theatre=readVm('Stage10TheatreCatalogV1');
  const topology=readVm('Stage10OrbitalTopologyV1');
  const showcase=(await import(pathToFileURL(path.join(ROOT,REL.showcase)).href+'?stage10bindings='+Date.now())).SHOWCASE_SYSTEMS;
  const contacts=new Map();
  for(const [systemId,system] of Object.entries(showcase)){
    for(const contact of system.contacts) contacts.set(contact.id,{systemId,...contact});
  }
  const sources={theatre,topology,contacts};
  const base=validate(catalog,sources);
  record('catalog.source-only-contract-valid',base.ok===true,{error:base.error||null,summary:base.summary||null});
  record('schema.strict-known-keys-and-model-string-policy',base.ok===true&&
    catalog.schemaPolicy.unknownFields==='REJECT'&&catalog.schemaPolicy.modelLikeStrings==='REJECT'&&
    sameList(catalog.schemaPolicy.modelLikeExtensions,MODEL_EXTENSIONS),{schemaPolicy:catalog.schemaPolicy});
  record('coverage.exact-six-bindings',base.ok===true&&base.summary.bindingCount===6&&
    base.summary.smallcraftCount===4&&base.summary.boardingCount===2,
  {bindingCount:base.summary&&base.summary.bindingCount,smallcraft:base.summary&&base.summary.smallcraftCount,
    boarding:base.summary&&base.summary.boardingCount});
  const preflights=Object.keys(topology.plans).sort().map(id=>({id,
    result:readVm('mfPreflightStage10OrbitalTopologyV1('+JSON.stringify(id)+')')}));
  record('topology.production-preflight-all-six',preflights.every(row=>row.result.ok===true&&
    row.result.summary.runtimeActive===false),{passed:preflights.filter(row=>row.result.ok).length,total:preflights.length});
  record('source.no-model-file-claims',findModelLike(catalog)===null,
    {modelsClaimedToExist:catalog.modelsClaimedToExist});
  record('activation.not-runtime-registered',!sourceText.manifest.includes('stage10-orbital-layout-bindings')&&
    !sourceText.boot.includes('stage10-orbital-layout-bindings'),{});
  const repeat=validate(clone(catalog),sources);
  record('determinism.semantic-hash-stable',base.ok===true&&repeat.ok===true&&
    base.bindingHash===repeat.bindingHash&&sandbox.__bindingRandomCalls===0,
  {first:base.bindingHash,second:repeat.bindingHash,randomCalls:sandbox.__bindingRandomCalls});

  const faults=[
    ['catalog-runtime',value=>{value.runtimeReady=true;},'BINDING_CATALOG_RUNTIME_ENABLED'],
    ['catalog-activation',value=>{value.activation.runtime=true;},'BINDING_CATALOG_RUNTIME_ENABLED'],
    ['model-claim',value=>{value.modelsClaimedToExist=true;},'BINDING_MODEL_EXISTENCE_CLAIMED'],
    ['missing-binding',value=>{value.bindings.pop();},'BINDING_COVERAGE_INVALID'],
    ['source-contact',value=>{value.bindings[0].sourceContact.systemId='veyra';},'BINDING_SOURCE_CONTACT_MISMATCH'],
    ['topology-plan',value=>{value.bindings[0].topologyPlanId='aelos_logistics_array';},'BINDING_TOPOLOGY_PLAN_MISMATCH'],
    ['envelope',value=>{value.bindings[0].envelope.topology='capital_ship';},'BINDING_ENVELOPE_MISMATCH'],
    ['bounds',value=>{value.bindings[0].sizeBounds.width=800;},'BINDING_BOUNDS_MISMATCH'],
    ['geometry-availability',value=>{value.bindings[0].requiredGeometryFamilies[0].availability='MODEL_EXISTS';},'BINDING_GEOMETRY_CLAIMED'],
    ['geometry-model-path',value=>{value.bindings[0].requiredGeometryFamilies[0].modelPath='unproven.glb';},'BINDING_SCHEMA_UNKNOWN_FIELD'],
    ['unknown-top-level',value=>{value.unexpectedField='benign';},'BINDING_SCHEMA_UNKNOWN_FIELD'],
    ['unknown-deep-field',value=>{value.bindings[0].proxyBinding.collision.unexpectedField='benign';},'BINDING_SCHEMA_UNKNOWN_FIELD'],
    ['bare-model-like-string',value=>{value.bindings[0].requiredGeometryFamilies[0].role='unproven.glb';},'BINDING_MODEL_LIKE_STRING'],
    ['route-proxy',value=>{value.bindings[0].proxyBinding.routeVolumeIds.pop();},'BINDING_ROUTE_PROXY_MISMATCH'],
    ['deck-proxy',value=>{value.bindings[2].proxyBinding.deckEdgeIds.pop();},'BINDING_DECK_PROXY_MISMATCH'],
    ['deployment-proxy',value=>{value.bindings[0].proxyBinding.spawnZoneIds.pop();},'BINDING_DEPLOYMENT_PROXY_MISMATCH'],
    ['collision-proxy',value=>{value.bindings[0].proxyBinding.collision.status='VERIFIED';},'BINDING_COLLISION_PROXY_INVALID'],
    ['navigation-proxy',value=>{value.bindings[0].proxyBinding.navigation.binds.pop();},'BINDING_NAVIGATION_PROXY_INVALID'],
    ['hazard-objective',value=>{value.bindings[0].hazardsObjectives.objectiveIds[0]='missing_objective';},'BINDING_HAZARD_OBJECTIVE_MISMATCH'],
    ['destruction-machine',value=>{value.destructionStateMachine.states.pop();},'BINDING_DESTRUCTION_STATE_MACHINE_MISMATCH'],
    ['recovery-order',value=>{value.bindings[1].destructionRecovery.repairOrder.reverse();},'BINDING_DESTRUCTION_RECOVERY_MISMATCH'],
    ['performance-budget',value=>{value.performanceTargetProfiles.orbital_smallcraft_small_v1.maximumActiveDrawCalls=0;},'BINDING_PERFORMANCE_PROFILE_INVALID'],
    ['lod-claim',value=>{value.bindings[0].lodPerformance.status='MEASURED_PASS';},'BINDING_LOD_PERFORMANCE_INVALID'],
    ['evidence-pass',value=>{value.bindings[0].evidence.status='PASS';value.bindings[0].evidence.passedGateIds=['source_contact_match'];},'BINDING_EVIDENCE_NOT_PENDING'],
    ['binding-runtime',value=>{value.bindings[0].activation.runtime=true;},'BINDING_RUNTIME_ENABLED']
  ];
  for(const [id,mutate,expected] of faults){
    const candidate=clone(catalog);
    mutate(candidate);
    const result=validate(candidate,sources);
    record('fault.'+id,result.ok===false&&result.error?.code===expected,
      {expected,actual:result.error&&result.error.code});
  }
  const sourceIdentityFaults=[
    ['system-id',value=>{value.topology.plans.aelos_embassy_spindle.source.systemId='veyra';}],
    ['contact-kind',value=>{value.topology.plans.aelos_logistics_array.source.contactKind='station';}],
    ['interaction',value=>{value.topology.plans.karak_colony_spine.source.interaction='discovery';}],
    ['site-id',value=>{value.topology.plans.veyra_archive_hulk.source.siteId='wrong_site';}],
    ['jump-to',value=>{value.topology.plans.veyra_karak_gate.source.jumpTo='aelos';}]
  ];
  for(const [id,mutate] of sourceIdentityFaults){
    const candidateSources=cloneSources(sources);
    mutate(candidateSources);
    const result=validate(catalog,candidateSources);
    record('fault.topology-source-identity.'+id,result.ok===false&&
      result.error?.code==='BINDING_TOPOLOGY_SOURCE_IDENTITY_MISMATCH',
    {expected:'BINDING_TOPOLOGY_SOURCE_IDENTITY_MISMATCH',actual:result.error&&result.error.code});
  }
}catch(error){
  fatal=error&&error.stack?error.stack:String(error);
  record('tool.fatal',false,{error:fatal});
}

sourceText.tool=fs.readFileSync(path.join(ROOT,REL.tool),'utf8');
const failed=checks.filter(row=>row.status!=='PASS');
const hashes=Object.fromEntries(Object.entries(REL).map(([name,rel])=>[name,{path:rel,sha256:digest(sourceText[name])}]));
console.log(`Stage 10 orbital layout bindings: ${failed.length?'FAIL':'PASS'} ${checks.length-failed.length}/${checks.length}`);
const deterministic=checks.find(row=>row.id==='determinism.semantic-hash-stable');
if(deterministic) console.log(`Binding semantic SHA-256 ${deterministic.first||'unavailable'}`);
console.log('Source SHA-256 '+JSON.stringify(hashes));
for(const row of failed) console.error(`FAIL ${row.id}: ${JSON.stringify(row)}`);
if(fatal) console.error(fatal);
if(failed.length) process.exitCode=1;
