#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,extname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const HERE=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(HERE,'..'),OUT=join(ROOT,'tmp','building-service-ui');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm'};
const CASES=[{name:'phone-344x780',width:344,height:780},{name:'phone-412x915',width:412,height:915},
  {name:'landscape-915x412',width:915,height:412},{name:'tablet-1024x768',width:1024,height:768}];

const main=await readFile(join(ROOT,'src','main.js'),'utf8'),consumer=await readFile(join(ROOT,'src','game','matchconsumer.js'),'utf8');
const recycleHandler=main.slice(main.indexOf('function mfBuildingRecyclePress'),main.indexOf('function wire()',main.indexOf('function mfBuildingRecyclePress')));
assert.match(main,/C\[method\]\(target,!!active\)/);assert.match(main,/C\[method\]\(target\)/);
assert.match(consumer,/submitRepair:mcSubmitRepair,submitRecycle:mcSubmitRecycle/);
assert.doesNotMatch(recycleHandler,/\bcredit\s*\(|\.alive\s*=\s*false|\brebuildBGrid\s*\(/);

await mkdir(OUT,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent((req.url||'/').split('?')[0]),file=resolve(join(ROOT,pathname==='/'?'index.html':pathname.slice(1)));
    if(!file.startsWith(ROOT)){res.writeHead(403);res.end('forbidden');return;}
    const body=await readFile(file);res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const url=`http://127.0.0.1:${server.address().port}/`;
let browser,page;
const errors=[],results=[];
try{
  browser=await launchPwBrowser();
  page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1,hasTouch:true,isMobile:true,colorScheme:'dark'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{try{localStorage.setItem('mf_auth_gate_v1','1');localStorage.setItem('mf_offline','1');}catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.addStyleTag({content:'#mfPreAlphaIntro,#apOverlay,#apConfirmOverlay,#updScr,#startScreen{display:none!important}'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof addBld==='function'&&typeof resetWorld==='function'&&typeof MFBuildingService==='object'&&
    typeof mfRenderBuildingServiceControls==='function'&&typeof mfBuildingRepairPress==='function'&&!!document.getElementById('bp_repair'),null,{timeout:90000});
  const launchOffline=page.locator('#mfLaunchOffline');if(await launchOffline.isVisible())await launchOffline.click();
  await page.waitForTimeout(180);
  const accountOffline=page.locator('#apOfflineBtn');if(await accountOffline.isVisible())await accountOffline.click();
  await page.waitForTimeout(180);
  const setup=await page.evaluate(()=>{
    try{stopAttract();}catch{}
    try{hideFrontScreens();}catch{}
    try{resetWorld();}catch{}
    document.body.classList.remove('menuMode','mfMenuOpen','uiIntelOpen','mfLauncherGate');document.body.classList.add('mfIntroDone','uiPrimaryOpen');
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#buildMenu,#prodMenu,#bldMenu2,#authGate,#apOverlay').forEach(el=>el.style.display='none');
    document.querySelectorAll('.overlay,.frontScreen,#dispatch,#authGate,#apOverlay').forEach(el=>{el.style.setProperty('visibility','hidden','important');el.style.setProperty('pointer-events','none','important');});
    const launcher=document.getElementById('updScr');if(launcher)launcher.style.setProperty('display','none','important');
    running=true;matchLive=true;paused=true;fogOn=false;blds.length=0;rebuildBGrid(true);
    const B=addBld('pgen',0,MAP*.5,MAP*.5,true,0);B.hp=B.hpm*.45;B.prog=1;B.dmgT=0;B.repairOn=false;B.repairStalled=false;
    openBld=blds.indexOf(B);renderBldPanel();document.getElementById('bldMenu2').style.display='block';
    return {id:openBld,type:B.type,hp:B.hp,hpm:B.hpm};
  });
  assert.equal(setup.type,'pgen');

  for(const V of CASES){
    await page.setViewportSize({width:V.width,height:V.height});await page.waitForTimeout(80);
    const state=await page.evaluate(()=>{
      const panel=document.getElementById('bldMenu2'),row=document.getElementById('mfBldServiceActions'),repair=document.getElementById('bp_repair'),recycle=document.getElementById('bp_sell');
      document.querySelectorAll('.overlay,.frontScreen,#dispatch,#authGate,#apOverlay').forEach(el=>{el.style.setProperty('visibility','hidden','important');el.style.setProperty('pointer-events','none','important');});
      panel.style.setProperty('display','block','important');panel.style.setProperty('visibility','visible','important');renderBldPanel();
      const box=el=>{const r=el.getBoundingClientRect();return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};};
      const occluders=Array.from(document.querySelectorAll('.overlay,.frontScreen,#mfPreAlphaIntro,#apOverlay,#apConfirmOverlay')).filter(el=>{
        const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&el.offsetParent!==null;
      }).map(el=>el.id||el.className);
      const notice=document.getElementById('mfNoticeDock'),noticeDockHidden=!notice||getComputedStyle(notice).display==='none'||notice.offsetParent===null;
      return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},panel:box(panel),row:box(row),repair:box(repair),recycle:box(recycle),
        panelParent:row.parentElement.id,repairState:repair.dataset.state,repairLabel:repair.textContent,recycleLabel:recycle.textContent,
        repairColor:getComputedStyle(repair).color,recycleColor:getComputedStyle(recycle).color,occluders,noticeDockHidden};
    });
    const inView=state.panel.x>=-1&&state.panel.y>=-1&&state.panel.x+state.panel.width<=V.width+1&&state.panel.y+state.panel.height<=V.height+1;
    const targets=state.repair.width>=44&&state.repair.height>=44&&state.recycle.width>=44&&state.recycle.height>=44;
    const fit=state.repair.scrollWidth<=state.repair.clientWidth+1&&state.recycle.scrollWidth<=state.recycle.clientWidth+1;
    const unobstructed=state.occluders.length===0;
    const shot=join(OUT,V.name+'.png');await page.screenshot({path:shot,fullPage:false});
    results.push({name:V.name,...state,inView,targets,fit,unobstructed,screenshot:shot,
      status:inView&&targets&&fit&&unobstructed&&state.noticeDockHidden&&state.panelParent==='bldMenu2'?'PASS':'FAIL'});
  }

  await page.setViewportSize({width:412,height:915});
  await page.evaluate(id=>{openBld=id;document.body.classList.remove('menuMode','mfMenuOpen','uiIntelOpen','mfLauncherGate');
    updScr.style.setProperty('display','none','important');renderBldPanel();bldMenu2.style.setProperty('display','block','important');
    bldMenu2.style.setProperty('visibility','visible','important');prodMenu.style.display='none';},setup.id);
  await page.locator('#bp_repair').click({force:true});await page.waitForTimeout(80);
  const repairOn=await page.evaluate(()=>({quote:MFBuildingService.quote(blds[openBld]),label:bp_repair.textContent,state:bp_repair.dataset.state}));
  assert.equal(repairOn.quote.active,true);assert.equal(repairOn.state,'repairing');assert.equal(repairOn.label,'REPAIRING');
  const states=await page.evaluate(()=>{
    const B=blds[openBld],read=()=>({state:bp_repair.dataset.state,label:bp_repair.textContent,pressed:bp_repair.getAttribute('aria-pressed'),disabled:bp_repair.disabled});
    B.repairStalled=true;mfRenderBuildingServiceControls(B,'bldMenu2');const stalled=read();
    B.repairStalled=false;B.dmgT=6;mfRenderBuildingServiceControls(B,'bldMenu2');const underFire=read();
    B.repairOn=false;B.dmgT=0;B.hp=B.hpm;mfRenderBuildingServiceControls(B,'bldMenu2');const full=read();
    B.hp=B.hpm*.45;mfRenderBuildingServiceControls(B,'bldMenu2');return {stalled,underFire,full};
  });
  assert.deepEqual([states.stalled.state,states.underFire.state,states.full.state],['stalled','under-fire','full']);
  assert.deepEqual([states.stalled.label,states.underFire.label,states.full.label],['STALLED','UNDER FIRE','FULL HEALTH']);
  assert.equal(states.full.disabled,true);

  /* The global hardware-bounce guard deliberately rejects a second control
     inside 180 ms; model two intentional human taps rather than a switch-bounce. */
  await page.waitForTimeout(220);
  await page.locator('#bp_sell').click({force:true});await page.waitForTimeout(80);
  const armed=await page.evaluate(()=>({alive:blds[openBld].alive,armed:bp_sell.dataset.armed,label:bp_sell.textContent,
    confirmAt:blds[openBld].recycleConfirmAt||0,now:Date.now(),toast:document.getElementById('toast')?.textContent||'',risk:bp_sell.dataset.mfRisk||''}));
  assert.equal(armed.alive,true);assert.equal(armed.armed,'true');assert.match(armed.label,/^CONFIRM/);
  await page.waitForTimeout(220);
  await page.locator('#bp_sell').click({force:true});await page.waitForTimeout(120);
  const recycled=await page.evaluate(id=>({alive:blds[id]?.alive,openBld,menu:bldMenu2.style.display}),setup.id);
  assert.equal(recycled.alive,false);

  const production=await page.evaluate(()=>{
    const B=addBld('fac',0,MAP*.5+90,MAP*.5,true,0);B.hp=B.hpm*.55;B.prog=1;B.tier=2;
    openBld=blds.indexOf(B);renderProdMenu();bldMenu2.style.setProperty('display','none','important');
    prodMenu.style.setProperty('display','block','important');prodMenu.style.setProperty('visibility','visible','important');
    const row=mfBldServiceActions,rr=bp_repair.getBoundingClientRect(),sr=bp_sell.getBoundingClientRect();
    const notice=document.getElementById('mfNoticeDock'),noticeDockHidden=!notice||getComputedStyle(notice).display==='none'||notice.offsetParent===null;
    return {parent:row.parentElement.id,repairState:bp_repair.dataset.state,repair:[rr.width,rr.height],recycle:[sr.width,sr.height],factory:openBld,noticeDockHidden};
  });
  assert.equal(production.parent,'prodMenu');assert(production.repair[0]>=44&&production.repair[1]>=44);assert(production.recycle[0]>=44&&production.recycle[1]>=44);
  assert.equal(production.noticeDockHidden,true);
  await page.screenshot({path:join(OUT,'production-412x915.png'),fullPage:false});

  const summary={schema:'massfront-building-service-ui-v1',url,errors,results,repairOn,states,armed,recycled,production,
    status:!errors.length&&results.every(R=>R.status==='PASS')?'PASS':'FAIL'};
  await writeFile(join(OUT,'report.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({status:summary.status,resolutions:results.map(R=>({name:R.name,status:R.status,targets:R.targets,inView:R.inView,fit:R.fit,unobstructed:R.unobstructed,noticeDockHidden:R.noticeDockHidden})),
    stateLabels:[repairOn.label,states.stalled.label,states.underFire.label,states.full.label],recycle:{armed:armed.label,aliveAfterConfirm:recycled.alive},
    production,parent:production.parent,pageErrors:errors,report:join(OUT,'report.json')},null,2));
  if(summary.status!=='PASS')process.exitCode=2;
}finally{
  if(page)await page.close().catch(()=>{});if(browser)await closePwBrowser(browser);await new Promise(ok=>server.close(ok));
}
