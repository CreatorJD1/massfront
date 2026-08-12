/* Focused <=2-minute regression for the 5x2 Map Settings modifier art atlas. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const supplied=process.argv.find(a=>/^https?:\/\//.test(a));
const url=supplied||'http://127.0.0.1:8149/';
const out=join(root,'releases','modifier-art');
const shot=join(out,'map-settings-modifier-art-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(v,m)=>{if(!v)throw new Error(m);};
let server=null;await mkdir(out,{recursive:true});
if(!supplied){
  server=spawn('python',['-m','http.server','8149','--directory',root],{stdio:'ignore',windowsHide:true});
  for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
}
const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'});
  await context.addInitScript(()=>{try{localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof renderOps==='function'&&typeof showFrontScreen==='function'&&typeof OPMODS!=='undefined',null,{timeout:60000});
  await page.evaluate(()=>{
    META.xp=100000;META.wins=5;META.matches=4;META.mastery={};META.tutorial={done:true,skipped:false,version:2};
    META.threat=3;META.threatSel=3;META.opmods={iron:1,swarm:1};wcChoice=0;
    renderOps();showFrontScreen('setupScr');
  });
  await page.locator('#setupTabs .setupTabBtn[data-tab="modifiers"]').tap();
  await page.waitForFunction(()=>document.querySelectorAll('#opModRow .opModArt').length===10);
  await page.waitForFunction(()=>new Promise(resolve=>{
    const i=new Image();i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);
    i.src='./assets/modifiers/modifier-art-atlas-v1.png';
  }));
  const result=await page.evaluate(async()=>{
    const atlas=await new Promise(resolve=>{const i=new Image();i.onload=()=>resolve({w:i.naturalWidth,h:i.naturalHeight});i.src='./assets/modifiers/modifier-art-atlas-v1.png';});
    const cards=[...document.querySelectorAll('#opModRow .opMod')];
    const box=e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height};};
    return {atlas,cards:cards.map(c=>({id:c.dataset.id,name:c.querySelector('.opTx b').textContent,
      description:c.querySelector('.opTx span').textContent,locked:c.classList.contains('lock'),active:c.classList.contains('on'),box:box(c),
      image:getComputedStyle(c.querySelector('.opModArt')).backgroundImage,
      position:getComputedStyle(c.querySelector('.opModArt')).backgroundPosition})),
      ids:OPMODS.map(x=>x.id),names:OPMODS.map(x=>x.nm),descriptions:OPMODS.map(x=>x.ds),
      visible:[...document.querySelectorAll('#setupScr [data-setup-tab]')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.dataset.setupTab)};
  });
  assert(result.atlas.w===1983&&result.atlas.h===793&&Math.abs(result.atlas.w/result.atlas.h-2.5)<.01,
    'atlas dimensions/ratio changed: '+JSON.stringify(result.atlas));
  assert(result.cards.length===10&&result.cards.map(x=>x.id).join(',')===result.ids.join(','),'modifier card order no longer matches atlas order');
  assert(result.cards.map(x=>x.name).join('|')===result.names.join('|')&&result.cards.map(x=>x.description).join('|')===result.descriptions.join('|'),
    'modifier descriptions or names changed during art integration');
  const positions=['0% 0%','25% 0%','50% 0%','75% 0%','100% 0%','0% 100%','25% 100%','50% 100%','75% 100%','100% 100%'];
  assert(result.cards.every((x,i)=>x.image.includes('modifier-art-atlas-v1.png')&&x.position===positions[i]),
    'CSS sprite positions are not exact row-major cells: '+JSON.stringify(result.cards.map(x=>x.position)));
  assert(result.cards.every(x=>x.box.h>=96&&x.box.w>=300),'modifier card touch target below 48px: '+JSON.stringify(result.cards.map(x=>x.box)));
  assert(result.cards.find(x=>x.id==='iron').active&&result.cards.find(x=>x.id==='swarm').active,'active modifier styling was lost');
  assert(result.cards.find(x=>x.id==='titan').locked&&result.cards.find(x=>x.id==='nofab').locked,'progression locks were lost');
  assert(result.visible.length===2&&result.visible.every(x=>x==='modifiers'),'Map Settings modifier panel isolation changed');
  const scroll=page.locator('#setupScr .setupScroll');
  await scroll.evaluate(e=>{e.scrollTop=Math.max(0,document.getElementById('opModRow').offsetTop-8);});
  await page.waitForTimeout(200);
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,...result,screenshot:shot},null,2));
}finally{await browser.close();if(server)server.kill();}
