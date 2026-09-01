#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';

const root=resolve(import.meta.dirname,'..'),sourcePath=resolve(root,'src','game','matchconsumer.js'),
  out=resolve(root,'audit','stage15-match-consumer'),checks=[];
mkdirSync(out,{recursive:true});
function check(name,ok,detail=''){checks.push({name,ok:!!ok,detail});console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));}
const browser=await launchPwBrowser({ownershipMode:'isolated'});
async function harness(){
  const page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  await page.setContent(`<!doctype html><html><body><script>
    const MAXU=16,MAP=1000,POP_PLAYER_SLOT=-1;let matchLive=true,unitHigh=4;
    const ualive=new Uint8Array(MAXU),ugen=new Int32Array(MAXU),uteam=new Int8Array(MAXU),uCmd=new Int8Array(MAXU),
      utype=new Int8Array(MAXU),ux=new Float64Array(MAXU),uy=new Float64Array(MAXU),utx=new Float64Array(MAXU),uty=new Float64Array(MAXU),
      ustate=new Int8Array(MAXU),utgt=new Int32Array(MAXU),utgtg=new Int32Array(MAXU),uhold=new Uint8Array(MAXU),umarch=new Uint8Array(MAXU),
      ufield=new Int32Array(MAXU),uPatrolRoute=new Int32Array(MAXU),uMoveCohort=new Int32Array(MAXU),uQkind=new Int8Array(MAXU),
      uGuard=new Int32Array(MAXU),uGuardG=new Int32Array(MAXU),uQueue=new Array(MAXU);
    const TYPES=[{r:5},{r:6},{r:4},{r:7}];
    for(let i=0;i<4;i++){ualive[i]=1;ugen[i]=11+i;uteam[i]=i===1||i===3?1:0;uCmd[i]=i===1||i===3?5:-1;utype[i]=i;ux[i]=100+i*100;uy[i]=150+i*60;utx[i]=ux[i];uty[i]=uy[i];utgt[i]=-1;utgtg[i]=-1;uGuard[i]=-1;uGuardG[i]=-1;uPatrolRoute[i]=-1;uMoveCohort[i]=-1;}
    const AI={allies:[],bases:[{slot:5}]};
    const blds=[
      {alive:true,type:'fac',team:0,slot:-1,prog:1,hp:500,hpm:1000,repairOn:false,repairStalled:false},
      {alive:true,type:'pgen',team:1,slot:5,prog:1,hp:300,hpm:700,repairOn:false,repairStalled:false},
      {alive:true,type:'fac',team:0,slot:7,prog:1,hp:400,hpm:900,repairOn:false,repairStalled:false}
    ];
    window.MFSocialUI={state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}};
    window.__registered=null;window.__submitted=[];window.__toasts=[];window.__matchState='running';window.__forceServiceReject='';
    window.MFMatchRuntime={registerConsumer:v=>(window.__registered=v,true),status:()=>({state:__matchState,seat:1}),
      submitCommands:(commands,delay)=>{__submitted.push(JSON.parse(JSON.stringify(commands)));return {seq:__submitted.length,targetTick:9,count:commands.length};}};
    function findLand(x,y){return [x,y]} function findWater(x,y){return [x,y]}
    function battlefieldClampPoint(x,y){return [x,y]} function requestField(x,y,naval,clearance){return Math.round(x*3+y*5+(naval?7:0)+clearance)}
    function mfNavUnitClearance(T){return T.r} function mfAirIssueMission(){}
    function commanderSlotForBuilding(B){return B.slot} function bldRecycleMass(){return 25} function credit(){}
    function toast(s){__toasts.push(String(s))}
    window.MFBuildingService={quote:B=>({eligible:!!(B&&B.alive&&B.prog>=1&&B.hp<B.hpm)})};
    function mfSetBuildingRepair(target,active,authority){
      const B=blds[target];if(__forceServiceReject==='repair'){B.repairOn=false;B.repairStalled=false;return {ok:false,code:'forced-reject'}}
      if(!B||!B.alive||B.team!==authority.team||B.slot!==authority.slot)return {ok:false,code:'not-owned'};
      B.repairOn=active;B.repairStalled=false;return {ok:true,active};
    }
    function mfRecycleBuilding(target,authority){
      const B=blds[target];if(__forceServiceReject==='recycle')return {ok:false,code:'forced-reject'};
      if(!B||!B.alive||B.team!==authority.team||B.slot!==authority.slot)return {ok:false,code:'not-owned'};
      B.alive=false;B.repairOn=false;return {ok:true};
    }
    window.__capture=()=>JSON.stringify({utx:[...utx.slice(0,4)],uty:[...uty.slice(0,4)],state:[...ustate.slice(0,4)],target:[...utgt.slice(0,4)],targetG:[...utgtg.slice(0,4)],hold:[...uhold.slice(0,4)],march:[...umarch.slice(0,4)],field:[...ufield.slice(0,4)],guard:[...uGuard.slice(0,4)],guardG:[...uGuardG.slice(0,4)],blds:blds.map(B=>[B.alive,B.repairOn,B.repairStalled])});
  <\/script></body></html>`);
  await page.addScriptTag({path:sourcePath});
  return page;
}
async function largeHarness(){
  const page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  await page.setContent(`<!doctype html><html><body><script>
    const MAXU=520,MAP=5000,POP_PLAYER_SLOT=-1;let matchLive=true,unitHigh=520,moveMode=0,selFormation=3;
    const ualive=new Uint8Array(MAXU),ugen=new Int32Array(MAXU),uteam=new Int8Array(MAXU),uCmd=new Int8Array(MAXU),
      utype=new Int8Array(MAXU),usel=new Uint8Array(MAXU),ux=new Float64Array(MAXU),uy=new Float64Array(MAXU),
      utx=new Float64Array(MAXU),uty=new Float64Array(MAXU),ustate=new Int8Array(MAXU),utgt=new Int32Array(MAXU),
      utgtg=new Int32Array(MAXU),uhold=new Uint8Array(MAXU),umarch=new Uint8Array(MAXU),ufield=new Int32Array(MAXU),
      uPatrolRoute=new Int32Array(MAXU),uMoveCohort=new Int32Array(MAXU),uQkind=new Int8Array(MAXU),
      uGuard=new Int32Array(MAXU),uGuardG=new Int32Array(MAXU),uQueue=new Array(MAXU);
    const TYPES=[{r:5,size:10,spd:20}];
    for(let i=0;i<MAXU;i++){
      ualive[i]=1;ugen[i]=11+i;uteam[i]=0;uCmd[i]=-1;utype[i]=0;
      ux[i]=500+(i%26)*18;uy[i]=600+((i/26)|0)*18;utx[i]=ux[i];uty[i]=uy[i];
      utgt[i]=-1;utgtg[i]=-1;uGuard[i]=-1;uGuardG[i]=-1;uPatrolRoute[i]=-1;uMoveCohort[i]=-1;
    }
    uteam[519]=1;uCmd[519]=5;
    const AI={allies:[],bases:[{slot:5}]};
    window.MFSocialUI={state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}};
    window.__submitted=[];window.__toasts=[];window.__baseCalls=0;window.__registered=null;
    window.MFMatchRuntime={registerConsumer:v=>(window.__registered=v,true),status:()=>({state:'running',seat:1}),
      submitCommands:(commands,delay)=>{window.__submitted.push(JSON.parse(JSON.stringify(commands)));return {seq:1,targetTick:9,count:commands.length};}};
    function formationMembers(){const out=[];for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i])out.push(i);return out;}
    function orderMove(){window.__baseCalls++;return false;}
    function toast(s){window.__toasts.push(String(s));}
    function findLand(x,y){return [x,y]} function findWater(x,y){return [x,y]}
    function battlefieldClampPoint(x,y){return [x,y]}
    function requestField(x,y,naval,clearance){return Math.round(x*3+y*5+(naval?7:0)+clearance)}
    function mfNavUnitClearance(T){return T.r} function mfAirIssueMission(){}
    window.__select=(n)=>{usel.fill(0);for(let i=0;i<n;i++)usel[i]=1;};
    window.__captureLarge=()=>JSON.stringify({x:[...utx.slice(0,500)],y:[...uty.slice(0,500)],state:[...ustate.slice(0,500)]});
    window.__resetLarge=()=>{for(let i=0;i<500;i++){ustate[i]=0;utx[i]=ux[i];uty[i]=uy[i];ufield[i]=-1;}};
  <\/script></body></html>`);
  await page.addScriptTag({path:sourcePath});
  return page;
}
const tick={tick:9,commands:[
  {seat:1,seq:1,commands:[{type:'move',units:[{id:0,generation:11}],x:700,y:600,mode:'direct'},{type:'guard',units:[{id:2,generation:13}],target:{id:0,generation:11}}]},
  {seat:2,seq:1,commands:[{type:'attack',units:[{id:1,generation:12}],target:{id:0,generation:11}},{type:'hold',units:[{id:3,generation:14}]}]}
]};
try{
  const a=await harness(),b=await harness();
  check('consumer registers through the real MFMatchRuntime seam',await a.evaluate(()=>window.__registered===window.MFMatchCommandConsumer));
  check('adapter exposes only the explicit versioned command vocabulary',await a.evaluate(()=>MFMatchCommandConsumer.schemaVersion===1&&MFMatchCommandConsumer.supported.join(',')==='move,stop,hold,attack,guard,build,produce,research,commander,repair,recycle'));
  check('skirmish seats resolve to distinct simulation authorities',await a.evaluate(()=>JSON.stringify([MFMatchCommandConsumer.seatAuthority(1),MFMatchCommandConsumer.seatAuthority(2)])===JSON.stringify([{seat:1,team:0,slot:-1},{seat:2,team:1,slot:5}])));
  check('public Repair and Recycle helpers submit exact stable building identities',await a.evaluate(()=>{
    const C=MFMatchCommandConsumer,before=__submitted.length;
    const repair=C.submitRepair(0,true),recycle=C.submitRecycle({id:0,type:'fac'}),sent=__submitted.slice(before);
    return repair===true&&recycle===true&&sent.length===2&&JSON.stringify(sent[0][0])===JSON.stringify({type:'repair',building:{id:0,type:'fac'},active:true})&&
      JSON.stringify(sent[1][0])===JSON.stringify({type:'recycle',building:{id:0,type:'fac'}});
  }));
  check('public building helpers fall through only when realtime is inactive',await a.evaluate(()=>{
    const before=__submitted.length;__matchState='idle';const offline=MFMatchCommandConsumer.submitRepair(0,true);__matchState='running';
    return offline===false&&__submitted.length===before;
  }));
  const accepted=await a.evaluate(t=>MFMatchCommandConsumer.applyTick(t),tick),acceptedB=await b.evaluate(t=>MFMatchCommandConsumer.applyTick(t),tick),
    stateA=await a.evaluate(()=>window.__capture()),stateB=await b.evaluate(()=>window.__capture());
  check('authoritative multi-seat tick applies through the browser consumer',accepted===true);
  check('identical clients produce byte-identical command state',acceptedB===true&&stateA===stateB,createHash('sha256').update(stateA).digest('hex'));
  check('move, guard, attack and hold mutate only named units',await a.evaluate(()=>{
    const s=JSON.parse(window.__capture());return s.utx[0]===700&&s.uty[0]===600&&s.state[0]===1&&s.state[2]===7&&s.guard[2]===0&&s.guardG[2]===11&&s.state[1]===2&&s.target[1]===0&&s.targetG[1]===11&&s.state[3]===0&&s.hold[3]===1;
  }));
  check('empty authoritative tick is accepted without mutation',await a.evaluate(async before=>await MFMatchCommandConsumer.applyTick({tick:10,commands:[]})&&window.__capture()===before,stateA));
  check('authoritative Repair and Recycle use exact seat-owned building handles',await a.evaluate(async()=>{
    const ok=await MFMatchCommandConsumer.applyTick({tick:10,commands:[
      {seat:1,seq:2,commands:[{type:'repair',building:{id:0,type:'fac'},active:true}]},
      {seat:2,seq:2,commands:[{type:'recycle',building:{id:1,type:'pgen'}}]}
    ]});return ok===true&&blds[0].repairOn===true&&blds[1].alive===false;
  }));
  check('stale building type identity rejects before service mutation',await a.evaluate(async()=>{
    const before=__capture(),ok=await MFMatchCommandConsumer.applyTick({tick:11,commands:[{seat:1,seq:3,commands:[
      {type:'repair',building:{id:0,type:'techlab'},active:false}]}]});return ok===false&&__capture()===before;
  }));
  check('seat cannot service another commander slot building',await a.evaluate(async()=>{
    const before=__capture(),ok=await MFMatchCommandConsumer.applyTick({tick:12,commands:[{seat:1,seq:4,commands:[
      {type:'repair',building:{id:2,type:'fac'},active:true}]}]});return ok===false&&__capture()===before;
  }));
  check('duplicate Repair/Recycle intent for one building rejects the whole tick',await a.evaluate(async()=>{
    const before=__capture(),ok=await MFMatchCommandConsumer.applyTick({tick:13,commands:[{seat:1,seq:5,commands:[
      {type:'repair',building:{id:0,type:'fac'},active:false},{type:'recycle',building:{id:0,type:'fac'}}]}]});
    return ok===false&&__capture()===before;
  }));
  check('service seam {ok:false} is visible and restores building intent atomically',await a.evaluate(async()=>{
    const before=__capture();__forceServiceReject='repair';const ok=await MFMatchCommandConsumer.applyTick({tick:14,commands:[{seat:1,seq:6,commands:[
      {type:'repair',building:{id:0,type:'fac'},active:false}]}]});__forceServiceReject='';
    return ok===false&&__capture()===before&&MFMatchCommandConsumer.lastFailure().includes('repair_forced-reject')&&
      __toasts.some(s=>s.includes('repair_forced-reject'));
  }));
  check('Repair exact schema rejects extra fields before mutation',await a.evaluate(async()=>{
    const before=__capture(),ok=await MFMatchCommandConsumer.applyTick({tick:15,commands:[{seat:1,seq:7,commands:[
      {type:'repair',building:{id:0,type:'fac'},active:false,debug:true}]}]});return ok===false&&__capture()===before;
  }));
  const beforeReject=await a.evaluate(()=>window.__capture());
  const rejected=await a.evaluate(()=>MFMatchCommandConsumer.applyTick({tick:11,commands:[{seat:1,seq:2,commands:[
    {type:'stop',units:[{id:0,generation:11}]},{type:'cheat',units:[{id:0,generation:11}],building:'hq',x:1,y:2}
  ]}]}));
  check('unsupported command rejects the complete tick before mutation',rejected===false&&await a.evaluate(before=>window.__capture()===before,beforeReject));
  check('stale generation rejects before mutation',await a.evaluate(async before=>!(await MFMatchCommandConsumer.applyTick({tick:12,commands:[{seat:1,seq:3,commands:[{type:'stop',units:[{id:0,generation:99}]}]}]}))&&window.__capture()===before,beforeReject));
  check('seat cannot command another seat unit',await a.evaluate(()=>MFMatchCommandConsumer.applyTick({tick:13,commands:[{seat:1,seq:4,commands:[{type:'stop',units:[{id:1,generation:12}]}]}]}))===false);
  check('extra command fields fail the exact schema',await a.evaluate(()=>MFMatchCommandConsumer.applyTick({tick:14,commands:[{seat:1,seq:5,commands:[{type:'stop',units:[{id:0,generation:11}],debug:true}]}]}))===false);
  check('fractional coordinates fail deterministic integer schema',await a.evaluate(()=>MFMatchCommandConsumer.applyTick({tick:15,commands:[{seat:1,seq:6,commands:[{type:'move',units:[{id:0,generation:11}],x:1.5,y:2,mode:'direct'}]}]}))===false);
  check('consumer fails closed outside a live match',await a.evaluate(async()=>{matchLive=false;return await MFMatchCommandConsumer.applyTick({tick:16,commands:[]})===false;}));
  await a.close();await b.close();

  const largeA=await largeHarness(),largeB=await largeHarness();
  await largeA.evaluate(()=>{window.__select(500);const t=performance.now();window.orderMove(2500,2400,false,false);window.__submitMs=performance.now()-t;});
  const packed=await largeA.evaluate(()=>window.__submitted[0]);
  check('500-unit local order is one atomic realtime submission',await largeA.evaluate(()=>(
    window.__submitted.length===1&&window.__submitted[0].length===8&&window.__baseCalls===0)));
  const submitMs=await largeA.evaluate(()=>window.__submitMs);
  check('500-unit local author and enqueue stays below 16 ms',submitMs<16,submitMs.toFixed(2)+' ms');
  check('atomic split preserves every generation-checked handle exactly once',packed&&packed.flatMap(C=>C.units).length===500&&
    new Set(packed.flatMap(C=>C.units.map(R=>R.id+':'+R.generation))).size===500&&
    packed.every((C,p)=>C.part===p&&C.parts===8&&C.total===500&&C.units.length<=64));
  check('every split command stays inside the live protocol byte and array bounds',packed&&
    packed.every(C=>Buffer.byteLength(JSON.stringify(C))<=2048&&C.units.length<=64));
  const largeTick={tick:20,commands:[{seat:1,seq:1,commands:packed}]};
  const largeAccepted=await largeA.evaluate(T=>MFMatchCommandConsumer.applyTick(T),largeTick),
    largeAcceptedB=await largeB.evaluate(T=>MFMatchCommandConsumer.applyTick(T),largeTick),
    largeStateA=await largeA.evaluate(()=>window.__captureLarge()),largeStateB=await largeB.evaluate(()=>window.__captureLarge());
  check('split row reassembles before one full-selection formation is applied',largeAccepted===true&&await largeA.evaluate(()=>{
    const goals=[];for(let i=0;i<500;i++){if(ustate[i]!==2)return false;goals.push(utx[i].toFixed(4)+','+uty[i].toFixed(4));}
    return new Set(goals).size===500;
  }));
  check('500-unit formation application is byte-deterministic across clients',largeAcceptedB===true&&largeStateA===largeStateB,
    createHash('sha256').update(largeStateA).digest('hex'));
  await largeB.evaluate(()=>window.__resetLarge());
  const badTick=JSON.parse(JSON.stringify(largeTick));badTick.tick=21;badTick.commands[0].seq=2;
  badTick.commands[0].commands[7].units.at(-1).generation++;
  const beforeBad=await largeB.evaluate(()=>window.__captureLarge()),badAccepted=await largeB.evaluate(T=>MFMatchCommandConsumer.applyTick(T),badTick);
  check('one stale handle rejects every chunk before any unit mutates',badAccepted===false&&
    await largeB.evaluate(before=>window.__captureLarge()===before,beforeBad));
  await largeA.evaluate(()=>{window.__select(512);window.orderMove(2500,2400,false,false);});
  check('the structural maximum carries exactly 512 refs in eight commands',await largeA.evaluate(()=>{
    const C=window.__submitted[1];return C&&C.length===8&&C.flatMap(x=>x.units).length===512&&
      C.every((x,p)=>x.part===p&&x.parts===8&&x.total===512&&x.units.length===64);
  }));
  await largeA.evaluate(()=>{window.__select(513);window.orderMove(2500,2400,false,false);});
  check('orders beyond the atomic 512-ref bound fail closed with a visible reason',await largeA.evaluate(()=>(
    window.__submitted.length===2&&window.__baseCalls===0&&window.__toasts.some(s=>s.includes('512 units maximum')))));
  await largeA.close();await largeB.close();
} finally {await closePwBrowser();}

const manifest=JSON.parse(readFileSync(resolve(root,'assets','data','manifest.json'),'utf8')).order,boot=readFileSync(resolve(root,'boot.js'),'utf8'),
  auth=readFileSync(resolve(root,'src','authportal.js'),'utf8'),worker=readFileSync(resolve(root,'cloudflare','massfront-auth','src','index.js'),'utf8'),
  wrangler=readFileSync(resolve(root,'cloudflare','massfront-auth','wrangler.toml'),'utf8');
check('bundle manifest loads consumer immediately after social runtime',manifest.indexOf('src/game/matchconsumer.js')===manifest.indexOf('src/socialui.js')+1);
check('boot manifest loads consumer immediately after social runtime',boot.includes("'./src/socialui.js','./src/game/matchconsumer.js'"));
check('release configuration activates realtime only through server capability discovery',auth.includes('realtimeMatch:false')&&
  worker.includes("featureEnabled(env, 'MULTIPLAYER_REALTIME_ENABLED')")&&
  /^\s*MULTIPLAYER_LOBBIES_ENABLED\s*=\s*"1"/m.test(wrangler)&&
  /^\s*MULTIPLAYER_INVITES_ENABLED\s*=\s*"1"/m.test(wrangler)&&
  /^\s*MULTIPLAYER_REALTIME_ENABLED\s*=\s*"1"/m.test(wrangler));
const validateAt=worker.indexOf("!commands.every(c=>this._commandSafe(c))"),acceptAt=worker.indexOf('seat.lastSeq=seq;',validateAt),
  enqueueAt=worker.indexOf('batch.push({seat:seat.seat,seq,commands:JSON.parse(JSON.stringify(commands))});',validateAt);
check('Worker validates every command before accepting or enqueuing any part',validateAt>=0&&acceptAt>validateAt&&enqueueAt>acceptAt);
check('Worker transport exposes the audited 8-command / 64-ref structural bound',
  worker.includes('const MATCH_MAX_COMMANDS_PER_BATCH = 8;')&&worker.includes('Array.isArray(v))return v.length<=64'));
const source=readFileSync(sourcePath),passed=checks.filter(x=>x.ok).length,evidence={generatedAt:new Date().toISOString(),
  evidenceClass:'browser-functional',visualProof:false,releaseProof:false,source:'src/game/matchconsumer.js',
  sourceHash:createHash('sha256').update(source).digest('hex'),passed,total:checks.length,checks,
  knownBlockers:['The deterministic clock/RNG contract is verified separately; this probe covers command ingestion only.','Skirmish supports only the engine-representable two-seat layout; 3-4 player PvP still requires a broader simulation seat/team model.','Production remains unchanged until the approved release is uploaded and deployed.']};
writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(`\n${passed}/${checks.length} Stage 15 match consumer checks passed`);
process.exit(passed===checks.length?0:1);
