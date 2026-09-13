import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const developPath=path.join(root,'src','develop.js');
const treePath=path.join(root,'src','restree3d.js');
const develop=fs.readFileSync(developPath,'utf8');
const tree=fs.readFileSync(treePath,'utf8');

const events={saves:0,toasts:[],sounds:[],buzzes:[]};
const context={
  console,
  META:{
    mats:{alloy:999,circuit:999,isotope:999,relic:999},
    researchData:999,cores:0,res:{},mods:{},equip:[],resQueue:[],
  },
  document:{getElementById(){ return null; }},
  metaSave(){ events.saves++; },
  toast(message){ events.toasts.push(String(message)); },
  sfx(id){ events.sounds.push(id); },
  buzz(ms){ events.buzzes.push(ms); },
  renderMetaHead(){},
  facCanonicalId(id){ return id==='ascendancy'?'dominion':id==='horde'?'brood':id; },
  facArt(id){ return {nova:{nm:'Nova'},dominion:{nm:'Dominion'},syndicate:{nm:'Syndicate'},brood:{nm:'Brood'}}[id]||null; },
  mfFactionTechPurchasable(id){ return !String(id).startsWith('hor_'); },
};
context.window=context;
context.globalThis=context;
vm.createContext(context);
vm.runInContext(develop+`
globalThis.__stage7={
  DEVTREE,MODULES,devHas,devNodeScope,devNodeUnlocks,devNodeOutcome,
  devRecommendNext,devRecommendAfter,modCraftQuote,modRefitCost,
  modCraft,modRepair,
  DEV_MODULE_WEAR_MUL,DEV_MATERIAL_YIELD_MUL,DEV_MODULE_DURABILITY_CAP,
  DEV_REFIT_COST_MUL,DEV_REFIT_RESTORE_MUL
};`,context,{filename:'src/develop.js'});

const api=context.__stage7;
const node=id=>api.DEVTREE.find(n=>n.id===id);
const mod=id=>api.MODULES.find(m=>m.id===id);

assert.equal(api.MODULES.length,8,'expected the complete live module catalog');
assert(api.MODULES.every(m=>typeof m.compat==='string'&&m.compat.length>8),
  'every module must state compatibility in its authoritative catalog row');

const metalUnlocks=api.devNodeUnlocks(node('metallurgy'));
assert.deepEqual(Array.from(metalUnlocks,x=>x.label),['MODULE · Reactive Plating']);
assert.equal(api.devNodeScope(node('metallurgy')),'ACCOUNT UNLOCK · ACTIVE IN FUTURE RTS MATCHES');
assert.equal(api.devNodeScope(node('asc_siege_foundry')),'ACCOUNT UNLOCK · ACTIVE IN DOMINION RTS MATCHES');
assert.equal(api.devNodeScope(node('hor_gene_splice')),'AI DOSSIER · NO CURRENT PLAYER EFFECT');
assert.match(api.devNodeUnlocks(node('refit'))[0].label,/50% MATERIAL COST · RESTORES 60% DURABILITY/);
assert.match(api.devNodeUnlocks(node('slot2'))[0].label,/\+1 MODULE SLOT/);

assert.equal(api.devRecommendNext([]),null,'an empty faction tree must not leak a recommendation from another tree');
const recommended=api.devRecommendNext([node('salvage'),node('xeno')]);
assert.deepEqual({id:recommended.id,state:recommended.state},{id:'xeno',state:'ready'},
  'recommendation ranking must be deterministic for the same authoritative state');

context.META.res.metallurgy=1;
const metalOutcome=api.devNodeOutcome(node('metallurgy'));
assert.equal(metalOutcome.jump,'craft');
assert.equal(metalOutcome.recommendation.id,'optics');
assert.match(metalOutcome.recommendation.reason,/READY NOW/);

const plate=mod('plate');
const plateQuote=api.modCraftQuote(plate,6);
assert.deepEqual({
  compatibility:plateQuote.compatibility,current:plateQuote.current,cap:plateQuote.cap,
  craftAdd:plateQuote.craftAdd,craftResult:plateQuote.craftResult,
  refitAdd:plateQuote.refitAdd,refitResult:plateQuote.refitResult,refitAlloy:plateQuote.refitCost.alloy,
},{
  compatibility:'All player combat and support units',current:6,cap:24,
  craftAdd:12,craftResult:18,refitAdd:8,refitResult:14,refitAlloy:18,
});
const capped=api.modCraftQuote(plate,20);
assert.deepEqual({add:capped.craftAdd,result:capped.craftResult,cap:capped.cap,canCraft:capped.canCraft},
  {add:4,result:24,cap:24,canCraft:true});
const full=api.modCraftQuote(plate,24);
assert.deepEqual({current:full.current,add:full.craftAdd,result:full.craftResult,atCap:full.atCap,canCraft:full.canCraft,canRefit:full.canRefit},
  {current:24,add:0,result:24,atCap:true,canCraft:false,canRefit:false});
const overCap=api.modCraftQuote(plate,99);
assert.deepEqual({current:overCap.current,craftAdd:overCap.craftAdd,refitAdd:overCap.refitAdd},
  {current:24,craftAdd:0,refitAdd:0},'corrupt over-cap inventory must quote zero output, never negative durability');
context.META.mods.plate=99;
const normalized=api.modCraftQuote(plate);
assert.equal(normalized.current,24);
assert.equal(context.META.mods.plate,24,'corrupt stored durability must be normalized to the authoritative cap');

function resetEvents(){ events.saves=0; events.toasts.length=0; events.sounds.length=0; events.buzzes.length=0; }
function materialSnapshot(){ return JSON.stringify(context.META.mats); }
context.META.res.refit=1;
context.META.mods.plate=24;
resetEvents();
const cappedMaterials=materialSnapshot();
assert.equal(api.modCraft(plate),false,'crafting at cap must be rejected');
assert.equal(api.modRepair(plate),false,'refitting at cap must be rejected');
assert.equal(materialSnapshot(),cappedMaterials,'zero-output craft/refit guards must not spend materials');
assert.equal(context.META.mods.plate,24,'zero-output guards must not change durability');
assert.equal(events.saves,0,'zero-output guards must not save a transaction');
assert.deepEqual(events.sounds,[],'zero-output guards must not play completion audio');
assert.deepEqual(events.buzzes,[],'zero-output guards must not fire completion haptics');
assert.equal(events.toasts.filter(x=>/already at durability cap \(24 \/ 24\)/.test(x)).length,2,
  'craft and refit must explain the exact cap rejection');

context.META.mods.plate=20;
resetEvents();
const craftAlloy=context.META.mats.alloy;
assert.equal(api.modCraft(plate),true,'a near-cap craft with positive output must proceed');
assert.equal(context.META.mods.plate,24);
assert.equal(context.META.mats.alloy,craftAlloy-plate.cost.alloy);
assert.match(events.toasts.at(-1),/\+4 durability \u00b7 20 \u2192 24 \/ 24/,'near-cap craft result text must state exact applied output');

context.META.mods.plate=20;
resetEvents();
const refitAlloy=context.META.mats.alloy;
assert.equal(api.modRepair(plate),true,'a near-cap refit with positive output must proceed');
assert.equal(context.META.mods.plate,24);
assert.equal(context.META.mats.alloy,refitAlloy-api.modRefitCost(plate).alloy);
assert.match(events.toasts.at(-1),/\+4 durability \u00b7 20 \u2192 24 \/ 24/,'near-cap refit result text must state exact applied output');

const before=JSON.stringify(context.META);
api.devNodeOutcome(node('asc_siege_foundry'));
api.modCraftQuote(mod('optic'),7.5);
api.devRecommendNext([node('salvage'),node('xeno')]);
assert.equal(JSON.stringify(context.META),before,'read-only presenters must not mutate account state');

for(const token of ['COMPATIBLE · ','OUTPUT · +','DURABILITY CAP','REFIT RESTORES +'])
  assert(develop.includes(token),`crafting UI is missing ${token}`);
assert.equal((develop.match(/have\/quote\.cap\*100/g)||[]).length,2,'both durability bars must scale against the advertised cap');
for(const token of ['AFFECTED SCOPE','EXACT OUTCOMES','FOCUS RECOMMENDED','rtOutcomeJump','rtRecommendNext'])
  assert(tree.includes(token),`Development graph is missing ${token}`);
for(const token of ['rtBindTap(close','rtBindTap(jump','rtBindTap(recommend','rtBindTap(el,function(){ rtSelect(el.dataset.qid'])
  assert(tree.includes(token),`mobile-safe inspector navigation is missing ${token}`);
assert.match(develop,/m\.dur\*DEV_MODULE_DURABILITY_CAP/,'craft cap must consume the quoted authority');
assert.match(develop,/Math\.ceil\(m\.dur\*DEV_REFIT_RESTORE_MUL\)/,'refit must consume the quoted authority');

console.log(JSON.stringify({
  status:'PASS',modules:api.MODULES.length,nodes:api.DEVTREE.length,
  recommendation:recommended.id,plateQuote:{cap:plateQuote.cap,craftAdd:plateQuote.craftAdd,refitAdd:plateQuote.refitAdd},
  uiContracts:['scope','outcomes','recommendation','compatibility','craft-output','refit-output'],
},null,2));
