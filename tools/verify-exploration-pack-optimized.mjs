#!/usr/bin/env node
/* The Galactic Exploration pack is not shippable until its models fit a budget.
 *
 * WHY THIS EXISTS
 * The pack is an OPTIONAL download for a mobile RTS. Today it is 541.8 MB, of
 * which 518.6 MB is 330 .glb models and only ~3.3 MB is actual module code. Half
 * the model bytes are raw PNG embedded inside the GLBs, and 327 of 330 models
 * carry no mesh compression at all. Nobody measured that until now, so nothing
 * stopped it growing. This file is the thing that stops it.
 *
 * THIS GATE FAILS TODAY. That is deliberate and it is the whole point. A budget
 * check written after the cleanup would only ever prove that the cleanup passed
 * the numbers chosen to let it pass. Written first, it names the offenders, and
 * the cleanup is finished when this exits 0 — not when someone says it looks
 * smaller.
 *
 * THE THRESHOLDS, AND WHY THESE ONES
 *   --max-model-mb 8        A single model streams on demand while the player is
 *                           already in the scene. 8 MB is roughly two seconds on
 *                           a good LTE link and is already generous for one prop;
 *                           past that the pop-in is visible. It is an outlier
 *                           cap, not a target — 330 models inside the pack
 *                           ceiling means a ~600 KB average.
 *   --max-png-share 0.40    The module's own GLTFLoader supports EXT_texture_webp
 *                           and KHR_texture_basisu. A model that is mostly raw
 *                           PNG is therefore not "big", it is unconverted. 40%
 *                           leaves room for legitimately texture-heavy hero art
 *                           without excusing a 61 MB PNG payload.
 *   --min-png-bytes 262144  The share rule only fires once a model actually
 *                           carries 256 KB of PNG. A 40 KB prop that happens to
 *                           be 55% a small PNG costs nothing and would only bury
 *                           the real offenders in noise. Every model skipped by
 *                           this floor is COUNTED AND PRINTED, so the exemption
 *                           stays visible instead of quietly shrinking the gate.
 *   --max-tris 60000        For a model with NO mesh compression, triangles are
 *                           paid twice: once in wire bytes, once in draw cost on
 *                           a phone GPU. 60k is about where a single background
 *                           structure stops being affordable in a scene that
 *                           holds dozens of them.
 *   --max-tris-compressed 240000
 *                           Draco/meshopt buy wire bytes, not GPU vertices. A 4x
 *                           allowance keeps the compression rule from being gamed
 *                           by encoding a million-triangle mesh and calling it
 *                           optimised.
 *   --max-pack-mb 200       The largest optional download we would ask a player
 *                           to take in one sitting. Note what it does NOT cover:
 *                           this ceiling is GLB bytes only. The ~20 MB of .webp
 *                           and ~3.3 MB of module code sit on top of it.
 *
 * HONEST LIMIT OF THE 200 MB CEILING: recompressing every embedded PNG to WebP at
 * the ratio measured on this art does NOT reach it on its own. No Draco or
 * meshopt ENCODER exists in this repo, so the remaining gap needs either an
 * encoder or fewer models. The ceiling is set where the download should be, not
 * where today's toolchain can cheaply get it.
 *
 * WHAT IT MEASURES, AND HOW
 * Reads only each GLB header and JSON chunk — never the whole BIN — so a 518 MB
 * pack scans in seconds. Embedded image bytes come from the bufferView each image
 * points at, deduped so two images sharing a view are not double counted, and the
 * codec is SNIFFED from the first bytes in the BIN rather than trusted from the
 * optional mimeType field (mismatches are reported). Triangles are counted per
 * unique mesh, not per node instance, because that is what the file stores; the
 * primitive mode is honoured (strips and fans are n-2, points and lines are 0).
 *
 * Usage:
 *   node tools/verify-exploration-pack-optimized.mjs
 *   node tools/verify-exploration-pack-optimized.mjs --dir <path> --json out.json
 *   node tools/verify-exploration-pack-optimized.mjs --max-pack-mb 260
 * Exit: 0 if every model and the pack total are inside budget, 1 otherwise. */
import { open, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MB = 1024 * 1024;
const BUDGET_LEDGER = resolve(root, 'modules/space_exploration/assets/source/EXCLUDED_OVERSIZE_V1.json');
const RUNTIME_EXCLUSION_LEDGERS = [
  BUDGET_LEDGER,
  resolve(root, 'modules/space_exploration/assets/source/blender/world-kits/DISCARDED_VISUAL_QUALITY_2026-09-05.json'),
  resolve(root, 'modules/space_exploration/assets/source/blender/world-kits/DISCARDED_STAGE10_PACK_FAILURES.json'),
  resolve(root, 'modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_STAGE10_SPLINE_EXCLUSIONS.json'),
  resolve(root, 'modules/space_exploration/assets/source/spline/world-prefabs/DISCARDED_SPLINE_PROPS.json')
];

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  return argv[i + 1];
}
function num(name, fallback) {
  const raw = flag(name, null);
  if (raw === null) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) { console.log(`FAIL  ${name} needs a non-negative number, got "${raw}"`); process.exit(1); }
  return v;
}

const dir = resolve(root, flag('--dir', 'modules/space_exploration/assets/runtime'));
const jsonOut = flag('--json', null);
const LIMITS = {
  maxModelBytes: num('--max-model-mb', 8) * MB,
  maxPngShare: num('--max-png-share', 0.40),
  minPngBytes: num('--min-png-bytes', 262144),
  maxTris: num('--max-tris', 60000),
  maxTrisCompressed: num('--max-tris-compressed', 240000),
  maxPackBytes: num('--max-pack-mb', 200) * MB
};
const topN = num('--top', 20);

async function readBudgetDecisions() {
  const excluded = new Set();
  for (const ledger of RUNTIME_EXCLUSION_LEDGERS) {
    const data = JSON.parse((await readFile(ledger, 'utf8')).replace(/^\uFEFF/, ''));
    if (data.runtimeAllowed === true) continue;
    for (const path of data.runtimePaths || []) excluded.add(String(path).replace(/^assets\/runtime\//, ''));
    for (const entry of data.entries || []) {
      if (entry?.runtimeAllowed === true || !entry?.path) continue;
      excluded.add(String(entry.path).replace(/^assets\/runtime\//, ''));
    }
  }
  const data = JSON.parse((await readFile(BUDGET_LEDGER, 'utf8')).replace(/^\uFEFF/, ''));
  const exceptions = new Map();
  for (const entry of data.keptDespiteSize || []) {
    if (entry?.runtimeAllowed !== true || !entry?.path || !Array.isArray(entry.budgetExceptions)) continue;
    exceptions.set(String(entry.path).replace(/^assets\/runtime\//, ''), {
      rules: new Set(entry.budgetExceptions.map(String)),
      reason: entry.reason || 'explicit owner keep decision'
    });
  }
  return { excluded, exceptions };
}

const budgetDecisions = await readBudgetDecisions();

const MESH_COMPRESSION = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];
const GPU_TEXTURE_EXT = ['KHR_texture_basisu'];

/* ---- GLB parsing ------------------------------------------------------- */
const GLB_MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;

function sniffCodec(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 8 && buf[0] === 0xab && buf[1] === 0x4b && buf[2] === 0x54 && buf[3] === 0x58) return 'ktx2';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'DDS ') return 'dds';
  return 'unknown';
}

function primTriangles(gltf, prim) {
  const mode = prim.mode === undefined ? 4 : prim.mode;
  if (mode < 4) return 0;
  const accessors = gltf.accessors || [];
  let count = 0;
  if (prim.indices !== undefined && accessors[prim.indices]) count = accessors[prim.indices].count || 0;
  else if (prim.attributes && prim.attributes.POSITION !== undefined && accessors[prim.attributes.POSITION]) count = accessors[prim.attributes.POSITION].count || 0;
  if (!count) return 0;
  if (mode === 4) return Math.floor(count / 3);
  return Math.max(0, count - 2);
}

async function scanGlb(file) {
  const fh = await open(file, 'r');
  try {
    const stat = await fh.stat();
    const head = Buffer.alloc(12);
    const got = (await fh.read(head, 0, 12, 0)).bytesRead;
    if (got < 12 || head.readUInt32LE(0) !== GLB_MAGIC) return { error: 'not a GLB (bad magic)', fileBytes: stat.size };

    let cursor = 12, json = null, binStart = -1, binLen = 0;
    const declared = head.readUInt32LE(8);
    const end = Math.min(declared || stat.size, stat.size);
    const ch = Buffer.alloc(8);
    while (cursor + 8 <= end) {
      if ((await fh.read(ch, 0, 8, cursor)).bytesRead < 8) break;
      const len = ch.readUInt32LE(0), type = ch.readUInt32LE(4);
      const dataAt = cursor + 8;
      if (type === CHUNK_JSON && json === null) {
        const body = Buffer.alloc(len);
        await fh.read(body, 0, len, dataAt);
        json = body.toString('utf8').replace(/\0+$/, '');
      } else if (type === CHUNK_BIN && binStart === -1) {
        binStart = dataAt; binLen = len;
      }
      cursor = dataAt + len + ((4 - (len % 4)) % 4);
      if (json !== null && binStart !== -1) break;
    }
    if (json === null) return { error: 'no JSON chunk', fileBytes: stat.size };

    let gltf;
    try { gltf = JSON.parse(json); } catch (e) { return { error: `unparseable JSON chunk: ${e.message}`, fileBytes: stat.size }; }

    const used = gltf.extensionsUsed || [];
    const meshCompression = MESH_COMPRESSION.filter((x) => used.includes(x));
    const gpuTexture = GPU_TEXTURE_EXT.filter((x) => used.includes(x));

    let triangles = 0, primitives = 0;
    for (const mesh of gltf.meshes || []) {
      for (const prim of mesh.primitives || []) { triangles += primTriangles(gltf, prim); primitives += 1; }
    }

    const views = gltf.bufferViews || [];
    const codecBytes = Object.create(null);
    const seenViews = new Set();
    let externalImages = 0, mimeMismatches = 0, embeddedImages = 0;
    const sniffBuf = Buffer.alloc(12);
    for (const img of gltf.images || []) {
      if (img.bufferView === undefined) { externalImages += 1; continue; }
      if (seenViews.has(img.bufferView)) continue;
      seenViews.add(img.bufferView);
      const bv = views[img.bufferView];
      if (!bv) continue;
      embeddedImages += 1;
      const bytes = bv.byteLength || 0;
      let codec = 'unknown';
      if (binStart !== -1 && bytes > 0) {
        const at = binStart + (bv.byteOffset || 0);
        if (at + 12 <= stat.size) { sniffBuf.fill(0); await fh.read(sniffBuf, 0, 12, at); codec = sniffCodec(sniffBuf); }
      }
      if (codec === 'unknown' && img.mimeType) codec = String(img.mimeType).split('/').pop().toLowerCase();
      else if (img.mimeType && codec !== 'unknown' && !String(img.mimeType).toLowerCase().includes(codec)) mimeMismatches += 1;
      codecBytes[codec] = (codecBytes[codec] || 0) + bytes;
    }

    const imageBytes = Object.values(codecBytes).reduce((a, b) => a + b, 0);
    return {
      fileBytes: stat.size, binBytes: binLen, jsonBytes: json.length,
      triangles, primitives, meshes: (gltf.meshes || []).length,
      nodes: (gltf.nodes || []).length, materials: (gltf.materials || []).length,
      extensionsUsed: used, meshCompression, gpuTexture,
      codecBytes, imageBytes,
      pngBytes: codecBytes.png || 0, jpegBytes: codecBytes.jpeg || 0, webpBytes: codecBytes.webp || 0,
      embeddedImages, externalImages, mimeMismatches,
      generator: (gltf.asset && gltf.asset.generator) || null
    };
  } finally { await fh.close(); }
}

/* ---- walk -------------------------------------------------------------- */
async function walk(d, acc = []) {
  let entries;
  try { entries = await readdir(d, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = resolve(d, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.glb')) acc.push(p);
  }
  return acc;
}

const allFiles = (await walk(dir)).sort();
const files = allFiles.filter(file => !budgetDecisions.excluded.has(relative(dir, file).split(sep).join('/')));
console.log(`Exploration pack model budget — ${relative(root, dir).split(sep).join('/') || dir}`);
console.log(`Limits: model<=${(LIMITS.maxModelBytes / MB).toFixed(1)}MB  png-share<=${(LIMITS.maxPngShare * 100).toFixed(0)}% (over ${(LIMITS.minPngBytes / 1024).toFixed(0)}KB png)  tris<=${LIMITS.maxTris} (${LIMITS.maxTrisCompressed} if mesh-compressed)  pack<=${(LIMITS.maxPackBytes / MB).toFixed(0)}MB`);
if (allFiles.length !== files.length) console.log(`Ledger: excluded ${allFiles.length - files.length} non-runtime model(s) from the delivery scan.`);

if (!files.length) { console.log(`FAIL  no .glb found under ${dir} — this gate would pass vacuously.`); process.exit(1); }

const models = [];
const parseErrors = [];
for (const f of files) {
  const rel = relative(root, f).split(sep).join('/');
  const m = await scanGlb(f);
  if (m.error) { parseErrors.push({ path: rel, error: m.error, bytes: m.fileBytes || 0 }); continue; }
  const collection = relative(dir, dirname(f)).split(sep).join('/') || '.';
  models.push({ path: rel, runtimeRelativePath: relative(dir, f).split(sep).join('/'), name: f.split(/[\\/]/).pop(), collection, ...m });
}

if (parseErrors.length) {
  console.log(`FAIL  ${parseErrors.length} file(s) could not be parsed as GLB:`);
  for (const e of parseErrors.slice(0, 10)) console.log(`        ${e.path}  ${e.error}`);
  process.exit(1);
}

/* Self-checks: a gate that silently measures zero is worse than no gate. */
const packBytes = models.reduce((a, m) => a + m.fileBytes, 0);
const packTris = models.reduce((a, m) => a + m.triangles, 0);
const packImage = models.reduce((a, m) => a + m.imageBytes, 0);
if (packTris === 0) { console.log('FAIL  parsed every model and found 0 triangles — the parser is broken, not the pack.'); process.exit(1); }
if (packImage === 0 && packBytes > 50 * MB) { console.log('FAIL  parsed every model and found 0 embedded image bytes in a >50MB pack — the parser is broken, not the pack.'); process.exit(1); }

/* ---- rules ------------------------------------------------------------- */
const violations = [];
const exceptionsApplied = [];
function addViolation(rule, model, detail, sortBy) {
  const decision = budgetDecisions.exceptions.get(model.runtimeRelativePath);
  if (decision?.rules.has(rule)) {
    exceptionsApplied.push({ rule, path: model.path, detail, reason: decision.reason });
    return;
  }
  violations.push({ rule, path: model.path, detail, sortBy });
}
let pngFloorSkips = 0;
for (const m of models) {
  const compressed = m.meshCompression.length > 0;
  const share = m.fileBytes ? m.pngBytes / m.fileBytes : 0;
  if (m.fileBytes > LIMITS.maxModelBytes) {
    addViolation('MODEL_SIZE', m, `${(m.fileBytes / MB).toFixed(1)}MB > ${(LIMITS.maxModelBytes / MB).toFixed(1)}MB`, m.fileBytes);
  }
  if (m.pngBytes >= LIMITS.minPngBytes) {
    if (share > LIMITS.maxPngShare) {
      addViolation('RAW_PNG_SHARE', m, `${(m.pngBytes / MB).toFixed(1)}MB PNG = ${(share * 100).toFixed(0)}% of ${(m.fileBytes / MB).toFixed(1)}MB > ${(LIMITS.maxPngShare * 100).toFixed(0)}%`, m.pngBytes);
    }
  } else if (m.pngBytes > 0 && share > LIMITS.maxPngShare) pngFloorSkips += 1;
  if (!compressed && m.triangles > LIMITS.maxTris) {
    addViolation('TRIANGLE_BUDGET', m, `${m.triangles.toLocaleString('en-US')} tris, no mesh compression > ${LIMITS.maxTris.toLocaleString('en-US')}`, m.triangles);
  }
  if (compressed && m.triangles > LIMITS.maxTrisCompressed) {
    addViolation('COMPRESSED_TRIANGLE_BUDGET', m, `${m.triangles.toLocaleString('en-US')} tris with ${m.meshCompression.join('+')} > ${LIMITS.maxTrisCompressed.toLocaleString('en-US')}`, m.triangles);
  }
}
const packOver = packBytes > LIMITS.maxPackBytes;

/* ---- report ------------------------------------------------------------ */
const uncompressed = models.filter((m) => !m.meshCompression.length);
const withPng = models.filter((m) => m.pngBytes > 0);
const packPng = models.reduce((a, m) => a + m.pngBytes, 0);
console.log('');
console.log(`Scanned ${models.length} model(s), ${(packBytes / MB).toFixed(1)}MB, ${packTris.toLocaleString('en-US')} triangles.`);
console.log(`  embedded images: ${(packImage / MB).toFixed(1)}MB  (PNG ${(packPng / MB).toFixed(1)}MB in ${withPng.length} models, WebP ${(models.reduce((a, m) => a + m.webpBytes, 0) / MB).toFixed(1)}MB, JPEG ${(models.reduce((a, m) => a + m.jpegBytes, 0) / MB).toFixed(1)}MB)`);
console.log(`  no mesh compression: ${uncompressed.length}/${models.length} models, ${(uncompressed.reduce((a, m) => a + m.fileBytes, 0) / MB).toFixed(1)}MB`);
const mism = models.reduce((a, m) => a + m.mimeMismatches, 0);
if (mism) console.log(`  NOTE ${mism} image(s) whose declared mimeType disagrees with the sniffed bytes (sniff wins).`);
if (pngFloorSkips) console.log(`  NOTE ${pngFloorSkips} model(s) exceed the PNG share but sit under the ${(LIMITS.minPngBytes / 1024).toFixed(0)}KB floor, so RAW_PNG_SHARE did not fire on them.`);
if (exceptionsApplied.length) {
  console.log(`  NOTE ${exceptionsApplied.length} explicit owner budget exception(s) applied:`);
  for (const entry of exceptionsApplied) console.log(`       ${entry.rule}  ${entry.path}  ${entry.detail}`);
}

const byRule = new Map();
for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) || 0) + 1);

if (violations.length || packOver) {
  console.log('');
  console.log('VIOLATIONS');
  for (const rule of ['MODEL_SIZE', 'RAW_PNG_SHARE', 'TRIANGLE_BUDGET', 'COMPRESSED_TRIANGLE_BUDGET']) {
    const list = violations.filter((v) => v.rule === rule).sort((a, b) => b.sortBy - a.sortBy);
    if (!list.length) continue;
    console.log(`  ${rule}: ${list.length} model(s)`);
    for (const v of list.slice(0, topN)) console.log(`      ${v.path}  ${v.detail}`);
    if (list.length > topN) console.log(`      ... and ${list.length - topN} more (use --json for the full list)`);
  }
  if (packOver) {
    console.log('  PACK_BUDGET: 1 pack');
    console.log(`      ${models.length} models total ${(packBytes / MB).toFixed(1)}MB > ${(LIMITS.maxPackBytes / MB).toFixed(0)}MB ceiling (over by ${((packBytes - LIMITS.maxPackBytes) / MB).toFixed(1)}MB)`);
  }
}

if (jsonOut) {
  const out = resolve(root, jsonOut);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dir: relative(root, dir).split(sep).join('/'),
    limits: LIMITS,
    totals: { models: models.length, bytes: packBytes, triangles: packTris, imageBytes: packImage, pngBytes: packPng, uncompressedModels: uncompressed.length, pngFloorSkips, mimeMismatches: mism },
    ruleCounts: { ...Object.fromEntries(byRule), PACK_BUDGET: packOver ? 1 : 0 },
    excludedByLedger: allFiles.length - files.length,
    exceptionsApplied,
    violations,
    models
  }, null, 2));
  console.log('');
  console.log(`Wrote ${relative(root, out).split(sep).join('/')}`);
}

console.log('');
if (!violations.length && !packOver) {
  console.log(`PASS  ${models.length} model(s), ${(packBytes / MB).toFixed(1)}MB — inside every budget.`);
  process.exit(0);
}
const total = violations.length + (packOver ? 1 : 0);
console.log(`FAIL  ${total} budget violation(s) across ${new Set(violations.map((v) => v.path)).size} model(s)${packOver ? ' plus the pack ceiling' : ''}.`);
process.exit(1);
