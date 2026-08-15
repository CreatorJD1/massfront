/* Focused mobile smoke test for the Operations category shell.
   Usage: node tools/test-operations-shell.mjs [local URL] */
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
  await context.addInitScript(()=>{try{localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#opsBriefPayout',{state:'attached',timeout:15000});
  await page.waitForFunction(()=>typeof renderOps==='function'&&typeof mfSetTabs==='function'&&
    typeof showFrontScreen==='function',null,{timeout:45000});
  await page.evaluate(()=>{
    META.xp=0; META.wins=0; META.matches=0; META.mastery={};
    META.tutorial={done:false,skipped:false,version:0};
    /* Selected T3 remains playable, while the T4-gated Early Titans card must
       still prove its locked state. Using threat=4 made that assertion
       internally contradictory because threat is the permanent unlock rung. */
    META.threat=3; META.threatSel=3; META.opmods={iron:1}; wcChoice=0;
    renderOps(); showFrontScreen('opsScr'); mfSetTabs(document.getElementById('opsScr'),'threat',false);
  });
  await page.waitForTimeout(200);

  const layout=await page.evaluate(()=>{
    const box=e=>{ const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}; };
    const tabs=[...document.querySelectorAll('#opsTabs .screenTabBtn')];
    const visible=[...document.querySelectorAll('#opsScr [data-mf-panel]')].filter(p=>!p.hidden);
    return {tabs:tabs.map(box),visible:visible.map(p=>p.dataset.mfPanel),brief:box(document.querySelector('.opsBrief')),
      scroll:box(document.querySelector('#opsScr>.opsScroll')),back:box(document.getElementById('opsBack')),
      briefText:document.querySelector('.opsBrief').textContent.replace(/\s+/g,' ').trim(),
      selected:tabs.filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.dataset.mfTab),
      viewport:{w:innerWidth,h:innerHeight}};
  });
  assert(layout.tabs.length===4,'expected Campaign, Threat, Weekly and Mastery Operations categories');
  assert(layout.tabs.every(r=>r.h>=48&&r.w>=70),'category touch target below 48x70: '+JSON.stringify(layout.tabs));
  assert(JSON.stringify(layout.visible)===JSON.stringify(['threat']),'Threat panel is not the only visible panel');
  assert(JSON.stringify(layout.selected)===JSON.stringify(['threat']),'tab ARIA selection is incorrect');
  assert(layout.brief.b<=layout.scroll.y+1,'deployment brief overlaps the scrolling category body');
  assert(layout.back.h>=48&&layout.back.b<=layout.viewport.h+1,'Back control is clipped or too small');
  assert(layout.briefText.includes('T3')&&layout.briefText.includes('1'),
    'combined plan is not reflected in the brief: '+layout.briefText);

  for(const key of ['weekly','mastery','threat']){
    await page.locator('#opsTab-'+key).tap();
    await page.waitForFunction(k=>{
      const p=document.querySelector('#opsScr [data-mf-panel="'+k+'"]');
      return p&&!p.hidden&&document.querySelectorAll('#opsScr [data-mf-panel]:not([hidden])').length===1;
    },key);
  }
  assert(await page.locator('#opsTab-modifiers').count()===0,'Modifiers remained a top-level Operations category');
  await page.evaluate(()=>{ renderOps(); showFrontScreen('setupScr'); });
  await page.locator('#setupTabs .setupTabBtn[data-tab="modifiers"]').tap();
  await page.waitForTimeout(150);
  const modifierLayout=await page.evaluate(()=>({
    tabs:[...document.querySelectorAll('#setupTabs .setupTabBtn')].map(b=>({key:b.dataset.tab,h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width})),
    visible:[...document.querySelectorAll('#setupScr [data-setup-tab]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.dataset.setupTab),
    locked:[...document.querySelectorAll('#opModRow .opMod.lock')].map(e=>e.dataset.id),
    active:[...document.querySelectorAll('#opModRow .opMod.on')].map(e=>e.dataset.id),
    payout:document.getElementById('opPayout').textContent.replace(/\s+/g,' ').trim()
  }));
  assert(modifierLayout.tabs.length===5&&modifierLayout.tabs.every(t=>t.h>=48&&t.w>=60),
    'Map Settings category touch targets are too small: '+JSON.stringify(modifierLayout.tabs));
  assert(modifierLayout.visible.length===2&&modifierLayout.visible.every(k=>k==='modifiers'),
    'Modifier submenu did not isolate its two cards: '+JSON.stringify(modifierLayout.visible));
  assert(modifierLayout.active.includes('iron'),'Recruit modifier was not active');
  assert(modifierLayout.locked.includes('fogb')&&modifierLayout.locked.includes('titan'),
    'progression-gated modifiers are not visibly locked: '+JSON.stringify(modifierLayout));

  const before=await page.evaluate(()=>Object.keys(META.opmods||{}).length);
  await page.locator('.opMod[data-id="fogb"]').dispatchEvent('pointerdown');
  const afterLockedTap=await page.evaluate(()=>Object.keys(META.opmods||{}).length);
  assert(afterLockedTap===before,'locked modifier activated from a tap');
  await page.evaluate(()=>{ META.xp=200; renderOps(); });
  await page.locator('.opMod[data-id="fogb"]').tap();
  const changed=await page.evaluate(()=>({mods:opsBriefMods.textContent,payout:opsBriefPayout.textContent,
    selected:Object.keys(META.opmods||{}).sort(),wc:wcChoice}));
  assert(changed.mods==='2'&&changed.selected.join(',')==='fogb,iron',
    'unlocked modifier did not update the deployment summary: '+JSON.stringify(changed));
  assert(changed.wc===0,'hand-picked modifier did not clear the random quick-pick');

  const png=join(out,'map-settings-modifiers-mobile.png');
  await page.screenshot({path:png});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,layout,changed,screenshot:png},null,2));
}finally{
  await browser.close();
}
