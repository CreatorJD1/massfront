/* Syndicate Coalition production-art conversion gate. Green must remain a
   nano-ceramic/field-technology faction, not a green paint pass over tanks. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx,
  {filename:'syndicate-stage3-bootstrap.js'});
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js',
  'src/engine/models-units-syndicate.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const kit=vm.runInContext('UNIT_MDL_SYNDICATE',ctx);
const MAT=vm.runInContext('MAT',ctx),VFLOATS=12;
const production=[0,1,2,3,5,6,7,8,9,10,11,14,15,16,17,18,19,20,21,22,23,24,25,26,27,32];
const forbidden=new Set([MAT.PLATE,MAT.GREEBLE,MAT.TREAD,MAT.GLASS,MAT.TWR_ARMOR,
  MAT.TWR_MACH,MAT.TWR_COAT,MAT.TWR_GLOW,MAT.TWR_PAD]);

function inspect(name,geo){
  if(!geo||!ArrayBuffer.isView(geo.v)||!ArrayBuffer.isView(geo.i)||geo.v.length%VFLOATS)
    throw new Error(name+': malformed geometry');
  const verts=geo.v.length/VFLOATS,mats=new Set();let team=0;
  for(let o=0;o<geo.v.length;o+=VFLOATS){
    for(let q=0;q<VFLOATS;q++)if(!Number.isFinite(geo.v[o+q]))throw new Error(name+': non-finite vertex');
    const raw=geo.v[o+11],mat=Math.floor(Math.abs(raw))-1;mats.add(mat);if(raw<0)team++;
  }
  for(const ix of geo.i)if(ix>=verts)throw new Error(name+': out-of-range index '+ix+'/'+verts);
  return {verts,tris:geo.i.length/3,mats,team};
}

const rows=[];
for(const slot of production){
  if(typeof kit[slot]!=='function')throw new Error('Green slot '+slot+' has no authored conversion builder');
  const model=kit[slot](),parts=[inspect('slot '+slot+' hull',model.hull)];
  if(model.tur)parts.push(inspect('slot '+slot+' turret',model.tur));
  const mats=new Set(parts.flatMap(p=>[...p.mats]));
  for(const mat of mats)if(forbidden.has(mat))throw new Error('Green slot '+slot+' retained generic material '+mat);
  if(!mats.has(MAT.SYN_NANO))throw new Error('Green slot '+slot+' lacks nano-ceramic armor');
  const verts=parts.reduce((n,p)=>n+p.verts,0),tris=parts.reduce((n,p)=>n+p.tris,0);
  const team=parts.reduce((n,p)=>n+p.team,0);
  if(!team)throw new Error('Green slot '+slot+' has no controlled faction-livery panel');
  if(verts>11000)throw new Error('Green slot '+slot+' exceeds mobile production budget: '+verts+' vertices');
  rows.push({slot,builder:kit[slot].name,verts,tris,materials:mats.size,livery:(team/verts*100).toFixed(1)+'%'});
}

if(kit[2]!==kit[6]||kit[10]!==kit[22]||kit[20]!==kit[21])
  throw new Error('Green shared-role wrappers no longer share GPU mesh resources');
if(new Set(production.map(slot=>kit[slot].name)).size!==23)
  throw new Error('Green wrapper cache has an unexpected production mesh count');

console.table(rows);
console.log('Syndicate Stage 3 QA passed: all '+production.length+' production slots use advanced field-tech materials.');
