import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';

const mode=process.argv[2]||'before';
if(!['before','after'].includes(mode))throw Error('Expected before or after');
const base=process.env.MF_SPACE_URL||'http://127.0.0.1:8991/';
const pair=process.env.MF_UGA_PAIR||'';
if(pair&&!/^[a-z0-9-]+$/.test(pair))throw Error('Invalid pair name');
const label=process.env.MF_UGA_CAPTURE_LABEL||mode;
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid capture label');
const dir=new URL(`../tmp/uga-lossless/${pair?pair+'/':''}${label}/`,import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(dir,{recursive:true});
const files=['modules/space_exploration/src/core/uga_command_scene.js','modules/space_exploration/src/ship/uga_blender_assets.js','modules/space_exploration/src/ui/uga_command.js','modules/space_exploration/src/ui/uga_command.css','modules/space_exploration/src/ui/uga_scene.js','modules/space_exploration/assets/runtime/models/uga-authored-sections.glb'];
const hashes={};for(const file of files)hashes[file]=hash(await readFile(file));
const rooms={overview:null,command:'A',navigation:'A',survey:'A',mission_ops:'A',research:'B',fabricator:'B',engineering:'B',habitat:'C',factions:'C',hangar:'C',logistics:'C'};
const browser=await launchPwBrowser();let page;const captures=[],errors=[];
try{
  page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
  if(process.env.MF_UGA_ORIGINAL==='1')await page.route('**/uga-authored-sections.glb*',route=>route.continue({url:new URL('assets/models/uga-command-cutaway.glb',base).href}));
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.ready);
  await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);
  const gpu=await assertHardwareGpu(page);
  await page.click('#btnUgaCommand');
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.commandScene?.loaded);
  // This comparison deliberately freezes animation and renders one controlled
  // frame. It is pixel-fidelity diagnostics, not a substitute for real UI tests.
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.waitForTimeout(100);
  for(const [viewport,size] of Object.entries({landscape:{width:1440,height:900},portrait:{width:412,height:900}})){
    await page.setViewportSize(size);
    for(const [id,deck] of Object.entries(rooms)){
      if(deck){await page.click(`[data-deck-filter="${deck}"]`);await page.locator(`.uga-district-button[data-district="${id}"]`).click();}
      else await page.click('[data-action="overview"]');
      const frame=await page.evaluate(id=>{
        const s=window.__MASSFRONT_SPACE__.commandScene,r=s.renderer,c=r.domElement;
        r.setPixelRatio(1);r.setSize(innerWidth,innerHeight,false);
        // Normalize authored transit before bounds fitting, otherwise the first
        // overview camera depends on the frame when asynchronous loading ended.
        s.update(0,0);
        s.resize(c.clientWidth,c.clientHeight);
        if(id==='overview')s.focusOverview(false);else s.focusDistrict(id,false);
        s.update(0,0);s._setHighlight(id==='overview'?null:id);
        s.render();
        const gl=r.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let raw='';for(let i=0;i<pixels.length;i+=16384)raw+=String.fromCharCode(...pixels.subarray(i,i+16384));
        return {png:c.toDataURL('image/png').split(',')[1],pixels:btoa(raw),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,camera:s.camera.position.toArray(),target:s.cameraTarget.toArray(),glError:gl.getError(),lost:gl.isContextLost()};
      },id);
      const stem=`${id}-${viewport}`,raw=Buffer.from(frame.pixels,'base64');
      await writeFile(new URL(`${stem}.png`,dir),Buffer.from(frame.png,'base64'));
      await writeFile(new URL(`${stem}.rgba`,dir),raw);
      let comparison=null;
      if(mode==='after'){
        const prior=await readFile(new URL(`../before/${stem}.rgba`,dir));
        let changedChannels=0,maxDelta=0,absoluteDelta=0;
        if(prior.length!==raw.length)throw Error(`${stem} dimensions changed`);
        for(let i=0;i<raw.length;i++){const d=Math.abs(raw[i]-prior[i]);if(d)changedChannels++;maxDelta=Math.max(maxDelta,d);absoluteDelta+=d;}
        comparison={changedChannels,maxDelta,meanChannelDelta:absoluteDelta/raw.length,exact:changedChannels===0};
      }
      captures.push({id,viewport,width:frame.width,height:frame.height,camera:frame.camera,target:frame.target,glError:frame.glError,lost:frame.lost,pixelHash:hash(raw),comparison});
      console.log(`${mode} ${stem}${comparison?` changedChannels=${comparison.changedChannels} maxDelta=${comparison.maxDelta}`:''}`);
    }
  }
  const changedSource=[];for(const file of files)if(hash(await readFile(file))!==hashes[file])changedSource.push(file);
  const report={time:new Date().toISOString(),mode,base,gpu,hashes,originalAssetOverride:process.env.MF_UGA_ORIGINAL==='1',servedAssetHash:hash(await readFile(process.env.MF_UGA_ORIGINAL==='1'?'modules/space_exploration/assets/models/uga-command-cutaway.glb':'modules/space_exploration/assets/runtime/models/uga-authored-sections.glb')),changedSource,captures,errors};
  await writeFile(new URL('report.json',dir),JSON.stringify(report,null,2));
  if(errors.length||changedSource.length||captures.some(c=>c.glError||c.lost||c.comparison&&!c.comparison.exact))process.exitCode=1;
  console.log(fileURLToPath(dir));
}finally{await page?.close();await closePwBrowser();}
