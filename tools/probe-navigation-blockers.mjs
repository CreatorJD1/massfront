#!/usr/bin/env node
/* Source-bound navigation blocker probe.

   This intentionally exercises the flow-field implementation loaded by the
   current checkout in hardware-accelerated Chromium. It does not reproduce
   pathfinding in Node and it does not patch gameplay. Synthetic masks make
   individual contracts reproducible without depending on a lucky map seed.

   A missing revision, clearance, blocker, or unreachable-state contract is a
   failure/UNKNOWN. The report must never turn absence into a green result. */
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=resolve(root,'.tmp/navigation-blockers');
const sourceFiles=['src/engine/gl.js','src/game/sim.js','src/game/ai.js','src/ui/input.js','src/main.js'];
async function sourceIdentity(){
  const parts=[],files=[];
  for(const path of sourceFiles){
    const body=await readFile(resolve(root,path));
    const sha256=createHash('sha256').update(body).digest('hex');
    files.push({path,bytes:body.length,sha256});parts.push(path+'\0'+sha256+'\0');
  }
  return {combinedSha256:createHash('sha256').update(parts.join('')).digest('hex'),files};
}
const sourceStart=await sourceIdentity(),sourceSha256=sourceStart.combinedSha256;
const startedAt=new Date().toISOString();
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.ogg':'audio/ogg','.m4a':'audio/mp4','.bin':'application/octet-stream',
  '.woff2':'font/woff2','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent((req.url||'/').split('?')[0]);if(path==='/')path='/index.html';
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('not found');return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error?.stack||error));}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const cdp=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{
  const p=s.address().port;s.close(error=>error?bad(error):ok(p));
});});
if(!process.env.PW_CDP&&!process.env.PW_CDP_PORT)process.env.PW_CDP_PORT=String(cdp);

const pageErrors=[],consoleErrors=[];
let browser=null,gpu=null,runtime=null,fatal=null;
try{
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1000,height:760},deviceScaleFactor:1,colorScheme:'dark'});
  page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
  }catch{}});
  await page.goto(`http://127.0.0.1:${port}/?navigationblockerprobe=1`,{waitUntil:'domcontentloaded',timeout:90000});
  gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof computeField==='function'&&typeof requestField==='function'&&
    typeof resetWorld==='function'&&typeof unitTick==='function'&&typeof orderMove==='function'&&
    typeof addBld==='function'&&typeof rebuildBGrid==='function'&&typeof PGS==='number'&&PASS,
    null,{timeout:120000});

  runtime=await page.evaluate(()=>{
    const N=PGS,NN=N*N,cell=MAP/N,round=(v,n=5)=>Number(Number(v).toFixed(n));
    const world=c=>(c+.5)*cell,idx=(x,y)=>y*N+x;
    const hashBytes=a=>{let h=2166136261>>>0;for(let i=0;i<a.length;i++){h^=a[i];h=Math.imul(h,16777619)>>>0;}
      return ('00000000'+h.toString(16)).slice(-8);};
    const pct=(a,p)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor((b.length-1)*p))]||0;};
    const snapshots={PASS,NAVW,NAVCOMP,NAV_MAIN,NAV_SIZE,perfScale,fogOn,matchLive,running,paused};
    const api={
      computeField:{type:typeof computeField,arity:computeField.length},
      requestField:{type:typeof requestField,arity:requestField.length},
      invalidationHooks:[typeof mfNavInvalidate==='function'?'mfNavInvalidate':null,
        typeof navInvalidate==='function'?'navInvalidate':null,
        typeof bumpNavRevision==='function'?'bumpNavRevision':null,
        typeof mfNavBumpRevision==='function'?'mfNavBumpRevision':null].filter(Boolean),
      revisionGlobals:[typeof mfNavRevision!=='undefined'?'mfNavRevision':null,
        typeof navRevision!=='undefined'?'navRevision':null,
        typeof NAV_REVISION!=='undefined'?'NAV_REVISION':null].filter(Boolean),
      clearanceGlobals:[typeof MF_NAV_CLEARANCE!=='undefined'?'MF_NAV_CLEARANCE':null,
        typeof NAV_CLEARANCE!=='undefined'?'NAV_CLEARANCE':null,
        typeof mfNavClearanceClass!=='undefined'?'mfNavClearanceClass':null,
        typeof mfNavUnitClearance!=='undefined'?'mfNavUnitClearance':null].filter(Boolean),
      attackClearGlobals:[typeof mfNavAttackClear!=='undefined'?'mfNavAttackClear':null,
        typeof mfNavBlockerIntent!=='undefined'?'mfNavBlockerIntent':null,
        typeof mfNavRouteResult!=='undefined'?'mfNavRouteResult':null].filter(Boolean)
    };
    function revisionValue(){
      if(typeof mfNavRevision==='function')try{return mfNavRevision();}catch{return 'ERROR';}
      if(typeof mfNavRevision!=='undefined')return mfNavRevision;
      if(typeof navRevision!=='undefined')return navRevision;
      if(typeof NAV_REVISION!=='undefined')return NAV_REVISION;
      return null;
    }
    function invalidateNav(reason){
      const before=revisionValue();let called=null,error=null,result=null;
      try{
        if(typeof mfNavInvalidate==='function'){called='mfNavInvalidate';result=mfNavInvalidate(reason);}
        else if(typeof navInvalidate==='function'){called='navInvalidate';result=navInvalidate(reason);}
        else if(typeof bumpNavRevision==='function'){called='bumpNavRevision';result=bumpNavRevision(reason);}
        else if(typeof mfNavBumpRevision==='function'){called='mfNavBumpRevision';result=mfNavBumpRevision(reason);}
      }catch(e){error=String(e?.message||e);}
      return {called,before,after:revisionValue(),result:result??null,error};
    }
    function flat(){PASS=new Uint8Array(NN).fill(1);NAVW=new Uint8Array(NN);NAVCOMP=new Uint16Array(NN);NAV_MAIN=0;NAV_SIZE=[0];}
    function clearObjects(){blds.length=0;relics.length=0;rocks.length=0;wrecks.length=0;rebuildBGrid(true);}
    function clearFields(){fields.length=0;ffNext=0;ufield.fill(-1);}
    function trace(dirs,sx,sy,gx,gy,limit=NN){
      let x=sx,y=sy;const cells=[],seen=new Set();let reason='limit';
      for(let n=0;n<limit;n++){
        cells.push([x,y]);if(x===gx&&y===gy){reason='goal';break;}
        const key=y*N+x;if(seen.has(key)){reason='loop';break;}seen.add(key);
        const k=dirs[key];if(k>=8){reason='no-direction';break;}
        x+=DIRX[k];y+=DIRY[k];if(x<0||y<0||x>=N||y>=N){reason='out-of-bounds';break;}
      }
      return {reached:reason==='goal',reason,steps:cells.length,cells};
    }
    const pathSummary=(T,mask)=>({reached:T.reached,reason:T.reason,steps:T.steps,
      enteredBlocked:T.cells.some(c=>!mask[idx(c[0],c[1])]),
      start:T.cells[0]||null,end:T.cells[T.cells.length-1]||null,
      sample:T.cells.filter((_,i)=>i<8||i===T.cells.length-1)});
    function caseResult(id,status,expected,measured,note){return {id,status,expected,measured,note};}
    const cases=[];

    /* Terrain/battlefield truth: the current field can route around cells that
       the authoritative PASS/NAVW grids already mark blocked. */
    flat();clearObjects();clearFields();
    for(let x=0;x<N;x++){PASS[idx(x,0)]=0;PASS[idx(x,N-1)]=0;}
    for(let y=0;y<N;y++){PASS[idx(0,y)]=0;PASS[idx(N-1,y)]=0;}
    const cliffY=190,gap0=202,gap1=207;
    for(let x=1;x<N-1;x++)if(x<gap0||x>gap1)PASS[idx(x,cliffY)]=0;
    const sx=72,sy=292,gx=304,gy=92;
    const dirs=computeField(world(gx),world(gy),false),T=trace(dirs,sx,sy,gx,gy),S=pathSummary(T,PASS);
    const throughGap=T.cells.some(c=>c[1]===cliffY&&c[0]>=gap0&&c[0]<=gap1);
    cases.push(caseResult('terrain-cliff-and-battlefield-boundary',S.reached&&!S.enteredBlocked&&throughGap?'PASS':'FAIL',
      'ground trace stays inside the battlefield and crosses the authored cliff only at its opening',
      {...S,throughGap,barrier:{y:cliffY,gap:[gap0,gap1]}},'Uses the live computeField and PASS grid.'));

    flat();clearFields();
    for(let x=0;x<N;x++){PASS[idx(x,0)]=0;PASS[idx(x,N-1)]=0;}
    for(let y=0;y<N;y++){PASS[idx(0,y)]=0;PASS[idx(N-1,y)]=0;}
    const waterY=188,waterGap=[108,114];
    for(let x=1;x<N-1;x++)if(x<waterGap[0]||x>waterGap[1])PASS[idx(x,waterY)]=0;
    const waterDirs=computeField(world(72),world(88),false),waterTrace=trace(waterDirs,300,286,72,88),waterS=pathSummary(waterTrace,PASS);
    const usedFord=waterTrace.cells.some(c=>c[1]===waterY&&c[0]>=waterGap[0]&&c[0]<=waterGap[1]);
    cases.push(caseResult('ground-water-mask',waterS.reached&&!waterS.enteredBlocked&&usedFord?'PASS':'FAIL',
      'ground trace treats water as blocked and uses the only land crossing',{...waterS,usedFord},'Synthetic PASS water split.'));

    flat();clearFields();NAVW.fill(0);NAVCOMP.fill(0);NAV_MAIN=1;NAV_SIZE=[0,0];
    for(let x=48;x<=330;x++)for(let y=181;y<=187;y++){NAVW[idx(x,y)]=1;NAVCOMP[idx(x,y)]=1;NAV_SIZE[1]++;}
    const navDirs=computeField(world(320),world(184),true),navTrace=trace(navDirs,58,184,320,184),navS=pathSummary(navTrace,NAVW);
    cases.push(caseResult('naval-water-component',navS.reached&&!navS.enteredBlocked?'PASS':'FAIL',
      'naval trace remains inside its connected navigable-water component',navS,'Uses live NAVW/NAVCOMP/NAV_MAIN.'));

    /* Cached fields must be invalidated when the authoritative grid revision
       changes. Direct mutation is deliberate: no public revision hook exists in
       the current source, which is itself part of the measured failure. */
    flat();clearFields();const cacheGoal=[312,192],cacheStart=[62,192];
    const cf0=requestField(world(cacheGoal[0]),world(cacheGoal[1]),false),d0=fields[cf0].dirs,h0=hashBytes(d0);
    const before=trace(d0,...cacheStart,...cacheGoal),cut=before.cells[Math.min(30,Math.max(1,before.cells.length-2))];
    if(cut)PASS[idx(cut[0],cut[1])]=0;
    const groundInvalidation=invalidateNav('probe-pass-mutation');
    const cf1=requestField(world(cacheGoal[0]),world(cacheGoal[1]),false),d1=fields[cf1].dirs,h1=hashBytes(d1);
    const after=trace(d1,...cacheStart,...cacheGoal),staleEntered=!!cut&&after.cells.some(c=>c[0]===cut[0]&&c[1]===cut[1]);
    const cacheFresh=h0!==h1&&!staleEntered;
    cases.push(caseResult('nav-revision-cache-invalidation',cacheFresh?'PASS':'FAIL',
      'a passability/map mutation invalidates a cached field before the same target is queried again',
      {slotBefore:cf0,slotAfter:cf1,hashBefore:h0,hashAfter:h1,mutatedCell:cut,staleEntered,
        invalidation:groundInvalidation,invalidationHooks:api.invalidationHooks,revisionGlobals:api.revisionGlobals},
      groundInvalidation.called?'The public invalidation hook was called after PASS changed.':'No navigation revision/invalidation API is exposed.'));

    flat();clearFields();NAVW.fill(0);NAVCOMP.fill(0);NAV_MAIN=1;NAV_SIZE=[0,0];
    for(let x=42;x<=334;x++)for(let y=186;y<=194;y++){NAVW[idx(x,y)]=1;NAVCOMP[idx(x,y)]=1;NAV_SIZE[1]++;}
    const navalGoal=[326,190],navalStart=[50,190];
    const nf0=requestField(world(navalGoal[0]),world(navalGoal[1]),true),nd0=fields[nf0].dirs,nh0=hashBytes(nd0);
    const nbefore=trace(nd0,...navalStart,...navalGoal),ncut=nbefore.cells[Math.min(60,Math.max(1,nbefore.cells.length-2))];
    if(ncut){NAVW[idx(ncut[0],ncut[1])]=0;NAVCOMP[idx(ncut[0],ncut[1])]=0;}
    const navalInvalidation=invalidateNav('probe-navw-mutation');
    const nf1=requestField(world(navalGoal[0]),world(navalGoal[1]),true),nd1=fields[nf1].dirs,nh1=hashBytes(nd1);
    const nafter=trace(nd1,...navalStart,...navalGoal),navalStaleEntered=!!ncut&&nafter.cells.some(c=>c[0]===ncut[0]&&c[1]===ncut[1]);
    const navalFresh=nh0!==nh1&&!navalStaleEntered;
    cases.push(caseResult('nav-revision-cache-invalidation-naval',navalFresh?'PASS':'FAIL',
      'a NAVW/NAVCOMP mutation invalidates cached naval fields before the same target is queried again',
      {slotBefore:nf0,slotAfter:nf1,hashBefore:nh0,hashAfter:nh1,mutatedCell:ncut,staleEntered:navalStaleEntered,
        invalidation:navalInvalidation},navalInvalidation.called?'The public invalidation hook was called after NAVW changed.':'No navigation revision/invalidation API is exposed.'));

    function obstacleTrace(kind){
      flat();clearObjects();clearFields();const row=192,a=[72,row],g=[312,row];
      /* An empty uniform field is not guaranteed to draw a visually straight
         line: equal-cost neighbours are resolved by deterministic direction
         order. Anchor each blocker ON that exact baseline trace instead of
         assuming its midpoint is where the field walks. This prevents a
         naturally bowed route from becoming false evidence of avoidance. */
      const baseDirs=computeField(world(g[0]),world(g[1]),false),baseTrace=trace(baseDirs,...a,...g);
      const anchor=baseTrace.cells[Math.min(baseTrace.cells.length-2,Math.max(1,baseTrace.cells.length>>1))]||[192,row];
      const cx=anchor[0],cy=anchor[1];
      let radius=32;
      if(kind==='building'){
        const B=addBld('hq',1,world(cx),world(cy),true,0);radius=B?.r||34;rebuildBGrid(true);
      }else if(kind==='friendly-gate'){
        const B=addBld('gate',0,world(cx),world(cy),true,0);radius=B?.r||11;rebuildBGrid(true);
      }else if(kind==='enemy-wall'){
        const B=addBld('wall',1,world(cx),world(cy),true,0);radius=B?.r||11;rebuildBGrid(true);
      }else if(kind==='relic'){
        radius=42;relics.push({alive:true,x:world(cx),y:world(cy),w:84,h:58,s:58,a:0,kind:'ruin'});
      }else if(kind==='rock'){
        radius=42;rocks.push({x:world(cx),y:world(cy),s:84,a:0,k:'stone'});
      }else if(kind==='wreck'){
        radius=34;wrecks.push({x:world(cx),y:world(cy),a:0,s:68,mass:40,energy:0,kind:0,style:'nova'});
      }
      clearFields();
      const ds=computeField(world(g[0]),world(g[1]),false),tr=trace(ds,...a,...g);
      const hit=tr.cells.some(c=>Math.hypot(world(c[0])-world(cx),world(c[1])-world(cy))<=radius);
      return {trace:pathSummary(tr,PASS),hit,radius,anchor,
        baseline:{trace:pathSummary(baseTrace,PASS),fieldHash:hashBytes(baseDirs)},
        fieldHash:hashBytes(ds),fieldChanged:hashBytes(ds)!==hashBytes(baseDirs)};
    }
    const building=obstacleTrace('building');
    cases.push(caseResult('adjacent-cell-building-footprint',!building.hit&&building.trace.reached?'PASS':'FAIL',
      'a field routes around the complete occupied building footprint, including adjacent cells',building,
      'The building grid exists, but the current field is tested for actual footprint awareness.'));
    const gate=obstacleTrace('friendly-gate');
    cases.push(caseResult('friendly-gate-passability',gate.hit&&gate.trace.reached?'PASS':'FAIL',
      'a friendly gate remains traversable',gate,'Team-conditional local collision and field behavior must agree.'));
    const wall=obstacleTrace('enemy-wall');
    const wallResolved=!wall.hit||api.attackClearGlobals.length>0;
    cases.push(caseResult('enemy-destructible-wall-route-or-attack-clear',wallResolved?'PASS':'FAIL',
      'an enemy wall is routed around or returned as an explicit attack-to-clear intent',
      {...wall,attackClearGlobals:api.attackClearGlobals},'Walking through an enemy wall without attack-clear metadata is not acceptance.'));

    /* A detour-able wall only proves footprint avoidance. This fixture seals a
       five-cell corridor from edge to edge with enemy wall segments. A valid
       result must expose a stable attack-to-clear target/intent; merely
       returning no direction is an unresolved order, and walking through is a
       collision lie. */
    flat();clearObjects();clearFields();PASS.fill(0);
    const sealed={x0:46,x1:332,y0:188,y1:192,wallX:190,start:[54,190],goal:[324,190]};
    for(let x=sealed.x0;x<=sealed.x1;x++)for(let y=sealed.y0;y<=sealed.y1;y++)PASS[idx(x,y)]=1;
    const wallIds=[];
    for(let y=sealed.y0;y<=sealed.y1;y++){
      const B=addBld('wall',1,world(sealed.wallX),world(y),true,0);if(B)wallIds.push(blds.indexOf(B));
    }
    /* addBld() prepares a foundation and may reopen neighbouring terrain.
       Restore the authored corridor after construction so this cannot degrade
       into the already-covered open-wall detour case. */
    PASS.fill(0);
    for(let x=sealed.x0;x<=sealed.x1;x++)for(let y=sealed.y0;y<=sealed.y1;y++)PASS[idx(x,y)]=1;
    if(typeof mfNavInvalidate==='function')mfNavInvalidate('probe-sealed-wall-fixture');
    rebuildBGrid(true);clearFields();
    const sealedSlot=requestField(world(sealed.goal[0]),world(sealed.goal[1]),false),sealedField=fields[sealedSlot];
    const sealedTrace=trace(sealedField.dirs,...sealed.start,...sealed.goal);
    const crossedWall=sealedTrace.cells.some(c=>c[0]===sealed.wallX&&c[1]>=sealed.y0&&c[1]<=sealed.y1);
    const crossingCells=sealedTrace.cells.filter(c=>Math.abs(c[0]-sealed.wallX)<=4);
    const intentKeys=['attackClear','attackTargets','blockedTargets','breakTargets','blockerIntent','routeResult']
      .filter(k=>sealedField&&sealedField[k]!=null);
    let externalIntent=null,intentError=null;
    try{
      if(typeof mfNavAttackClear==='function')externalIntent=mfNavAttackClear(sealedSlot,idx(sealed.start[0],sealed.start[1]),0);
      else if(typeof mfNavBlockerIntent==='function')externalIntent=mfNavBlockerIntent(sealedSlot,idx(sealed.start[0],sealed.start[1]),0);
      else if(typeof mfNavRouteResult==='function')externalIntent=mfNavRouteResult(sealedSlot,idx(sealed.start[0],sealed.start[1]),0);
    }catch(e){intentError=String(e?.message||e);}
    const hasIntent=intentKeys.length>0||(externalIntent!=null&&externalIntent!==false);
    const sealedAccepted=!sealedTrace.reached&&!crossedWall&&hasIntent;
    cases.push(caseResult('enemy-destructible-wall-sealed-attack-clear',sealedAccepted?'PASS':'FAIL',
      'a sealed destructible wall returns a deterministic attack-to-clear intent rather than crossing or silently stopping',
      {slot:sealedSlot,trace:pathSummary(sealedTrace,PASS),crossedWall,crossingCells,wallIds,intentKeys,
        fieldKeys:sealedField?Object.keys(sealedField).sort():[],externalIntent,externalIntentError:intentError},
      hasIntent?'An explicit blocker intent was observed.':'No deterministic attack-to-clear intent was exposed for the sealed route.'));
    for(const kind of ['relic','rock','wreck']){
      const o=obstacleTrace(kind);
      cases.push(caseResult(kind+'-blocker',!o.hit&&o.trace.reached?'PASS':'FAIL',
        kind+' geometry is rasterized into the navigation field',o,'Cosmetic presence alone is not pathing support.'));
    }

    /* Clearance is behavioral, not the presence of a named constant. Ask for
       four explicit fields and measure each class' minimum traversable corridor
       width. Strictly increasing minima prove progressively larger erosion. */
    clearObjects();clearFields();
    const classNames=['infantry','light','heavy','superheavy'],classType=[0,1,2,8];
    function constantToken(name,pos){
      const C=typeof MF_NAV_CLEARANCE!=='undefined'?MF_NAV_CLEARANCE:
        (typeof NAV_CLEARANCE!=='undefined'?NAV_CLEARANCE:null);
      if(C==null)return undefined;if(Array.isArray(C))return C[pos];
      if(typeof C==='object'){
        for(const key of [name,name.toUpperCase(),name.replace('superheavy','superHeavy'),
          name.replace('superheavy','SUPER_HEAVY')])if(Object.prototype.hasOwnProperty.call(C,key))return C[key];
      }
      return undefined;
    }
    let clearanceTokenSource='none',tokens=classNames.map(constantToken),helperErrors=[];
    if(tokens.every(v=>v!==undefined))clearanceTokenSource='MF_NAV_CLEARANCE';
    else if(typeof mfNavUnitClearance==='function'){
      resetWorld();flat();clearObjects();clearFields();const probeUnits=[];
      for(let p=0;p<classType.length;p++)probeUnits.push(spawnUnit(classType[p],0,world(40+p*4),world(40),-1));
      tokens=probeUnits.map((u,p)=>{try{return mfNavUnitClearance(u);}catch(e){helperErrors.push({class:classNames[p],mode:'unit-index',error:String(e?.message||e)});return undefined;}});
      clearanceTokenSource='mfNavUnitClearance(unit-index)';
      if(tokens.some(v=>v===undefined)){
        const alt=classType.map((t,p)=>{try{return mfNavUnitClearance(TYPES[t]);}catch(e){helperErrors.push({class:classNames[p],mode:'type-object',error:String(e?.message||e)});return undefined;}});
        if(alt.every(v=>v!==undefined)){tokens=alt;clearanceTokenSource='mfNavUnitClearance(type-object)';}
      }
    }
    const explicitInterface=api.computeField.arity>=4||api.requestField.arity>=4;
    const tokenReady=tokens.every(v=>v!==undefined&&v!==null);
    function explicitClearanceField(tx,ty,token){
      clearFields();
      if(api.requestField.arity>=4){const f=requestField(world(tx),world(ty),false,token,0);return {slot:f,dirs:fields[f]?.dirs||null};}
      if(api.computeField.arity>=4)return {slot:null,dirs:computeField(world(tx),world(ty),false,token,0)};
      return {slot:null,dirs:null};
    }
    const clearanceRuns=[];
    if(explicitInterface&&tokenReady){
      for(let p=0;p<classNames.length;p++){
        const attempts=[];let minimum=null;
        for(let width=1;width<=17;width++){
          PASS=new Uint8Array(NN);NAVW=new Uint8Array(NN);NAVCOMP=new Uint16Array(NN);NAV_MAIN=0;NAV_SIZE=[0];
          const y0=(N/2|0)-Math.floor((width-1)/2);
          for(let x=28;x<N-28;x++)for(let y=y0;y<y0+width;y++)PASS[idx(x,y)]=1;
          if(typeof mfNavInvalidate==='function')mfNavInvalidate('probe-clearance-corridor-'+classNames[p]+'-'+width);
          const y=y0+(width/2|0);let field=null,error=null,tr=null;
          try{field=explicitClearanceField(N-34,y,tokens[p]);if(field.dirs)tr=trace(field.dirs,34,y,N-34,y);}
          catch(e){error=String(e?.message||e);}
          const reached=!!tr?.reached;attempts.push({cells:width,worldUnits:round(width*cell,3),reached,
            reason:tr?.reason||null,field:field?.slot??null,hash:field?.dirs?hashBytes(field.dirs):null,error});
          if(reached&&minimum==null)minimum=width;
        }
        clearanceRuns.push({class:classNames[p],token:tokens[p],minimumCells:minimum,
          minimumWorldUnits:minimum==null?null:round(minimum*cell,3),attempts});
      }
    }
    /* Keep the old raw-width measurement in the report. It proves the control
       mask itself is connected and prevents a broken synthetic fixture from
       masquerading as class separation. */
    const corridorWidths=[];
    for(const width of [1,2,4,8,12]){
      PASS=new Uint8Array(NN);clearFields();const y0=(N/2|0)-Math.floor((width-1)/2);
      for(let x=28;x<N-28;x++)for(let y=y0;y<y0+width;y++)PASS[idx(x,y)]=1;
      if(typeof mfNavInvalidate==='function')mfNavInvalidate('probe-clearance-control-'+width);
      const y=y0+(width/2|0),ds=computeField(world(N-34),world(y),false),tr=trace(ds,34,y,N-34,y);
      corridorWidths.push({cells:width,worldUnits:round(width*cell,3),reached:tr.reached,reason:tr.reason,hash:hashBytes(ds)});
    }
    const minima=clearanceRuns.map(r=>r.minimumCells),progressive=minima.length===4&&minima.every(Number.isFinite)&&
      minima[0]<minima[1]&&minima[1]<minima[2]&&minima[2]<minima[3];
    const clearanceStatus=explicitInterface&&tokenReady&&progressive?'PASS':'FAIL';
    cases.push(caseResult('clearance-classes-infantry-light-heavy-superheavy',clearanceStatus,
      'infantry, light, heavy and superheavy explicit fields require progressively wider corridors',
      {computeFieldArity:api.computeField.arity,requestFieldArity:api.requestField.arity,
        clearanceGlobals:api.clearanceGlobals,explicitInterface,tokenReady,tokenSource:clearanceTokenSource,tokens,
        helperErrors,minima,progressive,clearanceRuns,corridorWidths},
      !explicitInterface?'No flow-field request accepts an explicit clearance class.':
        !tokenReady?'The authoritative clearance tokens could not be resolved.':
        progressive?'All four measured corridor minima increase strictly.':'Explicit fields did not show progressively wider corridor requirements.'));

    /* Real order entry point: orderMove -> requestField -> unitTick. The start
       island and goal island are both legal but disconnected. A no-direction
       cell must not fall back to direct goal steering. */
    resetWorld();flat();clearObjects();clearFields();PASS.fill(0);perfScale=0;fogOn=false;matchLive=true;running=false;paused=false;
    const us=[96,190],ug=[290,190];
    for(let y=us[1]-3;y<=us[1]+3;y++)for(let x=us[0]-3;x<=us[0]+3;x++)PASS[idx(x,y)]=1;
    for(let y=ug[1]-3;y<=ug[1]+3;y++)for(let x=ug[0]-3;x<=ug[0]+3;x++)PASS[idx(x,y)]=1;
    const ui=spawnUnit(0,0,world(us[0]),world(us[1]),-1);usel[ui]=1;rebuildGrid();
    const issued=orderMove(world(ug[0]),world(ug[1]),false,true),assigned=ufield[ui];
    const startDir=assigned>=0&&fields[assigned]?fields[assigned].dirs[idx(us[0],us[1])]:null;
    const x0=ux[ui],y0=uy[ui];let maxDelta=0;
    for(let n=0;n<120;n++){tick++;unitTick(1/30);maxDelta=Math.max(maxDelta,Math.hypot(ux[ui]-x0,uy[ui]-y0));}
    const unreachableStopped=startDir===8&&maxDelta<=0.05;
    cases.push(caseResult('unreachable-cell-no-direct-steer',unreachableStopped?'PASS':'FAIL',
      'a unit on an unreachable field cell does not substitute a direct vector toward the disconnected goal',
      {issued,unit:ui,field:assigned,startDirection:startDir,displacement:round(Math.hypot(ux[ui]-x0,uy[ui]-y0)),
        maxDisplacement:round(maxDelta),state:ustate[ui],position:[round(ux[ui]),round(uy[ui])],goal:[round(utx[ui]),round(uty[ui])]},
      'Runs the real player orderMove and fixed-step unitTick path.'));

    flat();clearObjects();clearFields();
    for(let x=60;x<325;x++)if(x<182||x>187)PASS[idx(x,190)]=0;
    const repeatA=computeField(world(310),world(96),false),repeatB=computeField(world(310),world(96),false);
    const repeatHashA=hashBytes(repeatA),repeatHashB=hashBytes(repeatB);
    cases.push(caseResult('deterministic-repeat-hash',repeatHashA===repeatHashB?'PASS':'FAIL',
      'identical masks and goals produce byte-identical fields',{hashA:repeatHashA,hashB:repeatHashB},'No random source is used by the probe.'));

    const buildMs=[];for(let n=0;n<8;n++){const t=performance.now();computeField(world(300-n*3),world(84+n*5),false);buildMs.push(performance.now()-t);}
    clearFields();requestField(world(300),world(84),false);const queryMs=[];
    for(let n=0;n<200;n++){const t=performance.now();requestField(world(300),world(84),false);queryMs.push(performance.now()-t);}
    const timings={fieldBuild:{samples:buildMs.length,min:round(Math.min(...buildMs)),median:round(pct(buildMs,.5)),
      p95:round(pct(buildMs,.95)),max:round(Math.max(...buildMs))},
      cachedQuery:{samples:queryMs.length,min:round(Math.min(...queryMs)),median:round(pct(queryMs,.5)),
        p95:round(pct(queryMs,.95)),max:round(Math.max(...queryMs))}};
    const timingFinite=[...buildMs,...queryMs].every(Number.isFinite);
    cases.push(caseResult('field-build-and-query-timings',timingFinite?'PASS':'FAIL',
      'live field build and cache query timings are finite and recorded',timings,'No performance threshold is invented by this probe.'));

    PASS=snapshots.PASS;NAVW=snapshots.NAVW;NAVCOMP=snapshots.NAVCOMP;NAV_MAIN=snapshots.NAV_MAIN;NAV_SIZE=snapshots.NAV_SIZE;
    perfScale=snapshots.perfScale;fogOn=snapshots.fogOn;matchLive=snapshots.matchLive;running=snapshots.running;paused=snapshots.paused;
    clearFields();
    return {grid:{cells:N,cellWorldUnits:round(cell,6),worldSize:MAP},api,cases,timings};
  });
}catch(error){fatal=String(error?.stack||error);}
finally{
  if(browser)try{await closePwBrowser(browser);}catch(error){pageErrors.push('browser close: '+String(error?.message||error));}
  await new Promise(ok=>server.close(()=>ok()));
}

const cases=runtime?.cases||[];
const counts={PASS:0,FAIL:0,UNKNOWN:0};for(const c of cases)counts[c.status]=(counts[c.status]||0)+1;
const sourceEnd=await sourceIdentity(),sourceDrift=sourceEnd.combinedSha256!==sourceStart.combinedSha256;
const report={schema:'massfront-navigation-blocker-probe-v1',startedAt,finishedAt:new Date().toISOString(),
  source:{combinedSha256:sourceSha256,files:sourceStart.files,endCombinedSha256:sourceEnd.combinedSha256,
    endFiles:sourceEnd.files,driftedDuringRun:sourceDrift},runtimeUrl:`http://127.0.0.1:${port}/?navigationblockerprobe=1`,
  browser:{launcher:'tools/pw-browser.mjs',hardwareGpuAsserted:!!gpu,gpu},pageErrors,consoleErrors,fatal,
  grid:runtime?.grid||null,api:runtime?.api||null,cases,timings:runtime?.timings||null,counts,
  accepted:!fatal&&!sourceDrift&&pageErrors.length===0&&counts.FAIL===0&&counts.UNKNOWN===0&&counts.PASS===cases.length&&cases.length>0};
await mkdir(outDir,{recursive:true});
await writeFile(resolve(outDir,'report.json'),JSON.stringify(report,null,2)+'\n');
const lines=['# MASSFRONT navigation blocker probe','',`- Source: \`${sourceSha256}\``,
  `- Source drift during run: ${sourceDrift?'YES — evidence rejected':'NO'}`,
  `- Hardware GPU: ${report.browser.hardwareGpuAsserted?'YES':'NO'}`,`- Cases: PASS ${counts.PASS} / FAIL ${counts.FAIL} / UNKNOWN ${counts.UNKNOWN}`,
  `- Accepted: ${report.accepted?'YES':'NO'}`,'','| Case | Status | Result |','|---|---:|---|'];
for(const c of cases)lines.push(`| ${c.id} | ${c.status} | ${String(c.note||'').replaceAll('|','\\|')} |`);
if(fatal)lines.push('','## Fatal','',`\`${fatal.replaceAll('`','\\`')}\``);
lines.push('','## Timings','',`\`${JSON.stringify(report.timings)}\``,'');
await writeFile(resolve(outDir,'report.md'),lines.join('\n'));
console.log(`NAVIGATION_BLOCKER_PROBE PASS=${counts.PASS} FAIL=${counts.FAIL} UNKNOWN=${counts.UNKNOWN}`);
console.log(`SOURCE_SHA256=${sourceSha256}`);
if(sourceDrift)console.error(`SOURCE_DRIFT=${sourceSha256}->${sourceEnd.combinedSha256}`);
console.log(`REPORT=${resolve(outDir,'report.json')}`);
if(fatal)console.error(fatal);
for(const c of cases)console.log(`${c.status.padEnd(7)} ${c.id}`);
process.exitCode=report.accepted?0:1;
