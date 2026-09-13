#!/usr/bin/env node
/* Cinematic HUD acceptance harness.

   This is deliberately a consumer of the shipped UI, not a synthetic HTML
   fixture.  It enters an offline Standard battle through the launcher, War
   Room, staged war table, and carrier deployment before it asks the live HUD
   to expose each state.  Runtime controller calls are used only to make a
   deterministic selection/building/cue available after that real route.

   Modes:
     --quick          one phone, every state, screenshots (default)
     --matrix=visual  bounded pairwise visual sweep, every state/screenshots
     --matrix=full    168 structural configurations; representative captures

   The full matrix reuses one deployed battle per DPR/device profile. That
   makes 2,688 HUD state checks practical without replacing real boot/deploy
   with a mock. */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, isAndroidMobileUserAgent,
  mobileGpuBranchExpected } from './mobile-device-profile.mjs';
import { collectEvidenceIdentity, sha256File } from './evidence-foundation/fingerprints.mjs';
import { inspectPng } from './evidence-foundation/png-evidence.mjs';
import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs';

process.env.PW_CDP_PORT ||= '9516';
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const wwwRoot=join(root,'www');
const tmpRoot=join(root,'.tmp');
const toolPath=join(root,'tools','verify-cinematic-hud.mjs');
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.webmanifest':'application/manifest+json',
  '.wasm':'application/wasm','.ktx2':'image/ktx2','.bin':'application/octet-stream'};
const STATES=['resting','unit-group-palette','abilities','abilities-utility','abilities-consumables','build','production','structure-service',
  'placement','base-finder','unit-intel','consumables','hazard-infestation',
  'transmission-commander','transmission-keel','event-feed'];
const EXPECTED_SURFACE={
  resting:null,'unit-group-palette':'grpRow',abilities:'hotSlots',
  'abilities-utility':['hotSlots','hotUtilityPanel'],
  'abilities-consumables':['hotSlots','hotUtilityPanel','consHud'],build:'buildMenu',production:'prodMenu',
  'structure-service':'bldMenu2',placement:'placeUI','transmission-commander':'cmdrTx',
  'base-finder':'baseFinder','unit-intel':'unitCard',consumables:'consHud',
  'hazard-infestation':['hazChip','infMeter'],
  'transmission-keel':'cmdrTx','event-feed':'mfNoticeHistory'
};
const CAPTURE_STATES=new Set(STATES);
const ROTATION_GEOMETRY_STATES=['unit-group-palette','abilities','abilities-utility','abilities-consumables','build','production',
  'structure-service','placement','base-finder','unit-intel','consumables','hazard-infestation',
  'transmission-commander','transmission-keel','event-feed'];
const IDENTITY_KEYS=['gitHead','dirtyFingerprint','runtimeFingerprint','testedEntrySha256',
  'testedPackageSha256','packageFingerprint'];

function help(){
  console.log(`MASSFRONT cinematic HUD verifier

Usage:
  node tools/verify-cinematic-hud.mjs --quick [options]
  node tools/verify-cinematic-hud.mjs --matrix=visual [options]
  node tools/verify-cinematic-hud.mjs --matrix=full [options]

Options:
  --url <url>             Test an already-served build (default: serve www/)
  --out <path>            Evidence directory below .tmp/ (default is timestamped)
  --states <csv>          Subset of ${STATES.join(',')}
  --screenshots <mode>    all, representative, or none
  --quiet-ms <ms>         Stable-source preflight, minimum 5000 (default 5000)
  --headed                Show the managed hardware-GPU Chrome window
  --self-check            Validate matrix/device contracts without launching Chrome
  --help                  Print this text

Full matrix contract: 64 portrait + 72 landscape + 16 tablet + 16 desktop =
168 configurations. Each configuration records every requested HUD state in
JSON. Full mode captures only one representative configuration per viewport;
use --screenshots=all only when the storage/runtime cost is intentional.`);
}

function parseArgs(argv){
  const out={mode:'quick',url:null,out:null,states:[...STATES],screenshots:null,headed:false,quietMs:5000,
    selfCheck:false,help:false};
  const take=(arg,i)=>arg.includes('=')?[arg.slice(arg.indexOf('=')+1),i]:[argv[i+1],i+1];
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--help'||arg==='-h'){out.help=true;continue;}
    if(arg==='--quick'){out.mode='quick';continue;}
    if(arg==='--headed'){out.headed=true;continue;}
    if(arg==='--self-check'){out.selfCheck=true;continue;}
    if(arg==='--matrix'){out.mode='visual';continue;}
    if(arg.startsWith('--matrix=')){
      const value=arg.slice(9);if(!['visual','full'].includes(value))throw new Error('Unknown matrix mode: '+value);
      out.mode=value;continue;
    }
    if(arg==='--url'||arg.startsWith('--url=')){const v=take(arg,i);out.url=v[0];i=v[1];continue;}
    if(arg==='--out'||arg.startsWith('--out=')){const v=take(arg,i);out.out=v[0];i=v[1];continue;}
    if(arg==='--states'||arg.startsWith('--states=')){
      const v=take(arg,i);out.states=String(v[0]||'').split(',').map(s=>s.trim()).filter(Boolean);i=v[1];continue;
    }
    if(arg==='--screenshots'||arg.startsWith('--screenshots=')){
      const v=take(arg,i);out.screenshots=String(v[0]||'');i=v[1];continue;
    }
    if(arg==='--quiet-ms'||arg.startsWith('--quiet-ms=')){
      const v=take(arg,i);out.quietMs=Number(v[0]);i=v[1];continue;
    }
    throw new Error('Unknown argument: '+arg);
  }
  if(!out.states.length)throw new Error('--states cannot be empty');
  for(const state of out.states)if(!STATES.includes(state))throw new Error('Unknown HUD state: '+state);
  if(!Number.isFinite(out.quietMs)||out.quietMs<5000)throw new Error('--quiet-ms must be at least 5000');
  out.screenshots ||= out.mode==='quick'?'all':out.mode==='visual'?'all':'representative';
  if(!['all','representative','none'].includes(out.screenshots))throw new Error('--screenshots must be all, representative, or none');
  return out;
}

function inside(base,target){
  const rel=relative(resolve(base),resolve(target));
  return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..');
}
function slug(value){return String(value||'state').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'state';}
function digest(value){return createHash('sha256').update(value).digest('hex');}
function sameIdentity(a,b){return IDENTITY_KEYS.every(key=>a?.[key]===b?.[key]);}
function errorText(error){return String(error&&error.stack||error&&error.message||error);}
function visibleLocator(page,selector){return page.locator(selector).first().isVisible().catch(()=>false);}

const SAFE={
  none:{name:'none',top:0,right:0,bottom:0,left:0},
  portrait:{name:'portrait-stress',top:47,right:10,bottom:34,left:10},
  'notch-left':{name:'notch-left',top:8,right:8,bottom:8,left:54},
  'notch-right':{name:'notch-right',top:8,right:54,bottom:8,left:8},
  'pwa-landscape':{name:'pwa-landscape',top:0,right:54,bottom:21,left:54},
  tablet:{name:'tablet',top:24,right:20,bottom:24,left:20},
  'tablet-landscape':{name:'tablet-landscape',top:20,right:24,bottom:20,left:24}
};
const DPR_BY_VIEWPORT={'344x780':3,'360x800':2,'393x852':3,'412x900':S25_VIEWPORT.dpr,'412x915':2,
  '344x882':2,'600x960':2,'768x1024':2,'740x360':1.5,'780x360':2,'900x412':S25_VIEWPORT.dpr,
  '915x412':1.5,'640x360':2,'1024x576':1.25,'1024x600':1.5,'1024x601':1.5,
  '1024x768':1.5,'1280x720':1,'1920x1080':1};
function makeCase(width,height,textScale,motion,safe,family,overrides={}){
  const viewport=`${width}x${height}`,dpr=overrides.dpr||DPR_BY_VIEWPORT[viewport];
  if(!dpr)throw new Error('No DPR contract for '+viewport);
  const mobile=overrides.mobile??family!=='desktop',touch=overrides.touch??mobile,
    userAgent=overrides.userAgent===undefined?(mobile?ANDROID_S25_USER_AGENT:null):overrides.userAgent,
    deviceProfile=overrides.deviceProfile||(mobile?'android-mobile':'desktop');
  const key=[viewport,'dpr'+dpr,'text'+textScale,motion,safe.name,deviceProfile].join('-');
  return {key,viewport,width,height,dpr,textScale,motion,safe,family,mobile,touch,userAgent,deviceProfile,
    rotationTarget:overrides.rotationTarget||null,rotationSuite:!!overrides.rotationSuite,
    visualViewportProbe:!!overrides.visualViewportProbe,captureRepresentative:false};
}
function fullMatrix(){
  const rows=[],texts=[100,125,150,200],motions=['normal','reduced'];
  for(const [w,h] of [[344,780],[360,800],[393,852],[412,915]])
    for(const text of texts)for(const motion of motions)for(const safe of [SAFE.none,SAFE.portrait])
      rows.push(makeCase(w,h,text,motion,safe,'portrait'));
  for(const [w,h] of [[740,360],[780,360],[915,412]])
    for(const text of texts)for(const motion of motions)for(const safe of [SAFE.none,SAFE['notch-left'],SAFE['notch-right']])
      rows.push(makeCase(w,h,text,motion,safe,'landscape'));
  for(const text of texts)for(const motion of motions)for(const safe of [SAFE.none,SAFE.tablet])
    rows.push(makeCase(1024,768,text,motion,safe,'tablet'));
  for(const [w,h] of [[1280,720],[1920,1080]])for(const text of texts)for(const motion of motions)
    rows.push(makeCase(w,h,text,motion,SAFE.none,'desktop'));
  if(rows.length!==168)throw new Error('FULL_MATRIX_COUNT_DRIFT: '+rows.length);
  const firstByViewport=new Set();
  for(const row of rows)if(!firstByViewport.has(row.viewport)&&row.textScale===100&&row.motion==='normal'){
    firstByViewport.add(row.viewport);row.captureRepresentative=true;
  }
  return rows;
}
function visualMatrix(all){
  const wanted=[
    [344,780,200,'reduced','portrait-stress'],[344,780,100,'normal','none'],
    [360,800,150,'normal','portrait-stress'],[360,800,200,'normal','none'],[393,852,125,'reduced','none'],
    [412,915,100,'normal','portrait-stress'],[412,915,200,'reduced','none'],
    [740,360,100,'normal','notch-left'],[740,360,200,'reduced','notch-right'],
    [780,360,125,'reduced','none'],[780,360,150,'normal','notch-right'],
    [915,412,200,'normal','notch-left'],[915,412,100,'reduced','none'],
    [1024,768,125,'normal','tablet'],[1024,768,200,'reduced','none'],
    [1280,720,150,'reduced','none'],[1920,1080,100,'normal','none']
  ];
  const rows=wanted.map(([w,h,text,motion,safe])=>{
    const row=all.find(c=>c.width===w&&c.height===h&&c.textScale===text&&c.motion===motion&&c.safe.name===safe);
    if(!row)throw new Error('VISUAL_MATRIX_CASE_MISSING: '+JSON.stringify([w,h,text,motion,safe]));
    return {...row,captureRepresentative:true};
  });
  const phoneRotation=rows.find(row=>row.width===412&&row.height===915&&row.textScale===100);
  if(!phoneRotation)throw new Error('VISUAL_PHONE_ROTATION_CASE_MISSING');
  Object.assign(phoneRotation,{rotationSuite:true,visualViewportProbe:true,
    rotationTarget:{width:915,height:412,safe:SAFE['pwa-landscape']}});
  const bounded=[
    makeCase(S25_VIEWPORT.width,S25_VIEWPORT.height,100,'normal',SAFE.portrait,'portrait',{
      deviceProfile:'s25-ultra-portrait',visualViewportProbe:true,
      rotationTarget:{width:S25_VIEWPORT.height,height:S25_VIEWPORT.width,safe:SAFE['pwa-landscape']}}),
    makeCase(S25_VIEWPORT.height,S25_VIEWPORT.width,100,'normal',SAFE['pwa-landscape'],'landscape',{
      deviceProfile:'s25-ultra-landscape',visualViewportProbe:true,
      rotationTarget:{width:S25_VIEWPORT.width,height:S25_VIEWPORT.height,safe:SAFE.portrait}}),
    makeCase(344,882,150,'reduced',SAFE.portrait,'portrait',{deviceProfile:'android-foldable'}),
    makeCase(600,960,200,'normal',SAFE.portrait,'portrait',{deviceProfile:'android-large-phone',visualViewportProbe:true}),
    makeCase(768,1024,200,'reduced',SAFE.tablet,'tablet',{deviceProfile:'android-tablet',rotationSuite:true,
      visualViewportProbe:true,rotationTarget:{width:1024,height:768,safe:SAFE['tablet-landscape']}}),
    makeCase(1024,600,200,'normal',SAFE['pwa-landscape'],'tablet',{deviceProfile:'android-breakpoint-below'}),
    makeCase(1024,601,200,'normal',SAFE['pwa-landscape'],'tablet',{deviceProfile:'android-breakpoint-above'}),
    makeCase(1024,576,150,'normal',SAFE.none,'desktop',{dpr:1.25,mobile:false,touch:false,userAgent:null,
      deviceProfile:'zoom-equivalent-wide'}),
    makeCase(640,360,200,'normal',SAFE['pwa-landscape'],'landscape',{dpr:2,deviceProfile:'zoom-equivalent-mobile'}),
    /* These paired widths exercise the two compact portrait cutovers without
       also changing text, motion, safe area, or DPR between the pair. */
    makeCase(365,800,200,'reduced',SAFE.portrait,'portrait',{dpr:2,deviceProfile:'portrait-breakpoint-365'}),
    makeCase(366,800,200,'reduced',SAFE.portrait,'portrait',{dpr:2,deviceProfile:'portrait-breakpoint-366'}),
    makeCase(430,900,200,'normal',SAFE.portrait,'portrait',{dpr:2,deviceProfile:'portrait-breakpoint-430'}),
    makeCase(431,900,200,'normal',SAFE.portrait,'portrait',{dpr:2,deviceProfile:'portrait-breakpoint-431'}),
    /* CSS geometry must not drift merely because the same phone viewport is
       rasterised at a denser device scale. */
    makeCase(S25_VIEWPORT.width,S25_VIEWPORT.height,100,'normal',SAFE.portrait,'portrait',{
      dpr:3,deviceProfile:'s25-css-dpr3-stress'})
  ].map(row=>({...row,captureRepresentative:true}));
  return [...rows,...bounded];
}
function quickMatrix(){return [{...makeCase(S25_VIEWPORT.width,S25_VIEWPORT.height,100,'normal',SAFE.portrait,'portrait',{
  deviceProfile:'s25-ultra-portrait',visualViewportProbe:true,
  rotationTarget:{width:S25_VIEWPORT.height,height:S25_VIEWPORT.width,safe:SAFE['pwa-landscape']}}),
  captureRepresentative:true}];}

function matrixSelfCheck(full,visual,quick){
  const required=[[344,882,2],[600,960,2],[768,1024,2],[1024,600,1.5],[1024,601,1.5],
    [1024,576,1.25],[640,360,2],[365,800,2],[366,800,2],[430,900,2],[431,900,2],[412,900,3]],
    auditedStates=['abilities','abilities-utility','abilities-consumables','base-finder','unit-intel',
      'consumables','hazard-infestation'],failures=[];
  const gate=(name,pass,evidence)=>{if(!pass)failures.push({name,evidence});};
  const counts=(rows,key)=>Object.fromEntries([...rows.reduce((map,row)=>{
    const value=typeof key==='function'?key(row):row[key];map.set(String(value),(map.get(String(value))||0)+1);return map;
  },new Map())].sort((a,b)=>a[0].localeCompare(b[0])));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sorted=value=>[...value].sort();
  const stateKeys=sorted(STATES),captureKeys=sorted(CAPTURE_STATES),expectedKeys=sorted(Object.keys(EXPECTED_SURFACE));
  gate('exact 16-state capture/surface parity',STATES.length===16&&new Set(STATES).size===16&&
    same(stateKeys,captureKeys)&&same(stateKeys,expectedKeys),{states:stateKeys,captures:captureKeys,expected:expectedKeys});
  gate('rotation geometry states are unique known non-resting states',new Set(ROTATION_GEOMETRY_STATES).size===ROTATION_GEOMETRY_STATES.length&&
    ROTATION_GEOMETRY_STATES.every(state=>state!=='resting'&&STATES.includes(state)&&EXPECTED_SURFACE[state]),
    ROTATION_GEOMETRY_STATES);
  gate('full count',full.length===168,{actual:full.length});
  gate('visual count',visual.length===31,{actual:visual.length});
  gate('matrix case keys are unique',new Set(full.map(row=>row.key)).size===full.length&&
    new Set(visual.map(row=>row.key)).size===visual.length&&new Set(quick.map(row=>row.key)).size===quick.length,
    {full:full.length,visual:visual.length,quick:quick.length});
  gate('full family counts',full.filter(row=>row.family==='portrait').length===64&&
    full.filter(row=>row.family==='landscape').length===72&&full.filter(row=>row.family==='tablet').length===16&&
    full.filter(row=>row.family==='desktop').length===16,{counts:Object.fromEntries(['portrait','landscape','tablet','desktop']
      .map(family=>[family,full.filter(row=>row.family===family).length]))});
  gate('full orientation counts',same(counts(full,row=>row.width>row.height?'landscape':'portrait'),
    {landscape:104,portrait:64}),counts(full,row=>row.width>row.height?'landscape':'portrait'));
  gate('full DPR distribution',same(counts(full,'dpr'),{'1':16,'1.5':64,'2':56,'3':32}),counts(full,'dpr'));
  gate('full text-scale distribution',same(counts(full,'textScale'),{'100':42,'125':42,'150':42,'200':42}),
    counts(full,'textScale'));
  gate('full motion distribution',same(counts(full,'motion'),{normal:84,reduced:84}),counts(full,'motion'));
  gate('full safe-area distribution',same(counts(full,row=>row.safe.name),
    {none:80,'notch-left':24,'notch-right':24,'portrait-stress':32,tablet:8}),counts(full,row=>row.safe.name));
  gate('full representative capture count',full.filter(row=>row.captureRepresentative).length===10,
    full.filter(row=>row.captureRepresentative).map(row=>row.key));
  gate('visual rows are representative portrait/landscape coverage',visual.every(row=>row.captureRepresentative)&&
    same(counts(visual,row=>row.width>row.height?'landscape':'portrait'),{landscape:15,portrait:16}),
    {representative:visual.filter(row=>row.captureRepresentative).length,
      orientations:counts(visual,row=>row.width>row.height?'landscape':'portrait')});
  gate('full mobile contexts',full.filter(row=>row.family!=='desktop').every(row=>row.mobile&&row.touch&&
    row.userAgent===ANDROID_S25_USER_AGENT),{mobile:full.filter(row=>row.mobile).length,total:full.length});
  gate('S25 quick profile',quick.length===1&&quick[0].width===S25_VIEWPORT.width&&quick[0].height===S25_VIEWPORT.height&&
    quick[0].dpr===S25_VIEWPORT.dpr&&quick[0].mobile&&quick[0].userAgent===ANDROID_S25_USER_AGENT,quick[0]);
  gate('S25 portrait and landscape visual profiles',['s25-ultra-portrait','s25-ultra-landscape'].every(profile=>
    visual.some(row=>row.deviceProfile===profile)),visual.map(row=>row.deviceProfile));
  for(const [width,height,dpr] of required)gate(`bounded ${width}x${height}@${dpr}`,
    visual.some(row=>row.width===width&&row.height===height&&row.dpr===dpr),null);
  for(const [a,b] of [[365,366],[430,431]]){
    const left=visual.find(row=>row.width===a),right=visual.find(row=>row.width===b);
    gate(`portrait breakpoint pair ${a}/${b}`,!!left&&!!right&&left.height===right.height&&left.dpr===right.dpr&&
      left.textScale===right.textScale&&left.motion===right.motion&&left.safe.name===right.safe.name,{left,right});
  }
  gate('phone rotation geometry pair',visual.some(row=>row.width===412&&row.height===915&&row.rotationSuite&&
    row.rotationTarget?.width===915&&row.rotationTarget?.height===412),null);
  gate('tablet rotation geometry pair',visual.some(row=>row.width===768&&row.height===1024&&row.rotationSuite&&
    row.rotationTarget?.width===1024&&row.rotationTarget?.height===768),null);
  gate('symmetric landscape PWA safe area',SAFE['pwa-landscape'].top===0&&SAFE['pwa-landscape'].right===54&&
    SAFE['pwa-landscape'].bottom===21&&SAFE['pwa-landscape'].left===54,SAFE['pwa-landscape']);
  gate('expanded capture states',['production','transmission-commander'].every(state=>CAPTURE_STATES.has(state)),[...CAPTURE_STATES]);
  gate('audited live HUD states',auditedStates.every(state=>STATES.includes(state)&&CAPTURE_STATES.has(state)&&
    Object.prototype.hasOwnProperty.call(EXPECTED_SURFACE,state)),{states:STATES,captures:[...CAPTURE_STATES],expected:EXPECTED_SURFACE});
  gate('Utility exposes deck plus drawer without cloning authority',Array.isArray(EXPECTED_SURFACE['abilities-utility'])&&
    EXPECTED_SURFACE['abilities-utility'].join(',')==='hotSlots,hotUtilityPanel',EXPECTED_SURFACE['abilities-utility']);
  gate('composed Ability/Utility/consumable state owns all three live surfaces',
    Array.isArray(EXPECTED_SURFACE['abilities-consumables'])&&
      EXPECTED_SURFACE['abilities-consumables'].join(',')==='hotSlots,hotUtilityPanel,consHud',
    EXPECTED_SURFACE['abilities-consumables']);
  return {pass:failures.length===0,fullCount:full.length,visualCount:visual.length,quickCount:quick.length,failures};
}

async function startServer(){
  if(!existsSync(join(wwwRoot,'index.html')))throw new Error('PACKED_WWW_MISSING: run node tools/pack-www.mjs before local HUD verification');
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
    }catch(error){res.writeHead(500,{'Cache-Control':'no-store'});res.end('server error');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  return {server,url:`http://127.0.0.1:${server.address().port}/`};
}

async function writeJsonAtomic(path,value){
  const partial=path+`.partial-${process.pid}`;
  await writeFile(partial,JSON.stringify(value,null,2)+'\n','utf8');
  try{await rename(partial,path);}catch{await rm(path,{force:true});await rename(partial,path);}
}
async function clickVisible(page,selector,label,route,timeout=30000){
  const control=page.locator(selector).first();await control.waitFor({state:'visible',timeout});
  await control.click({timeout});route.push(label);await page.waitForTimeout(550);return label;
}
async function pressVisible(page,selector,label,route,timeout=30000){
  const control=page.locator(selector).first();await control.waitFor({state:'visible',timeout});
  await control.focus();await control.press('Enter');route.push(label);await page.waitForTimeout(550);return label;
}

async function leaveGatewayOffline(page,route){
  await page.waitForFunction(()=>document.body&&document.getElementById('startBtn'),null,{timeout:180000});
  for(let step=0;step<36;step++){
    /* The optional tutorial choice intentionally overlays the now-visible
       main-menu button. Visibility alone is therefore not route readiness. */
    if(await visibleLocator(page,'#startBtn')&&!(await visibleLocator(page,'#mfOnboardingChoice')))return;
    const actions=[
      ['#mfIntroStart','intro'],['#apOfflineBtn','account-offline'],['#mfOnboardingSkip','skip-tutorial'],
      ['#mfLaunchOffline','launcher-offline'],['#apCloseBtn','close-account-gate']
    ];
    let acted=false;
    for(const [selector,label] of actions)if(await visibleLocator(page,selector)){
      await clickVisible(page,selector,label,route);acted=true;break;
    }
    if(!acted&&await visibleLocator(page,'#mfLaunchPlay')){
      const text=await page.locator('#mfLaunchPlay').textContent().catch(()=>null);
      if(/OFFLINE/i.test(String(text||''))){await clickVisible(page,'#mfLaunchPlay','launcher-primary-offline',route);acted=true;}
    }
    if(!acted)await page.waitForTimeout(750);
  }
  throw new Error('OFFLINE_GATE_STALLED: START MASSFRONT never became visible');
}

async function enterRealOfflineBattle(page){
  const route=[];
  await leaveGatewayOffline(page,route);
  await clickVisible(page,'#startBtn','war-room',route,60000);
  await clickVisible(page,'.warCard[data-mode="standard"]','standard',route,60000);
  const signature=()=>page.evaluate(()=>{
    const vis=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;};
    return [...document.querySelectorAll('[id^="mfStage"]')].filter(vis).map(el=>el.id).join(',')||
      (vis(document.getElementById('cmdbar'))?'in-world':'unknown');
  }).catch(()=> 'unknown');
  const advance=['#setupStart','.mfWorldChip:not(.locked)','.mfRegionChip:not(.locked)',
    '.mfQuickPlan','.mfTeamBtn','#mfConquestContinue'];
  let setupSteps=0;
  for(let step=0;step<24;step++){
    if(await visibleLocator(page,'#deployBtn'))break;
    const before=await signature();if(before==='in-world')break;
    let moved=false;
    for(const selector of advance){
      const locator=page.locator(selector).first();if(!(await locator.isVisible().catch(()=>false)))continue;
      for(let tap=0;tap<2&&!moved;tap++){
        await locator.click({timeout:30000}).catch(()=>{});await page.waitForTimeout(650);
        const after=await signature();
        if(after!==before||await visibleLocator(page,'#deployBtn'))moved=true;
      }
      if(moved){route.push('setup:'+before);break;}
    }
    if(!moved)throw new Error('WAR_TABLE_STALLED: '+before);
    setupSteps++;
  }
  await page.locator('#deployBtn').first().waitFor({state:'visible',timeout:180000});
  const box=await page.locator('#gl').boundingBox();
  if(box){await page.mouse.click(box.x+box.width*.5,box.y+box.height*.44);await page.waitForTimeout(1800);}
  await pressVisible(page,'#deployBtn','deploy',route,60000).catch(async()=>{
    await page.locator('#deployBtn').first().click({timeout:30000}).catch(()=>{});route.push('deploy-pointer');
  });
  await page.waitForFunction(()=>typeof matchLive!=='undefined'&&matchLive===true&&typeof running!=='undefined'&&running===true&&
    document.body.classList.contains('hudTacticalDock'),null,{timeout:90000});
  const state=await page.evaluate(()=>({
    matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true,
    offline:(typeof netForcedOffline!=='undefined'&&!!netForcedOffline)||localStorage.getItem('mf_offline')==='1'||
      localStorage.getItem('massfront_offline')==='1',simTime:typeof stats!=='undefined'&&stats?Number(stats.t):null,
    hudTacticalDock:document.body.classList.contains('hudTacticalDock'),
    localUnits:typeof unitHigh!=='undefined'&&typeof ualive!=='undefined'?Array.from({length:unitHigh},(_,i)=>i)
      .filter(i=>ualive[i]&&(typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0)).length:null,
    localBuildings:typeof blds!=='undefined'?blds.filter(B=>B&&B.alive&&(typeof mfLocalOwnsBuilding==='function'?mfLocalOwnsBuilding(B):B.team===0)).length:null
  }));
  if(!state.matchLive||!state.running||!state.offline||!state.hudTacticalDock)
    throw new Error('REAL_ROUTE_PROOF_FAILED: '+JSON.stringify(state));
  return {route,setupSteps,state};
}

async function setSafeAreaOverride(cdp,safe){
  let emulated=true,error=null;
  try{await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{
    top:safe.top,right:safe.right,bottom:safe.bottom,left:safe.left}});}
  catch(cause){emulated=false;error=String(cause&&cause.message||cause);}
  return {emulated,error};
}

async function viewportSnapshot(page){
  return page.evaluate(()=>{
    const probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;'+
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);const style=getComputedStyle(probe),safe={top:parseFloat(style.paddingTop)||0,
      right:parseFloat(style.paddingRight)||0,bottom:parseFloat(style.paddingBottom)||0,left:parseFloat(style.paddingLeft)||0};
    probe.remove();const vv=window.visualViewport?{width:window.visualViewport.width,height:window.visualViewport.height,
      offsetLeft:window.visualViewport.offsetLeft,offsetTop:window.visualViewport.offsetTop,scale:window.visualViewport.scale}:null;
    return {innerWidth,innerHeight,devicePixelRatio,visualViewport:vv,safe,userAgent:navigator.userAgent,
      maxTouchPoints:navigator.maxTouchPoints||0,coarsePointer:matchMedia('(pointer:coarse)').matches,
      mobileGpu:typeof MF_MOBILE_GPU==='boolean'?MF_MOBILE_GPU:null,
      rendererDpr:typeof DPR==='number'?DPR:null,
      matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true};
  });
}

function viewportBaselinePass(snapshot,config){
  const vv=snapshot.visualViewport;
  return snapshot.innerWidth===config.width&&snapshot.innerHeight===config.height&&
    Math.abs(snapshot.devicePixelRatio-config.dpr)<=.01&&!!vv&&Math.abs(vv.width-snapshot.innerWidth)<=1&&
    Math.abs(vv.height-snapshot.innerHeight)<=1&&Math.abs(vv.offsetLeft)<=.5&&Math.abs(vv.offsetTop)<=.5&&
    Math.abs(vv.scale-1)<=.01;
}

async function setViewportEnvironment(page,cdp,width,height,safe){
  const before=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  await page.setViewportSize({width,height});const safeArea=await setSafeAreaOverride(cdp,safe),
    aspectFlipped=(before.width>before.height)!==(width>height);
  await page.evaluate(flipped=>{if(flipped)window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('resize'));
    if(window.visualViewport)window.visualViewport.dispatchEvent(new Event('resize'));},aspectFlipped);
  await page.waitForTimeout(300);return {...safeArea,orientationChangeDispatched:aspectFlipped};
}

async function applyCaseEnvironment(page,cdp,config){
  await page.setViewportSize({width:config.width,height:config.height});
  await page.emulateMedia({reducedMotion:config.motion==='reduced'?'reduce':'no-preference'});
  const safeOverride=await setSafeAreaOverride(cdp,config.safe);
  const textScale=await page.evaluate(scale=>{
    const stale=document.getElementById('mfCinematicHudTextScaleProbe');if(stale)stale.remove();
    const applied=typeof mfApplyTextScale==='function'?mfApplyTextScale(scale):scale;
    if(typeof mfApplyTextScale!=='function')document.documentElement.dataset.mfTextScale=String(scale);
    document.documentElement.dataset.mfHudProbeTextScale=String(scale);
    window.dispatchEvent(new Event('resize'));
    if(window.visualViewport)window.visualViewport.dispatchEvent(new Event('resize'));
    return {requested:scale,applied,attribute:document.documentElement.dataset.mfTextScale||null,
      probe:document.documentElement.dataset.mfHudProbeTextScale||null};
  },config.textScale);
  await page.waitForTimeout(350);
  const device=await viewportSnapshot(page),safeAreaObserved=device.safe;
  const safeAreaMatches=['top','right','bottom','left'].every(side=>Math.abs(safeAreaObserved[side]-config.safe[side])<.75);
  return {safeAreaEmulated:safeOverride.emulated,safeAreaError:safeOverride.error,safeAreaObserved,safeAreaMatches,
    textScale,device,visualViewportBaselinePass:viewportBaselinePass(device,config)};
}

async function visualViewportProbe(page,cdp,config){
  await resetHud(page);const baseline=await viewportSnapshot(page),shrinkHeight=Math.max(280,Math.floor(config.height*.72));
  const shrinkSafe=await setViewportEnvironment(page,cdp,config.width,shrinkHeight,config.safe),shrunk=await viewportSnapshot(page);
  const restoreSafe=await setViewportEnvironment(page,cdp,config.width,config.height,config.safe),restored=await viewportSnapshot(page);
  const vvMatches=snapshot=>!!snapshot.visualViewport&&Math.abs(snapshot.visualViewport.width-snapshot.innerWidth)<=1&&
    Math.abs(snapshot.visualViewport.height-snapshot.innerHeight)<=1&&Math.abs(snapshot.visualViewport.offsetLeft)<=.5&&
    Math.abs(snapshot.visualViewport.offsetTop)<=.5&&Math.abs(snapshot.visualViewport.scale-1)<=.01;
  const safeMatches=snapshot=>['top','right','bottom','left'].every(side=>Math.abs(snapshot.safe[side]-config.safe[side])<.75);
  return {pass:viewportBaselinePass(baseline,config)&&vvMatches(shrunk)&&shrunk.innerHeight===shrinkHeight&&
      shrunk.visualViewport.height<=baseline.visualViewport.height-32&&vvMatches(restored)&&
      restored.innerWidth===config.width&&restored.innerHeight===config.height&&
      Math.abs(restored.devicePixelRatio-config.dpr)<=.01&&safeMatches(shrunk)&&safeMatches(restored)&&
      baseline.matchLive&&baseline.running&&shrunk.matchLive&&shrunk.running&&restored.matchLive&&restored.running,
    method:'Playwright viewport shrink (layout and visual viewport move together)',shrinkHeight,baseline,shrunk,restored,
    safeArea:{shrink:shrinkSafe,restore:restoreSafe}};
}

async function resetHud(page){
  return page.evaluate(()=>{
    const restore=window.__mfHudVerifierRestore;
    if(restore){
      if(Object.prototype.hasOwnProperty.call(restore,'matchCons')&&typeof _mfMatchCons!=='undefined')_mfMatchCons=restore.matchCons;
      if(Object.prototype.hasOwnProperty.call(restore,'infestationOn')&&typeof infestationOn!=='undefined')infestationOn=restore.infestationOn;
      if(Object.prototype.hasOwnProperty.call(restore,'statsT')&&typeof stats!=='undefined'&&stats)stats.t=restore.statsT;
      delete window.__mfHudVerifierRestore;
    }
    if(typeof mfNoticeHistoryClose==='function')mfNoticeHistoryClose(true);
    if(typeof hotUtilityClose==='function')hotUtilityClose(true);
    if(typeof closeBaseFinder==='function')closeBaseFinder(false);
    if(typeof closeMenus==='function')closeMenus();
    if(typeof placing!=='undefined'&&placing&&typeof cancelPlace==='function')cancelPlace();
    if(typeof cmdrTxMatchReset==='function')cmdrTxMatchReset();else if(typeof cmdrTxReset==='function')cmdrTxReset();
    if(typeof blds!=='undefined')for(const B of blds)if(B){B.recycleConfirmAt=0;B.repairOn=false;B.repairStalled=false;}
    if(typeof clearSel==='function')clearSel();
    const card=document.getElementById('unitCard');
    if(card){clearTimeout(card._t);card.style.display='none';}
    if(typeof showHudDock==='function')showHudDock(true,'orders');
    if(typeof updateSelInfo==='function')updateSelInfo();
    const toast=document.getElementById('toast');if(toast){toast.style.display='none';toast.textContent='';}
    const coach=document.getElementById('coach');if(coach){coach.style.display='none';coach.textContent='';}
    /* Freeze combat after the real deployment so a 168-case structural sweep
       does not lose the one factory while typography is being measured. */
    if(typeof paused!=='undefined')paused=true;
    if(restore&&typeof updateHUD==='function')updateHUD(60);
    const utility=document.getElementById('hotUtilityPanel'),finder=document.getElementById('baseFinder');
    const utilityClosed=!utility||(getComputedStyle(utility).display==='none'&&utility.getAttribute('aria-hidden')!=='false'&&
      utility.children.length===0);
    const baseFinderClosed=!finder||getComputedStyle(finder).display==='none';
    window.__mfHotForwardProbe=0;
    return {matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true,
      utilityClosed,baseFinderClosed,restoredSyntheticState:!!restore};
  });
}

async function seedUnitGroup(page){
  const seeded=await page.evaluate(()=>{
    if(typeof clearSel!=='function'||typeof saveGroup!=='function'||typeof unitHigh==='undefined')return {ok:false,reason:'unit APIs unavailable'};
    clearSel();const selected=[];
    for(let i=0;i<unitHigh&&selected.length<5;i++)if(ualive[i]&&
      (typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0)){usel[i]=1;selected.push(i);}
    if(!selected.length)return {ok:false,reason:'no local units after deployment'};
    saveGroup(0);if(typeof updateSelInfo==='function')updateSelInfo();
    return {ok:true,selected,group:typeof ctrlGroups!=='undefined'?ctrlGroups[0].map(e=>e.slice()):[]};
  });
  if(!seeded.ok)throw new Error('GROUP_STATE_SETUP_FAILED: '+seeded.reason);
  const tab=page.locator('.hudDeckBtn[data-deck="platoons"]').first();await tab.click({timeout:20000});
  await page.locator('#grpBtn1').first().click({timeout:20000});
  await page.waitForFunction(()=>window.MFUnitStackHotbar&&MFUnitStackHotbar.snapshot().cardCount>0&&(()=>{
    const rail=document.getElementById('mfUnitStackRail'),style=rail&&getComputedStyle(rail),rect=rail&&rail.getBoundingClientRect();
    return !!(rail&&style.display!=='none'&&rect.width>0&&rect.height>0);
  })(),null,{timeout:20000});
  /* A prior matrix state may have activated the same type. Let the real
     700ms second-activation window expire so this probe proves select first,
     then camera focus, without reaching into takeover internals. */
  await page.waitForTimeout(760);
  const before=await page.evaluate(()=>{
    MFUnitStackHotbar.sync();
    const card=document.querySelector('#mfUnitStackRail>.mfUnitStackCard');
    if(!card)return {ok:false,reason:'unit-stack card unavailable'};
    const type=Number(card.dataset.unitType),expected=[];let x=0,y=0;
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&utype[i]===type&&
      (typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0)){expected.push(i);x+=ux[i];y+=uy[i];}
    if(!expected.length)return {ok:false,reason:'first card has no live local authority',type};
    window.__mfUnitStackVerifierNode=card;
    const rect=card.getBoundingClientRect();
    return {ok:true,type,expected,centroid:{x:x/expected.length,y:y/expected.length},
      point:{x:rect.left+rect.width/2,y:rect.top+rect.height/2},
      snapshot:MFUnitStackHotbar.snapshot(),nodeKey:card.dataset.unitStackKey,
      platoonButtons:document.querySelectorAll('#grpRow>.grpBtn').length};
  });
  if(!before.ok)throw new Error('UNIT_STACK_SETUP_FAILED: '+before.reason);
  /* Coordinate touch taps exercise the actual mobile pointer path and keep the
     two activations inside its 700ms focus window. Locator actionability waits
     can silently turn the second activation into another first activation. */
  await page.touchscreen.tap(before.point.x,before.point.y);await page.waitForTimeout(60);
  const selected=await page.evaluate(({type,expected})=>{
    const actual=[];for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i])actual.push(i);
    const snapshot=MFUnitStackHotbar.snapshot(),node=document.querySelector(
      '#mfUnitStackRail>.mfUnitStackCard[data-unit-type="'+type+'"]');
    const rect=node&&node.getBoundingClientRect();
    return {actual,expected,onlyType:actual.every(i=>utype[i]===type),snapshot,
      stableNode:node===window.__mfUnitStackVerifierNode,pressed:node&&node.getAttribute('aria-pressed'),
      selectedDataset:node&&Number(node.dataset.selected),
      point:rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null};
  },{type:before.type,expected:before.expected});
  if(!selected.point)throw new Error('UNIT_STACK_SETUP_FAILED: selected card unavailable for focus');
  await page.touchscreen.tap(selected.point.x,selected.point.y);await page.waitForTimeout(100);
  const focused=await page.evaluate(({type,centroid})=>{
    const snapshot=MFUnitStackHotbar.snapshot(),node=document.querySelector(
      '#mfUnitStackRail>.mfUnitStackCard[data-unit-type="'+type+'"]');
    return {snapshot,stableNode:node===window.__mfUnitStackVerifierNode,
      camera:{x:cam.x,y:cam.y,error:Math.hypot(cam.x-centroid.x,cam.y-centroid.y)},
      group:ctrlGroups[0].map(e=>e.slice()),platoonButtons:document.querySelectorAll('#grpRow>.grpBtn').length};
  },{type:before.type,centroid:before.centroid});
  const panBefore=await page.evaluate(()=>{
    const rail=document.getElementById('mfUnitStackRail'),node=window.__mfUnitStackVerifierNode;
    if(!rail||!node)return {ok:false,reason:'unit-stack rail unavailable for touch pan'};
    rail.scrollLeft=0;const rect=rail.getBoundingClientRect(),snapshot=MFUnitStackHotbar.snapshot();
    return {ok:true,max:Math.max(0,rail.scrollWidth-rail.clientWidth),start:rail.scrollLeft,
      point:{x:rect.right-8,y:rect.top+rect.height/2},endX:rect.left+8,
      actionAt:snapshot.lastAction&&snapshot.lastAction.at,nodeKey:node.dataset.unitStackKey,
      required:innerWidth<=480};
  });
  let pan={...panBefore,pass:panBefore.ok&&!panBefore.required};
  if(panBefore.ok&&panBefore.max>1){
    const cdp=await page.context().newCDPSession(page),id=19,steps=4;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:panBefore.point.x,y:panBefore.point.y,id}]});
    for(let step=1;step<=steps;step++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{
        x:panBefore.point.x+(panBefore.endX-panBefore.point.x)*step/steps,y:panBefore.point.y,id}]});
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
    pan=await page.evaluate(before=>{
      const rail=document.getElementById('mfUnitStackRail'),snapshot=MFUnitStackHotbar.snapshot(),
        node=document.querySelector('#mfUnitStackRail>.mfUnitStackCard[data-unit-stack-key="'+before.nodeKey+'"]'),
        actual=[];for(let i=0;i<unitHigh;i++)if(ualive[i]&&usel[i])actual.push(i);
      const result={...before,end:rail&&rail.scrollLeft,delta:rail&&rail.scrollLeft-before.start,
        pointerCount:snapshot.pointerCount,stableNode:node===window.__mfUnitStackVerifierNode,
        actionUnchanged:(snapshot.lastAction&&snapshot.lastAction.at)===before.actionAt,
        selection:actual,pass:!!rail&&rail.scrollLeft>before.start+1&&snapshot.pointerCount===0&&
          node===window.__mfUnitStackVerifierNode&&(snapshot.lastAction&&snapshot.lastAction.at)===before.actionAt};
      if(rail)rail.scrollLeft=0;return result;
    },panBefore);
  }
  await page.evaluate(()=>{
    delete window.__mfUnitStackVerifierNode;
    /* The authority proof has already captured both acknowledgements. Keep the
       visual state about the palette itself, not a transient verification
       toast that would otherwise inflate every matrix occupancy sample. */
    const notice=document.getElementById('toast');if(notice)notice.style.opacity=0;
  });
  return {...seeded,unitStack:{before,selected,focused,pan}};
}

/* Hot slots are disruptive gameplay controls, so input.js deliberately
   suppresses their pointerdown and replays it only after a clean pointerup.
   A verifier that taps one immediately after a deck tab (or another hot slot)
   lands inside the 180ms hardware-bounce window and correctly does nothing.
   Wait for the real guard instead of bypassing it with force/synthetic DOM. */
async function waitForAbilityInputWindow(page){
  await page.waitForFunction(()=>{
    if(typeof mfUiSafetyProbe!=='function')return true;
    const state=mfUiSafetyProbe();
    return state.pending===0&&state.blocked===0&&state.sinceLast>=240;
  },null,{timeout:5000});
}

async function setupAbilities(page,openUtility){
  const selected=await page.evaluate(()=>{
    if(typeof clearSel!=='function'||typeof heroIdx==='undefined'||heroIdx<0||!ualive[heroIdx])
      return {ok:false,reason:'live Commander unavailable'};
    /* resetHud pauses the battle to keep long geometry sweeps deterministic.
       Production closes selection-bound drawers whenever paused, so this one
       interactive state must briefly run exactly as it does for a player. The
       next resetHud call restores the verifier freeze before any other state. */
    const wasPaused=typeof paused!=='undefined'&&paused;
    if(typeof paused!=='undefined')paused=false;
    clearSel();usel[heroIdx]=1;
    if(typeof updateSelInfo==='function')updateSelInfo();
    if(typeof hotSlotSync==='function')hotSlotSync(true);
    return {ok:true,hero:heroIdx,type:utype[heroIdx],wasPaused,interactivePaused:typeof paused!=='undefined'&&paused};
  });
  if(!selected.ok)throw new Error('ABILITIES_STATE_SETUP_FAILED: '+selected.reason);
  const tab=page.locator('.hudDeckBtn[data-deck="abilities"]').first();
  await tab.waitFor({state:'visible',timeout:20000});
  if(await tab.isDisabled())throw new Error('ABILITIES_STATE_SETUP_FAILED: abilities tab stayed disabled for Commander');
  await tab.click({timeout:20000});
  await page.locator('#hotSlots').waitFor({state:'visible',timeout:20000});
  await waitForAbilityInputWindow(page);

  /* Prove the presentation slot forwards to the hidden authoritative owner,
     while a capture listener prevents the acceptance harness from firing a
     weapon or entering an aim mode. */
  const armed=await page.evaluate(()=>{
    const slot=document.querySelector('#hotSlots .hotSlot[data-hot-src="abPrimary"]'),owner=document.getElementById('abPrimary');
    if(!slot||!owner)return {ok:false,reason:'PRIMARY presentation/owner pair missing'};
    window.__mfHotForwardProbe=0;
    owner.addEventListener('pointerdown',ev=>{
      window.__mfHotForwardProbe++;ev.preventDefault();ev.stopImmediatePropagation();
    },{capture:true,once:true});
    return {ok:true,slotLabel:slot.getAttribute('aria-label'),ownerId:owner.id};
  });
  if(!armed.ok)throw new Error('ABILITIES_FORWARD_SETUP_FAILED: '+armed.reason);
  await page.locator('#hotSlots .hotSlot[data-hot-src="abPrimary"]').click({timeout:20000});
  const forwardState=await page.evaluate(()=>({forwarded:window.__mfHotForwardProbe|0,
    safety:typeof mfUiSafetyProbe==='function'?mfUiSafetyProbe():null}));

  if(openUtility){
    await waitForAbilityInputWindow(page);
    const more=page.locator('#hotSlots .hotSlot[data-hot-src="utility:more"]').first();
    await more.waitFor({state:'visible',timeout:20000});await more.click({timeout:20000});
    await page.locator('#hotUtilityPanel').waitFor({state:'visible',timeout:20000});
  }
  const state=await page.evaluate(open=>{
    const shown=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;};
    const slots=[...document.querySelectorAll('#hotSlots>.hotSlot')],utility=document.getElementById('hotUtilityPanel'),
      utilityItems=utility?[...utility.querySelectorAll('.hotUtility')]:[];
    return {slotCount:slots.length,slotSources:slots.map(el=>el.dataset.hotSrc||''),utilityVisible:shown(utility),
      utilityCount:utilityItems.length,utilitySources:utilityItems.map(el=>el.dataset.hotSrc||''),
      utilityAriaHidden:utility&&utility.getAttribute('aria-hidden'),deck:typeof hudDeck==='string'?hudDeck:null,
      selected:typeof selCount==='function'?selCount():null,requestedUtility:open};
  },openUtility);
  return {...selected,...armed,...forwardState,...state};
}

async function setupBaseFinder(page){
  const tab=page.locator('.hudDeckBtn[data-deck="buildings"]').first();
  await tab.waitFor({state:'visible',timeout:20000});await tab.click({timeout:20000});
  await page.locator('#baseFinder').waitFor({state:'visible',timeout:20000});
  const economy=page.locator('#baseFinder .baseFindTabs [data-f="economy"]').first();
  await economy.waitFor({state:'visible',timeout:20000});await economy.click({timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#baseFinder .baseFindTabs [data-f="economy"]')?.getAttribute('aria-selected')==='true',
    null,{timeout:20000});
  return page.evaluate(()=>({
    deck:typeof hudDeck==='string'?hudDeck:null,
    panelCount:document.querySelectorAll('#baseFinder').length,
    buildingsTabs:document.querySelectorAll('.hudDeckBtn[data-deck="buildings"]').length,
    selectedTabs:document.querySelectorAll('#baseFinder .baseFindTabs [aria-selected="true"]').length,
    filter:document.querySelector('#baseFinder .baseFindTabs [aria-selected="true"]')?.getAttribute('data-f')||null,
    cards:document.querySelectorAll('#baseFinder .baseFindCard').length
  }));
}

async function setupUnitIntel(page){
  const selected=await page.evaluate(()=>{
    if(typeof clearSel!=='function'||typeof unitHigh==='undefined')return {ok:false,reason:'unit selection APIs unavailable'};
    clearSel();let index=-1;
    for(let i=0;i<unitHigh;i++)if(ualive[i]&&(typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0)){
      index=i;if(typeof heroIdx==='undefined'||i!==heroIdx)break;
    }
    if(index<0)return {ok:false,reason:'no local unit after deployment'};
    usel[index]=1;if(typeof updateSelInfo==='function')updateSelInfo();
    return {ok:true,index,type:utype[index]};
  });
  if(!selected.ok)throw new Error('UNIT_INTEL_STATE_SETUP_FAILED: '+selected.reason);
  const info=page.locator('#selInfo .selIntelBtn').first();await info.waitFor({state:'visible',timeout:20000});
  await info.click({timeout:20000});await page.locator('#unitCard').waitFor({state:'visible',timeout:20000});
  return {...selected,...await page.evaluate(()=>({
    selected:typeof selCount==='function'?selCount():null,
    infoControlCount:document.querySelectorAll('#selInfo .selIntelBtn').length,
    cardCount:document.querySelectorAll('#unitCard').length,
    pinned:document.getElementById('unitCard')?.classList.contains('pinned')||false,
    title:document.querySelector('#unitCard .ucHead b')?.textContent?.trim()||''
  }))};
}

async function setupConsumables(page){
  const seeded=await page.evaluate(()=>{
    if(typeof INV_CONSUMABLES==='undefined'||!INV_CONSUMABLES.length||typeof showConsHud!=='function'||
      typeof _mfMatchCons==='undefined')return {ok:false,reason:'consumable HUD APIs unavailable'};
    window.__mfHudVerifierRestore={matchCons:_mfMatchCons};
    const item=INV_CONSUMABLES[0];_mfMatchCons=[item];showConsHud();
    return {ok:true,id:item.id,name:item.nm};
  });
  if(!seeded.ok)throw new Error('CONSUMABLE_STATE_SETUP_FAILED: '+seeded.reason);
  await page.locator('#consHud .conHudSlot').first().waitFor({state:'visible',timeout:20000});
  return {...seeded,...await page.evaluate(()=>({
    slotCount:document.querySelectorAll('#consHud .conHudSlot').length,
    names:[...document.querySelectorAll('#consHud .conHudNm')].map(el=>el.textContent.trim()),
    artCount:document.querySelectorAll('#consHud .conHudEm img,#consHud .conHudEm svg,#consHud .conHudEm>span').length
  }))};
}

async function setupAbilitiesConsumables(page){
  /* This is a composed live state, not a DOM fixture: open the Commander deck
     and its Utility continuation through their guarded controls, then seed the
     canonical match-consumable renderer. It reproduces the three-tier lower
     instrument stack that separate Ability and consumable captures cannot. */
  const abilities=await setupAbilities(page,true),consumables=await setupConsumables(page);
  return {abilities,consumables};
}

async function setupHazardInfestation(page){
  const seeded=await page.evaluate(()=>{
    if(typeof showHazChip!=='function'||typeof updateHUD!=='function'||typeof stats==='undefined'||!stats||
      typeof infestationOn==='undefined')return {ok:false,reason:'hazard/infestation HUD APIs unavailable'};
    window.__mfHudVerifierRestore={infestationOn,statsT:stats.t};
    infestationOn=true;stats.t=Math.max(Number(stats.t)||0,2400);showHazChip();updateHUD(60);
    const hazard=typeof mapHazardDef==='function'?mapHazardDef(typeof curMap==='string'?curMap:''):null;
    return {ok:true,hazard:hazard&&hazard.nm||null,tier:typeof infTier==='function'?infTier():null};
  });
  if(!seeded.ok)throw new Error('HAZARD_INFESTATION_STATE_SETUP_FAILED: '+seeded.reason);
  await page.locator('#hazChip').waitFor({state:'visible',timeout:20000});
  await page.locator('#infMeter').waitFor({state:'visible',timeout:20000});
  return {...seeded,...await page.evaluate(()=>({
    hazardText:document.getElementById('hazChip')?.textContent?.trim()||'',
    infestationText:document.getElementById('infMeter')?.textContent?.trim()||'',
    hazardCount:document.querySelectorAll('#hazChip').length,infestationCount:document.querySelectorAll('#infMeter').length
  }))};
}

async function setupBuild(page){
  const prep=await page.evaluate(()=>{
    /* Build is a permanent command-dock action. Selecting a never-seen unit
       first opens its educational intel card and tests panel priority instead
       of the Build control itself, so keep this state selection-neutral. */
    return {hero:typeof heroIdx!=='undefined'?heroIdx:null,selected:typeof selCount==='function'?selCount():null};
  });
  await page.locator('#buildBtn').first().click({timeout:20000});
  await page.locator('#buildMenu').first().waitFor({state:'visible',timeout:20000});
  const card=page.locator('#buildGrid .bcard').first();
  await card.waitFor({state:'attached',timeout:20000});await card.scrollIntoViewIfNeeded();
  return prep;
}

async function setupProduction(page){
  const out=await page.evaluate(()=>{
    if(typeof openBldMenu!=='function'||typeof blds==='undefined')return {ok:false,reason:'production controller unavailable'};
    const types=new Set(['fac','tgate','harbor','airfield']);
    const index=blds.findIndex(B=>B&&B.alive&&types.has(B.type)&&
      (typeof mfLocalOwnsBuilding==='function'?mfLocalOwnsBuilding(B):B.team===0));
    if(index<0)return {ok:false,reason:'no local production structure'};
    openBldMenu(index);return {ok:true,index,type:blds[index].type};
  });
  if(!out.ok)throw new Error('PRODUCTION_STATE_SETUP_FAILED: '+out.reason);
  await page.locator('#prodMenu').waitFor({state:'visible',timeout:20000});
  const card=page.locator('#prodGrid .bcard').first();
  await card.waitFor({state:'attached',timeout:20000});await card.scrollIntoViewIfNeeded();
  return out;
}

async function setupStructureService(page){
  const out=await page.evaluate(()=>{
    if(typeof openBldMenu!=='function'||typeof blds==='undefined')return {ok:false,reason:'building controller unavailable'};
    const prod=new Set(['fac','tgate','harbor','airfield','techlab']);
    const quotes=[];let index=-1;
    for(let i=0;i<blds.length;i++){
      const B=blds[i];if(!B||!B.alive||prod.has(B.type)||B.prog<1||!(B.hpm>0)||
        !(typeof mfLocalOwnsBuilding==='function'?mfLocalOwnsBuilding(B):B.team===0))continue;
      const hp=B.hp;B.hp=Math.max(1,B.hpm*.48);
      const quote=window.MFBuildingService&&typeof window.MFBuildingService.quote==='function'
        ?window.MFBuildingService.quote(B):{eligible:false,reason:'quote-api-unavailable'};
      quotes.push({index:i,type:B.type,team:B.team,eligible:!!quote.eligible,reason:quote.reason||quote.state||''});
      if(quote.eligible){index=i;break;}B.hp=hp;
    }
    if(index<0)return {ok:false,reason:'no local serviceable structure',quotes};
    const B=blds[index];B.dmgT=0;B.repairOn=false;B.repairStalled=false;B.recycleConfirmAt=0;
    if(typeof resM!=='undefined')resM[0]=Math.max(Number(resM[0])||0,100000);
    if(typeof resE!=='undefined')resE[0]=Math.max(Number(resE[0])||0,100000);
    openBldMenu(index);return {ok:true,index,type:B.type,hp:B.hp,hpm:B.hpm,quotes};
  });
  if(!out.ok)throw new Error('STRUCTURE_SERVICE_SETUP_FAILED: '+out.reason);
  await page.locator('#bldMenu2').waitFor({state:'visible',timeout:20000});
  await page.locator('#bp_repair').click({timeout:20000});await page.waitForTimeout(150);
  const repair=await page.evaluate(()=>({pressed:document.getElementById('bp_repair')?.getAttribute('aria-pressed'),
    disabled:!!document.getElementById('bp_repair')?.disabled,
    active:typeof openBld!=='undefined'&&openBld>=0?!!blds[openBld].repairOn:false}));
  await page.locator('#bp_sell').click({timeout:20000});await page.waitForTimeout(150);
  const recycle=await page.evaluate(()=>({armed:document.getElementById('bp_sell')?.dataset.armed,
    text:document.getElementById('bp_sell')?.textContent||'',alive:typeof openBld!=='undefined'&&openBld>=0?!!blds[openBld].alive:false}));
  return {...out,repair,recycle};
}

async function setupPlacement(page){
  await setupBuild(page);
  const card=page.locator('#buildGrid .bcard:not(.locked):not([aria-disabled="true"])').first();
  await card.waitFor({state:'visible',timeout:20000});await card.click({timeout:20000});
  await page.locator('#placeUI').waitFor({state:'visible',timeout:20000});
  return page.evaluate(()=>({placing:typeof placing!=='undefined'?placing:null,visible:!!document.getElementById('placeUI')}));
}

async function setupCommanderTransmission(page){
  const raised=await page.evaluate(()=>{
    if(typeof commanderDialogueReset==='function')commanderDialogueReset();
    if(typeof cmdrTxMatchReset==='function')cmdrTxMatchReset();
    if(typeof commanderCue!=='function')return {ok:false,reason:'commanderCue unavailable'};
    const now=typeof stats!=='undefined'&&stats?Math.max(0,Number(stats.t)*1000):0;
    const result=commanderCue('objective','assigned',{subject:'cinematic-hud-acceptance',now,force:true});
    if(result.ok&&result.cue)result.cue.durationMs=12000;
    return {ok:result.ok,reason:result.reason,key:result.cue&&result.cue.key,seq:result.cue&&result.cue.seq};
  });
  if(!raised.ok)throw new Error('COMMANDER_CUE_SETUP_FAILED: '+raised.reason);
  await page.waitForFunction(()=>typeof cmdrTxDebug==='function'&&['enter','hold'].includes(cmdrTxDebug().state)&&
    String(cmdrTxDebug().who||'').toUpperCase()!=='KEEL',null,{timeout:20000});
  await page.evaluate(()=>{try{eval('CMDRTX.until=cmdrTxNow()+12000');}catch{}});
  return {...raised,debug:await page.evaluate(()=>cmdrTxDebug())};
}

async function setupKeelTransmission(page){
  const raised=await page.evaluate(()=>{
    if(typeof commanderDialogueReset==='function')commanderDialogueReset();
    if(typeof cmdrTxMatchReset==='function')cmdrTxMatchReset();
    const detail={schema:'massfront.keel-hint.v1',hintId:'cinematic-hud-acceptance',context:'battle-camera',
      surface:'battle-minimap',speaker:'KEEL',speakerId:'keel',affiliation:'uga',speakerRole:'UGA SHIP LIAISON',
      channel:'UGA TACTICAL LINK',voiceId:'keen',profileId:'uga-keel-expedition-guide',
      animationId:'keel-tactical-link',text:'Cinematic HUD acceptance link active.',durationMs:12000,
      priority:90,issuedAt:Date.now(),handled:false};
    window.dispatchEvent(new CustomEvent('massfront:keel-hint',{detail,cancelable:true}));
    return {handled:detail.handled,presenter:detail.presenter||null,affiliation:detail.affiliation,profileId:detail.profileId};
  });
  if(!raised.handled)throw new Error('KEEL_CUE_SETUP_FAILED: receiver did not accept UGA cue');
  await page.waitForFunction(()=>typeof cmdrTxDebug==='function'&&['enter','hold'].includes(cmdrTxDebug().state)&&
    String(cmdrTxDebug().who||'').toUpperCase()==='KEEL',null,{timeout:20000});
  await page.evaluate(()=>{try{eval('CMDRTX.until=cmdrTxNow()+12000');}catch{}});
  return {...raised,debug:await page.evaluate(()=>cmdrTxDebug())};
}

async function setupEventFeed(page){
  const seeded=await page.evaluate(()=>{
    if(typeof mfNoticeHistoryAdd!=='function')return {ok:false,reason:'event feed API unavailable'};
    mfNoticeHistoryAdd(1,'cinematic-hud-command','Platoon route acknowledged','command');
    mfNoticeHistoryAdd(0,'cinematic-hud-alert','Hostile contact on the northeast lane','alert');
    if(typeof showHudDock==='function')showHudDock(true,'view');
    return {ok:true,rows:typeof mfNHistory!=='undefined'?mfNHistory.length:null};
  });
  if(!seeded.ok)throw new Error('EVENT_FEED_SETUP_FAILED: '+seeded.reason);
  await page.locator('#noticeLogBtn').waitFor({state:'visible',timeout:20000});
  await page.locator('#noticeLogBtn').click({timeout:20000});
  await page.locator('#mfNoticeHistory').waitFor({state:'visible',timeout:20000});return seeded;
}

async function prepareState(page,state){
  const base=await resetHud(page);if(!base.matchLive||!base.running)throw new Error('MATCH_LOST_BEFORE_STATE: '+state);
  const common={reset:base};
  if(state==='resting')return {...common,controller:'resetHud'};
  if(state==='unit-group-palette')return {...common,controller:'saveGroup + platoon tab',...(await seedUnitGroup(page))};
  if(state==='abilities')return {...common,controller:'Commander selection + ABILITIES + forwarded PRIMARY',
    ...(await setupAbilities(page,false))};
  if(state==='abilities-utility')return {...common,controller:'Commander selection + ABILITIES + UTILITY',
    ...(await setupAbilities(page,true))};
  if(state==='abilities-consumables')return {...common,
    controller:'Commander selection + ABILITIES + UTILITY + canonical consumable HUD',
    ...(await setupAbilitiesConsumables(page))};
  if(state==='build')return {...common,controller:'#buildBtn',...(await setupBuild(page))};
  if(state==='production')return {...common,controller:'openBldMenu(production)',...(await setupProduction(page))};
  if(state==='structure-service')return {...common,controller:'#bp_repair + #bp_sell arm',...(await setupStructureService(page))};
  if(state==='placement')return {...common,controller:'build card',...(await setupPlacement(page))};
  if(state==='base-finder')return {...common,controller:'BUILDINGS deck + ECON filter',...(await setupBaseFinder(page))};
  if(state==='unit-intel')return {...common,controller:'selected unit + About control',...(await setupUnitIntel(page))};
  if(state==='consumables')return {...common,controller:'canonical consumable HUD renderer',...(await setupConsumables(page))};
  if(state==='hazard-infestation')return {...common,controller:'live hazard + deterministic tier-II infestation',
    ...(await setupHazardInfestation(page))};
  if(state==='transmission-commander')return {...common,controller:'commanderCue',...(await setupCommanderTransmission(page))};
  if(state==='transmission-keel')return {...common,controller:'massfront:keel-hint',...(await setupKeelTransmission(page))};
  if(state==='event-feed')return {...common,controller:'#noticeLogBtn',...(await setupEventFeed(page))};
  throw new Error('Unknown state: '+state);
}

async function measureState(page,config,state){
  return page.evaluate(({config,state,expectedId})=>{
    const rendered=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>.5&&r.height>.5;};
    const shown=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>.5&&r.height>.5&&
        r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;};
    const rectOf=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,
      bottom:r.bottom,width:r.width,height:r.height};};
    const expectedIds=Array.isArray(expectedId)?expectedId:(expectedId?[expectedId]:[]);
    const rootIds=['topbar','heroBar','cmdbar','minimapWrap','unitCard','selInfo','buildMenu','prodMenu','bldMenu2','placeUI',
      'baseFinder','hotUtilityPanel','consHud','infMeter','hazChip',
      'mfNoticeDock','mfNoticeHistory','atkAlert','waveAlert','toast','coach'];
    const surfaceIds=['grpRow','buildMenu','prodMenu','bldMenu2','placeUI','cmdrTx','mfNoticeHistory'];
    if(['abilities','abilities-utility','abilities-consumables'].includes(state))surfaceIds.push('hotSlots');
    if(['abilities-utility','abilities-consumables'].includes(state))surfaceIds.push('hotUtilityPanel');
    if(state==='abilities-consumables')surfaceIds.push('consHud');
    if(state==='base-finder')surfaceIds.push('baseFinder');
    if(state==='unit-intel')surfaceIds.push('unitCard');
    if(state==='consumables')surfaceIds.push('consHud');
    if(state==='hazard-infestation')surfaceIds.push('hazChip','infMeter');
    const roots=rootIds.map(id=>document.getElementById(id)).filter(shown);
    const surfaces=surfaceIds.map(id=>document.getElementById(id)).filter(shown).map(el=>({id:el.id,rect:rectOf(el)}));
    const safe={left:config.safe.left,top:config.safe.top,right:innerWidth-config.safe.right,bottom:innerHeight-config.safe.bottom};
    const interactive=['button','a[href]','input','select','textarea','[role="button"]','[tabindex]:not([tabindex="-1"])'];
    const controlSelector=rootIds.flatMap(id=>interactive.map(selector=>'#'+id+' '+selector)).join(',');
    const exposureOf=el=>{
      const r=el.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),
        top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom),clippedByScroller=false;
      for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){
        const s=getComputedStyle(p),pr=p.getBoundingClientRect(),ox=s.overflowX,oy=s.overflowY;
        if(['hidden','clip','auto','scroll'].includes(ox)){
          const before=right-left;left=Math.max(left,pr.left);right=Math.min(right,pr.right);
          if(right-left<before-.5&&['auto','scroll'].includes(ox))clippedByScroller=true;
        }
        if(['hidden','clip','auto','scroll'].includes(oy)){
          const before=bottom-top;top=Math.max(top,pr.top);bottom=Math.min(bottom,pr.bottom);
          if(bottom-top<before-.5&&['auto','scroll'].includes(oy))clippedByScroller=true;
        }
      }
      const width=Math.max(0,right-left),height=Math.max(0,bottom-top),area=Math.max(1,r.width*r.height);
      return {rect:{left,top,right,bottom,width,height},ratio:width*height/area,clippedByScroller};
    };
    const interactiveSelector=interactive.join(','),rootControls=roots.filter(el=>el.matches(interactiveSelector));
    const controlsAll=[...rootControls,...document.querySelectorAll(controlSelector)]
      .filter((el,i,a)=>a.indexOf(el)===i&&shown(el)&&getComputedStyle(el).pointerEvents!=='none')
      .map(el=>{const r=rectOf(el),exposure=exposureOf(el);return {id:el.id||null,
        label:el.getAttribute('aria-label')||el.textContent.trim().slice(0,50),width:r.width,height:r.height,rect:r,
        disabled:!!el.disabled,exposureRatio:exposure.ratio,exposedRect:exposure.rect,
        clippedByScroller:exposure.clippedByScroller};});
    const controls=controlsAll.filter(c=>c.exposureRatio>=.98);
    const clippedControls=controlsAll.filter(c=>c.exposureRatio<.98),
      clippedFixed=clippedControls.filter(c=>!c.clippedByScroller);
    /* The mission briefing action fills a long live-status rail. Its 24px
       height follows WCAG 2.5.8 while keeping the intentionally compact top
       strip; every square/isolated tactical control keeps the stricter 44px
       game contract. */
    const tooSmall=controls.filter(c=>c.id==='goalDetailBtn'?(c.width<43.5||c.height<23.5):(c.width<43.5||c.height<43.5));
    const serviceTooSmall=controlsAll.filter(c=>['bp_repair','bp_sell'].includes(c.id)&&
      (c.exposureRatio<.98||c.width<47.5||c.height<47.5));
    const unsafe=controls.filter(c=>c.rect.left<safe.left-.75||c.rect.top<safe.top-.75||
      c.rect.right>safe.right+.75||c.rect.bottom>safe.bottom+.75);
    const horizontalOverflow=roots.map(el=>({id:el.id,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight})).filter(x=>x.scrollWidth>x.clientWidth+1);
    const body={innerWidth,innerHeight,htmlScrollWidth:document.documentElement.scrollWidth,
      htmlScrollHeight:document.documentElement.scrollHeight,bodyScrollWidth:document.body.scrollWidth,
      bodyScrollHeight:document.body.scrollHeight};
    const unionArea=rects=>{
      const clipped=rects.map(r=>({l:Math.max(0,r.left),r:Math.min(innerWidth,r.right),t:Math.max(0,r.top),b:Math.min(innerHeight,r.bottom)}))
        .filter(r=>r.r>r.l&&r.b>r.t),xs=[...new Set(clipped.flatMap(r=>[r.l,r.r]))].sort((a,b)=>a-b);let area=0;
      for(let i=0;i<xs.length-1;i++){
        const l=xs[i],r=xs[i+1],ys=clipped.filter(q=>q.l<r&&q.r>l).map(q=>[q.t,q.b]).sort((a,b)=>a[0]-b[0]);
        let height=0,start=null,end=null;for(const y of ys){if(start==null){start=y[0];end=y[1];}
          else if(y[0]<=end)end=Math.max(end,y[1]);else{height+=end-start;start=y[0];end=y[1];}}
        if(start!=null)height+=end-start;area+=(r-l)*height;
      }return area;
    };
    const rootRects=roots.map(rectOf),hudArea=unionArea(rootRects),viewportArea=innerWidth*innerHeight;
    const overlapArea=(r,q)=>Math.max(0,Math.min(r.right,q.right)-Math.max(r.left,q.left))*
      Math.max(0,Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top));
    const surfaceSafeFailures=surfaces.filter(row=>row.rect.left<safe.left-.75||row.rect.top<safe.top-.75||
      row.rect.right>safe.right+.75||row.rect.bottom>safe.bottom+.75);
    const composedSurfaceOverlaps=[];
    for(let i=0;i<surfaces.length;i++)for(let j=i+1;j<surfaces.length;j++){
      if(!expectedIds.includes(surfaces[i].id)||!expectedIds.includes(surfaces[j].id))continue;
      const area=overlapArea(surfaces[i].rect,surfaces[j].rect);
      if(area>1)composedSurfaceOverlaps.push({a:surfaces[i].id,b:surfaces[j].id,area,
        aRect:surfaces[i].rect,bRect:surfaces[j].rect});
    }
    const minimapEl=document.getElementById('minimapWrap'),minimapRect=shown(minimapEl)?rectOf(minimapEl):null,
      conflictIds=new Set(['cmdbar','selInfo','unitCard','buildMenu','prodMenu','bldMenu2','placeUI','baseFinder',
        'hotUtilityPanel','consHud','mfNoticeDock','mfNoticeHistory']);
    const minimapConflicts=minimapRect?roots.filter(el=>conflictIds.has(el.id)).map(el=>{
      const rect=rectOf(el);return {id:el.id,area:overlapArea(minimapRect,rect),rect};
    }).filter(row=>row.area>1):[];
    const roi={left:innerWidth*.22,right:innerWidth*.78,top:innerHeight*.20,bottom:innerHeight*.68};
    const intersect=(r,q)=>Math.max(0,Math.min(r.right,q.right)-Math.max(r.left,q.left))*
      Math.max(0,Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top));
    const centerArea=(roi.right-roi.left)*(roi.bottom-roi.top),centerCovered=unionArea(rootRects.map(r=>({
      left:Math.max(r.left,roi.left)-roi.left,right:Math.min(r.right,roi.right)-roi.left,
      top:Math.max(r.top,roi.top)-roi.top,bottom:Math.min(r.bottom,roi.bottom)-roi.top})).filter(r=>r.right>r.left&&r.bottom>r.top));
    /* unionArea assumes viewport coordinates. Recompute the centre ratio with a
       simple summed intersection as a conservative upper bound; overlap can
       only make the gate stricter, never hide occupied playfield. */
    const centerUpper=rootRects.reduce((sum,r)=>sum+intersect(r,roi),0)/Math.max(1,centerArea);
    const canvas=document.getElementById('gl'),cr=canvas&&rectOf(canvas),ctx=canvas&&canvas.getContext('webgl2');
    const scaleX=canvas&&cr&&cr.width?canvas.width/cr.width:0,scaleY=canvas&&cr&&cr.height?canvas.height/cr.height:0;
    const rendererDpr=typeof DPR==='number'?DPR:null;
    const canvasDpr={exists:!!canvas,css:cr,width:canvas&&canvas.width,height:canvas&&canvas.height,
      drawingBufferWidth:ctx&&ctx.drawingBufferWidth,drawingBufferHeight:ctx&&ctx.drawingBufferHeight,
      scaleX,scaleY,devicePixelRatio,rendererDpr,uniform:Math.abs(scaleX-scaleY)<=.08,
      expectedWidth:cr&&Number.isFinite(rendererDpr)?Math.round(cr.width*rendererDpr):null,
      expectedHeight:cr&&Number.isFinite(rendererDpr)?Math.round(cr.height*rendererDpr):null,
      live:!!(ctx&&ctx.drawingBufferWidth>0&&ctx.drawingBufferHeight>0)};
    const imageSelector=rootIds.map(id=>'#'+id+' img').join(',');
    const images=[...document.querySelectorAll(imageSelector)].filter(shown).map(img=>{
      const r=rectOf(img),fit=getComputedStyle(img).objectFit||'fill',intrinsic=img.naturalWidth&&img.naturalHeight?img.naturalWidth/img.naturalHeight:0,
        rendered=r.width&&r.height?r.width/r.height:0,protectedFit=['cover','contain','scale-down'].includes(fit),
        distortion=intrinsic&&rendered?Math.abs(rendered/intrinsic-1):null;
      return {id:img.id||null,src:(img.currentSrc||img.src||'').slice(0,180),complete:img.complete,
        naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,renderedWidth:r.width,renderedHeight:r.height,
        objectFit:fit,distortion,aspectPass:protectedFit||(distortion!=null&&distortion<=.08)};
    });
    const imageFailures=images.filter(img=>!img.complete||!img.naturalWidth||!img.naturalHeight||!img.aspectPass);
    /* Every visible icon-bearing mark must resolve through one of three
       release-safe paths: an inline vector, a validated atlas cell, or an
       authored fallback/raster. A data-icon attribute by itself is not proof;
       the atlas loader must have admitted that exact name. */
    const iconSelectors=[
      '#mfCinematicTopRail .em','#cmdbar .em','#cmdbar .hEm','#hotUtilityPanel .hEm',
      '#mfCinematicContext .em','#placeUI .em','#unitCard .mfCinematicVectorIcon','#unitCard .ucRoleIcon',
      '#selInfo .mfCinematicVectorIcon','#baseFinder .mfCinematicVectorIcon','#baseFinder .baseFindIcon',
      '#consHud .conHudEm','#hazChip .hazEm','#infMeter .mfCinematicVectorIcon','#goalBar .mfCinematicVectorIcon',
      '#mfNoticeHistory .mfCinematicVectorIcon'
    ];
    const iconEls=[...new Set(iconSelectors.flatMap(selector=>[...document.querySelectorAll(selector)]))].filter(shown);
    const iconMarks=iconEls.map(el=>{
      const vector=el.classList.contains('mfCinematicVectorIcon')||el.hasAttribute('data-mf-vector-icon'),
        svg=el.querySelector('svg'),atlas=el.getAttribute('data-icon'),ready=el.getAttribute('data-icon-ready'),
        atlasKnown=!!(atlas&&typeof mfCmdIconNames!=='undefined'&&mfCmdIconNames&&mfCmdIconNames.has(atlas)),
        style=getComputedStyle(el),background=style.backgroundImage||'',imgs=[...el.querySelectorAll('img')],
        raster=imgs.length>0&&imgs.every(img=>img.complete&&img.naturalWidth>0&&img.naturalHeight>0),
        rich=!!el.querySelector('canvas,.facIcon'),fallback=(el.getAttribute('data-mf-icon-fallback')||el.textContent||'').trim(),
        fallbackVisible=!!fallback&&parseFloat(style.fontSize)>0&&style.visibility!=='hidden'&&style.display!=='none';
      let kind='fallback',pass=fallbackVisible,reason=pass?'authored fallback':'empty fallback';
      if(vector){kind='vector';pass=!!(svg&&svg.getAttribute('viewBox'));reason=pass?'inline SVG':'vector mark missing SVG/viewBox';}
      else if(atlas&&ready==='true'){
        kind='atlas';pass=atlasKnown&&background!=='none';reason=pass?'validated atlas':'atlas cell not admitted or not painted';
      }else if(raster||rich){kind='raster';pass=true;reason=raster?'decoded raster':'runtime model icon';}
      else if(atlas&&ready!=='true'){
        kind='atlas-fallback';pass=fallbackVisible;reason=pass?'atlas fallback visible':'unready atlas hid its fallback';
      }
      return {id:el.id||null,className:String(el.className||'').slice(0,100),kind,pass,reason,atlas,ready,atlasKnown,
        vector:el.getAttribute('data-mf-vector-icon'),fallback:fallback.slice(0,32),fontSize:style.fontSize,
        background:background.slice(0,120),rect:rectOf(el)};
    });
    const iconFailures=iconMarks.filter(mark=>!mark.pass);

    /* The live hot-slot buttons are presentation only. Each one must retain a
       unique source key and exactly one rule owner: a hidden source button for
       abilities, or one bound local/mode/utility definition. */
    const hotViews=[...document.querySelectorAll('#hotSlots>.hotSlot,#hotUtilityPanel>.hotUtility')].filter(shown),
      hotKeyCounts=new Map();
    for(const el of hotViews)hotKeyCounts.set(el.dataset.hotSrc||'',(hotKeyCounts.get(el.dataset.hotSrc||'')||0)+1);
    const hotAuthorities=hotViews.map(el=>{
      const key=el.dataset.hotSrc||'',def=el._mfHotDef||null,isDomOwner=!!(def&&def.kind==='ab'&&def.src),
        ownerCount=isDomOwner?document.querySelectorAll('#'+CSS.escape(def.src)).length:(def?1:0),
        definitionPass=!!def&&(isDomOwner?ownerCount===1:def.kind==='local'?typeof def.fn==='function':
          def.kind==='mode'?Number.isFinite(def.mode):def.kind==='utility'?Array.isArray(def.items):true),
        presentationCount=hotKeyCounts.get(key)||0;
      return {key,label:el.getAttribute('aria-label')||'',kind:def&&def.kind||null,source:def&&def.src||null,
        ownerCount,presentationCount,pass:!!key&&presentationCount===1&&definitionPass};
    });
    const hotAuthorityFailures=hotAuthorities.filter(row=>!row.pass),authorityIds=['inboxHudBtn','spdBtn','menuBtn','minimap',
      'goalBar','goalDetailBtn','hudDeckTabs','armyBtn','idleBuilderBtn','boxBtn','stopBtn','buildBtn','patrolBtn','holdBtn',
      'formBtn','moveBtn','clearBtn','rotL','zoomIn','tiltBtn','zoomOut','rotR','queueBtn','bp_repair','bp_sell','noticeLogBtn',
      'cmdrTx','hotSlots','hotUtilityPanel','mfUnitStackRail','baseFinder','unitCard','consHud','hazChip','infMeter'],
      authorityDuplicates=authorityIds.map(id=>({id,count:document.querySelectorAll('#'+CSS.escape(id)).length})).filter(row=>row.count>1);
    const rootFontPx=parseFloat(getComputedStyle(document.documentElement).fontSize)||16,
      portrait=matchMedia('(orientation:portrait)').matches,
      metaText=Math.min(14,Math.max(8,rootFontPx*.5));
    /* Resource numerals deliberately retain a readable viewport-based floor at
       the 100% text setting, then follow the accessibility token upward. The
       placement angle has the same nine-pixel base-floor contract. Comparing
       either surface directly with `meta` made correct 13px/9px copy fail. */
    let resourceBase=Math.min(13,Math.max(9,innerWidth*.0285));
    if(portrait&&innerWidth<=430)resourceBase=Math.min(13,Math.max(10,innerWidth*.032));
    if(portrait&&innerWidth<=365)resourceBase=10;
    const expectedText={goal:Math.max(9,rootFontPx*.5625),card:Math.max(8,rootFontPx*.5),
      feed:Math.max(10,rootFontPx*.625),action:Math.min(18,Math.max(10,rootFontPx*.625)),
      dock:Math.min(11,Math.max(7,rootFontPx*.4375)),meta:metaText,
      resource:Math.max(resourceBase,metaText),rotation:Math.max(9,metaText),
      ability:Math.max(9,Math.min(11,Math.max(7,rootFontPx*.4375))),
      intelTitle:Math.max(14,Math.min(18,Math.max(10,rootFontPx*.625))),
      consumableName:Math.min(14,Math.max(11,rootFontPx*.625)),status:Math.max(11,rootFontPx*.6875),
      finderTitle:Math.min(12,Math.max(10,rootFontPx*.625)),finderCard:Math.min(11,Math.max(9,rootFontPx*.5625)),
      serviceAction:!portrait&&innerHeight<=600&&rootFontPx>16?8:portrait&&innerWidth<=365?10:
        Math.min(18,Math.max(10,rootFontPx*.625)),
      transmissionWho:portrait&&innerWidth<=365?9:10,transmissionCopy:portrait&&innerWidth<=365?8:10};
    const specs=[
      {key:'goal',selector:'#goalBar',token:'goal'},
      {key:'resource-value',selector:'#topbar .res b',token:'resource'},
      {key:'primary-build',selector:'#buildBtn',token:'dock'},
      {key:'deck-active',selector:'#hudDeckTabs .hudDeckBtn[aria-selected="true"]',token:'dock'},
      {key:'unit-stack-name',selector:'#mfUnitStackRail>.mfUnitStackCard .mfUnitStackName',token:'card',states:['unit-group-palette']},
      {key:'card-name',selector:'#mfCinematicContext .bcard .nm',token:'card',states:['build','production']},
      {key:'card-cost',selector:'#mfCinematicContext .bcard .cost',token:'card',states:['build','production']},
      {key:'service-title',selector:'#bp_title',token:'action',states:['structure-service']},
      {key:'service-description',selector:'#bp_desc',token:'feed',states:['structure-service']},
      {key:'service-stats',selector:'#bp_stats',token:'meta',states:['structure-service']},
      {key:'service-repair',selector:'#bp_repair',token:'serviceAction',states:['structure-service']},
      {key:'service-recycle',selector:'#bp_sell',token:'serviceAction',states:['structure-service']},
      {key:'placement-rotation',selector:'#placeRotDeg',token:'rotation',states:['placement']},
      {key:'ability-label',selector:'#hotSlots>.hotSlot .hNm',token:'ability',states:['abilities-utility','abilities-consumables']},
      {key:'utility-label',selector:'#hotUtilityPanel>.hotUtility .hNm',token:'card',states:['abilities-utility','abilities-consumables']},
      {key:'base-finder-title',selector:'#baseFinder header b',token:'finderTitle',states:['base-finder']},
      {key:'base-finder-card',selector:'#baseFinder .baseFindCard .baseFindCopy b',token:'finderCard',states:['base-finder']},
      {key:'unit-intel-title',selector:'#unitCard .ucHead b',token:'intelTitle',states:['unit-intel']},
      {key:'unit-intel-copy',selector:'#unitCard .ucHead small',token:'feed',states:['unit-intel']},
      {key:'consumable-name',selector:'#consHud .conHudNm',token:'consumableName',states:['consumables','abilities-consumables']},
      {key:'consumable-scope',selector:'#consHud .conHudScope',token:'dock',states:['consumables','abilities-consumables']},
      {key:'consumable-count',selector:'#consHud .conHudCt',token:'feed',states:['consumables','abilities-consumables']},
      {key:'hazard-name',selector:'#hazChip .hazNm',token:'feed',states:['hazard-infestation']},
      {key:'infestation-status',selector:'#infMeter',token:'status',states:['hazard-infestation']},
      {key:'transmission-speaker',selector:'#cmdrTxWho',token:'transmissionWho',states:['transmission-commander','transmission-keel']},
      {key:'transmission-copy',selector:'#cmdrTxLine',token:'transmissionCopy',states:['transmission-commander','transmission-keel']},
      {key:'event-copy',selector:'#mfNoticeHistory .mfNoticeItem>span',token:'feed',states:['event-feed']},
      {key:'event-time',selector:'#mfNoticeHistory .mfNoticeItem time',token:'meta',states:['event-feed']},
      {key:'event-type',selector:'#mfNoticeHistory .mfNoticeItem i',token:'meta',states:['event-feed']}
    ];
    const textSample=spec=>{
      const candidates=[...document.querySelectorAll(spec.selector)];
      const el=candidates.find(node=>shown(node)&&exposureOf(node).ratio>=.98)||candidates.find(rendered);if(!el)return null;
      const style=getComputedStyle(el),er=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);
      const rr=range.getBoundingClientRect(),clips=[];
      if(rr.width||rr.height)for(let p=el;p&&p!==document.documentElement;p=p.parentElement){
        const ps=getComputedStyle(p),pr=p.getBoundingClientRect(),clipsX=['hidden','clip'].includes(ps.overflowX),
          clipsY=['hidden','clip'].includes(ps.overflowY);
        /* DOM Range includes antialiased ascenders outside a line box. A two
           pixel metric overhang is not painted-copy loss; larger excursions
           still fail, as do fixed/body clipping and undersized line boxes. */
        if((clipsX&&(rr.left<pr.left-2.25||rr.right>pr.right+2.25))||(clipsY&&(rr.top<pr.top-2.25||rr.bottom>pr.bottom+2.25)))
          clips.push({id:p.id||null,className:String(p.className||'').slice(0,80),overflowX:ps.overflowX,overflowY:ps.overflowY,rect:rectOf(p)});
      }
      const intentionalEllipsis=style.textOverflow==='ellipsis'&&['hidden','clip'].includes(style.overflowX);
      const fontSize=parseFloat(style.fontSize),expected=expectedText[spec.token],exposure=exposureOf(el),
        atlasDriven=spec.key==='deck-active'&&fontSize===0&&!!el.querySelector(
          '.mfCinematicVectorIcon svg,.em[data-icon-ready="true"]');
      return {key:spec.key,selector:spec.selector,token:spec.token,text:el.textContent.trim().slice(0,120),
        fontSize,lineHeight:style.lineHeight,expected,atlasDriven,fontPass:atlasDriven||Math.abs(fontSize-expected)<=.35,
        rect:rectOf(el),textRect:{left:rr.left,top:rr.top,right:rr.right,bottom:rr.bottom,width:rr.width,height:rr.height},
        exposure,clippingAncestors:clips,clipped:clips.length>0,intentionalEllipsis};
    };
    const applicableSpecs=specs.filter(spec=>!spec.states||spec.states.includes(state));
    const textSamples=applicableSpecs.map(textSample).filter(Boolean);
    const requiredTextKeys=['goal','resource-value','primary-build'];
    if(['build','production'].includes(state))requiredTextKeys.push('card-name','card-cost');
    if(state==='structure-service')requiredTextKeys.push('service-title','service-description','service-stats','service-repair','service-recycle');
    if(state==='placement')requiredTextKeys.push('placement-rotation');
    if(state==='unit-group-palette')requiredTextKeys.push('unit-stack-name');
    if(['abilities-utility','abilities-consumables'].includes(state))requiredTextKeys.push('ability-label','utility-label');
    if(state==='base-finder')requiredTextKeys.push('base-finder-title','base-finder-card');
    if(state==='unit-intel')requiredTextKeys.push('unit-intel-title','unit-intel-copy');
    if(['consumables','abilities-consumables'].includes(state))requiredTextKeys.push('consumable-name','consumable-scope','consumable-count');
    if(state==='hazard-infestation')requiredTextKeys.push('hazard-name','infestation-status');
    if(['transmission-commander','transmission-keel'].includes(state))requiredTextKeys.push('transmission-speaker','transmission-copy');
    if(state==='event-feed')requiredTextKeys.push('event-copy','event-time','event-type');
    const sampledKeys=new Set(textSamples.map(sample=>sample.key)),missingTextSamples=requiredTextKeys.filter(key=>!sampledKeys.has(key));
    const textFontFailures=textSamples.filter(sample=>!sample.fontPass),
      textClipFailures=textSamples.filter(sample=>sample.clipped&&!sample.intentionalEllipsis&&!sample.exposure.clippedByScroller);
    const placeEl=document.getElementById('placeUI'),selectionEl=document.getElementById('selInfo'),
      placeShown=shown(placeEl),selectionShown=shown(selectionEl),placeRect=placeShown?rectOf(placeEl):null,
      selectionRect=selectionShown?rectOf(selectionEl):null;
    const placementPair={placeShown,selectionShown,placeRect,selectionRect,
      overlap:placeRect&&selectionRect?overlapArea(placeRect,selectionRect):0};
    const utilityEl=document.getElementById('hotUtilityPanel'),utilityShown=shown(utilityEl),
      utilityRect=utilityShown?rectOf(utilityEl):null,firstUtility=utilityShown&&utilityEl.querySelector(':scope > .hotUtility'),
      firstUtilityRect=firstUtility&&shown(firstUtility)?rectOf(firstUtility):null,
      firstUtilityPoint=firstUtilityRect?{x:firstUtilityRect.left+firstUtilityRect.width/2,
        y:firstUtilityRect.top+firstUtilityRect.height/2}:null,
      firstUtilityHit=firstUtilityPoint?document.elementFromPoint(firstUtilityPoint.x,firstUtilityPoint.y):null;
    const utilityLane={shown:utilityShown,bodyState:document.body.classList.contains('mfHotUtilityOpen'),
      compactPortrait:innerWidth<=430&&innerHeight>innerWidth,rect:utilityRect,
      minimapOverlap:utilityRect&&minimapRect?overlapArea(utilityRect,minimapRect):0,
      minimapHorizontalGap:utilityRect&&minimapRect?utilityRect.left-minimapRect.right:null,
      selectionShown,selectionOverlap:utilityRect&&selectionRect?overlapArea(utilityRect,selectionRect):0,
      firstControlRect:firstUtilityRect,firstControlPoint:firstUtilityPoint,
      firstControlHit:firstUtilityHit&&(firstUtilityHit.id||firstUtilityHit.className||firstUtilityHit.tagName),
      firstControlHitOwned:!!(firstUtility&&firstUtilityHit&&(firstUtilityHit===firstUtility||firstUtility.contains(firstUtilityHit)))};
    const stackRail=document.getElementById('mfUnitStackRail'),stackShown=shown(stackRail),
      stackRect=stackShown?rectOf(stackRail):null,groupRow=document.getElementById('grpRow'),
      groupRect=shown(groupRow)?rectOf(groupRow):null,stackStyle=stackRail?getComputedStyle(stackRail):null,
      stackCards=stackRail?[...stackRail.querySelectorAll(':scope > .mfUnitStackCard')]:[],liveByType=new Map();
    if(typeof unitHigh!=='undefined')for(let i=0;i<unitHigh;i++)if(ualive[i]&&
      (typeof mfLocalOwnsUnit==='function'?mfLocalOwnsUnit(i):uteam[i]===0))
      liveByType.set(utype[i],(liveByType.get(utype[i])||0)+1);
    const stackCardRows=stackCards.map(card=>{const rect=rectOf(card),icon=card.querySelector(':scope > .mfUnitStackIcon'),
      type=Number(card.dataset.unitType),count=Number(card.dataset.count),health=Number(card.dataset.health),
      ready=Number(card.dataset.ready),selected=Number(card.dataset.selected);
      return {tag:card.tagName,type,key:card.dataset.unitStackKey||'',count,ready,selected,health,rect,
        targetPass:rect.width>=43.5&&rect.height>=43.5,label:card.getAttribute('aria-label')||'',
        pressed:card.getAttribute('aria-pressed'),iconChildren:icon?icon.children.length:0,
        authoredArt:!!(icon&&icon.querySelector(':scope > .mfUnitStackArt')),
        fallbackArt:!!(icon&&icon.querySelector(':scope > .mfUnitStackFallback')),
        healthFill:!!card.querySelector('.mfUnitStackHealthFill')};
    }),stackKeys=stackCardRows.map(row=>row.key),stackTypes=stackCardRows.map(row=>row.type).sort((a,b)=>a-b),
      liveTypes=[...liveByType.keys()].sort((a,b)=>a-b);
    const unitStack={shown:stackShown,railCount:document.querySelectorAll('#mfUnitStackRail').length,
      rect:stackRect,groupRect,directChild:!!(stackRail&&stackRail.parentElement===groupRow),
      role:stackRail&&stackRail.getAttribute('role'),label:stackRail&&stackRail.getAttribute('aria-label'),
      scrollRail:stackRail&&stackRail.dataset.mfScrollRail,overflowX:stackStyle&&stackStyle.overflowX,
      overflowY:stackStyle&&stackStyle.overflowY,touchAction:stackStyle&&stackStyle.touchAction,
      contained:!!(stackRect&&groupRect&&stackRect.left>=groupRect.left-.75&&stackRect.top>=groupRect.top-.75&&
        stackRect.right<=groupRect.right+.75&&stackRect.bottom<=groupRect.bottom+.75),
      cardCount:stackCards.length,uniqueKeys:new Set(stackKeys).size,types:stackTypes,liveTypes,
      countSum:stackCardRows.reduce((sum,row)=>sum+row.count,0),liveCount:[...liveByType.values()].reduce((a,b)=>a+b,0),
      cards:stackCardRows,targetFailures:stackCardRows.filter(row=>!row.targetPass),
      artFailures:stackCardRows.filter(row=>row.iconChildren!==1||(!row.authoredArt&&!row.fallbackArt)||!row.healthFill),
      labelFailures:stackCardRows.filter(row=>row.tag!=='BUTTON'||!row.label||!['true','false'].includes(row.pressed)),
      platoonButtons:groupRow?[...groupRow.querySelectorAll(':scope > .grpBtn')].map(button=>button.id):[],
      snapshot:window.MFUnitStackHotbar&&typeof MFUnitStackHotbar.snapshot==='function'?MFUnitStackHotbar.snapshot():null};
    const minimapAccess=minimapEl?{role:minimapEl.getAttribute('role'),label:minimapEl.getAttribute('aria-label'),
      receiver:minimapEl.getAttribute('data-mf-hud-role')}:null;
    const goalEl=document.getElementById('goalBar'),goalAction=document.getElementById('goalDetailBtn'),
      goalChips=goalEl?[...goalEl.querySelectorAll('.hudIntelChip')]:[],goalActionRect=goalAction?rectOf(goalAction):null;
    const goalAccess=goalEl?{role:goalEl.getAttribute('role'),live:goalEl.getAttribute('aria-live'),
      text:goalEl.textContent.trim(),chipCount:goalChips.length,
      actionCount:document.querySelectorAll('#goalDetailBtn').length,actionTag:goalAction&&goalAction.tagName||null,
      actionLabel:goalAction&&goalAction.getAttribute('aria-label')||null,actionTabIndex:goalAction&&goalAction.tabIndex,
      actionBound:goalAction&&goalAction.dataset.mfMissionBound||null,actionDisabled:!!(goalAction&&goalAction.disabled),
      actionRect:goalActionRect,
      emptyChips:goalChips.filter(chip=>!chip.textContent.trim()).length,
      wholeChipVectors:goalChips.filter(chip=>chip.hasAttribute('data-mf-vector-icon')).length,
      childVectors:goalChips.filter(chip=>!!chip.querySelector('.mfCinematicGoalIcon[data-mf-vector-icon]')).length,
      chips:goalChips.map(chip=>chip.textContent.trim())}:null;
    const visualViewport=window.visualViewport?{width:window.visualViewport.width,height:window.visualViewport.height,
      offsetLeft:window.visualViewport.offsetLeft,offsetTop:window.visualViewport.offsetTop,scale:window.visualViewport.scale}:null;
    return {state,expectedId,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,textScale:config.textScale,
      motion:config.motion,safe:config.safe,visualViewport},body,controls,clippedControls,clippedFixed,
      tooSmall,serviceTooSmall,unsafe,
      horizontalOverflow,visibleRootIds:roots.map(el=>el.id),surfaces,surfaceSafeFailures,composedSurfaceOverlaps,
      minimapRect,minimapConflicts,
      hudArea,hudOccupancy:hudArea/Math.max(1,viewportArea),
      centerRoi:roi,centerCoveredComputed:centerCovered/Math.max(1,centerArea),centerCoverageUpper:Math.min(1,centerUpper),
       canvasDpr,images,imageFailures,iconMarks,iconFailures,hotAuthorities,hotAuthorityFailures,authorityDuplicates,
       textScaleAttr:document.documentElement.dataset.mfTextScale||null,
       expectedText,textSamples,missingTextSamples,textFontFailures,textClipFailures,placementPair,utilityLane,unitStack,minimapAccess,goalAccess,
      reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
      textFontSize:getComputedStyle(document.documentElement).fontSize,
      runtime:{matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true,
        paused:typeof paused!=='undefined'?paused:null,hudDeck:typeof hudDeck!=='undefined'?hudDeck:null,
        selected:typeof selCount==='function'?selCount():null,placing:typeof placing!=='undefined'?placing:null,
        openBld:typeof openBld!=='undefined'?openBld:null,transmission:typeof cmdrTxDebug==='function'?cmdrTxDebug():null,
        userAgent:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints||0,
        coarsePointer:matchMedia('(pointer:coarse)').matches,mobileGpu:typeof MF_MOBILE_GPU==='boolean'?MF_MOBILE_GPU:null,
        rendererDpr,cinematic:window.MFCinematicHud&&typeof window.MFCinematicHud.snapshot==='function'?window.MFCinematicHud.snapshot():null}}
  },{config,state,expectedId:EXPECTED_SURFACE[state]});
}

async function clickThroughProbe(page,state,expectedId){
  const pointerSurface=Array.isArray(expectedId)?expectedId[expectedId.length-1]:expectedId;
  await page.evaluate(()=>{
    const gl=document.getElementById('gl');window.__mfHudGlPointerDown=0;
    if(gl&&!gl.__mfHudClickProbe){gl.__mfHudClickProbe=true;gl.addEventListener('pointerdown',()=>window.__mfHudGlPointerDown++,true);}
  });
  if(state==='resting'){
    const point=await page.evaluate(()=>{
      const candidates=[[.5,.44],[.5,.5],[.42,.42],[.58,.42]];
      for(const [x,y] of candidates){const px=innerWidth*x,py=innerHeight*y,hit=document.elementFromPoint(px,py),gl=document.getElementById('gl');
        if(hit===gl)return {x:px,y:py,hit:'gl'};}return null;
    });
    if(!point)return {kind:'playfield-receives-input',pass:false,reason:'no clear canvas point'};
    const before=await page.evaluate(()=>window.__mfHudGlPointerDown);await page.mouse.click(point.x,point.y);
    const after=await page.evaluate(()=>window.__mfHudGlPointerDown);
    return {kind:'playfield-receives-input',pass:after===before+1,point,before,after};
  }
  if(pointerSurface==='cmdrTx'){
    return page.evaluate(()=>{
      const tx=document.getElementById('cmdrTx'),r=tx&&tx.getBoundingClientRect();if(!r)return {kind:'transmission-pass-through',pass:false,reason:'missing receiver'};
      const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y),blocked=!!(hit&&(hit===tx||tx.contains(hit)));
      return {kind:'transmission-pass-through',pass:!blocked,pointerEvents:getComputedStyle(tx).pointerEvents,
        point:{x,y},hit:hit&&(hit.id||hit.tagName),blocked};
    });
  }
  if(pointerSurface==='hotSlots'||pointerSurface==='hotUtilityPanel'){
    return page.evaluate(id=>{
      const panel=document.getElementById(id),gl=document.getElementById('gl'),r=panel&&panel.getBoundingClientRect();
      if(!panel||!r)return {kind:'ability-surface-hit-route',pass:false,reason:'missing ability surface',expectedId:id};
      const points=[[.5,.5],[.2,.5],[.8,.5]];
      for(const [fx,fy] of points){
        const x=r.left+r.width*fx,y=r.top+r.height*fy,hit=document.elementFromPoint(x,y);
        if(hit&&hit!==gl&&(hit===panel||panel.contains(hit)))return {kind:'ability-surface-hit-route',pass:true,
          expectedId:id,point:{x,y},hit:hit.id||hit.className||hit.tagName};
      }
      return {kind:'ability-surface-hit-route',pass:false,expectedId:id,reason:'surface does not win hit testing'};
    },pointerSurface);
  }
  const point=await page.evaluate(id=>{
    const panel=document.getElementById(id);if(!panel)return null;const r=panel.getBoundingClientRect();
    const tries=[[.5,.12],[.5,.5],[.2,.12],[.8,.12],[.5,.85]];
    for(const [fx,fy] of tries){const x=r.left+r.width*fx,y=r.top+r.height*fy,hit=document.elementFromPoint(x,y);
      if(hit&&(hit===panel||panel.contains(hit)))return {x,y,hit:hit.id||hit.tagName};}return null;
  },pointerSurface);
  if(!point)return {kind:'surface-blocks-playfield',pass:false,reason:'no hit-test point',expectedId:pointerSurface};
  const before=await page.evaluate(()=>window.__mfHudGlPointerDown);await page.mouse.click(point.x,point.y);
  const after=await page.evaluate(()=>window.__mfHudGlPointerDown);
  return {kind:'surface-blocks-playfield',pass:after===before,point,before,after,expectedId:pointerSurface};
}

async function inboxPointerProbe(page){
  await resetHud(page);await page.waitForTimeout(100);
  const target=await page.evaluate(()=>{
    const gl=document.getElementById('gl'),button=document.getElementById('inboxHudBtn');window.__mfHudGlPointerDown=0;
    if(gl&&!gl.__mfHudClickProbe){gl.__mfHudClickProbe=true;gl.addEventListener('pointerdown',()=>window.__mfHudGlPointerDown++,true);}
    if(!button)return {ok:false,reason:'missing #inboxHudBtn'};
    const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
    return {ok:!!hit&&(hit===button||button.contains(hit)),x,y,hit:hit&&(hit.id||hit.tagName),
      buttonRect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
      pointerEvents:getComputedStyle(button).pointerEvents,canvasBefore:window.__mfHudGlPointerDown};
  });
  if(!target.ok)return {kind:'inbox-pointer-route',pass:false,target};
  await page.mouse.click(target.x,target.y);
  await page.waitForFunction(()=>document.body.dataset.frontPopup==='inboxScr'&&(()=>{
    const e=document.getElementById('inboxScr'),s=e&&getComputedStyle(e),r=e&&e.getBoundingClientRect();
    return !!(e&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0);
  })(),null,{timeout:10000});
  const opened=await page.evaluate(()=>({popup:document.body.dataset.frontPopup||null,
    visible:getComputedStyle(document.getElementById('inboxScr')).display!=='none',
    matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true,
    canvasPointers:window.__mfHudGlPointerDown}));
  /* The global ghost-click guard intentionally owns the compatibility click
     immediately after a route-changing pointer-up. A human reads the inbox;
     give that guard its 650ms window before testing the independent Back tap. */
  await page.waitForTimeout(700);
  const back=page.locator('#inboxBack').first();await back.waitFor({state:'visible',timeout:10000});
  const backTarget=await page.evaluate(()=>{
    const button=document.getElementById('inboxBack'),r=button&&button.getBoundingClientRect();if(!r)return null;
    const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
    return {x,y,hit:hit&&(hit.id||hit.tagName),route:!!hit&&(hit===button||button.contains(hit))};
  });
  if(!backTarget||!backTarget.route)return {kind:'inbox-pointer-route',pass:false,target,opened,backTarget};
  await page.mouse.click(backTarget.x,backTarget.y);
  const backClosed=await page.waitForFunction(()=>document.body.dataset.frontPopup!=='inboxScr'&&
    getComputedStyle(document.getElementById('inboxScr')).display==='none',null,{timeout:10000}).then(()=>true).catch(()=>false);
  const closed=await page.evaluate(()=>({popup:document.body.dataset.frontPopup||null,
    visible:getComputedStyle(document.getElementById('inboxScr')).display!=='none',
    matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true,
    canvasPointers:window.__mfHudGlPointerDown}));
  return {kind:'inbox-pointer-route',pass:opened.popup==='inboxScr'&&opened.visible&&opened.matchLive&&opened.running&&
    backClosed&&!closed.visible&&closed.popup!=='inboxScr'&&closed.matchLive&&closed.running&&
    opened.canvasPointers===target.canvasBefore&&closed.canvasPointers===target.canvasBefore,target,opened,backTarget,closed};
}

function rotateSafeClockwise(safe){return {name:'rotated-'+safe.name,top:safe.left,right:safe.top,bottom:safe.right,left:safe.bottom};}

async function rotationGeometrySnapshot(page,config,state){
  return page.evaluate(({config,state,expectedId})=>{
    const shown=el=>{if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>.5&&r.height>.5;};
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,
      width:r.width,height:r.height};};
    const overlap=(a,b)=>a&&b?Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
      Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)):0;
    const safeProbe=document.createElement('div');safeProbe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;'+
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(safeProbe);const safeStyle=getComputedStyle(safeProbe),safeObserved={top:parseFloat(safeStyle.paddingTop)||0,
      right:parseFloat(safeStyle.paddingRight)||0,bottom:parseFloat(safeStyle.paddingBottom)||0,left:parseFloat(safeStyle.paddingLeft)||0};
    safeProbe.remove();const expectedIds=Array.isArray(expectedId)?expectedId:(expectedId?[expectedId]:[]),
      surfaces=expectedIds.map(id=>{const el=document.getElementById(id);return shown(el)?{id,el,rect:rect(el)}:null;}).filter(Boolean),
      surfaceRect=surfaces[0]?.rect||null,minimap=document.getElementById('minimapWrap'),minimapRect=shown(minimap)?rect(minimap):null,
      command=document.getElementById('cmdbar'),commandRect=shown(command)?rect(command):null,
      safeRect={left:config.safe.left,top:config.safe.top,right:innerWidth-config.safe.right,bottom:innerHeight-config.safe.bottom};
    const safeFailures=surfaces.filter(row=>row.rect.left<safeRect.left-.75||row.rect.top<safeRect.top-.75||
      row.rect.right>safeRect.right+.75||row.rect.bottom>safeRect.bottom+.75),
      withinSafe=surfaces.length===expectedIds.length&&safeFailures.length===0,
      transmission=state==='transmission-commander'||state==='transmission-keel',
      transmissionContained=!transmission||!!(surfaces.length===1&&minimapRect&&surfaces[0].id==='cmdrTx'&&
        surfaces[0].rect.left>=minimapRect.left-1&&surfaces[0].rect.top>=minimapRect.top-1&&
        surfaces[0].rect.right<=minimapRect.right+1&&surfaces[0].rect.bottom<=minimapRect.bottom+1);
    const pairwiseOverlaps=[];
    for(let i=0;i<surfaces.length;i++)for(let j=i+1;j<surfaces.length;j++){
      const area=overlap(surfaces[i].rect,surfaces[j].rect);
      if(area>1)pairwiseOverlaps.push({a:surfaces[i].id,b:surfaces[j].id,area});
    }
    const minimapConflicts=surfaces.map(row=>({id:row.id,area:overlap(row.rect,minimapRect)}))
      .filter(row=>row.area>1&&!(row.id==='cmdrTx'&&minimap&&minimap.contains(document.getElementById(row.id)))),
      commandConflicts=surfaces.map(row=>({id:row.id,area:overlap(row.rect,commandRect)}))
        .filter(row=>row.area>1&&!(command&&command.contains(document.getElementById(row.id))));
    const visualViewport=window.visualViewport?{width:window.visualViewport.width,height:window.visualViewport.height,
      offsetLeft:window.visualViewport.offsetLeft,offsetTop:window.visualViewport.offsetTop,scale:window.visualViewport.scale}:null;
    const viewportPass=innerWidth===config.width&&innerHeight===config.height&&!!visualViewport&&
      Math.abs(visualViewport.width-innerWidth)<=1&&Math.abs(visualViewport.height-innerHeight)<=1&&
      Math.abs(visualViewport.offsetLeft)<=.5&&Math.abs(visualViewport.offsetTop)<=.5&&Math.abs(visualViewport.scale-1)<=.01;
    const safePass=['top','right','bottom','left'].every(side=>Math.abs(safeObserved[side]-config.safe[side])<.75);
    const bodyPass=document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1&&
      document.documentElement.scrollHeight<=innerHeight+1&&document.body.scrollHeight<=innerHeight+1;
    const minimapOverlap=minimapConflicts.reduce((sum,row)=>sum+row.area,0),
      commandOverlap=commandConflicts.reduce((sum,row)=>sum+row.area,0);
    return {state,expectedId,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,visualViewport},safeObserved,safeRect,
      surfaceRect,surfaces:surfaces.map(row=>({id:row.id,rect:row.rect})),safeFailures,pairwiseOverlaps,minimapRect,commandRect,
      withinSafe,transmissionContained,minimapOverlap,commandOverlap,minimapConflicts,commandConflicts,viewportPass,safePass,
      bodyPass,pass:surfaces.length===expectedIds.length&&withinSafe&&transmissionContained&&pairwiseOverlaps.length===0&&
        minimapConflicts.length===0&&commandConflicts.length===0&&viewportPass&&safePass&&bodyPass,
      runtime:{matchLive:typeof matchLive!=='undefined'&&matchLive===true,running:typeof running!=='undefined'&&running===true,
        placing:typeof placing!=='undefined'?placing:null,transmission:typeof cmdrTxDebug==='function'?cmdrTxDebug():null}};
  },{config,state,expectedId:EXPECTED_SURFACE[state]});
}

async function rotationProbe(page,cdp,config){
  await resetHud(page);await seedUnitGroup(page);
  const target=config.rotationTarget||{width:config.height,height:config.width,safe:rotateSafeClockwise(config.safe)};
  const before=await page.evaluate(()=>({
    selected:Array.from({length:unitHigh},(_,i)=>i).filter(i=>ualive[i]&&usel[i]).map(i=>[i,ugen[i]]),
    groups:ctrlGroups.map(g=>g.map(e=>e.slice())),activePlatoon,hudDeck,
    surface:['grpRow','buildMenu','prodMenu','bldMenu2','placeUI','mfNoticeHistory'].find(id=>{
      const e=document.getElementById(id);if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})||null
  }));
  const targetSafe=await setViewportEnvironment(page,cdp,target.width,target.height,target.safe);
  const rotated=await page.evaluate(()=>({width:innerWidth,height:innerHeight,selected:Array.from({length:unitHigh},(_,i)=>i)
    .filter(i=>ualive[i]&&usel[i]).map(i=>[i,ugen[i]]),groups:ctrlGroups.map(g=>g.map(e=>e.slice())),activePlatoon,hudDeck}));
  const restoreSafe=await setViewportEnvironment(page,cdp,config.width,config.height,config.safe);
  const restored=await page.evaluate(()=>({width:innerWidth,height:innerHeight,selected:Array.from({length:unitHigh},(_,i)=>i)
    .filter(i=>ualive[i]&&usel[i]).map(i=>[i,ugen[i]]),groups:ctrlGroups.map(g=>g.map(e=>e.slice())),activePlatoon,hudDeck,
    surface:['grpRow','buildMenu','prodMenu','bldMenu2','placeUI','mfNoticeHistory'].find(id=>{
      const e=document.getElementById(id);if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})||null}));
  const stable=value=>JSON.stringify(value),selectionPass=stable(before.selected)===stable(rotated.selected)&&stable(before.selected)===stable(restored.selected)&&
    stable(before.groups)===stable(rotated.groups)&&stable(before.groups)===stable(restored.groups)&&
    before.activePlatoon===rotated.activePlatoon&&before.activePlatoon===restored.activePlatoon&&
    before.hudDeck===rotated.hudDeck&&before.hudDeck===restored.hudDeck&&before.surface===restored.surface&&
    rotated.width===target.width&&rotated.height===target.height&&restored.width===config.width&&restored.height===config.height;
  const geometry=[];
  if(config.rotationSuite)for(const state of ROTATION_GEOMETRY_STATES){
    await setViewportEnvironment(page,cdp,config.width,config.height,config.safe);const setup=await prepareState(page,state);
    await page.waitForTimeout(120);const initial=await rotationGeometrySnapshot(page,config,state);
    const rotatedSafe=await setViewportEnvironment(page,cdp,target.width,target.height,target.safe),
      turned=await rotationGeometrySnapshot(page,{...config,width:target.width,height:target.height,safe:target.safe},state);
    const restoredSafe=await setViewportEnvironment(page,cdp,config.width,config.height,config.safe),
      returned=await rotationGeometrySnapshot(page,config,state);
    geometry.push({state,setup,initial,rotated:turned,restored:returned,safeArea:{rotated:rotatedSafe,restored:restoredSafe},
      pass:initial.pass&&turned.pass&&returned.pass&&initial.runtime.matchLive&&turned.runtime.matchLive&&returned.runtime.matchLive&&
        initial.runtime.running&&turned.runtime.running&&returned.runtime.running});
  }
  return {pass:selectionPass&&targetSafe.emulated&&restoreSafe.emulated&&geometry.every(row=>row.pass),selectionPass,
    target,deepGeometry:config.rotationSuite,geometry,safeArea:{target:targetSafe,restore:restoreSafe},before,rotated,restored};
}

function occupancyLimit(config,state){
  const landscape=config.width>config.height,expanded=['abilities-utility','abilities-consumables','build','production','structure-service','placement',
    'base-finder','unit-intel','event-feed'].includes(state);
  if(state==='resting')return landscape?.22:.28;
  if(expanded)return landscape?.42:.50;
  return landscape?.30:.36;
}
function centerLimit(config,state){return state==='resting'?(config.width>config.height?.02:.01):
  ['unit-group-palette','abilities','consumables','hazard-infestation','transmission-commander','transmission-keel'].includes(state)?.10:.25;}
function stateAssertions(config,state,measure,clickProbe){
  const expected=EXPECTED_SURFACE[state],expectedIds=Array.isArray(expected)?expected:(expected?[expected]:[]),
    surfaceIds=measure.surfaces.map(s=>s.id),body=measure.body,canvas=measure.canvasDpr,unitStack=measure.unitStack;
  const cinematicSurface={build:'build',production:'production','structure-service':'structure'}[state]||'none';
  const cinematic=measure.runtime.cinematic,rendererDpr=canvas.rendererDpr,
    scaleTolerance=Math.max(.025,1/Math.max(1,Math.min(canvas.css?.width||1,canvas.css?.height||1))+.01),
    mobileExpected=mobileGpuBranchExpected(config.userAgent||measure.runtime.userAgent);
  const authorityKeys=['inbox','speed','pause','minimap','missionStatus','missionAction','deckTabs','ordersTab','platoonsTab',
    'buildingsTab','abilitiesTab','viewTab','army','idleBuilders','boxSelect','stop','build','patrol','hold','formation',
    'attackMove','clearSelection','rotateLeft','zoomIn','tilt','zoomOut','rotateRight','feed','transmission','hotslots','utility'];
  const authorityMissing=authorityKeys.filter(key=>!cinematic||!cinematic.authority||!cinematic.authority[key]),
    authorityDuplicateKeys=authorityKeys.filter(key=>cinematic&&cinematic.authority&&cinematic.authority[key]&&
      cinematic.authority[key].duplicateCount>0);
  return [
    {name:'live battle retained',pass:measure.runtime.matchLive&&measure.runtime.running,evidence:measure.runtime},
    {name:'cinematic takeover owns one authority tree',pass:!!cinematic&&cinematic.ready===true&&cinematic.authorityOk===true&&
      cinematic.authorityDuplicateCount===0&&cinematic.recycleCount===1&&cinematic.surface===cinematicSurface,
      evidence:{expectedSurface:cinematicSurface,snapshot:cinematic}},
    {name:'canonical HUD authority inventory is complete and duplicate-free',pass:authorityMissing.length===0&&
      authorityDuplicateKeys.length===0,evidence:{required:authorityKeys,missing:authorityMissing,duplicates:authorityDuplicateKeys,
        snapshot:cinematic&&cinematic.authority}},
    {name:'mission rail is a live status with one native briefing action',pass:!!measure.goalAccess&&
      measure.goalAccess.role==='status'&&measure.goalAccess.live==='polite'&&measure.goalAccess.actionCount===1&&
      measure.goalAccess.actionTag==='BUTTON'&&measure.goalAccess.actionTabIndex===0&&measure.goalAccess.actionBound==='1'&&
      !measure.goalAccess.actionDisabled&&!!measure.goalAccess.actionLabel&&measure.goalAccess.actionRect&&
      measure.goalAccess.actionRect.width>=43.5&&measure.goalAccess.actionRect.height>=23.5,evidence:measure.goalAccess},
    {name:'no document/body scroll',pass:body.htmlScrollWidth<=body.innerWidth+1&&body.bodyScrollWidth<=body.innerWidth+1&&
      body.htmlScrollHeight<=body.innerHeight+1&&body.bodyScrollHeight<=body.innerHeight+1,evidence:body},
    {name:'no horizontal HUD overflow',pass:measure.horizontalOverflow.length===0,evidence:measure.horizontalOverflow},
    {name:'controls at least 44 CSS px',pass:measure.tooSmall.length===0,evidence:measure.tooSmall},
    {name:'Repair/Recycle at least 48 CSS px',pass:state!=='structure-service'||measure.serviceTooSmall.length===0,
      evidence:measure.serviceTooSmall},
    {name:'fixed controls remain fully exposed',pass:measure.clippedFixed.length===0,evidence:measure.clippedFixed},
    {name:'controls inside safe bounds',pass:measure.unsafe.length===0,evidence:measure.unsafe},
    {name:'complete expected surfaces remain inside safe bounds',pass:measure.surfaceSafeFailures.length===0,
      evidence:measure.surfaceSafeFailures},
    {name:'composed expected surfaces own separate lanes',pass:!Array.isArray(expected)||
      measure.composedSurfaceOverlaps.length===0,evidence:measure.composedSurfaceOverlaps},
    {name:'minimap does not overlap command surfaces',pass:measure.minimapConflicts.length===0,evidence:measure.minimapConflicts},
    {name:'utility drawer body state matches live visibility',pass:measure.utilityLane.bodyState===measure.utilityLane.shown,
      evidence:measure.utilityLane},
    {name:'utility drawer owns a collision-free responsive lane',pass:!['abilities-utility','abilities-consumables'].includes(state)||
      (measure.utilityLane.shown&&measure.utilityLane.minimapOverlap<=1&&measure.utilityLane.firstControlHitOwned&&
        (!measure.utilityLane.compactPortrait||(!measure.utilityLane.selectionShown&&
          measure.utilityLane.minimapHorizontalGap>=3.5))),evidence:measure.utilityLane},
    {name:'exact contextual surface authority',pass:surfaceIds.length===expectedIds.length&&
      expectedIds.every(id=>surfaceIds.includes(id)),evidence:{expected:expectedIds,visible:surfaceIds}},
    {name:'HUD occupancy threshold',pass:measure.hudOccupancy<=occupancyLimit(config,state),
      evidence:{actual:measure.hudOccupancy,limit:occupancyLimit(config,state),area:measure.hudArea}},
    {name:'center playfield clearance',pass:measure.centerCoverageUpper<=centerLimit(config,state),
      evidence:{actual:measure.centerCoverageUpper,limit:centerLimit(config,state),roi:measure.centerRoi}},
    {name:'configured viewport and raw DPR retained',pass:measure.viewport.width===config.width&&
      measure.viewport.height===config.height&&Math.abs(measure.viewport.dpr-config.dpr)<=.01,
      evidence:{configured:{width:config.width,height:config.height,dpr:config.dpr},actual:measure.viewport}},
    {name:'browser profile reaches the intended renderer branch',pass:measure.runtime.userAgent===(config.userAgent||measure.runtime.userAgent)&&
      measure.runtime.mobileGpu===mobileExpected&&(!config.mobile||
        (isAndroidMobileUserAgent(measure.runtime.userAgent)&&measure.runtime.maxTouchPoints>0&&measure.runtime.coarsePointer)),
      evidence:{profile:config.deviceProfile,configuredUserAgent:config.userAgent,actualUserAgent:measure.runtime.userAgent,
        expectedMobileGpu:mobileExpected,actualMobileGpu:measure.runtime.mobileGpu,maxTouchPoints:measure.runtime.maxTouchPoints,
        coarsePointer:measure.runtime.coarsePointer}},
    {name:'renderer DPR and drawing buffer match the live canvas',pass:canvas.exists&&canvas.live&&canvas.uniform&&
      Number.isFinite(rendererDpr)&&rendererDpr>0&&rendererDpr<=canvas.devicePixelRatio+.01&&
      Math.abs(canvas.scaleX-rendererDpr)<=scaleTolerance&&Math.abs(canvas.scaleY-rendererDpr)<=scaleTolerance&&
      Math.abs(canvas.width-canvas.expectedWidth)<=1&&Math.abs(canvas.height-canvas.expectedHeight)<=1&&
      canvas.drawingBufferWidth===canvas.width&&canvas.drawingBufferHeight===canvas.height,
      evidence:canvas},
    {name:'visible HUD images load without stretching',pass:measure.imageFailures.length===0,evidence:measure.imageFailures},
    {name:'visible GUI icon marks resolve to vector, validated atlas, or authored fallback',pass:measure.iconFailures.length===0,
      evidence:{failures:measure.iconFailures,marks:measure.iconMarks}},
    {name:'authoritative controls are unique',pass:measure.authorityDuplicates.length===0&&measure.hotAuthorityFailures.length===0,
      evidence:{duplicates:measure.authorityDuplicates,hotSlotFailures:measure.hotAuthorityFailures,hotSlots:measure.hotAuthorities}},
    {name:'unit-stack palette is one contained scroll authority',pass:state!=='unit-group-palette'||!!unitStack&&
      unitStack.shown&&unitStack.railCount===1&&unitStack.directChild&&unitStack.contained&&unitStack.role==='group'&&
      !!unitStack.label&&unitStack.scrollRail==='horizontal'&&['auto','scroll'].includes(unitStack.overflowX)&&
      unitStack.overflowY==='hidden'&&String(unitStack.touchAction||'').includes('pan-x')&&unitStack.cardCount>0&&
      unitStack.cardCount===unitStack.liveTypes.length&&unitStack.uniqueKeys===unitStack.cardCount&&
      JSON.stringify(unitStack.types)===JSON.stringify(unitStack.liveTypes)&&unitStack.countSum===unitStack.liveCount&&
      unitStack.targetFailures.length===0&&unitStack.artFailures.length===0&&unitStack.labelFailures.length===0&&
      JSON.stringify(unitStack.platoonButtons)===JSON.stringify(['grpBtn1','grpBtn2','grpBtn3','grpBtn4'])&&
      unitStack.snapshot?.platoonButtons===4,evidence:unitStack},
    {name:'minimap receiver has an accessible identity',pass:measure.minimapAccess?.role==='region'&&
      !!measure.minimapAccess?.label&&measure.minimapAccess?.receiver==='minimap-receiver',evidence:measure.minimapAccess},
    {name:'goal rail preserves readable status copy beside child-only art',pass:measure.goalAccess?.role==='status'&&
      measure.goalAccess?.live==='polite'&&measure.goalAccess?.chipCount>0&&measure.goalAccess?.emptyChips===0&&
      measure.goalAccess?.wholeChipVectors===0&&measure.goalAccess?.childVectors===measure.goalAccess?.chipCount&&
      !!measure.goalAccess?.text,evidence:measure.goalAccess},
    {name:'reduced-motion contract',pass:measure.reducedMotion===(config.motion==='reduced'),
      evidence:{expected:config.motion,actual:measure.reducedMotion}},
    {name:'real text-scale contract applied',pass:measure.textScaleAttr===String(config.textScale)&&
      Math.abs(parseFloat(measure.textFontSize)-(16*config.textScale/100))<.2,
      evidence:{expectedScale:config.textScale,attribute:measure.textScaleAttr,expectedRootPx:16*config.textScale/100,
        actualRootPx:measure.textFontSize}},
    {name:'visible HUD typography follows scale tokens',pass:measure.missingTextSamples.length===0&&
      measure.textFontFailures.length===0,evidence:{expected:measure.expectedText,missing:measure.missingTextSamples,
        failures:measure.textFontFailures,samples:measure.textSamples}},
    {name:'scaled HUD copy is not unexpectedly clipped',pass:measure.textClipFailures.length===0,
      evidence:{failures:measure.textClipFailures,samples:measure.textSamples}},
    {name:'placement controls own a collision-free lane',pass:state!=='placement'||
      (measure.placementPair.placeShown&&measure.placementPair.overlap<=1&&!measure.placementPair.selectionShown),
      evidence:measure.placementPair},
    {name:'pointer routing',pass:clickProbe.pass,evidence:clickProbe}
  ];
}

function setupAssertions(state,setup){
  const abilitySetup=state==='abilities-consumables'?setup.abilities:setup,
    consumableSetup=state==='abilities-consumables'?setup.consumables:setup;
  const checks=[{name:'resetHud closes the Utility drawer and Base Finder',pass:setup.reset?.utilityClosed===true&&
    setup.reset?.baseFinderClosed===true,evidence:setup.reset}];
  if(state==='unit-group-palette'){
    const unitStack=setup.unitStack,before=unitStack?.before,selected=unitStack?.selected,focused=unitStack?.focused,
      pan=unitStack?.pan;
    checks.push({name:'group saved and recalled through UI',
      pass:setup.ok===true&&setup.selected?.length>0&&setup.group?.length===setup.selected.length,evidence:setup},
    {name:'unit-stack selects its live type then focuses on second activation',pass:!!before?.ok&&
      before.snapshot?.cardCount>0&&JSON.stringify(selected?.actual)===JSON.stringify(selected?.expected)&&
      selected?.onlyType===true&&selected?.stableNode===true&&selected?.pressed==='true'&&
      selected?.selectedDataset===selected?.expected?.length&&selected?.snapshot?.lastAction?.type===before.type&&
      selected?.snapshot?.lastAction?.focus===false&&focused?.stableNode===true&&
      focused?.snapshot?.focusCount===before.snapshot?.focusCount+1&&focused?.snapshot?.lastFocusType===before.type&&
      focused?.snapshot?.lastAction?.focus===true&&focused?.camera?.error<=1&&before.platoonButtons===4&&
      focused?.platoonButtons===4&&JSON.stringify(focused?.group)===JSON.stringify(setup.group)&&pan?.pass===true,
      evidence:unitStack});
  }
  if(['abilities','abilities-utility','abilities-consumables'].includes(state))checks.push(
    {name:'Commander selection exposes the contextual Abilities deck',pass:abilitySetup.ok===true&&abilitySetup.deck==='abilities'&&
      abilitySetup.selected===1&&abilitySetup.slotCount>=4&&abilitySetup.slotSources.includes('abPrimary'),evidence:abilitySetup},
    {name:'hot-slot safely forwards to its one authoritative source control',pass:abilitySetup.forwarded===1&&abilitySetup.ownerId==='abPrimary',
      evidence:{forwarded:abilitySetup.forwarded,ownerId:abilitySetup.ownerId,slotLabel:abilitySetup.slotLabel}}
  );
  if(['abilities-utility','abilities-consumables'].includes(state))checks.push({name:'Utility opens selection-bound secondary actions',
    pass:abilitySetup.utilityVisible===true&&abilitySetup.utilityAriaHidden==='false'&&abilitySetup.utilityCount>0&&
      abilitySetup.utilitySources.every(Boolean),evidence:abilitySetup});
  if(state==='build')checks.push({name:'Build control opens the live catalogue',
    pass:Number.isInteger(setup.hero)&&setup.hero>=0,evidence:setup});
  if(state==='production')checks.push({name:'production structure controller opens a live factory',
    pass:setup.ok===true&&Number.isInteger(setup.index),evidence:setup});
  if(state==='structure-service')checks.push(
    {name:'Repair control toggles authoritative repair intent',pass:setup.repair?.pressed==='true'&&setup.repair?.active===true,
      evidence:setup.repair},
    {name:'Recycle control arms once without destroying the structure',pass:setup.recycle?.armed==='true'&&
      setup.recycle?.alive===true&&/CONFIRM\s+RECYCLE/i.test(setup.recycle?.text||''),evidence:setup.recycle}
  );
  if(state==='placement')checks.push({name:'build card enters placement through live UI',pass:!!setup.placing,evidence:setup});
  if(state==='base-finder')checks.push({name:'Buildings deck owns one Base Finder and applies its real category action',
    pass:setup.deck==='buildings'&&setup.panelCount===1&&setup.buildingsTabs===1&&setup.selectedTabs===1&&
      setup.filter==='economy',evidence:setup});
  if(state==='unit-intel')checks.push({name:'selected-unit About control opens one pinned live intel card',
    pass:setup.ok===true&&setup.selected===1&&setup.infoControlCount===1&&setup.cardCount===1&&setup.pinned===true&&
      !!setup.title,evidence:setup});
  if(['consumables','abilities-consumables'].includes(state))checks.push({name:'consumable strip uses the canonical live renderer and art slot',
    pass:consumableSetup.ok===true&&consumableSetup.slotCount===1&&consumableSetup.names?.[0]===consumableSetup.name&&
      consumableSetup.artCount>=1,evidence:consumableSetup});
  if(state==='hazard-infestation')checks.push({name:'hazard and infestation status surfaces expose live authored state',
    pass:setup.ok===true&&!!setup.hazard&&setup.tier>=2&&setup.hazardCount===1&&setup.infestationCount===1&&
      !!setup.hazardText&&!!setup.infestationText,evidence:setup});
  if(state==='transmission-commander')checks.push({name:'commander cue reaches the minimap receiver',
    pass:setup.ok===true&&['enter','hold'].includes(setup.debug?.state)&&String(setup.debug?.who||'').toUpperCase()!=='KEEL',evidence:setup});
  if(state==='transmission-keel')checks.push({name:'UGA KEEL cue reaches the shared minimap receiver',pass:setup.handled===true&&
    setup.affiliation==='uga'&&setup.profileId==='uga-keel-expedition-guide'&&String(setup.debug?.who||'').toUpperCase()==='KEEL',evidence:setup});
  if(state==='event-feed')checks.push({name:'event feed opens with authored command and alert rows',pass:setup.ok===true&&setup.rows>=2,evidence:setup});
  return checks;
}

async function capture(page,outDir,config,state){
  const name=`${slug(config.key)}--${slug(state)}.png`,path=join(outDir,name);
  await page.screenshot({path,type:'png',animations:'disabled',scale:'device'});
  const info=await inspectPng(path),expectedWidth=Math.round(config.width*config.dpr),expectedHeight=Math.round(config.height*config.dpr);
  return {name,path:relative(root,path).split(sep).join('/'),width:info.width,height:info.height,bytes:info.bytes,
    sha256:info.sha256,expectedWidth,expectedHeight,dimensionsPass:Math.abs(info.width-expectedWidth)<=1&&Math.abs(info.height-expectedHeight)<=1};
}
function shouldCapture(options,config,state){
  if(options.screenshots==='none')return false;
  if(options.screenshots==='all')return true;
  return config.captureRepresentative&&CAPTURE_STATES.has(state);
}

async function installNetworkTracking(page,targetOrigin,labelRef,report){
  page.on('pageerror',error=>report.errors.push({label:labelRef.current,kind:'pageerror',message:String(error&&error.message||error)}));
  page.on('console',message=>{
    if(message.type()!=='error')return;const text=message.text();
    if(/ERR_BLOCKED_BY_CLIENT/.test(text))return;
    report.errors.push({label:labelRef.current,kind:'console.error',message:text.slice(0,700)});
  });
  page.on('response',response=>{
    if(response.status()>=400)report.httpFailures.push({label:labelRef.current,status:response.status(),url:response.url()});
  });
  page.on('requestfailed',request=>{
    const url=request.url(),failure=request.failure()?.errorText||'request failed';
    if(/ERR_BLOCKED_BY_CLIENT/.test(failure))return;
    report.requestFailures.push({label:labelRef.current,url,failure});
  });
  await page.route('**/*',async route=>{
    const raw=route.request().url();let url;
    try{url=new URL(raw);}catch{return route.abort('blockedbyclient');}
    if(['data:','blob:'].includes(url.protocol)||url.origin===targetOrigin)return route.continue();
    report.blockedExternal.push({label:labelRef.current,url:raw});await route.abort('blockedbyclient');
  });
}

const options=parseArgs(process.argv.slice(2));
if(options.help){help();process.exit(0);}
const full=fullMatrix(),quick=quickMatrix(),visual=visualMatrix(full),
  cases=options.mode==='quick'?quick:options.mode==='visual'?visual:full;
if(options.selfCheck){const result=matrixSelfCheck(full,visual,quick);console.log(JSON.stringify(result,null,2));
  process.exit(result.pass?0:1);}
const startedAt=new Date(),stamp=startedAt.toISOString().replace(/[:.]/g,'-');
const outDir=options.out?resolve(root,options.out):join(tmpRoot,'cinematic-hud',stamp);
if(!inside(tmpRoot,outDir))throw new Error('REFUSED_OUTPUT_OUTSIDE_TMP: '+outDir);
await mkdir(outDir,{recursive:true});

let guard=null,serverRow=null,browser=null,lateError=null;
const report={schema:'massfront.cinematic-hud-acceptance.v2',startedAt:startedAt.toISOString(),mode:options.mode,
  options:{...options,out:relative(root,outDir).split(sep).join('/')},contract:{fullStructuralCount:168,
    visualConfigCount:31,stateContractCount:16,portrait:64,landscape:72,tablet:16,desktop:16,
    selectedConfigCount:cases.length,dprValues:[1,1.25,1.5,2,3],mobileContexts:true,s25Viewport:S25_VIEWPORT,
    states:options.states,screenshotPolicy:options.screenshots,
    decisionModel:'Automated checks decide runtime/geometry PASS; captured art still requires recorded human visual review.'},
  testedUrl:null,identityBefore:null,identityAfter:null,toolSha256Before:null,
  toolSha256After:null,sourceStable:false,guard:null,groups:[],cases:[],checks:[],captures:[],errors:[],httpFailures:[],
  requestFailures:[],blockedExternal:[],limitations:[
    'Text scaling is stressed with a test-only root font-size override; Chromium has no portable OS accessibility-font-scale emulation.',
    'Mobile rows use Chromium mobile emulation, the canonical Android S25 user agent, touch input and the production mobile-renderer branch; this is not a claim of physical-device coverage.',
    'The visualViewport shrink probe changes both Chromium layout and visual viewport height because CDP cannot portably expose a keyboard-only visual viewport contraction.',
    'Safe-area env() is emulated through CDP when supported and always checked geometrically; unsupported CDP is reported per case.',
    'After real UI deployment, public game controllers select a deterministic existing factory/structure and seed one control group; player-facing buttons still perform Build, placement, Repair, Recycle arm, group recall, feed, and cue interactions.',
    'Service workers are blocked for deterministic HUD evidence; install/update/offline-cache behavior remains owned by the dedicated PWA/OTA verification suite.',
    'Ignored module-local tmp and Codex attachment trees are excluded from live write watching; the complete Git dirty fingerprint is still compared before and after every run.',
    'Automated image checks cover visible img elements. CSS background-image composition still requires human screenshot review.',
    'Passing geometry and console gates does not approve visual art direction; representative PNGs remain a required human visual gate.'
  ],summary:null};
if(options.url)report.limitations.push('A custom URL is bound to its fetched entry SHA across DPR groups, but its complete remote asset tree cannot be equated to the local www package fingerprint.');

try{
  guard=await acquireVerificationFreeze({root,label:`cinematic HUD ${options.mode} acceptance`,quietMs:options.quietMs,
    allowedPaths:[outDir,join(root,'modules','space_exploration','tmp'),
      join(root,'modules','space_exploration','.codex-remote-attachments')]});
  report.guard={branch:guard.branch,head:guard.head,quietMs:guard.quietMs,freezePath:guard.freezePath};
  report.identityBefore=await collectEvidenceIdentity({root,packageRoot:wwwRoot,testedEntry:'index.html'});
  report.toolSha256Before=await sha256File(toolPath);
  if(options.url)report.testedUrl=new URL(options.url).href;
  else{serverRow=await startServer();report.testedUrl=serverRow.url;}
  const targetOrigin=new URL(report.testedUrl).origin;
  browser=await launchPwBrowser({ownershipMode:'isolated',headless:!options.headed});
  const grouped=new Map();
  for(const config of cases){const uaKey=config.userAgent?digest(config.userAgent).slice(0,10):'default-ua',
    key=`${config.dpr}|${config.touch?'touch':'mouse'}|${config.mobile?'mobile':'desktop'}|${uaKey}`;
    if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(config);}
  for(const [groupKey,rows] of grouped){
    const first=rows[0],group={key:groupKey,dpr:first.dpr,touch:first.touch,mobile:first.mobile,
      userAgent:first.userAgent,route:null,gpu:null,cases:[],errorsBefore:report.errors.length};
    report.groups.push(group);
    const contextOptions={viewport:{width:first.width,height:first.height},deviceScaleFactor:first.dpr,
      hasTouch:first.touch,isMobile:first.mobile,colorScheme:'dark',serviceWorkers:'block',
      reducedMotion:first.motion==='reduced'?'reduce':'no-preference'};
    if(first.userAgent)contextOptions.userAgent=first.userAgent;
    const context=await browser.newContext(contextOptions);
    const page=await context.newPage(),labelRef={current:`${groupKey}:boot`};
    await installNetworkTracking(page,targetOrigin,labelRef,report);
    const cdp=await context.newCDPSession(page);
    try{
      const entryResponse=await page.goto(report.testedUrl,{waitUntil:'domcontentloaded',timeout:180000});
      if(!entryResponse)throw new Error('ENTRY_RESPONSE_MISSING: '+report.testedUrl);
      const entryBytes=await entryResponse.body();
      group.entry={url:entryResponse.url(),status:entryResponse.status(),sha256:digest(entryBytes),bytes:entryBytes.length};
      report.checks.push({case:groupKey,state:'boot',name:'entry document returned HTTP 200',
        pass:group.entry.status===200,evidence:group.entry});
      if(!options.url)report.checks.push({case:groupKey,state:'boot',name:'served entry matches packed www identity',
        pass:group.entry.sha256===report.identityBefore.testedEntrySha256,
        evidence:{served:group.entry.sha256,packed:report.identityBefore.testedEntrySha256}});
      group.gpu=await assertHardwareGpu(page);
      group.route=await enterRealOfflineBattle(page);
      for(const config of rows){
        const caseRow={config,environment:null,visualViewport:null,inboxPointer:null,states:[],rotation:null,errorsBefore:report.errors.length,
          httpFailuresBefore:report.httpFailures.length,requestFailuresBefore:report.requestFailures.length};
        report.cases.push(caseRow);group.cases.push(config.key);labelRef.current=config.key;
        caseRow.environment=await applyCaseEnvironment(page,cdp,config);
        report.checks.push({case:config.key,state:'environment',name:'safe-area env override applied',
          pass:caseRow.environment.safeAreaEmulated&&caseRow.environment.safeAreaMatches,evidence:caseRow.environment});
        report.checks.push({case:config.key,state:'environment',name:'visualViewport baseline matches the configured viewport',
          pass:caseRow.environment.visualViewportBaselinePass,evidence:caseRow.environment.device});
        const expectedMobileGpu=mobileGpuBranchExpected(config.userAgent||caseRow.environment.device.userAgent),
          device=caseRow.environment.device;
        report.checks.push({case:config.key,state:'environment',name:'browser context matches the requested device profile',
          pass:device.userAgent===(config.userAgent||device.userAgent)&&device.mobileGpu===expectedMobileGpu&&
            (!config.mobile||(isAndroidMobileUserAgent(device.userAgent)&&device.maxTouchPoints>0&&device.coarsePointer)),
          evidence:{profile:config.deviceProfile,mobile:config.mobile,touch:config.touch,configuredUserAgent:config.userAgent,
            actual:device,expectedMobileGpu}});
        if(config.deviceProfile==='s25-ultra-portrait'||config.deviceProfile==='s25-ultra-landscape'){
          const landscape=config.deviceProfile.endsWith('landscape'),expectedWidth=landscape?S25_VIEWPORT.height:S25_VIEWPORT.width,
            expectedHeight=landscape?S25_VIEWPORT.width:S25_VIEWPORT.height;
          report.checks.push({case:config.key,state:'environment',name:'canonical S25 Ultra device profile is exact',
            pass:device.userAgent===ANDROID_S25_USER_AGENT&&device.innerWidth===expectedWidth&&device.innerHeight===expectedHeight&&
              Math.abs(device.devicePixelRatio-S25_VIEWPORT.dpr)<=.01&&device.mobileGpu===true,
            evidence:{expected:{width:expectedWidth,height:expectedHeight,dpr:S25_VIEWPORT.dpr,userAgent:ANDROID_S25_USER_AGENT},actual:device}});
        }
        if(config.visualViewportProbe){caseRow.visualViewport=await visualViewportProbe(page,cdp,config);
          report.checks.push({case:config.key,state:'visual-viewport',name:'visualViewport shrinks and restores without losing the live match',
            pass:caseRow.visualViewport.pass,evidence:caseRow.visualViewport});}
        caseRow.inboxPointer=await inboxPointerProbe(page);
        report.checks.push({case:config.key,state:'environment',name:'Inbox opens and closes over a retained live match',
          pass:caseRow.inboxPointer.pass,evidence:caseRow.inboxPointer});
        for(const state of options.states){
          labelRef.current=`${config.key}:${state}`;const stateRow={state,setup:null,measure:null,clickThrough:null,
            assertions:[],capture:null,error:null};caseRow.states.push(stateRow);
          try{
            stateRow.setup=await prepareState(page,state);await page.waitForTimeout(180);
            for(const assertion of setupAssertions(state,stateRow.setup)){
              stateRow.assertions.push(assertion);report.checks.push({case:config.key,state,...assertion});
            }
            stateRow.measure=await measureState(page,config,state);
            if(shouldCapture(options,config,state)){
              stateRow.capture=await capture(page,outDir,config,state);report.captures.push(stateRow.capture);
              report.checks.push({case:config.key,state,name:'screenshot dimensions match DPR',
                pass:stateRow.capture.dimensionsPass,evidence:stateRow.capture});
            }
            stateRow.clickThrough=await clickThroughProbe(page,state,EXPECTED_SURFACE[state]);
            const measuredAssertions=stateAssertions(config,state,stateRow.measure,stateRow.clickThrough);
            stateRow.assertions.push(...measuredAssertions);
            for(const assertion of measuredAssertions)report.checks.push({case:config.key,state,...assertion});
          }catch(error){
            stateRow.error=errorText(error);report.errors.push({label:labelRef.current,kind:'state-setup-or-measure',message:stateRow.error});
            report.checks.push({case:config.key,state,name:'state setup and measurement',pass:false,evidence:stateRow.error});
          }
        }
        labelRef.current=`${config.key}:rotation`;
        try{caseRow.rotation=await rotationProbe(page,cdp,config);report.checks.push({case:config.key,state:'rotation',
          name:config.rotationSuite?'rotation preserves state and live panel geometry':'rotation preserves selection/group/deck state',
          pass:caseRow.rotation.pass,evidence:caseRow.rotation});}
        catch(error){caseRow.rotation={pass:false,error:errorText(error)};report.checks.push({case:config.key,state:'rotation',
          name:'rotation preserves selection/group/deck state',pass:false,evidence:caseRow.rotation});}
        caseRow.runtimeErrors=report.errors.slice(caseRow.errorsBefore);
        caseRow.httpFailures=report.httpFailures.slice(caseRow.httpFailuresBefore);
        caseRow.requestFailures=report.requestFailures.slice(caseRow.requestFailuresBefore);
        report.checks.push({case:config.key,state:'case',name:'no runtime errors',pass:caseRow.runtimeErrors.length===0,evidence:caseRow.runtimeErrors});
        report.checks.push({case:config.key,state:'case',name:'no HTTP 4xx/5xx',pass:caseRow.httpFailures.length===0,evidence:caseRow.httpFailures});
        report.checks.push({case:config.key,state:'case',name:'no request failures',pass:caseRow.requestFailures.length===0,evidence:caseRow.requestFailures});
        await guard.checkpoint('HUD case '+config.key);
      }
      await guard.checkpoint('DPR group '+groupKey);
    }finally{await context.close().catch(()=>{});}
  }
  await closePwBrowser(browser);browser=null;
  if(serverRow){await new Promise(resolveClose=>serverRow.server.close(resolveClose));serverRow=null;}
  await guard.checkpoint('browser and server complete');
  report.identityAfter=await collectEvidenceIdentity({root,packageRoot:wwwRoot,testedEntry:'index.html'});
  report.toolSha256After=await sha256File(toolPath);
  report.sourceStable=sameIdentity(report.identityBefore,report.identityAfter)&&report.toolSha256Before===report.toolSha256After;
  report.checks.push({case:'global',state:'identity',name:'source/package/tool identity stable',pass:report.sourceStable,
    evidence:{before:report.identityBefore,after:report.identityAfter,toolBefore:report.toolSha256Before,toolAfter:report.toolSha256After}});
  const entryHashes=[...new Set(report.groups.map(group=>group.entry?.sha256).filter(Boolean))];
  report.checks.push({case:'global',state:'network',name:'entry identity stable across DPR groups',
    pass:entryHashes.length===1,evidence:{entryHashes,groups:report.groups.map(group=>({key:group.key,entry:group.entry}))}});
  report.checks.push({case:'global',state:'network',name:'no runtime errors across boot and HUD states',
    pass:report.errors.length===0,evidence:report.errors});
  report.checks.push({case:'global',state:'network',name:'no HTTP 4xx/5xx across boot and HUD states',
    pass:report.httpFailures.length===0,evidence:report.httpFailures});
  report.checks.push({case:'global',state:'network',name:'no request failures across boot and HUD states',
    pass:report.requestFailures.length===0,evidence:report.requestFailures});
  const pass=report.checks.filter(c=>c.pass).length,fail=report.checks.length-pass;
  const manualVisualReviewRequired=report.captures.length>0,automatedOutcome=fail===0?'PASS':'FAIL';
  report.summary={configs:report.cases.length,expectedConfigs:options.mode==='full'?168:cases.length,
    states:report.cases.reduce((n,c)=>n+c.states.length,0),checks:report.checks.length,pass,fail,
    captures:report.captures.length,runtimeErrors:report.errors.length,httpFailures:report.httpFailures.length,
    requestFailures:report.requestFailures.length,blockedExternal:report.blockedExternal.length,
    safeAreaCdpUnsupported:report.cases.filter(c=>!c.environment?.safeAreaEmulated).length,
    automatedOutcome,outcome:fail===0?(manualVisualReviewRequired?'AUTOMATED_PASS_VISUAL_REVIEW_REQUIRED':'PASS'):'FAIL',
    manualVisualReviewRequired};
  await writeJsonAtomic(join(outDir,'report.json'),report);
  await guard.checkpoint('evidence written');
  process.exitCode=fail?1:0;
}catch(error){
  lateError=error;report.errors.push({label:'global',kind:'harness',message:errorText(error)});
}finally{
  if(browser)await closePwBrowser(browser).catch(error=>{lateError??=error;});
  if(serverRow)await new Promise(resolveClose=>serverRow.server.close(resolveClose));
  if(guard)try{await guard.release({assertStable:true,name:'cinematic HUD final release'});}catch(error){lateError??=error;}
  if(lateError){
    const existing=report.summary||{};report.sourceStable=false;
    report.summary={...existing,configs:report.cases.length,checks:report.checks.length,
      pass:report.checks.filter(c=>c.pass).length,fail:report.checks.filter(c=>!c.pass).length+1,
      outcome:'HARNESS_ERROR',lateError:errorText(lateError),manualVisualReviewRequired:true};
    await writeJsonAtomic(join(outDir,'report.json'),report).catch(()=>{});
  }
}
if(lateError)throw lateError;
console.log(JSON.stringify({mode:options.mode,url:report.testedUrl,output:relative(root,outDir).split(sep).join('/'),
  report:relative(root,join(outDir,'report.json')).split(sep).join('/'),summary:report.summary},null,2));
