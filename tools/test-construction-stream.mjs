/* Focused regression for SupCom-style streamed structure construction.
   Usage: node tools/test-construction-stream.mjs [local URL] */
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const url=process.argv.find(a=>/^https?:\/\//.test(a))||'http://127.0.0.1:8100/';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const browser=await launchPwBrowser({headless:true,executablePath:chrome,
  args:['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--enable-gpu','--disable-gpu-sandbox','--disable-software-rasterizer']});
try{
  const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>{try{
    localStorage.clear();localStorage.setItem('mf_prealpha_cinematic_v2','test-seen');localStorage.setItem('mf_auth_gate_v1','1');
  }catch(e){}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof beginBuild==='function'&&typeof bldTick==='function'&&
    typeof resetWorld==='function'&&BT&&BT.pgen&&heightF&&PASS,null,{timeout:60000});
  const result=await page.evaluate(()=>{
    resetWorld();
    const T=BT.pgen,startM=T.cm+100,startE=T.ce+100;
    resM[0]=startM;resE[0]=startE;
    const B=beginBuild(0,'pgen',420,420,0);
    const escrow={m:startM-resM[0],e:startE-resE[0],prog:B.prog};
    resM[0]=0;resE[0]=0;
    bldTick(1);
    const stalled={prog:B.prog,flag:B.buildStalled,paidM:B.buildPaidM,paidE:B.buildPaidE};
    resM[0]=T.cm*2;resE[0]=T.ce*2;
    let steps=0;while(B.prog<1&&steps++<240)bldTick(.25);
    return {cost:{m:T.cm,e:T.ce},escrow,stalled,finished:{prog:B.prog,flag:B.buildStalled,
      paidM:B.buildPaidM,paidE:B.buildPaidE,steps},invalidType:beginBuild(0,'missing_type',0,0,0)};
  });
  assert(Math.abs(result.escrow.m-result.cost.m*.02)<.0001&&Math.abs(result.escrow.e-result.cost.e*.02)<.0001,
    'site escrow is not 2%: '+JSON.stringify(result));
  assert(result.stalled.flag&&result.stalled.prog===result.escrow.prog,
    'unfunded construction advanced: '+JSON.stringify(result));
  assert(result.finished.prog===1&&!result.finished.flag&&
    Math.abs(result.finished.paidM-result.cost.m)<.001&&Math.abs(result.finished.paidE-result.cost.e)<.001,
    'completed site did not stream its exact full cost: '+JSON.stringify(result));
  assert(result.invalidType===null&&errors.length===0,'invalid type or page errors: '+JSON.stringify({result,errors}));
  console.log(JSON.stringify({ok:true,result},null,2));
}finally{await browser.close();}
