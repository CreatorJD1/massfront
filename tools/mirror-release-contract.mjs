import { isDeepStrictEqual } from 'node:util';

const HASH=/^[0-9a-f]{64}$/i;
const SEGMENT=/^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

function fail(message){ throw new Error(message); }

function validPath(value){
  return typeof value==='string'&&value.length<=512&&value.split('/').every(segment=>SEGMENT.test(segment));
}

function validateEntry(entry,scope){
  if(!entry||!validPath(entry.path)||typeof entry.url!=='string'||!entry.url||
     !HASH.test(entry.sha256||'')||!Number.isSafeInteger(entry.size)||entry.size<=0)
    fail(`Invalid immutable release entry in ${scope}: ${entry?.path||'(unknown)'}`);
}

function entryContract(entry){
  const copy={...entry};
  delete copy.url;
  return copy;
}

export function releaseInventory(source){
  if(!source||!Array.isArray(source.files)||!source.files.length)
    fail('Release manifest has no payload');
  let fullKind='legacy',full=source.files;
  if(Array.isArray(source.full)){ fullKind='array'; full=source.full; }
  else if(source.full&&Array.isArray(source.full.files)){ fullKind='object'; full=source.full.files; }
  else if(Number(source.schema)>=3)
    fail(`Schema ${source.schema} release manifest has no full fallback inventory`);
  if(!full.length) fail('Release manifest full fallback inventory is empty');

  const inventory=new Map();
  for(const [scope,list] of [['full',full],['payload',source.files]]){
    const seen=new Set();
    for(const entry of list){
      validateEntry(entry,scope);
      if(seen.has(entry.path)) fail(`Duplicate ${scope} release path: ${entry.path}`);
      seen.add(entry.path);
      const prior=inventory.get(entry.path);
      if(prior&&!isDeepStrictEqual(entryContract(prior),entryContract(entry)))
        fail(`Payload/full inventory disagree for ${entry.path}`);
      if(!prior) inventory.set(entry.path,entry);
    }
  }
  return {files:source.files,full,fullKind,entries:[...inventory.values()]};
}

export function buildMirrorManifest(source,{host,version}){
  releaseInventory(source);
  const publicUrl=entry=>`${host}/f/${version}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
  const mirrorEntry=entry=>({...entry,url:publicUrl(entry)});
  const mirror={...source,base:`${host}/f/${version}/`,files:source.files.map(mirrorEntry)};
  if(Array.isArray(source.full)) mirror.full=source.full.map(mirrorEntry);
  else if(source.full&&Array.isArray(source.full.files))
    mirror.full={...source.full,files:source.full.files.map(mirrorEntry)};
  return mirror;
}

export function assertManifestExact(actual,expected,label='Mirrored release manifest differs'){
  if(!isDeepStrictEqual(actual,expected)) fail(label);
  return true;
}

/* Only objects the updater will split need the mandatory Range gate. A legacy
   manifest with no chunk descriptors still probes its largest object so a
   server-wide Range regression cannot slip through activation. */
export function rangeProbeEntries(entries){
  const chunked=entries.filter(entry=>Array.isArray(entry.chunks)&&entry.chunks.length>1);
  if(chunked.length) return chunked;
  return entries.length?[entries.reduce((largest,entry)=>entry.size>largest.size?entry:largest)]:[];
}

function header(response,name){ return String(response.headers?.get(name)||'').trim(); }

export async function verifyRangeResponse(response,entry,sourceBytes,start,end){
  const size=end-start+1;
  if(response.status!==206) fail(`Range verification failed ${entry.path}: HTTP ${response.status}, expected 206`);
  if(header(response,'accept-ranges').toLowerCase()!=='bytes')
    fail(`Range verification failed ${entry.path}: Accept-Ranges is not bytes`);
  if(header(response,'content-range')!==`bytes ${start}-${end}/${entry.size}`)
    fail(`Range verification failed ${entry.path}: invalid Content-Range`);
  if(header(response,'content-length')!==String(size))
    fail(`Range verification failed ${entry.path}: invalid Content-Length`);
  const received=Buffer.from(await response.arrayBuffer());
  const expected=sourceBytes.subarray(start,end+1);
  if(received.length!==size||!received.equals(expected))
    fail(`Range verification failed ${entry.path}: response bytes differ`);
  return true;
}

export async function verifyEntryRanges(fetchImpl,url,entry,sourceBytes,cacheBust=Date.now()){
  if(sourceBytes.length!==entry.size) fail(`Range verification source size differs: ${entry.path}`);
  const ranges=[[0,0]];
  if(entry.size>1) ranges.push([entry.size-1,entry.size-1]);
  for(let i=0;i<ranges.length;i++){
    const [start,end]=ranges[i],probe=new URL(url);
    probe.searchParams.set('mf_range',`${cacheBust}-${i}`);
    const response=await fetchImpl(probe,{cache:'no-store',headers:{Range:`bytes=${start}-${end}`}});
    await verifyRangeResponse(response,entry,sourceBytes,start,end);
  }
  return ranges.length;
}
