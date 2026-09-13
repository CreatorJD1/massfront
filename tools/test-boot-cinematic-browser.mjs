import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const url=process.env.MF_BOOT_TEST_URL||'http://127.0.0.1:8993/';
const output='tmp/boot-cinematic';
await mkdir(output,{recursive:true});
const report={url,time:new Date().toISOString(),source:{},cases:[]};
for(const path of ['index.html','boot.js'])report.source[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const browser=await launchPwBrowser();
try{
  const gpuPage=await browser.newPage();
  report.gpu=await assertHardwareGpu(gpuPage);await gpuPage.close();
  for(const test of [
    {name:'portrait',width:412,height:900,reducedMotion:'no-preference'},
    {name:'landscape',width:900,height:412,reducedMotion:'no-preference'},
    {name:'reduced-motion',width:412,height:900,reducedMotion:'reduce'}
  ]){
    const page=await browser.newPage({viewport:{width:test.width,height:test.height},hasTouch:true,reducedMotion:test.reducedMotion});
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBypassServiceWorker',{bypass:true});
    const errors=[],external=[];let release;let blocked=false;
    const gate=new Promise(resolve=>{release=resolve;});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const request=new URL(route.request().url());
      if(!['127.0.0.1','localhost'].includes(request.hostname)){external.push(request.origin+request.pathname);return route.abort();}
      if(request.pathname==='/src/main.js'){
        blocked=true;
        // Delay an actual required runtime response, never invent loading
        // values or replace the production DOM with an artificial fixture.
        await Promise.race([gate,new Promise(resolve=>setTimeout(resolve,15000))]);
      }
      await route.continue();
    });
    try{
      await page.goto(url,{waitUntil:'commit'});
      await page.waitForFunction(()=>Number(document.querySelector('#mfBootBar')?.getAttribute('aria-valuenow'))>0);
      await page.waitForTimeout(500);
      const metrics=await page.evaluate(()=>{
        const cover=document.getElementById('mfBootCover');
        const selectors=['.mfBootTop','#mfBootTitleArt','.mfBootEyebrow','.mfBootSubtitle','.mfBootVector','#mfBootPhase','#mfBootPct','#mfBootCount','#mfBootElapsed','#mfBootSource','#mfBootDetail','.mfBootFooter'];
        const text=selectors.map(selector=>{const node=cover.querySelector(selector),box=node.getBoundingClientRect();return {selector,text:node.innerText,x:box.x,y:box.y,width:box.width,height:box.height,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};});
        const animationNames=[...cover.querySelectorAll('*')].flatMap(node=>['',':before',':after'].map(pseudo=>getComputedStyle(node,pseudo||null).animationName));
        const title=document.getElementById('mfBootTitleArt'),original=document.getElementById('menuBrand');
        return {width:innerWidth,height:innerHeight,progress:Number(document.getElementById('mfBootBar').getAttribute('aria-valuenow')),total:Number(document.getElementById('mfBootBar').getAttribute('aria-valuemax')),text,animationNames,titleArt:{matchesOriginal:title.src===original.src,naturalWidth:title.naturalWidth,naturalHeight:title.naturalHeight}};
      });
      await page.screenshot({path:`${output}/${test.name}.png`});
      report.cases.push({...test,blocked,metrics,errors,external});
      assert.ok(blocked&&metrics.progress>0&&metrics.progress<metrics.total,'actual runtime progress remains in flight');
      assert.ok(metrics.titleArt.matchesOriginal&&metrics.titleArt.naturalWidth>0,'original title artwork is loaded without replacement');
      for(const item of metrics.text){
        assert.ok(item.x>=0&&item.y>=0&&item.x+item.width<=test.width+1&&item.y+item.height<=test.height+1,`${test.name} ${item.selector} outside viewport`);
        assert.ok(item.scrollWidth<=item.clientWidth+1,`${test.name} ${item.selector} text overflows`);
      }
      if(test.reducedMotion==='reduce')assert.ok(metrics.animationNames.every(name=>name==='none'),'reduced motion stops decorative animations');
      assert.deepEqual(errors,[],'no loading script errors');
    }finally{release();await page.close();}
  }
}catch(error){report.failure=String(error.stack);throw error;}
finally{await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await closePwBrowser();}
console.log('Boot cinematic portrait, landscape and reduced motion: PASS');
