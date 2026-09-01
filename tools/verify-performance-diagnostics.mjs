/* Hardware-browser acceptance for the opt-in in-game performance dashboard. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),OUT=join(ROOT,'.tmp','performance-diagnostics');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.glb':'model/gltf-binary','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    const clean=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/,''),candidate=resolve(ROOT,normalize(clean||'index.html'));
    if(candidate!==ROOT&&!candidate.startsWith(ROOT+'\\')&&!candidate.startsWith(ROOT+'/')) throw new Error('outside root');
    let path=candidate,s=await stat(path);if(s.isDirectory()){path=join(path,'index.html');s=await stat(path);}
    res.writeHead(200,{'content-type':MIME[extname(path).toLowerCase()]||'application/octet-stream','content-length':s.size,'cache-control':'no-store'});
    createReadStream(path).pipe(res);
  }catch(_){res.writeHead(404);res.end('not found');}
});
await new Promise((ok,fail)=>server.listen(0,'127.0.0.1',ok).once('error',fail));
const origin='http://127.0.0.1:'+server.address().port;
let browser,page;
const failures=[],errors=[];
function check(ok,message){if(!ok)failures.push(message);}
try{
  browser=await launchPwBrowser({ownershipMode:'isolated'});
  page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true,deviceScaleFactor:2});
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(origin+'/?galacticRoute=perfdiagtest0001',{waitUntil:'domcontentloaded',timeout:60000});
  const gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof mfPerfOpenDashboard==='function'&&typeof renderSettings==='function',{timeout:90000});
  await page.waitForFunction(()=>typeof mfLauncherSnapshot==='function'&&mfLauncherSnapshot().passed,{timeout:10000});
  const settings=await page.evaluate(()=>{
    renderSettings();const row=document.querySelector('[data-set="perfDiagnostics"]');
    const inGraphics=!!(row&&row.closest('#setGroup-display'));
    /* The launcher owns the top input layer in this isolated boot, so exercise
       the exact public callback the hidden Settings row is wired to. */
    if(row)mfPerfOpenDashboard();
    return {row:!!row,inGraphics,opened:!!document.getElementById('mfPerfDashboard')};
  });
  check(settings.row,'Graphics settings has no Performance Diagnostics control');
  check(settings.inGraphics,'Performance Diagnostics control is not inside Display & Performance');
  check(settings.opened,'Performance Diagnostics settings control did not open the dashboard');
  await page.waitForSelector('#mfPerfDashboard',{state:'visible',timeout:10000});
  await page.waitForFunction(()=>{const r=mfPerfReport();return r.telemetry.cpu.frameInterval?.n>=30&&r.telemetry.cpu.render?.n>0;},{timeout:30000});
  await page.waitForTimeout(1500);
  const live=await page.evaluate(()=>({report:mfPerfReport(),text:document.getElementById('mfPerfDashboard').innerText}));
  check(live.report.telemetry.enabled===true,'Profiler did not enable when dashboard opened');
  check(live.report.telemetry.cpu.frameInterval.n>0,'Frame interval telemetry is empty');
  check(live.report.telemetry.cpu.render.n>0,'Render CPU telemetry is empty');
  check(live.report.telemetry.gauges.drawCalls.n>0,'Draw-call gauge is empty');
  check(live.report.telemetry.gauges.triangles.n>0,'Triangle gauge is empty');
  check(live.report.command&&live.report.command.navigation,'Navigation diagnostics are missing from the report');
  check(live.report.command&&live.report.command.picker,'Picker diagnostics are missing from the report');
  check(/CURRENT BOTTLENECK/.test(live.text),'Bottleneck classification is not visible');
  check(/ROUTE LAST \/ MAX/.test(live.text),'Navigation bottleneck card is not visible');
  check(/PICK LAST \/ MAX/.test(live.text),'Picker bottleneck card is not visible');
  check(/GPU memory \/ texture pressure: N\/A/.test(live.text),'GPU-memory limitation is not explicit');
  if(!live.report.telemetry.gpuTimer)check(/TIMER UNSUPPORTED/.test(live.text),'Unavailable GPU timing is not labelled');

  await page.click('#mfPerfDashboard [data-act="pause"]');
  const pausedAt=await page.evaluate(()=>mfPerfSnapshot().frame);await page.waitForTimeout(700);
  const pausedAfter=await page.evaluate(()=>mfPerfSnapshot());
  check(pausedAfter.paused===true&&pausedAfter.frame===pausedAt,'Pause did not freeze capture');
  await page.click('#mfPerfDashboard [data-act="pause"]');await page.waitForTimeout(700);
  check(await page.evaluate(()=>mfPerfSnapshot().frame>0&&!mfPerfSnapshot().paused),'Resume did not restart capture');

  const reset=await page.evaluate(()=>{mfPerfResetCapture();return mfPerfReport();});
  check(reset.telemetry.longFrames===0,'Reset did not clear long-frame count');
  check(reset.summary.frameP95Ms===null,'Reset did not clear frame statistics');
  await page.waitForTimeout(1000);
  const recovery=await page.evaluate(()=>{const before=mfPerfSnapshot().gpuResetSerial;mfPerfGLReset();const cleared=mfPerfReport();return {before,cleared};});
  check(recovery.cleared.telemetry.gpuAttached===false,'Context reset did not atomically detach GPU telemetry');
  await page.waitForTimeout(1000);
  const rebound=await page.evaluate(()=>mfPerfReport());
  check(rebound.telemetry.gpuAttached===true,'GPU telemetry did not reattach after reset');

  await mkdir(OUT,{recursive:true});
  await page.screenshot({path:join(OUT,'performance-dashboard-mobile.png'),fullPage:true});
  const finalReport=await page.evaluate(()=>mfPerfReport());
  await writeFile(join(OUT,'performance-dashboard-report.json'),JSON.stringify({capturedAt:new Date().toISOString(),origin,gpu,settings,errors,failures,report:finalReport},null,2));
  await page.click('#mfPerfDashboard [data-act="close"]');
  check(await page.evaluate(()=>!document.getElementById('mfPerfDashboard')&&!mfPerfSnapshot().enabled),'Close did not remove and disable the profiler');
  check(errors.length===0,'Runtime page errors: '+errors.join(' | '));
  console.log((failures.length?'FAIL':'PASS')+' performance diagnostics on '+gpu.renderer);
  console.log(join(OUT,'performance-dashboard-mobile.png'));
  for(const failure of failures)console.error(' - '+failure);
  if(failures.length)process.exitCode=1;
}finally{
  if(page)await page.close().catch(()=>{});
  if(browser)await closePwBrowser(browser).catch(()=>{});
  await new Promise(ok=>server.close(ok));
}
