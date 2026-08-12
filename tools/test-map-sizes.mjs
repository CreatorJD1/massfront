/* Compact / Standard / Large setup and world-scaling regression.
   Usage: node tools/test-map-sizes.mjs [local URL] */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=join(root,'releases','map-sizes');
const shot=join(out,'map-size-selector-mobile.png');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
await mkdir(out,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:2,hasTouch:true,isMobile:true,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof battlefieldPresetDef==='function'&&typeof battlefieldPlayBounds==='function'&&
    typeof setupDeposits==='function'&&typeof renderSpawnPlanner==='function'&&typeof mfGalaxySetStage==='function',null,{timeout:60000});

  const metrics=await page.evaluate(()=>{
    playerStartZone='sw';
    aiSlots=[{on:true,diff:1,zone:'ne'},{on:false,diff:1,zone:'nw'},{on:false,diff:1,zone:'se'}];
    const out={};
    for(const key of ['compact','standard','large']){
      battlefieldPreset=key;setupDeposits();
      const S=skirmishSpawnPoints(),B=battlefieldPlayBounds(0),P=battlefieldPresetDef();
      out[key]={nm:P.nm,km:P.km,dur:P.dur,
        separation:Math.round(Math.sqrt(dist2(S[0].x,S[0].y,S[1].x,S[1].y))),
        deposits:deposits.length,geysers:geysers.length,bounds:[Math.round(B.lo),Math.round(B.hi)],
        inside:deposits.concat(geysers).every(N=>N.x>=B.lo&&N.x<=B.hi&&N.y>=B.lo&&N.y<=B.hi),
        fair:S.every(A=>deposits.filter(D=>D.starter===A.zone).length===3&&
                        geysers.filter(G=>G.starter===A.zone).length===1)};
    }
    return out;
  });
  assert(metrics.compact.separation<metrics.standard.separation&&metrics.standard.separation<metrics.large.separation,
    'spawn separation is not ordered: '+JSON.stringify(metrics));
  assert(metrics.compact.deposits<metrics.standard.deposits&&metrics.standard.deposits<metrics.large.deposits,
    'resource density is not ordered: '+JSON.stringify(metrics));
  assert(metrics.compact.geysers<metrics.standard.geysers&&metrics.standard.geysers<metrics.large.geysers,
    'energy-node count is not ordered: '+JSON.stringify(metrics));
  assert(Object.values(metrics).every(M=>M.inside&&M.fair),'bounds or starter fairness failed: '+JSON.stringify(metrics));

  await page.evaluate(()=>{
    if(typeof apGateSatisfied==='function')apGateSatisfied();const ap=document.getElementById('apOverlay');if(ap)ap.style.display='none';
    document.body.classList.add('mfIntroDone');const boot=document.getElementById('mfBootCover');if(boot)boot.remove();
    stopAttract();document.querySelectorAll('#introReveal,.introReveal').forEach(e=>e.style.display='none');
    showFrontScreen('setupScr');mfGalaxySetStage('region');renderMapRow();renderSpawnPlanner();
  });
  await page.evaluate(()=>{const R=mfGalaxyRegion(),key=R.maps[R.maps.length-1];syncBattlefieldFromMap(key);renderMapRow();});
  const ui=await page.evaluate(()=>({choice:battlefieldPreset,map:curMap,
    labels:[...document.querySelectorAll('.mapCard .mSize')].map(b=>b.innerText.replace(/\s+/g,' ').trim()),
    taps:[...document.querySelectorAll('.mapCard')].map(b=>Math.round(b.getBoundingClientRect().height)),
    catalogue:Object.values(PLANETS).map(P=>({regions:P.regions.length,maps:P.regions.map(R=>R.maps.map(k=>MAPDEFS[k]&&MAPDEFS[k].size))}))}));
  assert(ui.choice==='large'&&ui.map.endsWith('_large'),'Large authored site did not update: '+JSON.stringify(ui));
  assert(ui.labels.length===3&&ui.labels[0].includes('SMALL')&&ui.labels[1].includes('MEDIUM')&&ui.labels[2].includes('LARGE'),
    'site-size labels incorrect: '+JSON.stringify(ui.labels));
  assert(ui.catalogue.length===4&&ui.catalogue.every(P=>P.regions===4&&P.maps.every(S=>S.join(',')==='compact,standard,large')),
    'planet/region/site catalogue is incomplete: '+JSON.stringify(ui.catalogue));
  await page.waitForTimeout(250);
  await page.screenshot({path:shot,fullPage:false});
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  console.log(JSON.stringify({ok:true,metrics,ui,screenshot:shot},null,2));
}finally{await browser.close();}
