#!/usr/bin/env node
/* Focused InstMesh instance-upload contract probe.
   It evaluates the live class from src/engine/mesh.js against a deterministic
   WebGL spy; no renderer, browser, or GPU state is simulated beyond the calls
   relevant to bindShadow() -> flush(). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(toolDir,'..');
const meshPath=path.join(root,'src','engine','mesh.js');
const outDir=path.join(root,'.tmp','instmesh-upload');
const argAt=process.argv.findIndex(v=>v==='--expect');
const expect=(process.argv.find(v=>v.startsWith('--expect='))||'').split('=')[1]||
  (argAt>=0?process.argv[argAt+1]:'optimized');
if(expect!=='baseline'&&expect!=='optimized'){
  console.error('probe-instmesh-upload: --expect must be baseline or optimized');
  process.exit(2);
}

const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const readMesh=()=>fs.readFileSync(meshPath);
const meshBefore=readMesh();
const source=meshBefore.toString('utf8');
const start=source.indexOf('const VSTRIDE=');
const end=source.indexOf('\nlet drawCalls=',start);
if(start<0||end<0) throw new Error('InstMesh source boundaries were not found');

const context=vm.createContext({
  console,
  clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
});
vm.runInContext(`
  const VFLOATS=12;
  let drawCalls=0,triCount=0,MF_PROG_MODEL=false;
  let prog3D=null,U3={},MF_ASSET_ON=false,matTex=null;
  ${source.slice(start,end)}
  this.__InstMesh=InstMesh;
`,context,{filename:'mesh-instmesh-fixture.js'});
const InstMesh=context.__InstMesh;

let glSerial=0;
function makeGL(){
  let bufferSerial=0;
  const stats={uploadCalls:0,uploadBytes:0,allocCalls:0,allocBytes:0,drawCalls:0,instances:0};
  const gl={
    __id:++glSerial,__stats:stats,
    ARRAY_BUFFER:0x8892,ELEMENT_ARRAY_BUFFER:0x8893,STATIC_DRAW:0x88E4,DYNAMIC_DRAW:0x88E8,
    FLOAT:0x1406,TRIANGLES:0x0004,UNSIGNED_SHORT:0x1403,
    TEXTURE0:0x84C0,TEXTURE4:0x84C4,TEXTURE5:0x84C5,TEXTURE6:0x84C6,TEXTURE_2D:0x0DE1,
    createVertexArray(){return {kind:'vao',gl:gl.__id,id:++bufferSerial};},
    bindVertexArray(){},
    createBuffer(){return {kind:'buffer',gl:gl.__id,id:++bufferSerial};},
    bindBuffer(){},
    bufferData(_target,data){
      stats.allocCalls++;
      stats.allocBytes+=typeof data==='number'?data:(data&&data.byteLength)||0;
    },
    bufferSubData(_target,_offset,data,srcOffset,length){
      const elems=Number.isFinite(length)?length:Math.max(0,(data?.length||0)-(srcOffset||0));
      stats.uploadCalls++;
      stats.uploadBytes+=elems*((data&&data.BYTES_PER_ELEMENT)||1);
    },
    enableVertexAttribArray(){},vertexAttribPointer(){},vertexAttribDivisor(){},
    drawElementsInstanced(_mode,_count,_type,_offset,instances){
      stats.drawCalls++;stats.instances+=instances;
    },
    activeTexture(){},bindTexture(){},uniform1f(){},uniform1i(){},uniform4fv(){},uniform2fv(){},
  };
  return gl;
}
function resetStats(gl){for(const key of Object.keys(gl.__stats))gl.__stats[key]=0;}
function snap(gl){return {...gl.__stats};}
function merge(...rows){
  const out={uploadCalls:0,uploadBytes:0,allocCalls:0,allocBytes:0,drawCalls:0,instances:0};
  for(const row of rows)for(const key of Object.keys(out))out[key]+=row[key]||0;
  return out;
}
function geometry(){
  return {count:3,v:new Float32Array(36),i:new Uint16Array([0,1,2]),bones:0};
}
function add(M,x=10){M.add(x,20,3,1,.25,80,160,240,255,1,0,.1);}
function shadow(M,gl){
  if(!M.bindShadow(gl))throw new Error('bindShadow unexpectedly returned false');
  M.drawShadow(gl);
}

const cases={};
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),2);add(M);resetStats(gl);
  shadow(M,gl);M.flush(gl);cases.unchangedShadowColor=snap(gl);
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),3);add(M);resetStats(gl);
  shadow(M,gl);add(M,30);M.flush(gl);cases.countChange=snap(gl);
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),2);add(M,10);resetStats(gl);
  shadow(M,gl);M.clear();add(M,99);M.flush(gl);cases.sameCountMutation=snap(gl);
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),1);add(M);resetStats(gl);
  shadow(M,gl);add(M,30);M.flush(gl);cases.growBetweenPasses=snap(gl);
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),2);add(M);resetStats(gl);
  shadow(M,gl);M.ivb=gl.createBuffer();M.flush(gl);cases.newBufferBetweenPasses=snap(gl);
}
{
  const glA=makeGL(),glB=makeGL(),M=new InstMesh(glA,geometry(),2);add(M);
  resetStats(glA);resetStats(glB);shadow(M,glA);M.flush(glB);
  cases.newContextBetweenPasses=merge(snap(glA),snap(glB));
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),2);add(M);resetStats(gl);
  shadow(M,gl);M.flush(gl);resetStats(gl);
  add(M);shadow(M,gl);M.flush(gl);cases.nextFrameRewritten=snap(gl);
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),2);add(M);resetStats(gl);
  shadow(M,gl);shadow(M,gl);M.flush(gl);cases.repeatedShadow=snap(gl);
}
{
  const gl=makeGL(),M=new InstMesh(gl,geometry(),2);add(M);resetStats(gl);
  M.flush(gl);cases.colorOnly=snap(gl);
}

const expected={
  baseline:{
    unchangedShadowColor:[2,96,2],countChange:[2,144,2],sameCountMutation:[2,96,2],
    growBetweenPasses:[2,144,2],newBufferBetweenPasses:[2,96,2],newContextBetweenPasses:[2,96,2],
    nextFrameRewritten:[2,96,2],repeatedShadow:[3,144,3],colorOnly:[1,48,1],
  },
  optimized:{
    unchangedShadowColor:[1,48,2],countChange:[2,144,2],sameCountMutation:[2,96,2],
    growBetweenPasses:[2,144,2],newBufferBetweenPasses:[2,96,2],newContextBetweenPasses:[2,96,2],
    nextFrameRewritten:[1,48,2],repeatedShadow:[1,48,3],colorOnly:[1,48,1],
  },
}[expect];
const failures=[];
for(const [name,want] of Object.entries(expected)){
  const got=cases[name];
  if(!got||got.uploadCalls!==want[0]||got.uploadBytes!==want[1]||got.drawCalls!==want[2])
    failures.push(`${name}: got uploads=${got?.uploadCalls}/${got?.uploadBytes}B draws=${got?.drawCalls}; expected ${want[0]}/${want[1]}B draws=${want[2]}`);
}
if(cases.growBetweenPasses.allocCalls<1)failures.push('growBetweenPasses: no buffer reallocation was observed');
if(cases.newBufferBetweenPasses.instances!==2)failures.push('newBufferBetweenPasses: instance draw count changed');

let head='unknown',status='';
try{
  head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  status=execFileSync('git',['status','--porcelain=v1','-z'],{cwd:root,encoding:'buffer'}).toString('binary');
}catch{}
const meshAfter=readMesh();
const report={
  schema:'massfront-instmesh-upload-probe-v1',capturedAt:new Date().toISOString(),expect,
  pass:failures.length===0,failures,
  provenance:{root,head,dirty:status.length>0,worktreeStatusSha256:sha256(Buffer.from(status,'binary')),
    mesh:{bytes:meshBefore.length,sha256:sha256(meshBefore)},sourceStableDuringRun:sha256(meshBefore)===sha256(meshAfter)},
  contract:{instanceFloats:12,instanceBytes:48},cases,
};
fs.mkdirSync(outDir,{recursive:true});
const outPath=path.join(outDir,expect==='baseline'?'baseline.json':'after.json');
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
console.log(`probe-instmesh-upload: ${report.pass?'PASS':'FAIL'} (${expect})`);
console.log(`mesh sha256 ${report.provenance.mesh.sha256}`);
for(const [name,row] of Object.entries(cases))
  console.log(`${name}: uploads=${row.uploadCalls} bytes=${row.uploadBytes} draws=${row.drawCalls} instances=${row.instances}`);
console.log(`report ${path.relative(root,outPath)}`);
if(failures.length){for(const failure of failures)console.error(`FAIL ${failure}`);process.exit(1);}
