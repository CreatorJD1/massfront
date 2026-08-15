import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';
import {mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'releases','audio-radio','command-radio-mobile.png');
const base=(process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100').replace(/\/$/,'');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(dirname(out),{recursive:true});
const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?audioRadioCapture=1',{waitUntil:'domcontentloaded'});
  await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof radioAck==='function'&&typeof resetWorld==='function'&&typeof spawnUnit==='function',{timeout:30000});
  await page.evaluate(()=>{
    try{localStorage.setItem('massfront_tutorial_complete','1');}catch(e){}
    stopAttract(); resetWorld(); demoMode=true; matchLive=true; running=true; paused=true; fogOn=false;
    carrier.active=false; carrier.phase=2; document.body.className='';
    for(const el of [...document.body.children]) if(el.id!=='gl'&&el.id!=='grade'&&el.id!=='vignette'&&
      !['topbar','heroBar','cmdbar','minimapWrap','selInfo','goalBar','radioAck','toast','coach','unitCard','wcRow','infMeter','flash','selbox'].includes(el.id)) el.style.display='none';
    cv.style.display='block'; camUpdateMatrices();
    const cx=MAP*.47,cy=MAP*.48; cam.x=cx;cam.y=cy;orthoSpan=720;distTarget=720;
    addBld('hq',0,cx-55,cy+22,true,0);
    for(let k=0;k<7;k++){const i=spawnUnit(k%2?1:0,0,cx-110+(k%4)*34,cy+100+((k/4)|0)*35);usel[i]=1;}
    updateSelInfo(); radioAck('attack',7,cx+145,cy-55);
  });
  await page.waitForTimeout(650);
  await page.screenshot({path:out});
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(out);
}finally{await browser.close();}
