import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8911/';
const out=resolve('releases','faction-doctrine-stage1-mobile.png');
await mkdir(resolve('releases'),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');localStorage.setItem('mf_auth_gate_v1','1');});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#mfIntroSkip').waitFor({state:'visible',timeout:30000});
  await page.locator('#mfIntroSkip').tap({timeout:5000});
  await page.waitForFunction(()=>document.body.classList.contains('mfIntroDone')&&typeof openPlanetarySetup==='function'&&
    typeof factionDoctrineRoster==='function'&&typeof facCanonicalId==='function',{timeout:40000});
  await page.evaluate(()=>openPlanetarySetup('standard'));
  await page.locator('.setupTabBtn[data-tab="forces"]').tap({timeout:10000});
  await page.waitForFunction(()=>document.getElementById('setupScr').dataset.tab==='forces'&&
    [...document.querySelectorAll('#commanderRow small')].every(e=>e.textContent.includes('SIGNATURE')),{timeout:10000});
  const state=await page.evaluate(()=>({
    playable:playableFactions(),canonical:['nova','legion','syndicate','horde'].map(f=>facCanonicalId(f)),
    commanders:Object.fromEntries(['nova','legion','syndicate'].map(f=>[f,COMMANDER_ROSTERS[f].map(c=>c.active&&c.active.id)])),
    novaCost:factionDoctrineUnitCost({cm:100,ce:200},0),
    dominionRoster:(playerFaction='legion',factionDoctrineRoster([3,6,11,16,23,24],'fac',0)),
    syndicateRoster:(playerFaction='syndicate',factionDoctrineRoster([3,6,11,16,23,24],'fac',0)),
    broodPlayer:!!document.querySelector('#pfacRow [data-f="horde"]'),
    signatureRows:[...document.querySelectorAll('#commanderRow small')].map(e=>e.textContent.replace(/\s+/g,' ').trim())
  }));
  if(JSON.stringify(state.playable)!==JSON.stringify(['nova','legion','syndicate']))throw new Error('Playable gate drifted '+JSON.stringify(state));
  if(state.broodPlayer||Object.values(state.commanders).flat().filter(Boolean).length!==9)throw new Error('Commander/Brood gate failed '+JSON.stringify(state));
  if(state.novaCost.m!==94||state.dominionRoster.join(',')!=='3,16'||state.syndicateRoster.join(',')!=='6,11,23,24')
    throw new Error('Faction doctrine runtime failed '+JSON.stringify(state));
  await page.evaluate(()=>{playerFaction='nova';playerCommanderId='nova_kai';renderPlayerFacRow();});
  await page.locator('#commanderRow').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  await page.screenshot({path:out,fullPage:false});
  if(errors.length)throw new Error('Page errors: '+errors.join(' | '));
  console.log(JSON.stringify({ok:true,state,screenshot:out},null,2));
}finally{await browser.close();}
