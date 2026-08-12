/* Mobile regression for generated unit/structure purpose cards.
   Usage: node tools/test-intel-cards.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const outDir=join(root,'releases','intel-cards');
const unitShot=join(outDir,'unit-purpose-card-mobile.png');
const bldShot=join(outDir,'structure-purpose-card-mobile.png');
const catalogShot=join(outDir,'production-purpose-cards-mobile.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(outDir,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  await context.addInitScript(()=>{try{localStorage.clear();}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof intelUnitPurpose==='function'&&typeof showBuildingTypeCard==='function'&&typeof renderBuildMenu==='function',null,{timeout:60000});
  await page.waitForTimeout(600);

  const coverage=await page.evaluate(()=>({
    units:TYPES.map((T,i)=>({i,n:T.name,p:intelUnitPurpose(T),m:intelUnitMini(T)})),
    buildings:Object.keys(BT).map(k=>({k,n:BT[k].name,p:intelBldPurpose(k),m:intelBldMini(k)}))
  }));
  assert(coverage.units.length>=31,'unit roster unexpectedly incomplete');
  assert(coverage.units.every(x=>x.p&&x.m),'a unit is missing generated purpose metadata');
  assert(coverage.buildings.length>=25&&coverage.buildings.every(x=>x.p&&x.m),'a structure is missing generated purpose metadata');

  await page.evaluate(()=>{
    stopAttract();
    document.querySelectorAll('.overlay').forEach(el=>el.style.display='none');
    document.body.classList.remove('menuMode');
    running=true; paused=true; demoMode=true;
    unitHigh=Math.max(unitHigh,1);
    ualive[0]=1; uteam[0]=0; utype[0]=1; usel[0]=1; ustate[0]=0; uhold[0]=0;
    uhp[0]=TYPES[1].hp; uhpm[0]=TYPES[1].hp; uvet[0]=1;
    updateSelInfo();
  });
  const card=page.locator('#unitCard');
  assert(await card.isVisible(),'selecting a new chassis did not reveal its purpose card');
  /* Pin immediately through the real affordance. Live WebGL preview creation
     can take several seconds on SwiftShader; waiting until after every content
     assertion let the intentionally temporary 6.5s coach card expire and made
     its perfectly valid close button appear to have no bounding box. */
  const info=page.locator('#selInfo .selIntelBtn');
  await info.dispatchEvent('pointerdown');
  assert(await card.evaluate(el=>el.classList.contains('pinned')),'selection info target did not pin/reopen the card');
  const unitText=await card.textContent();
  assert(/RHINO/i.test(unitText)&&/WEAPON VS/i.test(unitText)&&/YOUR ARMOR FEARS/i.test(unitText),
    'unit card lacks live matchup information: '+unitText);
  const matchup=await card.evaluate(el=>({rows:el.querySelectorAll('.ucMatchRow').length,
    chips:el.querySelectorAll('.ucMatchChip').length,text:el.textContent}));
  assert(matchup.rows===2&&matchup.chips===6&&/1\.55×/.test(matchup.text)&&/0\.55×/.test(matchup.text),
    'unit matchup grid does not expose real combat multipliers: '+JSON.stringify(matchup));
  const close=page.locator('#unitCard .ucClose');
  for(const [name,el] of [['selection info',info],['card close',close]]){
    const box=await el.boundingBox();
    assert(box&&box.width>=44&&box.height>=44,name+' tap target is smaller than 44px');
  }
  const unitBox=await card.boundingBox();
  assert(unitBox&&unitBox.x>=0&&unitBox.x+unitBox.width<=393,'unit card overflows the phone viewport');
  await page.screenshot({path:unitShot,fullPage:false});

  const buildState=await page.evaluate(()=>{
    document.querySelector('#unitCard').style.display='none';
    renderBuildMenu();
    document.querySelector('#buildMenu').style.display='block';
    return {cards:document.querySelectorAll('#buildGrid .bcard').length,
      intel:document.querySelectorAll('#buildGrid .cardIntel').length,placing:!!placing};
  });
  assert(buildState.cards>0&&buildState.cards===buildState.intel,'build cards do not all have dedicated info targets');
  const buildInfo=page.locator('#buildGrid .cardIntel').first();
  const buildTap=await buildInfo.boundingBox();
  assert(buildTap&&buildTap.width>=44&&buildTap.height>=44,'build-card info target is smaller than 44px');
  await buildInfo.dispatchEvent('pointerdown');
  assert(!(await page.evaluate(()=>!!placing)),'structure info tap accidentally started placement');

  const prod=await page.evaluate(()=>{
    document.querySelector('#buildMenu').style.display='none';
    blds.push({alive:true,team:0,type:'fac',tier:2,queue:[],repeat:false,adj:0,rally:null});
    openBld=blds.length-1; prodTab='inf'; renderProdMenu();
    document.querySelector('#prodMenu').style.display='block';
    return {open:openBld,cards:document.querySelectorAll('#prodGrid .bcard').length,
      intel:document.querySelectorAll('#prodGrid .cardIntel').length};
  });
  assert(prod.cards>0&&prod.cards===prod.intel,'production cards do not all have dedicated info targets');
  await page.evaluate(()=>document.querySelector('#unitCard').style.display='none');
  await page.screenshot({path:catalogShot,fullPage:false});
  const prodInfo=page.locator('#prodGrid .cardIntel').first();
  await prodInfo.dispatchEvent('pointerdown');
  assert(await page.evaluate(i=>blds[i].queue.length===0,prod.open),'unit info tap accidentally queued a unit');

  await page.evaluate(()=>{
    running=false;
    document.querySelectorAll('.overlay').forEach(el=>el.style.display='none');
    document.querySelector('#prodMenu').style.display='none';
    showBuildingTypeCard('bastion',-1,true);
  });
  const bldText=await card.textContent();
  assert(/CONCUSSION MORTAR/i.test(bldText)&&/MIN/i.test(bldText)&&/STRUCTURE FEARS/i.test(bldText),
    'structure card lacks role/range information: '+bldText);
  await page.screenshot({path:bldShot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,units:coverage.units.length,buildings:coverage.buildings.length,
    tapTargets:'44px',screenshots:[unitShot,bldShot,catalogShot]},null,2));
}finally{await browser.close();}
