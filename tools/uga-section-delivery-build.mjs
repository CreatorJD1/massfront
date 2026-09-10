import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';

const source=resolve('modules/space_exploration/assets/runtime/models/uga-authored-sections.glb');
const output=resolve('modules/space_exploration/assets/runtime/models/uga-sections');
const limit=4*1024*1024,sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(source),jsonLength=bytes.readUInt32LE(12);
const original=JSON.parse(bytes.subarray(20,20+jsonLength)),doc=structuredClone(original),bin=bytes.subarray(28+jsonLength);
if(original.buffers.length!==1||original.buffers[0].uri)throw Error('Expected one embedded GLB buffer');
const imageViews=new Set(original.images.map(image=>image.bufferView));
if(imageViews.has(undefined))throw Error('Expected embedded source images');
const resources=[],chunks=[],slices=new Map(),viewMap=new Map(),views=[];let current=[],currentBytes=0;
function flush(){if(!currentBytes)return;const content=Buffer.concat(current,currentBytes),uri=`geometry-${sha(content)}.bin`;chunks.push({content,uri});current=[];currentBytes=0;}
function sourceView(index){const v=original.bufferViews[index];return bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);}
for(const [index,view]of original.bufferViews.entries()){
  if(imageViews.has(index))continue;
  const content=sourceView(index),hash=sha(content);let slice=slices.get(hash);
  if(!slice){
    const padding=(4-currentBytes%4)%4;
    if(currentBytes+padding+content.length>limit)flush();
    if(content.length>limit)throw Error(`Single view exceeds4MiB:${index}`);
    const alignedPadding=(4-currentBytes%4)%4;
    if(alignedPadding){current.push(Buffer.alloc(alignedPadding));currentBytes+=alignedPadding;}
    slice={buffer:chunks.length,byteOffset:currentBytes};slices.set(hash,slice);current.push(content);currentBytes+=content.length;
  }
  viewMap.set(index,views.length);views.push({...view,...slice});
}
flush();
doc.images=original.images.map((image,index)=>{
  const content=sourceView(image.bufferView),extension=image.mimeType==='image/png'?'png':image.mimeType==='image/webp'?'webp':null;
  if(!extension)throw Error(`Unsupported source image MIME:${image.mimeType}`);
  const uri=`image-${sha(content)}.${extension}`,pngHasAlpha=extension==='png'?[3,4,6].includes(content[25]):undefined;
  resources.push({uri,content,kind:'image',sourceImage:index,pngHasAlpha});
  const next={...image,uri};delete next.bufferView;return next;
});
doc.bufferViews=views;
// Repoint every geometry/sparse/extension view reference while preserving all
// accessor component types, count, normalization, offsets and stride metadata.
function remap(value){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='bufferView'){if(!viewMap.has(child))throw Error(`Geometry references image view:${child}`);value[key]=viewMap.get(child);}else remap(child);}}
for(const [key,value]of Object.entries(doc))if(!['bufferViews','images','buffers'].includes(key))remap(value);
doc.buffers=chunks.map(({content,uri})=>({uri,byteLength:content.length}));
for(const chunk of chunks)resources.push({...chunk,kind:'geometry'});
const scene=Buffer.from(JSON.stringify(doc));resources.push({uri:'scene.gltf',content:scene,kind:'scene'});
const unique=new Map();for(const resource of resources)unique.set(resource.uri,resource);
await mkdir(output,{recursive:true});
for(const resource of unique.values())await writeFile(join(output,resource.uri),resource.content);
const manifest={schema:'massfront.uga-shared-resource-delivery.v1',sourceSha256:sha(bytes),sourceBytes:bytes.length,root:'scene.gltf',chunkLimitBytes:limit,geometryViews:views.length,originalGeometryBytes:original.bufferViews.reduce((sum,v,i)=>sum+(imageViews.has(i)?0:v.byteLength),0),uniqueGeometryBytes:chunks.reduce((sum,c)=>sum+c.content.length,0),images:original.images.length,totalBytes:[...unique.values()].reduce((sum,r)=>sum+r.content.length,0),largestResourceBytes:Math.max(...[...unique.values()].map(r=>r.content.length)),resources:[...unique.values()].map(r=>({uri:r.uri,kind:r.kind,bytes:r.content.length,sha256:sha(r.content),...(r.pngHasAlpha===undefined?{}:{pngHasAlpha:r.pngHasAlpha})}))};
await writeFile(join(output,'delivery-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,sourceBytes:bytes.length,totalBytes:manifest.totalBytes,uniqueGeometryBytes:manifest.uniqueGeometryBytes,largestResourceBytes:manifest.largestResourceBytes,resources:manifest.resources.length},null,2));
