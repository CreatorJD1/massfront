/* GLB -> game geometry importer.
   Parses a GLB file, extracts meshes, maps materials to the MAT atlas,
   and writes MF_BLENDER_GEO entries into assets/data/meshes.js.

   Usage:
     node tools/glb_import.mjs design/tripo/rock/model.glb --name mdlRock
     node tools/glb_import.mjs --all
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const matSrc = readFileSync(join(root, 'src/engine/materials.js'), 'utf8');
const MAT = {};
for (const m of matSrc.matchAll(/([A-Z_]+)\s*:\s*(\d+)/g)) MAT[m[1]] = +m[2];

const MAT_MAP = {
  plate:0, metal:0, steel:0, armor:0, hull:0, body:0, panel:0,
  greeble:1, mech:1, machine:1, detail:1, grill:1, vent:1,
  tread:2, track:2, rubber:2,
  trim:3, chrome:3, edge:3, frame:3,
  glass:4, window:4, lens:4, screen:4,
  lamp:5, light:5, emissive:5, glow:5, neon:5, led:5,
  concrete:6, cement:6, plaster:6, pavement:6, foundation:6,
  rust:7, rusty:7, corroded:7, oxide:7,
  chitin:8, organic:8, bio:8, flesh:8, creature:8,
  earth:9, dirt:9, ground:9, soil:9, mud:9, boulder:9,
  warn:10, warning:10, hazard:10, stripe:10,
  brass:11, gold:11, copper:11, bronze:11,
  stone:12, granite:12, marble:12,
  leaf:13, tree:13, plant:13, wood:13, bark:13, foliage:13, branch:13,
  sand:14, desert:14, dune:14, dust:14,
  crystal:15, gem:15, ice:15, mineral:15, quartz:15,
  build:16, wall:16, brick:16, facade:16, structure:16, tower:16,
  roof:17, ceiling:17, deck:17, tile:17,
};

function guessMat(name) {
  if (!name) return MAT.PLATE;
  const n = name.toLowerCase();
  for (const [key, id] of Object.entries(MAT_MAP)) {
    if (n.includes(key)) return id;
  }
  return MAT.PLATE;
}

function parseGLB(buf) {
  if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('not a GLB');
  let off = 12, jsonChunk = null, binChunk = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) jsonChunk = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004E4942) binChunk = chunk;
    off += 8 + len + (len % 4 ? 4 - len % 4 : 0);
  }
  if (!jsonChunk || !binChunk) throw new Error('malformed GLB');
  return { json: jsonChunk, bin: binChunk };
}

function getAccessor(glb, idx, posOffset) {
  const acc = glb.json.accessors[idx];
  const view = glb.json.bufferViews[acc.bufferView];
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0) + (posOffset || 0);
  const compSize = { 5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4 }[acc.componentType];
  const numComp = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 }[acc.type];
  if (!compSize || !numComp) return null;
  const stride = view.byteStride || compSize * numComp;
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const base = start + i * stride;
    const v = [];
    for (let c = 0; c < numComp; c++) {
      const o2 = base + c * compSize;
      if (acc.componentType === 5126) v.push(glb.bin.readFloatLE(o2));
      else if (acc.componentType === 5125) v.push(glb.bin.readUInt32LE(o2));
      else if (acc.componentType === 5121) v.push(glb.bin.readUInt8(o2));
      else if (acc.componentType === 5123) v.push(glb.bin.readUInt16LE(o2));
      else if (acc.componentType === 5122) v.push(glb.bin.readInt16LE(o2));
      else if (acc.componentType === 5120) v.push(glb.bin.readInt8(o2));
    }
    out.push(v);
  }
  return out;
}

/* Face subsampling with vertex remapping. Reads all verts + faces, subsamples
   faces to the triangle budget, then remaps vertex indices so only the verts
   actually referenced by surviving faces are emitted. */
function glbToGame(glbPath, outName, userScale, maxTris) {
  maxTris = maxTris || 2000;
  const buf = readFileSync(glbPath);
  const glb = parseGLB(buf);
  const gltf = glb.json;
  const mesh = gltf.meshes[0];
  const materials = gltf.materials || [];
  const sc = userScale || 1;
  const POS_OFFSET = parseInt(args.includes('--pos-offset') ? args[args.indexOf('--pos-offset')+1] : '0', 10);

  /* Phase 1: read all vertices as flat float arrays (12 floats each) and faces */
  const flatVerts = [];  /* flat: v0x,v0y,...,v11x, v1x,v1y,... */
  const allFaces = [];   /* each: [a,b,c] into flatVerts indices */
  let voff = 0;

  for (const prim of mesh.primitives) {
    const posArr = prim.attributes.POSITION != null ? getAccessor(glb, prim.attributes.POSITION, POS_OFFSET) : null;
    const nrmArr = prim.attributes.NORMAL != null ? getAccessor(glb, prim.attributes.NORMAL) : null;
    const uvArr  = prim.attributes.TEXCOORD_0 != null ? getAccessor(glb, prim.attributes.TEXCOORD_0) : null;
    const colArr = prim.attributes.COLOR_0 != null ? getAccessor(glb, prim.attributes.COLOR_0) : null;
    const idxRaw = prim.indices != null ? getAccessor(glb, prim.indices) : null;
    if (!posArr) continue;
    const matId = guessMat(materials[prim.material || 0]?.name || '');
    const mid = ((matId + 1) + 0.5 / 128);

    for (let i = 0; i < posArr.length; i++) {
      const p = posArr[i], n = nrmArr ? nrmArr[i] : [0,1,0];
      const uv = uvArr ? uvArr[i] : [0,0];
      const c = colArr ? colArr[i] : [1,1,1];
      const r = Math.round(Math.min(255, Math.max(0, c[0]*255)));
      const g = Math.round(Math.min(255, Math.max(0, c[1]*255)));
      const b = Math.round(Math.min(255, Math.max(0, c[2]*255)));
      flatVerts.push(
        p[0]*sc, p[1]*sc, p[2]*sc,
        n[0], n[1], n[2],
        r/255, g/255, b/255,
        uv[0]*0.055, uv[1]*0.055,
        mid
      );
    }

    if (idxRaw) {
      for (let i = 0; i < idxRaw.length; i += 3)
        allFaces.push([voff + idxRaw[i][0], voff + idxRaw[i+1][0], voff + idxRaw[i+2][0]]);
    } else {
      for (let i = 0; i < posArr.length; i += 3)
        allFaces.push([voff + i, voff + i+1, voff + i+2]);
    }
    voff += posArr.length;
  }

  /* Phase 2: subsample faces */
  const step = Math.max(1, Math.ceil(allFaces.length / maxTris));
  const sampledFaces = [];
  for (let i = 0; i < allFaces.length; i += step) {
    const f = allFaces[i];
    if (f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2])
      sampledFaces.push(f);
  }

  /* Phase 3: remap vertex indices — only emit verts used by surviving faces */
  const usedSet = new Set();
  for (const f of sampledFaces) { usedSet.add(f[0]); usedSet.add(f[1]); usedSet.add(f[2]); }
  const oldToNew = new Map();
  const newVerts = [];
  let newIdx = 0;
  for (const oldIdx of usedSet) {
    oldToNew.set(oldIdx, newIdx++);
    for (let j = 0; j < 12; j++) newVerts.push(flatVerts[oldIdx * 12 + j]);
  }

  const outIndices = [];
  for (const f of sampledFaces) {
    outIndices.push(oldToNew.get(f[0]), oldToNew.get(f[1]), oldToNew.get(f[2]));
  }

  const fmt = a => '[' + Array.from(a).map(x => +x.toFixed(4)).join(',') + ']';
  const tris = outIndices.length / 3, verts = newVerts.length / 12;
  const body = `MF_BLENDER_GEO[${JSON.stringify(outName)}]={v:new Float32Array(${fmt(newVerts)}),i:new Uint16Array(${fmt(outIndices)}),count:${outIndices.length}};\n`;
  return { body, tris, verts };
}

const SLOTS = [
  ['mdlCityTower',1,3000],['mdlCityDome',1,3000],['mdlCityHall',1,3000],['mdlCityTank',1,3000],
  ['mdlCivicBlock',1,3000],['mdlRelicT',1,3000],['mdlRelicD',1,3000],['mdlRelicI',1,3000],['mdlRelicK',1,3000],
  ['rock',0.6,1500],['tree',0.8,1500],['crystal',0.5,1200],['dep',0.5,1200],['mdlGeyser',0.5,1200],['mdlBerm',0.7,1500],
  ['mdlWreck',0.8,2000],['mdlCrate',0.4,800],
];

if (args.includes('--all')) {
  let out = `/* GENERATED by tools/glb_import.mjs -- do not hand-edit. */\n`;
  let total = 0;
  for (const [slot, scale, mt] of SLOTS) {
    const p = join(root, 'design/tripo', slot, 'model.glb');
    if (!existsSync(p)) { console.log('SKIP ' + slot + ' (no GLB)'); continue; }
    try {
      const r = glbToGame(p, slot, scale, mt);
      out += r.body; total += r.tris;
      console.log(slot + ': ' + r.tris + ' tris, ' + r.verts + ' verts (scale ' + scale + ', budget ' + mt + ')');
    } catch(e) { console.error('ERR ' + slot + ': ' + e.message); }
  }
  writeFileSync(join(root, 'assets/data/meshes.js'), out, 'utf8');
  console.log('TOTAL: ' + total + ' triangles -> assets/data/meshes.js');
} else {
  const glbFile = args.find(a => !a.startsWith('--'));
  if (!glbFile) { console.error('usage: node tools/glb_import.mjs <file.glb> --name <name>'); process.exit(1); }
  const ni = args.indexOf('--name');
  const outName = ni >= 0 ? args[ni+1] : glbFile.split(/[\\/]/).pop().replace('.glb','');
  const si = args.indexOf('--scale');
  const scale = si >= 0 ? parseFloat(args[si+1]) : 1;
  const r = glbToGame(resolve(root, glbFile), outName, scale);
  console.log(outName + ': ' + r.tris + ' tris, ' + r.verts + ' verts');
  writeFileSync(join(root, 'assets/data/meshes.js'),
    `/* GENERATED by tools/glb_import.mjs -- do not hand-edit. */\n${r.body}`, 'utf8');
}
