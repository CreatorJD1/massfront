#!/usr/bin/env node
/* Fail-closed cross-source gate for inert Stage 10 surface site requests.
   Requests describe evidence still owed; they never assert geometry or runtime readiness. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  requests:'design/stage10-surface-site-requests.v1.json',
  processing:'docs/MASTER_PLAN_STAGE10_LAYOUT_PROCESSING_MANIFEST_2026-08-29.json',
  topology:'assets/data/battlefieldtopology-stage10.js',
  location:'assets/data/locationplans.js',
  templates:'assets/data/sitetemplates-stage9.js',
  gl:'src/engine/gl.js',
  manifest:'assets/data/manifest.json',
  boot:'boot.js'
};
const ROOT_KEYS=['schema','version','status','sourceOnly','runtimeReady','registered','purpose','authorities',
  'coverage','policy','templateFamilies','maps','activation'];
const AUTHORITY_KEYS=['path','schema','version','sha256'];
const COVERAGE_KEYS=['mapCount','siteRequestCount','templateFamilyCount','fullV1MapCount','pendingV0MapCount',
  'fullV1RequestRecordCount','fullV1DeclaredInstanceCount','domainCounts','supportModeCounts','siteClassCounts'];
const POLICY_KEYS=['requestKind','assetClaims','modelIds','generatedAssetPaths','evidenceStatus','readabilityBudget',
  'runtimeRegistrationAuthorized'];
const FAMILY_KEYS=['id','status','siteClass','domain','supportMode','footprintFamily','modelIds','generatedAssetPaths'];
const MAP_KEYS=['mapId','sourceProfile','topologyProfile','locationBaselineStatus','stage9Baseline','siteRequests'];
const SOURCE_KEYS=['name','planet','faction','region','size','theme','adaptation','hazard','poi','waterMode',
  'navalEnabled','processingWave','processingPolicy','candidateSiteClasses'];
const TOPOLOGY_KEYS=['region','size','layoutProfile','landmark','extent','waterMode','visualBudget'];
const BASELINE_KEYS=['schema','version','map','region','mode','requests'];
const BASELINE_REQUEST_KEYS=['id','source','count','siteClass','layoutClass','template','purpose','era','condition'];
const REQUEST_KEYS=['requestId','siteId','siteClass','domain','supportMode','center','radius','major',
  'requiredApproaches','candidateTemplateFamily','footprintFamily','approachProofStatus','supportProof',
  'evidenceRequirements','sourceOnly','runtimeReady','registered'];
const SUPPORT_KEYS=['status','mode','datumStatus','topologyDatums','requiredProofs'];
const DATUM_KEYS=['waterline','draft','freeboard','stabilization','deckNav','seabedDatum','shoreDatum'];
const EVIDENCE_KEYS=['status','footprint','collision','navigation','destructionRecovery','lod','readability'];
const READABILITY={large:70,secondary:25,micro:5};
const FOOTPRINTS={base:'fortified-campus',brood:'infestation-growth-node',city:'district-campus',
  colony:'settlement-compound',derelict:'derelict-complex',outpost:'forward-node',
  refinery:'industrial-process-yard',relic:'preservation-site',ruin:'ruin-field',
  spaceport:'landing-apron-complex'};
const SUPPORT_MODES=['fixed_caisson','floating_pontoon','semi_submersible','shoreline_quay','terrain'];
const SUPPORT_STATUS={
  fixed_caisson:'SEABED_DATUM_REQUIRED_NOT_DECLARED',
  floating_pontoon:'TOPOLOGY_FLOATING_DATUM_DECLARED_GEOMETRY_UNPROVEN',
  semi_submersible:'TOPOLOGY_FLOATING_DATUM_DECLARED_GEOMETRY_UNPROVEN',
  shoreline_quay:'SHORE_DATUM_REQUIRED_NOT_DECLARED',
  terrain:'TERRAIN_SURFACE_SAMPLE_REQUIRED'
};
const SUPPORT_PROOFS={
  fixed_caisson:['measured-seabed-datum','seabed-reaching-caisson-geometry','waterline-to-deck-elevation-proof',
    'stable-deck-navigation','naval-and-land-interface-clearance','deterministic-caisson-damage-recovery'],
  floating_pontoon:['waterline-draft-freeboard-match','four-point-catenary-mooring-geometry',
    'stable-deck-navigation','naval-and-land-interface-clearance','deterministic-mooring-damage-recovery'],
  semi_submersible:['waterline-draft-freeboard-match','ballast-column-geometry','spread-mooring-geometry',
    'stable-deck-navigation','naval-and-land-interface-clearance','deterministic-ballast-damage-recovery'],
  shoreline_quay:['measured-shore-datum','quay-or-revetment-ground-connection','stable-deck-navigation',
    'naval-and-land-interface-clearance','deterministic-shore-interface-damage-recovery'],
  terrain:['measured-terrain-grade-at-center','foundation-contact-within-radius','land-approach-interface-clearance']
};
const EVIDENCE={
  footprint:['measured-bounds-fit-within-declared-radius','center-radius-clearance','approach-interface-sockets'],
  collision:['separate-simplified-collision-proxy','state-matched-collision-swap'],
  landNavigation:['land-navigation-proxy','approach-to-footprint-connectivity'],
  maritimeNavigation:['stable-deck-navigation-proxy','naval-to-land-interface-connectivity'],
  destructionRecovery:['intact','damaged','destroyed','recovered','deterministic-state-swap-and-restore'],
  lod:['LOD0','LOD1_MAX_40_PERCENT','LOD2_MAX_12_PERCENT','silhouette-and-interface-retention']
};
const checks=[];

function digest(text){return crypto.createHash('sha256').update(text).digest('hex');}
function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function same(a,b){return stable(a)===stable(b);}
function sameList(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
function exactKeys(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&sameList(Object.keys(value).sort(),[...keys].sort());}
function fail(code,details={}){return {ok:false,status:'REJECTED',error:{code,details}};}
function record(id,ok,details={}){checks.push({id,status:ok?'PASS':'FAIL',...details});return ok;}
function extractConst(source,name){
  const match=new RegExp('const\\s+'+name+'\\s*=').exec(source);
  if(!match) throw new Error('Missing pure catalog declaration: '+name);
  const start=match.index,scan=start+match[0].length;
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=scan;i<source.length;i++){
    const c=source[i],n=source[i+1];
    if(lineComment){if(c==='\n') lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote) quote='';continue;}
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='('||c==='['||c==='{') depth++;
    else if(c===')'||c===']'||c==='}') depth--;
    else if(c===';'&&depth===0) return source.slice(start,i+1);
  }
  throw new Error('Unterminated pure catalog declaration: '+name);
}
function expectedSource(row){return {name:row.name,planet:row.planet,faction:row.faction,region:row.region,
  size:row.size,theme:row.theme,adaptation:row.adaptation,hazard:row.hazard,poi:row.poi,
  waterMode:row.terrain.waterMode,navalEnabled:row.terrain.navalEnabled,processingWave:row.processingWave,
  processingPolicy:row.processingPolicy,candidateSiteClasses:row.candidateSiteClasses};}
function expectedTopology(plan){return {region:plan.region,size:plan.size,layoutProfile:plan.layoutProfile,
  landmark:plan.landmark,extent:[plan.extent.width,plan.extent.height],waterMode:plan.water.mode,
  visualBudget:READABILITY};}
function expectedDatums(site){return Object.fromEntries(DATUM_KEYS.map(key=>[key,Object.prototype.hasOwnProperty.call(site,key)?site[key]:null]));}
function assetLike(value){
  if(typeof value==='string') return /(?:^|[\\/])(?:assets|models?|generated)(?:[\\/]|$)|\.(?:blend|blend1|fbx|glb|gltf|obj|png|jpe?g|webp|ktx2)$/i.test(value);
  if(Array.isArray(value)) return value.some(assetLike);
  return !!value&&typeof value==='object'&&Object.values(value).some(assetLike);
}
function counts(values){const out={};for(const value of values) out[value]=(out[value]||0)+1;return Object.fromEntries(Object.entries(out).sort());}

function validate(catalog,sources){
  if(!catalog||catalog.schema!=='MassfrontStage10SurfaceSiteRequestsV1'||catalog.version!==1)
    return fail('SURFACE_REQUEST_SCHEMA_INVALID');
  if(!exactKeys(catalog,ROOT_KEYS)||!exactKeys(catalog.authorities,
    ['processingManifest','battlefieldTopology','locationPlans','stage9SiteTemplates'])||
    Object.values(catalog.authorities).some(row=>!exactKeys(row,AUTHORITY_KEYS))||
    !exactKeys(catalog.coverage,COVERAGE_KEYS)||!exactKeys(catalog.policy,POLICY_KEYS)||
    !exactKeys(catalog.activation,['runtime','registrationAuthorized','reason']))
    return fail('SURFACE_REQUEST_UNKNOWN_FIELD');
  if(catalog.status!=='SOURCE_ONLY_REQUEST_CONTRACT'||catalog.sourceOnly!==true||catalog.runtimeReady!==false||
    catalog.registered!==false||catalog.activation.runtime!==false||catalog.activation.registrationAuthorized!==false||
    catalog.policy.runtimeRegistrationAuthorized!==false)
    return fail('SURFACE_REQUEST_RUNTIME_ENABLED');
  if(catalog.policy.requestKind!=='GEOMETRY_TEMPLATE_REQUEST_ONLY'||catalog.policy.assetClaims!=='NONE'||
    catalog.policy.evidenceStatus!=='PENDING_ALL'||!same(catalog.policy.readabilityBudget,READABILITY)||
    !Array.isArray(catalog.policy.modelIds)||catalog.policy.modelIds.length||
    !Array.isArray(catalog.policy.generatedAssetPaths)||catalog.policy.generatedAssetPaths.length)
    return fail('SURFACE_REQUEST_POLICY_INVALID');
  if(assetLike({families:catalog.templateFamilies,maps:catalog.maps.map(row=>({siteRequests:row.siteRequests}))}))
    return fail('SURFACE_REQUEST_ASSET_CLAIMED');

  const expectedAuthorities={
    processingManifest:{path:REL.processing,schema:'MassfrontStage10RoleAwareProcessingManifestV2',version:4,sourceKey:'processing'},
    battlefieldTopology:{path:REL.topology,schema:'BattlefieldTopologyV2',version:2,sourceKey:'battlefieldTopology'},
    locationPlans:{path:REL.location,schema:'LocationMapPlanV1',version:1,sourceKey:'locationPlans'},
    stage9SiteTemplates:{path:REL.templates,schema:'SITE_TPL_STAGE9_V1',version:1,sourceKey:'stage9SiteTemplates'}
  };
  for(const [key,expected] of Object.entries(expectedAuthorities)){
    const actual=catalog.authorities[key];
    if(actual.path!==expected.path||actual.schema!==expected.schema||actual.version!==expected.version||
      actual.sha256!=='sha256-'+digest(sources.text[expected.sourceKey])) return fail('SURFACE_REQUEST_AUTHORITY_DRIFT',{key});
  }
  const processing=sources.processing,topology=sources.topology,location=sources.location,templates=sources.templates;
  if(processing.schema!=='MassfrontStage10RoleAwareProcessingManifestV2'||processing.version!==4||
    topology.schema!=='BattlefieldTopologyV2'||topology.version!==2||location.schema!=='LocationMapPlanV1'||location.version!==1)
    return fail('SURFACE_REQUEST_SOURCE_SCHEMA_INVALID');
  const processingMaps=processing.maps.filter(row=>row.size==='standard'&&row.processingWave==='wave-1-standard')
    .sort((a,b)=>a.id.localeCompare(b.id));
  const expectedIds=processingMaps.map(row=>row.id),topologyIds=Object.keys(topology.plans).sort();
  const actualIds=Array.isArray(catalog.maps)?catalog.maps.map(row=>row&&row.mapId):[];
  if(expectedIds.length!==16||!sameList(expectedIds,topologyIds)||!sameList(expectedIds,actualIds)||
    new Set(actualIds).size!==actualIds.length) return fail('SURFACE_REQUEST_MAP_COVERAGE_INVALID',{expectedIds,topologyIds,actualIds});

  const allRequests=[],baselineRecords=[];
  for(let i=0;i<catalog.maps.length;i++){
    const row=catalog.maps[i],source=processingMaps[i],plan=topology.plans[row.mapId],baseline=location.plans[row.mapId]||null;
    if(!exactKeys(row,MAP_KEYS)||!exactKeys(row.sourceProfile,SOURCE_KEYS)||!exactKeys(row.topologyProfile,TOPOLOGY_KEYS))
      return fail('SURFACE_REQUEST_MAP_UNKNOWN_FIELD',{mapId:row.mapId});
    if(!same(row.sourceProfile,expectedSource(source))||!same(row.topologyProfile,expectedTopology(plan)))
      return fail('SURFACE_REQUEST_MAP_SOURCE_DRIFT',{mapId:row.mapId});
    const expectedStatus=baseline?'FULL_V1':'PENDING_V0';
    if(row.locationBaselineStatus!==expectedStatus||plan.locationBaseline.status!==expectedStatus)
      return fail('SURFACE_REQUEST_BASELINE_STATUS_DRIFT',{mapId:row.mapId});
    if(baseline){
      if(!exactKeys(row.stage9Baseline,BASELINE_KEYS)||row.stage9Baseline.requests.some(req=>!exactKeys(req,BASELINE_REQUEST_KEYS))||
        !same(row.stage9Baseline,baseline)||source.processingPolicy!=='extend-without-breaking-full-v1-contract')
        return fail('SURFACE_REQUEST_FULL_V1_NOT_PRESERVED',{mapId:row.mapId});
      for(const request of baseline.requests){
        const template=templates[request.template];
        if(!template||template.map!==row.mapId||template.region!==source.region||
          template.class!==request.siteClass) return fail('SURFACE_REQUEST_FULL_V1_TEMPLATE_DRIFT',{mapId:row.mapId,template:request.template});
      }
      baselineRecords.push(...baseline.requests);
    }else if(row.stage9Baseline!==null||source.processingPolicy!=='author-exact-plan-and-templates'){
      return fail('SURFACE_REQUEST_PENDING_V0_NOT_REQUEST_ONLY',{mapId:row.mapId});
    }
    if(!Array.isArray(row.siteRequests)||row.siteRequests.length!==plan.sites.length)
      return fail('SURFACE_REQUEST_SITE_COVERAGE_INVALID',{mapId:row.mapId});
    const sourceSites=[...plan.sites].sort((a,b)=>a.id.localeCompare(b.id));
    const requestSites=[...row.siteRequests].sort((a,b)=>a.siteId.localeCompare(b.siteId));
    for(let s=0;s<sourceSites.length;s++){
      const site=sourceSites[s],request=requestSites[s];
      if(!exactKeys(request,REQUEST_KEYS)||!exactKeys(request.supportProof,SUPPORT_KEYS)||
        !exactKeys(request.supportProof.topologyDatums,DATUM_KEYS)||
        !exactKeys(request.evidenceRequirements,EVIDENCE_KEYS)||
        !exactKeys(request.evidenceRequirements.readability,['large','secondary','micro']))
        return fail('SURFACE_REQUEST_SITE_UNKNOWN_FIELD',{mapId:row.mapId,siteId:request.siteId});
      if(request.siteId!==site.id||request.requestId!==site.id+'#geometry-template-request-v1'||
        request.siteClass!==site.siteClass||request.domain!==site.domain||request.supportMode!==site.supportMode||
        !same(request.center,site.center)||request.radius!==site.radius||request.major!==site.major||
        !same(request.requiredApproaches,site.approaches))
        return fail('SURFACE_REQUEST_SITE_SOURCE_DRIFT',{mapId:row.mapId,siteId:request.siteId});
      const footprint=FOOTPRINTS[site.siteClass],family='candidate-'+site.supportMode.replaceAll('_','-')+'-'+site.siteClass+'-grammar-v1';
      if(!footprint||request.footprintFamily!==footprint||request.candidateTemplateFamily!==family||
        request.approachProofStatus!=='PENDING_EXACT_ROUTE_INTERFACES')
        return fail('SURFACE_REQUEST_FOOTPRINT_OR_APPROACH_INVALID',{mapId:row.mapId,siteId:site.id});
      if(request.sourceOnly!==true||request.runtimeReady!==false||request.registered!==false)
        return fail('SURFACE_REQUEST_SITE_RUNTIME_ENABLED',{mapId:row.mapId,siteId:site.id});
      const support=request.supportProof;
      if(!SUPPORT_MODES.includes(site.supportMode)||support.status!=='REQUIRED_NOT_PROVEN'||
        support.mode!==site.supportMode||support.datumStatus!==SUPPORT_STATUS[site.supportMode]||
        !same(support.topologyDatums,expectedDatums(site))||!same(support.requiredProofs,SUPPORT_PROOFS[site.supportMode]))
        return fail('SURFACE_REQUEST_SUPPORT_PROOF_INVALID',{mapId:row.mapId,siteId:site.id});
      const maritime=site.supportMode!=='terrain';
      if((maritime&&(site.domain!=='maritime'||source.terrain.navalEnabled!==true))||(!maritime&&site.domain!=='land'))
        return fail('SURFACE_REQUEST_DOMAIN_SUPPORT_INVALID',{mapId:row.mapId,siteId:site.id});
      const evidence=request.evidenceRequirements;
      if(evidence.status!=='PENDING_ALL'||!same(evidence.footprint,EVIDENCE.footprint)||
        !same(evidence.collision,EVIDENCE.collision)||
        !same(evidence.navigation,maritime?EVIDENCE.maritimeNavigation:EVIDENCE.landNavigation)||
        !same(evidence.destructionRecovery,EVIDENCE.destructionRecovery)||!same(evidence.lod,EVIDENCE.lod)||
        !same(evidence.readability,READABILITY))
        return fail('SURFACE_REQUEST_EVIDENCE_CONTRACT_INVALID',{mapId:row.mapId,siteId:site.id});
      allRequests.push(request);
    }
  }

  const combinations=[...new Set(allRequests.map(row=>[row.supportMode,row.siteClass].join('|')))].sort();
  const families=[...catalog.templateFamilies].sort((a,b)=>a.id.localeCompare(b.id));
  const expectedFamilies=combinations.map(combo=>{
    const [supportMode,siteClass]=combo.split('|'),domain=supportMode==='terrain'?'land':'maritime';
    return {id:'candidate-'+supportMode.replaceAll('_','-')+'-'+siteClass+'-grammar-v1',status:'REQUEST_ONLY',siteClass,domain,
      supportMode,footprintFamily:FOOTPRINTS[siteClass],modelIds:[],generatedAssetPaths:[]};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const familyUnknown=families.filter(row=>!exactKeys(row,FAMILY_KEYS)).map(row=>({id:row.id,keys:Object.keys(row)}));
  if(familyUnknown.length||!same(families,expectedFamilies))
    return fail('SURFACE_REQUEST_TEMPLATE_FAMILIES_INVALID',{familyUnknown,families,expectedFamilies});
  const declared={mapCount:16,siteRequestCount:allRequests.length,templateFamilyCount:families.length,
    fullV1MapCount:catalog.maps.filter(row=>row.locationBaselineStatus==='FULL_V1').length,
    pendingV0MapCount:catalog.maps.filter(row=>row.locationBaselineStatus==='PENDING_V0').length,
    fullV1RequestRecordCount:baselineRecords.length,
    fullV1DeclaredInstanceCount:baselineRecords.reduce((sum,row)=>sum+row.count,0),
    domainCounts:counts(allRequests.map(row=>row.domain)),supportModeCounts:counts(allRequests.map(row=>row.supportMode)),
    siteClassCounts:counts(allRequests.map(row=>row.siteClass))};
  if(!same(catalog.coverage,declared)||declared.siteRequestCount!==96||declared.templateFamilyCount!==16||
    declared.fullV1MapCount!==6||declared.pendingV0MapCount!==10||
    !same(declared.supportModeCounts,{fixed_caisson:1,floating_pontoon:3,semi_submersible:1,shoreline_quay:1,terrain:90}))
    return fail('SURFACE_REQUEST_COVERAGE_DECLARATION_INVALID',{declared});
  return {ok:true,status:catalog.status,semanticHash:digest(stable(catalog)),summary:{...declared,runtimeActive:false,
    assetsClaimed:false,maritimeSiteCount:declared.domainCounts.maritime}};
}

let fatal=null;
try{
  const text=Object.fromEntries(Object.entries(REL).map(([key,rel])=>[key,fs.readFileSync(path.join(ROOT,rel),'utf8')]));
  const catalog=JSON.parse(text.requests),processing=JSON.parse(text.processing);
  const context=vm.createContext({console});
  vm.runInContext([extractConst(text.gl,'MAPDEFS'),extractConst(text.gl,'PLANETS'),
    extractConst(text.templates,'SITE_TPL_STAGE9_V1'),extractConst(text.location,'LocationMapPlanV1'),
    text.topology].join('\n'),context,{timeout:10000});
  const read=expression=>JSON.parse(vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000}));
  const sources={processing,topology:read('BattlefieldTopologyV2'),location:read('LocationMapPlanV1'),
    templates:read('SITE_TPL_STAGE9_V1'),text:{processing:text.processing,battlefieldTopology:text.topology,
      locationPlans:text.location,stage9SiteTemplates:text.templates}};
  const base=validate(catalog,sources);
  record('catalog.strict-cross-source',base.ok===true,{error:base.error||null,summary:base.summary||null});
  record('coverage.exact-sixteen-and-ninety-six',base.ok===true&&base.summary.mapCount===16&&base.summary.siteRequestCount===96,
    {summary:base.summary||null});
  record('baseline.six-full-v1-preserved',base.ok===true&&base.summary.fullV1MapCount===6&&base.summary.fullV1RequestRecordCount===10,
    {summary:base.summary||null});
  record('pending.ten-v0-request-only',base.ok===true&&base.summary.pendingV0MapCount===10,{summary:base.summary||null});
  record('maritime.six-distinct-support-contracts',base.ok===true&&base.summary.maritimeSiteCount===6&&
    same(base.summary.supportModeCounts,{fixed_caisson:1,floating_pontoon:3,semi_submersible:1,shoreline_quay:1,terrain:90}),
    {supportModeCounts:base.summary&&base.summary.supportModeCounts});
  record('activation.unregistered',!text.manifest.includes('stage10-surface-site-requests')&&!text.boot.includes('stage10-surface-site-requests'));
  const repeat=validate(clone(catalog),clone(sources));
  record('determinism.semantic-hash-stable',base.ok===true&&repeat.ok===true&&base.semanticHash===repeat.semanticHash,
    {first:base.semanticHash,second:repeat.semanticHash});

  const catalogFaults=[
    ['unknown-field',v=>{v.unproven='claim';},'SURFACE_REQUEST_UNKNOWN_FIELD'],
    ['runtime',v=>{v.runtimeReady=true;},'SURFACE_REQUEST_RUNTIME_ENABLED'],
    ['asset-model',v=>{v.policy.modelIds.push('unproven_model');},'SURFACE_REQUEST_POLICY_INVALID'],
    ['asset-path',v=>{v.templateFamilies[0].generatedAssetPaths.push('assets/models/unproven.glb');},'SURFACE_REQUEST_ASSET_CLAIMED'],
    ['missing-map',v=>{v.maps.pop();},'SURFACE_REQUEST_MAP_COVERAGE_INVALID'],
    ['source-drift',v=>{v.maps[0].sourceProfile.name='Drift';},'SURFACE_REQUEST_MAP_SOURCE_DRIFT'],
    ['full-v1-drift',v=>{v.maps[0].stage9Baseline.requests[0].count++;},'SURFACE_REQUEST_FULL_V1_NOT_PRESERVED'],
    ['pending-v0-claim',v=>{v.maps[2].stage9Baseline={};},'SURFACE_REQUEST_PENDING_V0_NOT_REQUEST_ONLY'],
    ['missing-site',v=>{v.maps[0].siteRequests.pop();},'SURFACE_REQUEST_SITE_COVERAGE_INVALID'],
    ['site-class',v=>{v.maps[0].siteRequests[0].siteClass='base';},'SURFACE_REQUEST_SITE_SOURCE_DRIFT'],
    ['footprint',v=>{v.maps[0].siteRequests[0].footprintFamily='generic';},'SURFACE_REQUEST_FOOTPRINT_OR_APPROACH_INVALID'],
    ['approach',v=>{v.maps[0].siteRequests[0].requiredApproaches.pop();},'SURFACE_REQUEST_SITE_SOURCE_DRIFT'],
    ['support',v=>{v.maps[1].siteRequests[5].supportProof.topologyDatums.draft=0;},'SURFACE_REQUEST_SUPPORT_PROOF_INVALID'],
    ['collision',v=>{v.maps[0].siteRequests[0].evidenceRequirements.collision.pop();},'SURFACE_REQUEST_EVIDENCE_CONTRACT_INVALID'],
    ['navigation',v=>{v.maps[0].siteRequests[0].evidenceRequirements.navigation.pop();},'SURFACE_REQUEST_EVIDENCE_CONTRACT_INVALID'],
    ['destruction',v=>{v.maps[0].siteRequests[0].evidenceRequirements.destructionRecovery.pop();},'SURFACE_REQUEST_EVIDENCE_CONTRACT_INVALID'],
    ['lod',v=>{v.maps[0].siteRequests[0].evidenceRequirements.lod.pop();},'SURFACE_REQUEST_EVIDENCE_CONTRACT_INVALID'],
    ['readability',v=>{v.maps[0].siteRequests[0].evidenceRequirements.readability.large=69;},'SURFACE_REQUEST_EVIDENCE_CONTRACT_INVALID'],
    ['request-runtime',v=>{v.maps[0].siteRequests[0].runtimeReady=true;},'SURFACE_REQUEST_SITE_RUNTIME_ENABLED'],
    ['family-claim',v=>{v.templateFamilies[0].status='AVAILABLE';},'SURFACE_REQUEST_TEMPLATE_FAMILIES_INVALID']
  ];
  for(const [id,mutate,expected] of catalogFaults){
    const candidate=clone(catalog);mutate(candidate);const result=validate(candidate,sources);
    record('fault.catalog.'+id,result.ok===false&&result.error?.code===expected,{expected,actual:result.error&&result.error.code});
  }
  const sourceFaults=[
    ['processing-map',v=>{v.processing.maps.find(row=>row.id==='aelos_basin_medium').name='Drift';},'SURFACE_REQUEST_MAP_SOURCE_DRIFT'],
    ['topology-site',v=>{v.topology.plans.aelos_basin_medium.sites[0].radius++;},'SURFACE_REQUEST_SITE_SOURCE_DRIFT'],
    ['location-baseline',v=>{v.location.plans.aelos_basin_medium.requests[0].count++;},'SURFACE_REQUEST_FULL_V1_NOT_PRESERVED'],
    ['template-baseline',v=>{v.templates.colony_aelos_basin_canal_v1.map='wrong';},'SURFACE_REQUEST_FULL_V1_TEMPLATE_DRIFT']
  ];
  for(const [id,mutate,expected] of sourceFaults){
    const candidate=clone(sources);mutate(candidate);const result=validate(catalog,candidate);
    record('fault.source.'+id,result.ok===false&&result.error?.code===expected,{expected,actual:result.error&&result.error.code});
  }
}catch(error){fatal=error&&error.stack?error.stack:String(error);record('tool.fatal',false,{error:fatal});}

const failed=checks.filter(row=>row.status!=='PASS');
console.log(`Stage 10 surface site requests: ${failed.length?'FAIL':'PASS'} ${checks.length-failed.length}/${checks.length}`);
const deterministic=checks.find(row=>row.id==='determinism.semantic-hash-stable');
if(deterministic) console.log('Request semantic SHA-256 '+(deterministic.first||'unavailable'));
for(const row of failed) console.error('FAIL '+row.id+': '+JSON.stringify(row));
if(fatal) console.error(fatal);
if(failed.length) process.exitCode=1;
