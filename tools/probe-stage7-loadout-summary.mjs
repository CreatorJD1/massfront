#!/usr/bin/env node
/* Stage 7 deployment-loadout acceptance probe.
   This serves the current source tree, follows the player-facing Standard War
   Table route, and independently compares the DEPLOY summary with the live
   STORE, Development, inventory, commander, mode and quick-plan authorities.
   Evidence is rejected if source identity changes during capture. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {
  assertPwBrowserOwnership,
  closePwBrowser,
  launchPwBrowser,
  pwBrowserEvidence,
  recordPwBrowserGpu,
} from './pw-browser.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'..');
const OUT=join(ROOT,'tmp','stage7-loadout-summary');
const REPORT=join(OUT,'report.json');
const SOURCE_FILES=[
  'index.html','boot.js','assets/data/manifest.json','src/galaxyui.js',
  'src/game/meta.js','src/develop.js','src/storeui.js','src/game/commander.js',
  'src/main.js','tools/pw-browser.mjs','tools/chrome-gpu.mjs',
  'tools/probe-stage7-loadout-summary.mjs',
];
const PROFILES=[
  {id:'phone-412x900',width:412,height:900,launch:true},
  {id:'narrow-344x760',width:344,height:760,launch:false},
];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm','.glb':'model/gltf-binary'};
const SHA=value=>createHash('sha256').update(value).digest('hex');
const iso=()=>new Date().toISOString();
const clean=value=>String(value==null?'':value).replace(/\s+/g,' ').trim();
/* These profiles model touch phones, and MASSFRONT deliberately commits menu
   controls on pointer-up. Playwright's generic click does not emit that touch
   pointer sequence in a mobile context; locator.tap does, including the real
   shared slop/ghost-click contract that production devices use. The input
   safety layer also rejects a DIFFERENT control inside its 180 ms hardware
   bounce window. Automation can otherwise tap STANDARD in the same tick that
   WAR ROOM appears, a cadence no acceptance path should mistake for a second
   deliberate finger action. Let that production guard expire after each tap. */
const tap=async(locator,timeout=15000)=>{
  await locator.tap({timeout});
  await new Promise(resolve=>setTimeout(resolve,220));
};

function git(args){return execFileSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true}).trim();}
function sourceState(){
  const head=git(['rev-parse','HEAD']);
  const status=execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=all','--','.',':(exclude)tmp/stage7-loadout-summary/**'],{cwd:ROOT,encoding:null,windowsHide:true});
  const patch=execFileSync('git',['diff','--binary','HEAD','--'],{cwd:ROOT,encoding:null,windowsHide:true,maxBuffer:512*1024*1024});
  return {head,dirty:status.length>0,dirtyFingerprint:SHA(Buffer.concat([status,Buffer.from('\0TRACKED-PATCH\0'),patch])),dirtyBytes:status.length,trackedPatchBytes:patch.length};
}
async function identitySnapshot(){
  const files={};for(const rel of SOURCE_FILES)files[rel]=SHA(await readFile(join(ROOT,rel)));
  return {...sourceState(),files};
}
function pngDimensions(buffer){
  if(buffer.length<24||buffer.toString('ascii',1,4)!=='PNG')return null;
  return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
}
function sameList(a,b){return JSON.stringify(a)===JSON.stringify(b);}

async function seedRepresentative(page){
  return page.evaluate(()=>{
    playerFaction='nova';playerCommanderId='nova_kai';
    META.owned={cache:1,targeting:2};
    META.res={metallurgy:1,logistics:1};
    META.mods={plate:7.5};META.equip=['plate'];
    const lockable=typeof invLockableTypes==='function'?invLockableTypes():[],lock=lockable.length?lockable[0]:null;
    META.inventory={
      gear:{w_rangefinder:1,u_fluxcell:1},
      consumables:{c_supply:3,c_nanites:2},
      equipped:{weapon:'w_rangefinder',armor:'',utility:'u_fluxcell'},
      ready:['c_supply','c_nanites'],readyTy:lock==null?{}:{c_nanites:lock},
    };
    invBag();if(typeof metaSave==='function')metaSave();
    if(typeof renderCommanderRow==='function')renderCommanderRow();
    if(typeof mfGalaxySummary==='function')mfGalaxySummary();
    return {perks:{cache:1,targeting:2},module:{id:'plate',durability:7.5},gear:['w_rangefinder','u_fluxcell'],supplies:['c_supply','c_nanites'],supplyLock:lock,commander:playerCommanderId};
  });
}

async function expectedFromAuthorities(page){
  return page.evaluate(()=>{
    const fmt=n=>typeof modWearDisplay==='function'?modWearDisplay(n):Math.round(Math.max(0,n)*10)/10;
    const owned=META.owned||{};
    const perks=STORE.map(it=>{
      const tier=Math.min(it.max,Math.max(0,+owned[it.id]||0));
      return tier?{id:it.id,name:it.nm,detail:perkFx(it.id,tier)||it.ds,meta:'TIER '+tier+' / '+it.max}:null;
    }).filter(Boolean);
    const equipped=Array.isArray(META.equip)?META.equip:[],modInv=META.mods||{},wear=typeof wearRate==='function'?wearRate():1;
    const modules=equipped.map(id=>{
      const m=MODULES.find(x=>x.id===id);if(!m)return null;
      const cap=m.dur*DEV_MODULE_DURABILITY_CAP,current=Math.min(cap,Math.max(0,+modInv[id]||0));if(current<=0)return null;
      return {id:m.id,name:m.nm,detail:m.ds,meta:fmt(current)+' / '+fmt(cap)+' DUR · -'+fmt(wear)+' / MATCH · ~'+Math.ceil(current/wear)+' LEFT'};
    }).filter(Boolean);
    const bag=invBag();
    const gear=['weapon','armor','utility'].map(slot=>{
      const id=bag.equipped[slot]||'',g=INV_GEAR.find(x=>x.id===id);if(!g||(bag.gear[id]||0)<=0)return null;
      const fx=armInvEffect(id);return {id:g.id,name:g.nm,detail:fx.stat+' '+fx.value,meta:slot.toUpperCase()+' · ACTIVE WHILE FITTED'};
    }).filter(Boolean);
    const supplies=bag.ready.map(id=>{
      const c=INV_CONSUMABLES.find(x=>x.id===id),stock=bag.consumables[id]||0;if(!c||stock<=0)return null;
      const ty=bag.readyTy&&bag.readyTy[id],lock=c.scope==='type'?(ty!=null&&invLockName(ty)?'LOCKED · '+invLockName(ty):'NO CHASSIS LOCK · ARMY FALLBACK'):'ARMY-WIDE';
      return {id:c.id,name:c.nm,detail:c.ds,meta:'STOCK '+stock+' · '+lock+' · CONSUMES 1'};
    }).filter(Boolean);
    const commander=playerCommanderIdentity(),contract=modeRewardContract(activeWarMode),planId=mfQuickDetectedPlan();
    const planNode=document.querySelector('[data-mf-plan="'+planId+'"] b'),planName=planNode?planNode.textContent.trim():'CUSTOM PLAN';
    const ownership={
      permanent:{kind:'permanent',label:MF_OWNERSHIP_LABELS.permanent},
      modules:{kind:'crafted',label:MF_OWNERSHIP_LABELS.crafted},
      gear:{kind:'equipped',label:MF_OWNERSHIP_LABELS.equipped},
      supplies:{kind:'match',label:MF_OWNERSHIP_LABELS.match},
    };
    return {perks,modules,gear,supplies,ownership,commander:{id:commander.id,rank:commander.rank,name:commander.name,callsign:commander.callsign,role:commander.role,passive:commander.passive&&commander.passive.label,signature:commander.signature&&commander.signature.label},contract:{id:contract.id,nm:contract.nm,rule:contract.rule,xp:contract.xp},plan:{id:planId,name:planName},team:activeAllySlots().length?'ALLIED STRIKE':'SOLO COMMAND'};
  });
}

async function summaryDom(page){
  return page.evaluate(()=>{
    const root=document.getElementById('mfLoadoutSummary'),visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const items=kind=>[...root.querySelectorAll('[data-loadout-kind="'+kind+'"]')].map(el=>({id:el.dataset.itemId,text:el.textContent.replace(/\s+/g,' ').trim()}));
    const laneText=lane=>root.querySelector('[data-loadout-lane="'+lane+'"]')?.textContent.replace(/\s+/g,' ').trim()||'';
    const badge=lane=>{const el=root.querySelector('[data-loadout-lane="'+lane+'"] .mfOwnershipBadge');return el?{ownership:el.dataset.ownership||'',scope:el.dataset.scope||'',text:el.textContent.replace(/\s+/g,' ').trim()}:null;};
    return {present:!!root,visible:visible(root),plan:root?.dataset.plan||'',mode:root?.dataset.mode||'',team:root?.dataset.team||'',commander:root?.dataset.commander||'',text:root?.textContent.replace(/\s+/g,' ').trim()||'',items:{permanent:items('permanent'),module:items('module'),gear:items('gear'),supply:items('supply')},badges:{permanent:badge('permanent'),modules:badge('modules'),gear:badge('gear'),supplies:badge('supplies')},lanes:{commander:laneText('commander'),mode:laneText('mode'),permanent:laneText('permanent'),modules:laneText('modules'),gear:laneText('gear'),supplies:laneText('supplies')}};
  });
}

function compareSummary(actual,expected,label){
  const failures=[];
  const check=(ok,message)=>{if(!ok)failures.push(label+': '+message);};
  check(actual.present&&actual.visible,'summary missing or hidden');
  check(actual.plan===expected.plan.id,`plan dataset ${actual.plan} != ${expected.plan.id}`);
  check(actual.mode===expected.contract.id,`mode dataset ${actual.mode} != ${expected.contract.id}`);
  check(actual.team===expected.team,`team dataset ${actual.team} != ${expected.team}`);
  check(actual.commander===expected.commander.id,`commander dataset ${actual.commander} != ${expected.commander.id}`);
  const groups=[['permanent',expected.perks],['module',expected.modules],['gear',expected.gear],['supply',expected.supplies]];
  for(const [kind,want] of groups){
    const got=actual.items[kind];check(sameList(got.map(x=>x.id),want.map(x=>x.id)),`${kind} ids ${JSON.stringify(got.map(x=>x.id))} != ${JSON.stringify(want.map(x=>x.id))}`);
    for(const item of want){const row=got.find(x=>x.id===item.id);for(const field of ['name','detail','meta'])check(!!row&&clean(row.text).includes(clean(item[field])),`${kind}/${item.id} missing ${field}: ${item[field]}`);}
  }
  for(const value of [expected.commander.rank,expected.commander.name,expected.commander.callsign,expected.commander.role,expected.commander.passive,expected.commander.signature])if(value)check(clean(actual.lanes.commander).includes(clean(value)),'commander lane missing '+value);
  for(const value of [expected.contract.nm,expected.contract.rule,expected.plan.name,'×'+Number(expected.contract.xp).toFixed(2)+' XP'])check(clean(actual.lanes.mode).includes(clean(value)),'mode lane missing '+value);
  for(const [lane,want] of Object.entries(expected.ownership)){
    const got=actual.badges[lane];
    check(!!got,`${lane} ownership badge absent`);
    check(!!got&&got.ownership===want.kind,`${lane} ownership ${got&&got.ownership} != ${want.kind}`);
    check(!!got&&got.scope===want.kind,`${lane} scope ${got&&got.scope} != ${want.kind}`);
    check(!!got&&got.text===want.label,`${lane} label ${got&&got.text} != ${want.label}`);
  }
  check(actual.lanes.gear.includes('ACTIVE WHILE FITTED'),'equipped gear activation rule absent');
  check(actual.lanes.supplies.includes('CONSUMES 1'),'one-match consumption absent');
  return failures;
}

async function positionSummary(page){
  await page.evaluate(()=>{
    const root=document.getElementById('mfLoadoutSummary'),sc=document.querySelector('#setupScr .setupScroll'),step=document.querySelector('.mfGalaxyStepper');if(!root||!sc)return;
    const rr=root.getBoundingClientRect(),sr=sc.getBoundingClientRect(),sh=step?step.getBoundingClientRect().height:0;
    sc.scrollTop+=rr.top-sr.top-sh-8;
  });
  await page.waitForTimeout(100);
}

async function inspectLayout(page){
  return page.evaluate(()=>{
    const root=document.getElementById('mfLoadoutSummary'),sc=document.querySelector('#setupScr .setupScroll'),foot=document.querySelector('#setupScr .setupFoot'),step=document.querySelector('.mfGalaxyStepper');
    const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
    const rr=root?.getBoundingClientRect(),sr=sc?.getBoundingClientRect(),fr=foot?.getBoundingClientRect(),tr=step?.getBoundingClientRect();
    const horizontalOverflow=root?[...root.querySelectorAll('*')].filter(el=>{if(!visible(el))return false;const r=el.getBoundingClientRect();return r.left<rr.left-1||r.right>rr.right+1;}).map(el=>({tag:el.tagName,className:String(el.className||''),text:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,80)})):[];
    const obstructionSelectors=['#apOverlay','#apConfirmOverlay','#mfPreAlphaIntro','#mfBootCover','#loadScr'];
    const obstructions=obstructionSelectors.filter(sel=>visible(document.querySelector(sel)));
    const x=rr?(rr.left+rr.width/2):0,y=rr?Math.min(rr.bottom-2,rr.top+12):0,top=document.elementFromPoint(x,y);
    return {rect:rr&&{left:rr.left,top:rr.top,right:rr.right,bottom:rr.bottom,width:rr.width,height:rr.height},scrollRect:sr&&{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom},footerRect:fr&&{top:fr.top,bottom:fr.bottom},stepperHeight:tr?.height||0,viewport:{width:innerWidth,height:innerHeight},documentOverflow:document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1,summaryOverflow:!!root&&(root.scrollWidth>root.clientWidth+1||rr.left<-1||rr.right>innerWidth+1),horizontalOverflow,obstructions,footerClearsScroller:!!sr&&!!fr&&fr.top>=sr.bottom-1,headerBelowSticky:!!rr&&!!sr&&rr.top>=sr.top+(tr?.height||0)-1,headerHit:!!root&&!!top&&root.contains(top)};
  });
}

async function emptyStateCheck(page){
  return page.evaluate(()=>{
    META.owned={};META.mods={};META.equip=[];META.inventory={gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[],readyTy:{}};invBag();mfGalaxySummary();
    const texts=[...document.querySelectorAll('#mfLoadoutSummary .mfLoadoutEmpty')].map(el=>el.textContent.replace(/\s+/g,' ').trim());
    const expected=['No permanent STORE perks retained.','No wearing Development modules fitted.','No account gear fitted.','No ONE MATCH supplies readied.'];
    return {texts,expected,status:JSON.stringify(texts)===JSON.stringify(expected)};
  });
}

async function capture(page,path,expected){
  const buffer=await page.screenshot({path,fullPage:false}),dimensions=pngDimensions(buffer);
  return {path,relativePath:relative(ROOT,path).replace(/\\/g,'/'),sha256:SHA(buffer),bytes:buffer.length,dimensions,expected,valid:!!dimensions&&dimensions.width===expected.width&&dimensions.height===expected.height};
}
async function captureElement(page,path,profile){
  const buffer=await page.locator('#mfLoadoutSummary').screenshot({path}),dimensions=pngDimensions(buffer);
  return {path,relativePath:relative(ROOT,path).replace(/\\/g,'/'),sha256:SHA(buffer),bytes:buffer.length,dimensions,valid:!!dimensions&&dimensions.width>0&&dimensions.width<=profile.width&&dimensions.height>0};
}

async function openStandardDeploy(page){
  const visible=id=>page.waitForFunction(id=>{const el=document.getElementById(id);if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;},id,{timeout:15000});
  await tap(page.locator('#startBtn'));await visible('warScr');
  await tap(page.locator('.warCard[data-mode="standard"]'));await visible('setupScr');
  await page.waitForFunction(()=>typeof mfGalaxyStage!=='undefined'&&mfGalaxyStage==='galaxy',{timeout:10000});
  const seed=await seedRepresentative(page),route=['galaxy'];
  for(const stage of ['system','planet','region','deploy']){
    await tap(page.locator('#setupStart'),20000);
    await page.waitForFunction(stage=>mfGalaxyStage===stage,stage,{timeout:10000});route.push(stage);await page.waitForTimeout(450);
  }
  return {seed,route};
}

async function launchMatch(page){
  const before=await page.evaluate(()=>({stage:mfGalaxyStage,commander:playerCommanderIdentity()?.id||'',ready:invBag().ready.slice(),gear:Object.values(invBag().equipped).filter(Boolean)}));
  const startedAt=iso();await tap(page.locator('#setupStart'),90000);
  await page.waitForFunction(()=>typeof running!=='undefined'&&running===true,{timeout:90000});
  const deploy=page.locator('#deployBtn');await deploy.waitFor({state:'visible',timeout:90000});await tap(deploy,30000);
  await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive===true,{timeout:20000});
  const after=await page.evaluate(()=>({running,matchLive,stage:typeof mfGalaxyStage!=='undefined'?mfGalaxyStage:null,setupVisible:(()=>{const e=document.getElementById('setupScr');return !!e&&getComputedStyle(e).display!=='none';})(),commander:playerCommanderIdentity()?.id||'',matchConsumables:Array.isArray(_mfMatchCons)?_mfMatchCons.map(x=>x.id):[],matchGear:Array.isArray(_mfMatchGear)?_mfMatchGear.map(x=>x.id):[],ready:invBag().ready.slice()}));
  const failures=[];
  if(before.stage!=='deploy')failures.push('setupStart was not launched from DEPLOY');
  if(!after.running||!after.matchLive||after.setupVisible)failures.push('real setupStart/deploy path did not reach a live match');
  if(after.commander!==before.commander)failures.push('battle commander changed across launch');
  if(!sameList(after.matchConsumables,before.ready))failures.push('readied supplies did not become the match consumable snapshot');
  if(!sameList(after.matchGear,before.gear))failures.push('equipped account gear did not become the match gear snapshot');
  if(after.ready.length)failures.push('one-mission supplies were not consumed at launch');
  return {startedAt,finishedAt:iso(),before,after,failures,status:failures.length?'FAIL':'PASS'};
}

async function main(){
  await mkdir(OUT,{recursive:true});const startedAt=iso(),identityBefore=await identitySnapshot(),blockers=[],profiles=[];
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent((req.url||'/').split('?')[0]),candidate=resolve(ROOT,pathname==='/'?'index.html':pathname.replace(/^\/+/,'')),prefix=resolve(ROOT)+sep;
      if(candidate!==resolve(ROOT,'index.html')&&!candidate.startsWith(prefix)){res.writeHead(403);res.end('forbidden');return;}
      const body=await readFile(candidate);res.writeHead(200,{'Content-Type':MIME[extname(candidate).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Massfront-Evidence-Root':'source'});res.end(body);
    }catch{res.writeHead(404);res.end('not found');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const port=server.address().port,url=`http://127.0.0.1:${port}/?stage7LoadoutProbe=1`;let browser=null,browserIdentity=null,gpu=null,servedFiles={};
  try{
    for(const rel of SOURCE_FILES){const response=await fetch(new URL(rel,url)),body=Buffer.from(await response.arrayBuffer()),sha=SHA(body);servedFiles[rel]={status:response.status,sourceHeader:response.headers.get('x-massfront-evidence-root'),sha256:sha,localSha256:identityBefore.files[rel],match:response.ok&&response.headers.get('x-massfront-evidence-root')==='source'&&sha===identityBefore.files[rel]};if(!servedFiles[rel].match)blockers.push('served-source mismatch: '+rel);}
    browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});browserIdentity=await assertPwBrowserOwnership(browser);
    for(const profile of PROFILES){
      const pageErrors=[],consoleErrors=[],requestFailures=[],badSourceResponses=[],failures=[];
      const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:1,hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 MASSFRONT-Stage7-Loadout-QA',colorScheme:'dark',reducedMotion:'reduce'}),page=await context.newPage();
      page.on('pageerror',error=>pageErrors.push(String(error?.message||error)));
      page.on('console',message=>{if(message.type()==='error'){const loc=message.location(),locUrl=loc.url||'';consoleErrors.push({text:message.text(),location:{...loc,url:locUrl.slice(0,256),urlLength:locUrl.length,urlSha256:locUrl?SHA(locUrl):''}});}});
      page.on('requestfailed',request=>{const failedUrl=request.url();requestFailures.push({url:failedUrl.slice(0,256),urlLength:failedUrl.length,urlSha256:SHA(failedUrl),type:request.resourceType(),error:request.failure()?.errorText||'unknown'});});
      page.on('response',response=>{if(response.status()>=400&&['document','script','stylesheet'].includes(response.request().resourceType()))badSourceResponses.push({url:response.url(),type:response.request().resourceType(),status:response.status()});});
      await page.addInitScript(()=>{window.__mfStage7LoadoutGlLosses=0;addEventListener('webglcontextlost',()=>window.__mfStage7LoadoutGlLosses++,true);try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_offline','1');}catch{}});
      const rec={profile,url,startedAt:iso(),pageErrors,consoleErrors,requestFailures,badSourceResponses,failures,status:'UNKNOWN'};
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForFunction(()=>typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady&&typeof playerCommanderIdentity==='function'&&typeof modeRewardContract==='function'&&typeof mfQuickDetectedPlan==='function',{timeout:45000});
        await page.waitForTimeout(11000);
        const intro=page.locator('#mfIntroStart');if(await intro.isVisible()){await tap(intro);await page.waitForTimeout(500);}
        const gate=page.locator('#apCloseBtn');if(await gate.isVisible()){await tap(gate);await page.waitForTimeout(100);}
        gpu=await assertHardwareGpu(page);try{recordPwBrowserGpu(browser,gpu);}catch{}
        rec.runtime=await page.evaluate(()=>({sourceMarker:document.querySelector('script[src*="src/"]')?.src||'',viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},initMissing:window.__MF_INIT_MISSING||[],glLosses:window.__mfStage7LoadoutGlLosses||0}));
        const opened=await openStandardDeploy(page);rec.seed=opened.seed;rec.route=opened.route;
        await tap(page.locator('[data-mf-plan="first"]'));await page.waitForFunction(()=>document.getElementById('mfLoadoutSummary')?.dataset.plan==='first',{timeout:5000});
        const initialExpected=await expectedFromAuthorities(page),initialActual=await summaryDom(page);failures.push(...compareSummary(initialActual,initialExpected,'initial'));rec.initial={expected:initialExpected,actual:initialActual};
        rec.empty=await emptyStateCheck(page);if(!rec.empty.status)failures.push('empty states do not match all four honest authority lanes');
        await seedRepresentative(page);await page.waitForTimeout(60);
        const commanderBefore=await page.evaluate(()=>document.getElementById('mfLoadoutSummary').dataset.commander),commanderPick=page.locator('.mfQuickCommander:not(.on)').first();
        await tap(commanderPick);await page.waitForFunction(before=>{const id=document.getElementById('mfLoadoutSummary')?.dataset.commander;return !!id&&id!==before;},commanderBefore,{timeout:5000});
        const commanderExpected=await expectedFromAuthorities(page),commanderActual=await summaryDom(page);failures.push(...compareSummary(commanderActual,commanderExpected,'commander-refresh'));rec.commanderRefresh={before:commanderBefore,after:commanderActual.commander,expected:commanderExpected.commander};
        await tap(page.locator('[data-mf-plan="fortress"]'));await page.waitForFunction(()=>document.getElementById('mfLoadoutSummary')?.dataset.plan==='fortress',{timeout:5000});
        const planExpected=await expectedFromAuthorities(page),planActual=await summaryDom(page);failures.push(...compareSummary(planActual,planExpected,'plan-refresh'));rec.planRefresh={after:planActual.plan,expected:planExpected.plan};
        const ally=page.locator('[data-mf-team="ally"]');if(await ally.evaluate(el=>el.classList.contains('locked')))failures.push('allied team control unexpectedly locked on the Standard route');else{await tap(ally);await page.waitForFunction(()=>document.getElementById('mfLoadoutSummary')?.dataset.team==='ALLIED STRIKE',{timeout:5000});}
        const teamExpected=await expectedFromAuthorities(page),teamActual=await summaryDom(page);failures.push(...compareSummary(teamActual,teamExpected,'team-refresh'));rec.teamRefresh={after:teamActual.team,expected:teamExpected.team};
        await tap(page.locator('#mfAdvanced > summary'));const goal=page.locator('#mfAdvancedBody .glbtn[data-g="domination"]');await goal.waitFor({state:'visible',timeout:5000});await tap(goal);
        await page.waitForFunction(()=>document.getElementById('mfLoadoutSummary')?.dataset.plan==='custom',{timeout:5000});
        const advancedExpected=await expectedFromAuthorities(page),advancedActual=await summaryDom(page);failures.push(...compareSummary(advancedActual,advancedExpected,'advanced-refresh'));rec.advancedRefresh={after:advancedActual.plan,expected:advancedExpected.plan};
        await tap(page.locator('#mfAdvanced > summary'));await tap(page.locator('[data-mf-plan="fortress"]'));await page.waitForFunction(()=>document.getElementById('mfLoadoutSummary')?.dataset.plan==='fortress',{timeout:5000});
        const finalExpected=await expectedFromAuthorities(page),finalActual=await summaryDom(page);failures.push(...compareSummary(finalActual,finalExpected,'final'));rec.final={expected:finalExpected,actual:finalActual};
        await positionSummary(page);rec.layout=await inspectLayout(page);
        if(rec.layout.documentOverflow||rec.layout.summaryOverflow||rec.layout.horizontalOverflow.length)failures.push('responsive horizontal overflow: '+JSON.stringify(rec.layout));
        if(rec.layout.obstructions.length||!rec.layout.footerClearsScroller||!rec.layout.headerBelowSticky||!rec.layout.headerHit)failures.push('summary obstruction: '+JSON.stringify(rec.layout));
        rec.screenshots={viewport:await capture(page,join(OUT,profile.id+'-deploy.png'),{width:profile.width,height:profile.height}),summary:await captureElement(page,join(OUT,profile.id+'-summary.png'),profile)};
        if(!rec.screenshots.viewport.valid||!rec.screenshots.summary.valid)failures.push('invalid screenshot dimensions');
        if(profile.launch)rec.launch=await launchMatch(page);else rec.launch={status:'SKIP',reason:'One full source-matched setupStart + carrier deployment is performed in the 412x900 profile; this profile is the independent narrow responsive acceptance.'};
        if(rec.launch.status==='FAIL')failures.push(...rec.launch.failures.map(x=>'launch: '+x));
        rec.webgl=await page.evaluate(()=>({contextLosses:window.__mfStage7LoadoutGlLosses||0,mainContextLost:typeof gl!=='undefined'&&gl?.isContextLost?gl.isContextLost():null,mainError:typeof gl!=='undefined'&&gl?.getError?gl.getError():null}));
        if(rec.runtime.initMissing.length)failures.push('runtime init missing: '+JSON.stringify(rec.runtime.initMissing));
        if(rec.webgl.contextLosses!==0||rec.webgl.mainContextLost===true||![null,0].includes(rec.webgl.mainError))failures.push('WebGL state: '+JSON.stringify(rec.webgl));
      }catch(error){failures.push(String(error?.stack||error));}
      if(pageErrors.length)failures.push('page errors: '+pageErrors.join(' | '));if(consoleErrors.length)failures.push('console errors: '+JSON.stringify(consoleErrors));if(requestFailures.length)failures.push('request failures: '+JSON.stringify(requestFailures));if(badSourceResponses.length)failures.push('source HTTP failures: '+JSON.stringify(badSourceResponses));
      rec.finishedAt=iso();rec.status=failures.length?'FAIL':'PASS';if(failures.length)blockers.push(...failures.map(x=>profile.id+': '+x));profiles.push(rec);await context.close();
    }
    await assertPwBrowserOwnership(browser);
  }catch(error){blockers.push(String(error?.stack||error));}
  finally{if(browser){try{await closePwBrowser(browser);}catch(error){blockers.push('browser cleanup: '+(error.message||error));}}await new Promise(ok=>server.close(ok));}
  const identityAfter=await identitySnapshot(),identityStable=identityBefore.head===identityAfter.head&&identityBefore.dirtyFingerprint===identityAfter.dirtyFingerprint&&SOURCE_FILES.every(rel=>identityBefore.files[rel]===identityAfter.files[rel]);
  if(!identityStable)blockers.push('source identity changed during capture; evidence rejected');
  const accepted=profiles.filter(p=>p.status==='PASS').length,report={schema:'MassfrontStage7LoadoutSummaryEvidenceV1',generatedAt:iso(),startedAt,sourceMode:'current-source',url,port,launchPreset:{launcher:'tools/pw-browser.mjs',ownershipMode:'isolated',headless:true,angle:'d3d11',softwareGpuForbidden:true},identity:{before:identityBefore,after:identityAfter,stable:identityStable},servedFiles,browser:browserIdentity?{...browserIdentity,gpu:pwBrowserEvidence(browser)?.gpu||gpu||browserIdentity.gpu||null}:null,profiles,summary:{requested:PROFILES.length,accepted,rejected:PROFILES.length-accepted,blockerCount:blockers.length},blockers,status:identityStable&&accepted===PROFILES.length&&!blockers.length?'PASS':'FAIL'};
  await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,summary:report.summary,head:identityBefore.head,dirtyFingerprint:identityBefore.dirtyFingerprint,url,report:REPORT,screenshots:profiles.flatMap(p=>Object.values(p.screenshots||{}).map(x=>x.path)),blockers},null,2));
  if(report.status!=='PASS')process.exitCode=2;
}

main().catch(async error=>{
  const failure={schema:'MassfrontStage7LoadoutSummaryEvidenceV1',generatedAt:iso(),status:'FAIL',summary:{requested:PROFILES.length,accepted:0,rejected:PROFILES.length,blockerCount:1},blockers:[String(error?.stack||error)]};
  try{await mkdir(OUT,{recursive:true});await writeFile(REPORT,JSON.stringify(failure,null,2)+'\n');}catch{}
  console.error(error);process.exitCode=2;
});
