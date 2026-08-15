import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import fs from 'node:fs';

const base=process.argv[2]||'http://127.0.0.1:8974/';
const authoredLod=process.argv[4]==='1'?1:0;
const asset=process.argv[5]==='factory'?'factory':process.argv[5]==='commander'?'commander':'tank';
const assetTag=asset==='factory'?'-factory':asset==='commander'?'-commander':'';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await launchPwBrowser({
  headless:true,
  executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']
});
fs.mkdirSync('.tmp',{recursive:true});
const results=[];
const cases=process.argv[3]==='quick'?[{count:1,path:'v2'}]:
  [{count:1,path:'v2'},{count:100,path:'legacy'},{count:100,path:'v2'},
   {count:200,path:'legacy'},{count:200,path:'v2'}];
for(const test of cases){
  const {count,path}=test;
  const page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true,deviceScaleFactor:1});
  const errors=[];
  const requests=[];
  page.on('pageerror',e=>errors.push('page: '+e.message));
  page.on('request',r=>requests.push(r.url()));
  page.on('console',m=>{
    if(m.type()==='error'&&!m.text().includes('ERR_NETWORK_ACCESS_DENIED'))errors.push('console: '+m.text());
  });
  const assetParam=asset==='tank'?'':'&materialasset='+asset;
  const showcase=(count===1?'&materialquality=showcase&materialview=close&materiallod='+authoredLod:'')+assetParam;
  await page.goto(base+'?materiallab=1&materialcount='+count+'&materialpath='+path+showcase,{waitUntil:'domcontentloaded',timeout:30000});
  try{await page.waitForFunction(()=>window.__mfMaterialV2?.enabled===true,{timeout:30000});}
  catch(e){
    console.error(JSON.stringify({errors,state:await page.evaluate(()=>({
      diagnostic:window.__mfMaterialV2||null,
      shaderErrors:typeof GL_PROG_ERRORS==='undefined'?[]:GL_PROG_ERRORS.slice()
    }))},null,2));
    throw e;
  }
  await page.waitForTimeout(count===1?5000:2200);
  const measuredFps=await page.evaluate(()=>new Promise(resolve=>{
    let frames=0,start=performance.now();
    const frame=now=>{frames++;if(now-start<1800)requestAnimationFrame(frame);else resolve(frames*1000/(now-start));};
    requestAnimationFrame(frame);
  }));
  const diag=await page.evaluate(()=>({
    material:{...window.__mfMaterialV2,v2Error:window.__mfMaterialV2.lastGLError()},
    shaderErrors:typeof GL_PROG_ERRORS==='undefined'?['GL_PROG_ERRORS unavailable']:GL_PROG_ERRORS.slice(),
    /* The legacy renderer leaves INVALID_ENUM queued under SwiftShader while
       querying optional capabilities. V2 validity is gated by shader link,
       context status and visible output here; record the queue separately. */
    glErrorObserved:typeof gl==='undefined'?-1:gl.getError(),
    contextLost:typeof gl==='undefined'||gl.isContextLost(),
    drawCalls:typeof drawCalls==='undefined'?-1:drawCalls,
    triangles:typeof triCount==='undefined'?-1:triCount
  }));
  diag.measuredFps=measuredFps;
  diag.requests=requests.filter(u=>/material-v2|nova-(heavy|factory|commander)-v2|mf_mechanical_microdetail/.test(u));
  const lodSuffix=count===1&&authoredLod?'-lod1':'';
  const out='.tmp/material-v2'+assetTag+'-'+count+'-'+path+lodSuffix+'-day.png';
  if(path==='v2')await page.screenshot({path:out});
  if(count===1){
    for(const channel of [1,2,3,4,5,8]){
      await page.locator('[data-mf2="'+channel+'"]').click();
      await page.waitForTimeout(180);
      await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-channel-'+channel+'.png'});
    }
    await page.locator('[data-mf2="0"]').click();
    await page.locator('#mf2Night').click();
    await page.waitForTimeout(1400);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-night.png'});
    await page.locator('[data-mf2="6"]').click();
    await page.waitForTimeout(900);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-masks.png'});
    await page.locator('[data-mf2="0"]').click();
    await page.locator('#mf2Night').click();
    await page.locator('[data-mf2-damage=".5"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-worn.png'});
    await page.locator('[data-mf2-damage="1"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-critical.png'});
    await page.locator('[data-mf2-damage="2"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-destroyed.png'});
    await page.locator('[data-mf2-damage="0"]').click();
    await page.locator('[data-mf2-view="tactical"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-tactical.png'});
    await page.locator('[data-mf2-view="far"]').click();
    await page.waitForTimeout(500);
    await page.screenshot({path:'.tmp/material-v2'+assetTag+'-1'+lodSuffix+'-far.png'});
  }
  if(asset==='commander'){
    if(diag.material.asset!=='commander'||diag.material.geometrySource!=='procedural fallback')throw new Error('commander route did not use procedural benchmark: '+JSON.stringify(diag.material));
    if(requests.some(u=>/material-v2-commander|nova-commander-v2/.test(u)))throw new Error('commander route requested an authored payload: '+requests.join('\n'));
  }
  results.push({count,errors,diag,out});
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.errors.length||r.diag.shaderErrors.length||r.diag.contextLost||r.diag.material.v2Error!==0))process.exit(1);
