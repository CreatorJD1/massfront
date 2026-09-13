import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {ugaSharedRuntimePaths, expectedAllowlistPaths} from '../modules/space_exploration/tools/readiness/readiness-core.mjs';

const prefix='assets/runtime/models/uga-sections/';
const root=new URL('../modules/space_exploration/'+prefix,import.meta.url);
const records=(await readdir(root)).map(name=>({path:prefix+name}));
const manifest=JSON.parse(await readFile(new URL('delivery-manifest.json',root)));
const complete=ugaSharedRuntimePaths(records);
assert.equal(complete.length,manifest.resources.length+1);
assert(complete.includes(prefix+'scene.gltf'));
for(const resource of manifest.resources)assert(complete.includes(prefix+resource.uri));
const buffer=manifest.resources.find(resource=>resource.kind==='geometry'||resource.uri.endsWith('.bin'));
assert(buffer);
assert.throws(()=>ugaSharedRuntimePaths(records.filter(record=>record.path!==prefix+buffer.uri)),/missing UGA resource/);
const image=manifest.resources.find(resource=>resource.kind==='image');
assert.throws(()=>ugaSharedRuntimePaths(records.filter(record=>record.path!==prefix+image.uri)),/missing UGA resource/);
const allow=expectedAllowlistPaths([...records,{path:prefix+'superseded.bin'},
  {path:'assets/runtime/models/uga-authored-sections.glb'}]);
assert(!allow.includes(prefix+'superseded.bin'),'Directory leftovers cannot ride inside a player package');
assert(!allow.includes('assets/runtime/models/uga-authored-sections.glb'),'Do not double-package the preserved monolith');
assert.equal(ugaSharedRuntimePaths([]),null,'Legacy fixtures retain their explicit GLB contract');
console.log(JSON.stringify({pass:true,allResourcesCounted:manifest.resources.length,
  aggregateBytes:manifest.totalBytes,manifestBytes:(await readFile(new URL('delivery-manifest.json',root))).length,
  missingGeometryRejected:true,missingImageRejected:true,supersededFilesExcluded:true,
  claim:'Integrity and package closure only; not mobile GPU or scene-budget approval.'}));
