/* Deterministic Stage 7 economy exit gate.
   Reads the authored sources directly; it neither deploys the Worker nor
   mutates a profile. Usage: node tools/test-stage7-economy-contracts.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
const meta=read('src/game/meta.js'),daily=read('src/daily.js'),tutorial=read('src/tutorial.js');
const economy=read('src/economy-net.js'),develop=read('src/develop.js'),storeui=read('src/storeui.js');
const galaxy=read('src/galaxyui.js'),schema=read('cloudflare/massfront-economy/schema.sql');
const clone=v=>JSON.parse(JSON.stringify(v));

function between(src,start,end){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'missing source block: '+start+' -> '+end);
  return src.slice(a,b);
}
function functionSource(src,name){
  const mark='function '+name+'(',start=src.indexOf(mark);
  assert(start>=0,'missing function '+name);
  const brace=src.indexOf('{',start);let depth=0,quote='',escape=false,lineComment=false,blockComment=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&src[i+1]==='/'){blockComment=false;i++;}continue;}
    if(quote){
      if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';
      continue;
    }
    if(c==='/'&&src[i+1]==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&src[i+1]==='*'){blockComment=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return src.slice(start,i+1);
  }
  assert.fail('unterminated function '+name);
}
function evalCatalog(code,expose,context={}){
  vm.createContext(context);
  vm.runInContext(code+'\nglobalThis.__catalog={'+expose.join(',')+'};',context);
  return context.__catalog;
}
function unique(rows,label){
  const ids=rows.map(x=>x.id);assert.equal(new Set(ids).size,ids.length,label+' ids must be unique');
}
function positiveCost(cost,label){
  assert(cost&&typeof cost==='object'&&!Array.isArray(cost),label+' must have a cost bag');
  for(const [key,value] of Object.entries(cost))
    assert(Number.isInteger(value)&&value>0,label+' '+key+' cost must be a positive integer');
}

/* ---- authored catalogs and integrity ------------------------------------- */
const {STORE}=evalCatalog(between(meta,'const STORE=[','/* ---------- field inventory'),['STORE']);
const {COLORS}=evalCatalog(between(meta,'const COLORS={','let mmPCol='),['COLORS']);
const {DEVTREE}=evalCatalog(between(develop,'const DEVTREE=[','function devDone'),['DEVTREE']);
const {MODULES}=evalCatalog(between(develop,'const MODULES=[','/* ---- READ-ONLY DEVELOPMENT PRESENTERS'),['MODULES']);

unique(STORE,'STORE');unique(DEVTREE,'DEVTREE');unique(MODULES,'MODULES');
for(const item of STORE){
  assert(Number.isInteger(item.max)&&item.max>0,item.id+' max tier must be positive');
  assert(Array.isArray(item.cost)&&item.cost.length===item.max,item.id+' must price every tier exactly once');
  for(const price of item.cost)assert(Number.isInteger(price)&&price>0,item.id+' tier price must be positive');
}
for(const [id,color] of Object.entries(COLORS))
  assert(Number.isInteger(color.cost)&&color.cost>=(id==='azure'?0:1),id+' color price is invalid');
const nodeIds=new Set(Array.from(DEVTREE,n=>n.id));
for(const node of DEVTREE){
  assert(Number.isInteger(node.data)&&node.data>0,node.id+' Data cost must be positive');
  positiveCost(node.cost,node.id);
  assert(Array.isArray(node.req),node.id+' prerequisites must be an array');
  for(const req of node.req)assert(nodeIds.has(req),node.id+' has unknown prerequisite '+req);
}
for(const mod of MODULES){
  assert(nodeIds.has(mod.req),mod.id+' has unknown Development requirement '+mod.req);
  assert(Number.isInteger(mod.dur)&&mod.dur>0,mod.id+' durability must be positive');
  positiveCost(mod.cost,mod.id);
}

const storeTotal=Array.from(STORE,it=>it.cost.reduce((n,v)=>n+v,0)).reduce((n,v)=>n+v,0);
const colorTotal=Object.entries(COLORS).reduce((n,[id,c])=>n+(id==='azure'?0:c.cost),0);
assert.equal(storeTotal,8010,'permanent Armory perk prices drifted');
assert.equal(colorTotal,1200,'paid color prices drifted');
assert(!/\bINV_RESTOCK\b|armRestockCost|data-inv-restock|kind\s*===\s*['\"]restock|armCartAdd\(['\"]restock/.test(storeui),
  'temporary supply restocks must not enter the earned-Core purchase path');

const sumCosts=rows=>rows.reduce((out,row)=>{
  out.data=(out.data||0)+(row.data||0);
  for(const [key,value] of Object.entries(row.cost||{}))out[key]=(out[key]||0)+value;
  return out;
},{});
assert.deepEqual(sumCosts(DEVTREE.filter(n=>n.fac!=='horde')),
  {data:417,alloy:934,circuit:610,isotope:196,relic:24},'playable Development cost envelope drifted');
assert.deepEqual(sumCosts(MODULES),{data:0,alloy:164,circuit:90,isotope:46,relic:8},
  'one-of-each module craft envelope drifted');

/* ---- client/server catalog agreement ------------------------------------
   Daily-deal discounts are deliberately local-only while confirmed checkout
   is disabled. Mission supplies are recovered through operations and have no
   Core SKU. The four retired overlap SKUs remain server-side as historical
   rows and must continue matching the refund authority until a deployed D1
   migration retires them there. */
const migrationSource=between(meta,'const ARMORY_RETIRED_OVERLAPS','const META_DEF');
const migrationContext={META:{cores:0,owned:{}}};
const migration=evalCatalog(migrationSource,['ARMORY_RETIRED_OVERLAPS','metaGrantCores','metaObserveCoreGrants','armoryRetireOverlaps'],migrationContext);
const serverRows=[];
for(const m of schema.slice(schema.indexOf('-- ---- catalog seed')).matchAll(/\('([^']+)',\s*(\d+),\s*(\d+),\s*(\d+),\s*'([^']+)'\)/g))
  serverRows.push({sku:m[1],tier:+m[2],price:+m[3],max:+m[4],kind:m[5]});
assert(serverRows.length>0,'server catalog seed was not parsed');
const serverBySku=new Map();
for(const row of serverRows){
  assert(row.tier>0&&row.price>0&&row.max>=row.tier,'invalid server catalog row '+JSON.stringify(row));
  const rows=serverBySku.get(row.sku)||[];rows.push(row);serverBySku.set(row.sku,rows);
}
const expectedServer=new Map();
for(const item of STORE)expectedServer.set(item.id,Array.from(item.cost,(price,i)=>({tier:i+1,price,max:item.max,kind:'perk'})));
for(const [id,color] of Object.entries(COLORS))if(id!=='azure')
  expectedServer.set('col_'+id,[{tier:1,price:color.cost,max:1,kind:'color'}]);
for(const [sku,expected] of expectedServer){
  const actual=(serverBySku.get(sku)||[]).sort((a,b)=>a.tier-b.tier)
    .map(({tier,price,max,kind})=>({tier,price,max,kind}));
  assert.deepEqual(actual,expected,'client/server catalog mismatch for '+sku);
}
const shared=new Set(expectedServer.keys());
const serverOnly=Array.from(serverBySku.keys()).filter(id=>!shared.has(id)).sort();
const retired=Object.keys(migration.ARMORY_RETIRED_OVERLAPS).sort();
assert.deepEqual(serverOnly,retired,'undocumented server-only catalog rows changed');
for(const id of retired){
  const prices=serverBySku.get(id).sort((a,b)=>a.tier-b.tier).map(r=>r.price);
  assert.deepEqual(prices,Array.from(migration.ARMORY_RETIRED_OVERLAPS[id]),id+' refund no longer matches server history');
}
for(const id of ['c_supply','c_power','c_nanites','c_overdrive','c_command'])
  assert(!serverBySku.has(id),id+' one-match supply unexpectedly entered the server entitlement catalog');

/* ---- one grant authority, stable keys, and pre-init replay --------------- */
assert.equal((meta.match(/function metaGrantCores\s*\(/g)||[]).length,1,'metaGrantCores must have one authority');
assert.match(functionSource(meta,'metaGrant'),/metaGrantCores\(cores,'match_reward'\)/);
assert.match(functionSource(meta,'armoryRetireOverlaps'),
  /metaGrantCores\(refund,'armory_retirement','armory-retirement:v1'\)/);
assert.match(functionSource(daily,'claimOrder'),
  /metaGrantCores\(cores,'daily_order','daily:'\+st\.day\+':'\+o\.id\)/);
assert.match(functionSource(tutorial,'finishTrainingMission'),
  /metaGrantCores\(reward,'training_reward','training:'\+GUIDE_VERSION\)/);
assert.match(functionSource(economy,'initEconomyNet'),/metaObserveCoreGrants\(grant\s*=>/);
assert(!/metaGrant\s*=\s*function/.test(functionSource(economy,'initEconomyNet')),
  'economy-net still wraps match-only metaGrant');
assert.match(functionSource(meta,'getNextUnlockTrack'),/affordable\.cost\[next\.tier\]/,
  'next-unlock rail is not reading the live tier price');

const observed=[];
migrationContext.META={cores:10,owned:{}};
migration.metaGrantCores(25,'daily_order','daily:20280101:win1');
assert.equal(migrationContext.META.cores,35,'pre-init grant did not credit locally once');
migration.metaObserveCoreGrants(g=>observed.push(clone(g)));
assert.equal(migrationContext.META.cores,35,'observer replay credited the local balance twice');
assert.deepEqual(observed,[{amount:25,reason:'daily_order',idemKey:'daily:20280101:win1'}],
  'pre-init grant was not replayed exactly once');
migration.metaGrantCores(5,'training_reward','training:4');
assert.equal(migrationContext.META.cores,40,'post-init grant local credit drifted');
assert.equal(observed.length,2,'post-init observer did not receive exactly one event');
migrationContext.META={cores:100,owned:{armor:2},deals:{claimed:{armor:1}}};
const retiredOnce=migration.armoryRetireOverlaps();
assert.deepEqual(clone(retiredOnce),{changed:true,refund:1200});
assert.equal(migrationContext.META.cores,1300,'Armory retirement refund was not credited once');
assert.equal(observed.at(-1).idemKey,'armory-retirement:v1','retirement idempotency key drifted');
assert.deepEqual(clone(migration.armoryRetireOverlaps()),{changed:false,refund:0},'retirement replay changed the profile');
assert.equal(migrationContext.META.cores,1300,'retirement replay duplicated local credit');

const mutations=[];
function walkJs(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walkJs(full);
    else if(entry.isFile()&&entry.name.endsWith('.js')){
      fs.readFileSync(full,'utf8').split(/\r?\n/).forEach((line,i)=>{
        const m=line.match(/META\.cores\s*(\+=|-=|=)/);if(m)mutations.push({file:path.relative(root,full),line:i+1,op:m[1],text:line.trim()});
      });
    }
  }
}
walkJs(path.join(root,'src'));
const grantMutations=mutations.filter(m=>m.op==='+='||(m.op==='='&&/\+amount/.test(m.text)));
assert.deepEqual(grantMutations.map(m=>m.text),['META.cores=(Number.isFinite(balance)?balance:0)+amount;'],
  'a Core grant bypasses metaGrantCores: '+JSON.stringify(grantMutations));
for(const mutation of mutations.filter(m=>m.op==='='&&!/\+amount/.test(m.text)))
  assert.match(mutation.text,/META\.cores\s*=\s*bal\.cores/,'unexpected direct Core assignment '+JSON.stringify(mutation));

/* ---- 366-day fresh-player feasibility ----------------------------------- */
const dailyContext={__day:0};
dailyContext.dailyState=()=>({day:dailyContext.__day});
const dailyApi=evalCatalog(functionSource(daily,'dayRand')+
  between(daily,'const ORDERS=[','function dailyState')+functionSource(daily,'todaysOrders'),
  ['ORDERS','DAILY_STARTER_IDS','todaysOrders'],dailyContext);
unique(dailyApi.ORDERS,'ORDERS');
for(const order of dailyApi.ORDERS){
  assert(Number.isInteger(order.goal)&&order.goal>0,order.id+' goal must be positive');
  assert(Number.isInteger(order.rw.cores)&&order.rw.cores>0,order.id+' reward must be positive');
}
const starterIds=new Set(Array.from(dailyApi.DAILY_STARTER_IDS));
assert.deepEqual(Array.from(starterIds).sort(),['build12','play2','win1']);
let feasibleDays=0;
for(let i=0;i<366;i++){
  const d=new Date(Date.UTC(2028,0,1+i));
  dailyContext.__day=d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();
  const first=Array.from(dailyApi.todaysOrders(),o=>o.id),again=Array.from(dailyApi.todaysOrders(),o=>o.id);
  assert.deepEqual(first,again,'daily seed is not deterministic for '+dailyContext.__day);
  assert.equal(first.length,3,'daily did not select three orders for '+dailyContext.__day);
  assert.equal(new Set(first).size,3,'daily selected a duplicate for '+dailyContext.__day);
  if(first.some(id=>starterIds.has(id)))feasibleDays++;
}
assert.equal(feasibleDays,366,'fresh-player starter feasibility is not 366/366');

/* ---- source-executed first-week curve ------------------------------------ */
const trainingReward=+(tutorial.match(/var TRAINING_REWARD=(\d+);/)||[])[1];
assert.equal(trainingReward,150,'training reward drifted');
const helperSource=between(meta,'let metaCoreGrantObserver','function armoryRetireOverlaps');
const modeSource=between(meta,'const MODE_REWARD_CONTRACTS','function invGrantModeReward');
const curveContext={
  META:{xp:0,cores:0,researchData:0,matches:0,standardMatches:0,wins:0,losses:0,kills:0,
    streak:0,bestStreak:0,playSec:0,built:0,lost:0,bestKills:0,firstPlayed:0,lastPlayed:0,
    firstWinDay:'',facWins:{},mapWins:{},modeMatches:{}},
  stats:{t:120,kills:[0,0,0],built:[0,0],nests:0,reclaimed:999},difficulty:0,
  resDone:2,resM:[900],resE:[4200],blds:[{alive:true,team:0,type:'techlab',prog:1}],
  activeWarMode:'standard',curMap:'m1',wcActive:[],WC:{},__rewardDay:'week-day-1',
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),wcRewardMult:()=>1,boostMul:()=>1,threatSel:()=>1,
  metaRankIdx:()=>0,metaSave(){},invGrantMatchLoot(){return {gear:null,consumables:[]};},
  invGrantModeReward(){return null;},mfConquestGateActive:()=>true,mfConquestMapOpen:()=>true,
};
const regions=Array.from({length:4},(_,ri)=>({id:'r'+ri,maps:[1,2,3].map(mi=>'m'+(ri*3+mi))}));
const planet={regions};
curveContext.mfConquestWon=map=>!!curveContext.META.mapWins[map];
curveContext.mfConquestLocate=map=>{
  const tier=+String(map).slice(1),ri=Math.floor((tier-1)/3),mi=(tier-1)%3;
  return {worlds:['p'],planetKey:'p',P:planet,R:regions[ri],pi:0,ri,mi,tier};
};
vm.createContext(curveContext);
vm.runInContext([
  helperSource,modeSource,functionSource(meta,'rewardDayKey'),functionSource(meta,'matchCommitted'),
  functionSource(meta,'coreRewardLedger'),functionSource(develop,'fieldRecoveryFromMatch'),
  functionSource(develop,'matsFromMatch'),functionSource(develop,'researchDataFromMatch'),
  functionSource(galaxy,'mfConquestReward'),functionSource(meta,'metaGrant'),
  'rewardDayKey=function(){return globalThis.__rewardDay;};',
  'globalThis.__curve={metaGrantCores,metaGrant,matsFromMatch};'
].join('\n'),curveContext,{filename:'stage7-economy-curve'});

curveContext.__curve.metaGrantCores(trainingReward,'training_reward','training:4');
const materials={alloy:0,circuit:0,isotope:0,relic:0},checkpoints=[];
for(let i=0;i<10;i++){
  curveContext.__rewardDay='week-day-'+(Math.floor(i/2)+1);
  curveContext.curMap='m'+(i+1);
  curveContext.__curve.metaGrant(true);
  const mats=curveContext.__curve.matsFromMatch({win:true,kills:0,built:0,nests:0,
    fieldMass:900,fieldEnergy:4200,reclaimed:999});
  for(const key of Object.keys(materials))materials[key]+=mats[key]||0;
  if([1,3,6,10].includes(i+1))checkpoints.push({wins:i+1,cores:curveContext.META.cores,
    xp:curveContext.META.xp,data:curveContext.META.researchData,materials:{...materials}});
}
assert.deepEqual(checkpoints,[
  {wins:1,cores:276,xp:231,data:13,materials:{alloy:17,circuit:6,isotope:2,relic:0}},
  {wins:3,cores:557,xp:809,data:39,materials:{alloy:51,circuit:18,isotope:6,relic:0}},
  {wins:6,cores:966,xp:1668,data:78,materials:{alloy:102,circuit:36,isotope:12,relic:0}},
  {wins:10,cores:1555,xp:2857,data:130,materials:{alloy:170,circuit:60,isotope:20,relic:0}},
],'source-driven first-week checkpoints drifted');
const week=checkpoints.at(-1);
assert(week.cores>=1400&&week.cores<=1700,'ten-win Core floor left the 1400-1700 target band');
assert(week.data>=110&&week.data<=150,'ten-win Data floor left the 110-150 target band');
assert(week.materials.alloy>=150&&week.materials.alloy<=200&&
  week.materials.circuit>=50&&week.materials.circuit<=75&&
  week.materials.isotope>=15&&week.materials.isotope<=25,'ten-win material floor left its target bands');

const starterRewards=Array.from(dailyApi.ORDERS).filter(o=>starterIds.has(o.id)).map(o=>o.rw.cores);
const starterWeek=base=>[1,2,3,4,5].reduce((n,streak)=>n+Math.round(base*(1+Math.min(0.5,streak*0.05))),0);
const directedDaily={min:starterWeek(Math.min(...starterRewards)),max:starterWeek(Math.max(...starterRewards))};
assert.deepEqual(directedDaily,{min:518,max:690},'five-day starter lane drifted');
assert(week.cores+directedDaily.min>=2000&&week.cores+directedDaily.max<=2400,
  'ten wins plus directed Daily left the 2000-2400 target band');

console.log(JSON.stringify({
  status:'PASS',
  catalogs:{storeSkus:STORE.length,storeTotal,colorTotal,permanentTotal:storeTotal+colorTotal,
    development:sumCosts(DEVTREE.filter(n=>n.fac!=='horde')),modules:sumCosts(MODULES)},
  clientServer:{shared:Array.from(shared).sort(),serverOnlyRetired:serverOnly,
    localOnlyExclusions:{dailyDeals:'25% client-only price; confirmed checkout disabled',inventoryRestocks:'disabled; supplies recovered through operations only'}},
  grantAuthority:{preInitReplay:'once',dailyKey:'daily:<day>:<order>',trainingKey:'training:<version>',retirementKey:'armory-retirement:v1'},
  dailyFeasibility:feasibleDays+'/366',checkpoints,directedDaily,
  targetBands:{tenWinCores:[1400,1700],withDirectedDaily:[2000,2400],data:[110,150],
    alloy:[150,200],circuit:[50,75],isotope:[15,25]},
},null,2));
