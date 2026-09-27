import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distRoot = join(moduleRoot, 'dist');
const outputPath = join(moduleRoot, 'dist', 'stormpeak-runtime-manifest-v1.json');
const testerHtml = join(distRoot, 'index.tester.html');
const playerHtml = join(distRoot, 'index.html');
try {
  await stat(testerHtml);
  await writeFile(playerHtml, await readFile(testerHtml));
} catch {
  /* already promoted, or a later check will fail if index.html is missing */
}

// Upstream ships marketing/install art in public/ for its own landing page. The
// tester never renders it, and the five-channel budget counts every byte we
// stage into www/ and the APK, so prune it instead of hashing it into the
// manifest. Pruning here (not in public/) keeps the vendored source verbatim.
for (const dead of ['index.tester.html', 'og.jpg', 'x-banner.jpg', '__grok'])
  await rm(join(distRoot, dead), { recursive: true, force: true });

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
  return relative(distRoot, absolute).split(sep).join('/');
}

const candidates = (await walk(distRoot)).filter(absolute => {
  const rel = runtimePath(absolute);
  return rel !== 'stormpeak-runtime-manifest-v1.json' && rel !== 'index.tester.html';
});

const files = [];
for (const absolute of candidates.sort((a, b) => runtimePath(a).localeCompare(runtimePath(b)))) {
  const path = runtimePath(absolute);
  if (!path || path.startsWith('/') || path.includes('..')) throw new Error('Unsafe stormpeak runtime path: ' + path);
  const metadata = await stat(absolute);
  const bytes = await readFile(absolute);
  files.push({
    path,
    bytes: metadata.size,
    hash: `sha256-${createHash('sha256').update(bytes).digest('hex')}`,
    kind: path.startsWith('assets/') ? 'runtime-asset' : 'runtime-code'
  });
}

if (!files.some(file => file.path === 'index.html')) {
  throw new Error('Stormpeak runtime is missing dist/index.html. Run npm run build first.');
}

const manifest = {
  schemaVersion: 1,
  kind: 'StormpeakRuntimeManifestV1',
  contentVersion: 'stormpeak-ocean-tester-c97b76a',
  compatibleGameRange: '1.33.90+',
  delivery: 'base',
  optional: false,
  sourceCommit: 'c97b76a952c6f2be5cc1dc03d30cd60f3754848c',
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files
};
const unsigned = JSON.stringify(manifest);
manifest.hash = `sha256-${createHash('sha256').update(unsigned).digest('hex')}`;
await mkdir(distRoot, { recursive: true });
await writeFile(outputPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Stormpeak runtime manifest: ' + files.length + ' files, ' + (manifest.totalBytes / 1048576).toFixed(2) + ' MiB');
