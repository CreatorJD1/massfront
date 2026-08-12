/* Focused phone-HUD geometry and icon regression. Runs without booting a match
   so layout regressions stay measurable in seconds rather than terrain time. */
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const css=await readFile(join(root,'src','styles','ui.css'),'utf8');
const out=join(root,'releases','hud-safe-rows');
const shot=join(out,'top-hud-safe-rows-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>
:root{--safe-area-inset-top:24px;--safe-area-inset-left:0px;--safe-area-inset-right:0px;--safe-area-inset-bottom:24px}
body::before{content:'';position:absolute;inset:0;background:
  radial-gradient(circle at 20% 36%,rgba(45,105,135,.35),transparent 22%),
  radial-gradient(circle at 82% 44%,rgba(78,45,105,.32),transparent 25%),
  linear-gradient(145deg,#172338,#080e19 55%,#111b2a)}
</style></head><body>
<div id="topbar">
  <div class="res"><div class="ic" id="massIc"></div><b id="massV">635</b><span class="rate">+9.0</span></div>
  <div class="res"><div class="ic" id="enIc"></div><b id="enV">3018</b><span class="rate">+45</span></div>
  <div class="res" id="unitRes"><div class="ic"></div><b id="unitV">2 / 50</b></div>
  <div id="godBadge">&#x221e; GOD</div><div id="fps">60 fps</div>
  <button id="spdBtn" aria-label="Game speed">1&times;</button><button id="menuBtn" aria-label="Pause">&#x23f8;</button>
</div>
<div id="goalBar" style="display:flex">&#x1f6a9; 5 VS 27 &mdash; REINFORCE <span class="clk">3:11</span></div>
<div id="wcRow" style="display:flex"><span class="wcChip">&#x1f30b;</span><span class="wcChip">&#x1f32a;</span><span class="wcChip">&#x26a1;</span><span class="wcChip">&#x2604;</span><span class="wcMult">+115%</span></div>
<div id="infMeter" style="display:flex">&#x1f41b; BROOD IV&nbsp; 132</div>
<div id="heroBar" style="display:block"><div class="nm">COMMANDER &#x25aa; LV 1</div><div id="xpOuter"><div id="xpFill" style="width:40%"></div></div><div id="heroHpOuter"><div id="heroHpFill"></div></div></div>
<div id="toast" style="opacity:1">RESOURCE SECURED</div>
<div id="radioAck" class="show"><i class="raPulse"></i><b class="raIcon">&#x2713;</b><div class="raCopy"><b>COMMAND</b><i>Orders confirmed</i></div></div>
<div id="unitCard" style="display:block"><div class="ucHead"><div class="ucRoleIcon">&#x25c8;</div><div><b>UNIT INTEL</b><small>Selected formation</small></div></div></div>
</body></html>`;

const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await page.setContent(html,{waitUntil:'load',timeout:30000});
  await page.waitForTimeout(150);

  const measure=()=>page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.right,b:r.bottom};};
    const icon=id=>{const e=document.querySelector(id),r=e.getBoundingClientRect(),a=getComputedStyle(e,'::after');
      return {w:r.width,h:r.height,clip:a.clipPath,bg:a.backgroundImage};};
    return {top:box('topbar'),goal:box('goalBar'),mods:box('wcRow'),threat:box('infMeter'),hero:box('heroBar'),
      toast:box('toast'),radio:box('radioAck'),card:box('unitCard'),
      speed:box('spdBtn'),pause:box('menuBtn'),mass:icon('#massIc'),energy:icon('#enIc'),units:icon('#unitRes .ic'),
      rate:getComputedStyle(document.querySelector('.rate')).display,vw:innerWidth};
  });
  const noOverlap=(a,b)=>a.r<=b.x||b.r<=a.x||a.b<=b.y||b.b<=a.y;
  const check=(m,label)=>{
    assert(m.top.b<=m.goal.y,label+' objective overlaps the resource/control row');
    assert(m.goal.b<=m.mods.y&&m.goal.b<=m.threat.y,label+' status row overlaps objective');
    assert(noOverlap(m.mods,m.threat),label+' modifier and threat panels overlap');
    assert(m.mods.b<=m.hero.y&&m.threat.b<=m.hero.y,label+' status row overlaps Commander bar');
    assert(m.hero.b<=m.toast.y,label+' toast overlaps the live HUD stack');
    assert(m.hero.b<=m.radio.y,label+' radio acknowledgement overlaps the live HUD stack');
    assert(m.hero.b<=m.card.y,label+' unit intel card overlaps the live HUD stack');
    assert(m.speed.w>=44&&m.speed.h>=44&&m.pause.w>=44&&m.pause.h>=44,label+' speed/pause target below 44px');
    for(const [name,r] of [['mass',m.mass],['energy',m.energy],['units',m.units]]){
      assert(r.w>=18&&r.h>=18,label+' '+name+' icon box too small');
      assert((r.clip&&r.clip!=='none')||(r.bg&&r.bg!=='none'),label+' '+name+' icon lacks a visible silhouette');
    }
    for(const r of [m.top,m.goal,m.mods,m.threat,m.hero])assert(r.x>=-0.5&&r.r<=m.vw+.5,label+' HUD panel escapes viewport');
  };

  const regular=await measure();check(regular,'393px');
  await page.evaluate(()=>{toast.style.display='none';radioAck.style.display='none';unitCard.style.display='none';});
  await page.screenshot({path:shot,clip:{x:0,y:0,width:393,height:230}});
  await page.evaluate(()=>{toast.style.display='block';radioAck.style.display='grid';unitCard.style.display='block';});
  await page.setViewportSize({width:360,height:780});await page.waitForTimeout(80);
  const narrow=await measure();check(narrow,'360px');
  assert(narrow.rate==='none','360px rates should yield space to values and controls');
  await page.setViewportSize({width:780,height:360});await page.waitForTimeout(80);
  const landscape=await page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {w:r.width,h:r.height};};
    return {speed:box('spdBtn'),pause:box('menuBtn')};
  });
  assert(landscape.speed.w>=44&&landscape.speed.h>=44&&landscape.pause.w>=44&&landscape.pause.h>=44,
    'landscape speed/pause target below 44px: '+JSON.stringify(landscape));
  console.log(JSON.stringify({ok:true,regular,narrow,landscape,screenshot:shot},null,2));
}finally{await browser.close();}
