/* Readability contract for the two dark hard-surface factions. The important
   distinction is value zoning, not a blanket exposure lift: coat must remain
   dark, service panels must sit in the midtones, and edge hardware must catch
   the sun while emissive marks provide only small navigation accents. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx);
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const keys=['mex','pgen','fac','turret','bunker','sgen','tgate','nest','harbor','bastion','techlab','aatower','airfield','uplink','hq','hellstorm','arc','rail','nova','wall','minelaser','missilebastion','plasma','gate','geo','silo','fab'];
const lum=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
const same=(a,b)=>Math.abs(a[0]-b[0])<1e-5&&Math.abs(a[1]-b[1])<1e-5&&Math.abs(a[2]-b[2])<1e-5;
const hasColour=(mesh,col)=>{for(let i=0;i<mesh.v.length;i+=12)if(same(mesh.v.subarray(i+6,i+9),col))return true;return false;};
const hasMaterial=(mesh,id)=>{for(let i=11;i<mesh.v.length;i+=12)if(Math.abs(mesh.v[i])-1===id)return true;return false;};

for(const spec of [
  {id:'Legion',file:'src/engine/models-legion.js',map:'BLD_MDL_LEGION',tur:'BLD_TUR_MDL_LEGION',
    tiers:'BLD_TIER_MDL_LEGION',tracking:['hellstorm','nova','missilebastion'],
    panel:'LEG_PANEL',edge:'LEG_EDGE',dark:'LEG_ARM_D',glow:'LEG_HOT'},
  {id:'Machine',file:'src/engine/models-machine.js',map:'BLD_MDL_MACHINE',tur:'BLD_TUR_MDL_MACHINE',
    tiers:'BLD_TIER_MDL_MACHINE',tracking:['bastion','gravitywell'],
    panel:'MAC_PANEL',edge:'MAC_EDGE',dark:'MAC_ARM_D',glow:'MAC_GLOW'},
]){
  vm.runInContext(fs.readFileSync(path.join(root,spec.file),'utf8'),ctx,{filename:spec.file});
  const get=expr=>vm.runInContext(expr,ctx),map=get(spec.map),tur=get(spec.tur);
  const tiers=get(spec.tiers);
  const panel=get(spec.panel),edge=get(spec.edge),dark=get(spec.dark),glow=get(spec.glow);
  if(lum(panel)-lum(dark)<.22)throw new Error(`${spec.id}: panel/core value separation is too small`);
  if(lum(edge)-lum(panel)<.12)throw new Error(`${spec.id}: edge/panel value separation is too small`);
  if(get(`COL_MAT.get(${spec.dark})`)!==get('MAT.TWR_COAT'))throw new Error(`${spec.id}: structural core must use coated material`);
  if(get(`COL_MAT.get(${spec.panel})`)!==get('MAT.TWR_ARMOR'))throw new Error(`${spec.id}: midtone panel must use armor material`);
  if(get(`COL_MAT.get(${spec.edge})`)!==get('MAT.TWR_MACH'))throw new Error(`${spec.id}: edge hardware must use machine material`);
  for(const key of keys){
    const base=map[key](),parts=[base];
    if(typeof tur[key]==='function')parts.push(tur[key](1));
    const merged={v:new Float32Array(parts.reduce((n,p)=>n+p.v.length,0))};
    let at=0;for(const p of parts){merged.v.set(p.v,at);at+=p.v.length;}
    if(!hasColour(merged,panel))throw new Error(`${spec.id}/${key}: no deliberate midtone panel`);
    if(!hasColour(merged,glow))throw new Error(`${spec.id}/${key}: no restrained emissive navigation accent`);
    if(!hasMaterial(merged,get('MAT.TWR_COAT'))||!hasMaterial(merged,get('MAT.TWR_ARMOR')))
      throw new Error(`${spec.id}/${key}: dark core and armor zones are not materially separated`);
    if(merged.v.length/12>=12000)throw new Error(`${spec.id}/${key}: exceeds mobile vertex budget`);
  }
  for(const key of spec.tracking){
    if(typeof tur[key]!=='function')throw new Error(`${spec.id}/${key}: directed weapon lacks a tracking assembly`);
    if(!Array.isArray(tiers[key])||tiers[key].length!==3||tiers[key].some(v=>typeof v.tur!=='function'))
      throw new Error(`${spec.id}/${key}: all three tiers must retain independent tracking`);
    for(let i=0;i<3;i++)if(!hasMaterial(tiers[key][i].tur(),get('MAT.TWR_BORE')))
      throw new Error(`${spec.id}/${key}: tier ${i+1} tracking assembly lost its hollow bore`);
  }
  console.log(`${spec.id}: ${keys.length} runtime structures preserve dark cores, midtone panels, edge hardware and emissive accents.`);
}
console.log('Dark-faction readability QA passed.');
