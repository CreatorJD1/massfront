#!/usr/bin/env node

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolDir, '..');
const dataPath = path.join(root, 'assets', 'data', 'interiortopology-stage10.js');
const sourcePath = path.join(root, 'source-media', 'content-library', 'interior-tactical-model-packs.v1.json');
const manifestPath = path.join(root, 'assets', 'data', 'manifest.json');
const bootPath = path.join(root, 'boot.js');
const reportPath = path.join(root, 'tmp', 'stage10-interior-topology', 'verification.json');

const [dataSource, sourceText, manifestText, bootText] = await Promise.all([
  fs.readFile(dataPath, 'utf8'),
  fs.readFile(sourcePath, 'utf8'),
  fs.readFile(manifestPath, 'utf8'),
  fs.readFile(bootPath, 'utf8')
]);
const sourceCatalog = JSON.parse(sourceText);

assert.doesNotMatch(dataSource, /^\s*(?:import|export)\s/m, 'classic data script may not use import/export');
assert.doesNotMatch(dataSource, /\brequire\s*\(|\bmodule\.exports\b/, 'classic data script may not use CommonJS');
const declarations = [...dataSource.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)].map(match => match[1]);
assert.deepEqual(declarations, ['Stage10InteriorTopologyV1', 'mfPreflightStage10InteriorTopologyV1'], 'data script must expose exactly two prefixed globals');
new vm.Script(dataSource, { filename: dataPath });

const siblingFiles = (await fs.readdir(path.dirname(dataPath))).filter(name => name.endsWith('.js') && name !== path.basename(dataPath));
for (const siblingFile of siblingFiles) {
  const siblingText = await fs.readFile(path.join(path.dirname(dataPath), siblingFile), 'utf8');
  assert.equal(siblingText.includes('Stage10InteriorTopologyV1'), false, `classic global collision in ${siblingFile}`);
  assert.equal(siblingText.includes('mfPreflightStage10InteriorTopologyV1'), false, `classic preflight collision in ${siblingFile}`);
}

function createContext() {
  let randomCalls = 0;
  let dateCalls = 0;
  const trackedMath = Object.create(Math);
  trackedMath.random = () => {
    randomCalls++;
    return 0.5;
  };
  class TrackedDate extends Date {
    constructor(...args) {
      dateCalls++;
      super(...args);
    }
    static now() {
      dateCalls++;
      return 0;
    }
  }
  const context = vm.createContext({ Math: trackedMath, Date: TrackedDate });
  new vm.Script(dataSource, { filename: dataPath }).runInContext(context);
  return {
    context,
    nondeterminism() {
      return { randomCalls, dateCalls };
    }
  };
}

function evaluateJson(context, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

function callPreflight(context, templateId) {
  return evaluateJson(context, `mfPreflightStage10InteriorTopologyV1(${JSON.stringify(templateId)})`);
}

function loadCatalog(context) {
  return evaluateJson(context, 'Stage10InteriorTopologyV1');
}

const baselineRuntime = createContext();
const catalog = loadCatalog(baselineRuntime.context);
assert.deepEqual(baselineRuntime.nondeterminism(), { randomCalls: 0, dateCalls: 0 }, 'loading the catalog must be deterministic');
assert.equal(catalog.schema, 'Stage10InteriorTopologyV1');
assert.equal(catalog.status, 'AUTHORING_ONLY');
assert.equal(catalog.runtimeReady, false);
assert.deepEqual(catalog.activation, {
  runtime: false,
  manifestRegistered: true,
  bootRegistered: true,
  modelPackBinding: false
});
assert.equal(manifestText.includes('interiortopology-stage10.js'), true, 'inert topology data must enter the data manifest');
assert.equal(bootText.includes('interiortopology-stage10.js'), true, 'inert topology data must enter boot.js');
assert.equal(JSON.stringify(catalog).includes('moduleId'), false, 'topology candidates may not claim unproven model module IDs');
assert.equal(JSON.stringify(catalog).includes('modelPackId'), false, 'topology candidates may not claim a built model pack');

assert.equal(sourceCatalog.schemaVersion, 1);
assert.equal(sourceCatalog.status, 'PLANNED');
assert.equal(sourceCatalog.runtimeReady, false);
assert.equal(sourceCatalog.units, 'meters');
assert.equal(sourceCatalog.coordinateContract.upAxis, '+Y');
assert.equal(sourceCatalog.coordinateContract.forwardAxis, '+Z');
assert.equal(sourceCatalog.coordinateContract.origin, 'floor-center');

const expectedTemplateRules = {
  interior_xs_breach_40x40: { minimumInfantryBranches: 1, floorElevations: [0] },
  interior_xs_linear_48x32: { minimumInfantryBranches: 2, floorElevations: [0] },
  interior_small_loop_64x64: { minimumInfantryBranches: 3, floorElevations: [0] },
  interior_small_multilevel_80x64: { minimumInfantryBranches: 1, floorElevations: [0, 4] }
};
const expectedHashes = {
  interior_xs_breach_40x40: 'fnv1a32-11767a0a',
  interior_xs_linear_48x32: 'fnv1a32-0eb4d76f',
  interior_small_loop_64x64: 'fnv1a32-0c2d36a3',
  interior_small_multilevel_80x64: 'fnv1a32-d7985277'
};
const sourceTemplateIds = sourceCatalog.mapTemplates.map(template => template.templateId);
assert.deepEqual(Object.keys(catalog.templates), sourceTemplateIds, 'candidate set must exactly match the four source templates and source order');

const baselineResults = {};
for (const sourceTemplate of sourceCatalog.mapTemplates) {
  const templateId = sourceTemplate.templateId;
  const template = catalog.templates[templateId];
  const contract = catalog.templateContracts[templateId];
  assert.ok(template && contract, `missing exact candidate or contract for ${templateId}`);
  assert.equal(template.sizeClass, sourceTemplate.sizeClass);
  assert.deepEqual(template.bounds, sourceTemplate.playableBoundsMeters);
  assert.deepEqual(template.floorElevations, expectedTemplateRules[templateId].floorElevations);
  assert.deepEqual(template.unitEnvelope.allowed, sourceTemplate.requiredMobility);
  assert.deepEqual(template.unitEnvelope.forbidden, ['heavy_vehicle', 'heavy_mech', 'artillery', 'air', 'naval', 'titan']);
  assert.equal(contract.minimumMixedRouteWidth, sourceTemplate.minimumMixedRouteWidth);
  assert.equal(contract.minimumTurningPockets, sourceTemplate.minimumTurningPockets);
  assert.equal(contract.minimumInfantryBranches, expectedTemplateRules[templateId].minimumInfantryBranches);
  assert.ok(template.routes.filter(route => route.kind === 'mixed').every(route => route.width === 6.4));
  assert.ok(template.routes.filter(route => route.kind === 'infantry').every(route => route.width === 3.2 && route.mobility.length === 1 && route.mobility[0] === 'infantry'));
  assert.ok(template.portals.some(portal => portal.kind === 'door'));
  assert.ok(template.portals.some(portal => portal.kind === 'gate'));
  assert.equal(template.destructibles.length, template.portals.length);
  assert.deepEqual(template.cameraCutaway.preserveLayers, ['objective', 'extraction', 'portal', 'navigation']);
  const first = callPreflight(baselineRuntime.context, templateId);
  const second = callPreflight(baselineRuntime.context, templateId);
  assert.deepEqual(first, second, `${templateId} preflight must be repeatable`);
  assert.equal(first.status, 'AUTHORING_CANDIDATE');
  assert.equal(first.code, 'INTERIOR_TOPOLOGY_PREFLIGHT_PASS');
  assert.equal(first.runtimeReady, false);
  assert.equal(first.topologyHash, expectedHashes[templateId], `${templateId} semantic hash changed`);
  baselineResults[templateId] = first;
}
assert.deepEqual(baselineRuntime.nondeterminism(), { randomCalls: 0, dateCalls: 0 }, 'preflight must not use time or randomness');

const freshRuntime = createContext();
const freshResults = Object.fromEntries(sourceTemplateIds.map(templateId => [templateId, callPreflight(freshRuntime.context, templateId)]));
assert.deepEqual(freshResults, baselineResults, 'fresh VM execution must reproduce every topology result');
assert.deepEqual(freshRuntime.nondeterminism(), { randomCalls: 0, dateCalls: 0 });

function runFault(name, templateId, mutation, expectedCode) {
  const runtime = createContext();
  if (mutation) vm.runInContext(`(() => { ${mutation} })()`, runtime.context);
  const result = callPreflight(runtime.context, templateId);
  assert.equal(result.status, 'BLOCKED', `${name} must fail closed`);
  assert.equal(result.code, expectedCode, `${name} produced the wrong fail-closed code`);
  assert.equal(result.runtimeReady, false, `${name} may never activate runtime content`);
  assert.deepEqual(runtime.nondeterminism(), { randomCalls: 0, dateCalls: 0 }, `${name} may not use nondeterminism`);
  return { name, templateId, expectedCode, actualCode: result.code, status: result.status };
}

const injectedFaults = [
  runFault('unknown-template', 'interior_missing', '', 'INTERIOR_TOPOLOGY_TEMPLATE_UNKNOWN'),
  runFault('catalog-schema', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.schema = 'broken';`, 'INTERIOR_TOPOLOGY_CATALOG_INVALID'),
  runFault('runtime-activation', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.activation.runtime = true;`, 'INTERIOR_TOPOLOGY_RUNTIME_ENABLED'),
  runFault('template-activation', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.activation.runtime = true;`, 'INTERIOR_TOPOLOGY_TEMPLATE_INERTNESS_INVALID'),
  runFault('bounds-drift', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.bounds[0] = 41;`, 'INTERIOR_TOPOLOGY_BOUNDS_INVALID'),
  runFault('heavy-unit-admission', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.unitEnvelope.allowed.push('heavy_vehicle');`, 'INTERIOR_TOPOLOGY_UNIT_ENVELOPE_INVALID'),
  runFault('node-out-of-bounds', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.nodes[0].at[0] = -1;`, 'INTERIOR_TOPOLOGY_NODE_INVALID'),
  runFault('route-endpoint-drift', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.routes[0].points[0][0] = 5;`, 'INTERIOR_TOPOLOGY_ROUTE_INVALID'),
  runFault('mixed-width-loss', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.routes[0].width = 6.39;`, 'INTERIOR_TOPOLOGY_MIXED_ROUTE_INVALID'),
  runFault('overlong-lane', 'interior_xs_linear_48x32', `Stage10InteriorTopologyV1.templates.interior_xs_linear_48x32.routes.find(route => route.id === 'linear_f0').points[1] = [12, 0, 0];`, 'INTERIOR_TOPOLOGY_LANE_LENGTH_INVALID'),
  runFault('infantry-branch-loss', 'interior_xs_linear_48x32', `const t = Stage10InteriorTopologyV1.templates.interior_xs_linear_48x32; t.routes = t.routes.filter(route => route.id !== 'linear_f1');`, 'INTERIOR_TOPOLOGY_INFANTRY_BRANCHES_INVALID'),
  runFault('objective-disconnect', 'interior_xs_breach_40x40', `const t = Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40; t.routes = t.routes.filter(route => route.id !== 'breach_m2');`, 'INTERIOR_TOPOLOGY_OBJECTIVE_CONNECTIVITY_INVALID'),
  runFault('extraction-disconnect', 'interior_xs_breach_40x40', `const t = Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40; t.routes = t.routes.filter(route => route.id !== 'breach_m4');`, 'INTERIOR_TOPOLOGY_EXTRACTION_CONNECTIVITY_INVALID'),
  runFault('turning-pocket-loss', 'interior_small_loop_64x64', `Stage10InteriorTopologyV1.templates.interior_small_loop_64x64.turningPockets[0].diameter = 8.99;`, 'INTERIOR_TOPOLOGY_TURNING_POCKETS_INVALID'),
  runFault('portal-clearance-drift', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.portals[0].clearanceByState.open = 6.3;`, 'INTERIOR_TOPOLOGY_PORTAL_STATE_INVALID'),
  runFault('destruction-rubble-encroachment', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.destructibles[0].destroyedOutcome.rubbleFootprint.maxEncroachment = 0.1;`, 'INTERIOR_TOPOLOGY_DESTRUCTION_STATE_INVALID'),
  runFault('cutaway-objective-loss', 'interior_xs_breach_40x40', `Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40.cameraCutaway.preserveLayers = ['extraction', 'portal', 'navigation'];`, 'INTERIOR_TOPOLOGY_CAMERA_CUTAWAY_INVALID'),
  runFault('vertical-rise-drift', 'interior_small_multilevel_80x64', `Stage10InteriorTopologyV1.templates.interior_small_multilevel_80x64.routes.find(route => route.id === 'multi_m_ramp').vertical.rise = 2;`, 'INTERIOR_TOPOLOGY_VERTICAL_CONTRACT_INVALID')
];

const hashRuntime = createContext();
vm.runInContext(`(() => {
  const t = Stage10InteriorTopologyV1.templates.interior_xs_breach_40x40;
  t.nodes.find(node => node.id === 'breach_insert').at[0] = 5;
  t.routes.find(route => route.id === 'breach_m0').points[0][0] = 5;
})()`, hashRuntime.context);
const changedHashResult = callPreflight(hashRuntime.context, 'interior_xs_breach_40x40');
assert.equal(changedHashResult.status, 'AUTHORING_CANDIDATE');
assert.notEqual(changedHashResult.topologyHash, expectedHashes.interior_xs_breach_40x40, 'semantic geometry changes must change the topology hash');
assert.deepEqual(hashRuntime.nondeterminism(), { randomCalls: 0, dateCalls: 0 });

const totals = Object.values(baselineResults).reduce((sum, result) => {
  for (const [key, value] of Object.entries(result.counts)) sum[key] = (sum[key] || 0) + value;
  return sum;
}, {});
const report = {
  status: 'PASS',
  schema: 'Stage10InteriorTopologyVerificationV1',
  sourceCatalog: path.relative(root, sourcePath).replaceAll('\\', '/'),
  dataFile: path.relative(root, dataPath).replaceAll('\\', '/'),
  runtimeRegistered: false,
  templateCount: sourceTemplateIds.length,
  templateIds: sourceTemplateIds,
  topologyHashes: expectedHashes,
  totals,
  injectedFaultCount: injectedFaults.length,
  injectedFaults,
  determinism: { randomCalls: 0, dateCalls: 0, repeatableFreshVm: true },
  hashSensitivity: {
    baseline: expectedHashes.interior_xs_breach_40x40,
    changed: changedHashResult.topologyHash
  }
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`PASS Stage 10 interior topology: ${report.templateCount} templates, ${report.injectedFaultCount} injected faults`);
console.log(`Report: ${path.relative(root, reportPath)}`);
console.log(JSON.stringify({ topologyHashes: report.topologyHashes, totals: report.totals }, null, 2));
