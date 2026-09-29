import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const hud=readFileSync('src/ui/hud.js','utf8'),intel=readFileSync('src/intel.js','utf8'),
  input=readFileSync('src/ui/input.js','utf8'),icons=readFileSync('src/engine/tacticons.js','utf8');
function method(source,name){
  const found=source.match(new RegExp('function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n\\}'));
  assert.ok(found,name+' source function missing');return found[0];
}
function run(source,names,context,expression){
  vm.createContext(context);
  return vm.runInContext(names.map(name=>method(source,name)).join('\n')+'\n'+expression,context);
}
const fogMethods=['mfFogViewTeam','fogEntityVisible','fogFxVisible'];
for(const localTeam of [0,1]){
  const context={mfLocalTeam:()=>localTeam,fogPointVisible:()=>false};
  const result=run(hud,fogMethods,context,
    '[fogEntityVisible(0,100,100),fogEntityVisible(1,900,900),fogFxVisible(100,100,0),fogFxVisible(900,900,1)]');
  assert.deepEqual([...result],localTeam===0?[true,false,true,false]:[false,true,false,true]);
}
assert.equal(run(hud,fogMethods,{fogPointVisible:()=>false},'mfFogViewTeam()'),0,
  'offline defaults to the original team-0 view');

function fogStamps(localTeam,carrierActive=false){
  const marked=[],FN=2,MAP=1000,gl={TEXTURE_2D:1,RGBA:2,UNSIGNED_BYTE:3,
    bindTexture(){},texSubImage2D(){}};
  const context={mfLocalTeam:()=>localTeam,fogGameplayActive:()=>true,
    prevFogCov:new Uint8Array(FN*FN),fogCov:new Uint8Array(FN*FN),
    fogSources:new Uint8Array(FN*FN),fogSeen:new Uint8Array(FN*FN),fogBuf:new Uint8Array(FN*FN*4),
    FN,MAP,unitHigh:2,ualive:[1,1],uteam:[0,1],ux:[100,900],uy:[100,900],
    utype:[0,0],TYPES:[{air:false}],blds:[
      {alive:true,team:0,x:150,y:150,type:'hq',seen:false},
      {alive:true,team:1,x:850,y:850,type:'fac',seen:false}],
    carrier:{active:carrierActive,x:500,y:500},fogScans:[],stats:{t:0},crates:[],WC:{},
    clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
    markCov:(x,y)=>marked.push([x,y]),covAt:()=>0,addParticle(){},blurFogCov(){},
    fogMiniTick:0,fogImg:{data:{set(){}}},fogCtx:{putImageData(){}},fogTex:{},gl,atlasTex:{}};
  vm.createContext(context);
  vm.runInContext(method(hud,'mfFogViewTeam')+'\n'+method(hud,'updateFog')+'\nupdateFog()',context);
  return marked.map(v=>v.join(','));
}
assert.deepEqual(fogStamps(0,true),['100,100','150,150','500,500']);
assert.deepEqual(fogStamps(1,true),['900,900','850,850'],
  'seat 2 must not borrow team-0 units, buildings or carrier vision');

for(const localTeam of [0,1]){
  const context={mfFogViewTeam:()=>localTeam,fogGameplayActive:()=>true,
    fogRadar:new Uint8Array([1,2]),intelCell:x=>x};
  const cells=run(intel,['intelSensorBit','intelRadarContact'],context,
    '[intelRadarContact(0,0),intelRadarContact(1,0)]');
  assert.deepEqual([...cells],localTeam===0?[true,false]:[false,true]);
  const ghost={mfFogViewTeam:()=>localTeam,intelHasGhost:[1,1],
    intelGhostRefresh(){},intelGhostIdx:[0],ualive:[1],uteam:[1-localTeam],umode:[4],ux:[50],uy:[50],
    intelDetectedAt:()=>false};
  assert.equal(run(intel,['intelGhostCloaked'],ghost,
    `intelGhostCloaked(${1-localTeam},50,50)`),true,'enemy ghost needs detection');
  assert.equal(vm.runInContext(`intelGhostCloaked(${localTeam},50,50)`,ghost),false,
    'own ghost must stay visible');
  ghost.intelDetectedAt=()=>true;
  assert.equal(vm.runInContext(`intelGhostCloaked(${1-localTeam},50,50)`,ghost),false,
    'detected enemy ghost becomes visible');
}

const iconContext={_stkLead:Int32Array.from([0,0,0]),_stkCycle:-1,
  mfIconStackMembers:()=>[0,1,2],ualive:[1,1,1],uteam:[0,0,1],usel:new Uint8Array(3),
  mfLocalOwnsUnit:i=>i===1,clearSel:()=>iconContext.usel.fill(0),toast(){},updateSelInfo(){}};
vm.createContext(iconContext);
vm.runInContext(method(icons,'mfIconStackSelect'),iconContext);
assert.equal(vm.runInContext('mfIconStackSelect(1)',iconContext),true);
assert.deepEqual([...iconContext.usel],[0,1,0],
  'co-op stack selection must exclude the other human seat');
iconContext.mfLocalOwnsUnit=i=>i===2;
iconContext.usel.fill(0);
assert.equal(vm.runInContext('mfIconStackSelect(2)',iconContext),true);
assert.deepEqual([...iconContext.usel],[0,0,1],
  'seat 2 must select its team-1 icon stack');

const pickContext={mfLocalTeam:()=>1,mfLocalOwnsUnit:i=>i===1,
  mfIconStackMembers:lead=>[lead],mfIconStackPick:(x,y,team)=>team,
  mfIconStackOn:()=>false,fogEntityVisible:(team)=>team===1,
  orthoSpan:900,forUnitsIn:(x,y,r,fn)=>{fn(0);fn(1);},
  dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2,ux:[100,100],uy:[100,100],uteam:[0,1]};
assert.deepEqual([...Object.values(run(input,['mfLocalStackMember','pickUnit'],pickContext,
  'pickUnit(100,100)'))],[1,-1],
  'seat 2 gets its own stack without selecting a fog-hidden enemy');
pickContext.fogEntityVisible=()=>true;
assert.deepEqual([...Object.values(vm.runInContext('pickUnit(100,100)',pickContext))],[1,0]);

assert.match(hud,/const viewTeam=team=>localTeam===1&&team<=1\?1-team:team/,
  'minimap must rebase the two human allegiances for seat 2');

const popContext={POP_PLAYER_SLOT:-1,mfLocalBank:()=>({team:1,slot:3}),
  commanderSlotForBuilding:B=>B.slot,
  populationUsedForCommander:slot=>slot===3?17:2,populationCapForCommander:()=>500};
assert.equal(run(hud,['hudPlayerPop'],popContext,'hudPlayerPop().used'),17,
  'top population reads the local commander bucket');
assert.equal(vm.runInContext('hudPlayerPop({team:1,slot:4}).used',popContext),2,
  'production quote reads its factory commander bucket');
const locks={BT:{nova:{req:'techlab'},techlab:{name:'Tech Lab'}},
  mfFogViewTeam:()=>1,hasBld:(team,type)=>team===1&&type==='techlab'};
assert.equal(run(hud,['mfStructureLockReasons'],locks,
  'mfStructureLockReasons("nova").length'),0,
  'seat 2 structure card must use its team-1 prerequisite');
locks.hasBld=()=>false;
assert.equal(vm.runInContext('mfStructureLockReasons("nova").length',locks),1);
const wallet={POP_PLAYER_SLOT:-1,mfLocalBank:()=>({team:1,slot:0,mass:345,energy:765,massCap:1400,energyCap:6200})};
assert.equal(run(hud,['mfEconomySnapshot'],wallet,'mfEconomySnapshot().mass.stored'),345);
assert.equal(vm.runInContext('mfEconomySnapshot().mass.gross',wallet),null,
  'another seat must not inherit team-0 income rates');

assert.match(hud,/factionDoctrineRoster\(list,B\.type,B\.team\)/,
  'production roster follows the factory faction');
assert.match(hud,/populationCanSpawn\(tIdx,Bb\.team,popSlot\)/,
  'production admission uses factory team and commander slot');
assert.match(hud,/const needLab=!hasBld\(B\.team,'techlab'\)/,
  'Tech 2 button follows the factory team');
assert.match(input,/if\(C&&C\.requiresLockstep\(\)\)\{\s*toast\('NETWORK NOVA STRIKE UNAVAILABLE/,
  'network Nova order must not fall through to local-only mutation');
const plans={window:{MFMatchCommandConsumer:{requiresLockstep:()=>true}},armPatrol:true,armQueue:true,
  cancels:[],begins:[],notices:[],toast(message){plans.notices.push(message)},sfx(){},
  cancelPatrolDraft(){plans.cancels.push('patrol');plans.armPatrol=false},
  cancelQueueDraft(){plans.cancels.push('queue');plans.armQueue=false},
  beginPatrolDraft(){plans.begins.push('patrol')},beginQueueDraft(){plans.begins.push('queue')}};
vm.createContext(plans);
vm.runInContext(['mfNetworkPlanBlocked','togglePatrolPlanner','commitPatrolDraft',
  'toggleQueuePlanner','commitQueueDraft'].map(name=>method(input,name)).join('\n'),plans);
vm.runInContext('togglePatrolPlanner();toggleQueuePlanner();commitPatrolDraft();commitQueueDraft()',plans);
assert.deepEqual(plans.begins,[],'network planners must not begin local-only plans');
assert.deepEqual(plans.cancels,['patrol','queue','patrol','queue'],
  'reconnect-latched planners must discard stale drafts before local mutation');
assert.equal(plans.notices.length,4,'blocked planners explain why the control is unavailable');
plans.window.MFMatchCommandConsumer.requiresLockstep=()=>false;
vm.runInContext('togglePatrolPlanner();toggleQueuePlanner()',plans);
assert.deepEqual(plans.begins,['patrol','queue'],'offline planner paths remain available');
console.log('Multiplayer seat visibility: PASS (fog, radar, ghost, selection, production HUD, wallet, local-order gates)');
