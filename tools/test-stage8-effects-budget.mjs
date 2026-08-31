/* Deterministic Stage 8 graphics-budget contract.
   Reads the shipping source and evaluates its real preset function without
   opening a browser or changing a profile.
   Usage: node tools/test-stage8-effects-budget.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
const meta=read('src/game/meta.js'),main=read('src/main.js');

function between(src,start,end){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'missing source block: '+start+' -> '+end);
  return src.slice(a,b);
}
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

const presetSource=between(meta,'const GFX_PRESETS={','const GFX_OVER_KEYS=');
const qualitySource=functionSource(meta,'qualityKey');
const overSource=functionSource(meta,'gfxOverBag');
const applySource=functionSource(meta,'applyQualityPreset');

function apply(quality,perf){
  const context={META:{settings:{quality,perf,gfxOver:{}}},GFX:{},perfFloor:0};
  vm.createContext(context);
  vm.runInContext('const GFX_PRESETS={'+presetSource.slice('const GFX_PRESETS={'.length)
    +'const GFX_OVER_KEYS=[];\n'
    +qualitySource+'\n'+overSource+'\n'+applySource+'\napplyQualityPreset();'
    +'\nglobalThis.result={GFX,perfFloor};',context);
  return JSON.parse(JSON.stringify(context.result));
}
function liveScale(preset,perf,band=1){
  const {GFX,perfFloor}=apply(preset,perf);
  let scale=band;
  if(perf==='low')scale=Math.min(scale,0.45);
  if(perfFloor>0)scale=Math.max(scale,perfFloor);
  return scale*GFX.particles;
}

assert.equal(liveScale('low','auto'),0.5,
  'LOW quality on AUTO must pay its preset cost once, not stack the Effects Budget');
assert.equal(liveScale('low','low'),0.225,
  'an explicit LOW Effects Budget must remain a second player-selected cap');
assert.equal(liveScale('high','low'),0.45,
  'HIGH preset floor must not erase the LOW Effects Budget');
assert.equal(liveScale('cinematic','low'),0.675,
  'CINEMATIC must retain its particle density without overruling the explicit cap');
assert.equal(apply('cinematic','auto').perfFloor,0.75,
  'CINEMATIC AUTO must retain its authored automatic-scaler floor');

assert(meta.includes("META.settings.perf='auto';"),
  'quality cycling must leave the independent Effects Budget on AUTO');
assert(!meta.includes("META.settings.perf=(nq==='low')?'low':'auto';"),
  'LOW quality still forces the double-penalty Effects Budget');
assert(meta.includes('const dprIgnored=')&&meta.includes('&&!dprIgnored)'),
  'Resolution Scale must disclose and visually reject an ignored live DPR cap');

const perfBlock=between(main,"if(META.settings.perf==='low')",'if(running&&!paused)');
assert(perfBlock.indexOf('perfFloor')<perfBlock.indexOf('GFX.particles'),
  'the preset floor must be resolved before applying particle density');

console.log('PASS Stage 8 effects-budget contracts (5 dynamic scenarios + source ordering)');
