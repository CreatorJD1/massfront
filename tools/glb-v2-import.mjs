/* Hierarchy-preserving GLB -> Material V2 benchmark payload.

   This intentionally does not modify tools/glb_import.mjs or meshes.js. The
   legacy importer reads only meshes[0] and replaces the shared mesh database;
   using it for an authored multi-node vehicle would silently discard most of
   the asset. This importer traverses the selected GLB scene, applies node
   transforms, preserves semantic material regions and records named sockets,
   then writes one dedicated opt-in payload for the Material V2 laboratory.

   Usage:
     node tools/glb-v2-import.mjs <input.glb> <output.js> [assetName]
*/
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';

const [inputArg,outputArg,assetArg='novaHeavyTankV2']=process.argv.slice(2);
if(!inputArg||!outputArg){
  console.error('usage: node tools/glb-v2-import.mjs <input.glb> <output.js> [assetName]');
  process.exit(1);
}
const input=resolve(inputArg),output=resolve(outputArg),buf=readFileSync(input);

function parseGLB(b){
  if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(4)!==2)throw Error('expected glTF 2.0 GLB');
  let off=12,json=null,bin=null;
  while(off+8<=b.length){
    const len=b.readUInt32LE(off),type=b.readUInt32LE(off+4),chunk=b.subarray(off+8,off+8+len);
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8').replace(/\0+$/,''));
    else if(type===0x004e4942)bin=chunk;
    off+=8+len;
  }
  if(!json||!bin)throw Error('GLB is missing JSON or BIN chunk');
  return {json,bin};
}
const glb=parseGLB(buf),g=glb.json;
const comps={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function accessor(id){
  const a=g.accessors[id];if(!a||a.bufferView==null)throw Error('unsupported accessor '+id);
  const v=g.bufferViews[a.bufferView],ci=comps[a.componentType],n=widths[a.type];
  if(!ci||!n)throw Error('unsupported accessor encoding '+a.componentType+'/'+a.type);
  const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||ci[0]*n,out=new Array(a.count);
  for(let i=0;i<a.count;i++){
    const row=new Array(n),base=start+i*stride;
    for(let k=0;k<n;k++){
      let x=glb.bin[ci[1]](base+k*ci[0]);
      if(a.normalized&&a.componentType!==5126){
        if(a.componentType===5120)x=Math.max(-1,x/127);
        else if(a.componentType===5121)x/=255;
        else if(a.componentType===5122)x=Math.max(-1,x/32767);
        else if(a.componentType===5123)x/=65535;
      }
      row[k]=x;
    }
    out[i]=row;
  }
  return out;
}
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mul(a,b){
  const o=new Array(16).fill(0);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];
  return o;
}
function local(n){
  if(n.matrix)return n.matrix.slice();
  const t=n.translation||[0,0,0],q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1];
  const [x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return [(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,
          (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0,
          (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0,t[0],t[1],t[2],1];
}
function point(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function normal(m,n){
  const x=m[0]*n[0]+m[4]*n[1]+m[8]*n[2],y=m[1]*n[0]+m[5]*n[1]+m[9]*n[2],z=m[2]*n[0]+m[6]*n[1]+m[10]*n[2],l=Math.hypot(x,y,z)||1;
  return [x/l,y/l,z/l];
}
const semNames=['armor','structure','machine','weapon','glass','energy'];
function semantic(name=''){
  const n=name.toUpperCase();
  if(n.includes('TEAM_PRIMARY'))return [0,1];
  if(n.includes('TEAM_SECONDARY'))return [0,2];
  if(n.includes('STRUCTURE'))return [1,0];
  if(n.includes('MACHINE'))return [2,0];
  if(n.includes('WEAPON'))return [3,0];
  if(n.includes('GLASS'))return [4,0];
  if(n.includes('ENERGY'))return [5,0];
  return [0,0];
}
const P=[],N=[],UV=[],SEM=[],FLAG=[],IDX=[],sockets={},partNames=[],materialSet=new Set();
const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
function visit(id,parent){
  const node=g.nodes[id],world=mul(parent,local(node));
  if((node.name||'').startsWith('socket_'))sockets[node.name]=world.map(v=>+v.toFixed(6));
  if(node.mesh!=null){
    const mesh=g.meshes[node.mesh];partNames.push(node.name||mesh.name||('node_'+id));
    for(const prim of mesh.primitives){
      if(prim.mode!=null&&prim.mode!==4)throw Error('only TRIANGLES primitives are supported');
      const pa=accessor(prim.attributes.POSITION),na=prim.attributes.NORMAL!=null?accessor(prim.attributes.NORMAL):null;
      const ua=prim.attributes.TEXCOORD_0!=null?accessor(prim.attributes.TEXCOORD_0):null;
      const ia=prim.indices!=null?accessor(prim.indices):pa.map((_,i)=>[i]);
      const matName=g.materials?.[prim.material||0]?.name||'MF2_ARMOR',[sem,flag]=semantic(matName);materialSet.add(matName);
      const base=P.length/3;
      for(let k=0;k<pa.length;k++){
        const p=point(world,pa[k]),n=normal(world,na?na[k]:[0,1,0]),uv=ua?ua[k]:[0,0];
        P.push(...p);N.push(...n);UV.push(uv[0],uv[1]);SEM.push(sem);FLAG.push(flag);
        for(let a=0;a<3;a++){bounds.min[a]=Math.min(bounds.min[a],p[a]);bounds.max[a]=Math.max(bounds.max[a],p[a]);}
      }
      for(let k=0;k<ia.length;k+=3)IDX.push(base+ia[k][0],base+ia[k+1][0],base+ia[k+2][0]);
    }
  }
  for(const child of node.children||[])visit(child,world);
}
const scene=g.scenes[g.scene||0];for(const id of scene.nodes||[])visit(id,I);
const verts=P.length/3,tris=IDX.length/3;
if(verts>65535)throw Error(`${verts} vertices exceed the runtime Uint16 benchmark limit`);
const fmt=(a,d=5)=>'['+a.map(v=>Number.isInteger(v)?String(v):(+v.toFixed(d)).toString()).join(',')+']';
const meta={version:2,source:relative(process.cwd(),input).replaceAll('\\','/'),nodes:g.nodes.length,parts:partNames.length,
  vertices:verts,triangles:tris,materials:[...materialSet],sockets:Object.keys(sockets),bounds};
const js=`/* GENERATED by tools/glb-v2-import.mjs — do not hand-edit. */\n`+
  `var MF2_IMPORTED_GEO=typeof MF2_IMPORTED_GEO==='object'?MF2_IMPORTED_GEO:{};\n`+
  `MF2_IMPORTED_GEO[${JSON.stringify(assetArg)}]={meta:${JSON.stringify(meta)},`+
  `p:new Float32Array(${fmt(P)}),n:new Float32Array(${fmt(N)}),uv:new Float32Array(${fmt(UV)}),`+
  `sem:new Uint8Array(${fmt(SEM,0)}),flag:new Uint8Array(${fmt(FLAG,0)}),i:new Uint16Array(${fmt(IDX,0)}),sockets:${JSON.stringify(sockets)}};\n`;
writeFileSync(output,js,'utf8');
console.log(JSON.stringify({output:relative(process.cwd(),output),...meta},null,2));
