import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(process.argv[2]||'modules/space_exploration/assets/runtime/models/uga-sections');
const source=await readFile('modules/space_exploration/assets/runtime/models/uga-authored-sections.glb');
const n=source.readUInt32LE(12),original=JSON.parse(source.subarray(20,20+n)),bin=source.subarray(28+n);
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(join(root,'delivery-manifest.json')));
assert.equal(manifest.sourceSha256,sha(source));
const resources=new Map();let total=0;
for(const item of manifest.resources){
  assert.match(item.uri,/^[a-zA-Z0-9.-]+$/,'Resource must be a local filename');
  assert(!resources.has(item.uri),'Duplicate manifest resource');
  const bytes=await readFile(join(root,item.uri));
  assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256);
  if(item.uri.endsWith('.png'))assert.equal(item.pngHasAlpha,[3,4,6].includes(bytes[25]),'PNG alpha metadata must match IHDR');
  resources.set(item.uri,bytes);total+=bytes.length;
}
assert.equal(total,manifest.totalBytes);
assert.equal(manifest.largestResourceBytes,Math.max(...[...resources.values()].map(b=>b.length)));
const doc=JSON.parse(resources.get(manifest.root));
const referenced=new Set([manifest.root]);
const buffers=doc.buffers.map(b=>{referenced.add(b.uri);assert(resources.has(b.uri),'Unlisted buffer');assert.equal(resources.get(b.uri).length,b.byteLength);return resources.get(b.uri);});
const imageViews=new Set(original.images.map(i=>i.bufferView)),map=new Map();let next=0;
function slice(index){const v=original.bufferViews[index];return bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);}
for(let i=0;i<original.bufferViews.length;i++){
  if(imageViews.has(i))continue;
  const v=doc.bufferViews[next];assert(v,'Missing geometry view');map.set(i,next++);
  assert.equal(v.byteOffset%4,0,'Geometry view must be 4-byte aligned');
  assert.deepEqual(buffers[v.buffer].subarray(v.byteOffset,v.byteOffset+v.byteLength),slice(i),`Geometry view ${i} changed`);
  const before={...original.bufferViews[i]},after={...v};
  delete before.buffer;delete before.byteOffset;delete after.buffer;delete after.byteOffset;
  assert.deepEqual(after,before,`Geometry view metadata ${i} changed`);
}
assert.equal(next,doc.bufferViews.length);
assert.equal(doc.images.length,original.images.length);
for(let i=0;i<doc.images.length;i++){
  const image=doc.images[i];referenced.add(image.uri);
  assert.deepEqual(resources.get(image.uri),slice(original.images[i].bufferView),`Image ${i} bytes changed`);
  const before={...original.images[i]},after={...image};delete before.bufferView;delete after.uri;
  assert.deepEqual(after,before,`Image ${i} metadata changed`);
}
assert.deepEqual([...referenced].sort(),[...resources.keys()].sort(),'Manifest must count every dependency exactly once');
const expected=structuredClone(original),actual=structuredClone(doc);
function remap(value){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){if(key==='bufferView'){assert(map.has(child));value[key]=map.get(child);}else remap(child);}}
for(const key of ['buffers','bufferViews','images']){delete expected[key];delete actual[key];}
remap(expected);assert.deepEqual(actual,expected,'Scene, accessor, material or texture semantics changed');
console.log(JSON.stringify({status:'PASS',sourceSha256:sha(source),geometryViews:next,exactImageBytes:doc.images.length,sceneSemanticsExact:true,totalBytes:total,manifestBytes:(await readFile(join(root,'delivery-manifest.json'))).length,resources:resources.size,largestResourceBytes:manifest.largestResourceBytes},null,2));
