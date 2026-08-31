import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { EVIDENCE_FOUNDATION_SCHEMA } from '../contracts.mjs';
import { crc32 } from '../png-evidence.mjs';

function pngChunk(type, payload) {
  const name = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + payload.length);
  output.writeUInt32BE(payload.length, 0);
  name.copy(output, 4);
  payload.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, payload])), 8 + payload.length);
  return output;
}

export function makePng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4); rows[row] = 0;
    for (let x = 0; x < width; x++) {
      const pixel = row + 1 + x * 4;
      rows[pixel] = x * 31; rows[pixel + 1] = y * 47; rows[pixel + 2] = 180; rows[pixel + 3] = 255;
    }
  }
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(rows)), pngChunk('IEND', Buffer.alloc(0))]);
}

export async function createCleanFixture(root) {
  const captureRoot = join(root, 'captures');
  const ledgerRoot = join(root, 'ledger');
  await mkdir(captureRoot, { recursive: true });
  const hashes = {};
  for (const stage of ['start', 'mid', 'end']) {
    const bytes = makePng(4, 3);
    const file = `${stage}.png`;
    await writeFile(join(captureRoot, file), bytes);
    hashes[stage] = createHash('sha256').update(bytes).digest('hex');
  }
  const expected = {
    gitHead: 'a'.repeat(40),
    dirtyFingerprint: 'b'.repeat(64),
    runtimeFingerprint: 'c'.repeat(64),
    packageFingerprint: 'd'.repeat(64)
  };
  const record = {
    foundationSchema: EVIDENCE_FOUNDATION_SCHEMA,
    eligibleForAcceptance: true,
    sourceIdentityStable: true,
    timestamp: '2026-08-26T12:00:00.000Z',
    provenance: { ...expected },
    device: {
      serial: 'R5TESTDEVICE', state: 'device', model: 'SM-S938U', manufacturer: 'samsung', abi: 'arm64-v8a',
      androidVersion: '15', sdk: '35', physicalSize: 'Physical size: 1440x3120', density: 'Physical density: 480',
      battery: 'level: 90', thermal: 'Thermal Status: 0'
    },
    viewport: {
      width: 4, height: 3, dpr: 1, physicalWidth: 4, physicalHeight: 3,
      userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938U) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36',
      mobileGpuRequested: true, mobileGpuEffective: true
    },
    captures: ['start', 'mid', 'end'].map(stage => ({ stage, file: `${stage}.png`, width: 4, height: 3, sha256: hashes[stage] }))
  };
  const expectedPath = join(root, 'expected.json');
  const cleanRecordPath = join(root, 'clean.json');
  await writeFile(expectedPath, JSON.stringify(expected));
  await writeFile(cleanRecordPath, JSON.stringify(record));
  return { record, expected, expectedPath, cleanRecordPath, captureRoot, ledgerRoot };
}
