import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sim=fs.readFileSync(new URL('../src/game/sim.js',import.meta.url),'utf8');
const ai=fs.readFileSync(new URL('../src/game/ai.js',import.meta.url),'utf8');
const economy=fs.readFileSync(new URL('../src/game/economy.js',import.meta.url),'utf8');
const helper=sim.match(/function mfProductionDuration\(T\)[\s\S]*?(?=function mfBuildingActivity\()/);
const expectedPay=economy.match(/function econExpectedAiPay\(B,dt\)[\s\S]*?(?=function econInferAiPaySlot\()/);
assert(helper,'production authority helpers must remain immediately before mfBuildingActivity');
assert(expectedPay,'AI wallet prediction function');

const ctx={
  Math,playerBuildMult:1,aiBuildMult:1,doctrine:1,fort:1,
  factionDoctrineBuildSpeedMul(){return ctx.doctrine;},
  fortOf(){return {prod:ctx.fort};}
};
vm.createContext(ctx);
vm.runInContext(helper[0]+'\n'+expectedPay[0]+'\nthis.productionApi={mfProductionDuration,mfProductionSpeed,econExpectedAiPay};',ctx);
const {mfProductionDuration,mfProductionSpeed}=ctx.productionApi;

const units=[
  {name:'Striker',bt:1.1},{name:'Rhino',bt:2.6},{name:'Goliath',bt:6},
  {name:'Atlas Skycrane',bt:13},{name:'TITAN',bt:45}
];
const factions={Nova:1.12,Legion:1,Syndicate:1};
const rows=[];
for(const [faction,doctrine] of Object.entries(factions)){
  for(const owner of ['player','AI']){
    ctx.doctrine=doctrine;
    ctx.playerBuildMult=owner==='player'?1:1;
    ctx.aiBuildMult=owner==='AI'?1.15:1;
    const B={team:owner==='AI'?1:0,adj:0,tractorT:0};
    for(const T of units){
      const authored=mfProductionDuration(T),speed=mfProductionSpeed(B,T),seconds=T.bt/speed;
      assert.equal(authored,Math.max(8,4+3*T.bt),T.name+' authored duration');
      assert(seconds>=4-1e-9,T.name+' must never complete under four seconds');
      rows.push({faction,owner,unit:T.name,seconds:+seconds.toFixed(2)});
    }
  }
}

ctx.doctrine=1.12;ctx.playerBuildMult=1;ctx.aiBuildMult=1;
const expectedNova=[8/1.12,11.8/1.12,22/1.12,43/1.12,139/1.12];
for(let i=0;i<units.length;i++){
  const seconds=units[i].bt/mfProductionSpeed({team:0,adj:0,tractorT:0},units[i]);
  assert(Math.abs(seconds-expectedNova[i])<1e-9,units[i].name+' bare Nova pacing');
}

/* Full infrastructure and an AI difficulty scalar remain meaningful, but the
   authority cap guarantees that stacked bonuses cannot collapse a queue. */
ctx.doctrine=1.12;ctx.aiBuildMult=1.6;ctx.fort=1.22;
for(const T of units){
  const speed=mfProductionSpeed({team:1,adj:2,tractorT:5,tractorN:2},T);
  assert(speed<=T.bt/4+1e-12,T.name+' stacked work-rate cap');
  assert(T.bt/speed>=4-1e-9,T.name+' stacked completion floor');
}
ctx.fort=1;

/* prodT remains authored work, so an existing save retains both its completion
   fraction and its already-paid fraction after the pacing helper changes. */
const Q={name:'Goliath',bt:6,cm:64,ce:250},prodT=Q.bt*.37;
ctx.doctrine=1;ctx.playerBuildMult=1;
const speed=mfProductionSpeed({team:0,adj:0,tractorT:0},Q),dt=.5;
const work=Math.min(Q.bt-prodT,dt*speed),next=prodT+work;
assert(Math.abs(prodT/Q.bt-.37)<1e-12,'saved queue fraction');
assert(Math.abs((next-prodT)/Q.bt-work/Q.bt)<1e-12,'streamed debit fraction follows progress');
assert(Math.abs((Q.cm*prodT/Q.bt)+(Q.cm*work/Q.bt)-Q.cm*next/Q.bt)<1e-12,'paid mass remains proportional');
assert(Math.abs((Q.ce*prodT/Q.bt)+(Q.ce*work/Q.bt)-Q.ce*next/Q.bt)<1e-12,'paid energy remains proportional');
ctx.TYPES=[Q];ctx.aiBuildMult=1;ctx.factionDoctrineUnitCost=T=>({m:T.cm,e:T.ce});
const forecast=ctx.productionApi.econExpectedAiPay;
for(const [saved,step] of [[3,1],[5.9,1],[6,1]]){
  const B={team:1,prog:1,queue:[0],prodT:saved,adj:0,tractorT:0};
  const remaining=Math.max(0,Q.bt-saved),expectedWork=Math.min(remaining,step*mfProductionSpeed(B,Q));
  const pay=forecast(B,step);
  assert(Math.abs(pay.m-Q.cm*expectedWork/Q.bt)<1e-12,'forecast mass matches clamped authority at '+saved);
  assert(Math.abs(pay.e-Q.ce*expectedWork/Q.bt)<1e-12,'forecast energy matches clamped authority at '+saved);
}

/* Exhaust the source-authored faction rosters, not only the representative
   table above. These are the exact facility pools used by HUD/match commands. */
const typesAt=sim.indexOf('const TYPES=['),typesEnd=sim.indexOf('\n];',typesAt);
assert(typesAt>=0&&typesEnd>typesAt,'runtime TYPES table');
const doctrine=fs.readFileSync(new URL('../src/factiondoctrine.js',import.meta.url),'utf8')
  .split('/* ---- ACCOUNT FACTION RESEARCH')[0];
const rosterCtx={Float32Array,Int32Array,Uint8Array,Set,MAXU:16,playerFaction:'nova',AI:{fac:'legion'},
  stats:{t:0},utype:new Uint8Array(16),ugen:new Int32Array(16),salvageMult:1,
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
vm.createContext(rosterCtx);
vm.runInContext(sim.slice(typesAt,typesEnd+3)+'\n'+doctrine+'\nthis.runtimeTypes=TYPES;',rosterCtx);
const facilityPools={
  fac:[0,1,9,18,10,2,3,6,7,11,16,19,20,21,22,23,24,27,32],
  tgate:[8,26],airfield:[5,17,25],harbor:[14,15]
};
const extremeInfraRaw=1.24*1.22*1.44,legalSummary=[];
for(const faction of ['nova','legion','syndicate','horde']){
  rosterCtx.playerFaction=faction;rosterCtx.AI.fac=faction;
  for(const owner of ['player','AI']){
    const team=owner==='player'?0:1,base=owner==='player'?1.5:1.6*(1+.1*(2.2-1));
    ctx.playerBuildMult=owner==='player'?base:1;ctx.aiBuildMult=owner==='AI'?base:1;
    ctx.doctrine=rosterCtx.factionDoctrineBuildSpeedMul(team);ctx.fort=1.22;
    const ids=new Set();
    for(const [facility,pool] of Object.entries(facilityPools))
      for(const id of rosterCtx.factionDoctrineRoster(pool,facility,team))ids.add(id);
    assert(ids.size>0,faction+' '+owner+' legal roster');
    const oldTimes=[],newTimes=[];
    for(const id of ids){
      const T=rosterCtx.runtimeTypes[id];
      assert(T&&Number.isFinite(T.bt)&&T.bt>0,`${faction} ${facilityPools} TYPES[${id}] has legal finite bt`);
      const speed=mfProductionSpeed({team,adj:2,tractorT:10,tractorN:2},T),seconds=T.bt/speed;
      assert(Number.isFinite(speed)&&speed>0,`${faction} ${owner} ${T.name} finite speed`);
      assert(Number.isFinite(seconds)&&seconds>=4-1e-9,`${faction} ${owner} ${T.name} four-second floor`);
      oldTimes.push(T.bt/(base*ctx.doctrine*extremeInfraRaw));newTimes.push(seconds);
    }
    legalSummary.push({faction,owner,legal:ids.size,
      oldFastest:+Math.min(...oldTimes).toFixed(2),newFastest:+Math.min(...newTimes).toFixed(2),
      oldSlowest:+Math.max(...oldTimes).toFixed(2),newSlowest:+Math.max(...newTimes).toFixed(2)});
  }
}
ctx.fort=1;
assert.match(sim,/const speed=mfProductionSpeed\(B,T\);[\s\S]{0,180}dt\*speed/,'bldTick uses production authority');
assert.match(economy,/mfProductionSpeed\(B,T\)/,'AI debit forecast uses production authority');
const multBlock=ai.slice(ai.indexOf('const TE='),ai.indexOf('// ---------- construction ----------'));
assert(!/const\s+TT\s*=|aiBuildMult\s*=[^;]*\*TT/.test(multBlock),'technology threat must not multiply all AI manufacturing');
assert.match(multBlock,/FA\.buildMul/,'faction and difficulty manufacturing identity remains');

console.table(rows);
console.table(legalSummary);
console.log('production pacing authority: PASS');
