import {createHash} from 'node:crypto';
import {buildMirrorManifest,assertManifestExact,verifyEntryRanges} from './mirror-release-contract.mjs';
import {releaseDeliveryInventory,validateReleaseIdentity} from './release-delivery-contract.mjs';
import {descriptorFromVerifiedOta,verifyRemoteExplorationDelivery} from './exploration-delivery-contract.mjs';

export const MIRROR_HOST='https://massfront-update.jasondixon1994.workers.dev';
const ORIGIN='https://creatorjd-massfront-playtest.static.hf.space';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error(message);};
const allowed=value=>value==='*'||value===ORIGIN;
const token=(value,wanted)=>value==='*'||value.toLowerCase().split(',').map(s=>s.trim()).includes(wanted);
const compareVersion=(a,b)=>{
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);
  return 0;
};

export function assertMirroredRelease(candidate){
  const identity=releaseDeliveryInventory(candidate,'activation candidate');
  assertManifestExact(candidate,buildMirrorManifest(candidate,{host:MIRROR_HOST,version:identity.version}),
    'Activation candidate is not the canonical complete delivery mirror');
  return identity;
}

export function assertExpectedPrior(current,candidate,expected,label='live pointer',options={}){
  const target=assertMirroredRelease(candidate),prior=validateReleaseIdentity(current,label);
  if(!expected||!/^\d+\.\d+\.\d+$/.test(expected.version||'')||!/^[a-f0-9]{64}$/i.test(expected.manifestRoot||''))
    fail('Activation requires --expected-prior-version and --expected-prior-root');
  /* Forward-only is the default because a pointer must never name bytes that
     may not be publicly readable. A withdrawal is the one case where moving
     back is correct, and it is safe for exactly one reason: verifyPayloads()
     still re-verifies every file, range and content entry of the target before
     the pointer moves, so a rollback target is proven readable by the same
     evidence a forward release is. v1.33.84 shipped uninstallable and could not
     be withdrawn, only superseded, which left players downloading a failing
     93 MB until the replacement was cut. Deliberate, reasoned, and still fully
     verified beats that. */
  if(compareVersion(target.version,expected.version)<0){
    if(!options.rollback)
      fail('Activation refuses a version downgrade. A deliberate withdrawal must pass rollback with a reason.');
    if(typeof options.reason!=='string'||options.reason.trim().length<8)
      fail('A rollback requires a reason of at least 8 characters describing why the newer release is withdrawn');
    /* Name the destination explicitly. Activation is otherwise driven by a file
       path, and a rollback is the one operation where reaching for the wrong
       prepared candidate silently succeeds: every other guard here would still
       pass, because that older candidate is itself perfectly valid. Requiring
       the operator to state the version proves intent about WHICH release. */
    if(String(options.to||'')!==String(target.version))
      fail(`Rollback target mismatch: asked for v${options.to||'(unstated)'} but the candidate is v${target.version}`);
    /* Never withdraw onto something the installer will refuse. boot.js
       validBundle() rejects a bundle whose category is not one of these four,
       and it does so only after a full download - which is exactly how v1.33.84
       became unwithdrawable. A rollback that lands on an uninstallable release
       would strand every client instead of rescuing them. */
    const category=String(candidate.category||'');
    if(!['system','hotfix','content','overhaul'].includes(category))
      fail(`Rollback target v${target.version} declares category '${category||'none'}'; boot.js would refuse to install it`);
    /* A patch merges over the payload a client already has, so withdrawing onto
       one depends on whatever that client last installed still being correct.
       Only a full release is self-sufficient enough to be a rescue target. */
    const kind=String(candidate.kind||'');
    if(kind!=='full')
      fail(`Rollback requires a full release; v${target.version} is kind '${kind||'none'}' and cannot stand alone`);
  }
  if(prior.version===target.version&&prior.manifestRoot===target.manifestRoot){
    // A retry may find the target already active, but must still repair stale URLs.
    return {alreadyActive:JSON.stringify(current)===JSON.stringify(candidate)};
  }
  if(prior.version!==expected.version||prior.manifestRoot!==expected.manifestRoot.toLowerCase())
    fail(`${label} changed from expected prior v${expected.version} / ${expected.manifestRoot}`);
  if(prior.version===target.version)fail(`${label} already owns the target version with different immutable identity`);
  return {alreadyActive:false};
}

async function cancel(response){try{await response.body?.cancel();}catch{}}
async function request(fetchImpl,url,options={}){
  return fetchImpl(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(300000),...options,
    headers:{'Accept-Encoding':'identity',...options.headers}});
}

// Every full-only file is included. Whole-byte hashes and every chunk hash are
// checked before endpoint ranges, so a healthy delta cannot mask bad recovery.
export async function verifyActivationPayloads(fetchImpl,candidate,{onProgress=()=>{}}={}){
  const {entries}=assertMirroredRelease(candidate);
  const verifiedOta=new Map();
  let cursor=0,done=0;
  await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
    while(cursor<entries.length){
      const entry=entries[cursor++];
      const response=await request(fetchImpl,entry.url,{headers:{Origin:ORIGIN}});
      let bytes;
      try{
        if(response.status!==200||response.headers.get('location'))fail(`Full-byte delivery failed ${entry.path}: HTTP ${response.status} or redirect`);
        if(!allowed(response.headers.get('access-control-allow-origin')||''))fail(`CORS origin denied: ${entry.path}`);
        const encoding=response.headers.get('content-encoding');
        if(encoding&&encoding!=='identity')fail(`Transformed payload: ${entry.path}`);
        bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256.toLowerCase())fail(`Full-byte identity mismatch: ${entry.path}`);
        for(const chunk of entry.chunks||[])
          if(sha(bytes.subarray(chunk.offset,chunk.offset+chunk.size))!==chunk.sha256.toLowerCase())fail(`Chunk identity mismatch: ${entry.path}`);
        if(entry.path==='ota/00-runtime.js'||entry.path==='src/assetpack.js')verifiedOta.set(entry.path,bytes);
      }finally{await cancel(response);}
      if(entry.ranged){
        const preflight=await request(fetchImpl,entry.url,{method:'OPTIONS',headers:{Origin:ORIGIN,
          'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'range'}});
        try{
          if(preflight.status<200||preflight.status>=300||preflight.headers.get('location')||
             !allowed(preflight.headers.get('access-control-allow-origin')||'')||
             !token(preflight.headers.get('access-control-allow-methods')||'','get')||
             !token(preflight.headers.get('access-control-allow-headers')||'','range'))
            fail(`Range preflight failed: ${entry.path}`);
        }finally{await cancel(preflight);}
      }
      await verifyEntryRanges(async(url,options)=>{
        const result=await request(fetchImpl,url,{...options,headers:{...options.headers,Origin:ORIGIN}});
        if(result.headers.get('location')||!allowed(result.headers.get('access-control-allow-origin')||'')||
           !token(result.headers.get('access-control-expose-headers')||'','content-range')){
          await cancel(result);fail(`Range redirect/CORS failed: ${entry.path}`);
        }
        return result;
      },entry.url,entry,bytes);
      onProgress(++done,entries.length,entry.path);
    }
  }));
  // This descriptor is decoded only from the exact immutable OTA artifacts
  // just verified above, never from today's checkout or an unbound pack index.
  // Keeping content out of files/full preserves legacy executable semantics.
  const descriptor=descriptorFromVerifiedOta(verifiedOta,candidate.version),
    result={files:entries.length,bytes:entries.reduce((sum,entry)=>sum+entry.size,0)};
  if(descriptor)result.exploration=await verifyRemoteExplorationDelivery(fetchImpl,descriptor,
    {onProgress:(done,total,path)=>onProgress(done,total,'content/'+path)});
  return result;
}

// A complete verification must finish before publish can run. Rereading the
// pointer after the long transfer prevents overwriting a release made meanwhile.
export async function activateWithChecks({candidate,expected,readCurrent,verifyPayloads,publish,checkpoint=async()=>{},rollback=null}){
  assertExpectedPrior(await readCurrent(),candidate,expected,'live pointer',rollback||{});
  await verifyPayloads(candidate);
  await checkpoint();
  const current=await readCurrent();
  const state=assertExpectedPrior(current,candidate,expected,'live pointer',rollback||{});
  if(!state.alreadyActive)await publish(candidate,current);
  assertManifestExact(await readCurrent(),candidate,'Activated pointer does not exactly match the prepared candidate');
  return {activated:!state.alreadyActive};
}
