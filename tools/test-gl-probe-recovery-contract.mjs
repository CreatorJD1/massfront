#!/usr/bin/env node
/* Fast source contract for the long hardware GL recovery acceptance lane.
   This deliberately does not launch Chromium: it prevents a later edit from
   silently weakening source identity, isolation, real context-loss, or final
   artifact requirements before the expensive capture is scheduled. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const [source,recoverySource,materialSource,terrainTextureSource,meshSource,terrainSource,modelSource,modkitSource,adSource,noiseSource]=await Promise.all([
  readFile(resolve(ROOT,'tools','verify-gl-probe-recovery.mjs'),'utf8'),
  readFile(resolve(ROOT,'src','glrecover.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','materials.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','gl.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','mesh.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','terrain.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','models.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','modkit.js'),'utf8'),
  readFile(resolve(ROOT,'src','adboards.js'),'utf8'),
  readFile(resolve(ROOT,'src','engine','noisegen.js'),'utf8')
]);
const at=needle=>source.indexOf(needle);

for(const required of [
  "step('terrainTextureGLReset'", "step('materialGLReset'", "step('modAttachGLReset'",
  "step('initModels'", "step('adGLReset'"
]) assert.ok(recoverySource.includes(required),`ordered recovery lost GPU cache reset: ${required}`);
assert.ok(recoverySource.indexOf("step('terrainTextureGLReset'")<recoverySource.indexOf("step('initGL3D'"),
  'terrain texture handles must be discarded before any restored-context builder runs');
assert.ok(recoverySource.indexOf("step('materialGLReset'")<recoverySource.indexOf("step('buildMatAtlas'"),
  'material handles must be discarded before rebuilding the atlas');
assert.ok(recoverySource.indexOf("step('modAttachGLReset'")<recoverySource.indexOf("step('initModels'")&&
  recoverySource.indexOf("step('adGLReset'")>recoverySource.indexOf("step('initModels'"),
  'lazy module caches reset before models and ad frame resources rebuild after models');
assert.ok(recoverySource.includes("step('terrainGLRebuild'")&&!recoverySource.includes("step('buildTerrain'"),
  'context recovery must re-upload live terrain state without regenerating the map');
assert.match(materialSource,/function materialGLReset\(\)\{\s*matTex=matNrmTex=matOrmTex=matDamageTex=matDetailTex=null;/,
  'all five material atlas handles must be invalidated together');
for(const required of ['terrTexLoadEpoch++','detailTex=groundMaskTex=terrainTex=null','terrNeutralNrm=null','terrTexSetReady=false'])
  assert.ok(terrainTextureSource.includes(required),`terrain texture reset lost invariant: ${required}`);
for(const required of ['function uploadTerrainCanvasTex()','function uploadGroundMaskTex()','detailTex=groundMaskTex=terrainTex=null'])
  assert.ok(terrainTextureSource.includes(required),`terrain GPU-only recovery lost upload seam: ${required}`);
for(const required of ["const contextEpoch=typeof glEpoch==='number'?glEpoch:0",'const liveContext=()=>contextEpoch===',
  'if(!liveContext())return','if(epoch!==terrTexLoadEpoch||!liveContext())'])
  assert.ok(terrainTextureSource.includes(required),`terrain decode generation fence lost invariant: ${required}`);
assert.ok(terrainTextureSource.indexOf('if(epoch!==terrTexLoadEpoch||!liveContext())')<
  terrainTextureSource.indexOf('const t=gl.createTexture();',terrainTextureSource.indexOf('const upload=(key,im,source)')),
  'late terrain decode callbacks must be fenced before allocating in a replacement context');
assert.ok(terrainTextureSource.includes("atlasEpoch!==(typeof glEpoch==='number'?glEpoch:0)||tex!==atlasTex"),
  'authored-fire decode must not upload into a replaced atlas generation');
assert.match(modelSource,/function initModels\(\)\{[\s\S]{0,500}?for\(const fac in BLD_FACTION_MESH\) delete BLD_FACTION_MESH\[fac\];/,
  'initModels must discard lazy non-Nova InstMeshes from the lost context');
assert.match(terrainSource,
  /function terrainGLRebuild\(\)[\s\S]{0,500}?buildTerrainMesh[\s\S]{0,500}?uploadHeightTex\(null\)[\s\S]{0,500}?uploadTerrainCanvasTex\(\)[\s\S]{0,500}?uploadGroundMaskTex\(\)/,
  'terrain recovery must rebuild only GPU mesh, height, painted canvas and mask resources');
assert.match(terrainSource,/function terrainGLRebuild\(\)[\s\S]{0,1000}?gl\.isTexture\(old\)[\s\S]{0,200}?gl\.deleteTexture\(old\)/,
  'live-context terrain self-heal must release replaced canvas and mask textures');
for(const required of ['function modAttachGLReset()','delete MOD_ATTACH_MESH[id]','modAttachLive=[]',"modAttachSig=''"])
  assert.ok(modkitSource.includes(required),`module attachment recovery lost invariant: ${required}`);
for(const required of ['function adGLReset()','delete AD_CTX_TEX_CACHE[id]','adInitScreenProgram()','adFallbackTex = adMakeTex()',
  'adResetCreativeTextures(AD_CREATIVES[id], generation)','adFrameMesh = new InstMesh'])
  assert.ok(adSource.includes(required),`ad-board recovery lost invariant: ${required}`);
assert.ok(adSource.includes('generation !== adGlGeneration || posterTex !== c.posterTex'),
  'poster decode callbacks must be fenced from a replacement GL generation');
for(const required of ["const epoch=typeof glEpoch==='number'?glEpoch:0",'MF_ASSET_TEX[url]!==rec',
  'for(const k in MF_ASSET_TEX) delete MF_ASSET_TEX[k]'])
  assert.ok(meshSource.includes(required),`asset texture recovery lost async fence: ${required}`);
const noiseReset=noiseSource.slice(noiseSource.indexOf('function mfNoiseGLReset()'),noiseSource.indexOf('function mfNoiseCtxCheck()'));
assert.doesNotMatch(noiseReset,/gl\.deleteTexture|deleteTexture\(/,
  'context recovery must discard old noise handles without deleting them through the restored wrapper');

for(const required of [
  "import { collectEvidenceIdentity, sha256File } from './evidence-foundation/fingerprints.mjs'",
  "import { inspectPng } from './evidence-foundation/png-evidence.mjs'",
  "import { acquireVerificationFreeze } from './evidence-foundation/workspace-guard.mjs'",
  "import { installOfflineNetworkIsolation } from './offline-network-isolation.mjs'",
  "const outDir=join(tmpRoot,'gl-probe-recovery')",
  "REFUSED_UNBOUNDED_OUTPUT",
  "entry.name.startsWith(name+'.partial-')",
  "allowedPaths:[outDir]",
  "sourceBefore=await collectEvidenceIdentity({root})",
  "sourceAfter=await collectEvidenceIdentity({root})",
  "machineOutcome:'PENDING_FINAL_RELEASE'",
  "schema:'massfront.gl-probe-recovery/v3'",
  "await guard.release({assertStable:true,name:'Stage 8 GL recovery final release'})",
  "hashStable:current.sha256===row.sha256",
  "dimensionsStable:current.width===viewport.width*viewport.deviceScaleFactor",
  "serviceWorkers:'block'",
  "row.networkIsolation=await installOfflineNetworkIsolation(page)",
  "networkEvidence.length===4&&networkEvidence.every(row=>!row.error&&offlineSnapshotPass(row.snapshot))",
  "main:await sha256File(join(root,'src','main.js'))",
  "const expectedForcedContextConsole='WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost'",
  "if(message.type()!=='error')return",
  "body===expectedForcedContextConsole",
  "forcedContextConsole.seen<forcedContextConsole.allowed",
  "const forcedContextConsole={active:false,label:'normal-after-probe',allowed:1,seen:0}",
  "forcedContextConsole.active=true",
  "finally{forcedContextConsole.active=false;}"
]) assert.ok(source.includes(required),`GL recovery verifier lost contract: ${required}`);

const acquired=at('guard=await acquireVerificationFreeze(');
const prepared=at('outputPreparation=await prepareOutput()');
const identityBefore=at('sourceBefore=await collectEvidenceIdentity({root})');
const browserLaunch=at('browser=await launchPwBrowser({headless:true})');
assert.ok(acquired>=0&&prepared>acquired&&identityBefore>prepared&&browserLaunch>identityBefore,
  'verification freeze and source identity must precede output cleanup and browser launch');
assert.ok(at("await guard.checkpoint('GL recovery browser path complete')")>browserLaunch,
  'browser completion must be checkpointed under the verification freeze');
assert.ok(at("await guard.checkpoint('before completion source identity')")>browserLaunch,
  'final source identity must be checkpointed under the verification freeze');

const realCycle=at('async function runActualContextRecovery(page)');
const realCycleEnd=at('async function main()');
const manualCycle=at('const recovery=await recovered.evaluate');
const recoveredBoot=at('const recoveredBoot=await waitForHardwareBoot(recovered)');
const recoveredReady=at("await recovered.waitForFunction(()=>typeof bootConfirmed!=='undefined'");
const liveEntry=at('productionMatch=await enterLocalPlayerMatch(normal)');
const realCall=at('actualRecovery=await runActualContextRecovery(normal)');
const normalFinalized=at('await finalizeNetworkPage(normalRow)');
assert.ok(realCycle>=0&&realCycleEnd>realCycle&&manualCycle>realCycleEnd&&liveEntry>manualCycle&&
  realCall>liveEntry&&normalFinalized>realCall,
  'diagnostic simulations must stay separate and the real driver cycle must run inside the deployed normal page');
assert.ok(recoveredBoot>=0&&recoveredReady>recoveredBoot&&manualCycle>recoveredReady,
  'manual recovery harness must wait for the post-gl.js runtime before reading its bindings');
for(const required of ['glrRebuildResources','glrQualityDown','glrOnLost','glrOnRestored','glrGiveUp',
  'glrRecoveryURL','glrHide','mfPerfGLReset','running','paused','gameEnded'])
  assert.ok(source.indexOf("typeof "+required,recoveredReady)>recoveredReady&&source.indexOf("typeof "+required,recoveredReady)<manualCycle,
    `recovery runtime readiness lost binding: ${required}`);
assert.ok(!source.includes('runActualContextRecovery(recovered)'),
  'the real driver cycle must not fall back to the diagnostic/menu probe');
assert.doesNotMatch(source,/message\.type\(\)===['"]error['"]&&\//,
  'console.error recording must not be narrowed to a shader/WebGL regex');
const realBody=source.slice(realCycle,realCycleEnd);
assert.doesNotMatch(realBody,/(?:^|[;{}])\s*(?:running|paused|matchLive)\s*=(?!=)\s*/m,
  'real driver recovery must observe, not synthesize, active-match state');
for(const required of [
  "gl.getExtension('WEBGL_lose_context')",
  "canvas.addEventListener('webglcontextlost'",
  "canvas.addEventListener('webglcontextrestored'",
  'ext.loseContext()',
  'ext.restoreContext()',
  'state?.lostEvents===1',
  'state.restoredEvents===1',
  "typeof matchLive!=='undefined'&&matchLive===true",
  "typeof paused!=='undefined'&&paused===false",
  'state.rafFrames>=observed.rafFrames+3',
  'Number(stats.t)>observed.simTime+1/30',
  'pauseOwned:!!glrPauseOwned',
  'simAdvancedDuringLoss:Number(stats.t)-observed.simTime',
  'framesAfterRestore:state.rafFrames-state.restoreObserved.rafFrames',
  'simAdvancedAfterRestore:Number(stats.t)-state.restoreObserved.simTime',
  'glEpoch===state.before.epoch+1',
  'gl.isProgram(prog3D)',
  'gl.isProgram(progT)',
  'gl.isVertexArray(terrVAO)',
  'gl.isBuffer(terrVBO)',
  'gl.isBuffer(terrIBO)',
  'gl.isTexture(terrainTex)',
  'gl.isTexture(groundMaskTex)',
  'gl.isTexture(heightTex)',
  'gl.isTexture(atlasTex)',
  'gl.isTexture(matDamageTex)',
  'gl.isTexture(matDetailTex)',
  'gl.isProgram(adProg)',
  'gl.isVertexArray(adVAO)',
  'gl.isBuffer(adVBO)',
  'gl.isTexture(adFallbackTex)',
  'gl.isVertexArray(adFrameMesh.vao)',
  'state.refs.prog3D!==prog3D',
  'state.refs.terrVAO!==terrVAO',
  'state.refs.groundMaskTex!==groundMaskTex',
  'state.refs.heightTex!==heightTex',
  'gl.readPixels(',
  'actualRecovery.before.preErrors.length===0',
  'actualRecovery.after.render.staleErrors.length===0',
  'readback.nonZeroRgb>64',
  'readback.variance>0.1',
  "await capture(page,'actual-context-lost.png')",
  "await capture(page,'actual-context-restored.png')"
]) assert.ok(source.indexOf(required,realCycle)>=realCycle,
  `real WEBGL_lose_context cycle lost proof: ${required}`);
for(const required of ['cpuSignature()', 'actualRecovery.after.cpuState',
  'actualRecovery.after.cpuIdentityPreserved', 'Object.values(actualRecovery.after.cpuIdentityPreserved).every(Boolean)'])
  assert.ok(source.indexOf(required,realCycle)>=realCycle,
    `live CPU terrain preservation gate lost proof: ${required}`);

const liveEntryFunction=at('async function enterLocalPlayerMatch(page)');
assert.ok(liveEntryFunction>=0&&liveEntryFunction<realCycle,
  'the verifier must define a genuine local-player deployment path before recovery');
for(const required of [
  "'#startBtn'",
  "'.warCard[data-mode=\"standard\"]'",
  "const expectedStages=['galaxy','system','planet','region','deploy']",
  "'#setupStart'",
  "'#deployBtn'",
  "matchLive===true&&running===true&&paused===false",
  "document.body.classList.contains('hudTacticalDock')"
]) assert.ok(source.indexOf(required,liveEntryFunction)>=liveEntryFunction&&
  source.indexOf(required,liveEntryFunction)<realCycle,
  `local-player deployment path lost UI proof: ${required}`);
assert.ok(source.indexOf("pressVisible(page,'#setupStart','launch-battle'",liveEntryFunction)<realCycle&&
  source.indexOf("pressVisible(page,'#deployBtn','deploy-local-player'",liveEntryFunction)<realCycle,
  'disappearing launch/deploy controls must use their production keyboard path');
for(const required of [
  "actualRecovery.lost.lossObserved.pauseOwned",
  "actualRecovery.lost.rafFramesAfterLoss>=3",
  "Math.abs(actualRecovery.lost.simAdvancedDuringLoss)<1e-9",
  "actualRecovery.after.automatic.framesAfterRestore>=8",
  "actualRecovery.after.automatic.simAdvancedAfterRestore>1/30",
  "actualRecovery.after.automatic.drawCalls>0"
]) assert.ok(source.indexOf(required,realCall)>realCall,
  `active-match continuity gate lost assertion: ${required}`);

const labels=[...source.matchAll(/isolatedPage\(context,'([^']+)'\)/g)].map(match=>match[1]);
assert.deepEqual(labels,['first-probe','blocked-probe','recovered-probe','normal-after-probe'],
  'every browser page must be created by the isolated page factory exactly once');
const finalOffline=at('await finalizeAllNetworkPages()');
assert.ok(finalOffline>normalFinalized,
  'all offline page boundaries must finalize after the final browser capture');

const finalArtifactInspection=source.lastIndexOf('await inspectPng(row.path)');
const sourceAfter=at('sourceAfter=await collectEvidenceIdentity({root})');
const provisional=at('await writeJsonAtomic(reportPath,report)');
const release=at("await guard.release({assertStable:true,name:'Stage 8 GL recovery final release'})");
const pass=at("report.machineOutcome=failures===0&&guardReleased?'PASS':'FAIL'");
assert.ok(finalArtifactInspection>finalOffline&&sourceAfter>finalArtifactInspection&&
  provisional>sourceAfter&&release>provisional&&pass>release,
  'artifacts, source identity, provisional report, stable release and outcome must stay ordered');

console.log('PASS GL probe/recovery deterministic contract');
