import { chromium } from 'playwright';

const base=process.argv[2]||'http://127.0.0.1:8974/';
const browser=await chromium.launch({headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:412,height:915},hasTouch:true});
await page.addInitScript(()=>localStorage.setItem('mf_auth_gate_v1','1'));
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('ERR_NETWORK_ACCESS_DENIED'))errors.push(m.text());});
await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForFunction(()=>typeof gl!=='undefined'&&!!gl,{timeout:30000});
await page.waitForTimeout(5000);
const result=await page.evaluate(()=>({
  v2Diagnostic:typeof window.__mfMaterialV2,
  v2Overlay:!!document.getElementById('mf2LabUI'),
  v2Program:typeof mf2Prog==='undefined'?'not-loaded':mf2Prog===null?'unallocated':'allocated',
  authoredPayloadRequests:performance.getEntriesByType('resource').filter(e=>e.name.includes('material-v2-tank')).length,
  shaderErrors:typeof GL_PROG_ERRORS==='undefined'?[]:GL_PROG_ERRORS.slice(),
  contextLost:gl.isContextLost()
}));
await browser.close();
console.log(JSON.stringify({errors,result},null,2));
if(errors.length||result.v2Diagnostic!=='undefined'||result.v2Overlay||result.v2Program!=='unallocated'||result.authoredPayloadRequests!==0||
   result.shaderErrors.length||result.contextLost)process.exit(1);
