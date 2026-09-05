;
;
/* ============================================================================
   ASSET PACKS — media the installer does not carry
   ----------------------------------------------------------------------------
   The soundtrack alone is ten megabytes, and that is nine tracks. Bundling media
   into the installer means every future addition inflates a download that every
   player pays for whether or not they ever hear it — and it puts the build over
   the size where phones stop installing over cellular.

   So the app ships lean and fetches packs from Cloudflare on first launch:

     GET  <endpoint>/packs.json          what packs exist and what is in them
     GET  <endpoint>/pack/<pack>/<file>  one file

   Downloaded files are stored as Blobs in IndexedDB and served back as
   `blob:` URLs, which HTMLAudioElement plays exactly like a network URL. That
   choice matters on iOS in particular: a WKWebView's HTTP cache is evictable and
   opaque, so relying on it would mean silently re-downloading the soundtrack at
   unpredictable intervals on someone's mobile data. IndexedDB is the only client
   storage that is both durable and inspectable.

   THREE RULES, all of them about not being rude to the player:
     * Nothing here is required. Miss the pack, fail the download, decline it —
       the game plays. Music is the only thing affected and it falls back to the
       bundled beds.
     * Never download without consent on a metered connection. The prompt says
       the size before anything transfers.
     * Never re-download what is already stored. Files are keyed by name and
       size; a pack that has not changed costs one small JSON request.
   ============================================================================ */

const PACK = {
  /* idx/rawIndex describe what the server currently offers. activeIdx/rawActive
     describe the last fully verified set the game is allowed to mount. Keeping
     those identities separate is what lets a player keep using v1 while a v2
     download is declined, interrupted, corrupt or too large for free storage. */
  idx:null, rawIndex:null, activeIdx:Object.create(null), rawActive:{version:2,packs:{}},
  have:{}, busy:false, got:0, total:0, state:'idle', err:'', storage:null
};
const PACK_DB = 'massfront-packs', PACK_STORE = 'files';
const PACK_CHUNK_STORE = 'chunks', PACK_META_STORE = 'meta', PACK_DB_VERSION = 2;
const PACK_PREF = 'massfront_pack_pref';       // 'auto' | 'ask' | 'off'
/* Two MiB keeps a killed phone from repeating a large transfer, but does not
   turn IndexedDB into tens of thousands of tiny transactions. Publishers may
   choose smaller chunks; anything larger than eight MiB is rejected so a bad
   manifest cannot silently defeat the bounded-memory contract. A single file
   is capped too: very large products must be sectioned into independent files
   and packs instead of recreating the old monolithic download problem. */
const PACK_DEFAULT_CHUNK_BYTES = 2 * 1024 * 1024;
const PACK_MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const PACK_MAX_FILE_BYTES = 256 * 1024 * 1024;
const PACK_MAX_PACKS = 512, PACK_MAX_FILES = 4096, PACK_MAX_CHUNKS_PER_FILE = 4096;
const PACK_STORAGE_MARGIN_BYTES = 16 * 1024 * 1024;

const PACK_SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

/* WebCrypto has no streaming digest. Reading a 200+ MiB GLB into one
   ArrayBuffer merely to verify it would negate chunked delivery, so this small
   incremental SHA-256 keeps verification bounded to one chunk at a time. */
class PackSha256State{
  constructor(){
    this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.w = new Uint32Array(64);
    this.buf = new Uint8Array(64);
    this.bufLen = 0;
    this.bytes = 0;
  }
  block(data, off){
    const w=this.w;
    for(let i=0;i<16;i++){
      const p=off+i*4;
      w[i]=((data[p]<<24)|(data[p+1]<<16)|(data[p+2]<<8)|data[p+3])>>>0;
    }
    for(let i=16;i<64;i++){
      const x=w[i-15],y=w[i-2];
      const s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3);
      const s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let a=this.h[0],b=this.h[1],c=this.h[2],d=this.h[3];
    let e=this.h[4],f=this.h[5],g=this.h[6],h=this.h[7];
    for(let i=0;i<64;i++){
      const s1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      const ch=(e&f)^(~e&g);
      const t1=(h+s1+ch+PACK_SHA256_K[i]+w[i])>>>0;
      const s0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      const maj=(a&b)^(a&c)^(b&c);
      const t2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    this.h[0]=(this.h[0]+a)>>>0;this.h[1]=(this.h[1]+b)>>>0;
    this.h[2]=(this.h[2]+c)>>>0;this.h[3]=(this.h[3]+d)>>>0;
    this.h[4]=(this.h[4]+e)>>>0;this.h[5]=(this.h[5]+f)>>>0;
    this.h[6]=(this.h[6]+g)>>>0;this.h[7]=(this.h[7]+h)>>>0;
  }
  update(input){
    const data=input instanceof Uint8Array?input:new Uint8Array(input);
    this.bytes+=data.length;
    let off=0;
    if(this.bufLen){
      const n=Math.min(64-this.bufLen,data.length);
      this.buf.set(data.subarray(0,n),this.bufLen);this.bufLen+=n;off=n;
      if(this.bufLen===64){this.block(this.buf,0);this.bufLen=0;}
    }
    while(off+64<=data.length){this.block(data,off);off+=64;}
    if(off<data.length){this.buf.set(data.subarray(off),0);this.bufLen=data.length-off;}
    return this;
  }
  hex(){
    const bitHi=Math.floor(this.bytes/0x20000000),bitLo=(this.bytes*8)>>>0;
    this.buf[this.bufLen++]=0x80;
    if(this.bufLen>56){this.buf.fill(0,this.bufLen);this.block(this.buf,0);this.bufLen=0;}
    this.buf.fill(0,this.bufLen,56);
    this.buf[56]=(bitHi>>>24)&255;this.buf[57]=(bitHi>>>16)&255;
    this.buf[58]=(bitHi>>>8)&255;this.buf[59]=bitHi&255;
    this.buf[60]=(bitLo>>>24)&255;this.buf[61]=(bitLo>>>16)&255;
    this.buf[62]=(bitLo>>>8)&255;this.buf[63]=bitLo&255;
    this.block(this.buf,0);
    return [...this.h].map(n=>n.toString(16).padStart(8,'0')).join('');
  }
}

async function packHashBlob(blob, sliceBytes=PACK_DEFAULT_CHUNK_BYTES){
  const hash=new PackSha256State();
  for(let off=0;off<blob.size;off+=sliceBytes)
    hash.update(new Uint8Array(await blob.slice(off,Math.min(blob.size,off+sliceBytes)).arrayBuffer()));
  return hash.hex();
}

let packDbPromise=null;
function packDb(){
  if(packDbPromise) return packDbPromise;
  packDbPromise=new Promise((res, rej) => {
    const r = indexedDB.open(PACK_DB, PACK_DB_VERSION);
    r.onupgradeneeded = () => { const d = r.result;
      if(!d.objectStoreNames.contains(PACK_STORE)) d.createObjectStore(PACK_STORE);
      if(!d.objectStoreNames.contains(PACK_CHUNK_STORE)) d.createObjectStore(PACK_CHUNK_STORE);
      if(!d.objectStoreNames.contains(PACK_META_STORE)) d.createObjectStore(PACK_META_STORE); };
    r.onsuccess = () => {
      r.result.onversionchange=()=>{r.result.close();packDbPromise=null;};
      res(r.result);
    };
    r.onerror = () => {packDbPromise=null;rej(r.error);};
    r.onblocked=()=>{packDbPromise=null;rej(new Error('Asset-pack storage upgrade is blocked by another tab'));};
  });
  return packDbPromise;
}
async function packStoreGet(store,k){
  const db = await packDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const q = tx.objectStore(store).get(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function packStorePut(store,k,v){
  const db = await packDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(v, k);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);tx.onabort=()=>rej(tx.error);
  });
}
async function packStoreDelete(store,k){
  const db=await packDb();
  return new Promise((res,rej)=>{
    const tx=db.transaction(store,'readwrite');
    tx.objectStore(store).delete(k);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
  });
}
async function packKeys(store=PACK_STORE){
  const db = await packDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const q = tx.objectStore(store).getAllKeys();
    q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error);
  });
}
async function packDeletePrefix(store,prefix){
  const keys=(await packKeys(store)).filter(k=>String(k).startsWith(prefix));
  if(!keys.length) return 0;
  const db=await packDb();
  await new Promise((res,rej)=>{
    const tx=db.transaction(store,'readwrite'),target=tx.objectStore(store);
    for(const k of keys) target.delete(k);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
  });
  return keys.length;
}
async function packDeleteKeys(store,keys){
  if(!keys.length) return 0;
  const db=await packDb();
  await new Promise((res,rej)=>{
    const tx=db.transaction(store,'readwrite'),target=tx.objectStore(store);
    for(const key of keys) target.delete(key);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
  });
  return keys.length;
}
const packGet=k=>packStoreGet(PACK_STORE,k);
const packPut=(k,v)=>packStorePut(PACK_STORE,k,v);

/* The endpoint is the same one the updater resolves — one server, one setting,
   configured in exactly one place. */
function packEndpoint(){
  if(typeof UPDATE_URL === 'string' && UPDATE_URL) return UPDATE_URL.replace(/\/update\.json.*$/, '');
  if(typeof window !== 'undefined' && window.MASSFRONT_UPDATE_URL)
    return String(window.MASSFRONT_UPDATE_URL).replace(/\/update\.json.*$/, '');
  return '';
}

function packBytes(n){
  return n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
}

const PACK_INDEX_META_KEY='index:active';
const PACK_OFFER_META_KEY='index:offered';
const PACK_ACTIVE_ROLE='active-v2';
function packIndexRecord(saved){return saved&&saved.index?saved.index:saved;}
async function packPersistOffer(raw){
  await packStorePut(PACK_META_STORE,PACK_OFFER_META_KEY,{role:'offered-v2',index:raw,savedAt:Date.now()});
}
async function packPersistActive(raw){
  const normalized=packNormalizeIndex(raw);
  /* One IndexedDB record is the activation pointer. Payload Blobs may arrive
     over many launches, but the game sees all of the new dependency set or
     none of it because this transaction completes before the in-memory pointer
     moves. */
  await packStorePut(PACK_META_STORE,PACK_INDEX_META_KEY,{
    role:PACK_ACTIVE_ROLE,index:raw,savedAt:Date.now()
  });
  PACK.rawActive=raw;PACK.activeIdx=normalized;
  return normalized;
}
function packPackIdentity(pack){
  if(!pack) return '';
  return JSON.stringify({
    format:pack.format,dependencies:pack.dependencies,
    files:pack.files.map(file=>({
      name:file.name,size:file.size,sha256:file.sha256,
      chunks:file.chunks.map(chunk=>[chunk.offset,chunk.size,chunk.sha256])
    }))
  });
}
async function packOwnFilesReady(index,id){
  const pack=index&&index[id];
  if(!pack) return false;
  for(const file of pack.files) if(!(await packFileReady(id,file))) return false;
  return true;
}
async function packRecoverLegacyActive(raw,index){
  const packs={},accepted=new Set(),order=[];
  const seen=new Set();
  function add(id){if(seen.has(id)) return;seen.add(id);for(const dep of index[id].dependencies)add(dep);order.push(id);}
  for(const id of Object.keys(index)) add(id);
  for(const id of order){
    if(index[id].dependencies.some(dep=>!accepted.has(dep))) continue;
    if(await packOwnFilesReady(index,id)){packs[id]=raw.packs[id];accepted.add(id);}
  }
  return {version:Number(raw.version)||2,packs};
}
async function packLoadCachedIndex(){
  try{
    const offeredSaved=await packStoreGet(PACK_META_STORE,PACK_OFFER_META_KEY);
    const activeSaved=await packStoreGet(PACK_META_STORE,PACK_INDEX_META_KEY);
    const taggedActive=!!(activeSaved&&activeSaved.role===PACK_ACTIVE_ROLE);
    const legacyRaw=!taggedActive?packIndexRecord(activeSaved):null;
    let offeredRaw=packIndexRecord(offeredSaved)||legacyRaw;
    let activeRaw=taggedActive?packIndexRecord(activeSaved):null;
    if(!offeredRaw&&activeRaw) offeredRaw=activeRaw;
    if(!offeredRaw) return null;
    const offered=packNormalizeIndex(offeredRaw);
    if(!activeRaw){
      /* v1 stored a server offer under the misleading `index:active` key.
         Promote only entries whose final Blobs already verify; a merely cached
         manifest must never become executable authority during migration. */
      activeRaw=await packRecoverLegacyActive(offeredRaw,offered);
      try{await packPersistOffer(offeredRaw);}catch(e){}
      await packPersistActive(activeRaw);
    }else{
      PACK.rawActive=activeRaw;PACK.activeIdx=packNormalizeIndex(activeRaw);
    }
    PACK.idx=offered;PACK.rawIndex=offeredRaw;
    return PACK.idx;
  }catch(e){return null;}
}
async function packAdoptInstalledOffers(){
  if(!PACK.idx||!PACK.rawIndex) return false;
  const raw={...PACK.rawActive,packs:{...(PACK.rawActive&&PACK.rawActive.packs||{})}};
  const activeNext={...PACK.activeIdx};
  let changed=false;
  const order=[],seen=new Set();
  function add(id){if(seen.has(id))return;seen.add(id);for(const dep of PACK.idx[id].dependencies)add(dep);order.push(id);}
  for(const id of Object.keys(PACK.idx)) add(id);
  for(const id of order){
    if(activeNext[id]) continue;
    let depsReady=true;
    for(const dep of PACK.idx[id].dependencies){
      const active=activeNext[dep];
      if(!active||packPackIdentity(active)!==packPackIdentity(PACK.idx[dep])){depsReady=false;break;}
    }
    if(!depsReady||!(await packOwnFilesReady(PACK.idx,id))) continue;
    raw.packs[id]=PACK.rawIndex.packs[id];
    /* Make this entry visible to later nodes in the same topological pass, but
       do not move the live pointer before the IDB activation record commits. */
    activeNext[id]=PACK.idx[id];
    changed=true;
  }
  if(changed) await packPersistActive(raw);
  return changed;
}
/* The mirror's pack catalog can drift from the origin's.
 *
 * packEndpoint() is derived from UPDATE_URL, which now points at the Cloudflare
 * worker. The worker mirrors release payloads; its packs.json is maintained
 * separately and had fallen behind -- it listed music (15 files) and no voice
 * pack at all, while the origin listed music (11 files) AND voice (324 files,
 * 5.2 MB). The launcher advertised "voices + music, 21 MB" from the combined
 * total, so a player was offered content the client could not even see, and the
 * download did nothing.
 *
 * Merge, do not replace: an endpoint entry stays authoritative for its id
 * (it is the faster mirror), and packs the endpoint has never heard of are
 * added with an explicit baseUrl so their bytes are fetched from the place
 * that actually has them. packFileUrl already honours a per-pack baseUrl --
 * the exploration pack uses the same mechanism -- and the origin serves the
 * same <base>/pack/<id>/<file> layout the generic fallback builds.
 *
 * Best-effort and non-fatal: a failure here leaves the endpoint catalog
 * exactly as it was. */
const PACK_ORIGIN_BASE='https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main';
const PACK_ORIGIN_QUERY='?download=true';
async function packMergeOriginCatalog(merged){
  try{
    const endpoint=(typeof packEndpoint==='function'&&packEndpoint())||'';
    if(endpoint&&endpoint.replace(/\/$/,'')===PACK_ORIGIN_BASE) return merged;
    const r=await fetch(PACK_ORIGIN_BASE+'/packs.json'+PACK_ORIGIN_QUERY+'&t='+Date.now(),{cache:'no-store'});
    if(!r.ok) return merged;
    const origin=await r.json();
    const have=(merged&&merged.packs)||{};
    const theirs=(origin&&origin.packs)||{};
    const add={};
    for(const id in theirs){
      if(have[id]||!packValidId(id)) continue;
      const pack=theirs[id];
      if(!pack||!Array.isArray(pack.files)||!pack.files.length) continue;
      add[id]={...pack,
        baseUrl:PACK_ORIGIN_BASE+'/pack/'+encodeURIComponent(id)+'/',
        downloadQuery:PACK_ORIGIN_QUERY};
    }
    const ids=Object.keys(add);
    if(!ids.length) return merged;
    if(typeof console!=='undefined'&&console.info)
      console.info('[pack] origin supplied '+ids.length+' pack(s) the endpoint does not list: '+ids.join(', '));
    return {...merged,packs:{...add,...have}};
  }catch(e){ return merged; }
}
async function packLoadIndex(){
  if(PACK.busy&&PACK.idx) return PACK.idx;
  const cached=await packLoadCachedIndex();
  if(typeof netAllowed==='function' && !netAllowed()) return cached;
  const base = packEndpoint();
  try{
    /* No endpoint is not the same as no catalog. packEndpoint() is derived from
       UPDATE_URL, which is null until the updater resolves a channel, and it
       stays null for a build with no update service at all -- both cases used
       to return here and leave the player with no optional content whatsoever.
       The origin merge below can supply the whole catalog on its own. */
    let j=null;
    if(base){
      const r = await fetch(base + '/packs.json?t=' + Date.now(), {cache:'no-store'});
      if(r.ok) j = await r.json();
    }
    if(!j) j={packs:{}};
    let merged=j;
    try{
      const prior=PACK.rawIndex&&PACK.rawIndex.packs?PACK.rawIndex.packs:{};
      const local=Object.fromEntries(Object.entries(prior).filter(([,pack])=>pack&&pack.localRegistration));
      merged={...j,packs:{...local,...j.packs}}; // an official endpoint entry supersedes a local registration.
    }catch(e){}
    merged=await packMergeOriginCatalog(merged);
    if(!merged||!merged.packs||!Object.keys(merged.packs).length) return cached;
    PACK.idx = packNormalizeIndex(merged);PACK.rawIndex=merged;
    /* The offer is durable for interrupted downloads, but it is not the mount
       pointer. packPersistActive() is the sole authority transition. */
    try{await packPersistOffer(merged);}catch(e){}
    try{await packAdoptInstalledOffers();}catch(e){}
    return PACK.idx;
  }catch(e){
    if(cached) return cached;
    PACK.err='Optional content manifest is invalid';return null;
  }
}

function packValidId(id){return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(id||''));}
function packValidPath(name){
  const p=String(name||'').replace(/\\/g,'/');
  return p&&!p.startsWith('/')&&!p.split('/').some(s=>!s||s==='.'||s==='..')?p:'';
}
function packHash(value){
  const h=String(value||'').toLowerCase();
  return /^[a-f0-9]{64}$/.test(h)?h:'';
}
function packNormalizeIndex(index){
  if(!index||typeof index!=='object'||!index.packs||typeof index.packs!=='object') throw new Error('packs');
  if(Object.keys(index.packs).length>PACK_MAX_PACKS) throw new Error('packs');
  const out=Object.create(null);
  for(const [id,raw] of Object.entries(index.packs)){
    if(!packValidId(id)||!raw||!Array.isArray(raw.files)||raw.files.length>PACK_MAX_FILES) throw new Error('pack');
    const format=Math.max(1,Number(raw.format||raw.manifestVersion||1)|0);
    const chunkSize=Number(raw.chunkSize||PACK_DEFAULT_CHUNK_BYTES);
    if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>PACK_MAX_CHUNK_BYTES) throw new Error('chunk-size');
    const dependencies=Array.isArray(raw.dependencies)?raw.dependencies.map(String):[];
    if(new Set(dependencies).size!==dependencies.length||dependencies.some(dep=>!packValidId(dep))) throw new Error('dependencies');
    const seen=new Set(),files=[];
    let bytes=0;
    for(const source of raw.files){
      const name=packValidPath(source&&source.name);
      const size=Number(source&&source.size);
      const sha256=packHash(source&&source.sha256);
      if(!name||seen.has(name)||!Number.isSafeInteger(size)||size<1||size>PACK_MAX_FILE_BYTES) throw new Error('file');
      if(format>=2&&!sha256) throw new Error('whole-hash');
      seen.add(name);bytes+=size;
      let chunks=[];
      if(Array.isArray(source.chunks)){
        if(source.chunks.length>PACK_MAX_CHUNKS_PER_FILE) throw new Error('chunks');
        let offset=0;
        chunks=source.chunks.map((chunk,index)=>{
          const at=Number(chunk&&chunk.offset),n=Number(chunk&&chunk.size),hash=packHash(chunk&&chunk.sha256);
          if(!Number.isSafeInteger(at)||at!==offset||!Number.isSafeInteger(n)||n<1||n>PACK_MAX_CHUNK_BYTES||at+n>size||!hash)
            throw new Error('chunk');
          offset+=n;
          return {index,offset:at,size:n,sha256:hash};
        });
        if(offset!==size) throw new Error('chunk-coverage');
      }else{
        if(format>=2) throw new Error('chunks');
        if(Math.ceil(size/chunkSize)>PACK_MAX_CHUNKS_PER_FILE) throw new Error('chunks');
        for(let offset=0,index=0;offset<size;offset+=chunkSize,index++)
          chunks.push({index,offset,size:Math.min(chunkSize,size-offset),sha256:''});
      }
      files.push({...source,name,size,sha256,chunks});
    }
    if(raw.bytes!==undefined&&Number(raw.bytes)!==bytes) throw new Error('pack-bytes');
    out[id]={...raw,id,format,chunkSize,bytes,files,dependencies};
  }
  /* Reject missing edges and cycles at the trust boundary. Install order can
     then be a small deterministic DFS, and a malformed remote manifest can
     never recurse forever or silently omit a prerequisite. */
  const visiting=new Set(),visited=new Set();
  function visit(id){
    if(visited.has(id)) return;
    if(visiting.has(id)) throw new Error('dependency-cycle');
    visiting.add(id);
    for(const dep of out[id].dependencies){if(!out[dep]) throw new Error('dependency-missing');visit(dep);}
    visiting.delete(id);visited.add(id);
  }
  for(const id of Object.keys(out)) visit(id);
  return out;
}
async function packRegisterPack(id,raw){
  if(!packValidId(id)||!raw) throw new Error('pack');
  const base=PACK.rawIndex&&PACK.rawIndex.packs?PACK.rawIndex:{version:2,packs:{}};
  const merged={...base,packs:{...base.packs,[id]:{...raw,localRegistration:true}}};
  const normalized=packNormalizeIndex(merged);
  PACK.rawIndex=merged;PACK.idx=normalized;
  await packPersistOffer(merged);
  return normalized[id];
}
function packLegacyFileKey(pack,file){return pack+'/'+file.name+':'+file.size;}
function packFileKey(pack,file){
  const legacy=packLegacyFileKey(pack,file);
  return file.sha256?legacy+':sha256:'+file.sha256:legacy;
}
function packMetaKey(pack,file,storageKey=packFileKey(pack,file)){return 'file:'+storageKey;}
function packChunkPrefix(pack,file){return pack+'/'+file.name+':'+file.size+':'+(file.sha256||'legacy')+':chunk:';}
function packChunkKey(pack,file,chunk){return packChunkPrefix(pack,file)+chunk.index;}
function packStoredBlob(value){return value instanceof Blob?value:(value&&value.blob instanceof Blob?value.blob:null);}
async function packStoredFinal(pack,file){
  const key=packFileKey(pack,file);
  let blob=packStoredBlob(await packGet(key));
  if(blob) return {key,blob};
  const legacyKey=packLegacyFileKey(pack,file);
  if(legacyKey!==key){
    blob=packStoredBlob(await packGet(legacyKey));
    if(blob) return {key:legacyKey,blob};
  }
  return {key,blob:null};
}
async function packFileReady(pack,file,{forceHash=false}={}){
  const stored=await packStoredFinal(pack,file),blob=stored.blob;
  if(!blob||blob.size!==file.size) return false;
  if(!file.sha256) return true; // v1 manifests and their legacy Blobs remain playable.
  const metaKey=packMetaKey(pack,file,stored.key);
  const meta=await packStoreGet(PACK_META_STORE,metaKey);
  if(!forceHash&&meta&&meta.sha256===file.sha256&&meta.size===file.size) return true;
  const actual=await packHashBlob(blob,file.chunkSize||PACK_DEFAULT_CHUNK_BYTES);
  if(actual!==file.sha256) return false;
  await packStorePut(PACK_META_STORE,metaKey,{sha256:actual,size:file.size,verifiedAt:Date.now()});
  return true;
}
async function packStoredChunk(pack,file,chunk){
  const value=await packStoreGet(PACK_CHUNK_STORE,packChunkKey(pack,file,chunk));
  const blob=packStoredBlob(value);
  if(!blob||blob.size!==chunk.size) return null;
  const expected=chunk.sha256||packHash(value&&value.sha256);
  if(expected){
    /* IDB is durable, not an integrity oracle. A killed or externally damaged
       record can retain its old metadata, so always re-hash persisted chunks
       before resuming. Format-1 manifests have only a whole-file authority;
       their locally recorded chunk hash still lets us discard one damaged
       partial instead of assembling it, failing the whole hash, and throwing
       away every otherwise-good chunk in a large download. */
    if(await packHashBlob(blob,chunk.size)!==expected) return null;
  }
  return blob;
}
async function packResumeState(pack,file){
  const present=new Map();let bytes=0;
  for(const chunk of file.chunks){
    const blob=await packStoredChunk(pack,file,chunk);
    if(blob){present.set(chunk.index,blob);bytes+=chunk.size;}
  }
  return {present,bytes,remaining:file.size-bytes};
}

/* What is missing, including already-persisted partial chunks. Hashed finals
   use content identities so a same-size replacement cannot overwrite the live
   version before activation; packStoredFinal keeps the v1 name+size key as a
   read-compatible fallback for existing voice/music installs. */
async function packMissing(pack,options={},index=PACK.idx){
  if(!index || !index[pack]) return {files:[], bytes:0};
  const out = [];
  let bytes = 0,storedBytes=0;
  for(const f of index[pack].files){
    if(await packFileReady(pack,f,{forceHash:!!options.forceHash})){storedBytes+=f.size;continue;}
    const resume=await packResumeState(pack,f);
    out.push({...f,key:packFileKey(pack,f),remainingBytes:resume.remaining});
    bytes+=resume.remaining;storedBytes+=resume.bytes;
  }
  return {files:out,bytes,storedBytes,totalBytes:index[pack].bytes};
}

function packFail(code,message){const e=new Error(message||code);e.code=code;throw e;}
function packFileUrl(base,pack,file,meta){
  meta=meta||(PACK.idx&&PACK.idx[pack]);
  if(meta&&meta.baseUrl){
    const root=String(meta.baseUrl).replace(/\/?$/,'/');
    const url=root+file.name.split('/').map(encodeURIComponent).join('/');
    const query=String(meta.downloadQuery||'');
    return url+(query&&url.indexOf('?')<0?(query.startsWith('?')?query:'?'+query):'');
  }
  return String(base||'').replace(/\/$/,'')+'/pack/'+encodeURIComponent(pack)+'/'
    +file.name.split('/').map(encodeURIComponent).join('/');
}
async function packStoragePreflight(pack,missing){
  const largest=missing.files.reduce((n,f)=>Math.max(n,f.size),0);
  const margin=missing.bytes?Math.max(PACK_STORAGE_MARGIN_BYTES,Math.ceil(missing.bytes*.08)):0;
  const required=missing.bytes+largest+margin;
  const storage=typeof navigator!=='undefined'&&navigator.storage;
  if(!storage||typeof storage.estimate!=='function')
    return {ok:true,supported:false,pack,required,available:null,quota:null,usage:null};
  try{
    const estimate=await storage.estimate();
    const quota=Number(estimate.quota),usage=Number(estimate.usage||0);
    const available=Number.isFinite(quota)?Math.max(0,quota-usage):null;
    return {ok:available===null||available>=required,supported:true,pack,required,available,quota,usage};
  }catch(e){return {ok:true,supported:false,pack,required,available:null,quota:null,usage:null};}
}
async function packRequestPersistence(preflight){
  const storage=typeof navigator!=='undefined'&&navigator.storage;
  if(!storage) return {...preflight,persisted:null};
  let persisted=null;
  try{
    if(typeof storage.persisted==='function') persisted=!!(await storage.persisted());
    /* Pack installation is initiated by the player's explicit download action,
       the best opportunity browsers provide to protect a large verified pack
       from pressure eviction. Denial is advisory and never blocks offline play. */
    if(!persisted&&typeof storage.persist==='function') persisted=!!(await storage.persist());
  }catch(e){}
  return {...preflight,persisted};
}
async function packClearChunks(pack,file){await packDeletePrefix(PACK_CHUNK_STORE,packChunkPrefix(pack,file));}
function packDropURL(pack,name){
  const key=pack+'/'+name,entry=packURLs[key],url=entry&&entry.url||entry;
  if(url&&typeof URL.revokeObjectURL==='function') try{URL.revokeObjectURL(url);}catch(e){}
  delete packURLs[key];
}
async function packCommitFullResponse(pack,file,response,onBytes,resume){
  /* A 200 response means the origin ignored Range. Consume its body as a
     stream and commit only complete manifest chunks; response.blob() would
     recreate the exact monolithic allocation this subsystem exists to avoid.
     Completed chunks survive a short response or killed tab and are reused on
     the next attempt. Browsers without response streaming fail closed here;
     the origin must honor Range for them. */
  const reader=response.body&&typeof response.body.getReader==='function'?response.body.getReader():null;
  if(!reader) packFail('range-stream','Range was ignored and bounded response streaming is unavailable');
  const whole=new PackSha256State();
  let total=0,index=0,chunk=file.chunks[0],filled=0;
  let buffer=chunk?new Uint8Array(chunk.size):null;
  try{
    while(true){
      const read=await reader.read();
      if(read.done) break;
      const data=read.value instanceof Uint8Array?read.value:new Uint8Array(read.value||0);
      if(total+data.length>file.size) packFail('range-ignored-size','Ignored Range response exceeds manifest size');
      whole.update(data);total+=data.length;
      let at=0;
      while(at<data.length){
        if(!chunk) packFail('range-ignored-size','Ignored Range response exceeds manifest chunks');
        const n=Math.min(chunk.size-filled,data.length-at);
        buffer.set(data.subarray(at,at+n),filled);filled+=n;at+=n;
        if(filled===chunk.size){
          const actual=new PackSha256State().update(buffer).hex();
          if(chunk.sha256&&actual!==chunk.sha256) packFail('chunk-hash','Full response chunk hash failed');
          const reusable=!!chunk.sha256&&resume.present.has(chunk.index);
          if(!reusable){
            await packStorePut(PACK_CHUNK_STORE,packChunkKey(pack,file,chunk),{
              blob:new Blob([buffer],{type:file.type||'application/octet-stream'}),
              size:chunk.size,sha256:chunk.sha256||actual
            });
            if(onBytes&&!resume.present.has(chunk.index)) onBytes(chunk.size);
          }
          chunk=file.chunks[++index];filled=0;
          buffer=chunk?new Uint8Array(chunk.size):null;
        }
      }
    }
  }catch(e){try{await reader.cancel();}catch(ignore){}throw e;}
  if(total!==file.size||index!==file.chunks.length||filled)
    packFail('range-ignored-size','Ignored Range response ended before manifest size');
  const actual=whole.hex();
  if(file.sha256&&actual!==file.sha256){
    /* Synthetic legacy chunks carry no individual hashes. Keeping them after
       a whole-file failure poisons every retry because size alone would make
       the bad records look resumable. Clear the identity as one unit. */
    await packClearChunks(pack,file);
    packFail('file-hash','Whole-file hash failed');
  }
  await packAssembleFile(pack,file);
}
async function packFetchChunk(base,pack,file,chunk,packMeta){
  const end=chunk.offset+chunk.size-1;
  const response=await fetch(packFileUrl(base,pack,file,packMeta),{
    cache:'no-store',headers:{Range:'bytes='+chunk.offset+'-'+end}
  });
  if(!response.ok) packFail('http','HTTP '+response.status);
  if(response.status===200){
    /* A CDN may legally ignore Range. Treat that as one explicit full-file
       fallback, never as the requested chunk, or each loop iteration would
       download and append the entire object again. */
    return {fullResponse:response};
  }
  if(response.status!==206) packFail('range-status','Unexpected Range response');
  const blob=await response.blob();
  const contentRange=response.headers&&response.headers.get&&response.headers.get('content-range');
  const match=/^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(String(contentRange||''));
  if(!match||Number(match[1])!==chunk.offset||Number(match[2])!==end||Number(match[3])!==file.size)
    packFail('content-range','Content-Range does not match request');
  if(blob.size!==chunk.size) packFail('chunk-size','Chunk size does not match manifest');
  const hash=await packHashBlob(blob,chunk.size);
  if(chunk.sha256&&hash!==chunk.sha256) packFail('chunk-hash','Chunk hash failed');
  return {chunk:blob,sha256:hash};
}
async function packAssembleFile(pack,file){
  const parts=[],hash=new PackSha256State();let size=0;
  for(const chunk of file.chunks){
    const blob=await packStoredChunk(pack,file,chunk);
    if(!blob) packFail('chunk-missing','Verified chunk disappeared before assembly');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    hash.update(bytes);parts.push(blob);size+=blob.size;
  }
  if(size!==file.size) packFail('size','Assembled size does not match manifest');
  const actual=hash.hex();
  if(file.sha256&&actual!==file.sha256){
    await packClearChunks(pack,file);
    packFail('file-hash','Whole-file hash failed');
  }
  const blob=new Blob(parts,{type:file.type||'application/octet-stream'});
  packDropURL(pack,file.name);
  await packPut(packFileKey(pack,file),blob);
  if(file.sha256) await packStorePut(PACK_META_STORE,packMetaKey(pack,file),{sha256:actual,size:file.size,verifiedAt:Date.now()});
  await packClearChunks(pack,file);
}
async function packDownloadFile(base,pack,file,onBytes,packMeta){
  /* Keep the prior final Blob until the replacement has passed every chunk and
     whole-file hash. packPut() is the atomic identity swap; deleting first made
     an interrupted Repair destroy the last-known-good offline copy. */
  const resume=await packResumeState(pack,file);
  for(const chunk of file.chunks){
    if(resume.present.has(chunk.index)) continue;
    const received=await packFetchChunk(base,pack,file,chunk,packMeta);
    if(received.fullResponse){
      await packCommitFullResponse(pack,file,received.fullResponse,onBytes,resume);
      return;
    }
    await packStorePut(PACK_CHUNK_STORE,packChunkKey(pack,file,chunk),{
      blob:received.chunk,size:chunk.size,sha256:chunk.sha256||received.sha256
    });
    if(onBytes) onBytes(chunk.size);
  }
  await packAssembleFile(pack,file);
}
function packDependencyOrder(pack,index=PACK.idx){
  const order=[],seen=new Set();
  function add(id){if(seen.has(id)) return;seen.add(id);for(const dep of index[id].dependencies) add(dep);order.push(id);}
  add(pack);return order;
}
async function packPlan(pack,{forceHash=false,index=PACK.idx}={}){
  const order=packDependencyOrder(pack,index),byPack=[],files=[];
  let bytes=0,storedBytes=0;
  for(const id of order){
    const missing=await packMissing(id,{forceHash},index);
    byPack.push({pack:id,meta:index[id],missing});bytes+=missing.bytes;storedBytes+=missing.storedBytes;
    for(const file of missing.files) files.push(file);
  }
  return {order,byPack,files,bytes,storedBytes};
}
async function packGcPromotedPack(pack){
  const active=PACK.activeIdx&&PACK.activeIdx[pack];
  if(!active) return {files:0,chunks:0,metadata:0};
  const filePrefix=pack+'/',metaPrefix='file:'+filePrefix;
  const keepFiles=new Set(),keepMeta=new Set();
  for(const file of active.files){
    const stored=await packStoredFinal(pack,file);
    if(stored.blob){keepFiles.add(stored.key);keepMeta.add(packMetaKey(pack,file,stored.key));}
  }
  const staleFiles=(await packKeys(PACK_STORE)).filter(key=>{
    const value=String(key);return value.startsWith(filePrefix)&&!keepFiles.has(value);
  });
  const staleMeta=(await packKeys(PACK_META_STORE)).filter(key=>{
    const value=String(key);return value.startsWith(metaPrefix)&&!keepMeta.has(value);
  });
  /* Promotion proves every active file has a verified final Blob. No chunk is
     still needed by that identity, and any older hash/size identity is now
     unreachable. Clearing only this pack namespace preserves dependencies and
     every independently installed optional pack. */
  const staleChunks=(await packKeys(PACK_CHUNK_STORE)).filter(key=>String(key).startsWith(filePrefix));
  return {
    files:await packDeleteKeys(PACK_STORE,staleFiles),
    chunks:await packDeleteKeys(PACK_CHUNK_STORE,staleChunks),
    metadata:await packDeleteKeys(PACK_META_STORE,staleMeta)
  };
}
async function packPromotePlan(plan,index,rawIndex){
  for(const id of plan.order){
    const remaining=await packMissing(id,{},index);
    if(remaining.files.length) packFail('verify','Pack cannot activate before every file verifies');
  }
  const packs={...(PACK.rawActive&&PACK.rawActive.packs||{})};
  for(const id of plan.order){
    if(!rawIndex||!rawIndex.packs||!rawIndex.packs[id]) packFail('manifest','Pack offer changed before activation');
    packs[id]=rawIndex.packs[id];
  }
  const next={...(PACK.rawActive||{}),version:Number(rawIndex&&rawIndex.version)||2,packs};
  await packPersistActive(next);
  const gc={};
  for(const id of plan.order){
    try{gc[id]=await packGcPromotedPack(id);}
    catch(e){gc[id]={error:e&&e.message||String(e)};}
  }
  return gc;
}
function packJournalKey(pack){return 'journal:'+pack;}
async function packInstallPack(pack,options={}){
  if(!packValidId(pack)) return {ok:false,reason:'pack-id'};
  if(PACK.busy) return {ok:false,reason:'busy'};
  PACK.busy=true;PACK.state='downloading';PACK.err='';
  try{
    /* Own the operation before the first await. Otherwise two callers that
       both need packs.json can pass the busy check and begin parallel writes. */
    const idx=PACK.idx||await packLoadIndex();
    if(!idx||!idx[pack]){PACK.state='error';PACK.err='Optional content manifest is unavailable';return {ok:false,reason:'manifest'};}
    const offerIndex=idx,offerRaw=PACK.rawIndex;
    const plan=await packPlan(pack,{forceHash:!!options.repair,index:offerIndex});
    if(!plan.files.length){
      const gc=await packPromotePlan(plan,offerIndex,offerRaw);
      PACK.state='ready';return {ok:true,pack,packs:plan.order,installed:true,downloaded:0,gc};
    }
    if(typeof netAllowed==='function'&&!netAllowed()){
      PACK.state='error';PACK.err='Optional content is unavailable while offline';
      return {ok:false,reason:'offline'};
    }
    const storage=await packRequestPersistence(await packStoragePreflight(pack,plan));PACK.storage=storage;
    if(!storage.ok){
      PACK.state='error';PACK.err='Not enough storage for this optional pack';
      return {ok:false,reason:'storage',storage};
    }
    const base=packEndpoint();
    if(!base&&plan.byPack.some(item=>item.missing.files.length&&!offerIndex[item.pack].baseUrl)){
      PACK.state='error';PACK.err='Optional content server is unavailable';return {ok:false,reason:'endpoint'};
    }
    PACK.total=plan.bytes;PACK.got=0;
    await packStorePut(PACK_META_STORE,packJournalKey(pack),{
      state:'installing',pack,dependencies:plan.order,bytes:plan.bytes,startedAt:Date.now()
    });
    for(const item of plan.byPack){
      for(const file of item.missing.files){
        await packDownloadFile(base,item.pack,file,n=>{
          PACK.got+=n;
          if(options.onProgress) options.onProgress(PACK.got,PACK.total,{pack:item.pack,file:file.name});
          if(options.ui) packRenderBar();
        },item.meta);
        await packStorePut(PACK_META_STORE,packJournalKey(pack),{
          state:'installing',pack,dependencies:plan.order,bytes:plan.bytes,downloaded:PACK.got,
          completedPack:item.pack,completedFile:file.name,updatedAt:Date.now()
        });
      }
      if((await packMissing(item.pack,{},offerIndex)).files.length) packFail('verify','Pack remained incomplete after install');
    }
    const gc=await packPromotePlan(plan,offerIndex,offerRaw);
    await packStorePut(PACK_META_STORE,packJournalKey(pack),{
      state:'ready',pack,dependencies:plan.order,bytes:plan.bytes,completedAt:Date.now()
    });
    PACK.state='ready';
    return {ok:true,pack,packs:plan.order,installed:true,downloaded:plan.bytes,storage,gc};
  }catch(e){
    PACK.state='error';PACK.err='Download failed — the game runs without it';
    try{await packStorePut(PACK_META_STORE,packJournalKey(pack),{
      state:'failed',pack,reason:e&&e.code||'download',updatedAt:Date.now()
    });}catch(ignore){}
    return {ok:false,reason:e&&e.code||'download',message:e&&e.message||String(e)};
  }finally{
    PACK.busy=false;
    if(options.ui) packRenderBar();
  }
}
async function packDownload(pack,onProgress){
  const result=await packInstallPack(pack,{onProgress,ui:true});
  return !!result.ok;
}

/* Hand back a playable URL for a pack file, or null if it is not stored. The
   object URL is cached per file — creating a new one on every play would leak a
   blob reference for the lifetime of the document. */
const packURLs = {};
async function packURL(pack, name){
  const k = pack + '/' + name;
  if(!PACK.idx) await packLoadIndex();
  const active=PACK.activeIdx&&PACK.activeIdx[pack];
  if(!active) return null;
  const meta = active.files.find(f => f.name === name);
  if(!meta) return null;
  const identity=packFileKey(pack,meta)+':'+(meta.sha256||'legacy');
  if(packURLs[k]&&packURLs[k].identity===identity) return packURLs[k].url;
  if(packURLs[k]) packDropURL(pack,name);
  if(!(await packFileReady(pack,meta))) return null;
  const blob = (await packStoredFinal(pack,meta)).blob;
  if(!blob) return null;
  const url=URL.createObjectURL(blob);
  packURLs[k]={identity,url};return url;
}

async function packList(){
  const idx=PACK.idx||await packLoadIndex();
  const ids=new Set([...Object.keys(PACK.activeIdx||{}),...Object.keys(idx||{})]);
  return [...ids].map(id=>{
    const offer=idx&&idx[id],active=PACK.activeIdx&&PACK.activeIdx[id],pack=offer||active;
    return {
      id,label:String(pack.label||id),bytes:pack.bytes,files:pack.files.length,
      installed:!!active,updateAvailable:!!(active&&offer&&packPackIdentity(active)!==packPackIdentity(offer)),
      dependencies:Array.isArray(pack.dependencies)?[...pack.dependencies]:[]
    };
  });
}
async function packStatus(pack,options={}){
  const idx=PACK.idx||await packLoadIndex();
  if(!idx||!idx[pack]) return {ok:false,reason:'manifest',pack};
  const plan=await packPlan(pack,{forceHash:!!options.verify,index:idx});
  const missing=plan.byPack.find(item=>item.pack===pack).missing;
  const active=PACK.activeIdx&&PACK.activeIdx[pack];
  const activePlan=active?await packPlan(pack,{forceHash:!!options.verify,index:PACK.activeIdx}):null;
  const installed=!!(activePlan&&!activePlan.files.length);
  return {
    ok:true,pack,installed,partial:plan.storedBytes>0&&plan.files.length>0,
    updateAvailable:!!(active&&packPackIdentity(active)!==packPackIdentity(idx[pack])),
    bytes:idx[pack].bytes,storedBytes:missing.storedBytes,remainingBytes:missing.bytes,
    missingFiles:missing.files.map(f=>f.name),dependencies:plan.order.filter(id=>id!==pack),
    missingDependencies:plan.byPack.filter(item=>item.pack!==pack&&item.missing.files.length).map(item=>item.pack)
  };
}
async function packPreflight(pack){
  const idx=PACK.idx||await packLoadIndex();
  if(!idx||!idx[pack]) return {ok:false,reason:'manifest',pack};
  return packStoragePreflight(pack,await packPlan(pack));
}
async function packRemove(pack,options={}){
  if(!packValidId(pack)) return {ok:false,reason:'pack-id'};
  if(PACK.busy) return {ok:false,reason:'busy'};
  PACK.busy=true;
  try{
    const idx=PACK.idx||await packLoadIndex();
    const active=PACK.activeIdx||Object.create(null),dependents=[];
    if(active[pack]){
      for(const id of Object.keys(active)){
        if(id!==pack&&packDependencyOrder(id,active).includes(pack)) dependents.push(id);
      }
      if(dependents.length&&!options.force) return {ok:false,reason:'dependency',pack,dependents};
      const deactivate=new Set([pack,...(options.force?dependents:[])]);
      const packs=Object.fromEntries(Object.entries(PACK.rawActive.packs||{}).filter(([id])=>!deactivate.has(id)));
      await packPersistActive({...PACK.rawActive,packs});
    }
    const files=await packDeletePrefix(PACK_STORE,pack+'/');
    const chunks=await packDeletePrefix(PACK_CHUNK_STORE,pack+'/');
    const metadata=await packDeletePrefix(PACK_META_STORE,'file:'+pack+'/');
    await packStoreDelete(PACK_META_STORE,packJournalKey(pack));
    for(const key of Object.keys(packURLs)) if(key.startsWith(pack+'/')) packDropURL(pack,key.slice(pack.length+1));
    return {ok:true,pack,removed:true,files,chunks,metadata};
  }catch(e){return {ok:false,reason:'storage',message:e&&e.message||String(e)};}
  finally{PACK.busy=false;}
}

/* Public, pack-ID-neutral control surface. Audio keeps using packURL() and the
   legacy start-screen prompt; launcher/settings code can install, verify,
   repair or remove any manifest pack without learning its IndexedDB layout. */
const MASSFRONT_ASSET_PACKS=Object.freeze({
  loadIndex:packLoadIndex,
  list:packList,
  status:packStatus,
  preflight:packPreflight,
  install:(pack,options)=>packInstallPack(pack,options||{}),
  repair:(pack,options)=>packInstallPack(pack,{...(options||{}),repair:true}),
  remove:(pack,options)=>packRemove(pack,options||{}),
  url:packURL
});
if(typeof window!=='undefined') window.MASSFRONT_ASSET_PACKS=MASSFRONT_ASSET_PACKS;

/* ---- UI -------------------------------------------------------------------
   A single line on the start screen, in the same register as the updater panel:
   quiet when there is nothing to say, explicit about size before it spends
   anyone's data. */
function packPanel(){
  let el = document.getElementById('packPanel');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'packPanel';
  el.innerHTML = '<div class="packRow"><div><div id="packTxt"></div><div id="packSub"></div></div>'
               + '<button id="packBtn"></button></div>'
               + '<div id="packBarO"><div id="packBarF"></div></div>';
  const start = document.getElementById('startScreen');
  const anchor = document.getElementById('updPanel');
  /* The update panel moved into its own overlay (updScr) a while ago, so it is
     no longer a child of the start screen; insertBefore on a foreign node
     throws. Fall back to a plain append — the panel still lands on the start
     screen, just without a hard position beside the version row. */
  if(start && anchor && anchor.parentNode === start) start.insertBefore(el, anchor);
  else if(start) start.appendChild(el);
  el.querySelector('#packBtn').addEventListener('click', e => {
    e.stopPropagation();
    if(typeof sfx === 'function') sfx('ui');
    if(PACK.state === 'downloading') return;
    packStart(true);
  });
  return el;
}
function packRenderBar(){
  const el = document.getElementById('packPanel');
  if(!el) return;
  const txt = el.querySelector('#packTxt'), sub = el.querySelector('#packSub');
  const btn = el.querySelector('#packBtn'), bar = el.querySelector('#packBarF');
  el.classList.toggle('busy', PACK.state === 'downloading');
  if(PACK.state === 'downloading'){
    const pct = PACK.total ? Math.round(PACK.got / PACK.total * 100) : 0;
    txt.textContent = 'DOWNLOADING AUDIO PACK';
    sub.textContent = packBytes(PACK.got) + ' of ' + packBytes(PACK.total) + '  ·  ' + pct + '%';
    bar.style.width = pct + '%'; btn.textContent = '…'; btn.disabled = true;
    el.style.display = '';
  } else if(PACK.state === 'offer'){
    /* No longer soundtrack-only: this panel now covers the voice bank too, and
       telling a player they are downloading music when they are also getting
       every spoken line is the kind of small lie that gets a refund request. */
    txt.textContent = 'AUDIO PACK AVAILABLE';
    sub.textContent = packBytes(PACK.total) + ' — faction music and voices, downloaded once';
    bar.style.width = '0%'; btn.textContent = 'GET IT'; btn.disabled = false;
    el.style.display = '';
  } else if(PACK.state === 'error'){
    txt.textContent = 'AUDIO PACK UNAVAILABLE';
    sub.textContent = PACK.err;
    bar.style.width = '0%'; btn.textContent = 'RETRY'; btn.disabled = false;
    el.style.display = '';
  } else {
    el.style.display = 'none';                    // ready or nothing to offer
  }
}

/* Every pack this build knows how to consume, in the order it wants them.
   `voice` was published on the channel and then never requested by anything —
   packDownload's only call site asked for 'music' and packStart returned early
   unless idx.music existed — so on a pack-only build the radio and KEEN banks
   were never fetched, packURL('voice', …) always returned null, and voice was
   silent on every device. Generalised over a list so the next pack is data. */
/* Voice FIRST. Music is 16.1 MB and voice is 5.2, so fetching in the old order
   meant the download prompt quoted 21.3 MB and KEEN stayed mute until the whole
   soundtrack had landed — on a phone, on mobile data, that is most of a session
   of silence from the feature the update is for. Ordered by what the player
   notices missing, not by what was written first. */
const PACK_WANT = ['voice', 'music'];

/* Re-entrancy latch for packStart. PACK.busy exists but is only ever set and
   cleared INSIDE packDownload, and packStart awaits the index plus one
   packMissing() per pack before it gets there — so from the first tap until
   the first byte, PACK.state is still 'offer' and the panel button's
   `state === 'downloading'` guard is wide open. Two taps in that window (or a
   tap landing while the 4s initAssetPacks timer fires) started two complete,
   concurrent downloads of the same files: double the player's mobile data,
   double the writes, and a progress bar driven by two writers at once. */
let packStarting = false;
async function packStart(manual){
  if(packStarting) return;
  packStarting = true;
  try{ return await packStartInner(manual); }
  finally{ packStarting = false; }
}
async function packStartInner(manual){
  packPanel();
  const idx = PACK.idx || await packLoadIndex();
  if(!idx){ PACK.state = 'idle'; packRenderBar(); return; }
  const want = PACK_WANT.filter(p => idx[p]);
  if(!want.length){ PACK.state = 'idle'; packRenderBar(); return; }
  let bytes = 0;
  const need = [];
  for(const p of want){
    const m = await packMissing(p);
    if(m.files.length){ need.push(p); bytes += m.bytes; }
  }
  let activeOne=false;
  for(const p of want){
    if(PACK.activeIdx[p]&&!(await packPlan(p,{index:PACK.activeIdx})).files.length){activeOne=true;break;}
  }
  if(activeOne&&typeof audAttachPack==='function') audAttachPack();
  PACK.total = bytes;
  if(!need.length){
    PACK.state = 'ready'; packRenderBar();
    return;
  }
  let pref = 'ask';
  try{ pref = localStorage.getItem(PACK_PREF) || 'ask'; }catch(e){}
  if(!manual && pref !== 'auto'){ PACK.state = 'offer'; packRenderBar(); return; }
  try{ localStorage.setItem(PACK_PREF, 'auto'); }catch(e){}
  const failed = [];
  for(const p of need) if(!(await packDownload(p))) failed.push(p);
  /* Attach on ANY complete pack, never on a clean sweep of all of them.
     `ok = (await packDownload(p)) && ok` meant a single permanently
     unavailable file in ONE pack suppressed audAttachPack() for every pack
     that had downloaded perfectly — and it stayed suppressed on every launch
     afterwards, because the finished pack reports nothing missing (so it is
     not even retried) while the broken one keeps failing and keeps holding
     `ok` false. A player could be carrying the entire 16 MB soundtrack in
     IndexedDB and never hear a note of it, permanently, with no control in
     the UI that would fix it. Re-derived from storage rather than from the
     download results so a pack completed on an EARLIER launch also counts. */
  let haveOne = false;
  for(const p of want){
    if(PACK.activeIdx[p]&&!(await packPlan(p,{index:PACK.activeIdx})).files.length){haveOne=true;break;}
  }
  if(haveOne && typeof audAttachPack === 'function') audAttachPack();
  /* A later pack succeeding must not bury an earlier one's failure: PACK.state
     is what the panel reads, and 'ready' hides the panel outright — so voice
     failing and music succeeding used to leave no trace anywhere on screen. */
  if(failed.length){
    PACK.state = 'error';
    PACK.err = 'Some audio could not be downloaded — the game runs without it';
    packRenderBar();
  }
}

function initAssetPacks(){
  packPanel(); packRenderBar();
  /* Deliberately late: terrain generation and audio decode are already
     competing for the first few seconds of a cold start. */
  if(typeof netAllowed!=='function' || netAllowed()) setTimeout(() => packStart(false), 4000);
}

/* Galactic Exploration ships in player APK/www from the signed runtime pack.
   Older installs (notably 1.33.51) omitted it. When the HEAD probe misses, this
   fetches the remote stub and signed manifest, then registers that manifest
   with the same bounded pack engine used by audio. The former dedicated DB is
   read only for verified migration. A blob: URL for index.html was considered
   for navigation and rejected: the Galactic entry
   ticket lives in this document's sessionStorage, and a blob: document is a
   different origin, so the ticket and the return bridge would vanish. Cache
   here; mfOpenExploration keeps the War Room fallback. Opening still needs the
   files on the same origin (packaged www), which is why player packs include
   the module instead of relying on this download alone. */
const EXP_PACK_DB='massfront-exploration-pack', EXP_PACK_STORE='files';
const EXP_PACK_ID='galactic-exploration';
const EXP_PACK_STUB='assets/data/exploration-pack-remote.json';
let expPackBusy=false,expPackDbPromise=null;

function expPackDb(){
  if(expPackDbPromise) return expPackDbPromise;
  expPackDbPromise=new Promise((res, rej) => {
    const r = indexedDB.open(EXP_PACK_DB, 1);
    r.onupgradeneeded = () => { const d = r.result;
      if(!d.objectStoreNames.contains(EXP_PACK_STORE)) d.createObjectStore(EXP_PACK_STORE); };
    r.onsuccess = () => {r.result.onversionchange=()=>{r.result.close();expPackDbPromise=null;};res(r.result);};
    r.onerror = () => {expPackDbPromise=null;rej(r.error);};
  });
  return expPackDbPromise;
}
async function expPackGet(k){
  const db = await expPackDb();
  return new Promise((res, rej) => {
    const q = db.transaction(EXP_PACK_STORE, 'readonly').objectStore(EXP_PACK_STORE).get(k);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
function expPackJoin(base, rel){
  const root=String(base||'').replace(/\/?$/,'/');
  const path=String(rel||'').replace(/^\/+/,'');
  return root+path.split('/').map(encodeURIComponent).join('/');
}
/* Directory of a manifest URL, query stripped. Files listed by a manifest are
   siblings of it, so this is how the two are kept on one origin. */
function expPackBaseOf(u){
  const str=String(u||'');
  if(!str) return '';
  const cut=str.indexOf('?'),path=cut<0?str:str.slice(0,cut);
  const slash=path.lastIndexOf('/');
  return slash<0?'':path.slice(0,slash+1);
}
async function mfExplorationRemoteSpec(){
  let stub=null;
  try{
    const r=await fetch(EXP_PACK_STUB,{cache:'no-store'});
    if(r.ok) stub=await r.json();
  }catch(e){}
  const endpoint=(typeof packEndpoint==='function'&&packEndpoint())||'';
  const endpointBase=endpoint?endpoint.replace(/\/$/,'')+'/exploration-pack/':'';
  /* The manifest and the files it lists MUST come from the same place.
     These two lines used to disagree: manifest preferred the stub while base
     preferred packEndpoint(), which is derived from UPDATE_URL. Once UPDATE_URL
     moved to the Cloudflare worker, base became a worker path that returns 404
     for this pack -- the worker mirrors release payloads, not optional content.
     The manifest still loaded from the stub's Hugging Face URL, so the install
     registered and then failed on its first byte. Deriving base from the
     manifest that actually resolved makes the two incapable of disagreeing. */
  const manifest=String(stub&&stub.manifest||'')
    || (endpointBase?expPackJoin(endpointBase,'exploration-content-manifest-v1.json'):'');
  const base=expPackBaseOf(manifest)||String(stub&&stub.base||'')||endpointBase;
  const q=String(stub&&stub.downloadQuery||'');
  return {base,manifest,downloadQuery:q};
}
async function mfInstallExplorationPack(){
  if(expPackBusy) return {ok:false,reason:'busy'};
  if(typeof indexedDB==='undefined') return {ok:false,reason:'no-idb'};
  expPackBusy=true;
  if(typeof toast==='function') toast('Galactic pack downloading...');
  try{
    /* A completed generic pack remains discoverable from the cached manifest
       after an offline restart. Do not require the remote special manifest in
       that case. */
    const cached=PACK.idx||await packLoadCachedIndex();
    if(cached&&cached[EXP_PACK_ID]){
      const ready=await packStatus(EXP_PACK_ID);
      if(ready.installed) return {ok:true,cached:true,openUrl:null,pack:EXP_PACK_ID};
    }
    if(typeof netAllowed==='function'&&!netAllowed()) return {ok:false,reason:'offline'};
    const spec=await mfExplorationRemoteSpec();
    if(!spec.manifest&&!spec.base) return {ok:false,reason:'no-endpoint'};
    let manUrl=spec.manifest||expPackJoin(spec.base,'exploration-content-manifest-v1.json');
    if(spec.downloadQuery&&manUrl.indexOf('?')<0) manUrl+=spec.downloadQuery;
    const mr=await fetch(manUrl,{cache:'no-store'});
    if(!mr.ok) return {ok:false,reason:'manifest'};
    const man=await mr.json();
    if(!man||man.kind!=='ExplorationContentManifestV1'||!Array.isArray(man.files)||!man.files.length)
      return {ok:false,reason:'manifest'};
    const files=[];
    for(const entry of man.files){
      const rel=String(entry.path||'').replace(/\\/g,'/');
      if(!rel||rel.startsWith('/')||rel.includes('..')) return {ok:false,reason:'path'};
      const match=/^sha256-([a-f0-9]{64})$/i.exec(String(entry.hash||''));
      if(!match) return {ok:false,reason:'hash'};
      files.push({name:rel,size:Number(entry.bytes),sha256:match[1].toLowerCase()});
    }
    const bytes=files.reduce((n,file)=>n+file.size,0);
    if(!Number.isSafeInteger(bytes)||Number(man.totalBytes)!==bytes) return {ok:false,reason:'size'};
    if(!PACK.idx) await packLoadIndex();
    const registered=await packRegisterPack(EXP_PACK_ID,{
      format:1,label:'Galactic Exploration',bytes,chunkSize:PACK_DEFAULT_CHUNK_BYTES,
      baseUrl:spec.base,downloadQuery:spec.downloadQuery||'',files
    });
    const migrationPlan=await packPlan(EXP_PACK_ID);
    const migrationStorage=await packStoragePreflight(EXP_PACK_ID,migrationPlan);
    if(!migrationStorage.ok) return {ok:false,reason:'storage',storage:migrationStorage};

    /* 1.33.51 wrote whole, size-only Blobs into a separate database. Import
       only those that pass the signed manifest's whole-file SHA-256; the old
       store is otherwise read-only and the generic engine owns all new data,
       repair, removal, quota checks, Range chunks and offline mounting. */
    for(const file of registered.files){
      if(await packFileReady(EXP_PACK_ID,file)) continue;
      let legacy=null;
      try{legacy=packStoredBlob(await expPackGet(file.name));}catch(e){}
      if(!legacy||legacy.size!==file.size) continue;
      const actual=await packHashBlob(legacy,file.chunkSize);
      if(actual!==file.sha256) continue;
      await packPut(packFileKey(EXP_PACK_ID,file),legacy);
      await packStorePut(PACK_META_STORE,packMetaKey(EXP_PACK_ID,file),{
        sha256:actual,size:file.size,verifiedAt:Date.now(),migratedFrom:EXP_PACK_DB
      });
    }
    const result=await packInstallPack(EXP_PACK_ID);
    return {...result,cached:!!result.ok,openUrl:null};
  }catch(e){
    return {ok:false,reason:e&&e.code||'fetch',message:e&&e.message||String(e)};
  }finally{
    expPackBusy=false;
  }
}

