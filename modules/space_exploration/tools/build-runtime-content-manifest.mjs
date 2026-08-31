import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReachability,
  expectedAllowlistPaths
} from './readiness/readiness-core.mjs';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPath = join(moduleRoot, 'dist', 'exploration-content-manifest-v1.json');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function runtimePath(absolute) {
  return relative(moduleRoot, absolute).split(sep).join('/');
}

const candidates = await walk(moduleRoot);
const moduleRecords = candidates.map(absolute => ({ path: runtimePath(absolute) }));
const reachability = await buildReachability(moduleRoot, moduleRecords);
const allow = new Set(expectedAllowlistPaths(moduleRecords, {
  reachableCode: reachability.reachableCode
}));

const files = [];
for (const path of [...allow].sort()) {
  const absolute = join(moduleRoot, ...path.split('/'));
  const metadata = await stat(absolute);
  const bytes = await readFile(absolute);
  files.push({
    path,
    bytes: metadata.size,
    hash: `sha256-${createHash('sha256').update(bytes).digest('hex')}`,
    kind: path.startsWith('assets/') ? 'asset' : path.startsWith('lib/') ? 'runtime-library' : 'runtime-code'
  });
}

const manifest = {
  schemaVersion: 1,
  kind: 'ExplorationContentManifestV1',
  contentVersion: 'galactic-exploration-dev-1',
  compatibleGameRange: 'developer-builds-only',
  optional: true,
  resumable: true,
  installed: false,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  sourceArchivePreserved: true,
  allowlistRules: [
    'entrypoint-reachable runtime code excluding src/combat',
    'three referenced GLB runtime models',
    'six aligned runtime PBR maps per authored planet',
    'approved personnel portraits',
    'Three.js runtime libraries'
  ],
  excludedWithoutDeletion: [
    'assets/source/**', 'assets/**/*.blend', 'assets/**/*.blend1', 'assets/**/source/**',
    'tmp/**', 'tools/**', 'tests/**', 'docs/**', '_archive/**', '.toolchains/**',
    'generated previews, logs, caches, backups, and unused space-combat code'
  ],
  files
};
const unsigned = JSON.stringify(manifest);
manifest.hash = `sha256-${createHash('sha256').update(unsigned).digest('hex')}`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, fileCount: files.length, totalBytes: manifest.totalBytes, totalMiB: Number((manifest.totalBytes / 1048576).toFixed(2)), sourceArchivePreserved: true }, null, 2));
