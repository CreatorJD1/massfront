#!/usr/bin/env node
/* Deterministic Stage 8 result-music contract.
   Proves explicit terminal scenes, honest cataloged fallbacks, cross-scene
   no-repeat, and the Settings > Audio status surface without requiring an
   unlocked audio device. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
const audio=read('src/audio.js'),meta=read('src/game/meta.js'),css=read('src/styles/ui.css');
const manifest=JSON.parse(read('assets/audio/music.json'));
const catalog=JSON.parse(read('source-media/audio-library/music-catalog.json'));

function functionSource(src,name){
  const start=src.indexOf('function '+name+'(');
  assert(start>=0,'missing function '+name);
  const brace=src.indexOf('{',start);let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&src[i+1]==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&src[i+1]==='/'){line=true;i++;continue;}
    if(c==='/'&&src[i+1]==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return src.slice(start,i+1);
  }
  assert.fail('unterminated function '+name);
}

assert.deepEqual(manifest.playlists.victory,[],'victory playlist must be explicit and empty until an owned master exists');
assert.deepEqual(manifest.playlists.defeat,[],'defeat playlist must be explicit and empty until an owned master exists');

const byId=id=>catalog.tracks.find(track=>track.id===id);
const victory=byId('planned_victory_cue'),defeat=byId('planned_defeat_cue');
assert.equal(victory.status,'PLANNED','missing victory master must stay PLANNED');
assert.equal(defeat.status,'PLANNED','missing defeat master must stay PLANNED');
assert.deepEqual({status:victory.fallback.status,type:victory.fallback.type,id:victory.fallback.trackId},
  {status:'VERIFIED',type:'TRACK',id:'mus_ambient'},'victory fallback drifted');
assert.deepEqual({status:defeat.fallback.status,type:defeat.fallback.type,id:defeat.fallback.trackId},
  {status:'VERIFIED',type:'TRACK',id:'mus_tension'},'defeat fallback drifted');

const routing={
  PLAY:{scene:'menu',lists:{menu:[{file:'menu'}],victory:[{file:'win'}],defeat:[{file:'loss'}]}},
  document:{body:{classList:{contains:()=>true}}},
  audPlayableTracks:name=>routing.PLAY.lists[name]||[],audSceneFilter:()=> 'explore',
  playerFaction:'nova',META:{setup:{pf:'nova'}},AI:{fac:null},facArt:()=>null
};
vm.createContext(routing);
for(const name of ['audPlaylistFor','audMusicSceneLabel','audMusicFallbackForScene'])
  vm.runInContext(functionSource(audio,name),routing);
routing.PLAY.scene='result-victory';
assert.equal(routing.audPlaylistFor(),'victory','victory scene did not select the victory list');
routing.PLAY.scene='result-defeat';
assert.equal(routing.audPlaylistFor(),'defeat','defeat scene did not select the defeat list');
assert.equal(routing.audMusicFallbackForScene('result-victory'),'mus_ambient');
assert.equal(routing.audMusicFallbackForScene('result-defeat'),'mus_tension');
assert.equal(routing.audMusicSceneLabel('result-victory'),'MISSION VICTORY');
assert.equal(routing.audMusicSceneLabel('result-defeat'),'MISSION DEFEAT');

const calls={reset:0,stop:0,amb:0,world:0,halt:0,playlist:0,bed:0,render:0};
const terminal={
  PLAY:{lockedScene:false,expectMatch:true,wasLive:true,scene:'action',lists:null},
  AC:{},musicOn:true,muted:false,audMusSwap:8,
  audMusicResetCombat:()=>calls.reset++,audStopMusicBeds:()=>calls.stop++,ambStop:()=>calls.amb++,
  audWorldClear:()=>calls.world++,audHaltPlaylist:()=>calls.halt++,audPlaylistTick:()=>{calls.playlist++;return false;},
  audMusicTick:()=>calls.bed++,audRenderNowPlaying:()=>calls.render++
};
vm.createContext(terminal);
vm.runInContext(functionSource(audio,'audMusicEnterResult'),terminal);
terminal.audMusicEnterResult(true);
assert.equal(terminal.PLAY.scene,'result-victory');
assert.equal(terminal.PLAY.lockedScene,true,'result must remain locked while endGame still reports running');
assert.equal(terminal.audMusSwap,0,'terminal result must bypass the combat anti-thrash hold');
assert.deepEqual({...calls},{reset:1,stop:1,amb:1,world:1,halt:1,playlist:0,bed:1,render:1});
terminal.audMusicEnterResult(false);
assert.equal(terminal.PLAY.scene,'result-defeat');

assert(/audMusicEnterResult\(!!win\)/.test(audio),'endGame takeover does not route the terminal result');
assert(functionSource(audio,'audMusicEnterMatch').includes('audMusSwap=0')&&
       functionSource(audio,'audMusicEnterScreen').includes('audMusSwap=0'),
  'explicit navigation must bypass the live-combat anti-thrash hold');
assert(/list\.length\s*>\s*1\s*&&\s*list\[n\]\.file===PLAY\.lastTrack/.test(audio),
  'playlist no-repeat comparison is missing');
assert.equal((audio.match(/PLAY\.lastTrack\s*=\s*''/g)||[]).length,0,
  'scene transitions must not erase the previous streamed track');

for(const id of ['audNowPlaying','audNowScene','audNowTitle','audNowSource','audNowPack'])
  assert(meta.includes('id="'+id+'"'),'Settings > Audio is missing '+id);
assert(meta.includes("if(typeof audRenderNowPlaying==='function') audRenderNowPlaying();"),
  'Settings does not hydrate live music metadata');
assert(css.includes('.audNowPlaying[data-scene="result-victory"]')&&
       css.includes('.audNowPlaying[data-scene="result-defeat"]'),
  'result status styles are missing');
for(const title of ['Generated Ambient Adaptive Bed','Generated Tension Adaptive Bed','Generated Combat Adaptive Bed'])
  assert(audio.includes(title),'runtime metadata is missing catalog title '+title);

console.log('PASS Stage 8 music states (victory/defeat routing, verified fallbacks, no-repeat, Now Playing metadata)');
