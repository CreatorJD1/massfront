/* Geometry/material regression test for every faction structure module. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
const core=['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js'];
for(const rel of core) vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const specs=[
  {id:'Nova',file:null,map:'BLD_MDL',tur:'BLD_TUR_MDL',tier:'BLD_TIER_MDL'},
  {id:'Legion',file:'src/engine/models-legion.js',map:'BLD_MDL_LEGION',tur:'BLD_TUR_MDL_LEGION',tier:'BLD_TIER_MDL_LEGION'},
  {id:'Machine',file:'src/engine/models-machine.js',map:'BLD_MDL_MACHINE',tur:'BLD_TUR_MDL_MACHINE',tier:'BLD_TIER_MDL_MACHINE',
    aimed:['turret','bunker','aatower','hellstorm','rail','nova','minelaser','missilebastion','plasma'],
    aliases:['spinbeam','phasedisruptor','voidlance','swarmfabricator','pulsearray','singularitycore']},
  {id:'Infestation',file:'src/engine/models-infestation.js',map:'BLD_MDL_INFESTATION',tur:'BLD_TUR_MDL_INFESTATION',tier:'BLD_TIER_MDL_INFESTATION',
    aimed:['turret','bunker','bastion','aatower','hellstorm','rail','nova','minelaser','missilebastion','plasma'],
    aliases:['spinespiker','gorespiker','spineburrow','toxicgusher','acidgusher','toxicspewer',
      'sporelauncher','sporetower','acidgeyser','creeppustule','thornnest','raptornest']},
];
const keys=['mex','pgen','fac','turret','bunker','sgen','tgate','nest','harbor','bastion','techlab','aatower','airfield','uplink','hq','hellstorm','arc','rail','nova','wall','minelaser','missilebastion','plasma','gate','geo','silo','fab'];
const weaponKeys=new Set(['turret','bunker','bastion','aatower','hellstorm','arc','rail','nova','minelaser','missilebastion','plasma']);

function value(expr){return vm.runInContext(expr,ctx);}
function inspectMesh(id,key,mesh){
  if(!mesh||!ArrayBuffer.isView(mesh.v)||!ArrayBuffer.isView(mesh.i)||mesh.v.length%12||mesh.i.length%3)
    throw new Error(`${id}/${key}: malformed typed geometry`);
  const verts=mesh.v.length/12;
  if(!verts||verts>=65536) throw new Error(`${id}/${key}: invalid Uint16 vertex budget ${verts}`);
  let nonFinite=0,badIndex=0,badNormal=0;
  const mats=new Set();
  for(let i=0;i<mesh.v.length;i+=12){
    for(let q=0;q<12;q++) if(!Number.isFinite(mesh.v[i+q])) nonFinite++;
    const nl=Math.hypot(mesh.v[i+3],mesh.v[i+4],mesh.v[i+5]);
    if(nl<.75||nl>1.25) badNormal++;
    mats.add(Math.abs(mesh.v[i+11])-1);
  }
  for(const ix of mesh.i) if(ix>=verts) badIndex++;
  if(nonFinite||badIndex||badNormal) throw new Error(`${id}/${key}: finite=${nonFinite} index=${badIndex} normal=${badNormal}`);
  const simple=key.startsWith('wall')||key.startsWith('gate')||key.includes('-turret');
  if(mats.size<(simple?2:3)) throw new Error(`${id}/${key}: only ${mats.size} material zones`);
  return {verts,tris:mesh.i.length/3,mats,bore:mats.has(24)};
}

const summary=[];
for(const spec of specs){
  if(spec.file){
    const p=path.join(root,spec.file);
    if(!fs.existsSync(p)){console.warn(`${spec.id}: module not present; skipped`);continue;}
    vm.runInContext(fs.readFileSync(p,'utf8'),ctx,{filename:spec.file});
  }
  const map=value(spec.map), tur=spec.tur?value(spec.tur):{}, tiers=value(`typeof ${spec.tier}!=='undefined'?${spec.tier}:{}`);
  let totalVerts=0,totalTris=0,maxVerts=0,boreWeapons=0;
  for(const key of keys){
    if(typeof map[key]!=='function') throw new Error(`${spec.id}: missing ${key}`);
    const base=inspectMesh(spec.id,key,map[key]());
    let hasBore=base.bore;
    totalVerts+=base.verts;totalTris+=base.tris;maxVerts=Math.max(maxVerts,base.verts);
    if(tur&&typeof tur[key]==='function'){
      const gun=inspectMesh(spec.id,key+'-turret',tur[key]());
      hasBore=hasBore||gun.bore;totalVerts+=gun.verts;totalTris+=gun.tris;maxVerts=Math.max(maxVerts,gun.verts);
    }
    if(weaponKeys.has(key)&&hasBore) boreWeapons++;
  }
  /* A projectile changing direction while its authored barrel stays fixed is
     a visual gameplay bug, not merely an art preference. Runtime weapons and
     the named contact-sheet aliases must expose a separate, hollow V.tur at
     every tier so initBldMeshSet can put it on the tracking instance stream. */
  for(const key of [...(spec.aimed||[]),...(spec.aliases||[])]){
    if(typeof map[key]!=='function') throw new Error(`${spec.id}: missing aimed base ${key}`);
    if(typeof tur[key]!=='function') throw new Error(`${spec.id}: missing aimed turret ${key}`);
    const gun=inspectMesh(spec.id,`${key}-tracking-turret`,tur[key](1));
    if(!gun.bore) throw new Error(`${spec.id}/${key}: tracking turret has no hollow bore material`);
    const list=tiers[key];
    if(!Array.isArray(list)||list.length!==3)
      throw new Error(`${spec.id}/${key}: aimed family needs three tracking tiers`);
    for(let i=0;i<3;i++){
      if(typeof list[i].tur!=='function')
        throw new Error(`${spec.id}/${key}: tier ${i+1} has no V.tur factory`);
      const tierGun=inspectMesh(spec.id,`${key}-tier-${i+1}-tracking-turret`,list[i].tur());
      if(!tierGun.bore) throw new Error(`${spec.id}/${key}: tier ${i+1} turret lost its hollow bore`);
    }
  }
  for(const [key,list] of Object.entries(tiers||{})){
    if(!Array.isArray(list)||list.length!==3) throw new Error(`${spec.id}/${key}: tier registry must have three entries`);
    for(let i=0;i<3;i++){
      inspectMesh(spec.id,`${key}-tier-${i+1}`,list[i].base());
      if(list[i].tur) inspectMesh(spec.id,`${key}-tier-${i+1}-turret`,list[i].tur());
    }
  }
  summary.push({faction:spec.id,buildings:keys.length,totalVerts,totalTris,maxVerts,boreWeapons,tierFamilies:Object.keys(tiers||{}).length});
}
console.table(summary);
console.log('Faction structure geometry/material QA passed.');
