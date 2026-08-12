/* Focused account-progression settlement test.
   Usage: node tools/test-progression-rewards.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=join(root,'releases','progression');
const assert=(ok,msg)=>{ if(!ok) throw new Error(msg); };
const sum=o=>Object.values(o||{}).reduce((n,v)=>n+(Number(v)||0),0);
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{try{localStorage.setItem('mf_prealpha_cinematic_v2','reward-test-seen');}catch(e){}});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof metaGrant==='function'&&typeof developRecord==='function'&&
    typeof matchCommitted==='function'&&typeof endGame==='function',null,{timeout:45000});

  const result=await page.evaluate(()=>{
    /* The account request is irrelevant to deterministic local settlement and
       could race the storage snapshot on a linked developer profile. */
    if(typeof syncPush==='function') syncPush=()=>Promise.resolve();
    function run({win,seconds,mass=900,energy=4200,reclaimed=999,studies=2,lab=true}){
      Object.assign(META,{xp:0,cores:0,researchData:0,matches:0,wins:0,losses:0,kills:0,
        streak:0,bestStreak:0,playSec:0,built:0,lost:0,structs:0,bestKills:0,
        firstWinDay:rewardDayKey(),owned:{},res:{},mods:{},boosters:{},mats:{alloy:0,circuit:0,isotope:0,relic:0},
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
      committedLoss:run({win:false,seconds:120}),
      victory:run({win:true,seconds:120}),
      victoryNoReclaim:run({win:true,seconds:120,reclaimed:0})
    };
  });

  const q=result.quickLoss, l=result.committedLoss, v=result.victory, nr=result.victoryNoReclaim;
  assert(!q.committed,'zero-second loss was classified as committed');
  assert(q.reward.xp===0&&q.reward.cores===0&&q.reward.data===0,
    'zero-second loss minted persistent currency: '+JSON.stringify(q.reward));
  assert(sum(q.materials)===0&&sum(q.stored.mats)===0,
    'zero-second loss minted materials: '+JSON.stringify(q.materials));
  assert(sum(q.inventory.gear)===0&&sum(q.inventory.consumables)===0&&
    sum(q.stored.inventory.gear)===0&&sum(q.stored.inventory.consumables)===0,
    'zero-second loss minted inventory: '+JSON.stringify(q.inventory));

  assert(l.committed&&l.reward.data===9&&l.materials.alloy===6&&l.materials.circuit===2,
    'committed loss payout changed: '+JSON.stringify(l));
  assert(sum(l.inventory.consumables)===1&&sum(l.inventory.gear)===0,
    'committed loss did not bank exactly one consumable and no gear: '+JSON.stringify(l.inventory));
  assert(l.stored.researchData===l.reward.data&&JSON.stringify(l.stored.mats)===JSON.stringify(l.materials),
    'committed loss was not persisted: '+JSON.stringify(l.stored));

  assert(v.reward.xp>l.reward.xp&&v.reward.cores>l.reward.cores&&v.reward.data>l.reward.data&&
    sum(v.materials)>sum(l.materials)&&sum(v.inventory.gear)>sum(l.inventory.gear),
    'victory was not strictly more rewarding than a committed loss');
  assert(v.reward.data===13&&v.materials.alloy===17&&v.materials.circuit===6&&v.materials.isotope===2,
    'victory payout changed: '+JSON.stringify(v));
  assert(v.materials.alloy>nr.materials.alloy&&v.recovery.reclaimedAlloy>nr.recovery.reclaimedAlloy,
    '999 reclaimed mass did not increase alloy: '+JSON.stringify({withReclaim:v,withoutReclaim:nr}));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));

  /* Render one committed-loss debrief as visual proof that temporary field
     reserves and persistent Account Salvage are explained separately. */
  await page.evaluate(()=>{
    Object.assign(META,{xp:0,cores:0,researchData:0,matches:0,wins:0,losses:0,kills:0,
      owned:{},res:{},mods:{},boosters:{},mats:{alloy:0,circuit:0,isotope:0,relic:0},
      inventory:{gear:{},consumables:{},equipped:{weapon:'',armor:'',utility:''},ready:[]},
      threat:1,threatSel:1,opmods:{}});
    demoMode=false;difficulty=0;gameEnded=false;running=true;stats.t=120;stats.kills=[18,7,0];
    stats.built=[5,2];stats.nests=0;stats.reclaimed=999;resDone=2;resM[0]=900;resE[0]=4200;
    blds.length=0;blds.push({alive:true,team:0,type:'techlab',prog:1});
    endGame(false,'Command uplink destroyed');
  });
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

  console.log(JSON.stringify({ok:true,quickLoss:q,committedLoss:l,victory:v,
    reclaimComparison:{reclaimed999:v.materials.alloy,reclaimed0:nr.materials.alloy,
      recoveredAlloy999:v.recovery.reclaimedAlloy,recoveredAlloy0:nr.recovery.reclaimedAlloy},
    screenshots:[topShot,salvageShot]},null,2));
}finally{
  await browser.close();
}
