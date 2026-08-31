#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  profiles:'design/stage10-exploration-planet-layout-profiles.json',
  showcase:'modules/space_exploration/src/systems/showcase_systems.js',
  theatre:'assets/data/theatreprofiles-stage10.js',
  manifest:'assets/data/manifest.json',
  boot:'boot.js'
};
const TOP_KEYS=['assetClaims','catalogId','factRecommendationPolicy','globalMapSupportFacts','identityAuthority',
  'identitySlots','profiles','requiredEvidenceProfile','runtimeReady','runtimeRegistration','schemaVersion',
  'sizeClassFacts','sourceOnly','status','unitEnvelopeFacts'];
const PROFILE_KEYS=['evidenceState','mapSizeConcepts','planetId','planningRecommendations','runtimeReady','sourceFacts','status'];
const FACT_KEYS=['biome','discoveryRecords','freeFloatingStructureEvidence','name','radius','rings','scanFlag',
  'sourceObject','subLabel','surfaceWaterEvidence','systemId'];
const checks=[];

function stable(value){
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function same(a,b){return stable(a)===stable(b);}
function exactKeys(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&
  same(Object.keys(value).sort(),[...keys].sort());}
function fail(code,details={}){return {ok:false,error:{code,details}};}
function record(id,ok,details={}){checks.push({id,status:ok?'PASS':'FAIL',...details});}
function digest(text){return crypto.createHash('sha256').update(text).digest('hex');}
function extractConst(source,name,exported=false){
  const token=(exported?'export ':'')+'const '+name+' =',start=source.indexOf(token);
  if(start<0) throw new Error('Missing declaration '+name);
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
    else if(c===';'&&depth===0) return source.slice(start,i+1).replace(/^export /,'');
  }
  throw new Error('Unterminated declaration '+name);
}

function validate(catalog,sources){
  if(!catalog||catalog.schemaVersion!==1||catalog.catalogId!=='massfront-stage10-exploration-planet-layout-profiles-v1')
    return fail('PLANET_PROFILE_SCHEMA_INVALID');
  if(!exactKeys(catalog,TOP_KEYS)) return fail('PLANET_PROFILE_UNKNOWN_FIELD');
  if(catalog.status!=='AUTHORING_ONLY'||catalog.sourceOnly!==true||catalog.runtimeReady!==false||
    !same(catalog.runtimeRegistration,{manifest:false,boot:false,loader:false,runtimeActivationAllowed:false}))
    return fail('PLANET_PROFILE_RUNTIME_ENABLED');
  if(sources.manifest.includes('stage10-exploration-planet-layout-profiles')||
    sources.boot.includes('stage10-exploration-planet-layout-profiles')) return fail('PLANET_PROFILE_REGISTERED');
  const authority=catalog.identityAuthority;
  if(!authority||authority.kind!=='EXACT_SHOWCASE_SYSTEMS_PLANET_BODIES'||authority.source!==REL.showcase||
    authority.theatreCrossReference!==REL.theatre||authority.matchingPolicy!=='CASE_SENSITIVE_EXACT_ID_ONLY'||
    authority.aliasesAllowed!==false||authority.inferredIdentitiesAllowed!==false)
    return fail('PLANET_PROFILE_AUTHORITY_INVALID');

  const bodies=[];
  for(const system of Object.values(sources.showcase)) for(let i=0;i<system.planets.length;i++)
    bodies.push({system,planet:system.planets[i],index:i});
  const ids=bodies.map(row=>row.planet.id);
  if(ids.length!==6||!same(authority.exactPlanetIds,ids)||
    !same(sources.theatre.sourceInventories.authoredExplorationPlanets.ids,ids))
    return fail('PLANET_PROFILE_IDENTITY_COVERAGE_INVALID');
  if(!Array.isArray(catalog.identitySlots)||catalog.identitySlots.length!==8) return fail('PLANET_PROFILE_SLOT_COVERAGE_INVALID');
  for(let i=0;i<8;i++){
    const slot=catalog.identitySlots[i];
    if(slot?.slot!==i+1) return fail('PLANET_PROFILE_SLOT_INVALID',{index:i});
    if(i<6){
      if(slot.identityStatus!=='SOURCE_MATCHED'||slot.planetId!==ids[i]||slot.name!==bodies[i].planet.name)
        return fail('PLANET_PROFILE_SLOT_SOURCE_DRIFT',{index:i});
    }else if(slot.identityStatus!=='PENDING_CANON_NAME'||slot.planetId!==null||slot.name!==null)
      return fail('PLANET_PROFILE_PENDING_SLOT_PROMOTED',{index:i});
  }

  const sizes=sources.theatre.sizeClasses,envelopes=sources.theatre.unitEnvelopes;
  if(!same(catalog.sizeClassFacts,{XS:{maximumSpanMeters:sizes.XS.maxSpanMeters,sourceRole:sizes.XS.role},
    SMALL:{maximumSpanMeters:sizes.SMALL.maxSpanMeters,sourceRole:sizes.SMALL.role},
    STANDARD:{maximumSpanMeters:sizes.STANDARD.maxSpanMeters,sourceRole:sizes.STANDARD.role}}))
    return fail('PLANET_PROFILE_SIZE_SOURCE_DRIFT');
  const expectedEnvelopes={
    infantry_only:{allowed:envelopes.infantry_only.allowed,forbidden:envelopes.infantry_only.forbidden,
      maximumMassClass:envelopes.infantry_only.maxMassClass,maximumFootprintMeters:envelopes.infantry_only.maxFootprintMeters},
    small_unit_combined:{allowed:envelopes.small_unit_combined.allowed,forbidden:envelopes.small_unit_combined.forbidden,
      maximumMassClass:envelopes.small_unit_combined.maxMassClass,mechClass:envelopes.small_unit_combined.mechClass,
      maximumFootprintMeters:envelopes.small_unit_combined.maxFootprintMeters},
    surface_combined_arms:{allowed:envelopes.surface_combined_arms.allowed,forbidden:envelopes.surface_combined_arms.forbidden,
      maximumMassClass:envelopes.surface_combined_arms.maxMassClass,
      useRestriction:'NOT_AVAILABLE_TO_A_PROFILE_WITHOUT_EXACT_STANDARD_SURFACE_TOPOLOGY'}
  };
  if(!same(catalog.unitEnvelopeFacts,expectedEnvelopes)) return fail('PLANET_PROFILE_ENVELOPE_SOURCE_DRIFT');
  if(catalog.globalMapSupportFacts.standardSurface.supportLevel!=='NO_EXACT_SHOWCASE_PLANET_SURFACE_TOPOLOGY'||
    catalog.globalMapSupportFacts.standardSurface.exactSupportedPlanetIds.length)
    return fail('PLANET_PROFILE_UNPROVEN_STANDARD_SURFACE');
  if(!Array.isArray(catalog.profiles)||catalog.profiles.length!==6||!same(catalog.profiles.map(row=>row.planetId),ids))
    return fail('PLANET_PROFILE_RECORD_COVERAGE_INVALID');

  let conditionalInteriors=0,standardBindings=0,conditionalSeaPlatforms=0;
  for(let i=0;i<catalog.profiles.length;i++){
    const profile=catalog.profiles[i],body=bodies[i],planet=body.planet;
    if(!exactKeys(profile,PROFILE_KEYS)||!exactKeys(profile.sourceFacts,FACT_KEYS))
      return fail('PLANET_PROFILE_RECORD_UNKNOWN_FIELD',{planetId:profile.planetId});
    if(profile.status!=='AUTHORING_RECOMMENDATION_ONLY'||profile.runtimeReady!==false)
      return fail('PLANET_PROFILE_RECORD_RUNTIME_ENABLED',{planetId:profile.planetId});
    const expectedFacts={sourceObject:`SHOWCASE_SYSTEMS.${body.system.id}.planets[${body.index}]`,systemId:body.system.id,
      name:planet.name,biome:planet.biome,subLabel:planet.sub,radius:planet.radius,rings:planet.rings,
      scanFlag:planet.isScanning===true?'EXPLICIT_TRUE':'NOT_DECLARED',
      discoveryRecords:planet.mineralDeposits.map(row=>({id:row.id,type:row.type})),
      surfaceWaterEvidence:planet.id==='aelos_caldris'?'EXPLICIT_OCEANIC_AND_PELAGIC_TERMINOLOGY':'NOT_EXPLICIT',
      freeFloatingStructureEvidence:'NOT_ESTABLISHED'};
    if(!same(profile.sourceFacts,expectedFacts)) return fail('PLANET_PROFILE_SOURCE_FACT_DRIFT',{planetId:profile.planetId});
    if(!Array.isArray(profile.mapSizeConcepts)||!same(profile.mapSizeConcepts.map(row=>row.sizeClass),['XS','SMALL','STANDARD']))
      return fail('PLANET_PROFILE_SIZE_CONCEPT_INVALID',{planetId:profile.planetId});
    for(const concept of profile.mapSizeConcepts){
      if(concept.planetRuntimeBinding!==false) return fail('PLANET_PROFILE_MAP_RUNTIME_BOUND',{planetId:profile.planetId});
      if(concept.sizeClass==='STANDARD'){
        if(concept.sourceSupport!=='NO_EXACT_PLANET_SURFACE_TOPOLOGY'||concept.recommendationStatus!=='DEFERRED'||concept.unitEnvelopeRefs.length)
          return fail('PLANET_PROFILE_UNPROVEN_STANDARD_SURFACE',{planetId:profile.planetId});
        standardBindings+=concept.planetRuntimeBinding===true?1:0;
      }else{
        if(concept.domain!=='interior_tactical'||concept.sourceSupport!=='GLOBAL_DOMAIN_ONLY'||
          concept.recommendationStatus!=='CONDITIONAL_AUTHORING_CONCEPT'||
          !same(concept.unitEnvelopeRefs,['infantry_only','small_unit_combined']))
          return fail('PLANET_PROFILE_INTERIOR_CONCEPT_INVALID',{planetId:profile.planetId,size:concept.sizeClass});
        conditionalInteriors++;
      }
    }
    const sea=profile.planningRecommendations?.floatingSeaPlatforms;
    if(!sea||sea.generatedPlatformAssetsKnown!==false) return fail('PLANET_PROFILE_PLATFORM_ASSET_CLAIMED',{planetId:profile.planetId});
    if(planet.id==='aelos_caldris'){
      if(sea.status!=='CONDITIONAL_AUTHORING_RECOMMENDATION'||profile.evidenceState.floatingPlatformEngineering!=='REQUIRED_BEFORE_PLATFORM_AUTHORING')
        return fail('PLANET_PROFILE_CALDRIS_PLATFORM_POLICY_INVALID');
      conditionalSeaPlatforms++;
    }else if(sea.status!=='DEFERRED_NO_SOURCE_WATER_BASIS'||
      profile.evidenceState.floatingPlatformEngineering!=='NOT_APPLICABLE_WITH_CURRENT_RECOMMENDATION')
      return fail('PLANET_PROFILE_UNSUPPORTED_PLATFORM_POLICY',{planetId:profile.planetId});
    if(profile.evidenceState.identityAuthority!=='SOURCE_MATCHED'||profile.evidenceState.otherRequiredGates!=='MISSING'||
      profile.evidenceState.artifactPaths.length) return fail('PLANET_PROFILE_EVIDENCE_FALSE_GREEN',{planetId:profile.planetId});
  }
  if(conditionalInteriors!==12||standardBindings!==0||conditionalSeaPlatforms!==1)
    return fail('PLANET_PROFILE_SUMMARY_INVALID',{conditionalInteriors,standardBindings,conditionalSeaPlatforms});
  const claims=catalog.assetClaims;
  if(!claims||Object.values(claims).some(value=>!Array.isArray(value)||value.length)) return fail('PLANET_PROFILE_ASSET_OR_CANON_CLAIMED');
  return {ok:true,summary:{planetCount:6,pendingSlots:2,conditionalInteriors,standardBindings,conditionalSeaPlatforms,
    runtimeReady:false,assetClaimCount:0},semanticHash:digest(stable(catalog))};
}

let fatal=null;
try{
  const text=Object.fromEntries(Object.entries(REL).map(([key,rel])=>[key,fs.readFileSync(path.join(ROOT,rel),'utf8')]));
  const context=vm.createContext({});
  vm.runInContext(extractConst(text.showcase,'SHOWCASE_SYSTEMS',true),context,{timeout:10000});
  vm.runInContext(text.theatre,context,{timeout:10000});
  const showcase=JSON.parse(vm.runInContext('JSON.stringify(SHOWCASE_SYSTEMS)',context));
  const theatre=JSON.parse(vm.runInContext('JSON.stringify(Stage10TheatreCatalogV1)',context));
  const catalog=JSON.parse(text.profiles),sources={showcase,theatre,manifest:text.manifest,boot:text.boot};
  const base=validate(catalog,sources);
  record('catalog.source-matched-and-inert',base.ok===true,{error:base.error||null,summary:base.summary||null});
  record('coverage.six-planets-two-pending',base.ok&&base.summary.planetCount===6&&base.summary.pendingSlots===2);
  record('concepts.twelve-restricted-interiors',base.ok&&base.summary.conditionalInteriors===12);
  record('surface.zero-unproven-standard-bindings',base.ok&&base.summary.standardBindings===0);
  record('platform.caldris-only-conditional',base.ok&&base.summary.conditionalSeaPlatforms===1);
  record('activation.no-assets-no-runtime',base.ok&&base.summary.assetClaimCount===0&&base.summary.runtimeReady===false);
  const faults=[
    ['top-unknown',value=>{value.unprovenModel='fake.glb';},'PLANET_PROFILE_UNKNOWN_FIELD'],
    ['runtime',value=>{value.runtimeReady=true;},'PLANET_PROFILE_RUNTIME_ENABLED'],
    ['slot-promoted',value=>{value.identitySlots[6]={slot:7,identityStatus:'SOURCE_MATCHED',planetId:'invented',name:'Invented'};},'PLANET_PROFILE_PENDING_SLOT_PROMOTED'],
    ['identity-alias',value=>{value.identityAuthority.aliasesAllowed=true;},'PLANET_PROFILE_AUTHORITY_INVALID'],
    ['planet-order',value=>{value.profiles.reverse();},'PLANET_PROFILE_RECORD_COVERAGE_INVALID'],
    ['fact-biome',value=>{value.profiles[0].sourceFacts.biome='invented';},'PLANET_PROFILE_SOURCE_FACT_DRIFT'],
    ['fact-site',value=>{value.profiles[0].sourceFacts.discoveryRecords.pop();},'PLANET_PROFILE_SOURCE_FACT_DRIFT'],
    ['support-drone-loss',value=>{value.unitEnvelopeFacts.small_unit_combined.allowed.splice(1,1);},'PLANET_PROFILE_ENVELOPE_SOURCE_DRIFT'],
    ['standard-promotion',value=>{value.profiles[0].mapSizeConcepts[2].recommendationStatus='ACTIVE';},'PLANET_PROFILE_UNPROVEN_STANDARD_SURFACE'],
    ['map-runtime',value=>{value.profiles[0].mapSizeConcepts[0].planetRuntimeBinding=true;},'PLANET_PROFILE_MAP_RUNTIME_BOUND'],
    ['platform-asset',value=>{value.profiles[0].planningRecommendations.floatingSeaPlatforms.generatedPlatformAssetsKnown=true;},'PLANET_PROFILE_PLATFORM_ASSET_CLAIMED'],
    ['unsupported-platform',value=>{value.profiles[1].planningRecommendations.floatingSeaPlatforms.status='CONDITIONAL_AUTHORING_RECOMMENDATION';},'PLANET_PROFILE_UNSUPPORTED_PLATFORM_POLICY'],
    ['evidence-pass',value=>{value.profiles[0].evidenceState.otherRequiredGates='PASS';},'PLANET_PROFILE_EVIDENCE_FALSE_GREEN'],
    ['asset-claim',value=>{value.assetClaims.models.push('fake');},'PLANET_PROFILE_ASSET_OR_CANON_CLAIMED'],
    ['record-unknown',value=>{value.profiles[0].modelPath='fake.glb';},'PLANET_PROFILE_RECORD_UNKNOWN_FIELD']
  ];
  for(const [id,mutate,expected] of faults){
    const candidate=clone(catalog);mutate(candidate);const result=validate(candidate,sources);
    record('fault.'+id,result.ok===false&&result.error?.code===expected,{expected,actual:result.error?.code});
  }
  const repeat=validate(clone(catalog),sources);
  record('determinism.semantic-hash',base.ok&&repeat.ok&&base.semanticHash===repeat.semanticHash,
    {first:base.semanticHash,second:repeat.semanticHash});
}catch(error){fatal=error?.stack||String(error);record('tool.fatal',false,{error:fatal});}

const failed=checks.filter(row=>row.status!=='PASS');
console.log(`Stage 10 exploration planet layout profiles: ${failed.length?'FAIL':'PASS'} ${checks.length-failed.length}/${checks.length}`);
for(const row of failed) console.error(`FAIL ${row.id}: ${JSON.stringify(row)}`);
if(fatal) console.error(fatal);
if(failed.length) process.exitCode=1;
