import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..'),sim=readFileSync(resolve(root,'src/game/sim.js'),'utf8'),
  consumer=readFileSync(resolve(root,'src/game/matchconsumer.js'),'utf8');
const paths=sim.slice(sim.indexOf('const BUP='),sim.indexOf('function bldDmgTierMul(')),
  source=sim.slice(sim.indexOf('function mfBuildingUpgradeAuthority('),sim.indexOf('/* ---------- research (Tech Lab)'));
const cases=[];
const test=async(name,run)=>{await run();cases.push(name);console.log('PASS '+name);};
function harness(network=false){
  const banks=new Map([['0:-1',{m:10000,e:20000}],['0:2',{m:10000,e:20000}],['1:0',{m:10000,e:20000}]]);
  const runtime={state:network?'running':'idle',seat:1,started:network,ended:false};
  const C={console,POP_PLAYER_SLOT:-1,MAXU:20,MAP:3000,heroLvl:10,unitHigh:0,matchLive:true,
    TYPES:[],BT:Object.fromEntries(['pgen','turret','mex','fac','techlab','hq'].map(k=>[k,{name:k}])),
    blds:[],banks,paid:[],AI:{allies:[{slot:2}],bases:[{slot:0}]},
    commanderSlotForBuilding:B=>B.slot,
    canAfford:(t,m,e,s)=>!!banks.get(t+':'+s)&&banks.get(t+':'+s).m>=m&&banks.get(t+':'+s).e>=e,
    pay:(t,m,e,s)=>{const bank=banks.get(t+':'+s);assert(bank&&bank.m>=m&&bank.e>=e);bank.m-=m;bank.e-=e;C.paid.push({t,m,e,s});},
    hasBld:(t,k)=>C.blds.some(B=>B.alive&&B.team===t&&B.type===k&&B.prog>=1),
    toast(){},addEventListener(){},ugen:[],uteam:[],uCmd:[],ualive:[],utype:[],
    runtime,MFMatchRuntime:{status:()=>({...runtime}),registerConsumer(){},
      submitCommands:cmds=>{C.submitted.push(cmds);return {seq:C.submitted.length,targetTick:9};}},submitted:[],
    MFSocialUI:{state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}}};
  C.window=C;vm.createContext(C);vm.runInContext(paths+source,C);
  if(network)vm.runInContext(consumer,C);
  C.add=extra=>{C.blds.push({alive:true,prog:1,type:'pgen',team:0,slot:-1,lvl:1,tier:1,upT:0,hp:100,hpm:100,...extra});return C.blds.length-1;};
  C.snapshot=()=>JSON.stringify({blds:C.blds,banks:[...banks]});
  return C;
}
await test('one next tier across all exact-owned same-type buildings; never allies or enemies',()=>{
  const C=harness();C.add({});C.add({lvl:2});C.add({slot:2});C.add({team:1,slot:0});C.add({type:'mex'});
  const Q=C.mfBuildingUpgradeBatchInfo(0);assert.deepEqual(Array.from(Q.indices),[0,1]);assert.equal(Q.totalCostM,240);
  assert.equal(C.mfStartBuildingUpgradeBatch(0).count,2);assert.equal(C.paid.length,1);
  assert.deepEqual(C.blds.map(B=>B.upT),[10,14,0,0,0]);
  C.finishUpgrade(C.blds[0]);C.finishUpgrade(C.blds[1]);assert.equal(C.blds[0].lvl,2);assert.equal(C.blds[1].lvl,3);
});
await test('selected maximum or busy building still controls eligible peers',()=>{
  for(const selected of [{lvl:3},{upT:7}]){
    const C=harness();C.add(selected);C.add({});const Q=C.mfBuildingUpgradeBatchInfo(0);
    assert.equal(Q.canUpgradeSelected,false);assert.equal(Q.canUpgradeAll,true);assert.equal(Q.eligibleCount,1);
    assert(C.mfStartBuildingUpgradeBatch(0).ok);assert.equal(C.blds[1].upT,10);
  }
});
await test('busy, max, unfinished, dead and level-locked peers are counted or skipped correctly',()=>{
  const C=harness();C.heroLvl=3;C.add({});C.add({upT:4});C.add({lvl:3});C.add({prog:.2});C.add({alive:false});C.add({lvl:2});
  const Q=C.mfBuildingUpgradeBatchInfo(0);assert.equal(Q.ownedCount,5);assert.equal(Q.eligibleCount,1);
  assert.equal(Q.busyCount,1);assert.equal(Q.maxCount,1);assert.equal(Q.buildingCount,1);assert.equal(Q.lockedCount,1);
});
await test('insufficient total mass or energy rejects atomically, not a hidden affordable subset',()=>{
  for(const bank of [{m:120,e:1000},{m:500,e:400}]){
    const C=harness();C.add({type:'turret'});C.add({type:'turret'});C.banks.set('0:-1',bank);
    const before=C.snapshot(),Q=C.mfBuildingUpgradeBatchInfo(0);assert.equal(Q.canUpgradeSelected,true);
    assert.equal(Q.canUpgradeAll,false);assert.equal(C.mfStartBuildingUpgradeBatch(0).ok,false);assert.equal(C.snapshot(),before);
  }
});
await test('single button upgrades only selected and rejects stale, enemy, ally and foundation handles',()=>{
  const C=harness();C.add({});C.add({});C.add({slot:2});C.add({prog:.2});C.add({alive:false});
  assert.equal(C.startUpgrade(1),null);assert.equal(C.blds[0].upT,0);assert.equal(C.blds[1].upT,10);
  for(const id of [-1,99,2,3,4])assert.equal(typeof C.startUpgrade(id),'string');assert.equal(C.paid.length,1);
});
await test('factory tech prerequisites, Tech 2 maximum, and production queue survive upgrade',()=>{
  const C=harness();C.add({type:'fac',queue:[0,1],prodT:6});C.add({type:'fac',tier:2});
  assert.match(C.startUpgrade(0),/Requires/);C.add({type:'techlab'});
  assert.equal(C.startUpgrade(0),null);C.finishUpgrade(C.blds[0]);assert.equal(C.blds[0].tier,2);
  assert.deepEqual(C.blds[0].queue,[0,1]);assert.equal(C.blds[0].prodT,6);assert.match(C.startUpgrade(1),/Tech 2/);
});
await test('repeated offline activation never double spends while upgrading',()=>{
  const C=harness();C.add({});C.add({});C.mfStartBuildingUpgradeBatch(0);const before=C.snapshot();
  assert.equal(C.mfStartBuildingUpgradeBatch(0).ok,false);assert.equal(C.snapshot(),before);assert.equal(C.paid.length,1);
});
function packet(commands,seat=1){return {tick:9,commands:[{seat,seq:1,commands}]};}
async function applyPacket(C,value){
  for(let n=C.MFMatchCommandConsumer.lastAppliedTick()+1;n<value.tick;n++)assert(await C.MFMatchCommandConsumer.applyTick({tick:n,commands:[]}));
  return C.MFMatchCommandConsumer.applyTick(value);
}
const order=(id,type='pgen',scope='same-type')=>({type:'upgrade',building:{id,type},scope});
await test('network batch is deferred, protected from repeat taps, and applies identically on two runtimes',async()=>{
  const A=harness(true),B=harness(true);for(const C of [A,B]){C.add({});C.add({lvl:2});C.add({slot:2});}
  assert(A.MFMatchCommandConsumer.submitUpgrade(0,true));assert.equal(A.paid.length,0);
  assert.equal(A.MFMatchCommandConsumer.submitUpgrade(0,true),null);assert.equal(A.submitted.length,1);
  assert.equal(A.mfBuildingUpgradeBatchInfo(0).selectedCode,'queued');
  for(const C of [A,B])assert(await applyPacket(C,packet([order(0)])));
  assert.equal(A.snapshot(),B.snapshot());assert.equal(A.MFMatchCommandConsumer.upgradePending(),false);
  assert.equal(A.blds[2].upT,0);
});
await test('queued ticks apply only at their exact boundary and reject late or skipped ticks',async()=>{
  const C=harness(true);C.add({});
  const tick=n=>({tick:n,commands:[{seat:1,seq:n,commands:[order(0,'pgen','single')]}]});
  assert.equal(await C.MFMatchCommandConsumer.enqueueTick(tick(2)),false);
  const queued=C.MFMatchCommandConsumer.enqueueTick(tick(1));
  assert.equal(C.MFMatchCommandConsumer.canAdvance(1),true);
  assert.equal(C.MFMatchCommandConsumer.canAdvance(2),false);
  assert.equal(C.MFMatchCommandConsumer.beginTick(2),false);
  assert.equal(C.MFMatchCommandConsumer.beginTick(1),true);
  assert.equal(C.paid.length,1);assert.equal(C.MFMatchCommandConsumer.commitTick(1),true);
  assert.equal(await queued,true);
  assert.equal(await C.MFMatchCommandConsumer.enqueueTick(tick(1)),true);
});
await test('pending upgrade remains latched before its receipt tick and clears at that tick',async()=>{
  const C=harness(true);C.add({});
  assert(C.MFMatchCommandConsumer.submitUpgrade(0,false));
  assert.equal(C.MFMatchCommandConsumer.upgradePending(),true);
  for(let n=1;n<=8;n++)assert(await C.MFMatchCommandConsumer.applyTick({tick:n,commands:[]}));
  assert.equal(C.MFMatchCommandConsumer.submitUpgrade(0,false),null);
  assert.equal(C.submitted.length,1);assert.equal(C.MFMatchCommandConsumer.upgradePending(),true);
  assert(await C.MFMatchCommandConsumer.applyTick({tick:9,commands:[]}));
  assert.equal(C.MFMatchCommandConsumer.upgradePending(),false);
});
await test('reconnecting active match blocks local upgrade mutation and preserves pending latch',()=>{
  const C=harness(true);C.add({});assert(C.MFMatchCommandConsumer.submitUpgrade(0,false));
  C.runtime.state='reconnecting';
  const before=C.snapshot();assert.equal(C.MFMatchCommandConsumer.requiresLockstep(),true);
  assert.equal(C.MFMatchCommandConsumer.upgradePending(),true);
  assert.match(C.startUpgrade(0),/network/);assert.equal(C.mfStartBuildingUpgradeBatch(0).code,'network');
  assert.equal(C.snapshot(),before);assert.equal(C.paid.length,0);
  C.runtime.state='error';assert.equal(C.MFMatchCommandConsumer.requiresLockstep(),true);
  C.runtime.ended=true;assert.equal(C.MFMatchCommandConsumer.requiresLockstep(),false);
});
await test('network single and remote seat scope charge only the exact owner',async()=>{
  const C=harness(true);C.add({});C.add({team:1,slot:0});C.add({team:1,slot:0});
  assert(await applyPacket(C,packet([order(1,'pgen','single')],2)));
  assert.equal(C.blds[1].upT,10);assert.equal(C.blds[2].upT,0);assert.equal(C.banks.get('0:-1').m,10000);
});
await test('network rejects duplicate, foreign, stale-type, extra-field and overspent orders before mutation',async()=>{
  for(const commands of [[order(0),order(0)], [order(1)], [order(0,'fac')], [{...order(0),debug:true}]]){
    const C=harness(true);C.add({});C.add({slot:2});const before=C.snapshot();
    assert.equal(await applyPacket(C,packet(commands)),false);assert.equal(C.snapshot(),before);
  }
  const C=harness(true);C.add({});C.add({type:'turret'});C.banks.set('0:-1',{m:120,e:1000});const before=C.snapshot();
  assert.equal(await applyPacket(C,packet([order(0),order(1,'turret')])),false);assert.equal(C.snapshot(),before);
});
await test('direct local-only upgrade bypass is refused during network match',()=>{
  const C=harness(true);C.add({});const before=C.snapshot();assert.match(C.startUpgrade(0),/network/);
  assert.equal(C.mfStartBuildingUpgradeBatch(0).code,'network');assert.equal(C.snapshot(),before);
});
await test('both human sides obey the shared match rank without an enemy-seat bypass',async()=>{
  const C=harness(true);C.heroLvl=1;C.add({lvl:2});C.add({team:1,slot:0,lvl:2});
  const before=C.snapshot();
  for(const [id,seat] of [[0,1],[1,2]])assert.equal(await applyPacket(C,packet([order(id)],seat)),false);
  assert.equal(C.snapshot(),before);C.heroLvl=6;
  assert(await applyPacket(C,packet([order(1)],2)));assert.equal(C.blds[1].upT,14);
});
console.log(JSON.stringify({status:'PASS',checks:cases.length,realSourceContracts:true,browserAcceptance:false}));
