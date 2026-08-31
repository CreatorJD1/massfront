import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const [publicUrl, objectId, outputArg] = process.argv.slice(2);

if (!publicUrl || !objectId || !outputArg) {
  throw new Error(
    'Usage: node export-spline-character-source.mjs <public-url> <mesh-object-id> <output.glb>',
  );
}

const outputPath = resolve(outputArg);
const response = await fetch(publicUrl);
if (!response.ok) throw new Error(`Spline public page returned HTTP ${response.status}`);

let html = await response.text();
if (!html.includes('const app = new Application')) {
  throw new Error('Spline public page bootstrap no longer matches the supported export bridge');
}
html = html.replace(
  'const app = new Application',
  'const app = window.__massfrontSplineApp = new Application',
);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader'],
});

let exported;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(window.__massfrontSplineApp?._data?.scene?.objects),
    null,
    { timeout: 30_000 },
  );
  await page.waitForFunction(
    (targetObjectId) => {
      const findNode = (nodes) => {
        for (const node of nodes || []) {
          if (node.id === targetObjectId) return node;
          const found = findNode(node.children);
          if (found) return found;
        }
        return null;
      };
      const target = findNode(window.__massfrontSplineApp?._data?.scene?.objects);
      const geometry = target?.data?.geometry?.data;
      const image = target?.data?.materials?.[0]?.layers?.find(
        (layer) => layer?.data?.type === 'texture',
      )?.data?.texture?.image?.data;
      return (
        ArrayBuffer.isView(geometry?.attributes?.position?.array)
        && ArrayBuffer.isView(geometry?.attributes?.normal?.array)
        && ArrayBuffer.isView(geometry?.attributes?.uv?.array)
        && ArrayBuffer.isView(geometry?.index?.array)
        && ArrayBuffer.isView(image)
      );
    },
    objectId,
    { timeout: 30_000 },
  );

  exported = await page.evaluate((targetObjectId) => {
    const app = window.__massfrontSplineApp;

    const findNode = (nodes, predicate, parent = null) => {
      for (const node of nodes || []) {
        if (predicate(node)) return { node, parent };
        const result = findNode(node.children, predicate, node);
        if (result) return result;
      }
      return null;
    };

    const found = findNode(
      app._data.scene.objects,
      (candidate) => candidate.id === targetObjectId,
    );
    if (!found) throw new Error(`Spline object not found: ${targetObjectId}`);

    const meshNode = found.node;
    const parentNode = found.parent;
    const mesh = meshNode.data;
    if (mesh.type !== 'Mesh' || mesh.geometry?.type !== 'NonParametricGeometry') {
      throw new Error(`Object ${targetObjectId} is not a generated mesh`);
    }

    const geometry = mesh.geometry.data;
    const positions = geometry.attributes?.position?.array;
    const normals = geometry.attributes?.normal?.array;
    const sourceUvs = geometry.attributes?.uv?.array;
    const indices = geometry.index?.array;
    const imageBytes = mesh.materials?.[0]?.layers?.find(
      (layer) => layer?.data?.type === 'texture',
    )?.data?.texture?.image?.data;

    const isTyped = (value, name) => ArrayBuffer.isView(value) && value.constructor?.name === name;
    if (!isTyped(positions, 'Float32Array')) throw new Error('Missing Float32 POSITION data');
    if (!isTyped(normals, 'Float32Array')) throw new Error('Missing Float32 NORMAL data');
    if (!isTyped(sourceUvs, 'Float32Array')) throw new Error('Missing Float32 TEXCOORD_0 data');
    if (!isTyped(indices, 'Uint32Array')) throw new Error('Missing Uint32 index data');
    if (!isTyped(imageBytes, 'Uint8Array')) throw new Error('Missing embedded source texture');
    if (positions.length % 3 || normals.length !== positions.length || sourceUvs.length / 2 !== positions.length / 3) {
      throw new Error('Spline geometry attribute counts do not agree');
    }
    if (indices.length % 3) throw new Error('Spline mesh index count is not triangular');

    const uvs = new Float32Array(sourceUvs.length);
    for (let index = 0; index < sourceUvs.length; index += 2) {
      uvs[index] = sourceUvs[index];
      uvs[index + 1] = 1 - sourceUvs[index + 1];
    }

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[index + axis];
        if (value < min[axis]) min[axis] = value;
        if (value > max[axis]) max[axis] = value;
      }
    }

    const align4 = (value) => (value + 3) & ~3;
    const chunks = [];
    const bufferViews = [];
    let byteLength = 0;
    const append = (source, target, byteStride) => {
      const padding = align4(byteLength) - byteLength;
      if (padding) chunks.push(new Uint8Array(padding));
      byteLength += padding;
      const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      const viewIndex = bufferViews.length;
      const view = { buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, target };
      if (byteStride) view.byteStride = byteStride;
      bufferViews.push(view);
      chunks.push(bytes);
      byteLength += bytes.byteLength;
      return viewIndex;
    };

    const positionView = append(positions, 34962, 12);
    const normalView = append(normals, 34962, 12);
    const uvView = append(uvs, 34962, 8);
    const indexView = append(indices, 34963);
    const imageView = append(imageBytes);
    const finalPadding = align4(byteLength) - byteLength;
    if (finalPadding) chunks.push(new Uint8Array(finalPadding));
    byteLength += finalPadding;

    const binary = new Uint8Array(byteLength);
    let writeOffset = 0;
    for (const chunk of chunks) {
      binary.set(chunk, writeOffset);
      writeOffset += chunk.byteLength;
    }

    const rootPosition = parentNode?.data?.position ?? [0, 0, 0];
    const rootRotation = parentNode?.data?.rotation ?? [0, 0, 0];
    const rootScale = parentNode?.data?.scale ?? [1, 1, 1];
    const meshRotation = mesh.rotation ?? [0, 0, 0];
    const toQuaternion = ([xDegrees, yDegrees, zDegrees]) => {
      const x = (xDegrees * Math.PI) / 360;
      const y = (yDegrees * Math.PI) / 360;
      const z = (zDegrees * Math.PI) / 360;
      const sx = Math.sin(x), cx = Math.cos(x);
      const sy = Math.sin(y), cy = Math.cos(y);
      const sz = Math.sin(z), cz = Math.cos(z);
      return [
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
      ];
    };

    const gltf = {
      asset: { version: '2.0', generator: 'MASSFRONT Spline source intake v1' },
      extensionsUsed: ['KHR_materials_unlit'],
      scene: 0,
      scenes: [{ name: 'Spline Source', nodes: [0] }],
      nodes: [
        {
          name: parentNode?.data?.name ?? 'CHARACTER_spline_source',
          translation: rootPosition,
          rotation: toQuaternion(rootRotation),
          scale: rootScale,
          children: [1],
          extras: {
            sourceTool: 'Spline',
            sourceRootId: parentNode?.id ?? null,
            sourceObjectId: meshNode.id,
            authoringPose: 'T',
            styleProfileId: 'anime-cell-v1',
          },
        },
        {
          name: mesh.name,
          translation: mesh.position ?? [0, 0, 0],
          rotation: toQuaternion(meshRotation),
          scale: mesh.scale ?? [1, 1, 1],
          mesh: 0,
        },
      ],
      meshes: [{
        name: mesh.name,
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
          indices: 3,
          material: 0,
          mode: 4,
        }],
      }],
      accessors: [
        { bufferView: positionView, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
        { bufferView: normalView, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
        { bufferView: uvView, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
        { bufferView: indexView, componentType: 5125, count: indices.length, type: 'SCALAR' },
      ],
      materials: [{
        name: `${mesh.name} Unlit Source Texture`,
        extensions: { KHR_materials_unlit: {} },
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        alphaMode: 'OPAQUE',
        doubleSided: false,
      }],
      textures: [{ sampler: 0, source: 0 }],
      samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
      images: [{ name: `${mesh.name} Source Texture`, bufferView: imageView, mimeType: 'image/jpeg' }],
      bufferViews,
      buffers: [{ byteLength }],
    };

    const jsonBytesRaw = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonLength = align4(jsonBytesRaw.byteLength);
    const jsonBytes = new Uint8Array(jsonLength);
    jsonBytes.fill(0x20);
    jsonBytes.set(jsonBytesRaw);

    const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength;
    const glb = new Uint8Array(totalLength);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);
    view.setUint32(12, jsonBytes.byteLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.set(jsonBytes, 20);
    const binHeaderOffset = 20 + jsonBytes.byteLength;
    view.setUint32(binHeaderOffset, binary.byteLength, true);
    view.setUint32(binHeaderOffset + 4, 0x004e4942, true);
    glb.set(binary, binHeaderOffset + 8);

    let binaryString = '';
    const blockSize = 0x8000;
    for (let offset = 0; offset < glb.byteLength; offset += blockSize) {
      binaryString += String.fromCharCode(...glb.subarray(offset, offset + blockSize));
    }

    return {
      base64: btoa(binaryString),
      metadata: {
        sourceRootId: parentNode?.id ?? null,
        sourceObjectId: meshNode.id,
        vertexCount: positions.length / 3,
        triangleCount: indices.length / 3,
        textureBytes: imageBytes.byteLength,
        glbBytes: glb.byteLength,
        bounds: { min, max },
      },
    };
  }, objectId);
} finally {
  await browser.close();
}

const glb = Buffer.from(exported.base64, 'base64');
if (glb.length !== exported.metadata.glbBytes) {
  throw new Error(`GLB transfer size mismatch: expected ${exported.metadata.glbBytes}, got ${glb.length}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, glb);

const sha256 = createHash('sha256').update(glb).digest('hex');
console.log(JSON.stringify({ outputPath, sha256, ...exported.metadata }, null, 2));
