import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function inspectPng(path) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new Error(`CAPTURE_MISSING: ${path}`);
  const data = await readFile(path);
  if (data.length < 33 || !data.subarray(0, 8).equals(SIGNATURE)) throw new Error('CAPTURE_PNG_SIGNATURE_INVALID');
  let offset = 8, ihdr = null, iend = false;
  const idat = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12) throw new Error('CAPTURE_PNG_CHUNK_TRUNCATED');
    const type = data.toString('ascii', offset + 4, offset + 8);
    const payload = data.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = data.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(data.subarray(offset + 4, offset + 8 + length));
    if (expectedCrc !== actualCrc) throw new Error(`CAPTURE_PNG_CRC_INVALID: ${type}`);
    if (type === 'IHDR') {
      if (ihdr || length !== 13) throw new Error('CAPTURE_PNG_IHDR_INVALID');
      ihdr = { width: payload.readUInt32BE(0), height: payload.readUInt32BE(4), bitDepth: payload[8], colorType: payload[9], compression: payload[10], filter: payload[11], interlace: payload[12] };
    } else if (type === 'IDAT') idat.push(payload);
    else if (type === 'IEND') { iend = true; offset += 12; break; }
    offset += 12 + length;
  }
  if (!ihdr || !ihdr.width || !ihdr.height || !idat.length || !iend) throw new Error('CAPTURE_PNG_STRUCTURE_INVALID');
  if (ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0 || ihdr.bitDepth !== 8) throw new Error('CAPTURE_PNG_FORMAT_UNSUPPORTED');
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[ihdr.colorType];
  if (!channels) throw new Error('CAPTURE_PNG_COLOR_TYPE_UNSUPPORTED');
  const inflated = inflateSync(Buffer.concat(idat));
  const expectedBytes = ihdr.height * (1 + ihdr.width * channels);
  if (inflated.length !== expectedBytes) throw new Error(`CAPTURE_PNG_PIXEL_DATA_INVALID: expected ${expectedBytes}, got ${inflated.length}`);
  return { ...ihdr, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

export async function validateCapture(capture, { captureRoot, viewport }) {
  const errors = [];
  const root = resolve(captureRoot);
  const absolute = resolve(root, String(capture?.file || ''));
  const rel = relative(root, absolute);
  if (!capture?.file || rel === '..' || rel.startsWith(`..${sep}`) || resolve(rel) === resolve('..')) {
    return { valid: false, errors: ['CAPTURE_PATH_OUTSIDE_ROOT'], details: null };
  }
  let details = null;
  try { details = await inspectPng(absolute); } catch (error) { errors.push(error.message); return { valid: false, errors, details }; }
  if (!/^[a-f0-9]{64}$/i.test(capture.sha256 || '') || capture.sha256.toLowerCase() !== details.sha256) errors.push('CAPTURE_HASH_MISMATCH');
  if (capture.width !== details.width || capture.height !== details.height) errors.push('CAPTURE_DECLARED_DIMENSIONS_MISMATCH');
  const expectedWidth = Math.round(viewport.width * viewport.dpr);
  const expectedHeight = Math.round(viewport.height * viewport.dpr);
  if (details.width !== expectedWidth || details.height !== expectedHeight) errors.push(`CAPTURE_VIEWPORT_DIMENSIONS_MISMATCH: expected ${expectedWidth}x${expectedHeight}, got ${details.width}x${details.height}`);
  return { valid: errors.length === 0, errors, details: { ...details, path: absolute } };
}
