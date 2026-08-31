#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REL={
  theatre:'assets/data/theatreprofiles-stage10.js',manifest:'assets/data/manifest.json',boot:'boot.js',
  showcase:'modules/space_exploration/src/systems/showcase_systems.js',
  galaxy:'modules/space_exploration/src/systems/galaxy_data.js',
  interiors:'source-media/content-library/interior-tactical-model-packs.v1.json'
};
const text={};
for(const file of Object.values(REL)) text[file]=fs.readFileSync(path.join(ROOT,file),'utf8');
const checks=[];
function record(name,ok,details={}){checks.push({name,ok:!!ok,details});}
function jsonFrom(context,expr){return JSON.parse(vm.runInContext('JSON.stringify('+expr+')',context));}
function contextWith(mutation=''){
  const context=vm.createContext({console});
  vm.runInContext(text[REL.theatre],context,{filename:REL.theatre,timeout:10000});
  if(mutation) vm.runInContext(mutation,context,{filename:'stage10-theatre-fault.js',timeout:10000});
  return context;
}
function preflight(context){return jsonFrom(context,'mfPreflightStage10TheatreCatalogV1()');}
function normalized(p){return p.replace(/^\.\//,'').replaceAll('\\','/');}
function bootManifest(source){
  const match=source.match(/var MANIFEST=\[(.*?)\n\s*\];/s);
  if(!match) throw new Error('boot MANIFEST not found');
  return [...match[1].matchAll(/'([^']+)'/g)].map(m=>normalized(m[1]));
}

try{
  const showcase=(await import(pathToFileURL(path.join(ROOT,REL.showcase)).href+'?stage10='+Date.now())).SHOWCASE_SYSTEMS;
  const galaxy=(await import(pathToFileURL(path.join(ROOT,REL.galaxy)).href+'?stage10='+Date.now())).GALAXY_DATA;
  const interiors=JSON.parse(text[REL.interiors]);
  const context=contextWith(),result=preflight(context),catalog=jsonFrom(context,'Stage10TheatreCatalogV1');
  const authoredPlanets=Object.values(showcase).flatMap(S=>S.planets.map(P=>P.id)).sort();
  const prototypePlanets=Object.values(galaxy).flatMap(S=>S.planets.map(P=>P.id));
  const contactIds=new Set(Object.values(showcase).flatMap(S=>S.contacts.map(C=>C.id)));
  const manifest=JSON.parse(text[REL.manifest]).order.map(normalized),boot=bootManifest(text[REL.boot]);
  const theatre=normalized(REL.theatre);

  record('preflight.authoring-only',result.ok===true&&result.status==='AUTHORING_ONLY'&&result.summary.runtimeActive===false,result);
  record('scope.eight-planets',catalog.targetPlanetCount===8&&catalog.planetSlots.length===8&&
    catalog.planetAuthority==='EXPLORATION_MODULE_SHOWCASE_SYSTEMS'&&
    catalog.sourceInventories.authoredExplorationPlanets.authority==='STAGE10_PLANET_AUTHORITY'&&
    result.summary.sourceMatchedPlanets===6&&result.summary.pendingCanonPlanetNames===2,result.summary);
  record('source.showcase-six-planets',authoredPlanets.length===6&&
    JSON.stringify(authoredPlanets)===JSON.stringify([...catalog.sourceInventories.authoredExplorationPlanets.ids].sort()),
  {authoredPlanets});
  record('source.legacy-eight-reference-only',prototypePlanets.length===8&&
    catalog.sourceInventories.legacyGalaxyPrototype.count===8&&
    catalog.sourceInventories.legacyGalaxyPrototype.authority==='REFERENCE_ONLY_NOT_CANON_IDENTITY',
  {prototypePlanetCount:prototypePlanets.length});
  record('scope.surface-wave-bounded',catalog.sourceInventories.surfaceHomeworlds.count===4&&
    catalog.domains.surface_battlefield.currentWave==='FOUR_HOMEWORLD_STANDARD_WAVE_1',catalog.domains.surface_battlefield);

  const sourceTemplates=new Map(interiors.mapTemplates.map(T=>[T.templateId,T]));
  const templateMatch=catalog.interiorTemplates.every(T=>{
    const S=sourceTemplates.get(T.id);
    return S&&S.sizeClass===T.size&&JSON.stringify(S.playableBoundsMeters)===JSON.stringify(T.bounds)&&
      S.minimumMixedRouteWidth===T.routeWidth&&
      JSON.stringify(S.requiredMobility)===JSON.stringify(['infantry','small_vehicle','mech']);
  });
  record('interior.four-source-matched-templates',catalog.interiorTemplates.length===4&&sourceTemplates.size===4&&templateMatch,
    {templates:[...sourceTemplates.keys()]});
  record('interior.six-inert-packs',interiors.packs.length===6&&catalog.interiorLocationPacks.length===6&&
    interiors.packs.every(P=>P.status==='PLANNED'&&P.runtimeReady===false&&P.members.length===15&&
      catalog.interiorLocationPacks.some(C=>C.id===P.packId&&C.memberCount===P.members.length)),
  {packs:interiors.packs.map(P=>({id:P.packId,members:P.members.length}))});
  const restricted=['infantry_only','small_unit_combined'].map(id=>catalog.unitEnvelopes[id]);
  const forbiddenHeavy=new Set(['heavy_vehicle','heavy_mech','artillery','air','naval','titan','capital_ship','ground_heavy']);
  record('interior.restricted-small-unit-envelopes',restricted.every(E=>
    E.allowed.every(U=>!forbiddenHeavy.has(U))&&E.forbidden.length>0&&E.maxMassClass!=='campaign'),
  {envelopes:['infantry_only','small_unit_combined']});
  record('orbital.source-matched-seeds',catalog.orbitalLocationSeeds.length===6&&
    catalog.orbitalLocationSeeds.every(L=>contactIds.has(L.id)&&['XS','SMALL'].includes(L.size)),
  {seeds:catalog.orbitalLocationSeeds.map(L=>L.id)});
  record('loader.registered-both',manifest.includes(theatre)&&boot.includes(theatre)&&
    manifest.indexOf(theatre)===boot.indexOf(theatre),{manifestIndex:manifest.indexOf(theatre),bootIndex:boot.indexOf(theatre)});

  const faults=[
    ['planet-count','Stage10TheatreCatalogV1.targetPlanetCount=4','THEATRE_PLANET_SCOPE_INVALID'],
    ['runtime','Stage10TheatreCatalogV1.activation.runtime=true','THEATRE_RUNTIME_ENABLED'],
    ['heavy-interior',"Stage10TheatreCatalogV1.unitEnvelopes.small_unit_combined.allowed.push('heavy_vehicle')",'THEATRE_RESTRICTED_ENVELOPE_INVALID'],
    ['named-pending',"Stage10TheatreCatalogV1.planetSlots[6].name='Invented'",'THEATRE_PLANET_PENDING_SLOT_INVALID'],
    ['oversize-xs','Stage10TheatreCatalogV1.interiorTemplates[0].bounds[0]=90','THEATRE_INTERIOR_TEMPLATE_INVALID'],
    ['orbital-envelope',"Stage10TheatreCatalogV1.orbitalLocationSeeds[0].envelope='surface_combined_arms'",'THEATRE_ORBITAL_SEED_INVALID']
  ];
  for(const [name,mutation,code] of faults){
    const fault=preflight(contextWith(mutation));
    record('fault.'+name,fault.ok===false&&fault.error&&fault.error.code===code,{expected:code,actual:fault.error&&fault.error.code});
  }

  const passed=checks.filter(C=>C.ok).length,failed=checks.length-passed;
  const report={schema:'Stage10TheatreVerificationV1',generatedAt:new Date().toISOString(),passed,failed,checks};
  const out=path.join(ROOT,'tmp','stage10-theatres','report.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  for(const C of checks) console.log((C.ok?'PASS ':'FAIL ')+C.name);
  console.log(`\n${passed}/${checks.length} checks passed; report ${path.relative(ROOT,out)}`);
  if(failed) process.exitCode=1;
}catch(error){
  console.error(error&&error.stack||error);
  process.exitCode=1;
}
