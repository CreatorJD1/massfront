import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,extname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {inspectPng} from './evidence-foundation/png-evidence.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=join(ROOT,'.tmp','menu-hud-isolation');
const ENTRY=join(ROOT,'index.html');
await mkdir(OUT,{recursive:true});

const mime={'.css':'text/css','.html':'text/html','.js':'text/javascript','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url||'/', 'http://127.0.0.1').pathname);
    const file=pathname==='/'||pathname==='/index.html'?ENTRY:resolve(ROOT,'.'+pathname);
    const rel=relative(ROOT,file);
    if(rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(file);
    res.writeHead(200,{'content-type':mime[extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
    res.end(bytes);
  }catch(error){res.writeHead(404);res.end(String(error.message||error));}
});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const url=`http://127.0.0.1:${server.address().port}/`;
const screenshot=join(OUT,'menu-hud-isolation-412x900-dpr3.png');
const report={schema:'massfront.menu-hud-isolation.v1',capturedAt:new Date().toISOString(),url,
  viewport:{width:412,height:900,deviceScaleFactor:3},errors:[],failedRequests:[]};
for(const file of ['src/ui/hudflow.js','src/styles/ui.css','dist/massfront.html'])
  report[file]=createHash('sha256').update(await readFile(join(ROOT,file))).digest('hex');

const browser=await launchPwBrowser({ownershipMode:'isolated',headless:true});
try{
  const page=await browser.newPage({viewport:{width:412,height:900},deviceScaleFactor:3,hasTouch:true,isMobile:true});
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('requestfailed',request=>report.failedRequests.push({url:request.url(),error:request.failure()?.errorText||''}));
  await page.route('**/*',route=>{
    const requestUrl=route.request().url();
    if(/^(?:data|blob):/.test(requestUrl))return route.continue();
    const host=new URL(requestUrl).hostname;
    return host==='127.0.0.1'||host==='localhost'?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>typeof mfFlowLayout==='function'&&typeof mfFlowFrontOpen==='function',null,{timeout:90000});
  report.gpu=await assertHardwareGpu(page);
  report.state=await page.evaluate(()=>{
    for(const id of typeof FRONT_SCREEN_IDS!=='undefined'?FRONT_SCREEN_IDS:[]){
      const el=document.getElementById(id);if(el)el.style.display='none';
    }
    for(const id of ['mfBootCover','bootCover','mfPreAlphaIntro'])document.getElementById(id)?.remove();
    for(const id of ['apOverlay','apConfirmOverlay','accDlg','dispatch','loadScr','updScr','pauseOverlay','gameOver','levelUp']){
      const el=document.getElementById(id);if(el){el.hidden=true;el.style.display='none';}
    }
    const start=document.getElementById('startScreen');
    start.hidden=false;start.removeAttribute('aria-hidden');start.style.removeProperty('display');start.scrollTop=0;
    document.body.classList.add('mfIntroDone');
    document.body.classList.remove('menuMode','mfMenuOpen','mfIntroOpen','mfLauncherGate','uiPanelOpen','uiPrimaryOpen','uiPlacing');
    document.body.dataset.frontScreen='startScreen';

    const surfaceDisplays={topbar:'flex',cmdbar:'flex',unitCard:'block',selInfo:'flex',buildMenu:'block',prodMenu:'block',bldMenu2:'block',placeUI:'flex'};
    const selInfo=document.getElementById('selInfo');
    if(selInfo)selInfo.innerHTML='<span class="selIntelCopy"><b>SELECTED FORCE</b><span>Combat selection</span></span>';
    const title=document.getElementById('bp_title');if(title)title.textContent='RESEARCH COMPLEX · LV1';
    const repair=document.getElementById('bp_repair');
    if(repair){repair.textContent='REPAIRING';repair.dataset.state='under-fire';}
    for(const [id,display] of Object.entries(surfaceDisplays)){
      const el=document.getElementById(id);if(el){el.hidden=false;el.style.display=display;}
    }
    const computed=id=>getComputedStyle(document.getElementById(id)).display;
    const before=Object.keys(surfaceDisplays).map(id=>({id,display:computed(id)}));
    mfFlowLayout();
    const after=Object.keys(surfaceDisplays).map(id=>({id,display:computed(id)}));
    const brand=document.getElementById('menuBrand'),box=brand.getBoundingClientRect();
    const rail=document.getElementById('mfNextUnlockRail'),railBox=rail.getBoundingClientRect();
    const cards=[...rail.querySelectorAll('.mfNextCard')].map(card=>{
      const rect=card.getBoundingClientRect();
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width};
    });
    return {start:{inline:start.style.display,computed:computed('startScreen')},before,after,
      frontOpen:mfFlowFrontOpen(),menuOpen:document.body.classList.contains('mfMenuOpen'),
      brand:{naturalWidth:brand.naturalWidth,naturalHeight:brand.naturalHeight,width:box.width,height:box.height},
      bannerRank:(()=>{const fill=document.getElementById("metaXpFill"),tx=document.getElementById("metaXpTx"),sub=document.getElementById("greetSub");
        return {hasBar:!!fill,hasCount:!!tx,count:tx?(tx.textContent||"").trim():"",rank:sub?(sub.textContent||"").trim():""};})(),
      progressionRail:{viewportWidth:innerWidth,hidden:rail.offsetParent===null||railBox.height<1,
        clientWidth:rail.clientWidth,scrollWidth:rail.scrollWidth,
        rect:{left:railBox.left,right:railBox.right,width:railBox.width},cards}};
  });
  assert.equal(report.state.start.inline,'','regression requires a stylesheet-revealed front screen');
  assert.equal(report.state.start.computed,'flex','start screen is visibly open');
  assert.ok(report.state.before.some(item=>item.display!=='none'),'fixture exposes stale battlefield UI before layout');
  assert.equal(report.state.frontOpen,true,'computed-visible front screen is detected');
  assert.equal(report.state.menuOpen,true,'front screen asserts mfMenuOpen');
  assert.deepEqual(report.state.after.map(item=>item.display),report.state.after.map(()=>'none'),'all combat/build/selection panels are hidden');
  assert.ok(report.state.brand.naturalWidth>=1200&&report.state.brand.width>300,'clean canonical title art remains full-resolution');
  const progression=report.state.progressionRail;
  /* The rank track moved into the commander banner and the arsenal requisition
     card was removed, so this is no longer a paired row: the rail carries a
     conquest track when one exists and collapses when it does not. The
     containment assertions below are the ones that matter and stay - a card
     scrolling off a 412px viewport is why they were written. */
  assert.ok(report.state.bannerRank.hasBar&&report.state.bannerRank.hasCount,
    'the commander banner carries the rank track the rail used to duplicate');
  assert.match(report.state.bannerRank.count,/XP|MAX RANK/,'the banner states experience toward the next rank');
  assert.match(report.state.bannerRank.rank,/ACCOUNT RANK/,'the banner states the account rank');
  assert.ok(progression.hidden||progression.cards.length>=1,
    'the rail must carry a track or be hidden; an empty rail is a gap in the column');
  assert.ok(progression.rect.left>=-.5&&progression.rect.right<=progression.viewportWidth+.5,
    'progression rail stays inside the 412px viewport');
  assert.ok(progression.scrollWidth<=progression.clientWidth+1,'progression rail has no hidden horizontal overflow');
  assert.ok(progression.cards.every(card=>card.left>=progression.rect.left-.5&&card.right<=progression.rect.right+.5),
    'every progression card stays inside the visible rail');
  assert.ok(progression.cards.length<2||Math.abs(progression.cards[0].top-progression.cards[1].top)<1,
    'any two tracks the rail does carry remain a paired row');
  /* The full game keeps animated background layers alive even while the front
     menu owns the screen. DPR3 capture can take longer than Playwright's
     generic 30 s action limit on the hardware-GPU path, so give the evidence
     operation its own bounded budget and freeze CSS animation for one frame. */
  await page.screenshot({path:screenshot,animations:'disabled',timeout:90000});
  const png=await inspectPng(screenshot);
  report.screenshot={path:screenshot,width:png.width,height:png.height,
    sha256:createHash('sha256').update(await readFile(screenshot)).digest('hex')};
  assert.deepEqual([png.width,png.height],[1236,2700],'DPR3 screenshot dimensions');
  assert.deepEqual(report.errors,[],'no page errors');
  report.pass=true;
}catch(error){report.pass=false;report.failure=String(error.stack||error);throw error;}
finally{
  await writeFile(join(OUT,'report.json'),JSON.stringify(report,null,2));
  await closePwBrowser(browser);
  await new Promise(resolveClose=>server.close(resolveClose));
}
console.log('Menu HUD isolation at 412x900 DPR3: PASS');
