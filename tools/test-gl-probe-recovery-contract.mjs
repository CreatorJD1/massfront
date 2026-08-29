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
const source=await readFile(resolve(ROOT,'tools','verify-gl-probe-recovery.mjs'),'utf8');
const at=needle=>source.indexOf(needle);

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
  'gl.isTexture(atlasTex)',
  'state.refs.prog3D!==prog3D',
  'state.refs.terrVAO!==terrVAO',
  'gl.readPixels(',
  'actualRecovery.before.preErrors.length===0',
  'actualRecovery.after.render.staleErrors.length===0',
  'readback.nonZeroRgb>64',
  'readback.variance>0.1',
  "await capture(page,'actual-context-lost.png')",
  "await capture(page,'actual-context-restored.png')"
]) assert.ok(source.indexOf(required,realCycle)>=realCycle,
  `real WEBGL_lose_context cycle lost proof: ${required}`);

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
