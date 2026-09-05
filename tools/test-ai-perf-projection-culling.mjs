import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectBattlefieldTelemetry } from './perf-lab/seeded-load-generator.mjs';

const units = [
  { alive: true, team: 0, x: 50, y: 50 },
  { alive: true, team: 2, x: 75, y: 75 },
  { alive: true, team: 2, x: 500, y: 500 },
  { alive: true, team: 1, x: 60, y: 60 },
  { alive: false, team: 2, x: 70, y: 70 }
];
const validBounds = { x0: 0, x1: 100, y0: 0, y1: 100 };

async function runTelemetry({ bounds = validBounds, width = 412, height = 900, projection = 'valid', noProjection = false } = {}) {
  const fog = { calls: 0, cacheRefreshes: 0 }, project = { calls: 0 };
  const ctx = vm.createContext({
    window: {}, innerWidth: 412, innerHeight: 900, VW: width, VH: height,
    unitHigh: units.length,
    ualive: Uint8Array.from(units.map(unit => unit.alive ? 1 : 0)),
    uteam: Uint8Array.from(units.map(unit => unit.team)),
    ux: Float64Array.from(units.map(unit => unit.x)),
    uy: Float64Array.from(units.map(unit => unit.y)),
    camBounds: () => bounds,
    fogEntityVisible: team => {
      fog.calls++;
      /* Mirrors the live predicate's derived intel-cache refresh side effect. */
      fog.cacheRefreshes++;
      return team !== 2;
    },
    Number, Math
  });
  if (!noProjection) ctx.w2s = (x, y) => {
    project.calls++;
    if (projection === 'invalid' && x === 75) return null;
    return x === 60 ? [999, 999] : [x, y];
  };
  const page = { evaluate: fn => vm.runInContext(`(${fn.toString()})()`, ctx) };
  return { result: await collectBattlefieldTelemetry(page), fog, project };
}

{
  const { result, fog, project } = await runTelemetry();
  assert.deepEqual({
    total: result.total, visible: result.visible, culled: result.culled,
    realBrood: result.realBrood, cameraVisibleBrood: result.cameraVisibleBrood,
    visibleBrood: result.visibleBrood
  }, { total: 4, visible: 1, culled: 3, realBrood: 2, cameraVisibleBrood: 1, visibleBrood: 0 });
  assert.equal(result.visibilitySupported, true);
  assert.equal(project.calls, 3,'off-bounds body must not be projected');
  assert.equal(fog.calls, 4,'fog predicate call schedule must include every live body');
  assert.equal(fog.cacheRefreshes,4,'bounds optimization must preserve intel-cache side effects');
}

for (const [label, options, reason, hasBounds] of [
  ['null bounds',{bounds:null},'camera-bounds-invalid',false],
  ['missing fields',{bounds:{}},'camera-bounds-invalid',true],
  ['NaN bounds',{bounds:{x0:0,x1:NaN,y0:0,y1:100}},'camera-bounds-invalid',true],
  ['reversed bounds',{bounds:{x0:100,x1:0,y0:0,y1:100}},'camera-bounds-invalid',true],
  ['invalid viewport',{width:NaN},'viewport-invalid',true],
  ['missing projection',{noProjection:true},'projection-unavailable',true]
]) {
  const { result, fog, project } = await runTelemetry(options);
  assert.equal(result.visibilitySupported,false,label);
  assert.equal(result.visibilityUnavailableReason,reason,label);
  assert.equal(result.hasCameraBounds,hasBounds,label);
  assert.equal(result.total,4,label);assert.equal(result.realBrood,2,label);
  for (const key of ['visible','culled','cameraVisibleBrood','visibleBrood']) assert.equal(result[key],null,`${label}: ${key}`);
  assert.equal(project.calls,0,`${label}: projection should not run`);
  assert.equal(fog.calls,4,`${label}: fog/cache schedule changed`);
}

{
  const { result, fog, project } = await runTelemetry({projection:'invalid'});
  assert.equal(result.visibilitySupported,false);
  assert.equal(result.visibilityUnavailableReason,'projection-invalid');
  assert.equal(result.total,4);assert.equal(result.realBrood,2);
  for (const key of ['visible','culled','cameraVisibleBrood','visibleBrood']) assert.equal(result[key],null,key);
  assert.equal(project.calls,3);assert.equal(fog.calls,4);
}

/* sampleFrames is private and coupled to rAF/native telemetry, so pin its real
   page-evaluate closure structurally while the exported one-shot closure above
   receives behavioral execution. */
const runner = fs.readFileSync(new URL('perf-lab/perf-probe-runner.mjs',import.meta.url),'utf8');
const start=runner.indexOf('let scannedTotal'),end=runner.indexOf('let proxy = null',start);
assert.ok(start>=0&&end>start,'runner reconciliation block missing');
const loop=runner.slice(start,end);
const fogAt=loop.indexOf("typeof fogEntityVisible !== 'function'"),boundsAt=loop.indexOf('if (!inBounds) continue'),
  projectionAt=loop.indexOf('const projected = w2s(x, y)');
assert.ok(fogAt>=0&&fogAt<boundsAt,'runner must preserve fog predicate before bounds rejection');
assert.ok(boundsAt>=0&&boundsAt<projectionAt,'runner must project only after bounds rejection');
for (const token of ['cameraVisibleBroodUnits: []','push(probe.cameraVisibleBroodUnits',
  'cameraVisibleBrood: battlefield.cameraVisibleBrood','cameraVisibleBodies: telemetryStats(samples.cameraVisibleBroodUnits'])
  assert.ok(runner.includes(token),`runner camera-visible Brood evidence missing: ${token}`);

console.log(JSON.stringify({
  status:'PASS',contract:'perf-probe-bounds-first-projection',
  valid:{total:4,visible:1,realBrood:2,cameraVisibleBrood:1,visibleBrood:0,projections:3,fogCalls:4},
  invalidInputs:'reported unsupported with authority and fog/cache schedule retained'
},null,2));
