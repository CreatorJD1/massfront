#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, '..', '..');
const VALIDATOR = resolve(TOOL_DIR, 'validate-content-library.mjs');
const REGISTRY = resolve(REPO_ROOT, 'source-media', 'content-library', 'assets.v1.json');
const CATALOG = resolve(REPO_ROOT, 'source-media', 'content-library', 'concept-catalog.v1.json');
const TEXTURE_CATALOG = resolve(REPO_ROOT, 'source-media', 'content-library', 'texture-theme-catalog.v1.json');
const baseline = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const catalogBaseline = JSON.parse(readFileSync(CATALOG, 'utf8'));
const textureBaseline = JSON.parse(readFileSync(TEXTURE_CATALOG, 'utf8'));
const tempRoot = mkdtempSync(join(tmpdir(), 'massfront-content-library-'));
let failures = 0;

function runFixture(name, mutate, expectedExit, expectedCode = '') {
  const fixture = structuredClone(baseline);
  mutate(fixture);
  const fixturePath = join(tempRoot, `${name}.json`);
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [VALIDATOR, fixturePath], { encoding: 'utf8' });
  const actualExit = result.status ?? 1;
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  const passed = actualExit === expectedExit && (!expectedCode || combinedOutput.includes(expectedCode));
  console.log(`SELFTEST ${passed ? 'PASS' : 'FAIL'} ${name} exit=${actualExit} expected=${expectedExit}`);
  if (!passed) {
    failures += 1;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

function runCatalogFixture(name, mutate, expectedExit, expectedCode = '') {
  const fixture = structuredClone(catalogBaseline);
  mutate(fixture);
  const fixturePath = join(tempRoot, `${name}.catalog.json`);
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [VALIDATOR, REGISTRY, '--catalog', fixturePath], { encoding: 'utf8' });
  const actualExit = result.status ?? 1;
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  const passed = actualExit === expectedExit && (!expectedCode || combinedOutput.includes(expectedCode));
  console.log(`SELFTEST ${passed ? 'PASS' : 'FAIL'} ${name} exit=${actualExit} expected=${expectedExit}`);
  if (!passed) {
    failures += 1;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

function runTextureFixture(name, mutate, expectedExit, expectedCode = '') {
  const fixture = structuredClone(textureBaseline);
  mutate(fixture);
  const fixturePath = join(tempRoot, `${name}.texture-catalog.json`);
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [VALIDATOR, REGISTRY, '--catalog', CATALOG, '--texture-catalog', fixturePath], { encoding: 'utf8' });
  const actualExit = result.status ?? 1;
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
  const passed = actualExit === expectedExit && (!expectedCode || combinedOutput.includes(expectedCode));
  console.log(`SELFTEST ${passed ? 'PASS' : 'FAIL'} ${name} exit=${actualExit} expected=${expectedExit}`);
  if (!passed) {
    failures += 1;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}

try {
  runFixture('clean-registry', () => {}, 0);
  runFixture('absolute-source-path', (fixture) => {
    fixture.assets[0].source.path = 'C:\\Users\\Someone\\source.glb';
  }, 1);
  runFixture('absolute-provenance-path', (fixture) => {
    fixture.assets[0].source.provenance.notes = '/Users/someone/private/source.glb';
  }, 1);
  runFixture('duplicate-asset-id', (fixture) => {
    fixture.assets.push(structuredClone(fixture.assets[0]));
  }, 1);
  runFixture('runtime-without-approval', (fixture) => {
    fixture.assets[0].lifecycle.stage = 'RUNTIME';
    fixture.assets[0].lifecycle.runtimeReady = true;
    fixture.assets[0].runtime.runtimePath = 'modules/space_exploration/assets/models/characters/uga-anime-human-master-v1.glb';
  }, 1);
  runFixture('verified-without-digest', (fixture) => {
    fixture.assets[0].source.provenance.integrity.status = 'verified';
    fixture.assets[0].source.provenance.integrity.digest = null;
  }, 1);
  runFixture('inverted-lods', (fixture) => {
    fixture.assets[0].runtime.lodTargets.LOD1.max = 26000;
  }, 1);
  runFixture('animation-without-rig', (fixture) => {
    fixture.assets[0].capabilities.animationClips = ['idle'];
  }, 1);
  runFixture('runtime-model-missing-concept', (fixture) => {
    const asset = fixture.assets[0];
    asset.lifecycle.stage = 'RUNTIME';
    asset.lifecycle.runtimeReady = true;
    asset.approval.status = 'APPROVED';
    asset.approval.gates.forEach((gate) => { gate.status = 'verified'; });
    asset.capabilities.rigged = true;
    asset.capabilities.deformBones = 60;
    asset.runtime.runtimePath = 'modules/space_exploration/assets/models/characters/uga-anime-human-master-v1.glb';
    delete asset.conceptEvidence;
  }, 1, 'RUNTIME_CONCEPT_REQUIRED');
  runFixture('visible-unanimated-face', (fixture) => {
    fixture.assets[0].facePolicy.presentation = 'visible-face';
  }, 1, 'VISIBLE_FACE_ANIMATION_REQUIRED');
  runFixture('reference-only-cannot-promote', (fixture) => {
    const asset = fixture.assets[0];
    asset.lifecycle.stage = 'RUNTIME';
    asset.lifecycle.runtimeReady = true;
    asset.approval.status = 'APPROVED';
    asset.approval.gates.forEach((gate) => { gate.status = 'verified'; });
    asset.capabilities.rigged = true;
    asset.capabilities.deformBones = 60;
    asset.runtime.runtimePath = 'modules/space_exploration/assets/models/characters/uga-anime-human-master-v1.glb';
  }, 1, 'REFERENCE_ONLY_RUNTIME_FORBIDDEN');
  runCatalogFixture('clean-concept-catalog', () => {}, 0);
  runCatalogFixture('approved-reference-missing-production-axes', (fixture) => {
    delete fixture.concepts[0].productionAxes;
  }, 1, 'PRODUCTION_AXES_REQUIRED');
  runCatalogFixture('approved-reference-missing-camera', (fixture) => {
    fixture.concepts[0].camera = [];
  }, 1, 'CONCEPT_CAMERA_INVALID');
  runCatalogFixture('coverage-matrix-cell-missing', (fixture) => {
    fixture.productionCoverage.cells.pop();
  }, 1, 'PRODUCTION_MATRIX_INCOMPLETE');
  runCatalogFixture('coverage-gap-without-brief', (fixture) => {
    const brief = fixture.plannedBriefs.find((entry) => entry.id === 'brief_nova_ashland_vespera_contact_kit');
    brief.productionAxes.modelIntention = brief.productionAxes.modelIntention.filter((entry) => entry !== 'vehicle-creature');
  }, 1, 'PRODUCTION_COVERAGE_GAP_UNBRIEFED');
  runCatalogFixture('outside-matrix-approved-reference-missing-canonical-axis', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.coverageScope === 'outside-production-matrix');
    concept.classification.biomeOrBiodome = [];
  }, 1, 'OUTSIDE_MATRIX_CLASSIFICATION_REQUIRED');
  runCatalogFixture('brood-cannot-be-resident-playable', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.id === 'concept_brood_vespera_ashland_verdant_model_sheet_v1');
    concept.forceRelationshipRole = ['hostile-ai', 'resident-playable'];
  }, 1, 'FORCE_RELATIONSHIP_ROLE_MISMATCH');
  runCatalogFixture('brood-cannot-be-humanoid-personnel', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.id === 'concept_brood_vespera_ashland_verdant_model_sheet_v1');
    concept.classification.intention.push('humanoid-personnel');
  }, 1, 'BROOD_FORBIDDEN_INTENTION');
  runCatalogFixture('brood-cannot-target-strike-team-staging', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.id === 'concept_brood_vespera_ashland_verdant_model_sheet_v1');
    concept.productionAxes.biomeOrBiodome.push('ship-expedition-staging');
  }, 1, 'BROOD_SHIP_ROSTER_FORBIDDEN');
  runCatalogFixture('brood-cannot-claim-character-production-axis', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.id === 'concept_brood_galactic_enemy_ecology_model_sheet_v1');
    concept.productionAxes.modelIntention.push('character');
  }, 1, 'BROOD_CHARACTER_AXIS_FORBIDDEN');
  runCatalogFixture('rejected-concept-cannot-declare-two-replacements', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.status === 'REJECTED');
    concept.canonicalDisposition.replacementBriefId = fixture.plannedBriefs[0].id;
    concept.canonicalDisposition.replacementConceptId = fixture.concepts.find((entry) => entry.status === 'APPROVED').id;
  }, 1, 'REJECTED_CANONICAL_DISPOSITION_REQUIRED');
  runCatalogFixture('rejected-concept-replacement-must-be-approved', (fixture) => {
    const concept = fixture.concepts.find((entry) => entry.status === 'REJECTED');
    concept.canonicalDisposition.replacementConceptId = 'concept_missing_replacement';
    delete concept.canonicalDisposition.replacementBriefId;
  }, 1, 'REPLACEMENT_CONCEPT_NOT_APPROVED');
  runTextureFixture('clean-texture-theme-catalog', () => {}, 0);
  runTextureFixture('texture-pack-must-be-exact-2k', (fixture) => {
    fixture.packs[0].resolution[0] = 1024;
  }, 1, 'TEXTURE_RESOLUTION_NOT_2K');
  runTextureFixture('texture-pack-requires-paired-maps', (fixture) => {
    delete fixture.packs[0].pairedMaps.normalRoughness;
  }, 1, 'TEXTURE_PAIR_REQUIRED');
  runTextureFixture('texture-pack-cannot-approve-without-seam-proof', (fixture) => {
    fixture.packs[0].status = 'APPROVED';
  }, 1, 'TEXTURE_APPROVED_SEAM_EVIDENCE_REQUIRED');
  runTextureFixture('texture-pack-cannot-use-reference-pixels', (fixture) => {
    fixture.packs[0].conceptReference.pixelsUsedAsTexture = true;
  }, 1, 'TEXTURE_REFERENCE_PIXELS_FORBIDDEN');
  runTextureFixture('texture-pack-schema-required-title', (fixture) => {
    delete fixture.packs[0].title;
  }, 1, 'TEXTURE_SCHEMA_SHAPE_INVALID');
  runTextureFixture('texture-pack-schema-rejects-unexpected-property', (fixture) => {
    fixture.packs[0].unexpected = true;
  }, 1, 'TEXTURE_SCHEMA_SHAPE_INVALID');
  runTextureFixture('texture-target-axes-cannot-drift', (fixture) => {
    fixture.targets[0].themeIds = [];
  }, 1, 'TEXTURE_TARGET_AXES_MISMATCH');
  runTextureFixture('texture-pack-consumer-must-match-domain', (fixture) => {
    fixture.packs[0].consumerIds = ['consumer_main_city_materials'];
  }, 1, 'TEXTURE_CONSUMER_DOMAIN_MISMATCH');
  runTextureFixture('texture-role-scale-profile-is-canonical', (fixture) => {
    fixture.packs[0].materialRoles[0].metersPerTile = 1;
    fixture.packs[0].materialRoles[0].pixelsPerMeter = 2048;
  }, 1, 'TEXTURE_TEXEL_SCALE_PROFILE_MISMATCH');
  runTextureFixture('texture-approval-cannot-skip-file-verification', (fixture) => {
    const pack = fixture.packs[0];
    pack.status = 'APPROVED';
    pack.seamProof.status = 'VERIFIED';
    pack.seamProof.evidencePath = 'tmp/texture-qa/seam-proof.png';
    pack.mobileCapture.status = 'VERIFIED';
    pack.mobileCapture.evidencePaths = ['tmp/texture-qa/phone-portrait.png', 'tmp/texture-qa/phone-landscape.png'];
    pack.approvedEvidence = pack.materialRoles.map((role, index) => ({
      role: role.role,
      albedo: { path: `tmp/texture-qa/${index}-albedo.ktx2`, integrity: { algorithm: 'sha256', status: 'verified', digest: '0'.repeat(64) } },
      normalRoughness: { path: `tmp/texture-qa/${index}-normal-roughness.ktx2`, integrity: { algorithm: 'sha256', status: 'verified', digest: '1'.repeat(64) } }
    }));
  }, 1, 'TEXTURE_APPROVAL_REQUIRES_FILE_CHECK');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`CONTENT_LIBRARY_SELFTEST FAIL failures=${failures}`);
  process.exitCode = 1;
} else {
  console.log('CONTENT_LIBRARY_SELFTEST PASS fixtures=34');
}
