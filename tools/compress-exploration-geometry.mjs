#!/usr/bin/env node
/* Build-time Draco pass for the optional Galactic Exploration model pack.
 *
 * The runtime already ships and registers DRACOLoader. This tool deliberately
 * adds no browser code: it turns a reviewed texture-compressed candidate into
 * derived delivery GLBs, while source models remain untouched. Every output is
 * decoded again and compared with its input before the candidate is accepted.
 *
 * Usage:
 *   node tools/compress-exploration-geometry.mjs
 *   node tools/compress-exploration-geometry.mjs --apply
 *   node tools/compress-exploration-geometry.mjs --input <dir> --out <dir> --json <report>
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getBounds, Logger, NodeIO, Verbosity } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3d';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = '.tmp/exploration-optimized';
const DEFAULT_OUTPUT = '.tmp/exploration-draco';
const DEFAULT_REPORT = '.tmp/exploration-draco-report.json';
const EXCLUSION_LEDGER = 'modules/space_exploration/assets/source/EXCLUDED_OVERSIZE_V1.json';
const MB = 1024 * 1024;

const posix = path => path.split(sep).join('/');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const round = value => Number.isFinite(value) ? Number(value.toFixed(8)) : null;

async function walkGlbs(directory, files = []) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) await walkGlbs(absolute, files);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(absolute);
  }
  return files;
}

function primitiveTriangles(primitive) {
  const mode = primitive.getMode();
  const count = primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION')?.getCount() || 0;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function primitiveZeroAreaTriangles(primitive) {
  if (primitive.getMode() !== 4) return 0;
  const position = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  const count = indices?.getCount() || position?.getCount() || 0;
  if (!position) return 0;
  const a = [], b = [], c = [];
  let zeroArea = 0;
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const ai = indices ? indices.getScalar(offset) : offset;
    const bi = indices ? indices.getScalar(offset + 1) : offset + 1;
    const ci = indices ? indices.getScalar(offset + 2) : offset + 2;
    position.getElement(ai, a); position.getElement(bi, b); position.getElement(ci, c);
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const x = aby * acz - abz * acy, y = abz * acx - abx * acz, z = abx * acy - aby * acx;
    if (x * x + y * y + z * z === 0) zeroArea += 1;
  }
  return zeroArea;
}

function propertyNames(values) {
  return values.map(value => value.getName() || '').sort();
}

function sceneBounds(scenes) {
  return scenes.map(scene => {
    const bounds = getBounds(scene);
    return {
      name: scene.getName() || '',
      min: bounds.min.map(round),
      max: bounds.max.map(round)
    };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function nodeTransforms(nodes) {
  return nodes.map(node => ({
    name: node.getName() || '',
    matrix: Array.from(node.getMatrix(), round)
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function textureFingerprints(textures) {
  return textures.map(texture => {
    const image = texture.getImage();
    return {
      name: texture.getName() || '',
      mimeType: texture.getMimeType() || null,
      bytes: image?.byteLength || 0,
      sha256: image ? sha256(image) : null
    };
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function materialSignatures(materials) {
  return materials.map(material => ({
    name: material.getName() || '',
    alphaMode: material.getAlphaMode(),
    alphaCutoff: round(material.getAlphaCutoff()),
    doubleSided: material.getDoubleSided(),
    baseColorFactor: material.getBaseColorFactor().map(round),
    emissiveFactor: material.getEmissiveFactor().map(round),
    metallicFactor: round(material.getMetallicFactor()),
    roughnessFactor: round(material.getRoughnessFactor())
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function summarizeDocument(document) {
  const rootProperty = document.getRoot();
  const scenes = rootProperty.listScenes();
  const nodes = rootProperty.listNodes();
  const meshes = rootProperty.listMeshes();
  const primitives = meshes.flatMap(mesh => mesh.listPrimitives());
  return {
    scenes: scenes.length,
    nodes: nodes.length,
    meshes: meshes.length,
    primitives: primitives.length,
    triangles: primitives.reduce((sum, primitive) => sum + primitiveTriangles(primitive), 0),
    zeroAreaTriangles: primitives.reduce((sum, primitive) => sum + primitiveZeroAreaTriangles(primitive), 0),
    materials: rootProperty.listMaterials().length,
    textures: rootProperty.listTextures().length,
    animations: rootProperty.listAnimations().length,
    skins: rootProperty.listSkins().length,
    cameras: rootProperty.listCameras().length,
    names: {
      scenes: propertyNames(scenes),
      nodes: propertyNames(nodes),
      meshes: propertyNames(meshes),
      materials: propertyNames(rootProperty.listMaterials())
    },
    nodeTransforms: nodeTransforms(nodes),
    sceneBounds: sceneBounds(scenes),
    materialSignatures: materialSignatures(rootProperty.listMaterials()),
    textureFingerprints: textureFingerprints(rootProperty.listTextures()),
    extensionsUsed: rootProperty.listExtensionsUsed().map(extension => extension.extensionName).sort(),
    extensionsRequired: rootProperty.listExtensionsRequired().map(extension => extension.extensionName).sort()
  };
}

function same(label, before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`${label} changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
}

export function assertSceneContract(before, after) {
  for (const key of ['scenes', 'nodes', 'meshes', 'primitives', 'materials', 'textures', 'animations', 'skins', 'cameras']) {
    same(key, before[key], after[key]);
  }
  const removedTriangles = before.triangles - after.triangles;
  if (removedTriangles < 0) throw new Error(`triangles increased: ${before.triangles} -> ${after.triangles}`);
  if (removedTriangles > before.zeroAreaTriangles) {
    throw new Error(`non-degenerate triangles were removed: ${before.triangles} -> ${after.triangles}, but the source has only ${before.zeroAreaTriangles} exact zero-area triangle(s)`);
  }
  if (after.zeroAreaTriangles > before.zeroAreaTriangles) {
    throw new Error(`zero-area triangles increased: ${before.zeroAreaTriangles} -> ${after.zeroAreaTriangles}`);
  }
  same('property names', before.names, after.names);
  same('node transforms', before.nodeTransforms, after.nodeTransforms);
  same('material properties', before.materialSignatures, after.materialSignatures);
  same('texture bytes', before.textureFingerprints, after.textureFingerprints);

  if (before.sceneBounds.length !== after.sceneBounds.length) throw new Error('scene bounds count changed');
  for (let sceneIndex = 0; sceneIndex < before.sceneBounds.length; sceneIndex += 1) {
    const a = before.sceneBounds[sceneIndex];
    const b = after.sceneBounds[sceneIndex];
    if (a.name !== b.name) throw new Error(`scene identity changed at ${sceneIndex}`);
    const span = Math.max(...a.max.map((value, axis) => Math.abs((value ?? 0) - (a.min[axis] ?? 0))), 1);
    const tolerance = span * 0.0002;
    for (const edge of ['min', 'max']) {
      for (let axis = 0; axis < 3; axis += 1) {
        if (a[edge][axis] === null || b[edge][axis] === null || Math.abs(a[edge][axis] - b[edge][axis]) > tolerance) {
          throw new Error(`scene bounds changed beyond ${tolerance} at ${sceneIndex}.${edge}[${axis}]`);
        }
      }
    }
  }
  if (!after.extensionsUsed.includes('KHR_draco_mesh_compression')) {
    throw new Error('output does not declare KHR_draco_mesh_compression');
  }
}

export async function createGeometryIo() {
  const [encoder, decoder] = await Promise.all([
    draco3d.createEncoderModule(),
    draco3d.createDecoderModule()
  ]);
  return new NodeIO()
    .setLogger(new Logger(Verbosity.ERROR))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': encoder,
      'draco3d.decoder': decoder
    });
}

export async function compressGlbBytes(io, sourceBytes, options = {}) {
  const document = await io.readBinary(sourceBytes);
  const before = summarizeDocument(document);
  const alreadyCompressed = before.extensionsUsed.includes('KHR_draco_mesh_compression');
  if (alreadyCompressed) return { bytes: Buffer.from(sourceBytes), before, after: before, alreadyCompressed: true };

  await document.transform(draco({
    method: options.method || 'edgebreaker',
    encodeSpeed: options.encodeSpeed ?? 5,
    decodeSpeed: options.decodeSpeed ?? 5,
    /* Position quantization collapsed thin authored triangles in real Stage 10
       kits. Zero keeps positions lossless while Draco still compresses indices,
       normals and UVs enough to clear the delivery budget. */
    quantizePosition: options.quantizePosition ?? 0,
    quantizeNormal: options.quantizeNormal ?? 10,
    quantizeColor: options.quantizeColor ?? 8,
    quantizeTexcoord: options.quantizeTexcoord ?? 12,
    quantizeGeneric: options.quantizeGeneric ?? 12,
    quantizationVolume: 'mesh'
  }));
  const outputBytes = Buffer.from(await io.writeBinary(document));
  const decoded = await io.readBinary(outputBytes);
  const after = summarizeDocument(decoded);
  assertSceneContract(before, after);
  return { bytes: outputBytes, before, after, alreadyCompressed: false };
}

async function loadExclusions() {
  const data = JSON.parse((await readFile(resolve(root, EXCLUSION_LEDGER), 'utf8')).replace(/^\uFEFF/, ''));
  if (data.runtimeAllowed === true) throw new Error(`${EXCLUSION_LEDGER} permits runtime use; refusing to exclude from it`);
  const paths = new Set();
  const ids = new Set((data.ids || []).map(value => String(value).toLowerCase()));
  for (const entry of data.entries || []) {
    if (entry?.path) paths.add(String(entry.path).replace(/^assets\/runtime\//, ''));
    if (entry?.catalogKey) ids.add(String(entry.catalogKey).toLowerCase());
  }
  return { paths, ids };
}

function excluded(relativePath, rules) {
  const low = relativePath.toLowerCase();
  const stem = low.replace(/\.glb$/, '');
  if (rules.paths.has(relativePath)) return true;
  for (const id of rules.ids) {
    const tail = id.split('/').pop();
    if (stem === id || stem.endsWith(`/${tail}`)) return true;
  }
  return false;
}

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, out: DEFAULT_OUTPUT, report: DEFAULT_REPORT, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') { options.apply = true; continue; }
    if (['--input', '--out', '--json'].includes(flag)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a path`);
      if (flag === '--input') options.input = value;
      else if (flag === '--out') options.out = value;
      else options.report = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${flag}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputRoot = resolve(root, options.input);
  const outputRoot = resolve(root, options.out);
  const reportPath = resolve(root, options.report);
  if (!existsSync(inputRoot)) throw new Error(`input does not exist: ${inputRoot}`);
  if (inputRoot === outputRoot) throw new Error('input and output directories must differ');
  const files = await walkGlbs(inputRoot);
  if (!files.length) throw new Error(`no GLBs found under ${inputRoot}`);
  const exclusions = await loadExclusions();
  const plan = files.map(source => ({ source, relativePath: posix(relative(inputRoot, source)) }))
    .map(entry => ({ ...entry, excluded: excluded(entry.relativePath, exclusions) }));
  const excludedPaths = plan.filter(entry => entry.excluded).map(entry => entry.relativePath);
  console.log(`Input      ${posix(relative(root, inputRoot))}`);
  console.log(`Output     ${posix(relative(root, outputRoot))}`);
  console.log(`Models     ${files.length} found, ${files.length - excludedPaths.length} deliverable, ${excludedPaths.length} excluded by ledger`);
  for (const path of excludedPaths) console.log(`EXCLUDE    ${path}`);
  if (!options.apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to encode the candidate.');
    return;
  }
  if (existsSync(outputRoot)) throw new Error(`output already exists: ${outputRoot}; choose a fresh --out path so stale GLBs cannot survive`);

  const io = await createGeometryIo();
  const records = [];
  const deliverable = plan.filter(entry => !entry.excluded);
  let beforeBytes = 0, afterBytes = 0, encoded = 0, retained = 0;
  for (let index = 0; index < deliverable.length; index += 1) {
    const entry = deliverable[index];
    const sourceBytes = await readFile(entry.source);
    const result = await compressGlbBytes(io, sourceBytes);
    const target = resolve(outputRoot, ...entry.relativePath.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, result.bytes);
    const targetBytes = (await stat(target)).size;
    if (targetBytes !== result.bytes.length) throw new Error(`write length changed for ${entry.relativePath}`);
    beforeBytes += sourceBytes.length;
    afterBytes += targetBytes;
    if (result.alreadyCompressed) retained += 1;
    else encoded += 1;
    records.push({
      path: entry.relativePath,
      sourceBytes: sourceBytes.length,
      outputBytes: targetBytes,
      ratio: Number((sourceBytes.length / targetBytes).toFixed(3)),
      sourceSha256: sha256(sourceBytes),
      outputSha256: sha256(result.bytes),
      alreadyCompressed: result.alreadyCompressed,
      triangles: result.after.triangles,
      removedZeroAreaTriangles: result.before.triangles - result.after.triangles,
      primitives: result.after.primitives,
      sceneContract: 'PASS'
    });
    if ((index + 1) % 25 === 0 || index + 1 === deliverable.length) {
      console.log(`Progress   ${index + 1}/${deliverable.length}  ${(beforeBytes / MB).toFixed(1)} -> ${(afterBytes / MB).toFixed(1)} MiB`);
    }
  }

  const report = {
    schema: 'MassfrontExplorationDracoCompressionV1',
    generatedAt: new Date().toISOString(),
    input: posix(relative(root, inputRoot)),
    output: posix(relative(root, outputRoot)),
    encoder: {
      package: 'draco3d',
      version: '1.5.7',
      transform: '@gltf-transform/functions@4.5.0',
      method: 'edgebreaker',
      quantizePosition: 0,
      quantizeNormal: 10,
      quantizeColor: 8,
      quantizeTexcoord: 12,
      quantizeGeneric: 12
    },
    sourceModels: files.length,
    outputModels: deliverable.length,
    excluded: excludedPaths,
    encoded,
    retainedAlreadyCompressed: retained,
    sourceBytes: beforeBytes,
    outputBytes: afterBytes,
    compressionRatio: Number((beforeBytes / afterBytes).toFixed(3)),
    savedBytes: beforeBytes - afterBytes,
    allSceneContractsPass: records.every(record => record.sceneContract === 'PASS'),
    allOutputsDraco: records.length === deliverable.length,
    records
  };
  if (!report.allSceneContractsPass || !report.allOutputsDraco || encoded + retained !== deliverable.length) {
    throw new Error('compression report invariants failed');
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nPASS       ${deliverable.length} GLBs, ${(beforeBytes / MB).toFixed(2)} -> ${(afterBytes / MB).toFixed(2)} MiB (x${report.compressionRatio})`);
  console.log(`Report     ${posix(relative(root, reportPath))}`);
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  main().catch(error => {
    console.error(`FAIL  ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
