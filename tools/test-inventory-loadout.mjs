/* Focused <=2-minute mobile regression for Account Armory -> Session Loadout. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const supplied=process.argv.find(a=>/^https?:\/\//.test(a));
const url=supplied||'http://127.0.0.1:8146/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','inventory-loadout');
const shot=join(out,'inventory-session-loadout-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
let server=null;await mkdir(out,{recursive:true});
if(!supplied){
  server=spawn('python',['-m','http.server','8146','--directory',root],{stdio:'ignore',windowsHide:true});
  for(let i=0;i<40;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
}
const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{if(!localStorage.getItem('mf_inv_test_init')){localStorage.clear();localStorage.setItem('mf_inv_test_init','1');}localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof renderArmory==='function'&&typeof armSessionLoadoutHTML==='function'&&
    typeof showFrontScreen==='function'&&typeof stopAttract==='function'&&typeof PROFILES!=='undefined'&&!!PROFILES.active,null,{timeout:60000});
  await page.evaluate(()=>{
    stopAttract();
    META.inventory={
      gear:{w_rangefinder:1,a_phaseweave:1,u_toolkit:1,w_voidlens:1},
      consumables:{c_supply:3,c_nanites:2,c_overdrive:1},
      equipped:{weapon:'w_rangefinder',armor:'',utility:'u_toolkit'},
      ready:['c_supply']
    };
    metaSave();armTab='inventory';armInvFilter='all';armInvSelectedKind='';armInvSelectedId='';
    renderArmory();showFrontScreen('armory');
  });
  await page.waitForTimeout(250);

  const initial=await page.evaluate(()=>({
    tabs:[...document.querySelectorAll('#armTabs .tabBtn')].map(x=>({key:x.dataset.k,text:x.textContent.trim(),h:x.getBoundingClientRect().height})),
    layers:[...document.querySelectorAll('.armInvLayerHead i')].map(x=>x.textContent.trim()),
    filters:[...document.querySelectorAll('.armInvFilter')].map(x=>({text:x.textContent.trim(),h:x.getBoundingClientRect().height})),
    preview:document.querySelector('.armInvPreview')?.textContent.replace(/\s+/g,' ').trim(),
    cards:document.querySelectorAll('.armVaultItem').length
  }));
  assert(initial.tabs.some(x=>x.key==='inventory')&&initial.tabs.some(x=>x.key==='loadout'),
    'Account Armory and Session Loadout are not separate layers: '+JSON.stringify(initial.tabs));
  assert(initial.layers.includes('ACCOUNT LAYER'),'Account storage layer is not identified');
  assert(initial.filters.length===5&&initial.filters.every(x=>x.h>=44),'item category targets are too small');
  assert(initial.cards===20&&initial.preview.includes('EXACT EFFECT'),'collection/effect preview is incomplete');

  await page.locator('[data-inv-id="a_phaseweave"]').tap();
  await page.locator('.armInvCommit').tap();
  assert(await page.evaluate(()=>invBag().equipped.armor)==='a_phaseweave','armor did not equip through preview action');

  await page.locator('#armTabs [data-k="loadout"]').tap();
  await page.locator('.armLoadSlot.supply.empty [data-pick-slot="supply"]').tap();
  assert(await page.evaluate(()=>armTab+':'+armInvFilter)==='inventory:supply','empty mission slot did not route to Account Armory supplies');
  await page.locator('[data-inv-id="c_nanites"]').tap();
  await page.locator('.armInvCommit').tap();
  assert((await page.evaluate(()=>invBag().ready.join(',')))==='c_supply,c_nanites','second mission supply did not occupy the open slot');
  await page.locator('#armTabs [data-k="loadout"]').tap();
  await page.waitForTimeout(250);

  const loaded=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
    const slots=[...document.querySelectorAll('.armLoadSlot')];
    const buttons=[...document.querySelectorAll('.armLoadSlot button')];
    return {
      layer:document.querySelector('.armInvLayerHead i')?.textContent.trim(),
      capacity:document.querySelector('.armInvCapacity')?.textContent.replace(/\s+/g,' ').trim(),
      slots:slots.length,filled:slots.filter(x=>x.classList.contains('filled')).length,
      supply:slots.filter(x=>x.classList.contains('supply')&&x.classList.contains('filled')).length,
      effects:document.querySelectorAll('.armMissionFx').length,
      buttons:buttons.map(box),all:[...document.querySelectorAll('#storeList>:not(.armTabWrap),.armLoadoutGrid,.armLoadSlot,.armMissionPackage,.armReturnVault')].map(box),
      bag:JSON.parse(JSON.stringify(invBag())),viewport:{w:innerWidth,h:innerHeight},back:box(document.getElementById('armoryBack'))
    };
  });
  assert(loaded.layer==='DEPLOYMENT LAYER'&&loaded.capacity.includes('5 / 5'),'five-slot loadout capacity is not explicit: '+JSON.stringify(loaded));
  assert(loaded.slots===5&&loaded.filled===5&&loaded.supply===2&&loaded.effects===5,'loadout slot/effect package mismatch: '+JSON.stringify(loaded));
  assert(loaded.buttons.every(b=>b.h>=44),'equip/unequip mission targets are too small: '+JSON.stringify(loaded.buttons));
  assert(loaded.all.every(b=>b.x>=-1&&b.right<=loaded.viewport.w+1),'inventory UI overflows the mobile viewport: '+JSON.stringify(loaded.all.filter(b=>b.x < -1||b.right>loaded.viewport.w+1).slice(0,12)));
  assert(loaded.back.h>=44&&loaded.back.bottom<=loaded.viewport.h+1,'Armory back control is clipped');
  await page.evaluate(()=>{const t=document.getElementById('toast');if(t)t.style.opacity=0;});
  await page.waitForTimeout(120);
  await page.screenshot({path:shot,fullPage:false});

  await page.locator('[data-remove-gear="a_phaseweave"]').tap();
  assert(await page.evaluate(()=>invBag().equipped.armor)==='','loadout did not unequip armor');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof invBag==='function'&&typeof renderArmory==='function'&&typeof PROFILES!=='undefined'&&!!PROFILES.active,null,{timeout:60000});
  const persisted=await page.evaluate(()=>{const raw=localStorage.getItem(metaKey());return {bag:JSON.parse(JSON.stringify(invBag())),raw:raw?JSON.parse(raw).inventory:null,keys:Object.keys(localStorage),key:metaKey()};});
  assert(persisted.bag.equipped.weapon==='w_rangefinder'&&persisted.bag.equipped.utility==='u_toolkit'&&persisted.bag.equipped.armor==='',
    'gear slots did not persist through reload: '+JSON.stringify(persisted));
  assert(persisted.bag.ready.join(',')==='c_supply,c_nanites'&&persisted.raw&&persisted.raw.gear&&persisted.raw.consumables&&persisted.raw.equipped,
    'legacy inventory fields were not preserved: '+JSON.stringify(persisted));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,initial:{tabs:initial.tabs.length,cards:initial.cards},loaded:{slots:loaded.slots,effects:loaded.effects,capacity:loaded.capacity},persisted:persisted.bag,screenshot:shot},null,2));
}finally{await browser.close();if(server)server.kill();}
