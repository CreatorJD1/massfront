import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const meta=fs.readFileSync(path.join(root,'src','game','meta.js'),'utf8');
const storeui=fs.readFileSync(path.join(root,'src','storeui.js'),'utf8');
const retired=['armor','targeting','salvage','reactor'];
const expected={
  armor:[0,400,1200,2800],
  targeting:[0,400,1200,2800],
  salvage:[0,400,1200],
  reactor:[0,380,1140,2640],
};

function between(src,start,end){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'missing source block: '+start+' → '+end);
  return src.slice(a,b);
}
function clone(v){ return JSON.parse(JSON.stringify(v)); }

const migrationSource=between(meta,'const ARMORY_RETIRED_OVERLAPS','const META_DEF');
const migrationContext={META:{}};
vm.createContext(migrationContext);
vm.runInContext(migrationSource+'\nglobalThis.__api={ARMORY_RETIRED_OVERLAPS,armoryRetireOverlaps};',
  migrationContext,{filename:'src/game/meta.js#armory-retirement'});
const migration=migrationContext.__api;
assert.deepEqual(Object.keys(migration.ARMORY_RETIRED_OVERLAPS),retired,
  'migration authority must contain only the four approved direct overlaps');

for(const id of retired){
  for(let tier=0;tier<expected[id].length;tier++){
    migrationContext.META={cores:17,owned:{[id]:tier},deals:{day:1,claimed:{[id]:1,cache:1}}};
    const first=migration.armoryRetireOverlaps();
    assert.equal(first.refund,expected[id][tier],id+' tier '+tier+' refund drifted');
    assert.equal(migrationContext.META.cores,17+expected[id][tier]);
    assert(!Object.prototype.hasOwnProperty.call(migrationContext.META.owned,id),id+' tombstone was not deleted');
    assert(!Object.prototype.hasOwnProperty.call(migrationContext.META.deals.claimed,id),id+' stale daily-deal claim survived');
    assert.equal(migrationContext.META.deals.claimed.cache,1,'unrelated deal claim changed');
    const snapshot=clone(migrationContext.META);
    const second=migration.armoryRetireOverlaps();
    assert.deepEqual({changed:second.changed,refund:second.refund},{changed:false,refund:0},
      id+' migration was not idempotent');
    assert.deepEqual(migrationContext.META,snapshot,id+' second migration changed state');
  }
}

migrationContext.META={cores:100,owned:{armor:-4,targeting:1.9,salvage:99,reactor:'2',trade:3}};
const clamped=migration.armoryRetireOverlaps();
assert.equal(clamped.refund,2740,'invalid/imported tiers did not clamp to authored bounds');
assert.equal(migrationContext.META.cores,2840);
assert.deepEqual(migrationContext.META.owned,{trade:3},'tier migration did not preserve Trade Network');

const preserved={
  cores:50,
  owned:{armor:2,cache:1,trade:3,capacitor:2,orbital:1,col_crimson:1},
  deals:{day:123,claimed:{armor:1,cache:1}},
  res:{metallurgy:1},mats:{alloy:9,circuit:8,isotope:7,relic:6},mods:{plate:4},equip:['plate'],
  inventory:{gear:{w_rangefinder:1},consumables:{c_supply:2},equipped:{weapon:'w_rangefinder',armor:'',utility:''},ready:['c_supply']},
  custom:{keep:['every','unrelated','field']},
};
const preservedExpected=clone(preserved);
preservedExpected.cores+=1200;
delete preservedExpected.owned.armor;
delete preservedExpected.deals.claimed.armor;
migrationContext.META=clone(preserved);
assert.equal(migration.armoryRetireOverlaps().refund,1200);
assert.deepEqual(migrationContext.META,preservedExpected,'migration changed unrelated career state');

const loadSource=between(meta,'function metaLoad(){','/* Local save is the source of truth');
const saveSource=between(meta,'function metaSave(){','/* The live graphics budget');
assert.match(loadSource,/const overlapMigration=armoryRetireOverlaps\(\)/,
  'metaLoad does not run the retirement migration');
assert.match(loadSource,/overlapMigration\.changed\) metaSave\(\)/,
  'metaLoad does not persist a migrated tombstone');
assert(saveSource.indexOf('armoryRetireOverlaps();')>=0&&
  saveSource.indexOf('armoryRetireOverlaps();')<saveSource.indexOf('localStorage.setItem'),
  'metaSave must sanitize restored/imported META before serialization');

const legacyLoad={
  cores:5,standardMatches:0,owned:{reactor:3,trade:1},
  deals:{day:7,claimed:{reactor:1,trade:1}},
  settings:{gfxPhoneMed:1,experimentalExploration:false},
};
const loadContext={
  META:{},DEF_SETTINGS:{},
  META_DEF:{xp:0,cores:0,researchData:0,owned:{},settings:{}},
  localStorage:{getItem(){return JSON.stringify(legacyLoad);}},
};
vm.createContext(loadContext);
vm.runInContext(migrationSource+`
let __saveCount=0,__persisted=null;
function metaKey(){return 'legacy';}
function metaHarden(){if(!META.owned||typeof META.owned!=='object')META.owned={};META.settings=Object.assign({},DEF_SETTINGS,META.settings||{});}
function metaSave(){__saveCount++;armoryRetireOverlaps();__persisted=JSON.parse(JSON.stringify(META));}
`+loadSource+`
metaLoad();globalThis.__loadResult={saveCount:__saveCount,persisted:__persisted,live:JSON.parse(JSON.stringify(META))};`,
  loadContext,{filename:'src/game/meta.js#metaLoad'});
assert.equal(loadContext.__loadResult.saveCount,1,'legacy metaLoad did not persist its retirement');
assert.equal(loadContext.__loadResult.live.cores,2645,'legacy metaLoad refund drifted');
assert.deepEqual(clone(loadContext.__loadResult.live.owned),{trade:1},'legacy metaLoad did not preserve Trade Network');
assert.deepEqual(clone(loadContext.__loadResult.persisted),clone(loadContext.__loadResult.live),
  'metaLoad persisted a different career than the sanitized live state');

let importedWrite='';
const saveContext={
  META:{cores:9,owned:{salvage:2,cache:1},settings:{}},
  localStorage:{setItem(key,value){assert.equal(key,'imported');importedWrite=value;}},
  metaKey(){return 'imported';},
};
vm.createContext(saveContext);
vm.runInContext(migrationSource+'\nlet metaSaveWarned=false;\n'+saveSource+'\nmetaSave();',
  saveContext,{filename:'src/game/meta.js#metaSave'});
const importedSaved=JSON.parse(importedWrite);
assert.equal(importedSaved.cores,1209,'restored/imported metaSave refund drifted');
assert.deepEqual(importedSaved.owned,{cache:1},'metaSave serialized a stale retired key');

const storeSource=between(meta,'const STORE=[','/* ---------- field inventory');
const storeContext={};vm.createContext(storeContext);
vm.runInContext(storeSource+'\nglobalThis.__store=STORE;',storeContext,{filename:'src/game/meta.js#store'});
const storeIds=Array.from(storeContext.__store,x=>x.id);
for(const id of retired) assert(!storeIds.includes(id),id+' remains in the authoritative STORE catalog');
for(const id of ['cache','trade','neural','capacitor','droppod','bastion','orbital'])
  assert(storeIds.includes(id),id+' was unintentionally retired');

const catsSource=between(storeui,'const ARM_CATS=[','let armTab=');
const catsContext={};vm.createContext(catsContext);
vm.runInContext(catsSource+'\nglobalThis.__cats=ARM_CATS;',catsContext,{filename:'src/storeui.js#categories'});
const catIds=Array.from(catsContext.__cats.flatMap(x=>Array.from(x.items)));
const filtersSource=between(storeui,'const ARM_MARKET_FILTERS=[','/* ---- daily deals');
const filtersContext={};vm.createContext(filtersContext);
vm.runInContext(filtersSource+'\nglobalThis.__filters=ARM_MARKET_FILTERS;',filtersContext,{filename:'src/storeui.js#filters'});
const filterIds=Array.from(filtersContext.__filters.flatMap(x=>Array.from(x.items)));
for(const id of retired){
  assert(!catIds.includes(id),id+' remains in an Armory category');
  assert(!filterIds.includes(id),id+' remains in a Market filter');
}

const perkSource=between(storeui,'function perkFx(id,t){','/* ---- header: cores');
for(const id of retired) assert(!perkSource.includes("case '"+id+"'"),id+' still has Market effect copy');

const applySource=between(meta,'function applyMetaPerks(){','// Neural Uplink');
const effectContext={
  META:{owned:{armor:3,targeting:3,salvage:2,reactor:3,trade:2}},
  crateRateBase:1,crateRate:1,credit(){},resHpMult:1,armyDmgMult:1,
  bonusMass:0,bonusEnergy:0,AB_CD:[26,20,30,70,45],AB_BASE:[26,20,30,70,45],
  salvageMult:1,resEnergyMult:1,bldHpMult:1,abUnlock:[false,false,false,false,false],
  WC:{nofab:false,brittle:false},
};
vm.createContext(effectContext);
vm.runInContext(applySource+'\napplyMetaPerks();\nglobalThis.__effects={resHpMult,armyDmgMult,salvageMult,resEnergyMult,bonusMass,bonusEnergy};',
  effectContext,{filename:'src/game/meta.js#applyMetaPerks'});
assert.deepEqual(Object.assign({},effectContext.__effects),{
  resHpMult:1,armyDmgMult:1,salvageMult:1,resEnergyMult:1,bonusMass:3,bonusEnergy:10,
},'retired keys still affect a match or Trade Network stopped applying');

const cartSource=between(storeui,'function armCartResolve(e){','function armCartAdd(kind,id){');
const cartContext={STORE:storeContext.__store,META:{owned:{armor:3}}};vm.createContext(cartContext);
vm.runInContext(cartSource+'\nglobalThis.__stale=armCartResolve({kind:"perk",id:"armor",tier:4});',
  cartContext,{filename:'src/storeui.js#cart'});
assert.equal(cartContext.__stale,null,'a stale retired cart entry still resolves');

console.log(JSON.stringify({
  status:'PASS',retired,nominalMaxRefund:9440,retained:'trade',
  checks:['tier-refunds','clamping','idempotence','state-preservation','load-save-paths','catalog','effects','stale-cart'],
},null,2));
