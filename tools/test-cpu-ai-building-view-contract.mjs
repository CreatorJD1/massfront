import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/game/ai.js',import.meta.url),'utf8');
function fn(name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'missing '+name);
  const open=source.indexOf('{',start);let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

let seed=0x5eeda11;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const types=['fac','mex','pgen','turret','bastion','seafort','aatower','airfield','harbor'];
const buildings=Array.from({length:480},(_,i)=>({alive:i%19!==0,team:i%3===0?1:0,prog:i%11?1:.5,
  type:types[i%types.length],x:rnd()*3200,y:rnd()*3200,aiBaseSlot:i%4}));
const bases=Array.from({length:4},(_,slot)=>({slot,x:300+slot*700,y:400+slot*500}));
let scans=0;
const observed={length:buildings.length,find:buildings.find.bind(buildings),
  [Symbol.iterator]:function*(){for(const b of buildings){scans++;yield b;}}};
const context=vm.createContext({AI:{t:25,bases,basesLength:4,base:bases[0]},bldLive:observed,heroIdx:-1,
  MAP:3200,SP_LO:.25,SP_HI:.75,ux:[],uy:[],dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2});
vm.runInContext(`let aiBldViewT=NaN,aiBldViewSrc=null,aiBldViewN=-1,aiBldView=null;
${fn('aiBuildingView')}
${fn('aiInvalidateBuildingView')}
${fn('defenseAt')}
${fn('aiPickTarget')}
globalThis.out={aiBuildingView,aiInvalidateBuildingView,defenseAt,aiPickTarget};`,context);

function oldDefenseAt(x,y,team){
  let d=0;for(const B of buildings){
    if(!B.alive||B.team!==team||B.prog<1)continue;
    if(B.type==='turret'&&(x-B.x)**2+(y-B.y)**2<260**2)d++;
    else if((B.type==='bastion'||B.type==='seafort')&&(x-B.x)**2+(y-B.y)**2<520**2)d+=2;
    else if(B.type==='aatower'&&(x-B.x)**2+(y-B.y)**2<260**2)d+=.5;
  }return d;
}
function oldPickTarget(base){
  let best=null,bs=1e18;const cands=[];
  for(const B of buildings){
    if(!B.alive||B.team!==0||B.prog<1)continue;
    const worth=B.type==='fac'||B.type==='airfield'?3:B.type==='mex'?1.8:B.type==='pgen'?1:1.2;
    cands.push([B.x,B.y,worth]);
  }
  for(const c of cands){const dist=Math.hypot(c[0]-base.x,c[1]-base.y),score=(oldDefenseAt(c[0],c[1],0)*420+dist*.25)/c[2];if(score<bs){bs=score;best=c;}}
  return [best[0],best[1]];
}

for(let i=0;i<40;i++){
  const x=rnd()*3200,y=rnd()*3200;
  assert.equal(context.out.defenseAt(x,y,0),oldDefenseAt(x,y,0));
}
for(const base of bases)assert.deepEqual(Array.from(context.out.aiPickTarget(base)),oldPickTarget(base));
const firstPass=scans;context.out.aiPickTarget(bases[0]);assert.equal(scans,firstPass,'same-tick view rescanned bldLive');
assert.equal(firstPass,buildings.length,'building view should make one canonical pass');
assert.ok(!/for\s*\([^)]*unitHigh/.test(source),'AI reintroduced a direct high-water unit loop');
const completePlayers=buildings.filter(b=>b.alive&&b.team===0&&b.prog>=1).length;
const defenses=buildings.filter(b=>b.alive&&b.team===0&&b.prog>=1&&['turret','bastion','seafort','aatower'].includes(b.type)).length;
const legacyTargetVisits=buildings.length+completePlayers*buildings.length;
const cachedTargetVisits=buildings.length+completePlayers*defenses;
console.log(JSON.stringify({status:'PASS',buildings:buildings.length,completePlayers,defenses,
  legacyTargetVisits,cachedTargetVisits,reduction:+(legacyTargetVisits/cachedTargetVisits).toFixed(2)}));
