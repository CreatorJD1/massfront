/* Smoke-test the public cloud build at an iPhone-sized touch viewport.
   Usage: node tools/test-cloud-playtest.mjs [URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import {mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const url=process.argv.find(a=>/^https?:\/\//.test(a))||
  'https://creatorjd-massfront-playtest.static.hf.space/';
const local=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(url);
const out=join(root,'releases',local?'v1.32.0-local-web-mobile.png':'cloud-playtest-iphone.png');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(join(root,'releases'),{recursive:true});

const browser=await launchPwBrowser({
  headless:true,
  executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']
});

let context=null,page=null;
const pageErrors=[],failed=[];
try{
  context=await browser.newContext({
    viewport:{width:393,height:852},
    deviceScaleFactor:2,
    hasTouch:true,
    isMobile:true,
    colorScheme:'dark'
  });
  page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('requestfailed',r=>{
    const error=r.failure()?.errorText||'failed',requestUrl=r.url();
    /* Same-tab entry can cancel the launch document's capability request when
       the browser commits the integrated Galactic document. */
    if(/\/modules\/space_exploration\/index\.html(?:[?#]|$)/.test(requestUrl)&&error==='net::ERR_ABORTED')return;
    failed.push(requestUrl+': '+error);
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&typeof render==='function'&&
    typeof TYPES!=='undefined'&&typeof BT!=='undefined',{timeout:60000});
  await page.waitForTimeout(2500);
  /* The launcher is now the intentional boot gateway. Exercise the same
     signed-out/offline route a player uses instead of treating the hidden
     legacy start screen behind it as a boot failure. */
  const introStart=page.locator('#mfIntroStart');
  const accountOffline=page.locator('#apOfflineBtn');
  const launcherPrimary=page.locator('#mfLaunchPlay');
  const launcherOffline=page.locator('#mfLaunchOffline');
  let introClicks=0,accountClicks=0,launcherClicks=0,gateState=null,reloaded=false;
  const consoleTail=[];
  page.on('console',m=>{consoleTail.push(m.type()+': '+m.text());if(consoleTail.length>40)consoleTail.shift();});
  /* The integrated Galactic document can own the launcher from a child frame;
     poll every frame and return whichever exposes the launcher snapshot. */
  const gateProbe=async()=>{
    for(const frame of page.frames()){
      try{
        const s=await frame.evaluate(()=>{
          const shown=id=>{const el=document.getElementById(id);return !!(el&&getComputedStyle(el).display!=='none'&&
            getComputedStyle(el).visibility!=='hidden'&&!el.hidden&&el.getAttribute('aria-hidden')!=='true');};
          const snap=typeof window.mfLauncherSnapshot==='function'?window.mfLauncherSnapshot():null;
          return {intro:shown('mfIntroStart')&&shown('mfPreAlphaIntro'),account:shown('apOfflineBtn'),
            primary:shown('mfLaunchPlay')&&!document.getElementById('mfLaunchPlay').disabled,
            offline:shown('mfLaunchOffline')&&!document.getElementById('mfLaunchOffline').disabled,
            start:shown('startScreen'),passed:!!(snap&&snap.passed),snapshot:snap};
        });
        if(s.snapshot||s.intro||s.account||s.primary||s.offline||s.start)return s;
      }catch{} // detached or about:blank frames
    }
    return {intro:false,account:false,primary:false,offline:false,start:false,passed:false,snapshot:null};
  };
  const gateFrames=()=>page.frames().map(f=>(f===page.mainFrame()?'main: ':'child: ')+f.url().slice(0,120));
  /* 45s was measured against a warm CDN. A cold hf.space edge can take over
     a minute to serve the first boot's asset wave; the launcher itself is
     fast once bytes arrive. Budget the cold case, not the warm one. */
  const gateStart=Date.now();
  const gateDeadline=gateStart+120000;
  while(Date.now()<gateDeadline){
    gateState=await gateProbe();
    if(gateState.start&&gateState.passed)break;
    if(/\/modules\/space_exploration\//.test(page.mainFrame().url()))break; // PLAY committed the integrated doc
    /* A cold first fetch can stall permanently with no failed request: globals
       half-load and the launcher script never defines its snapshot. One reload
       rides the now-warm cache; the launcher is fast the second time. */
    if(!gateState.snapshot&&Date.now()-gateStart>30000&&!reloaded){
      reloaded=true;
      await page.reload({waitUntil:'domcontentloaded',timeout:60000});
      continue;
    }
    if(gateState.account&&accountClicks<2){accountClicks++;await accountOffline.click();await page.waitForTimeout(250);continue;}
    if(gateState.intro&&introClicks<2){introClicks++;await introStart.click();await page.waitForTimeout(250);continue;}
    if((gateState.primary||gateState.offline)&&launcherClicks<2){
      /* Update-state delivery can change the launch action in the same task
         that enables it. Let that render settle, then verify the resulting
         launcher state before allowing one explicit retry. */
      launcherClicks++;await page.waitForTimeout(120);
      if(await launcherPrimary.isVisible()&&await launcherPrimary.isEnabled())await launcherPrimary.click();
      else if(await launcherOffline.isVisible()&&await launcherOffline.isEnabled())await launcherOffline.click();
      await page.waitForTimeout(250);continue;
    }
    await page.waitForTimeout(250);
  }
  /* PLAY on the integrated build same-tab navigates the top window to the
     Galactic command document; the classic startScreen only returns for
     classic-flow boots. Either handoff is a successful player boot. The
     commit is still mid-flight when the gate breaks, so settle first. */
  await page.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(2500);
  let handoff='none';
  if(gateState&&gateState.start&&gateState.passed) handoff='classic';
  else{
    for(const frame of page.frames()){
      if(!/\/modules\/space_exploration\//.test(frame.url()))continue;
      try{
        const s=await frame.evaluate(()=>({
          nav:!!document.querySelector('.uga-command-nav'),
          canvas:!!document.querySelector('canvas'),
          textLen:(document.body.innerText||'').length}));
        if(s.nav||(s.canvas&&s.textLen>40)){handoff='galactic';break;}
      }catch{}
    }
  }
  if(handoff==='none'){
    const tail=consoleTail.slice(-12).join(' | ');
    throw new Error('launcher did not hand off to main menu after '
      +Math.round((Date.now()-gateStart)/1000)+'s '+JSON.stringify(gateState)
     +'\nframes: '+gateFrames().join(' ; ')+'\nconsole tail: '+tail);
  }
  /* The skip overlay belongs to the classic flow. On the galactic path an
     unverified extra click between the handoff scan and state collection can
     disturb a document that is still settling. */
  if(handoff==='classic'){
    const onboardingSkip=page.locator('#mfOnboardingSkip');
    try{ if(await onboardingSkip.isVisible()) await onboardingSkip.click(); }catch{}
  }
  const state=handoff==='classic'
    ?await page.evaluate(() => ({
      version:String(APP_VERSION),
      webgl2:!!document.querySelector('#gl')?.getContext('webgl2'),
      units:TYPES.length,
      buildings:Object.keys(BT).length,
      homeVisible:getComputedStyle(document.querySelector('#startScreen')).display!=='none',
      launcherPassed:typeof window.mfLauncherSnapshot==='function'&&!!window.mfLauncherSnapshot().passed,
      manifest:document.querySelector('link[rel="manifest"]')?.href||''
    }))
    :await (async()=>{
      /* Execution contexts die during the commit; retry until the Galactic
         document answers or the attempts run out. Keep the failure reason —
         a silent {} hides whether the frame threw, answered empty, or never
         booted its DOM. */
      const attempts=[];
      for(let attempt=0;attempt<6;attempt++){
        for(const frame of page.frames()){
          if(!/\/modules\/space_exploration\//.test(frame.url()))continue;
          try{
            const s=await frame.evaluate(()=>({
              /* The integrated Galactic document is module-served and does
                 not define the classic bundle's APP_VERSION global. */
              version:(()=>{try{return String(APP_VERSION)}catch{return ''}})(),
              webgl2:(()=>{const c=document.querySelector('canvas');return !!(c&&c.getContext('webgl2'));})(),
              hubNav:!!document.querySelector('.uga-command-nav'),
              textLen:(document.body.innerText||'').length}));
            if(s.hubNav||s.webgl2||s.textLen>40)
              return {...s,units:-1,buildings:-1,homeVisible:false,launcherPassed:false,manifest:''};
            attempts.push(JSON.stringify(s));
          }catch(e){attempts.push('ERR ' + String(e).replace(/\s+/g,' ').slice(0,120));}
        }
        await page.waitForTimeout(3000);
      }
      globalThis.__galacticAttempts=attempts;
      return {};
    })();
  await page.screenshot({path:out,fullPage:false});
  if(pageErrors.length) throw new Error('page errors:\n'+pageErrors.join('\n'));
  if(failed.length) throw new Error('failed requests:\n'+failed.join('\n'));
  const bootOk=handoff==='classic'
    ?(state.webgl2&&state.homeVisible&&state.launcherPassed)
    :(state.webgl2||state.hubNav);
  if(!bootOk) throw new Error('invalid boot state '+JSON.stringify(state)
    +'\nframes: '+gateFrames()
    +(globalThis.__galacticAttempts?'\ngalactic attempts: '+globalThis.__galacticAttempts.join(' ; '):''));
  console.log(JSON.stringify({handoff,...state,screenshot:out},null,2));
}catch(error){
  const failureOut=join(root,'releases',local?'local-web-mobile-failure.png':'cloud-playtest-iphone-failure.png');
  if(page)await page.screenshot({path:failureOut,fullPage:false}).catch(()=>{});
  console.error(JSON.stringify({url,pageErrors,failed,failureScreenshot:failureOut},null,2));
  throw error;
}finally{
  await browser.close();
}
