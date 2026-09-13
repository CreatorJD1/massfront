import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';

export const SHA256_RE = /^[a-f0-9]{64}$/;
export const KIT_ID_RE = /^[a-z][a-z0-9_]*$/;
export const KIT_STATUSES = new Set([
  'SOURCE_CANDIDATE',
  'REVIEW_CANDIDATE',
  'RUNTIME_CANDIDATE'
]);
export const REQUIRED_VIEWS = Object.freeze(['iso', 'front', 'side', 'top']);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashFile(path) {
  return sha256(readFileSync(path));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch {}
    throw error;
  }
}

export function toPosix(path) {
  return path.split(sep).join('/');
}

export function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) return false;
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/|file:|~[\\/])/i.test(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.includes('\\')) return false;
  return !normalized.split('/').includes('..');
}

export function resolveInside(root, relativePath, label = 'path') {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`${label} must be a repository-relative POSIX path without traversal: ${String(relativePath)}`);
  }
  const absoluteRoot = resolve(root);
  const absolute = resolve(absoluteRoot, ...relativePath.split('/'));
  if (absolute !== absoluteRoot && !absolute.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`${label} escapes kit root: ${relativePath}`);
  }
  return absolute;
}

export function fileRecord(root, path) {
  const absolute = resolveInside(root, path, 'artifact path');
  const bytes = readFileSync(absolute);
  return { path: toPosix(path), bytes: bytes.byteLength, sha256: sha256(bytes) };
}

export function artifactSetDigest(records) {
  const canonical = [...records]
    .map(({ path, bytes, sha256: digest }) => ({ path: toPosix(path), bytes, sha256: digest }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return sha256(JSON.stringify(canonical));
}

export function pngInfo(path) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.byteLength < 33 || !bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${path} is not a PNG`);
  }
  const crcTable = pngInfo.crcTable || (pngInfo.crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    return value >>> 0;
  }));
  const crc32 = (value) => {
    let crc = 0xffffffff;
    for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  let offset = 8;
  let width = 0;
  let height = 0;
  let ihdr = null;
  const idat = [];
  let ended = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) throw new Error(`${path} has a truncated PNG chunk`);
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.byteLength) throw new Error(`${path} has an overrun PNG chunk`);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (expectedCrc !== actualCrc) throw new Error(`${path} has a bad ${type} CRC`);
    if (type === 'IHDR') {
      if (ihdr || length !== 13 || offset !== 8) throw new Error(`${path} has an invalid IHDR`);
      ihdr = data;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (!width || !height) throw new Error(`${path} has invalid dimensions`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      if (length !== 0 || end !== bytes.byteLength) throw new Error(`${path} has an invalid IEND`);
      ended = true;
    }
    offset = end;
  }
  if (!ihdr || !idat.length || !ended) throw new Error(`${path} lacks required PNG chunks`);
  try { inflateSync(Buffer.concat(idat)); } catch (error) { throw new Error(`${path} has invalid PNG image data: ${error.message}`); }
  return {
    bytes: bytes.byteLength,
    width,
    height,
    sha256: sha256(bytes)
  };
}

function parseGlbChunks(bytes) {
  if (bytes.byteLength < 20) throw new Error('file is too small for GLB 2.0');
  if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error('invalid GLB magic');
  if (bytes.readUInt32LE(4) !== 2) throw new Error(`unsupported GLB version ${bytes.readUInt32LE(4)}`);
  if (bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error(`GLB declared ${bytes.readUInt32LE(8)} bytes but file has ${bytes.byteLength}`);
  }
  const chunks = [];
  let offset = 12;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error('truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.byteLength) throw new Error('GLB chunk overruns container');
    chunks.push({ type, data: bytes.subarray(start, end), length });
    offset = end;
  }
  if (offset !== bytes.byteLength) throw new Error('GLB chunks do not consume container');
  const jsonChunks = chunks.filter((chunk) => chunk.type === 0x4e4f534a);
  const binChunks = chunks.filter((chunk) => chunk.type === 0x004e4942);
  if (jsonChunks.length !== 1 || chunks[0]?.type !== 0x4e4f534a) {
    throw new Error(`expected one leading JSON chunk; found ${jsonChunks.length}`);
  }
  if (binChunks.length > 1) throw new Error(`expected at most one BIN chunk; found ${binChunks.length}`);
  const jsonText = jsonChunks[0].data.toString('utf8').replace(/[\u0000\u0020]+$/g, '');
  return { document: JSON.parse(jsonText), chunks, binary: binChunks[0]?.data || Buffer.alloc(0) };
}

export function glbInfo(path) {
  const bytes = readFileSync(path);
  const { document, chunks } = parseGlbChunks(bytes);
  const accessors = document.accessors || [];
  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  let nonTrianglePrimitives = 0;
  let missingPositions = 0;
  let missingIndices = 0;
  const bounds = { minimum: [Infinity, Infinity, Infinity], maximum: [-Infinity, -Infinity, -Infinity] };
  let finiteBounds = true;

  for (const mesh of document.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      primitives++;
      const mode = primitive.mode ?? 4;
      if (mode !== 4) nonTrianglePrimitives++;
      const positionAccessor = accessors[primitive.attributes?.POSITION];
      if (!positionAccessor) {
        missingPositions++;
      } else {
        vertices += Number(positionAccessor.count || 0);
        if (Array.isArray(positionAccessor.min) && Array.isArray(positionAccessor.max)) {
          for (let axis = 0; axis < 3; axis++) {
            const low = Number(positionAccessor.min[axis]);
            const high = Number(positionAccessor.max[axis]);
            if (!Number.isFinite(low) || !Number.isFinite(high)) finiteBounds = false;
            else {
              bounds.minimum[axis] = Math.min(bounds.minimum[axis], low);
              bounds.maximum[axis] = Math.max(bounds.maximum[axis], high);
            }
          }
        }
      }
      if (!Number.isInteger(primitive.indices) || !accessors[primitive.indices]) {
        missingIndices++;
        if (mode === 4 && positionAccessor) triangles += Number(positionAccessor.count || 0) / 3;
      } else if (mode === 4) {
        triangles += Number(accessors[primitive.indices].count || 0) / 3;
      }
    }
  }

  const externalUris = [];
  for (const [kind, values] of [['buffer', document.buffers || []], ['image', document.images || []]]) {
    values.forEach((value, index) => {
      if (typeof value.uri === 'string' && !value.uri.startsWith('data:')) {
        externalUris.push({ kind, index, uri: value.uri });
      }
    });
  }
  const imageDimensions = (document.images || []).map((image, index) => ({
    index,
    name: image.name || null,
    mimeType: image.mimeType || null,
    embedded: Number.isInteger(image.bufferView) || String(image.uri || '').startsWith('data:')
  }));
  const meshNodeNames = (document.nodes || [])
    .filter((node) => Number.isInteger(node.mesh))
    .map((node) => node.name || null);
  const materialAlphaModes = (document.materials || []).map((material, index) => ({
    index,
    name: material.name || null,
    alphaMode: material.alphaMode || 'OPAQUE',
    alphaCutoff: material.alphaMode === 'MASK' ? Number(material.alphaCutoff ?? 0.5) : null,
    baseColorAlpha: Number(material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1)
  }));
  const dimensions = finiteBounds && bounds.minimum.every(Number.isFinite) && bounds.maximum.every(Number.isFinite)
    ? bounds.maximum.map((value, axis) => value - bounds.minimum[axis])
    : null;
  return {
    path,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    version: 2,
    chunks: chunks.length,
    scenes: (document.scenes || []).length,
    nodes: (document.nodes || []).length,
    meshes: (document.meshes || []).length,
    meshNodeNames,
    primitives,
    vertices,
    triangles: Math.round(triangles),
    materials: (document.materials || []).length,
    materialAlphaModes,
    textures: (document.textures || []).length,
    images: imageDimensions,
    externalUris,
    selfContained: externalUris.length === 0,
    nonTrianglePrimitives,
    missingPositions,
    missingIndices,
    finiteBounds,
    bounds: dimensions ? { ...bounds, dimensions } : null,
    generator: document.asset?.generator || null,
    extras: document.asset?.extras || null
  };
}

export function findRepositoryRoot(fromPath) {
  let cursor = resolve(fromPath);
  if (existsSync(cursor) && !statSync(cursor).isDirectory()) cursor = dirname(cursor);
  while (true) {
    if (existsSync(resolve(cursor, 'package.json')) && existsSync(resolve(cursor, 'assets', 'data', 'manifest.json'))) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`Could not locate MASSFRONT repository above ${fromPath}`);
    cursor = parent;
  }
}

function runGit(repoRoot, args, binary = false) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: binary ? null : 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0) return null;
  return binary ? result.stdout : String(result.stdout || '').trim();
}

export function repositoryIdentity(repoRoot, excludedPaths = []) {
  const exclusions = excludedPaths
    .map((path) => toPosix(relative(repoRoot, resolve(path))))
    .filter((path) => path && path !== '.' && !path.startsWith('../'));
  const pathspec = exclusions.length ? ['--', '.', ...exclusions.map((path) => `:(exclude)${path}/**`)] : [];
  const head = runGit(repoRoot, ['rev-parse', 'HEAD']) || 'UNKNOWN';
  const branch = runGit(repoRoot, ['branch', '--show-current']) || 'UNKNOWN';
  const status = runGit(repoRoot, ['status', '--porcelain=v1', '-uno', ...pathspec]) ?? 'UNKNOWN';
  const diff = runGit(repoRoot, ['diff', '--binary', '--no-ext-diff', 'HEAD', ...pathspec], true);
  const dirtyFingerprint = status === 'UNKNOWN' || diff === null
    ? 'UNKNOWN'
    : sha256(Buffer.concat([Buffer.from(status, 'utf8'), Buffer.from([0]), diff]));
  return {
    head,
    branch,
    dirty: status.length > 0,
    dirtyFingerprint,
    fingerprintScope: exclusions.length ? 'tracked-worktree-excluding-kit-root' : 'tracked-worktree',
    excludedPaths: exclusions
  };
}

export function findBlender() {
  const candidates = [
    process.env.BLENDER_EXE,
    'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 5.1/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe'
  ].filter(Boolean);
  return candidates.find(existsSync) || null;
}

function issue(code, path, message) {
  return { code, path, message };
}

export function validateManifestShape(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: [issue('MANIFEST_INVALID', '$', 'manifest root must be an object')] };
  }
  if (manifest.schemaVersion !== 1) errors.push(issue('SCHEMA_VERSION', 'schemaVersion', 'expected schemaVersion 1'));
  if (!KIT_ID_RE.test(manifest.kitId || '')) errors.push(issue('KIT_ID', 'kitId', 'kitId must be lower_snake_case'));
  if (!KIT_STATUSES.has(manifest.status)) errors.push(issue('STATUS', 'status', 'unsupported candidate status'));
  if (typeof manifest.displayName !== 'string' || !manifest.displayName.trim()) errors.push(issue('DISPLAY_NAME', 'displayName', 'displayName is required'));

  const pathFields = [
    ['source.glb', manifest.source?.glb],
    ['source.sceneDigest', manifest.source?.sceneDigest],
    ['concept.image', manifest.concept?.image],
    ['collision.output', manifest.collision?.output],
    ['textures.outputDirectory', manifest.textures?.outputDirectory],
    ['evidence.outputDirectory', manifest.evidence?.outputDirectory],
    ['evidence.contactSheet', manifest.evidence?.contactSheet],
    ['evidence.buildReport', manifest.evidence?.buildReport],
    ['evidence.verificationReport', manifest.evidence?.verificationReport],
    ['evidence.artifactIndex', manifest.evidence?.artifactIndex],
    ['evidence.sourceLock', manifest.evidence?.sourceLock],
    ['evidence.provenance', manifest.evidence?.provenance],
    ['evidence.mobileEvidence', manifest.evidence?.mobileEvidence],
    ...((manifest.lods || []).map((lod, index) => [`lods[${index}].output`, lod.output]))
  ];
  for (const [path, value] of pathFields) {
    if (!isSafeRelativePath(value)) errors.push(issue('PATH_INVALID', path, 'must be a safe POSIX path relative to the kit root'));
  }
  const pathValues = pathFields.map(([, value]) => value).filter((value) => typeof value === 'string');
  if (new Set(pathValues).size !== pathValues.length) errors.push(issue('PATH_COLLISION', '$', 'source, output, report, and evidence paths must be unique'));

  for (const [path, value] of [
    ['source.expectedSha256', manifest.source?.expectedSha256],
    ['source.expectedSceneDigestSha256', manifest.source?.expectedSceneDigestSha256],
    ['concept.expectedSha256', manifest.concept?.expectedSha256]
  ]) {
    if (value !== null && !SHA256_RE.test(value || '')) errors.push(issue('HASH_INVALID', path, 'must be null or lowercase SHA-256'));
  }
  if (!/^https:\/\//.test(manifest.source?.publicSceneUrl || '')) errors.push(issue('SCENE_URL', 'source.publicSceneUrl', 'a durable HTTPS public Spline URL is required'));
  if (typeof manifest.source?.documentName !== 'string' || !manifest.source.documentName.trim()) errors.push(issue('DOCUMENT_NAME', 'source.documentName', 'documentName is required'));
  if (typeof manifest.source?.rootObjectId !== 'string' || !manifest.source.rootObjectId) errors.push(issue('ROOT_OBJECT_ID', 'source.rootObjectId', 'rootObjectId is required'));
  if (!Array.isArray(manifest.source?.meshObjectIds) || manifest.source.meshObjectIds.length < 1) errors.push(issue('MESH_OBJECT_IDS', 'source.meshObjectIds', 'at least one mesh object ID is required'));
  if (!Array.isArray(manifest.source?.meshNodeNames) || manifest.source.meshNodeNames.length < 1 || manifest.source.meshNodeNames.some((name) => typeof name !== 'string' || !name)) errors.push(issue('MESH_NODE_NAMES', 'source.meshNodeNames', 'at least one exported GLB mesh node name is required'));
  if (!manifest.source?.generation?.system) errors.push(issue('GENERATION_SYSTEM', 'source.generation.system', 'generation system is required'));
  if (manifest.concept?.pixelsUsedAsTexture !== false) errors.push(issue('CONCEPT_PIXEL_POLICY', 'concept.pixelsUsedAsTexture', 'concept pixels may not be runtime textures'));

  const normalization = manifest.normalization || {};
  if (normalization.runtimeUp !== 'Z') errors.push(issue('RUNTIME_UP', 'normalization.runtimeUp', 'runtime up axis must be Z'));
  if (!['+Y', '-Y'].includes(normalization.runtimeForward)) errors.push(issue('RUNTIME_FORWARD', 'normalization.runtimeForward', 'runtime forward must be +Y or -Y'));
  if (!['height', 'largest-dimension'].includes(normalization.scaleMode)) errors.push(issue('SCALE_MODE', 'normalization.scaleMode', 'unsupported scale mode'));
  if (!(Number(normalization.targetMeters) > 0)) errors.push(issue('TARGET_METERS', 'normalization.targetMeters', 'targetMeters must be positive'));
  if (normalization.centerXY !== true || normalization.groundOrigin !== true) errors.push(issue('NORMALIZATION_CONTRACT', 'normalization', 'centerXY and groundOrigin must both be true'));
  if (!(Number(normalization.toleranceMeters) >= 0.0001 && Number(normalization.toleranceMeters) <= 0.1)) errors.push(issue('NORMALIZATION_TOLERANCE', 'normalization.toleranceMeters', 'toleranceMeters must be 0.0001..0.1'));

  const lods = manifest.lods || [];
  if (lods.length !== 3 || lods.map((lod) => lod.name).join(',') !== 'LOD0,LOD1,LOD2') {
    errors.push(issue('LOD_ORDER', 'lods', 'exactly LOD0, LOD1, LOD2 are required in order'));
  } else {
    for (let index = 0; index < lods.length; index++) {
      const lod = lods[index];
      if (!Number.isInteger(lod.targetTriangles) || lod.targetTriangles < 24) errors.push(issue('LOD_TARGET', `lods[${index}].targetTriangles`, 'must be an integer >=24'));
      if (!Number.isInteger(lod.maxTriangles) || lod.maxTriangles < lod.targetTriangles) errors.push(issue('LOD_MAX', `lods[${index}].maxTriangles`, 'must be >= targetTriangles'));
      if (index && lod.targetTriangles >= lods[index - 1].targetTriangles) errors.push(issue('LOD_TARGET_ORDER', `lods[${index}].targetTriangles`, 'LOD targets must strictly decrease'));
    }
  }
  if (manifest.collision?.mode !== 'convex-hull' || !Number.isInteger(manifest.collision?.maxTriangles)) errors.push(issue('COLLISION', 'collision', 'convex-hull collision and an integer maxTriangles are required'));
  if (!['uv-atlas-not-tileable', 'require-tileable'].includes(manifest.textures?.seamPolicy)) errors.push(issue('SEAM_POLICY', 'textures.seamPolicy', 'unsupported seam policy'));
  if (manifest.textures?.extract !== true) errors.push(issue('TEXTURE_EXTRACTION', 'textures.extract', 'texture extraction must remain enabled'));

  const views = manifest.evidence?.views || [];
  if (views.length !== REQUIRED_VIEWS.length || REQUIRED_VIEWS.some((view) => !views.includes(view))) errors.push(issue('EVIDENCE_VIEWS', 'evidence.views', `required views are ${REQUIRED_VIEWS.join(', ')}`));
  const thumb = manifest.evidence?.thumbnailSize;
  if (!Array.isArray(thumb) || thumb.length !== 2 || thumb.some((value) => !Number.isInteger(value) || value < 256)) errors.push(issue('THUMBNAIL_SIZE', 'evidence.thumbnailSize', 'two dimensions >=256 are required'));

  const budgets = manifest.budgets || {};
  for (const field of ['maxSourceBytes', 'maxSourceTriangles', 'maxMaterials', 'maxTextures', 'maxTextureDimension']) {
    if (!Number.isInteger(budgets[field]) || budgets[field] < 1) errors.push(issue('BUDGET_INVALID', `budgets.${field}`, 'positive integer required'));
  }
  return { ok: errors.length === 0, errors };
}

export function loadManifest(manifestPath) {
  const absolute = resolve(manifestPath);
  const manifest = readJson(absolute);
  const shape = validateManifestShape(manifest);
  if (!shape.ok) {
    const error = new Error(`Invalid model kit manifest:\n${shape.errors.map((entry) => `${entry.code} ${entry.path}: ${entry.message}`).join('\n')}`);
    error.issues = shape.errors;
    throw error;
  }
  return { manifest, manifestPath: absolute, kitRoot: dirname(absolute) };
}

export function validateSceneDigest(digest, manifest) {
  const errors = [];
  const required = ['capturedAtUtc', 'documentName', 'publicSceneUrl', 'rootObjectId', 'meshObjectIds', 'getScene', 'getObjects', 'analyzeScene'];
  for (const field of required) {
    if (digest?.[field] === null || digest?.[field] === undefined || digest?.[field] === '') errors.push(issue('SCENE_DIGEST_FIELD', field, 'required scene evidence is missing'));
  }
  if (digest?.documentName !== manifest.source.documentName) errors.push(issue('SCENE_DOCUMENT_MISMATCH', 'documentName', 'scene digest documentName differs from manifest'));
  if (digest?.publicSceneUrl !== manifest.source.publicSceneUrl) errors.push(issue('SCENE_URL_MISMATCH', 'publicSceneUrl', 'scene digest URL differs from manifest'));
  if (digest?.rootObjectId !== manifest.source.rootObjectId) errors.push(issue('SCENE_ROOT_MISMATCH', 'rootObjectId', 'scene digest root differs from manifest'));
  const expectedMeshes = [...manifest.source.meshObjectIds].sort();
  const actualMeshes = Array.isArray(digest?.meshObjectIds) ? [...digest.meshObjectIds].sort() : [];
  if (JSON.stringify(expectedMeshes) !== JSON.stringify(actualMeshes)) errors.push(issue('SCENE_MESH_MISMATCH', 'meshObjectIds', 'scene digest mesh IDs differ from manifest'));
  if (!Number.isFinite(Date.parse(digest?.capturedAtUtc || ''))) errors.push(issue('SCENE_TIMESTAMP', 'capturedAtUtc', 'capturedAtUtc must be an ISO timestamp'));
  return { ok: errors.length === 0, errors };
}
