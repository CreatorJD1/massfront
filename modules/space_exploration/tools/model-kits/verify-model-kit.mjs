#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_VIEWS,
  artifactSetDigest,
  fileRecord,
  findRepositoryRoot,
  glbInfo,
  hashFile,
  loadManifest,
  pngInfo,
  readJson,
  repositoryIdentity,
  resolveInside,
  validateSceneDigest,
  writeJsonAtomic
} from './model-kit-core.mjs';

const CANONICAL_CATALOG = 'source-media/content-library/model-pack-catalog.v1.json';

function nowUtc() {
  return new Date().toISOString();
}

function evidenceValuePresent(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function normalizedRecords(records) {
  return [...records].map((record) => ({
    path: String(record.path).replaceAll('\\', '/'),
    bytes: Number(record.bytes),
    sha256: String(record.sha256)
  })).sort((a, b) => a.path.localeCompare(b.path));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function alphaImages(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (value.kind === 'IMAGE_ALPHA' && value.image) output.push(value.image);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') alphaImages(child, output);
  }
  return output;
}

export function verifyModelKit(manifestPath, options = {}) {
  const findings = [];
  let loaded;
  let reportPath = null;
  let repoRoot = null;
  let identity = null;

  const add = (severity, code, path, message, details = undefined) => {
    findings.push({ severity, code, path, message, ...(details === undefined ? {} : { details }) });
  };
  const fail = (code, path, message, details) => add('ERROR', code, path, message, details);
  const warn = (code, path, message, details) => add('WARNING', code, path, message, details);

  try {
    loaded = loadManifest(manifestPath);
    reportPath = resolveInside(loaded.kitRoot, loaded.manifest.evidence.verificationReport, 'verification report');
    repoRoot = findRepositoryRoot(loaded.manifestPath);
    identity = repositoryIdentity(repoRoot, [loaded.kitRoot]);
  } catch (error) {
    for (const issue of error.issues || []) fail(issue.code, issue.path, issue.message);
    if (!error.issues) fail('MANIFEST_LOAD', '$', error.message);
    return {
      ok: false,
      exitCode: 1,
      reportPath,
      report: {
        schemaVersion: 1,
        kind: 'MassfrontModelKitVerificationReportV1',
        status: 'FAIL',
        verifiedAtUtc: nowUtc(),
        manifestPath: resolve(manifestPath),
        findings
      }
    };
  }

  const { manifest, kitRoot } = loaded;
  const requireFile = (relativePath, label) => {
    let absolute;
    try {
      absolute = resolveInside(kitRoot, relativePath, label);
    } catch (error) {
      fail('PATH_INVALID', label, error.message);
      return null;
    }
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      fail('FILE_MISSING', relativePath, `${label} is missing`);
      return null;
    }
    return absolute;
  };
  const checkPinnedHash = (absolute, expected, path) => {
    if (!absolute) return null;
    const actual = hashFile(absolute);
    if (expected === null) warn('HASH_UNPINNED', path, 'expected hash is null; source-lock still protects the built source', { actual });
    else if (expected !== actual) fail('HASH_MISMATCH', path, 'file differs from pinned SHA-256', { expected, actual });
    return actual;
  };

  const sourcePath = requireFile(manifest.source.glb, 'source GLB');
  const conceptPath = requireFile(manifest.concept.image, 'concept image');
  const sceneDigestPath = requireFile(manifest.source.sceneDigest, 'Spline scene digest');
  const sourceHash = checkPinnedHash(sourcePath, manifest.source.expectedSha256, 'source.expectedSha256');
  const conceptHash = checkPinnedHash(conceptPath, manifest.concept.expectedSha256, 'concept.expectedSha256');
  const sceneDigestHash = checkPinnedHash(sceneDigestPath, manifest.source.expectedSceneDigestSha256, 'source.expectedSceneDigestSha256');

  let sceneDigest = null;
  if (sceneDigestPath) {
    try {
      sceneDigest = readJson(sceneDigestPath);
      const result = validateSceneDigest(sceneDigest, manifest);
      for (const issue of result.errors) fail(issue.code, `source.sceneDigest.${issue.path}`, issue.message);
      for (const field of ['getScene', 'getObjects', 'analyzeScene']) {
        if (!evidenceValuePresent(sceneDigest[field])) fail('SCENE_EVIDENCE_EMPTY', `source.sceneDigest.${field}`, `${field} evidence may not be empty`);
      }
    } catch (error) {
      fail('SCENE_DIGEST_PARSE', manifest.source.sceneDigest, error.message);
    }
  }

  let sourceInfo = null;
  if (sourcePath) {
    try {
      sourceInfo = glbInfo(sourcePath);
      if (!sourceInfo.selfContained) fail('SOURCE_EXTERNAL_URI', manifest.source.glb, 'source GLB is not self-contained', sourceInfo.externalUris);
      if (!sourceInfo.meshes || !sourceInfo.triangles) fail('SOURCE_EMPTY', manifest.source.glb, 'source GLB has no triangle mesh');
      if (sourceInfo.nonTrianglePrimitives) fail('SOURCE_PRIMITIVE_MODE', manifest.source.glb, 'source contains non-triangle primitives', { count: sourceInfo.nonTrianglePrimitives });
      if (sourceInfo.missingPositions) fail('SOURCE_POSITION', manifest.source.glb, 'source contains primitives without POSITION');
      if (!sourceInfo.finiteBounds) fail('SOURCE_BOUNDS', manifest.source.glb, 'source bounds are not finite');
      if (sourceInfo.bytes > manifest.budgets.maxSourceBytes) fail('SOURCE_BYTE_BUDGET', manifest.source.glb, 'source exceeds byte budget', { actual: sourceInfo.bytes, limit: manifest.budgets.maxSourceBytes });
      if (sourceInfo.triangles > manifest.budgets.maxSourceTriangles) fail('SOURCE_TRIANGLE_BUDGET', manifest.source.glb, 'source exceeds triangle budget', { actual: sourceInfo.triangles, limit: manifest.budgets.maxSourceTriangles });
      if (sourceInfo.materials > manifest.budgets.maxMaterials) fail('SOURCE_MATERIAL_BUDGET', manifest.source.glb, 'source exceeds material budget', { actual: sourceInfo.materials, limit: manifest.budgets.maxMaterials });
      if (sourceInfo.textures > manifest.budgets.maxTextures) fail('SOURCE_TEXTURE_BUDGET', manifest.source.glb, 'source exceeds texture budget', { actual: sourceInfo.textures, limit: manifest.budgets.maxTextures });
      if (manifest.textures.requireEmbeddedSource && !sourceInfo.images.length) fail('SOURCE_TEXTURE_REQUIRED', manifest.source.glb, 'embedded source texture is required but GLB declares no image');
      for (const name of manifest.source.meshNodeNames) if (!sourceInfo.meshNodeNames.includes(name)) fail('SOURCE_MESH_NODE_MISSING', manifest.source.glb, `declared mesh node is missing from GLB: ${name}`, { available: sourceInfo.meshNodeNames });
    } catch (error) {
      fail('SOURCE_GLB_INVALID', manifest.source.glb, error.message);
    }
  }

  const sourceLockPath = requireFile(manifest.evidence.sourceLock, 'source lock');
  let sourceLock = null;
  if (sourceLockPath) {
    try {
      sourceLock = readJson(sourceLockPath);
      if (sourceLock.schemaVersion !== 1 || sourceLock.kind !== 'MassfrontModelKitSourceLockV1') fail('SOURCE_LOCK_SCHEMA', manifest.evidence.sourceLock, 'source lock type/version is invalid');
      if (sourceLock.kitId !== manifest.kitId) fail('SOURCE_LOCK_KIT', manifest.evidence.sourceLock, 'source lock kitId differs from manifest');
      for (const [label, expectedPath, expectedHash] of [
        ['source', manifest.source.glb, sourceHash],
        ['sceneDigest', manifest.source.sceneDigest, sceneDigestHash],
        ['concept', manifest.concept.image, conceptHash]
      ]) {
        if (sourceLock[label]?.path !== expectedPath || sourceLock[label]?.sha256 !== expectedHash) {
          fail('SOURCE_LOCK_MISMATCH', `${manifest.evidence.sourceLock}.${label}`, `${label} no longer matches the immutable source lock`, { expectedPath, expectedHash, actual: sourceLock[label] });
        }
      }
    } catch (error) {
      fail('SOURCE_LOCK_PARSE', manifest.evidence.sourceLock, error.message);
    }
  }

  const buildReportPath = requireFile(manifest.evidence.buildReport, 'Blender build report');
  let buildReport = null;
  const materialAlphaRecords = new Map();
  if (buildReportPath) {
    try {
      buildReport = readJson(buildReportPath);
      if (buildReport.schemaVersion !== 1 || buildReport.kind !== 'MassfrontModelKitBuildReportV1') fail('BUILD_REPORT_SCHEMA', manifest.evidence.buildReport, 'build report type/version is invalid');
      if (buildReport.status !== 'PASS') fail('BUILD_FAILED', manifest.evidence.buildReport, 'Blender build report is not PASS', buildReport.errors || []);
      if (buildReport.kitId !== manifest.kitId) fail('BUILD_KIT', manifest.evidence.buildReport, 'build report kitId differs from manifest');
      if (buildReport.source?.sha256 !== sourceHash) fail('BUILD_SOURCE_HASH', manifest.evidence.buildReport, 'build report used a different source hash');
      if (!sameJson([...(buildReport.source?.selectedMeshNodeNames || [])].sort(), [...manifest.source.meshNodeNames].sort())) fail('BUILD_MESH_SELECTION', manifest.evidence.buildReport, 'Blender build did not select exactly the declared mesh node names');
      const norm = buildReport.normalization || {};
      const tolerance = manifest.normalization.toleranceMeters;
      for (const [field, label] of [['centerXYErrorMeters', 'center'], ['groundErrorMeters', 'ground'], ['targetErrorMeters', 'target size']]) {
        if (!Number.isFinite(norm[field]) || norm[field] > tolerance) fail('NORMALIZATION_ERROR', `${manifest.evidence.buildReport}.normalization.${field}`, `${label} normalization exceeds tolerance`, { actual: norm[field], tolerance });
      }
      if (norm.after?.invalidVertices) fail('NORMALIZATION_INVALID_VERTEX', manifest.evidence.buildReport, 'normalized mesh contains invalid vertices');
      if (norm.after?.zeroAreaTriangles) fail('NORMALIZATION_DEGENERATE', manifest.evidence.buildReport, 'normalized mesh contains zero-area triangles', { count: norm.after.zeroAreaTriangles });
      const cleanup = buildReport.geometryCleanup;
      if (!cleanup || cleanup.policyVersion !== 1) {
        fail('GEOMETRY_CLEANUP_EVIDENCE_MISSING', `${manifest.evidence.buildReport}.geometryCleanup`, 'build report lacks versioned working-copy geometry cleanup evidence');
      } else {
        const before = cleanup.before || {};
        const removed = cleanup.removed || {};
        const after = cleanup.after || {};
        if (!Number.isFinite(cleanup.areaEpsilon) || cleanup.areaEpsilon <= 0 || cleanup.areaEpsilon > 1e-9) fail('GEOMETRY_CLEANUP_EPSILON', `${manifest.evidence.buildReport}.geometryCleanup.areaEpsilon`, 'degenerate-face area epsilon is invalid', { actual: cleanup.areaEpsilon });
        if (before.invalidVertices !== 0 || after.invalidVertices !== 0) fail('GEOMETRY_CLEANUP_NONFINITE', `${manifest.evidence.buildReport}.geometryCleanup`, 'working-copy cleanup may not accept non-finite vertices', { before: before.invalidVertices, after: after.invalidVertices });
        if (after.zeroAreaTriangles !== 0) fail('GEOMETRY_CLEANUP_UNRESOLVED', `${manifest.evidence.buildReport}.geometryCleanup.after`, 'working-copy cleanup left degenerate triangles', { count: after.zeroAreaTriangles });
        if (!Number.isInteger(removed.degenerateFaces) || removed.degenerateFaces < 0 || !Number.isInteger(removed.triangles) || removed.triangles < 0 || !Number.isInteger(removed.vertices) || removed.vertices < 0) fail('GEOMETRY_CLEANUP_COUNTS', `${manifest.evidence.buildReport}.geometryCleanup.removed`, 'geometry cleanup removal counts must be non-negative integers', removed);
        if (before.zeroAreaTriangles !== removed.degenerateFaces || before.triangles - after.triangles !== removed.triangles || removed.triangles !== removed.degenerateFaces || before.vertices - after.vertices !== removed.vertices) fail('GEOMETRY_CLEANUP_ACCOUNTING', `${manifest.evidence.buildReport}.geometryCleanup`, 'geometry cleanup before/removed/after counts do not reconcile', { before, removed, after });
        if (!sameJson(after, buildReport.source?.stats)) fail('GEOMETRY_CLEANUP_SOURCE_STATS', `${manifest.evidence.buildReport}.geometryCleanup.after`, 'source working-copy stats differ from cleanup output', { cleanupAfter: after, sourceStats: buildReport.source?.stats });
        const objectRecords = Array.isArray(cleanup.objects) ? cleanup.objects : [];
        if (objectRecords.length !== after.objects || objectRecords.reduce((sum, record) => sum + Number(record.removedDegenerateFaces || 0), 0) !== removed.degenerateFaces) fail('GEOMETRY_CLEANUP_OBJECTS', `${manifest.evidence.buildReport}.geometryCleanup.objects`, 'per-object cleanup evidence does not reconcile with the summary', objectRecords);
      }
      const alpha = buildReport.materialAlphaSanitization;
      if (!alpha || alpha.policyVersion !== 1 || !Array.isArray(alpha.materials)) {
        fail('MATERIAL_ALPHA_EVIDENCE_MISSING', `${manifest.evidence.buildReport}.materialAlphaSanitization`, 'build report lacks versioned material alpha evidence');
      } else {
        const threshold = Number(alpha.opaqueThreshold);
        if (!Number.isFinite(threshold) || threshold < 0.999 || threshold > 1) fail('MATERIAL_ALPHA_THRESHOLD', `${manifest.evidence.buildReport}.materialAlphaSanitization.opaqueThreshold`, 'opaque threshold must be a strict near-one value', { actual: alpha.opaqueThreshold });
        for (const [index, record] of alpha.materials.entries()) {
          const path = `${manifest.evidence.buildReport}.materialAlphaSanitization.materials[${index}]`;
          if (!record || typeof record.name !== 'string' || !record.name) {
            fail('MATERIAL_ALPHA_RECORD', path, 'material alpha record requires a name');
            continue;
          }
          if (materialAlphaRecords.has(record.name)) fail('MATERIAL_ALPHA_DUPLICATE', path, `duplicate material alpha record: ${record.name}`);
          materialAlphaRecords.set(record.name, record);
          if (!['FORCED_OPAQUE', 'PRESERVED_BLEND', 'UNCHANGED'].includes(record.decision)) fail('MATERIAL_ALPHA_DECISION', path, 'material alpha decision is invalid', { actual: record.decision });
          if (!['FULLY_OPAQUE', 'NON_OPAQUE', 'UNKNOWN'].includes(record.proof?.status)) fail('MATERIAL_ALPHA_PROOF', path, 'material alpha proof status is invalid', { actual: record.proof?.status });
          if (record.decision === 'FORCED_OPAQUE') {
            const sourceBlended = record.sourceRenderMethod === 'BLENDED' || record.sourceBlendMethod === 'BLEND';
            if (!sourceBlended || record.proof?.status !== 'FULLY_OPAQUE' || record.expectedOutputAlphaMode !== 'OPAQUE') {
              fail('MATERIAL_ALPHA_FORCE_UNPROVEN', path, 'forced opaque requires a blended source, fully opaque proof, and OPAQUE output contract', record);
            }
            if (!Number.isFinite(record.proof?.diffuseAlpha?.value) || record.proof.diffuseAlpha.value < threshold) fail('MATERIAL_ALPHA_DIFFUSE', path, 'forced opaque material has no fully opaque diffuse-alpha proof', record.proof?.diffuseAlpha);
            if (!record.proof?.surfaceInputs?.length || record.proof.surfaceInputs.some((entry) => entry.status !== 'FULLY_OPAQUE')) fail('MATERIAL_ALPHA_SURFACE', path, 'every contributing surface alpha input must prove fully opaque', record.proof?.surfaceInputs);
            for (const image of alphaImages(record.proof)) {
              if (!Number.isFinite(image.alphaMin) || !Number.isFinite(image.alphaMax) || image.alphaMin < threshold || image.alphaMax > 1 + 1e-6 || image.fullyOpaque !== true) {
                fail('MATERIAL_ALPHA_IMAGE', path, 'forced opaque material contains image evidence that is not fully opaque', image);
              }
            }
          } else if (record.decision === 'PRESERVED_BLEND') {
            if (record.expectedOutputAlphaMode !== 'BLEND' || record.proof?.status === 'FULLY_OPAQUE') fail('MATERIAL_ALPHA_PRESERVE_INVALID', path, 'preserved blend must have non-opaque/unknown evidence and retain BLEND', record);
          } else if (record.expectedOutputAlphaMode !== null) {
            fail('MATERIAL_ALPHA_UNCHANGED_INVALID', path, 'unchanged material must not claim a rewritten alpha mode', record);
          }
        }
        const expectedSummary = {
          total: alpha.materials.length,
          forcedOpaque: alpha.materials.filter((record) => record.decision === 'FORCED_OPAQUE').length,
          preservedBlend: alpha.materials.filter((record) => record.decision === 'PRESERVED_BLEND').length,
          unchanged: alpha.materials.filter((record) => record.decision === 'UNCHANGED').length
        };
        if (!sameJson(alpha.summary, expectedSummary)) fail('MATERIAL_ALPHA_SUMMARY', `${manifest.evidence.buildReport}.materialAlphaSanitization.summary`, 'material alpha summary differs from its records', { expected: expectedSummary, actual: alpha.summary });
      }
    } catch (error) {
      fail('BUILD_REPORT_PARSE', manifest.evidence.buildReport, error.message);
    }
  }

  const lodInfos = [];
  for (let index = 0; index < manifest.lods.length; index++) {
    const spec = manifest.lods[index];
    const absolute = requireFile(spec.output, `${spec.name} GLB`);
    if (!absolute) continue;
    try {
      const info = glbInfo(absolute);
      lodInfos.push({ spec, info });
      if (!info.selfContained) fail('LOD_EXTERNAL_URI', spec.output, `${spec.name} is not self-contained`, info.externalUris);
      if (!info.triangles) fail('LOD_EMPTY', spec.output, `${spec.name} has no triangles`);
      if (info.triangles > spec.maxTriangles) fail('LOD_TRIANGLE_BUDGET', spec.output, `${spec.name} exceeds its maximum`, { actual: info.triangles, limit: spec.maxTriangles });
      if (info.nonTrianglePrimitives || info.missingPositions || !info.finiteBounds) fail('LOD_STRUCTURE', spec.output, `${spec.name} has invalid primitive structure or bounds`, info);
      const reported = buildReport?.lods?.find((entry) => entry.name === spec.name);
      if (!reported || reported.path !== spec.output || reported.sha256 !== info.sha256 || reported.actual?.triangles !== info.triangles) {
        fail('LOD_REPORT_MISMATCH', spec.output, `${spec.name} differs from Blender build report`, { reported, actual: { sha256: info.sha256, triangles: info.triangles } });
      }
      if (reported?.actual?.invalidVertices || reported?.actual?.zeroAreaTriangles) fail('LOD_GEOMETRY_INVALID', spec.output, `${spec.name} contains invalid or degenerate geometry`, reported.actual);
      for (const material of info.materialAlphaModes) {
        const record = material.name ? materialAlphaRecords.get(material.name) : null;
        if (!record) {
          fail('LOD_ALPHA_EVIDENCE_MISSING', spec.output, `${spec.name} material lacks alpha-policy evidence`, material);
          continue;
        }
        if (record.expectedOutputAlphaMode && material.alphaMode !== record.expectedOutputAlphaMode) {
          fail('LOD_ALPHA_MODE_MISMATCH', spec.output, `${spec.name} material alpha mode differs from the sanitizer decision`, { material, decision: record.decision, expected: record.expectedOutputAlphaMode });
        }
        if (material.alphaMode === 'BLEND' && record.decision !== 'PRESERVED_BLEND') fail('LOD_UNJUSTIFIED_BLEND', spec.output, `${spec.name} retained BLEND without non-opaque/unknown alpha evidence`, { material, record });
      }
    } catch (error) {
      fail('LOD_GLB_INVALID', spec.output, error.message);
    }
  }
  if (lodInfos.length === 3) {
    for (let index = 1; index < lodInfos.length; index++) {
      const previous = lodInfos[index - 1];
      const current = lodInfos[index];
      if (current.info.sha256 === previous.info.sha256) fail('LOD_IDENTICAL', current.spec.output, `${current.spec.name} is byte-identical to ${previous.spec.name}`);
      if (current.info.triangles >= previous.info.triangles) fail('LOD_NOT_REDUCED', current.spec.output, `${current.spec.name} must have fewer triangles than ${previous.spec.name}`, { previous: previous.info.triangles, current: current.info.triangles });
      const maxRatio = index === 1 ? 0.82 : 0.68;
      if (current.info.triangles > Math.ceil(previous.info.triangles * maxRatio)) fail('LOD_REDUCTION_TOO_SMALL', current.spec.output, `${current.spec.name} reduction is too small to justify a separate draw asset`, { previous: previous.info.triangles, current: current.info.triangles, maxRatio });
    }
  }

  const collisionPath = requireFile(manifest.collision.output, 'collision proxy GLB');
  if (collisionPath) {
    try {
      const info = glbInfo(collisionPath);
      if (!info.selfContained || info.nonTrianglePrimitives || !info.finiteBounds || !info.triangles) fail('COLLISION_STRUCTURE', manifest.collision.output, 'collision GLB structure is invalid', info);
      if (info.triangles > manifest.collision.maxTriangles) fail('COLLISION_TRIANGLE_BUDGET', manifest.collision.output, 'collision proxy exceeds triangle budget', { actual: info.triangles, limit: manifest.collision.maxTriangles });
      const reported = buildReport?.collision;
      if (!reported || reported.path !== manifest.collision.output || reported.sha256 !== info.sha256 || reported.actual?.triangles !== info.triangles) fail('COLLISION_REPORT_MISMATCH', manifest.collision.output, 'collision proxy differs from Blender report');
    } catch (error) {
      fail('COLLISION_GLB_INVALID', manifest.collision.output, error.message);
    }
  }

  const textureRecords = Array.isArray(buildReport?.textures) ? buildReport.textures : [];
  if (manifest.textures.requireEmbeddedSource && !textureRecords.length) fail('TEXTURE_EXTRACTION_EMPTY', manifest.evidence.buildReport, 'no extracted textures were recorded');
  for (const texture of textureRecords) {
    const absolute = requireFile(texture.path, 'extracted texture');
    if (!absolute) continue;
    if (hashFile(absolute) !== texture.sha256 || statSync(absolute).size !== texture.bytes) fail('TEXTURE_HASH_MISMATCH', texture.path, 'extracted texture differs from Blender report');
    if (!Number.isInteger(texture.width) || !Number.isInteger(texture.height) || Math.max(texture.width, texture.height) > manifest.budgets.maxTextureDimension) {
      fail('TEXTURE_DIMENSION_BUDGET', texture.path, 'texture dimensions are missing or exceed the declared maximum', { width: texture.width, height: texture.height, limit: manifest.budgets.maxTextureDimension });
    }
    const textureAlpha = texture.alpha;
    if (!textureAlpha || !Number.isFinite(textureAlpha.alphaMin) || !Number.isFinite(textureAlpha.alphaMax) || textureAlpha.alphaMin < 0 || textureAlpha.alphaMax > 1 + 1e-6 || textureAlpha.alphaMin > textureAlpha.alphaMax) {
      fail('TEXTURE_ALPHA_EVIDENCE_MISSING', texture.path, 'extracted texture lacks valid alpha-range evidence', textureAlpha);
    } else {
      const expectedOpaque = textureAlpha.alphaMin >= Number(buildReport?.materialAlphaSanitization?.opaqueThreshold);
      if (textureAlpha.fullyOpaque !== expectedOpaque) fail('TEXTURE_ALPHA_EVIDENCE_MISMATCH', texture.path, 'texture fullyOpaque flag differs from its alpha range', { expected: expectedOpaque, actual: textureAlpha.fullyOpaque, alphaMin: textureAlpha.alphaMin });
    }
    if (manifest.textures.seamPolicy === 'require-tileable') {
      if (texture.seam?.status !== 'PASS') fail('TEXTURE_SEAM_FAIL', texture.path, 'texture claims tileability but border test did not pass', texture.seam);
      for (const axis of ['leftRight', 'topBottom']) {
        const metric = texture.seam?.metrics?.[axis];
        if (!metric || metric.mean > manifest.textures.maxBorderMeanDelta || metric.p95 > manifest.textures.maxBorderP95Delta) {
          fail('TEXTURE_SEAM_LIMIT', texture.path, `${axis} border exceeds tileability limit`, metric);
        }
      }
    } else if (texture.seam?.status !== 'NOT_APPLICABLE') {
      fail('TEXTURE_SEAM_CLAIM', texture.path, 'UV-atlas texture must explicitly say seam validation is not applicable');
    }
  }

  const thumbByView = new Map((buildReport?.thumbnails || []).map((record) => [record.view, record]));
  const expectedThumb = manifest.evidence.thumbnailSize;
  for (const view of REQUIRED_VIEWS) {
    const record = thumbByView.get(view);
    if (!record) {
      fail('THUMBNAIL_MISSING', manifest.evidence.buildReport, `build report lacks ${view} thumbnail`);
      continue;
    }
    const absolute = requireFile(record.path, `${view} thumbnail`);
    if (!absolute) continue;
    try {
      const info = pngInfo(absolute);
      if (info.width !== expectedThumb[0] || info.height !== expectedThumb[1]) fail('THUMBNAIL_DIMENSIONS', record.path, `${view} thumbnail dimensions differ from manifest`, { expected: expectedThumb, actual: [info.width, info.height] });
      if (record.sha256 !== info.sha256 || record.bytes !== info.bytes) fail('THUMBNAIL_HASH_MISMATCH', record.path, `${view} thumbnail differs from Blender report`);
    } catch (error) {
      fail('THUMBNAIL_INVALID', record.path, error.message);
    }
  }
  const contactPath = requireFile(manifest.evidence.contactSheet, 'contact sheet');
  if (contactPath) {
    try {
      const info = pngInfo(contactPath);
      const expected = [expectedThumb[0] * 2, expectedThumb[1] * 2];
      if (info.width !== expected[0] || info.height !== expected[1]) fail('CONTACT_SHEET_DIMENSIONS', manifest.evidence.contactSheet, 'contact sheet must be a 2x2 thumbnail grid', { expected, actual: [info.width, info.height] });
      if (buildReport?.contactSheet?.sha256 !== info.sha256) fail('CONTACT_SHEET_HASH_MISMATCH', manifest.evidence.contactSheet, 'contact sheet differs from Blender report');
    } catch (error) {
      fail('CONTACT_SHEET_INVALID', manifest.evidence.contactSheet, error.message);
    }
  }

  const indexPath = requireFile(manifest.evidence.artifactIndex, 'artifact index');
  const provenancePath = requireFile(manifest.evidence.provenance, 'provenance report');
  let artifactIndex = null;
  let provenance = null;
  if (indexPath) {
    try {
      artifactIndex = readJson(indexPath);
      if (artifactIndex.schemaVersion !== 1 || artifactIndex.kind !== 'MassfrontModelKitArtifactIndexV1' || artifactIndex.kitId !== manifest.kitId) fail('ARTIFACT_INDEX_SCHEMA', manifest.evidence.artifactIndex, 'artifact index type, version, or kitId is invalid');
      const indexedRecords = normalizedRecords(artifactIndex.artifacts || []);
      const actualRecords = [];
      for (const record of indexedRecords) {
        const absolute = requireFile(record.path, 'indexed artifact');
        if (!absolute) continue;
        const actual = fileRecord(kitRoot, record.path);
        actualRecords.push(actual);
        if (!sameJson(record, actual)) fail('ARTIFACT_RECORD_MISMATCH', record.path, 'artifact bytes/hash differ from index', { indexed: record, actual });
      }
      const requiredPaths = new Set([
        manifest.source.glb,
        manifest.source.sceneDigest,
        manifest.concept.image,
        manifest.evidence.sourceLock,
        manifest.evidence.buildReport,
        ...manifest.lods.map((lod) => lod.output),
        manifest.collision.output,
        ...textureRecords.map((record) => record.path),
        ...(buildReport?.thumbnails || []).map((record) => record.path),
        manifest.evidence.contactSheet
      ]);
      const indexedPaths = new Set(indexedRecords.map((record) => record.path));
      for (const path of requiredPaths) if (!indexedPaths.has(path)) fail('ARTIFACT_NOT_INDEXED', manifest.evidence.artifactIndex, `required artifact is not indexed: ${path}`);
      const digest = artifactSetDigest(actualRecords);
      if (artifactIndex.buildArtifactSetSha256 !== digest) fail('ARTIFACT_SET_HASH', manifest.evidence.artifactIndex, 'artifact-set digest does not match indexed files', { expected: artifactIndex.buildArtifactSetSha256, actual: digest });
    } catch (error) {
      fail('ARTIFACT_INDEX_PARSE', manifest.evidence.artifactIndex, error.message);
    }
  }
  if (provenancePath) {
    try {
      provenance = readJson(provenancePath);
      if (provenance.schemaVersion !== 1 || provenance.kind !== 'MassfrontModelKitProvenanceV1' || provenance.kitId !== manifest.kitId) fail('PROVENANCE_SCHEMA', manifest.evidence.provenance, 'provenance type, version, or kitId is invalid');
      if (provenance.buildArtifactSetSha256 !== artifactIndex?.buildArtifactSetSha256) fail('PROVENANCE_ARTIFACT_SET', manifest.evidence.provenance, 'provenance does not bind the current artifact set');
      if (provenance.source?.sha256 !== sourceHash || provenance.sceneDigest?.sha256 !== sceneDigestHash || provenance.concept?.sha256 !== conceptHash) fail('PROVENANCE_SOURCE', manifest.evidence.provenance, 'provenance source hashes differ from current inputs');
      if (provenance.repository?.head !== identity.head || provenance.repository?.dirtyFingerprint !== identity.dirtyFingerprint) fail('PROVENANCE_REPOSITORY_STALE', manifest.evidence.provenance, 'repository identity differs from build provenance', { built: provenance.repository, current: identity });
      if (provenance.catalog?.status === 'BOUND') {
        if (provenance.catalog.path !== CANONICAL_CATALOG) fail('CATALOG_PATH', manifest.evidence.provenance, `catalog binding must use ${CANONICAL_CATALOG}`);
        const absolute = resolve(repoRoot, ...CANONICAL_CATALOG.split('/'));
        if (!existsSync(absolute)) fail('CATALOG_MISSING', CANONICAL_CATALOG, 'catalog recorded at build time is now missing');
        else if (hashFile(absolute) !== provenance.catalog.sha256) fail('CATALOG_STALE', CANONICAL_CATALOG, 'authoritative model-pack catalog changed since this build');
      } else if (provenance.catalog?.status === 'NOT_PRESENT') {
        const absolute = resolve(repoRoot, ...CANONICAL_CATALOG.split('/'));
        if (existsSync(absolute)) fail('CATALOG_BINDING_STALE', manifest.evidence.provenance, 'catalog now exists; rebuild to bind this per-source manifest to its current hash');
      } else {
        fail('CATALOG_BINDING_UNKNOWN', manifest.evidence.provenance, 'provenance must record whether the authoritative model-pack catalog was present');
      }
      const indexedProvenance = artifactIndex?.provenance;
      if (!indexedProvenance || indexedProvenance.path !== manifest.evidence.provenance || indexedProvenance.sha256 !== hashFile(provenancePath)) fail('PROVENANCE_INDEX_MISMATCH', manifest.evidence.artifactIndex, 'artifact index does not bind the provenance report');
    } catch (error) {
      fail('PROVENANCE_PARSE', manifest.evidence.provenance, error.message);
    }
  }

  const mobilePath = resolveInside(kitRoot, manifest.evidence.mobileEvidence, 'mobile evidence');
  let mobile = null;
  if (existsSync(mobilePath)) {
    try {
      mobile = readJson(mobilePath);
    } catch (error) {
      fail('MOBILE_EVIDENCE_PARSE', manifest.evidence.mobileEvidence, error.message);
    }
  }
  if (manifest.status === 'RUNTIME_CANDIDATE') {
    if (!mobile) {
      fail('MOBILE_EVIDENCE_MISSING', manifest.evidence.mobileEvidence, 'runtime candidate requires current phone evidence');
    } else {
      if (mobile.schemaVersion !== 1 || mobile.kind !== 'MassfrontModelKitMobileEvidenceV1' || mobile.status !== 'VERIFIED') fail('MOBILE_EVIDENCE_UNKNOWN', manifest.evidence.mobileEvidence, 'runtime evidence must be VERIFIED; missing or UNKNOWN is a failure');
      if (mobile.kitId !== manifest.kitId || mobile.renderedArtifactSetSha256 !== artifactIndex?.buildArtifactSetSha256) fail('MOBILE_ARTIFACT_MISMATCH', manifest.evidence.mobileEvidence, 'mobile evidence is not bound to the current artifact set');
      if (mobile.repository?.head !== identity.head || mobile.repository?.dirtyFingerprint !== identity.dirtyFingerprint) fail('MOBILE_REPOSITORY_STALE', manifest.evidence.mobileEvidence, 'mobile evidence repository identity is stale');
      if (!Number.isFinite(Date.parse(mobile.capturedAtUtc || ''))) fail('MOBILE_TIMESTAMP', manifest.evidence.mobileEvidence, 'capturedAtUtc must be an ISO timestamp');
      if (!Array.isArray(mobile.runtimeErrors) || mobile.runtimeErrors.length) fail('MOBILE_RUNTIME_ERRORS', manifest.evidence.mobileEvidence, 'mobile evidence contains runtime errors', mobile.runtimeErrors);
      if (!Array.isArray(mobile.webglErrors) || mobile.webglErrors.length) fail('MOBILE_WEBGL_ERRORS', manifest.evidence.mobileEvidence, 'mobile evidence contains WebGL errors', mobile.webglErrors);
      if (mobile.contextLosses !== 0) fail('MOBILE_CONTEXT_LOSS', manifest.evidence.mobileEvidence, 'mobile evidence recorded WebGL context loss', { contextLosses: mobile.contextLosses });
      const viewportMap = new Map((mobile.viewports || []).map((entry) => [entry.name, entry]));
      for (const name of manifest.evidence.requiredMobileViewports) {
        const viewport = viewportMap.get(name);
        if (!viewport) {
          fail('MOBILE_VIEWPORT_MISSING', manifest.evidence.mobileEvidence, `required mobile viewport is missing: ${name}`);
          continue;
        }
        const capture = viewport.capture;
        const absolute = capture?.path ? requireFile(capture.path, `${name} capture`) : null;
        if (!absolute) continue;
        try {
          const info = pngInfo(absolute);
          if (capture.sha256 !== info.sha256 || capture.bytes !== info.bytes || capture.width !== info.width || capture.height !== info.height) fail('MOBILE_CAPTURE_MISMATCH', capture.path, `${name} capture metadata differs from file`, { capture, actual: info });
          if (name === 'phone-portrait' && info.width >= info.height) fail('MOBILE_ORIENTATION', capture.path, 'phone-portrait capture is not portrait');
          if (name === 'phone-landscape' && info.width <= info.height) fail('MOBILE_ORIENTATION', capture.path, 'phone-landscape capture is not landscape');
          if (viewport.renderedKitId !== manifest.kitId || viewport.renderedArtifactSetSha256 !== artifactIndex?.buildArtifactSetSha256) fail('MOBILE_RENDER_IDENTITY', capture.path, `${name} capture lacks current rendered kit identity`);
        } catch (error) {
          fail('MOBILE_CAPTURE_INVALID', capture?.path || name, error.message);
        }
      }
    }
  } else if (!mobile || mobile.status !== 'VERIFIED') {
    warn('MOBILE_EVIDENCE_UNKNOWN', manifest.evidence.mobileEvidence, 'mobile evidence is UNKNOWN; this is allowed only before runtime-candidate promotion');
  }

  const errors = findings.filter((finding) => finding.severity === 'ERROR');
  const warnings = findings.filter((finding) => finding.severity === 'WARNING');
  const report = {
    schemaVersion: 1,
    kind: 'MassfrontModelKitVerificationReportV1',
    status: errors.length ? 'FAIL' : 'PASS',
    verifiedAtUtc: nowUtc(),
    kitId: manifest.kitId,
    candidateStatus: manifest.status,
    manifestPath: loaded.manifestPath,
    manifestSha256: hashFile(loaded.manifestPath),
    repository: identity,
    buildArtifactSetSha256: artifactIndex?.buildArtifactSetSha256 || null,
    compatibleForRuntime: !errors.length && manifest.status === 'RUNTIME_CANDIDATE' && mobile?.status === 'VERIFIED',
    counts: { errors: errors.length, warnings: warnings.length },
    findings
  };
  if (options.writeReport !== false && reportPath) writeJsonAtomic(reportPath, report);
  return { ok: errors.length === 0, exitCode: errors.length ? 1 : 0, reportPath, report };
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || process.argv.length > 3) {
    console.error('Usage: node verify-model-kit.mjs <kit.json>');
    process.exitCode = 2;
    return;
  }
  const result = verifyModelKit(manifestPath);
  console.log(JSON.stringify({
    status: result.report.status,
    report: result.reportPath,
    counts: result.report.counts || { errors: 1, warnings: 0 },
    findings: result.report.findings
  }, null, 2));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
