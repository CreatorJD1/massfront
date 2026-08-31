#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glbInfo, writeJsonAtomic } from './model-kit-core.mjs';

const toolDir = dirname(fileURLToPath(import.meta.url));
const transport = resolve(toolDir, '..', 'spline', 'export-spline-character-source.mjs');

function usage() {
  console.error('Usage: node export-spline-mesh.mjs <public-url> <mesh-object-id> <output.glb> [--kit-id <id>] [--report <path>]');
  process.exitCode = 2;
}

function parseArgs(argv) {
  const positional = [];
  let kitId = '';
  let report = '';
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--kit-id') kitId = argv[++index] || '';
    else if (value === '--report') report = argv[++index] || '';
    else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`);
    else positional.push(value);
  }
  if (positional.length !== 3) return null;
  const [publicUrl, objectId, output] = positional;
  const derivedId = basename(output, '.glb')
    .replace(/-source$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return {
    publicUrl,
    objectId,
    output: resolve(output),
    kitId: kitId || derivedId,
    report: report ? resolve(report) : ''
  };
}

function parseChunks(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('transport output is not GLB 2.0');
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  const json = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  const bin = chunks.find((chunk) => chunk.type === 0x004e4942);
  if (!json || !bin) throw new Error('transport output lacks JSON or BIN chunk');
  return {
    document: JSON.parse(json.data.toString('utf8').replace(/[\u0000\u0020]+$/g, '')),
    binary: bin.data
  };
}

function packGlb(document, binary) {
  const align4 = (value) => (value + 3) & ~3;
  const rawJson = Buffer.from(JSON.stringify(document), 'utf8');
  const json = Buffer.alloc(align4(rawJson.length), 0x20);
  rawJson.copy(json);
  const paddedBinary = Buffer.alloc(align4(binary.length));
  binary.copy(paddedBinary);
  const totalLength = 12 + 8 + json.length + 8 + paddedBinary.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  const binaryHeader = 20 + json.length;
  output.writeUInt32LE(paddedBinary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  paddedBinary.copy(output, binaryHeader + 8);
  if (document.buffers?.[0]) document.buffers[0].byteLength = binary.length;
  return output;
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  usage();
} else {
  if (!/^https:\/\//.test(args.publicUrl)) throw new Error('public-url must be HTTPS');
  if (!args.objectId) throw new Error('mesh-object-id is required');
  if (!args.kitId.match(/^[a-z][a-z0-9_]*$/)) throw new Error('kit-id must be lower_snake_case');
  if (existsSync(args.output)) throw new Error(`Refusing to overwrite preserved source GLB: ${args.output}`);
  if (!existsSync(transport)) throw new Error(`Spline source transport is missing: ${transport}`);

  mkdirSync(dirname(args.output), { recursive: true });
  const temporary = `${args.output}.${process.pid}.transport.glb`;
  try {
    const result = spawnSync(process.execPath, [transport, args.publicUrl, args.objectId, temporary], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true
    });
    if (result.status !== 0 || !existsSync(temporary)) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      throw new Error(`Spline export transport failed with exit ${result.status}: ${detail}`);
    }

    const { document, binary } = parseChunks(readFileSync(temporary));
    document.asset = {
      ...(document.asset || {}),
      generator: 'MASSFRONT Spline generated-model source intake v1',
      extras: {
        ...(document.asset?.extras || {}),
        massfrontKitId: args.kitId,
        sourceTool: 'Spline',
        sourceSceneUrl: args.publicUrl,
        sourceObjectId: args.objectId,
        sourceKind: 'ai-generated-model'
      }
    };
    const root = document.nodes?.[0];
    if (root) {
      root.name = `SOURCE_${args.kitId}`;
      const old = root.extras || {};
      root.extras = {
        sourceTool: 'Spline',
        sourceSceneUrl: args.publicUrl,
        sourceRootId: old.sourceRootId ?? null,
        sourceObjectId: args.objectId,
        massfrontKitId: args.kitId,
        sourceKind: 'ai-generated-model'
      };
    }
    if (document.meshes?.[0]) document.meshes[0].name = `SOURCE_MESH_${args.kitId}`;

    // packGlb needs the unpadded BIN length recorded in the JSON before it is encoded.
    if (document.buffers?.[0]) document.buffers[0].byteLength = binary.length;
    const outputBytes = packGlb(document, binary);
    const atomic = `${args.output}.${process.pid}.tmp`;
    writeFileSync(atomic, outputBytes);
    renameSync(atomic, args.output);
    const info = glbInfo(args.output);
    const report = {
      schemaVersion: 1,
      kind: 'MassfrontSplineSourceExportV1',
      status: 'PASS',
      publicSceneUrl: args.publicUrl,
      sourceObjectId: args.objectId,
      kitId: args.kitId,
      output: args.output,
      ...info
    };
    if (args.report) writeJsonAtomic(args.report, report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    rmSync(temporary, { force: true });
  }
}
