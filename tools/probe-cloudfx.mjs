#!/usr/bin/env node
/* Pure contract probe for src/engine/cloudfx.js. No browser or GPU required:
   the module is renderer-neutral and must not touch wall-clock/browser state. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=await readFile(resolve(root,'src/engine/cloudfx.js'),'utf8');
const context=vm.createContext({console,Math,Number,String,Object,Array,Error,JSON,window:{}});
vm.runInContext(source,context,{filename:'src/engine/cloudfx.js'});
const C=context.window.MFCloudFx;
if(!C) throw new Error('MFCloudFx namespace missing');

let failures=0;
function check(name,ok,detail){
  console.log((ok?'PASS ':'FAIL ')+name+(detail?'  ['+detail+']':''));
  if(!ok) failures++;
}
function input(quality,time=42,extra={}){
  return Object.assign({time,quality,perfScale:1,mapSize:3200,mapId:'probe-map',seed:9127,
    daylight:1,ground:(x,y)=>Math.sin(x*0.001)*2+Math.cos(y*0.001)*2},extra);
}

const expected={low:1,medium:4,high:8,cinematic:15};
for(const q of Object.keys(expected)){
  C.reset();
  const layers=C.sample(input(q));
  const p=C.probe();
  check(q+' exact layer ceiling',layers.length===expected[q]&&p.maxFrameLayers===expected[q]&&p.bounded,
    layers.length+'/'+p.maxLayers+' hash='+p.lastHash);
  check(q+' descriptors finite and visible',layers.every(L=>Number.isFinite(L.x)&&Number.isFinite(L.y)&&
    Number.isFinite(L.z)&&L.size>0&&L.a>=4&&L.a<=255&&(L.kind==='shadow'||L.kind==='body')),
    'layers='+layers.length);
}

C.reset();
const a=C.sample(input('cinematic',99));
const hashA=C.probe().lastHash;
const b=C.sample(input('cinematic',99,{paused:true}));
const paused=C.probe();
check('paused frame is position-stable',hashA===paused.lastHash&&JSON.stringify(a)===JSON.stringify(b),
  hashA+' === '+paused.lastHash+', sameTime='+paused.sameTimeFrames);
check('paused recipe is stateless and bounded',paused.pausedFrames===1&&paused.maxFrameLayers===15,
  'paused='+paused.pausedFrames+' max='+paused.maxFrameLayers);

const c=C.sample(input('cinematic',100));
check('simulation time advances cloud positions',JSON.stringify(b)!==JSON.stringify(c),
  '99s hash='+hashA+' 100s hash='+C.probe().lastHash);

C.reset();
const target=C.sample(input('high',25,{perfScale:0.4125}));
const targetProbe=C.probe();
check('target-device pressure cap keeps two systems',target.length===4&&targetProbe.lastClouds===2,
  targetProbe.lastClouds+' clouds / '+target.length+' layers');

C.reset();
const culled=C.sample(input('high',25,{visible:()=>false}));
const cullProbe=C.probe();
check('camera culling emits nothing without changing the bounded recipe',
  culled.length===0&&cullProbe.culledLayers===8&&cullProbe.maxFrameLayers===8,
  'emitted='+culled.length+' culled='+cullProbe.culledLayers);

C.reset();
const invalid=C.emit({time:NaN,quality:'high'},()=>{});
const invalidProbe=C.probe();
check('invalid time never falls back to wall clock',invalid===0&&invalidProbe.invalidTime===1,
  'emitted='+invalid+' invalid='+invalidProbe.invalidTime);

C.reset();
const suppressed=C.emit(input('high',5,{paused:true,suppressWhenPaused:true}),()=>{});
check('optional paused suppression emits no layers',suppressed===0&&C.probe().suppressedPaused===1,
  'emitted='+suppressed);

if(failures){
  console.error('\n'+failures+' cloud contract check(s) failed');
  process.exitCode=1;
}else console.log('\nALL CLOUD CONTRACT CHECKS PASSED');
