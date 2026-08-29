#!/usr/bin/env node
/* Source-bound Stage 10 orbital verification. The candidate catalog is
   deliberately absent from both runtime loaders; this gate evaluates it as a
   classic script, source-matches all six showcase contacts, proves restricted
   envelopes and deterministic recovery, then injects fail-closed faults. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  theatre:'assets/data/theatreprofiles-stage10.js',
  orbital:'assets/data/orbitaltopology-stage10.js',
  showcase:'modules/space_exploration/src/systems/showcase_systems.js',
  manifest:'assets/data/manifest.json',boot:'boot.js',
  tool:'tools/verify-stage10-orbital-topology.mjs'
};
const TARGET='aelos_embassy_spindle';
const checks=[];

function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function record(id,ok,details={}){
  checks.push({id,...details,status:ok?'PASS':'FAIL'});
  return ok;
}
function sameList(a,b){
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>value===b[index]);
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

const sourceText={};
for(const rel of Object.values(REL)) sourceText[rel]=fs.readFileSync(path.join(ROOT,rel),'utf8');

function makeContext(mutation='',includeTheatre=true){
  const sandbox={console,__stage10OrbitalRandomCalls:0};
  sandbox.Math=Object.create(Math);
  sandbox.Math.random=()=>{sandbox.__stage10OrbitalRandomCalls++;return .5;};
  const context=vm.createContext(sandbox);
  if(includeTheatre) vm.runInContext(sourceText[REL.theatre],context,{filename:REL.theatre,timeout:10000});
  vm.runInContext(sourceText[REL.orbital],context,{filename:REL.orbital,timeout:10000});
  if(mutation) vm.runInContext(mutation,context,{filename:'stage10-orbital-fault.js',timeout:10000});
  return context;
}
function readJson(context,expression){
  const bytes=vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000});
  if(typeof bytes!=='string') throw new Error('VM expression was not JSON serializable: '+expression);
  return JSON.parse(bytes);
}
function preflight(context,seed=TARGET){
  return readJson(context,'mfPreflightStage10OrbitalTopologyV1('+JSON.stringify(seed)+')');
}

let fatal=null;
try{
  const showcase=(await import(pathToFileURL(path.join(ROOT,REL.showcase)).href+'?stage10orbital='+Date.now())).SHOWCASE_SYSTEMS;
  const context=makeContext(),catalog=readJson(context,'Stage10OrbitalTopologyV1');
  const theatre=readJson(context,'Stage10TheatreCatalogV1');
  const seedIds=theatre.orbitalLocationSeeds.map(row=>row.id).sort();
  const planIds=Object.keys(catalog.plans).sort();
  const contactMap=new Map();
  for(const [systemId,system] of Object.entries(showcase)){
    for(const contact of system.contacts) contactMap.set(contact.id,{systemId,...contact});
  }
  const manifest=JSON.parse(sourceText[REL.manifest]).order.map(normalizedScript);
  const boot=bootManifest(sourceText[REL.boot]);
  const orbitalPath=normalizedScript(REL.orbital);
  let classicParseError=null;
  try{
    const registered=manifest.map(rel=>fs.readFileSync(path.join(ROOT,rel),'utf8')).join('\n');
    new Function(registered);
  }catch(error){classicParseError=error&&error.stack||String(error);}

  record('classic-script.catalog-evaluates',catalog.schema==='Stage10OrbitalTopologyV1'&&catalog.version===1,
    {schema:catalog.schema,version:catalog.version});
  record('classic-script.full-scope-parse',classicParseError===null,{error:classicParseError});
  record('activation.catalog-fail-closed',catalog.status==='AUTHORING_ONLY'&&catalog.runtimeReady===false&&
    catalog.activation.runtime===false&&catalog.activation.consumer===null,
  {status:catalog.status,runtimeReady:catalog.runtimeReady,activation:catalog.activation});
  record('loader.catalog-registered-both',manifest.includes(orbitalPath)&&boot.includes(orbitalPath)&&
    manifest.indexOf(orbitalPath)===boot.indexOf(orbitalPath),
    {manifestIndex:manifest.indexOf(orbitalPath),bootIndex:boot.indexOf(orbitalPath)});
  record('source.six-seed-exact-coverage',seedIds.length===6&&sameList(seedIds,planIds),
    {seeds:seedIds,plans:planIds});

  const sourceRows=planIds.map(id=>{
    const plan=catalog.plans[id],seed=theatre.orbitalLocationSeeds.find(row=>row.id===id),contact=contactMap.get(id);
    const ok=!!seed&&!!contact&&plan.source.systemId===contact.systemId&&
      plan.source.contactKind===contact.kind&&plan.source.interaction===contact.interaction&&
      (plan.source.siteId||null)===(contact.siteId||null)&&
      (plan.source.jumpTo||null)===(contact.jumpTo||null)&&
      plan.source.theatreClass===seed.class&&plan.source.theatreSize===seed.size&&
      plan.source.theatreEnvelope===seed.envelope;
    return {id,ok,systemId:contact&&contact.systemId,kind:contact&&contact.kind,
      theatreClass:seed&&seed.class,size:seed&&seed.size,envelope:seed&&seed.envelope};
  });
  record('source.showcase-and-theatre-match',sourceRows.every(row=>row.ok),{sources:sourceRows});

  const results=planIds.map(id=>({id,result:preflight(context,id),plan:catalog.plans[id]}));
  record('preflight.all-authoring-candidates',results.every(row=>row.result.ok===true&&
    row.result.status==='AUTHORING_CANDIDATE'&&row.result.summary.runtimeActive===false),
  {passed:results.filter(row=>row.result.ok).length,total:results.length});
  record('topology.four-smallcraft-two-boarding',results.filter(row=>
    row.result.summary.envelope==='orbital_smallcraft'&&row.result.summary.topologyKind==='route_volumes_3d').length===4&&
    results.filter(row=>row.result.summary.envelope==='infantry_boarding'&&row.result.summary.topologyKind==='deck_route_graph').length===2,
  {rows:results.map(row=>({id:row.id,envelope:row.result.summary.envelope,kind:row.result.summary.topologyKind}))});
  record('topology.routes-and-deck-graphs-present',results.every(row=>{
    const summary=row.result.summary;
    return summary.topologyKind==='route_volumes_3d'
      ? summary.routeVolumeCount>=5&&summary.nodeCount===0&&summary.edgeCount===0
      : summary.routeVolumeCount===0&&summary.nodeCount>=5&&summary.edgeCount>=5;
  }),{summaries:results.map(row=>({id:row.id,...row.result.summary}))});
  record('topology.encounter-contract-complete',results.every(row=>{
    const summary=row.result.summary;
    return summary.spawnCount>=2&&summary.insertionCount>=1&&summary.extractionCount>=1&&
      summary.hazardCount>=1&&summary.objectiveCount>=2&&summary.destructibleCount>=1;
  }),{seeds:results.length});

  const heavy=new Set(['frigate','destroyer','cruiser','capital_ship','ground_heavy','titan','heavy_vehicle','artillery','air','naval']);
  record('envelopes.restricted-only',Object.keys(catalog.envelopes).sort().join(',')==='infantry_boarding,orbital_smallcraft'&&
    Object.values(catalog.envelopes).every(envelope=>envelope.allowed.every(unit=>!heavy.has(unit))&&envelope.forbidden.length>0),
  {envelopes:Object.fromEntries(Object.entries(catalog.envelopes).map(([id,value])=>[id,value.allowed]))});
  record('recovery.deterministic-all-plans',results.every(row=>{
    const plan=row.plan;
    return plan.recovery.mode==='deterministic'&&plan.recovery.onFailure==='ROLL_BACK_TO_LAST_COMPLETE_STATE'&&
      sameList(plan.recovery.repairOrder,plan.destructibles.map(item=>item.id))&&
      plan.destructibles.every(item=>item.stateMachine==='deterministic_recovery_v1'&&item.recoveredState==='restored');
  }),{stateMachine:catalog.destructionStateMachine.id,states:catalog.destructionStateMachine.states});
  record('preflight.distinct-deterministic-hashes',new Set(results.map(row=>row.result.topologyHash)).size===6&&
    results.every(row=>preflight(context,row.id).topologyHash===row.result.topologyHash)&&
    readJson(context,'__stage10OrbitalRandomCalls')===0,
  {hashes:Object.fromEntries(results.map(row=>[row.id,row.result.topologyHash])),
    randomCalls:readJson(context,'__stage10OrbitalRandomCalls')});

  const changed=preflight(makeContext(
    "Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.objectives[0].kind='alternate-clearance-handshake'"));
  const base=preflight(context);
  record('preflight.hash-sensitive',changed.ok===true&&changed.topologyHash!==base.topologyHash,
    {before:base.topologyHash,after:changed.topologyHash});
  const unknown=preflight(context,'not_a_massfront_contact');
  record('preflight.unknown-fails-closed',unknown.ok===false&&unknown.error.code==='ORBITAL_TOPOLOGY_SEED_UNKNOWN',
    {actual:unknown.error&&unknown.error.code});
  const missingSource=preflight(makeContext('',false));
  record('preflight.missing-source-catalog-fails-closed',missingSource.ok===false&&
    missingSource.error.code==='ORBITAL_TOPOLOGY_SOURCE_CATALOG_MISSING',
  {actual:missingSource.error&&missingSource.error.code});

  const faults=[
    ['catalog-runtime',"Stage10OrbitalTopologyV1.activation.runtime=true",'ORBITAL_TOPOLOGY_RUNTIME_ENABLED'],
    ['plan-runtime',"Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.activation.runtime=true",'ORBITAL_TOPOLOGY_PLAN_RUNTIME_ENABLED'],
    ['source-class',"Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.source.theatreClass='capital_ship'",'ORBITAL_TOPOLOGY_SOURCE_MISMATCH'],
    ['heavy-envelope',"Stage10OrbitalTopologyV1.envelopes.orbital_smallcraft.allowed.push('destroyer')",'ORBITAL_TOPOLOGY_ENVELOPE_INVALID'],
    ['route-out-of-bounds',"Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.routeVolumes[0].from[0]=-41",'ORBITAL_TOPOLOGY_ROUTE_VOLUME_INVALID'],
    ['route-link',"Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.routeVolumes[1].links=[]",'ORBITAL_TOPOLOGY_ROUTE_LINK_INVALID'],
    ['deck-edge',"Stage10OrbitalTopologyV1.plans.veyra_archive_hulk.deckGraph.edges[0].to='missing_node'",'ORBITAL_TOPOLOGY_EDGE_INVALID','veyra_archive_hulk'],
    ['hazard-reference',"Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.hazards[0].affectedPaths=['missing_path']",'ORBITAL_TOPOLOGY_HAZARD_INVALID'],
    ['objective-reference',"Stage10OrbitalTopologyV1.plans.aelos_embassy_spindle.objectives[0].target='missing_path'",'ORBITAL_TOPOLOGY_OBJECTIVE_INVALID'],
    ['destruction-states',"Stage10OrbitalTopologyV1.destructionStateMachine.states.pop()",'ORBITAL_TOPOLOGY_DESTRUCTION_STATE_MACHINE_INVALID'],
    ['destruction-transition',"Stage10OrbitalTopologyV1.destructionStateMachine.transitions[0]=['intact','destroyed']",'ORBITAL_TOPOLOGY_DESTRUCTION_STATE_MACHINE_INVALID'],
    ['recovery-order',"Stage10OrbitalTopologyV1.plans.aelos_logistics_array.recovery.repairOrder[1]='logistics_fuel_valve'",'ORBITAL_TOPOLOGY_RECOVERY_CONTRACT_INVALID','aelos_logistics_array'],
    ['source-seed',"Stage10TheatreCatalogV1.orbitalLocationSeeds=Stage10TheatreCatalogV1.orbitalLocationSeeds.filter(row=>row.id!=='aelos_embassy_spindle')",'ORBITAL_TOPOLOGY_SOURCE_SEED_UNKNOWN']
  ];
  for(const [name,mutation,code,seed] of faults){
    const result=preflight(makeContext(mutation),seed||TARGET);
    record('fault.'+name,result.ok===false&&result.error&&result.error.code===code,
      {expected:code,actual:result.error&&result.error.code});
  }
}catch(error){
  fatal=error&&error.stack?error.stack:String(error);
  record('tool.fatal',false,{error:fatal});
}

const failed=checks.filter(row=>row.status!=='PASS');
const report={
  schema:'MassfrontStage10OrbitalTopologyVerificationV1',version:1,
  generatedAt:new Date().toISOString(),status:failed.length?'FAIL':'PASS',gitHead:null,target:TARGET,
  checks,summary:{passed:checks.length-failed.length,failed:failed.length,total:checks.length},
  source:{files:Object.fromEntries(Object.entries(REL).map(([name,rel])=>[name,{path:rel,sha256:digest(sourceText[rel])}]))},fatal
};
try{report.gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();}catch{}
const output=path.join(ROOT,'tmp','stage10-orbital-topology','report.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Stage 10 orbital topology: ${report.status} ${report.summary.passed}/${report.summary.total}`);
console.log(`Target ${TARGET}`);
console.log(`Report ${path.relative(ROOT,output).replaceAll('\\','/')}`);
for(const row of failed) console.error(`FAIL ${row.id}: ${JSON.stringify(row)}`);
if(failed.length) process.exitCode=1;
