#!/usr/bin/env node
/* Strategic-icon request hygiene gate.
   Boots the unflagged normal game URL, then takes the real lazy strategic-icon
   renderer path.  A successful run proves the faction sheet still uploads and
   no request is made for the deliberately retired legacy tacticons.png path.
*/
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PW_CDP_PORT ||= '9499'; // dedicated; do not share the probe ports
const { launchPwBrowser, closePwBrowser } = await import('./pw-browser.mjs');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const outDir=join(root,'.tmp','tacticon-request-hygiene');
await mkdir(outDir,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav',
  '.glb':'model/gltf-binary','.webmanifest':'application/manifest+json','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent((req.url||'/').split('?')[0]); if(p==='/') p='/index.html';
    const file=resolve(join(root,p));
    if(!file.startsWith(root)||!existsSync(file)){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(file));
  }catch(e){res.writeHead(500);res.end('server error');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;

const checks=[]; let failures=0;
function check(name,pass,evidence){
  checks.push({name,pass:!!pass,evidence}); if(!pass) failures++;
  console.log((pass?'PASS ':'FAIL ')+name+'  '+JSON.stringify(evidence));
}
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await launchPwBrowser({
  executablePath:existsSync(chrome)?chrome:undefined,headless:true,
  args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']
});
let fatal=null;
try{
  const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:1,colorScheme:'dark'});
  const errors=[], missing=[], requests=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  page.on('console',m=>{if(m.type()==='error') errors.push('console: '+m.text());});
  page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()===404) missing.push(r.url());});
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){}});
  /* No FX/probe query flags: this is a normal game boot. */
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof render==='function'&&typeof mfIconEnsure==='function'&&
    typeof heightF!=='undefined'&&!!heightF&&!!window.__MF_GL_INFO,null,{timeout:120000});
  const gpu=await page.evaluate(()=>window.__MF_GL_INFO);
  check('normal URL uses hardware WebGL2',!!gpu&&gpu.webgl2===true&&gpu.software===false,gpu);
  /* This is the actual lazy icon-atlas entry point used by render3d at
     strategic zoom, followed by the renderer once with that atlas resident. */
  const icon=await page.evaluate(()=>{
    try{if(typeof apClose==='function') apClose();}catch(e){}
    try{if(typeof stopAttract==='function') stopAttract();}catch(e){}
    try{matchLive=true;running=true;paused=true;fogOn=false;}catch(e){}
    try{orthoSpan=distTarget=SPAN_MAX;if(typeof camUpdateMatrices==='function')camUpdateMatrices();}catch(e){}
    const made=mfIconEnsure();
    try{render(1/60);}catch(e){}
    return {made,atlas:typeof MFTiers==='object'&&MFTiers.atlas?MFTiers.atlas():null,
      fac:typeof MFTiers==='object'&&MFTiers.fac?MFTiers.fac():null};
  });
  await page.waitForTimeout(650);
  const iconFinal=await page.evaluate(()=>({atlas:MFTiers.atlas(),fac:MFTiers.fac(),last:MFTiers.last()}));
  await page.screenshot({path:join(outDir,'normal-strategic-icon-atlas.png'),type:'png'});
  const legacy=/\/assets\/textures\/ui\/tacticons\.png(?:[?#]|$)/i;
  const faction=/\/assets\/textures\/ui\/tacticons-faction\.png(?:[?#]|$)/i;
  const legacyReq=requests.filter(u=>legacy.test(u));
  const factionReq=requests.filter(u=>faction.test(u));
  check('normal strategic icon path creates the atlas',!!icon.made&&!!(iconFinal.atlas&&iconFinal.atlas.tex),
    {initial:icon,final:iconFinal});
  check('no legacy tacticons.png request is made',legacyReq.length===0,legacyReq);
  check('faction tacticon sheet remains the only authored request',factionReq.length===1,factionReq);
  check('normal boot/canvas path has no 404 response',missing.length===0,missing);
  check('normal boot/canvas path has no console or page error',errors.length===0,errors);
  await page.close();
  await writeFile(join(outDir,'report.json'),JSON.stringify({when:new Date().toISOString(),origin,gpu,
    checks,requests,missing,errors,icon,iconFinal},null,2));
}catch(e){
  fatal=String(e&&e.stack||e); check('verifier completed',false,fatal);
  await writeFile(join(outDir,'report.json'),JSON.stringify({when:new Date().toISOString(),origin,checks,fatal},null,2));
}finally{
  await closePwBrowser().catch(()=>{});
  await new Promise(done=>server.close(done));
}
process.exit(failures?1:0);
