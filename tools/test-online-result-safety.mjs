#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInContext,createContext} from 'node:vm';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const social=readFileSync(new URL('../src/socialui.js',import.meta.url),'utf8');
function fn(name){
  const hit=main.match(new RegExp('^function '+name+'\\([^]*?^}','m'));
  assert.ok(hit,'missing '+name);return hit[0];
}
const eventStart=main.indexOf("window.addEventListener('massfront-match:matchEnd'");
const eventEnd=main.indexOf('// ---------- main loop ----------',eventStart);
assert.ok(eventStart>0&&eventEnd>eventStart,'missing online result listeners');

const elements=new Map(),listeners=new Map(),calls={post:0,grant:0,develop:0,endgame:0,close:0,leave:0,clear:0,ad:0,cue:0,sfx:[],service:0,upgrade:0};
const el=id=>{if(!elements.has(id))elements.set(id,{style:{display:''},dataset:{},textContent:'',innerHTML:'',disabled:false,classList:{remove(){}}});return elements.get(id);};
let online=true,roomState='running',deferredTimers=false;
const timers=[];
const consumer={sessionActive:()=>online,seatAuthority:seat=>seat===2?{seat,team:1,slot:0}:{seat,team:0,slot:-1},
  leaveSession:()=>{calls.leave++;online=false;},buildingRef:id=>({id,type:'fac'}),submitRepair:()=>false,
  submitRecycle:()=>false,lastFailure:()=>''};
const runtime={status:()=>({state:roomState,seat:2,started:true,ended:roomState!=='running'}),close:()=>{calls.close++;roomState='closed';}};
const socialUi={clearFinishedMatch:()=>{calls.clear++;}};
const window={MFMatchCommandConsumer:consumer,MFMatchRuntime:runtime,MFSocialUI:socialUi,MFBuildingService:{setRepair:()=>{calls.service++;return {ok:true};}},
  parent:{postMessage:()=>{calls.post++;}},addEventListener:(name,callback)=>listeners.set(name,callback)};
const reward=()=>({field:{mass:0,energy:0,reclaimed:0},dataParts:[],parts:[],xp:100,cores:10,data:0,mult:1,
  modeContract:{xp:1,nm:'STANDARD'},loot:null,conquest:null,modeReward:null,rankUp:null});
const context=createContext({window,MFMatchRuntime:runtime,MFSocialUI:socialUi,document:{querySelectorAll:()=>[]},$:el,
  stats:{t:90,kills:[3,7],built:[2,5],nests:0,reclaimed:0},demoMode:false,gameEnded:false,running:true,paused:false,matchLive:true,
  resM:[0,0],resE:[0,0],mfResultPresentationEpoch:0,
  heroLvl:4,difficulty:1,curTheme:'verdant',mfDepart:{fromVictory:false},FRONT_SCREEN_IDS:[],openBld:0,
  blds:[{alive:true,type:'fac'}],setTimeout:callback=>{if(deferredTimers)timers.push(callback);else callback();return 1;},goalDef:()=>({nm:'Skirmish'}),
  metaGrant:()=>{calls.grant++;return reward();},developRecord:()=>{calls.develop++;return {mats:{},broke:[]};},
  endgameRecord:()=>{calls.endgame++;return {score:0,msgs:[]};},commanderCue:()=>{calls.cue++;},
  commanderDialogueDrain:()=>{},drawMatchChart:()=>{},adShowPostMatchAd:()=>{calls.ad++;},sfx:name=>{calls.sfx.push(name);},
  mfPauseSetModal:()=>{},audMusicLeaveMatch:()=>{},resetInputState:()=>{},adClearPostMatchAd:()=>{},
  apClose:()=>{},closeMenus:()=>{},cancelPlace:()=>{},showHudDock:()=>{},showFrontScreen:()=>{},
  renderMetaHead:()=>{},setupAttract:()=>{},mfLocalOwnsBuilding:()=>true,
  mfBuildingUpgradeBatchInfo:()=>({canUpgradeSelected:true,canUpgradeAll:true,name:'Factory'}),
  startUpgrade:()=>{calls.upgrade++;return null;},mfStartBuildingUpgradeBatch:()=>{calls.upgrade++;return {ok:true};},
  toast:()=>{},renderProdMenu:()=>{},renderBldPanel:()=>{},console});
runInContext(['mfResolveBattlefieldOutcome','endGame','returnToMainMenu','continueToNextMap',
  'mfRequestBuildingService','mfBuildingUpgradePress'].map(fn).join('\n')+'\n'+main.slice(eventStart,eventEnd),context);

runInContext("mfResolveBattlefieldOutcome(true,'Enemy commanders destroyed')",context);
assert.equal(calls.grant,0);assert.equal(calls.develop,0);assert.equal(calls.endgame,0);
assert.equal(calls.post,0);assert.equal(calls.ad,0);assert.equal(calls.cue,0);assert.deepEqual(calls.sfx,[]);
assert.equal(calls.close,1);assert.equal(context.running,false);assert.equal(context.gameEnded,true);
assert.equal(el('goTitle').textContent,'ONLINE RESULT UNVERIFIED');
assert.match(el('goOutcome').textContent,/NO PROGRESSION REWARD/);
assert.doesNotMatch(el('goOutcome').textContent,/Enemy commanders destroyed/);
assert.match(el('goRewards').innerHTML,/No XP, Cores, loot, or campaign progress/);
assert.match(el('goStats').innerHTML,/SEAT 2/);
assert.match(el('goStats').innerHTML,/\b7\b/);
assert.equal(el('goContinueBtn').disabled,true);

context.gameEnded=false;context.running=true;roomState='running';
listeners.get('massfront-match:matchEnd')({detail:{reason:'forfeit',winnerSeat:2}});
assert.equal(context.running,false);assert.equal(calls.grant,0);assert.match(el('goOutcome').textContent,/Relay ended the match: forfeit/);
context.gameEnded=false;context.running=true;roomState='running';
listeners.get('massfront-match:protocolError')({detail:{code:'state_divergence'}});
assert.equal(context.running,false);assert.equal(calls.grant,0);assert.match(el('goOutcome').textContent,/Match connection failed: state_divergence/);
context.gameEnded=true;roomState='closed';
listeners.get('massfront-match:protocolError')({detail:{code:'bootstrap_unsupported_setup'}});
assert.match(el('goOutcome').textContent,/bootstrap_unsupported_setup/);
assert.equal(calls.grant,0,'bootstrap failure after a prior result cannot grant rewards');

assert.equal(runInContext('mfRequestBuildingService("repair",blds[0],true).code',context),'network-service-unavailable');
assert.equal(calls.service,0,'closed online service must not mutate offline building state');
assert.equal(runInContext('mfBuildingUpgradePress(false).ok',context),false);
assert.equal(calls.upgrade,0,'closed online upgrade must not mutate offline building state');
runInContext('returnToMainMenu()',context);
assert.equal(calls.leave,1,'menu exit releases consumer ownership');
assert.equal(calls.clear,1,'menu exit clears only the spent Social lobby');

online=true;context.gameEnded=false;context.running=true;roomState='running';deferredTimers=true;
el('gameOver').style.display='none';
runInContext("endGame(false,'Local battlefield stopped')",context);
assert.equal(timers.length,1);
runInContext('returnToMainMenu()',context);
for(const callback of timers.splice(0))callback();
assert.equal(el('gameOver').style.display,'none','late result callback cannot reopen over the menu');
deferredTimers=false;

context.gameEnded=false;context.running=true;roomState='idle';
runInContext("endGame(true,'Enemy commanders destroyed')",context);
assert.equal(calls.grant,1,'offline match payout remains enabled');
assert.equal(calls.develop,1);assert.equal(calls.endgame,1);assert.equal(calls.post,1);
assert.equal(calls.ad,1);assert.equal(calls.cue,1);assert.equal(calls.sfx.at(-1),'level');
assert.equal(el('goTitle').textContent,'MISSION COMPLETE');

const closeSource=social.match(/^    function close\(\)\{[^]*?^    \}/m);
assert.ok(closeSource,'missing match runtime close');
const closed=createContext({state:'running',intentional:false,ended:false,resumeToken:'secret',socketSerial:8,
  clearTimers:()=>{},rejectConnect:()=>{},closeSocket:()=>{}});
closed.setState=next=>{closed.state=next;};
runInContext(closeSource[0]+'\nclose()',closed);
assert.equal(closed.socketSerial,9,'intentional close invalidates queued socket callbacks');
assert.equal(closed.resumeToken,'');assert.equal(closed.ended,true);
const fatalSource=social.match(/^    function fatal\(code,closeCode\)\{[^]*?^    \}/m);
assert.ok(fatalSource,'missing match runtime fatal');
const faults={status:0,event:0,close:0,reject:0,code:null};
const fault=createContext({ended:false,state:'running',intentional:false,resumeToken:'secret',socketSerial:3,
  clearTimers:()=>{},setState:()=>{faults.status++;},emit:()=>{faults.event++;},
  rejectConnect:()=>{faults.reject++;},closeSocket:code=>{faults.close++;faults.code=code;}});
runInContext(fatalSource[0]+'\nfatal("tick_order");fatal("tick_order");',fault);
assert.equal(fault.socketSerial,4);assert.equal(faults.status,1);assert.equal(faults.event,1);
assert.equal(faults.reject,1);assert.equal(faults.close,1);assert.equal(faults.code,1002);
console.log('PASS online result safety: no payout, no hosting result, stopped gameplay, guarded services, explicit exit, offline reward preserved');
