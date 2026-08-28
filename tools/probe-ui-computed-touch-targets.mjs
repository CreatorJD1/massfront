#!/usr/bin/env node
/* Measure the actual packaged MASSFRONT controls on the primary phone viewport.
   This is deliberately separate from the static inventory: CSS declarations
   are not accepted as proof until Chromium has laid out the real DOM families. */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'..');
const WWW=join(ROOT,'www');
const OUT=join(ROOT,'tmp','ui-control-safety');
const REPORT=join(OUT,'computed-touch-probe.json');
const SHOT=join(OUT,'phone-412x915-controls.png');
const SHA=value=>createHash('sha256').update(value).digest('hex');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ogg':'audio/ogg','.m4a':'audio/mp4','.wasm':'application/wasm'};

async function hash(path){return SHA(await readFile(path));}

async function main(){
  await mkdir(OUT,{recursive:true});
  const identity={
    hudSha256:await hash(join(ROOT,'src/ui/hud.js')),
    uiCssSha256:await hash(join(ROOT,'assets/ui.css')),
    stylesCssSha256:await hash(join(ROOT,'src/styles/ui.css')),
    packagedHudSha256:await hash(join(WWW,'src/ui/hud.js')),
    packagedUiCssSha256:await hash(join(WWW,'assets/ui.css')),
    packagedStylesCssSha256:await hash(join(WWW,'src/styles/ui.css')),
  };
  identity.packageParity=identity.hudSha256===identity.packagedHudSha256&&identity.uiCssSha256===identity.packagedUiCssSha256&&identity.stylesCssSha256===identity.packagedStylesCssSha256;
  if(!identity.packageParity)throw new Error('PACKAGE_PARITY_REQUIRED: run node tools/pack-www.mjs');

  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
      const file=resolve(join(WWW,pathname==='/'?'index.html':pathname.slice(1)));
      if(!file.startsWith(resolve(WWW))){res.writeHead(403);res.end('forbidden');return;}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
    }catch{res.writeHead(404);res.end('not found');}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
  const address=server.address();
  const url=`http://127.0.0.1:${address.port}/`;
  let browser;
  const pageErrors=[];
  try{
    browser=await launchPwBrowser({
      headless:false,
      executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args:['--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox'],
    });
    const context=await browser.newContext({
      viewport:{width:412,height:915},deviceScaleFactor:1,hasTouch:true,isMobile:true,
      userAgent:'Mozilla/5.0 (Linux; Android 15; SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      colorScheme:'dark',
    });
    const page=await context.newPage();
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.addInitScript(()=>{try{localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');localStorage.setItem('mf_offline','1');}catch{}});
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof addBld==='function'&&typeof renderBuildMenu==='function'&&typeof renderProdMenu==='function'&&typeof hotUtilityToggle==='function'&&typeof showHazChip==='function'&&typeof showWcBanner==='function',{timeout:45000});
    const runtime=await page.evaluate(()=>{
      const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');
      const dbg=gl&&gl.getExtension('WEBGL_debug_renderer_info');
      const renderer=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):(gl?'webgl2-no-debug-info':null);
      try{stopAttract();}catch{}
      resetWorld();attractOn=false;demoMode=false;matchLive=true;running=true;paused=true;gameEnded=false;fogOn=false;heroLvl=99;
      document.body.classList.remove('menuMode','mfMenuOpen','uiPrimaryOpen');
      document.body.classList.add('mfIntroDone');
      const bootCover=document.getElementById('mfBootCover');if(bootCover)bootCover.remove();
      for(const overlay of document.querySelectorAll('.overlay'))overlay.style.display='none';
      const cx=MAP*.5,cy=MAP*.5;
      blds.length=0;
      addBld('techlab',0,cx-100,cy,true,0);
      const factory=addBld('fac',0,cx,cy,true,0);factory.tier=2;factory.queue=[0,0];factory.prodT=1;
      openBld=blds.indexOf(factory);

      const measure=(family,selector)=>{
        const element=document.querySelector(selector);
        if(!element)return {family,selector,status:'FAIL',reason:'missing'};
        const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
        const visible=rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden';
        const width=+rect.width.toFixed(3),height=+rect.height.toFixed(3);
        return {family,selector,width,height,display:style.display,visibility:style.visibility,visible,status:visible&&width>=44&&height>=44?'PASS':'FAIL'};
      };

      const build=document.getElementById('buildMenu'),prod=document.getElementById('prodMenu');
      build.style.display='block';prod.style.display='none';bldTab='eco';renderBuildMenu();
      const results=[measure('build-card','#buildGrid .bcard')];

      build.style.display='none';prod.style.display='block';prodTab='veh';renderProdMenu();renderQueue();
      results.push(measure('production-card','#prodGrid .bcard'));
      results.push(measure('production-queue-cancel','#prodQueue .qPlate'));

      hotUtilityToggle([{kind:'local',em:'◆',nm:'TEST ACTION',ds:'Computed touch target probe',fn:()=>{}}]);
      const utility=document.getElementById('hotUtilityPanel');if(utility)utility.style.display='grid';
      results.push(measure('hot-ability','#hotUtilityPanel .hotUtility'));

      showHazChip();
      const hazard=document.getElementById('hazChip');
      if(hazard){hazard.innerHTML='<span class="hazEm">⚠</span><span class="hazNm">ION STORM</span>';hazard.style.display='flex';}
      results.push(measure('weather-chip','#hazChip'));

      showWcBanner();
      const wildcard=document.getElementById('wcBanner');
      if(wildcard){wildcard.innerHTML='<span class="wcBCount">1 MOD</span><span class="wcBMult">+15%</span>';wildcard.style.display='flex';}
      results.push(measure('wildcard-banner','#wcBanner'));

      if(utility)utility.style.display='none';
      return {renderer,webgl2:!!gl,coarsePointer:matchMedia('(pointer:coarse)').matches,controls:results,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio}};
    });
    await page.screenshot({path:SHOT,fullPage:false});
    const failed=runtime.controls.filter(item=>item.status!=='PASS');
    const report={
      schema:'massfront-ui-computed-touch-probe-v1',generatedAt:new Date().toISOString(),
      source:'packaged-runtime',url,identity,runtime,pageErrors,
      screenshot:{path:SHOT,sha256:await hash(SHOT)},
      summary:{measured:runtime.controls.length,passed:runtime.controls.length-failed.length,failed:failed.length},
      status:identity.packageParity&&runtime.webgl2&&runtime.coarsePointer&&!pageErrors.length&&!failed.length?'PASS':'FAIL',
    };
    await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,summary:report.summary,renderer:runtime.renderer,coarsePointer:runtime.coarsePointer,pageErrors,report:REPORT,screenshot:SHOT},null,2));
    if(report.status!=='PASS')process.exitCode=2;
  }finally{
    if(browser)await closePwBrowser(browser);
    await new Promise(resolveClose=>server.close(resolveClose));
  }
}

main().catch(error=>{console.error('UI_COMPUTED_TOUCH_PROBE_FAILED: '+(error.stack||error.message));process.exit(1);});
