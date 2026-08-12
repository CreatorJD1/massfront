import { createWriteStream } from 'fs';
import { deflateSync } from 'zlib';
import { mkdirSync } from 'fs';

// Minimal pure-Node PNG encoder for a useful RGBA test texture.
// Produces a 256x256 image with:
//   - top-left: red/green/blue/white/black primaries
//   - top-right: horizontal grayscale ramp
//   - bottom-left: vertical saturation ramp
//   - bottom-right: alpha checkerboard over magenta
//   - 16-pixel grid lines

const WIDTH = 256;
const HEIGHT = 256;
const OUT = 'assets/textures/test.png';

function pngChunk(type, data) {
  const len = data ? data.length : 0;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'latin1');
  if (len) data.copy(buf, 8);
  const crc = require('crypto').createHash('md5'); // placeholder, will compute real CRC
  // Real CRC32 via zlib.crc32 (available in Node 22+)
  const crcVal = require('zlib').crc32 ? require('zlib').crc32(buf.slice(4, 8 + len)) : 0;
  buf.writeUInt32BE(crcVal >>> 0, 8 + len);
  return buf;
}

// CRC32 poly 0xEDB88320 table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c >>> 0;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makePngChunk(type, data) {
  const len = data ? data.length : 0;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'latin1');
  if (len) data.copy(buf, 8);
  buf.writeUInt32BE(crc32(buf.slice(4, 8 + len)), 8 + len);
  return buf;
}

const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);

function setPixel(x, y, r, g, b, a = 255) {
  const i = (y * WIDTH + x) * 4;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a;
}

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const gx = x % 16 === 0 || x % 16 === 15;
    const gy = y % 16 === 0 || y % 16 === 15;
    let r = 32, g = 32, b = 32, a = 255;

    if (y < HEIGHT / 2 && x < WIDTH / 2) {
      // primaries + white/black blocks
      const sx = Math.floor(x / (WIDTH / 4));
      const sy = Math.floor(y / (HEIGHT / 4));
      const colors = [
        [255, 0, 0], [0, 255, 0],
        [0, 0, 255], [255, 255, 255],
        [0, 0, 0], [255, 255, 0],
        [0, 255, 255], [255, 0, 255]
      ];
      [r, g, b] = colors[sy * 2 + sx] || [128, 128, 128];
    } else if (y < HEIGHT / 2 && x >= WIDTH / 2) {
      // grayscale ramp
      const v = Math.floor((x - WIDTH / 2) / (WIDTH / 2) * 255);
      r = g = b = v;
    } else if (y >= HEIGHT / 2 && x < WIDTH / 2) {
      // vertical saturation ramp
      const sat = (y - HEIGHT / 2) / (HEIGHT / 2);
      const hue = x / (WIDTH / 2);
      const hp = hue * 6;
      const c = sat * 255;
      const X = c * (1 - Math.abs((hp % 2) - 1));
      let rr = 0, gg = 0, bb = 0;
      if (hp < 1) { rr = c; gg = X; }
      else if (hp < 2) { rr = X; gg = c; }
      else if (hp < 3) { gg = c; bb = X; }
      else if (hp < 4) { gg = X; bb = c; }
      else if (hp < 5) { rr = X; bb = c; }
      else { rr = c; bb = X; }
      r = rr; g = gg; b = bb;
    } else {
      // alpha checker over magenta
      const cx = Math.floor((x - WIDTH / 2) / 32);
      const cy = Math.floor((y - HEIGHT / 2) / 32);
      a = ((cx + cy) & 1) ? 255 : 64;
      r = 255; g = 0; b = 255;
    }

    if (gx || gy) { r ^= 40; g ^= 40; b ^= 40; }
    setPixel(x, y, r, g, b, a);
  }
}

// PNG raw data: filter byte 0 per row + pixels
const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
for (let y = 0; y < HEIGHT; y++) {
  raw[y * (1 + WIDTH * 4)] = 0; // filter: none
  pixels.copy(raw, y * (1 + WIDTH * 4) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const idat = makePngChunk('IDAT', deflateSync(raw, { level: 9 }));
const iend = makePngChunk('IEND', Buffer.alloc(0));
const ihdrChunk = makePngChunk('IHDR', ihdr);

mkdirSync('assets/textures', { recursive: true });
const out = createWriteStream(OUT);
out.write(Buffer.concat([signature, ihdrChunk, idat, iend]));
out.end();
out.on('finish', () => console.log(`Wrote ${OUT} (${WIDTH}x${HEIGHT})`));
