/* Geometry smoke test for src/engine/models-machine.js.
   This evaluates the classic-script model stack in one VM context, then builds
   every Machine mesh without needing WebGL or a browser. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx,{filename:'test-bootstrap.js'});
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js','src/engine/models-machine.js']){
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});
}

const currentKeys=['mex','pgen','fac','turret','bunker','sgen','tgate','nest','harbor','bastion',
  'techlab','aatower','airfield','uplink','hq','hellstorm','arc','rail','nova','wall',
  'minelaser','missilebastion','plasma','gate','geo','silo','fab'];
const defenseKeys=['gravitywell','spinbeam','phasedisruptor','voidlance','swarmfabricator',
  'energyvortex','pulsearray','singularitycore'];
const map=ctx.BLD_MDL_MACHINE;
if(!map) throw new Error('BLD_MDL_MACHINE was not exported');
for(const key of currentKeys.concat(defenseKeys)) if(typeof map[key]!=='function')
  throw new Error('missing Machine model key: '+key);

const rows=[];
for(const [key,build] of Object.entries(map)){
  const mesh=build();
  if(!ArrayBuffer.isView(mesh.v)||mesh.v.BYTES_PER_ELEMENT!==4||
     !ArrayBuffer.isView(mesh.i)||mesh.i.BYTES_PER_ELEMENT!==2)
    throw new Error(key+': builder did not return typed mesh arrays');
  if(!mesh.v.length||!mesh.i.length||mesh.v.length%12)
    throw new Error(key+': invalid/empty vertex layout');
  const verts=mesh.v.length/12;
  if(verts>=65536) throw new Error(key+': exceeds Uint16 vertex budget ('+verts+')');
  for(const n of mesh.v) if(!Number.isFinite(n)) throw new Error(key+': non-finite vertex value');
  for(const ix of mesh.i) if(ix>=verts) throw new Error(key+': out-of-range index '+ix+'/'+verts);
  const mats=new Set();
  for(let i=11;i<mesh.v.length;i+=12) mats.add(Math.abs(mesh.v[i])-1);
  /* Directed defenses were split into static foundations plus tracked turret
     assemblies. Hollow emitters correctly live in the turret half, so inspect
     the complete runtime structure rather than rejecting a bore-free pad. */
  const turBuild=ctx.BLD_TUR_MDL_MACHINE&&ctx.BLD_TUR_MDL_MACHINE[key];
  if(turBuild){const tur=turBuild();for(let i=11;i<tur.v.length;i+=12)mats.add(Math.abs(tur.v[i])-1);}
  if(mats.size<4) throw new Error(key+': insufficient material zoning ('+mats.size+')');
  if(defenseKeys.includes(key)&&!mats.has(24))
    throw new Error(key+': no TWR_BORE material; emitter/barrel is not visibly hollow');
  rows.push({key,verts,tris:mesh.i.length/3,mats:mats.size});
}

for(const [key,tiers] of Object.entries(ctx.BLD_TIER_MDL_MACHINE||{})){
  if(tiers.length!==3) throw new Error(key+': expected three tier factories');
  for(let i=0;i<3;i++){
    const mesh=tiers[i].base();
    if(!mesh||!mesh.v.length) throw new Error(key+' tier '+(i+1)+': empty mesh');
  }
}

const unique=new Map();
for(const r of rows) if(!unique.has(r.key)) unique.set(r.key,r);
console.table([...unique.values()]);
console.log('Machine model QA:',rows.length+' map entries, '+currentKeys.length+
  ' current building keys, '+defenseKeys.length+' explicit defenses, 3 tiers each.');
