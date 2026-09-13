import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {buildAudioPackFileEntry} from './build-audio-pack.mjs';
const tagIndex=process.argv.indexOf('--tag'),tag=tagIndex<0?'':process.argv[tagIndex+1];
if(tagIndex>=0&&(!tag||!/^[a-zA-Z0-9_-]+$/.test(tag)))throw new Error('Use --tag UNIQUE_SAFE_TAG');
const root=resolve('.'),output=resolve('tmp/startup-pack-continuity'+(tag?'-'+tag:''));
if(tag){
  let exists=false;try{await access(output);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(exists)throw new Error('Evidence tag exists; choose a new tag to preserve prior results');
}
const paths=['src/assetpack.js','modules/space_exploration/src/startup_content.js','modules/space_exploration/assets/runtime/content/assetpack-runtime.js'];
paths.push('modules/space_exploration/src/ui/uga_command.css');
const hash=async path=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hash(p)])));
assert.equal(before[paths[0]],before[paths[2]],'runtime copy must be byte-identical');
const data=Buffer.alloc(256*1024);for(let i=0;i<data.length;i++)data[i]=i%251;
const chunkSize=64*1024;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/base.html'||path==='/galactic.html'){
    res.setHeader('Content-Type','text/html');
    const deployment='<nav class="uga-deployment-context" hidden><button data-action="deployment-sections">SHIP SECTIONS</button><div><small>NEXUS-VII // DECK C</small><strong>STRIKE BAY</strong></div></nav><div class="uga-command-stage"><aside class="uga-context-panel" hidden><div class="uga-deployment-toolbar"><button>BACK TO MISSIONS</button><button data-action="toggle-deployment-loadout">EDIT LOADOUT</button></div><div class="uga-context-body"><div class="uga-context-scroll uga-deployment-view"><section class="uga-deployment-planner"><div class="uga-deployment-summary"><span>HQ</span><div><small>DEPLOYMENT CARRIER</small><strong>Nova Orbital Carrier</strong><p>Captain Elara Kai · 3 specialists</p></div></div><div class="uga-deployment-fields"><label><span>Hired commander</span><select data-deploy="commanderId"><option>CAPTAIN ELARA KAI</option></select></label></div><div class="uga-deployment-readiness"><span><small>CAPACITY</small><b>7 / 10 SLOTS</b></span><button class="uga-primary-button" data-action="deploy">CONFIRM &amp; DEPLOY</button></div></section></div></div></aside></div>';
    res.end('<!doctype html><link rel="stylesheet" href="/modules/space_exploration/src/ui/uga_command.css"><body style="background:#07121e;color:white"><h1>Content continuity fixture</h1><div class="uga-command-shell"><nav class="uga-command-nav">'+['Galaxy','Ship','Missions','Crew','More'].map(label=>`<button><span>${label}</span></button>`).join('')+'</nav>'+deployment+'</div>'+(path==='/base.html'?'<script>window.MASSFRONT_UPDATE_URL=location.origin+"/update.json"</script><script src="/src/assetpack.js"></script><script>MASSFRONT_ASSET_PACKS.initializeStartup({ui:false})</script>':'<script type="module" src="/modules/space_exploration/src/startup_content.js"></script>'));return;
  }
  if(paths.includes(path.slice(1))){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(resolve(root,path.slice(1))));return;}
  res.writeHead(404);res.end();
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser,context,gpu;const errors=[],requests=[],cases=[];
try{
  browser=await launchPwBrowser();context=await browser.newContext({viewport:{width:412,height:900},hasTouch:true});
  let mode='interrupt',active=0,maxActive=0,firstPage;
  const manifest={version:2,packs:{continuity:{format:2,delivery:'startup',label:'Continuity fixture',chunkSize,bytes:data.length,baseUrl:origin+'/payload',files:[buildAudioPackFileEntry('content.bin',data,chunkSize)]}}};
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/packs.json')){await route.fulfill({json:manifest});return;}
    if(url.pathname.startsWith('/payload/')){
      const range=route.request().headers().range;const match=/bytes=(\d+)-(\d+)/.exec(range||'');
      assert.ok(match,'client must use bounded Range');
      const start=Number(match[1]),end=Number(match[2]);requests.push({start,end,page:route.request().frame().page()===firstPage?'base':'galactic',mode});
      active++;maxActive=Math.max(maxActive,active);
      try{
        await new Promise(done=>setTimeout(done,mode==='interrupt'&&start>=chunkSize?1200:mode==='reconnect'?700:100));
        await route.fulfill({status:206,headers:{'content-range':`bytes ${start}-${end}/${data.length}`,'content-length':String(end-start+1)},body:data.subarray(start,end+1)});
      }catch(error){if(!/closed|canceled|cancelled|Invalid interception/i.test(error.message))throw error;}
      finally{active--;}
      return;
    }
    if(url.origin===origin){await route.continue();return;}
    await route.abort();
  });
  firstPage=await context.newPage();firstPage.on('pageerror',e=>errors.push(e.message));
  await firstPage.goto(origin+'/base.html');gpu=await assertHardwareGpu(firstPage);
  assert.equal(await firstPage.evaluate(()=>JSON.parse(sessionStorage.getItem('massfront_content_endpoint_v1')).base),origin);
  assert.equal(requests.length,0,'endpoint handoff precedes the delayed content transfer');
  await firstPage.goto(origin+'/galactic.html');
  await firstPage.waitForFunction(()=>window.MASSFRONT_ASSET_PACKS);
  assert.equal(await firstPage.evaluate(()=>JSON.parse(sessionStorage.getItem('massfront_content_endpoint_v1')).base),origin);
  cases.push({name:'immediate-navigation-retains-configured-endpoint-before-download',ok:true});
  await firstPage.goto(origin+'/base.html');
  await firstPage.waitForFunction(()=>MASSFRONT_ASSET_PACKS.snapshot().got>=65536,null,{timeout:20000});
  await firstPage.goto(origin+'/galactic.html');
  await firstPage.waitForFunction(()=>window.MASSFRONT_ASSET_PACKS?.snapshot().state==='ready',null,{timeout:30000});
  assert.equal(requests.filter(r=>r.start===0).length,1,'verified first chunk must not repeat after document navigation');
  assert.equal((await firstPage.evaluate(()=>MASSFRONT_ASSET_PACKS.status('continuity'))).installed,true);
  cases.push({name:'real-document-navigation-resumes-verified-chunks',ok:true});
  await firstPage.evaluate(()=>MASSFRONT_ASSET_PACKS.remove('continuity'));
  mode='concurrent';maxActive=0;
  const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));
  await second.goto(origin+'/base.html');
  await second.evaluate(()=>MASSFRONT_ASSET_PACKS.loadIndex());
  await Promise.all([firstPage.goto(origin+'/galactic.html'),second.goto(origin+'/galactic.html')]);
  await Promise.all([firstPage.waitForFunction(()=>window.MASSFRONT_ASSET_PACKS?.snapshot().state==='ready',null,{timeout:20000}),second.waitForFunction(()=>window.MASSFRONT_ASSET_PACKS?.snapshot().state==='ready',null,{timeout:20000})]);
  assert.equal(maxActive,1,'two tabs must never concurrently write/download payload');
  assert.equal(requests.filter(r=>r.mode==='concurrent').length,4,'waiting tab must adopt completed pack without duplicate transfer');
  cases.push({name:'same-origin-two-tabs-single-writer-and-adoption',ok:true});
  manifest.packs.manual={...manifest.packs.continuity,delivery:'manual',label:'Preserved unrelated pack'};
  await second.evaluate(()=>MASSFRONT_ASSET_PACKS.loadIndex());
  assert.equal((await second.evaluate(()=>MASSFRONT_ASSET_PACKS.install('manual'))).ok,true);
  // firstPage still holds an older active index. Its next writer must reload
  // the shared pointer and preserve the other tab's newly installed pack.
  await second.close();await firstPage.evaluate(()=>MASSFRONT_ASSET_PACKS.remove('continuity'));
  assert.equal((await firstPage.evaluate(()=>MASSFRONT_ASSET_PACKS.status('manual'))).installed,true);
  cases.push({name:'stale-tab-writer-preserves-other-tab-active-pack',ok:true});
  mode='reconnect';await firstPage.goto(origin+'/galactic.html');await context.setOffline(true);
  await firstPage.waitForTimeout(4500);
  assert.equal(requests.filter(r=>r.mode==='reconnect').length,0);
  await context.setOffline(false);
  await firstPage.waitForFunction(()=>window.MASSFRONT_ASSET_PACKS?.snapshot().busy,null,{timeout:15000});
  await mkdir(output,{recursive:true});await firstPage.screenshot({path:resolve(output,'reconnect-progress.png')});
  await firstPage.waitForFunction(()=>window.MASSFRONT_ASSET_PACKS?.snapshot().state==='ready',null,{timeout:20000});
  cases.push({name:'real-offline-online-resumes-automatically',ok:true});
  for(const viewport of [{width:412,height:900},{width:900,height:412}]){
    await firstPage.setViewportSize(viewport);
    await firstPage.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('massfront:assetpack-state',{detail:{state:'error',busy:false,error:'Test connection paused',got:65536,total:262144,percent:25}}));
      document.getElementById('mfGalacticContentStatus').open=true;
    });
    await firstPage.waitForTimeout(100);
    const geometry=await firstPage.evaluate(()=>{
      const status=document.getElementById('mfGalacticContentStatus').getBoundingClientRect();
      const buttons=[...document.querySelectorAll('.uga-command-nav button')].map(button=>button.getBoundingClientRect());
      return {status:status.toJSON(),overlaps:buttons.some(rect=>status.left<rect.right&&status.right>rect.left&&status.top<rect.bottom&&status.bottom>rect.top)};
    });
    assert.equal(geometry.overlaps,false,'content controls must not cover actual responsive navigation targets');
    await firstPage.screenshot({path:resolve(output,`status-${viewport.width}x${viewport.height}.png`)});
    cases.push({name:`content-status-clears-navigation-${viewport.width}x${viewport.height}`,ok:true,geometry});
  }
  // This layout fixture uses the real responsive stylesheet and status caller.
  // Its small controls mirror the deployed shell; the full hangar verifier
  // separately exercises real game controls and the 3D composition.
  for(const viewport of [{width:412,height:900},{width:900,height:412}])for(const expanded of [false,true])for(const busy of [true,false]){
    await firstPage.setViewportSize(viewport);
    await firstPage.evaluate(({expanded,busy})=>{
      document.querySelector('.uga-command-shell').className='uga-command-shell is-deployment-mode is-sheet-expanded'+(expanded?' is-loadout-expanded':'');
      document.querySelector('.uga-context-panel').hidden=false;
      document.querySelector('.uga-deployment-context').hidden=false;
      window.dispatchEvent(new CustomEvent('massfront:assetpack-state',{detail:{state:busy?'downloading':'error',busy,error:busy?'':'Test connection paused',got:65536,total:262144,percent:25}}));
      document.getElementById('mfGalacticContentStatus').open=true;
    },{expanded,busy});
    await firstPage.waitForTimeout(120);
    const geometry=await firstPage.evaluate(()=>{
      const card=document.getElementById('mfGalacticContentStatus'),status=card.getBoundingClientRect();
      const controls=[...document.querySelectorAll('.uga-context-panel button,.uga-context-panel select,.uga-deployment-context button')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),visible:!!r.width&&!!r.height,hit:hit===e||e.contains(hit),label:e.textContent};}).filter(e=>e.visible);
      const obstacles=[...document.querySelectorAll('.uga-context-panel,.uga-deployment-context')].map(e=>e.getBoundingClientRect());
      return {status:status.toJSON(),viewport:{width:innerWidth,height:innerHeight},controls,overlap:obstacles.some(r=>status.left<r.right&&status.right>r.left&&status.top<r.bottom&&status.bottom>r.top)};
    });
    const name=`content-status-deployment-${viewport.width}x${viewport.height}-${expanded?'expanded':'compact'}-${busy?'busy':'paused'}`;
    await firstPage.screenshot({path:resolve(output,name+'.png')});
    const ok=!geometry.overlap&&geometry.controls.every(c=>c.hit)&&geometry.status.left>=0&&geometry.status.right<=viewport.width&&geometry.status.top>=0&&geometry.status.bottom<=viewport.height;
    cases.push({name,ok,geometry});
    assert.equal(ok,true,'content card must clear deployment inspector, Confirm, commander, and Ship Sections');
  }
}catch(error){
  cases.push({name:'failure',ok:false,message:error.stack});
}finally{
  const after=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hash(p)])));
  const report={ok:cases.length>=4&&cases.every(c=>c.ok)&&errors.length===0&&JSON.stringify(before)===JSON.stringify(after),fixtureOnly:true,notFullGameOrMultiGbTransfer:true,gpu,cases,errors,requests,before,after};
  await mkdir(output,{recursive:true});await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(context)await context.close();if(browser)await closePwBrowser();await new Promise(done=>server.close(done));
  if(!report.ok)process.exitCode=1;
}
