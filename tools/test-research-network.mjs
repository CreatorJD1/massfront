/* Focused <=2-minute regression for the touch-first prerequisite research graph. */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const supplied=process.argv.find(a=>/^https?:\/\//.test(a));
const url=supplied||'http://127.0.0.1:8148/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=resolve(process.env.MF_RESEARCH_EVIDENCE_DIR||join(root,'releases','research-network'));
const shot=join(out,'research-network-mobile.png');
const overview=join(out,'research-network-overview-mobile.png');
const report=join(out,'report.json');
const assert=(v,m)=>{if(!v)throw new Error(m);};
let server=null;await mkdir(out,{recursive:true});
if(!supplied){
  server=spawn('python',['-m','http.server','8148','--directory',root],{stdio:'ignore',windowsHide:true});
  for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
}
const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,
    hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'});
  await context.addInitScript(()=>{try{localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');}catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__MF_RESEARCH_TREE__&&typeof renderDevelop==='function'&&typeof showFrontScreen==='function',null,{timeout:60000});
  await page.waitForTimeout(11000);
  const intro=page.locator('#mfIntroStart');
  if(await intro.isVisible()) await intro.click();
  await page.waitForTimeout(500);
  const gate=page.locator('#apCloseBtn');
  if(await gate.isVisible()) await gate.click();
  await page.locator('#mfBootCover,#apOverlay,#mfPreAlphaIntro').evaluateAll(els=>els.forEach(el=>{if(el)el.style.display='none';}));
  await page.evaluate(()=>{
    document.querySelectorAll('#mfPreAlphaIntro,#tutorialCoach,#tutorialBrief').forEach(e=>{if(e)e.style.display='none';});
    document.body.classList.add('mfIntroDone');
    playerFaction='nova';
    META.res={metallurgy:1,optics:1,salvage:1,logistics:1,xeno:1};
    META.resQueue=[];META.researchData=120;META.mats={alloy:500,circuit:500,isotope:100,relic:20};
    devTab='research';showFrontScreen('devScr');renderDevelop();
    window.__MF_RESEARCH_TREE__.select('slot3',false);
    window.__MF_RESEARCH_TREE__.queuePath('slot3');
  });
  await page.waitForTimeout(450);
  const result=await page.evaluate(()=>{
    const api=window.__MF_RESEARCH_TREE__,snap=api.snapshot();
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
    const nodes=[...document.querySelectorAll('[data-research-id]')];
    const queue=[...document.querySelectorAll('[data-queue-slot]')];
    const slot3=document.querySelector('[data-research-id="slot3"]');
    const detail=document.querySelector('[data-test="research-detail"]');
    const faction=[...document.querySelectorAll('[data-rtfaction]')];
    const graph=document.querySelector('[data-test="research-graph"]');
    return {snap,nodeTargets:nodes.map(rect),queueTargets:queue.map(rect),factionTargets:faction.map(rect),
      nodeIds:nodes.map(n=>n.dataset.researchId),
      slot3:slot3?{state:slot3.dataset.state,req:slot3.dataset.prerequisites,selected:slot3.classList.contains('selected')}:null,
      detail:detail?{node:detail.dataset.node,text:detail.textContent.replace(/\s+/g,' ').trim(),box:rect(detail)}:null,
      graph:graph?{scrollW:graph.scrollWidth,clientW:graph.clientWidth,scrollH:graph.scrollHeight,clientH:graph.clientHeight}:null,
      focusedEdges:document.querySelectorAll('.rt3d-links path.focus').length,
      bodyTree:!!document.querySelector('#devBody>[data-test="research-tree"]')};
  });
  assert(result.bodyTree,'research takeover did not replace the basic list on portrait phone');
  assert(result.snap.version==='2.0'&&result.snap.nodeCount>=16,'research debug contract/version is wrong: '+JSON.stringify(result.snap));
  assert(result.snap.renderedNodes===16&&result.snap.renderedEdges===14&&result.snap.edgeCount>=result.snap.renderedEdges,
    'node/edge graph is incomplete: '+JSON.stringify(result.snap));
  assert(result.snap.branches.length===3&&result.snap.queueSlots===5,'branch or queue contract missing');
  assert(result.snap.queue.join(',')==='refit,servos,slot2,slot3','prerequisite path queue is wrong: '+JSON.stringify(result.snap.queue));
  assert(result.slot3&&result.slot3.state==='locked'&&result.slot3.req.includes('refit')&&result.slot3.req.includes('slot2')&&result.slot3.selected,
    'cross-branch prerequisite lock is not visible: '+JSON.stringify(result.slot3));
  assert(result.detail&&result.detail.node==='slot3'&&result.detail.text.includes('Field Refit')&&result.detail.text.includes('Modular Frames')&&
    result.detail.text.includes('QUEUE PREREQUISITE PATH'),'node detail does not explain the lock');
  assert(result.focusedEdges===2,'selected cross-branch node did not highlight both incoming edges');
  assert(result.nodeTargets.every(r=>r.w>=112&&r.h>=68)&&result.queueTargets.every(r=>r.h>=52)&&result.factionTargets.every(r=>r.h>=48),
    'phone touch targets are undersized: '+JSON.stringify({nodes:result.nodeTargets,queue:result.queueTargets,factions:result.factionTargets}));
  assert(result.graph&&result.graph.scrollW>result.graph.clientW&&result.graph.scrollH>result.graph.clientH,
    'large graph does not provide two-axis phone navigation');
  await page.screenshot({path:shot,fullPage:false});
  await page.locator('#rtDetailClose').tap();
  await page.evaluate(()=>{
    const sc=document.querySelector('#devScr .opsScroll'),stage=document.getElementById('rtStage');
    if(sc) sc.scrollTop=Math.max(0,document.querySelector('.rt3d-summary').offsetTop-8);
    if(stage){stage.scrollLeft=145;stage.scrollTop=125;}
  });
  await page.waitForTimeout(150);
  await page.screenshot({path:overview,fullPage:false});
  await page.locator('#rtResearchNext').tap();
  await page.waitForFunction(()=>devHas('refit')&&window.__MF_RESEARCH_TREE__.snapshot().queue[0]==='servos');
  const purchased=await page.evaluate(()=>({owned:devHas('refit'),queue:window.__MF_RESEARCH_TREE__.snapshot().queue,
    visibleFirst:document.querySelector('[data-queue-slot="0"] span')?.textContent||''}));
  assert(purchased.owned&&purchased.queue.join(',')==='servos,slot2,slot3'&&/Heavy Servos/i.test(purchased.visibleFirst),
    'RESEARCH NEXT did not use devBuy and advance the live queue: '+JSON.stringify(purchased));
  assert(errors.length===0,'page errors:\n'+errors.join('\n'));
  const payload={ok:true,...result,purchased,screenshot:shot,overview};
  await writeFile(report,JSON.stringify(payload,null,2)+'\n');
  console.log(JSON.stringify({...payload,report},null,2));
}finally{await browser.close();if(server)server.kill();}
