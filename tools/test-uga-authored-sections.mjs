import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';
import { assertHardwareGpu } from './chrome-gpu.mjs';

const base = process.env.MF_SPACE_URL || 'http://127.0.0.1:8991/';
const packaged=process.env.MF_UGA_PACKAGED==='1';
const run=process.env.MF_UGA_VERIFY_RUN||`shared-${new Date().toISOString().replace(/[:.]/g,'-')}`;
if(!/^[a-zA-Z0-9-]+$/.test(run))throw Error('Invalid verification run label');
const output = new URL(`../tmp/uga-authored-sections/${run}/`, import.meta.url);
const assetRoot='modules/space_exploration/assets/runtime/models/uga-sections/';
const manifestPath=assetRoot+'delivery-manifest.json';
const manifest=JSON.parse(await readFile(manifestPath));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['modules/space_exploration/index.html','modules/space_exploration/lib/three.min.js','modules/space_exploration/lib/GLTFLoader.js','modules/space_exploration/src/core/gltf_runtime_loader.js','modules/space_exploration/src/core/uga_command_scene.js','modules/space_exploration/src/ship/uga_blender_assets.js','modules/space_exploration/src/ui/uga_scene.js','modules/space_exploration/src/ui/uga_command.css','modules/space_exploration/src/ui/uga_command.js',manifestPath];
for(const resource of manifest.resources){
  if(!/^[a-zA-Z0-9.-]+$/.test(resource.uri))throw Error('Unsafe resource filename');
  const path=assetRoot+resource.uri,bytes=await readFile(path);
  if(bytes.length!==resource.bytes||sha(bytes)!==resource.sha256)throw Error(`Resource integrity failed: ${path}`);
  files.push(path);
}
const hashes={};for(const path of files)hashes[path]=sha(await readFile(path));
if(packaged)for(const path of [...files]){
  const target='www/'+path,hash=sha(await readFile(target));
  if(hash!==hashes[path])throw Error(`Packaged source mismatch: ${target}`);
  files.push(target);hashes[target]=hash;
}
const rooms = {command:'A',navigation:'A',survey:'A',mission_ops:'A',research:'B',fabricator:'B',engineering:'B',habitat:'C',factions:'C',hangar:'C',logistics:'C'};
await mkdir(output,{recursive:true});
const failures=[], errors=[], reports=[];
const guard=await acquireVerificationFreeze({root:fileURLToPath(new URL('../',import.meta.url)),label:'UGA authored shared-resource 33-room acceptance',allowedPaths:[fileURLToPath(new URL('../tmp/',import.meta.url)),fileURLToPath(new URL('../audit/',import.meta.url))]});
let page,browser;
try {
  browser=await launchPwBrowser();
  page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true});
  page.setDefaultTimeout(120000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.ready);
  await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);
  const gpu=await assertHardwareGpu(page);
  await page.click('#btnUgaCommand');
  /* UGA COMMAND opens the strategic hub with loadVisual:false - controls come up
     immediately and the ship interior streams behind them. Only onDistrictFocus
     calls requestUgaVisual, so waiting on commandScene.loaded straight off this
     click waits forever. Enter a room the way a player does, then wait. */
  await page.click('.uga-command-nav [data-nav="ship"]');
  await page.waitForFunction(()=>window.__MASSFRONT_SPACE__?.commandScene?.loaded, null, {polling:250});
  for (const [viewport,size] of Object.entries({landscape:{width:1440,height:900},portrait:{width:412,height:900},phoneLandscape:{width:900,height:412}})) {
    await page.setViewportSize(size);
    await page.click('[data-action="overview"]');
    await page.waitForTimeout(1200);
    await page.screenshot({path:new URL(`overview-${viewport}.png`,output).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:')});
    for (const [id,deck] of Object.entries(rooms)) {
      await page.click(`[data-deck-filter="${deck}"]`);
      await page.locator(`.uga-district-button[data-district="${id}"]`).click();
      await page.waitForTimeout(1100);
      const report=await page.evaluate(id=>{
        const s=window.__MASSFRONT_SPACE__.commandScene,r=s.districtRoots.get(id),plots=new Set();
        r.traverse(o=>{if(o.userData?.build_plot_id)plots.add(o.userData.build_plot_id);});
        const bounds=s._districtBounds(r),center=bounds?bounds.getCenter(new THREE.Vector3()).project(s.camera):new THREE.Vector3(9,9,9);
        const gl=s.renderer.getContext();
        return {id,selected:s.selectedDistrictId,rootVisible:r.visible,children:r.children.map(o=>({name:o.name,visible:o.visible})),carrier:s.deckTopologyRoot.name,districts:s.districtRoots.size,plots:[...plots],visibleMeshes:(()=>{let n=0;r.traverseVisible(o=>{if(o.isMesh)n++;});return n;})(),camera:s.camera.position.toArray(),target:s.cameraTarget.toArray(),up:s.camera.up.toArray(),center:center.toArray(),glError:gl.getError(),lost:gl.isContextLost()};
      },id);
      reports.push({viewport,...report});
      // Command is fixed; the ten upgradeable authored districts own30 plots.
      if(report.selected!==id||report.carrier!=='NEXUS_VII_LONGITUDINAL_CUTAWAY'||report.districts!==11||report.plots.length!==(id==='command'?0:3)||report.visibleMeshes<5||report.glError||report.lost)failures.push(`${viewport}/${id}: authored room contract`);
      if(Math.abs(report.center[0])>1||Math.abs(report.center[1])>1)failures.push(`${viewport}/${id}: room center outside viewport`);
      await page.screenshot({path:new URL(`${id}-${viewport}.png`,output).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:')});
      const tap=await page.evaluate(id=>{
        const s=window.__MASSFRONT_SPACE__.commandScene,r=s.districtRoots.get(id),canvas=s.renderer.domElement.getBoundingClientRect();
        const stage=document.querySelector('.uga-command-stage');
        let target=null;
        r.traverseVisible(o=>{
          if(target||!o.isMesh)return;
          const p=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).project(s.camera);
          const x=canvas.left+(p.x+1)*canvas.width/2,y=canvas.top+(1-p.y)*canvas.height/2;
          if(x<0||y<0||x>innerWidth||y>innerHeight)return;
          const element=document.elementFromPoint(x,y);
          if(element!==stage&&!element?.matches('canvas'))return;
          const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(p.x,p.y),s.camera);
          const hit=ray.intersectObject(s.root,true).find(h=>{for(let n=h.object;n;n=n.parent)if(!n.visible)return false;return true;});
          for(let n=hit?.object;n;n=n.parent)if(n.userData?.district_id===id){target={x,y};break;}
        });
        return target;
      },id);
      if(tap){await page.mouse.click(tap.x,tap.y);const after=await page.evaluate(id=>{const s=window.__MASSFRONT_SPACE__.commandScene;return {selected:s.selectedDistrictId,bounds:Boolean(s._districtBounds(s.districtRoots.get(id)))};},id);if(after.selected!==id||!after.bounds)failures.push(`${viewport}/${id}: real mesh tap changed/hid authored room`);}
      else failures.push(`${viewport}/${id}: no unobscured pickable room mesh`);
      reports[reports.length-1].meshTap=tap;
      console.log(`${viewport} ${id}: meshes=${report.visibleMeshes} plots=${report.plots.length}`);
    }
  }
  const changedSource=[];for(const path of files)if(sha(await readFile(path))!==hashes[path])changedSource.push(path);
  if(changedSource.length)failures.push(...changedSource.map(path=>`Source changed during capture: ${path}`));
  try{await guard.checkpoint('UGA final capture');}catch(error){failures.push(error.message);}
  if(errors.length)failures.push(...errors);
  await writeFile(new URL('report.json',output),JSON.stringify({time:new Date().toISOString(),base,packaged,gpu,hashes,changedSource,delivery:{manifestPath,sourceSha256:manifest.sourceSha256,dependencyBytes:manifest.totalBytes,manifestBytes:(await readFile(manifestPath)).length,resources:manifest.resources},reports,errors,failures},null,2));
  console.log(JSON.stringify({output:output.href,failures,errors}));
}catch(error){
  await writeFile(new URL('run-error.json',output),JSON.stringify({time:new Date().toISOString(),base,hashes,reports,failures,errors,fatal:String(error.stack||error)},null,2));
  throw error;
}finally{await page?.close();if(browser)await closePwBrowser();await guard.release();}
if(failures.length)process.exitCode=1;
