#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';

const root=resolve(import.meta.dirname,'..'),sourcePath=resolve(root,'src','game','matchconsumer.js'),
  out=resolve(root,'audit','stage15-command-takeover'),checks=[];
mkdirSync(out,{recursive:true});
function check(name,ok,detail=''){checks.push({name,ok:!!ok,detail});console.log((ok?'PASS  ':'FAIL  ')+name+(detail?'  '+detail:''));}
const browser=await launchPwBrowser({ownershipMode:'isolated'});
try{
  const page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  await page.setContent(`<!doctype html><html><body><script>
    const MAXU=16,MAP=1000,POP_PLAYER_SLOT=-1,MF_PRODUCTION_QUEUE_CAP=20,UT_ENGINEER=0,UT_MINER=1;
    let matchLive=true,unitHigh=3,moveMode=0,heroLvl=20,playerFaction='nova';
    const ualive=new Uint8Array(MAXU),ugen=new Int32Array(MAXU),uteam=new Int8Array(MAXU),uCmd=new Int8Array(MAXU),
      utype=new Int8Array(MAXU),usel=new Uint8Array(MAXU),ux=new Float64Array(MAXU),uy=new Float64Array(MAXU),
      utx=new Float64Array(MAXU),uty=new Float64Array(MAXU),ustate=new Int8Array(MAXU),utgt=new Int32Array(MAXU),
      utgtg=new Int32Array(MAXU),uhold=new Uint8Array(MAXU),umarch=new Uint8Array(MAXU),ufield=new Int32Array(MAXU),
      uPatrolRoute=new Int32Array(MAXU),uMoveCohort=new Int32Array(MAXU),uQkind=new Int8Array(MAXU),
      uGuard=new Int32Array(MAXU),uGuardG=new Int32Array(MAXU),uQueue=new Array(MAXU);
    const TYPES=Array.from({length:33},(_,i)=>({r:5,cat:i===2?'hero':'veh'}));
    for(let i=0;i<3;i++){ualive[i]=1;ugen[i]=21+i;uteam[i]=0;uCmd[i]=-1;utype[i]=i;ux[i]=100+i*40;uy[i]=120+i*30;utx[i]=ux[i];uty[i]=uy[i];}
    usel[0]=usel[2]=1;
    const BT={fac:{cm:100,ce:50,placement:'land'},techlab:{cm:80,ce:40,placement:'land'},pgen:{cm:60,ce:20,placement:'land'}},
      blds=[{alive:true,type:'fac',team:0,tier:1,queue:[],x:100,y:100},{alive:true,type:'techlab',team:0,res:-1,resT:0,x:140,y:100}],
      RESEARCH=[{id:'bal1',t:20,cm:1,ce:1}],researched={},stats={built:[0,0]};
    const AI={allies:[],bases:[{slot:5}],fac:'legion'};
    window.MFSocialUI={state:{lobby:{rules:{mode:'skirmish',slots:2,map:'auto'}}}};
    window.__state='running';window.__seat=1;window.__sent=[];window.__registered=null;window.__baseCalls=[];window.__commander=[];
    window.MFMatchRuntime={registerConsumer:v=>(__registered=v,true),status:()=>({state:__state,seat:__seat,started:true,ended:false}),
      submitCommands:(commands,delay)=>{__sent.push({commands,delay});return {seq:__sent.length,targetTick:2,count:commands.length};}};
    function commanderSlotForBuilding(){return -1} function populationCanSpawn(){return true} function canAfford(){return true}
    function factionDoctrineRoster(list){return list} function canStartBuild(){return true} function inBuildRange(){return true}
    function footBlocked(){return false} function footOnLand(){return true} function footOnWater(){return true}
    function depositAt(){return -1} function geyserAt(){return -1} function researchResumeTime(){return 4}
    function beginBuild(team,type,x,y,rot,slot){const B={alive:true,type,team,x,y,rot,queue:[],allyAI:null};blds.push(B);return B}
    function rebuildBGrid(){} function findLand(x,y){return [x,y]} function findWater(x,y){return [x,y]}
    function battlefieldClampPoint(x,y){return [x,y]} function requestField(){return 1} function mfNavUnitClearance(){return 5}
    function mfAirIssueMission(){} function fireCommanderActiveAt(i,x,y,quiet){__commander.push({i,x,y,quiet});return true}
    function toast(){}
    function orderMove(){__baseCalls.push('move');return 'offline-move'}
    function stopSelected(){__baseCalls.push('stop')}
    function orderHold(){__baseCalls.push('hold');return 2}
    function orderAttack(){__baseCalls.push('attack');return true}
    function orderGuard(){__baseCalls.push('guard');return true}
  <\/script></body></html>`);
  await page.addScriptTag({path:sourcePath});
  check('network order takeover is installed',await page.evaluate(()=>orderMove._mfNetworkTakeover===true&&orderHold._mfNetworkTakeover===true));
  check('network move submits exact generation-safe refs without local mutation',await page.evaluate(()=>{
    const before=JSON.stringify([...utx]);const ok=orderMove(640,520,false,false),sent=__sent[0]&&__sent[0].commands[0];
    return ok===true&&__baseCalls.length===0&&JSON.stringify([...utx])===before&&sent.type==='move'&&sent.mode==='attack'&&
      sent.units.length===2&&sent.units[0].id===0&&sent.units[0].generation===21&&sent.units[1].id===2&&sent.x===640&&sent.y===520;
  }));
  check('offline path remains the original input implementation',await page.evaluate(()=>{__state='idle';return orderMove(1,2,false,false)==='offline-move'&&__baseCalls.pop()==='move';}));
  check('build production research and commander proposals use typed schemas',await page.evaluate(()=>{
    __state='running';const C=MFMatchCommandConsumer;
    const a=C.submit({type:'build',building:'pgen',x:220,y:240,turn:1});
    const b=C.submit({type:'produce',building:{id:0,type:'fac'},unit:0,count:3});
    const c=C.submit({type:'research',building:{id:1,type:'techlab'},study:'bal1'});
    const d=C.submit({type:'commander',commander:{id:2,generation:23},action:'active',x:300,y:310});
    return !!a&&!!b&&!!c&&!!d&&__sent.slice(-4).map(v=>v.commands[0].type).join(',')==='build,produce,research,commander';
  }));
  const packet={tick:1,commands:[{seat:1,seq:1,commands:[
    {type:'produce',building:{id:0,type:'fac'},unit:0,count:2},
    {type:'research',building:{id:1,type:'techlab'},study:'bal1'},
    {type:'commander',commander:{id:2,generation:23},action:'active',x:300,y:310}
  ]}]};
  check('authoritative production research and commander tick applies once',await page.evaluate(async p=>{
    const ok=await MFMatchCommandConsumer.applyTick(p);
    return ok&&blds[0].queue.join(',')==='0,0'&&blds[1].res===0&&blds[1].resT===4&&__commander.length===1&&__commander[0].quiet===true;
  },packet));
  check('authoritative build tick creates the site and records ownership',await page.evaluate(async()=>{
    const n=blds.length,ok=await MFMatchCommandConsumer.applyTick({tick:2,commands:[{seat:1,seq:2,commands:[{type:'build',building:'pgen',x:220,y:240,turn:1}]}]});
    const B=blds[n];return ok&&B&&B.type==='pgen'&&B.x===220&&B.y===240&&Math.abs(B.rot-Math.PI*.5)<1e-8&&stats.built[0]===1;
  }));
  check('invalid typed command rejects the complete tick before mutation',await page.evaluate(async()=>{
    const before=blds[0].queue.length;
    const ok=await MFMatchCommandConsumer.applyTick({tick:3,commands:[{seat:1,seq:3,commands:[
      {type:'produce',building:{id:0,type:'fac'},unit:0,count:1},{type:'research',building:{id:0,type:'fac'},study:'bal1'}]}]});
    return ok===false&&blds[0].queue.length===before;
  }));
  check('within-tick queue reservations reject aggregate overflow atomically',await page.evaluate(async()=>{
    const saved=blds[0].queue.slice();blds[0].queue=Array(16).fill(0);const before=blds[0].queue.length;
    const ok=await MFMatchCommandConsumer.applyTick({tick:4,commands:[{seat:1,seq:4,commands:[
      {type:'produce',building:{id:0,type:'fac'},unit:0,count:3},{type:'produce',building:{id:0,type:'fac'},unit:0,count:3}]}]});
    const atomic=ok===false&&blds[0].queue.length===before;blds[0].queue=saved;return atomic;
  }));
  check('within-tick construction reservations reject overlapping sites atomically',await page.evaluate(async()=>{
    const before=blds.length;
    const ok=await MFMatchCommandConsumer.applyTick({tick:5,commands:[{seat:1,seq:5,commands:[
      {type:'build',building:'pgen',x:320,y:340,turn:0},{type:'build',building:'pgen',x:320,y:340,turn:1}]}]});
    return ok===false&&blds.length===before;
  }));
  check('welcome/start events expose immutable local bootstrap identity',await page.evaluate(()=>{
    dispatchEvent(new CustomEvent('massfront-match:welcome',{detail:{seat:1}}));
    dispatchEvent(new CustomEvent('massfront-match:start',{detail:{seats:[1,2]}}));
    const b=MFMatchCommandConsumer.bootstrap();return Object.isFrozen(b)&&b.localSeat===1&&b.seats.join(',')==='1,2'&&b.rules.mode==='skirmish';
  }));
  check('non-host skirmish seat owns and submits only its canonical army',await page.evaluate(()=>{
    __seat=2;usel.fill(0);uteam[0]=1;uCmd[0]=5;usel[0]=1;const own=mfLocalOwnsUnit(0)&&!mfLocalOwnsUnit(1),before=__sent.length;
    const ok=orderMove(420,430,false,false),c=__sent[before]&&__sent[before].commands[0];
    return own&&ok===true&&c&&c.units.length===1&&c.units[0].id===0;
  }));
  await page.close();
} finally {await closePwBrowser();}

const source=readFileSync(sourcePath),passed=checks.filter(x=>x.ok).length,evidence={generatedAt:new Date().toISOString(),
  evidenceClass:'browser-functional',visualProof:false,releaseProof:false,source:'src/game/matchconsumer.js',
  sourceHash:createHash('sha256').update(source).digest('hex'),passed,total:checks.length,checks,
  knownBlockers:['Two physical devices have not completed the packaged soak.','Three- and four-seat PvP remain rejected by the current simulation authority mapping.','Production remains unchanged until the approved release is uploaded and deployed.']};
writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(`\n${passed}/${checks.length} Stage 15 outbound takeover checks passed`);
process.exit(passed===checks.length?0:1);
