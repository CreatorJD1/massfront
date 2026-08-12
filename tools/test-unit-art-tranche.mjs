/* Focused art gate for the complete mobile vehicle-modernization tranche.
   These are exact runtime UNIT_MDL builders, evaluated as classic scripts so
   the test sees the same colour-to-material wrapper and mesh layout as WebGL.
   A dark disc painted on a capped barrel is not a bore: the TWR_BORE material
   is only accepted when it owns real vertices from tube/ring geometry. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console});
vm.runInContext('const TAU=Math.PI*2,MAP=2600; function m4(){return new Float32Array(16);}',ctx,
  {filename:'test-bootstrap.js'});
for(const rel of ['src/engine/mesh.js','src/engine/materials.js','src/engine/models.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx,{filename:rel});

const roster=vm.runInContext('UNIT_MDL',ctx);
const boreMat=vm.runInContext('MAT.TWR_BORE',ctx);
const STRIDE=12;
const targets=[
  {id:5,name:'Wasp',scale:1.0,air:1,tur:false},
  {id:6,name:'Longbow',scale:1.0,tur:true,turH:4.45},
  {id:7,name:'Hornet',scale:1.0,tur:true,turH:4.45},
  {id:8,name:'TITAN',scale:.62,tur:false},
  {id:9,name:'Pyro',scale:1.0,tur:true,turH:4.45},
  {id:14,name:'Corvette',scale:1.0,naval:1,tur:true,turH:3.8},
  {id:15,name:'Dreadnought',scale:1.0,naval:1,tur:true,turH:5.6},
  {id:16,name:'Bombard',scale:1.0,tur:true,turH:5.95},
  {id:17,name:'Raptor',scale:1.0,air:1,tur:false},
  {id:18,name:'Scorcher',scale:1.0,tur:true,turH:6.1},
  {id:25,name:'Kestrel',scale:.92,tur:false},
];

function inspect(mesh,label,allMats){
  if(!mesh||!ArrayBuffer.isView(mesh.v)||!ArrayBuffer.isView(mesh.i)||mesh.v.length%STRIDE)
    throw new Error(label+': malformed mesh stream');
  const verts=mesh.v.length/STRIDE;
  if(!verts||!mesh.i.length||mesh.i.length%3)throw new Error(label+': empty or malformed indices');
  if(verts>=65536)throw new Error(label+': exceeds Uint16 vertex ceiling ('+verts+')');
  let team=0,bore=0,nonFinite=0,badNormal=0;
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.v.length;i+=STRIDE){
    for(let q=0;q<STRIDE;q++)if(!Number.isFinite(mesh.v[i+q]))nonFinite++;
    const x=mesh.v[i],y=mesh.v[i+1],z=mesh.v[i+2];
    lo[0]=Math.min(lo[0],x);lo[1]=Math.min(lo[1],y);lo[2]=Math.min(lo[2],z);
    hi[0]=Math.max(hi[0],x);hi[1]=Math.max(hi[1],y);hi[2]=Math.max(hi[2],z);
    const nl=Math.hypot(mesh.v[i+3],mesh.v[i+4],mesh.v[i+5]);
    if(nl<.75||nl>1.25)badNormal++;
    const raw=mesh.v[i+11],mat=Math.round(Math.abs(raw)-1);
    allMats.add(mat);
    if(raw<0)team++;
    if(mat===boreMat)bore++;
  }
  for(const ix of mesh.i)if(ix>=verts)throw new Error(label+': out-of-range index '+ix+'/'+verts);
  if(nonFinite)throw new Error(label+': '+nonFinite+' non-finite vertex values');
  if(badNormal)throw new Error(label+': '+badNormal+' invalid normals');
  return {verts,tris:mesh.i.length/3,team,bore,lo,hi};
}

const rows=[];
for(const spec of targets){
  const model=roster[spec.id]();
  if(Math.abs(model.s-spec.scale)>1e-6)throw new Error(spec.name+': runtime scale changed');
  if((model.air||undefined)!==(spec.air||undefined))throw new Error(spec.name+': air role metadata changed');
  if((model.naval||undefined)!==(spec.naval||undefined))throw new Error(spec.name+': naval role metadata changed');
  if(Boolean(model.tur)!==spec.tur)throw new Error(spec.name+': turret semantics changed');
  if(spec.tur&&Math.abs(model.turH-spec.turH)>1e-6)throw new Error(spec.name+': turret height changed');

  const mats=new Set(),parts=[inspect(model.hull,spec.name+' hull',mats)];
  if(model.tur)parts.push(inspect(model.tur,spec.name+' turret',mats));
  const verts=parts.reduce((n,p)=>n+p.verts,0);
  const tris=parts.reduce((n,p)=>n+p.tris,0);
  const team=parts.reduce((n,p)=>n+p.team,0);
  const bore=parts.reduce((n,p)=>n+p.bore,0);
  const livery=team/verts;
  /* Procedural hard-surface meshes duplicate vertices along deliberate sharp
     edges. The 9k ceiling therefore corresponds to fewer than 4k rendered
     triangles, matching the existing Rhino/Goliath upper tier. */
  if(verts<1500||verts>9000)
    throw new Error(spec.name+': '+verts+' vertices outside the 1.5k-9k mobile silhouette budget');
  if(mats.size<5)throw new Error(spec.name+': only '+mats.size+' semantic material zones');
  if(livery<.005||livery>.45)
    throw new Error(spec.name+': explicit livery coverage '+(livery*100).toFixed(2)+'% outside 0.5%-45%');
  if(bore<24)throw new Error(spec.name+': no measurable hollow +X bore/thruster geometry');
  rows.push({unit:spec.name,vertices:verts,triangles:tris,materials:mats.size,
    livery:(livery*100).toFixed(1)+'%',boreVertices:bore});
}

console.table(rows);
console.log('Unit art tranche QA: '+rows.length+' runtime models passed livery, material, bore, metadata and mobile-budget gates.');
