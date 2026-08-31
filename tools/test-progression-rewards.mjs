/* Focused account-progression settlement test.
   Usage: node tools/test-progression-rewards.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {createHash} from 'node:crypto';
import {mkdir,readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=join(root,'releases','progression');
const assert=(ok,msg)=>{ if(!ok) throw new Error(msg); };
const sum=o=>Object.values(o||{}).reduce((n,v)=>n+(Number(v)||0),0);
const sha256=data=>createHash('sha256').update(data).digest('hex');
const sourceFiles=['assets/data/manifest.json','src/game/meta.js','src/daily.js','src/tutorial.js',
  'src/economy-net.js','src/develop.js','tools/test-progression-rewards.mjs'];
async function sourceIdentity(){
  const files={},all=createHash('sha256');
  for(const rel of sourceFiles){
    const data=await readFile(join(root,...rel.split('/')));
    files[rel]=sha256(data);all.update(rel).update('\0').update(data);
  }
  return {sha256:all.digest('hex'),files};
}
async function freshArtifact(path,startedAt){
  const info=await stat(path),data=await readFile(path);
  assert(info.mtimeMs>=startedAt-1000,'artifact was not refreshed by this run: '+path);
  return {path,sha256:sha256(data),bytes:info.size,modifiedAt:info.mtime.toISOString()};
}
const startedAt=Date.now(),sourceBefore=await sourceIdentity();
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{try{
    localStorage.setItem('mf_prealpha_cinematic_v2','reward-test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
    localStorage.setItem('mf_ap_gate_closed','1');
    localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');
  }catch(e){}});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  const gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof metaGrant==='function'&&typeof developRecord==='function'&&
    typeof matchCommitted==='function'&&typeof endGame==='function'&&typeof stopAttract==='function'&&
    typeof hideFrontScreens==='function'&&typeof mfGalaxyReady!=='undefined'&&mfGalaxyReady===true&&
    typeof gl!=='undefined'&&gl&&typeof heightF!=='undefined'&&heightF&&
    typeof terrainTex!=='undefined'&&terrainTex,null,{timeout:120000});
  /* Main's functions exist before the later manifest files finish and before
     the menu terrain/material callbacks settle. Installing a synthetic match
     at that earlier point lets delayed setupAttract/resetWorld erase it. Match
     the established real-runtime probes: finish boot, dismiss both gates,
     stop the attract owner, then install one paused live-match state. */
  await page.waitForTimeout(800);
  await page.evaluate(()=>{
    try{ if(typeof apGateSatisfied==='function') apGateSatisfied(); }catch(e){}
    try{ if(typeof apClose==='function') apClose(); }catch(e){}
    document.body.classList.add('mfIntroDone');
    for(const id of ['mfBootCover','apOverlay','apConfirmOverlay','loadScr','mfIntroSkip','mfIntroReplay']){
      const el=document.getElementById(id);if(el)el.style.setProperty('display','none','important');
    }
    document.querySelectorAll('.mfTitleReveal').forEach(el=>el.style.setProperty('display','none','important'));
    stopAttract();hideFrontScreens();attractOn=false;
  });
  await page.waitForTimeout(400);
  await page.evaluate(()=>{
    stopAttract();attractOn=false;attractVisible=false;demoMode=false;matchLive=true;
    running=true;paused=true;gameEnded=false;
    if(typeof carrier!=='undefined'&&carrier){carrier.active=false;carrier.phase=2;}
    if(typeof FORT!=='undefined')FORT.length=0;
  });
  await page.waitForTimeout(250);
  const harnessState=await page.evaluate(()=>({attractOn,running,paused,matchLive,gameEnded,
    galaxyReady:mfGalaxyReady,terrainReady:!!(heightF&&terrainTex)}));
  assert(!harnessState.attractOn&&harnessState.running&&harnessState.paused&&harnessState.matchLive&&
    !harnessState.gameEnded&&harnessState.galaxyReady&&harnessState.terrainReady,
    'synthetic match did not survive boot settlement: '+JSON.stringify(harnessState));

  const result=await page.evaluate(()=>{
    /* The account request is irrelevant to deterministic local settlement and
       could race the storage snapshot on a linked developer profile. */
    if(typeof syncPush==='function') syncPush=()=>Promise.resolve();
    if(typeof metaObserveCoreGrants==='function') metaObserveCoreGrants(()=>{});
    function run({win,seconds,mass=900,energy=4200,reclaimed=999,studies=2,lab=true}){
      Object.assign(META,{xp:0,cores:0,researchData:0,matches:0,wins:0,losses:0,kills:0,
        streak:0,bestStreak:0,playSec:0,built:0,lost:0,structs:0,bestKills:0,
        firstWinDay:rewardDayKey(),owned:{},res:{},mods:{},boosts:{},
        daily:{day:0,prog:{},claimed:{},streak:0,lastDay:0},mats:{alloy:0,circuit:0,isotope:0,relic:0},
        inventory:{gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[]},
        threat:1,threatSel:1,opmods:{}});
      stats.t=seconds; stats.kills=[0,0,0]; stats.built=[0,0]; stats.nests=0; stats.reclaimed=reclaimed;
      difficulty=0; resDone=studies; resM[0]=mass; resE[0]=energy;
      blds.length=0; if(lab) blds.push({alive:true,team:0,type:'techlab',prog:1});
      if(typeof wcActive!=='undefined') wcActive.length=0;
      if(typeof WC!=='undefined') for(const k of Object.keys(WC)) delete WC[k];
      const reward=metaGrant(win);
      const development=developRecord({win,kills:0,built:0,nests:0,
        fieldMass:mass,fieldEnergy:energy,reclaimed});
      const stored=JSON.parse(localStorage.getItem(metaKey())||'{}');
      return {
        committed:matchCommitted(win),
        reward:{xp:reward.xp,cores:reward.cores,data:reward.data,loot:reward.loot},
        materials:{...META.mats},
        inventory:JSON.parse(JSON.stringify(META.inventory)),
        recovery:development.recovery,
        stored:{xp:stored.xp||0,cores:stored.cores||0,researchData:stored.researchData||0,
          mats:stored.mats||{},inventory:stored.inventory||{}}
      };
    }
    return {
      quickLoss:run({win:false,seconds:0,studies:0,lab:false}),
      boundaryLoss:run({win:false,seconds:179}),
      committedLoss:run({win:false,seconds:180}),
      victory:run({win:true,seconds:120}),
      victoryNoReclaim:run({win:true,seconds:120,reclaimed:0})
    };
  });

  const q=result.quickLoss, b=result.boundaryLoss, l=result.committedLoss, v=result.victory, nr=result.victoryNoReclaim;
  assert(!q.committed,'zero-second loss was classified as committed');
  assert(q.reward.xp===0&&q.reward.cores===0&&q.reward.data===0,
    'zero-second loss minted persistent currency: '+JSON.stringify(q.reward));
  assert(sum(q.materials)===0&&sum(q.stored.mats)===0,
    'zero-second loss minted materials: '+JSON.stringify(q.materials));
  assert(sum(q.inventory.gear)===0&&sum(q.inventory.consumables)===0&&
    sum(q.stored.inventory.gear)===0&&sum(q.stored.inventory.consumables)===0,
    'zero-second loss minted inventory: '+JSON.stringify(q.inventory));

  assert(!b.committed&&b.reward.xp===0&&b.reward.cores===0&&b.reward.data===0&&sum(b.materials)===0,
    '179-second loss crossed the 180-second commitment boundary: '+JSON.stringify(b));
  assert(l.committed&&l.reward.xp===27&&l.reward.cores===11&&l.reward.data===3&&
    l.materials.alloy===5&&l.materials.circuit===2,
    'committed loss payout changed: '+JSON.stringify(l));
  assert(sum(l.inventory.consumables)===1&&sum(l.inventory.gear)<=1,
    'committed loss did not bank one consumable and at most its authored 35% gear drop: '+JSON.stringify(l.inventory));
  assert(l.stored.researchData===l.reward.data&&JSON.stringify(l.stored.mats)===JSON.stringify(l.materials),
    'committed loss was not persisted: '+JSON.stringify(l.stored));

  assert(v.reward.xp>l.reward.xp&&v.reward.cores>l.reward.cores&&v.reward.data>l.reward.data&&
    sum(v.materials)>sum(l.materials)&&sum(v.inventory.gear)===1&&sum(l.inventory.gear)<=1,
    'victory was not strictly more rewarding than a committed loss');
  assert(v.reward.data===13&&v.materials.alloy===17&&v.materials.circuit===6&&v.materials.isotope===2,
    'victory payout changed: '+JSON.stringify(v));
  assert(v.materials.alloy>nr.materials.alloy&&v.recovery.reclaimedAlloy>nr.recovery.reclaimedAlloy,
    '999 reclaimed mass did not increase alloy: '+JSON.stringify({withReclaim:v,withoutReclaim:nr}));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));

  /* Render one committed-loss debrief as visual proof that temporary field
     reserves and persistent Account Salvage are explained separately. */
  await page.evaluate(()=>{
    stopAttract();hideFrontScreens();attractOn=false;attractVisible=false;
    demoMode=false;matchLive=true;running=true;paused=true;gameEnded=false;
    if(typeof carrier!=='undefined'&&carrier){carrier.active=false;carrier.phase=2;}
    Object.assign(META,{xp:0,cores:0,researchData:0,matches:0,wins:0,losses:0,kills:0,
      owned:{},res:{},mods:{},boosts:{},daily:{day:0,prog:{},claimed:{},streak:0,lastDay:0},
      mats:{alloy:0,circuit:0,isotope:0,relic:0},
      inventory:{gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[]},
      threat:1,threatSel:1,opmods:{}});
    difficulty=0;stats.t=180;stats.kills=[18,7,0];
    stats.built=[5,2];stats.nests=0;stats.reclaimed=999;resDone=2;resM[0]=900;resE[0]=4200;
    blds.length=0;blds.push({alive:true,team:0,type:'techlab',prog:1});
    endGame(false,'Command uplink destroyed');
  });
  await page.waitForTimeout(1800);
  assert(errors.length===0,'debrief page errors:\n'+errors.join('\n'));
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('gameOver')).display==='flex',null,{timeout:8000});
  const topShot=join(out,'mission-failed-rewards-mobile.png');
  await page.screenshot({path:topShot});
  await page.evaluate(()=>{const s=document.querySelector('.goResultScroll');if(s)s.scrollTop=s.scrollHeight;});
  await page.waitForTimeout(100);
  const salvageShot=join(out,'mission-failed-account-salvage-mobile.png');
  await page.screenshot({path:salvageShot});
  const debrief=await page.evaluate(()=>document.getElementById('goRewards').textContent.replace(/\s+/g,' ').trim());
  assert(debrief.includes('RESEARCH DATA')&&debrief.includes('ACCOUNT SALVAGE')&&debrief.includes('Persisted to Development inventory'),
    'debrief does not explain persistent progression: '+debrief);
  const screenshots=[await freshArtifact(topShot,startedAt),await freshArtifact(salvageShot,startedAt)];
  const sourceAfter=await sourceIdentity();
  assert(sourceAfter.sha256===sourceBefore.sha256,
    'source identity changed during progression verification: '+sourceBefore.sha256+' -> '+sourceAfter.sha256);

  console.log(JSON.stringify({ok:true,quickLoss:q,boundaryLoss:b,committedLoss:l,victory:v,
    reclaimComparison:{reclaimed999:v.materials.alloy,reclaimed0:nr.materials.alloy,
      recoveredAlloy999:v.recovery.reclaimedAlloy,recoveredAlloy0:nr.recovery.reclaimedAlloy},
    runtime:{url,viewport:{width:393,height:852},gpu,sourceIdentity:sourceBefore,capturedAt:new Date().toISOString()},
    screenshots},null,2));
}finally{
  await closePwBrowser(browser);
}
