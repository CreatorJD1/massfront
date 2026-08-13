#!/usr/bin/env node
/* ============================================================================
   ART V2 TOOLKIT — publish stage
   ----------------------------------------------------------------------------
       node tools/artv2.mjs publish <asset|--all> [--json] [--force]

   THE STAGE THAT WAS MISSING, AND WHY NOTHING THE TOOLKIT MADE EVER SHIPPED.

   bake writes its maps to source-media/material-v2/<slug>/. The runtime loads
   from 'assets/textures/materials/' (materials-v2.js:784, materials-world-v2.js
   :203). Nothing in the toolkit bridged the two, and the stage had no name, so
   it was never noticed as absent — every other gap announced itself with an
   "not implemented yet". The result: a bake could succeed, verify could pass,
   and the game would still be showing the previous artist's file. The shipped
   tank maps were four days older than, and byte-different from, what bake had
   produced.

   It also repairs verify's hash gate as a side effect. That gate indexes
   assets/textures/materials/ while mapPaths() resolves under source-media/, so
   the two sets were disjoint and "unique to this asset" was true by
   construction — the check could not fail. Once maps are published the sets
   overlap and the check becomes real; an asset's own published copy is excluded
   by path, not by hash, so it is not mistaken for a template twin.

   REFUSES TO CLOBBER what it did not publish. assets/textures/materials/ holds
   live art this toolkit never wrote (mf-world-structures-v2-*.png is read by
   five civic meshes every frame). A slug collision must not silently destroy
   it, so an existing file with no matching provenance record stops the run.
   ============================================================================ */
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  ROOT, EXIT, loadManifest, selectAssets, envelope, emit,
  mapPaths, assetDir, sha256, pngInfo, writeProvenance, readProvenance,
} from './artv2/mf2_manifest.mjs';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const force = argv.includes('--force');
const positional = argv.filter(a => !a.startsWith('--'));
const selector = positional.find(a => a !== 'publish') || null;

const DEST_DIR = join(ROOT, 'assets', 'textures', 'materials');

let manifest;
try { manifest = loadManifest(); }
catch (e) { emit(envelope({ ok: false, command: 'publish', errors: [e.message] }), asJson); process.exit(EXIT.ENV); }

let keys;
try { keys = selectAssets(manifest, selector); }
catch (e) { emit(envelope({ ok: false, command: 'publish', errors: [e.message] }), asJson); process.exit(EXIT.USAGE); }

mkdirSync(DEST_DIR, { recursive: true });

const errors = [], warnings = [], rows = [];

for (const key of keys) {
  const maps = mapPaths(manifest, key);
  const dir = assetDir(manifest, key);
  const prev = readProvenance(dir, 'publish') || {};
  const known = prev.files || {};          // basename -> sha at last publish
  const wrote = {};
  const files = [];

  for (const [role, src] of Object.entries(maps)) {
    if (!existsSync(src)) {
      errors.push(`${key}: ${role} map missing — run: node tools/artv2.mjs bake ${key}`);
      continue;
    }
    const name = basename(src);
    const dest = join(DEST_DIR, name);
    const srcSha = sha256(src);

    if (existsSync(dest)) {
      const destSha = sha256(dest);
      if (destSha === srcSha) {
        wrote[name] = srcSha;
        files.push({ role, name, action: 'unchanged', sha: srcSha.slice(0, 12) });
        continue;
      }
      /* Present, different, and not ours. Publishing would destroy art the
         running game reads. The operator has to say so explicitly. */
      if (known[name] !== destSha && !force) {
        errors.push(`${key}: ${name} exists in assets/textures/materials/ and was not published by artv2 `
          + `(dest ${destSha.slice(0, 12)} vs source ${srcSha.slice(0, 12)}) — pass --force to overwrite`);
        files.push({ role, name, action: 'refused', sha: destSha.slice(0, 12) });
        continue;
      }
    }
    copyFileSync(src, dest);
    wrote[name] = srcSha;
    const info = pngInfo(dest);
    files.push({
      role, name, action: 'copied', sha: srcSha.slice(0, 12),
      px: info ? `${info.width}x${info.height}` : '?',
      kb: Math.round(statSync(dest).size / 1024),
    });
  }

  const copied = files.filter(f => f.action === 'copied').length;
  const refused = files.filter(f => f.action === 'refused').length;
  if (copied) writeProvenance(dir, 'publish', { files: { ...known, ...wrote }, dest: 'assets/textures/materials' });
  rows.push({ asset: key, copied, unchanged: files.filter(f => f.action === 'unchanged').length, refused, files });
}

const ok = errors.length === 0;
emit(envelope({
  ok, command: 'publish', data: { dest: 'assets/textures/materials', assets: rows }, errors, warnings,
  next: ok ? keys.map(k => `node tools/artv2.mjs verify ${k}`) : [],
}), asJson);
process.exit(ok ? EXIT.OK : EXIT.GATE);
