import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Build the human-facing Stage 10 model-preparation evidence gallery.
 *
 * This is deliberately a fail-closed consumer, not another source of truth.
 * It writes cards only for the proof-green production set shared by repair, PBR,
 * audit, and render. Every non-promoted model remains explicit in quarantine.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_FILE = path.join(ROOT, 'tmp', 'stage10-model-review', 'catalog.json');
const DISCARD_FILE = path.join(ROOT, 'modules', 'space_exploration', 'assets', 'source', 'spline', 'world-prefabs', 'DISCARDED_SPLINE_PROPS.json');
const OUT = path.join(ROOT, 'tmp', 'stage10-model-repair');
const REPAIR_SUMMARY_FILE = path.join(OUT, 'summary.json');
const REPAIR_REPORT_ROOT = path.join(OUT, 'reports');
const PBR_SUMMARY_FILE = path.join(OUT, 'pbr-reports', 'summary.json');
const PBR_REPORT_ROOT = path.join(OUT, 'pbr-reports');
const PBR_MODEL_ROOT = path.join(OUT, 'pbr-models');
const ZFIGHT_SUMMARY_FILE = path.join(OUT, 'z-fighting-reports', 'summary.json');
const ZFIGHT_REPORT_ROOT = path.join(OUT, 'z-fighting-reports');
const RENDER_SUMMARY_FILE = path.join(OUT, 'renders', 'summary.json');
const RENDER_REPORT_ROOT = path.join(OUT, 'renders', 'reports');
const RENDER_BEFORE_ROOT = path.join(OUT, 'renders', 'before');
const RENDER_AFTER_ROOT = path.join(OUT, 'renders', 'after');
const GALLERY_ROOT = path.join(OUT, 'review-gallery');
const INDEX_FILE = path.join(GALLERY_ROOT, 'index.html');
const MANIFEST_FILE = path.join(GALLERY_ROOT, 'manifest.json');
const QUARANTINE_FILE = path.join(GALLERY_ROOT, 'quarantine.json');
const REPAIR_SCRIPT = path.join(ROOT, 'tools', 'blender', 'repair-stage10-model-pack.py');
const PBR_SCRIPT = path.join(ROOT, 'tools', 'blender', 'texture-stage10-model-pack.py');
const RENDER_SCRIPT = path.join(ROOT, 'tools', 'blender', 'render-stage10-repaired-model-pack.py');
const ZFIGHT_SCRIPT = path.join(ROOT, 'tools', 'blender', 'audit-stage10-z-fighting.py');
const RASTER_CLEANUP_SCRIPT = path.join(ROOT, 'tools', 'blender', 'stage10_raster_cleanup.py');
const FROZEN_REPAIR_SCRIPT_SHA256 = 'ef9cb66d9f41a0a42c7439b20d31aa43b3ae56e2c2127ba5afd7fedf71a9f54d';
const FROZEN_RASTER_CLEANUP_SCRIPT_SHA256 = '1d2dec9d59864a218786fa56b5d9df44d74ac5f430dcd76e6d890da2fce1e72b';
const FULL_MATERIAL = Object.freeze({ models: 327, slots: 1926, uniqueNonempty: 149, uniqueWithUnnamed: 150, unnamedSlots: 60, coverageSha256: 'e57e5524f908ceda81f1640099ee0623df190c0b4357cba5dcb22af77736f447' });
const CONTENT_EQUIVALENT_REBIND_SCHEMA = 'MassfrontStage10PbrContentEquivalentRebindV1';
const CONTENT_EQUIVALENT_REBIND_METHOD = 'BYTE_IDENTICAL_REPAIR_INPUT_AND_PBR_OUTPUT_FRESH_CURRENT_VALIDATION';
const CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256 = '1da057bd3a81467ba81205a97c149310c45142bd017ccdd2423fe3a25b116601';
const CONTENT_EQUIVALENT_REBIND_POLICY = Object.freeze({ schema: CONTENT_EQUIVALENT_REBIND_SCHEMA, method: CONTENT_EQUIVALENT_REBIND_METHOD, legacyPipelineScriptSha256: CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256, requested: true });
const UNIFIED_VERIFIER = path.join(ROOT, 'tools', 'verify-stage10-repaired-model-pack.mjs');
let unifiedVerifierEvidence = null;

const EXPECTED = Object.freeze({
  world: 320,
  spline: 7,
  candidates: 327,
  included: 327,
  excluded: 0,
  discarded: 12,
  repairPipeline: 18,
  zFightingAudit: 3,
  pbrPipeline: 1,
  renderer: 2,
  renderResolution: 768,
});
const CUBIC_STRETCH_LIMIT = Math.sqrt(3) + 0.01;
const TEXEL_SCALE_ERROR_LIMIT = 0.005;
const SHA256 = /^[0-9a-f]{64}$/;
const RASTER_ACCEPTANCE = Object.freeze({ method: 'SIGNED_SAME_WINDING_PAIR_LOCAL_AFFINE_DEPTH_BAND', signedSameWinding: true, normalAngleDegrees: 0.5, normalDotMinimum: Math.cos(0.5 * Math.PI / 180), planeDistanceM: 5.0e-4, minimumOverlapAreaM2: 1.0e-6, exactDuplicatesIgnoreAreaFloor: true, minimumWidthExemption: false, cleanupDepthGuardOnly: true, cleanupGuardScope: 'MUTATION_DEPTH_AND_FLOAT32_REMOVAL_BOUNDARY_ONLY', adjacentEdgeExclusion: 'SAME_OBJECT_EXACT_TWO_ENDPOINT_EDGE_WITH_STRICT_OPPOSITE_SIDE', aggregateCoherentCrossingResolution: 'IMMUTABLE_SOURCE_LINEAGE_PAIR_STABLE_OWNER_WITHIN_ACCEPTED_PAIR_LOCAL_COVERAGE', aggregateCoherentCrossingExpandsAcceptedCoverage: false, subsequentPassReconstructionPlane: 'IMMUTABLE_SOURCE_LINEAGE_PLANE_WITH_CANONICAL_EDGES', subsequentPassReconstructionExpandsAcceptedCoverage: false, sameLineagePartitionRealization: 'TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP', sameLineagePartitionRealizationMergesProjectedVertices: false, sameLineagePartitionRealizationExpandsAcceptedCoverage: false, maximumCleanupPasses: 6, pairCountMustStrictlyDecrease: false, cleanupProgressRule: 'POSITIVE_ACCEPTED_MASK_SOURCE_SURFACE_INTERSECTION_OR_SAME_LINEAGE_OR_EXACT_DUPLICATE_CONSOLIDATION_WITH_PAIR_DECREASE', repeatedGeometryStateAllowed: false });
const LINEAGE_PROOF_POLICY = Object.freeze({ method: 'IMMUTABLE_SOURCE_TRIANGLE_PLANE_UNION_AND_CONSTRAINED_RETRIANGULATION', lineage: 'INITIAL_OWNER_AND_SOURCE_TRIANGLE_ID', scope: 'IN_MEMORY_CLEANUP_AID_NOT_REQUIRED_BY_FINAL_ACCEPTANCE', carriedAcrossRetriangulation: true, sameOwnerRequired: true, sameMaterialRequired: true, globalMinimumWidthExemption: false, finalArtifactAcceptanceDependsOnLineage: false });
const RASTER_DEPENDENCY = Object.freeze({ shapelyVersion: '2.1.2', geosVersion: '3.13.1', requiredShapelyVersion: '2.1.2', requiredGeosVersion: '3.13.1', passed: true });
const PBR_RASTER_POLICY = Object.freeze({ alphaMode: 'OPAQUE', doubleSided: false, backfaceCulling: true });
const ZFIGHT_AUDIT_MODE = 'READ_ONLY_SAME_LOD_SAME_WINDING_RASTER_RISK_V1';
const ZFIGHT_BROAD_PHASE_METHOD = 'WORLD_TRIANGLE_BVH_NEAREST_RANGE_V1';
const ZFIGHT_DUPLICATE_AUTHORITY = 'RAW_GLB_NONDEGENERATE_RENDER_NODE_SAME_WINDING';
const RAW_GLTF_AUDIT_METHOD = 'GLB_ACCESSOR_TRIANGLE_INDEX_WORLD_V1';
const RASTER_BOUNDS_DRIFT_LIMIT = 5.01e-4;
const REPAIR_STATUSES = new Set(['READY_FOR_TEXTURE_GENERATION', 'UV_READY_GEOMETRY_REVIEW']);
const REPAIR_LOCKED = new Map();
const PIPELINE_EXCLUSIONS = new Map();
const DISCARDED_IDS = Object.freeze([
  'MF_PROP_CARGODEPOT_01',
  'MF_PROP_CRYSTAL_01',
  'MF_PROP_DEPOSIT_01',
  'MF_PROP_GEYSER_01',
  'MF_PROP_ICESPIRE_01',
  'MF_PROP_MOUNTAIN_02',
  'MF_PROP_RELIC_01',
  'MF_PROP_ROCK_01',
  'MF_PROP_ROCKARCH_01',
  'MF_PROP_TREE_01',
  'MF_PROP_TREE_02',
  'MF_PROP_WRECK_01',
]);

function fail(message) {
  throw new Error(`Stage 10 gallery refused incomplete or unbound evidence: ${message}`);
}

function requireThat(condition, message) {
  if (!condition) fail(message);
}

function posix(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function isWithin(file, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(file));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolveReference(reference, boundary, label) {
  requireThat(typeof reference === 'string' && reference.length > 0, `${label} has no path`);
  requireThat(!path.isAbsolute(reference) && !reference.includes('\\'), `${label} is not a normalized repository-relative path: ${reference}`);
  requireThat(path.posix.normalize(reference) === reference && !reference.startsWith('../'), `${label} is not normalized: ${reference}`);
  const file = path.resolve(ROOT, reference);
  requireThat(isWithin(file, boundary), `${label} escapes its evidence boundary: ${reference}`);
  return file;
}

function readJson(file, label) {
  requireThat(fs.existsSync(file) && fs.statSync(file).isFile(), `${label} is missing: ${posix(file)}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256File(file) {
  const digest = crypto.createHash('sha256');
  const descriptor = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest('hex');
}

function runUnifiedVerifier() {
  requireThat(fs.existsSync(UNIFIED_VERIFIER) && fs.statSync(UNIFIED_VERIFIER).isFile(), 'unified Stage 10 verifier is missing');
  const run = spawnSync(process.execPath, [UNIFIED_VERIFIER], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  let result = null;
  try {
    result = JSON.parse(run.stdout || '');
  } catch (error) {
    throw new Error(`unified Stage 10 verifier did not return JSON: ${error.message}\n${run.stderr || run.stdout || ''}`);
  }
  requireThat(run.status === 0 && ['PASS', 'PASS_WITH_QUARANTINE'].includes(result.status) && result.failed === 0, `unified Stage 10 verifier failed: ${JSON.stringify(result.failures || result)}`);
  requireThat(result.accounting?.repair?.censusCount === EXPECTED.included, 'unified verifier did not account the exact 320-report repair census');
  requireThat(result.accounting?.pipelineExclusions?.length === EXPECTED.excluded, 'unified verifier did not account the exact ten exclusions');
  requireThat(result.accounting?.discardedSplinePropsPoi?.length === EXPECTED.discarded, 'unified verifier did not account the exact 12 discards');
  return {
    verifier: fileRecord(UNIFIED_VERIFIER),
    command: [process.execPath, posix(UNIFIED_VERIFIER)],
    exitCode: run.status,
    result,
    stdoutSha256: crypto.createHash('sha256').update(run.stdout).digest('hex'),
    passed: true,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function canonicalTextBinding(textValue, value, hash) {
  if (typeof textValue !== 'string' || !SHA256.test(hash || '')) return false;
  try {
    return crypto.createHash('sha256').update(textValue).digest('hex') === hash
      && same(JSON.parse(textValue), value);
  } catch {
    return false;
  }
}

function aggregateCoherentProofGreen(cleanup) {
  const proof = cleanup?.lineageProof || {};
  const passes = cleanup?.stabilizationPasses;
  const countFields = [
    'aggregateCoherentLineagePairGroups',
    'aggregateCoherentCrossingGroups',
    'aggregateMixedSignedWinnerGroups',
    'aggregateCoherentPairAssignments',
  ];
  const near = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
    && Math.abs(actual - expected) <= Math.max(1e-12, 1e-12 * Math.max(Math.abs(actual), Math.abs(expected)));
  if (!Array.isArray(passes)) return false;
  const counts = Object.fromEntries(countFields.map((field) => [field, 0]));
  let coverageArea = 0;
  let maximumDelta = 0;
  for (const pass of passes) {
    const conflicts = pass?.conflicts || {};
    if (countFields.some((field) => !Number.isInteger(conflicts[field]) || conflicts[field] < 0)
        || !Number.isFinite(conflicts.aggregateCoherentPairLocalCoverageAreaSumM2)
        || conflicts.aggregateCoherentPairLocalCoverageAreaSumM2 < 0
        || !Number.isFinite(conflicts.aggregateCoherentMaximumCoverageDeltaM2)
        || conflicts.aggregateCoherentMaximumCoverageDeltaM2 < 0
        || conflicts.aggregateCoherentCoveragePreserved !== true
        || conflicts.aggregateCoherentCrossingGroups > conflicts.aggregateCoherentLineagePairGroups
        || conflicts.aggregateMixedSignedWinnerGroups > conflicts.aggregateCoherentLineagePairGroups
        || conflicts.aggregateCoherentPairAssignments < conflicts.aggregateCoherentLineagePairGroups) return false;
    for (const field of countFields) counts[field] += conflicts[field];
    coverageArea += conflicts.aggregateCoherentPairLocalCoverageAreaSumM2;
    maximumDelta = Math.max(maximumDelta, conflicts.aggregateCoherentMaximumCoverageDeltaM2);
  }
  return countFields.every((field) => cleanup[field] === counts[field] && proof[field] === counts[field])
    && near(cleanup.aggregateCoherentPairLocalCoverageAreaSumM2, coverageArea)
    && near(proof.aggregateCoherentPairLocalCoverageAreaSumM2, coverageArea)
    && near(cleanup.aggregateCoherentMaximumCoverageDeltaM2, maximumDelta)
    && near(proof.aggregateCoherentMaximumCoverageDeltaM2, maximumDelta)
    && cleanup.aggregateCoherentCoveragePreserved === true
    && proof.aggregateCoherentCoveragePreserved === true
    && proof.aggregateCoherentCrossingExpandsAcceptedCoverage === false
    && cleanup.proofExpectations?.aggregateCoherentCrossingExpandsAcceptedCoverage === false
    && cleanup.proofExpectations?.aggregateCoherentCoveragePreserved === true;
}
function immutablePlanePartitionProofGreen(cleanup) {
  const lineage = cleanup?.lineageProof || {};
  const partition = cleanup?.float32PartitionRealizationProof;
  const objects = cleanup?.objects;
  const passes = cleanup?.stabilizationPasses;
  const expectations = cleanup?.proofExpectations || {};
  if (!partition || !Array.isArray(objects) || !Array.isArray(passes)
      || !same(lineage.float32PartitionRealization, partition)) return false;
  let immutableCount = 0;
  let immutableArea = 0;
  for (const pass of passes) {
    const conflicts = pass?.conflicts || {};
    const count = conflicts.immutablePlaneSubsequentPassReconstructions;
    const area = conflicts.immutablePlaneSubsequentPassReconstructionAreaM2;
    if (!Number.isInteger(count) || count < 0 || !Number.isFinite(area) || area < 0
        || conflicts.immutablePlaneSubsequentPassAcceptedCoverageExpanded !== false) return false;
    immutableCount += count;
    immutableArea += area;
  }
  if (lineage.subsequentPassReconstructionPlane !== 'IMMUTABLE_SOURCE_LINEAGE_PLANE_WITH_CANONICAL_EDGES'
      || cleanup.immutablePlaneSubsequentPassReconstructions !== immutableCount
      || lineage.immutablePlaneSubsequentPassReconstructions !== immutableCount
      || cleanup.immutablePlaneSubsequentPassReconstructionAreaM2 !== immutableArea
      || lineage.immutablePlaneSubsequentPassReconstructionAreaM2 !== immutableArea
      || cleanup.immutablePlaneSubsequentPassAcceptedCoverageExpanded !== false
      || lineage.immutablePlaneSubsequentPassAcceptedCoverageExpanded !== false
      || expectations.subsequentPassReconstructionExpandsAcceptedCoverage !== false) return false;
  const integerFields = [
    'float32PartitionRealizationEnabledConsolidations',
    'float32PartitionRealizationApplications',
    'float32PartitionRealizationAdjustments',
    'float32PartitionRealizationAcceptedPairsBefore',
    'float32PartitionRealizationAcceptedPairsAfter',
    'float32PartitionRealizationDegenerateTriangles',
    'float32PartitionRealizationInvertedTriangles',
    'float32PartitionRealizationInternalDuplicateFaces',
    'float32PartitionRealizationInternalEdgeViolations',
    'float32PartitionRealizationNearDuplicateSharedEndpointViolations',
    'lineageScopedSharedMeshVertexIndexReuses',
  ];
  const numericFields = [
    'float32PartitionRealizationMaximumProjectedOverlapAreaM2',
    'float32PartitionRealizationTotalProjectedOverlapAreaM2',
    'float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2',
    'float32PartitionRealizationTotalProjectedSymmetricDifferenceM2',
    'float32PartitionRealizationMaximumCoverageExpansionAreaM2',
    'float32PartitionRealizationTotalCoverageExpansionAreaM2',
    'float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2',
    'float32PartitionRealizationMaximumPreexistingExpansionAreaM2',
    'float32PartitionRealizationMaximumSourcePlaneDriftM',
    'float32PartitionRealizationMaximumWorldShiftM',
  ];
  for (const item of objects) {
    if (!item
        || integerFields.some((field) => !Number.isInteger(item[field]) || item[field] < 0)
        || numericFields.some((field) => !Number.isFinite(item[field]) || item[field] < 0)
        || item.float32PartitionRealizationApplications
          > item.float32PartitionRealizationEnabledConsolidations) return false;
    if (item.float32PartitionRealizationApplications > 0
        && (item.float32PartitionRealizationAdjustments <= 0
          || item.lineageScopedSharedMeshVertexIndexReuses <= 0)) return false;
  }
  const applied = objects.filter((item) => item.float32PartitionRealizationApplications > 0);
  const total = (items, field) => items.reduce((sum, item) => sum + item[field], 0);
  const maximum = (field) => Math.max(0, ...applied.map((item) => item[field]));
  const expected = {
    method: 'TOPOLOGY_ACCEPTED_PAIR_TRIGGERED_ADJACENT_FLOAT32_OMITTED_AXIS_ULP',
    enabledConsolidations: total(objects, 'float32PartitionRealizationEnabledConsolidations'),
    applications: total(objects, 'float32PartitionRealizationApplications'),
    adjustments: total(objects, 'float32PartitionRealizationAdjustments'),
    acceptedPairsBefore: total(objects, 'float32PartitionRealizationAcceptedPairsBefore'),
    acceptedPairsAfter: total(objects, 'float32PartitionRealizationAcceptedPairsAfter'),
    allFreshScansZero: applied.every((item) => item.float32PartitionRealizationAllFreshScansZero === true),
    allDistinctProjectedVerticesPreserved: applied.every((item) => item.float32PartitionRealizationAllDistinctProjectedVerticesPreserved === true),
    allMergesProjectedVerticesFalse: applied.every((item) => item.float32PartitionRealizationAllMergesProjectedVerticesFalse === true),
    maximumProjectedOverlapAreaM2: maximum('float32PartitionRealizationMaximumProjectedOverlapAreaM2'),
    totalProjectedOverlapAreaM2: total(applied, 'float32PartitionRealizationTotalProjectedOverlapAreaM2'),
    maximumProjectedSymmetricDifferenceM2: maximum('float32PartitionRealizationMaximumProjectedSymmetricDifferenceM2'),
    totalProjectedSymmetricDifferenceM2: total(applied, 'float32PartitionRealizationTotalProjectedSymmetricDifferenceM2'),
    maximumCoverageExpansionAreaM2: maximum('float32PartitionRealizationMaximumCoverageExpansionAreaM2'),
    totalCoverageExpansionAreaM2: total(applied, 'float32PartitionRealizationTotalCoverageExpansionAreaM2'),
    acceptedCoverageExpanded: applied.some((item) => item.float32PartitionRealizationAcceptedCoverageExpanded === true),
    allExpandsAcceptedCoverageFalse: applied.every((item) => item.float32PartitionRealizationAllExpandsAcceptedCoverageFalse === true),
    allPreexistingCanonicalEdgeCoverageDeltasUnchanged: applied.every((item) => item.float32PartitionRealizationAllPreexistingCoverageDeltasUnchanged === true),
    maximumPreexistingCanonicalEdgeSymmetricDifferenceM2: maximum('float32PartitionRealizationMaximumPreexistingSymmetricDifferenceM2'),
    maximumPreexistingCanonicalEdgeExpansionAreaM2: maximum('float32PartitionRealizationMaximumPreexistingExpansionAreaM2'),
    degenerateTriangles: total(applied, 'float32PartitionRealizationDegenerateTriangles'),
    invertedTriangles: total(applied, 'float32PartitionRealizationInvertedTriangles'),
    internalDuplicateFaces: total(applied, 'float32PartitionRealizationInternalDuplicateFaces'),
    internalEdgeViolations: total(applied, 'float32PartitionRealizationInternalEdgeViolations'),
    nearDuplicateIntendedSharedEndpointViolations: total(applied, 'float32PartitionRealizationNearDuplicateSharedEndpointViolations'),
    allRepresentationalBoundsPassed: applied.every((item) => item.float32PartitionRealizationAllRepresentationalBoundsPassed === true),
    allActualDriftBoundsPassed: applied.every((item) => item.float32PartitionRealizationAllActualDriftBoundsPassed === true),
    maximumSourcePlaneDriftM: maximum('float32PartitionRealizationMaximumSourcePlaneDriftM'),
    maximumWorldShiftM: maximum('float32PartitionRealizationMaximumWorldShiftM'),
    sharedMeshVertexIndexReuses: total(objects, 'lineageScopedSharedMeshVertexIndexReuses'),
    sharedMeshVertexIndexReusePassed: objects.filter((item) => item.mutated)
      .every((item) => item.sharedMeshVertexIndexReusePassed === true),
  };
  expected.passed = expected.acceptedPairsAfter === 0
    && expected.allFreshScansZero
    && expected.allDistinctProjectedVerticesPreserved
    && expected.allMergesProjectedVerticesFalse
    && expected.maximumProjectedOverlapAreaM2 === 0
    && expected.totalProjectedOverlapAreaM2 === 0
    && expected.maximumProjectedSymmetricDifferenceM2 === 0
    && expected.totalProjectedSymmetricDifferenceM2 === 0
    && expected.maximumCoverageExpansionAreaM2 === 0
    && expected.totalCoverageExpansionAreaM2 === 0
    && !expected.acceptedCoverageExpanded
    && expected.allExpandsAcceptedCoverageFalse
    && expected.allPreexistingCanonicalEdgeCoverageDeltasUnchanged
    && expected.degenerateTriangles === 0
    && expected.invertedTriangles === 0
    && expected.internalDuplicateFaces === 0
    && expected.internalEdgeViolations === 0
    && expected.nearDuplicateIntendedSharedEndpointViolations === 0
    && expected.allRepresentationalBoundsPassed
    && expected.allActualDriftBoundsPassed
    && expected.maximumSourcePlaneDriftM <= RASTER_BOUNDS_DRIFT_LIMIT
    && expected.sharedMeshVertexIndexReusePassed;
  const expectedExpectations = {
    float32PartitionRealizationPassed: true,
    float32PartitionProjectedOverlapAreaM2: 0,
    float32PartitionProjectedSymmetricDifferenceM2: 0,
    float32PartitionCoverageExpansionAreaM2: 0,
    float32PartitionAcceptedPairsAfter: 0,
    float32PartitionSharedMeshVertexIndexReusePassed: true,
    float32PartitionPreexistingCanonicalEdgeCoverageDeltaUnchanged: true,
  };
  return same(partition, expected) && expected.passed === true
    && Object.entries(expectedExpectations)
      .every(([field, value]) => expectations[field] === value);
}
function lineageProofGreen(cleanup) {
  const proof = cleanup?.lineageProof || {};
  const objects = cleanup?.objects;
  const numeric = [
    'maximumSourcePlaneMeasuredStoredDriftM',
    'maximumSourcePlaneArithmeticGuardM',
    'maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM',
    'maximumSourcePlaneRepresentationalErrorBoundM',
  ];
  if (!Array.isArray(objects) || objects.some((item) => !item
      || !Number.isInteger(item.lineageConsolidationCount) || item.lineageConsolidationCount < 0
      || !Number.isInteger(item.sourcePlaneProofConsolidationCount)
      || item.sourcePlaneProofConsolidationCount < 0
      || item.sourcePlaneProofConsolidationCount > item.lineageConsolidationCount
      || numeric.some((field) => !Number.isFinite(item[field]) || item[field] < 0)
      || item.maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM > RASTER_BOUNDS_DRIFT_LIMIT
      || item.allSourcePlaneWorldOriginCancellationAvoided !== true)) return false;
  const count = objects.reduce((total, item) => total + item.lineageConsolidationCount, 0);
  const proofCount = objects.reduce((total, item) => total + item.sourcePlaneProofConsolidationCount, 0);
  const maxima = Object.fromEntries(numeric.map((field) => [field, Math.max(0, ...objects.map((item) => item[field]))]));
  const cancellation = objects
    .filter((item) => item.sourcePlaneProofConsolidationCount)
    .every((item) => item.allSourcePlaneWorldOriginCancellationAvoided === true);
  return Object.entries(LINEAGE_PROOF_POLICY).every(([field, expected]) => proof[field] === expected)
    && Number.isInteger(proof.sameLineagePairsConsolidated)
    && proof.sameLineagePairsConsolidated >= 0
    && Number.isInteger(proof.sameLineageCoherentCrossingPairsConsolidated)
    && proof.sameLineageCoherentCrossingPairsConsolidated >= 0
    && proof.lineageConsolidationCount === count
    && proof.sourcePlaneProofConsolidationCount === proofCount
    && proofCount <= count
    && Object.entries(maxima).every(([field, value]) => proof[field] === value)
    && proof.sourcePlaneActualStoredDriftLimitM === RASTER_BOUNDS_DRIFT_LIMIT
    && proof.maximumSourcePlaneMeasuredStoredDriftPlusArithmeticGuardM <= proof.sourcePlaneActualStoredDriftLimitM
    && proof.sourcePlaneActualStoredDriftProofPassed === true
    && proof.sourcePlaneRepresentationalErrorBoundIsInformational === true
    && proof.allSourcePlaneWorldOriginCancellationAvoided === cancellation
    && cancellation === true
    && aggregateCoherentProofGreen(cleanup)
    && immutablePlanePartitionProofGreen(cleanup);
}

function same(actual, expected) {
  return JSON.stringify(stableValue(actual)) === JSON.stringify(stableValue(expected));
}

function rasterCleanupProgressGreen(cleanup) {
  const near = (actual, expected) => Number.isFinite(actual) && Number.isFinite(expected)
    && Math.abs(actual - expected) <= Math.max(1e-12, 1e-12 * Math.max(Math.abs(actual), Math.abs(expected)));
  const passes = cleanup?.stabilizationPasses;
  const sequence = cleanup?.pairCountSequence;
  const count = cleanup?.stabilizationPassCount;
  const topNumbers = ['surfaceAreaBeforeM2', 'surfaceAreaAfterM2', 'surfaceAreaRemovedM2', 'recordLocalRemovalIntersectionSurfaceAreaSumM2', 'lineageRemovalIntersectionSurfaceAreaSumM2', 'positiveRemovalEvidenceAreaSumM2'];
  if (cleanup?.schema !== 'MassfrontStage10RasterCleanupV2'
      || !same(cleanup.contract, RASTER_ACCEPTANCE)
      || cleanup.passed !== true
      || cleanup.acceptedPairsAfter !== 0
      || cleanup.exactDuplicatePairsAfter !== 0
      || cleanup.remainingPairs !== 0
      || cleanup.stabilized !== true
      || cleanup.progressRule !== RASTER_ACCEPTANCE.cleanupProgressRule
      || cleanup.progressValidatedPasses !== true
      || cleanup.repeatedGeometryStateDetected !== false
      || !Number.isInteger(count) || count < 0 || count > RASTER_ACCEPTANCE.maximumCleanupPasses
      || !Array.isArray(passes) || passes.length !== count
      || !Array.isArray(sequence) || sequence.length !== count + 1
      || sequence.some((value) => !Number.isInteger(value) || value < 0)
      || sequence[0] !== cleanup.acceptedPairsBefore || sequence.at(-1) !== 0
      || topNumbers.some((field) => !Number.isFinite(cleanup[field]))
      || !near(cleanup.surfaceAreaRemovedM2, cleanup.surfaceAreaBeforeM2 - cleanup.surfaceAreaAfterM2)
      || !SHA256.test(cleanup.initialGeometryStateSha256 || '')
      || !SHA256.test(cleanup.finalGeometryStateSha256 || '')) return false;
  const states = [cleanup.initialGeometryStateSha256];
  const nonDecreasing = [];
  let previousSurface = cleanup.surfaceAreaBeforeM2;
  const sums = { recordLocalRemovalIntersectionSurfaceAreaSumM2: 0, lineageRemovalIntersectionSurfaceAreaSumM2: 0, positiveRemovalEvidenceAreaSumM2: 0 };
  for (let index = 0; index < passes.length; index += 1) {
    const pass = passes[index];
    const before = sequence[index];
    const after = sequence[index + 1];
    const numeric = ['surfaceAreaBeforeM2', 'surfaceAreaAfterM2', 'surfaceAreaRemovedM2', 'recordLocalRemovalIntersectionSurfaceAreaM2', 'lineageRemovalIntersectionSurfaceAreaM2', 'positiveRemovalEvidenceAreaSumM2'];
    const strictlyDecreased = after < before;
    const positiveRemoval = Number.isFinite(pass?.positiveRemovalEvidenceAreaSumM2) && pass.positiveRemovalEvidenceAreaSumM2 > 0;
    const consolidation = pass?.consolidationPairProgress === true;
    const expectedConsolidation = strictlyDecreased && ((pass?.conflicts?.sameLineagePairsConsolidated || 0) > 0 || (pass?.conflicts?.exactDuplicateConflicts || 0) > 0);
    if (!pass || pass.pass !== index + 1 || pass.pairsBefore !== before || pass.pairsAfter !== after
        || pass.geometryStateSha256Before !== states.at(-1) || !SHA256.test(pass.geometryStateSha256After || '')
        || numeric.some((field) => !Number.isFinite(pass[field]))
        || pass.strictlyDecreased !== strictlyDecreased || pass.surfaceAreaStrictlyDecreased !== (pass.surfaceAreaRemovedM2 > 0)
        || pass.positiveAcceptedMaskRemoval !== positiveRemoval
        || pass.consolidationPairProgress !== expectedConsolidation
        || pass.progressRuleSatisfied !== (positiveRemoval || consolidation) || pass.progressRuleSatisfied !== true
        || (consolidation && !strictlyDecreased) || (!strictlyDecreased && !positiveRemoval)
        || !near(pass.surfaceAreaBeforeM2, previousSurface)
        || !near(pass.surfaceAreaRemovedM2, pass.surfaceAreaBeforeM2 - pass.surfaceAreaAfterM2)
        || !near(pass.positiveRemovalEvidenceAreaSumM2, pass.recordLocalRemovalIntersectionSurfaceAreaM2 + pass.lineageRemovalIntersectionSurfaceAreaM2)) return false;
    if (states.includes(pass.geometryStateSha256After)) return false;
    states.push(pass.geometryStateSha256After);
    previousSurface = pass.surfaceAreaAfterM2;
    sums.recordLocalRemovalIntersectionSurfaceAreaSumM2 += pass.recordLocalRemovalIntersectionSurfaceAreaM2;
    sums.lineageRemovalIntersectionSurfaceAreaSumM2 += pass.lineageRemovalIntersectionSurfaceAreaM2;
    sums.positiveRemovalEvidenceAreaSumM2 += pass.positiveRemovalEvidenceAreaSumM2;
    if (after >= before) nonDecreasing.push(index + 1);
  }
  return states.at(-1) === cleanup.finalGeometryStateSha256
    && near(previousSurface, cleanup.surfaceAreaAfterM2)
    && Object.entries(sums).every(([field, value]) => near(cleanup[field], value))
    && same(cleanup.nonDecreasingPairPasses, nonDecreasing)
    && cleanup.strictlyDecreasingPasses === (nonDecreasing.length === 0);
}

function sameSet(actual, expected) {
  return same([...actual].sort(), [...expected].sort());
}

function verifyFileRecord(reference, expectedHash, expectedBytes, boundary, label) {
  requireThat(SHA256.test(expectedHash || ''), `${label} has no valid SHA-256`);
  const file = resolveReference(reference, boundary, label);
  requireThat(fs.existsSync(file) && fs.statSync(file).isFile(), `${label} is missing: ${reference}`);
  if (expectedBytes !== undefined && expectedBytes !== null) {
    requireThat(fs.statSync(file).size === expectedBytes, `${label} byte count drifted: ${reference}`);
  }
  requireThat(sha256File(file) === expectedHash, `${label} hash drifted: ${reference}`);
  return file;
}

function fileRecord(file) {
  return { path: posix(file), sha256: sha256File(file), bytes: fs.statSync(file).size };
}

function walkJson(directory, { omitSummary = false, omitLibrary = false } = {}) {
  requireThat(fs.existsSync(directory) && fs.statSync(directory).isDirectory(), `report directory is missing: ${posix(directory)}`);
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (omitLibrary && path.resolve(full) === path.resolve(path.join(directory, 'library'))) continue;
        walk(full);
      } else if (entry.name.toLowerCase().endsWith('.json')) {
        if (omitSummary && path.resolve(full) === path.resolve(path.join(directory, 'summary.json'))) continue;
        files.push(full);
      }
    }
  };
  walk(directory);
  return files.sort((a, b) => a.localeCompare(b));
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  requireThat(fs.statSync(directory).isDirectory(), `evidence path is not a directory: ${posix(directory)}`);
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(directory);
  return files.sort((a, b) => a.localeCompare(b));
}

function safeId(value) {
  return String(value).replaceAll('/', '_').replaceAll('\\', '_');
}

function loadReports(directory, schema, options = {}) {
  const files = walkJson(directory, options);
  const reports = new Map();
  const paths = new Map();
  for (const file of files) {
    const report = readJson(file, `${schema} report`);
    requireThat(report.schema === schema, `unexpected report schema ${report.schema} in ${posix(file)}`);
    requireThat(typeof report.key === 'string' && report.key.length > 0, `report key missing in ${posix(file)}`);
    requireThat(!reports.has(report.key), `duplicate report key ${report.key}`);
    reports.set(report.key, report);
    paths.set(report.key, file);
  }
  return { files, reports, paths };
}

function countsBy(items, field) {
  const counts = {};
  for (const item of items) counts[item[field]] = (counts[item[field]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function buildCatalogContract() {
  const catalog = readJson(CATALOG_FILE, 'model-review catalog');
  requireThat(catalog.schema === 'MassfrontStage10ModelReviewCatalogV1', `unexpected catalog schema ${catalog.schema}`);
  requireThat(catalog.lifecycle === 'REVIEW_ONLY_RUNTIME_INACTIVE', 'catalog is not review-only');
  requireThat(catalog.allRuntimeActive === false && catalog.allRuntimeRegistered === false, 'catalog claims runtime activation');
  requireThat(same(catalog.counts, {
    worldKitFamilies: 8,
    worldKitModules: 320,
    worldKitProcessingEligible: 320,
    repairLocked: 0,
    roadQaGlbs: 31,
    splineExports: 10,
    splineRendered: 10,
    splineMetadataBlocked: 1,
  }), 'catalog counts are not the authoritative 320 + 10 contract');

  const entries = [];
  for (const family of catalog.worldKits || []) {
    requireThat(family.moduleCount === family.modules?.length, `catalog family count drifted: ${family.id}`);
    for (const model of family.modules || []) {
      entries.push({
        key: model.key,
        id: model.id,
        family: family.id,
        category: model.category || family.label || family.id,
        kind: 'world-kit',
        lifecycle: model.lifecycle,
        repairLocked: model.repairLocked === true,
        metadataBlocked: false,
        model: model.model,
      });
    }
  }
  for (const model of catalog.splineExports || []) {
    entries.push({
      key: model.key,
      id: model.id,
      family: 'spline-world-prefabs',
      category: model.category || 'Spline world prefabs',
      kind: 'spline',
      lifecycle: model.lifecycle,
      repairLocked: false,
      metadataBlocked: model.metadataBlocked === true,
      model: model.model,
    });
  }

  requireThat(entries.filter((item) => item.kind === 'world-kit').length === EXPECTED.world, 'catalog does not contain exactly 320 world-kit modules');
  requireThat(entries.filter((item) => item.kind === 'spline').length === EXPECTED.spline, 'catalog does not contain exactly 7 retained Spline models');
  requireThat(entries.length === EXPECTED.candidates, 'catalog does not contain exactly 327 candidates');
  requireThat(new Set(entries.map((item) => item.key)).size === EXPECTED.candidates, 'catalog keys are not unique');
  requireThat(new Set(entries.map((item) => item.model?.path)).size === EXPECTED.candidates, 'catalog model paths are not unique');
  requireThat(sameSet(entries.filter((item) => item.repairLocked).map((item) => item.key), REPAIR_LOCKED.keys()), 'catalog repair-locked set is not empty');
  requireThat(same(entries.filter((item) => item.metadataBlocked).map((item) => item.key), []), 'catalog metadata-blocked set is not empty');

  for (const item of entries) {
    requireThat(item.model && typeof item.model.path === 'string', `catalog model record is missing for ${item.key}`);
    verifyFileRecord(item.model.path, item.model.sha256, item.model.bytes, ROOT, `canonical model ${item.key}`);
  }
  const included = entries.filter((item) => !PIPELINE_EXCLUSIONS.has(item.key));
  const excluded = entries.filter((item) => PIPELINE_EXCLUSIONS.has(item.key));
  requireThat(included.length === EXPECTED.included, `catalog includes ${included.length}, expected 327`);
  requireThat(excluded.length === EXPECTED.excluded, `catalog excludes ${excluded.length}, expected zero`);
  requireThat(sameSet(excluded.map((item) => item.key), PIPELINE_EXCLUSIONS.keys()), 'catalog pipeline exclusions drifted');
  return {
    catalog,
    catalogHash: sha256File(CATALOG_FILE),
    entries,
    included: included.sort((a, b) => a.family.localeCompare(b.family) || a.id.localeCompare(b.id)),
    excluded: excluded.sort((a, b) => a.key.localeCompare(b.key)),
    byKey: new Map(entries.map((item) => [item.key, item])),
  };
}

function verifyDiscardContract(contract) {
  const discard = readJson(DISCARD_FILE, 'discarded Spline Props & POI record');
  requireThat(discard.schema === 'MassfrontDiscardedSplinePropsV1', `unexpected discard schema ${discard.schema}`);
  requireThat(discard.runtimeAllowed === false && discard.sourceAllowed === false, 'discarded Props & POI record allows source or runtime use');
  requireThat(Array.isArray(discard.ids) && discard.ids.length === EXPECTED.discarded, 'discard record does not contain exactly 12 IDs');
  requireThat(same(discard.ids, DISCARDED_IDS), 'discard record is not the exact user-approved 12 Props & POI IDs');

  const catalogDiscard = contract.catalog.discardedSplineProps || contract.catalog.discardedProps || null;
  if (catalogDiscard) {
    const declaredIds = Array.isArray(catalogDiscard) ? catalogDiscard : catalogDiscard.ids;
    requireThat(same(declaredIds, DISCARDED_IDS), 'catalog-embedded discard IDs drift from the authoritative record');
    if (!Array.isArray(catalogDiscard) && catalogDiscard.path) {
      requireThat(catalogDiscard.path === posix(DISCARD_FILE), 'catalog points at a different discard record');
      requireThat(!catalogDiscard.sha256 || catalogDiscard.sha256 === sha256File(DISCARD_FILE), 'catalog discard record hash drifted');
    }
  }

  const catalogText = contract.entries.map((item) => `${item.key} ${item.id} ${item.model.path}`.toUpperCase());
  const exportRoot = path.join(ROOT, 'modules', 'space_exploration', 'assets', 'source', 'spline', 'world-prefabs', 'exports');
  for (const id of DISCARDED_IDS) {
    requireThat(!catalogText.some((text) => text.includes(id)), `discarded model leaked into catalog: ${id}`);
    requireThat(!fs.existsSync(path.join(exportRoot, `${id}.glb`)), `discarded model still exists in the active Spline export inventory: ${id}`);
  }
  return discard;
}

function expectedExclusions(contract, withLifecycle = false) {
  return contract.excluded.map((item) => {
    const record = {
      key: item.key,
      id: item.id,
      family: item.family,
      kind: item.kind,
      reason: PIPELINE_EXCLUSIONS.get(item.key),
      source: item.model.path,
      sourceSha256: item.model.sha256,
    };
    if (withLifecycle) record.catalogLifecycle = item.lifecycle;
    return record;
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function stripRepairOutputState(record) {
  const value = { ...record };
  delete value.processingOutputCount;
  delete value.processingOutputs;
  return value;
}

function verifyRepair(contract, accounting) {
  requireThat(sha256File(REPAIR_SCRIPT) === FROZEN_REPAIR_SCRIPT_SHA256
    && sha256File(RASTER_CLEANUP_SCRIPT) === FROZEN_RASTER_CLEANUP_SCRIPT_SHA256,
  'frozen Stage 10 repair/cleanup producer hash changed');
  const summary = readJson(REPAIR_SUMMARY_FILE, 'repair summary');
  const loaded = loadReports(REPAIR_REPORT_ROOT, 'MassfrontStage10ModelRepairV3');
  const expectedKeys = contract.included.map((item) => item.key);
  requireThat(loaded.files.length === EXPECTED.included && sameSet(loaded.reports.keys(), expectedKeys), 'repair report membership is not the exact 320');
  const productionKeys = (accounting?.repair?.productionManifest || []).map((row) => row.key);
  const quarantine = accounting?.repair?.quarantineManifest || [];
  requireThat(new Set([...productionKeys, ...quarantine.map((row) => row.key)]).size === EXPECTED.included && sameSet([...productionKeys, ...quarantine.map((row) => row.key)], expectedKeys), 'repair production/quarantine partition does not account the full 320-report census');
  requireThat((accounting.repair.productionManifest || []).every((row) => row.stage === 'REPAIR' && row.disposition === 'ELIGIBLE_FOR_PBR' && REPAIR_STATUSES.has(row.status) && Array.isArray(row.reasons) && row.reasons.length === 0), 'repair production manifest contains an ineligible row');
  requireThat(quarantine.every((row) => row.stage === 'REPAIR' && row.disposition === 'QUARANTINED_NO_PROMOTION' && Array.isArray(row.reasons) && row.reasons.length > 0), 'repair quarantine manifest is not fail-closed');
  requireThat(summary.schema === 'MassfrontStage10ModelRepairSummaryV3', `unexpected repair summary schema ${summary.schema}`);
  requireThat(summary.pipelineVersion === EXPECTED.repairPipeline && summary.pipelineMode === 'DERIVED_SAME_WINDING_RASTER_CLEAN_AND_UV', 'repair summary is not the accepted V18 cleanup pipeline');
  requireThat(summary.sourcePolicy === 'CANONICAL_MODEL_BYTES_LOCKED_DERIVED_RASTER_CLEAN_AND_UV_ONLY', 'repair source-lock policy drifted');
  requireThat(summary.geometryPolicy === 'SIGNED_SAME_WINDING_PAIR_LOCAL_CLEANUP_OPPOSITE_WINDING_PRESERVED', 'repair geometry policy drifted');
  requireThat(summary.pipelineScript === posix(REPAIR_SCRIPT) && summary.pipelineScriptSha256 === sha256File(REPAIR_SCRIPT), 'repair summary pipeline-script binding failed');
  requireThat(summary.rasterCleanupScript === posix(RASTER_CLEANUP_SCRIPT) && summary.rasterCleanupScriptSha256 === sha256File(RASTER_CLEANUP_SCRIPT), 'repair summary raster-cleanup script binding failed');
  requireThat(same(summary.repairDependencyContract, RASTER_DEPENDENCY) && same(summary.rasterAcceptanceContract, RASTER_ACCEPTANCE), 'repair summary shared cleanup contract drifted');
  requireThat(summary.materialSemanticContract?.preflightScope === 'EVERY_SELECTED_CANONICAL_GLB_BEFORE_ITEM_ONE'
    && summary.materialSemanticContract?.passed === true
    && summary.materialSemanticContract?.allSelectedModelsPassed === true
    && summary.materialSemanticContract?.fullCatalogCountsMatched === true
    && summary.materialSemanticContract?.selectedModelCount === FULL_MATERIAL.models
    && summary.materialSemanticContract?.selectedMaterialSlotCount === FULL_MATERIAL.slots
    && summary.materialSemanticContract?.uniqueNonemptyNames === FULL_MATERIAL.uniqueNonempty
    && summary.materialSemanticContract?.uniqueIncludingUnnamed === FULL_MATERIAL.uniqueWithUnnamed
    && summary.materialSemanticContract?.unnamedSlots === FULL_MATERIAL.unnamedSlots
    && summary.materialSemanticContract?.materialCoverageSha256 === FULL_MATERIAL.coverageSha256,
  'repair full-catalog material-semantic census drifted');
  requireThat(summary.rasterCleanup?.passed === true && summary.rasterCleanup?.acceptedPairsAfter === 0 && summary.rasterCleanup?.exactDuplicatePairsAfter === 0 && summary.rasterCleanup?.remainingPairs === 0 && Number.isInteger(summary.rasterCleanup?.maximumStabilizationPasses) && summary.rasterCleanup.maximumStabilizationPasses <= RASTER_ACCEPTANCE.maximumCleanupPasses, 'repair summary cleanup proof is not converged');
  requireThat(summary.catalog === posix(CATALOG_FILE) && summary.catalogSha256 === contract.catalogHash, 'repair summary is not hash-bound to the current catalog');
  requireThat(summary.totalScheduled === EXPECTED.included && summary.processed === EXPECTED.included && summary.failed === 0, 'repair run is partial or failed');
  requireThat(Array.isArray(summary.failures) && summary.failures.length === 0, 'repair summary contains failures');
  requireThat(summary.selection?.fullCatalog === true && summary.selection?.includeSpline === true && summary.selection?.limit === 0, 'repair summary is not a full-catalog run');
  requireThat(summary.pipelineExclusionCount === EXPECTED.excluded, 'repair summary does not exclude exactly ten');
  requireThat(same((summary.pipelineExclusions || []).map(stripRepairOutputState).sort((a, b) => a.key.localeCompare(b.key)), expectedExclusions(contract, true)), 'repair exclusion manifest drifted');
  for (const item of summary.pipelineExclusions || []) {
    requireThat(item.processingOutputCount === 0 && same(item.processingOutputs, []), `excluded model received repair output: ${item.key}`);
  }
  requireThat(same(summary.staleExcludedOutputsRemaining, []), 'stale repair output exists for an excluded model');

  const items = new Map();
  for (const catalogItem of contract.included.filter((item) => productionKeys.includes(item.key))) {
    const report = loaded.reports.get(catalogItem.key);
    const reportFile = loaded.paths.get(catalogItem.key);
    const expectedPath = path.join(REPAIR_REPORT_ROOT, catalogItem.family, `${safeId(catalogItem.id)}.json`);
    requireThat(path.resolve(reportFile) === path.resolve(expectedPath), `repair report is in the wrong location: ${catalogItem.key}`);
    requireThat(report.pipelineVersion === EXPECTED.repairPipeline && report.pipelineMode === 'DERIVED_SAME_WINDING_RASTER_CLEAN_AND_UV', `repair pipeline drifted: ${catalogItem.key}`);
    requireThat(report.pipelineScript === posix(REPAIR_SCRIPT) && report.pipelineScriptSha256 === sha256File(REPAIR_SCRIPT) && report.rasterCleanupScript === posix(RASTER_CLEANUP_SCRIPT) && report.rasterCleanupScriptSha256 === sha256File(RASTER_CLEANUP_SCRIPT), `repair script binding drifted: ${catalogItem.key}`);
    requireThat(same([report.id, report.family, report.category, report.kind], [catalogItem.id, catalogItem.family, catalogItem.category, catalogItem.kind]), `repair identity drifted: ${catalogItem.key}`);
    requireThat(report.catalogSha256 === contract.catalogHash, `repair catalog hash drifted: ${catalogItem.key}`);
    requireThat(report.source === catalogItem.model.path && report.sourceSha256 === catalogItem.model.sha256, `repair source binding drifted: ${catalogItem.key}`);
    requireThat(report.sourceUntouched === true && report.canonicalTopologyUntouched === true && report.uvGeometryPreserved === true && report.modelGenerationPerformed === false && report.derivedUvRefreshOnly === false, `repair changed or regenerated a canonical model: ${catalogItem.key}`);
    const raster = report.rasterCleanup || {};
    requireThat(same(report.repairDependencyContract, RASTER_DEPENDENCY) && same(report.rasterAcceptanceContract, RASTER_ACCEPTANCE) && same(raster.dependencyContract, RASTER_DEPENDENCY) && same(raster.contract, RASTER_ACCEPTANCE), `shared cleanup contract drifted: ${catalogItem.key}`);
    requireThat(rasterCleanupProgressGreen(raster) && Number.isFinite(raster.maxBoundsDriftM) && raster.maxBoundsDriftM <= RASTER_BOUNDS_DRIFT_LIMIT, `same-winding raster cleanup did not converge: ${catalogItem.key}`);
    requireThat(lineageProofGreen(raster), `cleanup lineage proof drifted: ${catalogItem.key}`);
    requireThat(Array.isArray(raster.pairCountSequence) && raster.pairCountSequence[0] === raster.acceptedPairsBefore && raster.pairCountSequence.at(-1) === 0 && raster.pairCountSequence.length === raster.stabilizationPassCount + 1, `cleanup pass sequence is invalid: ${catalogItem.key}`);
    requireThat(report.derivedTopologyChanged === raster.mutated && report.derivedRasterCleanupPerformed === raster.mutated && report.topologyPreserved === !raster.mutated && Number.isFinite(report.maxDimensionDriftM) && report.maxDimensionDriftM <= RASTER_BOUNDS_DRIFT_LIMIT, `derived cleanup state or bounds drifted: ${catalogItem.key}`);
    requireThat(REPAIR_STATUSES.has(report.status), `repair blocker remains for ${catalogItem.key}: ${report.status}`);
    requireThat(report.overlapFaces === 0 && report.allRenderMeshOverlapFaces === 0 && report.uvOverlapProof?.passed === true, `UV overlap proof failed: ${catalogItem.key}`);
    const aggregate = report.tiledUvMetrics || {};
    requireThat(aggregate.valid === true && Number.isFinite(aggregate.maxStretchRatio) && aggregate.maxStretchRatio <= CUBIC_STRETCH_LIMIT, `cubic stretch proof failed: ${catalogItem.key}`);
    requireThat(Number.isFinite(aggregate.maxAreaScaleRelativeError) && aggregate.maxAreaScaleRelativeError <= TEXEL_SCALE_ERROR_LIMIT, `cubic scale proof failed: ${catalogItem.key}`);
    requireThat(Array.isArray(report.meshes) && report.meshes.length === report.renderMeshCount && report.meshes.length > 0, `repair mesh audit is incomplete: ${catalogItem.key}`);
    for (const mesh of report.meshes) {
      requireThat(mesh.cleanup?.mode === 'DERIVED_SAME_WINDING_RASTER_CLEAN_AND_UV' && mesh.cleanup?.canonicalTopologyUntouched === true && mesh.cleanup?.uvGeometryPreserved === true && mesh.cleanup?.derivedTopologyChanged === !mesh.cleanup?.topologyPreserved, `mesh cleanup state drifted: ${catalogItem.key}/${mesh.name}`);
      requireThat(SHA256.test(mesh.cleanup?.geometrySignatureAfterRasterCleanup || '') && mesh.cleanup?.geometrySignatureAfterRasterCleanup === mesh.cleanup?.geometrySignatureAfter, `mesh cleanup/UV geometry identity failed: ${catalogItem.key}/${mesh.name}`);
      requireThat(mesh.packedUv?.present === true && mesh.packedUv?.finite === true && mesh.packedUv?.insideUnitSquare === true && mesh.packedUv?.zeroAreaFaces === 0 && mesh.packedUv?.overlapFaces === 0, `packed UV proof failed: ${catalogItem.key}/${mesh.name}`);
      requireThat(mesh.tiledUv?.present === true && mesh.tiledUv?.finite === true && mesh.tiledUv?.zeroAreaFaces === 0, `tiled UV proof failed: ${catalogItem.key}/${mesh.name}`);
      requireThat(mesh.tiledUvMetrics?.valid === true && mesh.tiledUvMetrics?.scaleConsistent === true && mesh.tiledUvMetrics?.withinCubicStretchBound === true, `mesh stretch proof failed: ${catalogItem.key}/${mesh.name}`);
    }
    verifyFileRecord(report.output, report.outputSha256, null, OUT, `derived UV model ${catalogItem.key}`);
    verifyFileRecord(report.textureSource, report.textureSourceSha256, null, OUT, `UV texture source ${catalogItem.key}`);
    items.set(catalogItem.key, { report, reportFile });
  }
  requireThat(same(countsBy([...loaded.reports.values()], 'status'), summary.statusCounts), 'repair status counts do not match the full report census');
  return { summary, summaryFile: REPAIR_SUMMARY_FILE, ...loaded, allReports: loaded.reports, items, productionKeys, quarantine };
}

function verifyPbrRebindProvenance(report, repairReport, artifact, finalUv, coverage) {
  const disposition = report.artifactDisposition;
  const proof = report.contentEquivalentRebind;
  if (disposition === 'REBUILT') {
    requireThat(proof === null && report.contentEquivalentRebindSha256 === null, `rebuilt PBR item carries rebind provenance: ${report.key}`);
    return null;
  }
  requireThat(disposition === 'CONTENT_EQUIVALENT_REBOUND' && proof, `PBR artifact disposition is not fail-closed: ${report.key}`);
  requireThat(proof.schema === CONTENT_EQUIVALENT_REBIND_SCHEMA
    && proof.method === CONTENT_EQUIVALENT_REBIND_METHOD
    && proof.passed === true,
  `PBR rebind contract drifted: ${report.key}`);
  const legacy = proof.legacyReport || {};
  const currentPipeline = proof.currentValidationPipeline || {};
  const currentInput = proof.currentRepairInput || {};
  const reused = proof.reusedPbrOutput || {};
  const fresh = proof.freshValidation || {};
  const expectedLegacyPrefix = `tmp/stage10-model-repair/pbr-reports/rebind-provenance/legacy/${report.family}/`;
  const expectedLegacyName = `${safeId(report.id)}.${legacy.sha256}.legacy.json.provenance`;
  requireThat(legacy.path?.startsWith(expectedLegacyPrefix) && path.posix.basename(legacy.path) === expectedLegacyName, `PBR legacy provenance path drifted: ${report.key}`);
  const legacyFile = verifyFileRecord(legacy.path, legacy.sha256, legacy.bytes, path.join(PBR_REPORT_ROOT, 'rebind-provenance'), `PBR legacy provenance ${report.key}`);
  const legacyReport = readJson(legacyFile, `PBR legacy provenance ${report.key}`);
  requireThat(legacy.pipelineScriptSha256 === CONTENT_EQUIVALENT_REBIND_LEGACY_PIPELINE_SHA256
    && legacyReport.pipelineScriptSha256 === legacy.pipelineScriptSha256
    && legacyReport.schema === 'MassfrontStage10ModelPbrV1'
    && legacyReport.status === 'PBR_TEXTURED'
    && same([legacyReport.key, legacyReport.id, legacyReport.family, legacyReport.category, legacyReport.kind], [report.key, report.id, report.family, report.category, report.kind]),
  `PBR legacy producer or identity drifted: ${report.key}`);
  requireThat(currentPipeline.path === posix(PBR_SCRIPT)
    && currentPipeline.sha256 === sha256File(PBR_SCRIPT)
    && currentPipeline.sha256 === report.pipelineScriptSha256
    && currentPipeline.blenderVersion === report.blenderVersion,
  `PBR current validation-pipeline binding drifted: ${report.key}`);
  requireThat(legacy.sourceSha256 === repairReport.outputSha256
    && legacyReport.source === currentInput.path
    && legacyReport.sourceSha256 === legacy.sourceSha256
    && legacy.outputSha256 === report.outputSha256
    && legacyReport.output === reused.path
    && legacyReport.outputSha256 === legacy.outputSha256,
  `PBR legacy byte binding drifted: ${report.key}`);
  verifyFileRecord(currentInput.path, currentInput.sha256, currentInput.bytes, OUT, `PBR rebound repair input ${report.key}`);
  verifyFileRecord(reused.path, reused.sha256, reused.bytes, PBR_MODEL_ROOT, `PBR rebound output ${report.key}`);
  requireThat(currentInput.path === repairReport.output
    && currentInput.sha256 === repairReport.outputSha256
    && currentInput.sha256 === legacy.sourceSha256
    && reused.path === report.output
    && reused.sha256 === report.outputSha256
    && reused.sha256 === legacy.outputSha256,
  `PBR current byte-equivalence binding drifted: ${report.key}`);
  const legacyMapCount = (legacyReport.materials || []).reduce((total, material) => total + Object.keys(material.maps || {}).length, 0);
  const currentMapCount = (report.materials || []).reduce((total, material) => total + Object.keys(material.maps || {}).length, 0);
  requireThat(proof.byteIdenticalRepairInput === true
    && proof.byteIdenticalPbrOutput === true
    && Number.isInteger(proof.legacyMapRecordCountRevalidated)
    && proof.legacyMapRecordCountRevalidated > 0
    && proof.legacyMapRecordCountRevalidated === legacyMapCount
    && proof.legacyMapRecordCountRevalidated === currentMapCount
    && proof.previousReportUsedAsCurrentAcceptanceEvidence === false
    && proof.outputReexported === false
    && proof.reportRewritten === true,
  `PBR rebind reused stale acceptance evidence: ${report.key}`);
  requireThat(proof.legacyMaterialManifestSha256 === canonicalHash(legacyReport.materials)
    && proof.currentMaterialManifestSha256 === canonicalHash(report.materials)
    && proof.legacyMaterialManifestSha256 === proof.currentMaterialManifestSha256,
  `PBR rebind material manifest drifted: ${report.key}`);
  requireThat(proof.legacyLibraryContractSha256 === legacyReport.library?.contractSha256
    && proof.currentLibraryContractSha256 === report.library?.contractSha256
    && proof.legacyLibraryContractSha256 === proof.currentLibraryContractSha256,
  `PBR rebind library contract drifted: ${report.key}`);
  requireThat(fresh.sourceImported === true
    && fresh.pbrOutputImported === true
    && fresh.glbMapCoverageValidated === true
    && fresh.opaqueSingleSidedValidated === true
    && fresh.topologyIndexWindingPositionNormalUvIdentityValidated === true
    && fresh.materialSlotCountsAndFaceAssignmentsValidated === true
    && fresh.packedUvOverlapValidated === true
    && fresh.tiledUvWorldJacobianValidated === true,
  `PBR rebound output lacks fresh current validation: ${report.key}`);
  requireThat(fresh.sourceSceneIdentitySha256 === artifact.sourceSceneIdentitySha256
    && fresh.finalSceneIdentitySha256 === artifact.finalSceneIdentitySha256
    && fresh.sourceSceneIdentitySha256 === fresh.finalSceneIdentitySha256
    && fresh.fullPbrCoverageSha256 === canonicalHash(coverage)
    && fresh.finalUvProofSha256 === canonicalHash(finalUv),
  `PBR rebound fresh proof hashes drifted: ${report.key}`);
  requireThat(report.contentEquivalentRebindSha256 === canonicalHash(proof), `PBR rebind provenance hash failed: ${report.key}`);
  return legacyFile;
}

function verifyPbr(contract, repair, accounting) {
  // Float-bearing cleanup hashes are produced and recomputed by the Python
  // lanes. JavaScript cannot recover Python's int-vs-float spelling after
  // parsing, so exact report bytes and direct proof checks are authoritative.
  const summary = readJson(PBR_SUMMARY_FILE, 'PBR summary');
  const loaded = loadReports(PBR_REPORT_ROOT, 'MassfrontStage10ModelPbrV1', { omitSummary: true, omitLibrary: true });
  const expectedKeys = (accounting?.pbr?.productionManifest || []).map((row) => row.key);
  const quarantine = accounting?.pbr?.quarantineManifest || [];
  requireThat(loaded.files.length === expectedKeys.length && sameSet(loaded.reports.keys(), expectedKeys), 'PBR report membership does not equal the proof-green PBR production manifest');
  requireThat(summary.schema === 'MassfrontStage10ModelPbrSummaryV1', `unexpected PBR summary schema ${summary.schema}`);
  requireThat(summary.pipelineVersion === EXPECTED.pbrPipeline && summary.pipelineMode === 'DERIVED_ATLAS_PBR_ONLY', 'PBR summary pipeline drifted');
  requireThat(summary.runtimePromotionPerformed === false, 'PBR summary claims runtime promotion');
  requireThat(summary.contentEquivalentRebindRequested === true, 'PBR summary did not request the fail-closed content-equivalence path');
  requireThat(same(summary.contentEquivalentRebindPolicy, CONTENT_EQUIVALENT_REBIND_POLICY), 'PBR summary content-equivalence policy drifted');
  requireThat(summary.catalogSha256 === contract.catalogHash, 'PBR summary is not hash-bound to the catalog');
  requireThat(summary.repairSummary?.path === posix(repair.summaryFile)
    && summary.repairSummary?.sha256 === sha256File(repair.summaryFile)
    && summary.repairSummary?.schema === 'MassfrontStage10ModelRepairSummaryV3'
    && summary.repairSummary?.pipelineVersion === EXPECTED.repairPipeline
    && same(summary.repairSummary?.materialSemanticContract, repair.summary.materialSemanticContract)
    && canonicalTextBinding(
      summary.repairSummary?.materialSemanticContractCanonicalJson,
      repair.summary.materialSemanticContract,
      summary.repairSummary?.materialSemanticContractSha256,
    )
    && same(summary.repairMaterialSemanticContract, repair.summary.materialSemanticContract)
    && summary.repairMaterialSemanticContractSha256 === summary.repairSummary.materialSemanticContractSha256,
  'PBR summary repair/material-semantic binding failed');
  requireThat(summary.selection?.fullCatalog === true && summary.selection?.includeSpline === true && summary.selection?.limit === 0, 'PBR summary is not a full-catalog run');
  requireThat(summary.totalScheduled === repair.productionKeys.length && summary.processed === expectedKeys.length && summary.failed === quarantine.filter((row) => row.stage === 'PBR').length, 'PBR production/quarantine counts drifted');
  requireThat(same(summary.statusCounts, countsBy([...loaded.reports.values()], 'status')), 'PBR success status counts drifted');
  requireThat(same(summary.artifactDispositionCounts, countsBy([...loaded.reports.values()], 'artifactDisposition')), 'PBR artifact-disposition counts do not match reports');
  requireThat(same((summary.exclusions || []).sort((a, b) => a.key.localeCompare(b.key)), expectedExclusions(contract)), 'PBR exclusion manifest drifted');
  requireThat(summary.itemManifestSha256 === canonicalHash(summary.items || []), 'PBR summary item-manifest hash failed');
  const summaryItems = new Map((summary.items || []).map((item) => [item.key, item]));
  requireThat(summaryItems.size === expectedKeys.length && sameSet(summaryItems.keys(), expectedKeys), 'PBR summary item manifest is not the production manifest');

  const verifiedMaps = new Map();
  const items = new Map();
  const referencedLegacyArchives = [];
  for (const catalogItem of contract.included.filter((item) => expectedKeys.includes(item.key))) {
    const report = loaded.reports.get(catalogItem.key);
    const reportFile = loaded.paths.get(catalogItem.key);
    const repairItem = repair.items.get(catalogItem.key);
    const expectedPath = path.join(PBR_REPORT_ROOT, catalogItem.family, `${safeId(catalogItem.id)}.json`);
    requireThat(path.resolve(reportFile) === path.resolve(expectedPath), `PBR report is in the wrong location: ${catalogItem.key}`);
    requireThat(report.pipelineVersion === EXPECTED.pbrPipeline && report.pipelineMode === 'DERIVED_ATLAS_PBR_ONLY' && report.status === 'PBR_TEXTURED', `PBR report contract drifted: ${catalogItem.key}`);
    requireThat(same(report.resumeContract?.contentEquivalentRebindPolicy, CONTENT_EQUIVALENT_REBIND_POLICY), `PBR report content-equivalence policy drifted: ${catalogItem.key}`);
    requireThat(same([report.id, report.family, report.category, report.kind], [catalogItem.id, catalogItem.family, catalogItem.category, catalogItem.kind]), `PBR identity drifted: ${catalogItem.key}`);
    requireThat(report.catalogSha256 === contract.catalogHash, `PBR catalog hash drifted: ${catalogItem.key}`);
    requireThat(report.runtimePromotionPerformed === false && report.modelGenerationPerformed === false && report.canonicalGeometryLocked === true, `PBR output violated locked-model policy: ${catalogItem.key}`);
    requireThat(report.pipelineScriptSha256 === sha256File(PBR_SCRIPT), `PBR pipeline-script binding failed: ${catalogItem.key}`);
    requireThat(report.repairPipelineScript === posix(REPAIR_SCRIPT) && report.repairPipelineScriptSha256 === sha256File(REPAIR_SCRIPT) && report.rasterCleanupScript === posix(RASTER_CLEANUP_SCRIPT) && report.rasterCleanupScriptSha256 === sha256File(RASTER_CLEANUP_SCRIPT), `PBR repair/cleanup script binding failed: ${catalogItem.key}`);
    requireThat(report.canonicalSource === catalogItem.model.path && report.canonicalSourceSha256 === catalogItem.model.sha256, `PBR canonical source binding drifted: ${catalogItem.key}`);
    requireThat(report.repairReport === posix(repairItem.reportFile) && report.repairReportSha256 === sha256File(repairItem.reportFile), `PBR repair-report hash binding failed: ${catalogItem.key}`);
    requireThat(report.repairPipelineVersion === EXPECTED.repairPipeline && same(report.repairDependencyContract, RASTER_DEPENDENCY) && same(report.rasterAcceptanceContract, RASTER_ACCEPTANCE) && canonicalTextBinding(report.repairRasterCleanupCanonicalJson, repairItem.report.rasterCleanup, report.repairRasterCleanupSha256) && canonicalTextBinding(report.repairLineageProofCanonicalJson, repairItem.report.rasterCleanup.lineageProof, report.repairLineageProofSha256) && canonicalTextBinding(report.repairMaterialSemanticContractCanonicalJson, repairItem.report.materialSemanticContract, report.repairMaterialSemanticContractSha256) && lineageProofGreen(repairItem.report.rasterCleanup), `PBR V18 cleanup-proof binding failed: ${catalogItem.key}`);
    requireThat(report.source === repairItem.report.output && report.sourceSha256 === repairItem.report.outputSha256, `PBR repair-output hash binding failed: ${catalogItem.key}`);
    requireThat(report.preservation?.topology === true && report.preservation?.winding === true && report.preservation?.normals === true && report.preservation?.transforms === true && report.preservation?.materialSlotFaceAssignments === true, `PBR binding changed model data: ${catalogItem.key}`);
    const artifact = report.preservation?.postExportArtifactIdentity || {};
    const renderNames = artifact.renderNodeNames || [];
    const expectedRenderNames = Object.entries(artifact.sourceMeshIdentity || {})
      .filter(([, identity]) => identity?.renderNode === true)
      .map(([name]) => name).sort();
    requireThat(artifact.passed === true && artifact.topologyIndexWindingPositionNormalUvIdentity === true && same(artifact.sourceMeshIdentity, artifact.finalMeshIdentity) && Array.isArray(renderNames) && renderNames.length > 0 && same(renderNames, [...new Set(renderNames)].sort()) && same(renderNames, expectedRenderNames) && artifact.sourceSceneIdentitySha256 === canonicalHash(artifact.sourceMeshIdentity) && artifact.finalSceneIdentitySha256 === canonicalHash(artifact.finalMeshIdentity) && report.postExportArtifactIdentitySha256 === canonicalHash(artifact), `PBR post-export mesh identity failed: ${catalogItem.key}`);
    const finalUv = report.uv?.finalPbrArtifact || {};
    requireThat(same(Object.keys(finalUv.packedOverlapByMesh || {}).sort(), renderNames)
      && same(Object.keys(finalUv.tiledMetricsByMesh || {}).sort(), renderNames)
      && finalUv.passed === true && finalUv.packedOverlapFaces === 0
      && finalUv.allTiledMetricsValid === true,
    `PBR final-UV mesh coverage failed: ${catalogItem.key}`);
    requireThat(report.cleanup?.removedRenderGeometry === 0 && report.cleanup?.changedTopology === false && report.cleanup?.changedNormals === false && report.cleanup?.changedTransforms === false, `PBR pass performed geometry cleanup: ${catalogItem.key}`);
    const uv = report.uv || {};
    requireThat(uv.packed?.name === 'UV_GEN' && uv.packed?.gltfTexcoord === 0 && uv.packed?.preserved === true, `PBR UV_GEN binding failed: ${catalogItem.key}`);
    requireThat(uv.tiled?.name === 'UVMap_Tile' && uv.tiled?.gltfTexcoord === 1 && uv.tiled?.metresPerTile === 4, `PBR tiled UV binding failed: ${catalogItem.key}`);
    requireThat(uv.overlapFaces === 0 && uv.allRenderMeshOverlapFaces === 0 && uv.passed === true, `PBR UV proof failed: ${catalogItem.key}`);
    requireThat(Number.isFinite(uv.maxStretchRatio) && uv.maxStretchRatio <= CUBIC_STRETCH_LIMIT && Number.isFinite(uv.maxAreaScaleRelativeError) && uv.maxAreaScaleRelativeError <= TEXEL_SCALE_ERROR_LIMIT, `PBR stretch/scale binding failed: ${catalogItem.key}`);

    const coverage = report.fullPbrCoverage || {};
    requireThat(coverage.passed === true && coverage.renderPrimitives > 0 && coverage.totalBound === coverage.renderPrimitives, `PBR primitive coverage failed: ${catalogItem.key}`);
    requireThat(coverage.opaqueMaterialCount > 0 && coverage.opaqueMaterialCount === coverage.singleSidedMaterialCount && coverage.doubleSidedMaterialCount === 0, `PBR OPAQUE/backface-culling evidence failed: ${catalogItem.key}`);
    requireThat(same([...(coverage.materialNames || [])].sort(), (report.materials || []).map((material) => material.outputMaterial).sort()), `PBR material-name coverage drifted: ${catalogItem.key}`);
    for (const role of ['baseColorTexture', 'normalTexture', 'metallicRoughnessTexture', 'occlusionTexture']) {
      requireThat(coverage[role] === coverage.renderPrimitives, `${role} does not cover every render primitive: ${catalogItem.key}`);
    }
    requireThat(Array.isArray(report.materials) && report.materials.length > 0, `PBR material evidence is empty: ${catalogItem.key}`);
    for (const material of report.materials) {
      requireThat(same(material.rasterization, PBR_RASTER_POLICY), `PBR material is not explicit OPAQUE/single-sided: ${catalogItem.key}/${material.outputMaterial}`);
      for (const role of ['baseColor', 'normal', 'orm']) {
        const map = material.maps?.[role];
        requireThat(map && map.path && map.sha256, `${role} PBR map is missing: ${catalogItem.key}/${material.outputMaterial}`);
        const mapKey = `${map.path}:${map.sha256}`;
        if (!verifiedMaps.has(mapKey)) verifiedMaps.set(mapKey, verifyFileRecord(map.path, map.sha256, null, path.join(PBR_REPORT_ROOT, 'library', 'cells'), `PBR map ${map.path}`));
      }
      requireThat(material.bindings?.baseColorTexture === 1 && material.bindings?.normalTexture === 1 && material.bindings?.metallicRoughnessTexture === 1 && material.bindings?.occlusionTexture === 1, `PBR material is not bound to TEXCOORD_1: ${catalogItem.key}/${material.outputMaterial}`);
      requireThat(material.bindings?.preservedPackedUv?.gltfTexcoord === 0 && material.bindings?.tiledUv?.gltfTexcoord === 1, `PBR material UV channels drifted: ${catalogItem.key}/${material.outputMaterial}`);
      if (material.emissiveRequired) {
        requireThat(material.maps?.emissive && material.bindings?.emissiveTexture === 1, `required emissive map is missing: ${catalogItem.key}/${material.outputMaterial}`);
        const map = material.maps.emissive;
        const mapKey = `${map.path}:${map.sha256}`;
        if (!verifiedMaps.has(mapKey)) verifiedMaps.set(mapKey, verifyFileRecord(map.path, map.sha256, null, path.join(PBR_REPORT_ROOT, 'library', 'cells'), `PBR map ${map.path}`));
      }
    }
    verifyFileRecord(report.output, report.outputSha256, null, PBR_MODEL_ROOT, `PBR model ${catalogItem.key}`);
    requireThat(canonicalTextBinding(report.resumeContractCanonicalJson, report.resumeContract, report.resumeContractSha256) && canonicalTextBinding(report.contractCanonicalJson, report.contract, report.contractSha256) && canonicalTextBinding(report.finalUvProofCanonicalJson, uv.finalPbrArtifact, report.finalUvProofSha256), `PBR exact contract hashes failed: ${catalogItem.key}`);
    const legacyArchive = verifyPbrRebindProvenance(report, repairItem.report, artifact, finalUv, coverage);
    if (legacyArchive) referencedLegacyArchives.push(legacyArchive);

    const summaryItem = summaryItems.get(catalogItem.key);
    requireThat(summaryItem.status === report.status && summaryItem.report === posix(reportFile) && summaryItem.reportSha256 === sha256File(reportFile), `PBR summary report binding failed: ${catalogItem.key}`);
    requireThat(summaryItem.artifactDisposition === report.artifactDisposition && summaryItem.contentEquivalentRebindSha256 === report.contentEquivalentRebindSha256, `PBR summary provenance binding failed: ${catalogItem.key}`);
    requireThat(summaryItem.output === report.output && summaryItem.outputSha256 === report.outputSha256, `PBR summary output binding failed: ${catalogItem.key}`);
    items.set(catalogItem.key, { report, reportFile });
  }
  requireThat(new Set(referencedLegacyArchives.map(posix)).size === referencedLegacyArchives.length, 'PBR rebind provenance archive is referenced more than once');
  requireThat(sameSet(
    walkFiles(path.join(PBR_REPORT_ROOT, 'rebind-provenance')).map(posix),
    referencedLegacyArchives.map(posix),
  ), 'PBR rebind provenance archive set contains missing or unreferenced files');
  return { summary, summaryFile: PBR_SUMMARY_FILE, ...loaded, items, productionKeys: expectedKeys, quarantine };
}

function verifyZfighting(contract, repair, pbr, accounting) {
  const summary = readJson(ZFIGHT_SUMMARY_FILE, 'z-fighting summary');
  const loaded = loadReports(ZFIGHT_REPORT_ROOT, 'MassfrontStage10ZFightingAuditV3', { omitSummary: true });
  const expectedKeys = (accounting?.audit?.productionManifest || []).map((row) => row.key);
  const quarantine = accounting?.audit?.quarantineManifest || [];
  requireThat(expectedKeys.every((key) => loaded.reports.has(key)) && [...loaded.reports.keys()].every((key) => pbr.productionKeys.includes(key)), 'z-fighting reports do not match the proof-green audit input/production partition');
  requireThat(summary.schema === 'MassfrontStage10ZFightingAuditSummaryV3' && summary.pipelineVersion === EXPECTED.zFightingAudit && summary.auditMode === ZFIGHT_AUDIT_MODE, 'z-fighting summary contract drifted');
  requireThat(summary.broadPhaseMethod === ZFIGHT_BROAD_PHASE_METHOD && summary.exactDuplicateAuthority === ZFIGHT_DUPLICATE_AUTHORITY && summary.rawGlbAuditMethod === RAW_GLTF_AUDIT_METHOD, 'z-fighting authority drifted');
  requireThat(summary.sourcePolicy === 'READ_ONLY_NO_MODEL_MUTATION' && summary.sourceBindingPolicy === 'CATALOG_REPAIR_AND_EXACT_PBR_REPORT_OUTPUT_SHA256' && summary.catalogSha256 === contract.catalogHash, 'z-fighting source binding drifted');
  requireThat(same(summary.repairDependencyContract, RASTER_DEPENDENCY) && same(summary.rasterAcceptanceContract, RASTER_ACCEPTANCE), 'z-fighting shared cleanup contract drifted');
  requireThat(summary.repairPipelineScript === posix(REPAIR_SCRIPT) && summary.repairPipelineScriptSha256 === sha256File(REPAIR_SCRIPT), 'z-fighting repair-script binding failed');
  requireThat(summary.pbrPipelineScript === posix(PBR_SCRIPT) && summary.pbrPipelineScriptSha256 === sha256File(PBR_SCRIPT), 'z-fighting PBR-script binding failed');
  requireThat(summary.rasterCleanupScript === posix(RASTER_CLEANUP_SCRIPT) && summary.rasterCleanupScriptSha256 === sha256File(RASTER_CLEANUP_SCRIPT), 'z-fighting cleanup-script binding failed');
  requireThat(same(summary.pbrRasterPolicy, PBR_RASTER_POLICY) && summary.pbrRasterPolicySha256 === canonicalHash(PBR_RASTER_POLICY), 'z-fighting PBR raster policy drifted');
  requireThat(same(summary.selection, { families: [], only: [], includeSpline: true, limit: 0, fullCatalog: true }), 'z-fighting summary is not a full-catalog run');
  requireThat(summary.totalScheduled === pbr.productionKeys.length && summary.processed === loaded.files.length && summary.failed === quarantine.filter((row) => row.stage === 'AUDIT').length, 'z-fighting production/quarantine counts drifted');
  requireThat(same(summary.statusCounts, countsBy([...loaded.reports.values()], 'status')), 'z-fighting status counts drifted');
  requireThat(same((summary.exclusions || []).sort((a, b) => a.key.localeCompare(b.key)), expectedExclusions(contract)), 'z-fighting exclusion manifest drifted');
  const summaryItems = new Map((summary.items || []).map((item) => [item.key, item]));
  requireThat(summaryItems.size === expectedKeys.length && sameSet(summaryItems.keys(), expectedKeys), 'z-fighting summary item manifest is not the audit production manifest');

  const items = new Map();
  let rasterPairs = 0;
  let rawDuplicates = 0;
  for (const catalogItem of contract.included.filter((item) => expectedKeys.includes(item.key))) {
    const report = loaded.reports.get(catalogItem.key);
    const reportFile = loaded.paths.get(catalogItem.key);
    const repairItem = repair.items.get(catalogItem.key);
    const pbrItem = pbr.items.get(catalogItem.key);
    const expectedPath = path.join(ZFIGHT_REPORT_ROOT, catalogItem.family, `${safeId(catalogItem.id)}.json`);
    requireThat(path.resolve(reportFile) === path.resolve(expectedPath), `z-fighting report is in the wrong location: ${catalogItem.key}`);
    requireThat(report.pipelineVersion === EXPECTED.zFightingAudit && report.auditMode === ZFIGHT_AUDIT_MODE && report.broadPhaseMethod === ZFIGHT_BROAD_PHASE_METHOD && report.exactDuplicateAuthority === ZFIGHT_DUPLICATE_AUTHORITY, `z-fighting item contract drifted: ${catalogItem.key}`);
    requireThat(report.status === 'PASS' && report.passed === true && report.geometryMutationPerformed === false && report.alternateLodComparisonPerformed === false, `z-fighting item failed: ${catalogItem.key}`);
    requireThat(same([report.id, report.family, report.category, report.kind], [catalogItem.id, catalogItem.family, catalogItem.category, catalogItem.kind]) && report.catalogSha256 === contract.catalogHash, `z-fighting identity drifted: ${catalogItem.key}`);
    requireThat(report.auditScriptSha256 === sha256File(ZFIGHT_SCRIPT), `z-fighting script hash drifted: ${catalogItem.key}`);
    requireThat(report.repairReport === posix(repairItem.reportFile) && report.repairReportSha256 === sha256File(repairItem.reportFile) && report.repairPipelineVersion === EXPECTED.repairPipeline && report.repairOutput === repairItem.report.output && report.repairOutputSha256 === repairItem.report.outputSha256, `z-fighting repair binding failed: ${catalogItem.key}`);
    requireThat(report.pbrReport === posix(pbrItem.reportFile) && report.pbrReportSha256 === sha256File(pbrItem.reportFile) && report.pbrPipelineVersion === EXPECTED.pbrPipeline && report.pbrOutput === pbrItem.report.output && report.pbrOutputSha256 === pbrItem.report.outputSha256 && report.source === pbrItem.report.output && report.sourceSha256 === pbrItem.report.outputSha256, `z-fighting exact PBR binding failed: ${catalogItem.key}`);
    requireThat(report.repairPipelineScript === posix(REPAIR_SCRIPT) && report.repairPipelineScriptSha256 === sha256File(REPAIR_SCRIPT) && report.pbrPipelineScript === posix(PBR_SCRIPT) && report.pbrPipelineScriptSha256 === sha256File(PBR_SCRIPT) && report.rasterCleanupScript === posix(RASTER_CLEANUP_SCRIPT) && report.rasterCleanupScriptSha256 === sha256File(RASTER_CLEANUP_SCRIPT), `z-fighting pipeline binding failed: ${catalogItem.key}`);
    requireThat(report.repairRasterCleanupSha256 === pbrItem.report.repairRasterCleanupSha256 && report.repairLineageProofSha256 === pbrItem.report.repairLineageProofSha256, `z-fighting cleanup-proof hash chain failed: ${catalogItem.key}`);
    requireThat(same(report.repairDependencyContract, RASTER_DEPENDENCY) && same(report.rasterAcceptanceContract, RASTER_ACCEPTANCE) && same(report.tolerances, RASTER_ACCEPTANCE), `z-fighting shared acceptance drifted: ${catalogItem.key}`);
    const pbrRaster = report.pbrRasterBinding || {};
    requireThat(pbrRaster.passed === true && same(pbrRaster.policy, PBR_RASTER_POLICY) && pbrRaster.policySha256 === canonicalHash(PBR_RASTER_POLICY) && pbrRaster.renderPrimitiveCount === pbrItem.report.fullPbrCoverage.renderPrimitives && pbrRaster.opaqueSingleSidedMaterialCount === pbrItem.report.fullPbrCoverage.opaqueMaterialCount, `z-fighting OPAQUE/single-sided binding failed: ${catalogItem.key}`);
    const raster = report.rasterAudit || {};
    requireThat(raster.schema === 'MassfrontStage10RasterCleanupV2' && same(raster.contract, RASTER_ACCEPTANCE) && same(raster.dependencyContract, RASTER_DEPENDENCY) && raster.passed === true && raster.pairs === 0 && raster.riskAreaM2 === 0, `fresh PBR same-winding audit failed: ${catalogItem.key}`);
    const raw = report.rawGlbAudit || {};
    requireThat(raw.method === RAW_GLTF_AUDIT_METHOD && raw.sourceSha256 === report.sourceSha256 && raw.passed === true && raw.exactDuplicateTrianglesWithinRenderNode === 0 && same(raw.duplicateSamples, []) && SHA256.test(report.rawGlbAuditSha256 || ''), `fresh PBR raw duplicate audit failed: ${catalogItem.key}`);
    requireThat(report.findings?.total === 0 && report.findings?.rawExactDuplicateFacesWithinRenderNode === 0, `z-fighting findings remain: ${catalogItem.key}`);
    rasterPairs += raster.pairs;
    rawDuplicates += raw.exactDuplicateTrianglesWithinRenderNode;
    const summaryItem = summaryItems.get(catalogItem.key);
    requireThat(summaryItem.status === 'PASS' && summaryItem.passed === true && summaryItem.findings === 0 && summaryItem.rasterPairs === 0 && summaryItem.rawExactDuplicateFaces === 0 && summaryItem.pbrReportSha256 === sha256File(pbrItem.reportFile) && summaryItem.pbrOutputSha256 === pbrItem.report.outputSha256 && summaryItem.report === posix(reportFile) && summaryItem.reportSha256 === sha256File(reportFile), `z-fighting summary item binding failed: ${catalogItem.key}`);
    items.set(catalogItem.key, { report, reportFile });
  }
  requireThat(rasterPairs === 0 && rawDuplicates === 0, 'z-fighting report totals are not zero');
  return { summary, summaryFile: ZFIGHT_SUMMARY_FILE, ...loaded, items, productionKeys: expectedKeys, quarantine };
}

function pngDimensions(file) {
  const buffer = Buffer.alloc(24);
  const descriptor = fs.openSync(file, 'r');
  try {
    requireThat(fs.readSync(descriptor, buffer, 0, buffer.length, 0) === buffer.length, `PNG header is truncated: ${posix(file)}`);
  } finally {
    fs.closeSync(descriptor);
  }
  requireThat(buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `render evidence is not a PNG: ${posix(file)}`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function verifyRenderEvidence(record, root, label) {
  const file = verifyFileRecord(record?.path, record?.sha256, record?.bytes, root, label);
  requireThat(same(record.dimensions, [EXPECTED.renderResolution, EXPECTED.renderResolution]), `${label} declares wrong dimensions`);
  requireThat(same(pngDimensions(file), [EXPECTED.renderResolution, EXPECTED.renderResolution]), `${label} PNG has wrong dimensions`);
  return file;
}

function verifyRender(contract, repair, pbr, audit, accounting) {
  const summary = readJson(RENDER_SUMMARY_FILE, 'render-pair summary');
  const loaded = loadReports(RENDER_REPORT_ROOT, 'MassfrontStage10ModelPbrRenderPairV2');
  const expectedKeys = (accounting?.render?.productionManifest || []).map((row) => row.key);
  const quarantine = accounting?.render?.quarantineManifest || [];
  requireThat(loaded.files.length === expectedKeys.length && sameSet(loaded.reports.keys(), expectedKeys), 'render-pair report membership does not equal the render production manifest');
  requireThat(summary.schema === 'MassfrontStage10ModelPbrRenderSummaryV2' && summary.rendererVersion === EXPECTED.renderer && ['PASS', 'PASS_WITH_QUARANTINE'].includes(summary.status), 'render summary is not an accounted PBR pair run');
  requireThat(summary.sourcePolicy === 'READ_ONLY_GLTF_IMPORTS_ORIGINALS_UNTOUCHED', 'render summary source policy drifted');
  requireThat(summary.selection?.selectedCount === audit.productionKeys.length && summary.selection?.completeCatalog === (audit.productionKeys.length === EXPECTED.included) && same(summary.selection?.keys, []) && same(summary.selection?.families, []), 'render selection does not equal audit production');
  requireThat(summary.expectedFullRenderPairCount === audit.productionKeys.length && summary.repairReportCount === audit.productionKeys.length, 'render summary expected count drifted');
  requireThat(summary.counts?.selected === audit.productionKeys.length && (summary.counts.rendered || 0) + (summary.counts.resumed || 0) === expectedKeys.length && summary.counts.failed === quarantine.filter((row) => row.stage === 'RENDER').length, 'render production/quarantine counts drifted');
  requireThat(same(summary.resolution, [EXPECTED.renderResolution, EXPECTED.renderResolution]), 'render summary resolution drifted');
  requireThat(summary.repairSummary?.sha256 === sha256File(repair.summaryFile) && summary.repairSummary?.processed === EXPECTED.included && summary.repairSummary?.failed === 0, 'render summary is not hash-bound to the repair summary');
  requireThat(summary.pbrSummary?.sha256 === sha256File(pbr.summaryFile) && summary.pbrSummary?.productionManifestSha256 === pbr.summary.productionManifestSha256, 'render summary is not hash-bound to the PBR production manifest');
  requireThat(summary.rendererScript?.path === posix(RENDER_SCRIPT) && summary.rendererScript?.sha256 === sha256File(RENDER_SCRIPT), 'render summary renderer-script binding failed');
  requireThat(summary.repairPipeline?.path === posix(REPAIR_SCRIPT) && summary.repairPipeline?.sha256 === sha256File(REPAIR_SCRIPT), 'render summary repair-script binding failed');
  requireThat(summary.pbrPipeline?.path === posix(PBR_SCRIPT) && summary.pbrPipeline?.sha256 === sha256File(PBR_SCRIPT), 'render summary PBR-script binding failed');
  requireThat(summary.rasterCleanupPipeline?.path === posix(RASTER_CLEANUP_SCRIPT) && summary.rasterCleanupPipeline?.sha256 === sha256File(RASTER_CLEANUP_SCRIPT), 'render summary raster-cleanup script binding failed');
  requireThat(summary.renderContract?.schema === 'MassfrontStage10PbrRenderContractV2' && canonicalTextBinding(summary.renderContractCanonicalJson, summary.renderContract, summary.renderContractSha256), 'render contract hash failed');
  requireThat(summary.renderContract?.camera === 'MATCHED_UNION_BOUNDS_ORTHOGRAPHIC_ISOMETRIC', 'render pairs do not use matched framing');
  requireThat(summary.renderContract?.materialPolicy?.after === 'AUTHORITATIVE_DERIVED_PBR_MATERIALS_NO_FALLBACK' && summary.renderContract?.materialPolicy?.geometryProof === 'CANONICAL_LOCK_PLUS_SHARED_RASTER_CLEANUP_AND_REPAIR_PBR_IDENTITY' && summary.renderContract?.materialPolicy?.alphaMode === 'OPAQUE' && summary.renderContract?.materialPolicy?.doubleSided === false, 'after renders do not require the accepted PBR/raster policy');
  const summaryItems = new Map((summary.items || []).map((item) => [item.key, item]));
  requireThat(summaryItems.size === expectedKeys.length && sameSet(summaryItems.keys(), expectedKeys), 'render summary item manifest is not the render production manifest');

  const items = new Map();
  for (const catalogItem of contract.included.filter((item) => expectedKeys.includes(item.key))) {
    const report = loaded.reports.get(catalogItem.key);
    const reportFile = loaded.paths.get(catalogItem.key);
    const repairItem = repair.items.get(catalogItem.key);
    const pbrItem = pbr.items.get(catalogItem.key);
    const expectedPath = path.join(RENDER_REPORT_ROOT, catalogItem.family, `${safeId(catalogItem.id)}.json`);
    requireThat(path.resolve(reportFile) === path.resolve(expectedPath), `render report is in the wrong location: ${catalogItem.key}`);
    requireThat(report.rendererVersion === EXPECTED.renderer && report.status === 'RENDERED', `render report failed: ${catalogItem.key}`);
    requireThat(same([report.id, report.family, report.kind, report.repairStatus], [catalogItem.id, catalogItem.family, catalogItem.kind, repairItem.report.status]), `render identity drifted: ${catalogItem.key}`);
    requireThat(report.resumeKey === canonicalHash(report.binding), `render resume hash failed: ${catalogItem.key}`);
    requireThat(report.binding?.sourceSha256 === catalogItem.model.sha256 && report.binding?.repairOutputSha256 === repairItem.report.outputSha256 && report.binding?.pbrOutputSha256 === pbrItem.report.outputSha256, `render model hash binding failed: ${catalogItem.key}`);
    requireThat(report.binding?.repairPipelineSha256 === sha256File(REPAIR_SCRIPT) && report.binding?.pbrPipelineSha256 === sha256File(PBR_SCRIPT) && report.binding?.rendererScriptSha256 === sha256File(RENDER_SCRIPT) && report.binding?.rasterCleanupScriptSha256 === sha256File(RASTER_CLEANUP_SCRIPT), `render pipeline binding failed: ${catalogItem.key}`);
    requireThat(report.binding?.repairReportSha256 === sha256File(repairItem.reportFile) && report.binding?.pbrReportSha256 === sha256File(pbrItem.reportFile) && report.binding?.repairRasterCleanupSha256 === pbrItem.report.repairRasterCleanupSha256 && report.binding?.repairLineageProofSha256 === pbrItem.report.repairLineageProofSha256 && report.binding?.repairMaterialSemanticContractSha256 === pbrItem.report.repairMaterialSemanticContractSha256 && report.binding?.pbrFinalArtifactIdentitySha256 === pbrItem.report.postExportArtifactIdentitySha256 && report.binding?.pbrFinalUvProofSha256 === pbrItem.report.finalUvProofSha256, `render report hash binding failed: ${catalogItem.key}`);
    requireThat(canonicalTextBinding(report.binding?.pbrMaterialManifestCanonicalJson, pbrItem.report.materials, report.binding?.pbrMaterialManifestSha256), `render PBR material-manifest hash failed: ${catalogItem.key}`);
    requireThat(same(report.binding?.resolution, [EXPECTED.renderResolution, EXPECTED.renderResolution]), `render binding resolution drifted: ${catalogItem.key}`);
    requireThat(report.binding?.renderContractSha256 === summary.renderContractSha256 && same(report.renderContract, summary.renderContract) && canonicalTextBinding(report.renderContractCanonicalJson, report.renderContract, report.binding.renderContractSha256), `render contract binding failed: ${catalogItem.key}`);
    requireThat(report.source?.path === catalogItem.model.path && report.source?.sha256 === catalogItem.model.sha256, `render source binding failed: ${catalogItem.key}`);
    requireThat(report.repairOutput?.path === repairItem.report.output && report.repairOutput?.sha256 === repairItem.report.outputSha256, `render repair binding failed: ${catalogItem.key}`);
    requireThat(report.pbrReport?.path === posix(pbrItem.reportFile) && report.pbrReport?.sha256 === sha256File(pbrItem.reportFile), `render PBR-report binding failed: ${catalogItem.key}`);
    requireThat(report.pbrOutput?.path === pbrItem.report.output && report.pbrOutput?.sha256 === pbrItem.report.outputSha256, `render PBR-output binding failed: ${catalogItem.key}`);
    requireThat(report.geometryProof?.contract === 'CANONICAL_LOCK_PLUS_SHARED_RASTER_CLEANUP_AND_REPAIR_PBR_IDENTITY' && report.geometryProof?.passed === true && report.geometryProof?.canonicalBoundsWithinCleanupProof === true && report.geometryProof?.repairPbrBoundsMatch === true && report.geometryProof?.repairReportCleanupProof === true && report.geometryProof?.artifactIndependentAcceptance === true && report.geometryProof?.pbrReportPreservation === true && lineageProofGreen(repairItem.report.rasterCleanup), `render cleanup-aware geometry proof failed: ${catalogItem.key}`);
    requireThat(Array.isArray(report.pbrMapEvidence) && report.pbrMapEvidence.length > 0, `render report has no PBR map evidence: ${catalogItem.key}`);
    requireThat(report.pbrGlbEvidence?.renderPrimitiveCount === pbrItem.report.fullPbrCoverage?.renderPrimitives && report.pbrGlbEvidence?.opaqueSingleSidedMaterialCount === pbrItem.report.fullPbrCoverage?.opaqueMaterialCount && same(report.pbrGlbEvidence?.rasterPolicy, PBR_RASTER_POLICY), `render GLB PBR proof failed: ${catalogItem.key}`);
    const beforeFile = verifyRenderEvidence(report.before, RENDER_BEFORE_ROOT, `canonical before render ${catalogItem.key}`);
    const afterFile = verifyRenderEvidence(report.after, RENDER_AFTER_ROOT, `PBR after render ${catalogItem.key}`);
    requireThat(same(report.before?.settings?.resolution, report.after?.settings?.resolution), `render pair settings drifted: ${catalogItem.key}`);
    requireThat(report.after?.materials?.policy === 'PBR' && report.after?.materials?.neutralFallbackMeshes?.length === 0 && report.after?.materials?.materials?.length > 0, `after render used a fallback material: ${catalogItem.key}`);
    const summaryItem = summaryItems.get(catalogItem.key);
    requireThat(summaryItem.stage === 'RENDER' && summaryItem.disposition === 'PRODUCTION_READY' && summaryItem.status === 'PASS' && same(summaryItem.reasons, []), `render summary item failed: ${catalogItem.key}`);
    requireThat((summaryItem.itemReport || summaryItem.report) === posix(reportFile) && (summaryItem.itemReportSha256 || summaryItem.reportSha256) === sha256File(reportFile), `render summary report binding failed: ${catalogItem.key}`);
    requireThat(summaryItem.before === report.before.sha256 && summaryItem.after === report.after.sha256 && !summaryItem.error, `render summary image binding failed: ${catalogItem.key}`);
    items.set(catalogItem.key, { report, reportFile, beforeFile, afterFile });
  }
  return { summary, summaryFile: RENDER_SUMMARY_FILE, ...loaded, items, productionKeys: expectedKeys, quarantine };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function href(file) {
  return path.relative(GALLERY_ROOT, file).split(path.sep).map(encodeURIComponent).join('/');
}

function formatNumber(value, digits = 3) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function statusLabel(status) {
  return status === 'READY_FOR_TEXTURE_GENERATION' ? 'UV + PBR ready' : 'UV + PBR ready · source geometry noted';
}

function modelCard(item) {
  const { catalog, repair, pbr, zfight, render } = item;
  const faces = repair.meshes.reduce((total, mesh) => total + Number(mesh.cleanup?.after?.faces || 0), 0);
  const cleanupBefore = Number(repair.rasterCleanup?.acceptedPairsBefore || 0);
  const cleanupChanged = repair.rasterCleanup?.mutated === true;
  const sourceDegenerate = repair.meshes.reduce((total, mesh) => total + Number(mesh.packedUv?.sourceDegenerateFaces || 0), 0);
  const sourceSlivers = repair.meshes.reduce((total, mesh) => total + Number(mesh.packedUv?.sourceSliverFaces || 0), 0);
  const coverage = pbr.fullPbrCoverage;
  const emissiveMaterials = pbr.materials.filter((material) => material.emissiveRequired).length;
  const rebound = pbr.artifactDisposition === 'CONTENT_EQUIVALENT_REBOUND';
  const pbrDispositionLabel = rebound ? 'PBR byte-equivalent rebound' : 'PBR rebuilt';
  const search = `${catalog.key} ${catalog.id} ${catalog.family} ${catalog.category} ${repair.status} PBR_TEXTURED ${pbr.artifactDisposition} ${pbrDispositionLabel}`.toLowerCase();
  return `<article class="model-card" data-family="${esc(catalog.family)}" data-status="${esc(repair.status)}" data-search="${esc(search)}">
    <div class="pair">
      <a class="shot before" href="${href(render.beforeFile)}" aria-label="Open canonical before render for ${esc(catalog.id)}"><span>CANONICAL · BEFORE</span><img loading="lazy" src="${href(render.beforeFile)}" alt="${esc(catalog.id)} canonical source render"></a>
      <a class="shot after" href="${href(render.afterFile)}" aria-label="Open PBR after render for ${esc(catalog.id)}"><span>DERIVED PBR · AFTER</span><img loading="lazy" src="${href(render.afterFile)}" alt="${esc(catalog.id)} full PBR render"></a>
    </div>
    <div class="card-body">
      <div class="chips"><span class="chip ok">${esc(statusLabel(repair.status))}</span><span class="chip">${esc(catalog.family)}</span><span class="chip ${rebound ? 'warn' : ''}">${esc(pbrDispositionLabel)}</span></div>
      <h3>${esc(catalog.id)}</h3><p class="category">${esc(catalog.category)}</p>
      <div class="proof-grid">
        <div><small>Same-winding raster risk</small><strong>${formatNumber(cleanupBefore, 0)} → 0 pairs</strong><em>${cleanupChanged ? 'derived topology cleaned' : 'no cleanup needed'} · ${formatNumber(faces, 0)} faces</em></div>
        <div><small>UV overlap</small><strong>0 faces</strong><em>UV_GEN per render mesh</em></div>
        <div><small>Visible cubic stretch</small><strong>${formatNumber(repair.tiledUvMetrics.maxStretchRatio, 4)}× max</strong><em>${formatNumber(repair.tiledUvMetrics.maxAreaScaleRelativeError * 100, 4)}% scale error</em></div>
        <div><small>Full PBR binding</small><strong>${coverage.totalBound}/${coverage.renderPrimitives} primitives</strong><em>base · normal · AO/rough/metal${emissiveMaterials ? ` · ${emissiveMaterials} emissive` : ''}</em></div>
      </div>
      <details><summary>Hash-bound audit details</summary>
        <dl><div><dt>Repair state</dt><dd>${esc(repair.status)}</dd></div><div><dt>Derived cleanup</dt><dd>${cleanupChanged ? 'Applied' : 'Not required'}</dd></div><div><dt>Render meshes</dt><dd>${repair.renderMeshCount}</dd></div><div><dt>Locked source degenerate / sliver faces</dt><dd>${sourceDegenerate} / ${sourceSlivers}</dd></div><div><dt>PBR materials</dt><dd>${pbr.materials.length}</dd></div><div><dt>PBR artifact disposition</dt><dd>${esc(pbrDispositionLabel)}</dd></div><div><dt>Fresh PBR flicker audit</dt><dd>${zfight.rasterAudit.pairs} same-winding · ${zfight.rawGlbAudit.exactDuplicateTrianglesWithinRenderNode} raw duplicates</dd></div><div><dt>Rebind provenance</dt><dd>${rebound ? esc(pbr.contentEquivalentRebindSha256.slice(0, 16)) : 'Not applicable · fresh rebuild'}</dd></div></dl>
        <code>${esc(catalog.model.path)}</code>
        <p>Source <b>${esc(catalog.model.sha256.slice(0, 16))}</b> · derived repair <b>${esc(repair.outputSha256.slice(0, 16))}</b> · PBR output <b>${esc(pbr.outputSha256.slice(0, 16))}</b></p>
        <p>Canonical bytes and topology remain locked. The derived repair removes only shared-contract same-winding raster-risk coverage, preserves opposite winding, then produces UV_GEN → TEXCOORD_0 and UVMap_Tile → TEXCOORD_1 at 4 m/tile. Every render primitive is explicitly OPAQUE/single-sided and binds base color, normal, metallic-roughness and occlusion; emissive is bound wherever required. ${rebound ? 'This output was retained only after byte-identical input/output proof plus fresh current imports and complete geometry, UV, map, and raster-state validation; its prior report is archived provenance, not current acceptance evidence.' : 'This output and its current report were rebuilt by the current PBR pipeline.'}</p>
      </details>
    </div>
  </article>`;
}

function exclusionCard(item) {
  const reason = PIPELINE_EXCLUSIONS.get(item.key);
  const label = reason === 'CATALOG_METADATA_BLOCKED'
    ? 'Metadata-blocked'
    : reason === 'USER_WITHDRAWN_PERSONAL_REWORK'
      ? 'User-withdrawn'
      : 'Repair-locked';
  return `<article class="exception-card excluded"><div><span class="chip warn">${esc(label)}</span><h3>${esc(item.id)}</h3><p>${esc(item.family)}</p></div><p>Retained in canonical source and catalog. Intentionally received <b>no</b> cleanup, UV, PBR, or render-pair output.</p><code>${esc(item.model.path)}</code></article>`;
}

function discardCard(id) {
  return `<article class="exception-card discarded"><div><span class="chip danger">DISCARDED / DELETED</span><h3>${esc(id)}</h3><p>Spline · Props &amp; POI</p></div><p>User-rejected low-quality model. Absent from the active source export inventory and all Stage 10 processing.</p></article>`;
}

function quarantineCard(row, contract) {
  const item = contract.byKey.get(row.key);
  const reasons = (row.reasons || []).map((reason) => `<li>${esc(reason)}</li>`).join('');
  return `<article class="exception-card quarantined"><div><span class="chip danger">${esc(row.stage)} · QUARANTINED</span><h3>${esc(item?.id || row.key)}</h3><p>${esc(item?.family || row.key)}</p></div><p>No production card or after-render is shown for this model.</p><details><summary>Exact failure reasons</summary><ul>${reasons}</ul></details><code>${esc(row.report)}</code></article>`;
}

function buildHtml(cards, contract, repair, pbr, zfight, render, discard, quarantine) {
  const families = [...new Set(cards.map(({ catalog }) => catalog.family))].sort();
  const statuses = [...new Set(cards.map(({ repair: report }) => report.status))].sort();
  const familyOptions = families.map((family) => `<option value="${esc(family)}">${esc(family)}</option>`).join('');
  const statusOptions = statuses.map((status) => `<option value="${esc(status)}">${esc(statusLabel(status))}</option>`).join('');
  const totalPrimitives = [...pbr.items.values()].reduce((total, { report }) => total + report.fullPbrCoverage.renderPrimitives, 0);
  const totalMaterials = [...pbr.items.values()].reduce((total, { report }) => total + report.materials.length, 0);
  const dispositionCounts = countsBy([...pbr.items.values()].map(({ report }) => report), 'artifactDisposition');
  const rebuiltCount = dispositionCounts.REBUILT || 0;
  const reboundCount = dispositionCounts.CONTENT_EQUIVALENT_REBOUND || 0;
  const timestamp = new Date().toISOString();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MASSFRONT Stage 10 · Locked Model Repair Evidence</title><style>
:root{color-scheme:dark;--bg:#050c12;--panel:#0b1821;--panel2:#0f222d;--line:#204353;--cyan:#65e6f5;--green:#74e3a1;--amber:#ffc765;--red:#ff7187;--text:#edf8fb;--muted:#91aab5}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 14% 0,#123a50 0,transparent 38rem),linear-gradient(180deg,#06121a,var(--bg) 40rem);color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}a{color:var(--cyan)}nav{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:auto minmax(190px,1fr) minmax(150px,230px) minmax(150px,230px) auto;gap:9px;align-items:center;padding:11px max(14px,3vw);background:#050d13ef;border-bottom:1px solid var(--line);backdrop-filter:blur(18px)}nav b{letter-spacing:.13em;white-space:nowrap}input,select{min-width:0;padding:10px 11px;color:var(--text);background:#091720;border:1px solid var(--line);border-radius:7px}#visible{color:var(--cyan);font-variant-numeric:tabular-nums;white-space:nowrap}.hero,main{width:min(1640px,95vw);margin:auto}.hero{padding:46px 0 26px}.eyebrow{margin:0;color:var(--cyan);font-size:10px;letter-spacing:.2em}.hero h1{margin:5px 0;font-size:clamp(38px,6vw,82px);line-height:.91;letter-spacing:-.04em}.hero>p{max-width:980px;color:var(--muted);font-size:17px}.policy{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:24px 0}.policy div{padding:14px 16px;border:1px solid #2d6877;background:#0b2029;border-radius:8px}.policy b{display:block;color:var(--cyan);letter-spacing:.08em}.policy span{color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(8,1fr);gap:9px}.stat{padding:14px;background:linear-gradient(145deg,#102732,#09161e);border:1px solid var(--line);border-radius:8px}.stat strong{display:block;color:var(--cyan);font-size:28px;line-height:1.15}.stat span{color:var(--muted);font-size:12px}.scope-note{margin-top:16px;padding:12px 14px;border-left:3px solid var(--green);background:#0a1b20;color:#b9ccd3}.scope-note b{color:var(--green)}section{margin:44px 0 68px;scroll-margin-top:76px}section>header{display:flex;justify-content:space-between;gap:20px;align-items:end;padding-bottom:10px;border-bottom:1px solid var(--line);margin-bottom:14px}section h2{margin:3px 0 0;font-size:28px}section header>strong{font-size:33px;color:var(--cyan)}.section-copy{max-width:950px;color:var(--muted)}.model-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(500px,1fr));gap:12px}.model-card{overflow:hidden;background:var(--panel);border:1px solid #1c3d4c;border-top:3px solid var(--green);border-radius:9px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#20404c}.shot{position:relative;display:block;aspect-ratio:1/1;overflow:hidden;background:#03080b}.shot img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .2s ease}.shot:hover img{transform:scale(1.025)}.shot span{position:absolute;z-index:2;top:8px;left:8px;padding:4px 7px;border-radius:4px;background:#02070bd9;color:#b9ced7;font-size:9px;letter-spacing:.1em}.shot.after span{color:#041114;background:var(--cyan)}.card-body{padding:13px}.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{display:inline-block;padding:3px 6px;border:1px solid #316476;border-radius:4px;color:var(--cyan);font-size:9px;letter-spacing:.06em}.chip.ok{color:var(--green);border-color:#367854}.chip.warn{color:var(--amber);border-color:#805f25}.chip.danger{color:var(--red);border-color:#843648}.card-body h3,.exception-card h3{margin:9px 0 2px;overflow-wrap:anywhere}.category,.exception-card div>p{margin:0 0 10px;color:var(--muted)}.proof-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}.proof-grid div{padding:9px;background:#07141b}.proof-grid small,.proof-grid em{display:block;color:var(--muted);font-size:9px;font-style:normal}.proof-grid strong{display:block;margin:2px 0;color:var(--green);font-size:14px}details{margin-top:9px;color:var(--muted)}details summary{cursor:pointer;color:#bdd0d7}dl{display:grid;grid-template-columns:1fr 1fr;gap:5px}dl div{padding:7px;background:#07131a}dt{font-size:9px;text-transform:uppercase}dd{margin:2px 0 0;color:var(--text)}code{display:block;color:#9fc6d3;overflow-wrap:anywhere;font-size:10px}.exception-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}.exception-card{display:flex;flex-direction:column;justify-content:space-between;min-height:175px;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:8px}.exception-card>p{color:var(--muted)}.exception-card.excluded{border-top:3px solid var(--amber)}.exception-card.quarantined,.exception-card.discarded{border-top:3px solid var(--red);background:#180f15}.empty-filter{display:none;padding:28px;border:1px dashed var(--line);text-align:center;color:var(--muted)}.hidden{display:none!important}footer{padding:28px max(16px,3vw);border-top:1px solid var(--line);color:var(--muted)}footer b{color:var(--green)}@media(max-width:1050px){nav{grid-template-columns:1fr 1fr 1fr}nav b{grid-column:1/-1}.stats{grid-template-columns:repeat(3,1fr)}}@media(max-width:700px){nav{grid-template-columns:1fr 1fr}nav b{display:none}nav input{grid-column:1/-1}.hero{padding-top:32px}.policy{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.model-grid{grid-template-columns:1fr}.pair{grid-template-columns:1fr 1fr}.proof-grid{grid-template-columns:1fr}.shot span{top:5px;left:5px;font-size:8px}.exception-grid{grid-template-columns:1fr}}
</style></head><body><nav><b>MASSFRONT / STAGE 10</b><input id="search" type="search" placeholder="Search model, family, or status…"><select id="family"><option value="">All families</option>${familyOptions}</select><select id="status"><option value="">All accepted statuses</option>${statusOptions}</select><span id="visible">${cards.length} / ${cards.length}</span></nav>
<div class="hero"><p class="eyebrow">MODEL REPAIR · FINAL HASH-BOUND REVIEW</p><h1>LOCKED MODELS.<br>FINISHED MATERIALS.</h1><p>${cards.length} proof-green production models are shown with the real canonical-source render beside the real derived full-PBR render. Each pair shares one camera, frame, lights, culling policy, and resolution. The complete 320-report repair census is accounted separately through production and quarantine manifests.</p>
<div class="policy"><div><b>NO REGENERATION</b><span>No model builders were run for this pack.</span></div><div><b>NO CANONICAL OVERWRITE</b><span>Canonical GLB bytes remain hash-locked and untouched.</span></div><div><b>NO RUNTIME PROMOTION</b><span>All UV and PBR products remain review-only under tmp/.</span></div></div>
<div class="stats"><div class="stat"><strong>${cards.length}</strong><span>production cards</span></div><div class="stat"><strong>${quarantine.length}</strong><span>quarantined, not promoted</span></div><div class="stat"><strong>8</strong><span>retained exclusions</span></div><div class="stat"><strong>12</strong><span>discarded Props &amp; POI</span></div><div class="stat"><strong>${formatNumber(totalPrimitives, 0)}</strong><span>full-PBR primitives</span></div><div class="stat"><strong>${formatNumber(totalMaterials, 0)}</strong><span>PBR material bindings</span></div><div class="stat"><strong>${rebuiltCount}</strong><span>current PBR rebuilds</span></div><div class="stat"><strong>${reboundCount}</strong><span>verified byte-equivalent rebinds</span></div></div>
<div class="scope-note"><b>Stage 10 preparation evidence only.</b> Canonical GLB bytes and topology remain untouched. Derived outputs remove only accepted same-winding raster-risk coverage, preserve opposite winding, then add cubic UV channels and full PBR bindings with explicit OPAQUE/single-sided raster state. A retained PBR GLB appears as a rebind only when its repair input and output are byte-identical to archived provenance and current code freshly reimports and revalidates geometry, winding, normals, UVs, maps, and raster state; every mismatch falls through to rebuild. Locked source-degenerate/sliver triangles are reported separately and do not contaminate visible texture-stretch measurements.</div></div>
<main><section id="processed"><header><div><p class="eyebrow">CANONICAL BEFORE → DERIVED PBR AFTER</p><h2>Production model evidence</h2><p class="section-copy">Every card passed repair construction, both fresh post-export tiled-UV proofs, PBR, fresh-GLB flicker audit, and matched rendering. Quarantined models never receive a misleading after-render card.</p></div><strong>${cards.length}</strong></header><div id="empty" class="empty-filter">No models match this filter.</div><div class="model-grid">${cards.map(modelCard).join('')}</div></section>
<section id="quarantine"><header><div><p class="eyebrow">FAIL-CLOSED · NO PROMOTION</p><h2>Quarantine</h2><p class="section-copy">These models stopped at the first non-green production stage. Exact stage and reasons are preserved; no after render is presented. <a href="quarantine.json" download>Download quarantine manifest</a>.</p></div><strong>${quarantine.length}</strong></header><div class="exception-grid">${quarantine.map((row) => quarantineCard(row, contract)).join('')}</div></section>
<section id="excluded"><header><div><p class="eyebrow">RETAINED · NOT DELETED</p><h2>Pipeline exclusions</h2><p class="section-copy">These ten remain in canonical source and in the catalog. They were deliberately excluded from this processing run and have no derived output.</p></div><strong>10</strong></header><div class="exception-grid">${contract.excluded.map(exclusionCard).join('')}</div></section>
<section id="discarded"><header><div><p class="eyebrow">USER-APPROVED DELETION SET</p><h2>Discarded Spline · Props &amp; POI</h2><p class="section-copy">Only these 12 low-quality Props &amp; POI models were removed from the active source export inventory. They are separate from the ten retained pipeline exclusions above.</p></div><strong>12</strong></header><div class="exception-grid">${discard.ids.map(discardCard).join('')}</div></section></main>
<footer><b>${quarantine.length ? 'PASS WITH QUARANTINE' : 'PASS'}:</b> ${cards.length} production cards · ${quarantine.length} quarantined · ${pbr.items.size} PBR reports (${rebuiltCount} rebuilt, ${reboundCount} byte-equivalent rebound) · ${zfight.items.size} fresh-GLB duplicate/flicker audits · ${render.items.size} matched render pairs · generated ${esc(timestamp)} · review artifacts are runtime inactive.</footer><script>
const search=document.querySelector('#search'),family=document.querySelector('#family'),status=document.querySelector('#status'),visible=document.querySelector('#visible'),empty=document.querySelector('#empty'),total=${cards.length};function apply(){const q=search.value.trim().toLowerCase(),f=family.value,s=status.value;let count=0;document.querySelectorAll('.model-card').forEach(card=>{const hide=(q&&!card.dataset.search.includes(q))||(f&&card.dataset.family!==f)||(s&&card.dataset.status!==s);card.classList.toggle('hidden',hide);if(!hide)count++;});visible.textContent=count+' / '+total;empty.style.display=count?'none':'block';}search.addEventListener('input',apply);family.addEventListener('change',apply);status.addEventListener('change',apply);
</script></body></html>`;
}

function buildManifest(cards, contract, repair, pbr, zfight, render, discard, html) {
  const items = cards.map(({ catalog, repair: repairReport, pbr: pbrReport, zfight: zfightReport, render: renderReport }) => ({
    key: catalog.key,
    id: catalog.id,
    family: catalog.family,
    kind: catalog.kind,
    repairStatus: repairReport.status,
    canonicalSource: { path: catalog.model.path, sha256: catalog.model.sha256, bytes: catalog.model.bytes },
    repair: {
      report: posix(repair.items.get(catalog.key).reportFile),
      reportSha256: sha256File(repair.items.get(catalog.key).reportFile),
      output: repairReport.output,
      outputSha256: repairReport.outputSha256,
      canonicalTopologyUntouched: repairReport.canonicalTopologyUntouched,
      derivedTopologyChanged: repairReport.derivedTopologyChanged,
      topologyPreserved: repairReport.topologyPreserved,
      acceptedRasterPairsBefore: repairReport.rasterCleanup.acceptedPairsBefore,
      acceptedRasterPairsAfter: repairReport.rasterCleanup.acceptedPairsAfter,
      cleanupStabilized: repairReport.rasterCleanup.stabilized,
      rasterCleanupSha256: pbrReport.repairRasterCleanupSha256,
      lineageProofSha256: pbrReport.repairLineageProofSha256,
      finalArtifactAcceptanceDependsOnLineage: repairReport.rasterCleanup.lineageProof.finalArtifactAcceptanceDependsOnLineage,
      rasterCleanupScriptSha256: repairReport.rasterCleanupScriptSha256,
      overlapFaces: repairReport.allRenderMeshOverlapFaces,
      maxStretchRatio: repairReport.tiledUvMetrics.maxStretchRatio,
      maxAreaScaleRelativeError: repairReport.tiledUvMetrics.maxAreaScaleRelativeError,
      sourceDegenerateFaces: repairReport.meshes.reduce((total, mesh) => total + Number(mesh.packedUv?.sourceDegenerateFaces || 0), 0),
      sourceSliverFaces: repairReport.meshes.reduce((total, mesh) => total + Number(mesh.packedUv?.sourceSliverFaces || 0), 0),
    },
    pbr: {
      report: posix(pbr.items.get(catalog.key).reportFile),
      reportSha256: sha256File(pbr.items.get(catalog.key).reportFile),
      output: pbrReport.output,
      outputSha256: pbrReport.outputSha256,
      materials: pbrReport.materials.length,
      renderPrimitives: pbrReport.fullPbrCoverage.renderPrimitives,
      fullPbrCoveragePassed: pbrReport.fullPbrCoverage.passed,
      rasterPolicy: PBR_RASTER_POLICY,
      artifactDisposition: pbrReport.artifactDisposition,
      contentEquivalentRebindSha256: pbrReport.contentEquivalentRebindSha256,
      contentEquivalentRebind: pbrReport.contentEquivalentRebind,
      contractSha256: pbrReport.contractSha256,
    },
    zFightingAudit: {
      report: posix(zfight.items.get(catalog.key).reportFile),
      reportSha256: sha256File(zfight.items.get(catalog.key).reportFile),
      pbrReportSha256: zfightReport.pbrReportSha256,
      pbrOutputSha256: zfightReport.pbrOutputSha256,
      sameWindingRasterPairs: zfightReport.rasterAudit.pairs,
      rawExactDuplicateTriangles: zfightReport.rawGlbAudit.exactDuplicateTrianglesWithinRenderNode,
      passed: zfightReport.passed,
    },
    renderPair: {
      report: posix(render.items.get(catalog.key).reportFile),
      reportSha256: sha256File(render.items.get(catalog.key).reportFile),
      before: { path: renderReport.report.before.path, sha256: renderReport.report.before.sha256, bytes: renderReport.report.before.bytes },
      after: { path: renderReport.report.after.path, sha256: renderReport.report.after.sha256, bytes: renderReport.report.after.bytes },
      geometryInvariantPassed: renderReport.report.geometryProof.passed,
      cleanupAwareGeometryContract: renderReport.report.geometryProof.contract,
      artifactIndependentAcceptance: renderReport.report.geometryProof.artifactIndependentAcceptance,
      renderContractSha256: renderReport.report.binding.renderContractSha256,
    },
  }));
  const manifest = {
    schema: 'MassfrontStage10RepairReviewGalleryManifestV2',
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    lifecycle: 'REVIEW_ONLY_RUNTIME_INACTIVE',
    policies: {
      modelRegenerationPerformed: false,
      canonicalGlbOverwritePerformed: false,
      canonicalTopologyUntouched: true,
      derivedSameWindingRasterCleanupOnly: true,
      oppositeWindingPreserved: true,
      pbrAlphaMode: 'OPAQUE',
      pbrDoubleSided: false,
      pbrContentEquivalentRebindSchema: CONTENT_EQUIVALENT_REBIND_SCHEMA,
      pbrContentEquivalentRebindMethod: CONTENT_EQUIVALENT_REBIND_METHOD,
      previousPbrReportsAcceptedAsCurrentEvidence: false,
      finalPbrDuplicateFlickerAuditRequired: true,
      runtimePromotionPerformed: false,
      derivedOutputsOnly: true,
    },
    counts: {
      catalogCandidates: EXPECTED.candidates,
      processedCards: items.length,
      pipelineExcludedRetained: contract.excluded.length,
      discardedDeletedPropsPoi: discard.ids.length,
      repairReports: repair.items.size,
      pbrReports: pbr.items.size,
      pbrArtifactDispositions: pbr.summary.artifactDispositionCounts,
      pbrArtifactsRebuilt: pbr.summary.artifactDispositionCounts.REBUILT || 0,
      pbrArtifactsContentEquivalentRebound: pbr.summary.artifactDispositionCounts.CONTENT_EQUIVALENT_REBOUND || 0,
      zFightingAuditReports: zfight.items.size,
      matchedRenderPairs: render.items.size,
    },
    inputs: {
      catalog: fileRecord(CATALOG_FILE),
      discardRecord: fileRecord(DISCARD_FILE),
      repairSummary: fileRecord(REPAIR_SUMMARY_FILE),
      pbrSummary: fileRecord(PBR_SUMMARY_FILE),
      zFightingAuditSummary: fileRecord(ZFIGHT_SUMMARY_FILE),
      renderSummary: fileRecord(RENDER_SUMMARY_FILE),
      repairPipeline: fileRecord(REPAIR_SCRIPT),
      rasterCleanupPipeline: fileRecord(RASTER_CLEANUP_SCRIPT),
      pbrPipeline: fileRecord(PBR_SCRIPT),
      zFightingAuditPipeline: fileRecord(ZFIGHT_SCRIPT),
      renderPipeline: fileRecord(RENDER_SCRIPT),
      unifiedVerifier: fileRecord(UNIFIED_VERIFIER),
    },
    unifiedVerification: unifiedVerifierEvidence,
    gallery: {
      path: posix(INDEX_FILE),
      sha256: crypto.createHash('sha256').update(html).digest('hex'),
      bytes: Buffer.byteLength(html),
    },
    items,
    pipelineExclusions: expectedExclusions(contract, true).map((item) => ({ ...item, deleted: false, processingOutputCount: 0 })),
    discardedSplinePropsPoi: discard.ids.map((id) => ({ id, deletedFromActiveSourceInventory: true, processed: false })),
  };
  requireThat(manifest.counts.processedCards === EXPECTED.included, 'manifest would not contain exactly 320 processed cards');
  requireThat(manifest.counts.pbrArtifactsRebuilt + manifest.counts.pbrArtifactsContentEquivalentRebound === EXPECTED.included, 'manifest PBR artifact dispositions do not total exactly 320');
  requireThat(manifest.counts.zFightingAuditReports === EXPECTED.included, 'manifest would not bind exactly 320 fresh-PBR flicker audits');
  requireThat(manifest.pipelineExclusions.length === EXPECTED.excluded, 'manifest would not contain exactly ten retained exclusions');
  requireThat(manifest.discardedSplinePropsPoi.length === EXPECTED.discarded, 'manifest would not contain exactly 12 discarded Props & POI');
  return manifest;
}

function main() {
  unifiedVerifierEvidence = runUnifiedVerifier();
  const contract = buildCatalogContract();
  const discard = verifyDiscardContract(contract);
  const repair = verifyRepair(contract);
  const pbr = verifyPbr(contract, repair);
  const zfight = verifyZfighting(contract, repair, pbr);
  const render = verifyRender(contract, repair, pbr);
  const cards = contract.included.map((catalog) => ({
    catalog,
    repair: repair.items.get(catalog.key).report,
    pbr: pbr.items.get(catalog.key).report,
    zfight: zfight.items.get(catalog.key).report,
    render: render.items.get(catalog.key),
  }));
  requireThat(cards.length === EXPECTED.included, 'card assembly is not exactly 320 models');
  const html = buildHtml(cards, contract, repair, pbr, zfight, render, discard);
  const manifest = buildManifest(cards, contract, repair, pbr, zfight, render, discard, html);
  fs.mkdirSync(GALLERY_ROOT, { recursive: true });
  fs.writeFileSync(INDEX_FILE, html);
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    status: 'PASS',
    output: posix(INDEX_FILE),
    manifest: posix(MANIFEST_FILE),
    processedCards: cards.length,
    pipelineExcludedRetained: contract.excluded.length,
    discardedDeletedPropsPoi: discard.ids.length,
  }, null, 2));
}

main();
