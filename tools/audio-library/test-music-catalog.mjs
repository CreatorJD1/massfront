#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {repoRoot,validateCatalogData} from './validate-music-catalog.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const fixturePath=resolve(here,'fixtures','cases.json');
const schemaPath=resolve(here,'music-catalog.schema.json');

function readJson(path){ return JSON.parse(readFileSync(path,'utf8')); }
function clone(value){ return structuredClone(value); }
function find(catalog,id){
  const track=catalog.tracks.find(item=>item.id===id);
  if(!track) throw new Error(`fixture could not find ${id}`);
  return track;
}

const mutations={
  'duplicate-track-id'(catalog){ catalog.tracks[1].id=catalog.tracks[0].id; },
  'unsupported-scene-role'(catalog){ find(catalog,'mus_ambient').sceneRoles.push('cinematic'); },
  'missing-scene-role-coverage'(catalog){ catalog.tracks=catalog.tracks.filter(track=>track.id!=='planned_defeat_cue'); },
  'approval-without-rights'(catalog){ find(catalog,'mus_combat').status='APPROVED'; },
  'verified-license-without-evidence'(catalog){
    const license=find(catalog,'mus_combat').license;
    license.status='VERIFIED';
    license.name='Fixture contract';
    license.version='1';
    for(const key of Object.keys(license.permissions)) license.permissions[key]=true;
    license.attribution={required:false,text:null};
    license.contentId='CLEAR';
    license.evidenceRefs=[];
  },
  'planned-track-claims-codec'(catalog){
    find(catalog,'planned_exploration_score').codecs.ogg=clone(find(catalog,'mus_combat').codecs.ogg);
  },
  'missing-dual-codec'(catalog){ delete find(catalog,'mus_combat').codecs.ogg; },
  'malformed-codec-hash'(catalog){ find(catalog,'mus_combat').codecs.ogg.sha256='z'.repeat(64); },
  'on-disk-media-hash-drift'(catalog){ find(catalog,'mus_combat').codecs.ogg.sha256='0'.repeat(64); },
  'on-disk-source-hash-drift'(catalog){ find(catalog,'mus_combat').sourceMaster.sha256='0'.repeat(64); },
  'loudness-label-drift'(catalog){ find(catalog,'mus_combat').loudness.conformance='NONCONFORMING'; },
  'codec-duration-parity-drift'(catalog){ find(catalog,'mus_combat').codecs.m4a.durationSeconds+=1; },
  'broken-fallback-target'(catalog){
    const fallback=find(catalog,'planned_victory_cue').fallback;
    fallback.type='TRACK'; fallback.trackId='missing_track';
  },
  'fail-open-release-policy'(catalog){ catalog.policy.release.requireApprovedRights=false; },
  'planned-playback-claim'(catalog){
    const playback=find(catalog,'planned_exploration_score').playback;
    Object.assign(playback,{mode:'LOOP',loop:true,introSeconds:0,outroSeconds:0,loopStartSeconds:0,loopEndSeconds:30,authoredLoopCrossfadeMs:0,transitionCrossfadeMs:1000});
  }
};

function expect(condition,message){ if(!condition) throw new Error(message); }

function main(){
  const fixture=readJson(fixturePath);
  const schema=readJson(schemaPath);
  const catalogPath=resolve(repoRoot,fixture.baseline);
  const baseline=readJson(catalogPath);
  let passed=0;

  expect(schema.$id==='https://massfront.local/schemas/music-catalog-v1.json','schema id drifted');
  expect(baseline.$schema==='../../tools/audio-library/music-catalog.schema.json','catalog schema reference drifted');
  console.log('PASS schema-and-catalog-link'); passed++;

  const clean=validateCatalogData(clone(baseline),{root:repoRoot,verifyFiles:false});
  expect(clean.errors.length===0,`clean audit fixture produced ${clean.errors.length} error(s)`);
  expect(clean.releaseReady===false,'current UNKNOWN/PLANNED catalog unexpectedly became release-ready');
  expect(clean.releaseBlockers.length>0,'current catalog did not produce release blockers');
  console.log(`PASS clean-audit-integrity blockers=${clean.releaseBlockers.length}`); passed++;

  const media=validateCatalogData(clone(baseline),{root:repoRoot,verifyFiles:true,probeMedia:true,measureMedia:false});
  expect(media.errors.length===0,`clean media fixture produced ${media.errors.map(error=>error.code).join(',')}`);
  expect(media.stats.mediaFilesChecked===6,'expected six hashed codec files');
  expect(media.stats.mediaFilesProbed===6,'expected six probed codec files');
  console.log('PASS clean-media-identity files=6 dualCodecBeds=3'); passed++;

  for(const test of fixture.cases){
    const mutate=mutations[test.mutation];
    expect(typeof mutate==='function',`unknown mutation ${test.mutation}`);
    const catalog=clone(baseline);
    mutate(catalog);
    const result=validateCatalogData(catalog,{
      root:repoRoot,
      verifyFiles:test.verifyFiles===true,
      probeMedia:false,
      measureMedia:false
    });
    const codes=new Set(result.errors.map(error=>error.code));
    const missing=test.expectedErrors.filter(code=>!codes.has(code));
    expect(missing.length===0,`${test.name} failed to emit ${missing.join(', ')}; got ${[...codes].join(', ')}`);
    console.log(`PASS ${test.name} expected=${test.expectedErrors.join(',')}`); passed++;
  }

  console.log(`AUDIO_LIBRARY_SELF_TEST=PASS checks=${passed}`);
}

try{ main(); }
catch(error){
  console.error(`AUDIO_LIBRARY_SELF_TEST=FAIL ${error.message}`);
  process.exitCode=1;
}
