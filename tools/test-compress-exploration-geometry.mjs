import assert from 'node:assert/strict';
import { Document, NodeIO } from '@gltf-transform/core';
import { compressGlbBytes, createGeometryIo, assertSceneContract } from './compress-exploration-geometry.mjs';

function buildGrid(size = 64) {
  const document = new Document();
  const buffer = document.createBuffer('fixture');
  const positions = new Float32Array(size * size * 3);
  const normals = new Float32Array(size * size * 3);
  const uvs = new Float32Array(size * size * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const vertex = y * size + x;
      positions.set([x / (size - 1), Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.02, y / (size - 1)], vertex * 3);
      normals.set([0, 1, 0], vertex * 3);
      uvs.set([x / (size - 1), y / (size - 1)], vertex * 2);
    }
  }
  const indices = new Uint32Array((size - 1) * (size - 1) * 6);
  let cursor = 0;
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const a = y * size + x, b = a + 1, c = a + size, d = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  const material = document.createMaterial('fixture-material')
    .setBaseColorFactor([0.2, 0.4, 0.8, 1])
    .setMetallicFactor(0.25)
    .setRoughnessFactor(0.7);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', document.createAccessor('position').setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor('normal').setType('VEC3').setArray(normals).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', document.createAccessor('uv').setType('VEC2').setArray(uvs).setBuffer(buffer))
    .setIndices(document.createAccessor('indices').setType('SCALAR').setArray(indices).setBuffer(buffer))
    .setMaterial(material);
  const mesh = document.createMesh('fixture-grid').addPrimitive(primitive);
  const node = document.createNode('fixture-node').setMesh(mesh).setTranslation([2, 3, 4]);
  document.createScene('fixture-scene').addChild(node);
  return document;
}

const plainIo = new NodeIO();
const source = Buffer.from(await plainIo.writeBinary(buildGrid()));
const io = await createGeometryIo();
const compressed = await compressGlbBytes(io, source, { encodeSpeed: 5, decodeSpeed: 5 });

assert.equal(compressed.alreadyCompressed, false, 'fixture must exercise the encoder');
assert.ok(compressed.after.extensionsUsed.includes('KHR_draco_mesh_compression'), 'Draco extension must be present');
assert.ok(compressed.bytes.length < source.length / 2, `fixture must shrink by at least x2 (${source.length} -> ${compressed.bytes.length})`);
assert.equal(compressed.before.triangles, (64 - 1) * (64 - 1) * 2);
assert.equal(compressed.after.triangles, compressed.before.triangles);
assert.deepEqual(compressed.after.names, compressed.before.names);
assert.deepEqual(compressed.after.materialSignatures, compressed.before.materialSignatures);

const secondPass = await compressGlbBytes(io, compressed.bytes);
assert.equal(secondPass.alreadyCompressed, true, 'already-Draco models must not be re-encoded');
assert.equal(Buffer.compare(secondPass.bytes, compressed.bytes), 0, 'already-Draco bytes must remain exact');

assert.throws(() => assertSceneContract(compressed.before, { ...compressed.after, triangles: compressed.before.triangles + 1 }), /triangles increased/);
assert.throws(() => assertSceneContract(compressed.before, { ...compressed.after, extensionsUsed: [] }), /KHR_draco_mesh_compression/);

console.log(JSON.stringify({
  status: 'PASS',
  sourceBytes: source.length,
  outputBytes: compressed.bytes.length,
  ratio: Number((source.length / compressed.bytes.length).toFixed(3)),
  triangles: compressed.after.triangles,
  sceneContractMutationCaught: true,
  extensionMutationCaught: true,
  secondPassStable: true
}, null, 2));
