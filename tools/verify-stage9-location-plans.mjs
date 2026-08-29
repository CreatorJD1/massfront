#!/usr/bin/env node
/* Deterministic, source-bound Stage 9 location-plan verification.
   This is deliberately a pure-catalog gate: seeded planner execution and
   runtime topology remain separate evidence lanes until the plans are wired. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertPlannerConstants,sweepTemplate} from './mapgen/stamp-geometry.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  gl:'src/engine/gl.js',grammar:'assets/data/locationgrammar.js',
  templates:'assets/data/sitetemplates.js',stage9:'assets/data/sitetemplates-stage9.js',
  plans:'assets/data/locationplans.js',sim:'src/game/sim.js',
  manifest:'assets/data/manifest.json',boot:'boot.js',index:'index.html',
  stamp:'tools/mapgen/stamp-geometry.mjs',tool:'tools/verify-stage9-location-plans.mjs'
};
const CLASSIC_ORDER=[REL.grammar,REL.templates,REL.stage9,REL.plans];
const BASE_CLASSIC_ORDER=[REL.grammar,REL.templates];
const EXPECTED_TEMPLATES={
  city_pyraeth_caldera_crucible_v1:'city',
  outpost_nordhall_frost_fault_gate_v1:'outpost',
  relic_nordhall_frost_thermal_well_v1:'relic',
  spaceport_pyraeth_flats_blackwind_v1:'spaceport',
  derelict_pyraeth_flats_buried_logistics_v1:'derelict',
  colony_aelos_basin_canal_v1:'colony',
  refinery_aelos_basin_quay_v1:'refinery',
  base_aelos_coast_admiralty_v1:'base',
  ruin_vespera_refinery_megaforge_v1:'ruin',
  brood_vespera_refinery_matrix_core_v1:'brood'
};
const EXPECTED_PLAN_MAPS=[
  'aelos_basin_medium','aelos_coast_medium','nordhall_frost_medium',
  'pyraeth_caldera_medium','pyraeth_flats_medium','vespera_refinery_medium'
];
const EXPECTED_PLANS={
  pyraeth_caldera_medium:{region:'pyraeth_caldera',requests:[
    {id:'pyraeth_caldera_medium_city',source:'sitesV1',count:2,siteClass:'city',layoutClass:'city',
      template:'city_pyraeth_caldera_crucible_v1',purpose:'city',era:'occupied',condition:'pressurized'}
  ]},
  nordhall_frost_medium:{region:'nordhall_frost',requests:[
    {id:'nordhall_frost_medium_outpost',source:'sitesV1',count:1,siteClass:'outpost',layoutClass:'outpost',
      template:'outpost_nordhall_frost_fault_gate_v1',purpose:'outpost',era:'frontier',condition:'operational'},
    {id:'nordhall_frost_medium_relic',source:'sitesV1',count:1,siteClass:'relic',layoutClass:'relic',
      template:'relic_nordhall_frost_thermal_well_v1',purpose:'relic',era:'legacy',condition:'derelict'}
  ]},
  pyraeth_flats_medium:{region:'pyraeth_flats',requests:[
    {id:'pyraeth_flats_medium_spaceport',source:'sitesV1',count:2,siteClass:'spaceport',layoutClass:'spaceport',
      template:'spaceport_pyraeth_flats_blackwind_v1',purpose:'spaceport',era:'occupied',condition:'exposed'},
    {id:'pyraeth_flats_medium_derelict',source:'sitesV1',count:1,siteClass:'derelict',layoutClass:'derelict',
      template:'derelict_pyraeth_flats_buried_logistics_v1',purpose:'derelict',era:'abandoned',condition:'derelict'}
  ]},
  aelos_basin_medium:{region:'aelos_basin',requests:[
    {id:'aelos_basin_medium_colony',source:'sitesV1',count:2,siteClass:'colony',layoutClass:'colony',
      template:'colony_aelos_basin_canal_v1',purpose:'colony',era:'frontier',condition:'operational'},
    {id:'aelos_basin_medium_refinery',source:'sitesV1',count:2,siteClass:'refinery',layoutClass:'refinery',
      template:'refinery_aelos_basin_quay_v1',purpose:'refinery',era:'occupied',condition:'operational'}
  ]},
  aelos_coast_medium:{region:'aelos_coast',requests:[
    {id:'aelos_coast_medium_base',source:'sitesV1',count:2,siteClass:'base',layoutClass:'base',
      template:'base_aelos_coast_admiralty_v1',purpose:'military-base',era:'occupied',condition:'garrisoned'}
  ]},
  vespera_refinery_medium:{region:'vespera_refinery',requests:[
    {id:'vespera_refinery_medium_ruin',source:'sitesV1',count:1,siteClass:'ruin',layoutClass:'ruin',
      template:'ruin_vespera_refinery_megaforge_v1',purpose:'ruin',era:'ruin',condition:'infested'},
    {id:'vespera_refinery_medium_brood',source:'sitesV1',count:2,siteClass:'brood',layoutClass:'brood',
      template:'brood_vespera_refinery_matrix_core_v1',purpose:'brood-site',era:'conversion',condition:'consumed'}
  ]}
};
const EXACT_FIELDS=['map','planet','climate','biome','region','geology','adaptation',
  'faction','purpose','era','condition'];
const KIT_ROLES=new Set(['gatehouse','watchtower','barracks','depot','tower','block','gauss']);
const REQUIRED_TOPOLOGY={
  temperate_civic:['graded-civic-terraces','service-grid','storm-drainage'],
  volcanic:['elevated-causeways','geothermal-trenches','ash-road-grid'],
  glacial:['thermal-corridors','enclosed-transit','snow-berms'],
  desert:['wind-walls','buried-service-routes','shade-lanes'],
  jungle_wetland:['raised-canopy-routes','drainage-channels','pylon-grid'],
  oceanic:['sea-walls','raised-causeways','floating-service-lanes']
};
const REQUIRED_GEOMETRY={
  temperate_civic:['retaining-walls','transit-aprons','utility-ducts'],
  volcanic:['basalt-foundations','refractory-structures','heat-shielding'],
  glacial:['ice-anchors','insulated-foundations','fracture-bridges'],
  desert:['sand-anchors','shade-structures','sealed-utility-vaults'],
  jungle_wetland:['deep-pylons','water-shedding-decks','root-clear-bridges'],
  oceanic:['pressure-systems','storm-anchors','raised-platforms']
};
const REQUIRED_BROOD={
  topology:['road-vein-conversion','traversal-membranes','nest-channels'],
  geometry:['building-cocoons','organic-buttresses','hatchery-overgrowth']
};
const checks=[];

function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function stable(value){
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
}
function sameList(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
function record(id,ok,details={}){
  checks.push({id,status:ok?'PASS':'FAIL',...details});
  return ok;
}
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

const sourceText={};
for(const rel of Object.values(REL)) sourceText[rel]=fs.readFileSync(path.join(ROOT,rel),'utf8');
const glCatalogSource=['MAPDEFS','PLANETS','BIOME_KITS']
  .map(name=>extractConst(sourceText[REL.gl],name)).join('\n');

function makeContext(mutation='',order=CLASSIC_ORDER){
  const sandbox={console,__stage9RandomCalls:0};
  sandbox.Math=Object.create(Math);
  sandbox.Math.random=()=>{ sandbox.__stage9RandomCalls++; return .5; };
  const context=vm.createContext(sandbox);
  vm.runInContext(glCatalogSource,context,{filename:REL.gl+'#catalog-slices',timeout:10000});
  for(const rel of order)
    vm.runInContext(sourceText[rel],context,{filename:rel,timeout:10000});
  if(mutation) vm.runInContext(mutation,context,{filename:'stage9-location-fault.js',timeout:10000});
  return context;
}
function readJson(context,expression){
  const bytes=vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000});
  if(typeof bytes!=='string') throw new Error('VM expression was not JSON serializable: '+expression);
  return JSON.parse(bytes);
}
function readBytes(context,expression){
  return vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000});
}
function stateBytes(context){
  return readBytes(context,'({MAPDEFS,PLANETS,BIOME_KITS,WorldLocationStyleV1,LocationGrammarV1,'+
    'PlanetAdaptationV1,FactionOccupationV1,ConditionVariantV1,SITE_TPL,SITE_TPL_STAGE9_V1,'+
    'LocationMapPlanV1})');
}
function preflightBytes(context,map){
  return readBytes(context,'mfPreflightLocationPlanV1('+JSON.stringify(map)+')');
}
function normalizedScript(value){
  return String(value||'').replace(/^\.\//,'').replaceAll('\\','/').toLowerCase();
}
function bootManifest(source){
  const hit=/var MANIFEST=(\[[\s\S]*?\]);/.exec(source);
  if(!hit) throw new Error('boot.js MANIFEST declaration missing');
  const value=vm.runInNewContext(hit[1],Object.create(null),{timeout:10000});
  if(!Array.isArray(value)) throw new Error('boot.js MANIFEST is not an array');
  return Array.from(value,normalizedScript);
}

let fatal=null;
try{
  const context=makeContext();
  const catalog=readJson(context,'({templates:SITE_TPL_STAGE9_V1,required:LocationGrammarV1.requiredSiteClasses,'+
    'families:PlanetAdaptationV1.families,brood:PlanetAdaptationV1.broodConversion,'+
    'registered:Object.keys(SITE_TPL_STAGE9_V1).map(id=>({id:id,v1Only:SITE_TPL[id].v1Only,'+
    'same:SITE_TPL[id]===SITE_TPL_STAGE9_V1[id]})),plans:LocationMapPlanV1.plans})');

  const manifestOrder=JSON.parse(sourceText[REL.manifest]).order.map(normalizedScript);
  const bootOrder=bootManifest(sourceText[REL.boot]);
  const manifestUnique=new Set(manifestOrder),bootUnique=new Set(bootOrder);
  record('source.manifest-boot-exact-order',sameList(manifestOrder,bootOrder)&&
    manifestUnique.size===manifestOrder.length&&bootUnique.size===bootOrder.length,
  {manifestCount:manifestOrder.length,bootCount:bootOrder.length,
    manifestUnique:manifestUnique.size,bootUnique:bootUnique.size});
  const chain=[REL.grammar,REL.templates,REL.stage9,REL.plans,'src/engine/worldsites.js'].map(normalizedScript);
  const chainAt=manifestOrder.indexOf(chain[0]);
  record('source.stage9-runtime-chain',chainAt>=0&&sameList(manifestOrder.slice(chainAt,chainAt+chain.length),chain)&&
    sameList(bootOrder.slice(chainAt,chainAt+chain.length),chain),{index:chainAt,chain:chain});
  const rev=(/var PACKAGED_REV='([^']+)'/.exec(sourceText[REL.boot])||[])[1]||'';
  const suffix=(/var PACKAGED_SRC_REV=PACKAGED_REV\+'([^']+)'/.exec(sourceText[REL.boot])||[])[1]||'';
  record('source.boot-cache-revision',!!rev&&!!suffix&&
    sourceText[REL.index].includes('./boot.js?v='+rev+suffix),{revision:rev+suffix});
  const templateIds=Object.keys(catalog.templates).sort(),expectedIds=Object.keys(EXPECTED_TEMPLATES).sort();
  record('catalog.exact-template-ids',sameList(templateIds,expectedIds),{count:templateIds.length,ids:templateIds});
  const catalogClasses=[...new Set(templateIds.map(id=>catalog.templates[id].class))].sort();
  const requiredClasses=[...catalog.required].sort();
  record('catalog.exact-class-union',templateIds.length===10&&sameList(catalogClasses,requiredClasses)&&
    expectedIds.every(id=>catalog.templates[id].class===EXPECTED_TEMPLATES[id]),
  {classes:catalogClasses,required:requiredClasses});
  record('catalog.v1-only-registration',catalog.registered.length===expectedIds.length&&
    catalog.registered.every(row=>row.v1Only===true&&row.same===true),{registered:catalog.registered});

  const exactProblems=[],plotProblems=[],broodRuinProblems=[];
  for(const id of templateIds){
    const T=catalog.templates[id];
    for(const field of EXACT_FIELDS) if(typeof T[field]!=='string'||!T[field]||T[field]==='any')
      exactProblems.push(id+':'+field);
    if(!Array.isArray(T.plots)||!T.plots.length) plotProblems.push(id+':plots-empty');
    for(let i=0;i<(T.plots||[]).length;i++){
      const P=T.plots[i],tag=id+':plot-'+i;
      if(!P||!Number.isInteger(P.kind)||P.kind<0||P.kind>7) plotProblems.push(tag+':kind');
      if(P&&P.role!=null&&(!(P.kind===6||P.kind===7)||typeof P.role!=='string'||!KIT_ROLES.has(P.role)))
        plotProblems.push(tag+':role');
      if(P&&(P.kind===6||P.kind===7)&&(typeof P.role!=='string'||!KIT_ROLES.has(P.role)))
        plotProblems.push(tag+':kit-role');
      if(P&&(T.class==='brood'||T.class==='ruin')&&(P.kind===6||P.kind===7))
        broodRuinProblems.push(tag);
    }
  }
  record('catalog.exact-fields',!exactProblems.length,{problems:exactProblems});
  record('catalog.plot-kinds-and-roles',!plotProblems.length,{problems:plotProblems});
  record('catalog.brood-ruin-no-kit-geometry',!broodRuinProblems.length,{problems:broodRuinProblems});

  const plannerConstants=assertPlannerConstants(sourceText[REL.sim]);
  record('geometry.production-constants',plannerConstants.ok,{missing:plannerConstants.missing});
  const geometryRows=[],geometryFailures=[];
  for(const id of templateIds){
    const T=catalog.templates[id];T.id=id;
    const sweep=sweepTemplate(T);
    geometryRows.push({id:id,pass:sweep.pass,total:sweep.total});
    for(const row of sweep.rows) if(!row.ok) geometryFailures.push({id:id,ga:row.ga,
      reason:row.reason,requiredRole:row.requiredRole,firstRequired:row.firstRequired});
  }
  record('geometry.stage9-all-rotations',!geometryFailures.length&&
    geometryRows.every(row=>row.pass===16&&row.total===16),
  {templates:geometryRows,failures:geometryFailures});

  const baseContext=makeContext('',BASE_CLASSIC_ORDER),legacyIsolation=[];
  for(const id of templateIds){
    const T=catalog.templates[id],ctx={map:T.map,planet:T.planet,climate:T.climate,biome:T.biome,
      faction:T.faction,purpose:T.purpose,era:T.era,condition:T.condition};
    const expression='siteTemplatePool('+JSON.stringify(T.class)+','+JSON.stringify(ctx)+').ids';
    const beforeIds=readJson(baseContext,expression),afterIds=readJson(context,expression);
    legacyIsolation.push({id:id,before:beforeIds,after:afterIds,unchanged:stable(beforeIds)===stable(afterIds),
      leaked:afterIds.includes(id)});
  }
  record('catalog.legacy-pools-unchanged',legacyIsolation.every(row=>row.unchanged&&!row.leaked),
    {templates:legacyIsolation});
  const forceContext=makeContext(),forceBypass=[];
  for(const id of templateIds){
    const T=catalog.templates[id],ctx={map:T.map,planet:T.planet,climate:T.climate,biome:T.biome,
      faction:T.faction,purpose:T.purpose,era:T.era,condition:T.condition};
    const prefix='SITE_TPL_QUERY.context='+JSON.stringify(ctx)+';';
    const direct=vm.runInContext(prefix+'SITE_TPL_QUERY.force=null;SITE_TPL_FORCE='+JSON.stringify(id)+';'+
      'siteTemplateFor('+JSON.stringify(T.class)+',()=>0)===SITE_TPL_STAGE9_V1['+JSON.stringify(id)+']',
    forceContext,{timeout:10000});
    const query=vm.runInContext(prefix+'SITE_TPL_FORCE=null;SITE_TPL_QUERY.force='+JSON.stringify(id)+';'+
      'siteTemplateFor('+JSON.stringify(T.class)+',()=>0)===SITE_TPL_STAGE9_V1['+JSON.stringify(id)+']',
    forceContext,{timeout:10000});
    forceBypass.push({id:id,direct:direct,query:query});
  }
  record('catalog.v1-force-path-isolated',forceBypass.every(row=>!row.direct&&!row.query),
    {templates:forceBypass});

  const familyNames=Object.keys(catalog.families).sort(),requiredFamilyNames=Object.keys(REQUIRED_TOPOLOGY).sort();
  const familyProblems=[];
  for(const id of requiredFamilyNames){
    const F=catalog.families[id];
    if(!F||!sameList(F.topology,REQUIRED_TOPOLOGY[id])||!sameList(F.geometry,REQUIRED_GEOMETRY[id]))
      familyProblems.push(id);
  }
  record('grammar.six-base-families',sameList(familyNames,requiredFamilyNames)&&!familyProblems.length,
    {families:familyNames,problems:familyProblems});
  record('grammar.brood-conversion-features',!!catalog.brood&&
    sameList(catalog.brood.topology,REQUIRED_BROOD.topology)&&
    sameList(catalog.brood.geometry,REQUIRED_BROOD.geometry),
  {topology:catalog.brood&&catalog.brood.topology,geometry:catalog.brood&&catalog.brood.geometry});

  const planMaps=Object.keys(catalog.plans).sort();
  record('plans.exact-six-map-slice',sameList(planMaps,EXPECTED_PLAN_MAPS),{maps:planMaps});
  const authoredProblems=[];
  for(const map of EXPECTED_PLAN_MAPS){
    const actual=catalog.plans[map],expected=EXPECTED_PLANS[map];
    if(!actual||actual.schema!=='LocationMapPlanV1'||actual.version!==1||actual.map!==map||
      actual.region!==expected.region||actual.mode!=='v1'||stable(actual.requests)!==stable(expected.requests))
      authoredProblems.push(map);
  }
  const authoredInstances=EXPECTED_PLAN_MAPS.reduce((total,map)=>total+
    EXPECTED_PLANS[map].requests.reduce((n,Q)=>n+Q.count,0),0);
  record('plans.exact-authored-requests',!authoredProblems.length&&authoredInstances===16,
    {instances:authoredInstances,problems:authoredProblems});
  const randomBefore=context.__stage9RandomCalls;
  const before=stateBytes(context),results=[],determinism=[];
  for(const map of EXPECTED_PLAN_MAPS){
    const first=preflightBytes(context,map),second=preflightBytes(context,map);
    const value=JSON.parse(first);
    results.push(value);
    determinism.push({map,byteHash:digest(first),planHash:value.planHash,identical:first===second});
    record('plan.'+map+'.full-v1',value.ok===true&&value.status==='FULL_V1'&&
      /^[0-9a-f]{8}$/.test(value.planHash)&&Array.isArray(value.requests)&&value.requests.length>0,
    {status:value.status,planHash:value.planHash,compiled:value.requests.length});
    record('plan.'+map+'.repeatable-bytes',first===second&&value.planHash===JSON.parse(second).planHash,
      {byteHash:digest(first),planHash:value.planHash});
  }
  const after=stateBytes(context);
  record('plans.preflight-pure',before===after,{beforeHash:digest(before),afterHash:digest(after)});
  record('plans.preflight-zero-rng',context.__stage9RandomCalls===randomBefore,
    {before:randomBefore,after:context.__stage9RandomCalls});
  record('plans.unique-hashes',new Set(results.map(r=>r.planHash)).size===EXPECTED_PLAN_MAPS.length,
    {hashes:results.map(r=>r.planHash)});

  const semanticProblems=[],topologyProblems=[],compiled=[];
  const sliceFamilies=new Set();
  let broodTrack=true,broodOverlayCount=0;
  for(const map of EXPECTED_PLAN_MAPS){
    const plan=catalog.plans[map],result=results.find(r=>r.map===map);
    const expectedCount=EXPECTED_PLANS[map].requests.reduce((n,q)=>n+q.count,0);
    if(!result||result.requests.length!==expectedCount) semanticProblems.push(map+':compiled-count');
    for(const Q of plan.requests){
      const T=catalog.templates[Q.template];
      if(!T){semanticProblems.push(Q.id+':template');continue;}
      if(T.map!==plan.map||T.region!==plan.region||T.class!==Q.siteClass||Q.layoutClass!==Q.siteClass)
        semanticProblems.push(Q.id+':binding');
      for(const field of ['purpose','era','condition']) if(Q[field]!==T[field])
        semanticProblems.push(Q.id+':'+field);
      const hit=readJson(context,'mfResolveWorldLocationStyleV1('+JSON.stringify(map)+','+
        JSON.stringify({purpose:Q.purpose,era:Q.era,condition:Q.condition})+')');
      if(!hit.ok){semanticProblems.push(Q.id+':resolver');continue;}
      const V=hit.value;
      const expected={map,planet:V.planet,climate:V.biome,biome:V.biome,region:V.region,
        geology:V.geology,adaptation:V.adaptation.id,faction:V.faction,
        purpose:V.purpose,era:V.era,condition:V.condition};
      for(const field of EXACT_FIELDS) if(T[field]!==expected[field])
        semanticProblems.push(Q.id+':style-'+field);
      const validated=readJson(context,'mfValidateWorldLocationStyleV1('+JSON.stringify(V)+')');
      if(!validated.ok) semanticProblems.push(Q.id+':schema-validator');
      const family=catalog.families[T.adaptation];sliceFamilies.add(T.adaptation);
      if(!family||!sameList(T.topology,family.topology)||!sameList(T.geometry,family.geometry))
        topologyProblems.push(Q.id+':base-features');
      if(!sameList(V.tacticalScales,['infantry','smallVehicle','mech']))
        topologyProblems.push(Q.id+':tactical-scales');
      if(V.adaptation.broodConversion){
        broodOverlayCount++;
        const overlayOk=!!T.broodConversion&&
          sameList(T.broodConversion.topology,REQUIRED_BROOD.topology)&&
          sameList(T.broodConversion.geometry,REQUIRED_BROOD.geometry)&&
          sameList(V.adaptation.broodConversion.topology,REQUIRED_BROOD.topology)&&
          sameList(V.adaptation.broodConversion.geometry,REQUIRED_BROOD.geometry);
        if(!overlayOk){ broodTrack=false; topologyProblems.push(Q.id+':brood-features'); }
      }else if(T.broodConversion){
        broodTrack=false;topologyProblems.push(Q.id+':unexpected-brood-features');
      }
    }
    compiled.push(...(result?result.requests:[]));
  }
  record('plans.request-template-independent-semantics',!semanticProblems.length,{problems:semanticProblems});
  record('plans.topology-and-tactical-scale',!topologyProblems.length,{problems:topologyProblems});
  const expectedSliceFamilies=['desert','glacial','jungle_wetland','oceanic','volcanic'];
  record('plans.six-adaptation-tracks',sameList([...sliceFamilies].sort(),expectedSliceFamilies)&&
    broodTrack&&broodOverlayCount===2,
  {baseFamilies:[...sliceFamilies].sort(),broodConversion:broodTrack,broodOverlayRequests:broodOverlayCount});
  const compiledClasses=[...new Set(compiled.map(r=>r.siteClass))].sort();
  const signatureClasses=new Set(compiled.map(r=>r.siteClass+':'+r.semanticSignature));
  record('plans.ten-compiled-semantic-classes',compiled.length===16&&sameList(compiledClasses,requiredClasses)&&
    signatureClasses.size===requiredClasses.length,
  {compiledInstances:compiled.length,classes:compiledClasses,semanticClassSignatures:signatureClasses.size});

  const faults=[
    {id:'template-missing',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_MISSING',
      mutate:"LocationMapPlanV1.plans.pyraeth_caldera_medium.requests[0].template='missing_stage9_template'"},
    {id:'wrong-class',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_CLASS_MISMATCH',
      mutate:"SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.class='outpost'"},
    {id:'not-v1-only',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_NOT_V1_ONLY',
      mutate:'SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.v1Only=false'},
    {id:'any-field',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_NOT_EXACT',
      mutate:"SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.faction='any'"},
    {id:'invalid-seed',map:'pyraeth_caldera_medium',code:'LOCATION_MAP_SEED_INVALID',
      mutate:'MAPDEFS.pyraeth_caldera_medium.seed=NaN'},
    {id:'invalid-radius',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_LAYOUT_INVALID',
      mutate:'SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.radius=0'},
    {id:'invalid-street',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_LAYOUT_INVALID',
      mutate:'SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.streets[0].pop()'},
    {id:'map-drift',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_STYLE_MISMATCH',
      mutate:"SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.map='pyraeth_caldera_small'"},
    {id:'region-drift',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_STYLE_MISMATCH',
      mutate:"SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.region='pyraeth_belt'"},
    {id:'geology-drift',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_STYLE_MISMATCH',
      mutate:"SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.geology='impact-basalt-caldera'"},
    {id:'adaptation-drift',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_STYLE_MISMATCH',
      mutate:"SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.adaptation='temperate_civic'"},
    {id:'brood-overlay-missing',map:'vespera_refinery_medium',code:'LOCATION_TEMPLATE_BROOD_CONVERSION_MISMATCH',
      mutate:'delete SITE_TPL_STAGE9_V1.ruin_vespera_refinery_megaforge_v1.broodConversion'},
    {id:'brood-overlay-unexpected',map:'pyraeth_caldera_medium',code:'LOCATION_TEMPLATE_BROOD_CONVERSION_UNEXPECTED',
      mutate:'SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.broodConversion='+
        'JSON.parse(JSON.stringify(PlanetAdaptationV1.broodConversion))'},
    {id:'duplicate-id',map:'nordhall_frost_medium',code:'LOCATION_REQUEST_ID_DUPLICATE',
      mutate:'LocationMapPlanV1.plans.nordhall_frost_medium.requests[1].id='+
        'LocationMapPlanV1.plans.nordhall_frost_medium.requests[0].id'},
    {id:'bad-count',map:'pyraeth_caldera_medium',code:'LOCATION_COUNT_INVALID',
      mutate:'LocationMapPlanV1.plans.pyraeth_caldera_medium.requests[0].count=0'},
    {id:'bad-source',map:'pyraeth_caldera_medium',code:'LOCATION_COUNT_SOURCE_INVALID',
      mutate:"LocationMapPlanV1.plans.pyraeth_caldera_medium.requests[0].source='MAPDEFS.city'"},
    {id:'bad-mode',map:'pyraeth_caldera_medium',code:'LOCATION_PLAN_MODE_INVALID',
      mutate:"LocationMapPlanV1.plans.pyraeth_caldera_medium.mode='legacy'"}
  ];
  for(const fault of faults){
    const faultContext=makeContext(fault.mutate),faultBefore=stateBytes(faultContext);
    const value=JSON.parse(preflightBytes(faultContext,fault.map)),faultAfter=stateBytes(faultContext);
    const typed=value&&value.ok===false&&value.status==='FAIL'&&value.planHash===''&&
      Array.isArray(value.requests)&&value.requests.length===0&&value.error&&
      value.error.schema==='LocationPlanningErrorV1'&&value.error.version===1&&value.error.code===fault.code;
    record('fault.'+fault.id,!!typed&&faultBefore===faultAfter&&faultContext.__stage9RandomCalls===0,
      {expected:fault.code,actual:value&&value.error&&value.error.code,pure:faultBefore===faultAfter,
        rngCalls:faultContext.__stage9RandomCalls});
  }

  const canonicalPyraeth=JSON.parse(preflightBytes(context,'pyraeth_caldera_medium'));
  const layoutHashContext=makeContext(
    'SITE_TPL_STAGE9_V1.city_pyraeth_caldera_crucible_v1.props[0].x-=1');
  const layoutHash=JSON.parse(preflightBytes(layoutHashContext,'pyraeth_caldera_medium'));
  record('plans.layout-hash-sensitive',layoutHash.ok===true&&layoutHash.status==='FULL_V1'&&
    layoutHash.planHash!==canonicalPyraeth.planHash,
  {before:canonicalPyraeth.planHash,after:layoutHash.planHash});
  const seedHashContext=makeContext('MAPDEFS.pyraeth_caldera_medium.seed+=1');
  const seedHash=JSON.parse(preflightBytes(seedHashContext,'pyraeth_caldera_medium'));
  record('plans.seed-hash-sensitive',seedHash.ok===true&&seedHash.status==='FULL_V1'&&
    seedHash.planHash!==canonicalPyraeth.planHash,
  {before:canonicalPyraeth.planHash,after:seedHash.planHash});

  const unknown=JSON.parse(preflightBytes(context,'stage9_unknown_map'));
  const legacy=JSON.parse(preflightBytes(context,'vanguard'));
  const pending=JSON.parse(preflightBytes(context,'aelos_north_medium'));
  const unknownStyle=readJson(context,"mfResolveWorldLocationStyleV1('stage9_unknown_map',"+
    "{purpose:'city',era:'occupied',condition:'intact'})");
  const legacyStyle=readJson(context,"mfResolveWorldLocationStyleV1('vanguard',"+
    "{purpose:'city',era:'occupied',condition:'intact'})");
  const unknownTyped=!!unknown&&unknown.ok===false&&unknown.status==='FAIL'&&!!unknown.error&&
    unknown.error.schema==='LocationPlanningErrorV1'&&unknown.error.version===1&&
    unknown.error.code==='LOCATION_MAP_UNKNOWN';
  const unknownEmpty=unknown.planHash===''&&Array.isArray(unknown.requests)&&unknown.requests.length===0;
  record('inactive.unknown-map-typed',unknownTyped&&unknownEmpty,{result:unknown});
  record('inactive.legacy-map-non-v1',legacy.ok===true&&legacy.status==='LEGACY_V0'&&
    !legacy.requests.length&&legacy.planHash===''&&!JSON.stringify(legacy).includes('aelos'),
  {status:legacy.status});
  record('inactive.pending-map-non-v1',pending.ok===true&&pending.status==='PENDING_V0'&&
    !pending.requests.length&&pending.planHash==='',{status:pending.status,map:pending.map});
  record('inactive.no-aelos-resolver-default',unknownStyle.ok===false&&!unknownStyle.value&&
    legacyStyle.ok===false&&!legacyStyle.value&&!JSON.stringify(unknownStyle).includes('aelos')&&
    !JSON.stringify(legacyStyle).includes('aelos'),
  {unknownCode:unknownStyle.error&&unknownStyle.error.code,legacyCode:legacyStyle.error&&legacyStyle.error.code});
  record('plans.determinism-summary',determinism.every(row=>row.identical),{plans:determinism});
}catch(error){
  fatal={name:error&&error.name||'Error',message:error&&error.message||String(error),stack:error&&error.stack||''};
  record('fatal',false,{message:fatal.message});
}

const sourceBindings={};
for(const rel of Object.values(REL)) sourceBindings[rel]={
  sha256:digest(sourceText[rel]),bytes:Buffer.byteLength(sourceText[rel])
};
sourceBindings[REL.gl].catalogSliceSha256=digest(glCatalogSource);
const failed=checks.filter(c=>c.status==='FAIL');
const report={
  schemaVersion:1,kind:'MassfrontStage9LocationPlanVerificationV1',
  status:failed.length?'FAIL':'PASS',
  sourceBound:{gitHead:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    sourceSetSha256:digest(stable(sourceBindings)),files:sourceBindings},
  summary:{checks:checks.length,passed:checks.length-failed.length,failed:failed.length,
    plans:EXPECTED_PLAN_MAPS.length,templates:Object.keys(EXPECTED_TEMPLATES).length},
  checks,fatal,
  pending:[
    {scope:'planner-execution',status:'PENDING',reason:'Pure preflight does not execute seeded map planning.'},
    {scope:'runtime-topology',status:'PENDING',reason:'Catalog topology has not yet been stamped and observed in the live renderer.'}
  ]
};
const outDir=path.join(ROOT,'.tmp','stage9-location-plans'),outFile=path.join(outDir,'report.json');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n');
console.log('Stage 9 location plans: '+report.status+' ('+report.summary.passed+'/'+report.summary.checks+')');
console.log('Source set: '+report.sourceBound.sourceSetSha256);
console.log('Report: '+path.relative(ROOT,outFile).replaceAll('\\','/'));
console.log('Planner execution: PENDING');
console.log('Runtime topology: PENDING');
if(failed.length){
  for(const item of failed) console.error('FAIL '+item.id+(item.message?': '+item.message:''));
  process.exitCode=1;
}
