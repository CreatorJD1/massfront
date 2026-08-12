import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root));
function payload(path){
  const context={Float32Array,Uint8Array,Uint16Array};vm.createContext(context);
  vm.runInContext(read(path).toString('utf8'),context,{filename:path});
  const g=context.MF2_IMPORTED_GEO?.novaFactoryV2;
  if(!g)throw Error(path+': novaFactoryV2 missing');return g;
}
function assert(ok,msg){if(!ok)throw Error(msg);}
const full=payload('assets/data/material-v2-nova-factory.js');
const lod=payload('assets/data/material-v2-nova-factory-lod1.js');
const sockets=['socket_production_exit','socket_rally','socket_utility_roof','socket_sensor','socket_defense_left','socket_defense_right','socket_power'];
const semantics=['STRUCTURE','MACHINE','TRIM','ARMOR','EDGE_STEEL','TEAM_PRIMARY','TEAM_SECONDARY','ENERGY','WEAPON','GLASS','FACTION_BADGE'];
for(const [name,g] of [['LOD0',full],['LOD1',lod]]){
  assert(g.meta.parts===1,name+': runtime payload is not one joined stream');
  assert(g.meta.vertices<65536,name+': exceeds Uint16 vertex limit');
  assert(g.p.length/3===g.meta.vertices&&g.n.length===g.p.length,name+': position/normal count mismatch');
  assert(g.uv.length/2===g.meta.vertices&&g.sem.length===g.meta.vertices,name+': UV/semantic count mismatch');
  assert(g.i.length/3===g.meta.triangles,name+': triangle count mismatch');
  assert(Math.max(...g.i)<g.meta.vertices,name+': index exceeds vertex range');
  assert(g.uv.every(v=>Number.isFinite(v)&&v>=-.0001&&v<=1.0001),name+': UV0 outside authored atlas');
  assert(g.meta.sockets.join('|')===sockets.join('|'),name+': socket contract changed');
  for(const sem of semantics)assert(g.meta.materials.some(m=>m.includes(sem)),name+': missing '+sem+' material region');
}
const ratio=lod.meta.triangles/full.meta.triangles;
assert(ratio>.42&&ratio<.62,'LOD1 reduction outside structure silhouette gate: '+ratio.toFixed(3));
assert(JSON.stringify(full.meta.bounds)===JSON.stringify(lod.meta.bounds),'LOD1 bounds changed');
for(const file of ['nova-factory-v2-baseao.png','nova-factory-v2-nre.png','nova-factory-v2-masks.png']){
  const b=read('assets/textures/materials/'+file);
  assert(b.readUInt32BE(0)===0x89504e47,file+': not PNG');
  assert(b.readUInt32BE(16)===1024&&b.readUInt32BE(20)===1024,file+': expected 1024 authored map');
}
const runtime=read('src/engine/materials-v2.js').toString('utf8');
for(const marker of ["MF2_ASSET==='factory'","novaFactoryV2","material-v2-nova-factory","nova-factory-v2"])
  assert(runtime.includes(marker),'runtime asset routing missing '+marker);
for(const manifest of ['boot.js','assets/data/manifest.json']){
  const src=read(manifest).toString('utf8');
  assert(!src.includes('material-v2-nova-factory.js'),manifest+': showcase payload entered normal boot');
}
const sha=p=>crypto.createHash('sha256').update(read(p)).digest('hex').toUpperCase();
console.log('Material V2 Nova Factory QA passed: '+full.meta.triangles+' tris -> '+lod.meta.triangles+
  ' tris, one stream, '+sockets.length+' sockets, 11 semantic regions.');
console.log('LOD0 '+sha('source-media/material-v2/nova-factory-v2/nova-factory-v2-baked.glb'));
console.log('LOD1 '+sha('source-media/material-v2/nova-factory-v2/nova-factory-v2-lod1.glb'));
