import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {launchPwBrowser,closePwBrowser} from './pw-browser.mjs';
import {assertHardwareGpu} from './chrome-gpu.mjs';
import {acquireVerificationFreeze} from './evidence-foundation/workspace-guard.mjs';
import {MISSION_CATALOG,getUgaGroundAreaForMission} from '../modules/space_exploration/src/domain/catalog.js';
const missionTag=process.env.MF_MISSION_TAG||'';
assert.ok(!missionTag||/^[a-z0-9][a-z0-9-]{0,63}$/.test(missionTag),'MF_MISSION_TAG must be a safe lowercase evidence label');
const missionId=process.env.MF_MISSION_ID||'uga_pale_bloom';
assert.ok(/^[a-z0-9_]{1,96}$/.test(missionId),'MF_MISSION_ID must be a stable mission ID');
const mission=MISSION_CATALOG[missionId];
assert.ok(mission,'MF_MISSION_ID must name an authored mission');
const groundArea=getUgaGroundAreaForMission(missionId),groundMap=groundArea?.maps.find(map=>map.id===groundArea.recommendedMapId);
assert.ok(groundArea&&groundMap,'MF_MISSION_ID must have an authored player-facing battlefield');
const root=process.cwd(),packed=process.env.MF_MISSION_PACKED==='1',mobile=process.env.MF_MISSION_MOBILE==='1',serveRoot=packed?resolve(root,'www'):root,out=`tmp/mission-return${packed?'-packed':''}${mobile?'-mobile':''}${process.env.MF_MISSION_MISSING_PORTRAIT==='1'?'-missing-portrait':''}${process.env.MF_MISSION_R2==='1'?'-r2':''}${missionTag?'-'+missionTag:''}`;let server,guard,browser,page;
// A named acceptance run owns a fresh directory. Reusing its label fails
// before a server/browser starts instead of overwriting earlier evidence.
const files=['src/galactic-operations.js','src/main.js','src/game/sim.js','modules/space_exploration/src/space_experience.js','modules/space_exploration/src/space_module.js','modules/space_exploration/src/ui/uga_command.js','modules/space_exploration/src/ui/uga_command.css','modules/space_exploration/src/host/massfront_solo_host.js','modules/space_exploration/src/domain/catalog.js','modules/space_exploration/src/domain/ground_operation.js'];
files.push('modules/space_exploration/src/ui/campaign_hub_registry.js');
files.push('src/assetpack.js','src/launcher.js','boot.js','modules/space_exploration/src/ui/space_module.css','modules/space_exploration/src/core/uga_command_scene.js','modules/space_exploration/src/core/gltf_runtime_loader.js','modules/space_exploration/src/ship/uga_blender_assets.js','modules/space_exploration/src/startup_content.js','modules/space_exploration/assets/runtime/content/assetpack-runtime.js','modules/space_exploration/index.html');
files.push('modules/space_exploration/src/ui/uga_scene.js','modules/space_exploration/src/ui/nova_deployment_ship.js');
async function hashes(base=root){const r={};for(const p of files)r[p]=createHash('sha256').update(await readFile(resolve(base,p))).digest('hex');return r;}
const report={url:null,serveRoot,packed,missionTag,missionId,viewport:mobile?{width:412,height:900}:{width:1000,height:760},startedAt:new Date().toISOString(),verifierSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),before:null,errors:[],steps:[],fixture:'Local showcase progression via actual host save; enemy lethal damage accelerates tactical outcome, not a played full mission.'};
const servedHashJobs=[];report.servedRuntime={};
mission: try{
  guard=await acquireVerificationFreeze({root,label:`mission return ${missionTag||missionId}`,allowedPaths:[resolve(root,'tmp'),resolve(root,'audit')]});
  await mkdir(resolve(root,'tmp'),{recursive:true});
  await mkdir(out,{recursive:!missionTag});
  if(!process.env.MF_MISSION_URL){server=createServer(async(req,res)=>{try{const p=resolve(serveRoot,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));if(!p.startsWith(serveRoot)){res.writeHead(403);return res.end();}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
  const url=process.env.MF_MISSION_URL||`http://127.0.0.1:${server.address().port}/`;report.url=url;report.before=await hashes();
  browser=await launchPwBrowser();
  if(packed){report.packageBefore=await hashes(serveRoot);assert.deepEqual(report.packageBefore,report.before,'source matches tested www files');report.testedEntrySha256=createHash('sha256').update(await readFile(resolve(serveRoot,'index.html'))).digest('hex');}
  page=await browser.newPage({viewport:report.viewport,hasTouch:true,serviceWorkers:process.env.MF_MISSION_MISSING_PORTRAIT==='1'?'block':'allow'});page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',response=>{const responseUrl=response.url();if(response.ok()&&/\.(?:js|css|html)(?:\?|$)/.test(responseUrl))servedHashJobs.push((async()=>{try{const body=await response.body();report.servedRuntime[responseUrl]={sha256:createHash('sha256').update(body).digest('hex'),bytes:body.length};}catch(e){report.servedRuntime[responseUrl]={error:String(e)};}})());});
  async function visualCheck(name,selector){await page.locator('#renderVeil').waitFor({state:'hidden',timeout:60000});const control=page.locator(selector).first();await control.scrollIntoViewIfNeeded();const evidence=await control.evaluate(e=>{const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,button:{x:r.x,y:r.y,width:r.width,height:r.height},hit:e===hit||e.contains(hit),disabled:!!e.disabled};});(report.visualChecks??={})[name]=evidence;assert.ok(evidence.documentWidth<=evidence.viewport.width+1,`${name}: no page horizontal overflow`);assert.ok(evidence.hit&&!evidence.disabled,`${name}: action reachable and unobscured`);assert.ok(evidence.button.width>=44&&evidence.button.height>=40,`${name}: touch target`);await page.screenshot({path:`${out}/${name}.png`});}
  async function touch(locator){const box=await locator.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'touch target missing or below 44px');await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5);}
  page.on('framenavigated',f=>{if(f===page.mainFrame()&&/groundResult=/.test(f.url()))report.resultReturnUrl=f.url();});
  await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)||/^(blob|data):/.test(r.request().url())?r.continue():r.abort());
  report.blockedPortraitRequests=0;
  if(process.env.MF_MISSION_MISSING_PORTRAIT==='1')await page.route('**/assets/factions/commanders/nova_kai.jpg',r=>{report.blockedPortraitRequests++;return r.abort();});
  await page.goto(url,{waitUntil:'domcontentloaded'});report.gpu=await assertHardwareGpu(page);
  await page.waitForFunction(()=>typeof mfLauncherSnapshot==='function'&&!document.getElementById('mfBootCover'),null,{timeout:60000});
  await page.waitForFunction(()=>{const p=document.getElementById('mfLaunchPlay'),o=document.getElementById('mfLaunchOffline');return p&&!p.disabled||o&&!o.disabled&&getComputedStyle(o).display!=='none';});
  if(await page.locator('#mfLaunchPlay').isEnabled()&&/CONTINUE TO INTRO/.test(await page.locator('#mfLaunchPlay').innerText()))await page.locator('#mfLaunchPlay').click();else await page.locator('#mfLaunchOffline').click();
  await page.locator('#mfIntroStart').click();await page.locator('#apOfflineBtn').click();
  await page.waitForURL('**/modules/space_exploration/index.html*');
  async function ready(){await page.waitForFunction(()=>window.__MASSFRONT_SPACE__,null,{timeout:60000});await page.evaluate(()=>window.__MASSFRONT_SPACE__.ready);}
  async function openGalacticContracts(prefix,{requireCampaignHub=false}={}){
    await page.waitForFunction(requireHub=>{const visible=e=>{if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};const scene=window.__MASSFRONT_SPACE__?.scene;if(requireHub)return scene==='uga'&&document.getElementById('moduleFrame')?.dataset.entryView==='campaign_hub'&&visible(document.querySelector('.uga-campaign-hub'))&&visible(document.querySelector('.uga-command-nav [data-nav="missions"]'))&&!visible(document.getElementById('btnUgaCommand'));return scene==='uga'&&visible(document.querySelector('.uga-command-nav [data-nav="missions"]'))||scene==='system'&&visible(document.getElementById('actInteract'))&&/ENTER UGA MANAGEMENT/i.test(document.getElementById('actInteract').innerText);},requireCampaignHub,{timeout:60000});
    const entry=await page.evaluate(()=>({entryView:document.getElementById('moduleFrame')?.dataset.entryView||'',scene:window.__MASSFRONT_SPACE__?.scene||'',hubHeading:document.querySelector('.uga-campaign-hub h2')?.textContent||'',redundantUgaControlHidden:document.getElementById('btnUgaCommand')?.getBoundingClientRect().width===0}));
    if(requireCampaignHub)assert.deepEqual(entry,{entryView:'campaign_hub',scene:'uga',hubHeading:'Galactic Command',redundantUgaControlHidden:true},'integrated entry opens the visible Campaign Hub without a redundant UGA COMMAND click');
    if(entry.scene==='system'){
      await visualCheck(`${prefix}-system-enter-uga`,'#actInteract');
      await touch(page.locator('#actInteract'));
      await page.locator('.uga-command-shell').waitFor({state:'visible',timeout:30000});
    }
    await visualCheck(`${prefix}-campaign-hub-missions`,'.uga-command-nav [data-nav="missions"]');
    await touch(page.locator('.uga-command-nav [data-nav="missions"]'));
    await page.locator('.uga-command-shell[data-view="progress"]').waitFor({state:'visible',timeout:10000});
    await visualCheck(`${prefix}-progress-expedition`,'[data-hub-route="galactic-operations"]');
    await touch(page.locator('[data-hub-route="galactic-operations"]'));
    await page.locator('.uga-command-shell[data-view="contracts"]').waitFor({state:'visible',timeout:10000});
    (report.entryRoutes??=[]).push(entry);
  }
  await ready();await openGalacticContracts('00a',{requireCampaignHub:true});await page.locator('[data-host-route="new-career-faction"]').click();
  await page.waitForURL(/galacticRoute=/);const novaCard=page.locator('#mfCareerFactionGate .mfcfgCard').filter({hasText:/COMMISSION NOVA/i}).first();const novaCommission=novaCard.locator('.mfcfgChoose');await novaCommission.evaluate(e=>e.scrollIntoView({block:'center'}));await page.waitForTimeout(300);await touch(novaCommission);
  await page.waitForURL('**/modules/space_exploration/index.html*');await ready();report.steps.push('real-nova-commissioning');
  report.fixtureState=await page.evaluate(async()=>{const host=window.__MASSFRONT_SPACE_HOST__,m=await import('./src/domain/state_store.js');const state=m.createShowcaseReadyDomainState(host.commanderCatalogContext);state.profileId=window.__MASSFRONT_SPACE__.getState().profileId;await host.saveCampaignSnapshot(state);return state;});
  report.fixtureSha256=createHash('sha256').update(JSON.stringify(report.fixtureState)).digest('hex');
  await page.reload();await ready();await openGalacticContracts('00b');
  await page.locator(`[data-mission="${missionId}"]`).click();
  const planner=page.locator(`.uga-deployment-planner[data-mission-id="${missionId}"]`);await planner.waitFor({state:'visible',timeout:30000});
  /* Expand the loadout BEFORE waiting on the battlefield select. This expansion
     already existed further down, but it sat after this wait, and
     openMissionDeployment() starts with deploymentLoadoutExpanded=false while
     the shell gates the loadout on .is-loadout-expanded — so the select is in
     the DOM and permanently hidden, and the wait burned its full 30s every run.
     Hoisting the same toggle is the whole fix; the later guarded call below now
     finds aria-expanded="true" and correctly does nothing. */
  const loadoutToggle=page.locator('[data-action="toggle-deployment-loadout"]');
  if(await loadoutToggle.count()&&await loadoutToggle.getAttribute('aria-expanded')==='false')await touch(loadoutToggle);
  const mapSelect=planner.locator('[data-deploy="mapId"]');await mapSelect.waitFor({state:'visible',timeout:30000});
  const beforeMap=await planner.evaluate(node=>({value:node.querySelector('[data-deploy="mapId"]')?.value||'',disabled:!!node.querySelector('[data-action="deploy"]')?.disabled,areaId:node.dataset.selectedAreaId||'',mapSize:node.dataset.selectedMapSize||'',choices:[...node.querySelectorAll('[data-deploy="mapId"] option[data-ground-map]')].map(option=>({id:option.value,size:option.dataset.mapSize}))}));
  assert.equal(beforeMap.value,'','new deployment requires an explicit battlefield choice');assert.equal(beforeMap.disabled,true,'deploy stays blocked before battlefield choice');assert.equal(beforeMap.areaId,groundArea.id);assert.equal(beforeMap.mapSize,'');assert.deepEqual(beforeMap.choices.map(choice=>choice.size),['compact','standard','large']);
  await mapSelect.selectOption(groundMap.id);await page.locator('[data-action="deploy"]:enabled').waitFor({state:'visible',timeout:30000});
  report.battlefieldSelection=await planner.evaluate(node=>({areaId:node.dataset.selectedAreaId,mapId:node.dataset.selectedMapId,mapSize:node.dataset.selectedMapSize,rootAreaId:document.querySelector('.uga-command-shell')?.dataset.selectedAreaId,rootMapId:document.querySelector('.uga-command-shell')?.dataset.selectedMapId,rootMapSize:document.querySelector('.uga-command-shell')?.dataset.selectedMapSize}));
  assert.deepEqual(report.battlefieldSelection,{areaId:groundArea.id,mapId:groundMap.id,mapSize:groundMap.size,rootAreaId:groundArea.id,rootMapId:groundMap.id,rootMapSize:groundMap.size},'player-facing battlefield identity is explicit on planner and root contracts');
  report.beforeDeployment=await page.evaluate(()=>window.__MASSFRONT_SPACE__.getState());report.commanderUi=await page.locator('[data-deploy="commanderId"]').evaluate(e=>({value:e.value,choices:e.options.length,placeholder:!!e.parentElement.querySelector('.uga-portrait-unavailable')}));report.missingPortraitInjected=process.env.MF_MISSION_MISSING_PORTRAIT==='1';await page.screenshot({path:out+'/01-deployment.png'});
  if(report.missingPortraitInjected){assert.ok(report.blockedPortraitRequests>0,'portrait failure reached network');assert.equal(report.commanderUi.placeholder,true,'honest cosmetic-unavailable fallback');assert.equal(report.commanderUi.value,'nova_kai');}
  await visualCheck('01-deployment','[data-action="deploy"]');
  /* Loadout was expanded above, before the battlefield wait. Kept guarded rather
     than removed so a future planner that re-collapses between those points
     still reaches the specialists. */
  if(await loadoutToggle.count()&&await loadoutToggle.getAttribute('aria-expanded')==='false')await touch(loadoutToggle);
  const specialistValues=await page.locator('[data-specialist]').evaluateAll(selects=>selects.map(select=>select.value));
  assert.equal(new Set(specialistValues).size,3,'default deployment starts with three unique specialists');
  await page.locator('[data-specialist]').nth(1).selectOption(specialistValues[0]);
  await page.waitForTimeout(500);
  const duplicateState=await page.evaluate(()=>{const values=[...document.querySelectorAll('[data-specialist]')].map(select=>select.value);const deploy=document.querySelector('[data-action="deploy"]'),blocker=document.querySelector('[data-deployment-blocker]');return {values,disabled:!!deploy?.disabled,blocker:blocker&&!blocker.hidden?blocker.innerText:''};});
  if(new Set(duplicateState.values).size<3){assert.equal(duplicateState.disabled,true,'duplicate specialists must block deployment');assert.match(duplicateState.blocker,/exactly three unique specialists/i,'duplicate specialists show the exact blocker');}
  else assert.equal(new Set(duplicateState.values).size,3,'the planner must reject or auto-correct duplicate specialists');
  const duplicateBlocker=duplicateState.blocker||'Duplicate selection auto-corrected to three unique specialists.';
  await page.locator('[data-specialist]').nth(1).selectOption(specialistValues[1]);
  await page.locator('[data-action="deploy"]:enabled').waitFor({state:'visible'});
  const lineSection=page.locator('[data-deploy-unit="line_section"]');
  const lineSectionOriginal=await lineSection.inputValue();
  await lineSection.selectOption('4');
  await page.locator('[data-action="deploy"]:disabled').waitFor({state:'visible'});
  const capacityBlocker=await page.locator('[data-deployment-blocker]:visible').innerText();
  assert.match(capacityBlocker,/Deployment uses \d+ of \d+ available slots/i,'over-capacity manifest blocks deployment before launch');
  await page.locator('[data-deploy-unit="line_section"]').selectOption(lineSectionOriginal);
  await page.locator('[data-action="deploy"]:enabled').waitFor({state:'visible'});
  report.readinessChecks={specialistValues,duplicateBlocker,capacityBlocker,recovered:true};
  await page.screenshot({path:out+'/01a-readiness-recovered.png'});
  if(process.env.MF_MISSION_UI_ONLY==='1'){
    if(await loadoutToggle.count()&&await loadoutToggle.getAttribute('aria-expanded')==='false')await loadoutToggle.click();
    report.polish=[];
    for(const viewport of [{width:412,height:900},{width:900,height:412}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(700);
      for(const station of await page.locator('.uga-deployment-station').all()){
        await station.scrollIntoViewIfNeeded();const r=await station.evaluate(e=>{const a=e.getBoundingClientRect(),scroll=e.closest('.uga-deployment-fields').getBoundingClientRect(),footer=e.closest('.uga-deployment-planner').querySelector('.uga-deployment-readiness').getBoundingClientRect();return {station:e.dataset.deploymentStation,bottom:a.bottom,top:a.top,scrollTop:scroll.top,scrollBottom:scroll.bottom,footerTop:footer.top};});assert.ok(r.bottom<=r.footerTop+1&&r.top>=r.scrollTop-1,'each station scrolls fully above reserved footer');report.polish.push({viewport,...r});
      }
      await visualCheck(`polish-deployment-${viewport.width}`,'[data-action="deploy"]');
    }
    await page.locator('[data-action="deployment-back"]').click();await page.locator('[data-nav="ship"]').click();await page.waitForTimeout(700);
    report.headerRects=await page.evaluate(()=>{const header=document.querySelector('.uga-command-header').getBoundingClientRect(),rail=document.querySelector('.uga-district-rail').getBoundingClientRect();return {headerBottom:header.bottom,railTop:rail.top,captions:[...document.querySelectorAll('.uga-resource small')].map(e=>e.getBoundingClientRect().bottom)};});assert.ok(report.headerRects.railTop>=Math.max(...report.headerRects.captions),'rail clears complete resource captions');await page.screenshot({path:out+'/polish-header-900.png'});report.pass=true;report.steps.push('focused-portrait-landscape-footer-and-header');break mission;
  }
  await page.locator('[data-action="deploy"]').click();await page.waitForURL(/groundOperation=/,{timeout:30000});report.steps.push('real-ui-deployment-opaque-bridge');
  await page.waitForFunction(()=>window.__MF_GALACTIC_BRIDGE?.active||window.__MF_GALACTIC_BRIDGE?.reason,null,{timeout:90000});
  report.bridge=await page.evaluate(()=>({active:window.__MF_GALACTIC_BRIDGE?.active,status:window.__MF_GALACTIC_BRIDGE?.status,reason:window.__MF_GALACTIC_BRIDGE?.reason,playerLocation:window.__MF_GALACTIC_BRIDGE?.playerLocation,runtimeMapId:window.__MF_GALACTIC_BRIDGE?.runtimeMapId,battlefield:window.__MF_GALACTIC_BRIDGE?.request?.operation?.battlefield,tacticalProfile:window.__MF_GALACTIC_BRIDGE?.tacticalProfile,setup:window.__MF_GALACTIC_BRIDGE?.sandboxMeta?.setup,
    /* The globals the live match is actually running on. The setup record is a
       report; these are the match. They were literals until the region ladder
       landed, so assert the region reached the rules and not just the payload. */
    applied:{timeLimit:typeof timeLimit!=='undefined'?timeLimit:null,resPace:typeof resPace!=='undefined'?resPace:null,crateRate:typeof crateRate!=='undefined'?crateRate:null,defenseFocus:typeof defenseFocus!=='undefined'?defenseFocus:null,
      playerStartZone:typeof playerStartZone!=='undefined'?playerStartZone:null,deploymentPackage:typeof deploymentPackage!=='undefined'?deploymentPackage:null},
    chose:{landingZoneId:window.__MF_GALACTIC_BRIDGE?.request?.operation?.landingZoneId,doctrineId:window.__MF_GALACTIC_BRIDGE?.request?.operation?.doctrineId}}));assert.equal(report.bridge.active,true);
  {const SPAWNS={relay_shadow:'sw',maintenance_spar:'se',customs_ring:'sw',cargo_lock:'se',service_lock:'sw',freight_shadow:'se',broken_spine:'sw',aft_lattice:'se',umbra_platform:'sw',coolant_trench:'se',vault_aperture:'sw',collapsed_gallery:'se',clinic_roof:'sw',transit_court:'se',maintenance_shaft:'sw',sealed_platform:'se',vascular_breach:'sw',thermal_vent:'se'};
   const PKGS={methodical:'prepared',containment:'prepared',rapid:'expedition',covert:'expedition'};
   const chosenZone=report.bridge.chose.landingZoneId,chosenDoctrine=report.bridge.chose.doctrineId;
   assert.ok(chosenZone,'the operation must carry the landing zone the player chose');
   assert.equal(report.bridge.applied.playerStartZone,SPAWNS[chosenZone],`the match must spawn at the chosen landing zone (${chosenZone}), not a constant`);
   assert.equal(report.bridge.applied.deploymentPackage,PKGS[chosenDoctrine],`the match must land with the package the ${chosenDoctrine} doctrine selects`);}
  {const expected={compact:{timeLimit:600,resPace:1.6},standard:{timeLimit:900,resPace:1},large:{timeLimit:1500,resPace:0.7}}[groundMap.size];
   assert.equal(report.bridge.applied.timeLimit,expected.timeLimit,`the ${groundMap.size} map must run its own timer, not a constant`);
   assert.equal(report.bridge.applied.resPace,expected.resPace,`the ${groundMap.size} map must run its own resource pace`);
   /* The exposed bridge does not publish sandboxMeta, so the setup record is
      only cross-checked when it is actually observable. The applied globals
      above are the match itself and stay unconditionally asserted; a mirror of
      them is not worth a false failure. */
   if(report.bridge.setup&&Object.keys(report.bridge.setup).length){
     assert.equal(report.bridge.setup.tl,report.bridge.applied.timeLimit,'the setup record must report the timer the match is running');
     assert.equal(report.bridge.setup.rp,report.bridge.applied.resPace,'the setup record must report the pace the match is running');}}assert.equal(report.bridge.battlefield?.location?.areaId,groundArea.id);assert.equal(report.bridge.battlefield?.location?.mapId,groundMap.id);assert.equal(report.bridge.battlefield?.location?.size,groundMap.size);assert.equal(report.bridge.playerLocation?.mapId,groundMap.id);assert.equal(report.bridge.runtimeMapId,groundMap.runtimeTemplateMapId);assert.doesNotMatch(JSON.stringify(report.bridge.playerLocation),/nordhall|vespera|pyraeth/i,'player-facing bridge identity never leaks the internal terrain template lore');
  await page.waitForFunction(()=>matchLive||document.getElementById('deployBtn')?.getBoundingClientRect().height>0,null,{timeout:60000});
  if(!await page.evaluate(()=>matchLive)){
    // Touch commits on pointer-up and replaces this button immediately. Verify
    // the actual landing if the automation notices it disappearing mid-action.
    try{await page.locator('#deployBtn').tap({timeout:5000});}catch(e){if(!await page.evaluate(()=>matchLive))throw e;}
  }
  await page.waitForFunction(()=>matchLive&&window.__MF_GALACTIC_BRIDGE.packageApplied,null,{timeout:15000});report.steps.push('real-tactical-package-landed');
  report.liveObjective=await page.evaluate(()=>({goalSel,goal:goalDef(),status:goalStatus(),activeWarMode,matchLive,running}));
  assert.equal(report.liveObjective.goal.id,mission.missionType==='uga_brood_purge'?'purge':'domination');
  assert.equal(report.liveObjective.goal.objectiveType,mission.objective.type);
  assert.ok(report.liveObjective.goal.nm&&report.liveObjective.goal.ds,'live operation must retain authored player-facing objective copy');
  if(report.liveObjective.goal.id==='domination')assert.match(report.liveObjective.status,new RegExp(report.liveObjective.goal.hud,'i'),'domination HUD names the authored operation target');
  assert.equal(report.liveObjective.activeWarMode,'galactic');assert.equal(report.liveObjective.matchLive,true);assert.equal(report.liveObjective.running,true);
  await page.screenshot({path:out+'/01b-live-battle.png'});
  if(mobile){
    report.touchSelectionSetup=await page.evaluate(()=>{
      paused=true;if(typeof closeMenus==='function')closeMenus();clearSel();
      const card=document.getElementById('unitCard');if(card){card.classList.remove('pinned');card.style.display='none';}
      if(heroIdx<0||!ualive[heroIdx])throw new Error('live Commander unavailable after deployment');
      if(typeof intelSeenTypes==='object'&&intelSeenTypes)delete intelSeenTypes[utype[heroIdx]];
      camFollow=-1;cam.x=ux[heroIdx];cam.y=uy[heroIdx];orthoSpan=Math.max(360,Math.min(520,typeof zoomSpanMax==='function'?zoomSpanMax():520));distTarget=orthoSpan;
      clampCam();camUpdateMatrices();updateSelInfo();
      const point=w2s(ux[heroIdx],uy[heroIdx],terrainH(ux[heroIdx],uy[heroIdx])+TYPES[utype[heroIdx]].size*.55);
      return {hero:heroIdx,type:utype[heroIdx],point,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx]};
    });
    const commanderPoint=report.touchSelectionSetup.point;
    assert.ok(commanderPoint[0]>20&&commanderPoint[0]<392&&commanderPoint[1]>80&&commanderPoint[1]<690,'Commander is outside the unobstructed phone battlefield');
    await page.touchscreen.tap(commanderPoint[0],commanderPoint[1]);await page.waitForTimeout(180);
    report.touchSelection=await page.evaluate(()=>({selected:selCount(),heroSelected:!!usel[heroIdx],infoVisible:getComputedStyle(document.getElementById('unitCard')).display!=='none',target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx]}));
    assert.equal(report.touchSelection.heroSelected,true,'touching the Commander did not select it');assert.equal(report.touchSelection.selected,1,'Commander touch selected an unexpected group');assert.equal(report.touchSelection.infoVisible,false,'Commander selection auto-opened the info card');
    await page.screenshot({path:out+'/01c-commander-selected.png'});
    const abilities=page.locator('.hudDeckBtn[data-deck="abilities"]').first();assert.equal(await abilities.isDisabled(),false,'Abilities deck is disabled for the selected Commander');await touch(abilities);await page.locator('#hotSlots').waitFor({state:'visible',timeout:5000});
    await page.evaluate(()=>{resE[0]=Math.max(resE[0],99999);if(typeof commanderWeaponCool!=='undefined')commanderWeaponCool[1]=0;if(typeof commanderWeaponButtonState==='function')commanderWeaponButtonState();if(typeof hotSlotSync==='function')hotSlotSync(true);});
    const slot=page.locator('#hotSlots .hotSlot[data-hot-src="abSecondary"]').first();assert.equal(await slot.isVisible(),true,'Commander secondary hot-slot is not visible');
    report.touchBeforeAbility=await page.evaluate(()=>({aiming,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx]}));await touch(slot);await page.waitForTimeout(180);
    report.touchArmed=await page.evaluate(()=>({aiming,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx],selected:selCount(),hotOn:document.querySelector('#hotSlots .hotSlot[data-hot-src="abSecondary"]')?.classList.contains('on')||false,ownerOn:document.getElementById('abSecondary')?.classList.contains('on')||false}));
    assert.equal(report.touchArmed.aiming,8,'secondary hot-slot did not arm its authoritative targeting mode');assert.deepEqual(report.touchArmed.target,report.touchBeforeAbility.target,'pressing the ability issued a move order');assert.equal(report.touchArmed.selected,1,'pressing the ability changed selection');await page.screenshot({path:out+'/01d-secondary-armed.png'});
    const abilityTarget=await page.evaluate(()=>{const W=commanderWeaponDef(1),d=Math.max(40,Math.min(90,(W&&W.range||160)*.35)),point=w2s(ux[heroIdx]+d,uy[heroIdx],terrainH(ux[heroIdx]+d,uy[heroIdx])+3);return {point,range:W&&W.range||0};});
    assert.ok(abilityTarget.point[0]>10&&abilityTarget.point[0]<402&&abilityTarget.point[1]>70&&abilityTarget.point[1]<700,'ability target is outside the unobstructed phone battlefield');await page.touchscreen.tap(abilityTarget.point[0],abilityTarget.point[1]);await page.waitForTimeout(220);
    report.touchFired=await page.evaluate(()=>({aiming,target:[utx[heroIdx],uty[heroIdx]],state:ustate[heroIdx],cooldown:commanderWeaponCool[1],selected:selCount()}));
    assert.ok(report.touchFired.cooldown>0,'target tap did not fire the selected Commander ability');assert.deepEqual(report.touchFired.target,report.touchBeforeAbility.target,'ability target tap leaked into a move order');assert.equal(report.touchFired.selected,1,'ability target tap changed selection');await page.screenshot({path:out+'/01e-secondary-fired.png'});report.steps.push('mobile-commander-selection-and-ability-touch');
  }
  report.tacticalFixture=await page.evaluate(()=>{let units=0,buildings=0;for(let i=0;i<ualive.length;i++)if(ualive[i]&&uteam[i]!==0){dealDamage(i,1e9,0);units++;}for(let i=0;i<blds.length;i++)if(blds[i].alive&&blds[i].team!==0){damageBld(i,1e9,0);buildings++;}checkVictory();return {units,buildings,gameEnded,goal:goalDef().id};});
  await page.waitForFunction(()=>window.__MF_GALACTIC_BRIDGE?.report,null,{timeout:15000});report.tacticalReport=await page.evaluate(()=>window.__MF_GALACTIC_BRIDGE.report);
  report.levelUpChoices=0;
  for(let n=0;n<30&&await page.locator('#levelUp').isVisible();n++){await page.locator('#luCards .upCard').first().tap();report.levelUpChoices++;await page.waitForTimeout(100);}
  await page.locator('#restartBtn').click();await page.waitForURL('**/modules/space_exploration/index.html*');await ready();
  await page.waitForFunction(()=>window.__MASSFRONT_GALACTIC_RESULT__,null,{timeout:30000});
  report.receipt=await page.evaluate(()=>window.__MASSFRONT_GALACTIC_RESULT__);report.afterResult=await page.evaluate(()=>window.__MASSFRONT_SPACE__.getState());
  assert.equal(report.receipt.accepted,true);assert.equal(report.afterResult.operations.pending,null);
  assert.equal(report.afterResult.operations.history.length,report.beforeDeployment.operations.history.length+1);
  const history=report.afterResult.operations.history.at(-1);assert.equal(report.afterResult.operations.appliedResultIds.filter(id=>id===history.result.resultId).length,1);
  for(const [key,value] of Object.entries(report.beforeDeployment.resources))assert.equal(report.afterResult.resources[key],value-(history.operation.deploymentCost[key]||0)+(history.result.rewards[key]||0),`exactly one net ${key} reward`);
  await page.locator('#operationModal[data-operation-state="debrief"]').waitFor({state:'visible'});assert.equal(await page.locator('#btnSimVictory').isVisible(),false);assert.equal(await page.locator('#btnSimSetback').isVisible(),false);await visualCheck('02-debrief','#btnCancelOperation');
  await page.locator('#btnCancelOperation').click();await page.waitForFunction(()=>window.__MASSFRONT_SPACE__.commandScene.selectedDistrictId==='command');await visualCheck('03-return-services','[data-return-services] [data-district="engineering"]');
  await page.waitForFunction(()=>!window.__MASSFRONT_SPACE__.commandScene.tween,null,{timeout:10000});
  report.returnRoomBounds=await page.evaluate(()=>{const s=window.__MASSFRONT_SPACE__.commandScene,room=s.districtRoots.get('command'),bounds=s._districtBounds(room),canvas=s.renderer.domElement.getBoundingClientRect(),panel=document.querySelector('.uga-context-panel').getBoundingClientRect();if(!bounds)return {missing:true};s.camera.updateMatrixWorld(true);const points=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=bounds.min.clone().set(x,y,z).project(s.camera);points.push({x:canvas.left+(p.x+1)*canvas.width/2,y:canvas.top+(1-p.y)*canvas.height/2,z:p.z});}return {selected:s.selectedDistrictId,authoredRoot:s.deckTopologyRoot?.name,room:room.name,points,projected:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))},canvas:{left:canvas.left,right:canvas.right,top:canvas.top,bottom:canvas.bottom},panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom}};});
  assert.equal(report.returnRoomBounds.selected,'command');assert.equal(report.returnRoomBounds.authoredRoot,'NEXUS_VII_LONGITUDINAL_CUTAWAY');assert.ok(report.returnRoomBounds.points.every(p=>p.z>=-1&&p.z<=1),'authored room inside camera depth');
  const projected=report.returnRoomBounds.projected,inspector=report.returnRoomBounds.panel;assert.ok(projected.left>=-1&&projected.right<=report.viewport.width+1,'authored room within canvas width');if(mobile)assert.ok(projected.bottom<=inspector.top+1,'authored Command room fully above expanded inspector');else assert.ok(projected.right<=inspector.left+1,'authored Command room left of inspector');await page.screenshot({path:out+'/03-return-services.png'});
  report.returnSurface=await page.locator('.uga-context-panel').innerText();assert.match(report.returnSurface,/UPGRADES|Upgrade/i);report.steps.push('result-debrief-original-command-services');
  await page.reload();await ready();report.afterReload=await page.evaluate(()=>window.__MASSFRONT_SPACE__.getState());assert.deepEqual(report.afterReload.resources,report.afterResult.resources);assert.equal(report.afterReload.operations.history.length,report.afterResult.operations.history.length);report.steps.push('reload-does-not-pay-again');
  assert.ok(report.resultReturnUrl,'captured real tactical return URL');await page.goto(report.resultReturnUrl);await ready();await page.waitForTimeout(1500);report.afterReplay=await page.evaluate(()=>({state:window.__MASSFRONT_SPACE__.getState(),error:String(window.__MASSFRONT_SPACE_ERROR__||'')}));assert.deepEqual(report.afterReplay.state.resources,report.afterResult.resources);assert.equal(report.afterReplay.state.operations.history.length,report.afterResult.operations.history.length);report.steps.push('actual-return-url-replay-does-not-pay-again');
  assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.pass=false;report.failure=e.stack;report.failedUrl=page?.url();if(page){report.runtimeFailure=await page.evaluate(()=>({matchLive:typeof matchLive==='undefined'?null:matchLive,carrier:typeof carrier==='undefined'?null:carrier,bridge:window.__MF_GALACTIC_BRIDGE?{active:window.__MF_GALACTIC_BRIDGE.active,status:window.__MF_GALACTIC_BRIDGE.status,reason:window.__MF_GALACTIC_BRIDGE.reason,packageApplied:window.__MF_GALACTIC_BRIDGE.packageApplied,packageSummary:window.__MF_GALACTIC_BRIDGE.packageSummary}:null})).catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});}}
 finally{await Promise.all(servedHashJobs);if(report.before){report.after=await hashes();report.drift=JSON.stringify(report.before)!==JSON.stringify(report.after);if(packed){report.packageAfter=await hashes(serveRoot);report.packageDrift=JSON.stringify(report.packageBefore)!==JSON.stringify(report.packageAfter);if(report.packageDrift)report.pass=false;}if(report.drift)report.pass=false;}if(browser)await closePwBrowser(browser);if(server)await new Promise(r=>server.close(r));if(guard){try{await guard.release({assertStable:true,name:'mission return acceptance'});report.freezeStable=true;}catch(e){report.freezeStable=false;report.freezeFailure=e.stack||String(e);report.pass=false;}}report.finishedAt=new Date().toISOString();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,steps:report.steps,failure:report.failure,failedUrl:report.failedUrl,drift:report.drift}));process.exitCode=report.pass?0:1;
