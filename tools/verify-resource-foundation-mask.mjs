/* Real-GPU regression: resource veins remain visible around, never through,
   a newly deployed foundation. */
import {launchPwBrowser} from './pw-browser.mjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=8967,url=`http://127.0.0.1:${port}/`;
const out=join(root,'.tmp','resource-foundation-mask');
await mkdir(out,{recursive:true});
/* Verify the exact packed runtime. Serving the repository root exercises the
   development shell, whose deferred source loader may not finish before the
   probe timeout and is not what Android/HF ship. */
const server=spawn('python',['-m','http.server',String(port),'--directory',join(root,'www')],{stdio:'ignore',windowsHide:true});
for(let i=0;i<40;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
const browser=await launchPwBrowser({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:900,height:900},deviceScaleFactor:2,colorScheme:'dark'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{try{
    localStorage.setItem('mf_ap_gate_closed','1');localStorage.setItem('mf_ap_dismissed','1');
    localStorage.setItem('mf_offline','1');localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');
    localStorage.setItem('mf_auth_gate_v1','1');
  }catch{}});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  try{
    await page.waitForFunction(()=>typeof resetWorld==='function'&&typeof addBld==='function'&&
      typeof foundationRect==='function',{timeout:120000});
  }catch(e){
    throw new Error('runtime readiness timeout; page errors: '+JSON.stringify(errors));
  }
  const result=await page.evaluate(()=>{
    if(typeof stopAttract==='function')stopAttract();
    if(typeof apGateSatisfied==='function')apGateSatisfied();
    running=false;paused=true;demoMode=true;fogOn=false;matchLive=false;playerFaction='nova';
    hideFrontScreens();applyTheme();newSkirmish();paused=true;
    document.querySelectorAll('.overlay,#dispatch,#gameOver,#levelUp,#mfPreAlphaIntro,#tutorialCoach,#tutorialBrief').forEach(e=>e.style.display='none');
    const ap=document.getElementById('apOverlay');if(ap)ap.style.setProperty('display','none','important');
    document.body.classList.remove('menuMode');
    const D=deposits.find(d=>!d.taken)||deposits[0],k=TS/MAP,cx=D.x*k,cy=D.y*k;
    const ctx=terrainCanvas.getContext('2d',{willReadFrequently:true});
    const measure=(fr)=>{
      const rad=Math.ceil(100*k),x0=Math.max(0,Math.floor(cx-rad)),y0=Math.max(0,Math.floor(cy-rad));
      const w=Math.min(TS-x0,rad*2+1),h=Math.min(TS-y0,rad*2+1),p=ctx.getImageData(x0,y0,w,h).data;
      let inScore=0,inN=0,inHot=0,outScore=0,outN=0,outHot=0;
      const hw=(fr?fr[0]*.42:32)*k,hh=(fr?fr[1]*.42:32)*k;
      const out0=Math.max(hw,hh)+5*k,out1=82*k;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const dx=x+x0-cx,dy=y+y0-cy,d=Math.hypot(dx,dy),o=(y*w+x)*4;
        const score=Math.max(0,p[o+2]-p[o]-5)+Math.max(0,p[o+1]-p[o]-5);
        if(Math.abs(dx)<hw&&Math.abs(dy)<hh){inScore+=score;inN++;if(score>22)inHot++;}
        else if(d>out0&&d<out1){outScore+=score;outN++;if(score>22)outHot++;}
      }
      return {inside:inScore/Math.max(1,inN),insideHot:inHot/Math.max(1,inN),
        outside:outScore/Math.max(1,outN),outsideHot:outHot/Math.max(1,outN)};
    };
    const probe={type:'mex',rot:0},fr=foundationRect(probe),before=measure(fr);
    const B=addBld('mex',0,D.x,D.y,false,0),after=measure(fr);
    cam.x=D.x;cam.y=D.y;camFollow=-1;camYaw=yawTarget=.58;camPitch=pitchTarget=1.16;
    orthoSpan=distTarget=430;if(typeof clampCam==='function')clampCam();if(typeof camUpdateMatrices==='function')camUpdateMatrices();
    running=false;paused=true;document.getElementById('startScreen').style.display='none';
    return {node:[D.x,D.y],foundation:fr,before,after,building:{type:B.type,dep:B.dep,prog:B.prog}};
  });
  /* Save the authoritative macro terrain directly. Chrome screenshots can
     block behind a busy compositor on large D3D11 canvases; the CPU terrain
     is the exact surface whose foundation exclusion this regression checks. */
  const terrainPng=await page.evaluate(()=>terrainCanvas.toDataURL('image/png').split(',')[1]);
  await writeFile(join(out,'resource-foundation-mask.png'),Buffer.from(terrainPng,'base64'));
  const erased=result.after.insideHot<=Math.max(.006,result.before.insideHot*.35);
  const exposed=result.after.outsideHot>=.002&&result.after.outside>=result.after.inside*1.35;
  if(!erased||!exposed||errors.length)throw new Error(JSON.stringify({erased,exposed,errors,result},null,2));
  console.log(JSON.stringify({ok:true,renderer:await page.evaluate(()=>window.__MF_GL_INFO&&window.__MF_GL_INFO.renderer),...result},null,2));
}finally{await browser.close();server.kill();}
