/* Mobile regression for canonical dialogue identities and live model windows.
   Usage: node tools/test-dialogue-intel-ui.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const out=join(root,'releases','dialogue-intel');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof showDispatch==='function'&&typeof mfIntelPreviewWindow==='function'&&
    typeof UNIT_GEO!=='undefined'&&!!UNIT_GEO[1],null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#menuIntelModel canvas')?._mfIntel3D?.parts?.length>0,null,{timeout:20000});
  await page.waitForTimeout(400);

  const menu=page.locator('#menuIntel');
  assert(await menu.isVisible(),'live model showcase is not visible on the main menu');
  const menuBox=await menu.boundingBox();
  assert(menuBox&&menuBox.width<=350&&menuBox.height<=82,'main-menu showcase is not compact: '+JSON.stringify(menuBox));
  const menuPixels=await page.evaluate(()=>{
    const c=document.querySelector('#menuIntelModel canvas'),V=c&&c._mfIntel3D;if(!V)return 0;
    V.draw(performance.now()+100);const g=V.gl,p=new Uint8Array(c.width*c.height*4);g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,p);
    let n=0;for(let i=3;i<p.length;i+=4)if(p[i]>8)n++;return n;
  });
  assert(menuPixels>250,'menu model window did not render mesh pixels: '+menuPixels);
  await page.screenshot({path:join(out,'menu-live-model.png')});

  const checkDispatch=async(match,expect)=>{
    const state=await page.evaluate(({match,expect})=>{
      const d=STORY.find(x=>(x.from+' '+x.ttl+' '+x.txt).includes(match));showDispatch(d);
      const b=document.querySelector('.dispBox');
      return {speaker:dispSpeakerName.textContent,faction:dispFaction.textContent,mode:b.dataset.mode,
        portrait:dispPortrait.getAttribute('src'),alt:dispPortrait.alt,protocol:dispProtocol.textContent,
        h:dispOk.getBoundingClientRect().height,source:dispFrom.textContent};
    },{match,expect});
    assert(state.speaker===expect.speaker,match+' canonical speaker mismatch: '+state.speaker);
    assert(state.faction===expect.faction,match+' faction mismatch: '+state.faction);
    if(expect.mode)assert(state.mode===expect.mode,match+' mode mismatch: '+state.mode);
    assert(state.portrait.includes(expect.portrait),match+' portrait mismatch: '+state.portrait);
    assert(state.alt.includes(expect.speaker),match+' portrait alt does not identify canonical commander');
    assert(state.h>=44,'acknowledge target is below 44px');
    return state;
  };

  await checkDispatch('EXPEDITIONARY ORDER',{speaker:'Captain Elara Kai',faction:'Terran Frontline Command',mode:'secure',portrait:'nova_192.jpg'});
  await page.waitForFunction(()=>dispPortrait.complete&&dispPortrait.naturalWidth>0);
  await page.locator('.dispBox').screenshot({path:join(out,'nova-secure-command.png')});
  await checkDispatch('FACTION PROFILE: RED ASCENDANCY',{speaker:'Lord Darion Vex',faction:'Crimson Dominion',mode:'intercepted',portrait:'ascendancy_192.jpg'});
  await checkDispatch('Vex, addressing',{speaker:'Lord Darion Vex',faction:'Crimson Dominion',mode:'open',portrait:'ascendancy_192.jpg'});
  await checkDispatch('Renn\'s answer',{speaker:'Broker Lys Renn',faction:'Syndicate Coalition',portrait:'syndicate_192.jpg'});
  await checkDispatch('SOURCE: THE BROOD SOVEREIGN',{speaker:'The Brood Sovereign',faction:'Brood Swarm',mode:'intercepted',portrait:'horde_192.jpg'});
  await page.waitForFunction(()=>dispPortrait.complete&&dispPortrait.naturalWidth>0);
  await page.locator('.dispBox').screenshot({path:join(out,'brood-degraded-intercept.png')});
  const survey=await checkDispatch('BIO-SURVEY · FIELD NOTE',{speaker:'Captain Elara Kai',faction:'Terran Frontline Command',mode:'field',portrait:'nova_192.jpg'});
  assert(survey.source.includes('BIO-SURVEY'),'authored service source was lost');
  await checkDispatch('URGENT BROADCAST',{speaker:'Lord Darion Vex',faction:'Crimson Dominion',mode:'urgent',portrait:'ascendancy_192.jpg'});
  const aliases=await page.evaluate(()=>[
    storySpeakerVisual({from:'MACHINE ASCENDANCY · RELAY'}),
    storySpeakerVisual({from:'TERRAN FRONTLINE COMMAND · ORDER'}),
    storySpeakerVisual({from:'INFESTATION SWARM · SIGNAL'})
  ].map(x=>[x.key,x.commander]));
  assert(JSON.stringify(aliases)===JSON.stringify([
    ['syndicate','Broker Lys Renn'],['nova','Captain Elara Kai'],['horde','The Brood Sovereign']
  ]),'canonical alias sets split into duplicate/wrong profiles: '+JSON.stringify(aliases));

  // Purpose cards must contain a rendered mesh viewport, not just prose/icons.
  await page.evaluate(()=>{
    for(const el of document.querySelectorAll('.overlay,#dispatch'))el.style.display='none';
    const u=document.querySelector('#unitCard');u.style.zIndex=220;showUnitTypeCard(1,true);
  });
  await page.waitForFunction(()=>document.querySelector('#unitCard canvas')?._mfIntel3D?.parts?.length>0,null,{timeout:12000});
  const unitPixels=await page.evaluate(()=>{
    const c=document.querySelector('#unitCard canvas'),V=c._mfIntel3D;V.draw(performance.now()+120);
    const p=new Uint8Array(c.width*c.height*4);V.gl.readPixels(0,0,c.width,c.height,V.gl.RGBA,V.gl.UNSIGNED_BYTE,p);
    let n=0;for(let i=3;i<p.length;i+=4)if(p[i]>8)n++;return n;
  });
  assert(unitPixels>400,'unit purpose-card model viewport is blank: '+unitPixels);
  assert(await page.locator('#unitCard .ucClose').evaluate(e=>e.getBoundingClientRect().height)>=44,'unit card close target below 44px');
  await page.screenshot({path:join(out,'rhino-purpose-live-model.png')});

  await page.evaluate(()=>showBuildingTypeCard('turret',-1,true));
  await page.waitForFunction(()=>document.querySelector('#unitCard canvas')?._mfIntel3D?.kind==='building',null,{timeout:12000});
  const buildingParts=await page.evaluate(()=>document.querySelector('#unitCard canvas')._mfIntel3D.parts.length);
  assert(buildingParts>=2,'Sentinel preview omitted its separate turret assembly');
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,canonicalCommanders:4,transmissionModes:['secure','open','field','intercepted','urgent'],
    menuPixels,unitPixels,sentinelParts:buildingParts,screenshots:out},null,2));
}finally{await browser.close();}
