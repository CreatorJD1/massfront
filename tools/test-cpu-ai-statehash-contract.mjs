import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const current=fs.readFileSync(new URL('../src/game/statehash.js',import.meta.url),'utf8');
const baseline=execFileSync('git',['show','HEAD:src/game/statehash.js'],{encoding:'utf8'});

function namesFrom(source,marker){
  const start=source.indexOf(marker),end=source.indexOf('];',start),out=[];
  for(const m of source.slice(start,end).matchAll(/\['[^']+',(?:typeof )?([A-Za-z_$][\w$]*)/g))out.push(m[1]);
  return out;
}
function makeContext(source,unitHigh=2500,pHigh=600){
  const c={TextEncoder,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,
    Float32Array,Float64Array,ArrayBuffer,DataView,Map,WeakMap,Object,Number,String,Math,
    console,window:{},tick:900,unitHigh,pHigh,freeList:[9,12],pFree:[3,7],
    blds:[],resM:[1234,5678],resE:[9000,8000],mSpendAcc:2,eSpendAcc:3,spendT:1,
    stats:{t:300,kills:42},researched:{armor:true},researchCarry:{},researching:null,
    patrolRoutes:[],moveCohorts:[],AI:{t:300,wave:4,bases:[]},mfAirSeed:17,mfAirAiAcc:.25,
    mfDeterminismSnapshot:()=>({seed:77}),HAZ:{active:[]},deposits:[],geysers:[],crates:[],
    relics:[],tanks:[],wrecks:[],carrier:{active:false},deformQ:[],PASS:new Uint8Array(384*384),
    matchLive:true,matchSetupArmed:true,crypto:globalThis.crypto};
  c.window.window=c.window;
  for(let i=0;i<180;i++)c.blds.push({type:i%4?'pgen':'fac',team:i&1,fac:'nova',x:i*7,y:i*3,
    hp:1000,hpm:1000,r:24,alive:true,prog:1,cool:0,queue:i%4?[0,1]:[],repeat:false,tier:1,lvl:1});
  const names=new Set([...namesFrom(source,'const ua=['),...namesFrom(source,'const opt=['),...namesFrom(source,'const pa=[')]);
  for(const n of names)if(!(n in c))c[n]=new Float64Array(Math.max(unitHigh,pHigh));
  c.ualive=new Uint8Array(unitHigh);c.ugen=new Uint32Array(unitHigh);c.palive=new Uint8Array(pHigh);
  for(let i=0;i<unitHigh;i++){c.ualive[i]=(i%5)!==0;c.ugen[i]=(i*13)&65535;}
  for(let i=0;i<pHigh;i++)c.palive[i]=(i%3)!==0;
  for(const n of names){const a=c[n];if(!ArrayBuffer.isView(a))continue;for(let i=0;i<a.length;i++)a[i]=(i*17+n.length)%997;}
  c.ualive.set(Array.from({length:unitHigh},(_,i)=>(i%5)!==0));
  c.palive.set(Array.from({length:pHigh},(_,i)=>(i%3)!==0));
  c.uQueue=Array.from({length:unitHigh},(_,i)=>i%23===0?[0,1]:null);
  c.pSrcBld=Array.from({length:pHigh},(_,i)=>i%17===0?c.blds[i%c.blds.length]:null);
  return vm.createContext(c);
}
function loadSnapshot(source){
  const context=makeContext(source);
  vm.runInContext(source+'\n;globalThis.__mfSnapshot=MF_SH_snapshot;',context,{filename:'statehash.js'});
  return ()=>context.__mfSnapshot();
}
function medianMs(fn,runs=5){
  const samples=[];for(let i=0;i<runs;i++){const t=process.hrtime.bigint();fn();samples.push(Number(process.hrtime.bigint()-t)/1e6);}
  samples.sort((a,b)=>a-b);return samples[samples.length>>1];
}

const oldSnapshot=loadSnapshot(baseline),newSnapshot=loadSnapshot(current);
const oldBytes=oldSnapshot(),newBytes=newSnapshot();
assert.equal(Buffer.compare(oldBytes,newBytes),0,'optimized writer changed canonical bytes');
assert.equal(crypto.createHash('sha256').update(oldBytes).digest('hex'),crypto.createHash('sha256').update(newBytes).digest('hex'));
const oldMs=medianMs(oldSnapshot),newMs=medianMs(newSnapshot);
console.log(JSON.stringify({status:'PASS',bytes:newBytes.length,baselineMedianMs:+oldMs.toFixed(2),currentMedianMs:+newMs.toFixed(2),speedup:+(oldMs/newMs).toFixed(2)}));
