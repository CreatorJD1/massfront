/* Release gate for the curated world-asset rebuilds and their generated live
   payload. It catches the failures that still render without a JS exception:
   floating pivots, detached mesh islands, inverted triangles, invalid material
   IDs, all-zero/stretched runtime UVs and stale declared bounds. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=path.join(root,'source-media','world-asset-rebuilds','engine-json');
const generated=fs.readFileSync(path.join(root,'src','engine','models-world-data.js'),'utf8');
const ctx=vm.createContext({});vm.runInContext(generated.replace('const WORLD_MODELS=','globalThis.WORLD_MODELS='),ctx);
const live=ctx.WORLD_MODELS,files=fs.readdirSync(sourceDir).filter(f=>f.endsWith('.engine.json'));
const MATERIAL_COUNT=25,UV_STRETCH_MAX=1.82;
function fail(msg){throw new Error(msg);}
function bounds(P){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of P)for(let q=0;q<3;q++){lo[q]=Math.min(lo[q],p[q]);hi[q]=Math.max(hi[q],p[q]);}return {lo,hi,size:hi.map((v,q)=>v-lo[q])};}
function meshComponents(D){
  const tris=D.indices.length/3,parent=Array.from({length:tris},(_,i)=>i),weld=new Map();
  const find=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  for(let t=0;t<tris;t++)for(let k=0;k<3;k++){
    const p=D.positions[D.indices[t*3+k]],key=p.map(v=>Math.round(v*1000)).join(',');
    if(weld.has(key))join(t,weld.get(key));else weld.set(key,t);
  }
  const groups=new Map();
  for(let t=0;t<tris;t++){
    const id=find(t),g=groups.get(id)||{tris:0,lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity]};g.tris++;
    for(let k=0;k<3;k++){const p=D.positions[D.indices[t*3+k]];for(let q=0;q<3;q++){g.lo[q]=Math.min(g.lo[q],p[q]);g.hi[q]=Math.max(g.hi[q],p[q]);}}
    groups.set(id,g);
  }
  const all=[...groups.values()],B=bounds(D.positions),snap=Math.max(.35,Math.max(...B.size)*.05),ground=Math.max(.08,B.size[1]*.012);
  const gap=(a,b)=>Math.hypot(...[0,1,2].map(q=>Math.max(0,a.lo[q]-b.hi[q],b.lo[q]-a.hi[q])));
  const supported=new Set(all.map((g,i)=>g.lo[1]<=B.lo[1]+ground?i:-1).filter(i=>i>=0));
  let changed=true;while(changed){changed=false;for(let i=0;i<all.length;i++)if(!supported.has(i))for(const j of supported)if(gap(all[i],all[j])<=snap){supported.add(i);changed=true;break;}}
  return {count:all.length,floating:all.map((g,i)=>supported.has(i)?null:{component:i,triangles:g.tris,minY:g.lo[1]}).filter(Boolean)};
}
function inspectRuntime(name,D,S){
  if(!D||D.vertexCount!==S.vertexCount||D.indexCount!==S.indices.length)fail(`${name}: generated/source count mismatch`);
  if(D.pos.length!==D.vertexCount*3||D.nrm.length!==D.vertexCount*3||D.uv.length!==D.vertexCount*2||D.mat.length!==D.vertexCount)fail(`${name}: malformed generated arrays`);
  if(D.uvMode!=='runtime-planar')fail(`${name}: runtime UV mode is ${D.uvMode||'missing'}`);
  if(D.uv.every(v=>Math.abs(v)<1e-9))fail(`${name}: all-zero runtime UVs`);
  if(D.mat.some(m=>!Number.isInteger(m)||m<1||m>MATERIAL_COUNT))fail(`${name}: invalid encoded material ID`);
  const B=bounds(S.positions),declared=D.bounds;if(!declared||declared.flat().some(Number.isNaN))fail(`${name}: missing generated bounds`);
  for(let q=0;q<3;q++)if(Math.abs(declared[0][q]-B.lo[q])>.001||Math.abs(declared[1][q]-B.hi[q])>.001)fail(`${name}: stale generated bounds`);
  if(Math.abs(D.contactY-B.lo[1])>.01)fail(`${name}: contact plane ${D.contactY} does not match lowest support ${B.lo[1]}`);
  let reversed=0,degenerate=0,uvDegenerate=0,worst=1;
  for(let at=0;at<D.idx.length;at+=3){
    const ids=D.idx.slice(at,at+3),P=ids.map(i=>D.pos.slice(i*3,i*3+3)),N=ids.map(i=>D.nrm.slice(i*3,i*3+3)),U=ids.map(i=>D.uv.slice(i*2,i*2+2));
    const ab=P[1].map((v,q)=>v-P[0][q]),ac=P[2].map((v,q)=>v-P[0][q]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],area=Math.hypot(...n);
    if(area<1e-7){degenerate++;continue;}
    const avg=N[0].map((_,q)=>(N[0][q]+N[1][q]+N[2][q])/3);if(n.reduce((s,v,q)=>s+v*avg[q],0)<0)reversed++;
    const ua=Math.abs((U[1][0]-U[0][0])*(U[2][1]-U[0][1])-(U[1][1]-U[0][1])*(U[2][0]-U[0][0]));
    if(ua<1e-10){uvDegenerate++;continue;}
    const density=[];for(const [a,b] of [[0,1],[1,2],[2,0]]){const wd=Math.hypot(...P[a].map((v,q)=>v-P[b][q])),ud=Math.hypot(U[a][0]-U[b][0],U[a][1]-U[b][1]);if(wd>1e-7&&ud>1e-9)density.push(ud/wd);}
    if(density.length>1)worst=Math.max(worst,Math.max(...density)/Math.min(...density));
  }
  if(degenerate||reversed||uvDegenerate||worst>UV_STRETCH_MAX)fail(`${name}: geometry/UV gate ${JSON.stringify({degenerate,reversed,uvDegenerate,worst:+worst.toFixed(3)})}`);
  const parts=meshComponents(S);if(parts.floating.length)fail(`${name}: unsupported floating components ${JSON.stringify(parts.floating)}`);
  if(S.triangleBudget&&S.indices.length/3>S.triangleBudget)fail(`${name}: exceeds authored triangle budget`);
  if(S.indices.length/3>2000&&!Array.isArray(S.lods))fail(`${name}: >2000 triangles requires authored LODs`);
  return {asset:name,triangles:D.indexCount/3,materials:new Set(D.mat).size,components:parts.count,uvWorst:+worst.toFixed(3)};
}
const rows=[];
for(const file of files){const S=JSON.parse(fs.readFileSync(path.join(sourceDir,file),'utf8'));if(!live[S.name])fail(`${S.name}: missing generated runtime payload`);rows.push(inspectRuntime(S.name,live[S.name],S));}
for(const name of Object.keys(live))if(!rows.some(r=>r.asset===name))fail(`${name}: generated payload has no curated source`);
console.table(rows);console.log(`World asset QA passed: ${rows.length} curated models; contact, component, winding, UV, material, bounds and mobile LOD gates clean.`);
