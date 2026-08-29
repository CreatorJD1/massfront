#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source=await readFile(fileURLToPath(new URL('./verify-perf-terrain-acceptance.mjs',import.meta.url)),'utf8');
const guard=source.indexOf('workspaceGuard=await acquireVerificationFreeze');
const mkdir=source.indexOf('await mkdir(outDir');
const cleanup=source.indexOf('for(const name of await readdir(outDir))');
assert.ok(guard>=0&&guard<mkdir&&mkdir<cleanup,'terrain output changes before verification freeze acquisition');
assert.match(source,/allowedPaths:\[outDir\]/,'terrain verifier does not bound its allowed output');
assert.match(source,/if\(inside\(outDir,baselinePath\)\|\|inside\(outDir,baselineApprovalPath\)\)/,
  'terrain verifier can consume and erase baseline inputs from its own output directory');
for(const token of ["process.argv.indexOf('--baseline-approval')",'MassfrontTerrainBaselineApprovalV1',
  'approval.ownerApproved!==true','approval.immutable!==true','approval.baselineReportSha256!==reportSha256',
  'MassfrontPerfTerrainAcceptanceV3','candidate.source?.dirtyFingerprint','candidate.runtime?.fingerprint',
  'sameCaptureProfile(candidate.captureProfile)','candidate.runtime?.mode!==captureProfile.runtimeMode',
  'baseline artifact manifest is not the exact fixed terrain PNG set','const png=await inspectPng(path)',
  "if(inside(outDir,path))throw new Error('baseline artifact must be immutable input outside current output: '+row.name)",
  'png.sha256!==row.sha256','png.bytes!==row.bytes','png.width!==row.width','missingSharp'])
  assert.ok(source.includes(token),'terrain baseline validation omits '+token);
assert.match(source,/baselineDescriptor=\{available:false,requested:true[\s\S]*?reason:/,
  'invalid or unapproved baseline input does not remain explicitly unavailable');
assert.match(source,/await revalidateBaselineInputs\(\)/,
  'baseline input bytes are not revalidated at finalization');
assert.match(source,/owner-approved baseline report and PNG inputs remain immutable and hash-valid through comparison/,
  'baseline immutability does not participate in final outcome');

for(const token of [
  "import { ANDROID_S25_USER_AGENT, S25_VIEWPORT, assertMobileGpuBranch } from './mobile-device-profile.mjs'",
  'viewport:{width:S25_VIEWPORT.width,height:S25_VIEWPORT.height}',
  'deviceScaleFactor:S25_VIEWPORT.dpr','userAgent:ANDROID_S25_USER_AGENT',
  "assertMobileGpuBranch(report.device.mobileGpu,report.device.userAgent,'terrain/performance acceptance verifier')"
]) assert.ok(source.includes(token),'terrain mobile capture contract omits '+token);

const populationGate=source.indexOf('reference battle has exactly 48 authoritative live units per team before timing');
const timingPopulationGate=source.indexOf('reference battle retains exactly 48 authoritative live units per team at timing boundary');
const activityGate=source.indexOf('reference battle proves meaningful live projectile/beam/VFX activity before timing');
const frameTiming=source.indexOf('const battleFrames=await page.evaluate');
assert.ok(populationGate>=0&&timingPopulationGate>populationGate&&activityGate>timingPopulationGate&&frameTiming>activityGate,
  'terrain verifier starts timing before exact population and live-combat gates');
for(const token of ['requestedPerTeam=48','battleSetup.spawned[0]===48','battleSetup.spawned[1]===48',
  'battleSetup.authoritative.teamCount[0]===48','battleSetup.authoritative.teamCount[1]===48',
  'battleSetup.authoritative.alive[0]===48','battleSetup.authoritative.alive[1]===48',
  'REFERENCE_BATTLE_POPULATION_INVALID','REFERENCE_BATTLE_TIMING_POPULATION_INVALID',
  'battleWarm.live.authoritative.teamCount[0]===48','battleWarm.live.authoritative.alive[1]===48',
  'window.__mfBattleActivity.projectilesFired>=30',
  'window.__mfBattleActivity.beamsAdded>=3','REFERENCE_BATTLE_ACTIVITY_INVALID'])
  assert.ok(source.includes(token),'terrain reference battle gate omits '+token);
assert.match(source,/full reference battle RAF p99 <= 33\.3 ms'[\s\S]{0,100}?frameStats\.p99<=33\.3/,
  'terrain performance outcome is not governed by documented frame p99');
assert.match(source,/frames:\{\.\.\.frameStats/,'terrain report no longer exposes frame p95 and p99');

for(const token of ['const captureNames=[...baselineCaptureNames','REFUSED_UNDECLARED_TERRAIN_CAPTURE',
  'REFUSED_DUPLICATE_TERRAIN_CAPTURE','async function revalidateCaptureArtifacts(page)',
  "entry.name.toLowerCase().endsWith('.png')",'const bytes=await readFile(path)',
  'structure=await inspectPng(path)','decoded=await decodePngStats(page,bytes)',
  'structure.sha256===prior.sha256','structure.bytes===prior.bytes',
  'structure.width===captureProfile.viewport.width*captureProfile.viewport.dpr',
  'decoded.variance>4&&decoded.max-decoded.min>8','finalCaptureArtifacts=await revalidateCaptureArtifacts(page)'])
  assert.ok(source.includes(token),'terrain final PNG contract omits '+token);
const finalPng=source.indexOf('finalCaptureArtifacts=await revalidateCaptureArtifacts(page)');
const offlineClose=source.indexOf("networkIsolation.finalize('terrain/performance acceptance verifier')");
assert.ok(finalPng>=0&&offlineClose>finalPng,'terrain page closes before final PNG re-decode');

assert.match(source,/page\.on\('console',m=>\{if\(m\.type\(\)!=='error'\)return;/,
  'terrain verifier does not record every console.error');
assert.doesNotMatch(source,/m\.type\(\).*shader\\s|m\.type\(\).*INVALID_OPERATION/,
  'terrain console.error recording is narrowed to a GL regex');
assert.match(source,/machineOutcome=failed\.length\?'FAIL':notCovered\.length\?'INCOMPLETE':'PASS'/,
  'terrain verifier has no fail-closed PASS/INCOMPLETE outcome');
assert.match(source,/else if\(notCovered\.length\)exitStatus=2/,
  'uncovered required terrain gates still exit successfully');
const release=source.indexOf("workspaceGuard.release({assertStable:true");
const publish=source.indexOf('await writeFile(partial,JSON.stringify(report');
assert.ok(release>=0&&release<publish,'terrain report publishes before stable verification release');
assert.match(source,/source identity remains stable for the full capture/,
  'terrain verifier does not gate completion source identity');
assert.match(source,/runtime identity remains stable for the full capture/,
  'terrain verifier does not gate completion runtime identity');

console.log('PASS terrain/performance evidence contract');
