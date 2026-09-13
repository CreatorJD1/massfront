import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(ROOT,path),'utf8');

function extractFunction(text,name){
  const start=text.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing production function '+name);
  const open=text.indexOf('{',start);
  let depth=0,quote='',escape=false,line=false,block=false;
  for(let i=open;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return text.slice(start,i+1);
  }
  assert.fail('unterminated production function '+name);
}

const main=read('src/main.js'),events=[];
const context={
  mfLauncherShouldDeferAttract:()=>false,trainingMissionActive:()=>false,
  terrVerts:{},menuBg:()=> 'on',document:{body:{classList:{add(){}}}},
  resetWorld:()=>events.push('resetWorld'),applyTheme:()=>events.push('applyTheme'),
  materialV2SetupAttract:()=>{events.push('materialV2SetupAttract');return true;},
  mmDirty:true,attractOn:true,stopAttract:()=>events.push('stopAttract')
};
vm.createContext(context);
vm.runInContext(extractFunction(main,'setupAttract')+'\nthis.setupAttract=setupAttract;',context,{filename:'src/main.js'});

context.setupAttract();
assert.deepEqual(events,['resetWorld','applyTheme','materialV2SetupAttract'],
  'dirty attract clears entities, rebuilds terrain, then delegates the material preview');
events.length=0;context.mmDirty=false;
context.setupAttract();
assert.deepEqual(events,['resetWorld','materialV2SetupAttract'],
  'clean attract resets entities without rebuilding terrain');

const names=[
  'brood-infested-soil-albedo-v1.webp',
  'brood-infested-soil-normal-rough-v1.webp'
];
const bundle=read('tools/bundle-update.mjs');
const otaBlock=(bundle.match(/const otaBinaryAssets=\[([\s\S]*?)\]\.map\(/)||[])[1];
assert.ok(otaBlock,'OTA binary asset array remains source-readable');
const otaPaths=[...otaBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]);
for(const name of names){
  const path='assets/terrain/locations/'+name;
  assert.equal(otaPaths.filter(v=>v===path).length,1,path+' is delivered exactly once by OTA');
}

const pack=read('tools/pack-www.mjs');
const locationBlock=(pack.match(/for\(const name of \[([\s\S]*?'arctic-windpack-albedo-v1\.webp'[\s\S]*?)\]\) check\('assets\/terrain\/locations\/'/)||[])[1];
assert.ok(locationBlock,'pack-www atomic location check remains source-readable');
const checked=[...locationBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]);
for(const name of names)
  assert.equal(checked.filter(v=>v===name).length,1,name+' is an explicit packaged-art invariant');

console.log('brood delivery/reset contract: PASS');
