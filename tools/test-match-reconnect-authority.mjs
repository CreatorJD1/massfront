import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {MatchRoom} from '../cloudflare/massfront-auth/src/index.js';

const root=resolve(import.meta.dirname,'..'),consumerSource=readFileSync(resolve(root,'src/game/matchconsumer.js'),'utf8');

function consumerHarness(){
  const listeners=new Map(),runtime={state:'running',seat:1,tick:0,started:true,ended:false},submitted=[];
  const C={console,window:null,matchLive:true,MAXU:4,MAP:1000,POP_PLAYER_SLOT:-1,unitHigh:0,
    ualive:new Uint8Array(4),ugen:new Int32Array(4),uteam:new Int8Array(4),uCmd:new Int8Array(4),utype:new Int8Array(4),
    TYPES:[],BT:{pgen:{name:'Power Generator'}},AI:{allies:[],bases:[{slot:5}]},
    blds:[{alive:true,type:'pgen',team:0,slot:-1,prog:1,lvl:1,upT:0,upMax:1}],paid:0,
    MFSocialUI:{state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}},
    addEventListener:(name,fn)=>listeners.set(name,fn),queueMicrotask,
    commanderSlotForBuilding:B=>B.slot,
    canAfford:()=>true,
    mfBuildingUpgradeBatchInfo:()=>({canUpgradeSelected:true,canUpgradeAll:true,indices:[0],costM:80,costE:0,totalCostM:80,totalCostE:0}),
    mfBuildingUpgradeQuote:()=>({duration:10}),pay:()=>{C.paid++},
  };
  C.window=C;C.MFMatchRuntime={
    registerConsumer:v=>(C.consumer=v,true),status:()=>({...runtime}),
    submitCommands:commands=>{const receipt={seq:submitted.length+1,targetTick:5,count:commands.length};submitted.push({commands,receipt});return receipt;},
  };
  vm.createContext(C);vm.runInContext(consumerSource,C,{filename:'src/game/matchconsumer.js'});
  const welcome=detail=>listeners.get('massfront-match:welcome')({type:'massfront-match:welcome',detail});
  return {C,runtime,submitted,welcome};
}

async function commit(C,packet){
  const accepted=C.consumer.enqueueTick(packet);
  assert.equal(C.consumer.canAdvance(packet.tick),true);
  assert.equal(C.consumer.beginTick(packet.tick),true);
  assert.equal(C.consumer.commitTick(packet.tick),true);
  assert.equal(await accepted,true);
}

async function pausedServerTick(){
  const storage={sql:{exec(){}},get:async()=>null,put:async()=>{},setAlarm:async()=>{}},state={storage,
    blockConcurrencyWhile(fn){this.ready=Promise.resolve().then(fn)},getWebSockets:()=>[]};
  const room=new MatchRoom(state,{});await state.ready;
  room.started=true;room.ended=false;room.tick=1;room.nextTickAt=Date.now()-1;room._startTimer=()=>{};
  room.seats.set(1,{seat:1,connected:false,syncing:false,forfeited:false,disconnectDeadline:Date.now()+10000});
  room.seats.set(2,{seat:2,connected:true,syncing:false,forfeited:false,disconnectDeadline:null});
  await room._runTicks();return room.tick;
}

assert.equal(await pausedServerTick(),1,'authoritative room must not advance with a live seat missing');

const {C,runtime,submitted,welcome}=consumerHarness();
welcome({tick:0,resumed:false});
await commit(C,{tick:1,commands:[]});
const receipt=C.consumer.submitUpgrade(0,false);
assert.deepEqual(receipt,{seq:1,targetTick:5,count:1});
assert.equal(C.consumer.upgradePending(),true);

runtime.state='reconnecting';runtime.tick=1;
assert.equal(C.consumer.resumeState({resumeFromTick:1,replayThroughTick:5,lastSeq:1}),true);
welcome({tick:5,resumed:true,resumeFromTick:1,replayThroughTick:5,lastSeq:1});
assert.equal(C.consumer.lastAppliedTick(),1,'resumed welcome must not jump authority to server head');
assert.equal(C.consumer.upgradePending(),true,'accepted service receipt survives resumed welcome');

const upgradeRow={seat:1,seq:1,commands:submitted[0].commands};
await commit(C,{tick:2,commands:[]});
const paidBeforeDuplicate=C.paid;
assert.equal(await C.consumer.enqueueTick({tick:2,commands:[]}),true,'exact replay duplicate is idempotent');
assert.equal(C.paid,paidBeforeDuplicate,'duplicate replay cannot reapply gameplay');
assert.equal(await C.consumer.enqueueTick({tick:2,commands:[upgradeRow]}),false,'conflicting duplicate fails closed');
await commit(C,{tick:3,commands:[]});
await commit(C,{tick:4,commands:[]});
await commit(C,{tick:5,commands:[upgradeRow]});
assert.equal(C.consumer.lastAppliedTick(),5);
assert.equal(C.consumer.upgradePending(),false,'accepted service receipt clears only on authoritative target tick');
assert.equal(C.paid,1,'replayed authoritative upgrade applies exactly once');

const queued=C.consumer.enqueueTick({tick:6,commands:[]}),duplicateQueued=C.consumer.enqueueTick({tick:6,commands:[]});
assert.equal(C.consumer.resumeState({resumeFromTick:5,replayThroughTick:6,lastSeq:1}),true);
assert.equal(C.consumer.beginTick(6),true);assert.equal(C.consumer.commitTick(6),true);
assert.equal(await queued,true);assert.equal(await duplicateQueued,true,'same in-flight frame shares one fixed-step commit');

console.log(JSON.stringify({status:'PASS',evidence:{serverHeldAtTick:1,replayedThrough:C.consumer.lastAppliedTick(),
  duplicateUpgradeCharges:C.paid,upgradePending:C.consumer.upgradePending()},
  contract:'missing seats pause authority; resumed frames commit sequentially and exact duplicates never double-apply'}));
