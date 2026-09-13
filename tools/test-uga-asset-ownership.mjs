import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Real Three resource objects; only network/GLTF parsing is replaced. This
// proves loader ownership/disposal, not browser memory or rendered quality.
const rootUrl = new URL('../', import.meta.url);
const context = vm.createContext({console, URL});
vm.runInContext(await readFile(new URL('modules/space_exploration/lib/three.min.js',rootUrl),'utf8'),context);
const THREE = context.THREE;
THREE.GLTFLoader = function() {};
const pending=[];
context.fetch=async()=>({ok:true,json:async()=>({schema:'massfront.uga-shared-resource-delivery.v1',resources:[]})});
context.createRuntimeGltfLoader=()=>({register(){return this;},load(url,done,progress,fail){pending.push({url,done,fail});}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
let source=await readFile(new URL('modules/space_exploration/src/ship/uga_blender_assets.js',rootUrl),'utf8');
source=source.replace(/^import .*;$/m,'').replace(/import\.meta\.url/g,JSON.stringify(new URL('modules/space_exploration/src/ship/uga_blender_assets.js',rootUrl).href)).replace(/^export /gm,'');
vm.runInContext(source+'\nglobalThis.api={loadNexusVII,loadUgaCommandCutaway,clearUgaAssetCache,disposeCachedScene};',context);
const {api}=context;
const instances=[];
function scene() {
  const root=new THREE.Group(),geometry=new THREE.BoxGeometry(2,3,4),texture=new THREE.Texture({width:2,height:2});
  const material=new THREE.MeshStandardMaterial({map:texture,emissive:0x123456,emissiveIntensity:0.7,envMapIntensity:0.3});
  material.userData={runtime_emissive_strength:2.5};
  const a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material);
  a.name='DISTRICT_engineering';a.userData={district_id:'engineering'};a.position.set(1,2,3);
  root.add(a,b);const disposed={geometry:0,texture:0,material:0};
  for(const [key,value] of Object.entries({geometry,texture,material}))value.addEventListener('dispose',()=>disposed[key]++);
  const item={root,geometry,texture,material,disposed};instances.push(item);return item;
}
const first=api.loadUgaCommandCutaway(),a=scene();await settle();pending.shift().done({scene:a.root});
assert.equal(await first,a.root,'exclusive loader transfers the original parsed root');
assert.equal(a.root.children[0].geometry,a.geometry,'geometry is not cloned');
assert.equal(a.root.children[0].material,a.material,'materials remain locally owned');
assert.equal(a.material.map,a.texture,'texture object is not cloned');
assert.deepEqual(Array.from(a.root.children[0].position.toArray()),[1,2,3]);
assert.equal(a.root.children[0].userData.district_id,'engineering');
assert.equal(a.material.emissiveIntensity,2.5);assert.equal(a.material.userData.baseEmissiveIntensity,2.5);
assert.equal(a.material.envMapIntensity,1.25,'legacy presentation adjustment retained');
api.clearUgaAssetCache();await Promise.resolve();
assert.deepEqual(a.disposed,{geometry:0,texture:0,material:0},'cache clear never disposes command owner');

const second=api.loadUgaCommandCutaway(),third=api.loadUgaCommandCutaway();
await settle();
assert.equal(pending.length,2,'concurrent owners never share one mutable scene');
const b=scene(),c=scene();pending.shift().done({scene:b.root});pending.shift().done({scene:c.root});
assert.equal(await second,b.root);assert.equal(await third,c.root);
api.disposeCachedScene(a.root);
assert.deepEqual(a.disposed,{geometry:1,texture:1,material:1},'one scene releases shared local resources exactly once');
assert.deepEqual(b.disposed,{geometry:0,texture:0,material:0},'disposing one caller cannot blank another');

const failure=api.loadUgaCommandCutaway();await settle();pending.shift().fail(new Error('transient'));
await assert.rejects(failure,/transient/);
const retry=api.loadUgaCommandCutaway(),d=scene();await settle();pending.shift().done({scene:d.root});assert.equal(await retry,d.root);
const cancelled=api.loadUgaCommandCutaway(),e=scene();api.clearUgaAssetCache();await settle();pending.shift().done({scene:e.root});
api.disposeCachedScene(await cancelled);
assert.deepEqual(e.disposed,{geometry:1,texture:1,material:1},'late caller-owned completion remains safely disposable');

const ship1=api.loadNexusVII(),ship2=api.loadNexusVII(),master=scene();
assert.equal(pending.length,1,'exterior load coalescing is unchanged');pending.shift().done({scene:master.root});
const [s1,s2]=await Promise.all([ship1,ship2]);
assert.notEqual(s1,master.root);assert.notEqual(s1.children[0].geometry,s2.children[0].geometry);
assert.equal(s1.children[0].material.emissiveIntensity,a.material.emissiveIntensity);
assert.equal(s1.children[0].material.envMapIntensity,a.material.envMapIntensity);
assert.equal(s1.children[0].material.map.image,master.texture.image);
api.clearUgaAssetCache();await Promise.resolve();await Promise.resolve();
assert.deepEqual(master.disposed,{geometry:1,texture:1,material:1});
assert.equal(s1.children[0].geometry.getAttribute('position').count,24,'exterior clone survives cache clear');
for(const item of [b,c,d])api.disposeCachedScene(item.root);
api.disposeCachedScene(s1);api.disposeCachedScene(s2);
console.log(JSON.stringify({status:'PASS',exclusiveCommandOwnership:true,commandGeometryCopiesPerLoad:1,retainedCommandMasters:0,concurrentIsolation:true,retry:true,lateCompletionDisposal:true,exteriorCachePreserved:true,source:fileURLToPath(new URL('modules/space_exploration/src/ship/uga_blender_assets.js',rootUrl))}));
