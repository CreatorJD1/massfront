#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artifactSetDigest,
  fileRecord,
  findBlender,
  findRepositoryRoot,
  hashFile,
  loadManifest,
  readJson,
  repositoryIdentity,
  resolveInside,
  toPosix,
  validateSceneDigest,
  writeJsonAtomic
} from './model-kit-core.mjs';
import { verifyModelKit } from './verify-model-kit.mjs';

const toolDir = dirname(fileURLToPath(import.meta.url));
const blenderWorker = resolve(toolDir, 'process-model-kit.py');
const canonicalCatalog = 'source-media/content-library/model-pack-catalog.v1.json';

function nowUtc() {
  return new Date().toISOString();
}

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} is missing: ${path}`);
}

function assertPinnedHash(path, expected, label) {
  const actual = hashFile(path);
  if (expected !== null && actual !== expected) throw new Error(`${label} SHA-256 mismatch: expected ${expected}, got ${actual}`);
  return actual;
}

function sourceRecord(root, relativePath) {
  const record = fileRecord(root, relativePath);
  return { path: relativePath, bytes: record.bytes, sha256: record.sha256 };
}

function createOrVerifySourceLock(root, manifest, inputs) {
  const path = resolveInside(root, manifest.evidence.sourceLock, 'source lock');
  const expected = {
    schemaVersion: 1,
    kind: 'MassfrontModelKitSourceLockV1',
    kitId: manifest.kitId,
    source: inputs.source,
    sceneDigest: inputs.sceneDigest,
    concept: inputs.concept,
    splineIdentity: {
      publicSceneUrl: manifest.source.publicSceneUrl,
      documentName: manifest.source.documentName,
      documentId: manifest.source.documentId ?? null,
      rootObjectId: manifest.source.rootObjectId,
      meshObjectIds: manifest.source.meshObjectIds,
      meshNodeNames: manifest.source.meshNodeNames,
      generation: manifest.source.generation
    }
  };
  if (existsSync(path)) {
    const current = readJson(path);
    const stableCurrent = { ...current };
    delete stableCurrent.createdAtUtc;
    if (JSON.stringify(stableCurrent) !== JSON.stringify(expected)) {
      throw new Error(`Immutable source lock differs from current source or Spline identity: ${path}`);
    }
    return current;
  }
  const lock = { ...expected, createdAtUtc: nowUtc() };
  writeJsonAtomic(path, lock);
  return lock;
}

function discoverCatalog(repoRoot) {
  const absolute = resolve(repoRoot, ...canonicalCatalog.split('/'));
  if (!existsSync(absolute)) return { status: 'NOT_PRESENT', path: canonicalCatalog, sha256: null, bytes: 0 };
  return {
    status: 'BOUND',
    path: canonicalCatalog,
    sha256: hashFile(absolute),
    bytes: statSync(absolute).size
  };
}

function toolRecord(repoRoot, absolute) {
  return {
    path: toPosix(relative(repoRoot, absolute)),
    bytes: statSync(absolute).size,
    sha256: hashFile(absolute)
  };
}

function runBuild(manifestPath) {
  const loaded = loadManifest(manifestPath);
  const { manifest, kitRoot } = loaded;
  const repoRoot = findRepositoryRoot(loaded.manifestPath);
  const sourcePath = resolveInside(kitRoot, manifest.source.glb, 'source GLB');
  const conceptPath = resolveInside(kitRoot, manifest.concept.image, 'concept image');
  const sceneDigestPath = resolveInside(kitRoot, manifest.source.sceneDigest, 'scene digest');
  requireFile(sourcePath, 'source GLB');
  requireFile(conceptPath, 'concept image');
  requireFile(sceneDigestPath, 'scene digest');

  const sourceHash = assertPinnedHash(sourcePath, manifest.source.expectedSha256, 'source GLB');
  const conceptHash = assertPinnedHash(conceptPath, manifest.concept.expectedSha256, 'concept image');
  const sceneDigestHash = assertPinnedHash(sceneDigestPath, manifest.source.expectedSceneDigestSha256, 'scene digest');
  const sceneDigest = readJson(sceneDigestPath);
  const digestValidation = validateSceneDigest(sceneDigest, manifest);
  if (!digestValidation.ok) {
    throw new Error(`Spline scene digest does not match kit manifest:\n${digestValidation.errors.map((entry) => `${entry.code} ${entry.path}: ${entry.message}`).join('\n')}`);
  }
  for (const field of ['getScene', 'getObjects', 'analyzeScene']) {
    const value = sceneDigest[field];
    if (value === null || value === undefined || value === '' || (typeof value === 'object' && !Object.keys(value).length)) {
      throw new Error(`Spline scene digest field ${field} is empty`);
    }
  }

  const inputs = {
    source: sourceRecord(kitRoot, manifest.source.glb),
    sceneDigest: sourceRecord(kitRoot, manifest.source.sceneDigest),
    concept: sourceRecord(kitRoot, manifest.concept.image)
  };
  createOrVerifySourceLock(kitRoot, manifest, inputs);

  const blender = findBlender();
  if (!blender) throw new Error('Blender was not found. Set BLENDER_EXE to Blender 4.5+ or install Blender 5.2.');
  requireFile(blenderWorker, 'Blender model-kit worker');
  const command = [
    '--background',
    '--factory-startup',
    '--python', blenderWorker,
    '--', '--manifest', loaded.manifestPath
  ];
  const result = spawnSync(blender, command, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    throw new Error(`Blender model-kit build failed with exit ${result.status}:\n${output.slice(-12000)}`);
  }

  const buildReportPath = resolveInside(kitRoot, manifest.evidence.buildReport, 'build report');
  requireFile(buildReportPath, 'Blender build report');
  const buildReport = readJson(buildReportPath);
  if (buildReport.status !== 'PASS') throw new Error(`Blender build report is ${buildReport.status}`);

  const artifactPaths = [
    basename(loaded.manifestPath),
    manifest.source.glb,
    manifest.source.sceneDigest,
    manifest.concept.image,
    manifest.evidence.sourceLock,
    manifest.evidence.buildReport,
    ...manifest.lods.map((lod) => lod.output),
    manifest.collision.output,
    ...(buildReport.textures || []).map((record) => record.path),
    ...(buildReport.thumbnails || []).map((record) => record.path),
    manifest.evidence.contactSheet
  ];
  const uniqueArtifactPaths = [...new Set(artifactPaths)];
  const records = uniqueArtifactPaths.map((path) => fileRecord(kitRoot, path));
  const buildArtifactSetSha256 = artifactSetDigest(records);
  const repository = repositoryIdentity(repoRoot, [kitRoot]);
  const catalog = discoverCatalog(repoRoot);

  const provenance = {
    schemaVersion: 1,
    kind: 'MassfrontModelKitProvenanceV1',
    createdAtUtc: nowUtc(),
    kitId: manifest.kitId,
    candidateStatus: manifest.status,
    buildArtifactSetSha256,
    repository,
    catalog,
    source: { ...inputs.source, expectedSha256: manifest.source.expectedSha256 },
    sceneDigest: { ...inputs.sceneDigest, expectedSha256: manifest.source.expectedSceneDigestSha256 },
    concept: { ...inputs.concept, expectedSha256: manifest.concept.expectedSha256, pixelsUsedAsTexture: false },
    splineIdentity: {
      publicSceneUrl: manifest.source.publicSceneUrl,
      documentName: manifest.source.documentName,
      documentId: manifest.source.documentId ?? null,
      rootObjectId: manifest.source.rootObjectId,
      meshObjectIds: manifest.source.meshObjectIds,
      meshNodeNames: manifest.source.meshNodeNames,
      generation: manifest.source.generation
    },
    toolchain: {
      blender: buildReport.blender,
      node: process.version,
      files: [
        toolRecord(repoRoot, fileURLToPath(import.meta.url)),
        toolRecord(repoRoot, blenderWorker),
        toolRecord(repoRoot, resolve(toolDir, 'verify-model-kit.mjs')),
        toolRecord(repoRoot, resolve(toolDir, 'model-kit-core.mjs')),
        toolRecord(repoRoot, resolve(toolDir, 'model-kit.schema.json'))
      ]
    },
    command: {
      executable: blender,
      arguments: command,
      cwd: repoRoot
    }
  };
  const provenancePath = resolveInside(kitRoot, manifest.evidence.provenance, 'provenance report');
  writeJsonAtomic(provenancePath, provenance);
  const provenanceRecord = fileRecord(kitRoot, manifest.evidence.provenance);

  const artifactIndex = {
    schemaVersion: 1,
    kind: 'MassfrontModelKitArtifactIndexV1',
    createdAtUtc: nowUtc(),
    kitId: manifest.kitId,
    buildArtifactSetSha256,
    artifacts: records,
    provenance: provenanceRecord,
    exclusions: [
      manifest.evidence.artifactIndex,
      manifest.evidence.verificationReport,
      manifest.evidence.mobileEvidence
    ],
    note: 'Index, verification report, and mobile evidence are excluded to avoid self-referential hashes; mobile evidence binds buildArtifactSetSha256.'
  };
  const indexPath = resolveInside(kitRoot, manifest.evidence.artifactIndex, 'artifact index');
  writeJsonAtomic(indexPath, artifactIndex);

  const mobilePath = resolveInside(kitRoot, manifest.evidence.mobileEvidence, 'mobile evidence');
  if (!existsSync(mobilePath)) {
    writeJsonAtomic(mobilePath, {
      schemaVersion: 1,
      kind: 'MassfrontModelKitMobileEvidenceV1',
      status: 'UNKNOWN',
      kitId: manifest.kitId,
      renderedArtifactSetSha256: buildArtifactSetSha256,
      capturedAtUtc: null,
      repository,
      runtimeErrors: null,
      webglErrors: null,
      contextLosses: null,
      requiredViewports: manifest.evidence.requiredMobileViewports,
      viewports: [],
      blockers: ['Real in-game phone portrait and landscape captures have not been collected.']
    });
  }

  const verification = verifyModelKit(loaded.manifestPath);
  if (!verification.ok) {
    throw new Error(`Model-kit verification failed. Report: ${verification.reportPath}\n${verification.report.findings.filter((entry) => entry.severity === 'ERROR').map((entry) => `${entry.code} ${entry.path}: ${entry.message}`).join('\n')}`);
  }
  return {
    status: 'PASS',
    kitId: manifest.kitId,
    candidateStatus: manifest.status,
    buildArtifactSetSha256,
    blender: buildReport.blender,
    catalog,
    reports: {
      build: buildReportPath,
      verification: verification.reportPath,
      provenance: provenancePath,
      artifactIndex: indexPath,
      mobileEvidence: mobilePath
    },
    verification: verification.report.counts,
    note: verification.report.compatibleForRuntime
      ? 'Runtime candidate has current verified mobile evidence.'
      : 'Derived kit is not runtime-approved; mobile and human art review remain separate gates.'
  };
}

function usage() {
  console.error('Usage: node model-kit.mjs build <kit.json>');
  process.exitCode = 2;
}

function main() {
  const [command, manifestPath, ...extra] = process.argv.slice(2);
  if (command !== 'build' || !manifestPath || extra.length) return usage();
  try {
    console.log(JSON.stringify(runBuild(manifestPath), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

main();
