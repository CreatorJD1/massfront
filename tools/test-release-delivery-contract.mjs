import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildMirrorManifest } from './mirror-release-contract.mjs';
import { validateReleaseIdentity,releaseDeliveryInventory,repointReleaseToMirror } from './release-delivery-contract.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const hash=digit=>digit.repeat(64);
const chunks=(size,digit)=>[
  {offset:0,size:Math.min(4,size),sha256:hash(digit)},
  ...(size>4?[{offset:4,size:size-4,sha256:hash(digit==='a'?'b':'a')}]:[])
];
const entry=(path,size,digit)=>({
  path,url:`https://huggingface.invalid/${path}`,size,sha256:hash(digit),chunks:chunks(size,'a'),
  delivery:{immutable:true}
});

function rooted(fullKind='array'){
  const common=entry('ota/runtime.js',8,'1');
  const fullOnly=entry('src/full-only.js',7,'2');
  const deltaOnly=entry('src/hotfix.js',3,'3');
  const source={schema:3,version:'9.8.7',channel:'stable',kind:'patch',category:'hotfix',patchFrom:'9.8.6',
    files:[structuredClone(common),deltaOnly],full:[common,fullOnly]};
  const payload=source.files.map(file=>`${file.path}|${file.size}|${file.sha256}|${file.chunks.map(c=>`${c.offset}|${c.size}|${c.sha256}`).join(',')}`).join('\n');
  const full=source.full.map(file=>`${file.path}|${file.size}|${file.sha256}|${file.chunks.map(c=>`${c.offset}|${c.size}|${c.sha256}`).join(',')}`).join('\n');
  const runtime=source.full.map(file=>`${file.path}|${file.size}|${file.sha256}`).join('\n');
  source.payloadRoot=sha(payload);source.fullRoot=sha(full);source.runtimeRoot=sha(runtime);
  source.manifestRoot=sha([
    'schema=3','channel=stable','version=9.8.7','kind=patch','category=hotfix','patchFrom=9.8.6',
    `payload=${source.payloadRoot}`,`full=${source.fullRoot}`,`runtime=${source.runtimeRoot}`
  ].join('\n'));
  if(fullKind==='object') source.full={mode:'fallback',files:source.full};
  return source;
}

for(const fullKind of ['array','object']){
  const source=rooted(fullKind),before=structuredClone(source);
  const mirror=buildMirrorManifest(source,{host:'https://mirror.invalid',version:source.version});
  const result=repointReleaseToMirror(source,mirror);
  assert.deepEqual(source,before,'pure repoint contract mutated its input');
  assert.equal(result.changed,4,'both payload entries and both full entries must be counted');
  assert.equal(result.manifest.files[1].url,'https://mirror.invalid/f/9.8.7/src/hotfix.js');
  const full=Array.isArray(result.manifest.full)?result.manifest.full:result.manifest.full.files;
  assert.equal(full[1].url,'https://mirror.invalid/f/9.8.7/src/full-only.js');
  assert.equal(Array.isArray(result.manifest.full),fullKind==='array','full fallback shape changed');
  assert.equal(result.manifest.manifestRoot,source.manifestRoot,'URL rewrite changed rooted identity');
  validateReleaseIdentity(result.manifest);
}

const base=rooted(),mirror=buildMirrorManifest(base,{host:'https://mirror.invalid',version:base.version});
const complete=releaseDeliveryInventory(base,'healthy delta/full fixture');
assert.equal(complete.ranged.length,2);
assert.deepEqual(complete.entries.filter(entry=>entry.fullOnly).map(entry=>entry.path),['src/full-only.js'],
  'full-only recovery entry disappeared from the delivery inventory');
const healthyDeltaBrokenFull=rooted();
healthyDeltaBrokenFull.full[1].chunks[1].offset++;
assert.throws(()=>releaseDeliveryInventory(healthyDeltaBrokenFull,'healthy delta / broken full fixture'),
  /chunk table/,'healthy delta hid a malformed full-only recovery payload');
const splitDelivery=rooted();
splitDelivery.full[0].url='https://other.invalid/ota/runtime.js';
assert.throws(()=>releaseDeliveryInventory(splitDelivery),/delivery URLs disagree/,
  'deduplication hid a broken full occurrence of a healthy delta path');
const reject=(mutate,pattern)=>{
  const changed=structuredClone(mirror);mutate(changed);
  assert.throws(()=>repointReleaseToMirror(base,changed),pattern);
};
reject(value=>{value.version='9.8.8';},/version|manifestRoot/);
reject(value=>{value.channel='preview';},/channel|manifestRoot/);
reject(value=>{value.files[1].size++;},/chunk table|payloadRoot|disagree/);
reject(value=>{value.files.reverse();},/payloadRoot/);
reject(value=>{value.full[1].sha256=hash('4');},/fullRoot/);
reject(value=>{value.full[0].chunks[0].offset=1;},/chunk table|disagree/);
reject(value=>{value.full.pop();},/fullRoot/);
reject(value=>{value.manifestRoot=hash('f');},/manifestRoot/);
reject(value=>{value.files[0].url='https://other.invalid/not-canonical';},/non-canonical/);
reject(value=>{value.base='http://mirror.invalid/f/9.8.7/';},/HTTPS/);

const objectMirror=buildMirrorManifest(rooted('object'),{host:'https://mirror.invalid',version:'9.8.7'});
assert.throws(()=>repointReleaseToMirror(base,objectMirror),/shape/);

const cli=await readFile(new URL('./repoint-manifests-to-mirror.mjs',import.meta.url),'utf8');
assert.doesNotMatch(cli,/\btmpdir\b/,'repoint staging escaped to the OS temp directory');
const dryExit=cli.indexOf('if(!apply){');
const firstWrite=cli.indexOf('await writeFile(');
const firstMkdir=cli.indexOf('await mkdir(');
assert.ok(dryExit>=0&&firstWrite>dryExit&&firstMkdir>dryExit,
  'dry-run path can reach a local or staging write');
assert.match(cli,/throw new Error\(`Required remote \$\{name\} is unavailable/,
  'missing required remote manifest no longer fails closed');
assert.match(cli,/repointReleaseToMirror\(remote,mirror/,
  'remote manifests no longer use the full+delta rooted delivery contract');
for(const name of ['probe-payload-cors.mjs','verify-release-channels.mjs']){
  const gate=await readFile(new URL(`./${name}`,import.meta.url),'utf8');
  assert.match(gate,/releaseDeliveryInventory\(/,`${name} bypasses complete rooted inventory validation`);
  assert.match(gate,/\.ranged/,`${name} no longer checks every range-bearing inventory entry`);
  assert.match(gate,/fullOnly/,`${name} no longer reports full-only recovery coverage`);
  assert.match(gate,/Range:'bytes=0-0'/,`${name} no longer bounds payload probes to one byte`);
  assert.match(gate,/body\?\.cancel/,`${name} no longer cancels unconsumed payload bodies`);
}

console.log(JSON.stringify({ok:true,fullShapes:['array','object'],repointedScopes:['files','full'],
  rejected:['healthy-delta-broken-full','split-delivery-url','version','channel','delta-size','delta-order',
    'full-hash','chunk-order','missing-full','root','url','http','shape']},null,2));
