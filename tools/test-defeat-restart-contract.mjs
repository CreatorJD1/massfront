#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const departure=readFileSync(new URL('../src/departure.js',import.meta.url),'utf8');
function fn(source,name){
  const hit=source.match(new RegExp('^function '+name+'\\([^]*?^}','m'));
  assert.ok(hit,'missing '+name);return hit[0];
}
const program='let mfResultPresentationEpoch=0,mfLastResultCanRestart=false;\n'
  +fn(main,'endGame')+'\n'+fn(main,'restartCurrentBattle')+'\n'
  +fn(departure,'mfVictoryPaintButtons')+'\n'+fn(departure,'mfVictoryContinue');

function scenario({online=false,bridge=false,weekly=false,campaign=false,training=false,win=false,next=false}={}){
  const elements=new Map(),calls={fresh:0,session:0,ad:0,input:0,loader:0,theme:0,layout:0,reward:0,continue:0};
  const element=id=>{
    if(!elements.has(id))elements.set(id,{style:{display:''},dataset:{},disabled:false,textContent:'',innerHTML:'',querySelector:()=>null});
    return elements.get(id);
  };
  const cont=element('goContinueBtn'),menu=element('restartBtn');
  cont.dataset.action='continue';cont.style.display='';
  const B={cont,menu,foot:element('goFoot')};
  const window={__MF_NETWORK_SETUP__:online?{schema:1}:null,
    __MF_GALACTIC_BRIDGE:bridge?{active:true,isolation:{active:true}}:null,
    MFMatchCommandConsumer:{sessionActive:()=>online,seatAuthority:()=>({team:0})},
    MFMatchRuntime:{status:()=>({seat:1}),close:()=>{}}};
  window.parent=window;
  const ctx=createContext({window,MFMatchRuntime:window.MFMatchRuntime,$:element,document:{getElementById:element},
    gameEnded:false,demoMode:false,activeWarMode:'standard',weeklyMode:weekly,
    storyCampaignActiveId:campaign?'mission':'',trainingMissionActive:()=>training,
    running:true,paused:false,matchLive:true,mfDepart:{fromVictory:false},
    stats:{t:90,kills:[2,1],built:[1,0],nests:0,reclaimed:0},resM:[0,0],resE:[0,0],
    curMap:'aelos_site',curTheme:'aelos',playerFaction:'nova',playerCommanderId:'nova_kai',
    difficulty:1,heroLvl:1,goalDef:()=>({nm:'Annihilation'}),
    metaGrant:()=>{calls.reward++;return null;},developRecord:()=>null,endgameRecord:()=>null,
    commanderCue:()=>{},commanderDialogueDrain:()=>{},drawMatchChart:()=>{},
    adShowPostMatchAd:()=>{},sfx:()=>{},setTimeout:callback=>{callback();return 1;},
    mfVictoryEnsureBtns:()=>B,mfVictoryHasNext:()=>next,
    continueToNextMap:()=>{calls.continue++;},
    sessClear:()=>{calls.session++;},adClearPostMatchAd:()=>{calls.ad++;},
    resetInputState:()=>{calls.input++;},closeMenus:()=>{},cancelPlace:()=>{},hideFrontScreens:()=>{},
    mfLoadScreenFill:()=>{calls.loader++;},requestAnimationFrame:callback=>{callback();return 1;},
    applyTheme:()=>{calls.theme++;},newSkirmish:()=>{calls.fresh++;ctx.gameEnded=false;},
    stopAttract:()=>{},mfFlowLayout:()=>{calls.layout++;}});
  runInContext(program,ctx);
  runInContext(`endGame(${win},'Commander destroyed')`,ctx);
  runInContext(`mfVictoryPaintButtons(${win})`,ctx);
  return {ctx,cont,menu,calls,element};
}

const loss=scenario();
assert.equal(loss.calls.reward,1,'offline loss still records its existing reward once');
assert.equal(loss.cont.dataset.action,'restart','loss offers an actual retry');
assert.equal(loss.cont.disabled,false);
assert.match(loss.cont.textContent,/RESTART BATTLE/);
assert.equal(loss.menu.textContent,'←  RETURN TO MENU');
assert.equal(runInContext('mfVictoryContinue()',loss.ctx),false,'defeat cannot take stale next-map action');
assert.equal(loss.calls.continue,0);
assert.equal(runInContext('restartCurrentBattle()',loss.ctx),true);
assert.equal(loss.calls.fresh,1,'same-match setup starts once');
assert.equal(loss.calls.session,1,'old recovery snapshot cleared');
assert.equal(loss.calls.ad,1,'postmatch card cleared');
assert.equal(loss.calls.loader,1);
assert.equal(loss.element('gameOver').style.display,'none');
assert.equal(loss.element('loadScr').style.display,'none');
assert.equal(runInContext('curMap+":"+playerFaction+":"+playerCommanderId',loss.ctx),'aelos_site:nova:nova_kai');
assert.equal(runInContext('restartCurrentBattle()',loss.ctx),false,'a second tap cannot restart again');

for(const mode of [{bridge:true},{online:true},{weekly:true},{campaign:true},{training:true}]){
  const result=scenario(mode);
  assert.equal(result.cont.dataset.action,'',JSON.stringify(mode)+' must not expose local retry');
  assert.equal(result.cont.disabled,true);
  assert.equal(runInContext('restartCurrentBattle()',result.ctx),false);
  assert.equal(result.calls.fresh,0);
  if(mode.bridge)assert.equal(result.menu.textContent,'←  RETURN TO NEXUS-VII');
}
const victory=scenario({win:true,next:true});
assert.equal(victory.cont.dataset.action,'continue');
assert.match(victory.cont.textContent,/NEXT BATTLE/);
assert.equal(runInContext('restartCurrentBattle()',victory.ctx),false);
assert.equal(runInContext('mfVictoryContinue()',victory.ctx),true);
assert.equal(victory.calls.continue,1);

assert.match(main,/goCont\.dataset\.action==='restart'\) restartCurrentBattle\(\)/,
  'live result-button binding must dispatch retry, not the old victory continuation');
console.log('PASS defeat restart contract: same setup, one attempt, no stale Continue, protected UGA/online/authored routes');
