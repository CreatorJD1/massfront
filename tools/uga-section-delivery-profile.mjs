import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
const label=process.argv[2]||'before';if(!['before','after'].includes(label))throw Error('Expected before or after');
const dir=`tmp/uga-section-delivery/${label}`;await mkdir(dir,{recursive:true});
const base=process.env.MF_SPACE_URL||'http://127.0.0.1:8991/';
const files=['modules/space_exploration/src/ship/uga_blender_assets.js','modules/space_exploration/src/core/uga_command_scene.js','modules/space_exploration/src/ui/uga_command.js','modules/space_exploration/src/ui/uga_command.css'];
const sha=b=>createHash('sha256').update(b).digest('hex'),hashes={};for(const f of files)hashes[f]=sha(await readFile(f));
const browser=await launchPwBrowser();let page,session,timer;const samples=[],errors=[];
try{
  page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});
  session=await page.context().newCDPSession(page);await session.send('Network.enable');await session.send('Network.setCacheDisabled',{cacheDisabled:true});await session.send('Performance.enable');
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.ready);await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);
  const gpu=await assertHardwareGpu(page);
  const before=await session.send('Performance.getMetrics');
  let pending=false;timer=setInterval(async()=>{if(pending)return;pending=true;try{samples.push(await session.send('Performance.getMetrics'));}catch{}finally{pending=false;}},50);
  const started=Date.now();await page.click('#btnUgaCommand');await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.commandScene?.loaded);
  const loadWallMs=Date.now()-started;clearInterval(timer);
  // One controlled frame normalizes traffic before framing. The regular render
  // loop is frozen only for this diagnostic screenshot, never in game source.
  const frame=await page.evaluate(()=>{
    window.requestAnimationFrame=()=>0;const s=window.__MASSFRONT_SPACE__.commandScene,r=s.renderer;
    r.setPixelRatio(1);r.setSize(innerWidth,innerHeight,false);s.update(0,0);s.resize(r.domElement.clientWidth,r.domElement.clientHeight);s.focusOverview(false);s.update(0,0);s._setHighlight(null);s.render();
    const geometries=new Set(),materials=new Set(),textures=new Set();s.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:o.material?[o.material]:[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
    const gl=r.getContext();return{png:r.domElement.toDataURL('image/png').split(',')[1],camera:s.camera.position.toArray(),target:s.cameraTarget.toArray(),renderInfo:JSON.parse(JSON.stringify(r.info)),resourceCounts:{geometries:geometries.size,materials:materials.size,textures:textures.size},heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,resources:performance.getEntriesByType('resource').filter(e=>/uga-authored-sections|uga-sections\//.test(e.name)).map(e=>({name:e.name,duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize})),glError:gl.getError(),contextLost:gl.isContextLost()};
  });
  await writeFile(`${dir}/overview-portrait.png`,Buffer.from(frame.png,'base64'));delete frame.png;
  const after=await session.send('Performance.getMetrics');samples.push(after);
  const metric=(entry,name)=>entry.metrics.find(m=>m.name===name)?.value||0;
  const changedSource=[];for(const f of files)if(sha(await readFile(f))!==hashes[f])changedSource.push(f);
  const report={time:new Date().toISOString(),label,base,profile:'Desktop hardware GPU at 412x900 touch viewport, cold browser HTTP cache; not physical phone measurement',gpu,hashes,changedSource,loadWallMs,heapBefore:metric(before,'JSHeapUsedSize'),sampledPeakJsHeap:Math.max(...samples.map(s=>metric(s,'JSHeapUsedSize'))),heapAfter:metric(after,'JSHeapUsedSize'),sampleCount:samples.length,frame,errors};
  await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length||changedSource.length||frame.glError||frame.contextLost)process.exitCode=1;
}finally{clearInterval(timer);await page?.close();await closePwBrowser();}
