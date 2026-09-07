/* High-unit-count authority/pathing contract.
   Exercises four normal participants at 500 each plus the independent Brood
   system force at 500 without running the renderer as the workload driver. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const givenUrl=process.argv.find(a=>/^https?:\/\//.test(a));
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.m4a':'audio/mp4','.webmanifest':'application/manifest+json'};
let url=givenUrl,server=null;
if(!url){
  server=createServer(async(req,res)=>{try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]);if(p==='/')p='/index.html';
    const file=resolve(join(root,p)),rel=relative(root,file);
    if(!rel||rel==='..'||rel.startsWith(`..${sep}`)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
    const body=await readFile(file);res.writeHead(200,{'Cache-Control':'no-store','Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end('nf');}});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));url='http://127.0.0.1:'+server.address().port+'/';
}

const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const browser=await launchPwBrowser({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e?.stack||e)));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof spawnUnit==='function'&&typeof aiSetCohortMoveGoal==='function'
    &&typeof mfNavBuildSlice==='function'&&typeof mfNavDiagnostics==='function'
    &&typeof activeUnitReset==='function'&&typeof PASS!=='undefined'&&PASS&&PASS.length>0,null,{timeout:90000});

  const out=await page.evaluate(()=>{
    running=false;demoMode=false;matchLive=true;paused=true;
    const wipe=()=>{
      for(let i=0;i<unitHigh;i++)ualive[i]=0;
      unitHigh=0;freeList.length=0;activeUnitReset();teamCount[0]=teamCount[1]=teamCount[2]=0;
      if(typeof populationResetLedgers==='function')populationResetLedgers();
      moveCohorts.fill(null);moveCohortNext=0;ufield.fill(-1);
    };
    const land=()=>{for(let y=260;y<MAP-260;y+=37)for(let x=260;x<MAP-260;x+=37)if(isWalkable(x,y))return [x,y];throw Error('no land');};
    const hashBytes=A=>{let h=2166136261>>>0;for(let i=0;i<A.length;i++){h^=A[i];h=Math.imul(h,16777619)>>>0;}return h>>>0;};
    const finishField=(slot,budget=8192)=>{
      let slices=0,max=0;
      while(fields[slot]&&fields[slot].pending&&slices<128){mfNavBuildSlice(budget);max=Math.max(max,mfNavDiagnostics().lastSliceCells);slices++;}
      if(!fields[slot]||fields[slot].pending||!fields[slot].dirs)throw Error('field did not finish');
      return {slices,max,hash:hashBytes(fields[slot].dirs)};
    };

    wipe();const L=land();
    const originalClear=mfNavBuildClearance,clearCalls=[];
    mfNavBuildClearance=function(naval){clearCalls.push(!!naval);return originalClear(naval);};
    mfNavInvalidate('high-unit-lazy-clearance');
    const clearT0=performance.now();mfNavClearanceGrid(false);const landClearMs=performance.now()-clearT0;
    mfNavClearanceGrid(false);const afterLand=clearCalls.slice();
    const waterT0=performance.now();mfNavClearanceGrid(true);const waterClearMs=performance.now()-waterT0;
    const afterWater=clearCalls.slice();mfNavBuildClearance=originalClear;

    fields.length=0;ffNext=0;mfNavQueue.length=0;mfNavJob=null;
    const goal=findLand(Math.min(MAP-300,L[0]+1200),Math.min(MAP-300,L[1]+900));
    /* A brand-new field spends the one synchronous flood each fixed tick is
       allowed - that is the contract the order ribbon and a freshly ordered
       army depend on. Spend it up front so the requests below exercise the
       incremental builder that is actually under test here. */
    const forceDefer=()=>{mfNavBuildTick=(typeof tick==='number'?tick:-1);};
    forceDefer();
    const f0=requestField(goal[0],goal[1],false,MF_NAV_CLEARANCE.infantry,true),nav0=finishField(f0),d0=mfNavDiagnostics();
    mfNavInvalidate('high-unit-rebuild');forceDefer();requestField(goal[0],goal[1],false,MF_NAV_CLEARANCE.infantry,true);
    const nav1=finishField(f0),d1=mfNavDiagnostics();
    forceDefer();requestField(goal[0]+320,goal[1],false,MF_NAV_CLEARANCE.infantry,true);
    forceDefer();requestField(goal[0]+640,goal[1],false,MF_NAV_CLEARANCE.infantry,true);
    const invBefore=mfNavDiagnostics();mfNavInvalidate('high-unit-restamp');const invAfter=mfNavDiagnostics();

    wipe();difficulty=2;infestationOn=true;AI.fac='legion';
    const heroType=TYPES.findIndex(T=>T&&T.cat==='hero');if(heroType<0)throw Error('no hero');
    const points=[[L[0],L[1]],[L[0]+180,L[1]],[L[0],L[1]+180],[L[0]+180,L[1]+180]];
    AI.allies=[];AI.bases=[0,1,2].map((slot,n)=>({slot,x:points[n+1][0],y:points[n+1][1]}));AI.base=AI.bases[0];
    const participants=[];let firstEnemyOrdinary=[];
    for(let seat=-1;seat<=2;seat++){
      const team=seat<0?0:1,P=points[seat+1],hero=spawnUnit(heroType,team,P[0],P[1],seat),ids=[];
      for(let n=0;n<499;n++){const i=spawnUnit(0,team,P[0]+(n%20),P[1]+((n/20)|0),seat);if(i<0)break;ids.push(i);}
      if(seat===0)firstEnemyOrdinary=ids;
      participants.push({seat,hero,ordinary:ids.length,used:populationUsedForCommander(seat)});
    }
    const normalActive=uActiveCount,brood=[];
    for(let n=0;n<500;n++){const i=spawnUnit(12,2,L[0]+(n%25),L[1]+400+((n/25)|0),-1);if(i<0)break;brood.push(i);}
    const combined={normalActive,brood:brood.length,active:uActiveCount,bugCap:bugCap(),team:[...teamCount],participants};

    fields.length=0;ffNext=0;mfNavQueue.length=0;mfNavJob=null;ufield.fill(-1);
    const cache=Object.create(null),req0=mfNavDiagnostics().requests,orderT0=performance.now();
    for(let n=0;n<firstEnemyOrdinary.length;n++){
      const i=firstEnemyOrdinary[n];aiSetCohortMoveGoal(cache,i,goal[0]+(n%17)-8,goal[1]+((n/17)|0)%17-8);
    }
    const orderMs=performance.now()-orderT0,req1=mfNavDiagnostics().requests,
      assigned=[...new Set(firstEnemyOrdinary.map(i=>ufield[i]))];

    const targets=firstEnemyOrdinary.map((i,n)=>({x:goal[0]+(n%24)*5,y:goal[1]+((n/24)|0)*5})),
      cohort=allocMoveCohort(firstEnemyOrdinary,targets,'grid',true);
    for(const i of firstEnemyOrdinary)uMoveCohort[i]=cohort;
    const memberRef=moveCohorts[cohort].members;
    for(let n=0;n<9;n++)ugen[firstEnemyOrdinary[n]]++;
    tickMoveCohorts();
    const formation={sameArray:memberRef===moveCohorts[cohort].members,members:moveCohorts[cohort].members.length};

    const beforeKill=uActiveCount;
    for(let n=20;n<45;n++)killUnit(firstEnemyOrdinary[n],true);
    const afterKill=uActiveCount;
    for(let n=0;n<25;n++)spawnUnit(0,1,L[0]+40+n,L[1]+40,0);
    const lifecycle={beforeKill,afterKill,afterRespawn:uActiveCount,
      positionsValid:Array.from(uActive.subarray(0,uActiveCount)).every((i,p)=>uActivePos[i]===p&&ualive[i])};

    return {clearance:{callsAfterLand:afterLand,callsAfterWater:afterWater,landClearMs,waterClearMs},
      nav:{first:nav0,rebuild:nav1,hashStable:nav0.hash===nav1.hash,cellsPerTick:d1.cellsPerTick,
        canceled:invAfter.canceled-invBefore.canceled,restamps:invAfter.restamps-invBefore.restamps,
        queuedBeforeInvalidate:invBefore.queued,queuedAfterInvalidate:invAfter.queued},
      combined,cohort:{units:firstEnemyOrdinary.length,requestDelta:req1-req0,fieldCount:assigned.length,orderMs},formation,lifecycle};
  });

  assert(JSON.stringify(out.clearance.callsAfterLand)==='[false]','land query eagerly built water clearance');
  assert(JSON.stringify(out.clearance.callsAfterWater)==='[false,true]','water clearance was not built exactly once on demand');
  assert(out.nav.first.max<=8192&&out.nav.rebuild.max<=8192,'incremental nav exceeded the requested cell budget');
  assert(out.nav.hashStable,'same map/goal produced a different flow-field hash');
  /* Invalidation must RE-STAMP queued nav work, never discard it. Cancelling
     restarted every 384x384 build from zero each time a foundation crossed 15%
     or a rock collapsed, so fields effectively stopped publishing and ordered
     armies froze in place with a straight-line order ribbon. */
  assert(out.nav.canceled===0&&out.nav.restamps>=1&&out.nav.queuedAfterInvalidate>=out.nav.queuedBeforeInvalidate,
    'invalidation discarded queued nav work instead of re-stamping it');
  assert(out.combined.normalActive===2000&&out.combined.brood===500&&out.combined.active===2500,'4x500 plus Brood 500 topology failed');
  assert(out.combined.participants.every(P=>P.hero>=0&&P.ordinary===499&&P.used===500),'normal participant cap is not exactly 500');
  assert(out.combined.bugCap===500&&out.combined.team[2]===500,'hard Brood system cap is not exactly 500');
  assert(out.cohort.units===499&&out.cohort.requestDelta===1&&out.cohort.fieldCount===1,'AI cohort did not share one field');
  assert(out.formation.sameArray&&out.formation.members===490,'formation membership was allocated or not compacted in place');
  assert(out.lifecycle.afterKill===out.lifecycle.beforeKill-25&&out.lifecycle.afterRespawn===out.lifecycle.beforeKill&&out.lifecycle.positionsValid,
    'dense active-unit lifecycle lost or duplicated slots');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,contract:'4x500-plus-brood-500-fixed-tick',...out},null,2));
}finally{
  await browser.close().catch(()=>{});await closePwBrowser().catch(()=>{});
  if(server)await new Promise(ok=>server.close(ok));
}
