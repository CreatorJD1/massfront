#!/usr/bin/env node
/* Packed mixed-stance HUD acceptance. Enter a real offline Standard match, then
   add the two chassis needed for this HUD edge case as a disclosed fixture.
   Selection, deck routing and stance orders must still come from player UI.
   This does not claim Tech-2 factory or production progression acceptance. */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT } from './mobile-device-profile.mjs';
import { collectEvidenceIdentity, sha256File } from './evidence-foundation/fingerprints.mjs';
import { inspectPng } from './evidence-foundation/png-evidence.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

process.env.PW_CDP_PORT ||= '9519';
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const wwwRoot=join(root,'www');
const toolPath=join(root,'tools','test-hud-mixed-stance-packed.mjs');
const tmpRoot=join(root,'.tmp');
const sourcePairs=['index.html','boot.js','assets/data/manifest.json','src/ui/hud.js',
  'src/ui/input.js','src/ui/cinematic-hud.js','src/game/sim.js','src/main.js','src/styles/ui.css'];
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json','.wasm':'application/wasm','.ktx2':'image/ktx2','.bin':'application/octet-stream'};
const expectedAria='Cycle stances for 2 selected units; different stance sets';

function inside(base,target){
  const rel=relative(resolve(base),resolve(target));
  return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..');
}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function errorText(error){return String(error?.stack||error?.message||error);}
function sameIdentity(a,b){return ['gitHead','dirtyFingerprint','runtimeFingerprint','testedEntrySha256',
  'testedPackageSha256','packageFingerprint'].every(key=>a?.[key]===b?.[key]);}
async function visible(page,selector){return page.locator(selector).first().isVisible().catch(()=>false);}
async function click(page,selector,label,route,timeout=30000){
  const target=page.locator(selector).first();
  await target.waitFor({state:'visible',timeout});await target.click({timeout});
  route.push(label);await page.waitForTimeout(450);
}
function parseArgs(argv){
  const options={selfCheck:false,help:false,out:null};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--self-check'){options.selfCheck=true;continue;}
    if(arg==='--help'||arg==='-h'){options.help=true;continue;}
    if(arg==='--out'){options.out=argv[++i];continue;}
    if(arg.startsWith('--out=')){options.out=arg.slice(6);continue;}
    throw new Error('Unknown argument: '+arg);
  }
  return options;
}
const options=parseArgs(process.argv.slice(2));
if(options.help){
  console.log('Usage: node tools/test-hud-mixed-stance-packed.mjs [--self-check] [--out .tmp/<dir>]');
  process.exit(0);
}

async function sourceParity(){
  return Promise.all(sourcePairs.map(async path=>{
    const source=join(root,path),packed=join(wwwRoot,path);
    if(!existsSync(source)||!existsSync(packed))return {path,sourceExists:existsSync(source),packedExists:existsSync(packed),same:false};
    const [sourceSha256,packedSha256]=await Promise.all([sha256File(source),sha256File(packed)]);
    return {path,sourceSha256,packedSha256,same:sourceSha256===packedSha256};
  }));
}
async function selfCheck(){
  const [hud,input,sim,html]=await Promise.all(['src/ui/hud.js','src/ui/input.js','src/game/sim.js','index.html']
    .map(path=>readFile(join(root,path),'utf8')));
  const checks={
    mixedReadout:hud.includes("$('modeNm').textContent=mixed?'Mixed':M.nm")&&
      hud.includes("$('modeEm').textContent=mixed?'↻':M.em")&&hud.includes('different stance sets'),
    modeAction:hud.includes('function cycleSelectedModes()'),
    armySelection:input.includes('function selectArmy()'),
    realSpawn:sim.includes('function spawnUnit(type,team,x,y,cmdSlot)'),
    playerControls:html.includes('id="armyBtn"')&&html.includes('id="modeBtn"')&&html.includes('id="modeNm"')
  };
  return {pass:Object.values(checks).every(Boolean),checks,fixture:'live Striker and Thumper after real deployment; no direct HUD helper calls'};
}
if(options.selfCheck){
  const result=await selfCheck();console.log(JSON.stringify(result,null,2));process.exit(result.pass?0:1);
}

async function startServer(){
  if(!existsSync(join(wwwRoot,'index.html')))throw new Error('PACKED_WWW_MISSING: pack before HUD verification');
  const server=createServer(async(req,res)=>{
    try{
      let pathname=decodeURIComponent((req.url||'/').split('?')[0]);
      if(pathname==='/')pathname='/index.html';
      const file=resolve(wwwRoot,pathname.replace(/^[/\\]+/,''));
      if(!inside(wwwRoot,file)||!existsSync(file)||(await stat(file)).isDirectory()){
        res.writeHead(404,{'Cache-Control':'no-store'});res.end('not found');return;
      }
      const headers={'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'};
      if(req.method==='HEAD'){res.writeHead(200,headers);res.end();return;}
      res.writeHead(200,headers);res.end(await readFile(file));
    }catch{res.writeHead(500,{'Cache-Control':'no-store'});res.end('server error');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  return {server,url:`http://127.0.0.1:${server.address().port}/`};
}

async function leaveGatewayOffline(page,route){
  await page.waitForFunction(()=>document.body&&typeof mfLauncherSnapshot==='function'&&!document.getElementById('mfBootCover'),
    null,{timeout:180000});
  for(let step=0;step<36;step++){
    if(page.url().includes('/modules/space_exploration/')){
      await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.scene==='uga'&&document.querySelector('.uga-command-shell'),
        null,{timeout:90000});
      return 'uga';
    }
    if(await visible(page,'#startBtn')&&!(await visible(page,'#mfOnboardingChoice')))return 'menu';
    const actions=[['#mfIntroStart','intro'],['#apOfflineBtn','account-offline'],
      ['#mfOnboardingSkip','skip-tutorial'],['#mfLaunchOffline','launcher-offline'],['#apCloseBtn','close-account-gate']];
    let acted=false;
    for(const [selector,label] of actions)if(await visible(page,selector)){
      await click(page,selector,label,route);acted=true;break;
    }
    if(!acted&&await visible(page,'#mfLaunchPlay')){
      const label=await page.locator('#mfLaunchPlay').textContent().catch(()=>null);
      if(/OFFLINE|CONTINUE TO INTRO/i.test(String(label||''))){await click(page,'#mfLaunchPlay','launcher-primary-offline',route);acted=true;}
    }
    if(!acted)await page.waitForTimeout(750);
  }
  throw new Error('OFFLINE_GATE_STALLED: neither UGA nor main menu became ready');
}

async function enterBattle(page){
  const route=[];
  const entry=await leaveGatewayOffline(page,route);
  if(entry==='uga'){
    await click(page,'.uga-command-nav [data-nav="classic"]','classic-access',route,60000);
    await click(page,'[data-host-route="war-room"]','war-room',route,60000);
    await page.waitForURL(/galacticRoute=/,{timeout:30000});
  }else await click(page,'#startBtn','war-room',route,60000);
  await click(page,'.warCard[data-mode="standard"]','standard',route,60000);
  const signature=()=>page.evaluate(()=>{
    const visibleEl=el=>{if(!el)return false;const style=getComputedStyle(el),rect=el.getBoundingClientRect();
      return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden';};
    return [...document.querySelectorAll('[id^="mfStage"]')].filter(visibleEl).map(el=>el.id).join(',')||
      (visibleEl(document.getElementById('cmdbar'))?'in-world':'unknown');
  }).catch(()=>'unknown');
  const advance=['#setupStart','.mfWorldChip:not(.locked)','.mfRegionChip:not(.locked)',
    '.mfQuickPlan','.mfTeamBtn','#mfConquestContinue'];
  for(let step=0;step<24;step++){
    if(await visible(page,'#deployBtn'))break;
    const before=await signature();if(before==='in-world')break;
    let moved=false;
    for(const selector of advance){
      const target=page.locator(selector).first();if(!(await target.isVisible().catch(()=>false)))continue;
      for(let tap=0;tap<2&&!moved;tap++){
        await target.click({timeout:30000}).catch(()=>{});await page.waitForTimeout(650);
        if((await signature())!==before||await visible(page,'#deployBtn'))moved=true;
      }
      if(moved){route.push('setup:'+before);break;}
    }
    if(!moved)throw new Error('WAR_TABLE_STALLED: '+before);
  }
  await page.locator('#deployBtn').first().waitFor({state:'visible',timeout:180000});
  const box=await page.locator('#gl').boundingBox();
  if(box){await page.mouse.click(box.x+box.width*.5,box.y+box.height*.44);await page.waitForTimeout(1800);}
  try{
    await page.locator('#deployBtn').first().focus();
    await page.locator('#deployBtn').first().press('Enter');route.push('deploy');
  }catch{
    await page.locator('#deployBtn').first().click({timeout:30000});route.push('deploy-pointer');
  }
  await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive===true&&
    typeof running!=='undefined'&&running===true&&document.body.classList.contains('hudTacticalDock'),
    null,{timeout:90000});
  const state=await page.evaluate(()=>(
    {matchLive:matchLive===true,running:running===true,hudTacticalDock:document.body.classList.contains('hudTacticalDock'),
      offline:(typeof netForcedOffline!=='undefined'&&!!netForcedOffline)||localStorage.getItem('mf_offline')==='1'||
        localStorage.getItem('massfront_offline')==='1',
      localUnits:Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&
        (typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0))
        .map(i=>({id:i,name:TYPES[utype[i]].name,generation:ugen[i]}))}
  ));
  if(!state.matchLive||!state.running||!state.offline||!state.hudTacticalDock)
    throw new Error('REAL_ROUTE_PROOF_FAILED: '+JSON.stringify(state));
  return {route,state};
}

async function seedLiveChassis(page){
  return page.evaluate(()=>{
    const types=['Striker','Thumper'].map(name=>TYPES.findIndex(type=>type?.name===name));
    const hero=typeof mfLocalCommander==='function'?mfLocalCommander():heroIdx;
    if(types.some(type=>type<0)||hero<0||!ualive[hero]||typeof spawnUnit!=='function')
      return {ok:false,reason:'required live game authority unavailable',types,hero};
    const team=uteam[hero],slot=uCmd[hero],x=ux[hero],y=uy[hero];
    const striker=spawnUnit(types[0],team,x+24,y+12,slot);
    const thumper=spawnUnit(types[1],team,x+38,y+12,slot);
    const rows=[striker,thumper].map(i=>i>=0?{id:i,generation:ugen[i],type:utype[i],
      name:TYPES[utype[i]].name,team:uteam[i],alive:!!ualive[i],mode:umode[i],
      modes:unitModes(utype[i]),local:typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0}:null);
    return {ok:rows.every(row=>row?.alive&&row.local)&&team===0,hero,team,slot,rows,
      fixture:'spawnUnit after actual player deployment; no selection or HUD renderer manipulation'};
  });
}

async function snapshot(page,fixture){
  return page.evaluate(({ids})=>{
    const button=document.getElementById('modeBtn'),rect=button?.getBoundingClientRect(),
      style=button?getComputedStyle(button):null,
      hit=rect?document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2):null;
    const selected=Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&usel[i])
      .map(i=>({id:i,type:utype[i],name:TYPES[utype[i]].name,mode:umode[i],
        modes:unitModes(utype[i]),generation:ugen[i]}));
    return {viewport:{width:innerWidth,height:innerHeight},matchLive:matchLive===true,running:running===true,
      deck:typeof hudDeck==='string'?hudDeck:null,selected,
      fixtures:ids.map(i=>({id:i,alive:!!ualive[i],selected:!!usel[i],mode:umode[i],
        generation:ugen[i],name:TYPES[utype[i]]?.name||null})),
      modeText:document.getElementById('modeNm')?.textContent?.trim()||null,
      modeGlyph:document.getElementById('modeEm')?.textContent?.trim()||null,
      ariaLabel:button?.getAttribute('aria-label')||null,
      button:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height,
        display:style.display,visibility:style.visibility,
        centerHit:hit===button||button.contains(hit),
        inViewport:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight}:null};
  },{ids:fixture.rows.map(row=>row.id)});
}

async function capture(page,outDir,name){
  const path=join(outDir,name+'.png');
  await page.screenshot({path,type:'png',animations:'disabled',scale:'device'});
  const image=await inspectPng(path);
  return {path:relative(root,path).split(sep).join('/'),width:image.width,height:image.height,
    bytes:image.bytes,sha256:image.sha256};
}

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const outDir=options.out?resolve(root,options.out):join(tmpRoot,'hud-mixed-stance',stamp);
if(!inside(tmpRoot,outDir))throw new Error('REFUSED_OUTPUT_OUTSIDE_TMP: '+outDir);
await mkdir(outDir,{recursive:true});
const report={schema:'massfront.hud-mixed-stance-packed.v1',startedAt:new Date().toISOString(),
  testedUrl:null,gpu:null,route:null,fixture:null,parityBefore:null,parityAfter:null,
  identityBefore:null,identityAfter:null,entry:null,toolSha256Before:null,toolSha256After:null,
  states:{},captures:[],checks:[],pageErrors:[],consoleErrors:[],httpFailures:[],blockedExternal:[],
  limitations:['One Striker and one Thumper are spawned through live game authority after a real Standard deployment. This is a deterministic HUD fixture, not Tech-2, resource, or production progression proof.',
    'Browser touch emulation and hardware WebGL2 do not replace physical Android or Safari testing.',
    'Screenshots require human art and clipping review; DOM geometry alone cannot approve visuals.'],summary:null};
let guard=null,serverRow=null,browser=null,fatal=null;
const check=(name,pass,evidence)=>{report.checks.push({name,pass:!!pass,evidence});return !!pass;};
try{
  guard=await acquireVerificationFreeze({root,label:'packed mixed-stance HUD acceptance',quietMs:5000,
    allowedPaths:[outDir,join(root,'modules','space_exploration','tmp'),
      join(root,'modules','space_exploration','.codex-remote-attachments')]});
  report.parityBefore=await sourceParity();
  check('source and packed HUD/game inputs match',report.parityBefore.every(row=>row.same),report.parityBefore);
  if(!report.parityBefore.every(row=>row.same))throw new Error('SOURCE_WWW_PARITY_FAILED');
  report.identityBefore=await collectEvidenceIdentity({root,packageRoot:wwwRoot,testedEntry:'index.html'});
  report.toolSha256Before=await sha256File(toolPath);
  serverRow=await startServer();report.testedUrl=serverRow.url;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
  const context=await browser.newContext({viewport:{width:S25_VIEWPORT.width,height:S25_VIEWPORT.height},
    deviceScaleFactor:S25_VIEWPORT.dpr,hasTouch:true,isMobile:true,userAgent:ANDROID_S25_USER_AGENT,
    colorScheme:'dark',serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>report.pageErrors.push(String(error?.message||error)));
  page.on('console',message=>{if(message.type()==='error'&&!/ERR_BLOCKED_BY_CLIENT/.test(message.text()))
    report.consoleErrors.push(message.text().slice(0,500));});
  page.on('response',response=>{if(response.status()>=400)report.httpFailures.push({status:response.status(),url:response.url()});});
  await page.route('**/*',async route=>{
    const raw=route.request().url();let url;
    try{url=new URL(raw);}catch{return route.abort('blockedbyclient');}
    if(['data:','blob:'].includes(url.protocol)||url.origin===new URL(report.testedUrl).origin)return route.continue();
    report.blockedExternal.push(raw);await route.abort('blockedbyclient');
  });
  const response=await page.goto(report.testedUrl,{waitUntil:'domcontentloaded',timeout:180000});
  if(!response)throw new Error('ENTRY_RESPONSE_MISSING');
  const entryBytes=await response.body();
  report.entry={status:response.status(),sha256:digest(entryBytes),bytes:entryBytes.length};
  check('served packed entry identity',response.status()===200&&
    report.entry.sha256===report.identityBefore.testedEntrySha256,report.entry);
  report.gpu=await assertHardwareGpu(page);
  report.route=await enterBattle(page);
  check('real offline Standard battle deployed',report.route.state.matchLive&&report.route.state.running&&
    report.route.state.offline&&report.route.state.hudTacticalDock,report.route);
  report.fixture=await seedLiveChassis(page);
  check('live local Striker and Thumper fixture',report.fixture.ok&&
    report.fixture.rows[0]?.name==='Striker'&&report.fixture.rows[1]?.name==='Thumper'&&
    report.fixture.rows.every(row=>row.mode===0),report.fixture);
  if(!report.fixture.ok)throw new Error('LIVE_CHASSIS_FIXTURE_FAILED');
  await click(page,'#armyBtn','army-selection',report.route.route);
  await click(page,'.hudDeckBtn[data-deck="platoons"]','platoons-deck',report.route.route);
  await page.locator('#modeBtn').waitFor({state:'visible',timeout:20000});
  const expectedIds=report.fixture.rows.map(row=>row.id);
  const verifyBefore=async(name)=>{
    const row=await snapshot(page,report.fixture);report.states[name]=row;
    const eligible=row.selected.filter(unit=>unit.modes.length>1);
    check(name+' selects exactly the two eligible chassis',eligible.length===2&&
      eligible[0].id===expectedIds[0]&&eligible[1].id===expectedIds[1]&&
      row.fixtures.every(unit=>unit.selected&&unit.alive),{eligible,fixtures:row.fixtures});
    check(name+' mixed readout and accessible name',row.modeText==='Mixed'&&row.modeGlyph==='↻'&&row.ariaLabel===expectedAria&&
      await page.getByRole('button',{name:expectedAria}).isVisible(),
      {modeText:row.modeText,ariaLabel:row.ariaLabel});
    check(name+' mode action visible and touchable',row.button?.width>=44&&row.button?.height>=44&&
      row.button?.centerHit&&row.button?.inViewport&&row.deck==='platoons'&&row.matchLive&&row.running,row);
  };
  await verifyBefore('beforePortrait');
  report.captures.push(await capture(page,outDir,'mixed-before-412x900'));
  await page.setViewportSize({width:915,height:412});await page.waitForTimeout(350);
  await verifyBefore('beforeLandscape');
  report.captures.push(await capture(page,outDir,'mixed-before-915x412'));
  await page.setViewportSize({width:S25_VIEWPORT.width,height:S25_VIEWPORT.height});await page.waitForTimeout(350);
  await click(page,'#modeBtn','cycle-selected-stances',report.route.route);
  const afterPortrait=await snapshot(page,report.fixture);report.states.afterPortrait=afterPortrait;
  check('UI stance action applied per chassis',afterPortrait.fixtures[0].mode===3&&
    afterPortrait.fixtures[1].mode===1&&afterPortrait.modeText==='Mixed'&&afterPortrait.modeGlyph==='↻'&&
    afterPortrait.ariaLabel===expectedAria,afterPortrait);
  report.captures.push(await capture(page,outDir,'mixed-after-412x900'));
  await page.setViewportSize({width:915,height:412});await page.waitForTimeout(350);
  const afterLandscape=await snapshot(page,report.fixture);report.states.afterLandscape=afterLandscape;
  check('mixed selection and action survive landscape rotation',afterLandscape.fixtures[0].mode===3&&
    afterLandscape.fixtures[1].mode===1&&afterLandscape.fixtures.every(unit=>unit.selected&&unit.alive)&&
    afterLandscape.modeText==='Mixed'&&afterLandscape.modeGlyph==='↻'&&afterLandscape.ariaLabel===expectedAria&&
    afterLandscape.button?.centerHit&&afterLandscape.button?.inViewport,afterLandscape);
  report.captures.push(await capture(page,outDir,'mixed-after-915x412'));
  await guard.checkpoint('mixed stance captures complete');
  await context.close();
  await closePwBrowser(browser);browser=null;
  await new Promise(ok=>serverRow.server.close(ok));serverRow=null;
  report.parityAfter=await sourceParity();
  report.identityAfter=await collectEvidenceIdentity({root,packageRoot:wwwRoot,testedEntry:'index.html'});
  report.toolSha256After=await sha256File(toolPath);
  check('source, packed package and verifier stayed stable',report.parityAfter.every(row=>row.same)&&
    sameIdentity(report.identityBefore,report.identityAfter)&&report.toolSha256Before===report.toolSha256After,
    {parityAfter:report.parityAfter,identityBefore:report.identityBefore,identityAfter:report.identityAfter});
}catch(error){fatal=error;}
finally{
  if(browser)await closePwBrowser(browser).catch(error=>{fatal??=error;});
  if(serverRow)await new Promise(ok=>serverRow.server.close(ok));
  if(guard)try{await guard.release({assertStable:true,name:'mixed stance HUD final release'});}catch(error){fatal??=error;}
  if(fatal)report.fatal=errorText(fatal);
  const hudPass=report.checks.filter(row=>/mixed readout|eligible chassis|mode action|UI stance action|survive landscape/.test(row.name))
    .every(row=>row.pass)&&report.states.afterLandscape!=null;
  const runtimePass=report.pageErrors.length===0&&report.consoleErrors.length===0&&report.httpFailures.length===0;
  const pass=!fatal&&report.checks.every(row=>row.pass)&&runtimePass;
  report.summary={outcome:pass?'PASS':'FAIL',hudPass,runtimePass,checks:report.checks.length,
    failedChecks:report.checks.filter(row=>!row.pass).map(row=>row.name),captures:report.captures.length,
    pageErrors:report.pageErrors.length,consoleErrors:report.consoleErrors.length,httpFailures:report.httpFailures.length,
    fatal:report.fatal||null,manualVisualReviewRequired:report.captures.length>0};
  await writeFile(join(outDir,'report.json'),JSON.stringify(report,null,2)+'\n','utf8');
  process.exitCode=pass?0:1;
  console.log(JSON.stringify({report:relative(root,join(outDir,'report.json')).split(sep).join('/'),summary:report.summary},null,2));
}
