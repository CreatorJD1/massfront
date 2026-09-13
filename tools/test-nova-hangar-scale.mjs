import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname,relative} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {getUgaGroundAreaForMission} from '../modules/space_exploration/src/domain/catalog.js';

const root=process.cwd(),label=process.argv[2]||'before',packed=process.argv.includes('--packed'),accept=process.argv.includes('--accept');
const groundArea=getUgaGroundAreaForMission('uga_pale_bloom'),groundMap=groundArea?.maps.find(map=>map.id===groundArea.recommendedMapId);
assert.ok(groundArea&&groundMap,'Pale Bloom must have an authored player-facing battlefield');
assert.match(label,/^[a-z0-9-]+$/,'safe unique evidence label');
const out=resolve(root,'tmp/nova-hangar-scale',label),serveRoot=packed?resolve(root,'www'):root;
await mkdir(resolve(root,'tmp/nova-hangar-scale'),{recursive:true});
await mkdir(out); // Never silently overwrite an earlier acceptance capture.
const files=['index.html','boot.js','src/launcher.js','src/assetpack.js','src/galactic-operations.js','modules/space_exploration/index.html','modules/space_exploration/src/space_experience.js','modules/space_exploration/src/startup_content.js','modules/space_exploration/assets/runtime/content/assetpack-runtime.js','modules/space_exploration/src/core/uga_command_scene.js','modules/space_exploration/src/ship/uga_blender_assets.js','modules/space_exploration/src/domain/catalog.js','modules/space_exploration/src/assets/generated/deployment_ship_geometry_v1.js'];
for(const name of await readdir(resolve(root,'modules/space_exploration/src/ui')))if(/^(uga_|nova_)/.test(name)&&/\.(js|css)$/.test(name))files.push(`modules/space_exploration/src/ui/${name}`);
async function hashes(base){const result={};for(const path of files)result[path]=createHash('sha256').update(await readFile(resolve(base,path))).digest('hex');return result;}
let server,browser,page,guard;
const report={label,packed,accept,serveRoot,startedAt:new Date().toISOString(),verifierSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),commandLine:process.argv,sourceBefore:await hashes(root),errors:[],views:[],fixture:'Real updater/intro/offline entry and Nova commissioning. Local showcase progression saved through actual host, then real Missions -> Pale Bloom -> deployment UI. No portrait failure injection.'};
try{
  guard=await acquireVerificationFreeze({root,label:`Nova hangar ${label}`,allowedPaths:[resolve(root,'tmp'),resolve(root,'audit')]});
  report.packageBefore=await hashes(serveRoot);
  if(packed)for(const file of files.filter(p=>p.startsWith('modules/')))assert.equal(report.packageBefore[file],report.sourceBefore[file],`source matches package: ${file}`);
  server=createServer(async(req,res)=>{try{const path=resolve(serveRoot,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));if(relative(serveRoot,path).startsWith('..')){res.writeHead(403);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.gltf':'model/gltf+json','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));report.url=`http://127.0.0.1:${server.address().port}/`;
  browser=await launchPwBrowser();page=await browser.newPage({viewport:{width:412,height:900},hasTouch:true,serviceWorkers:'block'});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
  await page.goto(report.url,{waitUntil:'domcontentloaded'});report.gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof mfLauncherSnapshot==='function'&&!document.getElementById('mfBootCover'),null,{timeout:60000});
  await page.waitForFunction(()=>{const p=document.getElementById('mfLaunchPlay'),o=document.getElementById('mfLaunchOffline');return p&&!p.disabled||o&&!o.disabled&&getComputedStyle(o).display!=='none';});
  if(await page.locator('#mfLaunchPlay').isEnabled()&&/CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText()))await page.locator('#mfLaunchPlay').click();else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click();await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*');
  async function ready(){await page.waitForFunction(()=>window.__MASSFRONT_SPACE__,null,{timeout:60000});await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);}
  await ready();await page.locator('#btnUgaCommand').click();await page.locator('[data-nav="missions"]').click();await page.locator('[data-host-route="new-career-faction"]').click();
  await page.waitForURL(/galacticRoute=/);await page.locator('.mfcfgCard[data-faction="nova"]').click();await page.waitForURL('**/modules/space_exploration/index.html*');await ready();
  report.fixture=await page.evaluate(async()=>{const host=window.__MASSFRONT_SPACE_HOST__,module=await import('./src/domain/state_store.js'),state=module.createShowcaseReadyDomainState(host.commanderCatalogContext);state.profileId=window.__MASSFRONT_SPACE__.getState().profileId;await host.saveCampaignSnapshot(state);return {profileId:state.profileId,commanderCatalog:state.commanders};});
  await page.reload();await ready();await page.locator('#btnUgaCommand').click();await page.locator('[data-nav="missions"]').click();await page.locator('[data-mission="uga_pale_bloom"]').click();
  const planner=page.locator('.uga-deployment-planner[data-mission-id="uga_pale_bloom"]');await planner.waitFor({state:'visible',timeout:30000});const mapSelect=planner.locator('[data-deploy="mapId"]');await mapSelect.waitFor({state:'visible',timeout:30000});
  const beforeMap=await planner.evaluate(node=>({value:node.querySelector('[data-deploy="mapId"]')?.value||'',disabled:!!node.querySelector('[data-action="deploy"]')?.disabled,areaId:node.dataset.selectedAreaId||'',choices:[...node.querySelectorAll('[data-deploy="mapId"] option[data-ground-map]')].map(option=>option.dataset.mapSize)}));assert.equal(beforeMap.value,'','new deployment starts without a hidden map choice');assert.equal(beforeMap.disabled,true,'deploy is blocked until the player chooses a battlefield');assert.equal(beforeMap.areaId,groundArea.id);assert.deepEqual(beforeMap.choices,['compact','standard','large']);
  await mapSelect.selectOption(groundMap.id);await page.locator('[data-action="deploy"]:enabled').waitFor({state:'visible',timeout:30000});report.battlefieldSelection=await planner.evaluate(node=>({areaId:node.dataset.selectedAreaId,mapId:node.dataset.selectedMapId,mapSize:node.dataset.selectedMapSize,rootAreaId:document.querySelector('.uga-command-shell')?.dataset.selectedAreaId,rootMapId:document.querySelector('.uga-command-shell')?.dataset.selectedMapId,rootMapSize:document.querySelector('.uga-command-shell')?.dataset.selectedMapSize}));assert.deepEqual(report.battlefieldSelection,{areaId:groundArea.id,mapId:groundMap.id,mapSize:groundMap.size,rootAreaId:groundArea.id,rootMapId:groundMap.id,rootMapSize:groundMap.size},'visible battlefield choice is retained by planner and root contracts');
  async function contentStatusLayoutFixture(viewport,mode){
    const snapshot=await page.evaluate(()=>({state:window.MASSFRONT_ASSET_PACKS.snapshot(),open:document.getElementById('mfGalacticContentStatus').open}));
    // Exercise the real installed status consumer. These event values are a
    // layout fixture only, not evidence that any large download was performed.
    try{
      for(const status of ['busy','paused']){
        if(mode==='expanded')await page.locator('[data-deploy="commanderId"]').scrollIntoViewIfNeeded();
        await page.evaluate(status=>window.dispatchEvent(new CustomEvent('massfront:assetpack-state',{detail:{state:status==='busy'?'downloading':'error',busy:status==='busy',got:65536,total:262144,percent:25,error:status==='paused'?'Layout fixture: connection paused. Verified progress remains saved.':null}})),status);
        const details=page.locator('#mfGalacticContentStatus');await details.waitFor({state:'visible'});if(!await details.evaluate(e=>e.open))await details.locator('summary').click();await page.waitForTimeout(250);
        const layout=await page.evaluate(()=>{
          const details=document.getElementById('mfGalacticContentStatus'),r=details.getBoundingClientRect();
          const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
          const obstacles=[...document.querySelectorAll('.uga-context-panel,.uga-deployment-context,.uga-command-nav,.uga-quick-actions')].map(e=>({name:e.className,rect:e.getBoundingClientRect()})).filter(e=>e.rect.width&&e.rect.height).map(e=>({name:e.name,rect:e.rect.toJSON(),overlap:intersects(r,e.rect)}));
          const selectors=['#mfGalacticContentStatus summary','#mfGalacticContentStatus button','[data-action="deploy"]','[data-action="deployment-sections"]','[data-action="deployment-back"]','[data-action="toggle-deployment-loadout"]','[data-deploy="commanderId"]'];
          const controls=selectors.map(selector=>{const e=document.querySelector(selector),a=e?.getBoundingClientRect(),style=e&&getComputedStyle(e),visible=!!e&&!e.hidden&&style.display!=='none'&&style.visibility!=='hidden'&&a.width>0&&a.height>0,hit=visible?document.elementFromPoint(a.x+a.width/2,a.y+a.height/2):null;return {selector,visible,disabled:!!e?.disabled,rect:a?.toJSON(),hit:visible&&(e===hit||e.contains(hit))};});
          return {viewport:{width:innerWidth,height:innerHeight},statusRect:r.toJSON(),detailsOpen:details.open,summary:details.querySelector('summary').textContent,description:details.querySelector('p').textContent,obstacles,controls};
        });
        const row={scope:'Injected state through real massfront:assetpack-state UI consumer; layout only, not an actual download or retry test.',mode,status,...layout};(report.contentStatusLayoutFixtures??=[]).push(row);
        await page.screenshot({path:resolve(out,`content-status-${viewport.width}x${viewport.height}-${mode}-${status}.png`)});
        assert.ok(row.detailsOpen,'real download details opened through summary');assert.ok(row.statusRect.left>=-1&&row.statusRect.top>=-1&&row.statusRect.right<=viewport.width+1&&row.statusRect.bottom<=viewport.height+1,'download details remain inside viewport');assert.ok(row.obstacles.every(o=>!o.overlap),'download status avoids actual deployment inspector and navigation');
        for(const control of row.controls){const required=control.selector!=='#mfGalacticContentStatus button'&&control.selector!=='[data-deploy="commanderId"]'||control.selector==='#mfGalacticContentStatus button'&&status==='paused'||control.selector==='[data-deploy="commanderId"]'&&mode==='expanded';if(required)assert.ok(control.visible&&control.hit&&!control.disabled,`${mode} ${status}: ${control.selector} remains visible and unobscured`);}
        if(status==='busy')assert.match(row.summary,/25%/,'actual consumer renders supplied progress');else assert.match(row.summary,/paused/i,'actual consumer renders pause');
      }
    }finally{
      await page.evaluate(snapshot=>{window.dispatchEvent(new CustomEvent('massfront:assetpack-state',{detail:snapshot.state}));document.getElementById('mfGalacticContentStatus').open=snapshot.open;},snapshot);await page.waitForTimeout(150);
    }
  }
  for(const viewport of [{width:412,height:900},{width:900,height:412}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(1300);await page.waitForFunction(()=>!window.__MASSFRONT_SPACE__.commandScene.tween,null,{timeout:10000});
    const inspectCurrentView=()=>page.evaluate(()=>{
      const scene=window.__MASSFRONT_SPACE__.commandScene,hangar=scene.districtRoots.get('hangar'),arena=hangar.getObjectByName('STAGE6_StrikeBayDeploymentArena'),canvas=scene.renderer.domElement.getBoundingClientRect();
      function visible(object){for(let item=object;item;item=item.parent)if(!item.visible)return false;return true;}
      function bounds(object){if(!object)return null;object.updateWorldMatrix(true,true);const b=new THREE.Box3();object.traverse(item=>{if(!item.isMesh||!visible(item))return;item.geometry.computeBoundingBox();b.union(item.geometry.boundingBox.clone().applyMatrix4(item.matrixWorld));});if(b.isEmpty())return null;const local=b.clone(),points=[];scene.camera.updateMatrixWorld(true);for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).project(scene.camera);points.push({x:canvas.left+(p.x+1)*canvas.width/2,y:canvas.top+(1-p.y)*canvas.height/2,z:p.z});}return {world:{min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(new THREE.Vector3()).toArray()},projected:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))},points};}
      const ships=[],authored=[],ramps=[],feet=[];hangar.traverse(item=>{if(item.userData.ship_id)ships.push({name:item.name,data:item.userData,visible:visible(item),bounds:bounds(item)});if(item.isMesh&&!item.userData.stage6_deployment_arena)authored.push({name:item.name,visible:visible(item)});if(item.isMesh&&/ramp/i.test(item.name))ramps.push({name:item.name,data:item.userData,bounds:bounds(item)});if(item.isMesh&&/(foot|landing.*pad|gear.*pad)/i.test(item.name)&&visible(item))feet.push({name:item.name,bounds:bounds(item)});});
      const floor=arena?.getObjectByName('hangar_DeploymentArenaFloorInlay');
      hangar.updateWorldMatrix(true,true);const inverse=hangar.matrixWorld.clone().invert();
      const localBounds=[];hangar.traverse(item=>{if(!item.isMesh)return;item.geometry.computeBoundingBox();const box=item.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(item.matrixWorld));localBounds.push({name:item.name,role:item.userData.render_role,stage6:!!item.userData.stage6_deployment_arena,novaFloorContact:!!item.userData.nova_floor_contact,visible:visible(item),min:box.min.toArray(),max:box.max.toArray()});});
      const controls=[...document.querySelectorAll('[data-action="deploy"],[data-action="deployment-back"],[data-action="toggle-deployment-loadout"],[data-action="deployment-sections"]')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {action:e.dataset.action,visible:r.width>0&&r.height>0,disabled:!!e.disabled,width:r.width,height:r.height,x:r.x,y:r.y,hit:e===hit||e.contains(hit)};});
      const portrait=[...document.querySelectorAll('img')].filter(e=>/nova_kai/.test(e.src)).map(e=>({src:e.src,complete:e.complete,width:e.naturalWidth}));
      const gl=scene.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),graphics={devicePixelRatio,pixelRatio:scene.renderer.getPixelRatio(),toneMapping:scene.renderer.toneMapping,exposure:scene.renderer.toneMappingExposure,outputEncoding:scene.renderer.outputEncoding,isWebGL2:scene.renderer.capabilities.isWebGL2,precision:scene.renderer.capabilities.precision,contextAttributes:gl.getContextAttributes(),unmaskedRenderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null};
      return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,selectedDistrict:scene.selectedDistrictId,authoredRoot:scene.deckTopologyRoot?.name,authoredTotal:authored.length,authoredVisible:authored.filter(e=>e.visible).length,authored,localBounds,arenaData:arena?.userData,arenaBounds:bounds(arena),floorBounds:bounds(floor),ships,ramps,feet,controls,portrait,graphics,camera:{position:scene.camera.position.toArray(),target:scene.controls?.target?.toArray(),fov:scene.camera.fov},renderer:scene.renderer.info,canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},panel:(()=>{const r=document.querySelector('.uga-context-panel').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()};
    });
    const view=await inspectCurrentView();report.views.push(view);assert.ok(view.documentWidth<=viewport.width+1,'no horizontal page overflow');assert.equal(view.selectedDistrict,'hangar');assert.equal(view.authoredRoot,'NEXUS_VII_LONGITUDINAL_CUTAWAY');assert.ok(view.controls.every(control=>control.visible&&control.hit&&!control.disabled),'deploy and navigation controls are visible and unobscured');assert.ok(view.portrait.length>0&&view.portrait.every(image=>image.complete&&image.width>0),'real Nova portrait loaded');
    assert.ok(view.graphics.unmaskedRenderer&&!/SwiftShader|llvmpipe|software/i.test(view.graphics.unmaskedRenderer),'actual hangar renderer uses hardware GPU');
    await page.screenshot({path:resolve(out,`${viewport.width}x${viewport.height}.png`)});
    if(accept){
      assert.ok(view.authoredVisible>0,'authored hangar remains part of the deployment section');
      for(const name of ['hangar_Deck','hangar_FlightDeck','hangar_PortBulkhead','hangar_RearPressureWall','hangar_StarboardBulkhead'])assert.ok(view.authored.some(entry=>entry.name===name&&entry.visible),`original structural mesh remains visible: ${name}`);
      const ship=view.ships.find(entry=>entry.visible);assert.ok(ship?.bounds,'visible Nova ship has finite bounds');
      const p=ship.bounds.projected;assert.ok(p.left>=-1&&p.top>=-1&&p.right<=viewport.width+1&&p.bottom<=viewport.height+1,'full ship remains inside viewport');
      assert.ok(viewport.height>viewport.width?p.bottom<=view.panel.y+1:p.right<=view.panel.x+1,'full ship remains clear of the deployment inspector');
      const baseline=JSON.parse(await readFile(resolve(root,'tmp/nova-hangar-scale/before/report.json'),'utf8')).views.find(entry=>entry.viewport.width===viewport.width),baselineShip=baseline.ships.find(entry=>entry.visible);
      const span=Math.max(...ship.bounds.world.size),oldSpan=Math.max(...baselineShip.bounds.world.size);view.shipLengthReduction=1-span/oldSpan;assert.ok(view.shipLengthReduction>=.45,'Nova carrier physically smaller by at least 45 percent');
      view.shipToFloorSpan=span/Math.max(...view.floorBounds.world.size);assert.ok(view.shipToFloorSpan<=.35,'hangar deck span is at least 2.85 times full carrier length');
      const floor=view.localBounds.find(entry=>entry.visible&&entry.name==='hangar_DeploymentArenaFloorInlay')||view.localBounds.find(entry=>entry.visible&&entry.name==='hangar_Deck'),contacts=view.localBounds.filter(entry=>entry.visible&&entry.novaFloorContact);assert.ok(floor&&contacts.length>=2,'actual deck plus landing gear and ramp geometry found');
      view.floorContact=contacts.map(entry=>({name:entry.name,minZ:entry.min[2],floorTop:floor.max[2],gap:entry.min[2]-floor.max[2]}));for(const entry of view.floorContact)assert.ok(Math.abs(entry.gap)<=.025,`${entry.name} meets actual deck: gap ${entry.gap}`);
      await contentStatusLayoutFixture(viewport,'compact');
      const toggle=page.locator('[data-action="toggle-deployment-loadout"]');await toggle.click();await page.waitForTimeout(600);assert.equal(await toggle.getAttribute('aria-expanded'),'true','actual edit-loadout control expands details');
      view.expanded=await inspectCurrentView();await page.screenshot({path:resolve(out,`${viewport.width}x${viewport.height}-expanded.png`)});
      const expandedShip=view.expanded.ships.find(entry=>entry.visible).bounds.projected;assert.ok(viewport.height>viewport.width?expandedShip.bottom<=view.expanded.panel.y+1:expandedShip.right<=view.expanded.panel.x+1,'expanded inspector does not obscure carrier');
      await contentStatusLayoutFixture(viewport,'expanded');
      view.stationChecks=[];
      for(const station of ['base_deployer','command_chassis','specialist_muster','unit_staging','structure_cargo','support_service']){
        const control=page.locator(`[data-deployment-station="${station}"]`);await control.scrollIntoViewIfNeeded();
        const evidence=await control.evaluate(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {station:e.dataset.deploymentStation,width:r.width,height:r.height,hit:e===hit||e.contains(hit)};});
        assert.ok(evidence.hit&&evidence.width>=44&&evidence.height>=40,`${station} is an unobscured touch target`);await control.click();await page.waitForTimeout(100);assert.equal(await control.getAttribute('aria-pressed'),'true',`${station} selection applied`);view.stationChecks.push(evidence);
      }
      view.draftBeforeCollapse=await page.evaluate(()=>window.__MASSFRONT_SPACE__.ugaUi?.getDeploymentDraft?.()||window.__MASSFRONT_SPACE__.commandScene.districtRoots.get('hangar').getObjectByName('STAGE6_StrikeBayDeploymentArena').userData.deploymentDraft);
      await toggle.click();await page.waitForTimeout(400);assert.equal(await toggle.getAttribute('aria-expanded'),'false','loadout closes to room context');
      view.draftAfterCollapse=await page.evaluate(()=>window.__MASSFRONT_SPACE__.ugaUi?.getDeploymentDraft?.()||window.__MASSFRONT_SPACE__.commandScene.districtRoots.get('hangar').getObjectByName('STAGE6_StrikeBayDeploymentArena').userData.deploymentDraft);assert.deepEqual(view.draftAfterCollapse,view.draftBeforeCollapse,'collapsing details preserves actual deployment selection');
    }
  }
  if(accept){
    await page.setViewportSize({width:1200,height:900});await page.waitForTimeout(800);
    report.diagnosticCloseup=await page.evaluate(()=>{
      // This is a labeled camera diagnostic on the model loaded by real UI.
      // It does not stand in for the default hangar framing screenshots above.
      const scene=window.__MASSFRONT_SPACE__.commandScene,room=scene.districtRoots.get('hangar'),ship=room.getObjectByName('hangar_HqDeploymentShip_nova_orbital_carrier'),b=new THREE.Box3().setFromObject(ship),camera=scene.camera,canvas=scene.renderer.domElement.getBoundingClientRect(),panel=document.querySelector('.uga-context-panel').getBoundingClientRect(),context=document.querySelector('.uga-deployment-context').getBoundingClientRect();
      const clear={left:canvas.left+24,right:panel.left-24,top:Math.max(canvas.top+24,context.bottom+16),bottom:canvas.bottom-24},corners=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])corners.push(new THREE.Vector3(x,y,z));
      const direction=new THREE.Vector3(.5,-1,.50).normalize().transformDirection(room.matrixWorld),up=new THREE.Vector3(0,0,1).transformDirection(room.matrixWorld),target=b.getCenter(new THREE.Vector3()),probe=camera.clone();probe.up.copy(up);let low=.1,high=b.getSize(new THREE.Vector3()).length()*10;
      for(let i=0;i<32;i++){const distance=(low+high)/2;probe.position.copy(target).addScaledVector(direction,distance);probe.lookAt(target);probe.updateMatrixWorld(true);const points=corners.map(p=>p.clone().project(probe)),width=(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))/2,height=(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))/2;if(width<=(clear.right-clear.left)/canvas.width*.80&&height<=(clear.bottom-clear.top)/canvas.height*.80)high=distance;else low=distance;}
      const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),aimX=(clear.left+clear.right-2*canvas.left)/canvas.width-1,aimY=1-(clear.top+clear.bottom-2*canvas.top)/canvas.height;target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld,0),-aimX*high*tan*camera.aspect);target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld,1),-aimY*high*tan);scene._moveCamera(target.clone().addScaledVector(direction,high),target,0,up);
      return {scope:'Diagnostic camera close-up of actual live Nova after real deployment entry; not default player framing.',ship:ship.name,clear,refinement:ship.userData.nova_geometry_refinement,viewport:{width:innerWidth,height:innerHeight}};
    });
    await page.waitForTimeout(600);await page.screenshot({path:resolve(out,'nova-model-diagnostic-closeup.png')});
    await page.setViewportSize({width:900,height:412});await page.waitForTimeout(600);
    await page.locator('[data-action="deployment-sections"]').click();await page.waitForTimeout(800);
    report.returnToSections=await page.evaluate(()=>{const scene=window.__MASSFRONT_SPACE__.commandScene,room=scene.districtRoots.get('hangar'),presentation=room.getObjectByName('hangar_AuthoredDeploymentPresentation');room.updateWorldMatrix(true,true);const inverse=room.matrixWorld.clone().invert(),meshes=[];room.traverse(item=>{if(!item.isMesh||item.userData.stage6_deployment_arena)return;item.geometry.computeBoundingBox();const b=item.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(item.matrixWorld));meshes.push({name:item.name,min:b.min.toArray(),max:b.max.toArray()});});return {selected:scene.selectedDistrictId,scale:presentation?.scale.toArray(),arenaVisible:room.getObjectByName('STAGE6_StrikeBayDeploymentArena')?.visible,meshes,navigationVisible:[...document.querySelectorAll('.uga-command-nav button')].filter(e=>e.getBoundingClientRect().height>0).length};});
    assert.equal(report.returnToSections.selected,'hangar');assert.equal(report.returnToSections.arenaVisible,false);assert.deepEqual(report.returnToSections.scale,[1,1,1],'return restores authored ship-section scale');assert.ok(report.returnToSections.navigationVisible>0,'full section navigation restored');
    const baseline=JSON.parse(await readFile(resolve(root,'tmp/nova-hangar-scale/before/report.json'),'utf8')).views[0].localBounds.filter(entry=>!entry.stage6);
    for(const expected of baseline){const actual=report.returnToSections.meshes.find(entry=>entry.name===expected.name);assert.ok(actual,`original authored mesh retained: ${expected.name}`);for(const edge of ['min','max'])for(let i=0;i<3;i++)assert.ok(Math.abs(actual[edge][i]-expected[edge][i])<.0001,`authored placement restored: ${expected.name}`);}
    await page.screenshot({path:resolve(out,'return-to-authored-sections.png')});
  }
  assert.deepEqual(report.errors,[],'no page errors');report.pass=true;
}catch(error){report.pass=false;report.failure=error.stack;if(page)await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}
finally{
  report.sourceAfter=await hashes(root);report.packageAfter=await hashes(serveRoot);report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.packageStable=JSON.stringify(report.packageBefore)===JSON.stringify(report.packageAfter);if(!report.sourceStable||!report.packageStable)report.pass=false;
  if(browser)await closePwBrowser(browser);if(server)await new Promise(r=>server.close(r));
  if(guard)try{await guard.release({assertStable:true,name:'Nova hangar capture complete'});report.freezeStable=true;}catch(error){report.freezeStable=false;report.pass=false;report.freezeFailure=error.stack;}
  report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({pass:report.pass,out,views:report.views.map(v=>({viewport:v.viewport,authoredVisible:v.authoredVisible,ships:v.ships.filter(s=>s.visible).map(s=>({name:s.name,bounds:s.bounds}))})),failure:report.failure,sourceStable:report.sourceStable,freezeStable:report.freezeStable}));process.exitCode=report.pass?0:1;
