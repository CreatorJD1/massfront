import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  releaseInventory,buildMirrorManifest,assertManifestExact,rangeProbeEntries,
  verifyEntryRanges,verifyRangeResponse
} from './mirror-release-contract.mjs';

const hash=value=>value.repeat(64);
const entry=(path,size,digit,chunks=[])=>({
  path,url:`https://origin.invalid/${path}`,size,sha256:hash(digit),chunks,
  delivery:{immutable:true}
});
const chunks=size=>[
  {offset:0,size:Math.min(4,size),sha256:hash('a')},
  {offset:Math.min(4,size),size:Math.max(0,size-4),sha256:hash('b')}
];
const common=entry('ota/common.js',8,'1',chunks(8));
const payloadOnly=entry('ota/hotfix.js',3,'2',[{offset:0,size:3,sha256:hash('2')}]);
const fullOnly=entry('src/full-only.js',6,'3',chunks(6));
const source={schema:3,version:'9.8.7',channel:'stable',manifestRoot:hash('4'),
  payloadRoot:hash('5'),fullRoot:hash('6'),runtimeRoot:hash('7'),
  optionalPacks:[{id:'voice',optional:true}],files:[common,payloadOnly],
  full:{mode:'fallback',files:[structuredClone(common),fullOnly]}};

/* Keep the pure contracts wired into the destructive CLI in the required
   order: complete inventory -> public Range proof -> mutable pointer. */
const cli=fs.readFileSync(new URL('./mirror-release-to-cloudflare.mjs',import.meta.url),'utf8');
const activation=fs.readFileSync(new URL('./release-activation-contract.mjs',import.meta.url),'utf8');
const rangeGate=activation.indexOf('await verifyPayloads(candidate)');
const activationWrite=activation.indexOf('await publish(candidate,current)');
const activationCheck=activation.indexOf('assertManifestExact(await readCurrent(),candidate');
assert.match(cli,/for\(const entry of delivery\.entries\)/,
  'mirror CLI no longer iterates the complete full+payload inventory');
assert.match(cli,/activateWithChecks\(/,'mirror pointer bypasses guarded activation');
assert.ok(rangeGate>=0&&activationWrite>rangeGate,
  'mutable latest.json write moved ahead of public Range verification');
assert.ok(activationCheck>activationWrite,
  'post-activation exact manifest verification is not wired after latest.json');

const inventory=releaseInventory(source);
assert.equal(inventory.fullKind,'object');
assert.deepEqual(inventory.entries.map(item=>item.path),
  ['ota/common.js','src/full-only.js','ota/hotfix.js'],
  'complete mirror inventory must include full-only source files');

const mirror=buildMirrorManifest(source,{host:'https://mirror.invalid',version:source.version});
assert.equal(mirror.base,'https://mirror.invalid/f/9.8.7/');
assert.equal(mirror.full.mode,'fallback','full object metadata was stripped');
assert.equal(mirror.full.files[1].delivery.immutable,true,'full entry metadata was stripped');
assert.equal(mirror.full.files[1].chunks.length,2,'full chunk descriptors were stripped');
assert.equal(mirror.full.files[1].url,'https://mirror.invalid/f/9.8.7/src/full-only.js');
assert.equal(mirror.manifestRoot,source.manifestRoot,'top-level roots were changed');
assertManifestExact(JSON.parse(JSON.stringify(mirror)),mirror);
assert.throws(()=>assertManifestExact({...mirror,full:{...mirror.full,files:mirror.full.files.slice(0,1)}},mirror),
  /differs/,'activation comparison accepted an omitted full-only entry');
assert.throws(()=>assertManifestExact({...mirror,full:{...mirror.full,files:mirror.full.files.map(item=>{
  const copy={...item}; delete copy.chunks; return copy;
})}},mirror),/differs/,'activation comparison accepted stripped chunk metadata');

const arraySource={...source,full:[structuredClone(common),fullOnly]};
const arrayMirror=buildMirrorManifest(arraySource,{host:'https://mirror.invalid',version:source.version});
assert.ok(Array.isArray(arrayMirror.full),'array-shaped full inventory changed shape');
assert.equal(arrayMirror.full[1].url,'https://mirror.invalid/f/9.8.7/src/full-only.js');
assert.throws(()=>releaseInventory({...source,full:undefined}),/no full fallback inventory/,
  'schema-3 manifest without full fallback was accepted');
assert.throws(()=>releaseInventory({...source,full:[]}),/empty/,
  'empty full fallback was accepted');
const conflicting=structuredClone(source);
conflicting.files[0].chunks[0].size=3;
assert.throws(()=>releaseInventory(conflicting),/disagree/,
  'payload/full chunk disagreement was accepted');

assert.deepEqual(rangeProbeEntries(inventory.entries).map(item=>item.path),
  ['ota/common.js','src/full-only.js'],'all chunked full-fallback objects must be range-probed');
assert.deepEqual(rangeProbeEntries([payloadOnly]).map(item=>item.path),['ota/hotfix.js'],
  'legacy inventory must retain one server-wide Range probe');

const bytes=Buffer.from('abcdefgh'),requests=[];
await verifyEntryRanges(async(url,options)=>{
  const match=/bytes=(\d+)-(\d+)/.exec(options.headers.Range);
  assert.ok(match,'Range header missing');
  const start=Number(match[1]),end=Number(match[2]);
  requests.push({url:String(url),range:options.headers.Range});
  return new Response(bytes.subarray(start,end+1),{status:206,headers:{
    'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`,
    'content-length':String(end-start+1)
  }});
},'https://mirror.invalid/f/9.8.7/ota/common.js',common,bytes,'fixture');
assert.deepEqual(requests.map(item=>item.range),['bytes=0-0','bytes=7-7']);
assert.ok(requests.every(item=>item.url.includes('mf_range=fixture-')),'Range probes were cacheable');

await assert.rejects(()=>verifyRangeResponse(new Response(bytes,{status:200}),common,bytes,0,0),
  /expected 206/,'Range-ignoring server was accepted');
await assert.rejects(()=>verifyRangeResponse(new Response(bytes.subarray(0,1),{status:206,headers:{
  'accept-ranges':'bytes','content-range':'bytes 0-1/8','content-length':'1'
}}),common,bytes,0,0),/Content-Range/,'incorrect Content-Range was accepted');
await assert.rejects(()=>verifyRangeResponse(new Response(bytes.subarray(0,1),{status:206,headers:{
  'content-range':'bytes 0-0/8','content-length':'1'
}}),common,bytes,0,0),/Accept-Ranges/,'missing Accept-Ranges was accepted');
await assert.rejects(()=>verifyRangeResponse(new Response(bytes.subarray(0,1),{status:206,headers:{
  'accept-ranges':'bytes','content-range':'bytes 0-0/8','content-length':'2'
}}),common,bytes,0,0),/Content-Length/,'incorrect Content-Length was accepted');
await assert.rejects(()=>verifyRangeResponse(new Response(Buffer.from('z'),{status:206,headers:{
  'accept-ranges':'bytes','content-range':'bytes 0-0/8','content-length':'1'
}}),common,bytes,0,0),/bytes differ/,'incorrect ranged byte was accepted');

console.log(JSON.stringify({ok:true,inventory:inventory.entries.map(item=>item.path),
  rangeProbes:requests.map(item=>item.range),negativeContracts:[
    'missing-full','empty-full','full-payload-disagreement','range-ignored',
    'invalid-content-range','missing-accept-ranges','invalid-content-length','incorrect-range-bytes'
  ]},null,2));
