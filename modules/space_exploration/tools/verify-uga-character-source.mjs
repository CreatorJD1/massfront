import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const TRIANGLES_MODE = 4;
const UNLIT_EXTENSION = 'KHR_materials_unlit';

const COMPONENTS_PER_TYPE = Object.freeze({
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
});

const COMPONENT_INFO = Object.freeze({
  5120: { bytes: 1, getter: 'getInt8', integer: true },
  5121: { bytes: 1, getter: 'getUint8', integer: true },
  5122: { bytes: 2, getter: 'getInt16', integer: true },
  5123: { bytes: 2, getter: 'getUint16', integer: true },
  5125: { bytes: 4, getter: 'getUint32', integer: true },
  5126: { bytes: 4, getter: 'getFloat32', integer: false }
});

const LOD_TRIANGLE_BUDGETS = Object.freeze({
  cinematicLod0: { min: 25_000, max: 40_000 },
  shipLod1: { min: 8_000, max: 12_000 },
  distantLod2: { min: 2_500, max: 3_000 }
});

const defaultInput = fileURLToPath(new URL(
  '../assets/source/spline/characters/uga-anime-human-master-v1/uga-anime-human-master-v1-source.glb',
  import.meta.url
));

function parseArguments(argv) {
  const args = [...argv];
  let input = defaultInput;
  let reportPath = '';
  let compact = false;
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--report') {
      if (!args[index + 1]) throw new Error('--report requires a path');
      reportPath = resolve(args[++index]);
    } else if (value === '--compact') {
      compact = true;
    } else if (value.startsWith('--')) {
      throw new Error(`Unknown option: ${value}`);
    } else {
      input = resolve(value);
    }
  }
  return { input, reportPath, compact };
}

function pushCheck(checks, id, pass, details) {
  checks.push({ id, status: pass ? 'PASS' : 'FAIL', details });
  return pass;
}

function parseGlb(fileBuffer) {
  if (fileBuffer.byteLength < 20) throw new Error('File is too small to be a GLB 2.0 container');
  const view = new DataView(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (magic !== GLB_MAGIC) throw new Error(`Invalid GLB magic 0x${magic.toString(16)}`);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}; expected 2`);
  if (declaredLength !== fileBuffer.byteLength) {
    throw new Error(`GLB declared length ${declaredLength} differs from file length ${fileBuffer.byteLength}`);
  }

  const chunks = [];
  let cursor = 12;
  while (cursor < declaredLength) {
    if (cursor + 8 > declaredLength) throw new Error('Truncated GLB chunk header');
    const length = view.getUint32(cursor, true);
    const type = view.getUint32(cursor + 4, true);
    const start = cursor + 8;
    const end = start + length;
    if (end > declaredLength) throw new Error(`GLB chunk overruns container at byte ${cursor}`);
    chunks.push({ type, length, data: fileBuffer.subarray(start, end) });
    cursor = end;
  }
  if (cursor !== declaredLength) throw new Error('GLB chunk table does not consume the declared container length');

  const jsonChunks = chunks.filter(chunk => chunk.type === GLB_JSON_CHUNK);
  const binChunks = chunks.filter(chunk => chunk.type === GLB_BIN_CHUNK);
  if (jsonChunks.length !== 1) throw new Error(`Expected exactly one JSON chunk, found ${jsonChunks.length}`);
  if (chunks[0]?.type !== GLB_JSON_CHUNK) throw new Error('The first GLB chunk must be JSON');
  if (binChunks.length > 1) throw new Error(`Expected at most one BIN chunk, found ${binChunks.length}`);

  const jsonText = new TextDecoder().decode(jsonChunks[0].data).replace(/[\u0000\u0020]+$/g, '');
  const gltf = JSON.parse(jsonText);
  return {
    gltf,
    binaryChunk: binChunks[0]?.data || Buffer.alloc(0),
    container: {
      version,
      declaredLength,
      chunkCount: chunks.length,
      jsonBytes: jsonChunks[0].length,
      binaryBytes: binChunks[0]?.length || 0
    }
  };
}

function isEmbeddedUri(uri) {
  return typeof uri === 'string' && uri.startsWith('data:');
}

function getBufferData(gltf, binaryChunk, bufferIndex) {
  const definition = gltf.buffers?.[bufferIndex];
  if (!definition) throw new Error(`Missing buffer ${bufferIndex}`);
  if (definition.uri === undefined && bufferIndex === 0) return binaryChunk;
  if (isEmbeddedUri(definition.uri)) {
    const match = /^data:[^,]*;base64,(.*)$/s.exec(definition.uri);
    if (!match) throw new Error(`Buffer ${bufferIndex} uses a non-base64 data URI`);
    return Buffer.from(match[1], 'base64');
  }
  throw new Error(`Buffer ${bufferIndex} is external and cannot be verified as self-contained`);
}

function accessorLayout(gltf, binaryChunk, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`);
  if (accessor.sparse) throw new Error(`Accessor ${accessorIndex} is sparse; this source verifier requires dense geometry`);
  if (!Number.isInteger(accessor.count) || accessor.count < 0) {
    throw new Error(`Accessor ${accessorIndex} has invalid count ${accessor.count}`);
  }
  const component = COMPONENT_INFO[accessor.componentType];
  const componentCount = COMPONENTS_PER_TYPE[accessor.type];
  if (!component) throw new Error(`Accessor ${accessorIndex} has unsupported component type ${accessor.componentType}`);
  if (!componentCount) throw new Error(`Accessor ${accessorIndex} has unsupported type ${accessor.type}`);
  if (!Number.isInteger(accessor.bufferView)) throw new Error(`Accessor ${accessorIndex} has no dense bufferView`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) throw new Error(`Accessor ${accessorIndex} references missing bufferView ${accessor.bufferView}`);
  const source = getBufferData(gltf, binaryChunk, bufferView.buffer || 0);
  const elementBytes = component.bytes * componentCount;
  const stride = bufferView.byteStride || elementBytes;
  if (stride < elementBytes) throw new Error(`Accessor ${accessorIndex} byteStride ${stride} is smaller than element size ${elementBytes}`);
  const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const requiredBytes = accessor.count === 0 ? 0 : ((accessor.count - 1) * stride + elementBytes);
  const viewEnd = (bufferView.byteOffset || 0) + bufferView.byteLength;
  if (byteOffset < (bufferView.byteOffset || 0) || byteOffset + requiredBytes > viewEnd) {
    throw new Error(`Accessor ${accessorIndex} overruns bufferView ${accessor.bufferView}`);
  }
  if (byteOffset + requiredBytes > source.byteLength) {
    throw new Error(`Accessor ${accessorIndex} overruns buffer ${bufferView.buffer || 0}`);
  }
  return { accessor, component, componentCount, source, byteOffset, stride };
}

function readAccessorValues(gltf, binaryChunk, accessorIndex, visitor) {
  const layout = accessorLayout(gltf, binaryChunk, accessorIndex);
  const view = new DataView(layout.source.buffer, layout.source.byteOffset, layout.source.byteLength);
  for (let elementIndex = 0; elementIndex < layout.accessor.count; elementIndex++) {
    const base = layout.byteOffset + elementIndex * layout.stride;
    for (let componentIndex = 0; componentIndex < layout.componentCount; componentIndex++) {
      const offset = base + componentIndex * layout.component.bytes;
      const value = view[layout.component.getter](offset, true);
      visitor(value, elementIndex, componentIndex, layout);
    }
  }
  return layout;
}

function inspectAccessors(gltf, binaryChunk) {
  const errors = [];
  for (let index = 0; index < (gltf.accessors?.length || 0); index++) {
    try {
      readAccessorValues(gltf, binaryChunk, index, (value, elementIndex, componentIndex, layout) => {
        if (!layout.component.integer && !Number.isFinite(value)) {
          throw new Error(`Accessor ${index} contains non-finite value at element ${elementIndex}, component ${componentIndex}`);
        }
      });
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

function inspectPositionBounds(gltf, binaryChunk) {
  const positionAccessors = new Set();
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (Number.isInteger(primitive.attributes?.POSITION)) positionAccessors.add(primitive.attributes.POSITION);
    }
  }
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  let vertexCount = 0;
  const errors = [];
  for (const accessorIndex of positionAccessors) {
    try {
      const layout = accessorLayout(gltf, binaryChunk, accessorIndex);
      if (layout.accessor.type !== 'VEC3' || layout.accessor.componentType !== 5126) {
        throw new Error(`POSITION accessor ${accessorIndex} must use FLOAT VEC3`);
      }
      readAccessorValues(gltf, binaryChunk, accessorIndex, (value, _elementIndex, componentIndex) => {
        if (!Number.isFinite(value)) throw new Error(`POSITION accessor ${accessorIndex} contains a non-finite coordinate`);
        minimum[componentIndex] = Math.min(minimum[componentIndex], value);
        maximum[componentIndex] = Math.max(maximum[componentIndex], value);
      });
      vertexCount += layout.accessor.count;
      const declared = [...(layout.accessor.min || []), ...(layout.accessor.max || [])];
      if (declared.some(value => !Number.isFinite(value))) {
        throw new Error(`POSITION accessor ${accessorIndex} declares non-finite bounds`);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  const finite = vertexCount > 0 && [...minimum, ...maximum].every(Number.isFinite);
  return {
    positionAccessorCount: positionAccessors.size,
    vertexCount,
    minimum: finite ? minimum : null,
    maximum: finite ? maximum : null,
    dimensions: finite ? maximum.map((value, index) => value - minimum[index]) : null,
    finite,
    errors
  };
}

function inspectTriangles(gltf, binaryChunk) {
  let primitiveCount = 0;
  let trianglePrimitiveCount = 0;
  let indexedTrianglePrimitiveCount = 0;
  let triangleCount = 0;
  const errors = [];

  for (let meshIndex = 0; meshIndex < (gltf.meshes?.length || 0); meshIndex++) {
    const mesh = gltf.meshes[meshIndex];
    for (let primitiveIndex = 0; primitiveIndex < (mesh.primitives?.length || 0); primitiveIndex++) {
      primitiveCount++;
      const primitive = mesh.primitives[primitiveIndex];
      const label = `mesh ${meshIndex} primitive ${primitiveIndex}`;
      const mode = primitive.mode ?? TRIANGLES_MODE;
      if (mode !== TRIANGLES_MODE) {
        errors.push(`${label} uses mode ${mode}; only indexed TRIANGLES are accepted for this character source`);
        continue;
      }
      trianglePrimitiveCount++;
      const positionIndex = primitive.attributes?.POSITION;
      if (!Number.isInteger(positionIndex)) {
        errors.push(`${label} has no POSITION accessor`);
        continue;
      }
      let positionCount = 0;
      try {
        positionCount = accessorLayout(gltf, binaryChunk, positionIndex).accessor.count;
      } catch (error) {
        errors.push(error.message);
        continue;
      }
      if (!Number.isInteger(primitive.indices)) {
        errors.push(`${label} is not indexed`);
        continue;
      }
      indexedTrianglePrimitiveCount++;
      try {
        const indexLayout = accessorLayout(gltf, binaryChunk, primitive.indices);
        if (indexLayout.accessor.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indexLayout.accessor.componentType)) {
          throw new Error(`${label} index accessor must use unsigned SCALAR values`);
        }
        if (indexLayout.accessor.count % 3 !== 0) {
          throw new Error(`${label} index count ${indexLayout.accessor.count} is not divisible by three`);
        }
        let maximumIndex = -1;
        readAccessorValues(gltf, binaryChunk, primitive.indices, value => {
          maximumIndex = Math.max(maximumIndex, value);
        });
        if (maximumIndex >= positionCount) {
          throw new Error(`${label} index ${maximumIndex} exceeds POSITION count ${positionCount}`);
        }
        triangleCount += indexLayout.accessor.count / 3;
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  return {
    primitiveCount,
    trianglePrimitiveCount,
    indexedTrianglePrimitiveCount,
    triangleCount,
    completeIndexedTriangles: primitiveCount > 0 &&
      primitiveCount === indexedTrianglePrimitiveCount &&
      errors.length === 0,
    errors
  };
}

function inspectEmbeddedResources(gltf, binaryChunk) {
  const externalUris = [];
  const errors = [];
  let embeddedBufferCount = 0;
  let embeddedImageCount = 0;
  let bufferViewImageCount = 0;

  for (let index = 0; index < (gltf.buffers?.length || 0); index++) {
    const buffer = gltf.buffers[index];
    if (buffer.uri === undefined || isEmbeddedUri(buffer.uri)) {
      embeddedBufferCount++;
      try {
        const data = getBufferData(gltf, binaryChunk, index);
        const padding = data.byteLength - buffer.byteLength;
        if (!Number.isInteger(buffer.byteLength) || buffer.byteLength < 0) {
          errors.push(`Buffer ${index} has invalid byteLength ${buffer.byteLength}`);
        } else if (padding < 0 || padding > 3) {
          errors.push(`Buffer ${index} payload length ${data.byteLength} is incompatible with declared byteLength ${buffer.byteLength}`);
        }
      } catch (error) {
        errors.push(error.message);
      }
    } else externalUris.push({ kind: 'buffer', index, uri: buffer.uri });
  }
  for (let index = 0; index < (gltf.images?.length || 0); index++) {
    const image = gltf.images[index];
    if (Number.isInteger(image.bufferView)) {
      embeddedImageCount++;
      bufferViewImageCount++;
      const view = gltf.bufferViews?.[image.bufferView];
      if (!view || !Number.isInteger(view.byteLength) || view.byteLength <= 0) {
        errors.push(`Image ${index} references an invalid or empty bufferView ${image.bufferView}`);
      }
      if (typeof image.mimeType !== 'string' || !image.mimeType.startsWith('image/')) {
        errors.push(`Image ${index} embedded by bufferView has no valid image MIME type`);
      }
    } else if (isEmbeddedUri(image.uri)) {
      embeddedImageCount++;
    } else {
      externalUris.push({ kind: 'image', index, uri: image.uri ?? null });
    }
  }
  for (let index = 0; index < (gltf.textures?.length || 0); index++) {
    const texture = gltf.textures[index];
    const source = texture.source ?? texture.extensions?.KHR_texture_basisu?.source;
    if (!Number.isInteger(source) || source < 0 || source >= (gltf.images?.length || 0)) {
      errors.push(`Texture ${index} references missing image ${source}`);
    }
  }

  const allImagesEmbedded = (gltf.images?.length || 0) > 0 && embeddedImageCount === gltf.images.length;
  return {
    bufferCount: gltf.buffers?.length || 0,
    embeddedBufferCount,
    imageCount: gltf.images?.length || 0,
    embeddedImageCount,
    bufferViewImageCount,
    externalUris,
    errors,
    allImagesEmbedded,
    selfContained: externalUris.length === 0 && errors.length === 0 && allImagesEmbedded
  };
}

function inspectUnlit(gltf) {
  const used = new Set(gltf.extensionsUsed || []);
  const required = new Set(gltf.extensionsRequired || []);
  const materialIndexes = [];
  for (let index = 0; index < (gltf.materials?.length || 0); index++) {
    if (gltf.materials[index].extensions?.[UNLIT_EXTENSION] !== undefined) materialIndexes.push(index);
  }
  const consistent = materialIndexes.length === 0
    ? !required.has(UNLIT_EXTENSION)
    : used.has(UNLIT_EXTENSION);
  return {
    extension: UNLIT_EXTENSION,
    declaredUsed: used.has(UNLIT_EXTENSION),
    declaredRequired: required.has(UNLIT_EXTENSION),
    materialIndexes,
    materialCount: materialIndexes.length,
    consistent
  };
}

function inspectSceneGraph(gltf) {
  const errors = [];
  const nodeCount = gltf.nodes?.length || 0;
  const meshCount = gltf.meshes?.length || 0;
  for (let index = 0; index < nodeCount; index++) {
    const node = gltf.nodes[index];
    if (node.mesh !== undefined && (!Number.isInteger(node.mesh) || node.mesh < 0 || node.mesh >= meshCount)) {
      errors.push(`Node ${index} references missing mesh ${node.mesh}`);
    }
    for (const child of node.children || []) {
      if (!Number.isInteger(child) || child < 0 || child >= nodeCount) errors.push(`Node ${index} references missing child ${child}`);
    }
  }
  for (let index = 0; index < (gltf.scenes?.length || 0); index++) {
    for (const node of gltf.scenes[index].nodes || []) {
      if (!Number.isInteger(node) || node < 0 || node >= nodeCount) errors.push(`Scene ${index} references missing root node ${node}`);
    }
  }
  if (gltf.scene !== undefined && (!Number.isInteger(gltf.scene) || gltf.scene < 0 || gltf.scene >= (gltf.scenes?.length || 0))) {
    errors.push(`Default scene ${gltf.scene} does not exist`);
  }
  return { errors, valid: errors.length === 0 };
}

function classifyRuntimeUse(triangleCount) {
  const maxRuntimeTriangles = LOD_TRIANGLE_BUDGETS.cinematicLod0.max;
  if (triangleCount > maxRuntimeTriangles) {
    return {
      classification: 'SOURCE_ONLY_RETOPOLOGY_REQUIRED',
      sourceOnly: true,
      exceedsCinematicMaxBy: triangleCount - maxRuntimeTriangles,
      exceedsCinematicMaxRatio: Number((triangleCount / maxRuntimeTriangles).toFixed(3)),
      budgets: LOD_TRIANGLE_BUDGETS
    };
  }
  return {
    classification: 'RUNTIME_LOD0_CANDIDATE_REQUIRES_VISUAL_AND_PERFORMANCE_REVIEW',
    sourceOnly: false,
    exceedsCinematicMaxBy: 0,
    exceedsCinematicMaxRatio: Number((triangleCount / maxRuntimeTriangles).toFixed(3)),
    budgets: LOD_TRIANGLE_BUDGETS
  };
}

function findPoseMetadata(gltf) {
  const records = [];
  const visit = (kind, index, extras) => {
    if (!extras || typeof extras !== 'object') return;
    const candidate = {};
    for (const key of [
      'strictTPose', 'tPose', 'intendedPose', 'authoringPose', 'pose',
      'styleProfile', 'styleProfileId', 'characterId', 'sourceTool', 'sourceRootId', 'sourceObjectId'
    ]) {
      if (extras[key] !== undefined) candidate[key] = extras[key];
    }
    if (Object.keys(candidate).length) records.push({ kind, index, ...candidate });
  };
  visit('asset', 0, gltf.asset?.extras);
  visit('document', 0, gltf.extras);
  (gltf.scenes || []).forEach((scene, index) => visit('scene', index, scene.extras));
  (gltf.nodes || []).forEach((node, index) => visit('node', index, node.extras));
  (gltf.meshes || []).forEach((mesh, index) => visit('mesh', index, mesh.extras));
  return records;
}

async function writeReport(reportPath, report, compact) {
  if (!reportPath) return;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, compact ? 0 : 2)}\n`, 'utf8');
}

async function main() {
  const { input, reportPath, compact } = parseArguments(process.argv.slice(2));
  let fileBuffer;
  try {
    fileBuffer = await readFile(input);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const missing = {
      verifier: 'MASSFRONT UGA character source GLB verifier v1',
      status: 'MISSING',
      input,
      checks: [{ id: 'input-exists', status: 'FAIL', details: 'Source GLB does not exist' }],
      visualClaims: {
        fullBody: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
        strictTPose: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
        styleAndSilhouette: 'UNKNOWN_REQUIRES_VISUAL_REVIEW'
      }
    };
    await writeReport(reportPath, missing, compact);
    console.error(JSON.stringify(missing, null, compact ? 0 : 2));
    process.exitCode = 2;
    return;
  }

  const checks = [];
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
  let parsed;
  try {
    parsed = parseGlb(fileBuffer);
    pushCheck(checks, 'glb-2-container', true, parsed.container);
  } catch (error) {
    pushCheck(checks, 'glb-2-container', false, error.message);
    const failed = {
      verifier: 'MASSFRONT UGA character source GLB verifier v1',
      status: 'FAIL',
      input,
      bytes: fileBuffer.byteLength,
      sha256,
      checks,
      visualClaims: {
        fullBody: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
        strictTPose: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
        styleAndSilhouette: 'UNKNOWN_REQUIRES_VISUAL_REVIEW'
      }
    };
    await writeReport(reportPath, failed, compact);
    console.error(JSON.stringify(failed, null, compact ? 0 : 2));
    process.exitCode = 1;
    return;
  }

  const { gltf, binaryChunk } = parsed;
  const accessorErrors = inspectAccessors(gltf, binaryChunk);
  pushCheck(checks, 'accessor-ranges-and-finite-values', accessorErrors.length === 0,
    accessorErrors.length ? accessorErrors : `${gltf.accessors?.length || 0} dense accessors validated`);

  const bounds = inspectPositionBounds(gltf, binaryChunk);
  pushCheck(checks, 'finite-position-bounds', bounds.finite && bounds.errors.length === 0, bounds);

  const triangles = inspectTriangles(gltf, binaryChunk);
  pushCheck(checks, 'complete-indexed-triangles', triangles.completeIndexedTriangles, triangles);

  const resources = inspectEmbeddedResources(gltf, binaryChunk);
  pushCheck(checks, 'self-contained-resources', resources.selfContained, resources);

  const unlit = inspectUnlit(gltf);
  pushCheck(checks, 'unlit-extension-consistency', unlit.consistent, unlit);

  const sceneGraph = inspectSceneGraph(gltf);
  pushCheck(checks, 'scene-graph-references', sceneGraph.valid, sceneGraph);

  const runtimeUse = classifyRuntimeUse(triangles.triangleCount);
  const poseMetadata = findPoseMetadata(gltf);
  const failedChecks = checks.filter(check => check.status === 'FAIL');
  const report = {
    verifier: 'MASSFRONT UGA character source GLB verifier v1',
    status: failedChecks.length ? 'FAIL' : 'PASS',
    input,
    bytes: fileBuffer.byteLength,
    sha256,
    glb: parsed.container,
    inventory: {
      scenes: gltf.scenes?.length || 0,
      nodes: gltf.nodes?.length || 0,
      meshes: gltf.meshes?.length || 0,
      primitives: triangles.primitiveCount,
      accessors: gltf.accessors?.length || 0,
      bufferViews: gltf.bufferViews?.length || 0,
      materials: gltf.materials?.length || 0,
      textures: gltf.textures?.length || 0,
      images: gltf.images?.length || 0,
      skins: gltf.skins?.length || 0,
      animations: gltf.animations?.length || 0,
      vertices: bounds.vertexCount,
      triangles: triangles.triangleCount
    },
    geometry: { bounds, triangles },
    resources,
    materialProfile: unlit,
    runtimeUse,
    intakeEvidence: {
      poseMetadata,
      rigPresent: (gltf.skins?.length || 0) > 0,
      animationsPresent: (gltf.animations?.length || 0) > 0
    },
    visualClaims: {
      fullBody: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
      strictTPose: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
      styleAndSilhouette: 'UNKNOWN_REQUIRES_VISUAL_REVIEW',
      note: 'Metadata and geometry extents can support intake provenance, but a GLB structure audit cannot prove anatomical completeness, hand pose, T-pose accuracy, cel-shaded appearance, or visual quality.'
    },
    checks
  };

  await writeReport(reportPath, report, compact);
  const output = JSON.stringify(report, null, compact ? 0 : 2);
  if (failedChecks.length) console.error(output);
  else console.log(output);
  if (failedChecks.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(JSON.stringify({
    verifier: 'MASSFRONT UGA character source GLB verifier v1',
    status: 'ERROR',
    error: error.stack || error.message || String(error)
  }, null, 2));
  process.exitCode = 1;
});
