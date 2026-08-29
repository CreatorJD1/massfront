#!/usr/bin/env node
/* Source-bound Stage 10 topology verification. The catalog remains inert in
   production; this gate proves its authoring contract, deterministic hash,
   manifest registration, maritime support rules, and fail-closed faults. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  gl:'src/engine/gl.js',topology:'assets/data/battlefieldtopology-stage10.js',
  manifest:'assets/data/manifest.json',boot:'boot.js',tool:'tools/verify-stage10-battlefield-topology.mjs'
};
const TARGET='aelos_north_medium';
const checks=[];

function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function record(id,ok,details={}){
  checks.push({id,status:ok?'PASS':'FAIL',...details});
  return ok;
}
function sameList(a,b){
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
}
function normalizedScript(value){
  return String(value||'').replace(/^\.\//,'').replaceAll('\\','/').toLowerCase();
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
function bootManifest(source){
  const hit=/var MANIFEST=(\[[\s\S]*?\]);/.exec(source);
  if(!hit) throw new Error('boot.js MANIFEST declaration missing');
  const value=vm.runInNewContext(hit[1],Object.create(null),{timeout:10000});
  if(!Array.isArray(value)) throw new Error('boot.js MANIFEST is not an array');
  return Array.from(value,normalizedScript);
}

const sourceText={};
for(const rel of Object.values(REL)) sourceText[rel]=fs.readFileSync(path.join(ROOT,rel),'utf8');
const catalogSource=['MAPDEFS','PLANETS'].map(name=>extractConst(sourceText[REL.gl],name)).join('\n');

function makeContext(mutation=''){
  const sandbox={console,__stage10RandomCalls:0};
  sandbox.Math=Object.create(Math);
  sandbox.Math.random=()=>{sandbox.__stage10RandomCalls++;return .5;};
  const context=vm.createContext(sandbox);
  vm.runInContext(catalogSource,context,{filename:REL.gl+'#catalog-slices',timeout:10000});
  vm.runInContext(sourceText[REL.topology],context,{filename:REL.topology,timeout:10000});
  if(mutation) vm.runInContext(mutation,context,{filename:'stage10-topology-fault.js',timeout:10000});
  return context;
}
function readJson(context,expression){
  const bytes=vm.runInContext('JSON.stringify('+expression+')',context,{timeout:10000});
  if(typeof bytes!=='string') throw new Error('VM expression was not JSON serializable: '+expression);
  return JSON.parse(bytes);
}
function preflight(context,map=TARGET){
  return readJson(context,'mfPreflightBattlefieldTopologyV2('+JSON.stringify(map)+')');
}

let fatal=null;
try{
  const context=makeContext();
  const base=preflight(context);
  const catalog=readJson(context,'BattlefieldTopologyV2');
  const canonical=readJson(context,'Object.values(PLANETS).flatMap(P=>P.regions.flatMap(R=>R.maps))');
  const manifestOrder=JSON.parse(sourceText[REL.manifest]).order.map(normalizedScript);
  const bootOrder=bootManifest(sourceText[REL.boot]);
  const topologyPath=normalizedScript(REL.topology),topologyAt=manifestOrder.indexOf(topologyPath);
  const expectedChain=['assets/data/locationplans.js',REL.topology,'src/engine/worldsites.js'].map(normalizedScript);

  record('source.manifest-boot-exact-order',sameList(manifestOrder,bootOrder)&&
    new Set(manifestOrder).size===manifestOrder.length&&new Set(bootOrder).size===bootOrder.length,
  {manifestCount:manifestOrder.length,bootCount:bootOrder.length});
  record('source.topology-runtime-chain',topologyAt>0&&
    sameList(manifestOrder.slice(topologyAt-1,topologyAt+2),expectedChain)&&
    sameList(bootOrder.slice(topologyAt-1,topologyAt+2),expectedChain),
  {index:topologyAt,chain:expectedChain});
  record('catalog.canonical-map-count',canonical.length===48&&new Set(canonical).size===48,
    {count:canonical.length,unique:new Set(canonical).size});
  record('catalog.schema',catalog.schema==='BattlefieldTopologyV2'&&catalog.version===2,
    {schema:catalog.schema,version:catalog.version});
  record('catalog.first-wave-foundation',Object.keys(catalog.plans).length===1&&
    Object.prototype.hasOwnProperty.call(catalog.plans,TARGET),{plans:Object.keys(catalog.plans)});

  record('preflight.authoring-candidate',base.ok===true&&base.status==='AUTHORING_CANDIDATE'&&
    typeof base.topologyHash==='string'&&base.topologyHash.length===8&&base.summary.runtimeActive===false,
  {candidateStatus:base.status,topologyHash:base.topologyHash,runtimeActive:base.summary&&base.summary.runtimeActive});
  record('preflight.route-hierarchy',base.summary.routeCounts.primary===6&&
    base.summary.routeCounts.secondary===4&&base.summary.routeCounts.flank===2&&
    base.summary.routeCounts.service===2&&base.summary.routeCounts.naval===1,
  {routeCounts:base.summary.routeCounts});
  record('preflight.sites-and-floating-platform',base.summary.siteCount===6&&
    base.summary.floatingSiteCount===1&&base.summary.siteClasses.city===1&&
    base.summary.siteClasses.refinery===2&&base.summary.siteClasses.base===1&&
    base.summary.siteClasses.outpost===2,
  {siteCount:base.summary.siteCount,floatingSiteCount:base.summary.floatingSiteCount,
    siteClasses:base.summary.siteClasses});
  record('preflight.extent-and-spawns',base.summary.extent===2600&&base.summary.spawnCount===2&&
    base.summary.transitionCount===4,{summary:base.summary});

  const pending=preflight(context,'aelos_north_small');
  const unknown=preflight(context,'not_a_massfront_map');
  record('preflight.pending-is-inert',pending.ok===true&&pending.status==='PENDING_V0'&&
    pending.topologyHash==='',{pendingStatus:pending.status});
  record('preflight.unknown-fails-closed',unknown.ok===false&&unknown.error&&
    unknown.error.code==='TOPOLOGY_MAP_UNKNOWN',{code:unknown.error&&unknown.error.code});
  record('preflight.deterministic-repeat',preflight(context).topologyHash===base.topologyHash&&
    readJson(context,'__stage10RandomCalls')===0,{topologyHash:base.topologyHash,
      randomCalls:readJson(context,'__stage10RandomCalls')});

  const changed=preflight(makeContext(
    "BattlefieldTopologyV2.plans.aelos_north_medium.routes[0].points[1][0]+=1"));
  record('preflight.hash-sensitive',changed.ok===true&&changed.topologyHash!==base.topologyHash,
    {before:base.topologyHash,after:changed.topologyHash});

  const faults=[
    ['route-width',"BattlefieldTopologyV2.plans.aelos_north_medium.routes[0].width=29",
      'TOPOLOGY_ROUTE_WIDTH_INVALID'],
    ['massive-alias',"BattlefieldTopologyV2.plans.aelos_north_medium.size='massive'",
      'TOPOLOGY_SIZE_UNSUPPORTED'],
    ['floating-draft',"delete BattlefieldTopologyV2.plans.aelos_north_medium.sites[5].draft",
      'TOPOLOGY_FLOATING_PLATFORM_CONTRACT_INVALID'],
    ['single-approach',"BattlefieldTopologyV2.plans.aelos_north_medium.sites[0].approaches=['primary_sw']",
      'TOPOLOGY_SITE_APPROACHES_INSUFFICIENT'],
    ['water-mode',"BattlefieldTopologyV2.plans.aelos_north_medium.water.mode='none'",
      'TOPOLOGY_WATER_MODE_MISMATCH'],
    ['runtime-activation',"BattlefieldTopologyV2.plans.aelos_north_medium.activation.runtime=true",
      'TOPOLOGY_CANDIDATE_RUNTIME_ENABLED']
  ];
  for(const [name,mutation,code] of faults){
    const result=preflight(makeContext(mutation));
    record('fault.'+name,result.ok===false&&result.error&&result.error.code===code,
      {expected:code,actual:result.error&&result.error.code});
  }
}catch(error){
  fatal=error&&error.stack?error.stack:String(error);
  record('tool.fatal',false,{error:fatal});
}

const failed=checks.filter(row=>row.status!=='PASS');
const report={
  schema:'MassfrontStage10TopologyVerificationV1',version:1,
  generatedAt:new Date().toISOString(),status:failed.length?'FAIL':'PASS',
  gitHead:null,target:TARGET,checks,summary:{passed:checks.length-failed.length,failed:failed.length,total:checks.length},
  source:{
    files:Object.fromEntries(Object.entries(REL).map(([name,rel])=>[name,{path:rel,sha256:digest(sourceText[rel])}]))
  },fatal
};
try{report.gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();}catch{}
const output=path.join(ROOT,'tmp','stage10-topology','report.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`Stage 10 battlefield topology: ${report.status} ${report.summary.passed}/${report.summary.total}`);
console.log(`Target ${TARGET}`);
console.log(`Report ${path.relative(ROOT,output).replaceAll('\\','/')}`);
for(const row of failed) console.error(`FAIL ${row.id}: ${JSON.stringify(row)}`);
if(failed.length) process.exitCode=1;
