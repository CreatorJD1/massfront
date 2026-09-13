#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const repairSource=readFileSync(resolve(root,'src','repairbay.js'),'utf8');
const simSource=readFileSync(resolve(root,'src','game','sim.js'),'utf8');
const hashSource=readFileSync(resolve(root,'src','game','statehash.js'),'utf8');
const sessionSource=readFileSync(resolve(root,'src','session.js'),'utf8');
const checks=[];
function check(name,fn){
  try{fn();checks.push({name,ok:true});console.log('PASS  '+name);}
  catch(error){checks.push({name,ok:false,error:error.message});console.error('FAIL  '+name+'  '+error.message);}
}
function close(a,b,eps=1e-9){assert(Math.abs(a-b)<=eps,`${a} != ${b}`);}

function harness(){
  const blds=[],deposits=[{x:10,y:20,taken:true}],geysers=[{x:30,y:40,taken:true}],
    banks=new Map([['0:-1',{m:1000,e:1000}],['0:2',{m:1000,e:1000}],['1:1',{m:1000,e:1000}]]),credits=[];
  const BT={
    hq:{cm:0,ce:0,desc:'Command'},fac:{cm:200,ce:400,desc:'Factory'},airfield:{cm:180,ce:360,desc:'Airfield'},
    harbor:{cm:180,ce:360,desc:'Harbor'},tgate:{cm:500,ce:900,desc:'Gate'},fab:{cm:80,ce:120,desc:'Fabricator'},
    pgen:{cm:100,ce:200,desc:'Generator'},mex:{cm:120,ce:80,desc:'Extractor'},geo:{cm:140,ce:100,desc:'Geothermal'}
  };
  const BUP={pgen:[{cm:50,ce:60},{cm:80,ce:100}],fac:[{cm:170,ce:650}]};
  const context={console,MAXU:8,BT,BUP,blds,deposits,geysers,banks,credits,stats:{t:10},
    dealDamage(){},econTick(){},unitTick(){},resetWorld(){},
    bldTick(dt){for(const B of blds)if(B.alive){if(B.freeHeal>0&&B.hp<B.hpm)B.hp=Math.min(B.hpm,B.hp+B.freeHeal);if(B.dmgT>0)B.dmgT-=dt;}},
    commanderSlotForBuilding:B=>B.slot,
    payStream(team,m,e,slot){const bank=banks.get(team+':'+slot);if(!bank||bank.m<m||bank.e<e)return false;bank.m-=m;bank.e-=e;return true;},
    credit(team,m,e,slot){const bank=banks.get(team+':'+slot);if(!bank)throw new Error('missing-bank');bank.m+=m;bank.e+=e;credits.push({team,m,e,slot});},
    repairBld(B,amount){if(!B.alive||B.prog<1||!(amount>0))return 0;const before=B.hp;B.hp=Math.min(B.hpm,B.hp+amount);if(B.hp>=B.hpm){B.hp=B.hpm;B.repairOn=false;B.repairStalled=false;}return B.hp-before;},
    bldRecycleMass:B=>B.recycleMass==null?50:B.recycleMass,
    redirectProspectorsFromNode(){context.redirected=(context.redirected||0)+1;},
    rebuildBGrid(){context.rebuilt=(context.rebuilt||0)+1;}
  };
  context.window=context;context.globalThis=context;
  vm.runInContext(repairSource,vm.createContext(context),{filename:'src/repairbay.js'});
  return context;
}
function building(extra={}){return {type:'pgen',team:0,slot:-1,x:5,y:6,hp:500,hpm:1000,alive:true,prog:1,lvl:2,tier:1,dmgT:0,repairOn:false,repairStalled:false,...extra};}

check('public service exposes quote, intent, tick and recycle seams',()=>{
  const C=harness();assert.equal(typeof C.MFBuildingService.quote,'function');assert.equal(typeof C.MFBuildingService.setRepair,'function');
  assert.equal(typeof C.MFBuildingService.tick,'function');assert.equal(typeof C.MFBuildingService.recycle,'function');
});

check('paid repair runs after free healing and bills completed investment pro-rata',()=>{
  const C=harness(),B=building({freeHeal:10});C.blds.push(B);
  const on=C.MFBuildingService.setRepair(B,true,{team:0,slot:-1});assert.equal(on.ok,true);
  C.bldTick(1);
  close(B.hp,565);close(C.banks.get('0:-1').m,1000-(150*.35*.055));close(C.banks.get('0:-1').e,1000-(260*.35*.055));
});

check('hostile-fire gate pauses for four seconds and then resumes',()=>{
  const C=harness(),B=building({dmgT:6,lvl:1});C.blds.push(B);C.MFBuildingService.setRepair(B,true,{team:0,slot:-1});
  for(let n=0;n<3;n++)C.bldTick(1);assert.equal(B.hp,500);assert.equal(C.MFBuildingService.quote(B).state,'under-fire');
  C.bldTick(1);assert.equal(B.hp,555);assert.equal(C.MFBuildingService.quote(B).state,'repairing');
});

check('empty owner bank stalls without healing or a negative balance',()=>{
  const C=harness(),B=building({lvl:1});C.blds.push(B);C.banks.set('0:-1',{m:0,e:0});C.MFBuildingService.setRepair(B,true,{team:0,slot:-1});
  C.bldTick(1);assert.equal(B.hp,500);assert.deepEqual(C.banks.get('0:-1'),{m:0,e:0});assert.equal(B.repairOn,true);
  assert.equal(B.repairStalled,true);assert.equal(C.MFBuildingService.quote(B).state,'stalled');
  C.banks.set('0:-1',{m:100,e:100});C.bldTick(1);assert.equal(B.hp,555);assert.equal(B.repairStalled,false);
});

check('full health auto-cancels and manual cancellation is immediate',()=>{
  const C=harness(),full=building({hp:990,lvl:1}),cancel=building({hp:400,lvl:1,slot:2});C.blds.push(full,cancel);
  C.MFBuildingService.setRepair(full,true,{team:0,slot:-1});C.bldTick(1);assert.equal(full.hp,1000);assert.equal(full.repairOn,false);
  C.MFBuildingService.setRepair(cancel,true,{team:0,slot:2});assert.equal(cancel.repairOn,true);
  assert.equal(C.MFBuildingService.setRepair(cancel,false,{team:0,slot:2}).ok,true);assert.equal(cancel.repairOn,false);
});

check('zero-investment HQ and wrong-seat control fail closed',()=>{
  const C=harness(),hq=building({type:'hq',lvl:1}),ally=building({slot:2,lvl:1});C.blds.push(hq,ally);
  assert.equal(C.MFBuildingService.setRepair(hq,true,{team:0,slot:-1}).code,'zero-investment');assert.equal(hq.repairOn,false);
  assert.equal(C.MFBuildingService.setRepair(ally,true,{team:0,slot:-1}).code,'building-not-owned');assert.equal(ally.repairOn,false);
  assert.equal(C.MFBuildingService.setRepair(ally,true,{team:0,slot:2}).ok,true);C.bldTick(1);
  assert(C.banks.get('0:2').m<1000);assert.equal(C.banks.get('0:-1').m,1000);
});

check('unfinished buildings and upgrades cannot receive or inflate paid repair',()=>{
  const C=harness(),foundation=building({prog:.75,lvl:1}),upgrading=building({lvl:1,upT:8,slot:2});C.blds.push(foundation,upgrading);
  assert.equal(C.MFBuildingService.setRepair(foundation,true,{team:0,slot:-1}).code,'under-construction');
  const quote=C.MFBuildingService.quote(upgrading);close(quote.fullCostM,100*.35);close(quote.fullCostE,200*.35);
  assert.equal(C.MFBuildingService.setRepair(upgrading,true,{team:0,slot:2}).ok,true);
});

check('enemy building repair debits only its exact Commander wallet',()=>{
  const C=harness(),B=building({team:1,slot:1,lvl:1});C.blds.push(B);C.MFBuildingService.setRepair(B,true,{team:1,slot:1});C.bldTick(1);
  assert(C.banks.get('1:1').m<1000);assert.equal(C.banks.get('0:-1').m,1000);assert.equal(C.banks.get('0:2').m,1000);
});

check('recycle releases ownership, refunds once, and is idempotent',()=>{
  const C=harness(),B=building({type:'mex',slot:2,dep:0,recycleMass:75,lvl:1});C.blds.push(B);
  assert.equal(C.MFBuildingService.recycle(B,{team:0,slot:-1}).code,'building-not-owned');
  const first=C.MFBuildingService.recycle(B,{team:0,slot:2});assert.equal(first.ok,true);assert.equal(first.refund,75);
  assert.equal(B.alive,false);assert.equal(B.repairOn,false);assert.equal(C.deposits[0].taken,false);assert.equal(C.redirected,1);assert.equal(C.rebuilt,1);
  assert.equal(C.banks.get('0:2').m,1075);assert.equal(C.credits.length,1);
  assert.equal(C.MFBuildingService.recycle(B,{team:0,slot:2}).code,'building-gone');assert.equal(C.banks.get('0:2').m,1075);assert.equal(C.credits.length,1);
});

check('identical simulation inputs produce identical repair state',()=>{
  const run=()=>{const C=harness(),B=building({lvl:2,freeHeal:3,dmgT:2});C.blds.push(B);C.MFBuildingService.setRepair(B,true,{team:0,slot:-1});for(let n=0;n<6;n++)C.bldTick(.25);return JSON.stringify({hp:B.hp,on:B.repairOn,stalled:B.repairStalled,bank:C.banks.get('0:-1')});};
  assert.equal(run(),run());
});

check('simulation defaults and every terminal heal/death clear repair intent',()=>{
  assert.match(simSource,/repairOn:false,repairStalled:false/);
  assert.match(simSource,/B\.alive=false;\s*B\.repairOn=false; B\.repairStalled=false/);
  assert.match(simSource,/if\(B\.hp>=B\.hpm\)\{B\.hp=B\.hpm;B\.repairOn=false;B\.repairStalled=false;\}/);
});

check('gameplay hash includes repair intent and its damage gate',()=>{
  const row=hashSource.match(/const bf=\[([^\]]+)\]/)?.[1]||'';assert.match(row,/'repairOn'/);assert.match(row,/'dmgT'/);
});

check('session rows preserve repair intent and damage gate with legacy defaults',()=>{
  assert.match(sessionSource,/B\.repairOn\?1:0/);assert.match(sessionSource,/Math\.max\(0,B\.dmgT\|\|0\)/);
  assert.match(sessionSource,/repairOn,dmgT\]=b/);assert.match(sessionSource,/B\.repairOn=repairOn===1/);
  assert.match(sessionSource,/B\.dmgT=dmgT==null\?0:dmgT/);
  assert.match(sessionSource,/B\.length>17&&B\[17\]!==0&&B\[17\]!==1/);
});

const passed=checks.filter(C=>C.ok).length;
console.log(`\n${passed}/${checks.length} deterministic building-service checks passed`);
process.exit(passed===checks.length?0:1);
