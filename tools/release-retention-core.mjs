import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LEDGER_SCHEMA='MASSFRONT_RELEASE_RETENTION_LEDGER_V2';
const VERSION=/^\d+\.\d+\.\d+$/, SHA256=/^[0-9a-f]{64}$/;
const HISTORICAL=/^update-v(\d+\.\d+\.\d+)\.json$/;
const RELEASE_FILE=/^MASSFRONT-v(\d+\.\d+\.\d+)-(?:mobile-install\.apk(?:\.idsig)?|source\.zip|update\.js|test-evidence\.json)$/;
const STAGING=/^staging-v(\d+\.\d+\.\d+)$/;

export function semverCompare(a,b){const aa=String(a).split('.').map(Number),bb=String(b).split('.').map(Number);for(let i=0;i<3;i++)if(aa[i]!==bb[i])return bb[i]-aa[i];return 0;}
export function sha256File(file){const h=crypto.createHash('sha256');h.update(fs.readFileSync(file));return h.digest('hex');}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function jsonHash(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function posix(rel){return rel.split(path.sep).join('/');}
function safeRelative(rel){return typeof rel==='string'&&rel.length>0&&!path.isAbsolute(rel)&&!rel.includes('\\')&&!rel.split('/').some(p=>!p||p==='.'||p==='..');}
function issue(code,message,context={}){return {code,message,...context};}
function localCandidates(dir,v,rel){const out=[path.join(dir,`staging-v${v}`,...rel.split('/'))];if(RELEASE_FILE.test(path.basename(rel)))out.push(path.join(dir,...rel.split('/')));return out;}
function validateEntry(entry,version,list,index,dir,issues,hashCache){
  const at={version,list,index,path:entry?.path};if(!entry||typeof entry!=='object'){issues.push(issue('ARTIFACT_INVALID','Artifact entry is not an object.',at));return null;}
  if(!safeRelative(entry.path))issues.push(issue('ARTIFACT_PATH_INVALID','Artifact path must be a safe normalized relative path.',at));
  let url;try{url=new URL(entry.url);}catch{}if(!url||url.protocol!=='https:')issues.push(issue('ARTIFACT_URL_INVALID','Artifact URL must be absolute HTTPS.',at));
  if(!Number.isSafeInteger(entry.size)||entry.size<=0)issues.push(issue('ARTIFACT_SIZE_INVALID','Artifact size must be a positive safe integer.',at));
  if(!SHA256.test(String(entry.sha256||'')))issues.push(issue('ARTIFACT_SHA256_INVALID','Artifact SHA-256 must be lowercase hexadecimal.',at));
  const local=safeRelative(entry.path)?localCandidates(dir,version,entry.path).find(fs.existsSync):null;let localStatus='not-local',actualSize=null,actualSha256=null;
  if(local){actualSize=fs.statSync(local).size;actualSha256=hashCache.get(local)||sha256File(local);hashCache.set(local,actualSha256);localStatus='verified';
    if(actualSize!==entry.size){localStatus='mismatch';issues.push(issue('ARTIFACT_SIZE_MISMATCH','Local artifact size differs from manifest.',{...at,local:posix(path.relative(dir,local)),expected:entry.size,actual:actualSize}));}
    if(actualSha256!==entry.sha256){localStatus='mismatch';issues.push(issue('ARTIFACT_SHA256_MISMATCH','Local artifact SHA-256 differs from manifest.',{...at,local:posix(path.relative(dir,local)),expected:entry.sha256,actual:actualSha256}));}}
  return {list,index,path:entry.path,url:entry.url,size:entry.size,sha256:entry.sha256,local:local?posix(path.relative(dir,local)):null,localStatus,actualSize,actualSha256};
}

export function discoverHistoricalManifests(dir){const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const m=ent.isFile()&&ent.name.match(HISTORICAL);if(m){const file=path.join(dir,ent.name);out.push({version:m[1],file,name:ent.name,manifest:readJson(file)});}}return out.sort((a,b)=>semverCompare(a.version,b.version));}
export function classifyReleaseFamily(dir){
  const out=[];for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,ent.name);let m=ent.isFile()&&(ent.name.match(HISTORICAL)||ent.name.match(RELEASE_FILE));
    if(m)out.push({version:m[1],path:ent.name,type:ent.name.startsWith('update-v')?'historical-manifest':'release-artifact'});
    m=ent.isDirectory()&&ent.name.match(STAGING);if(m){const stack=[full];while(stack.length){const current=stack.pop();for(const child of fs.readdirSync(current,{withFileTypes:true})){const target=path.join(current,child.name);if(child.isDirectory())stack.push(target);else if(child.isFile())out.push({version:m[1],path:posix(path.relative(dir,target)),type:'staging-artifact'});}}}
  }return out;
}

export function buildRetentionLedger({root,releasesDir=path.join(root,'releases'),keepCount=5,now=new Date().toISOString()}){
  const issues=[],historical=discoverHistoricalManifests(releasesDir),rows=historical.slice(0,keepCount),retainedVersions=rows.map(x=>x.version);
  if(rows.length!==keepCount)issues.push(issue('RETAINED_SET_NOT_EXACT',`Retention set must contain exactly ${keepCount} parsed historical manifests; found ${rows.length}.`));
  const pointerFiles=[path.join(root,'update.json'),path.join(releasesDir,'update.json'),path.join(releasesDir,'MASSFRONT-update.json')],pointers=[];
  for(const file of pointerFiles){if(!fs.existsSync(file)){issues.push(issue('ACTIVE_POINTER_MISSING','Active pointer is missing.',{path:posix(path.relative(root,file))}));continue;}try{const value=readJson(file);pointers.push({path:posix(path.relative(root,file)),version:String(value.version||''),hash:jsonHash(value)});}catch(e){issues.push(issue('ACTIVE_POINTER_INVALID',e.message,{path:posix(path.relative(root,file))}));}}
  if(pointers.length!==3||new Set(pointers.map(p=>`${p.version}:${p.hash}`)).size!==1)issues.push(issue('ACTIVE_POINTER_DRIFT','Root and both release manifest mirrors must be canonically identical.',{pointers}));
  const active=pointers.find(p=>p.path==='update.json')?.version||'';if(!retainedVersions.includes(active))issues.push(issue('ACTIVE_NOT_RETAINED','Active version is outside the retained set.',{active,retainedVersions}));
  const releases=[],hashCache=new Map();for(const row of rows){const m=row.manifest,localIssues=[];
    if(String(m.version||'')!==row.version)localIssues.push(issue('MANIFEST_VERSION_MISMATCH','Filename and declared version differ.',{version:row.version,declared:m.version}));
    const lists=[];if(Array.isArray(m.files))lists.push(['files',m.files]);if(Array.isArray(m.full))lists.push(['full',m.full]);if(!lists.some(([,a])=>a.length))localIssues.push(issue('MANIFEST_PAYLOAD_EMPTY','Manifest has no files/full payload.',{version:row.version}));
    const artifacts=[];for(const [name,values]of lists)for(let i=0;i<values.length;i++){const a=validateEntry(values[i],row.version,name,i,releasesDir,localIssues,hashCache);if(a)artifacts.push(a);}
    const dependencies=[m.patchFrom,m.base].filter(v=>typeof v==='string'&&v&&VERSION.test(v));for(const dependency of dependencies)if(!retainedVersions.includes(dependency))localIssues.push(issue('BASE_CHAIN_BROKEN','Declared base/patch dependency is outside the retained set.',{version:row.version,dependency}));
    issues.push(...localIssues);releases.push({version:row.version,manifest:row.name,manifestSha256:sha256File(row.file),kind:m.kind||'full',active:row.version===active,dependencies,artifacts,eligible:localIssues.length===0});}
  const keep=new Set(retainedVersions),candidates=classifyReleaseFamily(releasesDir).filter(x=>!keep.has(x.version)).map(x=>({id:'local:'+crypto.createHash('sha256').update(`${x.type}\0${x.version}\0${x.path}`).digest('hex').slice(0,24),scope:'local',action:'remove',...x,status:'candidate',recovery:`restore immutable release v${x.version} from its historical manifest and SHA-256`})).sort((a,b)=>a.path.localeCompare(b.path));
  const ledger={schema:LEDGER_SCHEMA,schemaVersion:2,generatedAt:now,keepCount,activeVersion:active,retainedVersions,releases,pointers,validation:{ok:issues.length===0,issues},candidates,policy:{releaseFamilies:['update-v<semver>.json','MASSFRONT-v<semver>-approved-artifact','staging-v<semver>/**'],unrelatedVersionedPaths:'excluded'}};
  ledger.ledgerHash=jsonHash({...ledger,ledgerHash:undefined});return ledger;
}
function candidateShape(row){if(!row||!VERSION.test(String(row.version||'')))return false;if(row.type==='historical-manifest')return row.path===`update-v${row.version}.json`;if(row.type==='release-artifact')return RELEASE_FILE.test(row.path)&&row.path.includes(`v${row.version}-`);if(row.type==='staging-artifact')return row.path.startsWith(`staging-v${row.version}/`)&&safeRelative(row.path);return false;}
export function assertPruneSelection(ledger,ids,scope='local'){
  if(!ledger||ledger.schema!==LEDGER_SCHEMA)throw new Error('Retention ledger schema is invalid.');
  const storedHash=ledger.ledgerHash,body={...ledger};delete body.ledgerHash;if(storedHash!==jsonHash(body))throw new Error('Retention ledger hash is invalid.');
  if(!ledger.validation?.ok)throw new Error('Retention ledger validation failed; pruning is forbidden.');
  const unique=[...new Set(ids)];if(!unique.length)throw new Error('Pass one or more explicit --ledger-id values.');
  const allowed=new Map(ledger.candidates.filter(x=>x.scope===scope&&candidateShape(x)).map(x=>[x.id,x]));return unique.map(id=>{const row=allowed.get(id);if(!row)throw new Error(`Ledger ID is absent, malformed, or wrong scope: ${id}`);return row;});
}
