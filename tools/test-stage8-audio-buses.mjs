/* Deterministic Stage 8 audio-mixer contract.
   Reads the shipping source, evaluates the real level helpers, and proves that
   effects, ambience, music, and voice remain independently controllable.
   Usage: node tools/test-stage8-audio-buses.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
const audio=read('src/audio.js'),meta=read('src/game/meta.js');
const tutorial=read('src/tutorial.js'),hudflow=read('src/ui/hudflow.js');
const commander=read('src/game/commander.js');

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

const calls={sfx:[],amb:[],voice:[]};
const bus=key=>({gain:{setTargetAtTime(value,time,ramp){calls[key].push({value,time,ramp});}}});
const context={
  META:{settings:{sfxVol:0,ambVol:1,musicVol:2,voiceVol:3}},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),AC:{currentTime:12},
  audSfxBus:bus('sfx'),audAmbBus:bus('amb'),audVoiceBus:bus('voice'),
};
vm.createContext(context);
for(const name of ['audLevelSetting','audSfxLevel','audAmbienceLevel','audMusicLevel',
  'audVoiceLevel','audIsVoiceSlot','audApplyLevels']){
  vm.runInContext(functionSource(audio,name),context);
}
vm.runInContext('audApplyLevels()',context);

assert.equal(context.audSfxLevel(),0.25,'effects level must read its own setting');
assert.equal(context.audAmbienceLevel(),0.50,'ambience level must read its own setting');
assert.equal(context.audMusicLevel(),0.75,'music level must read its own setting');
assert.equal(context.audVoiceLevel(),1.0,'voice level must read its own setting');
assert.equal(calls.sfx[0].value,0.25,'effects bus received the wrong gain');
assert.equal(calls.amb[0].value,0.50,'ambience bus received the wrong gain');
assert.equal(calls.voice[0].value,1.0,'voice bus received the wrong gain');
assert(calls.sfx[0].time===12&&calls.amb[0].time===12&&calls.voice[0].time===12,
  'bus gain changes must share the live AudioContext clock');

for(const name of ['vo_nova_move','vo_keen_greeting','vo_cmdr_kai_mission_victory'])
  assert.equal(context.audIsVoiceSlot(name),true,name+' must use the voice bus');
for(const name of ['radio','boom','amb_low0','mus_ambient'])
  assert.equal(context.audIsVoiceSlot(name),false,name+' must not use the voice bus');

assert(meta.includes('sfxVol:3,ambVol:3,musicVol:2,voiceVol:3'),
  'new careers must preserve the old effective levels while adding both buses');
for(const key of ['sfxVol','ambVol','musicVol','voiceVol']){
  assert(meta.includes("data-set=\"'+key+'\"")||meta.includes("cyc('"+key+"'"),
    'settings UI is missing '+key);
}
assert(/k==='sfxVol'\|\|k==='ambVol'\|\|k==='musicVol'\|\|k==='voiceVol'/.test(meta),
  'settings taps must cycle all four volume controls');
assert(/node\.connect\(audIsVoiceSlot\(name\)\?audVoiceBus:audSfxBus\)/.test(audio),
  'sample playback does not route vo_* slots to the voice bus');
assert(/AMB\.filter\.connect\(audAmbBus\s*\|\|\s*audSfxBus/.test(audio),
  'battlefield ambience is not routed to its own bus');
assert(tutorial.includes("u.volume=0.85*(typeof audVoiceLevel==='function'?audVoiceLevel():1);"),
  'OS speech fallback must follow the voice level');
assert(!commander.includes('voiceVol'),
  'subtitle production must not be gated by the voice-volume setting');
assert(commander.indexOf("if(typeof commanderVoiceSpeak==='function')")
  <commander.indexOf('for(const fn of S.listeners.slice())'),
  'commander subtitles must still emit after optional or silent playback');
assert(hudflow.includes('Effects, ambience, music, and voice are independent.'),
  'the Audio Mix description does not match the four real buses');

console.log('PASS Stage 8 audio mixer contracts (4 dynamic levels + routing, persistence, subtitle independence)');
