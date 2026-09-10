import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// Real UI handlers -> real client submit/validation -> real command consumer.
// The DOM, socket, server seat attachment, wallets and world are explicit Node
// fixtures. This does NOT assert authenticated/live-Worker or browser acceptance.
const paths=['src/main.js','src/ui/input.js','src/ui/hud.js','src/game/matchconsumer.js',
  'src/socialui.js','src/game/sim.js','cloudflare/massfront-auth/src/index.js','src/ui/render3d.js','src/game/statehash.js'];
const sources=Object.fromEntries(paths.map(p=>[p,readFileSync(new URL('../'+p,import.meta.url),'utf8')]));
const between=(source,a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
  assert(start>=0&&end>start,`source seam ${a}`);return source.slice(start,end);};
const main=sources[paths[0]],input=sources[paths[1]],hud=sources[paths[2]],social=sources[paths[4]],sim=sources[paths[5]];
const binding=id=>{const begin=main.indexOf(`mfBindNativePress($('${id}'),()=>{`),end=main.indexOf('\n  });',begin);
  assert(begin>=0&&end>begin,`real ${id} binding`);return main.slice(begin,end+6);};
const rally=between(input,'  // rally flag placement','  // pre-deployment:');
const repeatPaint=between(hud,'function mfRenderProductionRepeatControl(B){','function queueStacks(q){');
const queueRefresh=between(hud,'function renderQueue(forceControls){',"  const el=$('prodQueue');")+'}\n';
const queueCap=Number(hud.match(/const MF_PRODUCTION_QUEUE_CAP=(\d+);/)?.[1]);assert.equal(queueCap,30);
const cancelHelper=between(hud,'function cancelQueuedUnit(B,start,snapshot){','function renderQueue(forceControls){');
const cancelPress=between(hud,'        const requestCancel=ev=>{','        mfHudBindQueueCancel(plate,requestCancel);');
const cancelCapture=hud.match(/const cancelSnapshot=\{revision:B.queueRevision\|\|0,queue:q.slice\(\)\};/);assert(cancelCapture);
const hash=sources[paths[8]],buildingFields=hash.match(/const bf=\[([^\n]+)\];/)?.[1];assert(buildingFields);
const markerLoop=between(sources[paths[7]],'    /* RALLY FLAGS.', '      const R2=Bd.rally;'),
  markerGate=markerLoop.match(/if\(([^\n]+)\)continue;/);
assert(markerGate,'real rally marker ownership gate');
const protocol=between(social,"  const MR_PROTOCOL=",'  function createMatchRuntime(){');
const submit=between(social,'    function submitCommands(commands,delay){','    function unregisterConsumer(value){');
const send=between(social,'    function socketReady(){','    async function runtimeTuple(){');
const serverSafe=between(sources[paths[6]],'  _commandSafe(command){','  _strike(ws,seat,code,seq){');
const serverValidate=vm.runInNewContext(`({${serverSafe}})._commandSafe`,{TextEncoder,MATCH_MAX_COMMAND_BYTES:2048});
const productionHelpers=between(sim,'function mfProductionDuration(T)','function mfBuildingActivity(')+
  between(sim,'function mfFactoryRallyGoal(B,T,spawnX,spawnY)','function bldTick(');
const branchStart=sim.indexOf('if(B.queue.length){',sim.indexOf("else if(B.type==='fac'||B.type==='tgate'")),
  branchEnd="} else {B.prodT=0;B.prodStalled='';}";
assert(branchStart>=0);const branch=sim.slice(branchStart,sim.indexOf(branchEnd,branchStart)+branchEnd.length).replaceAll('continue;','return;');
const clone=x=>JSON.parse(JSON.stringify(x)),checks=[];
const test=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
function fixture({seat=1,mode='skirmish',network=true}={}){
  const nodes=new Map(),listeners=new Map();
  const C={console,TextEncoder,Math,POP_PLAYER_SLOT:-1,MAXU:100,MAP:1000,matchLive:true,unitHigh:0,
    AI:{allies:mode==='coop'?[{slot:2}]:[],bases:[{slot:5}]},
    blds:[],TYPES:[{name:'ground fixture',bt:6,cm:60,ce:240,air:0,naval:0},{name:'second fixture',bt:4,cm:40,ce:120,air:0,naval:0}],BT:{fac:{size:20}},
    commanderSlotForBuilding:B=>B.slot,MF_PRODUCTION_QUEUE_CAP:queueCap,
    state:network?'running':'idle',started:network,ended:false,seat,expected:{buildVersion:'1.33.74'},
    seq:0,tick:0,pending:new Map(),consumer:null,frames:[],toasts:[],particles:[],
    MFSocialUI:{state:{lobby:{rules:{mode,slots:2,map:'auto'}}}},
    addEventListener:(name,fn)=>listeners.set(name,fn),emit(){},render(){},
    toast:s=>C.toasts.push(s),sfx(){},closeMenus(){},addParticle:(...args)=>C.particles.push(args),
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),battlefieldClampPoint:(x,y)=>[x,y],
    playerBuildMult:1,aiBuildMult:1,perfScale:0,resM:[1000,1000],resE:[1000,1000],
    factionDoctrineBuildSpeedMul:()=>1,fortOf:()=>({prod:1}),factionDoctrineUnitCost:T=>({m:T.cm,e:T.ce}),
    populationCanSpawn:()=>true,payments:[],payStream:(team,m,e,slot)=>{C.payments.push({team,m,e,slot});return true;},
    refunds:[],credit:(team,m,e,slot)=>C.refunds.push({team,m,e,slot}),intelUnitName:t=>'Fixture '+t,
    spawnUnit:(t,team,x,y,slot)=>{const i=C.unitHigh++;C.ux[i]=x;C.uy[i]=y;C.spawned.push({t,team,slot});return i;},spawned:[],
    mfSimRange:(a,b)=>(a+b)/2,rr:(a,b)=>(a+b)/2,dist2:(a,b,c,d)=>(a-c)**2+(b-d)**2,
    findLand:(x,y)=>[x,y],findWater:(x,y)=>[x,y],fields:[],requestField:(...p)=>{C.fields.push(p);return 7;},
    mfNavUnitClearance:()=>0,mfBuildingWorkFx(){},ustate:[],ux:[],uy:[],utx:[],uty:[],ufield:[],
    ugen:[],uteam:[],uCmd:[],ualive:[],utype:[],openBld:0,armRally:-1,
    mfBindNativePress:(node,fn)=>node.press=fn,openBldGone:()=>false,
    mfRenderBuildingActivityControls(){},mfRenderBuildingServiceControls(){},mfRenderBuildingUpgradeControls(){},
    $:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',attrs:{},on:false,style:{display:'block'},
      classList:{toggle:(name,on)=>nodes.get(id).on=on},setAttribute:(key,value)=>nodes.get(id).attrs[key]=value});return nodes.get(id);}};
  C.window=C;
  C.socket={readyState:1,send:raw=>{const frame=JSON.parse(raw);assert(frame.commands.every(serverValidate),'real server bounded schema accepts frame');C.frames.push(frame);}};
  vm.createContext(C);vm.runInContext(protocol+send+submit,C);
  C.MFMatchRuntime={status:()=>({state:C.state,seat:C.seat,started:C.started,ended:C.ended}),
    submitCommands:C.submitCommands,registerConsumer:C.registerConsumer};
  C.mfMatchConsumer=()=>C.MFMatchCommandConsumer;
  vm.runInContext(sources[paths[3]],C);
  assert.equal(C.consumer,C.MFMatchCommandConsumer,'real transport registration');
  vm.runInContext(binding('repeatBtn')+binding('rallyBtn')+`\nfunction tapRally(wx,wy){${rally}}\n`+repeatPaint+queueRefresh+cancelHelper+
    `function cancelButton(S){const B=blds[openBld],q=B.queue,plate={setAttribute(){}};${cancelCapture[0]}${cancelPress}return requestCancel;}\n`+
    hash.slice(0,hash.indexOf('function MF_SH_snapshot(){'))+
    `function buildingBytes(){const w=MF_SH_writer(),bf=[${buildingFields}];MF_SH_named(w,'buildings',blds.map((b,i)=>[i,MF_SH_fields(b,bf)]));return Array.from(w.finish());}\n`+
    `function markerVisible(Bd){return !(${markerGate[1]});}\n`+
    productionHelpers+`\nfunction finishProduction(B,dt=1){const b=0;${branch}}`,C);
  for(const extra of [{},{team:1,slot:5},{slot:2},{type:'pgen'},{alive:false},{prog:.5}])
    C.blds.push({alive:true,type:'fac',team:0,slot:-1,prog:1,tier:1,queue:[0,0],prodT:5.999,prodStalled:'',
      repeat:false,x:100,y:100,r:20,adj:0,tractorT:0,rally:{x:250,y:250},...extra});
  C.snapshot=()=>JSON.stringify({blds:C.blds,spawned:C.spawned,fields:C.fields,payments:C.payments,refunds:C.refunds,utx:C.utx,uty:C.uty});
  C.pressRepeat=(id=0)=>{C.openBld=id;C.$('repeatBtn').press();};
  C.paintRepeat=C.mfRenderProductionRepeatControl;
  C.placeRally=(id,x,y)=>{C.openBld=id;C.$('rallyBtn').press();C.tapRally(x,y);};
  C.armCancel=(id=0,start=0)=>{C.openBld=id;const B=C.blds[id],fn=C.cancelButton({i:start,t:B.queue[start],n:1});
    return ()=>fn({stopPropagation(){}});};
  C.pressCancel=(id=0,start=0)=>{const press=C.armCancel(id,start);press();press();return press;};
  C.rows=()=>C.frames.map(F=>({seat:C.seat,seq:F.seq,commands:F.commands}));
  C.welcome=detail=>listeners.get('massfront-match:welcome')({type:'massfront-match:welcome',detail});
  return C;
}
async function commit(C,tick,rows=[]){
  const A=C.MFMatchCommandConsumer,p=clone({tick,commands:rows}),before=C.snapshot(),promise=A.enqueueTick(p);
  assert.equal(C.snapshot(),before,'arrival cannot mutate simulation');
  assert(A.canAdvance(tick));assert(A.beginTick(tick));assert(A.commitTick(tick));assert(await promise);
  C.tick=tick;return p;
}
async function deliver(peers,rows,target=8){
  for(const C of peers)for(let tick=C.MFMatchCommandConsumer.lastAppliedTick()+1;tick<=target;tick++)await commit(C,tick,tick===target?rows:[]);
}
const repeat=(id,active=true,type='fac')=>({type:'repeat',building:{id,type},active}),
  rallyOrder=(id,x=600,y=650,type='fac')=>({type:'rally',building:{id,type},x,y}),
  row=(commands,seat=1,seq=1)=>({seat,seq,commands});

await test('actual repeat UI dispatch waits for fixed tick; ON then OFF is explicit and identical on two peers',async()=>{
  const A=fixture(),B=fixture({seat:2}),before=A.snapshot();
  A.pressRepeat();A.paintRepeat(A.blds[0]);assert.match(A.$('repeatBtn').textContent,/ON.*PENDING/);
  A.pressRepeat();A.paintRepeat(A.blds[0]);assert.match(A.$('repeatBtn').textContent,/OFF.*PENDING/);
  assert.equal(A.snapshot(),before);assert.deepEqual(A.frames.map(F=>F.commands[0].active),[true,false]);
  assert(A.frames.every(F=>F.targetTick===8));await deliver([A,B],A.rows());
  assert.equal(A.snapshot(),B.snapshot());assert.equal(A.blds[0].repeat,false);assert.deepEqual(A.blds[0].queue,[0,0]);
  assert.equal(A.blds[0].prodT,5.999);A.renderQueue();assert.equal(A.$('repeatBtn').textContent,'REPEAT: OFF');
  assert.equal(A.$('repeatBtn').attrs['aria-pressed'],'false');
});
await test('OFF keeps existing queue and paid progress, then real production completes once without re-enqueue',async()=>{
  const A=fixture(),B=fixture({seat:2});for(const C of [A,B])C.blds[0].repeat=true;
  A.pressRepeat();await deliver([A,B],A.rows());
  for(const C of [A,B]){assert.equal(C.blds[0].prodT,5.999);C.finishProduction(C.blds[0]);assert.equal(C.spawned.length,1);assert.equal(C.blds[0].queue.length,1);}
  assert.equal(A.snapshot(),B.snapshot());
});
await test('explicit repeated ON or OFF packets are idempotent, not toggles',async()=>{
  const C=fixture();for(const [tick,active] of [[1,true],[2,true],[3,false],[4,false]]){
    await commit(C,tick,[row([repeat(0,active)],1,tick)]);assert.equal(C.blds[0].repeat,active);assert.equal(C.blds[0].queue.length,2);
  }
});
await test('remote opposing seat controls only its factory through actual UI and peer tick dispatch',async()=>{
  const A=fixture(),B=fixture({seat:2});B.pressRepeat(1);B.placeRally(1,611.25,622.75);
  assert.equal(B.frames.length,2);assert.equal(B.blds[1].repeat,false);await deliver([A,B],B.rows());
  assert.equal(A.snapshot(),B.snapshot());assert.equal(A.blds[1].repeat,true);assert.equal(A.blds[0].repeat,false);
  assert.deepEqual(clone(A.blds[1].rally),{x:611,y:623});
  for(const C of [A,B]){C.finishProduction(C.blds[1]);assert.equal(C.utx[0],611);assert.equal(C.uty[0],623);}
  assert.equal(A.snapshot(),B.snapshot());
});
await test('co-op seat slot authorization rejects its teammate even on the same team',async()=>{
  const A=fixture({mode:'coop'}),B=fixture({mode:'coop',seat:2});B.pressRepeat(0);assert.equal(B.frames.length,0);
  assert.equal(B.MFMatchCommandConsumer.submitRepeat(0,true),null);B.pressRepeat(2);B.placeRally(2,700,720);
  await deliver([A,B],B.rows());assert.equal(A.snapshot(),B.snapshot());assert.equal(A.blds[2].repeat,true);assert.equal(A.blds[0].repeat,false);
});
await test('real rally map-tap stores only authoritative marker and production/flowfield use that marker',async()=>{
  const A=fixture(),B=fixture({seat:2}),before=A.snapshot();A.placeRally(0,612.4,744.6);
  assert.equal(A.snapshot(),before);assert.equal(A.armRally,-1);await deliver([A,B],A.rows());
  for(const C of [A,B]){C.finishProduction(C.blds[0]);assert.equal(C.utx[0],612);assert.equal(C.uty[0],745);assert.deepEqual(C.fields,[[612,745,false,0]]);}
  assert.equal(A.snapshot(),B.snapshot());
});
await test('all seats apply identical battlefield clamping before chassis terrain projection',async()=>{
  const A=fixture(),B=fixture({seat:2});for(const C of [A,B]){C.battlefieldClampPoint=(x,y)=>[Math.max(24,x),Math.min(976,y)];C.findLand=(x,y)=>[x+2,y-3];}
  A.placeRally(0,0,1000);await deliver([A,B],A.rows());
  for(const C of [A,B]){assert.deepEqual(clone(C.blds[0].rally),{x:24,y:976});C.finishProduction(C.blds[0]);assert.equal(C.utx[0],26);assert.equal(C.uty[0],973);}
  assert.equal(A.snapshot(),B.snapshot());
});
await test('all four producer types accept repeat/rally without changing queues',async()=>{
  for(const type of ['fac','tgate','harbor','airfield']){const C=fixture();C.blds[0].type=type;
    await commit(C,1,[row([repeat(0,true,type),rallyOrder(0,500,510,type)])]);assert(C.blds[0].repeat);assert.equal(C.blds[0].queue.length,2);}
});
await test('real renderer marker gate shows only each local seat marker, including co-op slots',()=>{
  for(const mode of ['skirmish','coop'])for(const seat of [1,2]){
    const C=fixture({mode,seat}),own=seat===1?0:mode==='coop'?2:1;
    for(const id of [0,1,2,4])assert.equal(C.markerVisible(C.blds[id]),id===own,`${mode} seat ${seat} marker ${id}`);
  }
});
await test('AI without a marker preserves team-directed fallback and invalid saved marker cannot poison spawn goals',()=>{
  for(const marker of [null,{x:NaN,y:2}]){const C=fixture();C.blds[1].rally=marker;C.finishProduction(C.blds[1]);
    assert.equal(C.utx[0],20);assert.equal(C.uty[0],20);}
});
await test('malformed, nonfactory, unfinished, dead, stale-type, foreign and extra-field commands reject atomically',async()=>{
  const invalid=[repeat(0,1),{...repeat(0),toggle:true},repeat(0,true,'harbor'),repeat(1),repeat(2),repeat(3,true,'pgen'),repeat(4),repeat(5),
    repeat(99),{...repeat(0),building:{id:0,type:'fac',slot:-1}},rallyOrder(0,-1,10),rallyOrder(0,1001,10),rallyOrder(0,1.5,10),
    rallyOrder(0,NaN,10),rallyOrder(0,Infinity,10),{...rallyOrder(0),active:true},rallyOrder(1),rallyOrder(2)];
  for(const cmd of invalid){const C=fixture(),before=C.snapshot();
    assert.equal(await C.MFMatchCommandConsumer.enqueueTick({tick:1,commands:[row([repeat(0),cmd])]}),false,JSON.stringify(cmd));assert.equal(C.snapshot(),before);}
});
await test('missing commander authority or invalid projected coordinates fail closed',async()=>{
  for(const kind of ['authority','projection']){const C=fixture(),before=C.snapshot();
    if(kind==='authority')C.commanderSlotForBuilding=undefined;else C.battlefieldClampPoint=()=>[NaN,2];
    assert.equal(await C.MFMatchCommandConsumer.applyTick({tick:1,commands:[row([rallyOrder(0)])]}),false);assert.equal(C.snapshot(),before);}
});
await test('recycle plus repeat/rally on the same building rejects whole tick before service mutation',async()=>{
  for(const cmd of [repeat(0),rallyOrder(0)]){const C=fixture(),before=C.snapshot();
    C.mfRecycleBuilding=()=>{throw Error('must not execute');};C.bldRecycleMass=()=>0;C.credit=()=>{};
    assert.equal(await C.MFMatchCommandConsumer.applyTick({tick:1,commands:[row([{type:'recycle',building:{id:0,type:'fac'}},cmd])]}),false);assert.equal(C.snapshot(),before);}
});
await test('tick replay is exact/idempotent and altered replay, skipped or late packets cannot mutate',async()=>{
  const C=fixture(),packet=await commit(C,1,[row([repeat(0),rallyOrder(0)])]),before=C.snapshot(),A=C.MFMatchCommandConsumer;
  assert(await A.enqueueTick(packet));assert(await A.applyTick(packet));assert.equal(C.snapshot(),before);
  assert.equal(await A.enqueueTick({tick:1,commands:[row([repeat(0,false)])]}),false);
  assert.equal(await A.enqueueTick({tick:3,commands:[]}),false);assert.equal(C.snapshot(),before);
});
await test('reconnecting/error states and rejected socket sends cannot fall through to local UI mutations',()=>{
  for(const state of ['reconnecting','error','running']){const C=fixture();C.state=state;if(state==='running')C.socket.readyState=3;
    const before=C.snapshot();C.pressRepeat();C.placeRally(0,600,700);assert.equal(C.snapshot(),before);assert.equal(C.frames.length,0);
    assert.equal(C.MFMatchCommandConsumer.repeatIntent(0).pending,false);assert(C.toasts.some(s=>/NETWORK/.test(s)));}
});
await test('resume removes unaccepted repeat intent but preserves an earlier accepted state until replay commits',async()=>{
  const C=fixture();C.pressRepeat();C.pressRepeat();const A=C.MFMatchCommandConsumer;
  C.state='reconnecting';assert(A.resumeState({resumeFromTick:0,replayThroughTick:0,lastSeq:1}));
  assert.equal(A.repeatIntent(0).active,true);assert.equal(A.repeatIntent(0).pending,true);
  C.state='running';await deliver([C],[C.rows()[0]]);assert.equal(C.blds[0].repeat,true);assert.equal(A.repeatIntent(0).pending,false);
});
await test('new match welcome clears pending intent; resumed welcome preserves it',()=>{
  const C=fixture();C.pressRepeat();C.welcome({resumed:true,tick:0});assert(C.MFMatchCommandConsumer.repeatIntent(0).pending);
  C.welcome({resumed:false,tick:0});assert.equal(C.MFMatchCommandConsumer.repeatIntent(0).pending,false);assert.equal(C.blds[0].repeat,false);
});
await test('visible production refresh clears rejected pending intent without reopening the menu',()=>{
  const C=fixture();C.pressRepeat();assert.match(C.$('repeatBtn').textContent,/ON.*PENDING/);
  C.state='reconnecting';assert(C.MFMatchCommandConsumer.resumeState({resumeFromTick:0,replayThroughTick:0,lastSeq:0}));
  C.renderQueue();assert.equal(C.$('repeatBtn').textContent,'REPEAT: OFF');assert.equal(C.$('repeatBtn').attrs['aria-pressed'],'false');
  assert.match(main,/setInterval\(\(\)=>\{\s*if\(openBld<0\|\|!blds\[openBld\]\) return;\s*renderQueue\(\);/,'actual periodic caller refreshes production controls');
});
await test('offline repeat/rally behavior still applies immediately and retains manually queued work',()=>{
  const C=fixture({network:false});C.pressRepeat();assert(C.blds[0].repeat);C.pressRepeat();assert.equal(C.blds[0].repeat,false);
  C.placeRally(0,600.25,700.75);assert.deepEqual(clone(C.blds[0].rally),{x:600.25,y:700.75});
  assert.equal(C.blds[0].queue.length,2);assert.equal(C.blds[0].prodT,5.999);assert.equal(C.frames.length,0);
});
await test('rally selection and delayed placement refuse foreign/dead/nonproducer targets',()=>{
  const C=fixture();for(const id of [1,2,4]){C.placeRally(id,600,700);assert.equal(C.frames.length,0);}
  C.openBld=0;C.$('rallyBtn').press();C.blds[0].alive=false;C.tapRally(600,700);assert.equal(C.frames.length,0);
  C.blds[3].queue=undefined;C.placeRally(3,600,700);assert.equal(C.frames.length,0);
});
await test('real client and server bounded command filters accept new schemas, not arbitrary text or nonfinite data',()=>{
  const C=fixture();for(const cmd of [repeat(0),rallyOrder(0)]){assert(C.mrCommandSafe(cmd));assert(serverValidate(cmd));}
  for(const cmd of [{type:'chat',message:'bad'},rallyOrder(0,Infinity,1)]){assert.equal(C.mrCommandSafe(cmd),false);assert.equal(serverValidate(cmd),false);}
});
await test('actual two-tap cancellation dispatch waits for tick and refunds real accrued head work once on both peers',async()=>{
  const A=fixture(),B=fixture({seat:2});for(const C of [A,B]){C.blds[0].queue=[0,1];C.blds[0].prodT=3;C.finishProduction(C.blds[0]);}
  const work=A.blds[0].prodT,before=A.snapshot(),press=A.armCancel();press();assert.equal(A.frames.length,0);press();
  assert.equal(A.snapshot(),before);assert.equal(A.frames[0].commands[0].type,'cancel_production');await deliver([A,B],A.rows());
  for(const C of [A,B]){assert.deepEqual(C.blds[0].queue,[1]);assert.equal(C.blds[0].prodT,0);assert.equal(C.refunds.length,1);
    assert.deepEqual(C.refunds[0],{team:0,m:60*work/6,e:240*work/6,slot:-1});assert.equal(C.blds[0].queueRevision,1);}
  assert.equal(A.snapshot(),B.snapshot());
});
await test('cancel preserves consecutive-stack-last semantics and never refunds untouched current head',async()=>{
  for(const [queue,start,expected] of [[[0,0,1],0,[0,1]],[[0,1,0,0,1],2,[0,1,0,1]]]){
    const C=fixture();C.blds[0].queue=queue.slice();const progress=C.blds[0].prodT;C.pressCancel(0,start);await deliver([C],C.rows());
    assert.deepEqual(C.blds[0].queue,expected);assert.equal(C.blds[0].prodT,progress);assert.equal(C.refunds.length,0);
  }
});
await test('cancellation refunds only the opposing or co-op seat wallet using that team faction cost',async()=>{
  for(const mode of ['skirmish','coop']){const A=fixture({mode}),B=fixture({mode,seat:2}),id=mode==='coop'?2:1,team=mode==='coop'?0:1,slot=mode==='coop'?2:5;
    for(const C of [A,B]){C.blds[id].queue=[0];C.blds[id].prodT=3;C.factionDoctrineUnitCost=(T,t)=>({m:T.cm*(t+1),e:T.ce*(t+1)});}
    B.pressCancel(id);await deliver([A,B],B.rows());assert.equal(A.snapshot(),B.snapshot());
    assert.deepEqual(A.refunds,[{team,m:30*(team+1),e:120*(team+1),slot}]);
  }
});
await test('duplicate cancel intent, same-tick proposals and replay cannot cancel or refund another unit',async()=>{
  const C=fixture();C.blds[0].queue=[0,1];C.blds[0].prodT=3;C.pressCancel();C.pressCancel();assert.equal(C.frames.length,1);
  const cmd=C.frames[0].commands[0],packet=await commit(C,1,[row([cmd,cmd])]);assert.deepEqual(C.blds[0].queue,[1]);assert.equal(C.refunds.length,1);
  const before=C.snapshot();assert(await C.MFMatchCommandConsumer.enqueueTick(packet));assert.equal(C.snapshot(),before);
  await commit(C,2,[row([cmd],1,2)]);assert.equal(C.snapshot(),before);
});
await test('real repeat completion recreates same visible queue but stale cancellation cannot remove its replacement',async()=>{
  const A=fixture(),B=fixture({seat:2});for(const C of [A,B]){C.blds[0].queue=[0];C.blds[0].repeat=true;}
  A.pressCancel();for(const C of [A,B]){C.finishProduction(C.blds[0]);assert.deepEqual(C.blds[0].queue,[0]);assert.equal(C.blds[0].queueRevision,1);}
  await deliver([A,B],A.rows());assert.equal(A.snapshot(),B.snapshot());assert.deepEqual(A.blds[0].queue,[0]);assert.equal(A.refunds.length,0);
  assert(A.toasts.some(s=>s.startsWith('Queue changed')));A.pressCancel();assert.equal(A.frames.length,2);
  await deliver([A,B],[A.rows()[1]],16);assert.equal(A.snapshot(),B.snapshot());assert.deepEqual(A.blds[0].queue,[]);
});
await test('interleaved production and stale two-tap plate cancellation no-op without poisoning lockstep',async()=>{
  const C=fixture(),press=C.armCancel();press();await commit(C,1,[row([{type:'produce',building:{id:0,type:'fac'},unit:1,count:1}])]);
  assert.equal(C.blds[0].queueRevision,1);press();const snapshot=C.snapshot();await deliver([C],C.rows(),9);assert.equal(C.snapshot(),snapshot);
  const cmd=C.frames[0].commands[0];assert.equal(cmd.revision,0);assert.deepEqual(cmd.queue,[0,0]);
});
await test('cancel exact schema validates cap 30, ownership, integer revision, unit and snapshot before mutation',async()=>{
  const base={type:'cancel_production',building:{id:0,type:'fac'},start:0,unit:0,revision:0,queue:[0,0]};
  const invalid=[{...base,revision:-1},{...base,revision:.5},{...base,revision:1e9+1},{...base,start:-1},{...base,start:2},
    {...base,unit:1},{...base,queue:[]},{...base,queue:Array(31).fill(0)},{...base,queue:[999]},
    {...base,debug:true},{...base,building:{id:1,type:'fac'}},{...base,building:{id:2,type:'fac'}},
    {...base,building:{id:3,type:'pgen'}},{...base,building:{id:4,type:'fac'}},{...base,building:{id:5,type:'fac'}}];
  for(const cmd of invalid){const C=fixture(),before=C.snapshot();assert.equal(await C.MFMatchCommandConsumer.enqueueTick({tick:1,commands:[row([repeat(0),cmd])]}),false);assert.equal(C.snapshot(),before);}
  const C=fixture();C.blds[0].queue=Array(queueCap).fill(0);C.pressCancel();await deliver([C],C.rows());assert.equal(C.blds[0].queue.length,29);
});
await test('cancellation transport failure and reconnect never mutate locally; unaccepted receipt can be retried',async()=>{
  for(const state of ['reconnecting','error','running']){const C=fixture();C.state=state;if(state==='running')C.socket.readyState=3;
    const before=C.snapshot();C.pressCancel();assert.equal(C.snapshot(),before);assert.equal(C.frames.length,0);}
  const C=fixture();C.pressCancel();C.state='reconnecting';assert(C.MFMatchCommandConsumer.resumeState({resumeFromTick:0,replayThroughTick:0,lastSeq:0}));
  C.state='running';C.pressCancel();assert.equal(C.frames.length,2);await deliver([C],[C.rows()[1]]);assert.equal(C.blds[0].queue.length,1);
});
await test('accepted pending cancellation and queue revision survive resumed welcome/replay',async()=>{
  const C=fixture();C.blds[0].queueRevision=7;C.pressCancel();C.welcome({resumed:true,tick:0});C.state='reconnecting';
  assert(C.MFMatchCommandConsumer.resumeState({resumeFromTick:0,replayThroughTick:0,lastSeq:1}));C.state='running';C.pressCancel();assert.equal(C.frames.length,1);
  await deliver([C],C.rows());assert.equal(C.blds[0].queueRevision,8);C.pressCancel();assert.equal(C.frames.length,2);
});
await test('legacy absent revision starts at zero and actual canonical building hash detects revision-only changes',()=>{
  const C=fixture();assert.equal(C.blds[0].queueRevision,undefined);C.pressCancel();assert.equal(C.frames[0].commands[0].revision,0);
  C.blds[0].queueRevision=0;const a=C.buildingBytes();C.blds[0].queueRevision=1;assert.notDeepEqual(C.buildingBytes(),a);
  assert.match(sim,/queue:\[\],queueRevision:0/,'new buildings start at revision zero');
});
await test('ordinary offline cancel behavior remains immediate with a single correct paid-head refund',()=>{
  const C=fixture({network:false});C.blds[0].queue=[0,1];C.blds[0].prodT=3;C.pressCancel();
  assert.deepEqual(C.blds[0].queue,[1]);assert.deepEqual(C.refunds,[{team:0,m:30,e:120,slot:-1}]);assert.equal(C.blds[0].queueRevision,1);assert.equal(C.frames.length,0);
});
console.log(JSON.stringify({status:'PASS',checks:checks.length,realUIConsumerDispatch:true,realClientSubmit:true,
  realServerCommandFilter:true,mockSocketAndWorld:true,liveWorkerAcceptance:false,browserAcceptance:false,
  sourceHashes:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(sources[p]).digest('hex')]))},null,2));
