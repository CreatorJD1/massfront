#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = path.join(SCRIPT_DIR, 'caldris-white-structure-union-repair.v1.json');
const EXPECTED_PREFIXES = ['CAL_END_', 'CAL_X_', 'CAL_T_', 'CAL_CR_', 'CAL_ST_'];
const REQUIRED_PRESERVED_ROLES = ['ROADWAY_DARK', 'GUIDE_CYAN', 'HAZARD_AMBER'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validateManifest(manifest) {
  const failures = [];
  const fail = (condition, message) => {
    if (!condition) failures.push(message);
  };

  fail(manifest?.schemaVersion === 1, 'schemaVersion must be 1');
  fail(manifest?.runtimeReady === false, 'runtimeReady must remain false');
  fail(manifest?.sourceTruth?.geometryOverlapEvidence === 'UNKNOWN', 'missing source must report geometry evidence UNKNOWN');
  fail(manifest?.sourceTruth?.noLiveMutationClaim === true, 'manifest must not claim a live mutation');
  fail(manifest?.sourceTruth?.checkedInSplineScene === null, 'checkedInSplineScene must remain null until source exists');
  fail(manifest?.admissionGates?.currentResult === 'BLOCKED_UNTIL_SOURCE_EXPORT', 'admission must remain blocked until source export');

  const modules = Array.isArray(manifest?.moduleRepairs) ? manifest.moduleRepairs : [];
  fail(modules.length === EXPECTED_PREFIXES.length, `expected ${EXPECTED_PREFIXES.length} module repairs`);
  const prefixes = modules.map((module) => module?.liveNamePrefix);
  fail(JSON.stringify(prefixes) === JSON.stringify(EXPECTED_PREFIXES), `module prefixes must be ${EXPECTED_PREFIXES.join(', ')}`);

  const outputs = new Set();
  for (const module of modules) {
    const prefix = module?.liveNamePrefix;
    fail(module?.exactSemanticSelector?.namePrefix === prefix, `${prefix || '<missing>'}: selector prefix mismatch`);
    fail(module?.exactSemanticSelector?.requiredMaterialRole === 'STRUCTURAL_WHITE', `${prefix || '<missing>'}: selector must require STRUCTURAL_WHITE`);
    fail(module?.exactSemanticSelector?.excludeRoleTokensFromGlobalRules === true, `${prefix || '<missing>'}: global exclusions must be enforced`);
    fail(typeof module?.operandObjectSetId === 'string' && module.operandObjectSetId.startsWith(prefix), `${prefix || '<missing>'}: operand set id must be prefix-scoped`);
    fail(typeof module?.expectedOutputObjectName === 'string' && module.expectedOutputObjectName.startsWith(prefix), `${prefix || '<missing>'}: output name must be prefix-scoped`);
    fail(!outputs.has(module?.expectedOutputObjectName), `${prefix || '<missing>'}: duplicate output name`);
    outputs.add(module?.expectedOutputObjectName);

    for (const role of REQUIRED_PRESERVED_ROLES) {
      fail(module?.preserveMaterialRoles?.includes(role), `${prefix || '<missing>'}: must preserve ${role}`);
    }
  }

  const rules = manifest?.globalOperandRules || {};
  fail(rules.unmatchedStructuralWhitePolicy === 'FAIL', 'unmatched structural white policy must fail');
  fail(rules.emptyOperandSetPolicy === 'FAIL', 'empty structural operand set must fail');
  fail(rules.mixedMaterialOperandPolicy === 'FAIL', 'mixed material structural operand set must fail');
  fail(rules.booleanSolver === 'EXACT', 'Boolean solver must be EXACT');
  fail(Number(rules.requiredIntersectionBeforeUnionMeters) > 0, 'union operands must intersect positively');
  fail(Number(rules.mergeByDistanceMeters) > 0, 'merge-by-distance tolerance must be positive');
  fail(Number(rules.coplanarDistanceToleranceMeters) > 0, 'coplanar distance tolerance must be positive');
  fail(Number(rules.coplanarOverlapAreaToleranceSquareMeters) > 0, 'coplanar overlap area tolerance must be positive');
  fail(rules.duplicateTriangleTolerance === 0, 'duplicate triangle tolerance must be zero');

  const markings = manifest?.guideAndMarkingContract || {};
  fail(/mask/i.test(markings.preferredRepresentation || ''), 'markings must prefer roadway masks');
  fail(/coplanar/i.test(markings.forbiddenRepresentation || ''), 'markings must explicitly forbid coplanar plates');
  fail(markings?.geometryFallback?.mustNotIntersectStructuralWhite === true, 'geometry markings must not intersect structural white');

  const n7 = manifest?.n7DeployerLane || {};
  fail(n7.status === 'UNKNOWN_SOURCE_UNAVAILABLE', 'N7 status must remain UNKNOWN_SOURCE_UNAVAILABLE');
  fail(n7.repositorySourceScene === null, 'N7 source scene must remain null until checked in');
  fail(n7.repositorySourceGlb === null, 'N7 source GLB must remain null until checked in');
  fail(n7.doNotAutoRepair === true, 'N7 must not be auto-repaired from runtime metadata');
  fail(n7.geometryOverlapEvidence === 'UNKNOWN', 'N7 geometry evidence must remain UNKNOWN');

  const gates = manifest?.admissionGates || {};
  fail(gates.duplicateTriangles === 0, 'admission requires zero duplicate triangles');
  fail(gates.nearCoplanarStructuralOverlapPairs === 0, 'admission requires zero near-coplanar structural overlap pairs');
  fail(gates.grazingAngleFlicker === 0, 'admission requires zero grazing-angle flicker');

  return failures;
}

function loadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function runSelfTest(reference) {
  const fixtures = [
    ['runtime-ready lie', (m) => { m.runtimeReady = true; }],
    ['missing module', (m) => { m.moduleRepairs.pop(); }],
    ['mixed material union', (m) => { m.globalOperandRules.mixedMaterialOperandPolicy = 'ALLOW'; }],
    ['lost guide preservation', (m) => { m.moduleRepairs[0].preserveMaterialRoles = ['ROADWAY_DARK']; }],
    ['unsafe marking plate', (m) => { m.guideAndMarkingContract.forbiddenRepresentation = ''; }],
    ['false N7 evidence', (m) => { m.n7DeployerLane.geometryOverlapEvidence = 'PASS'; }],
    ['unblocked without source', (m) => { m.admissionGates.currentResult = 'PASS'; }],
    ['duplicate triangles allowed', (m) => { m.admissionGates.duplicateTriangles = 1; }]
  ];

  const cleanFailures = validateManifest(reference);
  if (cleanFailures.length) {
    throw new Error(`clean fixture failed:\n- ${cleanFailures.join('\n- ')}`);
  }

  for (const [name, mutate] of fixtures) {
    const fixture = clone(reference);
    mutate(fixture);
    const failures = validateManifest(fixture);
    if (!failures.length) throw new Error(`negative fixture unexpectedly passed: ${name}`);
  }
  console.log(`PASS self-test: clean fixture plus ${fixtures.length} failure fixtures`);
}

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const pathArg = args.find((arg) => !arg.startsWith('--'));
const manifestPath = path.resolve(pathArg || DEFAULT_MANIFEST);

try {
  const manifest = loadManifest(manifestPath);
  const failures = validateManifest(manifest);
  if (failures.length) {
    console.error(`FAIL ${path.relative(process.cwd(), manifestPath)}`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${path.relative(process.cwd(), manifestPath)}`);
  }
  if (selfTest && !process.exitCode) runSelfTest(manifest);
} catch (error) {
  console.error(`FAIL ${path.relative(process.cwd(), manifestPath)}: ${error.message}`);
  process.exitCode = 1;
}
