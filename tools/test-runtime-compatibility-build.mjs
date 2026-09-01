import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRuntimeCompatibility, compatibilityEntry, compatibilityRoot,
        RUNTIME_COMPATIBILITY_GLOBAL} from './runtime-compatibility.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const stage=resolve(root,process.argv[2]||'tmp/stage15-runtime-compatibility');
const www=join(root,'www');
const packagedPath=join(www,'assets/data/runtime-compatibility.json');
const otaPath=join(stage,'runtime-compatibility.json');

function validateDescriptor(descriptor,readArtifact,label){
  assert.equal(descriptor.schema,'massfront.runtime-compatibility',label+' schema');
  assert.equal(descriptor.schemaVersion,1,label+' schema version');
  assert.match(descriptor.buildVersion,/^\d+\.\d+\.\d+$/,label+' build version');
  assert.match(descriptor.manifestHash,/^[0-9a-f]{64}$/,label+' manifest hash');
  assert.match(descriptor.balanceHash,/^[0-9a-f]{64}$/,label+' balance hash');
  assert.ok(descriptor.manifestEntries.length>descriptor.balanceEntries.length,
    label+' manifest must be broader than balance authority');
  const paths=new Set();
  for(const row of descriptor.manifestEntries){
    assert.ok(!paths.has(row.path),label+' duplicate '+row.path);
    paths.add(row.path);
    assert.deepEqual(compatibilityEntry(row.path,readArtifact(row.path)),row,
      label+' exact bytes '+row.path);
  }
  assert.equal(compatibilityRoot('massfront.runtime-manifest.v1',descriptor.manifestEntries),
    descriptor.manifestHash,label+' canonical manifest root');
  for(const row of descriptor.balanceEntries){
    assert.ok(paths.has(row.path),label+' balance path outside manifest '+row.path);
    assert.deepEqual(compatibilityEntry(row.path,readArtifact(row.path)),row,
      label+' exact balance bytes '+row.path);
  }
  assert.equal(compatibilityRoot('massfront.balance-authority.v1',descriptor.balanceEntries),
    descriptor.balanceHash,label+' canonical balance root');
}

assert.ok(existsSync(packagedPath),'run node tools/pack-www.mjs before this test');
assert.ok(existsSync(otaPath),'run bundle-update with MASSFRONT_UPDATE_STAGE_DIR='+stage+' before this test');

const packaged=JSON.parse(readFileSync(packagedPath,'utf8'));
validateDescriptor(packaged,path=>readFileSync(join(www,path)),'packaged');
assert.ok(!packaged.manifestEntries.some(row=>row.path==='assets/data/runtime-compatibility.json'),
  'packaged descriptor must not hash itself');

const ota=JSON.parse(readFileSync(otaPath,'utf8'));
validateDescriptor(ota,path=>readFileSync(join(stage,path)),'ota');
assert.ok(!ota.manifestEntries.some(row=>row.path==='ota/00-runtime.js'),
  'OTA descriptor carrier must not hash itself');
const runtime=readFileSync(join(stage,'ota/00-runtime.js'),'utf8');
const prefix='window.'+RUNTIME_COMPATIBILITY_GLOBAL+'=';
const start=runtime.indexOf(prefix);
const end=runtime.indexOf(';\n(function(){',start);
assert.ok(start>=0&&end>start,'OTA runtime global assignment missing');
assert.deepEqual(JSON.parse(runtime.slice(start+prefix.length,end)),ota,
  'OTA runtime global and reproducibility sidecar differ');

/* Adversarial properties: order and every byte are binding; a presentation
   artifact cannot perturb the explicit balance authority, while an authority
   byte must perturb both roots. */
const fixture=[
  {path:'index.html',bytes:Buffer.from('shell')},
  {path:'src/game/sim.js',bytes:Buffer.from('authority')}
];
const spec={buildVersion:'9.9.9',channel:'test',manifestArtifacts:fixture,
  balancePaths:['src/game/sim.js'],excluded:['descriptor']};
const a=buildRuntimeCompatibility(spec);
const a2=buildRuntimeCompatibility(spec);
assert.deepEqual(a2,a,'same ordered bytes must reproduce exactly');
const reordered=buildRuntimeCompatibility({...spec,manifestArtifacts:[fixture[1],fixture[0]]});
assert.notEqual(reordered.manifestHash,a.manifestHash,'manifest order must bind root');
assert.equal(reordered.balanceHash,a.balanceHash,'manifest order must not reorder explicit authority');
const shellTamper=buildRuntimeCompatibility({...spec,manifestArtifacts:[
  {path:'index.html',bytes:Buffer.from('sHell')},fixture[1]]});
assert.notEqual(shellTamper.manifestHash,a.manifestHash,'non-authority tamper must alter manifest');
assert.equal(shellTamper.balanceHash,a.balanceHash,'non-authority tamper must not alter balance');
const simTamper=buildRuntimeCompatibility({...spec,manifestArtifacts:[fixture[0],
  {path:'src/game/sim.js',bytes:Buffer.from('authoritY')}]});
assert.notEqual(simTamper.manifestHash,a.manifestHash,'authority tamper must alter manifest');
assert.notEqual(simTamper.balanceHash,a.balanceHash,'authority tamper must alter balance');
assert.throws(()=>compatibilityRoot('x',[compatibilityEntry('a',Buffer.from('1')),
  compatibilityEntry('a',Buffer.from('2'))]),/duplicate/,'duplicate path must fail closed');
assert.throws(()=>compatibilityEntry('../escape',Buffer.alloc(0)),/normalized/,
  'path traversal must fail closed');
assert.throws(()=>buildRuntimeCompatibility({...spec,balancePaths:['missing.js']}),/absent/,
  'missing authority must fail closed');

console.log('runtime compatibility build PASS');
console.log('  packaged '+packaged.manifestEntries.length+' files '+packaged.manifestHash+' / '+packaged.balanceHash);
console.log('  ota '+ota.manifestEntries.length+' files '+ota.manifestHash+' / '+ota.balanceHash);
console.log('  adversarial: reorder, byte tamper, duplicate, traversal, missing authority PASS');
