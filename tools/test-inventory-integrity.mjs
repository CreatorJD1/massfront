/* Source-backed inventory, module-fit and dropped-session regressions.
   This intentionally needs no GPU or browser and never writes a career. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const metaSource=await readFile(new URL('../src/game/meta.js',import.meta.url),'utf8');
const devSource=await readFile(new URL('../src/develop.js',import.meta.url),'utf8');
const factionSource=await readFile(new URL('../src/factiondoctrine.js',import.meta.url),'utf8');
const sessSource=await readFile(new URL('../src/session.js',import.meta.url),'utf8');
const mainSource=await readFile(new URL('../src/main.js',import.meta.url),'utf8');

function extractFunction(source,name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing production '+name+'()');
  const open=source.indexOf('{',start);
  let depth=0,quote='',escaped=false,lineComment=false,blockComment=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(lineComment){if(ch==='\n')lineComment=false;continue;}
    if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error('unterminated production '+name+'()');
}
const plain=value=>JSON.parse(JSON.stringify(value));
const invStart=metaSource.indexOf('const INV_RARITIES=');
const invEnd=metaSource.indexOf('function invConsumableScope(',invStart);
assert.ok(invStart>=0&&invEnd>invStart,'missing production inventory catalog');
const invCatalog=metaSource.slice(invStart,invEnd);
const arsenalStart=factionSource.indexOf('const FAC_ARSENAL=');
const arsenalEnd=factionSource.indexOf('function factionDoctrineRoster(',arsenalStart);
assert.ok(arsenalStart>=0&&arsenalEnd>arsenalStart,'missing production faction arsenal');

let saveOk=true,saveCount=0,massCredit=0;
const inv=vm.createContext({
  META:{inventory:{gear:{},consumables:{c_nanites:1,c_overdrive:1,c_supply:1,c_power:1},
    equipped:{weapon:'',armor:'',utility:''},ready:[],readyTy:{}}},
  PROFILES:{active:'p1'},TYPES:Array.from({length:40},(_,i)=>({name:'Chassis '+i})),
  playerFaction:'nova',
  typeHpMult:Float32Array.from({length:48},()=>1),
  typeDmgMult:Float32Array.from({length:48},()=>1),
  resHpMult:1,resEnergyMult:1,bldSpeedMult:1,armyDmgMult:1,
  credit:(_seat,m)=>{massCredit+=m;},
  metaSave:()=>{saveCount++;return saveOk;},toast:()=>{}
});
vm.runInContext(extractFunction(factionSource,'factionDoctrineKey')+'\n'+
  factionSource.slice(arsenalStart,arsenalEnd)+'\n'+
  extractFunction(factionSource,'factionDoctrineRoster')+'\n'+
  invCatalog+'\nlet invPendingReadied=null;\n'+[
  'invConsumableScope','invLockableTypes','invBag','invRevalidateReadyFaction',
  'invReadyConsumable','invAbandonReadied','invApplyLoadout','invCommitReadied'
].map(n=>extractFunction(metaSource,n)).join('\n'),inv);
assert.equal(vm.runInContext('invReadyConsumable("c_nanites",3)',inv),true);
inv.playerFaction='syndicate';
assert.equal(vm.runInContext('invReadyConsumable("c_overdrive",3)',inv),false,
  'a faction-unfieldable chassis must not accept a new lock');
assert.equal(inv.META.inventory.consumables.c_overdrive,1);
assert.deepEqual(plain(vm.runInContext('invRevalidateReadyFaction(false)',inv)),['c_nanites']);
assert.equal(inv.META.inventory.consumables.c_nanites,1,'faction change must return stock');
assert.deepEqual(plain(inv.META.inventory.ready),[]);
assert.equal(vm.runInContext('invReadyConsumable("c_nanites",0)',inv),true);
assert.equal(vm.runInContext('invReadyConsumable("c_supply")',inv),true);
const beforePreview=saveCount;
assert.equal(vm.runInContext('invApplyLoadout().length',inv),2);
assert.equal(saveCount,beforePreview,'predeploy preview must not write a charge');
assert.equal(inv.META.inventory.consumables.c_nanites,1);
assert.equal(inv.META.inventory.consumables.c_supply,1);
assert.ok(Math.abs(inv.typeHpMult[0]-1.26)<0.00001);
assert.equal(massCredit,220);
assert.equal(vm.runInContext('invCommitReadied()',inv),true);
assert.equal(inv.META.inventory.consumables.c_nanites,0);
assert.equal(inv.META.inventory.consumables.c_supply,0);
assert.deepEqual(plain(inv.META.inventory.ready),[]);
assert.equal(vm.runInContext('invCommitReadied()',inv),true,'repeat deploy cannot spend twice');
assert.equal(inv.META.inventory.consumables.c_nanites,0);
assert.equal(vm.runInContext('invReadyConsumable("c_power")',inv),true);
vm.runInContext('invApplyLoadout()',inv);
saveOk=false;
assert.equal(vm.runInContext('invCommitReadied()',inv),false,'save failure must block deploy');
assert.equal(inv.META.inventory.consumables.c_power,1,'failed save must roll back stock');
assert.deepEqual(plain(inv.META.inventory.ready),['c_power']);
saveOk=true;
assert.equal(vm.runInContext('invCommitReadied()',inv),true);
assert.equal(inv.META.inventory.consumables.c_power,0);

const records=new Map();
const modules=vm.createContext({
  META:{mods:{plate:100,optic:10,range:10},equip:['plate','plate','ghost','optic','range'],res:{},settings:{}},
  localStorage:{setItem:(k,v)=>records.set(k,v),getItem:k=>records.get(k)||null},
  metaKey:()=> 'career',armoryRetireOverlaps:()=>({changed:false})
});
vm.runInContext('const DEV_MODULE_DURABILITY_CAP=2; const MODULES=['+
  '{id:"plate",dur:12},{id:"optic",dur:10},{id:"range",dur:10}];\nlet metaSaveWarned=false;\n'+
  ['modOwned','modEquipped'].map(n=>extractFunction(devSource,n)).join('\n')+'\n'+
  extractFunction(metaSource,'metaSave'),modules);
assert.equal(vm.runInContext('metaSave()',modules),true);
assert.deepEqual(plain(JSON.parse(records.get('career')).equip),['plate'],
  'imported duplicates, unknown IDs and over-slot fits must not persist');
assert.equal(JSON.parse(records.get('career')).mods.plate,24,'imported durability must be clamped');
modules.META.res={slot2:1,slot3:1};modules.META.equip=['plate','optic','range'];
assert.equal(vm.runInContext('metaSave()',modules),true);
assert.deepEqual(plain(JSON.parse(records.get('career')).equip),['plate','optic','range']);
assert.ok(extractFunction(metaSource,'metaLoad').includes('modEquipped()'),
  'load-time module repair must persist even before the next explicit save');

const sessionRecords=new Map();
const ses=vm.createContext({
  window:{},PROFILES:{active:'p1'},META:{setup:{}},curMap:'plain',curTheme:'plain',goalSel:'destroy',
  timeLimit:0,AI:{fac:'nova',wave:0,waveTimer:0},playerFaction:'nova',
  playerCommanderId:'nova_kai',matchClock:30,stats:{t:30,kills:[0,0,0],built:[0,0],nests:0,reclaimed:0,campaignCache:0},
  resM:[100,0],resE:[200,0],
  typeHpMult:Float32Array.from({length:48},()=>1),
  typeDmgMult:Float32Array.from({length:48},()=>1),
  resHpMult:1,resRngMult:1,resEnergyMult:1,bldSpeedMult:1,
  resBldHpMult:1,resDefDmgMult:1,labBufferMult:1,
  _mfMatchCons:[{id:'c_nanites'}],_mfMatchGear:[{id:'a_fieldplate'}],
  INV_CONSUMABLES:[{id:'c_nanites'}],INV_GEAR:[{id:'a_fieldplate'}],
  localStorage:{getItem:k=>sessionRecords.get(k)||null,setItem:(k,v)=>sessionRecords.set(k,v),
    removeItem:k=>sessionRecords.delete(k)},
  sessCanSnapshot:()=>true,sessCaptureLocation:()=>null,sessCaptureWallets:()=>({}),
  sessCaptureUnits:()=>({tm:[0]}),sessCaptureBuildings:()=>[],sessCapturePatrols:()=>[],
  sessCaptureWrecks:()=>[],sessCaptureHeroState:()=>({}),
  sessCheckCoreState:()=>({ok:true}),sessCheckSetupEnvelope:()=>({ok:true}),
  sessLocationPrecheck:()=>({ok:true}),sessCheckWrecks:()=>({ok:true}),
  sessCheckHeroState:()=>({ok:true})
});
vm.runInContext('const SESS_KEY="session"; const SESS_TTL_MS=2700000; let sessMatchProfileId=null;\n'+[
  'sessBindMatchProfile','sessCaptureLoadoutState','sessCheckLoadoutState',
  'sessApplyLoadoutState','sessSnapshot','sessLoad','sessClear'
].map(n=>extractFunction(sessSource,n)).join('\n'),ses);
ses.typeHpMult[0]=1.26;ses.typeDmgMult[0]=1.32;ses.resHpMult=1.08;
vm.runInContext('sessBindMatchProfile("p1")',ses);
ses.PROFILES.active='p2';
assert.equal(vm.runInContext('sessSnapshot("test")',ses),true);
assert.equal(JSON.parse(sessionRecords.get('session')).profileId,'p1',
  'snapshot belongs to the launched career, not the currently selected picker');
assert.equal(vm.runInContext('sessLoad()',ses),null,'foreign career must not offer recovery');
assert.ok(sessionRecords.has('session'),'foreign career must not erase original recovery');
ses.PROFILES.active='p1';
const loaded=vm.runInContext('sessLoad()',ses);
assert.ok(loaded,'original career can recover its own match');
ses.typeHpMult.fill(1);ses.typeDmgMult.fill(1);ses.resHpMult=1;
ses._mfMatchCons=[];ses._mfMatchGear=[];
vm.runInContext('sessApplyLoadoutState(sessCheckLoadoutState(sessLoad()))',ses);
assert.ok(Math.abs(ses.typeHpMult[0]-1.26)<0.00001);
assert.ok(Math.abs(ses.typeDmgMult[0]-1.32)<0.00001);
assert.equal(ses.resHpMult,1.08);
assert.deepEqual(plain(ses._mfMatchCons.map(c=>c.id)),['c_nanites']);
assert.deepEqual(plain(ses._mfMatchGear.map(g=>g.id)),['a_fieldplate']);
const legacy=JSON.parse(sessionRecords.get('session'));delete legacy.profileId;
sessionRecords.set('session',JSON.stringify(legacy));
assert.equal(vm.runInContext('sessLoad()',ses),null,'unbound legacy recovery must fail closed');
assert.ok(!sessionRecords.has('session'));

const network=vm.createContext({window:{__MF_NETWORK_SETUP__:{schema:1}},running:true,
  demoMode:false,gameEnded:false,heroIdx:0,ualive:[1]});
vm.runInContext(extractFunction(sessSource,'sessCanSnapshot'),network);
assert.equal(vm.runInContext('sessCanSnapshot()',network),false,
  'local dropped-session recovery must not capture online matches');
network.window.__MF_NETWORK_SETUP__=null;
assert.equal(vm.runInContext('sessCanSnapshot()',network),true);
const deploy=extractFunction(mainSource,'deployCarrier');
assert.ok(deploy.indexOf('invCommitReadied()')>deploy.indexOf('carrierCanDeploy()')&&
  deploy.indexOf('invCommitReadied()')<deploy.indexOf('carrierSnapPosition()'),
  'charges must commit after landing validation but before any spawn mutation');
console.log('PASS inventory integrity: faction locks, deployment spend, rollback, module imports and profile-bound recovery');
