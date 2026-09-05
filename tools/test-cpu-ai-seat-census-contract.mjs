import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/game/ai.js',import.meta.url),'utf8');
function fn(name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'missing '+name);
  const open=source.indexOf('{',start);let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
  }throw new Error('unterminated '+name);
}

const bases=[{slot:0,x:0,y:0},{slot:1,x:1000,y:0},{slot:2,x:0,y:1000},{slot:3,x:1000,y:1000}];
const slots=2500,uActive=[],ualive=new Uint8Array(slots),uteam=new Uint8Array(slots),utype=new Uint8Array(slots),
  uCmd=new Int16Array(slots),ux=new Float64Array(slots),uy=new Float64Array(slots);
uCmd.fill(-1);
for(let i=0;i<slots;i++){
  if(i%7===0)continue;uActive.push(i);ualive[i]=1;uteam[i]=i%6===0?0:1;utype[i]=i%31===0?7:0;
  ux[i]=(i*173)%1001;uy[i]=(i*271)%1001;if(i%5===0)uCmd[i]=(i>>>3)%4;
}
let visits=0;
const context=vm.createContext({AI:{t:1,bases,base:bases[0]},uActiveCount:uActive.length,uActive,ualive,uteam,utype,uCmd,ux,uy,
  UT_ENGINEER:7,isEnemyCommander:i=>i%211===0,dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2,
  aiScanCount:()=>uActive.length,aiScanUnit:n=>(visits++,uActive[n])});
vm.runInContext(`let aiArmyMemoT=-1,aiArmyMemo=[];${fn('aiRefreshArmyMemo')}${fn('aiSeatArmy')};globalThis.army=aiSeatArmy;`,context);

function belongs(i,B){
  const d=(ux[i]-B.x)**2+(uy[i]-B.y)**2;
  for(const O of bases)if(O!==B&&(ux[i]-O.x)**2+(uy[i]-O.y)**2<d)return false;
  return true;
}
function legacy(slot){
  let n=0;const base=bases[slot];
  for(const i of uActive){
    if(!ualive[i]||uteam[i]!==1||i%211===0||utype[i]===7)continue;
    if(uCmd[i]===slot)n++;else if(uCmd[i]<0&&belongs(i,base))n++;
  }return n;
}
for(let slot=0;slot<4;slot++)assert.equal(context.army(slot),legacy(slot),'seat '+slot+' census changed');
assert.equal(visits,uActive.length,'all seat queries should share one dense census');
for(let slot=3;slot>=0;slot--)assert.equal(context.army(slot),legacy(slot));
assert.equal(visits,uActive.length,'same-tick seat query rescanned active units');
console.log(JSON.stringify({status:'PASS',activeUnits:uActive.length,seats:4,
  legacyVisits:uActive.length*4,currentVisits:visits,reduction:4}));
