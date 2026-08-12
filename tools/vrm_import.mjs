/* VRoid/VRM -> MASSFRONT unit geometry.

   WHY THIS EXISTS
   The art direction wants real humanoid soldiers for the two human factions,
   authored in VRoid rather than assembled from primitives. A .vrm file is a
   glTF-2.0 binary with a humanoid rig extension, which gives us three things a
   raw mesh would not: a known scale (metres), a known facing, and named bones —
   enough to re-pose the arms out of the T-pose and drop the character into the
   game's coordinate system automatically.

   WHAT IT DOES
     1. Parses the GLB container (JSON chunk + BIN chunk; no dependencies).
     2. Reads every mesh primitive: POSITION, NORMAL, TEXCOORD_0, indices,
        JOINTS_0/WEIGHTS_0, and the node/skin tables.
     3. Applies linear-blend skinning at a SINGLE authored pose: the bind pose
        with the upper arms rotated down (~62 deg). VRoid characters ship in
        T-pose, and a T-posed soldier on a battlefield reads as a crash.
        Runtime animation stays the engine's job — the walk shader — because
        the instanced renderer carries one float per unit, not a bone palette.
     4. Converts coordinates: glTF +Y up / character facing +Z (VRM1) or -Z
        (VRM0) -> game +Y up, nose +X, feet at y=0, scaled to --height.
     5. Decimates by vertex clustering to fit the per-role triangle budget —
        a VRoid export is 15-70k triangles and chaff gets ~1.4k.
     6. Maps materials: baseColorFactor becomes the vertex colour; names
        containing eye/glass -> GLASS, skin/face/body -> CONC (matte), hair ->
        TREAD (soft, non-metal), everything else -> PLATE. A slot whose name
        ends in _TEAM becomes faction livery.
     7. Emits an entry into assets/data/meshes.js keyed by UNIT_MDL slot, which
        initModels() prefers over the procedural builder for that unit.

   LICENSING — read this before shipping a model. VRoid Hub downloads carry
   per-model licences; many forbid redistribution or commercial use. Only feed
   this tool models you have the rights to ship (your own VRoid Studio exports
   are yours). This tool does not and cannot check that for you.

   USAGE
     node tools/vrm_import.mjs soldier.vrm --slot 0 --height 8.6 \
         [--budget 1400] [--pose 62] [--out assets/data/meshes.js] [--append]
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const has = n => args.includes('--' + n);
if (!file) { console.error('usage: node tools/vrm_import.mjs <model.vrm> --slot <unitIndex> [--height 8.6] [--budget 1400]'); process.exit(1); }
const SLOT = +opt('slot', 0), HEIGHT = +opt('height', 8.6), BUDGET = +opt('budget', 1400);
const POSE = +opt('pose', 62) * Math.PI / 180;
const OUT = opt('out', 'assets/data/meshes.js');

/* ---- GLB container ------------------------------------------------------- */
const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546C67) { console.error('not a GLB/VRM file'); process.exit(1); }
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const chunk = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004E4942) bin = chunk;
  off += 8 + len + (len % 4 ? 4 - len % 4 : 0);
}
if (!json || !bin) { console.error('malformed GLB: missing JSON or BIN chunk'); process.exit(1); }

/* ---- accessors ----------------------------------------------------------- */
const CTYPE = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function acc(i) {
  if (i == null) return null;
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const T = CTYPE[a.componentType], n = NCOMP[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride ? bv.byteStride / T.BYTES_PER_ELEMENT : n;
  const src = new T(bin.buffer, bin.byteOffset + start, a.count * (bv.byteStride ? stride : n));
  if (!bv.byteStride || stride === n) return { d: src, n, count: a.count, norm: !!a.normalized };
  const out = new T(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = src[k * stride + c];
  return { d: out, n, count: a.count, norm: !!a.normalized };
}

/* ---- node world matrices -------------------------------------------------- */
const M = {
  ident: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  mul(a, b) { const o = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s2 = 0; for (let k = 0; k < 4; k++) s2 += a[k * 4 + c] * b[r * 4 + k]; o[r * 4 + c] = s2; } return o; },
  fromTRS(t, q, s) {
    const [x, y, z, w] = q || [0, 0, 0, 1], [sx, sy, sz] = s || [1, 1, 1], [tx, ty, tz] = t || [0, 0, 0];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
            (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
            (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
            tx, ty, tz, 1];
  },
  v3(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; },
  n3(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2], m[1]*v[0]+m[5]*v[1]+m[9]*v[2], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]]; },
};
const nodes = json.nodes || [];
const parent = new Array(nodes.length).fill(-1);
nodes.forEach((nd, i) => (nd.children || []).forEach(c => parent[c] = i));

/* The single authored pose: upper arms rotated down. VRM names the bones, so
   the rotation lands on the right nodes regardless of how the file is rigged. */
const vrm0 = json.extensions?.VRM, vrm1 = json.extensions?.VRMC_vrm;
const bones = {};
if (vrm1?.humanoid?.humanBones) for (const [k, v] of Object.entries(vrm1.humanoid.humanBones)) bones[k] = v.node;
else if (vrm0?.humanoid?.humanBones) for (const b of vrm0.humanoid.humanBones) bones[b.bone] = b.node;
const facing = vrm1 ? +1 : -1;   // VRM1 faces +Z, VRM0 faces -Z

const qmul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
                        a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const localRot = new Map();
for (const [name, sign] of [['leftUpperArm', +1], ['rightUpperArm', -1]]) {
  const ni = bones[name];
  if (ni == null) continue;
  /* Arms hang by rotating about the character's forward axis (Z), each side
     toward the body. Sign flips with VRM facing. */
  const half = POSE / 2 * sign * facing;
  localRot.set(ni, [0, 0, Math.sin(half), Math.cos(half)]);
}
const world = new Array(nodes.length).fill(null);
function worldOf(i) {
  if (world[i]) return world[i];
  const nd = nodes[i];
  let q = nd.rotation || [0, 0, 0, 1];
  if (localRot.has(i)) q = qmul(q, localRot.get(i));
  const local = nd.matrix ? nd.matrix.slice() : M.fromTRS(nd.translation, q, nd.scale);
  return world[i] = parent[i] >= 0 ? M.mul(worldOf(parent[i]), local) : local;
}
function invert(m) {  // general 4x4 inverse (bind matrices are TRS, this is fine)
  const inv = new Array(16), a = m;
  inv[0]=a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
  inv[4]=-a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
  inv[8]=a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
  inv[12]=-a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
  inv[1]=-a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
  inv[5]=a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
  inv[9]=-a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
  inv[13]=a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
  inv[2]=a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
  inv[6]=-a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
  inv[10]=a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
  inv[14]=-a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
  inv[3]=-a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
  inv[7]=a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
  inv[11]=-a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
  inv[15]=a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
  let det=a[0]*inv[0]+a[1]*inv[4]+a[2]*inv[8]+a[3]*inv[12];
  det=det?1/det:0; return inv.map(x=>x*det);
}

/* ---- gather skinned triangles -------------------------------------------- */
function matOf(mi) {
  const mat = json.materials?.[mi] || {};
  const name = (mat.name || '').toLowerCase();
  const f = mat.pbrMetallicRoughness?.baseColorFactor || [0.8, 0.8, 0.8, 1];
  let game = 'PLATE', team = /_team$/.test(name);
  if (/eye|glass|visor/.test(name)) game = 'GLASS';
  else if (/skin|face|body/.test(name)) game = 'CONC';
  else if (/hair/.test(name)) game = 'TREAD';
  return { game, team, col: [f[0], f[1], f[2]] };
}
const tris = [];   // each: [p(3),n(3),c(3),uv(2),mat,team] x3
for (const nd of nodes) if (nd.mesh != null) {
  const skin = nd.skin != null ? json.skins[nd.skin] : null;
  const jm = skin ? (() => {
    const ibm = acc(skin.inverseBindMatrices);
    return skin.joints.map((ji, k) => M.mul(worldOf(ji), ibm.d.slice(k * 16, k * 16 + 16)));
  })() : null;
  const base = worldOf(nodes.indexOf(nd));
  for (const prim of json.meshes[nd.mesh].primitives) {
    const P = acc(prim.attributes.POSITION), N = acc(prim.attributes.NORMAL);
    const UV = acc(prim.attributes.TEXCOORD_0);
    const J = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0);
    const I = acc(prim.indices);
    const m2 = matOf(prim.material);
    const vert = k => {
      let p = [P.d[k*3], P.d[k*3+1], P.d[k*3+2]];
      let n = N ? [N.d[k*3], N.d[k*3+1], N.d[k*3+2]] : [0,1,0];
      if (jm && J && W) {
        const wp = [0,0,0], wn = [0,0,0];
        const wnorm = W.norm ? 65535 : 1;   // WEIGHTS may be normalised uint16
        for (let c = 0; c < 4; c++) {
          const w = W.d[k*4+c] / (W.norm ? wnorm : 1);
          if (!w) continue;
          const jmtx = jm[J.d[k*4+c]];
          const tp = M.v3(jmtx, p), tn = M.n3(jmtx, n);
          for (let x = 0; x < 3; x++) { wp[x] += tp[x]*w; wn[x] += tn[x]*w; }
        }
        p = wp; n = wn;
      } else { p = M.v3(base, p); n = M.n3(base, n); }
      return { p, n, uv: UV ? [UV.d[k*2], UV.d[k*2+1]] : [0,0], ...m2 };
    };
    const count = I ? I.count : P.count;
    for (let k = 0; k + 2 < count; k += 3) {
      const a = vert(I ? I.d[k] : k), b = vert(I ? I.d[k+1] : k+1), c = vert(I ? I.d[k+2] : k+2);
      tris.push([a, b, c]);
    }
  }
}
if (!tris.length) { console.error('no triangles found'); process.exit(1); }

/* ---- orient + scale ------------------------------------------------------- */
let lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
for (const t of tris) for (const v of t) for (let x = 0; x < 3; x++) {
  lo[x] = Math.min(lo[x], v.p[x]); hi[x] = Math.max(hi[x], v.p[x]);
}
const scale = HEIGHT / Math.max(1e-6, hi[1] - lo[1]);
const rot = facing > 0 ? (p => [p[2], p[1], -p[0]]) : (p => [-p[2], p[1], p[0]]);  // face +X
for (const t of tris) for (const v of t) {
  v.p = rot([(v.p[0]-(lo[0]+hi[0])/2) * scale, (v.p[1]-lo[1]) * scale, (v.p[2]-(lo[2]+hi[2])/2) * scale]);
  v.n = rot(v.n);
}

/* ---- decimate by vertex clustering until inside budget -------------------- */
function build(cell) {
  const map = new Map(), verts = [], idx = [];
  const key = v => {
    const g = cell > 0 ? [Math.round(v.p[0]/cell), Math.round(v.p[1]/cell), Math.round(v.p[2]/cell)] : v.p;
    return g.join(',') + '|' + v.mat + '|' + v.team;
  };
  for (const t of tris) {
    const ii = t.map(v => {
      const k = key(v);
      let e = map.get(k);
      if (e == null) { e = verts.length; map.set(k, e); verts.push(v); }
      return e;
    });
    if (ii[0] !== ii[1] && ii[1] !== ii[2] && ii[0] !== ii[2]) idx.push(...ii);
  }
  return { verts, idx };
}
let cell = 0, out = build(0);
while (out.idx.length / 3 > BUDGET || out.verts.length > 65535) {
  cell = cell ? cell * 1.35 : HEIGHT / 64;
  out = build(cell);
  if (cell > HEIGHT) break;
}
console.log(`${file}: ${tris.length} tris in -> ${out.idx.length/3|0} tris / ${out.verts.length} verts out` +
            (cell ? ` (clustered at ${cell.toFixed(3)})` : ''));

/* ---- resolve materials against the real atlas ------------------------------ */
const matSrc = readFileSync(join(root, 'src/engine/materials.js'), 'utf8');
const MAT = {};
for (const m2 of matSrc.slice(matSrc.indexOf('const MAT={')).slice(0, 400).matchAll(/([A-Z_]+)\s*:\s*(\d+)/g)) MAT[m2[1]] = +m2[2];

const V = new Float32Array(out.verts.length * 12);
out.verts.forEach((v, k) => {
  const id = MAT[v.mat] ?? MAT.PLATE ?? 0;
  const nl = Math.hypot(...v.n) || 1;
  const o = k * 12;
  V[o]=v.p[0]; V[o+1]=v.p[1]; V[o+2]=v.p[2];
  V[o+3]=v.n[0]/nl; V[o+4]=v.n[1]/nl; V[o+5]=v.n[2]/nl;
  V[o+6]=v.col[0]; V[o+7]=v.col[1]; V[o+8]=v.col[2];
  V[o+9]=v.uv[0]; V[o+10]=v.uv[1];
  V[o+11]=((id + 1) + 1/128) * (v.team ? -1 : 1);   // bone -1: rigid; walk anim still applies via legs
});
const I2 = new Uint16Array(out.idx);
const f2 = a => '[' + Array.from(a).map(x => +(+x).toFixed(4)).join(',') + ']';
const entry = `MF_BLENDER_GEO[${SLOT}]={v:new Float32Array(${f2(V)}),i:new Uint16Array(${f2(I2)}),count:${I2.length}};\n`;
const header = `/* GENERATED — tools/vrm_import.mjs and tools/blender_import.mjs write here.\n   Slots override UNIT_MDL by index in initModels(). */\n`;
const outPath = isAbsolute(OUT) ? OUT : join(root, OUT);
let existing = has('append') && existsSync(outPath) ? readFileSync(outPath, 'utf8') : header;
if (!existing.startsWith('/* GENERATED')) existing = header;
writeFileSync(outPath, existing + entry, 'utf8');
console.log(`slot ${SLOT} -> ${OUT}`);
