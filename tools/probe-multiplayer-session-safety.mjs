#!/usr/bin/env node
/* Focused current-source contract: prepare owns the world, start releases it,
   and a terminated online match never becomes an offline simulation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(root,'src/game/matchconsumer.js'),'utf8');
const listeners=new Map();
let boots=0,offlineOrders=0,closed=0,abortCode='',frontHides=0,themes=0,layouts=0,matrices=0,readies=0,deploys=0;
const setup={schema:1,mode:'skirmish',slots:2,map:'aelos_north_medium',seed:'network:probe:rules',
  preset:'compact',difficulty:1,playerFaction:'nova',commander:'nova_kai',enemyFaction:'horde',
  goal:'annihilate',timeLimit:600,resPace:1,crateRate:1,infestationOn:false,defenseFocus:0,
  deploymentPackage:'prepared',wildcards:0};
const C={console,TextEncoder,queueMicrotask,POP_PLAYER_SLOT:-1,MAP:1000,MAXU:4,
  MAPDEFS:{aelos_north_medium:{seed:1234,theme:'verdant',region:'aelos_north'}},
  aiSlots:[{on:false,ally:false,diff:0},{on:false,ally:false,diff:0},
    {on:false,ally:false,diff:0},{on:false,ally:false,diff:0}],AI:{bases:[],allies:[]},
  cam:{x:100,y:100},camFollow:0,clampCam(){},camUpdateMatrices(){matrices++;},
  ualive:new Uint8Array([1,0,0,0]),usel:new Uint8Array([1,0,0,0]),ugen:new Int32Array([1,0,0,0]),unitHigh:1,
  curMap:'test',curTheme:'ocean',curRegionId:'local-region',battlefieldPreset:'large',
  difficulty:2,defenseFocus:1,infestationOn:true,deploymentPackage:'expedition',
  playerFaction:'syndicate',playerCommanderId:'syn_nyx',aiFactionSel:'random',
  goalSel:'survival',timeLimit:120,resPace:2,crateRate:3,crateRateBase:3,wcChoice:2,
  playerStartZone:'nw',spawnPick:'ai0',matchSetupArmed:true,
  carrier:{active:false,phase:2,alt:0,clearance:0},
  orderMove(){offlineOrders++;},newSkirmish(){boots++;C.cam.x=100;C.cam.y=100;
    C.AI.bases=[{slot:5,x:700,y:700}];C.AI.allies=[];C.carrier.active=true;},
  deployCarrier(){deploys++;C.carrier.active=false;},
  hideFrontScreens(){frontHides++;},applyTheme(){themes++;},mfFlowLayout(){layouts++;},
  addEventListener(name,fn){listeners.set(name,fn);},
  dispatchEvent(event){if(event.type==='massfront-match:protocolError')abortCode=event.detail.code;return true;},
  CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
  MFSocialUI:{state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}}};
C.window=C;
let runtime={state:'idle',seat:1,started:false,ended:false};
C.MFMatchRuntime={registerConsumer(){return true;},status(){return {...runtime};},
  submitCommands(){throw new Error('closed session submitted an order');},
  bootstrapReady(hash){assert.equal(hash,'d'.repeat(64));readies++;return Promise.resolve(true);},
  close(){closed++;runtime={...runtime,state:'closed',ended:true};}};
vm.createContext(C);vm.runInContext(source,C);
const fire=(name,detail)=>listeners.get('massfront-match:'+name)({type:'massfront-match:'+name,detail});
async function start(seat=1){
  fire('welcome',{tick:0,seat,resumed:false,matchId:'probe',compatibility:{rulesHash:'rules'}});
  runtime={state:'preparing',seat,started:false,ended:false};
  fire('prepare',{tick:0,seats:[1,2],setup,setupHash:'d'.repeat(64)});
  await new Promise(resolve=>setTimeout(resolve,0));
  runtime={state:'running',seat,started:true,ended:false};
  fire('start',{tick:0,seats:[1,2]});
  await new Promise(resolve=>setTimeout(resolve,0));
}
const A=C.MFMatchCommandConsumer;
assert.equal(A.schemaVersion,1);
await start();
assert.equal(boots,1,'first match bootstraps');
assert.equal(readies,1,'first match agrees its tick-zero setup before start');
assert.equal(deploys,1,'first match lands before tick-zero readiness');
assert.equal(A.sessionActive(),true);
runtime={state:'closed',seat:2,started:true,ended:true};
assert.equal(A.requiresLockstep(),true,'closed transport retains online ownership');
assert.equal(A.canAdvance(1),false,'closed match cannot advance offline');
assert.equal(C.mfLocalTeam(),1,'seat perspective survives a closed transport for results');
C.orderMove(100,100,false,false);
assert.equal(offlineOrders,0,'orders do not fall through to offline handler');
A.leaveSession();
assert.equal(A.sessionActive(),false);
assert.equal(A.requiresLockstep(),false);
assert.equal(C.__MF_NETWORK_SETUP__,null,'explicit exit releases the online profile');
assert.equal(C.curMap,'test','explicit exit restores the prior local setup');
assert.equal(C.mfLocalTeam(),0,'explicit cleanup restores offline perspective');
C.orderMove(100,100,false,false);
assert.equal(offlineOrders,1,'explicit Main Menu cleanup restores offline handler');
await start();
assert.equal(boots,2,'second match bootstraps in the same tab');
assert.equal(readies,2,'second match repeats the prepare barrier');
assert.equal(frontHides,2,'each network launch reveals the battlefield');
assert.equal(themes,2,'each network launch rebuilds its selected terrain');
assert.equal(layouts,2,'each network launch refreshes the gameplay layout');
assert.equal(A.sessionActive(),true);
C.MFMatchRuntime.close();A.leaveSession();
await start(2);
assert.equal(boots,3,'remote seat starts a third match');
assert.equal(readies,3,'remote seat agrees its tick-zero setup');
assert.equal(C.cam.x,700,'remote seat starts over its own base, not team zero');
assert.equal(C.cam.y,700,'remote seat camera uses its own base coordinates');
assert.ok(matrices>0,'remote seat updates the camera matrices');
C.MFMatchRuntime.close();A.leaveSession();
C.MFSocialUI.state.lobby.rules={mode:'skirmish',slots:3,map:'auto'};
fire('welcome',{tick:0,seat:1,resumed:false,matchId:'unsupported',compatibility:{rulesHash:'rules'}});
runtime={state:'preparing',seat:1,started:false,ended:false};
fire('prepare',{tick:0,seats:[1,2,3],setup:{...setup,slots:3},setupHash:'e'.repeat(64)});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(abortCode,'bootstrap_unsupported_setup','unsupported lobby fails visibly');
assert.equal(runtime.state,'closed','unsupported lobby closes transport');
assert.equal(A.sessionActive(),true,'failed bootstrap remains network-owned until menu exit');
assert.equal(boots,3,'unsupported lobby never starts local skirmish');
console.log('PASS online prepare barrier, terminal latch, seat-relative camera, explicit cleanup, repeat-match bootstrap and unsupported-setup abort');
