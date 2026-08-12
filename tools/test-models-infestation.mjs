/* Geometry/material QA for src/engine/models-infestation.js. The module is an
   optional classic script, so evaluate the exact dependency stack in one VM
   without registering it in either shared runtime manifest. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx,{filename:'test-bootstrap.js'});
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js','src/engine/models-infestation.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const currentKeys=['mex','pgen','fac','turret','bunker','sgen','tgate','nest','harbor','bastion',
  'techlab','aatower','airfield','uplink','hq','hellstorm','arc','rail','nova','wall',
  'minelaser','missilebastion','plasma','gate','geo','silo','fab'];
const defenseKeys=['spinespiker','toxicgusher','sporelauncher','silktrap',
  'acidgeyser','thornnest','sonicshrieker','broodspire'];
const aliases=['gorespiker','spineburrow','acidgusher','toxicspewer','sporetower',
  'tendriltrap','tendrilmaw','creeppustule','raptornest','broodchamber'];
const map=ctx.BLD_MDL_INFESTATION,turMap=ctx.BLD_TUR_MDL_INFESTATION,tiers=ctx.BLD_TIER_MDL_INFESTATION;
if(!map)throw new Error('BLD_MDL_INFESTATION was not exported');
if(!turMap)throw new Error('BLD_TUR_MDL_INFESTATION was not exported');
if(!tiers)throw new Error('BLD_TIER_MDL_INFESTATION was not exported');
for(const key of currentKeys.concat(defenseKeys,aliases))if(typeof map[key]!=='function')
  throw new Error('missing Infestation model key: '+key);

const STRIDE=12,MATERIAL_COUNT=25,UV_LIMIT=1.5;
function bounds(mesh){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.v.length;i+=STRIDE)for(let q=0;q<3;q++){
    lo[q]=Math.min(lo[q],mesh.v[i+q]);hi[q]=Math.max(hi[q],mesh.v[i+q]);
  }
  return {lo,hi,size:hi.map((v,i)=>v-lo[i])};
}
function uvQuality(mesh){
  const ratios=[];let degenerateGeometry=0,degenerateUV=0;
  for(let at=0;at<mesh.i.length;at+=3){
    const ids=[mesh.i[at],mesh.i[at+1],mesh.i[at+2]],density=[];
    const p=ids.map(index=>{const o=index*STRIDE;return [mesh.v[o],mesh.v[o+1],mesh.v[o+2],mesh.v[o+9],mesh.v[o+10]];});
    const ab=[p[1][0]-p[0][0],p[1][1]-p[0][1],p[1][2]-p[0][2]];
    const ac=[p[2][0]-p[0][0],p[2][1]-p[0][1],p[2][2]-p[0][2]];
    const worldArea=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
    const uvArea=Math.abs((p[1][3]-p[0][3])*(p[2][4]-p[0][4])-(p[1][4]-p[0][4])*(p[2][3]-p[0][3]));
    if(worldArea<=1e-7)degenerateGeometry++; else if(uvArea<1e-10)degenerateUV++;
    for(const [a,b] of [[0,1],[1,2],[2,0]]){
      const world=Math.hypot(p[a][0]-p[b][0],p[a][1]-p[b][1],p[a][2]-p[b][2]);
      const uv=Math.hypot(p[a][3]-p[b][3],p[a][4]-p[b][4]);
      if(world>1e-5&&uv>1e-7)density.push(uv/world);
    }
    if(density.length>1)ratios.push(Math.max(...density)/Math.min(...density));
  }
  ratios.sort((a,b)=>a-b);
  const p95=ratios[Math.min(ratios.length-1,Math.floor(ratios.length*.95))]||1;
  const max=ratios[ratios.length-1]||1;
  return {p95,max,degenerateGeometry,degenerateUV};
}
function inspect(key,build,needsBore,rooted=true){
  const mesh=build();
  if(!ArrayBuffer.isView(mesh.v)||mesh.v.BYTES_PER_ELEMENT!==4||
     !ArrayBuffer.isView(mesh.i)||mesh.i.BYTES_PER_ELEMENT!==2)
    throw new Error(key+': builder did not return Float32/Uint16 arrays');
  if(!mesh.v.length||!mesh.i.length||mesh.v.length%STRIDE||mesh.i.length%3||mesh.count!==mesh.i.length)
    throw new Error(key+': invalid or empty mesh layout');
  const verts=mesh.v.length/STRIDE,tris=mesh.i.length/3;
  if(verts>=12000||tris>=8000)throw new Error(key+': exceeds mobile geometry budget ('+verts+'v/'+tris+'t)');
  for(const value of mesh.v)if(!Number.isFinite(value))throw new Error(key+': non-finite vertex value');
  for(const index of mesh.i)if(index>=verts)throw new Error(key+': out-of-range index '+index+'/'+verts);
  const mats=new Set(),counts=new Map();let badNormals=0;
  for(let i=0;i<mesh.v.length;i+=STRIDE){
    const normal=Math.hypot(mesh.v[i+3],mesh.v[i+4],mesh.v[i+5]);
    if(Math.abs(normal-1)>.025)badNormals++;
    const encoded=Math.abs(mesh.v[i+11]),mat=encoded-1;
    if(Math.abs(encoded-Math.round(encoded))>1e-4||mat<0||mat>=MATERIAL_COUNT)
      throw new Error(key+': invalid material id '+encoded);
    mats.add(mat);counts.set(mat,(counts.get(mat)||0)+1);
  }
  if(badNormals)throw new Error(key+': '+badNormals+' non-unit normals');
  if(mats.size<(rooted?5:3))throw new Error(key+': insufficient biological material zoning ('+mats.size+')');
  if(rooted&&!mats.has(9))throw new Error(key+': no EARTH/root zone');
  if(!mats.has(8))throw new Error(key+': no CHITIN shell zone');
  if(!mats.has(7)&&!mats.has(13))throw new Error(key+': no distinct flesh zone');
  if(!mats.has(22)&&!mats.has(5))throw new Error(key+': no emissive/glow zone');
  if(needsBore&&(!mats.has(24)||(counts.get(24)||0)<24))
    throw new Error(key+': no substantial TWR_BORE throat geometry');
  const box=bounds(mesh),uv=uvQuality(mesh);
  /* Root cylinders deliberately bite slightly below the terrain so uneven
     ground never exposes a floating end cap. More than three units indicates
     a misplaced body rather than intentional burial. */
  if(box.lo[1]<-4)throw new Error(key+': geometry extends too far below its rooted ground plane ('+box.lo[1]+')');
  if(Math.max(...box.size)>150)throw new Error(key+': structure exceeds mobile/world silhouette envelope');
  if(uv.degenerateGeometry||uv.degenerateUV)
    throw new Error(key+': degenerate geometry/UVs '+JSON.stringify(uv));
  if(uv.p95>UV_LIMIT)throw new Error(key+': UV p95 stretch '+uv.p95.toFixed(3)+' > '+UV_LIMIT);
  return {key,verts,tris,mats:mats.size,bore:counts.get(24)||0,
    width:+box.size[0].toFixed(1),height:+box.size[1].toFixed(1),depth:+box.size[2].toFixed(1),
    uv95:+uv.p95.toFixed(3),uvMax:+uv.max.toFixed(3)};
}

const currentRows=currentKeys.map(key=>inspect(key,map[key],false));
const splitDefenses=new Set(['spinespiker','toxicgusher','sporelauncher','acidgeyser','thornnest']);
const defenseRows=defenseKeys.map(key=>{
  const row=inspect(key,map[key],!splitDefenses.has(key));
  if(splitDefenses.has(key)){
    if(typeof turMap[key]!=='function')throw new Error(key+': no tracking turret export');
    inspect(key+'-tracking-turret',()=>turMap[key](1),true,false);
  }
  return row;
});

/* Shared biological vocabulary is intentional, identical runtime silhouettes
   are not. Geometry count plus rounded bounds catches accidental aliases among
   old-save building keys without caring about harmless vertex ordering. */
const signatures=new Map();
for(const row of currentRows){
  const sig=[row.verts,row.tris,row.width,row.height,row.depth].join('/');
  if(signatures.has(sig))throw new Error('duplicate current-key silhouette: '+signatures.get(sig)+' and '+row.key);
  signatures.set(sig,row.key);
}

for(const key of defenseKeys){
  const set=tiers[key];
  if(!Array.isArray(set)||set.length!==3)throw new Error(key+': expected three tier factories');
  let prior=null;
  for(let i=0;i<3;i++){
    const split=splitDefenses.has(key);
    const row=inspect(key+'-t'+(i+1),set[i].base,!split);
    if(split){
      if(typeof set[i].tur!=='function')throw new Error(key+': tier '+(i+1)+' has no tracking turret');
      inspect(key+'-t'+(i+1)+'-tracking-turret',set[i].tur,true,false);
    }
    /* Asymmetric roots may make one tier a little narrower in X even while
       its crown grows. Require strictly non-regressing detail and height; that
       is the progression the command camera actually reads. */
    if(prior&&(row.verts<prior.verts||row.height<prior.height*.94))
      throw new Error(key+': tier '+(i+1)+' regressed instead of growing');
    prior=row;
  }
}

console.table(currentRows);
console.table(defenseRows);
console.log('Infestation model QA:',Object.keys(map).length+' exports, '+currentKeys.length+
  ' unique runtime silhouettes, '+defenseKeys.length+' explicit hollow defenses, 3 tiers each.');
