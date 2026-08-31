#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hud=readFileSync(join(ROOT,'src/ui/hud.js'),'utf8');
const css=readFileSync(join(ROOT,'src/styles/ui.css'),'utf8');
const economy=readFileSync(join(ROOT,'src/game/economy.js'),'utf8');
const render3d=readFileSync(join(ROOT,'src/ui/render3d.js'),'utf8');
const probe=readFileSync(join(ROOT,'tools/probe-stage7-production-ui.mjs'),'utf8');

function functionSlice(source,name,next){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf(`function ${next}(`,start+1);
  assert(start>=0&&end>start,`cannot extract ${name}`);
  return source.slice(start,end);
}

const unitCtx={
  TYPES:[{cm:100,ce:50,bt:20,r:9}],BT:{fac:{name:'Factory'}},
  factionDoctrineUnitCost:T=>({m:T.cm-5,e:T.ce-5}),mfUnitSizeBand:()=>({diameter:18,label:'HEAVY'}),
  hudPlayerPop:()=>({used:499,cap:500}),mfFactorySpeed:()=>2,result:null,
};
vm.runInNewContext(`const MF_PRODUCTION_QUEUE_CAP=30;${functionSlice(hud,'mfUnitProductionQuote','mfStructureBuildSpeed')}result=mfUnitProductionQuote(0,{team:0,type:'fac',tier:2,queue:Array(30).fill(0)});`,unitCtx);
assert.equal(unitCtx.result.queueFull,true);
assert.equal(unitCtx.result.queuePosition,30);
assert.equal(unitCtx.result.queueCap,30);

const structureCtx={
  BT:{rail:{cm:300,ce:900,bt:120,size:58}},playerKitKey:()=> 'syndicate',
  bldFoot:(key,kit,tier)=>{assert.equal(key,'rail');assert.equal(kit,'syndicate');assert.equal(tier,undefined);return [98,98];},
  mfStructureBuildSpeed:()=>2,mfStructureEffect:()=> 'effect',mfStructureDependencies:()=>['None'],mfStructureLockReasons:()=>[],
  MF_BUILD_ESCROW_FRAC:.02,result:null,
};
vm.runInNewContext(`${functionSlice(hud,'mfStructureBuildQuote','mfEconomySnapshot')}result=mfStructureBuildQuote('rail');`,structureCtx);
assert.deepEqual(Array.from(structureCtx.result.footprint),[98,98]);
assert.equal(structureCtx.result.effectiveSeconds,60);

const economyCtx={
  resM:[100],resE:[1000],RES_MCAP:[1000],RES_ECAP:[1000],mRate:10,mSpend:2,eRate:50,eSpend:10,stallM:0,stallE:0,result:null,
};
vm.runInNewContext(`${functionSlice(hud,'mfFmtSeconds','mfUnitSizeBand')}${functionSlice(hud,'mfEconomySnapshot','mfEconomyRow')}result=mfEconomySnapshot();`,economyCtx);
assert.match(economyCtx.result.energy.forecast,/FULL.*INCOME WASTED/);
assert.match(economyCtx.result.bottleneck,/ENERGY STORAGE FULL/);

assert.match(economy,/function mfReservedPlacementFoot\(type\)/);
assert.doesNotMatch(economy,/bldFoot\(placing\.type\)/);
assert.match(economy,/footBlocked\(placing\.type,placing\.x,placing\.y,placing\.rot\|\|0,null,fac\)/);
assert.match(render3d,/mfReservedPlacementFoot\(placing\.type\)/,'placement preview must draw the reserved faction/max-tier footprint');
assert.match(css,/#prodNav button\{width:44px;height:44px;min-width:44px;min-height:44px/);
assert.match(css,/#topbar \.res\{[^}]*min-height:44px/);
assert.match(css,/body\.hudTacticalDock #cmdbar \.cbtn\{min-width:44px;width:44px\}/);
assert.match(css,/\.bcard \.cardMeta\{[^}]*font:700 9\.5px/);
assert.match(probe,/production-full/);
assert.match(probe,/production keyboard isolation/);
assert.match(probe,/construction keyboard isolation/);
assert.match(probe,/identityStable/);
assert.match(probe,/exclude\)tmp\/stage7-production-ui\/\*\*/,'probe identity must exclude only its own evidence output');
assert.match(probe,/obstructionSelectors=.*#apOverlay.*#mfPreAlphaIntro.*#mfBootCover/,'visual evidence must reject launch/account surfaces that cover the tested panel');
assert.ok((probe.match(/assertPwBrowserOwnership\(browser\)/g)||[]).length>=2,'browser ownership must be asserted before and after capture');

console.log(JSON.stringify({status:'PASS',queueFull:true,reservedFootprint:'98x98',energyFull:true,touchTargets:'44px',ownershipAssertions:2},null,2));
