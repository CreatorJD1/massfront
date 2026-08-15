/* Focused mobile regression for the playable Operations / Campaign Prologue.
   Usage: node tools/test-campaign-prologue.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','campaign-prologue');
const shot=join(out,'campaign-prologue-mobile.png');
const commanderShot=join(out,'commander-doctrine-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{
    localStorage.clear();
    localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof storyCampaignRender==='function'&&typeof window.__tutDebug==='function'&&
    typeof showFrontScreen==='function'&&typeof renderOps==='function',null,{timeout:60000});
  await page.waitForFunction(()=>document.body.classList.contains('mfIntroDone'),null,{timeout:60000});

  /* Make P-01 current without writing a test profile. This exercises the
     completed/current/locked ladder and the ordinary Battle Setup route. */
  await page.evaluate(()=>{
    META.tutorial=META.tutorial||{};META.tutorial.done=true;META.facWins={};
    renderOps();showFrontScreen('opsScr');mfSetTabs(document.getElementById('opsScr'),'campaign',false);
  });
  await page.waitForTimeout(350);
  await page.waitForFunction(()=>[...document.querySelectorAll('#opsPane-campaign img')].every(i=>i.complete&&i.naturalWidth>0));

  const ui=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
    const cards=[...document.querySelectorAll('.storyCampaignMission')];
    const action=document.querySelector('[data-campaign-mission="mosswatch-breach"]');
    return {
      tabs:[...document.querySelectorAll('#opsTabs .screenTabBtn')].map(b=>({key:b.dataset.mfTab,...box(b)})),
      visible:[...document.querySelectorAll('#opsScr [data-mf-panel]:not([hidden])')].map(p=>p.dataset.mfPanel),
      missions:cards.map(c=>c.className),action:box(action),
      hero:document.querySelector('.storyCampaignHero').textContent.replace(/\s+/g,' ').trim(),
      dossierLink:document.getElementById('opsArcsToDossier')?.textContent||'',
      back:box(document.getElementById('opsBack')),viewport:{w:innerWidth,h:innerHeight},
      training:typeof window.__tutDebug().startTraining==='function'
    };
  });
  assert(ui.tabs.length===2&&ui.tabs.some(t=>t.key==='campaign'),'Campaign/Weekly category pair is incomplete: '+JSON.stringify(ui.tabs));
  assert(ui.tabs.every(t=>t.h>=48&&t.w>=70),'Campaign category created an undersized tab: '+JSON.stringify(ui.tabs));
  assert(JSON.stringify(ui.visible)===JSON.stringify(['campaign']),'Campaign is not the only visible Operations panel');
  assert(ui.missions.length===5&&ui.missions[0].includes('complete')&&ui.missions[1].includes('current')&&
    ui.missions[2].includes('locked'),'mission ladder states are not derived from the career record');
  assert(ui.dossierLink.includes('FOUR FACTION ENDGAMES'),'campaign does not route deeper lore to the Dossier');
  assert(ui.hero.includes('PRE-ALPHA')&&ui.hero.includes('PLAYABLE PROLOGUE'),'PRE-ALPHA scope is not clear');
  assert(ui.action.h>=48&&ui.training,'Campaign actions are not real mobile routes');
  assert(ui.back.h>=48&&ui.back.b<=ui.viewport.h+1,'Operations Back control is clipped');

  await page.screenshot({path:shot,fullPage:false});
  await page.locator('[data-campaign-mission="mosswatch-breach"]').tap();
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('setupScr')).display!=='none');
  const route=await page.evaluate(()=>({map:curMap,theme:curTheme,faction:aiFactionSel,player:playerFaction,goal:goalSel,
    difficulty,defenseFocus,infestationOn,timeLimit,battlefieldPreset,playerStartZone,
    ai:aiSlots.map(A=>({...A})),tab:setupScr.dataset.tab,
    mapSelected:document.querySelector('.mapCard.sel .mNm')?.textContent,
    factionSelected:document.querySelector('#facRow .fbtn.on')?.dataset.f,
    commanderCards:document.querySelectorAll('#commanderRow .commanderCard').length,
    commander:playerCommanderDef().id,activeMission:storyCampaignActiveId}));
  assert(route.map==='aelos_north_small'&&route.theme==='verdant'&&route.faction==='horde'&&route.player==='nova'&&route.goal==='purge',
    'P-01 did not load its authored battle setup: '+JSON.stringify(route));
  assert(route.difficulty===0&&route.defenseFocus===1&&route.infestationOn&&route.timeLimit===720,
    'P-01 safety/defence rules are wrong: '+JSON.stringify(route));
  assert(route.battlefieldPreset==='compact'&&route.playerStartZone==='sw'&&route.ai.filter(A=>A.on).length===1&&
    route.ai[0].zone==='ne'&&route.tab==='map','P-01 deployment plan is not ready for review');
  assert(route.mapSelected==='Mosswatch Verge'&&route.factionSelected==='horde'&&route.commanderCards===3&&
    route.commander.startsWith('nova_')&&route.activeMission==='mosswatch-breach',
    'setup controls do not reflect the mission preset: '+JSON.stringify(route));
  await page.locator('.setupTabBtn[data-tab="forces"]').tap();
  await page.waitForFunction(()=>document.getElementById('setupScr').dataset.tab==='forces');
  const doctrine=await page.evaluate(()=>({
    factions:[...document.querySelectorAll('#pfacRow .fbtn')].map(b=>b.dataset.f),
    commanders:[...document.querySelectorAll('#commanderRow .commanderCard')].map(b=>{
      const r=b.getBoundingClientRect();return {id:b.dataset.commander,w:r.width,h:r.height,text:b.textContent.replace(/\s+/g,' ').trim()};
    }),
    broodSelectable:!!document.querySelector('#pfacRow [data-f="horde"]')
  }));
  assert(JSON.stringify(doctrine.factions)===JSON.stringify(['nova','legion','syndicate'])&&!doctrine.broodSelectable,
    'player faction gate must expose three material powers and keep Brood AI-only: '+JSON.stringify(doctrine));
  assert(doctrine.commanders.length===3&&doctrine.commanders.every(c=>c.h>=122&&c.text.includes('ACTIVE')),
    'commander doctrines are incomplete or undersized: '+JSON.stringify(doctrine));
  const mechanics=await page.evaluate(()=>{
    const out=[];
    const test=(fac,id,read)=>{
      playerFaction=fac;playerCommanderId=id;
      heroDmgMult=1;playerBuildMult=1;resRngMult=1;commanderHpMult=1;armyDmgMult=1;bldHpMult=1;
      bonusMass=0;bonusEnergy=0;abUnlock=[false,false,false,false,false];
      [26,20,30,70,45].forEach((n,i)=>AB_CD[i]=n);
      applyCommanderChoice();out.push({id,value:read(),ability:playerCommanderDef().ability,unlocked:abUnlock[playerCommanderDef().ability]});
    };
    test('nova','nova_kai',()=>heroDmgMult);
    test('nova','nova_holt',()=>playerBuildMult);
    test('nova','nova_vale',()=>resRngMult);
    test('legion','legion_vex',()=>commanderHpMult);
    test('legion','legion_korr',()=>armyDmgMult);
    test('legion','legion_dravik',()=>bldHpMult);
    test('syndicate','syndicate_renn',()=>bonusMass+bonusEnergy/100);
    test('syndicate','syndicate_nyx',()=>resRngMult);
    test('syndicate','syndicate_voss',()=>AB_CD[0]);
    playerFaction='nova';playerCommanderId='nova_kai';renderPlayerFacRow();
    return out;
  });
  assert(mechanics.length===9&&mechanics.every(x=>x.unlocked)&&
    mechanics.every(x=>Math.abs(x.value-1)>0.001),'commander selections did not apply real passives/actives: '+JSON.stringify(mechanics));
  await page.locator('#commanderRow').scrollIntoViewIfNeeded();
  await page.screenshot({path:commanderShot,fullPage:false});
  const art={};
  for(const fac of ['nova','legion','syndicate']){
    await page.evaluate(f=>{
      playerFaction=f;const R=COMMANDER_ROSTERS[f];playerCommanderId=R[0].id;renderPlayerFacRow();
    },fac);
    await page.waitForFunction(()=>[...document.querySelectorAll('#commanderRow img')].every(i=>i.complete&&i.naturalWidth===384));
    art[fac]=await page.evaluate(()=>[...document.querySelectorAll('#commanderRow img')].map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight})));
  }
  assert(Object.values(art).every(a=>a.length===3&&a.every(i=>i.src.includes('/commanders/')&&i.w===384&&i.h===384)),
    'generated commander art is missing or not integrated: '+JSON.stringify(art));
  const dispatch=await page.evaluate(()=>{
    playerFaction='nova';playerCommanderId='nova_holt';storyCampaignActiveId='mosswatch-breach';
    const d=storySpeakerVisual({from:'Terran Frontline Command',ttl:'Mosswatch field order'});
    playerCommanderId='nova_kai';renderPlayerFacRow();return d;
  });
  assert(dispatch.commander==='Major Rowan Holt'&&dispatch.src.endsWith('/commanders/nova_holt.jpg'),
    'campaign transmission did not follow the selected commander: '+JSON.stringify(dispatch));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,tabs:ui.tabs.length,missions:ui.missions.length,
    route,doctrine,mechanics,art,dispatch,screenshots:[shot,commanderShot]},null,2));
}finally{await browser.close();}
