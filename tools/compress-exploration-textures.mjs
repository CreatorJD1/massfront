/* Recompress the textures embedded inside the Galactic Exploration GLB pack.

   The pack is 518.6 MB across 330 models, and exactly half of that — 260.3 MB —
   is embedded PNG. 5052 images, every one of them 8-bit non-interlaced PNG living
   in a bufferView, 4992 at 256x256 and 60 at 1024x1024. PNG is a lossless codec
   being asked to carry photographic albedo and baked normal detail, which is the
   single worst thing you can hand it, so the pack pays roughly six times what the
   same art costs as WebP. Measured on a six-model sample at quality 88 / method 6:
   86.2 MB of PNG became 14.1 MB of WebP, about x6.1. That is the whole reason this
   tool exists — the geometry is not the problem, the pixels are.

   WHY WEBP AND NOT SOMETHING BETTER
   Draco and meshopt would shrink the *other* half, and modules/space_exploration/
   lib/GLTFLoader.js does register decoders for both. But only the decoders ship:
   there is no encoder anywhere in this repo and installing one is off the table, so
   a Draco pass is not something this tool can honestly perform. KTX2/Basis is the
   same story with an extra hole — KTX2Loader is never constructed or wired to the
   loader, so a KHR_texture_basisu asset would not load at all. EXT_texture_webp is
   the one texture extension where the shipped loader can actually decode what we
   write, using nothing but the browser's own image decoder. So: textures only, WebP
   only, and the mesh bytes are copied through untouched.

   HOW THE EXTENSION IS APPLIED (one approach, applied consistently)
   Image bytes are replaced in place at the same image index — the PNG is gone, it
   is not kept as a second image — so there is no fallback left in the file. Given
   that, every converted texture gets BOTH of these:
       textures[i].source                              -> N   (left as it was)
       textures[i].extensions.EXT_texture_webp.source  -> N   (the same index)
   and the file declares EXT_texture_webp in extensionsUsed AND extensionsRequired.

   That is deliberate, and GLTFLoader.js is the authority for why:
     - The WebP plugin is registered unconditionally in the GLTFLoader constructor
       (`this.register( parser => new GLTFTextureWebPExtension( parser ) )`). It is
       NOT gated on extensionsUsed — the switch that reads extensionsUsed has no
       webp case at all. `_invokeOne` walks the plugins before falling back to the
       parser, so the plugin sees every texture first.
     - Its loadTexture() returns null unless textureDef.extensions.EXT_texture_webp
       exists, then resolves json.images[extension.source] and hands it to
       parser.loadTextureImage(), which wraps the bufferView in a Blob typed by
       source.mimeType. Hence the mimeType rewrite is mandatory, not cosmetic.
     - On a decoder that cannot do WebP, the plugin checks extensionsRequired: if the
       name is listed it throws 'WebP required by asset but unsupported', and if it is
       NOT listed it silently falls back to parser.loadTexture(), which reads
       json.images[textureDef.source] — the same WebP bytes — and dies inside the
       browser image decoder instead. Since we removed the PNG, "optional" would buy
       nothing but a worse error message. Declaring it required is the honest call.
     - loadTextureImage sniffs the PNG IHDR to decide hasAlpha, gated on
       mimeType === 'image/png'. With the mimeType switched to WebP that probe is
       skipped and hasAlpha stays true, so the texture keeps an alpha-capable format.
       Alpha survives the format change; it would not have survived leaving a stale
       image/png mimeType on WebP bytes, which would make the loader read the WebP
       container header as a PNG IHDR and pick a texture format at random.

   ALPHA AND CHANNEL-PACKED MAPS
   The pack is 3267 RGBA images and 1785 RGB. Anything with an alpha channel is
   encoded as RGBA with exact=1, which stops libwebp rewriting the colour of fully
   transparent pixels for compressibility. On this pack that costs literally zero
   bytes (no image has transparent pixels to optimise), but ORM-style maps park real
   data in channels that look "invisible", and losing occlusion under an alpha-zero
   region is the kind of break nobody notices until lighting looks wrong three weeks
   later. Alpha itself is untouched: libwebp defaults alpha_quality to 100, which is
   lossless, and measurement confirms zero error on the alpha channel. One honest
   caveat: lossy WebP subsamples chroma, so ORM and normal maps — whose R/G/B carry
   independent data rather than a colour — take more error than albedo does (up to
   ~85/255 on one channel of the noisiest normal map at q88). Raise --quality if that
   shows up in art review; the flag is there for exactly that.

   An image is skipped, and left as PNG, whenever WebP comes out the same size or
   larger. That is not theoretical: flat emissive masks in this pack already encode
   to a few hundred bytes of PNG and WebP's container overhead loses to them.

   REBUILDING THE CONTAINER
   Image payloads change length, so the BIN chunk has to be rebuilt and every
   bufferView byteOffset/byteLength recomputed. Non-image bufferViews are copied
   byte-for-byte and only relocated, each to a 4-byte-aligned offset, emitted in
   their original storage order so the file's layout stays recognisable. Accessor
   byteOffsets are relative to their bufferView and so stay valid untouched. Both
   chunks are re-padded (JSON with spaces, BIN with zeros) and all three lengths in
   the header and chunk descriptors are rewritten. Every file written is re-read and
   re-parsed before the tool moves on; a model whose images all got skipped is copied
   through as the original bytes rather than re-serialised, because "identical" beats
   "re-derived and probably identical".

   Nothing is ever written back over a source model. Output mirrors the source-
   relative path under a staging directory.

   Encoding runs through a pool of resident Python workers (PIL, already present)
   speaking a length-prefixed binary protocol over stdio, because spawning a process
   per image 5052 times is otherwise most of the runtime.

     node tools/compress-exploration-textures.mjs [--in <dir>] [--out <dir>]
                [--quality <n>] [--limit <n>] [--concurrency <n>] [--dry-run]
*/
import {readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync} from 'node:fs';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir, cpus} from 'node:os';
import {spawn} from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GLB_MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;
const PNG_MAGIC = 0x89504e47;
const WEBP_EXT = 'EXT_texture_webp';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error('--' + name + ' needs a value');
  return v;
};
const opts = {
  in: join(root, flag('in', 'modules/space_exploration/assets/runtime')),
  out: join(root, flag('out', '.tmp/exploration-optimized')),
  quality: Number(flag('quality', '88')),
  limit: argv.includes('--limit') ? Number(flag('limit')) : Infinity,
  concurrency: Number(flag('concurrency', String(Math.max(1, Math.min(8, cpus().length - 2))))),
  dryRun: argv.includes('--dry-run')
};
if (!Number.isInteger(opts.quality) || opts.quality < 1 || opts.quality > 100) throw new Error('--quality must be 1..100');
if (!(opts.limit > 0)) throw new Error('--limit must be a positive integer');
if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) throw new Error('--concurrency must be >= 1');

/* ---------------------------------------------------------------- encoder pool */
/* PIL is invoked as a resident worker rather than one process per image. The
   protocol is deliberately dumb: uint32le length + PNG in, status byte + uint32le
   length + payload out, EOF to shut down. Anything cleverer (JSON framing, base64)
   would either mangle binary or inflate the bytes crossing the pipe. */
const WORKER_PY = [
  'import sys, io',
  'from PIL import Image',
  'q = int(sys.argv[1])',
  'inp, outp = sys.stdin.buffer, sys.stdout.buffer',
  'def readn(n):',
  '    b = b""',
  '    while len(b) < n:',
  '        c = inp.read(n - len(b))',
  '        if not c: return None',
  '        b += c',
  '    return b',
  'while True:',
  '    head = readn(4)',
  '    if head is None: break',
  '    data = readn(int.from_bytes(head, "little"))',
  '    if data is None: break',
  '    try:',
  '        im = Image.open(io.BytesIO(data)); im.load()',
  '        alpha = im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)',
  '        target = "RGBA" if alpha else "RGB"',
  '        if im.mode != target: im = im.convert(target)',
  '        buf = io.BytesIO()',
  '        kw = dict(quality=q, method=6)',
  '        if alpha: kw["exact"] = True',
  '        im.save(buf, "WEBP", **kw)',
  '        payload, status = buf.getvalue(), 0',
  '    except Exception as exc:',
  '        payload, status = str(exc).encode("utf8", "replace"), 1',
  '    outp.write(bytes([status]) + len(payload).to_bytes(4, "little") + payload)',
  '    outp.flush()',
  ''
].join('\n');
const workerPath = join(tmpdir(), 'massfront-webp-worker-' + process.pid + '.py');
writeFileSync(workerPath, WORKER_PY);
const cleanupWorker = () => {try {rmSync(workerPath, {force: true});} catch {}};

function makeWorker() {
  const proc = spawn('python', [workerPath, String(opts.quality)], {stdio: ['pipe', 'pipe', 'pipe']});
  const queue = [];
  let pending = Buffer.alloc(0), stderr = '', fatal = null;
  const fail = err => {fatal = err; while (queue.length) queue.shift().reject(err);};
  proc.stderr.on('data', c => {stderr += c.toString();});
  proc.on('error', err => fail(err));
  proc.on('exit', code => {if (queue.length) fail(new Error('python worker exited (' + code + ') ' + stderr.trim()));});
  proc.stdout.on('data', chunk => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      if (pending.length < 5) return;
      const len = pending.readUInt32LE(1);
      if (pending.length < 5 + len) return;
      const status = pending[0], body = Buffer.from(pending.subarray(5, 5 + len));
      pending = pending.subarray(5 + len);
      const job = queue.shift();
      if (!job) return;
      if (status === 0) job.resolve(body); else job.reject(new Error(body.toString('utf8')));
    }
  });
  return {
    encode(png) {
      if (fatal) return Promise.reject(fatal);
      return new Promise((resolve, reject) => {
        queue.push({resolve, reject});
        const head = Buffer.alloc(4); head.writeUInt32LE(png.length, 0);
        proc.stdin.write(head); proc.stdin.write(png);
      });
    },
    close() {try {proc.stdin.end();} catch {}}
  };
}

/* ------------------------------------------------------------------ glb codec */
function readGlb(buf, label) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(label + ': not a GLB');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error(label + ': header length ' + buf.readUInt32LE(8) + ' != file ' + buf.length);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (off + 8 + len > buf.length) throw new Error(label + ': chunk overruns file');
    if (type === CHUNK_JSON) {
      if (json) throw new Error(label + ': two JSON chunks');
      json = JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    } else if (type === CHUNK_BIN) {
      if (bin) throw new Error(label + ': two BIN chunks');
      bin = buf.subarray(off + 8, off + 8 + len);
    }
    off += 8 + len;
  }
  if (!json) throw new Error(label + ': no JSON chunk');
  return {json, bin: bin || Buffer.alloc(0)};
}

const pad4 = n => (n + 3) & ~3;

function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLen = pad4(jsonBuf.length), binLen = pad4(bin.length);
  const out = Buffer.alloc(12 + 8 + jsonLen + (bin.length ? 8 + binLen : 0));
  out.writeUInt32LE(GLB_MAGIC, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLen, 12); out.writeUInt32LE(CHUNK_JSON, 16);
  jsonBuf.copy(out, 20); out.fill(0x20, 20 + jsonBuf.length, 20 + jsonLen);
  if (bin.length) {
    const at = 20 + jsonLen;
    out.writeUInt32LE(binLen, at); out.writeUInt32LE(CHUNK_BIN, at + 4);
    bin.copy(out, at + 8); out.fill(0, at + 8 + bin.length, at + 8 + binLen);
  }
  return out;
}

/* Rebuild the BIN with the replacement image payloads spliced in. Views are
   re-emitted in their original storage order at 4-aligned offsets; everything not
   replaced is copied byte-for-byte, which is what keeps vertex data exact. */
function rebuildBin(json, bin, replacements) {
  const views = json.bufferViews || [];
  const order = views.map((v, i) => i).sort((a, b) => (views[a].byteOffset || 0) - (views[b].byteOffset || 0) || a - b);
  const parts = [];
  let cursor = 0;
  for (const i of order) {
    const view = views[i];
    const from = view.byteOffset || 0;
    let payload;
    if (replacements.has(i)) payload = replacements.get(i);
    else {
      if (from + view.byteLength > bin.length) throw new Error('bufferView ' + i + ' overruns the source BIN chunk');
      payload = bin.subarray(from, from + view.byteLength);
    }
    if (cursor % 4) {const pad = 4 - (cursor % 4); parts.push(Buffer.alloc(pad)); cursor += pad;}
    view.byteOffset = cursor;
    view.byteLength = payload.length;
    parts.push(payload);
    cursor += payload.length;
  }
  const out = Buffer.concat(parts, cursor);
  if (json.buffers && json.buffers.length) json.buffers[0].byteLength = out.length;
  return out;
}

/* Cheap structural re-parse of what we just produced. Runs on every output file —
   a silent offset bug spread across 330 models is not something to discover
   downstream, and the buffer is already in hand so it costs nothing. */
function verifyOutput(buf, label, expectImages, expectWebp) {
  const {json, bin} = readGlb(buf, label);
  const images = json.images || [];
  if (images.length !== expectImages) throw new Error(label + ': image count ' + images.length + ' != ' + expectImages);
  for (const view of (json.bufferViews || [])) {
    const start = view.byteOffset || 0;
    if (start < 0 || start + view.byteLength > bin.length) throw new Error(label + ': bufferView out of range');
  }
  let webp = 0;
  for (const img of images) {
    if (img.bufferView === undefined) throw new Error(label + ': image lost its bufferView');
    if (img.mimeType !== 'image/webp') continue;
    webp++;
    const at = json.bufferViews[img.bufferView].byteOffset || 0;
    if (bin.toString('latin1', at, at + 4) !== 'RIFF' || bin.toString('latin1', at + 8, at + 12) !== 'WEBP')
      throw new Error(label + ': image marked image/webp is not a RIFF/WEBP payload');
  }
  if (webp !== expectWebp) throw new Error(label + ': ' + webp + ' webp images, expected ' + expectWebp);
  if (!webp) return;
  if (!(json.extensionsUsed || []).includes(WEBP_EXT)) throw new Error(label + ': extensionsUsed missing ' + WEBP_EXT);
  if (!(json.extensionsRequired || []).includes(WEBP_EXT)) throw new Error(label + ': extensionsRequired missing ' + WEBP_EXT);
  for (const tex of (json.textures || [])) {
    const ext = tex.extensions && tex.extensions[WEBP_EXT];
    if (!ext) continue;
    if (json.images[ext.source] === undefined) throw new Error(label + ': ' + WEBP_EXT + '.source is out of range');
    if (json.images[ext.source].mimeType !== 'image/webp') throw new Error(label + ': ' + WEBP_EXT + '.source is not a webp image');
  }
}

/* ------------------------------------------------------------------- one model */
async function processModel(rel, worker, tally) {
  const src = readFileSync(join(opts.in, rel));
  const {json, bin} = readGlb(src, rel);

  if ((json.buffers || []).length > 1) throw new Error(rel + ': ' + json.buffers.length + ' buffers, expected 1');
  for (const [i, view] of (json.bufferViews || []).entries()) {
    if ((view.buffer ?? 0) !== 0) throw new Error(rel + ': bufferView ' + i + ' points at buffer ' + view.buffer);
    if (view.extensions) throw new Error(rel + ': bufferView ' + i + ' carries ' + Object.keys(view.extensions) + ' — compressed views are not handled');
  }

  const images = json.images || [];
  const replacements = new Map();   // bufferView index -> webp bytes
  const converted = new Set();      // image index
  for (const [i, img] of images.entries()) {
    tally.imagesSeen++;
    if (img.bufferView === undefined) {tally.skipUri++; continue;}
    if (img.mimeType !== 'image/png') {tally.skipNotPng++; continue;}
    const view = json.bufferViews[img.bufferView];
    const at = view.byteOffset || 0;
    const png = bin.subarray(at, at + view.byteLength);
    if (png.length < 8 || png.readUInt32BE(0) !== PNG_MAGIC) {tally.skipNotPng++; continue;}
    let webp;
    try {
      webp = await worker.encode(png);
    } catch (err) {
      tally.imageErrors.push(rel + '#' + i + ' ' + (img.name || '') + ': ' + err.message);
      continue;
    }
    tally.pngBytes += png.length;
    if (webp.length >= png.length) {tally.skipBigger++; tally.keptPngBytes += png.length; continue;}
    tally.webpBytes += webp.length;
    tally.convertedImages++;
    replacements.set(img.bufferView, webp);
    converted.add(i);
  }

  const outPath = join(opts.out, rel);
  if (!converted.size) {
    if (!opts.dryRun) {mkdirSync(dirname(outPath), {recursive: true}); writeFileSync(outPath, src);}
    return {rel, before: src.length, after: src.length, converted: 0, images: images.length};
  }

  for (const i of converted) images[i].mimeType = 'image/webp';
  for (const tex of (json.textures || [])) {
    if (tex.source === undefined || !converted.has(tex.source)) continue;
    tex.extensions = tex.extensions || {};
    tex.extensions[WEBP_EXT] = {source: tex.source};
  }
  json.extensionsUsed = json.extensionsUsed || [];
  if (!json.extensionsUsed.includes(WEBP_EXT)) json.extensionsUsed.push(WEBP_EXT);
  json.extensionsRequired = json.extensionsRequired || [];
  if (!json.extensionsRequired.includes(WEBP_EXT)) json.extensionsRequired.push(WEBP_EXT);

  const out = writeGlb(json, rebuildBin(json, bin, replacements));
  verifyOutput(out, rel, images.length, converted.size);
  if (!opts.dryRun) {mkdirSync(dirname(outPath), {recursive: true}); writeFileSync(outPath, out);}
  return {rel, before: src.length, after: out.length, converted: converted.size, images: images.length};
}

/* ---------------------------------------------------------------------- driver */
function listGlb(dir) {
  return readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.glb'))
    .map(e => relative(dir, join(e.parentPath || e.path, e.name)).split(sep).join('/'))
    .sort();
}

const mb = n => (n / 1048576).toFixed(2) + ' MB';

async function main() {
  if (!statSync(opts.in).isDirectory()) throw new Error('--in ' + opts.in + ' is not a directory');
  const all = listGlb(opts.in);
  const models = all.slice(0, Math.min(all.length, opts.limit));
  console.log('compress-exploration-textures: ' + models.length + '/' + all.length + ' models  quality=' + opts.quality +
              ' method=6 concurrency=' + opts.concurrency + (opts.dryRun ? '  [DRY RUN — nothing written]' : ''));
  console.log('  in  ' + opts.in);
  console.log('  out ' + (opts.dryRun ? '(none)' : opts.out));

  const tally = {imagesSeen: 0, convertedImages: 0, pngBytes: 0, webpBytes: 0, keptPngBytes: 0,
                 skipBigger: 0, skipNotPng: 0, skipUri: 0, imageErrors: []};
  const results = [], failures = [];
  const workers = Array.from({length: opts.concurrency}, makeWorker);
  const started = Date.now();
  let next = 0, done = 0;

  await Promise.all(workers.map(async worker => {
    for (;;) {
      const i = next++;
      if (i >= models.length) return;
      const rel = models[i];
      try {
        const res = await processModel(rel, worker, tally);
        results.push(res); done++;
        console.log('  [' + String(done).padStart(3) + '/' + models.length + '] ' +
          (res.converted ? ('-' + mb(res.before - res.after)).padStart(12) : '   unchanged') + '  ' +
          mb(res.before).padStart(9) + ' -> ' + mb(res.after).padStart(9) + '  ' +
          res.converted + '/' + res.images + ' img  ' + rel);
      } catch (err) {
        done++; failures.push({rel, error: err.message});
        console.log('  [' + String(done).padStart(3) + '/' + models.length + '] FAILED  ' + rel + ': ' + err.message);
      }
    }
  }));
  for (const w of workers) w.close();
  cleanupWorker();

  const before = results.reduce((s, r) => s + r.before, 0);
  const after = results.reduce((s, r) => s + r.after, 0);
  const changed = results.filter(r => r.converted).length;
  console.log('\n--- summary ---------------------------------------------------');
  console.log('models            ' + results.length + ' ok, ' + failures.length + ' failed');
  console.log('  changed         ' + changed);
  console.log('  unchanged       ' + (results.length - changed) + '  (no images, or every image already smaller as PNG)');
  console.log('images            ' + tally.imagesSeen + ' seen, ' + tally.convertedImages + ' converted');
  console.log('  skipped larger  ' + tally.skipBigger + '  (' + mb(tally.keptPngBytes) + ' left as PNG)');
  console.log('  skipped non-png ' + tally.skipNotPng);
  console.log('  skipped no view ' + tally.skipUri);
  console.log('  encode errors   ' + tally.imageErrors.length);
  for (const e of tally.imageErrors.slice(0, 20)) console.log('      ' + e);
  console.log('texture payload   ' + mb(tally.pngBytes) + ' png -> ' + mb(tally.webpBytes) + ' webp   x' +
              (tally.pngBytes / Math.max(1, tally.webpBytes)).toFixed(2));
  console.log('pack total        ' + mb(before) + ' -> ' + mb(after) + '   -' + mb(before - after) + '  (' +
              (100 * (before - after) / Math.max(1, before)).toFixed(1) + '% smaller, x' + (before / Math.max(1, after)).toFixed(2) + ')');
  console.log('elapsed           ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
  for (const f of failures) console.log('FAILED ' + f.rel + ': ' + f.error);
  if (failures.length) process.exitCode = 1;
}

main().catch(err => {cleanupWorker(); console.error(err); process.exit(1);});
