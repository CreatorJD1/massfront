import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const releases=join(root,'releases');
const requestedVersion=process.argv[2]||'';
const VERSION_RE=/^\d+\.\d+\.\d+$/;
const commanderIds=[
  'nova_kai','nova_holt','nova_vale',
  'legion_vex','legion_korr','legion_dravik',
  'syndicate_renn','syndicate_nyx','syndicate_voss'
];

const fail=message=>{ throw new Error(message); };
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const countOccurrences=(text,needle)=>{
  let count=0, from=0, found;
  while((found=text.indexOf(needle,from))!==-1){ count++; from=found+needle.length; }
  return count;
};
const compareVersions=(a,b)=>{
  const aa=a.split('.').map(Number), bb=b.split('.').map(Number);
  for(let i=0;i<3;i++) if(aa[i]!==bb[i]) return aa[i]-bb[i];
  return 0;
};
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function availablePayloads(){
  const found=[];
  for(const entry of readdirSync(releases,{withFileTypes:true})){
    let match;
    if(entry.isDirectory()&&(match=/^staging-v(\d+\.\d+\.\d+)$/.exec(entry.name))
      &&existsSync(join(releases,entry.name,'artifacts.json')))
      found.push({version:match[1],format:'per-file',path:join(releases,entry.name)});
    if(entry.isFile()&&(match=/^MASSFRONT-v(\d+\.\d+\.\d+)-update\.js$/.exec(entry.name)))
      found.push({version:match[1],format:'legacy-monolith',path:join(releases,entry.name)});
  }
  return found;
}

function selectPayload(){
  if(requestedVersion&&!VERSION_RE.test(requestedVersion))
    fail('usage: node tools/test-update-binary-art.mjs [x.y.z]');
  const candidates=availablePayloads().filter(item=>!requestedVersion||item.version===requestedVersion);
  candidates.sort((a,b)=>compareVersions(b.version,a.version)
    ||(a.format==='per-file'?-1:1));
  if(!candidates.length){
    const suffix=requestedVersion?' for '+requestedVersion:'';
    fail('no OTA staging directory or legacy monolith found'+suffix);
  }
  return candidates[0];
}

function decodeDataUri(uri,label){
  const match=/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  if(!match) fail(label+' is not a supported base64 image data URI');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<1024) fail(label+' is suspiciously small ('+bytes.length+' bytes)');
  if(bytes.toString('base64')!==match[2]) fail(label+' has malformed or non-canonical base64');
  return {mime:match[1],bytes,sha256:sha256(bytes)};
}

function loadPerFilePayload(selected){
  const indexPath=join(selected.path,'artifacts.json');
  let index;
  try{ index=JSON.parse(readFileSync(indexPath,'utf8')); }
  catch(error){ fail('cannot parse '+indexPath+': '+error.message); }
  if(!Array.isArray(index)||!index.length) fail('staging artifacts.json is empty');

  const stageRoot=resolve(selected.path), prefix=stageRoot.endsWith(sep)?stageRoot:stageRoot+sep;
  const seen=new Set(), artifacts=[];
  for(const entry of index){
    const path=String(entry&&entry.path||'').replace(/\\/g,'/');
    if(!path||path.startsWith('/')||path.split('/').includes('..'))
      fail('unsafe staging artifact path: '+JSON.stringify(entry&&entry.path));
    if(seen.has(path)) fail('duplicate staging artifact path: '+path);
    seen.add(path);
    const absolute=resolve(selected.path,...path.split('/'));
    if(absolute!==stageRoot&&!absolute.startsWith(prefix)) fail('staging artifact escapes root: '+path);
    if(!existsSync(absolute)) fail('staging artifact is missing: '+path);
    const bytes=readFileSync(absolute);
    if(!Number.isSafeInteger(entry.size)||entry.size!==bytes.length)
      fail(path+' size mismatch: index '+entry.size+', disk '+bytes.length);
    const digest=sha256(bytes);
    if(!/^[a-f0-9]{64}$/.test(entry.sha256||'')||entry.sha256!==digest)
      fail(path+' sha256 mismatch: index '+entry.sha256+', disk '+digest);
    const text=bytes.toString('utf8');
    const tail=';window.__MF_OTA_RAN=(window.__MF_OTA_RAN|0)+1;';
    if(!text.trimEnd().endsWith(tail)) fail(path+' is missing its OTA completion stamp');
    artifacts.push({path,text,bytes:bytes.length});
  }

  for(const required of ['ota/00-runtime.js','ota/01-shell.js'])
    if(!seen.has(required)) fail('staging payload is missing '+required);
  const runtime=artifacts.find(item=>item.path==='ota/00-runtime.js');
  const expected='window.__MF_OTA_EXPECT='+artifacts.length+';';
  if(!runtime.text.startsWith(expected))
    fail('runtime artifact does not declare '+expected);
  const shell=artifacts.find(item=>item.path==='ota/01-shell.js');
  if(!shell.text.includes(`"version":"${selected.version}"`))
    fail('OTA shell version is not '+selected.version);
  return {artifacts,runtimeText:runtime.text,payloadBytes:artifacts.reduce((sum,item)=>sum+item.bytes,0)};
}

function loadLegacyPayload(selected){
  const text=readFileSync(selected.path,'utf8');
  if(!text.includes(`"version":"${selected.version}"`))
    fail('OTA shell version is not '+selected.version);
  return {
    artifacts:[{path:basename(selected.path),text,bytes:statSync(selected.path).size}],
    runtimeText:text.includes('window.__MF_OTA_ASSETS=')?text:'',
    payloadBytes:statSync(selected.path).size
  };
}

function validateRuntimeAssetMap(runtimeText){
  if(!runtimeText) return null;
  const marker='window.__MF_OTA_ASSETS=';
  const start=runtimeText.indexOf(marker);
  if(start===-1) fail('OTA runtime artifact has no __MF_OTA_ASSETS map');
  const rest=runtimeText.slice(start+marker.length);
  const end=/;\s*window\.mf2AssetURL\s*=/.exec(rest);
  if(!end) fail('OTA runtime asset map has no mf2AssetURL boundary');
  const jsonText=rest.slice(0,end.index);
  let map;
  try{ map=JSON.parse(jsonText); }
  catch(error){ fail('OTA runtime asset map is invalid JSON: '+error.message); }
  const entries=Object.entries(map||{});
  if(!entries.length) fail('OTA runtime asset map is empty');
  let embeddedBytes=0;
  const hashes=new Set();
  for(const [path,uri] of entries){
    if(!path||path.startsWith('/')||path.split('/').includes('..'))
      fail('unsafe OTA runtime asset path: '+JSON.stringify(path));
    if(typeof uri!=='string'||!uri.startsWith('data:'))
      fail(path+' is not embedded in the OTA runtime asset map');
    const decoded=decodeDataUri(uri,'runtime asset '+path);
    embeddedBytes+=decoded.bytes.length;
    hashes.add(decoded.sha256);
    const pair=JSON.stringify(path)+':'+JSON.stringify(uri);
    if(countOccurrences(jsonText,pair)!==1)
      fail(path+' does not have exactly one runtime asset-map entry');
  }
  if(!runtimeText.includes('window.mf2AssetURL=function'))
    fail('OTA runtime artifact does not install mf2AssetURL');
  return {assetCount:entries.length,embeddedBytes,uniquePayloads:hashes.size};
}

function validateCommanderArt(artifacts){
  const joined=artifacts.map(item=>item.text).join('\n');
  /* Preserve the old source-art guard even though current OTAs encode the
     canonical catalog portraits as WebP: a fresh APK can still use the JPEG
     fallbacks, so those nine files must remain distinct as well. */
  const sourceJpegHashes=new Set();
  let sourceJpegBytes=0;
  for(const id of commanderIds){
    const path=join(root,'assets','factions','commanders',id+'.jpg');
    const bytes=readFileSync(path);
    sourceJpegBytes+=bytes.length;
    sourceJpegHashes.add(sha256(bytes));
  }
  if(sourceJpegHashes.size!==commanderIds.length)
    fail('commander JPEG fallback art is duplicated: '+sourceJpegHashes.size+'/'+commanderIds.length+' unique');

  const embeddedHashes=new Set(), checked=[];
  for(const id of commanderIds){
    const idPattern=escapeRegExp(id);
    const pattern=new RegExp(
      `\\bid\\s*:\\s*(['"])${idPattern}\\1\\s*,\\s*portrait\\s*:\\s*(['"])(data:image\\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+)\\2`,
      'g'
    );
    const matches=Array.from(joined.matchAll(pattern),match=>match[3]);
    if(matches.length!==1)
      fail(id+' has '+matches.length+' embedded catalog portraits; expected exactly one');
    const uri=matches[0], decoded=decodeDataUri(uri,'commander portrait '+id);
    const occurrences=countOccurrences(joined,uri);
    if(occurrences!==1)
      fail(id+' portrait payload occurs '+occurrences+' times; expected exactly once');
    if(embeddedHashes.has(decoded.sha256)) fail(id+' reuses another commander portrait payload');
    embeddedHashes.add(decoded.sha256);
    const rel='assets/factions/commanders/'+id+'.jpg';
    for(const ref of ['./'+rel,'../../'+rel,rel])
      if(joined.includes(ref)) fail(rel+' still has an external OTA reference: '+ref);
    checked.push({id,mime:decoded.mime,bytes:decoded.bytes.length,embedded:occurrences,sha256:decoded.sha256});
  }
  if(embeddedHashes.size!==commanderIds.length)
    fail('embedded commander art is duplicated: '+embeddedHashes.size+'/'+commanderIds.length+' unique');
  return {sourceJpegBytes,sourceJpegUnique:sourceJpegHashes.size,embeddedBytes:checked.reduce((sum,item)=>sum+item.bytes,0),assets:checked};
}

const selected=selectPayload();
const loaded=selected.format==='per-file'?loadPerFilePayload(selected):loadLegacyPayload(selected);
const runtimeAssets=validateRuntimeAssetMap(loaded.runtimeText);
const commanders=validateCommanderArt(loaded.artifacts);

console.log(JSON.stringify({
  ok:true,
  version:selected.version,
  format:selected.format,
  payload:selected.path,
  artifactCount:loaded.artifacts.length,
  payloadBytes:loaded.payloadBytes,
  runtimeAssets,
  commanderArt:commanders
},null,2));
