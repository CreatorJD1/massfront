import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {MIRROR_HOST,assertExpectedPrior,verifyActivationPayloads,activateWithChecks} from './release-activation-contract.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const contents=new Map([['ota/runtime.js',Buffer.from('runtime-eight')],['src/full-only.js',Buffer.from('recovery-eight')]]);
function fixture(version='1.33.74'){
  const full=[...contents].map(([path,bytes])=>({path,url:`${MIRROR_HOST}/f/${version}/${path}`,size:bytes.length,
    sha256:sha(bytes),chunks:[{offset:0,size:4,sha256:sha(bytes.subarray(0,4))},
      {offset:4,size:bytes.length-4,sha256:sha(bytes.subarray(4))}]}));
  const m={schema:3,channel:'stable',version,kind:'patch',category:'system',patchFrom:'1.33.73',
    base:`${MIRROR_HOST}/f/${version}/`,files:[full[0]],full};
  const fp=list=>list.map(f=>`${f.path}|${f.size}|${f.sha256}|${f.chunks.map(c=>`${c.offset}|${c.size}|${c.sha256}`).join(',')}`).join('\n');
  m.payloadRoot=sha(fp(m.files));m.fullRoot=sha(fp(full));
  m.runtimeRoot=sha(full.map(f=>`${f.path}|${f.size}|${f.sha256}`).join('\n'));
  m.manifestRoot=sha([`schema=3`,`channel=stable`,`version=${version}`,`kind=patch`,`category=system`,`patchFrom=1.33.73`,
    `payload=${m.payloadRoot}`,`full=${m.fullRoot}`,`runtime=${m.runtimeRoot}`].join('\n'));
  return m;
}
function network(failure='',seen=[]){
  return async(url,options={})=>{
    const path=new URL(url).pathname.split('/').slice(3).join('/'),bytes=contents.get(path);
    assert.ok(bytes,'request escaped the immutable fixture');
    assert.equal(options.redirect,'manual','redirects must never be followed during activation');
    seen.push(`${options.method||'GET'} ${path} ${options.headers?.Range||''}`);
    const fullOnly=path==='src/full-only.js';
    const headers={'access-control-allow-origin':'*','access-control-expose-headers':'Content-Range',
      'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'Range','accept-ranges':'bytes'};
    if(options.method==='OPTIONS'){
      if(fullOnly&&failure==='preflight')headers['access-control-allow-headers']='Content-Type';
      return new Response(null,{status:204,headers});
    }
    if(options.headers?.Range){
      const [,start,end]=options.headers.Range.match(/bytes=(\d+)-(\d+)/).map(Number);
      headers['content-range']=`bytes ${start}-${end}/${bytes.length}`;
      headers['content-length']=String(end-start+1);
      if(fullOnly&&failure==='range')headers['content-range']='bytes 0-0/999';
      if(fullOnly&&failure==='range-cors')delete headers['access-control-expose-headers'];
      return new Response(bytes.subarray(start,end+1),{status:206,headers});
    }
    if(fullOnly&&failure==='redirect')return new Response(null,{status:302,headers:{location:'https://other.invalid/file'}});
    if(fullOnly&&failure==='missing')return new Response(null,{status:404});
    if(fullOnly&&failure==='corrupt')return new Response(Buffer.alloc(bytes.length),{status:200,headers});
    return new Response(bytes,{status:200,headers});
  };
}

const candidate=fixture(),prior=fixture('1.33.73');
const expected={version:prior.version,manifestRoot:prior.manifestRoot};
for(const failure of ['redirect','missing','corrupt','range','range-cors','preflight']){
  let publishes=0;
  await assert.rejects(activateWithChecks({candidate,expected,readCurrent:async()=>prior,
    verifyPayloads:value=>verifyActivationPayloads(network(failure),value),publish:async()=>{publishes++;}}));
  assert.equal(publishes,0,`healthy delta/broken full ${failure} reached activation`);
}
let current=prior,publishes=0;
const seen=[];
const result=await activateWithChecks({candidate,expected,readCurrent:async()=>current,
  verifyPayloads:value=>verifyActivationPayloads(network('',seen),value),
  publish:async value=>{assert.equal(seen.length,8);publishes++;current=value;}});
assert.deepEqual(result,{activated:true});assert.equal(publishes,1);
assert.deepEqual(await activateWithChecks({candidate,expected,readCurrent:async()=>current,
  verifyPayloads:value=>verifyActivationPayloads(network(),value),publish:async()=>{throw new Error('identical retry wrote');}}),{activated:false});
assert.throws(()=>assertExpectedPrior(prior,candidate,{...expected,manifestRoot:'f'.repeat(64)}),/changed/);
assert.throws(()=>assertExpectedPrior(prior,candidate,{}),/requires/);
assert.throws(()=>assertExpectedPrior(prior,candidate,{...expected,version:'1.33.75'}),/downgrade/);
let reads=0;
await assert.rejects(activateWithChecks({candidate,expected,readCurrent:async()=>++reads===1?prior:fixture('1.33.75'),
  verifyPayloads:async()=>{},publish:async()=>{throw new Error('stale pointer published');}}),/changed/);
await assert.rejects(activateWithChecks({candidate,expected,readCurrent:async()=>prior,
  verifyPayloads:async()=>{},checkpoint:async()=>{throw new Error('freeze');},publish:async()=>{throw new Error('frozen publication');}}),/freeze/);

const mirror=await readFile(new URL('./mirror-release-to-cloudflare.mjs',import.meta.url),'utf8');
assert.match(mirror,/if\(activationPath\)\{/);
assert.match(mirror,/activateWithChecks\(/);
assert.match(mirror,/await verifyActivationPayloads\(fetch,mirror/);
assert.match(mirror,/--retire-current is refused/);
assert.equal((mirror.match(/massfront\/latest\.json/g)||[]).length,1,'multiple Worker pointer write paths');
const repoint=await readFile(new URL('./repoint-manifests-to-mirror.mjs',import.meta.url),'utf8');
assert.ok(repoint.indexOf('await verifyActivationPayloads(')<repoint.indexOf('await writeFile('));
assert.match(repoint,/parent_commit=p\["parent"\]/,'HF activation lacks compare-and-swap');
assert.match(repoint,/snapshot\.sha/);
assert.doesNotMatch(repoint,/api\.upload_file\(/,'separate mutable alias writes reintroduced');
console.log(JSON.stringify({ok:true,network:false,fullOnlyFailureCases:6,expectedPrior:true,verifyBeforeActivate:true,
  stalePointerRefused:true,freezeRefused:true,retryIdempotent:true,hfAtomicCommit:true}));
