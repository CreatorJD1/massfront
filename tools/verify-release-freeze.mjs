#!/usr/bin/env node
/* Read-only pre-release release-freeze verifier.
   Scope:
   - boot.js MANIFEST and assets/data/manifest.json source parity
   - required runtime assets exist
   - no assets/source leakage in www/ if it exists
   - dynamic world-kit V4 runtime path coverage where discoverable
*/

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
let hadFailure = false;
let hadNotPacked = false;

const normalizeRef = (raw = '') => {
  let rel = String(raw).trim();
  if (!rel) return '';
  if (/^(?:https?:|data:|blob:|#|\/\/)/i.test(rel)) return '';
  rel = rel.replace(/^\.\/+/, '').replace(/^\/+/, '');
  rel = rel.replace(/^[^:]+:[\\/].*$/i, ''); // skip protocol-like leftovers
  rel = rel.split('?')[0].split('#')[0].replace(/\\/g, '/');
  return rel;
};

const toRepoRel = (raw, baseDir = '') => {
  const rel = normalizeRef(raw);
  if (!rel) return '';
  const base = baseDir ? resolve(ROOT, baseDir) : ROOT;
  const abs = resolve(base, rel);
  if (!abs.startsWith(ROOT + sep)) return '';
  return relative(ROOT, abs).replace(/\\/g, '/');
};

const add = (status, name, detail = '') => {
  checks.push({ status, name, detail });
  if (status === 'FAIL') hadFailure = true;
  if (status === 'NOT-YET-PACKED') hadNotPacked = true;
  console.log(`${status} ${name}${detail ? ` [${detail}]` : ''}`);
};

const readJson = (rel) => {
  const full = join(ROOT, rel);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (e) {
    return { __parseError: String(e.message || e) };
  }
};

const readText = (rel) => {
  const full = join(ROOT, rel);
  if (!existsSync(full)) return null;
  try {
    return readFileSync(full, 'utf8');
  } catch {
    return null;
  }
};

const addFiles = (acc, items, baseDir = '') => {
  if (!Array.isArray(items)) return;
  for (const raw of items) {
    const rel = toRepoRel(raw, baseDir);
    if (rel) acc.add(rel);
  }
};

const walkStrings = (value, cb) => {
  if (!value) return;
  if (typeof value === 'string') return cb(value);
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, cb);
  } else if (typeof value === 'object') {
    for (const next of Object.values(value)) walkStrings(next, cb);
  }
};

const extractWorldKitPaths = (text) => {
  const found = new Set();
  if (!text) return found;

  // Direct literals, if present.
  for (const m of text.matchAll(/['"]([^'"]*assets\/textures\/materials\/mf-worldkit-v4[^'"]*)['"]/g)) {
    const rel = toRepoRel(m[1]);
    if (rel) found.add(rel);
  }

  // Compact concat forms: const base='assets/.../mf-worldkit-v4'; const urls=[base+'-baseao.png', ...]
  const baseAssignments = new Map();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]/g)) {
    if (m[2].includes('mf-worldkit-v4')) baseAssignments.set(m[1], m[2]);
  }
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*\+\s*['"]([^'"]+)['"]/g)) {
    const base = baseAssignments.get(m[1]);
    const suffix = m[2];
    if (!base || !suffix) continue;
    if (!suffix.startsWith('-')) continue;
    if (!/(?:png|webp|jpg|jpeg)$/.test(suffix)) continue;
    const rel = toRepoRel(base + suffix);
    if (rel && rel.includes('mf-worldkit-v4')) found.add(rel);
  }

  for (const p of [...found]) {
    if (!p.startsWith('assets/textures/materials/mf-worldkit-v4-')) found.delete(p);
  }
  return found;
};

// 1) boot.js MANIFEST vs assets/data/manifest.json parity
(() => {
  const bootText = readText('boot.js');
  const manifestObj = readJson('assets/data/manifest.json');

  if (!bootText) return add('FAIL', 'read boot.js', 'boot.js missing or unreadable');
  if (!manifestObj || manifestObj.__parseError) {
    return add('FAIL', 'read assets/data/manifest.json', manifestObj?.__parseError || 'missing or unreadable');
  }
  if (!Array.isArray(manifestObj.order)) {
    return add('FAIL', 'assets/data/manifest.json format', 'assets/data/manifest.json.order missing/invalid');
  }

  const bootMatch = bootText.match(/MANIFEST\s*=\s*\[([\s\S]*?)\]/);
  if (!bootMatch) return add('FAIL', 'boot.js MANIFEST parse', 'could not locate MANIFEST array');

  const bootList = [...bootMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => toRepoRel(m[1]));
  const manifestList = manifestObj.order.map((value) => toRepoRel(value)).filter(Boolean);

  const dupBoot = bootList.filter((v, i, a) => a.indexOf(v) !== i);
  const dupManifest = manifestList.filter((v, i, a) => a.indexOf(v) !== i);
  if (dupBoot.length || dupManifest.length) {
    add('FAIL', 'source parity', `manifest duplicates found (boot:${new Set(dupBoot).size} / manifest:${new Set(dupManifest).size})`);
    return;
  }
  if (bootList.length !== manifestList.length) {
    add('FAIL', 'boot.js MANIFEST length', `boot=${bootList.length}, manifest=${manifestList.length}`);
    return;
  }
  for (let i = 0; i < bootList.length; i += 1) {
    if (bootList[i] !== manifestList[i]) {
      add('FAIL', 'boot.js MANIFEST order', `index ${i}: boot="${bootList[i]}" vs manifest="${manifestList[i]}"`);
      return;
    }
  }
  add('PASS', 'boot.js and assets/data/manifest.json source parity');
})();

// 2) required runtime assets exist
(() => {
  const required = new Set();
  const missing = [];

  const manifestObj = readJson('assets/data/manifest.json');
  if (!manifestObj || !Array.isArray(manifestObj.order)) {
    return add('FAIL', 'runtime required assets', 'assets/data/manifest.json missing or invalid');
  }
  addFiles(required, manifestObj.order);
  addFiles(required, ['boot.js', 'assets/modifiers/modifier-art-atlas-v1.png']);

  const indexText = readText('index.html');
  if (!indexText) {
    return add('FAIL', 'runtime required assets', 'index.html missing or unreadable');
  }
  for (const m of indexText.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const rel = normalizeRef(m[1]);
    if (rel) addFiles(required, [rel]);
  }

  const wm = readJson('assets/app.webmanifest');
  if (!wm || wm.__parseError) {
    return add('FAIL', 'runtime required assets', 'assets/app.webmanifest missing or invalid');
  }
  if (Array.isArray(wm.icons)) {
    for (const ic of wm.icons) {
      if (typeof ic?.src === 'string') addFiles(required, [ic.src], 'assets');
    }
  }

  const sfx = readJson('assets/audio/sfx.json');
  if (!sfx || sfx.__parseError) {
    return add('FAIL', 'runtime required assets', 'assets/audio/sfx.json missing or invalid');
  }
  for (const spec of Object.values(sfx.slots || {})) {
    const files = Array.isArray(spec?.files) ? spec.files : [];
    for (const stem of files) {
      if (typeof stem === 'string') addFiles(required, [`assets/audio/${stem}.ogg`, `assets/audio/${stem}.m4a`]);
    }
  }

  const music = readJson('assets/audio/music.json');
  if (!music || music.__parseError) {
    return add('FAIL', 'runtime required assets', 'assets/audio/music.json missing or invalid');
  }
  const seenMusic = new Set();
  for (const playlist of Object.values(music.playlists || {})) {
    if (!Array.isArray(playlist)) continue;
    for (const entry of playlist) {
      if (!entry || entry.bundled === false) continue;
      const stem = normalizeRef(entry.file || '').split('/').pop();
      if (!stem || seenMusic.has(stem)) continue;
      seenMusic.add(stem);
      addFiles(required, [`assets/audio/music/${stem}.m4a`]);
    }
  }

  const voice = readJson('assets/audio/voice.json');
  if (!voice || voice.__parseError) {
    return add('FAIL', 'runtime required assets', 'assets/audio/voice.json missing or invalid');
  }
  const stems = new Set();
  walkStrings(voice.lines, (v) => {
    if (typeof v === 'string' && v.trim()) stems.add(v.trim());
  });
  for (const stem of stems) {
    addFiles(required, [`assets/audio/voice/${stem}.ogg`, `assets/audio/voice/${stem}.m4a`]);
  }

  // runtime-critical dynamic references (discoverable)
  addFiles(required, [...extractWorldKitPaths(readText('src/engine/mesh.js'))]);

  for (const rel of [...required].sort()) {
    if (!existsSync(join(ROOT, rel))) missing.push(rel);
  }
  if (missing.length) add('FAIL', 'runtime required assets exist', `${missing.length} missing (for example: ${missing.slice(0, 6).join(', ')})`);
  else add('PASS', 'runtime required assets exist');
})();

// 3) no authoring-source leakage in www if already staged
(() => {
  const www = join(ROOT, 'www');
  if (!existsSync(www)) return add('NOT-YET-PACKED', 'www staging', 'directory not present');

  const forbidden = [
    'assets/source',
    'assets/packs',
    'assets/brand',
    'assets/factions/cinematic',
    'experimental',
    'node_modules',
    '.tmp',
  ];
  const leaks = [];
  for (const rel of forbidden) if (existsSync(join(www, rel))) leaks.push(`${rel}/`);
  const modifierRoot = join(www, 'assets/modifiers');
  const modifierFiles = [];
  const walk = (dir, prefix = '') => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else modifierFiles.push(rel);
    }
  };
  walk(modifierRoot);
  const expectedModifier = 'modifier-art-atlas-v1.png';
  if (modifierFiles.length !== 1 || modifierFiles[0] !== expectedModifier) {
    leaks.push(`assets/modifiers/ must contain exactly ${expectedModifier}; found ${modifierFiles.join(', ') || 'nothing'}`);
  } else {
    const source = readFileSync(join(ROOT, 'assets/modifiers', expectedModifier));
    const packed = readFileSync(join(modifierRoot, expectedModifier));
    if (!source.equals(packed)) leaks.push(`assets/modifiers/${expectedModifier} differs from source`);
  }
  if (leaks.length) add('FAIL', 'package asset containment', leaks.join('; '));
  else add('PASS', 'package asset containment and modifier-atlas parity');
})();

// 4) dynamic world-kit V4 runtime path coverage
(() => {
  const meshText = readText('src/engine/mesh.js') || '';
  const runtimeText = readText('tools/bundle-update.mjs') || '';
  if (!meshText || !runtimeText) {
    return add('FAIL', 'world-kit V4 runtime path coverage', 'source files missing for dynamic coverage check');
  }

  const discoverable = extractWorldKitPaths(meshText);
  if (!discoverable.size) {
    return add('NOT-YET-PACKED', 'world-kit V4 runtime path coverage', 'no discoverable references in mesh.js');
  }

  const otaCovered = extractWorldKitPaths(runtimeText);
  const missing = [...discoverable].filter((p) => !otaCovered.has(p)).sort();
  if (missing.length) add('FAIL', 'world-kit V4 runtime path coverage', `OTA runtime paths missing: ${missing.join(', ')}`);
  else add('PASS', 'world-kit V4 runtime path coverage');
})();

console.log(`\nverify-release-freeze: ${checks.filter((c) => c.status === 'PASS').length} PASS, ${checks.filter((c) => c.status === 'FAIL').length} FAIL, ${checks.filter((c) => c.status === 'NOT-YET-PACKED').length} NOT-YET-PACKED`);
if (hadFailure) process.exit(1);
process.exit(0);
