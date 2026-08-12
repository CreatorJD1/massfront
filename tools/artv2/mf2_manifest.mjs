/* ============================================================================
   ART V2 TOOLKIT — shared Node library
   ----------------------------------------------------------------------------
   Manifest access, the JSON envelope every command returns, per-asset locking,
   provenance sidecars and GLB geometry inspection.

   WHY THIS EXISTS: the previous pipeline was one hand-written ~280-line Blender
   script per asset (bake-material-v2-tank.py vs -nova-factory.py differ by 360
   lines while doing the same thing). Asset identity was hardcoded, so a new
   bespoke pack meant a new file — which is why the repo has 181 texture triplets
   but only 2 authored packs. Everything asset-specific now lives in
   assets/data/art-v2-assets.json and everything generic lives in a library.

   AGENT CONTRACT: this toolkit is driven by several different AI agents as well
   as humans. Commands are non-interactive, idempotent, JSON-first and return
   deterministic exit codes so an agent can branch without scraping prose. See
   `agentContract` in the manifest.
   ============================================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync, statSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MANIFEST_PATH = join(ROOT, 'assets', 'data', 'art-v2-assets.json');
export const STATE_DIR = join(ROOT, '.artv2');
export const TOOL_VERSION = '1.0.0';

/* Exit codes are part of the contract — an agent branches on these. */
export const EXIT = { OK: 0, GATE: 1, USAGE: 2, ENV: 3, LOCKED: 4 };

/* ---------------------------------------------------------------- manifest */
export function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw Object.assign(new Error('manifest missing: assets/data/art-v2-assets.json'), { exit: EXIT.ENV });
  }
  const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!m.assets || typeof m.assets !== 'object') {
    throw Object.assign(new Error('manifest has no "assets" object'), { exit: EXIT.ENV });
  }
  return m;
}

export function saveManifest(m) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n');
}

/* Resolve the asset selector shared by every command: a key, or --all. */
export function selectAssets(manifest, selector) {
  const keys = Object.keys(manifest.assets);
  if (!selector || selector === '--all' || selector === 'all') return keys;
  if (!manifest.assets[selector]) {
    throw Object.assign(
      new Error(`unknown asset "${selector}". known: ${keys.join(', ') || '(none)'}`),
      { exit: EXIT.USAGE });
  }
  return [selector];
}

/* Budgets are class-derived so a new asset inherits limits without restating
   them; an asset may still override explicitly. */
export function budgetFor(manifest, key) {
  const a = manifest.assets[key];
  const cls = manifest.classBudgets?.[a.class];
  if (!cls) throw Object.assign(new Error(`asset ${key}: unknown class "${a.class}"`), { exit: EXIT.ENV });
  return { ...cls, ...(a.budgetOverride || {}) };
}

export const assetDir = (manifest, key) => join(ROOT, manifest.assets[key].dir);

/* ---------------------------------------------------------------- envelope */
/* ONE stable shape for every command. Agents parse this and nothing else. */
export function envelope({ ok = true, command, asset = null, data = {}, errors = [], warnings = [], next = [] }) {
  return { ok, command, asset, tool: TOOL_VERSION, data, errors, warnings, next };
}

export function emit(env, asJson) {
  if (asJson) { process.stdout.write(JSON.stringify(env, null, 2) + '\n'); return; }
  const tag = env.ok ? 'OK  ' : 'FAIL';
  console.log(`${tag} ${env.command}${env.asset ? ' ' + env.asset : ''}`);
  for (const [k, v] of Object.entries(env.data || {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') console.log(`  ${k}: ${JSON.stringify(v)}`);
    else console.log(`  ${k}: ${v}`);
  }
  for (const w of env.warnings) console.log(`  WARN  ${w}`);
  for (const e of env.errors) console.log(`  ERROR ${e}`);
  for (const n of env.next) console.log(`  NEXT  ${n}`);
}

/* ------------------------------------------------------------------- locks */
/* Several agents may run at once. Locks are per-asset so they can work
   different assets in parallel; a stale lock expires rather than deadlocking a
   pipeline when an agent is killed mid-run. */
const LOCK_STALE_MS = 30 * 60 * 1000;

export function acquireLock(asset, agent = process.env.ARTV2_AGENT || 'unknown') {
  const dir = join(STATE_DIR, 'locks');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${asset}.lock`);
  if (existsSync(path)) {
    let held = null;
    try { held = JSON.parse(readFileSync(path, 'utf8')); } catch { /* corrupt -> treat as stale */ }
    const age = Date.now() - (held?.at || 0);
    if (held && age < LOCK_STALE_MS) {
      throw Object.assign(
        new Error(`asset ${asset} is locked by agent "${held.agent}" (${Math.round(age / 1000)}s ago). Wait, pick another asset, or pass --force.`),
        { exit: EXIT.LOCKED });
    }
  }
  writeFileSync(path, JSON.stringify({ agent, at: Date.now(), pid: process.pid }));
  return () => { try { unlinkSync(path); } catch { /* already gone */ } };
}

/* -------------------------------------------------------------- provenance */
export function sha256(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
}

export function writeProvenance(dir, stage, data = {}) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `.artv2-${stage}.json`);
  const rec = {
    stage, tool: TOOL_VERSION,
    agent: process.env.ARTV2_AGENT || 'unknown',
    at: new Date().toISOString(),
    ...data,
  };
  writeFileSync(path, JSON.stringify(rec, null, 2) + '\n');
  return rec;
}

export function readProvenance(dir, stage) {
  const path = join(dir, `.artv2-${stage}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/* --------------------------------------------------------- GLB inspection */
/* Reads geometry counts straight from the glTF JSON chunk — no Blender needed,
   so budget gates run anywhere (CI, a Node-only agent) in milliseconds. */
export function glbInfo(path) {
  if (!existsSync(path)) return { exists: false, tris: 0, verts: 0, meshes: 0 };
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(20);
    readSync(fd, head, 0, 20, 0);
    if (head.readUInt32LE(0) !== 0x46546c67) return { exists: true, error: 'not a GLB' };
    const jsonLen = head.readUInt32LE(12);
    const jb = Buffer.alloc(jsonLen);
    readSync(fd, jb, 0, jsonLen, 20);
    const g = JSON.parse(jb.toString('utf8'));
    const acc = g.accessors || [];
    let tris = 0, verts = 0;
    for (const mesh of g.meshes || []) {
      for (const prim of mesh.primitives || []) {
        if (prim.indices != null && acc[prim.indices]) tris += acc[prim.indices].count / 3;
        else if (prim.attributes?.POSITION != null && acc[prim.attributes.POSITION]) tris += acc[prim.attributes.POSITION].count / 3;
        if (prim.attributes?.POSITION != null && acc[prim.attributes.POSITION]) verts += acc[prim.attributes.POSITION].count;
      }
    }
    return {
      exists: true, tris: Math.round(tris), verts,
      meshes: (g.meshes || []).length,
      materials: (g.materials || []).map(m => m.name).filter(Boolean),
      sizeMB: +(statSync(path).size / 1048576).toFixed(2),
    };
  } catch (e) {
    return { exists: true, error: e.message.slice(0, 120) };
  } finally { closeSync(fd); }
}

/* ------------------------------------------------------------------- PNG */
/* Dimensions + content hash. The hash is how we tell an AUTHORED pack from a
   GENERATED template: the 181 shipped triplets share only 25 unique NRE and 19
   unique Masks images, which no set of per-mesh bakes would ever do. */
export function pngInfo(path) {
  if (!existsSync(path)) return { exists: false };
  const b = readFileSync(path);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return { exists: true, error: 'not a PNG' };
  return {
    exists: true,
    width: b.readUInt32BE(16), height: b.readUInt32BE(20),
    bytes: b.length,
    sha256: createHash('sha256').update(b).digest('hex'),
  };
}

export const mapPaths = (manifest, key) => {
  const a = manifest.assets[key];
  const dir = join(ROOT, a.dir);
  return {
    baseao: join(dir, `${a.slug}-baseao.png`),
    nre: join(dir, `${a.slug}-nre.png`),
    masks: join(dir, `${a.slug}-masks.png`),
  };
};

export const lodPath = (manifest, key, lodName) => {
  const a = manifest.assets[key];
  const dir = join(ROOT, a.dir);
  if (lodName === 'showcase') return join(dir, `${a.slug}-baked.glb`);
  return join(dir, `${a.slug}-${lodName}.glb`);
};

/* --------------------------------------------------------------- toolchain */
export function findBlender(manifest) {
  const want = manifest.toolchain?.blender;
  const candidates = [process.env[want?.envOverride || 'BLENDER_EXE'], want?.windowsPath].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

/* ------------------------------------------------------------------ stages */
/* `next` exists so an agent never has to infer pipeline order. Each stage is
   judged only by artifacts on disk, so it is correct even for an agent that has
   no memory of previous sessions. */
export function stageStatus(manifest, key) {
  const a = manifest.assets[key];
  const dir = join(ROOT, a.dir);
  const src = join(dir, a.sourceBlend || '');
  const maps = mapPaths(manifest, key);
  const lods = (a.lods || []).map(l => ({ ...l, path: lodPath(manifest, key, l.name), ...glbInfo(lodPath(manifest, key, l.name)) }));
  const built = !!a.sourceBlend && existsSync(src);
  const baked = lods.some(l => l.exists) && Object.values(maps).every(p => existsSync(p));
  const imported = !!a.importTarget && existsSync(join(ROOT, a.importTarget));
  const done = { build: built, bake: baked, import: imported };
  const next = !built ? 'build' : !baked ? 'bake' : !imported ? 'import' : 'verify';
  return { asset: key, dir: a.dir, class: a.class, live: !!a.live, status: a.status, done, next, lods, maps };
}
