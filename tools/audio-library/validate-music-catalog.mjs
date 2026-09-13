#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {dirname,extname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
export const repoRoot=resolve(here,'..','..');
export const defaultCatalogPath=resolve(repoRoot,'source-media','audio-library','music-catalog.json');

const SCENE_ROLES=['menu','wartable','exploration','ship-room','ambient','tension','combat','victory','defeat'];
const RUNTIME_CODECS=['ogg','m4a'];
const TRACK_KEYS=['id','title','status','instrumental','sceneRoles','mood','allowedContexts','playback','ownership','license','provenance','sourceMaster','codecs','packMembership','fallback','loudness'];
const TOP_KEYS=['$schema','schemaVersion','catalogId','auditedAt','inventory','policy','tracks'];
const STATUS=new Set(['PLANNED','UNKNOWN','APPROVED']);
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9_-]*$/;

function object(value){ return !!value&&typeof value==='object'&&!Array.isArray(value); }
function finite(value){ return typeof value==='number'&&Number.isFinite(value); }
function issue(list,code,path,message){ list.push({code,path,message}); }
function close(a,b,tolerance){ return finite(a)&&finite(b)&&Math.abs(a-b)<=tolerance; }

function checkKeys(value,allowed,path,errors){
  if(!object(value)){ issue(errors,'OBJECT_REQUIRED',path,'must be an object'); return false; }
  const set=new Set(allowed);
  for(const key of Object.keys(value)) if(!set.has(key))
    issue(errors,'UNEXPECTED_PROPERTY',`${path}.${key}`,'is not allowed by the catalog schema');
  for(const key of allowed) if(!(key in value))
    issue(errors,'MISSING_PROPERTY',`${path}.${key}`,'is required by the catalog schema');
  return true;
}

function stringArray(value,path,errors,{min=0,allowed=null}={}){
  if(!Array.isArray(value)){ issue(errors,'ARRAY_REQUIRED',path,'must be an array'); return []; }
  if(value.length<min) issue(errors,'ARRAY_TOO_SHORT',path,`must contain at least ${min} item(s)`);
  const seen=new Set();
  value.forEach((item,index)=>{
    if(typeof item!=='string'||!item.trim()) issue(errors,'STRING_REQUIRED',`${path}[${index}]`,'must be a non-empty string');
    else {
      if(seen.has(item)) issue(errors,'DUPLICATE_ARRAY_ITEM',`${path}[${index}]`,`${item} is duplicated`);
      seen.add(item);
      if(allowed&&!allowed.has(item)) issue(errors,'UNSUPPORTED_VALUE',`${path}[${index}]`,`${item} is not supported`);
    }
  });
  return value.filter(item=>typeof item==='string');
}

function localPath(root,path,where,errors){
  if(typeof path!=='string'||!path){ issue(errors,'PATH_REQUIRED',where,'must be a repository-relative path'); return null; }
  const absolute=resolve(root,path);
  const rel=relative(root,absolute);
  if(rel.startsWith('..')||isAbsolute(rel)){
    issue(errors,'PATH_OUTSIDE_REPOSITORY',where,`${path} resolves outside the repository`);
    return null;
  }
  return absolute;
}

function evidenceRefs(value,path,errors,root){
  const refs=stringArray(value,path,errors);
  for(let index=0;index<refs.length;index++){
    const ref=refs[index];
    if(ref.startsWith('private-evidence:')) continue;
    const absolute=localPath(root,ref,`${path}[${index}]`,errors);
    if(absolute&&!existsSync(absolute)) issue(errors,'EVIDENCE_MISSING',`${path}[${index}]`,`${ref} does not exist`);
  }
  return refs;
}

function hashFile(path){
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function validateInventory(value,path,errors,root,verifyFiles,stats){
  const keys=['adaptiveBedGlob','runtimePlaylistManifest','runtimePlaylistState','runtimePlaylistTrackCount','assignmentManifest','assignmentTrackCount','ingestTool','ingestOutputCodecs','generatorTool'];
  const observed={bedPaths:[],playlistStems:[]};
  if(!checkKeys(value,keys,path,errors)) return observed;
  const fixed={
    adaptiveBedGlob:'assets/audio/mus_*',
    runtimePlaylistManifest:'assets/audio/music.json',
    assignmentManifest:'assets/audio/music-assign.json',
    ingestTool:'tools/ingest-music.py',
    generatorTool:'tools/make-audio.py'
  };
  for(const [field,expected] of Object.entries(fixed)) if(value[field]!==expected)
    issue(errors,'INVENTORY_PATH',`${path}.${field}`,`must be ${expected}`);
  if(!['EMPTY_CURATED','CATALOGED'].includes(value.runtimePlaylistState)) issue(errors,'PLAYLIST_STATE',`${path}.runtimePlaylistState`,'must be EMPTY_CURATED or CATALOGED');
  for(const field of ['runtimePlaylistTrackCount','assignmentTrackCount']) if(!Number.isInteger(value[field])||value[field]<0)
    issue(errors,'INVENTORY_COUNT',`${path}.${field}`,'must be a non-negative integer');
  const outputs=stringArray(value.ingestOutputCodecs,`${path}.ingestOutputCodecs`,errors,{min:1,allowed:new Set(RUNTIME_CODECS)});
  if(!verifyFiles) return observed;

  for(const field of ['runtimePlaylistManifest','assignmentManifest','ingestTool','generatorTool']){
    const absolute=localPath(root,value[field],`${path}.${field}`,errors);
    if(absolute&&!existsSync(absolute)) issue(errors,'INVENTORY_FILE_MISSING',`${path}.${field}`,`${value[field]} does not exist`);
  }
  try{
    const playlist=JSON.parse(readFileSync(resolve(root,value.runtimePlaylistManifest),'utf8'));
    let count=0;
    for(const list of Object.values(playlist.playlists||{})) if(Array.isArray(list)){
      count+=list.length;
      for(const track of list) if(track&&typeof track.file==='string') observed.playlistStems.push(`assets/audio/${track.file}`);
    }
    stats.runtimePlaylistTracks=count;
    if(count!==value.runtimePlaylistTrackCount) issue(errors,'PLAYLIST_COUNT_MISMATCH',`${path}.runtimePlaylistTrackCount`,`catalog ${value.runtimePlaylistTrackCount}, manifest ${count}`);
    const expectedState=count?'CATALOGED':'EMPTY_CURATED';
    if(value.runtimePlaylistState!==expectedState) issue(errors,'PLAYLIST_STATE_MISMATCH',`${path}.runtimePlaylistState`,`manifest requires ${expectedState}`);
    if(Array.isArray(playlist.formats)){
      const actual=[...playlist.formats].sort().join(',');
      const expected=[...outputs].sort().join(',');
      if(actual!==expected) issue(errors,'PLAYLIST_FORMAT_MISMATCH',`${path}.ingestOutputCodecs`,`catalog ${expected}, manifest ${actual}`);
    }
  }catch(error){ issue(errors,'PLAYLIST_MANIFEST_INVALID',`${path}.runtimePlaylistManifest`,error.message); }
  try{
    const assignment=JSON.parse(readFileSync(resolve(root,value.assignmentManifest),'utf8'));
    const count=Array.isArray(assignment.tracks)?assignment.tracks.length:0;
    stats.assignmentTracks=count;
    if(count!==value.assignmentTrackCount) issue(errors,'ASSIGNMENT_COUNT_MISMATCH',`${path}.assignmentTrackCount`,`catalog ${value.assignmentTrackCount}, manifest ${count}`);
  }catch(error){ issue(errors,'ASSIGNMENT_MANIFEST_INVALID',`${path}.assignmentManifest`,error.message); }
  try{
    const dir=resolve(root,'assets','audio');
    observed.bedPaths=readdirSync(dir).filter(name=>/^mus_.*\.(ogg|m4a)$/i.test(name)).map(name=>`assets/audio/${name}`);
    stats.adaptiveBedFiles=observed.bedPaths.length;
  }catch(error){ issue(errors,'ADAPTIVE_BED_INVENTORY_FAILED',`${path}.adaptiveBedGlob`,error.message); }
  return observed;
}

function probe(path){
  const run=spawnSync('ffprobe',[
    '-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',path
  ],{encoding:'utf8',maxBuffer:4*1024*1024});
  if(run.error) return {error:`ffprobe unavailable: ${run.error.message}`};
  if(run.status!==0) return {error:`ffprobe exited ${run.status}: ${(run.stderr||'').trim()}`};
  try{
    const parsed=JSON.parse(run.stdout);
    const stream=(parsed.streams||[]).find(item=>item.codec_name);
    if(!stream) return {error:'ffprobe found no audio stream'};
    return {
      codec:String(stream.codec_name||''),
      sampleRateHz:Number(stream.sample_rate),
      channels:Number(stream.channels),
      durationSeconds:Number(parsed.format&&parsed.format.duration)
    };
  }catch(error){ return {error:`ffprobe returned invalid JSON: ${error.message}`}; }
}

function measure(path,target,maxPeak){
  const run=spawnSync('ffmpeg',[
    '-hide_banner','-nostdin','-nostats','-i',path,'-af',
    `loudnorm=I=${target}:TP=${maxPeak}:LRA=11:print_format=json`,
    '-f','null','-'
  ],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(run.error) return {error:`ffmpeg unavailable: ${run.error.message}`};
  if(run.status!==0) return {error:`ffmpeg exited ${run.status}`};
  const text=`${run.stdout||''}\n${run.stderr||''}`;
  const matches=text.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if(!matches||!matches.length) return {error:'ffmpeg loudnorm did not return an input measurement'};
  try{
    const parsed=JSON.parse(matches[matches.length-1]);
    return {integratedLufs:Number(parsed.input_i),truePeakDbtp:Number(parsed.input_tp)};
  }catch(error){ return {error:`ffmpeg loudnorm returned invalid JSON: ${error.message}`}; }
}

function validatePlayback(track,path,errors){
  const value=track.playback;
  if(!checkKeys(value,['mode','loop','introSeconds','outroSeconds','loopStartSeconds','loopEndSeconds','authoredLoopCrossfadeMs','transitionCrossfadeMs'],path,errors)) return;
  if(!['LOOP','PLAY_ONCE','PLANNED'].includes(value.mode)) issue(errors,'PLAYBACK_MODE',`${path}.mode`,'must be LOOP, PLAY_ONCE, or PLANNED');
  if(value.loop!==null&&typeof value.loop!=='boolean') issue(errors,'PLAYBACK_LOOP',`${path}.loop`,'must be boolean or null');
  for(const field of ['introSeconds','outroSeconds','loopStartSeconds','loopEndSeconds'])
    if(value[field]!==null&&(!finite(value[field])||value[field]<0)) issue(errors,'PLAYBACK_TIME',`${path}.${field}`,'must be a non-negative number or null');
  for(const field of ['authoredLoopCrossfadeMs','transitionCrossfadeMs'])
    if(value[field]!==null&&(!Number.isInteger(value[field])||value[field]<0)) issue(errors,'PLAYBACK_TIME',`${path}.${field}`,'must be a non-negative integer or null');
  if(value.mode==='LOOP'){
    if(value.loop!==true) issue(errors,'LOOP_METADATA',`${path}.loop`,'LOOP mode requires loop=true');
    if(!finite(value.loopStartSeconds)||!finite(value.loopEndSeconds)||value.loopEndSeconds<=value.loopStartSeconds)
      issue(errors,'LOOP_METADATA',path,'LOOP mode requires an ordered loop start and end');
  }
  if(value.mode==='PLANNED'&&value.loop!==null) issue(errors,'PLANNED_PLAYBACK_CLAIM',`${path}.loop`,'planned playback cannot claim a loop behavior');
}

function validateOwnership(track,path,errors,root){
  const value=track.ownership;
  if(!checkKeys(value,['status','owner','basis','evidenceRefs'],path,errors)) return;
  if(!['UNKNOWN','VERIFIED'].includes(value.status)) issue(errors,'OWNERSHIP_STATUS',`${path}.status`,'must be UNKNOWN or VERIFIED');
  if(value.owner!==null&&(typeof value.owner!=='string'||!value.owner.trim())) issue(errors,'OWNER_VALUE',`${path}.owner`,'must be a non-empty string or null');
  if(value.basis!==null&&(typeof value.basis!=='string'||!value.basis.trim())) issue(errors,'OWNERSHIP_BASIS',`${path}.basis`,'must be a non-empty string or null');
  const refs=evidenceRefs(value.evidenceRefs,`${path}.evidenceRefs`,errors,root);
  if(value.status==='VERIFIED'){
    if(!value.owner) issue(errors,'VERIFIED_OWNERSHIP_OWNER',`${path}.owner`,'verified ownership requires the legal owner');
    if(!value.basis) issue(errors,'VERIFIED_OWNERSHIP_BASIS',`${path}.basis`,'verified ownership requires a documented basis');
    if(!refs.length) issue(errors,'VERIFIED_OWNERSHIP_EVIDENCE',`${path}.evidenceRefs`,'verified ownership requires evidence');
  }
}

function validateLicense(track,path,errors,root){
  const value=track.license;
  if(!checkKeys(value,['status','name','version','permissions','attribution','contentId','evidenceRefs'],path,errors)) return;
  if(!['UNKNOWN','VERIFIED'].includes(value.status)) issue(errors,'LICENSE_STATUS',`${path}.status`,'must be UNKNOWN or VERIFIED');
  for(const field of ['name','version']) if(value[field]!==null&&(typeof value[field]!=='string'||!value[field].trim()))
    issue(errors,'LICENSE_VALUE',`${path}.${field}`,'must be a non-empty string or null');
  const permissionFields=['commercialGameSync','modification','binaryRedistribution','standaloneSoundtrack','marketing'];
  if(checkKeys(value.permissions,permissionFields,`${path}.permissions`,errors))
    for(const field of permissionFields) if(value.permissions[field]!==null&&typeof value.permissions[field]!=='boolean')
      issue(errors,'LICENSE_PERMISSION',`${path}.permissions.${field}`,'must be boolean or null');
  if(checkKeys(value.attribution,['required','text'],`${path}.attribution`,errors)){
    if(value.attribution.required!==null&&typeof value.attribution.required!=='boolean') issue(errors,'ATTRIBUTION_REQUIRED',`${path}.attribution.required`,'must be boolean or null');
    if(value.attribution.text!==null&&(typeof value.attribution.text!=='string'||!value.attribution.text.trim())) issue(errors,'ATTRIBUTION_TEXT',`${path}.attribution.text`,'must be a non-empty string or null');
    if(value.attribution.required===true&&!value.attribution.text) issue(errors,'ATTRIBUTION_TEXT',`${path}.attribution.text`,'is required when attribution is required');
  }
  if(!['UNKNOWN','CLEAR','ENROLLED'].includes(value.contentId)) issue(errors,'CONTENT_ID_STATUS',`${path}.contentId`,'must be UNKNOWN, CLEAR, or ENROLLED');
  const refs=evidenceRefs(value.evidenceRefs,`${path}.evidenceRefs`,errors,root);
  if(value.status==='VERIFIED'){
    if(!value.name) issue(errors,'VERIFIED_LICENSE_NAME',`${path}.name`,'verified licensing requires a license or contract name');
    if(!value.version) issue(errors,'VERIFIED_LICENSE_VERSION',`${path}.version`,'verified licensing requires a license or contract version');
    if(!refs.length) issue(errors,'VERIFIED_LICENSE_EVIDENCE',`${path}.evidenceRefs`,'verified licensing requires evidence');
    for(const field of ['commercialGameSync','modification','binaryRedistribution'])
      if(value.permissions&&value.permissions[field]!==true) issue(errors,'VERIFIED_LICENSE_PERMISSION',`${path}.permissions.${field}`,'must explicitly permit this release use');
    for(const field of permissionFields)
      if(value.permissions&&typeof value.permissions[field]!=='boolean') issue(errors,'VERIFIED_LICENSE_UNKNOWN_PERMISSION',`${path}.permissions.${field}`,'must be resolved to true or false');
    if(!value.attribution||typeof value.attribution.required!=='boolean') issue(errors,'VERIFIED_LICENSE_ATTRIBUTION',`${path}.attribution.required`,'must be resolved to true or false');
    if(value.contentId==='UNKNOWN') issue(errors,'VERIFIED_LICENSE_CONTENT_ID',`${path}.contentId`,'must be resolved before approval');
  }
}

function validateProvenance(track,path,errors,root){
  const value=track.provenance;
  if(!checkKeys(value,['status','creationType','creator','sourceRefs','evidenceRefs','note'],path,errors)) return;
  if(!['UNKNOWN','PARTIAL','VERIFIED'].includes(value.status)) issue(errors,'PROVENANCE_STATUS',`${path}.status`,'must be UNKNOWN, PARTIAL, or VERIFIED');
  if(!['UNKNOWN','PROJECT_GENERATED','LICENSED','COMMISSIONED'].includes(value.creationType)) issue(errors,'CREATION_TYPE',`${path}.creationType`,'is not supported');
  if(value.creator!==null&&(typeof value.creator!=='string'||!value.creator.trim())) issue(errors,'CREATOR_VALUE',`${path}.creator`,'must be a non-empty string or null');
  const sourceRefs=evidenceRefs(value.sourceRefs,`${path}.sourceRefs`,errors,root);
  const refs=evidenceRefs(value.evidenceRefs,`${path}.evidenceRefs`,errors,root);
  if(value.note!==null&&(typeof value.note!=='string'||!value.note.trim())) issue(errors,'PROVENANCE_NOTE',`${path}.note`,'must be a non-empty string or null');
  if(value.status==='VERIFIED'){
    if(!value.creator) issue(errors,'VERIFIED_PROVENANCE_CREATOR',`${path}.creator`,'verified provenance requires a creator');
    if(!sourceRefs.length) issue(errors,'VERIFIED_PROVENANCE_SOURCE',`${path}.sourceRefs`,'verified provenance requires source references');
    if(!refs.length) issue(errors,'VERIFIED_PROVENANCE_EVIDENCE',`${path}.evidenceRefs`,'verified provenance requires evidence');
  }
}

function validateSourceMaster(track,path,errors,root,verifyFiles){
  const value=track.sourceMaster;
  if(!checkKeys(value,['status','kind','path','sha256','bytes','recipeEntry'],path,errors)) return;
  if(!['MISSING','UNKNOWN','RECIPE_ONLY','VERIFIED'].includes(value.status)) issue(errors,'SOURCE_MASTER_STATUS',`${path}.status`,'is not supported');
  if(!['MISSING','FILE','GENERATOR_RECIPE'].includes(value.kind)) issue(errors,'SOURCE_MASTER_KIND',`${path}.kind`,'is not supported');
  if(value.status==='MISSING'){
    if(value.kind!=='MISSING'||value.path!==null||value.sha256!==null||value.bytes!==null)
      issue(errors,'MISSING_MASTER_CLAIM',path,'a missing master cannot carry a file identity');
    return;
  }
  if(value.path===null&&value.status!=='UNKNOWN') issue(errors,'SOURCE_MASTER_PATH',`${path}.path`,'is required for a known source master');
  if(value.sha256!==null&&!HASH.test(value.sha256)) issue(errors,'SOURCE_MASTER_HASH',`${path}.sha256`,'must be a lower-case SHA-256');
  if(value.bytes!==null&&(!Number.isInteger(value.bytes)||value.bytes<1)) issue(errors,'SOURCE_MASTER_BYTES',`${path}.bytes`,'must be a positive integer or null');
  if(value.kind==='GENERATOR_RECIPE'&&(!value.recipeEntry||typeof value.recipeEntry!=='string')) issue(errors,'SOURCE_RECIPE_ENTRY',`${path}.recipeEntry`,'is required for a generator recipe');
  if(value.path&&verifyFiles){
    const absolute=localPath(root,value.path,`${path}.path`,errors);
    if(!absolute||!existsSync(absolute)){ if(absolute) issue(errors,'SOURCE_MASTER_MISSING',`${path}.path`,`${value.path} does not exist`); return; }
    const size=statSync(absolute).size;
    if(size!==value.bytes) issue(errors,'SOURCE_MASTER_BYTES_MISMATCH',`${path}.bytes`,`catalog ${value.bytes}, file ${size}`);
    const sha=hashFile(absolute);
    if(sha!==value.sha256) issue(errors,'SOURCE_MASTER_HASH_MISMATCH',`${path}.sha256`,`catalog ${value.sha256}, file ${sha}`);
  }
}

function validatePack(track,path,errors,root){
  const value=track.packMembership;
  if(!checkKeys(value,['status','inclusion','packId','evidenceRefs'],path,errors)) return;
  if(!['UNKNOWN','PLANNED','VERIFIED'].includes(value.status)) issue(errors,'PACK_STATUS',`${path}.status`,'is not supported');
  if(!['CORE','OPTIONAL','EXCLUDED','PLANNED'].includes(value.inclusion)) issue(errors,'PACK_INCLUSION',`${path}.inclusion`,'is not supported');
  if(value.packId!==null&&(typeof value.packId!=='string'||!value.packId.trim())) issue(errors,'PACK_ID',`${path}.packId`,'must be a non-empty string or null');
  const refs=evidenceRefs(value.evidenceRefs,`${path}.evidenceRefs`,errors,root);
  if(value.status==='VERIFIED'&&(!value.packId||!refs.length)) issue(errors,'VERIFIED_PACK_EVIDENCE',path,'verified pack membership requires packId and evidence');
}

function validateFallback(track,path,errors,root){
  const value=track.fallback;
  if(!checkKeys(value,['status','type','trackId','reasons','evidenceRefs'],path,errors)) return;
  if(!['UNKNOWN','PLANNED','VERIFIED'].includes(value.status)) issue(errors,'FALLBACK_STATUS',`${path}.status`,'is not supported');
  if(!['SELF_BED','TRACK','SILENCE','NONE'].includes(value.type)) issue(errors,'FALLBACK_TYPE',`${path}.type`,'is not supported');
  if(value.trackId!==null&&(typeof value.trackId!=='string'||!value.trackId.trim())) issue(errors,'FALLBACK_TRACK_ID',`${path}.trackId`,'must be a non-empty string or null');
  stringArray(value.reasons,`${path}.reasons`,errors,{min:1});
  const refs=evidenceRefs(value.evidenceRefs,`${path}.evidenceRefs`,errors,root);
  if(value.type==='SELF_BED'&&value.trackId!==track.id) issue(errors,'SELF_FALLBACK_TARGET',`${path}.trackId`,'SELF_BED must point to its own track id');
  if(value.type==='TRACK'&&!value.trackId) issue(errors,'FALLBACK_TRACK_ID',`${path}.trackId`,'TRACK fallback requires a track id');
  if(['SILENCE','NONE'].includes(value.type)&&value.trackId!==null) issue(errors,'FALLBACK_TRACK_ID',`${path}.trackId`,`${value.type} fallback cannot name a track`);
  if(value.status==='VERIFIED'&&!refs.length) issue(errors,'VERIFIED_FALLBACK_EVIDENCE',`${path}.evidenceRefs`,'verified fallback requires evidence');
}

function validateLoudnessRecord(track,path,errors){
  const value=track.loudness;
  if(!checkKeys(value,['status','conformance','measuredAt','tool'],path,errors)) return;
  if(!['NOT_MEASURED','MEASURED'].includes(value.status)) issue(errors,'LOUDNESS_STATUS',`${path}.status`,'is not supported');
  if(!['UNKNOWN','CONFORMING','NONCONFORMING'].includes(value.conformance)) issue(errors,'LOUDNESS_CONFORMANCE',`${path}.conformance`,'is not supported');
  if(value.status==='MEASURED'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value.measuredAt||'')) issue(errors,'LOUDNESS_MEASURED_AT',`${path}.measuredAt`,'must be an ISO date for measured audio');
    if(typeof value.tool!=='string'||!value.tool.trim()) issue(errors,'LOUDNESS_TOOL',`${path}.tool`,'must name the measurement tool');
    if(value.conformance==='UNKNOWN') issue(errors,'LOUDNESS_CONFORMANCE',`${path}.conformance`,'measured audio must state conformance');
  } else if(value.measuredAt!==null||value.tool!==null||value.conformance!=='UNKNOWN')
    issue(errors,'UNMEASURED_LOUDNESS_CLAIM',path,'unmeasured audio cannot claim a tool, date, or conformance');
}

function validateCodec(track,key,value,path,errors,options,policy,stats){
  if(!checkKeys(value,['path','format','codec','bytes','sha256','sampleRateHz','channels','durationSeconds','integratedLufs','truePeakDbtp'],path,errors)) return;
  const expected=key==='ogg'?{ext:'.ogg',format:'ogg-vorbis',codec:'vorbis'}:{ext:'.m4a',format:'m4a-aac-lc',codec:'aac'};
  if(typeof value.path!=='string'||!value.path) issue(errors,'CODEC_PATH',`${path}.path`,'must be a repository-relative path');
  else if(extname(value.path).toLowerCase()!==expected.ext) issue(errors,'CODEC_EXTENSION',`${path}.path`,`${key} must use ${expected.ext}`);
  if(value.format!==expected.format) issue(errors,'CODEC_FORMAT',`${path}.format`,`${key} must use ${expected.format}`);
  if(value.codec!==expected.codec) issue(errors,'CODEC_NAME',`${path}.codec`,`${key} must decode as ${expected.codec}`);
  if(!Number.isInteger(value.bytes)||value.bytes<1) issue(errors,'CODEC_BYTES',`${path}.bytes`,'must be a positive integer');
  if(typeof value.sha256!=='string'||!HASH.test(value.sha256)) issue(errors,'CODEC_SHA256',`${path}.sha256`,'must be a lower-case SHA-256');
  if(!Number.isInteger(value.sampleRateHz)||value.sampleRateHz<8000) issue(errors,'CODEC_SAMPLE_RATE',`${path}.sampleRateHz`,'must be a valid sample rate');
  if(!Number.isInteger(value.channels)||value.channels<1) issue(errors,'CODEC_CHANNELS',`${path}.channels`,'must be a positive integer');
  for(const field of ['durationSeconds','integratedLufs','truePeakDbtp']) if(!finite(value[field])) issue(errors,'CODEC_MEASUREMENT',`${path}.${field}`,'must be a finite number');
  if(!options.verifyFiles||typeof value.path!=='string') return;
  const absolute=localPath(options.root,value.path,`${path}.path`,errors);
  if(!absolute||!existsSync(absolute)){ if(absolute) issue(errors,'MEDIA_MISSING',`${path}.path`,`${value.path} does not exist`); return; }
  const size=statSync(absolute).size;
  if(size!==value.bytes) issue(errors,'MEDIA_BYTES_MISMATCH',`${path}.bytes`,`catalog ${value.bytes}, file ${size}`);
  const sha=hashFile(absolute);
  if(sha!==value.sha256) issue(errors,'MEDIA_HASH_MISMATCH',`${path}.sha256`,`catalog ${value.sha256}, file ${sha}`);
  stats.mediaFilesChecked++;
  if(options.probeMedia){
    const actual=probe(absolute);
    if(actual.error) issue(errors,'MEDIA_PROBE_FAILED',path,actual.error);
    else {
      if(actual.codec!==value.codec) issue(errors,'MEDIA_CODEC_MISMATCH',`${path}.codec`,`catalog ${value.codec}, file ${actual.codec}`);
      if(actual.sampleRateHz!==value.sampleRateHz) issue(errors,'MEDIA_SAMPLE_RATE_MISMATCH',`${path}.sampleRateHz`,`catalog ${value.sampleRateHz}, file ${actual.sampleRateHz}`);
      if(actual.channels!==value.channels) issue(errors,'MEDIA_CHANNELS_MISMATCH',`${path}.channels`,`catalog ${value.channels}, file ${actual.channels}`);
      if(!close(actual.durationSeconds,value.durationSeconds,0.01)) issue(errors,'MEDIA_DURATION_MISMATCH',`${path}.durationSeconds`,`catalog ${value.durationSeconds}, file ${actual.durationSeconds}`);
      stats.mediaFilesProbed++;
    }
  }
  if(options.measureMedia){
    const actual=measure(absolute,policy.targetIntegratedLufs,policy.maxTruePeakDbtp);
    if(actual.error) issue(errors,'MEDIA_MEASUREMENT_FAILED',path,actual.error);
    else {
      if(!close(actual.integratedLufs,value.integratedLufs,policy.measurementTolerance)) issue(errors,'MEDIA_LUFS_MISMATCH',`${path}.integratedLufs`,`catalog ${value.integratedLufs}, measured ${actual.integratedLufs}`);
      if(!close(actual.truePeakDbtp,value.truePeakDbtp,policy.measurementTolerance)) issue(errors,'MEDIA_PEAK_MISMATCH',`${path}.truePeakDbtp`,`catalog ${value.truePeakDbtp}, measured ${actual.truePeakDbtp}`);
      stats.mediaFilesMeasured++;
    }
  }
}

function approvalInvariants(track,path,errors,requiredCodecs){
  if(track.status!=='APPROVED') return;
  if(track.instrumental!==true) issue(errors,'APPROVED_NOT_INSTRUMENTAL',`${path}.instrumental`,'approved MASSFRONT score must be instrumental');
  if(track.ownership&&track.ownership.status!=='VERIFIED') issue(errors,'APPROVAL_OWNERSHIP',`${path}.ownership.status`,'APPROVED requires VERIFIED ownership');
  if(track.license&&track.license.status!=='VERIFIED') issue(errors,'APPROVAL_LICENSE',`${path}.license.status`,'APPROVED requires VERIFIED licensing');
  if(track.provenance&&track.provenance.status!=='VERIFIED') issue(errors,'APPROVAL_PROVENANCE',`${path}.provenance.status`,'APPROVED requires VERIFIED provenance');
  if(track.sourceMaster&&track.sourceMaster.status!=='VERIFIED') issue(errors,'APPROVAL_SOURCE_MASTER',`${path}.sourceMaster.status`,'APPROVED requires a VERIFIED source master or recipe');
  for(const codec of requiredCodecs) if(!track.codecs||!track.codecs[codec]) issue(errors,'APPROVAL_CODEC',`${path}.codecs.${codec}`,'APPROVED runtime music requires both codecs');
  if(track.packMembership&&track.packMembership.status!=='VERIFIED') issue(errors,'APPROVAL_PACK',`${path}.packMembership.status`,'APPROVED requires VERIFIED pack membership');
  if(track.fallback&&track.fallback.status!=='VERIFIED') issue(errors,'APPROVAL_FALLBACK',`${path}.fallback.status`,'APPROVED requires a VERIFIED fallback');
  if(track.loudness&&track.loudness.conformance!=='CONFORMING') issue(errors,'APPROVAL_LOUDNESS',`${path}.loudness.conformance`,'APPROVED requires conforming measured loudness');
}

function releaseChecks(catalog,requiredRoles,requiredCodecs,blockers){
  const tracks=Array.isArray(catalog.tracks)?catalog.tracks:[];
  for(const role of requiredRoles){
    const ready=tracks.some(track=>track&&track.status==='APPROVED'&&Array.isArray(track.sceneRoles)&&track.sceneRoles.includes(role));
    if(!ready) issue(blockers,'RELEASE_ROLE_UNAPPROVED',`policy.requiredSceneRoles.${role}`,`no APPROVED track covers ${role}`);
  }
  for(const track of tracks){
    if(!object(track)) continue;
    const path=`tracks.${track.id||'unknown'}`;
    const packed=track.packMembership&&['CORE','OPTIONAL'].includes(track.packMembership.inclusion);
    if(packed&&track.status!=='APPROVED') issue(blockers,'RELEASE_PACKED_TRACK_UNAPPROVED',`${path}.status`,`${track.id} is packed but remains ${track.status}`);
    if(packed&&track.loudness&&track.loudness.conformance!=='CONFORMING') issue(blockers,'RELEASE_LOUDNESS_NONCONFORMING',`${path}.loudness.conformance`,`${track.id} is not loudness-conforming`);
    if(packed) for(const codec of requiredCodecs) if(!track.codecs||!track.codecs[codec])
      issue(blockers,'RELEASE_CODEC_MISSING',`${path}.codecs.${codec}`,`${track.id} lacks ${codec}`);
    if(track.status==='PLANNED'&&(!track.fallback||track.fallback.status!=='VERIFIED'))
      issue(blockers,'RELEASE_FALLBACK_UNVERIFIED',`${path}.fallback`,`${track.id} has no verified fallback`);
  }
}

export function validateCatalogData(catalog,options={}){
  const root=options.root||repoRoot;
  const verifyFiles=options.verifyFiles!==false;
  const probeMedia=verifyFiles&&options.probeMedia!==false;
  const measureMedia=verifyFiles&&options.measureMedia!==false;
  const settings={root,verifyFiles,probeMedia,measureMedia};
  const errors=[],warnings=[],releaseBlockers=[];
  const stats={tracks:0,existingTracks:0,plannedTracks:0,adaptiveBedFiles:0,runtimePlaylistTracks:0,assignmentTracks:0,mediaFilesChecked:0,mediaFilesProbed:0,mediaFilesMeasured:0};
  if(!checkKeys(catalog,TOP_KEYS,'catalog',errors)) return {errors,warnings,releaseBlockers,stats,releaseReady:false};
  if(catalog.schemaVersion!==1) issue(errors,'SCHEMA_VERSION','catalog.schemaVersion','must be 1');
  if(catalog.catalogId!=='massfront-music-library') issue(errors,'CATALOG_ID','catalog.catalogId','must be massfront-music-library');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(catalog.auditedAt||'')) issue(errors,'AUDIT_DATE','catalog.auditedAt','must be an ISO date');
  const inventoryObserved=validateInventory(catalog.inventory,'catalog.inventory',errors,root,verifyFiles,stats);

  let requiredRoles=SCENE_ROLES.slice(),requiredCodecs=RUNTIME_CODECS.slice();
  const fallbackPolicy={targetIntegratedLufs:-16,integratedLufsTolerance:1,maxTruePeakDbtp:-1.5,measurementTolerance:0.15};
  let loudnessPolicy=fallbackPolicy;
  if(checkKeys(catalog.policy,['requiredSceneRoles','requiredRuntimeCodecs','loudness','release'],'catalog.policy',errors)){
    const roles=stringArray(catalog.policy.requiredSceneRoles,'catalog.policy.requiredSceneRoles',errors,{min:SCENE_ROLES.length,allowed:new Set(SCENE_ROLES)});
    const codecs=stringArray(catalog.policy.requiredRuntimeCodecs,'catalog.policy.requiredRuntimeCodecs',errors,{min:RUNTIME_CODECS.length,allowed:new Set(RUNTIME_CODECS)});
    requiredRoles=roles.length?roles:requiredRoles;
    requiredCodecs=codecs.length?codecs:requiredCodecs;
    for(const role of SCENE_ROLES) if(!roles.includes(role)) issue(errors,'POLICY_ROLE_MISSING','catalog.policy.requiredSceneRoles',`${role} is required`);
    for(const codec of RUNTIME_CODECS) if(!codecs.includes(codec)) issue(errors,'POLICY_CODEC_MISSING','catalog.policy.requiredRuntimeCodecs',`${codec} is required`);
    if(checkKeys(catalog.policy.loudness,['targetIntegratedLufs','integratedLufsTolerance','maxTruePeakDbtp','measurementTolerance'],'catalog.policy.loudness',errors)){
      loudnessPolicy=catalog.policy.loudness;
      if(!finite(loudnessPolicy.targetIntegratedLufs)) issue(errors,'LOUDNESS_POLICY','catalog.policy.loudness.targetIntegratedLufs','must be numeric');
      for(const field of ['integratedLufsTolerance','measurementTolerance']) if(!finite(loudnessPolicy[field])||loudnessPolicy[field]<=0)
        issue(errors,'LOUDNESS_POLICY',`catalog.policy.loudness.${field}`,'must be positive');
      if(!finite(loudnessPolicy.maxTruePeakDbtp)) issue(errors,'LOUDNESS_POLICY','catalog.policy.loudness.maxTruePeakDbtp','must be numeric');
    }
    const releaseFields=['requireApprovedRights','requireAllRolesApproved','requireDualCodecCoreBeds','requireLoudnessConformance','requireVerifiedFallback'];
    if(checkKeys(catalog.policy.release,releaseFields,'catalog.policy.release',errors))
      for(const field of releaseFields) if(catalog.policy.release[field]!==true) issue(errors,'FAIL_OPEN_RELEASE_POLICY',`catalog.policy.release.${field}`,'must remain true');
  }

  if(!Array.isArray(catalog.tracks)||!catalog.tracks.length){
    issue(errors,'TRACKS_EMPTY','catalog.tracks','must contain at least one track');
    return {errors,warnings,releaseBlockers,stats,releaseReady:false};
  }

  const ids=new Set(),codecPaths=new Set();
  catalog.tracks.forEach((track,index)=>{
    const base=`catalog.tracks[${index}]`;
    if(!checkKeys(track,TRACK_KEYS,base,errors)) return;
    stats.tracks++;
    if(typeof track.id!=='string'||!ID.test(track.id)) issue(errors,'TRACK_ID',`${base}.id`,'must be a lower-case stable id');
    else if(ids.has(track.id)) issue(errors,'DUPLICATE_TRACK_ID',`${base}.id`,`${track.id} is duplicated`);
    else ids.add(track.id);
    if(typeof track.title!=='string'||!track.title.trim()) issue(errors,'TRACK_TITLE',`${base}.title`,'must be a non-empty string');
    if(!STATUS.has(track.status)) issue(errors,'TRACK_STATUS',`${base}.status`,'must be PLANNED, UNKNOWN, or APPROVED');
    if(typeof track.instrumental!=='boolean') issue(errors,'TRACK_INSTRUMENTAL',`${base}.instrumental`,'must be boolean');
    stringArray(track.sceneRoles,`${base}.sceneRoles`,errors,{min:1,allowed:new Set(SCENE_ROLES)});
    stringArray(track.mood,`${base}.mood`,errors,{min:1});
    stringArray(track.allowedContexts,`${base}.allowedContexts`,errors,{min:1});
    validatePlayback(track,`${base}.playback`,errors);
    validateOwnership(track,`${base}.ownership`,errors,root);
    validateLicense(track,`${base}.license`,errors,root);
    validateProvenance(track,`${base}.provenance`,errors,root);
    validateSourceMaster(track,`${base}.sourceMaster`,errors,root,verifyFiles);
    validatePack(track,`${base}.packMembership`,errors,root);
    validateFallback(track,`${base}.fallback`,errors,root);
    validateLoudnessRecord(track,`${base}.loudness`,errors);

    if(!object(track.codecs)) issue(errors,'CODECS_OBJECT',`${base}.codecs`,'must be an object');
    else {
      for(const key of Object.keys(track.codecs)){
        if(!RUNTIME_CODECS.includes(key)){ issue(errors,'UNSUPPORTED_CODEC_KEY',`${base}.codecs.${key}`,'only ogg and m4a are supported'); continue; }
        const record=track.codecs[key];
        if(record&&typeof record.path==='string'){
          if(codecPaths.has(record.path)) issue(errors,'DUPLICATE_CODEC_PATH',`${base}.codecs.${key}.path`,`${record.path} is used more than once`);
          codecPaths.add(record.path);
        }
        validateCodec(track,key,record,`${base}.codecs.${key}`,errors,settings,loudnessPolicy,stats);
      }
    }

    if(track.status==='PLANNED'){
      stats.plannedTracks++;
      if(object(track.codecs)&&Object.keys(track.codecs).length) issue(errors,'PLANNED_HAS_CODECS',`${base}.codecs`,'PLANNED tracks cannot claim encoded media');
      if(track.sourceMaster&&track.sourceMaster.status!=='MISSING'&&track.sourceMaster.status!=='UNKNOWN') issue(errors,'PLANNED_HAS_MASTER',`${base}.sourceMaster.status`,'PLANNED tracks cannot claim a ready source master');
      if(track.packMembership&&!['PLANNED','EXCLUDED'].includes(track.packMembership.inclusion)) issue(errors,'PLANNED_PACK_CLAIM',`${base}.packMembership.inclusion`,'PLANNED tracks cannot claim runtime inclusion');
      if(track.playback&&track.playback.mode!=='PLANNED') issue(errors,'PLANNED_PLAYBACK_CLAIM',`${base}.playback.mode`,'PLANNED tracks require PLANNED playback metadata');
      issue(warnings,'PLANNED_TRACK',`${base}.status`,`${track.id} has no selected asset`);
    } else {
      stats.existingTracks++;
      for(const codec of requiredCodecs) if(!track.codecs||!track.codecs[codec]) issue(errors,'DUAL_CODEC_MISSING',`${base}.codecs.${codec}`,`${track.id} requires ${codec}`);
      if(track.loudness&&track.loudness.status!=='MEASURED') issue(errors,'EXISTING_TRACK_UNMEASURED',`${base}.loudness.status`,'existing media must be measured');
      if(track.status==='UNKNOWN') issue(warnings,'RIGHTS_UNKNOWN',`${base}.status`,`${track.id} is present but not rights-approved`);
    }

    const codecValues=object(track.codecs)?Object.values(track.codecs).filter(object):[];
    if(codecValues.length){
      const conforming=codecValues.every(codec=>
        finite(codec.integratedLufs)&&Math.abs(codec.integratedLufs-loudnessPolicy.targetIntegratedLufs)<=loudnessPolicy.integratedLufsTolerance&&
        finite(codec.truePeakDbtp)&&codec.truePeakDbtp<=loudnessPolicy.maxTruePeakDbtp);
      const expected=conforming?'CONFORMING':'NONCONFORMING';
      if(track.loudness&&track.loudness.conformance!==expected) issue(errors,'LOUDNESS_CONFORMANCE_MISMATCH',`${base}.loudness.conformance`,`measurements require ${expected}`);
      if(!conforming) issue(warnings,'LOUDNESS_NONCONFORMING',`${base}.loudness.conformance`,`${track.id} is outside the catalog loudness policy`);
      if(codecValues.length>1){
        const first=codecValues[0];
        for(const other of codecValues.slice(1)){
          if(first.sampleRateHz!==other.sampleRateHz||first.channels!==other.channels) issue(errors,'CODEC_PARITY_FORMAT',`${base}.codecs`,'codec siblings must share sample rate and channel count');
          if(!close(first.durationSeconds,other.durationSeconds,0.05)) issue(errors,'CODEC_PARITY_DURATION',`${base}.codecs`,'codec sibling durations differ by more than 50 ms');
        }
      }
      if(track.playback&&track.playback.mode==='LOOP'){
        const shortest=Math.min(...codecValues.map(codec=>codec.durationSeconds));
        if(track.playback.loopEndSeconds>shortest+0.05) issue(errors,'LOOP_END_AFTER_MEDIA',`${base}.playback.loopEndSeconds`,'loop end is beyond the shortest codec');
      }
    }
    approvalInvariants(track,base,errors,requiredCodecs);
  });

  for(const role of requiredRoles){
    if(!catalog.tracks.some(track=>object(track)&&Array.isArray(track.sceneRoles)&&track.sceneRoles.includes(role)))
      issue(errors,'SCENE_ROLE_UNCATALOGED','catalog.tracks',`${role} has neither a current nor a PLANNED catalog entry`);
  }
  for(const path of inventoryObserved.bedPaths) if(!codecPaths.has(path))
    issue(errors,'UNCATALOGED_RUNTIME_BED','catalog.inventory.adaptiveBedGlob',`${path} exists but has no catalog codec record`);
  for(const stem of inventoryObserved.playlistStems){
    if(![...codecPaths].some(path=>path===stem||path.startsWith(`${stem}.`)))
      issue(errors,'UNCATALOGED_PLAYLIST_TRACK','catalog.inventory.runtimePlaylistManifest',`${stem} is referenced but has no catalog codec record`);
  }
  for(let index=0;index<catalog.tracks.length;index++){
    const track=catalog.tracks[index];
    if(object(track)&&track.fallback&&track.fallback.type==='TRACK'&&!ids.has(track.fallback.trackId))
      issue(errors,'FALLBACK_TARGET_MISSING',`catalog.tracks[${index}].fallback.trackId`,`${track.fallback.trackId} is not a catalog track`);
  }
  releaseChecks(catalog,requiredRoles,requiredCodecs,releaseBlockers);
  return {errors,warnings,releaseBlockers,stats,releaseReady:errors.length===0&&releaseBlockers.length===0};
}

export function loadAndValidate(catalogPath=defaultCatalogPath,options={}){
  let catalog;
  try{ catalog=JSON.parse(readFileSync(catalogPath,'utf8')); }
  catch(error){
    return {catalog:null,result:{errors:[{code:'CATALOG_READ_FAILED',path:catalogPath,message:error.message}],warnings:[],releaseBlockers:[],stats:{},releaseReady:false}};
  }
  return {catalog,result:validateCatalogData(catalog,options)};
}

function parseArgs(argv){
  const out={mode:'release',catalogPath:defaultCatalogPath,json:false,verifyFiles:true,probeMedia:true,measureMedia:true};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--mode') out.mode=argv[++i];
    else if(arg==='--catalog') out.catalogPath=resolve(argv[++i]);
    else if(arg==='--json') out.json=true;
    else if(arg==='--skip-media') out.verifyFiles=out.probeMedia=out.measureMedia=false;
    else if(arg==='--skip-loudness') out.measureMedia=false;
    else if(arg==='--help'||arg==='-h') out.help=true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if(!['audit','release'].includes(out.mode)) throw new Error('--mode must be audit or release');
  if(out.mode==='release'&&(!out.verifyFiles||!out.measureMedia)) throw new Error('release mode cannot skip media or loudness verification');
  return out;
}

function printHelp(){
  console.log('Usage: node tools/audio-library/validate-music-catalog.mjs [--mode audit|release] [--catalog path] [--json]');
  console.log('Default mode is release and fails nonzero on UNKNOWN, PLANNED, missing, or nonconforming material.');
  console.log('Audit mode validates catalog truth and media identity; --skip-media/--skip-loudness are audit-only diagnostics.');
}

function textReport(catalogPath,mode,result){
  const status=result.errors.length?'INVALID':result.releaseReady?'RELEASE_READY':mode==='release'?'RELEASE_BLOCKED':'AUDIT_VALID_RELEASE_BLOCKED';
  console.log(`MUSIC_CATALOG_${status}`);
  console.log(`catalog=${catalogPath}`);
  console.log(`tracks=${result.stats.tracks||0} existing=${result.stats.existingTracks||0} planned=${result.stats.plannedTracks||0}`);
  console.log(`adaptiveBedFiles=${result.stats.adaptiveBedFiles||0} playlistTracks=${result.stats.runtimePlaylistTracks||0} assignmentTracks=${result.stats.assignmentTracks||0}`);
  console.log(`mediaChecked=${result.stats.mediaFilesChecked||0} probed=${result.stats.mediaFilesProbed||0} measured=${result.stats.mediaFilesMeasured||0}`);
  console.log(`errors=${result.errors.length} warnings=${result.warnings.length} releaseBlockers=${result.releaseBlockers.length}`);
  for(const entry of result.errors) console.error(`ERROR ${entry.code} ${entry.path}: ${entry.message}`);
  for(const entry of result.warnings) console.log(`WARN ${entry.code} ${entry.path}: ${entry.message}`);
  for(const entry of result.releaseBlockers) console.log(`BLOCK ${entry.code} ${entry.path}: ${entry.message}`);
}

async function main(){
  let args;
  try{ args=parseArgs(process.argv.slice(2)); }
  catch(error){ console.error(`MUSIC_CATALOG_USAGE_ERROR: ${error.message}`); process.exitCode=2; return; }
  if(args.help){ printHelp(); return; }
  const {result}=loadAndValidate(args.catalogPath,{root:repoRoot,verifyFiles:args.verifyFiles,probeMedia:args.probeMedia,measureMedia:args.measureMedia});
  if(args.json) console.log(JSON.stringify({catalogPath:args.catalogPath,mode:args.mode,...result},null,2));
  else textReport(args.catalogPath,args.mode,result);
  const blocked=args.mode==='release'&&result.releaseBlockers.length;
  if(result.errors.length||blocked) process.exitCode=1;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href) await main();
