import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/game/ai.js',import.meta.url),'utf8');
function fn(name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'missing '+name);
  const open=source.indexOf('{',start);let depth=0;
  for(let i=open;i<source.length;i++){
    if(source[i]==='{')depth++;
    else if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}
const sizes=[500,1000,2000,2500],results=[];

function fixture(total){
  const cap=total+8,bases=[{slot:0,x:0,y:0},{slot:1,x:1000,y:0},{slot:2,x:500,y:1000}];
  const uActive=[],ualive=new Uint8Array(cap),uteam=new Uint8Array(cap),utype=new Uint8Array(cap),
    uCmd=new Int16Array(cap),uAllyBase=new Int16Array(cap),ux=new Float64Array(cap),uy=new Float64Array(cap),
    ugen=new Uint16Array(cap);
  uCmd.fill(-1);uAllyBase.fill(-1);
  const commanders=new Set();
  for(let i=0;i<total;i++){
    uActive.push(i);ualive[i]=1;ugen[i]=1;
    const seat=(i/500)|0;
    if(seat===0){uteam[i]=0;uCmd[i]=-1;uAllyBase[i]=-1;}
    else if(seat<=3){uteam[i]=1;uCmd[i]=seat-1;if(i%97===0)uCmd[i]=-1;}
    else {uteam[i]=2;uCmd[i]=-1;}
    utype[i]=i%113===0?7:i%17===0?1:0;
    ux[i]=(i%101===0)?500:(i*173)%1001;
    uy[i]=(i*271)%1001;
    if(i%500===0)commanders.add(i);
  }
  const TYPES=Array.from({length:13},()=>({wk:'g',air:false}));
  TYPES[1]={wk:'g',air:true};TYPES[7]={wk:'n',air:false};TYPES[12]={wk:'g',air:false};
  const commanderFlag=new Uint8Array(cap),work={activeVisits:0,distCalls:0};
  for(const i of commanders)commanderFlag[i]=1;
  const context=vm.createContext({AI:{t:10,bases,base:bases[0]},uActiveCount:uActive.length,uActive,
    ualive,uteam,utype,uCmd,uAllyBase,ux,uy,ugen,TYPES,UT_ENGINEER:7,commanderFlag,work});
  vm.runInContext(`
    function isEnemyCommander(i){return commanderFlag[i]===1;}
    function dist2(x,y,a,b){work.distCalls++;return (x-a)*(x-a)+(y-b)*(y-b);}
    function aiScanCount(){return uActiveCount;}
    function aiScanUnit(n){work.activeVisits++;return uActive[n];}
    let aiUnitViewT=NaN,aiUnitViewSrc=null,aiUnitViewN=-1,aiUnitViewBases=null,aiUnitViewBaseN=-1,aiUnitViewCache=null;
    const aiUnitViewSolo=[null];
    let aiArmyMemoT=-1,aiArmyMemo=[],aiAirMemoT=-1,aiAirMemo=-1;
    ${fn('aiUnitView')}
    ${fn('aiUnitsForBase')}
    ${fn('aiInvalidateUnitView')}
    ${fn('aiUnitBelongsToBase')}
    ${fn('aiRefreshArmyMemo')}
    ${fn('aiSeatArmy')}
    ${fn('aiWaveMuster')}
    ${fn('playerAirCount')}
    function runWorkload(){
      AI.t++;aiInvalidateUnitView();let x=0;
      for(const B of AI.bases)x+=aiSeatArmy(B.slot)+aiWaveMuster(B,2).army+
        aiUnitsForBase(B,false).length+aiUnitsForBase(B,true).length;
      return x+playerAirCount()+aiUnitView().enemyArmy.length;
    }
    globalThis.api={view:aiUnitView,units:aiUnitsForBase,invalidate:aiInvalidateUnitView,
      seat:aiSeatArmy,muster:aiWaveMuster,air:playerAirCount,run:runWorkload};`,context);
  return {bases,uActive,ualive,uteam,utype,uCmd,uAllyBase,ux,uy,ugen,TYPES,commanders,context,
    api:context.api,counters:()=>({...work}),reset:()=>{work.activeVisits=0;work.distCalls=0;}};
}

function reference(F){
  let visits=0,distCalls=0;
  const d2=(i,B)=>{distCalls++;return (F.ux[i]-B.x)**2+(F.uy[i]-B.y)**2;};
  const belongs=(i,B)=>{const d=d2(i,B);for(const O of F.bases)if(O!==B&&d2(i,O)<d)return false;return true;};
  const army=i=>F.ualive[i]&&F.uteam[i]===1&&!F.commanders.has(i)&&F.utype[i]!==7;
  const combat=i=>army(i)&&F.TYPES[F.utype[i]].wk!=='n';
  const scan=filter=>{const out=[];for(const i of F.uActive){visits++;if(filter(i))out.push(i);}return out;};
  const seats=F.bases.map(B=>scan(i=>army(i)&&(F.uCmd[i]===B.slot||(F.uCmd[i]<0&&belongs(i,B)))).length);
  const muster=F.bases.map(B=>scan(i=>army(i)&&belongs(i,B)).length);
  const spatialArmy=F.bases.map(B=>scan(i=>army(i)&&belongs(i,B)));
  const spatialCombat=F.bases.map(B=>scan(i=>combat(i)&&belongs(i,B)));
  const playerAir=scan(i=>F.ualive[i]&&F.uteam[i]===0&&F.TYPES[F.utype[i]].air).length;
  /* These are the other full traversals removed from one busy pulse: retreat,
     ambush, defense, commander scramble, harassment and wave dispatch. */
  scan(army);scan(combat);scan(combat);scan(combat);scan(army);scan(combat);
  return {seats,muster,spatialArmy,spatialCombat,playerAir,visits,distCalls};
}

for(const total of sizes){
  const F=fixture(total),R=reference(F);
  F.reset();
  const seats=F.bases.map(B=>F.api.seat(B.slot));
  const muster=F.bases.map(B=>F.api.muster(B,2).army);
  const spatialArmy=F.bases.map(B=>Array.from(F.api.units(B,false)));
  const spatialCombat=F.bases.map(B=>Array.from(F.api.units(B,true)));
  const playerAir=F.api.air(),V=F.api.view(),W=F.counters();
  assert.deepEqual(seats,R.seats,total+' seat census changed');
  assert.deepEqual(muster,R.muster,total+' muster changed');
  assert.deepEqual(spatialArmy,R.spatialArmy,total+' spatial army order/ties changed');
  assert.deepEqual(spatialCombat,R.spatialCombat,total+' combat order/ties changed');
  assert.equal(playerAir,R.playerAir,total+' player-air count changed');
  assert.deepEqual(Array.from(V.enemyArmy),F.uActive.filter(i=>F.ualive[i]&&F.uteam[i]===1&&!F.commanders.has(i)&&F.utype[i]!==7));
  assert.equal(W.activeVisits,total,total+' optimized pulse did not share one active census');
  for(let repeat=0;repeat<8;repeat++)for(const B of F.bases){F.api.seat(B.slot);F.api.muster(B,2);}
  assert.equal(F.counters().activeVisits,total,total+' repeated same-tick seat reads rescanned');
  assert.ok(R.visits/W.activeVisits>=13,'expected at least 13x fewer active visits');
  results.push({total,legacy:{activeVisits:R.visits,distCalls:R.distCalls},
    optimized:{activeVisits:W.activeVisits,distCalls:W.distCalls},
    visitReduction:+(R.visits/W.activeVisits).toFixed(1)});
}

/* Same-array base mutation is detected automatically because spatial ownership
   depends on base coordinates/slots, while affiliation and active-list writes
   use the explicit invalidation seam called by the director's spawn path. */
{
  const F=fixture(2500);F.api.view();let before=F.counters().activeVisits;
  F.bases[0].x=260;F.api.view();assert.equal(F.counters().activeVisits,before+2500,'base mutation kept stale view');
  const i=501,old0=F.api.seat(0),old1=F.api.seat(1);F.uCmd[i]=1;F.api.invalidate();
  assert.equal(F.api.seat(0),old0-1,'uCmd invalidation did not remove old seat');
  assert.equal(F.api.seat(1),old1+1,'uCmd invalidation did not add new seat');
}

/* Indexed retask membership must keep exact (slot,generation) semantics and
   invalidate on every in-file mutation; replacing an array naturally gets a
   distinct WeakMap entry. */
let legacySnapComparisons=0;
{
  const ualive=new Uint8Array(64),uteam=new Uint8Array(64),ugen=new Uint16Array(64);
  ualive.fill(1);uteam.fill(1);ugen.fill(3);
  const C=vm.createContext({ualive,uteam,ugen});
  vm.runInContext(`let aiSnapMemo=new WeakMap();${fn('aiSnapDirty')}${fn('aiSnapHas')}${fn('aiDropSnap')}${fn('aiPruneSnaps')};
    globalThis.api={has:aiSnapHas,drop:aiDropSnap,prune:aiPruneSnaps,dirty:aiSnapDirty};`,C);
  const list=Array.from({length:24},(_,i)=>({i,g:3}));
  for(let q=0;q<2500;q++){
    const i=q%64;let found=false;
    for(const s of list){legacySnapComparisons++;if(s.i===i&&s.g===ugen[i]){found=true;break;}}
    assert.equal(C.api.has(list,i),found);
  }
  C.api.drop(list,4);assert.equal(C.api.has(list,4),false,'drop retained indexed membership');
  ugen[5]=4;C.api.prune(list);assert.equal(C.api.has(list,5),false,'prune retained stale generation');
  const replacement=[{i:40,g:3}];assert.equal(C.api.has(replacement,40),true,'replacement list reused old index');
  replacement.push({i:41,g:3});C.api.dirty(replacement);assert.equal(C.api.has(replacement,41),true,'explicit mutation invalidation failed');
  assert.equal(C.api.has(replacement,64),false,'absent index matched an undefined generation');
}

assert.match(source,/mfPerfBegin\('aiCensus'\)/,'AI census timing span missing');
assert.match(source,/mfPerfBegin\('aiUtility'\)/,'AI utility timing span missing');
assert.match(source,/mfPerfBegin\('aiRetreat'\)/,'AI retreat timing span missing');
assert.match(source,/mfPerfBegin\('aiTactics'\)/,'AI tactics timing span missing');
console.log(JSON.stringify({status:'PASS',contract:'deterministic-high-unit-ai-pulse',results,
  snapshot:{queries:2500,legacyComparisons:legacySnapComparisons,indexBuild:24,indexLookups:2500}},null,2));
