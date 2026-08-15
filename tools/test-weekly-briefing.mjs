/* Focused mobile smoke test for the data-driven Weekly operation briefing.
   Usage: node tools/test-weekly-briefing.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','ui-stage5');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{ if(!ok) throw new Error(msg); };
await mkdir(out,{recursive:true});

const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#weeklyBox',{state:'attached',timeout:15000});
  await page.waitForFunction(()=>typeof renderOps==='function'&&typeof weeklyDef==='function'&&
    typeof weeklyRewardForecast==='function'&&typeof showFrontScreen==='function',null,{timeout:45000});
  const expected=await page.evaluate(()=>{
    META.threat=12; META.threatSel=3; timeLimit=600; difficulty=1;
    renderOps(); showFrontScreen('opsScr'); mfSetTabs(document.getElementById('opsScr'),'weekly',false);
    const d=weeklyDef(),a=facArt(d.fac),h=MAPHAZ[d.map],g=GOALS.find(x=>x.id===d.goal),f=weeklyRewardForecast(d,d.threat);
    return {map:d.map,mapNm:MAPDEFS[d.map].nm,fac:d.fac,commander:a.cdr,hazard:h.nm,
      goal:g.nm,threat:d.threat,mods:d.mods.length,min:f.min,max:f.max,mult:f.mult.toFixed(2)};
  });
  await page.waitForFunction(()=>{
    const i=document.querySelector('.wkCommanderPortrait'); return i&&i.complete&&i.naturalWidth>0;
  },null,{timeout:15000});
  await page.waitForTimeout(150);

  const actual=await page.evaluate(()=>{
    const card=document.querySelector('.wkBriefCard'),button=document.getElementById('weeklyGo'),
          panel=document.getElementById('opsPane-weekly'),r=button.getBoundingClientRect(),cr=card.getBoundingClientRect();
    return {map:card.dataset.map,fac:card.dataset.faction,text:card.textContent.replace(/\s+/g,' ').trim(),
      modifiers:card.querySelectorAll('.wkModChips span').length,actions:panel.querySelectorAll('button').length,
      button:{w:r.width,h:r.height},card:{w:cr.width,h:cr.height},portrait:document.querySelector('.wkCommanderPortrait').naturalWidth,
      plan:{state:opsBriefState.textContent,threat:opsBriefThreat.textContent,mods:opsBriefMods.textContent,payout:opsBriefPayout.textContent},
      visible:[...document.querySelectorAll('#opsScr [data-mf-panel]:not([hidden])')].map(p=>p.dataset.mfPanel)};
  });
  assert(actual.map===expected.map&&actual.fac===expected.fac,'briefing identity drifted from weeklyDef');
  for(const value of [expected.mapNm,expected.commander,expected.hazard,expected.goal,'≈ 10 MIN',
    '+'+expected.min+'–'+expected.max,'×'+expected.mult])
    assert(actual.text.includes(value),'briefing omitted current-data field: '+value+'\n'+actual.text);
  assert(actual.modifiers===expected.mods,'modifier chips do not match weekly definition');
  assert(actual.actions===1,'Weekly briefing must have one clear action, found '+actual.actions);
  assert(actual.button.h>=48&&actual.button.w>=280,'Start action is below mobile touch target: '+JSON.stringify(actual.button));
  assert(actual.card.w<=360&&actual.card.w>=320,'briefing card overflow/underfill: '+JSON.stringify(actual.card));
  assert(actual.portrait>0,'opposing commander portrait failed to load');
  assert(actual.plan.state==='WEEKLY'&&actual.plan.threat==='T'+expected.threat&&
    actual.plan.mods===String(expected.mods)&&actual.plan.payout==='×'+expected.mult,
    'persistent plan contradicts Weekly briefing: '+JSON.stringify(actual.plan));
  assert(JSON.stringify(actual.visible)===JSON.stringify(['weekly']),'Weekly is not the sole visible category');

  const png=join(out,'weekly-operation-briefing-mobile.png');
  await page.screenshot({path:png});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,expected,actual,screenshot:png},null,2));
}finally{
  await browser.close();
}
