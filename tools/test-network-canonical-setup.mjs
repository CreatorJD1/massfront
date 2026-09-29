#!/usr/bin/env node
/* Source-backed VM contract for the two-seat network setup boundary. This is
   deliberately not rendered or Worker/D1 acceptance; it catches a client that
   boots from its own menu/profile or resets its RNG when the start barrier lifts. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(root,'src/game/matchconsumer.js'),'utf8');
const determinism=readFileSync(resolve(root,'src/game/determinism.js'),'utf8');
const main=readFileSync(resolve(root,'src/main.js'),'utf8');
const social=readFileSync(resolve(root,'src/socialui.js'),'utf8');
const matchId='match-canonical-test',rulesHash='c'.repeat(64),setupHash='d'.repeat(64);
const setup=Object.freeze({schema:1,mode:'skirmish',slots:2,map:'aelos_north_medium',
  seed:'network:'+matchId+':'+rulesHash,preset:'compact',difficulty:1,
  playerFaction:'nova',commander:'nova_kai',enemyFaction:'horde',goal:'annihilate',
  timeLimit:600,resPace:1,crateRate:1,infestationOn:false,defenseFocus:0,
  deploymentPackage:'prepared',wildcards:0});

function peer(seat,local){
  const listeners=new Map(),calls={front:0,theme:[],boot:[],deploy:0,ready:[],close:0,layout:0,dom:0};
  const bag={equipped:{weapon:local.weapon},gear:{[local.weapon]:1},
    consumables:{c_supply:1},ready:['c_supply'],readyTy:{}};
  const initialBag=JSON.stringify(bag);
  const C={console,TextEncoder,queueMicrotask,setTimeout,clearTimeout,crypto:globalThis.crypto,
    MAP:1000,MAXU:8,POP_PLAYER_SLOT:-1,MAPDEFS:{
      aelos_north_medium:{seed:4291,theme:'verdant',size:'standard'},
      ocean_tester:{seed:9001,theme:'ocean',size:'large'}},
    curMap:local.map,curTheme:local.theme,curRegionId:'local-region',battlefieldPreset:'large',
    playerStartZone:local.zone,spawnPick:'ai0',playerFaction:local.faction,playerCommanderId:local.commander,
    aiFactionSel:local.enemy,difficulty:local.difficulty,goalSel:'survival',
    timeLimit:120,resPace:2,crateRate:3,crateRateBase:3,infestationOn:true,
    defenseFocus:1,deploymentPackage:'expedition',wcChoice:2,matchSetupArmed:true,
    META:{settings:{fog:false},owned:{cache:1,trade:2},inventory:bag},
    aiSlots:[{on:true,ally:true,diff:2,zone:'se',behavior:'rush'},
      {on:true,ally:false,diff:2,zone:'sw',behavior:'fortress'},
      {on:true,ally:true,diff:0,zone:'c',behavior:'balanced'},
      {on:false,ally:false,diff:0,zone:'nw',behavior:'rush'}],
    AI:{bases:[],allies:[]},carrier:{active:false,phase:2,alt:0,clearance:0},
    cam:{x:100,y:100},camFollow:-1,clampCam(){},camUpdateMatrices(){},
    ualive:new Uint8Array(8),usel:new Uint8Array(8),ugen:new Int32Array(8),unitHigh:0,
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);return true;},
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    hideFrontScreens(){calls.front++;},
    applyTheme(){calls.theme.push({map:C.curMap,theme:C.curTheme,preset:C.battlefieldPreset});},
    newSkirmish(){
      calls.boot.push({map:C.curMap,theme:C.curTheme,preset:C.battlefieldPreset,
        faction:C.playerFaction,commander:C.playerCommanderId,enemy:C.aiFactionSel,
        difficulty:C.difficulty,goal:C.goalSel,armed:C.matchSetupArmed,
        setup:C.__MF_NETWORK_SETUP__});
      C.resetWorld();
      C.AI.bases=[{slot:0,x:750,y:750}];C.AI.allies=[];
      C.carrier.active=true;C.mfSimRandom();
    },
    resetWorld(){},
    deployCarrier(){calls.deploy++;C.carrier.active=false;},
    closeMenus(){},mfFlowLayout(){calls.layout++;},
    MFSocialUI:{state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}}};
  C.window=C;
  let runtime={state:'preparing',seat,started:false,ended:false};
  C.MFMatchRuntime={registerConsumer(){return true;},status(){return {...runtime};},
    bootstrapReady(hash){calls.ready.push({hash,afterDeploy:!C.carrier.active,
      afterTheme:calls.theme.length>0,afterBoot:calls.boot.length>0,
      det:C.MFDeterministicSim.snapshot()});return Promise.resolve(true);},
    close(){calls.close++;runtime={...runtime,state:'closed',ended:true};}};
  vm.createContext(C);
  vm.runInContext(determinism,C,{filename:'determinism.js'});
  vm.runInContext(source,C,{filename:'matchconsumer.js'});
  const fire=(name,detail)=>{for(const fn of listeners.get(name)||[])fn({type:name,detail});};
  fire('load');
  return {C,calls,bag,initialBag,fire,setRuntime(value){runtime=value;}};
}

async function runPeer(seat,local){
  const P=peer(seat,local),{C,calls,fire}=P;
  fire('massfront-match:welcome',{matchId,seat,tick:0,resumed:false,
    compatibility:{rulesHash}});
  fire('massfront-match:prepare',{tick:0,seats:[1,2],setup,setupHash});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.close,0,'canonical setup must not abort the transport');
  assert.equal(calls.front,1,'prepare reveals the battlefield once');
  assert.equal(calls.theme.length,1,'prepare builds canonical terrain once');
  assert.equal(calls.boot.length,1,'prepare creates one skirmish before start');
  assert.equal(calls.deploy,1,'prepare lands the carrier before the barrier');
  assert.equal(calls.ready.length,1,'prepare acknowledges the tick-zero world');
  assert.deepEqual(calls.ready[0].hash,setupHash);
  assert.equal(calls.ready[0].afterDeploy,true);
  assert.equal(calls.ready[0].afterTheme,true);
  assert.equal(calls.ready[0].afterBoot,true);
  assert.equal(calls.theme[0].map,setup.map,'local map cannot reach terrain generation');
  assert.equal(calls.theme[0].theme,'verdant','local theme cannot reach terrain generation');
  assert.equal(calls.theme[0].preset,setup.preset,'local theatre cannot reach terrain generation');
  assert.equal(calls.boot[0].map,setup.map,'local map cannot reach skirmish bootstrap');
  assert.equal(calls.boot[0].faction,setup.playerFaction);
  assert.equal(calls.boot[0].commander,setup.commander);
  assert.equal(calls.boot[0].enemy,setup.enemyFaction);
  assert.equal(calls.boot[0].difficulty,setup.difficulty);
  assert.equal(calls.boot[0].goal,setup.goal);
  assert.equal(calls.boot[0].setup&&calls.boot[0].setup.map,setup.map,
    'newSkirmish must see the neutral network-profile hook');
  assert.equal(JSON.stringify(P.bag),P.initialBag,'online bootstrap cannot spend local consumables');
  assert.equal(C.MFDeterministicSim.snapshot().seed,C.MFDeterministicSim.hashSeed(setup.seed)>>>0);
  const beforeStart=C.MFDeterministicSim.snapshot();
  P.setRuntime({state:'running',seat,started:true,ended:false});
  fire('massfront-match:start',{tick:0,seats:[1,2]});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls.boot.length,1,'start barrier must not create a second world');
  assert.equal(calls.ready.length,1,'start barrier must not resend tick-zero readiness');
  assert.deepEqual(C.MFDeterministicSim.snapshot(),beforeStart,
    'start barrier must not reset the RNG state generated during setup');
  assert.equal(C.MFMatchCommandConsumer.requiresLockstep(),true);
  return P;
}

const A=await runPeer(1,{map:'ocean_tester',theme:'ocean',zone:'nw',faction:'syndicate',
  commander:'syn_nyx',enemy:'random',difficulty:2,weapon:'w_voidlens'});
const B=await runPeer(2,{map:'aelos_north_medium',theme:'ashland',zone:'se',faction:'legion',
  commander:'asc_vex',enemy:'nova',difficulty:0,weapon:'w_rangefinder'});
for(const P of [A,B]){
  assert.equal(P.C.curMap,setup.map);
  assert.equal(P.C.battlefieldPreset,setup.preset);
  assert.equal(P.C.playerFaction,setup.playerFaction);
  assert.equal(P.C.aiFactionSel,setup.enemyFaction);
  assert.equal(P.C.matchSetupArmed,false,'stale local DOM setup must not reapply');
}
assert.match(main,/__MF_NETWORK_SETUP__/,'main skirmish entry must honor the network-profile hook');
/* Execute the real setup prefix of newSkirmish, stopping before world spawning
   so this contract checks profile side effects without a fake inventory path. */
const skirmishStart=main.indexOf('function newSkirmish(){');
const spawnStart=main.indexOf('  /* ---- orbital drop',skirmishStart);
assert.ok(skirmishStart>=0&&spawnStart>skirmishStart,'newSkirmish setup prefix is available');
const setupPrefix=main.slice(skirmishStart,spawnStart)+'\n}';
function mainSetup(online){
  const calls={dom:0,wild:0,perks:0,modules:0,consumables:0,commander:0,doctrine:0};
  const bag={ready:['c_supply'],equipped:{weapon:'w_rangefinder'},consumables:{c_supply:2}};
  const prior=JSON.stringify(bag);
  const C=vm.createContext({window:{__MF_NETWORK_SETUP__:online?setup:null},
    document:{getElementById:()=>null},gameSpeed:2,curMap:setup.map,
    META:{settings:{fog:false}},fogOn:false,demoMode:true,WC:{old:true},wcActive:[{id:'old'}],wcChoice:2,
    crateRate:99,crateRateBase:2,AB_CD:[99,99],AB_BASE:[26,20],bldSpeedMult:7,
    _mfMatchCons:[{id:'old'}],_mfMatchGear:[{id:'old'}],stormTimer:200,
    consumeMatchSetup(){calls.dom++;C.curMap='ocean_tester';},stopAttract(){},
    normalizeAiSlotsForBattlefield(){},resetWorld(){},
    pickWildcards(){calls.wild++;C.WC={meteor:true};},applyMetaPerks(){calls.perks++;},
    applyModules(){calls.modules++;},invBag:()=>bag,
    INV_CONSUMABLES:[{id:'c_supply'}],INV_GEAR:[{id:'w_rangefinder'}],
    invApplyLoadout(){calls.consumables++;bag.consumables.c_supply--;bag.ready=[];},
    applyCommanderChoice(){calls.commander++;},applyFactionDoctrineChoice(){calls.doctrine++;},
    mapHazardKey:()=>'',mfSimRandom:()=>0.5,renderWcRow(){},console});
  vm.runInContext(setupPrefix+'\nnewSkirmish()',C,{filename:'main-network-setup-prefix.js'});
  return {C,calls,bag,prior};
}
const neutral=mainSetup(true);
assert.equal(neutral.calls.dom,0,'online setup must ignore armed local DOM selection');
assert.equal(neutral.calls.wild,0,'online setup cannot roll local wildcards');
assert.equal(neutral.calls.perks,0,'online setup cannot apply local Armory perks');
assert.equal(neutral.calls.modules,0,'online setup cannot apply local crafted modules');
assert.equal(neutral.calls.consumables,0,'online setup cannot consume ready inventory');
assert.equal(JSON.stringify(neutral.bag),neutral.prior,'online inventory remains byte-for-byte unchanged');
assert.equal(neutral.C.crateRate,neutral.C.crateRateBase);
assert.deepEqual([...neutral.C.AB_CD],[...neutral.C.AB_BASE]);
assert.equal(neutral.C.bldSpeedMult,1);
assert.deepEqual(Object.keys(neutral.C.WC),[]);
assert.equal(neutral.C.fogOn,true,'network fog cannot follow a local off preference');
assert.equal(neutral.calls.commander,1);
assert.equal(neutral.calls.doctrine,1);
const offline=mainSetup(false);
assert.equal(offline.calls.dom,1,'offline setup still commits its chosen DOM state');
assert.equal(offline.calls.wild,1);
assert.equal(offline.calls.perks,1);
assert.equal(offline.calls.modules,1);
assert.equal(offline.calls.consumables,1,'offline loadout behavior remains available');
const readyStart=social.indexOf('    async function bootstrapReady(setupHash){');
const readyEnd=social.indexOf('    function registerConsumer(',readyStart);
assert.ok(readyStart>=0&&readyEnd>readyStart,'real match runtime must expose tick-zero readiness');
const wire=[],events=[];
const readyContext=vm.createContext({state:'preparing',prepared:true,bootstrapSent:false,prepareGeneration:1,
  prepareHash:setupHash,MR_PROTOCOL:'massfront-match',MR_VERSION:2,
  MR_HASH_RE:/^[0-9a-f]{64}$/,socketReady:()=>true,
  mfGameplayStateHash:async()=> 'e'.repeat(64),send:frame=>{wire.push(frame);return true;},
  emit:(name,detail)=>events.push({name,detail}),fatal:code=>{throw new Error(code);}});
vm.runInContext(social.slice(readyStart,readyEnd),readyContext,{filename:'socialui-bootstrapReady.js'});
assert.equal(await vm.runInContext(`bootstrapReady('${setupHash}')`,readyContext),true);
assert.equal(wire.length,1,'runtime sends exactly one tick-zero gameplay digest');
assert.equal(wire[0].tick,0);
assert.equal(wire[0].setupHash,setupHash);
assert.equal(wire[0].hash,'e'.repeat(64));
assert.equal(wire[0].type,'bootstrapReady');
assert.equal(events[0].name,'bootstrapReady');
assert.equal(await vm.runInContext(`bootstrapReady('${setupHash}')`,readyContext),false,
  'duplicate prepare acknowledgements must not be sent');
/* The same setup hash can recur after a reconnect or a new prepare. A digest
   started in the prior generation must not acknowledge the newer world. */
let resolveOldHash;
readyContext.bootstrapSent=false;
readyContext.prepareGeneration=2;
readyContext.mfGameplayStateHash=()=>new Promise(resolve=>{resolveOldHash=resolve;});
const stale=vm.runInContext(`bootstrapReady('${setupHash}')`,readyContext);
assert.equal(typeof resolveOldHash,'function','old digest remains pending during re-prepare');
readyContext.prepareGeneration=3;
resolveOldHash('e'.repeat(64));
assert.equal(await stale,false,'old asynchronous digest must be discarded after re-prepare');
assert.equal(wire.length,1,'old digest must not emit a second bootstrapReady frame');
readyContext.mfGameplayStateHash=async()=> 'f'.repeat(64);
assert.equal(await vm.runInContext(`bootstrapReady('${setupHash}')`,readyContext),true,
  'new prepare generation can acknowledge the same canonical setup');
assert.equal(wire.length,2);
assert.equal(wire[1].hash,'f'.repeat(64));
console.log('PASS canonical network prepare: local choices do not enter terrain/boot, inventory preserved, tick-zero ready precedes start, RNG retained');
