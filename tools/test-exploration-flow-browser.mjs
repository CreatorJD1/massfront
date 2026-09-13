import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
const output=new URL('../tmp/exploration-flow/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await launchPwBrowser();let page;const errors=[],results=[];
try{
  page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true});page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8991/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.ready);await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);
  const gpu=await assertHardwareGpu(page);await page.click('#btnUgaCommand');await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.commandScene?.loaded);
  // Component integration on the real authored scene. Host callbacks are
  // recorded, not production actions; debrief branch is tested separately.
  await page.evaluate(async()=>{
    const {createUgaCommand}=await import('./src/ui/uga_command.js');const catalog=await import('./src/domain/catalog.js');
    const mount=document.querySelector('#ugaCommandMount');mount.replaceChildren();window.__flowRoutes=[];
    window.__flowUi=createUgaCommand({container:mount,visible:true,getState:()=>window.__MASSFRONT_SPACE__.getState(),getCatalog:()=>catalog,onDistrictFocus:id=>window.__MASSFRONT_SPACE__.commandScene.focusDistrict(id),onHostRoute:id=>window.__flowRoutes.push(id)});
    window.__flowUi.openView('return-services');window.__MASSFRONT_SPACE__.commandScene.focusDistrict('command',false);
  });
  for(const [name,size] of Object.entries({portrait:{width:412,height:900},landscape:{width:900,height:412}})){
    await page.setViewportSize(size);await page.evaluate(()=>window.__flowUi.openView('return-services'));await page.waitForTimeout(1000);
    await page.locator('[data-return-services]').waitFor();
    await page.screenshot({path:fileURLToPath(new URL(`return-services-${name}.png`,output))});
    await page.locator('[data-return-services] [data-host-route="development"]').click();
    await page.locator('[data-return-services] [data-host-route="armory"]').click();
    await page.locator('[data-return-services] [data-district="engineering"]').click();await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(()=>window.__MASSFRONT_SPACE__.commandScene.selectedDistrictId),'engineering');
    await page.evaluate(()=>window.__flowUi.openView('logistics'));
    assert((await page.locator('.uga-context-panel').innerText()).includes('Development screen'));
    await page.locator('.uga-context-panel [data-host-route="development"]').click();
    results.push({viewport:name,serviceRoutes:'development,armory',upgradeRoom:'engineering',craftingRoute:'development'});
  }
  assert.deepEqual(await page.evaluate(()=>window.__flowRoutes),['development','armory','development','development','armory','development']);assert.deepEqual(errors,[]);
  const hashes={};for(const file of ['modules/space_exploration/src/space_experience.js','modules/space_exploration/src/ui/uga_command.js','modules/space_exploration/src/ui/uga_command.css'])hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
  await writeFile(new URL('report.json',output),JSON.stringify({time:new Date().toISOString(),gpu,hashes,results,errors,scope:'Actual browser component navigation; host callbacks recorded, no production mutation'},null,2));
  console.log('PASS return-service buttons, authored Engineering room navigation, crafting route and portrait/landscape layout');
}finally{await page?.close();await closePwBrowser();}
