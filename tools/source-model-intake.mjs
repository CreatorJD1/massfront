#!/usr/bin/env node
/*
 * Safe source-model intake for Spline/Hunyuan GLBs.
 *
 * This tool deliberately stops at SOURCE_AUTHORING_ONLY. Runtime admission is
 * a separate topology/LOD/material/device-evidence decision, not something a
 * successful cleanup can imply.
 */
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLENDER_SCRIPT = join(ROOT, 'tools', 'blender', 'source-model-intake.py');
const DEFAULT_REMOVE_NAMES = ['Ground Shadow Catcher'];
const DEFAULT_REMOVE_TYPES = ['CAMERA', 'LIGHT'];
const TOOL_VERSION = '1.1.0';
const GLB_JSON_CHUNK = 0x4E4F534A;
const GLB_BIN_CHUNK = 0x004E4942;
const KNOWN_NON_ALPHA_MATERIAL_EXTENSIONS = new Set([
  'KHR_materials_anisotropy',
  'KHR_materials_clearcoat',
  'KHR_materials_emissive_strength',
  'KHR_materials_ior',
  'KHR_materials_iridescence',
  'KHR_materials_sheen',
  'KHR_materials_specular',
  'KHR_materials_unlit',
]);

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseVector(value, option) {
  const parts = String(value || '').split(',').map(Number);
  if (parts.length !== 3 || parts.some(number => !Number.isFinite(number) || number <= 0)) {
    fail(`${option} requires three positive comma-separated numbers, for example 32,20,32`);
  }
  return parts;
}

function parseArgs(argv) {
  const options = {
    removeNames: [...DEFAULT_REMOVE_NAMES],
    removeRegex: [],
    removeTypes: [...DEFAULT_REMOVE_TYPES],
    fitMode: 'exact',
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value == null || value.startsWith('--')) fail(`${arg} requires a value`);
      return value;
    };
    if (arg === '--input') options.input = next();
    else if (arg === '--output') options.output = next();
    else if (arg === '--report') options.report = next();
    else if (arg === '--target-bounds-m') options.targetBoundsM = parseVector(next(), arg);
    else if (arg === '--fit') options.fitMode = next();
    else if (arg === '--remove-name') options.removeNames.push(next());
    else if (arg === '--remove-regex') options.removeRegex.push(next());
    else if (arg === '--remove-type') options.removeTypes.push(next().toUpperCase());
    else if (arg === '--blender') options.blender = next();
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else fail(`unknown option: ${arg}`);
  }
  return options;
}

function usage() {
  return `Usage:
  node tools/source-model-intake.mjs \\
    --input raw-spline.glb --output model_source.glb \\
    --target-bounds-m 32,20,32 [--fit exact|uniform]

Options:
  --report PATH          Report path (default: OUTPUT.intake.json)
  --remove-name NAME     Remove an exact object name and descendants; repeatable
  --remove-regex REGEX   Remove matching object names and descendants; repeatable
  --remove-type TYPE     Remove an object type in addition to CAMERA/LIGHT
  --blender PATH         Override BLENDER_EXE / configured Blender
  --json                 Print the report JSON

Safety contract:
  INPUT is never changed. OUTPUT and REPORT must not already exist. The staged
  GLB is committed only after bounds, pivot, embedding, and source-only checks
  pass. Opaque conversion is fail-closed: only decoded opaque texture alpha,
  factor alpha 1, no vertex/procedural alpha, and no transparency extension
  may change BLEND to OPAQUE. Unknown or genuine transparency remains BLEND.
  This tool never marks a model runtime-ready.`;
}

function findBlender(override) {
  const candidates = [
    override,
    process.env.BLENDER_EXE,
    'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 4.4/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe',
    'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe',
  ].filter(Boolean).map(value => resolve(value));
  return candidates.find(existsSync) || null;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function parseGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) fail(`${path} is not a GLB`, 1);
  const version = buffer.readUInt32LE(4);
  if (version !== 2) fail(`${path} uses unsupported GLB version ${version}`, 1);
  if (buffer.readUInt32LE(8) !== buffer.length) fail(`${path} has a mismatched GLB byte length`, 1);
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const byteLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + byteLength > buffer.length) fail(`${path} has a truncated GLB chunk`, 1);
    chunks.push({ type, data: buffer.subarray(offset, offset + byteLength) });
    offset += byteLength;
  }
  if (offset !== buffer.length) fail(`${path} has trailing bytes outside GLB chunks`, 1);
  const jsonChunkIndex = chunks.findIndex(chunk => chunk.type === GLB_JSON_CHUNK);
  if (jsonChunkIndex < 0) fail(`${path} has no GLB JSON chunk`, 1);
  const json = JSON.parse(chunks[jsonChunkIndex].data.toString('utf8').replace(/[\0\s]+$/g, ''));
  return { buffer, version, chunks, jsonChunkIndex, json };
}

function writeGlb(parsed, json, outputPath) {
  const jsonRaw = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadding = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPadding, 0x20)]);
  const chunks = parsed.chunks.map((chunk, index) => index === parsed.jsonChunkIndex
    ? { type: GLB_JSON_CHUNK, data: jsonChunk }
    : chunk);
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.allocUnsafe(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  writeFileSync(outputPath, output);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function inspectPngAlpha(payload) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (payload.length < 33 || !payload.subarray(0, 8).equals(signature)) {
    return { status: 'UNKNOWN', reason: 'payload is not a valid PNG signature' };
  }
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let transparentPalette = null;
  const idat = [];
  while (offset + 12 <= payload.length) {
    const length = payload.readUInt32BE(offset);
    const type = payload.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > payload.length) return { status: 'UNKNOWN', reason: 'PNG chunk is truncated' };
    const data = payload.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'tRNS') transparentPalette = data;
    else if (type === 'IEND') break;
    offset = dataEnd + 4;
  }
  const base = { mimeType: 'image/png', width, height, bitDepth, colorType, interlace };
  if (!Number.isInteger(width) || !Number.isInteger(height) || !idat.length) {
    return { ...base, status: 'UNKNOWN', reason: 'PNG header or IDAT data is missing' };
  }
  if (colorType === 0 || colorType === 2) {
    if (transparentPalette) return { ...base, status: 'CONFIRMED_NONOPAQUE', reason: 'PNG tRNS transparency is present' };
    return { ...base, status: 'CONFIRMED_OPAQUE', alphaMin: 255, alphaMax: 255, reason: 'PNG color type has no alpha channel' };
  }
  if (colorType === 3) {
    if (transparentPalette && [...transparentPalette].some(value => value < 255)) {
      return { ...base, status: 'CONFIRMED_NONOPAQUE', reason: 'indexed PNG transparency table contains alpha below 255' };
    }
    return { ...base, status: 'CONFIRMED_OPAQUE', alphaMin: 255, alphaMax: 255, reason: 'indexed PNG has no nonopaque transparency entry' };
  }
  if (![4, 6].includes(colorType) || bitDepth !== 8 || interlace !== 0) {
    return { ...base, status: 'UNKNOWN', reason: 'PNG alpha decoder supports only non-interlaced 8-bit GA/RGBA payloads' };
  }
  const channels = colorType === 6 ? 4 : 2;
  const rowBytes = width * channels;
  let decoded;
  try {
    decoded = inflateSync(Buffer.concat(idat));
  } catch (error) {
    return { ...base, status: 'UNKNOWN', reason: `PNG inflate failed: ${error.message}` };
  }
  if (decoded.length !== height * (rowBytes + 1)) {
    return { ...base, status: 'UNKNOWN', reason: 'PNG scanline byte count is unexpected' };
  }
  const prior = Buffer.alloc(rowBytes);
  let current = Buffer.alloc(rowBytes);
  let alphaMin = 255;
  let alphaMax = 0;
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = decoded[cursor++];
    for (let x = 0; x < rowBytes; x++) {
      const raw = decoded[cursor++];
      const left = x >= channels ? current[x - channels] : 0;
      const up = prior[x];
      const upLeft = x >= channels ? prior[x - channels] : 0;
      if (filter === 0) current[x] = raw;
      else if (filter === 1) current[x] = (raw + left) & 255;
      else if (filter === 2) current[x] = (raw + up) & 255;
      else if (filter === 3) current[x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) current[x] = (raw + paeth(left, up, upLeft)) & 255;
      else return { ...base, status: 'UNKNOWN', reason: `PNG uses unsupported filter ${filter}` };
    }
    for (let x = channels - 1; x < rowBytes; x += channels) {
      alphaMin = Math.min(alphaMin, current[x]);
      alphaMax = Math.max(alphaMax, current[x]);
    }
    current.copy(prior);
    current = Buffer.alloc(rowBytes);
  }
  return alphaMin === 255 && alphaMax === 255
    ? { ...base, status: 'CONFIRMED_OPAQUE', alphaMin, alphaMax, reason: 'every decoded PNG alpha sample is 255' }
    : { ...base, status: 'CONFIRMED_NONOPAQUE', alphaMin, alphaMax, reason: 'decoded PNG alpha contains values below 255' };
}

function imagePayload(parsed, image) {
  const json = parsed.json;
  if (Number.isInteger(image?.bufferView)) {
    const view = json.bufferViews?.[image.bufferView];
    if (!view || (view.buffer ?? 0) !== 0) return { error: 'image bufferView is missing or uses a non-embedded buffer' };
    const bin = parsed.chunks.find(chunk => chunk.type === GLB_BIN_CHUNK)?.data;
    if (!bin) return { error: 'GLB has no BIN chunk for embedded image' };
    const start = view.byteOffset || 0;
    return { payload: bin.subarray(start, start + view.byteLength), source: 'bufferView', mimeType: image.mimeType || null };
  }
  if (typeof image?.uri === 'string' && image.uri.startsWith('data:')) {
    const comma = image.uri.indexOf(',');
    if (comma < 0) return { error: 'image data URI is malformed' };
    const header = image.uri.slice(5, comma);
    const mimeType = header.split(';')[0] || image.mimeType || null;
    try {
      const payload = header.includes(';base64')
        ? Buffer.from(image.uri.slice(comma + 1), 'base64')
        : Buffer.from(decodeURIComponent(image.uri.slice(comma + 1)), 'utf8');
      return { payload, source: 'dataUri', mimeType };
    } catch (error) {
      return { error: `image data URI decode failed: ${error.message}` };
    }
  }
  return { error: 'image payload is external or missing' };
}

function inspectTextureAlpha(parsed, textureIndex) {
  const texture = parsed.json.textures?.[textureIndex];
  if (!texture) return { status: 'UNKNOWN', reason: 'baseColorTexture index is missing' };
  const basisSource = texture.extensions?.KHR_texture_basisu?.source;
  const imageIndex = Number.isInteger(basisSource) ? basisSource : texture.source;
  const image = parsed.json.images?.[imageIndex];
  if (!image) return { status: 'UNKNOWN', reason: 'baseColorTexture image source is missing' };
  const loaded = imagePayload(parsed, image);
  const evidence = { textureIndex, imageIndex, imageName: image.name || null, mimeType: loaded.mimeType || image.mimeType || null };
  if (!loaded.payload) return { ...evidence, status: 'UNKNOWN', reason: loaded.error };
  evidence.payloadSha256 = createHash('sha256').update(loaded.payload).digest('hex').toUpperCase();
  evidence.payloadSource = loaded.source;
  const mime = (evidence.mimeType || '').toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg' || loaded.payload.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) {
    return { ...evidence, status: 'CONFIRMED_OPAQUE', alphaMin: 255, alphaMax: 255, reason: 'JPEG has no alpha channel' };
  }
  if (mime && mime !== 'image/png') return { ...evidence, status: 'UNKNOWN', reason: `unsupported image MIME for alpha proof: ${mime}` };
  return { ...evidence, ...inspectPngAlpha(loaded.payload) };
}

function materialPrimitiveEvidence(json, materialIndex) {
  const primitiveRefs = [];
  let hasVertexAlpha = false;
  for (let meshIndex = 0; meshIndex < (json.meshes || []).length; meshIndex++) {
    const mesh = json.meshes[meshIndex];
    for (let primitiveIndex = 0; primitiveIndex < (mesh.primitives || []).length; primitiveIndex++) {
      const primitive = mesh.primitives[primitiveIndex];
      if ((primitive.material ?? -1) !== materialIndex) continue;
      const colorAccessorIndex = primitive.attributes?.COLOR_0;
      const accessor = Number.isInteger(colorAccessorIndex) ? json.accessors?.[colorAccessorIndex] : null;
      const vertexAlpha = accessor?.type === 'VEC4';
      hasVertexAlpha ||= vertexAlpha;
      primitiveRefs.push({ meshIndex, primitiveIndex, colorAccessorIndex: colorAccessorIndex ?? null, colorAccessorType: accessor?.type || null, vertexAlpha });
    }
  }
  return { hasVertexAlpha, primitiveRefs };
}

function alphaDecision(parsed, material, materialIndex, blenderResult) {
  const alphaMode = material.alphaMode || 'OPAQUE';
  const factor = material.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  const factorAlpha = factor[3] ?? 1;
  const textureIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;
  const textureAlpha = Number.isInteger(textureIndex)
    ? inspectTextureAlpha(parsed, textureIndex)
    : { status: 'CONFIRMED_OPAQUE', alphaMin: 255, alphaMax: 255, reason: 'material has no baseColorTexture' };
  const primitiveEvidence = materialPrimitiveEvidence(parsed.json, materialIndex);
  const graphMatches = (blenderResult.materialAlphaGraphs || []).filter(item => item.materialName === material.name);
  const graph = graphMatches.length === 1 ? graphMatches[0] : null;
  const extensions = material.extensions || {};
  const transmission = extensions.KHR_materials_transmission || {};
  const diffuseTransmission = extensions.KHR_materials_diffuse_transmission || {};
  const hasTransmission = Number(transmission.transmissionFactor || 0) > 0 || Boolean(transmission.transmissionTexture) ||
    Number(diffuseTransmission.diffuseTransmissionFactor || 0) > 0 || Boolean(diffuseTransmission.diffuseTransmissionTexture);
  const unknownExtensions = Object.keys(extensions).filter(name =>
    !KNOWN_NON_ALPHA_MATERIAL_EXTENSIONS.has(name) &&
    !['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_diffuse_transmission'].includes(name));
  const evidence = {
    materialIndex,
    materialName: material.name || null,
    inputAlphaMode: alphaMode,
    baseColorFactorAlpha: factorAlpha,
    textureAlpha,
    primitiveEvidence,
    transparencyExtensions: { hasTransmission, names: Object.keys(extensions) },
    unknownExtensions,
    blenderGraph: graph || { status: 'UNKNOWN', reason: graphMatches.length ? 'material name is ambiguous' : 'no matching Blender alpha graph evidence' },
  };
  if (alphaMode !== 'BLEND') return { ...evidence, action: 'UNCHANGED_NOT_BLEND', outputAlphaMode: alphaMode, proofStatus: 'NOT_APPLICABLE' };
  if (factorAlpha < 0.999999) return { ...evidence, action: 'PRESERVE_BLEND_GENUINE_FACTOR_ALPHA', outputAlphaMode: 'BLEND', proofStatus: 'CONFIRMED_TRANSPARENCY' };
  if (hasTransmission) return { ...evidence, action: 'PRESERVE_BLEND_GENUINE_TRANSMISSION', outputAlphaMode: 'BLEND', proofStatus: 'CONFIRMED_TRANSPARENCY' };
  if (primitiveEvidence.hasVertexAlpha || graph?.vertexAlpha) return { ...evidence, action: 'PRESERVE_BLEND_VERTEX_ALPHA', outputAlphaMode: 'BLEND', proofStatus: 'UNKNOWN_OR_VERTEX_ALPHA' };
  if (graph?.proceduralOrUnknownAlpha) return { ...evidence, action: 'PRESERVE_BLEND_UNKNOWN_PROCEDURAL_ALPHA', outputAlphaMode: 'BLEND', proofStatus: 'UNKNOWN' };
  if (!graph) return { ...evidence, action: 'PRESERVE_BLEND_UNKNOWN_GRAPH', outputAlphaMode: 'BLEND', proofStatus: 'UNKNOWN' };
  if (unknownExtensions.length) return { ...evidence, action: 'PRESERVE_BLEND_UNKNOWN_EXTENSION', outputAlphaMode: 'BLEND', proofStatus: 'UNKNOWN' };
  if (textureAlpha.status === 'CONFIRMED_NONOPAQUE') return { ...evidence, action: 'PRESERVE_BLEND_GENUINE_TEXTURE_ALPHA', outputAlphaMode: 'BLEND', proofStatus: 'CONFIRMED_TRANSPARENCY' };
  if (textureAlpha.status !== 'CONFIRMED_OPAQUE') return { ...evidence, action: 'PRESERVE_BLEND_UNKNOWN_TEXTURE_ALPHA', outputAlphaMode: 'BLEND', proofStatus: 'UNKNOWN' };
  if (graph.alphaDefault != null && graph.alphaDefault < 0.999999) return { ...evidence, action: 'PRESERVE_BLEND_GENUINE_GRAPH_FACTOR_ALPHA', outputAlphaMode: 'BLEND', proofStatus: 'CONFIRMED_TRANSPARENCY' };
  return { ...evidence, action: 'REWRITE_OPAQUE_CONFIRMED', outputAlphaMode: 'OPAQUE', proofStatus: 'CONFIRMED_OPAQUE' };
}

function sanitizeOpaqueBlendGlb(inputPath, outputPath, blenderResult) {
  const parsed = parseGlb(inputPath);
  const expectedJson = JSON.parse(JSON.stringify(parsed.json));
  const decisions = (parsed.json.materials || []).map((material, index) => alphaDecision(parsed, material, index, blenderResult));
  for (const decision of decisions) {
    if (decision.action === 'REWRITE_OPAQUE_CONFIRMED') {
      parsed.json.materials[decision.materialIndex].alphaMode = 'OPAQUE';
      expectedJson.materials[decision.materialIndex].alphaMode = 'OPAQUE';
    }
  }
  writeGlb(parsed, parsed.json, outputPath);
  const beforeBin = parsed.chunks.filter(chunk => chunk.type !== GLB_JSON_CHUNK).map(chunk => createHash('sha256').update(chunk.data).digest('hex').toUpperCase());
  const after = parseGlb(outputPath);
  const afterBin = after.chunks.filter(chunk => chunk.type !== GLB_JSON_CHUNK).map(chunk => createHash('sha256').update(chunk.data).digest('hex').toUpperCase());
  return {
    policy: 'BLEND_TO_OPAQUE_ONLY_WHEN_FACTOR_TEXTURE_VERTEX_EXTENSION_AND_BLENDER_GRAPH_EVIDENCE_PROVE_OPACITY',
    inputStagedSha256: sha256(inputPath),
    outputStagedSha256: sha256(outputPath),
    nonJsonChunkHashesBefore: beforeBin,
    nonJsonChunkHashesAfter: afterBin,
    nonJsonChunksPreserved: JSON.stringify(beforeBin) === JSON.stringify(afterBin),
    jsonMatchesPlannedAlphaChanges: JSON.stringify(after.json) === JSON.stringify(expectedJson),
    decisions,
    summary: {
      blendMaterials: decisions.filter(item => item.inputAlphaMode === 'BLEND').length,
      rewrittenOpaque: decisions.filter(item => item.action === 'REWRITE_OPAQUE_CONFIRMED').length,
      preservedBlendGenuine: decisions.filter(item => item.action.startsWith('PRESERVE_BLEND_GENUINE')).length,
      preservedBlendUnknownOrVertex: decisions.filter(item => item.action.startsWith('PRESERVE_BLEND_UNKNOWN') || item.action === 'PRESERVE_BLEND_VERTEX_ALPHA').length,
    },
  };
}

function inspectGlb(path) {
  const parsed = parseGlb(path);
  const { buffer, version, json } = parsed;
  const accessors = json.accessors || [];
  let vertices = 0;
  let triangles = 0;
  let primitives = 0;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      primitives++;
      const position = accessors[primitive.attributes?.POSITION];
      if (position) {
        vertices += position.count || 0;
        if (position.min && position.max) {
          for (let axis = 0; axis < 3; axis++) {
            minimum[axis] = Math.min(minimum[axis], position.min[axis]);
            maximum[axis] = Math.max(maximum[axis], position.max[axis]);
          }
        }
      }
      const indices = accessors[primitive.indices];
      triangles += Math.round((indices?.count || position?.count || 0) / 3);
    }
  }
  if (minimum.some(value => !Number.isFinite(value)) || maximum.some(value => !Number.isFinite(value))) {
    fail('staged GLB has no finite POSITION bounds', 1);
  }
  const uris = [];
  for (const value of [...(json.buffers || []), ...(json.images || [])]) {
    if (typeof value.uri === 'string' && !value.uri.startsWith('data:')) uris.push(value.uri);
  }
  const dimensions = maximum.map((value, axis) => value - minimum[axis]);
  return {
    glbVersion: version,
    generator: json.asset?.generator || null,
    bytes: statSync(path).size,
    scenes: (json.scenes || []).length,
    nodes: (json.nodes || []).length,
    meshes: (json.meshes || []).length,
    primitives,
    vertices,
    triangles,
    materials: (json.materials || []).length,
    materialNames: (json.materials || []).map(material => material.name || null),
    materialAlphaModes: (json.materials || []).map(material => material.alphaMode || 'OPAQUE'),
    textures: (json.textures || []).length,
    images: (json.images || []).length,
    externalUris: uris,
    bounds: { min: minimum, max: maximum, dimensions },
  };
}

function closeEnough(actual, expected) {
  return Math.abs(actual - expected) <= Math.max(0.0001, Math.abs(expected) * 0.00002);
}

function obviousRuntimePath(path) {
  const rel = relative(ROOT, path).replaceAll('\\', '/').toLowerCase();
  return rel === 'www' || rel.startsWith('www/') || rel === 'dist' || rel.startsWith('dist/') ||
    rel.startsWith('android/app/src/main/assets/') || rel.startsWith('ios/app/app/public/');
}

function validateOptions(options) {
  if (!options.input || !options.output || !options.targetBoundsM) fail('required: --input, --output, and --target-bounds-m');
  if (!['exact', 'uniform'].includes(options.fitMode)) fail('--fit must be exact or uniform');
  const input = resolve(options.input);
  const output = resolve(options.output);
  const report = resolve(options.report || output.replace(/\.glb$/i, '') + '.intake.json');
  if (!existsSync(input)) fail(`input does not exist: ${input}`);
  if (extname(input).toLowerCase() !== '.glb' || extname(output).toLowerCase() !== '.glb') fail('input and output must be .glb files');
  if (input.toLowerCase() === output.toLowerCase()) fail('in-place intake is forbidden; choose a separate output path');
  if (existsSync(output)) fail(`output already exists; intake will not overwrite it: ${output}`);
  if (existsSync(report)) fail(`report already exists; intake will not overwrite it: ${report}`);
  if (obviousRuntimePath(output)) fail(`source-only intake refuses packaged runtime paths: ${output}`);
  return { input, output, report };
}

function run(options) {
  const paths = validateOptions(options);
  const blender = findBlender(options.blender);
  if (!blender) fail('Blender was not found. Set BLENDER_EXE or pass --blender.', 3);
  const scratch = mkdtempSync(join(tmpdir(), 'mf-source-model-intake-'));
  const blenderStagedOutputPath = join(scratch, 'blender-staged.glb');
  const stagedOutputPath = join(scratch, 'sanitized-staged.glb');
  const configPath = join(scratch, 'config.json');
  const blenderResultPath = join(scratch, 'blender-result.json');
  const inputHashBefore = sha256(paths.input);
  try {
    writeFileSync(configPath, JSON.stringify({
      inputPath: paths.input,
      stagedOutputPath: blenderStagedOutputPath,
      targetBoundsM: options.targetBoundsM,
      fitMode: options.fitMode,
      removeNames: [...new Set(options.removeNames)],
      removeRegex: [...new Set(options.removeRegex)],
      removeTypes: [...new Set(options.removeTypes)],
    }, null, 2));
    const child = spawnSync(blender, [
      '--background', '--factory-startup', '--python', BLENDER_SCRIPT,
      '--', configPath, blenderResultPath,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (child.error) fail(`Blender failed to start: ${child.error.message}`, 3);
    if (child.status !== 0 || !existsSync(blenderResultPath) || !existsSync(blenderStagedOutputPath)) {
      const tail = `${child.stdout || ''}\n${child.stderr || ''}`.trim().slice(-4000);
      fail(`Blender intake failed (${child.status ?? 'no status'}):\n${tail}`, 1);
    }
    if (sha256(paths.input) !== inputHashBefore) fail('input hash changed during intake; output was not committed', 1);
    const blenderResult = JSON.parse(readFileSync(blenderResultPath, 'utf8'));
    const alphaSanitization = sanitizeOpaqueBlendGlb(blenderStagedOutputPath, stagedOutputPath, blenderResult);
    if (!alphaSanitization.nonJsonChunksPreserved) fail('alpha sanitizer changed a non-JSON GLB chunk', 1);
    if (!alphaSanitization.jsonMatchesPlannedAlphaChanges) fail('alpha sanitizer changed GLB JSON beyond planned alphaMode decisions', 1);
    const glb = inspectGlb(stagedOutputPath);
    const target = options.targetBoundsM;
    const dimensionsOk = options.fitMode === 'exact'
      ? glb.bounds.dimensions.every((value, axis) => closeEnough(value, target[axis]))
      : glb.bounds.dimensions.every((value, axis) => value <= target[axis] + 0.0001);
    const floorCenterOk = closeEnough(glb.bounds.min[1], 0) &&
      closeEnough((glb.bounds.min[0] + glb.bounds.max[0]) * 0.5, 0) &&
      closeEnough((glb.bounds.min[2] + glb.bounds.max[2]) * 0.5, 0);
    const embeddedOk = glb.externalUris.length === 0;
    if (!dimensionsOk || !floorCenterOk || !embeddedOk) {
      fail(`staged GLB failed validation: bounds=${dimensionsOk}, floorCenter=${floorCenterOk}, embedded=${embeddedOk}`, 1);
    }
    mkdirSync(dirname(paths.output), { recursive: true });
    mkdirSync(dirname(paths.report), { recursive: true });
    renameSync(stagedOutputPath, paths.output);
    const report = {
      schemaVersion: 2,
      tool: 'MASSFRONT_SOURCE_MODEL_INTAKE',
      toolVersion: TOOL_VERSION,
      status: 'SOURCE_AUTHORING_ONLY',
      runtimeReady: false,
      runtimeEvidence: 'UNKNOWN',
      createdAt: new Date().toISOString(),
      input: { path: paths.input, bytes: statSync(paths.input).size, sha256: inputHashBefore },
      output: { path: paths.output, bytes: statSync(paths.output).size, sha256: sha256(paths.output) },
      reportPath: paths.report,
      contract: {
        coordinateSystem: 'GLTF_Y_UP',
        units: 'meters',
        targetBoundsM: target,
        fitMode: options.fitMode,
        pivot: 'FLOOR_CENTER',
      },
      cleanup: {
        removeNames: [...new Set(options.removeNames)],
        removeRegex: [...new Set(options.removeRegex)],
        removeTypes: [...new Set(options.removeTypes)],
        removedObjects: blenderResult.removed,
      },
      imported: blenderResult.imported,
      normalized: blenderResult.normalization,
      alphaSanitization,
      glb,
      checks: {
        inputUnchanged: true,
        targetBounds: dimensionsOk,
        floorCenterPivot: floorCenterOk,
        selfContainedGlb: embeddedOk,
        intendedMeshCountPreservedAfterCleanup: glb.meshes === blenderResult.exported.meshCount,
        alphaDecisionsRecorded: alphaSanitization.decisions.length === glb.materials,
        alphaSanitizerPreservedGeometryAndTextureChunks: alphaSanitization.nonJsonChunksPreserved,
        alphaSanitizerChangedOnlyPlannedMetadata: alphaSanitization.jsonMatchesPlannedAlphaChanges,
        unknownTransparencyPreserved: alphaSanitization.decisions
          .filter(item => item.proofStatus === 'UNKNOWN' || item.proofStatus === 'UNKNOWN_OR_VERTEX_ALPHA')
          .every(item => item.outputAlphaMode === 'BLEND'),
        genuineTransparencyPreserved: alphaSanitization.decisions
          .filter(item => item.proofStatus === 'CONFIRMED_TRANSPARENCY')
          .every(item => item.outputAlphaMode === 'BLEND'),
      },
      blockers: [
        'RUNTIME_ADMISSION_NOT_EVALUATED',
        'LOD_TOPOLOGY_MATERIAL_COLLISION_NAV_AND_DEVICE_EVIDENCE_REQUIRED',
      ],
    };
    writeFileSync(paths.report, JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = run(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`PASS source-model intake: ${report.output.path}`);
    console.log(`  SHA256 ${report.output.sha256}`);
    console.log(`  ${report.glb.meshes} meshes, ${report.glb.materials} materials, ${report.glb.triangles} triangles`);
    console.log(`  bounds ${report.glb.bounds.dimensions.map(value => value.toFixed(4)).join(' x ')} m; pivot floor-center`);
    console.log(`  alpha ${report.alphaSanitization.summary.rewrittenOpaque} proven opaque BLEND material(s) rewritten; ${report.alphaSanitization.summary.preservedBlendGenuine + report.alphaSanitization.summary.preservedBlendUnknownOrVertex} BLEND material(s) preserved`);
    console.log(`  report ${report.reportPath}`);
    console.log('  runtimeReady false (source-only intake)');
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL source-model intake: ${error.message}`);
    process.exitCode = error.exitCode || 1;
  }
}

export { findBlender, inspectGlb, parseArgs, run, sanitizeOpaqueBlendGlb };
