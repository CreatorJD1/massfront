/* Strict performance-capture inspection. The shared PNG parser proves file
   structure and CRCs; this decoder reconstructs scanlines so a solid-color
   placeholder cannot satisfy battlefield evidence. */

import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { inspectPng } from '../evidence-foundation/png-evidence.mjs';

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function reconstructScanlines(data, details) {
  const channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 })[details.colorType];
  const stride = details.width * channels;
  const idat = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(data.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(details.height * stride);
  let source = 0;
  for (let y = 0; y < details.height; y++) {
    const filter = inflated[source++];
    if (filter < 0 || filter > 4) throw new Error(`CAPTURE_PNG_FILTER_UNSUPPORTED: ${filter}`);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[source++];
      const target = y * stride + x;
      const left = x >= channels ? pixels[target - channels] : 0;
      const above = y > 0 ? pixels[target - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[target - stride - channels] : 0;
      const predictor = filter === 1 ? left
        : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2)
        : filter === 4 ? paeth(left, above, upperLeft) : 0;
      pixels[target] = (raw + predictor) & 0xff;
    }
  }
  return { channels, pixels };
}

function visualSample(pixels, offset, colorType) {
  let red, green, blue, alpha = 255;
  if (colorType === 0) red = green = blue = pixels[offset];
  else if (colorType === 2) [red, green, blue] = pixels.subarray(offset, offset + 3);
  else if (colorType === 4) {
    red = green = blue = pixels[offset];
    alpha = pixels[offset + 1];
  } else {
    [red, green, blue, alpha] = pixels.subarray(offset, offset + 4);
  }
  const opacity = alpha / 255;
  return [red * opacity, green * opacity, blue * opacity];
}

export async function inspectNonblankPng(path) {
  const details = await inspectPng(path);
  const data = await readFile(path);
  const { channels, pixels } = reconstructScanlines(data, details);
  let count = 0;
  const mean = [0, 0, 0], m2 = [0, 0, 0], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < pixels.length; offset += channels) {
    const sample = visualSample(pixels, offset, details.colorType);
    count++;
    for (let channel = 0; channel < 3; channel++) {
      const delta = sample[channel] - mean[channel];
      mean[channel] += delta / count;
      m2[channel] += delta * (sample[channel] - mean[channel]);
      min[channel] = Math.min(min[channel], sample[channel]);
      max[channel] = Math.max(max[channel], sample[channel]);
    }
  }
  const pixelVariance = count ? m2.reduce((total, value) => total + value / count, 0) : 0;
  const pixelRange = count ? Math.max(...max.map((value, channel) => value - min[channel])) : 0;
  return {
    ...details,
    pixelVariance,
    pixelRange,
    nonblank: count > 1 && pixelRange > 0 && pixelVariance > 0
  };
}
