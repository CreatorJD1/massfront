// Real player orders and fixed simulation ticks on reproducible synthetic maps.
// This is navigation integration evidence, not visual acceptance of a full map.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,relative,isAbsolute,basename} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {enterGalacticStandardRoute} from './perf-lab/perf-probe-runner.mjs';
const root=process.cwd(),packed=process.env.MF_NAV_TEST_PACKED==='1',serveRoot=packed?resolve(root,'www'):root;
const evidenceRoot=resolve(root,'tmp/nav-next'),out=resolve(root,process.env.MF_NAV_TEST_OUT||'tmp/nav-next/orders'),outputRelative=relative(evidenceRoot,out);
assert.ok(outputRelative&&!outputRelative.startsWith('..')&&!isAbsolute(outputRelative),'MF_NAV_TEST_OUT must be a fresh child of tmp/nav-next');
assert.match(basename(out),/^[a-z0-9][a-z0-9-]*$/,'safe navigation evidence label');
const runtimeFiles=['index.html','boot.js','assets/data/manifest.json',
  'modules/space_exploration/index.html','modules/space_exploration/src/space_module.js','modules/space_exploration/src/space_experience.js',
  'modules/space_exploration/src/ui/uga_command.js','modules/space_exploration/src/ui/uga_command.css','modules/space_exploration/src/ui/campaign_hub_registry.js',
  'modules/space_exploration/src/host/massfront_solo_host.js','modules/space_exploration/src/host/base_runtime_url.js',
  'modules/space_exploration/src/domain/state_store.js','modules/space_exploration/src/startup_content.js','modules/space_exploration/assets/runtime/content/assetpack-runtime.js'];
async function identity(base=root){const r={};for(const p of runtimeFiles)r[p]=createHash('sha256').update(await readFile(resolve(base,p))).digest('hex');if(base===root)r['tools/test-nav-orders.mjs']=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');return r;}
const errors=[],startedAt=new Date().toISOString();
let server,browser,page,guard,gpu,before,after,packageBefore,packageAfter,runtimeUrl,outputCreated=false,freezeStable=false,freezeFailure=null,cases=[],fatal=null,battleScreenshot=null;
try{
  guard=await acquireVerificationFreeze({root,label:`navigation orders ${basename(out)}`,allowedPaths:[resolve(root,'tmp'),resolve(root,'audit')]});
  // Cover every executable base input, not just the navigation files changed
  // last time. Launcher/factory command dependencies are part of this runtime.
  const manifest=JSON.parse(await readFile(resolve(root,'assets/data/manifest.json'),'utf8'));
  assert.ok(Array.isArray(manifest.order)&&manifest.order.length>0,'base manifest order exists');
  for(const path of manifest.order)if(!runtimeFiles.includes(path))runtimeFiles.push(path);
  before=await identity();packageBefore=await identity(serveRoot);
  if(packed)for(const path of runtimeFiles)assert.equal(packageBefore[path],before[path],`source matches tested package: ${path}`);
  await mkdir(evidenceRoot,{recursive:true});await mkdir(out);outputCreated=true;
  server=createServer(async(req,res)=>{try{const p=resolve(serveRoot,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html')),rel=relative(serveRoot,p);if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[extname(p)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  runtimeUrl=`http://127.0.0.1:${server.address().port}/`;
  browser=await launchPwBrowser();
  page=await browser.newPage({viewport:{width:1000,height:760}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(runtimeUrl,{waitUntil:'domcontentloaded'});
  gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof orderMove==='function'&&typeof unitTick==='function'&&document.getElementById('repeatBtn')?.dataset.mfNativePress==='1',null,{timeout:120000});
  // Reach the real tactical surface through the player launch flow. A hidden
  // production button behind the startup gate is not a usable repeat test.
  await page.waitForFunction(()=>!document.getElementById('mfBootCover'));
  await page.waitForFunction(()=>{const p=document.getElementById('mfLaunchPlay'),o=document.getElementById('mfLaunchOffline');return p&&!p.disabled||o&&!o.disabled&&getComputedStyle(o).display!=='none';});
  if(await page.locator('#mfLaunchPlay').isEnabled()&&/CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText()))await page.locator('#mfLaunchPlay').click();else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click();await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*',{timeout:30000});
  await enterGalacticStandardRoute(page);
  for(let n=0;n<5;n++){
    // The secured handoff reloads the base shell before the next setup panel
    // is painted. Wait for a player-visible action instead of racing the
    // persistent hidden setup DOM that exists during that handoff.
    await page.waitForFunction(()=>{
      const shown=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
      const action=shown(document.getElementById('deployBtn'))||shown(document.getElementById('setupStart'));
      return action&&!shown(document.getElementById('loadScr'));
    },null,{timeout:60000});
    if(await page.locator('#deployBtn').isVisible())break;
    try{await page.locator('#setupStart').click({timeout:60000});}
    catch(e){
      /* Terrain generation can replace Setup with carrier placement between
         the visibility probe and Playwright's stability check. That is a
         successful state transition, not a hidden-control failure. */
      if(await page.locator('#deployBtn').isVisible())break;
      throw e;
    }
    await page.waitForTimeout(600);
  }
  await page.locator('#deployBtn').waitFor({state:'visible',timeout:60000});
  try{await page.locator('#deployBtn').click();}
  catch(e){
    // The native press removes Deploy while the live HUD is painted. When
    // that replacement wins Playwright's post-click retry, the click already
    // succeeded and matchLive is the authoritative player-state result.
    if(!await page.evaluate(()=>matchLive))throw e;
  }
  await page.waitForFunction(()=>matchLive,null,{timeout:15000});
  battleScreenshot=resolve(out,'01-real-classic-battle-before-fixtures.png');await page.screenshot({path:battleScreenshot});
  cases=await page.evaluate(()=>{
    const results=[],N=PGS,C=MAP/N,w=n=>(n+.5)*C,at=(x,y)=>y*N+x;
    function reset(){resetWorld();running=false;paused=false;fogOn=false;matchLive=true;perfScale=0;PASS=new Uint8Array(N*N).fill(1);NAVW=new Uint8Array(N*N);NAVCOMP=new Uint16Array(N*N);blds.length=0;relics.length=0;rocks.length=0;wrecks.length=0;rebuildBGrid(true);fields.length=0;ufield.fill(-1);mfNavInvalidate('test-map');}
    // unitTick owns tick++; an extra increment strands every other LOD unit.
    function step(n){for(let k=0;k<n;k++)unitTick(1/30);}
    function spawn(x,y){const i=spawnUnit(0,0,w(x),w(y),-1);usel[i]=1;rebuildGrid();return i;}
    function record(id,pass,data){results.push({id,pass,...data});}
    function goal(i){return [utx[i],uty[i]];}
    function distance(i,g){return Math.hypot(ux[i]-g[0],uy[i]-g[1]);}
    // Partial progress to a reachable frontier is valid. Crossing a sealed
    // wall, oscillating there or deleting the original goal is not.
    reset();for(let y=0;y<N;y++)PASS[at(112,y)]=0;mfNavInvalidate('closed-wall');
    let i=spawn(100,190);orderMove(w(124),w(190),false,true);let g=goal(i),p=[ux[i],uy[i]];
    let crossedBarrier=false,enteredBlocked=false;for(let k=0;k<180;k++){step(1);if(ux[i]>=112*C)crossedBarrier=true;if(!PASS[ffCell(ux[i],uy[i])])enteredBlocked=true;}
    const frontier=[ux[i],uy[i]];step(180);const frontierDrift=distance(i,frontier);
    record('unreachable-retains-order',!crossedBarrier&&!enteredBlocked&&frontierDrift<1&&distance(i,g)>C*8&&Math.hypot(utx[i]-g[0],uty[i]-g[1])<1,{goal:g,currentGoal:goal(i),displacement:distance(i,p),frontierDrift,crossedBarrier,enteredBlocked,state:ustate[i]});
    // Removing the terrain obstruction must resume the same player order.
    for(let y=183;y<=197;y++)PASS[at(112,y)]=1;mfNavInvalidate('opened-wall');step(3600);
    record('reopened-route-resumes',distance(i,g)<30,{distance:distance(i,g),goal:g,currentGoal:goal(i)});
    // An unreachable first waypoint is not successful arrival at node two.
    reset();for(let y=0;y<N;y++)PASS[at(112,y)]=0;mfNavInvalidate('queue-wall');i=spawn(100,190);orderMove(w(124),w(190),false,true);g=goal(i);
    uQueue[i]=[{t:0,x:w(100),y:w(210),mv:true}];step(180);
    record('blocked-queue-does-not-skip',uQueue[i]?.length===1&&Math.hypot(utx[i]-g[0],uty[i]-g[1])<1,{remaining:uQueue[i]?.length||0,currentGoal:goal(i),firstGoal:g});
    // Actual addBld invalidation, then real movement around its footprint.
    reset();i=spawn(100,190);orderMove(w(124),w(190),false,true);g=goal(i);step(30);
    addBld('fac',0,w(112),w(190),true,Math.PI/6);const obstacle=blds[blds.length-1];rebuildBGrid(true);let crossed=false,minClearance=Infinity;
    for(let k=0;k<3600;k++){step(1);const f=bldFoot(obstacle),dx=ux[i]-obstacle.x,dy=uy[i]-obstacle.y,c=Math.cos(obstacle.rot),s=Math.sin(obstacle.rot),lx=dx*c+dy*s,ly=-dx*s+dy*c;
      const clearance=Math.hypot(Math.max(0,Math.abs(lx)-f[0]/2),Math.max(0,Math.abs(ly)-f[1]/2))-TYPES[utype[i]].r;minClearance=Math.min(minClearance,clearance);if(clearance<-.5)crossed=true;}
    record('new-factory-routes-and-arrives',!crossed&&distance(i,g)<30,{distance:distance(i,g),footprintOverlap:crossed,minClearance,footprint:bldFoot(obstacle),rotation:obstacle.rot,goal:g,currentGoal:goal(i)});
    // Crowd traverses the only gap and settles, rather than only issuing fast.
    reset();for(let y=0;y<N;y++)if(y<183||y>197)PASS[at(112,y)]=0;mfNavInvalidate('crowd-gap');
    const ids=[];for(let n=0;n<12;n++)ids.push(spawn(98+(n%3)*2,184+Math.floor(n/3)*3));
    orderMove(w(126),w(190),false,true);const goals=ids.map(goal);step(5400);
    const distances=ids.map((u,k)=>distance(u,goals[k]));record('crowd-chokepoint-arrival',distances.every(d=>d<40),{distances,states:ids.map(u=>ustate[u])});
    // A named combat chase must route around an intervening friendly factory.
    reset();i=spawn(100,190);const enemy=spawnUnit(0,1,w(170),w(190),-1);
    uhold[enemy]=1;uhp[enemy]=uhpm[enemy]=1000000;ucool[enemy]=1000000;
    addBld('fac',0,w(135),w(190),true,0);rebuildBGrid(true);rebuildGrid();
    orderAttack(enemy);step(3600);
    const enemyDistance=Math.hypot(ux[i]-ux[enemy],uy[i]-uy[enemy]);
    record('combat-chase-around-factory',enemyDistance<=TYPES[utype[i]].rng+TYPES[utype[enemy]].r+12,{distance:enemyDistance,range:TYPES[utype[i]].rng,position:[ux[i],uy[i]],target:utgt[i],enemy});
    // Complete real production work; do not spawn a unit and assign its goal.
    reset();addBld('fac',0,w(100),w(190),true,0);const factory=blds[blds.length-1];
    const marker={x:w(165),y:w(190)};factory.rally=marker;factory.queue=[0];factory.prodT=TYPES[0].bt;
    addBld('fac',0,w(135),w(190),true,0);rebuildBGrid(true);
    resM[0]=resE[0]=100000;const preIds=new Set();for(let u=0;u<ualive.length;u++)if(ualive[u])preIds.add(u);
    bldTick(1/30);const produced=[];for(let u=0;u<ualive.length;u++)if(ualive[u]&&!preIds.has(u))produced.push(u);
    const rallied=produced[0],rallyGoal=rallied===undefined?null:goal(rallied);step(5400);
    const markerError=rallyGoal?Math.hypot(rallyGoal[0]-marker.x,rallyGoal[1]-marker.y):null;
    const arrival=rallyGoal?distance(rallied,rallyGoal):null;
    record('production-rally-arrival',produced.length===1&&markerError<=.01&&arrival<30,{produced,marker,rallyGoal,markerError,arrival,queueRemaining:factory.queue.length});
    // Dispatch through the bound production control, including the compatibility
    // click that must not toggle a touch press twice. Production stays real.
    reset();addBld('fac',0,w(100),w(190),true,0);const repeating=blds[blds.length-1];openBldMenu(blds.length-1);
    resM[0]=resE[0]=100000;repeating.queue=[0];repeating.prodT=TYPES[0].bt;
    const repeatButton=document.getElementById('repeatBtn');
    function pressRepeat(){for(const type of ['pointerdown','pointerup'])repeatButton.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:77,clientX:10,clientY:10}));repeatButton.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));}
    const controlBefore={disabled:repeatButton.disabled,visible:repeatButton.getBoundingClientRect().height>0,owned:mfLocalOwnsBuilding(repeating),openBld};
    pressRepeat();const afterOn=repeating.repeat;bldTick(1/30);const afterFirst=repeating.queue.length;
    pressRepeat();const afterOff=repeating.repeat;repeating.prodT=TYPES[0].bt;bldTick(1/30);const afterDrain=repeating.queue.length;
    for(let k=0;k<120;k++)bldTick(1/30);
    record('repeat-touch-off-drains',afterOn===true&&afterFirst===1&&afterOff===false&&afterDrain===0&&repeating.queue.length===0&&repeating.repeat===false,{controlBefore,afterOn,afterFirst,afterOff,afterDrain,finalQueue:repeating.queue.length,finalRepeat:repeating.repeat,label:repeatButton.textContent});
    // Measure actual army authoring + fixed-step cost; do not confuse fast
    // orders with successful arrivals, which are asserted separately above.
    reset();for(let n=0;n<500;n++)spawn(70+n%25*2,240+Math.floor(n/25)*2);
    const authorMs=[],tickMs=[];for(let n=0;n<9;n++){const t=performance.now();orderMove(w(270-n%2*10),w(90+n%2*10),false,true);if(n)authorMs.push(performance.now()-t);}
    for(let n=0;n<180;n++){const t=performance.now();step(1);tickMs.push(performance.now()-t);}
    const percentile=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
    record('army500-authoring-performance',percentile(authorMs,.95)<=16,{authorMs,authorP95:percentile(authorMs,.95),tickP50:percentile(tickMs,.5),tickP95:percentile(tickMs,.95),tickMax:Math.max(...tickMs),nav:mfNavDiagnostics()});
    function repeatRoute(){reset();const u=spawn(100,190);orderMove(w(140),w(190),false,true);step(900);return [ux[u],uy[u],utx[u],uty[u],ustate[u]];}
    const repeatA=repeatRoute(),repeatB=repeatRoute();record('deterministic-repeat-order',JSON.stringify(repeatA)===JSON.stringify(repeatB),{repeatA,repeatB});
    // Actual hostile wall entities seal the only terrain corridor. A-move must
    // shoot a blocker, retain the strategic goal and continue after destruction.
    reset();PASS.fill(0);for(let y=186;y<=194;y++)for(let x=80;x<=185;x++)PASS[at(x,y)]=1;
    const walls=[];for(let y=186;y<=194;y+=2){addBld('wall',1,w(128),w(y),true,0);const wall=blds[blds.length-1];wall.hp=1;walls.push(wall);}
    // addBld levels real foundation terrain. Restore the synthetic corridor
    // afterward so foundation stamping cannot open a route around its ends.
    PASS.fill(0);for(let y=186;y<=194;y++)for(let x=80;x<=185;x++)PASS[at(x,y)]=1;
    rebuildBGrid(true);mfNavInvalidate('hostile-sealed-corridor');i=spawn(95,190);moveMode=false;orderMove(w(165),w(190),false,false);g=goal(i);let lostGoal=false,observedBlocker=false;
    for(let k=0;k<5400;k++){step(1);projTick(1/30);if(utgt[i]<=-2)observedBlocker=true;if(Math.hypot(utx[i]-g[0],uty[i]-g[1])>.01)lostGoal=true;}
    const wallDebris=wrecks.filter(W=>W.kind===WRECK_STRUCT),blockingWallDebris=wallDebris.filter(W=>W.navBlock!==false);
    record('enemy-wall-breach-resumes-order',observedBlocker&&!lostGoal&&walls.some(B=>!B.alive)&&wallDebris.length>0&&!blockingWallDebris.length&&distance(i,g)<30,{observedBlocker,lostGoal,destroyed:walls.filter(B=>!B.alive).length,wallDebris:wallDebris.length,blockingWallDebris:blockingWallDebris.length,distance:distance(i,g),goal:g,currentGoal:goal(i),state:ustate[i],target:utgt[i],position:[ux[i],uy[i]],nav:mfNavDiagnostics()});
    return results;
  });
}catch(e){fatal=e.stack||String(e);}finally{
  if(page&&fatal&&outputCreated)await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});
  if(browser)try{await closePwBrowser(browser);}catch(e){errors.push('browser close: '+String(e));}
  if(server?.listening)await new Promise(r=>server.close(r));
  if(before)try{after=await identity();packageAfter=await identity(serveRoot);}catch(e){errors.push('final identity: '+String(e));}
  if(guard)try{await guard.release({assertStable:true,name:'navigation orders complete'});freezeStable=true;}catch(e){freezeFailure=e.stack||String(e);}
}
const drift=!before||!after||JSON.stringify(before)!==JSON.stringify(after),packageDrift=!packageBefore||!packageAfter||JSON.stringify(packageBefore)!==JSON.stringify(packageAfter);
const report={startedAt,finishedAt:new Date().toISOString(),packed,serveRoot,runtimeUrl,viewport:{width:1000,height:760},commandLine:process.argv,
  verifierSha256:before?.['tools/test-nav-orders.mjs'],testedEntrySha256:packageBefore?.['index.html'],manifestSha256:packageBefore?.['assets/data/manifest.json'],
  before,after,packageBefore,packageAfter,drift,packageDrift,freezeStable,freezeFailure,gpu,errors,fatal,battleScreenshot,
  fixture:'Normal updater, intro, offline identity, integrated Campaign Hub, PLAY, Standard War Table, setup and deploy. Screenshot precedes synthetic masks; 11 diagnostic cases exercise real order/production/fixed-tick functions, not a fully played match or multiplayer transport.',
  cases,pass:!fatal&&!drift&&!packageDrift&&freezeStable&&!errors.length&&cases.length===11&&cases.every(c=>c.pass)};
if(outputCreated)await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));process.exitCode=report.pass?0:1;
