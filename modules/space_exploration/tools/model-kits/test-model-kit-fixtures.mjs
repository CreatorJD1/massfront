#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  artifactSetDigest,
  fileRecord,
  findRepositoryRoot,
  hashFile,
  repositoryIdentity,
  writeJsonAtomic
} from './model-kit-core.mjs';
import { verifyModelKit } from './verify-model-kit.mjs';

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepositoryRoot(toolDir);
const catalogPath = resolve(repoRoot, 'source-media/content-library/model-pack-catalog.v1.json');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function makePng(width, height, rgba = [48, 130, 180, 255]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) Buffer.from(rgba).copy(row, 1 + x * 4);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function makeGlb(triangles, salt, options = {}) {
  const textureRgba = options.textureRgba || [48, 130, 180, 255];
  const json = {
    asset: { version: '2.0', generator: 'MASSFRONT fixture', extras: { salt } },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: `fixture_${salt}` }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4, ...(options.material ? { material: 0 } : {}) }] }],
    accessors: [
      { componentType: 5126, count: Math.max(3, triangles * 2), type: 'VEC3', min: [-1, -0.5, 0], max: [1, 0.5, 2] },
      { componentType: 5125, count: triangles * 3, type: 'SCALAR' }
    ],
    buffers: [{ byteLength: 4 }],
    ...(options.material ? {
      materials: [{
        name: 'fixture_material',
        ...(options.alphaMode && options.alphaMode !== 'OPAQUE' ? { alphaMode: options.alphaMode } : {}),
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
      }],
      textures: [{ source: 0 }],
      images: [{ uri: `data:image/png;base64,${makePng(2, 2, textureRgba).toString('base64')}` }]
    } : {})
  };
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.alloc((rawJson.length + 3) & ~3, 0x20);
  rawJson.copy(jsonChunk);
  const binary = Buffer.alloc(4);
  const total = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const output = Buffer.alloc(total);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function put(root, path, bytes) {
  const absolute = resolve(root, ...path.split('/'));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  return absolute;
}

function makeFixture(parent, name, runtime = false, options = {}) {
  const transparent = options.transparent === true;
  const textureRgba = transparent ? [48, 130, 180, 96] : [48, 130, 180, 255];
  const alphaValue = textureRgba[3] / 255;
  const root = resolve(parent, name);
  mkdirSync(root, { recursive: true });
  const manifestPath = resolve(root, 'kit.json');
  const manifest = {
    schemaVersion: 1,
    kitId: 'fixture_model',
    displayName: 'Fixture Model',
    status: runtime ? 'RUNTIME_CANDIDATE' : 'SOURCE_CANDIDATE',
    source: {
      glb: 'source/fixture-source.glb', expectedSha256: null,
      publicSceneUrl: 'https://my.spline.design/fixture/', documentName: 'Fixture Scene', documentId: 'fixture-doc',
      rootObjectId: 'root-1', meshObjectIds: ['mesh-1'], generation: { system: 'spline-ai-3d', generationId: 'gen-1' },
      meshNodeNames: ['fixture_source'],
      sceneDigest: 'evidence/scene-digest.json', expectedSceneDigestSha256: null
    },
    concept: {
      image: 'concept/fixture-concept.png', expectedSha256: null, pixelsUsedAsTexture: false,
      generation: { system: 'imagegen', generationId: 'concept-1' }
    },
    normalization: {
      sourceUp: 'Y', runtimeUp: 'Z', runtimeForward: '+Y', scaleMode: 'height', targetMeters: 2,
      centerXY: true, groundOrigin: true, toleranceMeters: 0.01
    },
    lods: [
      { name: 'LOD0', targetTriangles: 100, maxTriangles: 110, output: 'derived/fixture-lod0.glb' },
      { name: 'LOD1', targetTriangles: 60, maxTriangles: 70, output: 'derived/fixture-lod1.glb' },
      { name: 'LOD2', targetTriangles: 30, maxTriangles: 40, output: 'derived/fixture-lod2.glb' }
    ],
    collision: { mode: 'convex-hull', maxTriangles: 16, output: 'derived/fixture-collision.glb' },
    textures: {
      extract: true, requireEmbeddedSource: true, outputDirectory: 'derived/textures', seamPolicy: 'uv-atlas-not-tileable',
      maxBorderMeanDelta: 0.035, maxBorderP95Delta: 0.08
    },
    evidence: {
      outputDirectory: 'evidence', thumbnailSize: [256, 256], views: ['iso', 'front', 'side', 'top'],
      contactSheet: 'evidence/contact-sheet.png', buildReport: 'evidence/build-report.json',
      verificationReport: 'evidence/verification-report.json', artifactIndex: 'evidence/artifact-index.json',
      sourceLock: 'evidence/source-lock.json', provenance: 'provenance.json', mobileEvidence: 'evidence/mobile-evidence.json',
      requiredMobileViewports: ['phone-portrait', 'phone-landscape']
    },
    budgets: { maxSourceBytes: 1_000_000, maxSourceTriangles: 200, maxMaterials: 2, maxTextures: 2, maxTextureDimension: 1024 }
  };
  writeJsonAtomic(manifestPath, manifest);
  put(root, manifest.source.glb, makeGlb(120, 'source', { material: true, alphaMode: 'BLEND', textureRgba }));
  put(root, manifest.concept.image, makePng(64, 64, [90, 140, 200, 255]));
  const digest = {
    capturedAtUtc: '2026-08-25T20:00:00.000Z', documentName: manifest.source.documentName,
    publicSceneUrl: manifest.source.publicSceneUrl, rootObjectId: manifest.source.rootObjectId,
    meshObjectIds: manifest.source.meshObjectIds, getScene: { id: 'scene' }, getObjects: [{ id: 'mesh-1' }], analyzeScene: { meshes: 1 }
  };
  writeJsonAtomic(resolve(root, manifest.source.sceneDigest), digest);
  put(root, manifest.lods[0].output, makeGlb(100, 'lod0', { material: true, alphaMode: transparent ? 'BLEND' : 'OPAQUE', textureRgba }));
  put(root, manifest.lods[1].output, makeGlb(60, 'lod1', { material: true, alphaMode: transparent ? 'BLEND' : 'OPAQUE', textureRgba }));
  put(root, manifest.lods[2].output, makeGlb(30, 'lod2', { material: true, alphaMode: transparent ? 'BLEND' : 'OPAQUE', textureRgba }));
  put(root, manifest.collision.output, makeGlb(12, 'collision'));
  put(root, 'derived/textures/source.png', makePng(16, 16, textureRgba));
  for (const view of manifest.evidence.views) put(root, `evidence/thumb-${view}.png`, makePng(256, 256));
  put(root, manifest.evidence.contactSheet, makePng(512, 512));

  const inputRecords = {
    source: fileRecord(root, manifest.source.glb), sceneDigest: fileRecord(root, manifest.source.sceneDigest), concept: fileRecord(root, manifest.concept.image)
  };
  writeJsonAtomic(resolve(root, manifest.evidence.sourceLock), {
    schemaVersion: 1, kind: 'MassfrontModelKitSourceLockV1', kitId: manifest.kitId,
    ...inputRecords,
    splineIdentity: {
      publicSceneUrl: manifest.source.publicSceneUrl, documentName: manifest.source.documentName, documentId: manifest.source.documentId,
      rootObjectId: manifest.source.rootObjectId, meshObjectIds: manifest.source.meshObjectIds, meshNodeNames: manifest.source.meshNodeNames, generation: manifest.source.generation
    }, createdAtUtc: '2026-08-25T20:01:00.000Z'
  });
  const texture = fileRecord(root, 'derived/textures/source.png');
  const thumbnails = manifest.evidence.views.map((view) => ({ view, ...fileRecord(root, `evidence/thumb-${view}.png`), width: 256, height: 256 }));
  const contact = fileRecord(root, manifest.evidence.contactSheet);
  const sourceWorkingStats = {
    objects: 1, vertices: 240, triangles: 120, invalidVertices: 0, zeroAreaTriangles: 0,
    bounds: { minimum: [-1, -0.5, 0], maximum: [1, 0.5, 2], dimensions: [2, 1, 2], center: [0, 0, 1] }
  };
  const buildReport = {
    schemaVersion: 1, kind: 'MassfrontModelKitBuildReportV1', status: 'PASS', builtAtUtc: '2026-08-25T20:02:00.000Z',
    kitId: manifest.kitId, blender: { version: '5.2.0', versionTuple: [5, 2, 0] },
    source: { ...inputRecords.source, stats: sourceWorkingStats, importedImages: 1, selectedMeshNodeNames: manifest.source.meshNodeNames, excludedMeshNodeNames: [] },
    normalization: {
      centerXYErrorMeters: 0, groundErrorMeters: 0, targetErrorMeters: 0,
      after: { invalidVertices: 0, zeroAreaTriangles: 0, bounds: { minimum: [-1, -0.5, 0], maximum: [1, 0.5, 2], dimensions: [2, 1, 2], center: [0, 0, 1] } }
    },
    geometryCleanup: {
      policyVersion: 1, areaEpsilon: 1e-12,
      before: sourceWorkingStats,
      removed: { degenerateFaces: 0, triangles: 0, vertices: 0 },
      after: sourceWorkingStats,
      objects: [{ name: 'fixture_source', facesBefore: 120, removedDegenerateFaces: 0, facesAfter: 120 }]
    },
    materialAlphaSanitization: {
      policyVersion: 1,
      opaqueThreshold: 0.999999,
      materials: [{
        name: 'fixture_material', sourceRenderMethod: 'BLENDED', sourceBlendMethod: 'BLEND',
        decision: transparent ? 'PRESERVED_BLEND' : 'FORCED_OPAQUE',
        proof: {
          status: transparent ? 'NON_OPAQUE' : 'FULLY_OPAQUE', opaqueThreshold: 0.999999,
          diffuseAlpha: { status: 'FULLY_OPAQUE', kind: 'CONSTANT', label: 'material.diffuse_color alpha', value: 1 },
          surfaceInputs: [{
            status: transparent ? 'NON_OPAQUE' : 'FULLY_OPAQUE', kind: 'IMAGE_ALPHA', node: 'Image Texture', principledNode: 'Principled BSDF',
            image: { name: 'source', width: 16, height: 16, alphaMin: alphaValue, alphaMax: alphaValue, fullyOpaque: !transparent }
          }]
        },
        resultRenderMethod: transparent ? 'BLENDED' : 'DITHERED', resultBlendMethod: transparent ? 'BLEND' : 'HASHED',
        expectedOutputAlphaMode: transparent ? 'BLEND' : 'OPAQUE'
      }],
      summary: { total: 1, forcedOpaque: transparent ? 0 : 1, preservedBlend: transparent ? 1 : 0, unchanged: 0 }
    },
    lods: manifest.lods.map((spec, index) => ({
      name: spec.name, path: spec.output, targetTriangles: spec.targetTriangles, maxTriangles: spec.maxTriangles,
      actual: { triangles: [100, 60, 30][index], invalidVertices: 0, zeroAreaTriangles: 0 }, ...fileRecord(root, spec.output)
    })),
    collision: { mode: 'convex-hull', path: manifest.collision.output, maxTriangles: 16, actual: { triangles: 12 }, ...fileRecord(root, manifest.collision.output) },
    textures: [{
      sourceName: 'source', ...texture, width: 16, height: 16,
      alpha: { name: 'source', width: 16, height: 16, alphaMin: alphaValue, alphaMax: alphaValue, fullyOpaque: !transparent },
      seam: { status: 'NOT_APPLICABLE', reason: 'UV atlas is not declared tileable' }
    }],
    thumbnails, contactSheet: { ...contact, width: 512, height: 512 }, warnings: [], errors: []
  };
  writeJsonAtomic(resolve(root, manifest.evidence.buildReport), buildReport);

  const artifactPaths = [
    basename(manifestPath), manifest.source.glb, manifest.source.sceneDigest, manifest.concept.image,
    manifest.evidence.sourceLock, manifest.evidence.buildReport, ...manifest.lods.map((lod) => lod.output), manifest.collision.output,
    'derived/textures/source.png', ...manifest.evidence.views.map((view) => `evidence/thumb-${view}.png`), manifest.evidence.contactSheet
  ];
  const artifacts = artifactPaths.map((path) => fileRecord(root, path));
  const artifactSet = artifactSetDigest(artifacts);
  const repository = repositoryIdentity(repoRoot, [root]);
  const provenance = {
    schemaVersion: 1, kind: 'MassfrontModelKitProvenanceV1', kitId: manifest.kitId,
    buildArtifactSetSha256: artifactSet, repository,
    catalog: { status: 'BOUND', path: 'source-media/content-library/model-pack-catalog.v1.json', sha256: hashFile(catalogPath) },
    source: inputRecords.source, sceneDigest: inputRecords.sceneDigest, concept: { ...inputRecords.concept, pixelsUsedAsTexture: false }
  };
  writeJsonAtomic(resolve(root, manifest.evidence.provenance), provenance);
  writeJsonAtomic(resolve(root, manifest.evidence.artifactIndex), {
    schemaVersion: 1, kind: 'MassfrontModelKitArtifactIndexV1', kitId: manifest.kitId,
    buildArtifactSetSha256: artifactSet, artifacts, provenance: fileRecord(root, manifest.evidence.provenance)
  });
  const mobile = {
    schemaVersion: 1, kind: 'MassfrontModelKitMobileEvidenceV1', status: runtime ? 'VERIFIED' : 'UNKNOWN', kitId: manifest.kitId,
    renderedArtifactSetSha256: artifactSet, capturedAtUtc: runtime ? '2026-08-25T20:03:00.000Z' : null,
    repository, runtimeErrors: runtime ? [] : null, webglErrors: runtime ? [] : null, contextLosses: runtime ? 0 : null, viewports: []
  };
  if (runtime) {
    for (const [name, width, height] of [['phone-portrait', 320, 640], ['phone-landscape', 640, 320]]) {
      const path = `evidence/${name}.png`;
      put(root, path, makePng(width, height));
      mobile.viewports.push({
        name, renderedKitId: manifest.kitId, renderedArtifactSetSha256: artifactSet,
        capture: { ...fileRecord(root, path), width, height }
      });
    }
  }
  writeJsonAtomic(resolve(root, manifest.evidence.mobileEvidence), mobile);
  return { root, manifestPath, manifest, artifactSet };
}

function expectedFailure(parent, name, mutate, expectedCode, runtime = false) {
  const fixture = makeFixture(parent, name, runtime);
  mutate(fixture);
  const result = verifyModelKit(fixture.manifestPath, { writeReport: false });
  const codes = new Set(result.report.findings.map((finding) => finding.code));
  if (result.ok || !codes.has(expectedCode)) {
    throw new Error(`${name}: expected nonzero ${expectedCode}; got ok=${result.ok}, codes=${[...codes].join(',')}`);
  }
  return { name, status: 'PASS', expected: expectedCode, exitCode: result.exitCode };
}

function main() {
  const parent = mkdtempSync(resolve(toolDir, '.fixture-'));
  const results = [];
  try {
    for (const [name, runtime] of [['clean-source', false], ['clean-runtime', true]]) {
      const fixture = makeFixture(parent, name, runtime);
      const result = verifyModelKit(fixture.manifestPath, { writeReport: false });
      if (!result.ok) throw new Error(`${name}: clean fixture failed: ${JSON.stringify(result.report.findings)}`);
      results.push({ name, status: 'PASS', expected: 'clean exit zero', exitCode: result.exitCode });
    }
    const transparentFixture = makeFixture(parent, 'clean-transparent', false, { transparent: true });
    const transparentResult = verifyModelKit(transparentFixture.manifestPath, { writeReport: false });
    if (!transparentResult.ok) throw new Error(`clean-transparent: genuine alpha fixture failed: ${JSON.stringify(transparentResult.report.findings)}`);
    results.push({ name: 'clean-transparent', status: 'PASS', expected: 'genuine BLEND preserved', exitCode: transparentResult.exitCode });
    results.push(expectedFailure(parent, 'source-hash', ({ manifestPath }) => {
      const value = JSON.parse(readFileSync(manifestPath, 'utf8')); value.source.expectedSha256 = '0'.repeat(64); writeJsonAtomic(manifestPath, value);
    }, 'HASH_MISMATCH'));
    results.push(expectedFailure(parent, 'scene-identity', ({ root, manifest }) => {
      const path = resolve(root, manifest.source.sceneDigest); const value = JSON.parse(readFileSync(path, 'utf8')); value.rootObjectId = 'wrong'; writeJsonAtomic(path, value);
    }, 'SCENE_ROOT_MISMATCH'));
    results.push(expectedFailure(parent, 'concept-policy', ({ manifestPath }) => {
      const value = JSON.parse(readFileSync(manifestPath, 'utf8')); value.concept.pixelsUsedAsTexture = true; writeJsonAtomic(manifestPath, value);
    }, 'CONCEPT_PIXEL_POLICY'));
    results.push(expectedFailure(parent, 'lod-duplicate', ({ root, manifest }) => {
      writeFileSync(resolve(root, manifest.lods[1].output), readFileSync(resolve(root, manifest.lods[0].output)));
    }, 'LOD_IDENTICAL'));
    results.push(expectedFailure(parent, 'collision-budget', ({ manifestPath }) => {
      const value = JSON.parse(readFileSync(manifestPath, 'utf8')); value.collision.maxTriangles = 8; writeJsonAtomic(manifestPath, value);
    }, 'COLLISION_TRIANGLE_BUDGET'));
    results.push(expectedFailure(parent, 'seam-claim', ({ manifestPath }) => {
      const value = JSON.parse(readFileSync(manifestPath, 'utf8')); value.textures.seamPolicy = 'require-tileable'; writeJsonAtomic(manifestPath, value);
    }, 'TEXTURE_SEAM_FAIL'));
    results.push(expectedFailure(parent, 'geometry-cleanup-missing', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); delete value.geometryCleanup; writeJsonAtomic(path, value);
    }, 'GEOMETRY_CLEANUP_EVIDENCE_MISSING'));
    results.push(expectedFailure(parent, 'geometry-cleanup-accounting', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); value.geometryCleanup.removed.degenerateFaces = 1; writeJsonAtomic(path, value);
    }, 'GEOMETRY_CLEANUP_ACCOUNTING'));
    results.push(expectedFailure(parent, 'geometry-cleanup-unresolved', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); value.geometryCleanup.after.zeroAreaTriangles = 1; writeJsonAtomic(path, value);
    }, 'GEOMETRY_CLEANUP_UNRESOLVED'));
    results.push(expectedFailure(parent, 'alpha-evidence-missing', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); delete value.materialAlphaSanitization; writeJsonAtomic(path, value);
    }, 'MATERIAL_ALPHA_EVIDENCE_MISSING'));
    results.push(expectedFailure(parent, 'alpha-output-blend', ({ root, manifest }) => {
      writeFileSync(resolve(root, manifest.lods[0].output), makeGlb(100, 'lod0-forced-blend', { material: true, alphaMode: 'BLEND' }));
    }, 'LOD_ALPHA_MODE_MISMATCH'));
    results.push(expectedFailure(parent, 'alpha-force-unproven', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); value.materialAlphaSanitization.materials[0].proof.status = 'UNKNOWN'; writeJsonAtomic(path, value);
    }, 'MATERIAL_ALPHA_FORCE_UNPROVEN'));
    results.push(expectedFailure(parent, 'alpha-image-nonopaque', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); const image = value.materialAlphaSanitization.materials[0].proof.surfaceInputs[0].image; image.alphaMin = 0.5; image.fullyOpaque = false; writeJsonAtomic(path, value);
    }, 'MATERIAL_ALPHA_IMAGE'));
    results.push(expectedFailure(parent, 'texture-alpha-evidence', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.buildReport); const value = JSON.parse(readFileSync(path, 'utf8')); delete value.textures[0].alpha; writeJsonAtomic(path, value);
    }, 'TEXTURE_ALPHA_EVIDENCE_MISSING'));
    results.push(expectedFailure(parent, 'artifact-hash', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.artifactIndex); const value = JSON.parse(readFileSync(path, 'utf8')); value.artifacts[0].sha256 = 'f'.repeat(64); writeJsonAtomic(path, value);
    }, 'ARTIFACT_RECORD_MISMATCH'));
    // Replace the clean VERIFIED record after fixture creation to model missing collection.
    const unknownFixture = makeFixture(parent, 'runtime-unknown-actual', true);
    const unknownPath = resolve(unknownFixture.root, unknownFixture.manifest.evidence.mobileEvidence);
    const unknownValue = JSON.parse(readFileSync(unknownPath, 'utf8')); unknownValue.status = 'UNKNOWN'; writeJsonAtomic(unknownPath, unknownValue);
    const unknownResult = verifyModelKit(unknownFixture.manifestPath, { writeReport: false });
    if (unknownResult.ok || !unknownResult.report.findings.some((entry) => entry.code === 'MOBILE_EVIDENCE_UNKNOWN')) throw new Error('runtime-unknown: expected fail-closed UNKNOWN mobile evidence');
    results.push({ name: 'runtime-unknown', status: 'PASS', expected: 'MOBILE_EVIDENCE_UNKNOWN', exitCode: unknownResult.exitCode });
    results.push(expectedFailure(parent, 'runtime-stale-set', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.mobileEvidence); const value = JSON.parse(readFileSync(path, 'utf8')); value.renderedArtifactSetSha256 = '0'.repeat(64); writeJsonAtomic(path, value);
    }, 'MOBILE_ARTIFACT_MISMATCH', true));
    results.push(expectedFailure(parent, 'runtime-capture-hash', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.mobileEvidence); const value = JSON.parse(readFileSync(path, 'utf8')); value.viewports[0].capture.sha256 = '0'.repeat(64); writeJsonAtomic(path, value);
    }, 'MOBILE_CAPTURE_MISMATCH', true));
    results.push(expectedFailure(parent, 'runtime-page-error', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.mobileEvidence); const value = JSON.parse(readFileSync(path, 'utf8')); value.runtimeErrors = ['fixture page error']; writeJsonAtomic(path, value);
    }, 'MOBILE_RUNTIME_ERRORS', true));
    results.push(expectedFailure(parent, 'runtime-context-loss', ({ root, manifest }) => {
      const path = resolve(root, manifest.evidence.mobileEvidence); const value = JSON.parse(readFileSync(path, 'utf8')); value.contextLosses = 1; writeJsonAtomic(path, value);
    }, 'MOBILE_CONTEXT_LOSS', true));
    console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

main();
